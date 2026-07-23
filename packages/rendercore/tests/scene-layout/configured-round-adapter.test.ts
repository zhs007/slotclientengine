import { describe, expect, it, vi } from "vitest";
import type { GameLogic, SceneMatrix } from "@slotclientengine/logiccore";
import { Container, type Application } from "pixi.js";
import {
  createConfiguredSceneLayoutRoundAdapter,
  parseSlotTemplatePresentationProfile,
  type SceneLayoutPackageResource,
  type SceneLayoutPackageRuntime,
} from "../../src/scene-layout/index.js";
import { parseSymbolStateTextureManifest } from "../../src/symbol/index.js";

const initialScene: SceneMatrix = [
  [1, 2],
  [3, 4],
];
const refillScene: SceneMatrix = [
  [4, 2],
  [3, 4],
];

function createResource() {
  const destroy = vi.fn();
  const resource = {
    manifest: {
      version: 1,
      kind: "scene-layout",
      id: "adapter-fixture",
      adaptation: {
        mode: "maximized-focus",
        artSize: { width: 100, height: 100 },
        focusRect: { x: 0, y: 0, width: 100, height: 100 },
        backgroundNode: "background",
      },
      nodes: [],
      reels: {
        main: {
          columns: 2,
          rows: 2,
          cellSize: { width: 10, height: 10 },
          gap: { x: 0, y: 0 },
          placements: { default: { x: 0, y: 0 } },
        },
      },
      symbolPackage: {
        manifest: "dependencies/symbols/fixture/symbols.package.json",
        reel: "main",
        reelSet: "public-reels",
        renderMode: "standard",
      },
    },
    symbolPackage: {
      displaySymbols: ["S1", "S2", "S3", "S4"],
      gameConfig: {
        getSymbolCode: (symbol: string) =>
          ({ S1: 1, S2: 2, S3: 3, S4: 4 })[symbol as "S1"],
      },
      statePreset: { defaultState: "normal" },
      symbolManifest: {
        symbols: Object.fromEntries(
          ["S1", "S2", "S3", "S4"].map((symbol) => [
            symbol,
            { states: {}, animations: { win: {}, remove: {} } },
          ]),
        ),
      },
    },
    symbolPackages: {},
    destroy,
  } as unknown as SceneLayoutPackageResource;
  return { resource, destroy };
}

const roundFlow = {
  kind: "slot-round-flow",
  version: 1,
  components: { spin: "spin", wins: ["wins"] },
  amount: { cashFields: ["cashWin64", "cashWin"], cashUnit: "cents" },
  cascade: {
    kind: "cascade",
    version: 1,
    components: {
      remove: "remove",
      dropdown: "dropdown",
      refill: "refill",
    },
    symbols: {
      emptyCode: -1,
      removeExcludedSymbols: [],
      dropHeldSymbols: [],
      valueSymbols: [],
      sequentialWinCompanionSymbols: [],
    },
    amount: { cashFields: ["cashWin64", "cashWin"], cashUnit: "cents" },
  },
} as const;

const presentation = parseSlotTemplatePresentationProfile({
  reel: {
    kind: "standard",
    version: 1,
    direction: "forward",
    speedSymbolsPerSecond: 20,
    minimumSpinCycles: 3,
    baseDurationMs: 800,
    startDelayMs: 50,
    stopDelayMs: 100,
    bounceStrength: 0,
  },
  flow: {
    version: 1,
    symbolStates: { normal: "normal", win: "win", remove: "remove" },
    dimmingAlpha: 0.5,
    popup: { enabled: false },
    cascade: {
      emphasisFadeInMs: 100,
      emphasisHoldMs: 1000,
      emphasisFadeOutMs: 100,
      baseFallSeconds: 0.2,
      perRowFallSeconds: 0.05,
      maxFallSeconds: 1,
      settleSeconds: 0.1,
    },
  },
});

