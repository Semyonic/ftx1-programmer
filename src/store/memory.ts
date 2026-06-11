import { createStore } from "./createStore";
import { ChannelId, MemoryFrame } from "../cat/codec";
import { CatTransport } from "../cat/transport";
import {
  readMemory,
  readMemoryTag,
  setCtcssTone,
  setDcsCode,
  writeMemory,
  writeMemoryTag,
} from "../cat/commands";
import { CatError, CatTimeoutError } from "../cat/protocol";

export interface MemoryRow {
  id: ChannelId;
  key: string; // stable ID for React keys
  frame: MemoryFrame | null; // null means empty channel
  tag: string;
  dirty: boolean;
  error: string | null;
  // CN preamble values applied right before MW. Used by the ADMS-14 importer
  // to push per-channel CTCSS Hz / DCS code, since the MW frame itself only
  // carries the tone-state byte (manual p.20 P8).
  pendingToneIdx?: number;
  pendingDcsIdx?: number;
}

const channelKey = (id: ChannelId): string => {
  switch (id.kind) {
    case "vfo":
      return "vfo";
    case "memory":
      return `m${id.n.toString().padStart(3, "0")}`;
    case "pms":
      return `p${id.n.toString().padStart(2, "0")}${id.end}`;
    case "emergency":
      return "emg";
  }
};

const blankRow = (id: ChannelId): MemoryRow => ({
  id,
  key: channelKey(id),
  frame: null,
  tag: "",
  dirty: false,
  error: null,
});

export const ALL_MEMORY_IDS: ChannelId[] = [
  ...Array.from({ length: 99 }, (_, i): ChannelId => ({ kind: "memory", n: i + 1 })),
  ...Array.from({ length: 50 }, (_, i): ChannelId[] => [
    { kind: "pms", n: i + 1, end: "L" },
    { kind: "pms", n: i + 1, end: "U" },
  ]).flat(),
  { kind: "emergency" },
];

interface MemoryStoreState {
  rows: MemoryRow[];
  reading: boolean;
  writing: boolean;
  progress: { done: number; total: number };
  init: () => void;
  readAll: (t: CatTransport) => Promise<void>;
  readOne: (t: CatTransport, key: string) => Promise<void>;
  setRow: (key: string, patch: Partial<MemoryRow>) => void;
  writeDirty: (t: CatTransport) => Promise<{ ok: number; failed: number }>;
  clearDirty: () => void;
}

export const memoryStore = createStore<MemoryStoreState>((set, get) => ({
  rows: ALL_MEMORY_IDS.map(blankRow),
  reading: false,
  writing: false,
  progress: { done: 0, total: 0 },

  init: () => set({ rows: ALL_MEMORY_IDS.map(blankRow) }),

  readAll: async (t) => {
    if (get().reading || get().writing) return;
    const total = get().rows.length;
    set({ reading: true, progress: { done: 0, total } });
    let done = 0;
    for (const row of get().rows) {
      // Fast-fail: abort immediately if transport closed mid-operation
      if (!t.isOpen) {
        set({ reading: false });
        return;
      }
      try {
        const frame = await readMemory(t, row.id);
        let tag = "";
        if (row.id.kind === "memory" || row.id.kind === "pms") {
          try {
            tag = await readMemoryTag(t, row.id);
          } catch (err) {
            if (!(err instanceof CatError)) throw err;
          }
        }
        get().setRow(row.key, { frame, tag, error: null, dirty: false });
      } catch (err) {
        if (err instanceof CatError) {
          // Empty channel — manual p.4 says ?; on unexecutable command.
          get().setRow(row.key, { frame: null, tag: "", error: null, dirty: false });
        } else if (err instanceof CatTimeoutError) {
          // A timeout means the radio has gone silent (powered off / unplugged).
          // Stop the sweep rather than grinding through all 200 channels at the
          // per-command timeout each — up to ~200 s of dead waiting (BFT C7).
          get().setRow(row.key, { error: "timeout" });
          set({ reading: false });
          return;
        } else {
          get().setRow(row.key, { error: (err as Error).message });
        }
      }
      done++;
      set({ progress: { done, total } });
    }
    set({ reading: false });
  },

  readOne: async (t, key) => {
    const row = get().rows.find((r) => r.key === key);
    if (!row) return;
    try {
      const frame = await readMemory(t, row.id);
      let tag = row.tag;
      if (row.id.kind === "memory" || row.id.kind === "pms") {
        try {
          tag = await readMemoryTag(t, row.id);
        } catch (err) {
          if (!(err instanceof CatError)) throw err;
        }
      }
      get().setRow(key, { frame, tag, error: null, dirty: false });
    } catch (err) {
      if (err instanceof CatError) {
        get().setRow(key, { frame: null, tag: "", error: null, dirty: false });
      } else {
        get().setRow(key, { error: (err as Error).message });
      }
    }
  },

  setRow: (key, patch) =>
    set((s) => ({
      rows: s.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    })),

  writeDirty: async (t) => {
    if (get().reading || get().writing) return { ok: 0, failed: 0 };
    const dirty = get().rows.filter((r) => r.dirty && r.frame);
    set({ writing: true, progress: { done: 0, total: dirty.length } });
    let ok = 0;
    let failed = 0;
    for (const row of dirty) {
      // Fast-fail: abort immediately if transport closed mid-operation
      if (!t.isOpen) {
        set({ writing: false });
        return { ok, failed };
      }
      try {
        // CN preamble: per-channel tone Hz / DCS code (manual p.9). The MW
        // frame stores only the tone-state byte; the actual frequency / code
        // for the side is taken from the active CN setting at MW time.
        if (
          row.pendingToneIdx !== undefined &&
          row.frame!.ctcssState !== "OFF" &&
          row.frame!.ctcssState !== "DCS"
        ) {
          await setCtcssTone(t, "main", row.pendingToneIdx);
        }
        if (row.pendingDcsIdx !== undefined && row.frame!.ctcssState === "DCS") {
          await setDcsCode(t, "main", row.pendingDcsIdx);
        }
        await writeMemory(t, row.frame!);
        if (row.id.kind === "memory" || row.id.kind === "pms") {
          await writeMemoryTag(t, row.id, row.tag);
        }
        // Read-back verification. Only after a confirmed read do we mark the row
        // clean and clear the pending CN preamble indices — a failed verify
        // throws here, lands in catch, and leaves the row dirty with its tone/
        // DCS values intact so the next sync retries correctly (BFT N4).
        const frame = await readMemory(t, row.id);
        let tag = row.tag;
        if (row.id.kind === "memory" || row.id.kind === "pms") {
          try {
            tag = await readMemoryTag(t, row.id);
          } catch (err) {
            if (!(err instanceof CatError)) throw err;
          }
        }
        get().setRow(row.key, {
          frame,
          tag,
          error: null,
          dirty: false,
          pendingToneIdx: undefined,
          pendingDcsIdx: undefined,
        });
        ok++;
      } catch (err) {
        // Leave row dirty (do not clear) so a failed write/verify is retried.
        get().setRow(row.key, { error: (err as Error).message });
        failed++;
      }
      set((s) => ({ progress: { ...s.progress, done: s.progress.done + 1 } }));
    }
    set({ writing: false });
    return { ok, failed };
  },

  clearDirty: () =>
    set((s) => ({ rows: s.rows.map((r) => ({ ...r, dirty: false })) })),
}));
