import type {
  GameLogicStep,
  OtherSceneMatrix,
  SceneMatrix,
  SlotRoundSettledCompileContext,
  SlotRoundSettledSceneCompileContext,
  SlotRoundSettledTransformChangeDraft,
  SlotRoundSettledValueDraft,
  SlotRoundPosition,
} from "@slotclientengine/gameframeworks";
import { GAME002_CASCADE_COMPONENTS } from "./cascade-config.js";

export interface Game002WlWmMultiplierCompiler {
  resolveSettledScene(
    context: SlotRoundSettledSceneCompileContext,
  ): SceneMatrix;
  hydrateSettledValues(
    context: SlotRoundSettledCompileContext,
  ): readonly SlotRoundSettledValueDraft[];
  compileSettledTransform(
    context: SlotRoundSettledCompileContext,
  ): readonly SlotRoundSettledTransformChangeDraft[];
  getPresentationBatch(
    stepIndex: number,
  ): Game002WlWmMultiplierPresentationBatch | undefined;
  assertComplete(): void;
}

export interface Game002WlIncrementPresentation {
  readonly position: SlotRoundPosition;
  readonly inputValue: number;
  readonly outputValue: number;
}

export interface Game002WlWmMultiplierPresentationBatch {
  readonly stepIndex: number;
  readonly wlIncrements: readonly Game002WlIncrementPresentation[];
  readonly wmReplacements: readonly Game002WmReplacementPresentation[];
  readonly cnUpdates: readonly Game002CnValueUpdatePresentation[];
  readonly cm: Game002CmPresentation | null;
}

export interface Game002WmReplacementPresentation {
  readonly position: SlotRoundPosition;
  readonly intermediateValue: number;
  readonly outputValue: number;
}

export interface Game002CnValueUpdatePresentation {
  readonly position: SlotRoundPosition;
  readonly inputValue: number;
  readonly outputValue: number;
}

export interface Game002CmPresentation {
  readonly position: SlotRoundPosition;
  readonly multiplier: number;
  readonly outputValue: number;
}

