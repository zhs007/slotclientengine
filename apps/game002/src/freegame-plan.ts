import type {
  GameLogic,
  GameLogicStep,
  SceneMatrix,
  SlotRoundPosition,
  WinResult,
} from "@slotclientengine/gameframeworks";

export type Game002FreeGameValueMatrix = readonly (readonly (
  | number
  | null
)[])[];
type VortexTuple = readonly [number, number, number, number];

export interface Game002FreeGameAfPlan {
  readonly positions: readonly SlotRoundPosition[];
  readonly addedFreeSpins: number;
  readonly outputScene: SceneMatrix;
  readonly outputValues: Game002FreeGameValueMatrix;
}

export interface Game002FreeGameCoTransfer {
  readonly source: SlotRoundPosition;
  readonly target: SlotRoundPosition;
  readonly sourceCode: number;
  readonly sourceValue: number | null;
  readonly targetCode: number;
}

export interface Game002FreeGameCoPlan {
  readonly coPositions: readonly SlotRoundPosition[];
  readonly sourcePositions: readonly SlotRoundPosition[];
  readonly transfers: readonly Game002FreeGameCoTransfer[];
  readonly outputScene: SceneMatrix;
  readonly outputValues: Game002FreeGameValueMatrix;
}

export interface Game002FreeGameSpinPlan {
  readonly stepIndex: number;
  readonly inputScene: SceneMatrix;
  readonly inputValues: Game002FreeGameValueMatrix;
  readonly spinScene: SceneMatrix;
  readonly spinValues: Game002FreeGameValueMatrix;
  readonly respinNumber: number;
  readonly remainingFreeSpins: number;
  readonly spinPositions: readonly SlotRoundPosition[];
  readonly featurePositions: readonly SlotRoundPosition[];
  readonly af: Game002FreeGameAfPlan | null;
  readonly co: Game002FreeGameCoPlan | null;
  readonly outputScene: SceneMatrix;
  readonly outputValues: Game002FreeGameValueMatrix;
  readonly winResults: readonly WinResult[];
}

export interface Game002FreeGamePlan {
  readonly triggerStepIndex: number;
  readonly triggerPositions: readonly SlotRoundPosition[];
  readonly entryScene: SceneMatrix;
  readonly entryValues: Game002FreeGameValueMatrix;
  readonly initialFreeSpins: number;
  readonly spins: readonly Game002FreeGameSpinPlan[];
  readonly finalStepIndex: number;
  readonly finalScene: SceneMatrix;
  readonly finalValues: Game002FreeGameValueMatrix;
}

/**
 * Compiles every game002 FreeGame scene, counter and transaction before any
 * FreeGame presentation mutation. The renderer receives no component names.
 */
