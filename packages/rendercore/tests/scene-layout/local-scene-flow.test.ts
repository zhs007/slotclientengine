import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tickerCallback: null as ((ticker: { deltaMS: number }) => void) | null,
  applicationDestroy: vi.fn(),
  resourceDestroy: vi.fn(),
  runtimeDestroy: vi.fn(),
  runtimeUpdate: vi.fn(),
  requestStates: vi.fn(),
  reset: vi.fn(),
  applySnapshot: vi.fn(),
  spin: vi.fn(),
  spinning: false,
  onceCount: 0,
  landings: [] as { x: number; y: number }[],
  initError: null as Error | null,
  applicationInitError: null as Error | null,
  readiness: null as unknown,
}));

vi.mock("pixi.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("pixi.js")>();
  class Application {
    readonly canvas = { setAttribute: vi.fn() };
    readonly stage = { addChild: vi.fn() };
    readonly renderer = { resize: vi.fn() };
    readonly ticker = {
      add: vi.fn((callback: (ticker: { deltaMS: number }) => void) => {
        mocks.tickerCallback = callback;
      }),
    };
    async init(): Promise<void> {
      if (mocks.applicationInitError) throw mocks.applicationInitError;
    }
    destroy(): void {
      mocks.applicationDestroy();
    }
  }
  return { ...original, Application };
});

const project = {
  kind: "scene-other-scene-flow",
  version: 1,
  spin: {
    kind: "standard",
    version: 1,
    direction: "forward",
    speedSymbolsPerSecond: 20,
    minimumSpinCycles: 1,
    baseDurationMs: 100,
    startDelayMs: 0,
    stopDelayMs: 0,
    bounceStrength: 0,
  },
  choreographies: [
    {
      id: "spin",
      name: "Spin",
      steps: [{ state: "normal", holdSeconds: 0 }, { state: "spinBlur" }],
    },
    {
      id: "landing",
      name: "Landing",
      steps: [{ state: "appear" }, { state: "normal" }],
    },
    { id: "normal", name: "Normal", steps: [{ state: "normal" }] },
  ],
  snapshots: [
    {
      id: "s1",
      name: "S1",
      scene: [[1]],
      otherScene: [[null]],
      choreographies: [["spin"]],
    },
    {
      id: "s2",
      name: "S2",
      scene: [[2]],
      otherScene: [[5]],
      choreographies: [["landing"]],
    },
    {
      id: "s3",
      name: "S3",
      scene: [[1]],
      otherScene: [[null]],
      choreographies: [["normal"]],
    },
  ],
} as const;

const readiness = {
  kind: "scene-other-scene-flow-readiness",
  version: 1,
  layout: {
    columns: 1,
    rows: 1,
    states: [
      { id: "normal", phase: "stable", playback: "loop" },
      { id: "spinBlur", phase: "stable", playback: "loop" },
      { id: "appear", phase: "once", playback: "once" },
    ],
  },
  project,
} as const;

vi.mock("../../src/scene-layout/local-scene-authoring.js", () => ({
  inspectSceneOtherSceneFlowReadiness: vi.fn(async () => mocks.readiness),
  secureSceneOtherSceneBoundedRandom: vi.fn(() => 0),
}));
vi.mock("../../src/scene-layout/production-zip.js", () => ({
  loadSceneLayoutPackageFromZipBytes: vi.fn(async () => ({
    destroy: mocks.resourceDestroy,
  })),
}));
vi.mock("../../src/scene-layout/package-runtime.js", () => ({
  createSceneLayoutPackageRuntime: vi.fn(() => ({
    container: {},
    init: vi.fn(async () => {
      if (mocks.initError) throw mocks.initError;
    }),
    update: mocks.runtimeUpdate,
    applyViewport: vi.fn(),
    resetReelScene: mocks.reset,
    applyMainReelSnapshot: mocks.applySnapshot,
    spinMainReelToScene: vi.fn((input) => {
      input.random();
      mocks.spinning = true;
      mocks.spin(input);
    }),
    isMainReelSpinning: vi.fn(() => mocks.spinning),
    drainMainReelLandingPositions: vi.fn(() => mocks.landings.splice(0)),
    requestMainReelSymbolStates: mocks.requestStates,
    getMainReelSymbolStateSnapshots: vi.fn(() => [
      { onceCompletionCount: mocks.onceCount },
    ]),
    destroy: mocks.runtimeDestroy,
  })),
}));

import { createSceneOtherSceneFlowRuntime } from "../../src/scene-layout/local-scene-flow.js";

describe("local scene flow runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.spinning = false;
    mocks.onceCount = 0;
    mocks.landings = [];
    mocks.tickerCallback = null;
    mocks.initError = null;
    mocks.applicationInitError = null;
    mocks.readiness = readiness;
  });

  it("runs source, spin landing, later settled snapshot and replay", async () => {
    const root = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const runtime = await createSceneOtherSceneFlowRuntime({
      root,
      layoutZipBytes: new Uint8Array([1]),
      expectedLayoutSha256: "a".repeat(64),
      project,
      random: () => 0,
    });
    expect(root.replaceChildren).toHaveBeenCalledOnce();
    mocks.tickerCallback!({ deltaMS: 16 });
    runtime.applyViewport({ width: 800, height: 600 });
    expect(() => runtime.applyViewport({ width: 0, height: 1 })).toThrow(
      /positive/,
    );
    runtime.play();
    runtime.play();
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.spin).toHaveBeenCalledOnce();

    mocks.landings.push({ x: 0, y: 0 });
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.requestStates).toHaveBeenCalledWith(
      [{ x: 0, y: 0 }],
      "appear",
      "immediate",
    );
    mocks.onceCount = 1;
    mocks.spinning = false;
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.applySnapshot).toHaveBeenCalledOnce();
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "completed",
      snapshotIndex: 2,
    });

    runtime.play();
    expect(mocks.reset).toHaveBeenCalledOnce();
    runtime.replay();
    expect(mocks.reset).toHaveBeenCalledTimes(2);
    runtime.destroy();
    runtime.destroy();
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.runtimeDestroy).toHaveBeenCalledOnce();
    expect(() => runtime.play()).toThrow(/destroyed/);
  });

  it("cleans up a loaded resource when runtime initialization fails", async () => {
    mocks.initError = new Error("init failed");
    const root = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    await expect(
      createSceneOtherSceneFlowRuntime({
        root,
        layoutZipBytes: new Uint8Array([1]),
        project,
      }),
    ).rejects.toThrow(/init failed/);
    expect(mocks.runtimeDestroy).toHaveBeenCalledOnce();
    expect(mocks.applicationDestroy).toHaveBeenCalledOnce();
  });

  it("destroys the resource when application initialization fails", async () => {
    mocks.applicationInitError = new Error("application failed");
    const root = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    await expect(
      createSceneOtherSceneFlowRuntime({
        root,
        layoutZipBytes: new Uint8Array([1]),
        project,
      }),
    ).rejects.toThrow(/application failed/);
    expect(mocks.resourceDestroy).toHaveBeenCalledOnce();
    expect(mocks.runtimeDestroy).not.toHaveBeenCalled();
  });

  it("uses the normal fallback when package metadata has no stable state", async () => {
    mocks.readiness = {
      ...readiness,
      layout: {
        ...readiness.layout,
        states: [{ id: "appear", phase: "once", playback: "once" }],
      },
    };
    const root = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const runtime = await createSceneOtherSceneFlowRuntime({
      root,
      layoutZipBytes: new Uint8Array([1]),
      project,
    });
    expect(runtime.getSnapshot().phase).toBe("ready");
    runtime.destroy();
  });
});
