import { createNormalizedGlbLoader } from "./model-loader.js";

export const loadCastleSpellbookModel = createNormalizedGlbLoader({
  url: "./models/castle-spellbook.glb",
  rootName: "castle-spellbook-glb",
  height: 0.5,
  verticalAnchor: "center",
});
