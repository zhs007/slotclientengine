import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { importImageStringDependencyZip } from "../src/io/image-string-dependency.js";
import {
  createFromGameConfig,
  createFromImportedPackage,
  exportSnapshot,
  installImageStringDependency,
  removeImageStringDependency,
  setValuePresentation,
  setStateVisual,
  setSymbolImageStringNodes,
  uploadAssetBatch,
} from "../src/model/editor-project.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

describe("image-string logical dependency", () => {
  it("imports a strict standalone ZIP and vendors it atomically", async () => {
    const dependency = await importImageStringDependencyZip(createZip(), {
      decodeImage: async () => ({ width: 172, height: 130 }),
      loadTexture: async () => Texture.EMPTY,
    });
    const project = createProject();
    installImageStringDependency(project, dependency);

    expect(dependency.id).toBe("coin-digits");
    expect(
      project.imageStringDependencies.get("coin-digits")?.manifest,
    ).toBeDefined();
    expect(project.assetLibrary.records.has("image-string.manifest.json")).toBe(
      true,
    );
    expect(project.assetLibrary.records.has("0.png")).toBe(true);

    installImageStringDependency(project, dependency);
    expect(project.imageStringDependencies.size).toBe(1);
  });

  it("rejects same-id conflicts and protects referenced removal", async () => {
    const dependency = await importImageStringDependencyZip(createZip(), {
      decodeImage: async () => ({ width: 172, height: 130 }),
      loadTexture: async () => Texture.EMPTY,
    });
    const changed = {
      ...dependency,
      files: new Map(dependency.files),
    };
    changed.files.set("assets/0.png", new Uint8Array([9, 9]));
    const project = createProject();
    installImageStringDependency(project, dependency);
    expect(() => installImageStringDependency(project, changed)).toThrow(
      /冲突/,
    );

    setSymbolImageStringNodes(project, "A", [
      {
        name: "coin-value",
        resource: "./image-string.manifest.json",
        target: { state: "normal", slot: "Num" },
        initialText: "0",
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: true,
      },
    ]);
    expect(() => removeImageStringDependency(project, "coin-digits")).toThrow(
      /仍被引用/,
    );
    setSymbolImageStringNodes(project, "A", []);
    setValuePresentation(project, "A", createValuePresentation());
    expect(() => removeImageStringDependency(project, "coin-digits")).toThrow(
      /A\.valuePresentation\.text\.tiers\[0\]/,
    );
    setValuePresentation(project, "A", undefined);
    removeImageStringDependency(project, "coin-digits");
    expect(project.imageStringDependencies.size).toBe(0);
  });

  it("replaces explicitly and round-trips the vendored node closure", async () => {
    const dependency = await importImageStringDependencyZip(createZip(), {
      decodeImage: async () => ({ width: 172, height: 130 }),
      loadTexture: async () => Texture.EMPTY,
    });
    const project = createProject();
    expect(() =>
      installImageStringDependency(project, dependency, "replace"),
    ).toThrow(/不存在/);
    installImageStringDependency(project, dependency);
    installImageStringDependency(project, dependency, "replace");
    uploadAssetBatch(project, [
      { path: "H1.json", bytes: fixture("H1.json") },
      { path: "Symbol.atlas", bytes: fixture("Symbol.atlas") },
      { path: "Symbol.png", bytes: fixture("Symbol.png") },
    ]);
    setStateVisual(project, "A", "normal", {
      kind: "spine",
      baseVisual: { kind: "empty", width: 160, height: 160 },
      skeletonPath: "H1.json",
      atlasPath: "Symbol.atlas",
      texturePath: "Symbol.png",
      animationName: "Idle",
    });
    setSymbolImageStringNodes(project, "A", [
      {
        name: "coin-value",
        resource: "./image-string.manifest.json",
        target: { state: "normal", slot: "Number" },
        initialText: "0",
        anchor: { x: 0.5, y: 0.5 },
        transform: { x: 0, y: 0, scale: 1 },
        followSlotColor: true,
      },
    ]);
    setSymbolImageStringNodes(project, "A", []);
    setValuePresentation(project, "A", createValuePresentation());

    const exported = exportSnapshot(project);
    expect(exported.packageManifest.resources).toContain(
      "image-string.manifest.json",
    );
    expect(exported.packageManifest.resources).toContain("0.png");
    const imported = createFromImportedPackage({
      packageManifest: exported.packageManifest,
      rawGameConfig: exported.rawGameConfig,
      rawSymbolManifest: exported.symbolManifest,
      assets: exported.assets,
    });
    expect(imported.symbols.get("A")?.imageStringNodes).toEqual(
      project.symbols.get("A")?.imageStringNodes,
    );
    expect(imported.symbols.get("A")?.valuePresentation?.text).toEqual(
      createValuePresentation().text,
    );
    expect([...imported.imageStringDependencies]).toHaveLength(1);
    expect(exportSnapshot(imported).packageManifest.resources).toEqual(
      exported.packageManifest.resources,
    );
  });

  it("rejects missing glyph and extra files", async () => {
    const files = createFiles();
    files.delete("assets/0.png");
    await expect(
      importImageStringDependencyZip(createDeterministicZip(files), {
        decodeImage: async () => ({ width: 172, height: 130 }),
        loadTexture: async () => Texture.EMPTY,
      }),
    ).rejects.toThrow(/缺少/);
    const extra = createFiles();
    extra.set("assets/orphan.png", glyphBytes());
    await expect(
      importImageStringDependencyZip(createDeterministicZip(extra), {
        decodeImage: async () => ({ width: 172, height: 130 }),
        loadTexture: async () => Texture.EMPTY,
      }),
    ).rejects.toThrow(/额外|orphan/);
  });
});

