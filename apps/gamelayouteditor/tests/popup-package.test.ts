import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import { importPopupPackageZip } from "../src/io/imported-popup-package.js";
import {
  cloneEditorProject,
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("gamelayout popup dependency", () => {
  it("strictly imports a self-contained popup and round-trips binding placement", () => {
    const popup = popupFiles();
    const imported = importPopupPackageZip(
      createDeterministicZip(popup, {
        pathPolicy: { requireLowercase: true },
      }),
    );
    expect(imported.manifest.id).toBe("fixture-popup");
    const prefix = "dependencies/popups/fixture-popup/";
    const layoutAssets = new Map(assetBytes);
    for (const [path, bytes] of imported.files)
      layoutAssets.set(`${prefix}${path}`, bytes);
    const manifest = {
      ...imageManifest,
      popups: {
        celebration: {
          type: "award-celebration" as const,
          manifest: `${prefix}popup.manifest.json`,
          placements: { default: { x: 12, y: -8, scale: 0.9 } },
        },
      },
    };
    const project = manifestToEditorProject(manifest, layoutAssets);
    expect(project.popupDependency).toMatchObject({
      packageId: "fixture-popup",
      bindingId: "celebration",
      placements: { default: { x: 12, y: -8, scale: 0.9 } },
    });
    expect(project.assets.has(`${prefix}popup.manifest.json`)).toBe(false);
    expect(editorProjectToManifest(project).popups).toEqual(manifest.popups);
    const clone = cloneEditorProject(project);
    clone.popupDependency!.files.get("popup.manifest.json")![0] = 0;
    expect(
      project.popupDependency!.files.get("popup.manifest.json")![0],
    ).not.toBe(0);
  });

  it("rejects missing sentinel, orphan entries and unknown manifest fields", () => {
    expect(() =>
      importPopupPackageZip(
        createDeterministicZip(new Map([["x.txt", new Uint8Array([1])]])),
      ),
    ).toThrow(/sentinel/);
    const orphan = popupFiles();
    orphan.set("orphan.bin", new Uint8Array([1]));
    expect(() => importPopupPackageZip(createDeterministicZip(orphan))).toThrow(
      /exactly match/,
    );
    const invalid = popupFiles();
    const manifest = JSON.parse(
      new TextDecoder().decode(invalid.get("popup.manifest.json")),
    );
    manifest.extra = true;
    invalid.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );
    expect(() =>
      importPopupPackageZip(createDeterministicZip(invalid)),
    ).toThrow(/unknown key/);
  });
});

function popupFiles() {
  const characters = [..."$,.0123456789"];
  const glyphs = Object.fromEntries(
    characters.map((character, index) => [
      character,
      {
        path: `assets/g${index}.png`,
        size: { width: 1, height: 1 },
        offset: { x: 0, y: 0 },
      },
    ]),
  );
  const amountLayer = {
    id: "amount",
    kind: "image-string",
    order: 0,
    resource: "amount",
    binding: "win-amount",
    anchor: { x: 0.5, y: 0.5 },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const popup = {
    version: 1,
    kind: "popup",
    id: "fixture-popup",
    type: "award-celebration",
    designViewport: { width: 100, height: 100 },
    amountFormat: {
      rawScale: 100,
      fractionDigits: 2,
      useGrouping: true,
      groupSeparator: ",",
      decimalSeparator: ".",
      prefix: "$",
      suffix: "",
      rounding: "floor",
    },
    resources: {
      amount: {
        kind: "image-string",
        manifest:
          "dependencies/image-strings/amount/image-string.manifest.json",
      },
    },
    awardCelebration: {
      base: { countDurationSeconds: 1, layers: [amountLayer] },
      standard: { countDurationSeconds: 1, layers: [amountLayer] },
      celebrationTiers: [
        {
          id: "bigwin",
          thresholdMultiplier: 15,
          countDurationSeconds: 1,
          layers: [amountLayer],
        },
        {
          id: "superwin",
          thresholdMultiplier: 30,
          countDurationSeconds: 1,
          layers: [amountLayer],
        },
        {
          id: "megawin",
          thresholdMultiplier: 50,
          countDurationSeconds: 1,
          layers: [amountLayer],
        },
      ],
    },
  };
  const nested = {
    version: 1,
    kind: "image-string",
    id: "amount",
    metrics: { lineHeight: 1, letterSpacing: 0 },
    glyphs,
    fixedAdvanceGroups: [],
  };
  const files = new Map<string, Uint8Array>([
    ["popup.manifest.json", new TextEncoder().encode(JSON.stringify(popup))],
    [
      "dependencies/image-strings/amount/image-string.manifest.json",
      new TextEncoder().encode(JSON.stringify(nested)),
    ],
  ]);
  characters.forEach((_, index) =>
    files.set(
      `dependencies/image-strings/amount/assets/g${index}.png`,
      new Uint8Array([index]),
    ),
  );
  return files;
}
