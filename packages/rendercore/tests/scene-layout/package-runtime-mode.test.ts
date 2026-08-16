import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "pixi.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";
import type {
  PopupStringNodeHandle,
  SpinePopupPhase,
  SpinePopupRuntime,
} from "../../src/popup/index.js";

const state = vi.hoisted(() => ({
  runtime: null as any,
  variant: "default" as "default" | "portrait",
}));

vi.mock("../../src/scene-layout/runtime.js", () => ({
  createSceneLayoutRuntime: () => state.runtime,
}));

import { createSceneLayoutPackageRuntime } from "../../src/scene-layout/package-runtime.js";
import { transitionResourceKey } from "../../src/scene-layout/resource.js";

class FakeTransitionPlayer implements RendercoreSpinePlayer {
  readonly view = new Container();
  readonly plays: Array<{ animationName: string; loop: boolean }> = [];
  readonly results: Array<{
    completed: boolean;
    events: readonly { readonly name: string }[];
  }> = [];
  destroyed = false;

  init() {}
  play(options: { animationName: string; loop: boolean }) {
    this.plays.push(options);
  }
  update() {
    return this.results.shift() ?? { completed: false, events: [] };
  }
  reset() {
    this.results.length = 0;
  }
  destroy() {
    this.destroyed = true;
    this.view.parent?.removeChild(this.view);
  }
}

class FakePopupStringNode implements PopupStringNodeHandle {
  readonly index = 0;
  #text: string;
  #overridden = false;

  constructor(
    readonly kind: "text" | "image-string",
    readonly name: string,
    readonly defaultText: string,
    readonly rejectedText?: string,
  ) {
    this.#text = defaultText;
  }

  get text() {
    return this.#text;
  }

  get overridden() {
    return this.#overridden;
  }

  setText(text: string) {
    if (text === this.rejectedText) throw new Error(`rejected text: ${text}`);
    this.#text = text;
    this.#overridden = true;
  }

  resetText() {
    this.#text = this.defaultText;
    this.#overridden = false;
  }
}

class FakeSpinePopupRuntime implements SpinePopupRuntime {
  readonly container = new Container();
  readonly heading = new FakePopupStringNode("text", "heading", "DEFAULT");
  readonly amount = new FakePopupStringNode(
    "image-string",
    "amount",
    "0",
    "BAD",
  );
  readonly textNodes: readonly PopupStringNodeHandle[] = [this.heading];
  readonly imageStringNodes: readonly PopupStringNodeHandle[] = [this.amount];
  readonly startSnapshots: Array<{ heading: string; amount: string }> = [];
  phase: SpinePopupPhase = "idle";
  dismissRequested = false;
  destroyed = false;

  async init() {}
  start() {
    this.startSnapshots.push({
      heading: this.heading.text,
      amount: this.amount.text,
    });
    this.phase = "loop";
    this.dismissRequested = false;
  }
  update() {}
  requestDismiss() {
    this.dismissRequested = true;
  }
  dismissImmediately() {
    this.phase = "complete";
  }
  getPhase() {
    return this.phase;
  }
  isPlaying() {
    return !["idle", "complete"].includes(this.phase);
  }
  getTextNode(selector: string | number): PopupStringNodeHandle {
    if (selector === "heading" || selector === 0) return this.heading;
    throw new Error(`text node not found: ${selector}`);
  }
  getImageStringNode(selector: string | number): PopupStringNodeHandle {
    if (selector === "amount" || selector === 0) return this.amount;
    throw new Error(`image-string node not found: ${selector}`);
  }
  destroy() {
    this.destroyed = true;
  }
}

