// Reusable visual atoms — hardware-instrument style.

const { useState, useEffect, useRef, useMemo } = React;

// FTX-1 frequency readout: large bold sans-serif digits on pure black,
// matching the radio's TFT screen.
function FreqReadout({ hz, label, accent, size = "lg", placeholder, dim }) {
  const padded = String(hz ?? 0).padStart(9, "0");
  const groups = [padded.slice(0, 3), padded.slice(3, 6), padded.slice(6, 9)];
  const fontSize = size === "xl" ? 64 : size === "lg" ? 48 : size === "md" ? 32 : 22;
  const empty = hz == null;
  return (
    <div style={{
      background: "#000",
      padding: "6px 10px 4px",
      position: "relative",
      minWidth: 0,
    }}>
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "flex-end",
        fontFamily: '"Barlow Condensed", "Roboto Condensed", system-ui, sans-serif',
        fontWeight: 700,
        fontSize,
        lineHeight: 0.95,
        color: dim ? "var(--ftx-grey)" : "#ffffff",
        letterSpacing: "-0.01em",
        fontVariantNumeric: "tabular-nums",
      }}>
        {empty ? (
          <span style={{ color: "var(--ftx-grey)" }}>—.———.———</span>
        ) : (
          <>
            <span>{groups[0].replace(/^0+/, "") || "0"}</span>
            <span>.</span>
            <span>{groups[1]}</span>
            <span>.</span>
            <span>{groups[2]}</span>
          </>
        )}
      </div>
      {placeholder && empty && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--ftx-grey)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em" }}>
          {placeholder}
        </div>
      )}
    </div>
  );
}

