import { connectionStore } from "../store/connection";
import type { CatLogEntry } from "../cat/transport";

/* ── helper: create element with optional className / text / styles */

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: { className?: string; text?: string; styles?: Partial<CSSStyleDeclaration> },
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (opts?.className) el.className = opts.className;
  if (opts?.text) el.textContent = opts.text;
  if (opts?.styles) Object.assign(el.style, opts.styles);
  return el;
}

/* ── shared inline-style fragment for <th> ───────────────────── */

const TH_STYLES: Partial<CSSStyleDeclaration> = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "0.14em",
  color: "var(--ink-faint)",
  textTransform: "uppercase",
  borderBottom: "1px solid var(--line)",
};

/* ── colour helper per direction ─────────────────────────────── */

function dirColor(direction: string): string {
  switch (direction) {
    case "tx":
      return "var(--ok)";
    case "rx":
      return "var(--accent)";
    case "error":
      return "var(--err)";
    default:
      return "var(--ink-faint)";
  }
}

/* ── DebugPanel ──────────────────────────────────────────────── */

export class DebugPanel {
  el: HTMLElement;
  private unsubs: (() => void)[] = [];

  /* ── internal state ── */
  private cmd = "ID";
  private busy = false;

  /* ── DOM refs ── */
  private cmdInput!: HTMLInputElement;
  private queryBtn!: HTMLButtonElement;
  private sendBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private writesHint!: HTMLSpanElement;
  private scrollDiv!: HTMLDivElement;
  private tbody!: HTMLTableSectionElement;
  private frameCountSpan!: HTMLSpanElement;

  /* ── track rendered log length for incremental append ── */
  private renderedLogLen = 0;

  constructor() {
    this.el = document.createElement("div");
    this.build();
  }

  /* ── build full DOM tree ───────────────────────────────────── */

  private build(): void {
    Object.assign(this.el.style, {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      gap: "10px",
    });

    this.el.appendChild(this.buildToolbar());
    this.el.appendChild(this.buildLogDisplay());
    this.el.appendChild(this.buildStatusBar());
  }

  /* ── top toolbar ───────────────────────────────────────────── */

