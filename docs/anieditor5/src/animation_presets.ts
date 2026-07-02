import { clampNumber, roundTo } from "./coordinates";
import type {
  V5GAnimationConfig,
  V5GAnimationParamValue,
  V5GAnimationType,
  V5GTransformConfig,
} from "./types";

export type V5GEasingName =
  "linear" | "easeInQuad" | "easeOutQuad" | "easeInOutQuad" | "backOut";

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

export type V5GAnimationCategory = "animation" | "particle";

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
    type: "idle",
    label: "Idle 待机",
    description: "保持不动，仅控制该时间段内图层可见。可修改持续时间。",
    defaultDuration: 2,
    recommendedDuration: "tips：0.5 ~ 10s",
    defaultEasing: "linear",
    params: [],
  },
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
        "emissionAngle",
        "发射角度°",
        270,
        0,
        360,
        1,
        "emissionAngle：粒子主要发射方向，0=右 90=下 180=左 270=上；做烟花建议 270",
      ),
      numberParam(
        "emissionSpreadAngle",
        "扩散角度°",
        360,
        0,
        360,
        1,
        "emissionSpreadAngle：围绕发射角度随机扩散的角度范围，360=全方向爆发，烟花建议 20~60",
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
      numberParam(
        "trailCount",
        "拖尾层数",
        2,
        0,
        8,
        1,
        "trailCount：每颗粒子最多绘制多少层拖尾；手机保护会把实际总绘制量限制在约 320 个 sprite",
      ),
      numberParam(
        "trailSpacing",
        "拖尾间距",
        0.035,
        0.005,
        0.2,
        0.005,
        "trailSpacing：拖尾每层回退的时间间隔，越大拖尾拉得越开",
      ),
      numberParam(
        "trailFade",
        "拖尾衰减",
        0.5,
        0.05,
        0.95,
        0.05,
        "trailFade：拖尾透明度衰减，越大拖尾越明显",
      ),
      checkboxParam(
        "rotateParticles",
        "粒子旋转",
        true,
        "关闭后粒子保持不旋转，适合需要方向统一的图片",
      ),
      checkboxParam(
        "randomRotation",
        "随机初始角度",
        true,
        "开启后每颗粒子会有随机初始角度",
      ),
      numberParam(
        "randomRotationDegrees",
        "随机角度范围°",
        135,
        0,
        360,
        1,
        "randomRotationDegrees：随机初始角度总范围，0=不随机，360=全角度随机",
      ),
      numberParam(
        "spinSpeed",
        "旋转速度",
        1,
        0,
        10,
        0.1,
        "spinSpeed：飞散过程的旋转速度倍率，0=不随时间旋转",
      ),
    ],
  },
  {
    type: "particle_stream",
    label: "Particle Stream 持续发射",
    description:
      "使用当前图片图层作为粒子纹理，在动画持续时间内按固定频率连续发射；整体发射窗口由时间轴的开始秒/持续秒控制，不额外设置重复的持续时间。",
    defaultDuration: 3,
    recommendedDuration: "tips：1 ~ 10s；持续时间直接改动画模块的持续秒",
    defaultEasing: "linear",
    params: [
      numberParam(
        "spawnRate",
        "每秒发射数",
        24,
        1,
        300,
        1,
        "spawnRate：每秒生成多少颗粒子，数值越大越密集也越耗性能",
      ),
      numberParam(
        "lifetime",
        "单颗存活秒",
        1.2,
        0.05,
        10,
        0.01,
        "lifetime：每颗粒子从出生到消失的时间；整体持续时间请改动画模块持续秒",
      ),
      numberParam(
        "spread",
        "初始扩散半径",
        12,
        0,
        1000,
        1,
        "spread：粒子出生点在图层中心附近的随机扩散范围",
      ),
      numberParam(
        "speed",
        "发射速度",
        220,
        0,
        2000,
        1,
        "speed：粒子沿发射方向飞行的速度",
      ),
      numberParam(
        "emissionAngle",
        "发射角度°",
        270,
        0,
        360,
        1,
        "emissionAngle：粒子主要发射方向，0=右 90=下 180=左 270=上",
      ),
      numberParam(
        "emissionSpreadAngle",
        "扩散角度°",
        30,
        0,
        360,
        1,
        "emissionSpreadAngle：围绕发射角度随机扩散的角度范围，喷射建议 10~60，360=全方向",
      ),
      numberParam(
        "size",
        "粒子大小",
        48,
        1,
        400,
        1,
        "size：图片粒子的目标最长边像素",
      ),
      numberParam(
        "gravity",
        "下落重力",
        180,
        -2000,
        2000,
        1,
        "gravity：正数向下坠落，负数向上漂浮",
      ),
      checkboxParam("fadeOut", "逐渐消失", true, "开启后粒子会随寿命淡出"),
      numberParam(
        "trailCount",
        "拖尾层数",
        2,
        0,
        8,
        1,
        "trailCount：每颗粒子最多绘制多少层拖尾；手机保护会限制实际总绘制量",
      ),
      numberParam(
        "trailSpacing",
        "拖尾间距秒",
        0.035,
        0.005,
        0.2,
        0.005,
        "trailSpacing：拖尾每层回退的秒数，越大拖尾拉得越开",
      ),
      numberParam(
        "trailFade",
        "拖尾衰减",
        0.5,
        0.05,
        0.95,
        0.05,
        "trailFade：拖尾透明度衰减，越大拖尾越明显",
      ),
      checkboxParam(
        "rotateParticles",
        "粒子旋转",
        true,
        "关闭后粒子保持不旋转，适合方向统一的图片",
      ),
      checkboxParam(
        "randomRotation",
        "随机初始角度",
        true,
        "开启后每颗粒子会有随机初始角度",
      ),
      numberParam(
        "randomRotationDegrees",
        "随机角度范围°",
        135,
        0,
        360,
        1,
        "randomRotationDegrees：随机初始角度总范围，0=不随机，360=全角度随机",
      ),
      numberParam(
        "spinSpeed",
        "旋转速度",
        1,
        0,
        10,
        0.1,
        "spinSpeed：飞行过程的旋转速度倍率，0=不随时间旋转",
      ),
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
    type: "particle_wall",
    label: "Particle Wall 粒子幕墙",
    description:
      "使用当前图层图片为粒子纹理，在发射区域宽度内随机生成，向指定方向持续发射并淡出消失，形成持续粒子流幕墙效果。",
    defaultDuration: 3,
    recommendedDuration: "tips：1 ~ 10s",
    defaultEasing: "linear",
    params: [
      numberParam(
        "emitterWidth",
        "发射区宽度",
        300,
        0,
        3000,
        1,
        "emitterWidth：粒子在发射边缘随机生成的宽度范围",
      ),
      numberParam(
        "direction",
        "发射角度°",
        270,
        0,
        360,
        1,
        "direction：粒子发射方向角度，0=正右 90=正下 180=正左 270=正上",
      ),
      numberParam(
        "spreadAngle",
        "扩散角度°",
        15,
        0,
        180,
        1,
        "spreadAngle：在发射方向两侧随机扩散的最大角度",
      ),
      numberParam(
        "speed",
        "飞行速度",
        200,
        0,
        2000,
        1,
        "speed：粒子飞行的像素/秒速度",
      ),
      numberParam(
        "lifetimeMin",
        "最短存活秒",
        0.8,
        0.05,
        10,
        0.01,
        "lifetimeMin：每颗粒子的最短存活时间",
      ),
      numberParam(
        "lifetimeMax",
        "最长存活秒",
        2,
        0.05,
        10,
        0.01,
        "lifetimeMax：每颗粒子的最长存活时间（实际在两者间随机）",
      ),
      numberParam(
        "spawnRate",
        "每秒生成数",
        30,
        1,
        500,
        1,
        "spawnRate：每秒生成多少颗粒子",
      ),
      numberParam(
        "size",
        "粒子大小",
        48,
        1,
        400,
        1,
        "size：图片粒子的目标最长边像素",
      ),
      numberParam(
        "gravity",
        "重力",
        0,
        -2000,
        2000,
        1,
        "gravity：0=无重力，正数向下加速，负数向上加速",
      ),
      numberParam(
        "startScaleMin",
        "起始缩放最小",
        0.6,
        0.01,
        2,
        0.01,
        "startScaleMin：粒子出生时最小缩放随机下限",
      ),
      numberParam(
        "startScaleMax",
        "起始缩放最大",
        1,
        0.01,
        2,
        0.01,
        "startScaleMax：粒子出生时最大缩放随机上限",
      ),
      numberParam(
        "endScaleMin",
        "结束缩放最小",
        0.3,
        0.01,
        2,
        0.01,
        "endScaleMin：粒子消失时最小缩放随机下限",
      ),
      numberParam(
        "endScaleMax",
        "结束缩放最大",
        0.8,
        0.01,
        2,
        0.01,
        "endScaleMax：粒子消失时最大缩放随机上限",
      ),
      checkboxParam("fadeOut", "逐渐消失", true, "开启后粒子会随时间淡出"),
    ],
  },
  {
    type: "particle_combo",
    label: "Particle Combo 三段粒子",
    description:
      "组合粒子效果：粒子生成 → 沿直线/曲线/绕圈轨迹移动 → 在目标点淡出、闪亮或放大消失。使用当前图片图层作为粒子纹理。模式参数：spawnMode 0=范围随机 1=中心发散；travelMode 0=直线 1=曲线 2=绕圈后飞；vanishMode 0=淡出 1=亮一下 2=放大淡出。",
    defaultDuration: 2.2,
    recommendedDuration: "tips：1 ~ 5s；用错峰和拖尾避免粒子挤在一起",
    defaultEasing: "easeInOutQuad",
    params: [
      numberParam(
        "count",
        "粒子数量",
        36,
        1,
        300,
        1,
        "count：1~300，数量越大越密集",
      ),
      numberParam(
        "size",
        "粒子大小",
        42,
        1,
        400,
        1,
        "size：粒子贴图最长边像素",
      ),
      numberParam(
        "sourceOpacity",
        "原图层透明度",
        0,
        0,
        1,
        0.05,
        "sourceOpacity：播放粒子时原始图层自身的透明度，0=只显示粒子",
      ),
      numberParam(
        "spawnMode",
        "生成模式 0/1",
        1,
        0,
        1,
        1,
        "spawnMode：0=目标范围内随机出现；1=从中心发散到随机范围",
      ),
      numberParam(
        "spawnRadius",
        "生成半径",
        90,
        0,
        3000,
        1,
        "spawnRadius：起点周围随机生成/发散的半径",
      ),
      numberParam(
        "spawnRatio",
        "生成阶段占比",
        0.18,
        0.01,
        0.8,
        0.01,
        "spawnRatio：总时长中用于生成的比例",
      ),
      numberParam(
        "targetX",
        "目标偏移 X",
        320,
        -5000,
        5000,
        1,
        "targetX：目标点相对图层中心的 X 偏移",
      ),
      numberParam(
        "targetY",
        "目标偏移 Y",
        0,
        -5000,
        5000,
        1,
        "targetY：目标点相对图层中心的 Y 偏移，正数向上",
      ),
      numberParam(
        "travelMode",
        "移动模式 0/1/2",
        1,
        0,
        2,
        1,
        "travelMode：0=直线；1=曲线；2=先绕圈再飞向目标",
      ),
      numberParam(
        "curve",
        "曲线弯曲",
        160,
        -3000,
        3000,
        1,
        "curve：曲线控制点偏移；正负决定弯曲方向",
      ),
      numberParam(
        "orbitRadius",
        "绕圈半径",
        80,
        0,
        3000,
        1,
        "orbitRadius：travelMode=2 时的原地绕圈半径",
      ),
      numberParam(
        "orbitTurns",
        "绕圈圈数",
        1,
        -10,
        10,
        0.25,
        "orbitTurns：绕圈圈数，负数反向",
      ),
      numberParam(
        "orbitSpeed",
        "绕圈速度",
        1,
        0.1,
        5,
        0.1,
        "orbitSpeed：绕圈阶段速度倍率，越大越快结束绕圈并飞出",
      ),
      numberParam(
        "orbitRatio",
        "绕圈阶段占比",
        0.35,
        0.05,
        0.9,
        0.01,
        "orbitRatio：travelMode=2 时，移动阶段里用于绕圈的比例",
      ),
      numberParam(
        "staggerRatio",
        "粒子错峰占比",
        0.28,
        0,
        0.9,
        0.01,
        "staggerRatio：粒子依次出发的时间错峰比例，避免挤在一起",
      ),
      numberParam(
        "trailCount",
        "拖尾层数",
        4,
        0,
        12,
        1,
        "trailCount：每颗粒子后面绘制多少层拖尾",
      ),
      numberParam(
        "trailSpacing",
        "拖尾间距",
        0.045,
        0.005,
        0.25,
        0.005,
        "trailSpacing：拖尾每层回退的时间间隔",
      ),
      numberParam(
        "trailFade",
        "拖尾衰减",
        0.55,
        0.05,
        0.95,
        0.05,
        "trailFade：拖尾透明度衰减，越大拖尾越明显",
      ),
      numberParam(
        "vanishMode",
        "消失模式 0/1/2",
        1,
        0,
        2,
        1,
        "vanishMode：0=直接淡出；1=到目标点亮一下；2=放大淡出",
      ),
      numberParam(
        "vanishRatio",
        "消失阶段占比",
        0.18,
        0.01,
        0.8,
        0.01,
        "vanishRatio：总时长中用于消失的比例",
      ),
      numberParam(
        "flashScale",
        "闪光/放大倍率",
        1.6,
        0.1,
        8,
        0.05,
        "flashScale：闪亮或放大消失时的峰值倍率",
      ),
      numberParam(
        "flashIntensity",
        "闪光强度",
        1.4,
        0.1,
        3,
        0.05,
        "flashIntensity：vanishMode=1 时峰值亮度倍率",
      ),
    ],
  },
  {
    type: "shatter",
    label: "Shatter 破碎掉落",
    description:
      "把当前图片切成碎片后向外爆开并受重力掉落。可调碎片数量/大小、冲击方向、力度、旋转、重力和淡出。",
    defaultDuration: 1.4,
    recommendedDuration: "tips：0.6 ~ 3s；碎片越多越耗性能，建议 20 ~ 120",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "count",
        "碎片数量上限",
        64,
        4,
        400,
        1,
        "count：最多绘制多少块碎片，建议 20~120",
      ),
      numberParam(
        "pieceSize",
        "目标碎片大小",
        72,
        8,
        512,
        1,
        "pieceSize：碎片目标边长像素，越小越碎",
      ),
      numberParam(
        "force",
        "爆散力度",
        420,
        0,
        3000,
        1,
        "force：碎片被击飞的初速度/距离强度",
      ),
      numberParam(
        "impactAngle",
        "冲击方向°",
        90,
        0,
        360,
        1,
        "impactAngle：主要飞散方向，0=右 90=下 180=左 270=上",
      ),
      numberParam(
        "spreadAngle",
        "扩散角度°",
        160,
        0,
        360,
        1,
        "spreadAngle：围绕冲击方向随机扩散的角度范围",
      ),
      numberParam(
        "gravity",
        "重力",
        900,
        -3000,
        5000,
        1,
        "gravity：正数向下掉落，负数向上漂浮",
      ),
      numberParam(
        "spin",
        "旋转强度",
        5,
        0,
        30,
        0.1,
        "spin：碎片飞行时的随机旋转圈速",
      ),
      numberParam(
        "sourceOpacity",
        "原图保留透明度",
        0,
        0,
        1,
        0.05,
        "sourceOpacity：破碎期间原图本体保留多少透明度，0=完全只看碎片",
      ),
      checkboxParam("fadeOut", "碎片逐渐消失", true, "开启后碎片会随时间淡出"),
    ],
  },
  {
    type: "safe_glow",
    label: "Safe Glow Cocos发光",
    description:
      "Cocos 安全发光：只用同图副本、缩放和透明度呼吸模拟高亮；预览副本会继承图层显示模式（如 add/screen/lighten），但不依赖滤镜或模糊。",
    defaultDuration: 1.2,
    recommendedDuration:
      "tips：0.4 ~ 3s；Cocos 可用 Sprite + UIOpacity + scale 还原",
    defaultEasing: "linear",
    params: [
      numberParam(
        "spread",
        "扩散比例",
        0.12,
        0,
        1,
        0.01,
        "spread：发光副本相对原图放大的比例，Cocos 中直接放大 Sprite",
      ),
      numberParam(
        "minOpacity",
        "最低透明度",
        0.12,
        0,
        1,
        0.05,
        "minOpacity：发光副本呼吸谷值透明度 0~1",
      ),
      numberParam(
        "maxOpacity",
        "最高透明度",
        0.65,
        0,
        1,
        0.05,
        "maxOpacity：发光副本呼吸峰值透明度 0~1",
      ),
      numberParam(
        "pulses",
        "呼吸次数",
        2,
        0,
        20,
        0.25,
        "pulses：持续时间内呼吸次数，0=保持最高透明度",
      ),
      checkboxParam(
        "keepOriginal",
        "保留原图",
        true,
        "开启后原图正常显示，关闭后只显示发光副本",
      ),
    ],
  },
  {
    type: "glow",
    label: "Glow 发光高亮",
    description:
      "在当前图片上叠加一层放大加亮的复制图，形成发光、高亮或闪烁效果。适合奖励、按钮、图标强调。",
    defaultDuration: 1.2,
    recommendedDuration: "tips：0.4 ~ 3s；闪烁次数 0 表示单次呼吸",
    defaultEasing: "linear",
    params: [
      numberParam(
        "intensity",
        "高亮强度",
        0.75,
        0,
        3,
        0.05,
        "intensity：叠加发光层的整体强度",
      ),
      numberParam(
        "spread",
        "扩散比例",
        0.12,
        0,
        1,
        0.01,
        "spread：发光层相对原图放大的比例",
      ),
      numberParam(
        "minAlpha",
        "最低亮度",
        0.15,
        0,
        1,
        0.05,
        "minAlpha：闪烁谷值透明度",
      ),
      numberParam(
        "maxAlpha",
        "最高亮度",
        0.75,
        0,
        1,
        0.05,
        "maxAlpha：闪烁峰值透明度",
      ),
      numberParam(
        "pulses",
        "闪烁次数",
        2,
        0,
        20,
        0.25,
        "pulses：持续时间内闪烁/呼吸次数，0=保持高亮",
      ),
      numberParam(
        "blendMode",
        "混合模式 0/1/2",
        0,
        0,
        2,
        1,
        "blendMode：0=add强发光 1=screen柔和提亮 2=lighten高亮",
      ),
      checkboxParam(
        "keepOriginal",
        "保留原图",
        true,
        "关闭后只显示发光叠加层，可做闪白/闪烁",
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
  {
    type: "squash_stretch",
    label: "SquashStretch 弹性挤压",
    description:
      "位移 + 弹性挤压/拉伸。支持自由起终点坐标(XY)、挤压方向角度和两种弹性模式。",
    defaultDuration: 1.2,
    recommendedDuration: "tips：0.5 ~ 3s",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "squashAngle",
        "挤压角度°",
        270,
        0,
        360,
        1,
        "squashAngle：挤压力的方向角度。0°=从右边来, 90°=从下方来, 180°=从左边来, 270°=从上方来",
      ),
      numberParam(
        "squashAmount",
        "挤压幅度",
        0.4,
        0,
        1,
        0.05,
        "squashAmount：0~1，0=不挤压，1=几乎压扁。建议 0.2~0.6",
      ),
      numberParam(
        "decayOscillateCount",
        "额外震荡次数",
        0,
        0,
        10,
        1,
        "decayOscillateCount：0=单次过冲回弹(single bounce)，1~10=衰减震荡(decay oscillate)，数值越大震荡越久",
      ),
      numberParam(
        "fromX",
        "起始偏移 X",
        0,
        -5000,
        5000,
        1,
        "fromX：相对基础位置的 X 起始偏移，设为和 toX 相同可原地挤压",
      ),
      numberParam(
        "fromY",
        "起始偏移 Y",
        -300,
        -5000,
        5000,
        1,
        "fromY：相对基础位置的 Y 起始偏移，设为和 toY 相同可原地挤压",
      ),
      numberParam(
        "toX",
        "结束偏移 X",
        0,
        -5000,
        5000,
        1,
        "toX：位移终点偏移，设为和 fromX 相同可原地挤压",
      ),
      numberParam(
        "toY",
        "结束偏移 Y",
        0,
        -5000,
        5000,
        1,
        "toY：位移终点偏移，设为和 fromY 相同可原地挤压",
      ),
    ],
  },
  {
    type: "chaser_light",
    label: "ChaserLight 走马灯",
    description:
      "使用当前图片图层自身作为灯片纹理，按轨迹（圆形/直线/曲线）等距复制并依次亮灭，形成走马灯效果。",
    defaultDuration: 4,
    recommendedDuration:
      "tips：2 ~ 10s；适合单个图标、灯泡、星星、金币等循环追光",
    defaultEasing: "linear",
    params: [
      numberParam(
        "totalCount",
        "灯片总数",
        12,
        2,
        200,
        1,
        "totalCount：沿轨迹排布的灯片总数",
      ),
      numberParam(
        "spacing",
        "灯片间距",
        40,
        4,
        500,
        1,
        "spacing：相邻灯片沿轨迹的弧长/直线距离",
      ),
      numberParam(
        "lightDuration",
        "亮灯持续秒",
        0.3,
        0.03,
        5,
        0.01,
        "lightDuration：每盏灯亮多久；实际亮灯窗口 = lightDuration / (lightDuration + interval)",
      ),
      numberParam(
        "interval",
        "灭灯间隔秒",
        0.1,
        0.01,
        5,
        0.01,
        "interval：灭灯间隔；配合 lightDuration 控制走马速度",
      ),
      numberParam(
        "trajectory",
        "轨迹 0/1/2",
        0,
        0,
        2,
        1,
        "trajectory：0=圆形 1=直线 2=曲线",
      ),
      numberParam(
        "radius",
        "圆形半径",
        200,
        10,
        3000,
        1,
        "radius：trajectory=0 时的圆形半径",
      ),
      numberParam(
        "centerX",
        "圆心/起点 X",
        0,
        -5000,
        5000,
        1,
        "centerX：相对图层中心的 X 偏移，trajectory=0 为圆心，=1/2 为起点",
      ),
      numberParam(
        "centerY",
        "圆心/起点 Y",
        0,
        -5000,
        5000,
        1,
        "centerY：相对图层中心的 Y 偏移",
      ),
      numberParam(
        "endX",
        "终点 X",
        320,
        -5000,
        5000,
        1,
        "endX：trajectory=1/2 时终点的 X 偏移",
      ),
      numberParam(
        "endY",
        "终点 Y",
        0,
        -5000,
        5000,
        1,
        "endY：trajectory=1/2 时终点的 Y 偏移",
      ),
      numberParam(
        "curve",
        "曲线弯曲",
        120,
        -3000,
        3000,
        1,
        "curve：trajectory=2 时的弯曲偏移",
      ),
      numberParam(
        "lightSize",
        "灯片大小",
        48,
        4,
        400,
        1,
        "lightSize：灯片贴图最长边像素",
      ),
      numberParam(
        "dimAlpha",
        "暗灯透明度",
        0.15,
        0,
        1,
        0.05,
        "dimAlpha：不亮时的灯片透明度，0=完全不可见",
      ),
      checkboxParam(
        "keepOriginal",
        "保留原图",
        true,
        "开启后原图层图片正常显示，关闭后隐藏原图只显示走马灯",
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
  if (type === "idle") return {};
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
      emissionAngle: 270,
      emissionSpreadAngle: 360,
      size: 48,
      gravity: 90,
      fadeOut: true,
      trailCount: 2,
      trailSpacing: 0.035,
      trailFade: 0.5,
      rotateParticles: true,
      randomRotation: true,
      randomRotationDegrees: 135,
      spinSpeed: 1,
    };
  }
  if (type === "particle_stream") {
    return {
      spawnRate: 24,
      lifetime: 1.2,
      spread: 12,
      speed: 220,
      emissionAngle: 270,
      emissionSpreadAngle: 30,
      size: 48,
      gravity: 180,
      fadeOut: true,
      trailCount: 2,
      trailSpacing: 0.035,
      trailFade: 0.5,
      rotateParticles: true,
      randomRotation: true,
      randomRotationDegrees: 135,
      spinSpeed: 1,
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
  if (type === "particle_combo") {
    return {
      count: 36,
      size: 42,
      sourceOpacity: 0,
      spawnMode: 1,
      spawnRadius: 90,
      spawnRatio: 0.18,
      targetX: 320,
      targetY: 0,
      travelMode: 1,
      curve: 160,
      orbitRadius: 80,
      orbitTurns: 1,
      orbitSpeed: 1,
      orbitRatio: 0.35,
      staggerRatio: 0.28,
      trailCount: 4,
      trailSpacing: 0.045,
      trailFade: 0.55,
      vanishMode: 1,
      vanishRatio: 0.18,
      flashScale: 1.6,
      flashIntensity: 1.4,
    };
  }
  if (type === "shatter") {
    return {
      count: 64,
      pieceSize: 72,
      force: 420,
      impactAngle: 90,
      spreadAngle: 160,
      gravity: 900,
      spin: 5,
      sourceOpacity: 0,
      fadeOut: true,
    };
  }
  if (type === "safe_glow") {
    return {
      spread: 0.12,
      minOpacity: 0.12,
      maxOpacity: 0.65,
      pulses: 2,
      keepOriginal: true,
    };
  }
  if (type === "glow") {
    return {
      intensity: 0.75,
      spread: 0.12,
      minAlpha: 0.15,
      maxAlpha: 0.75,
      pulses: 2,
      blendMode: 0,
      keepOriginal: true,
    };
  }
  if (type === "rotate") {
    return {
      fromRotation: 0,
      toRotation: 360,
    };
  }
  if (type === "squash_stretch") {
    return {
      squashAngle: 270,
      squashAmount: 0.4,
      decayOscillateCount: 0,
      fromX: 0,
      fromY: -300,
      toX: 0,
      toY: 0,
    };
  }
  if (type === "particle_wall") {
    return {
      emitterWidth: 300,
      direction: 270,
      spreadAngle: 15,
      speed: 200,
      lifetimeMin: 0.8,
      lifetimeMax: 2,
      spawnRate: 30,
      size: 48,
      gravity: 0,
      startScaleMin: 0.6,
      startScaleMax: 1,
      endScaleMin: 0.3,
      endScaleMax: 0.8,
      fadeOut: true,
    };
  }
  if (type === "chaser_light") {
    return {
      totalCount: 12,
      spacing: 40,
      lightDuration: 0.3,
      interval: 0.1,
      trajectory: 0,
      radius: 200,
      centerX: 0,
      centerY: 0,
      endX: 320,
      endY: 0,
      curve: 120,
      lightSize: 48,
      dimAlpha: 0.15,
      keepOriginal: true,
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
      sampleBounceIn(result, animation, easedProgress, base);
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
    else if (animation.type === "glow" || animation.type === "safe_glow")
      sampleGlowSource(result, animation);
    else if (animation.type === "chaser_light")
      sampleChaserLightSource(result, animation);
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

const V5G_PARTICLE_ANIMATION_TYPES = new Set<V5GAnimationType>([
  "particles",
  "particle_stream",
  "particle_twinkle",
  "particle_wall",
  "particle_combo",
  "shatter",
]);

export function getAnimationCategory(
  type: V5GAnimationType,
): V5GAnimationCategory {
  return V5G_PARTICLE_ANIMATION_TYPES.has(type) ? "particle" : "animation";
}

export function getAnimationPresetsByCategory(
  category: V5GAnimationCategory,
): V5GAnimationPresetSpec[] {
  return V5G_ANIMATION_PRESETS.filter(
    (preset) => getAnimationCategory(preset.type) === category,
  );
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
    lerpOvershoot(fromX, getNumberParam(animation, "toX", fromX), progress) -
    originX;
  result.transform.y +=
    lerpOvershoot(fromY, getNumberParam(animation, "toY", fromY), progress) -
    originY;
}

function sampleSlide(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
  base: V5GAnimationSampleBase,
): void {
  result.transform.x += lerpOvershoot(
    getNumberParam(animation, "fromX", 0),
    getNumberParam(animation, "toX", 0),
    progress,
  );
  result.transform.y += lerpOvershoot(
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
  easedProgress: number,
  base: V5GAnimationSampleBase,
): void {
  // If the user chose backOut easing use per-animation overshoot;
  // otherwise respect the already-eased progress from easeProgress().
  const easing = String(
    animation.params.easing ??
      getAnimationPreset(animation.type)?.defaultEasing ??
      "backOut",
  );
  let ratio: number;
  if (easing === "backOut") {
    // Recompute with per-animation overshoot so the bounce is visible.
    ratio = backOutProgress(
      easedProgress,
      getNumberParam(animation, "overshoot", 1.7),
    );
  } else {
    ratio = easedProgress;
  }
  const fromScale = getNumberParam(animation, "fromScale", 0.2);
  const toScale = getNumberParam(animation, "toScale", 1);
  // backOut may yield values > 1 during overshoot; do not clamp via lerp.
  const scaleRatio = Math.max(0, fromScale + (toScale - fromScale) * ratio);
  result.transform.scaleX *= scaleRatio;
  result.transform.scaleY *= scaleRatio;
  if (getBooleanParam(animation, "fadeIn", true)) {
    result.opacity = lerp(
      0,
      base.opacity,
      clampNumber(easedProgress * 1.25, 0, 1),
    );
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
  const scaleRatioX =
    lerpOvershoot(fromScaleX, toScaleX, progress) / baseScaleX;
  const scaleRatioY =
    lerpOvershoot(fromScaleY, toScaleY, progress) / baseScaleY;
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
  const scaleRatio = Math.max(0, lerpOvershoot(fromScale, toScale, progress));
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
  result.transform.rotation += lerpOvershoot(
    getNumberParam(animation, "fromRotation", 0),
    getNumberParam(animation, "toRotation", 0),
    progress,
  );
}

function sampleParticleComboSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  base: V5GAnimationSampleBase,
): void {
  result.opacity = base.opacity * getNumberParam(animation, "sourceOpacity", 0);
}

function sampleShatterSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  base: V5GAnimationSampleBase,
): void {
  result.opacity = base.opacity * getNumberParam(animation, "sourceOpacity", 0);
}

function sampleGlowSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
): void {
  if (getBooleanParam(animation, "keepOriginal", true)) return;
  result.opacity = 0;
}

function sampleChaserLightSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
): void {
  if (getBooleanParam(animation, "keepOriginal", true)) return;
  result.opacity = 0;
}

function sampleSquashStretch(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  easedProgress: number,
): void {
  const squashAngle = getNumberParam(animation, "squashAngle", 270);
  const squashAmount = getNumberParam(animation, "squashAmount", 0.4);
  const decayOscillateCount = getNumberParam(
    animation,
    "decayOscillateCount",
    0,
  );
  const fromX = getNumberParam(animation, "fromX", 0);
  const fromY = getNumberParam(animation, "fromY", -300);
  const toX = getNumberParam(animation, "toX", 0);
  const toY = getNumberParam(animation, "toY", 0);

  // Displacement: interpolate from/to in world space (relative to base).
  result.transform.x += lerpOvershoot(fromX, toX, easedProgress);
  result.transform.y += lerpOvershoot(fromY, toY, easedProgress);

  if (squashAmount <= 0.001) return;

  // Squash direction: given angle in degrees.
  // 0° = from right, 90° = from bottom, 180° = from left, 270° = from top.
  const angleRad = squashAngle * (Math.PI / 180);
  const forceX = Math.cos(angleRad);
  const forceY = Math.sin(angleRad);

  // Squash profile:
  // progress 0 -> force applies, squash increases to peak at peakAt
  // progress peakAt->1 -> squash releases with possible oscillation.
  const peakAt = 0.35;
  let squashFactor: number;
  if (easedProgress <= peakAt) {
    // Ramp up
    const phase = clampNumber(easedProgress / peakAt, 0, 1);
    squashFactor = 1 - squashAmount * easeProgress(phase, "easeOutQuad");
  } else {
    const decayPhase = (easedProgress - peakAt) / Math.max(1 - peakAt, 0.0001);
    if (decayOscillateCount <= 0) {
      // Single overshoot spring
      const overshoot = squashAmount * 0.35;
      squashFactor =
        1 - squashAmount + overshoot * Math.sin(decayPhase * Math.PI);
    } else {
      // Decay oscillate
      const totalCycles = 1 + decayOscillateCount;
      const inner = decayPhase * Math.PI * 2 * totalCycles;
      const decay = Math.exp(-decayPhase * 4);
      squashFactor = 1 - squashAmount * decay * Math.cos(inner);
    }
  }
  squashFactor = clampNumber(squashFactor, 0.11, 3);

  // Apply squash/stretch: squash along force axis, stretch on orthogonal axis.
  // Volume conservation: stretchX * stretchY ≈ 1 for a pure squash.
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

/** Like lerp but does not clamp ratio above 1, so backOut overshoot is visible. */
function lerpOvershoot(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}
