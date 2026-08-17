import type { Container, Texture } from "pixi.js";
import type {
  CreateCatalogSymbolPlayerOptions,
  SymbolNormalTextureSource,
  SymbolCatalog,
  SymbolStateId,
  SymbolStateSnapshot,
  SymbolPlayerUpdateResult,
} from "../types.js";
import type { SymbolPlayer } from "../symbol-player.js";

export interface SymbolPreviewPlayer {
  readonly view: Container;
  readonly symbol: string;
  readonly renderPriority: number;
  readonly normalSource: SymbolNormalTextureSource<Texture>;
  readonly stateTextures: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  getLayerTextures(): readonly Texture[];
  init(): void;
  update(deltaSeconds: number): SymbolPlayerUpdateResult;
  requestState(state: SymbolStateId, mode?: "boundary" | "immediate"): void;
  returnToDefaultState(): void;
  setDefaultState(state: SymbolStateId): void;
  getStateSnapshot(): SymbolStateSnapshot;
  setPresentationValue(value: number | null): void;
  setImageStringText(name: string, text: string): void;
  reset(): void;
  destroy(): void;
}

export function createSymbolPreviewPlayer(options: {
  readonly catalog: SymbolCatalog;
  readonly symbol: string;
  readonly player?: CreateCatalogSymbolPlayerOptions;
}): SymbolPreviewPlayer {
  const player = options.catalog.createSymbolPlayer(
    options.symbol,
    options.player,
  );
  return createPreviewAdapter(player);
}

function createPreviewAdapter(player: SymbolPlayer): SymbolPreviewPlayer {
  return Object.freeze({
    view: player,
    symbol: player.symbol,
    renderPriority: player.renderPriority,
    normalSource: player.normalSource,
    stateTextures: player.stateTextures,
    getLayerTextures: () =>
      player.getLayerSprites().map((layer) => layer.texture),
    init: () => player.init(),
    update: (deltaSeconds: number) => player.update(deltaSeconds),
    requestState: (state: SymbolStateId, mode?: "boundary" | "immediate") =>
      player.requestState(state, mode),
    returnToDefaultState: () => player.returnToDefaultState(),
    setDefaultState: (state: SymbolStateId) => player.setDefaultState(state),
    getStateSnapshot: () => player.getStateSnapshot(),
    setPresentationValue: (value: number | null) =>
      player.setPresentationValue(value),
    setImageStringText: (name: string, text: string) =>
      player.setImageStringText(name, text),
    reset: () => player.reset(),
    destroy: () => player.destroy(),
  });
}
