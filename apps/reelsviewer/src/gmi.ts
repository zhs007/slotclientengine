import { createGameLogic, type LogicGameConfig, type SceneMatrix } from "@slotclientengine/logiccore";
import rawGmiMessage from "../../../packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json";
import { DEFAULT_REELS_VIEWER_CONFIG } from "./reels-config.js";

export { rawGmiMessage };

export function getDefaultGmiScene(): SceneMatrix {
  return createGameLogic(rawGmiMessage).getStep(0).getScene(0);
}

export function getDefaultFinalYs(gameConfig: LogicGameConfig): readonly number[] {
  return gameConfig.getStopYCoordinates({
    reelsName: DEFAULT_REELS_VIEWER_CONFIG.reelsName,
    sceneName: "step0.scene0",
    scene: getDefaultGmiScene()
  });
}
