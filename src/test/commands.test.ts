// Comprehensive tests for src/cat/commands.ts.
// Uses a mock transport that records sent frames and returns canned replies,
// bypassing the real serial port machinery entirely.

import { describe, expect, it, beforeEach } from "vitest";
import {
  readId,
  readFirmwareVersion,
  readVfoMain,
  readVfoSub,
  setVfoMain,
  setVfoSub,
  readSMeter,
  readMode,
  setMode,
  readMemory,
  writeMemory,
  readMemoryTag,
  writeMemoryTag,
  readCtcssTone,
  setCtcssTone,
  readDcsCode,
  setDcsCode,
  readMenu,
  writeMenu,
  readAutoInfo,
  setAutoInfo,
  readInfo,
  readSubInfo,
  readSelectedMemoryChannel,
  selectMemoryChannel,
  readSplit,
  setSplit,
  readLock,
  setLock,
  readKeySpeed,
  setKeySpeed,
  readKeyPitch,
  setKeyPitch,
  readKeyer,
  setKeyer,
  writeKeyerMemory,
  readKeyerMemory,
  readBreakIn,
  setBreakIn,
  readAfGain,
  setAfGain,
  readSquelch,
  setSquelch,
  setSqlType,
  readSqlType,
  setRepeaterShift,
  readRepeaterShift,
  setPreamp,
  readPreamp,
  setAttenuator,
  readAttenuator,
  setNarrow,
  readNarrow,
  writeSplitMemory,
  readSplitMemory,
  setDate,
  setTime,
  powerOff,
  setTx,
  setMox,
  copyMainToSub,
  copySubToMain,
  swapVfo,
  copyMainToMemory,
  copySubToMemory,
  sideChar,
  sideFrom,
} from "../cat/commands";
import type { CatTransport } from "../cat/transport";
import type { ChannelId, MemoryFrame } from "../cat/codec";

// ---------------------------------------------------------------------------
// Mock transport
// ---------------------------------------------------------------------------

/** Records every frame body passed to send/query. Returns canned replies. */
class MockTransport {
  sent: string[] = [];
  replies: Map<string, string> = new Map();

  async send(body: string): Promise<void> {
    this.sent.push(body);
  }

  async query(body: string): Promise<string> {
    this.sent.push(body);
    // Match on the command prefix (first 2 chars) to find the canned reply.
    // If an exact match on the full body exists, prefer that.
    return this.replies.get(body) ?? this.replies.get(body.slice(0, 2)) ?? "";
  }

  /** Shorthand: set canned reply keyed by 2-letter command prefix. */
  replyFor(prefix: string, reply: string): void {
    this.replies.set(prefix, reply);
  }

  /** Reset recorded frames. */
  reset(): void {
    this.sent = [];
    this.replies.clear();
  }

  get lastSent(): string {
    return this.sent[this.sent.length - 1];
  }
}

// Cast helper — MockTransport is structurally compatible with CatTransport
// for the two methods (send/query) that commands.ts uses.
function mock(): MockTransport {
  return new MockTransport();
}
function asTransport(m: MockTransport): CatTransport {
  return m as unknown as CatTransport;
}

// ---------------------------------------------------------------------------
// Helper: a valid 27-char memory payload for readMemory/readInfo tests.
// Channel 00001, 14.250 MHz, +0000 clar, rx off, tx off, USB, Memory, OFF, 00, simplex
// ---------------------------------------------------------------------------
const SAMPLE_PAYLOAD_27 = "00001014250000+000000210000";
// Verify length at module load time:
if (SAMPLE_PAYLOAD_27.length !== 27) {
  throw new Error(`SAMPLE_PAYLOAD_27 is ${SAMPLE_PAYLOAD_27.length} chars, expected 27`);
}

// ===========================================================================
// 1. Read commands
// ===========================================================================

