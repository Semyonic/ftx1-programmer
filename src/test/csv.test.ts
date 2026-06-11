// CSV round-trip and validation tests for src/io/csv.ts.

import { describe, expect, it } from "vitest";
import { csvToRows, CSV_HEADERS, rowsToCsv } from "../io/csv";
import type { MemoryRow } from "../store/memory";
import type { ChannelId, MemoryFrame } from "../cat/codec";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a MemoryRow with a populated frame for round-trip testing. */
function makeRow(
  id: ChannelId,
  tag: string,
  frame: MemoryFrame,
): MemoryRow {
  const key =
    id.kind === "memory"
      ? `m${id.n.toString().padStart(3, "0")}`
      : id.kind === "pms"
        ? `p${id.n.toString().padStart(2, "0")}${id.end}`
        : id.kind === "vfo"
          ? "vfo"
          : "emg";
  return { id, key, frame, tag, dirty: false, error: null };
}

/** Build a blank (empty-channel) MemoryRow. */
function blankRow(id: ChannelId): MemoryRow {
  const key =
    id.kind === "memory"
      ? `m${id.n.toString().padStart(3, "0")}`
      : "emg";
  return { id, key, frame: null, tag: "", dirty: false, error: null };
}

// ---------------------------------------------------------------------------
// rowsToCsv + csvToRows round-trip
// ---------------------------------------------------------------------------
describe("CSV round-trip (rowsToCsv + csvToRows)", () => {
  it("exports and re-imports rows preserving key fields", () => {
    const rows: MemoryRow[] = [
      makeRow({ kind: "memory", n: 1 }, "BEACON", {
        channel: { kind: "memory", n: 1 },
        freqHz: 14_250_000,
        clarifierHz: 0,
        rxClarOn: false,
        txClarOn: false,
        mode: "USB",
        vfoMem: "Memory",
        ctcssState: "OFF",
        shift: "simplex",
      }),
      makeRow({ kind: "memory", n: 2 }, "REPEATER", {
        channel: { kind: "memory", n: 2 },
        freqHz: 145_500_000,
        clarifierHz: -300,
        rxClarOn: true,
        txClarOn: false,
        mode: "FM",
        vfoMem: "Memory",
        ctcssState: "CTCSS ENC",
        shift: "minus",
      }),
      // Blank row — should be skipped in export
      blankRow({ kind: "memory", n: 3 }),
    ];

    const csv = rowsToCsv(rows);
    const parsed = csvToRows(csv);

    // Blank row (no frame) is skipped by rowsToCsv, so we get 2 rows back.
    expect(parsed).toHaveLength(2);

    // Row 1
    expect(parsed[0].channel).toBe("1");
    expect(parsed[0].tag).toBe("BEACON");
    expect(parsed[0].freqHz).toBe(14_250_000);
    expect(parsed[0].mode).toBe("USB");
    expect(parsed[0].clarifierHz).toBe(0);
    expect(parsed[0].rxClarOn).toBe(false);
    expect(parsed[0].txClarOn).toBe(false);
    expect(parsed[0].shift).toBe("simplex");
    expect(parsed[0].ctcssState).toBe("OFF");
    expect(parsed[0].error).toBeUndefined();

    // Row 2
    expect(parsed[1].channel).toBe("2");
    expect(parsed[1].tag).toBe("REPEATER");
    expect(parsed[1].freqHz).toBe(145_500_000);
    expect(parsed[1].mode).toBe("FM");
    expect(parsed[1].clarifierHz).toBe(-300);
    expect(parsed[1].rxClarOn).toBe(true);
    expect(parsed[1].txClarOn).toBe(false);
    expect(parsed[1].shift).toBe("minus");
    expect(parsed[1].ctcssState).toBe("CTCSS ENC");
    expect(parsed[1].error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// csvToRows validation
// ---------------------------------------------------------------------------
describe("csvToRows validation", () => {
  /** Builds a minimal valid CSV string from header + one data row. */
  function oneLine(overrides: Partial<Record<string, string>> = {}): string {
    const defaults: Record<string, string> = {
      Channel: "1",
      Tag: "TEST",
      FrequencyHz: "14250000",
      Mode: "USB",
      ClarifierHz: "0",
      RXClar: "0",
      TXClar: "0",
      Shift: "simplex",
      CTCSS: "OFF",
      VFOMem: "Memory",
    };
    const merged = { ...defaults, ...overrides };
    const header = CSV_HEADERS.join(",");
    const values = CSV_HEADERS.map((h) => merged[h] ?? "");
    return header + "\n" + values.join(",");
  }

  it("row with out-of-range frequency has error", () => {
    const rows = csvToRows(oneLine({ FrequencyHz: "999999999" }));
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeDefined();
    expect(rows[0].error).toContain("frequency");
  });

  it("row with invalid mode has error", () => {
    const rows = csvToRows(oneLine({ Mode: "GARBAGE" }));
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeDefined();
    expect(rows[0].error).toContain("mode");
  });

  it("row with non-ASCII tag has error", () => {
    // 0x7E (~) is outside the valid 0x20..0x7D charset
    const rows = csvToRows(oneLine({ Tag: "BAD~TAG" }));
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeDefined();
    expect(rows[0].error).toContain("0x7e");
  });

  it("row with valid data has no error", () => {
    const rows = csvToRows(oneLine());
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeUndefined();
    expect(rows[0].freqHz).toBe(14_250_000);
    expect(rows[0].mode).toBe("USB");
  });
});

// ---------------------------------------------------------------------------
// CSV edge cases
// ---------------------------------------------------------------------------
describe("CSV edge cases", () => {
  it("quoted field with comma stays as one field", () => {
    const header = CSV_HEADERS.join(",");
    // Tag contains a comma — must be quoted in CSV
    const data = '1,"TA1, SMO",14250000,USB,0,0,0,simplex,OFF,Memory';
    const csv = header + "\n" + data;
    const rows = csvToRows(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].tag).toBe("TA1, SMO");
  });

  it("empty CSV returns empty result", () => {
    expect(csvToRows("")).toEqual([]);
  });

  it("header-only CSV returns empty rows", () => {
    const csv = CSV_HEADERS.join(",");
    expect(csvToRows(csv)).toEqual([]);
  });

  it("missing columns does not crash", () => {
    // Only 3 columns instead of 10 — csvToRows should not throw
    const csv = "Channel,Tag,FrequencyHz\n1,TEST,14250000";
    expect(() => csvToRows(csv)).not.toThrow();
    const rows = csvToRows(csv);
    expect(rows).toHaveLength(1);
    // Missing columns resolve to defaults / NaN — the row may have an error
    // but the parser itself must not crash.
  });
});
