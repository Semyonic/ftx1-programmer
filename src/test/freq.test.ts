import { describe, expect, it } from "vitest";
import { formatMHz, parseUserFreq, bandForFreq, bandGroupForFreq, BAND_SHIFTS } from "../ui/freq";

describe("formatMHz", () => {
  it("standard VHF", () => expect(formatMHz(145_500_000)).toBe("145.50000"));
  it("standard UHF", () => expect(formatMHz(439_200_000)).toBe("439.20000"));
  it("HF", () => expect(formatMHz(14_250_000)).toBe("14.25000"));
  it("keeps trailing zeros for legibility", () => expect(formatMHz(7_100_000)).toBe("7.10000"));
  it("exact MHz drops fractional part", () => expect(formatMHz(145_000_000)).toBe("145"));
  it("preserves nonzero 5th digit", () => expect(formatMHz(145_012_500)).toBe("145.01250"));
  it("sub-MHz", () => expect(formatMHz(500_000)).toBe("0.50000"));
  it("exact MHz no fraction", () => expect(formatMHz(7_000_000)).toBe("7"));
  it("precise to 10 Hz", () => expect(formatMHz(145_500_010)).toBe("145.50001"));
  it("all six digits nonzero", () => expect(formatMHz(123_456_789)).toBe("123.456789"));
});

describe("parseUserFreq", () => {
  it("MHz with decimal", () => expect(parseUserFreq("439.200")).toBe(439_200_000));
  it("MHz short form", () => expect(parseUserFreq("14.25")).toBe(14_250_000));
  it("kHz integer (no decimal, < 1M)", () => expect(parseUserFreq("14250")).toBe(14_250_000));
  it("Hz integer (>= 1M)", () => expect(parseUserFreq("14250000")).toBe(14_250_000));
  it("European comma as decimal", () => expect(parseUserFreq("439,200")).toBe(439_200_000));
  it("leading/trailing whitespace", () => expect(parseUserFreq("  439.200  ")).toBe(439_200_000));
  it("small number treated as MHz", () => expect(parseUserFreq("500")).toBe(500_000_000));
  it("very small with decimal treated as MHz", () => expect(parseUserFreq("1.8")).toBe(1_800_000));
  it("zero", () => expect(parseUserFreq("0")).toBe(0));

  it("empty string → null", () => expect(parseUserFreq("")).toBeNull());
  it("whitespace only → null", () => expect(parseUserFreq("   ")).toBeNull());
  it("alphabetic → null", () => expect(parseUserFreq("abc")).toBeNull());
  it("negative → null", () => expect(parseUserFreq("-5")).toBeNull());
  it("mixed garbage → null", () => expect(parseUserFreq("12abc")).toBeNull());
});

describe("bandForFreq", () => {
  it("28 MHz band", () => {
    expect(bandForFreq(28_000_000)).toBe(BAND_SHIFTS[0]);
    expect(bandForFreq(29_999_999)).toBe(BAND_SHIFTS[0]);
  });
  it("50 MHz band", () => {
    expect(bandForFreq(50_000_000)).toBe(BAND_SHIFTS[1]);
    expect(bandForFreq(53_999_999)).toBe(BAND_SHIFTS[1]);
  });
  it("144 MHz band", () => {
    expect(bandForFreq(144_000_000)).toBe(BAND_SHIFTS[2]);
    expect(bandForFreq(147_999_999)).toBe(BAND_SHIFTS[2]);
  });
  it("430 MHz band", () => {
    expect(bandForFreq(430_000_000)).toBe(BAND_SHIFTS[3]);
    expect(bandForFreq(449_999_999)).toBe(BAND_SHIFTS[3]);
  });

  it("below 28 MHz → null", () => expect(bandForFreq(27_999_999)).toBeNull());
  it("30 MHz boundary → null", () => expect(bandForFreq(30_000_000)).toBeNull());
  it("gap between bands → null", () => expect(bandForFreq(100_000_000)).toBeNull());
  it("above 450 MHz → null", () => expect(bandForFreq(450_000_000)).toBeNull());
  it("HF below 28 → null", () => expect(bandForFreq(14_250_000)).toBeNull());
});

describe("bandGroupForFreq", () => {
  it("1.8 MHz", () => expect(bandGroupForFreq(1_800_000)).toBe("1.8MHz"));
  it("3.5 MHz", () => expect(bandGroupForFreq(3_500_000)).toBe("3.5MHz"));
  it("5 MHz", () => expect(bandGroupForFreq(5_300_000)).toBe("5MHz"));
  it("7 MHz", () => expect(bandGroupForFreq(7_100_000)).toBe("7MHz"));
  it("10 MHz", () => expect(bandGroupForFreq(10_100_000)).toBe("10MHz"));
  it("14 MHz", () => expect(bandGroupForFreq(14_250_000)).toBe("14MHz"));
  it("18 MHz", () => expect(bandGroupForFreq(18_100_000)).toBe("18MHz"));
  it("21 MHz", () => expect(bandGroupForFreq(21_200_000)).toBe("21MHz"));
  it("24 MHz", () => expect(bandGroupForFreq(24_900_000)).toBe("24MHz"));
  it("28 MHz", () => expect(bandGroupForFreq(28_500_000)).toBe("28MHz"));
  it("50 MHz", () => expect(bandGroupForFreq(50_100_000)).toBe("50MHz"));
  it("70 MHz", () => expect(bandGroupForFreq(70_200_000)).toBe("70MHz"));
  it("AIR band", () => expect(bandGroupForFreq(121_500_000)).toBe("AIR"));
  it("144 MHz", () => expect(bandGroupForFreq(145_000_000)).toBe("144MHz"));
  it("430 MHz", () => expect(bandGroupForFreq(433_000_000)).toBe("430MHz"));

  it("AIR lower boundary", () => expect(bandGroupForFreq(108_000_000)).toBe("AIR"));
  it("below AIR → GEN", () => expect(bandGroupForFreq(107_900_000)).toBe("GEN"));
  it("gap frequency → GEN", () => expect(bandGroupForFreq(100_000_000)).toBe("GEN"));
  it("above 450 MHz → GEN", () => expect(bandGroupForFreq(500_000_000)).toBe("GEN"));
  it("below 1.8 MHz → GEN", () => expect(bandGroupForFreq(1_000_000)).toBe("GEN"));
});
