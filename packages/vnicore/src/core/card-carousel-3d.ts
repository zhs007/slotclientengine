import { clampNumber } from "./coordinates.js";
import {
  createVNICyclicMotionSnapshot,
  createVNICyclicResolvePlan,
  sampleVNICyclicResolveStopTurns,
  type VNICyclicResolvePlan,
} from "./cyclic-selection.js";
import { getTimelineAnimationProgress } from "./timeline-progress.js";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GTransformConfig,
} from "./types.js";

export type VNICardCarousel3DPhasePreviewMode =
  | "full_demo"
  | "intro"
  | "idle"
  | "fast"
  | "stop"
  | "hold";

export interface VNICardCarousel3DTextureInfo {
  width: number;
  height: number;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
}

export interface VNICardCarousel3DPreparedConfig {
  readonly animationId: string;
  readonly phasePreviewMode: VNICardCarousel3DPhasePreviewMode;
  readonly cardCount: number;
  readonly targetIndex: number;
  readonly rounds: number;
  readonly direction: 1 | -1;
  readonly introDuration: number;
  readonly introSpeed: number;
  readonly revealDirection: 0 | 1 | 2;
  readonly revealStagger: number;
  readonly revealOffsetX: number;
  readonly revealScaleFrom: number;
  readonly demoIdleDuration: number;
  readonly idleSpeed: number;
  readonly fastDuration: number;
  readonly fastSpeed: number;
  readonly accelRatio: number;
  readonly stopDuration: number;
  readonly holdDuration: number;
  readonly stopOvershoot: number;
  readonly finalPop: number;
  readonly finalGlow: number;
  readonly radius: number;
  readonly cardSpacing: number;
  readonly perspective: number;
  readonly slices: number;
  readonly visibleRange: number;
  readonly cardSize: number;
  readonly centerScale: number;
  readonly sideScale: number;
  readonly sideAlpha: number;
  readonly shadeStrength: number;
  readonly curve: number;
  readonly tiltRadians: number;
  readonly sourceOpacity: number;
  readonly hideBack: boolean;
  readonly keepOriginal: boolean;
  readonly angleStep: number;
  readonly introRotation: number;
  readonly idleRotation: number;
  readonly fastRotation: number;
  readonly stopStartRotation: number;
  readonly stopFinalRotation: number;
  readonly totalDuration: number;
  readonly visibleWindow: number;
  readonly perspectiveTravel: number;
  readonly revealWindow: number;
  readonly revealRanks: Int16Array;
}

export interface VNICardCarousel3DSliceSample {
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  tint: number;
}

export interface VNICardCarousel3DCardSample {
  cardIndex: number;
  textureIndex: number;
  visible: boolean;
  x: number;
  y: number;
  rotation: number;
  alpha: number;
  z: number;
  slices: VNICardCarousel3DSliceSample[];
}

export interface VNICardCarousel3DSampleBuffer {
  readonly cards: VNICardCarousel3DCardSample[];
  readonly drawOrder: Int16Array;
  visibleCardCount: number;
  rotation: number;
  introElapsed: number;
  stopPhase: number;
  finalEffectWave: number;
}

export interface VNICardCarousel3DSampleInput {
  progress: number;
  emitterX: number;
  emitterY: number;
  layerOpacity: number;
  transform: V5GTransformConfig;
  blendMode: V5GBlendMode;
  textures: readonly VNICardCarousel3DTextureInfo[];
  motion?: VNICardCarousel3DMotionSample;
}

export interface VNICardCarousel3DMotionSample {
  readonly rotation: number;
  readonly introElapsed: number;
  readonly stopPhase: number;
  readonly targetIndex: number;
}

const TWO_PI = Math.PI * 2;

