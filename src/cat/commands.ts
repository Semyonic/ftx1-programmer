// Typed CAT command builders/parsers and high-level wrappers.
// Source: FTX-1_CAT_OM_JPN_2512-D.pdf. Page numbers in comments.

import { CatTransport } from "./transport";
import {
  ChannelId,
  MemoryFrame,
  SplitMemoryFrame,
  decodeChannelId,
  decodeFreq,
  decodeMemoryPayload,
  decodeSplitMemoryPayload,
  encodeChannelId,
  encodeFreq,
  encodeMemoryPayload,
  encodeSplitMemoryPayload,
  modeToChar,
  modeFromChar,
  validateMemoryTag,
} from "./codec";

export type Side = "main" | "sub";
export const sideChar = (s: Side): "0" | "1" => (s === "main" ? "0" : "1");
export const sideFrom = (c: string): Side => (c === "0" ? "main" : c === "1" ? "sub" : (() => {
  throw new Error(`Invalid side char ${JSON.stringify(c)}`);
})());

// ---- ID — Identification (read fixed "0840"). p.18 ----
export async function readId(t: CatTransport): Promise<string> {
  const r = await t.query("ID");
  // Answer: ID + 4 chars + ;
  if (r.length !== 6) throw new Error(`ID reply wrong length: ${r}`);
  return r.slice(2);
}

// ---- VE — Firmware version. p.26 ----
export type VeSlot = 0 | 1 | 2 | 3 | 4 | 5;
export async function readFirmwareVersion(t: CatTransport, slot: VeSlot = 0): Promise<string> {
  const r = await t.query(`VE${slot}`);
  // Answer: VE + slot + version (5 chars, e.g. "01-08") + ;
  return r.slice(3);
}

// ---- AI — Auto Information on/off. p.7 ----
export async function setAutoInfo(t: CatTransport, on: boolean): Promise<void> {
  await t.send(`AI${on ? "1" : "0"}`);
}
export async function readAutoInfo(t: CatTransport): Promise<boolean> {
  const r = await t.query("AI");
  return r[2] === "1";
}

// ---- FA / FB — VFO frequency, MAIN / SUB. p.17 ----
export async function setVfoMain(t: CatTransport, hz: number): Promise<void> {
  await t.send(`FA${encodeFreq(hz)}`);
}
export async function readVfoMain(t: CatTransport): Promise<number> {
  const r = await t.query("FA");
  return decodeFreq(r.slice(2, 11));
}
export async function setVfoSub(t: CatTransport, hz: number): Promise<void> {
  await t.send(`FB${encodeFreq(hz)}`);
}
export async function readVfoSub(t: CatTransport): Promise<number> {
  const r = await t.query("FB");
  return decodeFreq(r.slice(2, 11));
}

// ---- MD — Operating mode. p.20 ----
export async function setMode(t: CatTransport, side: Side, mode: string): Promise<void> {
  await t.send(`MD${sideChar(side)}${modeToChar(mode)}`);
}
export async function readMode(t: CatTransport, side: Side): Promise<string> {
  const r = await t.query(`MD${sideChar(side)}`);
  // Answer: MD + side + mode = 4 chars
  return modeFromChar(r[3]);
}

// ---- IF — Information VFO MAIN-side (read-only). p.18 ----
// Answer: IF + 27-char payload + ; → memory frame.
export async function readInfo(t: CatTransport): Promise<MemoryFrame> {
  const r = await t.query("IF");
  return decodeMemoryPayload(r.slice(2));
}

// ---- OI — Opposite band info (SUB-side, read-only). p.21 ----
export async function readSubInfo(t: CatTransport): Promise<MemoryFrame> {
  const r = await t.query("OI");
  return decodeMemoryPayload(r.slice(2));
}

// ---- MR — Memory channel read. p.20 ----
export async function readMemory(t: CatTransport, ch: ChannelId): Promise<MemoryFrame> {
  const r = await t.query(`MR${encodeChannelId(ch)}`);
  return decodeMemoryPayload(r.slice(2));
}

// ---- MW — Memory channel write. p.21 ----
// Set: MW + 27-char payload + ; — same layout as MR Answer.
export async function writeMemory(t: CatTransport, frame: MemoryFrame): Promise<void> {
  await t.send(`MW${encodeMemoryPayload(frame)}`);
}

