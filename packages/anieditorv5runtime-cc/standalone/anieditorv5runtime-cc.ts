import {
  Color,
  Node,
  Quat,
  Sprite,
  SpriteFrame,
  UITransform,
  UIOpacity,
  Vec3,
} from "cc";

export type V5GCoordinateMode = "center";
export type V5GLayerType = "image" | "text" | "group";
export type V5GAssetType = "image";
export type V5GBlendMode = "normal" | "add" | "screen" | "multiply" | "lighten";

export interface V5GStageConfig {
  width: number;
  height: number;
  coordinate: V5GCoordinateMode;
  duration: number;
  backgroundColor: string;
}

export interface V5GAssetConfig {
  id: string;
  type: V5GAssetType;
  path: string;
  originalName: string;
  width: number;
  height: number;
  fileWidth?: number;
  fileHeight?: number;
  fileScale?: number;
}

export interface V5GExportProfileConfig {
  id: string;
  purpose: "editing" | "runtime";
  assetScale: number;
  label?: string;
}

export interface V5GTransformConfig {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

export type V5GAnimationType =
  | "idle"
  | "move"
  | "fade"
  | "scale_up"
  | "scale_down"
  | "scale_in"
  | "scale_out"
  | "pop"
  | "shake"
  | "blink"
  | "rotate"
  | "slide_in"
  | "slide_out"
  | "bounce_in"
  | "pulse"
  | "float"
  | "swing"
  | "particles"
  | "particle_twinkle"
  | "particle_wall"
  | "particle_combo"
  | "shatter"
  | "glow"
  | "squash_stretch";

export type V5GAnimationParamValue = string | number | boolean;

export interface V5GAnimationConfig {
  id: string;
  type: V5GAnimationType;
  name?: string;
  startTime: number;
  duration: number;
  enabled: boolean;
  seed: number;
  params: Record<string, V5GAnimationParamValue>;
}

export interface V5GLayerKeyframeConfig {
  id: string;
  time: number;
  transform: V5GTransformConfig;
  opacity: number;
  easing: "linear";
}

export interface V5GLayerConfig {
  id: string;
  name: string;
  type: V5GLayerType;
  assetId: string | null;
  parentId: string | null;
  groupId?: string;
  visible: boolean;
  locked: boolean;
  transform: V5GTransformConfig;
  opacity: number;
  blendMode: V5GBlendMode;
  text?: string;
  animations: V5GAnimationConfig[];
  keyframes?: V5GLayerKeyframeConfig[];
}

export interface V5GLayerGroupConfig {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
}

export interface V5GParticleConfig {
  id: string;
  name: string;
  assetId: string | null;
  startTime: number;
  duration: number;
  seed: number;
  emitter: {
    x: number;
    y: number;
    type: "burst" | "rain" | "trail";
    count: number;
    radius: number;
  };
  params: Record<string, V5GAnimationParamValue>;
}

export interface V5GProjectConfig {
  schemaVersion: string;
  editor: {
    name: string;
    version: string;
  };
  engineTarget: {
    name: "cocos_creator";
    version: string;
  };
  name: string;
  exportProfile?: V5GExportProfileConfig;
  stage: V5GStageConfig;
  assets: V5GAssetConfig[];
  layerGroups: V5GLayerGroupConfig[];
  layers: V5GLayerConfig[];
  particles: V5GParticleConfig[];
}

export const DEFAULT_VNI_LAYER_GROUP_ID = "group_default";

type NormalizableV5GProjectConfig = Omit<V5GProjectConfig, "layerGroups"> & {
  layerGroups?: V5GLayerGroupConfig[];
};

export interface VNIRenderGroupInfo {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
  layerIds: readonly string[];
  renderIndex: number;
}

export interface VNILayerGroupSlot {
  afterGroupId: string;
  afterGroupName: string;
  beforeGroupId: string;
  beforeGroupName: string;
  renderIndex: number;
}

export type V5GRenderGroupInfo = VNIRenderGroupInfo;
export type V5GLayerGroupSlot = VNILayerGroupSlot;

export function normalizeVNIProjectLayerGroups(
  project: NormalizableV5GProjectConfig,
): V5GProjectConfig {
  return normalizeV5GProjectLayerGroups(project);
}

export function normalizeV5GProjectLayerGroups(
  project: NormalizableV5GProjectConfig,
): V5GProjectConfig {
  const hasLayerGroups = Array.isArray(project.layerGroups);
  const hasLayerGroupRefs = project.layers.some(
    (layer) => layer.groupId !== undefined,
  );

  if (!hasLayerGroups && hasLayerGroupRefs) {
    throw new Error(
      "VNI project has layer.groupId values but is missing project.layerGroups.",
    );
  }

  if (!hasLayerGroups) {
    return {
      ...project,
      layerGroups: [createDefaultVniLayerGroup()],
      layers: project.layers.map((layer) => ({
        ...layer,
        groupId: DEFAULT_VNI_LAYER_GROUP_ID,
      })),
    };
  }

  const layerGroups = project.layerGroups;
  if (!layerGroups) {
    throw new Error("VNI project.layerGroups normalization failed.");
  }

  return {
    ...project,
    layerGroups: layerGroups.map((group) => ({ ...group })),
    layers: project.layers.map((layer) => ({ ...layer })),
  };
}

export function createDefaultVniLayerGroup(): V5GLayerGroupConfig {
  return {
    id: DEFAULT_VNI_LAYER_GROUP_ID,
    name: "Default",
    visible: true,
    collapsed: false,
    order: 0,
  };
}

export function getVNIProjectRenderGroupOrder(
  project: V5GProjectConfig,
): readonly VNIRenderGroupInfo[] {
  return getV5GProjectRenderGroupOrder(project);
}

export function getV5GProjectRenderGroupOrder(
  project: V5GProjectConfig,
): readonly V5GRenderGroupInfo[] {
  const groupsById = new Map<string, V5GLayerGroupConfig>(
    project.layerGroups.map((group) => [group.id, group] as const),
  );
  const renderGroups: VNIRenderGroupInfo[] = [];
  const seenClosedGroups = new Set<string>();
  let currentGroupId: string | null = null;

  for (const layer of project.layers) {
    const groupId = layer.groupId;
    if (!groupId) {
      throw new Error(`VNI layer "${layer.id}" is missing groupId.`);
    }
    const group = groupsById.get(groupId);
    if (!group) {
      throw new Error(
        `VNI layer "${layer.id}" references missing layer group "${groupId}".`,
      );
    }
    if (groupId !== currentGroupId) {
      if (seenClosedGroups.has(groupId)) {
        throw new Error(
          `VNI layer group "${groupId}" is not contiguous in project.layers.`,
        );
      }
      if (currentGroupId !== null) {
        seenClosedGroups.add(currentGroupId);
      }
      renderGroups.push({
        id: group.id,
        name: group.name,
        visible: group.visible,
        collapsed: group.collapsed,
        order: group.order,
        layerIds: [],
        renderIndex: renderGroups.length,
      });
      currentGroupId = groupId;
    }

    const renderGroup = renderGroups[renderGroups.length - 1];
    if (!renderGroup) {
      throw new Error("VNI render group construction failed.");
    }
    (renderGroup.layerIds as string[]).push(layer.id);
  }

  return Object.freeze(
    renderGroups.map((group) =>
      Object.freeze({
        ...group,
        layerIds: Object.freeze([...group.layerIds]),
      }),
    ),
  );
}

export function getVNIProjectLayerGroupSlots(
  project: V5GProjectConfig,
): readonly VNILayerGroupSlot[] {
  const groups = getVNIProjectRenderGroupOrder(project);
  const slots: VNILayerGroupSlot[] = [];
  for (let index = 0; index < groups.length - 1; index += 1) {
    const after = groups[index];
    const before = groups[index + 1];
    slots.push({
      afterGroupId: after.id,
      afterGroupName: after.name,
      beforeGroupId: before.id,
      beforeGroupName: before.name,
      renderIndex: index,
    });
  }
  return Object.freeze(slots.map((slot) => Object.freeze({ ...slot })));
}

export function assertVNIAdjacentLayerGroupSlot(
  project: V5GProjectConfig,
  afterGroupId: string,
  beforeGroupId: string,
): VNILayerGroupSlot {
  const slots = getVNIProjectLayerGroupSlots(project);
  const slot = slots.find(
    (candidate) =>
      candidate.afterGroupId === afterGroupId &&
      candidate.beforeGroupId === beforeGroupId,
  );
  if (slot) return slot;

  const groupIds = new Set(project.layerGroups.map((group) => group.id));
  if (!groupIds.has(afterGroupId)) {
    throw new Error(`Unknown VNI layer group: ${afterGroupId}.`);
  }
  if (!groupIds.has(beforeGroupId)) {
    throw new Error(`Unknown VNI layer group: ${beforeGroupId}.`);
  }
  throw new Error(
    `VNI layer groups are not adjacent in render order: ${afterGroupId} -> ${beforeGroupId}.`,
  );
}

export interface CocosPoint2D {
  x: number;
  y: number;
}

export interface V5GSize {
  width: number;
  height: number;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function v5gTransformToCocosPosition(
  transform: V5GTransformConfig,
): CocosPoint2D {
  return {
    x: transform.x,
    y: transform.y,
  };
}

export function opacityToCocosOpacity(opacity: number): number {
  return Math.round(clampNumber(opacity, 0, 1) * 255);
}

export type V5GEasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "backOut";

export interface V5GAnimationSampleBase {
  transform: V5GTransformConfig;
  opacity: number;
}

export interface V5GAnimationSampleResult {
  transform: V5GTransformConfig;
  opacity: number;
}

export const SUPPORTED_EASINGS: readonly V5GEasingName[] = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "backOut",
];

export const PARTICLE_ANIMATION_TYPES: readonly V5GAnimationType[] = [
  "particles",
  "particle_twinkle",
  "particle_wall",
  "particle_combo",
];

export const SUPPORTED_ANIMATION_TYPES: readonly V5GAnimationType[] = [
  "idle",
  "move",
  "fade",
  "scale_up",
  "scale_down",
  "scale_in",
  "scale_out",
  "pop",
  "shake",
  "blink",
  "rotate",
  "slide_in",
  "slide_out",
  "bounce_in",
  "pulse",
  "float",
  "swing",
  "particles",
  "particle_twinkle",
  "particle_wall",
  "particle_combo",
  "shatter",
  "glow",
  "squash_stretch",
];

const DEFAULT_EASING_BY_TYPE: Readonly<
  Record<V5GAnimationType, V5GEasingName>
> = {
  idle: "linear",
  move: "easeOutQuad",
  fade: "linear",
  scale_up: "easeOutQuad",
  scale_down: "easeOutQuad",
  scale_in: "easeOutQuad",
  scale_out: "easeInQuad",
  pop: "easeOutQuad",
  shake: "linear",
  blink: "linear",
  rotate: "linear",
  slide_in: "easeOutQuad",
  slide_out: "easeInQuad",
  bounce_in: "backOut",
  pulse: "linear",
  float: "linear",
  swing: "linear",
  particles: "linear",
  particle_twinkle: "linear",
  particle_wall: "linear",
  particle_combo: "easeInOutQuad",
  shatter: "easeOutQuad",
  glow: "linear",
  squash_stretch: "easeOutQuad",
};

export function sampleLayerAnimationsAtTime(
  base: V5GAnimationSampleBase,
  animations: readonly V5GAnimationConfig[],
  time: number,
): V5GAnimationSampleResult {
  const result: V5GAnimationSampleResult = {
    transform: { ...base.transform },
    opacity: base.opacity,
  };

  for (const animation of [...animations].sort(
    (a, b) => a.startTime - b.startTime,
  )) {
    if (!animation.enabled) continue;

    const progress = getAnimationProgress(animation, time);
    if (progress === null) continue;

    const easedProgress = easeProgress(progress, getAnimationEasing(animation));

    if (animation.type === "move") sampleMove(result, animation, easedProgress);
    else if (animation.type === "slide_in" || animation.type === "slide_out")
      sampleSlide(result, animation, easedProgress, base);
    else if (animation.type === "fade")
      sampleFade(result, animation, easedProgress);
    else if (animation.type === "bounce_in")
      sampleBounceIn(result, animation, progress, base);
    else if (animation.type === "scale_up" || animation.type === "scale_down")
      sampleScale(result, animation, easedProgress, base.transform);
    else if (animation.type === "scale_in" || animation.type === "scale_out")
      sampleScaleEntryExit(result, animation, easedProgress, base);
    else if (animation.type === "pop") samplePop(result, animation, progress);
    else if (animation.type === "shake")
      sampleShake(result, animation, progress);
    else if (animation.type === "blink")
      sampleBlink(result, animation, progress);
    else if (animation.type === "pulse")
      samplePulse(result, animation, progress);
    else if (animation.type === "float")
      sampleFloat(result, animation, progress);
    else if (animation.type === "swing")
      sampleSwing(result, animation, progress);
    else if (animation.type === "rotate")
      sampleRotate(result, animation, easedProgress);
    else if (animation.type === "squash_stretch")
      sampleSquashStretch(result, animation, easedProgress);
    else if (animation.type === "particle_combo")
      sampleParticleComboSource(result, animation, base);
    else if (animation.type === "shatter")
      sampleShatterSource(result, animation, base);
    else if (animation.type === "glow") sampleGlowSource(result, animation);
    else if (isParticleAnimationType(animation.type)) {
      // Particle animations are sampled by sampleParticleSpritesForLayer().
    } else if (animation.type === "idle") {
      // Idle is a timeline coverage marker. It intentionally leaves base
      // transform and opacity unchanged.
    } else throw new Error(`Unsupported V5G animation type: ${animation.type}`);
  }

  result.transform.x = roundTo(result.transform.x, 4);
  result.transform.y = roundTo(result.transform.y, 4);
  result.transform.scaleX = roundTo(result.transform.scaleX, 4);
  result.transform.scaleY = roundTo(result.transform.scaleY, 4);
  result.transform.rotation = roundTo(result.transform.rotation, 4);
  result.opacity = roundTo(clampNumber(result.opacity, 0, 1), 4);
  return result;
}

export function easeProgress(progress: number, easing: V5GEasingName): number {
  const t = clampNumber(progress, 0, 1);
  if (easing === "linear") return t;
  if (easing === "easeInQuad") return t * t;
  if (easing === "easeOutQuad") return 1 - (1 - t) * (1 - t);
  if (easing === "easeInOutQuad")
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  if (easing === "backOut") return backOutProgress(t, 1.70158);
  throw new Error(`Unsupported V5G easing: ${String(easing)}`);
}

export function isSupportedAnimationType(
  value: string,
): value is V5GAnimationType {
  return hasStringValue(SUPPORTED_ANIMATION_TYPES, value);
}

export function isParticleAnimationType(
  value: string,
): value is V5GAnimationType {
  return hasStringValue(PARTICLE_ANIMATION_TYPES, value);
}

export function isSupportedEasing(value: string): value is V5GEasingName {
  return hasStringValue(SUPPORTED_EASINGS, value);
}

export function getDefaultEasing(type: V5GAnimationType): V5GEasingName {
  const easing = DEFAULT_EASING_BY_TYPE[type];
  if (!easing) {
    throw new Error(`Unsupported V5G animation type: ${String(type)}`);
  }
  return easing;
}

export function backOutProgress(progress: number, overshoot: number): number {
  const t = clampNumber(progress, 0, 1);
  const c1 = Math.max(0, overshoot);
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function sampleMove(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const fromX = getNumberParam(animation, "fromX");
  const fromY = getNumberParam(animation, "fromY");
  const originX = getOptionalNumberParam(animation, "baseX", fromX);
  const originY = getOptionalNumberParam(animation, "baseY", fromY);
  result.transform.x +=
    lerp(fromX, getNumberParam(animation, "toX"), progress) - originX;
  result.transform.y +=
    lerp(fromY, getNumberParam(animation, "toY"), progress) - originY;
}

function sampleSlide(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  result.transform.x += lerp(
    getNumberParam(animation, "fromX"),
    getNumberParam(animation, "toX"),
    progress,
  );
  result.transform.y += lerp(
    getNumberParam(animation, "fromY"),
    getNumberParam(animation, "toY"),
    progress,
  );

  if (
    animation.type === "slide_in" &&
    getOptionalBooleanParam(animation, "fadeIn", true)
  ) {
    result.opacity = lerp(0, base.opacity, progress);
  }
  if (
    animation.type === "slide_out" &&
    getOptionalBooleanParam(animation, "fadeOut", true)
  ) {
    result.opacity = lerp(base.opacity, 0, progress);
  }
}

function sampleFade(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  result.opacity = lerp(
    getNumberParam(animation, "fromOpacity"),
    getNumberParam(animation, "toOpacity"),
    progress,
  );
}

function sampleBounceIn(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  const ratio = backOutProgress(
    progress,
    getNumberParam(animation, "overshoot"),
  );
  const scaleRatio = Math.max(
    0,
    lerp(
      getNumberParam(animation, "fromScale"),
      getNumberParam(animation, "toScale"),
      ratio,
    ),
  );
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
  if (getOptionalBooleanParam(animation, "fadeIn", true)) {
    result.opacity = lerp(0, base.opacity, clampNumber(progress * 1.25, 0, 1));
  }
}

function sampleScale(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  const baseScaleX = Math.abs(baseTransform.scaleX) || 1;
  const baseScaleY = Math.abs(baseTransform.scaleY) || 1;
  const scaleRatioX =
    lerp(
      getNumberParam(animation, "fromScaleX"),
      getNumberParam(animation, "toScaleX"),
      progress,
    ) / baseScaleX;
  const scaleRatioY =
    lerp(
      getNumberParam(animation, "fromScaleY"),
      getNumberParam(animation, "toScaleY"),
      progress,
    ) / baseScaleY;
  result.transform.scaleX *= Math.abs(scaleRatioX);
  result.transform.scaleY *= Math.abs(scaleRatioY);
}

function sampleScaleEntryExit(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  const scaleRatio = Math.max(
    0,
    lerp(
      getNumberParam(animation, "fromScale"),
      getNumberParam(animation, "toScale"),
      progress,
    ),
  );
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
  if (
    animation.type === "scale_in" &&
    getOptionalBooleanParam(animation, "fadeIn", true)
  ) {
    result.opacity = lerp(0, base.opacity, progress);
  }
  if (
    animation.type === "scale_out" &&
    getOptionalBooleanParam(animation, "fadeOut", true)
  ) {
    result.opacity = lerp(base.opacity, 0, progress);
  }
}

function samplePop(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const peakAt = clampNumber(getNumberParam(animation, "peakAt"), 0.05, 0.95);
  const peakScale = getNumberParam(animation, "peakScale");
  const settleScale = getNumberParam(animation, "settleScale");
  const ratio =
    progress <= peakAt
      ? lerp(1, peakScale, easeProgress(progress / peakAt, "easeOutQuad"))
      : lerp(
          peakScale,
          settleScale,
          easeProgress((progress - peakAt) / (1 - peakAt), "easeOutQuad"),
        );
  result.transform.scaleX *= ratio;
  result.transform.scaleY *= ratio;
}

function sampleShake(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const cycles = getNumberParam(animation, "cycles");
  const decay = getOptionalBooleanParam(animation, "decay", true)
    ? 1 - progress
    : 1;
  const waveX = Math.sin(progress * Math.PI * 2 * cycles);
  const waveY = Math.cos(progress * Math.PI * 2 * cycles * 1.37);
  result.transform.x += getNumberParam(animation, "amplitudeX") * waveX * decay;
  result.transform.y += getNumberParam(animation, "amplitudeY") * waveY * decay;
}

function sampleBlink(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  if (progress >= 1) {
    result.opacity = getNumberParam(animation, "endOpacity");
    return;
  }
  const wave = getLoopWave(progress, getNumberParam(animation, "blinks"));
  result.opacity = lerp(
    getNumberParam(animation, "maxOpacity"),
    getNumberParam(animation, "minOpacity"),
    wave,
  );
}

function samplePulse(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const cycle = getLoopWave(progress, getNumberParam(animation, "cycles"));
  const scaleRatio = lerp(1, getNumberParam(animation, "scale"), cycle);
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
}

function sampleFloat(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  result.transform.y +=
    Math.sin(progress * Math.PI * 2 * getNumberParam(animation, "cycles")) *
    getNumberParam(animation, "amplitude");
}

function sampleSwing(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  result.transform.rotation +=
    Math.sin(progress * Math.PI * 2 * getNumberParam(animation, "cycles")) *
    getNumberParam(animation, "angle");
}

function sampleRotate(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  result.transform.rotation += lerp(
    getNumberParam(animation, "fromRotation"),
    getNumberParam(animation, "toRotation"),
    progress,
  );
}

function sampleParticleComboSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  base: V5GAnimationSampleBase,
): void {
  result.opacity = base.opacity * getNumberParam(animation, "sourceOpacity");
}

function sampleShatterSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  base: V5GAnimationSampleBase,
): void {
  result.opacity = base.opacity * getNumberParam(animation, "sourceOpacity");
}

function sampleGlowSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
): void {
  if (getOptionalBooleanParam(animation, "keepOriginal", true)) return;
  result.opacity = 0;
}

function sampleSquashStretch(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  easedProgress: number,
): void {
  const squashAngle = getNumberParam(animation, "squashAngle");
  const squashAmount = getNumberParam(animation, "squashAmount");
  const decayOscillateCount = getNumberParam(animation, "decayOscillateCount");
  const fromX = getNumberParam(animation, "fromX");
  const fromY = getNumberParam(animation, "fromY");
  const toX = getNumberParam(animation, "toX");
  const toY = getNumberParam(animation, "toY");

  result.transform.x += lerp(fromX, toX, easedProgress);
  result.transform.y += lerp(fromY, toY, easedProgress);

  if (squashAmount <= 0.001) return;

  const angleRad = squashAngle * (Math.PI / 180);
  const forceX = Math.cos(angleRad);
  const forceY = Math.sin(angleRad);
  const peakAt = 0.35;
  let squashFactor: number;
  if (easedProgress <= peakAt) {
    const phase = clampNumber(easedProgress / peakAt, 0, 1);
    squashFactor = 1 - squashAmount * easeProgress(phase, "easeOutQuad");
  } else {
    const decayPhase = (easedProgress - peakAt) / Math.max(1 - peakAt, 0.0001);
    if (decayOscillateCount <= 0) {
      const overshoot = squashAmount * 0.35;
      squashFactor =
        1 - squashAmount + overshoot * Math.sin(decayPhase * Math.PI);
    } else {
      const totalCycles = 1 + decayOscillateCount;
      const inner = decayPhase * Math.PI * 2 * totalCycles;
      const decay = Math.exp(-decayPhase * 4);
      squashFactor = 1 - squashAmount * decay * Math.cos(inner);
    }
  }

  squashFactor = clampNumber(squashFactor, 0.11, 3);
  const stretchX = 1 + (1 - squashFactor) * Math.abs(forceY);
  const stretchY = 1 + (1 - squashFactor) * Math.abs(forceX);
  result.transform.scaleX *= stretchX;
  result.transform.scaleY *= stretchY;
}

function getAnimationProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start) return null;
  if (time >= end) return 1;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}

function getAnimationEasing(animation: V5GAnimationConfig): V5GEasingName {
  const value = animation.params.easing;
  if (value === undefined) return getDefaultEasing(animation.type);
  if (typeof value === "string" && isSupportedEasing(value)) return value;
  throw new Error(`Unsupported V5G easing: ${String(value)}`);
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires numeric param "${key}".`,
  );
}

function getOptionalNumberParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: number,
): number {
  const value = animation.params[key];
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a finite number.`,
  );
}

function getOptionalBooleanParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: boolean,
): boolean {
  const value = animation.params[key];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a boolean.`,
  );
}

function getLoopWave(progress: number, cycles: number): number {
  return (1 - Math.cos(progress * Math.PI * 2 * cycles)) / 2;
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * clampNumber(ratio, 0, 1);
}

export interface TextureSize {
  width: number;
  height: number;
}

export interface ParticleLayerSampleState {
  layerId: string;
  transform: V5GTransformConfig;
  baseOpacity: number;
  opacity: number;
  visible: boolean;
  blendMode: V5GBlendMode;
}

export interface ParticleSpriteSample {
  layerId: string;
  animationId: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  alpha: number;
  blendMode: V5GBlendMode;
}

export interface ParticleAnimationRuntimeState {
  animationId: string;
  elapsed: number;
}

export function hasActiveParticleAnimation(
  layer: V5GLayerConfig,
  time: number,
): boolean {
  if (layer.type !== "image") return false;
  return layer.animations.some(
    (animation) =>
      animation.enabled &&
      isParticleAnimationType(animation.type) &&
      getParticleProgress(animation, time) !== null,
  );
}

export function getParticleProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start || time >= end) return null;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}

export function sampleParticleSpritesForLayer(
  layer: V5GLayerConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  time: number,
): ParticleSpriteSample[] {
  if (
    layer.type !== "image" ||
    !layer.visible ||
    sampledLayer.baseOpacity <= 0
  ) {
    return [];
  }

  const sprites: ParticleSpriteSample[] = [];
  for (const animation of layer.animations) {
    if (!animation.enabled || !isParticleAnimationType(animation.type)) {
      continue;
    }
    const progress = getParticleProgress(animation, time);
    if (progress === null) continue;
    if (progress <= 0) continue;

    const particleOpacity =
      animation.type === "particle_combo"
        ? sampledLayer.baseOpacity
        : sampledLayer.opacity;
    if (particleOpacity <= 0) continue;
    const particleLayer = { ...sampledLayer, opacity: particleOpacity };

    if (animation.type === "particles") {
      sprites.push(
        ...sampleParticleBurst(animation, particleLayer, textureSize, progress),
      );
    } else if (animation.type === "particle_twinkle") {
      sprites.push(
        ...sampleParticleTwinkle(
          animation,
          particleLayer,
          textureSize,
          progress * Math.max(animation.duration, 0.0001),
        ),
      );
    } else if (animation.type === "particle_wall") {
      sprites.push(
        ...sampleParticleWall(animation, particleLayer, textureSize, progress),
      );
    } else if (animation.type === "particle_combo") {
      sprites.push(
        ...sampleParticleCombo(animation, particleLayer, textureSize, progress),
      );
    }
  }
  return sprites;
}

export function sampleParticleSpritesForLayerRuntime(
  layer: V5GLayerConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  runtimeStates: readonly ParticleAnimationRuntimeState[],
): ParticleSpriteSample[] {
  if (
    layer.type !== "image" ||
    !layer.visible ||
    sampledLayer.baseOpacity <= 0
  ) {
    return [];
  }

  const stateByAnimationId = new Map(
    runtimeStates.map((state) => [state.animationId, state] as const),
  );
  const sprites: ParticleSpriteSample[] = [];
  for (const animation of layer.animations) {
    if (!animation.enabled || !isParticleAnimationType(animation.type)) {
      continue;
    }
    const runtimeState = stateByAnimationId.get(animation.id);
    if (!runtimeState || runtimeState.elapsed <= 0) continue;

    const particleOpacity =
      animation.type === "particle_combo"
        ? sampledLayer.baseOpacity
        : sampledLayer.opacity;
    if (particleOpacity <= 0) continue;
    const particleLayer = { ...sampledLayer, opacity: particleOpacity };

    if (animation.type === "particles") {
      const progress = getRuntimeProgress(animation, runtimeState.elapsed);
      if (progress === null) continue;
      sprites.push(
        ...sampleParticleBurst(animation, particleLayer, textureSize, progress),
      );
    } else if (animation.type === "particle_twinkle") {
      sprites.push(
        ...sampleParticleTwinkle(
          animation,
          particleLayer,
          textureSize,
          runtimeState.elapsed,
        ),
      );
    } else if (animation.type === "particle_wall") {
      sprites.push(
        ...sampleParticleWallFromElapsed(
          animation,
          particleLayer,
          textureSize,
          runtimeState.elapsed,
        ),
      );
    } else if (animation.type === "particle_combo") {
      const progress = getRuntimeProgress(animation, runtimeState.elapsed);
      if (progress === null) continue;
      sprites.push(
        ...sampleParticleCombo(animation, particleLayer, textureSize, progress),
      );
    }
  }
  return sprites;
}

export function seededRandom(
  seed: number,
  index: number,
  salt: number,
): number {
  const raw =
    Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453123;
  return raw - Math.floor(raw);
}

function sampleParticleBurst(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  progress: number,
): ParticleSpriteSample[] {
  const count = Math.round(
    clampParticleNumber(getNumberParam(animation, "count"), 1, 200),
  );
  const spread = clampParticleNumber(
    getNumberParam(animation, "spread"),
    0,
    1000,
  );
  const speed = clampParticleNumber(
    getNumberParam(animation, "speed"),
    0,
    2000,
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const gravity = clampParticleNumber(
    getNumberParam(animation, "gravity"),
    -2000,
    2000,
  );
  const fadeOut = getOptionalBooleanParam(animation, "fadeOut", true);
  const duration = Math.max(animation.duration, 0.0001);
  const age = progress * duration;
  const alphaBase =
    sampledLayer.opacity * (fadeOut ? Math.pow(1 - progress, 1.35) : 1);
  if (alphaBase <= 0.002) return [];

  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const sprites: ParticleSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const randomA = seededRandom(animation.seed, index, 1);
    const randomB = seededRandom(animation.seed, index, 2);
    const randomC = seededRandom(animation.seed, index, 3);
    const randomD = seededRandom(animation.seed, index, 4);
    const randomE = seededRandom(animation.seed, index, 5);
    const angle = randomA * Math.PI * 2;
    const burstPower = 0.55 + randomB * 0.85;
    const startRadius = spread * 0.22 * randomC;
    const travel = spread * progress + speed * age * burstPower;
    const offsetX = Math.cos(angle) * (startRadius + travel);
    const offsetY =
      Math.sin(angle) * (startRadius + travel) + 0.5 * gravity * age * age;
    const scale = Math.max(
      0.01,
      baseTextureScale * (0.55 + randomD * 0.9) * (1 - progress * 0.25),
    );
    const alpha = alphaBase * (0.55 + randomC * 0.45);
    sprites.push({
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      offsetX: roundTo(offsetX, 4),
      offsetY: roundTo(offsetY, 4),
      scale: roundTo(scale, 4),
      rotation: roundTo(
        (randomE - 0.5) * Math.PI * 0.75 + progress * Math.PI * (0.5 + randomB),
        4,
      ),
      alpha: roundTo(clampNumber(alpha, 0, 1), 4),
      blendMode: sampledLayer.blendMode,
    });
  }

  return sprites;
}

function sampleParticleTwinkle(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  elapsed: number,
): ParticleSpriteSample[] {
  const count = Math.round(
    clampParticleNumber(getNumberParam(animation, "count"), 1, 1000),
  );
  const radius = clampParticleNumber(
    getNumberParam(animation, "radius"),
    0,
    3000,
  );
  const spawnInterval = clampParticleNumber(
    getNumberParam(animation, "spawnInterval"),
    0.01,
    10,
  );
  const twinkleDuration = clampParticleNumber(
    getNumberParam(animation, "twinkleDuration"),
    0.03,
    10,
  );
  const batchMin = Math.round(
    clampParticleNumber(getNumberParam(animation, "batchMin"), 1, 100),
  );
  const batchMax = Math.round(
    clampParticleNumber(getNumberParam(animation, "batchMax"), batchMin, 100),
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const sprites: ParticleSpriteSample[] = [];
  let spawnedCount = 0;

  for (let batchIndex = 0; spawnedCount < count; batchIndex += 1) {
    const spawnTime = batchIndex * spawnInterval;
    if (spawnTime > elapsed) break;
    const batchRandom = seededRandom(animation.seed, batchIndex, 11);
    const batchCount = Math.min(
      count - spawnedCount,
      batchMin + Math.floor(batchRandom * (batchMax - batchMin + 1)),
    );
    for (let itemIndex = 0; itemIndex < batchCount; itemIndex += 1) {
      const particleIndex = spawnedCount + itemIndex;
      const localAge = (elapsed - spawnTime) / twinkleDuration;
      if (localAge < 0 || localAge > 1) continue;
      const randomA = seededRandom(animation.seed, particleIndex, 21);
      const randomB = seededRandom(animation.seed, particleIndex, 22);
      const randomC = seededRandom(animation.seed, particleIndex, 23);
      const randomD = seededRandom(animation.seed, particleIndex, 24);
      const angle = randomA * Math.PI * 2;
      const distance = Math.sqrt(randomB) * radius;
      const waveAlpha = Math.sin(localAge * Math.PI);
      const shimmer =
        0.78 + 0.22 * Math.sin(localAge * Math.PI * 6 + randomC * 6);
      const alpha = sampledLayer.opacity * Math.max(0, waveAlpha * shimmer);
      if (alpha <= 0.002) continue;
      sprites.push({
        layerId: sampledLayer.layerId,
        animationId: animation.id,
        offsetX: roundTo(Math.cos(angle) * distance, 4),
        offsetY: roundTo(Math.sin(angle) * distance, 4),
        scale: roundTo(
          Math.max(0.01, baseTextureScale * (0.65 + randomC * 0.85)),
          4,
        ),
        rotation: roundTo((randomD - 0.5) * Math.PI * 2, 4),
        alpha: roundTo(clampNumber(alpha, 0, 1), 4),
        blendMode: sampledLayer.blendMode,
      });
    }
    spawnedCount += batchCount;
  }

  return sprites;
}

function sampleParticleWall(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  progress: number,
): ParticleSpriteSample[] {
  return sampleParticleWallFromElapsed(
    animation,
    sampledLayer,
    textureSize,
    progress * Math.max(animation.duration, 0.0001),
  );
}

function sampleParticleWallFromElapsed(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  elapsed: number,
): ParticleSpriteSample[] {
  const emitterWidth = clampParticleNumber(
    getNumberParam(animation, "emitterWidth"),
    0,
    3000,
  );
  const direction = clampParticleNumber(
    getNumberParam(animation, "direction"),
    0,
    360,
  );
  const spreadAngle = clampParticleNumber(
    getNumberParam(animation, "spreadAngle"),
    0,
    180,
  );
  const speed = clampParticleNumber(
    getNumberParam(animation, "speed"),
    0,
    2000,
  );
  const lifetimeMin = clampParticleNumber(
    getNumberParam(animation, "lifetimeMin"),
    0.05,
    10,
  );
  const lifetimeMax = clampParticleNumber(
    getNumberParam(animation, "lifetimeMax"),
    lifetimeMin,
    10,
  );
  const spawnRate = clampParticleNumber(
    getNumberParam(animation, "spawnRate"),
    1,
    500,
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const gravity = clampParticleNumber(
    getNumberParam(animation, "gravity"),
    -2000,
    2000,
  );
  const startScaleMin = clampParticleNumber(
    getNumberParam(animation, "startScaleMin"),
    0.01,
    2,
  );
  const startScaleMax = clampParticleNumber(
    getNumberParam(animation, "startScaleMax"),
    startScaleMin,
    2,
  );
  const endScaleMin = clampParticleNumber(
    getNumberParam(animation, "endScaleMin"),
    0.01,
    2,
  );
  const endScaleMax = clampParticleNumber(
    getNumberParam(animation, "endScaleMax"),
    endScaleMin,
    2,
  );
  const fadeOut = getOptionalBooleanParam(animation, "fadeOut", true);
  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const dirRad = (direction * Math.PI) / 180;
  const dirX = Math.cos(dirRad);
  const dirY = Math.sin(dirRad);
  const perpX = -dirY;
  const perpY = dirX;
  const totalSpawnCount = Math.floor(elapsed * spawnRate);
  const sprites: ParticleSpriteSample[] = [];

  for (let index = 0; index < totalSpawnCount; index += 1) {
    const randomA = seededRandom(animation.seed, index, 101);
    const randomB = seededRandom(animation.seed, index, 102);
    const randomC = seededRandom(animation.seed, index, 103);
    const randomD = seededRandom(animation.seed, index, 104);
    const randomE = seededRandom(animation.seed, index, 105);
    const lifetime = lifetimeMin + randomA * (lifetimeMax - lifetimeMin);
    const spawnTime =
      totalSpawnCount <= 1 ? 0 : (index / (totalSpawnCount - 1)) * elapsed;
    const localAge = (elapsed - spawnTime) / Math.max(lifetime, 0.0001);
    if (localAge < 0 || localAge > 1) continue;

    const widthOffset = (randomB - 0.5) * emitterWidth;
    const spreadRad = (randomC - 0.5) * 2 * ((spreadAngle * Math.PI) / 180);
    const flyDirX = Math.cos(dirRad + spreadRad);
    const flyDirY = Math.sin(dirRad + spreadRad);
    const distance = speed * localAge * lifetime;
    const ageSeconds = localAge * lifetime;
    const startScaleValue =
      startScaleMin + randomD * (startScaleMax - startScaleMin);
    const endScaleValue = endScaleMin + randomE * (endScaleMax - endScaleMin);
    const scale = Math.max(
      0.01,
      baseTextureScale *
        (startScaleValue + (endScaleValue - startScaleValue) * localAge),
    );
    const alpha = fadeOut
      ? sampledLayer.opacity * Math.max(0, 1 - localAge)
      : sampledLayer.opacity;
    if (alpha <= 0.002) continue;

    sprites.push({
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      offsetX: roundTo(perpX * widthOffset + flyDirX * distance, 4),
      offsetY: roundTo(
        perpY * widthOffset +
          flyDirY * distance +
          0.5 * gravity * ageSeconds * ageSeconds,
        4,
      ),
      scale: roundTo(scale, 4),
      rotation: roundTo(
        (randomA - 0.5) * Math.PI * 0.5 + localAge * Math.PI * (0.5 + randomB),
        4,
      ),
      alpha: roundTo(clampNumber(alpha, 0, 1), 4),
      blendMode: sampledLayer.blendMode,
    });
  }

  return sprites;
}

function sampleParticleCombo(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  progress: number,
): ParticleSpriteSample[] {
  const count = Math.round(
    clampParticleNumber(getNumberParam(animation, "count"), 1, 300),
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const spawnMode = Math.round(
    clampParticleNumber(getNumberParam(animation, "spawnMode"), 0, 1),
  );
  const spawnRadius = clampParticleNumber(
    getNumberParam(animation, "spawnRadius"),
    0,
    3000,
  );
  const spawnRatio = clampParticleNumber(
    getNumberParam(animation, "spawnRatio"),
    0.01,
    0.8,
  );
  const targetOffsetX = getNumberParam(animation, "targetX");
  const targetOffsetY = -getNumberParam(animation, "targetY");
  const travelMode = Math.round(
    clampParticleNumber(getNumberParam(animation, "travelMode"), 0, 2),
  );
  const curve = getNumberParam(animation, "curve");
  const orbitRadius = clampParticleNumber(
    getNumberParam(animation, "orbitRadius"),
    0,
    3000,
  );
  const orbitTurns = clampParticleNumber(
    getNumberParam(animation, "orbitTurns"),
    -10,
    10,
  );
  const orbitSpeed = clampParticleNumber(
    getNumberParam(animation, "orbitSpeed"),
    0.1,
    5,
  );
  const orbitRatio = clampParticleNumber(
    getNumberParam(animation, "orbitRatio") / orbitSpeed,
    0.03,
    0.95,
  );
  const staggerRatio = clampParticleNumber(
    getNumberParam(animation, "staggerRatio"),
    0,
    0.9,
  );
  const trailCount = Math.round(
    clampParticleNumber(getNumberParam(animation, "trailCount"), 0, 12),
  );
  const trailSpacing = clampParticleNumber(
    getNumberParam(animation, "trailSpacing"),
    0.005,
    0.25,
  );
  const trailFade = clampParticleNumber(
    getNumberParam(animation, "trailFade"),
    0.05,
    0.95,
  );
  const vanishMode = Math.round(
    clampParticleNumber(getNumberParam(animation, "vanishMode"), 0, 2),
  );
  const vanishRatio = clampParticleNumber(
    getNumberParam(animation, "vanishRatio"),
    0.01,
    0.8,
  );
  const flashScale = clampParticleNumber(
    getNumberParam(animation, "flashScale"),
    0.1,
    8,
  );
  const flashIntensity = clampParticleNumber(
    getNumberParam(animation, "flashIntensity"),
    0.1,
    3,
  );
  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const effectiveTravelWindow = Math.max(0.001, 1 - staggerRatio);
  const sprites: ParticleSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const stagger =
      count <= 1 ? 0 : (index / Math.max(1, count - 1)) * staggerRatio;
    for (let trailIndex = trailCount; trailIndex >= 0; trailIndex -= 1) {
      const trailProgress = progress - trailIndex * trailSpacing;
      const localProgress = (trailProgress - stagger) / effectiveTravelWindow;
      if (localProgress < 0 || localProgress > 1) continue;
      const point = sampleParticleComboPoint(
        animation,
        index,
        localProgress,
        spawnMode,
        spawnRadius,
        spawnRatio,
        targetOffsetX,
        targetOffsetY,
        travelMode,
        curve,
        orbitRadius,
        orbitTurns,
        orbitRatio,
        vanishMode,
        vanishRatio,
        flashScale,
        flashIntensity,
      );
      if (point.alpha <= 0.002) continue;
      const trailAlpha = Math.pow(trailFade, trailIndex);
      const alpha = sampledLayer.opacity * point.alpha * trailAlpha;
      if (alpha <= 0.002) continue;
      sprites.push({
        layerId: sampledLayer.layerId,
        animationId: animation.id,
        offsetX: roundTo(point.x, 4),
        offsetY: roundTo(point.y, 4),
        scale: roundTo(Math.max(0.01, baseTextureScale * point.scale), 4),
        rotation: roundTo(point.rotation, 4),
        alpha: roundTo(clampNumber(alpha, 0, 1), 4),
        blendMode: sampledLayer.blendMode,
      });
    }
  }

  return sprites;
}

interface ParticleComboPoint {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  rotation: number;
}

function sampleParticleComboPoint(
  animation: V5GAnimationConfig,
  index: number,
  progress: number,
  spawnMode: number,
  spawnRadius: number,
  spawnRatio: number,
  targetOffsetX: number,
  targetOffsetY: number,
  travelMode: number,
  curve: number,
  orbitRadius: number,
  orbitTurns: number,
  orbitRatio: number,
  vanishMode: number,
  vanishRatio: number,
  flashScale: number,
  flashIntensity: number,
): ParticleComboPoint {
  const p = clampNumber(progress, 0, 1);
  const randomA = seededRandom(animation.seed, index, 301);
  const randomB = seededRandom(animation.seed, index, 302);
  const randomC = seededRandom(animation.seed, index, 303);
  const randomD = seededRandom(animation.seed, index, 304);
  const randomE = seededRandom(animation.seed, index, 305);
  const spawnAngle = randomA * Math.PI * 2;
  const spawnDistance = Math.sqrt(randomB) * spawnRadius;
  const spawnX = Math.cos(spawnAngle) * spawnDistance;
  const spawnY = Math.sin(spawnAngle) * spawnDistance;
  const targetX = targetOffsetX;
  const targetY = targetOffsetY;
  const travelStart = spawnRatio;
  const vanishStart = Math.max(travelStart + 0.001, 1 - vanishRatio);
  const travelDuration = Math.max(0.001, vanishStart - travelStart);
  const spawnPhase = clampNumber(p / Math.max(spawnRatio, 0.001), 0, 1);
  const travelPhase = clampNumber((p - travelStart) / travelDuration, 0, 1);
  const vanishPhase = clampNumber(
    (p - vanishStart) / Math.max(vanishRatio, 0.001),
    0,
    1,
  );
  const easedSpawn = easeOutQuad(spawnPhase);
  const easedTravel = easeInOutQuad(travelPhase);
  const easedVanish = easeOutQuad(vanishPhase);

  let x = spawnX;
  let y = spawnY;
  if (p < travelStart) {
    if (spawnMode === 1) {
      x = spawnX * easedSpawn;
      y = spawnY * easedSpawn;
    }
  } else if (travelMode === 2) {
    const orbitEnd = clampNumber(orbitRatio, 0.03, 0.95);
    if (travelPhase <= orbitEnd) {
      const orbitPhase = clampNumber(travelPhase / orbitEnd, 0, 1);
      const orbitAngle =
        spawnAngle + orbitPhase * Math.PI * 2 * orbitTurns + randomC * Math.PI;
      const orbitEase = easeInOutQuad(orbitPhase);
      x =
        spawnX + Math.cos(orbitAngle) * orbitRadius * (0.35 + orbitEase * 0.65);
      y =
        spawnY + Math.sin(orbitAngle) * orbitRadius * (0.35 + orbitEase * 0.65);
    } else {
      const flyPhase = clampNumber(
        (travelPhase - orbitEnd) / (1 - orbitEnd),
        0,
        1,
      );
      const flyEase = easeInOutQuad(flyPhase);
      const orbitAngle =
        spawnAngle + Math.PI * 2 * orbitTurns + randomC * Math.PI;
      const fromX = spawnX + Math.cos(orbitAngle) * orbitRadius;
      const fromY = spawnY + Math.sin(orbitAngle) * orbitRadius;
      const curved = quadraticPoint(
        fromX,
        fromY,
        targetX,
        targetY,
        curve * 0.45 * (randomD < 0.5 ? -1 : 1),
        flyEase,
      );
      x = curved.x;
      y = curved.y;
    }
  } else if (travelMode === 1) {
    const curved = quadraticPoint(
      spawnX,
      spawnY,
      targetX,
      targetY,
      curve,
      easedTravel,
    );
    x = curved.x;
    y = curved.y;
  } else {
    x = lerpNumber(spawnX, targetX, easedTravel);
    y = lerpNumber(spawnY, targetY, easedTravel);
  }

  let alpha = p < travelStart ? easeOutQuad(spawnPhase) : 1;
  let scale = 0.65 + randomE * 0.7;
  if (p < travelStart) scale *= 0.25 + easedSpawn * 0.75;
  if (vanishPhase > 0) {
    if (vanishMode === 1) {
      const flash = Math.sin(vanishPhase * Math.PI);
      alpha *= Math.max(
        0,
        1 - easedVanish * 0.75 + flash * (flashIntensity - 1) * 0.35,
      );
      scale *= 1 + flash * (flashScale - 1);
    } else if (vanishMode === 2) {
      scale *= lerpNumber(1, flashScale, easedVanish);
      alpha *= Math.max(0, 1 - easedVanish);
    } else {
      alpha *= Math.max(0, 1 - easedVanish);
    }
  }

  const rotation =
    (randomC - 0.5) * Math.PI * 2 + p * Math.PI * 2 * (0.35 + randomD);
  return { x, y, alpha: Math.max(0, alpha), scale, rotation };
}

function quadraticPoint(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  curve: number,
  progress: number,
): { x: number; y: number } {
  const t = clampNumber(progress, 0, 1);
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;
  const controlX = midX + (-dy / length) * curve;
  const controlY = midY + (dx / length) * curve;
  const inv = 1 - t;
  return {
    x: inv * inv * fromX + 2 * inv * t * controlX + t * t * toX,
    y: inv * inv * fromY + 2 * inv * t * controlY + t * t * toY,
  };
}

function easeOutQuad(progress: number): number {
  const t = clampNumber(progress, 0, 1);
  return 1 - (1 - t) * (1 - t);
}

function easeInOutQuad(progress: number): number {
  const t = clampNumber(progress, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerpNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * clampNumber(progress, 0, 1);
}

function getRuntimeProgress(
  animation: V5GAnimationConfig,
  elapsed: number,
): number | null {
  const duration = Math.max(animation.duration, 0.0001);
  if (elapsed < 0 || elapsed >= duration) return null;
  return clampNumber(elapsed / duration, 0, 1);
}

function clampParticleNumber(value: number, min: number, max: number): number {
  return clampNumber(Number.isFinite(value) ? value : min, min, max);
}

function getTextureLongestEdge(textureSize: TextureSize): number {
  const width = Number(textureSize.width);
  const height = Number(textureSize.height);
  const longestEdge = Math.max(width, height);
  return Number.isFinite(longestEdge) && longestEdge > 0 ? longestEdge : 1;
}

const VISUAL_ENTRY_SCALE_THRESHOLD = 0.011;

export interface SampledLayerState {
  layerId: string;
  transform: V5GTransformConfig;
  baseOpacity: number;
  opacity: number;
  visible: boolean;
  renderImageDisplay: boolean;
  hasActiveParticleAnimation: boolean;
  blendMode: V5GBlendMode;
}

export interface SampledProjectState {
  time: number;
  layers: SampledLayerState[];
}

export function sampleProjectAtTime(
  project: V5GProjectConfig,
  time: number,
): SampledProjectState {
  const clampedTime = roundTo(clampNumber(time, 0, project.stage.duration), 4);
  return {
    time: clampedTime,
    layers: project.layers.map((layer) =>
      sampleLayerAtTime(layer, clampedTime),
    ),
  };
}

export function sampleLayerAtTime(
  layer: V5GLayerConfig,
  time: number,
): SampledLayerState {
  const sampled = sampleLayerAnimationsAtTime(
    {
      transform: { ...layer.transform },
      opacity: layer.opacity,
    },
    layer.animations,
    time,
  );
  const hasAnyEnabled = layer.animations.some((animation) => animation.enabled);
  const hasPendingOpacityEntry = layer.animations.some(
    (animation) =>
      animation.enabled &&
      isOpacityEntryAnimation(animation) &&
      time < animation.startTime,
  );
  const hasPendingScaleEntry = layer.animations.some(
    (animation) =>
      animation.enabled &&
      isScaleEntryAnimation(animation) &&
      time <= animation.startTime,
  );
  const hasActiveCoverage = hasAnyEnabled
    ? layer.animations.some(
        (animation) =>
          animation.enabled &&
          time >= animation.startTime &&
          time <= animation.startTime + animation.duration,
      )
    : true;
  const opacity =
    hasPendingOpacityEntry ||
    hasPendingScaleEntry ||
    (hasAnyEnabled && !hasActiveCoverage)
      ? 0
      : roundTo(clampNumber(sampled.opacity, 0, 1), 4);
  const baseOpacity = roundTo(clampNumber(layer.opacity, 0, 1), 4);
  const activeParticleAnimation =
    layer.visible && baseOpacity > 0 && hasActiveParticleAnimation(layer, time);
  const visible = layer.visible && opacity > 0;

  return {
    layerId: layer.id,
    transform: sampled.transform,
    baseOpacity,
    opacity,
    visible,
    renderImageDisplay: visible,
    hasActiveParticleAnimation: activeParticleAnimation,
    blendMode: layer.blendMode,
  };
}

function isOpacityEntryAnimation(animation: V5GAnimationConfig): boolean {
  if (animation.type === "fade") {
    return getProjectNumberParam(animation, "fromOpacity") === 0;
  }
  if (animation.type === "slide_in") {
    return getProjectBooleanParam(animation, "fadeIn", true);
  }
  if (animation.type === "bounce_in") {
    return getProjectBooleanParam(animation, "fadeIn", true);
  }
  if (animation.type === "scale_in") {
    return getProjectBooleanParam(animation, "fadeIn", true);
  }
  return false;
}

function isScaleEntryAnimation(animation: V5GAnimationConfig): boolean {
  if (animation.type === "scale_up") {
    return (
      getProjectNumberParam(animation, "fromScaleX") <=
        VISUAL_ENTRY_SCALE_THRESHOLD ||
      getProjectNumberParam(animation, "fromScaleY") <=
        VISUAL_ENTRY_SCALE_THRESHOLD
    );
  }
  if (animation.type === "scale_in" || animation.type === "bounce_in") {
    return (
      getProjectNumberParam(animation, "fromScale") <=
      VISUAL_ENTRY_SCALE_THRESHOLD
    );
  }
  return false;
}

function getProjectNumberParam(
  animation: V5GAnimationConfig,
  key: string,
): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number.NaN;
}

function getProjectBooleanParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: boolean,
): boolean {
  const value = animation.params[key];
  if (value === undefined) return fallback;
  return value === true;
}

const SUPPORTED_BLEND_MODES: readonly V5GBlendMode[] = [
  "normal",
  "add",
  "screen",
  "multiply",
  "lighten",
];

const REQUIRED_NUMERIC_PARAMS: Readonly<
  Record<V5GAnimationType, readonly string[]>
> = {
  idle: [],
  move: ["fromX", "fromY", "toX", "toY"],
  fade: ["fromOpacity", "toOpacity"],
  scale_up: ["fromScaleX", "fromScaleY", "toScaleX", "toScaleY"],
  scale_down: ["fromScaleX", "fromScaleY", "toScaleX", "toScaleY"],
  scale_in: ["fromScale", "toScale"],
  scale_out: ["fromScale", "toScale"],
  pop: ["peakScale", "settleScale", "peakAt"],
  shake: ["amplitudeX", "amplitudeY", "cycles"],
  blink: ["minOpacity", "maxOpacity", "blinks", "endOpacity"],
  rotate: ["fromRotation", "toRotation"],
  slide_in: ["fromX", "fromY", "toX", "toY"],
  slide_out: ["fromX", "fromY", "toX", "toY"],
  bounce_in: ["fromScale", "toScale", "overshoot"],
  pulse: ["scale", "cycles"],
  float: ["amplitude", "cycles"],
  swing: ["angle", "cycles"],
  particles: ["count", "spread", "speed", "size", "gravity"],
  particle_twinkle: [
    "radius",
    "count",
    "spawnInterval",
    "twinkleDuration",
    "batchMin",
    "batchMax",
    "size",
  ],
  particle_wall: [
    "emitterWidth",
    "direction",
    "spreadAngle",
    "speed",
    "lifetimeMin",
    "lifetimeMax",
    "spawnRate",
    "size",
    "gravity",
    "startScaleMin",
    "startScaleMax",
    "endScaleMin",
    "endScaleMax",
  ],
  particle_combo: [
    "count",
    "size",
    "sourceOpacity",
    "spawnMode",
    "spawnRadius",
    "spawnRatio",
    "targetX",
    "targetY",
    "travelMode",
    "curve",
    "orbitRadius",
    "orbitTurns",
    "orbitSpeed",
    "orbitRatio",
    "staggerRatio",
    "trailCount",
    "trailSpacing",
    "trailFade",
    "vanishMode",
    "vanishRatio",
    "flashScale",
    "flashIntensity",
  ],
  shatter: [
    "count",
    "pieceSize",
    "force",
    "impactAngle",
    "spreadAngle",
    "gravity",
    "spin",
    "sourceOpacity",
  ],
  glow: ["intensity", "spread", "minAlpha", "maxAlpha", "pulses", "blendMode"],
  squash_stretch: [
    "squashAngle",
    "squashAmount",
    "decayOscillateCount",
    "fromX",
    "fromY",
    "toX",
    "toY",
  ],
};

const OPTIONAL_BOOLEAN_PARAMS: Readonly<
  Partial<Record<V5GAnimationType, readonly string[]>>
> = {
  slide_in: ["fadeIn"],
  slide_out: ["fadeOut"],
  bounce_in: ["fadeIn"],
  scale_in: ["fadeIn"],
  scale_out: ["fadeOut"],
  shake: ["decay"],
  particles: ["fadeOut"],
  particle_wall: ["fadeOut"],
  shatter: ["fadeOut"],
  glow: ["keepOriginal"],
};

const SUPPORTED_EDITOR_NAMES = ["victory_editor_v5_g", "VNI"] as const;

export interface ValidateCocosV5GProjectOptions {
  engineVersion?: "3.8.6";
}

export function assertV5GProject(value: unknown): V5GProjectConfig {
  const project = assertRecord(value, "V5G project");
  const schemaVersion = assertString(
    project.schemaVersion,
    "project.schemaVersion",
  );

  const editor = assertRecord(project.editor, "project.editor");
  const editorName = assertString(editor.name, "project.editor.name");
  const editorVersion = assertString(editor.version, "project.editor.version");

  const engineTarget = assertRecord(
    project.engineTarget,
    "project.engineTarget",
  );
  if (engineTarget.name !== "cocos_creator") {
    throw new Error("V5G project engineTarget.name must be cocos_creator.");
  }
  const engineTargetVersion = assertString(
    engineTarget.version,
    "project.engineTarget.version",
  );

  const projectName = assertString(project.name, "project.name");
  const exportProfile =
    project.exportProfile === undefined
      ? undefined
      : assertExportProfile(project.exportProfile, "project.exportProfile");

  const stage = assertRecord(project.stage, "project.stage");
  const stageWidth = assertNumber(stage.width, "project.stage.width");
  const stageHeight = assertNumber(stage.height, "project.stage.height");
  const stageCoordinate = assertString(
    stage.coordinate,
    "project.stage.coordinate",
  ) as V5GProjectConfig["stage"]["coordinate"];
  const stageDuration = assertNumber(stage.duration, "project.stage.duration");
  const stageBackgroundColor = assertString(
    stage.backgroundColor,
    "project.stage.backgroundColor",
  );

  const assets = assertArray(project.assets, "project.assets").map(
    (asset, index) => assertAsset(asset, index),
  );
  const layerGroups =
    project.layerGroups === undefined
      ? undefined
      : assertArray(project.layerGroups, "project.layerGroups").map(
          (group, index) => assertLayerGroup(group, index),
        );
  const layers = assertArray(project.layers, "project.layers").map(
    (layer, index) => assertLayer(layer, index),
  );
  const particles = assertArray(
    project.particles,
    "project.particles",
  ) as V5GProjectConfig["particles"];

  return normalizeVNIProjectLayerGroups({
    schemaVersion,
    editor: {
      name: editorName,
      version: editorVersion,
    },
    engineTarget: {
      name: "cocos_creator",
      version: engineTargetVersion,
    },
    name: projectName,
    exportProfile,
    stage: {
      width: stageWidth,
      height: stageHeight,
      coordinate: stageCoordinate,
      duration: stageDuration,
      backgroundColor: stageBackgroundColor,
    },
    assets,
    layerGroups,
    layers,
    particles,
  });
}

export function validateV5GProject(project: V5GProjectConfig): void {
  if (!isSupportedProjectSchemaVersion(project.schemaVersion)) {
    throw new Error(
      `Unsupported V5G schemaVersion: ${project.schemaVersion}. Expected V5G_0.x or VNI_0.x.`,
    );
  }
  if (!hasStringValue(SUPPORTED_EDITOR_NAMES, project.editor.name)) {
    throw new Error(`Unsupported V5G editor: ${project.editor.name}.`);
  }
  if (project.engineTarget.name !== "cocos_creator") {
    throw new Error(
      `Unsupported V5G engine target: ${project.engineTarget.name}.`,
    );
  }
  if (project.stage.coordinate !== "center") {
    throw new Error(
      `Unsupported V5G coordinate mode: ${project.stage.coordinate}.`,
    );
  }
  assertPositiveFinite(project.stage.width, "project.stage.width");
  assertPositiveFinite(project.stage.height, "project.stage.height");
  assertPositiveFinite(project.stage.duration, "project.stage.duration");
  parseColorHex(project.stage.backgroundColor);

  if (project.particles.length > 0) {
    throw new Error(
      "Unsupported V5G top-level particles: layer particle animations are supported, project.particles is not implemented.",
    );
  }
  if (project.exportProfile) {
    validateExportProfile(project.exportProfile, "project.exportProfile");
  }
  validateLayerGroups(project);

  const assetsById = new Map<string, V5GAssetConfig>();
  const assetPaths = new Set<string>();
  for (const asset of project.assets) {
    if (assetsById.has(asset.id)) {
      throw new Error(`Duplicate V5G asset id: ${asset.id}.`);
    }
    if (assetPaths.has(asset.path)) {
      throw new Error(`Duplicate V5G asset path: ${asset.path}.`);
    }
    if (asset.type !== "image") {
      throw new Error(`Unsupported V5G asset type: ${asset.type}.`);
    }
    assertPositiveFinite(asset.width, `asset "${asset.id}" width`);
    assertPositiveFinite(asset.height, `asset "${asset.id}" height`);
    validateAssetFileMetadata(asset);
    validateAssetProfileMetadata(asset, project.exportProfile);
    assetsById.set(asset.id, asset);
    assetPaths.add(asset.path);
  }

  const layerIds = new Set<string>();
  for (const layer of project.layers) {
    if (layerIds.has(layer.id)) {
      throw new Error(`Duplicate V5G layer id: ${layer.id}.`);
    }
    layerIds.add(layer.id);
    assertSupportedLayer(layer, assetsById);
    for (const animation of layer.animations) {
      assertSupportedAnimation(animation, layer.id, project.stage.duration);
    }
  }
  getVNIProjectRenderGroupOrder(project);
}

export function validateCocosV5GProject(
  project: V5GProjectConfig,
  options: ValidateCocosV5GProjectOptions = {},
): void {
  validateV5GProject(project);
  const expectedVersion = options.engineVersion ?? "3.8.6";
  if (project.engineTarget.version !== expectedVersion) {
    throw new Error(
      `Unsupported Cocos Creator version: ${project.engineTarget.version}. Expected ${expectedVersion}.`,
    );
  }

  for (const layer of project.layers) {
    if (layer.type !== "image") {
      throw new Error(`Unsupported Cocos V5G layer type: ${layer.type}.`);
    }
    for (const animation of layer.animations) {
      if (
        animation.enabled &&
        (animation.type === "shatter" || animation.type === "glow")
      ) {
        throw new Error(
          `Cocos runtime does not support VNI render effect animations yet: project "${project.name}", layer "${layer.id}", animation "${animation.id}", type "${animation.type}".`,
        );
      }
    }
  }
}

export function parseColorHex(value: string): number {
  if (!/^#[0-9a-fA-F]{6}$/u.test(value)) {
    throw new Error(`Invalid V5G background color: ${value}.`);
  }
  return Number.parseInt(value.slice(1), 16);
}

export function assertSupportedLayer(
  layer: V5GLayerConfig,
  assetsById = new Map<string, V5GAssetConfig>(),
): void {
  if (layer.parentId !== null) {
    throw new Error(`Unsupported V5G parentId on layer "${layer.id}".`);
  }
  if (layer.type === "group") {
    throw new Error("Unsupported V5G layer type: group");
  }
  if (layer.type !== "image" && layer.type !== "text") {
    throw new Error(`Unsupported V5G layer type: ${layer.type}.`);
  }
  if (layer.type === "image") {
    if (!layer.assetId) {
      throw new Error(`V5G image layer "${layer.id}" requires assetId.`);
    }
    const asset = assetsById.get(layer.assetId);
    if (!asset) {
      throw new Error(
        `V5G image layer "${layer.id}" references missing asset "${layer.assetId}".`,
      );
    }
    if (asset.type !== "image") {
      throw new Error(
        `V5G image layer "${layer.id}" asset "${asset.id}" must be image.`,
      );
    }
  }
  if (layer.type === "text" && layer.assetId !== null) {
    throw new Error(`V5G text layer "${layer.id}" must not reference assetId.`);
  }
  if ((layer.keyframes ?? []).length > 0) {
    throw new Error(`Unsupported V5G keyframes on layer "${layer.id}".`);
  }
  validateTransform(layer.transform, `layer "${layer.id}" transform`);
  assertFiniteRange(layer.opacity, 0, 1, `layer "${layer.id}" opacity`);
  if (!hasStringValue(SUPPORTED_BLEND_MODES, layer.blendMode)) {
    throw new Error(`Unsupported V5G blendMode: ${layer.blendMode}.`);
  }
}

function validateLayerGroups(project: V5GProjectConfig): void {
  if (project.layerGroups.length === 0) {
    throw new Error("VNI project.layerGroups must be a non-empty array.");
  }

  const groupIds = new Set<string>();
  const groupOrders = new Set<number>();
  for (const group of project.layerGroups) {
    if (groupIds.has(group.id)) {
      throw new Error(`Duplicate VNI layer group id: ${group.id}.`);
    }
    groupIds.add(group.id);
    if (!Number.isFinite(group.order)) {
      throw new Error(`VNI layer group "${group.id}" order must be finite.`);
    }
    if (groupOrders.has(group.order)) {
      throw new Error(`Duplicate VNI layer group order: ${group.order}.`);
    }
    groupOrders.add(group.order);
  }

  for (const layer of project.layers) {
    if (!layer.groupId) {
      throw new Error(`VNI layer "${layer.id}" is missing groupId.`);
    }
    if (!groupIds.has(layer.groupId)) {
      throw new Error(
        `VNI layer "${layer.id}" references missing layer group "${layer.groupId}".`,
      );
    }
  }
}

export function assertSupportedAnimation(
  animation: V5GAnimationConfig,
  layerId = "unknown",
  stageDuration = Number.POSITIVE_INFINITY,
): void {
  if (!isSupportedAnimationType(animation.type)) {
    throw new Error(`Unsupported V5G animation type: ${animation.type}`);
  }
  assertFiniteRange(
    animation.startTime,
    0,
    Number.POSITIVE_INFINITY,
    `animation "${animation.id}" startTime`,
  );
  assertPositiveFinite(
    animation.duration,
    `animation "${animation.id}" duration`,
  );
  if (animation.startTime + animation.duration > stageDuration) {
    throw new Error(
      `V5G animation "${animation.id}" on layer "${layerId}" exceeds stage.duration.`,
    );
  }
  const easing = animation.params.easing;
  if (easing !== undefined) {
    if (typeof easing !== "string" || !isSupportedEasing(easing)) {
      throw new Error(`Unsupported V5G easing: ${String(easing)}`);
    }
  } else {
    getDefaultEasing(animation.type);
  }

  for (const paramKey of REQUIRED_NUMERIC_PARAMS[animation.type]) {
    const value = animation.params[paramKey];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `V5G animation "${animation.id}" ${animation.type} requires numeric param "${paramKey}".`,
      );
    }
  }
  assertOptionalNumber(animation, "baseX");
  assertOptionalNumber(animation, "baseY");
  for (const paramKey of OPTIONAL_BOOLEAN_PARAMS[animation.type] ?? []) {
    assertOptionalBoolean(animation, paramKey);
  }
}

function assertAsset(value: unknown, index: number): V5GAssetConfig {
  const asset = assertRecord(value, `project.assets[${index}]`);
  return {
    id: assertString(asset.id, `project.assets[${index}].id`),
    type: assertString(
      asset.type,
      `project.assets[${index}].type`,
    ) as V5GAssetConfig["type"],
    path: assertString(asset.path, `project.assets[${index}].path`),
    originalName: assertString(
      asset.originalName,
      `project.assets[${index}].originalName`,
    ),
    width: assertNumber(asset.width, `project.assets[${index}].width`),
    height: assertNumber(asset.height, `project.assets[${index}].height`),
    fileWidth: assertOptionalNumberField(
      asset.fileWidth,
      `project.assets[${index}].fileWidth`,
    ),
    fileHeight: assertOptionalNumberField(
      asset.fileHeight,
      `project.assets[${index}].fileHeight`,
    ),
    fileScale: assertOptionalNumberField(
      asset.fileScale,
      `project.assets[${index}].fileScale`,
    ),
  };
}

function assertExportProfile(
  value: unknown,
  path: string,
): V5GExportProfileConfig {
  const profile = assertRecord(value, path);
  return {
    id: assertString(profile.id, `${path}.id`),
    purpose: assertString(
      profile.purpose,
      `${path}.purpose`,
    ) as V5GExportProfileConfig["purpose"],
    assetScale: assertNumber(profile.assetScale, `${path}.assetScale`),
    label:
      profile.label === undefined
        ? undefined
        : assertString(profile.label, `${path}.label`),
  };
}

function assertLayer(value: unknown, index: number): V5GLayerConfig {
  const layer = assertRecord(value, `project.layers[${index}]`);
  return {
    id: assertString(layer.id, `project.layers[${index}].id`),
    name: assertString(layer.name, `project.layers[${index}].name`),
    type: assertString(
      layer.type,
      `project.layers[${index}].type`,
    ) as V5GLayerConfig["type"],
    assetId:
      layer.assetId === null
        ? null
        : assertString(layer.assetId, `project.layers[${index}].assetId`),
    parentId:
      layer.parentId === null
        ? null
        : assertString(layer.parentId, `project.layers[${index}].parentId`),
    groupId:
      layer.groupId === undefined
        ? undefined
        : assertString(layer.groupId, `project.layers[${index}].groupId`),
    visible: assertBoolean(layer.visible, `project.layers[${index}].visible`),
    locked: assertBoolean(layer.locked, `project.layers[${index}].locked`),
    transform: assertTransform(
      layer.transform,
      `project.layers[${index}].transform`,
    ),
    opacity: assertNumber(layer.opacity, `project.layers[${index}].opacity`),
    blendMode: assertString(
      layer.blendMode,
      `project.layers[${index}].blendMode`,
    ) as V5GBlendMode,
    text:
      layer.text === undefined
        ? undefined
        : assertString(layer.text, `project.layers[${index}].text`),
    animations: assertArray(
      layer.animations,
      `project.layers[${index}].animations`,
    ).map((animation, animationIndex) =>
      assertAnimation(animation, index, animationIndex),
    ),
    keyframes: assertArray(
      layer.keyframes ?? [],
      `project.layers[${index}].keyframes`,
    ) as V5GLayerConfig["keyframes"],
  };
}

function assertLayerGroup(value: unknown, index: number): V5GLayerGroupConfig {
  const group = assertRecord(value, `project.layerGroups[${index}]`);
  return {
    id: assertString(group.id, `project.layerGroups[${index}].id`),
    name: assertString(group.name, `project.layerGroups[${index}].name`),
    visible: assertBoolean(
      group.visible,
      `project.layerGroups[${index}].visible`,
    ),
    collapsed: assertBoolean(
      group.collapsed,
      `project.layerGroups[${index}].collapsed`,
    ),
    order: assertNumber(group.order, `project.layerGroups[${index}].order`),
  };
}

function assertAnimation(
  value: unknown,
  layerIndex: number,
  animationIndex: number,
): V5GAnimationConfig {
  const animation = assertRecord(
    value,
    `project.layers[${layerIndex}].animations[${animationIndex}]`,
  );
  const params = assertRecord(
    animation.params,
    `project.layers[${layerIndex}].animations[${animationIndex}].params`,
  );
  return {
    id: assertString(
      animation.id,
      `project.layers[${layerIndex}].animations[${animationIndex}].id`,
    ),
    type: assertString(
      animation.type,
      `project.layers[${layerIndex}].animations[${animationIndex}].type`,
    ) as V5GAnimationConfig["type"],
    name:
      animation.name === undefined
        ? undefined
        : assertString(
            animation.name,
            `project.layers[${layerIndex}].animations[${animationIndex}].name`,
          ),
    startTime: assertNumber(
      animation.startTime,
      `project.layers[${layerIndex}].animations[${animationIndex}].startTime`,
    ),
    duration: assertNumber(
      animation.duration,
      `project.layers[${layerIndex}].animations[${animationIndex}].duration`,
    ),
    enabled: assertBoolean(
      animation.enabled,
      `project.layers[${layerIndex}].animations[${animationIndex}].enabled`,
    ),
    seed: assertNumber(
      animation.seed,
      `project.layers[${layerIndex}].animations[${animationIndex}].seed`,
    ),
    params: params as Record<string, V5GAnimationParamValue>,
  };
}

function assertTransform(value: unknown, path: string): V5GTransformConfig {
  const transform = assertRecord(value, path);
  return {
    x: assertNumber(transform.x, `${path}.x`),
    y: assertNumber(transform.y, `${path}.y`),
    scaleX: assertNumber(transform.scaleX, `${path}.scaleX`),
    scaleY: assertNumber(transform.scaleY, `${path}.scaleY`),
    rotation: assertNumber(transform.rotation, `${path}.rotation`),
    anchorX: assertNumber(transform.anchorX, `${path}.anchorX`),
    anchorY: assertNumber(transform.anchorY, `${path}.anchorY`),
  };
}

function validateTransform(transform: V5GTransformConfig, path: string): void {
  assertFinite(transform.x, `${path}.x`);
  assertFinite(transform.y, `${path}.y`);
  assertFinite(transform.scaleX, `${path}.scaleX`);
  assertFinite(transform.scaleY, `${path}.scaleY`);
  assertFinite(transform.rotation, `${path}.rotation`);
  assertFiniteRange(transform.anchorX, 0, 1, `${path}.anchorX`);
  assertFiniteRange(transform.anchorY, 0, 1, `${path}.anchorY`);
}

function assertOptionalNumber(
  animation: V5GAnimationConfig,
  key: string,
): void {
  const value = animation.params[key];
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a finite number.`,
    );
  }
}