function createProject() {
  return createFromGameConfig({
    fileName: "gameconfig.json",
    rawGameConfig: {
      paytable: { "0": { code: 0, symbol: "A", pays: [0] } },
      symbolCodes: { A: 0 },
      reels: { main: [[0]] },
    },
  });
}

function createValuePresentation() {
  return {
    defaultValues: [1],
    reelStates: {
      normal: { kind: "transparent" as const, width: 160, height: 160 },
      states: {},
    },
    tiers: [
      {
        animation: {
          kind: "spine" as const,
          skeleton: "./H1.json",
          atlas: "./Symbol.atlas",
          texture: "./Symbol.png",
          playback: {
            mode: "animation" as const,
            animationName: "Idle",
            loop: true,
          },
        },
      },
    ],
    text: {
      type: "image-string" as const,
      tiers: [
        {
          resource: "./image-string.manifest.json",
          slot: "Num",
          anchor: { x: 0.5, y: 0.5 },
          transform: { x: 0, y: 0, scale: 1 },
          followSlotColor: true,
        },
      ],
    },
  };
}

function createZip(): Uint8Array {
  return createDeterministicZip(createFiles(), {
    pathPolicy: { requireLowercase: true },
  });
}

function createFiles(): Map<string, Uint8Array> {
  return new Map([
    [
      "image-string.manifest.json",
      encode({
        version: 1,
        kind: "image-string",
        id: "coin-digits",
        metrics: { lineHeight: 130, letterSpacing: 0 },
        glyphs: {
          "0": {
            path: "assets/0.png",
            size: { width: 172, height: 130 },
            offset: { x: 0, y: 0 },
          },
          "1": {
            path: "assets/1.png",
            size: { width: 172, height: 130 },
            offset: { x: 0, y: 0 },
          },
        },
        fixedAdvanceGroups: [],
      }),
    ],
    ["assets/0.png", glyphBytes()],
    ["assets/1.png", glyphBytes()],
  ]);
}

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(resolve(process.cwd(), `../../assets/game003-s1/${name}`)),
  );
}

function glyphBytes(): Uint8Array {
  return fixture("H1.png");
}
