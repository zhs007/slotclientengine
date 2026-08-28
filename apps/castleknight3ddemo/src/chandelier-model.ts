import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleChandelierModel = createNormalizedGlbLoader({
  url: "./models/castle-chandelier.glb",
  rootName: "castle-chandelier-glb",
  height: 4,
  verticalAnchor: "center",
});