describe("read commands", () => {
  let m: MockTransport;
  let t: CatTransport;

  beforeEach(() => {
    m = mock();
    t = asTransport(m);
  });

  // ---- readId ----
  describe("readId", () => {
    it("sends 'ID' and parses 4-char model id from reply", async () => {
      m.replyFor("ID", "ID0840");
      const id = await readId(t);
      expect(m.sent).toContain("ID");
      expect(id).toBe("0840");
    });

    it("throws on wrong-length reply", async () => {
      m.replyFor("ID", "ID08");
      await expect(readId(t)).rejects.toThrow(/wrong length/i);
    });
  });

  // ---- readFirmwareVersion ----
  describe("readFirmwareVersion", () => {
    it("sends 'VE0' by default and parses version string", async () => {
      m.replyFor("VE", "VE001-08");
      const ver = await readFirmwareVersion(t);
      expect(m.sent).toContain("VE0");
      expect(ver).toBe("01-08");
    });

    it("sends 'VE1' for slot 1", async () => {
      // Use exact-body key so we can distinguish slots
      m.replies.set("VE1", "VE102-03");
      const ver = await readFirmwareVersion(t, 1);
      expect(m.sent).toContain("VE1");
      expect(ver).toBe("02-03");
    });
  });

  // ---- readVfoMain / readVfoSub ----
  describe("readVfoMain", () => {
    it("sends 'FA' and parses 9-digit frequency", async () => {
      m.replyFor("FA", "FA014250000");
      const hz = await readVfoMain(t);
      expect(m.sent).toContain("FA");
      expect(hz).toBe(14_250_000);
    });
  });

  describe("readVfoSub", () => {
    it("sends 'FB' and parses 9-digit frequency", async () => {
      m.replyFor("FB", "FB007100000");
      const hz = await readVfoSub(t);
      expect(m.sent).toContain("FB");
      expect(hz).toBe(7_100_000);
    });
  });

  // ---- readSMeter ----
  describe("readSMeter", () => {
    it("sends 'SM0' for main and parses 4-digit meter value", async () => {
      // SM + side(1) + 4 digits
      m.replies.set("SM0", "SM00128");
      const val = await readSMeter(t, "main");
      expect(m.sent).toContain("SM0");
      expect(val).toBe(128);
    });

    it("sends 'SM1' for sub", async () => {
      m.replies.set("SM1", "SM10000");
      const val = await readSMeter(t, "sub");
      expect(m.sent).toContain("SM1");
      expect(val).toBe(0);
    });
  });

  // ---- readMemory ----
  describe("readMemory", () => {
    it("sends 'MR' + channel id and parses MemoryFrame", async () => {
      const ch: ChannelId = { kind: "memory", n: 1 };
      m.replyFor("MR", "MR" + SAMPLE_PAYLOAD_27);
      const frame = await readMemory(t, ch);
      expect(m.sent[0]).toBe("MR00001"); // MR + 5-char channel
      expect(frame.freqHz).toBe(14_250_000);
      expect(frame.mode).toBe("USB");
      expect(frame.channel).toEqual({ kind: "memory", n: 1 });
    });
  });

  // ---- readMemoryTag ----
  describe("readMemoryTag", () => {
    it("sends 'MT' + channel and parses/trims 12-char tag", async () => {
      const ch: ChannelId = { kind: "memory", n: 5 };
      // MT + 5-char channel + 12-char tag (space-padded)
      m.replyFor("MT", "MT00005REPEATER    ");
      const tag = await readMemoryTag(t, ch);
      expect(m.sent[0]).toBe("MT00005");
      expect(tag).toBe("REPEATER");
    });
  });

  // ---- readCtcssTone / readDcsCode ----
  describe("readCtcssTone", () => {
    it("sends 'CN00' for main CTCSS and parses 3-digit index", async () => {
      // CN + side(1) + P2(1) + P3(3) → answer is CN00012
      m.replies.set("CN00", "CN00012");
      const idx = await readCtcssTone(t, "main");
      expect(m.sent[0]).toBe("CN00");
      expect(idx).toBe(12);
    });
  });

  describe("readDcsCode", () => {
    it("sends 'CN01' for main DCS and parses 3-digit index", async () => {
      m.replies.set("CN01", "CN01050");
      const idx = await readDcsCode(t, "main");
      expect(m.sent[0]).toBe("CN01");
      expect(idx).toBe(50);
    });

    it("sends 'CN11' for sub DCS", async () => {
      m.replies.set("CN11", "CN11003");
      const idx = await readDcsCode(t, "sub");
      expect(m.sent[0]).toBe("CN11");
      expect(idx).toBe(3);
    });
  });

  // ---- readMenu ----
  describe("readMenu", () => {
    it("sends EX + p1p2p3 and parses P4 from reply", async () => {
      // readMenu calls query with "EX010203"; EX commands match on 8-char prefix.
      // Reply: EX + P1(2) + P2(2) + P3(2) + P4
      m.replies.set("EX010203", "EX01020342");
      const p4 = await readMenu(t, 1, 2, 3);
      expect(m.sent[0]).toBe("EX010203");
      expect(p4).toBe("42");
    });
  });

  // ---- readAutoInfo ----
  describe("readAutoInfo", () => {
    it("parses AI on/off", async () => {
      m.replyFor("AI", "AI1");
      expect(await readAutoInfo(t)).toBe(true);
    });
  });

  // ---- readMode ----
  describe("readMode", () => {
    it("sends 'MD0' for main and parses mode char", async () => {
      // MD + side(1) + mode(1) → MD02 = USB
      m.replies.set("MD0", "MD02");
      const mode = await readMode(t, "main");
      expect(m.sent[0]).toBe("MD0");
      expect(mode).toBe("USB");
    });
  });

  // ---- readInfo / readSubInfo ----
  describe("readInfo", () => {
    it("sends 'IF' and decodes memory payload", async () => {
      m.replyFor("IF", "IF" + SAMPLE_PAYLOAD_27);
      const frame = await readInfo(t);
      expect(m.sent[0]).toBe("IF");
      expect(frame.freqHz).toBe(14_250_000);
    });
  });

  describe("readSubInfo", () => {
    it("sends 'OI' and decodes memory payload", async () => {
      m.replyFor("OI", "OI" + SAMPLE_PAYLOAD_27);
      const frame = await readSubInfo(t);
      expect(m.sent[0]).toBe("OI");
      expect(frame.freqHz).toBe(14_250_000);
    });
  });

  // ---- readSelectedMemoryChannel ----
  describe("readSelectedMemoryChannel", () => {
    it("sends 'MC0' for main and parses channel id", async () => {
      m.replies.set("MC0", "MC000042");
      const ch = await readSelectedMemoryChannel(t, "main");
      expect(m.sent[0]).toBe("MC0");
      expect(ch).toEqual({ kind: "memory", n: 42 });
    });
  });

  // ---- readSplit / readLock ----
  describe("readSplit", () => {
    it("parses split on", async () => {
      m.replyFor("ST", "ST1");
      expect(await readSplit(t)).toBe(true);
    });
    it("parses split off", async () => {
      m.replyFor("ST", "ST0");
      expect(await readSplit(t)).toBe(false);
    });
  });

  describe("readLock", () => {
    it("parses lock on", async () => {
      m.replyFor("LK", "LK1");
      expect(await readLock(t)).toBe(true);
    });
  });

  // ---- readKeySpeed / readKeyPitch / readKeyer ----
  describe("readKeySpeed", () => {
    it("parses 3-digit WPM", async () => {
      m.replyFor("KS", "KS020");
      expect(await readKeySpeed(t)).toBe(20);
    });
  });

  describe("readKeyPitch", () => {
    it("parses 2-digit index", async () => {
      m.replyFor("KP", "KP37");
      expect(await readKeyPitch(t)).toBe(37);
    });
  });

  describe("readKeyer", () => {
    it("parses on/off", async () => {
      m.replyFor("KR", "KR1");
      expect(await readKeyer(t)).toBe(true);
    });
  });

  // ---- readKeyerMemory ----
  describe("readKeyerMemory", () => {
    it("parses text terminated by }", async () => {
      m.replies.set("KM1", "KM1CQ CQ DE TA1SMO}");
      const text = await readKeyerMemory(t, 1);
      expect(text).toBe("CQ CQ DE TA1SMO");
    });
  });

  // ---- readBreakIn ----
  describe("readBreakIn", () => {
    it("parses on/off", async () => {
      m.replyFor("BI", "BI0");
      expect(await readBreakIn(t)).toBe(false);
    });
  });

  // ---- readAfGain / readSquelch ----
  describe("readAfGain", () => {
    it("parses 3-digit level for main", async () => {
      m.replies.set("AG0", "AG0128");
      expect(await readAfGain(t, "main")).toBe(128);
    });
  });

  describe("readSquelch", () => {
    it("parses 3-digit level for sub", async () => {
      m.replies.set("SQ1", "SQ1064");
      expect(await readSquelch(t, "sub")).toBe(64);
    });
  });

  // ---- readSqlType ----
  describe("readSqlType", () => {
    it("parses DCS type", async () => {
      m.replies.set("CT0", "CT03");
      expect(await readSqlType(t, "main")).toBe("DCS");
    });
    it("parses OFF type", async () => {
      m.replies.set("CT1", "CT10");
      expect(await readSqlType(t, "sub")).toBe("OFF");
    });
  });
});

