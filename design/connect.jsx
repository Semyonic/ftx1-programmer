// Connect panel — radio link setup, dry run, writes-enable safety.

const { useState } = React;

function ConnectPanel({ ctx }) {
  const { status, dryRun, writesEnabled, radioId, firmware, error, setStatus, setDryRun } = ctx;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 8px", display: "grid", gap: 18 }}>
      <div className="card">
        <SectionTitle hint="Yaesu FTX-1 series · CAT over Web Serial">
          Radio link
        </SectionTitle>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>
              <span style={{ color: "var(--ink-faint)" }}>STATUS</span>
              <span><StatusPill status={dryRun && status !== "connected" ? "dry-run" : status} error={error} /></span>
              <span style={{ color: "var(--ink-faint)" }}>RADIO ID</span>
              <span>
                {radioId ?? "—"}
                {radioId === "0840" && (
                  <span className="chip chip-ok" style={{ marginLeft: 8 }}>FTX-1 verified</span>
                )}
              </span>
              <span style={{ color: "var(--ink-faint)" }}>FIRMWARE</span>
              <span>{firmware ?? "—"} <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>(MAIN)</span></span>
              <span style={{ color: "var(--ink-faint)" }}>BAUD</span>
              <span>38400 bps · 8N1</span>
              <span style={{ color: "var(--ink-faint)" }}>AI MODE</span>
              <span>OFF <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>(polled)</span></span>
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={status === "connecting" || status === "connected"}
                onClick={() => {
                  setStatus("connecting");
                  setTimeout(() => setStatus("connected"), 900);
                }}
              >
                <span className="led led-on" /> Connect
              </button>
              <button
                className="btn"
                disabled={status !== "connected"}
                onClick={() => setStatus("idle")}
              >
                Disconnect
              </button>
            </div>
          </div>
          <div style={{ background: "var(--bg-rail)", borderRadius: 8, padding: 16, border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", color: "var(--ink-faint)", textTransform: "uppercase", marginBottom: 10 }}>
              Safety
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Dry run</div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>Port closed; frames logged only</div>
                </div>
                <Toggle checked={dryRun} onChange={setDryRun} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: writesEnabled ? "var(--tx)" : undefined }}>
                    Writes enabled {writesEnabled && "· ARMED"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>Allow Set commands to reach the radio</div>
                </div>
                <Toggle checked={writesEnabled} onChange={ctx.setWritesEnabled} danger />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <SectionTitle hint="One-time per machine">First-run setup</SectionTitle>
        <ol style={{ padding: "16px 18px 16px 38px", margin: 0, display: "grid", gap: 8, fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.55 }}>
          <li>Install the Silicon Labs <span className="mono" style={{ color: "var(--ink)" }}>CP210x</span> driver from Yaesu (manual p.1).</li>
          <li>Connect a USB-C cable from the FTX-1 USB port to the PC.</li>
          <li>Power on the radio. Default CAT-1 baud is <span className="mono" style={{ color: "var(--ink)" }}>38400 bps</span> (manual p.4).</li>
          <li>Click <em style={{ color: "var(--ink)" }}>Connect</em>, then choose the device labeled <span className="mono" style={{ color: "var(--ink)" }}>Silicon Labs … Enhanced COM Port</span>.</li>
          <li>The app handshakes by reading <span className="mono" style={{ color: "var(--accent)" }}>ID;</span> and <span className="mono" style={{ color: "var(--accent)" }}>VE0;</span>. Auto-Information is left OFF.</li>
        </ol>
      </div>

      <div className="card" style={{ borderColor: "color-mix(in oklab, var(--warn) 30%, var(--line))" }}>
        <SectionTitle>Browser support</SectionTitle>
        <div style={{ padding: "12px 18px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, fontSize: 12 }}>
          {["Chrome 89+", "Edge 89+", "Opera 76+", "Safari ✗"].map((b) => {
            const ok = !b.includes("✗");
            return (
              <div key={b} style={{
                padding: "10px 12px",
                background: "var(--bg-rail)",
                borderRadius: 6,
                border: `1px solid var(--line)`,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span className={ok ? "led led-on" : "led led-err"} />
                <span style={{ color: ok ? "var(--ink)" : "var(--ink-faint)" }}>{b}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.ConnectPanel = ConnectPanel;
