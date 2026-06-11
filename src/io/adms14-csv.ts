// Importer for Yaesu ADMS-14 (FT5DR/DE) memory-channel CSV exports.
// Header / value reference: ADMS-14 Instruction Manual pp.19-21 and on-screen
// Memories template (p.7).
//
// FTX-1's MR/MW frame stores per-channel: freq, mode, clarifier, CTCSS *state*,
// shift *direction*. CTCSS tone Hz and DCS code are not in the frame — they are
// applied per-channel by issuing CN<idx>; before MW; (the radio captures the
// active side's tone into the channel at write time). The importer carries
// pendingToneIdx / pendingDcsIdx so the writer can do the CN preamble.
//
// Truly FT5D-only fields with no FTX-1 equivalent: Tx Power per-channel, Skip,
// AUTO STEP / Step, Memory Mask, ATT, S Meter SQL, Bell, Narrow per-channel,
// Clock Shift, BANK 1..24, Comment. These are silently dropped.

import {
  ChannelId,
  MemoryFrame,
  ctcssHzToIndex,
  dcsCodeToIndex,
  type Mode,
  type CtcssState,
} from "../cat/codec";

export interface Adms14ImportRecord {
  channelNo: number;
  channel: ChannelId;
  frame: MemoryFrame;
  tag: string;
  pendingToneIdx?: number; // CN0 idx to send before MW when state = CTCSS*
  pendingDcsIdx?: number; // CN1 idx to send before MW when state = DCS
}

export interface Adms14ImportResult {
  records: Adms14ImportRecord[];
  unmappedColumns: string[];
  skippedRows: number;
  warnings: string[];
}

const REQUIRED_HEADERS = [
  "Receive Frequency",
  "DIG/ANALOG",
  "Offset Direction",
  "Tone Mode",
];

export function isAdms14Csv(headerLine: string): boolean {
  const lower = headerLine.toLowerCase();
  return REQUIRED_HEADERS.every((h) => lower.includes(h.toLowerCase()));
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"' && cur.length === 0) {
        inQ = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const mapMode = (operating: string, digAnalog: string): Mode => {
  // p.20: Operating Mode = FM / AM; DIG/ANALOG = AMS / DN / VW / ANALOG.
  const da = digAnalog.toUpperCase();
  if (da === "AMS" || da === "DN" || da === "V/D" || da === "VD") return "C4FM-DN";
  if (da === "VW" || da === "VOICE FR") return "C4FM-VW";
  // ANALOG (or empty / FM) — fall back to operating mode.
  const op = operating.toUpperCase();
  if (op === "AM") return "AM";
  return "FM";
};

const mapShift = (dir: string): MemoryFrame["shift"] => {
  // p.20: OFF / -RPT / +RPT / -/+. We ignore the alternating "-/+" mode and
  // treat it as simplex; user can edit per-channel.
  const u = dir.toUpperCase();
  if (u === "+RPT" || u === "+") return "plus";
  if (u === "-RPT" || u === "-") return "minus";
  return "simplex";
};

const mapToneState = (toneMode: string): CtcssState => {
  // ADMS Tone Mode values: OFF / TONE / TONE SQL / DCS / REV TONE / USER CTCSS.
  const u = toneMode.toUpperCase();
  if (u === "TONE") return "CTCSS ENC";
  if (u === "TONE SQL" || u === "TSQ") return "CTCSS ENC/DEC";
  if (u === "DCS") return "DCS";
  if (u === "REV TONE") return "REV TONE";
  if (u === "USER CTCSS" || u === "PR FREQ") return "PR FREQ";
  return "OFF";
};

const parseFreqMHz = (s: string): number | null => {
  // ADMS prints freq as 145.00000 (MHz). Empty cell = no frequency.
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1_000_000);
};

const channelForRow = (channelNo: number): ChannelId | null => {
  // FTX-1 has 99 standard memory channels. ADMS supports up to 900; we map
  // 1..99 directly and drop the rest with a warning.
  if (!Number.isInteger(channelNo) || channelNo < 1) return null;
  if (channelNo > 99) return null;
  return { kind: "memory", n: channelNo };
};

