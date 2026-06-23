import { describe, expect, it } from "vitest";
import { Node, Sprite, SpriteFrame, UITransform, UIOpacity } from "cc";
import {
  createV5GCocosPlayer,
  getCocosBlendModeConfig,
  type V5GAnimationConfig,
  type V5GAssetConfig,
  type V5GLayerConfig,
  type V5GCocosPlayer,
  type V5GProjectConfig,
} from "../../standalone/anieditorv5runtime-cc";

const COCOS_BLEND_FACTOR = {
  ONE: 1,
  SRC_ALPHA: 2,
} as const;

const COCOS_BLEND_OP = {
  ADD: 0,
} as const;

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

function particleWallAnimation(
  overrides: Partial<V5GAnimationConfig> = {},
): V5GAnimationConfig {
  return {
    id: "wall",
    type: "particle_wall",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 11,
    params: {
      emitterWidth: 100,
      direction: 270,
      spreadAngle: 15,
      speed: 80,
      lifetimeMin: 0.5,
      lifetimeMax: 1,
      spawnRate: 20,
      size: 24,
      gravity: 0,
      startScaleMin: 0.6,
      startScaleMax: 1,
      endScaleMin: 0.3,
      endScaleMax: 0.8,
      fadeOut: true,
    },
    ...overrides,
  };
}

function framesFor(project: V5GProjectConfig): Map<string, SpriteFrame> {
  return new Map(
    project.assets.map((asset) => [
      asset.id,
      makeSpriteFrame(
        asset.fileWidth ?? asset.width,
        asset.fileHeight ?? asset.height,
      ),
    ]),
  );
}

function makePlayer(project = tinyProject()): {
  root: Node;
  player: V5GCocosPlayer;
  frames: Map<string, SpriteFrame>;
} {
  const root = new Node("Root");
  const frames = framesFor(project);
  const player = createV5GCocosPlayer({
    root,
    project,
    assets: {
      getSpriteFrame(_assetPath, assetId) {
        return frames.get(assetId) ?? null;
      },
    },
  });
  return { root, player, frames };
}

