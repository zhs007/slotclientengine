import { gsap } from "gsap";
import {
  Application,
  Assets,
  Container,
  Graphics,
  type Sprite,
  type Texture,
} from "pixi.js";
import layer00Url from "../../assets/bg/layer-00.png";
import layer01Url from "../../assets/bg/layer-01.png";
import layer02Url from "../../assets/bg/layer-02.png";
import layer03Url from "../../assets/bg/layer-03.png";
import layer04Url from "../../assets/bg/layer-04.png";
import layer05Url from "../../assets/bg/layer-05.png";
import layer06Url from "../../assets/bg/layer-06.png";
import layer07Url from "../../assets/bg/layer-07.png";
import layer08Url from "../../assets/bg/layer-08.png";
import {
  createCenteredSprite,
  toPixiBlendMode,
  type BasicBlendMode,
} from "./helpers.js";
import type { PixiAnimationInstance, PixiAnimationModule } from "./types.js";

type BgEffect =
  | "fadeIn"
  | "fadeOut"
  | "pulse"
  | "starlight"
  | "sweepLight"
  | "swing";

export interface BgLayerSpec {
  sourceIndex: number;
  id: string;
  assetUrl: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  blendMode: BasicBlendMode;
  maskId: string | null;
  effects: BgEffect[];
  visibleFrom: number;
  visibleTo: number;
}

type BuiltBgLayer = {
  spec: BgLayerSpec;
  sprite: Sprite;
  initial: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    alpha: number;
    visible: boolean;
  };
};

