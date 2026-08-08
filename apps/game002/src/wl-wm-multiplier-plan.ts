import type {
  GameLogicStep,
  OtherSceneMatrix,
  SceneMatrix,
  SlotRoundPosition,
  SlotRoundSettledCompileContext,
  SlotRoundSettledSceneCompileContext,
  SlotRoundSettledTransformChangeDraft,
  SlotRoundSettledTransformRelocationDraft,
  SlotRoundSettledValueDraft,
} from "@slotclientengine/gameframeworks";
import {
  assertExactMatrixShape,
  findMatrixValuePositions,
  parseExactPositionPairs,
  requireSafeInteger,
  slotOperationPositionKey as positionKey,
} from "@slotclientengine/gameframeworks";
import { GAME002_CASCADE_COMPONENTS } from "./cascade-config.js";
import { compileGame002CoCollectionPlan } from "./co-collection-plan.js";

export type Game002TransformKey =
  | "wl-increment"
  | "wild-multiplier"
  | "wm-to-cn"
  | "coin-multiplier"
  | "cm-to-cn"
  | "co-collect";

interface PhaseBase {
  readonly key: Game002TransformKey;
  readonly changes: readonly SlotRoundSettledTransformChangeDraft[];
}

export type Game002SettledTransformPhase =
  | Readonly<PhaseBase & { type: "change" }>
  | Readonly<
      PhaseBase & {
        type: "driven-change";
        mainPos: readonly SlotRoundPosition[];
      }
    >
  | Readonly<
      PhaseBase & {
        type: "transfer";
        mainPos: readonly SlotRoundPosition[];
        routes: readonly SlotRoundSettledTransformRelocationDraft[];
      }
    >;

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
  readonly logDiagnostic?: (message: string) => void;
}) {
  const wlCode = options.wlSymbolCode;
  const wmCode = options.wmSymbolCode;
  const cnCode = options.cnSymbolCode;
  const cmCode = options.cmSymbolCode;
  const coCode = options.coSymbolCode;
  let pendingWinningWilds: readonly SlotRoundPosition[] = Object.freeze([]);

  return Object.freeze({
    resolveSettledScene(context: SlotRoundSettledSceneCompileContext) {
      const wmScene =
        scene(
          context.step,
          GAME002_CASCADE_COMPONENTS.genwm,
          context.inputScene,
        ) ?? context.inputScene;
      const cmScene =
        scene(context.step, GAME002_CASCADE_COMPONENTS.gencm, wmScene) ??
        wmScene;
      let settled =
        wmScene !== context.inputScene && cmScene !== wmScene
          ? mergeGeneratedMultipliers(wmScene, cmScene, wmCode, cnCode, cmCode)
          : cmScene;
      const generatedCo = scene(
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
      const values = (name: string) =>
        otherScene(context.step, name, context.input.scene);
      const valuesByCode = new Map<number, OtherSceneMatrix | undefined>([
        [wlCode, values(GAME002_CASCADE_COMPONENTS.genwilds)],
        [wmCode, values(GAME002_CASCADE_COMPONENTS.setwm)],
        [cmCode, values(GAME002_CASCADE_COMPONENTS.setcm)],
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
      const phases: Game002SettledTransformPhase[] = [];
      const values = context.input.values.map((column) => [...column]);
      const wlIncrements = readWildIncrementChanges(
        context,
        wlCode,
        pendingWinningWilds,
      );
      pendingWinningWilds = Object.freeze([]);
      applyChanges(values, wlIncrements);
      if (wlIncrements.length > 0)
        phases.push(changePhase("wl-increment", wlIncrements));

      const wmOccurrences = context.input.occurrences.filter(
        (item) => item.code === wmCode,
      );
      let intermediateScene = context.input.scene;
      if (wmOccurrences.length > 0) {
        const updatedWilds = otherScene(
          context.step,
          GAME002_CASCADE_COMPONENTS.updwl,
          context.input.scene,
        );
        const wlUpdates = updatedWilds
          ? changesAt(
              context.input.occurrences
                .filter(({ code }) => code === wlCode)
                .map(({ position }) => position),
              context.input.scene,
              updatedWilds,
              `step[${context.stepIndex}] bg-updwl`,
            )
          : [];
        applyChanges(values, wlUpdates);
        phases.push(
          drivenPhase(
            "wild-multiplier",
            wmOccurrences.map(({ position }) => position),
            wlUpdates,
          ),
        );
        intermediateScene = scene(
          context.step,
          GAME002_CASCADE_COMPONENTS.wm2cn,
          context.input.scene,
          true,
        )!;
        const generated = otherScene(
          context.step,
          GAME002_CASCADE_COMPONENTS.genwmcn,
          context.input.scene,
          true,
        )!;
        const wmChanges = changesAt(
          wmOccurrences.map(({ position }) => position),
          intermediateScene,
          generated,
          `step[${context.stepIndex}] bg-genwmcn`,
        );
        applyChanges(values, wmChanges);
        phases.push(changePhase("wm-to-cn", wmChanges));
        intermediateScene =
          scene(
            context.step,
            GAME002_CASCADE_COMPONENTS.gencm,
            intermediateScene,
          ) ?? intermediateScene;
      }

      const cmOccurrence = context.input.occurrences.find(
        (item) => item.code === cmCode,
      );
      if (cmOccurrence) {
        const updatedCoins = otherScene(
          context.step,
          GAME002_CASCADE_COMPONENTS.updcn,
          intermediateScene,
        );
        const cnUpdates = updatedCoins
          ? changesAt(
              findMatrixValuePositions(intermediateScene, cnCode),
              intermediateScene,
              updatedCoins,
              `step[${context.stepIndex}] bg-updcn`,
            )
          : [];
        applyChanges(values, cnUpdates);
        if (cnUpdates.length > 0)
          phases.push(
            drivenPhase("coin-multiplier", [cmOccurrence.position], cnUpdates),
          );
        const cmOutputScene = scene(
          context.step,
          GAME002_CASCADE_COMPONENTS.cm2cn,
          intermediateScene,
          true,
        )!;
        const generated = otherScene(
          context.step,
          GAME002_CASCADE_COMPONENTS.gencmcn,
          intermediateScene,
          true,
        )!;
        const cmChanges = changesAt(
          [cmOccurrence.position],
          cmOutputScene,
          generated,
          `step[${context.stepIndex}] bg-gencmcn`,
        );
        phases.push(changePhase("cm-to-cn", cmChanges));
        applyChanges(values, cmChanges);
        intermediateScene = cmOutputScene;
      }

      const coCollection =
        coCode === undefined
          ? null
          : compileGame002CoCollectionPlan({
              stepIndex: context.stepIndex,
              step: context.step,
              inputScene: intermediateScene,
              inputValues: values,
              coSymbolCode: coCode,
              valueSymbolCodes: new Set([wlCode, cnCode]),
            });
      if (coCollection) phases.push(transferPhase("co-collect", coCollection));

      pendingWinningWilds = winningWildPositions(context, wlCode);
      return Object.freeze({ phases: Object.freeze(phases) });
    },
  });
}

function change(
  position: SlotRoundPosition,
  outputCode: number,
  outputValue: number,
): SlotRoundSettledTransformChangeDraft {
  return Object.freeze({ position, outputCode, outputValue });
}

function changesAt(
  positions: readonly SlotRoundPosition[],
  scene: SceneMatrix,
  values: OtherSceneMatrix,
  label: string,
): readonly SlotRoundSettledTransformChangeDraft[] {
  return Object.freeze(
    positions.map(({ x, y }) =>
      change(
        Object.freeze({ x, y }),
        scene[x]![y]!,
        positive(values[x]![y], `${label}[${x}][${y}]`),
      ),
    ),
  );
}

function applyChanges(
  values: (number | null)[][],
  changes: readonly SlotRoundSettledTransformChangeDraft[],
): void {
  for (const { position, outputValue } of changes)
    values[position.x]![position.y] = outputValue;
}

function changePhase(
  key: Game002TransformKey,
  changes: readonly SlotRoundSettledTransformChangeDraft[],
): Game002SettledTransformPhase {
  return Object.freeze({
    key,
    type: "change",
    changes: Object.freeze(changes),
  });
}

function drivenPhase(
  key: Game002TransformKey,
  mainPos: readonly SlotRoundPosition[],
  changes: readonly SlotRoundSettledTransformChangeDraft[],
): Game002SettledTransformPhase {
  return Object.freeze({
    key,
    type: "driven-change",
    mainPos: Object.freeze(mainPos),
    changes: Object.freeze(changes),
  });
}

function transferPhase(
  key: Game002TransformKey,
  plan: Readonly<{
    mainPos: readonly SlotRoundPosition[];
    routes: readonly SlotRoundSettledTransformRelocationDraft[];
    changes: readonly SlotRoundSettledTransformChangeDraft[];
  }>,
): Game002SettledTransformPhase {
  return Object.freeze({ key, type: "transfer", ...plan });
}

function readWildIncrementChanges(
  context: SlotRoundSettledCompileContext,
  wlCode: number,
  pending: readonly SlotRoundPosition[],
): readonly SlotRoundSettledTransformChangeDraft[] {
  const values = otherScene(
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
    positions.map((position) =>
      change(
        position,
        wlCode,
        positive(values[position.x]![position.y], "WL output multiplier"),
      ),
    ),
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

function scene(
  step: GameLogicStep,
  name: string,
  reference: SceneMatrix,
  required = false,
): SceneMatrix | undefined {
  if (!required && !step.hasComponent(name)) return undefined;
  const scenes = step.getComponentScenes(name);
  if (scenes.length === 0)
    throw new Error(`step[${step.getIndex()}] ${name} scene is missing.`);
  assertExactMatrixShape(scenes[0]!, reference, `${name} scene`);
  return scenes[0]!;
}

function otherScene(
  step: GameLogicStep,
  name: string,
  reference: SceneMatrix,
  required = false,
): OtherSceneMatrix | undefined {
  if (!required && !step.hasComponent(name)) return undefined;
  const values = step.getComponentOtherScenes(name);
  if (values.length === 0)
    throw new Error(`step[${step.getIndex()}] ${name} otherScene is missing.`);
  assertExactMatrixShape(values[0]!, reference, `${name} otherScene`);
  return values[0]!;
}

function positive(value: unknown, label: string): number {
  return requireSafeInteger(value, label, { minimum: 1 });
}
