// FTX-1 CAT codec — encoders/decoders and lookup tables.
// Source: FTX-1_CAT_OM_JPN_2512-D.pdf (Yaesu, 2025-12 rev D).
// Page numbers in comments refer to that PDF.

// ---- Operating mode (P6 of IF/OI/MR/MW; P2 of MD). p.20 ----
export const MODE_BY_CHAR = {
  "1": "LSB",
  "2": "USB",
  "3": "CW-U",
  "4": "FM",
  "5": "AM",
  "6": "RTTY-L",
  "7": "CW-L",
  "8": "DATA-L",
  "9": "RTTY-U",
  A: "DATA-FM",
  B: "FM-N",
  C: "DATA-U",
  D: "AM-N",
  E: "PSK",
  F: "DATA-FM-N",
  H: "C4FM-DN",
  I: "C4FM-VW",
} as const;

export type Mode = typeof MODE_BY_CHAR[keyof typeof MODE_BY_CHAR];
export const RESERVED_MODE_CHARS = new Set(["0", "G", "J"]);

export function modeFromChar(c: string): Mode {
  if (RESERVED_MODE_CHARS.has(c)) {
    throw new Error(`Reserved/unused mode char ${JSON.stringify(c)} (manual p.20)`);
  }
  const name = (MODE_BY_CHAR as Record<string, string>)[c];
  if (!name) throw new Error(`Unknown mode char ${JSON.stringify(c)}`);
  return name as Mode;
}

export function modeToChar(name: Mode | string): string {
  for (const [c, n] of Object.entries(MODE_BY_CHAR)) {
    if (n === name) return c;
  }
  throw new Error(`Unknown mode name ${JSON.stringify(name)}`);
}

// ---- Band selection (BS P2). p.8 ----
export const BAND_LABELS = [
  "1.8 MHz",
  "3.5 MHz",
  "5 MHz",
  "7 MHz",
  "10 MHz",
  "14 MHz",
  "18 MHz",
  "21 MHz",
  "24.5 MHz",
  "28 MHz",
  "50 MHz",
  "70 MHz / GEN",
  "AIR",
  "144 MHz",
  "430 MHz",
];

export function bandLabel(idx: number): string {
  if (idx < 0 || idx >= BAND_LABELS.length) {
    throw new Error(`Band index ${idx} out of range 0..14 (manual p.8)`);
  }
  return BAND_LABELS[idx];
}

// ---- CTCSS tone frequency table (CN P2=0, P3=000..049). p.9 表1 ----
export const CTCSS_HZ = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4, 100.0,
  103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5, 141.3, 146.2,
  151.4, 156.7, 159.8, 162.2, 165.5, 167.9, 171.3, 173.8, 177.3, 179.9, 183.5,
  186.2, 189.9, 192.8, 196.6, 199.5, 203.5, 206.5, 210.7, 218.1, 225.7, 229.1,
  233.6, 241.8, 250.3, 254.1,
];

export function ctcssIndexToHz(idx: number): number {
  if (idx < 0 || idx >= CTCSS_HZ.length) {
    throw new Error(`CTCSS index ${idx} out of range 0..49 (manual p.9)`);
  }
  return CTCSS_HZ[idx];
}

export function ctcssHzToIndex(hz: number): number {
  const i = CTCSS_HZ.findIndex((v) => Math.abs(v - hz) < 0.05);
  if (i < 0) throw new Error(`No CTCSS tone matches ${hz} Hz (manual p.9)`);
  return i;
}

// ---- DCS code table (CN P2=1, P3=000..103). p.9 表2 ----
export const DCS_CODES = [
  23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74, 114, 115, 116,
  122, 125, 131, 132, 134, 143, 145, 152, 155, 156, 162, 165, 172, 174, 205,
  212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255, 261, 263, 265, 266,
  271, 274, 306, 311, 315, 325, 331, 332, 343, 346, 351, 356, 364, 365, 371,
  411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455, 462, 464, 465, 466,
  503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624, 627, 631, 632, 654,
  662, 664, 703, 712, 723, 731, 732, 734, 743, 754,
];