function assertOptionalBoolean(
  animation: V5GAnimationConfig,
  key: string,
): void {
  const value = animation.params[key];
  if (value === undefined) return;
  if (typeof value !== "boolean") {
    throw new Error(
      `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a boolean.`,
    );
  }
}

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return value;
}

function assertOptionalNumberField(
  value: unknown,
  path: string,
): number | undefined {
  if (value === undefined) return undefined;
  return assertNumber(value, path);
}

function assertNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean.`);
  }
  return value;
}

function assertPositiveFinite(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
}

function assertFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
}

function assertFiniteRange(
  value: number,
  min: number,
  max: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${path} must be in range ${min}..${max}.`);
  }
}

function isSupportedProjectSchemaVersion(value: string): boolean {
  return /^V5G_0\.\d+$/u.test(value) || /^VNI_0\.\d+$/u.test(value);
}

function validateAssetFileMetadata(asset: V5GAssetConfig): void {
  const fields = [asset.fileWidth, asset.fileHeight, asset.fileScale];
  const presentCount = fields.filter((value) => value !== undefined).length;
  if (presentCount === 0) return;
  if (presentCount !== fields.length) {
    throw new Error(
      `V5G asset "${asset.id}" fileWidth/fileHeight/fileScale must be provided together.`,
    );
  }
  if (
    asset.fileWidth === undefined ||
    asset.fileHeight === undefined ||
    asset.fileScale === undefined
  ) {
    throw new Error(
      `V5G asset "${asset.id}" fileWidth/fileHeight/fileScale must be provided together.`,
    );
  }
  assertPositiveInteger(asset.fileWidth, `asset "${asset.id}" fileWidth`);
  assertPositiveInteger(asset.fileHeight, `asset "${asset.id}" fileHeight`);
  assertFiniteRange(
    asset.fileScale,
    Number.MIN_VALUE,
    1,
    `asset "${asset.id}" fileScale`,
  );

  const expectedFileWidth = Math.max(
    1,
    Math.round(asset.width * asset.fileScale),
  );
  const expectedFileHeight = Math.max(
    1,
    Math.round(asset.height * asset.fileScale),
  );
  if (
    asset.fileWidth !== expectedFileWidth ||
    asset.fileHeight !== expectedFileHeight
  ) {
    throw new Error(
      `V5G asset "${asset.id}" file size metadata mismatch: expected ${expectedFileWidth}x${expectedFileHeight} from logical ${asset.width}x${asset.height} at scale ${asset.fileScale}, got ${asset.fileWidth}x${asset.fileHeight}.`,
    );
  }
}

function validateExportProfile(
  profile: V5GExportProfileConfig,
  path: string,
): void {
  if (profile.id.length === 0) {
    throw new Error(`${path}.id must be a non-empty string.`);
  }
  if (profile.purpose !== "editing" && profile.purpose !== "runtime") {
    throw new Error(`${path}.purpose must be editing or runtime.`);
  }
  assertFiniteRange(
    profile.assetScale,
    Number.MIN_VALUE,
    1,
    `${path}.assetScale`,
  );
}

function validateAssetProfileMetadata(
  asset: V5GAssetConfig,
  profile: V5GExportProfileConfig | undefined,
): void {
  if (!profile) return;
  const hasFileMetadata =
    asset.fileWidth !== undefined &&
    asset.fileHeight !== undefined &&
    asset.fileScale !== undefined;
  if (!hasFileMetadata) {
    if (profile.assetScale < 1 || profile.purpose === "runtime") {
      throw new Error(
        `V5G asset "${asset.id}" must provide fileWidth/fileHeight/fileScale for exportProfile "${profile.id}".`,
      );
    }
    return;
  }
  if (asset.fileScale !== profile.assetScale) {
    throw new Error(
      `V5G asset "${asset.id}" fileScale ${asset.fileScale} does not match exportProfile.assetScale ${profile.assetScale}.`,
    );
  }
}

