// EX menu tree, transcribed from FTX-1_CAT_OM_JPN_2512-D.pdf pp.11-16 表3.
// Each leaf describes the P4 parameter for the EX command:
//   EX P1 P2 P3 [P4] ;
// P1, P2, P3 are 2-digit codes; P4 is variable-length.

export type LeafType =
  | { kind: "enum"; values: { code: string; label: string }[] }
  | { kind: "int"; min: number; max: number; digits: number; step?: number; unit?: string }
  | { kind: "signedInt"; min: number; max: number; digits: number; step?: number; unit?: string }
  | { kind: "text"; maxLen: number; charset?: string }
  | { kind: "bool"; offCode?: string; onCode?: string }
  | { kind: "readonly" }
  // Excluded leaves are documented but blocked from UI as a safety measure.
  | { kind: "excluded"; reason: string };

export interface Leaf {
  p3: number;
  name: string;
  type: LeafType;
  notes?: string;
}

export interface SubGroup {
  p2: number;
  name: string;
  leaves: Leaf[];
}

export interface Group {
  p1: number;
  name: string;
  subgroups: SubGroup[];
}

const onOff: LeafType = { kind: "bool" };
const enumOf = (...labels: string[]): LeafType => ({
  kind: "enum",
  values: labels.map((l, i) => ({ code: i.toString(), label: l })),
});

// Common leaves shared across SSB/AM/FM/DATA/RTTY mode subgroups.
const audioToneLeaves = (extras: Leaf[] = []): Leaf[] => [
  {
    p3: 1,
    name: "AF TREBLE GAIN",
    type: { kind: "signedInt", min: -10, max: 10, digits: 3, unit: "dB" },
  },
  {
    p3: 2,
    name: "AF MIDDLE TONE GAIN",
    type: { kind: "signedInt", min: -10, max: 10, digits: 3, unit: "dB" },
  },
  {
    p3: 3,
    name: "AF BASS GAIN",
    type: { kind: "signedInt", min: -10, max: 10, digits: 3, unit: "dB" },
  },
  {
    p3: 4,
    name: "AGC FAST DELAY",
    type: { kind: "int", min: 20, max: 4000, digits: 4, step: 20, unit: "ms" },
  },
  {
    p3: 5,
    name: "AGC MID DELAY",
    type: { kind: "int", min: 20, max: 4000, digits: 4, step: 20, unit: "ms" },
  },
  {
    p3: 6,
    name: "AGC SLOW DELAY",
    type: { kind: "int", min: 20, max: 4000, digits: 4, step: 20, unit: "ms" },
  },
  {
    p3: 7,
    name: "LCUT FREQ",
    type: { kind: "int", min: 0, max: 19, digits: 2, unit: "(0=OFF, 100..1000Hz step 50)" },
  },
  { p3: 8, name: "LCUT SLOPE", type: enumOf("6dB/oct", "18dB/oct") },
  {
    p3: 9,
    name: "HCUT FREQ",
    type: { kind: "int", min: 0, max: 67, digits: 2, unit: "(0=OFF, 700..4000Hz step 50)" },
  },
  { p3: 10, name: "HCUT SLOPE", type: enumOf("6dB/oct", "18dB/oct") },
  { p3: 11, name: "USB OUT LEVEL", type: { kind: "int", min: 0, max: 100, digits: 3 } },
  ...extras,
];

const txBpf: Leaf = {
  p3: 12,
  name: "TX BPF SEL",
  type: enumOf("50–3050", "100–2900", "200–2800", "300–2700", "400–2600"),
};
const modSrc: Leaf = {
  p3: 13,
  name: "MOD SOURCE",
  type: enumOf("MIC", "USB", "Bluetooth", "AUTO"),
};
const usbModGain: Leaf = {
  p3: 14,
  name: "USB MOD GAIN",
  type: { kind: "int", min: 0, max: 100, digits: 3 },
};
const rpttSel: Leaf = { p3: 15, name: "RPTT SELECT", type: enumOf("OFF", "RTS", "DTR") };
// In subgroups where p3:15 is already used by a mode-specific leaf (FM, RTTY, CW),
// RPTT SELECT occupies p3:12 — the slot left free when TX BPF SEL is absent.
const rpttSel12: Leaf = { p3: 12, name: "RPTT SELECT", type: enumOf("OFF", "RTS", "DTR") };

const ssbLeaves: Leaf[] = [
  ...audioToneLeaves([txBpf, modSrc, usbModGain, rpttSel]),
  {
    p3: 16,
    name: "NAR WIDTH",
    type: enumOf(
      "300", "600", "850", "1100", "1500", "1650", "1800", "1950",
      "2100", "2250", "2400", "2500", "2600", "2700", "2900", "3000",
      "3200", "3500",
    ),
  },
  { p3: 17, name: "CW AUTO MODE", type: enumOf("OFF", "50MHz", "ON") },
];

const amLeaves: Leaf[] = audioToneLeaves([txBpf, modSrc, usbModGain, rpttSel]);

