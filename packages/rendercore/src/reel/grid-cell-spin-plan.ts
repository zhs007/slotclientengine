import { ReelError } from "./errors.js";
import { normalizeGridCellReelOffsetMatrix } from "./grid-cell-reel-offsets.js";
import type {
  GridCellCoordinate,
  GridCellDimmingPattern,
  GridCellReelPlanCell,
  GridCellReelOffsetMatrix,
  GridCellReelSpinPlan,
  GridCellReelSpinTiming,
  GridCellReelEffectPlanOptions,
  GridCellEffectPlanSpec,
  GridCellSpinPosition,
  ReelAxisSpinPlan,
  ReelSpinDirection,
} from "./types.js";
import type { LogicReels, SceneMatrix } from "@slotclientengine/logiccore";

export function createGridCellReelSpinPlan(options: {
  readonly reels: LogicReels;
  readonly finalYs: readonly number[];
  readonly targetScene: SceneMatrix;
  readonly columns: number;
  readonly rows: number;
  readonly order: readonly GridCellCoordinate[];
  readonly cellReelOffsets?: GridCellReelOffsetMatrix;
  readonly direction?: ReelSpinDirection;
  readonly timing: GridCellReelSpinTiming;
  readonly dimming: GridCellDimmingPattern;
  readonly dimmingActivatedAtStart?: boolean;
  readonly positions?: readonly GridCellSpinPosition[];
  readonly effects?: GridCellReelEffectPlanOptions;
}): GridCellReelSpinPlan {
  const columns = assertPositiveInteger(options.columns, "columns");
  const rows = assertPositiveInteger(options.rows, "rows");
  if (options.reels.getReelCount() !== columns) {
    throw new ReelError(
      `grid columns ${columns} do not match reels reel count ${options.reels.getReelCount()}.`,
    );
  }
  const finalYs = parseFinalYs(options.finalYs, columns);
  const targetScene = parseTargetScene(options.targetScene, columns, rows);
  const order = parseOrder(options.order, columns, rows);
  const selectedOrder = selectOrder(order, options.positions, columns, rows);
  const cellReelOffsets = normalizeGridCellReelOffsetMatrix(
    options.cellReelOffsets,
    columns,
    rows,
  );
  const timing = parseTiming(options.timing);
  const effects = parseEffects(options.effects, selectedOrder);
  const dimming = parseDimming(options.dimming);
  const dimmingActivatedAtStart = parseOptionalBoolean(
    options.dimmingActivatedAtStart,
    "dimmingActivatedAtStart",
  );
  const direction = parseDirection(options.direction);
  const cellCount = selectedOrder.length;
  const firstStopAtMs =
    (cellCount - 1) * timing.startStepMs + timing.settleAfterLastStartMs;

  const cells = selectedOrder.map(
    (cell, sequenceIndex): GridCellReelPlanCell => {
      const startAtMs = cell.startGroupIndex * timing.startStepMs;
      const gateIndex = effects?.gateIndex ?? -1;
      const stopAtMs =
        effects?.activated && sequenceIndex > gateIndex
          ? firstStopAtMs +
            gateIndex * timing.stopStepMs +
            effects.firstFollowingStopDelayMs +
            (sequenceIndex - gateIndex - 1) * effects.activatedStopStepMs
          : firstStopAtMs + sequenceIndex * timing.stopStepMs;
      const durationMs = stopAtMs - startAtMs;
      if (durationMs <= 0) {
        throw new ReelError(
          `grid cell (${cell.x},${cell.y}) stopAtMs must be greater than startAtMs.`,
        );
      }

      const reelOffsetY = cellReelOffsets[cell.x][cell.y];
      const finalY = options.reels.normalizeY(
        cell.x,
        finalYs[cell.x] + cell.y + reelOffsetY,
      );
      const durationTravel = Math.ceil(
        (durationMs / 1000) * timing.speedSymbolsPerSecond,
      );
      const travelSymbols = Math.max(timing.minimumSpinCycles, durationTravel);
      const startY =
        direction === "forward"
          ? options.reels.normalizeY(cell.x, finalY - travelSymbols)
          : options.reels.normalizeY(cell.x, finalY + travelSymbols);
      const axisPlan: ReelAxisSpinPlan = Object.freeze({
        x: cell.x,
        finalY,
        startY,
        direction,
        travelSymbols,
        startDelayMs: startAtMs,
        durationMs,
        stopAtMs,
      });
      const effectSpec =
        effects?.activated && sequenceIndex > gateIndex
          ? effects.activated
          : effects?.normal;
      const effect = effectSpec
        ? Object.freeze({
            effectId: effectSpec.effectId,
            startAtMs:
              stopAtMs -
              effectSpec.durationMs * effectSpec.loopCount -
              effectSpec.finishBeforeStopMs,
            loopCount: effectSpec.loopCount,
            finishBeforeStopMs: effectSpec.finishBeforeStopMs,
            ...(effects?.activated && sequenceIndex > gateIndex
              ? { activationGate: effects.activationGate! }
              : {}),
          })
        : null;
      if (effect && effect.startAtMs < startAtMs) {
        throw new ReelError(
          `grid cell (${cell.x},${cell.y}) effect lead exceeds its spin duration.`,
        );
      }

      return Object.freeze({
        x: cell.x,
        y: cell.y,
        orderIndex: cell.orderIndex,
        sequenceIndex,
        startGroupIndex: cell.startGroupIndex,
        reelOffsetY,
        startAtMs,
        stopAtMs,
        durationMs,
        axisPlan,
        targetVisibleSymbols: Object.freeze([
          targetScene[cell.x][cell.y],
        ]) as readonly [number],
        dimmingAlpha: resolveGridCellDimmingAlpha(
          dimming,
          targetScene[cell.x][cell.y],
          dimmingActivatedAtStart,
        ),
        effect,
      });
    },
  );

  return Object.freeze({
    direction,
    columns,
    rows,
    dimming,
    cells: Object.freeze(cells),
    lastStopAtMs: cells.at(-1)!.stopAtMs,
    selective: options.positions !== undefined,
    activationGate: effects?.activationGate ?? null,
    dimmingActivatedAtStart,
  });
}

