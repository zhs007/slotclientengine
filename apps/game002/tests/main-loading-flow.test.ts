import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mainMocks = vi.hoisted(() => ({
  createGameLoading: vi.fn(),
  createLeoGameLoadingUi: vi.fn(() => ({ create: vi.fn() })),
  createGame002LoadingResources: vi.fn(),
  readGame002RuntimeModule: vi.fn(),
}));

interface CapturedLoadingOptions {
  readonly maxConcurrentResources?: number;
  readonly ui?: unknown;
  onBeforeComplete(options: {
    readonly loadedResources: ReadonlyMap<string, unknown>;
  }): Promise<unknown>;
  onEnterGame(options: { readonly prepareResult: any }): Promise<void>;
}

vi.mock("@slotclientengine/gameloading", () => ({
  createGameLoading: mainMocks.createGameLoading,
}));

vi.mock("@slotclientengine/gameloading-ui-leo", () => ({
  createLeoGameLoadingUi: mainMocks.createLeoGameLoadingUi,
}));

vi.mock("../src/loading-resources.js", () => ({
  createGame002LoadingResources: mainMocks.createGame002LoadingResources,
  readGame002RuntimeModule: mainMocks.readGame002RuntimeModule,
}));

describe("game002 main loading host flow", () => {
  it("keeps loading and game hosts at full page size", () => {
    const styles = readFileSync(
      resolve(__dirname, "../src/styles.css"),
      "utf8",
    );

    expect(styles).toMatch(
      /\.game002-loading-host,\s*\.game002-game-host\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/,
    );
    expect(styles).toMatch(
      /\.game002-game-host\[hidden\]\s*\{[\s\S]*?display:\s*none;/,
    );
  });

  it("does not show or enter the game before the 99/100 percent callbacks", async () => {
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
    mainMocks.createGame002LoadingResources.mockReturnValue([
      { id: "runtime", load: vi.fn() },
    ]);
    const prepared = { liveSession: { disconnect: vi.fn() } };
    const entered = { destroy: vi.fn() };
    const runtimeModule = {
      prepareGame002At99: vi.fn(async () => prepared),
      enterGame002: vi.fn(async () => entered),
    };
    mainMocks.readGame002RuntimeModule.mockReturnValue(runtimeModule);

    await import("../src/main.js");
    const captured = requireLoadingOptions(loadingOptions);
    const root = document.getElementById("app");
    const loadingHost = root?.querySelector(".game002-loading-host");
    const gameHost = root?.querySelector(".game002-game-host") as HTMLElement;

    expect(loadingHost).not.toBeNull();
    expect(gameHost.hidden).toBe(true);
    expect(runtimeModule.prepareGame002At99).not.toHaveBeenCalled();
    expect(runtimeModule.enterGame002).not.toHaveBeenCalled();
    expect(captured.maxConcurrentResources).toBe(4);
    expect(mainMocks.createLeoGameLoadingUi).toHaveBeenCalledOnce();
    expect(captured.ui).toBeDefined();
    expect(loadingHandle.start).toHaveBeenCalledOnce();

    const prepareResult = await captured.onBeforeComplete({
      loadedResources: new Map(),
    });
    expect(runtimeModule.prepareGame002At99).toHaveBeenCalledWith({
      search: "",
    });
    expect(runtimeModule.enterGame002).not.toHaveBeenCalled();

    await captured.onEnterGame({ prepareResult });
    expect(runtimeModule.enterGame002).toHaveBeenCalledWith({
      root: gameHost,
      prepared,
    });
    expect(gameHost.hidden).toBe(false);
    expect(loadingHandle.destroy).not.toHaveBeenCalled();
    expect(root?.querySelector(".game002-loading-host")).not.toBeNull();

    window.dispatchEvent(new Event("beforeunload"));
    expect(loadingHandle.destroy).toHaveBeenCalledOnce();
    expect(entered.destroy).toHaveBeenCalledOnce();
  });

  it("rehides and clears the game host when enter fails", async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    let loadingOptions: CapturedLoadingOptions | undefined;
    mainMocks.createGameLoading.mockImplementation((options) => {
      loadingOptions = options;
      return {
        loadedResources: new Map(),
        start: vi.fn(async () => undefined),
        destroy: vi.fn(),
      };
    });
    mainMocks.createGame002LoadingResources.mockReturnValue([
      { id: "runtime", load: vi.fn() },
    ]);
    mainMocks.readGame002RuntimeModule.mockReturnValue({
      prepareGame002At99: vi.fn(async () => ({})),
      enterGame002: vi.fn(async () => {
        throw new Error("enter failed");
      }),
    });
    await import("../src/main.js");
    const captured = requireLoadingOptions(loadingOptions);
    const gameHost = document.querySelector(
      ".game002-game-host",
    ) as HTMLElement;
    await expect(
      captured.onEnterGame({
        prepareResult: {
          runtimeModule: mainMocks.readGame002RuntimeModule(),
          prepared: {},
        },
      }),
    ).rejects.toThrow(/enter failed/);
    expect(gameHost.hidden).toBe(true);
    expect(gameHost.childElementCount).toBe(0);
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
