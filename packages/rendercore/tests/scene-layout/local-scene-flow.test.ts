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
  onceCounts: new Map<string, number>(),
  landings: [] as { x: number; y: number }[],
  initError: null as Error | null,
  applicationInitError: null as Error | null,
  rendererResize: vi.fn(),
  runtimeViewport: vi.fn(),
  resolveFrame: vi.fn(() => ({
    frameDesignSize: { width: 2000, height: 1200 },
    cssSize: { width: 1000, height: 600 },
    offsetX: 100,
    offsetY: 0,
  })),
  readiness: null as unknown,
}));

vi.mock("pixi.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("pixi.js")>();
  class Application {
    readonly canvas = { setAttribute: vi.fn(), style: {} };
    readonly stage = { addChild: vi.fn() };
    readonly renderer = { resize: mocks.rendererResize };
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
  version: 2,
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
      kind: "spin",
      id: "spin",
      name: "Spin",
      beforeSpin: { state: "normal" },
      spinning: { state: "spinBlur" },
      stopping: [{ state: "appear" }, { state: "normal" }],
    },
    {
      kind: "sequence",
      id: "normal",
      name: "Normal",
      steps: [{ state: "normal" }],
    },
  ],
  snapshots: [
    {
      kind: "initial",
      id: "s1",
      name: "S1",
      scene: [[1]],
      otherScene: [[null]],
    },
    {
      kind: "scene",
      id: "s2",
      name: "S2",
      transition: "spin",
      completionPolicy: "all-cells-normal",
      scene: [[2]],
      otherScene: [[5]],
      choreographies: [["spin"]],
    },
    {
      kind: "scene",
      id: "s3",
      name: "S3",
      transition: "settled",
      completionPolicy: "all-cells-normal",
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
    manifest: {},
    destroy: mocks.resourceDestroy,
  })),
}));
vi.mock("../../src/scene-layout/geometry.js", () => ({
  resolveSceneLayoutFrameViewport: mocks.resolveFrame,
}));
vi.mock("../../src/scene-layout/package-runtime.js", () => ({
  createSceneLayoutPackageRuntime: vi.fn(() => ({
    container: {},
    init: vi.fn(async () => {
      if (mocks.initError) throw mocks.initError;
    }),
    update: mocks.runtimeUpdate,
    applyViewport: mocks.runtimeViewport,
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
    getMainReelSymbolStateSnapshots: vi.fn(
      (positions: readonly { x: number; y: number }[]) => [
        {
          onceCompletionCount:
            mocks.onceCounts.get(`${positions[0]!.x}:${positions[0]!.y}`) ??
            mocks.onceCount,
        },
      ],
    ),
    destroy: mocks.runtimeDestroy,
  })),
}));

import { createSceneOtherSceneFlowRuntime } from "../../src/scene-layout/local-scene-flow.js";

