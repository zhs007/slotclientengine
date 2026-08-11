import type {
  GameLogic,
  GameLogicStep,
  OtherSceneMatrix,
  SceneMatrix,
  WinResultPosition,
} from "@slotclientengine/gameframeworks";
import {
  assertExactMatrixShape as assertDimensions,
  forEachMatrixCell as forEachCell,
  parseExactPositionPairs,
  requireSafeInteger,
  slotOperationPositionKey as positionKey,
  compileSlotCascadeFacts,
  deriveSlotCascadeDropdownValues,
} from "@slotclientengine/gameframeworks";
import type { SlotCascadeFacts } from "@slotclientengine/gameframeworks";
import {
  createLastUseRemoveGroups,
  prepareSymbolWinGroups,
  type SymbolCascadeGroup,
} from "@slotclientengine/rendercore";
import {
  type GridCellCascadeScene,
  type GridCellCascadeValueMatrix,
  type SymbolPresentationValueMatrix,
} from "@slotclientengine/rendercore/reel";
import {
  GAME002_CASCADE_COMPONENTS,
  GAME002_SETTLED_SCENE_COMPONENTS,
} from "./cascade-config.js";
import { GAME002_VISIBLE_ROWS, GAME002_REEL_COUNT } from "./game-layout.js";
import { resolveGame002WinResultAmount } from "./win-symbol-carousel-config.js";

export interface Game002WinOperationData {
  readonly stepIndex: number;
  readonly groups: readonly SymbolCascadeGroup[];
  readonly sourceScene: SceneMatrix;
  readonly sourceValues: SymbolPresentationValueMatrix;
  readonly outputScene: GridCellCascadeScene;
  readonly outputValues: GridCellCascadeValueMatrix;
  readonly releaseOnlyPositions: readonly WinResultPosition[];
}

export interface Game002SpinOperationData {
  readonly scene: SceneMatrix;
  readonly values: SymbolPresentationValueMatrix;
}

export interface Game002FallOperationData {
  readonly sourceScene: GridCellCascadeScene;
  readonly sourceValues: GridCellCascadeValueMatrix;
  readonly dropdownScene: GridCellCascadeScene;
  readonly dropdownValues: GridCellCascadeValueMatrix;
  readonly refillPositions: readonly WinResultPosition[];
  readonly refillScene: SceneMatrix;
  readonly refillValues: SymbolPresentationValueMatrix;
  readonly cascadeFacts: SlotCascadeFacts;
}

export function readGame002SpinOperationData(options: {
  readonly logic: GameLogic;
  readonly cnSymbolCode: number;
  readonly auxiliaryValueSymbolCodes?: readonly number[];
}): Game002SpinOperationData {
  const step = options.logic.getSteps()[0];
  if (!step) throw new Error("game002 spin requires server step[0].");
  requireTriggered(step, GAME002_CASCADE_COMPONENTS.spin);
  rejectTriggered(step, GAME002_CASCADE_COMPONENTS.refill);
  const serverScene = exactlyOneFullScene(
    step.getLastComponentScenes(GAME002_SETTLED_SCENE_COMPONENTS),
    "step[0] settled scene",
  );
  const scene = serverScene;
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
  rejectTriggered(options.step, GAME002_CASCADE_COMPONENTS.spin);
  requireBasicComponent(options.step, GAME002_CASCADE_COMPONENTS.dropdown);
  const dropdownScene = exactlyOneHoleScene(
    options.step.getComponentScenes(GAME002_CASCADE_COMPONENTS.dropdown),
    `step[${stepIndex}] bg-dropdown`,
  );
  const derivedDropdownValues = deriveSlotCascadeDropdownValues({
    sourceScene: options.sourceScene,
    sourceValues: options.sourceValues,
    dropdownScene,
    canDropOccurrence: ({ x, y, code, value }) =>
      options.canDropSymbol({
        stepIndex,
        x,
        y,
        code,
        presentationValue: value,
      }),
  });
  const dropdownValues = derivedDropdownValues;
  const refill = requireBasicComponent(
    options.step,
    GAME002_CASCADE_COMPONENTS.refill,
  );
  const refillPositions = parsePositions(
    refill.basicComponentData?.pos,
    dropdownScene,
    `step[${stepIndex}] bg-refill.pos`,
  );
  assertPositionsAreExactlyHoles(
    refillPositions,
    dropdownScene,
    `step[${stepIndex}] bg-refill.pos`,
  );
  const serverRefillScene = exactlyOneFullScene(
    options.step.getLastComponentScenes(GAME002_SETTLED_SCENE_COMPONENTS),
    `step[${stepIndex}] settled scene`,
  );
  const refillScene = serverRefillScene;
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
  const cascadeFacts = compileSlotCascadeFacts({
    sourceScene: options.sourceScene,
    sourceValues: options.sourceValues,
    dropdownScene,
    dropdownValues,
    targetScene: refillScene,
    targetValues: refillValueResult.values,
    refillPositions,
    canDropOccurrence: ({ x, y, code, value }) =>
      options.canDropSymbol({
        stepIndex,
        x,
        y,
        code,
        presentationValue: value,
      }),
  });
  return Object.freeze({
    sourceScene: options.sourceScene,
    sourceValues: options.sourceValues,
    dropdownScene,
    dropdownValues,
    refillPositions,
    refillScene,
    refillValues: refillValueResult.values,
    cascadeFacts,
  });
}

function asCascadeValues(
  values: readonly (readonly (number | null | -1)[])[],
  _label: string,
): GridCellCascadeValueMatrix {
  return values as GridCellCascadeValueMatrix;
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
}): Game002WinOperationData | undefined {
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
  const outputScene = exactlyOneHoleScene(
    step.getComponentScenes(GAME002_CASCADE_COMPONENTS.remove),
    `step[${stepIndex}] bg-remove`,
  );
  const derivedOutputValues = deriveRemovedValues(
    options.sourceValues,
    outputScene,
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
            options.sourceScene,
            `step[${stepIndex}] bg-bn result[${resultIndex}].pos`,
          ),
        ),
    );
  requireBasicComponent(step, GAME002_CASCADE_COMPONENTS.remove);
  return Object.freeze({
    stepIndex,
    groups,
    sourceScene: options.sourceScene,
    sourceValues: options.sourceValues,
    outputScene,
    outputValues,
    releaseOnlyPositions,
  });
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
          requireSafeInteger(code, `${label}[${x}][${y}]`, { minimum: 0 }),
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
  scene: readonly (readonly unknown[])[],
  label: string,
): readonly WinResultPosition[] {
  return parseExactPositionPairs(value, scene, label, { nonEmpty: true });
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

function rejectTriggered(step: GameLogicStep, name: string): void {
  if (step.hasComponent(name)) {
    throw new Error(`step[${step.getIndex()}] must not trigger ${name}.`);
  }
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
