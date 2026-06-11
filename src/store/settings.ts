import { createStore } from "./createStore";
import { Leaf, MENU } from "../cat/menu";
import { CatTransport } from "../cat/transport";
import { readMenu, writeMenu } from "../cat/commands";
import { CatTimeoutError } from "../cat/protocol";

export interface LeafState {
  p1: number;
  p2: number;
  p3: number;
  leaf: Leaf;
  raw: string | null;
  dirty: boolean;
  error: string | null;
}

const ALL_LEAVES: { p1: number; p2: number; p3: number; leaf: Leaf }[] = [];
for (const g of MENU) {
  for (const sub of g.subgroups) {
    for (const l of sub.leaves) {
      ALL_LEAVES.push({ p1: g.p1, p2: sub.p2, p3: l.p3, leaf: l });
    }
  }
}

const leafKey = (p1: number, p2: number, p3: number) =>
  `${p1.toString().padStart(2, "0")}-${p2.toString().padStart(2, "0")}-${p3
    .toString()
    .padStart(2, "0")}`;

interface SettingsState {
  values: Record<string, LeafState>;
  reading: boolean;
  writing: boolean;
  progress: { done: number; total: number };
  init: () => void;
  readAll: (t: CatTransport) => Promise<void>;
  readOne: (t: CatTransport, p1: number, p2: number, p3: number) => Promise<void>;
  setRaw: (p1: number, p2: number, p3: number, raw: string) => void;
  writeDirty: (t: CatTransport) => Promise<{ ok: number; failed: number }>;
}

export const settingsStore = createStore<SettingsState>((set, get) => ({
  values: {},
  reading: false,
  writing: false,
  progress: { done: 0, total: 0 },

  init: () => {
    const v: Record<string, LeafState> = {};
    for (const e of ALL_LEAVES) {
      v[leafKey(e.p1, e.p2, e.p3)] = {
        p1: e.p1,
        p2: e.p2,
        p3: e.p3,
        leaf: e.leaf,
        raw: null,
        dirty: false,
        error: null,
      };
    }
    set({ values: v });
  },

  readAll: async (t) => {
    // Read everything except hard-blocked destructive leaves. "readonly" leaves
    // (SOFT VERSION, DP-ID LIST, etc.) still respond to reads — try them.
    const all = ALL_LEAVES.filter((e) => e.leaf.type.kind !== "excluded");
    set({ reading: true, progress: { done: 0, total: all.length } });
    let done = 0;
    for (const e of all) {
      // Fast-fail: abort immediately if transport closed mid-operation
      if (!t.isOpen) {
        set({ reading: false });
        return;
      }
      try {
        const raw = await readMenu(t, e.p1, e.p2, e.p3);
        get().setRaw(e.p1, e.p2, e.p3, raw);
        set((s) => {
          const k = leafKey(e.p1, e.p2, e.p3);
          return {
            values: { ...s.values, [k]: { ...s.values[k], dirty: false, error: null } },
          };
        });
      } catch (err) {
        // Record the failure per-leaf instead of silently swallowing it, so the
        // UI can show which settings failed to read (BFT N3). A ?; reply on a
        // non-excluded leaf is a genuine "could not read this setting".
        set((s) => {
          const k = leafKey(e.p1, e.p2, e.p3);
          return {
            values: {
              ...s.values,
              [k]: { ...s.values[k], error: (err as Error).message },
            },
          };
        });
        if (err instanceof CatTimeoutError) {
          // Radio went silent — stop the 427-leaf sweep rather than stalling on
          // each one (BFT C7, same hazard as memory.readAll).
          set({ reading: false });
          return;
        }
      }
      done++;
      set((s) => ({ progress: { ...s.progress, done } }));
    }
    set({ reading: false });
  },

  readOne: async (t, p1, p2, p3) => {
    try {
      const raw = await readMenu(t, p1, p2, p3);
      get().setRaw(p1, p2, p3, raw);
    } catch (err) {
      // Record errors rather than swallowing CatError (BFT N3).
      set((s) => {
        const k = leafKey(p1, p2, p3);
        return {
          values: {
            ...s.values,
            [k]: { ...s.values[k], error: (err as Error).message },
          },
        };
      });
    }
  },

  setRaw: (p1, p2, p3, raw) => {
    const k = leafKey(p1, p2, p3);
    set((s) => {
      const cur = s.values[k];
      if (!cur) return s;
      return {
        values: { ...s.values, [k]: { ...cur, raw, dirty: cur.raw === null ? true : cur.raw !== raw } },
      };
    });
  },

  writeDirty: async (t) => {
    const dirty = Object.values(get().values).filter(
      (v) => v.dirty && v.leaf.type.kind !== "excluded" && v.leaf.type.kind !== "readonly",
    );
    set({ writing: true, progress: { done: 0, total: dirty.length } });
    let ok = 0;
    let failed = 0;
    for (const v of dirty) {
      // Fast-fail: abort immediately if transport closed mid-operation
      if (!t.isOpen) {
        set({ writing: false });
        return { ok, failed };
      }
      try {
        if (v.raw === null) continue;
        await writeMenu(t, v.p1, v.p2, v.p3, v.raw);
        // Verify via an explicit read-back; a failed read throws and is counted
        // as a failure instead of being swallowed and marked clean (BFT N3).
        const raw = await readMenu(t, v.p1, v.p2, v.p3);
        const k = leafKey(v.p1, v.p2, v.p3);
        set((s) => ({
          values: { ...s.values, [k]: { ...s.values[k], raw, dirty: false, error: null } },
        }));
        ok++;
      } catch (err) {
        const k = leafKey(v.p1, v.p2, v.p3);
        set((s) => ({
          values: {
            ...s.values,
            [k]: { ...s.values[k], error: (err as Error).message },
          },
        }));
        failed++;
      }
      set((s) => ({ progress: { ...s.progress, done: s.progress.done + 1 } }));
    }
    set({ writing: false });
    return { ok, failed };
  },
}));

export { leafKey };