// ===========================================================================
// 2. Write commands — verify exact wire frame body
// ===========================================================================

describe("write commands", () => {
  let m: MockTransport;
  let t: CatTransport;

  beforeEach(() => {
    m = mock();
    t = asTransport(m);
  });

  // ---- setVfoMain ----
  it("setVfoMain(14250000) sends 'FA014250000'", async () => {
    await setVfoMain(t, 14_250_000);
    expect(m.lastSent).toBe("FA014250000");
  });

  // ---- setVfoSub ----
  it("setVfoSub(7100000) sends 'FB007100000'", async () => {
    await setVfoSub(t, 7_100_000);
    expect(m.lastSent).toBe("FB007100000");
  });

  // ---- setMode ----
  it("setMode(main, USB) sends 'MD02'", async () => {
    await setMode(t, "main", "USB");
    expect(m.lastSent).toBe("MD02");
  });

  it("setMode(sub, FM) sends 'MD14'", async () => {
    await setMode(t, "sub", "FM");
    expect(m.lastSent).toBe("MD14");
  });

  it("setMode(main, CW-U) sends 'MD03'", async () => {
    await setMode(t, "main", "CW-U");
    expect(m.lastSent).toBe("MD03");
  });

  // ---- writeMemory ----
  it("writeMemory sends 'MW' + encoded 27-char payload", async () => {
    const frame: MemoryFrame = {
      channel: { kind: "memory", n: 1 },
      freqHz: 14_250_000,
      clarifierHz: 0,
      rxClarOn: false,
      txClarOn: false,
      mode: "USB",
      vfoMem: "Memory",
      ctcssState: "OFF",
      shift: "simplex",
    };
    await writeMemory(t, frame);
    expect(m.lastSent).toBe("MW" + SAMPLE_PAYLOAD_27);
    // Verify total body length: "MW" (2) + 27-char payload = 29
    expect(m.lastSent).toHaveLength(29);
  });

  // ---- writeMemoryTag ----
  it("writeMemoryTag sends 'MT' + channel + 12-char padded tag", async () => {
    const ch: ChannelId = { kind: "memory", n: 5 };
    await writeMemoryTag(t, ch, "REPEATER");
    // "MT" + "00005" + "REPEATER    " (padded to 12)
    expect(m.lastSent).toBe("MT00005REPEATER    ");
    expect(m.lastSent).toHaveLength(2 + 5 + 12);
  });

  // ---- setCtcssTone ----
  it("setCtcssTone(main, 12) sends 'CN00012'", async () => {
    await setCtcssTone(t, "main", 12);
    expect(m.lastSent).toBe("CN00012");
  });

  it("setCtcssTone(sub, 0) sends 'CN10000'", async () => {
    await setCtcssTone(t, "sub", 0);
    expect(m.lastSent).toBe("CN10000");
  });

  // ---- setDcsCode ----
  it("setDcsCode(main, 50) sends 'CN01050'", async () => {
    await setDcsCode(t, "main", 50);
    expect(m.lastSent).toBe("CN01050");
  });

  it("setDcsCode(sub, 103) sends 'CN11103'", async () => {
    await setDcsCode(t, "sub", 103);
    expect(m.lastSent).toBe("CN11103");
  });

  // ---- writeMenu ----
  it("writeMenu sends 'EX' + p1p2p3 + p4", async () => {
    await writeMenu(t, 1, 2, 3, "42");
    expect(m.lastSent).toBe("EX01020342");
  });

  it("writeMenu pads single-digit parameters", async () => {
    await writeMenu(t, 0, 0, 0, "1");
    expect(m.lastSent).toBe("EX0000001");
  });

  // ---- setAutoInfo ----
  it("setAutoInfo on sends 'AI1'", async () => {
    await setAutoInfo(t, true);
    expect(m.lastSent).toBe("AI1");
  });

  it("setAutoInfo off sends 'AI0'", async () => {
    await setAutoInfo(t, false);
    expect(m.lastSent).toBe("AI0");
  });

  // ---- selectMemoryChannel ----
  it("selectMemoryChannel(main, ch42) sends 'MC000042'", async () => {
    await selectMemoryChannel(t, "main", { kind: "memory", n: 42 });
    expect(m.lastSent).toBe("MC000042");
  });

  // ---- setSplit ----
  it("setSplit on sends 'ST1'", async () => {
    await setSplit(t, true);
    expect(m.lastSent).toBe("ST1");
  });

  // ---- setLock ----
  it("setLock on sends 'LK1'", async () => {
    await setLock(t, true);
    expect(m.lastSent).toBe("LK1");
  });

  // ---- setKeySpeed ----
  it("setKeySpeed(20) sends 'KS020'", async () => {
    await setKeySpeed(t, 20);
    expect(m.lastSent).toBe("KS020");
  });

  it("setKeySpeed(4) sends 'KS004'", async () => {
    await setKeySpeed(t, 4);
    expect(m.lastSent).toBe("KS004");
  });

  // ---- setKeyPitch ----
  it("setKeyPitch(37) sends 'KP37'", async () => {
    await setKeyPitch(t, 37);
    expect(m.lastSent).toBe("KP37");
  });

  it("setKeyPitch(0) sends 'KP00'", async () => {
    await setKeyPitch(t, 0);
    expect(m.lastSent).toBe("KP00");
  });

  // ---- setKeyer ----
  it("setKeyer on sends 'KR1'", async () => {
    await setKeyer(t, true);
    expect(m.lastSent).toBe("KR1");
  });

  // ---- writeKeyerMemory ----
  it("writeKeyerMemory(1, 'CQ CQ') sends 'KM1CQ CQ}'", async () => {
    await writeKeyerMemory(t, 1, "CQ CQ");
    expect(m.lastSent).toBe("KM1CQ CQ}");
  });

  // ---- setBreakIn ----
  it("setBreakIn on sends 'BI1'", async () => {
    await setBreakIn(t, true);
    expect(m.lastSent).toBe("BI1");
  });

  // ---- setAfGain ----
  it("setAfGain(main, 128) sends 'AG0128'", async () => {
    await setAfGain(t, "main", 128);
    expect(m.lastSent).toBe("AG0128");
  });

  it("setAfGain(sub, 0) sends 'AG1000'", async () => {
    await setAfGain(t, "sub", 0);
    expect(m.lastSent).toBe("AG1000");
  });

  // ---- setSquelch ----
  it("setSquelch(sub, 64) sends 'SQ1064'", async () => {
    await setSquelch(t, "sub", 64);
    expect(m.lastSent).toBe("SQ1064");
  });

  // ---- setSqlType ----
  it("setSqlType(main, DCS) sends 'CT03'", async () => {
    await setSqlType(t, "main", "DCS");
    expect(m.lastSent).toBe("CT03");
  });

  it("setSqlType(sub, CTCSS_ENC) sends 'CT12'", async () => {
    await setSqlType(t, "sub", "CTCSS_ENC");
    expect(m.lastSent).toBe("CT12");
  });

  // ---- setRepeaterShift ----
  it("setRepeaterShift(main, plus) sends 'OS01'", async () => {
    await setRepeaterShift(t, "main", "plus");
    expect(m.lastSent).toBe("OS01");
  });

  it("setRepeaterShift(sub, minus) sends 'OS12'", async () => {
    await setRepeaterShift(t, "sub", "minus");
    expect(m.lastSent).toBe("OS12");
  });

  // ---- setPreamp ----
  it("setPreamp(0, 1) sends 'PA01'", async () => {
    await setPreamp(t, 0, 1);
    expect(m.lastSent).toBe("PA01");
  });

  // ---- setAttenuator ----
  it("setAttenuator on sends 'RA01'", async () => {
    await setAttenuator(t, true);
    expect(m.lastSent).toBe("RA01");
  });

  it("setAttenuator off sends 'RA00'", async () => {
    await setAttenuator(t, false);
    expect(m.lastSent).toBe("RA00");
  });

  // ---- setNarrow ----
  it("setNarrow(main, true) sends 'NA01'", async () => {
    await setNarrow(t, "main", true);
    expect(m.lastSent).toBe("NA01");
  });

  it("setNarrow(sub, false) sends 'NA10'", async () => {
    await setNarrow(t, "sub", false);
    expect(m.lastSent).toBe("NA10");
  });

  // ---- setDate ----
  it("setDate(2026, 5, 7) sends 'DT020260507'", async () => {
    await setDate(t, 2026, 5, 7);
    expect(m.lastSent).toBe("DT020260507");
  });

  // ---- setTime ----
  it("setTime(14, 30, 0) sends 'DT1143000'", async () => {
    await setTime(t, 14, 30, 0);
    expect(m.lastSent).toBe("DT1143000");
  });

  it("setTime(0, 0, 0) sends 'DT1000000'", async () => {
    await setTime(t, 0, 0, 0);
    expect(m.lastSent).toBe("DT1000000");
  });
});

