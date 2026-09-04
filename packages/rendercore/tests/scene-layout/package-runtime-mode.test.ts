import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "pixi.js";
import type {
  AudioBackend,
  AudioBackendActivityState,
  AudioBackendSound,
} from "@slotclientengine/audiocore/core";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";
import type {
  PopupStringNodeHandle,
  SpinePopupPhase,
  SpinePopupRuntime,
} from "../../src/popup/index.js";

const state = vi.hoisted(() => ({
  runtime: null as any,
  variant: "landscape" as "landscape" | "portrait",
}));

vi.mock("../../src/scene-layout/runtime.js", () => ({
  createSceneLayoutRuntime: () => state.runtime,
  createPreparedSceneLayoutRuntime: () => state.runtime,
}));

import { createSceneLayoutPackageRuntime } from "../../src/scene-layout/package-runtime.js";
import { formatGameLayoutRuntimeAddress } from "../../src/scene-layout/data/runtime-address.js";
import { transitionResourceKey } from "../../src/scene-layout/resource.js";
import { singleStatePopupFixture } from "../popup/fixtures.js";

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

class StartupAudioBackend implements AudioBackend {
  readonly calls: string[] = [];
  unlockPromise: Promise<void> = Promise.resolve();

  getActivityState(): AudioBackendActivityState {
    return "active";
  }

  observeActivity(): () => void {
    return () => {};
  }

  async prepare(): Promise<AudioBackendSound> {
    throw new Error("unexpected audio prepare");
  }

