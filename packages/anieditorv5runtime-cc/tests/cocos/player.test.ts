import { describe, expect, it } from "vitest";
import threeReelMultipay01Data from "../fixtures/3reel_multipay_01.json";
import threeReelMultipay02Data from "../fixtures/3reel_multipay_02.json";
import lock01Data from "../fixtures/lock_01.json";
import projectData from "../fixtures/project.json";
import roundreelData from "../fixtures/roundreel.json";
import { V5GCocosPlayer } from "../../src/cocos/player";
import { assertV5GProject } from "../../src/core/validation";
import {
  getCocosBlendModeConfig,
  type CocosBlendModeConfig,
} from "../../src/cocos/blend-mode";
import type { V5GCocosNodeDriver, V5GSize } from "../../src/cocos/node-driver";
import type {
  V5GAnimationConfig,
  V5GAssetConfig,
  V5GLayerConfig,
  V5GProjectConfig,
} from "../../src/core/types";

interface FakeSpriteFrame {
  id: string;
  width: number;
  height: number;
  destroyed?: boolean;
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
  spriteFrame: FakeSpriteFrame | null = null;
  text = "";
  maskSource: FakeNode | null = null;
  maskTarget: FakeNode | null = null;
  blendMode: CocosBlendModeConfig | null = null;
  color = 0xffffff;
  lines: unknown[] = [];

  constructor(readonly name: string) {}
}

interface FakeNodeTransformSnapshot {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

class FakeDriver implements V5GCocosNodeDriver<FakeNode, FakeSpriteFrame> {
  captureCount = 0;
  capturedReleaseCount = 0;
  failCaptureAt = 0;

  createNode(name: string): FakeNode {
    return new FakeNode(name);
  }

  appendChild(parent: FakeNode, child: FakeNode): void {
    if (child.parent) {
      this.removeChild(child.parent, child);
    } else {
      parent.children = parent.children.filter(
        (candidate) => candidate !== child,
      );
    }
    child.parent = parent;
    parent.children.push(child);
  }

  removeChild(parent: FakeNode, child: FakeNode): void {
    parent.children = parent.children.filter(
      (candidate) => candidate !== child,
    );
    if (child.parent === parent) {
      child.parent = null;
    }
  }

  isValidNode(node: FakeNode): boolean {
    return !node.destroyed;
  }

  getParent(node: FakeNode): FakeNode | null {
    return node.parent;
  }

  captureLocalTransform(node: FakeNode): unknown {
    return captureFakeLocalTransform(node);
  }

  restoreLocalTransform(node: FakeNode, snapshot: unknown): void {
    applyFakeLocalTransform(node, snapshot as FakeNodeTransformSnapshot);
  }

  captureWorldTransform(node: FakeNode): unknown {
    return captureFakeWorldTransform(node);
  }

