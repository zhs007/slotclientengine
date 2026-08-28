import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleColumnModel = createNormalizedGlbLoader({
  url: "./models/castle-column.glb",
  rootName: "castle-column-glb",
  height: 5.22,
  verticalAnchor: "bottom",
});
