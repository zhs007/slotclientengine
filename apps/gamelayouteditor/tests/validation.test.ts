import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  cloneEditorProject,
  createNewEditorProject,
  editorProjectToManifest,
} from "../src/model/editor-project.js";
import {
  addLayerFromResource,
  addSpineState,
  addSpineTransition,
  assignBackgroundResource,
  clearBackground,
  deleteLayoutResource,
  getLayoutResourceReferences,
  moveLayer,
  importImageStringZip,
  rebindLayerResource,
  renameSpineState,
  renameNode,
  removeLayer,
  replaceImageResource,
  replaceImageStringResource,
  replaceSpineResource,
  setLayerVariantVisibility,
  setImageStringLayerAnchor,
  setImageStringLayerText,
  setNodeDefaultAnimation,
  setSpinePlaybackKind,
  setSpineStateAnimation,
  deleteSpineState,
  deleteSpineTransition,
  setSpineInitialState,
  uploadImageResource,
  uploadSpineResource,
} from "../src/model/resource-commands.js";

const decodeImage = async () => ({ width: 2000, height: 2000 });

function spineFiles(
  options: {
    name?: string;
    animations?: readonly string[];
    bounds?: { width: number; height: number };
    version?: string;
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
          animations: Object.fromEntries(animations.map((item) => [item, {}])),
        }),
      ],
      `${name}.json`,
    ),
    new File(
      [`${name}.png\nsize: 1,1\nfilter: Linear,Linear\n`],
      `${name}.atlas`,
    ),
    new File([new Uint8Array([9])], `${name}.png`, { type: "image/png" }),
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
    file: new File([new Uint8Array([1])], "background.png"),
    decodeImage,
  });
  assignBackgroundResource({
    project,
    variant: "default",
    resourceId: "background",
    nodeId: "background",
  });
}

