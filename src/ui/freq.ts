// Freq input/display helpers. Accepts forgiving user input and renders MHz.

export const formatMHz = (hz: number): string => {
  // Trim trailing zeros but keep at least 3 fractional digits for legibility.
  const s = (hz / 1_000_000).toFixed(6);
  return s.replace(/(\.\d{3,})0+$/, "$1").replace(/\.0+$/, "");
};

// Heuristics:
//   "439.200" / "439.2"     -> MHz
//   "14.250"                -> MHz
//   "14250"                 -> kHz (< 1_000_000 and no decimal)
//   "14250000"              -> Hz (>= 1_000_000)
//   "439,200"               -> European decimal, treat as MHz
// Returns null if unparseable. Caller must still range-check.
export const parseUserFreq = (input: string): number | null => {
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  if (s.includes(".") || n < 1000) return Math.round(n * 1_000_000);
  if (n < 1_000_000) return Math.round(n * 1000);
  return Math.round(n);
};

// Per-band shift magnitude lives in EX menu (manual p.11):
//   01-03-16  RPT SHIFT 28MHz   step 10 kHz, 0..1000
//   01-03-17  RPT SHIFT 50MHz   step 10 kHz, 0..4000
//   01-03-18  RPT SHIFT 144MHz  step 50 kHz, 0..100 (units of 50kHz, 4-digit)
//   01-03-19  RPT SHIFT 430MHz  step 50 kHz, 0..100
//
// The 144/430 raw value is documented as "0000 ~ 0100, 50kHz ステップ", so the
// raw P4 represents N where offset_kHz = N * 50? The manual is ambiguous; we
// expose it as raw kHz (the radio's own preferred unit) for now and let the
// user verify.
export interface BandShift {
  band: "28MHz" | "50MHz" | "144MHz" | "430MHz";
  p1: number;
  p2: number;
  p3: number;
}
export const BAND_SHIFTS: BandShift[] = [
  { band: "28MHz", p1: 1, p2: 3, p3: 16 },
  { band: "50MHz", p1: 1, p2: 3, p3: 17 },
  { band: "144MHz", p1: 1, p2: 3, p3: 18 },
  { band: "430MHz", p1: 1, p2: 3, p3: 19 },
];

export const bandForFreq = (hz: number): BandShift | null => {
  const mhz = hz / 1_000_000;
  if (mhz >= 28 && mhz < 30) return BAND_SHIFTS[0];
  if (mhz >= 50 && mhz < 54) return BAND_SHIFTS[1];
  if (mhz >= 144 && mhz < 148) return BAND_SHIFTS[2];
  if (mhz >= 430 && mhz < 450) return BAND_SHIFTS[3];
  return null;
};

// Coarse band grouping for the memory grid display. Mirrors BS table p.8.
export type BandGroup =
  | "1.8MHz" | "3.5MHz" | "5MHz" | "7MHz" | "10MHz" | "14MHz" | "18MHz"
  | "21MHz" | "24MHz" | "28MHz" | "50MHz" | "70MHz" | "AIR" | "144MHz"
  | "430MHz" | "GEN";

export const bandGroupForFreq = (hz: number): BandGroup => {
  const m = hz / 1_000_000;
  if (m >= 1.8 && m < 2) return "1.8MHz";
  if (m >= 3.5 && m < 4) return "3.5MHz";
  if (m >= 5 && m < 5.5) return "5MHz";
  if (m >= 7 && m < 7.3) return "7MHz";
  if (m >= 10 && m < 10.2) return "10MHz";
  if (m >= 14 && m < 14.4) return "14MHz";
  if (m >= 18 && m < 18.2) return "18MHz";
  if (m >= 21 && m < 21.5) return "21MHz";
  if (m >= 24.8 && m < 25) return "24MHz";
  if (m >= 28 && m < 30) return "28MHz";
  if (m >= 50 && m < 54) return "50MHz";
  if (m >= 70 && m < 71) return "70MHz";
  if (m >= 108 && m < 137) return "AIR";
  if (m >= 144 && m < 148) return "144MHz";
  if (m >= 430 && m < 450) return "430MHz";
  return "GEN";
};

export const BAND_GROUP_ORDER: BandGroup[] = [
  "1.8MHz", "3.5MHz", "5MHz", "7MHz", "10MHz", "14MHz", "18MHz",
  "21MHz", "24MHz", "28MHz", "50MHz", "70MHz", "AIR", "144MHz",
  "430MHz", "GEN",
];
