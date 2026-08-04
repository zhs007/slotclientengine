import type { Container } from "pixi.js";
import type {
  LogicGameConfig,
  SceneMatrix,
} from "@slotclientengine/gameframeworks";
import type {
  ReelSymbolRenderPriorityMap,
  ReelSymbolScaleMap,
  SymbolAnimationResolver,
} from "@slotclientengine/rendercore";
import type {
  ReelLayout,
  ReelSpinDirection,
  ReelSpinPlan,
  RenderReelSetUpdateResult,
  RenderVisibleSymbolGeometrySnapshot,
  RenderVisibleSymbolStateSnapshot,
} from "@slotclientengine/rendercore/reel";
import { sceneEquals, validateGame003Scene } from "./scene.js";

export interface Game003ReelConfig {
  readonly kind: "normal";
  readonly reelsName: string;
  readonly emptySymbols: readonly string[];
  readonly texturedSymbols: readonly string[];
  readonly missingAssetLabel: string;
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolRenderPriorities: ReelSymbolRenderPriorityMap;
  readonly animationResolver: SymbolAnimationResolver;
  readonly direction: ReelSpinDirection;
  readonly minimumSpinCycles: number;
  readonly baseDurationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly startDelayMs: number;
  readonly stopDelayMs: number;
}

export interface Game003ReelLayerLayout {
  readonly rawReelsContentWidth: number;
  readonly rawReelsContentHeight: number;
  readonly x: number;
  readonly y: number;
  readonly stageVisibleFrame: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  readonly viewportVisibleFrame: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface Game003ReelVisualSnapshot {
  readonly visible: boolean;
  readonly spinning: boolean;
  readonly visibleScene: SceneMatrix;
  readonly requestedStates: readonly (readonly (string | null)[])[];
  readonly reelCount: number;
  readonly layerX: number;
  readonly layerY: number;
}

export interface Game003ReelRuntime {
  readonly config: Game003ReelConfig;
  readonly gameConfig: LogicGameConfig;
  readonly layout: ReelLayout;
  readonly mainReelsLayer: Container;
  readonly layerLayout: Game003ReelLayerLayout;
  getCurrentScene(): SceneMatrix | null;
  getTargetScene(): SceneMatrix | null;
  getFinalYs(): readonly number[] | null;
  getVisualSnapshot(): Game003ReelVisualSnapshot;
  applyScene(scene: SceneMatrix, sceneName?: string): readonly number[];
  createSpinPlan(scene: SceneMatrix, sceneName?: string): ReelSpinPlan;
  spinToScene(scene: SceneMatrix, sceneName?: string): ReelSpinPlan;
  update(deltaSeconds: number): RenderReelSetUpdateResult;
  isSpinning(): boolean;
  requestVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: string,
  ): void;
  getVisibleSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolStateSnapshot[];
  getVisibleSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolGeometrySnapshot[];
  applyLayout(layout: Game003ReelLayerLayout): void;
}

export function assertGame003ReelVisualMatchesTarget(
  snapshot: Game003ReelVisualSnapshot,
  targetScene: SceneMatrix,
  label: string,
): void {
  const validTargetScene = validateGame003Scene(targetScene, label);
  if (!snapshot.visible) {
    throw new Error(`${label} reel layer must be visible.`);
  }
  if (!sceneEquals(snapshot.visibleScene, validTargetScene)) {
    throw new Error(`${label} visible scene does not match target scene.`);
  }
}
