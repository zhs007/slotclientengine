import { describe, expect, it } from "vitest";
import { Node, SpriteFrame } from "cc";
import export10xData from "../fixtures/10x.json";
import export2xData from "../fixtures/2x.json";
import export5xData from "../fixtures/5x.json";
import bigwinData from "../fixtures/bigwin.json";
import export2Runtime50Data from "../fixtures/export2-runtime-50.json";
import megawinData from "../fixtures/megawin.json";
import multipayData from "../fixtures/multipay.json";
import projectData from "../fixtures/project.json";
import respinData from "../fixtures/respin.json";
import scatter1Data from "../fixtures/scatter1.json";
import scatter2Data from "../fixtures/scatter2.json";
import superwinData from "../fixtures/superwin.json";
import { V5GCocosPlayer } from "../../src/cocos/player";
import {
  getCocosBlendModeConfig,
  type CocosBlendModeConfig,
} from "../../src/cocos/blend-mode";
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
import * as standalone from "../../standalone/anieditorv5runtime-cc";
import type { SampledProjectState } from "../../src/core/project-sampler";
import type {
  V5GAnimationConfig,
  V5GAssetConfig,
  V5GLayerConfig,
  V5GProjectConfig,
} from "../../src/core/types";

const fixtures = [
  ["project", projectData],
  ["bigwin", bigwinData],
  ["megawin", megawinData],
  ["superwin", superwinData],
  ["export2-runtime-50", export2Runtime50Data],
  ["2x", export2xData],
  ["5x", export5xData],
  ["10x", export10xData],
  ["respin", respinData],
  ["scatter1", scatter1Data],
  ["scatter2", scatter2Data],
  ["multipay", multipayData],
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

  it("matches modular runtime Cocos blend-mode acceptance", () => {
    const project = assertV5GProject(bigwinData);
    expect(() => validateCocosV5GProject(project)).not.toThrow();
    expect(() => standalone.validateCocosV5GProject(project)).not.toThrow();
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
    const project = assertV5GProject(export2Runtime50Data);
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
});

function comparableSample(sample: SampledProjectState): SampledProjectState {
  return {
    time: sample.time,
    layers: sample.layers.map((layer) => ({
      layerId: layer.layerId,
      transform: layer.transform,
      opacity: layer.opacity,
      baseOpacity: layer.baseOpacity,
      visible: layer.visible,
      renderImageDisplay: layer.renderImageDisplay,
      hasActiveParticleAnimation: layer.hasActiveParticleAnimation,
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
    }
  }

  setContentSize(): void {}

  setAnchorPoint(): void {}

  setPosition(): void {}

  setScale(): void {}

  setRotationDegrees(): void {}

  setOpacity(): void {}

  setActive(): void {}

  createBackgroundNode(name: string): FakeNode {
    return new FakeNode(name);
  }

  createImageNode(name: string): FakeNode {
    return new FakeNode(name);
  }

  getSpriteFrameSize(spriteFrame: FakeSpriteFrame): V5GSize | null {
    return { width: spriteFrame.width, height: spriteFrame.height };
  }

  applyBlendMode(_node: FakeNode, _config: CocosBlendModeConfig): void {}
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
