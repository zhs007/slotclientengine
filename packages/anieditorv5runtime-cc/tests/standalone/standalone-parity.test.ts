import { describe, expect, it } from "vitest";
import { Node, SpriteFrame } from "cc";
import threeReelMultipay01Data from "../fixtures/3reel_multipay_01.json";
import threeReelMultipay02Data from "../fixtures/3reel_multipay_02.json";
import export10xData from "../fixtures/10x.json";
import twoXData from "../fixtures/2x.json";
import export5xData from "../fixtures/5x.json";
import bigwinData from "../fixtures/bigwin.json";
import lock01Data from "../fixtures/lock_01.json";
import megawinData from "../fixtures/megawin.json";
import multipayData from "../fixtures/multipay.json";
import projectData from "../fixtures/project.json";
import respinData from "../fixtures/respin.json";
import roundreelData from "../fixtures/roundreel.json";
import scatter1Data from "../fixtures/scatter1.json";
import scatter2Data from "../fixtures/scatter2.json";
import superwinData from "../fixtures/superwin.json";
import { V5GCocosPlayer } from "../../src/cocos/player";
import {
  getCocosBlendModeConfig,
  type CocosBlendModeConfig,
} from "../../src/cocos/blend-mode";
import {
  assertVNIAdjacentLayerGroupSlot,
  getVNIProjectLayerGroupSlots,
  getVNIProjectRenderGroupOrder,
  normalizeVNIProjectLayerGroups,
  DEFAULT_VNI_LAYER_GROUP_ID,
} from "../../src/core/layer-groups";
import {
  opacityToCocosOpacity,
  v5gTransformToCocosPosition,
} from "../../src/cocos/coordinates";
import type { V5GCocosNodeDriver, V5GSize } from "../../src/cocos/node-driver";
import { validateCocosV5GProject } from "../../src/core/validation";
import {
  assertV5GProject,
  parseColorHex,
  validateV5GProject,
} from "../../src/core/validation";
import { sampleProjectAtTime } from "../../src/core/project-sampler";
import { getSequenceFrameAssetId } from "../../src/core/sequence-layer";
import { sampleSafeGlowSpritesForLayer } from "../../src/core/safe-glow-sampler";
import { sampleChaserLightSpritesForLayer } from "../../src/core/chaser-light-sampler";
import {
  createVNICyclicMotionSnapshot,
  createVNICyclicResolvePlan,
  getVNICyclicCarrierAlignmentErrorTurns,
  sampleVNICyclicResolveStopTurns,
} from "../../src/core/cyclic-selection";
import * as standalone from "../../standalone/anieditorv5runtime-cc";
import type { SampledProjectState } from "../../src/core/project-sampler";
import type {
  V5GAnimationConfig,
  V5GAssetConfig,
  V5GLayerConfig,
  V5GProjectConfig,
  V5GTransformConfig,
} from "../../src/core/types";

const fixtures = [
  ["project", projectData],
  ["bigwin", bigwinData],
  ["megawin", megawinData],
  ["superwin", superwinData],
  ["2x", twoXData],
  ["5x", export5xData],
  ["10x", export10xData],
  ["respin", respinData],
  ["scatter1", scatter1Data],
  ["scatter2", scatter2Data],
  ["multipay", multipayData],
  ["3reel_multipay_01", threeReelMultipay01Data],
  ["3reel_multipay_02", threeReelMultipay02Data],
  ["lock_01", lock01Data],
  ["roundreel", roundreelData],
] as const;

const sampleTimes = [0, 0.1, 0.6, 0.8, 1, 2, 4, 4.4];