const fmLeaves: Leaf[] = [
  ...audioToneLeaves([rpttSel12, modSrc, usbModGain]),
  { p3: 15, name: "RPT SHIFT", type: enumOf("Simplex", "+", "-", "ARS") },
  {
    p3: 16,
    name: "RPT SHIFT (28MHz)",
    type: { kind: "int", min: 0, max: 1000, digits: 4, step: 10, unit: "kHz" },
  },
  {
    p3: 17,
    name: "RPT SHIFT (50MHz)",
    type: { kind: "int", min: 0, max: 4000, digits: 4, step: 10, unit: "kHz" },
  },
  {
    p3: 18,
    name: "RPT SHIFT (144MHz)",
    type: { kind: "int", min: 0, max: 100, digits: 4, step: 50, unit: "kHz" },
  },
  {
    p3: 19,
    name: "RPT SHIFT (430MHz)",
    type: { kind: "int", min: 0, max: 100, digits: 4, step: 50, unit: "kHz" },
  },
  { p3: 20, name: "SQL TYPE", type: enumOf("OFF", "ENC", "TSQ", "DCS", "PR FREQ", "REV TONE") },
  { p3: 21, name: "TONE FREQ", type: { kind: "int", min: 0, max: 49, digits: 2 } },
  { p3: 22, name: "DCS CODE", type: { kind: "int", min: 0, max: 103, digits: 3 } },
  { p3: 23, name: "DCS RX REVERSE", type: enumOf("NORMAL", "REVERSE", "BOTH") },
  { p3: 24, name: "DCS TX REVERSE", type: enumOf("NORMAL", "REVERSE") },
  {
    p3: 25,
    name: "PR FREQ",
    type: { kind: "int", min: 300, max: 3000, digits: 4, step: 100, unit: "Hz" },
  },
  { p3: 26, name: "DTMF DELAY", type: enumOf("50", "250", "450", "750", "1000") },
  { p3: 27, name: "DTMF SPEED", type: enumOf("50", "100") },
  ...Array.from({ length: 10 }, (_, i): Leaf => ({
    p3: 28 + i,
    name: `DTMF MEMORY${i + 1}`,
    type: { kind: "text", maxLen: 16, charset: "0-9 A-D * # - space" },
  })),
];

const dataLeaves: Leaf[] = [
  ...audioToneLeaves([txBpf, modSrc, usbModGain, rpttSel]),
  {
    p3: 16,
    name: "NAR WIDTH",
    type: enumOf(
      "50", "100", "150", "200", "250", "300", "350", "400", "450",
      "500", "600", "800", "1200", "1400", "1700", "2000", "2400",
      "3000", "3200", "3500", "4000",
    ),
  },
  { p3: 17, name: "PSK TONE", type: enumOf("1000", "1500", "2000") },
  { p3: 18, name: "DATA SHIFT (SSB)", type: { kind: "int", min: 0, max: 3000, digits: 4, step: 10, unit: "Hz" } },
];

const rttyLeaves: Leaf[] = [
  ...audioToneLeaves([rpttSel12]),
  {
    p3: 13,
    name: "NAR WIDTH",
    type: enumOf(
      "50", "100", "150", "200", "250", "300", "350", "400", "450",
      "500", "600", "800", "1200", "1400", "1700", "2000", "2400",
      "3000", "3200", "3500", "4000",
    ),
  },
  { p3: 14, name: "MARK FREQUENCY", type: enumOf("1275Hz", "2125Hz") },
  { p3: 15, name: "SHIFT FREQUENCY", type: enumOf("170Hz", "200Hz", "425Hz", "850Hz") },
  { p3: 16, name: "POLARITY-TX", type: enumOf("NOR", "REV") },
];

const cwLeaves: Leaf[] = [
  ...audioToneLeaves([rpttSel12]),
  {
    p3: 13,
    name: "NAR WIDTH",
    type: enumOf(
      "50", "100", "150", "200", "250", "300", "350", "400", "450",
      "500", "600", "800", "1200", "1400", "1700", "2000", "2400",
      "3000", "3200", "3500", "4000",
    ),
  },
  { p3: 14, name: "PC KEYING", type: enumOf("OFF", "RTS", "DTR") },
  { p3: 15, name: "CW BK-IN TYPE", type: enumOf("SEMI", "FULL") },
  { p3: 16, name: "CW FREQ DISPLAY", type: enumOf("DIRECT FREQ", "PITCH OFFSET") },
  { p3: 17, name: "QSK DELAY TIME", type: enumOf("15ms", "20ms", "25ms", "30ms") },
  { p3: 18, name: "CW INDICATOR", type: onOff },
];

