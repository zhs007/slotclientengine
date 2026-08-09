import type { SceneMatrix } from "@slotclientengine/gameframeworks";

export type Game002v2PresentationValues = readonly (readonly (
  | number
  | null
)[])[];

export function createGame002v2PresentationValues(options: {
  readonly scene: SceneMatrix;
  readonly fallback?: Readonly<{
    readonly scene: readonly (readonly number[])[];
    readonly values: readonly (readonly (number | null | -1)[])[];
  }>;
  readonly overlays: readonly Readonly<{
    readonly code: number;
    readonly values: readonly (readonly number[])[];
  }>[];
}): Game002v2PresentationValues {
  const values: Array<Array<number | null>> = options.scene.map((column, x) =>
    column.map((code, y) => {
      if (options.fallback?.scene[x]?.[y] !== code) return null;
      const value = options.fallback.values[x]?.[y];
      return value === -1 || value === undefined ? null : value;
    }),
  );
  for (const overlay of options.overlays)
    for (let x = 0; x < options.scene.length; x++)
      for (let y = 0; y < options.scene[x]!.length; y++) {
        const value = overlay.values[x]?.[y];
        if (
          options.scene[x]![y] === overlay.code &&
          typeof value === "number" &&
          value > 0
        )
          values[x]![y] = value;
      }
  return Object.freeze(values.map((column) => Object.freeze(column)));
}

export function sameGame002v2PresentationValues(
  left: readonly (readonly (number | null | -1)[])[],
  right: Game002v2PresentationValues,
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (column, x) =>
        column.length === right[x]?.length &&
        column.every((value, y) => value === right[x]?.[y]),
    )
  );
}
