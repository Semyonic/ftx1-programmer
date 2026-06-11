// Channel CSV import/export. Columns mirror common amateur-radio programmer
// software layout, adapted for FTX-1 fields.

import {
  ChannelId,
  FREQ_MAX_HZ,
  FREQ_MIN_HZ,
  MemoryFrame,
  MODE_BY_CHAR,
  validateMemoryTag,
} from "../cat/codec";
import { MemoryRow } from "../store/memory";

const HEADERS = [
  "Channel",
  "Tag",
  "FrequencyHz",
  "Mode",
  "ClarifierHz",
  "RXClar",
  "TXClar",
  "Shift",
  "CTCSS",
  "VFOMem",
];

const channelLabel = (id: ChannelId): string => {
  switch (id.kind) {
    case "vfo":
      return "VFO";
    case "memory":
      return id.n.toString();
    case "pms":
      return `P-${id.n.toString().padStart(2, "0")}${id.end}`;
    case "emergency":
      return "EMGCH";
  }
};

function escapeCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const CSV_HEADERS = HEADERS;

export function rowsToCsv(rows: MemoryRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    if (!row.frame) continue;
    const f = row.frame;
    const cells = [
      channelLabel(row.id),
      row.tag,
      f.freqHz.toString(),
      f.mode,
      f.clarifierHz.toString(),
      f.rxClarOn ? "1" : "0",
      f.txClarOn ? "1" : "0",
      f.shift,
      f.ctcssState,
      f.vfoMem,
    ];
    lines.push(cells.map(escapeCell).join(","));
  }
  return lines.join("\n");
}

export interface CsvRow {
  channel: string;
  tag: string;
  freqHz: number;
  mode: string; // validated against VALID_MODES; consumer should cast to Mode after checking .error
  clarifierHz: number;
  rxClarOn: boolean;
  txClarOn: boolean;
  shift: MemoryFrame["shift"];
  ctcssState: string; // validated string; consumer should cast to CtcssState after checking .error
  vfoMem: string; // validated string; consumer should cast to VfoMemState after checking .error
  /** Non-null when the row fails validation; should be shown as an error, not marked dirty. */
  error?: string;
}

const VALID_MODES: Set<string> = new Set(Object.values(MODE_BY_CHAR));

/** Validate a parsed CSV row against codec constraints. Returns an error string or null. */
function validateCsvRow(row: CsvRow): string | null {
  const errors: string[] = [];
  if (!Number.isFinite(row.freqHz) || row.freqHz < FREQ_MIN_HZ || row.freqHz > FREQ_MAX_HZ) {
    errors.push(`frequency ${row.freqHz} Hz out of range ${FREQ_MIN_HZ}..${FREQ_MAX_HZ}`);
  }
  if (!VALID_MODES.has(row.mode)) {
    errors.push(`invalid mode "${row.mode}"`);
  }
  try {
    validateMemoryTag(row.tag);
  } catch (e) {
    errors.push((e as Error).message);
  }
  return errors.length > 0 ? errors.join("; ") : null;
}

export function csvToRows(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 1) return [];
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);
  const out: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const shiftRaw = cells[idx("Shift")];
    const shift: MemoryFrame["shift"] =
      shiftRaw === "plus" || shiftRaw === "minus" ? shiftRaw : "simplex";
    const row: CsvRow = {
      channel: cells[idx("Channel")],
      tag: cells[idx("Tag")] ?? "",
      freqHz: Number(cells[idx("FrequencyHz")]),
      mode: cells[idx("Mode")],
      clarifierHz: Number(cells[idx("ClarifierHz")] || "0"),
      rxClarOn: cells[idx("RXClar")] === "1",
      txClarOn: cells[idx("TXClar")] === "1",
      shift,
      ctcssState: cells[idx("CTCSS")] || "OFF",
      vfoMem: cells[idx("VFOMem")] || "Memory",
    };
    const err = validateCsvRow(row);
    if (err) row.error = err;
    out.push(row);
  }
  return out;
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
  return out;
}
