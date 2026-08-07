import type {
  GameLogicStep,
  OtherSceneMatrix,
  SceneMatrix,
  SlotRoundSettledCompileContext,
  SlotRoundSettledSceneCompileContext,
  SlotRoundSettledTransformChangeDraft,
  SlotRoundSettledTransformDraft,
  SlotRoundSettledValueDraft,
  SlotRoundPosition,
} from "@slotclientengine/gameframeworks";
import {
  assertExactMatrixEqual as assertSceneEqual,
  assertExactMatrixShape,
  forEachMatrixCell as forEachCell,
  parseExactPositionPairs,
  requireSafeInteger,
  slotOperationPositionKey as positionKey,
} from "@slotclientengine/gameframeworks";
import { GAME002_CASCADE_COMPONENTS } from "./cascade-config.js";
import {
  compileGame002CoCollectionPlan,
  type Game002CoCollectionPlan,
} from "./co-collection-plan.js";

export interface Game002WlWmMultiplierCompiler {
  resolveSettledScene(
    context: SlotRoundSettledSceneCompileContext,
  ): SceneMatrix;
  hydrateSettledValues(
    context: SlotRoundSettledCompileContext,
  ): readonly SlotRoundSettledValueDraft[];
  compileSettledTransform(
    context: SlotRoundSettledCompileContext,
  ): Game002SettledTransformCompilation;
  assertComplete(): void;
}

export interface Game002SettledTransformCompilation {
  readonly draft:
    | readonly SlotRoundSettledTransformChangeDraft[]
    | SlotRoundSettledTransformDraft;
  readonly payload: Game002TransformOperationPayload | null;
}

export interface Game002WlIncrementPresentation {
  readonly position: SlotRoundPosition;
  readonly inputValue: number;
  readonly outputValue: number;
}

interface Game002PendingWlIncrement extends Game002WlIncrementPresentation {
  readonly sourceStepIndex: number;
  readonly sourceWinResultPositions: string;
  readonly occurrenceId: string;
  readonly code: number;
  readonly symbol: string;
}

