import { describe, expect, it, vi } from "vitest";
import {
  createDefaultSceneOtherSceneFlowProject,
  parseSceneOtherSceneFlowProject,
  rollOtherSceneValues,
  rollSceneFromPublicReels,
  secureSceneOtherSceneBoundedRandom,
  type SceneOtherSceneFlowPackageSummary,
} from "../../src/scene-layout/local-scene-authoring.js";

const summary: SceneOtherSceneFlowPackageSummary = {
  kind: "scene-other-scene-flow-package-summary",
  version: 1,
  sha256: "a".repeat(64),
  layoutId: "sample",
  initialMode: null,
  columns: 2,
  rows: 2,
  renderMode: "standard",
  symbolPackageId: "symbols",
  reelSet: "main",
  publicReels: [
    [1, 2, 3],
    [2, 3, 1],
  ],
  symbols: [
    {
      code: 1,
      name: "A",
      valueCapable: true,
      defaultValues: [5, 10],
      supportedStates: ["normal", "spinBlur", "appear"],
      valueRequiredStates: ["normal", "appear"],
    },
    {
      code: 2,
      name: "B",
      valueCapable: true,
      defaultValues: [5, 10],
      supportedStates: ["normal", "spinBlur", "appear"],
      valueRequiredStates: ["normal", "appear"],
    },
    {
      code: 3,
      name: "C",
      valueCapable: false,
      defaultValues: [],
      supportedStates: ["normal", "spinBlur", "appear"],
      valueRequiredStates: [],
    },
  ],
  states: [
    { id: "normal", phase: "stable", playback: "loop" },
    { id: "spinBlur", phase: "stable", playback: "loop" },
    { id: "appear", phase: "once", playback: "once" },
  ],
  numberWeightTables: {
    values: [
      { value: 5, weight: 1 },
      { value: 10, weight: 1 },
    ],
  },
};

