import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleSwordModel = createNormalizedGlbLoader({
  url: "./models/castle-sword.glb",
  rootName: "castle-sword-glb",
  height: 1.45,
  verticalAnchor: "center",
});
