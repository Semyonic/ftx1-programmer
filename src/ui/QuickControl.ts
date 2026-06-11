// Quick Control panel — VFO MAIN/SUB, mode, S-meter, PTT.
// Vanilla TypeScript port of QuickControl.tsx.

import { connectionStore } from "../store/connection";
import {
  readSMeter,
  readVfoMain,
  readVfoSub,
  setMode,
  setTx,
  setVfoMain,
  setVfoSub,
  copyMainToSub,
  copySubToMain,
  swapVfo,
  setSplit,
} from "../cat/commands";
import { MODE_BY_CHAR, type Mode } from "../cat/codec";
import { FreqReadout, SMeter, SpectrumStrip, SectionTitle } from "./Atoms";

const MODES = Object.values(MODE_BY_CHAR);

const FREQ_INCREMENTS: { label: string; hz: number }[] = [
  { label: "+10Hz", hz: 10 },
  { label: "+100Hz", hz: 100 },
  { label: "+1k", hz: 1000 },
  { label: "+10k", hz: 10000 },
  { label: "+100k", hz: 100000 },
  { label: "+1M", hz: 1000000 },
];

/** Unicode middle dot for "MAIN · A" / "SUB · B" chip labels */
const MIDDOT = "·";

function createNotConnected(): HTMLElement {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "grid",
    placeItems: "center",
    padding: "60px",
  });

  const card = document.createElement("div");
  card.className = "card";
  Object.assign(card.style, {
    padding: "36px",
    maxWidth: "420px",
    textAlign: "center",
  });

  const led = document.createElement("div");
  led.className = "led led-err";
  Object.assign(led.style, {
    width: "14px",
    height: "14px",
    margin: "0 auto 14px",
  });

  const title = document.createElement("div");
  Object.assign(title.style, {
    fontSize: "16px",
    fontWeight: "600",
    marginBottom: "6px",
  });
  title.textContent = "No radio connected";

  const desc = document.createElement("div");
  Object.assign(desc.style, {
    fontSize: "13px",
    color: "var(--ink-faint)",
    marginBottom: "18px",
  });
  desc.textContent =
    "Connect a radio first, or enable Dry run on the Connect tab to explore the UI without hardware.";

  card.append(led, title, desc);
  wrapper.append(card);
  return wrapper;
}

export class QuickControl {
  readonly el: HTMLElement;

  // State
  private mainHz = 14250000;
  private subHz = 7100000;
  private mode: Mode = "USB";
  private sMeter: number | null = null;
  private busy = false;
  private active: "main" | "sub" = "main";
  private ptt = false;
  private pttError: string | null = null;
  private pttActive = false; // mirrors pttRef in React version

  // Cleanup handles
  private unsubStore: (() => void) | null = null;
  private jitterTimer: ReturnType<typeof setInterval> | null = null;
  private onVisChange: (() => void) | null = null;
  private onPageHide: (() => void) | null = null;

  // Sub-components (vanilla Atoms)
  private mainFreqReadout: ReturnType<typeof FreqReadout> | null = null;
  private subFreqReadout: ReturnType<typeof FreqReadout> | null = null;
  private sMeterComp: ReturnType<typeof SMeter> | null = null;
  private spectrumStrip: ReturnType<typeof SpectrumStrip> | null = null;
  private modeSection: ReturnType<typeof SectionTitle> | null = null;
  private pttSection: ReturnType<typeof SectionTitle> | null = null;
  private dialSection: ReturnType<typeof SectionTitle> | null = null;

  // DOM references for updates
  private notConnectedEl: HTMLElement | null = null;
  private connectedEl: HTMLElement | null = null;
  private mainChip: HTMLElement | null = null;
  private subChip: HTMLElement | null = null;
  private modeLabel: HTMLElement | null = null;
  private subModeLabel: HTMLElement | null = null;
  private freqBtns: HTMLButtonElement[] = [];
  private subVfoBtns: HTMLButtonElement[] = [];
  private modeBtns: HTMLButtonElement[] = [];
  private pttBtn: HTMLButtonElement | null = null;
  private pttTxLabel: HTMLElement | null = null;
  private pttStatusLabel: HTMLElement | null = null;
  private pttErrorEl: HTMLElement | null = null;
  private refreshBtn: HTMLButtonElement | null = null;
  private rfAfSqlNbCells: { nameEl: HTMLElement; valEl: HTMLElement }[] = [];

  constructor() {
    this.el = document.createElement("div");
    this.buildDOM();
  }