describe("local scene flow runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.spinning = false;
    mocks.onceCount = 0;
    mocks.onceCounts.clear();
    mocks.landings = [];
    mocks.tickerCallback = null;
    mocks.initError = null;
    mocks.applicationInitError = null;
    mocks.readiness = readiness;
  });

  it("runs unified spin nodes, later settled snapshot and replay", async () => {
    const root = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const runtime = await createSceneOtherSceneFlowRuntime({
      root,
      layoutZipBytes: new Uint8Array([1]),
      expectedLayoutSha256: "a".repeat(64),
      project,
      operationPlan: operationPlanFor(project) as never,
      random: () => 0,
    });
    expect(root.replaceChildren).toHaveBeenCalledOnce();
    mocks.tickerCallback!({ deltaMS: 16 });
    runtime.applyViewport({ width: 800, height: 600 });
    expect(mocks.resolveFrame).toHaveBeenCalledWith({
      manifest: {},
      pageSize: { width: 800, height: 600 },
    });
    expect(mocks.rendererResize).toHaveBeenCalledWith(2000, 1200);
    expect(mocks.runtimeViewport).toHaveBeenCalledWith({
      width: 2000,
      height: 1200,
    });
    expect(runtime.canvas.style).toMatchObject({
      left: "100px",
      top: "0px",
      width: "1000px",
      height: "600px",
    });
    expect(() => runtime.applyViewport({ width: 0, height: 1 })).toThrow(
      /positive/,
    );
    runtime.play();
    runtime.play();
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.spin).toHaveBeenCalledOnce();

    mocks.landings.push({ x: 0, y: 0 }, { x: 0, y: 0 });
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.spin).toHaveBeenCalledWith(
      expect.objectContaining({ landingStates: [["appear"]] }),
    );
    expect(mocks.requestStates).not.toHaveBeenCalledWith(
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

  it("waits for reel settle but lets first-cell normal supersede other controllers", async () => {
    const twoCellProject = {
      ...project,
      snapshots: [
        {
          ...project.snapshots[0],
          scene: [[1], [1]],
          otherScene: [[null], [null]],
        },
        {
          ...project.snapshots[1],
          completionPolicy: "first-cell-normal",
          scene: [[2], [2]],
          otherScene: [[5], [5]],
          choreographies: [["spin"], ["spin"]],
        },
        {
          ...project.snapshots[2],
          scene: [[1], [1]],
          otherScene: [[null], [null]],
          choreographies: [["normal"], ["normal"]],
        },
      ],
    } as const;
    mocks.readiness = {
      ...readiness,
      layout: { ...readiness.layout, columns: 2 },
      project: twoCellProject,
    };
    const runtime = await createSceneOtherSceneFlowRuntime({
      root: { replaceChildren: vi.fn() } as unknown as HTMLElement,
      layoutZipBytes: new Uint8Array([1]),
      project: twoCellProject,
    });
    runtime.play();
    mocks.landings.push({ x: 0, y: 0 }, { x: 1, y: 0 });
    mocks.tickerCallback!({ deltaMS: 16 });
    mocks.onceCounts.set("0:0", 1);
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.applySnapshot).not.toHaveBeenCalled();

    mocks.spinning = false;
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.applySnapshot).toHaveBeenCalledOnce();
    const requestsAfterAdvance = mocks.requestStates.mock.calls.length;

    mocks.onceCounts.set("1:0", 1);
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.requestStates).toHaveBeenCalledTimes(requestsAfterAdvance);
    runtime.destroy();
  });

  it("waits for a once before-spin node without using a timer", async () => {
    const onceBeforeProject = {
      ...project,
      choreographies: [
        {
          ...project.choreographies[0],
          beforeSpin: { state: "appear" },
        },
        project.choreographies[1],
      ],
    } as const;
    mocks.readiness = { ...readiness, project: onceBeforeProject };
    const runtime = await createSceneOtherSceneFlowRuntime({
      root: { replaceChildren: vi.fn() } as unknown as HTMLElement,
      layoutZipBytes: new Uint8Array([1]),
      project: onceBeforeProject,
    });
    runtime.play();
    mocks.tickerCallback!({ deltaMS: 10_000 });
    expect(mocks.spin).not.toHaveBeenCalled();
    mocks.onceCount = 1;
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.spin).toHaveBeenCalledOnce();
    runtime.destroy();
  });

  it("rejects an invalid post-readiness settled transition", async () => {
    const invalidProject = {
      ...project,
      snapshots: [
        project.snapshots[0],
        project.snapshots[1],
        { ...project.snapshots[2], transition: "spin" },
      ],
    } as const;
    mocks.readiness = { ...readiness, project: invalidProject };
    const runtime = await createSceneOtherSceneFlowRuntime({
      root: { replaceChildren: vi.fn() } as unknown as HTMLElement,
      layoutZipBytes: new Uint8Array([1]),
      project: invalidProject,
    });
    runtime.play();
    mocks.landings.push({ x: 0, y: 0 });
    mocks.tickerCallback!({ deltaMS: 16 });
    mocks.onceCount = 1;
    mocks.spinning = false;
    expect(() => mocks.tickerCallback!({ deltaMS: 16 })).toThrow(
      /not a settled scene state/,
    );
    runtime.destroy();
  });

  it("rejects a post-readiness spin choreography in a settled scene", async () => {
    const invalidProject = {
      ...project,
      snapshots: [
        project.snapshots[0],
        project.snapshots[1],
        { ...project.snapshots[2], choreographies: [["spin"]] },
      ],
    } as const;
    mocks.readiness = { ...readiness, project: invalidProject };
    const runtime = await createSceneOtherSceneFlowRuntime({
      root: { replaceChildren: vi.fn() } as unknown as HTMLElement,
      layoutZipBytes: new Uint8Array([1]),
      project: invalidProject,
    });
    runtime.play();
    mocks.landings.push({ x: 0, y: 0 });
    mocks.tickerCallback!({ deltaMS: 16 });
    mocks.onceCount = 1;
    mocks.spinning = false;
    expect(() => mocks.tickerCallback!({ deltaMS: 16 })).toThrow(
      /must use sequence choreography/,
    );
    runtime.destroy();
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

  it("does not guess a normal state when readiness metadata is invalid", async () => {
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
    expect(() => runtime.play()).toThrow(/Unknown state "normal"/);
    runtime.destroy();
  });

  it("requires every finalized operation checkpoint to match the local flow", async () => {
    const root = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    await expect(
      createSceneOtherSceneFlowRuntime({
        root,
        layoutZipBytes: new Uint8Array([1]),
        project,
        operationPlan: operationPlanFor(project, {
          initialMismatch: true,
        }) as never,
      }),
    ).rejects.toThrow(/initial snapshot/);
    await expect(
      createSceneOtherSceneFlowRuntime({
        root,
        layoutZipBytes: new Uint8Array([1]),
        project,
        operationPlan: operationPlanFor(project, { omitFinal: true }) as never,
      }),
    ).rejects.toThrow(/no finalized edge/);
    await expect(
      createSceneOtherSceneFlowRuntime({
        root,
        layoutZipBytes: new Uint8Array([1]),
        project,
        operationPlan: operationPlanFor(project, {
          outputMismatch: true,
        }) as never,
      }),
    ).rejects.toThrow(/does not match the local flow/);
  });

  it("accepts a matching finalized operation checkpoint chain", async () => {
    const runtime = await createSceneOtherSceneFlowRuntime({
      root: { replaceChildren: vi.fn() } as unknown as HTMLElement,
      layoutZipBytes: new Uint8Array([1]),
      project,
      operationPlan: operationPlanFor(project) as never,
    });
    runtime.destroy();
  });

  it("executes intermediate authored operations before the edge choreography", async () => {
    const plan = operationPlanFor(project);
    const operationPlan = withLeadingOperation(plan, {
      kind: "snapshot-authored",
      inputSnapshotId: "s1",
      outputSnapshotId: "s2",
      suggestions: [],
      edits: [],
    });
    const runtime = await createSceneOtherSceneFlowRuntime({
      root: { replaceChildren: vi.fn() } as unknown as HTMLElement,
      layoutZipBytes: new Uint8Array([1]),
      project,
      operationPlan: operationPlan as never,
    });
    runtime.play();
    mocks.tickerCallback!({ deltaMS: 16 });
    mocks.tickerCallback!({ deltaMS: 16 });
    mocks.tickerCallback!({ deltaMS: 16 });
    expect(mocks.applySnapshot).not.toHaveBeenCalled();
    expect(mocks.spin).toHaveBeenCalledOnce();
    runtime.destroy();
  });

  it("rejects non-authored operations during coordinator preflight", async () => {
    const plan = operationPlanFor(project);
    const operationPlan = withLeadingOperation(plan, {
      kind: "server-component",
      stepIndex: 0,
      bindings: {},
    });
    const runtime = await createSceneOtherSceneFlowRuntime({
      root: { replaceChildren: vi.fn() } as unknown as HTMLElement,
      layoutZipBytes: new Uint8Array([1]),
      project,
      operationPlan: operationPlan as never,
    });
    runtime.play();
    await Promise.resolve();
    expect(() => mocks.tickerCallback!({ deltaMS: 16 })).toThrow(
      /snapshot-authored/,
    );
    runtime.destroy();
  });
});

