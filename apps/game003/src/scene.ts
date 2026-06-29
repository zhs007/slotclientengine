import type { SceneMatrix } from "@slotclientengine/gameframeworks";

export const GAME003_SCENE_WIDTH = 5;
export const GAME003_SCENE_HEIGHT = 5;

export function validateGame003Scene(
  scene: unknown,
  label: string,
): SceneMatrix {
  if (!Array.isArray(scene)) {
    throw new Error(`${label} must be a 5 x 5 scene matrix.`);
  }
  if (scene.length !== GAME003_SCENE_WIDTH) {
    throw new Error(`${label} width must be ${GAME003_SCENE_WIDTH}.`);
  }

  return Object.freeze(
    scene.map((column, x) => {
      if (!Array.isArray(column)) {
        throw new Error(`${label}[${x}] must be an array.`);
      }
      if (column.length !== GAME003_SCENE_HEIGHT) {
        throw new Error(
          `${label}[${x}] height must be ${GAME003_SCENE_HEIGHT}.`,
        );
      }
      return Object.freeze(
        column.map((code, y) => {
          if (!Number.isInteger(code) || code < 0) {
            throw new Error(
              `${label}[${x}][${y}] must be a non-negative integer symbol code.`,
            );
          }
          return code;
        }),
      );
    }),
  );
}

export function assertScenesEqual(
  actual: SceneMatrix,
  expected: SceneMatrix,
  label: string,
): void {
  if (!sceneEquals(actual, expected)) {
    throw new Error(`${label} does not match target scene.`);
  }
}

export function sceneEquals(left: SceneMatrix, right: SceneMatrix): boolean {
  return (
    left.length === right.length &&
    left.every(
      (leftColumn, x) =>
        leftColumn.length === right[x]?.length &&
        leftColumn.every((code, y) => code === right[x][y]),
    )
  );
}

export function getReplyPlayResultsLength(gmi: unknown): number {
  const gmiRecord = assertRecord(gmi, "gmi");
  const replyPlay = assertRecord(gmiRecord.replyPlay, "gmi.replyPlay");
  if (!Array.isArray(replyPlay.results)) {
    throw new Error("gmi.replyPlay.results must be an array.");
  }
  return replyPlay.results.length;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
