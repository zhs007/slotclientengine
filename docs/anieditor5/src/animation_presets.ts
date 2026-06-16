import { clampNumber, roundTo } from "./coordinates";
import type {
  V5GAnimationConfig,
  V5GAnimationParamValue,
  V5GAnimationType,
  V5GTransformConfig,
} from "./types";

export type V5GEasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "backOut";

export interface V5GAnimationParamSpec {
  key: string;
  label: string;
  inputType: "number" | "checkbox";
  defaultValue: V5GAnimationParamValue;
  min?: number;
  max?: number;
  step?: number;
  recommendedRange: string;
}

export interface V5GAnimationPresetSpec {
  type: V5GAnimationType;
  label: string;
  description: string;
  defaultDuration: number;
  recommendedDuration: string;
  defaultEasing: V5GEasingName;
  params: V5GAnimationParamSpec[];
}

export interface V5GAnimationSampleBase {
  transform: V5GTransformConfig;
  opacity: number;
}

export interface V5GAnimationSampleResult {
  transform: V5GTransformConfig;
  opacity: number;
}

export const V5G_EASINGS: { value: V5GEasingName; label: string }[] = [
  { value: "linear", label: "linear 匀速" },
  { value: "easeInQuad", label: "easeInQuad 渐快" },
  { value: "easeOutQuad", label: "easeOutQuad 渐慢" },
  { value: "easeInOutQuad", label: "easeInOutQuad 平滑" },
  { value: "backOut", label: "backOut 回弹" },
];

