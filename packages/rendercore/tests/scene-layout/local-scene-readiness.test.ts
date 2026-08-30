import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  resource: null as unknown,
}));

const reels = {
  getReelCount: () => 1,
  getLength: () => 3,
  get: (_x: number, y: number) => [1, 1, 1][y]!,
  normalizeY: (_x: number, y: number) => y,
};
const symbolPackage = {
  packageManifest: { id: "symbols" },
  displaySymbols: ["A"],
  gameConfig: {
    getReels: () => reels,
    getSymbolCode: (name: string) => (name === "A" ? 1 : undefined),
    getNumberWeightTableNames: () => ["values"],
    getNumberWeightTable: () => [{ value: 7, weight: 1 }],
  },
  statePreset: {
    defaultState: "normal",
    states: [
      { id: "normal", phase: "stable", playback: "loop" },
      { id: "spinBlur", phase: "stable", playback: "loop" },
      { id: "appear", phase: "once", playback: "once" },
    ],
    equivalences: [],
  },
  symbolManifest: {
    symbols: {
      A: {
        animations: {
          spinBlur: { kind: "builtin" },
          appear: { kind: "activeSpine" },
        },
        states: {},
        valuePresentation: {
          defaultValues: [7],
          reelStates: { states: { spinBlur: "spin.png" } },
        },
      },
    },
  },
};
const resource = {
  manifest: {
    id: "layout",
    main: { columns: 1, rows: 1 },
    symbolPackage: { reelSet: "main", renderMode: "standard" },
  },
  symbolPackage,
  symbolPackages: {},
  destroy: mocks.destroy,
};

vi.mock("../../src/scene-layout/production-zip.js", () => ({
  loadSceneLayoutPackageFromZipBytes: vi.fn(async () => mocks.resource),
}));

import {
  inspectSceneOtherSceneFlowPackage,
  inspectSceneOtherSceneFlowReadiness,
  rollOtherSceneValues,
} from "../../src/scene-layout/local-scene-authoring.js";

const spin = {
  kind: "standard",
  version: 1,
  direction: "forward",
  speedSymbolsPerSecond: 20,
  minimumSpinCycles: 1,
  baseDurationMs: 100,
  startDelayMs: 0,
  stopDelayMs: 0,
  bounceStrength: 0,
} as const;
const project = {
  kind: "scene-other-scene-flow",
  version: 2,
  spin,
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
      otherScene: [[7]],
    },
    {
      kind: "scene",
      id: "s2",
      name: "S2",
      transition: "spin",
      completionPolicy: "all-cells-normal",
      scene: [[1]],
      otherScene: [[7]],
      choreographies: [["spin"]],
    },
  ],
} as const;

