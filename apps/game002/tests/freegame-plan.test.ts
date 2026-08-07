import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSlotGameLogicResult,
  type GameLogic,
} from "@slotclientengine/gameframeworks";
import { compileGame002FreeGamePlan } from "../src/freegame-plan.js";
import {
  compileGame002OperationPlanFromFacts,
  compileGame002BaseGameOperationPlan,
  compileGame002RoundOperationPlan,
  decodeGame002RoundFacts,
} from "../src/game002-operation-compiler.js";
import type { Game002ReelRuntime } from "../src/game002-reel-controller.js";

const SAMPLE_RESULTS = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../../docs/crave/gameresults.json"),
    "utf8",
  ),
) as unknown[];

const CODES = Object.freeze({
  WL: 0,
  CN: 8,
  CO: 10,
  AF: 11,
  BN: 12,
});
const DISPLAY_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
  "BN",
]);

function compilerRuntime() {
  return {
    gameConfig: {
      getSymbolCode: (symbol: string) => DISPLAY_SYMBOLS.indexOf(symbol),
    },
  } as Game002ReelRuntime;
}

describe("game002 FreeGame plan", () => {
  it("serializes FreeGame as explicit frontend operations without server steps", () => {
    const logic = createSampleLogic();
    const options = {
      logic,
      runtime: compilerRuntime(),
      displaySymbols: DISPLAY_SYMBOLS,
    } as const;
    const facts = decodeGame002RoundFacts(options);
    const compilation = compileGame002OperationPlanFromFacts(facts);
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts.drafts)).toBe(true);
    expect(facts.drafts.every(Object.isFrozen)).toBe(true);
    expect(compilation).toEqual(compileGame002RoundOperationPlan(options));
    const kinds = compilation.plan.operations.map(
      (operation) => operation.kind,
    );
    expect(kinds).toContain("game002:freegame-trigger");
    expect(kinds).toContain("game002:freegame-enter");
    expect(
      kinds.filter((kind) => kind === "game002:freegame-spin"),
    ).toHaveLength(10);
    expect(kinds).toContain("game002:freegame-af");
    expect(kinds).toContain("game002:freegame-co");
    expect(kinds).toContain("game002:freegame-win");
    expect(kinds).toContain("game002:freegame-popup");
    expect(kinds.at(-1)).toBe("game002:freegame-exit");
    expect(
      compilation.plan.operations.some(
        (operation) =>
          Object.prototype.hasOwnProperty.call(operation.payload, "step") ||
          Object.prototype.hasOwnProperty.call(operation.payload, "stepIndex"),
      ),
    ).toBe(false);
  });

  it("compiles the complete authoritative 18-step sample before playback", () => {
    const logic = createSampleLogic();
    const basePlan = compileGame002BaseGameOperationPlan({
      logic: sliceLogic(logic, 8),
      runtime: compilerRuntime(),
      displaySymbols: DISPLAY_SYMBOLS,
      includeWinAmount: false,
    }).plan;
    const plan = compileGame002FreeGamePlan({
      logic,
      entryScene: basePlan.final.scene,
      entryValues: basePlan.final.values.map((column) =>
        column.map((value) => (value === -1 ? null : value)),
      ),
      symbolCodes: CODES,
    });

    expect(plan).not.toBeNull();
    expect(plan?.triggerStepIndex).toBe(7);
    expect(plan?.initialFreeSpins).toBe(7);
    expect(plan?.spins).toHaveLength(10);
    expect(plan?.spins.map((spin) => spin.respinNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(plan?.spins.map((spin) => spin.remainingFreeSpins)).toEqual([
      7, 6, 5, 4, 3, 2, 1, 2, 1, 0,
    ]);
    expect(
      plan?.spins
        .filter((spin) => spin.af)
        .map((spin) => spin.af?.addedFreeSpins),
    ).toEqual([1, 2]);
    expect(
      plan?.spins.filter((spin) => spin.co).map((spin) => spin.stepIndex),
    ).toEqual([11, 12, 14, 17]);
    expect(plan?.spins.at(-1)?.winResults).toHaveLength(2);
    expect(plan?.finalStepIndex).toBe(17);
    for (const spin of plan?.spins ?? []) {
      expect(spin.featurePositions.length).toBeLessThan(
        spin.spinPositions.length,
      );
      for (const { x, y } of spin.spinPositions)
        expect([CODES.WL, CODES.CN]).not.toContain(spin.inputScene[x]![y]);
      expect(Object.isFrozen(spin)).toBe(true);
    }
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("rejects counter drift before presentation mutation", () => {
    const logic = createSampleLogic();
    const firstFreeSpin = logic.getStep(8);
    const entryScene = firstFreeSpin.getScene(0);
    const entryValues = firstFreeSpin
      .getOtherScene(0)
      .map((column, x) =>
        column.map((value, y) =>
          entryScene[x]![y] === CODES.WL || entryScene[x]![y] === CODES.CN
            ? value === 0
              ? null
              : value
            : null,
        ),
      );
    const raw = structuredClone(createSampleMessage());
    const result = raw.gmi.replyPlay.results[9] as {
      clientData: {
        curGameModParam: {
          mapComponents: Record<string, { lastRespinNum?: number }>;
        };
      };
    };
    result.clientData.curGameModParam.mapComponents["fg-start"]!.lastRespinNum =
      99;
    const drifted = createSlotGameLogicResult(raw, {
      bet: { bet: 1, lines: 1, times: 1 },
      userInfo: { gameid: 2 },
    }).logic;
    expect(() =>
      compileGame002FreeGamePlan({
        logic: drifted,
        entryScene,
        entryValues,
        symbolCodes: CODES,
      }),
    ).toThrow(/lastRespinNum=99/);
  });

  it("returns null when the round has no FreeGame trigger", () => {
    const raw = structuredClone(createSampleMessage());
    removeActiveComponent(raw, 7, "bg-triggerfg");
    expect(compileFreeGame(raw)).toBeNull();
  });

  it("accepts a CO vortex segment without a trailing separator", () => {
    const raw = structuredClone(createSampleMessage());
    const encoded = components(raw, 11)["fg-vortex"]!.pos;
    if (!Array.isArray(encoded)) throw new Error("expected vortex array");
    encoded.pop();
    expect(compileFreeGame(raw)).not.toBeNull();
  });

  it.each([
    {
      name: "wrong trigger result type",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        result(raw, 7, 2).type = 4;
      },
      error: /type=5 WL/,
    },
    {
      name: "wrong trigger symbol",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        result(raw, 7, 2).symbol = CODES.CN;
      },
      error: /type=5 WL/,
    },
    {
      name: "multiple trigger results",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        basic(raw, 7, "bg-triggerfg").usedResults = [2, 2];
      },
      error: /exactly one type=5 WL/,
    },
    {
      name: "duplicate trigger position",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const pos = result(raw, 7, 2).pos;
        if (!Array.isArray(pos)) throw new Error("expected trigger positions");
        result(raw, 7, 2).pos = [pos[0], pos[1], pos[0], pos[1]];
      },
      error: /contains duplicate/,
    },
    {
      name: "missing trigger counter component",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        delete components(raw, 7)["fg-start"];
      },
      error: /fg-start is missing/,
    },
    {
      name: "paid BaseGame win beside trigger",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        addActiveComponent(
          raw,
          7,
          "bg-win",
          structuredClone(components(raw, 7)["bg-triggerfg"]!),
        );
      },
      error: /must not coexist/,
    },
    {
      name: "non-zero initial respin",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 7)["fg-start"]!.curRespinNum = 1;
      },
      error: /curRespinNum must be 0/,
    },
    {
      name: "non-positive initial remaining count",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 7)["fg-start"]!.lastRespinNum = 0;
      },
      error: /lastRespinNum must be >= 1/,
    },
    {
      name: "missing spin protocol",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        removeActiveComponent(raw, 9, "fg-spin");
      },
      error: /must contain fg-start and fg-spin/,
    },
    {
      name: "respin number drift",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 9)["fg-start"]!.curRespinNum = 99;
      },
      error: /expected 2/,
    },
    {
      name: "negative respin number",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 9)["fg-start"]!.curRespinNum = -1;
      },
      error: /must be >= 0/,
    },
    {
      name: "FreeGame source continuity drift",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        sceneCell(raw, 9, 0, 0, 0, 1);
      },
      error: /FreeGame source.*differs/,
    },
    {
      name: "invalid feature position",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 9)["fg-spin"]!.pos = [99, 99];
      },
      error: /out of bounds/,
    },
    {
      name: "duplicate feature position",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const pos = components(raw, 9)["fg-spin"]!.pos;
        if (!Array.isArray(pos)) throw new Error("expected feature positions");
        components(raw, 9)["fg-spin"]!.pos = [pos[0], pos[1], pos[0], pos[1]];
      },
      error: /contains duplicate/,
    },
    {
      name: "illegal feature output symbol",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const component = components(raw, 9)["fg-spin"]!;
        const pos = component.pos;
        if (!Array.isArray(pos)) throw new Error("expected feature positions");
        const sceneIndex = basic(raw, 9, "fg-spin").usedScenes[0]!;
        sceneCell(raw, 9, sceneIndex, pos[0] as number, pos[1] as number, 1);
      },
      error: /has illegal symbol code/,
    },
    {
      name: "missing spin output scene",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        basic(raw, 9, "fg-spin").usedScenes = [];
      },
      error: /must reference exactly one scene/,
    },
    {
      name: "missing spin value scene",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        basic(raw, 9, "fg-spin").usedOtherScenes = [];
      },
      error: /must reference exactly one otherScene/,
    },
    {
      name: "empty spin scene",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const sceneIndex = basic(raw, 9, "fg-spin").usedScenes[0]!;
        sceneColumns(raw, 9, sceneIndex).length = 0;
      },
      error: /must contain columns/,
    },
    {
      name: "spin scene with no rows",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const sceneIndex = basic(raw, 9, "fg-spin").usedScenes[0]!;
        sceneColumns(raw, 9, sceneIndex)[0]!.values.length = 0;
      },
      error: /must contain rows/,
    },
    {
      name: "spin scene with inconsistent rows",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const sceneIndex = basic(raw, 9, "fg-spin").usedScenes[0]!;
        sceneColumns(raw, 9, sceneIndex)[1]!.values.pop();
      },
      error: /inconsistent rows/,
    },
    {
      name: "spin scene with invalid code",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const sceneIndex = basic(raw, 9, "fg-spin").usedScenes[0]!;
        sceneCell(raw, 9, sceneIndex, 0, 0, -2);
      },
      error: /invalid symbol code/,
    },
    {
      name: "spin values with wrong dimensions",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const valueIndex = basic(raw, 9, "fg-spin").usedOtherScenes[0]!;
        otherSceneColumns(raw, 9, valueIndex).pop();
      },
      error: /width differs/,
    },
    {
      name: "partial AF protocol",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        removeActiveComponent(raw, 8, "fg-rollaf");
      },
      error: /AF protocol is partial/,
    },
    {
      name: "non-positive AF award",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 8)["fg-rollaf"]!.number = 0;
      },
      error: /fg-rollaf.number must be >= 1/,
    },
    {
      name: "AF replacement position drift",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 8)["fg-af2cn"]!.pos = [0, 0];
      },
      error: /does not match its trigger positions/,
    },
    {
      name: "empty AF trigger",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        basic(raw, 8, "fg-triggeraf").usedResults = [];
      },
      error: /must select AF positions/,
    },
    {
      name: "AF trigger selects a non-AF",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        result(raw, 8, 0).pos = [0, 0];
      },
      error: /must use symbol code 11/,
    },
    {
      name: "AF changes an undeclared cell",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const sceneIndex = basic(raw, 8, "fg-af2cn").usedScenes[0]!;
        sceneCell(raw, 8, sceneIndex, 0, 0, 1);
      },
      error: /changed undeclared cell/,
    },
    {
      name: "AF does not convert its selected cell",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const sceneIndex = basic(raw, 8, "fg-af2cn").usedScenes[0]!;
        sceneCell(raw, 8, sceneIndex, 4, 5, CODES.AF);
      },
      error: /must change 11 -> 8/,
    },
    {
      name: "AF generates an invalid CN value",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const valueIndex = basic(raw, 8, "fg-genafcn").usedOtherScenes[0]!;
        otherSceneCell(raw, 8, valueIndex, 4, 5, -1);
      },
      error: /must be positive for WL\/CN/,
    },
    {
      name: "partial CO protocol",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        removeActiveComponent(raw, 11, "fg-cogencn");
      },
      error: /CO protocol is partial/,
    },
    {
      name: "illegal CO source",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 11)["fg-vortex"]!.pos = [0, 0, 0, 6, -1];
      },
      error: /must be WL or CN/,
    },
    {
      name: "reused CO source",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 11)["fg-vortex"]!.pos = [1, 0, 0, 6, 1, 0, 0, 4, -1];
      },
      error: /reuses position/,
    },
    {
      name: "empty CO trigger",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        basic(raw, 11, "fg-triggerco").usedResults = [];
      },
      error: /segment count must match/,
    },
    {
      name: "invalid CO vortex encoding",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 11)["fg-vortex"]!.pos = "invalid";
      },
      error: /must be an array/,
    },
    {
      name: "CO vortex has no segment",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 11)["fg-vortex"]!.pos = [];
      },
      error: /has no segment/,
    },
    {
      name: "partial CO vortex tuple",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 11)["fg-vortex"]!.pos = [1, 0, 0];
      },
      error: /partial tuple/,
    },
    {
      name: "CO vortex has an empty segment",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 11)["fg-vortex"]!.pos = [-1];
      },
      error: /separator at 0 is invalid/,
    },
    {
      name: "CO target is not adjacent",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 11)["fg-vortex"]!.pos = [1, 0, 5, 8, -1];
      },
      error: /must map to exactly one CO/,
    },
    {
      name: "CO output scene drift",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        const sceneIndex = basic(raw, 11, "fg-vortex").usedScenes[0]!;
        sceneCell(raw, 11, sceneIndex, 0, 0, 1);
      },
      error: /fg-vortex output.*differs/,
    },
    {
      name: "missing terminal win",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        removeActiveComponent(raw, 17, "fg-win");
      },
      error: /lastRespinNum=0 requires terminal fg-win/,
    },
    {
      name: "wrong terminal win type",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        result(raw, 17, 1).type = 5;
      },
      error: /must be type=6 CN/,
    },
    {
      name: "wrong terminal win symbol",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        result(raw, 17, 1).symbol = CODES.WL;
      },
      error: /must be type=6 CN/,
    },
    {
      name: "invalid terminal win position list",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        result(raw, 17, 1).pos = [0];
      },
      error: /must contain x\/y pairs/,
    },
    {
      name: "terminal remaining count",
      mutate: (raw: ReturnType<typeof createSampleMessage>) => {
        components(raw, 17)["fg-start"]!.lastRespinNum = 1;
      },
      error: /expected 0/,
    },
  ])("rejects $name before presentation mutation", ({ mutate, error }) => {
    const raw = structuredClone(createSampleMessage());
    mutate(raw);
    expect(() => compileFreeGame(raw)).toThrow(error);
  });
});