export function prepareCardCarousel3D(
  animation: V5GAnimationConfig,
): VNICardCarousel3DPreparedConfig {
  if (animation.type !== "card_carousel_3d") {
    throw new Error(`VNI animation "${animation.id}" is not card_carousel_3d.`);
  }
  const cardCount = getNumberParam(animation, "cardCount");
  const targetIndex = getNumberParam(animation, "targetIndex");
  const direction = getNumberParam(animation, "direction") as 1 | -1;
  const revealDirection = getNumberParam(animation, "revealDirection") as
    | 0
    | 1
    | 2;
  const introDuration = getNumberParam(animation, "introDuration");
  const introSpeed = getNumberParam(animation, "introSpeed");
  const demoIdleDuration = getNumberParam(animation, "demoIdleDuration");
  const idleSpeed = getNumberParam(animation, "idleSpeed");
  const fastDuration = getNumberParam(animation, "fastDuration");
  const fastSpeed = getNumberParam(animation, "fastSpeed");
  const accelRatio = getNumberParam(animation, "accelRatio");
  const stopDuration = getNumberParam(animation, "stopDuration");
  const holdDuration = getNumberParam(animation, "holdDuration");
  const rounds = getNumberParam(animation, "rounds");
  const stopOvershoot = getNumberParam(animation, "stopOvershoot");
  const angleStep = TWO_PI / cardCount;
  const introRotation = direction * introSpeed * introDuration * TWO_PI;
  const idleRotation = direction * idleSpeed * demoIdleDuration * TWO_PI;
  const fastRotation = sampleFastRotationValues(
    fastDuration,
    direction,
    idleSpeed,
    fastSpeed,
    fastDuration,
    accelRatio,
  );
  const stopStartRotation = introRotation + idleRotation + fastRotation;
  const targetRotation = -targetIndex * angleStep;
  const directionalDelta =
    direction > 0
      ? positiveModulo(targetRotation - stopStartRotation, TWO_PI)
      : -positiveModulo(stopStartRotation - targetRotation, TWO_PI);
  const stopFinalRotation =
    stopStartRotation + directionalDelta + direction * rounds * TWO_PI;
  const revealStagger = getNumberParam(animation, "revealStagger");
  const perspective = getNumberParam(animation, "perspective");
  const visibleRange = getNumberParam(animation, "visibleRange");
  const revealRanks = createRevealRanks(cardCount, angleStep, revealDirection);

  return Object.freeze({
    animationId: animation.id,
    phasePreviewMode: getStringParam(
      animation,
      "phasePreviewMode",
    ) as VNICardCarousel3DPhasePreviewMode,
    cardCount,
    targetIndex,
    rounds,
    direction,
    introDuration,
    introSpeed,
    revealDirection,
    revealStagger,
    revealOffsetX: getNumberParam(animation, "revealOffsetX"),
    revealScaleFrom: getNumberParam(animation, "revealScaleFrom"),
    demoIdleDuration,
    idleSpeed,
    fastDuration,
    fastSpeed,
    accelRatio,
    stopDuration,
    holdDuration,
    stopOvershoot,
    finalPop: getNumberParam(animation, "finalPop"),
    finalGlow: getNumberParam(animation, "finalGlow"),
    radius: getNumberParam(animation, "radius"),
    cardSpacing: getNumberParam(animation, "cardSpacing"),
    perspective,
    slices: getNumberParam(animation, "slices"),
    visibleRange,
    cardSize: getNumberParam(animation, "cardSize"),
    centerScale: getNumberParam(animation, "centerScale"),
    sideScale: getNumberParam(animation, "sideScale"),
    sideAlpha: getNumberParam(animation, "sideAlpha"),
    shadeStrength: getNumberParam(animation, "shadeStrength"),
    curve: getNumberParam(animation, "curve"),
    tiltRadians: (getNumberParam(animation, "tilt") * Math.PI) / 180,
    sourceOpacity: getNumberParam(animation, "sourceOpacity"),
    hideBack: getBooleanParam(animation, "hideBack"),
    keepOriginal: getBooleanParam(animation, "keepOriginal"),
    angleStep,
    introRotation,
    idleRotation,
    fastRotation,
    stopStartRotation,
    stopFinalRotation,
    totalDuration:
      introDuration +
      demoIdleDuration +
      fastDuration +
      stopDuration +
      holdDuration,
    visibleWindow: Math.PI * visibleRange,
    perspectiveTravel: 0.56 + perspective * 0.44,
    revealWindow: Math.max(
      0.08,
      introDuration - revealStagger * Math.max(0, cardCount - 1),
    ),
    revealRanks,
  });
}

