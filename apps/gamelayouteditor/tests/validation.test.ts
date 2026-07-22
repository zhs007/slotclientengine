import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  cloneEditorProject,
  createNewEditorProject,
  editorProjectToManifest,
  resetVariantGeometry,
  setVariantArtSizeDimension,
} from "../src/model/editor-project.js";
import {
  addLayerFromResource,
  assignBackgroundResource,
  clearBackground,
  deleteLayoutResource,
  getLayoutResourceReferences,
  moveLayer,
  importImageStringZip,
  rebindLayerResource,
  renameNode,
  removeLayer,
  replaceImageResource,
  replaceImageStringResource,
  replaceSpineResource,
  replaceVideoResource,
  setLayerVariantVisibility,
  setImageStringLayerAnchor,
  setImageStringLayerText,
  setNodeDefaultAnimation,
  uploadImageResource,
  uploadSpineResource,
  uploadVideoResource,
} from "../src/model/resource-commands.js";
import {
  addGameMode,
  bindGameModeBackground,
  createGameModeTransition,
  setGameModeTransitionKind,
  setGameModeTransitionAnimation,
  setGameModeTransitionEvent,
  setGameModeTransitionResource,
  setGameModeVideoTransitionFadeOut,
  setGameModeVideoTransitionResource,
} from "../src/model/game-mode-commands.js";

const decodeImage = async () => ({ width: 2000, height: 2000 });
const pngBytes = (seed = 0) =>
  new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, seed]);
const mp4Bytes = (seed = 0) =>
  new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, seed]);
const decodeVideo = async () => ({
  width: 1280,
  height: 720,
  durationSeconds: 3.625,
  hasAudio: true as const,
});

function spineFiles(
  options: {
    name?: string;
    animations?: readonly string[];
    bounds?: { width: number; height: number };
    version?: string;
    animationEvents?: Readonly<
      Record<
        string,
        readonly { readonly name: string; readonly time: number }[]
      >
    >;
  } = {},
): File[] {
  const name = options.name ?? "hero";
  const animations = options.animations ?? ["Idle", "Win"];
  return [
    new File(
      [
        JSON.stringify({
          skeleton: {
            spine: options.version ?? "4.3.23",
            ...(options.bounds ?? {}),
          },
          animations: Object.fromEntries(
            animations.map((item) => [
              item,
              options.animationEvents?.[item]
                ? { events: options.animationEvents[item] }
                : {},
            ]),
          ),
        }),
      ],
      `${name}.json`,
    ),
    new File(
      [`${name}.png\nsize: 1,1\nfilter: Linear,Linear\n`],
      `${name}.atlas`,
    ),
    new File([pngBytes(9)], `${name}.png`, { type: "image/png" }),
  ];
}

function imageStringZip(
  options: {
    readonly glyphs?: readonly string[];
    readonly id?: string;
  } = {},
): Uint8Array {
  const id = options.id ?? "digits";
  const glyphs = options.glyphs ?? ["0", "1"];
  const manifest = {
    version: 1,
    kind: "image-string",
    id,
    metrics: { lineHeight: 10, letterSpacing: 1 },
    glyphs: Object.fromEntries(
      glyphs.map((character) => [
        character,
        {
          path: `assets/${character}.png`,
          size: { width: 5, height: 10 },
          offset: { x: 0, y: 0 },
        },
      ]),
    ),
    fixedAdvanceGroups: [],
  };
  return zipSync(
    Object.fromEntries([
      ["image-string.manifest.json", strToU8(JSON.stringify(manifest))],
      ...glyphs.map(
        (character) =>
          [
            `assets/${character}.png`,
            new Uint8Array([character.charCodeAt(0)]),
          ] as const,
      ),
    ]),
  );
}

async function initializeProjectBackground(
  project: ReturnType<typeof createNewEditorProject>,
): Promise<void> {
  await uploadImageResource({
    project,
    file: new File([pngBytes(1)], "background.png"),
    decodeImage,
  });
  assignBackgroundResource({
    project,
    variant: "default",
    resourceId: "background.png",
    nodeId: "background",
  });
}

