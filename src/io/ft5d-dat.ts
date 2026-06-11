// Importer for Yaesu FT5D SD card MEMORY.dat binary files.
// File lives at FT5D_MEMORY-CH/MEMORY.dat on the SD card.
// Format reverse-engineered from actual SD card dump — no official spec exists.
//
// Record layout (32 bytes):
//   [0]    flags0 — mode/bank bits (not mapped to FTX-1)
//   [1]    flags1 — 0x04=simplex, 0x14=repeater, 0x00=special
//   [2..4] RX frequency, packed BCD: xxx.xxx MHz
//   [5]    shift/mode — bits 0-1: shift (0=simplex,1=minus,2=plus), bit 5: C4FM
//   [6..7] reserved (0x00)
//   [8..23] channel name, 16 chars ASCII, space/0xFF padded
//   [24]   reserved (0x00)
//   [25]   repeater offset, packed BCD ×100 kHz (0x06→600kHz, 0x76→7600kHz)
//   [26]   reserved (0x00)
//   [27]   CTCSS tone index (0..49, same table as FTX-1)
//   [28]   reserved (0x00)
//   [29]   tone/step flags (0x0C=normal, 0x0D=calling freq)
//   [30]   reserved (0x00)
//   [31]   bank/skip flags (0x00 or 0x40)

import {
  ChannelId,
  CTCSS_HZ,
  FREQ_MAX_HZ,
  FREQ_MIN_HZ,
  MEMORY_TAG_MAX,
  MemoryFrame,
  Shift,
  type Mode,
  type CtcssState,
} from "../cat/codec";
import type { Adms14ImportRecord, Adms14ImportResult } from "./adms14-csv";

export interface Ft5dImportResult extends Adms14ImportResult {
  cityMap: Map<number, string>;
}

const RECORD_SIZE = 32;
const EXPECTED_SIZE = 44160;
const CHANNEL_DATA_OFFSET = 0x1800;

export function isFt5dDat(buf: ArrayBuffer): boolean {
  return buf.byteLength === EXPECTED_SIZE;
}

function decodeBcdFreq(b0: number, b1: number, b2: number): number | null {
  const nibbles = [
    (b0 >> 4) & 0xf, b0 & 0xf,
    (b1 >> 4) & 0xf, b1 & 0xf,
    (b2 >> 4) & 0xf, b2 & 0xf,
  ];
  for (const n of nibbles) {
    if (n > 9) return null;
  }
  const mhz =
    nibbles[0] * 100 + nibbles[1] * 10 + nibbles[2] +
    nibbles[3] * 0.1 + nibbles[4] * 0.01 + nibbles[5] * 0.001;
  return Math.round(mhz * 1_000_000);
}

function decodeBcdOffset(b: number): number {
  const hi = (b >> 4) & 0xf;
  const lo = b & 0xf;
  if (hi > 9 || lo > 9) return 0;
  return (hi * 10 + lo) * 100;
}

function decodeName(view: Uint8Array, offset: number): string {
  let name = "";
  for (let i = 0; i < 16; i++) {
    const c = view[offset + 8 + i];
    if (c === 0xff || c === 0x00) break;
    if (c >= 0x20 && c <= 0x7d) name += String.fromCharCode(c);
    else if (c === 0x7e || c === 0x7f) name += " ";
    else name += " ";
  }
  return name.trimEnd();
}

const CITY_PREFIX_RE = /^(\d{1,3})-(.+)$/;