// FTX-1 S/Po meter — horizontal scale "S 1 3 5 7 9 +20 +40 +60" with cyan needle bar
function SMeter({ value, mode = "rx" }) {
  const v = value ?? 0;
  const ticks = mode === "rx"
    ? ["S1", "3", "5", "7", "9", "+20", "+40", "+60"]
    : ["1", "5", "10", "20", "50", "100", "150W"];
  const bottomLabel = mode === "rx" ? "VOL" : "PO";
  // bar position: 0..1
  const pct = Math.max(0, Math.min(1, v / 32));
  return (
    <div style={{ background: "#000", padding: "4px 6px 2px", fontFamily: "var(--font-mono)" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 10,
        fontWeight: 700,
        color: "#fff",
        letterSpacing: "0.04em",
        paddingBottom: 1,
      }}>
        {ticks.map((t, i) => (
          <span key={i} style={{ color: i >= 5 ? "#ff8a8a" : "#fff" }}>{t}</span>
        ))}
        <span style={{ color: "var(--ftx-cyan)", fontWeight: 800, fontSize: 9 }}>dB +60</span>
      </div>
      <div style={{ position: "relative", height: 3, background: "#1a1a1a" }}>
        <div style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${pct * 100}%`,
          background: "var(--ftx-cyan)",
          boxShadow: "0 0 4px var(--ftx-cyan)",
        }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ftx-red)" }}>◆</span>
        <span style={{ flex: 1, height: 2, background: "#1a1a1a" }}>
          <span style={{ display: "block", height: "100%", width: `${pct * 60}%`, background: "var(--ftx-red)" }} />
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: "0.1em" }}>{bottomLabel}</span>
      </div>
    </div>
  );
}

// FTX status pill row group — used in screen header
function FtxStatusGroup({ children }) {
  return <div style={{ display: "inline-flex", gap: 0, alignItems: "stretch" }}>{children}</div>;
}

// Spectrum line — decorative, suggests RX activity
function SpectrumStrip({ centerMhz = 14.25, span = 50 }) {
  const pts = useMemo(() => {
    const N = 120;
    return Array.from({ length: N }, (_, i) => {
      const x = i / (N - 1);
      const noise = Math.random() * 0.15;
      const peak1 = Math.exp(-Math.pow((x - 0.32) * 18, 2)) * 0.7;
      const peak2 = Math.exp(-Math.pow((x - 0.55) * 24, 2)) * 0.5;
      const peak3 = Math.exp(-Math.pow((x - 0.78) * 30, 2)) * 0.4;
      return Math.min(1, 0.18 + noise + peak1 + peak2 + peak3);
    });
  }, [centerMhz, span]);
  const W = 800, H = 80;
  const path = pts.map((y, i) => {
    const px = (i / (pts.length - 1)) * W;
    const py = H - y * H;
    return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(" ");
  const fillPath = `${path} L${W},${H} L0,${H} Z`;
  return (
    <div style={{ background: "var(--bg-display)", border: "1px solid var(--line)", borderRadius: 8, padding: 8, position: "relative" }} className="display-scan">
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-faint)", letterSpacing: "0.1em", marginBottom: 4 }}>
        <span>SPECTRUM · MAIN</span>
        <span>±{span / 2} kHz · {centerMhz.toFixed(3)} MHz</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 80 }}>
        <defs>
          <linearGradient id="specGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* center line */}
        <line x1={W / 2} y1="0" x2={W / 2} y2={H} stroke="var(--accent)" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.5" />
        {/* graticule */}
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1="0" y1={H * p} x2={W} y2={H * p} stroke="var(--line)" strokeWidth="0.5" />
        ))}
        <path d={fillPath} fill="url(#specGrad)" />
        <path d={path} stroke="var(--accent)" strokeWidth="1.2" fill="none" style={{ filter: "drop-shadow(0 0 3px var(--segment-glow))" }} />
      </svg>
    </div>
  );
}

// Section title
function SectionTitle({ children, hint, right }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: "1px solid var(--line)",
    }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-faint)" }}>{children}</div>
        {hint && <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 2 }}>{hint}</div>}
      </div>
      {right}
    </div>
  );
}

// Toggle switch (hardware-style)
function Toggle({ checked, onChange, disabled, label, danger }) {
  return (
    <label style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      userSelect: "none",
    }}>
      <span
        style={{
          width: 36,
          height: 20,
          background: checked ? (danger ? "var(--tx)" : "var(--accent)") : "var(--bg-rail)",
          borderRadius: 12,
          border: "1px solid var(--line)",
          position: "relative",
          transition: "background 120ms",
        }}
      >
        <span style={{
          position: "absolute",
          top: 1,
          left: checked ? 17 : 1,
          width: 16,
          height: 16,
          background: checked ? "var(--bg-deep)" : "var(--ink-mute)",
          borderRadius: 10,
          transition: "left 140ms cubic-bezier(.4,1.4,.6,1)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} style={{ display: "none" }} />
      {label && <span style={{ fontSize: 12, color: "var(--ink-mute)", letterSpacing: "0.04em" }}>{label}</span>}
    </label>
  );
}

// Status pill: connected/idle/etc.
function StatusPill({ status, error }) {
  const map = {
    connected: { label: "CONNECTED", led: "led-on", color: "var(--ok)" },
    connecting: { label: "CONNECTING", led: "led-warn", color: "var(--warn)" },
    error: { label: "ERROR", led: "led-err", color: "var(--err)" },
    idle: { label: "OFFLINE", led: "", color: "var(--ink-faint)" },
    "dry-run": { label: "DRY RUN", led: "led-warn", color: "var(--warn)" },
  };
  const s = map[status] || map.idle;
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "5px 10px",
      border: "1px solid var(--line)",
      borderRadius: 6,
      background: "var(--bg-elev)",
    }}>
      <span className={`led ${s.led}`} />
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: s.color }}>
        {s.label}
      </span>
      {error && <span style={{ fontSize: 11, color: "var(--err)", marginLeft: 4 }}>· {error}</span>}
    </div>
  );
}

// ProgressBar
function ProgressBar({ value, max }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ height: 4, background: "var(--bg-rail)", borderRadius: 2, overflow: "hidden", flex: 1 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", transition: "width 200ms" }} />
    </div>
  );
}

Object.assign(window, {
  FreqReadout, SMeter, SpectrumStrip, SectionTitle, Toggle, StatusPill, ProgressBar, FtxStatusGroup,
});
