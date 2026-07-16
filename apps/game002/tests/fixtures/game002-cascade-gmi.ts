import type { SceneMatrix } from "@slotclientengine/gameframeworks";
import { toSgc7Scene, GAME002_SAMPLE_DEFAULT_SCENE } from "./game002-gmi.js";

export const GAME002_CASCADE_INITIAL_SCENE = Object.freeze([
  Object.freeze([6, 6, 3, 4, 4, 0, 3, 3, 2]),
  Object.freeze([3, 5, 4, 4, 5, 5, 1, 5, 5]),
  Object.freeze([1, 2, 2, 4, 5, 5, 2, 2, 5]),
  Object.freeze([1, 2, 3, 4, 5, 6, 1, 2, 3]),
  Object.freeze([8, 8, 4, 5, 6, 1, 2, 3, 4]),
  Object.freeze([8, 4, 5, 6, 1, 2, 3, 4, 5]),
]) satisfies SceneMatrix;

export const GAME002_CASCADE_REMOVED_SCENE = Object.freeze([
  Object.freeze([6, 6, 3, -1, -1, 0, 3, 3, 2]),
  Object.freeze([3, 5, -1, -1, -1, -1, 1, 5, 5]),
  Object.freeze([1, 2, 2, -1, -1, -1, 2, 2, 5]),
  GAME002_CASCADE_INITIAL_SCENE[3],
  Object.freeze([-1, -1, 4, 5, 6, 1, 2, 3, 4]),
  Object.freeze([-1, 4, 5, 6, 1, 2, 3, 4, 5]),
]) satisfies SceneMatrix;

export const GAME002_CASCADE_DROPDOWN_SCENE = Object.freeze([
  Object.freeze([-1, -1, 6, 6, 3, 0, 3, 3, 2]),
  Object.freeze([-1, -1, -1, -1, 3, 5, 1, 5, 5]),
  Object.freeze([-1, -1, -1, 1, 2, 2, 2, 2, 5]),
  GAME002_CASCADE_INITIAL_SCENE[3],
  Object.freeze([-1, -1, 4, 5, 6, 1, 2, 3, 4]),
  Object.freeze([-1, 4, 5, 6, 1, 2, 3, 4, 5]),
]) satisfies SceneMatrix;

export const GAME002_CASCADE_REFILL_SCENE = Object.freeze([
  Object.freeze([3, 4, 6, 6, 3, 0, 3, 3, 2]),
  Object.freeze([8, 5, 5, 3, 3, 5, 1, 5, 5]),
  Object.freeze([4, 2, 2, 1, 2, 2, 2, 2, 5]),
  GAME002_CASCADE_INITIAL_SCENE[3],
  Object.freeze([2, 3, 4, 5, 6, 1, 2, 3, 4]),
  Object.freeze([3, 4, 5, 6, 1, 2, 3, 4, 5]),
]) satisfies SceneMatrix;

export const GAME002_CASCADE_REFILL_POS = Object.freeze([
  0, 1, 0, 0, 1, 3, 1, 2, 1, 1, 1, 0, 2, 2, 2, 1, 2, 0, 4, 1, 4, 0, 5, 0,
]);

const INITIAL_VALUES = GAME002_CASCADE_INITIAL_SCENE.map((column, x) =>
  Object.freeze(
    column.map((_code, y) =>
      x === 4 && y === 0
        ? 1
        : x === 5 && y === 0
          ? 2
          : x === 4 && y === 1
            ? 5
            : 0,
    ),
  ),
);
const REMOVED_VALUES = holesLike(GAME002_CASCADE_REMOVED_SCENE);
const DROPDOWN_VALUES = holesLike(
  GAME002_CASCADE_DROPDOWN_SCENE,
  Object.freeze({ x: 4, y: 6, value: 17 }),
);
const REFILL_INTERMEDIATE_VALUES = zeros(GAME002_CASCADE_REFILL_SCENE);
const REFILL_FINAL_VALUES = GAME002_CASCADE_REFILL_SCENE.map((column, x) =>
  Object.freeze(column.map((_code, y) => (x === 1 && y === 0 ? 1 : 0))),
);

