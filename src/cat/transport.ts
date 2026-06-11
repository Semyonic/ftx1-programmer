// Web Serial transport for FTX-1 CAT.
// - Single-flight async mutex: one command in flight at a time.
// - Splits inbound stream on ';'.
// - Distinguishes solicited replies (matched to the active request) from
//   unsolicited Auto-Information (AI) frames; AI frames go to a separate listener.
// - Dry-run mode: if dryRun is true, writes nothing and never opens a port;
//   commands resolve with synthetic empty answers and are recorded for audit.
//
// Manual references:
//   p.1 — USB-C connection, Silicon Labs CP210x driver.
//   p.4 — Default baud 38400 (CAT-1, CAT-3) or 4800 (CAT-2); 8N1, no parity.
//         Default TIME OUT TIMER 10 ms (we use 1000 ms by default to be safe).
//   p.4 — Error reply '?;'.

import { CatError, CatTimeoutError, FrameSplitter, buildFrame, isErrorReply } from "./protocol";

export interface CatTransportOptions {
  baudRate?: number;
  timeoutMs?: number;
  dryRun?: boolean;
  onUnsolicited?: (frame: string) => void;
  onLog?: (entry: CatLogEntry) => void;
  onDisconnect?: () => void;
}

export interface CatLogEntry {
  ts: number; // epoch ms
  direction: "tx" | "rx" | "info" | "error";
  data: string;
}