// ===========================================================================
// 3. Validation — verify rejections
// ===========================================================================

describe("validation", () => {
  let m: MockTransport;
  let t: CatTransport;

  beforeEach(() => {
    m = mock();
    t = asTransport(m);
  });

  // ---- CTCSS tone index ----
  describe("setCtcssTone rejects invalid indices", () => {
    it("rejects NaN", async () => {
      await expect(setCtcssTone(t, "main", NaN)).rejects.toThrow();
    });

    it("rejects non-integer (1.5)", async () => {
      await expect(setCtcssTone(t, "main", 1.5)).rejects.toThrow();
    });

    it("rejects negative", async () => {
      await expect(setCtcssTone(t, "main", -1)).rejects.toThrow();
    });

    it("rejects > 49", async () => {
      await expect(setCtcssTone(t, "main", 50)).rejects.toThrow();
    });
  });

  // ---- DCS code index ----
  describe("setDcsCode rejects invalid indices", () => {
    it("rejects out of range (999)", async () => {
      await expect(setDcsCode(t, "main", 999)).rejects.toThrow();
    });

    it("rejects negative", async () => {
      await expect(setDcsCode(t, "main", -1)).rejects.toThrow();
    });

    it("rejects NaN", async () => {
      await expect(setDcsCode(t, "main", NaN)).rejects.toThrow();
    });

    it("rejects non-integer", async () => {
      await expect(setDcsCode(t, "sub", 50.5)).rejects.toThrow();
    });

    it("rejects > 103", async () => {
      await expect(setDcsCode(t, "main", 104)).rejects.toThrow();
    });
  });

  // ---- setDate ----
  describe("setDate rejects invalid dates", () => {
    it("rejects month 13", async () => {
      await expect(setDate(t, 2026, 13, 1)).rejects.toThrow();
    });

    it("rejects month 0", async () => {
      await expect(setDate(t, 2026, 0, 1)).rejects.toThrow();
    });

    it("rejects day 32", async () => {
      await expect(setDate(t, 2026, 2, 32)).rejects.toThrow();
    });

    it("rejects day 0", async () => {
      await expect(setDate(t, 2026, 1, 0)).rejects.toThrow();
    });

    it("rejects year 1999", async () => {
      await expect(setDate(t, 1999, 1, 1)).rejects.toThrow();
    });

    it("rejects year 2100", async () => {
      await expect(setDate(t, 2100, 1, 1)).rejects.toThrow();
    });
  });

  // ---- setTime ----
  describe("setTime rejects invalid times", () => {
    it("rejects hour 24", async () => {
      await expect(setTime(t, 24, 0, 0)).rejects.toThrow();
    });

    it("rejects minute 60", async () => {
      await expect(setTime(t, 12, 60, 0)).rejects.toThrow();
    });

    it("rejects second 60", async () => {
      await expect(setTime(t, 12, 0, 60)).rejects.toThrow();
    });

    it("rejects negative hour", async () => {
      await expect(setTime(t, -1, 0, 0)).rejects.toThrow();
    });
  });

  // ---- writeKeyerMemory ----
  describe("writeKeyerMemory rejects forbidden chars", () => {
    it("rejects text containing '}'", async () => {
      await expect(writeKeyerMemory(t, 1, "CQ}TEST")).rejects.toThrow(/[}]/);
    });

    it("rejects text containing ';'", async () => {
      await expect(writeKeyerMemory(t, 1, "CQ;TEST")).rejects.toThrow(/[;}]/);
    });

    it("rejects text > 50 chars", async () => {
      await expect(writeKeyerMemory(t, 1, "X".repeat(51))).rejects.toThrow();
    });

    it("rejects channel 0", async () => {
      await expect(writeKeyerMemory(t, 0, "CQ")).rejects.toThrow();
    });

    it("rejects channel 6", async () => {
      await expect(writeKeyerMemory(t, 6, "CQ")).rejects.toThrow();
    });
  });

  // ---- setKeySpeed ----
  describe("setKeySpeed rejects invalid WPM", () => {
    it("rejects < 4", async () => {
      await expect(setKeySpeed(t, 3)).rejects.toThrow();
    });

    it("rejects > 60", async () => {
      await expect(setKeySpeed(t, 61)).rejects.toThrow();
    });

    it("rejects non-integer", async () => {
      await expect(setKeySpeed(t, 10.5)).rejects.toThrow();
    });
  });

  // ---- setKeyPitch ----
  describe("setKeyPitch rejects invalid index", () => {
    it("rejects < 0", async () => {
      await expect(setKeyPitch(t, -1)).rejects.toThrow();
    });

    it("rejects > 75", async () => {
      await expect(setKeyPitch(t, 76)).rejects.toThrow();
    });
  });

  // ---- setAfGain ----
  describe("setAfGain rejects invalid level", () => {
    it("rejects > 255", async () => {
      await expect(setAfGain(t, "main", 256)).rejects.toThrow();
    });

    it("rejects negative", async () => {
      await expect(setAfGain(t, "main", -1)).rejects.toThrow();
    });
  });

  // ---- setSquelch ----
  describe("setSquelch rejects invalid level", () => {
    it("rejects > 255", async () => {
      await expect(setSquelch(t, "main", 256)).rejects.toThrow();
    });
  });

  // ---- pad2 (via writeMenu) ----
  describe("writeMenu rejects invalid p1/p2/p3", () => {
    it("rejects p1 > 99", async () => {
      await expect(writeMenu(t, 100, 0, 0, "1")).rejects.toThrow();
    });

    it("rejects negative p2", async () => {
      await expect(writeMenu(t, 0, -1, 0, "1")).rejects.toThrow();
    });

    it("rejects non-integer p3", async () => {
      await expect(writeMenu(t, 0, 0, 1.5, "1")).rejects.toThrow();
    });
  });
});