export interface Game002TransformOperationPayload {
  readonly stepIndex: number;
  readonly wlIncrements: readonly Game002WlIncrementPresentation[];
  readonly wmReplacements: readonly Game002WmReplacementPresentation[];
  readonly cnUpdates: readonly Game002CnValueUpdatePresentation[];
  readonly cm: Game002CmPresentation | null;
  readonly coCollection?: Game002CoCollectionPlan | null;
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
  readonly coSymbolCode?: number;
  readonly bnSymbolCode?: number;
  readonly logDiagnostic?: (message: string) => void;
}): Game002WlWmMultiplierCompiler {
  const wlCode = assertCode(options.wlSymbolCode, "WL");
  const wmCode = assertCode(options.wmSymbolCode, "WM");
  const cnCode = assertCode(options.cnSymbolCode, "CN");
  const cmCode = assertCode(options.cmSymbolCode, "CM");
  const coCode =
    options.coSymbolCode === undefined
      ? undefined
      : assertCode(options.coSymbolCode, "CO");
  const bnCode =
    options.bnSymbolCode === undefined
      ? undefined
      : assertCode(options.bnSymbolCode, "BN");
  if (
    new Set([
      wlCode,
      wmCode,
      cnCode,
      cmCode,
      ...(coCode === undefined ? [] : [coCode]),
      ...(bnCode === undefined ? [] : [bnCode]),
    ]).size !==
    4 + (coCode === undefined ? 0 : 1) + (bnCode === undefined ? 0 : 1)
  ) {
    throw new Error(
      "game002 WL, WM, CN, CM and configured CO/BN symbol codes must be distinct.",
    );
  }
  let pendingWlIncrements: Game002PendingWlIncrement[] = [];
  const logDiagnostic = options.logDiagnostic ?? (() => undefined);

  return Object.freeze({
    resolveSettledScene(context: SlotRoundSettledSceneCompileContext) {
      const hasGeneratedWm = context.step.hasComponent(
        GAME002_CASCADE_COMPONENTS.genwm,
      );
      const hasGeneratedCm = context.step.hasComponent(
        GAME002_CASCADE_COMPONENTS.gencm,
      );
      const generatedWm = hasGeneratedWm
        ? readComponentScene({
            step: context.step,
            componentName: GAME002_CASCADE_COMPONENTS.genwm,
            label: `step[${context.stepIndex}] bg-genwm`,
            scene: context.inputScene,
          })
        : context.inputScene;
      const generatedCm = hasGeneratedCm
        ? readComponentScene({
            step: context.step,
            componentName: GAME002_CASCADE_COMPONENTS.gencm,
            label: `step[${context.stepIndex}] bg-gencm`,
            scene: context.inputScene,
          })
        : generatedWm;
      const multiplierSettledScene =
        hasGeneratedWm && hasGeneratedCm
          ? composeWmThenCmSettledScene({
              stepIndex: context.stepIndex,
              generatedWm,
              generatedCm,
              wmCode,
              cnCode,
              cmCode,
            })
          : generatedCm;
      const settledScene = context.step.hasComponent(
        GAME002_CASCADE_COMPONENTS.genco,
      )
        ? overlayGeneratedCo({
            step: context.step,
            stepIndex: context.stepIndex,
            input: multiplierSettledScene,
            coCode: requireConfiguredCode(coCode, "CO", context.stepIndex),
          })
        : multiplierSettledScene;
      const source =
        hasGeneratedWm && hasGeneratedCm
          ? "bg-genwm+bg-gencm(staged)"
          : hasGeneratedCm
            ? "bg-gencm"
            : hasGeneratedWm
              ? "bg-genwm"
              : context.kind === "spin"
                ? "bg-spin"
                : "bg-refill";
      logDiagnostic(
        `settled step[${context.stepIndex}] kind=${context.kind} source=${source}; flow=CO-settled->WM->CM->CO-collect; bg-genwm=${hasGeneratedWm ? "present" : "missing"}; bg-gencm=${hasGeneratedCm ? "present" : "missing"}; bg-genco=${context.step.hasComponent(GAME002_CASCADE_COMPONENTS.genco) ? "present(settled)" : "missing"}`,
      );
      return settledScene;
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
      const incomingWlIncrements = resolveIncomingWlIncrements({
        context,
        wlCode,
        pending: pendingWlIncrements,
      });
      pendingWlIncrements = [];
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
        const wmStageScene = context.step.hasComponent(
          GAME002_CASCADE_COMPONENTS.genwm,
        )
          ? readComponentScene({
              step: context.step,
              componentName: GAME002_CASCADE_COMPONENTS.genwm,
              label: `step[${context.stepIndex}] bg-genwm`,
              scene: context.input.scene,
            })
          : context.input.scene;
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
          scene: wmStageScene,
        });
        const generatedCn = readComponentOtherScene({
          step: context.step,
          componentName: GAME002_CASCADE_COMPONENTS.genwmcn,
          required: true,
          label: `step[${context.stepIndex}] bg-genwmcn`,
          scene: context.input.scene,
          validateAllValues: false,
        })!;
        forEachCell(wmStageScene, (x, y, code) => {
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
                `step[${context.stepIndex}] bg-updwl[${x}][${y}] differs: actual(server)=${wlRaw}; expected(compiled)=${expected} (input WL=${current} + WM total=${wmTotal}).`,
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
          } else if (code !== coCode && wm2cn[x][y] !== code) {
            throw new Error(
              `step[${context.stepIndex}] bg-wm2cn changed non-WM occurrence (${x},${y}): actual(server) code=${wm2cn[x][y]}; expected(compiled) unchanged code=${code}.`,
            );
          }
        });
        intermediateScene = context.step.hasComponent(
          GAME002_CASCADE_COMPONENTS.gencm,
        )
          ? readAndValidateGeneratedCmStage({
              step: context.step,
              stepIndex: context.stepIndex,
              wmOutputScene: wm2cn,
              cmCode,
            })
          : wm2cn;
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
                `step[${context.stepIndex}] bg-updcn[${x}][${y}] differs: actual(server)=${String(raw)}; expected(compiled)=${outputValue} (input CN=${inputValue} * CM=${multiplier}).`,
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
          } else if (code !== coCode && cm2cn[x][y] !== code) {
            throw new Error(
              `step[${context.stepIndex}] bg-cm2cn changed non-CM occurrence (${x},${y}): actual(server) code=${cm2cn[x][y]}; expected(compiled) unchanged code=${code}.`,
            );
          }
        });
        if (!cmPresentation)
          throw new Error(
            `step[${context.stepIndex}] CM presentation position is missing.`,
          );
        intermediateScene = cm2cn;
      }

      let generatedCoScene: SceneMatrix | null = null;
      if (context.step.hasComponent(GAME002_CASCADE_COMPONENTS.genco)) {
        generatedCoScene = readComponentScene({
          step: context.step,
          componentName: GAME002_CASCADE_COMPONENTS.genco,
          label: `step[${context.stepIndex}] bg-genco`,
          scene: intermediateScene,
        });
        forEachCell(intermediateScene, (x, y, code) => {
          const settledCode = context.input.scene[x][y];
          const outputCode = generatedCoScene![x][y];
          if (settledCode === coCode) {
            if (outputCode !== coCode)
              throw new Error(
                `step[${context.stepIndex}] settled CO (${x},${y}) is missing from bg-genco final scene.`,
              );
            return;
          }
          if (outputCode !== code)
            throw new Error(
              `step[${context.stepIndex}] bg-genco final scene differs at (${x},${y}): actual(server)=${outputCode}; expected multiplier output code=${code}.`,
            );
        });
      }

      const intermediateOutputScene = intermediateScene.map((column, x) =>
        Object.freeze(
          column.map((_code, y) =>
            context.input.scene[x][y] === coCode
              ? coCode
              : intermediateScene[x][y],
          ),
        ),
      );
      const intermediateOutputValues = context.input.values.map((column, x) =>
        Object.freeze(
          column.map((value, y) => {
            const draft = draftByPosition.get(`${x},${y}`);
            return draft?.outputValue ?? value;
          }),
        ),
      );
      if (generatedCoScene)
        assertSceneEqual(
          generatedCoScene,
          intermediateOutputScene,
          `step[${context.stepIndex}] bg-genco final scene`,
        );
      const coCollection =
        coCode === undefined || bnCode === undefined
          ? null
          : compileGame002CoCollectionPlan({
              stepIndex: context.stepIndex,
              step: context.step,
              inputScene: intermediateOutputScene,
              inputValues: intermediateOutputValues,
              coSymbolCode: coCode,
              bnSymbolCode: bnCode,
              valueSymbolCodes: new Set([wlCode, cnCode]),
            });
      for (const change of coCollection?.transform.changes ?? [])
        draftByPosition.set(positionKey(change.position), change);
      const winningWlPositions = readWinningWlPositions({
        context,
        wlCode,
      });
      pendingWlIncrements = createPendingWlIncrements({
        context,
        wlCode,
        winningWlPositions,
        settledChanges: draftByPosition,
      });
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
        cm.length === 0 &&
        coCollection === null
      )
        return Object.freeze({
          draft: Object.freeze([]),
          payload: null,
        });
      const payload = Object.freeze({
        stepIndex: context.stepIndex,
        wlIncrements: Object.freeze(incomingWlIncrements),
        wmReplacements: Object.freeze(
          wmReplacementDrafts.map((replacement) =>
            Object.freeze({ ...replacement }),
          ),
        ),
        cnUpdates: Object.freeze(cnUpdates),
        cm: cmPresentation,
        ...(coCollection ? { coCollection } : {}),
      });
      if (!coCollection)
        return Object.freeze({
          draft: Object.freeze(drafts),
          payload,
        });
      return Object.freeze({
        draft: Object.freeze({
          changes: Object.freeze(drafts),
          relocations: coCollection.transform.relocations,
        }),
        payload,
      });
    },

    assertComplete() {
      if (pendingWlIncrements.length > 0)
        throw new Error(
          `game002 terminal round leaves winning WL without a following settled refill bg-incwl: pending=${formatPendingWlIncrements(pendingWlIncrements)}.`,
        );
    },
  });
}

