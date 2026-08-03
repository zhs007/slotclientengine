import { describe, expect, it } from "vitest";
import {
  assertCanonicalUploadFileNames,
  assertCanonicalPackagePath,
  canonicalizeUploadFileName,
  deriveNodeId,
  rewriteAtlasPageNamesToLowercase,
} from "../src/io/filename-policy.js";

describe("filename policy", () => {
  it("canonicalizes ASCII names and derives the final-extension node id", () => {
    expect(canonicalizeUploadFileName("Mini.BK.PNG")).toBe("mini.bk.png");
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
    ).toThrow(/小写化后冲突/);
    expect(
      assertCanonicalUploadFileNames([
        { name: "Nearwin1.JSON" },
        { name: "Symbol.PNG" },
      ]),
    ).toEqual(
      new Map([
        ["Nearwin1.JSON", "nearwin1.json"],
        ["Symbol.PNG", "symbol.png"],
      ]),
    );
    expect(() => assertCanonicalPackagePath("assets/../x.png")).toThrow(
      /非法 segment/,
    );
    expect(() => assertCanonicalPackagePath("assets/a b.png")).toThrow(
      /非法 segment/,
    );
  });

  it("rewrites only parsed atlas page lines", () => {
    const result = rewriteAtlasPageNamesToLowercase(
      "PAGE.PNG\nsize: 4,4\nfilter: Linear,Linear\nregion\n  xy: 0,0\n",
    );
    expect(result.pages).toEqual(["page.png"]);
    expect(result.atlasText).toContain("page.png\nsize:");
    expect(result.atlasText).toContain("region\n  xy:");
    expect(() =>
      rewriteAtlasPageNamesToLowercase("region\n  xy: 0,0\n"),
    ).toThrow(/没有可识别/);
    expect(() =>
      rewriteAtlasPageNamesToLowercase(
        "PAGE.PNG\nsize: 4,4\n\npage.png\nsize: 4,4\n",
      ),
    ).toThrow(/发生冲突/);
  });
});