// ---- MZ — Split memory (per-channel split TX frequency). p.21 ----
// Set:    MZ + 5-char channel + split(1) + 9-char freq + ;
// Read:   MZ + 5-char channel + ;  → Answer carries the 15-char payload.
export async function writeSplitMemory(
  t: CatTransport,
  frame: SplitMemoryFrame,
): Promise<void> {
  await t.send(`MZ${encodeSplitMemoryPayload(frame)}`);
}
export async function readSplitMemory(
  t: CatTransport,
  ch: ChannelId,
): Promise<SplitMemoryFrame> {
  const r = await t.query(`MZ${encodeChannelId(ch)}`);
  return decodeSplitMemoryPayload(r.slice(2));
}

// ---- MT — Memory channel tag write. p.20 ----
// Set: MT + 5-char channel + 12-char tag (space-padded) + ;
export async function writeMemoryTag(
  t: CatTransport,
  ch: ChannelId,
  tag: string,
): Promise<void> {
  validateMemoryTag(tag);
  const padded = tag.padEnd(12, " ");
  await t.send(`MT${encodeChannelId(ch)}${padded}`);
}
export async function readMemoryTag(t: CatTransport, ch: ChannelId): Promise<string> {
  const r = await t.query(`MT${encodeChannelId(ch)}`);
  // Answer: MT + 5-char chan + 12-char tag
  return r.slice(7, 19).trimEnd();
}

// ---- MC — Memory channel select. p.19 ----
export async function selectMemoryChannel(
  t: CatTransport,
  side: Side,
  ch: ChannelId,
): Promise<void> {
  await t.send(`MC${sideChar(side)}${encodeChannelId(ch)}`);
}
export async function readSelectedMemoryChannel(
  t: CatTransport,
  side: Side,
): Promise<ChannelId> {
  const r = await t.query(`MC${sideChar(side)}`);
  return decodeChannelId(r.slice(3, 8));
}

// ---- AB — MAIN→SUB copy / BA — SUB→MAIN copy / SV — swap. pp.7, 8, 25 ----
export const copyMainToSub = (t: CatTransport) => t.send("AB");
export const copySubToMain = (t: CatTransport) => t.send("BA");
export const swapVfo = (t: CatTransport) => t.send("SV");

// ---- AM — MAIN→memory copy / BM — SUB→memory copy. p.7, p.8 ----
export const copyMainToMemory = (t: CatTransport) => t.send("AM");
export const copySubToMemory = (t: CatTransport) => t.send("BM");

// ---- ST — Split on/off. p.25 ----
export async function setSplit(t: CatTransport, on: boolean): Promise<void> {
  await t.send(`ST${on ? "1" : "0"}`);
}
export async function readSplit(t: CatTransport): Promise<boolean> {
  const r = await t.query("ST");
  return r[2] === "1";
}

// ---- LK — Lock. p.19 ----
export async function setLock(t: CatTransport, on: boolean): Promise<void> {
  await t.send(`LK${on ? "1" : "0"}`);
}
export async function readLock(t: CatTransport): Promise<boolean> {
  const r = await t.query("LK");
  return r[2] === "1";
}

// ---- SM — S-meter. p.24 ----
export async function readSMeter(t: CatTransport, side: Side): Promise<number> {
  const r = await t.query(`SM${sideChar(side)}`);
  // Answer: SM + side + 4 digits (000..255 maps to S0..S9+)
  return parseInt(r.slice(3, 7), 10);
}

// ---- KS — Key speed (CW WPM). p.19 ----
export async function setKeySpeed(t: CatTransport, wpm: number): Promise<void> {
  if (!Number.isInteger(wpm) || wpm < 4 || wpm > 60) {
    throw new Error(`KS WPM must be 4..60 (manual p.19), got ${wpm}`);
  }
  await t.send(`KS${wpm.toString().padStart(3, "0")}`);
}
export async function readKeySpeed(t: CatTransport): Promise<number> {
  const r = await t.query("KS");
  return parseInt(r.slice(2, 5), 10);
}

