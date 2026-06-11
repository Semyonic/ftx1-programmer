import { createStore } from "./createStore";
import { CatLogEntry, CatTransport } from "../cat/transport";
import { readFirmwareVersion, readId, setAutoInfo } from "../cat/commands";

const MAX_LOG = 500;

interface ConnectionState {
  transport: CatTransport | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  error: string | null;
  radioId: string | null;
  firmware: string | null;
  writesEnabled: boolean;
  dryRun: boolean;
  log: CatLogEntry[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  enableWrites: (on: boolean) => void;
  setDryRun: (on: boolean) => void;
  appendLog: (entry: CatLogEntry) => void;
}

export const connectionStore = createStore<ConnectionState>((set, get) => ({
  transport: null,
  status: "disconnected",
  error: null,
  radioId: null,
  firmware: null,
  writesEnabled: false,
  dryRun: true,
  log: [],

  appendLog: (entry) => {
    set((s) => {
      const next = [...s.log, entry];
      if (next.length > MAX_LOG) next.splice(0, next.length - MAX_LOG);
      return { log: next };
    });
  },

  connect: async () => {
    if (!CatTransport.isWebSerialSupported() && !get().dryRun) {
      set({
        status: "error",
        error: "Web Serial not supported. Use Chrome, Edge, or Opera, or enable Dry Run.",
      });
      return;
    }
    set({ status: "connecting", error: null });
    const dryRun = get().dryRun;
    const transport = new CatTransport({
      dryRun,
      timeoutMs: 1000,
      onLog: (e) => get().appendLog(e),
      onUnsolicited: (frame) => {
        get().appendLog({ ts: Date.now(), direction: "info", data: `(AI) ${frame};` });
      },
      onDisconnect: () => {
        set({ transport: null, status: "disconnected", radioId: null, firmware: null, writesEnabled: false });
      },
    });
    try {
      if (!dryRun) {
        const port = await CatTransport.requestPort();
        await transport.open(port);
      }
      const id = dryRun ? "0840" : await readId(transport);
      const fw = dryRun ? "01-08" : await readFirmwareVersion(transport, 0);
      await setAutoInfo(transport, false);
      set({ transport, status: "connected", radioId: id, firmware: fw });
    } catch (err) {
      const msg = (err as Error).message;
      try {
        await transport.close();
      } catch {
        /* ignore */
      }
      set({ transport: null, status: "error", error: msg });
    }
  },

  disconnect: async () => {
    const t = get().transport;
    if (t) {
      try {
        await t.close();
      } catch {
        /* ignore */
      }
    }
    set({ transport: null, status: "disconnected", radioId: null, firmware: null, writesEnabled: false });
  },

  enableWrites: (on) => {
    const t = get().transport;
    if (t) t.setWritesArmed(on);
    set({ writesEnabled: on });
  },
  setDryRun: (on) => set({ dryRun: on }),
}));
