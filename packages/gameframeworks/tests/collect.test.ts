import { shouldCollectFinalResult } from "../src/index.js";

describe("collect", () => {
  it("keeps the validated final collect rule", () => {
    expect(shouldCollectFinalResult(10, 1)).toBe(true);
    expect(shouldCollectFinalResult(0, 1)).toBe(false);
    expect(shouldCollectFinalResult(0, 2)).toBe(true);
    expect(() => shouldCollectFinalResult(Number.NaN, 1)).toThrow(/finite/);
    expect(() => shouldCollectFinalResult(0, -1)).toThrow(/non-negative/);
  });
});
