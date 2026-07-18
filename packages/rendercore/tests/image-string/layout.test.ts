import { layoutImageString } from "../../src/image-string/index.js";
import { describe, expect, it } from "vitest";
import { imageStringManifestFixture } from "./fixtures.js";

describe("image-string layout", () => {
  it("mixes fixed and natural advances without stretching glyphs", () => {
    const snapshot = layoutImageString({
      manifest: imageStringManifestFixture,
      text: "+101",
      anchor: { x: 0, y: 1 },
    });
    expect(snapshot.logicalBounds).toEqual({
      x: 0,
      y: 0,
      width: 33,
      height: 14,
    });
    expect(snapshot.occurrences).toEqual([
      expect.objectContaining({
        character: "+",
        x: 0,
        width: 3,
        advance: 3,
        groupId: null,
      }),
      expect.objectContaining({
        character: "1",
        x: 7,
        width: 4,
        advance: 8,
        groupId: "digits",
      }),
      expect.objectContaining({
        character: "0",
        x: 15,
        width: 8,
        advance: 8,
        groupId: "digits",
      }),
      expect.objectContaining({
        character: "1",
        x: 27,
        width: 4,
        advance: 8,
        groupId: "digits",
      }),
    ]);
    expect(snapshot.anchor).toEqual({ x: 0, y: 1 });
    expect(snapshot.visualBounds).toEqual({
      x: 0,
      y: 2,
      width: 31,
      height: 10,
    });
  });

  it("handles one-code-point emoji and empty text", () => {
    expect(
      layoutImageString({ manifest: imageStringManifestFixture, text: "😀" })
        .glyphCount,
    ).toBe(1);
    const empty = layoutImageString({
      manifest: imageStringManifestFixture,
      text: "",
    });
    expect(empty.logicalBounds).toEqual({ x: 0, y: 0, width: 0, height: 14 });
    expect(empty.visualBounds).toBeNull();
  });

  it("rejects invalid anchors", () => {
    expect(() =>
      layoutImageString({
        manifest: imageStringManifestFixture,
        text: "0",
        anchor: { x: 2, y: 0 },
      }),
    ).toThrow("anchor");
  });
});