export const BG_SIZE = { width: 1200, height: 600 } as const;
export const BG_DURATION = 3;
export const BG_LAYER_SPECS: BgLayerSpec[] = [
  {
    sourceIndex: 0,
    id: "刷光",
    assetUrl: layer00Url,
    x: 255,
    y: 170,
    scaleX: 0.6,
    scaleY: 3,
    rotation: 0.5235987755982988,
    alpha: 1,
    blendMode: "add",
    maskId: "隐形框_copy_7",
    effects: ["sweepLight"],
    visibleFrom: 0.5,
    visibleTo: 1.5,
  },
  {
    sourceIndex: 1,
    id: "隐形框_copy_7",
    assetUrl: layer01Url,
    x: 600,
    y: 300,
    scaleX: 1.597,
    scaleY: 1.597,
    rotation: 0,
    alpha: 0,
    blendMode: "normal",
    maskId: null,
    effects: ["pulse"],
    visibleFrom: 0.5,
    visibleTo: 1.2,
  },
  {
    sourceIndex: 2,
    id: "隐形框",
    assetUrl: layer01Url,
    x: 600,
    y: 300,
    scaleX: 1.597,
    scaleY: 1.597,
    rotation: 0,
    alpha: 0,
    blendMode: "normal",
    maskId: null,
    effects: ["pulse"],
    visibleFrom: 0.5,
    visibleTo: 1.2,
  },
  {
    sourceIndex: 3,
    id: "ui框",
    assetUrl: layer02Url,
    x: 600,
    y: 300,
    scaleX: 0.4,
    scaleY: 0.4,
    rotation: 0,
    alpha: 1,
    blendMode: "normal",
    maskId: null,
    effects: ["pulse"],
    visibleFrom: 0.5,
    visibleTo: 1.2,
  },
  {
    sourceIndex: 4,
    id: "光球",
    assetUrl: layer03Url,
    x: 600,
    y: 300,
    scaleX: 1.9,
    scaleY: 1.9,
    rotation: 0,
    alpha: 1,
    blendMode: "add",
    maskId: null,
    effects: ["fadeIn", "fadeOut"],
    visibleFrom: 0.8,
    visibleTo: 2,
  },
  {
    sourceIndex: 5,
    id: "光_copy_9",
    assetUrl: layer04Url,
    x: 800,
    y: 310,
    scaleX: -0.9,
    scaleY: 0.9,
    rotation: 0,
    alpha: 1,
    blendMode: "add",
    maskId: null,
    effects: ["fadeIn", "swing", "fadeOut"],
    visibleFrom: 0.5,
    visibleTo: 1.7,
  },
  {
    sourceIndex: 6,
    id: "光",
    assetUrl: layer04Url,
    x: 400,
    y: 310,
    scaleX: 0.9,
    scaleY: 0.9,
    rotation: 0,
    alpha: 1,
    blendMode: "add",
    maskId: null,
    effects: ["fadeIn", "swing", "fadeOut"],
    visibleFrom: 0.5,
    visibleTo: 1.7,
  },
  {
    sourceIndex: 7,
    id: "底光_copy_8",
    assetUrl: layer05Url,
    x: 800,
    y: 350,
    scaleX: -0.5,
    scaleY: 0.5,
    rotation: 0,
    alpha: 1,
    blendMode: "add",
    maskId: null,
    effects: ["fadeIn", "swing", "fadeOut"],
    visibleFrom: 0.5,
    visibleTo: 1.7,
  },
  {
    sourceIndex: 8,
    id: "底光",
    assetUrl: layer05Url,
    x: 400,
    y: 350,
    scaleX: 0.5,
    scaleY: 0.5,
    rotation: 0,
    alpha: 1,
    blendMode: "add",
    maskId: null,
    effects: ["fadeIn", "swing", "fadeOut"],
    visibleFrom: 0.5,
    visibleTo: 1.7,
  },
  {
    sourceIndex: 9,
    id: "底1",
    assetUrl: layer06Url,
    x: 600,
    y: 300,
    scaleX: 0.4,
    scaleY: 0.4,
    rotation: 0,
    alpha: 1,
    blendMode: "normal",
    maskId: null,
    effects: ["fadeOut"],
    visibleFrom: 0,
    visibleTo: 1.5,
  },
  {
    sourceIndex: 10,
    id: "Layer_003_copy_4_copy_6_copy_7",
    assetUrl: layer07Url,
    x: 318,
    y: 394,
    scaleX: -1,
    scaleY: 1,
    rotation: 0,
    alpha: 1,
    blendMode: "normal",
    maskId: null,
    effects: ["starlight"],
    visibleFrom: 1.2,
    visibleTo: 3,
  },
  {
    sourceIndex: 11,
    id: "Layer_003_copy_4_copy_6",
    assetUrl: layer07Url,
    x: 882,
    y: 391,
    scaleX: -1,
    scaleY: 1,
    rotation: 0,
    alpha: 1,
    blendMode: "normal",
    maskId: null,
    effects: ["starlight"],
    visibleFrom: 1,
    visibleTo: 3,
  },
  {
    sourceIndex: 12,
    id: "Layer_003_copy_4",
    assetUrl: layer07Url,
    x: 940,
    y: 455,
    scaleX: -1,
    scaleY: 1,
    rotation: 0,
    alpha: 1,
    blendMode: "normal",
    maskId: null,
    effects: ["starlight"],
    visibleFrom: 1.1,
    visibleTo: 3,
  },
  {
    sourceIndex: 13,
    id: "Layer_003",
    assetUrl: layer07Url,
    x: 262,
    y: 465,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    alpha: 1,
    blendMode: "normal",
    maskId: null,
    effects: ["starlight"],
    visibleFrom: 1,
    visibleTo: 3,
  },
  {
    sourceIndex: 14,
    id: "底2",
    assetUrl: layer08Url,
    x: 600,
    y: 300,
    scaleX: 0.4,
    scaleY: 0.4,
    rotation: 0,
    alpha: 1,
    blendMode: "normal",
    maskId: null,
    effects: [],
    visibleFrom: 0,
    visibleTo: 3,
  },
];

export function getUniqueBgAssetCount() {
  return new Set(BG_LAYER_SPECS.map((layer) => layer.assetUrl)).size;
}

async function loadTextures() {
  const pairs = await Promise.all(
    [...new Set(BG_LAYER_SPECS.map((layer) => layer.assetUrl))].map(
      async (assetUrl) =>
        [assetUrl, await Assets.load<Texture>(assetUrl)] as const,
    ),
  );
  return new Map(pairs);
}

