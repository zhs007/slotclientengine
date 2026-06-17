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
    type: "scale_in",
    label: "Scale In 缩放进入",
    description: "从指定倍率缩放进入到基础尺寸，可选同步淡入。",
    defaultDuration: 0.6,
    recommendedDuration: "tips：0.2 ~ 1s",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "fromScale",
        "起始倍率",
        0,
        0,
        20,
        0.05,
        "fromScale：相对基础缩放的起始倍率",
      ),
      numberParam(
        "toScale",
        "目标倍率",
        1,
        0,
        20,
        0.05,
        "toScale：1 表示回到基础缩放",
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
    type: "scale_out",
    label: "Scale Out 缩放退出",
    description: "从基础尺寸缩放退出到指定倍率，可选同步淡出。",
    defaultDuration: 0.5,
    recommendedDuration: "tips：0.2 ~ 1s",
    defaultEasing: "easeInQuad",
    params: [
      numberParam(
        "fromScale",
        "起始倍率",
        1,
        0,
        20,
        0.05,
        "fromScale：1 表示从基础缩放出发",
      ),
      numberParam(
        "toScale",
        "目标倍率",
        0,
        0,
        20,
        0.05,
        "toScale：0 表示缩到不可见",
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
    type: "pop",
    label: "Pop 弹一下",
    description: "快速放大到峰值再回落，适合奖励数字、按钮反馈和强调提示。",
    defaultDuration: 0.45,
    recommendedDuration: "tips：0.2 ~ 0.8s",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "peakScale",
        "峰值倍率",
        1.25,
        0.01,
        20,
        0.05,
        "peakScale：弹起时的最大倍率",
      ),
      numberParam(
        "settleScale",
        "回落倍率",
        1,
        0.01,
        20,
        0.05,
        "settleScale：结束时相对基础缩放的倍率",
      ),
      numberParam(
        "peakAt",
        "峰值时间",
        0.38,
        0.05,
        0.95,
        0.05,
        "peakAt：0~1，数值越小弹起越快",
      ),
    ],
  },
  {
    type: "shake",
    label: "Shake 抖动",
    description: "围绕基础位置做水平或 XY 抖动，适合冲击、警告、强调。",
    defaultDuration: 0.5,
    recommendedDuration: "tips：0.2 ~ 1s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "amplitudeX",
        "水平幅度",
        18,
        0,
        1000,
        1,
        "amplitudeX：左右抖动最大偏移",
      ),
      numberParam(
        "amplitudeY",
        "垂直幅度",
        0,
        0,
        1000,
        1,
        "amplitudeY：上下抖动最大偏移",
      ),
      numberParam(
        "cycles",
        "抖动次数",
        6,
        1,
        60,
        1,
        "cycles：该动画持续时间内抖动次数",
      ),
      checkboxParam("decay", "逐渐减弱", true, "开启后抖动幅度随时间衰减为 0"),
    ],
  },
  {
    type: "blink",
    label: "Blink 闪烁",
    description: "在最小和最大透明度之间闪烁，适合提示、光标和高亮。",
    defaultDuration: 1,
    recommendedDuration: "tips：0.3 ~ 3s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "minOpacity",
        "最低透明度",
        0.15,
        0,
        1,
        0.05,
        "minOpacity：闪烁最低透明度 0~1",
      ),
      numberParam(
        "maxOpacity",
        "最高透明度",
        1,
        0,
        1,
        0.05,
        "maxOpacity：闪烁最高透明度 0~1",
      ),
      numberParam(
        "blinks",
        "闪烁次数",
        3,
        0.5,
        30,
        0.5,
        "blinks：该动画持续时间内闪烁次数",
      ),
      numberParam(
        "endOpacity",
        "结束透明度",
        1,
        0,
        1,
        0.05,
        "endOpacity：动画结束瞬间的透明度",
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
    type: "particles",
    label: "Particles 粒子爆发",
    description:
      "使用当前图片图层的图片本身作为粒子纹理，从图层当前位置向外爆发扩散；可与位移、抖动、缩放同时播放。",
    defaultDuration: 1.2,
    recommendedDuration: "tips：0.5 ~ 2s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "count",
        "粒子数量",
        32,
        1,
        200,
        1,
        "count：1 ~ 200，数量越多效果越密集",
      ),
      numberParam(
        "spread",
        "初始扩散半径",
        70,
        0,
        1000,
        1,
        "spread：粒子从图层中心附近散开的初始范围",
      ),
      numberParam(
        "speed",
        "爆发速度",
        180,
        0,
        2000,
        1,
        "speed：粒子向外飞散的速度",
      ),
      numberParam(
        "size",
        "粒子大小",
        48,
        1,
        400,
        1,
        "size：图片粒子的目标最长边像素，适合星光/金币/碎片等小图",
      ),
      numberParam(
        "gravity",
        "下落重力",
        90,
        -2000,
        2000,
        1,
        "gravity：正数向下坠落，负数向上漂浮",
      ),
      checkboxParam("fadeOut", "逐渐消失", true, "开启后粒子会随时间淡出"),
    ],
  },
  {
    type: "particle_twinkle",
    label: "Particle Twinkle 随机闪烁粒子",
    description:
      "使用当前图片图层的图片作为闪烁粒子，在指定圆形范围内按随机批次生成并闪烁，适合星光、萤火、背景光点。",
    defaultDuration: 3,
    recommendedDuration: "tips：1 ~ 10s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "radius",
        "圆形范围半径",
        240,
        0,
        3000,
        1,
        "radius：粒子在图层中心周围随机出现的圆形半径",
      ),
      numberParam(
        "count",
        "总生成数量",
        60,
        1,
        1000,
        1,
        "count：整个动画期间最多生成的粒子总数",
      ),
      numberParam(
        "spawnInterval",
        "生成间隔秒",
        0.12,
        0.01,
        10,
        0.01,
        "spawnInterval：每隔多少秒生成一批粒子，数值越小生成越快",
      ),
      numberParam(
        "twinkleDuration",
        "单颗闪烁秒",
        0.45,
        0.03,
        10,
        0.01,
        "twinkleDuration：每颗粒子从亮起到消失的时间",
      ),
      numberParam(
        "batchMin",
        "每批最少数量",
        1,
        1,
        100,
        1,
        "batchMin：每次生成时至少同时出现多少颗",
      ),
      numberParam(
        "batchMax",
        "每批最多数量",
        3,
        1,
        100,
        1,
        "batchMax：每次生成时最多同时出现多少颗",
      ),
      numberParam(
        "size",
        "粒子大小",
        48,
        1,
        400,
        1,
        "size：图片闪烁粒子的目标最长边像素",
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
  if (type === "scale_in") return { fromScale: 0, toScale: 1, fadeIn: true };
  if (type === "scale_out") return { fromScale: 1, toScale: 0, fadeOut: true };
  if (type === "pop") return { peakScale: 1.25, settleScale: 1, peakAt: 0.38 };
  if (type === "shake") {
    return { amplitudeX: 18, amplitudeY: 0, cycles: 6, decay: true };
  }
  if (type === "blink") {
    return { minOpacity: 0.15, maxOpacity: 1, blinks: 3, endOpacity: 1 };
  }
  if (type === "pulse") return { scale: 1.1, cycles: 2 };
  if (type === "float") return { amplitude: 20, cycles: 2 };
  if (type === "swing") return { angle: 12, cycles: 2 };
  if (type === "particles") {
    return {
      count: 32,
      spread: 70,
      speed: 180,
      size: 48,
      gravity: 90,
      fadeOut: true,
    };
  }
  if (type === "particle_twinkle") {
    return {
      radius: 240,
      count: 60,
      spawnInterval: 0.12,
      twinkleDuration: 0.45,
      batchMin: 1,
      batchMax: 3,
      size: 48,
    };
  }
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
): void {
  const fromX = getNumberParam(animation, "fromX", 0);
  const fromY = getNumberParam(animation, "fromY", 0);
  const originX = getNumberParam(animation, "baseX", fromX);
  const originY = getNumberParam(animation, "baseY", fromY);
  result.transform.x +=
    lerp(fromX, getNumberParam(animation, "toX", fromX), progress) - originX;
  result.transform.y +=
    lerp(fromY, getNumberParam(animation, "toY", fromY), progress) - originY;
}

