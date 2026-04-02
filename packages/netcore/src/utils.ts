/**
 * @fileoverview Utility functions for the project.
 */

/**
 * Represents the complex structure of scene data received from the server.
 */
interface RawSceneData {
  values: Array<{
    values: number[];
  }>;
  // The object can have other properties that we ignore.
  [key: string]: any;
}

/**
 * Transforms a raw scene data object from the server into a simple 2D array.
 *
 * The function expects an object with a `values` property, which is an array of objects.
 * Each of these nested objects should also have a `values` property containing an array of numbers.
 *
 * Example Input:
 * ```json
 * {
 *   "values": [
 *     { "values": [4, 8, 2, 3] },
 *     { "values": [2, 2, 2, 2] }
 *   ]
 * }
 * ```
 *
 * Example Output:
 * ```json
 * [
 *   [4, 8, 2, 3],
 *   [2, 2, 2, 2]
 * ]
 * ```
 *
 * @param data - The raw scene data object. Can be null or undefined.
 * @returns A 2D array of numbers, or an empty array if the input is invalid or empty.
 */
export function transformSceneData(data: RawSceneData | null | undefined): number[][] {
  if (!data || !Array.isArray(data.values)) {
    return [];
  }

  return data.values.map((row) => (row && Array.isArray(row.values) ? row.values : []));
}