function createPendingWlIncrements(options: {
  readonly context: SlotRoundSettledCompileContext;
  readonly wlCode: number;
  readonly winningWlPositions: ReadonlySet<string>;
  readonly settledChanges: ReadonlyMap<
    string,
    SlotRoundSettledTransformChangeDraft
  >;
}): Game002PendingWlIncrement[] {
  const { context } = options;
  const sourceWinResultPositions = formatBgWinResultPositions(context.step);
  return context.input.occurrences.flatMap((occurrence) => {
    if (occurrence.code !== options.wlCode) return [];
    if (!options.winningWlPositions.has(positionKey(occurrence.position)))
      return [];
    const settledChange = options.settledChanges.get(
      positionKey(occurrence.position),
    );
    if (settledChange && settledChange.outputCode !== options.wlCode)
      throw new Error(
        `step[${context.stepIndex}] winning WL (${occurrence.position.x},${occurrence.position.y}) changed to code ${settledChange.outputCode} before bg-win.`,
      );
    const inputValue = assertPositiveMultiplier(
      settledChange ? settledChange.outputValue : occurrence.value,
      `step[${context.stepIndex}] WL (${occurrence.position.x},${occurrence.position.y}) multiplier`,
    );
    return [
      Object.freeze({
        position: occurrence.position,
        inputValue,
        outputValue: addSafe(
          inputValue,
          1,
          `step[${context.stepIndex}] pending bg-incwl (${occurrence.position.x},${occurrence.position.y})`,
        ),
        sourceStepIndex: context.stepIndex,
        sourceWinResultPositions,
        occurrenceId: occurrence.id,
        code: occurrence.code,
        symbol: occurrence.symbol,
      }),
    ];
  });
}

