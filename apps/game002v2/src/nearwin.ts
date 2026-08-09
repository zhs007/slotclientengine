import type { SceneMatrix } from "@slotclientengine/gameframeworks";

export interface NearwinLandingState {
  readonly matrix: readonly (readonly string[])[];
  readonly positions: readonly { readonly x: number; readonly y: number }[];
}

/**
 * Nearwin is the only game-owned landing rule. The visual itself is still a
 * Symbols state; the app only decides which landed WL occurrences request it.
 */
export function createNearwinLandingState(
  scene: SceneMatrix,
  wildCode: number,
): NearwinLandingState | null {
  let wildCount = 0;
  const positions: Array<{ readonly x: number; readonly y: number }> = [];
  const matrix = scene.map((column, x) =>
    column.map((code, y) => {
      if (code !== wildCode) return "normal";
      wildCount += 1;
      if (wildCount <= 2) return "normal";
      positions.push(Object.freeze({ x, y }));
      return "Reel_NearWin";
    }),
  );
  return positions.length === 0
    ? null
    : Object.freeze({
        matrix: Object.freeze(matrix.map((column) => Object.freeze(column))),
        positions: Object.freeze(positions),
      });
}