function assertPositiveInteger(value: number | undefined, path: string): void {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${path} must be an integer.`);
  }
}

function hasStringValue<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true;
  }
  return false;
}

export type SupportedCocosBlendMode = V5GBlendMode;

export type CocosBlendModeStrategy = "sprite-blend-state";

export type CocosBlendFactorName =
  | "ZERO"
  | "ONE"
  | "SRC_ALPHA"
  | "ONE_MINUS_SRC_ALPHA"
  | "SRC_COLOR"
  | "DST_COLOR"
  | "ONE_MINUS_SRC_COLOR";

export type CocosBlendOperationName = "ADD" | "MAX";

export interface CocosBlendChannelConfig {
  operation: CocosBlendOperationName;
  sourceFactor: CocosBlendFactorName;
  destinationFactor: CocosBlendFactorName;
}

export interface CocosBlendModeConfig {
  mode: SupportedCocosBlendMode;
  strategy: CocosBlendModeStrategy;
  color: CocosBlendChannelConfig;
  alpha: CocosBlendChannelConfig;
}

const NORMAL_ALPHA_BLEND: CocosBlendChannelConfig = {
  operation: "ADD",
  sourceFactor: "SRC_ALPHA",
  destinationFactor: "ONE_MINUS_SRC_ALPHA",
};

const BLEND_MODE_CONFIGS: Record<V5GBlendMode, CocosBlendModeConfig> = {
  normal: {
    mode: "normal",
    strategy: "sprite-blend-state",
    color: NORMAL_ALPHA_BLEND,
    alpha: NORMAL_ALPHA_BLEND,
  },
  add: {
    mode: "add",
    strategy: "sprite-blend-state",
    color: {
      operation: "ADD",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE",
    },
    alpha: NORMAL_ALPHA_BLEND,
  },
  screen: {
    mode: "screen",
    strategy: "sprite-blend-state",
    color: {
      operation: "ADD",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE_MINUS_SRC_COLOR",
    },
    alpha: NORMAL_ALPHA_BLEND,
  },
  multiply: {
    mode: "multiply",
    strategy: "sprite-blend-state",
    color: {
      operation: "ADD",
      sourceFactor: "DST_COLOR",
      destinationFactor: "ONE_MINUS_SRC_ALPHA",
    },
    alpha: NORMAL_ALPHA_BLEND,
  },
  lighten: {
    mode: "lighten",
    strategy: "sprite-blend-state",
    color: {
      operation: "MAX",
      sourceFactor: "SRC_ALPHA",
      destinationFactor: "ONE",
    },
    alpha: NORMAL_ALPHA_BLEND,
  },
};

export function getCocosBlendModeConfig(
  blendMode: V5GBlendMode,
): CocosBlendModeConfig {
  return BLEND_MODE_CONFIGS[blendMode];
}

export type V5GCocosNodeTransformSnapshot = unknown;

export interface V5GCocosNodeDriver<TNode, TSpriteFrame> {
  createNode(name: string): TNode;
  appendChild(parent: TNode, child: TNode): void;
  removeChild(parent: TNode, child: TNode): void;
  getParent(node: TNode): TNode | null;
  captureLocalTransform(node: TNode): V5GCocosNodeTransformSnapshot;
  restoreLocalTransform(
    node: TNode,
    snapshot: V5GCocosNodeTransformSnapshot,
  ): void;
  captureWorldTransform(node: TNode): V5GCocosNodeTransformSnapshot;
  restoreWorldTransform(
    node: TNode,
    snapshot: V5GCocosNodeTransformSnapshot,
  ): void;
  destroyNode(node: TNode): void;
  setContentSize(node: TNode, width: number, height: number): void;
  setAnchorPoint(node: TNode, x: number, y: number): void;
  setPosition(node: TNode, x: number, y: number): void;
  setScale(node: TNode, x: number, y: number): void;
  setRotationDegrees(node: TNode, degrees: number): void;
  setOpacity(node: TNode, opacity: number): void;
  setActive(node: TNode, active: boolean): void;
  createImageNode(name: string, spriteFrame: TSpriteFrame): TNode;
  getSpriteFrameSize(spriteFrame: TSpriteFrame): V5GSize | null;
  applyBlendMode(node: TNode, config: CocosBlendModeConfig): void;
}

interface ReadableSpriteFrameSize {
  width: number;
  height: number;
}

interface ReadableSpriteFrame {
  originalSize?: ReadableSpriteFrameSize;
  rect?: ReadableSpriteFrameSize;
  width?: number;
  height?: number;
  getOriginalSize?: () => ReadableSpriteFrameSize;
  getRect?: () => ReadableSpriteFrameSize;
}

interface CocosBlendTargetLike {
  blend: boolean;
  blendEq: number;
  blendAlphaEq: number;
  blendSrc: number;
  blendDst: number;
  blendSrcAlpha: number;
  blendDstAlpha: number;
}

interface CocosBlendStateLike {
  targets: CocosBlendTargetLike[];
  setTarget(index: number, target: CocosBlendTargetLike): void;
}

interface CocosPassLike {
  blendState: CocosBlendStateLike;
  _updatePassHash(): void;
}

interface CocosMaterialInstanceLike {
  passes: CocosPassLike[];
}

interface BlendableSprite {
  srcBlendFactor: number;
  dstBlendFactor: number;
  _srcBlendFactor?: number;
  _dstBlendFactor?: number;
  updateMaterial?: () => void;
  _updateBlendFunc?: () => void;
  getRenderMaterial?: (index: number) => CocosMaterialInstanceLike | null;
  getMaterialInstance?: (index: number) => CocosMaterialInstanceLike | null;
}

interface CocosLocalTransformSnapshot {
  position: Vec3;
  scale: Vec3;
  eulerAngles: Vec3;
}

interface CocosWorldTransformSnapshot {
  position: Vec3;
  scale: Vec3;
  rotation: Quat;
}

// Cocos Creator 3.8.6 exposes these enum values internally, but not all builds
// re-export BlendFactor / BlendOp from "cc".
const COCOS_BLEND_FACTORS: Record<CocosBlendFactorName, number> = {
  ZERO: 0,
  ONE: 1,
  SRC_ALPHA: 2,
  ONE_MINUS_SRC_ALPHA: 4,
  SRC_COLOR: 6,
  DST_COLOR: 7,
  ONE_MINUS_SRC_COLOR: 8,
};

const COCOS_BLEND_OPERATIONS: Record<CocosBlendOperationName, number> = {
  ADD: 0,
  MAX: 4,
};

export function createCocosNodeDriver(): V5GCocosNodeDriver<Node, SpriteFrame> {
  return {
    createNode(name) {
      return new Node(name);
    },
    appendChild(parent, child) {
      parent.addChild(child);
    },
    removeChild(parent, child) {
      if (child.parent === parent) {
        child.removeFromParent();
      }
    },
    getParent(node) {
      return node.parent;
    },
    captureLocalTransform(node) {
      return {
        position: copyVec3(node.position),
        scale: copyVec3(node.scale),
        eulerAngles: copyVec3(node.eulerAngles),
      };
    },
    restoreLocalTransform(node, snapshot) {
      const transform = requireLocalTransformSnapshot(snapshot);
      node.setPosition(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      node.setScale(transform.scale.x, transform.scale.y, transform.scale.z);
      node.setRotationFromEuler(
        transform.eulerAngles.x,
        transform.eulerAngles.y,
        transform.eulerAngles.z,
      );
    },
    captureWorldTransform(node) {
      return {
        position: node.getWorldPosition(new Vec3()),
        scale: node.getWorldScale(new Vec3()),
        rotation: node.getWorldRotation(new Quat()),
      };
    },
    restoreWorldTransform(node, snapshot) {
      const transform = requireWorldTransformSnapshot(snapshot);
      node.setWorldPosition(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      node.setWorldScale(
        transform.scale.x,
        transform.scale.y,
        transform.scale.z,
      );
      node.setWorldRotation(transform.rotation);
    },
    destroyNode(node) {
      node.removeFromParent();
      node.destroy();
    },
    setContentSize(node, width, height) {
      requireUITransform(node).setContentSize(width, height);
    },
    setAnchorPoint(node, x, y) {
      requireUITransform(node).setAnchorPoint(x, y);
    },
    setPosition(node, x, y) {
      node.setPosition(x, y, 0);
    },
    setScale(node, x, y) {
      node.setScale(x, y, 1);
    },
    setRotationDegrees(node, degrees) {
      node.setRotationFromEuler(0, 0, degrees);
    },
    setOpacity(node, opacity) {
      requireUIOpacity(node).opacity = opacity;
    },
    setActive(node, active) {
      node.active = active;
    },
    createImageNode(name, spriteFrame) {
      const node = new Node(name);
      const sprite = node.addComponent(Sprite);
      sprite.spriteFrame = spriteFrame;
      sprite.color = new Color(255, 255, 255, 255);
      return node;
    },
    getSpriteFrameSize(spriteFrame) {
      return readSpriteFrameSize(spriteFrame);
    },
    applyBlendMode(node, config) {
      applySpriteBlendMode(node.name, requireSprite(node), config);
    },
  };
}

function copyVec3(source: Vec3): Vec3 {
  return new Vec3(source.x, source.y, source.z);
}

function requireLocalTransformSnapshot(
  snapshot: V5GCocosNodeTransformSnapshot,
): CocosLocalTransformSnapshot {
  return snapshot as CocosLocalTransformSnapshot;
}

function requireWorldTransformSnapshot(
  snapshot: V5GCocosNodeTransformSnapshot,
): CocosWorldTransformSnapshot {
  return snapshot as CocosWorldTransformSnapshot;
}

function requireUITransform(node: Node): UITransform {
  return node.getComponent(UITransform) ?? node.addComponent(UITransform);
}

function requireUIOpacity(node: Node): UIOpacity {
  return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
}

function requireSprite(node: Node): Sprite {
  const sprite = node.getComponent(Sprite);
  if (!sprite) {
    throw new Error(
      `Cocos node "${node.name}" does not have a Sprite component.`,
    );
  }
  return sprite;
}

function applySpriteBlendMode(
  nodeName: string,
  sprite: Sprite,
  config: CocosBlendModeConfig,
): void {
  if (config.strategy !== "sprite-blend-state") {
    throw new Error(
      `Unsupported Cocos blend strategy "${config.strategy}" for V5G blend mode "${config.mode}" on node "${nodeName}".`,
    );
  }

  if (config.mode === "normal") {
    return;
  }

  const blendable = sprite as Sprite & Partial<BlendableSprite>;
  setSpriteBlendFactors(
    nodeName,
    blendable,
    getCocosBlendFactor(config.color.sourceFactor, config.mode),
    getCocosBlendFactor(config.color.destinationFactor, config.mode),
    config.mode,
  );

  if (typeof blendable.updateMaterial === "function") {
    blendable.updateMaterial();
  } else if (typeof blendable._updateBlendFunc === "function") {
    blendable._updateBlendFunc();
  } else {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" cannot update material blend state for V5G blend mode "${config.mode}".`,
    );
  }

  const pass = getCocosSpriteBlendPass(nodeName, blendable, config.mode);
  const target = pass.blendState.targets[0];
  if (!target) {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" has no blend target for V5G blend mode "${config.mode}".`,
    );
  }

  target.blend = true;
  target.blendEq = getCocosBlendOperation(config.color.operation, config.mode);
  target.blendAlphaEq = getCocosBlendOperation(
    config.alpha.operation,
    config.mode,
  );
  target.blendSrc = getCocosBlendFactor(config.color.sourceFactor, config.mode);
  target.blendDst = getCocosBlendFactor(
    config.color.destinationFactor,
    config.mode,
  );
  target.blendSrcAlpha = getCocosBlendFactor(
    config.alpha.sourceFactor,
    config.mode,
  );
  target.blendDstAlpha = getCocosBlendFactor(
    config.alpha.destinationFactor,
    config.mode,
  );
  pass.blendState.setTarget(0, target);
  pass._updatePassHash();
}

function setSpriteBlendFactors(
  nodeName: string,
  sprite: Partial<BlendableSprite>,
  sourceFactor: number,
  destinationFactor: number,
  blendMode: string,
): void {
  if ("srcBlendFactor" in sprite && "dstBlendFactor" in sprite) {
    sprite.srcBlendFactor = sourceFactor;
    sprite.dstBlendFactor = destinationFactor;
    return;
  }
  if ("_srcBlendFactor" in sprite && "_dstBlendFactor" in sprite) {
    sprite._srcBlendFactor = sourceFactor;
    sprite._dstBlendFactor = destinationFactor;
    return;
  }
  throw new Error(
    `Cocos Sprite on node "${nodeName}" does not expose blend factor fields required for V5G blend mode "${blendMode}".`,
  );
}

function getCocosSpriteBlendPass(
  nodeName: string,
  sprite: Partial<BlendableSprite>,
  blendMode: string,
): CocosPassLike {
  if (
    typeof sprite.getMaterialInstance !== "function" &&
    typeof sprite.getRenderMaterial !== "function"
  ) {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" cannot provide a material instance for V5G blend mode "${blendMode}".`,
    );
  }
  const material =
    sprite.getMaterialInstance?.(0) ?? sprite.getRenderMaterial?.(0);
  const pass = material?.passes[0];
  if (!pass) {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" has no material pass for V5G blend mode "${blendMode}".`,
    );
  }
  if (
    !pass.blendState ||
    !Array.isArray(pass.blendState.targets) ||
    typeof pass.blendState.setTarget !== "function"
  ) {
    throw new Error(
      `Cocos Sprite material on node "${nodeName}" has no mutable blend state for V5G blend mode "${blendMode}".`,
    );
  }
  if (typeof pass._updatePassHash !== "function") {
    throw new Error(
      `Cocos Sprite material on node "${nodeName}" cannot refresh pass hash for V5G blend mode "${blendMode}".`,
    );
  }
  return pass;
}

function getCocosBlendFactor(
  factor: CocosBlendFactorName,
  blendMode: string,
): number {
  const cocosFactor = COCOS_BLEND_FACTORS[factor];
  if (cocosFactor === undefined) {
    throw new Error(
      `Unsupported Cocos blend factor "${factor}" for V5G blend mode "${blendMode}".`,
    );
  }
  return cocosFactor;
}

function getCocosBlendOperation(
  operation: CocosBlendOperationName,
  blendMode: string,
): number {
  const cocosOperation = COCOS_BLEND_OPERATIONS[operation];
  if (cocosOperation === undefined) {
    throw new Error(
      `Unsupported Cocos blend operation "${operation}" for V5G blend mode "${blendMode}".`,
    );
  }
  return cocosOperation;
}

function readSpriteFrameSize(spriteFrame: SpriteFrame): V5GSize | null {
  const readable = spriteFrame as ReadableSpriteFrame;
  const fromMethod = readable.getOriginalSize?.() ?? readable.getRect?.();
  if (isReadableSize(fromMethod)) return fromMethod;
  if (isReadableSize(readable.originalSize)) return readable.originalSize;
  if (isReadableSize(readable.rect)) return readable.rect;
  if (
    typeof readable.width === "number" &&
    Number.isFinite(readable.width) &&
    typeof readable.height === "number" &&
    Number.isFinite(readable.height)
  ) {
    return {
      width: readable.width,
      height: readable.height,
    };
  }
  return null;
}

function isReadableSize(value: unknown): value is ReadableSpriteFrameSize {
  if (typeof value !== "object" || value === null) return false;
  const size = value as Partial<ReadableSpriteFrameSize>;
  return (
    typeof size.width === "number" &&
    Number.isFinite(size.width) &&
    typeof size.height === "number" &&
    Number.isFinite(size.height)
  );
}

export type V5GPlaybackRange =
  | { unit: "time"; start: number; end?: number }
  | { unit: "frame"; start: number; end?: number; fps: number };

export type V5GPlaybackPoint =
  | { unit: "time"; at: number }
  | { unit: "frame"; at: number; fps: number };

export interface V5GPlayRangeOptions {
  range: V5GPlaybackRange;
  loop?: boolean;
}

export interface V5GTimelinePlayOptions {
  mode?: "timeline";
}

export interface V5GRangePlayOptions extends V5GPlayRangeOptions {
  mode: "range";
}

export interface V5GSegmentedPlaybackOptions {
  mode: "segmented";
  loopStart: V5GPlaybackPoint;
  loopEnd: V5GPlaybackPoint;
  keepParticlesAlive?: boolean;
}

export type V5GPlayOptions =
  | V5GTimelinePlayOptions
  | V5GRangePlayOptions
  | V5GSegmentedPlaybackOptions;

export type V5GPlaybackMode = "timeline" | "range" | "segmented";

export type V5GSegmentedPlaybackPhase =
  | "idle"
  | "start"
  | "loop"
  | "ending"
  | "particle-draining"
  | "complete";

export interface V5GPlaybackState {
  mode: V5GPlaybackMode;
  phase: V5GSegmentedPlaybackPhase;
  currentTime: number;
  isPlaying: boolean;
  isDrainingParticles: boolean;
  liveParticleCount: number;
  loopIndex: number;
  keepParticlesAlive: boolean;
}

export interface V5GNormalizedPlaybackRange {
  startTime: number;
  endTime: number;
}

export interface V5GNormalizedSegmentedPlayback {
  loopStartTime: number;
  loopEndTime: number;
  duration: number;
  keepParticlesAlive: boolean;
}

export interface V5GSegmentedAdvanceResult {
  previousTime: number;
  currentTime: number;
  phase: V5GSegmentedPlaybackPhase;
  loopIndex: number;
  timelineEnded: boolean;
}

export class V5GSegmentedPlaybackSequence {
  private readonly loopStartTime: number;
  private readonly loopEndTime: number;
  private readonly duration: number;
  readonly keepParticlesAlive: boolean;
  private phase: V5GSegmentedPlaybackPhase = "start";
  private currentTime = 0;
  private loopIndex = 0;
  private endRequested = false;
  private loopElapsedTime = 0;

  constructor(config: V5GNormalizedSegmentedPlayback) {
    this.loopStartTime = config.loopStartTime;
    this.loopEndTime = config.loopEndTime;
    this.duration = config.duration;
    this.keepParticlesAlive = config.keepParticlesAlive;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getPhase(): V5GSegmentedPlaybackPhase {
    return this.phase;
  }

  getLoopIndex(): number {
    return this.loopIndex;
  }

  getLoopStartTime(): number {
    return this.loopStartTime;
  }

  getLoopEndTime(): number {
    return this.loopEndTime;
  }

  getLoopElapsedTime(): number {
    return this.loopElapsedTime;
  }

  requestEnd(): void {
    if (this.phase !== "start" && this.phase !== "loop") {
      throw new Error(
        `Cannot request segmented playback end while phase is "${this.phase}".`,
      );
    }
    this.endRequested = true;
    if (this.phase === "loop") {
      this.phase = "ending";
      this.currentTime = this.loopEndTime;
    }
  }

  advance(deltaSeconds: number): V5GSegmentedAdvanceResult {
    assertPlaybackPositiveFinite(
      deltaSeconds,
      "segmented playback deltaSeconds",
    );
    const previousTime = this.currentTime;
    let remaining = deltaSeconds;
    let timelineEnded = false;

    while (remaining > 0 && !timelineEnded) {
      if (this.phase === "start") {
        const timeToLoopStart = this.loopStartTime - this.currentTime;
        if (remaining < timeToLoopStart) {
          this.currentTime += remaining;
          remaining = 0;
        } else {
          remaining -= Math.max(timeToLoopStart, 0);
          this.currentTime = this.loopStartTime;
          if (this.endRequested) {
            this.phase = "ending";
            this.currentTime = this.loopEndTime;
          } else {
            this.phase = "loop";
          }
        }
      } else if (this.phase === "loop") {
        if (this.endRequested) {
          this.phase = "ending";
          this.currentTime = this.loopEndTime;
          continue;
        }
        this.loopElapsedTime += remaining;
        if (this.loopStartTime === this.loopEndTime) {
          this.currentTime = this.loopStartTime;
          remaining = 0;
        } else {
          const span = this.loopEndTime - this.loopStartTime;
          const advanced = this.currentTime + remaining;
          if (advanced < this.loopEndTime) {
            this.currentTime = advanced;
            remaining = 0;
          } else {
            const overflow = advanced - this.loopEndTime;
            this.loopIndex += 1 + Math.floor(overflow / span);
            this.currentTime = this.loopStartTime + (overflow % span);
            remaining = 0;
          }
        }
      } else if (this.phase === "ending") {
        const timeToEnd = this.duration - this.currentTime;
        if (remaining < timeToEnd) {
          this.currentTime += remaining;
          remaining = 0;
        } else {
          this.currentTime = this.duration;
          this.phase = "particle-draining";
          timelineEnded = true;
          remaining = 0;
        }
      } else {
        remaining = 0;
      }
    }

    return {
      previousTime,
      currentTime: this.currentTime,
      phase: this.phase,
      loopIndex: this.loopIndex,
      timelineEnded,
    };
  }

  markParticleDrainComplete(): void {
    if (this.phase === "particle-draining") {
      this.phase = "complete";
    }
  }
}

export function normalizePlaybackRange(
  range: V5GPlaybackRange,
  duration: number,
): V5GNormalizedPlaybackRange {
  if (range.unit === "time") {
    const startTime = assertFiniteNumber(range.start, "playback range start");
    const endTime = normalizeOptionalEnd(
      range.end,
      duration,
      "playback range end",
    );
    assertNormalizedRange(startTime, endTime, duration);
    return { startTime, endTime };
  }
  const fps = assertPlaybackPositiveFinite(range.fps, "playback range fps");
  const startFrame = assertNonNegativeInteger(
    range.start,
    "playback range start frame",
  );
  const endTime =
    range.end === undefined || range.end === -1
      ? duration
      : assertNonNegativeInteger(range.end, "playback range end frame") / fps;
  const startTime = startFrame / fps;
  assertNormalizedRange(startTime, endTime, duration);
  return { startTime, endTime };
}

export function normalizePlaybackPoint(
  point: V5GPlaybackPoint,
  duration: number,
  path: string,
): number {
  const time =
    point.unit === "time"
      ? assertFiniteNumber(point.at, `${path} time`)
      : assertNonNegativeInteger(point.at, `${path} frame`) /
        assertPlaybackPositiveFinite(point.fps, `${path} fps`);
  if (time < 0 || time > duration) {
    throw new Error(`${path} must be within project duration.`);
  }
  return time;
}

export function normalizeSegmentedPlaybackOptions(
  options: V5GSegmentedPlaybackOptions,
  duration: number,
): V5GNormalizedSegmentedPlayback {
  const loopStartTime = normalizePlaybackPoint(
    options.loopStart,
    duration,
    "segmented loopStart",
  );
  const loopEndTime = normalizePlaybackPoint(
    options.loopEnd,
    duration,
    "segmented loopEnd",
  );
  if (loopStartTime > loopEndTime) {
    throw new Error(
      `Invalid V5G segmented playback: expected 0 <= loopStart <= loopEnd <= ${duration}, got ${loopStartTime}..${loopEndTime}.`,
    );
  }
  return {
    loopStartTime,
    loopEndTime,
    duration,
    keepParticlesAlive: options.keepParticlesAlive ?? true,
  };
}

function assertPlaybackPositiveFinite(value: number, path: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
  return value;
}

export interface V5GParticleRuntimeLayer {
  layer: V5GLayerConfig;
  sampledLayer: ParticleLayerSampleState & {
    hasActiveParticleAnimation?: boolean;
  };
  textureSize: TextureSize;
}

export interface V5GLiveParticleSpriteSample extends ParticleSpriteSample {
  x: number;
  y: number;
}

export interface V5GParticleRuntimeFrame {
  particles: V5GLiveParticleSpriteSample[];
  isDraining: boolean;
  isComplete: boolean;
}

interface V5GLiveParticleAnimationLayer extends V5GParticleRuntimeLayer {
  runtimeStates: ParticleAnimationRuntimeState[];
}

export class V5GParticleRuntime {
  private lastParticles: V5GLiveParticleSpriteSample[] = [];
  private liveAnimationElapsedByKey = new Map<string, number>();
  private draining = false;
  private drainElapsed = 0;
  private drainDuration = 0;
  private readonly maxDrainDuration: number;