describe("filename-key layout resource commands", () => {
  it("imports, reuses and atomically edits a standalone image-string resource", async () => {
    const project = createNewEditorProject("maximized-focus");
    await initializeProjectBackground(project);
    const resource = await importImageStringZip({
      project,
      zipBytes: imageStringZip(),
    });
    expect(resource).toMatchObject({
      id: "image-string.manifest.json",
      kind: "image-string",
      manifestPath: "image-string.manifest.json",
    });
    expect(project.assets.has(resource.manifestPath)).toBe(true);
    addLayerFromResource({
      project,
      resourceId: "image-string.manifest.json",
      nodeId: "amount-a",
      variants: ["default"],
    });
    addLayerFromResource({
      project,
      resourceId: "image-string.manifest.json",
      nodeId: "amount-b",
      variants: ["default"],
    });
    setImageStringLayerText(project, "amount-a", "001");
    setImageStringLayerAnchor(project, "amount-a", { x: 0.25, y: 0.75 });
    expect(
      project.nodes.find((node) => node.id === "amount-a")?.imageString,
    ).toEqual({
      text: "001",
      anchor: { x: 0.25, y: 0.75 },
    });
    expect(
      project.nodes.find((node) => node.id === "amount-b")?.imageString?.text,
    ).toBe("");
    const beforeInvalidText = cloneEditorProject(project);
    expect(() => setImageStringLayerText(project, "amount-a", "2")).toThrow(
      /缺少 glyph/,
    );
    expect(() =>
      setImageStringLayerAnchor(project, "amount-a", { x: -0.1, y: 0.5 }),
    ).toThrow(/0\.\.1/);
    expect(() => setImageStringLayerText(project, "background", "0")).toThrow(
      /不是 image-string/,
    );
    expect(project).toEqual(beforeInvalidText);
    const exported = editorProjectToManifest(project);
    expect(
      exported.nodes.find((node) => node.id === "amount-a")?.resource,
    ).toMatchObject({ kind: "image-string", text: "001" });
    expect(() =>
      assignBackgroundResource({
        project,
        variant: "default",
        resourceId: "image-string.manifest.json",
      }),
    ).toThrow(/背景|尺寸/);
    const beforeReplacement = cloneEditorProject(project);
    await expect(
      replaceImageStringResource({
        project,
        resourceId: "image-string.manifest.json",
        zipBytes: imageStringZip({ glyphs: ["0"] }),
      }),
    ).rejects.toThrow(/缺少 glyph/);
    expect(project).toEqual(beforeReplacement);
  });

  it("configures directed scene transitions with exact animation events", async () => {
    const project = createNewEditorProject("maximized-focus");
    await initializeProjectBackground(project);
    await uploadSpineResource({
      project,
      files: spineFiles({
        animations: ["BG_FG", "NoEvent", "Duplicate"],
        animationEvents: {
          BG_FG: [{ name: "SwitchScene", time: 0.5 }],
          Duplicate: [
            { name: "SwitchScene", time: 0.2 },
            { name: "SwitchScene", time: 0.8 },
          ],
        },
      }),
    });
    addGameMode(project, "FreeGame");
    bindGameModeBackground(project, "FreeGame", "default", "background");
    createGameModeTransition(project, "BaseGame", "FreeGame");
    const transition = project.gameModes.transitions[0];
    setGameModeTransitionResource(project, transition, "hero.json");
    setGameModeTransitionAnimation(project, transition, "BG_FG");
    setGameModeTransitionEvent(project, transition, "SwitchScene");
    const manifest = editorProjectToManifest(project);
    expect(manifest.gameModes?.transitions).toEqual([
      expect.objectContaining({
        from: "BaseGame",
        to: "FreeGame",
        overlay: expect.objectContaining({
          animation: "BG_FG",
          switchEvent: "SwitchScene",
        }),
      }),
    ]);
    expect(() => deleteLayoutResource(project, "hero.json")).toThrow(
      /scene-transition/,
    );
    setGameModeTransitionAnimation(project, transition, "NoEvent");
    if (transition.kind !== "spine")
      throw new Error("expected Spine transition");
    expect(transition.switchEvent).toBe("");
    expect(() =>
      setGameModeTransitionEvent(project, transition, "SwitchScene"),
    ).toThrow(/恰好出现一次/);
    setGameModeTransitionAnimation(project, transition, "Duplicate");
    expect(() =>
      setGameModeTransitionEvent(project, transition, "SwitchScene"),
    ).toThrow(/实际 2 次/);
    expect(() => editorProjectToManifest(project)).toThrow(/switch event/);
  });

  it("uploads owned MP4 atomically and exports a strict video transition branch", async () => {
    const project = createNewEditorProject("maximized-focus");
    await initializeProjectBackground(project);
    const video = await uploadVideoResource({
      project,
      file: new File([mp4Bytes(1)], "BG2FG.MP4", { type: "video/mp4" }),
      resourceId: "BG2FG.MP4",
      decodeVideo,
    });
    expect(video).toMatchObject({
      kind: "video",
      path: "BG2FG.MP4",
      mimeType: "video/mp4",
      size: { width: 1280, height: 720 },
      durationSeconds: 3.625,
      hasAudio: true,
    });
    expect(project.nodes).toHaveLength(1);
    await uploadVideoResource({
      project,
      file: new File([mp4Bytes(1)], "same-bytes.mp4"),
      resourceId: "same-bytes.mp4",
      decodeVideo,
    });
    expect(project.assets.size).toBe(3);
    await uploadVideoResource({
      project,
      file: new File([mp4Bytes(2)], "BG2FG.MP4"),
      resourceId: "BG2FG.MP4",
      decodeVideo,
    });
    expect(project.assets.size).toBe(3);

    addGameMode(project, "FreeGame");
    bindGameModeBackground(project, "FreeGame", "default", "background");
    createGameModeTransition(project, "BaseGame", "FreeGame");
    const spineDraft = project.gameModes.transitions[0]!;
    const transition = setGameModeTransitionKind(project, spineDraft, "video");
    expect(transition).toEqual({
      kind: "video",
      fromModeId: "BaseGame",
      toModeId: "FreeGame",
      resourceId: "",
      fit: "contain",
      fadeOutSeconds: 0.5,
    });
    setGameModeVideoTransitionResource(project, transition, "BG2FG.MP4");
    setGameModeVideoTransitionFadeOut(project, transition, 0.5);
    const manifest = editorProjectToManifest(project);
    expect(manifest.gameModes?.transitions).toEqual([
      {
        from: "BaseGame",
        to: "FreeGame",
        overlay: {
          resource: {
            kind: "video",
            path: video.path,
            mimeType: "video/mp4",
          },
          fit: "contain",
          fadeOutSeconds: 0.5,
        },
      },
    ]);
    expect(() =>
      addLayerFromResource({
        project,
        resourceId: "BG2FG.MP4",
        nodeId: "bad-video-layer",
        variants: ["default"],
      }),
    ).toThrow(/video/);
    expect(() =>
      assignBackgroundResource({
        project,
        resourceId: "BG2FG.MP4",
        variant: "default",
      }),
    ).toThrow(/video/);
    expect(() => deleteLayoutResource(project, "BG2FG.MP4")).toThrow(
      /BaseGame -> FreeGame/,
    );
    await expect(
      replaceVideoResource({
        project,
        resourceId: "BG2FG.MP4",
        file: new File([mp4Bytes(3)], "BG2FG.MP4", {
          type: "video/mp4",
        }),
        decodeVideo: async () => ({
          width: 1280,
          height: 720,
          durationSeconds: 0.4,
          hasAudio: false,
        }),
      }),
    ).rejects.toThrow(/fadeOutSeconds/);
    expect(project.resources.get("BG2FG.MP4")).toEqual(video);

    const before = cloneEditorProject(project);
    await expect(
      uploadVideoResource({
        project,
        file: new File([new Uint8Array([1, 2, 3])], "bad.mp4", {
          type: "video/mp4",
        }),
        resourceId: "bad.mp4",
        decodeVideo,
      }),
    ).rejects.toThrow(/ftyp/);
    expect(project).toEqual(before);
  });

  it("keeps stable Spine nodes on a single explicit loop", async () => {
    const project = createNewEditorProject("maximized-focus");
    await initializeProjectBackground(project);
    await uploadSpineResource({ project, files: spineFiles() });
    addLayerFromResource({
      project,
      resourceId: "hero.json",
      nodeId: "scene",
      variants: ["default"],
      defaultAnimation: "Idle",
    });
    expect(project.nodes.find((node) => node.id === "scene")?.playback).toEqual(
      { kind: "loop", animation: "Idle" },
    );
  });

  it("uploads image metadata and bytes without creating a node", async () => {
    const project = createNewEditorProject("maximized-focus");
    const resource = await uploadImageResource({
      project,
      file: new File([pngBytes(3)], "BG_2.PNG"),
      decodeImage,
    });
    expect(resource).toMatchObject({
      id: "BG_2.PNG",
      kind: "image",
      path: "BG_2.PNG",
      size: { width: 2000, height: 2000 },
    });
    expect(project.nodes).toEqual([]);
    expect(project.resources.get("BG_2.PNG")).toEqual(resource);
    expect(resource.kind).toBe("image");
    if (resource.kind !== "image") throw new Error("expected image resource");
    expect(project.assets.get(resource.path)).toEqual(pngBytes(3));
  });

  it("uploads one strict Spine filename-key descriptor and rejects invalid batches atomically", async () => {
    const project = createNewEditorProject("orientation-focus");
    const resource = await uploadSpineResource({
      project,
      files: spineFiles(),
    });
    expect(resource).toMatchObject({
      id: "hero.json",
      kind: "spine",
      animationNames: ["Idle", "Win"],
    });
    expect(Object.keys(resource.textures)).toEqual(["hero.png"]);
    expect(Object.values(resource.textures)[0]).toBe("hero.png");
    expect(project.nodes).toEqual([]);
    expect(
      new TextDecoder().decode(project.assets.get(resource.atlas)),
    ).toContain(`${Object.keys(resource.textures)[0]}\nsize:`);
    const before = cloneEditorProject(project);
    await expect(
      uploadSpineResource({
        project,
        files: spineFiles({ name: "bad", version: "4.2.0" }),
      }),
    ).rejects.toThrow(/4\.3\.x/);
    expect(project).toEqual(before);
  });

  it("keeps unique atlas pages while deduplicating identical Spine texture payloads", async () => {
    const project = createNewEditorProject("maximized-focus");
    const texture = pngBytes(12);
    const resource = await uploadSpineResource({
      project,
      files: [
        new File(
          [
            JSON.stringify({
              skeleton: { spine: "4.3.23" },
              animations: { Idle: {} },
            }),
          ],
          "shared.json",
        ),
        new File(
          [
            "BG.png\nsize: 1,1\nfilter: Linear,Linear\n\n" +
              "BG_2.png\nsize: 1,1\nfilter: Linear,Linear\n",
          ],
          "shared.atlas",
        ),
        new File([texture], "BG.png", { type: "image/png" }),
        new File([texture], "BG_2.png", { type: "image/png" }),
      ],
    });
    const pages = Object.keys(resource.textures);
    const paths = Object.values(resource.textures);
    expect(pages).toEqual(["BG.png", "BG_2.png"]);
    expect(paths).toEqual(["BG.png", "BG_2.png"]);
    expect(project.assets.get(paths[0]!)).toEqual(texture);
    expect(project.assets.get(paths[1]!)).toEqual(texture);
    const atlasText = new TextDecoder().decode(
      project.assets.get(resource.atlas),
    );
    expect(pages.every((page) => atlasText.includes(`${page}\nsize:`))).toBe(
      true,
    );
  });

  it("records files-only provenance and optional Spine bounds", async () => {
    const imageProject = createNewEditorProject("maximized-focus");
    const imageFile = new File([pngBytes(4)], "panel.png");
    const image = await uploadImageResource({
      project: imageProject,
      file: imageFile,
      decodeImage: async () => ({ width: 20, height: 30 }),
    });
    expect(image.provenance?.sourceKind).toBe("files");
    expect(imageProject.assets.has("ui/panel.png")).toBe(false);

    const spineProject = createNewEditorProject("maximized-focus");
    const files = spineFiles({ bounds: { width: 100, height: 200 } });
    const spine = await uploadSpineResource({ project: spineProject, files });
    expect(spine.bounds).toEqual({ width: 100, height: 200 });
    expect(spine.provenance?.sourceKind).toBe("files");
  });

  it("keeps Spine export bounds separate from art size and centers default geometry after explicit art input", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadSpineResource({
      project,
      files: spineFiles({
        name: "bg",
        animations: ["BG"],
        bounds: { width: 3744.3176, height: 2371.955 },
      }),
    });
    const node = assignBackgroundResource({
      project,
      variant: "default",
      resourceId: "bg.json",
      nodeId: "bg",
      defaultAnimation: "BG",
    });
    expect(project.variants.default.artSize).toEqual({ width: 0, height: 0 });
    expect(node.placements.default).toEqual({ x: 0, y: 0, scale: 1 });

    setVariantArtSizeDimension(project, "default", "width", 2000);
    setVariantArtSizeDimension(project, "default", "height", 2000);

    expect(project.variants.default.artSize).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(node.placements.default).toEqual({ x: 1000, y: 1000, scale: 1 });
    expect(project.reel.placements.default).toEqual({ x: 600, y: 760 });
    expect(project.variants.default.focusRect).toEqual({
      x: 540,
      y: 700,
      width: 920,
      height: 600,
    });

    node.placements.default = { x: 980, y: 1020, scale: 0.95 };
    await replaceSpineResource({
      project,
      resourceId: "bg.json",
      files: spineFiles({
        name: "bg",
        animations: ["BG"],
        bounds: { width: 4100, height: 2600 },
      }),
    });
    expect(project.variants.default.artSize).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(node.placements.default).toEqual({
      x: 980,
      y: 1020,
      scale: 0.95,
    });
  });

  it("keeps same-resource stable backgrounds as independent retained loop nodes", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadSpineResource({
      project,
      files: spineFiles({
        name: "bg",
        animations: ["BG", "FG", "BG_FG", "FG_BG"],
      }),
    });
    const node = assignBackgroundResource({
      project,
      modeId: "BaseGame",
      variant: "default",
      resourceId: "bg.json",
      nodeId: "background",
      defaultAnimation: "BG",
    });
    addGameMode(project, "FreeGame");
    const reused = assignBackgroundResource({
      project,
      modeId: "FreeGame",
      variant: "default",
      resourceId: "bg.json",
      defaultAnimation: "FG",
    });

    expect(reused.id).not.toBe(node.id);
    expect(reused.id).toBe("freegame-background");
    expect(project.nodes).toHaveLength(2);
    expect(
      project.gameModes.modes.map((mode) => mode.backgroundNodes.default),
    ).toEqual(["background", reused.id]);
    expect(project.nodes.map((item) => item.playback)).toEqual([
      { kind: "loop", animation: "BG" },
      { kind: "loop", animation: "FG" },
    ]);
    expect(project.gameModes.modes.map((mode) => mode.nodeStates)).toEqual([
      {},
      {},
    ]);
    setVariantArtSizeDimension(project, "default", "width", 2000);
    setVariantArtSizeDimension(project, "default", "height", 2000);
    const manifest = editorProjectToManifest(project);
    expect(manifest.nodes).toHaveLength(2);
    expect(
      manifest.gameModes?.modes.map((mode) => mode.backgroundNodes?.default),
    ).toEqual(["background", reused.id]);
    expect(manifest.nodes.map((item) => item.resource)).toEqual([
      expect.objectContaining({ defaultAnimation: "BG", loop: true }),
      expect.objectContaining({ defaultAnimation: "FG", loop: true }),
    ]);
  });

  it("gives every mode and orientation an explicit stable background identity", async () => {
    const project = createNewEditorProject("orientation-focus");
    for (const name of ["bg1", "bg2", "fg1", "fg2"]) {
      await uploadImageResource({
        project,
        file: new File([pngBytes(name.length)], `${name}.png`),
        decodeImage: async () =>
          name.endsWith("1")
            ? { width: 2000, height: 1125 }
            : { width: 1174, height: 2000 },
      });
    }
    addGameMode(project, "FreeGame");
    assignBackgroundResource({
      project,
      modeId: "FreeGame",
      variant: "landscape",
      resourceId: "fg1.png",
    });
    assignBackgroundResource({
      project,
      modeId: "FreeGame",
      variant: "portrait",
      resourceId: "fg2.png",
    });
    assignBackgroundResource({
      project,
      modeId: "BaseGame",
      variant: "landscape",
      resourceId: "bg1.png",
    });
    assignBackgroundResource({
      project,
      modeId: "BaseGame",
      variant: "portrait",
      resourceId: "bg2.png",
    });

    expect(project.gameModes.modes.map((mode) => mode.backgroundNodes)).toEqual(
      [
        {
          landscape: "basegame-landscape-background",
          portrait: "basegame-portrait-background",
        },
        {
          landscape: "freegame-landscape-background",
          portrait: "freegame-portrait-background",
        },
      ],
    );
    expect(project.nodes.map((node) => node.resourceId)).toEqual([
      "bg1.png",
      "bg2.png",
      "fg1.png",
      "fg2.png",
    ]);
    expect(project.nodes.map((node) => node.order)).toEqual([0, 1, 2, 3]);
    expect(() => editorProjectToManifest(project)).not.toThrow();
  });

  it("re-centers legacy default geometry when correcting an export-bounds art size", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadSpineResource({
      project,
      files: spineFiles({
        name: "bg",
        animations: ["BG"],
        bounds: { width: 3744.3176, height: 2371.955 },
      }),
    });
    const node = assignBackgroundResource({
      project,
      variant: "default",
      resourceId: "bg.json",
      nodeId: "bg",
      defaultAnimation: "BG",
    });
    resetVariantGeometry(project, "default", {
      width: 3744.3176,
      height: 2371.955,
    });
    expect(node.placements.default).toEqual({ x: 0, y: 0, scale: 1 });

    setVariantArtSizeDimension(project, "default", "width", 2000);
    setVariantArtSizeDimension(project, "default", "height", 2000);

    expect(node.placements.default).toEqual({ x: 1000, y: 1000, scale: 1 });
    expect(project.reel.placements.default).toEqual({ x: 600, y: 760 });
  });

  it("reuses one resource across independent layers and never garbage-collects it with a node", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadImageResource({
      project,
      file: new File([pngBytes(2)], "layer.png"),
      decodeImage: async () => ({ width: 100, height: 80 }),
    });
    addLayerFromResource({
      project,
      resourceId: "layer.png",
      nodeId: "layer-a",
      variants: ["default"],
    });
    addLayerFromResource({
      project,
      resourceId: "layer.png",
      nodeId: "layer-b",
      variants: ["default"],
    });
    project.nodes[0].placements.default!.x = 10;
    expect(project.nodes[1].placements.default!.x).toBe(0);
    expect(getLayoutResourceReferences(project, "layer.png")).toHaveLength(2);
    removeLayer(project, "layer-a");
    expect(project.resources.has("layer.png")).toBe(true);
    const layer = project.resources.get("layer.png");
    expect(layer?.kind).toBe("image");
    expect(layer?.kind === "image" && project.assets.has(layer.path)).toBe(
      true,
    );
    expect(() => deleteLayoutResource(project, "layer.png")).toThrow(/layer-b/);
    removeLayer(project, "layer-b");
    deleteLayoutResource(project, "layer.png");
    expect(project.resources.size).toBe(0);
    expect(project.assets.size).toBe(0);
  });

  it("keeps filename keys distinct while export may deduplicate payloads", async () => {
    const project = createNewEditorProject("maximized-focus");
    const first = await uploadImageResource({
      project,
      file: new File([pngBytes(11)], "first.png", { type: "image/png" }),
      decodeImage: async () => ({ width: 10, height: 10 }),
    });
    const second = await uploadImageResource({
      project,
      file: new File([pngBytes(11)], "second.png", { type: "image/png" }),
      decodeImage: async () => ({ width: 10, height: 10 }),
    });
    expect(first.id).toBe("first.png");
    expect(second.id).toBe("second.png");
    if (first.kind !== "image" || second.kind !== "image")
      throw new Error("expected images");
    expect(first.path).toBe("first.png");
    expect(second.path).toBe("second.png");
    expect(project.assets.size).toBe(2);
    deleteLayoutResource(project, "first.png");
    expect(project.assets.has(second.path)).toBe(true);
    deleteLayoutResource(project, "second.png");
    expect(project.assets.size).toBe(0);
  });

  it("keeps Spine playback per node and requires an exact explicit animation", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadSpineResource({ project, files: spineFiles() });
    expect(() =>
      addLayerFromResource({
        project,
        resourceId: "hero.json",
        nodeId: "hero-a",
        variants: ["default"],
      }),
    ).toThrow(/明确选择/);
    addLayerFromResource({
      project,
      resourceId: "hero.json",
      nodeId: "hero-a",
      variants: ["default"],
      defaultAnimation: "Idle",
    });
    addLayerFromResource({
      project,
      resourceId: "hero.json",
      nodeId: "hero-b",
      variants: ["default"],
      defaultAnimation: "Win",
    });
    expect(
      project.nodes.map((node) =>
        node.playback?.kind === "loop" ? node.playback.animation : "",
      ),
    ).toEqual(["Idle", "Win"]);
  });

  it("initializes first background geometry, preserves same size and requires explicit reinitialize for size changes", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadImageResource({
      project,
      file: new File([pngBytes(1)], "bg.png"),
      decodeImage,
    });
    assignBackgroundResource({
      project,
      variant: "default",
      resourceId: "bg.png",
      nodeId: "background",
    });
    expect(project.variants.default.artSize).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(project.reel.placements.default).toEqual({ x: 600, y: 760 });
    expect(project.variants.default.focusRect).toEqual({
      x: 540,
      y: 700,
      width: 920,
      height: 600,
    });
    await uploadImageResource({
      project,
      file: new File([pngBytes(2)], "wide.png"),
      decodeImage: async () => ({ width: 1200, height: 800 }),
    });
    expect(() =>
      assignBackgroundResource({
        project,
        variant: "default",
        resourceId: "wide.png",
      }),
    ).toThrow(/明确选择/);
    expect(project.variants.default.artSize).toEqual({
      width: 2000,
      height: 2000,
    });
    assignBackgroundResource({
      project,
      variant: "default",
      resourceId: "wide.png",
      reinitialize: true,
    });
    expect(project.variants.default.artSize).toEqual({
      width: 1200,
      height: 800,
    });
    clearBackground(project, "default");
    expect(project.nodes).toHaveLength(0);
    expect(project.resources.size).toBe(2);
  });

  it("makes Spine replacement and type-changing rebind atomic", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadSpineResource({ project, files: spineFiles() });
    addLayerFromResource({
      project,
      resourceId: "hero.json",
      nodeId: "hero-layer",
      variants: ["default"],
      defaultAnimation: "Win",
    });
    const before = cloneEditorProject(project);
    await expect(
      replaceSpineResource({
        project,
        resourceId: "hero.json",
        files: spineFiles({ name: "hero", animations: ["Idle"] }),
      }),
    ).rejects.toThrow(/hero-layer/);
    expect(project).toEqual(before);
    await uploadImageResource({
      project,
      file: new File([pngBytes(3)], "image.png"),
      decodeImage: async () => ({ width: 10, height: 10 }),
    });
    rebindLayerResource({
      project,
      nodeId: "hero-layer",
      resourceId: "image.png",
    });
    expect(project.nodes[0]).not.toHaveProperty("defaultAnimation");
  });

  it("covers strict identity, variant, ordering and background reference failures", async () => {
    const project = createNewEditorProject("orientation-focus");
    await uploadImageResource({
      project,
      file: new File([pngBytes(4)], "shared.png"),
      decodeImage: async () => ({ width: 1000, height: 600 }),
    });
    expect(() =>
      addLayerFromResource({
        project,
        resourceId: "shared.png",
        nodeId: "Bad_ID",
        variants: ["landscape"],
      }),
    ).toThrow(/小写/);
    expect(() =>
      addLayerFromResource({
        project,
        resourceId: "shared.png",
        nodeId: "bad-variant",
        variants: ["default"],
      }),
    ).toThrow(/不允许 variant/);
    addLayerFromResource({
      project,
      resourceId: "shared.png",
      nodeId: "first",
      variants: ["landscape"],
    });
    addLayerFromResource({
      project,
      resourceId: "shared.png",
      nodeId: "second",
      variants: ["portrait"],
    });
    moveLayer(project, "first", -1);
    moveLayer(project, "second", -1);
    expect(project.nodes.map((node) => node.id)).toEqual(["second", "first"]);
    setLayerVariantVisibility(project, "second", "landscape", true);
    expect(project.nodes[0].placements.landscape).toEqual({
      x: 0,
      y: 0,
      scale: 1,
    });
    setLayerVariantVisibility(project, "second", "landscape", false);
    expect(project.nodes[0].placements.landscape).toBeUndefined();
    renameNode(project, "second", "second");
    expect(() => renameNode(project, "missing", "next")).toThrow(/未知节点/);
    expect(() => setNodeDefaultAnimation(project, "first", "Idle")).toThrow(
      /图片资源/,
    );
    expect(() => clearBackground(project, "landscape")).toThrow(/尚未设置/);
  });

  it("replaces images atomically and validates background reference size", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadImageResource({
      project,
      file: new File([pngBytes(5)], "bg.png"),
      decodeImage: async () => ({ width: 1000, height: 600 }),
    });
    assignBackgroundResource({
      project,
      variant: "default",
      resourceId: "bg.png",
      nodeId: "background",
    });
    expect(() => deleteLayoutResource(project, "bg.png")).toThrow(
      /default 背景/,
    );
    await expect(
      replaceImageResource({
        project,
        resourceId: "bg.png",
        file: new File([pngBytes(6)], "bg.png"),
        decodeImage: async () => ({ width: 1200, height: 800 }),
      }),
    ).rejects.toThrow(/背景替换尺寸/);
    await replaceImageResource({
      project,
      resourceId: "bg.png",
      file: new File([pngBytes(6)], "bg.png"),
      decodeImage: async () => ({ width: 1200, height: 800 }),
      reinitializeBackgrounds: true,
    });
    expect(project.resources.get("bg.png")).toMatchObject({
      path: "bg.png",
      size: { width: 1200, height: 800 },
    });
    expect(
      [...project.assets.keys()].some((path) => path === "assets/bg.png"),
    ).toBe(false);
    expect(project.variants.default.artSize).toEqual({
      width: 1200,
      height: 800,
    });
    await uploadSpineResource({ project, files: spineFiles() });
    await expect(
      replaceImageResource({
        project,
        resourceId: "hero.json",
        file: new File([pngBytes(7)], "x.png"),
        decodeImage: async () => ({ width: 1, height: 1 }),
      }),
    ).rejects.toThrow(/保持为 image/);
    await expect(
      replaceSpineResource({
        project,
        resourceId: "bg.png",
        files: spineFiles({ name: "bg" }),
      }),
    ).rejects.toThrow(/保持为 Spine/);
  });

  it("keeps a shared background node until its final variant is cleared", async () => {
    const project = createNewEditorProject("orientation-focus");
    await uploadSpineResource({ project, files: spineFiles() });
    const node = assignBackgroundResource({
      project,
      variant: "landscape",
      resourceId: "hero.json",
      nodeId: "shared-bg",
      defaultAnimation: "Idle",
    });
    project.gameModes.modes[0].backgroundNodes.portrait = node.id;
    project.variants.portrait.backgroundNode = node.id;
    node.placements.portrait = { x: 0, y: 0, scale: 1 };
    assignBackgroundResource({
      project,
      variant: "portrait",
      resourceId: "hero.json",
      defaultAnimation: "Win",
    });
    renameNode(project, "shared-bg", "renamed-bg");
    expect(project.variants.landscape.backgroundNode).toBe("renamed-bg");
    expect(project.variants.portrait.backgroundNode).toBe("renamed-bg");
    clearBackground(project, "landscape");
    expect(project.nodes).toHaveLength(1);
    expect(project.nodes[0].placements.landscape).toBeUndefined();
    clearBackground(project, "portrait");
    expect(project.nodes).toHaveLength(0);
    expect(project.resources.has("hero.json")).toBe(true);
  });

  it("rejects every malformed upload batch without partial metadata or bytes", async () => {
    const invalidImageProject = createNewEditorProject("maximized-focus");
    await expect(
      uploadImageResource({
        project: invalidImageProject,
        file: new File(["x"], "bad.png"),
        resourceId: "Bad_ID",
        decodeImage: async () => ({ width: 0, height: Number.NaN }),
      }),
    ).rejects.toThrow(/有限正数/);
    expect(invalidImageProject.resources.size).toBe(0);
    await expect(
      uploadSpineResource({
        project: createNewEditorProject("maximized-focus"),
        files: [new File(["{}"], "only.json")],
      }),
    ).rejects.toThrow(/恰好包含/);
    await expect(
      uploadSpineResource({
        project: createNewEditorProject("maximized-focus"),
        files: [
          new File(["{"], "bad.json"),
          new File(["page.png\nsize: 1,1\n"], "bad.atlas"),
          new File([pngBytes(8)], "page.png"),
        ],
      }),
    ).rejects.toThrow(/JSON\/UTF-8/);
    await expect(
      uploadSpineResource({
        project: createNewEditorProject("maximized-focus"),
        files: spineFiles({ name: "empty", animations: [] }),
      }),
    ).rejects.toThrow(/没有 animation/);
    const partialBounds = spineFiles({ name: "partial" });
    partialBounds[0] = new File(
      [
        JSON.stringify({
          skeleton: { spine: "4.3.23", width: 100 },
          animations: { Idle: {} },
        }),
      ],
      "partial.json",
    );
    await expect(
      uploadSpineResource({
        project: createNewEditorProject("maximized-focus"),
        files: partialBounds,
      }),
    ).rejects.toThrow(/bounds/);
    await expect(
      uploadImageResource({
        project: createNewEditorProject("maximized-focus"),
        file: new File([pngBytes(1)], "中奖.png"),
        decodeImage: async () => ({ width: 1, height: 1 }),
      }),
    ).resolves.toMatchObject({ id: "中奖.png", path: "中奖.png" });
    await expect(
      uploadImageResource({
        project: createNewEditorProject("maximized-focus"),
        file: new File(["not an image"], "bad.png"),
        resourceId: "bad.mp4",
        decodeImage: async () => ({ width: 1, height: 1 }),
      }),
    ).rejects.toThrow(/不是受支持/);
    await expect(
      importImageStringZip({
        project: createNewEditorProject("maximized-focus"),
        zipBytes: zipSync({ "unknown.json": strToU8("{}") }),
      }),
    ).rejects.toThrow(/根目录必须包含/);
    await expect(
      uploadSpineResource({
        project: createNewEditorProject("maximized-focus"),
        files: [
          ...spineFiles({ name: "missing" }).slice(0, 2),
          new File([pngBytes(1)], "other.png"),
        ],
      }),
    ).rejects.toThrow(/缺少 texture/);
    await expect(
      uploadSpineResource({
        project: createNewEditorProject("maximized-focus"),
        files: [
          ...spineFiles({ name: "extra" }),
          new File([pngBytes(2)], "unused.png"),
        ],
      }),
    ).rejects.toThrow(/未引用/);
    await expect(
      uploadSpineResource({
        project: createNewEditorProject("maximized-focus"),
        files: [
          new File(
            [
              JSON.stringify({
                skeleton: { spine: "4.3.23" },
                animations: { Idle: {} },
              }),
            ],
            "empty-atlas.json",
          ),
          new File(["region\n  rotate: false\n"], "empty-atlas.atlas"),
          new File([pngBytes(1)], "page.png"),
        ],
      }),
    ).rejects.toThrow(/没有可识别/);
    await expect(
      uploadSpineResource({
        project: createNewEditorProject("maximized-focus"),
        files: [
          new File(
            [
              JSON.stringify({
                skeleton: { spine: "4.3.23" },
                animations: { Idle: {} },
              }),
            ],
            "alias.json",
          ),
          new File(
            ["Page.png\nsize: 1,1\n\npage.png\nsize: 1,1\n"],
            "alias.atlas",
          ),
          new File([pngBytes(1)], "page.png"),
        ],
      }),
    ).rejects.toThrow(/case-fold/);
    const duplicateProject = createNewEditorProject("maximized-focus");
    await uploadImageResource({
      project: duplicateProject,
      file: new File([pngBytes(1)], "same.png"),
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    await uploadImageResource({
      project: duplicateProject,
      file: new File([pngBytes(2)], "same.png"),
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    expect(duplicateProject.assets.get("same.png")).toEqual(pngBytes(2));
    await expect(
      uploadImageResource({
        project: createNewEditorProject("maximized-focus"),
        file: new File([pngBytes(1)], "valid.png"),
        resourceId: "Bad_ID",
        decodeImage: async () => ({ width: 1, height: 1 }),
      }),
    ).rejects.toThrow(/filename key|扩展名/);

    const wrongKindProject = createNewEditorProject("maximized-focus");
    await uploadImageResource({
      project: wrongKindProject,
      file: new File([pngBytes(1)], "bg.png"),
      decodeImage: async () => ({ width: 1, height: 1 }),
    });
    await expect(
      replaceImageStringResource({
        project: wrongKindProject,
        resourceId: "bg.png",
        zipBytes: imageStringZip({ id: "bg" }),
      }),
    ).rejects.toThrow(/类型必须保持/);

    const nestedIdProject = createNewEditorProject("maximized-focus");
    await importImageStringZip({
      project: nestedIdProject,
      zipBytes: imageStringZip({ id: "digits" }),
    });
    await expect(
      replaceImageStringResource({
        project: nestedIdProject,
        resourceId: "image-string.manifest.json",
        zipBytes: imageStringZip({ id: "other" }),
      }),
    ).resolves.toMatchObject({
      id: "image-string.manifest.json",
      manifest: { id: "other" },
    });
  });
});