function packageResource(
  withEdge = true,
  withPrelude = false,
  effect: "spine" | "none" = "spine",
) {
  const transition = {
    from: "BaseGame",
    to: "FreeGame",
    ...(withPrelude ? { preludePopup: "free-entry" } : {}),
    overlay:
      effect === "none"
        ? { kind: "none" as const }
        : {
            resource: {
              kind: "spine" as const,
              skeleton: "assets/transition.json",
              atlas: "assets/transition.atlas",
              textures: { "transition.png": "assets/transition.png" },
            },
            animation: "BG_FG",
            switchEvent: "SwitchScene",
            placements: {
              default: { x: 100, y: 200, scale: 1 },
              portrait: { x: 30, y: 40, scale: 0.5 },
            },
          },
  };
  return {
    manifest: {
      nodes: [
        { id: "base-bg", order: 0 },
        { id: "free-bg", order: 1 },
        { id: "shared", order: 2 },
        { id: "free-only", order: 3, gameMode: "FreeGame" },
      ],
      reels: {},
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            backgroundNodes: { default: "base-bg" },
            nodeStates: {},
          },
          {
            id: "FreeGame",
            backgroundNodes: { default: "free-bg" },
            nodeStates: {},
          },
        ],
        transitions: withEdge ? [transition] : [],
      },
      ...(withPrelude
        ? {
            popups: {
              "free-entry": {
                type: "spine",
                manifest: "free-entry-popup.manifest.json",
                order: 2000,
                placements: { default: { x: 0, y: 0, scale: 1 } },
              },
            },
          }
        : {}),
    },
    layout: {
      spineResources: {
        [transitionResourceKey("BaseGame", "FreeGame")]: {
          skeleton: {},
          atlasText: "atlas",
          textureUrls: {},
        },
      },
    },
    symbolPackage: null,
    symbolPackages: {},
    popupPackages: withPrelude
      ? { "free-entry": { manifest: { type: "spine" } } }
      : {},
    destroy: vi.fn(),
  };
}

function createRuntime(
  withEdge = true,
  withPrelude = false,
  effect: "spine" | "none" = "spine",
) {
  const players: FakeTransitionPlayer[] = [];
  const popups: FakeSpinePopupRuntime[] = [];
  const runtime = createSceneLayoutPackageRuntime({
    resource: packageResource(withEdge, withPrelude, effect) as never,
    createTransitionPlayer: () => {
      const player = new FakeTransitionPlayer();
      players.push(player);
      return player;
    },
    createSpinePopupRuntime: () => {
      const popup = new FakeSpinePopupRuntime();
      popups.push(popup);
      return popup;
    },
  });
  return { runtime, players, popups };
}

