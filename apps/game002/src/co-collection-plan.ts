import type {
  GameLogicStep,
  SceneMatrix,
  SlotRoundPosition,
  SlotRoundPresentationValue,
  SlotRoundSettledTransformChangeDraft,
  SlotRoundSettledTransformDraft,
} from "@slotclientengine/gameframeworks";
import {
  slotOperationPositionKey as positionKey,
  assertExactMatrixShape as assertMatrixDimensions,
  findMatrixValuePositions as findCodePositions,
  parseExactPositionPairs as parsePairs,
  requireExactlyOne as exactlyOne,
  requireSafeIntegerArray,
  validatePositionInMatrix as validatePosition,
} from "@slotclientengine/gameframeworks";
import { GAME002_CASCADE_COMPONENTS } from "./cascade-config.js";

export interface Game002CoTransfer {
  readonly source: SlotRoundPosition;
  readonly target: SlotRoundPosition;
  readonly sourceCode: number;
  readonly sourceValue: SlotRoundPresentationValue;
}

export interface Game002CoCollectionSegment {
  readonly co: SlotRoundPosition;
  readonly selectedCode: number;
  readonly transfers: readonly Game002CoTransfer[];
}

export interface Game002CoCollectionPlan {
  readonly stepIndex: number;
  readonly segments: readonly Game002CoCollectionSegment[];
  readonly sourcePositions: readonly SlotRoundPosition[];
  readonly transform: SlotRoundSettledTransformDraft;
}

const COLLECTION_COMPONENTS = Object.freeze([
  GAME002_CASCADE_COMPONENTS.co,
  GAME002_CASCADE_COMPONENTS.cogencn,
  GAME002_CASCADE_COMPONENTS.win2,
  GAME002_CASCADE_COMPONENTS.bn,
]);