export function dcsIndexToCode(idx: number): number {
  if (idx < 0 || idx >= DCS_CODES.length) {
    throw new Error(`DCS index ${idx} out of range 0..103 (manual p.9)`);
  }
  return DCS_CODES[idx];
}

export function dcsCodeToIndex(code: number): number {
  const i = DCS_CODES.indexOf(code);
  if (i < 0) throw new Error(`No DCS index for code ${code} (manual p.9)`);
  return i;
}

// ---- Frequency (FA/FB P1, MR/MW P2). p.17 ----
export const FREQ_MIN_HZ = 30_000;
export const FREQ_MAX_HZ = 470_000_000;

export function encodeFreq(hz: number): string {
  if (!Number.isInteger(hz)) throw new Error(`Frequency must be integer Hz, got ${hz}`);
  if (hz < FREQ_MIN_HZ || hz > FREQ_MAX_HZ) {
    throw new Error(
      `Frequency ${hz} Hz out of range ${FREQ_MIN_HZ}..${FREQ_MAX_HZ} (manual p.17)`,
    );
  }
  return hz.toString().padStart(9, "0");
}

export function decodeFreq(field: string): number {
  if (field.length !== 9) {
    throw new Error(`Frequency field must be 9 chars, got ${field.length}`);
  }
  if (!/^\d{9}$/.test(field)) {
    throw new Error(`Frequency field must be 9 digits, got ${JSON.stringify(field)}`);
  }
  const hz = parseInt(field, 10);
  // Symmetric with encodeFreq: reject out-of-range values (BFT C3) so a garbled
  // reply like "000000001" (1 Hz) is caught instead of silently accepted.
  if (hz < FREQ_MIN_HZ || hz > FREQ_MAX_HZ) {
    throw new Error(
      `Decoded frequency ${hz} Hz out of range ${FREQ_MIN_HZ}..${FREQ_MAX_HZ} (manual p.17)`,
    );
  }
  return hz;
}

// ---- Clarifier offset (MR/MW P3, IF P3, OI P3, MZ P3). p.21 ----
// 5 chars: sign('+'/'-') + 4 digits. MW manual states range -9990..+9995 Hz.
// Sign is required even at 0 Hz (manual p.9 CF note).
export const CLARIFIER_MIN_HZ = -9990;
export const CLARIFIER_MAX_HZ = 9995;

export function encodeClarifier(hz: number): string {
  if (!Number.isInteger(hz)) {
    throw new Error(`Clarifier must be integer Hz, got ${hz}`);
  }
  if (hz < CLARIFIER_MIN_HZ || hz > CLARIFIER_MAX_HZ) {
    throw new Error(
      `Clarifier ${hz} Hz out of range ${CLARIFIER_MIN_HZ}..${CLARIFIER_MAX_HZ} (manual p.21)`,
    );
  }
  const sign = hz < 0 ? "-" : "+";
  return sign + Math.abs(hz).toString().padStart(4, "0");
}

export function decodeClarifier(field: string): number {
  if (field.length !== 5) {
    throw new Error(`Clarifier field must be 5 chars, got ${field.length}`);
  }
  if (!/^[+-]\d{4}$/.test(field)) {
    throw new Error(`Clarifier field must be sign + 4 digits, got ${JSON.stringify(field)}`);
  }
  const sign = field[0];
  const mag = parseInt(field.slice(1), 10);
  const hz = sign === "-" ? -mag : mag;
  // Symmetric with encodeClarifier (BFT N9): reject out-of-range offsets.
  if (hz < CLARIFIER_MIN_HZ || hz > CLARIFIER_MAX_HZ) {
    throw new Error(
      `Decoded clarifier ${hz} Hz out of range ${CLARIFIER_MIN_HZ}..${CLARIFIER_MAX_HZ} (manual p.21)`,
    );
  }
  return hz;
}