// ===========================================================================
// 4. Destructive commands — armed flag requirement
// ===========================================================================

describe("destructive commands with armed flag", () => {
  let m: MockTransport;
  let t: CatTransport;

  beforeEach(() => {
    m = mock();
    t = asTransport(m);
  });

  it("setTx(true) with armed sends 'TX1'", async () => {
    await setTx(t, true, { armed: true });
    expect(m.lastSent).toBe("TX1");
  });

  it("setTx(false) with armed sends 'TX0'", async () => {
    await setTx(t, false, { armed: true });
    expect(m.lastSent).toBe("TX0");
  });

  it("powerOff with armed sends 'PS0'", async () => {
    await powerOff(t, { armed: true });
    expect(m.lastSent).toBe("PS0");
  });

  it("setMox(true) with armed sends 'MX1'", async () => {
    await setMox(t, true, { armed: true });
    expect(m.lastSent).toBe("MX1");
  });

  it("setMox(false) with armed sends 'MX0'", async () => {
    await setMox(t, false, { armed: true });
    expect(m.lastSent).toBe("MX0");
  });

  it("powerOff without armed flag rejects", async () => {
    // @ts-expect-error: deliberately passing unarmed
    await expect(powerOff(t, { armed: false })).rejects.toThrow();
    expect(m.sent).toHaveLength(0); // nothing sent
  });

  it("setTx without armed flag rejects", async () => {
    // @ts-expect-error: deliberately passing unarmed
    await expect(setTx(t, true, { armed: false })).rejects.toThrow();
    expect(m.sent).toHaveLength(0);
  });

  it("setMox without armed flag rejects", async () => {
    // @ts-expect-error: deliberately passing unarmed
    await expect(setMox(t, true, { armed: false })).rejects.toThrow();
    expect(m.sent).toHaveLength(0);
  });
});

