import type { ImageStringManifestV1 } from "../../src/image-string/index.js";

export const imageStringManifestFixture = {
  version: 1,
  kind: "image-string",
  id: "neutral-glyphs",
  metrics: { lineHeight: 14, letterSpacing: 2 },
  glyphs: {
    "+": {
      path: "assets/u002b.png",
      size: { width: 3, height: 8 },
      offset: { x: 0, y: 3 },
    },
    "0": {
      path: "assets/u0030.png",
      size: { width: 8, height: 10 },
      offset: { x: 0, y: 2 },
    },
    "1": {
      path: "assets/u0031.webp",
      size: { width: 4, height: 9 },
      offset: { x: 0, y: 3 },
    },
    "😀": {
      path: "assets/u1f600.png",
      size: { width: 7, height: 7 },
      offset: { x: 0, y: 4 },
    },
  },
  fixedAdvanceGroups: [
    { id: "digits", characters: ["0", "1"], advanceWidth: 8, align: "center" },
  ],
} satisfies ImageStringManifestV1;

export function cloneFixture(): unknown {
  return structuredClone(imageStringManifestFixture);
}