export function createGame002WlWmMultiplierCompiler(options: {
  readonly wlSymbolCode: number;
  readonly wmSymbolCode: number;
  readonly cnSymbolCode: number;
  readonly cmSymbolCode: number;
}): Game002WlWmMultiplierCompiler {
  const wlCode = assertCode(options.wlSymbolCode, "WL");
  const wmCode = assertCode(options.wmSymbolCode, "WM");
  const cnCode = assertCode(options.cnSymbolCode, "CN");
  const cmCode = assertCode(options.cmSymbolCode, "CM");
  if (new Set([wlCode, wmCode, cnCode, cmCode]).size !== 4) {
    throw new Error("game002 WL, WM, CN and CM symbol codes must be distinct.");
  }
  let pendingWlIncrements: Game002WlIncrementPresentation[] = [];
  const presentationBatches = new Map<
    number,
    Game002WlWmMultiplierPresentationBatch
  >();

  return Object.freeze({
    resolveSettledScene(context: SlotRoundSettledSceneCompileContext) {
      const generatedWm = context.step.hasComponent(
        GAME002_CASCADE_COMPONENTS.genwm,
      )
        ? readComponentScene({
            step: context.step,
            componentName: GAME002_CASCADE_COMPONENTS.genwm,
            label: `step[${context.stepIndex}] bg-genwm`,
            scene: context.inputScene,
          })
        : context.inputScene;
      return context.step.hasComponent(GAME002_CASCADE_COMPONENTS.gencm)
        ? readComponentScene({
            step: context.step,
            componentName: GAME002_CASCADE_COMPONENTS.gencm,
            label: `step[${context.stepIndex}] bg-gencm`,
            scene: context.inputScene,
          })
        : generatedWm;
    },

    hydrateSettledValues(context: SlotRoundSettledCompileContext) {
      const unresolvedWl = context.input.occurrences.filter(
        (occurrence) => occurrence.code === wlCode && occurrence.value === null,
      );
      const wm = context.input.occurrences.filter(
        (occurrence) => occurrence.code === wmCode,
      );
      const cm = context.input.occurrences.filter(
        (occurrence) => occurrence.code === cmCode,
      );
      if (cm.length > 1)
        throw new Error(
          `step[${context.stepIndex}] settled scene must contain at most one CM; received ${cm.length}.`,
        );
      if (cm.length === 1) {
        if (!context.step.hasComponent(GAME002_CASCADE_COMPONENTS.gencm))
          throw new Error(`step[${context.stepIndex}] CM requires bg-gencm.`);
      } else {
        assertComponentsAbsent(
          context.step,
          context.stepIndex,
          [GAME002_CASCADE_COMPONENTS.gencm, GAME002_CASCADE_COMPONENTS.setcm],
          "CM",
        );
      }
      const drafts: SlotRoundSettledValueDraft[] = [];
      const wlValues = readComponentOtherScene({
        step: context.step,
        componentName: GAME002_CASCADE_COMPONENTS.genwilds,
        required: unresolvedWl.length > 0,
        label: `step[${context.stepIndex}] bg-genwilds`,
        scene: context.input.scene,
        validateAllValues: false,
      });
      const wmValues = readComponentOtherScene({
        step: context.step,
        componentName: GAME002_CASCADE_COMPONENTS.setwm,
        required: wm.length > 0,
        label: `step[${context.stepIndex}] bg-setwm`,
        scene: context.input.scene,
        validateAllValues: false,
      });
      const cmValues = readComponentOtherScene({
        step: context.step,
        componentName: GAME002_CASCADE_COMPONENTS.setcm,
        required: cm.length === 1,
        label: `step[${context.stepIndex}] bg-setcm`,
        scene: context.input.scene,
        validateAllValues: false,
      });
      forEachCell(context.input.scene, (x, y, code) => {
        const current = context.input.values[x][y];
        const wlRaw = wlValues?.[x][y] ?? 0;
        const wmRaw = wmValues?.[x][y] ?? 0;
        const cmRaw = cmValues?.[x][y] ?? 0;
        if (code === wlCode && current === null) {
          drafts.push(
            Object.freeze({
              position: Object.freeze({ x, y }),
              value: assertPositiveMultiplier(
                wlRaw,
                `step[${context.stepIndex}] bg-genwilds[${x}][${y}]`,
              ),
            }),
          );
        }
        if (code === wmCode) {
          if (current !== null) {
            throw new Error(
              `step[${context.stepIndex}] WM (${x},${y}) must not carry an existing multiplier.`,
            );
          }
          drafts.push(
            Object.freeze({
              position: Object.freeze({ x, y }),
              value: assertPositiveMultiplier(
                wmRaw,
                `step[${context.stepIndex}] bg-setwm[${x}][${y}]`,
              ),
            }),
          );
        }
        if (code === cmCode) {
          if (current !== null) {
            throw new Error(
              `step[${context.stepIndex}] CM (${x},${y}) must not carry an existing multiplier.`,
            );
          }
          drafts.push(
            Object.freeze({
              position: Object.freeze({ x, y }),
              value: assertPositiveMultiplier(
                cmRaw,
                `step[${context.stepIndex}] bg-setcm[${x}][${y}]`,
              ),
            }),
          );
        }
      });
      return Object.freeze(drafts);
    },

    compileSettledTransform(context: SlotRoundSettledCompileContext) {
      const incomingWlIncrements = pendingWlIncrements;
      pendingWlIncrements = [];
      for (const increment of incomingWlIncrements) {
        const code =
          context.input.scene[increment.position.x]?.[increment.position.y];
        const value =
          context.input.values[increment.position.x]?.[increment.position.y];
        if (code !== wlCode || value !== increment.inputValue) {
          throw new Error(
            `step[${context.stepIndex}] carried WL (${increment.position.x},${increment.position.y}) does not match pending bg-incwl input ${increment.inputValue}.`,
          );
        }
      }
      const winningWlPositions = readWinningWlPositions({
        context,
        wlCode,
      });
      pendingWlIncrements = parsePendingWlIncrements({
        context,
        wlCode,
        winningWlPositions,
      });
      const wm = context.input.occurrences.filter(
        (occurrence) => occurrence.code === wmCode,
      );
      const cm = context.input.occurrences.filter(
        (occurrence) => occurrence.code === cmCode,
      );
      if (cm.length > 1)
        throw new Error(
          `step[${context.stepIndex}] settled scene must contain at most one CM; received ${cm.length}.`,
        );
      const intermediateValues = new Map(
        incomingWlIncrements.map((increment) => [
          positionKey(increment.position),
          increment.outputValue,
        ]),
      );
      const draftByPosition = new Map<
        string,
        SlotRoundSettledTransformChangeDraft
      >();
      const wmReplacementDrafts: Array<{
        readonly position: SlotRoundPosition;
        readonly intermediateValue: number;
        outputValue: number;
      }> = [];
      let intermediateScene = context.input.scene;
      if (wm.length === 0) {
        assertComponentsAbsent(context.step, context.stepIndex, [
          GAME002_CASCADE_COMPONENTS.updwl,
          GAME002_CASCADE_COMPONENTS.wm2cn,
          GAME002_CASCADE_COMPONENTS.genwmcn,
        ]);
        for (const increment of incomingWlIncrements)
          draftByPosition.set(
            positionKey(increment.position),
            Object.freeze({
              position: increment.position,
              outputCode: wlCode,
              outputValue: increment.outputValue,
            }),
          );
      } else {
        let wmTotal = 0;
        for (const occurrence of wm) {
          wmTotal = addSafe(
            wmTotal,
            assertPositiveMultiplier(
              occurrence.value,
              `step[${context.stepIndex}] WM (${occurrence.position.x},${occurrence.position.y}) multiplier`,
            ),
            `step[${context.stepIndex}] WM multiplier total`,
          );
        }
        const updatedWl = readComponentOtherScene({
          step: context.step,
          componentName: GAME002_CASCADE_COMPONENTS.updwl,
          required: context.input.occurrences.some(
            (occurrence) => occurrence.code === wlCode,
          ),
          label: `step[${context.stepIndex}] bg-updwl`,
          scene: context.input.scene,
          validateAllValues: false,
        });
        const wm2cn = readComponentScene({
          step: context.step,
          componentName: GAME002_CASCADE_COMPONENTS.wm2cn,
          label: `step[${context.stepIndex}] bg-wm2cn`,
          scene: context.input.scene,
        });
        const generatedCn = readComponentOtherScene({
          step: context.step,
          componentName: GAME002_CASCADE_COMPONENTS.genwmcn,
          required: true,
          label: `step[${context.stepIndex}] bg-genwmcn`,
          scene: context.input.scene,
          validateAllValues: false,
        })!;
        forEachCell(context.input.scene, (x, y, code) => {
          const position = Object.freeze({ x, y });
          const key = positionKey(position);
          const wlRaw = updatedWl?.[x][y] ?? 0;
          if (code === wlCode) {
            const current = assertPositiveMultiplier(
              intermediateValues.get(key) ?? context.input.values[x][y],
              `step[${context.stepIndex}] WL (${x},${y}) multiplier`,
            );
            const expected = addSafe(
              current,
              wmTotal,
              `step[${context.stepIndex}] WL (${x},${y}) multiplier`,
            );
            if (wlRaw !== expected) {
              throw new Error(
                `step[${context.stepIndex}] bg-updwl[${x}][${y}] must be ${expected}, received ${wlRaw}.`,
              );
            }
            intermediateValues.set(key, expected);
            draftByPosition.set(
              key,
              Object.freeze({
                position,
                outputCode: wlCode,
                outputValue: expected,
              }),
            );
          }

          if (code === wmCode) {
            if (wm2cn[x][y] !== cnCode) {
              throw new Error(
                `step[${context.stepIndex}] bg-wm2cn[${x}][${y}] must convert WM to CN code ${cnCode}.`,
              );
            }
            const generatedValue = assertPositiveMultiplier(
              generatedCn[x][y],
              `step[${context.stepIndex}] bg-genwmcn[${x}][${y}]`,
            );
            intermediateValues.set(key, generatedValue);
            wmReplacementDrafts.push({
              position,
              intermediateValue: generatedValue,
              outputValue: generatedValue,
            });
            draftByPosition.set(
              key,
              Object.freeze({
                position,
                outputCode: cnCode,
                outputValue: generatedValue,
              }),
            );
          } else if (wm2cn[x][y] !== code) {
            throw new Error(
              `step[${context.stepIndex}] bg-wm2cn changed non-WM occurrence (${x},${y}).`,
            );
          }
        });
        intermediateScene = wm2cn;
      }

      const cnUpdates: Game002CnValueUpdatePresentation[] = [];
      let cmPresentation: Game002CmPresentation | null = null;
      if (cm.length === 0) {
        assertComponentsAbsent(
          context.step,
          context.stepIndex,
          [
            GAME002_CASCADE_COMPONENTS.updcn,
            GAME002_CASCADE_COMPONENTS.cm2cn,
            GAME002_CASCADE_COMPONENTS.gencmcn,
          ],
          "CM",
        );
      } else {
        const multiplier = assertPositiveMultiplier(
          cm[0]!.value,
          `step[${context.stepIndex}] CM (${cm[0]!.position.x},${cm[0]!.position.y}) multiplier`,
        );
        const intermediateCnPositions = intermediateScene.flatMap((column, x) =>
          column.flatMap((code, y) =>
            code === cnCode ? [Object.freeze({ x, y })] : [],
          ),
        );
        const updatedCn = readComponentOtherScene({
          step: context.step,
          componentName: GAME002_CASCADE_COMPONENTS.updcn,
          required: intermediateCnPositions.length > 0,
          label: `step[${context.stepIndex}] bg-updcn`,
          scene: intermediateScene,
          validateAllValues: false,
        });
        const cm2cn = readComponentScene({
          step: context.step,
          componentName: GAME002_CASCADE_COMPONENTS.cm2cn,
          label: `step[${context.stepIndex}] bg-cm2cn`,
          scene: intermediateScene,
        });
        const generatedCmCn = readComponentOtherScene({
          step: context.step,
          componentName: GAME002_CASCADE_COMPONENTS.gencmcn,
          required: true,
          label: `step[${context.stepIndex}] bg-gencmcn`,
          scene: intermediateScene,
          validateAllValues: false,
        })!;
        forEachCell(intermediateScene, (x, y, code) => {
          const position = Object.freeze({ x, y });
          const key = positionKey(position);
          if (code === cnCode) {
            const inputValue = assertPositiveMultiplier(
              intermediateValues.get(key) ?? context.input.values[x][y],
              `step[${context.stepIndex}] CN (${x},${y}) value`,
            );
            const outputValue = multiplySafe(
              inputValue,
              multiplier,
              `step[${context.stepIndex}] CN (${x},${y}) multiplied value`,
            );
            const raw = updatedCn?.[x][y];
            if (raw !== outputValue) {
              throw new Error(
                `step[${context.stepIndex}] bg-updcn[${x}][${y}] must be ${outputValue}, received ${String(raw)}.`,
              );
            }
            cnUpdates.push(
              Object.freeze({ position, inputValue, outputValue }),
            );
            const existing = draftByPosition.get(key);
            if (existing || outputValue !== context.input.values[x][y]) {
              draftByPosition.set(
                key,
                Object.freeze({
                  position,
                  outputCode: cnCode,
                  outputValue,
                }),
              );
            }
            const wmReplacement = wmReplacementDrafts.find(
              (replacement) => positionKey(replacement.position) === key,
            );
            if (wmReplacement) wmReplacement.outputValue = outputValue;
          }

          if (code === cmCode) {
            if (cm2cn[x][y] !== cnCode) {
              throw new Error(
                `step[${context.stepIndex}] bg-cm2cn[${x}][${y}] must convert CM to CN code ${cnCode}.`,
              );
            }
            const outputValue = assertPositiveMultiplier(
              generatedCmCn[x][y],
              `step[${context.stepIndex}] bg-gencmcn[${x}][${y}]`,
            );
            cmPresentation = Object.freeze({
              position,
              multiplier,
              outputValue,
            });
            draftByPosition.set(
              key,
              Object.freeze({
                position,
                outputCode: cnCode,
                outputValue,
              }),
            );
          } else if (cm2cn[x][y] !== code) {
            throw new Error(
              `step[${context.stepIndex}] bg-cm2cn changed non-CM occurrence (${x},${y}).`,
            );
          }
        });
        if (!cmPresentation)
          throw new Error(
            `step[${context.stepIndex}] CM presentation position is missing.`,
          );
      }

      const drafts = context.input.scene.flatMap((column, x) =>
        column.flatMap((_code, y) => {
          const draft = draftByPosition.get(`${x},${y}`);
          return draft ? [draft] : [];
        }),
      );
      if (
        drafts.length === 0 &&
        incomingWlIncrements.length === 0 &&
        wm.length === 0 &&
        cm.length === 0
      )
        return Object.freeze([]);
      presentationBatches.set(
        context.stepIndex,
        Object.freeze({
          stepIndex: context.stepIndex,
          wlIncrements: Object.freeze(incomingWlIncrements),
          wmReplacements: Object.freeze(
            wmReplacementDrafts.map((replacement) =>
              Object.freeze({ ...replacement }),
            ),
          ),
          cnUpdates: Object.freeze(cnUpdates),
          cm: cmPresentation,
        }),
      );
      return Object.freeze(drafts);
    },

    getPresentationBatch(stepIndex: number) {
      return presentationBatches.get(stepIndex);
    },

    assertComplete() {
      if (pendingWlIncrements.length > 0)
        throw new Error(
          "game002 terminal round leaves bg-incwl without a following settled refill.",
        );
    },
  });
}