export function parseFt5dDat(buf: ArrayBuffer): Ft5dImportResult {
  if (buf.byteLength < CHANNEL_DATA_OFFSET + RECORD_SIZE) {
    return { records: [], unmappedColumns: [], skippedRows: 0, warnings: ["file too small"], cityMap: new Map() };
  }

  const view = new Uint8Array(buf);
  const totalRecords = Math.floor((buf.byteLength - CHANNEL_DATA_OFFSET) / RECORD_SIZE);

  const records: Adms14ImportRecord[] = [];
  const cityMap = new Map<number, string>();
  let skipped = 0;
  let droppedOverflow = 0;
  const warnings: string[] = [];
  const offsetsByBand = new Map<string, Set<number>>();

  for (let i = 0; i < totalRecords; i++) {
    const base = CHANNEL_DATA_OFFSET + i * RECORD_SIZE;
    const rec = view.subarray(base, base + RECORD_SIZE);

    if (rec.every((b) => b === 0xff)) continue;
    if (rec.every((b) => b === 0x00 || b === 0x03)) continue;

    const freqHz = decodeBcdFreq(rec[2], rec[3], rec[4]);
    if (freqHz === null || freqHz === 0) {
      skipped++;
      continue;
    }
    if (freqHz < FREQ_MIN_HZ || freqHz > FREQ_MAX_HZ) {
      warnings.push(`Record ${i}: freq ${freqHz / 1e6} MHz out of FTX-1 range, skipped.`);
      skipped++;
      continue;
    }

    const rawName = decodeName(view, base);

    if (records.length >= 99) {
      droppedOverflow++;
      continue;
    }

    const channelNo = records.length + 1;
    const channel: ChannelId = { kind: "memory", n: channelNo };

    const shiftBits = rec[5] & 0x03;
    const shift: Shift = shiftBits === 1 ? "minus" : shiftBits === 2 ? "plus" : "simplex";

    const isC4fm = (rec[5] & 0x20) !== 0;
    const mode: Mode = isC4fm ? "C4FM-DN" : "FM";

    const prefixMatch = rawName.match(CITY_PREFIX_RE);
    const tag = (prefixMatch ? prefixMatch[2] : rawName).slice(0, MEMORY_TAG_MAX);
    if (prefixMatch) cityMap.set(channelNo, prefixMatch[1]);

    const isRepeater = (rec[1] & 0x10) !== 0;
    const ctcssIdx = rec[27];
    const validCtcss = ctcssIdx >= 0 && ctcssIdx < CTCSS_HZ.length;

    // Byte 29 encodes tone/step flags. In observed dumps:
    //   0x0C = no tone active (normal channel)
    //   0x4C = CTCSS tone enabled
    //   0x8C = DCS enabled
    // Bit 6 (0x40) appears to be the CTCSS-tone-enable flag.
    // Without an official spec we use this heuristic; if the bit is not set,
    // we do NOT assert CTCSS even when byte 27 contains a valid tone index,
    // since index 0 (67.0 Hz) is indistinguishable from "no tone stored".
    const toneEnableBit = (rec[29] & 0x40) !== 0;

    let ctcssState: CtcssState = "OFF";
    let pendingToneIdx: number | undefined;
    if (isRepeater && validCtcss && toneEnableBit) {
      ctcssState = "CTCSS ENC/DEC";
      pendingToneIdx = ctcssIdx;
    } else if (isRepeater && validCtcss && ctcssIdx > 0 && !toneEnableBit) {
      // Non-zero tone index but enable bit not set — ambiguous. Log a warning
      // but default to OFF to avoid false positives.
      warnings.push(
        `Record ${i} (${rawName}): tone index ${ctcssIdx} (${CTCSS_HZ[ctcssIdx]} Hz) present but tone-enable bit not set; defaulting CTCSS to OFF.`,
      );
    }

    const offsetKhz = decodeBcdOffset(rec[25]);
    if (offsetKhz > 0 && shift !== "simplex") {
      const bandKey = freqHz >= 400_000_000 ? "430MHz" : freqHz >= 140_000_000 ? "144MHz" :
        freqHz >= 50_000_000 ? "50MHz" : freqHz >= 28_000_000 ? "28MHz" : "HF";
      if (!offsetsByBand.has(bandKey)) offsetsByBand.set(bandKey, new Set());
      offsetsByBand.get(bandKey)!.add(offsetKhz);
    }

    const frame: MemoryFrame = {
      channel,
      freqHz,
      clarifierHz: 0,
      rxClarOn: false,
      txClarOn: false,
      mode,
      vfoMem: "Memory",
      ctcssState,
      shift,
    };

    records.push({
      channelNo,
      channel,
      frame,
      tag,
      pendingToneIdx,
      pendingDcsIdx: undefined,
    });
  }

  if (droppedOverflow > 0) {
    warnings.push(
      `${droppedOverflow} channel${droppedOverflow === 1 ? "" : "s"} beyond 99 dropped — FTX-1 has 1..99.`,
    );
  }

  if (isC4fmPresent(records)) {
    warnings.push("C4FM channels mapped to C4FM-DN. FT5D binary does not distinguish DN vs VW.");
  }

  for (const [band, offsets] of offsetsByBand) {
    const vals = [...offsets].map((k) => `${k} kHz`).join(", ");
    warnings.push(`${band} repeater offsets found: ${vals}. Set via Settings > RADIO SETTING > MODE FM.`);
  }

  warnings.push(
    "CTCSS set to ENC/DEC only for repeater channels with tone-enable flag set (byte 29 bit 6). " +
    "Channels without the flag default to OFF even if a tone index is stored.",
  );

  return { records, unmappedColumns: [], skippedRows: skipped, warnings, cityMap };
}

function isC4fmPresent(records: Adms14ImportRecord[]): boolean {
  return records.some((r) => r.frame.mode.startsWith("C4FM"));
}
