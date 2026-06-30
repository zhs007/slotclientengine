import { describe, expect, it } from "vitest";
import { LogicCoreError, LogicParseError } from "../src";

describe("logiccore errors", () => {
  it("distinguishes parse errors from range errors", () => {
    const error = new LogicParseError("bad protocol");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LogicCoreError);
    expect(error.name).toBe("LogicParseError");
    expect(new RangeError("bad index")).not.toBeInstanceOf(LogicCoreError);
  });
});
