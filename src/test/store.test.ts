import { describe, expect, it } from "vitest";
import { createStore } from "../store/createStore";
import { connectionStore } from "../store/connection";
import { memoryStore } from "../store/memory";
import { settingsStore, leafKey } from "../store/settings";
import { CatTimeoutError } from "../cat/protocol";

// ---------------------------------------------------------------------------
// 1. createStore factory
// ---------------------------------------------------------------------------

describe("createStore", () => {
  it("initializes state from initializer function", () => {
    const store = createStore((_set, _get) => ({ count: 0 }));
    expect((store.getState() as { count: number }).count).toBe(0);
  });

  it("setState merges partial state", () => {
    const store = createStore(() => ({ a: 1, b: 2 }));
    store.setState({ a: 10 });
    expect(store.getState()).toEqual({ a: 10, b: 2 });
  });

  it("setState accepts updater function", () => {
    const store = createStore(() => ({ count: 5 }));
    store.setState((s) => ({ count: s.count + 1 }));
    expect(store.getState().count).toBe(6);
  });

  it("subscribe fires on setState", () => {
    const store = createStore(() => ({ x: 0 }));
    let called = 0;
    store.subscribe(() => called++);
    store.setState({ x: 1 });
    expect(called).toBe(1);
  });

  it("unsubscribe stops notifications", () => {
    const store = createStore(() => ({ x: 0 }));
    let called = 0;
    const unsub = store.subscribe(() => called++);
    store.setState({ x: 1 });
    unsub();
    store.setState({ x: 2 });
    expect(called).toBe(1);
  });

  it("get() inside initializer returns current state", () => {
    const store = createStore<{ count: number; increment: () => void }>((set, get) => ({
      count: 0,
      increment: () => set({ count: get().count + 1 }),
    }));
    store.getState().increment();
    expect(store.getState().count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. connectionStore
// ---------------------------------------------------------------------------

describe("connectionStore", () => {
  it("initial state has transport null, status disconnected, writesEnabled false, dryRun true, log empty", () => {
    const s = connectionStore.getState();
    expect(s.transport).toBeNull();
    expect(s.status).toBe("disconnected");
    expect(s.writesEnabled).toBe(false);
    expect(s.dryRun).toBe(true);
    expect(s.log).toEqual([]);
  });

  it("enableWrites(true) sets writesEnabled to true", () => {
    connectionStore.getState().enableWrites(true);
    expect(connectionStore.getState().writesEnabled).toBe(true);
    // reset
    connectionStore.getState().enableWrites(false);
  });

  it("setDryRun(true) sets dryRun to true", () => {
    connectionStore.getState().setDryRun(true);
    expect(connectionStore.getState().dryRun).toBe(true);
    // reset
    connectionStore.getState().setDryRun(false);
  });

  it("appendLog adds an entry", () => {
    // clear log
    connectionStore.setState({ log: [] });
    const entry = { ts: Date.now(), direction: "tx" as const, data: "FA;" };
    connectionStore.getState().appendLog(entry);
    expect(connectionStore.getState().log).toHaveLength(1);
    expect(connectionStore.getState().log[0]).toEqual(entry);
    // reset
    connectionStore.setState({ log: [] });
  });

  it("appendLog caps at MAX_LOG (500)", () => {
    connectionStore.setState({ log: [] });
    const MAX_LOG = 500;
    // add 510 entries
    for (let i = 0; i < 510; i++) {
      connectionStore.getState().appendLog({ ts: i, direction: "tx", data: `msg${i}` });
    }
    const log = connectionStore.getState().log;
    expect(log.length).toBe(MAX_LOG);
    // the oldest entries should have been spliced off; first entry should be msg10
    expect(log[0].data).toBe("msg10");
    expect(log[MAX_LOG - 1].data).toBe("msg509");
    // reset
    connectionStore.setState({ log: [] });
  });

  it("disconnect clears transport, sets status disconnected, clears writesEnabled", async () => {
    // Prep: enable writes and set dryRun so disconnect is testable without real serial
    connectionStore.setState({ writesEnabled: true, status: "connected" });
    await connectionStore.getState().disconnect();
    const s = connectionStore.getState();
    expect(s.transport).toBeNull();
    expect(s.status).toBe("disconnected");
    expect(s.writesEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. memoryStore
// ---------------------------------------------------------------------------

describe("memoryStore", () => {
  it("init() creates 200 rows (99 memory + 100 PMS + 1 emergency)", () => {
    memoryStore.getState().init();
    const rows = memoryStore.getState().rows;
    expect(rows).toHaveLength(200);
    // check breakdown
    const memCount = rows.filter((r) => r.id.kind === "memory").length;
    const pmsCount = rows.filter((r) => r.id.kind === "pms").length;
    const emgCount = rows.filter((r) => r.id.kind === "emergency").length;
    expect(memCount).toBe(99);
    expect(pmsCount).toBe(100);
    expect(emgCount).toBe(1);
  });

  it("setRow updates specific row by key", () => {
    memoryStore.getState().init();
    const key = memoryStore.getState().rows[0].key; // m001
    memoryStore.getState().setRow(key, { tag: "HELLO", dirty: true });
    const updated = memoryStore.getState().rows.find((r) => r.key === key)!;
    expect(updated.tag).toBe("HELLO");
    expect(updated.dirty).toBe(true);
  });

  it("setRow preserves other rows", () => {
    memoryStore.getState().init();
    const rows = memoryStore.getState().rows;
    const firstKey = rows[0].key;
    const secondKey = rows[1].key;
    memoryStore.getState().setRow(firstKey, { tag: "CHANGED" });
    const second = memoryStore.getState().rows.find((r) => r.key === secondKey)!;
    // second row should still have its initial values
    expect(second.tag).toBe("");
    expect(second.dirty).toBe(false);
    expect(second.frame).toBeNull();
  });

  it("clearDirty sets all dirty=false", () => {
    memoryStore.getState().init();
    // mark a few rows dirty
    const rows = memoryStore.getState().rows;
    memoryStore.getState().setRow(rows[0].key, { dirty: true });
    memoryStore.getState().setRow(rows[5].key, { dirty: true });
    memoryStore.getState().setRow(rows[10].key, { dirty: true });
    // sanity check
    expect(memoryStore.getState().rows.filter((r) => r.dirty).length).toBe(3);
    memoryStore.getState().clearDirty();
    expect(memoryStore.getState().rows.every((r) => !r.dirty)).toBe(true);
  });

  it("readAll returns early if reading is true (concurrent guard)", async () => {
    memoryStore.getState().init();
    memoryStore.setState({ reading: true });
    // readAll should return immediately without changing progress
    const prevProgress = { ...memoryStore.getState().progress };
    await memoryStore.getState().readAll({} as any);
    expect(memoryStore.getState().progress).toEqual(prevProgress);
    // reset
    memoryStore.setState({ reading: false });
  });

  it("writeDirty returns early if writing is true (concurrent guard)", async () => {
    memoryStore.getState().init();
    memoryStore.setState({ writing: true });
    const result = await memoryStore.getState().writeDirty({} as any);
    expect(result).toEqual({ ok: 0, failed: 0 });
    // reset
    memoryStore.setState({ writing: false });
  });

  it("readAll stops the sweep on the first timeout (BFT C7)", async () => {
    memoryStore.getState().init();
    // Fake transport: open, but every read times out (radio gone silent).
    const t = {
      isOpen: true,
      query: async () => {
        throw new CatTimeoutError("MR", 1000);
      },
    } as any;
    await memoryStore.getState().readAll(t);
    const rows = memoryStore.getState().rows;
    // Exactly one row marked timeout; the sweep did not grind through all 200.
    expect(rows.filter((r) => r.error === "timeout").length).toBe(1);
    expect(memoryStore.getState().reading).toBe(false);
    expect(memoryStore.getState().progress.done).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. settingsStore
// ---------------------------------------------------------------------------

describe("settingsStore", () => {
  it("init() populates values from ALL_LEAVES", () => {
    settingsStore.getState().init();
    const values = settingsStore.getState().values;
    const keys = Object.keys(values);
    // Should match the total number of ALL_LEAVES (427)
    expect(keys.length).toBe(427);
    // Each value should have raw=null and dirty=false initially
    for (const v of Object.values(values)) {
      expect(v.raw).toBeNull();
      expect(v.dirty).toBe(false);
      expect(v.error).toBeNull();
    }
  });

  it("setRaw when cur.raw is null marks dirty=true (import fix)", () => {
    settingsStore.getState().init();
    const values = settingsStore.getState().values;
    const firstKey = Object.keys(values)[0];
    const entry = values[firstKey];
    // raw starts as null
    expect(entry.raw).toBeNull();
    settingsStore.getState().setRaw(entry.p1, entry.p2, entry.p3, "42");
    const updated = settingsStore.getState().values[firstKey];
    expect(updated.raw).toBe("42");
    expect(updated.dirty).toBe(true);
  });

  it("setRaw when cur.raw equals new value sets dirty=false", () => {
    settingsStore.getState().init();
    const values = settingsStore.getState().values;
    const firstKey = Object.keys(values)[0];
    const entry = values[firstKey];
    // Set raw to a value first (from null -> "10", dirty becomes true)
    settingsStore.getState().setRaw(entry.p1, entry.p2, entry.p3, "10");
    // Now set the same value again: cur.raw="10", new raw="10" -> dirty=false
    settingsStore.getState().setRaw(entry.p1, entry.p2, entry.p3, "10");
    const updated = settingsStore.getState().values[firstKey];
    expect(updated.raw).toBe("10");
    expect(updated.dirty).toBe(false);
  });

  it("setRaw when cur.raw differs from new value sets dirty=true", () => {
    settingsStore.getState().init();
    const values = settingsStore.getState().values;
    const firstKey = Object.keys(values)[0];
    const entry = values[firstKey];
    // Set initial raw value
    settingsStore.getState().setRaw(entry.p1, entry.p2, entry.p3, "10");
    // Set same value to clear dirty
    settingsStore.getState().setRaw(entry.p1, entry.p2, entry.p3, "10");
    expect(settingsStore.getState().values[firstKey].dirty).toBe(false);
    // Now change to a different value
    settingsStore.getState().setRaw(entry.p1, entry.p2, entry.p3, "20");
    const updated = settingsStore.getState().values[firstKey];
    expect(updated.raw).toBe("20");
    expect(updated.dirty).toBe(true);
  });

  it("leafKey formats correctly: leafKey(1, 2, 3) -> '01-02-03'", () => {
    expect(leafKey(1, 2, 3)).toBe("01-02-03");
    expect(leafKey(10, 20, 30)).toBe("10-20-30");
    expect(leafKey(0, 0, 0)).toBe("00-00-00");
  });
});