// ---- KP — Key pitch frequency. p.18 ----
export async function setKeyPitch(t: CatTransport, idx: number): Promise<void> {
  if (!Number.isInteger(idx) || idx < 0 || idx > 75) {
    throw new Error(`KP index must be 0..75 (300..1050 Hz, 10 Hz step, manual p.18), got ${idx}`);
  }
  await t.send(`KP${idx.toString().padStart(2, "0")}`);
}
export async function readKeyPitch(t: CatTransport): Promise<number> {
  const r = await t.query("KP");
  return parseInt(r.slice(2, 4), 10);
}

// ---- KR — Keyer on/off. p.19 ----
export async function setKeyer(t: CatTransport, on: boolean): Promise<void> {
  await t.send(`KR${on ? "1" : "0"}`);
}
export async function readKeyer(t: CatTransport): Promise<boolean> {
  const r = await t.query("KR");
  return r[2] === "1";
}

// ---- KM — Keyer memory text. p.18 ----
// Set: KM + ch(1) + text(≤50) + '}' + ;
const KM_TEXT_TERMINATOR = "}";
export async function writeKeyerMemory(
  t: CatTransport,
  ch: number,
  text: string,
): Promise<void> {
  if (!Number.isInteger(ch) || ch < 1 || ch > 5) {
    throw new Error(`KM channel must be 1..5 (manual p.18), got ${ch}`);
  }
  if (text.length > 50) {
    throw new Error(`KM text must be ≤ 50 chars (manual p.18), got ${text.length}`);
  }
  if (text.includes(KM_TEXT_TERMINATOR) || text.includes(";")) {
    throw new Error(`KM text must not contain '}' or ';'`);
  }
  await t.send(`KM${ch}${text}${KM_TEXT_TERMINATOR}`);
}
export async function readKeyerMemory(t: CatTransport, ch: number): Promise<string> {
  const r = await t.query(`KM${ch}`);
  // Answer: KM + ch + text + '}' (no ';' in body)
  const body = r.slice(3);
  const end = body.indexOf(KM_TEXT_TERMINATOR);
  return end >= 0 ? body.slice(0, end) : body;
}

// ---- BI — Break-in on/off. p.8 ----
export async function setBreakIn(t: CatTransport, on: boolean): Promise<void> {
  await t.send(`BI${on ? "1" : "0"}`);
}
export async function readBreakIn(t: CatTransport): Promise<boolean> {
  const r = await t.query("BI");
  return r[2] === "1";
}

// ---- AG — AF gain. p.7 ----
export async function setAfGain(t: CatTransport, side: Side, level: number): Promise<void> {
  if (!Number.isInteger(level) || level < 0 || level > 255) {
    throw new Error(`AG level must be 0..255 (manual p.7), got ${level}`);
  }
  await t.send(`AG${sideChar(side)}${level.toString().padStart(3, "0")}`);
}
export async function readAfGain(t: CatTransport, side: Side): Promise<number> {
  const r = await t.query(`AG${sideChar(side)}`);
  return parseInt(r.slice(3, 6), 10);
}

// ---- SQ — Squelch level. p.24 ----
export async function setSquelch(t: CatTransport, side: Side, level: number): Promise<void> {
  if (!Number.isInteger(level) || level < 0 || level > 255) {
    throw new Error(`SQ level must be 0..255 (manual p.24), got ${level}`);
  }
  await t.send(`SQ${sideChar(side)}${level.toString().padStart(3, "0")}`);
}
export async function readSquelch(t: CatTransport, side: Side): Promise<number> {
  const r = await t.query(`SQ${sideChar(side)}`);
  return parseInt(r.slice(3, 6), 10);
}

// ---- DESTRUCTIVE: PS — Power switch / TX — TX-on/off / MX — MOX. ----
// These wrappers require an explicit `armed` flag to avoid accidental fire.
// Manual: PS p.22, TX p.25, MX p.21.
export interface ArmedFlag {
  readonly armed: true;
}