describe("standalone runtime parity", () => {
  it("matches modular runtime validation and project sampling", () => {
    for (const [name, fixture] of fixtures) {
      const modularProject = assertV5GProject(fixture);
      const standaloneProject = standalone.assertV5GProject(fixture);
      expect(standaloneProject).toEqual(modularProject);
      expect(() => validateV5GProject(modularProject)).not.toThrow();
      expect(() =>
        standalone.validateV5GProject(standaloneProject),
      ).not.toThrow();

      const times = [
        ...sampleTimes,
        modularProject.stage.duration,
        modularProject.stage.duration + 1,
      ];
      for (const time of times) {
        expect(
          comparableSample(
            standalone.sampleProjectAtTime(standaloneProject, time),
          ),
          `${name} at ${time}`,
        ).toEqual(comparableSample(sampleProjectAtTime(modularProject, time)));
      }
    }
  });

  it("matches modular runtime utility behavior", () => {
    expect(standalone.parseColorHex("#101827")).toBe(parseColorHex("#101827"));
    expect(standalone.opacityToCocosOpacity(0.333)).toBe(
      opacityToCocosOpacity(0.333),
    );
    expect(
      standalone.v5gTransformToCocosPosition({
        x: -12,
        y: 34,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
    ).toEqual(
      v5gTransformToCocosPosition({
        x: -12,
        y: 34,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
    );
  });

  it("matches modular cyclic-selection golden behavior", () => {
    for (const direction of [1, -1] as const) {
      for (let target = 0; target < 13; target += 1) {
        const options = {
          snapshot: createVNICyclicMotionSnapshot({
            unwrappedTurns: direction * 4.5321,
            velocityTurnsPerSecond: direction * 0.1,
            carrierCount: 13,
          }),
          selectedCarrierIndex: target,
          direction,
          rounds: 2,
          fastRelativeTurns: direction * 3.4,
          stopOvershoot: 0.18,
        };
        const modularPlan = createVNICyclicResolvePlan(options);
        const singlePlan = standalone.createVNICyclicResolvePlan({
          ...options,
          snapshot: standalone.createVNICyclicMotionSnapshot({
            unwrappedTurns: direction * 4.5321,
            velocityTurnsPerSecond: direction * 0.1,
            carrierCount: 13,
          }),
        });
        expect(singlePlan).toEqual(modularPlan);
        expect(
          standalone.sampleVNICyclicResolveStopTurns(singlePlan, 0.4),
        ).toBe(sampleVNICyclicResolveStopTurns(modularPlan, 0.4));
        expect(
          standalone.getVNICyclicCarrierAlignmentErrorTurns(
            singlePlan.finalTurns,
            target,
            13,
          ),
        ).toBe(
          getVNICyclicCarrierAlignmentErrorTurns(
            modularPlan.finalTurns,
            target,
            13,
          ),
        );
      }
    }
  });

  it("matches VNI_0.095 sequence, basic track, and multi_move sampling", () => {
    const project = assertV5GProject(projectData);
    project.schemaVersion = "VNI_0.095";
    project.editor.version = "VNI_0.095";
    project.stage.duration = 1;
    const layer = project.layers[0];
    layer.type = "sequence";
    layer.assetId = null;
    layer.sequence = {
      frameAssetIds: [project.assets[0].id, project.assets[1].id],
      cycleDuration: 1,
      loop: true,
    };
    layer.basicAnimation = {
      opacity: { enabled: false, points: [] },
      positionX: {
        enabled: true,
        points: [
          { id: "x0", time: 0, value: 0, easing: "linear" },
          { id: "x1", time: 1, value: 50, easing: "linear" },
        ],
      },
      positionY: { enabled: false, points: [] },
      scaleX: { enabled: false, points: [] },
      scaleY: { enabled: false, points: [] },
      rotation: { enabled: false, points: [] },
    };
    layer.animations = [
      {
        id: "multi",
        type: "multi_move",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 4,
        params: {
          pointsJson: JSON.stringify([
            { x: 0, y: 0, time: 0, easing: "linear" },
            { x: 100, y: -20, time: 1, easing: "easeOutQuad" },
          ]),
        },
      },
    ];

    expect(standalone.getSequenceFrameAssetId(layer, 0.75)).toBe(
      getSequenceFrameAssetId(layer, 0.75),
    );
    for (const time of [0, 0.25, 0.5, 1]) {
      expect(
        comparableSample(standalone.sampleProjectAtTime(project, time)),
      ).toEqual(comparableSample(sampleProjectAtTime(project, time)));
    }
  });

  it("matches modular layer group helper behavior", () => {
    const project = assertV5GProject(threeReelMultipay02Data);
    const singleProject = standalone.assertV5GProject(threeReelMultipay02Data);
    expect(standalone.DEFAULT_VNI_LAYER_GROUP_ID).toBe(
      DEFAULT_VNI_LAYER_GROUP_ID,
    );
    expect(standalone.normalizeVNIProjectLayerGroups(project)).toEqual(
      normalizeVNIProjectLayerGroups(project),
    );
    expect(standalone.getVNIProjectRenderGroupOrder(singleProject)).toEqual(
      getVNIProjectRenderGroupOrder(project),
    );
    expect(standalone.getVNIProjectLayerGroupSlots(singleProject)).toEqual(
      getVNIProjectLayerGroupSlots(project),
    );
    expect(
      standalone.assertVNIAdjacentLayerGroupSlot(
        singleProject,
        "layer_group_mqqo4zrn_6",
        "group_default",
      ),
    ).toEqual(
      assertVNIAdjacentLayerGroupSlot(
        project,
        "layer_group_mqqo4zrn_6",
        "group_default",
      ),
    );
  });

  it("matches modular runtime Cocos blend-mode acceptance", () => {
    const project = assertV5GProject(bigwinData);
    expect(() => validateCocosV5GProject(project)).not.toThrow();
    expect(() => standalone.validateCocosV5GProject(project)).not.toThrow();
  });

  it("matches modular safe_glow sampler output", () => {
    const cases = [
      { fixture: lock01Data, time: 0.5, expectedBlendMode: "normal" },
      { fixture: roundreelData, time: 1.175, expectedBlendMode: "add" },
    ] as const;

    for (const item of cases) {
      const project = assertV5GProject(item.fixture);
      const singleProject = standalone.assertV5GProject(item.fixture);
      const layer = project.layers.find((candidate) =>
        candidate.animations.some(
          (animation) => animation.type === "safe_glow",
        ),
      );
      const singleLayer = singleProject.layers.find(
        (candidate) => candidate.id === layer?.id,
      );
      if (!layer || !singleLayer) throw new Error("missing safe_glow layer");
      const sampled = sampleProjectAtTime(project, item.time).layers.find(
        (candidate) => candidate.layerId === layer.id,
      );
      const singleSampled = standalone
        .sampleProjectAtTime(singleProject, item.time)
        .layers.find((candidate) => candidate.layerId === layer.id);
      if (!sampled || !singleSampled) throw new Error("missing sampled layer");

      const singleSprites = standalone.sampleSafeGlowSpritesForLayer(
        singleLayer,
        singleSampled,
        item.time,
      );
      expect(singleSprites).toEqual(
        sampleSafeGlowSpritesForLayer(layer, sampled, item.time),
      );
      expect(singleSprites[0]?.blendMode).toBe(item.expectedBlendMode);
    }
  });

  it("matches modular chaser_light sampler output", () => {
    const transform: V5GTransformConfig = {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    };
    const animation: V5GAnimationConfig = {
      id: "chaser",
      type: "chaser_light",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 1,
      params: {
        totalCount: 4,
        spacing: 80,
        lightDuration: 0.08,
        interval: 0.04,
        trajectory: 0,
        radius: 120,
        centerX: 0,
        centerY: 0,
        endX: 240,
        endY: 0,
        curve: 120,
        lightSize: 40,
        dimAlpha: 0.12,
        keepOriginal: true,
      },
    };
    const layer: V5GLayerConfig = {
      id: "layer",
      name: "Layer",
      type: "image",
      assetId: "asset",
      parentId: null,
      groupId: "group_default",
      visible: true,
      locked: false,
      transform,
      opacity: 1,
      blendMode: "normal",
      animations: [animation],
      keyframes: [],
    };
    const sampledLayer = {
      layerId: layer.id,
      transform,
      baseOpacity: 1,
      blendMode: layer.blendMode,
    } as const;
    const textureSize = { width: 100, height: 100 };

    for (const time of [0, 0.04, 0.12, 0.64]) {
      expect(
        standalone.sampleChaserLightSpritesForLayer(
          layer,
          sampledLayer,
          textureSize,
          time,
        ),
      ).toEqual(
        sampleChaserLightSpritesForLayer(
          layer,
          sampledLayer,
          textureSize,
          time,
        ),
      );
    }
  });

  it("matches modular Cocos render effect fail-fast", () => {
    const project = assertV5GProject(threeReelMultipay01Data);
    const singleProject = standalone.assertV5GProject(threeReelMultipay01Data);
    expect(() => validateV5GProject(project)).not.toThrow();
    expect(() => standalone.validateV5GProject(singleProject)).not.toThrow();
    expect(() => validateCocosV5GProject(project)).toThrow(
      "Cocos runtime does not support VNI render effect animations yet",
    );
    expect(() => standalone.validateCocosV5GProject(singleProject)).toThrow(
      "Cocos runtime does not support VNI render effect animations yet",
    );
  });

  it("matches modular runtime Cocos blend-mode configs", () => {
    const blendModes = [
      "normal",
      "add",
      "screen",
      "multiply",
      "lighten",
    ] as const;
    for (const blendMode of blendModes) {
      expect(standalone.getCocosBlendModeConfig(blendMode)).toEqual(
        getCocosBlendModeConfig(blendMode),
      );
    }
  });

  it("matches modular runtime compressed metadata rejection", () => {
    const project = assertV5GProject(bigwinData);
    project.assets[0].fileScale = 0.25;
    project.assets[0].fileWidth = 183;
    project.assets[0].fileHeight = 184;

    expect(() => validateV5GProject(project)).toThrow(
      "does not match exportProfile.assetScale",
    );
    expect(() => standalone.validateV5GProject(project)).toThrow(
      "does not match exportProfile.assetScale",
    );
  });

  it("matches modular player range playback marker and complete state", () => {
    const project = tinyProject();
    const modular = makeModularPlayer(project);
    const single = makeStandalonePlayer(project);
    const modularEvents: string[] = [];
    const standaloneEvents: string[] = [];
    modular.init();
    single.init();

    modular.addPlaybackEvent({
      id: "marker",
      at: { unit: "time", at: 0.4 },
      listener: (event) =>
        modularEvents.push(`${event.id}:${event.currentTime}`),
    });
    single.addPlaybackEvent({
      id: "marker",
      at: { unit: "time", at: 0.4 },
      listener: (event) =>
        standaloneEvents.push(`${event.id}:${event.currentTime}`),
    });
    modular.onPlaybackComplete((event) =>
      modularEvents.push(`complete:${event.currentTime}`),
    );
    single.onPlaybackComplete((event) =>
      standaloneEvents.push(`complete:${event.currentTime}`),
    );

    modular.playRange({
      range: { unit: "time", start: 0.2, end: 0.6 },
      loop: false,
    });
    single.playRange({
      range: { unit: "time", start: 0.2, end: 0.6 },
      loop: false,
    });
    modular.update(0.4);
    single.update(0.4);

    expect({
      time: single.time,
      playing: single.playing,
      events: standaloneEvents,
    }).toEqual({
      time: modular.time,
      playing: modular.playing,
      events: modularEvents,
    });
  });

  it("matches modular player atlas binding, missing errors, and stage roots", () => {
    const project = tinyProject();
    const modularRoot = new FakeNode("Root");
    const modularFrame = {
      id: "asset-1",
      width: 100,
      height: 50,
    };
    const modularFrames = new Map([["a", modularFrame]]);
    const modularQueries: string[] = [];
    const modular = new V5GCocosPlayer({
      root: modularRoot,
      project,
      assets: {
        atlas: {
          getSpriteFrame(name) {
            modularQueries.push(name);
            return modularFrames.get(name) ?? null;
          },
        },
      },
      driver: new FakeDriver(),
    });

    const standaloneRoot = new Node("Root");
    const standaloneFrame = makeSpriteFrame(100, 50);
    const standaloneFrames = new Map([["a", standaloneFrame]]);
    const standaloneQueries: string[] = [];
    const single = standalone.createV5GCocosPlayer({
      root: standaloneRoot,
      project,
      assets: {
        atlas: {
          getSpriteFrame(name) {
            standaloneQueries.push(name);
            return standaloneFrames.get(name) ?? null;
          },
        },
      },
    });

    modular.init();
    single.init();

    expect(standaloneQueries).toEqual(modularQueries);
    expect(standaloneQueries).toEqual(["a"]);
    expect(
      standaloneRoot.children[0].children.map((node) => node.name),
    ).toEqual(modularRoot.children[0].children.map((node) => node.name));
    expect(
      standaloneRoot.children[0].children.map((node) => node.name),
    ).toEqual(["V5G Content", "V5G Particles"]);

    const missingModular = new V5GCocosPlayer({
      root: new FakeNode("Root"),
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
    const missingStandalone = standalone.createV5GCocosPlayer({
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

    const expectedError =
      'Missing Cocos SpriteFrame for V5G asset "asset-1" at "assets/a.png" using atlas key "a".';
    expect(() => missingModular.init()).toThrow(expectedError);
    expect(() => missingStandalone.init()).toThrow(expectedError);
  });

  it("matches modular segmented playback state and particle drain", () => {
    const project = tinyProject({
      animations: [particleWallAnimation({ duration: 1 })],
    });
    project.stage.duration = 2;
    const modular = makeModularPlayer(project);
    const single = makeStandalonePlayer(project);
    const modularEvents: unknown[] = [];
    const standaloneEvents: unknown[] = [];
    modular.init();
    single.init();
    modular.setLoop(false);
    single.setLoop(false);
    modular.onPlaybackComplete((event) => modularEvents.push(event));
    single.onPlaybackComplete((event) => standaloneEvents.push(event));

    const playOptions = {
      mode: "segmented" as const,
      loopStart: { unit: "time" as const, at: 0.5 },
      loopEnd: { unit: "time" as const, at: 0.5 },
    };
    modular.play(playOptions);
    single.play(playOptions);
    modular.update(0.6);
    single.update(0.6);

    expect(comparablePlaybackState(single.getPlaybackState())).toEqual(
      comparablePlaybackState(modular.getPlaybackState()),
    );

    modular.requestSegmentedPlaybackEnd();
    single.requestSegmentedPlaybackEnd();
    modular.update(2);
    single.update(2);

    expect(comparablePlaybackState(single.getPlaybackState())).toEqual(
      comparablePlaybackState(modular.getPlaybackState()),
    );
    expect(standaloneEvents).toEqual(modularEvents);

    modular.play();
    single.play();
    modular.update(1);
    single.update(1);

    expect(comparablePlaybackState(single.getPlaybackState())).toEqual(
      comparablePlaybackState(modular.getPlaybackState()),
    );
    expect(standaloneEvents).toEqual(modularEvents);
  });

  it("matches modular force-stop particle controls", () => {
    const project = tinyProject({
      animations: [particleWallAnimation({ duration: 2 })],
    });
    project.stage.duration = 2;
    const modular = makeModularPlayer(project);
    const single = makeStandalonePlayer(project);
    const modularEvents: unknown[] = [];
    const standaloneEvents: unknown[] = [];
    modular.init();
    single.init();
    modular.onPlaybackComplete((event) => modularEvents.push(event));
    single.onPlaybackComplete((event) => standaloneEvents.push(event));

    const playOptions = {
      mode: "segmented" as const,
      loopStart: { unit: "time" as const, at: 0.5 },
      loopEnd: { unit: "time" as const, at: 0.5 },
    };
    modular.play(playOptions);
    single.play(playOptions);
    modular.update(0.6);
    single.update(0.6);
    modular.forceStopAllParticles();
    single.forceStopAllParticles();

    expect(single.getRuntimeDiagnostics().particleSpriteCount).toBe(0);
    expect(single.getRuntimeDiagnostics().liveParticleCount).toBe(0);
    expect(comparablePlaybackState(single.getPlaybackState())).toEqual(
      comparablePlaybackState(modular.getPlaybackState()),
    );
    single.update(0.2);
    modular.update(0.2);
    expect(comparablePlaybackState(single.getPlaybackState())).toEqual(
      comparablePlaybackState(modular.getPlaybackState()),
    );

    modular.play(playOptions);
    single.play(playOptions);
    modular.update(0.6);
    single.update(0.6);
    modular.requestSegmentedPlaybackEnd({ forceStopParticles: true });
    single.requestSegmentedPlaybackEnd({ forceStopParticles: true });
    modular.update(0.25);
    single.update(0.25);
    expect(comparablePlaybackState(single.getPlaybackState())).toEqual(
      comparablePlaybackState(modular.getPlaybackState()),
    );
    modular.update(2);
    single.update(2);

    expect(comparablePlaybackState(single.getPlaybackState())).toEqual(
      comparablePlaybackState(modular.getPlaybackState()),
    );
    expect(single.getRuntimeDiagnostics().particleSpriteCount).toBe(0);
    expect(single.getRuntimeDiagnostics().liveParticleCount).toBe(0);
    expect(standaloneEvents).toEqual(modularEvents);
  });
});

function comparableSample(sample: SampledProjectState): SampledProjectState {
  return {
    time: sample.time,
    layers: sample.layers.map((layer) => ({
      layerId: layer.layerId,
      transform: layer.transform,
      visualRotation: layer.visualRotation,
      opacity: layer.opacity,
      baseOpacity: layer.baseOpacity,
      visible: layer.visible,
      renderImageDisplay: layer.renderImageDisplay,
      hasActiveParticleAnimation: layer.hasActiveParticleAnimation,
      hasActiveChaserLightAnimation: layer.hasActiveChaserLightAnimation,
      hasActiveRenderEffect: layer.hasActiveRenderEffect,
      hasActiveDeterministicEffect: layer.hasActiveDeterministicEffect,
      hasActiveSafeGlowAnimation: layer.hasActiveSafeGlowAnimation,
      hasActiveCardCarousel3D: layer.hasActiveCardCarousel3D,
      blendMode: layer.blendMode,
    })),
  };
}

function comparablePlaybackState(
  state: ComparablePlaybackStateInput,
): ComparablePlaybackStateInput {
  return {
    mode: state.mode,
    phase: state.phase,
    currentTime: state.currentTime,
    isPlaying: state.isPlaying,
    isDrainingParticles: state.isDrainingParticles,
    liveParticleCount: state.liveParticleCount,
    loopIndex: state.loopIndex,
    keepParticlesAlive: state.keepParticlesAlive,
  };
}

interface ComparablePlaybackStateInput {
  mode: string;
  phase: string;
  currentTime: number;
  isPlaying: boolean;
  isDrainingParticles: boolean;
  liveParticleCount: number;
  loopIndex: number;
  keepParticlesAlive: boolean;
}

interface FakeSpriteFrame {
  id: string;
  width: number;
  height: number;
}

class FakeNode {
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  destroyed = false;
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  rotation = 0;
  text = "";

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

  setContentSize(): void {}

  setAnchorPoint(): void {}

  setPosition(): void {}

  setScale(): void {}

  setRotationDegrees(): void {}

  setOpacity(): void {}

  setActive(): void {}

  createImageNode(name: string): FakeNode {
    return new FakeNode(name);
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
    return { width: spriteFrame.width, height: spriteFrame.height };
  }

  applyBlendMode(_node: FakeNode, _config: CocosBlendModeConfig): void {}
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

function makeModularPlayer(
  project: V5GProjectConfig,
): V5GCocosPlayer<FakeNode, FakeSpriteFrame> {
  const frames = new Map(
    project.assets.map((asset) => [
      asset.id,
      {
        id: asset.id,
        width: asset.fileWidth ?? asset.width,
        height: asset.fileHeight ?? asset.height,
      },
    ]),
  );
  return new V5GCocosPlayer({
    root: new FakeNode("Root"),
    project,
    assets: {
      getSpriteFrame(_assetPath, assetId) {
        return frames.get(assetId) ?? null;
      },
    },
    driver: new FakeDriver(),
  });
}

interface InspectableSpriteFrame extends SpriteFrame {
  width?: number;
  height?: number;
  originalSize?: { width: number; height: number };
}

function makeStandalonePlayer(
  project: V5GProjectConfig,
): standalone.V5GCocosPlayer {
  const frames = new Map(
    project.assets.map((asset) => [
      asset.id,
      makeSpriteFrame(
        asset.fileWidth ?? asset.width,
        asset.fileHeight ?? asset.height,
      ),
    ]),
  );
  return standalone.createV5GCocosPlayer({
    root: new Node("Root"),
    project,
    assets: {
      getSpriteFrame(_assetPath, assetId) {
        return frames.get(assetId) ?? null;
      },
    },
  });
}

function makeSpriteFrame(width: number, height: number): SpriteFrame {
  const frame = new SpriteFrame() as InspectableSpriteFrame;
  frame.width = width;
  frame.height = height;
  frame.originalSize = { width, height };
  return frame;
}
