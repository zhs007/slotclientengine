import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleWallModel = createNormalizedGlbLoader({
  url: "./models/castle-wall.glb",
  rootName: "castle-wall-glb",
  height: 8.8,
  verticalAnchor: "bottom",
});
