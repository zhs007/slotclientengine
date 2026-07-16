import type {
  GameLogic,
  GameLogicStep,
  OtherSceneMatrix,
  SceneMatrix,
  WinResultPosition,
} from "@slotclientengine/gameframeworks";
import {
  createLastUseRemoveGroups,
  prepareSymbolWinGroups,
  type SymbolCascadeGroup,
} from "@slotclientengine/rendercore";
import {
  createGridCellCascadeDropPlan,
  deriveGridCellCascadeSettledValues,
  type GridCellCascadeScene,
  type GridCellCascadeValueMatrix,
  type SymbolPresentationValueMatrix,
} from "@slotclientengine/rendercore/reel";
import {
  GAME002_CASCADE_COMPONENTS,
  GAME002_CASCADE_MOTION,
} from "./cascade-config.js";
import { GAME002_VISIBLE_ROWS, GAME002_REEL_COUNT } from "./game-layout.js";
import {
  resolveGame002WinResultAmount,
  validateGame002CascadeWinComponent,
} from "./win-symbol-carousel-config.js";
import { resolveGame002WinResultCoinAmount } from "./cascade-win-summary-config.js";

export interface Game002WinRemoveStage {
  readonly stepIndex: number;
  readonly groups: readonly SymbolCascadeGroup[];
  readonly sourceScene: SceneMatrix;
  readonly sourceValues: SymbolPresentationValueMatrix;
  readonly outputScene: GridCellCascadeScene;
  readonly outputValues: GridCellCascadeValueMatrix;
  readonly removedNum: number | null;
}

export interface Game002CascadeStage {
  readonly stepIndex: number;
  readonly removedSourceScene: GridCellCascadeScene;
  readonly removedSourceValues: GridCellCascadeValueMatrix;
  readonly dropdownScene: GridCellCascadeScene;
  readonly dropdownValues: GridCellCascadeValueMatrix;
  readonly refillPositions: readonly WinResultPosition[];
  readonly refillScene: SceneMatrix;
  readonly refillValues: SymbolPresentationValueMatrix;
  readonly winStage?: Game002WinRemoveStage;
}

export interface Game002CascadeSequence {
  readonly initial: {
    readonly stepIndex: 0;
    readonly spinScene: SceneMatrix;
    readonly spinValues: SymbolPresentationValueMatrix;
    readonly usesServerValues: boolean;
    readonly winStage?: Game002WinRemoveStage;
  };
  readonly cascades: readonly Game002CascadeStage[];
  readonly finalScene: SceneMatrix;
  readonly finalValues: SymbolPresentationValueMatrix;
}