  restoreWorldTransform(node: FakeNode, snapshot: unknown): void {
    applyFakeLocalTransform(
      node,
      getFakeLocalTransformForWorld(
        snapshot as FakeNodeTransformSnapshot,
        node.parent,
      ),
    );
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

  createImageNode(name: string, spriteFrame: FakeSpriteFrame): FakeNode {
    const node = new FakeNode(name);
    node.spriteFrame = spriteFrame;
    return node;
  }

  setImageSpriteFrame(node: FakeNode, spriteFrame: FakeSpriteFrame): void {
    node.spriteFrame = spriteFrame;
  }

  setImageColor(
    node: FakeNode,
    red: number,
    green: number,
    blue: number,
  ): void {
    node.color = (red << 16) | (green << 8) | blue;
  }

  createSpriteFrameRegion(
    spriteFrame: FakeSpriteFrame,
    region: { x: number; y: number; width: number; height: number },
  ): FakeSpriteFrame {
    return {
      id: `${spriteFrame.id}:${region.x}:${region.y}:${region.width}:${region.height}`,
      width: region.width,
      height: region.height,
    };
  }

  destroySpriteFrameRegion(spriteFrame: FakeSpriteFrame): void {
    spriteFrame.destroyed = true;
  }

  captureNodeVisual(options: {
    node: FakeNode;
    width: number;
    height: number;
    revision?: string | number;
  }): {
    spriteFrame: FakeSpriteFrame;
    width: number;
    height: number;
    release(): void;
  } {
    this.captureCount += 1;
    if (this.captureCount === this.failCaptureAt) {
      throw new Error("synthetic complete subtree capture failure");
    }
    const snapshot = snapshotFakeNodeTree(options.node);
    const spriteFrame: FakeSpriteFrame = {
      id: `capture:${this.captureCount}:${String(options.revision)}:${snapshot}`,
      width: options.width,
      height: options.height,
    };
    let released = false;
    return {
      spriteFrame,
      width: options.width,
      height: options.height,
      release: () => {
        if (released) return;
        released = true;
        spriteFrame.destroyed = true;
        this.capturedReleaseCount += 1;
      },
    };
  }

  setSiblingIndex(node: FakeNode, index: number): void {
    if (!node.parent) return;
    const siblings = node.parent.children.filter((child) => child !== node);
    siblings.splice(Math.max(0, Math.min(siblings.length, index)), 0, node);
    node.parent.children = siblings;
  }

  createLineNode(name: string): FakeNode {
    return new FakeNode(name);
  }

  updateLines(node: FakeNode, lines: readonly unknown[]): void {
    node.lines = [...lines];
  }

  applyLineBlendMode(node: FakeNode, config: CocosBlendModeConfig): void {
    node.blendMode = config;
  }

  createTextNode(name: string, text: string): FakeNode {
    const node = new FakeNode(name);
    node.text = text;
    return node;
  }

  setText(node: FakeNode, text: string): void {
    node.text = text;
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

  createAlphaMaskNode(
    name: string,
    sourceNode: FakeNode,
    targetNode: FakeNode,
  ): FakeNode {
    const node = new FakeNode(name);
    node.maskSource = sourceNode;
    node.maskTarget = targetNode;
    return node;
  }

  updateAlphaMaskNode(
    maskNode: FakeNode,
    sourceNode: FakeNode,
    targetNode: FakeNode,
  ): void {
    maskNode.maskSource = sourceNode;
    maskNode.maskTarget = targetNode;
  }

  clearAlphaMask(targetNode: FakeNode, maskNode: FakeNode): void {
    if (maskNode.maskTarget === targetNode) {
      maskNode.maskTarget = null;
    }
  }
}

function snapshotFakeNodeTree(node: FakeNode): string {
  return [
    node.name,
    node.text,
    node.spriteFrame?.id ?? "",
    ...node.children.map((child) => snapshotFakeNodeTree(child)),
  ].join("|");
}

function captureFakeLocalTransform(node: FakeNode): FakeNodeTransformSnapshot {
  return {
    x: node.x,
    y: node.y,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    rotation: node.rotation,
  };
}

function captureFakeWorldTransform(node: FakeNode): FakeNodeTransformSnapshot {
  const local = captureFakeLocalTransform(node);
  if (!node.parent) return local;
  const parentWorld = captureFakeWorldTransform(node.parent);
  const radians = (parentWorld.rotation * Math.PI) / 180;
  const scaledX = local.x * parentWorld.scaleX;
  const scaledY = local.y * parentWorld.scaleY;
  return {
    x:
      parentWorld.x + scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
    y:
      parentWorld.y + scaledX * Math.sin(radians) + scaledY * Math.cos(radians),
    scaleX: parentWorld.scaleX * local.scaleX,
    scaleY: parentWorld.scaleY * local.scaleY,
    rotation: parentWorld.rotation + local.rotation,
  };
}

function getFakeLocalTransformForWorld(
  world: FakeNodeTransformSnapshot,
  parent: FakeNode | null,
): FakeNodeTransformSnapshot {
  if (!parent) return { ...world };
  const parentWorld = captureFakeWorldTransform(parent);
  const radians = (-parentWorld.rotation * Math.PI) / 180;
  const dx = world.x - parentWorld.x;
  const dy = world.y - parentWorld.y;
  const unrotatedX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const unrotatedY = dx * Math.sin(radians) + dy * Math.cos(radians);
  return {
    x: unrotatedX / parentWorld.scaleX,
    y: unrotatedY / parentWorld.scaleY,
    scaleX: world.scaleX / parentWorld.scaleX,
    scaleY: world.scaleY / parentWorld.scaleY,
    rotation: world.rotation - parentWorld.rotation,
  };
}

function applyFakeLocalTransform(
  node: FakeNode,
  transform: FakeNodeTransformSnapshot,
): void {
  node.x = transform.x;
  node.y = transform.y;
  node.scaleX = transform.scaleX;
  node.scaleY = transform.scaleY;
  node.rotation = transform.rotation;
}

function expectFakeTransformClose(
  actual: FakeNodeTransformSnapshot,
  expected: FakeNodeTransformSnapshot,
): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.scaleX).toBeCloseTo(expected.scaleX, 6);
  expect(actual.scaleY).toBeCloseTo(expected.scaleY, 6);
  expect(actual.rotation).toBeCloseTo(expected.rotation, 6);
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
    layerGroups: [
      {
        id: "group_default",
        name: "Default",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: [
      {
        id: "layer-1",
        name: "Layer 1",
        type: "image",
        assetId: "asset-1",
        parentId: null,
        groupId: "group_default",
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

function twoGroupProject(): V5GProjectConfig {
  const project = tinyProject();
  project.layerGroups = [
    {
      id: "upper",
      name: "Upper",
      visible: true,
      collapsed: false,
      order: 0,
    },
    {
      id: "lower",
      name: "Lower",
      visible: true,
      collapsed: false,
      order: 1,
    },
  ];
  project.layers[0].groupId = "lower";
  project.layers.push({
    ...structuredClone(project.layers[0]),
    id: "layer-2",
    name: "Layer 2",
    groupId: "upper",
    transform: {
      ...project.layers[0].transform,
      x: -50,
      y: -25,
    },
  });
  return project;
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

function safeGlowAnimation(
  overrides: Partial<V5GAnimationConfig> = {},
): V5GAnimationConfig {
  return {
    id: "safe-glow",
    type: "safe_glow",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 11,
    params: {
      spread: 0.2,
      minOpacity: 0.4,
      maxOpacity: 0.8,
      pulses: 1,
      keepOriginal: false,
    },
    ...overrides,
  };
}

function chaserLightAnimation(
  overrides: Partial<V5GAnimationConfig> = {},
): V5GAnimationConfig {
  return {
    id: "chaser-light",
    type: "chaser_light",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 11,
    params: {
      totalCount: 4,
      spacing: 12,
      lightDuration: 0.2,
      interval: 0.05,
      trajectory: 1,
      radius: 40,
      centerX: 0,
      centerY: 0,
      endX: 100,
      endY: 0,
      curve: 0,
      lightSize: 16,
      dimAlpha: 0.2,
      keepOriginal: false,
    },
    ...overrides,
  };
}

function cardCarouselAnimation(): V5GAnimationConfig {
  return {
    id: "cards",
    type: "card_carousel_3d",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 5,
    params: {
      phasePreviewMode: "hold",
      cardCount: 3,
      targetIndex: 1,
      rounds: 1,
      direction: 1,
      introDuration: 0.2,
      introSpeed: 0.2,
      revealDirection: 0,
      revealStagger: 0.02,
      revealOffsetX: 30,
      revealScaleFrom: 0.7,
      demoIdleDuration: 0.2,
      idleSpeed: 0.2,
      fastDuration: 0.2,
      fastSpeed: 2,
      accelRatio: 0.2,
      stopDuration: 0.2,
      holdDuration: 1,
      stopOvershoot: 0.1,
      finalPop: 0.1,
      finalGlow: 0.1,
      radius: 100,
      cardSpacing: 1,
      perspective: 0.7,
      slices: 4,
      visibleRange: 1,
      cardSize: 100,
      centerScale: 1,
      sideScale: 0.7,
      sideAlpha: 0.4,
      shadeStrength: 0.4,
      curve: 0.5,
      tilt: 6,
      sourceOpacity: 0,
      hideBack: false,
      keepOriginal: false,
    },
  };
}

function manualCardCarouselProject(): V5GProjectConfig {
  const animation = cardCarouselAnimation();
  animation.duration = 1.8;
  animation.params = {
    ...animation.params,
    phasePreviewMode: "full_demo",
    visibleRange: 0.5,
    hideBack: true,
  };
  const project = tinyProject({ animations: [animation] });
  project.schemaVersion = "VNI_0.095";
  project.editor.version = "VNI_0.095";
  project.stage.duration = 2;
  return project;
}

function complexCarrierNode(key: string, frame: FakeSpriteFrame): FakeNode {
  const root = new FakeNode(`${key} Root`);
  const art = new FakeNode(`${key} Art Sprite`);
  art.spriteFrame = frame;
  const value = new FakeNode(`${key} Value Label`);
  value.text = key;
  const nested = new FakeNode(`${key} Decoration`);
  nested.children.push(new FakeNode(`${key} Decoration Child`));
  root.children.push(art, value, nested);
  art.parent = root;
  value.parent = root;
  nested.parent = root;
  nested.children[0].parent = nested;
  return root;
}

async function flushPromiseJobs(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

function getStage(root: FakeNode): FakeNode {
  return root.children[0];
}

function getContent(root: FakeNode): FakeNode {
  return getStage(root).children[0];
}

function getParticleRoot(root: FakeNode): FakeNode {
  return getStage(root).children[1];
}

function getFirstGroup(root: FakeNode): FakeNode {
  return getContent(root).children[0];
}

function getFirstLayerNode(root: FakeNode): FakeNode {
  return getFirstLayerContent(root).children[0];
}

function getFirstLayerOuter(root: FakeNode): FakeNode {
  return getFirstGroup(root).children[0];
}

function getFirstLayerContent(root: FakeNode): FakeNode {
  return getFirstLayerOuter(root).children[0];
}

function getFirstSafeGlowContainer(root: FakeNode): FakeNode {
  return getFirstGroup(root).children[1];
}

function getFirstChaserLightContainer(root: FakeNode): FakeNode {
  return getFirstGroup(root).children[2];
}

function getFirstParticleContainer(root: FakeNode): FakeNode {
  return getFirstGroup(root).children[3];
}

describe("V5GCocosPlayer", () => {
  it("creates stage content and particle roots without a background node", () => {
    const project = sampleProject();
    const { root, player } = makePlayer(project);
    player.init();

    const stage = getStage(root);
    expect(stage.name).toBe("V5G Stage");
    expect(stage.width).toBe(project.stage.width);
    expect(stage.height).toBe(project.stage.height);
    expect(stage.children.map((node) => node.name)).toEqual([
      "V5G Content",
      "V5G Particles",
    ]);
    expect(getParticleRoot(root).children).toHaveLength(0);
    expect(getContent(root).children.map((node) => node.name)).toEqual([
      "V5G Group group_default",
    ]);
    expect(getFirstGroup(root).children.map((node) => node.name)).toEqual(
      project.layers.flatMap((layer) => [
        layer.name,
        `${layer.name} Safe Glow`,
        `${layer.name} Chaser Light`,
        `${layer.name} Particles`,
      ]),
    );
  });

  it("creates group-aware content slots and exposes adjacent group metadata", () => {
    const project = twoGroupProject();
    const { root, player } = makePlayer(project);
    player.init();

    expect(getContent(root).children.map((node) => node.name)).toEqual([
      "V5G Group lower",
      "V5G Slot lower -> upper",
      "V5G Group upper",
    ]);
    expect(
      getContent(root).children[0].children.map((node) => node.name),
    ).toEqual([
      "Layer 1",
      "Layer 1 Safe Glow",
      "Layer 1 Chaser Light",
      "Layer 1 Particles",
    ]);
    expect(
      getContent(root).children[2].children.map((node) => node.name),
    ).toEqual([
      "Layer 2",
      "Layer 2 Safe Glow",
      "Layer 2 Chaser Light",
      "Layer 2 Particles",
    ]);
    expect(player.getLayerGroups().map((group) => group.id)).toEqual([
      "lower",
      "upper",
    ]);
    expect(player.getLayerGroups().map((group) => group.order)).toEqual([1, 0]);
    expect(player.getLayerGroupSlots()).toEqual([
      {
        afterGroupId: "lower",
        afterGroupName: "Lower",
        beforeGroupId: "upper",
        beforeGroupName: "Upper",
        renderIndex: 0,
      },
    ]);
  });

  it("keeps pressure visual rotation on the stable content root", () => {
    const project = tinyProject({
      animations: [
        {
          id: "pressure-rotate",
          type: "rotate",
          startTime: 0,
          duration: 1,
          enabled: true,
          seed: 17,
          params: {
            turns: 1,
            direction: 1,
            accelRatio: 0.2,
            decelRatio: 0.2,
            pressure: 0.8,
            pressureStretch: 0.4,
          },
        },
      ],
    });
    const { root, player } = makePlayer(project);
    player.init();
    player.seek(0.5);

    const outer = getFirstLayerOuter(root);
    const content = getFirstLayerContent(root);
    const display = getFirstLayerNode(root);
    expect(outer.name).toBe("Layer 1");
    expect(content.name).toBe("Layer 1 Content");
    expect(outer.rotation).toBe(30);
    expect(content.rotation).not.toBe(0);
    expect(display.rotation).toBe(0);
  });

  it("mounts external and runtime-owned nodes between adjacent groups", () => {
    const { root, player } = makePlayer(twoGroupProject());
    player.init();
    const slot = getContent(root).children[1];
    const external = new FakeNode("External");
    external.x = 17;
    external.y = -23;
    external.scaleX = 2;

    const dispose = player.attachNodeBetweenLayerGroups({
      id: " external ",
      afterGroupId: "lower",
      beforeGroupId: "upper",
      node: external,
    });
    expect(external.parent).toBe(slot);
    expect(external.x).toBe(17);
    expect(external.y).toBe(-23);
    expect(external.scaleX).toBe(2);
    expect(() =>
      player.attachNodeBetweenLayerGroups({
        id: "external",
        afterGroupId: "lower",
        beforeGroupId: "upper",
        node: new FakeNode("Duplicate"),
      }),
    ).toThrow("Duplicate V5G Cocos mounted node id: external");
    expect(() =>
      player.attachNodeBetweenLayerGroups({
        id: "unknown",
        afterGroupId: "missing",
        beforeGroupId: "upper",
        node: new FakeNode("Unknown"),
      }),
    ).toThrow("Unknown VNI layer group: missing");
    expect(() =>
      player.attachNodeBetweenLayerGroups({
        id: "reversed",
        afterGroupId: "upper",
        beforeGroupId: "lower",
        node: new FakeNode("Reversed"),
      }),
    ).toThrow("not adjacent in render order");

    dispose();
    dispose();
    expect(external.parent).toBeNull();
    expect(external.destroyed).toBe(false);
    expect(() => player.detachMountedNode("external")).toThrow(
      "Unknown V5G Cocos mounted node id: external",
    );

    const disposeProjectAsset = player.attachProjectAssetBetweenLayerGroups({
      id: "asset-node",
      afterGroupId: "lower",
      beforeGroupId: "upper",
      assetId: "asset-1",
      x: 3,
      y: 4,
      opacity: 0.25,
    });
    const assetNode = slot.children[0];
    expect(assetNode.name).toBe("V5G Mounted Image asset-1");
    expect(assetNode.x).toBe(3);
    expect(assetNode.y).toBe(4);
    expect(assetNode.opacity).toBe(64);
    disposeProjectAsset();
    expect(assetNode.destroyed).toBe(true);

    const spriteFrameNodeDispose = player.attachSpriteFrameBetweenLayerGroups({
      id: "sprite-frame-node",
      afterGroupId: "lower",
      beforeGroupId: "upper",
      spriteFrame: { id: "custom", width: 10, height: 12 },
      width: 10,
      height: 12,
    });
    expect(slot.children[0].name).toBe("V5G Mounted SpriteFrame");
    player.clearMountedNodes();
    expect(slot.children).toHaveLength(0);
    spriteFrameNodeDispose();
  });

  it("mounts node batches, reorders repeated nodes, and restores original parents", () => {
    const { root, driver, player } = makePlayer(twoGroupProject());
    player.init();
    const slot = getContent(root).children[1];
    const host = new FakeNode("Host");
    const first = new FakeNode("First");
    const second = new FakeNode("Second");
    const floating = new FakeNode("Floating");
    host.x = 100;
    host.y = 20;
    host.scaleX = 2;
    host.scaleY = 3;
    host.rotation = 30;
    slot.x = -75;
    slot.y = 12;
    slot.scaleX = 0.5;
    slot.scaleY = 2;
    slot.rotation = -15;
    first.x = 25;
    first.y = -10;
    first.scaleX = 1.5;
    first.rotation = 5;
    second.x = -8;
    second.y = 12;
    second.scaleY = 0.5;
    second.rotation = -12;
    driver.appendChild(host, first);
    driver.appendChild(host, second);
    const firstOriginalLocal = captureFakeLocalTransform(first);
    const secondOriginalLocal = captureFakeLocalTransform(second);
    const firstWorldBeforeMount = captureFakeWorldTransform(first);
    const secondWorldBeforeMount = captureFakeWorldTransform(second);

    const batchDispose = player.attachNodeBetweenLayerGroups({
      ids: ["first", "second"],
      afterGroupId: "lower",
      beforeGroupId: "upper",
      nodes: [first, second],
    });
    expect(slot.children.map((node) => node.name)).toEqual(["First", "Second"]);
    expect(host.children).toHaveLength(0);
    expect(first.x).not.toBe(firstOriginalLocal.x);
    expect(second.x).not.toBe(secondOriginalLocal.x);
    expectFakeTransformClose(
      captureFakeWorldTransform(first),
      firstWorldBeforeMount,
    );
    expectFakeTransformClose(
      captureFakeWorldTransform(second),
      secondWorldBeforeMount,
    );

    const floatingDispose = player.attachNodeBetweenLayerGroups({
      id: "floating",
      afterGroupId: "lower",
      beforeGroupId: "upper",
      node: floating,
    });
    expect(slot.children.map((node) => node.name)).toEqual([
      "First",
      "Second",
      "Floating",
    ]);

    const moveDispose = player.attachNodeBetweenLayerGroups({
      id: "first-moved",
      afterGroupId: "lower",
      beforeGroupId: "upper",
      node: first,
    });
    expect(slot.children.map((node) => node.name)).toEqual([
      "Second",
      "Floating",
      "First",
    ]);
    expect(() => player.detachMountedNode("first")).toThrow(
      "Unknown V5G Cocos mounted node id: first",
    );
    expectFakeTransformClose(
      captureFakeWorldTransform(first),
      firstWorldBeforeMount,
    );

    batchDispose();
    expect(slot.children.map((node) => node.name)).toEqual([
      "Floating",
      "First",
    ]);
    expect(second.parent).toBe(host);
    expect(first.parent).toBe(slot);
    expectFakeTransformClose(
      captureFakeLocalTransform(second),
      secondOriginalLocal,
    );

    player.detachMountedNodes([floating, "first-moved"]);
    expect(floating.parent).toBeNull();
    expect(first.parent).toBe(host);
    expectFakeTransformClose(
      captureFakeLocalTransform(first),
      firstOriginalLocal,
    );
    expect(host.children.map((node) => node.name)).toEqual(["Second", "First"]);

    moveDispose();
    floatingDispose();
    const clearFirst = new FakeNode("Clear First");
    const clearSecond = new FakeNode("Clear Second");
    driver.appendChild(host, clearFirst);
    driver.appendChild(host, clearSecond);
    player.attachNodeBetweenLayerGroups({
      afterGroupId: "lower",
      beforeGroupId: "upper",
      nodes: [clearFirst, clearSecond],
    });

    player.clearMountedNodes();
    expect(clearFirst.parent).toBe(host);
    expect(clearSecond.parent).toBe(host);
    expect(host.children.map((node) => node.name)).toEqual([
      "Second",
      "First",
      "Clear First",
      "Clear Second",
    ]);
  });

  it("clears mounted nodes on destroy", () => {
    const { root, player } = makePlayer(twoGroupProject());
    player.init();
    const external = new FakeNode("External");
    player.attachNodeBetweenLayerGroups({
      id: "external",
      afterGroupId: "lower",
      beforeGroupId: "upper",
      node: external,
    });

    player.destroy();

    expect(external.parent).toBeNull();
    expect(external.destroyed).toBe(false);
    expect(root.children).toHaveLength(0);
  });

  it("ignores host-destroyed mounted nodes while reinitializing", () => {
    const { root, player } = makePlayer(twoGroupProject());
    player.init();
    const external = new FakeNode("External");
    const dispose = player.attachNodeBetweenLayerGroups({
      id: "external",
      afterGroupId: "lower",
      beforeGroupId: "upper",
      node: external,
    });
    external.destroyed = true;

    expect(() => player.init()).not.toThrow();

    expect(root.children).toHaveLength(1);
    expect(() => player.detachMountedNode("external")).toThrow(
      "Unknown V5G Cocos mounted node id: external",
    );
    dispose();
  });

  it("writes sampled transform, opacity, active state, and layer blend mode on seek", () => {
    const { root, player } = makePlayer(tinyProject());
    player.init();

    const layerNode = getFirstLayerNode(root);
    const layerOuter = getFirstLayerOuter(root);
    expect(layerOuter.x).toBe(100);
    expect(layerOuter.y).toBe(50);
    expect(layerOuter.scaleX).toBe(-1);
    expect(layerOuter.scaleY).toBe(2);
    expect(layerOuter.rotation).toBe(30);
    expect(layerOuter.opacity).toBe(128);
    expect(layerOuter.active).toBe(true);
    expect(layerNode.anchorX).toBe(0.25);
    expect(layerNode.anchorY).toBe(0.75);
    expect(layerNode.blendMode).toEqual(getCocosBlendModeConfig("add"));
  });

  it("renders safe_glow nodes between the source image and particle container", () => {
    const project = tinyProject({
      animations: [safeGlowAnimation()],
    });
    const { root, frames, player } = makePlayer(project);
    player.init();

    const layerNode = getFirstLayerNode(root);
    const safeGlowContainer = getFirstSafeGlowContainer(root);
    const particleContainer = getFirstParticleContainer(root);
    expect(getFirstGroup(root).children.map((node) => node.name)).toEqual([
      "Layer 1",
      "Layer 1 Safe Glow",
      "Layer 1 Chaser Light",
      "Layer 1 Particles",
    ]);
    expect(safeGlowContainer.name).toBe("Layer 1 Safe Glow");
    expect(particleContainer.name).toBe("Layer 1 Particles");
    expect(layerNode.active).toBe(false);
    expect(safeGlowContainer.children).toHaveLength(1);

    const safeGlowNode = safeGlowContainer.children[0];
    expect(safeGlowNode.name).toBe("V5G Safe Glow layer-1");
    expect(safeGlowNode.active).toBe(true);
    expect(safeGlowNode.spriteFrame).toBe(frames.get("asset-1"));
    expect(layerNode.blendMode).toEqual(getCocosBlendModeConfig("add"));
    expect(safeGlowNode.blendMode).toEqual(getCocosBlendModeConfig("add"));
    expect(safeGlowNode.width).toBe(100);
    expect(safeGlowNode.height).toBe(50);
    expect(safeGlowNode.anchorX).toBe(0.25);
    expect(safeGlowNode.anchorY).toBe(0.75);
    expect(safeGlowNode.x).toBe(100);
    expect(safeGlowNode.y).toBe(50);
    expect(safeGlowNode.scaleX).toBe(-1.2);
    expect(safeGlowNode.scaleY).toBe(2.4);
    expect(safeGlowNode.rotation).toBeCloseTo(30, 3);
    expect(safeGlowNode.opacity).toBe(51);

    player.seek(1);
    expect(safeGlowContainer.children).toHaveLength(1);
    expect(safeGlowNode.destroyed).toBe(false);
    player.destroy();
    expect(safeGlowNode.destroyed).toBe(true);
  });

  it("binds host text to text layers through the public API", () => {
    const project = tinyProject({
      type: "text",
      assetId: null,
      text: "Base",
      opacity: 1,
      blendMode: "normal",
      animations: [],
    });
    const { root, player } = makePlayer(project);
    player.init();

    const textNode = getFirstLayerNode(root);
    const textBindingContainer = getFirstLayerContent(root).children[1];
    expect(textNode.text).toBe("Base");
    expect(textNode.active).toBe(true);
    expect(textBindingContainer.name).toBe("Layer 1 Text Binding");
    expect(player.getRuntimeDiagnostics()).toMatchObject({
      textLayerBindingCount: 0,
      mountedNodeCount: 0,
    });

    const binding = player.attachTextToTextLayer({
      id: "score",
      layerId: " layer-1 ",
      text: "42",
    });
    const bindingNode = textBindingContainer.children[0];
    expect(textNode.active).toBe(false);
    expect(bindingNode.name).toBe("V5G Text Binding score");
    expect(bindingNode.text).toBe("42");
    expect(player.getRuntimeDiagnostics()).toMatchObject({
      textLayerBindingCount: 1,
      mountedNodeCount: 1,
    });

    binding.setText("99");
    expect(bindingNode.text).toBe("99");
    binding.dispose();
    expect(bindingNode.destroyed).toBe(true);
    expect(textNode.active).toBe(true);
    expect(player.getRuntimeDiagnostics()).toMatchObject({
      textLayerBindingCount: 0,
      mountedNodeCount: 0,
    });
  });

  it("renders chaser_light nodes and reports diagnostics", () => {
    const project = tinyProject({
      animations: [chaserLightAnimation()],
    });
    const { root, frames, player } = makePlayer(project);
    player.init();

    const layerNode = getFirstLayerNode(root);
    const chaserContainer = getFirstChaserLightContainer(root);
    expect(layerNode.active).toBe(false);
    expect(chaserContainer.name).toBe("Layer 1 Chaser Light");
    expect(chaserContainer.children).toHaveLength(4);
    expect(player.getRuntimeDiagnostics()).toMatchObject({
      chaserLightSpriteCount: 4,
      particleSpriteCount: 0,
      safeGlowSpriteCount: 0,
    });

    const chaserNode = chaserContainer.children[0];
    expect(chaserNode.name).toBe("V5G Chaser Light layer-1");
    expect(chaserNode.spriteFrame).toBe(frames.get("asset-1"));
    expect(chaserNode.blendMode).toEqual(getCocosBlendModeConfig("add"));
    expect(Number.isFinite(chaserNode.x)).toBe(true);
    expect(Number.isFinite(chaserNode.y)).toBe(true);
    expect(chaserNode.opacity).toBeGreaterThan(0);

    player.seek(0.125);
    expect(chaserContainer.children[0]).toBe(chaserNode);
    expect(player.getRuntimeDiagnostics().chaserLightSpriteCount).toBe(4);

    player.seek(1);
    expect(chaserContainer.children).toHaveLength(4);
    expect(chaserNode.destroyed).toBe(false);
    expect(player.getRuntimeDiagnostics().chaserLightSpriteCount).toBe(4);
    player.destroy();
    expect(chaserNode.destroyed).toBe(true);
  });

  it("maps fixed circular chaser_light samples to Cocos coordinates", () => {
    const project = tinyProject({
      animations: [
        chaserLightAnimation({
          params: {
            ...chaserLightAnimation().params,
            totalCount: 1,
            trajectory: 0,
            radius: 40,
            spacing: 0,
            centerX: 0,
            centerY: 0,
            lightDuration: 0.2,
            interval: 0.05,
          },
        }),
      ],
    });
    const { root, player } = makePlayer(project);
    player.init();
    const chaserNode = getFirstChaserLightContainer(root).children[0];

    expect(chaserNode.x).toBeCloseTo(100, 3);
    expect(chaserNode.y).toBeCloseTo(90, 3);
    expect(chaserNode.rotation).toBeCloseTo(0, 3);
    expect(chaserNode.opacity).toBe(128);

    player.seek(0.125);

    expect(getFirstChaserLightContainer(root).children[0]).toBe(chaserNode);
    expect(chaserNode.x).toBeCloseTo(100, 3);
    expect(chaserNode.y).toBeCloseTo(90, 3);
    expect(chaserNode.rotation).toBeCloseTo(0, 3);
  });

  it("creates legacy alpha masks and hides source layers when configured", () => {
    const project = tinyProject();
    project.layers.push({
      ...structuredClone(project.layers[0]),
      id: "layer-2",
      name: "Layer 2",
      mask: {
        enabled: true,
        sourceLayerId: "layer-1",
        mode: "alpha",
        compositeMode: "legacy_alpha",
        showSourceLayer: false,
      },
    });
    const { root, player } = makePlayer(project);
    player.init();

    const group = getFirstGroup(root);
    const sourceNode = group.children.find((node) => node.name === "Layer 1");
    const targetNode = group.children.find((node) => node.name === "Layer 2");
    const maskNode = group.children.find(
      (node) => node.name === "V5G Mask layer-2",
    );
    if (!sourceNode || !targetNode || !maskNode) {
      throw new Error("missing mask test nodes");
    }
    const sourceDisplayNode = sourceNode.children[0]?.children[0];
    if (!sourceDisplayNode) throw new Error("missing mask source display node");
    expect(sourceNode.active).toBe(true);
    expect(sourceDisplayNode.active).toBe(false);
    expect(targetNode.active).toBe(true);
    expect(maskNode.maskSource).toBe(sourceDisplayNode);
    expect(maskNode.maskTarget).toBe(targetNode);
    expect(player.getRuntimeDiagnostics().maskNodeCount).toBe(1);

    player.seek(0.25);
    expect(maskNode.maskSource).toBe(sourceDisplayNode);
    expect(maskNode.maskTarget).toBe(targetNode);

    player.destroy();
    expect(maskNode.maskTarget).toBeNull();
    expect(maskNode.destroyed).toBe(true);
  });

  it("initializes the lock_01 safe_glow export without creating layer slots", () => {
    const project = assertV5GProject(lock01Data);
    const { player } = makePlayer(project);

    expect(project.schemaVersion).toBe("VNI_0.017");
    expect(player.getLayerGroupSlots()).toEqual([]);
    player.init();
    expect(player.getLayerGroupSlots()).toEqual([]);
    expect(player.getLayerGroups()).toHaveLength(1);
    player.seek(0.5);
  });

  it("initializes the roundreel runtime_100 export and renders safe_glow with inherited add blend", () => {
    const project = assertV5GProject(roundreelData);
    const { root, player } = makePlayer(project);

    expect(project.schemaVersion).toBe("VNI_0.042");
    expect(project.exportProfile).toMatchObject({
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
    });
    player.init();
    expect(player.getLayerGroups()).toHaveLength(2);

    player.seek(1.175);

    const activeGroup = getContent(root).children.find((group) =>
      group.children.some(
        (child) =>
          child.name.endsWith(" Safe Glow") && child.children.length === 1,
      ),
    );
    if (!activeGroup) throw new Error("missing active safe_glow group");
    const layerNode = activeGroup.children[0].children[0].children[0];
    const safeGlowContainer = activeGroup.children.find((child) =>
      child.name.endsWith(" Safe Glow"),
    );
    if (!safeGlowContainer) throw new Error("missing safe_glow container");
    expect(layerNode.blendMode).toEqual(getCocosBlendModeConfig("add"));
    expect(safeGlowContainer.children).toHaveLength(1);
    const safeGlowNode = safeGlowContainer.children[0];
    expect(safeGlowNode.blendMode).toEqual(getCocosBlendModeConfig("add"));
    expect(safeGlowNode.spriteFrame?.id).toBe("asset_image_mqtjdi3v_3");
    expect(safeGlowNode.width).toBe(256);
    expect(safeGlowNode.height).toBe(256);
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

  it("fails before creating nodes for unsupported Cocos render effects", () => {
    const project = assertV5GProject(threeReelMultipay01Data);
    const { root, player } = makePlayer(project);

    expect(() => player.init()).toThrow(
      "Cocos runtime does not support VNI render effect animations yet",
    );
    expect(root.children).toHaveLength(0);
  });

  it("plays the non-effect 3reel group fixture and supports slot mounting", () => {
    const project = assertV5GProject(threeReelMultipay02Data);
    const { root, player } = makePlayer(project);
    player.init();

    expect(player.getLayerGroupSlots()[0]).toMatchObject({
      afterGroupId: "layer_group_mqqo4zrn_6",
      beforeGroupId: "group_default",
    });
    expect(getContent(root).children.map((node) => node.name)).toEqual([
      "V5G Group layer_group_mqqo4zrn_6",
      "V5G Slot layer_group_mqqo4zrn_6 -> group_default",
      "V5G Group group_default",
    ]);

    const external = new FakeNode("External Reel");
    player.attachNodeBetweenLayerGroups({
      id: "reel",
      afterGroupId: "layer_group_mqqo4zrn_6",
      beforeGroupId: "group_default",
      node: external,
    });
    expect(external.parent).toBe(getContent(root).children[1]);
    player.playRange({
      range: { unit: "time", start: 0, end: 0.5 },
      loop: false,
    });
    player.update(0.25);
    expect(player.time).toBe(0.25);
    expect(external.parent).toBe(getContent(root).children[1]);
  });

  it("resolves SpriteFrames from an atlas using the asset path filename", () => {
    const project = tinyProject();
    const root = new FakeNode("Root");
    const frames = framesFor(project);
    const queries: string[] = [];
    const player = new V5GCocosPlayer({
      root,
      project,
      assets: {
        atlas: {
          getSpriteFrame(name) {
            queries.push(name);
            return frames.get(name) ?? null;
          },
        },
      },
      driver: new FakeDriver(),
    });
    const frame = frames.get("asset-1");
    if (!frame) throw new Error("Missing fixture frame asset-1.");
    frames.set("a", frame);
    frames.delete("asset-1");

    player.init();

    expect(queries).toEqual(["a"]);
    expect(getFirstLayerNode(root).spriteFrame?.id).toBe("asset-1");
  });

  it("strips directories and extensions from atlas lookup keys", () => {
    const project = tinyProject({}, { path: "assets/nested/respin_a.png" });
    const root = new FakeNode("Root");
    const frames = framesFor(project);
    const frame = frames.get("asset-1");
    if (!frame) throw new Error("Missing fixture frame asset-1.");
    frames.set("respin_a", frame);
    frames.delete("asset-1");
    const queries: string[] = [];
    const player = new V5GCocosPlayer({
      root,
      project,
      assets: {
        atlas: {
          getSpriteFrame(name) {
            queries.push(name);
            return frames.get(name) ?? null;
          },
        },
      },
      driver: new FakeDriver(),
    });

    player.init();

    expect(queries).toEqual(["respin_a"]);
  });

  it("fails fast when an atlas source cannot provide a SpriteFrame", () => {
    const project = tinyProject();
    const root = new FakeNode("Root");
    const player = new V5GCocosPlayer({
      root,
      project,
      assets: {
        atlas: {
          getSpriteFrame() {
            return null;
          },
        },
      },
      driver: new FakeDriver(),
    });

    expect(() => player.init()).toThrow(
      'Missing Cocos SpriteFrame for V5G asset "asset-1" at "assets/a.png" using atlas key "a".',
    );
    expect(root.children).toHaveLength(0);
  });

  it("fails fast when assets.atlas is invalid", () => {
    const project = tinyProject();
    const root = new FakeNode("Root");
    const player = new V5GCocosPlayer({
      root,
      project,
      assets: { atlas: {} } as never,
      driver: new FakeDriver(),
    });

    expect(() => player.init()).toThrow(
      "V5GCocosPlayer assets.atlas must provide getSpriteFrame(name).",
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

  it("does not reject trimmed atlas SpriteFrame size", () => {
    const project = tinyProject();
    const root = new FakeNode("Root");
    const player = new V5GCocosPlayer({
      root,
      project,
      assets: {
        atlas: {
          getSpriteFrame(name) {
            if (name !== "a") return null;
            return { id: "asset-1", width: 60, height: 30 };
          },
        },
      },
      driver: new FakeDriver(),
    });

    expect(() => player.init()).not.toThrow();
    const layerNode = getFirstLayerNode(root);
    expect(layerNode.width).toBe(100);
    expect(layerNode.height).toBe(50);
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

    const layerNode = getFirstLayerNode(root);
    const layerOuter = getFirstLayerOuter(root);
    expect(layerNode.width).toBe(100);
    expect(layerNode.height).toBe(50);
    expect(layerOuter.scaleX).toBe(-1);
    expect(layerOuter.scaleY).toBe(2);

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
    expect(timeChanges).toEqual([0, 0.75, 1, 0, 0.25]);
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

  it("plays open-ended ranges to the project duration", () => {
    const omittedTimeEnd = makePlayer(tinyProject());
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

    const undefinedTimeEnd = makePlayer(tinyProject());
    undefinedTimeEnd.player.init();
    undefinedTimeEnd.player.playRange({
      range: { unit: "time", start: 0.25, end: undefined },
      loop: false,
    });
    undefinedTimeEnd.player.update(1);
    expect(undefinedTimeEnd.player.time).toBe(1);
    expect(undefinedTimeEnd.player.playing).toBe(false);

    const sentinelTimeEnd = makePlayer(tinyProject());
    sentinelTimeEnd.player.init();
    sentinelTimeEnd.player.playRange({
      range: { unit: "time", start: 0.25, end: -1 },
      loop: false,
    });
    sentinelTimeEnd.player.update(1);
    expect(sentinelTimeEnd.player.time).toBe(1);
    expect(sentinelTimeEnd.player.playing).toBe(false);

    const omittedFrameEnd = makePlayer(tinyProject());
    omittedFrameEnd.player.init();
    omittedFrameEnd.player.playRange({
      range: { unit: "frame", start: 30, fps: 60 },
      loop: false,
    });
    expect(omittedFrameEnd.player.time).toBe(0.5);
    omittedFrameEnd.player.update(1);
    expect(omittedFrameEnd.player.time).toBe(1);
    expect(omittedFrameEnd.player.playing).toBe(false);

    const sentinelFrameEnd = makePlayer(tinyProject());
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

  it("fires markers placed exactly on playback start and loop restart boundaries", () => {
    const { player } = makePlayer(tinyProject());
    const events: string[] = [];
    player.init();

    player.addPlaybackEvent({
      id: "timeline-start",
      at: { unit: "time", at: 0 },
      listener: (event) =>
        events.push(`timeline:${event.currentTime}:${event.loopIndex}`),
    });
    player.play();
    expect(events).toEqual(["timeline:0:0"]);

    player.pause();
    player.clearPlaybackEvents();
    events.length = 0;

    player.addPlaybackEvent({
      id: "range-start",
      at: { unit: "time", at: 0.2 },
      listener: (event) =>
        events.push(`range:${event.currentTime}:${event.loopIndex}`),
    });
    player.playRange({
      range: { unit: "time", start: 0.2, end: 0.4 },
      loop: true,
    });
    expect(events).toEqual(["range:0.2:0"]);

    player.update(0.45);
    expect(events).toEqual(["range:0.2:0", "range:0.2:1", "range:0.2:2"]);

    player.pause();
    player.clearPlaybackEvents();
    events.length = 0;

    player.addPlaybackEvent({
      id: "segmented-start",
      at: { unit: "time", at: 0 },
      once: true,
      listener: (event) =>
        events.push(`segmented:${event.currentTime}:${event.loopIndex}`),
    });
    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.2 },
      loopEnd: { unit: "time", at: 0.4 },
      keepParticlesAlive: true,
    });

    expect(events).toEqual(["segmented:0:0"]);
  });

  it("keeps range end markers registered immediately after playRange active", () => {
    const { player } = makePlayer(tinyProject());
    const events: string[] = [];
    player.init();

    player.playRange({
      range: { unit: "time", start: 0, end: 1 },
      loop: false,
    });
    player.clearPlaybackEvents();
    player.addPlaybackEvent({
      id: "BigWinAni_PlayStartAni",
      at: { unit: "time", at: 1 },
      once: true,
      listener: (event) =>
        events.push(`${event.id}:${event.currentTime}:${event.loopIndex}`),
    });

    player.update(1);

    expect(events).toEqual(["BigWinAni_PlayStartAni:1:0"]);
  });

  it("fires range end markers when the previous time is already within playback epsilon", () => {
    const { player } = makePlayer(tinyProject());
    const events: string[] = [];
    const complete: unknown[] = [];
    const epsilon = 1e-9;
    const startTime = 1 - epsilon / 2;
    player.init();
    player.addPlaybackEvent({
      id: "epsilon-end",
      at: { unit: "time", at: 1 },
      once: true,
      listener: (event) =>
        events.push(`${event.id}:${event.currentTime}:${event.loopIndex}`),
    });
    player.onPlaybackComplete((event) => complete.push(event));

    player.playRange({
      range: { unit: "time", start: startTime, end: 1 },
      loop: false,
    });
    player.update(epsilon / 2);

    expect(events).toEqual(["epsilon-end:1:0"]);
    expect(complete).toEqual([
      { startTime, endTime: 1, currentTime: 1, loopIndex: 0 },
    ]);
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

  it("deduplicates complete listener registrations", () => {
    const { player } = makePlayer(tinyProject());
    const complete: unknown[] = [];
    const listener = (event: unknown): void => {
      complete.push(event);
    };
    player.init();
    const disposeFirst = player.onPlaybackComplete(listener);
    const disposeSecond = player.onPlaybackComplete(listener);

    player.setLoop(false);
    player.play();
    player.update(1);

    expect(complete).toHaveLength(1);
    disposeFirst();
    disposeSecond();
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

  it("renders active layer particles in the layer particle container", () => {
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

    const particleRoot = getParticleRoot(root);
    const layerNode = getFirstLayerNode(root);
    const particleContainer = getFirstParticleContainer(root);
    expect(layerNode.active).toBe(true);
    expect(particleRoot.children).toHaveLength(0);
    expect(particleContainer.name).toBe("Layer 1 Particles");
    expect(particleContainer.children).toHaveLength(0);

    player.seek(0.5);
    expect(particleContainer.children).toHaveLength(3);
    const firstParticle = particleContainer.children[0];
    const firstRotation = firstParticle.rotation;
    player.seek(0.75);

    expect(firstParticle.destroyed).toBe(false);
    expect(particleRoot.children).toHaveLength(0);
    expect(particleContainer.children).toHaveLength(3);
    expect(particleContainer.children[0]).toBe(firstParticle);
    expect(particleContainer.children[0].spriteFrame?.id).toBe("asset-1");
    expect(particleContainer.children[0].width).toBe(project.assets[0].width);
    expect(particleContainer.children[0].height).toBe(project.assets[0].height);
    expect(Number.isFinite(particleContainer.children[0].rotation)).toBe(true);
    expect(particleContainer.children[0].rotation).not.toBe(firstRotation);
    expect(particleContainer.children[0].blendMode).toEqual(
      getCocosBlendModeConfig("add"),
    );
  });

  it("supports segmented hold playback, user-requested ending, and particle drain", () => {
    const project = tinyProject({
      animations: [particleWallAnimation({ duration: 1 })],
    });
    project.stage.duration = 2;
    const { root, player } = makePlayer(project);
    const complete: unknown[] = [];
    player.init();
    player.setLoop(false);
    player.onPlaybackComplete((event) => complete.push(event));

    expect(() => player.requestSegmentedPlaybackEnd()).toThrow(
      "No active V5G segmented playback",
    );

    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.5 },
      loopEnd: { unit: "time", at: 0.5 },
    });
    player.update(0.6);

    const particleContainer = getFirstParticleContainer(root);
    expect(player.time).toBe(0.5);
    expect(player.getPlaybackState()).toMatchObject({
      mode: "segmented",
      phase: "loop",
      keepParticlesAlive: true,
    });
    expect(particleContainer.children.length).toBeGreaterThan(0);
    const firstX = particleContainer.children[0].x;

    player.update(0.6);
    expect(player.time).toBe(0.5);
    expect(particleContainer.children.length).toBeGreaterThan(0);
    expect(particleContainer.children[0].x).not.toBe(firstX);

    player.requestSegmentedPlaybackEnd();
    expect(player.getPlaybackState().phase).toBe("ending");
    player.update(2);
    expect(player.getPlaybackState().phase).toBe("particle-draining");
    expect(player.playing).toBe(false);
    expect(complete).toEqual([]);

    player.pause();
    player.update(1);
    expect(player.getPlaybackState().phase).toBe("particle-draining");
    expect(complete).toEqual([]);

    player.play();
    player.update(1);
    expect(player.getPlaybackState().phase).toBe("complete");
    expect(complete).toEqual([
      { startTime: 0, endTime: 2, currentTime: 2, loopIndex: 0 },
    ]);
  });

  it("force stops all particles and controls same-playback re-emission", () => {
    const project = tinyProject({
      animations: [particleWallAnimation({ duration: 1 })],
    });
    project.stage.duration = 2;
    const { root, player } = makePlayer(project);
    const complete: unknown[] = [];
    player.onPlaybackComplete((event) => complete.push(event));

    expect(() => player.forceStopAllParticles()).toThrow(
      "V5GCocosPlayer must be initialized before forceStopAllParticles.",
    );

    player.init();
    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.5 },
      loopEnd: { unit: "time", at: 0.5 },
    });
    player.update(0.6);

    const particleContainer = getFirstParticleContainer(root);
    const firstParticle = particleContainer.children[0];
    expect(player.getRuntimeDiagnostics().particleSpriteCount).toBeGreaterThan(
      0,
    );
    expect(player.getPlaybackState().liveParticleCount).toBeGreaterThan(0);

    player.forceStopAllParticles();
    expect(firstParticle.destroyed).toBe(true);
    expect(particleContainer.children).toHaveLength(0);
    expect(player.getRuntimeDiagnostics()).toMatchObject({
      particleSpriteCount: 0,
      liveParticleCount: 0,
    });
    expect(player.getPlaybackState().liveParticleCount).toBe(0);

    player.update(0.25);
    expect(particleContainer.children).toHaveLength(0);
    expect(complete).toEqual([]);

    player.seek(0.5);
    expect(particleContainer.children.length).toBeGreaterThan(0);

    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.5 },
      loopEnd: { unit: "time", at: 0.5 },
    });
    player.update(0.6);
    expect(particleContainer.children.length).toBeGreaterThan(0);

    player.forceStopAllParticles({ suppressUntilNextPlayback: false });
    expect(particleContainer.children).toHaveLength(0);
    player.update(0.1);
    expect(particleContainer.children.length).toBeGreaterThan(0);
    expect(() =>
      player.forceStopAllParticles({
        suppressUntilNextPlayback: "yes" as never,
      }),
    ).toThrow(
      "V5GCocosPlayer.forceStopAllParticles suppressUntilNextPlayback must be a boolean.",
    );
  });

  it("force stops particle drain and emits pending complete once", () => {
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
    player.requestSegmentedPlaybackEnd();
    player.update(2);

    expect(player.getPlaybackState().phase).toBe("particle-draining");
    expect(complete).toEqual([]);

    player.forceStopAllParticles();
    expect(player.getPlaybackState()).toMatchObject({
      phase: "complete",
      liveParticleCount: 0,
      isDrainingParticles: false,
    });
    expect(getFirstParticleContainer(root).children).toHaveLength(0);
    expect(complete).toEqual([
      { startTime: 0, endTime: 2, currentTime: 2, loopIndex: 0 },
    ]);

    player.forceStopAllParticles();
    expect(complete).toHaveLength(1);
  });

  it("delays segmented force-stop particles until ending completes", () => {
    const project = tinyProject({
      animations: [particleWallAnimation({ duration: 2 })],
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

    const particleContainer = getFirstParticleContainer(root);
    const visibleDuringLoop = particleContainer.children.length;
    expect(visibleDuringLoop).toBeGreaterThan(0);

    player.requestSegmentedPlaybackEnd({ forceStopParticles: true });
    expect(particleContainer.children).toHaveLength(visibleDuringLoop);
    expect(player.getPlaybackState().phase).toBe("ending");
    player.update(0.25);
    expect(player.getPlaybackState().phase).toBe("ending");
    expect(particleContainer.children.length).toBeGreaterThan(0);
    expect(complete).toEqual([]);

    player.update(2);
    expect(player.getPlaybackState()).toMatchObject({
      phase: "complete",
      isDrainingParticles: false,
      liveParticleCount: 0,
    });
    expect(particleContainer.children).toHaveLength(0);
    expect(complete).toEqual([
      { startTime: 0, endTime: 2, currentTime: 2, loopIndex: 0 },
    ]);

    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.5 },
      loopEnd: { unit: "time", at: 0.5 },
    });
    player.update(0.6);
    player.requestSegmentedPlaybackEnd();
    player.update(2);
    expect(player.getPlaybackState().phase).toBe("particle-draining");
  });

  it("supports segmented force-stop requests from the start phase", () => {
    const project = tinyProject({
      animations: [particleWallAnimation({ duration: 2 })],
    });
    project.stage.duration = 2;
    const { root, player } = makePlayer(project);
    const complete: unknown[] = [];
    player.init();
    player.onPlaybackComplete((event) => complete.push(event));
    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.7 },
      loopEnd: { unit: "time", at: 0.7 },
    });
    player.update(0.2);

    const particleContainer = getFirstParticleContainer(root);
    expect(player.getPlaybackState().phase).toBe("start");
    expect(particleContainer.children.length).toBeGreaterThan(0);

    player.requestSegmentedPlaybackEnd({ forceStopParticles: true });
    expect(player.getPlaybackState().phase).toBe("start");
    expect(particleContainer.children.length).toBeGreaterThan(0);

    player.update(0.55);
    expect(player.getPlaybackState().phase).toBe("ending");
    expect(particleContainer.children.length).toBeGreaterThan(0);
    player.update(2);
    expect(player.getPlaybackState()).toMatchObject({
      phase: "complete",
      liveParticleCount: 0,
      isDrainingParticles: false,
    });
    expect(particleContainer.children).toHaveLength(0);
    expect(complete).toEqual([
      { startTime: 0, endTime: 2, currentTime: 2, loopIndex: 0 },
    ]);
  });

  it("keeps segmented end parameter validation fail-fast", () => {
    const project = tinyProject();
    const { player } = makePlayer(project);
    player.init();
    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.5 },
      loopEnd: { unit: "time", at: 0.5 },
    });
    player.update(0.6);

    expect(() =>
      player.requestSegmentedPlaybackEnd({
        forceStopParticles: "yes" as never,
      }),
    ).toThrow(
      "V5GCocosPlayer.requestSegmentedPlaybackEnd forceStopParticles must be a boolean.",
    );

    player.requestSegmentedPlaybackEnd({ forceStopParticles: false });
    expect(() => player.requestSegmentedPlaybackEnd()).toThrow(
      'Cannot request segmented playback end while phase is "ending".',
    );
  });

  it("supports segmented range loops", () => {
    const project = tinyProject();
    project.stage.duration = 2;
    const { player } = makePlayer(project);
    player.init();

    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.5 },
      loopEnd: { unit: "time", at: 1 },
      keepParticlesAlive: false,
    });
    player.update(1.25);

    expect(player.getPlaybackState()).toMatchObject({
      mode: "segmented",
      phase: "loop",
      loopIndex: 1,
      keepParticlesAlive: false,
    });
    expect(player.time).toBeCloseTo(0.75, 5);
  });

