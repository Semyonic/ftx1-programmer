import { describe, expect, it } from "vitest";
import {
  CTCSS_HZ,
  DCS_CODES,
  MEMORY_PAYLOAD_LEN,
  MODE_BY_CHAR,
  RESERVED_MODE_CHARS,
  bandLabel,
  ctcssHzToIndex,
  ctcssIndexToHz,
  dcsCodeToIndex,
  dcsIndexToCode,
  decodeChannelId,
  decodeClarifier,
  decodeFreq,
  decodeMemoryPayload,
  encodeChannelId,
  encodeClarifier,
  encodeFreq,
  encodeMemoryPayload,
  modeFromChar,
  modeToChar,
  validateMemoryTag,
} from "../cat/codec";

describe("frequency", () => {
  it("encodes 14.250 MHz as 014250000 (manual p.4 example)", () => {
    expect(encodeFreq(14_250_000)).toBe("014250000");
  });
  it("rejects under FREQ_MIN_HZ", () => {
    expect(() => encodeFreq(29_999)).toThrow();
  });
  it("rejects over FREQ_MAX_HZ", () => {
    expect(() => encodeFreq(470_000_001)).toThrow();
  });
  it("decodes round-trip", () => {
    expect(decodeFreq(encodeFreq(7_100_000))).toBe(7_100_000);
  });
});

describe("clarifier", () => {
  it("encodes positive with explicit + sign", () => {
    expect(encodeClarifier(0)).toBe("+0000");
    expect(encodeClarifier(1230)).toBe("+1230");
  });
  it("encodes negative", () => {
    expect(encodeClarifier(-1230)).toBe("-1230");
  });
  it("rejects out-of-range", () => {
    expect(() => encodeClarifier(-9991)).toThrow();
    expect(() => encodeClarifier(9996)).toThrow();
  });
  it("decodes round-trip", () => {
    for (const v of [-9990, -100, 0, 100, 9990, 9995]) {
      expect(decodeClarifier(encodeClarifier(v))).toBe(v);
    }
  });
});

describe("mode codec", () => {
  it("rejects reserved chars", () => {
    for (const c of RESERVED_MODE_CHARS) {
      expect(() => modeFromChar(c)).toThrow();
    }
  });
  it("round-trips every named mode", () => {
    for (const [c, name] of Object.entries(MODE_BY_CHAR)) {
      expect(modeToChar(name)).toBe(c);
      expect(modeFromChar(c)).toBe(name);
    }
  });
});

describe("CTCSS", () => {
  it("table has 50 entries (manual p.9 表1)", () => {
    expect(CTCSS_HZ).toHaveLength(50);
    expect(CTCSS_HZ[0]).toBe(67.0);
    expect(CTCSS_HZ[49]).toBe(254.1);
  });
  it("round-trip index/Hz", () => {
    expect(ctcssIndexToHz(0)).toBe(67.0);
    expect(ctcssHzToIndex(100.0)).toBe(12);
  });
});

describe("DCS", () => {
  it("table has 104 entries (manual p.9 表2)", () => {
    expect(DCS_CODES).toHaveLength(104);
    expect(DCS_CODES[0]).toBe(23);
    expect(DCS_CODES[103]).toBe(754);
  });
  it("round-trip", () => {
    expect(dcsIndexToCode(2)).toBe(26);
    expect(dcsCodeToIndex(165)).toBe(30);
  });
});

describe("band labels", () => {
  it("has 15 entries (manual p.8)", () => {
    expect(bandLabel(0)).toBe("1.8 MHz");
    expect(bandLabel(14)).toBe("430 MHz");
    expect(() => bandLabel(15)).toThrow();
  });
});

describe("channel id", () => {
  it("encodes memory channel", () => {
    expect(encodeChannelId({ kind: "memory", n: 1 })).toBe("00001");
    expect(encodeChannelId({ kind: "memory", n: 99 })).toBe("00099");
  });
  it("encodes PMS pair", () => {
    expect(encodeChannelId({ kind: "pms", n: 1, end: "L" })).toBe("P-01L");
    expect(encodeChannelId({ kind: "pms", n: 50, end: "U" })).toBe("P-50U");
  });
  it("encodes EMGCH and VFO", () => {
    expect(encodeChannelId({ kind: "emergency" })).toBe("EMGCH");
    expect(encodeChannelId({ kind: "vfo" })).toBe("00000");
  });
  it("decodes round-trip", () => {
    const cases = [
      { kind: "memory", n: 7 } as const,
      { kind: "pms", n: 12, end: "L" } as const,
      { kind: "emergency" } as const,
      { kind: "vfo" } as const,
    ];
    for (const c of cases) {
      expect(decodeChannelId(encodeChannelId(c))).toEqual(c);
    }
  });
});

describe("memory payload", () => {
  it("payload length is 27 chars (manual pp.20-21)", () => {
    const f = {
      channel: { kind: "memory" as const, n: 1 },
      freqHz: 14_250_000,
      clarifierHz: 0,
      rxClarOn: false,
      txClarOn: false,
      mode: "USB" as const,
      vfoMem: "Memory" as const,
      ctcssState: "OFF" as const,
      shift: "simplex" as const,
    };
    const payload = encodeMemoryPayload(f);
    expect(payload).toHaveLength(MEMORY_PAYLOAD_LEN);
    expect(payload).toBe("00001" + "014250000" + "+0000" + "0" + "0" + "2" + "1" + "0" + "00" + "0");
    expect(decodeMemoryPayload(payload)).toEqual(f);
  });
  it("round-trips with non-default fields", () => {
    const f = {
      channel: { kind: "pms" as const, n: 3, end: "U" as const },
      freqHz: 432_500_000,
      clarifierHz: -120,
      rxClarOn: true,
      txClarOn: true,
      mode: "FM" as const,
      vfoMem: "PMS" as const,
      ctcssState: "DCS" as const,
      shift: "minus" as const,
    };
    expect(decodeMemoryPayload(encodeMemoryPayload(f))).toEqual(f);
  });
});

describe("memory tag", () => {
  it("accepts ASCII printable up to 12 chars", () => {
    expect(() => validateMemoryTag("REPEATER 7")).not.toThrow();
  });
  it("rejects too long", () => {
    expect(() => validateMemoryTag("THIRTEEN CHAR")).toThrow();
  });
  it("rejects non-printable", () => {
    expect(() => validateMemoryTag("hello\n")).toThrow();
    expect(() => validateMemoryTag("hi\x7e")).toThrow(); // 0x7E excluded (0x20..0x7D only)
  });
});
