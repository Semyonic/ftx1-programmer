// Edge-case tests for codec decoders — strictness, boundary, and unknown-value
// handling NOT covered by codec.test.ts.

import { describe, expect, it } from "vitest";
import {
  decodeClarifier,
  decodeChannelId,
  decodeFreq,
  decodeMemoryPayload,
  encodeChannelId,
  encodeFreq,
  encodeClarifier,
  MEMORY_PAYLOAD_LEN,
  validateMemoryTag,
} from "../cat/codec";

// ---------------------------------------------------------------------------
// decodeFreq — rejects garbage
// ---------------------------------------------------------------------------
describe("decodeFreq rejects garbage", () => {
  it("rejects trailing non-digit (01425000X)", () => {
    expect(() => decodeFreq("01425000X")).toThrow();
  });

  it("rejects all alpha (abcdefghi)", () => {
    expect(() => decodeFreq("abcdefghi")).toThrow();
  });

  it("rejects 8-digit string (too short)", () => {
    expect(() => decodeFreq("12345678")).toThrow();
  });

  it("rejects 10-digit string (too long)", () => {
    expect(() => decodeFreq("1234567890")).toThrow();
  });

  it("rejects 000000001 (1 Hz) — below FREQ_MIN (BFT C3: now range-checked)", () => {
    // decodeFreq is now symmetric with encodeFreq and rejects out-of-range Hz.
    expect(() => decodeFreq("000000001")).toThrow();
  });

  it("accepts 000030000 (30 kHz, FREQ_MIN boundary)", () => {
    expect(decodeFreq("000030000")).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// decodeClarifier — rejects garbage
// ---------------------------------------------------------------------------
describe("decodeClarifier rejects garbage", () => {
  it("rejects embedded alpha (+12A4)", () => {
    expect(() => decodeClarifier("+12A4")).toThrow();
  });

  it("rejects missing sign (12345 — 5 chars, no +/-)", () => {
    expect(() => decodeClarifier("12345")).toThrow();
  });

  it("rejects too few digits (+123 — 3 digits, need 4)", () => {
    expect(() => decodeClarifier("+123")).toThrow();
  });

  it("decodes +0000 (0 Hz)", () => {
    expect(decodeClarifier("+0000")).toBe(0);
  });

  it("decodes -9990", () => {
    expect(decodeClarifier("-9990")).toBe(-9990);
  });

  it("decodes +9995 (max boundary)", () => {
    expect(decodeClarifier("+9995")).toBe(9995);
  });

  it("rejects +9999 (above +9995 max) (BFT N9)", () => {
    expect(() => decodeClarifier("+9999")).toThrow();
  });

  it("rejects -9991 (below -9990 min) (BFT N9)", () => {
    expect(() => decodeClarifier("-9991")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// decodeChannelId — rejects malformed
// ---------------------------------------------------------------------------
describe("decodeChannelId rejects malformed", () => {
  it("rejects alpha in numeric slot (0000A)", () => {
    expect(() => decodeChannelId("0000A")).toThrow();
  });

  it("rejects non-numeric PMS digits (P-0AL)", () => {
    expect(() => decodeChannelId("P-0AL")).toThrow();
  });

  it("succeeds for P-01L (PMS pair 1 lower)", () => {
    expect(decodeChannelId("P-01L")).toEqual({ kind: "pms", n: 1, end: "L" });
  });

  it("succeeds for P-50U (PMS pair 50 upper)", () => {
    expect(decodeChannelId("P-50U")).toEqual({ kind: "pms", n: 50, end: "U" });
  });

  // BFT C4: decodeChannelId is now symmetric with the encoder and range-checks
  // PMS n (1..50) and memory n (1..99) instead of accepting them silently.
  it("P-00L throws (n=0 out of PMS range 1..50)", () => {
    expect(() => decodeChannelId("P-00L")).toThrow();
  });

  it("P-51U throws (n=51 out of PMS range 1..50)", () => {
    expect(() => decodeChannelId("P-51U")).toThrow();
  });

  it("00100 decodes (memory channel 100 — protocol allows 1..999)", () => {
    // The CAT protocol permits memory channels up to 999 (manual MW/MZ/OI P1),
    // even though the app manages only 1..99.
    expect(decodeChannelId("00100")).toEqual({ kind: "memory", n: 100 });
  });

  it("00999 decodes (memory channel 999, upper boundary)", () => {
    expect(decodeChannelId("00999")).toEqual({ kind: "memory", n: 999 });
  });

  it("01000 throws (memory channel 1000 out of range 1..999)", () => {
    expect(() => decodeChannelId("01000")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// decodeMemoryPayload edge cases
// ---------------------------------------------------------------------------
describe("decodeMemoryPayload edge cases", () => {
  // Helper: build a valid 27-char payload string with controllable P7 and P8.
  //   P1(5) P2(9) P3(5) P4(1) P5(1) P6(1) P7(1) P8(1) P9(2) P10(1)
  function makePayload(overrides: { p7?: string; p8?: string } = {}): string {
    const p1 = "00001"; // memory ch 1
    const p2 = "014250000"; // 14.250 MHz
    const p3 = "+0000";
    const p4 = "0"; // rxClar off
    const p5 = "0"; // txClar off
    const p6 = "2"; // USB
    const p7 = overrides.p7 ?? "1"; // Memory
    const p8 = overrides.p8 ?? "0"; // OFF
    const p9 = "00";
    const p10 = "0"; // simplex
    return p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p10;
  }

  it("unknown VFO/mem state char throws", () => {
    // 'Z' is not in VFO_MEM_STATE ("0","1","2","3","5")
    const payload = makePayload({ p7: "Z" });
    expect(payload).toHaveLength(MEMORY_PAYLOAD_LEN);
    expect(() => decodeMemoryPayload(payload)).toThrow(/VFO\/mem state/);
  });

  it("unknown CTCSS state char throws", () => {
    // '9' is not in CTCSS_STATE ("0".."5")
    const payload = makePayload({ p8: "9" });
    expect(payload).toHaveLength(MEMORY_PAYLOAD_LEN);
    expect(() => decodeMemoryPayload(payload)).toThrow(/CTCSS state/);
  });

  // BFT N11/N12: strict P4/P5 boolean fields + P9 fixed "00".
  const VALID27 = "00001014250000+000000210000"; // ch1, 14.25MHz, USB, Memory, OFF

  it("decodes the valid base payload", () => {
    expect(VALID27).toHaveLength(MEMORY_PAYLOAD_LEN);
    expect(decodeMemoryPayload(VALID27).freqHz).toBe(14_250_000);
  });

  it("rejects invalid P4 (RX clarifier) char (N11)", () => {
    const bad = VALID27.slice(0, 19) + "2" + VALID27.slice(20);
    expect(() => decodeMemoryPayload(bad)).toThrow(/P4/);
  });

  it("rejects invalid P5 (TX clarifier) char (N11)", () => {
    const bad = VALID27.slice(0, 20) + "X" + VALID27.slice(21);
    expect(() => decodeMemoryPayload(bad)).toThrow(/P5/);
  });

  it("rejects P9 not '00' (N12)", () => {
    const bad = VALID27.slice(0, 24) + "10" + VALID27.slice(26);
    expect(() => decodeMemoryPayload(bad)).toThrow(/P9/);
  });

  it("decodes payload with non-default clarifier, rxClar, txClar", () => {
    const p1 = encodeChannelId({ kind: "pms", n: 5, end: "U" });
    const p2 = encodeFreq(145_500_000);
    const p3 = encodeClarifier(-500);
    const p4 = "1"; // rxClar ON
    const p5 = "1"; // txClar ON
    const p6 = "4"; // FM
    const p7 = "5"; // PMS
    const p8 = "3"; // DCS
    const p9 = "00";
    const p10 = "2"; // minus
    const payload = p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p10;
    expect(payload).toHaveLength(MEMORY_PAYLOAD_LEN);

    const decoded = decodeMemoryPayload(payload);
    expect(decoded.channel).toEqual({ kind: "pms", n: 5, end: "U" });
    expect(decoded.freqHz).toBe(145_500_000);
    expect(decoded.clarifierHz).toBe(-500);
    expect(decoded.rxClarOn).toBe(true);
    expect(decoded.txClarOn).toBe(true);
    expect(decoded.mode).toBe("FM");
    expect(decoded.vfoMem).toBe("PMS");
    expect(decoded.ctcssState).toBe("DCS");
    expect(decoded.shift).toBe("minus");
  });
});

// ---------------------------------------------------------------------------
// validateMemoryTag
// ---------------------------------------------------------------------------
describe("validateMemoryTag edge cases", () => {
  it("rejects semicolon (0x3B — CAT wire terminator) (BFT C5)", () => {
    // ';' is the frame terminator; a tag containing it must be rejected early
    // rather than failing later in buildFrame.
    expect(() => validateMemoryTag("AB;CD")).toThrow();
  });

  it("accepts } (0x7D — valid in MT tags; only special inside KM)", () => {
    expect(() => validateMemoryTag("TEST}")).not.toThrow();
  });

  it("rejects ~ (0x7E — one past upper bound)", () => {
    expect(() => validateMemoryTag("TEST~")).toThrow();
  });

  it("rejects char 0x1F (unit separator — one below lower bound)", () => {
    expect(() => validateMemoryTag("TEST\x1F")).toThrow();
  });

  it("accepts empty tag", () => {
    expect(() => validateMemoryTag("")).not.toThrow();
  });

  it("accepts exactly 12 chars", () => {
    expect(() => validateMemoryTag("ABCDEFGHIJKL")).not.toThrow();
  });

  it("rejects 13 chars", () => {
    expect(() => validateMemoryTag("ABCDEFGHIJKLM")).toThrow();
  });
});
