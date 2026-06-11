// Low-level CAT framing helpers. Source: manual p.4.

export const TERMINATOR = ";";
export const ERROR_REPLY = "?;";

export class CatError extends Error {
  constructor(
    public readonly raw: string,
    msg = "Radio replied ?; (format error or command not executable, manual p.4)",
  ) {
    super(msg);
    this.name = "CatError";
  }
}

export class CatTimeoutError extends Error {
  constructor(public readonly cmd: string, public readonly timeoutMs: number) {
    super(`No reply within ${timeoutMs} ms for command ${JSON.stringify(cmd)}`);
    this.name = "CatTimeoutError";
  }
}

export function isErrorReply(s: string): boolean {
  return s === ERROR_REPLY || s === "?";
}

// Validate a frame body (everything except the trailing ';'): 2-letter command +
// ASCII-printable parameters. Manual p.4: "two ASCII letters, case-insensitive,
// terminated by ';'". Permits A-Z, a-z, 0-9, +, -, ., /, comma, space, '}', etc.
const PARAM_CHAR_RE = /^[\x20-\x7e]*$/;

export function validateFrameBody(body: string): void {
  if (body.length < 2) throw new Error(`Frame too short: ${JSON.stringify(body)}`);
  if (!/^[A-Za-z]{2}$/.test(body.slice(0, 2))) {
    throw new Error(`Frame must start with two letters, got ${JSON.stringify(body.slice(0, 2))}`);
  }
  if (!PARAM_CHAR_RE.test(body)) {
    throw new Error(`Frame contains non-printable byte: ${JSON.stringify(body)}`);
  }
  if (body.includes(TERMINATOR)) {
    throw new Error(`Frame body must not contain ';': ${JSON.stringify(body)}`);
  }
}

export function buildFrame(body: string): string {
  validateFrameBody(body);
  return body + TERMINATOR;
}

// Stream splitter: feed bytes (or chunks of string), receive complete frames
// (without trailing ';'). The KM keyer-memory command uses '}' as a text
// terminator inside the frame, but the wire terminator is always ';'.

/** CAT frames are never more than ~50 chars; 4 KiB is a generous upper bound. */
const MAX_BUF_SIZE = 4096;

export class FrameSplitter {
  private buf = "";

  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let idx;
    while ((idx = this.buf.indexOf(TERMINATOR)) !== -1) {
      const frame = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      if (frame.length > 0) out.push(frame);
    }
    // Guard against unbounded growth from garbage / malfunctioning radio.
    if (this.buf.length > MAX_BUF_SIZE) {
      console.error(
        `FrameSplitter: buffer exceeded ${MAX_BUF_SIZE} bytes without terminator, discarding`,
      );
      this.buf = "";
    }
    return out;
  }

  reset(): void {
    this.buf = "";
  }
}