function parsePendingWlIncrements(options: {
  readonly context: SlotRoundSettledCompileContext;
  readonly wlCode: number;
  readonly winningWlPositions: ReadonlySet<string>;
}): Game002WlIncrementPresentation[] {
  const { context } = options;
  if (!context.step.hasComponent(GAME002_CASCADE_COMPONENTS.incwl)) {
    if (options.winningWlPositions.size > 0)
      throw new Error(
        `step[${context.stepIndex}] bg-incwl is required when WL participates in bg-win.`,
      );
    return [];
  }
  if (!context.step.hasComponent(GAME002_CASCADE_COMPONENTS.win))
    throw new Error(
      `step[${context.stepIndex}] bg-incwl requires bg-win in the same server step.`,
    );
  const values = readComponentOtherScene({
    step: context.step,
    componentName: GAME002_CASCADE_COMPONENTS.incwl,
    required: true,
    label: `step[${context.stepIndex}] bg-incwl`,
    scene: context.input.scene,
    validateAllValues: false,
  })!;
  const increments: Game002WlIncrementPresentation[] = [];
  forEachCell(context.input.scene, (x, y, code) => {
    if (code !== options.wlCode) return;
    if (!options.winningWlPositions.has(`${x},${y}`)) return;
    const raw = values[x][y];
    const inputValue = assertPositiveMultiplier(
      context.input.values[x][y],
      `step[${context.stepIndex}] WL (${x},${y}) multiplier`,
    );
    const outputValue = addSafe(
      inputValue,
      1,
      `step[${context.stepIndex}] bg-incwl[${x}][${y}]`,
    );
    if (raw !== outputValue)
      throw new Error(
        `step[${context.stepIndex}] bg-incwl[${x}][${y}] must be ${outputValue}, received ${raw}.`,
      );
    increments.push(
      Object.freeze({
        position: Object.freeze({ x, y }),
        inputValue,
        outputValue,
      }),
    );
  });
  if (increments.length === 0)
    throw new Error(
      `step[${context.stepIndex}] bg-incwl must increment at least one WL.`,
    );
  if (increments.length !== options.winningWlPositions.size)
    throw new Error(
      `step[${context.stepIndex}] bg-incwl must increment every WL that participates in bg-win.`,
    );
  return increments;
}

