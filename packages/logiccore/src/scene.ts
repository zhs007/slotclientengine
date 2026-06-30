import { SceneMatrix } from "./types";
import {
  assertArray,
  assertInteger,
  assertRecord,
  freezeArray,
} from "./validation";

export function parseScene(scene: unknown, path = "scene"): SceneMatrix {
  const sceneRecord = assertRecord(scene, path);
  const columns = assertArray(sceneRecord.values, `${path}.values`).map(
    (column, x) => {
      const columnRecord = assertRecord(column, `${path}.values[${x}]`);

      return freezeArray(
        assertArray(columnRecord.values, `${path}.values[${x}].values`).map(
          (symbol, y) =>
            assertInteger(symbol, `${path}.values[${x}].values[${y}]`),
        ),
      );
    },
  );

  return freezeArray(columns);
}
