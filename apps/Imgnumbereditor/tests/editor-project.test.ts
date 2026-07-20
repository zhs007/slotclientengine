import { describe, expect, it } from "vitest";
import {
  confirmGlyphMapping,
  createDefaultEditorProject,
  createManifestFromProject,
  deriveGlyphAssetPath,
  maxGroupVisualWidth,
  removeUnmappedImage,
  replaceGlyphImage,
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
    expect(deriveGlyphAssetPath("×", "image/png")).toBe("assets/u00d7.png");
    expect(deriveGlyphAssetPath("1", "image/webp")).toBe("assets/u0031.webp");
    expect(() => deriveGlyphAssetPath("\n", "image/png")).toThrow("Unicode");
  });

  it("commits explicit mapping without mutating the old project", () => {
    const image: UploadedImageDraft = {
      id: "upload-1",
      originalName: "0-1.png",
      mediaType: "image/png",
      bytes: NEUTRAL_PNG_BYTES,
      width: 8,
      height: 10,
      suggestedCharacter: "0",
    };
    const original = {
      ...createDefaultEditorProject(),
      unmappedFiles: new Map([[image.id, image]]),
    };
    const mapped = confirmGlyphMapping(original, image.id, "0");
    expect(original.unmappedFiles.size).toBe(1);
    expect(mapped.unmappedFiles.size).toBe(0);
    expect(mapped.glyphs.get("0")?.path).toBe("assets/u0030.png");
    expect(() => confirmGlyphMapping(mapped, image.id, "0")).toThrow();
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
      id: "replacement",
      originalName: "plus.webp",
      mediaType: "image/webp",
      bytes: NEUTRAL_PNG_BYTES,
      width: 5,
      height: 9,
      suggestedCharacter: "+",
    };
    const replaced = replaceGlyphImage(grouped, "+", replacement);
    expect(replaced.glyphs.get("+")?.path).toBe("assets/u002b.webp");
    expect(replaced.glyphs.get("+")?.width).toBe(5);
    const unmapped = unmapGlyph(replaced, "+");
    expect(unmapped.glyphs.has("+")).toBe(false);
    expect(unmapped.unmappedFiles.has("glyph-2b")).toBe(true);
    expect(removeUnmappedImage(unmapped, "glyph-2b").unmappedFiles.size).toBe(
      0,
    );
    expect(() => unmapGlyph(grouped, "0")).toThrow("fixed group");
  });
});
