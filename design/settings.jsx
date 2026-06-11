// Settings (EX menu) panel — categorized leaf editor.

const { useState } = React;

function SettingsPanel({ ctx }) {
  const { status, writesEnabled } = ctx;
  const [openP1, setOpenP1] = useState(1);
  const [openP2, setOpenP2] = useState(1);
  const [values, setValues] = useState(() => {
    // flatten initial values
    const o = {};
    for (const g of MENU_GROUPS) for (const sg of g.subgroups) for (const l of sg.leaves) {
      o[`${g.p1}-${sg.p2}-${l.p3}`] = { ...l, dirty: false };
    }
    return o;
  });
  const [filter, setFilter] = useState("");

  if (status !== "connected" && !ctx.dryRun) return <NotConnected />;

  const dirtyCount = Object.values(values).filter((v) => v.dirty).length;
  const totalCount = Object.keys(values).length;
  const group = MENU_GROUPS.find((g) => g.p1 === openP1);
  const sub = group?.subgroups.find((s) => s.p2 === openP2);

  const updateLeaf = (key, value) => {
    setValues((v) => ({ ...v, [key]: { ...v[key], value, dirty: true } }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
      <div className="card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <button className="btn btn-primary">↓ Read all settings</button>
        <button className="btn" disabled={!writesEnabled || dirtyCount === 0}>↑ Write {dirtyCount} unsaved</button>
        <div style={{ width: 1, height: 22, background: "var(--line)" }} />
        <button className="btn">Export JSON</button>
        <label className="btn"><input type="file" hidden /> Import JSON</label>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
            <strong style={{ color: "var(--ink)" }}>{totalCount}</strong> settings · {dirtyCount > 0 && <span style={{ color: "var(--warn)" }}>{dirtyCount} unsaved</span>}
          </span>
          <input className="ctrl" placeholder="search settings…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 220 }} />
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, gap: 10, minHeight: 0 }}>
        {/* Sidebar */}
        <aside className="card scroll-thin" style={{ width: 280, overflow: "auto", padding: 6 }}>
          {MENU_GROUPS.map((g) => (
            <div key={g.p1}>
              <button
                onClick={() => setOpenP1(openP1 === g.p1 ? null : g.p1)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: "10px 12px",
                  borderRadius: 6,
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                  {String(g.p1).padStart(2,"0")}
                </span>
                {g.name}
                <span style={{ marginLeft: "auto", color: "var(--ink-faint)", fontSize: 11 }}>{openP1 === g.p1 ? "−" : "+"}</span>
              </button>
              {openP1 === g.p1 && g.subgroups.map((s) => (
                <button
                  key={s.p2}
                  onClick={() => { setOpenP1(g.p1); setOpenP2(s.p2); }}
                  style={{
                    width: "calc(100% - 16px)",
                    margin: "0 8px 2px",
                    textAlign: "left",
                    background: openP2 === s.p2 && openP1 === g.p1 ? "var(--accent-soft)" : "transparent",
                    border: "none",
                    borderLeft: openP2 === s.p2 && openP1 === g.p1 ? "2px solid var(--accent)" : "2px solid transparent",
                    padding: "7px 10px",
                    borderRadius: 4,
                    color: openP2 === s.p2 && openP1 === g.p1 ? "var(--accent)" : "var(--ink-mute)",
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.6 }}>
                    {String(s.p2).padStart(2,"0")}
                  </span>
                  {s.name}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Content */}
        <section className="card scroll-thin" style={{ flex: 1, overflow: "auto", padding: 18 }}>
          {sub && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-faint)" }}>
                  {String(group.p1).padStart(2,"0")}-{String(sub.p2).padStart(2,"0")} · {group.name}
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{sub.name}</div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {sub.leaves.filter((l) => !filter || l.name.toLowerCase().includes(filter.toLowerCase())).map((l) => {
                  const k = `${group.p1}-${sub.p2}-${l.p3}`;
                  const v = values[k];
                  return <LeafCard key={k} group={group} sub={sub} leaf={v} onChange={(nv) => updateLeaf(k, nv)} />;
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function LeafCard({ group, sub, leaf, onChange }) {
  return (
    <div style={{
      background: "var(--bg-elev)",
      border: `1px solid ${leaf.dirty ? "color-mix(in oklab, var(--warn) 50%, var(--line))" : "var(--line)"}`,
      borderRadius: 8,
      padding: "12px 14px",
      display: "grid",
      gridTemplateColumns: "1fr 280px",
      gap: 16,
      alignItems: "center",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>
            {String(group.p1).padStart(2,"0")}-{String(sub.p2).padStart(2,"0")}-{String(leaf.p3).padStart(2,"0")}
          </span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{leaf.name}</span>
          {leaf.dirty && <span className="chip chip-warn">● modified</span>}
        </div>
        {leaf.desc && <div style={{ fontSize: 11, color: "var(--ink-mute)" }}>{leaf.desc}</div>}
      </div>
      <div>
        {leaf.type === "bool" && <Toggle checked={!!leaf.value} onChange={onChange} />}
        {leaf.type === "enum" && (
          <select className="ctrl" value={leaf.value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
            {leaf.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        )}
        {leaf.type === "int" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="range"
              min={leaf.min}
              max={leaf.max}
              value={leaf.value}
              onChange={(e) => onChange(Number(e.target.value))}
              style={{ flex: 1, accentColor: "var(--accent)" }}
            />
            <input
              type="number"
              className="ctrl"
              min={leaf.min}
              max={leaf.max}
              value={leaf.value}
              onChange={(e) => onChange(Number(e.target.value))}
              style={{ width: 70, textAlign: "right" }}
            />
            {leaf.unit && <span style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.1em" }}>{leaf.unit}</span>}
          </div>
        )}
        {leaf.type === "text" && (
          <input className="ctrl" value={leaf.value} maxLength={leaf.maxLen} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }} />
        )}
      </div>
    </div>
  );
}

function NotConnected() {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: 60 }}>
      <div className="card" style={{ padding: 36, maxWidth: 420, textAlign: "center" }}>
        <div className="led led-err" style={{ width: 14, height: 14, margin: "0 auto 14px" }} />
        <div style={{ fontSize: 16, fontWeight: 600 }}>No radio connected</div>
      </div>
    </div>
  );
}

window.SettingsPanel = SettingsPanel;
