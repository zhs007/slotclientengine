import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSlotGameLogicResult,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import type {
  PreparedGridCellVisibleOccurrenceTransferBatch,
  PreparedVisibleOccurrenceReplacement,
  SymbolCascadePlayer,
} from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import type { Game002ReelRuntime } from "../src/game-demo.js";
import {
  compileGame002FreeGamePlan,
  type Game002FreeGameValueMatrix,
} from "../src/freegame-plan.js";
import { createGame002FreeGamePlayback } from "../src/freegame-playback.js";
import type { Game002BackgroundPlayer } from "../src/scene-layout-skin.js";

const RESULTS = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../../docs/crave/gameresults.json"),
    "utf8",
  ),
) as unknown[];
const CODES = Object.freeze({ WL: 0, CN: 8, CO: 10, AF: 11, BN: 12 });

describe("game002 FreeGame playback", () => {
  it("plays spin, AF, CO, terminal CN win, popup and both transitions in order", async () => {
    const logic = createSlotGameLogicResult(
      {
        gmi: {
          defaultScene: (
            RESULTS[0] as { clientData: { scenes: readonly unknown[] } }
          ).clientData.scenes[0],
          replyPlay: { randomNumbers: [], results: RESULTS },
        },
        totalwin: 1,
        results: RESULTS.length,
      },
      {
        bet: { bet: 1, lines: 1, times: 1 },
        userInfo: { gameid: 2 },
      },
    ).logic;
    const firstFreeSpin = logic.getStep(8);
    const entryScene = firstFreeSpin.getScene(0);
    const entryValues = normalizeValues(
      firstFreeSpin.getOtherScene(0),
      entryScene,
    );
    const plan = compileGame002FreeGamePlan({
      logic,
      entryScene,
      entryValues,
      symbolCodes: CODES,
    });
    if (!plan) throw new Error("expected FreeGame plan");

    const events: string[] = [];
    const runtime = createRuntime(plan.entryScene, plan.entryValues, events);
    let mode = "BaseGame";
    const background = {
      getMode: () => mode,
      prepareModeTransition: async (next: string) => {
        events.push(`prepare:${next}`);
      },
      requestMode: async (next: string) => {
        events.push(`mode:${next}`);
        mode = next;
      },
    } as unknown as Game002BackgroundPlayer;
    const cascade = {
      prepare: (
        groups: readonly {
          positions: readonly { x: number; y: number }[];
          removePositions: readonly { x: number; y: number }[];
        }[],
      ) => {
        expect(groups.length).toBeGreaterThan(0);
        for (const group of groups) {
          const expectedCnPositions = group.positions.filter(
            ({ x, y }) => plan.finalScene[x]?.[y] === CODES.CN,
          );
          expect(expectedCnPositions.length).toBeGreaterThan(0);
          expect(group.removePositions).toEqual(expectedCnPositions);
        }
        expect(
          groups
            .flatMap((group) => group.positions)
            .some(({ x, y }) => plan.finalScene[x]?.[y] === CODES.WL),
        ).toBe(true);
        expect(
          groups
            .flatMap((group) => group.removePositions)
            .some(({ x, y }) => plan.finalScene[x]?.[y] === CODES.WL),
        ).toBe(false);
        return { groups };
      },
      start: () => events.push("fg-win"),
      update: () => ({ completed: true }),
      clear: () => undefined,
    } as unknown as SymbolCascadePlayer;
    const popup = {
      start: () => events.push("bigwin"),
      update: () => ({
        completed: true,
        phase: "complete",
        displayedAmountRaw: 1,
      }),
      dismissImmediately: () => undefined,
    } as unknown as WinAmountAnimationPlayer;
    const playback = createGame002FreeGamePlayback({
      plan,
      runtime,
      cascadePlayer: cascade,
      winAmountPlayer: popup,
      backgroundPlayer: background,
      betAmountRaw: 1,
      winAmountRaw: 1,
      symbolCodes: CODES,
    });

    const completion = playback.start();
    for (let index = 0; index < 200 && playback.isRunning(); index += 1) {
      await Promise.resolve();
      playback.update(0.1);
    }
    await completion;

    expect(playback.isRunning()).toBe(false);
    expect(mode).toBe("BaseGame");
    expect(runtime.getVisualSnapshot().visibleScene).toEqual(plan.finalScene);
    expect(events.filter((event) => event.startsWith("spin:"))).toHaveLength(
      10,
    );
    expect(indexOf(events, "state:win:0")).toBeLessThan(
      indexOf(events, "mode:FreeGame"),
    );
    expect(indexOf(events, "state:feature:11")).toBeLessThan(
      indexOf(events, "state:change:11"),
    );
    expect(indexOf(events, "state:change:11")).toBeLessThan(
      indexOf(events, "state:feature:10"),
    );
    expect(indexOf(events, "fg-win")).toBeLessThan(indexOf(events, "bigwin"));
    expect(indexOf(events, "bigwin")).toBeLessThan(
      indexOf(events, "prepare:BaseGame"),
    );
    expect(events.at(-1)).toBe("mode:BaseGame");
    expect(events).toContain("af-number:1");
    expect(events).toContain("af-number:2");
  });
});