export const MENU: Group[] = [
  {
    p1: 1,
    name: "RADIO SETTING",
    subgroups: [
      { p2: 1, name: "MODE SSB", leaves: ssbLeaves },
      { p2: 2, name: "MODE AM", leaves: amLeaves },
      { p2: 3, name: "MODE FM", leaves: fmLeaves },
      { p2: 4, name: "MODE DATA", leaves: dataLeaves },
      { p2: 5, name: "MODE RTTY", leaves: rttyLeaves },
      {
        p2: 6,
        name: "DIGITAL",
        leaves: [
          {
            p3: 1,
            name: "DIGITAL POPUP",
            type: { kind: "int", min: 0, max: 60, digits: 2, unit: "(0=OFF, 60=CONTINUE)" },
          },
          { p3: 2, name: "LOCATION SERVICE", type: onOff },
          { p3: 3, name: "STANDBY BEEP", type: onOff },
          { p3: 4, name: "DP-ID LIST", type: { kind: "readonly" } },
          { p3: 5, name: "RADIO ID", type: { kind: "readonly" } },
        ],
      },
    ],
  },
  {
    p1: 2,
    name: "CW SETTING",
    subgroups: [
      { p2: 1, name: "MODE CW", leaves: cwLeaves },
      {
        p2: 2,
        name: "KEYER",
        leaves: [
          { p3: 1, name: "KEYER TYPE", type: enumOf("OFF", "BUG", "ELEKEY-A", "ELEKEY-B", "ELEKEY-Y", "ACS") },
          { p3: 2, name: "KEYER DOT/DASH", type: enumOf("NOR", "REV") },
          {
            p3: 3,
            name: "CW WEIGHT",
            type: { kind: "int", min: 25, max: 45, digits: 2, unit: "x0.1 (2.5..4.5)" },
          },
          { p3: 4, name: "NUMBER STYLE", type: enumOf("1290", "AUNO", "AUNT", "A2NO", "A2NT", "12NO", "12NT") },
          { p3: 5, name: "CONTEST NUMBER", type: { kind: "int", min: 1, max: 9999, digits: 4 } },
          ...Array.from({ length: 5 }, (_, i): Leaf => ({
            p3: 6 + i,
            name: `CW MEMORY ${i + 1}`,
            type: enumOf("TEXT", "MESSAGE"),
          })),
          { p3: 11, name: "REPEAT INTERVAL", type: { kind: "int", min: 1, max: 60, digits: 2, unit: "s" } },
        ],
      },
    ],
  },
  {
    p1: 3,
    name: "OPERATION SETTING",
    subgroups: [
      {
        p2: 1,
        name: "GENERAL",
        leaves: [
          { p3: 1, name: "BEEP LEVEL", type: { kind: "int", min: 0, max: 100, digits: 3 } },
          { p3: 2, name: "RF/SQL VR", type: enumOf("RF", "SQL") },
          { p3: 3, name: "TUN/LIN PORT SELECT", type: enumOf("EXT-TUNER", "LINEAR", "CAT-3", "GPO") },
          { p3: 4, name: "TUNER SELECT", type: enumOf("INT", "INT(FAST)", "EXT", "ATAS") },
          { p3: 5, name: "CAT-1 RATE", type: enumOf("4800", "9600", "19200", "38400", "115200") },
          { p3: 6, name: "CAT-1 TIME OUT TIMER", type: enumOf("10ms", "100ms", "1000ms", "3000ms") },
          { p3: 7, name: "CAT-1 CAT-3 STOP BIT", type: enumOf("1bit", "2bit") },
          { p3: 8, name: "CAT-2 RATE", type: enumOf("4800", "9600", "19200", "38400", "115200") },
          { p3: 9, name: "CAT-2 TIME OUT TIMER", type: enumOf("10ms", "100ms", "1000ms", "3000ms") },
          { p3: 10, name: "CAT-3 RATE", type: enumOf("4800", "9600", "19200", "38400", "115200") },
          { p3: 11, name: "CAT-3 TIME OUT TIMER", type: enumOf("10ms", "100ms", "1000ms", "3000ms") },
          {
            p3: 12,
            name: "TX TIME OUT TIMER",
            type: { kind: "int", min: 0, max: 30, digits: 2, unit: "min (0=OFF)" },
          },
          {
            p3: 13,
            name: "REF FREQ ADJ",
            type: { kind: "signedInt", min: -25, max: 25, digits: 3 },
          },
          { p3: 14, name: "CHARGE CONTROL", type: onOff },
          { p3: 15, name: "SUB BAND MUTE", type: onOff },
          { p3: 16, name: "SPEAKER SELECT", type: enumOf("Auto", "INT", "BOTH") },
          { p3: 17, name: "DITHER", type: onOff },
        ],
      },
      {
        p2: 2,
        name: "BAND-SCAN",
        leaves: [
          { p3: 1, name: "QMB CH", type: enumOf("5ch", "10ch") },
          { p3: 2, name: "BAND STACK", type: onOff },
          { p3: 3, name: "BAND EDGE", type: onOff },
          { p3: 4, name: "SCAN RESUME", type: enumOf("BUSY", "HOLD", "1sec", "3sec", "5sec") },
        ],
      },
      {
        p2: 3,
        name: "RX-DSP",
        leaves: [
          { p3: 1, name: "IF NOTCH WIDTH", type: enumOf("NARROW", "WIDE") },
          { p3: 2, name: "NB REJECTION", type: enumOf("LOW", "MID", "HIGH") },
          { p3: 3, name: "NB WIDTH", type: enumOf("NARROW", "MEDIUM", "WIDE") },
          { p3: 4, name: "APF WIDTH", type: enumOf("NARROW", "MEDIUM", "WIDE") },
          {
            p3: 5,
            name: "CONTOUR LEVEL",
            type: { kind: "signedInt", min: -40, max: 20, digits: 3, unit: "dB" },
          },
          { p3: 6, name: "CONTOUR WIDTH", type: { kind: "int", min: 1, max: 11, digits: 2 } },
        ],
      },
      {
        p2: 4,
        name: "TX AUDIO",
        leaves: [
          { p3: 1, name: "AMC RELEASE TIME", type: enumOf("FAST", "MID", "SLOW") },
          {
            p3: 2,
            name: "PRMTRC EQ1 FREQ",
            type: { kind: "int", min: 0, max: 7, digits: 2, unit: "(0=OFF, 100..700Hz step 100)" },
          },
          { p3: 3, name: "PRMTRC EQ1 LEVEL", type: { kind: "signedInt", min: -10, max: 10, digits: 3 } },
          { p3: 4, name: "PRMTRC EQ1 BWTH", type: { kind: "int", min: 0, max: 10, digits: 2 } },
          { p3: 5, name: "PRMTRC EQ2 FREQ", type: { kind: "int", min: 0, max: 9, digits: 2, unit: "(0=OFF, 700..1500Hz step 100)" } },
          { p3: 6, name: "PRMTRC EQ2 LEVEL", type: { kind: "signedInt", min: -10, max: 10, digits: 3 } },
          { p3: 7, name: "PRMTRC EQ2 BWTH", type: { kind: "int", min: 0, max: 10, digits: 2 } },
          { p3: 8, name: "PRMTRC EQ3 FREQ", type: { kind: "int", min: 0, max: 18, digits: 2, unit: "(0=OFF, 1500..3200Hz step 100)" } },
          { p3: 9, name: "PRMTRC EQ3 LEVEL", type: { kind: "signedInt", min: -10, max: 10, digits: 3 } },
          { p3: 10, name: "PRMTRC EQ3 BWTH", type: { kind: "int", min: 0, max: 10, digits: 2 } },
          { p3: 11, name: "P PRMTRC EQ1 FREQ", type: { kind: "int", min: 0, max: 7, digits: 2 } },
          { p3: 12, name: "P PRMTRC EQ1 LEVEL", type: { kind: "signedInt", min: -10, max: 10, digits: 3 } },
          { p3: 13, name: "P PRMTRC EQ1 BWTH", type: { kind: "int", min: 0, max: 10, digits: 2 } },
          { p3: 14, name: "P PRMTRC EQ2 FREQ", type: { kind: "int", min: 0, max: 9, digits: 2 } },
          { p3: 15, name: "P PRMTRC EQ2 LEVEL", type: { kind: "signedInt", min: -10, max: 10, digits: 3 } },
          { p3: 16, name: "P PRMTRC EQ2 BWTH", type: { kind: "int", min: 0, max: 10, digits: 2 } },
          { p3: 17, name: "P PRMTRC EQ3 FREQ", type: { kind: "int", min: 0, max: 18, digits: 2 } },
          { p3: 18, name: "P PRMTRC EQ3 LEVEL", type: { kind: "signedInt", min: -10, max: 10, digits: 3 } },
          { p3: 19, name: "P PRMTRC EQ3 BWTH", type: { kind: "int", min: 0, max: 10, digits: 2 } },
        ],
      },
      {
        p2: 5,
        name: "TX GENERAL",
        leaves: [
          { p3: 1, name: "MAX POWER (BAT)", type: { kind: "int", min: 5, max: 60, digits: 3, unit: "W" } },
          { p3: 2, name: "QRP MODE", type: onOff },
          { p3: 3, name: "HF MAX POWER", type: { kind: "int", min: 5, max: 10, digits: 3, unit: "W" } },
          { p3: 4, name: "50M MAX POWER", type: { kind: "int", min: 5, max: 10, digits: 3, unit: "W" } },
          { p3: 5, name: "70M MAX POWER", type: { kind: "int", min: 5, max: 60, digits: 3, unit: "W" } },
          { p3: 6, name: "144M MAX POWER", type: { kind: "int", min: 5, max: 100, digits: 3, unit: "W" } },
          { p3: 7, name: "430M MAX POWER", type: { kind: "int", min: 5, max: 100, digits: 3, unit: "W" } },
          { p3: 8, name: "AM HF/50 MAX POWER", type: { kind: "int", min: 5, max: 25, digits: 3, unit: "W" } },
          { p3: 9, name: "AM V/UHF MAX POWER", type: { kind: "int", min: 5, max: 25, digits: 3, unit: "W" } },
          { p3: 10, name: "VOX SELECT", type: enumOf("MIC", "USB", "Bluetooth") },
          { p3: 11, name: "EMERGENCY FREQ TX", type: onOff },
          { p3: 12, name: "TX INHIBIT", type: onOff },
          { p3: 13, name: "METER DETECTOR", type: enumOf("AVERAGE", "PEAK") },
        ],
      },
      {
        p2: 6,
        name: "KEY/DIAL",
        leaves: [
          { p3: 1, name: "SSB/CW DIAL STEP", type: enumOf("5", "10", "20") },
          { p3: 2, name: "RTTY/PSK DIAL STEP", type: enumOf("5", "10", "20") },
          { p3: 3, name: "FM DIAL STEP", type: enumOf("5", "6.25", "10", "12.5", "20", "25", "Auto") },
          { p3: 4, name: "CH STEP", type: enumOf("1", "2.5", "5", "10") },
          { p3: 5, name: "AM CH STEP", type: enumOf("2.5", "5", "9", "10", "12.5", "25") },
          { p3: 6, name: "FM CH STEP", type: enumOf("5", "6.25", "10", "12.5", "20", "25") },
          { p3: 7, name: "MAIN STEPS PER REV.", type: enumOf("50", "100", "200") },
          {
            p3: 8,
            name: "MIC P1",
            type: enumOf(
              "LOCK", "QMB", "><", "V/M", "TUNER", "VOX/MOX", "MODE", "ZIN/SPOT",
              "SPLIT", "FINE", "NAR", "NB", "DNR", "FREQ UP", "FREQ DOWN",
              "BAND UP", "BAND DOWN", "ATT", "IPO", "DNF", "AGC",
            ),
          },
          {
            p3: 9,
            name: "MIC P2",
            type: enumOf(
              "LOCK", "QMB", "><", "V/M", "TUNER", "VOX/MOX", "MODE", "ZIN/SPOT",
              "SPLIT", "FINE", "NAR", "NB", "DNR", "FREQ UP", "FREQ DOWN",
              "BAND UP", "BAND DOWN", "ATT", "IPO", "DNF", "AGC",
            ),
          },
          {
            p3: 10,
            name: "MIC P3",
            type: enumOf(
              "LOCK", "QMB", "><", "V/M", "TUNER", "VOX/MOX", "MODE", "ZIN/SPOT",
              "SPLIT", "FINE", "NAR", "NB", "DNR", "FREQ UP", "FREQ DOWN",
              "BAND UP", "BAND DOWN", "ATT", "IPO", "DNF", "AGC",
            ),
          },
          {
            p3: 11,
            name: "MIC P4",
            type: enumOf(
              "LOCK", "QMB", "><", "V/M", "TUNER", "VOX/MOX", "MODE", "ZIN/SPOT",
              "SPLIT", "FINE", "NAR", "NB", "DNR", "FREQ UP", "FREQ DOWN",
              "BAND UP", "BAND DOWN", "ATT", "IPO", "DNF", "AGC",
            ),
          },
          { p3: 12, name: "MIC UP", type: { kind: "readonly" } },
          { p3: 13, name: "MIC DOWN", type: { kind: "readonly" } },
          { p3: 14, name: "MIC SCAN", type: onOff },
        ],
      },
      {
        p2: 7,
        name: "OPTION",
        leaves: [
          { p3: 1, name: "TUNER TYPE SEL ANT1", type: enumOf("INT", "INT(FAST)", "EXT", "ATAS") },
          { p3: 2, name: "TUNER TYPE SEL ANT2", type: enumOf("INT", "INT(FAST)", "EXT", "ATAS") },
          { p3: 3, name: "ANT2 OPERATION", type: enumOf("TRX", "TX-ANT1, RX-ANT2", "TRX-ANT1, RX-ANT2") },
          { p3: 4, name: "HF ANT SELECT", type: enumOf("ANT1", "ANT2") },
          { p3: 5, name: "HF MAX POWER", type: { kind: "int", min: 5, max: 100, digits: 3, unit: "W" } },
          { p3: 6, name: "50M MAX POWER", type: { kind: "int", min: 5, max: 100, digits: 3, unit: "W" } },
          { p3: 7, name: "70M MAX POWER", type: { kind: "int", min: 5, max: 50, digits: 3, unit: "W" } },
          { p3: 8, name: "144M MAX POWER", type: { kind: "int", min: 5, max: 50, digits: 3, unit: "W" } },
          { p3: 9, name: "430M MAX POWER", type: { kind: "int", min: 5, max: 50, digits: 3, unit: "W" } },
          { p3: 10, name: "AM MAX POWER", type: { kind: "int", min: 5, max: 25, digits: 3, unit: "W" } },
          { p3: 11, name: "AM V/U MAX POWER", type: { kind: "int", min: 5, max: 13, digits: 3, unit: "W" } },
          { p3: 12, name: "GPS", type: onOff },
          { p3: 13, name: "GPS PINNING", type: onOff },
          { p3: 14, name: "GPS BAUDRATE", type: enumOf("4800", "9600", "19200", "38400", "115200") },
          { p3: 15, name: "BLUETOOTH", type: { kind: "readonly" } },
        ],
      },
    ],
  },
  {
    p1: 4,
    name: "DISPLAY SETTING",
    subgroups: [
      {
        p2: 1,
        name: "DISPLAY",
        leaves: [
          { p3: 1, name: "MY CALL", type: { kind: "text", maxLen: 10 } },
          { p3: 2, name: "MY CALL TIME", type: enumOf("OFF", "1s", "2s", "3s", "4s", "5s") },
          { p3: 3, name: "POP-UP TIME", type: enumOf("FAST", "MID", "SLOW") },
          { p3: 4, name: "SCREEN SAVER", type: enumOf("OFF", "1m", "2m", "3m", "5m", "15m", "30m", "60m") },
          { p3: 5, name: "SCREEN SAVER (BAT)", type: enumOf("OFF", "1m", "2m", "3m", "5m", "15m", "30m", "60m") },
          { p3: 6, name: "SAVER TYPE", type: enumOf("Logo", "DIMMER", "DISP OFF") },
          {
            p3: 7,
            name: "AUTO POWER OFF",
            type: { kind: "int", min: 0, max: 24, digits: 2, unit: "h (0.5 step, 0=OFF)" },
          },
          { p3: 8, name: "LED DIMMER", type: { kind: "int", min: 0, max: 20, digits: 2 } },
        ],
      },
      {
        p2: 2,
        name: "UNIT",
        leaves: [
          { p3: 1, name: "POSITION UNIT", type: enumOf("dd°MM.mm'", "dd°mm'ss\"") },
          { p3: 2, name: "DISTANCE UNIT", type: enumOf("km", "mile") },
          { p3: 3, name: "SPEED UNIT", type: enumOf("km/h", "knot", "mph") },
          { p3: 4, name: "ALTITUDE UNIT", type: enumOf("m", "ft") },
          { p3: 5, name: "TEMP UNIT", type: enumOf("°C", "°F") },
          { p3: 6, name: "RAIN UNIT", type: enumOf("mm", "INCH") },
          { p3: 7, name: "WIND UNIT", type: enumOf("m/s", "mph") },
        ],
      },
      {
        p2: 3,
        name: "SCOPE",
        leaves: [
          { p3: 1, name: "RBW", type: enumOf("HIGH", "MID", "LOW") },
          { p3: 2, name: "SCOPE CTR", type: enumOf("FILTER", "CARRIER") },
          { p3: 3, name: "2D DISP SENSITIVITY", type: enumOf("NORMAL", "HI") },
          { p3: 4, name: "3DSS DISP SENSITIVITY", type: enumOf("NORMAL", "HI") },
          { p3: 5, name: "AVERAGE", type: enumOf("OFF", "2", "4", "8") },
        ],
      },
      {
        p2: 4,
        name: "VFO IND COLOR",
        leaves: [
          { p3: 1, name: "VMI COLOR VFO", type: enumOf("BLUE", "GREEN", "WHITE", "NONE") },
          { p3: 2, name: "VMI COLOR MEMORY", type: enumOf("BLUE", "GREEN", "WHITE", "NONE") },
          { p3: 3, name: "VMI COLOR CLAR", type: enumOf("RED", "NONE") },
        ],
      },
    ],
  },
  {
    p1: 5,
    name: "EXTENSION SETTING",
    subgroups: [
      {
        p2: 1,
        name: "DATE & TIME / MY POSITION",
        leaves: [
          {
            p3: 1,
            name: "TIME ZONE",
            type: { kind: "signedInt", min: -120, max: 140, digits: 4, step: 5, unit: "x0.1h" },
          },
          { p3: 2, name: "DAY", type: { kind: "int", min: 1, max: 31, digits: 2 } },
          { p3: 3, name: "MONTH", type: { kind: "int", min: 1, max: 12, digits: 2 } },
          { p3: 4, name: "YEAR", type: { kind: "int", min: 2000, max: 2099, digits: 4 } },
          { p3: 5, name: "HOUR", type: { kind: "int", min: 0, max: 23, digits: 2 } },
          { p3: 6, name: "MINUTE", type: { kind: "int", min: 0, max: 59, digits: 2 } },
          { p3: 7, name: "GPS TIME SET", type: enumOf("AUTO", "MANUAL") },
          { p3: 8, name: "MY POSITION", type: enumOf("GPS", "MANUAL") },
          { p3: 9, name: "MY POSITION LATITUDE", type: { kind: "text", maxLen: 16 } },
          { p3: 10, name: "MY POSITION LONGITUDE", type: { kind: "text", maxLen: 16 } },
        ],
      },
      {
        p2: 2,
        name: "SD CARD",
        leaves: [
          { p3: 1, name: "MEM LIST LOAD", type: { kind: "readonly" } },
          { p3: 2, name: "MEM LIST SAVE", type: { kind: "readonly" } },
          { p3: 3, name: "MENU LOAD", type: { kind: "readonly" } },
          { p3: 4, name: "MENU SAVE", type: { kind: "readonly" } },
          { p3: 5, name: "INFORMATIONS", type: { kind: "readonly" } },
          { p3: 6, name: "FIRMWARE UPDATE", type: { kind: "excluded", reason: "Firmware update is excluded for safety." } },
          { p3: 7, name: "FORMAT", type: { kind: "excluded", reason: "SD format is excluded for safety." } },
        ],
      },
      {
        p2: 3,
        name: "SOFT VERSION",
        leaves: [{ p3: 1, name: "SOFT VERSION", type: { kind: "readonly" } }],
      },
      {
        p2: 4,
        name: "CALIBRATION",
        leaves: [
          {
            p3: 1,
            name: "CALIBRATION",
            type: { kind: "excluded", reason: "Calibration is excluded for safety." },
          },
        ],
      },
      {
        p2: 5,
        name: "RESET",
        leaves: [
          { p3: 1, name: "MEMORY CLEAR", type: { kind: "excluded", reason: "Memory clear is destructive — excluded." } },
          { p3: 2, name: "MENU CLEAR", type: { kind: "excluded", reason: "Menu clear is destructive — excluded." } },
          { p3: 3, name: "ALL RESET", type: { kind: "excluded", reason: "All reset is destructive — excluded." } },
          { p3: 4, name: "CERTIFICATION", type: { kind: "readonly" } },
        ],
      },
    ],
  },
  {
    p1: 6,
    name: "APRS SETTING",
    subgroups: [
      {
        p2: 1,
        name: "GENERAL",
        leaves: [
          { p3: 1, name: "MODEM SELECT", type: enumOf("OFF", "AUTO", "MAIN", "SUB") },
          { p3: 2, name: "MODEM TYPE", type: enumOf("1200bps", "9600bps") },
          { p3: 3, name: "APRS AF MUTE", type: onOff },
          {
            p3: 4,
            name: "APRS TX DELAY",
            type: enumOf("100ms", "200ms", "300ms", "400ms", "500ms", "750ms", "1000ms"),
          },
          { p3: 5, name: "CALLSIGN (APRS)", type: { kind: "text", maxLen: 8 } },
          { p3: 9, name: "APRS DESTINATION", type: { kind: "text", maxLen: 6 } },
        ],
      },
      {
        p2: 2,
        name: "MSG TEMPLATE",
        leaves: Array.from({ length: 8 }, (_, i): Leaf => ({
          p3: i + 1,
          name: `MESSAGE TEXT${i + 1}`,
          type: { kind: "text", maxLen: 16 },
        })),
      },
      {
        p2: 3,
        name: "MY SYMBOL",
        leaves: [
          { p3: 1, name: "MY SYMBOL", type: enumOf("ICON1", "ICON2", "ICON3", "USER") },
          { p3: 2, name: "ICON1", type: { kind: "text", maxLen: 2 } },
          { p3: 3, name: "ICON2", type: { kind: "text", maxLen: 2 } },
          { p3: 4, name: "ICON3", type: { kind: "text", maxLen: 2 } },
          { p3: 5, name: "USER", type: { kind: "text", maxLen: 2 } },
        ],
      },
      {
        p2: 4,
        name: "DIGI PATH",
        leaves: [{ p3: 1, name: "PATH SELECT", type: enumOf("OFF", "WIDE1-1", "WIDE1-1, WIDE2-1") }],
      },
    ],
  },
  {
    p1: 7,
    name: "APRS BEACON",
    subgroups: [
      {
        p2: 1,
        name: "BEACON SET",
        leaves: [
          { p3: 1, name: "BEACON TYPE", type: enumOf("OFF", "AUTO", "SMART") },
          { p3: 2, name: "INFO AMBIGUITY", type: enumOf("OFF", "1dig", "2dig", "3dig", "4dig") },
          { p3: 3, name: "INFO SPEED/COURSE", type: onOff },
          { p3: 4, name: "INFO ALTITUDE", type: onOff },
          {
            p3: 5,
            name: "POSITION COMMENT",
            type: enumOf(
              "Off duty", "En Route", "In Service", "Returning", "Committed",
              "Special", "Priority", "Custom 0", "Custom 1", "Custom 2",
              "Custom 3", "Custom 4", "Custom 5", "Custom 6", "EMERGENCY!",
            ),
          },
          { p3: 6, name: "EMERGENCY BEACON", type: onOff },
        ],
      },
      {
        p2: 2,
        name: "AUTO BEACON",
        leaves: [
          {
            p3: 1,
            name: "INTERVAL TIME",
            type: enumOf(
              "30s", "1min", "2min", "3min", "5min", "10min", "15min", "20min", "30min", "60min",
            ),
          },
          { p3: 2, name: "PROPORTIONAL", type: onOff },
          { p3: 3, name: "DECAY", type: onOff },
          {
            p3: 4,
            name: "AUTO LOW SPEED",
            type: { kind: "int", min: 1, max: 99, digits: 2, unit: "km/h" },
          },
          { p3: 5, name: "BEACON DELAY", type: { kind: "int", min: 5, max: 180, digits: 3, unit: "s" } },
        ],
      },
      {
        p2: 3,
        name: "SmartBeac.",
        leaves: [
          { p3: 1, name: "SMART LOW SPEED", type: { kind: "int", min: 2, max: 30, digits: 2 } },
          { p3: 2, name: "SMART HIGH SPEED", type: { kind: "int", min: 3, max: 90, digits: 2 } },
          { p3: 3, name: "SMART SLOW RATE", type: { kind: "int", min: 1, max: 100, digits: 3, unit: "min" } },
          { p3: 4, name: "SMART FAST RATE", type: { kind: "int", min: 10, max: 180, digits: 3, unit: "s" } },
          { p3: 5, name: "SMART TURN ANGLE", type: { kind: "int", min: 5, max: 90, digits: 2, unit: "deg" } },
          { p3: 6, name: "SMART TURN SLOPE", type: { kind: "int", min: 1, max: 255, digits: 3 } },
          { p3: 7, name: "SMART TURN TIME", type: { kind: "int", min: 5, max: 180, digits: 3, unit: "s" } },
        ],
      },
      {
        p2: 4,
        name: "BEACON TEXT",
        leaves: [
          { p3: 1, name: "STATUS TEXT SELECT", type: enumOf("OFF", "TEXT1", "TEXT2", "TEXT3", "TEXT4", "TEXT5") },
          { p3: 2, name: "TX RATE", type: enumOf("1/1", "1/2", "1/3", "1/4", "1/5", "1/6", "1/7", "1/8") },
          { p3: 3, name: "BEACON FREQUENCY", type: enumOf("None", "FREQUENCY", "FREQ & SQL & SHIFT") },
          ...Array.from({ length: 5 }, (_, i): Leaf => ({
            p3: 4 + i,
            name: `STATUS TEXT${i + 1}`,
            type: { kind: "text", maxLen: 60 },
          })),
        ],
      },
    ],
  },
  {
    p1: 8,
    name: "APRS FILTER",
    subgroups: [
      { p2: 1, name: "LIST SETTING", leaves: [{ p3: 1, name: "STATION LIST SORT", type: enumOf("TIME", "CALLSIGN", "DISTANCE") }] },
      {
        p2: 2,
        name: "STATION LIST",
        leaves: [
          { p3: 1, name: "Mic-E", type: onOff },
          { p3: 2, name: "POSITION", type: onOff },
          { p3: 3, name: "WEATHER", type: onOff },
          { p3: 4, name: "OBJECT", type: onOff },
          { p3: 5, name: "ITEM", type: onOff },
          { p3: 6, name: "STATUS", type: onOff },
          { p3: 7, name: "OTHER", type: onOff },
          { p3: 8, name: "ALTNET", type: onOff },
        ],
      },
      {
        p2: 3,
        name: "POPUP",
        leaves: [
          { p3: 1, name: "BEACON", type: enumOf("OFF", "3s", "5s", "10s", "HOLD") },
          { p3: 2, name: "MESSAGE", type: enumOf("OFF", "3s", "5s", "10s", "HOLD") },
          { p3: 3, name: "MY PACKET", type: onOff },
        ],
      },
      {
        p2: 4,
        name: "RINGER",
        leaves: [
          { p3: 1, name: "TX BEACON", type: onOff },
          { p3: 2, name: "RX BEACON", type: onOff },
          { p3: 3, name: "TX MESSAGE", type: onOff },
          { p3: 4, name: "RX MESSAGE", type: onOff },
          { p3: 7, name: "MY PACKET", type: onOff },
        ],
      },
      {
        p2: 6,
        name: "MSG FIL.",
        leaves: [
          ...Array.from({ length: 6 }, (_, i): Leaf => ({
            p3: i + 1,
            name: `MESSAGE GROUP${i + 1}`,
            type: { kind: "text", maxLen: 9 },
          })),
          ...Array.from({ length: 3 }, (_, i): Leaf => ({
            p3: 7 + i,
            name: `BULLETIN ${i + 1}`,
            type: { kind: "text", maxLen: 9 },
          })),
        ],
      },
    ],
  },
  {
    p1: 9,
    name: "PRESET",
    subgroups: Array.from({ length: 5 }, (_, i): SubGroup => ({
      p2: i + 1,
      name: `PRESET${i + 1}`,
      leaves: [
        { p3: 1, name: "PRESET NAME", type: { kind: "text", maxLen: 12 } },
        { p3: 2, name: "CAT-1 RATE", type: enumOf("4800", "9600", "19200", "38400", "115200") },
        { p3: 3, name: "CAT-1 TIME OUT TIMER", type: enumOf("10ms", "100ms", "1000ms", "3000ms") },
        { p3: 4, name: "CAT-1 CAT-3 STOP BIT", type: enumOf("1bit", "2bit") },
        { p3: 5, name: "AGC FAST DELAY", type: { kind: "int", min: 20, max: 4000, digits: 4, step: 20, unit: "ms" } },
        { p3: 6, name: "AGC MID DELAY", type: { kind: "int", min: 20, max: 4000, digits: 4, step: 20, unit: "ms" } },
        { p3: 7, name: "AGC SLOW DELAY", type: { kind: "int", min: 20, max: 4000, digits: 4, step: 20, unit: "ms" } },
        { p3: 8, name: "LCUT FREQ", type: { kind: "int", min: 0, max: 19, digits: 2 } },
        { p3: 9, name: "LCUT SLOPE", type: enumOf("6dB/oct", "18dB/oct") },
        { p3: 10, name: "HCUT FREQ", type: { kind: "int", min: 0, max: 67, digits: 2 } },
        { p3: 11, name: "HCUT SLOPE", type: enumOf("6dB/oct", "18dB/oct") },
        { p3: 12, name: "USB OUT LEVEL", type: { kind: "int", min: 0, max: 100, digits: 3 } },
        {
          p3: 13,
          name: "TX BPF SEL",
          type: enumOf("50–3050", "100–2900", "200–2800", "300–2700", "400–2600"),
        },
        { p3: 14, name: "MOD SOURCE", type: enumOf("MIC", "USB", "REAR", "AUTO") },
        { p3: 15, name: "USB MOD GAIN", type: { kind: "int", min: 0, max: 100, digits: 3 } },
        { p3: 16, name: "RPTT SELECT", type: enumOf("OFF", "RTS", "DTR", "DAKY") },
      ],
    })),
  },
  {
    p1: 11,
    name: "BLUETOOTH",
    subgroups: [
      {
        p2: 1,
        name: "Bluetooth",
        leaves: [
          { p3: 1, name: "Bluetooth", type: onOff },
          { p3: 2, name: "Device Name : Status", type: { kind: "readonly" } },
          { p3: 3, name: "DEVICE LIST", type: { kind: "readonly" } },
          { p3: 4, name: "AUDIO", type: enumOf("AUTO", "FIX") },
        ],
      },
    ],
  },
];

export function findLeaf(p1: number, p2: number, p3: number): Leaf | undefined {
  const g = MENU.find((x) => x.p1 === p1);
  if (!g) return undefined;
  const sub = g.subgroups.find((x) => x.p2 === p2);
  if (!sub) return undefined;
  return sub.leaves.find((x) => x.p3 === p3);
}