// ===========================================================================
// 5. Copy / swap commands
// ===========================================================================

describe("copy and swap commands", () => {
  let m: MockTransport;
  let t: CatTransport;

  beforeEach(() => {
    m = mock();
    t = asTransport(m);
  });

  it("copyMainToSub sends 'AB'", async () => {
    await copyMainToSub(t);
    expect(m.lastSent).toBe("AB");
  });

  it("copySubToMain sends 'BA'", async () => {
    await copySubToMain(t);
    expect(m.lastSent).toBe("BA");
  });

  it("swapVfo sends 'SV'", async () => {
    await swapVfo(t);
    expect(m.lastSent).toBe("SV");
  });

  it("copyMainToMemory sends 'AM'", async () => {
    await copyMainToMemory(t);
    expect(m.lastSent).toBe("AM");
  });

  it("copySubToMemory sends 'BM'", async () => {
    await copySubToMemory(t);
    expect(m.lastSent).toBe("BM");
  });
});

// ===========================================================================
// 6. Utility helpers — sideChar / sideFrom
// ===========================================================================

describe("sideChar / sideFrom helpers", () => {
  it("sideChar maps main->0, sub->1", () => {
    expect(sideChar("main")).toBe("0");
    expect(sideChar("sub")).toBe("1");
  });

  it("sideFrom maps 0->main, 1->sub", () => {
    expect(sideFrom("0")).toBe("main");
    expect(sideFrom("1")).toBe("sub");
  });

  it("sideFrom throws on invalid char", () => {
    expect(() => sideFrom("2")).toThrow();
    expect(() => sideFrom("X")).toThrow();
  });
});