export function compileGame002CoCollectionPlan(options: {
  readonly stepIndex: number;
  readonly step: GameLogicStep;
  readonly inputScene: SceneMatrix;
  readonly inputValues: readonly (readonly SlotRoundPresentationValue[])[];
  readonly coSymbolCode: number;
  readonly bnSymbolCode: number;
  readonly valueSymbolCodes: ReadonlySet<number>;
}): Game002CoCollectionPlan | null {
  const { step, stepIndex, inputScene, inputValues } = options;
  assertMatrixDimensions(inputValues, inputScene, "CO input values");
  const actualWinResults = step.getComponentResults(
    GAME002_CASCADE_COMPONENTS.win,
  );
  const hasCollectionComponent = COLLECTION_COMPONENTS.some((name) =>
    step.hasComponent(name),
  );
  const hasTrigger = step.hasComponent(GAME002_CASCADE_COMPONENTS.triggerco);
  if (actualWinResults.length > 0) {
    if (hasTrigger || hasCollectionComponent)
      throw new Error(
        `step[${stepIndex}] bg-win results take priority and cannot coexist with CO collection components.`,
      );
    return null;
  }
  if (!hasTrigger && !hasCollectionComponent) return null;
  if (!hasTrigger)
    throw new Error(`step[${stepIndex}] CO collection requires bg-triggerco.`);

  const coPositions = findCodePositions(inputScene, options.coSymbolCode);
  const triggerPositions = step
    .getComponentResults(GAME002_CASCADE_COMPONENTS.triggerco)
    .flatMap((result, index) =>
      parsePairs(
        result.pos,
        inputScene,
        `step[${stepIndex}] bg-triggerco result[${index}].pos`,
        { nonEmpty: true },
      ),
    )
    .filter(({ x, y }) => inputScene[x]?.[y] === options.coSymbolCode);
  if (triggerPositions.length === 0) {
    assertComponentsAbsent(step, stepIndex, COLLECTION_COMPONENTS);
    return null;
  }
  for (const name of COLLECTION_COMPONENTS)
    if (!step.hasComponent(name))
      throw new Error(
        `step[${stepIndex}] triggered CO collection requires component "${name}".`,
      );
  if (coPositions.length === 0)
    throw new Error(
      `step[${stepIndex}] bg-triggerco selected CO but settled scene has no CO.`,
    );

  const coComponent = step.getComponent(GAME002_CASCADE_COMPONENTS.co);
  if (!coComponent)
    throw new Error(`step[${stepIndex}] bg-co component is missing.`);
  const raw = asRecord(coComponent.raw, `step[${stepIndex}] bg-co`);
  const encoded = requireSafeIntegerArray(
    raw.pos,
    `step[${stepIndex}] bg-co.pos`,
  );
  const encodedSegments = splitTransferSegments(encoded, stepIndex);
  const outputScene = exactlyOne(
    step.getComponentScenes(GAME002_CASCADE_COMPONENTS.co),
    `step[${stepIndex}] bg-co scene`,
  );
  const generatedCnValuesRaw = exactlyOne(
    step.getComponentOtherScenes(GAME002_CASCADE_COMPONENTS.cogencn),
    `step[${stepIndex}] bg-cogencn otherScene`,
  );
  assertMatrixDimensions(outputScene, inputScene, "bg-co scene");
  assertMatrixDimensions(
    generatedCnValuesRaw,
    inputScene,
    "bg-cogencn otherScene",
  );

  const usedPositions = new Set<string>();
  const mappedCos = new Set<string>();
  const segments: Game002CoCollectionSegment[] = [];
  const changes = new Map<string, SlotRoundSettledTransformChangeDraft>();
  const relocations: Array<{
    readonly source: SlotRoundPosition;
    readonly target: SlotRoundPosition;
  }> = [];
  for (const [segmentIndex, encodedSegment] of encodedSegments.entries()) {
    const transfers = encodedSegment.map(
      ([sourceX, sourceY, targetX, targetY], transferIndex) => {
        const source = validatePosition(
          { x: sourceX, y: sourceY },
          inputScene,
          `step[${stepIndex}] bg-co segment[${segmentIndex}] transfer[${transferIndex}].source`,
          { rangeMessage: "is out of range" },
        );
        const target = validatePosition(
          { x: targetX, y: targetY },
          inputScene,
          `step[${stepIndex}] bg-co segment[${segmentIndex}] transfer[${transferIndex}].target`,
          { rangeMessage: "is out of range" },
        );
        for (const [role, position] of [
          ["source", source],
          ["target", target],
        ] as const) {
          const key = positionKey(position);
          if (usedPositions.has(key))
            throw new Error(
              `step[${stepIndex}] bg-co ${role} position ${key} is reused across the collection batch.`,
            );
          usedPositions.add(key);
        }
        const sourceCode = inputScene[source.x][source.y];
        if (
          sourceCode === options.coSymbolCode ||
          sourceCode === options.bnSymbolCode
        )
          throw new Error(
            `step[${stepIndex}] bg-co source ${positionKey(source)} cannot be CO or BN.`,
          );
        const sourceValue = inputValues[source.x][source.y];
        if (
          options.valueSymbolCodes.has(sourceCode) &&
          (!Number.isSafeInteger(sourceValue) || (sourceValue ?? 0) <= 0)
        )
          throw new Error(
            `step[${stepIndex}] bg-co source ${positionKey(source)} value must be positive.`,
          );
        return Object.freeze({
          source,
          target,
          sourceCode,
          sourceValue,
        });
      },
    );
    const selectedCode = transfers[0]!.sourceCode;
    if (transfers.some((transfer) => transfer.sourceCode !== selectedCode))
      throw new Error(
        `step[${stepIndex}] bg-co segment[${segmentIndex}] sources must use one symbol code.`,
      );
    const candidates = coPositions.filter(
      (co) =>
        !mappedCos.has(positionKey(co)) &&
        transfers.every((transfer) => isEightNeighbor(co, transfer.target)),
    );
    if (candidates.length !== 1)
      throw new Error(
        `step[${stepIndex}] bg-co segment[${segmentIndex}] must map to exactly one CO; received ${candidates.length}.`,
      );
    const co = candidates[0]!;
    const coKey = positionKey(co);
    if (usedPositions.has(coKey))
      throw new Error(
        `step[${stepIndex}] bg-co position ${coKey} collides with a source or target.`,
      );
    usedPositions.add(coKey);
    mappedCos.add(coKey);
    for (const transfer of transfers) {
      setChange(changes, {
        position: transfer.source,
        outputCode: options.bnSymbolCode,
        outputValue: null,
      });
      setChange(changes, {
        position: transfer.target,
        outputCode: selectedCode,
        outputValue: transfer.sourceValue,
      });
      relocations.push(
        Object.freeze({
          source: transfer.source,
          target: transfer.target,
        }),
      );
    }
    const coOutputValue = decodeGeneratedCoOutputValue(
      selectedCode,
      generatedCnValuesRaw[co.x][co.y],
      options.valueSymbolCodes,
      `step[${stepIndex}] bg-cogencn otherScene[${co.x}][${co.y}]`,
    );
    setChange(changes, {
      position: co,
      outputCode: selectedCode,
      outputValue: coOutputValue,
    });
    segments.push(
      Object.freeze({
        co,
        selectedCode,
        transfers: Object.freeze(transfers),
      }),
    );
  }

  const sourcePositions = segments.flatMap((segment) =>
    segment.transfers.map((transfer) => transfer.source),
  );
  return Object.freeze({
    stepIndex,
    segments: Object.freeze(segments),
    sourcePositions: Object.freeze(sourcePositions),
    transform: Object.freeze({
      changes: Object.freeze(
        inputScene.flatMap((column, x) =>
          column.flatMap((_code, y) => {
            const change = changes.get(`${x},${y}`);
            return change ? [Object.freeze(change)] : [];
          }),
        ),
      ),
      relocations: Object.freeze(relocations),
    }),
  });
}