// ---- Memory channel ID (MR/MW P1, IF P1, MC P2). pp.18-19 ----
// 5-char ASCII: "00000" VFO/QMB, "00001".."00099" memory, "P-01L".."P-50U" PMS,
// "EMGCH" emergency (4630 kHz).
export type ChannelId =
  | { kind: "vfo" }
  | { kind: "memory"; n: number }
  | { kind: "pms"; n: number; end: "L" | "U" }
  | { kind: "emergency" };

export function encodeChannelId(id: ChannelId): string {
  switch (id.kind) {
    case "vfo":
      return "00000";
    case "memory":
      if (!Number.isInteger(id.n) || id.n < 1 || id.n > 99) {
        throw new Error(`Memory channel ${id.n} out of range 1..99 (manual p.18)`);
      }
      return id.n.toString().padStart(5, "0");
    case "pms":
      if (!Number.isInteger(id.n) || id.n < 1 || id.n > 50) {
        throw new Error(`PMS pair ${id.n} out of range 1..50 (manual p.19)`);
      }
      return `P-${id.n.toString().padStart(2, "0")}${id.end}`;
    case "emergency":
      return "EMGCH";
  }
}

export function decodeChannelId(field: string): ChannelId {
  if (field.length !== 5) {
    throw new Error(`Channel field must be 5 chars, got ${field.length}`);
  }
  if (field === "00000") return { kind: "vfo" };
  if (field === "EMGCH") return { kind: "emergency" };
  if (field.startsWith("P-")) {
    if (!/^P-\d{2}[LU]$/.test(field)) {
      throw new Error(`Bad PMS field ${JSON.stringify(field)}`);
    }
    const n = parseInt(field.slice(2, 4), 10);
    // Symmetric with encodeChannelId (BFT C4): reject out-of-range PMS pairs
    // (P-00x, P-51x) instead of decoding them into a semantically invalid id.
    if (n < 1 || n > 50) {
      throw new Error(`PMS pair ${n} out of range 1..50 (manual p.19)`);
    }
    const end = field[4] as "L" | "U";
    return { kind: "pms", n, end };
  }
  if (!/^\d{5}$/.test(field)) {
    throw new Error(`Bad channel field ${JSON.stringify(field)}`);
  }
  const n = parseInt(field, 10);
  // Reject only truly invalid channel numbers. The CAT protocol allows memory
  // channels 00001..00999 (manual MW/MZ/OI P1), even though this programmer only
  // *manages* 1..99 — IF/OI can report whatever channel the radio is on, so the
  // decoder must accept the full protocol range and reject 01000..99999 (BFT C4;
  // corrects the over-strict 1..99 bound — codex N10 mis-stated the valid range).
  if (n < 1 || n > 999) {
    throw new Error(`Memory channel ${n} out of range 1..999 (manual p.20)`);
  }
  return { kind: "memory", n };
}

// ---- VFO/memory state (MR/MW P7, IF P7). p.18 ----
export const VFO_MEM_STATE = {
  "0": "VFO",
  "1": "Memory",
  "2": "MemTune",
  "3": "QMB",
  "5": "PMS",
} as const;

export type VfoMemState = typeof VFO_MEM_STATE[keyof typeof VFO_MEM_STATE];

export function vfoMemFromChar(c: string): VfoMemState {
  const name = (VFO_MEM_STATE as Record<string, string>)[c];
  if (!name) throw new Error(`Unknown VFO/mem state char ${JSON.stringify(c)} (manual p.18)`);
  return name as VfoMemState;
}

export function vfoMemToChar(v: VfoMemState): string {
  for (const [c, n] of Object.entries(VFO_MEM_STATE)) {
    if (n === v) return c;
  }
  throw new Error(`Unknown VFO/mem state ${JSON.stringify(v)}`);
}

// ---- CTCSS state (MR/MW P8, IF P8). p.18 ----
export const CTCSS_STATE = {
  "0": "OFF",
  "1": "CTCSS ENC/DEC",
  "2": "CTCSS ENC",
  "3": "DCS",
  "4": "PR FREQ",
  "5": "REV TONE",
} as const;

