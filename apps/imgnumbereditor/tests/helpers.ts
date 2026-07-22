import { Texture } from "pixi.js";
import {
  freezeEditorProject,
  type GlyphDraft,
  type ImageStringEditorProject,
} from "../src/model/editor-project.js";
import { NEUTRAL_PNG_BYTES } from "./fixtures/neutral-images.js";

export function projectFixture(): ImageStringEditorProject {
  const glyphs = new Map<string, GlyphDraft>();
  for (const [character, width] of [
    ["0", 8],
    ["1", 4],
    ["+", 3],
  ] as const) {
    const bytes = new Uint8Array(NEUTRAL_PNG_BYTES.byteLength + 1);
    bytes.set(NEUTRAL_PNG_BYTES);
    bytes[bytes.length - 1] = character.codePointAt(0)!;
    const digest = character.codePointAt(0)!.toString(16).padStart(64, "0");
    const key = `${character}-1.png`;
    glyphs.set(character, {
      key,
      sha256: digest,
      payloadPath: `assets/${digest}.png`,
      mediaType: "image/png",
      byteLength: bytes.byteLength,
      bytes,
      width,
      height: 10,
      suggestedCharacter: character,
      character,
      offset: { x: 0, y: 2 },
    });
  }
  return freezeEditorProject({
    id: "neutral-library",
    metrics: { lineHeight: 14, letterSpacing: 1 },
    glyphs,
    fixedAdvanceGroups: [
      {
        id: "digits",
        characters: ["0", "1"],
        advanceWidth: 8,
        align: "center",
      },
    ],
    unmappedFiles: new Map(),
  });
}

export const validationOptions = {
  decodeImage: async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const character = String.fromCodePoint(bytes.at(-1)!);
    const width = new Map([
      ["0", 8],
      ["1", 4],
      ["+", 3],
    ]).get(character);
    if (!width) throw new Error(`unknown glyph payload ${character}`);
    return { width, height: 10 };
  },
  loadTexture: async () => new Texture({ source: Texture.EMPTY.source }),
};
