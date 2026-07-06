import { describe, expect, it } from "vitest";
import {
  LogicParseError,
  createGameLogicFromGmi,
  getComponentWinResultGroups,
  parseWinResultPositions,
  type SceneMatrix,
} from "../src";

const COMPONENT_NAME = "winComponent";
const TARGET_SCENE = Object.freeze([
  Object.freeze([4, 7, 3]),
  Object.freeze([6, 4, 1]),
  Object.freeze([4, 6, 8]),
]) satisfies SceneMatrix;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("win result helpers", () => {
  it("parses paired positions without changing order", () => {
    expect(parseWinResultPositions({ pos: [0, 4, 1, 2, 2, 0] })).toEqual([
      { x: 0, y: 4 },
      { x: 1, y: 2 },
      { x: 2, y: 0 },
    ]);
  });

  it("keeps usedResults order and original result indexes", () => {
    const logic = createLogic({
      usedResults: [1, 0],
      results: [
        { pos: [0, 0], symbol: 4, symbolNums: 1, coinWin: 2, cashWin: 20 },
        {
          pos: [1, 1, 2, 0],
          symbol: 4,
          symbolNums: 2,
          coinWin: 3,
          cashWin: 30,
        },
      ],
    });
    const groups = getComponentWinResultGroups(
      logic.getStep(0),
      COMPONENT_NAME,
      {
        scene: TARGET_SCENE,
      },
    );

    expect(groups.map((group) => group.resultIndex)).toEqual([1, 0]);
    expect(groups.map((group) => group.positions)).toEqual([
      [
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
      [{ x: 0, y: 0 }],
    ]);
  });

  it("fails fast for malformed position arrays", () => {
    expect(() => parseWinResultPositions({ pos: [0] })).toThrow(
      LogicParseError,
    );
    expect(() => parseWinResultPositions({ pos: [0, -1] })).toThrow(
      LogicParseError,
    );
    expect(() => parseWinResultPositions({ pos: [0, 1.5] })).toThrow(
      LogicParseError,
    );
    expect(() => parseWinResultPositions({ pos: [0, 1, 0, 1] })).toThrow(
      /duplicate/,
    );
  });

  it("fails when a component references empty or out-of-bounds results", () => {
    expect(() =>
      getComponentWinResultGroups(
        createLogic({
          results: [{ pos: [], symbolNums: 0 }],
          usedResults: [0],
        }).getStep(0),
        COMPONENT_NAME,
      ),
    ).toThrow(/at least one/);

    expect(() =>
      getComponentWinResultGroups(
        createLogic({
          results: [{ pos: [3, 0], symbolNums: 1 }],
          usedResults: [0],
        }).getStep(0),
        COMPONENT_NAME,
        { scene: TARGET_SCENE },
      ),
    ).toThrow(/out of scene bounds/);

    expect(
      getComponentWinResultGroups(
        createLogic({
          results: [{ pos: [0, 0], symbol: 4, symbolNums: 2 }],
          usedResults: [0],
        }).getStep(0),
        COMPONENT_NAME,
        { scene: TARGET_SCENE },
      )[0].positions,
    ).toEqual([{ x: 0, y: 0 }]);
  });

  it("runs optional game-specific position validation only when provided", () => {
    const logic = createLogic({
      results: [{ pos: [0, 0], symbol: 7, symbolNums: 1 }],
      usedResults: [0],
    });

    expect(
      getComponentWinResultGroups(logic.getStep(0), COMPONENT_NAME, {
        scene: TARGET_SCENE,
      }),
    ).toHaveLength(1);
    expect(() =>
      getComponentWinResultGroups(logic.getStep(0), COMPONENT_NAME, {
        scene: TARGET_SCENE,
        validatePosition: ({ result, sceneSymbol }) => {
          if (result.symbol !== sceneSymbol) {
            throw new LogicParseError("custom symbol mismatch");
          }
        },
      }),
    ).toThrow(/custom symbol mismatch/);
  });

  it("returns empty groups for untriggered components", () => {
    const logic = createLogic({ historyComponents: [], mapComponents: {} });

    expect(
      getComponentWinResultGroups(logic.getStep(0), COMPONENT_NAME),
    ).toEqual([]);
  });

  it("keeps existing explicit failure when a triggered component mapping is missing", () => {
    const gmi = createGmi({
      historyComponents: [COMPONENT_NAME],
      mapComponents: {},
    });
    const logic = createGameLogicFromGmi(gmi, {
      bet: 1,
      lines: 10,
      totalwin: 0,
    });

    expect(() =>
      getComponentWinResultGroups(logic.getStep(0), COMPONENT_NAME),
    ).toThrow(LogicParseError);
  });
});

function createLogic(
  options: {
    readonly scene?: SceneMatrix;
    readonly results?: readonly Record<string, unknown>[];
    readonly usedResults?: readonly number[];
    readonly historyComponents?: readonly string[];
    readonly mapComponents?: Record<string, unknown>;
  } = {},
) {
  return createGameLogicFromGmi(createGmi(options), {
    bet: 1,
    lines: 10,
    totalwin: 0,
  });
}

function createGmi(
  options: {
    readonly scene?: SceneMatrix;
    readonly results?: readonly Record<string, unknown>[];
    readonly usedResults?: readonly number[];
    readonly historyComponents?: readonly string[];
    readonly mapComponents?: Record<string, unknown>;
  } = {},
): Record<string, unknown> {
  const results = options.results ?? [
    { pos: [0, 0], symbol: 4, symbolNums: 1, coinWin: 2, cashWin: 20 },
  ];
  const historyComponents = options.historyComponents ?? [COMPONENT_NAME];
  const mapComponents =
    options.mapComponents ??
    Object.freeze({
      [COMPONENT_NAME]: Object.freeze({
        basicComponentData: Object.freeze({
          usedScenes: Object.freeze([]),
          usedOtherScenes: Object.freeze([]),
          usedResults: Object.freeze(options.usedResults ?? [0]),
          usedPrizeScenes: Object.freeze([]),
          pos: Object.freeze([]),
          coinWin: 0,
          cashWin: 0,
          targetScene: 0,
          runIndex: 0,
          output: 0,
          strOutput: "",
        }),
      }),
    });

  return clone({
    defaultScene: toSgc7Scene(TARGET_SCENE),
    replyPlay: {
      randomNumbers: [],
      results: [
        {
          coinWin: 0,
          cashWin: 0,
          clientData: {
            scenes: [toSgc7Scene(options.scene ?? TARGET_SCENE)],
            otherScenes: [],
            results,
            curGameMod: "base",
            curGameModParam: {
              historyComponents,
              mapComponents,
            },
          },
        },
      ],
      finished: true,
    },
  });
}

function toSgc7Scene(scene: SceneMatrix): Record<string, unknown> {
  return {
    values: scene.map((column) => ({ values: [...column] })),
    indexes: [],
    validRow: [],
  };
}
