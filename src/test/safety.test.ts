import { describe, expect, it } from "vitest";
import { CatTransport } from "../cat/transport";
import { powerOff, setMox, setTx, writeKeyerMemory } from "../cat/commands";

function dryTransport() {
  return new CatTransport({ dryRun: true });
}

describe("destructive command guard", () => {
  it("powerOff requires armed flag", async () => {
    const t = dryTransport();
    // @ts-expect-error: deliberately passing an unarmed flag value
    await expect(powerOff(t, { armed: false })).rejects.toThrow();
  });
  it("setTx requires armed flag", async () => {
    const t = dryTransport();
    // @ts-expect-error: deliberately passing an unarmed flag value
    await expect(setTx(t, true, { armed: false })).rejects.toThrow();
  });
  it("setMox requires armed flag", async () => {
    const t = dryTransport();
    // @ts-expect-error: deliberately passing an unarmed flag value
    await expect(setMox(t, true, { armed: false })).rejects.toThrow();
  });
  it("powerOff with armed flag passes the gate", async () => {
    const t = dryTransport();
    await expect(powerOff(t, { armed: true })).resolves.toBeUndefined();
  });
});

describe("KM keyer memory", () => {
  it("rejects channel out of range", async () => {
    const t = dryTransport();
    await expect(writeKeyerMemory(t, 0, "CQ")).rejects.toThrow();
    await expect(writeKeyerMemory(t, 6, "CQ")).rejects.toThrow();
  });
  it("rejects text containing } or ;", async () => {
    const t = dryTransport();
    await expect(writeKeyerMemory(t, 1, "CQ}")).rejects.toThrow();
    await expect(writeKeyerMemory(t, 1, "CQ;")).rejects.toThrow();
  });
  it("rejects text > 50 chars", async () => {
    const t = dryTransport();
    await expect(writeKeyerMemory(t, 1, "x".repeat(51))).rejects.toThrow();
  });
  it("accepts a valid call", async () => {
    const t = dryTransport();
    await expect(writeKeyerMemory(t, 1, "CQ CQ DE TA1SMO K")).resolves.toBeUndefined();
  });
});
