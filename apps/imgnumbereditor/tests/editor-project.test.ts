import { describe, expect, it } from "vitest";
import {
  confirmGlyphMapping,
  createDefaultEditorProject,
  createManifestFromProject,
  maxGroupVisualWidth,
  removeUnmappedImage,
  overwriteGlyphAsset,
  suggestCharacterFromFilename,
  unmapGlyph,
  type UploadedImageDraft,
} from "../src/model/editor-project.js";
import { NEUTRAL_PNG_BYTES } from "./fixtures/neutral-images.js";
import { projectFixture } from "./helpers.js";

describe("editor project", () => {
  it("creates the specified defaults and only suggests a filename mapping", () => {
    const project = createDefaultEditorProject();
    expect(project.id).toBe("new-image-string");
    expect(project.metrics).toEqual({ lineHeight: 64, letterSpacing: 0 });
    expect(suggestCharacterFromFilename("0-1.png")).toBe("0");
    expect(suggestCharacterFromFilename("12-1.png")).toBeNull();
    expect(suggestCharacterFromFilename("+-2.WEBP")).toBe("+");
  });

  it("commits explicit mapping without mutating the old project", () => {
    const image: UploadedImageDraft = {
      key: "0-1.png",
      sha256: "a".repeat(64),
      payloadPath: `assets/${"a".repeat(64)}.png`,
      mediaType: "image/png",
      byteLength: NEUTRAL_PNG_BYTES.byteLength,
      bytes: NEUTRAL_PNG_BYTES,
      width: 8,
      height: 10,
      suggestedCharacter: "0",
    };
    const original = {
      ...createDefaultEditorProject(),
      unmappedFiles: new Map([[image.key, image]]),
    };
    const mapped = confirmGlyphMapping(original, image.key, "0");
    expect(original.unmappedFiles.size).toBe(1);
    expect(mapped.unmappedFiles.size).toBe(0);
    expect(mapped.glyphs.get("0")?.key).toBe("0-1.png");
    expect(() => confirmGlyphMapping(mapped, image.key, "0")).toThrow();
  });

  it("derives a strict manifest and group width from real glyph metrics", () => {
    const project = projectFixture();
    expect(createManifestFromProject(project).glyphs["1"].size.width).toBe(4);
    expect(maxGroupVisualWidth(project, ["0", "1"])).toBe(8);
    expect(() => maxGroupVisualWidth(project, ["2"])).toThrow("不存在");
    expect(() => maxGroupVisualWidth(project, [])).toThrow("不得为空");
  });

  it("replaces dimensions and supports explicit unmap/delete", () => {
    const grouped = projectFixture();
    const replacement: UploadedImageDraft = {
      key: "replacement.png",
      sha256: "b".repeat(64),
      payloadPath: `assets/${"b".repeat(64)}.png`,
      mediaType: "image/png",
      byteLength: NEUTRAL_PNG_BYTES.byteLength,
      bytes: NEUTRAL_PNG_BYTES,
      width: 5,
      height: 9,
      suggestedCharacter: "+",
    };
    const replaced = overwriteGlyphAsset(grouped, "+", replacement);
    expect(replaced.glyphs.get("+")?.key).toBe("+-1.png");
    expect(replaced.glyphs.get("+")?.width).toBe(5);
    const unmapped = unmapGlyph(replaced, "+");
    expect(unmapped.glyphs.has("+")).toBe(false);
    expect(unmapped.unmappedFiles.has("+-1.png")).toBe(true);
    expect(removeUnmappedImage(unmapped, "+-1.png").unmappedFiles.size).toBe(0);
    expect(() => unmapGlyph(grouped, "0")).toThrow("fixed group");
  });
});
