import {
  createLeoGameLoadingUi,
  createLeoProgressStyles,
  normalizeLeoProgress,
} from "../src/index.js";

describe("Leo loading UI exports", () => {
  it("exports its public factory and progress utilities", () => {
    expect(createLeoGameLoadingUi).toBeTypeOf("function");
    expect(createLeoProgressStyles).toBeTypeOf("function");
    expect(normalizeLeoProgress).toBeTypeOf("function");
  });
});
