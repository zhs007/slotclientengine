import { describe, expect, it } from "vitest";
import {
  assertCanonicalUploadFileNames,
  assertCanonicalPackagePath,
  canonicalizeUploadFileName,
  deriveNodeId,
} from "../src/io/filename-policy.js";

describe("filename policy", () => {
  it("canonicalizes ASCII names and derives the final-extension node id", () => {
    expect(canonicalizeUploadFileName("Mini.BK.PNG")).toBe("Mini.BK.PNG");
    expect(deriveNodeId("Mini.BK.PNG")).toBe("mini.bk");
    expect(deriveNodeId("background")).toBe("background");
    expect(() => canonicalizeUploadFileName("大奖.png")).toThrow(/ASCII/);
    expect(() => deriveNodeId(".PNG")).toThrow(/节点 id/);
    expect(() =>
      assertCanonicalUploadFileNames([
        { name: "Nearwin1.JSON" },
        { name: "中文.png" },
      ]),
    ).toThrow(/ASCII/);
    expect(() =>
      assertCanonicalUploadFileNames([
        { name: "Nearwin1.JSON" },
        { name: "nearwin1.json" },
      ]),
    ).toThrow(/大小写别名冲突/);
    expect(
      assertCanonicalUploadFileNames([
        { name: "Nearwin1.JSON" },
        { name: "Symbol.PNG" },
      ]),
    ).toEqual(
      new Map([
        ["Nearwin1.JSON", "Nearwin1.JSON"],
        ["Symbol.PNG", "Symbol.PNG"],
      ]),
    );
    expect(() => assertCanonicalPackagePath("assets/../x.png")).toThrow(
      /非法 segment/,
    );
    expect(() => assertCanonicalPackagePath("assets/a b.png")).toThrow(
      /非法 segment/,
    );
  });

  it.each([
    "Image.PNG",
    "Font.TTF",
    "Sound.MP3",
    "Video.MP4",
    "Data.JSON",
    "Spine.ATLAS",
    "Vni.JSON",
    "Symbols.ZIP",
    "Popup.ZIP",
  ])("preserves %s", (name) => {
    expect(canonicalizeUploadFileName(name)).toBe(name);
  });
});
