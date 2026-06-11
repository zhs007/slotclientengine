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
  readonly baseLayer: Container;
  readonly sprite: Sprite;
  readonly layers: readonly SymbolVisualLayer[];
  readonly stateSprite: Sprite;
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
  readonly texture: Texture | SymbolNormalTextureSource<Texture>;
  readonly stateTextures?: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures?: readonly SymbolStateId[];
  readonly animationResolver: SymbolAnimationResolver;
}

export interface SymbolLayerTextureSource<TTexture = Texture | string> {
  readonly index: number;
  readonly texture: TTexture;
  readonly keyframes?: readonly TTexture[];
}

export interface SingleSymbolTextureSource<TTexture = Texture | string> {
  readonly kind: "single";
  readonly texture: TTexture;
}

export interface LayeredSymbolTextureSource<TTexture = Texture | string> {
  readonly kind: "layered";
  readonly layers: readonly SymbolLayerTextureSource<TTexture>[];
}

export type SymbolNormalTextureSource<TTexture = Texture | string> =
  | SingleSymbolTextureSource<TTexture>
  | LayeredSymbolTextureSource<TTexture>;

export interface SymbolVisualLayer {
  readonly index: number;
  readonly texture: Texture;
  readonly keyframes: readonly Texture[];
  readonly sprite: Sprite;
}

export interface SymbolTextureSet<TTexture = Texture | string> {
  readonly normal: TTexture | SymbolNormalTextureSource<TTexture>;
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
  readonly texture?: Texture | SymbolNormalTextureSource<Texture>;
  readonly stateTextures?: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly animationResolver?: SymbolAnimationResolver;
}

export interface SymbolNamedAnimationSpec {
  readonly name: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface SymbolAnimationProfile {
  readonly playback: SymbolPlaybackKind;
  readonly durationSeconds: number;
  readonly effects: readonly SymbolNamedAnimationSpec[];
}

export type SymbolAnimationProfileMap = Readonly<
  Record<string, Readonly<Partial<Record<SymbolStateId, SymbolAnimationProfile>>>>
>;

export interface SymbolLayerEffect {
  reset(): void;
  progress(progress: number): void;
  complete(): void;
}

export type NamedSymbolAnimationFactory = (
  context: SymbolAnimationContext,
  params: Readonly<Record<string, unknown>>,
  profile: SymbolAnimationProfile
) => SymbolLayerEffect;

export interface NamedSymbolAnimationRegistry {
  readonly [name: string]: NamedSymbolAnimationFactory;
}

export interface SymbolCatalog {
  getValidation(): SymbolCatalogValidation;
  getDisplayableSymbols(): readonly string[];
  getDefinition(symbol: string): SymbolDefinition;
  getPaytableEntry(symbol: string): GameConfigPaytableEntry;
  getAsset(symbol: string): Texture | string;
  getTextureSet(symbol: string): SymbolTextureSet;
  getNormalTextureSource(symbol: string): SymbolNormalTextureSource;
  createRenderSymbol(symbol: string, options?: CreateCatalogRenderSymbolOptions): RenderSymbol;
}