function splitTransferSegments(
  encoded: readonly number[],
  stepIndex: number,
): readonly (readonly (readonly [number, number, number, number])[])[] {
  const chunks: number[][] = [[]];
  for (const value of encoded) {
    if (value === -1) {
      if (chunks[chunks.length - 1]!.length === 0)
        throw new Error(
          `step[${stepIndex}] bg-co.pos contains an empty segment.`,
        );
      chunks.push([]);
    } else {
      chunks[chunks.length - 1]!.push(value);
    }
  }
  if (chunks[chunks.length - 1]!.length === 0) chunks.pop();
  return Object.freeze(
    chunks.map((chunk, segmentIndex) => {
      if (chunk.length % 4 !== 0)
        throw new Error(
          `step[${stepIndex}] bg-co.pos segment[${segmentIndex}] must contain coordinate quadruples.`,
        );
      const count = chunk.length / 4;
      if (count < 4 || count > 8)
        throw new Error(
          `step[${stepIndex}] bg-co.pos segment[${segmentIndex}] must contain 4..8 transfers; received ${count}.`,
        );
      return Object.freeze(
        Array.from(
          { length: count },
          (_unused, index) =>
            Object.freeze(
              chunk.slice(index * 4, index * 4 + 4),
            ) as unknown as readonly [number, number, number, number],
        ),
      );
    }),
  );
}

function decodeGeneratedCoOutputValue(
  code: number,
  raw: number,
  valueSymbolCodes: ReadonlySet<number>,
  label: string,
): SlotRoundPresentationValue {
  if (valueSymbolCodes.has(code)) {
    if (!Number.isSafeInteger(raw) || raw <= 0)
      throw new Error(`${label} must be a positive safe integer.`);
    return raw;
  }
  if (!Number.isSafeInteger(raw))
    throw new Error(`${label} must be a safe integer.`);
  return null;
}

function assertComponentsAbsent(
  step: GameLogicStep,
  stepIndex: number,
  names: readonly string[],
): void {
  const present = names.filter((name) => step.hasComponent(name));
  if (present.length > 0)
    throw new Error(
      `step[${stepIndex}] has no triggered CO but contains ${present.join(", ")}.`,
    );
}

function asRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Readonly<Record<string, unknown>>;
}

function setChange(
  changes: Map<string, SlotRoundSettledTransformChangeDraft>,
  change: SlotRoundSettledTransformChangeDraft,
): void {
  const key = positionKey(change.position);
  if (changes.has(key))
    throw new Error(
      `CO collection contains duplicate transform position ${key}.`,
    );
  changes.set(key, Object.freeze(change));
}

function isEightNeighbor(
  center: SlotRoundPosition,
  position: SlotRoundPosition,
): boolean {
  const dx = Math.abs(center.x - position.x);
  const dy = Math.abs(center.y - position.y);
  return dx <= 1 && dy <= 1 && dx + dy > 0;
}