export function createGame002CascadeSequence(options: {
  readonly logic: GameLogic;
  readonly cnSymbolCode: number;
  readonly canRemoveSymbol: (context: {
    readonly stepIndex: number;
    readonly x: number;
    readonly y: number;
    readonly code: number;
  }) => boolean;
  readonly canDropSymbol: (context: {
    readonly stepIndex: number;
    readonly x: number;
    readonly y: number;
    readonly code: number;
    readonly presentationValue: number | null;
  }) => boolean;
}): Game002CascadeSequence {
  const cnSymbolCode = assertNonNegativeSafeInteger(
    options.cnSymbolCode,
    "game002 CN symbol code",
  );
  const steps = options.logic.getSteps();
  if (steps.length === 0)
    throw new Error("game002 cascade requires at least one step.");
  const initialStep = steps[0];
  requireTriggered(initialStep, GAME002_CASCADE_COMPONENTS.spin);
  const spinScene = exactlyOneFullScene(
    initialStep.getComponentScenes(GAME002_CASCADE_COMPONENTS.spin),
    "step[0] bg-spin",
  );
  const spinValueResult = readFinalValues({
    step: initialStep,
    scene: spinScene,
    cnSymbolCode,
    required: false,
  });
  const spinValues = spinValueResult.values;
  const usesServerValues = spinValueResult.usesServerValues;
  let currentScene: GridCellCascadeScene = spinScene;
  let currentValues: GridCellCascadeValueMatrix = spinValues;
  let cumulativeWinAmount = 0;
  let cumulativeCoinAmount = 0;
  const initialWin = createWinRemoveStage({
    logic: options.logic,
    step: initialStep,
    sourceScene: spinScene,
    sourceValues: spinValues,
    cnSymbolCode,
    previousCumulativeWinAmount: cumulativeWinAmount,
    previousCumulativeCoinAmount: cumulativeCoinAmount,
    canRemoveSymbol: options.canRemoveSymbol,
  });
  if (initialWin) {
    cumulativeWinAmount += sumGroupAmounts(initialWin.groups);
    cumulativeCoinAmount += sumGroupCoinAmounts(initialWin.groups);
    currentScene = initialWin.outputScene;
    currentValues = initialWin.outputValues;
    if (steps.length < 2) {
      throw new Error(
        "game002 winning step[0] must be followed by a respin step.",
      );
    }
  } else if (steps.length > 1) {
    throw new Error(
      "game002 step[0] without bg-win cannot leave cascade steps.",
    );
  }

  const cascades: Game002CascadeStage[] = [];
  for (let stepIndex = 1; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    requireTriggered(step, GAME002_CASCADE_COMPONENTS.respin);
    requireTriggered(step, GAME002_CASCADE_COMPONENTS.dropdown);
    requireTriggered(step, GAME002_CASCADE_COMPONENTS.refill);

    const dropdown = requireBasicComponent(
      step,
      GAME002_CASCADE_COMPONENTS.dropdown,
    );
    const srcIndexes = parseIndexArray(
      dropdown.basicComponentData?.srcScenes,
      `step[${stepIndex}] bg-dropdown.srcScenes`,
    );
    if (srcIndexes.length !== 1) {
      throw new Error(
        `step[${stepIndex}] bg-dropdown.srcScenes must contain exactly one index.`,
      );
    }
    const sourceScene = parseHoleScene(
      step.getScene(srcIndexes[0]),
      `step[${stepIndex}] bg-dropdown source`,
    );
    assertMatrixEqual(
      sourceScene,
      currentScene,
      `step[${stepIndex}] dropdown source scene`,
    );
    const dropdownScene = exactlyOneHoleScene(
      step.getComponentScenes(GAME002_CASCADE_COMPONENTS.dropdown),
      `step[${stepIndex}] bg-dropdown`,
    );
    const derivedDropdownValues = deriveGridCellCascadeSettledValues({
      sourceScene,
      sourceValues: currentValues,
      settledScene: dropdownScene,
      canDropOccurrence: ({ x, sourceY, code, presentationValue }) =>
        options.canDropSymbol({
          stepIndex,
          x,
          y: sourceY,
          code,
          presentationValue,
        }),
    });
    const dropdownOther = optionalOtherScene(
      step.getComponentOtherScenes(GAME002_CASCADE_COMPONENTS.dropdown),
      `step[${stepIndex}] bg-dropdown`,
      false,
    );
    const dropdownValues = dropdownOther
      ? parseHoleValues(
          dropdownOther,
          dropdownScene,
          cnSymbolCode,
          `step[${stepIndex}] bg-dropdown values`,
        )
      : derivedDropdownValues;
    const refill = requireBasicComponent(
      step,
      GAME002_CASCADE_COMPONENTS.refill,
    );
    const refillPositions = parsePositions(
      refill.basicComponentData?.pos,
      `step[${stepIndex}] bg-refill.pos`,
    );
    assertPositionsAreExactlyHoles(
      refillPositions,
      dropdownScene,
      `step[${stepIndex}] bg-refill.pos`,
    );
    const refillScene = exactlyOneFullScene(
      step.getComponentScenes(GAME002_CASCADE_COMPONENTS.refill),
      `step[${stepIndex}] bg-refill`,
    );
    validateRefillScene(dropdownScene, refillScene, refillPositions, stepIndex);
    const refillOther = optionalOtherScene(
      step.getComponentOtherScenes(GAME002_CASCADE_COMPONENTS.refill),
      `step[${stepIndex}] bg-refill`,
      false,
    );
    if (refillOther) {
      assertDimensions(
        refillOther,
        refillScene,
        `step[${stepIndex}] bg-refill intermediate values`,
      );
    }
    const refillValueResult = readFinalValues({
      step,
      scene: refillScene,
      cnSymbolCode,
      required: refillPositions.some(
        ({ x, y }) => refillScene[x][y] === cnSymbolCode,
      ),
      fallbackValues: createCarriedRefillValues(
        dropdownValues,
        refillPositions,
      ),
    });
    const refillValues = refillValueResult.values;
    validateCarriedValues(
      dropdownScene,
      dropdownValues,
      refillScene,
      refillValues,
      new Set(refillPositions.map(positionKey)),
      stepIndex,
    );
    createGridCellCascadeDropPlan({
      sourceScene,
      sourceValues: currentValues,
      settledScene: dropdownScene,
      settledValues: dropdownValues,
      targetScene: refillScene,
      targetValues: refillValues,
      refillPositions,
      canDropOccurrence: ({ x, sourceY, code, presentationValue }) =>
        options.canDropSymbol({
          stepIndex,
          x,
          y: sourceY,
          code,
          presentationValue,
        }),
      cellHeight: 1,
      motion: GAME002_CASCADE_MOTION,
    });
    const winStage = createWinRemoveStage({
      logic: options.logic,
      step,
      sourceScene: refillScene,
      sourceValues: refillValues,
      cnSymbolCode,
      previousCumulativeWinAmount: cumulativeWinAmount,
      previousCumulativeCoinAmount: cumulativeCoinAmount,
      canRemoveSymbol: options.canRemoveSymbol,
    });
    cascades.push(
      Object.freeze({
        stepIndex,
        removedSourceScene: sourceScene,
        removedSourceValues: currentValues,
        dropdownScene,
        dropdownValues,
        refillPositions,
        refillScene,
        refillValues,
        ...(winStage ? { winStage } : {}),
      }),
    );
    if (winStage) {
      cumulativeWinAmount += sumGroupAmounts(winStage.groups);
      cumulativeCoinAmount += sumGroupCoinAmounts(winStage.groups);
      if (stepIndex === steps.length - 1) {
        throw new Error(
          `game002 winning step[${stepIndex}] must be followed by another respin step.`,
        );
      }
      currentScene = winStage.outputScene;
      currentValues = winStage.outputValues;
    } else {
      if (stepIndex !== steps.length - 1) {
        throw new Error(
          `game002 terminal step[${stepIndex}] leaves unconsumed steps.`,
        );
      }
      currentScene = refillScene;
      currentValues = refillValues;
    }
  }

  if (currentScene.some((column) => column.includes(-1))) {
    throw new Error("game002 cascade final scene must not contain holes.");
  }
  return Object.freeze({
    initial: Object.freeze({
      stepIndex: 0 as const,
      spinScene,
      spinValues,
      usesServerValues,
      ...(initialWin ? { winStage: initialWin } : {}),
    }),
    cascades: Object.freeze(cascades),
    finalScene: currentScene as SceneMatrix,
    finalValues: currentValues as SymbolPresentationValueMatrix,
  });
}