  it("switches sequence SpriteFrames without recreating the layer node", () => {
    const project = tinyProject({
      type: "sequence",
      assetId: null,
      sequence: {
        frameAssetIds: ["asset-1", "asset-2"],
        cycleDuration: 1,
        loop: true,
      },
    });
    project.schemaVersion = "VNI_0.095";
    project.editor.version = "VNI_0.095";
    project.assets.push({
      id: "asset-2",
      type: "image",
      path: "assets/b.png",
      originalName: "b.png",
      width: 100,
      height: 50,
    });
    const { root, frames, player } = makePlayer(project);
    player.init();
    const layerNode = getFirstLayerNode(root);

    expect(layerNode.spriteFrame).toBe(frames.get("asset-1"));
    for (let frame = 0; frame < 300; frame += 1) {
      player.seek(((frame + 1) % 60) / 60);
      expect(getFirstLayerNode(root)).toBe(layerNode);
    }
    expect(getFirstLayerNode(root)).toBe(layerNode);
    expect(layerNode.spriteFrame).toBe(frames.get("asset-1"));
  });

  it("preallocates and reuses card_carousel_3d card and slice nodes", () => {
    const project = tinyProject({
      animations: [cardCarouselAnimation()],
    });
    project.schemaVersion = "VNI_0.095";
    project.editor.version = "VNI_0.095";
    const { root, frames, player } = makePlayer(project);
    player.init();
    const cardRoot = getFirstGroup(root).children.find((node) =>
      node.name.startsWith("V5G Card Carousel"),
    );
    expect(cardRoot).toBeDefined();
    expect(cardRoot?.children).toHaveLength(3);
    expect(cardRoot?.children[0].children).toHaveLength(4);
    expect(player.getRuntimeDiagnostics()).toMatchObject({
      cardCarouselCardPoolSize: 3,
      cardCarouselSlicePoolSize: 12,
      visibleCardCarouselCardCount: 3,
    });
    const cards = [...(cardRoot?.children ?? [])];
    const slices = cards.map((card) => [...card.children]);

    for (let frame = 0; frame < 300; frame += 1) {
      player.seek(((frame + 1) % 60) / 60);
      expect(cardRoot?.children).toEqual(cards);
      expect(cards.map((card) => card.children)).toEqual(slices);
    }

    const ownedFrames = slices.flatMap((nodes) =>
      nodes.map((node) => node.spriteFrame),
    );
    player.destroy();
    for (const frame of ownedFrames) {
      expect(frame?.destroyed).toBe(true);
    }
    expect(frames.get("asset-1")?.destroyed).not.toBe(true);
  });

