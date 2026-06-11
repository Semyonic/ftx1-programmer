import { describe, expect, it } from "vitest";
import { buildBackup } from "../io/json";
import type { MemoryRow } from "../store/memory";
import type { LeafState } from "../store/settings";
import type { ChannelId, MemoryFrame } from "../cat/codec";

function makeRow(n: number, tag: string, frame: MemoryFrame | null): MemoryRow {
  const id: ChannelId = { kind: "memory", n };
  return {
    id,
    key: `m${n.toString().padStart(3, "0")}`,
    frame,
    tag,
    dirty: true,
    error: "some error",
  };
}

function makeLeaf(p1: number, p2: number, p3: number, raw: string | null): LeafState {
  return {
    p1,
    p2,
    p3,
    leaf: { p3, name: "TEST", type: { kind: "int", min: 0, max: 100, digits: 4 } },
    raw,
    dirty: true,
    error: "stale",
  };
}

const FRAME: MemoryFrame = {
  channel: { kind: "memory", n: 1 },
  freqHz: 145_500_000,
  clarifierHz: 0,
  rxClarOn: false,
  txClarOn: false,
  mode: "FM",
  vfoMem: "Memory",
  ctcssState: "OFF",
  shift: "simplex",
};

describe("buildBackup", () => {
  it("produces version 1 and ISO date", () => {
    const b = buildBackup({ firmwareVersion: null, radioId: null, memory: [], settings: [] });
    expect(b.version).toBe(1);
    expect(new Date(b.generatedAt).toISOString()).toBe(b.generatedAt);
  });

  it("passes through firmwareVersion and radioId", () => {
    const b = buildBackup({ firmwareVersion: "0450", radioId: "1234", memory: [], settings: [] });
    expect(b.firmwareVersion).toBe("0450");
    expect(b.radioId).toBe("1234");
  });

  it("passes null firmwareVersion and radioId", () => {
    const b = buildBackup({ firmwareVersion: null, radioId: null, memory: [], settings: [] });
    expect(b.firmwareVersion).toBeNull();
    expect(b.radioId).toBeNull();
  });

  it("maps memory rows extracting key, id, frame, tag", () => {
    const row = makeRow(1, "BEACON", FRAME);
    const b = buildBackup({ firmwareVersion: null, radioId: null, memory: [row], settings: [] });
    expect(b.memory).toHaveLength(1);
    expect(b.memory[0].key).toBe("m001");
    expect(b.memory[0].id).toEqual({ kind: "memory", n: 1 });
    expect(b.memory[0].frame).toEqual(FRAME);
    expect(b.memory[0].tag).toBe("BEACON");
    expect(b.memory[0]).not.toHaveProperty("dirty");
    expect(b.memory[0]).not.toHaveProperty("error");
  });

  it("maps memory row with null frame", () => {
    const row = makeRow(5, "", null);
    const b = buildBackup({ firmwareVersion: null, radioId: null, memory: [row], settings: [] });
    expect(b.memory[0].frame).toBeNull();
    expect(b.memory[0].tag).toBe("");
  });

  it("maps settings extracting p1, p2, p3, raw", () => {
    const leaf = makeLeaf(1, 3, 16, "0600");
    const b = buildBackup({ firmwareVersion: null, radioId: null, memory: [], settings: [leaf] });
    expect(b.settings).toHaveLength(1);
    expect(b.settings[0]).toEqual({ p1: 1, p2: 3, p3: 16, raw: "0600" });
  });

  it("maps settings with null raw", () => {
    const leaf = makeLeaf(2, 1, 1, null);
    const b = buildBackup({ firmwareVersion: null, radioId: null, memory: [], settings: [leaf] });
    expect(b.settings[0].raw).toBeNull();
  });

  it("handles empty arrays", () => {
    const b = buildBackup({ firmwareVersion: null, radioId: null, memory: [], settings: [] });
    expect(b.memory).toEqual([]);
    expect(b.settings).toEqual([]);
  });

  it("maps many rows", () => {
    const rows = Array.from({ length: 99 }, (_, i) => makeRow(i + 1, `CH${i + 1}`, FRAME));
    const b = buildBackup({ firmwareVersion: null, radioId: null, memory: rows, settings: [] });
    expect(b.memory).toHaveLength(99);
    expect(b.memory[98].key).toBe("m099");
    expect(b.memory[98].tag).toBe("CH99");
  });
});
