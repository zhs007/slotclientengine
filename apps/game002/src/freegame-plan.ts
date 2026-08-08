import type {
  GameLogic,
  GameLogicStep,
  SceneMatrix,
  SlotChgRoute,
  SlotRoundPosition,
  WinResult,
} from "@slotclientengine/gameframeworks";
import {
  assertExactMatrixShape,
  parseExactPositionPairs,
  parseTransferRoutes,
  requireExactlyOne,
  requireSafeInteger,
} from "@slotclientengine/gameframeworks";

export type Game002FreeGameValueMatrix = readonly (readonly (
  | number
  | null
)[])[];

export interface Game002FreeGameAfPlan {
  readonly positions: readonly SlotRoundPosition[];
  readonly addedFreeSpins: number;
  readonly outputScene: SceneMatrix;
  readonly outputValues: Game002FreeGameValueMatrix;
}

export interface Game002FreeGameCoPlan {
  readonly mainPos: readonly SlotRoundPosition[];
  readonly routes: readonly SlotChgRoute[];
  readonly outputScene: SceneMatrix;
  readonly outputValues: Game002FreeGameValueMatrix;
}

export interface Game002FreeGameSpinPlan {
  readonly stepIndex: number;
  readonly spinScene: SceneMatrix;
  readonly spinValues: Game002FreeGameValueMatrix;
  readonly respinNumber: number;
  readonly remainingFreeSpins: number;
  readonly spinPositions: readonly SlotRoundPosition[];
  readonly featurePositions: readonly SlotRoundPosition[];
  readonly af: Game002FreeGameAfPlan | null;
  readonly co: Game002FreeGameCoPlan | null;
  readonly winResults: readonly WinResult[];
}

export interface Game002FreeGamePlan {
  readonly triggerStepIndex: number;
  readonly triggerPositions: readonly SlotRoundPosition[];
  readonly initialFreeSpins: number;
  readonly spins: readonly Game002FreeGameSpinPlan[];
}

/** Parses the server FreeGame steps into the smallest operation inputs. */
export function compileGame002FreeGamePlan(options: {
  readonly logic: GameLogic;
  readonly entryScene: SceneMatrix;
  readonly entryValues: Game002FreeGameValueMatrix;
  readonly symbolCodes: Readonly<{ WL: number; CN: number }>;
}): Game002FreeGamePlan | null {
  const steps = options.logic.getSteps();
  const triggerStepIndex = steps.findIndex((step) =>
    step.hasComponent("bg-triggerfg"),
  );
  if (triggerStepIndex < 0) return null;
  const trigger = steps[triggerStepIndex]!;
  const triggerPositions = resultPositions(
    trigger.getComponentResults("bg-triggerfg"),
    options.entryScene,
    `step[${triggerStepIndex}] bg-triggerfg`,
  );
  const initialFreeSpins = positiveInteger(
    componentNumber(trigger, "fg-start", "lastRespinNum", triggerStepIndex),
    `step[${triggerStepIndex}] fg-start.lastRespinNum`,
  );

  let currentScene = options.entryScene;
  normalizeValues(
    options.entryValues,
    currentScene,
    options.symbolCodes,
    "FreeGame entry values",
  );
  const spins: Game002FreeGameSpinPlan[] = [];
  for (
    let stepIndex = triggerStepIndex + 1;
    stepIndex < steps.length;
    stepIndex += 1
  ) {
    const step = steps[stepIndex]!;
    if (!step.hasComponent("fg-start") || !step.hasComponent("fg-spin"))
      throw new Error(
        `step[${stepIndex}] after bg-triggerfg must contain fg-start and fg-spin.`,
      );

    const inputScene = currentScene;
    const spinScene = componentScene(step, "fg-spin", stepIndex);
    const spinValues = componentValues(
      step,
      "fg-spin",
      spinScene,
      options.symbolCodes,
      stepIndex,
    );
    const af = compileAf(step, stepIndex, spinScene, options.symbolCodes);
    const postAfScene = af?.outputScene ?? spinScene;
    const co = compileCo(step, stepIndex, postAfScene, options.symbolCodes);
    currentScene = co?.outputScene ?? postAfScene;
    const winResults = step.getComponentResults("fg-win");
    if (winResults.length > 0)
      resultPositions(winResults, currentScene, `step[${stepIndex}] fg-win`);

    spins.push(
      Object.freeze({
        stepIndex,
        spinScene,
        spinValues,
        respinNumber: nonNegativeInteger(
          componentNumber(step, "fg-start", "curRespinNum", stepIndex),
          `step[${stepIndex}] fg-start.curRespinNum`,
        ),
        remainingFreeSpins: nonNegativeInteger(
          componentNumber(step, "fg-start", "lastRespinNum", stepIndex),
          `step[${stepIndex}] fg-start.lastRespinNum`,
        ),
        spinPositions: nonHeldPositions(inputScene, options.symbolCodes),
        featurePositions: componentPositions(
          step,
          "fg-spin",
          spinScene,
          stepIndex,
        ),
        af,
        co,
        winResults: Object.freeze([...winResults]),
      }),
    );
  }
  if (spins.length === 0) throw new Error("FreeGame has no spin step.");
  return Object.freeze({
    triggerStepIndex,
    triggerPositions,
    initialFreeSpins,
    spins: Object.freeze(spins),
  });
}

