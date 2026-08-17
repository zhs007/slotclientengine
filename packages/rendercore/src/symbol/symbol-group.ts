import type { RenderAnchor } from "../presentation/render-anchor.js";
import type { RenderPoint } from "../presentation/render-object.js";
import { combineRenderAnchors } from "../presentation/render-anchor.js";
import { startSymbolStatePlaybackBatch } from "../reel/symbol-state-playback.js";
import { SymbolAnimationError } from "./errors.js";
import { getSymbolHandleAdapter, type SymbolHandle } from "./symbol-handle.js";
import type {
  SymbolStateId,
  SymbolStatePlaybackOptions,
  SymbolStateTransitionMode,
} from "./types.js";

export interface SymbolGroupPlaybackOptions extends SymbolStatePlaybackOptions {
  readonly mode?: "parallel" | "sequential";
}

export interface SymbolGroup {
  readonly symbols: readonly SymbolHandle[];
  getAnchor(options?: { readonly align?: "center" }): RenderAnchor;
  /** Returns the input-order middle member. Even-sized groups are ambiguous and fail. */
  getMiddleSymbol(): SymbolHandle;
  /** Returns an area-local snapshot using member centers or selected cell bounds. */
  getCenter(options?: { readonly mode?: "members" | "bounds" }): RenderPoint;
  /** Stable area-local selected-cell footprint; never a display/texture bound. */
  getCellBounds(): SymbolCellBounds;
  setState(
    state: SymbolStateId,
    transitionMode?: SymbolStateTransitionMode,
  ): void;
  setStates(
    states: readonly SymbolStateId[],
    transitionMode?: SymbolStateTransitionMode,
  ): void;
  setValues(values: readonly (number | null)[]): void;
  playState(
    state: SymbolStateId,
    options?: SymbolGroupPlaybackOptions,
  ): Promise<void>;
}

export interface SymbolCellBounds extends RenderPoint {
  readonly width: number;
  readonly height: number;
}

export interface SymbolGroupGeometrySource {
  getCellRect(index: number): SymbolCellBounds;
}

export function createSymbolGroup(
  symbols: readonly SymbolHandle[],
  geometry?: SymbolGroupGeometrySource,
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
    getMiddleSymbol: () => {
      preflightMembers(members);
      if (members.length % 2 === 0)
        throw new SymbolAnimationError(
          "SymbolGroup middle requires an odd number of input-order symbols.",
        );
      return members[(members.length - 1) / 2]!;
    },
    getCenter: (options: { readonly mode?: "members" | "bounds" } = {}) => {
      const mode = options.mode ?? "members";
      if (mode === "members") {
        const points = preflightMembers(members);
        return Object.freeze({
          x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
          y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        });
      }
      if (mode === "bounds") {
        const bounds = resolveCellBounds(members, geometry);
        return Object.freeze({
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        });
      }
      throw new SymbolAnimationError(
        `Unknown SymbolGroup center mode "${String(mode)}".`,
      );
    },
    getCellBounds: () => resolveCellBounds(members, geometry),
    setState: (
      state: SymbolStateId,
      transitionMode?: SymbolStateTransitionMode,
    ) => {
      for (const symbol of members)
        getSymbolHandleAdapter(symbol).validateStateRequest(
          state,
          transitionMode,
        );
      for (const symbol of members) symbol.setState(state, transitionMode);
    },
    setStates: (
      states: readonly SymbolStateId[],
      transitionMode?: SymbolStateTransitionMode,
    ) => {
      assertMappedLength(states, members.length, "states");
      for (const [index, symbol] of members.entries())
        getSymbolHandleAdapter(symbol).validateStateRequest(
          states[index]!,
          transitionMode,
        );
      for (const [index, symbol] of members.entries())
        symbol.setState(states[index]!, transitionMode);
    },
    setValues: (values: readonly (number | null)[]) => {
      assertMappedLength(values, members.length, "values");
      for (const [index, symbol] of members.entries())
        getSymbolHandleAdapter(symbol).validateValue(values[index]!);
      for (const [index, symbol] of members.entries())
        symbol.setValue(values[index]!);
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
        getSymbolHandleAdapter(symbol).validateStatePlayback(state, playback);
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

function preflightMembers(
  symbols: readonly SymbolHandle[],
): readonly RenderPoint[] {
  return symbols.map((symbol) => symbol.getPosition());
}

function resolveCellBounds(
  symbols: readonly SymbolHandle[],
  geometry: SymbolGroupGeometrySource | undefined,
): SymbolCellBounds {
  preflightMembers(symbols);
  if (!geometry)
    throw new SymbolAnimationError(
      "SymbolGroup cell geometry is unavailable from this owner.",
    );
  const rects = symbols.map((_, index) => {
    const rect = geometry.getCellRect(index);
    if (
      !rect ||
      !Number.isFinite(rect.x) ||
      !Number.isFinite(rect.y) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0
    )
      throw new SymbolAnimationError(
        `SymbolGroup cell rect ${index} must contain finite coordinates and positive size.`,
      );
    return rect;
  });
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return Object.freeze({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

function assertMappedLength(
  values: readonly unknown[],
  expected: number,
  label: string,
): void {
  if (!Array.isArray(values) || values.length !== expected)
    throw new SymbolAnimationError(
      `SymbolGroup ${label} length ${values.length} does not match ${expected} symbols.`,
    );
}
