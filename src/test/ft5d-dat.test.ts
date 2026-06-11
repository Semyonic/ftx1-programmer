import { describe, expect, it } from "vitest";
import { isFt5dDat, parseFt5dDat } from "../io/ft5d-dat";

const FILE_SIZE = 44160;
const RECORD_SIZE = 32;
const CHANNEL_DATA_OFFSET = 0x1800;

function makeBuffer(records: { offset: number; data: number[] }[] = []): ArrayBuffer {
  const buf = new ArrayBuffer(FILE_SIZE);
  const view = new Uint8Array(buf);
  view.fill(0xff);
  for (const rec of records) {
    for (let i = 0; i < rec.data.length; i++) {
      view[rec.offset + i] = rec.data[i];
    }
  }
  return buf;
}

function buildRecord(opts: {
  f0?: number;
  f1?: number;
  bcdFreq: [number, number, number];
  f5?: number;
  name?: string;
  offsetBcd?: number;
  ctcssIdx?: number;
  toneFlagByte?: number;
  bankFlag?: number;
}): number[] {
  const rec = new Array(32).fill(0x00);
  rec[0] = opts.f0 ?? 0x22;
  rec[1] = opts.f1 ?? 0x04;
  rec[2] = opts.bcdFreq[0];
  rec[3] = opts.bcdFreq[1];
  rec[4] = opts.bcdFreq[2];
  rec[5] = opts.f5 ?? 0xc0;
  const name = opts.name ?? "";
  for (let i = 0; i < 16; i++) {
    rec[8 + i] = i < name.length ? name.charCodeAt(i) : 0xff;
  }
  rec[25] = opts.offsetBcd ?? 0x00;
  rec[27] = opts.ctcssIdx ?? 0x00;
  rec[29] = opts.toneFlagByte ?? 0x0c;
  rec[31] = opts.bankFlag ?? 0x00;
  return rec;
}

describe("isFt5dDat", () => {
  it("accepts 44160-byte buffer", () => {
    expect(isFt5dDat(new ArrayBuffer(FILE_SIZE))).toBe(true);
  });
  it("rejects wrong sizes", () => {
    expect(isFt5dDat(new ArrayBuffer(0))).toBe(false);
    expect(isFt5dDat(new ArrayBuffer(1000))).toBe(false);
    expect(isFt5dDat(new ArrayBuffer(44161))).toBe(false);
  });
});

