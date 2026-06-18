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
      { id: asset.id, width: asset.width, height: asset.height },
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
    expect(timeChanges).toEqual([0, 0.75, 0.25]);
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