function createSampleLogic() {
  return createSlotGameLogicResult(createSampleMessage(), {
    bet: { bet: 1, lines: 1, times: 1 },
    userInfo: { gameid: 2 },
  }).logic;
}

function createSampleMessage() {
  const first = SAMPLE_RESULTS[0] as {
    clientData: { scenes: readonly unknown[] };
  };
  return {
    gmi: {
      defaultScene: first.clientData.scenes[0],
      replyPlay: {
        randomNumbers: [],
        results: SAMPLE_RESULTS,
      },
    },
    totalwin: 1,
    results: SAMPLE_RESULTS.length,
  };
}

function compileFreeGame(raw: ReturnType<typeof createSampleMessage>) {
  const logic = createSlotGameLogicResult(raw, {
    bet: { bet: 1, lines: 1, times: 1 },
    userInfo: { gameid: 2 },
  }).logic;
  const firstFreeSpin = logic.getStep(8);
  const entryScene = firstFreeSpin.getScene(0);
  const entryValues = firstFreeSpin
    .getOtherScene(0)
    .map((column, x) =>
      column.map((value, y) =>
        entryScene[x]![y] === CODES.WL || entryScene[x]![y] === CODES.CN
          ? value === 0
            ? null
            : value
          : null,
      ),
    );
  return compileGame002FreeGamePlan({
    logic,
    entryScene,
    entryValues,
    symbolCodes: CODES,
  });
}