export function createCardCarousel3DSampleBuffer(
  prepared: VNICardCarousel3DPreparedConfig,
): VNICardCarousel3DSampleBuffer {
  const cards = new Array<VNICardCarousel3DCardSample>(prepared.cardCount);
  for (let cardIndex = 0; cardIndex < prepared.cardCount; cardIndex += 1) {
    const slices = new Array<VNICardCarousel3DSliceSample>(prepared.slices);
    for (let sliceIndex = 0; sliceIndex < prepared.slices; sliceIndex += 1) {
      slices[sliceIndex] = {
        frameX: 0,
        frameY: 0,
        frameWidth: 0,
        frameHeight: 0,
        x: 0,
        y: 0,
        scaleX: 0,
        scaleY: 0,
        tint: 0xffffff,
      };
    }
    cards[cardIndex] = {
      cardIndex,
      textureIndex: 0,
      visible: false,
      x: 0,
      y: 0,
      rotation: 0,
      alpha: 0,
      z: 0,
      slices,
    };
  }
  return {
    cards,
    drawOrder: new Int16Array(prepared.cardCount),
    visibleCardCount: 0,
    rotation: 0,
    introElapsed: 0,
    stopPhase: 0,
    finalEffectWave: 0,
  };
}

export function sampleCardCarousel3D(
  prepared: VNICardCarousel3DPreparedConfig,
  input: VNICardCarousel3DSampleInput,
  output: VNICardCarousel3DSampleBuffer,
): VNICardCarousel3DSampleBuffer {
  if (input.textures.length === 0) {
    throw new Error(
      `VNI card_carousel_3d animation "${prepared.animationId}" requires at least one texture.`,
    );
  }
  const motion = input.motion;
  if (motion) {
    if (
      !Number.isFinite(motion.rotation) ||
      !Number.isFinite(motion.introElapsed) ||
      !Number.isFinite(motion.stopPhase) ||
      !Number.isSafeInteger(motion.targetIndex) ||
      motion.targetIndex < 0 ||
      motion.targetIndex >= prepared.cardCount
    ) {
      throw new Error(
        `VNI card_carousel_3d animation "${prepared.animationId}" received invalid controlled motion.`,
      );
    }
    output.rotation = motion.rotation;
    output.introElapsed = motion.introElapsed;
    output.stopPhase = clampNumber(motion.stopPhase, 0, 1);
  } else {
    samplePhase(prepared, clampNumber(input.progress, 0, 1), output);
  }
  const targetIndex = motion?.targetIndex ?? prepared.targetIndex;
  const finalEffectPhase = clampNumber((output.stopPhase - 0.78) / 0.22, 0, 1);
  const finalEffectWave = Math.sin(finalEffectPhase * Math.PI);
  output.finalEffectWave = finalEffectWave;
  output.visibleCardCount = 0;
  const baseRotation = (input.transform.rotation * Math.PI) / 180;

  for (let cardIndex = 0; cardIndex < prepared.cardCount; cardIndex += 1) {
    const card = output.cards[cardIndex];
    card.visible = false;
    const revealPhase = clampNumber(
      (output.introElapsed -
        prepared.revealRanks[cardIndex] * prepared.revealStagger) /
        prepared.revealWindow,
      0,
      1,
    );
    const revealEase = easeOutQuad(revealPhase);
    if (revealEase <= 0.002) continue;
    const angle = cardIndex * prepared.angleStep + output.rotation;
    const normalizedAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
    const frontness = Math.cos(angle);
    if (prepared.hideBack && frontness < -0.05) continue;
    if (Math.abs(normalizedAngle) > prepared.visibleWindow) continue;
    const side = Math.sin(angle);
    const sideAbs = Math.abs(side);
    const depth = clampNumber((frontness + 1) / 2, 0, 1);
    const isTargetCard = cardIndex === targetIndex;
    const finalPopScale =
      isTargetCard && output.stopPhase > 0
        ? 1 + prepared.finalPop * finalEffectWave
        : 1;
    const revealScale = lerp(prepared.revealScaleFrom, 1, revealEase);
    const cardScale =
      lerp(prepared.sideScale, prepared.centerScale, Math.pow(depth, 1.35)) *
      (1 - prepared.perspective * (1 - depth) * 0.28) *
      revealScale *
      finalPopScale;
    const revealOffset =
      (1 - revealEase) *
      prepared.revealOffsetX *
      (prepared.revealDirection === 1 ? 1 : -1);
    const alpha =
      input.layerOpacity * lerp(prepared.sideAlpha, 1, depth) * revealEase;
    if (alpha <= 0.002) continue;

    const textureIndex = cardIndex % input.textures.length;
    const texture = input.textures[textureIndex];
    const textureWidth = Math.max(1, texture.width);
    const textureHeight = Math.max(1, texture.height);
    const baseTextureScale =
      prepared.cardSize / Math.max(textureWidth, textureHeight);
    const anchorOffsetX = (0.5 - input.transform.anchorX) * textureWidth;
    const anchorOffsetY = (0.5 - input.transform.anchorY) * textureHeight;
    const sideCompression = 1 - Math.pow(Math.abs(frontness), 1.6);
    const horizontalCompression = clampNumber(
      1 - sideCompression * (0.72 + prepared.perspective * 0.16),
      0.08,
      1.2,
    );
    const effectiveCurve = prepared.curve * clampNumber(sideAbs * 1.15, 0, 1);
    const baseScaleX = input.transform.scaleX * baseTextureScale * cardScale;
    const baseScaleY = input.transform.scaleY * baseTextureScale * cardScale;

    card.textureIndex = textureIndex;
    card.visible = true;
    card.x =
      input.emitterX +
      side *
        prepared.radius *
        prepared.perspectiveTravel *
        prepared.cardSpacing +
      revealOffset;
    card.y =
      input.emitterY +
      (1 - depth) * prepared.radius * 0.08 * prepared.perspective;
    card.rotation = baseRotation + side * prepared.tiltRadians;
    card.alpha = alpha;
    card.z = frontness + (isTargetCard ? finalEffectWave * 0.02 : 0);

    for (let sliceIndex = 0; sliceIndex < prepared.slices; sliceIndex += 1) {
      const slice = card.slices[sliceIndex];
      const x0 = (sliceIndex / prepared.slices) * textureWidth;
      const x1 = ((sliceIndex + 1) / prepared.slices) * textureWidth;
      const sliceWidth = Math.max(1, x1 - x0);
      const localT = ((sliceIndex + 0.5) / prepared.slices) * 2 - 1;
      const localSliceAngle = angle + localT * effectiveCurve * 0.95;
      const sliceFacing = Math.abs(Math.cos(localSliceAngle));
      const sliceWidthScale = clampNumber(0.16 + sliceFacing * 0.84, 0.1, 1.15);
      const bend =
        Math.sin(localT * Math.PI) *
        effectiveCurve *
        side *
        textureWidth *
        baseScaleX *
        0.045;
      const edgeShade =
        1 - Math.abs(localT) * prepared.shadeStrength * 0.16 * sideAbs;
      const depthShade = 1 - prepared.shadeStrength * (1 - depth);
      const targetGlow =
        isTargetCard && output.stopPhase > 0
          ? 1 + prepared.finalGlow * finalEffectWave
          : 1;
      const shade = clampNumber(edgeShade * depthShade * targetGlow, 0.08, 1);
      const tintChannel = Math.round(shade * 255);

      slice.frameX = texture.frameX + (x0 / textureWidth) * texture.frameWidth;
      slice.frameY = texture.frameY;
      slice.frameWidth = Math.max(
        1,
        (sliceWidth / textureWidth) * texture.frameWidth,
      );
      slice.frameHeight = texture.frameHeight;
      slice.x =
        (x0 + sliceWidth / 2 - textureWidth * 0.5 + anchorOffsetX) *
          baseScaleX *
          horizontalCompression +
        bend;
      slice.y = anchorOffsetY * baseScaleY;
      slice.scaleX = Math.max(0.01, baseScaleX * sliceWidthScale);
      slice.scaleY = Math.max(0.01, baseScaleY);
      slice.tint = (tintChannel << 16) | (tintChannel << 8) | tintChannel;
    }

    insertDrawOrder(output, cardIndex);
  }
  return output;
}

