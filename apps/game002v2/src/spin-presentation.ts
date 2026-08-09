import type {
  SceneLayoutGridCellSpinPlanStage,
  SymbolPackageResource,
} from "@slotclientengine/rendercore";
import { createNearwinLandingState } from "./nearwin.js";

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
            : DIMMING_ALPHA,
        fadeInMs: 80,
        fadeOutMs: 160,
      },
      ...(nearwin
        ? {
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
