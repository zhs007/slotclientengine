import { describe, expect, it } from "vitest";
import { Node, Sprite, SpriteFrame, UITransform, UIOpacity } from "cc";
import roundreelData from "../fixtures/roundreel.json";
import {
  assertV5GProject,
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

function getStage(root: Node): Node {
  return root.children[0];
}

function getContent(root: Node): Node {
  return getStage(root).children[0];
}

function getParticleRoot(root: Node): Node {
  return getStage(root).children[1];
}

function getFirstGroup(root: Node): Node {
  return getContent(root).children[0];
}

function getFirstLayerNode(root: Node): Node {
  return getFirstGroup(root).children[0];
}

function getFirstSafeGlowContainer(root: Node): Node {
  return getFirstGroup(root).children[1];
}

function getFirstParticleContainer(root: Node): Node {
  return getFirstGroup(root).children[2];
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

    const stage = getStage(root);
    expect(stage.name).toBe("V5G Stage");
    expect(inspectTransform(stage).width).toBe(320);
    expect(inspectTransform(stage).height).toBe(240);
    expect(stage.children.map((node) => node.name)).toEqual([
      "V5G Content",
      "V5G Particles",
    ]);
    expect(getParticleRoot(root).children).toHaveLength(0);
    expect(getContent(root).children.map((node) => node.name)).toEqual([
      "V5G Group group_default",
    ]);
    expect(getFirstGroup(root).children.map((node) => node.name)).toEqual([
      "Layer 1",
      "Layer 1 Safe Glow",
      "Layer 1 Particles",
    ]);
  });

  it("creates group slots and mounts nodes in standalone", () => {
    const { root, player } = makePlayer(twoGroupProject());
    player.init();

    expect(getContent(root).children.map((node) => node.name)).toEqual([
      "V5G Group lower",
      "V5G Slot lower -> upper",
      "V5G Group upper",
    ]);
    expect(player.getLayerGroupSlots()).toEqual([
      {
        afterGroupId: "lower",
        afterGroupName: "Lower",
        beforeGroupId: "upper",
        beforeGroupName: "Upper",
        renderIndex: 0,
      },
    ]);

    const external = new Node("External");
    external.setPosition(12, -7, 0);
    const dispose = player.attachNodeBetweenLayerGroups({
      id: "external",
      afterGroupId: "lower",
      beforeGroupId: "upper",
      node: external,
    });
    expect(external.parent).toBe(getContent(root).children[1]);
    expect(inspectNode(external).position).toEqual({ x: 12, y: -7, z: 0 });
    dispose();
    dispose();
    expect(external.parent).toBeNull();
    expect(inspectNode(external).destroyed).toBe(false);

    const assetDispose = player.attachProjectAssetBetweenLayerGroups({
      id: "asset-node",
      afterGroupId: "lower",
      beforeGroupId: "upper",
      assetId: "asset-1",
      opacity: 0.25,
    });
    const assetNode = getContent(root).children[1].children[0];
    expect(assetNode.name).toBe("V5G Mounted Image asset-1");
    expect(requireOpacity(assetNode).opacity).toBe(64);
    assetDispose();
    expect(inspectNode(assetNode).destroyed).toBe(true);
  });

  it("mounts node batches, reorders repeated nodes, and restores original parents", () => {
    const { root, player } = makePlayer(twoGroupProject());
    player.init();
    const slot = getContent(root).children[1];
    const host = new Node("Host");
    const first = new Node("First");
    const second = new Node("Second");
    const floating = new Node("Floating");
    host.setPosition(100, 20, 0);
    host.setScale(2, 3, 1);
    host.setRotationFromEuler(0, 0, 30);
    slot.setPosition(-75, 12, 0);
    slot.setScale(0.5, 2, 1);
    slot.setRotationFromEuler(0, 0, -15);
    first.setPosition(25, -10, 0);
    first.setScale(1.5, 1, 1);
    first.setRotationFromEuler(0, 0, 5);
    second.setPosition(-8, 12, 0);
    second.setScale(1, 0.5, 1);
    second.setRotationFromEuler(0, 0, -12);
    host.addChild(first);
    host.addChild(second);
    const firstOriginalLocal = captureNodeLocalTransform(first);
    const secondOriginalLocal = captureNodeLocalTransform(second);
    const firstWorldBeforeMount = captureNodeWorldTransform(first);
    const secondWorldBeforeMount = captureNodeWorldTransform(second);

    const batchDispose = player.attachNodeBetweenLayerGroups({
      ids: ["first", "second"],
      afterGroupId: "lower",
      beforeGroupId: "upper",
      nodes: [first, second],
    });
    expect(slot.children.map((node) => node.name)).toEqual(["First", "Second"]);
    expect(host.children).toHaveLength(0);
    expect(captureNodeLocalTransform(first).x).not.toBe(firstOriginalLocal.x);
    expect(captureNodeLocalTransform(second).x).not.toBe(secondOriginalLocal.x);
    expectNodeTransformClose(
      captureNodeWorldTransform(first),
      firstWorldBeforeMount,
    );
    expectNodeTransformClose(
      captureNodeWorldTransform(second),
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
    expectNodeTransformClose(
      captureNodeWorldTransform(first),
      firstWorldBeforeMount,
    );

    batchDispose();
    expect(slot.children.map((node) => node.name)).toEqual([
      "Floating",
      "First",
    ]);
    expect(second.parent).toBe(host);
    expect(first.parent).toBe(slot);
    expectNodeTransformClose(
      captureNodeLocalTransform(second),
      secondOriginalLocal,
    );

    player.detachMountedNodes([floating, "first-moved"]);
    expect(floating.parent).toBeNull();
    expect(first.parent).toBe(host);
    expectNodeTransformClose(
      captureNodeLocalTransform(first),
      firstOriginalLocal,
    );
    expect(host.children.map((node) => node.name)).toEqual(["Second", "First"]);

    moveDispose();
    floatingDispose();
    const clearFirst = new Node("Clear First");
    const clearSecond = new Node("Clear Second");
    host.addChild(clearFirst);
    host.addChild(clearSecond);
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

    const layerNode = getFirstLayerNode(root);
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
      "Layer 1 Particles",
    ]);
    expect(particleContainer.name).toBe("Layer 1 Particles");
    expect(layerNode.active).toBe(false);
    expect(safeGlowContainer.children).toHaveLength(1);

    const safeGlowNode = safeGlowContainer.children[0];
    expect(safeGlowNode.name).toBe("V5G Safe Glow layer-1");
    expect(safeGlowNode.active).toBe(true);
    expect(requireSprite(safeGlowNode).spriteFrame).toBe(frames.get("asset-1"));
    expect(inspectTransform(safeGlowNode).width).toBe(100);
    expect(inspectTransform(safeGlowNode).height).toBe(50);
    expect(inspectTransform(safeGlowNode).anchorX).toBe(0.25);
    expect(inspectTransform(safeGlowNode).anchorY).toBe(0.75);
    expect(inspectNode(safeGlowNode).position).toEqual({
      x: 100,
      y: 50,
      z: 0,
    });
    expect(inspectNode(safeGlowNode).scale).toEqual({
      x: -1.2,
      y: 2.4,
      z: 1,
    });
    expect(inspectNode(safeGlowNode).rotation.z).toBeCloseTo(30, 3);
    expect(requireOpacity(safeGlowNode).opacity).toBe(51);
    expect(requireSprite(safeGlowNode).srcBlendFactor).toBe(
      COCOS_BLEND_FACTOR.SRC_ALPHA,
    );
    expect(requireSprite(safeGlowNode).dstBlendFactor).toBe(
      COCOS_BLEND_FACTOR.ONE,
    );
    const safeGlowTarget =
      requireSprite(safeGlowNode).getMaterialInstance(0)?.passes[0].blendState
        .targets[0];
    expect(safeGlowTarget?.blend).toBe(true);
    expect(safeGlowTarget?.blendSrc).toBe(COCOS_BLEND_FACTOR.SRC_ALPHA);
    expect(safeGlowTarget?.blendDst).toBe(COCOS_BLEND_FACTOR.ONE);
    expect(safeGlowTarget?.blendEq).toBe(COCOS_BLEND_OP.ADD);

    player.seek(1);
    expect(safeGlowContainer.children).toHaveLength(0);
    expect(inspectNode(safeGlowNode).destroyed).toBe(true);
  });

  it("renders the roundreel runtime_100 safe_glow node with inherited add blend", () => {
    const project = assertV5GProject(roundreelData);
    const { root, frames, player } = makePlayer(project);

    expect(project.schemaVersion).toBe("VNI_0.020");
    expect(project.exportProfile).toMatchObject({
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
    });
    player.init();
    player.seek(1.175);

    const layerSprite = requireSprite(getFirstLayerNode(root));
    const safeGlowContainer = getFirstSafeGlowContainer(root);
    expect(layerSprite.srcBlendFactor).toBe(COCOS_BLEND_FACTOR.SRC_ALPHA);
    expect(layerSprite.dstBlendFactor).toBe(COCOS_BLEND_FACTOR.ONE);
    expect(safeGlowContainer.children).toHaveLength(1);

    const safeGlowSprite = requireSprite(safeGlowContainer.children[0]);
    expect(safeGlowSprite.spriteFrame).toBe(
      frames.get("asset_image_mqtjdi3v_3"),
    );
    expect(safeGlowSprite.srcBlendFactor).toBe(COCOS_BLEND_FACTOR.SRC_ALPHA);
    expect(safeGlowSprite.dstBlendFactor).toBe(COCOS_BLEND_FACTOR.ONE);
    const target =
      safeGlowSprite.getMaterialInstance(0)?.passes[0].blendState.targets[0];
    expect(target?.blend).toBe(true);
    expect(target?.blendDst).toBe(COCOS_BLEND_FACTOR.ONE);
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
    expect(requireSprite(getFirstLayerNode(atlasRoot)).spriteFrame).toBe(frame);

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
    const trimmedLayerNode = getFirstLayerNode(trimmedAtlasRoot);
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

    const layerNode = getFirstLayerNode(root);
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

    const particleContainer = getFirstParticleContainer(root);
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

interface NodeTransformSnapshot {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

function inspectNode(node: Node): InspectableNode {
  return node as InspectableNode;
}

function inspectTransform(node: Node): InspectableTransform {
  return requireTransform(node) as InspectableTransform;
}

function captureNodeLocalTransform(node: Node): NodeTransformSnapshot {
  const inspected = inspectNode(node);
  return {
    x: inspected.position.x,
    y: inspected.position.y,
    scaleX: inspected.scale.x,
    scaleY: inspected.scale.y,
    rotation: inspected.rotation.z,
  };
}

function captureNodeWorldTransform(node: Node): NodeTransformSnapshot {
  const position = node.getWorldPosition();
  const scale = node.getWorldScale();
  const rotation = node.getWorldRotation();
  return {
    x: position.x,
    y: position.y,
    scaleX: scale.x,
    scaleY: scale.y,
    rotation: rotation.z,
  };
}

function expectNodeTransformClose(
  actual: NodeTransformSnapshot,
  expected: NodeTransformSnapshot,
): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.scaleX).toBeCloseTo(expected.scaleX, 6);
  expect(actual.scaleY).toBeCloseTo(expected.scaleY, 6);
  expect(actual.rotation).toBeCloseTo(expected.rotation, 6);
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