  unlock(): Promise<void> {
    this.calls.push("unlock");
    return this.unlockPromise;
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
  readonly objects = [];
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
  getObject(id: string): never {
    throw new Error(`popup object not found: ${id}`);
  }
  getImageStringNode(selector: string | number): PopupStringNodeHandle {
    if (selector === "amount" || selector === 0) return this.amount;
    throw new Error(`image-string node not found: ${selector}`);
  }
  destroy() {
    this.destroyed = true;
  }
}

function modeVariants() {
  return {
    landscape: {
      x: 0,
      y: 0,
      focusRect: { x: -400, y: -240, width: 800, height: 480 },
    },
    portrait: {
      x: 0,
      y: 0,
      focusRect: { x: -400, y: -240, width: 800, height: 480 },
    },
  };
}

function allocationVariants(activeNodes: readonly string[]) {
  return {
    landscape: { activeNodes },
    portrait: { activeNodes },
  };
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
              landscape: { x: 100, y: 200, scale: 1 },
              portrait: { x: 30, y: 40, scale: 0.5 },
            },
          },
  };
  const manifest = {
    version: 7,
    kind: "scene-layout",
    id: "package-runtime-mode-test",
    main: {
      columns: 5,
      rows: 3,
      cellSize: { width: 160, height: 160 },
      gap: { x: 0, y: 0 },
    },
    nodes: [
      {
        id: "base-bg",
        order: 0,
        placements: { landscape: {}, portrait: {} },
        scope: { BaseGame: ["landscape", "portrait"] },
      },
      {
        id: "free-bg",
        order: 1,
        placements: { landscape: {}, portrait: {} },
        scope: { FreeGame: ["landscape", "portrait"] },
      },
      { id: "shared", order: 2, placements: { landscape: {}, portrait: {} } },
      {
        id: "free-only",
        order: 3,
        placements: { landscape: {}, portrait: {} },
        scope: { FreeGame: ["landscape", "portrait"] },
      },
    ],
    gameModes: {
      initialMode: "BaseGame",
      modes: [
        {
          id: "BaseGame",
          main: { enabled: true, variants: modeVariants() },
          nodeStates: {},
        },
        {
          id: "FreeGame",
          main: { enabled: true, variants: modeVariants() },
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
              placements: {
                landscape: { x: 0, y: 0, scale: 1 },
                portrait: { x: 0, y: 0, scale: 1 },
              },
            },
          },
        }
      : {}),
    audio: { version: 1, effects: [], music: [], programmaticEffects: [] },
    eventAudio: { version: 1, ignoreLegacyAudio: false, bindings: [] },
    runtimeAllocation: {
      version: 3,
      package: {
        nodes: ["base-bg", "free-bg", "shared", "free-only"],
        symbolPackages: [],
        popups: withPrelude ? ["free-entry"] : [],
      },
      onDemand: {
        transitions: withEdge ? ["BaseGame=>FreeGame"] : [],
        runtimeResources: [],
      },
      modes: {
        BaseGame: {
          variants: allocationVariants(["base-bg", "shared"]),
          symbolPackage: null,
          awardCelebrationPopup: null,
        },
        FreeGame: {
          variants: allocationVariants(["free-bg", "shared", "free-only"]),
          symbolPackage: null,
          awardCelebrationPopup: null,
        },
      },
    },
  };
  return {
    manifest,
    runtimeManifest: manifest,
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

function startupPackageResource(configured: boolean) {
  const resource = packageResource(true, false, "none") as any;
  const base = resource.runtimeManifest;
  const splashMode = {
    id: "Splash",
    main: { enabled: false, variants: modeVariants() },
    nodeStates: {},
  };
  const splashTransition = {
    from: "Splash",
    to: "BaseGame",
    overlay: { kind: "none" as const },
  };
  const manifest = {
    ...base,
    version: 8,
    gameModes: configured
      ? {
          ...base.gameModes,
          splashMode: "Splash",
          modes: [splashMode, ...base.gameModes.modes],
          transitions: [splashTransition, ...base.gameModes.transitions],
        }
      : base.gameModes,
    runtimeAllocation: configured
      ? {
          ...base.runtimeAllocation,
          onDemand: {
            ...base.runtimeAllocation.onDemand,
            transitions: [
              "Splash=>BaseGame",
              ...base.runtimeAllocation.onDemand.transitions,
            ],
          },
          modes: {
            Splash: {
              variants: allocationVariants([]),
              symbolPackage: null,
              awardCelebrationPopup: null,
            },
            ...base.runtimeAllocation.modes,
          },
        }
      : base.runtimeAllocation,
  };
  return { ...resource, manifest, runtimeManifest: manifest };
}

function startupPackageResourceWithTapInfo(configured: boolean) {
  const resource = startupPackageResource(configured);
  const objectManifest = {
    version: 1,
    kind: "popup-object",
    name: "tap-to-continue",
    resources: {},
    layers: [],
  } as const;
  return {
    ...resource,
    tapInfoObject: {
      kind: "popup-object" as const,
      manifest: objectManifest,
      resource: {
        manifest: {
          version: 9,
          kind: "popup",
          id: objectManifest.name,
          name: objectManifest.name,
          type: "single-state",
          adaptation: {
            mode: "maximized-focus",
            focus: { left: 1, right: 1, top: 1, bottom: 1 },
          },
          backdrop: {
            enabled: false,
            color: "#000000",
            alpha: 0,
            visibleStates: ["active"],
          },
          resources: {},
          audio: { version: 1, effects: [], cues: [] },
          singleState: { layers: [] },
        },
        resources: {},
        destroy: vi.fn(),
      },
    },
  };
}

describe("scene layout package event-driven game-mode transition", () => {
  beforeEach(() => {
    state.variant = "landscape";
    const container = new Container();
    state.runtime = {
      container,
      init: vi.fn(async () => undefined),
      prepareNodes: vi.fn(async () => undefined),
      applyViewport: vi.fn(() => snapshot()),
      commitPreparedGeometryManifest: vi.fn(() => null),
      commitGameMode: vi.fn(() => null),
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

  it("keeps the default black Splash until a primary click unlocks audio", async () => {
    const backend = new StartupAudioBackend();
    let releaseUnlock!: () => void;
    backend.unlockPromise = new Promise<void>((resolve) => {
      releaseUnlock = resolve;
    });
    const runtime = createSceneLayoutPackageRuntime({
      resource: startupPackageResource(false),
      audioBackend: backend,
    });
    await runtime.init();
    runtime.applyViewport({ width: 800, height: 600 });
    const splash = runtime.container.children.find(
      (child) => child.label === "scene-layout-default-splash",
    );
    expect(splash?.visible).toBe(true);
    await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
      /default Splash must be dismissed/u,
    );

    const pending = runtime.requestPrimaryGameModeAction();
    const duplicate = runtime.requestPrimaryGameModeAction();
    expect(duplicate).toBe(pending);
    expect(backend.calls).toEqual(["unlock"]);
    expect(splash?.visible).toBe(true);
    releaseUnlock();
    await pending;
    expect(splash?.visible).toBe(false);
    expect(runtime.getStableGameMode()).toBe("BaseGame");
    runtime.destroy();
  });

  it("does not create an automatic Tap info instance for the default Splash", async () => {
    const runtime = createSceneLayoutPackageRuntime({
      resource: startupPackageResourceWithTapInfo(false) as never,
      audioBackend: new StartupAudioBackend(),
    });
    await runtime.init();
    runtime.applyViewport({ width: 800, height: 600 });
    expect(
      runtime.container.getChildByLabel("scene-layout-splash-tap-info", true),
    ).toBeNull();
    runtime.destroy();
  });

  it("does not create an automatic Tap info instance for an authored Splash", async () => {
    const runtime = createSceneLayoutPackageRuntime({
      resource: startupPackageResourceWithTapInfo(true) as never,
      audioBackend: new StartupAudioBackend(),
    });
    await runtime.init();
    runtime.applyViewport({ width: 600, height: 900 });
    expect(runtime.getStableGameMode()).toBe("Splash");
    expect(
      runtime.container.getChildByLabel("scene-layout-splash-tap-info", true),
    ).toBeNull();
    runtime.destroy();
  });

  it("keeps the default Splash active after unlock failure and permits retry", async () => {
    const backend = new StartupAudioBackend();
    backend.unlockPromise = Promise.reject(new Error("unlock blocked"));
    const runtime = createSceneLayoutPackageRuntime({
      resource: startupPackageResource(false),
      audioBackend: backend,
    });
    await runtime.init();
    runtime.applyViewport({ width: 800, height: 600 });
    const splash = runtime.container.children.find(
      (child) => child.label === "scene-layout-default-splash",
    );

    await expect(runtime.requestPrimaryGameModeAction()).rejects.toThrow(
      /unlock blocked/u,
    );
    expect(splash?.visible).toBe(true);
    backend.unlockPromise = Promise.resolve();
    await runtime.requestPrimaryGameModeAction();
    expect(backend.calls).toEqual(["unlock", "unlock"]);
    expect(splash?.visible).toBe(false);
    runtime.destroy();
  });

  it("starts configured Splash audio unlock and initial transition synchronously", async () => {
    const backend = new StartupAudioBackend();
    const runtime = createSceneLayoutPackageRuntime({
      resource: startupPackageResource(true),
      audioBackend: backend,
    });
    await runtime.init();
    expect(runtime.getStableGameMode()).toBe("Splash");
    let releaseTransition!: () => void;
    const request = vi
      .spyOn(runtime, "requestGameMode")
      .mockImplementation(() => {
        backend.calls.push("transition");
        return new Promise<void>((resolve) => {
          releaseTransition = resolve;
        });
      });

    const pending = runtime.requestPrimaryGameModeAction();
    const duplicate = runtime.requestPrimaryGameModeAction();
    expect(duplicate).toBe(pending);
    expect(backend.calls).toEqual(["unlock", "transition"]);
    expect(request).toHaveBeenCalledWith("BaseGame", {});
    expect(request).toHaveBeenCalledTimes(1);
    releaseTransition();
    await pending;
    runtime.destroy();
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
    const occurrences: Array<{
      readonly sequence: number;
      readonly displayedMode: string;
    }> = [];
    const disposeEvent = runtime.addresses.bind(
      "gamelayout:/transition/BaseGame/FreeGame/effect/spine/event/SwitchScene",
      (event) =>
        occurrences.push({
          sequence: event.sequence,
          displayedMode: runtime.getGameModeSnapshot().displayedMode,
        }),
    );
    const stateEvents: string[] = [];
    const stateEventAddresses = [
      "gamelayout:/transition/BaseGame/FreeGame/lifecycle/started",
      "gamelayout:/mode/BaseGame/state/displayed/exited",
      "gamelayout:/mode/FreeGame/state/displayed/entered",
      "gamelayout:/transition/BaseGame/FreeGame/lifecycle/switched",
      "gamelayout:/mode/BaseGame/state/stable/exited",
      "gamelayout:/mode/FreeGame/state/stable/entered",
      "gamelayout:/transition/BaseGame/FreeGame/lifecycle/ended",
    ];
    const disposeStateEvents = stateEventAddresses.map((address) =>
      runtime.addresses.bind(address, (event) =>
        stateEvents.push(event.address),
      ),
    );
    runtime.applyViewport({ width: 800, height: 600 });
    state.runtime.setNodeActive.mockClear();
    const pending = runtime.requestGameMode("FreeGame");
    await vi.waitFor(() => expect(players[0]?.plays).toHaveLength(1));
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
      activeBackgroundNodes: [],
    });
    expect(occurrences).toEqual([
      { sequence: expect.any(Number), displayedMode: "FreeGame" },
    ]);
    expect(occurrences[0]!.sequence).toBeGreaterThan(0);
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
    expect(stateEvents).toEqual(stateEventAddresses);
    disposeEvent();
    for (const dispose of disposeStateEvents) dispose();
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
    await vi.waitFor(() => expect(players[0]?.plays).toHaveLength(1));
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
    await vi.waitFor(() => expect(players[0]?.plays).toHaveLength(1));
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
    await vi.waitFor(() => expect(players[0]?.plays).toHaveLength(1));
    runtime.destroy();
    await expect(pending).rejects.toThrow(/destroyed during/);
    expect(players[0].destroyed).toBe(true);
  });

  it("finishes the optional popup before starting the prepared overlay", async () => {
    const { runtime, players, popups } = createRuntime(true, true);
    await runtime.init();
    runtime.applyViewport({ width: 800, height: 600 });
    const pending = runtime.requestGameMode("FreeGame");
    await vi.waitFor(() => expect(popups[0]?.phase).toBe("loop"));
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

  it("serializes a programmatic Popup before the fixed transition prelude", async () => {
    const { runtime, players, popups } = createRuntime(true, true);
    await runtime.init();
    const address = formatGameLayoutRuntimeAddress("popup", "free-entry");
    expect(popups).toHaveLength(1);

    const first = runtime.enqueuePopup({
      address,
      type: "spine",
      text: "PROGRAM",
    });
    await expect(first.presented).resolves.toBeUndefined();
    expect(runtime.getActivePopupAddress()).toBe(address);
    const transition = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    expect(popups[0].startSnapshots).toEqual([
      { heading: "DEFAULT", amount: "0" },
    ]);
    await first.cancel();
    await expect(first.finished).resolves.toBeUndefined();
    expect(first.state).toBe("finished");
    expect(popups[0].startSnapshots).toHaveLength(2);
    expect(runtime.getGameModeSnapshot().activePreludePopup).toBe("free-entry");
    popups[0].phase = "complete";
    runtime.update(0.1);
    await vi.waitFor(() => expect(players[0]?.plays).toHaveLength(1));
    players[0].results.push({
      completed: true,
      events: [{ name: "SwitchScene" }],
    });
    runtime.update(0.1);
    await transition;
    expect(popups).toHaveLength(1);
    runtime.destroy();
  });

  it("runs queued sessions in FIFO order and stale sessions cannot close the next Popup", async () => {
    const { runtime } = createRuntime(true, true);
    await runtime.init();
    const address = formatGameLayoutRuntimeAddress("popup", "free-entry");
    const sessionStates: string[] = [];
    const disposeSessionEvents = [
      "queued",
      "opening",
      "active",
      "closing",
      "finished",
      "cancelled",
      "failed",
    ].map((stateId) =>
      runtime.addresses.bind(
        formatGameLayoutRuntimeAddress(
          "popup",
          "free-entry",
          "session",
          stateId,
        ),
        ({ detail }) => sessionStates.push(String(detail.state)),
      ),
    );
    const first = runtime.enqueuePopup({ address, type: "spine" });
    const second = runtime.enqueuePopup({ address, type: "spine" });
    const cancelled = runtime.enqueuePopup({ address, type: "spine" });

    await expect(first.presented).resolves.toBeUndefined();
    expect(first.state).toBe("active");
    expect(second.state).toBe("queued");
    await cancelled.cancel();
    expect(cancelled.state).toBe("cancelled");
    await expect(cancelled.presented).rejects.toThrow(/before presentation/);
    await expect(cancelled.finished).resolves.toBeUndefined();
    await first.cancel();
    await expect(second.presented).resolves.toBeUndefined();
    expect(second.state).toBe("active");
    await first.close();
    expect(second.state).toBe("active");
    await second.cancel();
    await expect(second.finished).resolves.toBeUndefined();
    expect(sessionStates).toEqual(
      expect.arrayContaining(["queued", "opening", "active", "cancelled"]),
    );
    for (const dispose of disposeSessionEvents) dispose();
    runtime.destroy();
  });

  it("opens a programmatic single-state Popup through the same active slot", async () => {
    const resource = packageResource(false) as any;
    resource.manifest.popups = {
      freeform: {
        type: "single-state",
        manifest: "freeform-popup.manifest.json",
        order: 2000,
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
    };
    resource.popupPackages = {
      freeform: {
        manifest: singleStatePopupFixture(),
        resources: {},
        destroy: vi.fn(),
      },
    };
    const runtime = createSceneLayoutPackageRuntime({ resource });
    await runtime.init();
    const address = formatGameLayoutRuntimeAddress("popup", "freeform");
    const session = runtime.openPopup({ address, type: "single-state" });
    expect(runtime.getActivePopupAddress()).toBe(address);
    await runtime.closePopup({ behavior: "immediate" });
    await expect(session.finished).resolves.toBeUndefined();
    expect(runtime.getActivePopupAddress()).toBeNull();
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

  it("prepares transition Popups with their source-mode delivery chunk", async () => {
    const resource = packageResource(true, true, "none") as any;
    resource.manifest.gameModes.transitions.push({
      from: "FreeGame",
      to: "BaseGame",
      preludePopup: "base-entry",
      overlay: { kind: "none" },
    });
    resource.manifest.popups["base-entry"] = {
      type: "spine",
      manifest: "base-entry-popup.manifest.json",
      order: 2001,
      placements: { default: { x: 0, y: 0, scale: 1 } },
    };
    resource.popupPackages["base-entry"] = {
      manifest: { type: "spine" },
    };
    const loadGameMode = vi.fn(async () => undefined);
    resource.delivery = {
      isGameModeReady: () => false,
      loadGameMode,
    };
    const popups: FakeSpinePopupRuntime[] = [];
    const runtime = createSceneLayoutPackageRuntime({
      resource,
      createSpinePopupRuntime: () => {
        const popup = new FakeSpinePopupRuntime();
        popups.push(popup);
        return popup;
      },
    });

    await runtime.init();
    expect(popups).toHaveLength(1);
    expect(() => runtime.update(0.1)).not.toThrow();

    const pending = runtime.requestGameMode("FreeGame");
    await vi.waitFor(() => {
      expect(loadGameMode).toHaveBeenCalledWith("FreeGame");
      expect(popups).toHaveLength(2);
    });
    popups[0]!.phase = "complete";
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

  it("commits immediately without playing Popup or transition events", async () => {
    const { runtime, players, popups } = createRuntime(true, true);
    await runtime.init();
    const events: string[] = [];
    const addresses = [
      "gamelayout:/transition/BaseGame/FreeGame/lifecycle/started",
      "gamelayout:/transition/BaseGame/FreeGame/lifecycle/switched",
      "gamelayout:/transition/BaseGame/FreeGame/lifecycle/ended",
      "gamelayout:/transition/BaseGame/FreeGame/effect/spine/event/SwitchScene",
      "gamelayout:/mode/BaseGame/state/displayed/exited",
      "gamelayout:/mode/FreeGame/state/displayed/entered",
      "gamelayout:/mode/BaseGame/state/stable/exited",
      "gamelayout:/mode/FreeGame/state/stable/entered",
    ];
    const disposers = addresses.map((address) =>
      runtime.addresses.bind(address, (event) => events.push(event.address)),
    );

    await runtime.requestGameMode("FreeGame", { immediate: true });

    expect(players).toHaveLength(0);
    expect(popups).toHaveLength(1);
    expect(popups[0].startSnapshots).toEqual([]);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      displayedMode: "FreeGame",
      targetMode: null,
      phase: "stable",
      transition: null,
      transitionKind: null,
      activePreludePopup: null,
    });
    expect(events).toEqual([
      "gamelayout:/mode/BaseGame/state/displayed/exited",
      "gamelayout:/mode/FreeGame/state/displayed/entered",
      "gamelayout:/mode/BaseGame/state/stable/exited",
      "gamelayout:/mode/FreeGame/state/stable/entered",
    ]);
    expect(state.runtime.setNodeActive.mock.calls).toContainEqual([
      "free-only",
      true,
    ]);
    for (const dispose of disposers) dispose();
    runtime.destroy();
  });

  it("reuses a prepared target while destroying its skipped overlay", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    await runtime.prepareGameModeTransition("FreeGame");
    expect(players).toHaveLength(1);
    expect(players[0].destroyed).toBe(false);

    await runtime.requestGameMode("FreeGame", { immediate: true });

    expect(players).toHaveLength(1);
    expect(players[0].plays).toEqual([]);
    expect(players[0].destroyed).toBe(true);
    expect(runtime.getStableGameMode()).toBe("FreeGame");
    runtime.destroy();
  });

  it("strictly validates immediate request options and direct edges", async () => {
    const withPrelude = createRuntime(true, true);
    await withPrelude.runtime.init();
    await expect(
      withPrelude.runtime.requestGameMode("FreeGame", {
        immediate: true,
        preludePopupStrings: [],
      }),
    ).rejects.toThrow(/must not include preludePopupStrings/);
    await expect(
      withPrelude.runtime.requestGameMode("FreeGame", {
        immediate: "yes",
      } as never),
    ).rejects.toThrow(/immediate must be a boolean/);
    expect(withPrelude.runtime.getStableGameMode()).toBe("BaseGame");
    withPrelude.runtime.destroy();

    const withoutEdge = createRuntime(false);
    await withoutEdge.runtime.init();
    await expect(
      withoutEdge.runtime.requestGameMode("FreeGame", { immediate: true }),
    ).rejects.toThrow(/No direct scene transition/);
    expect(withoutEdge.players).toHaveLength(0);
    withoutEdge.runtime.destroy();
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