export function compileGame002FreeGamePlan(options: {
  readonly logic: GameLogic;
  readonly entryScene: SceneMatrix;
  readonly entryValues: Game002FreeGameValueMatrix;
  readonly symbolCodes: Readonly<{
    WL: number;
    CN: number;
    CO: number;
    AF: number;
    BN: number;
  }>;
}): Game002FreeGamePlan | null {
  const steps = options.logic.getSteps();
  const triggerStepIndex = steps.findIndex((step) =>
    step.hasComponent("bg-triggerfg"),
  );
  if (triggerStepIndex < 0) return null;
  const trigger = steps[triggerStepIndex]!;
  const triggerResults = trigger.getComponentResults("bg-triggerfg");
  if (
    triggerResults.length !== 1 ||
    triggerResults[0]?.type !== 5 ||
    triggerResults[0]?.symbol !== options.symbolCodes.WL
  )
    throw new Error(
      `step[${triggerStepIndex}] bg-triggerfg must select exactly one type=5 WL result.`,
    );
  if (
    trigger.getComponentResults("bg-win").length > 0 ||
    trigger.getComponentResults("bg-win2").length > 0
  )
    throw new Error(
      `step[${triggerStepIndex}] bg-triggerfg must not coexist with a paid BaseGame win.`,
    );
  const triggerPositions = positionsFromResults(
    triggerResults,
    options.entryScene,
    `step[${triggerStepIndex}] bg-triggerfg`,
  );
  assertCodes(
    options.entryScene,
    triggerPositions,
    options.symbolCodes.WL,
    `step[${triggerStepIndex}] bg-triggerfg`,
  );
  const initialFreeSpins = positiveInteger(
    componentNumber(trigger, "fg-start", "lastRespinNum", triggerStepIndex),
    `step[${triggerStepIndex}] fg-start.lastRespinNum`,
  );
  const initialCurRespin = nonNegativeInteger(
    componentNumber(trigger, "fg-start", "curRespinNum", triggerStepIndex),
    `step[${triggerStepIndex}] fg-start.curRespinNum`,
  );
  if (initialCurRespin !== 0)
    throw new Error(
      `step[${triggerStepIndex}] fg-start.curRespinNum must be 0.`,
    );

  let currentScene = validateScene(options.entryScene, "FreeGame entry scene");
  let currentValues = validateValues(
    options.entryValues,
    currentScene,
    options.symbolCodes,
    "FreeGame entry values",
  );
  let previousRemaining = initialFreeSpins;
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
    const inputScene = exactlyOneIndexedScene(
      step,
      0,
      currentScene,
      `step[${stepIndex}] FreeGame source`,
    );
    const inputValues = currentValues;
    const respinNumber = nonNegativeInteger(
      componentNumber(step, "fg-start", "curRespinNum", stepIndex),
      `step[${stepIndex}] fg-start.curRespinNum`,
    );
    const expectedRespin = spins.length + 1;
    if (respinNumber !== expectedRespin)
      throw new Error(
        `step[${stepIndex}] fg-start.curRespinNum=${respinNumber}; expected ${expectedRespin}.`,
      );
    const spinScene = exactlyOneComponentScene(step, "fg-spin", stepIndex);
    validateScene(spinScene, `step[${stepIndex}] fg-spin scene`);
    const spinValues = componentValues(
      step,
      "fg-spin",
      spinScene,
      options.symbolCodes,
      stepIndex,
    );
    const spinPositions = nonHeldPositions(
      inputScene,
      options.symbolCodes.WL,
      options.symbolCodes.CN,
    );
    const featurePositions = componentPositions(
      step,
      "fg-spin",
      spinScene,
      stepIndex,
    );
    for (const position of featurePositions) {
      const output = spinScene[position.x]![position.y]!;
      if (
        output !== options.symbolCodes.WL &&
        output !== options.symbolCodes.CN &&
        output !== options.symbolCodes.CO &&
        output !== options.symbolCodes.AF
      )
        throw new Error(
          `step[${stepIndex}] fg-spin feature position (${position.x},${position.y}) has illegal symbol code ${output}.`,
        );
    }

    const af = compileAf({
      step,
      stepIndex,
      inputScene: spinScene,
      inputValues: spinValues,
      codes: options.symbolCodes,
    });
    const postAfScene = af?.outputScene ?? spinScene;
    const postAfValues = af?.outputValues ?? spinValues;
    const co = compileCo({
      step,
      stepIndex,
      inputScene: postAfScene,
      inputValues: postAfValues,
      codes: options.symbolCodes,
    });
    const outputScene = co?.outputScene ?? postAfScene;
    const outputValues = co?.outputValues ?? postAfValues;
    const remainingFreeSpins = nonNegativeInteger(
      componentNumber(step, "fg-start", "lastRespinNum", stepIndex),
      `step[${stepIndex}] fg-start.lastRespinNum`,
    );
    const expectedRemaining = previousRemaining - 1 + (af?.addedFreeSpins ?? 0);
    if (remainingFreeSpins !== expectedRemaining)
      throw new Error(
        `step[${stepIndex}] fg-start.lastRespinNum=${remainingFreeSpins}; expected ${expectedRemaining}.`,
      );
    const winResults = step.getComponentResults("fg-win");
    if (winResults.length > 0) {
      for (const [resultIndex, result] of winResults.entries())
        if (result.type !== 6 || result.symbol !== options.symbolCodes.CN)
          throw new Error(
            `step[${stepIndex}] fg-win result[${resultIndex}] must be type=6 CN.`,
          );
      positionsFromResults(
        winResults,
        outputScene,
        `step[${stepIndex}] fg-win`,
      );
      if (remainingFreeSpins !== 0)
        throw new Error(`step[${stepIndex}] fg-win requires lastRespinNum=0.`);
      if (stepIndex !== steps.length - 1)
        throw new Error(`step[${stepIndex}] fg-win must finish the round.`);
    } else if (remainingFreeSpins === 0)
      throw new Error(
        `step[${stepIndex}] lastRespinNum=0 requires terminal fg-win.`,
      );
    spins.push(
      Object.freeze({
        stepIndex,
        inputScene,
        inputValues,
        spinScene,
        spinValues,
        respinNumber,
        remainingFreeSpins,
        spinPositions,
        featurePositions,
        af,
        co,
        outputScene,
        outputValues,
        winResults: Object.freeze([...winResults]),
      }),
    );
    currentScene = outputScene;
    currentValues = outputValues;
    previousRemaining = remainingFreeSpins;
  }
  const last = spins.at(-1);
  if (!last || last.winResults.length === 0)
    throw new Error("FreeGame must terminate with fg-win.");
  return Object.freeze({
    triggerStepIndex,
    triggerPositions,
    entryScene: currentSnapshotScene(options.entryScene),
    entryValues: currentSnapshotValues(options.entryValues),
    initialFreeSpins,
    spins: Object.freeze(spins),
    finalStepIndex: last.stepIndex,
    finalScene: last.outputScene,
    finalValues: last.outputValues,
  });
}