describe("standalone V5GCocosPlayer", () => {
  it("creates stage content and particle roots without a background node", () => {
    const project = tinyProject();
    const root = new Node("Root");
    const frames = framesFor(project);
    const player = createV5GCocosPlayer({
      root,
      project,
      assets: {
        getSpriteFrame(_assetPath, assetId) {
          return frames.get(assetId) ?? null;
        },
      },
    });

    player.init();

    const stage = root.children[0];
    expect(stage.name).toBe("V5G Stage");
    expect(inspectTransform(stage).width).toBe(320);
    expect(inspectTransform(stage).height).toBe(240);
    expect(stage.children.map((node) => node.name)).toEqual([
      "V5G Content",
      "V5G Particles",
    ]);
    expect(stage.children[1].children).toHaveLength(0);
    expect(stage.children[0].children.map((node) => node.name)).toEqual([
      "Layer 1",
      "Layer 1 Particles",
    ]);
  });

  it("writes transform, opacity, active, anchor, and Cocos blend state", () => {
    const project = tinyProject();
    const root = new Node("Root");
    const frames = framesFor(project);
    const player = createV5GCocosPlayer({
      root,
      project,
      assets: {
        getSpriteFrame(_assetPath, assetId) {
          return frames.get(assetId) ?? null;
        },
      },
    });

    player.init();

    const layerNode = root.children[0].children[0].children[0];
    expect(inspectNode(layerNode).position).toEqual({ x: 100, y: 50, z: 0 });
    expect(inspectNode(layerNode).scale).toEqual({ x: -1, y: 2, z: 1 });
    expect(inspectNode(layerNode).rotation.z).toBe(30);
    expect(requireOpacity(layerNode).opacity).toBe(128);
    expect(layerNode.active).toBe(true);
    expect(inspectTransform(layerNode).anchorX).toBe(0.25);
    expect(inspectTransform(layerNode).anchorY).toBe(0.75);
    const sprite = requireSprite(layerNode);
    const pass = sprite.getMaterialInstance(0)?.passes[0];
    const target = pass?.blendState.targets[0];
    expect(getCocosBlendModeConfig("add")).toMatchObject({
      mode: "add",
      strategy: "sprite-blend-state",
    });
    expect(sprite.srcBlendFactor).toBe(COCOS_BLEND_FACTOR.SRC_ALPHA);
    expect(sprite.dstBlendFactor).toBe(COCOS_BLEND_FACTOR.ONE);
    expect(target?.blend).toBe(true);
    expect(target?.blendSrc).toBe(COCOS_BLEND_FACTOR.SRC_ALPHA);
    expect(target?.blendDst).toBe(COCOS_BLEND_FACTOR.ONE);
    expect(target?.blendEq).toBe(COCOS_BLEND_OP.ADD);
  });

  it("fails fast for missing SpriteFrame and size mismatch", () => {
    const project = tinyProject();
    const root = new Node("Root");
    const missing = createV5GCocosPlayer({
      root,
      project,
      assets: {
        getSpriteFrame() {
          return null;
        },
      },
    });
    expect(() => missing.init()).toThrow(
      'Missing Cocos SpriteFrame for V5G asset "asset-1" at "assets/a.png"',
    );
    expect(root.children).toHaveLength(0);

    const atlasRoot = new Node("Root");
    const atlasFrames = framesFor(project);
    const atlasQueries: string[] = [];
    const atlasPlayer = createV5GCocosPlayer({
      root: atlasRoot,
      project,
      assets: {
        atlas: {
          getSpriteFrame(name) {
            atlasQueries.push(name);
            return atlasFrames.get(name) ?? null;
          },
        },
      },
    });
    const frame = atlasFrames.get("asset-1");
    if (!frame) throw new Error("Missing fixture frame asset-1.");
    atlasFrames.set("a", frame);
    atlasFrames.delete("asset-1");
    atlasPlayer.init();
    expect(atlasQueries).toEqual(["a"]);
    expect(
      requireSprite(atlasRoot.children[0].children[0].children[0]).spriteFrame,
    ).toBe(frame);

    const nestedProject = tinyProject(
      {},
      { path: "assets/nested/respin_a.png" },
    );
    const nestedRoot = new Node("Root");
    const nestedFrames = framesFor(nestedProject);
    const nestedFrame = nestedFrames.get("asset-1");
    if (!nestedFrame) throw new Error("Missing fixture frame asset-1.");
    nestedFrames.set("respin_a", nestedFrame);
    nestedFrames.delete("asset-1");
    const nestedQueries: string[] = [];
    const nested = createV5GCocosPlayer({
      root: nestedRoot,
      project: nestedProject,
      assets: {
        atlas: {
          getSpriteFrame(name) {
            nestedQueries.push(name);
            return nestedFrames.get(name) ?? null;
          },
        },
      },
    });
    nested.init();
    expect(nestedQueries).toEqual(["respin_a"]);

    const missingAtlas = createV5GCocosPlayer({
      root: new Node("Root"),
      project,
      assets: {
        atlas: {
          getSpriteFrame() {
            return null;
          },
        },
      },
    });
    expect(() => missingAtlas.init()).toThrow(
      'Missing Cocos SpriteFrame for V5G asset "asset-1" at "assets/a.png" using atlas key "a".',
    );

    const invalidAtlas = createV5GCocosPlayer({
      root: new Node("Root"),
      project,
      assets: { atlas: {} } as never,
    });
    expect(() => invalidAtlas.init()).toThrow(
      "V5GCocosPlayer assets.atlas must provide getSpriteFrame(name).",
    );

    const wrongSize = createV5GCocosPlayer({
      root: new Node("Root"),
      project,
      assets: {
        getSpriteFrame() {
          return makeSpriteFrame(99, 50);
        },
      },
    });
    expect(() => wrongSize.init()).toThrow(
      'Cocos SpriteFrame size mismatch for V5G asset "asset-1"',
    );

    const trimmedAtlasRoot = new Node("Root");
    const trimmedAtlas = createV5GCocosPlayer({
      root: trimmedAtlasRoot,
      project,
      assets: {
        atlas: {
          getSpriteFrame(name) {
            return name === "a" ? makeSpriteFrame(60, 30) : null;
          },
        },
      },
    });
    expect(() => trimmedAtlas.init()).not.toThrow();
    const trimmedLayerNode =
      trimmedAtlasRoot.children[0].children[0].children[0];
    expect(inspectTransform(trimmedLayerNode).width).toBe(100);
    expect(inspectTransform(trimmedLayerNode).height).toBe(50);
  });

  it("accepts compressed SpriteFrame size while preserving logical node size", () => {
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
    frames.set("asset-1", makeSpriteFrame(50, 25));
    player.init();

    const layerNode = root.children[0].children[0].children[0];
    expect(inspectTransform(layerNode).width).toBe(100);
    expect(inspectTransform(layerNode).height).toBe(50);
    expect(inspectNode(layerNode).scale).toEqual({ x: -1, y: 2, z: 1 });

    const wrongSize = makePlayer(project);
    wrongSize.frames.set("asset-1", makeSpriteFrame(100, 50));
    expect(() => wrongSize.player.init()).toThrow(
      "logical 100x50, expected file 50x25, got 100x50",
    );
  });

  it("advances, loops, stops, restarts, and destroys only runtime nodes", () => {
    const project = tinyProject();
    const root = new Node("Root");
    const frames = framesFor(project);
    const player = createV5GCocosPlayer({
      root,
      project,
      assets: {
        getSpriteFrame(_assetPath, assetId) {
          return frames.get(assetId) ?? null;
        },
      },
    });

    player.init();
    const stage = root.children[0];
    player.play();
    player.update(0.75);
    player.update(0.5);
    expect(player.time).toBe(0.25);

    player.setLoop(false);
    player.update(1.2);
    expect(player.time).toBe(1);
    expect(player.playing).toBe(false);

    player.restart();
    expect(player.time).toBe(0);
    player.destroy();
    expect(inspectNode(stage).destroyed).toBe(true);
    expect(inspectNode(root).destroyed).toBe(false);
    expect(root.children).toHaveLength(0);
  });

  it("plays time ranges with markers and completion", () => {
    const { player } = makePlayer();
    const events: string[] = [];
    const complete: unknown[] = [];
    player.init();
    player.addPlaybackEvent({
      id: "end",
      at: { unit: "time", at: 0.4 },
      listener: (event) => events.push(`${event.id}:${event.loopIndex}`),
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
    expect(events).toEqual(["end:0", "complete"]);
    expect(complete).toEqual([
      { startTime: 0, endTime: 0.4, currentTime: 0.4, loopIndex: 0 },
    ]);
  });

  it("plays frame ranges and loops within the converted time span", () => {
    const { player } = makePlayer();
    const hits: number[] = [];
    player.init();
    player.addPlaybackEvent({
      id: "frame-marker",
      at: { unit: "frame", at: 45, fps: 60 },
      listener: (event) => hits.push(event.loopIndex),
    });

    player.playRange({
      range: { unit: "frame", start: 30, end: 60, fps: 60 },
      loop: true,
    });
    expect(player.time).toBe(0.5);
    player.update(0.75);

    expect(player.time).toBeCloseTo(0.75, 5);
    expect(player.playing).toBe(true);
    expect(hits).toEqual([0, 1]);
  });

  it("plays open-ended ranges to the project duration", () => {
    const omittedTimeEnd = makePlayer();
    const omittedTimeComplete: unknown[] = [];
    omittedTimeEnd.player.init();
    omittedTimeEnd.player.onPlaybackComplete((event) =>
      omittedTimeComplete.push(event),
    );
    omittedTimeEnd.player.playRange({
      range: { unit: "time", start: 0.25 },
      loop: false,
    });
    omittedTimeEnd.player.update(1);
    expect(omittedTimeEnd.player.time).toBe(1);
    expect(omittedTimeComplete).toEqual([
      { startTime: 0.25, endTime: 1, currentTime: 1, loopIndex: 0 },
    ]);

    const undefinedTimeEnd = makePlayer();
    undefinedTimeEnd.player.init();
    undefinedTimeEnd.player.playRange({
      range: { unit: "time", start: 0.25, end: undefined },
      loop: false,
    });
    undefinedTimeEnd.player.update(1);
    expect(undefinedTimeEnd.player.time).toBe(1);
    expect(undefinedTimeEnd.player.playing).toBe(false);

    const sentinelTimeEnd = makePlayer();
    sentinelTimeEnd.player.init();
    sentinelTimeEnd.player.playRange({
      range: { unit: "time", start: 0.25, end: -1 },
      loop: false,
    });
    sentinelTimeEnd.player.update(1);
    expect(sentinelTimeEnd.player.time).toBe(1);
    expect(sentinelTimeEnd.player.playing).toBe(false);

    const omittedFrameEnd = makePlayer();
    omittedFrameEnd.player.init();
    omittedFrameEnd.player.playRange({
      range: { unit: "frame", start: 30, fps: 60 },
      loop: false,
    });
    expect(omittedFrameEnd.player.time).toBe(0.5);
    omittedFrameEnd.player.update(1);
    expect(omittedFrameEnd.player.time).toBe(1);
    expect(omittedFrameEnd.player.playing).toBe(false);

    const sentinelFrameEnd = makePlayer();
    sentinelFrameEnd.player.init();
    sentinelFrameEnd.player.playRange({
      range: { unit: "frame", start: 30, end: -1, fps: 60 },
      loop: false,
    });
    expect(sentinelFrameEnd.player.time).toBe(0.5);
    sentinelFrameEnd.player.update(1);
    expect(sentinelFrameEnd.player.time).toBe(1);
    expect(sentinelFrameEnd.player.playing).toBe(false);
  });

  it("removes standalone marker and complete listeners through disposers", () => {
    const { player } = makePlayer();
    const events: string[] = [];
    player.init();
    const disposeMarker = player.addPlaybackEvent({
      id: "marker",
      at: { unit: "time", at: 0.2 },
      listener: () => events.push("marker"),
    });
    const disposeComplete = player.onPlaybackComplete(() => {
      events.push("complete");
    });

    disposeMarker();
    disposeMarker();
    disposeComplete();
    disposeComplete();
    player.setLoop(false);
    player.play();
    player.update(1);

    expect(events).toEqual([]);
  });

  it("renders particle nodes under the layer particle container", () => {
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
    const root = new Node("Root");
    const frames = framesFor(project);
    const player = createV5GCocosPlayer({
      root,
      project,
      assets: {
        getSpriteFrame(_assetPath, assetId) {
          return frames.get(assetId) ?? null;
        },
      },
    });

    player.init();

    const stage = root.children[0];
    const content = stage.children[0];
    const particleRoot = stage.children[1];
    const layerNode = content.children[0];
    const particleContainer = content.children[1];
    expect(layerNode.active).toBe(true);
    expect(particleRoot.children).toHaveLength(0);
    expect(particleContainer.name).toBe("Layer 1 Particles");
    expect(particleContainer.children).toHaveLength(0);

    player.seek(0.5);
    expect(particleContainer.children).toHaveLength(3);
    const firstParticle = particleContainer.children[0];
    const firstRotation = inspectNode(firstParticle).rotation.z;
    player.seek(0.75);

    expect(inspectNode(firstParticle).destroyed).toBe(false);
    expect(particleRoot.children).toHaveLength(0);
    expect(particleContainer.children).toHaveLength(3);
    expect(particleContainer.children[0]).toBe(firstParticle);
    expect(
      Number.isFinite(inspectNode(particleContainer.children[0]).rotation.z),
    ).toBe(true);
    expect(inspectNode(particleContainer.children[0]).rotation.z).not.toBe(
      firstRotation,
    );
    expect(requireSprite(particleContainer.children[0]).spriteFrame).toBe(
      frames.get("asset-1"),
    );
    expect(inspectTransform(particleContainer.children[0]).width).toBe(
      project.assets[0].width,
    );
    expect(inspectTransform(particleContainer.children[0]).height).toBe(
      project.assets[0].height,
    );
  });

  it("supports segmented playback ending and particle drain in standalone", () => {
    const project = tinyProject({
      animations: [particleWallAnimation({ duration: 1 })],
    });
    project.stage.duration = 2;
    const { root, player } = makePlayer(project);
    const complete: unknown[] = [];
    player.init();
    player.setLoop(false);
    player.onPlaybackComplete((event) => complete.push(event));

    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.5 },
      loopEnd: { unit: "time", at: 0.5 },
    });
    player.update(0.6);

    const particleContainer = root.children[0].children[0].children[1];
    expect(player.time).toBe(0.5);
    expect(player.getPlaybackState()).toMatchObject({
      mode: "segmented",
      phase: "loop",
      keepParticlesAlive: true,
    });
    expect(particleContainer.children.length).toBeGreaterThan(0);

    player.requestSegmentedPlaybackEnd();
    player.update(2);
    expect(player.getPlaybackState().phase).toBe("particle-draining");
    expect(complete).toEqual([]);

    player.play();
    player.update(1);
    expect(player.getPlaybackState().phase).toBe("complete");
    expect(complete).toEqual([
      { startTime: 0, endTime: 2, currentTime: 2, loopIndex: 0 },
    ]);
  });
});