export async function powerOff(t: CatTransport, armed: ArmedFlag): Promise<void> {
  if (!armed.armed) throw new Error("powerOff requires armed flag");
  await t.send("PS0");
}
export async function setTx(t: CatTransport, on: boolean, armed: ArmedFlag): Promise<void> {
  if (!armed.armed) throw new Error("setTx requires armed flag");
  await t.send(`TX${on ? "1" : "0"}`);
}
export async function setMox(t: CatTransport, on: boolean, armed: ArmedFlag): Promise<void> {
  if (!armed.armed) throw new Error("setMox requires armed flag");
  await t.send(`MX${on ? "1" : "0"}`);
}

// ---- EX — Menu set/read. p.10 ----
// EX P1(2) P2(2) P3(2) [P4(n)] ; — variable-length P4.
export async function readMenu(
  t: CatTransport,
  p1: number,
  p2: number,
  p3: number,
): Promise<string> {
  const body = `EX${pad2(p1)}${pad2(p2)}${pad2(p3)}`;
  const r = await t.query(body);
  return r.slice(2 + 2 + 2 + 2); // strip "EX" + P1 + P2 + P3
}

export async function writeMenu(
  t: CatTransport,
  p1: number,
  p2: number,
  p3: number,
  p4: string,
): Promise<void> {
  await t.send(`EX${pad2(p1)}${pad2(p2)}${pad2(p3)}${p4}`);
}

function pad2(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new Error(`pad2: ${n} out of 0..99`);
  return n.toString().padStart(2, "0");
}

// ---- CN — CTCSS tone / DCS code select. p.9 ----
export async function setCtcssTone(
  t: CatTransport,
  side: Side,
  toneIdx: number,
): Promise<void> {
  if (!Number.isInteger(toneIdx) || toneIdx < 0 || toneIdx > 49) throw new Error(`CTCSS idx must be integer 0..49 (manual p.9), got ${toneIdx}`);
  await t.send(`CN${sideChar(side)}0${toneIdx.toString().padStart(3, "0")}`);
}
export async function readCtcssTone(t: CatTransport, side: Side): Promise<number> {
  const r = await t.query(`CN${sideChar(side)}0`);
  // Answer: CN P1 P2 P3 P3 P3 — value at positions 4..7
  return parseInt(r.slice(4, 7), 10);
}
export async function setDcsCode(
  t: CatTransport,
  side: Side,
  dcsIdx: number,
): Promise<void> {
  if (!Number.isInteger(dcsIdx) || dcsIdx < 0 || dcsIdx > 103) throw new Error(`DCS idx must be integer 0..103 (manual p.9), got ${dcsIdx}`);
  await t.send(`CN${sideChar(side)}1${dcsIdx.toString().padStart(3, "0")}`);
}
export async function readDcsCode(t: CatTransport, side: Side): Promise<number> {
  const r = await t.query(`CN${sideChar(side)}1`);
  return parseInt(r.slice(4, 7), 10);
}

// ---- CT — SQL type. p.10 ----
export type SqlType = "OFF" | "CTCSS_ENC_DEC" | "CTCSS_ENC" | "DCS" | "PR_FREQ" | "REV_TONE";
const SQL_CODES: Record<SqlType, string> = {
  OFF: "0",
  CTCSS_ENC_DEC: "1",
  CTCSS_ENC: "2",
  DCS: "3",
  PR_FREQ: "4",
  REV_TONE: "5",
};
export async function setSqlType(t: CatTransport, side: Side, type: SqlType): Promise<void> {
  await t.send(`CT${sideChar(side)}${SQL_CODES[type]}`);
}
export async function readSqlType(t: CatTransport, side: Side): Promise<SqlType> {
  const r = await t.query(`CT${sideChar(side)}`);
  const code = r[3];
  for (const [k, v] of Object.entries(SQL_CODES)) {
    if (v === code) return k as SqlType;
  }
  throw new Error(`Unknown SQL type code: ${code}`);
}

