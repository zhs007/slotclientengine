import { createSimpleGameLoadingUi } from "../src/index.js";

describe("simple loading UI exports", () => {
  it("exports its public factory", () => {
    expect(createSimpleGameLoadingUi).toBeTypeOf("function");
    expect(createSimpleGameLoadingUi().create).toBeTypeOf("function");
  });
});
