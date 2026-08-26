import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleBattleAxeModel = createNormalizedGlbLoader({
  url: "./models/castle-battle-axe.glb",
  rootName: "castle-battle-axe-glb",
  height: 1.8,
  verticalAnchor: "center",
});