  constructor(projectLayers: readonly V5GLayerConfig[]) {
    this.maxDrainDuration = getMaxParticleDrainDuration(projectLayers);
  }

  reset(): void {
    this.lastParticles = [];
    this.liveAnimationElapsedByKey.clear();
    this.draining = false;
    this.drainElapsed = 0;
    this.drainDuration = 0;
  }

  emit(
    layers: readonly V5GParticleRuntimeLayer[],
    time: number,
  ): V5GParticleRuntimeFrame {
    this.liveAnimationElapsedByKey.clear();
    this.draining = false;
    this.drainElapsed = 0;
    this.drainDuration = 0;
    const particles = sampleLiveParticleSprites(layers, time);
    this.lastParticles = particles;
    return {
      particles,
      isDraining: false,
      isComplete: false,
    };
  }

  emitLive(
    layers: readonly V5GParticleRuntimeLayer[],
    configTime: number,
    deltaSeconds: number,
  ): V5GParticleRuntimeFrame {
    this.draining = false;
    this.drainElapsed = 0;
    this.drainDuration = 0;
    const liveLayers = this.prepareLiveParticleLayers(
      layers,
      configTime,
      deltaSeconds,
    );
    const particles = sampleLiveParticleSpritesForRuntime(liveLayers);
    this.lastParticles = particles;
    return {
      particles,
      isDraining: false,
      isComplete: false,
    };
  }

  beginDrain(): V5GParticleRuntimeFrame {
    this.liveAnimationElapsedByKey.clear();
    if (this.lastParticles.length === 0 || this.maxDrainDuration <= 0) {
      this.reset();
      return {
        particles: [],
        isDraining: false,
        isComplete: true,
      };
    }
    this.draining = true;
    this.drainElapsed = 0;
    this.drainDuration = this.maxDrainDuration;
    return {
      particles: this.lastParticles,
      isDraining: true,
      isComplete: false,
    };
  }

  advanceDrain(deltaSeconds: number): V5GParticleRuntimeFrame {
    if (!this.draining) {
      return {
        particles: this.lastParticles,
        isDraining: false,
        isComplete: this.lastParticles.length === 0,
      };
    }
    this.drainElapsed += deltaSeconds;
    const ratio = this.drainElapsed / this.drainDuration;
    if (ratio >= 1) {
      this.reset();
      return {
        particles: [],
        isDraining: false,
        isComplete: true,
      };
    }
    const alphaMultiplier = Math.max(0, 1 - ratio);
    return {
      particles: this.lastParticles
        .map((particle) => ({
          ...particle,
          alpha: particle.alpha * alphaMultiplier,
        }))
        .filter((particle) => particle.alpha > 0.002),
      isDraining: true,
      isComplete: false,
    };
  }

  isDraining(): boolean {
    return this.draining;
  }

  getLiveParticleCount(): number {
    return this.lastParticles.length;
  }

