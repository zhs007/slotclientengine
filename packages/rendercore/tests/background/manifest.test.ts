import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createSpineBackgroundResource,
  parseSpineBackgroundManifest,
} from "../../src/background/index.js";

const ASSET_ROOT = resolve(__dirname, "../../../../assets/game002-s3");
const REAL_MANIFEST = JSON.parse(
  readFileSync(resolve(ASSET_ROOT, "background.manifest.json"), "utf8"),
) as unknown;
const REAL_SKELETON = JSON.parse(
  readFileSync(resolve(ASSET_ROOT, "BG.json"), "utf8"),
) as unknown;
const REAL_ATLAS = readFileSync(resolve(ASSET_ROOT, "BG.atlas"), "utf8");
const TEXTURE_PAGES = [
  "BG.png",
  "BG_2.png",
  "BG_3.png",
  "BG_4.png",
  "BG_5.png",
  "BG_6.png",
  "BG_7.png",
  "BG_8.png",
] as const;

describe("Spine background manifest", () => {
  it("parses and freezes the exact game002 art, resource and state contract", () => {
    const manifest = parseSpineBackgroundManifest(REAL_MANIFEST);

    expect(manifest).toMatchObject({
      version: 1,
      kind: "spine",
      artSize: { width: 2000, height: 2000 },
      adaptation: {
        mode: "maximized-focus",
        focusRect: { x: 577.5, y: 270, width: 840, height: 1200 },
      },
      resource: {
        skeleton: "./BG.json",
        atlas: "./BG.atlas",
        transform: { x: 1000, y: 1000, scale: 1 },
      },
      initialState: "BaseGame",
      states: {
        BaseGame: { animation: "BG" },
        FreeGame: { animation: "FG" },
      },
      transitions: [
        { from: "BaseGame", to: "FreeGame", animation: "BG_FG" },
        { from: "FreeGame", to: "BaseGame", animation: "FG_BG" },
      ],
    });
    expect(Object.keys(manifest.resource.textures)).toEqual(TEXTURE_PAGES);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.states)).toBe(true);
    expect(Object.isFrozen(manifest.resource.textures)).toBe(true);
  });

  it.each([
    ["top-level unknown field", (value: any) => (value.extra = true)],
    ["wrong version", (value: any) => (value.version = 2)],
    ["wrong kind", (value: any) => (value.kind = "static")],
    ["wrong adaptation mode", (value: any) => (value.adaptation.mode = "fit")],
    ["non-finite art size", (value: any) => (value.artSize.width = Number.NaN)],
    ["zero art size", (value: any) => (value.artSize.height = 0)],
    [
      "focus outside art",
      (value: any) => (value.adaptation.focusRect.x = 1900),
    ],
    ["absolute path", (value: any) => (value.resource.skeleton = "/BG.json")],
    ["escaping path", (value: any) => (value.resource.atlas = "../BG.atlas")],
    [
      "duplicate texture path",
      (value: any) => (value.resource.textures["BG_2.png"] = "./BG.png"),
    ],
    ["unknown initial state", (value: any) => (value.initialState = "Unknown")],
    [
      "duplicate animation",
      (value: any) => (value.states.FreeGame.animation = "BG"),
    ],
    [
      "unknown transition state",
      (value: any) => (value.transitions[0].to = "Unknown"),
    ],
    ["self transition", (value: any) => (value.transitions[0].to = "BaseGame")],
    [
      "duplicate directed transition",
      (value: any) => value.transitions.push({ ...value.transitions[0] }),
    ],
    [
      "transition unknown field",
      (value: any) => (value.transitions[0].loop = false),
    ],
  ])("rejects %s", (_label, mutate) => {
    const value = structuredClone(REAL_MANIFEST);
    mutate(value);
    expect(() => parseSpineBackgroundManifest(value)).toThrow();
  });

  it("validates the real 4.3.23 skeleton, four animations and eight-page atlas", () => {
    const resource = createRealResource();

    expect(resource.atlasPages).toEqual(TEXTURE_PAGES);
    expect(resource.manifest.resource.transform).toEqual({
      x: 1000,
      y: 1000,
      scale: 1,
    });
    expect(readAnimationDuration(REAL_SKELETON, "BG")).toBe(15);
    expect(readAnimationDuration(REAL_SKELETON, "FG")).toBe(15);
    expect(readAnimationDuration(REAL_SKELETON, "BG_FG")).toBe(1.6);
    expect(readAnimationDuration(REAL_SKELETON, "FG_BG")).toBe(1.6);
  });

  it("rejects version, animation, atlas-page and module-closure drift", () => {
    const versionMismatch = structuredClone(REAL_SKELETON) as any;
    versionMismatch.skeleton.spine = "4.2.43";
    expect(() => createRealResource({ skeleton: versionMismatch })).toThrow(
      /supported version is 4\.3/,
    );

    const animationMismatch = structuredClone(REAL_MANIFEST) as any;
    animationMismatch.states.BaseGame.animation = "bg";
    expect(() => createRealResource({ manifest: animationMismatch })).toThrow(
      /animation "bg" was not found/,
    );

    const missingTextureModules = createTextureModules();
    delete missingTextureModules["/fixture/BG_8.png"];
    expect(() =>
      createRealResource({ textureModules: missingTextureModules }),
    ).toThrow(/BG_8\.png.*missing/i);

    const duplicateTextureUrls = createTextureModules();
    duplicateTextureUrls["/fixture/BG_2.png"] = "/assets/BG.png";
    expect(() =>
      createRealResource({ textureModules: duplicateTextureUrls }),
    ).toThrow(/URL is used by more than one atlas page/);

    const extraTextureModules = createTextureModules();
    extraTextureModules["/fixture/extra.png"] = "/assets/extra.png";
    expect(() =>
      createRealResource({ textureModules: extraTextureModules }),
    ).toThrow(/unreferenced resource.*extra\.png/);

    const missingPageAtlas = REAL_ATLAS.replace(/\nBG_8\.png\n[\s\S]*$/u, "\n");
    expect(() => createRealResource({ atlas: missingPageAtlas })).toThrow(
      /pages must exactly match texture pages/,
    );
  });

  it("confirms every WebP-in-.png atlas page is decodable at its declared size", async () => {
    const declaredSizes = new Map(
      [...REAL_ATLAS.matchAll(/^([^\s].*\.png)\r?\nsize:(\d+),(\d+)/gmu)].map(
        (match) => [match[1], [Number(match[2]), Number(match[3])]],
      ),
    );
    for (const page of TEXTURE_PAGES) {
      const bytes = readFileSync(resolve(ASSET_ROOT, page));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      const metadata = await sharp(bytes).metadata();
      expect([metadata.width, metadata.height]).toEqual(
        declaredSizes.get(page),
      );
    }
  });
});

function createRealResource(
  overrides: {
    readonly manifest?: unknown;
    readonly skeleton?: unknown;
    readonly atlas?: string;
    readonly textureModules?: Record<string, string>;
  } = {},
) {
  return createSpineBackgroundResource({
    manifest: overrides.manifest ?? REAL_MANIFEST,
    skeletonModules: {
      "/fixture/BG.json": overrides.skeleton ?? REAL_SKELETON,
    },
    atlasModules: { "/fixture/BG.atlas": overrides.atlas ?? REAL_ATLAS },
    textureModules: overrides.textureModules ?? createTextureModules(),
  });
}

function createTextureModules(): Record<string, string> {
  return Object.fromEntries(
    TEXTURE_PAGES.map((page) => [`/fixture/${page}`, `/assets/${page}`]),
  );
}

function readAnimationDuration(
  skeleton: unknown,
  animationName: string,
): number {
  const animations = (skeleton as any).animations;
  const animation = animations?.[animationName];
  if (!animation) {
    throw new Error(`missing animation ${animationName}`);
  }
  let duration = 0;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "time" && typeof child === "number") {
        duration = Math.max(duration, child);
      } else {
        visit(child);
      }
    }
  };
  visit(animation);
  return duration;
}
