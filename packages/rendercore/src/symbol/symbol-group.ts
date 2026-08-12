import type { RenderAnchor } from "../presentation/render-anchor.js";
import { combineRenderAnchors } from "../presentation/render-anchor.js";
import { startSymbolStatePlaybackBatch } from "../reel/symbol-state-playback.js";
import { SymbolAnimationError } from "./errors.js";
import { getSymbolRenderAdapter, type SymbolRender } from "./symbol-render.js";
import type {
  SymbolStateId,
  SymbolStatePlaybackOptions,
  SymbolStateTransitionMode,
} from "./types.js";

export interface SymbolGroupPlaybackOptions extends SymbolStatePlaybackOptions {
  readonly mode?: "parallel" | "sequential";
}

export interface SymbolGroup {
  readonly symbols: readonly SymbolRender[];
  getAnchor(options?: { readonly align?: "center" }): RenderAnchor;
  setState(
    state: SymbolStateId,
    transitionMode?: SymbolStateTransitionMode,
  ): void;
  playState(
    state: SymbolStateId,
    options?: SymbolGroupPlaybackOptions,
  ): Promise<void>;
}

export function createSymbolGroup(
  symbols: readonly SymbolRender[],
): SymbolGroup {
  if (symbols.length === 0)
    throw new SymbolAnimationError("SymbolGroup must not be empty.");
  const members = Object.freeze([...symbols]);
  return Object.freeze({
    symbols: members,
    getAnchor: (options: { readonly align?: "center" } = {}) => {
      if (options.align !== undefined && options.align !== "center")
        throw new SymbolAnimationError(
          `Unknown SymbolGroup anchor alignment "${String(options.align)}".`,
        );
      return combineRenderAnchors(members.map((symbol) => symbol.getAnchor()));
    },
    setState: (
      state: SymbolStateId,
      transitionMode?: SymbolStateTransitionMode,
    ) => {
      for (const symbol of members)
        getSymbolRenderAdapter(symbol).validateStateRequest(
          state,
          transitionMode,
        );
      for (const symbol of members) symbol.setState(state, transitionMode);
    },
    playState: (
      state: SymbolStateId,
      options: SymbolGroupPlaybackOptions = { completion: "entered" },
    ) => {
      const { mode = "parallel", ...playback } = options;
      if (mode !== "parallel" && mode !== "sequential")
        return Promise.reject(
          new SymbolAnimationError(
            `Unknown SymbolGroup playback mode "${String(mode)}".`,
          ),
        );
      for (const symbol of members)
        getSymbolRenderAdapter(symbol).validateStatePlayback(state, playback);
      if (mode === "sequential")
        return members.reduce(
          (job, symbol) => job.then(() => symbol.playState(state, playback)),
          Promise.resolve(),
        );
      return startSymbolStatePlaybackBatch(
        members.map(
          (symbol) => (signal: AbortSignal) =>
            symbol.playState(state, { ...playback, signal }),
        ),
        playback.signal,
      );
    },
  });
}
