import { connectionStore } from "../store/connection";
import { memoryStore, type MemoryRow } from "../store/memory";
import { csvToRows, rowsToCsv } from "../io/csv";
import { isAdms14Csv, parseAdms14Csv } from "../io/adms14-csv";
import { isFt5dDat, parseFt5dDat, type Ft5dImportResult } from "../io/ft5d-dat";
import { downloadFile } from "../io/json";
import {
  CTCSS_HZ,
  type ChannelId,
  type CtcssState,
  type Mode,
  DCS_CODES,
  FREQ_MAX_HZ,
  FREQ_MIN_HZ,
  MODE_BY_CHAR,
  type MemoryFrame,
  validateMemoryTag,
} from "../cat/codec";
import {
  BAND_GROUP_ORDER,
  BAND_SHIFTS,
  type BandGroup,
  bandForFreq,
  bandGroupForFreq,
  formatMHz,
  parseUserFreq,
} from "./freq";
import {
  readCtcssTone,
  readDcsCode,
  readMenu,
  writeMenu,
} from "../cat/commands";
import { SectionTitle, Toggle, ProgressBar } from "./Atoms";

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const MODES = Object.values(MODE_BY_CHAR);
const VALID_MODES: Set<string> = new Set(MODES);

/** Validate an imported record's frame + tag. Returns an error string or null. */
function validateImportRecord(frame: MemoryFrame, tag: string): string | null {
  const errors: string[] = [];
  if (frame.freqHz < FREQ_MIN_HZ || frame.freqHz > FREQ_MAX_HZ) {
    errors.push(`frequency ${frame.freqHz} Hz out of range`);
  }
  if (!VALID_MODES.has(frame.mode)) {
    errors.push(`invalid mode "${frame.mode}"`);
  }
  try {
    validateMemoryTag(tag);
  } catch (e) {
    errors.push((e as Error).message);
  }
  return errors.length > 0 ? errors.join("; ") : null;
}

/** Max file size for imports: 10 MB for CSV, 1 MB for .dat */
const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_DAT_BYTES = 1 * 1024 * 1024;

const channelLabel = (id: ChannelId): string => {
  switch (id.kind) {
    case "vfo":
      return "VFO";
    case "memory":
      return id.n.toString().padStart(3, "0");
    case "pms":
      return `P-${id.n.toString().padStart(2, "0")}${id.end}`;
    case "emergency":
      return "EMGCH";
  }
};

const shiftIcon = (s: MemoryFrame["shift"]) =>
  s === "plus" ? "▲" : s === "minus" ? "▼" : "·";

const toneBadge = (st: CtcssState): string | null => {
  switch (st) {
    case "OFF":
      return null;
    case "CTCSS ENC":
      return "T-ENC";
    case "CTCSS ENC/DEC":
      return "T-TSQ";
    case "DCS":
      return "DCS";
    case "PR FREQ":
      return "PR";
    case "REV TONE":
      return "REV";
    default:
      return st;
  }
};

const TAG_PREFIX_RE = /^(\d{1,3})-/;
const tagPrefixFromText = (tag: string): string => {
  const m = tag.match(TAG_PREFIX_RE);
  return m ? m[1] : "—";
};

const defaultFrame = (id: ChannelId): MemoryFrame => ({
  channel: id,
  freqHz: 14_250_000,
  clarifierHz: 0,
  rxClarOn: false,
  txClarOn: false,
  mode: "USB",
  vfoMem: id.kind === "pms" ? "PMS" : "Memory",
  ctcssState: "OFF",
  shift: "simplex",
});

type Section = "memory" | "pms" | "emergency";

const SECTIONS: { id: Section; label: string; pred: (r: MemoryRow) => boolean }[] = [
  { id: "memory", label: "Memory 001-099", pred: (r) => r.id.kind === "memory" },
  { id: "pms", label: "PMS pairs (50)", pred: (r) => r.id.kind === "pms" },
  { id: "emergency", label: "Emergency", pred: (r) => r.id.kind === "emergency" },
];

/* ------------------------------------------------------------------ */
/*  DOM helpers                                                        */
/* ------------------------------------------------------------------ */

function css(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  for (const [k, v] of Object.entries(styles)) {
    (el.style as any)[k] = v;
  }
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, any>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style" && typeof v === "object") {
        css(el, v);
      } else if (k === "className") {
        el.className = v;
      } else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === "disabled") {
        (el as any).disabled = v;
      } else if (k === "checked") {
        (el as any).checked = v;
      } else if (k === "value") {
        (el as any).value = v;
      } else if (k === "maxLength") {
        (el as any).maxLength = v;
      } else if (k === "placeholder") {
        (el as any).placeholder = v;
      } else if (k === "type") {
        (el as any).type = v;
      } else if (k === "inputMode") {
        el.setAttribute("inputmode", v);
      } else if (k === "accept") {
        el.setAttribute("accept", v);
      } else if (k === "colSpan") {
        (el as any).colSpan = v;
      } else if (k === "title") {
        el.title = v;
      } else if (k === "htmlFor") {
        (el as any).htmlFor = v;
      } else if (k === "min") {
        (el as any).min = v;
      } else if (k === "max") {
        (el as any).max = v;
      } else if (typeof v === "string") {
        el.setAttribute(k, v);
      }
    }
  }
  for (const c of children) {
    if (typeof c === "string") {
      el.appendChild(document.createTextNode(c));
    } else if (c) {
      el.appendChild(c);
    }
  }
  return el;
}