function resolveIncomingWlIncrements(options: {
  readonly context: SlotRoundSettledCompileContext;
  readonly wlCode: number;
  readonly pending: readonly Game002PendingWlIncrement[];
}): Game002WlIncrementPresentation[] {
  const { context } = options;
  const declared = context.step.getComponent?.(
    GAME002_CASCADE_COMPONENTS.posincwl,
  );
  if (declared && isRecord(declared.raw)) {
    const selected = parseExactPositionPairs(
      declared.raw.pos,
      context.input.scene,
      `step[${context.stepIndex}] bg-pos-incwl.pos`,
    );
    const hasIncwl = context.step.hasComponent(
      GAME002_CASCADE_COMPONENTS.incwl,
    );
    if (selected.length === 0) {
      if (hasIncwl)
        throw new Error(
          `step[${context.stepIndex}] bg-incwl requires at least one bg-pos-incwl position.`,
        );
      return [];
    }
    if (!hasIncwl)
      throw new Error(
        `step[${context.stepIndex}] bg-pos-incwl requires bg-incwl.`,
      );
    const values = readComponentOtherScene({
      step: context.step,
      componentName: GAME002_CASCADE_COMPONENTS.incwl,
      required: true,
      label: `step[${context.stepIndex}] bg-incwl`,
      scene: context.input.scene,
      validateAllValues: false,
    })!;
    return selected.map((position) => {
      const { x, y } = position;
      const occurrence = context.input.occurrences.find(
        (candidate) => candidate.position.x === x && candidate.position.y === y,
      );
      if (occurrence?.code !== options.wlCode)
        throw new Error(
          `step[${context.stepIndex}] bg-pos-incwl position (${x},${y}) must select a settled WL.`,
        );
      const inputValue = assertPositiveMultiplier(
        occurrence.value,
        `step[${context.stepIndex}] WL (${x},${y}) multiplier`,
      );
      const outputValue = addSafe(
        inputValue,
        1,
        `step[${context.stepIndex}] bg-incwl (${x},${y})`,
      );
      if (values[x][y] !== outputValue)
        throw new Error(
          `step[${context.stepIndex}] bg-incwl[${x}][${y}] differs: actual(server)=${String(values[x][y])}; expected(compiled)=${outputValue} (input WL=${inputValue} + 1).`,
        );
      return Object.freeze({ position, inputValue, outputValue });
    });
  }
  const pending = options.pending;
  const hasIncwl = context.step.hasComponent(GAME002_CASCADE_COMPONENTS.incwl);
  if (pending.length === 0) {
    if (hasIncwl)
      throw new Error(
        `step[${context.stepIndex}] bg-incwl has no winning WL from the preceding step: actual(server) bg-incwl component=present; expected(compiled) no bg-incwl.`,
      );
    return [];
  }
  if (!hasIncwl)
    throw new Error(
      `step[${context.stepIndex}] bg-incwl is required for WL that participated in the preceding bg-win: actual(server) bg-incwl component=missing; pending winning WL occurrence(s)=${formatPendingWlIncrements(pending)}; expected(server) bg-incwl after dropdown and before refill with otherScene value=current multiplier+1.`,
    );
  const values = readComponentOtherScene({
    step: context.step,
    componentName: GAME002_CASCADE_COMPONENTS.incwl,
    required: true,
    label: `step[${context.stepIndex}] bg-incwl`,
    scene: context.input.scene,
    validateAllValues: false,
  })!;
  return pending.map((increment) => {
    const { x, y } = increment.position;
    const code = context.input.scene[x]?.[y];
    const value = context.input.values[x]?.[y];
    if (code !== options.wlCode || value !== increment.inputValue)
      throw new Error(
        `step[${context.stepIndex}] carried WL (${x},${y}) does not match preceding step[${increment.sourceStepIndex}] bg-win occurrence: actual(compiled refill) code=${String(code)}, value=${String(value)}; expected(pending) code=${options.wlCode}, value=${increment.inputValue}, id="${increment.occurrenceId}".`,
      );
    const raw = values[x][y];
    if (raw !== increment.outputValue)
      throw new Error(
        `step[${context.stepIndex}] bg-incwl[${x}][${y}] differs for preceding step[${increment.sourceStepIndex}] winning WL: actual(server)=${raw}; expected(compiled)=${increment.outputValue} (input WL=${increment.inputValue} + 1).`,
      );
    return Object.freeze({
      position: increment.position,
      inputValue: increment.inputValue,
      outputValue: increment.outputValue,
    });
  });
}