function components(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
): Record<string, Record<string, unknown>> {
  return (
    raw.gmi.replyPlay.results[stepIndex] as {
      clientData: {
        curGameModParam: {
          mapComponents: Record<string, Record<string, unknown>>;
        };
      };
    }
  ).clientData.curGameModParam.mapComponents;
}

function removeActiveComponent(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
  name: string,
): void {
  const param = gameModeParam(raw, stepIndex);
  param.historyComponents = param.historyComponents.filter(
    (candidate) => candidate !== name,
  );
}

function addActiveComponent(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
  name: string,
  component: Record<string, unknown>,
): void {
  const param = gameModeParam(raw, stepIndex);
  param.mapComponents[name] = component;
  if (!param.historyComponents.includes(name))
    param.historyComponents.push(name);
}

function gameModeParam(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
): {
  historyComponents: string[];
  mapComponents: Record<string, Record<string, unknown>>;
} {
  return (
    raw.gmi.replyPlay.results[stepIndex] as {
      clientData: {
        curGameModParam: {
          historyComponents: string[];
          mapComponents: Record<string, Record<string, unknown>>;
        };
      };
    }
  ).clientData.curGameModParam;
}

function basic(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
  name: string,
): {
  usedScenes: number[];
  usedOtherScenes: number[];
  usedResults: number[];
} {
  return components(raw, stepIndex)[name]!.basicComponentData as {
    usedScenes: number[];
    usedOtherScenes: number[];
    usedResults: number[];
  };
}

