import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleBarrelModel = createNormalizedGlbLoader({
  url: "./models/castle-barrel.glb",
  rootName: "castle-barrel-glb",
  height: 1.36,
  verticalAnchor: "bottom",
});
