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
import { resolveGame002WinResultAmount } from "./win-symbol-carousel-config.js";
import { resolveGame002WinResultCoinAmount } from "./cascade-win-summary-config.js";

export interface Game002WinRemoveStage {
  readonly stepIndex: number;
  readonly groups: readonly SymbolCascadeGroup[];
  readonly sourceScene: SceneMatrix;
  readonly sourceValues: SymbolPresentationValueMatrix;
  readonly outputScene: GridCellCascadeScene;
  readonly outputValues: GridCellCascadeValueMatrix;
  readonly removedNum: number | null;
  readonly releaseOnlyPositions: readonly WinResultPosition[];
}

export interface Game002SpinOperationData {
  readonly scene: SceneMatrix;
  readonly values: SymbolPresentationValueMatrix;
  readonly usesServerValues: boolean;
}

export interface Game002FallOperationData {
  readonly sourceScene: GridCellCascadeScene;
  readonly sourceValues: GridCellCascadeValueMatrix;
  readonly dropdownScene: GridCellCascadeScene;
  readonly dropdownValues: GridCellCascadeValueMatrix;
  readonly refillPositions: readonly WinResultPosition[];
  readonly refillScene: SceneMatrix;
  readonly refillValues: SymbolPresentationValueMatrix;
}

export function readGame002SpinOperationData(options: {
  readonly logic: GameLogic;
  readonly cnSymbolCode: number;
  readonly auxiliaryValueSymbolCodes?: readonly number[];
}): Game002SpinOperationData {
  const step = options.logic.getSteps()[0];
  if (!step) throw new Error("game002 spin requires server step[0].");
  requireTriggered(step, GAME002_CASCADE_COMPONENTS.spin);
  const serverScene = exactlyOneFullScene(
    step.getComponentScenes(GAME002_CASCADE_COMPONENTS.spin),
    "step[0] bg-spin",
  );
  const scene = resolveGeneratedMultiplierScene(step, serverScene, "step[0]");
  const valueResult = readFinalValues({
    step,
    scene,
    cnSymbolCode: options.cnSymbolCode,
    auxiliaryValueSymbolCodes: new Set(options.auxiliaryValueSymbolCodes ?? []),
    required: false,
  });
  return Object.freeze({
    scene,
    values: valueResult.values,
    usesServerValues: valueResult.usesServerValues,
  });
}

