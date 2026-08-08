import type {
  GameLogicStep,
  OtherSceneMatrix,
  SceneMatrix,
  SlotRoundPosition,
  SlotRoundSettledCompileContext,
  SlotRoundSettledSceneCompileContext,
  SlotRoundSettledTransformChangeDraft,
  SlotRoundSettledTransformDraft,
  SlotRoundSettledValueDraft,
} from "@slotclientengine/gameframeworks";
import {
  assertExactMatrixShape,
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

export interface Game002TransformOperationPayload {
  readonly stepIndex: number;
  readonly wlIncrements: readonly Game002WlIncrementPresentation[];
  readonly wlUpdates: readonly Game002WlIncrementPresentation[];
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

/**
 * Builds presentation operations from server-owned snapshots. The compiler only
 * validates values and cells consumed by the current operation; it does not
 * recompute the server's multiplier formulas or prove the whole round.
 */
export function createGame002WlWmMultiplierCompiler(options: {
  readonly wlSymbolCode: number;
  readonly wmSymbolCode: number;
  readonly cnSymbolCode: number;
  readonly cmSymbolCode: number;
  readonly coSymbolCode?: number;
  readonly bnSymbolCode?: number;
  readonly logDiagnostic?: (message: string) => void;
}): Game002WlWmMultiplierCompiler {
  const wlCode = code(options.wlSymbolCode, "WL");
  const wmCode = code(options.wmSymbolCode, "WM");
  const cnCode = code(options.cnSymbolCode, "CN");
  const cmCode = code(options.cmSymbolCode, "CM");
  const coCode = optionalCode(options.coSymbolCode, "CO");
  const bnCode = optionalCode(options.bnSymbolCode, "BN");
  let pendingWinningWilds: readonly SlotRoundPosition[] = Object.freeze([]);

  return Object.freeze({
    resolveSettledScene(context: SlotRoundSettledSceneCompileContext) {
      const wmScene = componentScene(
        context.step,
        GAME002_CASCADE_COMPONENTS.genwm,
        context.inputScene,
      );
      const cmScene = componentScene(
        context.step,
        GAME002_CASCADE_COMPONENTS.gencm,
        wmScene,
      );
      let settled =
        wmScene !== context.inputScene && cmScene !== wmScene
          ? mergeGeneratedMultipliers(wmScene, cmScene, wmCode, cnCode, cmCode)
          : cmScene;
      const generatedCo = optionalScene(
        context.step,
        GAME002_CASCADE_COMPONENTS.genco,
        settled,
      );
      if (generatedCo && coCode !== undefined)
        settled = Object.freeze(
          settled.map((column, x) =>
            Object.freeze(
              column.map((value, y) =>
                generatedCo[x]![y] === coCode ? coCode : value,
              ),
            ),
          ),
        );
      options.logDiagnostic?.(
        `game002 step[${context.stepIndex}] ${context.kind} operations prepared`,
      );
      return settled;
    },

    hydrateSettledValues(context: SlotRoundSettledCompileContext) {
      const valuesByCode = new Map<number, OtherSceneMatrix | undefined>([
        [
          wlCode,
          optionalValues(
            context.step,
            GAME002_CASCADE_COMPONENTS.genwilds,
            context.input.scene,
          ),
        ],
        [
          wmCode,
          optionalValues(
            context.step,
            GAME002_CASCADE_COMPONENTS.setwm,
            context.input.scene,
          ),
        ],
        [
          cmCode,
          optionalValues(
            context.step,
            GAME002_CASCADE_COMPONENTS.setcm,
            context.input.scene,
          ),
        ],
      ]);
      const drafts: SlotRoundSettledValueDraft[] = [];
      for (const occurrence of context.input.occurrences) {
        if (occurrence.value !== null) continue;
        const values = valuesByCode.get(occurrence.code);
        if (!values) continue;
        const { x, y } = occurrence.position;
        drafts.push(
          Object.freeze({
            position: occurrence.position,
            value: positive(values[x]![y], `step[${context.stepIndex}] value`),
          }),
        );
      }
      return Object.freeze(drafts);
    },

    compileSettledTransform(context: SlotRoundSettledCompileContext) {
      const changes = new Map<string, SlotRoundSettledTransformChangeDraft>();
      const values = context.input.values.map((column) => [...column]);
      const wlIncrements = readWildIncrements(
        context,
        wlCode,
        pendingWinningWilds,
      );
      pendingWinningWilds = Object.freeze([]);
      for (const item of wlIncrements) {
        setChange(changes, item.position, wlCode, item.outputValue);
        values[item.position.x]![item.position.y] = item.outputValue;
      }

      const wmOccurrences = context.input.occurrences.filter(
        (item) => item.code === wmCode,
      );
      const wmReplacements: Array<{
        readonly position: SlotRoundPosition;
        readonly intermediateValue: number;
        outputValue: number;
      }> = [];
      const wlUpdates: Game002WlIncrementPresentation[] = [];
      let intermediateScene = context.input.scene;
      if (wmOccurrences.length > 0) {
        const updatedWilds = optionalValues(
          context.step,
          GAME002_CASCADE_COMPONENTS.updwl,
          context.input.scene,
        );
        if (updatedWilds)
          for (const occurrence of context.input.occurrences) {
            if (occurrence.code !== wlCode) continue;
            const { x, y } = occurrence.position;
            const outputValue = positive(
              updatedWilds[x]![y],
              `step[${context.stepIndex}] bg-updwl[${x}][${y}]`,
            );
            wlUpdates.push(
              Object.freeze({
                position: occurrence.position,
                inputValue: positive(
                  values[x]![y],
                  `step[${context.stepIndex}] WL value`,
                ),
                outputValue,
              }),
            );
            setChange(changes, occurrence.position, wlCode, outputValue);
            values[x]![y] = outputValue;
          }
        intermediateScene = requiredScene(
          context.step,
          GAME002_CASCADE_COMPONENTS.wm2cn,
          context.input.scene,
        );
        const generated = requiredValues(
          context.step,
          GAME002_CASCADE_COMPONENTS.genwmcn,
          context.input.scene,
        );
        for (const occurrence of wmOccurrences) {
          const { x, y } = occurrence.position;
          const intermediateValue = positive(
            generated[x]![y],
            `step[${context.stepIndex}] bg-genwmcn[${x}][${y}]`,
          );
          if (intermediateScene[x]![y] !== cnCode)
            throw new Error(`step[${context.stepIndex}] WM target must be CN.`);
          wmReplacements.push({
            position: occurrence.position,
            intermediateValue,
            outputValue: intermediateValue,
          });
          setChange(changes, occurrence.position, cnCode, intermediateValue);
          values[x]![y] = intermediateValue;
        }
        intermediateScene = componentScene(
          context.step,
          GAME002_CASCADE_COMPONENTS.gencm,
          intermediateScene,
        );
      }

      const cmOccurrence = context.input.occurrences.find(
        (item) => item.code === cmCode,
      );
      const cnUpdates: Game002CnValueUpdatePresentation[] = [];
      let cm: Game002CmPresentation | null = null;
      if (cmOccurrence) {
        const multiplier = positive(
          cmOccurrence.value,
          `step[${context.stepIndex}] CM multiplier`,
        );
        const updatedCoins = optionalValues(
          context.step,
          GAME002_CASCADE_COMPONENTS.updcn,
          intermediateScene,
        );
        if (updatedCoins)
          for (let x = 0; x < intermediateScene.length; x += 1)
            for (let y = 0; y < intermediateScene[x]!.length; y += 1) {
              if (intermediateScene[x]![y] !== cnCode) continue;
              const outputValue = positive(
                updatedCoins[x]![y],
                `step[${context.stepIndex}] bg-updcn[${x}][${y}]`,
              );
              const inputValue = positive(
                values[x]![y],
                `step[${context.stepIndex}] CN value`,
              );
              const position = Object.freeze({ x, y });
              cnUpdates.push(
                Object.freeze({ position, inputValue, outputValue }),
              );
              setChange(changes, position, cnCode, outputValue);
              values[x]![y] = outputValue;
              const replacement = wmReplacements.find(
                (item) => positionKey(item.position) === `${x},${y}`,
              );
              if (replacement) replacement.outputValue = outputValue;
            }
        const cmOutputScene = requiredScene(
          context.step,
          GAME002_CASCADE_COMPONENTS.cm2cn,
          intermediateScene,
        );
        const generated = requiredValues(
          context.step,
          GAME002_CASCADE_COMPONENTS.gencmcn,
          intermediateScene,
        );
        const { x, y } = cmOccurrence.position;
        const outputValue = positive(
          generated[x]![y],
          `step[${context.stepIndex}] bg-gencmcn[${x}][${y}]`,
        );
        if (cmOutputScene[x]![y] !== cnCode)
          throw new Error(`step[${context.stepIndex}] CM target must be CN.`);
        cm = Object.freeze({
          position: cmOccurrence.position,
          multiplier,
          outputValue,
        });
        setChange(changes, cmOccurrence.position, cnCode, outputValue);
        values[x]![y] = outputValue;
        intermediateScene = cmOutputScene;
      }

      const coCollection =
        coCode === undefined || bnCode === undefined
          ? null
          : compileGame002CoCollectionPlan({
              stepIndex: context.stepIndex,
              step: context.step,
              inputScene: intermediateScene,
              inputValues: values,
              coSymbolCode: coCode,
              bnSymbolCode: bnCode,
              valueSymbolCodes: new Set([wlCode, cnCode]),
            });
      for (const change of coCollection?.transform.changes ?? [])
        changes.set(positionKey(change.position), change);

      pendingWinningWilds = winningWildPositions(context, wlCode);
      const drafts = [...changes.values()].sort(
        (left, right) =>
          left.position.x - right.position.x ||
          left.position.y - right.position.y,
      );
      if (
        drafts.length === 0 &&
        wmOccurrences.length === 0 &&
        !cmOccurrence &&
        !coCollection
      )
        return Object.freeze({ draft: Object.freeze([]), payload: null });
      const payload = Object.freeze({
        stepIndex: context.stepIndex,
        wlIncrements,
        wlUpdates: Object.freeze(wlUpdates),
        wmReplacements: Object.freeze(
          wmReplacements.map((item) => Object.freeze({ ...item })),
        ),
        cnUpdates: Object.freeze(cnUpdates),
        cm,
        ...(coCollection ? { coCollection } : {}),
      });
      return Object.freeze({
        draft: coCollection
          ? Object.freeze({
              changes: Object.freeze(drafts),
              relocations: coCollection.transform.relocations,
            })
          : Object.freeze(drafts),
        payload,
      });
    },

    assertComplete() {
      // Later-step server evidence is intentionally validated when that step runs.
    },
  });
}

function readWildIncrements(
  context: SlotRoundSettledCompileContext,
  wlCode: number,
  pending: readonly SlotRoundPosition[],
): readonly Game002WlIncrementPresentation[] {
  const values = optionalValues(
    context.step,
    GAME002_CASCADE_COMPONENTS.incwl,
    context.input.scene,
  );
  if (!values) return Object.freeze([]);
  const positions = uniquePositions(
    pending.length > 0
      ? pending
      : context.input.occurrences
          .filter((item) => item.code === wlCode)
          .map((item) => item.position),
  );
  return Object.freeze(
    positions.map((position) => {
      const occurrence = context.input.occurrences.find(
        (item) => positionKey(item.position) === positionKey(position),
      );
      if (occurrence?.code !== wlCode)
        throw new Error(
          `step[${context.stepIndex}] WL increment target is not WL.`,
        );
      return Object.freeze({
        position,
        inputValue: positive(occurrence.value, "WL input multiplier"),
        outputValue: positive(
          values[position.x]![position.y],
          "WL output multiplier",
        ),
      });
    }),
  );
}

function winningWildPositions(
  context: SlotRoundSettledCompileContext,
  wlCode: number,
): readonly SlotRoundPosition[] {
  const results = context.step.getComponentResults(
    GAME002_CASCADE_COMPONENTS.win,
  );
  return uniquePositions(
    results.flatMap((result, index) =>
      parseExactPositionPairs(
        result.pos,
        context.input.scene,
        `step[${context.stepIndex}] bg-win result[${index}].pos`,
      ).filter(({ x, y }) => context.input.scene[x]![y] === wlCode),
    ),
  );
}

function uniquePositions(
  positions: readonly SlotRoundPosition[],
): readonly SlotRoundPosition[] {
  const seen = new Set<string>();
  return Object.freeze(
    positions.filter((position) => {
      const key = positionKey(position);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

function mergeGeneratedMultipliers(
  wmScene: SceneMatrix,
  cmScene: SceneMatrix,
  wmCode: number,
  cnCode: number,
  cmCode: number,
): SceneMatrix {
  assertExactMatrixShape(cmScene, wmScene, "game002 generated CM scene");
  return Object.freeze(
    wmScene.map((column, x) =>
      Object.freeze(
        column.map((value, y) => {
          if (value === wmCode && cmScene[x]![y] === cnCode) return wmCode;
          return cmScene[x]![y] === cmCode ? cmCode : value;
        }),
      ),
    ),
  );
}

function componentScene(
  step: GameLogicStep,
  name: string,
  fallback: SceneMatrix,
): SceneMatrix {
  return step.hasComponent(name)
    ? requiredScene(step, name, fallback)
    : fallback;
}

function optionalScene(
  step: GameLogicStep,
  name: string,
  reference: SceneMatrix,
): SceneMatrix | undefined {
  return step.hasComponent(name)
    ? requiredScene(step, name, reference)
    : undefined;
}

function requiredScene(
  step: GameLogicStep,
  name: string,
  reference: SceneMatrix,
): SceneMatrix {
  const scenes = step.getComponentScenes(name);
  if (scenes.length === 0)
    throw new Error(`step[${step.getIndex()}] ${name} scene is missing.`);
  assertExactMatrixShape(scenes[0]!, reference, `${name} scene`);
  return scenes[0]!;
}

function optionalValues(
  step: GameLogicStep,
  name: string,
  reference: SceneMatrix,
): OtherSceneMatrix | undefined {
  if (!step.hasComponent(name)) return undefined;
  return requiredValues(step, name, reference);
}

function requiredValues(
  step: GameLogicStep,
  name: string,
  reference: SceneMatrix,
): OtherSceneMatrix {
  const values = step.getComponentOtherScenes(name);
  if (values.length === 0)
    throw new Error(`step[${step.getIndex()}] ${name} otherScene is missing.`);
  assertExactMatrixShape(values[0]!, reference, `${name} otherScene`);
  return values[0]!;
}

function setChange(
  changes: Map<string, SlotRoundSettledTransformChangeDraft>,
  position: SlotRoundPosition,
  outputCode: number,
  outputValue: number | null,
): void {
  changes.set(
    positionKey(position),
    Object.freeze({ position, outputCode, outputValue }),
  );
}

function positive(value: unknown, label: string): number {
  return requireSafeInteger(value, label, { minimum: 1 });
}

function code(value: unknown, symbol: string): number {
  return requireSafeInteger(value, `game002 ${symbol} symbol code`, {
    minimum: 0,
  });
}

function optionalCode(value: unknown, symbol: string): number | undefined {
  return value === undefined ? undefined : code(value, symbol);
}