function parseEffects(
  value: GridCellReelEffectPlanOptions | undefined,
  selectedOrder: readonly GridCellCoordinate[],
):
  | Readonly<{
      normal?: Readonly<{
        effectId: string;
        durationMs: number;
        loopCount: number;
        finishBeforeStopMs: number;
      }>;
      activated?: Readonly<{
        effectId: string;
        durationMs: number;
        loopCount: number;
        finishBeforeStopMs: number;
      }>;
      activationGate?: Readonly<{ x: number; y: number }>;
      gateIndex: number;
      firstFollowingStopDelayMs: number;
      activatedStopStepMs: number;
    }>
  | undefined {
  if (value === undefined) return undefined;
  const normal = value.normal
    ? parseEffectSpec(value.normal, "normal effect")
    : undefined;
  if (!normal && !value.activated) {
    throw new ReelError(
      "grid cell effects require normal or activated effect.",
    );
  }
  if (value.activated === undefined && value.activationGate !== undefined) {
    throw new ReelError(
      "activationGate requires an activated grid cell effect.",
    );
  }
  if (value.activated !== undefined && value.activationGate === undefined) {
    throw new ReelError("activated grid cell effect requires activationGate.");
  }
  if (value.activated === undefined) {
    return Object.freeze({
      normal: normal!,
      gateIndex: -1,
      firstFollowingStopDelayMs: 0,
      activatedStopStepMs: 0,
    });
  }
  const activated = parseEffectSpec(value.activated, "activated effect");
  const gate = value.activationGate!;
  const gateIndex = selectedOrder.findIndex(
    (cell) => cell.x === gate.x && cell.y === gate.y,
  );
  if (gateIndex < 0) {
    throw new ReelError(
      "activationGate must be present in the selected grid order.",
    );
  }
  const firstFollowingStopDelayMs = assertNonNegativeNumber(
    value.firstFollowingStopDelayMs,
    "firstFollowingStopDelayMs",
  );
  const activatedStopStepMs = assertNonNegativeNumber(
    value.activatedStopStepMs,
    "activatedStopStepMs",
  );
  if (
    gateIndex < selectedOrder.length - 1 &&
    firstFollowingStopDelayMs <
      activated.durationMs * activated.loopCount + activated.finishBeforeStopMs
  ) {
    throw new ReelError(
      "firstFollowingStopDelayMs must provide the activated effect's full lead time.",
    );
  }
  return Object.freeze({
    normal,
    activated,
    activationGate: Object.freeze({ x: gate.x, y: gate.y }),
    gateIndex,
    firstFollowingStopDelayMs,
    activatedStopStepMs,
  });
}

