import { describe, expect, it } from "vitest";
import { FrameSplitter, buildFrame, isErrorReply, validateFrameBody } from "../cat/protocol";

describe("frame builder", () => {
  it("appends ; terminator", () => {
    expect(buildFrame("FA014250000")).toBe("FA014250000;");
  });
  it("rejects body containing ;", () => {
    expect(() => buildFrame("FA;")).toThrow();
  });
  it("rejects body shorter than 2 chars", () => {
    expect(() => validateFrameBody("F")).toThrow();
  });
  it("rejects non-letter command prefix", () => {
    expect(() => validateFrameBody("1A;")).toThrow();
  });
});

describe("error reply", () => {
  it("recognises ?;", () => {
    expect(isErrorReply("?;")).toBe(true);
    expect(isErrorReply("?")).toBe(true);
    expect(isErrorReply("FA014250000")).toBe(false);
  });
});

describe("frame splitter", () => {
  it("splits a single frame", () => {
    const s = new FrameSplitter();
    expect(s.push("FA014250000;")).toEqual(["FA014250000"]);
  });
  it("splits multiple frames in one chunk", () => {
    const s = new FrameSplitter();
    expect(s.push("FA014250000;FB007100000;ID0840;")).toEqual([
      "FA014250000",
      "FB007100000",
      "ID0840",
    ]);
  });
  it("buffers across chunks", () => {
    const s = new FrameSplitter();
    expect(s.push("FA0142")).toEqual([]);
    expect(s.push("50000;ID0840;")).toEqual(["FA014250000", "ID0840"]);
  });
  it("ignores empty frames", () => {
    const s = new FrameSplitter();
    expect(s.push(";;ID0840;")).toEqual(["ID0840"]);
  });
});
