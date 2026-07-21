// @vitest-environment happy-dom

import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureZip } from "./fixture-zips";

const playerMock = vi.hoisted(() => {
  const instances: MockVNIPlayer[] = [];
  const uiTestSlot = {
    afterGroupId: "group_back",
    afterGroupName: "Back",
    beforeGroupId: "group_front",
    beforeGroupName: "Front",
    renderIndex: 0,
  };

  class MockVNIPlayer {
    private readonly layerGroupSlots: Array<typeof uiTestSlot>;
    readonly destroy = vi.fn();
    readonly init = vi.fn(async () => Promise.resolve());
    readonly isPlaying = vi.fn(() => false);
    readonly play = vi.fn();
    readonly pause = vi.fn();
    readonly restart = vi.fn();
    readonly setLoop = vi.fn();
    readonly getLoop = vi.fn(() => true);
    readonly getTime = vi.fn(() => 0);
    readonly setViewportSize = vi.fn();
    readonly setViewportScale = vi.fn();
    readonly seek = vi.fn();
    readonly requestSegmentedPlaybackEnd = vi.fn();
    readonly getLayerGroupSlots = vi.fn(() => this.layerGroupSlots);
    readonly insertedDispose = vi.fn();
    readonly attachImageBetweenLayerGroups = vi.fn(() => this.insertedDispose);
    readonly attachExternalImageBetweenLayerGroups = vi.fn(async () => vi.fn());
    readonly textBinding = {
      dispose: vi.fn(),
      setText: vi.fn(),
    };
    readonly attachTextToTextLayer = vi.fn(() => this.textBinding);
    readonly attachImageToTextLayer = vi.fn(async () => vi.fn());
    readonly clearMountedNodes = vi.fn();
    readonly getPlaybackState = vi.fn(() => ({
      mode: "timeline",
      phase: "idle",
      currentTime: 0,
      isPlaying: false,
      isDrainingParticles: false,
      liveParticleCount: 0,
      loopIndex: 0,
      keepParticlesAlive: true,
    }));

    constructor(readonly options: unknown) {
      const projectId =
        typeof options === "object" &&
        options !== null &&
        "projectId" in options
          ? String((options as { projectId: unknown }).projectId)
          : "";
      this.layerGroupSlots = projectId === "ui-test" ? [uiTestSlot] : [];
      instances.push(this);
    }
  }

  return { instances, MockVNIPlayer };
});

const pixiMock = vi.hoisted(() => {
  const instances: MockApplication[] = [];

  class MockApplication {
    stage = {};
    canvas: HTMLCanvasElement = null as unknown as HTMLCanvasElement;
    renderer = {
      resize: vi.fn(),
    };
    render = vi.fn();
    destroy = vi.fn((options?: { removeView?: boolean }) => {
      if (options?.removeView) {
        this.canvas?.remove();
      }
    });

    async init(): Promise<void> {
      this.canvas = document.createElement("canvas");
      instances.push(this);
    }
  }

  return { instances, MockApplication };
});

vi.mock("@slotclientengine/vnicore/pixi", () => ({
  VNIPlayer: playerMock.MockVNIPlayer,
}));

vi.mock("pixi.js", () => ({
  Application: pixiMock.MockApplication,
}));

afterEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
  playerMock.instances.length = 0;
  pixiMock.instances.length = 0;
});