function readWinningWlPositions(options: {
  readonly context: SlotRoundSettledCompileContext;
  readonly wlCode: number;
}): ReadonlySet<string> {
  if (!options.context.step.hasComponent(GAME002_CASCADE_COMPONENTS.win))
    return new Set();
  const positions = new Set<string>();
  for (const [resultIndex, result] of options.context.step
    .getComponentResults(GAME002_CASCADE_COMPONENTS.win)
    .entries()) {
    if (result.pos.length === 0 || result.pos.length % 2 !== 0)
      throw new Error(
        `step[${options.context.stepIndex}] bg-win result[${resultIndex}].pos must contain non-empty x/y pairs.`,
      );
    for (let index = 0; index < result.pos.length; index += 2) {
      const x = result.pos[index];
      const y = result.pos[index + 1];
      if (
        !Number.isSafeInteger(x) ||
        !Number.isSafeInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= options.context.input.scene.length ||
        y >= (options.context.input.scene[x]?.length ?? 0)
      )
        throw new Error(
          `step[${options.context.stepIndex}] bg-win result[${resultIndex}] coordinate (${String(x)},${String(y)}) is invalid.`,
        );
      if (options.context.input.scene[x][y] === options.wlCode)
        positions.add(`${x},${y}`);
    }
  }
  return positions;
}