describe("parseFt5dDat", () => {
  it("returns empty for all-FF file", () => {
    const r = parseFt5dDat(makeBuffer());
    expect(r.records).toHaveLength(0);
  });

  it("parses FM simplex channel", () => {
    const rec = buildRecord({
      f1: 0x04,
      bcdFreq: [0x14, 0x55, 0x00],
      f5: 0xc0,
      name: "VHF SIMPLEX",
      ctcssIdx: 8,
    });
    const r = parseFt5dDat(makeBuffer([{ offset: CHANNEL_DATA_OFFSET, data: rec }]));
    expect(r.records).toHaveLength(1);
    const ch = r.records[0];
    expect(ch.channelNo).toBe(1);
    expect(ch.frame.freqHz).toBe(145_500_000);
    expect(ch.frame.mode).toBe("FM");
    expect(ch.frame.shift).toBe("simplex");
    expect(ch.frame.ctcssState).toBe("OFF");
    expect(ch.tag).toBe("VHF SIMPLEX");
  });

  it("parses FM repeater with minus shift and CTCSS", () => {
    const rec = buildRecord({
      f1: 0x14,
      bcdFreq: [0x43, 0x92, 0x00],
      f5: 0xc1,
      name: "34-TEKSTILKENT",
      offsetBcd: 0x76,
      ctcssIdx: 8,
      toneFlagByte: 0x4c,
    });
    const r = parseFt5dDat(makeBuffer([{ offset: CHANNEL_DATA_OFFSET, data: rec }]));
    expect(r.records).toHaveLength(1);
    const ch = r.records[0];
    expect(ch.frame.freqHz).toBe(439_200_000);
    expect(ch.frame.shift).toBe("minus");
    expect(ch.frame.ctcssState).toBe("CTCSS ENC/DEC");
    expect(ch.pendingToneIdx).toBe(8);
    expect(ch.tag).toBe("TEKSTILKENT");
    expect(r.cityMap.get(1)).toBe("34");
  });

  it("parses FM repeater with plus shift", () => {
    const rec = buildRecord({
      f1: 0x14,
      bcdFreq: [0x43, 0x94, 0x00],
      f5: 0xc2,
      name: "34-ZEYTINBURNU",
      offsetBcd: 0x76,
      ctcssIdx: 18,
      toneFlagByte: 0x4c,
    });
    const r = parseFt5dDat(makeBuffer([{ offset: CHANNEL_DATA_OFFSET, data: rec }]));
    const ch = r.records[0];
    expect(ch.tag).toBe("ZEYTINBURNU");
    expect(ch.frame.freqHz).toBe(439_400_000);
    expect(ch.frame.shift).toBe("plus");
    expect(ch.pendingToneIdx).toBe(18);
  });

  it("detects C4FM mode from bit 5 of byte 5", () => {
    const rec = buildRecord({
      f1: 0x14,
      bcdFreq: [0x14, 0x57, 0x12],
      f5: 0xe1,
      name: "34-BCEKM C4FM",
      offsetBcd: 0x06,
      ctcssIdx: 18,
    });
    const r = parseFt5dDat(makeBuffer([{ offset: CHANNEL_DATA_OFFSET, data: rec }]));
    const ch = r.records[0];
    expect(ch.frame.mode).toBe("C4FM-DN");
    expect(ch.frame.shift).toBe("minus");
    expect(r.warnings.some((w) => w.includes("C4FM"))).toBe(true);
  });

  it("truncates name to 12 chars", () => {
    const rec = buildRecord({
      bcdFreq: [0x14, 0x55, 0x00],
      name: "ABCDEFGHIJKLMNOP",
    });
    const r = parseFt5dDat(makeBuffer([{ offset: CHANNEL_DATA_OFFSET, data: rec }]));
    expect(r.records[0].tag).toBe("ABCDEFGHIJKL");
  });

  it("caps at 99 channels", () => {
    const recs: { offset: number; data: number[] }[] = [];
    for (let i = 0; i < 120; i++) {
      const freq2 = (50 + Math.floor(i / 100)) & 0xff;
      recs.push({
        offset: CHANNEL_DATA_OFFSET + i * RECORD_SIZE,
        data: buildRecord({
          bcdFreq: [0x14, freq2 & 0x99 | 0x50, i & 0x99],
          name: `CH-${i + 1}`,
        }),
      });
    }
    const buf = makeBuffer(recs);
    const r = parseFt5dDat(buf);
    expect(r.records).toHaveLength(99);
    expect(r.warnings.some((w) => w.includes("beyond 99"))).toBe(true);
  });

  it("skips out-of-range frequency", () => {
    const rec = buildRecord({
      bcdFreq: [0x99, 0x99, 0x99],
      name: "TOO HIGH",
    });
    const r = parseFt5dDat(makeBuffer([{ offset: CHANNEL_DATA_OFFSET, data: rec }]));
    expect(r.records).toHaveLength(0);
    expect(r.skippedRows).toBe(1);
    expect(r.warnings.some((w) => w.includes("out of FTX-1 range"))).toBe(true);
  });

  it("skips all-zero records", () => {
    const rec = new Array(32).fill(0x00);
    const r = parseFt5dDat(makeBuffer([{ offset: CHANNEL_DATA_OFFSET, data: rec }]));
    expect(r.records).toHaveLength(0);
  });

  it("reports repeater offset per band", () => {
    const rec = buildRecord({
      f1: 0x14,
      bcdFreq: [0x43, 0x92, 0x00],
      f5: 0xc1,
      name: "UHF RPT",
      offsetBcd: 0x76,
      ctcssIdx: 8,
    });
    const r = parseFt5dDat(makeBuffer([{ offset: CHANNEL_DATA_OFFSET, data: rec }]));
    expect(r.warnings.some((w) => w.includes("430MHz") && w.includes("7600 kHz"))).toBe(true);
  });

  it("assigns sequential channel numbers", () => {
    const recs = [
      { offset: CHANNEL_DATA_OFFSET, data: buildRecord({ bcdFreq: [0x14, 0x55, 0x00], name: "CH1" }) },
      { offset: CHANNEL_DATA_OFFSET + RECORD_SIZE * 5, data: buildRecord({ bcdFreq: [0x43, 0x35, 0x00], name: "CH2" }) },
    ];
    const r = parseFt5dDat(makeBuffer(recs));
    expect(r.records).toHaveLength(2);
    expect(r.records[0].channelNo).toBe(1);
    expect(r.records[0].tag).toBe("CH1");
    expect(r.records[1].channelNo).toBe(2);
    expect(r.records[1].tag).toBe("CH2");
  });
});
