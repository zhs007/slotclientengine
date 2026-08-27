import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleBenchModel = createNormalizedGlbLoader({
  url: "./models/castle-bench.glb",
  rootName: "castle-bench-glb",
  height: 1.05,
  verticalAnchor: "bottom",
});