function createWinRemoveStage(options: {
  readonly logic: GameLogic;
  readonly step: GameLogicStep;
  readonly sourceScene: SceneMatrix;
  readonly sourceValues: SymbolPresentationValueMatrix;
  readonly cnSymbolCode: number;
  readonly previousCumulativeWinAmount: number;
  readonly previousCumulativeCoinAmount: number;
  readonly canRemoveSymbol: (context: {
    readonly stepIndex: number;
    readonly x: number;
    readonly y: number;
    readonly code: number;
  }) => boolean;
}): Game002WinRemoveStage | undefined {
  const { step } = options;
  const stepIndex = step.getIndex();
  if (!step.hasComponent(GAME002_CASCADE_COMPONENTS.win)) return undefined;
  requireTriggered(step, GAME002_CASCADE_COMPONENTS.remove);
  const groups = createLastUseRemoveGroups(
    prepareSymbolWinGroups(
      {
        resolveAmount: resolveGame002WinResultAmount,
        validateComponent: (context) =>
          validateGame002CascadeWinComponent(
            context,
            options.previousCumulativeWinAmount,
          ),
      },
      {
        logic: options.logic,
        stepIndex,
        scene: options.sourceScene,
        componentNames: [GAME002_CASCADE_COMPONENTS.win],
      },
    ),
    {
      canRemovePosition: ({ position }) => {
        const code = options.sourceScene[position.x]?.[position.y];
        if (code === undefined) {
          throw new Error(
            `step[${stepIndex}] win position (${position.x},${position.y}) is out of scene bounds.`,
          );
        }
        return options.canRemoveSymbol({
          stepIndex,
          x: position.x,
          y: position.y,
          code,
        });
      },
    },
  );
  validateComponentCoinWin(
    requireBasicComponent(step, GAME002_CASCADE_COMPONENTS.win),
    groups,
    options.previousCumulativeCoinAmount,
  );
  const outputScene = exactlyOneHoleScene(
    step.getComponentScenes(GAME002_CASCADE_COMPONENTS.remove),
    `step[${stepIndex}] bg-remove`,
  );
  const derivedOutputValues = deriveRemovedValues(
    options.sourceValues,
    outputScene,
  );
  const removeOther = optionalOtherScene(
    step.getComponentOtherScenes(GAME002_CASCADE_COMPONENTS.remove),
    `step[${stepIndex}] bg-remove`,
    false,
  );
  const outputValues = removeOther
    ? parseHoleValues(
        removeOther,
        outputScene,
        options.cnSymbolCode,
        `step[${stepIndex}] bg-remove values`,
      )
    : derivedOutputValues;
  validateRemoveOutput(
    options.sourceScene,
    options.sourceValues,
    outputScene,
    outputValues,
    groups,
    stepIndex,
  );
  const remove = requireBasicComponent(step, GAME002_CASCADE_COMPONENTS.remove);
  const removedNum = readOptionalNonNegativeInteger(
    (remove.raw as Record<string, unknown>).removedNum,
    `step[${stepIndex}] bg-remove.removedNum`,
  );
  return Object.freeze({
    stepIndex,
    groups,
    sourceScene: options.sourceScene,
    sourceValues: options.sourceValues,
    outputScene,
    outputValues,
    removedNum,
  });
}

