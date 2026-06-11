import { connectionStore } from "../store/connection";
import { StatusPill, Toggle } from "./Atoms";
import { ConnectPanel } from "./ConnectPanel";
import { QuickControl } from "./QuickControl";
import { MemoryPanel } from "./MemoryPanel";
import { SettingsPanel } from "./SettingsPanel";
import { DebugPanel } from "./DebugPanel";

type Tab = "connect" | "control" | "memory" | "settings" | "debug";

const TABS: { id: Tab; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "control", label: "Control" },
  { id: "memory", label: "Memory" },
  { id: "settings", label: "Settings" },
  { id: "debug", label: "Debug" },
];

interface PanelEntry {
  el: HTMLElement;
  mount(): void;
  unmount(): void;
}

export class AppShell {
  el: HTMLElement;
  private panels: Map<string, PanelEntry>;
  private activeTab: Tab = "connect";
  private unsubs: (() => void)[] = [];
  private mounted = new Set<string>();

  /* header widgets */
  private statusPill: ReturnType<typeof StatusPill>;
  private dryRunToggle: ReturnType<typeof Toggle>;
  private writesToggle: ReturnType<typeof Toggle>;
  private writesHighlight: HTMLDivElement;
  private armBar: HTMLDivElement;
  private tabButtons: Map<Tab, HTMLButtonElement> = new Map();

  constructor() {
    this.statusPill = StatusPill({ status: "idle" });
    this.dryRunToggle = Toggle({ checked: true, label: "Dry run", onChange: (v) => connectionStore.getState().setDryRun(v) });
    this.writesToggle = Toggle({ checked: false, label: "Writes enabled", danger: true, onChange: (v) => connectionStore.getState().enableWrites(v) });
    this.writesHighlight = document.createElement("div");
    this.armBar = document.createElement("div");
    this.panels = new Map();
    this.el = document.createElement("div");
    this.build();
  }

  private build(): void {
    /* root */
    const root = this.el;
    Object.assign(root.style, {
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-deep)",
    });

    /* header */
    const header = document.createElement("header");
    Object.assign(header.style, {
      background: "var(--bg-panel)",
      borderBottom: "1px solid var(--line)",
      padding: "12px 20px 0",
    });