export const V5G_ANIMATION_PRESETS: V5GAnimationPresetSpec[] = [
  {
    type: "move",
    label: "Move 位移",
    description: "基于当前基础位置的相对位移。拖动图层后会从新位置开始播放。",
    defaultDuration: 3,
    recommendedDuration: "tips：0.5 ~ 5s",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "fromX",
        "from 偏移 X",
        0,
        -5000,
        5000,
        1,
        "fromX：相对当前基础 X 的起始偏移，-5000 ~ 5000",
      ),
      numberParam(
        "fromY",
        "from 偏移 Y",
        0,
        -5000,
        5000,
        1,
        "fromY：相对当前基础 Y 的起始偏移，-5000 ~ 5000",
      ),
      numberParam(
        "toX",
        "to 偏移 X",
        200,
        -5000,
        5000,
        1,
        "toX：相对当前基础 X 的结束偏移，-5000 ~ 5000",
      ),
      numberParam(
        "toY",
        "to 偏移 Y",
        0,
        -5000,
        5000,
        1,
        "toY：相对当前基础 Y 的结束偏移，-5000 ~ 5000",
      ),
    ],
  },
  {
    type: "slide_in",
    label: "Slide In 滑入",
    description: "从相对偏移位置滑入当前基础位置，可选同步淡入。",
    defaultDuration: 0.8,
    recommendedDuration: "tips：0.3 ~ 1.5s",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "fromX",
        "起始偏移 X",
        -500,
        -5000,
        5000,
        1,
        "fromX：相对当前基础 X 的滑入起点",
      ),
      numberParam(
        "fromY",
        "起始偏移 Y",
        0,
        -5000,
        5000,
        1,
        "fromY：相对当前基础 Y 的滑入起点",
      ),
      numberParam(
        "toX",
        "结束偏移 X",
        0,
        -5000,
        5000,
        1,
        "toX：通常为 0，表示回到基础 X",
      ),
      numberParam(
        "toY",
        "结束偏移 Y",
        0,
        -5000,
        5000,
        1,
        "toY：通常为 0，表示回到基础 Y",
      ),
      checkboxParam(
        "fadeIn",
        "同步淡入",
        true,
        "开启后透明度从 0 过渡到当前基础透明度",
      ),
    ],
  },
  {
    type: "slide_out",
    label: "Slide Out 滑出",
    description: "从当前基础位置滑出到相对偏移位置，可选同步淡出。",
    defaultDuration: 0.8,
    recommendedDuration: "tips：0.3 ~ 1.5s",
    defaultEasing: "easeInQuad",
    params: [
      numberParam(
        "fromX",
        "起始偏移 X",
        0,
        -5000,
        5000,
        1,
        "fromX：通常为 0，表示从基础 X 出发",
      ),
      numberParam(
        "fromY",
        "起始偏移 Y",
        0,
        -5000,
        5000,
        1,
        "fromY：通常为 0，表示从基础 Y 出发",
      ),
      numberParam(
        "toX",
        "结束偏移 X",
        500,
        -5000,
        5000,
        1,
        "toX：相对当前基础 X 的滑出终点",
      ),
      numberParam(
        "toY",
        "结束偏移 Y",
        0,
        -5000,
        5000,
        1,
        "toY：相对当前基础 Y 的滑出终点",
      ),
      checkboxParam(
        "fadeOut",
        "同步淡出",
        true,
        "开启后透明度从当前基础透明度过渡到 0",
      ),
    ],
  },
  {
    type: "fade",
    label: "Fade 淡入淡出",
    description: "透明度过渡。",
    defaultDuration: 1,
    recommendedDuration: "tips：0.3 ~ 2s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "fromOpacity",
        "from 透明度",
        0,
        0,
        1,
        0.05,
        "fromOpacity：0 ~ 1",
      ),
      numberParam("toOpacity", "to 透明度", 1, 0, 1, 0.05, "toOpacity：0 ~ 1"),
    ],
  },
  {
    type: "bounce_in",
    label: "Bounce In 回弹进入",
    description: "从小尺寸 Q 弹放大到基础缩放，并同步淡入。",
    defaultDuration: 0.8,
    recommendedDuration: "tips：0.4 ~ 1.2s",
    defaultEasing: "backOut",
    params: [
      numberParam(
        "fromScale",
        "起始缩放",
        0.2,
        0,
        5,
        0.05,
        "fromScale：0 ~ 5，0 表示从极小出现",
      ),
      numberParam(
        "toScale",
        "目标缩放",
        1,
        0.01,
        20,
        0.05,
        "toScale：相对基础缩放的倍率，1 表示回到基础缩放",
      ),
      numberParam(
        "overshoot",
        "回弹强度",
        1.7,
        0,
        5,
        0.1,
        "overshoot：0 ~ 5，数值越大越 Q 弹",
      ),
      checkboxParam(
        "fadeIn",
        "同步淡入",
        true,
        "开启后透明度从 0 过渡到当前基础透明度",
      ),
    ],
  },
  {
    type: "scale_up",
    label: "Scale Up 放大",
    description: "在基础缩放上放大到目标比例。",
    defaultDuration: 1,
    recommendedDuration: "tips：0.2 ~ 2s",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "fromScaleX",
        "起始缩放 X",
        1,
        0.01,
        20,
        0.05,
        "fromScaleX：0.2 ~ 3；0.01 ~ 20 可用",
      ),
      numberParam(
        "fromScaleY",
        "起始缩放 Y",
        1,
        0.01,
        20,
        0.05,
        "fromScaleY：0.2 ~ 3；0.01 ~ 20 可用",
      ),
      numberParam(
        "toScaleX",
        "目标缩放 X",
        1.2,
        0.01,
        20,
        0.05,
        "toScaleX：0.2 ~ 3；0.01 ~ 20 可用",
      ),
      numberParam(
        "toScaleY",
        "目标缩放 Y",
        1.2,
        0.01,
        20,
        0.05,
        "toScaleY：0.2 ~ 3；0.01 ~ 20 可用",
      ),
    ],
  },
  {
    type: "scale_down",
    label: "Scale Down 缩小",
    description: "在基础缩放上缩小到目标比例。",
    defaultDuration: 1,
    recommendedDuration: "tips：0.2 ~ 2s",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "fromScaleX",
        "起始缩放 X",
        1,
        0.01,
        20,
        0.05,
        "fromScaleX：0.2 ~ 3；0.01 ~ 20 可用",
      ),
      numberParam(
        "fromScaleY",
        "起始缩放 Y",
        1,
        0.01,
        20,
        0.05,
        "fromScaleY：0.2 ~ 3；0.01 ~ 20 可用",
      ),
      numberParam(
        "toScaleX",
        "目标缩放 X",
        0.85,
        0.01,
        20,
        0.05,
        "toScaleX：0.2 ~ 3；0.01 ~ 20 可用",
      ),
      numberParam(
        "toScaleY",
        "目标缩放 Y",
        0.85,
        0.01,
        20,
        0.05,
        "toScaleY：0.2 ~ 3；0.01 ~ 20 可用",
      ),
    ],
  },
  {
    type: "pulse",
    label: "Pulse 呼吸",
    description: "围绕基础缩放循环放大缩小，适合强调按钮、奖励图标。",
    defaultDuration: 2,
    recommendedDuration: "tips：1 ~ 4s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "scale",
        "最大倍率",
        1.1,
        0.01,
        20,
        0.05,
        "scale：最大缩放倍率，1.1 表示放大到 110%",
      ),
      numberParam(
        "cycles",
        "循环次数",
        2,
        0.25,
        20,
        0.25,
        "cycles：该动画持续时间内完成的呼吸次数",
      ),
    ],
  },
  {
    type: "float",
    label: "Float 悬浮",
    description: "基于当前基础位置上下漂浮，可调振幅和循环次数。",
    defaultDuration: 2,
    recommendedDuration: "tips：1 ~ 5s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "amplitude",
        "上下幅度",
        20,
        0,
        2000,
        1,
        "amplitude：上下漂浮的最大偏移",
      ),
      numberParam(
        "cycles",
        "循环次数",
        2,
        0.25,
        20,
        0.25,
        "cycles：该动画持续时间内完成的上下漂浮次数",
      ),
    ],
  },
  {
    type: "swing",
    label: "Swing 摇摆",
    description: "围绕基础旋转角左右摆动，适合挂饰、牌子、旗帜。",
    defaultDuration: 2,
    recommendedDuration: "tips：1 ~ 4s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "angle",
        "摆动角度°",
        12,
        0,
        180,
        1,
        "angle：左右摆动的最大角度",
      ),
      numberParam(
        "cycles",
        "循环次数",
        2,
        0.25,
        20,
        0.25,
        "cycles：该动画持续时间内完成的摇摆次数",
      ),
    ],
  },
  {
    type: "rotate",
    label: "Rotate 旋转",
    description: "旋转。",
    defaultDuration: 2,
    recommendedDuration: "tips：0.5 ~ 5s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "fromRotation",
        "from 旋转°",
        0,
        -3600,
        3600,
        1,
        "fromRotation：-3600° ~ 3600°",
      ),
      numberParam(
        "toRotation",
        "to 旋转°",
        360,
        -3600,
        3600,
        1,
        "toRotation：-3600° ~ 3600°",
      ),
    ],
  },
];

