// Memory channel grid — the heavy panel.

const { useState, useMemo, useEffect } = React;

function MemoryPanel({ ctx }) {
  const { status, writesEnabled } = ctx;
  const [rows, setRows] = useState(() => buildMemoryRows());
  const [section, setSection] = useState("memory");
  const [groupBy, setGroupBy] = useState("band");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  if (status !== "connected" && !ctx.dryRun) return <NotConnected />;

  const sectioned = useMemo(() => rows.filter((r) => {
    if (section === "memory") return r.id.kind === "memory";
    if (section === "pms") return r.id.kind === "pms";
    return r.id.kind === "emergency";
  }), [rows, section]);

  const filtered = useMemo(() => {
    let r = sectioned;
    if (hideEmpty) r = r.filter((x) => x.frame !== null || x.dirty);
    const q = filter.trim().toLowerCase();
    if (q) r = r.filter((x) =>
      x.label.toLowerCase().includes(q) ||
      x.tag.toLowerCase().includes(q) ||
      (x.frame && formatMHz(x.frame.freqHz).includes(q)) ||
      (x.frame && x.frame.mode.toLowerCase().includes(q))
    );
    return r;
  }, [sectioned, filter, hideEmpty]);

  const grouped = useMemo(() => {
    if (section !== "memory" || groupBy === "none") return null;
    const map = new Map();
    for (const r of filtered) {
      const k = r.frame ? bandGroupForFreq(r.frame.freqHz) : "GEN";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return BAND_GROUP_ORDER.filter((b) => map.has(b)).map((b) => ({ label: b, rows: map.get(b) }));
  }, [filtered, section, groupBy]);

  const counts = useMemo(() => ({
    used: sectioned.filter((r) => r.frame).length,
    total: sectioned.length,
    dirty: sectioned.filter((r) => r.dirty).length,
  }), [sectioned]);

  const updateRow = (key, patch) => setRows((rs) => rs.map((r) => r.key === key ? { ...r, ...patch, dirty: true } : r));

  const onReadAll = () => {
    setReading(true);
    setProgress({ done: 0, total: 99 });
    let i = 0;
    const t = setInterval(() => {
      i += 3;
      setProgress({ done: Math.min(i, 99), total: 99 });
      if (i >= 99) {
        clearInterval(t);
        setReading(false);
      }
    }, 80);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
      {/* Toolbar */}
      <div className="card" style={{ padding: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button className="btn btn-primary" onClick={onReadAll} disabled={reading}>
          {reading ? "Reading…" : "↓ Read all"}
        </button>
        <button className="btn" disabled={!writesEnabled || counts.dirty === 0}>
          ↑ Write {counts.dirty} unsaved
        </button>
        <div style={{ width: 1, height: 22, background: "var(--line)" }} />
        <button className="btn">Export CSV</button>
        <label className="btn" style={{ cursor: "pointer" }}>
          Import…
          <input type="file" hidden />
        </label>
        <div style={{ width: 1, height: 22, background: "var(--line)" }} />
        {[
          { id: "memory", label: "Memory 001-099" },
          { id: "pms", label: "PMS pairs (50)" },
          { id: "emergency", label: "Emergency" },
        ].map((s) => (
          <button
            key={s.id}
            className="btn"
            onClick={() => setSection(s.id)}
            style={section === s.id ? { background: "var(--accent)", color: "var(--bg-deep)", borderColor: "var(--accent)" } : {}}
          >
            {s.label}
          </button>
        ))}
        {section === "memory" && (
          <>
            <div style={{ width: 1, height: 22, background: "var(--line)" }} />
            <span style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.1em", textTransform: "uppercase" }}>group</span>
            {[
              { id: "band", label: "Band" },
              { id: "tag", label: "City" },
              { id: "none", label: "Flat" },
            ].map((g) => (
              <button
                key={g.id}
                className="btn"
                onClick={() => setGroupBy(g.id)}
                style={{
                  fontSize: 11,
                  padding: "5px 10px",
                  background: groupBy === g.id ? "var(--accent-soft)" : "var(--bg-elev)",
                  color: groupBy === g.id ? "var(--accent)" : "var(--ink)",
                }}
              >
                {g.label}
              </button>
            ))}
          </>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <Toggle checked={hideEmpty} onChange={setHideEmpty} label="Hide empty" />
          <input
            className="ctrl"
            placeholder="filter ch / tag / freq / mode"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 220 }}
          />
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 11, color: "var(--ink-mute)", padding: "0 4px" }}>
        <span>
          <span style={{ color: "var(--ink-faint)" }}>{section} · </span>
          <strong style={{ color: "var(--ink)" }}>{counts.used}</strong>
          <span style={{ color: "var(--ink-faint)" }}>/{counts.total} used</span>
        </span>
        {counts.dirty > 0 && (
          <span style={{ color: "var(--warn)" }}>● {counts.dirty} unsaved</span>
        )}
        {reading && (
          <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 280 }}>
            <span>reading {progress.done}/{progress.total}</span>
            <ProgressBar value={progress.done} max={progress.total} />
          </span>
        )}
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)" }}>
          double-click row to edit · ↑↓ navigate
        </span>
      </div>

      {/* Table */}
      <div className="card scroll-thin" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Ch</th>
              <th style={{ width: 160 }}>Tag</th>
              <th style={{ textAlign: "right", width: 180 }}>Frequency · MHz</th>
              <th style={{ width: 120 }}>Mode</th>
              <th style={{ textAlign: "center", width: 60 }}>Shift</th>
              <th style={{ width: 100 }}>Tone</th>
              <th style={{ textAlign: "right", width: 90 }}>Clar</th>
              <th style={{ width: 110 }}>State</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 60, textAlign: "center", color: "var(--ink-faint)" }}>
                No rows. Uncheck "Hide empty" to show unprogrammed channels.
              </td></tr>
            )}
            {grouped ? grouped.flatMap((g) => [
              <tr key={`hdr-${g.label}`} className="group-header">
                <td colSpan={9}>{g.label} · {g.rows.length} channel{g.rows.length === 1 ? "" : "s"}</td>
              </tr>,
              ...g.rows.map((r) => <Row key={r.key} row={r} updateRow={updateRow} setEditing={setEditing} setSelected={setSelected} selected={selected === r.key} />),
            ]) : filtered.map((r) => <Row key={r.key} row={r} updateRow={updateRow} setEditing={setEditing} setSelected={setSelected} selected={selected === r.key} />)}
          </tbody>
        </table>
      </div>

      {editing && <EditDialog row={rows.find((r) => r.key === editing)} onClose={() => setEditing(null)} updateRow={updateRow} />}
    </div>
  );
}

