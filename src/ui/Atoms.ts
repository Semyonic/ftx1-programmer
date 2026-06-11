/* ------------------------------------------------------------------ */
/*  Atoms.ts — Vanilla-TS DOM factories (no React)                    */
/*  Each factory returns { el, update } so callers can patch in-place */
/* ------------------------------------------------------------------ */

const SVG_NS = "http://www.w3.org/2000/svg";

// ── helpers ──────────────────────────────────────────────────────────

function setStyles(el: HTMLElement | SVGElement, styles: Partial<CSSStyleDeclaration>) {
  for (const [k, v] of Object.entries(styles)) {
    if (v !== undefined) (el.style as any)[k] = v;
  }
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ── FreqReadout ─────────────────────────────────────────────────────

export interface FreqReadoutProps {
  hz: number | null;
  label?: string;
  accent?: string;
  size?: "xl" | "lg" | "md" | "sm";
  placeholder?: string;
  dim?: boolean;
}

export function FreqReadout(props: FreqReadoutProps) {
  const outer = document.createElement("div");
  setStyles(outer, {
    background: "#000",
    padding: "6px 10px 4px",
    position: "relative",
    minWidth: "0",
  });

  const inner = document.createElement("div");
  setStyles(inner, {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "flex-end",
    fontFamily: '"Barlow Condensed", "Roboto Condensed", system-ui, sans-serif',
    fontWeight: "700",
    lineHeight: "0.95",
    letterSpacing: "-0.01em",
    fontVariantNumeric: "tabular-nums",
  });
  outer.appendChild(inner);

  // placeholder overlay
  const placeholderEl = document.createElement("div");
  setStyles(placeholderEl, {
    position: "absolute",
    inset: "0",
    display: "grid",
    placeItems: "center",
    color: "var(--ftx-grey)",
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    letterSpacing: "0.2em",
  });
  outer.appendChild(placeholderEl);

  // digit spans (reused across updates)
  const emptySpan = document.createElement("span");
  const spans = Array.from({ length: 5 }, () => document.createElement("span"));

  function render(p: FreqReadoutProps) {
    const fontSize = p.size === "xl" ? 64 : p.size === "lg" ? 48 : p.size === "md" ? 32 : 22;
    inner.style.fontSize = `${fontSize}px`;
    inner.style.color = p.dim ? "var(--ftx-grey)" : "#ffffff";

    const empty = p.hz == null;

    // clear inner children
    inner.textContent = "";

    if (empty) {
      emptySpan.style.color = "var(--ftx-grey)";
      emptySpan.textContent = "—.———.———";
      inner.appendChild(emptySpan);
    } else {
      const padded = String(p.hz ?? 0).padStart(9, "0");
      const groups = [padded.slice(0, 3), padded.slice(3, 6), padded.slice(6, 9)];
      spans[0].textContent = groups[0].replace(/^0+/, "") || "0";
      spans[1].textContent = ".";
      spans[2].textContent = groups[1];
      spans[3].textContent = ".";
      spans[4].textContent = groups[2];
      for (const s of spans) inner.appendChild(s);
    }

    // placeholder
    if (p.placeholder && empty) {
      placeholderEl.textContent = p.placeholder;
      placeholderEl.style.display = "grid";
    } else {
      placeholderEl.style.display = "none";
    }
  }

  render(props);

  return {
    el: outer,
    update(p: FreqReadoutProps) {
      render(p);
    },
  };
}

// ── SMeter ──────────────────────────────────────────────────────────

export interface SMeterProps {
  value: number | null;
  mode?: "rx" | "tx";
}

export function SMeter(props: SMeterProps) {
  const outer = document.createElement("div");
  setStyles(outer, {
    background: "#000",
    padding: "4px 6px 2px",
    fontFamily: "var(--font-mono)",
  });

  // top tick row
  const tickRow = document.createElement("div");
  setStyles(tickRow, {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "10px",
    fontWeight: "700",
    color: "#fff",
    letterSpacing: "0.04em",
    paddingBottom: "1px",
  });
  outer.appendChild(tickRow);

  // db label (always last in tick row)
  const dbLabel = document.createElement("span");
  setStyles(dbLabel, { color: "var(--ftx-cyan)", fontWeight: "800", fontSize: "9px" });
  dbLabel.textContent = "dB +60";

  // bar track
  const track = document.createElement("div");
  setStyles(track, { position: "relative", height: "3px", background: "#1a1a1a" });
  outer.appendChild(track);

  const bar = document.createElement("div");
  setStyles(bar, {
    position: "absolute",
    left: "0",
    top: "0",
    bottom: "0",
    background: "var(--ftx-cyan)",
    boxShadow: "0 0 4px var(--ftx-cyan)",
  });
  track.appendChild(bar);

  // bottom row
  const bottomRow = document.createElement("div");
  setStyles(bottomRow, { display: "flex", alignItems: "center", gap: "4px", marginTop: "1px" });
  outer.appendChild(bottomRow);

  const diamond = document.createElement("span");
  setStyles(diamond, { fontSize: "10px", fontWeight: "800", color: "var(--ftx-red)" });
  diamond.textContent = "◆";
  bottomRow.appendChild(diamond);

  const bottomTrack = document.createElement("span");
  setStyles(bottomTrack, { flex: "1", height: "2px", background: "#1a1a1a" });
  bottomRow.appendChild(bottomTrack);

  const bottomBar = document.createElement("span");
  setStyles(bottomBar, { display: "block", height: "100%", background: "var(--ftx-red)" });
  bottomTrack.appendChild(bottomBar);

  const bottomLabel = document.createElement("span");
  setStyles(bottomLabel, { fontSize: "9px", fontWeight: "700", color: "#fff", letterSpacing: "0.1em" });
  bottomRow.appendChild(bottomLabel);

  function render(p: SMeterProps) {
    const v = p.value ?? 0;
    const mode = p.mode ?? "rx";
    const ticks =
      mode === "rx"
        ? ["S1", "3", "5", "7", "9", "+20", "+40", "+60"]
        : ["1", "5", "10", "20", "50", "100", "150W"];
    const pct = Math.max(0, Math.min(1, v / 32));

    // rebuild tick row
    tickRow.textContent = "";
    for (let i = 0; i < ticks.length; i++) {
      const sp = document.createElement("span");
      sp.style.color = i >= 5 ? "#ff8a8a" : "#fff";
      sp.textContent = ticks[i];
      tickRow.appendChild(sp);
    }
    tickRow.appendChild(dbLabel);

    bar.style.width = `${pct * 100}%`;
    bottomBar.style.width = `${pct * 60}%`;
    bottomLabel.textContent = mode === "rx" ? "VOL" : "PO";
  }

  render(props);

  return {
    el: outer,
    update(p: SMeterProps) {
      render(p);
    },
  };
}

// ── SpectrumStrip ───────────────────────────────────────────────────

export interface SpectrumStripProps {
  centerMhz?: number;
  span?: number;
}

export function SpectrumStrip(props: SpectrumStripProps) {
  const W = 800;
  const H = 80;

  const wrapper = document.createElement("div");
  wrapper.className = "display-scan";
  setStyles(wrapper, {
    background: "var(--bg-display)",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    padding: "8px",
    position: "relative",
  });

  // header
  const header = document.createElement("div");
  setStyles(header, {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    color: "var(--ink-faint)",
    letterSpacing: "0.1em",
    marginBottom: "4px",
  });
  wrapper.appendChild(header);

  const headerLeft = document.createElement("span");
  headerLeft.textContent = "SPECTRUM · MAIN";
  header.appendChild(headerLeft);

  const headerRight = document.createElement("span");
  header.appendChild(headerRight);

  // SVG
  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "none",
  });
  setStyles(svg as unknown as HTMLElement, { display: "block", width: "100%", height: "80px" });
  wrapper.appendChild(svg);

  // defs + gradient
  const defs = svgEl("defs");
  svg.appendChild(defs);
  const grad = svgEl("linearGradient", { id: "specGrad", x1: "0", y1: "0", x2: "0", y2: "1" });
  defs.appendChild(grad);
  const stop1 = svgEl("stop", { offset: "0%", "stop-color": "var(--accent)", "stop-opacity": "0.4" });
  const stop2 = svgEl("stop", { offset: "100%", "stop-color": "var(--accent)", "stop-opacity": "0.02" });
  grad.appendChild(stop1);
  grad.appendChild(stop2);

  // center line
  const centerLine = svgEl("line", {
    x1: String(W / 2),
    y1: "0",
    x2: String(W / 2),
    y2: String(H),
    stroke: "var(--accent)",
    "stroke-width": "0.8",
    "stroke-dasharray": "2 3",
    opacity: "0.5",
  });
  svg.appendChild(centerLine);

  // horizontal guides
  for (const p of [0.25, 0.5, 0.75]) {
    const gl = svgEl("line", {
      x1: "0",
      y1: String(H * p),
      x2: String(W),
      y2: String(H * p),
      stroke: "var(--line)",
      "stroke-width": "0.5",
    });
    svg.appendChild(gl);
  }

  // fill path + stroke path
  const fillPath = svgEl("path", { fill: "url(#specGrad)" });
  svg.appendChild(fillPath);

  const strokePath = svgEl("path", {
    stroke: "var(--accent)",
    "stroke-width": "1.2",
    fill: "none",
  });
  (strokePath as unknown as HTMLElement).style.filter = "drop-shadow(0 0 3px var(--segment-glow))";
  svg.appendChild(strokePath);

  function generatePoints(_centerMhz: number, _span: number): number[] {
    const N = 120;
    return Array.from({ length: N }, (_, i) => {
      const x = i / (N - 1);
      const noise = Math.random() * 0.15;
      const peak1 = Math.exp(-Math.pow((x - 0.32) * 18, 2)) * 0.7;
      const peak2 = Math.exp(-Math.pow((x - 0.55) * 24, 2)) * 0.5;
      const peak3 = Math.exp(-Math.pow((x - 0.78) * 30, 2)) * 0.4;
      return Math.min(1, 0.18 + noise + peak1 + peak2 + peak3);
    });
  }

  function render(p: SpectrumStripProps) {
    const centerMhz = p.centerMhz ?? 14.25;
    const span = p.span ?? 50;

    headerRight.textContent = `±${span / 2} kHz · ${centerMhz.toFixed(3)} MHz`;

    const pts = generatePoints(centerMhz, span);

    const pathD = pts
      .map((y, i) => {
        const px = (i / (pts.length - 1)) * W;
        const py = H - y * H;
        return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(" ");

    strokePath.setAttribute("d", pathD);
    fillPath.setAttribute("d", `${pathD} L${W},${H} L0,${H} Z`);
  }

  render(props);

  return {
    el: wrapper,
    update(p: SpectrumStripProps) {
      render(p);
    },
  };
}

// ── SectionTitle ────────────────────────────────────────────────────

export interface SectionTitleProps {
  children: string | HTMLElement;
  hint?: string;
  right?: string | HTMLElement;
}

export function SectionTitle(props: SectionTitleProps) {
  const outer = document.createElement("div");
  setStyles(outer, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid var(--line)",
  });

  const left = document.createElement("div");
  outer.appendChild(left);

  const titleDiv = document.createElement("div");
  setStyles(titleDiv, {
    fontSize: "10px",
    fontWeight: "600",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--ink-faint)",
  });
  left.appendChild(titleDiv);

  const hintDiv = document.createElement("div");
  setStyles(hintDiv, { fontSize: "11px", color: "var(--ink-mute)", marginTop: "2px" });
  left.appendChild(hintDiv);

  // right slot placeholder
  let currentRight: HTMLElement | null = null;

  function setChild(parent: HTMLElement, content: string | HTMLElement) {
    parent.textContent = "";
    if (typeof content === "string") {
      parent.textContent = content;
    } else {
      parent.appendChild(content);
    }
  }

  function render(p: SectionTitleProps) {
    setChild(titleDiv, p.children);

    if (p.hint) {
      hintDiv.textContent = p.hint;
      hintDiv.style.display = "";
    } else {
      hintDiv.style.display = "none";
    }

    // right slot
    if (currentRight) {
      outer.removeChild(currentRight);
      currentRight = null;
    }
    if (p.right != null) {
      if (typeof p.right === "string") {
        const sp = document.createElement("span");
        sp.textContent = p.right;
        outer.appendChild(sp);
        currentRight = sp;
      } else {
        outer.appendChild(p.right);
        currentRight = p.right;
      }
    }
  }

  render(props);

  return {
    el: outer,
    update(p: SectionTitleProps) {
      render(p);
    },
  };
}