function sumGroupCoinAmounts(groups: readonly SymbolCascadeGroup[]): number {
  let total = 0;
  for (const [groupIndex, group] of groups.entries()) {
    total += resolveGame002WinResultCoinAmount({ group, groupIndex });
    if (!Number.isSafeInteger(total)) {
      throw new Error("game002 cascade coin total exceeds safe integer range.");
    }
  }
  return total;
}

function validateComponentCoinWin(
  component: ReturnType<typeof requireBasicComponent>,
  groups: readonly SymbolCascadeGroup[],
  previousCumulativeCoinAmount: number,
): void {
  const basic = component.basicComponentData;
  const selected =
    basic?.coinWin64 !== undefined ? basic.coinWin64 : basic?.coinWin;
  if (selected === undefined) return;
  if (typeof selected !== "number" || !Number.isSafeInteger(selected)) {
    throw new Error("bg-win component coinWin must be a safe integer.");
  }
  const expected = previousCumulativeCoinAmount + sumGroupCoinAmounts(groups);
  if (selected !== expected) {
    throw new Error(
      `bg-win component coinWin ${selected} does not match expected ${expected}.`,
    );
  }
}

function readFinalValues(options: {
  readonly step: GameLogicStep;
  readonly scene: SceneMatrix;
  readonly cnSymbolCode: number;
  readonly required: boolean;
  readonly fallbackValues?: SymbolPresentationValueMatrix;
}): Readonly<{
  values: SymbolPresentationValueMatrix;
  usesServerValues: boolean;
}> {
  if (!options.step.hasComponent(GAME002_CASCADE_COMPONENTS.gencoins)) {
    if (options.required) {
      throw new Error(
        `step[${options.step.getIndex()}] must trigger bg-gencoins.`,
      );
    }
    return Object.freeze({
      values:
        options.fallbackValues ??
        Object.freeze(
          options.scene.map((column) => Object.freeze(column.map(() => null))),
        ),
      usesServerValues: false,
    });
  }
  requireBasicComponent(options.step, GAME002_CASCADE_COMPONENTS.gencoins);
  const label = `step[${options.step.getIndex()}] bg-gencoins`;
  const other = optionalOtherScene(
    options.step.getComponentOtherScenes(GAME002_CASCADE_COMPONENTS.gencoins),
    label,
    options.required,
  );
  if (!other) {
    return Object.freeze({
      values:
        options.fallbackValues ??
        Object.freeze(
          options.scene.map((column) => Object.freeze(column.map(() => null))),
        ),
      usesServerValues: false,
    });
  }
  return Object.freeze({
    values: parseFullValues(
      other,
      options.scene,
      options.cnSymbolCode,
      `${label} values`,
    ),
    usesServerValues: true,
  });
}