// ===========================================================================
// P3: split memory (MZ) + read-backs for PA/RA/NA/OS (BFT C8, C9)
// ===========================================================================

describe("MZ split memory (C8)", () => {
  let m: MockTransport;
  let t: CatTransport;
  beforeEach(() => {
    m = mock();
    t = asTransport(m);
  });

  it("writeSplitMemory sends MZ + 15-char payload (channel, split, freq)", async () => {
    await writeSplitMemory(t, {
      channel: { kind: "memory", n: 1 },
      splitOn: true,
      freqHz: 14_250_000,
    });
    expect(m.lastSent).toBe("MZ000011014250000");
  });

  it("readSplitMemory sends MZ + channel and decodes the answer", async () => {
    m.replyFor("MZ", "MZ000011014250000");
    const f = await readSplitMemory(t, { kind: "memory", n: 1 });
    expect(m.sent[0]).toBe("MZ00001");
    expect(f).toEqual({ channel: { kind: "memory", n: 1 }, splitOn: true, freqHz: 14_250_000 });
  });

  it("readSplitMemory rejects a bad split flag", async () => {
    m.replyFor("MZ", "MZ000019014250000"); // P2='9'
    await expect(readSplitMemory(t, { kind: "memory", n: 1 })).rejects.toThrow();
  });
});

