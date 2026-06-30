import type { SceneMatrix } from "@slotclientengine/gameframeworks";

export const GAME003_DEFAULT_SCENE = Object.freeze([
  Object.freeze([5, 8, 9, 12, 1]),
  Object.freeze([3, 1, 8, 4, 10]),
  Object.freeze([9, 10, 3, 11, 6]),
  Object.freeze([22, 5, 7, 5, 1]),
  Object.freeze([6, 5, 7, 2, 8]),
]) satisfies SceneMatrix;

export const GAME003_SPIN_SCENE = Object.freeze([
  Object.freeze([8, 9, 12, 1, 1]),
  Object.freeze([10, 11, 11, 11, 6]),
  Object.freeze([1, 1, 10, 10, 5]),
  Object.freeze([8, 6, 3, 5, 6]),
  Object.freeze([2, 6, 4, 8, 5]),
]) satisfies SceneMatrix;

export const GAME003_WIN_SPIN_SCENE = Object.freeze([
  Object.freeze([8, 7, 3, 1, 4]),
  Object.freeze([6, 10, 4, 3, 1]),
  Object.freeze([4, 6, 6, 6, 3]),
  Object.freeze([22, 5, 7, 5, 1]),
  Object.freeze([7, 2, 6, 8, 4]),
]) satisfies SceneMatrix;

export const GAME003_WIN_RESULTS = Object.freeze([
  Object.freeze({
    pos: Object.freeze([0, 4, 1, 2, 2, 0]),
    symbol: 4,
    coinWin: 10,
    cashWin: 100,
    symbolNums: 3,
  }),
  Object.freeze({
    pos: Object.freeze([0, 2, 1, 3, 2, 4]),
    symbol: 3,
    coinWin: 15,
    cashWin: 150,
    symbolNums: 3,
  }),
]);

export const GAME003_SAMPLE_RANDOM_NUMBERS = Object.freeze([0, 0, 0, 0, 0]);

export const GAME003_SAMPLE_SPIN_RESULT = Object.freeze({
  gmi: Object.freeze({
    defaultScene: toSgc7Scene(GAME003_DEFAULT_SCENE),
    replyPlay: Object.freeze({
      randomNumbers: GAME003_SAMPLE_RANDOM_NUMBERS,
      results: Object.freeze([
        Object.freeze({
          coinWin: 0,
          cashWin: 0,
          clientData: Object.freeze({
            scenes: Object.freeze([toSgc7Scene(GAME003_SPIN_SCENE)]),
            otherScenes: Object.freeze([]),
            results: Object.freeze([]),
            curGameMod: "basic",
            curGameModParam: Object.freeze({
              historyComponents: Object.freeze(["bg-spin"]),
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
              }),
              mapVals: Object.freeze({}),
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
  totalwin: 0,
  results: 1,
});

export const GAME003_SAMPLE_WIN_SPIN_RESULT = Object.freeze({
  gmi: Object.freeze({
    defaultScene: toSgc7Scene(GAME003_DEFAULT_SCENE),
    replyPlay: Object.freeze({
      randomNumbers: GAME003_SAMPLE_RANDOM_NUMBERS,
      results: Object.freeze([
        Object.freeze({
          coinWin: 25,
          cashWin: 250,
          clientData: Object.freeze({
            scenes: Object.freeze([toSgc7Scene(GAME003_WIN_SPIN_SCENE)]),
            otherScenes: Object.freeze([]),
            results: GAME003_WIN_RESULTS,
            curGameMod: "basic",
            curGameModParam: Object.freeze({
              historyComponents: Object.freeze(["bg-spin", "bg-wins"]),
              historyComponentsEx: Object.freeze(["bg-spin", "bg-wins"]),
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
                "bg-wins": Object.freeze({
                  basicComponentData: Object.freeze({
                    usedScenes: Object.freeze([]),
                    usedOtherScenes: Object.freeze([]),
                    usedResults: Object.freeze([0, 1]),
                    usedPrizeScenes: Object.freeze([]),
                    srcScenes: Object.freeze([]),
                    pos: Object.freeze([]),
                    mapUsedSPGrid: Object.freeze({}),
                    coinWin: 25,
                    cashWin: 250,
                    targetScene: 0,
                    runIndex: 0,
                    output: 0,
                    strOutput: "",
                  }),
                  nextComponent: "",
                  symbolNum: 6,
                  wildNum: 0,
                  respinNum: 0,
                  wins: 25,
                  winMulti: 1,
                }),
              }),
              mapVals: Object.freeze({}),
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
  totalwin: 250,
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