function deriveRemovedValues(
  sourceValues: SymbolPresentationValueMatrix,
  outputScene: GridCellCascadeScene,
): GridCellCascadeValueMatrix {
  return Object.freeze(
    outputScene.map((column, x) =>
      Object.freeze(
        column.map((code, y) => (code === -1 ? -1 : sourceValues[x][y])),
      ),
    ),
  );
}

function createCarriedRefillValues(
  dropdownValues: GridCellCascadeValueMatrix,
  refillPositions: readonly WinResultPosition[],
): SymbolPresentationValueMatrix {
  const refillKeys = new Set(refillPositions.map(positionKey));
  return Object.freeze(
    dropdownValues.map((column, x) =>
      Object.freeze(
        column.map((value, y) => {
          if (refillKeys.has(`${x},${y}`)) return null;
          if (value === -1) {
            throw new Error(
              `game002 carried refill value at (${x},${y}) must not be a hole.`,
            );
          }
          return value;
        }),
      ),
    ),
  );
}

function parseFullValues(
  other: OtherSceneMatrix,
  scene: SceneMatrix,
  cnCode: number,
  label: string,
): SymbolPresentationValueMatrix {
  assertDimensions(other, scene, label);
  return Object.freeze(
    scene.map((column, x) =>
      Object.freeze(
        column.map((code, y) => {
          const raw = other[x][y];
          if (!Number.isSafeInteger(raw) || raw < 0) {
            throw new Error(`${label}[${x}][${y}] must be non-negative.`);
          }
          if (code === cnCode) {
            if (raw <= 0)
              throw new Error(
                `${label}[${x}][${y}] CN value must be positive.`,
              );
            return raw;
          }
          if (raw !== 0)
            throw new Error(`${label}[${x}][${y}] non-CN value must be zero.`);
          return null;
        }),
      ),
    ),
  );
}

function parseHoleValues(
  other: OtherSceneMatrix,
  scene: GridCellCascadeScene,
  cnCode: number,
  label: string,
): GridCellCascadeValueMatrix {
  assertDimensions(other, scene, label);
  return Object.freeze(
    scene.map((column, x) =>
      Object.freeze(
        column.map((code, y) => {
          const raw = other[x][y];
          if (code === -1) {
            if (raw !== -1)
              throw new Error(`${label}[${x}][${y}] hole value must be -1.`);
            return -1;
          }
          if (!Number.isSafeInteger(raw) || raw < 0) {
            throw new Error(`${label}[${x}][${y}] must be non-negative.`);
          }
          if (code === cnCode) {
            if (raw <= 0)
              throw new Error(
                `${label}[${x}][${y}] CN value must be positive.`,
              );
            return raw;
          }
          // remove/dropdown otherScenes may retain non-CN auxiliary values.
          // Only value-managed CN occurrences carry presentation values.
          return null;
        }),
      ),
    ),
  );
}

