import { describe, expect, it } from "vitest";
import {
  createSpineBackgroundResource,
  parseSpineBackgroundManifest,
} from "../../src/background/index.js";

const TEXTURE_PAGES = ["background.png", "overlay.png"] as const;
const TEST_MANIFEST = {
  version: 1,
  kind: "spine",
  artSize: { width: 2000, height: 2000 },
  adaptation: {
    mode: "maximized-focus",
    focusRect: { x: 580, y: 277, width: 840, height: 1200 },
  },
  resource: {
    skeleton: "./background.json",
    atlas: "./background.atlas",
    textures: Object.fromEntries(
      TEXTURE_PAGES.map((page) => [page, `./${page}`]),
    ),
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
} as const;
const TEST_SPINE_SKELETON = {
  skeleton: { spine: "4.3.23" },
  animations: { BG: {}, FG: {}, BG_FG: {}, FG_BG: {} },
};
const TEST_SPINE_ATLAS = TEXTURE_PAGES.map(
  (page) => `${page}\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n`,
).join("\n");

describe("Spine background manifest", () => {
  it("parses and freezes a background resource and state contract", () => {
    const manifest = parseSpineBackgroundManifest(TEST_MANIFEST);

    expect(manifest).toMatchObject({
      version: 1,
      kind: "spine",
      artSize: { width: 2000, height: 2000 },
      adaptation: {
        mode: "maximized-focus",
        focusRect: { x: 580, y: 277, width: 840, height: 1200 },
      },
      resource: {
        skeleton: "./background.json",
        atlas: "./background.atlas",
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
      (value: any) =>
        (value.resource.textures["overlay.png"] = "./background.png"),
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
    const value = structuredClone(TEST_MANIFEST);
    mutate(value);
    expect(() => parseSpineBackgroundManifest(value)).toThrow();
  });

  it("uses explicit atlas-page keys without comparing mapped texture basenames", () => {
    const manifest = structuredClone(TEST_MANIFEST) as any;
    manifest.resource.textures["background.png"] =
      "./content-addressed-background.webp";
    const textureModules = createTextureModules();
    delete textureModules["/fixture/background.png"];
    textureModules["/fixture/content-addressed-background.webp"] =
      "/assets/physical-hash.webp";

    const resource = createTestResource({ manifest, textureModules });

    expect(resource.textureUrls["background.png"]).toBe(
      "/assets/physical-hash.webp",
    );
  });

  it("rejects version, animation, atlas-page and module-closure drift", () => {
    const versionMismatch = structuredClone(TEST_SPINE_SKELETON) as any;
    versionMismatch.skeleton.spine = "4.2.43";
    expect(() => createTestResource({ skeleton: versionMismatch })).toThrow(
      /supported version is 4\.3/,
    );

    const animationMismatch = structuredClone(TEST_MANIFEST) as any;
    animationMismatch.states.BaseGame.animation = "bg";
    expect(() => createTestResource({ manifest: animationMismatch })).toThrow(
      /animation "bg" was not found/,
    );

    const missingTextureModules = createTextureModules();
    delete missingTextureModules["/fixture/overlay.png"];
    expect(() =>
      createTestResource({ textureModules: missingTextureModules }),
    ).toThrow(/overlay\.png.*missing/i);

    const duplicateTextureUrls = createTextureModules();
    duplicateTextureUrls["/fixture/overlay.png"] = "/assets/background.png";
    expect(() =>
      createTestResource({ textureModules: duplicateTextureUrls }),
    ).toThrow(/URL is used by more than one atlas page/);

    const extraTextureModules = createTextureModules();
    extraTextureModules["/fixture/extra.png"] = "/assets/extra.png";
    expect(() =>
      createTestResource({ textureModules: extraTextureModules }),
    ).toThrow(/unreferenced resource.*extra\.png/);

    const missingPageAtlas = TEST_SPINE_ATLAS.replace(
      /\noverlay\.png\n[\s\S]*$/u,
      "\n",
    );
    expect(() => createTestResource({ atlas: missingPageAtlas })).toThrow(
      /pages must exactly match texture pages/,
    );
  });
});

function createTestResource(
  overrides: {
    readonly manifest?: unknown;
    readonly skeleton?: unknown;
    readonly atlas?: string;
    readonly textureModules?: Record<string, string>;
  } = {},
) {
  return createSpineBackgroundResource({
    manifest: overrides.manifest ?? TEST_MANIFEST,
    skeletonModules: {
      "/fixture/background.json": overrides.skeleton ?? TEST_SPINE_SKELETON,
    },
    atlasModules: {
      "/fixture/background.atlas": overrides.atlas ?? TEST_SPINE_ATLAS,
    },
    textureModules: overrides.textureModules ?? createTextureModules(),
  });
}

function createTextureModules(): Record<string, string> {
  return Object.fromEntries(
    TEXTURE_PAGES.map((page) => [`/fixture/${page}`, `/assets/${page}`]),
  );
}
