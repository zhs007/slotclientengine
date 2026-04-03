import type { VictoryLayerConfigRaw, VictoryProjectConfigRaw } from "../config/victory-types.js";
import { parseSpineColor } from "./color.js";
import type { EncodedTimelineAnimation, EncodedTimelineFrame } from "./export-types.js";
import { composeAttachmentTransform, computeWorldBoneTransforms, sampleAnimationPose } from "./timeline-sampler.js";
import { createSceneMatrix, deriveWorldTransform } from "./transform.js";
import type { SpineModel } from "./spine-types.js";

export const EXPORT_VERSION = "0.1.0";
export const EXPORT_STAGE = {
  width: 1280,
  height: 900,
  anchorX: 1280 * 0.52,
  anchorY: 900 * 0.84
};

export const MIRROR_LAYER_PAIRS = [
  ["ui14__ui6", "ui20__ui6"],
  ["ui16__ui6", "ui25__ui6"],
  ["ui3__ui3", "ui15__ui3"]
] as const;

export interface ExportBuildOptions {
  fps?: number;
  assetPaths: Record<string, string>;
  stageWidth?: number;
  stageHeight?: number;
  stageAnchorX?: number;
  stageAnchorY?: number;
}

type SlotAttachmentLayer = {
  id: string;
  slotName: string;
  attachmentName: string;
  textureName: string;
  blendMode: string;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function createLayerId(slotName: string, attachmentName: string) {
  return `${slotName}__${attachmentName}`;
}

function encodeTimeline(frames: EncodedTimelineFrame[], fps: number): string {
  const payload: EncodedTimelineAnimation = {
    kind: "timeline",
    fps,
    frames
  };
  return JSON.stringify(payload);
}

function createHiddenFrame(): EncodedTimelineFrame {
  return [0, 0, 1, 1, 0, 0, 0];
}

function createProjectLayer(layer: SlotAttachmentLayer, assetPath: string, duration: number, fps: number, frames: EncodedTimelineFrame[]): VictoryLayerConfigRaw {
  const initial = frames.find((frame) => frame[6] === 1) ?? frames[0] ?? createHiddenFrame();

  return {
    id: layer.id,
    type: "pic",
    asset: assetPath,
    x: initial[0],
    y: initial[1],
    scaleX: initial[2],
    scaleY: initial[3],
    rotation: initial[4],
    alpha: initial[5],
    blendMode: layer.blendMode,
    visible: initial[6] === 1,
    locked: true,
    animations: [
      {
        type: "timeline",
        startTime: 0,
        duration,
        script: encodeTimeline(frames, fps),
        params: {
          source: "spine-export"
        }
      }
    ]
  };
}

export function collectSlotAttachmentLayers(model: SpineModel) {
  const layers: SlotAttachmentLayer[] = [];

  for (const slot of model.slots) {
    const attachments = model.attachments[slot.name] ?? {};
    for (const attachmentName of Object.keys(attachments)) {
      const attachment = attachments[attachmentName];
      layers.push({
        id: createLayerId(slot.name, attachmentName),
        slotName: slot.name,
        attachmentName,
        textureName: attachment.textureName,
        blendMode: slot.blendMode === "additive" ? "add" : "normal"
      });
    }
  }

  return layers;
}

export function getStageScale(model: SpineModel, stageWidth = EXPORT_STAGE.width, stageHeight = EXPORT_STAGE.height) {
  return Math.min((stageWidth * 0.72) / model.skeleton.width, (stageHeight * 0.82) / model.skeleton.height);
}

export function buildVictoryProject(
  model: SpineModel,
  animationName: string,
  options: ExportBuildOptions
): VictoryProjectConfigRaw {
  const animation = model.animations[animationName];
  if (!animation) {
    throw new Error(`Unknown animation: ${animationName}`);
  }

  const fps = options.fps ?? model.skeleton.fps ?? 24;
  const stageWidth = options.stageWidth ?? EXPORT_STAGE.width;
  const stageHeight = options.stageHeight ?? EXPORT_STAGE.height;
  const stageAnchorX = options.stageAnchorX ?? EXPORT_STAGE.anchorX;
  const stageAnchorY = options.stageAnchorY ?? EXPORT_STAGE.anchorY;
  const stageScale = getStageScale(model, stageWidth, stageHeight);
  const layers = collectSlotAttachmentLayers(model);
  const frameCount = Math.max(1, Math.ceil(animation.duration * fps));
  const layerFrames = new Map<string, EncodedTimelineFrame[]>(layers.map((layer) => [layer.id, []]));

  for (let frameIndex = 0; frameIndex <= frameCount; frameIndex += 1) {
    const time = Math.min(animation.duration, frameIndex / fps);
    const pose = sampleAnimationPose(model, animationName, time, false);
    const worldBones = computeWorldBoneTransforms(model, pose.bones);

    for (const layer of layers) {
      const slotPose = pose.slots[layer.slotName];
      if (!slotPose || !slotPose.attachment || slotPose.attachmentName !== layer.attachmentName) {
        layerFrames.get(layer.id)!.push(createHiddenFrame());
        continue;
      }

      const attachmentWorld = composeAttachmentTransform(worldBones[slotPose.boneName], slotPose.attachment);
      const scene = deriveWorldTransform(createSceneMatrix(attachmentWorld.matrix));
      const color = parseSpineColor(slotPose.color);

      layerFrames.get(layer.id)!.push([
        round(stageAnchorX + scene.x * stageScale),
        round(stageAnchorY + scene.y * stageScale),
        round(scene.scaleX * stageScale),
        round(scene.scaleY * stageScale),
        round((scene.rotation * Math.PI) / 180),
        round(clamp01(color.alpha)),
        1
      ]);
    }
  }

  return {
    version: EXPORT_VERSION,
    name: `cabin:${animationName}`,
    duration: animation.duration,
    layers: layers.map((layer) => {
      const assetPath = options.assetPaths[layer.textureName];
      if (!assetPath) {
        throw new Error(`Missing exported asset for texture: ${layer.textureName}`);
      }
      return createProjectLayer(layer, assetPath, animation.duration, fps, layerFrames.get(layer.id) ?? [createHiddenFrame()]);
    })
  };
}

export function createMirrorCheckPairs() {
  return MIRROR_LAYER_PAIRS.map(([leftLayerId, rightLayerId]) => ({
    leftLayerId,
    rightLayerId
  }));
}