function validateRemoveOutput(
  sourceScene: SceneMatrix,
  sourceValues: SymbolPresentationValueMatrix,
  outputScene: GridCellCascadeScene,
  outputValues: GridCellCascadeValueMatrix,
  groups: readonly SymbolCascadeGroup[],
  stepIndex: number,
): void {
  const removed = new Set(
    groups.flatMap((group) => group.removePositions.map(positionKey)),
  );
  forEachCell(sourceScene, (x, y) => {
    const mustRemove = removed.has(`${x},${y}`);
    if (mustRemove) {
      if (outputScene[x][y] !== -1 || outputValues[x][y] !== -1) {
        throw new Error(
          `step[${stepIndex}] bg-remove must create a scene/value hole at (${x},${y}).`,
        );
      }
    } else if (
      outputScene[x][y] !== sourceScene[x][y] ||
      outputValues[x][y] !== sourceValues[x][y]
    ) {
      throw new Error(
        `step[${stepIndex}] bg-remove changed non-winning occurrence (${x},${y}).`,
      );
    }
  });
}

function validateRefillScene(
  dropdown: GridCellCascadeScene,
  refill: SceneMatrix,
  positions: readonly WinResultPosition[],
  stepIndex: number,
): void {
  const refillKeys = new Set(positions.map(positionKey));
  forEachCell(refill, (x, y) => {
    if (refillKeys.has(`${x},${y}`)) {
      if (dropdown[x][y] !== -1 || refill[x][y] < 0) {
        throw new Error(
          `step[${stepIndex}] refill position (${x},${y}) is invalid.`,
        );
      }
    } else if (dropdown[x][y] !== refill[x][y]) {
      throw new Error(
        `step[${stepIndex}] refill changed stable cell (${x},${y}).`,
      );
    }
  });
}

function validateCarriedValues(
  dropdownScene: GridCellCascadeScene,
  dropdownValues: GridCellCascadeValueMatrix,
  refillScene: SceneMatrix,
  refillValues: SymbolPresentationValueMatrix,
  refillKeys: ReadonlySet<string>,
  stepIndex: number,
): void {
  forEachCell(refillScene, (x, y) => {
    if (refillKeys.has(`${x},${y}`)) return;
    if (
      dropdownScene[x][y] !== refillScene[x][y] ||
      dropdownValues[x][y] !== refillValues[x][y]
    ) {
      throw new Error(
        `step[${stepIndex}] existing occurrence/value changed at (${x},${y}).`,
      );
    }
  });
}

function exactlyOneFullScene(
  scenes: readonly SceneMatrix[],
  label: string,
): SceneMatrix {
  if (scenes.length !== 1)
    throw new Error(`${label} must use exactly one scene.`);
  const scene = scenes[0];
  if (scene.length !== GAME002_REEL_COUNT)
    throw new Error(`${label} width must be ${GAME002_REEL_COUNT}.`);
  return Object.freeze(
    scene.map((column, x) => {
      if (column.length !== GAME002_VISIBLE_ROWS)
        throw new Error(
          `${label}[${x}] height must be ${GAME002_VISIBLE_ROWS}.`,
        );
      return Object.freeze(
        column.map((code, y) =>
          assertNonNegativeSafeInteger(code, `${label}[${x}][${y}]`),
        ),
      );
    }),
  );
}

function exactlyOneHoleScene(
  scenes: readonly SceneMatrix[],
  label: string,
): GridCellCascadeScene {
  if (scenes.length !== 1)
    throw new Error(`${label} must use exactly one scene.`);
  return parseHoleScene(scenes[0], label);
}

function parseHoleScene(
  scene: SceneMatrix,
  label: string,
): GridCellCascadeScene {
  if (scene.length !== GAME002_REEL_COUNT)
    throw new Error(`${label} width must be ${GAME002_REEL_COUNT}.`);
  return Object.freeze(
    scene.map((column, x) => {
      if (column.length !== GAME002_VISIBLE_ROWS)
        throw new Error(
          `${label}[${x}] height must be ${GAME002_VISIBLE_ROWS}.`,
        );
      return Object.freeze(
        column.map((code, y) => {
          if (!Number.isSafeInteger(code) || code < -1)
            throw new Error(`${label}[${x}][${y}] must be -1 or non-negative.`);
          return code;
        }),
      );
    }),
  );
}