export function getAnimationPreset(
  type: string,
): V5GAnimationPresetSpec | undefined {
  return V5G_ANIMATION_PRESETS.find((preset) => preset.type === type);
}

export function createDefaultAnimationParams(
  type: V5GAnimationType,
  base: V5GAnimationSampleBase,
): Record<string, V5GAnimationParamValue> {
  if (type === "move") {
    return {
      fromX: 0,
      fromY: 0,
      toX: 200,
      toY: 0,
      baseX: 0,
      baseY: 0,
    };
  }
  if (type === "slide_in") {
    return { fromX: -500, fromY: 0, toX: 0, toY: 0, fadeIn: true };
  }
  if (type === "slide_out") {
    return { fromX: 0, fromY: 0, toX: 500, toY: 0, fadeOut: true };
  }
  if (type === "fade") {
    return { fromOpacity: 0, toOpacity: roundTo(base.opacity, 3) };
  }
  if (type === "bounce_in") {
    return { fromScale: 0.2, toScale: 1, overshoot: 1.7, fadeIn: true };
  }
  if (type === "scale_up") {
    const baseScaleX = Math.abs(base.transform.scaleX) || 1;
    const baseScaleY = Math.abs(base.transform.scaleY) || 1;
    return {
      fromScaleX: roundTo(baseScaleX, 3),
      fromScaleY: roundTo(baseScaleY, 3),
      toScaleX: roundTo(baseScaleX * 1.2, 3),
      toScaleY: roundTo(baseScaleY * 1.2, 3),
    };
  }
  if (type === "scale_down") {
    const baseScaleX = Math.abs(base.transform.scaleX) || 1;
    const baseScaleY = Math.abs(base.transform.scaleY) || 1;
    return {
      fromScaleX: roundTo(baseScaleX, 3),
      fromScaleY: roundTo(baseScaleY, 3),
      toScaleX: roundTo(baseScaleX * 0.85, 3),
      toScaleY: roundTo(baseScaleY * 0.85, 3),
    };
  }
  if (type === "pulse") return { scale: 1.1, cycles: 2 };
  if (type === "float") return { amplitude: 20, cycles: 2 };
  if (type === "swing") return { angle: 12, cycles: 2 };
  if (type === "rotate") {
    return {
      fromRotation: 0,
      toRotation: 360,
    };
  }
  return {};
}