describe("logical layout resource commands", () => {
  it("imports, reuses and atomically edits a standalone image-string resource", async () => {
    const project = createNewEditorProject("maximized-focus");
    await initializeProjectBackground(project);
    const resource = importImageStringZip({
      project,
      zipBytes: imageStringZip(),
    });
    expect(resource).toMatchObject({
      id: "digits",
      kind: "image-string",
      manifestPath:
        "dependencies/image-strings/digits/image-string.manifest.json",
    });
    expect(project.assets.has(resource.manifestPath)).toBe(true);
    addLayerFromResource({
      project,
      resourceId: "digits",
      nodeId: "amount-a",
      variants: ["default"],
    });
    addLayerFromResource({
      project,
      resourceId: "digits",
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
        resourceId: "digits",
      }),
    ).toThrow(/背景|尺寸/);
    const beforeReplacement = cloneEditorProject(project);
    expect(() =>
      replaceImageStringResource({
        project,
        resourceId: "digits",
        zipBytes: imageStringZip({ glyphs: ["0"] }),
      }),
    ).toThrow(/缺少 glyph/);
    expect(project).toEqual(beforeReplacement);
  });

  it("edits a Spine state machine atomically and rewrites renamed references", async () => {
    const project = createNewEditorProject("maximized-focus");
    await initializeProjectBackground(project);
    await uploadSpineResource({
      project,
      files: spineFiles({
        animations: ["BG", "FG", "BG_FG", "FG_BG"],
      }),
    });
    addLayerFromResource({
      project,
      resourceId: "hero",
      nodeId: "scene",
      variants: ["default"],
      defaultAnimation: "BG",
    });
    setSpinePlaybackKind(project, "scene", "state-machine");
    renameSpineState(project, "scene", "State1", "BG");
    addSpineState(project, "scene", { id: "FG", animation: "FG" });
    addSpineTransition(project, "scene", {
      from: "BG",
      to: "FG",
      animation: "BG_FG",
    });
    addSpineTransition(project, "scene", {
      from: "FG",
      to: "BG",
      animation: "FG_BG",
    });
    renameSpineState(project, "scene", "FG", "FreeGame");
    expect(
      project.nodes.find((node) => node.id === "scene")?.playback,
    ).toMatchObject({
      kind: "state-machine",
      initialState: "BG",
      transitions: [
        { from: "BG", to: "FreeGame", animation: "BG_FG" },
        { from: "FreeGame", to: "BG", animation: "FG_BG" },
      ],
    });
    const manifest = editorProjectToManifest(project);
    expect(
      manifest.nodes.find((node) => node.id === "scene")?.resource,
    ).toMatchObject({
      kind: "spine",
      stateMachine: {
        initialState: "BG",
        states: { BG: { animation: "BG" }, FreeGame: { animation: "FG" } },
      },
    });
    const beforeDuplicate = cloneEditorProject(project);
    expect(() =>
      setSpineStateAnimation(project, "scene", "FreeGame", "BG"),
    ).toThrow(/animation.*全局唯一|重复/);
    expect(project).toEqual(beforeDuplicate);
    expect(() => deleteSpineState(project, "scene", "FreeGame")).toThrow(
      /引用/,
    );
    expect(() =>
      addSpineState(project, "scene", { id: "BG", animation: "FG" }),
    ).toThrow(/state id 冲突/);
    expect(() =>
      addSpineState(project, "scene", { id: "1bad", animation: "FG" }),
    ).toThrow(/格式无效/);
    expect(() =>
      addSpineState(project, "scene", { id: "Other", animation: "missing" }),
    ).toThrow(/不存在/);
    expect(() =>
      addSpineTransition(project, "scene", {
        from: "BG",
        to: "BG",
        animation: "BG_FG",
      }),
    ).toThrow(/自循环/);
    expect(() =>
      addSpineTransition(project, "scene", {
        from: "missing",
        to: "BG",
        animation: "BG_FG",
      }),
    ).toThrow(/已声明/);
    expect(() =>
      addSpineTransition(project, "scene", {
        from: "BG",
        to: "FreeGame",
        animation: "FG_BG",
      }),
    ).toThrow(/有向边重复/);
    expect(() => setSpineInitialState(project, "scene", "missing")).toThrow(
      /未知 state/,
    );
    expect(() => deleteSpineTransition(project, "scene", -1)).toThrow(/越界/);
    setSpinePlaybackKind(project, "scene", "state-machine");
    expect(project).toEqual(beforeDuplicate);
  });

  it("uploads image metadata and bytes without creating a node", async () => {
    const project = createNewEditorProject("maximized-focus");
    const resource = await uploadImageResource({
      project,
      file: new File([new Uint8Array([1, 2, 3])], "BG.PNG"),
      decodeImage,
    });
    expect(resource).toEqual({
      id: "bg",
      kind: "image",
      path: "assets/bg.png",
      size: { width: 2000, height: 2000 },
    });
    expect(project.nodes).toEqual([]);
    expect(project.resources.get("bg")).toEqual(resource);
    expect(project.assets.get("assets/bg.png")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("uploads one strict Spine logical resource and rejects invalid batches atomically", async () => {
    const project = createNewEditorProject("orientation-focus");
    const resource = await uploadSpineResource({
      project,
      files: spineFiles(),
    });
    expect(resource).toMatchObject({
      id: "hero",
      kind: "spine",
      animationNames: ["Idle", "Win"],
      textures: { "hero.png": "assets/hero.png" },
    });
    expect(project.nodes).toEqual([]);
    expect(
      new TextDecoder().decode(project.assets.get("assets/hero.atlas")),
    ).toContain("hero.png\nsize:");
    const before = cloneEditorProject(project);
    await expect(
      uploadSpineResource({
        project,
        files: spineFiles({ name: "bad", version: "4.2.0" }),
      }),
    ).rejects.toThrow(/4\.3\.x/);
    expect(project).toEqual(before);
  });

  it("reuses one resource across independent layers and never garbage-collects it with a node", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadImageResource({
      project,
      file: new File(["image"], "layer.png"),
      decodeImage: async () => ({ width: 100, height: 80 }),
    });
    addLayerFromResource({
      project,
      resourceId: "layer",
      nodeId: "layer-a",
      variants: ["default"],
    });
    addLayerFromResource({
      project,
      resourceId: "layer",
      nodeId: "layer-b",
      variants: ["default"],
    });
    project.nodes[0].placements.default!.x = 10;
    expect(project.nodes[1].placements.default!.x).toBe(0);
    expect(getLayoutResourceReferences(project, "layer")).toHaveLength(2);
    removeLayer(project, "layer-a");
    expect(project.resources.has("layer")).toBe(true);
    expect(project.assets.has("assets/layer.png")).toBe(true);
    expect(() => deleteLayoutResource(project, "layer")).toThrow(/layer-b/);
    removeLayer(project, "layer-b");
    deleteLayoutResource(project, "layer");
    expect(project.resources.size).toBe(0);
    expect(project.assets.size).toBe(0);
  });

  it("keeps Spine playback per node and requires an exact explicit animation", async () => {
    const project = createNewEditorProject("maximized-focus");
    await uploadSpineResource({ project, files: spineFiles() });
    expect(() =>
      addLayerFromResource({
        project,
        resourceId: "hero",
        nodeId: "hero-a",
        variants: ["default"],
      }),
    ).toThrow(/明确选择/);
    addLayerFromResource({
      project,
      resourceId: "hero",
      nodeId: "hero-a",
      variants: ["default"],
      defaultAnimation: "Idle",
    });
    addLayerFromResource({
      project,
      resourceId: "hero",
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
      file: new File(["a"], "bg.png"),
      decodeImage,
    });
    assignBackgroundResource({
      project,
      variant: "default",
      resourceId: "bg",
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
      file: new File(["b"], "wide.png"),
      decodeImage: async () => ({ width: 1200, height: 800 }),
    });
    expect(() =>
      assignBackgroundResource({
        project,
        variant: "default",
        resourceId: "wide",
      }),
    ).toThrow(/明确选择/);
    expect(project.variants.default.artSize).toEqual({
      width: 2000,
      height: 2000,
    });
    assignBackgroundResource({
      project,
      variant: "default",
      resourceId: "wide",
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
      resourceId: "hero",
      nodeId: "hero-layer",
      variants: ["default"],
      defaultAnimation: "Win",
    });
    const before = cloneEditorProject(project);
    await expect(
      replaceSpineResource({
        project,
        resourceId: "hero",
        files: spineFiles({ name: "replacement", animations: ["Idle"] }),
      }),
    ).rejects.toThrow(/hero-layer/);
    expect(project).toEqual(before);
    await uploadImageResource({
      project,
      file: new File(["image"], "image.png"),
      decodeImage: async () => ({ width: 10, height: 10 }),
    });
    rebindLayerResource({
      project,
      nodeId: "hero-layer",
      resourceId: "image",
    });
    expect(project.nodes[0]).not.toHaveProperty("defaultAnimation");
  });

  it("covers strict identity, variant, ordering and background reference failures", async () => {
    const project = createNewEditorProject("orientation-focus");
    await uploadImageResource({
      project,
      file: new File(["image"], "shared.png"),
      decodeImage: async () => ({ width: 1000, height: 600 }),
    });
    expect(() =>
      addLayerFromResource({
        project,
        resourceId: "shared",
        nodeId: "Bad_ID",
        variants: ["landscape"],
      }),
    ).toThrow(/小写/);
    expect(() =>
      addLayerFromResource({
        project,
        resourceId: "shared",
        nodeId: "bad-variant",
        variants: ["default"],
      }),
    ).toThrow(/不允许 variant/);
    addLayerFromResource({
      project,
      resourceId: "shared",
      nodeId: "first",
      variants: ["landscape"],
    });
    addLayerFromResource({
      project,
      resourceId: "shared",
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
      file: new File(["a"], "bg.png"),
      decodeImage: async () => ({ width: 1000, height: 600 }),
    });
    assignBackgroundResource({
      project,
      variant: "default",
      resourceId: "bg",
      nodeId: "background",
    });
    expect(() => deleteLayoutResource(project, "bg")).toThrow(/default 背景/);
    await expect(
      replaceImageResource({
        project,
        resourceId: "bg",
        file: new File(["b"], "wide.png"),
        decodeImage: async () => ({ width: 1200, height: 800 }),
      }),
    ).rejects.toThrow(/背景替换尺寸/);
    await replaceImageResource({
      project,
      resourceId: "bg",
      file: new File(["b"], "wide.png"),
      decodeImage: async () => ({ width: 1200, height: 800 }),
      reinitializeBackgrounds: true,
    });
    expect(project.resources.get("bg")).toMatchObject({
      path: "assets/wide.png",
      size: { width: 1200, height: 800 },
    });
    expect(project.assets.has("assets/bg.png")).toBe(false);
    expect(project.variants.default.artSize).toEqual({
      width: 1200,
      height: 800,
    });
    await uploadSpineResource({ project, files: spineFiles() });
    await expect(
      replaceImageResource({
        project,
        resourceId: "hero",
        file: new File(["x"], "x.png"),
        decodeImage: async () => ({ width: 1, height: 1 }),
      }),
    ).rejects.toThrow(/保持为 image/);
    await expect(
      replaceSpineResource({
        project,
        resourceId: "bg",
        files: spineFiles({ name: "other" }),
      }),
    ).rejects.toThrow(/保持为 Spine/);
  });

  it("keeps a shared background node until its final variant is cleared", async () => {
    const project = createNewEditorProject("orientation-focus");
    await uploadSpineResource({ project, files: spineFiles() });
    const node = assignBackgroundResource({
      project,
      variant: "landscape",
      resourceId: "hero",
      nodeId: "shared-bg",
      defaultAnimation: "Idle",
    });
    project.variants.portrait.backgroundNode = node.id;
    node.placements.portrait = { x: 0, y: 0, scale: 1 };
    assignBackgroundResource({
      project,
      variant: "portrait",
      resourceId: "hero",
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
    expect(project.resources.has("hero")).toBe(true);
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
          new File(["x"], "page.png"),
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
  });
});