function compileAf(options: {
  readonly step: GameLogicStep;
  readonly stepIndex: number;
  readonly inputScene: SceneMatrix;
  readonly inputValues: Game002FreeGameValueMatrix;
  readonly codes: Readonly<{ AF: number; CN: number; WL: number }>;
}): Game002FreeGameAfPlan | null {
  const names = ["fg-triggeraf", "fg-rollaf", "fg-af2cn", "fg-genafcn"];
  const present = names.filter((name) => options.step.hasComponent(name));
  if (present.length === 0) return null;
  if (present.length !== names.length)
    throw new Error(
      `step[${options.stepIndex}] AF protocol is partial: ${present.join(",")}.`,
    );
  const addedFreeSpins = positiveInteger(
    componentNumber(options.step, "fg-rollaf", "number", options.stepIndex),
    `step[${options.stepIndex}] fg-rollaf.number`,
  );
  const positions = positionsFromResults(
    options.step.getComponentResults("fg-triggeraf"),
    options.inputScene,
    `step[${options.stepIndex}] fg-triggeraf`,
  );
  if (positions.length === 0)
    throw new Error(
      `step[${options.stepIndex}] fg-triggeraf must select AF positions.`,
    );
  assertCodes(
    options.inputScene,
    positions,
    options.codes.AF,
    `step[${options.stepIndex}] fg-triggeraf`,
  );
  const declaredPositions = componentPositions(
    options.step,
    "fg-af2cn",
    options.inputScene,
    options.stepIndex,
  );
  assertPositionSetEqual(
    positions,
    declaredPositions,
    `step[${options.stepIndex}] fg-af2cn.pos`,
  );
  const outputScene = exactlyOneComponentScene(
    options.step,
    "fg-af2cn",
    options.stepIndex,
  );
  assertOnlyChanges({
    input: options.inputScene,
    output: outputScene,
    positions,
    expectedInput: options.codes.AF,
    expectedOutput: options.codes.CN,
    label: `step[${options.stepIndex}] fg-af2cn`,
  });
  const outputValues = componentValues(
    options.step,
    "fg-genafcn",
    outputScene,
    options.codes,
    options.stepIndex,
  );
  return Object.freeze({
    positions,
    addedFreeSpins,
    outputScene,
    outputValues,
  });
}

