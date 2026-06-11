import { describe, expect, it, vi } from "vitest";
import { CatTransport, CatLogEntry } from "../cat/transport";
import { readInfo, readSubInfo, readSelectedMemoryChannel } from "../cat/commands";
import {
  buildFrame,
  CatError,
  CatTimeoutError,
  FrameSplitter,
  isErrorReply,
} from "../cat/protocol";

// Capture the rejection message of a promise without failing the test.
async function rejectionMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

// ---------------------------------------------------------------------------
// 1. Dry-run mode
// ---------------------------------------------------------------------------
describe("CatTransport dry-run mode", () => {
  it("send() does not throw", async () => {
    const t = new CatTransport({ dryRun: true });
    await expect(t.send("FA014250000")).resolves.toBeUndefined();
  });

  it("query() returns canned dry-run reply", async () => {
    const t = new CatTransport({ dryRun: true });
    const result = await t.query("FA");
    expect(result).toBe("FA014250000");
  });

  it("isOpen is true in dry-run mode", () => {
    const t = new CatTransport({ dryRun: true });
    expect(t.isOpen).toBe(true);
  });

  it("isOpen is false when no port and not dry-run", () => {
    const t = new CatTransport();
    expect(t.isOpen).toBe(false);
  });

  it("onLog fires with direction 'tx' for send()", async () => {
    const logs: CatLogEntry[] = [];
    const t = new CatTransport({ dryRun: true, onLog: (e) => logs.push(e) });
    await t.send("FA014250000");
    const txLogs = logs.filter((l) => l.direction === "tx");
    expect(txLogs.length).toBe(1);
    expect(txLogs[0].data).toBe("FA014250000;");
  });

  it("onLog fires with direction 'tx' for query()", async () => {
    const logs: CatLogEntry[] = [];
    const t = new CatTransport({ dryRun: true, onLog: (e) => logs.push(e) });
    await t.query("ID");
    const txLogs = logs.filter((l) => l.direction === "tx");
    expect(txLogs.length).toBe(1);
    expect(txLogs[0].data).toBe("ID;");
  });

  it("logged frames include the trailing semicolon", async () => {
    const logs: CatLogEntry[] = [];
    const t = new CatTransport({ dryRun: true, onLog: (e) => logs.push(e) });
    await t.send("AB");
    expect(logs.some((l) => l.data === "AB;")).toBe(true);
  });

  it("log entry ts is a recent epoch ms", async () => {
    const logs: CatLogEntry[] = [];
    const t = new CatTransport({ dryRun: true, onLog: (e) => logs.push(e) });
    const before = Date.now();
    await t.send("AB");
    const after = Date.now();
    for (const l of logs) {
      expect(l.ts).toBeGreaterThanOrEqual(before);
      expect(l.ts).toBeLessThanOrEqual(after);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. FrameSplitter edge cases
// ---------------------------------------------------------------------------
describe("FrameSplitter edge cases", () => {
  it("multiple consecutive terminators yield no empty frames", () => {
    const s = new FrameSplitter();
    expect(s.push(";;;")).toEqual([]);
  });

  it("mixed data with consecutive terminators", () => {
    const s = new FrameSplitter();
    expect(s.push("FA014250000;;;ID0840;")).toEqual(["FA014250000", "ID0840"]);
  });

  it("buffer overflow protection: >4096 bytes without terminator resets buffer", () => {
    const s = new FrameSplitter();
    // Suppress console.error from FrameSplitter
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const garbage = "A".repeat(5000);
    const result = s.push(garbage);
    expect(result).toEqual([]);
    // After overflow discard, buffer should be empty; next valid frame works.
    expect(s.push("ID0840;")).toEqual(["ID0840"]);
    spy.mockRestore();
  });

  it("single-char frame '?' (error reply pattern)", () => {
    const s = new FrameSplitter();
    expect(s.push("?;")).toEqual(["?"]);
  });

  it("very long valid frame (EX command with long P4)", () => {
    const s = new FrameSplitter();
    // EX + P1(3) + P2(2) + P3(2) + P4(variable) e.g. 100 chars of value
    const longP4 = "0".repeat(100);
    const frame = `EX010203${longP4}`;
    const result = s.push(frame + ";");
    expect(result).toEqual([frame]);
  });

  it("reset() clears buffered data", () => {
    const s = new FrameSplitter();
    s.push("FA0142"); // partial, buffered
    s.reset();
    // The buffered partial should be gone; new data should not contain it.
    expect(s.push("ID0840;")).toEqual(["ID0840"]);
  });

  it("frame at exactly 4096 bytes is accepted", () => {
    const s = new FrameSplitter();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = "X".repeat(4096);
    // Push exactly 4096 chars without terminator -- at boundary, no overflow yet.
    const result = s.push(body);
    expect(result).toEqual([]);
    // Now terminate it.
    expect(s.push(";")).toEqual([body]);
    spy.mockRestore();
  });

  it("frame at 4097 bytes triggers overflow", () => {
    const s = new FrameSplitter();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = "X".repeat(4097);
    s.push(body);
    expect(spy).toHaveBeenCalled();
    // Buffer was discarded; verify recovery.
    expect(s.push("AB;")).toEqual(["AB"]);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 3. Pending-request race fix verification (dry-run)
// ---------------------------------------------------------------------------
describe("sequential queries in dry-run", () => {
  it("multiple sequential queries return canned dry-run replies", async () => {
    const t = new CatTransport({ dryRun: true });
    const r1 = await t.query("FA");
    const r2 = await t.query("FB");
    const r3 = await t.query("ID");
    expect(r1).toBe("FA014250000");
    expect(r2).toBe("FB007100000");
    expect(r3).toBe("ID0840");
  });

  it("concurrent queries serialize via mutex (dry-run)", async () => {
    const order: string[] = [];
    const t = new CatTransport({
      dryRun: true,
      onLog: (e) => {
        if (e.direction === "tx") order.push(e.data);
      },
    });
    // Fire all at once -- mutex ensures they serialize.
    const [a, b, c] = await Promise.all([
      t.query("FA"),
      t.query("FB"),
      t.query("ID"),
    ]);
    expect(a).toBe("FA014250000");
    expect(b).toBe("FB007100000");
    expect(c).toBe("ID0840");
    expect(order).toEqual(["FA;", "FB;", "ID;"]);
  });

  it("send and query interleaved serialize correctly", async () => {
    const order: string[] = [];
    const t = new CatTransport({
      dryRun: true,
      onLog: (e) => {
        if (e.direction === "tx") order.push(e.data);
      },
    });
    await Promise.all([
      t.send("FA014250000"),
      t.query("FB"),
      t.send("AG00"),
    ]);
    expect(order).toEqual(["FA014250000;", "FB;", "AG00;"]);
  });
});

// ---------------------------------------------------------------------------
// 4. Frame validation (buildFrame)
// ---------------------------------------------------------------------------
describe("buildFrame validation", () => {
  it('buildFrame("AB") returns "AB;"', () => {
    expect(buildFrame("AB")).toBe("AB;");
  });

  it('buildFrame("FA014250000") returns "FA014250000;"', () => {
    expect(buildFrame("FA014250000")).toBe("FA014250000;");
  });

  it('buildFrame("X") throws (too short)', () => {
    expect(() => buildFrame("X")).toThrow();
  });

  it('buildFrame("FA;test") throws (contains ;)', () => {
    expect(() => buildFrame("FA;test")).toThrow();
  });

  it('buildFrame("1A") throws (non-letter prefix)', () => {
    expect(() => buildFrame("1A")).toThrow();
  });

  it('buildFrame("") throws (empty)', () => {
    expect(() => buildFrame("")).toThrow();
  });

  it("buildFrame with lowercase letters succeeds", () => {
    expect(buildFrame("fa014250000")).toBe("fa014250000;");
  });

  it("buildFrame with mixed-case letters succeeds", () => {
    expect(buildFrame("Fa014250000")).toBe("Fa014250000;");
  });

  it("buildFrame rejects body with control character", () => {
    expect(() => buildFrame("FA\x01")).toThrow();
  });

  it("buildFrame allows space and printable symbols in parameters", () => {
    // Printable ASCII after the two-letter prefix, per PARAM_CHAR_RE.
    expect(buildFrame("KM hello world")).toBe("KM hello world;");
  });
});

// ---------------------------------------------------------------------------
// 5. Error types
// ---------------------------------------------------------------------------
describe("error types", () => {
  it("CatError has correct name and raw property", () => {
    const err = new CatError("?");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CatError);
    expect(err.name).toBe("CatError");
    expect(err.raw).toBe("?");
    expect(err.message).toContain("?;");
  });

  it("CatTimeoutError has correct name, cmd, and timeoutMs", () => {
    const err = new CatTimeoutError("FA", 1000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CatTimeoutError);
    expect(err.name).toBe("CatTimeoutError");
    expect(err.cmd).toBe("FA");
    expect(err.timeoutMs).toBe(1000);
    expect(err.message).toContain("1000");
    expect(err.message).toContain("FA");
  });

  it('isErrorReply("?;") is true', () => {
    expect(isErrorReply("?;")).toBe(true);
  });

  it('isErrorReply("?") is true', () => {
    expect(isErrorReply("?")).toBe(true);
  });

  it('isErrorReply("ID0840;") is false', () => {
    expect(isErrorReply("ID0840;")).toBe(false);
  });

  it('isErrorReply("") is false', () => {
    expect(isErrorReply("")).toBe(false);
  });

  it('isErrorReply("FA014250000") is false', () => {
    expect(isErrorReply("FA014250000")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Close / cleanup (dry-run)
// ---------------------------------------------------------------------------
describe("close / cleanup (dry-run)", () => {
  it("close() does not throw", async () => {
    const t = new CatTransport({ dryRun: true });
    await expect(t.close()).resolves.toBeUndefined();
  });

  it("double close() does not throw", async () => {
    const t = new CatTransport({ dryRun: true });
    await t.close();
    await expect(t.close()).resolves.toBeUndefined();
  });

  it("send after close still works in dry-run (no real port)", async () => {
    const t = new CatTransport({ dryRun: true });
    await t.close();
    // dry-run doesn't gate on port state for send/query
    await expect(t.send("AB")).resolves.toBeUndefined();
  });

  it("query after close still works in dry-run", async () => {
    const t = new CatTransport({ dryRun: true });
    await t.close();
    const result = await t.query("FA");
    expect(result).toBe("FA014250000");
  });
});

// ---------------------------------------------------------------------------
// 8. Write-gating (BFT N1, N2)
// ---------------------------------------------------------------------------
describe("write-gating", () => {
  it("N1: AI (session control) bypasses the arm gate on a real transport", async () => {
    // Non-dry-run, writes NOT armed, no port. The arm gate must let AI through
    // (it fails later on the missing writer, not with 'Write blocked') — this is
    // what lets connect() send AI0 before writes are armed.
    const t = new CatTransport();
    const msg = await rejectionMessage(t.send("AI0"));
    expect(msg).not.toMatch(/Write blocked/);
  });

  it("N1: a normal Set command is still blocked when writes are not armed", async () => {
    const t = new CatTransport();
    const msg = await rejectionMessage(t.send("FA014250000"));
    expect(msg).toMatch(/Write blocked/);
  });

  it("N2: a Set-form body via query() is blocked even for an allowlisted prefix", async () => {
    // 'FA' read form is "FA" (≤2 chars); the long set-form body must NOT slip
    // through the gate on the 2-char prefix alone.
    const t = new CatTransport();
    const msg = await rejectionMessage(t.query("FA014250000"));
    expect(msg).toMatch(/Write blocked/);
  });

  it("N3: AI/ST/LK/KM read forms pass the gate unarmed via query()", async () => {
    // Read wrappers readAutoInfo/readSplit/readLock/readKeyerMemory must not be
    // write-blocked. (They fail later on the missing port, not the gate.)
    const t = new CatTransport();
    for (const body of ["AI", "ST", "LK", "KM1"]) {
      const msg = await rejectionMessage(t.query(body));
      expect(msg, body).not.toMatch(/Write blocked/);
    }
  });

  it("N3: AI/ST/LK set forms via query() are still blocked unarmed", async () => {
    const t = new CatTransport();
    for (const body of ["AI1", "ST1", "LK1"]) {
      const msg = await rejectionMessage(t.query(body));
      expect(msg, body).toMatch(/Write blocked/);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Dry-run IF reply is decodable (BFT C6)
// ---------------------------------------------------------------------------
describe("dry-run readInfo", () => {
  it("C6: query('IF') in dry-run returns a decodable 27-char payload", async () => {
    const t = new CatTransport({ dryRun: true });
    const frame = await readInfo(t);
    expect(frame.freqHz).toBe(14_250_000);
    expect(frame.mode).toBe("USB");
    expect(frame.vfoMem).toBe("VFO");
  });
});

// ---------------------------------------------------------------------------
// 9b. Dry-run completeness (BFT N4, N5)
// ---------------------------------------------------------------------------
describe("dry-run completeness", () => {
  it("N4: a '?' dry-run reply raises CatError (empty channel), not a literal '?'", async () => {
    const t = new CatTransport({ dryRun: true });
    await expect(t.query("MR00001")).rejects.toBeInstanceOf(CatError);
  });

  it("N5: dry-run OI decodes via readSubInfo", async () => {
    const t = new CatTransport({ dryRun: true });
    const f = await readSubInfo(t);
    expect(f.freqHz).toBe(7_100_000);
  });

  it("N5: dry-run MC decodes via readSelectedMemoryChannel", async () => {
    const t = new CatTransport({ dryRun: true });
    expect(await readSelectedMemoryChannel(t, "main")).toEqual({ kind: "memory", n: 1 });
  });
});

// ---------------------------------------------------------------------------
// 10. Static methods
// ---------------------------------------------------------------------------
describe("static helpers", () => {
  it("isWebSerialSupported returns false in Node/vitest", () => {
    // No navigator.serial in Node.
    expect(CatTransport.isWebSerialSupported()).toBe(false);
  });
});