function Row({ row, updateRow, setEditing, setSelected, selected }) {
  const empty = !row.frame;
  return (
    <tr
      className="row"
      data-dirty={row.dirty}
      data-empty={empty}
      data-selected={selected}
      onClick={() => setSelected(row.key)}
      onDoubleClick={() => setEditing(row.key)}
    >
      <td>
        <span style={{ color: "var(--accent)" }}>{row.label}</span>
      </td>
      <td>
        <input
          className="row-input"
          value={row.tag}
          maxLength={12}
          placeholder={empty ? "—" : ""}
          onChange={(e) => updateRow(row.key, { tag: e.target.value, frame: row.frame ?? defaultFrame() })}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td style={{ textAlign: "right" }}>
        {row.frame ? (
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>{formatMHz(row.frame.freqHz)}</span>
        ) : <span style={{ color: "var(--ink-ghost)" }}>—.———</span>}
      </td>
      <td>{row.frame ? row.frame.mode : <span style={{ color: "var(--ink-ghost)" }}>—</span>}</td>
      <td style={{ textAlign: "center", color: row.frame?.shift === "plus" ? "var(--ok)" : row.frame?.shift === "minus" ? "var(--warn)" : "var(--ink-faint)", fontWeight: 700 }}>
        {row.frame ? shiftIcon(row.frame.shift) : "—"}
      </td>
      <td>
        {row.frame && toneBadge(row.frame.ctcssState) ? (
          <span className="chip chip-accent">{toneBadge(row.frame.ctcssState)}</span>
        ) : <span style={{ color: "var(--ink-ghost)" }}>—</span>}
      </td>
      <td style={{ textAlign: "right" }}>
        {row.frame && row.frame.clarifierHz !== 0 ? `${row.frame.clarifierHz > 0 ? "+" : ""}${row.frame.clarifierHz}` : ""}
      </td>
      <td>
        {row.error ? <span className="chip chip-err">err</span>
        : row.dirty ? <span className="chip chip-warn">● modified</span>
        : empty ? <span style={{ color: "var(--ink-ghost)", fontSize: 11 }}>empty</span>
        : <span className="chip chip-ok">✓ saved</span>}
      </td>
      <td style={{ textAlign: "right" }}>
        <button className="btn-ghost btn" onClick={(e) => { e.stopPropagation(); setEditing(row.key); }} style={{ fontSize: 10 }}>EDIT →</button>
      </td>
    </tr>
  );
}

