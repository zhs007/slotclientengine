import { describe, expect, it } from "vitest";
import {
  createSlotGameLogicResult,
  type GameLogic,
} from "@slotclientengine/gameframeworks";
import { createGame002CascadeSequence as createRawGame002CascadeSequence } from "../src/cascade-sequence.js";
import {
  resolveGame002WinResultCoinAmount,
  sortGame002CascadeCollectItems,
} from "../src/cascade-win-summary-config.js";
import {
  GAME002_CASCADE_DROPDOWN_SCENE,
  GAME002_CASCADE_GMI,
  GAME002_CASCADE_REFILL_POS,
  GAME002_CASCADE_REFILL_SCENE,
  GAME002_CASCADE_REMOVED_SCENE,
} from "./fixtures/game002-cascade-gmi.js";

function createGame002CascadeSequence(options: {
  readonly logic: GameLogic;
  readonly cnSymbolCode: number;
}) {
  return createRawGame002CascadeSequence({
    ...options,
    canRemoveSymbol: ({ code }) => code !== 0,
    canDropSymbol: ({ code }) => code !== 0,
  });
}

describe("game002 cascade sequence", () => {
  it("parses the complete two-step fixture and ignores historyComponentsEx", () => {
    const logic = createLogic(GAME002_CASCADE_GMI);
    expect(logic.getSteps()).toHaveLength(2);
    expect(logic.getStep(0).hasComponent("bg-win")).toBe(true);
    expect(logic.getStep(1).hasComponent("bg-win")).toBe(false);
    expect(logic.getTotalWin()).toBe(290);

    const sequence = createGame002CascadeSequence({ logic, cnSymbolCode: 8 });
    expect(sequence.initial.winStage?.groups).toHaveLength(3);
    expect(
      sequence.initial.winStage?.groups.map((group) => group.resultIndex),
    ).toEqual([2, 0, 1]);
    const groups = sequence.initial.winStage!.groups;
    expect(
      groups.map((group, groupIndex) =>
        resolveGame002WinResultCoinAmount({ group, groupIndex }),
      ),
    ).toEqual([8, 18, 3]);
    const collectItems = sortGame002CascadeCollectItems(
      groups[0].positions.flatMap((position, positionIndex) =>
        sequence.initial.winStage!.sourceScene[position.x][position.y] === 8
          ? [
              {
                group: groups[0],
                groupIndex: 0,
                position,
                positionIndex,
              },
            ]
          : [],
      ),
    );
    expect(groups[0].positions).toHaveLength(4);
    expect(groups[0].positions).toContainEqual({ x: 0, y: 5 });
    expect(collectItems.map(({ position }) => position)).toEqual([
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 4, y: 1 },
    ]);
    expect(
      collectItems.map(
        ({ position }) =>
          sequence.initial.winStage!.sourceValues[position.x][position.y],
      ),
    ).toEqual([1, 2, 5]);
    expect([0, 180, 180 + 30, 210 + 10, 220 + 20, 290]).toEqual([
      0, 180, 210, 220, 240, 290,
    ]);
    expect(sequence.initial.winStage?.removedNum).toBe(12);
    expect(sequence.initial.winStage?.outputScene).toEqual(
      GAME002_CASCADE_REMOVED_SCENE,
    );
    expect(sequence.cascades).toHaveLength(1);
    expect(sequence.cascades[0].dropdownScene).toEqual(
      GAME002_CASCADE_DROPDOWN_SCENE,
    );
    expect(sequence.cascades[0].refillScene).toEqual(
      GAME002_CASCADE_REFILL_SCENE,
    );
    expect(
      sequence.cascades[0].refillPositions.flatMap(({ x, y }) => [x, y]),
    ).toEqual(GAME002_CASCADE_REFILL_POS);
    expect(sequence.cascades[0].refillValues[1][0]).toBe(1);
    expect(sequence.cascades[0].dropdownScene[4][6]).not.toBe(8);
    expect(sequence.cascades[0].dropdownValues[4][6]).toBeNull();
    expect(sequence.cascades[0].refillValues[4][6]).toBeNull();
    expect(sequence.cascades[0].winStage).toBeUndefined();
    expect(sequence.finalScene).toEqual(GAME002_CASCADE_REFILL_SCENE);
    expect(Object.isFrozen(sequence)).toBe(true);
  });

  it("keeps a shared WL out of every remove group", () => {
    const sequence = createGame002CascadeSequence({
      logic: createLogic(GAME002_CASCADE_GMI),
      cnSymbolCode: 8,
    });
    const groups = sequence.initial.winStage!.groups;
    expect(groups[0].positions).toContainEqual({ x: 0, y: 5 });
    expect(groups[0].removePositions).toHaveLength(3);
    expect(groups[0].removePositions).not.toContainEqual({ x: 0, y: 5 });
    expect(groups[1].removePositions).toHaveLength(5);
    expect(groups[1].removePositions).not.toContainEqual({ x: 0, y: 5 });
    expect(groups[2].removePositions).toHaveLength(4);
    expect(
      new Set(
        groups.flatMap((group) =>
          group.removePositions.map(({ x, y }) => `${x},${y}`),
        ),
      ).size,
    ).toBe(12);
  });

  it("rejects component, remove, dropdown, refill and value drift before playback", () => {
    const mutations: Array<(value: any) => void> = [
      (value) =>
        (value.gmi.replyPlay.results[0].clientData.curGameModParam.historyComponents =
          ["bg-gencoins", "bg-win", "bg-remove"]),
      (value) =>
        (value.gmi.replyPlay.results[0].clientData.curGameModParam.historyComponents =
          ["bg-spin", "bg-gencoins", "bg-win"]),
      (value) =>
        (value.gmi.replyPlay.results[0].clientData.scenes[1].values[0].values[3] = 4),
      (value) =>
        (value.gmi.replyPlay.results[1].clientData.scenes[0].values[0].values[0] = 5),
      (value) =>
        (value.gmi.replyPlay.results[1].clientData.scenes[1].values[0].values[3] = 5),
      (value) =>
        value.gmi.replyPlay.results[1].clientData.curGameModParam.mapComponents[
          "bg-refill"
        ].basicComponentData.pos.pop(),
      (value) =>
        (value.gmi.replyPlay.results[1].clientData.otherScenes[3].values[1].values[0] = 0),
      (value) =>
        value.gmi.replyPlay.results.push(
          structuredClone(value.gmi.replyPlay.results[1]),
        ),
    ];
    for (const mutate of mutations) {
      const value = structuredClone(GAME002_CASCADE_GMI);
      mutate(value);
      expect(() =>
        createGame002CascadeSequence({
          logic: createLogic(value),
          cnSymbolCode: 8,
        }),
      ).toThrow();
    }
  });

  it("supports a terminal non-winning spin with server or local CN values", () => {
    const server = terminalSpinFixture(true);
    const serverSequence = createGame002CascadeSequence({
      logic: createLogic(server),
      cnSymbolCode: 8,
    });
    expect(serverSequence.initial.usesServerValues).toBe(true);
    expect(serverSequence.cascades).toEqual([]);

    const local = terminalSpinFixture(false);
    const localSequence = createGame002CascadeSequence({
      logic: createLogic(local),
      cnSymbolCode: 8,
    });
    expect(localSequence.initial.usesServerValues).toBe(false);
    expect(
      localSequence.initial.spinValues.flat().every((value) => value === null),
    ).toBe(true);
  });

  it("carries existing CN values when a refill adds no CN and omits bg-gencoins", () => {
    const value = structuredClone(GAME002_CASCADE_GMI) as any;
    const stableX = 3;
    const stableY = 0;
    const carriedValue = 5;
    step(value, 0).scenes[0].values[stableX].values[stableY] = 8;
    step(value, 0).scenes[1].values[stableX].values[stableY] = 8;
    step(value, 0).otherScenes[0].values[stableX].values[stableY] =
      carriedValue;
    step(value, 0).otherScenes[1].values[stableX].values[stableY] =
      carriedValue;
    step(value, 1).scenes[0].values[stableX].values[stableY] = 8;
    step(value, 1).scenes[1].values[stableX].values[stableY] = 8;
    step(value, 1).scenes[2].values[stableX].values[stableY] = 8;
    step(value, 1).otherScenes[1].values[stableX].values[stableY] =
      carriedValue;

    step(value, 1).scenes[2].values[1].values[0] = 3;
    removeHistory(value, 1, "bg-gencoins");
    delete cascade(value).mapComponents["bg-gencoins"];

    const sequence = createGame002CascadeSequence({
      logic: createLogic(value),
      cnSymbolCode: 8,
    });
    expect(sequence.cascades[0].refillValues[stableX][stableY]).toBe(
      carriedValue,
    );
    expect(sequence.cascades[0].refillValues[1][0]).toBeNull();
  });

  it("derives remove, dropdown and refill values when unchanged component otherScenes are omitted", () => {
    const value = structuredClone(GAME002_CASCADE_GMI) as any;
    const initialValues = structuredClone(step(value, 0).otherScenes[0]);
    step(value, 0).otherScenes = [initialValues];
    spin(value).mapComponents["bg-remove"].basicComponentData.usedOtherScenes =
      [];

    const finalValues = structuredClone(step(value, 1).otherScenes[3]);
    step(value, 1).otherScenes = [finalValues];
    cascade(value).mapComponents[
      "bg-dropdown"
    ].basicComponentData.usedOtherScenes = [];
    cascade(value).mapComponents[
      "bg-refill"
    ].basicComponentData.usedOtherScenes = [];
    cascade(value).mapComponents[
      "bg-gencoins"
    ].basicComponentData.usedOtherScenes = [0];

    const sequence = createGame002CascadeSequence({
      logic: createLogic(value),
      cnSymbolCode: 8,
    });
    expect(sequence.initial.winStage?.outputValues[4][0]).toBe(-1);
    expect(sequence.initial.winStage?.outputValues[3][0]).toBeNull();
    expect(sequence.cascades[0].dropdownValues[4][6]).toBeNull();
    expect(sequence.cascades[0].refillValues[1][0]).toBe(1);
  });

  it("treats a triggered but empty initial bg-gencoins delta as local values", () => {
    const value = terminalSpinFixture(true) as any;
    step(value, 0).otherScenes = [];
    spin(value).mapComponents[
      "bg-gencoins"
    ].basicComponentData.usedOtherScenes = [];
    const sequence = createGame002CascadeSequence({
      logic: createLogic(value),
      cnSymbolCode: 8,
    });
    expect(sequence.initial.usesServerValues).toBe(false);
    expect(
      sequence.initial.spinValues.flat().every((item) => item === null),
    ).toBe(true);
  });

  it("rejects every malformed protocol boundary without fallback", () => {
    expect(() =>
      createGame002CascadeSequence({
        logic: { getSteps: () => [] } as any,
        cnSymbolCode: 8,
      }),
    ).toThrow(/at least one step/);
    expect(() =>
      createGame002CascadeSequence({
        logic: createLogic(GAME002_CASCADE_GMI),
        cnSymbolCode: -1,
      }),
    ).toThrow(/non-negative/);

    const mutations: Array<(value: any) => void> = [
      (value) =>
        spin(value).mapComponents[
          "bg-spin"
        ].basicComponentData.usedScenes.splice(0),
      (value) =>
        spin(value).mapComponents["bg-spin"].basicComponentData.usedScenes.push(
          0,
        ),
      (value) =>
        spin(value).mapComponents[
          "bg-gencoins"
        ].basicComponentData.usedOtherScenes.push(0),
      (value) => (step(value, 0).otherScenes[0].values[0].values[0] = -2),
      (value) => (step(value, 0).otherScenes[0].values[0].values[0] = 2),
      (value) => step(value, 0).otherScenes[0].values.pop(),
      (value) => step(value, 0).otherScenes[0].values[0].values.pop(),
      (value) => value.gmi.replyPlay.results.splice(1),
      (value) => removeHistory(value, 0, "bg-win"),
      (value) => removeHistory(value, 1, "bg-respin"),
      (value) => removeHistory(value, 1, "bg-dropdown"),
      (value) => removeHistory(value, 1, "bg-refill"),
      (value) => removeHistory(value, 1, "bg-gencoins"),
      (value) =>
        cascade(value).mapComponents[
          "bg-gencoins"
        ].basicComponentData.usedOtherScenes.splice(0),
      (value) =>
        (cascade(value).mapComponents[
          "bg-dropdown"
        ].basicComponentData.srcScenes = []),
      (value) =>
        cascade(value).mapComponents[
          "bg-dropdown"
        ].basicComponentData.srcScenes.push(1),
      (value) =>
        (cascade(value).mapComponents[
          "bg-dropdown"
        ].basicComponentData.srcScenes = null),
      (value) =>
        (cascade(value).mapComponents[
          "bg-dropdown"
        ].basicComponentData.srcScenes = [-1]),
      (value) =>
        cascade(value).mapComponents[
          "bg-dropdown"
        ].basicComponentData.usedScenes.push(1),
      (value) =>
        cascade(value).mapComponents[
          "bg-dropdown"
        ].basicComponentData.usedOtherScenes.push(1),
      (value) => (step(value, 1).scenes[0].values[0].values[3] = -2),
      (value) => (step(value, 1).otherScenes[1].values[0].values[0] = 0),
      (value) => (step(value, 1).otherScenes[1].values[0].values[3] = -2),
      (value) =>
        (cascade(value).mapComponents["bg-refill"].basicComponentData.pos = []),
      (value) =>
        cascade(value).mapComponents["bg-refill"].basicComponentData.pos.pop(),
      (value) =>
        cascade(value).mapComponents["bg-refill"].basicComponentData.pos.push(
          0,
          0,
        ),
      (value) =>
        (cascade(value).mapComponents["bg-refill"].basicComponentData.pos[0] =
          9),
      (value) =>
        cascade(value).mapComponents["bg-refill"].basicComponentData.pos.splice(
          0,
          2,
        ),
      (value) =>
        cascade(value).mapComponents[
          "bg-refill"
        ].basicComponentData.usedScenes.push(2),
      (value) =>
        cascade(value).mapComponents[
          "bg-refill"
        ].basicComponentData.usedOtherScenes.push(2),
      (value) => (step(value, 1).scenes[2].values[3].values[0] = 6),
      (value) => (step(value, 1).scenes[2].values[0].values[0] = -1),
      (value) => (step(value, 1).otherScenes[3].values[3].values[0] = 2),
      (value) => (step(value, 1).otherScenes[3].values[3].values[0] = -2),
      (value) =>
        spin(value).mapComponents[
          "bg-remove"
        ].basicComponentData.usedScenes.push(1),
      (value) =>
        spin(value).mapComponents[
          "bg-remove"
        ].basicComponentData.usedOtherScenes.push(1),
      (value) => (step(value, 0).otherScenes[1].values[0].values[3] = 0),
      (value) => (spin(value).mapComponents["bg-remove"].removedNum = -1),
      (value) => (spin(value).mapComponents["bg-remove"].removedNum = 1.5),
    ];
    for (const [index, mutate] of mutations.entries()) {
      const value = structuredClone(GAME002_CASCADE_GMI);
      mutate(value);
      expect(
        () =>
          createGame002CascadeSequence({
            logic: createLogic(value),
            cnSymbolCode: 8,
          }),
        `protocol mutation ${index} must fail`,
      ).toThrow();
    }
  });
});

function terminalSpinFixture(withServerValues: boolean) {
  const value = structuredClone(GAME002_CASCADE_GMI) as any;
  value.gmi.replyPlay.results.splice(1);
  value.results = 1;
  const params = spin(value);
  params.historyComponents = withServerValues
    ? ["bg-spin", "bg-gencoins"]
    : ["bg-spin"];
  delete params.mapComponents["bg-win"];
  delete params.mapComponents["bg-remove"];
  if (!withServerValues) delete params.mapComponents["bg-gencoins"];
  return value;
}

function step(value: any, index: number) {
  return value.gmi.replyPlay.results[index].clientData;
}

function spin(value: any) {
  return step(value, 0).curGameModParam;
}

function cascade(value: any) {
  return step(value, 1).curGameModParam;
}

function removeHistory(value: any, index: number, component: string) {
  const history = step(value, index).curGameModParam.historyComponents;
  history.splice(history.indexOf(component), 1);
}

function createLogic(value: unknown) {
  return createSlotGameLogicResult(value, {
    bet: { bet: 10, lines: 30, times: 1 },
    userInfo: { gameid: 0 },
  }).logic;
}