describe("scene layout package event-driven game-mode transition", () => {
  beforeEach(() => {
    state.variant = "default";
    const container = new Container();
    state.runtime = {
      container,
      init: vi.fn(async () => undefined),
      applyViewport: vi.fn(() => snapshot()),
      update: vi.fn(),
      getSnapshot: vi.fn(() => snapshot()),
      getNode: vi.fn(),
      attachChild: vi.fn(),
      attachRelative: vi.fn(),
      getReelGrid: vi.fn(),
      getImageStringNodeNames: vi.fn(() => []),
      setImageStringText: vi.fn(),
      getImageStringText: vi.fn(),
      canRequestNodeState: vi.fn(),
      requestNodeState: vi.fn(),
      getNodeStateSnapshot: vi.fn(),
      setNodeActive: vi.fn(),
      destroy: vi.fn(),
    };
  });

  it("rejects a missing directed edge before visible mutation", async () => {
    const { runtime, players } = createRuntime(false);
    await runtime.init();
    state.runtime.setNodeActive.mockClear();
    await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
      /No direct scene transition/,
    );
    expect(players).toHaveLength(0);
    expect(state.runtime.setNodeActive).not.toHaveBeenCalled();
    runtime.destroy();
  });

  it("commits the complete lower scene at the event and settles at completion", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    runtime.applyViewport({ width: 800, height: 600 });
    state.runtime.setNodeActive.mockClear();
    const pending = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    const player = players[0];
    expect(player.plays).toEqual([{ animationName: "BG_FG", loop: false }]);
    expect(player.view.position).toMatchObject({ x: 100, y: 200 });
    expect(runtime.container.children.at(-1)?.label).toBe(
      "scene-transition-video-blackout",
    );
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      targetMode: "FreeGame",
      transitionPhase: "before-switch",
    });
    state.variant = "portrait";
    runtime.applyViewport({ width: 600, height: 800 });
    expect(player.view.position).toMatchObject({ x: 30, y: 40 });
    expect(player.view.scale).toMatchObject({ x: 0.5, y: 0.5 });
    expect(player.plays).toHaveLength(1);
    player.results.push({
      completed: false,
      events: [{ name: "SwitchScene" }],
    });
    runtime.update(0.5);
    expect(state.runtime.setNodeActive.mock.calls).toEqual([
      ["base-bg", false],
      ["free-bg", true],
      ["shared", true],
      ["free-only", true],
    ]);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "FreeGame",
      transitionPhase: "after-switch",
      activeBackgroundNodes: ["free-bg"],
    });
    expect(player.destroyed).toBe(false);
    player.results.push({ completed: true, events: [] });
    runtime.update(0.5);
    await pending;
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      displayedMode: "FreeGame",
      targetMode: null,
      transitionPhase: null,
    });
    expect(state.runtime.requestNodeState).not.toHaveBeenCalled();
    runtime.destroy();
  });

  it("selects an authoring mode without playing a production transition", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    expect(state.runtime.setNodeActive.mock.calls).toEqual([
      ["base-bg", true],
      ["free-bg", false],
      ["shared", true],
      ["free-only", false],
    ]);
    state.runtime.setNodeActive.mockClear();

    await runtime.selectAuthoringGameMode("FreeGame");

    expect(players).toHaveLength(0);
    expect(state.runtime.setNodeActive.mock.calls).toEqual([
      ["base-bg", false],
      ["free-bg", true],
      ["shared", true],
      ["free-only", true],
    ]);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      displayedMode: "FreeGame",
      targetMode: null,
      transitionPhase: null,
    });
    runtime.destroy();
  });

  it("processes event before completion in one large update", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    const pending = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    players[0].results.push({
      completed: true,
      events: [{ name: "SwitchScene" }],
    });
    runtime.update(10);
    await pending;
    expect(runtime.getGameModeSnapshot().stableMode).toBe("FreeGame");
    runtime.destroy();
  });

  it("rejects completion without the switch event and preserves the source", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    const pending = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    players[0].results.push({ completed: true, events: [] });
    runtime.update(1);
    await expect(pending).rejects.toThrow(/completed without switch event/);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      phase: "stable",
    });
    runtime.destroy();
  });

  it("rejects a pending request and destroys its overlay", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    const pending = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    runtime.destroy();
    await expect(pending).rejects.toThrow(/destroyed during/);
    expect(players[0].destroyed).toBe(true);
  });

  it("finishes the optional popup before starting the prepared overlay", async () => {
    const { runtime, players, popups } = createRuntime(true, true);
    await runtime.init();
    runtime.applyViewport({ width: 800, height: 600 });
    const pending = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    expect(popups[0].phase).toBe("loop");
    expect(players[0].plays).toEqual([]);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      targetMode: "FreeGame",
      transitionPhase: "popup",
      activePreludePopup: "free-entry",
    });

    const popupPresentation = runtime.getPopupPresentation();
    const canvas = new EventTarget();
    const keyboard = new EventTarget();
    const errors: unknown[] = [];
    const disposeInput = runtime.bindPopupInput({
      canvas,
      keyboardTarget: keyboard,
      onError: (error) => errors.push(error),
    });
    expect(popupPresentation.eventMode).toBe("none");
    expect(popupPresentation.hitArea?.contains(799, 599)).toBe(true);
    canvas.dispatchEvent(new Event("pointerdown"));
    expect(popups[0].dismissRequested).toBe(true);
    expect(errors).toEqual([]);
    expect(() =>
      runtime.bindPopupInput({
        canvas,
        keyboardTarget: keyboard,
        onError: () => undefined,
      }),
    ).toThrow(/already bound/);
    popups[0].phase = "complete";
    runtime.update(0.1);
    await Promise.resolve();
    expect(popupPresentation.eventMode).toBe("none");
    expect(players[0].plays).toEqual([{ animationName: "BG_FG", loop: false }]);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      transitionPhase: "before-switch",
      activePreludePopup: null,
    });
    players[0].results.push({
      completed: true,
      events: [{ name: "SwitchScene" }],
    });
    runtime.update(0.1);
    await pending;
    disposeInput();
    disposeInput();
    expect(runtime.getGameModeSnapshot().stableMode).toBe("FreeGame");
    runtime.destroy();
  });

  it("scopes exact Popup strings to one transition prelude", async () => {
    const { runtime, players, popups } = createRuntime(true, true);
    await runtime.init();
    popups[0].heading.setText("PERSISTENT");

    const pending = runtime.requestGameMode("FreeGame", {
      preludePopupStrings: [
        { kind: "text", name: "heading", text: "LOCALIZED" },
        { kind: "image-string", name: "amount", text: "123.45" },
      ],
    });
    await Promise.resolve();

    expect(popups[0].startSnapshots).toEqual([
      { heading: "LOCALIZED", amount: "123.45" },
    ]);
    expect(popups[0].heading.overridden).toBe(true);
    expect(popups[0].amount.overridden).toBe(true);

    popups[0].phase = "complete";
    runtime.update(0.1);
    await Promise.resolve();
    expect(popups[0].heading.text).toBe("PERSISTENT");
    expect(popups[0].heading.overridden).toBe(true);
    expect(popups[0].amount.text).toBe("0");
    expect(popups[0].amount.overridden).toBe(false);

    players[0].results.push({
      completed: true,
      events: [{ name: "SwitchScene" }],
    });
    runtime.update(0.1);
    await pending;
    runtime.destroy();
  });

  it("rolls back Popup strings when one input fails", async () => {
    const { runtime, popups } = createRuntime(true, true, "none");
    await runtime.init();

    await expect(
      runtime.requestGameMode("FreeGame", {
        preludePopupStrings: [
          { kind: "text", name: "heading", text: "LOCALIZED" },
          { kind: "image-string", name: "amount", text: "BAD" },
        ],
      }),
    ).rejects.toThrow(/rejected text/);

    expect(popups[0].phase).toBe("idle");
    expect(popups[0].heading.text).toBe("DEFAULT");
    expect(popups[0].heading.overridden).toBe(false);
    expect(popups[0].amount.text).toBe("0");
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      targetMode: null,
      activePreludePopup: null,
    });
    runtime.destroy();
  });

  it("restores scoped Popup strings when the runtime is destroyed", async () => {
    const { runtime, popups } = createRuntime(true, true, "none");
    await runtime.init();
    const pending = runtime.requestGameMode("FreeGame", {
      preludePopupStrings: [
        { kind: "text", name: "heading", text: "LOCALIZED" },
      ],
    });
    await Promise.resolve();
    expect(popups[0].heading.text).toBe("LOCALIZED");

    runtime.destroy();

    await expect(pending).rejects.toThrow(/destroyed during/);
    expect(popups[0].heading.text).toBe("DEFAULT");
    expect(popups[0].heading.overridden).toBe(false);
  });

  it("rejects prelude Popup strings when the edge has no prelude", async () => {
    const { runtime } = createRuntime(true, false, "none");
    await runtime.init();
    await expect(
      runtime.requestGameMode("FreeGame", {
        preludePopupStrings: [
          { kind: "text", name: "heading", text: "LOCALIZED" },
        ],
      }),
    ).rejects.toThrow(/has no prelude Popup/);
    expect(runtime.getGameModeSnapshot().stableMode).toBe("BaseGame");
    runtime.destroy();
  });

  it("commits an explicit no-effect edge directly or after its optional popup", async () => {
    const direct = createRuntime(true, false, "none");
    await direct.runtime.init();
    await direct.runtime.requestGameMode("FreeGame");
    expect(direct.players).toHaveLength(0);
    expect(direct.runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      displayedMode: "FreeGame",
      phase: "stable",
    });
    direct.runtime.destroy();

    const withPopup = createRuntime(true, true, "none");
    await withPopup.runtime.init();
    const pending = withPopup.runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    expect(withPopup.runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      transitionKind: "none",
      transitionPhase: "popup",
    });
    withPopup.popups[0].phase = "complete";
    withPopup.runtime.update(0.1);
    await pending;
    expect(withPopup.players).toHaveLength(0);
    expect(withPopup.runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      displayedMode: "FreeGame",
      phase: "stable",
    });
    withPopup.runtime.destroy();
  });

  it("rejects a second request while the first target is still preparing", async () => {
    const { runtime } = createRuntime();
    await runtime.init();
    const pending = runtime.requestGameMode("FreeGame");
    await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
      /already in progress/,
    );
    runtime.destroy();
    await expect(pending).rejects.toThrow(/destroyed/);
  });
});

function snapshot() {
  return {
    variantId: state.variant,
    reels: {},
    artSize: { width: 1000, height: 1000 },
    artRect: { x: 0, y: 0, width: 1000, height: 1000 },
    viewportSize: { width: 800, height: 600 },
    worldOffset: { x: 0, y: 0 },
    scale: 1,
  };
}