export type CtcssState = typeof CTCSS_STATE[keyof typeof CTCSS_STATE];

export function ctcssStateFromChar(c: string): CtcssState {
  const name = (CTCSS_STATE as Record<string, string>)[c];
  if (!name) throw new Error(`Unknown CTCSS state char ${JSON.stringify(c)} (manual p.18)`);
  return name as CtcssState;
}

export function ctcssStateToChar(s: CtcssState): string {
  for (const [c, n] of Object.entries(CTCSS_STATE)) {
    if (n === s) return c;
  }
  throw new Error(`Unknown CTCSS state ${JSON.stringify(s)}`);
}

// ---- Repeater shift (MR/MW P10, IF P10, OS P2). p.18, p.22 ----
export type Shift = "simplex" | "plus" | "minus";
export const SHIFT_BY_CHAR: Record<string, Shift> = {
  "0": "simplex",
  "1": "plus",
  "2": "minus",
};

export function shiftToChar(s: Shift): "0" | "1" | "2" {
  return s === "simplex" ? "0" : s === "plus" ? "1" : "2";
}

export function shiftFromChar(c: string): Shift {
  const s = SHIFT_BY_CHAR[c];
  if (!s) throw new Error(`Unknown shift char ${JSON.stringify(c)}`);
  return s;
}

// ---- Memory tag charset (MT P1). p.20: ASCII 0x20..0x7D, max 12 chars. ----
export const MEMORY_TAG_MAX = 12;

export function validateMemoryTag(tag: string): void {
  if (tag.length > MEMORY_TAG_MAX) {
    throw new Error(`Tag must be ≤ ${MEMORY_TAG_MAX} chars, got ${tag.length}`);
  }
  for (let i = 0; i < tag.length; i++) {
    const c = tag.charCodeAt(i);
    if (c < 0x20 || c > 0x7d) {
      throw new Error(
        `Tag char at ${i} (0x${c.toString(16)}) outside 0x20..0x7D (manual p.20)`,
      );
    }
    // BFT C5: ';' (0x3B) is the CAT wire terminator. Although buildFrame would
    // also reject it, fail early here so a bad tag is caught at edit/import time
    // rather than deep in transmit. ('}' 0x7D stays valid — it is only special
    // inside KM keyer-memory, not in MT tags.)
    if (c === 0x3b) {
      throw new Error(
        `Tag char at ${i} is ';' (0x3B), the CAT frame terminator — not allowed in a tag`,
      );
    }
  }
}

// ---- 27-char memory frame payload (IF, OI, MR, MW).
// pp.18-21. After the 2-char prefix and before ';':
//   P1×5 | P2×9 | P3×5 | P4×1 | P5×1 | P6×1 | P7×1 | P8×1 | P9×2 | P10×1
//   = 27 chars payload. With prefix(2) + ';'(1) total wire length = 30 chars.
//
// Indices into payload (0-based):
//   P1 0..4   P2 5..13   P3 14..18   P4 19   P5 20   P6 21   P7 22
//   P8 23   P9 24..25 (fixed "00")   P10 26
//
// MZ (split memory, p.21) does NOT use this layout — it carries only
// P1(5 ch) + P2(1 split on/off) + P3(9 freq) = 15-char payload.
export const MEMORY_PAYLOAD_LEN = 27;

export interface MemoryFrame {
  channel: ChannelId;
  freqHz: number;
  clarifierHz: number;
  rxClarOn: boolean;
  txClarOn: boolean;
  mode: Mode;
  vfoMem: VfoMemState;
  ctcssState: CtcssState;
  shift: Shift;
}