function formatPendingWlIncrements(
  pending: readonly Game002PendingWlIncrement[],
): string {
  return `[${pending
    .map(
      (increment) =>
        `(sourceStep=${increment.sourceStepIndex}, ${increment.position.x},${increment.position.y}, code=${increment.code}, symbol="${increment.symbol}", multiplier=${increment.inputValue}, id="${increment.occurrenceId}", bgWin=${increment.sourceWinResultPositions})`,
    )
    .join("; ")}]`;
}

function formatBgWinResultPositions(step: GameLogicStep): string {
  return `[${step
    .getComponentResults(GAME002_CASCADE_COMPONENTS.win)
    .map(
      (result, resultIndex) =>
        `result[${resultIndex}]=${JSON.stringify(result.pos)}`,
    )
    .join("; ")}]`;
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
    const selected = parseExactPositionPairs(
      result.pos,
      options.context.input.scene,
      `step[${options.context.stepIndex}] bg-win result[${resultIndex}].pos`,
      { nonEmpty: true },
    );
    for (const { x, y } of selected) {
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

function composeWmThenCmSettledScene(options: {
  readonly stepIndex: number;
  readonly generatedWm: SceneMatrix;
  readonly generatedCm: SceneMatrix;
  readonly wmCode: number;
  readonly cnCode: number;
  readonly cmCode: number;
}): SceneMatrix {
  assertMatrixShape(
    options.generatedCm,
    options.generatedWm,
    `step[${options.stepIndex}] bg-gencm scene`,
  );
  let cmCount = 0;
  const settledScene = Object.freeze(
    options.generatedWm.map((wmColumn, x) =>
      Object.freeze(
        wmColumn.map((wmStageCode, y) => {
          const cmStageCode = options.generatedCm[x][y];
          if (wmStageCode === options.wmCode) {
            if (cmStageCode !== options.cnCode) {
              throw new Error(
                `step[${options.stepIndex}] bg-gencm[${x}][${y}] must contain CN code ${options.cnCode} after WM code ${options.wmCode}: actual(server)=${cmStageCode}; flow=WM->CM->CO.`,
              );
            }
            return options.wmCode;
          }
          if (cmStageCode === options.cmCode) {
            cmCount += 1;
            return options.cmCode;
          }
          if (cmStageCode !== wmStageCode) {
            throw new Error(
              `step[${options.stepIndex}] bg-gencm changed non-WM occurrence (${x},${y}) without producing CM: actual(server)=${cmStageCode}; expected(compiled) unchanged code=${wmStageCode}; flow=WM->CM->CO.`,
            );
          }
          return cmStageCode;
        }),
      ),
    ),
  );
  if (cmCount !== 1) {
    throw new Error(
      `step[${options.stepIndex}] bg-gencm must produce exactly one CM after WM; actual(server) count=${cmCount}.`,
    );
  }
  return settledScene;
}

function readAndValidateGeneratedCmStage(options: {
  readonly step: GameLogicStep;
  readonly stepIndex: number;
  readonly wmOutputScene: SceneMatrix;
  readonly cmCode: number;
}): SceneMatrix {
  const generatedCm = readComponentScene({
    step: options.step,
    componentName: GAME002_CASCADE_COMPONENTS.gencm,
    label: `step[${options.stepIndex}] bg-gencm`,
    scene: options.wmOutputScene,
  });
  let cmCount = 0;
  forEachCell(options.wmOutputScene, (x, y, inputCode) => {
    const outputCode = generatedCm[x][y];
    if (outputCode === options.cmCode) {
      cmCount += 1;
      return;
    }
    if (outputCode !== inputCode) {
      throw new Error(
        `step[${options.stepIndex}] bg-gencm changed post-WM occurrence (${x},${y}) without producing CM: actual(server)=${outputCode}; expected(compiled) unchanged code=${inputCode}; flow=WM->CM->CO.`,
      );
    }
  });
  if (cmCount !== 1) {
    throw new Error(
      `step[${options.stepIndex}] bg-gencm must produce exactly one CM after WM; actual(server) count=${cmCount}.`,
    );
  }
  return generatedCm;
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
  assertExactMatrixShape(matrix, scene, label);
  if (validateAllValues)
    forEachCell(matrix, (x, y, value) =>
      requireSafeInteger(value, `${label}[${x}][${y}]`, { minimum: 0 }),
    );
}

function overlayGeneratedCo(options: {
  readonly step: GameLogicStep;
  readonly stepIndex: number;
  readonly input: SceneMatrix;
  readonly coCode: number;
}): SceneMatrix {
  const generated = readComponentScene({
    step: options.step,
    componentName: GAME002_CASCADE_COMPONENTS.genco,
    label: `step[${options.stepIndex}] bg-genco`,
    scene: options.input,
  });
  return Object.freeze(
    options.input.map((column, x) =>
      Object.freeze(
        column.map((code, y) => {
          const generatedCode = generated[x][y];
          if (generatedCode === options.coCode) return options.coCode;
          if (code === options.coCode)
            throw new Error(
              `step[${options.stepIndex}] bg-genco removed settled CO at (${x},${y}).`,
            );
          return code;
        }),
      ),
    ),
  );
}

function requireConfiguredCode(
  code: number | undefined,
  symbol: string,
  stepIndex: number,
): number {
  if (code === undefined)
    throw new Error(
      `step[${stepIndex}] requires an explicit ${symbol} symbol code.`,
    );
  return code;
}

function assertPositiveMultiplier(value: unknown, label: string): number {
  return requireSafeInteger(value, label, { minimum: 1 });
}

function assertCode(value: number, symbol: string): number {
  return requireSafeInteger(value, `game002 ${symbol} symbol code`, {
    minimum: 0,
  });
}

function addSafe(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result))
    throw new Error(`${label} exceeds the safe integer range.`);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function multiplySafe(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result))
    throw new Error(`${label} exceeds the safe integer range.`);
  return result;
}
