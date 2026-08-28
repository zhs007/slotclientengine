import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastlePurplePotionModel = createNormalizedGlbLoader({
  url: "./models/castle-purple-potion.glb",
  rootName: "castle-purple-potion-glb",
  height: 1.05,
  verticalAnchor: "center",
});