  it("runs host-driven manual hold, continuous selection, and dynamic resolve", async () => {
    const { root, driver, frames, player } = makePlayer(
      manualCardCarouselProject(),
    );
    player.init();
    const session = player.createManualPlaybackSession();
    const info = session.listAnimations({
      capability: "cyclic-selection",
    });
    expect(info).toHaveLength(1);
    expect(info[0].ref).toEqual({
      layerId: "layer-1",
      animationId: "cards",
    });
    const cyclic = session.getAnimation(info[0].ref).requireCyclicSelection();
    const descriptor = cyclic.getAuthoredPreviewDescriptor();
    expect(descriptor).toMatchObject({
      introRange: { unit: "time", start: 0, end: 0.2 },
      continuousHoldPoint: { unit: "time", at: 0.2 },
      endingRange: { unit: "time", start: 0.4, end: 1.8 },
      authoredTargetCarrierIndex: 1,
    });
    const sourceFrame = frames.get("asset-1") as FakeSpriteFrame;
    const carriers = [0, 1, 2].map((index) => ({
      key: `bamboo-card-0${index}`,
      visual: {
        kind: "node" as const,
        node: complexCarrierNode(`card-${index}`, sourceFrame),
        width: 100,
        height: 50,
        revision: "initial-v1",
      },
    }));
    await cyclic.setInitialItems(carriers).ready;
    expect(driver.captureCount).toBe(3);

    const intro = session.playRange({ range: descriptor.introRange });
    player.update(0.2);
    await expect(intro.completed).resolves.toEqual({ reason: "complete" });
    const hold = session.holdTimeline({
      at: descriptor.continuousHoldPoint,
    });
    cyclic.startContinuousPhase({
      phaseId: descriptor.continuousPhaseId,
    });
    const cardRoot = getFirstGroup(root).children.find((node) =>
      node.name.startsWith("V5G Card Carousel"),
    ) as FakeNode;
    const cards = [...cardRoot.children];
    const slices = cards.map((card) => [...card.children]);
    for (let frame = 0; frame < 300; frame += 1) {
      player.update(1 / 60);
    }
    expect(driver.captureCount).toBe(3);
    expect(cardRoot.children).toEqual(cards);
    expect(cards.map((card) => card.children)).toEqual(slices);
    expect(cyclic.getState().continuousElapsedSeconds).toBeCloseTo(5, 10);

    await expect(
      cyclic.prepareSelection({
        selectedItem: { key: "bamboo-card-01" },
      }).committed,
    ).resolves.toEqual({
      itemKey: "bamboo-card-01",
      carrierIndex: 1,
    });
    hold.release();
    cyclic.startResolvePhase();
    const ending = session.playRange({
      range: descriptor.endingRange,
      preserveRuntimeAnimationState: true,
    });
    player.update(2);
    await expect(ending.completed).resolves.toEqual({ reason: "complete" });
    expect(cyclic.getState()).toMatchObject({
      phase: "complete",
      selectedCarrierIndex: 1,
    });
    session.destroy();
    expect(driver.capturedReleaseCount).toBe(3);
    expect(carriers.every((item) => !item.visual.node.destroyed)).toBe(true);
  });