export const GAME002_CASCADE_GMI = Object.freeze({
  gmi: Object.freeze({
    defaultScene: toSgc7Scene(GAME002_SAMPLE_DEFAULT_SCENE),
    replyPlay: Object.freeze({
      randomNumbers: Object.freeze([1, 2, 3, 4, 5, 6]),
      results: Object.freeze([
        Object.freeze({
          coinWin: 29,
          cashWin: 290,
          clientData: Object.freeze({
            scenes: Object.freeze([
              toSgc7Scene(GAME002_CASCADE_INITIAL_SCENE),
              toSgc7Scene(GAME002_CASCADE_REMOVED_SCENE),
            ]),
            otherScenes: Object.freeze([
              toSgc7Scene(INITIAL_VALUES),
              toSgc7Scene(REMOVED_VALUES),
            ]),
            results: Object.freeze([
              Object.freeze({
                pos: Object.freeze([0, 3, 0, 4, 0, 5, 1, 3, 1, 2, 2, 3]),
                symbol: 4,
                cashWin: 0,
                cashWin64: 180,
                coinWin: 0,
                coinWin64: 18,
              }),
              Object.freeze({
                pos: Object.freeze([1, 4, 1, 5, 0, 5, 2, 5, 2, 4]),
                symbol: 5,
                cashWin: 0,
                cashWin64: 30,
                coinWin: 0,
                coinWin64: 3,
              }),
              Object.freeze({
                pos: Object.freeze([4, 0, 5, 0, 4, 1, 0, 5]),
                symbol: 8,
                cashWin: 0,
                cashWin64: 80,
                coinWin: 0,
                coinWin64: 8,
              }),
            ]),
            curGameMod: "basic",
            curGameModParam: Object.freeze({
              historyComponents: Object.freeze([
                "bg-spin",
                "bg-gencoins",
                "bg-win",
                "bg-remove",
              ]),
              historyComponentsEx: Object.freeze([]),
              mapComponents: Object.freeze({
                "bg-spin": component({ usedScenes: [0] }),
                "bg-gencoins": component({ usedOtherScenes: [0] }),
                "bg-win": Object.freeze({
                  basicComponentData: basic({
                    usedResults: [2, 0, 1],
                    pos: [
                      0, 3, 0, 4, 0, 5, 1, 3, 1, 2, 2, 3, 1, 4, 1, 5, 0, 5, 2,
                      5, 2, 4, 4, 0, 5, 0, 4, 1, 0, 5,
                    ],
                    cashWin: 290,
                    coinWin: 29,
                  }),
                  nextComponent: "bg-remove",
                }),
                "bg-remove": Object.freeze({
                  basicComponentData: basic({
                    usedScenes: [1],
                    usedOtherScenes: [1],
                  }),
                  removedNum: 12,
                }),
              }),
              firstComponent: "bg-spin",
              nextStepFirstComponent: "bg-respin",
            }),
          }),
        }),
        Object.freeze({
          coinWin: 0,
          cashWin: 0,
          clientData: Object.freeze({
            scenes: Object.freeze([
              toSgc7Scene(GAME002_CASCADE_REMOVED_SCENE),
              toSgc7Scene(GAME002_CASCADE_DROPDOWN_SCENE),
              toSgc7Scene(GAME002_CASCADE_REFILL_SCENE),
            ]),
            otherScenes: Object.freeze([
              toSgc7Scene(REMOVED_VALUES),
              toSgc7Scene(DROPDOWN_VALUES),
              toSgc7Scene(REFILL_INTERMEDIATE_VALUES),
              toSgc7Scene(REFILL_FINAL_VALUES),
            ]),
            results: Object.freeze([]),
            curGameMod: "basic",
            curGameModParam: Object.freeze({
              historyComponents: Object.freeze([
                "bg-respin",
                "bg-dropdown",
                "bg-refill",
                "bg-gencoins",
              ]),
              historyComponentsEx: Object.freeze([
                "bg-respin",
                "bg-dropdown",
                "bg-refill",
                "bg-gencoins",
                "bg-win",
              ]),
              mapComponents: Object.freeze({
                "bg-respin": component({}),
                "bg-dropdown": component({
                  usedScenes: [1],
                  usedOtherScenes: [1],
                  srcScenes: [0],
                }),
                "bg-refill": component({
                  usedScenes: [2],
                  usedOtherScenes: [2],
                  pos: GAME002_CASCADE_REFILL_POS,
                }),
                "bg-gencoins": component({ usedOtherScenes: [3] }),
                "bg-win": component({}),
              }),
              firstComponent: "bg-respin",
              nextStepFirstComponent: "",
            }),
          }),
        }),
      ]),
      finished: true,
    }),
  }),
  bet: 10,
  lines: 30,
  totalwin: 290,
  results: 2,
});

function component(options: Parameters<typeof basic>[0]) {
  return Object.freeze({ basicComponentData: basic(options) });
}

function basic(options: {
  readonly usedScenes?: readonly number[];
  readonly usedOtherScenes?: readonly number[];
  readonly usedResults?: readonly number[];
  readonly srcScenes?: readonly number[];
  readonly pos?: readonly number[];
  readonly cashWin?: number;
  readonly coinWin?: number;
}) {
  return Object.freeze({
    usedScenes: Object.freeze([...(options.usedScenes ?? [])]),
    usedOtherScenes: Object.freeze([...(options.usedOtherScenes ?? [])]),
    usedResults: Object.freeze([...(options.usedResults ?? [])]),
    srcScenes: Object.freeze([...(options.srcScenes ?? [])]),
    pos: Object.freeze([...(options.pos ?? [])]),
    cashWin: options.cashWin ?? 0,
    ...(options.coinWin === undefined ? {} : { coinWin: options.coinWin }),
  });
}

function zeros(scene: readonly (readonly number[])[]) {
  return Object.freeze(
    scene.map((column) => Object.freeze(column.map(() => 0))),
  );
}

function holesLike(
  scene: readonly (readonly number[])[],
  nonCnAuxiliaryValue?: {
    readonly x: number;
    readonly y: number;
    readonly value: number;
  },
) {
  return Object.freeze(
    scene.map((column, x) =>
      Object.freeze(
        column.map((code, y) =>
          code === -1
            ? -1
            : nonCnAuxiliaryValue?.x === x && nonCnAuxiliaryValue.y === y
              ? nonCnAuxiliaryValue.value
              : 0,
        ),
      ),
    ),
  );
}