// ── Toggle ──────────────────────────────────────────────────────────

export interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  danger?: boolean;
}

export function Toggle(props: ToggleProps) {
  const label = document.createElement("label");
  setStyles(label, {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    userSelect: "none",
  });

  // track
  const track = document.createElement("span");
  setStyles(track, {
    width: "36px",
    height: "20px",
    borderRadius: "12px",
    border: "1px solid var(--line)",
    position: "relative",
    transition: "background 120ms",
  });
  label.appendChild(track);

  // thumb
  const thumb = document.createElement("span");
  setStyles(thumb, {
    position: "absolute",
    top: "1px",
    width: "16px",
    height: "16px",
    borderRadius: "10px",
    transition: "left 140ms cubic-bezier(.4,1.4,.6,1)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  });
  track.appendChild(thumb);

  // hidden checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.style.display = "none";
  label.appendChild(checkbox);

  // label text
  const labelText = document.createElement("span");
  setStyles(labelText, {
    fontSize: "12px",
    color: "var(--ink-mute)",
    letterSpacing: "0.04em",
  });
  label.appendChild(labelText);

  let currentOnChange: ((checked: boolean) => void) | undefined;

  checkbox.addEventListener("change", () => {
    currentOnChange?.(checkbox.checked);
  });

  function render(p: ToggleProps) {
    label.style.cursor = p.disabled ? "not-allowed" : "pointer";
    label.style.opacity = p.disabled ? "0.5" : "1";

    track.style.background = p.checked
      ? p.danger
        ? "var(--tx)"
        : "var(--accent)"
      : "var(--bg-rail)";

    thumb.style.left = p.checked ? "17px" : "1px";
    thumb.style.background = p.checked ? "var(--bg-deep)" : "var(--ink-mute)";

    checkbox.checked = p.checked;
    checkbox.disabled = !!p.disabled;

    currentOnChange = p.onChange;

    if (p.label) {
      labelText.textContent = p.label;
      labelText.style.display = "";
    } else {
      labelText.style.display = "none";
    }
  }

  render(props);

  return {
    el: label,
    update(p: ToggleProps) {
      render(p);
    },
  };
}

// ── StatusPill ──────────────────────────────────────────────────────

export interface StatusPillProps {
  status: string;
  error?: string | null;
}

const STATUS_MAP: Record<string, { label: string; led: string; color: string }> = {
  connected: { label: "CONNECTED", led: "led-on", color: "var(--ok)" },
  connecting: { label: "CONNECTING", led: "led-warn", color: "var(--warn)" },
  error: { label: "ERROR", led: "led-err", color: "var(--err)" },
  idle: { label: "OFFLINE", led: "", color: "var(--ink-faint)" },
  disconnected: { label: "OFFLINE", led: "", color: "var(--ink-faint)" },
  "dry-run": { label: "DRY RUN", led: "led-warn", color: "var(--warn)" },
};

export function StatusPill(props: StatusPillProps) {
  const outer = document.createElement("div");
  setStyles(outer, {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "5px 10px",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    background: "var(--bg-elev)",
  });

  const led = document.createElement("span");
  outer.appendChild(led);

  const labelSpan = document.createElement("span");
  setStyles(labelSpan, {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.14em",
  });
  outer.appendChild(labelSpan);

  const errorSpan = document.createElement("span");
  setStyles(errorSpan, {
    fontSize: "11px",
    color: "var(--err)",
    marginLeft: "4px",
  });
  outer.appendChild(errorSpan);

  function render(p: StatusPillProps) {
    const s = STATUS_MAP[p.status] ?? STATUS_MAP.idle;

    led.className = `led ${s.led}`;
    labelSpan.style.color = s.color;
    labelSpan.textContent = s.label;

    if (p.error) {
      errorSpan.textContent = `· ${p.error}`;
      errorSpan.style.display = "";
    } else {
      errorSpan.style.display = "none";
    }
  }

  render(props);

  return {
    el: outer,
    update(p: StatusPillProps) {
      render(p);
    },
  };
}

// ── ProgressBar ─────────────────────────────────────────────────────

export interface ProgressBarProps {
  value: number;
  max: number;
}

export function ProgressBar(props: ProgressBarProps) {
  const outer = document.createElement("div");
  setStyles(outer, {
    height: "4px",
    background: "var(--bg-rail)",
    borderRadius: "2px",
    overflow: "hidden",
    flex: "1",
  });

  const fill = document.createElement("div");
  setStyles(fill, {
    height: "100%",
    background: "var(--accent)",
    transition: "width 200ms",
  });
  outer.appendChild(fill);

  function render(p: ProgressBarProps) {
    const pct = p.max > 0 ? (p.value / p.max) * 100 : 0;
    fill.style.width = `${pct}%`;
  }

  render(props);

  return {
    el: outer,
    update(p: ProgressBarProps) {
      render(p);
    },
  };
}
