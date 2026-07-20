import {
  collectImageStringAssetPaths,
  ImageStringError,
  parseImageStringManifest,
  validateImageStringText,
} from "../../src/image-string/index.js";
import { describe, expect, it } from "vitest";
import { cloneFixture, imageStringManifestFixture } from "./fixtures.js";

describe("image-string manifest", () => {
  it("parses, freezes and collects an exact sorted closure", () => {
    const manifest = parseImageStringManifest(cloneFixture());
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.glyphs["0"].size)).toBe(true);
    expect(collectImageStringAssetPaths(manifest)).toEqual([
      "assets/u002b.png",
      "assets/u0030.png",
      "assets/u0031.webp",
      "assets/u1f600.png",
    ]);
  });

  it.each([
    ["unknown field", (value: any) => (value.extra = true), "未知"],
    ["wrong kind", (value: any) => (value.kind = "image-number"), "kind"],
    ["bad id", (value: any) => (value.id = "Bad_ID"), "id"],
    ["empty glyphs", (value: any) => (value.glyphs = {}), "glyphs"],
    [
      "NFD glyph",
      (value: any) => {
        value.glyphs["e\u0301"] = value.glyphs["0"];
        delete value.glyphs["0"];
      },
      "NFC",
    ],
    [
      "control glyph",
      (value: any) => {
        value.glyphs["\n"] = value.glyphs["0"];
        delete value.glyphs["0"];
      },
      "控制",
    ],
    ["bad path", (value: any) => (value.glyphs["0"].path = "../x.png"), "path"],
    [
      "bad extension",
      (value: any) => (value.glyphs["0"].path = "assets/x.jpg"),
      "扩展名",
    ],
    [
      "vertical overflow",
      (value: any) => (value.glyphs["0"].offset.y = 9),
      "vertical",
    ],
    [
      "unknown member",
      (value: any) => value.fixedAdvanceGroups[0].characters.push("2"),
      "不存在",
    ],
    [
      "small advance",
      (value: any) => (value.fixedAdvanceGroups[0].advanceWidth = 6),
      "容纳",
    ],
    [
      "unsorted group",
      (value: any) => (value.fixedAdvanceGroups[0].characters = ["1", "0"]),
      "排序",
    ],
  ])("rejects %s", (_name, mutate, message) => {
    const value = cloneFixture();
    mutate(value);
    expect(() => parseImageStringManifest(value)).toThrow(message);
  });

  it("allows exact content path reuse across glyph identities", () => {
    const value = cloneFixture() as typeof imageStringManifestFixture;
    value.glyphs["1"].path = value.glyphs["0"].path;
    expect(parseImageStringManifest(value).glyphs["1"].path).toBe(
      value.glyphs["0"].path,
    );
  });

  it("validates scalar, NFC, control and missing glyph text", () => {
    expect(validateImageStringText("😀01", imageStringManifestFixture)).toEqual(
      ["😀", "0", "1"],
    );
    expect(() =>
      validateImageStringText("e\u0301", imageStringManifestFixture),
    ).toThrow("NFC");
    expect(() =>
      validateImageStringText("0\t1", imageStringManifestFixture),
    ).toThrow("控制");
    expect(() =>
      validateImageStringText("2", imageStringManifestFixture),
    ).toThrow(ImageStringError);
    expect(() =>
      validateImageStringText("\ud800", imageStringManifestFixture),
    ).toThrow("surrogate");
  });
});
