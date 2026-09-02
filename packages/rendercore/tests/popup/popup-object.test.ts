import { describe, expect, it } from "vitest";
import {
  collectPopupObjectPackagePaths,
  parsePopupManifest,
  parsePopupObjectManifest,
  popupObjectToSingleStateManifest,
} from "../../src/popup/data/index.js";
import { singleStatePopupFixture } from "./fixtures.js";

function objectManifest() {
  return {
    version: 1,
    kind: "popup-object",
    name: "tap-to-continue",
    resources: {
      "prompt.png": {
        kind: "image",
        path: "prompt.png",
        size: { width: 1, height: 1 },
      },
    },
    layers: [
      {
        id: "prompt-background",
        kind: "image",
        order: 0,
        resource: "prompt.png",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        alpha: 1,
        attachment: { kind: "popup-root" },
        anchor: { x: 0.5, y: 0.5 },
      },
    ],
  } as const;
}

describe("popup object", () => {
  it("parses a state-free standalone object and exact package closure", () => {
    const manifest = parsePopupObjectManifest(objectManifest());
    expect(manifest).not.toHaveProperty("adaptation");
    expect(manifest).not.toHaveProperty("backdrop");
    expect(manifest).not.toHaveProperty("type");
    expect(popupObjectToSingleStateManifest(manifest)).toMatchObject({
      version: 9,
      type: "single-state",
      backdrop: { enabled: false },
    });
    const files = new Map<string, Uint8Array>([
      [
        "popup-object.manifest.json",
        new TextEncoder().encode(JSON.stringify(manifest)),
      ],
      ["prompt.png", new Uint8Array([1])],
    ]);
    expect(collectPopupObjectPackagePaths({ manifest, files })).toEqual([
      "prompt.png",
    ]);
    files.set("orphan.png", new Uint8Array([2]));
    expect(() => collectPopupObjectPackagePaths({ manifest, files })).toThrow(
      /exactly match transitive closure/,
    );
  });

  it("allows object instances only in popup v9 and rejects nesting", () => {
    const host = structuredClone(singleStatePopupFixture()) as any;
    host.version = 9;
    host.singleState.layers[0].style.widthRange = {
      minWidth: 0,
      maxWidth: 0,
    };
    host.resources.object = {
      kind: "popup-object",
      manifest: "tap-to-continue-popup-object.manifest.json",
    };
    host.singleState.layers.push({
      id: "continue",
      kind: "popup-object",
      order: 1,
      resource: "object",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      alpha: 1,
      attachment: { kind: "popup-root" },
    });
    expect(parsePopupManifest(host)).toMatchObject({ version: 9 });
    host.version = 8;
    expect(() => parsePopupManifest(host)).toThrow(/requires popup v9/);

    const nested = structuredClone(objectManifest()) as any;
    nested.resources.child = {
      kind: "popup-object",
      manifest: "child-popup-object.manifest.json",
    };
    expect(() => parsePopupObjectManifest(nested)).toThrow(/cannot contain/);
  });
});