const collectPresentation = parseSlotTemplatePresentationProfile({
  reel: presentation.reel,
  flow: {
    ...presentation.flow,
    version: 2,
    collect: {
      startPresentationsWithEmphasis: true,
      formatter: { kind: "decimal-cents", prefix: "$" },
      itemOrder: "row-major",
      amountText: {
        yOffsetRatioFromCellCenter: 0.22,
        fontSize: 38,
        fill: "#fff",
        stroke: "#000",
        strokeWidth: 5,
      },
      summary: {
        countDurationSeconds: 0.01,
        startIntervalSeconds: 0.01,
        position: { x: 10, y: 25 },
        textStyle: {
          fontSize: 48,
          fontWeight: 900,
          fill: "#fff",
          stroke: "#000",
          strokeWidth: 6,
        },
      },
    },
  },
});

function createCollectManifest() {
  const animation = (name: string, loop: boolean) => ({
    kind: "spine",
    skeleton: "./fixture.json",
    atlas: "./fixture.atlas",
    texture: "./fixture.png",
    playback: { mode: "animation", animationName: name, loop },
  });
  const raw = {
    version: 1,
    states: [],
    settings: {
      additionalStateDefinitions: [
        { id: "winStart", phase: "once", playback: "once" },
        { id: "winLoop", phase: "stable", playback: "loop" },
        { id: "collect", phase: "once", playback: "once" },
      ],
    },
    symbols: {
      S1: {
        normal: "./S1.png",
        animations: {
          winStart: animation("Win_Start", false),
          winLoop: animation("Win", true),
          collect: animation("Collect", false),
          remove: animation("End", false),
        },
        cascadeWinPresentation: {
          order: 1,
          playback: {
            mode: "sequentialCollect",
            startState: "winStart",
            loopState: "winLoop",
            collectState: "collect",
            removeState: "remove",
          },
          summary: { mode: "itemAmount" },
        },
      },
      ...Object.fromEntries(
        ["S2", "S3", "S4"].map((symbol) => [
          symbol,
          {
            normal: `./${symbol}.png`,
            animations: {
              win: animation("Win", false),
              remove: animation("Remove", false),
            },
            cascadeWinPresentation: {
              order: 0,
              playback: {
                mode: "group",
                winState: "win",
                removeState: "remove",
              },
              summary: { mode: "groupAmount" },
            },
          },
        ]),
      ),
    },
  };
  return { raw, parsed: parseSymbolStateTextureManifest(raw) };
}

function createLogic(options?: {
  readonly spinScenes?: readonly SceneMatrix[];
  readonly winPositions?: readonly number[];
  readonly refillScenes?: readonly SceneMatrix[];
  readonly includeWin?: boolean;
  readonly resultSymbol?: number;
  readonly coinWin?: number;
  readonly valueScenes?: readonly (readonly (readonly number[])[])[];
}): GameLogic {
  const includeWin = options?.includeWin !== false;
  const removed: SceneMatrix = [
    [-1, 2],
    [3, 4],
  ];
  const makeStep = (
    index: number,
    scenes: Readonly<Record<string, readonly SceneMatrix[]>>,
  ) => ({
    getIndex: () => index,
    hasComponent: (name: string) =>
      Boolean(scenes[name]) || (index === 0 && includeWin && name === "wins"),
    getComponent: (name: string) => {
      if (index === 1 && name === "refill")
        return {
          hasBasicComponentData: true,
          basicComponentData: { pos: [0, 0] },
          usedResultIndexes: [],
        };
      if (scenes[name] || (index === 0 && includeWin && name === "wins"))
        return {
          hasBasicComponentData: true,
          basicComponentData: {},
          usedResultIndexes:
            index === 0 && name === "wins" && includeWin ? [0] : [],
        };
      return undefined;
    },
    getComponentScenes: (name: string) => scenes[name] ?? [],
    getComponentOtherScenes: (name: string) =>
      name === "values" && index === 0 ? (options?.valueScenes ?? []) : [],
    getComponentResults: (name: string) =>
      index === 0 && name === "wins" && includeWin
        ? [
            {
              pos: options?.winPositions ?? [0, 0],
              cashWin: 100,
              ...(options?.resultSymbol === undefined
                ? {}
                : { symbol: options.resultSymbol }),
              ...(options?.coinWin === undefined
                ? {}
                : { coinWin: options.coinWin }),
            },
          ]
        : [],
    getResult: () => ({
      pos: options?.winPositions ?? [0, 0],
      cashWin: 100,
      ...(options?.resultSymbol === undefined
        ? {}
        : { symbol: options.resultSymbol }),
      ...(options?.coinWin === undefined ? {} : { coinWin: options.coinWin }),
    }),
  });
  const step0 = makeStep(0, {
    spin: options?.spinScenes ?? [initialScene],
    ...(includeWin ? { remove: [removed] } : {}),
  });
  const step1 = makeStep(1, {
    dropdown: [removed],
    refill: options?.refillScenes ?? [refillScene],
  });
  return {
    getSteps: () => (includeWin ? [step0, step1] : [step0]),
  } as unknown as GameLogic;
}