  private buildToolbar(): HTMLElement {
    const bar = h("div", {
      className: "card",
      styles: { padding: "10px", display: "flex", alignItems: "center", gap: "8px" },
    });

    bar.appendChild(h("span", { className: "chip", text: "CAT-1" }));

    // Command input
    this.cmdInput = h("input", {
      className: "ctrl",
      styles: { flex: "1" },
    });
    this.cmdInput.value = this.cmd;
    this.cmdInput.spellcheck = false;
    this.cmdInput.placeholder = "raw CAT body, e.g. FA014250000";
    this.cmdInput.addEventListener("input", () => {
      this.cmd = this.cmdInput.value;
    });
    this.cmdInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && connectionStore.getState().writesEnabled) {
        void this.send();
      }
    });
    bar.appendChild(this.cmdInput);

    // Query button
    this.queryBtn = h("button", { className: "btn btn-primary" });
    this.queryBtn.type = "button";
    // Use middot entity via textContent-safe approach
    this.queryBtn.textContent = "Query · await ;";
    this.queryBtn.addEventListener("click", () => void this.send());
    bar.appendChild(this.queryBtn);

    // Send button
    this.sendBtn = h("button", { className: "btn" });
    this.sendBtn.type = "button";
    this.sendBtn.textContent = "Send · no reply";
    this.sendBtn.addEventListener("click", () => void this.sendNoReply());
    bar.appendChild(this.sendBtn);

    // Clear button
    this.clearBtn = h("button", { className: "btn btn-ghost" });
    this.clearBtn.type = "button";
    this.clearBtn.textContent = "Clear";
    this.clearBtn.addEventListener("click", () => this.clearLog());
    bar.appendChild(this.clearBtn);

    // Writes hint
    this.writesHint = h("span", {
      text: "Enable writes to send commands",
      styles: {
        fontSize: "10px",
        color: "var(--ink-faint)",
        whiteSpace: "nowrap",
        display: "none",
      },
    });
    bar.appendChild(this.writesHint);

    return bar;
  }

  /* ── log display ───────────────────────────────────────────── */

  private buildLogDisplay(): HTMLElement {
    this.scrollDiv = h("div", {
      className: "card scroll-thin",
      styles: {
        flex: "1",
        overflow: "auto",
        padding: "0",
        background: "var(--bg-display)",
      },
    });

    const table = h("table", {
      styles: {
        width: "100%",
        borderCollapse: "collapse",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
      },
    });

    const thead = document.createElement("thead");
    const headRow = h("tr", {
      styles: {
        position: "sticky",
        top: "0",
        background: "var(--bg-rail)",
        zIndex: "1",
      },
    });

    const thTime = h("th", { text: "Time" });
    Object.assign(thTime.style, TH_STYLES);
    headRow.appendChild(thTime);

    const thDir = h("th", { text: "Dir" });
    Object.assign(thDir.style, TH_STYLES);
    thDir.style.width = "70px";
    headRow.appendChild(thDir);

    const thFrame = h("th", { text: "Frame" });
    Object.assign(thFrame.style, TH_STYLES);
    headRow.appendChild(thFrame);

    thead.appendChild(headRow);
    table.appendChild(thead);

    this.tbody = document.createElement("tbody");
    table.appendChild(this.tbody);

    this.scrollDiv.appendChild(table);
    return this.scrollDiv;
  }

  /* ── bottom status bar ─────────────────────────────────────── */

  private buildStatusBar(): HTMLElement {
    const bar = h("div", {
      styles: {
        display: "flex",
        gap: "8px",
        fontSize: "11px",
        color: "var(--ink-faint)",
        padding: "0 4px",
      },
    });

    // TX legend
    const txLegend = document.createElement("span");
    txLegend.appendChild(h("span", { className: "led led-on" }));
    txLegend.appendChild(document.createTextNode(" tx · sent to radio"));
    bar.appendChild(txLegend);

    // RX legend
    const rxLegend = document.createElement("span");
    const rxLed = h("span", {
      className: "led",
      styles: {
        background: "var(--accent)",
        boxShadow: "0 0 8px var(--accent)",
      },
    });
    rxLegend.appendChild(rxLed);
    rxLegend.appendChild(document.createTextNode(" rx · radio reply"));
    bar.appendChild(rxLegend);

    // Frame count (right-aligned)
    this.frameCountSpan = h("span", {
      text: "0 frames",
      styles: { marginLeft: "auto" },
    });
    bar.appendChild(this.frameCountSpan);

    return bar;
  }

  /* ── transport helpers ─────────────────────────────────────── */

  private async send(): Promise<void> {
    const { transport } = connectionStore.getState();
    if (!transport) return;
    this.busy = true;
    this.refreshButtons();
    try {
      const trimmed = this.cmd.replace(/;$/, "").trim();
      await transport.query(trimmed);
    } catch (err) {
      console.error(err);
    } finally {
      this.busy = false;
      this.refreshButtons();
    }
  }

  private async sendNoReply(): Promise<void> {
    const { transport } = connectionStore.getState();
    if (!transport) return;
    this.busy = true;
    this.refreshButtons();
    try {
      const trimmed = this.cmd.replace(/;$/, "").trim();
      await transport.send(trimmed);
    } catch (err) {
      console.error(err);
    } finally {
      this.busy = false;
      this.refreshButtons();
    }
  }

  private clearLog(): void {
    connectionStore.setState({ log: [] });
  }

  /* ── lifecycle ─────────────────────────────────────────────── */

  mount(): void {
    this.unsubs.push(connectionStore.subscribe(() => this.refresh()));
    this.refresh();
  }

  unmount(): void {
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
  }

  /* ── refresh DOM from store state ──────────────────────────── */

  private refresh(): void {
    const { log, status, writesEnabled } = connectionStore.getState();

    this.refreshButtons();

    // Writes hint visibility
    this.writesHint.style.display =
      !writesEnabled && status === "connected" ? "" : "none";

    // Log table: handle reset (clear) + incremental append
    if (log.length < this.renderedLogLen) {
      // Log was cleared (or truncated); rebuild
      this.tbody.textContent = "";
      this.renderedLogLen = 0;
    }

    if (log.length === 0 && this.renderedLogLen === 0) {
      // Show empty-state row
      this.tbody.textContent = "";
      const emptyRow = document.createElement("tr");
      const emptyTd = h("td", {
        text: "no traffic yet",
        styles: {
          padding: "60px",
          textAlign: "center",
          color: "var(--ink-faint)",
        },
      });
      emptyTd.colSpan = 3;
      emptyRow.appendChild(emptyTd);
      this.tbody.appendChild(emptyRow);
    } else if (log.length > this.renderedLogLen) {
      // Remove empty-state row if present and this is the first real entry
      if (this.renderedLogLen === 0) {
        this.tbody.textContent = "";
      }

      // Append only new entries
      for (let i = this.renderedLogLen; i < log.length; i++) {
        this.tbody.appendChild(this.buildLogRow(log[i]));
      }
      this.renderedLogLen = log.length;

      // Auto-scroll to bottom
      this.scrollDiv.scrollTop = this.scrollDiv.scrollHeight;
    }

    // Frame count
    const count = log.length;
    this.frameCountSpan.textContent = `${count} frame${count === 1 ? "" : "s"}`;
  }

  /* ── refresh just the button disabled states ───────────────── */

  private refreshButtons(): void {
    const { status, writesEnabled } = connectionStore.getState();
    const isDisabled = this.busy || status !== "connected";

    this.queryBtn.disabled = isDisabled || !writesEnabled;
    this.queryBtn.title =
      !writesEnabled ? "Enable writes — Query can send any CAT command" : "";

    this.sendBtn.disabled = isDisabled || !writesEnabled;
  }

  /* ── build a single log <tr> ───────────────────────────────── */

  private buildLogRow(entry: CatLogEntry): HTMLTableRowElement {
    const tr = document.createElement("tr");
    tr.style.borderBottom =
      "1px solid color-mix(in oklab, var(--line) 60%, transparent)";

    const color = dirColor(entry.direction);

    // Timestamp cell
    const tdTime = h("td", {
      text: new Date(entry.ts).toISOString().slice(11, 23),
      styles: {
        padding: "5px 12px",
        color: "var(--ink-faint)",
        whiteSpace: "nowrap",
      },
    });
    tr.appendChild(tdTime);

    // Direction chip cell
    const tdDir = h("td", { styles: { padding: "5px 12px" } });
    const chip = h("span", {
      className: "chip",
      text: entry.direction.toUpperCase(),
      styles: {
        color,
        borderColor: "transparent",
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
      },
    });
    tdDir.appendChild(chip);
    tr.appendChild(tdDir);

    // Frame data cell
    const tdFrame = h("td", {
      text: entry.data,
      styles: { padding: "5px 12px", color: "var(--ink)" },
    });
    tr.appendChild(tdFrame);

    return tr;
  }
}
