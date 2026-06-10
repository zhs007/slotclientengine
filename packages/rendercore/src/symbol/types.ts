import type { Container, Sprite, Texture } from "pixi.js";
import type { GameConfigPaytableEntry, LogicGameConfig } from "@slotclientengine/logiccore";
import type { RenderSymbol } from "./render-symbol.js";

export type SymbolStateId = string;
export type SymbolStatePhase = "stable" | "once";
export type SymbolPlaybackKind = "loop" | "static" | "once";

export interface SymbolStateDefinition {
  readonly id: SymbolStateId;
  readonly phase: SymbolStatePhase;
  readonly playback: SymbolPlaybackKind;
  readonly frameDurationSeconds?: number;
}

export interface SymbolStateEquivalence {
  readonly from: SymbolStateId;
  readonly to: SymbolStateId;
}

export interface SymbolStatePreset {
  readonly defaultState: SymbolStateId;
  readonly states: readonly SymbolStateDefinition[];
  readonly equivalences?: readonly SymbolStateEquivalence[];
}

export interface SymbolDefinition {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly defaultState: SymbolStateId;
  readonly states: readonly SymbolStateDefinition[];
  readonly equivalences?: readonly SymbolStateEquivalence[];
}

export interface SymbolStateSnapshot {
  readonly requestedState: SymbolStateId;
  readonly resolvedState: SymbolStateId;
  readonly defaultState: SymbolStateId;
  readonly pendingState: SymbolStateId | null;
  readonly isOnce: boolean;
}

export interface SymbolSequenceStep {
  readonly state: SymbolStateId;
  readonly holdSeconds?: number;
}

export interface SymbolSequenceUpdateInput {
  readonly deltaSeconds: number;
  readonly onceCompleted?: boolean;
}

export interface SymbolSequenceUpdateResult {
  readonly shouldRequestState: boolean;
  readonly state: SymbolStateId;
  readonly currentIndex: number;
}

export interface SymbolStateSequenceControllerOptions {
  readonly statePreset: SymbolStatePreset;
  readonly steps: readonly SymbolSequenceStep[];
  readonly autoplay?: boolean;
}

export interface SymbolAniUpdateResult {
  readonly loopCompleted: boolean;
  readonly onceCompleted: boolean;
}

export interface SymbolAni {
  readonly stateId: SymbolStateId;
  readonly playback: SymbolPlaybackKind;
  reset(): void;
  update(deltaSeconds: number): SymbolAniUpdateResult;
}

export interface SymbolAnimationContext {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly requestedState: SymbolStateId;
  readonly resolvedState: SymbolStateId;
  readonly state: SymbolStateDefinition;
  readonly texture: Texture;
  readonly stateTextures: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures: readonly SymbolStateId[];
  readonly root: Container;
  readonly sprite: Sprite;
  readonly overlayLayer: Container;
}

export type SymbolAniFactory = (context: SymbolAnimationContext) => SymbolAni;
export type SymbolAnimationResolver = (context: SymbolAnimationContext) => SymbolAni;

export interface RenderSymbolUpdateResult {
  readonly requestedState: SymbolStateId;
  readonly resolvedState: SymbolStateId;
  readonly loopCompleted: boolean;
  readonly onceCompleted: boolean;
  readonly stateChanged: boolean;
}

export interface RenderSymbolOptions {
  readonly definition: SymbolDefinition;
  readonly texture: Texture;
  readonly stateTextures?: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures?: readonly SymbolStateId[];
  readonly animationResolver: SymbolAnimationResolver;
}

export interface SymbolTextureSet<TTexture = Texture | string> {
  readonly normal: TTexture;
  readonly states?: Readonly<Partial<Record<SymbolStateId, TTexture>>>;
}

export type SymbolAssetInput = Texture | string | SymbolTextureSet;

export interface SymbolAssetMap {
  readonly [symbol: string]: SymbolAssetInput;
}

export interface SymbolTexturePolicy {
  readonly requiredStateTextures?: readonly SymbolStateId[];
}

export interface SymbolCatalogValidation {
  readonly displayableSymbols: readonly string[];
  readonly ignoredPaytableSymbolsWithoutAssets: readonly string[];
  readonly ignoredAssetsWithoutPaytable: readonly string[];
}

export interface CreateSymbolCatalogOptions {
  readonly gameConfig: LogicGameConfig;
  readonly assets: SymbolAssetMap;
  readonly statePreset?: SymbolStatePreset;
  readonly animationResolver?: SymbolAnimationResolver;
  readonly texturePolicy?: SymbolTexturePolicy;
}

export interface CreateCatalogRenderSymbolOptions {
  readonly texture?: Texture;
  readonly stateTextures?: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly animationResolver?: SymbolAnimationResolver;
}

export interface SymbolCatalog {
  getValidation(): SymbolCatalogValidation;
  getDisplayableSymbols(): readonly string[];
  getDefinition(symbol: string): SymbolDefinition;
  getPaytableEntry(symbol: string): GameConfigPaytableEntry;
  getAsset(symbol: string): Texture | string;
  getTextureSet(symbol: string): SymbolTextureSet;
  createRenderSymbol(symbol: string, options?: CreateCatalogRenderSymbolOptions): RenderSymbol;
}