export function sampleLayerAnimationsAtTime(
  base: V5GAnimationSampleBase,
  animations: V5GAnimationConfig[],
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
    const easedProgress = easeProgress(
      progress,
      String(
        animation.params.easing ??
          getAnimationPreset(animation.type)?.defaultEasing ??
          "linear",
      ),
    );
    if (animation.type === "move")
      sampleMove(result, animation, easedProgress, base.transform);
    else if (animation.type === "slide_in" || animation.type === "slide_out")
      sampleSlide(result, animation, easedProgress, base);
    else if (animation.type === "fade")
      sampleFade(result, animation, easedProgress);
    else if (animation.type === "bounce_in")
      sampleBounceIn(result, animation, progress, base);
    else if (animation.type === "scale_up" || animation.type === "scale_down")
      sampleScale(result, animation, easedProgress, base.transform);
    else if (animation.type === "pulse")
      samplePulse(result, animation, progress, base.transform);
    else if (animation.type === "float")
      sampleFloat(result, animation, progress, base.transform);
    else if (animation.type === "swing")
      sampleSwing(result, animation, progress, base.transform);
    else if (animation.type === "rotate")
      sampleRotate(result, animation, easedProgress, base.transform);
  }
  result.transform.x = roundTo(result.transform.x, 4);
  result.transform.y = roundTo(result.transform.y, 4);
  result.transform.scaleX = roundTo(result.transform.scaleX, 4);
  result.transform.scaleY = roundTo(result.transform.scaleY, 4);
  result.transform.rotation = roundTo(result.transform.rotation, 4);
  result.opacity = roundTo(clampNumber(result.opacity, 0, 1), 4);
  return result;
}

export function easeProgress(progress: number, easing: string): number {
  const t = clampNumber(progress, 0, 1);
  if (easing === "easeInQuad") return t * t;
  if (easing === "easeOutQuad") return 1 - (1 - t) * (1 - t);
  if (easing === "easeInOutQuad")
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  if (easing === "backOut") return backOutProgress(t, 1.70158);
  return t;
}

export function isV5GAnimationType(value: string): value is V5GAnimationType {
  return V5G_ANIMATION_PRESETS.some((preset) => preset.type === value);
}

function sampleMove(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  const fromX = getNumberParam(animation, "fromX", 0);
  const fromY = getNumberParam(animation, "fromY", 0);
  const originX = getNumberParam(animation, "baseX", fromX);
  const originY = getNumberParam(animation, "baseY", fromY);
  result.transform.x =
    baseTransform.x +
    lerp(fromX, getNumberParam(animation, "toX", fromX), progress) -
    originX;
  result.transform.y =
    baseTransform.y +
    lerp(fromY, getNumberParam(animation, "toY", fromY), progress) -
    originY;
}