function createLayer(spec: BgLayerSpec, texture: Texture): BuiltBgLayer {
  const sprite = createCenteredSprite(texture);
  sprite.label = spec.id;
  sprite.position.set(spec.x, spec.y);
  sprite.scale.set(spec.scaleX, spec.scaleY);
  sprite.rotation = spec.rotation;
  sprite.alpha = spec.visibleFrom === 0 ? spec.alpha : 0;
  sprite.visible = spec.visibleFrom === 0;
  sprite.blendMode = toPixiBlendMode(spec.blendMode);

  return {
    spec,
    sprite,
    initial: {
      x: spec.x,
      y: spec.y,
      scaleX: spec.scaleX,
      scaleY: spec.scaleY,
      rotation: spec.rotation,
      alpha: spec.alpha,
      visible: spec.visibleFrom === 0,
    },
  };
}

function resetLayer(layer: BuiltBgLayer) {
  layer.sprite.position.set(layer.initial.x, layer.initial.y);
  layer.sprite.scale.set(layer.initial.scaleX, layer.initial.scaleY);
  layer.sprite.rotation = layer.initial.rotation;
  layer.sprite.alpha = layer.initial.visible ? layer.initial.alpha : 0;
  layer.sprite.visible = layer.initial.visible;
}

function showDuring(timeline: gsap.core.Timeline, layer: BuiltBgLayer) {
  timeline.set(
    layer.sprite,
    { visible: true, alpha: layer.spec.alpha },
    layer.spec.visibleFrom,
  );
  if (layer.spec.visibleTo < BG_DURATION) {
    timeline.set(layer.sprite, { visible: false }, layer.spec.visibleTo);
  }
}

function fadeIn(
  timeline: gsap.core.Timeline,
  layer: BuiltBgLayer,
  start: number,
  duration: number,
) {
  timeline.fromTo(
    layer.sprite,
    { alpha: 0, visible: true },
    { alpha: layer.spec.alpha, duration, ease: "power4.inOut" },
    start,
  );
}

function fadeOut(
  timeline: gsap.core.Timeline,
  layer: BuiltBgLayer,
  start: number,
  duration: number,
) {
  timeline.to(
    layer.sprite,
    {
      alpha: 0,
      duration,
      ease: "sine.inOut",
      onComplete: () => {
        layer.sprite.visible = false;
      },
    },
    start,
  );
}

function pulse(
  timeline: gsap.core.Timeline,
  layer: BuiltBgLayer,
  start: number,
  duration: number,
) {
  timeline.to(
    layer.sprite.scale,
    {
      x: layer.spec.scaleX * 1.01,
      y: layer.spec.scaleY * 1.01,
      duration: 0.35,
      repeat: Math.max(0, Math.floor(duration / 0.35) - 1),
      yoyo: true,
      ease: "sine.inOut",
    },
    start,
  );
}

function swing(
  timeline: gsap.core.Timeline,
  layer: BuiltBgLayer,
  start: number,
  duration: number,
) {
  timeline.to(
    layer.sprite,
    {
      rotation: layer.spec.rotation + (layer.spec.scaleX < 0 ? -0.08 : 0.08),
      duration: duration / 2,
      repeat: 1,
      yoyo: true,
      ease: "sine.inOut",
    },
    start,
  );
}

function sweepLight(timeline: gsap.core.Timeline, layer: BuiltBgLayer) {
  timeline.fromTo(
    layer.sprite,
    { x: 255, alpha: 0.5, visible: true },
    { x: 1100, alpha: 0.8, duration: 1, ease: "power2.inOut" },
    0.5,
  );
  timeline.to(
    layer.sprite,
    { alpha: 1, duration: 0.35, ease: "sine.out" },
    0.85,
  );
}

function starlight(
  timeline: gsap.core.Timeline,
  layer: BuiltBgLayer,
  start: number,
  duration: number,
) {
  timeline.fromTo(
    layer.sprite,
    { alpha: 0, visible: true },
    {
      alpha: layer.spec.alpha,
      duration: 0.18,
      repeat: Math.max(1, Math.floor(duration / 0.36)),
      yoyo: true,
      ease: "sine.inOut",
    },
    start,
  );
}