  private prepareLiveParticleLayers(
    layers: readonly V5GParticleRuntimeLayer[],
    configTime: number,
    deltaSeconds: number,
  ): V5GLiveParticleAnimationLayer[] {
    const nextActiveKeys = new Set<string>();
    const liveLayers: V5GLiveParticleAnimationLayer[] = [];
    for (const entry of layers) {
      const runtimeStates: ParticleAnimationRuntimeState[] = [];
      for (const animation of entry.layer.animations) {
        if (!animation.enabled || !isParticleAnimationType(animation.type)) {
          continue;
        }
        const configProgress = getParticleProgress(animation, configTime);
        if (configProgress === null || configProgress <= 0) continue;
        const key = getLiveAnimationKey(entry.layer.id, animation.id);
        const configuredElapsed = Math.max(0, configTime - animation.startTime);
        const previousElapsed = this.liveAnimationElapsedByKey.get(key);
        const elapsed =
          previousElapsed === undefined
            ? configuredElapsed
            : Math.max(
                configuredElapsed,
                previousElapsed + Math.max(0, deltaSeconds),
              );
        this.liveAnimationElapsedByKey.set(key, elapsed);
        nextActiveKeys.add(key);
        runtimeStates.push({
          animationId: animation.id,
          elapsed,
        });
      }
      if (runtimeStates.length > 0) {
        liveLayers.push({ ...entry, runtimeStates });
      }
    }
    for (const key of this.liveAnimationElapsedByKey.keys()) {
      if (!nextActiveKeys.has(key)) {
        this.liveAnimationElapsedByKey.delete(key);
      }
    }
    return liveLayers;
  }
}

export function sampleLiveParticleSprites(
  layers: readonly V5GParticleRuntimeLayer[],
  time: number,
): V5GLiveParticleSpriteSample[] {
  const particles: V5GLiveParticleSpriteSample[] = [];
  for (const entry of layers) {
    if (entry.sampledLayer.hasActiveParticleAnimation === false) continue;
    for (const particle of sampleParticleSpritesForLayer(
      entry.layer,
      entry.sampledLayer,
      entry.textureSize,
      time,
    )) {
      particles.push({
        ...particle,
        x: entry.sampledLayer.transform.x + particle.offsetX,
        y: entry.sampledLayer.transform.y - particle.offsetY,
      });
    }
  }
  return particles;
}

function sampleLiveParticleSpritesForRuntime(
  layers: readonly V5GLiveParticleAnimationLayer[],
): V5GLiveParticleSpriteSample[] {
  const particles: V5GLiveParticleSpriteSample[] = [];
  for (const entry of layers) {
    if (entry.sampledLayer.hasActiveParticleAnimation === false) continue;
    for (const particle of sampleParticleSpritesForLayerRuntime(
      entry.layer,
      entry.sampledLayer,
      entry.textureSize,
      entry.runtimeStates,
    )) {
      particles.push({
        ...particle,
        x: entry.sampledLayer.transform.x + particle.offsetX,
        y: entry.sampledLayer.transform.y - particle.offsetY,
      });
    }
  }
  return particles;
}

function normalizeOptionalEnd(
  value: number | undefined,
  duration: number,
  path: string,
): number {
  if (value === undefined || value === -1) return duration;
  return assertFiniteNumber(value, path);
}

function assertNormalizedRange(
  startTime: number,
  endTime: number,
  duration: number,
): void {
  if (startTime < 0 || !(startTime < endTime) || endTime > duration) {
    throw new Error(
      `Invalid V5G playback range: expected 0 <= start < end <= ${duration}, got ${startTime}..${endTime}.`,
    );
  }
}

function assertFiniteNumber(value: number, path: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, path: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative integer.`);
  }
  return value;
}

function getLiveAnimationKey(layerId: string, animationId: string): string {
  return `${layerId}\u0000${animationId}`;
}

function getMaxParticleDrainDuration(
  layers: readonly V5GLayerConfig[],
): number {
  let maxDuration = 0;
  for (const layer of layers) {
    for (const animation of layer.animations) {
      if (!animation.enabled || !isParticleAnimationType(animation.type)) {
        continue;
      }
      maxDuration = Math.max(maxDuration, getParticleDrainDuration(animation));
    }
  }
  return maxDuration;
}

function getParticleDrainDuration(animation: V5GAnimationConfig): number {
  if (animation.type === "particle_wall") {
    return getNumberParam(animation, "lifetimeMax");
  }
  if (animation.type === "particle_twinkle") {
    return getNumberParam(animation, "twinkleDuration");
  }
  if (animation.type === "particle_combo") {
    return Math.max(animation.duration, 0);
  }
  return Math.max(animation.duration, 0);
}

export interface V5GCocosAssetResolver<TSpriteFrame = SpriteFrame> {
  getSpriteFrame(assetPath: string, assetId: string): TSpriteFrame | null;
}

export interface V5GCocosSpriteAtlasLike<TSpriteFrame = SpriteFrame> {
  getSpriteFrame(name: string): TSpriteFrame | null;
}

export interface V5GCocosSpriteAtlasAssetSource<TSpriteFrame = SpriteFrame> {
  atlas: V5GCocosSpriteAtlasLike<TSpriteFrame>;
}

export type V5GCocosAssetSource<TSpriteFrame = SpriteFrame> =
  | V5GCocosAssetResolver<TSpriteFrame>
  | V5GCocosSpriteAtlasAssetSource<TSpriteFrame>;

export interface V5GCocosPlayerOptions<
  TNode = Node,
  TSpriteFrame = SpriteFrame,
> {
  root: TNode;
  project: V5GProjectConfig;
  assets: V5GCocosAssetSource<TSpriteFrame>;
  driver: V5GCocosNodeDriver<TNode, TSpriteFrame>;
  loop?: boolean;
  onTimeChange?: (time: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

export type V5GCocosPlayerFactoryOptions = Omit<
  V5GCocosPlayerOptions<Node, SpriteFrame>,
  "driver"
>;

export type V5GCocosPlaybackRange = V5GPlaybackRange;

export type V5GCocosPlayRangeOptions = V5GPlayRangeOptions;

export type V5GCocosPlaybackPoint = V5GPlaybackPoint;

export type V5GCocosPlaybackMode = V5GPlaybackMode;

export type V5GCocosSegmentedPlaybackPhase = V5GSegmentedPlaybackPhase;

export type V5GCocosSegmentedPlaybackOptions = V5GSegmentedPlaybackOptions;

export type V5GCocosPlayOptions = V5GPlayOptions;

export type V5GCocosPlaybackState = V5GPlaybackState;

export interface V5GCocosLayerGroupInfo {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  layerIds: readonly string[];
  renderIndex: number;
}

export type V5GCocosLayerGroupSlot = VNILayerGroupSlot;

export interface V5GCocosAttachNodeBetweenLayerGroupsOptions<TNode = Node> {
  id?: string;
  ids?: readonly string[];
  afterGroupId: string;
  beforeGroupId: string;
  node?: TNode;
  nodes?: readonly TNode[];
  destroyOnDetach?: boolean;
}

export interface V5GCocosAttachProjectAssetBetweenLayerGroupsOptions {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  assetId: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: V5GBlendMode;
  destroyOnDetach?: boolean;
}

export interface V5GCocosAttachSpriteFrameBetweenLayerGroupsOptions<
  TSpriteFrame = SpriteFrame,
> {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  spriteFrame: TSpriteFrame;
  width: number;
  height: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: V5GBlendMode;
  destroyOnDetach?: boolean;
}

export interface V5GCocosPlaybackEventContext {
  id: string;
  time: number;
  previousTime: number;
  currentTime: number;
  loopIndex: number;
}

export interface V5GCocosPlaybackEventOptions {
  id: string;
  at: V5GCocosPlaybackPoint;
  once?: boolean;
  listener: (event: V5GCocosPlaybackEventContext) => void;
}

export interface V5GCocosPlaybackCompleteContext {
  startTime: number;
  endTime: number;
  currentTime: number;
  loopIndex: number;
}

interface ManagedLayer<TNode, TSpriteFrame> {
  layer: V5GLayerConfig;
  asset: V5GAssetConfig;
  node: TNode;
  particleContainer: TNode;
  particleNodes: TNode[];
  spriteFrame: TSpriteFrame;
}

interface PlaybackBoundary {
  startTime: number;
  endTime: number;
  loop: boolean;
}

interface NormalizedPlaybackEvent {
  id: string;
  time: number;
  once: boolean;
  order: number;
  listener: (event: V5GCocosPlaybackEventContext) => void;
}

interface PlaybackFrameOptions {
  liveParticles?: boolean;
  liveParticleDeltaSeconds?: number;
}

interface ResolvedSpriteFrame<TSpriteFrame> {
  spriteFrame: TSpriteFrame;
  shouldValidateSize: boolean;
}

interface MountedNodeRecord<TNode> {
  id: string | null;
  node: TNode;
  slotNode: TNode;
  originalParent: TNode | null;
  originalLocalTransform: V5GCocosNodeTransformSnapshot;
  destroyOnDetach: boolean;
  version: number;
}

interface NormalizedMountedNode<TNode> {
  id: string | null;
  node: TNode;
}

interface MountedImageNodeOptions {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: V5GBlendMode;
}

const SIZE_EPSILON = 0.01;
const PLAYBACK_EPSILON = 1e-9;

function getExpectedSpriteFrameSize(asset: V5GAssetConfig): {
  width: number;
  height: number;
} {
  return {
    width: asset.fileWidth ?? asset.width,
    height: asset.fileHeight ?? asset.height,
  };
}

export class V5GCocosPlayer<TNode = Node, TSpriteFrame = SpriteFrame> {
  private readonly options: V5GCocosPlayerOptions<TNode, TSpriteFrame>;
  private readonly layers = new Map<
    string,
    ManagedLayer<TNode, TSpriteFrame>
  >();
  private layerGroups: readonly VNIRenderGroupInfo[] = [];
  private layerGroupSlots: readonly VNILayerGroupSlot[] = [];
  private readonly groupNodesById = new Map<string, TNode>();
  private readonly slotNodesByKey = new Map<string, TNode>();
  private readonly mountedNodesById = new Map<
    string,
    MountedNodeRecord<TNode>
  >();
  private readonly mountedNodesByNode = new Map<
    TNode,
    MountedNodeRecord<TNode>
  >();
  private readonly particleRuntime: V5GParticleRuntime;
  private stageNode: TNode | null = null;
  private contentNode: TNode | null = null;
  private particleRootNode: TNode | null = null;
  private currentTime = 0;
  private isPlaying = false;
  private loop: boolean;
  private playbackMode: V5GCocosPlaybackMode = "timeline";
  private playbackPhase: V5GCocosSegmentedPlaybackPhase = "idle";
  private activeRange: PlaybackBoundary | null = null;
  private segmentedPlayback: V5GSegmentedPlaybackSequence | null = null;
  private pendingComplete: V5GCocosPlaybackCompleteContext | null = null;
  private drainPaused = false;
  private readonly playbackEvents = new Map<string, NormalizedPlaybackEvent>();
  private readonly completeListeners = new Set<
    (event: V5GCocosPlaybackCompleteContext) => void
  >();
  private loopIndex = 0;
  private nextPlaybackEventOrder = 0;

  constructor(options: V5GCocosPlayerOptions<TNode, TSpriteFrame>) {
    this.options = options;
    this.loop = options.loop ?? true;
    this.particleRuntime = new V5GParticleRuntime(options.project.layers);
  }

  get time(): number {
    return this.currentTime;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  init(): void {
    this.destroyManagedNodes();
    this.resetPlaybackRuntime();
    validateCocosV5GProject(this.options.project);
    this.layerGroups = getVNIProjectRenderGroupOrder(this.options.project);
    this.layerGroupSlots = getVNIProjectLayerGroupSlots(this.options.project);

    const driver = this.options.driver;
    const project = this.options.project;
    const stage = driver.createNode("V5G Stage");

    try {
      driver.setContentSize(stage, project.stage.width, project.stage.height);
      driver.setAnchorPoint(stage, 0.5, 0.5);

      const content = driver.createNode("V5G Content");
      driver.setContentSize(content, project.stage.width, project.stage.height);
      driver.setAnchorPoint(content, 0.5, 0.5);
      driver.appendChild(stage, content);
      this.contentNode = content;

      const particleRoot = driver.createNode("V5G Particles");
      driver.setContentSize(
        particleRoot,
        project.stage.width,
        project.stage.height,
      );
      driver.setAnchorPoint(particleRoot, 0.5, 0.5);
      driver.appendChild(stage, particleRoot);
      this.particleRootNode = particleRoot;

      const assetsById = new Map(
        project.assets.map((asset) => [asset.id, asset]),
      );
      const layersById = new Map(
        project.layers.map((layer) => [layer.id, layer] as const),
      );
      for (const group of this.layerGroups) {
        const groupNode = driver.createNode(`V5G Group ${group.id}`);
        driver.setContentSize(
          groupNode,
          project.stage.width,
          project.stage.height,
        );
        driver.setAnchorPoint(groupNode, 0.5, 0.5);
        driver.appendChild(content, groupNode);
        this.groupNodesById.set(group.id, groupNode);

        for (const layerId of group.layerIds) {
          const layer = layersById.get(layerId);
          if (!layer) {
            throw new Error(`Missing V5G layer for render group: ${layerId}.`);
          }
          const asset = this.requireImageAsset(layer, assetsById);
          const resolvedSpriteFrame = this.resolveSpriteFrame(asset);
          const spriteFrame = resolvedSpriteFrame.spriteFrame;
          if (resolvedSpriteFrame.shouldValidateSize) {
            this.assertSpriteFrameSize(asset, spriteFrame);
          }

          const node = driver.createImageNode(layer.name, spriteFrame);
          driver.setContentSize(node, asset.width, asset.height);
          driver.setAnchorPoint(
            node,
            layer.transform.anchorX,
            layer.transform.anchorY,
          );
          driver.applyBlendMode(node, getCocosBlendModeConfig(layer.blendMode));
          driver.appendChild(groupNode, node);

          const particleContainer = driver.createNode(
            `${layer.name} Particles`,
          );
          driver.setContentSize(
            particleContainer,
            project.stage.width,
            project.stage.height,
          );
          driver.setAnchorPoint(particleContainer, 0.5, 0.5);
          driver.appendChild(groupNode, particleContainer);

          this.layers.set(layer.id, {
            layer,
            asset,
            node,
            particleContainer,
            particleNodes: [],
            spriteFrame,
          });
        }

        const slot = this.layerGroupSlots.find(
          (candidate) => candidate.afterGroupId === group.id,
        );
        if (slot) {
          const slotNode = driver.createNode(
            `V5G Slot ${slot.afterGroupId} -> ${slot.beforeGroupId}`,
          );
          driver.setContentSize(
            slotNode,
            project.stage.width,
            project.stage.height,
          );
          driver.setAnchorPoint(slotNode, 0.5, 0.5);
          driver.appendChild(content, slotNode);
          this.slotNodesByKey.set(getLayerGroupSlotKey(slot), slotNode);
        }
      }

      driver.appendChild(this.options.root, stage);
      this.stageNode = stage;
      this.renderDeterministicFrame(this.currentTime);
    } catch (error) {
      driver.destroyNode(stage);
      this.stageNode = null;
      this.contentNode = null;
      this.particleRootNode = null;
      this.layers.clear();
      this.groupNodesById.clear();
      this.slotNodesByKey.clear();
      this.mountedNodesById.clear();
      this.mountedNodesByNode.clear();
      this.layerGroups = [];
      this.layerGroupSlots = [];
      throw error;
    }
  }

  seek(time: number): void {
    this.assertInitialized();
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
    this.drainPaused = false;
    this.loopIndex = 0;
    this.particleRuntime.reset();
    this.renderDeterministicFrame(time);
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        "V5GCocosPlayer.update(deltaSeconds) requires a non-negative finite number.",
      );
    }
    if (!this.isPlaying) {
      if (this.particleRuntime.isDraining() && !this.drainPaused) {
        this.advanceParticleDrain(deltaSeconds);
      }
      return;
    }
    if (this.segmentedPlayback) {
      this.advanceSegmentedPlayback(deltaSeconds);
      return;
    }
    if (this.activeRange) {
      this.advanceActiveRange(deltaSeconds);
      return;
    }
    this.advanceFullTimeline(deltaSeconds);
  }

  play(options?: V5GCocosPlayOptions): void {
    if (options?.mode === "range") {
      this.startRangePlayback(options);
      return;
    }
    if (options?.mode === "segmented") {
      this.startSegmentedPlayback(options);
      return;
    }
    this.startTimelinePlayback();
  }

  playRange(options: V5GCocosPlayRangeOptions): void {
    this.startRangePlayback(options);
  }

  requestSegmentedPlaybackEnd(): void {
    if (!this.segmentedPlayback) {
      throw new Error("No active V5G segmented playback.");
    }
    this.segmentedPlayback.requestEnd();
    this.playbackPhase = this.segmentedPlayback.getPhase();
    if (!this.isPlaying) {
      this.setPlaying(true);
    }
    this.drainPaused = false;
  }

  getPlaybackState(): V5GCocosPlaybackState {
    return {
      mode: this.playbackMode,
      phase: this.getEffectivePlaybackPhase(),
      currentTime: this.currentTime,
      isPlaying: this.isPlaying,
      isDrainingParticles: this.particleRuntime.isDraining(),
      liveParticleCount: this.getRenderedParticleCount(),
      loopIndex: this.segmentedPlayback?.getLoopIndex() ?? this.loopIndex,
      keepParticlesAlive: this.segmentedPlayback?.keepParticlesAlive ?? true,
    };
  }

  getLayerGroups(): readonly V5GCocosLayerGroupInfo[] {
    return this.layerGroups.map((group) =>
      Object.freeze({
        id: group.id,
        name: group.name,
        visible: group.visible,
        order: group.order,
        layerIds: group.layerIds,
        renderIndex: group.renderIndex,
      }),
    );
  }

  getLayerGroupSlots(): readonly V5GCocosLayerGroupSlot[] {
    return this.layerGroupSlots.map((slot) => Object.freeze({ ...slot }));
  }

  attachNodeBetweenLayerGroups(
    options: V5GCocosAttachNodeBetweenLayerGroupsOptions<TNode>,
  ): () => void {
    this.assertInitialized("attachNodeBetweenLayerGroups");
    const nodes = normalizeMountedNodes(options);
    this.assertMountableNodeIds(nodes);
    const slot = assertVNIAdjacentLayerGroupSlot(
      this.options.project,
      options.afterGroupId,
      options.beforeGroupId,
    );
    const slotNode = this.slotNodesByKey.get(getLayerGroupSlotKey(slot));
    if (!slotNode) {
      throw new Error(
        `Missing V5G Cocos layer group slot container: ${slot.afterGroupId} -> ${slot.beforeGroupId}.`,
      );
    }
    const mountedVersions = nodes.map((node) => {
      const mounted = this.attachMountedNodeRecord(
        node,
        slotNode,
        options.destroyOnDetach === true,
      );
      return { node: mounted.node, version: mounted.version };
    });

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      for (const mountedVersion of mountedVersions) {
        const mounted = this.mountedNodesByNode.get(mountedVersion.node);
        if (mounted?.version === mountedVersion.version) {
          this.detachMountedNodeRecordAndUnregister(mounted);
        }
      }
    };
  }

  attachProjectAssetBetweenLayerGroups(
    options: V5GCocosAttachProjectAssetBetweenLayerGroupsOptions,
  ): () => void {
    this.assertInitialized("attachProjectAssetBetweenLayerGroups");
    const asset = this.options.project.assets.find(
      (candidate) => candidate.id === options.assetId,
    );
    if (!asset) {
      throw new Error(`Unknown V5G asset id: ${options.assetId}.`);
    }
    const resolvedSpriteFrame = this.resolveSpriteFrame(asset);
    if (resolvedSpriteFrame.shouldValidateSize) {
      this.assertSpriteFrameSize(asset, resolvedSpriteFrame.spriteFrame);
    }
    return this.attachRuntimeOwnedImageNode(
      `V5G Mounted Image ${asset.id}`,
      resolvedSpriteFrame.spriteFrame,
      asset.width,
      asset.height,
      options,
    );
  }

  attachSpriteFrameBetweenLayerGroups(
    options: V5GCocosAttachSpriteFrameBetweenLayerGroupsOptions<TSpriteFrame>,
  ): () => void {
    this.assertInitialized("attachSpriteFrameBetweenLayerGroups");
    this.assertPositiveFiniteNumber(
      options.width,
      "V5GCocosPlayer.attachSpriteFrameBetweenLayerGroups width",
    );
    this.assertPositiveFiniteNumber(
      options.height,
      "V5GCocosPlayer.attachSpriteFrameBetweenLayerGroups height",
    );
    return this.attachRuntimeOwnedImageNode(
      "V5G Mounted SpriteFrame",
      options.spriteFrame,
      options.width,
      options.height,
      options,
    );
  }

  detachMountedNode(target: string | TNode): void {
    this.detachMountedNodeRecordAndUnregister(
      this.requireMountedNodeRecord(target),
    );
  }

  detachMountedNodes(targets: readonly (string | TNode)[]): void {
    const mountedNodes = targets.map((target) =>
      this.requireMountedNodeRecord(target),
    );
    const detached = new Set<MountedNodeRecord<TNode>>();
    for (const mounted of mountedNodes) {
      if (!detached.has(mounted)) {
        this.detachMountedNodeRecordAndUnregister(mounted);
        detached.add(mounted);
      }
    }
  }

  clearMountedNodes(): void {
    for (const mounted of [...this.mountedNodesByNode.values()]) {
      this.detachMountedNodeRecordAndUnregister(mounted);
    }
  }

  addPlaybackEvent(options: V5GCocosPlaybackEventOptions): () => void {
    if (typeof options.id !== "string" || options.id.length === 0) {
      throw new Error("V5GCocosPlayer.addPlaybackEvent id must be non-empty.");
    }
    if (this.playbackEvents.has(options.id)) {
      throw new Error(
        `V5GCocosPlayer.addPlaybackEvent id must be unique: ${options.id}.`,
      );
    }
    if (typeof options.listener !== "function") {
      throw new Error(
        "V5GCocosPlayer.addPlaybackEvent listener must be a function.",
      );
    }

    this.playbackEvents.set(options.id, {
      id: options.id,
      time: this.normalizePlaybackPoint(
        options.at,
        "V5GCocosPlayer.addPlaybackEvent",
      ),
      once: options.once ?? false,
      order: this.nextPlaybackEventOrder,
      listener: options.listener,
    });
    this.nextPlaybackEventOrder += 1;

    return () => {
      this.playbackEvents.delete(options.id);
    };
  }

  clearPlaybackEvent(id: string): void {
    if (!this.playbackEvents.delete(id)) {
      throw new Error(`V5GCocosPlayer.clearPlaybackEvent unknown id: ${id}.`);
    }
  }

  clearPlaybackEvents(): void {
    this.playbackEvents.clear();
  }

  onPlaybackComplete(
    listener: (event: V5GCocosPlaybackCompleteContext) => void,
  ): () => void {
    if (typeof listener !== "function") {
      throw new Error(
        "V5GCocosPlayer.onPlaybackComplete listener must be a function.",
      );
    }
    this.completeListeners.add(listener);
    return () => {
      this.completeListeners.delete(listener);
    };
  }

  pause(): void {
    if (this.particleRuntime.isDraining()) {
      this.drainPaused = true;
    }
    this.setPlaying(false);
  }

  restart(): void {
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
    this.drainPaused = false;
    this.loopIndex = 0;
    this.particleRuntime.reset();
    this.renderDeterministicFrame(0);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  destroy(): void {
    this.destroyManagedNodes();
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackEvents.clear();
    this.completeListeners.clear();
    this.loopIndex = 0;
    this.drainPaused = false;
    this.particleRuntime.reset();
    this.setPlaying(false);
    this.currentTime = 0;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
  }

  private startTimelinePlayback(): void {
    this.assertInitialized();
    if (this.particleRuntime.isDraining()) {
      this.drainPaused = false;
      return;
    }
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "start";
    this.loopIndex = 0;
    this.particleRuntime.reset();
    if (this.currentTime >= this.options.project.stage.duration) {
      this.renderPlaybackFrame(0, 0);
    }
    this.setPlaying(true);
  }

  private startRangePlayback(options: V5GCocosPlayRangeOptions): void {
    this.assertInitialized();
    const range = this.normalizePlaybackRange(
      options.range,
      "V5GCocosPlayer.playRange",
    );
    this.activeRange = {
      ...range,
      loop: options.loop ?? this.loop,
    };
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "range";
    this.playbackPhase = "start";
    this.drainPaused = false;
    this.loopIndex = 0;
    this.particleRuntime.reset();
    this.renderPlaybackFrame(range.startTime, range.startTime);
    this.setPlaying(true);
  }

  private startSegmentedPlayback(
    options: Extract<V5GCocosPlayOptions, { mode: "segmented" }>,
  ): void {
    this.assertInitialized();
    const normalized = normalizeSegmentedPlaybackOptions(
      options,
      this.options.project.stage.duration,
    );
    this.activeRange = null;
    this.pendingComplete = null;
    this.playbackMode = "segmented";
    this.playbackPhase = "start";
    this.drainPaused = false;
    this.loopIndex = 0;
    this.particleRuntime.reset();
    this.segmentedPlayback = new V5GSegmentedPlaybackSequence(normalized);
    this.renderPlaybackFrame(0, 0);
    this.setPlaying(true);
  }

  private advanceFullTimeline(deltaSeconds: number): void {
    const duration = this.options.project.stage.duration;
    const boundary: PlaybackBoundary = {
      startTime: 0,
      endTime: duration,
      loop: this.loop,
    };
    let remaining = deltaSeconds;

    while (remaining > 0 && this.isPlaying) {
      const timeToEnd = duration - this.currentTime;
      if (remaining >= timeToEnd - PLAYBACK_EPSILON) {
        const previousTime = this.currentTime;
        this.emitPlaybackEventsBetween(previousTime, duration, 0, boundary);
        if (this.loop) {
          remaining -= Math.max(timeToEnd, 0);
          this.renderPlaybackFrame(duration, duration);
          this.renderPlaybackFrame(0, 0);
          if (timeToEnd <= PLAYBACK_EPSILON) break;
          continue;
        }
        this.startParticleDrain(duration, {
          startTime: 0,
          endTime: duration,
          currentTime: duration,
          loopIndex: 0,
        });
        return;
      }

      const previousTime = this.currentTime;
      const nextTime = previousTime + remaining;
      this.renderPlaybackFrame(nextTime, nextTime);
      this.emitPlaybackEventsBetween(previousTime, nextTime, 0, boundary);
      return;
    }
  }

  private advanceActiveRange(deltaSeconds: number): void {
    const range = this.activeRange;
    if (!range) return;
    let remaining = deltaSeconds;

    while (remaining > 0 && this.isPlaying && this.activeRange === range) {
      const timeToEnd = range.endTime - this.currentTime;
      if (remaining >= timeToEnd - PLAYBACK_EPSILON) {
        const previousTime = this.currentTime;
        this.emitPlaybackEventsBetween(
          previousTime,
          range.endTime,
          this.loopIndex,
          range,
        );
        if (range.loop) {
          remaining -= Math.max(timeToEnd, 0);
          this.renderPlaybackFrame(range.endTime, range.endTime);
          this.loopIndex += 1;
          this.renderPlaybackFrame(range.startTime, range.startTime);
          if (timeToEnd <= PLAYBACK_EPSILON) break;
          continue;
        }
        this.activeRange = null;
        this.startParticleDrain(range.endTime, {
          startTime: range.startTime,
          endTime: range.endTime,
          currentTime: range.endTime,
          loopIndex: this.loopIndex,
        });
        return;
      }

      const previousTime = this.currentTime;
      const nextTime = previousTime + remaining;
      this.renderPlaybackFrame(nextTime, nextTime);
      this.emitPlaybackEventsBetween(
        previousTime,
        nextTime,
        this.loopIndex,
        range,
      );
      return;
    }
  }

  private advanceSegmentedPlayback(deltaSeconds: number): void {
    const segmented = this.segmentedPlayback;
    if (!segmented) return;
    const result = segmented.advance(deltaSeconds);
    this.playbackPhase = result.phase;
    this.triggerSegmentedPlaybackEvents(segmented, result);
    if (result.timelineEnded) {
      this.startParticleDrain(this.options.project.stage.duration, {
        startTime: 0,
        endTime: this.options.project.stage.duration,
        currentTime: this.options.project.stage.duration,
        loopIndex: result.loopIndex,
      });
      return;
    }

    const particleTime = segmented.getCurrentTime();
    this.renderPlaybackFrame(result.currentTime, particleTime, {
      liveParticles:
        segmented.keepParticlesAlive && segmented.getPhase() === "loop",
      liveParticleDeltaSeconds: deltaSeconds,
    });
  }

  private triggerSegmentedPlaybackEvents(
    segmented: V5GSegmentedPlaybackSequence,
    result: {
      previousTime: number;
      currentTime: number;
      loopIndex: number;
    },
  ): void {
    if (
      segmented.getPhase() === "loop" &&
      segmented.getLoopStartTime() < segmented.getLoopEndTime() &&
      result.currentTime < result.previousTime
    ) {
      this.emitPlaybackEventsBetween(
        result.previousTime,
        segmented.getLoopEndTime(),
        Math.max(0, result.loopIndex - 1),
        {
          startTime: segmented.getLoopStartTime(),
          endTime: segmented.getLoopEndTime(),
          loop: true,
        },
      );
      this.emitPlaybackEventsBetween(
        segmented.getLoopStartTime(),
        result.currentTime,
        result.loopIndex,
        {
          startTime: segmented.getLoopStartTime(),
          endTime: segmented.getLoopEndTime(),
          loop: true,
        },
      );
      return;
    }

    this.emitPlaybackEventsBetween(
      result.previousTime,
      result.currentTime,
      result.loopIndex,
      {
        startTime: 0,
        endTime: this.options.project.stage.duration,
        loop: false,
      },
    );
  }

  private startParticleDrain(
    endTime: number,
    completeContext: V5GCocosPlaybackCompleteContext,
  ): void {
    this.setPlaying(false);
    this.currentTime = endTime;
    this.pendingComplete = completeContext;
    this.playbackPhase = "particle-draining";
    const sampled = this.applyProjectSample(endTime);
    const particleLayers = this.getParticleRuntimeLayers(sampled.layers);
    if (particleLayers.length > 0) {
      const endParticles = sampleLiveParticleSprites(particleLayers, endTime);
      if (endParticles.length > 0) {
        this.particleRuntime.emit(particleLayers, endTime);
      }
    }
    const frame = this.particleRuntime.beginDrain();
    this.renderParticleSamples(frame.particles);
    this.options.onTimeChange?.(this.currentTime);
    if (frame.isComplete) {
      this.finishParticleDrain();
      return;
    }
    this.drainPaused = false;
  }

  private advanceParticleDrain(deltaSeconds: number): void {
    const frame = this.particleRuntime.advanceDrain(deltaSeconds);
    this.renderParticleSamples(frame.particles);
    if (frame.isComplete) {
      this.finishParticleDrain();
    }
  }

  private finishParticleDrain(): void {
    this.playbackPhase = "complete";
    this.segmentedPlayback?.markParticleDrainComplete();
    this.clearParticles();
    const event = this.pendingComplete;
    this.pendingComplete = null;
    if (event) {
      this.emitPlaybackComplete(event);
    }
  }

  private renderDeterministicFrame(time: number): void {
    const sampled = this.applyProjectSample(time);
    const frame = this.particleRuntime.emit(
      this.getParticleRuntimeLayers(sampled.layers),
      this.currentTime,
    );
    this.renderParticleSamples(frame.particles);
    this.options.onTimeChange?.(this.currentTime);
  }

  private renderPlaybackFrame(
    nonParticleTime: number,
    particleTime: number,
    options: PlaybackFrameOptions = {},
  ): void {
    const sampled = this.applyProjectSample(nonParticleTime);
    const particleLayers = this.getParticleRuntimeLayers(sampled.layers);
    const frame = options.liveParticles
      ? this.particleRuntime.emitLive(
          particleLayers,
          particleTime,
          options.liveParticleDeltaSeconds ?? 0,
        )
      : this.particleRuntime.emit(particleLayers, particleTime);
    this.renderParticleSamples(frame.particles);
    this.options.onTimeChange?.(this.currentTime);
  }

  private applyProjectSample(time: number): {
    time: number;
    layers: SampledLayerState[];
  } {
    const sampledProject = sampleProjectAtTime(this.options.project, time);
    this.currentTime = sampledProject.time;

    for (const sampledLayer of sampledProject.layers) {
      const managed = this.layers.get(sampledLayer.layerId);
      if (!managed) {
        throw new Error(
          `Missing runtime node for V5G layer "${sampledLayer.layerId}".`,
        );
      }
      const position = v5gTransformToCocosPosition(sampledLayer.transform);
      this.options.driver.setPosition(managed.node, position.x, position.y);
      this.options.driver.setScale(
        managed.node,
        sampledLayer.transform.scaleX,
        sampledLayer.transform.scaleY,
      );
      this.options.driver.setRotationDegrees(
        managed.node,
        sampledLayer.transform.rotation,
      );
      this.options.driver.setOpacity(
        managed.node,
        opacityToCocosOpacity(sampledLayer.opacity),
      );
      this.options.driver.setActive(
        managed.node,
        sampledLayer.renderImageDisplay,
      );
    }

    return sampledProject;
  }

  private getParticleRuntimeLayers(
    sampledLayers: readonly SampledLayerState[],
  ): V5GParticleRuntimeLayer[] {
    const layers: V5GParticleRuntimeLayer[] = [];
    for (const sampledLayer of sampledLayers) {
      if (!sampledLayer.hasActiveParticleAnimation) continue;
      const managed = this.layers.get(sampledLayer.layerId);
      if (!managed) {
        throw new Error(
          `Missing runtime node for V5G particle layer "${sampledLayer.layerId}".`,
        );
      }
      layers.push({
        layer: managed.layer,
        sampledLayer,
        textureSize: {
          width: managed.asset.width,
          height: managed.asset.height,
        },
      });
    }
    return layers;
  }

  private renderParticleSamples(
    particles: readonly V5GLiveParticleSpriteSample[],
  ): void {
    const particlesByLayer = new Map<string, V5GLiveParticleSpriteSample[]>();
    for (const particle of particles) {
      const layerParticles = particlesByLayer.get(particle.layerId) ?? [];
      layerParticles.push(particle);
      particlesByLayer.set(particle.layerId, layerParticles);
    }

    for (const managed of this.layers.values()) {
      const layerParticles = particlesByLayer.get(managed.layer.id) ?? [];
      while (managed.particleNodes.length < layerParticles.length) {
        const node = this.options.driver.createImageNode(
          `V5G Particle ${managed.layer.id}`,
          managed.spriteFrame,
        );
        this.options.driver.setContentSize(
          node,
          managed.asset.width,
          managed.asset.height,
        );
        this.options.driver.setAnchorPoint(node, 0.5, 0.5);
        this.options.driver.applyBlendMode(
          node,
          getCocosBlendModeConfig(managed.layer.blendMode),
        );
        this.options.driver.appendChild(managed.particleContainer, node);
        managed.particleNodes.push(node);
      }

      for (let index = 0; index < layerParticles.length; index += 1) {
        const particle = layerParticles[index];
        const node = managed.particleNodes[index];
        this.options.driver.setPosition(node, particle.x, particle.y);
        this.options.driver.setScale(node, particle.scale, particle.scale);
        this.options.driver.setRotationDegrees(
          node,
          (particle.rotation * 180) / Math.PI,
        );
        this.options.driver.setOpacity(
          node,
          opacityToCocosOpacity(particle.alpha),
        );
        this.options.driver.applyBlendMode(
          node,
          getCocosBlendModeConfig(particle.blendMode),
        );
        this.options.driver.setActive(node, true);
      }

      while (managed.particleNodes.length > layerParticles.length) {
        const node = managed.particleNodes.pop();
        if (node !== undefined) this.options.driver.destroyNode(node);
      }
    }
  }

  private attachRuntimeOwnedImageNode(
    name: string,
    spriteFrame: TSpriteFrame,
    width: number,
    height: number,
    options: MountedImageNodeOptions & {
      id: string;
      afterGroupId: string;
      beforeGroupId: string;
      destroyOnDetach?: boolean;
    },
  ): () => void {
    const node = this.options.driver.createImageNode(name, spriteFrame);
    try {
      this.configureMountedImageNode(node, width, height, options);
      return this.attachNodeBetweenLayerGroups({
        id: options.id,
        afterGroupId: options.afterGroupId,
        beforeGroupId: options.beforeGroupId,
        node,
        destroyOnDetach: options.destroyOnDetach ?? true,
      });
    } catch (error) {
      this.options.driver.destroyNode(node);
      throw error;
    }
  }

  private configureMountedImageNode(
    node: TNode,
    width: number,
    height: number,
    options: MountedImageNodeOptions,
  ): void {
    this.assertPositiveFiniteNumber(width, "mounted image width");
    this.assertPositiveFiniteNumber(height, "mounted image height");
    const opacity = options.opacity ?? 1;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new Error("mounted image opacity must be in range 0..1.");
    }
    this.options.driver.setContentSize(node, width, height);
    this.options.driver.setAnchorPoint(
      node,
      options.anchorX ?? 0.5,
      options.anchorY ?? 0.5,
    );
    this.options.driver.setPosition(node, options.x ?? 0, options.y ?? 0);
    this.options.driver.setScale(
      node,
      options.scaleX ?? 1,
      options.scaleY ?? 1,
    );
    this.options.driver.setRotationDegrees(node, options.rotation ?? 0);
    this.options.driver.setOpacity(node, opacityToCocosOpacity(opacity));
    this.options.driver.setActive(node, true);
    this.options.driver.applyBlendMode(
      node,
      getCocosBlendModeConfig(options.blendMode ?? "normal"),
    );
  }

  private assertMountableNodeIds(
    nodes: readonly NormalizedMountedNode<TNode>[],
  ): void {
    const idOwners = new Map<string, TNode>();
    const nodeIds = new Map<TNode, string | null>();
    for (const mounted of this.mountedNodesByNode.values()) {
      nodeIds.set(mounted.node, mounted.id);
      if (mounted.id !== null) {
        idOwners.set(mounted.id, mounted.node);
      }
    }
    for (const mounted of nodes) {
      if (mounted.id !== null) {
        const owner = idOwners.get(mounted.id);
        if (owner !== undefined && owner !== mounted.node) {
          throw new Error(
            `Duplicate V5G Cocos mounted node id: ${mounted.id}.`,
          );
        }
      }
      const previousId = nodeIds.get(mounted.node);
      if (previousId !== undefined && previousId !== null) {
        idOwners.delete(previousId);
      }
      nodeIds.set(mounted.node, mounted.id);
      if (mounted.id !== null) {
        idOwners.set(mounted.id, mounted.node);
      }
    }
  }

  private attachMountedNodeRecord(
    mountedNode: NormalizedMountedNode<TNode>,
    slotNode: TNode,
    destroyOnDetach: boolean,
  ): MountedNodeRecord<TNode> {
    const existingById =
      mountedNode.id === null
        ? undefined
        : this.mountedNodesById.get(mountedNode.id);
    if (existingById !== undefined && existingById.node !== mountedNode.node) {
      throw new Error(
        `Duplicate V5G Cocos mounted node id: ${mountedNode.id}.`,
      );
    }

    let mounted = this.mountedNodesByNode.get(mountedNode.node);
    const previousParent = this.options.driver.getParent(mountedNode.node);
    const worldTransform =
      previousParent === null
        ? null
        : this.options.driver.captureWorldTransform(mountedNode.node);
    if (mounted === undefined) {
      mounted = {
        id: null,
        node: mountedNode.node,
        slotNode,
        originalParent: previousParent,
        originalLocalTransform: this.options.driver.captureLocalTransform(
          mountedNode.node,
        ),
        destroyOnDetach,
        version: 0,
      };
      this.mountedNodesByNode.set(mountedNode.node, mounted);
    } else if (mounted.id !== null) {
      this.mountedNodesById.delete(mounted.id);
    }

    mounted.id = mountedNode.id;
    mounted.slotNode = slotNode;
    mounted.destroyOnDetach = destroyOnDetach;
    mounted.version += 1;
    this.options.driver.appendChild(slotNode, mountedNode.node);
    if (worldTransform !== null) {
      this.options.driver.restoreWorldTransform(
        mountedNode.node,
        worldTransform,
      );
    }
    if (mounted.id !== null) {
      this.mountedNodesById.set(mounted.id, mounted);
    }
    return mounted;
  }

  private requireMountedNodeRecord(
    target: string | TNode,
  ): MountedNodeRecord<TNode> {
    if (typeof target === "string") {
      const normalizedId = normalizeMountedNodeId(target);
      const mounted = this.mountedNodesById.get(normalizedId);
      if (!mounted) {
        throw new Error(`Unknown V5G Cocos mounted node id: ${normalizedId}.`);
      }
      return mounted;
    }
    const mounted = this.mountedNodesByNode.get(target);
    if (!mounted) {
      throw new Error("Unknown V5G Cocos mounted node.");
    }
    return mounted;
  }

  private detachMountedNodeRecordAndUnregister(
    mounted: MountedNodeRecord<TNode>,
  ): void {
    this.detachMountedNodeRecord(mounted);
    if (mounted.id !== null) {
      this.mountedNodesById.delete(mounted.id);
    }
    this.mountedNodesByNode.delete(mounted.node);
  }

  private detachMountedNodeRecord(mounted: MountedNodeRecord<TNode>): void {
    if (mounted.destroyOnDetach) {
      this.options.driver.destroyNode(mounted.node);
      return;
    }
    const currentParent = this.options.driver.getParent(mounted.node);
    if (currentParent !== null) {
      this.options.driver.removeChild(currentParent, mounted.node);
    }
    if (mounted.originalParent !== null) {
      this.options.driver.appendChild(mounted.originalParent, mounted.node);
    }
    this.options.driver.restoreLocalTransform(
      mounted.node,
      mounted.originalLocalTransform,
    );
  }

  private normalizePlaybackRange(
    range: V5GCocosPlaybackRange,
    apiName: string,
  ): Omit<PlaybackBoundary, "loop"> {
    if (range.unit === "time") {
      this.assertFiniteNumber(range.start, `${apiName} range.start`);
      const endTime =
        range.end === undefined || range.end === -1
          ? this.options.project.stage.duration
          : range.end;
      this.assertFiniteNumber(endTime, `${apiName} range.end`);
      return this.assertPlaybackRangeTimes(range.start, endTime, apiName);
    }

    if (range.unit === "frame") {
      this.assertNonNegativeInteger(range.start, `${apiName} range.start`);
      this.assertPositiveFiniteNumber(range.fps, `${apiName} range.fps`);
      const endTime =
        range.end === undefined || range.end === -1
          ? this.options.project.stage.duration
          : this.normalizePlaybackFrameEnd(range.end, range.fps, apiName);
      return this.assertPlaybackRangeTimes(
        range.start / range.fps,
        endTime,
        apiName,
      );
    }

    throw new Error(`${apiName} range.unit must be "time" or "frame".`);
  }

  private normalizePlaybackFrameEnd(
    endFrame: number,
    fps: number,
    apiName: string,
  ): number {
    this.assertNonNegativeInteger(endFrame, `${apiName} range.end`);
    return endFrame / fps;
  }

  private normalizePlaybackPoint(
    point: V5GCocosPlaybackPoint,
    apiName: string,
  ): number {
    let time: number;
    if (point.unit === "time") {
      this.assertFiniteNumber(point.at, `${apiName} at`);
      time = point.at;
    } else if (point.unit === "frame") {
      this.assertNonNegativeInteger(point.at, `${apiName} at`);
      this.assertPositiveFiniteNumber(point.fps, `${apiName} fps`);
      time = point.at / point.fps;
    } else {
      throw new Error(`${apiName} at.unit must be "time" or "frame".`);
    }

    const duration = this.options.project.stage.duration;
    if (time < 0 || time > duration) {
      throw new Error(
        `${apiName} at must resolve to a time between 0 and project.stage.duration (${duration}).`,
      );
    }
    return time;
  }

  private assertPlaybackRangeTimes(
    startTime: number,
    endTime: number,
    apiName: string,
  ): Omit<PlaybackBoundary, "loop"> {
    const duration = this.options.project.stage.duration;
    if (startTime < 0) {
      throw new Error(`${apiName} range.start must be >= 0.`);
    }
    if (startTime >= endTime) {
      throw new Error(`${apiName} range.start must be less than range.end.`);
    }
    if (endTime > duration) {
      throw new Error(
        `${apiName} range.end must be <= project.stage.duration (${duration}).`,
      );
    }
    return { startTime, endTime };
  }

  private emitPlaybackEventsBetween(
    previousTime: number,
    currentTime: number,
    loopIndex: number,
    boundary: PlaybackBoundary,
  ): void {
    const events = [...this.playbackEvents.values()]
      .filter(
        (event) =>
          event.time >= boundary.startTime &&
          event.time <= boundary.endTime + PLAYBACK_EPSILON &&
          event.time > previousTime + PLAYBACK_EPSILON &&
          event.time <= currentTime + PLAYBACK_EPSILON,
      )
      .sort((a, b) => a.time - b.time || a.order - b.order);

    for (const event of events) {
      if (event.once) {
        this.playbackEvents.delete(event.id);
      }
      event.listener({
        id: event.id,
        time: event.time,
        previousTime,
        currentTime,
        loopIndex,
      });
    }
  }

  private emitPlaybackComplete(context: V5GCocosPlaybackCompleteContext): void {
    for (const listener of [...this.completeListeners]) {
      listener(context);
    }
  }

  private assertFiniteNumber(value: number, field: string): void {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number.`);
    }
  }

  private assertPositiveFiniteNumber(value: number, field: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${field} must be a positive finite number.`);
    }
  }

  private assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
  }

  private setPlaying(nextPlaying: boolean): void {
    if (this.isPlaying === nextPlaying) return;
    this.isPlaying = nextPlaying;
    this.options.onPlayingChange?.(this.isPlaying);
  }

  private resetPlaybackRuntime(): void {
    this.activeRange = null;
    this.segmentedPlayback = null;
    this.pendingComplete = null;
    this.playbackMode = "timeline";
    this.playbackPhase = "idle";
    this.loopIndex = 0;
    this.drainPaused = false;
    this.particleRuntime.reset();
    this.setPlaying(false);
  }

  private destroyManagedNodes(): void {
    this.clearMountedNodes();
    this.clearParticles();
    if (this.stageNode !== null) {
      this.options.driver.destroyNode(this.stageNode);
    }
    this.stageNode = null;
    this.contentNode = null;
    this.particleRootNode = null;
    this.layers.clear();
    this.groupNodesById.clear();
    this.slotNodesByKey.clear();
    this.mountedNodesById.clear();
    this.mountedNodesByNode.clear();
    this.layerGroups = [];
    this.layerGroupSlots = [];
  }

  private assertInitialized(apiName = "seek/update"): void {
    if (this.stageNode === null) {
      throw new Error(`V5GCocosPlayer must be initialized before ${apiName}.`);
    }
  }

  private requireImageAsset(
    layer: V5GLayerConfig,
    assetsById: ReadonlyMap<string, V5GAssetConfig>,
  ): V5GAssetConfig {
    if (layer.type !== "image" || !layer.assetId) {
      throw new Error(`V5G Cocos layer "${layer.id}" requires an image asset.`);
    }
    const asset = assetsById.get(layer.assetId);
    if (!asset) {
      throw new Error(
        `V5G Cocos layer "${layer.id}" references missing asset "${layer.assetId}".`,
      );
    }
    return asset;
  }

  private assertSpriteFrameSize(
    asset: V5GAssetConfig,
    spriteFrame: TSpriteFrame,
  ): void {
    const actualSize = this.options.driver.getSpriteFrameSize(spriteFrame);
    if (actualSize === null) return;
    const expectedSize = getExpectedSpriteFrameSize(asset);
    if (
      Math.abs(actualSize.width - expectedSize.width) > SIZE_EPSILON ||
      Math.abs(actualSize.height - expectedSize.height) > SIZE_EPSILON
    ) {
      throw new Error(
        `Cocos SpriteFrame size mismatch for V5G asset "${asset.id}" at "${asset.path}": logical ${asset.width}x${asset.height}, expected file ${expectedSize.width}x${expectedSize.height}, got ${actualSize.width}x${actualSize.height}.`,
      );
    }
  }

  private resolveSpriteFrame(
    asset: V5GAssetConfig,
  ): ResolvedSpriteFrame<TSpriteFrame> {
    const source = this.options.assets as
      | V5GCocosAssetSource<TSpriteFrame>
      | null
      | undefined;
    if (isAssetResolver(source)) {
      const spriteFrame = source.getSpriteFrame(asset.path, asset.id);
      if (spriteFrame === null) {
        throw new Error(
          `Missing Cocos SpriteFrame for V5G asset "${asset.id}" at "${asset.path}".`,
        );
      }
      return { spriteFrame, shouldValidateSize: true };
    }

    if (isSpriteAtlasAssetSource(source)) {
      const atlasKey = getAssetFrameNameFromPath(asset.path);
      const spriteFrame = source.atlas.getSpriteFrame(atlasKey);
      if (spriteFrame === null) {
        throw new Error(
          `Missing Cocos SpriteFrame for V5G asset "${asset.id}" at "${asset.path}" using atlas key "${atlasKey}".`,
        );
      }
      return { spriteFrame, shouldValidateSize: false };
    }

    throw new Error(
      "V5GCocosPlayer assets.atlas must provide getSpriteFrame(name).",
    );
  }

  private clearParticles(): void {
    for (const managed of this.layers.values()) {
      while (managed.particleNodes.length > 0) {
        const node = managed.particleNodes.pop();
        if (node !== undefined) this.options.driver.destroyNode(node);
      }
    }
  }

  private getRenderedParticleCount(): number {
    let count = 0;
    for (const managed of this.layers.values()) {
      count += managed.particleNodes.length;
    }
    return count;
  }

  private getEffectivePlaybackPhase(): V5GCocosSegmentedPlaybackPhase {
    if (this.particleRuntime.isDraining()) return "particle-draining";
    if (this.segmentedPlayback) return this.segmentedPlayback.getPhase();
    return this.playbackPhase;
  }
}

function isAssetResolver<TSpriteFrame>(
  source: V5GCocosAssetSource<TSpriteFrame> | null | undefined,
): source is V5GCocosAssetResolver<TSpriteFrame> {
  return (
    source !== null &&
    source !== undefined &&
    typeof (source as Partial<V5GCocosAssetResolver<TSpriteFrame>>)
      .getSpriteFrame === "function"
  );
}

function getAssetFrameNameFromPath(assetPath: string): string {
  const normalized = assetPath.replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  const fileName =
    slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

function isSpriteAtlasAssetSource<TSpriteFrame>(
  source: V5GCocosAssetSource<TSpriteFrame> | null | undefined,
): source is V5GCocosSpriteAtlasAssetSource<TSpriteFrame> {
  return (
    source !== null &&
    source !== undefined &&
    typeof (source as Partial<V5GCocosSpriteAtlasAssetSource<TSpriteFrame>>)
      .atlas?.getSpriteFrame === "function"
  );
}

function getLayerGroupSlotKey(slot: VNILayerGroupSlot): string {
  return `${slot.afterGroupId}\u0000${slot.beforeGroupId}`;
}

function normalizeMountedNodes<TNode>(
  options: V5GCocosAttachNodeBetweenLayerGroupsOptions<TNode>,
): readonly NormalizedMountedNode<TNode>[] {
  if (options.node !== undefined && options.nodes !== undefined) {
    throw new Error(
      "V5GCocosPlayer.attachNodeBetweenLayerGroups accepts node or nodes, not both.",
    );
  }
  const nodes =
    options.nodes !== undefined
      ? [...options.nodes]
      : options.node !== undefined
        ? [options.node]
        : [];
  if (nodes.length === 0) {
    throw new Error(
      "V5GCocosPlayer.attachNodeBetweenLayerGroups requires at least one node.",
    );
  }
  if (options.id !== undefined && options.ids !== undefined) {
    throw new Error(
      "V5GCocosPlayer.attachNodeBetweenLayerGroups accepts id or ids, not both.",
    );
  }
  const ids = normalizeMountedNodeIds(options.id, options.ids, nodes.length);
  return nodes.map((node, index) => {
    if (node === null || node === undefined) {
      throw new Error(
        "V5GCocosPlayer.attachNodeBetweenLayerGroups node must be non-null.",
      );
    }
    return { id: ids[index], node };
  });
}

function normalizeMountedNodeIds(
  id: string | undefined,
  ids: readonly string[] | undefined,
  nodeCount: number,
): readonly (string | null)[] {
  if (ids !== undefined) {
    if (ids.length !== nodeCount) {
      throw new Error(
        "V5GCocosPlayer.attachNodeBetweenLayerGroups ids length must match nodes length.",
      );
    }
    return ids.map((candidate) => normalizeMountedNodeId(candidate));
  }
  if (id !== undefined) {
    if (nodeCount !== 1) {
      throw new Error(
        "V5GCocosPlayer.attachNodeBetweenLayerGroups id can only be used with one node; use ids for multiple nodes.",
      );
    }
    return [normalizeMountedNodeId(id)];
  }
  return Array.from({ length: nodeCount }, () => null);
}

function normalizeMountedNodeId(id: string): string {
  if (typeof id !== "string") {
    throw new Error("V5G Cocos mounted node id must be a string.");
  }
  const normalized = id.trim();
  if (normalized.length === 0) {
    throw new Error("V5G Cocos mounted node id must be non-empty.");
  }
  return normalized;
}

export function createV5GCocosPlayer(
  options: V5GCocosPlayerFactoryOptions,
): V5GCocosPlayer<Node, SpriteFrame> {
  return new V5GCocosPlayer({
    ...options,
    driver: createCocosNodeDriver(),
  });
}
