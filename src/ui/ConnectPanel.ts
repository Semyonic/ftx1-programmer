import { connectionStore } from "../store/connection";
import { CatTransport } from "../cat/transport";
import { StatusPill, Toggle, SectionTitle } from "./Atoms";

/* ── helper: create an element with optional className & text ── */

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

/* ── helper: build a <span> with class + style + text ────────── */

function monoSpan(text: string, color: string): HTMLSpanElement {
  const s = h("span", { className: "mono", text, styles: { color } });
  return s;
}

/* ── ConnectPanel ─────────────────────────────────────────────── */

export class ConnectPanel {
  el: HTMLElement;
  private unsubs: (() => void)[] = [];

  /* ── atom instances ── */
  private statusPill!: ReturnType<typeof StatusPill>;
  private dryRunToggle!: ReturnType<typeof Toggle>;
  private writesToggle!: ReturnType<typeof Toggle>;
  private radioLinkTitle!: ReturnType<typeof SectionTitle>;
  private firstRunTitle!: ReturnType<typeof SectionTitle>;
  private browserTitle!: ReturnType<typeof SectionTitle>;

  /* ── DOM refs we need to update ── */
  private radioIdSpan!: HTMLSpanElement;
  private radioIdChip!: HTMLSpanElement;
  private firmwareSpan!: HTMLSpanElement;
  private connectBtn!: HTMLButtonElement;
  private disconnectBtn!: HTMLButtonElement;
  private serialWarning!: HTMLDivElement;
  private writesLabelDiv!: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    this.build();
  }

  /* ── build full DOM tree ───────────────────────────────────── */

  private build(): void {
    const root = this.el;
    Object.assign(root.style, {
      maxWidth: "880px",
      margin: "0 auto",
      padding: "24px 8px",
      display: "grid",
      gap: "18px",
    });

    root.appendChild(this.buildRadioLinkCard());
    root.appendChild(this.buildFirstRunCard());
    root.appendChild(this.buildBrowserSupportCard());
  }

  /* ── Radio link card ───────────────────────────────────────── */

  private buildRadioLinkCard(): HTMLElement {
    const card = h("div", { className: "card" });

    this.radioLinkTitle = SectionTitle({
      children: "Radio link",
      hint: "Yaesu FTX-1 series · CAT over Web Serial",
    });
    card.appendChild(this.radioLinkTitle.el);

    const body = h("div", {
      styles: {
        padding: "18px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "18px",
      },
    });
    card.appendChild(body);

    /* ── Left column: info grid + buttons ── */
    const left = document.createElement("div");
    body.appendChild(left);

    const grid = h("div", {
      styles: {
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "8px 16px",
        fontFamily: "var(--font-mono)",
        fontSize: "13px",
      },
    });
    left.appendChild(grid);

    // STATUS row
    grid.appendChild(h("span", { text: "STATUS", styles: { color: "var(--ink-faint)" } }));
    const statusCell = document.createElement("span");
    this.statusPill = StatusPill({ status: "idle" });
    statusCell.appendChild(this.statusPill.el);
    grid.appendChild(statusCell);

    // RADIO ID row
    grid.appendChild(h("span", { text: "RADIO ID", styles: { color: "var(--ink-faint)" } }));
    const radioIdCell = document.createElement("span");
    this.radioIdSpan = h("span", { text: "—" });
    radioIdCell.appendChild(this.radioIdSpan);
    this.radioIdChip = h("span", {
      className: "chip chip-ok",
      text: "FTX-1 verified",
      styles: { marginLeft: "8px", display: "none" },
    });
    radioIdCell.appendChild(this.radioIdChip);
    grid.appendChild(radioIdCell);

    // FIRMWARE row
    grid.appendChild(h("span", { text: "FIRMWARE", styles: { color: "var(--ink-faint)" } }));
    const fwCell = document.createElement("span");
    this.firmwareSpan = h("span", { text: "—" });
    fwCell.appendChild(this.firmwareSpan);
    fwCell.appendChild(
      h("span", {
        text: " (MAIN)",
        styles: { color: "var(--ink-faint)", fontSize: "11px" },
      }),
    );
    grid.appendChild(fwCell);

    // BAUD row
    grid.appendChild(h("span", { text: "BAUD", styles: { color: "var(--ink-faint)" } }));
    grid.appendChild(h("span", { text: "38400 bps · 8N1" }));

    // AI MODE row
    grid.appendChild(h("span", { text: "AI MODE", styles: { color: "var(--ink-faint)" } }));
    const aiCell = document.createElement("span");
    aiCell.textContent = "OFF ";
    aiCell.appendChild(
      h("span", {
        text: "(polled)",
        styles: { color: "var(--ink-faint)", fontSize: "11px" },
      }),
    );
    grid.appendChild(aiCell);

    // Serial warning (hidden by default)
    this.serialWarning = h("div", {
      styles: {
        marginTop: "14px",
        padding: "8px 12px",
        borderRadius: "6px",
        background: "color-mix(in oklab, var(--err) 15%, var(--bg-rail))",
        border: "1px solid color-mix(in oklab, var(--err) 30%, var(--line))",
        fontSize: "12px",
        color: "var(--err)",
        lineHeight: "1.5",
        display: "none",
      },
    });
    this.serialWarning.textContent =
      "This browser does not support the Web Serial API. Use Chrome, Edge, or Opera, or enable Dry run to explore the UI without hardware.";
    left.appendChild(this.serialWarning);

    // Buttons row
    const btnRow = h("div", {
      styles: { marginTop: "18px", display: "flex", gap: "8px" },
    });

    this.connectBtn = h("button", { className: "btn btn-primary" });
    const connectLed = h("span", { className: "led led-on" });
    this.connectBtn.appendChild(connectLed);
    this.connectBtn.appendChild(document.createTextNode(" Connect"));
    this.connectBtn.addEventListener("click", () => {
      const { connect } = connectionStore.getState();
      connect();
    });
    btnRow.appendChild(this.connectBtn);

    this.disconnectBtn = h("button", { className: "btn", text: "Disconnect" });
    this.disconnectBtn.addEventListener("click", () => {
      const { disconnect } = connectionStore.getState();
      disconnect();
    });
    btnRow.appendChild(this.disconnectBtn);

    left.appendChild(btnRow);

    /* ── Right column: safety card ── */
    const right = h("div", {
      styles: {
        background: "var(--bg-rail)",
        borderRadius: "8px",
        padding: "16px",
        border: "1px solid var(--line)",
      },
    });
    body.appendChild(right);

    right.appendChild(
      h("div", {
        text: "Safety",
        styles: {
          fontSize: "10px",
          fontWeight: "600",
          letterSpacing: "0.14em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          marginBottom: "10px",
        },
      }),
    );

    const toggleGrid = h("div", { styles: { display: "grid", gap: "12px" } });
    right.appendChild(toggleGrid);

    // Dry run toggle row
    const dryRunRow = h("div", {
      styles: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      },
    });
    const dryRunLabel = document.createElement("div");
    dryRunLabel.appendChild(
      h("div", { text: "Dry run", styles: { fontSize: "13px", fontWeight: "500" } }),
    );
    dryRunLabel.appendChild(
      h("div", {
        text: "Port closed; frames logged only",
        styles: { fontSize: "11px", color: "var(--ink-faint)" },
      }),
    );
    dryRunRow.appendChild(dryRunLabel);

    this.dryRunToggle = Toggle({
      checked: false,
      onChange: (on: boolean) => {
        connectionStore.getState().setDryRun(on);
      },
    });
    dryRunRow.appendChild(this.dryRunToggle.el);
    toggleGrid.appendChild(dryRunRow);

    // Writes enabled toggle row
    const writesRow = h("div", {
      styles: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      },
    });
    const writesLabel = document.createElement("div");
    this.writesLabelDiv = h("div", {
      text: "Writes enabled",
      styles: { fontSize: "13px", fontWeight: "500" },
    });
    writesLabel.appendChild(this.writesLabelDiv);
    writesLabel.appendChild(
      h("div", {
        text: "Allow Set commands to reach the radio",
        styles: { fontSize: "11px", color: "var(--ink-faint)" },
      }),
    );
    writesRow.appendChild(writesLabel);

    this.writesToggle = Toggle({
      checked: false,
      onChange: (on: boolean) => {
        connectionStore.getState().enableWrites(on);
      },
      danger: true,
    });
    writesRow.appendChild(this.writesToggle.el);
    toggleGrid.appendChild(writesRow);

    return card;
  }

  /* ── First-run setup card ──────────────────────────────────── */

  private buildFirstRunCard(): HTMLElement {
    const card = h("div", { className: "card" });

    this.firstRunTitle = SectionTitle({
      children: "First-run setup",
      hint: "One-time per machine",
    });
    card.appendChild(this.firstRunTitle.el);

    const ol = document.createElement("ol");
    Object.assign(ol.style, {
      padding: "16px 18px 16px 38px",
      margin: "0",
      display: "grid",
      gap: "8px",
      fontSize: "13px",
      color: "var(--ink-mute)",
      lineHeight: "1.55",
    });

    // Step 1
    const li1 = document.createElement("li");
    li1.appendChild(document.createTextNode("Install the Silicon Labs "));
    li1.appendChild(monoSpan("CP210x", "var(--ink)"));
    li1.appendChild(document.createTextNode(" driver from Yaesu (manual p.1)."));
    ol.appendChild(li1);

    // Step 2
    const li2 = document.createElement("li");
    li2.textContent = "Connect a USB-C cable from the FTX-1 USB port to the PC.";
    ol.appendChild(li2);

    // Step 3
    const li3 = document.createElement("li");
    li3.appendChild(document.createTextNode("Power on the radio. Default CAT-1 baud is "));
    li3.appendChild(monoSpan("38400 bps", "var(--ink)"));
    li3.appendChild(document.createTextNode(" (manual p.4)."));
    ol.appendChild(li3);

    // Step 4
    const li4 = document.createElement("li");
    li4.appendChild(document.createTextNode("Click "));
    const em = document.createElement("em");
    em.style.color = "var(--ink)";
    em.textContent = "Connect";
    li4.appendChild(em);
    li4.appendChild(document.createTextNode(", then choose the device labeled "));
    li4.appendChild(monoSpan("Silicon Labs … Enhanced COM Port", "var(--ink)"));
    li4.appendChild(document.createTextNode("."));
    ol.appendChild(li4);

    // Step 5
    const li5 = document.createElement("li");
    li5.appendChild(document.createTextNode("The app handshakes by reading "));
    li5.appendChild(monoSpan("ID;", "var(--accent)"));
    li5.appendChild(document.createTextNode(" and "));
    li5.appendChild(monoSpan("VE0;", "var(--accent)"));
    li5.appendChild(document.createTextNode(". Auto-Information is left OFF."));
    ol.appendChild(li5);

    card.appendChild(ol);
    return card;
  }

  /* ── Browser support card ──────────────────────────────────── */

  private buildBrowserSupportCard(): HTMLElement {
    const card = h("div", { className: "card" });
    card.style.borderColor = "color-mix(in oklab, var(--warn) 30%, var(--line))";

    this.browserTitle = SectionTitle({ children: "Browser support" });
    card.appendChild(this.browserTitle.el);

    const grid = h("div", {
      styles: {
        padding: "12px 18px",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "14px",
        fontSize: "12px",
      },
    });

    const browsers = ["Chrome 89+", "Edge 89+", "Opera 76+", "Safari ✗"];
    for (const b of browsers) {
      const ok = !b.includes("✗");
      const item = h("div", {
        styles: {
          padding: "10px 12px",
          background: "var(--bg-rail)",
          borderRadius: "6px",
          border: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        },
      });
      item.appendChild(h("span", { className: ok ? "led led-on" : "led led-err" }));
      item.appendChild(
        h("span", {
          text: b,
          styles: { color: ok ? "var(--ink)" : "var(--ink-faint)" },
        }),
      );
      grid.appendChild(item);
    }

    card.appendChild(grid);
    return card;
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
    const {
      status,
      error,
      radioId,
      firmware,
      dryRun,
      writesEnabled,
    } = connectionStore.getState();

    const supported = CatTransport.isWebSerialSupported();

    // Derived display status
    const displayStatus =
      dryRun && status !== "connected"
        ? "dry-run"
        : status === "disconnected"
          ? "idle"
          : status;

    // Status pill
    this.statusPill.update({ status: displayStatus, error });

    // Radio ID
    this.radioIdSpan.textContent = radioId ?? "—";
    this.radioIdChip.style.display = radioId === "0840" ? "" : "none";

    // Firmware
    this.firmwareSpan.textContent = firmware ?? "—";

    // Serial warning visibility
    this.serialWarning.style.display =
      !supported && !dryRun ? "" : "none";

    // Connect / Disconnect button states
    this.connectBtn.disabled =
      status === "connecting" || status === "connected";
    this.disconnectBtn.disabled = status !== "connected";

    // Dry run toggle
    this.dryRunToggle.update({ checked: dryRun });

    // Writes toggle
    this.writesToggle.update({ checked: writesEnabled });

    // Writes label text & color
    this.writesLabelDiv.textContent =
      writesEnabled ? "Writes enabled · ARMED" : "Writes enabled";
    this.writesLabelDiv.style.color = writesEnabled ? "var(--tx)" : "";
  }
}
