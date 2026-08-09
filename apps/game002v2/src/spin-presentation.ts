import type {
  SceneLayoutGridCellSpinPlanStage,
  SymbolPackageResource,
} from "@slotclientengine/rendercore";
import { orderGridCellPositions } from "@slotclientengine/rendercore";
import { createNearwinLandingState } from "./nearwin.js";
import type { Game002v2ReelPresentation } from "./reel-presentation.js";

const DIMMING_ALPHA = 0.5;
const NORMAL_BRIGHT_SYMBOLS = Object.freeze(["CN", "WL", "WM", "CM", "CO"]);

export interface Game002v2SpinSymbolCodes {
  readonly wild: number;
  readonly coin: number;
  readonly normalBright: ReadonlySet<number>;
}

export function resolveGame002v2SpinSymbolCodes(
  symbols: SymbolPackageResource,
): Game002v2SpinSymbolCodes {
  const codes = new Map(
    NORMAL_BRIGHT_SYMBOLS.map((symbol) => {
      const code = symbols.gameConfig.getSymbolCode(symbol);
      if (code === undefined)
        throw new Error(`game002v2 requires symbol "${symbol}".`);
      return [symbol, code] as const;
    }),
  );
  return Object.freeze({
    wild: codes.get("WL")!,
    coin: codes.get("CN")!,
    normalBright: new Set(codes.values()),
  });
}

export function buildGame002v2InitialSpinPlan(
  stage: SceneLayoutGridCellSpinPlanStage,
  codes: Game002v2SpinSymbolCodes,
  presentation?: Game002v2ReelPresentation,
) {
  const nearwin = createNearwinLandingState(
    stage.targetScene,
    codes.wild,
    stage.order,
  );
  return Object.freeze({
    nearwin,
    plan: stage.createPlan({
      dimming: {
        resolveDimmingAlpha: (code, activated) =>
          (activated ? code === codes.wild : codes.normalBright.has(code))
            ? 0
            : (presentation?.manifest.spin.dimmingAlpha ?? DIMMING_ALPHA),
        fadeInMs: 80,
        fadeOutMs: 160,
      },
      ...(nearwin
        ? presentation
          ? {
              effects: {
                activated: createEffectPlanSpec(
                  presentation,
                  presentation.manifest.spin.anticipation.effect,
                ),
                activationGate: nearwin.activationGate,
                firstFollowingStopDelayMs:
                  presentation.manifest.spin.anticipation
                    .firstFollowingStopDelayMs,
                activatedStopStepMs:
                  presentation.manifest.spin.anticipation.stopStepMs,
              },
            }
          : {
              activation: {
                activationGate: nearwin.activationGate,
                firstFollowingStopDelayMs: 800,
                activatedStopStepMs: 100,
              },
            }
        : {}),
    }),
  });
}

function createEffectPlanSpec(
  presentation: Game002v2ReelPresentation,
  effectId: string,
) {
  const effect = presentation.resources[effectId];
  if (!effect)
    throw new Error(`game002v2 effect "${effectId}" is unavailable.`);
  return Object.freeze({
    effectId,
    durationMs: effect.durationSeconds * 1000,
    loopCount: effect.loopCount,
    finishBeforeStopMs: effect.finishBeforeStopMs,
  });
}

export function buildGame002v2FreeGameSpinPlan(
  stage: SceneLayoutGridCellSpinPlanStage,
  inputScene: readonly (readonly number[])[],
  codes: Game002v2SpinSymbolCodes,
) {
  const positions = stage.order.filter(({ x, y }) => {
    const code = inputScene[x]?.[y];
    if (code === undefined)
      throw new Error(`game002v2 FG input scene is missing (${x},${y}).`);
    return code !== codes.wild && code !== codes.coin;
  });
  if (positions.length === 0)
    throw new Error("game002v2 FG spin has no non-held positions.");
  return stage.createPlan({ positions });
}

export function buildGame002v2AnticipationRefillPlan(
  stage: SceneLayoutGridCellSpinPlanStage,
  refillPositions: readonly { readonly x: number; readonly y: number }[],
  presentation: Game002v2ReelPresentation,
) {
  const config = presentation.manifest.cascade.anticipationRefill.spin;
  return stage.createPlan({
    positions: orderGridCellPositions({
      positions: refillPositions,
      columns: presentation.columns,
      rows: presentation.rows,
      mode: config.order,
    }),
    timing: config,
    dimmingActivatedAtStart: true,
    effects: {
      normal: createEffectPlanSpec(presentation, config.effect),
    },
  });
}

export function buildGame002v2AnticipationSweep(
  refillPositions: readonly { readonly x: number; readonly y: number }[],
  presentation: Game002v2ReelPresentation,
) {
  const config = presentation.manifest.cascade.anticipationRefill.sweep;
  return Object.freeze({
    effectId: config.effect,
    loopCount: config.loopCount,
    startStepMs: config.startStepMs,
    positions: orderGridCellPositions({
      positions: refillPositions,
      columns: presentation.columns,
      rows: presentation.rows,
      mode: config.order,
    }),
  });
}