  mount(): void {
    // Subscribe to store
    this.unsubStore = connectionStore.subscribe(() => this.onStoreChange());
    this.onStoreChange(); // initial render

    // Safety: release PTT on visibilitychange, pagehide
    this.onVisChange = () => {
      if (document.visibilityState === "hidden" && this.pttActive) {
        void this.releasePtt();
      }
    };
    this.onPageHide = () => {
      if (this.pttActive) void this.releasePtt();
    };
    document.addEventListener("visibilitychange", this.onVisChange);
    window.addEventListener("pagehide", this.onPageHide);
  }

  unmount(): void {
    // Unsubscribe from store
    if (this.unsubStore) {
      this.unsubStore();
      this.unsubStore = null;
    }

    // Clear jitter timer
    if (this.jitterTimer !== null) {
      clearInterval(this.jitterTimer);
      this.jitterTimer = null;
    }

    // Remove event listeners
    if (this.onVisChange) {
      document.removeEventListener("visibilitychange", this.onVisChange);
      this.onVisChange = null;
    }
    if (this.onPageHide) {
      window.removeEventListener("pagehide", this.onPageHide);
      this.onPageHide = null;
    }

    // Unmount cleanup: release PTT if still active
    if (this.pttActive) void this.releasePtt();
  }

  // ── PTT safety logic ──