describe("anieditorv5viewer main", () => {
  it("starts without a default VNIPlayer and disables playback controls", async () => {
    await mountViewer();

    expect(playerMock.instances).toHaveLength(0);
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
    expect(getButton("Play").disabled).toBe(true);
    expect(
      document.querySelector<HTMLSelectElement>(
        'select[aria-label="VNI profile"]',
      )?.disabled,
    ).toBe(true);
  });

  it("uploads megawin.zip and creates one runtime_50 player", async () => {
    await mountViewer();
    await uploadZipFile("megawin.zip");

    expect(playerMock.instances).toHaveLength(1);
    expect(playerMock.instances[0].init).toHaveBeenCalledTimes(1);
    expect(playerMock.instances[0].options).toMatchObject({
      projectId: "megawin",
      bundleId: "uploaded:megawin",
      profileId: "runtime_50",
      profilePurpose: "runtime",
      assetScale: 0.5,
      parent: pixiMock.instances[0].stage,
      diagnosticsElement: expect.any(HTMLElement),
    });
    expect(document.querySelector(".viewer-summary")?.textContent).toContain(
      "megawin.zip:project.json",
    );
    expect(getButton("Play").disabled).toBe(false);
  });

  it("summarizes VNI_0.095 sequence card carousel resources and pool ceiling", async () => {
    await mountViewer();
    await uploadZipFile("card-carousel-sequence.zip");

    expect(document.querySelector(".viewer-summary")?.textContent).toContain(
      "card_carousel_3d full_demo, 7 cards, 3 textures, 12 slices, max 84",
    );
    expect(playerMock.instances[0].options).toMatchObject({
      viewportScale: 1,
    });
  });

  it("uploads a synthetic VNI_0.087 contract and summarizes basic/bounce capabilities", async () => {
    await mountViewer();
    await uploadFile(createVNI087File());

    expect(playerMock.instances).toHaveLength(1);
    const summary = document.querySelector(".viewer-summary")?.textContent;
    expect(summary).toContain("schema VNI_0.087");
    expect(summary).toContain("bounce_jump");
    expect(summary).toContain("1 basic tracks, 2 points");
  });

  it("shows Pixi precompose mask summary for uploaded runtime projects", async () => {
    await mountViewer();
    await uploadFile(createPrecomposeMaskFile());

    expect(playerMock.instances).toHaveLength(1);
    expect(document.querySelector(".viewer-summary")?.textContent).toContain(
      "1 masks, 1 precompose_light_alpha, 1 Pixi light-mask, 0 legacy_alpha",
    );
  });

  it("rejects Cocos-compatible legacy_alpha uploads without creating a player", async () => {
    await mountViewer();
    await uploadFile(createLegacyMaskFile());

    expect(playerMock.instances).toHaveLength(0);
    expect(document.querySelector(".upload-error")?.textContent).toContain(
      "project.maskCompositeMode legacy_alpha",
    );
    expect(getButton("Play").disabled).toBe(true);
  });

  it("uploads roundreel.zip, defaults to runtime_100, and switches to edit_full", async () => {
    await mountViewer();
    await uploadZipFile("roundreel.zip");

    expect(playerMock.instances).toHaveLength(1);
    expect(playerMock.instances[0].options).toMatchObject({
      projectId: "roundreel",
      profileId: "runtime_100",
      profilePurpose: "runtime",
      assetScale: 1,
    });

    const profileSelect = getProfileSelect();
    expect(profileSelect.disabled).toBe(false);
    expect(
      Array.from(profileSelect.options).map((option) => option.value),
    ).toEqual(["edit_full", "runtime_100"]);

    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    profileSelect.value = "edit_full";
    profileSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushAsync();

    expect(playerMock.instances).toHaveLength(2);
    expect(playerMock.instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(pixiMock.instances[0].destroy).toHaveBeenCalledWith({
      removeView: true,
    });
    expect(revokeObjectURL).toHaveBeenCalled();
    expect(playerMock.instances[1].options).toMatchObject({
      projectId: "roundreel",
      profileId: "edit_full",
      profilePurpose: "editing",
      assetScale: 1,
    });
    expect(document.querySelector(".viewer-summary")?.textContent).toContain(
      "roundreel.zip:edit_full/roundreel.json",
    );
  });

  it("repeated upload destroys the old player, Pixi app, and Blob URLs", async () => {
    await mountViewer();
    await uploadZipFile("megawin.zip");
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    revokeObjectURL.mockClear();

    await uploadZipFile("roundreel.zip");

    expect(playerMock.instances).toHaveLength(2);
    expect(playerMock.instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(pixiMock.instances[0].destroy).toHaveBeenCalledWith({
      removeView: true,
    });
    expect(revokeObjectURL).toHaveBeenCalled();
    expect(document.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("shows parsing errors and does not keep the old player alive", async () => {
    await mountViewer();
    await uploadZipFile("megawin.zip");

    await uploadFile(
      new File(
        [
          zipSync({
            "note.txt": strToU8("not a VNI project"),
          }),
        ],
        "invalid.zip",
        { type: "application/zip" },
      ),
    );

    expect(playerMock.instances).toHaveLength(1);
    expect(playerMock.instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
    expect(document.querySelector(".upload-error")?.textContent).toContain(
      "manifest.json",
    );
    expect(getButton("Play").disabled).toBe(true);
  });

  it("wires play, seek, segmented playback, and zoom after upload", async () => {
    await mountViewer();
    await uploadZipFile("megawin.zip");

    const player = playerMock.instances[0];
    getButton("Play").click();
    expect(player.play).toHaveBeenCalledTimes(1);

    const timeline = document.querySelector<HTMLInputElement>("input.timeline");
    if (!timeline) throw new Error("Missing timeline control.");
    timeline.value = "1.25";
    timeline.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    timeline.dispatchEvent(new Event("input", { bubbles: true }));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenCalledWith(1.25);

    const loopStart = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop start seconds"]',
    );
    const loopEnd = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop end seconds"]',
    );
    const keepParticles = document.querySelector<HTMLInputElement>(
      'input[aria-label="维持粒子活动"]',
    );
    if (!loopStart || !loopEnd || !keepParticles) {
      throw new Error("Missing advanced playback controls.");
    }
    loopStart.value = "2.5";
    loopStart.dispatchEvent(new Event("input", { bubbles: true }));
    loopEnd.value = "3";
    loopEnd.dispatchEvent(new Event("input", { bubbles: true }));
    keepParticles.checked = false;
    getButton("开始").click();
    expect(player.play).toHaveBeenCalledWith({
      mode: "segmented",
      loopStart: { unit: "time", at: 2.5 },
      loopEnd: { unit: "time", at: 3 },
      keepParticlesAlive: false,
    });

    player.getPlaybackState.mockReturnValue({
      mode: "segmented",
      phase: "loop",
      currentTime: 3,
      isPlaying: true,
      isDrainingParticles: false,
      liveParticleCount: 12,
      loopIndex: 0,
      keepParticlesAlive: false,
    });
    getButton("开始").click();
    expect(getButton("结束").disabled).toBe(false);
    getButton("结束").click();
    expect(player.requestSegmentedPlaybackEnd).toHaveBeenCalledTimes(1);

    const stageMount = document.querySelector<HTMLElement>(".stage-mount");
    const canvasLayer = document.querySelector<HTMLElement>(
      ".stage-canvas-layer",
    );
    if (!stageMount || !canvasLayer) throw new Error("Missing stage mount.");
    const app = pixiMock.instances[0];
    expect(canvasLayer.style.width).toBe("1px");
    getAriaButton("放大画布").click();
    expect(canvasLayer.style.width).toBe("1px");
    expect(app.renderer.resize).toHaveBeenLastCalledWith(1, 1);
    expect(player.setViewportSize).toHaveBeenLastCalledWith(1, 1);
    expect(player.setViewportScale).toHaveBeenLastCalledWith(1.25);
    expect(stageMount.dataset.viewerCanvasScale).toBe("1.25");

    for (let index = 0; index < 7; index += 1) {
      getAriaButton("缩小画布").click();
    }
    expect(player.setViewportScale).toHaveBeenLastCalledWith(0.1);
    expect(stageMount.dataset.viewerCanvasScale).toBe("0.10");
    expect(getAriaButton("缩小画布").disabled).toBe(true);
  });

  it("wires group insertion and text-layer replacement through VNIPlayer public APIs", async () => {
    await mountViewer();
    await uploadFile(createUiTestFile());

    const player = playerMock.instances[0];
    const assetSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="插入 asset"]',
    );
    const slotSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="组间 slot"]',
    );
    if (!assetSelect || !slotSelect) {
      throw new Error("Missing group insertion controls.");
    }
    expect(slotSelect.options).toHaveLength(1);
    expect(assetSelect.value).toBe("assets/a.png");

    getButton("插入").click();
    expect(player.attachImageBetweenLayerGroups).toHaveBeenCalledWith({
      id: "viewer-group-slot-image",
      afterGroupId: "group_back",
      beforeGroupId: "group_front",
      assetId: "asset_a",
      x: 50,
      y: 50,
      anchorX: 0.5,
      anchorY: 0.5,
      opacity: 1,
    });

    const textLayerSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="文字层"]',
    );
    const modeSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="文字层替换模式"]',
    );
    const textInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="动态文字内容"]',
    );
    if (!textLayerSelect || !modeSelect || !textInput) {
      throw new Error("Missing text replacement controls.");
    }
    modeSelect.value = "text";
    modeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    textInput.value = "888";
    getButton("应用").click();
    expect(player.attachTextToTextLayer).toHaveBeenCalledWith({
      id: "viewer-text-layer-replacement",
      layerId: "layer_text",
      text: "888",
    });

    textInput.value = "999";
    textInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(player.textBinding.setText).toHaveBeenCalledWith("999");

    modeSelect.value = "image";
    modeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    getButton("应用").click();
    expect(player.attachImageToTextLayer).toHaveBeenCalledWith({
      id: "viewer-text-layer-replacement",
      layerId: "layer_text",
      assetId: "asset_a",
      label: "assets/a.png",
    });
  });

  it("blocks invalid segmented times before calling runtime", async () => {
    await mountViewer();
    await uploadZipFile("megawin.zip");

    const player = playerMock.instances[0];
    const loopStart = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop start seconds"]',
    );
    const loopEnd = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop end seconds"]',
    );
    const error = document.querySelector(".advanced-error");
    if (!loopStart || !loopEnd || !error) {
      throw new Error("Missing advanced playback controls.");
    }

    loopStart.value = "4";
    loopStart.dispatchEvent(new Event("input", { bubbles: true }));
    loopEnd.value = "3";
    loopEnd.dispatchEvent(new Event("input", { bubbles: true }));
    getButton("开始").click();

    expect(getButton("开始").disabled).toBe(true);
    expect(error.textContent).toContain("loopStart");
    expect(player.play).not.toHaveBeenCalledWith(
      expect.objectContaining({ mode: "segmented" }),
    );
  });
});