function readComponentOtherScene(options: {
  readonly step: GameLogicStep;
  readonly componentName: string;
  readonly required: boolean;
  readonly label: string;
  readonly scene: SceneMatrix;
  readonly validateAllValues?: boolean;
}): OtherSceneMatrix | undefined {
  const present = options.step.hasComponent(options.componentName);
  const scenes = options.step.getComponentOtherScenes(options.componentName);
  if (!present) {
    if (scenes.length > 0)
      throw new Error(`${options.label} otherScene exists without component.`);
    if (options.required)
      throw new Error(`${options.label} component is required.`);
    return undefined;
  }
  if (scenes.length !== 1) {
    throw new Error(`${options.label} must use exactly one otherScene.`);
  }
  assertMatrixShape(
    scenes[0],
    options.scene,
    `${options.label} otherScene`,
    options.validateAllValues ?? true,
  );
  return scenes[0];
}

function readComponentScene(options: {
  readonly step: GameLogicStep;
  readonly componentName: string;
  readonly label: string;
  readonly scene: SceneMatrix;
}): SceneMatrix {
  if (!options.step.hasComponent(options.componentName)) {
    throw new Error(`${options.label} component is required.`);
  }
  const scenes = options.step.getComponentScenes(options.componentName);
  if (scenes.length !== 1)
    throw new Error(`${options.label} must use exactly one scene.`);
  assertMatrixShape(scenes[0], options.scene, `${options.label} scene`);
  return scenes[0];
}

