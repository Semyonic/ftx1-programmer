// Mock data for the FTX-1 programmer prototype.
// In real app these come from src/cat/*, src/store/*. Shape mirrors the source codebase.

const MODES = ["LSB","USB","CW-U","FM","AM","RTTY-L","CW-L","DATA-L","RTTY-U","DATA-FM","FM-N","DATA-U","AM-N","PSK","DATA-FM-N","C4FM-DN","C4FM-VW"];

const CTCSS_HZ = [67.0,69.3,71.9,74.4,77.0,79.7,82.5,85.4,88.5,91.5,94.8,97.4,100.0,103.5,107.2,110.9,114.8,118.8,123.0,127.3,131.8,136.5,141.3,146.2,151.4,156.7,159.8,162.2,165.5,167.9,171.3,173.8,177.3,179.9,183.5,186.2,189.9,192.8,196.6,199.5,203.5,206.5,210.7,218.1,225.7,229.1,233.6,241.8,250.3,254.1];

const BAND_GROUP_ORDER = ["1.8MHz","3.5MHz","5MHz","7MHz","10MHz","14MHz","18MHz","21MHz","24MHz","28MHz","50MHz","70MHz","AIR","144MHz","430MHz","GEN"];

const bandGroupForFreq = (hz) => {
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

const formatMHz = (hz) => {
  const s = (hz / 1_000_000).toFixed(6);
  return s.replace(/(\.\d{3,})0+$/, "$1").replace(/\.0+$/, "");
};

// Format Hz as 9-digit padded string with dots: "014250000" -> "014.250.000"
const formatFreqDisplay = (hz) => {
  const s = String(hz).padStart(9, "0");
  return s.slice(0, 3) + "." + s.slice(3, 6) + "." + s.slice(6, 9);
};

// Build mock memory channel data
const SAMPLE_TAGS = [
  ["20m JT-DX", 14074000, "USB", "simplex", "OFF"],
  ["40m FT8", 7074000, "USB", "simplex", "OFF"],
  ["80m DIGI", 3573000, "USB", "simplex", "OFF"],
  ["W7AW REPT", 146940000, "FM", "minus", "CTCSS ENC"],
  ["K7BFL", 147180000, "FM", "plus", "CTCSS ENC"],
  ["KE7TT", 442175000, "FM", "plus", "CTCSS ENC/DEC"],
  ["WX7CYS", 162550000, "FM-N", "simplex", "OFF"],
  ["GMRS 1", 462550000, "FM", "simplex", "OFF"],
  ["MARS 1", 5358500, "USB", "simplex", "OFF"],
  ["20m USB", 14250000, "USB", "simplex", "OFF"],
  ["10m FM", 29600000, "FM", "minus", "CTCSS ENC"],
  ["6m FM", 52525000, "FM", "minus", "OFF"],
  ["2m CALL", 146520000, "FM", "simplex", "OFF"],
  ["70cm CALL", 446000000, "FM", "simplex", "OFF"],
  ["W7DK", 145190000, "FM", "minus", "DCS"],
  ["WW7PSR", 146960000, "FM", "minus", "CTCSS ENC"],
  ["AA7AT", 145290000, "FM", "minus", "CTCSS ENC"],
  ["NW7DX", 145370000, "C4FM-DN", "minus", "OFF"],
  ["KE7HRH", 145430000, "C4FM-DN", "minus", "OFF"],
  ["NB7M", 145490000, "FM", "minus", "CTCSS ENC"],
  ["WB7QXU", 146780000, "FM", "minus", "CTCSS ENC"],
  ["W7ACS", 146820000, "FM", "minus", "CTCSS ENC"],
  ["W7AUX", 146880000, "FM", "minus", "CTCSS ENC"],
  ["WW7RA", 147020000, "FM", "plus", "CTCSS ENC"],
  ["W7AVM", 147080000, "FM", "plus", "CTCSS ENC"],
  ["NCDXF 14", 14100000, "CW-U", "simplex", "OFF"],
  ["NCDXF 18", 18110000, "CW-U", "simplex", "OFF"],
  ["NCDXF 21", 21150000, "CW-U", "simplex", "OFF"],
  ["NCDXF 24", 24930000, "CW-U", "simplex", "OFF"],
  ["NCDXF 28", 28200000, "CW-U", "simplex", "OFF"],
  ["WWV 5MHz", 5000000, "AM", "simplex", "OFF"],
  ["WWV 10MHz", 10000000, "AM", "simplex", "OFF"],
  ["WWV 15MHz", 15000000, "AM", "simplex", "OFF"],
  ["WWV 20MHz", 20000000, "AM", "simplex", "OFF"],
  ["CHU 3.33", 3330000, "USB", "simplex", "OFF"],
  ["CHU 7.85", 7850000, "USB", "simplex", "OFF"],
];

const buildMemoryRows = () => {
  const rows = [];
  // 099 memory slots
  for (let i = 1; i <= 99; i++) {
    const sample = SAMPLE_TAGS[i - 1];
    if (sample && i <= SAMPLE_TAGS.length) {
      rows.push({
        key: `mem-${i}`,
        id: { kind: "memory", n: i },
        label: String(i).padStart(3, "0"),
        tag: sample[0],
        frame: {
          freqHz: sample[1],
          mode: sample[2],
          shift: sample[3],
          ctcssState: sample[4],
          clarifierHz: 0,
          rxClarOn: false,
          txClarOn: false,
        },
        dirty: false,
        error: null,
      });
    } else {
      rows.push({
        key: `mem-${i}`,
        id: { kind: "memory", n: i },
        label: String(i).padStart(3, "0"),
        tag: "",
        frame: null,
        dirty: false,
        error: null,
      });
    }
  }
  // PMS pairs (50)
  for (let i = 1; i <= 50; i++) {
    const sample = i <= 4 ? [
      [`PMS ${i} L`, 14000000 + i * 50000, "USB", "simplex", "OFF"],
      [`PMS ${i} U`, 14350000 - i * 30000, "USB", "simplex", "OFF"],
    ] : null;
    rows.push({
      key: `pms-${i}-L`,
      id: { kind: "pms", n: i, end: "L" },
      label: `P-${String(i).padStart(2,"0")}L`,
      tag: sample ? sample[0][0] : "",
      frame: sample ? {
        freqHz: sample[0][1], mode: sample[0][2], shift: sample[0][3], ctcssState: sample[0][4],
        clarifierHz: 0, rxClarOn: false, txClarOn: false,
      } : null,
      dirty: false,
      error: null,
    });
    rows.push({
      key: `pms-${i}-U`,
      id: { kind: "pms", n: i, end: "U" },
      label: `P-${String(i).padStart(2,"0")}U`,
      tag: sample ? sample[1][0] : "",
      frame: sample ? {
        freqHz: sample[1][1], mode: sample[1][2], shift: sample[1][3], ctcssState: sample[1][4],
        clarifierHz: 0, rxClarOn: false, txClarOn: false,
      } : null,
      dirty: false,
      error: null,
    });
  }
  // EMGCH
  rows.push({
    key: "emergency",
    id: { kind: "emergency" },
    label: "EMGCH",
    tag: "EMERGENCY",
    frame: {
      freqHz: 4630000, mode: "USB", shift: "simplex", ctcssState: "OFF",
      clarifierHz: 0, rxClarOn: false, txClarOn: false,
    },
    dirty: false,
    error: null,
  });
  return rows;
};

const channelLabel = (id) => {
  if (id.kind === "vfo") return "VFO";
  if (id.kind === "memory") return String(id.n).padStart(3, "0");
  if (id.kind === "pms") return `P-${String(id.n).padStart(2,"0")}${id.end}`;
  return "EMGCH";
};

const shiftIcon = (s) => s === "plus" ? "▲" : s === "minus" ? "▼" : "·";

const toneBadge = (st) => {
  switch (st) {
    case "OFF": return null;
    case "CTCSS ENC": return "T-ENC";
    case "CTCSS ENC/DEC": return "T-TSQ";
    case "DCS": return "DCS";
    case "PR FREQ": return "PR";
    case "REV TONE": return "REV";
    default: return st;
  }
};

// Mock CAT log entries
const SAMPLE_LOG = [
  { ts: Date.now() - 18000, dir: "tx", data: "ID;" },
  { ts: Date.now() - 17900, dir: "rx", data: "ID0840;" },
  { ts: Date.now() - 17800, dir: "tx", data: "VE0;" },
  { ts: Date.now() - 17700, dir: "rx", data: "VE0V01.45;" },
  { ts: Date.now() - 17500, dir: "tx", data: "AI0;" },
  { ts: Date.now() - 12000, dir: "tx", data: "FA;" },
  { ts: Date.now() - 11900, dir: "rx", data: "FA014250000;" },
  { ts: Date.now() - 11800, dir: "tx", data: "FB;" },
  { ts: Date.now() - 11700, dir: "rx", data: "FB007100000;" },
  { ts: Date.now() - 11500, dir: "tx", data: "MD0;" },
  { ts: Date.now() - 11400, dir: "rx", data: "MD02;" },
  { ts: Date.now() - 8000, dir: "tx", data: "MR00001;" },
  { ts: Date.now() - 7900, dir: "rx", data: "MR0000101407400000+00000020110001;" },
  { ts: Date.now() - 5000, dir: "tx", data: "SM0;" },
  { ts: Date.now() - 4900, dir: "rx", data: "SM0009;" },
  { ts: Date.now() - 1200, dir: "info", data: "Auto-info OFF, handshake complete." },
];

// Settings menu structure (abridged)
const MENU_GROUPS = [
  { p1: 1, name: "OPERATION SETTING", subgroups: [
    { p2: 1, name: "GENERAL", leaves: [
      { p3: 1, name: "DIMMER", type: "int", min: 1, max: 15, value: 8, desc: "LCD/key backlight brightness" },
      { p3: 2, name: "PEAK HOLD", type: "enum", options: ["OFF","0.5sec","1.0sec","2.0sec"], value: "1.0sec", desc: "S-meter peak hold time" },
      { p3: 3, name: "ZIN/SPOT LEVEL", type: "enum", options: ["50Hz","100Hz","200Hz"], value: "100Hz", desc: "CW Zin tolerance" },
      { p3: 4, name: "CLAR DIAL SEL", type: "enum", options: ["MAIN","CLAR/MIC"], value: "CLAR/MIC", desc: "Which dial drives clarifier" },
      { p3: 5, name: "MIC SCAN", type: "bool", value: true, desc: "Allow scan via mic UP/DOWN" },
      { p3: 6, name: "MIC SCAN RESUME", type: "enum", options: ["PAUSE","TIME"], value: "PAUSE", desc: "Scan resume condition" },
    ]},
    { p2: 2, name: "DISPLAY", leaves: [
      { p3: 1, name: "MY CALL", type: "text", maxLen: 12, value: "KK7XYZ", desc: "Owner callsign on splash" },
      { p3: 2, name: "BAND COLOR MAIN", type: "enum", options: ["BLUE","ORANGE","GREEN","WHITE","PURPLE"], value: "BLUE", desc: "MAIN band edge color" },
      { p3: 3, name: "BAND COLOR SUB", type: "enum", options: ["BLUE","ORANGE","GREEN","WHITE","PURPLE"], value: "ORANGE", desc: "SUB band edge color" },
    ]},
    { p2: 3, name: "REPEATER", leaves: [
      { p3: 16, name: "RPT SHIFT 28MHz", type: "int", min: 0, max: 1000, value: 100, unit: "kHz", desc: "10m repeater offset" },
      { p3: 17, name: "RPT SHIFT 50MHz", type: "int", min: 0, max: 4000, value: 1000, unit: "kHz", desc: "6m repeater offset" },
      { p3: 18, name: "RPT SHIFT 144MHz", type: "int", min: 0, max: 100, value: 12, unit: "×50kHz", desc: "2m repeater offset" },
      { p3: 19, name: "RPT SHIFT 430MHz", type: "int", min: 0, max: 100, value: 100, unit: "×50kHz", desc: "70cm repeater offset" },
    ]},
  ]},
  { p1: 2, name: "RX DSP", subgroups: [
    { p2: 1, name: "AGC", leaves: [
      { p3: 1, name: "AGC FAST DELAY", type: "int", min: 20, max: 4000, value: 300, unit: "ms", desc: "AGC release time, fast" },
      { p3: 2, name: "AGC MID DELAY", type: "int", min: 20, max: 4000, value: 700, unit: "ms" },
      { p3: 3, name: "AGC SLOW DELAY", type: "int", min: 20, max: 4000, value: 3000, unit: "ms" },
    ]},
    { p2: 2, name: "FILTER", leaves: [
      { p3: 1, name: "SSB BANDWIDTH", type: "enum", options: ["1.8kHz","2.4kHz","2.6kHz","2.8kHz","3.0kHz"], value: "2.4kHz" },
      { p3: 2, name: "CW BANDWIDTH", type: "enum", options: ["100Hz","250Hz","500Hz","1.5kHz","2.4kHz"], value: "500Hz" },
      { p3: 3, name: "AM BANDWIDTH", type: "enum", options: ["3kHz","6kHz","9kHz"], value: "6kHz" },
    ]},
  ]},
  { p1: 3, name: "TX AUDIO", subgroups: [
    { p2: 1, name: "MIC", leaves: [
      { p3: 1, name: "MIC GAIN SSB", type: "int", min: 0, max: 100, value: 50 },
      { p3: 2, name: "MIC GAIN AM", type: "int", min: 0, max: 100, value: 30 },
      { p3: 3, name: "MIC GAIN FM", type: "int", min: 0, max: 100, value: 50 },
    ]},
    { p2: 2, name: "PROCESSOR", leaves: [
      { p3: 1, name: "SPEECH PROC", type: "bool", value: false },
      { p3: 2, name: "PROC LEVEL", type: "int", min: 0, max: 100, value: 30 },
    ]},
  ]},
  { p1: 4, name: "CAT/USB", subgroups: [
    { p2: 1, name: "INTERFACE", leaves: [
      { p3: 1, name: "CAT RATE", type: "enum", options: ["4800","9600","19200","38400"], value: "38400", unit: "bps" },
      { p3: 2, name: "CAT TIMEOUT", type: "int", min: 10, max: 3000, value: 1000, unit: "ms" },
      { p3: 3, name: "CAT RTS", type: "bool", value: false },
    ]},
  ]},
];

// Export to window
Object.assign(window, {
  MODES, CTCSS_HZ, BAND_GROUP_ORDER, bandGroupForFreq,
  formatMHz, formatFreqDisplay,
  buildMemoryRows, channelLabel, shiftIcon, toneBadge,
  SAMPLE_LOG, MENU_GROUPS,
});
