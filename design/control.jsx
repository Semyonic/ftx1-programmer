// Quick Control panel — VFO MAIN/SUB, mode, S-meter, PTT.

const { useState, useEffect } = React;

function ControlPanel({ ctx }) {
  const { status, writesEnabled } = ctx;
  const [mainHz, setMainHz] = useState(14250000);
  const [subHz, setSubHz] = useState(7100000);
  const [mode, setMode] = useState("USB");
  const [sMeter, setSMeter] = useState(7);
  const [active, setActive] = useState("main");
  const [ptt, setPtt] = useState(false);

  // Animate s-meter idle
  useEffect(() => {
    if (status !== "connected" && !ctx.dryRun) return;
    const t = setInterval(() => {
      setSMeter((v) => Math.max(0, Math.min(15, v + (Math.random() - 0.5) * 2)));
    }, 700);
    return () => clearInterval(t);
  }, [status, ctx.dryRun]);

  if (status !== "connected" && !ctx.dryRun) {
    return <NotConnected />;
  }

  const offline = status !== "connected";
  const txDisabled = !writesEnabled || offline;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 8px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 18 }}>
        {/* Main display */}
        <div className="card panel-grain" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={`chip ${active === "main" ? "chip-accent" : ""}`} onClick={() => setActive("main")} style={{ cursor: "pointer" }}>MAIN · A</span>
              <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{mode}</span>
              <span className="chip">14m</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["+10Hz","+100Hz","+1k","+10k","+100k","+1M"].map((s) => (
                <button key={s} className="btn" style={{ padding: "4px 8px", fontSize: 10 }} onClick={() => {
                  const inc = { "+10Hz": 10, "+100Hz": 100, "+1k": 1000, "+10k": 10000, "+100k": 100000, "+1M": 1000000 }[s];
                  setMainHz((h) => h + inc);
                }}>{s}</button>
              ))}
            </div>
          </div>
          <FreqReadout hz={mainHz} size="xl" />
          <div style={{ marginTop: 14 }}>
            <SpectrumStrip centerMhz={mainHz / 1e6} span={50} />
          </div>
        </div>

        {/* Sub VFO + meter row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span className={`chip ${active === "sub" ? "chip-accent" : ""}`} onClick={() => setActive("sub")} style={{ cursor: "pointer" }}>SUB · B</span>
              <span style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.1em" }}>USB</span>
            </div>
            <FreqReadout hz={subHz} size="md" />
            <div style={{ marginTop: 10, display: "flex", gap: 4 }}>
              {["A→B","B→A","SWAP","SPLIT"].map((s, i) => (
                <button key={s} className="btn" style={{ flex: 1, fontSize: 10, justifyContent: "center" }} disabled={txDisabled}>{s}</button>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span className="chip">RX SIGNAL</span>
              <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>peak hold 1s</span>
            </div>
            <SMeter value={sMeter} />
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
              {[
                ["RF", 80], ["AF", 35], ["SQL", 12], ["NB", 0],
              ].map(([n, v]) => (
                <div key={n} style={{ background: "var(--bg-rail)", border: "1px solid var(--line)", borderRadius: 4, padding: "5px 8px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-faint)", letterSpacing: "0.1em" }}>{n}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mode + filter */}
        <div className="card">
          <SectionTitle hint="Operating mode for the active VFO">Mode</SectionTitle>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 6 }}>
            {MODES.map((m) => (
              <button
                key={m}
                className="btn"
                onClick={() => setMode(m)}
                style={{
                  justifyContent: "center",
                  fontSize: 11,
                  padding: "8px 4px",
                  background: m === mode ? "var(--accent)" : "var(--bg-elev)",
                  color: m === mode ? "var(--bg-deep)" : "var(--ink)",
                  borderColor: m === mode ? "var(--accent)" : "var(--line)",
                  fontWeight: m === mode ? 600 : 500,
                }}
                disabled={txDisabled}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right rail: PTT, dial */}
      <div style={{ display: "grid", gap: 18 }}>
        <div className="card" style={{ padding: 18 }}>
          <SectionTitle hint="Hold to transmit · releases on blur">PTT</SectionTitle>
          <div style={{ padding: 18 }}>
            <button
              onPointerDown={() => !txDisabled && setPtt(true)}
              onPointerUp={() => setPtt(false)}
              onPointerLeave={() => setPtt(false)}
              onBlur={() => setPtt(false)}
              disabled={txDisabled}
              style={{
                width: "100%",
                aspectRatio: "1",
                border: "2px solid var(--tx)",
                background: ptt ? "var(--tx)" : "var(--tx-soft)",
                color: ptt ? "var(--bg-deep)" : "var(--tx)",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.16em",
                fontFamily: "var(--font-mono)",
                cursor: txDisabled ? "not-allowed" : "pointer",
                opacity: txDisabled ? 0.4 : 1,
                transition: "background 80ms",
                animation: ptt ? "pulse-tx 1.2s infinite" : "none",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 6 }}>{ptt ? "TX" : "TX"}</div>
              <div style={{ fontSize: 10 }}>{ptt ? "ON AIR" : "PUSH TO TALK"}</div>
            </button>
            <div style={{ marginTop: 14, display: "grid", gap: 6, fontSize: 11, color: "var(--ink-faint)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>TX1; on hold, TX0; on release</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>auto-release on blur / disconnect</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <SectionTitle hint="VFO main tune">Dial</SectionTitle>
          <div style={{ padding: "20px 18px", display: "grid", placeItems: "center" }}>
            <div className="knob" style={{ width: 160, height: 160 }} />
            <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
              {["10", "100", "1k", "10k"].map((s) => (
                <button key={s} className="btn" style={{ fontSize: 10, padding: "4px 10px" }}>{s} Hz</button>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", color: "var(--ink-faint)", textTransform: "uppercase", marginBottom: 8 }}>
            Quick refresh
          </div>
          <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => setSMeter(Math.floor(Math.random() * 16))}>
            Refresh FA / FB / SM
          </button>
        </div>
      </div>
    </div>
  );
}

function NotConnected() {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: 60 }}>
      <div className="card" style={{ padding: 36, maxWidth: 420, textAlign: "center" }}>
        <div className="led led-err" style={{ width: 14, height: 14, margin: "0 auto 14px" }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No radio connected</div>
        <div style={{ fontSize: 13, color: "var(--ink-faint)", marginBottom: 18 }}>
          Connect a radio first, or enable Dry run on the Connect tab to explore the UI without hardware.
        </div>
      </div>
    </div>
  );
}

window.ControlPanel = ControlPanel;