describe("local scene authoring", () => {
  it("creates the required two-snapshot spin and landing defaults", () => {
    const project = createDefaultSceneOtherSceneFlowProject({
      summary,
      random: () => 0,
    });
    expect(project.snapshots).toHaveLength(2);
    expect(
      project.choreographies.map((item) =>
        item.steps.map((step) => step.state),
      ),
    ).toEqual([
      ["normal", "spinBlur"],
      ["appear", "normal"],
    ]);
    expect(project.snapshots[0]!.choreographies[0]![0]).toBe("spin");
    expect(project.snapshots[1]!.choreographies[0]![0]).toBe("landing");
    expect(project.snapshots[0]!.otherScene).toEqual([
      [5, 5],
      [5, null],
    ]);
  });

  it("rolls only from public reels and filters otherScene by symbol", () => {
    const scene = rollSceneFromPublicReels(summary, () => 1);
    expect(scene).toEqual([
      [2, 3],
      [3, 1],
    ]);
    const project = createDefaultSceneOtherSceneFlowProject({
      summary,
      random: () => 0,
    });
    const values = rollOtherSceneValues({
      summary,
      snapshot: project.snapshots[0]!,
      symbolNames: ["A"],
      fixedValue: 9,
    });
    expect(values[0]![0]).toBe(9);
    expect(values[0]![1]).toBe(5);
  });

  it("rejects unknown fields and fewer than two snapshots", () => {
    const project = createDefaultSceneOtherSceneFlowProject({
      summary,
      random: () => 0,
    });
    expect(() =>
      parseSceneOtherSceneFlowProject({ ...project, hidden: true }),
    ).toThrow(/hidden/);
    expect(() =>
      parseSceneOtherSceneFlowProject({
        ...project,
        snapshots: [project.snapshots[0]],
      }),
    ).toThrow(/at least two/);
  });

  it("strictly rejects malformed project structure at each nested boundary", () => {
    const valid = createDefaultSceneOtherSceneFlowProject({
      summary,
      random: () => 0,
    });
    const first = valid.snapshots[0]!;
    const cases: unknown[] = [
      null,
      [],
      { ...valid, kind: "other" },
      { ...valid, version: 2 },
      { ...valid, choreographies: "bad" },
      { ...valid, choreographies: [] },
      {
        ...valid,
        choreographies: [
          valid.choreographies[0],
          { ...valid.choreographies[1], id: valid.choreographies[0]!.id },
        ],
      },
      {
        ...valid,
        choreographies: [
          valid.choreographies[0],
          { ...valid.choreographies[1], name: valid.choreographies[0]!.name },
        ],
      },
      {
        ...valid,
        choreographies: [{ ...valid.choreographies[0], id: " " }],
      },
      {
        ...valid,
        choreographies: [{ ...valid.choreographies[0], steps: [] }],
      },
      {
        ...valid,
        choreographies: [
          {
            ...valid.choreographies[0],
            steps: [{ state: "normal", holdSeconds: -1 }],
          },
        ],
      },
      { ...valid, snapshots: "bad" },
      { ...valid, snapshots: [{ ...first, hidden: true }, valid.snapshots[1]] },
      { ...valid, snapshots: [{ ...first, scene: [] }, valid.snapshots[1]] },
      { ...valid, snapshots: [{ ...first, scene: [[]] }, valid.snapshots[1]] },
      {
        ...valid,
        snapshots: [{ ...first, scene: [[-1]] }, valid.snapshots[1]],
      },
      {
        ...valid,
        snapshots: [{ ...first, scene: [[1], [1, 2]] }, valid.snapshots[1]],
      },
      {
        ...valid,
        snapshots: [{ ...first, otherScene: [[null]] }, valid.snapshots[1]],
      },
      {
        ...valid,
        snapshots: [
          {
            ...first,
            otherScene: [
              [0, null],
              [null, null],
            ],
          },
          valid.snapshots[1],
        ],
      },
      {
        ...valid,
        snapshots: [
          { ...first, choreographies: [["spin"], ["spin", "missing"]] },
          valid.snapshots[1],
        ],
      },
      {
        ...valid,
        snapshots: [
          {
            ...first,
            choreographies: [
              ["missing", "spin"],
              ["spin", "spin"],
            ],
          },
          valid.snapshots[1],
        ],
      },
    ];
    for (const candidate of cases)
      expect(() => parseSceneOtherSceneFlowProject(candidate)).toThrow();
  });

  it("covers strict random, public reel and grid-cell default boundaries", () => {
    expect(
      createDefaultSceneOtherSceneFlowProject({ summary }).snapshots,
    ).toHaveLength(2);
    expect(() =>
      rollSceneFromPublicReels(
        { ...summary, publicReels: [summary.publicReels[0]!] },
        () => 0,
      ),
    ).toThrow(/count/);
    expect(() =>
      rollSceneFromPublicReels(
        { ...summary, publicReels: [[], summary.publicReels[1]!] },
        () => 0,
      ),
    ).toThrow(/empty/);
    for (const result of [-1, 1.5, 3])
      expect(() => rollSceneFromPublicReels(summary, () => result)).toThrow(
        /random result/,
      );
    for (const max of [0, -1, 1.5, 0x1_0000_0001])
      expect(() => secureSceneOtherSceneBoundedRandom(max)).toThrow(
        /exclusiveMax/,
      );
    const crypto = globalThis.crypto;
    vi.stubGlobal("crypto", undefined);
    expect(() => secureSceneOtherSceneBoundedRandom(2)).toThrow(/Web Crypto/);
    let calls = 0;
    vi.stubGlobal("crypto", {
      getRandomValues(values: Uint32Array): Uint32Array {
        values[0] = calls++ === 0 ? 0xffff_ffff : 0;
        return values;
      },
    });
    expect(secureSceneOtherSceneBoundedRandom(3)).toBe(0);
    vi.stubGlobal("crypto", crypto);
    const gridProject = createDefaultSceneOtherSceneFlowProject({
      summary: { ...summary, renderMode: "grid-cell" },
      random: () => 0,
    });
    expect(gridProject.spin.kind).toBe("grid-cell");
    expect(
      rollOtherSceneValues({
        summary,
        snapshot: createDefaultSceneOtherSceneFlowProject({
          summary,
          random: () => 0,
        }).snapshots[0]!,
        weightTableName: "values",
        random: () => 1,
      })[0]![0],
    ).toBe(10);
  });
});