  it("captures replacement nodes once, commits only on update, and stays bounded for 20 rounds", async () => {
    const { driver, frames, player } = makePlayer(manualCardCarouselProject());
    player.init();
    const session = player.createManualPlaybackSession();
    const cyclic = session
      .getAnimation({ layerId: "layer-1", animationId: "cards" })
      .requireCyclicSelection();
    const sourceFrame = frames.get("asset-1") as FakeSpriteFrame;
    cyclic.adoptAuthoredItems();
    const hold = session.holdTimeline({
      at: { unit: "time", at: 0.2 },
    });
    const initialDiagnostics = player.getRuntimeDiagnostics();

    for (let round = 0; round < 20; round += 1) {
      cyclic.startContinuousPhase({ phaseId: "idle" });
      player.update(0.016);
      const hostNode = complexCarrierNode(`server-card-${round}`, sourceFrame);
      const transaction = cyclic.prepareSelection({
        selectedItem: {
          key: `server-card-${round}`,
          visual: {
            kind: "node",
            node: hostNode,
            width: 100,
            height: 50,
            revision: `result-${round}`,
          },
        },
      });
      await flushPromiseJobs();
      expect(cyclic.getState().phase).toBe("selection-pending");
      player.update(0.016);
      await expect(transaction.committed).resolves.toMatchObject({
        itemKey: `server-card-${round}`,
      });
      expect(hostNode.destroyed).toBe(false);
      cyclic.clear();
      cyclic.adoptAuthoredItems();
    }

    expect(driver.captureCount).toBe(20);
    expect(driver.capturedReleaseCount).toBe(20);
    expect(player.getRuntimeDiagnostics()).toMatchObject({
      cardCarouselCardPoolSize: initialDiagnostics.cardCarouselCardPoolSize,
      cardCarouselSlicePoolSize: initialDiagnostics.cardCarouselSlicePoolSize,
    });
    hold.release();
    session.destroy();
  });