export function parseAdms14Csv(text: string): Adms14ImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { records: [], unmappedColumns: [], skippedRows: 0, warnings: ["empty file"] };
  }
  const header = parseCsvLine(lines[0]);
  if (!isAdms14Csv(lines[0])) {
    return {
      records: [],
      unmappedColumns: [],
      skippedRows: 0,
      warnings: ["file header does not look like an ADMS-14 export"],
    };
  }
  const idx = (name: string) => header.findIndex((h) => h.trim() === name);

  const col = {
    channelNo: idx("Channel No"),
    rxFreq: idx("Receive Frequency"),
    txFreq: idx("Transmit Frequency"),
    offsetDir: idx("Offset Direction"),
    operating: idx("Operating Mode"),
    digAnalog: idx("DIG/ANALOG"),
    name: idx("Name"),
    toneMode: idx("Tone Mode"),
    ctcssFreq: idx("CTCSS Frequency"),
    dcsCode: idx("DCS Code"),
  };

  const knownHeaders = new Set([
    "Channel No",
    "Priority CH",
    "Receive Frequency",
    "Transmit Frequency",
    "Offset Frequency",
    "Offset Direction",
    "AUTO MODE",
    "Operating Mode",
    "DIG/ANALOG",
    "TAG",
    "Name",
    "Tone Mode",
    "CTCSS Frequency",
    "DCS Code",
    "DCS Polarity",
    "User CTCSS",
    "RX DG-ID",
    "TX DG-ID",
    "Tx Power",
    "Skip",
    "AUTO STEP",
    "Step",
    "Memory Mask",
    "ATT",
    "S Meter SQL",
    "Bell",
    "Narrow",
    "Clock Shift",
    "Comment",
    "Check",
    ...Array.from({ length: 24 }, (_, i) => `BANK ${i + 1}`),
  ]);
  const unmappedColumns = header.filter((h) => h && !knownHeaders.has(h.trim()));

  const records: Adms14ImportRecord[] = [];
  let skipped = 0;
  const warnings: string[] = [];
  let droppedHigh = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.every((c) => c === "")) continue;

    // Safe cell access: a truncated row (fewer columns than the header) must not
    // crash on cells[idx].trim()/.toUpperCase() (BFT N16) — return "" instead.
    const cell = (c: number): string => (c >= 0 ? cells[c] ?? "" : "");

    const chNum = col.channelNo >= 0 ? Number(cell(col.channelNo)) : i;
    const channel = channelForRow(chNum);
    if (!channel) {
      if (chNum > 99) droppedHigh++;
      else skipped++;
      continue;
    }
    const rxHz = col.rxFreq >= 0 ? parseFreqMHz(cell(col.rxFreq)) : null;
    if (rxHz === null) {
      // Empty channel row — skip rather than zero out.
      skipped++;
      continue;
    }

    const operating = cell(col.operating);
    const digAnalog = cell(col.digAnalog);
    const dir = col.offsetDir >= 0 ? cell(col.offsetDir) : "OFF";
    const toneMode = cell(col.toneMode);
    const name = cell(col.name);
    const shift = mapShift(dir);

    const txHz = col.txFreq >= 0 ? parseFreqMHz(cell(col.txFreq)) : null;
    // FTX-1 memory stores RX freq + shift *direction*, never an arbitrary TX
    // freq. A TX freq that differs from RX with no repeater shift is an odd
    // split that cannot be represented and will be lost (BFT N18 — previously
    // gated on `col.offsetDir < 0`, which is unreachable since Offset Direction
    // is a required column).
    if (txHz !== null && txHz !== rxHz && shift === "simplex") {
      warnings.push(
        `Ch ${chNum}: independent TX freq ${txHz / 1e6} MHz with no repeater shift — FTX-1 memory stores RX freq + shift only, so this split will be lost.`,
      );
    }

    const ctcssState = mapToneState(toneMode);

    let pendingToneIdx: number | undefined;
    if (ctcssState === "CTCSS ENC" || ctcssState === "CTCSS ENC/DEC") {
      const rawCtcss = cell(col.ctcssFreq);
      if (!rawCtcss || !rawCtcss.trim()) {
        warnings.push(
          `Ch ${chNum}: Tone Mode is "${toneMode}" but CTCSS Frequency column is blank — tone index will not be set.`,
        );
      } else {
        const hz = parseFloat(rawCtcss.replace(/Hz$/i, "").trim());
        if (!Number.isFinite(hz)) {
          warnings.push(
            `Ch ${chNum}: Tone Mode is "${toneMode}" but CTCSS Frequency "${rawCtcss}" is not a valid number — tone index will not be set.`,
          );
        } else {
          try {
            pendingToneIdx = ctcssHzToIndex(hz);
          } catch {
            warnings.push(`Ch ${chNum}: CTCSS tone ${hz} Hz not in FTX-1 table.`);
          }
        }
      }
    }

    let pendingDcsIdx: number | undefined;
    if (ctcssState === "DCS") {
      const rawDcs = cell(col.dcsCode);
      if (!rawDcs || !rawDcs.trim()) {
        warnings.push(
          `Ch ${chNum}: Tone Mode is "DCS" but DCS Code column is blank — DCS index will not be set.`,
        );
      } else {
        const code = parseInt(rawDcs, 10);
        if (!Number.isFinite(code)) {
          warnings.push(
            `Ch ${chNum}: Tone Mode is "DCS" but DCS Code "${rawDcs}" is not a valid number — DCS index will not be set.`,
          );
        } else {
          try {
            pendingDcsIdx = dcsCodeToIndex(code);
          } catch {
            warnings.push(`Ch ${chNum}: DCS code ${code} not in FTX-1 table.`);
          }
        }
      }
    }

    const frame: MemoryFrame = {
      channel,
      freqHz: rxHz,
      clarifierHz: 0,
      rxClarOn: false,
      txClarOn: false,
      mode: mapMode(operating, digAnalog),
      vfoMem: "Memory",
      ctcssState,
      shift,
    };

    records.push({
      channelNo: chNum,
      channel,
      frame,
      tag: name.slice(0, 12),
      pendingToneIdx,
      pendingDcsIdx,
    });
  }

  if (droppedHigh > 0) {
    warnings.push(
      `${droppedHigh} channel${droppedHigh === 1 ? "" : "s"} above 99 dropped — FTX-1 only has 1..99.`,
    );
  }
  if (unmappedColumns.length > 0) {
    warnings.push(
      `Ignored ADMS-only fields: ${unmappedColumns.slice(0, 5).join(", ")}` +
        (unmappedColumns.length > 5 ? ` (+${unmappedColumns.length - 5} more)` : ""),
    );
  }
  warnings.push(
    "Per-channel CTCSS Hz / DCS code applied via CN before each MW write — works on FTX-1.",
  );
  warnings.push(
    "Dropped (FT5D-only, no FTX-1 equivalent): Tx Power, Skip, ATT, Narrow, Bell, Banks 1-24, Comment.",
  );

  return { records, unmappedColumns, skippedRows: skipped, warnings };
}