/** Remove all child nodes from an element (safe alternative to innerHTML = ""). */
function clearChildren(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/* ------------------------------------------------------------------ */
/*  FreqCell -- inline frequency editor                                */
/* ------------------------------------------------------------------ */

function createFreqCell(hz: number | null, onCommit: (hz: number) => void): HTMLInputElement {
  const input = h("input", {
    type: "text",
    inputMode: "decimal",
    className: "row-input",
    placeholder: "439.200",
    value: hz !== null ? formatMHz(hz) : "",
    style: { textAlign: "right", width: "120px" },
  });
  let editText: string | null = null;

  input.addEventListener("focus", () => {
    editText = null;
  });

  input.addEventListener("input", () => {
    editText = input.value;
  });

  input.addEventListener("blur", () => {
    if (editText === null) return;
    const parsed = parseUserFreq(editText);
    if (parsed !== null) onCommit(parsed);
    editText = null;
    input.value = hz !== null ? formatMHz(hz) : "";
  });

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      editText = null;
      input.value = hz !== null ? formatMHz(hz) : "";
    }
  });

  return input;
}

/* ------------------------------------------------------------------ */
/*  MemoryPanel class                                                  */
/* ------------------------------------------------------------------ */

export class MemoryPanel {
  el: HTMLElement;
  private unsubs: (() => void)[] = [];
  private filter = "";
  private hideEmpty = true;
  private section: Section = "memory";
  private groupBy: "band" | "tag" | "none" = "band";
  private cityMap = new Map<number, string>();
  private autoRead = false;
  private busy = false;
  private selected: string | null = null;
  private editDialog: EditDialog | null = null;

  // DOM refs
  private toolbarEl!: HTMLElement;
  private statusBarEl!: HTMLElement;
  private tableWrapEl!: HTMLElement;
  private tbodyEl!: HTMLTableSectionElement;
  private dialogContainer!: HTMLElement;

  // Toolbar buttons/controls for quick updates
  private readBtn!: HTMLButtonElement;
  private writeBtn!: HTMLButtonElement;
  private sectionBtns: HTMLButtonElement[] = [];
  private groupBtns: HTMLButtonElement[] = [];
  private groupBarEl!: HTMLElement;
  private hideEmptyToggle!: ReturnType<typeof Toggle>;
  private filterInput!: HTMLInputElement;

  constructor() {
    this.el = h("div", { style: { display: "flex", flexDirection: "column", height: "100%", gap: "10px" } });
    this.buildToolbar();
    this.buildStatusBar();
    this.buildTable();
    this.dialogContainer = h("div");
    this.el.appendChild(this.toolbarEl);
    this.el.appendChild(this.statusBarEl);
    this.el.appendChild(this.tableWrapEl);
    this.el.appendChild(this.dialogContainer);
  }

  mount() {
    const mem = memoryStore.getState();
    if (mem.rows.length === 0) mem.init();

    this.unsubs.push(
      memoryStore.subscribe(() => this.onStoreChange()),
      connectionStore.subscribe(() => this.onConnectionChange()),
    );

    this.onConnectionChange();
    this.render();
  }

