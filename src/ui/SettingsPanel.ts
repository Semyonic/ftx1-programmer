import { connectionStore } from "../store/connection";
import { settingsStore, leafKey } from "../store/settings";
import { Leaf, MENU } from "../cat/menu";
import { describe } from "../cat/menu-descriptions";
import { downloadFile } from "../io/json";
import { Toggle, ProgressBar } from "./Atoms";

const pad = (n: number) => n.toString().padStart(2, "0");

function formatPadded(n: number, digits: number, signed: boolean): string {
  if (signed) {
    const sign = n < 0 ? "-" : "+";
    return sign + Math.abs(n).toString().padStart(digits - 1, "0");
  }
  return n.toString().padStart(digits, "0");
}

/* ------------------------------------------------------------------ */
/*  Helper: apply inline styles from an object                        */
/* ------------------------------------------------------------------ */
function css(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  for (const [k, v] of Object.entries(styles)) {
    (el.style as unknown as Record<string, unknown>)[k] = v;
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: create element with className / inline styles             */
/* ------------------------------------------------------------------ */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: {
    className?: string;
    style?: Partial<CSSStyleDeclaration>;
    text?: string;
    attrs?: Record<string, string>;
  },
  children?: (HTMLElement | null | undefined)[],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (opts?.className) el.className = opts.className;
  if (opts?.style) css(el, opts.style);
  if (opts?.text) el.textContent = opts.text;
  if (opts?.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
  }
  if (children) {
    for (const c of children) {
      if (c) el.appendChild(c);
    }
  }
  return el;
}

/* ================================================================== */
/*  SettingsPanel                                                      */
/* ================================================================== */
export class SettingsPanel {
  el: HTMLElement;

  private busy = false;
  private openP1: number | null = 1;
  private openP2: number | null = 1;
  private filter = "";
  private autoReadDone = false;
  private unsubs: (() => void)[] = [];

  // Cached DOM refs
  private readAllBtn!: HTMLButtonElement;
  private writeDirtyBtn!: HTMLButtonElement;
  private exportBtn!: HTMLButtonElement;
  private importLabel!: HTMLLabelElement;
  private importInput!: HTMLInputElement;
  private settingsCountSpan!: HTMLElement;
  private progressWrap!: HTMLElement;
  private progressCountSpan!: HTMLElement;
  private progressBar!: { el: HTMLElement; update: (props: { value: number; max: number }) => void };
  private filterInput!: HTMLInputElement;
  private sidebar!: HTMLElement;
  private contentSection!: HTMLElement;
  private notConnectedEl!: HTMLElement;
  private mainContainer!: HTMLElement;

  constructor() {
    this.el = h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: "10px",
      },
    });
  }

  mount() {
    const settings = settingsStore.getState();

    // Init settings if empty
    if (Object.keys(settings.values).length === 0) settings.init();

    // Build the full DOM
    this.buildToolbar();
    this.buildBody();
    this.buildNotConnected();

    // Decide initial visibility
    this.updateVisibility();

    // Subscribe to store changes
    this.unsubs.push(
      connectionStore.subscribe(() => {
        this.updateVisibility();
        this.tryAutoRead();
        this.refreshToolbar();
      }),
    );
    this.unsubs.push(
      settingsStore.subscribe(() => {
        this.refreshToolbar();
        this.refreshSidebar();
        this.refreshContent();
        this.tryAutoRead();
      }),
    );

    // Attempt auto-read on mount
    this.tryAutoRead();
  }

  unmount() {
    for (const fn of this.unsubs) fn();
    this.unsubs = [];
  }

  /* ---------------------------------------------------------------- */
  /*  Visibility: connected vs not-connected                          */
  /* ---------------------------------------------------------------- */
  private updateVisibility() {
    const { status, dryRun } = connectionStore.getState();
    const connected = status === "connected" || dryRun;
    this.notConnectedEl.style.display = connected ? "none" : "";
    this.mainContainer.style.display = connected ? "" : "none";
  }

  /* ---------------------------------------------------------------- */
  /*  Auto-read on first connect                                      */
  /* ---------------------------------------------------------------- */
  private tryAutoRead() {
    if (this.autoReadDone) return;
    const { status, transport } = connectionStore.getState();
    const settings = settingsStore.getState();
    if (status !== "connected" || !transport) return;
    if (settings.reading) return;
    const anyValue = Object.values(settings.values).some((v) => v.raw !== null);
    if (anyValue) return;
    this.autoReadDone = true;
    this.setBusy(true);
    void settings.readAll(transport).finally(() => this.setBusy(false));
  }

  /* ---------------------------------------------------------------- */
  /*  Busy state                                                      */
  /* ---------------------------------------------------------------- */
  private setBusy(b: boolean) {
    this.busy = b;
    this.refreshToolbar();
    this.refreshContent();
  }

  /* ---------------------------------------------------------------- */
  /*  Build: Toolbar                                                   */
  /* ---------------------------------------------------------------- */
  private buildToolbar() {
    const toolbar = h("div", {
      className: "card",
      style: { padding: "10px", display: "flex", alignItems: "center", gap: "8px" },
    });

    // Read all
    this.readAllBtn = h("button", { className: "btn btn-primary", text: "↓ Read all settings" }) as HTMLButtonElement;
    this.readAllBtn.addEventListener("click", () => void this.onReadAll());

    // Write dirty
    this.writeDirtyBtn = h("button", { className: "btn", text: "↑ Write 0 unsaved" }) as HTMLButtonElement;
    this.writeDirtyBtn.addEventListener("click", () => void this.onWriteDirty());

    // Separator
    const sep = h("div", { style: { width: "1px", height: "22px", background: "var(--line)" } });

    // Export
    this.exportBtn = h("button", { className: "btn", text: "Export JSON" }) as HTMLButtonElement;
    this.exportBtn.addEventListener("click", () => this.onExport());

    // Import
    this.importLabel = h("label", {
      className: "btn",
      style: { cursor: "pointer" },
      text: "Import JSON",
    }) as HTMLLabelElement;
    this.importInput = document.createElement("input");
    this.importInput.type = "file";
    this.importInput.accept = ".json,application/json";
    this.importInput.style.display = "none";
    this.importInput.addEventListener("change", () => {
      const file = this.importInput.files?.[0];
      this.importInput.value = "";
      if (file) void this.onImport(file);
    });
    this.importLabel.appendChild(this.importInput);

    // Right side
    const rightSide = h("div", {
      style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" },
    });

    // Settings count
    this.settingsCountSpan = h("span", {
      style: { fontSize: "11px", color: "var(--ink-faint)" },
    });

    // Progress wrapper
    this.progressWrap = h("span", {
      style: { display: "none", alignItems: "center", gap: "8px", maxWidth: "200px" },
    });
    this.progressCountSpan = h("span", {
      style: { fontSize: "11px", color: "var(--ink-faint)" },
    });
    this.progressBar = ProgressBar({ value: 0, max: 0 });
    this.progressWrap.appendChild(this.progressCountSpan);
    this.progressWrap.appendChild(this.progressBar.el);

    // Search
    this.filterInput = document.createElement("input");
    this.filterInput.className = "ctrl";
    this.filterInput.placeholder = "search settings…";
    css(this.filterInput, { width: "220px" });
    this.filterInput.value = this.filter;
    this.filterInput.addEventListener("input", () => {
      this.filter = this.filterInput.value;
      this.refreshContent();
    });

    rightSide.appendChild(this.settingsCountSpan);
    rightSide.appendChild(this.progressWrap);
    rightSide.appendChild(this.filterInput);

    toolbar.appendChild(this.readAllBtn);
    toolbar.appendChild(this.writeDirtyBtn);
    toolbar.appendChild(sep);
    toolbar.appendChild(this.exportBtn);
    toolbar.appendChild(this.importLabel);
    toolbar.appendChild(rightSide);

    this.el.appendChild(toolbar);
    this.refreshToolbar();
  }

  /* ---------------------------------------------------------------- */
  /*  Build: Body (sidebar + content)                                  */
  /* ---------------------------------------------------------------- */
  private buildBody() {
    const bodyWrap = h("div", {
      style: { display: "flex", flex: "1", gap: "10px", minHeight: "0" },
    });

    // Sidebar
    this.sidebar = h("aside", {
      className: "card scroll-thin",
      style: { width: "280px", overflow: "auto", padding: "6px" },
    });
    this.refreshSidebar();

    // Content
    this.contentSection = h("section", {
      className: "card scroll-thin",
      style: { flex: "1", overflow: "auto", padding: "18px" },
    });
    this.refreshContent();

    bodyWrap.appendChild(this.sidebar);
    bodyWrap.appendChild(this.contentSection);

    // Main container wraps the body row (hidden when not connected)
    this.mainContainer = h("div", {
      style: { display: "flex", flexDirection: "column", flex: "1", gap: "10px", minHeight: "0" },
    }, [bodyWrap]);

    this.el.appendChild(this.mainContainer);
  }

  /* ---------------------------------------------------------------- */
  /*  Build: NotConnected placeholder                                  */
  /* ---------------------------------------------------------------- */
  private buildNotConnected() {
    const outer = h("div", {
      style: { display: "grid", placeItems: "center", padding: "60px" },
    });
    const card = h("div", {
      className: "card",
      style: { padding: "36px", maxWidth: "420px", textAlign: "center" },
    });
    const led = h("div", {
      className: "led led-err",
      style: { width: "14px", height: "14px", margin: "0 auto 14px" },
    });
    const text = h("div", {
      style: { fontSize: "16px", fontWeight: "600" },
      text: "No radio connected",
    });
    card.appendChild(led);
    card.appendChild(text);
    outer.appendChild(card);
    this.notConnectedEl = outer;
    this.el.appendChild(this.notConnectedEl);
  }

  /* ---------------------------------------------------------------- */
  /*  Refresh: Toolbar buttons & counts                                */
  /* ---------------------------------------------------------------- */
  private refreshToolbar() {
    const { transport, writesEnabled } = connectionStore.getState();
    const settings = settingsStore.getState();
    const dirtyCount = Object.values(settings.values).filter((v) => v.dirty).length;
    const totalCount = Object.keys(settings.values).length;

    this.readAllBtn.disabled = this.busy || !transport;
    this.writeDirtyBtn.disabled = !writesEnabled || dirtyCount === 0;
    this.writeDirtyBtn.textContent = `↑ Write ${dirtyCount} unsaved`;

    // Settings count - use safe DOM methods
    this.settingsCountSpan.textContent = "";
    const strong = document.createElement("strong");
    strong.style.color = "var(--ink)";
    strong.textContent = String(totalCount);
    this.settingsCountSpan.appendChild(strong);
    this.settingsCountSpan.appendChild(document.createTextNode(" settings"));
    if (dirtyCount > 0) {
      const unsavedSpan = document.createElement("span");
      unsavedSpan.style.color = "var(--warn)";
      unsavedSpan.style.marginLeft = "8px";
      unsavedSpan.textContent = `${dirtyCount} unsaved`;
      this.settingsCountSpan.appendChild(unsavedSpan);
    }

    // Progress
    if (settings.progress.total > 0) {
      this.progressWrap.style.display = "flex";
      this.progressCountSpan.textContent = `${settings.progress.done}/${settings.progress.total}`;
      this.progressBar.update({ value: settings.progress.done, max: settings.progress.total });
    } else {
      this.progressWrap.style.display = "none";
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Refresh: Sidebar                                                 */
  /* ---------------------------------------------------------------- */
  private refreshSidebar() {
    this.sidebar.textContent = "";
    for (const g of MENU) {
      const groupDiv = document.createElement("div");

      // Group button (p1)
      const groupBtn = document.createElement("button");
      css(groupBtn, {
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        padding: "10px 12px",
        borderRadius: "6px",
        color: "var(--ink)",
        fontSize: "12px",
        fontWeight: "700",
        letterSpacing: "0.06em",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      });

      const codeSpan = h("span", {
        style: { color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: "10px" },
        text: pad(g.p1),
      });

      const nameText = document.createTextNode(g.name);

      const chevronSpan = h("span", {
        style: { marginLeft: "auto", color: "var(--ink-faint)", fontSize: "11px" },
        text: this.openP1 === g.p1 ? "−" : "+",
      });

      groupBtn.appendChild(codeSpan);
      groupBtn.appendChild(nameText);
      groupBtn.appendChild(chevronSpan);

      groupBtn.addEventListener("click", () => {
        this.openP1 = this.openP1 === g.p1 ? null : g.p1;
        this.refreshSidebar();
        this.refreshContent();
      });

      groupDiv.appendChild(groupBtn);

      // Subgroup buttons (p2) - only if group is open
      if (this.openP1 === g.p1) {
        for (const s of g.subgroups) {
          const isActive = this.openP2 === s.p2 && this.openP1 === g.p1;
          const subBtn = document.createElement("button");
          css(subBtn, {
            width: "calc(100% - 16px)",
            margin: "0 8px 2px",
            textAlign: "left",
            background: isActive ? "var(--accent-soft)" : "transparent",
            border: "none",
            borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
            padding: "7px 10px",
            borderRadius: "4px",
            color: isActive ? "var(--accent)" : "var(--ink-mute)",
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          });

          const subCodeSpan = h("span", {
            style: { fontFamily: "var(--font-mono)", fontSize: "10px", opacity: "0.6" },
            text: pad(s.p2),
          });

          subBtn.appendChild(subCodeSpan);
          subBtn.appendChild(document.createTextNode(s.name));

          subBtn.addEventListener("click", () => {
            this.openP1 = g.p1;
            this.openP2 = s.p2;
            this.refreshSidebar();
            this.refreshContent();
          });

          groupDiv.appendChild(subBtn);
        }
      }

      this.sidebar.appendChild(groupDiv);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Refresh: Content area                                            */
  /* ---------------------------------------------------------------- */
  private refreshContent() {
    this.contentSection.textContent = "";
    const group = MENU.find((g) => g.p1 === this.openP1);
    const sub = group?.subgroups.find((s) => s.p2 === this.openP2);
    if (!sub || !group) return;

    const settings = settingsStore.getState();

    // Header
    const header = h("div", { style: { marginBottom: "16px" } });

    const breadcrumb = h("div", {
      style: {
        fontSize: "10px",
        fontWeight: "700",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--ink-faint)",
      },
      text: `${pad(group.p1)}-${pad(sub.p2)} · ${group.name}`,
    });

    const title = h("div", {
      style: { fontSize: "18px", fontWeight: "600", marginTop: "4px" },
      text: sub.name,
    });

    header.appendChild(breadcrumb);
    header.appendChild(title);
    this.contentSection.appendChild(header);

    // Leaf cards grid
    const grid = h("div", { style: { display: "grid", gap: "8px" } });

    const filteredLeaves = sub.leaves.filter(
      (l) => !this.filter || l.name.toLowerCase().includes(this.filter.toLowerCase()),
    );

    for (const leaf of filteredLeaves) {
      const k = leafKey(group.p1, sub.p2, leaf.p3);
      const v = settings.values[k];
      if (!v) continue;

      const card = this.buildLeafCard(
        group.p1,
        sub.p2,
        leaf,
        v.raw,
        v.dirty,
        v.error,
      );
      grid.appendChild(card);
    }

    this.contentSection.appendChild(grid);
  }

  /* ---------------------------------------------------------------- */
  /*  Build: LeafCard                                                  */
  /* ---------------------------------------------------------------- */
  private buildLeafCard(
    p1: number,
    p2: number,
    leaf: Leaf,
    raw: string | null,
    dirty: boolean,
    error: string | null,
  ): HTMLElement {
    const desc = describe(p1, p2, leaf.p3);

    const card = h("div", {
      style: {
        background: "var(--bg-elev)",
        border: `1px solid ${dirty ? "color-mix(in oklab, var(--warn) 50%, var(--line))" : "var(--line)"}`,
        borderRadius: "8px",
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "1fr 280px",
        gap: "16px",
        alignItems: "center",
      },
    });

    // Left: info
    const infoDiv = document.createElement("div");

    const topRow = h("div", {
      style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" },
    });

    topRow.appendChild(
      h("span", {
        className: "mono",
        style: { fontSize: "10px", color: "var(--ink-faint)" },
        text: `${pad(p1)}-${pad(p2)}-${pad(leaf.p3)}`,
      }),
    );

    topRow.appendChild(
      h("span", {
        style: { fontWeight: "600", fontSize: "13px" },
        text: leaf.name,
      }),
    );

    if (dirty) {
      topRow.appendChild(
        h("span", { className: "chip chip-warn", text: "● modified" }),
      );
    }
    if (error) {
      topRow.appendChild(
        h("span", { className: "chip chip-err", text: error }),
      );
    }

    infoDiv.appendChild(topRow);

    if (desc) {
      infoDiv.appendChild(
        h("div", {
          style: { fontSize: "11px", color: "var(--ink-mute)" },
          text: desc,
        }),
      );
    }

    // Right: input (unit shown inline within the control row)
    const inputDiv = document.createElement("div");
    const onChange = (val: string) => settingsStore.getState().setRaw(p1, p2, leaf.p3, val);

    inputDiv.appendChild(this.renderInput(leaf, raw, this.busy, onChange));

    card.appendChild(infoDiv);
    card.appendChild(inputDiv);

    return card;
  }

  /* ---------------------------------------------------------------- */
  /*  Render: Input control for a leaf                                 */
  /* ---------------------------------------------------------------- */
  private renderInput(
    leaf: Leaf,
    raw: string | null,
    busy: boolean,
    onChange: (raw: string) => void,
  ): HTMLElement {
    const t = leaf.type;

    if (t.kind === "excluded") {
      return h("span", { style: { color: "var(--err)" }, text: t.reason });
    }

    if (t.kind === "readonly") {
      return h("span", { style: { color: "var(--ink-faint)" }, text: "read-only" });
    }

    if (t.kind === "bool") {
      const checked = raw === "1";
      const toggle = Toggle({
        checked,
        onChange: (v: boolean) => onChange(v ? "1" : "0"),
        disabled: busy,
      });
      return toggle.el;
    }

    if (t.kind === "enum") {
      const select = document.createElement("select");
      select.className = "ctrl";
      select.disabled = busy;
      css(select, { width: "100%" });

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.disabled = true;
      placeholder.textContent = "—";
      select.appendChild(placeholder);

      for (const v of t.values) {
        const opt = document.createElement("option");
        opt.value = v.code;
        opt.textContent = v.label;
        select.appendChild(opt);
      }

      select.value = raw ?? "";
      select.addEventListener("change", () => onChange(select.value));
      return select;
    }

    if (t.kind === "int" || t.kind === "signedInt") {
      const wrap = h("div", {
        style: { display: "flex", alignItems: "center", gap: "10px" },
      });

      const range = document.createElement("input");
      range.type = "range";
      range.disabled = busy;
      range.min = String(t.min);
      range.max = String(t.max);
      range.step = String(t.step ?? 1);
      range.value = raw ? String(parseInt(raw, 10)) : String(t.min);
      css(range, { flex: "1", accentColor: "var(--accent)" });

      const numInput = document.createElement("input");
      numInput.type = "number";
      numInput.className = "ctrl";
      numInput.disabled = busy;
      numInput.value = raw ?? "";
      numInput.min = String(t.min);
      numInput.max = String(t.max);
      numInput.step = String(t.step ?? 1);
      css(numInput, { width: "70px", textAlign: "right" });

      const handleChange = (val: string) => {
        const n = Number(val);
        onChange(formatPadded(n, t.digits, t.kind === "signedInt"));
      };

      range.addEventListener("input", () => handleChange(range.value));
      numInput.addEventListener("change", () => handleChange(numInput.value));

      wrap.appendChild(range);
      wrap.appendChild(numInput);

      const unit = (t as { unit?: string }).unit;
      if (unit) {
        wrap.appendChild(
          h("span", {
            style: { fontSize: "10px", color: "var(--ink-faint)", letterSpacing: "0.1em" },
            text: unit,
          }),
        );
      }
      return wrap;
    }

    // Default: text input
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "ctrl";
    textInput.disabled = busy;
    textInput.value = raw ?? "";
    textInput.maxLength = (t as { maxLen: number }).maxLen;
    css(textInput, { width: "100%" });
    textInput.addEventListener("input", () => onChange(textInput.value));
    return textInput;
  }

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */
  private async onReadAll() {
    const { transport } = connectionStore.getState();
    if (!transport) return;
    this.setBusy(true);
    try {
      await settingsStore.getState().readAll(transport);
    } finally {
      this.setBusy(false);
    }
  }

  private async onWriteDirty() {
    const { transport, writesEnabled } = connectionStore.getState();
    if (!transport) return;
    if (!writesEnabled) return;
    this.setBusy(true);
    try {
      const r = await settingsStore.getState().writeDirty(transport);
      console.log("settings write result", r);
    } finally {
      this.setBusy(false);
    }
  }

  private onExport() {
    const settings = settingsStore.getState();
    const json = JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        settings: Object.values(settings.values).map((v) => ({
          p1: v.p1,
          p2: v.p2,
          p3: v.p3,
          name: v.leaf.name,
          raw: v.raw,
        })),
      },
      null,
      2,
    );
    downloadFile("ftx1-settings.json", json);
  }

  private async onImport(file: File) {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch (err) {
      window.alert(`JSON parse error: ${(err as Error).message}`);
      return;
    }
    if (
      !data ||
      typeof data !== "object" ||
      !("settings" in data) ||
      !Array.isArray((data as { settings: unknown }).settings)
    ) {
      window.alert("Bad file shape: expected { settings: [...] }.");
      return;
    }
    const items = (data as { settings: { p1: number; p2: number; p3: number; raw: string | null }[] }).settings;
    const settings = settingsStore.getState();
    let applied = 0;
    let skipped = 0;
    for (const it of items) {
      if (it.raw === null || it.raw === undefined) continue;
      const k = leafKey(it.p1, it.p2, it.p3);
      const cur = settings.values[k];
      if (!cur) {
        skipped++;
        continue;
      }
      if (cur.leaf.type.kind === "excluded" || cur.leaf.type.kind === "readonly") {
        skipped++;
        continue;
      }
      settings.setRaw(it.p1, it.p2, it.p3, it.raw);
      applied++;
    }
    window.alert(
      `Imported ${applied} setting${applied === 1 ? "" : "s"}.` +
        (skipped > 0 ? ` ${skipped} skipped (unknown / read-only / excluded).` : "") +
        ` Click "Write dirty" to push.`,
    );
  }
}