  it("rejects transport conflicts and cancellation without mutating the host node", async () => {
    const { frames, player } = makePlayer(manualCardCarouselProject());
    player.init();
    const session = player.createManualPlaybackSession();
    expect(() => player.play()).toThrow("manual playback session");
    expect(() => player.seek(0)).toThrow("manual playback session");
    expect(() => player.pause()).toThrow("manual playback session");
    const cyclic = session
      .getAnimation({ layerId: "layer-1", animationId: "cards" })
      .requireCyclicSelection();
    const node = complexCarrierNode(
      "cancelled",
      frames.get("asset-1") as FakeSpriteFrame,
    );
    const operation = cyclic.setInitialItems(
      [0, 1, 2].map((index) => ({
        key: `item-${index}`,
        visual: {
          kind: "node" as const,
          node:
            index === 0
              ? node
              : complexCarrierNode(
                  `cancelled-${index}`,
                  frames.get("asset-1") as FakeSpriteFrame,
                ),
          width: 100,
          height: 50,
        },
      })),
    );
    operation.cancel();
    await expect(operation.ready).rejects.toMatchObject({
      name: "V5GCocosPlaybackCancelledError",
    });
    await Promise.resolve();
    expect(node.destroyed).toBe(false);
    session.destroy();
  });

  it("rolls back capture failures and rejects invalid carrier contracts", async () => {
    const { driver, frames, player } = makePlayer(manualCardCarouselProject());
    player.init();
    const session = player.createManualPlaybackSession();
    const cyclic = session
      .getAnimation({ layerId: "layer-1", animationId: "cards" })
      .requireCyclicSelection();
    const source = frames.get("asset-1") as FakeSpriteFrame;
    const nodes = [0, 1, 2].map((index) =>
      complexCarrierNode(`strict-${index}`, source),
    );
    expect(() =>
      cyclic.setInitialItems(
        nodes.map((node, index) => ({
          key: index === 2 ? "same-key" : `item-${index}`,
          visual: {
            kind: "node" as const,
            node,
            width: index === 1 ? 0 : 100,
            height: 50,
          },
        })),
      ),
    ).toThrow("finite and positive");
    expect(() =>
      cyclic.setInitialItems(
        nodes.map((node, index) => ({
          key: "duplicate",
          visual: {
            kind: "node" as const,
            node,
            width: 100,
            height: 50,
          },
        })),
      ),
    ).toThrow("Duplicate");
    expect(() =>
      cyclic.setInitialItems(
        [nodes[0], nodes[0], nodes[2]].map((node, index) => ({
          key: `unique-${index}`,
          visual: {
            kind: "node" as const,
            node,
            width: 100,
            height: 50,
          },
        })),
      ),
    ).toThrow("same host Node");

    driver.failCaptureAt = 2;
    const failed = cyclic.setInitialItems(
      nodes.map((node, index) => ({
        key: `valid-${index}`,
        visual: {
          kind: "node" as const,
          node,
          width: 100,
          height: 50,
          revision: "capture-failure",
        },
      })),
    );
    await expect(failed.ready).rejects.toThrow(
      "synthetic complete subtree capture failure",
    );
    expect(cyclic.getState()).toMatchObject({
      phase: "uncontrolled",
      carrierKeys: [],
    });
    expect(driver.capturedReleaseCount).toBe(2);

    driver.failCaptureAt = 0;
    cyclic.adoptAuthoredItems();
    const operation = session.playRange({
      range: { unit: "time", start: 0, end: 1 },
    });
    player.update(0.1);
    session.destroy();
    await expect(operation.completed).rejects.toMatchObject({
      name: "V5GCocosPlaybackCancelledError",
    });
    expect(nodes.every((node) => !node.destroyed)).toBe(true);
  });