export function createCardCarousel3DContinuousMotion(
  prepared: VNICardCarousel3DPreparedConfig,
  elapsedSeconds: number,
): VNICardCarousel3DMotionSample {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error(
      "VNI card_carousel_3d continuous elapsedSeconds must be finite and non-negative.",
    );
  }
  return Object.freeze({
    rotation:
      prepared.introRotation +
      prepared.direction * prepared.idleSpeed * elapsedSeconds * TWO_PI,
    introElapsed: prepared.introDuration,
    stopPhase: 0,
    targetIndex: prepared.targetIndex,
  });
}

export function createCardCarousel3DResolvePlan(
  prepared: VNICardCarousel3DPreparedConfig,
  currentRotation: number,
  selectedCarrierIndex: number,
): VNICyclicResolvePlan {
  if (!Number.isFinite(currentRotation)) {
    throw new Error("VNI card_carousel_3d currentRotation must be finite.");
  }
  return createVNICyclicResolvePlan({
    snapshot: createVNICyclicMotionSnapshot({
      unwrappedTurns: currentRotation / TWO_PI,
      velocityTurnsPerSecond: prepared.direction * prepared.idleSpeed,
      carrierCount: prepared.cardCount,
    }),
    selectedCarrierIndex,
    direction: prepared.direction,
    rounds: prepared.rounds,
    fastRelativeTurns:
      sampleFastRotation(prepared, prepared.fastDuration) / TWO_PI,
    stopOvershoot: prepared.stopOvershoot,
  });
}