function optionalOtherScene(
  scenes: readonly OtherSceneMatrix[],
  label: string,
  required: boolean,
): OtherSceneMatrix | undefined {
  if (scenes.length > 1)
    throw new Error(`${label} must use at most one otherScene.`);
  if (required && scenes.length === 0) {
    throw new Error(
      `${label} must provide one otherScene because presentation values changed.`,
    );
  }
  return scenes[0];
}

function parsePositions(
  value: unknown,
  label: string,
): readonly WinResultPosition[] {
  if (!Array.isArray(value) || value.length === 0 || value.length % 2 !== 0) {
    throw new Error(`${label} must contain non-empty x/y pairs.`);
  }
  const positions: WinResultPosition[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 2) {
    const x = assertNonNegativeSafeInteger(value[index], `${label}[${index}]`);
    const y = assertNonNegativeSafeInteger(
      value[index + 1],
      `${label}[${index + 1}]`,
    );
    if (x >= GAME002_REEL_COUNT || y >= GAME002_VISIBLE_ROWS)
      throw new Error(`${label} coordinate (${x},${y}) is out of range.`);
    const key = `${x},${y}`;
    if (seen.has(key)) throw new Error(`${label} contains duplicate ${key}.`);
    seen.add(key);
    positions.push(Object.freeze({ x, y }));
  }
  return Object.freeze(positions);
}

function assertPositionsAreExactlyHoles(
  positions: readonly WinResultPosition[],
  scene: GridCellCascadeScene,
  label: string,
): void {
  const actual = new Set(positions.map(positionKey));
  const expected = new Set<string>();
  forEachCell(scene, (x, y) => {
    if (scene[x][y] === -1) expected.add(`${x},${y}`);
  });
  if (
    actual.size !== expected.size ||
    [...expected].some((key) => !actual.has(key))
  ) {
    throw new Error(`${label} must exactly match dropdown holes.`);
  }
}

function requireTriggered(step: GameLogicStep, name: string): void {
  if (!step.hasComponent(name))
    throw new Error(`step[${step.getIndex()}] must trigger ${name}.`);
}

function requireBasicComponent(step: GameLogicStep, name: string) {
  const component = step.getComponent(name);
  if (!component?.hasBasicComponentData) {
    throw new Error(
      `step[${step.getIndex()}] ${name} must include basicComponentData.`,
    );
  }
  return component;
}

function parseIndexArray(value: unknown, label: string): readonly number[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return Object.freeze(
    value.map((candidate, index) =>
      assertNonNegativeSafeInteger(candidate, `${label}[${index}]`),
    ),
  );
}

function assertDimensions(
  value: readonly (readonly unknown[])[],
  scene: readonly (readonly unknown[])[],
  label: string,
): void {
  if (!Array.isArray(value) || value.length !== scene.length)
    throw new Error(`${label} width must match scene.`);
  value.forEach((column, x) => {
    if (!Array.isArray(column) || column.length !== scene[x].length)
      throw new Error(`${label}[${x}] height must match scene.`);
  });
}

function assertMatrixEqual(
  actual: readonly (readonly unknown[])[],
  expected: readonly (readonly unknown[])[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some(
      (column, x) =>
        column.length !== expected[x]?.length ||
        column.some((value, y) => value !== expected[x]?.[y]),
    )
  )
    throw new Error(`${label} does not match previous cascade output.`);
}

function forEachCell(
  scene: readonly (readonly unknown[])[],
  callback: (x: number, y: number) => void,
): void {
  scene.forEach((column, x) => column.forEach((_value, y) => callback(x, y)));
}

function positionKey(position: {
  readonly x: number;
  readonly y: number;
}): string {
  return `${position.x},${position.y}`;
}

function sumGroupAmounts(groups: readonly SymbolCascadeGroup[]): number {
  return groups.reduce((sum, group) => sum + group.amount, 0);
}

function readOptionalNonNegativeInteger(
  value: unknown,
  label: string,
): number | null {
  if (value === undefined) return null;
  return assertNonNegativeSafeInteger(value, label);
}

function assertNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error(`${label} must be a non-negative safe integer.`);
  return value as number;
}