function createHarness() {
  let tick: (() => void) | null = null;
  const canvas = {} as HTMLCanvasElement;
  const app = {
    canvas,
    init: vi.fn().mockResolvedValue(undefined),
    ticker: {
      deltaMS: 1200,
      add: vi.fn((listener: () => void) => {
        tick = listener;
      }),
      remove: vi.fn(),
    },
    stage: { addChild: vi.fn() },
    renderer: {
      width: 320,
      height: 180,
      resize: vi.fn(),
    },
    destroy: vi.fn(),
  } as unknown as Application;
  let spinning = true;
  let once = false;
  let currentScene: SceneMatrix = initialScene;
  let currentValues: readonly (readonly (number | null | -1)[])[] =
    initialScene.map((column) => column.map(() => null));
  const releasePositions = (
    positions: readonly { readonly x: number; readonly y: number }[],
  ) => {
    const removed = new Set(positions.map(({ x, y }) => `${x},${y}`));
    currentScene = currentScene.map((column, x) =>
      column.map((code, y) => (removed.has(`${x},${y}`) ? -1 : code)),
    );
    currentValues = currentValues.map((column, x) =>
      column.map((value, y) => (removed.has(`${x},${y}`) ? -1 : value)),
    );
  };
  const presentationStates = new Map<
    string,
    { state: string; updateCount: number }
  >();
  const requestVisibleSymbolStates = vi.fn(
    (
      positions: readonly { readonly x: number; readonly y: number }[],
      state: string,
    ) => {
      for (const { x, y } of positions)
        presentationStates.set(`${x},${y}`, { state, updateCount: 0 });
    },
  );
  const updatePresentation = vi.fn(() => {
    for (const [key, current] of presentationStates) {
      if (
        ["winStart", "win", "collect", "remove"].includes(current.state) &&
        current.updateCount >= 1
      )
        presentationStates.set(key, { state: "normal", updateCount: 0 });
      else current.updateCount += 1;
    }
  });
  const reelPresentation = Object.assign(new Container(), {
    requestVisibleSymbolStates,
    getVisibleSymbolStateSnapshots: vi.fn(
      (positions: readonly { readonly x: number; readonly y: number }[]) =>
        positions.map(({ x, y }) => {
          const state = presentationStates.get(`${x},${y}`)?.state ?? "normal";
          return {
            x,
            y,
            code: currentScene[x]?.[y] ?? -1,
            kind: "textured",
            requestedState: state,
            resolvedState: state,
            isOnce: state !== "normal" && state !== "winLoop",
          };
        }),
    ),
    getVisibleSymbolGeometrySnapshots: vi.fn(
      (positions: readonly { readonly x: number; readonly y: number }[]) =>
        positions.map(({ x, y }) => ({
          x,
          y,
          code: currentScene[x]?.[y] ?? -1,
          kind: "textured",
          centerX: x * 10 + 5,
          centerY: y * 10 + 5,
          cellWidth: 10,
          cellHeight: 10,
        })),
    ),
    hasVisibleSymbolStateCapability: vi.fn(() => true),
    releaseVisibleSymbols: vi.fn(releasePositions),
    setVisibleSymbolDimming: vi.fn(),
    clearVisibleSymbolDimming: vi.fn(),
    update: updatePresentation,
  });
  const runtimeContainer = new Container();
  const runtime = {
    container: runtimeContainer,
    init: vi.fn().mockResolvedValue(undefined),
    update: vi.fn(),
    applyViewport: vi.fn(),
    spinMainReelToScene: vi.fn(
      (input: {
        scene: SceneMatrix;
        presentationValues?: readonly (readonly (number | null)[])[];
      }) => {
        currentScene = input.scene;
        if (input.presentationValues) currentValues = input.presentationValues;
      },
    ),
    isMainReelSpinning: vi.fn(() => spinning),
    requestMainReelSymbolStates: vi.fn(),
    getMainReelSymbolStateSnapshots: vi.fn(() => [{ isOnce: once }]),
    hasMainReelSymbolStateCapability: vi.fn(() => true),
    getMainReelSceneSnapshot: vi.fn(() => currentScene),
    getMainReelCascadeValues: vi.fn(() => currentValues),
    setMainReelSymbolDimming: vi.fn(),
    clearMainReelSymbolDimming: vi.fn(),
    releaseMainReelSymbols: vi.fn(releasePositions),
    startMainReelCascadeDrop: vi.fn(
      (plan: {
        targetScene: SceneMatrix;
        targetValues: readonly (readonly (number | null | -1)[])[];
      }) => {
        currentScene = plan.targetScene;
        currentValues = plan.targetValues;
        spinning = false;
      },
    ),
    startAwardCelebrationForCurrentMode: vi.fn(),
    dismissActiveAwardCelebrationImmediately: vi.fn(),
    getReelPresentation: vi.fn(() => reelPresentation),
    destroy: vi.fn(),
  } as unknown as SceneLayoutPackageRuntime;
  const gameLayer = {
    replaceChildren: vi.fn(),
  } as unknown as HTMLElement;
  const viewportListeners: Array<
    (viewport: {
      readonly frameDesignSize: {
        readonly width: number;
        readonly height: number;
      };
    }) => void
  > = [];
  const unsubscribe = vi.fn();
  const context = {
    gameLayer,
    getViewport: () => ({
      frameDesignSize: { width: 320, height: 180 },
    }),
    onViewportChange: (listener: (typeof viewportListeners)[number]) => {
      viewportListeners.push(listener);
      return unsubscribe;
    },
  };
  return {
    app,
    runtime,
    reelPresentation,
    context,
    unsubscribe,
    viewportListeners,
    setSpinning(value: boolean) {
      spinning = value;
    },
    setOnce(value: boolean) {
      once = value;
    },
    runTick() {
      if (!tick) throw new Error("Ticker listener was not installed.");
      tick();
    },
  };
}