function sceneCell(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
  sceneIndex: number,
  x: number,
  y: number,
  value: number,
): void {
  sceneColumns(raw, stepIndex, sceneIndex)[x]!.values[y] = value;
}

function otherSceneCell(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
  sceneIndex: number,
  x: number,
  y: number,
  value: number,
): void {
  otherSceneColumns(raw, stepIndex, sceneIndex)[x]!.values[y] = value;
}

function sceneColumns(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
  sceneIndex: number,
): Array<{ values: number[] }> {
  const clientData = (
    raw.gmi.replyPlay.results[stepIndex] as {
      clientData: {
        scenes: Array<{ values: Array<{ values: number[] }> }>;
      };
    }
  ).clientData;
  return clientData.scenes[sceneIndex]!.values;
}

function otherSceneColumns(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
  sceneIndex: number,
): Array<{ values: number[] }> {
  const clientData = (
    raw.gmi.replyPlay.results[stepIndex] as {
      clientData: {
        otherScenes: Array<{ values: Array<{ values: number[] }> }>;
      };
    }
  ).clientData;
  return clientData.otherScenes[sceneIndex]!.values;
}

function result(
  raw: ReturnType<typeof createSampleMessage>,
  stepIndex: number,
  resultIndex: number,
): Record<string, unknown> {
  return (
    raw.gmi.replyPlay.results[stepIndex] as {
      clientData: { results: Array<Record<string, unknown>> };
    }
  ).clientData.results[resultIndex]!;
}