function compileAf(
  step: GameLogicStep,
  stepIndex: number,
  inputScene: SceneMatrix,
  codes: Readonly<{ WL: number; CN: number }>,
): Game002FreeGameAfPlan | null {
  if (!step.hasComponent("fg-triggeraf")) return null;
  const positions = resultPositions(
    step.getComponentResults("fg-triggeraf"),
    inputScene,
    `step[${stepIndex}] fg-triggeraf`,
  );
  const outputScene = componentScene(step, "fg-af2cn", stepIndex);
  return Object.freeze({
    positions,
    addedFreeSpins: positiveInteger(
      componentNumber(step, "fg-rollaf", "number", stepIndex),
      `step[${stepIndex}] fg-rollaf.number`,
    ),
    outputScene,
    outputValues: componentValues(
      step,
      "fg-genafcn",
      outputScene,
      codes,
      stepIndex,
    ),
  });
}

function compileCo(
  step: GameLogicStep,
  stepIndex: number,
  inputScene: SceneMatrix,
  codes: Readonly<{ WL: number; CN: number }>,
): Game002FreeGameCoPlan | null {
  if (!step.hasComponent("fg-triggerco")) return null;
  const mainPos = resultPositions(
    step.getComponentResults("fg-triggerco"),
    inputScene,
    `step[${stepIndex}] fg-triggerco`,
  );
  const component = step.getComponent("fg-vortex");
  const raw = component?.raw;
  const routes = parseTransferRoutes(
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Readonly<Record<string, unknown>>).pos
      : undefined,
    inputScene,
    `step[${stepIndex}] fg-vortex.pos`,
  );
  const outputScene = componentScene(step, "fg-vortex", stepIndex);
  return Object.freeze({
    mainPos,
    routes,
    outputScene,
    outputValues: componentValues(
      step,
      "fg-cogencn",
      outputScene,
      codes,
      stepIndex,
    ),
  });
}

function componentScene(
  step: GameLogicStep,
  name: string,
  stepIndex: number,
): SceneMatrix {
  return requireExactlyOne(
    step.getComponentScenes(name),
    `step[${stepIndex}] ${name} scene`,
  );
}

function componentValues(
  step: GameLogicStep,
  name: string,
  scene: SceneMatrix,
  codes: Readonly<{ WL: number; CN: number }>,
  stepIndex: number,
): Game002FreeGameValueMatrix {
  return normalizeValues(
    requireExactlyOne(
      step.getComponentOtherScenes(name),
      `step[${stepIndex}] ${name} otherScene`,
    ),
    scene,
    codes,
    `step[${stepIndex}] ${name} values`,
  );
}

