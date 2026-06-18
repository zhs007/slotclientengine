import { describe, expect, it } from "vitest";
import projectData from "../fixtures/project.json";
import { V5GCocosPlayer } from "../../src/cocos/player";
import { assertV5GProject } from "../../src/core/validation";
import type { CocosBlendModeConfig } from "../../src/cocos/blend-mode";
import type { V5GCocosNodeDriver, V5GSize } from "../../src/cocos/node-driver";
import type {
  V5GAssetConfig,
  V5GLayerConfig,
  V5GProjectConfig,
} from "../../src/core/types";

interface FakeSpriteFrame {
  id: string;
  width: number;
  height: number;
}

class FakeNode {
  active = true;
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  destroyed = false;
  width = 0;
  height = 0;
  anchorX = 0.5;
  anchorY = 0.5;
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  rotation = 0;
  opacity = 255;
  backgroundColor: number | null = null;
  spriteFrame: FakeSpriteFrame | null = null;
  blendMode: CocosBlendModeConfig | null = null;

  constructor(readonly name: string) {}
}

class FakeDriver implements V5GCocosNodeDriver<FakeNode, FakeSpriteFrame> {
  createNode(name: string): FakeNode {
    return new FakeNode(name);
  }

  appendChild(parent: FakeNode, child: FakeNode): void {
    child.parent = parent;
    parent.children.push(child);
  }

  destroyNode(node: FakeNode): void {
    node.destroyed = true;
    if (node.parent) {
      node.parent.children = node.parent.children.filter(
        (child) => child !== node,
      );
      node.parent = null;
    }
  }

  setContentSize(node: FakeNode, width: number, height: number): void {
    node.width = width;
    node.height = height;
  }

  setAnchorPoint(node: FakeNode, x: number, y: number): void {
    node.anchorX = x;
    node.anchorY = y;
  }

  setPosition(node: FakeNode, x: number, y: number): void {
    node.x = x;
    node.y = y;
  }

  setScale(node: FakeNode, x: number, y: number): void {
    node.scaleX = x;
    node.scaleY = y;
  }

  setRotationDegrees(node: FakeNode, degrees: number): void {
    node.rotation = degrees;
  }

  setOpacity(node: FakeNode, opacity: number): void {
    node.opacity = opacity;
  }

  setActive(node: FakeNode, active: boolean): void {
    node.active = active;
  }

  createBackgroundNode(
    name: string,
    color: number,
    width: number,
    height: number,
  ): FakeNode {
    const node = new FakeNode(name);
    node.backgroundColor = color;
    node.width = width;
    node.height = height;
    return node;
  }

  createImageNode(name: string, spriteFrame: FakeSpriteFrame): FakeNode {
    const node = new FakeNode(name);
    node.spriteFrame = spriteFrame;
    return node;
  }

  getSpriteFrameSize(spriteFrame: FakeSpriteFrame): V5GSize | null {
    return {
      width: spriteFrame.width,
      height: spriteFrame.height,
    };
  }

  applyBlendMode(node: FakeNode, config: CocosBlendModeConfig): void {
    node.blendMode = config;
  }
}

function sampleProject(): V5GProjectConfig {
  return structuredClone(assertV5GProject(projectData));
}