async function mountViewer(): Promise<void> {
  document.body.innerHTML = '<div id="app"></div>';
  await import("../src/main");
  await flushAsync();
}

async function uploadZipFile(
  name:
    | "megawin.zip"
    | "roundreel.zip"
    | "card-carousel-image.zip"
    | "card-carousel-sequence.zip",
): Promise<void> {
  await uploadFile(
    new File([toArrayBuffer(createFixtureZip(name))], name, {
      type: "application/zip",
    }),
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function uploadFile(file: File): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="上传 VNI zip"]',
  );
  if (!input) throw new Error("Missing upload input.");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
      [Symbol.iterator]: function* iterator() {
        yield file;
      },
    },
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await flushAsync();
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

function getButton(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === text,
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

function getAriaButton(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) throw new Error(`Missing aria button: ${label}`);
  return button;
}

function getProfileSelect(): HTMLSelectElement {
  const select = document.querySelector<HTMLSelectElement>(
    'select[aria-label="VNI profile"]',
  );
  if (!select) throw new Error("Missing profile select.");
  return select;
}

function createUiTestFile(): File {
  return new File(
    [
      zipSync({
        "project.json": strToU8(JSON.stringify(createUiTestProject())),
        "assets/a.png": new Uint8Array([1]),
      }),
    ],
    "ui-test.zip",
    { type: "application/zip" },
  );
}