function withLeadingOperation(
  plan: ReturnType<typeof operationPlanFor>,
  source: Record<string, unknown>,
) {
  const kind = "slot:win";
  const leading = {
    id: "leading-operation",
    kind,
    version: 2,
    effect: "presentation",
    operationIndex: 0,
    source,
    payload: {},
    requiredCapabilities: [kind],
    commit: "atomic",
  };
  const operations = [leading, ...plan.operations].map(
    (operation, operationIndex) => ({ ...operation, operationIndex }),
  );
  return deepFreeze({
    ...plan,
    operations,
    requiredCapabilities: [...plan.requiredCapabilities, kind],
  });
}

function operationPlanFor(
  value: typeof project,
  options: {
    initialMismatch?: boolean;
    omitFinal?: boolean;
    outputMismatch?: boolean;
  } = {},
) {
  const initial = value.snapshots[0];
  const initialSnapshot = {
    scene: options.initialMismatch ? [[99]] : initial.scene,
    values: initial.otherScene,
    occurrences: [],
  };
  const targets = options.omitFinal
    ? value.snapshots.slice(1, -1)
    : value.snapshots.slice(1);
  let input: {
    scene: readonly (readonly number[])[];
    values: readonly (readonly (number | null)[])[];
    occurrences: never[];
  } = initialSnapshot;
  const operations: Record<string, unknown>[] = [
    {
      id: "operation-initial",
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      operationIndex: 0,
      source: {
        kind: "snapshot-authored",
        inputSnapshotId: initial.id,
        outputSnapshotId: initial.id,
        suggestions: [],
        edits: [],
      },
      output: initialSnapshot,
      payload: {},
      requiredCapabilities: ["slot:scene-landing"],
      commit: "atomic",
    },
  ];
  operations.push(
    ...targets.map((target, index) => {
      if (target.kind !== "scene") throw new Error("target must be a scene");
      const output = {
        scene: options.outputMismatch && index === 0 ? [[99]] : target.scene,
        values: target.otherScene,
        occurrences: [],
      };
      const operation = {
        id: `operation-${index}`,
        kind:
          target.transition === "spin" ? "slot:spin" : "slot:state-mutation",
        version: 2,
        effect:
          target.transition === "spin" ? "scene-landing" : "state-mutation",
        operationIndex: index + 1,
        source: {
          kind: "snapshot-authored",
          inputSnapshotId: value.snapshots[index]!.id,
          outputSnapshotId: target.id,
          suggestions: [],
          edits: [],
        },
        ...(target.transition === "spin"
          ? {}
          : { input, mutations: [{ kind: "test" }] }),
        output,
        payload: {},
        requiredCapabilities: [
          target.transition === "spin" ? "slot:spin" : "slot:state-mutation",
        ],
        commit: "atomic",
      };
      input = output;
      return operation;
    }),
  );
  return deepFreeze({
    kind: "slot-operation-plan",
    version: 2,
    operations,
    final:
      (operations.at(-1)?.output as typeof initialSnapshot | undefined) ??
      initialSnapshot,
    requiredCapabilities: [
      "slot:scene-landing",
      "slot:spin",
      "slot:state-mutation",
    ],
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>))
      deepFreeze(item);
  }
  return value;
}