export function readGame002FallOperationData(options: {
  readonly step: GameLogicStep;
  readonly sourceScene: GridCellCascadeScene;
  readonly sourceValues: GridCellCascadeValueMatrix;
  readonly cnSymbolCode: number;
  readonly auxiliaryValueSymbolCodes?: readonly number[];
  readonly canDropSymbol: (context: {
    readonly stepIndex: number;
    readonly x: number;
    readonly y: number;
    readonly code: number;
    readonly presentationValue: number | null;
  }) => boolean;
}): Game002FallOperationData {
  const stepIndex = options.step.getIndex();
  requireTriggered(options.step, GAME002_CASCADE_COMPONENTS.respin);
  requireTriggered(options.step, GAME002_CASCADE_COMPONENTS.dropdown);
  requireTriggered(options.step, GAME002_CASCADE_COMPONENTS.refill);
  const dropdown = requireBasicComponent(
    options.step,
    GAME002_CASCADE_COMPONENTS.dropdown,
  );
  const srcIndexes = parseIndexArray(
    dropdown.basicComponentData?.srcScenes,
    `step[${stepIndex}] bg-dropdown.srcScenes`,
  );
  if (srcIndexes.length !== 1)
    throw new Error(
      `step[${stepIndex}] bg-dropdown.srcScenes must contain exactly one index.`,
    );
  const serverSourceScene = parseHoleScene(
    options.step.getScene(srcIndexes[0]!),
    `step[${stepIndex}] bg-dropdown source`,
  );
  assertMatrixEqual(
    serverSourceScene,
    options.sourceScene,
    `step[${stepIndex}] dropdown source scene`,
  );
  const dropdownScene = exactlyOneHoleScene(
    options.step.getComponentScenes(GAME002_CASCADE_COMPONENTS.dropdown),
    `step[${stepIndex}] bg-dropdown`,
  );
  const derivedDropdownValues = deriveGridCellCascadeSettledValues({
    sourceScene: options.sourceScene,
    sourceValues: options.sourceValues,
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
    options.step.getComponentOtherScenes(GAME002_CASCADE_COMPONENTS.dropdown),
    `step[${stepIndex}] bg-dropdown`,
    false,
  );
  const dropdownValues = derivedDropdownValues;
  if (dropdownOther)
    validateExpectedOtherSceneValues(
      dropdownOther,
      dropdownValues,
      `step[${stepIndex}] bg-dropdown values`,
    );
  const refill = requireBasicComponent(
    options.step,
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
  const serverRefillScene = exactlyOneFullScene(
    options.step.getComponentScenes(GAME002_CASCADE_COMPONENTS.refill),
    `step[${stepIndex}] bg-refill`,
  );
  const refillScene = resolveGeneratedMultiplierScene(
    options.step,
    serverRefillScene,
    `step[${stepIndex}]`,
  );
  validateRefillScene(dropdownScene, refillScene, refillPositions, stepIndex);
  const refillValueResult = readFinalValues({
    step: options.step,
    scene: refillScene,
    cnSymbolCode: options.cnSymbolCode,
    auxiliaryValueSymbolCodes: new Set(options.auxiliaryValueSymbolCodes ?? []),
    required: refillPositions.some(
      ({ x, y }) => refillScene[x]?.[y] === options.cnSymbolCode,
    ),
    fallbackValues: createCarriedRefillValues(dropdownValues, refillPositions),
  });
  validateCarriedValues(
    dropdownScene,
    dropdownValues,
    refillScene,
    refillValueResult.values,
    new Set(refillPositions.map(positionKey)),
    stepIndex,
  );
  createGridCellCascadeDropPlan({
    sourceScene: options.sourceScene,
    sourceValues: options.sourceValues,
    settledScene: dropdownScene,
    settledValues: dropdownValues,
    targetScene: refillScene,
    targetValues: refillValueResult.values,
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
    rowGap: 0,
    motion: GAME002_CASCADE_MOTION,
  });
  return Object.freeze({
    sourceScene: options.sourceScene,
    sourceValues: options.sourceValues,
    dropdownScene,
    dropdownValues,
    refillPositions,
    refillScene,
    refillValues: refillValueResult.values,
  });
}

function asCascadeValues(
  values: readonly (readonly (number | null | -1)[])[],
  _label: string,
): GridCellCascadeValueMatrix {
  return values as GridCellCascadeValueMatrix;
}

function validateExpectedOtherSceneValues(
  other: OtherSceneMatrix,
  expected: GridCellCascadeValueMatrix,
  label: string,
): void {
  assertDimensions(other, expected, label);
  expected.forEach((column, x) =>
    column.forEach((value, y) => {
      const raw = other[x][y];
      if (value === -1) {
        if (raw !== -1)
          throw new Error(`${label}[${x}][${y}] hole value must be -1.`);
        return;
      }
      if (!Number.isSafeInteger(raw) || raw < 0)
        throw new Error(`${label}[${x}][${y}] must be non-negative.`);
      if (value !== null && raw !== value)
        throw new Error(
          `${label}[${x}][${y}] must retain value ${value}, received ${raw}.`,
        );
    }),
  );
}

export function readGame002WinOperationData(options: {
  readonly logic: GameLogic;
  readonly step: GameLogicStep;
  readonly sourceScene: SceneMatrix;
  readonly sourceValues: SymbolPresentationValueMatrix;
  readonly cnSymbolCode: number;
  readonly expectedOutputValues?: readonly (readonly (number | null | -1)[])[];
  readonly releaseOnlyPositions?: readonly WinResultPosition[];
  readonly canRemoveSymbol: (context: {
    readonly stepIndex: number;
    readonly x: number;
    readonly y: number;
    readonly code: number;
  }) => boolean;
}): Game002WinRemoveStage | undefined {
  const { step } = options;
  const stepIndex = step.getIndex();
  const winComponentNames = [
    GAME002_CASCADE_COMPONENTS.win,
    GAME002_CASCADE_COMPONENTS.win2,
  ].filter((name) => step.getComponentResults(name).length > 0);
  if (winComponentNames.length === 0) return undefined;
  requireTriggered(step, GAME002_CASCADE_COMPONENTS.remove);
  const groups = createLastUseRemoveGroups(
    prepareSymbolWinGroups(
      {
        resolveAmount: resolveGame002WinResultAmount,
      },
      {
        logic: options.logic,
        stepIndex,
        scene: options.sourceScene,
        componentNames: winComponentNames,
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
  for (const componentName of winComponentNames)
    validateComponentCoinWin(
      requireBasicComponent(step, componentName),
      groups.filter((group) => group.componentName === componentName),
      componentName,
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
  const outputValues = options.expectedOutputValues
    ? asCascadeValues(
        options.expectedOutputValues,
        `step[${stepIndex}] execution-plan remove values`,
      )
    : derivedOutputValues;
  const releaseOnlyPositions =
    options.releaseOnlyPositions ??
    Object.freeze(
      step
        .getComponentResults("bg-bn")
        .flatMap((result, resultIndex) =>
          parsePositions(
            result.pos,
            `step[${stepIndex}] bg-bn result[${resultIndex}].pos`,
          ),
        ),
    );
  if (removeOther) {
    validateExpectedOtherSceneValues(
      removeOther,
      outputValues,
      `step[${stepIndex}] bg-remove values`,
    );
  }
  validateRemoveOutput(
    options.sourceScene,
    options.sourceValues,
    outputScene,
    outputValues,
    groups,
    releaseOnlyPositions,
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
    releaseOnlyPositions,
  });
}

function sumGroupCoinAmounts(groups: readonly SymbolCascadeGroup[]): number {
  let total = 0;
  for (const [groupIndex, group] of groups.entries()) {
    const hasFinalCoinAmount = [
      group.result.coinWin64,
      group.result.coinWin,
    ].some(
      (value) =>
        typeof value === "number" && Number.isSafeInteger(value) && value > 0,
    );
    const rawMultiplier = group.result.otherMul;
    const multiplier =
      !hasFinalCoinAmount &&
      typeof rawMultiplier === "number" &&
      Number.isSafeInteger(rawMultiplier) &&
      rawMultiplier > 0
        ? rawMultiplier
        : 1;
    total +=
      resolveGame002WinResultCoinAmount({ group, groupIndex }) * multiplier;
    if (!Number.isSafeInteger(total)) {
      throw new Error("game002 cascade coin total exceeds safe integer range.");
    }
  }
  return total;
}

function validateComponentCoinWin(
  component: ReturnType<typeof requireBasicComponent>,
  groups: readonly SymbolCascadeGroup[],
  componentName: string,
): void {
  const selected = (component.raw as Record<string, unknown>).wins;
  if (selected === undefined) return;
  if (typeof selected !== "number" || !Number.isSafeInteger(selected)) {
    throw new Error(`${componentName}.wins must be a safe integer.`);
  }
  const expected = sumGroupCoinAmounts(groups);
  if (selected !== expected) {
    throw new Error(
      `${componentName}.wins ${selected} does not match current result total ${expected}.`,
    );
  }
}

function readFinalValues(options: {
  readonly step: GameLogicStep;
  readonly scene: SceneMatrix;
  readonly cnSymbolCode: number;
  readonly auxiliaryValueSymbolCodes: ReadonlySet<number>;
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
  const parsed = parseFullValues(
    other,
    options.scene,
    options.cnSymbolCode,
    options.auxiliaryValueSymbolCodes,
    `${label} values`,
  );
  const values = options.fallbackValues
    ? Object.freeze(
        parsed.map((column, x) =>
          Object.freeze(
            column.map((value, y) =>
              options.auxiliaryValueSymbolCodes.has(options.scene[x]![y]!)
                ? options.fallbackValues![x]![y]!
                : value,
            ),
          ),
        ),
      )
    : parsed;
  return Object.freeze({
    values,
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
  auxiliaryValueSymbolCodes: ReadonlySet<number>,
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
          if (auxiliaryValueSymbolCodes.has(code)) return null;
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
  releaseOnlyPositions: readonly WinResultPosition[],
  stepIndex: number,
): void {
  const removed = new Set(
    [
      ...groups.flatMap((group) => group.removePositions),
      ...releaseOnlyPositions,
    ].map(positionKey),
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
        `step[${stepIndex}] bg-remove changed non-winning occurrence (${x},${y}) from code/value ${sourceScene[x][y]}/${String(sourceValues[x][y])} to ${outputScene[x][y]}/${String(outputValues[x][y])}.`,
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

function resolveGeneratedMultiplierScene(
  step: GameLogicStep,
  inputScene: SceneMatrix,
  label: string,
): SceneMatrix {
  const generatedWm = step.hasComponent(GAME002_CASCADE_COMPONENTS.genwm)
    ? exactlyOneFullScene(
        step.getComponentScenes(GAME002_CASCADE_COMPONENTS.genwm),
        `${label} bg-genwm`,
      )
    : inputScene;
  const generatedCm = step.hasComponent(GAME002_CASCADE_COMPONENTS.gencm)
    ? exactlyOneFullScene(
        step.getComponentScenes(GAME002_CASCADE_COMPONENTS.gencm),
        `${label} bg-gencm`,
      )
    : generatedWm;
  return generatedCm;
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