  it("reuses wave_distort nodes and cached slice frames across seeks", () => {
    const project = tinyProject({
      animations: [
        {
          id: "wave",
          type: "wave_distort",
          startTime: 0,
          duration: 1,
          enabled: true,
          seed: 3,
          params: {
            rows: 4,
            amplitude: 12,
            frequency: 2,
            cycles: 1,
            speed: 1,
            phaseOffset: 0,
            verticalBob: 0,
            alpha: 1,
            edgeFeather: 0,
            keepOriginal: false,
          },
        },
      ],
    });
    project.schemaVersion = "VNI_0.095";
    project.editor.version = "VNI_0.095";
    const { root, frames: sourceFrames, player } = makePlayer(project);
    player.init();
    const effectRoot = getFirstGroup(root).children.find((node) =>
      node.name.endsWith("Deterministic Effects"),
    );
    expect(effectRoot).toBeDefined();
    expect(effectRoot?.children).toHaveLength(4);
    expect(player.getRuntimeDiagnostics().deterministicEffectSpriteCount).toBe(
      4,
    );
    const nodes = [...(effectRoot?.children ?? [])];
    const frames = nodes.map((node) => node.spriteFrame);

    for (let frame = 0; frame < 300; frame += 1) {
      player.seek(((frame + 1) % 60) / 60);
      expect(effectRoot?.children).toEqual(nodes);
      expect(nodes.map((node) => node.spriteFrame)).toEqual(frames);
    }

    player.destroy();
    for (const frame of frames) {
      expect(frame?.destroyed).toBe(true);
    }
    expect(sourceFrames.get("asset-1")?.destroyed).not.toBe(true);
  });

