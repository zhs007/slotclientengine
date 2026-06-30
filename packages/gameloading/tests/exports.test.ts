import {
  createGameLoading,
  inferGameLoadingResourceKind,
  loadDefaultGameLoadingResource,
  type GameLoadingResource,
} from "../src/index.js";

describe("gameloading exports", () => {
  it("exports the public root API", () => {
    const resource: GameLoadingResource = {
      id: "style",
      url: "/style.css",
    };

    expect(createGameLoading).toBeTypeOf("function");
    expect(loadDefaultGameLoadingResource).toBeTypeOf("function");
    expect(inferGameLoadingResourceKind(resource)).toBe("style");
  });
});
