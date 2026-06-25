import type { SceneMatrix } from "@slotclientengine/gameframeworks";

export const GAME002_SAMPLE_DEFAULT_SCENE = Object.freeze([
  Object.freeze([2, 2, 3, 5, 5, 4, 4, 4, 3]),
  Object.freeze([5, 5, 2, 2, 2, 5, 5, 5, 0]),
  Object.freeze([6, 2, 5, 5, 5, 3, 8, 8, 8]),
  Object.freeze([1, 4, 4, 4, 8, 8, 2, 2, 4]),
  Object.freeze([6, 4, 2, 2, 4, 4, 8, 8, 8]),
  Object.freeze([1, 8, 8, 6, 6, 6, 1, 1, 2]),
]) satisfies SceneMatrix;

export const GAME002_SAMPLE_DEFAULT_STOP_Y = Object.freeze([
  61, 26, 12, 4, 19, 2,
]);

export const GAME002_SAMPLE_SPIN_SCENE = Object.freeze([
  Object.freeze([6, 2, 2, 3, 3, 2, 3, 3, 5]),
  Object.freeze([8, 8, 6, 6, 6, 8, 4, 4, 4]),
  Object.freeze([3, 3, 2, 2, 4, 4, 4, 8, 8]),
  Object.freeze([3, 3, 3, 1, 4, 4, 4, 8, 8]),
  Object.freeze([4, 6, 6, 6, 4, 4, 4, 8, 8]),
  Object.freeze([6, 1, 1, 5, 5, 5, 4, 4, 4]),
]) satisfies SceneMatrix;

export const GAME002_SAMPLE_RANDOM_NUMBERS = Object.freeze([
  51, 0, 28, 1, 70, 46,
]);

export const GAME002_SAMPLE_WIN_RESULTS = Object.freeze([
  Object.freeze({
    pos: Object.freeze([
      1, 6, 1, 7, 1, 8, 2, 6, 2, 5, 2, 4, 3, 4, 3, 5, 3, 6, 4, 6, 4, 5, 4, 4, 5,
      6, 5, 7, 5, 8,
    ]),
    type: 6,
    lineIndex: -1,
    symbol: 4,
    mul: 300,
    coinWin: 300,
    cashWin: 1500,
    otherMul: 1,
    wilds: 0,
    symbolNums: 15,
    value: 0,
  }),
  Object.freeze({
    pos: Object.freeze([2, 0, 2, 1, 3, 1, 3, 0, 3, 2]),
    type: 6,
    lineIndex: -1,
    symbol: 3,
    mul: 15,
    coinWin: 15,
    cashWin: 75,
    otherMul: 1,
    wilds: 0,
    symbolNums: 5,
    value: 0,
  }),
]);

export const GAME002_SAMPLE_SPIN_RESULT = Object.freeze({
  gmi: Object.freeze({
    defaultScene: toSgc7Scene(GAME002_SAMPLE_DEFAULT_SCENE),
    replyPlay: Object.freeze({
      randomNumbers: GAME002_SAMPLE_RANDOM_NUMBERS,
      results: Object.freeze([
        Object.freeze({
          coinWin: 315,
          cashWin: 1575,
          clientData: Object.freeze({
            scenes: Object.freeze([toSgc7Scene(GAME002_SAMPLE_SPIN_SCENE)]),
            otherScenes: Object.freeze([]),
            results: GAME002_SAMPLE_WIN_RESULTS,
            curGameMod: "basic",
            curGameModParam: Object.freeze({
              historyComponents: Object.freeze(["bg-spin", "bg-win"]),
              mapComponents: Object.freeze({
                "bg-spin": Object.freeze({
                  basicComponentData: Object.freeze({
                    usedScenes: Object.freeze([0]),
                    usedOtherScenes: Object.freeze([]),
                    usedResults: Object.freeze([]),
                    usedPrizeScenes: Object.freeze([]),
                    srcScenes: Object.freeze([]),
                    pos: Object.freeze([]),
                    mapUsedSPGrid: Object.freeze({}),
                    coinWin: 0,
                    cashWin: 0,
                    targetScene: 0,
                    runIndex: 0,
                    output: 0,
                    strOutput: "",
                  }),
                }),
                "bg-win": Object.freeze({
                  basicComponentData: Object.freeze({
                    usedScenes: Object.freeze([]),
                    usedOtherScenes: Object.freeze([]),
                    usedResults: Object.freeze([0, 1]),
                    usedPrizeScenes: Object.freeze([]),
                    srcScenes: Object.freeze([]),
                    pos: Object.freeze([
                      1, 6, 1, 7, 1, 8, 2, 6, 2, 5, 2, 4, 3, 4, 3, 5, 3, 6, 4,
                      6, 4, 5, 4, 4, 5, 6, 5, 7, 5, 8, 2, 0, 2, 1, 3, 1, 3, 0,
                      3, 2,
                    ]),
                    mapUsedSPGrid: Object.freeze({}),
                    coinWin: 315,
                    cashWin: 1575,
                    targetScene: 0,
                    runIndex: 0,
                    output: 0,
                    strOutput: "",
                  }),
                }),
              }),
              mapVals: Object.freeze({ "1": 6, "2": 9, "7": 0 }),
              mapStrVals: Object.freeze({}),
              firstComponent: "",
              nextStepFirstComponent: "",
            }),
            nextGameMod: "basic",
            curIndex: 0,
            parentIndex: 0,
            modType: "",
            prizeCoinWin: 0,
            prizeCashWin: 0,
            jackpotCoinWin: 0,
            jackpotCashWin: 0,
            jackpotType: 0,
          }),
        }),
      ]),
      finished: true,
      stake: null,
      playStartTime: 1782374745199,
    }),
  }),
  totalwin: 1575,
  results: 1,
});

export function toSgc7Scene(scene: readonly (readonly number[])[]) {
  return Object.freeze({
    values: Object.freeze(
      scene.map((column) =>
        Object.freeze({ values: Object.freeze([...column]) }),
      ),
    ),
    indexes: Object.freeze([]),
    validRow: Object.freeze([]),
  });
}