// ---- OS — Repeater shift (FM only). p.22 ----
// P2: 0=simplex, 1=plus, 2=minus, 3=ARS (auto repeater shift).
export type RepeaterShift = "simplex" | "plus" | "minus" | "ars";
const REPEATER_SHIFT_CODES: Record<RepeaterShift, "0" | "1" | "2" | "3"> = {
  simplex: "0",
  plus: "1",
  minus: "2",
  ars: "3",
};
export async function setRepeaterShift(
  t: CatTransport,
  side: Side,
  shift: RepeaterShift,
): Promise<void> {
  await t.send(`OS${sideChar(side)}${REPEATER_SHIFT_CODES[shift]}`);
}
export async function readRepeaterShift(t: CatTransport, side: Side): Promise<RepeaterShift> {
  const r = await t.query(`OS${sideChar(side)}`);
  // Answer: OS + P1(side) + P2(code).
  const code = r[3];
  for (const [k, v] of Object.entries(REPEATER_SHIFT_CODES)) {
    if (v === code) return k as RepeaterShift;
  }
  throw new Error(`Unknown repeater shift code ${JSON.stringify(code)}`);
}

// ---- PA — Pre-amp / IPO. p.22 ----
// P1: 0=HF/50, 1=VHF, 2=UHF; P2: 0=IPO, 1=AMP1, 2=AMP2 (HF) or 0/1 OFF/ON (V/UHF).
export async function setPreamp(
  t: CatTransport,
  band: 0 | 1 | 2,
  level: 0 | 1 | 2,
): Promise<void> {
  // HF/50 (band 0) has IPO/AMP1/AMP2 (0..2); VHF/UHF (band 1/2) are OFF/ON only
  // (0..1) per manual p.22 (BFT N19).
  const maxLevel = band === 0 ? 2 : 1;
  if (!Number.isInteger(level) || level < 0 || level > maxLevel) {
    throw new Error(`PA level ${level} invalid for band ${band} (allowed 0..${maxLevel}, manual p.22)`);
  }
  await t.send(`PA${band}${level}`);
}
export async function readPreamp(t: CatTransport, band: 0 | 1 | 2): Promise<number> {
  const r = await t.query(`PA${band}`);
  // Answer: PA + P1(band) + P2(level).
  return parseInt(r.slice(3, 4), 10);
}

// ---- RA — RF attenuator (HF/50, MAIN only). p.23 ----
export async function setAttenuator(t: CatTransport, on: boolean): Promise<void> {
  await t.send(`RA0${on ? "1" : "0"}`);
}
export async function readAttenuator(t: CatTransport): Promise<boolean> {
  const r = await t.query("RA0");
  // Answer: RA + P1(0) + P2(on/off).
  return r[3] === "1";
}

// ---- NA — Narrow IF. p.21 ----
export async function setNarrow(t: CatTransport, side: Side, on: boolean): Promise<void> {
  await t.send(`NA${sideChar(side)}${on ? "1" : "0"}`);
}
export async function readNarrow(t: CatTransport, side: Side): Promise<boolean> {
  const r = await t.query(`NA${sideChar(side)}`);
  // Answer: NA + P1(side) + P2(on/off).
  return r[3] === "1";
}

// ---- DT — Date / time. p.10 ----
// P1=0 date yyyymmdd, P1=1 time hhmmss (24h).
export async function setDate(t: CatTransport, yyyy: number, mm: number, dd: number): Promise<void> {
  if (!Number.isInteger(yyyy) || yyyy < 2000 || yyyy > 2099) {
    throw new Error(`DT year must be 2000..2099, got ${yyyy}`);
  }
  if (!Number.isInteger(mm) || mm < 1 || mm > 12) {
    throw new Error(`DT month must be 1..12, got ${mm}`);
  }
  if (!Number.isInteger(dd) || dd < 1 || dd > 31) {
    throw new Error(`DT day must be 1..31, got ${dd}`);
  }
  const s = `${yyyy.toString().padStart(4, "0")}${pad2(mm)}${pad2(dd)}`;
  await t.send(`DT0${s}`);
}
export async function setTime(t: CatTransport, hh: number, mm: number, ss: number): Promise<void> {
  if (!Number.isInteger(hh) || hh < 0 || hh > 23) {
    throw new Error(`DT hour must be 0..23, got ${hh}`);
  }
  if (!Number.isInteger(mm) || mm < 0 || mm > 59) {
    throw new Error(`DT minute must be 0..59, got ${mm}`);
  }
  if (!Number.isInteger(ss) || ss < 0 || ss > 59) {
    throw new Error(`DT second must be 0..59, got ${ss}`);
  }
  const s = `${pad2(hh)}${pad2(mm)}${pad2(ss)}`;
  await t.send(`DT1${s}`);
}
