import type {
  GameLogicStep,
  SceneMatrix,
  SlotRoundPosition,
  SlotRoundPresentationValue,
  SlotRoundSettledTransformChangeDraft,
  SlotRoundSettledTransformRelocationDraft,
} from "@slotclientengine/gameframeworks";
import {
  assertExactMatrixShape,
  parseTransferRoutes,
  parseExactPositionPairs,
  requireExactlyOne,
} from "@slotclientengine/gameframeworks";
import { GAME002_CASCADE_COMPONENTS } from "./cascade-config.js";

export interface Game002CoCollectionPlan {
  readonly mainPos: readonly SlotRoundPosition[];
  readonly routes: readonly SlotRoundSettledTransformRelocationDraft[];
  readonly changes: readonly SlotRoundSettledTransformChangeDraft[];
}

export function compileGame002CoCollectionPlan(options: {
  readonly stepIndex: number;
  readonly step: GameLogicStep;
  readonly inputScene: SceneMatrix;
  readonly inputValues: readonly (readonly SlotRoundPresentationValue[])[];
  readonly coSymbolCode: number;
  readonly valueSymbolCodes: ReadonlySet<number>;
}): Game002CoCollectionPlan | null {
  const { step, stepIndex, inputScene, inputValues } = options;
  if (step.getComponentResults(GAME002_CASCADE_COMPONENTS.win).length > 0)
    return null;

  const mainPos = step
    .getComponentResults(GAME002_CASCADE_COMPONENTS.triggerco)
    .flatMap((result, index) =>
      parseExactPositionPairs(
        result.pos,
        inputScene,
        `step[${stepIndex}] bg-triggerco result[${index}].pos`,
      ),
    )
    .filter(({ x, y }) => inputScene[x]?.[y] === options.coSymbolCode);
  if (mainPos.length === 0) return null;

  assertExactMatrixShape(inputValues, inputScene, "CO input values");
  const component = step.getComponent(GAME002_CASCADE_COMPONENTS.co);
  const raw = component?.raw;
  const routes = parseTransferRoutes(
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Readonly<Record<string, unknown>>).pos
      : undefined,
    inputScene,
    `step[${stepIndex}] bg-co.pos`,
  );
  const outputScene = requireExactlyOne(
    step.getComponentScenes(GAME002_CASCADE_COMPONENTS.co),
    `step[${stepIndex}] bg-co scene`,
  );
  const outputValues = requireExactlyOne(
    step.getComponentOtherScenes(GAME002_CASCADE_COMPONENTS.cogencn),
    `step[${stepIndex}] bg-cogencn otherScene`,
  );
  assertExactMatrixShape(outputScene, inputScene, "bg-co scene");
  assertExactMatrixShape(outputValues, inputScene, "bg-cogencn otherScene");

  const changes = routes.flatMap(({ source, target }) => [
    change(
      source,
      outputScene,
      presentationValue(
        outputScene[source.x]![source.y]!,
        inputValues[source.x]![source.y]!,
        options.valueSymbolCodes,
        `step[${stepIndex}] bg-co source`,
      ),
    ),
    change(
      target,
      outputScene,
      presentationValue(
        outputScene[target.x]![target.y]!,
        inputValues[source.x]![source.y]!,
        options.valueSymbolCodes,
        `step[${stepIndex}] bg-co target`,
      ),
    ),
  ]);
  for (const position of mainPos)
    changes.push(
      change(
        position,
        outputScene,
        presentationValue(
          outputScene[position.x]![position.y]!,
          outputValues[position.x]![position.y]!,
          options.valueSymbolCodes,
          `step[${stepIndex}] bg-cogencn`,
        ),
      ),
    );

  return Object.freeze({
    mainPos: Object.freeze(mainPos),
    routes,
    changes: Object.freeze(changes),
  });
}

function change(
  position: SlotRoundPosition,
  outputScene: SceneMatrix,
  outputValue: SlotRoundPresentationValue,
): SlotRoundSettledTransformChangeDraft {
  return Object.freeze({
    position,
    outputCode: outputScene[position.x]![position.y]!,
    outputValue,
  });
}

function presentationValue(
  code: number,
  raw: SlotRoundPresentationValue,
  valueSymbolCodes: ReadonlySet<number>,
  label: string,
): SlotRoundPresentationValue {
  if (!valueSymbolCodes.has(code)) return null;
  if (!Number.isSafeInteger(raw) || raw === null || raw <= 0)
    throw new Error(`${label} value must be a positive safe integer.`);
  return raw;
}
