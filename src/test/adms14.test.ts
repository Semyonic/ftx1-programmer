import { describe, expect, it } from "vitest";
import { isAdms14Csv, parseAdms14Csv } from "../io/adms14-csv";

const SAMPLE_HEADER = [
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
  ...Array.from({ length: 24 }, (_, i) => `BANK ${i + 1}`),
  "Comment",
  "Check",
].join(",");

const ROW = [
  "1", "ON", "439.500000", "431.900000", "7.600000", "-RPT", "OFF", "FM",
  "ANALOG", "ON", "TA1 RPT", "TONE SQL", "100.0Hz", "023", "RX Normal TX Normal",
  "1600Hz", "RX 00", "TX 00", "High (5W)", "OFF", "OFF", "5.0KHz", "OFF",
  "OFF", "OFF", "OFF", "OFF", "OFF",
  ...Array.from({ length: 24 }, () => "OFF"),
  "TA1 demo", "0",
].join(",");

describe("ADMS-14 CSV import", () => {
  it("recognises the header line", () => {
    expect(isAdms14Csv(SAMPLE_HEADER)).toBe(true);
    expect(isAdms14Csv("Channel,Frequency,Mode")).toBe(false);
  });

  it("parses a typical FM repeater row", () => {
    const text = `${SAMPLE_HEADER}\n${ROW}\n`;
    const result = parseAdms14Csv(text);
    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.channelNo).toBe(1);
    expect(rec.channel).toEqual({ kind: "memory", n: 1 });
    expect(rec.frame.freqHz).toBe(439_500_000);
    expect(rec.frame.mode).toBe("FM");
    expect(rec.frame.shift).toBe("minus");
    expect(rec.frame.ctcssState).toBe("CTCSS ENC/DEC");
    expect(rec.tag).toBe("TA1 RPT");
    // CTCSS 100.0 Hz is index 12 in the FTX-1 table (manual p.9 表1).
    expect(rec.pendingToneIdx).toBe(12);
    expect(rec.pendingDcsIdx).toBeUndefined();
  });

  it("populates DCS pending index when Tone Mode = DCS", () => {
    const dcsRow = ROW.replace(",TONE SQL,", ",DCS,");
    const r = parseAdms14Csv(`${SAMPLE_HEADER}\n${dcsRow}\n`);
    const rec = r.records[0];
    expect(rec.frame.ctcssState).toBe("DCS");
    // DCS code 023 is index 0 in the FTX-1 DCS table.
    expect(rec.pendingDcsIdx).toBe(0);
    expect(rec.pendingToneIdx).toBeUndefined();
  });

  it("maps DIG/ANALOG to C4FM modes", () => {
    const rowDN = ROW.replace(",ANALOG,", ",DN,");
    const r = parseAdms14Csv(`${SAMPLE_HEADER}\n${rowDN}\n`);
    expect(r.records[0].frame.mode).toBe("C4FM-DN");

    const rowVW = ROW.replace(",ANALOG,", ",VW,");
    const r2 = parseAdms14Csv(`${SAMPLE_HEADER}\n${rowVW}\n`);
    expect(r2.records[0].frame.mode).toBe("C4FM-VW");
  });

  it("drops channels above 99", () => {
    const high = ROW.replace(/^1,/, "150,");
    const r = parseAdms14Csv(`${SAMPLE_HEADER}\n${high}\n`);
    expect(r.records).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes("above 99"))).toBe(true);
  });

  it("skips empty-frequency rows", () => {
    const empty = "2,OFF,,,0.000000,OFF,OFF,FM,ANALOG,OFF,,OFF,67.0Hz,023,RX Normal TX Normal,1600Hz,RX 00,TX 00,High (5W),OFF,ON,5.0KHz,OFF,OFF,OFF,OFF,OFF,OFF," +
      Array.from({ length: 24 }, () => "OFF").join(",") +
      ",,0";
    const r = parseAdms14Csv(`${SAMPLE_HEADER}\n${empty}\n`);
    expect(r.records).toHaveLength(0);
    expect(r.skippedRows).toBe(1);
  });

  it("truncates Name to 12 chars (FTX-1 tag limit)", () => {
    const longName = ROW.replace(",TA1 RPT,", ",ABCDEFGHIJKLMNOP,");
    const r = parseAdms14Csv(`${SAMPLE_HEADER}\n${longName}\n`);
    expect(r.records[0].tag).toBe("ABCDEFGHIJKL");
  });

  it("rejects non-ADMS files", () => {
    const r = parseAdms14Csv("foo,bar,baz\n1,2,3\n");
    expect(r.records).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/does not look like an ADMS-14/);
  });
});

describe("ADMS-14 import robustness (BFT N16/N18)", () => {
  it("N16: does not crash on a truncated row (missing trailing columns)", () => {
    const truncated = "5,ON,439.500000"; // only 3 of ~50 columns
    const r = parseAdms14Csv(`${SAMPLE_HEADER}\n${truncated}\n`);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].frame.freqHz).toBe(439_500_000);
    expect(r.records[0].frame.mode).toBe("FM");
  });

  it("N18: warns on independent TX freq with no repeater shift", () => {
    // tx 431.9 != rx 439.5 but Offset Direction OFF -> odd split, lost on FTX-1.
    const oddSplit = ROW.replace(",-RPT,", ",OFF,");
    const r = parseAdms14Csv(`${SAMPLE_HEADER}\n${oddSplit}\n`);
    expect(r.warnings.some((w) => /independent TX freq/.test(w))).toBe(true);
  });

  it("N18: does NOT warn for a normal repeater (shift set)", () => {
    const r = parseAdms14Csv(`${SAMPLE_HEADER}\n${ROW}\n`);
    expect(r.warnings.some((w) => /independent TX freq/.test(w))).toBe(false);
  });
});