describe("PA/RA/NA/OS read-backs (C9)", () => {
  let m: MockTransport;
  let t: CatTransport;
  beforeEach(() => {
    m = mock();
    t = asTransport(m);
  });

  it("readPreamp sends PA<band> and parses level", async () => {
    m.replyFor("PA", "PA02");
    const lvl = await readPreamp(t, 0);
    expect(m.sent[0]).toBe("PA0");
    expect(lvl).toBe(2);
  });

  it("readAttenuator sends RA0 and parses on/off", async () => {
    m.replyFor("RA", "RA01");
    expect(await readAttenuator(t)).toBe(true);
    expect(m.sent[0]).toBe("RA0");
  });

  it("readNarrow sends NA<side> and parses on/off", async () => {
    m.replyFor("NA", "NA11");
    expect(await readNarrow(t, "sub")).toBe(true);
    expect(m.sent[0]).toBe("NA1");
  });

  it("readRepeaterShift sends OS<side> and maps the code", async () => {
    m.replyFor("OS", "OS03"); // ARS
    expect(await readRepeaterShift(t, "main")).toBe("ars");
    expect(m.sent[0]).toBe("OS0");
  });

  it("readRepeaterShift maps minus", async () => {
    m.replyFor("OS", "OS02");
    expect(await readRepeaterShift(t, "main")).toBe("minus");
  });

  it("readRepeaterShift throws on unknown code", async () => {
    m.replyFor("OS", "OS09");
    await expect(readRepeaterShift(t, "main")).rejects.toThrow();
  });
});

// ===========================================================================
// P3 backlog: setPreamp band/level validation (BFT N19)
// ===========================================================================

describe("setPreamp band/level validation (N19)", () => {
  let m: MockTransport;
  let t: CatTransport;
  beforeEach(() => {
    m = mock();
    t = asTransport(m);
  });

  it("HF/50 (band 0) allows level 2 (AMP2)", async () => {
    await setPreamp(t, 0, 2);
    expect(m.lastSent).toBe("PA02");
  });

  it("VHF (band 1) allows level 1 (ON)", async () => {
    await setPreamp(t, 1, 1);
    expect(m.lastSent).toBe("PA11");
  });

  it("VHF (band 1) rejects level 2 (only OFF/ON)", async () => {
    await expect(setPreamp(t, 1, 2)).rejects.toThrow();
  });

  it("UHF (band 2) rejects level 2 (only OFF/ON)", async () => {
    await expect(setPreamp(t, 2, 2)).rejects.toThrow();
  });
});