function sliceLogic(source: GameLogic, length: number): GameLogic {
  const steps = Object.freeze(source.getSteps().slice(0, length));
  const getStep = (index: number) => {
    const step = steps[index];
    if (!step) throw new RangeError(`step ${index} is out of range.`);
    return step;
  };
  const sliced: GameLogic = {
    getGameModuleName: () => source.getGameModuleName(),
    getGameId: () => source.getGameId(),
    getBet: () => source.getBet(),
    getLines: () => source.getLines(),
    getTotalWin: () => source.getTotalWin(),
    getPlayWin: () => source.getPlayWin(),
    getRawMessage: () => source.getRawMessage(),
    getRawGmi: () => source.getRawGmi(),
    getDefaultScene: () => source.getDefaultScene(),
    getRandomNumbers: () => source.getRandomNumbers(),
    getStepCount: () => steps.length,
    getStep,
    getSteps: () => steps,
    getScene: (stepIndex, sceneIndex) =>
      getStep(stepIndex).getScene(sceneIndex),
    getOtherScene: (stepIndex, sceneIndex) =>
      getStep(stepIndex).getOtherScene(sceneIndex),
    getResult: (stepIndex, resultIndex) =>
      getStep(stepIndex).getResult(resultIndex),
    hasComponent: (stepIndex, name) => getStep(stepIndex).hasComponent(name),
    getComponent: (stepIndex, name) => getStep(stepIndex).getComponent(name),
    getComponentScenes: (stepIndex, name) =>
      getStep(stepIndex).getComponentScenes(name),
    getComponentOtherScenes: (stepIndex, name) =>
      getStep(stepIndex).getComponentOtherScenes(name),
    getComponentResults: (stepIndex, name) =>
      getStep(stepIndex).getComponentResults(name),
  };
  return Object.freeze(sliced);
}