  unmount() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.editDialog) {
      this.editDialog.destroy();
      this.editDialog = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Toolbar                                                          */
  /* ---------------------------------------------------------------- */

  private buildToolbar() {
    this.readBtn = h("button", { className: "btn btn-primary" }, "↓ Read all");
    this.readBtn.addEventListener("click", () => void this.onReadAll());

    this.writeBtn = h("button", { className: "btn" }, "↑ Write 0 unsaved");
    this.writeBtn.addEventListener("click", () => void this.onWriteDirty());

    const sep1 = h("div", { style: { width: "1px", height: "22px", background: "var(--line)" } });

    const exportBtn = h("button", { className: "btn" }, "Export CSV");
    exportBtn.addEventListener("click", () => this.onExport());

    const fileInput = h("input", { type: "file", accept: ".csv,.dat,text/csv", style: { display: "none" } });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) void this.onImport(file);
    });
    const importLabel = h("label", {
      className: "btn",
      style: { cursor: "pointer" },
      title: "Auto-detects FT5D SD card (MEMORY.dat), ADMS-14 CSV, and our own CSV format.",
    }, "Import…", fileInput);

    const sep2 = h("div", { style: { width: "1px", height: "22px", background: "var(--line)" } });

    // Section buttons
    this.sectionBtns = SECTIONS.map((s) => {
      const btn = h("button", { className: "btn" }, s.label);
      btn.addEventListener("click", () => {
        this.section = s.id;
        this.render();
      });
      return btn;
    });

    // Group bar (only visible when section === "memory")
    const sep3 = h("div", { style: { width: "1px", height: "22px", background: "var(--line)" } });
    const groupLabel = h("span", {
      style: { fontSize: "10px", color: "var(--ink-faint)", letterSpacing: "0.1em", textTransform: "uppercase" },
    }, "group");

    const groupNames = ["band", "tag", "none"] as const;
    const groupLabels: Record<string, string> = { band: "Band", tag: "City", none: "Flat" };
    this.groupBtns = groupNames.map((g) => {
      const btn = h("button", { className: "btn", style: { fontSize: "11px", padding: "5px 10px" } }, groupLabels[g]);
      btn.addEventListener("click", () => {
        this.groupBy = g;
        this.render();
      });
      return btn;
    });
    this.groupBarEl = h("span", { style: { display: "contents" } }, sep3, groupLabel, ...this.groupBtns);

    // Right side: hide empty + filter
    this.hideEmptyToggle = Toggle({ checked: this.hideEmpty, label: "Hide empty" });
    const toggleWrap = this.hideEmptyToggle.el;
    // Listen for checkbox change inside the toggle
    const toggleCb = toggleWrap.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (toggleCb) {
      toggleCb.addEventListener("change", () => {
        this.hideEmpty = toggleCb.checked;
        this.render();
      });
    }

    this.filterInput = h("input", {
      className: "ctrl",
      placeholder: "filter ch / tag / freq / mode",
      style: { width: "220px" },
    });
    this.filterInput.addEventListener("input", () => {
      this.filter = this.filterInput.value;
      this.renderTable();
      this.renderStatusBar();
    });

    const rightSide = h("div", {
      style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" },
    }, toggleWrap, this.filterInput);

    this.toolbarEl = h("div", {
      className: "card",
      style: { padding: "10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" },
    },
      this.readBtn, this.writeBtn, sep1, exportBtn, importLabel, sep2,
      ...this.sectionBtns,
      this.groupBarEl,
      rightSide,
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Status bar                                                       */
  /* ---------------------------------------------------------------- */

  private buildStatusBar() {
    this.statusBarEl = h("div", {
      style: { display: "flex", alignItems: "center", gap: "16px", fontSize: "11px", color: "var(--ink-mute)", padding: "0 4px" },
    });
  }

  private renderStatusBar() {
    const mem = memoryStore.getState();
    const sectionRows = mem.rows.filter(SECTIONS.find((s) => s.id === this.section)!.pred);
    const used = sectionRows.filter((r) => r.frame !== null).length;
    const total = sectionRows.length;
    const dirty = sectionRows.filter((r) => r.dirty).length;

    const parts: HTMLElement[] = [];

    // Channel counts
    const countSpan = h("span", {},
      h("span", { style: { color: "var(--ink-faint)" } }, `${this.section} · `),
      h("strong", { style: { color: "var(--ink)" } }, String(used)),
      h("span", { style: { color: "var(--ink-faint)" } }, `/${total} used`),
    );
    parts.push(countSpan);

    // Dirty count
    if (dirty > 0) {
      parts.push(h("span", { style: { color: "var(--warn)" } }, `● ${dirty} unsaved`));
    }

    // Reading progress
    if (mem.progress.total > 0 && mem.reading) {
      const progBar = ProgressBar({ value: mem.progress.done, max: mem.progress.total });
      const readingSpan = h("span", {
        style: { display: "flex", alignItems: "center", gap: "8px", flex: "1", maxWidth: "280px" },
      },
        h("span", {}, `reading ${mem.progress.done}/${mem.progress.total}`),
        progBar.el,
      );
      parts.push(readingSpan);
    }

    // Writing progress
    if (mem.progress.total > 0 && mem.writing) {
      parts.push(h("span", {
        style: { display: "flex", alignItems: "center", gap: "8px", color: "var(--ok)" },
      }, `writing ${mem.progress.done}/${mem.progress.total}`));
    }

    // Hint
    const hint = h("span", {
      style: { marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--ink-faint)" },
    }, "double-click row to edit · ↑↓ navigate");
    parts.push(hint);

    clearChildren(this.statusBarEl);
    for (const p of parts) {
      this.statusBarEl.appendChild(p);
    }

    // Update write button label
    this.writeBtn.textContent = `↑ Write ${dirty} unsaved`;
  }

  /* ---------------------------------------------------------------- */
  /*  Table                                                            */
  /* ---------------------------------------------------------------- */

  private buildTable() {
    const thead = h("thead", {},
      h("tr", {},
        h("th", { style: { width: "80px" } }, "Ch"),
        h("th", { style: { width: "160px" } }, "Tag"),
        h("th", { style: { textAlign: "right", width: "180px" } }, "Frequency · MHz"),
        h("th", { style: { width: "120px" } }, "Mode"),
        h("th", { style: { textAlign: "center", width: "60px" } }, "Shift"),
        h("th", { style: { width: "100px" } }, "Tone"),
        h("th", { style: { textAlign: "right", width: "90px" } }, "Clar"),
        h("th", { style: { width: "110px" } }, "State"),
        h("th"),
      ),
    );
    this.tbodyEl = h("tbody");
    const table = h("table", { className: "grid" }, thead, this.tbodyEl);
    this.tableWrapEl = h("div", {
      className: "card scroll-thin",
      style: { flex: "1", overflow: "auto", minHeight: "0" },
    }, table);
  }

  private getFilteredRows(): MemoryRow[] {
    const mem = memoryStore.getState();
    const sectionPred = SECTIONS.find((s) => s.id === this.section)!.pred;
    let rows = mem.rows.filter(sectionPred);
    if (this.hideEmpty) rows = rows.filter((r) => r.frame !== null || r.dirty);
    const q = this.filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        channelLabel(r.id).toLowerCase().includes(q) ||
        r.tag.toLowerCase().includes(q) ||
        (r.frame ? formatMHz(r.frame.freqHz).includes(q) : false) ||
        (r.frame ? r.frame.mode.toLowerCase().includes(q) : false),
    );
  }

  private getGrouped(filtered: MemoryRow[]): { label: string; rows: MemoryRow[] }[] | null {
    if (this.section !== "memory" || this.groupBy === "none") return null;
    if (this.groupBy === "band") {
      const map = new Map<BandGroup, MemoryRow[]>();
      for (const r of filtered) {
        const b = r.frame ? bandGroupForFreq(r.frame.freqHz) : "GEN";
        if (!map.has(b)) map.set(b, []);
        map.get(b)!.push(r);
      }
      return BAND_GROUP_ORDER.filter((b) => map.has(b)).map((b) => ({
        label: b,
        rows: map.get(b)!,
      }));
    }
    // group by tag prefix (city)
    const map = new Map<string, MemoryRow[]>();
    for (const r of filtered) {
      const chNum = r.id.kind === "memory" ? r.id.n : 0;
      const prefix = this.cityMap.get(chNum) ?? tagPrefixFromText(r.tag);
      if (!map.has(prefix)) map.set(prefix, []);
      map.get(prefix)!.push(r);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([label, rows]) => ({ label, rows }));
  }

  private renderRow(row: MemoryRow): HTMLTableRowElement {
    const mem = memoryStore.getState();
    const empty = !row.frame;
    const tr = h("tr", { className: "row" });
    tr.dataset.dirty = String(row.dirty);
    tr.dataset.empty = String(empty);
    tr.dataset.selected = String(this.selected === row.key);
    tr.addEventListener("click", () => {
      this.selected = row.key;
      this.renderTable();
    });
    tr.addEventListener("dblclick", () => this.openEditDialog(row.key));

    // Ch
    const tdCh = h("td", {},
      h("span", { style: { color: "var(--accent)" } }, channelLabel(row.id)),
    );

    // Tag (editable)
    const tagInput = h("input", {
      className: "row-input",
      value: row.tag,
      maxLength: 12,
      placeholder: empty ? "—" : "",
    });
    tagInput.addEventListener("input", () => {
      mem.setRow(row.key, {
        tag: tagInput.value,
        dirty: true,
        frame: row.frame ?? defaultFrame(row.id),
      });
    });
    tagInput.addEventListener("click", (e: Event) => e.stopPropagation());
    const tdTag = h("td", {}, tagInput);

    // Frequency
    const tdFreq = h("td", { style: { textAlign: "right" } });
    if (row.frame) {
      const freqInput = createFreqCell(row.frame.freqHz, (hz) => {
        const f = row.frame ?? defaultFrame(row.id);
        mem.setRow(row.key, { frame: { ...f, freqHz: hz }, dirty: true });
      });
      tdFreq.appendChild(freqInput);
    } else {
      tdFreq.appendChild(h("span", { style: { color: "var(--ink-ghost)" } }, "—.———"));
    }

    // Mode
    const tdMode = h("td");
    if (row.frame) {
      const select = h("select", {
        value: row.frame.mode,
        style: {
          background: "transparent",
          border: "none",
          color: "inherit",
          fontFamily: "inherit",
          fontSize: "inherit",
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          padding: "0",
          cursor: "pointer",
        },
      });
      for (const m of MODES) {
        const opt = h("option", { value: m }, m);
        if (m === row.frame.mode) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        const f = row.frame ?? defaultFrame(row.id);
        mem.setRow(row.key, { frame: { ...f, mode: select.value as Mode }, dirty: true });
      });
      select.addEventListener("click", (e: Event) => e.stopPropagation());
      tdMode.appendChild(select);
    } else {
      tdMode.appendChild(h("span", { style: { color: "var(--ink-ghost)" } }, "—"));
    }

    // Shift
    const shiftColor = row.frame?.shift === "plus" ? "var(--ok)" : row.frame?.shift === "minus" ? "var(--warn)" : "var(--ink-faint)";
    const tdShift = h("td", {
      style: { textAlign: "center", color: shiftColor, fontWeight: "700" },
    }, row.frame ? shiftIcon(row.frame.shift) : "—");

    // Tone
    const tdTone = h("td");
    if (row.frame && toneBadge(row.frame.ctcssState)) {
      tdTone.appendChild(h("span", { className: "chip chip-accent" }, toneBadge(row.frame.ctcssState)!));
    } else {
      tdTone.appendChild(h("span", { style: { color: "var(--ink-ghost)" } }, "—"));
    }

    // Clar
    const tdClar = h("td", { style: { textAlign: "right" } });
    if (row.frame && row.frame.clarifierHz !== 0) {
      tdClar.textContent = (row.frame.clarifierHz > 0 ? "+" : "") + row.frame.clarifierHz;
    }

    // State
    const tdState = h("td");
    if (row.error) {
      tdState.appendChild(h("span", { className: "chip chip-err" }, "err"));
    } else if (row.dirty) {
      tdState.appendChild(h("span", { className: "chip chip-warn" }, "● modified"));
    } else if (empty) {
      tdState.appendChild(h("span", { style: { color: "var(--ink-ghost)", fontSize: "11px" } }, "empty"));
    } else {
      tdState.appendChild(h("span", { className: "chip chip-ok" }, "✓ saved"));
    }

    // Edit button
    const editBtn = h("button", {
      className: "btn-ghost btn",
      style: { fontSize: "10px" },
    }, "EDIT →");
    editBtn.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      this.openEditDialog(row.key);
    });
    const tdEdit = h("td", { style: { textAlign: "right" } }, editBtn);

    tr.appendChild(tdCh);
    tr.appendChild(tdTag);
    tr.appendChild(tdFreq);
    tr.appendChild(tdMode);
    tr.appendChild(tdShift);
    tr.appendChild(tdTone);
    tr.appendChild(tdClar);
    tr.appendChild(tdState);
    tr.appendChild(tdEdit);

    return tr;
  }

  private renderTable() {
    const filtered = this.getFilteredRows();
    const grouped = this.getGrouped(filtered);

    clearChildren(this.tbodyEl);

    if (filtered.length === 0) {
      const emptyRow = h("tr", {},
        h("td", {
          colSpan: 9,
          style: { padding: "60px", textAlign: "center", color: "var(--ink-faint)" },
        }, "No rows. Uncheck \"Hide empty\" to show unprogrammed channels."),
      );
      this.tbodyEl.appendChild(emptyRow);
      return;
    }

    if (grouped) {
      for (const g of grouped) {
        const hdr = h("tr", { className: "group-header" },
          h("td", { colSpan: 9 }, `${g.label} · ${g.rows.length} channel${g.rows.length === 1 ? "" : "s"}`),
        );
        this.tbodyEl.appendChild(hdr);
        for (const row of g.rows) {
          this.tbodyEl.appendChild(this.renderRow(row));
        }
      }
    } else {
      for (const row of filtered) {
        this.tbodyEl.appendChild(this.renderRow(row));
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Toolbar rendering                                                */
  /* ---------------------------------------------------------------- */

  private renderToolbar() {
    const conn = connectionStore.getState();
    const mem = memoryStore.getState();
    const sectionRows = mem.rows.filter(SECTIONS.find((s) => s.id === this.section)!.pred);
    const dirty = sectionRows.filter((r) => r.dirty).length;

    // Read button
    this.readBtn.disabled = this.busy || !conn.transport || mem.reading;
    this.readBtn.textContent = mem.reading ? "Reading…" : "↓ Read all";

    // Write button
    this.writeBtn.disabled = this.busy || !conn.transport || !conn.writesEnabled || dirty === 0;
    this.writeBtn.textContent = `↑ Write ${dirty} unsaved`;

    // Section buttons
    for (let i = 0; i < SECTIONS.length; i++) {
      const btn = this.sectionBtns[i];
      const active = this.section === SECTIONS[i].id;
      if (active) {
        css(btn, {
          background: "var(--accent)",
          color: "var(--bg-deep)",
          borderColor: "var(--accent)",
        });
      } else {
        css(btn, { background: "", color: "", borderColor: "" });
      }
    }

    // Group bar visibility
    this.groupBarEl.style.display = this.section === "memory" ? "contents" : "none";

    // Group buttons
    const groupNames = ["band", "tag", "none"] as const;
    for (let i = 0; i < groupNames.length; i++) {
      const btn = this.groupBtns[i];
      const active = this.groupBy === groupNames[i];
      css(btn, {
        background: active ? "var(--accent-soft)" : "var(--bg-elev)",
        color: active ? "var(--accent)" : "var(--ink)",
      });
    }

    // Hide empty toggle
    this.hideEmptyToggle.update({ checked: this.hideEmpty, label: "Hide empty" });
  }

  /* ---------------------------------------------------------------- */
  /*  Full render (called on store change)                             */
  /* ---------------------------------------------------------------- */

  private render() {
    const conn = connectionStore.getState();

    // Not connected overlay
    if (conn.status !== "connected" && !conn.dryRun) {
      clearChildren(this.el);
      this.el.appendChild(this.buildNotConnected());
      return;
    }

    // Rebuild normal layout if was showing not-connected
    if (!this.el.contains(this.toolbarEl)) {
      clearChildren(this.el);
      this.el.appendChild(this.toolbarEl);
      this.el.appendChild(this.statusBarEl);
      this.el.appendChild(this.tableWrapEl);
      this.el.appendChild(this.dialogContainer);
    }

    this.renderToolbar();
    this.renderStatusBar();
    this.renderTable();
  }

  private buildNotConnected(): HTMLElement {
    const wrapper = h("div", { style: { display: "grid", placeItems: "center", padding: "60px" } },
      h("div", { className: "card", style: { padding: "36px", maxWidth: "420px", textAlign: "center" } },
        h("div", { className: "led led-err", style: { width: "14px", height: "14px", margin: "0 auto 14px" } }),
        h("div", { style: { fontSize: "16px", fontWeight: "600", marginBottom: "6px" } }, "No radio connected"),
        h("div", { style: { fontSize: "13px", color: "var(--ink-faint)" } }, "Connect first, or enable Dry run."),
      ),
    );
    return wrapper;
  }

  /* ---------------------------------------------------------------- */
  /*  Store change handlers                                            */
  /* ---------------------------------------------------------------- */

  private onStoreChange() {
    this.render();
  }

  private onConnectionChange() {
    const conn = connectionStore.getState();

    // Reset autoRead flag on disconnect
    if (conn.status !== "connected") {
      this.autoRead = false;
    }

    // Auto-read on first connect
    if (!this.autoRead && conn.status === "connected" && conn.transport) {
      const mem = memoryStore.getState();
      if (!mem.reading) {
        const hasAnyFrame = mem.rows.some((r) => r.frame !== null);
        if (!hasAnyFrame) {
          this.autoRead = true;
          this.busy = true;
          void mem.readAll(conn.transport).finally(() => {
            this.busy = false;
            this.render();
          });
        }
      }
    }

    this.render();
  }

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

  private async onReadAll() {
    const conn = connectionStore.getState();
    if (!conn.transport) return;
    this.busy = true;
    this.render();
    try {
      await memoryStore.getState().readAll(conn.transport);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async onWriteDirty() {
    const conn = connectionStore.getState();
    if (!conn.transport || !conn.writesEnabled) return;
    this.busy = true;
    this.render();
    try {
      const r = await memoryStore.getState().writeDirty(conn.transport);
      console.log("write result", r);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private onExport() {
    const csv = rowsToCsv(memoryStore.getState().rows);
    downloadFile("ftx1-memory.csv", csv, "text/csv");
  }

  private onImportFt5dDat(buf: ArrayBuffer) {
    const result: Ft5dImportResult = parseFt5dDat(buf);
    this.cityMap = result.cityMap;
    const mem = memoryStore.getState();
    let applied = 0;
    let unmatched = 0;
    let errored = 0;
    for (const rec of result.records) {
      const target = mem.rows.find(
        (r) =>
          r.id.kind === "memory" &&
          rec.channel.kind === "memory" &&
          r.id.n === rec.channel.n,
      );
      if (!target) {
        unmatched++;
        continue;
      }
      const validationErr = validateImportRecord(rec.frame, rec.tag);
      if (validationErr) {
        mem.setRow(target.key, {
          tag: rec.tag,
          dirty: false,
          error: `Import validation: ${validationErr}`,
          frame: rec.frame,
          pendingToneIdx: rec.pendingToneIdx,
          pendingDcsIdx: rec.pendingDcsIdx,
        });
        errored++;
        continue;
      }
      mem.setRow(target.key, {
        tag: rec.tag,
        dirty: true,
        error: null,
        frame: rec.frame,
        pendingToneIdx: rec.pendingToneIdx,
        pendingDcsIdx: rec.pendingDcsIdx,
      });
      applied++;
    }
    const lines = [
      `FT5D SD card (MEMORY.dat) import:`,
      `Imported ${applied} channel${applied === 1 ? "" : "s"}.`,
    ];
    if (errored > 0) lines.push(`${errored} row${errored === 1 ? "" : "s"} failed validation (marked as error).`);
    if (unmatched > 0) lines.push(`${unmatched} unmatched.`);
    if (result.skippedRows > 0) lines.push(`${result.skippedRows} empty/invalid rows skipped.`);
    if (result.warnings.length > 0) {
      lines.push("");
      lines.push("Notes:");
      for (const w of result.warnings) lines.push(`• ${w}`);
    }
    lines.push("");
    lines.push(`Click "Write ${applied} dirty" to push to the radio.`);
    window.alert(lines.join("\n"));
  }

  private async onImport(file: File) {
    const isDat = file.name.toLowerCase().endsWith(".dat");
    const sizeLimit = isDat ? MAX_DAT_BYTES : MAX_CSV_BYTES;
    if (file.size > sizeLimit) {
      window.alert(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). ` +
          `Maximum is ${sizeLimit / 1024 / 1024} MB for ${isDat ? ".dat" : "CSV"} imports.`,
      );
      return;
    }
    if (isDat) {
      const buf = await file.arrayBuffer();
      if (isFt5dDat(buf)) {
        this.onImportFt5dDat(buf);
        return;
      }
    }
    const text = await file.text();
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    if (isAdms14Csv(firstLine)) {
      this.onImportAdms14(text);
      return;
    }
    let parsed;
    try {
      parsed = csvToRows(text);
    } catch (err) {
      window.alert(`CSV parse error: ${(err as Error).message}`);
      return;
    }
    const mem = memoryStore.getState();
    let applied = 0;
    let unmatched = 0;
    let errored = 0;
    for (const row of parsed) {
      const target = mem.rows.find((r) => channelLabel(r.id) === row.channel);
      if (!target) {
        unmatched++;
        continue;
      }
      if (row.error) {
        mem.setRow(target.key, {
          tag: row.tag,
          dirty: false,
          error: `Import validation: ${row.error}`,
          frame: {
            ...(target.frame ?? defaultFrame(target.id)),
            freqHz: row.freqHz,
            mode: row.mode as Mode,
            clarifierHz: row.clarifierHz,
            rxClarOn: row.rxClarOn,
            txClarOn: row.txClarOn,
            shift: row.shift,
            ctcssState: row.ctcssState as CtcssState,
          },
        });
        errored++;
        continue;
      }
      const f = target.frame ?? defaultFrame(target.id);
      mem.setRow(target.key, {
        tag: row.tag,
        dirty: true,
        error: null,
        frame: {
          ...f,
          freqHz: row.freqHz,
          mode: row.mode as Mode,
          clarifierHz: row.clarifierHz,
          rxClarOn: row.rxClarOn,
          txClarOn: row.txClarOn,
          shift: row.shift,
          ctcssState: row.ctcssState as CtcssState,
        },
      });
      applied++;
    }
    const parts = [`Imported ${applied} channel${applied === 1 ? "" : "s"}.`];
    if (errored > 0) parts.push(`${errored} row${errored === 1 ? "" : "s"} failed validation (marked as error).`);
    if (unmatched > 0) parts.push(`${unmatched} unmatched (channel labels not found).`);
    parts.push(`Click "Write ${applied} dirty" to push to the radio.`);
    window.alert(parts.join(" "));
  }

  private onImportAdms14(text: string) {
    const result = parseAdms14Csv(text);
    const mem = memoryStore.getState();
    let applied = 0;
    let unmatched = 0;
    let errored = 0;
    for (const rec of result.records) {
      const target = mem.rows.find(
        (r) =>
          r.id.kind === "memory" &&
          rec.channel.kind === "memory" &&
          r.id.n === rec.channel.n,
      );
      if (!target) {
        unmatched++;
        continue;
      }
      const validationErr = validateImportRecord(rec.frame, rec.tag);
      if (validationErr) {
        mem.setRow(target.key, {
          tag: rec.tag,
          dirty: false,
          error: `Import validation: ${validationErr}`,
          frame: rec.frame,
          pendingToneIdx: rec.pendingToneIdx,
          pendingDcsIdx: rec.pendingDcsIdx,
        });
        errored++;
        continue;
      }
      mem.setRow(target.key, {
        tag: rec.tag,
        dirty: true,
        error: null,
        frame: rec.frame,
        pendingToneIdx: rec.pendingToneIdx,
        pendingDcsIdx: rec.pendingDcsIdx,
      });
      applied++;
    }
    const lines = [
      `ADMS-14 (FT5DR/DE) import:`,
      `Imported ${applied} channel${applied === 1 ? "" : "s"}.`,
    ];
    if (errored > 0) lines.push(`${errored} row${errored === 1 ? "" : "s"} failed validation (marked as error).`);
    if (unmatched > 0) lines.push(`${unmatched} unmatched.`);
    if (result.skippedRows > 0) lines.push(`${result.skippedRows} empty rows skipped.`);
    if (result.warnings.length > 0) {
      lines.push("");
      lines.push("Notes:");
      for (const w of result.warnings) lines.push(`• ${w}`);
    }
    lines.push("");
    lines.push(`Click "Write ${applied} dirty" to push to the radio.`);
    window.alert(lines.join("\n"));
  }

  /* ---------------------------------------------------------------- */
  /*  Edit dialog                                                      */
  /* ---------------------------------------------------------------- */

  private openEditDialog(rowKey: string) {
    if (this.editDialog) {
      this.editDialog.destroy();
    }
    this.editDialog = new EditDialog(rowKey, () => {
      this.editDialog = null;
      clearChildren(this.dialogContainer);
      this.render();
    });
    clearChildren(this.dialogContainer);
    this.dialogContainer.appendChild(this.editDialog.el);
  }
}

/* ------------------------------------------------------------------ */
/*  EditDialog                                                         */
/* ------------------------------------------------------------------ */

class EditDialog {
  el: HTMLElement;
  private unsub: (() => void) | null = null;
  private rowKey: string;
  private onClose: () => void;
  private bandShiftRaw: string | null = null;
  private bandShiftBusy = false;
  private contentEl!: HTMLElement;
  private initialReadDone = false;

  constructor(rowKey: string, onClose: () => void) {
    this.rowKey = rowKey;
    this.onClose = onClose;
    this.el = h("div", { className: "modal-backdrop" });
    this.el.addEventListener("click", () => this.onClose());
    this.buildContent();
    this.unsub = memoryStore.subscribe(() => this.rebuildContent());
    this.readInitialValues();
  }

  destroy() {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
  }

  private readInitialValues() {
    if (this.initialReadDone) return;
    this.initialReadDone = true;

    const conn = connectionStore.getState();
    const transport = conn.transport;
    const mem = memoryStore.getState();
    const row = mem.rows.find((r) => r.key === this.rowKey);
    if (!transport || !row) return;

    const f = row.frame ?? defaultFrame(row.id);
    const band = bandForFreq(f.freqHz);

    if (row.pendingToneIdx === undefined) {
      void readCtcssTone(transport, "main")
        .then((idx) => memoryStore.getState().setRow(this.rowKey, { pendingToneIdx: idx }))
        .catch(() => undefined);
    }
    if (row.pendingDcsIdx === undefined) {
      void readDcsCode(transport, "main")
        .then((idx) => memoryStore.getState().setRow(this.rowKey, { pendingDcsIdx: idx }))
        .catch(() => undefined);
    }
    if (band) {
      void readMenu(transport, band.p1, band.p2, band.p3)
        .then((raw) => {
          this.bandShiftRaw = raw;
          this.rebuildContent();
        })
        .catch(() => undefined);
    }
  }

  private buildContent() {
    const mem = memoryStore.getState();
    const conn = connectionStore.getState();
    const row = mem.rows.find((r) => r.key === this.rowKey);
    if (!row) return;

    const f = row.frame ?? defaultFrame(row.id);
    const band = bandForFreq(f.freqHz);
    const toneIdx = row.pendingToneIdx ?? null;
    const dcsIdx = row.pendingDcsIdx ?? null;

    const update = (patch: Partial<MemoryFrame>) =>
      mem.setRow(this.rowKey, { frame: { ...f, ...patch }, dirty: true });

    const applyTone = (idx: number) => {
      mem.setRow(this.rowKey, { pendingToneIdx: idx, dirty: true });
    };

    const applyDcs = (idx: number) => {
      mem.setRow(this.rowKey, { pendingDcsIdx: idx, dirty: true });
    };

    const stateNeedsTone = f.ctcssState === "CTCSS ENC" || f.ctcssState === "CTCSS ENC/DEC";
    const stateNeedsDcs = f.ctcssState === "DCS";

    // SectionTitle
    const escBtn = h("button", { className: "btn-ghost btn" }, "esc ×");
    escBtn.addEventListener("click", () => this.onClose());
    const titleBar = SectionTitle({
      children: row.tag || "(unnamed)",
      hint: `Channel ${channelLabel(row.id)}${band ? ` · ${band.band}` : ""}`,
      right: escBtn,
    });

    // Grid content
    const gridEl = h("div", {
      style: { padding: "18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" },
    });

    // Tag field
    const tagInput = h("input", {
      className: "ctrl",
      value: row.tag,
      maxLength: 12,
      style: { width: "100%" },
    });
    tagInput.addEventListener("input", () => {
      mem.setRow(this.rowKey, { tag: tagInput.value, dirty: true, frame: f });
    });
    gridEl.appendChild(this.field("Tag (≤12)", tagInput));

    // Mode field
    const modeSelect = h("select", { className: "ctrl", style: { width: "100%" } });
    for (const m of MODES) {
      const opt = h("option", { value: m }, m);
      if (m === f.mode) opt.selected = true;
      modeSelect.appendChild(opt);
    }
    modeSelect.addEventListener("change", () => update({ mode: modeSelect.value as Mode }));
    gridEl.appendChild(this.field("Mode", modeSelect));

    // Frequency field (wide)
    const freqInput = h("input", {
      className: "ctrl",
      type: "text",
      inputMode: "decimal",
      value: formatMHz(f.freqHz),
      placeholder: "e.g. 439.200",
      style: { width: "100%" },
    });
    freqInput.addEventListener("blur", () => {
      const hz = parseUserFreq(freqInput.value);
      if (hz !== null) update({ freqHz: hz });
    });
    freqInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") freqInput.blur();
    });
    const freqHint = h("span", {
      style: { fontSize: "10px", color: "var(--ink-faint)", marginTop: "4px" },
    }, "accepts 439.200 · 14.250 · 14250 (kHz) · 14250000 (Hz)");
    const freqField = this.field("Frequency (MHz)", freqInput, true);
    freqField.appendChild(freqHint);
    gridEl.appendChild(freqField);

    // Repeater shift subhead
    gridEl.appendChild(this.subHead("Repeater shift"));

    // Shift direction
    const shiftSelect = h("select", { className: "ctrl", style: { width: "100%" } });
    for (const [val, label] of [["simplex", "Simplex"], ["plus", "+ Plus"], ["minus", "− Minus"]] as const) {
      const opt = h("option", { value: val }, label);
      if (val === f.shift) opt.selected = true;
      shiftSelect.appendChild(opt);
    }
    shiftSelect.addEventListener("change", () => update({ shift: shiftSelect.value as MemoryFrame["shift"] }));
    gridEl.appendChild(this.field("Direction (per-channel)", shiftSelect));

    // Band offset
    const offsetLabel = band ? `Offset for ${band.band} (per-band, kHz)` : "Offset";
    if (band) {
      const offsetInput = h("input", {
        className: "ctrl",
        type: "text",
        value: this.bandShiftRaw ?? "",
        placeholder: "—",
        style: { flex: "1" },
      });
      offsetInput.addEventListener("input", () => {
        this.bandShiftRaw = offsetInput.value;
      });
      const setBtn = h("button", {
        className: "btn btn-primary",
        disabled: !conn.writesEnabled || this.bandShiftBusy || this.bandShiftRaw === null,
        style: { fontSize: "10px" },
      }, "Set");
      setBtn.addEventListener("click", () => void this.applyBandShift());
      const offsetRow = h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, offsetInput, setBtn);
      gridEl.appendChild(this.field(offsetLabel, offsetRow));
    } else {
      const noFm = h("span", { style: { fontSize: "11px", color: "var(--ink-faint)" } }, "non-FM band — shift not applicable");
      gridEl.appendChild(this.field(offsetLabel, noFm));
    }

    // Tone / DCS subhead
    gridEl.appendChild(this.subHead("Tone / DCS"));

    // CTCSS state
    const ctcssSelect = h("select", { className: "ctrl", style: { width: "100%" } });
    for (const st of ["OFF", "CTCSS ENC", "CTCSS ENC/DEC", "DCS", "PR FREQ", "REV TONE"]) {
      const opt = h("option", {}, st);
      if (st === f.ctcssState) opt.selected = true;
      ctcssSelect.appendChild(opt);
    }
    ctcssSelect.addEventListener("change", () => update({ ctcssState: ctcssSelect.value as CtcssState }));
    gridEl.appendChild(this.field("State (per-channel)", ctcssSelect));

    // CTCSS tone dropdown
    if (stateNeedsTone) {
      const toneSelect = h("select", { className: "ctrl", style: { width: "100%" } });
      if (toneIdx === null) {
        toneSelect.appendChild(h("option", { value: "" }, "read…"));
      }
      CTCSS_HZ.forEach((hz, i) => {
        const opt = h("option", { value: String(i) }, `${i.toString().padStart(2, "0")} · ${hz.toFixed(1)} Hz`);
        if (toneIdx === i) opt.selected = true;
        toneSelect.appendChild(opt);
      });
      toneSelect.addEventListener("change", () => applyTone(Number(toneSelect.value)));
      gridEl.appendChild(this.field("CTCSS tone (Hz)", toneSelect));
    }

    // DCS code dropdown
    if (stateNeedsDcs) {
      const dcsSelect = h("select", { className: "ctrl", style: { width: "100%" } });
      if (dcsIdx === null) {
        dcsSelect.appendChild(h("option", { value: "" }, "read…"));
      }
      DCS_CODES.forEach((code, i) => {
        const opt = h("option", { value: String(i) }, `${i.toString().padStart(3, "0")} · ${code}`);
        if (dcsIdx === i) opt.selected = true;
        dcsSelect.appendChild(opt);
      });
      dcsSelect.addEventListener("change", () => applyDcs(Number(dcsSelect.value)));
      gridEl.appendChild(this.field("DCS code", dcsSelect));
    }

    // Tone/DCS info text
    if (stateNeedsTone || stateNeedsDcs) {
      gridEl.appendChild(h("div", {
        style: { gridColumn: "1 / -1", fontSize: "11px", color: "var(--ink-faint)" },
      }, "Tone Hz / DCS code applied via CN preamble before MW on write. Changes are batched — click \"Write dirty\" to push to the radio."));
    }

    // Clarifier subhead
    gridEl.appendChild(this.subHead("Clarifier"));

    // Clarifier offset
    const clarInput = h("input", {
      type: "number",
      className: "ctrl",
      value: String(f.clarifierHz),
      min: "-9990",
      max: "9995",
      style: { width: "100%" },
    });
    clarInput.addEventListener("change", () => update({ clarifierHz: Number(clarInput.value) }));
    gridEl.appendChild(this.field("Offset (Hz, ±9990)", clarInput));

    // RX/TX clar toggles
    const rxToggle = Toggle({ checked: f.rxClarOn, label: "RX clar" });
    const rxCb = rxToggle.el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (rxCb) {
      rxCb.addEventListener("change", () => update({ rxClarOn: rxCb.checked }));
    }
    const txToggle = Toggle({ checked: f.txClarOn, label: "TX clar" });
    const txCb = txToggle.el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (txCb) {
      txCb.addEventListener("change", () => update({ txClarOn: txCb.checked }));
    }
    const togglesRow = h("div", { style: { display: "flex", gap: "16px", paddingTop: "8px" } }, rxToggle.el, txToggle.el);
    gridEl.appendChild(this.field("", togglesRow));

    // Footer buttons
    const cancelBtn = h("button", { className: "btn" }, "Cancel");
    cancelBtn.addEventListener("click", () => this.onClose());
    const doneBtn = h("button", { className: "btn btn-primary" }, "Done");
    doneBtn.addEventListener("click", () => this.onClose());
    const footer = h("div", {
      style: { borderTop: "1px solid var(--line)", padding: "14px", display: "flex", justifyContent: "flex-end", gap: "8px" },
    }, cancelBtn, doneBtn);

    // Card
    this.contentEl = h("div", {
      className: "card",
      style: { width: "680px", maxHeight: "90vh", overflow: "auto", padding: "0" },
    }, titleBar.el, gridEl, footer);
    this.contentEl.addEventListener("click", (e: Event) => e.stopPropagation());

    clearChildren(this.el);
    this.el.appendChild(this.contentEl);
  }

  private rebuildContent() {
    this.buildContent();
  }

  private async applyBandShift() {
    const conn = connectionStore.getState();
    const mem = memoryStore.getState();
    const row = mem.rows.find((r) => r.key === this.rowKey);
    if (!conn.transport || !conn.writesEnabled || !row) return;
    const f = row.frame ?? defaultFrame(row.id);
    const band = bandForFreq(f.freqHz);
    if (!band || this.bandShiftRaw === null) return;

    this.bandShiftBusy = true;
    this.rebuildContent();
    try {
      await writeMenu(conn.transport, band.p1, band.p2, band.p3, this.bandShiftRaw);
      const r = await readMenu(conn.transport, band.p1, band.p2, band.p3);
      this.bandShiftRaw = r;
    } finally {
      this.bandShiftBusy = false;
      this.rebuildContent();
    }
  }

  private field(label: string, child: HTMLElement, wide?: boolean): HTMLElement {
    const labelSpan = h("span", {
      style: {
        fontSize: "10px",
        fontWeight: "600",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--ink-faint)",
      },
    }, label);
    const style: Record<string, string> = {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    };
    if (wide) style.gridColumn = "1 / -1";
    const container = h("label", { style }, labelSpan, child);
    return container;
  }

  private subHead(text: string): HTMLElement {
    return h("div", {
      style: {
        gridColumn: "1 / -1",
        paddingBottom: "4px",
        marginTop: "8px",
        borderBottom: "1px solid var(--line)",
        fontSize: "10px",
        fontWeight: "700",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--accent)",
      },
    }, text);
  }
}

export const __BAND_SHIFTS = BAND_SHIFTS;