function parseEffectSpec(value: GridCellEffectPlanSpec, label: string) {
  if (
    typeof value.effectId !== "string" ||
    value.effectId.trim().length === 0
  ) {
    throw new ReelError(`${label} effectId must be non-empty.`);
  }
  if (!Number.isSafeInteger(value.loopCount) || value.loopCount <= 0) {
    throw new ReelError(`${label} loopCount must be a positive safe integer.`);
  }
  return Object.freeze({
    effectId: value.effectId,
    durationMs: assertPositiveNumber(value.durationMs, `${label} durationMs`),
    loopCount: value.loopCount,
    finishBeforeStopMs: assertNonNegativeNumber(
      value.finishBeforeStopMs,
      `${label} finishBeforeStopMs`,
    ),
  });
}

function selectOrder(
  order: readonly GridCellCoordinate[],
  positions: readonly GridCellSpinPosition[] | undefined,
  columns: number,
  rows: number,
): readonly (GridCellCoordinate & { readonly startGroupIndex: number })[] {
  if (positions === undefined) {
    return Object.freeze(
      order.map((cell, startGroupIndex) =>
        Object.freeze({ ...cell, startGroupIndex }),
      ),
    );
  }
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new ReelError("selective grid positions must not be empty.");
  }
  const byKey = new Map(order.map((cell) => [`${cell.x}:${cell.y}`, cell]));
  const seen = new Set<string>();
  const hasExplicitStartGroups = positions.some(
    (position) => position.startGroupIndex !== undefined,
  );
  if (
    hasExplicitStartGroups &&
    positions.some((position) => position.startGroupIndex === undefined)
  ) {
    throw new ReelError(
      "selective grid positions must either all define startGroupIndex or all omit it.",
    );
  }
  let previousStartGroupIndex = -1;
  return Object.freeze(
    positions.map((position, index) => {
      if (
        !Number.isInteger(position.x) ||
        position.x < 0 ||
        position.x >= columns ||
        !Number.isInteger(position.y) ||
        position.y < 0 ||
        position.y >= rows
      ) {
        throw new ReelError(
          `selective grid positions[${index}] is out of range.`,
        );
      }
      const key = `${position.x}:${position.y}`;
      if (seen.has(key)) {
        throw new ReelError(
          `duplicate selective grid position (${position.x},${position.y}).`,
        );
      }
      seen.add(key);
      const startGroupIndex = hasExplicitStartGroups
        ? assertNonNegativeSafeInteger(
            position.startGroupIndex,
            `selective grid positions[${index}].startGroupIndex`,
          )
        : index;
      if (index === 0 && startGroupIndex !== 0) {
        throw new ReelError(
          "selective grid positions first startGroupIndex must be 0.",
        );
      }
      if (startGroupIndex < previousStartGroupIndex) {
        throw new ReelError(
          "selective grid positions startGroupIndex must be non-decreasing.",
        );
      }
      previousStartGroupIndex = startGroupIndex;
      return Object.freeze({ ...byKey.get(key)!, startGroupIndex });
    }),
  );
}

function parseTargetScene(
  value: SceneMatrix,
  columns: number,
  rows: number,
): SceneMatrix {
  if (!Array.isArray(value) || value.length !== columns) {
    throw new ReelError(`targetScene length must be ${columns}.`);
  }
  return Object.freeze(
    value.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows) {
        throw new ReelError(`targetScene[${x}] length must be ${rows}.`);
      }
      return Object.freeze(
        column.map((code, y) => {
          if (!Number.isInteger(code) || code < 0) {
            throw new ReelError(
              `targetScene[${x}][${y}] must be a non-negative integer.`,
            );
          }
          return code;
        }),
      );
    }),
  );
}

function parseFinalYs(
  value: readonly number[],
  columns: number,
): readonly number[] {
  if (!Array.isArray(value) || value.length !== columns) {
    throw new ReelError(`finalYs length must be ${columns}.`);
  }
  return Object.freeze(
    value.map((finalY, x) => assertInteger(finalY, `finalYs[${x}]`)),
  );
}