  it("renders speed_lines through the driver line primitive and blend state", () => {
    const project = tinyProject({
      animations: [
        {
          id: "lines",
          type: "speed_lines",
          startTime: 0,
          duration: 1,
          enabled: true,
          seed: 9,
          params: {
            mode: 0,
            count: 6,
            radius: 80,
            length: 30,
            speed: 1,
            direction: 0,
            spreadAngle: 360,
            lineWidth: 2,
            alpha: 0.8,
            keepOriginal: false,
            fadeOut: true,
          },
        },
      ],
    });
    project.schemaVersion = "VNI_0.095";
    project.editor.version = "VNI_0.095";
    const { root, player } = makePlayer(project);
    player.init();
    const effectRoot = getFirstGroup(root).children.find((node) =>
      node.name.endsWith("Deterministic Effects"),
    );
    const lineNode = effectRoot?.children[0];

    expect(lineNode?.name).toBe("Layer 1 Deterministic Lines");
    expect(lineNode?.lines).toHaveLength(6);
    expect(lineNode?.blendMode).toEqual(getCocosBlendModeConfig("add"));
    expect(player.getRuntimeDiagnostics().deterministicEffectLineCount).toBe(6);
    for (let frame = 0; frame < 300; frame += 1) {
      player.seek(((frame + 1) % 60) / 60);
      expect(effectRoot?.children[0]).toBe(lineNode);
      expect(lineNode?.lines).toHaveLength(6);
    }
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
