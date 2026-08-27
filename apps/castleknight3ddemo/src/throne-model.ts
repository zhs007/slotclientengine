import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleThroneModel = createNormalizedGlbLoader({
  url: "./models/castle-throne.glb",
  rootName: "castle-throne-glb",
  height: 3.82,
  verticalAnchor: "bottom",
});