export function sampleCardCarousel3DResolveMotion(
  prepared: VNICardCarousel3DPreparedConfig,
  plan: VNICyclicResolvePlan,
  endingElapsedSeconds: number,
): VNICardCarousel3DMotionSample {
  if (!Number.isFinite(endingElapsedSeconds) || endingElapsedSeconds < 0) {
    throw new Error(
      "VNI card_carousel_3d endingElapsedSeconds must be finite and non-negative.",
    );
  }
  let rotation: number;
  let stopPhase = 0;
  if (endingElapsedSeconds < prepared.fastDuration) {
    rotation =
      plan.startTurns * TWO_PI +
      sampleFastRotation(prepared, endingElapsedSeconds);
  } else if (
    endingElapsedSeconds <
    prepared.fastDuration + prepared.stopDuration
  ) {
    stopPhase =
      (endingElapsedSeconds - prepared.fastDuration) / prepared.stopDuration;
    rotation = sampleVNICyclicResolveStopTurns(plan, stopPhase) * TWO_PI;
  } else {
    stopPhase = 1;
    rotation = plan.finalTurns * TWO_PI;
  }
  return Object.freeze({
    rotation,
    introElapsed: prepared.introDuration,
    stopPhase,
    targetIndex: plan.selectedCarrierIndex,
  });
}

export function getCardCarousel3DProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  return animation.type === "card_carousel_3d"
    ? getTimelineAnimationProgress(animation, time)
    : null;
}