interface PendingRequest {
  cmd: string; // 2-letter command, e.g. "FA"
  matchPrefix: string; // prefix used for reply matching (2 chars normally, 8 for EX)
  resolve: (frame: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class CatTransport {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readLoopAbort: AbortController | null = null;
  private splitter = new FrameSplitter();
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private mutex: Promise<void> = Promise.resolve();
  private pending: PendingRequest | null = null;
  private disconnectHandler: (() => void) | null = null;

  // ── Fix #8: Write-gating ──────────────────────────────────────────────
  // Defence-in-depth: even if the UI allows a write-style command through,
  // the transport layer blocks it unless writes have been explicitly armed.
  writesArmed = false;

  /** Read-form body max length per command, for commands safe to issue without
   *  arming writes. A command's *read* form is short (prefix + optional
   *  side/selector); its *set* form carries a value payload and is longer, so a
   *  length bound distinguishes the two even for dual read/write mnemonics
   *  (FA, MT, CN, …). A longer body is treated as a write and gated — this stops
   *  a Set-form body slipping through on the 2-char prefix alone (BFT N2). */
  private static readonly READ_FORM_MAX_LEN = new Map<string, number>([
    ["ID", 2], ["VE", 3], ["FA", 2], ["FB", 2], ["IF", 2], ["OI", 2],
    ["MR", 7], ["MT", 7], ["MZ", 7], ["MC", 3], ["SM", 3], ["KS", 2],
    ["KP", 2], ["KR", 2], ["BI", 2], ["AG", 3], ["SQ", 3], ["CN", 4],
    ["CT", 3], ["MD", 3], ["PA", 3], ["RA", 3], ["NA", 3], ["OS", 3],
    // BFT N3: read forms of AI/ST/LK/KM ("AI", "ST", "LK", "KM<ch>") must pass
    // unarmed; their set forms are all at least one char longer, so the length
    // gate still distinguishes them.
    ["AI", 2], ["ST", 2], ["LK", 2], ["KM", 3],
  ]);

  /** Set-style commands that are session control (not radio configuration) and
   *  therefore safe to issue before writes are armed — e.g. AI (auto-information
   *  off) sent during connect. Without this, real-hardware connect throws,
   *  because setAutoInfo() is a gated write issued before writes are armed
   *  (BFT N1: connect succeeds in dry-run but always fails on a real radio). */
  private static readonly UNGATED_SET_PREFIXES = new Set(["AI"]);

  // ── Fix #11: Dry-run mock replies ─────────────────────────────────────
  /** Canned replies returned in dry-run mode so decoders don't choke on "". */
  private static readonly DRY_RUN_REPLIES: Record<string, string> = {
    "ID": "ID0840",
    "VE": "VE01-08",
    "FA": "FA014250000",
    "FB": "FB007100000",
    "SM": "SM0007",
    "MD": "MD02",
    // 27-char payload: P1 00000(VFO) P2 014250000(14.25MHz) P3 +0000 P4 0 P5 0
    // P6 2(USB) P7 0(VFO) P8 0(OFF) P9 00 P10 0(simplex). (BFT C6: prior value
    // was 24 chars → decodeMemoryPayload threw in dry-run readInfo().)
    "IF": "IF00000014250000+000000200000",
    "AI": "AI0",
    "KS": "KS012",
    "KP": "KP050",
    "KR": "KR0",
    "BI": "BI0",
    "AG": "AG0128",
    "SQ": "SQ0050",
    "CN": "CN00008", // CN + P1(side) + P2(type) + P3×3 — full 7-char answer
    "CT": "CT00",
    "OI": "OI00000007100000+000000100000",
    "MC": "MC000001",
    "MZ": "MZ000010014250000",
    "PA": "PA00",
    "RA": "RA00",
    "NA": "NA00",
    "OS": "OS00",
    // MR/MT/EX: "?" simulates the radio's error reply (empty channel / not
    // executable). query() turns this into a thrown CatError (BFT N4) so the
    // stores see the same empty-channel path they would on real hardware.
    "MR": "?",
    "MT": "?",
    "EX": "?",
  };

  constructor(private opts: CatTransportOptions = {}) {}

  /** Arm or disarm write-command gating.  Call before sending Set commands. */
  setWritesArmed(armed: boolean): void {
    this.writesArmed = armed;
  }

  get isOpen(): boolean {
    return this.opts.dryRun === true || (this.port !== null && this.writer !== null);
  }

  static isWebSerialSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  // Prompt user to choose a serial port. Filters narrow to Silicon Labs
  // CP210x (VID 0x10C4) per manual p.1.
  static async requestPort(): Promise<SerialPort> {
    if (!CatTransport.isWebSerialSupported()) {
      throw new Error("Web Serial API not supported in this browser. Use Chrome, Edge, or Opera.");
    }
    return await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x10c4 }],
    });
  }

  async open(port: SerialPort): Promise<void> {
    if (this.opts.dryRun) {
      this.log({ ts: Date.now(), direction: "info", data: "(dry-run) open() no-op" });
      return;
    }
    if (this.port) throw new Error("Transport already open");
    this.port = port;
    await port.open({
      baudRate: this.opts.baudRate ?? 38400,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none",
    });
    this.writer = port.writable!.getWriter();
    this.reader = port.readable!.getReader();
    this.readLoopAbort = new AbortController();
    this.disconnectHandler = () => {
      this.log({ ts: Date.now(), direction: "error", data: "USB disconnected" });
      void this.close().then(() => this.opts.onDisconnect?.());
    };
    port.addEventListener("disconnect", this.disconnectHandler);
    void this.readLoop();
    this.log({
      ts: Date.now(),
      direction: "info",
      data: `port opened @ ${this.opts.baudRate ?? 38400} bps`,
    });
  }

  async close(): Promise<void> {
    if (this.opts.dryRun) return;
    this.readLoopAbort?.abort();
    try {
      await this.reader?.cancel();
      this.reader?.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      this.writer?.releaseLock();
    } catch {
      /* ignore */
    }
    if (this.port) {
      if (this.disconnectHandler) {
        this.port.removeEventListener("disconnect", this.disconnectHandler);
        this.disconnectHandler = null;
      }
      try {
        await this.port.close();
      } catch {
        /* ignore */
      }
    }
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.readLoopAbort = null;
    this.splitter.reset();
    this.log({ ts: Date.now(), direction: "info", data: "port closed" });
  }

  // Send a Set-style command (no Answer expected). Caller may await; resolves
  // immediately after write completes. Note: many "Set" commands DO produce an
  // Answer if AI=ON; we don't capture it here.
  //
  // Fix #8: send() is always a write (fire-and-forget), so it is fully gated
  // by writesArmed (dry-run is exempt since nothing is actually transmitted).
  async send(body: string): Promise<void> {
    const prefix = body.slice(0, 2).toUpperCase();
    if (
      !this.writesArmed &&
      !this.opts.dryRun &&
      !CatTransport.UNGATED_SET_PREFIXES.has(prefix)
    ) {
      throw new Error(`Write blocked: ${prefix} command requires writes to be armed`);
    }
    await this.runExclusive(async () => {
      const frame = buildFrame(body);
      this.log({ ts: Date.now(), direction: "tx", data: frame });
      if (this.opts.dryRun) return;
      await this.writer!.write(this.encoder.encode(frame));
    });
  }

  // Send a Read-style command; await one Answer line whose 2-letter command
  // matches the request. Resolves with the reply frame body (without ';').
  // Throws CatError on '?;' and CatTimeoutError on timeout.
  //
  // Fix #8:  If the command is not in READ_ONLY_PREFIXES and writes are not
  //          armed, the call is rejected (dry-run is exempt).
  //          EX is special: body.length <= 8 is a read, >8 is a write.
  // Fix #11: In dry-run mode, return a realistic canned reply instead of "".
  async query(body: string): Promise<string> {
    return await this.runExclusive(async () => {
      const cmd = body.slice(0, 2).toUpperCase();

      // ── Fix #8: write-gating ──────────────────────────────────────
      if (!this.writesArmed && !this.opts.dryRun) {
        // EX: read when body is just EXppssll (≤8 chars), write when >8.
        // Others: a read form is short; a longer body carries a value payload
        // and is treated as a write (BFT N2 — a Set-form body of a dual
        // read/write command no longer bypasses the gate via its prefix alone).
        const maxReadLen = CatTransport.READ_FORM_MAX_LEN.get(cmd);
        const isReadOnly =
          cmd === "EX"
            ? body.length <= 8
            : maxReadLen !== undefined && body.length <= maxReadLen;
        if (!isReadOnly) {
          throw new Error(
            `Write blocked: ${cmd} command requires writes to be armed`,
          );
        }
      }

      // EX commands: match on EX + P1+P2+P3 (8 chars) to avoid cross-talk.
      const matchPrefix = cmd === "EX"
        ? body.slice(0, 8).toUpperCase()
        : cmd;
      const frame = buildFrame(body);
      const timeoutMs = this.opts.timeoutMs ?? 1000;
      this.log({ ts: Date.now(), direction: "tx", data: frame });

      // ── Fix #11: dry-run mock replies ─────────────────────────────
      if (this.opts.dryRun) {
        const reply = CatTransport.DRY_RUN_REPLIES[cmd] ?? "";
        this.log({ ts: Date.now(), direction: "rx", data: reply + ";" });
        // BFT N4: a "?" canned reply means "error / empty channel" — surface it
        // as the same CatError a real radio would, not as a literal "?" string.
        if (isErrorReply(reply) || isErrorReply(reply + ";")) {
          throw new CatError(reply);
        }
        return reply;
      }

      return await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pending === req) this.pending = null;
          reject(new CatTimeoutError(cmd, timeoutMs));
        }, timeoutMs);
        const req: PendingRequest = { cmd, matchPrefix, resolve, reject, timer };
        this.pending = req;
        this.writer!.write(this.encoder.encode(frame)).catch((err) => {
          clearTimeout(timer);
          if (this.pending === req) this.pending = null;
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      });
    });
  }

  // Synchronization primitive. The body is a small async function executed
  // serially with respect to all other transport calls.
  private async runExclusive<T>(body: () => Promise<T>): Promise<T> {
    const next = this.mutex.then(body);
    this.mutex = next.then(
      () => undefined,
      () => undefined,
    );
    return await next;
  }

  private async readLoop(): Promise<void> {
    if (!this.reader) return;
    const abort = this.readLoopAbort?.signal;
    try {
      while (abort && !abort.aborted) {
        const { value, done } = await this.reader.read();
        if (done) {
          // Stream closed (EOF / port gone). Don't exit silently — notify the
          // owner so it can tear down and update UI state (BFT N8). Skip if the
          // close was deliberate (abort already signalled).
          if (!abort.aborted) {
            this.log({ ts: Date.now(), direction: "error", data: "read stream closed (EOF)" });
            this.opts.onDisconnect?.();
          }
          break;
        }
        if (!value) continue;
        const text = this.decoder.decode(value, { stream: true });
        const frames = this.splitter.push(text);
        for (const f of frames) this.dispatchFrame(f);
      }
    } catch (err) {
      this.log({
        ts: Date.now(),
        direction: "error",
        data: `read loop: ${(err as Error).message}`,
      });
      this.opts.onDisconnect?.();
    }
  }

  private dispatchFrame(frame: string): void {
    this.log({ ts: Date.now(), direction: "rx", data: frame + ";" });
    if (isErrorReply(frame + ";")) {
      // BFT N6: a "?;" error reply carries no command id, so it can only be
      // attributed to the in-flight request. If the matching command already
      // timed out (pending === null) the stray error is correctly ignored here;
      // the unavoidable edge (A's late error landing while B is pending) is a
      // limitation of the CAT protocol, not fixable without sequence numbers.
      const p = this.pending;
      if (p) {
        clearTimeout(p.timer);
        this.pending = null;
        p.reject(new CatError(frame));
      }
      return;
    }
    const p = this.pending;
    if (p && frame.slice(0, p.matchPrefix.length).toUpperCase() === p.matchPrefix) {
      clearTimeout(p.timer);
      this.pending = null;
      p.resolve(frame);
      return;
    }
    // Unsolicited (AI) frame.
    this.opts.onUnsolicited?.(frame);
  }

  private log(entry: CatLogEntry): void {
    this.opts.onLog?.(entry);
  }
}