function createUiTestProject() {
  return {
    schemaVersion: "VNI_0.042",
    editor: {
      name: "VNI",
      version: "0.1.0",
    },
    engineTarget: {
      name: "cocos_creator",
      version: "3.8.6",
    },
    name: "ui-test",
    exportProfile: {
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
    },
    stage: {
      width: 100,
      height: 100,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "asset_a",
        type: "image",
        path: "assets/a.png",
        originalName: "a.png",
        width: 10,
        height: 10,
      },
    ],
    layerGroups: [
      {
        id: "group_back",
        name: "Back",
        visible: true,
        collapsed: false,
        order: 0,
      },
      {
        id: "group_front",
        name: "Front",
        visible: true,
        collapsed: false,
        order: 1,
      },
    ],
    layers: [
      {
        id: "layer_image",
        name: "Image",
        type: "image",
        assetId: "asset_a",
        parentId: null,
        groupId: "group_back",
        visible: true,
        locked: false,
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        opacity: 1,
        blendMode: "normal",
        animations: [],
        keyframes: [],
      },
      {
        id: "layer_text",
        name: "Text",
        type: "text",
        assetId: null,
        parentId: null,
        groupId: "group_front",
        visible: true,
        locked: false,
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        opacity: 1,
        blendMode: "normal",
        text: "123",
        animations: [],
        keyframes: [],
      },
    ],
    particles: [],
  };
}