describe("local scene readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resource = resource;
  });

  it("inspects the initial binding, public reels, states and weight tables", async () => {
    const summary = await inspectSceneOtherSceneFlowPackage({
      layoutZipBytes: new Uint8Array([1]),
    });
    expect(summary).toMatchObject({
      layoutId: "layout",
      columns: 1,
      rows: 1,
      renderMode: "standard",
      publicReels: [[1, 1, 1]],
      numberWeightTables: { values: [{ value: 7, weight: 1 }] },
    });
    expect(summary.symbols[0]).toMatchObject({
      valueCapable: true,
      defaultValues: [7],
      supportedStates: ["normal", "spinBlur", "appear"],
      valueRequiredStates: ["normal", "appear"],
    });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("validates a complete project and exact package hash", async () => {
    const readiness = await inspectSceneOtherSceneFlowReadiness({
      layoutZipBytes: new Uint8Array([1]),
      project,
    });
    expect(readiness.project.snapshots).toHaveLength(2);
    await expect(
      inspectSceneOtherSceneFlowReadiness({
        layoutZipBytes: new Uint8Array([1]),
        expectedLayoutSha256: "0".repeat(64),
        project,
      }),
    ).rejects.toThrow(/hash mismatch/);
    await expect(
      inspectSceneOtherSceneFlowReadiness({
        layoutZipBytes: new Uint8Array([1]),
        expectedLayoutSha256: "invalid",
        project,
      }),
    ).rejects.toThrow(/64-character/);
  });

  it("rejects a missing value before an active Spine state can run", async () => {
    await expect(
      inspectSceneOtherSceneFlowReadiness({
        layoutZipBytes: new Uint8Array([1]),
        project: {
          ...project,
          snapshots: project.snapshots.map((snapshot) => ({
            ...snapshot,
            otherScene: [[null]],
          })),
        },
      }),
    ).rejects.toThrow(/requires a positive otherScene value.*active Spine/);
  });

  it.each([
    [
      "render kind",
      {
        ...project,
        spin: {
          kind: "grid-cell",
          version: 1,
          direction: "forward",
          order: "top-down-left-right",
          timing: {
            startStepMs: 0,
            stopStepMs: 0,
            settleAfterLastStartMs: 100,
            minimumSpinCycles: 1,
            speedSymbolsPerSecond: 20,
          },
          bounceStrength: 0,
        },
      },
      /does not match/,
    ],
    [
      "unknown state",
      {
        ...project,
        choreographies: [
          {
            ...project.choreographies[0],
            beforeSpin: { state: "missing" },
          },
          project.choreographies[1],
        ],
      },
      /unknown state/,
    ],
    [
      "hold field",
      {
        ...project,
        choreographies: [
          {
            ...project.choreographies[0],
            beforeSpin: { state: "normal", holdSeconds: 1 },
          },
          project.choreographies[1],
        ],
      },
      /holdSeconds.*not supported/,
    ],
    [
      "non-stable spinning",
      {
        ...project,
        choreographies: [
          {
            ...project.choreographies[0],
            spinning: { state: "appear" },
          },
          project.choreographies[1],
        ],
      },
      /spinning state must be stable/,
    ],
    [
      "non-normal final",
      {
        ...project,
        choreographies: [
          {
            ...project.choreographies[0],
            stopping: [{ state: "appear" }],
          },
          project.choreographies[1],
        ],
      },
      /end with exact state "normal"/,
    ],
    [
      "unknown code",
      {
        ...project,
        snapshots: [
          { ...project.snapshots[0], scene: [[99]] },
          project.snapshots[1],
        ],
      },
      /unknown display code/,
    ],
    [
      "layout dimensions",
      {
        ...project,
        snapshots: [
          project.snapshots[0],
          {
            ...project.snapshots[1],
            scene: [[1], [1]],
            otherScene: [[null], [null]],
            choreographies: [["spin"], ["spin"]],
          },
        ],
      },
      /must be 1 x 1/,
    ],
  ])("rejects %s incompatibility", async (_label, invalid, pattern) => {
    await expect(
      inspectSceneOtherSceneFlowReadiness({
        layoutZipBytes: new Uint8Array([1]),
        project: invalid,
      }),
    ).rejects.toThrow(pattern);
  });

  it("samples a named value table and rejects invalid roll inputs", async () => {
    const summary = await inspectSceneOtherSceneFlowPackage({
      layoutZipBytes: new Uint8Array([1]),
    });
    expect(
      rollOtherSceneValues({
        summary,
        snapshot: project.snapshots[0],
        weightTableName: "values",
        random: () => 0,
      }),
    ).toEqual([[7]]);
    expect(() =>
      rollOtherSceneValues({
        summary,
        snapshot: project.snapshots[0],
        weightTableName: "missing",
      }),
    ).toThrow(/Unknown number/);
    expect(() =>
      rollOtherSceneValues({
        summary,
        snapshot: project.snapshots[0],
        symbolNames: ["missing"],
        fixedValue: 1,
      }),
    ).toThrow(/Unknown symbol/);
    expect(() =>
      rollOtherSceneValues({ summary, snapshot: project.snapshots[0] }),
    ).toThrow(/fixedValue/);
    expect(() =>
      rollOtherSceneValues({
        summary,
        snapshot: project.snapshots[0],
        fixedValue: 1,
        random: () => 2,
      }),
    ).not.toThrow();
  });

  it("rejects invalid package bindings and symbol capabilities", async () => {
    mocks.resource = {
      ...resource,
      manifest: { ...resource.manifest, main: undefined },
    };
    await expect(
      inspectSceneOtherSceneFlowPackage({
        layoutZipBytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow(/main/);

    mocks.resource = {
      ...resource,
      symbolPackage: {
        ...symbolPackage,
        gameConfig: {
          ...symbolPackage.gameConfig,
          getReels: () => ({ ...reels, getReelCount: () => 2 }),
        },
      },
    };
    await expect(
      inspectSceneOtherSceneFlowPackage({
        layoutZipBytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow(/reel set/);

    mocks.resource = {
      ...resource,
      symbolPackage: {
        ...symbolPackage,
        gameConfig: {
          ...symbolPackage.gameConfig,
          getSymbolCode: () => undefined,
        },
      },
    };
    await expect(
      inspectSceneOtherSceneFlowPackage({
        layoutZipBytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow(/has no code/);

    const plural = {
      ...resource,
      manifest: {
        ...resource.manifest,
        symbolPackage: undefined,
        gameModes: {
          initialMode: "base",
          modes: [{ id: "base", symbolPackage: "symbols" }],
        },
        symbolPackages: { symbols: resource.manifest.symbolPackage },
      },
      symbolPackage: null,
      symbolPackages: { symbols: symbolPackage },
    };
    mocks.resource = plural;
    await expect(
      inspectSceneOtherSceneFlowPackage({
        layoutZipBytes: new Uint8Array([1]),
      }),
    ).resolves.toMatchObject({ symbolPackageId: "symbols" });
    mocks.resource = {
      ...plural,
      manifest: { ...plural.manifest, symbolPackages: {} },
    };
    await expect(
      inspectSceneOtherSceneFlowPackage({
        layoutZipBytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow(/resolve an active/);

    mocks.resource = {
      ...resource,
      symbolPackage: {
        ...symbolPackage,
        symbolManifest: { symbols: { A: { animations: {}, states: {} } } },
      },
    };
    await expect(
      inspectSceneOtherSceneFlowReadiness({
        layoutZipBytes: new Uint8Array([1]),
        project,
      }),
    ).rejects.toThrow(/does not support state/);

    mocks.resource = {
      ...resource,
      symbolPackage: {
        ...symbolPackage,
        statePreset: {
          ...symbolPackage.statePreset,
          equivalences: [{ from: "spinBlur", to: "normal" }],
        },
        symbolManifest: {
          symbols: {
            A: { animations: { appear: {} }, states: {} },
          },
        },
      },
    };
    await expect(
      inspectSceneOtherSceneFlowPackage({
        layoutZipBytes: new Uint8Array([1]),
      }),
    ).resolves.toMatchObject({
      symbols: [{ supportedStates: ["normal", "spinBlur", "appear"] }],
    });
  });
});