describe("configured scene-layout round adapter", () => {
  it("mounts, applies the initial scene, and drains spin/win/refill in order", async () => {
    const { resource, destroy } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      random: () => 0.25,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });

    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    harness.viewportListeners[0]({
      frameDesignSize: { width: 640, height: 360 },
    });
    const round = adapter.playSpin(createLogic());
    harness.runTick();
    harness.setSpinning(false);
    harness.runTick();
    harness.setOnce(true);
    harness.runTick();
    harness.setOnce(false);
    for (let index = 0; index < 50; index += 1) harness.runTick();
    expect(harness.runtime.requestMainReelSymbolStates).toHaveBeenCalledTimes(
      2,
    );
    expect(harness.runtime.releaseMainReelSymbols).toHaveBeenCalledOnce();
    expect(harness.runtime.startMainReelCascadeDrop).toHaveBeenCalledTimes(2);
    await round;

    expect(harness.runtime.spinMainReelToScene).toHaveBeenCalledOnce();
    expect(harness.runtime.requestMainReelSymbolStates).toHaveBeenCalledWith(
      [{ x: 0, y: 0 }],
      "win",
    );
    expect(harness.runtime.releaseMainReelSymbols).toHaveBeenCalledWith([
      { x: 0, y: 0 },
    ]);
    expect(harness.runtime.startMainReelCascadeDrop).toHaveBeenCalledTimes(2);
    expect(harness.runtime.getMainReelSceneSnapshot()).toEqual(refillScene);
    expect(harness.app.renderer.resize).toHaveBeenCalledWith(640, 360);

    adapter.destroy();
    adapter.destroy();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.runtime.destroy).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
    harness.viewportListeners[0]({
      frameDesignSize: { width: 800, height: 600 },
    });
    harness.runTick();
  });

  it("drains manifest-owned sequential collect and companion before real cascade", async () => {
    const { resource } = createResource();
    const manifest = createCollectManifest();
    const symbolResource = resource.symbolPackage as unknown as {
      rawSymbolManifest: unknown;
      symbolManifest: ReturnType<typeof parseSymbolStateTextureManifest>;
      gameConfig: {
        getSymbolCode(symbol: string): number | undefined;
        getPaytableEntry(code: number): { symbol: string } | undefined;
      };
    };
    symbolResource.rawSymbolManifest = manifest.raw;
    symbolResource.symbolManifest = manifest.parsed;
    symbolResource.gameConfig.getPaytableEntry = (code) => {
      const symbol = ["", "S1", "S2", "S3", "S4"][code];
      return symbol ? { symbol } : undefined;
    };
    const collectFlow = {
      ...roundFlow,
      components: {
        ...roundFlow.components,
        valueUpdates: ["values"],
      },
      cascade: {
        ...roundFlow.cascade,
        symbols: {
          ...roundFlow.cascade.symbols,
          removeExcludedSymbols: ["S2"],
          dropHeldSymbols: ["S2"],
          valueSymbols: ["S1"],
          sequentialWinCompanionSymbols: ["S2"],
        },
        amount: {
          cashFields: ["cashWin64", "cashWin"],
          coinFields: ["coinWin64", "coinWin"],
          cashUnit: "cents",
        },
      },
    } as const;
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow: collectFlow,
      presentation: collectPresentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    const round = adapter.playSpin(
      createLogic({
        winPositions: [0, 0, 0, 1],
        resultSymbol: 1,
        coinWin: 10,
        valueScenes: [
          [
            [10, 0],
            [0, 0],
          ],
        ],
      }),
    );
    harness.setSpinning(false);
    for (let index = 0; index < 100; index += 1) harness.runTick();
    await round;
    const requested = harness.reelPresentation.requestVisibleSymbolStates.mock
      .calls as unknown as readonly [readonly unknown[], string][];
    expect(requested.map(([, state]) => state)).toEqual(
      expect.arrayContaining(["winStart", "win", "collect", "remove"]),
    );
    expect(harness.reelPresentation.releaseVisibleSymbols).toHaveBeenCalledWith(
      [{ x: 0, y: 0 }],
    );
    expect(harness.runtime.startMainReelCascadeDrop).toHaveBeenCalledTimes(2);
    expect(harness.runtime.getMainReelSceneSnapshot()).toEqual(refillScene);
    adapter.destroy();
  });

  it("rejects lifecycle misuse before mutating runtime state", async () => {
    const { resource, destroy } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });

    await expect(adapter.playSpin(createLogic())).rejects.toThrow(
      /no initial scene/,
    );
    await expect(adapter.applyInitialState({})).rejects.toThrow(
      /requires live userInfo.defaultScene/,
    );
    await expect(
      adapter.applyInitialState({ defaultScene: initialScene }),
    ).rejects.toThrow(/not mounted/);
    await adapter.mount(harness.context);
    await expect(adapter.mount(harness.context)).rejects.toThrow(
      /already mounted/,
    );
    adapter.destroy();
    await expect(adapter.mount(harness.context)).rejects.toThrow(/destroyed/);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("rejects invalid compiled rounds and concurrent play", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      random: () => 0.5,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });

    await expect(
      adapter.playSpin(createLogic({ spinScenes: [] })),
    ).rejects.toThrow(/exactly one scene/);
    await expect(
      adapter.playSpin(
        createLogic({ spinScenes: [initialScene, refillScene] }),
      ),
    ).rejects.toThrow(/received 2/);
    await expect(
      adapter.playSpin(createLogic({ spinScenes: [[[1, 2]]] })),
    ).rejects.toThrow(/must contain 2 columns/);
    await expect(
      adapter.playSpin(
        createLogic({
          spinScenes: [[[1], [2]]],
        }),
      ),
    ).rejects.toThrow(/must contain 2 rows/);
    await expect(
      adapter.playSpin(createLogic({ winPositions: [2, 0] })),
    ).rejects.toThrow(/out of scene bounds/);
    await expect(
      adapter.playSpin(
        createLogic({ refillScenes: [initialScene, refillScene] }),
      ),
    ).rejects.toThrow(/exactly one scene/);

    const activeRound = adapter.playSpin(createLogic());
    await expect(adapter.playSpin(createLogic())).rejects.toThrow(
      /already in progress/,
    );
    adapter.destroy();
    await expect(activeRound).rejects.toThrow(/destroyed/);
  });

  it("rejects a plan-specific symbol capability before spin mutation", async () => {
    const { resource } = createResource();
    const symbolResource = resource.symbolPackage as unknown as {
      symbolManifest: {
        symbols: Record<
          string,
          {
            states: Record<string, unknown>;
            animations: Record<string, unknown>;
          }
        >;
      };
    };
    delete symbolResource.symbolManifest.symbols.S1.animations.win;
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });

    await expect(adapter.playSpin(createLogic())).rejects.toThrow(
      /S1.*no explicit "win"/,
    );
    expect(harness.runtime.spinMainReelToScene).not.toHaveBeenCalled();
    expect(harness.runtime.clearMainReelSymbolDimming).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it("completes a non-cascade round with no win results", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow: {
        kind: "slot-round-flow",
        version: 1,
        components: { spin: "spin", wins: ["wins"] },
        amount: {
          cashFields: ["cashWin64", "cashWin"],
          cashUnit: "cents",
        },
      },
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    const round = adapter.playSpin(createLogic({ includeWin: false }));
    harness.setSpinning(false);
    harness.runTick();
    await round;
    expect(harness.runtime.requestMainReelSymbolStates).not.toHaveBeenCalled();
    expect(harness.runtime.startMainReelCascadeDrop).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it("starts an enabled award popup only after round completion", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    const popupPresentation = parseSlotTemplatePresentationProfile({
      reel: {
        kind: "standard",
        version: 1,
        direction: "forward",
        speedSymbolsPerSecond: 20,
        minimumSpinCycles: 3,
        baseDurationMs: 800,
        startDelayMs: 50,
        stopDelayMs: 100,
        bounceStrength: 0,
      },
      flow: {
        version: 1,
        symbolStates: { normal: "normal", win: "win", remove: "remove" },
        dimmingAlpha: 0.5,
        popup: { enabled: true },
        cascade: {
          emphasisFadeInMs: 100,
          emphasisHoldMs: 1000,
          emphasisFadeOutMs: 100,
          baseFallSeconds: 0.2,
          perRowFallSeconds: 0.05,
          maxFallSeconds: 1,
          settleSeconds: 0.1,
        },
      },
    });
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow: {
        kind: "slot-round-flow",
        version: 1,
        components: { spin: "spin", wins: ["wins"] },
        amount: {
          cashFields: ["cashWin64", "cashWin"],
          cashUnit: "cents",
        },
      },
      presentation: popupPresentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    const logic = Object.assign(createLogic({ includeWin: false }), {
      getTotalWin: () => 200,
      getBet: () => 10,
      getLines: () => 30,
    });
    const round = adapter.playSpin(logic);
    expect(
      harness.runtime.startAwardCelebrationForCurrentMode,
    ).not.toHaveBeenCalled();
    harness.setSpinning(false);
    harness.runTick();
    await round;
    expect(
      harness.runtime.startAwardCelebrationForCurrentMode,
    ).toHaveBeenCalledWith({
      betAmountRaw: 300,
      winAmountRaw: 200,
    });
    adapter.destroy();
  });

  it("fails when a settled cascade snapshot diverges from the compiled plan", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    (
      harness.runtime.startMainReelCascadeDrop as unknown as ReturnType<
        typeof vi.fn
      >
    ).mockImplementation(() => undefined);
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    const round = adapter.playSpin(createLogic());
    harness.setSpinning(false);
    for (let index = 0; index < 50; index += 1) harness.runTick();
    await expect(round).rejects.toThrow(
      /refill scene does not match compiled plan/,
    );
    adapter.destroy();
  });

  it("resolves the initial-mode symbol package and rejects a missing binding", async () => {
    const { resource } = createResource();
    const directSymbolResource = resource.symbolPackage;
    Object.assign(resource, {
      symbolPackage: undefined,
      symbolPackages: { modeSymbols: directSymbolResource },
    });
    Object.assign(resource.manifest, {
      symbolPackage: undefined,
      gameModes: {
        initialMode: "base",
        modes: [{ id: "base", symbolPackage: "modeSymbols" }],
      },
    });
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    adapter.destroy();

    const { resource: missingResource } = createResource();
    Object.assign(missingResource, {
      symbolPackage: undefined,
      symbolPackages: {},
    });
    Object.assign(missingResource.manifest, {
      symbolPackage: undefined,
      gameModes: {
        initialMode: "base",
        modes: [{ id: "base", symbolPackage: "missing" }],
      },
    });
    const missingHarness = createHarness();
    const missingAdapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: missingResource,
      roundFlow,
      presentation,
      applicationFactory: () => missingHarness.app,
      runtimeFactory: () => missingHarness.runtime,
    });
    await missingAdapter.mount(missingHarness.context);
    await expect(
      missingAdapter.applyInitialState({ defaultScene: initialScene }),
    ).rejects.toThrow(/no active symbol package resource/);
    missingAdapter.destroy();
  });

  it("rejects an active display symbol without a numeric code", async () => {
    const { resource } = createResource();
    const symbolResource = resource.symbolPackage as unknown as {
      displaySymbols: string[];
    };
    symbolResource.displaySymbols = [...symbolResource.displaySymbols, "BAD"];
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    await expect(adapter.playSpin(createLogic())).rejects.toThrow(
      /no code for "BAD"/,
    );
    expect(harness.runtime.spinMainReelToScene).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it("accepts explicit state-texture and value-reel-state capabilities", async () => {
    for (const capability of ["state", "value-state"] as const) {
      const { resource } = createResource();
      const symbol = (
        resource.symbolPackage as unknown as {
          symbolManifest: {
            symbols: Record<
              string,
              {
                states: Record<string, unknown>;
                animations: Record<string, unknown>;
                valuePresentation?: {
                  reelStates: { states: Record<string, unknown> };
                };
              }
            >;
          };
        }
      ).symbolManifest.symbols.S1;
      delete symbol.animations.win;
      if (capability === "state") symbol.states.win = {};
      else
        symbol.valuePresentation = {
          reelStates: { states: { win: {} } },
        };
      const harness = createHarness();
      const adapter = createConfiguredSceneLayoutRoundAdapter({
        packageResource: resource,
        roundFlow,
        presentation,
        applicationFactory: () => harness.app,
        runtimeFactory: () => harness.runtime,
      });
      await adapter.mount(harness.context);
      await adapter.applyInitialState({ defaultScene: initialScene });
      const round = adapter.playSpin(createLogic());
      expect(harness.runtime.spinMainReelToScene).toHaveBeenCalledOnce();
      adapter.destroy();
      await expect(round).rejects.toThrow(/destroyed/);
    }
  });

  it("accepts the package default state as an explicit capability", async () => {
    const { resource } = createResource();
    const defaultStatePresentation = parseSlotTemplatePresentationProfile({
      reel: {
        kind: "standard",
        version: 1,
        direction: "forward",
        speedSymbolsPerSecond: 20,
        minimumSpinCycles: 3,
        baseDurationMs: 800,
        startDelayMs: 50,
        stopDelayMs: 100,
        bounceStrength: 0,
      },
      flow: {
        version: 1,
        symbolStates: {
          normal: "normal",
          win: "normal",
          remove: "normal",
        },
        dimmingAlpha: 0.5,
        popup: { enabled: false },
        cascade: {
          emphasisFadeInMs: 100,
          emphasisHoldMs: 1000,
          emphasisFadeOutMs: 100,
          baseFallSeconds: 0.2,
          perRowFallSeconds: 0.05,
          maxFallSeconds: 1,
          settleSeconds: 0.1,
        },
      },
    });
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation: defaultStatePresentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    const round = adapter.playSpin(createLogic());
    expect(harness.runtime.spinMainReelToScene).toHaveBeenCalledOnce();
    adapter.destroy();
    await expect(round).rejects.toThrow(/destroyed/);
  });

  it("rejects an unknown planned symbol and missing reel geometry", async () => {
    const { resource } = createResource();
    const symbols = (
      resource.symbolPackage as unknown as {
        symbolManifest: { symbols: Record<string, unknown> };
      }
    ).symbolManifest.symbols;
    delete symbols.S1;
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    await expect(adapter.playSpin(createLogic())).rejects.toThrow(
      /unknown symbol "S1"/,
    );
    adapter.destroy();

    const { resource: geometryResource } = createResource();
    const geometryHarness = createHarness();
    const geometryAdapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: geometryResource,
      roundFlow,
      presentation,
      applicationFactory: () => geometryHarness.app,
      runtimeFactory: () => geometryHarness.runtime,
    });
    await geometryAdapter.mount(geometryHarness.context);
    await geometryAdapter.applyInitialState({ defaultScene: initialScene });
    Object.assign(geometryResource.manifest.reels, { main: undefined });
    await expect(geometryAdapter.playSpin(createLogic())).rejects.toThrow(
      /no reels.main/,
    );
    geometryAdapter.destroy();
  });

  it("destroys a partially initialized runtime when initialization fails", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    (
      harness.runtime.init as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValue("runtime-init-failure");
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      random: () => 0,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);

    await expect(
      adapter.applyInitialState({ defaultScene: initialScene }),
    ).rejects.toThrow(/runtime-init-failure/);
    expect(harness.runtime.destroy).toHaveBeenCalledOnce();
    adapter.destroy();
  });

  it("rejects the active round when a frame update fails", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    (
      harness.runtime.update as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(() => {
      throw new Error("frame-update-failure");
    });
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      random: () => 0,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });

    const round = adapter.playSpin(createLogic());
    harness.runTick();
    await expect(round).rejects.toThrow(/frame-update-failure/);
    adapter.destroy();
  });

  it("fails explicitly when default phase randomization lacks Web Crypto", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", undefined);
    try {
      await expect(
        adapter.applyInitialState({ defaultScene: initialScene }),
      ).rejects.toThrow(/Web Crypto getRandomValues/);
    } finally {
      vi.stubGlobal("crypto", originalCrypto);
      adapter.destroy();
    }
  });
});