function bindMask(root: Container, layersById: Map<string, BuiltBgLayer>) {
  const light = layersById.get("刷光");
  const maskLayer = layersById.get("隐形框_copy_7");
  if (!light || !maskLayer) {
    return;
  }

  const maskShape = new Graphics()
    .rect(-240, -80, 480, 160)
    .fill({ color: 0xffffff, alpha: 1 });
  maskShape.label = "隐形框_copy_7";
  maskShape.position.set(maskLayer.spec.x, maskLayer.spec.y);
  maskShape.scale.set(maskLayer.spec.scaleX, maskLayer.spec.scaleY);
  maskShape.visible = true;
  root.addChild(maskShape);
  light.sprite.mask = maskShape;
}

function buildTimeline(layers: BuiltBgLayer[]) {
  const timeline = gsap.timeline({ paused: true });
  const byId = new Map(layers.map((layer) => [layer.spec.id, layer]));

  for (const layer of layers) {
    if (layer.spec.visibleFrom > 0 || layer.spec.visibleTo < BG_DURATION) {
      showDuring(timeline, layer);
    }
  }

  fadeOut(timeline, byId.get("底1")!, 0.5, 1);
  pulse(timeline, byId.get("隐形框_copy_7")!, 0.5, 0.7);
  pulse(timeline, byId.get("隐形框")!, 0.5, 0.7);
  pulse(timeline, byId.get("ui框")!, 0.5, 0.7);
  sweepLight(timeline, byId.get("刷光")!);
  fadeIn(timeline, byId.get("光球")!, 0.8, 1);
  fadeOut(timeline, byId.get("光球")!, 1, 1);

  for (const id of ["光_copy_9", "光", "底光_copy_8", "底光"]) {
    const layer = byId.get(id)!;
    fadeIn(timeline, layer, 0.5, 0.7);
    swing(timeline, layer, 0.5, 1);
    fadeOut(timeline, layer, 1, 0.7);
  }

  starlight(timeline, byId.get("Layer_003_copy_4_copy_6_copy_7")!, 1.2, 2);
  starlight(timeline, byId.get("Layer_003_copy_4_copy_6")!, 1, 2);
  starlight(timeline, byId.get("Layer_003_copy_4")!, 1.1, 2);
  starlight(timeline, byId.get("Layer_003")!, 1, 2);
  timeline.set({}, {}, BG_DURATION);
  return timeline;
}

export const bgAnimation: PixiAnimationModule = {
  id: "bg",
  label: "bg",
  duration: BG_DURATION,
  async create(_app: Application): Promise<PixiAnimationInstance> {
    const textures = await loadTextures();
    const root = new Container();
    root.label = "bg-root";
    const layers = BG_LAYER_SPECS.map((spec) => {
      const texture = textures.get(spec.assetUrl);
      if (!texture) {
        throw new Error(`Missing texture for ${spec.id}.`);
      }
      return createLayer(spec, texture);
    });

    for (const layer of [...layers].reverse()) {
      root.addChild(layer.sprite);
    }
    bindMask(root, new Map(layers.map((layer) => [layer.spec.id, layer])));

    let loop = true;
    const timeline = buildTimeline(layers);
    timeline.eventCallback("onComplete", () => {
      if (loop) {
        for (const layer of layers) {
          resetLayer(layer);
        }
        timeline.restart();
      }
    });

    const reset = () => {
      timeline.pause(0);
      for (const layer of layers) {
        resetLayer(layer);
      }
    };

    reset();
    timeline.play(0);

    return {
      root,
      play: () => timeline.play(),
      pause: () => timeline.pause(),
      replay: () => {
        reset();
        timeline.play(0);
      },
      setLoop: (nextLoop) => {
        loop = nextLoop;
      },
      destroy: () => {
        timeline.kill();
        root.destroy({ children: true, texture: false });
      },
    };
  },
};

export default bgAnimation;