export function getCardCarousel3DSyncedDuration(
  animation: V5GAnimationConfig,
): number {
  const mode = getStringParam(
    animation,
    "phasePreviewMode",
  ) as VNICardCarousel3DPhasePreviewMode;
  let duration: number;
  if (mode === "intro") duration = getNumberParam(animation, "introDuration");
  else if (mode === "idle")
    duration = getNumberParam(animation, "demoIdleDuration");
  else if (mode === "fast")
    duration = getNumberParam(animation, "fastDuration");
  else if (mode === "stop")
    duration = getNumberParam(animation, "stopDuration");
  else if (mode === "hold")
    duration = getNumberParam(animation, "holdDuration");
  else {
    duration =
      getNumberParam(animation, "introDuration") +
      getNumberParam(animation, "demoIdleDuration") +
      getNumberParam(animation, "fastDuration") +
      getNumberParam(animation, "stopDuration") +
      getNumberParam(animation, "holdDuration");
  }
  const snapped = Math.round(Math.round(duration / 0.05) * 0.05 * 100) / 100;
  return Math.min(3600, Math.max(0.05, snapped));
}

function samplePhase(
  prepared: VNICardCarousel3DPreparedConfig,
  progress: number,
  output: VNICardCarousel3DSampleBuffer,
): void {
  let rotation = 0;
  let introElapsed = prepared.introDuration;
  let stopPhase = 0;
  const mode = prepared.phasePreviewMode;
  if (mode === "intro") {
    introElapsed = progress * prepared.introDuration;
    rotation = prepared.direction * prepared.introSpeed * introElapsed * TWO_PI;
  } else if (mode === "idle") {
    rotation =
      prepared.direction *
      prepared.idleSpeed *
      progress *
      prepared.demoIdleDuration *
      TWO_PI;
  } else if (mode === "fast") {
    rotation = sampleFastRotation(prepared, progress * prepared.fastDuration);
  } else if (mode === "stop") {
    stopPhase = progress;
    rotation = sampleStopRotation(prepared, stopPhase);
  } else if (mode === "hold") {
    stopPhase = 1;
    rotation = prepared.stopFinalRotation;
  } else {
    const elapsed = progress * prepared.totalDuration;
    if (elapsed < prepared.introDuration) {
      introElapsed = elapsed;
      rotation = prepared.direction * prepared.introSpeed * elapsed * TWO_PI;
    } else if (elapsed < prepared.introDuration + prepared.demoIdleDuration) {
      const idleElapsed = elapsed - prepared.introDuration;
      rotation =
        prepared.introRotation +
        prepared.direction * prepared.idleSpeed * idleElapsed * TWO_PI;
    } else if (
      elapsed <
      prepared.introDuration + prepared.demoIdleDuration + prepared.fastDuration
    ) {
      const fastElapsed =
        elapsed - prepared.introDuration - prepared.demoIdleDuration;
      rotation =
        prepared.introRotation +
        prepared.idleRotation +
        sampleFastRotation(prepared, fastElapsed);
    } else if (
      elapsed <
      prepared.introDuration +
        prepared.demoIdleDuration +
        prepared.fastDuration +
        prepared.stopDuration
    ) {
      stopPhase =
        (elapsed -
          prepared.introDuration -
          prepared.demoIdleDuration -
          prepared.fastDuration) /
        prepared.stopDuration;
      rotation = sampleStopRotation(prepared, stopPhase);
    } else {
      stopPhase = 1;
      rotation = prepared.stopFinalRotation;
    }
  }
  output.rotation = rotation;
  output.introElapsed = introElapsed;
  output.stopPhase = stopPhase;
}

function sampleFastRotation(
  prepared: VNICardCarousel3DPreparedConfig,
  elapsed: number,
): number {
  return sampleFastRotationValues(
    elapsed,
    prepared.direction,
    prepared.idleSpeed,
    prepared.fastSpeed,
    prepared.fastDuration,
    prepared.accelRatio,
  );
}

