import { describe, it, expect } from 'vitest';
import { transformSceneData } from '../src/utils';

describe('transformSceneData', () => {
  it('should transform valid scene data into a 2D array', () => {
    const sceneData = {
      values: [
        { values: [4, 8, 2, 3] },
        { values: [2, 2, 2, 2] },
        { values: [8, 3, 5, 7] },
        { values: [8, 5, 2, 2] },
        { values: [1, 8, 6, 5] },
      ],
      indexes: [],
      validRow: [],
    };
    const expected = [
      [4, 8, 2, 3],
      [2, 2, 2, 2],
      [8, 3, 5, 7],
      [8, 5, 2, 2],
      [1, 8, 6, 5],
    ];
    expect(transformSceneData(sceneData)).toEqual(expected);
  });

  it('should return an empty array if the input is null or undefined', () => {
    expect(transformSceneData(null)).toEqual([]);
    expect(transformSceneData(undefined)).toEqual([]);
  });

  it('should return an empty array if the top-level values property is not an array', () => {
    const sceneData = { values: 'not-an-array' } as any;
    expect(transformSceneData(sceneData)).toEqual([]);
  });

  it('should handle an empty top-level values array', () => {
    const sceneData = { values: [] };
    expect(transformSceneData(sceneData)).toEqual([]);
  });

  it('should handle rows where the nested values property is missing or not an array', () => {
    const sceneData = {
      values: [
        { values: [1, 2] },
        {} as any, // Missing nested 'values'
        { values: 'not-an-array' } as any,
        { values: [3, 4] },
      ],
    };
    const expected = [[1, 2], [], [], [3, 4]];
    expect(transformSceneData(sceneData)).toEqual(expected);
  });

  it('should handle rows with empty nested values arrays', () => {
    const sceneData = {
      values: [{ values: [1, 2] }, { values: [] }, { values: [3, 4] }],
    };
    const expected = [[1, 2], [], [3, 4]];
    expect(transformSceneData(sceneData)).toEqual(expected);
  });
});