function sampleSlide(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  result.transform.x += lerp(
    getNumberParam(animation, "fromX", 0),
    getNumberParam(animation, "toX", 0),
    progress,
  );
  result.transform.y += lerp(
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
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
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
  const baseScaleX = Math.abs(baseTransform.scaleX) || 1;
  const baseScaleY = Math.abs(baseTransform.scaleY) || 1;
  const fromScaleX = getNumberParam(animation, "fromScaleX", baseScaleX);
  const fromScaleY = getNumberParam(animation, "fromScaleY", baseScaleY);
  const toScaleX = getNumberParam(animation, "toScaleX", baseScaleX);
  const toScaleY = getNumberParam(animation, "toScaleY", baseScaleY);
  const scaleRatioX = lerp(fromScaleX, toScaleX, progress) / baseScaleX;
  const scaleRatioY = lerp(fromScaleY, toScaleY, progress) / baseScaleY;
  result.transform.scaleX *= Math.abs(scaleRatioX);
  result.transform.scaleY *= Math.abs(scaleRatioY);
}

function sampleScaleEntryExit(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  const fromScale = getNumberParam(animation, "fromScale", 1);
  const toScale = getNumberParam(animation, "toScale", 1);
  const scaleRatio = Math.max(0, lerp(fromScale, toScale, progress));
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
  if (
    animation.type === "scale_in" &&
    getBooleanParam(animation, "fadeIn", true)
  ) {
    result.opacity = lerp(0, base.opacity, progress);
  }
  if (
    animation.type === "scale_out" &&
    getBooleanParam(animation, "fadeOut", true)
  ) {
    result.opacity = lerp(base.opacity, 0, progress);
  }
}

function samplePop(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const peakAt = clampNumber(
    getNumberParam(animation, "peakAt", 0.38),
    0.05,
    0.95,
  );
  const peakScale = getNumberParam(animation, "peakScale", 1.25);
  const settleScale = getNumberParam(animation, "settleScale", 1);
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
  const cycles = getNumberParam(animation, "cycles", 6);
  const decay = getBooleanParam(animation, "decay", true) ? 1 - progress : 1;
  const waveX = Math.sin(progress * Math.PI * 2 * cycles);
  const waveY = Math.cos(progress * Math.PI * 2 * cycles * 1.37);
  result.transform.x +=
    getNumberParam(animation, "amplitudeX", 18) * waveX * decay;
  result.transform.y +=
    getNumberParam(animation, "amplitudeY", 0) * waveY * decay;
}

function sampleBlink(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  if (progress >= 1) {
    result.opacity = getNumberParam(animation, "endOpacity", result.opacity);
    return;
  }
  const minOpacity = getNumberParam(animation, "minOpacity", 0.15);
  const maxOpacity = getNumberParam(animation, "maxOpacity", 1);
  const blinks = getNumberParam(animation, "blinks", 3);
  const wave = getLoopWave(progress, blinks);
  result.opacity = lerp(maxOpacity, minOpacity, wave);
}

function samplePulse(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const maxScale = getNumberParam(animation, "scale", 1.1);
  const cycle = getLoopWave(progress, getNumberParam(animation, "cycles", 2));
  const scaleRatio = lerp(1, maxScale, cycle);
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
}

function sampleFloat(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const amplitude = getNumberParam(animation, "amplitude", 20);
  const cycles = getNumberParam(animation, "cycles", 2);
  result.transform.y += Math.sin(progress * Math.PI * 2 * cycles) * amplitude;
}

function sampleSwing(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const angle = getNumberParam(animation, "angle", 12);
  const cycles = getNumberParam(animation, "cycles", 2);
  result.transform.rotation +=
    Math.sin(progress * Math.PI * 2 * cycles) * angle;
}

function sampleRotate(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  result.transform.rotation += lerp(
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