function sampleSlide(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  result.transform.x =
    base.transform.x +
    lerp(
      getNumberParam(animation, "fromX", 0),
      getNumberParam(animation, "toX", 0),
      progress,
    );
  result.transform.y =
    base.transform.y +
    lerp(
      getNumberParam(animation, "fromY", 0),
      getNumberParam(animation, "toY", 0),
      progress,
    );
  if (
    animation.type === "slide_in" &&
    getBooleanParam(animation, "fadeIn", true)
  ) {
    result.opacity = lerp(0, base.opacity, progress);
  }
  if (
    animation.type === "slide_out" &&
    getBooleanParam(animation, "fadeOut", true)
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
    getNumberParam(animation, "fromOpacity", result.opacity),
    getNumberParam(animation, "toOpacity", result.opacity),
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
    getNumberParam(animation, "overshoot", 1.7),
  );
  const fromScale = getNumberParam(animation, "fromScale", 0.2);
  const toScale = getNumberParam(animation, "toScale", 1);
  const scaleRatio = Math.max(0, lerp(fromScale, toScale, ratio));
  result.transform.scaleX = base.transform.scaleX * scaleRatio;
  result.transform.scaleY = base.transform.scaleY * scaleRatio;
  if (getBooleanParam(animation, "fadeIn", true)) {
    result.opacity = lerp(0, base.opacity, clampNumber(progress * 1.25, 0, 1));
  }
}

function sampleScale(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  const fromScaleX = getNumberParam(
    animation,
    "fromScaleX",
    baseTransform.scaleX,
  );
  const fromScaleY = getNumberParam(
    animation,
    "fromScaleY",
    baseTransform.scaleY,
  );
  const toScaleX = getNumberParam(animation, "toScaleX", baseTransform.scaleX);
  const toScaleY = getNumberParam(animation, "toScaleY", baseTransform.scaleY);
  const signX = getScaleSign(baseTransform.scaleX);
  const signY = getScaleSign(baseTransform.scaleY);
  result.transform.scaleX =
    signX * Math.abs(lerp(fromScaleX, toScaleX, progress));
  result.transform.scaleY =
    signY * Math.abs(lerp(fromScaleY, toScaleY, progress));
}

function samplePulse(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  const maxScale = getNumberParam(animation, "scale", 1.1);
  const cycle = getLoopWave(progress, getNumberParam(animation, "cycles", 2));
  const scaleRatio = lerp(1, maxScale, cycle);
  result.transform.scaleX = baseTransform.scaleX * scaleRatio;
  result.transform.scaleY = baseTransform.scaleY * scaleRatio;
}

function sampleFloat(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  const amplitude = getNumberParam(animation, "amplitude", 20);
  const cycles = getNumberParam(animation, "cycles", 2);
  result.transform.y =
    baseTransform.y + Math.sin(progress * Math.PI * 2 * cycles) * amplitude;
}

function sampleSwing(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  const angle = getNumberParam(animation, "angle", 12);
  const cycles = getNumberParam(animation, "cycles", 2);
  result.transform.rotation =
    baseTransform.rotation + Math.sin(progress * Math.PI * 2 * cycles) * angle;
}

function sampleRotate(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  baseTransform: V5GTransformConfig,
): void {
  result.transform.rotation =
    baseTransform.rotation +
    lerp(
      getNumberParam(animation, "fromRotation", 0),
      getNumberParam(animation, "toRotation", 0),
      progress,
    );
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

function getNumberParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: number,
): number {
  const value = animation.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBooleanParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: boolean,
): boolean {
  const value = animation.params[key];
  return typeof value === "boolean" ? value : fallback;
}

function numberParam(
  key: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  step: number,
  recommendedRange: string,
): V5GAnimationParamSpec {
  return {
    key,
    label,
    inputType: "number",
    defaultValue,
    min,
    max,
    step,
    recommendedRange,
  };
}

function checkboxParam(
  key: string,
  label: string,
  defaultValue: boolean,
  recommendedRange: string,
): V5GAnimationParamSpec {
  return {
    key,
    label,
    inputType: "checkbox",
    defaultValue,
    recommendedRange,
  };
}

function getScaleSign(scale: number): number {
  return scale < 0 ? -1 : 1;
}

function getLoopWave(progress: number, cycles: number): number {
  return (1 - Math.cos(progress * Math.PI * 2 * cycles)) / 2;
}

function backOutProgress(progress: number, overshoot: number): number {
  const t = clampNumber(progress, 0, 1);
  const c1 = Math.max(0, overshoot);
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * clampNumber(ratio, 0, 1);
}