export function encodeMemoryPayload(f: MemoryFrame): string {
  const p1 = encodeChannelId(f.channel);
  const p2 = encodeFreq(f.freqHz);
  const p3 = encodeClarifier(f.clarifierHz);
  const p4 = f.rxClarOn ? "1" : "0";
  const p5 = f.txClarOn ? "1" : "0";
  const p6 = modeToChar(f.mode);
  const p7 = vfoMemToChar(f.vfoMem);
  const p8 = ctcssStateToChar(f.ctcssState);
  const p9 = "00";
  const p10 = shiftToChar(f.shift);
  const out = p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p10;
  if (out.length !== MEMORY_PAYLOAD_LEN) {
    throw new Error(`Encoded payload wrong length: ${out.length} (expected ${MEMORY_PAYLOAD_LEN})`);
  }
  return out;
}

// Decode a single "0"/"1" boolean field, rejecting anything else (BFT N11:
// previously any non-"1" char silently decoded as false).
function decodeBoolField(c: string, name: string): boolean {
  if (c !== "0" && c !== "1") {
    throw new Error(`${name} must be '0' or '1', got ${JSON.stringify(c)}`);
  }
  return c === "1";
}

export function decodeMemoryPayload(s: string): MemoryFrame {
  if (s.length !== MEMORY_PAYLOAD_LEN) {
    throw new Error(
      `Memory payload must be ${MEMORY_PAYLOAD_LEN} chars, got ${s.length}: ${JSON.stringify(s)}`,
    );
  }
  // P9 (s[24..25]) is fixed "00" per manual — validate it instead of ignoring
  // (BFT N12), so a mis-aligned/garbled frame is caught rather than parsed.
  const p9 = s.slice(24, 26);
  if (p9 !== "00") {
    throw new Error(`Memory payload P9 must be "00", got ${JSON.stringify(p9)} (manual p.18)`);
  }
  return {
    channel: decodeChannelId(s.slice(0, 5)),
    freqHz: decodeFreq(s.slice(5, 14)),
    clarifierHz: decodeClarifier(s.slice(14, 19)),
    rxClarOn: decodeBoolField(s[19], "P4 (RX clarifier)"),
    txClarOn: decodeBoolField(s[20], "P5 (TX clarifier)"),
    mode: modeFromChar(s[21]),
    vfoMem: vfoMemFromChar(s[22]),
    ctcssState: ctcssStateFromChar(s[23]),
    shift: shiftFromChar(s[26]),
  };
}

// ---- MZ split-memory payload (manual p.21). 15-char payload after "MZ":
//   P1×5 (channel) | P2×1 (split on/off) | P3×9 (split TX frequency Hz)
// Read form on the wire is "MZ" + channel(5); the Answer (and Set) carry the
// full 15-char payload. Distinct from the 27-char IF/OI/MR/MW layout.
export const SPLIT_MEMORY_PAYLOAD_LEN = 15;

export interface SplitMemoryFrame {
  channel: ChannelId;
  splitOn: boolean;
  freqHz: number; // split TX frequency
}

export function encodeSplitMemoryPayload(f: SplitMemoryFrame): string {
  const p1 = encodeChannelId(f.channel);
  const p2 = f.splitOn ? "1" : "0";
  const p3 = encodeFreq(f.freqHz);
  const out = p1 + p2 + p3;
  if (out.length !== SPLIT_MEMORY_PAYLOAD_LEN) {
    throw new Error(
      `Encoded split payload wrong length: ${out.length} (expected ${SPLIT_MEMORY_PAYLOAD_LEN})`,
    );
  }
  return out;
}

export function decodeSplitMemoryPayload(s: string): SplitMemoryFrame {
  if (s.length !== SPLIT_MEMORY_PAYLOAD_LEN) {
    throw new Error(
      `Split memory payload must be ${SPLIT_MEMORY_PAYLOAD_LEN} chars, got ${s.length}: ${JSON.stringify(s)}`,
    );
  }
  const p2 = s[5];
  if (p2 !== "0" && p2 !== "1") {
    throw new Error(`Split on/off (P2) must be '0' or '1', got ${JSON.stringify(p2)}`);
  }
  return {
    channel: decodeChannelId(s.slice(0, 5)),
    splitOn: p2 === "1",
    freqHz: decodeFreq(s.slice(6, 15)),
  };
}
