// Top-level App — header chrome + tab routing + theme switcher + Tweaks.

const { useState, useEffect } = React;

const TABS = [
  { id: "connect", label: "Connect" },
  { id: "memory", label: "Memory" },
  { id: "settings", label: "Settings" },
  { id: "debug", label: "Debug" },
];

const THEMES = [
  { id: "graphite", label: "Graphite Night", swatches: ["#0a0c10", "#5fb3ff", "#e7ebf3"] },
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "graphite",
  "showSpectrum": true,
  "compactRows": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useState("connect");
  const [status, setStatus] = useState("idle");
  const [dryRun, setDryRun] = useState(true);
  const [writesEnabled, setWritesEnabled] = useState(false);

  // Apply theme
  useEffect(() => {
    document.body.dataset.theme = t.theme;
  }, [t.theme]);

  const radioId = status === "connected" ? "0840" : null;
  const firmware = status === "connected" ? "V01.45" : null;

  const ctx = {
    status, setStatus,
    dryRun, setDryRun,
    writesEnabled, setWritesEnabled,
    radioId, firmware,
    error: null,
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-deep)" }}>
      {/* Top bar */}
      <header style={{
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--line)",
        padding: "12px 20px 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 12 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Wordmark />
          </div>

          <div style={{ flex: 1 }} />

          {/* Status cluster */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <StatusPill status={dryRun && status !== "connected" ? "dry-run" : status} />
            <Toggle checked={dryRun} onChange={setDryRun} label="Dry run" />
            <div style={{
              padding: writesEnabled ? "5px 10px" : 0,
              background: writesEnabled ? "var(--tx-soft)" : "transparent",
              border: writesEnabled ? "1px solid var(--tx)" : "1px solid transparent",
              borderRadius: 6,
              transition: "all 200ms",
            }}>
              <Toggle checked={writesEnabled} onChange={setWritesEnabled} label={writesEnabled ? "WRITES ARMED" : "Writes enabled"} danger />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {TABS.map((tt) => (
            <button
              key={tt.id}
              className="tab"
              data-active={tab === tt.id}
              onClick={() => setTab(tt.id)}
            >
              {tt.label}
            </button>
          ))}
        </nav>
      </header>

      {/* TX armed warning */}
      {writesEnabled && (
        <div className="tx-arm-bar" style={{ padding: "6px 20px", display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em" }}>
          <span className="led led-tx" />
          <span>WRITES ARMED · Set commands will reach the radio. Disarm before walking away.</span>
        </div>
      )}

      {/* Main */}
      <main className="scroll-thin" style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {tab === "connect" && <ConnectPanel ctx={ctx} />}
        {tab === "memory" && <MemoryPanel ctx={ctx} />}
        {tab === "settings" && <SettingsPanel ctx={ctx} />}
        {tab === "debug" && <DebugPanel ctx={ctx} />}
      </main>

      {/* Footer */}
      <footer style={{
        flexShrink: 0,
        background: "var(--bg-panel)",
        borderTop: "1px solid var(--line)",
        padding: "8px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--ink-faint)",
        fontFamily: "var(--font-mono)",
      }}>
        <span>Made by</span>
        <a
          href="https://www.qrz.com/db/TA1SMO"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "2px 8px",
            border: "1px solid var(--line-strong)",
            borderRadius: 3,
            color: "var(--accent)",
            background: "var(--bg-deep)",
            letterSpacing: "0.18em",
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          title="Lookup TA1SMO on QRZ.com"
        >
          TA1SMO
          <span style={{ fontSize: 9, opacity: 0.7 }}>↗</span>
        </a>
        <span style={{ flex: 1 }} />
        <span style={{ textTransform: "none", letterSpacing: "0.02em" }}>
          <span style={{ color: "var(--ink-mute)" }}>Yaesu® and FTX-1™ are trademarks of Yaesu Musen Co. Ltd.</span>
          <span style={{ marginLeft: 8 }}>· Independent third-party tool · not produced or endorsed by Yaesu.</span>
        </span>
      </footer>

      {/* Tweaks panel — secondary controls */}
      <TweaksPanel>
        <TweakSection label="Display" />
        <TweakToggle label="Spectrum strip" value={t.showSpectrum} onChange={(v) => setTweak("showSpectrum", v)} />
        <TweakToggle label="Compact rows" value={t.compactRows} onChange={(v) => setTweak("compactRows", v)} />
        <TweakSection label="Demo state" />
        <TweakSelect label="Connection" value={status} options={[
          { value: "idle", label: "Idle / offline" },
          { value: "connecting", label: "Connecting…" },
          { value: "connected", label: "Connected" },
          { value: "error", label: "Error" },
        ]} onChange={setStatus} />
        <TweakToggle label="Dry run" value={dryRun} onChange={setDryRun} />
        <TweakToggle label="Writes armed" value={writesEnabled} onChange={setWritesEnabled} />
      </TweaksPanel>
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, lineHeight: 1 }}>
        <div style={{
          fontFamily: '"Barlow Condensed", "Roboto Condensed", system-ui, sans-serif',
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "0.02em",
          color: "#fff",
          display: "flex",
          alignItems: "baseline",
          gap: 6,
        }}>
          <span>FTX-1</span>
          <span style={{ color: "var(--ftx-orange)" }}>·</span>
          <span style={{ color: "var(--ftx-orange)" }}>PROGRAMMER</span>
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ink-faint)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}>
          CAT over Web Serial · Unofficial
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