function compileCo(options: {
  readonly step: GameLogicStep;
  readonly stepIndex: number;
  readonly inputScene: SceneMatrix;
  readonly inputValues: Game002FreeGameValueMatrix;
  readonly codes: Readonly<{
    WL: number;
    CN: number;
    CO: number;
    BN: number;
  }>;
}): Game002FreeGameCoPlan | null {
  const names = ["fg-triggerco", "fg-vortex", "fg-cogencn"];
  const present = names.filter((name) => options.step.hasComponent(name));
  if (present.length === 0) return null;
  if (present.length !== names.length)
    throw new Error(
      `step[${options.stepIndex}] CO protocol is partial: ${present.join(",")}.`,
    );
  const coPositions = positionsFromResults(
    options.step.getComponentResults("fg-triggerco"),
    options.inputScene,
    `step[${options.stepIndex}] fg-triggerco`,
  );
  assertCodes(
    options.inputScene,
    coPositions,
    options.codes.CO,
    `step[${options.stepIndex}] fg-triggerco`,
  );
  const component = options.step.getComponent("fg-vortex");
  if (!component || !isRecord(component.raw))
    throw new Error(`step[${options.stepIndex}] fg-vortex is missing.`);
  const segments = splitVortex(component.raw.pos, options.stepIndex);
  if (segments.length !== coPositions.length)
    throw new Error(
      `step[${options.stepIndex}] fg-vortex segment count must match triggered CO count.`,
    );
  const used = new Set<string>();
  const transfers: Game002FreeGameCoTransfer[] = [];
  const sourcePositions: SlotRoundPosition[] = [];
  for (const [segmentIndex, segment] of segments.entries()) {
    const segmentTransfers: Game002FreeGameCoTransfer[] = [];
    for (const [sourceX, sourceY, targetX, targetY] of segment) {
      const source = position(
        sourceX,
        sourceY,
        options.inputScene,
        `step[${options.stepIndex}] fg-vortex source`,
      );
      const target = position(
        targetX,
        targetY,
        options.inputScene,
        `step[${options.stepIndex}] fg-vortex target`,
      );
      for (const candidate of [source, target]) {
        const key = positionKey(candidate);
        if (used.has(key))
          throw new Error(
            `step[${options.stepIndex}] fg-vortex reuses position ${key}.`,
          );
        used.add(key);
      }
      const sourceCode = options.inputScene[source.x]![source.y]!;
      if (sourceCode !== options.codes.WL && sourceCode !== options.codes.CN)
        throw new Error(
          `step[${options.stepIndex}] fg-vortex source ${positionKey(source)} must be WL or CN.`,
        );
      const transfer = Object.freeze({
        source,
        target,
        sourceCode,
        sourceValue: options.inputValues[source.x]![source.y]!,
        targetCode: options.inputScene[target.x]![target.y]!,
      });
      segmentTransfers.push(transfer);
      transfers.push(transfer);
      sourcePositions.push(source);
    }
    const candidates = coPositions.filter(
      (co) =>
        !used.has(positionKey(co)) &&
        segmentTransfers.every((transfer) =>
          isEightNeighbor(co, transfer.target),
        ),
    );
    if (candidates.length !== 1)
      throw new Error(
        `step[${options.stepIndex}] fg-vortex segment[${segmentIndex}] must map to exactly one CO.`,
      );
    used.add(positionKey(candidates[0]!));
  }
  const outputScene = exactlyOneComponentScene(
    options.step,
    "fg-vortex",
    options.stepIndex,
  );
  const outputValues = componentValues(
    options.step,
    "fg-cogencn",
    outputScene,
    options.codes,
    options.stepIndex,
  );
  const expected = mutableScene(options.inputScene);
  for (const transfer of transfers) {
    expected[transfer.source.x]![transfer.source.y] = options.codes.BN;
    expected[transfer.target.x]![transfer.target.y] = transfer.sourceCode;
  }
  for (const co of coPositions) expected[co.x]![co.y] = options.codes.CN;
  assertMatrixEqual(
    outputScene,
    expected,
    `step[${options.stepIndex}] fg-vortex output`,
  );
  return Object.freeze({
    coPositions,
    sourcePositions: Object.freeze(sourcePositions),
    transfers: Object.freeze(transfers),
    outputScene,
    outputValues,
  });
}