function createPrecomposeMaskFile(): File {
  const project = createUiTestProject();
  project.schemaVersion = "VNI_0.045";
  Object.assign(project, { maskCompositeMode: "precompose_light_alpha" });
  Object.assign(project.layers[1], {
    name: "Masked Image",
    type: "image",
    assetId: "asset_a",
    blendMode: "add",
    mask: {
      enabled: true,
      sourceLayerId: "layer_image",
      mode: "alpha",
      compositeMode: "precompose_light_alpha",
      showSourceLayer: false,
    },
  });
  delete (project.layers[1] as { text?: string }).text;
  return createZipFile("precompose-mask.zip", project);
}

function createVNI087File(): File {
  const project = createUiTestProject();
  project.schemaVersion = "VNI_0.087";
  Object.assign(project.layers[0], {
    basicAnimation: {
      opacity: { enabled: false, points: [] },
      positionX: {
        enabled: true,
        points: [
          { id: "x0", time: 0, value: 0, easing: "linear" },
          { id: "x1", time: 1, value: 100, easing: "easeOutQuad" },
        ],
      },
      positionY: { enabled: false, points: [] },
      scaleX: { enabled: false, points: [] },
      scaleY: { enabled: false, points: [] },
      rotation: { enabled: false, points: [] },
    },
    animations: [
      {
        id: "bounce",
        type: "bounce_jump",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          height: 100,
          anticipationRatio: 0.18,
          squash: 0.28,
          stretch: 0.18,
          topSquash: 0.08,
          bounceCount: 1,
          bounceDecay: 0.45,
          landSquash: 0.22,
          easing: "linear",
        },
      },
    ],
  });
  return createZipFile("vni-087.zip", project);
}

function createLegacyMaskFile(): File {
  const project = createUiTestProject();
  Object.assign(project, { maskCompositeMode: "legacy_alpha" });
  return createZipFile("legacy-mask.zip", project);
}

function createZipFile(name: string, project: unknown): File {
  return new File(
    [
      zipSync({
        "project.json": strToU8(JSON.stringify(project)),
        "assets/a.png": new Uint8Array([1]),
      }),
    ],
    name,
    { type: "application/zip" },
  );
}
