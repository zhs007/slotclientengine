import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleHelmetModel = createNormalizedGlbLoader({
  url: "./models/castle-helmet.glb",
  rootName: "castle-helmet-glb",
  height: 1.1,
  verticalAnchor: "center",
});