function tinyProject(
  layerOverrides: Partial<V5GLayerConfig> = {},
  assetOverrides: Partial<V5GAssetConfig> = {},
): V5GProjectConfig {
  return {
    schemaVersion: "V5G_0.0014",
    editor: { name: "victory_editor_v5_g", version: "V5G_0.0014" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "tiny",
    stage: {
      width: 320,
      height: 240,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#101827",
    },
    assets: [
      {
        id: "asset-1",
        type: "image",
        path: "assets/a.png",
        originalName: "a.png",
        width: 100,
        height: 50,
        ...assetOverrides,
      },
    ],
    layers: [
      {
        id: "layer-1",
        name: "Layer 1",
        type: "image",
        assetId: "asset-1",
        parentId: null,
        visible: true,
        locked: false,
        transform: {
          x: 100,
          y: 50,
          scaleX: -1,
          scaleY: 2,
          rotation: 30,
          anchorX: 0.25,
          anchorY: 0.75,
        },
        opacity: 0.5,
        blendMode: "add",
        animations: [],
        keyframes: [],
        ...layerOverrides,
      },
    ],
    particles: [],
  };
}

function framesFor(project: V5GProjectConfig): Map<string, FakeSpriteFrame> {
  return new Map(
    project.assets.map((asset) => [
      asset.id,
      {
        id: asset.id,
        width: asset.fileWidth ?? asset.width,
        height: asset.fileHeight ?? asset.height,
      },
    ]),
  );
}

function makePlayer(project = tinyProject()): {
  root: FakeNode;
  driver: FakeDriver;
  player: V5GCocosPlayer<FakeNode, FakeSpriteFrame>;
  frames: Map<string, FakeSpriteFrame>;
} {
  const root = new FakeNode("Root");
  const driver = new FakeDriver();
  const frames = framesFor(project);
  const player = new V5GCocosPlayer({
    root,
    project,
    assets: {
      getSpriteFrame(_assetPath, assetId) {
        return frames.get(assetId) ?? null;
      },
    },
    driver,
  });
  return { root, driver, player, frames };
}

describe("V5GCocosPlayer", () => {
  it("creates a stage background below layers and preserves layer order", () => {
    const project = sampleProject();
    const { root, player } = makePlayer(project);
    player.init();

    const stage = root.children[0];
    expect(stage.name).toBe("V5G Stage");
    expect(stage.width).toBe(project.stage.width);
    expect(stage.height).toBe(project.stage.height);
    expect(stage.children[0].name).toBe("V5G Background");
    expect(stage.children[0].backgroundColor).toBe(0x101827);
    expect(stage.children[1].name).toBe("V5G Content");
    expect(stage.children[2].name).toBe("V5G Particles");
    expect(stage.children[1].children.map((node) => node.name)).toEqual(
      project.layers.map((layer) => layer.name),
    );
  });

  it("writes sampled transform, opacity, active state, and normalizes blend mode on seek", () => {
    const { root, player } = makePlayer(tinyProject());
    player.init();

    const layerNode = root.children[0].children[1].children[0];
    expect(layerNode.x).toBe(100);
    expect(layerNode.y).toBe(50);
    expect(layerNode.scaleX).toBe(-1);
    expect(layerNode.scaleY).toBe(2);
    expect(layerNode.rotation).toBe(30);
    expect(layerNode.opacity).toBe(128);
    expect(layerNode.active).toBe(true);
    expect(layerNode.anchorX).toBe(0.25);
    expect(layerNode.anchorY).toBe(0.75);
    expect(layerNode.blendMode).toEqual({ mode: "normal" });
  });

  it("fails when an asset resolver cannot provide a SpriteFrame", () => {
    const project = tinyProject();
    const root = new FakeNode("Root");
    const player = new V5GCocosPlayer({
      root,
      project,
      assets: {
        getSpriteFrame() {
          return null;
        },
      },
      driver: new FakeDriver(),
    });

    expect(() => player.init()).toThrow(
      'Missing Cocos SpriteFrame for V5G asset "asset-1" at "assets/a.png"',
    );
    expect(root.children).toHaveLength(0);
  });

  it("fails on SpriteFrame size mismatch when size can be read", () => {
    const project = tinyProject();
    const { frames, player } = makePlayer(project);
    frames.set("asset-1", { id: "asset-1", width: 99, height: 50 });

    expect(() => player.init()).toThrow(
      'Cocos SpriteFrame size mismatch for V5G asset "asset-1"',
    );
  });

  it("validates compressed SpriteFrame file size while keeping logical node size", () => {
    const project = tinyProject(
      {},
      {
        width: 100,
        height: 50,
        fileWidth: 50,
        fileHeight: 25,
        fileScale: 0.5,
      },
    );
    project.schemaVersion = "VNI_0.002";
    project.editor = { name: "VNI", version: "VNI_0.002" };
    project.exportProfile = {
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
    };

    const { root, frames, player } = makePlayer(project);
    frames.set("asset-1", { id: "asset-1", width: 50, height: 25 });
    player.init();

    const layerNode = root.children[0].children[1].children[0];
    expect(layerNode.width).toBe(100);
    expect(layerNode.height).toBe(50);
    expect(layerNode.scaleX).toBe(-1);
    expect(layerNode.scaleY).toBe(2);

    const wrongSize = makePlayer(project);
    wrongSize.frames.set("asset-1", { id: "asset-1", width: 100, height: 50 });
    expect(() => wrongSize.player.init()).toThrow(
      "logical 100x50, expected file 50x25, got 100x50",
    );
  });

  it("advances time through explicit update and loops by default", () => {
    const timeChanges: number[] = [];
    const playingChanges: boolean[] = [];
    const project = tinyProject();
    const root = new FakeNode("Root");
    const driver = new FakeDriver();
    const frames = framesFor(project);
    const player = new V5GCocosPlayer({
      root,
      project,
      assets: {
        getSpriteFrame(_assetPath, assetId) {
          return frames.get(assetId) ?? null;
        },
      },
      driver,
      onTimeChange: (time) => timeChanges.push(time),
      onPlayingChange: (playing) => playingChanges.push(playing),
    });

    player.init();
    player.play();
    player.update(0.75);
    player.update(0.5);

    expect(player.time).toBe(0.25);
    expect(player.playing).toBe(true);
    expect(timeChanges).toEqual([0, 0.75, 1, 0.25]);
    expect(playingChanges).toEqual([true]);
  });

  it("stops at duration when loop is disabled", () => {
    const { player } = makePlayer(tinyProject());
    player.init();
    player.setLoop(false);
    player.play();
    player.update(1.2);

    expect(player.time).toBe(1);
    expect(player.playing).toBe(false);
  });

  it("plays a non-looping time range to its exact end and emits marker before complete", () => {
    const { player } = makePlayer(tinyProject());
    const events: string[] = [];
    const complete: unknown[] = [];
    player.init();
    player.addPlaybackEvent({
      id: "range-end",
      at: { unit: "time", at: 0.4 },
      listener(event) {
        events.push(`${event.id}:${event.loopIndex}`);
      },
    });
    player.onPlaybackComplete((event) => {
      events.push("complete");
      complete.push(event);
    });

    player.playRange({
      range: { unit: "time", start: 0, end: 0.4 },
      loop: false,
    });
    player.update(0.4);

    expect(player.time).toBe(0.4);
    expect(player.playing).toBe(false);
    expect(events).toEqual(["range-end:0", "complete"]);
    expect(complete).toEqual([
      { startTime: 0, endTime: 0.4, currentTime: 0.4, loopIndex: 0 },
    ]);
  });

  it("loops inside a time range and keeps play() resume scoped to the active range", () => {
    const { player } = makePlayer(tinyProject());
    player.init();

    player.playRange({
      range: { unit: "time", start: 0.2, end: 0.6 },
      loop: true,
    });
    player.update(0.5);
    expect(player.time).toBeCloseTo(0.3, 5);
    expect(player.playing).toBe(true);

    player.pause();
    player.update(0.3);
    expect(player.time).toBeCloseTo(0.3, 5);
    player.play();
    player.update(0.2);
    expect(player.time).toBeCloseTo(0.5, 5);
  });

  it("converts frame ranges with an explicit fps", () => {
    const { player } = makePlayer(tinyProject());
    const complete: unknown[] = [];
    player.init();
    player.onPlaybackComplete((event) => complete.push(event));

    player.playRange({
      range: { unit: "frame", start: 30, end: 60, fps: 60 },
      loop: false,
    });
    expect(player.time).toBe(0.5);
    player.update(0.5);

    expect(player.time).toBe(1);
    expect(player.playing).toBe(false);
    expect(complete).toEqual([
      { startTime: 0.5, endTime: 1, currentTime: 1, loopIndex: 0 },
    ]);
  });

  it("rejects invalid range and marker inputs without guessing fps", () => {
    const { player } = makePlayer(tinyProject());
    player.init();
    const missingFpsRange = {
      unit: "frame",
      start: 0,
      end: 1,
    } as unknown as Parameters<typeof player.playRange>[0]["range"];

    expect(() => player.playRange({ range: missingFpsRange })).toThrow(
      "V5GCocosPlayer.playRange range.fps",
    );
    expect(() =>
      player.playRange({
        range: { unit: "frame", start: 0.5, end: 2, fps: 60 },
      }),
    ).toThrow("V5GCocosPlayer.playRange range.start");
    expect(() =>
      player.playRange({
        range: { unit: "frame", start: 0, end: 2, fps: 0 },
      }),
    ).toThrow("V5GCocosPlayer.playRange range.fps");
    expect(() =>
      player.playRange({ range: { unit: "time", start: 0.4, end: 0.4 } }),
    ).toThrow("range.start must be less than range.end");
    expect(() =>
      player.playRange({ range: { unit: "time", start: 0, end: 1.1 } }),
    ).toThrow("range.end must be <= project.stage.duration");
    expect(() =>
      player.addPlaybackEvent({
        id: "bad-frame",
        at: { unit: "frame", at: 1, fps: 0 },
        listener() {},
      }),
    ).toThrow("V5GCocosPlayer.addPlaybackEvent fps");
    expect(() =>
      player.addPlaybackEvent({
        id: "too-late",
        at: { unit: "time", at: 1.1 },
        listener() {},
      }),
    ).toThrow("between 0 and project.stage.duration");
  });

  it("fires time and frame markers crossed by a large delta in timeline order", () => {
    const { player } = makePlayer(tinyProject());
    const events: string[] = [];
    player.init();
    player.addPlaybackEvent({
      id: "time",
      at: { unit: "time", at: 0.3 },
      listener: (event) => events.push(`${event.id}:${event.currentTime}`),
    });
    player.addPlaybackEvent({
      id: "frame",
      at: { unit: "frame", at: 24, fps: 60 },
      listener: (event) => events.push(`${event.id}:${event.currentTime}`),
    });

    player.playRange({
      range: { unit: "time", start: 0, end: 0.5 },
      loop: false,
    });
    player.update(0.5);

    expect(events).toEqual(["time:0.5", "frame:0.5"]);
  });

  it("fires looping markers once per crossed cycle and removes once markers before callbacks", () => {
    const { player } = makePlayer(tinyProject());
    const repeated: number[] = [];
    const onceHits: number[] = [];
    player.init();
    player.addPlaybackEvent({
      id: "repeated",
      at: { unit: "time", at: 0.3 },
      listener: (event) => repeated.push(event.loopIndex),
    });
    player.addPlaybackEvent({
      id: "once",
      at: { unit: "time", at: 0.35 },
      once: true,
      listener: (event) => onceHits.push(event.loopIndex),
    });

    player.playRange({
      range: { unit: "time", start: 0.2, end: 0.4 },
      loop: true,
    });
    player.update(0.65);

    expect(player.time).toBeCloseTo(0.25, 5);
    expect(repeated).toEqual([0, 1, 2]);
    expect(onceHits).toEqual([0]);
    expect(() => player.clearPlaybackEvent("once")).toThrow("unknown id");
  });

  it("supports event and complete disposers and fails on unknown event clears", () => {
    const { player } = makePlayer(tinyProject());
    const events: string[] = [];
    player.init();
    const disposeEvent = player.addPlaybackEvent({
      id: "marker",
      at: { unit: "time", at: 0.2 },
      listener: () => events.push("marker"),
    });
    const disposeComplete = player.onPlaybackComplete(() => {
      events.push("complete");
    });

    disposeEvent();
    disposeEvent();
    disposeComplete();
    disposeComplete();
    expect(() => player.clearPlaybackEvent("marker")).toThrow("unknown id");

    player.setLoop(false);
    player.play();
    player.update(1);
    expect(events).toEqual([]);
  });

  it("does not trigger markers on seek, pause, or restart and restart clears active range", () => {
    const { player } = makePlayer(tinyProject());
    const events: string[] = [];
    player.init();
    player.addPlaybackEvent({
      id: "marker",
      at: { unit: "time", at: 0.3 },
      listener: () => events.push("marker"),
    });

    player.seek(0.4);
    expect(events).toEqual([]);

    player.playRange({
      range: { unit: "time", start: 0, end: 0.4 },
      loop: false,
    });
    player.pause();
    player.update(0.35);
    expect(events).toEqual([]);

    player.play();
    player.restart();
    player.update(0.5);
    expect(player.time).toBe(0.5);
    expect(player.playing).toBe(true);
    expect(events).toEqual(["marker"]);
  });

  it("propagates marker and complete listener errors", () => {
    const { player } = makePlayer(tinyProject());
    player.init();
    player.addPlaybackEvent({
      id: "throw-once",
      at: { unit: "time", at: 0.2 },
      once: true,
      listener() {
        throw new Error("marker failed");
      },
    });
    player.playRange({
      range: { unit: "time", start: 0, end: 0.4 },
      loop: false,
    });

    expect(() => player.update(0.2)).toThrow("marker failed");
    expect(() => player.clearPlaybackEvent("throw-once")).toThrow("unknown id");

    const { player: completePlayer } = makePlayer(tinyProject());
    completePlayer.init();
    completePlayer.onPlaybackComplete(() => {
      throw new Error("complete failed");
    });
    completePlayer.setLoop(false);
    completePlayer.play();
    expect(() => completePlayer.update(1)).toThrow("complete failed");
  });

  it("emits complete for the old full-duration non-looping play task", () => {
    const { player } = makePlayer(tinyProject());
    const complete: unknown[] = [];
    player.init();
    player.onPlaybackComplete((event) => complete.push(event));
    player.setLoop(false);
    player.play();
    player.update(1);

    expect(player.time).toBe(1);
    expect(player.playing).toBe(false);
    expect(complete).toEqual([
      { startTime: 0, endTime: 1, currentTime: 1, loopIndex: 0 },
    ]);
  });

  it("renders active layer particles above the content root and clears old particles", () => {
    const project = tinyProject({
      animations: [
        {
          id: "burst",
          type: "particles",
          startTime: 0,
          duration: 1,
          enabled: true,
          seed: 9,
          params: {
            count: 3,
            spread: 20,
            speed: 30,
            size: 10,
            gravity: 0,
          },
        },
      ],
    });
    const { root, player } = makePlayer(project);
    player.init();

    const stage = root.children[0];
    const content = stage.children[1];
    const particleRoot = stage.children[2];
    expect(content.children[0].active).toBe(false);
    expect(particleRoot.children).toHaveLength(3);

    const firstParticle = particleRoot.children[0];
    player.seek(0.5);

    expect(firstParticle.destroyed).toBe(true);
    expect(particleRoot.children).toHaveLength(3);
    expect(particleRoot.children[0].spriteFrame?.id).toBe("asset-1");
    expect(particleRoot.children[0].width).toBe(project.assets[0].width);
    expect(particleRoot.children[0].height).toBe(project.assets[0].height);
    expect(Number.isFinite(particleRoot.children[0].rotation)).toBe(true);
  });

  it("restart seeks to zero and destroy only removes runtime nodes", () => {
    const { root, player } = makePlayer(tinyProject());
    player.init();
    const stage = root.children[0];
    player.play();
    player.update(0.5);
    player.restart();
    expect(player.time).toBe(0);

    player.destroy();
    expect(stage.destroyed).toBe(true);
    expect(root.destroyed).toBe(false);
    expect(root.children).toHaveLength(0);
    expect(player.playing).toBe(false);
  });
});
