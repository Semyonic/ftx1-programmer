// Debug panel — raw CAT command console.

const { useState } = React;

function DebugPanel({ ctx }) {
  const [cmd, setCmd] = useState("ID");
  const [log, setLog] = useState(SAMPLE_LOG);

  const send = (withReply) => {
    const trimmed = cmd.replace(/;$/, "").trim();
    const ts = Date.now();
    const tx = { ts, dir: "tx", data: trimmed + ";" };
    setLog((l) => [...l, tx]);
    if (withReply) {
      // fake reply
      setTimeout(() => {
        const reply = trimmed === "ID" ? "ID0840;"
          : trimmed === "VE0" ? "VE0V01.45;"
          : trimmed.startsWith("FA") && trimmed.length === 2 ? "FA014250000;"
          : trimmed.startsWith("FB") && trimmed.length === 2 ? "FB007100000;"
          : trimmed.startsWith("SM") ? "SM0008;"
          : `${trimmed};`;
        setLog((l) => [...l, { ts: Date.now(), dir: "rx", data: reply }]);
      }, 120);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
      <div className="card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span className="chip">CAT-1</span>
        <input
          className="ctrl"
          value={cmd}
          spellCheck={false}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="raw CAT body, e.g. FA014250000"
          style={{ flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && send(true)}
        />
        <button className="btn btn-primary" onClick={() => send(true)}>Query · await ;</button>
        <button className="btn" onClick={() => send(false)}>Send · no reply</button>
        <button className="btn btn-ghost" onClick={() => setLog([])}>Clear</button>
      </div>

      <div className="card scroll-thin" style={{ flex: 1, overflow: "auto", padding: 0, background: "var(--bg-display)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "var(--bg-rail)", zIndex: 1 }}>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--ink-faint)", textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>Time</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--ink-faint)", textTransform: "uppercase", borderBottom: "1px solid var(--line)", width: 70 }}>Dir</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--ink-faint)", textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>Frame</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 && (
              <tr><td colSpan={3} style={{ padding: 60, textAlign: "center", color: "var(--ink-faint)" }}>no traffic yet</td></tr>
            )}
            {log.map((e, i) => {
              const color = e.dir === "tx" ? "var(--ok)" : e.dir === "rx" ? "var(--accent)" : e.dir === "error" ? "var(--err)" : "var(--ink-faint)";
              return (
                <tr key={i} style={{ borderBottom: "1px solid color-mix(in oklab, var(--line) 60%, transparent)" }}>
                  <td style={{ padding: "5px 12px", color: "var(--ink-faint)", whiteSpace: "nowrap" }}>
                    {new Date(e.ts).toISOString().slice(11, 23)}
                  </td>
                  <td style={{ padding: "5px 12px" }}>
                    <span className="chip" style={{ color, borderColor: "transparent", background: `color-mix(in oklab, ${color} 12%, transparent)` }}>
                      {e.dir.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "5px 12px", color: "var(--ink)" }}>
                    {e.data}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--ink-faint)", padding: "0 4px" }}>
        <span><span className="led led-on" /> tx · sent to radio</span>
        <span><span className="led" style={{ background: "var(--accent)", boxShadow: "0 0 8px var(--accent)" }} /> rx · radio reply</span>
        <span style={{ marginLeft: "auto" }}>{log.length} frame{log.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

window.DebugPanel = DebugPanel;
