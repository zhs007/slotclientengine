import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleThroneDaisModel = createNormalizedGlbLoader({
  url: "./models/castle-throne-dais.glb",
  rootName: "castle-throne-dais-glb",
  height: 1.92,
  verticalAnchor: "bottom",
});
