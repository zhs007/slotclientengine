import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleChestModel = createNormalizedGlbLoader({
  url: "./models/castle-chest.glb",
  rootName: "castle-chest-glb",
  height: 0.95,
  verticalAnchor: "center",
});