function sampleFastRotationValues(
  elapsed: number,
  direction: 1 | -1,
  idleSpeed: number,
  fastSpeed: number,
  fastDuration: number,
  accelRatio: number,
): number {
  const fastElapsed = clampNumber(elapsed, 0, fastDuration);
  const accelSeconds = fastDuration * accelRatio;
  let turns: number;
  if (accelSeconds <= 0.0001 || fastElapsed >= accelSeconds) {
    const accelTurns =
      accelSeconds * (idleSpeed + (fastSpeed - idleSpeed) * 0.5);
    turns = accelTurns + fastSpeed * Math.max(0, fastElapsed - accelSeconds);
  } else {
    const accelPhase = fastElapsed / Math.max(accelSeconds, 0.0001);
    turns =
      idleSpeed * fastElapsed +
      (fastSpeed - idleSpeed) * fastElapsed * accelPhase * 0.5;
  }
  return direction * turns * TWO_PI;
}

function sampleStopRotation(
  prepared: VNICardCarousel3DPreparedConfig,
  phase: number,
): number {
  const t = clampNumber(phase, 0, 1);
  const overshoot =
    prepared.direction *
    prepared.angleStep *
    prepared.stopOvershoot *
    Math.sin(t * Math.PI) *
    Math.pow(t, 1.2);
  return (
    lerp(
      prepared.stopStartRotation,
      prepared.stopFinalRotation,
      easeOutQuart(t),
    ) + overshoot
  );
}

function createRevealRanks(
  cardCount: number,
  angleStep: number,
  revealDirection: 0 | 1 | 2,
): Int16Array {
  const indices = new Int16Array(cardCount);
  const sortKeys = new Float64Array(cardCount);
  for (let cardIndex = 0; cardIndex < cardCount; cardIndex += 1) {
    indices[cardIndex] = cardIndex;
    const baseSide = Math.sin(cardIndex * angleStep);
    sortKeys[cardIndex] =
      revealDirection === 2
        ? Math.abs(baseSide)
        : revealDirection === 1
          ? -baseSide
          : baseSide;
  }
  for (let index = 1; index < cardCount; index += 1) {
    const value = indices[index];
    const key = sortKeys[value];
    let cursor = index - 1;
    while (
      cursor >= 0 &&
      (sortKeys[indices[cursor]] > key ||
        (sortKeys[indices[cursor]] === key && indices[cursor] > value))
    ) {
      indices[cursor + 1] = indices[cursor];
      cursor -= 1;
    }
    indices[cursor + 1] = value;
  }
  const ranks = new Int16Array(cardCount);
  for (let rank = 0; rank < cardCount; rank += 1) {
    ranks[indices[rank]] = rank;
  }
  return ranks;
}

function insertDrawOrder(
  output: VNICardCarousel3DSampleBuffer,
  cardIndex: number,
): void {
  const z = output.cards[cardIndex].z;
  let cursor = output.visibleCardCount;
  while (cursor > 0) {
    const previousIndex = output.drawOrder[cursor - 1];
    const previous = output.cards[previousIndex];
    if (previous.z < z || (previous.z === z && previousIndex < cardIndex)) {
      break;
    }
    output.drawOrder[cursor] = previousIndex;
    cursor -= 1;
  }
  output.drawOrder[cursor] = cardIndex;
  output.visibleCardCount += 1;
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `VNI animation "${animation.id}" card_carousel_3d param "${key}" must be a finite number.`,
    );
  }
  return value;
}

function getStringParam(animation: V5GAnimationConfig, key: string): string {
  const value = animation.params[key];
  if (typeof value !== "string") {
    throw new Error(
      `VNI animation "${animation.id}" card_carousel_3d param "${key}" must be a string.`,
    );
  }
  return value;
}

function getBooleanParam(animation: V5GAnimationConfig, key: string): boolean {
  const value = animation.params[key];
  if (typeof value !== "boolean") {
    throw new Error(
      `VNI animation "${animation.id}" card_carousel_3d param "${key}" must be boolean.`,
    );
  }
  return value;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function easeOutQuad(value: number): number {
  return 1 - (1 - value) * (1 - value);
}

function easeOutQuart(value: number): number {
  return 1 - Math.pow(1 - value, 4);
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