function normalizeValues(
  values: readonly (readonly (number | null)[])[],
  scene: SceneMatrix,
  codes: Readonly<{ WL: number; CN: number }>,
  label: string,
): Game002FreeGameValueMatrix {
  assertExactMatrixShape(values, scene, label);
  return Object.freeze(
    values.map((column, x) =>
      Object.freeze(
        column.map((raw, y) => {
          const code = scene[x]![y]!;
          if (code !== codes.WL && code !== codes.CN) return null;
          if (raw === 0) return null;
          if (!Number.isSafeInteger(raw) || raw === null || raw <= 0)
            throw new Error(`${label}[${x}][${y}] must be positive for WL/CN.`);
          return raw;
        }),
      ),
    ),
  );
}

function componentPositions(
  step: GameLogicStep,
  name: string,
  scene: SceneMatrix,
  stepIndex: number,
): readonly SlotRoundPosition[] {
  const raw = step.getComponent(name)?.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(`step[${stepIndex}] ${name} is missing.`);
  const basic = (raw as Readonly<Record<string, unknown>>).basicComponentData;
  const basicPos =
    basic && typeof basic === "object" && !Array.isArray(basic)
      ? (basic as Readonly<Record<string, unknown>>).pos
      : undefined;
  return parsePositions(
    Array.isArray(basicPos) && basicPos.length > 0
      ? basicPos
      : (raw as Readonly<Record<string, unknown>>).pos,
    scene,
    `step[${stepIndex}] ${name}.pos`,
  );
}

function resultPositions(
  results: readonly WinResult[],
  scene: SceneMatrix,
  label: string,
): readonly SlotRoundPosition[] {
  return Object.freeze(
    results.flatMap((result, index) =>
      parsePositions(result.pos, scene, `${label} result[${index}].pos`),
    ),
  );
}

function parsePositions(raw: unknown, scene: SceneMatrix, label: string) {
  return parseExactPositionPairs(raw, scene, label, {
    rangeMessage: "is out of bounds",
  });
}

function nonHeldPositions(
  scene: SceneMatrix,
  codes: Readonly<{ WL: number; CN: number }>,
): readonly SlotRoundPosition[] {
  return Object.freeze(
    scene.flatMap((column, x) =>
      column.flatMap((code, y) =>
        code === codes.WL || code === codes.CN ? [] : [Object.freeze({ x, y })],
      ),
    ),
  );
}

function componentNumber(
  step: GameLogicStep,
  name: string,
  field: string,
  stepIndex: number,
): unknown {
  const direct = step.getComponent(name)?.raw;
  if (direct && typeof direct === "object" && !Array.isArray(direct))
    return (direct as Readonly<Record<string, unknown>>)[field];
  const clientData = step.getRawClientData();
  const raw =
    clientData && typeof clientData === "object" && !Array.isArray(clientData)
      ? (clientData as Readonly<Record<string, unknown>>).curGameModParam
      : null;
  const components =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Readonly<Record<string, unknown>>).mapComponents
      : null;
  if (
    !components ||
    typeof components !== "object" ||
    Array.isArray(components)
  )
    throw new Error(`step[${stepIndex}] ${name} is missing.`);
  const component = (components as Readonly<Record<string, unknown>>)[name];
  if (!component || typeof component !== "object" || Array.isArray(component))
    throw new Error(`step[${stepIndex}] ${name} is missing.`);
  return (component as Readonly<Record<string, unknown>>)[field];
}

function positiveInteger(value: unknown, label: string): number {
  return requireSafeInteger(value, label, { minimum: 1 });
}

function nonNegativeInteger(value: unknown, label: string): number {
  return requireSafeInteger(value, label, { minimum: 0 });
}