function createRuntime(
  initialScene: SceneMatrix,
  initialValues: Game002FreeGameValueMatrix,
  events: string[],
): Game002ReelRuntime {
  let scene = mutable(initialScene);
  let values = initialValues.map((column) => [...column]);
  const completions = new Map<string, number>();
  const runtime = {
    config: {
      symbolAnimationCapabilities: {
        WL: ["win", "feature1", "feature2"],
        AF: ["feature", "change"],
        CO: ["feature"],
        CN: ["feature1", "feature2"],
      },
    },
    getVisualSnapshot: () => ({
      visible: true,
      visibleScene: scene,
      presentationValues: values,
    }),
    startSelectiveSpin: (options: {
      sourceScene: SceneMatrix;
      targetScene: SceneMatrix;
      targetValues: Game002FreeGameValueMatrix;
      sceneName?: string;
    }) => {
      expect(scene).toEqual(options.sourceScene);
      events.push(`spin:${options.sceneName}`);
      scene = mutable(options.targetScene);
      values = options.targetValues.map((column) => [...column]);
      return {};
    },
    isSpinning: () => false,
    update: () => {
      for (const key of completions.keys())
        completions.set(key, (completions.get(key) ?? 0) + 1);
      return { completed: true };
    },
    requestVisibleSymbolStates: (
      positions: readonly { x: number; y: number }[],
      state: string,
    ) => {
      const codes = [
        ...new Set(positions.map(({ x, y }) => scene[x]![y]!)),
      ].sort((left, right) => left - right);
      events.push(`state:${state}:${codes.join(",")}`);
      for (const position of positions)
        completions.set(`${position.x},${position.y}`, 0);
    },
    getVisibleSymbolStateSnapshots: (
      positions: readonly { x: number; y: number }[],
    ) =>
      positions.map(({ x, y }) => ({
        x,
        y,
        code: scene[x]![y]!,
        kind: "animated",
        requestedState: null,
        resolvedState: null,
        isOnce: true,
        onceCompletionCount: completions.get(`${x},${y}`) ?? 0,
      })),
    setVisibleSymbolImageStringText: (
      _x: number,
      _y: number,
      _name: string,
      text: string,
    ) => events.push(`af-number:${text}`),
    prepareVisibleOccurrenceReplacement: (options: {
      x: number;
      y: number;
      expectedCode: number;
      outputCode: number;
      outputPresentationValue: number | null;
    }): PreparedVisibleOccurrenceReplacement => ({
      x: options.x,
      y: options.y,
      inputCode: options.expectedCode,
      outputCode: options.outputCode,
      commit: () => {
        expect(scene[options.x]![options.y]).toBe(options.expectedCode);
        scene[options.x]![options.y] = options.outputCode;
        values[options.x]![options.y] = options.outputPresentationValue;
      },
      rollback: () => undefined,
      destroy: () => undefined,
    }),
    prepareVisibleOccurrenceTransferBatch: (options: {
      transfers: readonly {
        source: { x: number; y: number };
        target: { x: number; y: number };
        expectedSourceCode: number;
        expectedTargetCode: number;
        sourceReplacementCode: number;
        sourceReplacementPresentationValue: number | null;
      }[];
    }): PreparedGridCellVisibleOccurrenceTransferBatch => ({
      transfers: options.transfers,
      start: () => undefined,
      setProgress: () => undefined,
      commit: () => {
        for (const transfer of options.transfers) {
          expect(scene[transfer.source.x]![transfer.source.y]).toBe(
            transfer.expectedSourceCode,
          );
          expect(scene[transfer.target.x]![transfer.target.y]).toBe(
            transfer.expectedTargetCode,
          );
          const sourceValue = values[transfer.source.x]![transfer.source.y]!;
          scene[transfer.target.x]![transfer.target.y] =
            transfer.expectedSourceCode;
          values[transfer.target.x]![transfer.target.y] = sourceValue;
          scene[transfer.source.x]![transfer.source.y] =
            transfer.sourceReplacementCode;
          values[transfer.source.x]![transfer.source.y] =
            transfer.sourceReplacementPresentationValue;
        }
      },
      rollback: () => undefined,
      destroy: () => undefined,
    }),
  };
  return runtime as unknown as Game002ReelRuntime;
}

function normalizeValues(
  raw: readonly (readonly number[])[],
  scene: SceneMatrix,
): Game002FreeGameValueMatrix {
  return scene.map((column, x) =>
    column.map((code, y) =>
      code === CODES.WL || code === CODES.CN
        ? raw[x]![y] === 0
          ? null
          : raw[x]![y]!
        : null,
    ),
  );
}

function mutable(scene: SceneMatrix): number[][] {
  return scene.map((column) => [...column]);
}

function indexOf(events: readonly string[], event: string): number {
  const index = events.indexOf(event);
  expect(index, `missing event ${event}`).toBeGreaterThanOrEqual(0);
  return index;
}
