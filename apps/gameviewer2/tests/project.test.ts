import { describe, expect, it } from "vitest";
import { parseGameViewer2ProjectFile } from "../src/model/project.js";
import { parseLaunchPayload } from "../src/runtime/launch-channel.js";

const flow = {
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
      scene: [[1]],
      otherScene: [[null]],
      choreographies: [["spin"]],
    },
  ],
} as const;

describe("gameviewer2 project boundaries", () => {
  it("strictly parses project metadata and local flow", () => {
    const parsed = parseGameViewer2ProjectFile({
      kind: "gameviewer2-project",
      version: 2,
      layoutSha256: "a".repeat(64),
      flow,
    });
    expect(parsed.flow.snapshots).toHaveLength(2);
    expect(() =>
      parseGameViewer2ProjectFile({ ...parsed, hidden: true }),
    ).toThrow(/hidden/);
  });

  it("requires transferable ZIP bytes in launch data", () => {
    expect(
      parseLaunchPayload({
        kind: "gameviewer2-launch",
        version: 2,
        layoutSha256: "b".repeat(64),
        layoutZip: new ArrayBuffer(2),
        project: flow,
      }).layoutZip.byteLength,
    ).toBe(2);
    expect(() =>
      parseLaunchPayload({ kind: "gameviewer2-launch", version: 2 }),
    ).toThrow(/ZIP/);
    expect(() =>
      parseGameViewer2ProjectFile({
        kind: "gameviewer2-project",
        version: 1,
        layoutSha256: "a".repeat(64),
        flow,
      }),
    ).toThrow(/v2/);
  });
});