const defaultFrame = () => ({
  freqHz: 14250000, mode: "USB", shift: "simplex", ctcssState: "OFF",
  clarifierHz: 0, rxClarOn: false, txClarOn: false,
});

function EditDialog({ row, onClose, updateRow }) {
  if (!row) return null;
  const f = row.frame ?? defaultFrame();
  const update = (patch) => updateRow(row.key, { frame: { ...f, ...patch } });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card" style={{ width: 680, maxHeight: "90vh", overflow: "auto", padding: 0 }} onClick={(e) => e.stopPropagation()}>
        <SectionTitle
          hint={`Channel ${row.label}`}
          right={<button className="btn-ghost btn" onClick={onClose}>esc ×</button>}
        >
          {row.tag || "(unnamed)"}
        </SectionTitle>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Tag (≤12)">
            <input className="ctrl" value={row.tag} maxLength={12} onChange={(e) => updateRow(row.key, { tag: e.target.value, frame: f })} style={{ width: "100%" }} />
          </Field>
          <Field label="Mode">
            <select className="ctrl" value={f.mode} onChange={(e) => update({ mode: e.target.value })} style={{ width: "100%" }}>
              {MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Frequency (MHz)" wide>
            <input className="ctrl" defaultValue={formatMHz(f.freqHz)} style={{ width: "100%" }} />
            <span style={{ fontSize: 10, color: "var(--ink-faint)", marginTop: 4 }}>accepts 439.200 · 14.250 · 14250 (kHz) · 14250000 (Hz)</span>
          </Field>

          <SubHead>Repeater shift</SubHead>
          <Field label="Direction">
            <select className="ctrl" value={f.shift} onChange={(e) => update({ shift: e.target.value })} style={{ width: "100%" }}>
              <option value="simplex">Simplex</option>
              <option value="plus">+ Plus</option>
              <option value="minus">− Minus</option>
            </select>
          </Field>
          <Field label="Per-band offset (kHz)">
            <input className="ctrl" defaultValue={f.freqHz >= 144e6 && f.freqHz < 148e6 ? "600" : "5000"} style={{ width: "100%" }} />
          </Field>

          <SubHead>Tone / DCS</SubHead>
          <Field label="State">
            <select className="ctrl" value={f.ctcssState} onChange={(e) => update({ ctcssState: e.target.value })} style={{ width: "100%" }}>
              {["OFF","CTCSS ENC","CTCSS ENC/DEC","DCS","PR FREQ","REV TONE"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          {(f.ctcssState === "CTCSS ENC" || f.ctcssState === "CTCSS ENC/DEC") && (
            <Field label="CTCSS tone (Hz)">
              <select className="ctrl" defaultValue="100.0" style={{ width: "100%" }}>
                {CTCSS_HZ.map((hz, i) => <option key={i} value={hz}>{i.toString().padStart(2,"0")} · {hz.toFixed(1)} Hz</option>)}
              </select>
            </Field>
          )}

          <SubHead>Clarifier</SubHead>
          <Field label="Offset (Hz, ±9990)">
            <input type="number" className="ctrl" value={f.clarifierHz} min={-9990} max={9995} onChange={(e) => update({ clarifierHz: Number(e.target.value) })} style={{ width: "100%" }} />
          </Field>
          <Field label="">
            <div style={{ display: "flex", gap: 16, paddingTop: 8 }}>
              <Toggle checked={f.rxClarOn} onChange={(v) => update({ rxClarOn: v })} label="RX clar" />
              <Toggle checked={f.txClarOn} onChange={(v) => update({ txClarOn: v })} label="TX clar" />
            </div>
          </Field>
        </div>
        <div style={{ borderTop: "1px solid var(--line)", padding: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, wide }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: wide ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-faint)" }}>{label}</span>
      {children}
    </label>
  );
}

function SubHead({ children }) {
  return (
    <div style={{ gridColumn: "1 / -1", paddingBottom: 4, marginTop: 8, borderBottom: "1px solid var(--line)", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--accent)" }}>
      {children}
    </div>
  );
}

function NotConnected() {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: 60 }}>
      <div className="card" style={{ padding: 36, maxWidth: 420, textAlign: "center" }}>
        <div className="led led-err" style={{ width: 14, height: 14, margin: "0 auto 14px" }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No radio connected</div>
        <div style={{ fontSize: 13, color: "var(--ink-faint)" }}>Connect first, or enable Dry run.</div>
      </div>
    </div>
  );
}

window.MemoryPanel = MemoryPanel;