function parseOrder(
  value: readonly GridCellCoordinate[],
  columns: number,
  rows: number,
): readonly GridCellCoordinate[] {
  const cellCount = columns * rows;
  if (!Array.isArray(value) || value.length !== cellCount) {
    throw new ReelError(`grid cell order length must be ${cellCount}.`);
  }

  const seenCoordinates = new Set<string>();
  const seenOrderIndexes = new Set<number>();
  for (const [index, cell] of value.entries()) {
    if (!Number.isInteger(cell.x) || cell.x < 0 || cell.x >= columns) {
      throw new ReelError(`grid cell order[${index}].x is out of range.`);
    }
    if (!Number.isInteger(cell.y) || cell.y < 0 || cell.y >= rows) {
      throw new ReelError(`grid cell order[${index}].y is out of range.`);
    }
    if (
      !Number.isInteger(cell.orderIndex) ||
      cell.orderIndex < 0 ||
      cell.orderIndex >= cellCount
    ) {
      throw new ReelError(
        `grid cell order[${index}].orderIndex is out of range.`,
      );
    }
    if (cell.orderIndex !== index) {
      throw new ReelError(
        `grid cell order[${index}].orderIndex must match its position.`,
      );
    }
    const coordinateKey = `${cell.x}:${cell.y}`;
    if (seenCoordinates.has(coordinateKey)) {
      throw new ReelError(
        `duplicate grid cell coordinate (${cell.x},${cell.y}).`,
      );
    }
    if (seenOrderIndexes.has(cell.orderIndex)) {
      throw new ReelError(`duplicate grid cell orderIndex ${cell.orderIndex}.`);
    }
    seenCoordinates.add(coordinateKey);
    seenOrderIndexes.add(cell.orderIndex);
  }

  return Object.freeze(
    value.map((cell) =>
      Object.freeze({
        x: cell.x,
        y: cell.y,
        orderIndex: cell.orderIndex,
      }),
    ),
  );
}

function parseTiming(value: GridCellReelSpinTiming): GridCellReelSpinTiming {
  return Object.freeze({
    startStepMs: assertNonNegativeNumber(value.startStepMs, "startStepMs"),
    stopStepMs: assertNonNegativeNumber(value.stopStepMs, "stopStepMs"),
    settleAfterLastStartMs: assertNonNegativeNumber(
      value.settleAfterLastStartMs,
      "settleAfterLastStartMs",
    ),
    minimumSpinCycles: assertPositiveInteger(
      value.minimumSpinCycles,
      "minimumSpinCycles",
    ),
    speedSymbolsPerSecond: assertPositiveNumber(
      value.speedSymbolsPerSecond,
      "speedSymbolsPerSecond",
    ),
  });
}

function parseDimming(value: GridCellDimmingPattern): GridCellDimmingPattern {
  if (typeof value.resolveDimmingAlpha !== "function") {
    throw new ReelError("resolveDimmingAlpha must be a function.");
  }
  return Object.freeze({
    resolveDimmingAlpha: value.resolveDimmingAlpha,
    fadeInMs: assertNonNegativeNumber(value.fadeInMs, "fadeInMs"),
    fadeOutMs: assertNonNegativeNumber(value.fadeOutMs, "fadeOutMs"),
  });
}

export function resolveGridCellDimmingAlpha(
  dimming: GridCellDimmingPattern,
  code: number,
  activated = false,
): number {
  if (!Number.isSafeInteger(code) || code < 0) {
    throw new ReelError("grid cell dimming code must be non-negative.");
  }
  return assertAlpha(
    dimming.resolveDimmingAlpha(code, activated),
    `dimming alpha for symbol code ${code}`,
  );
}

function parseOptionalBoolean(value: unknown, label: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new ReelError(`${label} must be a boolean.`);
  }
  return value;
}

function parseDirection(
  value: ReelSpinDirection | undefined,
): ReelSpinDirection {
  if (value === undefined) {
    return "forward";
  }
  if (value === "forward" || value === "backward") {
    return value;
  }
  throw new ReelError('direction must be "forward" or "backward".');
}

function assertInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new ReelError(`${label} must be an integer.`);
  }
  return value as number;
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive integer.`);
  }
  return value as number;
}

function assertPositiveNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive number.`);
  }
  return value as number;
}

function assertNonNegativeNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) < 0) {
    throw new ReelError(`${label} must be a non-negative number.`);
  }
  return value as number;
}

function assertNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ReelError(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function assertAlpha(value: unknown, label: string): number {
  const parsed = assertNonNegativeNumber(value, label);
  if (parsed > 1) {
    throw new ReelError(`${label} must be between 0 and 1.`);
  }
  return parsed;
}
