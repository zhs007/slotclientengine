import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";
import {
  createSpinePopupRuntime,
  type PopupPackageResource,
  type SpinePopupManifestV1,
} from "../../src/popup/index.js";
import { createSpinePopupPlayer } from "../../src/popup/editor.js";

const promptSetText = vi.hoisted(() => vi.fn());
const createPromptText = vi.hoisted(() => vi.fn());
vi.mock("../../src/popup/prompt-text.js", async (original) => {
  const actual =
    await original<typeof import("../../src/popup/prompt-text.js")>();
  const { Container: PromptContainer } = await import("pixi.js");
  createPromptText.mockImplementation(() => ({
    text: new PromptContainer(),
    setText: promptSetText,
  }));
  return { ...actual, createPopupPromptText: createPromptText };
});

describe("spine popup player", () => {
  it("keeps the game runtime command/query surface snapshot-free", async () => {
    const transitions: unknown[] = [];
    const runtime = createSpinePopupRuntime({
      resource: spineResource(),
      playerFactory: () => new FakeSpinePlayer(),
      observeState: (transition) => transitions.push(transition),
    });
    expect("getSnapshot" in runtime).toBe(false);
    await runtime.init();
    runtime.start();
    expect(runtime.update(0)).toBeUndefined();
    expect(runtime.getPhase()).toBe("start");
    expect(transitions).toEqual([
      { kind: "phase", previous: "idle", current: "start" },
    ]);
    runtime.destroy();
  });

  it("ignores start clicks and exits loop immediately without waiting for its boundary", async () => {
    const leaf = new FakeSpinePlayer();
    const player = createSpinePopupPlayer({
      resource: spineResource(),
      playerFactory: () => leaf,
    });
    await player.init();
    player.start();
    player.requestDismiss();
    expect(leaf.plays).toEqual([{ animationName: "start", loop: false }]);
    leaf.results.push({ completed: true, events: [] });
    expect(player.update(0.1)).toEqual({
      phase: "loop",
      dismissRequested: false,
    });
    expect(leaf.plays.at(-1)).toEqual({ animationName: "loop", loop: true });
    player.requestDismiss();
    expect(player.getSnapshot()).toEqual({
      phase: "end",
      dismissRequested: true,
    });
    expect(leaf.plays.at(-1)).toEqual({ animationName: "end", loop: false });
    leaf.results.push({ completed: true, events: [] });
    expect(player.update(0.1).phase).toBe("complete");
    expect(player.container.visible).toBe(false);
  });

  it("keeps repeated dismiss idempotent and rejects concurrent start", async () => {
    const leaf = new FakeSpinePlayer();
    const player = createSpinePopupPlayer({
      resource: spineResource(),
      playerFactory: () => leaf,
    });
    await player.init();
    player.start();
    expect(() => player.start()).toThrow(/already playing/);
    player.requestDismiss();
    expect(player.getSnapshot().dismissRequested).toBe(false);
    leaf.results.push({ completed: true, events: [] });
    player.update(0.1);
    player.requestDismiss();
    player.requestDismiss();
    expect(player.getSnapshot().phase).toBe("end");
    player.dismissImmediately();
    expect(player.getSnapshot().phase).toBe("complete");
    expect(leaf.resetCount).toBe(1);
    player.destroy();
    player.destroy();
    expect(leaf.destroyCount).toBe(1);
  });

  it("renders a prompt with the rendercore system font without a prepared font resource", async () => {
    const leaf = new FakeSpinePlayer();
    const resource = spineResource();
    const promptResource: PopupPackageResource<SpinePopupManifestV1> = {
      ...resource,
      manifest: {
        ...resource.manifest,
        spine: {
          ...resource.manifest.spine,
          prompt: {
            defaultText: "Continue",
            fill: "#fff",
            order: 2,
            area: { x: 0, y: 20, width: 200, height: 20 },
          },
        },
      },
    };
    const player = createSpinePopupPlayer({
      resource: promptResource,
      playerFactory: () => leaf,
    });
    expect(createPromptText).toHaveBeenCalledWith({
      spec: promptResource.manifest.spine.prompt,
    });
    expect(
      ((player.container.children[0] as Container).children[0] as Container)
        .children,
    ).toHaveLength(2);
    await player.init();
    player.start("Translated continue");
    expect(promptSetText).toHaveBeenCalledWith("Translated continue");
    expect(player.container.visible).toBe(true);
    player.destroy();
  });

  it("fails strictly for wrong packages and invalid lifecycle calls", async () => {
    expect(() =>
      createSpinePopupPlayer({
        resource: {
          manifest: { type: "award-celebration" } as never,
          resources: {},
          destroy() {},
        },
      }),
    ).toThrow(/requires a spine popup/);
    const missing = spineResource();
    expect(() =>
      createSpinePopupPlayer({
        resource: { ...missing, resources: {} },
      }),
    ).toThrow(/prepared resource mismatch/);
    expect(() => createSpinePopupPlayer({ resource: spineResource() })).toThrow(
      /Spine skeleton/,
    );

    const leaf = new FakeSpinePlayer();
    const player = createSpinePopupPlayer({
      resource: spineResource(),
      playerFactory: () => leaf,
    });
    expect(() => player.start()).toThrow(/init/);
    await player.init();
    await player.init();
    expect(() => player.start("unexpected prompt")).toThrow(
      /does not define a prompt/,
    );
    expect(player.getSnapshot().phase).toBe("idle");
    expect(player.container.visible).toBe(false);
    player.requestDismiss();
    player.dismissImmediately();
    expect(player.update(0).phase).toBe("idle");
    expect(() => player.update(-1)).toThrow(/non-negative/);
    expect(() => player.update(Number.NaN)).toThrow(/non-negative/);
    player.destroy();
    expect(() => player.getSnapshot()).toThrow(/destroyed/);

    const failedLeaf = new FakeSpinePlayer();
    failedLeaf.initError = new Error("init failed");
    const failed = createSpinePopupPlayer({
      resource: spineResource(),
      playerFactory: () => failedLeaf,
    });
    await expect(failed.init()).rejects.toThrow(/init failed/);
    expect(failedLeaf.destroyCount).toBe(1);
    expect(() => failed.getSnapshot()).toThrow(/destroyed/);
  });

  it("exposes legacy prompt through the exact named text-node API", async () => {
    const leaf = new FakeSpinePlayer();
    const player = createSpinePopupPlayer({
      resource: spineResourceWithPrompt(),
      playerFactory: () => leaf,
      measurePromptText: () => ({ width: 300, height: 80 }),
    });
    await player.init();
    expect(player.textNodes.map(({ name, index }) => [name, index])).toEqual([
      ["prompt", 0],
    ]);
    const prompt = player.getTextNode("prompt");
    prompt.setText("Translated text");
    player.start();
    expect(prompt).toMatchObject({
      text: "Translated text",
      overridden: true,
    });
    player.dismissImmediately();
    prompt.resetText();
    expect(prompt.text).toBe("Press any key");
    expect(() => player.getImageStringNode(0)).toThrow(/out of range/);
    player.destroy();
    expect(() => prompt.text).toThrow(/destroyed/);
  });
});