function componentValues(
  step: GameLogicStep,
  name: string,
  scene: SceneMatrix,
  codes: Readonly<{ WL: number; CN: number }>,
  stepIndex: number,
): Game002FreeGameValueMatrix {
  const values = step.getComponentOtherScenes(name);
  if (values.length !== 1)
    throw new Error(
      `step[${stepIndex}] ${name} must reference exactly one otherScene.`,
    );
  return validateValues(
    values[0]!,
    scene,
    codes,
    `step[${stepIndex}] ${name} values`,
  );
}

function validateValues(
  values: readonly (readonly (number | null)[])[],
  scene: SceneMatrix,
  codes: Readonly<{ WL: number; CN: number }>,
  label: string,
): Game002FreeGameValueMatrix {
  assertDimensions(values, scene, label);
  return Object.freeze(
    values.map((column, x) =>
      Object.freeze(
        column.map((raw, y) => {
          const code = scene[x]![y]!;
          if (code !== codes.WL && code !== codes.CN) return null;
          if (raw === 0) return null;
          if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw <= 0)
            throw new Error(`${label}[${x}][${y}] must be positive for WL/CN.`);
          return raw;
        }),
      ),
    ),
  );
}

function exactlyOneIndexedScene(
  step: GameLogicStep,
  index: number,
  expected: SceneMatrix,
  label: string,
): SceneMatrix {
  const scene = step.getScene(index);
  assertMatrixEqual(scene, expected, label);
  return scene;
}

function exactlyOneComponentScene(
  step: GameLogicStep,
  name: string,
  stepIndex: number,
): SceneMatrix {
  const scenes = step.getComponentScenes(name);
  if (scenes.length !== 1)
    throw new Error(
      `step[${stepIndex}] ${name} must reference exactly one scene.`,
    );
  return scenes[0]!;
}

function componentPositions(
  step: GameLogicStep,
  name: string,
  scene: SceneMatrix,
  stepIndex: number,
): readonly SlotRoundPosition[] {
  const component = step.getComponent(name);
  if (!component || !isRecord(component.raw))
    throw new Error(`step[${stepIndex}] ${name} is missing.`);
  const raw =
    isRecord(component.raw.basicComponentData) &&
    Array.isArray(component.raw.basicComponentData.pos) &&
    component.raw.basicComponentData.pos.length > 0
      ? component.raw.basicComponentData.pos
      : component.raw.pos;
  return positionsFromFlat(raw, scene, `step[${stepIndex}] ${name}.pos`);
}

function positionsFromResults(
  results: readonly WinResult[],
  scene: SceneMatrix,
  label: string,
): readonly SlotRoundPosition[] {
  return Object.freeze(
    results.flatMap((result, index) =>
      positionsFromFlat(result.pos, scene, `${label} result[${index}].pos`),
    ),
  );
}