function assertComponentsAbsent(
  step: GameLogicStep,
  stepIndex: number,
  names: readonly string[],
  subject = "WM",
): void {
  for (const name of names) {
    if (step.hasComponent(name)) {
      throw new Error(
        `step[${stepIndex}] must not trigger ${name} without ${subject} occurrences.`,
      );
    }
  }
}

function assertMatrixShape(
  matrix: readonly (readonly number[])[],
  scene: SceneMatrix,
  label: string,
  validateAllValues = true,
): void {
  if (matrix.length !== scene.length)
    throw new Error(`${label} width must be ${scene.length}.`);
  matrix.forEach((column, x) => {
    if (column.length !== scene[x].length)
      throw new Error(`${label}[${x}] height must be ${scene[x].length}.`);
    if (!validateAllValues) return;
    column.forEach((value, y) => {
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${label}[${x}][${y}] must be non-negative.`);
    });
  });
}

function forEachCell(
  scene: SceneMatrix,
  callback: (x: number, y: number, code: number) => void,
): void {
  scene.forEach((column, x) =>
    column.forEach((code, y) => callback(x, y, code)),
  );
}

function positionKey(position: SlotRoundPosition): string {
  return `${position.x},${position.y}`;
}

function assertPositiveMultiplier(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    throw new Error(`${label} must be a positive safe integer.`);
  return value as number;
}

function assertCode(value: number, symbol: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`game002 ${symbol} symbol code is invalid.`);
  return value;
}

function addSafe(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result))
    throw new Error(`${label} exceeds the safe integer range.`);
  return result;
}

function multiplySafe(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result))
    throw new Error(`${label} exceeds the safe integer range.`);
  return result;
}