class FakeSpinePlayer implements RendercoreSpinePlayer {
  readonly view = new Container();
  readonly plays: Array<{ animationName: string; loop: boolean }> = [];
  readonly results: Array<ReturnType<RendercoreSpinePlayer["update"]>> = [];
  resetCount = 0;
  destroyCount = 0;
  initError?: Error;
  init(): void {
    if (this.initError) throw this.initError;
  }
  play(options: { animationName: string; loop: boolean }): void {
    this.plays.push({ ...options });
  }
  update(): ReturnType<RendercoreSpinePlayer["update"]> {
    return this.results.shift() ?? { completed: false, events: [] };
  }
  reset(): void {
    this.resetCount += 1;
  }
  destroy(): void {
    this.destroyCount += 1;
  }
}

function spineResource(): PopupPackageResource<SpinePopupManifestV1> {
  const manifest: SpinePopupManifestV1 = {
    version: 1,
    kind: "popup",
    id: "free-game",
    type: "spine",
    designViewport: { width: 1080, height: 1920 },
    resources: {
      effect: {
        kind: "spine",
        skeleton: "assets/a.json",
        atlas: "assets/b.atlas",
        textures: { "effect.png": "assets/c.png" },
      },
    },
    spine: {
      resource: "effect",
      transform: { x: 12, y: 34, scale: 0.5 },
      playback: {
        mode: "segmented-animations",
        startAnimation: "start",
        loopAnimation: "loop",
        endAnimation: "end",
      },
    },
  };
  return {
    manifest,
    resources: {
      effect: {
        kind: "spine",
        resource: { skeleton: {}, atlasText: "", textureUrls: {} },
      },
    },
    destroy() {},
  };
}

function spineResourceWithPrompt(): PopupPackageResource<SpinePopupManifestV1> {
  const base = spineResource();
  return {
    ...base,
    manifest: {
      ...base.manifest,
      resources: {
        ...base.manifest.resources,
        prompt: { kind: "font", path: "assets/prompt.woff2" },
      },
      spine: {
        ...base.manifest.spine,
        prompt: {
          font: "prompt",
          defaultText: "Press any key",
          fill: "#ffffff",
          order: 1,
          area: { x: 0, y: 200, width: 600, height: 80 },
        },
      },
    },
    resources: {
      ...base.resources,
      prompt: { kind: "font", family: "popup-font" },
    },
  };
}