function positionsFromFlat(
  raw: unknown,
  scene: SceneMatrix,
  label: string,
): readonly SlotRoundPosition[] {
  if (!Array.isArray(raw) || raw.length % 2 !== 0)
    throw new Error(`${label} must contain x/y pairs.`);
  const positions: SlotRoundPosition[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < raw.length; index += 2) {
    const value = position(raw[index], raw[index + 1], scene, label);
    const key = positionKey(value);
    if (seen.has(key)) throw new Error(`${label} contains duplicate ${key}.`);
    seen.add(key);
    positions.push(value);
  }
  return Object.freeze(positions);
}

function position(
  rawX: unknown,
  rawY: unknown,
  scene: SceneMatrix,
  label: string,
): SlotRoundPosition {
  const x = nonNegativeInteger(rawX, `${label}.x`);
  const y = nonNegativeInteger(rawY, `${label}.y`);
  if (scene[x]?.[y] === undefined)
    throw new Error(`${label} position (${x},${y}) is out of bounds.`);
  return Object.freeze({ x, y });
}

function nonHeldPositions(
  scene: SceneMatrix,
  wlCode: number,
  cnCode: number,
): readonly SlotRoundPosition[] {
  const result: SlotRoundPosition[] = [];
  for (let x = 0; x < scene.length; x += 1)
    for (let y = 0; y < scene[x]!.length; y += 1) {
      const code = scene[x]![y]!;
      if (code !== wlCode && code !== cnCode)
        result.push(Object.freeze({ x, y }));
    }
  return Object.freeze(result);
}

function splitVortex(
  raw: unknown,
  stepIndex: number,
): readonly (readonly VortexTuple[])[] {
  if (!Array.isArray(raw))
    throw new Error(`step[${stepIndex}] fg-vortex.pos must be an array.`);
  const segments: Array<Array<[number, number, number, number]>> = [[]];
  let tuple: number[] = [];
  for (const [index, value] of raw.entries()) {
    if (value === -1) {
      if (tuple.length > 0 || segments.at(-1)!.length === 0)
        throw new Error(
          `step[${stepIndex}] fg-vortex.pos separator at ${index} is invalid.`,
        );
      segments.push([]);
      continue;
    }
    tuple.push(nonNegativeInteger(value, `fg-vortex.pos[${index}]`));
    if (tuple.length === 4) {
      segments.at(-1)!.push(tuple as [number, number, number, number]);
      tuple = [];
    }
  }
  if (tuple.length > 0)
    throw new Error(`step[${stepIndex}] fg-vortex.pos has a partial tuple.`);
  if (segments.at(-1)!.length === 0) segments.pop();
  if (segments.length === 0)
    throw new Error(`step[${stepIndex}] fg-vortex.pos has no segment.`);
  return Object.freeze(
    segments.map((segment) =>
      Object.freeze(
        segment.map(
          (entry) =>
            Object.freeze(entry) as readonly [number, number, number, number],
        ),
      ),
    ),
  );
}

function assertOnlyChanges(options: {
  readonly input: SceneMatrix;
  readonly output: SceneMatrix;
  readonly positions: readonly SlotRoundPosition[];
  readonly expectedInput: number;
  readonly expectedOutput: number;
  readonly label: string;
}): void {
  const keys = new Set(options.positions.map(positionKey));
  assertDimensions(options.output, options.input, options.label);
  forEachCell(options.input, (x, y, input) => {
    const output = options.output[x]![y]!;
    if (keys.has(`${x},${y}`)) {
      if (input !== options.expectedInput || output !== options.expectedOutput)
        throw new Error(
          `${options.label} (${x},${y}) must change ${options.expectedInput} -> ${options.expectedOutput}.`,
        );
    } else if (input !== output)
      throw new Error(`${options.label} changed undeclared cell (${x},${y}).`);
  });
}

function assertCodes(
  scene: SceneMatrix,
  positions: readonly SlotRoundPosition[],
  expected: number,
  label: string,
): void {
  for (const { x, y } of positions)
    if (scene[x]![y] !== expected)
      throw new Error(`${label} (${x},${y}) must use symbol code ${expected}.`);
}

