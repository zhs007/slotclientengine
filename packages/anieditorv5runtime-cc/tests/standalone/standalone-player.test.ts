import { describe, expect, it } from "vitest";
import {
  Graphics,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  UIOpacity,
} from "cc";
import {
  createV5GCocosPlayer,
  type V5GAssetConfig,
  type V5GLayerConfig,
  type V5GCocosPlayer,
  type V5GProjectConfig,
} from "../../standalone/anieditorv5runtime-cc";

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

function framesFor(project: V5GProjectConfig): Map<string, SpriteFrame> {
  return new Map(
    project.assets.map((asset) => [
      asset.id,
      makeSpriteFrame(asset.width, asset.height),
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
  it("creates stage, background, content, particle roots, and image layers", () => {
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
      "V5G Background",
      "V5G Content",
      "V5G Particles",
    ]);
    expect(inspectTransform(stage.children[0]).width).toBe(320);
    expect(inspectGraphics(stage.children[0]).filled).toBe(true);
    expect(stage.children[1].children[0].name).toBe("Layer 1");
  });

  it("writes transform, opacity, active, anchor, and leaves blend mode untouched", () => {
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

    const layerNode = root.children[0].children[1].children[0];
    expect(inspectNode(layerNode).position).toEqual({ x: 100, y: 50, z: 0 });
    expect(inspectNode(layerNode).scale).toEqual({ x: -1, y: 2, z: 1 });
    expect(inspectNode(layerNode).rotation.z).toBe(30);
    expect(requireOpacity(layerNode).opacity).toBe(128);
    expect(layerNode.active).toBe(true);
    expect(inspectTransform(layerNode).anchorX).toBe(0.25);
    expect(inspectTransform(layerNode).anchorY).toBe(0.75);
    expect(requireSprite(layerNode).srcBlendFactor).toBeUndefined();
    expect(requireSprite(layerNode).dstBlendFactor).toBeUndefined();
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

  it("renders particle nodes with degree rotation and clears prior frame nodes", () => {
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
    const content = stage.children[1];
    const particleRoot = stage.children[2];
    expect(content.children[0].active).toBe(false);
    expect(particleRoot.children).toHaveLength(3);

    const firstParticle = particleRoot.children[0];
    const firstRotation = inspectNode(firstParticle).rotation.z;
    player.seek(0.5);

    expect(inspectNode(firstParticle).destroyed).toBe(true);
    expect(particleRoot.children).toHaveLength(3);
    expect(
      Number.isFinite(inspectNode(particleRoot.children[0]).rotation.z),
    ).toBe(true);
    expect(inspectNode(particleRoot.children[0]).rotation.z).not.toBe(
      firstRotation,
    );
    expect(requireSprite(particleRoot.children[0]).spriteFrame).toBe(
      frames.get("asset-1"),
    );
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

interface InspectableGraphics extends Graphics {
  filled: boolean;
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

function inspectGraphics(node: Node): InspectableGraphics {
  return requireGraphics(node) as InspectableGraphics;
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

function requireGraphics(node: Node): Graphics {
  const graphics = node.getComponent(Graphics);
  if (!graphics) throw new Error(`Missing Graphics on ${node.name}`);
  return graphics;
}