    /* top bar row */
    const topRow = document.createElement("div");
    Object.assign(topRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "16px",
      paddingBottom: "12px",
    });

    topRow.appendChild(this.buildWordmark());

    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    topRow.appendChild(spacer);

    /* right cluster */
    const rightCluster = document.createElement("div");
    Object.assign(rightCluster.style, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    });

    rightCluster.appendChild(this.statusPill.el);
    rightCluster.appendChild(this.dryRunToggle.el);

    /* writes highlight wrapper */
    Object.assign(this.writesHighlight.style, {
      padding: "0",
      background: "transparent",
      border: "1px solid transparent",
      borderRadius: "6",
      transition: "all 200ms",
    });
    this.writesHighlight.appendChild(this.writesToggle.el);
    rightCluster.appendChild(this.writesHighlight);
    topRow.appendChild(rightCluster);

    header.appendChild(topRow);

    /* tab nav */
    const nav = document.createElement("nav");
    Object.assign(nav.style, { display: "flex", gap: "4px", marginTop: "4px" });
    for (const t of TABS) {
      const btn = document.createElement("button");
      btn.className = "tab";
      btn.dataset.active = String(t.id === this.activeTab);
      btn.textContent = t.label;
      btn.addEventListener("click", () => this.switchTab(t.id));
      this.tabButtons.set(t.id, btn);
      nav.appendChild(btn);
    }
    header.appendChild(nav);
    root.appendChild(header);

    /* TX arm bar */
    Object.assign(this.armBar.style, {
      padding: "6px 20px",
      display: "none",
      alignItems: "center",
      gap: "10px",
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.1em",
    });
    this.armBar.className = "tx-arm-bar";
    const led = document.createElement("span");
    led.className = "led led-tx";
    this.armBar.appendChild(led);
    const armText = document.createElement("span");
    armText.textContent = "WRITES ARMED · Set commands will reach the radio. Disarm before walking away.";
    this.armBar.appendChild(armText);
    root.appendChild(this.armBar);

    /* main area */
    const main = document.createElement("main");
    main.className = "scroll-thin";
    Object.assign(main.style, { flex: "1", overflow: "auto", padding: "16px" });

    /* create panels */
    const connectPanel = new ConnectPanel();
    const controlPanel = new QuickControl();
    const memoryPanel = new MemoryPanel();
    const settingsPanel = new SettingsPanel();
    const debugPanel = new DebugPanel();

    this.panels.set("connect", connectPanel);
    this.panels.set("control", controlPanel);
    this.panels.set("memory", memoryPanel);
    this.panels.set("settings", settingsPanel);
    this.panels.set("debug", debugPanel);

    for (const [id, panel] of this.panels) {
      panel.el.style.display = id === this.activeTab ? "" : "none";
      main.appendChild(panel.el);
    }

    root.appendChild(main);

    /* footer */
    const footer = document.createElement("footer");
    Object.assign(footer.style, {
      flexShrink: "0",
      background: "var(--bg-panel)",
      borderTop: "1px solid var(--line)",
      padding: "8px 20px",
      display: "flex",
      alignItems: "center",
      gap: "14px",
      fontSize: "10px",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--ink-faint)",
      fontFamily: "var(--font-mono)",
    });

    const madeBy = document.createElement("span");
    madeBy.textContent = "Made by";
    footer.appendChild(madeBy);

    const link = document.createElement("a");
    link.href = "https://www.qrz.com/db/TA1SMO";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Lookup TA1SMO on QRZ.com";
    Object.assign(link.style, {
      padding: "2px 8px",
      border: "1px solid var(--line-strong)",
      borderRadius: "3px",
      color: "var(--accent)",
      background: "var(--bg-deep)",
      letterSpacing: "0.18em",
      fontWeight: "700",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
    });
    link.textContent = "TA1SMO";
    const arrow = document.createElement("span");
    Object.assign(arrow.style, { fontSize: "9px", opacity: "0.7" });
    arrow.textContent = "↗";
    link.appendChild(arrow);
    footer.appendChild(link);

    const footerSpacer = document.createElement("span");
    footerSpacer.style.flex = "1";
    footer.appendChild(footerSpacer);

    const trademarkWrap = document.createElement("span");
    Object.assign(trademarkWrap.style, { textTransform: "none", letterSpacing: "0.02em" });

    const tmLine1 = document.createElement("span");
    tmLine1.style.color = "var(--ink-mute)";
    tmLine1.textContent = "Yaesu® and FTX-1™ are trademarks of Yaesu Musen Co. Ltd.";
    trademarkWrap.appendChild(tmLine1);

    const tmLine2 = document.createElement("span");
    tmLine2.style.marginLeft = "8px";
    tmLine2.textContent = "· Independent third-party tool · not produced or endorsed by Yaesu.";
    trademarkWrap.appendChild(tmLine2);

    footer.appendChild(trademarkWrap);
    root.appendChild(footer);
  }

  private buildWordmark(): HTMLElement {
    const outer = document.createElement("div");
    Object.assign(outer.style, { display: "flex", alignItems: "center", gap: "12px" });

    const col = document.createElement("div");
    Object.assign(col.style, { display: "flex", flexDirection: "column", gap: "1px", lineHeight: "1" });

    const title = document.createElement("div");
    Object.assign(title.style, {
      fontFamily: '"Barlow Condensed", "Roboto Condensed", system-ui, sans-serif',
      fontSize: "22px",
      fontWeight: "800",
      letterSpacing: "0.02em",
      color: "#fff",
      display: "flex",
      alignItems: "baseline",
      gap: "0",
    });

    const ftx = document.createElement("span");
    ftx.textContent = "FTX-1";
    title.appendChild(ftx);

    const prog = document.createElement("span");
    prog.style.color = "var(--ftx-orange)";
    prog.textContent = "PROGRAMMER";
    title.appendChild(prog);

    col.appendChild(title);

    const subtitle = document.createElement("div");
    Object.assign(subtitle.style, {
      fontFamily: "var(--font-mono)",
      fontSize: "9px",
      color: "var(--ink-faint)",
      letterSpacing: "0.18em",
      textTransform: "uppercase",
    });
    subtitle.textContent = "CAT over Web Serial · Unofficial";
    col.appendChild(subtitle);

    outer.appendChild(col);
    return outer;
  }

  private switchTab(id: Tab): void {
    if (id === this.activeTab) return;

    /* hide all, show selected */
    for (const [panelId, panel] of this.panels) {
      panel.el.style.display = panelId === id ? "" : "none";
    }

    /* update tab buttons */
    for (const [tabId, btn] of this.tabButtons) {
      btn.dataset.active = String(tabId === id);
    }

    /* mount on first show */
    if (!this.mounted.has(id)) {
      this.mounted.add(id);
      this.panels.get(id)?.mount();
    }

    this.activeTab = id;
  }

  mount(): void {
    document.body.dataset.theme = "graphite";

    /* mount the default panel */
    if (!this.mounted.has(this.activeTab)) {
      this.mounted.add(this.activeTab);
      this.panels.get(this.activeTab)?.mount();
    }

    /* initial paint, then subscribe to store changes */
    this.syncHeader();
    const unsub = connectionStore.subscribe(() => this.syncHeader());
    this.unsubs.push(unsub);
  }

  private syncHeader(): void {
    const { status, writesEnabled, dryRun } = connectionStore.getState();

    /* compute display status */
    const displayStatus = dryRun && status !== "connected"
      ? "dry-run"
      : status === "disconnected" ? "idle" : status;

    /* update StatusPill */
    this.statusPill.update({ status: displayStatus });

    /* update dry-run toggle */
    this.dryRunToggle.update({ checked: dryRun });

    /* update writes toggle */
    this.writesToggle.update({
      checked: writesEnabled,
      label: writesEnabled ? "WRITES ARMED" : "Writes enabled",
    });

    /* writes highlight border */
    Object.assign(this.writesHighlight.style, {
      padding: writesEnabled ? "5px 10px" : "0",
      background: writesEnabled ? "var(--tx-soft)" : "transparent",
      border: writesEnabled ? "1px solid var(--tx)" : "1px solid transparent",
      borderRadius: "6px",
    });

    /* arm bar visibility */
    this.armBar.style.display = writesEnabled ? "flex" : "none";
  }

  unmount(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];

    for (const [id, panel] of this.panels) {
      if (this.mounted.has(id)) panel.unmount();
    }
    this.mounted.clear();
  }
}