function assertPositionSetEqual(
  left: readonly SlotRoundPosition[],
  right: readonly SlotRoundPosition[],
  label: string,
): void {
  const a = new Set(left.map(positionKey));
  const b = new Set(right.map(positionKey));
  if (a.size !== b.size || [...a].some((key) => !b.has(key)))
    throw new Error(`${label} does not match its trigger positions.`);
}

function validateScene(scene: SceneMatrix, label: string): SceneMatrix {
  if (!Array.isArray(scene) || scene.length === 0)
    throw new Error(`${label} must contain columns.`);
  const rows = scene[0]?.length ?? 0;
  if (rows === 0) throw new Error(`${label} must contain rows.`);
  for (const [x, column] of scene.entries()) {
    if (column.length !== rows)
      throw new Error(`${label} column[${x}] has inconsistent rows.`);
    for (const [y, code] of column.entries())
      if (!Number.isSafeInteger(code) || code < 0)
        throw new Error(`${label}[${x}][${y}] has invalid symbol code.`);
  }
  return scene;
}

function assertDimensions(
  actual: readonly (readonly unknown[])[],
  expected: readonly (readonly unknown[])[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((column, x) => column.length !== expected[x]!.length)
  )
    throw new Error(`${label} dimensions do not match the scene.`);
}

function assertMatrixEqual(
  actual: readonly (readonly unknown[])[],
  expected: readonly (readonly unknown[])[],
  label: string,
): void {
  assertDimensions(actual, expected, label);
  forEachCell(expected, (x, y, value) => {
    if (actual[x]![y] !== value)
      throw new Error(
        `${label}[${x}][${y}] differs: actual=${String(actual[x]![y])}; expected=${String(value)}.`,
      );
  });
}

function forEachCell<T>(
  matrix: readonly (readonly T[])[],
  visit: (x: number, y: number, value: T) => void,
): void {
  matrix.forEach((column, x) =>
    column.forEach((value, y) => visit(x, y, value)),
  );
}

function mutableScene(scene: SceneMatrix): number[][] {
  return scene.map((column) => [...column]);
}

function componentNumber(
  step: GameLogicStep,
  name: string,
  field: string,
  stepIndex: number,
): unknown {
  const component = step.getComponent(name);
  if (component && isRecord(component.raw)) return component.raw[field];
  const clientData = step.getRawClientData();
  const gameParam =
    isRecord(clientData) && isRecord(clientData.curGameModParam)
      ? clientData.curGameModParam
      : null;
  const mapComponents =
    gameParam && isRecord(gameParam.mapComponents)
      ? gameParam.mapComponents
      : null;
  const raw =
    mapComponents && isRecord(mapComponents[name]) ? mapComponents[name] : null;
  if (!raw) throw new Error(`step[${stepIndex}] ${name} is missing.`);
  return raw[field];
}

function positiveInteger(value: unknown, label: string): number {
  const result = nonNegativeInteger(value, label);
  if (result === 0) throw new Error(`${label} must be positive.`);
  return result;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative safe integer.`);
  return value;
}

function isEightNeighbor(
  center: SlotRoundPosition,
  candidate: SlotRoundPosition,
): boolean {
  const dx = Math.abs(center.x - candidate.x);
  const dy = Math.abs(center.y - candidate.y);
  return dx <= 1 && dy <= 1 && dx + dy > 0;
}

function positionKey(position: SlotRoundPosition): string {
  return `${position.x},${position.y}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function currentSnapshotScene(scene: SceneMatrix): SceneMatrix {
  return Object.freeze(scene.map((column) => Object.freeze([...column])));
}

function currentSnapshotValues(
  values: Game002FreeGameValueMatrix,
): Game002FreeGameValueMatrix {
  return Object.freeze(values.map((column) => Object.freeze([...column])));
}