  /** Attempt TX0 with up to 3 retries. Surfaces failure as visible error. */
  private async releasePtt(): Promise<void> {
    if (!this.pttActive) return;
    this.pttActive = false;
    this.ptt = false;
    this.renderPtt();

    const t = connectionStore.getState().transport;
    if (!t) return;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await setTx(t, false, { armed: true });
        this.pttError = null;
        this.renderPttError();
        return;
      } catch (err) {
        console.error(`PTT release attempt ${attempt + 1} failed:`, err);
      }
    }
    this.pttError =
      "PTT release failed after 3 attempts — radio may still be keyed!";
    this.renderPttError();
  }

  // ── Store change handler ──

  private onStoreChange(): void {
    const { status, transport } = connectionStore.getState();

    // Toggle between not-connected and connected views
    const connected = status === "connected" && transport != null;
    if (this.notConnectedEl && this.connectedEl) {
      this.notConnectedEl.style.display = connected ? "none" : "";
      this.connectedEl.style.display = connected ? "" : "none";
    }

    // Manage jitter timer
    if (connected && this.jitterTimer === null) {
      this.jitterTimer = setInterval(() => {
        this.sMeter = Math.max(
          0,
          Math.min(15, (this.sMeter ?? 7) + (Math.random() - 0.5) * 2),
        );
        this.renderSMeter();
      }, 700);
    } else if (!connected && this.jitterTimer !== null) {
      clearInterval(this.jitterTimer);
      this.jitterTimer = null;
    }

    // Update button states
    this.renderButtons();
  }

  // ── Guard helper ──

  private guard(fn: () => Promise<void>): () => void {
    return () => {
      const { writesEnabled } = connectionStore.getState();
      if (!writesEnabled) return;
      this.busy = true;
      this.renderButtons();
      fn()
        .catch((err) => console.error(err))
        .finally(() => {
          this.busy = false;
          this.renderButtons();
        });
    };
  }

  // ── Refresh ──

  private async refresh(): Promise<void> {
    const { transport } = connectionStore.getState();
    if (!transport) return;
    const a = await readVfoMain(transport);
    const b = await readVfoSub(transport);
    const s = await readSMeter(transport, "main");
    this.mainHz = a;
    this.subHz = b;
    this.sMeter = s;
    this.renderFreq();
    this.renderSMeter();
  }

  // ── PTT handlers ──

  private onPttDown = (): void => {
    const { writesEnabled, transport } = connectionStore.getState();
    if (!writesEnabled) return;
    this.pttActive = true;
    this.ptt = true;
    this.pttError = null;
    this.renderPtt();
    this.renderPttError();
    if (transport) {
      void setTx(transport, true, { armed: true }).catch(console.error);
    }
  };

  private onPttUp = (): void => {
    void this.releasePtt();
  };

  // ── DOM construction ──

  private buildDOM(): void {
    // Not-connected view
    this.notConnectedEl = createNotConnected();
    this.el.append(this.notConnectedEl);

    // Connected view (initially hidden)
    this.connectedEl = document.createElement("div");
    Object.assign(this.connectedEl.style, {
      maxWidth: "1180px",
      margin: "0 auto",
      padding: "24px 8px",
      display: "grid",
      gridTemplateColumns: "1fr 320px",
      gap: "18px",
      alignItems: "start",
    });
    this.connectedEl.style.display = "none";
    this.el.append(this.connectedEl);

    // Left column
    const leftCol = document.createElement("div");
    Object.assign(leftCol.style, { display: "grid", gap: "18px" });
    this.connectedEl.append(leftCol);

    // Main VFO display
    leftCol.append(this.buildMainVfo());

    // Sub VFO + S-meter row
    leftCol.append(this.buildSubVfoSMeterRow());

    // Mode selector grid
    leftCol.append(this.buildModeGrid());

    // Right sidebar
    const rightCol = document.createElement("div");
    Object.assign(rightCol.style, { display: "grid", gap: "18px" });
    this.connectedEl.append(rightCol);

    // PTT button
    rightCol.append(this.buildPttCard());

    // Dial knob
    rightCol.append(this.buildDialCard());

    // Quick refresh
    rightCol.append(this.buildRefreshCard());
  }

  // ── Main VFO card ──

  private buildMainVfo(): HTMLElement {
    const card = document.createElement("div");
    card.className = "card panel-grain";
    Object.assign(card.style, { padding: "18px" });

    // Header row
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "12px",
    });

    // Left side: chip + mode
    const leftGroup = document.createElement("div");
    Object.assign(leftGroup.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
    });

    this.mainChip = document.createElement("span");
    this.mainChip.className = "chip chip-accent";
    this.mainChip.style.cursor = "pointer";
    this.mainChip.textContent = `MAIN ${MIDDOT} A`;
    this.mainChip.addEventListener("click", () => {
      this.active = "main";
      this.renderChips();
    });

    this.modeLabel = document.createElement("span");
    Object.assign(this.modeLabel.style, {
      fontSize: "11px",
      color: "var(--ink-faint)",
    });
    this.modeLabel.textContent = this.mode;

    leftGroup.append(this.mainChip, this.modeLabel);

    // Right side: frequency increment buttons
    const freqBtnGroup = document.createElement("div");
    Object.assign(freqBtnGroup.style, { display: "flex", gap: "4px" });

    this.freqBtns = [];
    for (const { label, hz } of FREQ_INCREMENTS) {
      const btn = document.createElement("button");
      btn.className = "btn";
      Object.assign(btn.style, { padding: "4px 8px", fontSize: "10px" });
      btn.textContent = label;
      btn.addEventListener("click", () => {
        const { transport, writesEnabled } = connectionStore.getState();
        if (this.active === "main") {
          const next = this.mainHz + hz;
          this.mainHz = next;
          this.renderFreq();
          if (writesEnabled && transport) {
            void setVfoMain(transport, next).catch(console.error);
          }
        } else {
          const next = this.subHz + hz;
          this.subHz = next;
          this.renderFreq();
          if (writesEnabled && transport) {
            void setVfoSub(transport, next).catch(console.error);
          }
        }
      });
      this.freqBtns.push(btn);
      freqBtnGroup.append(btn);
    }

    header.append(leftGroup, freqBtnGroup);
    card.append(header);

    // FreqReadout (xl)
    this.mainFreqReadout = FreqReadout({ hz: this.mainHz, size: "xl" });
    card.append(this.mainFreqReadout.el);

    // SpectrumStrip
    const specWrapper = document.createElement("div");
    Object.assign(specWrapper.style, { marginTop: "14px" });
    this.spectrumStrip = SpectrumStrip({
      centerMhz: this.mainHz / 1e6,
      span: 50,
    });
    specWrapper.append(this.spectrumStrip.el);
    card.append(specWrapper);

    return card;
  }

  // ── Sub VFO + S-meter row ──

  private buildSubVfoSMeterRow(): HTMLElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "18px",
    });

    // Sub VFO card
    row.append(this.buildSubVfoCard());

    // S-meter card
    row.append(this.buildSMeterCard());

    return row;
  }

  private buildSubVfoCard(): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
    Object.assign(card.style, { padding: "16px" });

    // Header
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "10px",
    });

    this.subChip = document.createElement("span");
    this.subChip.className = "chip";
    this.subChip.style.cursor = "pointer";
    this.subChip.textContent = `SUB ${MIDDOT} B`;
    this.subChip.addEventListener("click", () => {
      this.active = "sub";
      this.renderChips();
    });

    this.subModeLabel = document.createElement("span");
    Object.assign(this.subModeLabel.style, {
      fontSize: "10px",
      color: "var(--ink-faint)",
      letterSpacing: "0.1em",
    });
    this.subModeLabel.textContent = this.mode;

    header.append(this.subChip, this.subModeLabel);
    card.append(header);

    // FreqReadout (md)
    this.subFreqReadout = FreqReadout({ hz: this.subHz, size: "md" });
    card.append(this.subFreqReadout.el);

    // Sub VFO buttons: A->B, B->A, SWAP, SPLIT
    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, {
      marginTop: "10px",
      display: "flex",
      gap: "4px",
    });

    const subActions: { label: string; action: () => Promise<void> }[] = [
      {
        label: "A→B",
        action: () => {
          const t = connectionStore.getState().transport;
          return t ? copyMainToSub(t) : Promise.resolve();
        },
      },
      {
        label: "B→A",
        action: () => {
          const t = connectionStore.getState().transport;
          return t ? copySubToMain(t) : Promise.resolve();
        },
      },
      {
        label: "SWAP",
        action: () => {
          const t = connectionStore.getState().transport;
          return t ? swapVfo(t) : Promise.resolve();
        },
      },
      {
        label: "SPLIT",
        action: () => {
          const t = connectionStore.getState().transport;
          return t ? setSplit(t, true) : Promise.resolve();
        },
      },
    ];

    this.subVfoBtns = [];
    for (const { label, action } of subActions) {
      const btn = document.createElement("button");
      btn.className = "btn";
      Object.assign(btn.style, {
        flex: "1",
        fontSize: "10px",
        justifyContent: "center",
      });
      btn.textContent = label;
      btn.addEventListener("click", this.guard(() => action()));
      this.subVfoBtns.push(btn);
      btnRow.append(btn);
    }

    card.append(btnRow);
    return card;
  }

  private buildSMeterCard(): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
    Object.assign(card.style, { padding: "16px" });

    // Header
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px",
    });

    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = "RX SIGNAL";

    const peakLabel = document.createElement("span");
    Object.assign(peakLabel.style, {
      fontSize: "10px",
      color: "var(--ink-faint)",
    });
    peakLabel.textContent = "peak hold 1s";

    header.append(chip, peakLabel);
    card.append(header);

    // SMeter component
    this.sMeterComp = SMeter({ value: this.sMeter ?? 7 });
    card.append(this.sMeterComp.el);

    // RF/AF/SQL/NB grid
    const grid = document.createElement("div");
    Object.assign(grid.style, {
      marginTop: "10px",
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "4px",
    });

    const readoutData: [string, number][] = [
      ["RF", 80],
      ["AF", 35],
      ["SQL", 12],
      ["NB", 0],
    ];

    this.rfAfSqlNbCells = [];
    for (const [name, value] of readoutData) {
      const cell = document.createElement("div");
      Object.assign(cell.style, {
        background: "var(--bg-rail)",
        border: "1px solid var(--line)",
        borderRadius: "4px",
        padding: "5px 8px",
      });

      const nameEl = document.createElement("div");
      Object.assign(nameEl.style, {
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        color: "var(--ink-faint)",
        letterSpacing: "0.1em",
      });
      nameEl.textContent = name;

      const valEl = document.createElement("div");
      Object.assign(valEl.style, {
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        color: "var(--ink)",
      });
      valEl.textContent = String(value);

      cell.append(nameEl, valEl);
      grid.append(cell);
      this.rfAfSqlNbCells.push({ nameEl, valEl });
    }

    card.append(grid);
    return card;
  }

  // ── Mode grid ──

  private buildModeGrid(): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";

    // SectionTitle
    this.modeSection = SectionTitle({
      children: "Mode",
      hint: "Operating mode for the active VFO",
    });
    card.append(this.modeSection.el);

    const grid = document.createElement("div");
    Object.assign(grid.style, {
      padding: "16px",
      display: "grid",
      gridTemplateColumns: "repeat(9, 1fr)",
      gap: "6px",
    });

    this.modeBtns = [];
    for (const m of MODES) {
      const btn = document.createElement("button");
      btn.className = "btn";
      const isActive = m === this.mode;
      Object.assign(btn.style, {
        justifyContent: "center",
        fontSize: "11px",
        padding: "8px 4px",
        background: isActive ? "var(--accent)" : "var(--bg-elev)",
        color: isActive ? "var(--bg-deep)" : "var(--ink)",
        borderColor: isActive ? "var(--accent)" : "var(--line)",
        fontWeight: isActive ? "600" : "500",
      });
      btn.textContent = m;
      btn.addEventListener(
        "click",
        this.guard(async () => {
          this.mode = m;
          this.renderModeGrid();
          this.renderModeLabels();
          const { transport } = connectionStore.getState();
          if (transport) {
            await setMode(transport, this.active, m);
          }
        }),
      );
      this.modeBtns.push(btn);
      grid.append(btn);
    }

    card.append(grid);
    return card;
  }

  // ── PTT card ──

  private buildPttCard(): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
    Object.assign(card.style, { padding: "18px" });

    // SectionTitle
    this.pttSection = SectionTitle({
      children: "PTT",
      hint: "Hold to transmit · releases on blur",
    });
    card.append(this.pttSection.el);

    const inner = document.createElement("div");
    Object.assign(inner.style, { padding: "18px" });

    // PTT button
    this.pttBtn = document.createElement("button");
    Object.assign(this.pttBtn.style, {
      width: "100%",
      aspectRatio: "1",
      border: "2px solid var(--tx)",
      background: "var(--tx-soft)",
      color: "var(--tx)",
      borderRadius: "12px",
      fontSize: "14px",
      fontWeight: "700",
      letterSpacing: "0.16em",
      fontFamily: "var(--font-mono)",
      cursor: "pointer",
      opacity: "1",
      transition: "background 80ms",
      animation: "none",
    });

    this.pttTxLabel = document.createElement("div");
    Object.assign(this.pttTxLabel.style, { fontSize: "32px", marginBottom: "6px" });
    this.pttTxLabel.textContent = "TX";

    this.pttStatusLabel = document.createElement("div");
    Object.assign(this.pttStatusLabel.style, { fontSize: "10px" });
    this.pttStatusLabel.textContent = "PUSH TO TALK";

    this.pttBtn.append(this.pttTxLabel, this.pttStatusLabel);

    this.pttBtn.addEventListener("pointerdown", this.onPttDown);
    this.pttBtn.addEventListener("pointerup", this.onPttUp);
    this.pttBtn.addEventListener("pointerleave", this.onPttUp);
    this.pttBtn.addEventListener("pointercancel", this.onPttUp);
    this.pttBtn.addEventListener("blur", this.onPttUp);

    inner.append(this.pttBtn);

    // Info text
    const infoGrid = document.createElement("div");
    Object.assign(infoGrid.style, {
      marginTop: "14px",
      display: "grid",
      gap: "6px",
      fontSize: "11px",
      color: "var(--ink-faint)",
    });

    const row1 = document.createElement("div");
    Object.assign(row1.style, {
      display: "flex",
      justifyContent: "space-between",
    });
    const span1 = document.createElement("span");
    span1.textContent = "TX1; on hold, TX0; on release";
    row1.append(span1);

    const row2 = document.createElement("div");
    Object.assign(row2.style, {
      display: "flex",
      justifyContent: "space-between",
    });
    const span2 = document.createElement("span");
    span2.textContent = "auto-release on blur / disconnect";
    row2.append(span2);

    infoGrid.append(row1, row2);
    inner.append(infoGrid);

    // PTT error display
    this.pttErrorEl = document.createElement("div");
    Object.assign(this.pttErrorEl.style, {
      marginTop: "10px",
      padding: "8px 10px",
      fontSize: "11px",
      fontWeight: "600",
      color: "var(--err)",
      background: "color-mix(in oklab, var(--err) 10%, transparent)",
      border: "1px solid var(--err)",
      borderRadius: "6px",
      display: "none",
    });
    inner.append(this.pttErrorEl);

    card.append(inner);
    return card;
  }

  // ── Dial card ──

  private buildDialCard(): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
    Object.assign(card.style, { padding: "18px" });

    this.dialSection = SectionTitle({
      children: "Dial",
      hint: "VFO main tune",
    });
    card.append(this.dialSection.el);

    const inner = document.createElement("div");
    Object.assign(inner.style, {
      padding: "20px 18px",
      display: "grid",
      placeItems: "center",
    });

    const knob = document.createElement("div");
    knob.className = "knob";
    Object.assign(knob.style, { width: "160px", height: "160px" });
    inner.append(knob);

    const stepRow = document.createElement("div");
    Object.assign(stepRow.style, {
      marginTop: "14px",
      display: "flex",
      gap: "6px",
    });

    for (const s of ["10", "100", "1k", "10k"]) {
      const btn = document.createElement("button");
      btn.className = "btn";
      Object.assign(btn.style, { fontSize: "10px", padding: "4px 10px" });
      btn.textContent = `${s} Hz`;
      stepRow.append(btn);
    }

    inner.append(stepRow);
    card.append(inner);
    return card;
  }

  // ── Refresh card ──

  private buildRefreshCard(): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
    Object.assign(card.style, { padding: "14px" });

    const label = document.createElement("div");
    Object.assign(label.style, {
      fontSize: "10px",
      fontWeight: "600",
      letterSpacing: "0.14em",
      color: "var(--ink-faint)",
      textTransform: "uppercase",
      marginBottom: "8px",
    });
    label.textContent = "Quick refresh";
    card.append(label);

    this.refreshBtn = document.createElement("button");
    this.refreshBtn.className = "btn";
    Object.assign(this.refreshBtn.style, {
      width: "100%",
      justifyContent: "center",
    });
    this.refreshBtn.textContent = "Refresh FA / FB / SM";
    this.refreshBtn.addEventListener("click", () => {
      void this.refresh();
    });
    card.append(this.refreshBtn);

    return card;
  }

  // ── Render helpers (targeted DOM updates) ──

  private renderFreq(): void {
    if (this.mainFreqReadout) {
      this.mainFreqReadout.update({ hz: this.mainHz, size: "xl" });
    }
    if (this.subFreqReadout) {
      this.subFreqReadout.update({ hz: this.subHz, size: "md" });
    }
    if (this.spectrumStrip) {
      this.spectrumStrip.update({
        centerMhz: this.mainHz / 1e6,
        span: 50,
      });
    }
  }

  private renderSMeter(): void {
    if (this.sMeterComp) {
      this.sMeterComp.update({ value: this.sMeter ?? 7 });
    }
  }

  private renderChips(): void {
    if (this.mainChip) {
      this.mainChip.className =
        this.active === "main" ? "chip chip-accent" : "chip";
    }
    if (this.subChip) {
      this.subChip.className =
        this.active === "sub" ? "chip chip-accent" : "chip";
    }
  }

  private renderModeLabels(): void {
    if (this.modeLabel) {
      this.modeLabel.textContent = this.mode;
    }
    if (this.subModeLabel) {
      this.subModeLabel.textContent = this.mode;
    }
  }

  private renderModeGrid(): void {
    for (let i = 0; i < MODES.length; i++) {
      const m = MODES[i];
      const btn = this.modeBtns[i];
      if (!btn) continue;
      const isActive = m === this.mode;
      Object.assign(btn.style, {
        background: isActive ? "var(--accent)" : "var(--bg-elev)",
        color: isActive ? "var(--bg-deep)" : "var(--ink)",
        borderColor: isActive ? "var(--accent)" : "var(--line)",
        fontWeight: isActive ? "600" : "500",
      });
    }
  }

  private renderPtt(): void {
    if (!this.pttBtn) return;
    Object.assign(this.pttBtn.style, {
      background: this.ptt ? "var(--tx)" : "var(--tx-soft)",
      color: this.ptt ? "var(--bg-deep)" : "var(--tx)",
      animation: this.ptt ? "pulse-tx 1.2s infinite" : "none",
    });
    if (this.pttStatusLabel) {
      this.pttStatusLabel.textContent = this.ptt ? "ON AIR" : "PUSH TO TALK";
    }
  }

  private renderPttError(): void {
    if (!this.pttErrorEl) return;
    if (this.pttError) {
      this.pttErrorEl.textContent = this.pttError;
      this.pttErrorEl.style.display = "";
    } else {
      this.pttErrorEl.style.display = "none";
    }
  }

  private renderButtons(): void {
    const { status, writesEnabled } = connectionStore.getState();
    const offline = status !== "connected";
    const txDisabled = !writesEnabled || offline;

    // Freq increment buttons
    for (const btn of this.freqBtns) {
      btn.disabled = this.busy;
    }

    // Sub VFO buttons
    for (const btn of this.subVfoBtns) {
      btn.disabled = txDisabled || this.busy;
    }

    // Mode buttons
    for (const btn of this.modeBtns) {
      btn.disabled = txDisabled || this.busy;
    }

    // PTT button
    if (this.pttBtn) {
      this.pttBtn.disabled = txDisabled;
      Object.assign(this.pttBtn.style, {
        cursor: txDisabled ? "not-allowed" : "pointer",
        opacity: txDisabled ? "0.4" : "1",
      });
    }

    // Refresh button
    if (this.refreshBtn) {
      this.refreshBtn.disabled = this.busy;
    }
  }
}