function requireTransform(node: Node): UITransform {
  const transform = node.getComponent(UITransform);
  if (!transform) throw new Error(`Missing UITransform on ${node.name}`);
  return transform;
}

interface InspectableNode extends Node {
  destroyed: boolean;
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

interface InspectableTransform extends UITransform {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

interface InspectableSpriteFrame extends SpriteFrame {
  width?: number;
  height?: number;
  originalSize?: { width: number; height: number };
}

function inspectNode(node: Node): InspectableNode {
  return node as InspectableNode;
}

function inspectTransform(node: Node): InspectableTransform {
  return requireTransform(node) as InspectableTransform;
}

function makeSpriteFrame(width: number, height: number): SpriteFrame {
  const frame = new SpriteFrame() as InspectableSpriteFrame;
  frame.width = width;
  frame.height = height;
  frame.originalSize = { width, height };
  return frame;
}

function requireOpacity(node: Node): UIOpacity {
  const opacity = node.getComponent(UIOpacity);
  if (!opacity) throw new Error(`Missing UIOpacity on ${node.name}`);
  return opacity;
}

function requireSprite(node: Node): Sprite {
  const sprite = node.getComponent(Sprite);
  if (!sprite) throw new Error(`Missing Sprite on ${node.name}`);
  return sprite;
}
