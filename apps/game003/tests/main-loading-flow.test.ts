import { describe, expect, it, vi } from "vitest";

const mainMocks = vi.hoisted(() => ({
  createGameLoading: vi.fn(),
  createGame003LoadingResources: vi.fn(),
  readGame003RuntimeModule: vi.fn(),
}));

interface CapturedLoadingOptions {
  onBeforeComplete(options: {
    readonly loadedResources: ReadonlyMap<string, unknown>;
  }): Promise<unknown>;
  onEnterGame(options: { readonly prepareResult: unknown }): Promise<void>;
}

vi.mock("@slotclientengine/gameloading", () => ({
  createGameLoading: mainMocks.createGameLoading,
}));

vi.mock("../src/loading-resources.js", () => ({
  createGame003LoadingResources: mainMocks.createGame003LoadingResources,
  readGame003RuntimeModule: mainMocks.readGame003RuntimeModule,
}));

describe("game003 main loading host flow", () => {
  it("keeps loading and game hosts separate until the runtime enters", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const loadingHandle = {
      loadedResources: new Map<string, unknown>(),
      start: vi.fn(async () => undefined),
      destroy: vi.fn(),
    };
    let loadingOptions: CapturedLoadingOptions | undefined;
    mainMocks.createGameLoading.mockImplementation((options) => {
      loadingOptions = options;
      return loadingHandle;
    });
    mainMocks.createGame003LoadingResources.mockReturnValue([
      { id: "runtime", load: vi.fn() },
    ]);
    const prepared = { liveSession: { disconnect: vi.fn() } };
    const runtimeModule = {
      prepareGame003At99: vi.fn(async () => prepared),
      enterGame003: vi.fn(async () => ({ destroy: vi.fn() })),
    };
    mainMocks.readGame003RuntimeModule.mockReturnValue(runtimeModule);

    await import("../src/main.js");
    const capturedLoadingOptions = requireLoadingOptions(loadingOptions);

    const root = document.getElementById("app");
    const loadingHost = root?.querySelector(".game003-loading-host");
    const gameHost = root?.querySelector(
      ".game003-game-host",
    ) as HTMLElement | null;
    expect(loadingHost).not.toBeNull();
    expect(gameHost?.hidden).toBe(true);
    expect(loadingHandle.start).toHaveBeenCalled();

    const prepareResult = await capturedLoadingOptions.onBeforeComplete({
      loadedResources: new Map(),
    });
    await capturedLoadingOptions.onEnterGame({ prepareResult });

    expect(runtimeModule.prepareGame003At99).toHaveBeenCalledWith({
      search: "",
    });
    expect(runtimeModule.enterGame003).toHaveBeenCalledWith({
      root: gameHost,
      prepared,
    });
    expect(gameHost?.hidden).toBe(false);
    expect(loadingHandle.destroy).toHaveBeenCalled();
    expect(root?.querySelector(".game003-loading-host")).toBeNull();
  });
});

function requireLoadingOptions(
  options: CapturedLoadingOptions | undefined,
): CapturedLoadingOptions {
  if (!options) {
    throw new Error("createGameLoading was not called.");
  }
  return options;
}
