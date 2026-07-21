import { clampNumber, roundTo } from "./coordinates";
import type {
  V5GAnimationConfig,
  V5GAnimationParamValue,
  V5GAnimationType,
  V5GTransformConfig,
} from "./types";

export type V5GEasingName =
  "linear" | "easeInQuad" | "easeOutQuad" | "easeInOutQuad" | "backOut";

export interface V5GAnimationParamOptionSpec {
  value: string | number;
  label: string;
}

export interface V5GAnimationParamVisibilityRule {
  key: string;
  values: V5GAnimationParamValue[];
}

export interface V5GAnimationParamSpec {
  key: string;
  label: string;
  inputType: "number" | "checkbox" | "select";
  defaultValue: V5GAnimationParamValue;
  min?: number;
  max?: number;
  step?: number;
  recommendedRange: string;
  options?: V5GAnimationParamOptionSpec[];
  visibleWhen?: V5GAnimationParamVisibilityRule;
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
  /** Extra inner-content rotation in degrees for pressure rotation. */
  visualRotation?: number;
}

interface V5GMultiMovePoint {
  x: number;
  y: number;
  time: number;
  easing: V5GEasingName;
}

const DEFAULT_MULTI_MOVE_POINTS: V5GMultiMovePoint[] = [
  { x: 0, y: 0, time: 0, easing: "linear" },
  { x: 200, y: 0, time: 1, easing: "easeOutQuad" },
];

export const DEFAULT_MULTI_MOVE_POINTS_JSON = JSON.stringify(
  DEFAULT_MULTI_MOVE_POINTS,
);

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
    type: "multi_move",
    label: "Multi Move 多段位移",
    description:
      "在一个动画模块中配置多个位移点，每个点可填写坐标、到达时间，并为该段单独选择缓动曲线。",
    defaultDuration: 2,
    recommendedDuration: "tips：1 ~ 8s；点击添加位移点扩展路径",
    defaultEasing: "linear",
    params: [
      {
        key: "pointsJson",
        label: "位移点 JSON",
        inputType: "select",
        defaultValue: DEFAULT_MULTI_MOVE_POINTS_JSON,
        recommendedRange: "由多段位移点编辑器自动维护：[{x,y,time,easing}]",
      },
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
    type: "bounce_jump",
    label: "BounceJump 弹跳",
    description:
      "图片先向下挤压蓄力，再向上弹起并拉伸；到顶端轻微压缩，下落加速，落地后可按次数衰减反弹。",
    defaultDuration: 1.4,
    recommendedDuration: "tips：0.8 ~ 3s；反弹次数 0~5，跳跃高度建议 80~800",
    defaultEasing: "linear",
    params: [
      numberParam(
        "height",
        "跳起高度",
        300,
        0,
        5000,
        1,
        "height：向上跳起的最大高度，单位像素",
      ),
      numberParam(
        "anticipationRatio",
        "蓄力占比",
        0.18,
        0.02,
        0.6,
        0.01,
        "anticipationRatio：总时长里用于下压蓄力的比例",
      ),
      numberParam(
        "squash",
        "下压挤压",
        0.28,
        0,
        0.9,
        0.01,
        "squash：蓄力/落地时竖向压扁强度，0=不压扁",
      ),
      numberParam(
        "stretch",
        "上飞拉伸",
        0.18,
        0,
        0.9,
        0.01,
        "stretch：向上飞行时竖向拉伸强度，0=不拉伸",
      ),
      numberParam(
        "topSquash",
        "顶点压缩",
        0.08,
        0,
        0.6,
        0.01,
        "topSquash：到达顶端时的轻微压缩强度",
      ),
      numberParam(
        "bounceCount",
        "反弹次数",
        2,
        0,
        8,
        1,
        "bounceCount：落地后的反弹次数，0=只跳一次不反弹",
      ),
      numberParam(
        "bounceDecay",
        "反弹衰减",
        0.45,
        0.05,
        0.95,
        0.01,
        "bounceDecay：每次反弹高度衰减比例，越小越快停",
      ),
      numberParam(
        "landSquash",
        "落地压缩",
        0.22,
        0,
        0.9,
        0.01,
        "landSquash：每次落地瞬间的压缩强度",
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
    type: "gather_particles",
    label: "GatherParticles 汇聚粒子",
    description:
      "使用当前图片图层作为粒子纹理：先在一个圆形范围内随机出现，再按直线/曲线/螺旋路径移动到同一个目标坐标，并在目标点淡出、闪亮或放大消失。适合金币吸入、奖励收集、能量汇聚。",
    defaultDuration: 2.2,
    recommendedDuration:
      "tips：1 ~ 5s；粒子数量建议 24 ~ 120，拖尾会自动做性能保护",
    defaultEasing: "easeInOutQuad",
    params: [
      numberParam(
        "count",
        "粒子数量",
        48,
        1,
        220,
        1,
        "count：随机出现并汇聚的粒子数量，上限 220",
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
        "sourceOpacity：播放粒子时原始图层自身的透明度，0=只显示汇聚粒子",
      ),
      numberParam(
        "spawnRadius",
        "随机出现半径",
        360,
        0,
        4000,
        1,
        "spawnRadius：粒子初始随机出现的圆形范围半径",
      ),
      numberParam(
        "spawnRatio",
        "出现阶段占比",
        0.2,
        0.01,
        0.8,
        0.01,
        "spawnRatio：总时长中用于粒子从无到有的比例",
      ),
      numberParam(
        "targetX",
        "汇聚目标 X",
        0,
        -5000,
        5000,
        1,
        "targetX：汇聚目标点相对图层中心的 X 偏移",
      ),
      numberParam(
        "targetY",
        "汇聚目标 Y",
        0,
        -5000,
        5000,
        1,
        "targetY：汇聚目标点相对图层中心的 Y 偏移，正数向上",
      ),
      selectParam(
        "travelMode",
        "汇聚路径",
        1,
        [
          { value: 0, label: "直线吸入" },
          { value: 1, label: "曲线吸入" },
          { value: 2, label: "螺旋吸入" },
        ],
        "travelMode：选择粒子向目标移动的路径形态",
      ),
      numberParam(
        "curve",
        "曲线弯曲",
        160,
        -3000,
        3000,
        1,
        "curve：曲线/螺旋吸入的弯曲强度，正负决定方向",
        { key: "travelMode", values: [1, 2] },
      ),
      numberParam(
        "spiralTurns",
        "螺旋圈数",
        0.75,
        -8,
        8,
        0.05,
        "spiralTurns：螺旋吸入时绕目标旋转的圈数，负数反向",
        { key: "travelMode", values: [2] },
      ),
      numberParam(
        "staggerRatio",
        "出发错峰占比",
        0.28,
        0,
        0.9,
        0.01,
        "staggerRatio：粒子依次开始移动的时间错峰比例，0=同时移动",
      ),
      numberParam(
        "trailCount",
        "拖尾层数",
        3,
        0,
        10,
        1,
        "trailCount：每颗粒子后面绘制多少层拖尾；会按总 sprite 数自动限制",
      ),
      numberParam(
        "trailSpacing",
        "拖尾间距",
        0.04,
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
      selectParam(
        "vanishMode",
        "目标消失方式",
        1,
        [
          { value: 0, label: "淡出消失" },
          { value: 1, label: "闪一下消失" },
          { value: 2, label: "放大消失" },
        ],
        "vanishMode：粒子到达同一坐标后的消失表现",
      ),
      numberParam(
        "vanishRatio",
        "消失阶段占比",
        0.18,
        0.01,
        0.8,
        0.01,
        "vanishRatio：总时长中用于目标点消失/闪光的比例",
      ),
      numberParam(
        "flashScale",
        "闪光/放大倍率",
        1.6,
        0.1,
        8,
        0.05,
        "flashScale：闪光或放大消失时的峰值倍率",
      ),
      numberParam(
        "flashIntensity",
        "闪光强度",
        1.35,
        0.1,
        3,
        0.05,
        "flashIntensity：闪一下消失时的峰值亮度倍率",
        { key: "vanishMode", values: [1] },
      ),
    ],
  },
  {
    type: "smoke_mist",
    label: "SmokeMist 雾化消散",
    description:
      "雾化消散：使用当前图片图层作为半透明烟雾粒子，不做像素切片或 shader。粒子从图层附近随机出现，向外扩散、受风漂移、放大并淡出，适合消散、烟雾、雾化、灰烬感过渡。",
    defaultDuration: 2.4,
    recommendedDuration:
      "tips：1 ~ 5s；粒子数量建议 24 ~ 100，完全基于 Sprite 复制，Cocos 友好",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "count",
        "烟雾粒子数量",
        56,
        1,
        180,
        1,
        "count：烟雾粒子数量，上限 180；数量越大越浓但更耗性能",
      ),
      numberParam(
        "size",
        "基础粒子大小",
        96,
        1,
        800,
        1,
        "size：烟雾粒子贴图最长边像素；建议比普通粒子大一些",
      ),
      numberParam(
        "sourceOpacity",
        "原图保留透明度",
        0,
        0,
        1,
        0.05,
        "sourceOpacity：雾化期间原图层本体保留多少透明度，0=只显示烟雾粒子",
      ),
      numberParam(
        "spawnRadius",
        "出生半径",
        80,
        0,
        3000,
        1,
        "spawnRadius：粒子出生点在图层中心周围的随机半径",
      ),
      numberParam(
        "spread",
        "扩散距离",
        320,
        0,
        5000,
        1,
        "spread：烟雾向外扩散的距离",
      ),
      numberParam(
        "windX",
        "风力 X",
        80,
        -3000,
        3000,
        1,
        "windX：横向风力，正数向右",
      ),
      numberParam(
        "windY",
        "风力 Y",
        40,
        -3000,
        3000,
        1,
        "windY：纵向风力，正数向上",
      ),
      numberParam(
        "swirl",
        "旋涡弯曲",
        120,
        -3000,
        3000,
        1,
        "swirl：扩散过程中的切向弯曲，正负决定旋转方向",
      ),
      numberParam(
        "startAlpha",
        "初始透明度",
        0.62,
        0,
        1,
        0.05,
        "startAlpha：烟雾粒子刚出现时的透明度",
      ),
      numberParam(
        "fadePower",
        "淡出强度",
        1.35,
        0.1,
        5,
        0.05,
        "fadePower：数值越大，后半段淡出越快",
      ),
      numberParam(
        "grow",
        "放大倍率",
        2.1,
        0.1,
        8,
        0.05,
        "grow：烟雾粒子从出现到消散的放大倍数",
      ),
      numberParam(
        "sizeRandom",
        "大小随机",
        0.55,
        0,
        2,
        0.05,
        "sizeRandom：每颗烟雾粒子的尺寸随机范围",
      ),
      numberParam(
        "rotationSpeed",
        "旋转速度",
        0.6,
        -10,
        10,
        0.05,
        "rotationSpeed：烟雾粒子自转速度",
      ),
      checkboxParam(
        "keepOriginalAtEnd",
        "末尾保留原图",
        false,
        "开启后动画末尾原图会恢复显示；关闭则完成雾化消散",
      ),
    ],
  },
  {
    type: "energy_ring",
    label: "EnergyRing 能量环",
    description:
      "能量环：使用当前图片作为环形光效贴图，复制成一个或多个能量环，从中心放大、旋转并淡出。适合冲击波、魔法阵、光圈扩散；需要当前图层本身是一张环形/光圈图片。",
    defaultDuration: 1.4,
    recommendedDuration:
      "tips：0.5 ~ 3s；建议使用透明底环形图片，环数 1 ~ 4 即可",
    defaultEasing: "easeOutQuad",
    params: [
      numberParam(
        "ringCount",
        "环数量",
        2,
        1,
        8,
        1,
        "ringCount：同时/错峰扩散的能量环数量，上限 8",
      ),
      numberParam(
        "startScale",
        "起始缩放",
        0.25,
        0.01,
        20,
        0.05,
        "startScale：相对图层基础缩放的起始倍率",
      ),
      numberParam(
        "endScale",
        "结束缩放",
        2.4,
        0.01,
        50,
        0.05,
        "endScale：相对图层基础缩放的结束倍率",
      ),
      numberParam(
        "sourceOpacity",
        "原图保留透明度",
        0,
        0,
        1,
        0.05,
        "sourceOpacity：播放能量环时原始图层本体保留多少透明度，0=只显示扩散环",
      ),
      numberParam(
        "alpha",
        "环透明度",
        1,
        0,
        1,
        0.05,
        "alpha：能量环整体透明度",
      ),
      numberParam(
        "stagger",
        "环错峰",
        0.28,
        0,
        0.95,
        0.01,
        "stagger：多个环依次出现的时间错峰比例",
      ),
      numberParam(
        "rotation",
        "旋转角度°",
        60,
        -3600,
        3600,
        1,
        "rotation：每个环扩散过程中的额外旋转角度",
      ),
      numberParam(
        "pulse",
        "脉冲缩放",
        0.08,
        0,
        1,
        0.01,
        "pulse：扩散过程中额外的轻微呼吸/脉冲比例",
      ),
      selectParam(
        "vanishMode",
        "淡出方式",
        1,
        [
          { value: 0, label: "线性淡出" },
          { value: 1, label: "尾段淡出" },
          { value: 2, label: "中段最亮" },
        ],
        "vanishMode：控制能量环透明度曲线",
      ),
      checkboxParam(
        "additive",
        "强制加亮混合",
        true,
        "开启后能量环用 add 混合；关闭后继承图层混合模式",
      ),
    ],
  },
  {
    type: "slash_light",
    label: "SlashLight 刀光斩击",
    description:
      "图片刀光斩击：使用当前图片作为刀光贴图，快速展开、扫过并淡出。支持直线斩、弧形斩和十字斩，适合剑气、斩击、闪白、技能切线。",
    defaultDuration: 0.45,
    recommendedDuration: "tips：0.25 ~ 1s；刀光通常越短越有冲击力",
    defaultEasing: "easeOutQuad",
    params: [
      selectParam(
        "mode",
        "刀光模式",
        0,
        [
          { value: 0, label: "直线斩" },
          { value: 1, label: "弧形斩" },
          { value: 2, label: "十字斩" },
        ],
        "mode：直线=单道扫过；弧形=带轻微曲线漂移；十字=两道交叉刀光",
      ),
      numberParam(
        "angle",
        "斩击角度°",
        -25,
        -360,
        360,
        1,
        "angle：刀光方向角度，0=向右，90=向下，-90=向上",
      ),
      numberParam(
        "travel",
        "扫过距离",
        180,
        -3000,
        3000,
        1,
        "travel：刀光沿角度方向扫过的距离，负数反向",
      ),
      numberParam(
        "lengthScale",
        "长度拉伸",
        2.4,
        0.01,
        50,
        0.05,
        "lengthScale：沿刀光方向的拉伸倍率",
      ),
      numberParam(
        "widthScale",
        "宽度缩放",
        0.55,
        0.01,
        20,
        0.05,
        "widthScale：垂直刀光方向的缩放倍率",
      ),
      numberParam(
        "sourceOpacity",
        "原图保留透明度",
        0,
        0,
        1,
        0.05,
        "sourceOpacity：播放刀光时原图层本体保留多少透明度，0=只显示刀光",
      ),
      numberParam(
        "flashAlpha",
        "峰值透明度",
        1,
        0,
        1,
        0.05,
        "flashAlpha：刀光最亮时的透明度",
      ),
      numberParam(
        "startScale",
        "起始展开",
        0.18,
        0.01,
        2,
        0.01,
        "startScale：刀光出现时的长度比例，越小越像瞬间展开",
      ),
      numberParam(
        "fadeRatio",
        "淡出阶段占比",
        0.45,
        0.05,
        0.95,
        0.01,
        "fadeRatio：动画后段用于淡出的时间比例",
      ),
      numberParam(
        "curve",
        "弧形偏移",
        90,
        -3000,
        3000,
        1,
        "curve：弧形斩/十字斩的侧向偏移强度",
        { key: "mode", values: [1, 2] },
      ),
      checkboxParam(
        "additive",
        "强制加亮混合",
        true,
        "开启后刀光使用 add 混合；关闭后继承图层混合模式",
      ),
    ],
  },
  {
    type: "flame_flicker",
    label: "FlameJet 火焰喷射",
    description:
      "火焰喷射：使用当前图片作为火焰/火星贴图，从喷射口沿指定方向发射。支持喷射角度、扩散角、距离随机和消失范围随机，避免粒子在同一条线消失。",
    defaultDuration: 2.2,
    recommendedDuration: "tips：1 ~ 6s；粒子数量建议 24 ~ 90",
    defaultEasing: "linear",
    params: [
      numberParam(
        "count",
        "火焰粒子数量",
        52,
        1,
        160,
        1,
        "count：同时可见的火焰粒子数量",
      ),
      numberParam(
        "emitterWidth",
        "喷射口宽度",
        180,
        0,
        3000,
        1,
        "emitterWidth：垂直喷射方向的出生范围宽度",
      ),
      numberParam(
        "height",
        "喷射距离",
        420,
        1,
        5000,
        1,
        "height：火焰粒子沿喷射方向飞行的基础距离",
      ),
      numberParam(
        "direction",
        "喷射角度°",
        270,
        -360,
        360,
        1,
        "direction：主喷射方向，0=向右，90=向下，180=向左，270=向上",
      ),
      numberParam(
        "spreadAngle",
        "扩散角度°",
        22,
        0,
        180,
        1,
        "spreadAngle：每颗粒子围绕主喷射方向随机散开的角度范围",
      ),
      numberParam(
        "vanishSpread",
        "消失范围随机",
        120,
        0,
        3000,
        1,
        "vanishSpread：粒子接近消失时在垂直方向上的随机散开范围，避免形成一条消失线",
      ),
      numberParam(
        "lengthRandom",
        "距离随机",
        0.35,
        0,
        1,
        0.01,
        "lengthRandom：每颗粒子喷射距离的随机比例，0=相同距离，1=高度随机",
      ),
      numberParam(
        "size",
        "火焰贴图大小",
        96,
        1,
        800,
        1,
        "size：火焰粒子贴图最长边像素",
      ),
      numberParam(
        "sourceOpacity",
        "原图保留透明度",
        0,
        0,
        1,
        0.05,
        "sourceOpacity：播放火焰喷射时原图层本体保留多少透明度",
      ),
      numberParam(
        "sway",
        "喷射摆动",
        54,
        0,
        2000,
        1,
        "sway：喷射过程中沿垂直方向摆动的幅度",
      ),
      numberParam(
        "turbulence",
        "随机扰动",
        80,
        0,
        3000,
        1,
        "turbulence：每颗火焰粒子的随机偏移强度",
      ),
      numberParam(
        "grow",
        "中段放大",
        1.65,
        0.1,
        8,
        0.05,
        "grow：火焰粒子中段的放大倍率",
      ),
      numberParam(
        "alpha",
        "整体透明度",
        0.9,
        0,
        1,
        0.05,
        "alpha：火焰整体透明度",
      ),
      numberParam(
        "flicker",
        "闪烁强度",
        0.35,
        0,
        1,
        0.01,
        "flicker：透明度和尺寸的随机闪烁强度",
      ),
      numberParam(
        "cycles",
        "循环次数",
        1,
        1,
        60,
        1,
        "cycles：当前动画持续时间内完整循环多少次，必须为整数；例如持续 3 秒、循环 2 次 = 每 1.5 秒一轮",
      ),
      checkboxParam(
        "additive",
        "强制加亮混合",
        true,
        "开启后火焰使用 add 混合；关闭后继承图层混合模式",
      ),
    ],
  },
  {
    type: "wave_band",
    label: "Wave 波浪",
    description:
      "波浪：将当前图片沿正弦波路径复制成一条波浪，可循环推进、一次性推进或从中心向两侧扩散。适合水波、能量波、光点波纹和 UI 震荡。",
    defaultDuration: 2,
    recommendedDuration: "tips：1 ~ 5s；节点数量建议 16 ~ 80",
    defaultEasing: "linear",
    params: [
      selectParam(
        "mode",
        "波浪模式",
        0,
        [
          { value: 0, label: "循环推进" },
          { value: 1, label: "一次性推进" },
          { value: 2, label: "中心扩散" },
        ],
        "mode：循环=持续流动；一次性=从一端扫过；中心扩散=从中心向两侧展开",
      ),
      numberParam(
        "count",
        "波浪节点数量",
        36,
        2,
        160,
        1,
        "count：沿波浪复制的图片数量",
      ),
      numberParam(
        "length",
        "波浪长度",
        720,
        1,
        8000,
        1,
        "length：波浪带总长度",
      ),
      numberParam(
        "amplitude",
        "波浪振幅",
        70,
        0,
        3000,
        1,
        "amplitude：正弦波上下起伏幅度",
      ),
      numberParam(
        "frequency",
        "波浪频率",
        2.5,
        0,
        30,
        0.05,
        "frequency：整条波浪里的起伏次数",
      ),
      numberParam(
        "speed",
        "推进速度",
        1,
        0.05,
        8,
        0.05,
        "speed：循环推进速度倍率",
      ),
      numberParam(
        "direction",
        "方向角度°",
        0,
        -360,
        360,
        1,
        "direction：波浪主方向，0=水平向右",
      ),
      numberParam(
        "size",
        "节点大小",
        48,
        1,
        800,
        1,
        "size：每个波浪节点贴图最长边像素",
      ),
      numberParam(
        "alpha",
        "整体透明度",
        1,
        0,
        1,
        0.05,
        "alpha：波浪整体透明度",
      ),
      numberParam(
        "trailFade",
        "尾部衰减",
        0.75,
        0.05,
        1,
        0.05,
        "trailFade：波浪首尾/扩散边缘的透明衰减",
      ),
      checkboxParam(
        "rotateToWave",
        "朝向波浪",
        true,
        "开启后节点会沿波浪切线旋转",
      ),
      checkboxParam(
        "keepOriginal",
        "保留原图",
        false,
        "开启后保留当前图片，关闭后只显示波浪带",
      ),
    ],
  },
  {
    type: "wave_distort",
    label: "WaveDistort 图片波浪扭曲",
    description:
      "图片波浪扭曲：将当前图片按横向条带切片，每条按正弦波水平偏移，让图片本体像水面/旗帜/热浪一样流动。不使用 shader 或滤镜，Cocos 可用裁剪 Sprite 条带还原。",
    defaultDuration: 2.4,
    recommendedDuration: "tips：1 ~ 8s；切片行数建议 24 ~ 64，振幅 8 ~ 48",
    defaultEasing: "linear",
    params: [
      numberParam(
        "rows",
        "切片行数",
        36,
        2,
        120,
        1,
        "rows：把图片横向切成多少条；越多越平滑但更耗性能",
      ),
      numberParam(
        "amplitude",
        "扭曲幅度",
        24,
        0,
        500,
        1,
        "amplitude：每条切片水平偏移的最大像素量",
      ),
      numberParam(
        "frequency",
        "波浪频率",
        2,
        0,
        20,
        0.05,
        "frequency：图片高度方向上的波浪起伏次数",
      ),
      numberParam(
        "cycles",
        "循环次数",
        1,
        1,
        60,
        1,
        "cycles：当前动画持续时间内完整循环多少次，必须为整数；例如持续 3 秒、循环 2 次 = 每 1.5 秒一轮",
      ),
      numberParam(
        "phaseOffset",
        "行相位差",
        1,
        -10,
        10,
        0.05,
        "phaseOffset：相邻切片之间的相位差强度，影响波纹疏密和方向感",
      ),
      numberParam(
        "verticalBob",
        "整体上下起伏",
        0,
        0,
        300,
        1,
        "verticalBob：整张扭曲图额外上下轻微起伏幅度",
      ),
      numberParam(
        "alpha",
        "整体透明度",
        1,
        0,
        1,
        0.05,
        "alpha：扭曲切片整体透明度",
      ),
      numberParam(
        "edgeFeather",
        "上下边缘柔化",
        0,
        0,
        1,
        0.05,
        "edgeFeather：上下边缘透明衰减强度，0=不柔化",
      ),
      checkboxParam(
        "keepOriginal",
        "保留原图",
        false,
        "开启后原图层同时显示；关闭后只显示扭曲切片",
      ),
    ],
  },
  {
    type: "speed_lines",
    label: "SpeedLines 速度线",
    description:
      "轻量速度线效果：支持放射、单向掠过、隧道三种模式。使用 Graphics 画线，不复制大图，适合冲刺、爆发、镜头推进。",
    defaultDuration: 1.2,
    recommendedDuration: "tips：0.5 ~ 4s；线条数量建议 40 ~ 120",
    defaultEasing: "linear",
    params: [
      selectParam(
        "mode",
        "速度线模式",
        0,
        [
          { value: 0, label: "放射爆发" },
          { value: 1, label: "单向掠过" },
          { value: 2, label: "隧道推进" },
        ],
        "模式：放射=从中心向外；单向=同方向掠过；隧道=纵深推进",
      ),
      numberParam(
        "count",
        "线条数量",
        72,
        4,
        180,
        1,
        "count：线条数量，上限 180",
      ),
      numberParam(
        "radius",
        "范围半径",
        520,
        20,
        4000,
        1,
        "radius：速度线覆盖范围/飞行距离",
      ),
      numberParam(
        "length",
        "线条长度",
        120,
        4,
        1000,
        1,
        "length：每条速度线长度",
      ),
      numberParam(
        "speed",
        "速度倍率",
        1.4,
        0.05,
        8,
        0.05,
        "speed：线条循环移动速度",
      ),
      numberParam(
        "direction",
        "方向角度°",
        0,
        0,
        360,
        1,
        "direction：单向模式为飞行方向；放射/隧道模式为扇形中心方向",
      ),
      numberParam(
        "spreadAngle",
        "扩散角度°",
        360,
        1,
        360,
        1,
        "spreadAngle：放射/隧道模式的角度范围；单向掠过不使用",
        { key: "mode", values: [0, 2] },
      ),
      numberParam("lineWidth", "线宽", 3, 0.5, 40, 0.5, "lineWidth：线条粗细"),
      numberParam("alpha", "透明度", 0.75, 0, 1, 0.05, "alpha：线条整体透明度"),
      checkboxParam(
        "fadeOut",
        "两端淡出",
        true,
        "开启后线条在循环首尾淡入淡出",
      ),
      checkboxParam(
        "keepOriginal",
        "保留原图",
        false,
        "开启后保留当前图片，关闭后只显示速度线",
      ),
    ],
  },
  {
    type: "drift_fall",
    label: "DriftFall 飘落粒子",
    description:
      "通用飘落系统：用当前图片作为叶子/雪花/花瓣/灰烬粒子，随机下落、受风、左右摆动并旋转。",
    defaultDuration: 4,
    recommendedDuration: "tips：2 ~ 10s；数量建议 24 ~ 90",
    defaultEasing: "linear",
    params: [
      numberParam(
        "count",
        "粒子数量",
        48,
        1,
        180,
        1,
        "count：同时可见粒子数量，上限 180",
      ),
      numberParam(
        "areaWidth",
        "生成宽度",
        900,
        20,
        6000,
        1,
        "areaWidth：相对图层中心的横向生成范围",
      ),
      numberParam(
        "areaHeight",
        "飘落高度",
        1600,
        20,
        6000,
        1,
        "areaHeight：粒子循环飘落的高度",
      ),
      numberParam(
        "cycles",
        "循环次数",
        1,
        1,
        60,
        1,
        "cycles：当前动画持续时间内完整飘落循环多少次，必须为整数；例如持续 3 秒、循环 2 次 = 每 1.5 秒一轮",
      ),
      numberParam(
        "wind",
        "风力 X",
        45,
        -2000,
        2000,
        1,
        "wind：横向风力，正数向右",
      ),
      numberParam(
        "swayAmplitude",
        "摆动幅度",
        42,
        0,
        1000,
        1,
        "swayAmplitude：左右摆动幅度",
      ),
      numberParam(
        "swayFrequency",
        "摆动次数",
        1,
        0,
        20,
        1,
        "swayFrequency：每个飘落循环内左右摆动的整数次数，整数可保证首尾对齐",
      ),
      numberParam(
        "size",
        "粒子大小",
        48,
        1,
        400,
        1,
        "size：粒子贴图最长边像素",
      ),
      numberParam(
        "sizeRandom",
        "大小随机",
        0.45,
        0,
        2,
        0.05,
        "sizeRandom：粒子尺寸随机范围",
      ),
      numberParam(
        "rotationSpeed",
        "自转圈数",
        1,
        -20,
        20,
        1,
        "rotationSpeed：每个飘落循环内自转的整数圈数，负数反向，整数可保证首尾对齐",
      ),
      numberParam("alpha", "透明度", 1, 0, 1, 0.05, "alpha：粒子整体透明度"),
      checkboxParam(
        "fadeEdges",
        "边缘淡入淡出",
        true,
        "开启后粒子在顶部/底部淡入淡出",
      ),
      checkboxParam(
        "keepOriginal",
        "保留原图",
        false,
        "开启后保留当前图片，关闭后只显示飘落粒子",
      ),
    ],
  },
  {
    type: "path_particles",
    label: "PathParticles 路径粒子",
    description:
      "参数化路径粒子：当前图片沿直线、弧线、波浪、螺旋或环形路径运动，可带拖尾和朝向路径旋转。路径模式使用下拉选择，并只显示当前模式生效的参数。",
    defaultDuration: 2.4,
    recommendedDuration: "tips：1 ~ 6s；拖尾和数量越大越耗性能",
    defaultEasing: "linear",
    params: [
      selectParam(
        "pathMode",
        "路径模式",
        1,
        [
          { value: 0, label: "直线：从中心到终点" },
          { value: 1, label: "曲线：二次贝塞尔弧线" },
          { value: 2, label: "波浪：沿终点方向摆动" },
          { value: 3, label: "螺旋：半径渐变绕行" },
          { value: 4, label: "环形：沿固定圆环旋转" },
        ],
        "路径模式：选择后下方只显示该模式会生效的参数",
      ),
      numberParam(
        "count",
        "粒子数量",
        36,
        1,
        160,
        1,
        "count：路径上的粒子数量，上限 160",
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
        "endX",
        "终点 X",
        360,
        -5000,
        5000,
        1,
        "endX：直线/曲线/波浪终点 X 偏移；螺旋/环形不使用",
        { key: "pathMode", values: [0, 1, 2] },
      ),
      numberParam(
        "endY",
        "终点 Y",
        0,
        -5000,
        5000,
        1,
        "endY：直线/曲线/波浪终点 Y 偏移，正数向上；螺旋/环形不使用",
        { key: "pathMode", values: [0, 1, 2] },
      ),
      numberParam(
        "curve",
        "曲线弯曲",
        160,
        -3000,
        3000,
        1,
        "curve：曲线模式的控制点偏移；其他模式不使用",
        { key: "pathMode", values: [1] },
      ),
      numberParam(
        "amplitude",
        "波浪幅度",
        70,
        0,
        2000,
        1,
        "amplitude：波浪模式的垂直振幅；其他模式不使用",
        { key: "pathMode", values: [2] },
      ),
      numberParam(
        "frequency",
        "波浪频率",
        2.5,
        0,
        20,
        0.05,
        "frequency：波浪模式的起伏次数；其他模式不使用",
        { key: "pathMode", values: [2] },
      ),
      numberParam(
        "radiusStart",
        "起始半径",
        240,
        0,
        3000,
        1,
        "radiusStart：螺旋模式的起始半径；环形模式不使用",
        { key: "pathMode", values: [3] },
      ),
      numberParam(
        "radiusEnd",
        "结束/圆半径",
        60,
        0,
        3000,
        1,
        "radiusEnd：螺旋模式结束半径；环形模式圆半径",
        { key: "pathMode", values: [3, 4] },
      ),
      numberParam(
        "turns",
        "圈数",
        1.5,
        -10,
        10,
        0.05,
        "turns：螺旋/环形旋转圈数，负数反向",
        { key: "pathMode", values: [3, 4] },
      ),
      checkboxParam(
        "loop",
        "循环播放",
        true,
        "开启=持续循环补位；关闭=每颗粒子沿路径走一次后消失，不再生成新粒子",
      ),
      numberParam(
        "speed",
        "循环速度",
        1,
        0.05,
        8,
        0.05,
        "speed：仅循环播放时生效，控制粒子沿路径循环移动速度；关闭循环后由动画持续秒自动决定速度",
        { key: "loop", values: [true] },
      ),
      numberParam(
        "stagger",
        "循环分布密度",
        1,
        0,
        1,
        0.05,
        "stagger：仅循环播放时生效；1=沿路径均匀分布，0=同时从同一点循环",
        { key: "loop", values: [true] },
      ),
      numberParam(
        "oneShotStagger",
        "出发错峰占比",
        0.25,
        0,
        0.95,
        0.05,
        "oneShotStagger：仅关闭循环时生效；0=全部同时出发，0.25=最后一颗在动画 25% 时间点出发，整体速度由持续秒自动计算",
        { key: "loop", values: [false] },
      ),
      numberParam(
        "trailCount",
        "拖尾层数",
        3,
        0,
        10,
        1,
        "trailCount：每颗粒子后面的拖尾层数",
      ),
      numberParam(
        "trailSpacing",
        "拖尾间距",
        0.035,
        0.005,
        0.25,
        0.005,
        "trailSpacing：拖尾回退的路径进度",
      ),
      numberParam(
        "trailFade",
        "拖尾衰减",
        0.55,
        0.05,
        0.95,
        0.05,
        "trailFade：拖尾透明度衰减",
      ),
      numberParam("alpha", "透明度", 1, 0, 1, 0.05, "alpha：粒子整体透明度"),
      checkboxParam(
        "rotateToPath",
        "朝向路径",
        true,
        "开启后粒子旋转到路径切线方向",
      ),
      checkboxParam(
        "fadeEnds",
        "路径两端淡出",
        true,
        "开启后粒子靠近路径首尾时淡入淡出",
      ),
      checkboxParam(
        "keepOriginal",
        "保留原图",
        false,
        "开启后保留当前图片，关闭后只显示路径粒子",
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
    description:
      "图片旋转动画。可按圈数/方向控制速度，支持开头加速、结尾减速；压力参数可让外轮廓保持竖向椭圆，内部图片继续旋转。",
    defaultDuration: 2,
    recommendedDuration:
      "tips：0.5 ~ 8s；turns 控制圈数，pressure>0 时适合车轮压扁旋转",
    defaultEasing: "linear",
    params: [
      numberParam(
        "turns",
        "旋转圈数",
        1,
        -120,
        120,
        0.25,
        "turns：持续时间内旋转多少圈；正数顺时针，负数逆时针",
      ),
      selectParam(
        "direction",
        "旋转方向",
        1,
        [
          { value: 1, label: "顺时针" },
          { value: -1, label: "逆时针" },
        ],
        "direction：旋转方向；会和 turns 的正负共同决定最终方向",
      ),
      numberParam(
        "accelRatio",
        "加速占比",
        0.12,
        0,
        0.8,
        0.01,
        "accelRatio：前段用于从慢到快的时间比例",
      ),
      numberParam(
        "decelRatio",
        "减速占比",
        0.12,
        0,
        0.8,
        0.01,
        "decelRatio：后段用于从快到慢的时间比例",
      ),
      numberParam(
        "pressure",
        "竖向压力",
        0,
        0,
        0.8,
        0.01,
        "pressure：0=普通旋转；>0 时外形竖向压扁为椭圆，但内部图片仍独立旋转",
      ),
      numberParam(
        "pressureStretch",
        "横向补偿",
        0.35,
        0,
        1,
        0.01,
        "pressureStretch：压力压扁时横向变宽补偿，模拟体积守恒",
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
    type: "card_carousel_3d",
    label: "CardCarousel3D 3D卡片转盘",
    description:
      "交互式 3D 卡片转盘：在同一个动画内编辑开始转、持续慢转、快速转、减速停止、停止后定格五个阶段；预览可按完整演示或单阶段查看。若挂在序列帧图层上，VNI 仅在编辑器预览中把每帧当作卡牌贴图库；cardCount 仍表示一圈中的逻辑卡牌总数，不等于序列帧数量，不影响运行时参数。",
    defaultDuration: 6.6,
    recommendedDuration:
      "tips：完整演示 5 ~ 9s；真实游戏中 idle 阶段由程序循环等待点击，停止后定格阶段用于展示结果；不同卡牌真实预览请使用序列帧图层；序列帧数量只是贴图库数量",
    defaultEasing: "linear",
    params: [
      selectParam(
        "phasePreviewMode",
        "阶段预览",
        "full_demo",
        [
          { value: "full_demo", label: "完整演示：开始→慢转→快转→停止→定格" },
          { value: "intro", label: "只预览开始转/逐张出现" },
          { value: "idle", label: "只预览持续慢转" },
          { value: "fast", label: "只预览快速转" },
          { value: "stop", label: "只预览减速停止" },
          { value: "hold", label: "只预览停止后定格" },
        ],
        "phasePreviewMode：编辑器预览模式；真实运行时建议由程序状态机触发阶段",
      ),
      numberParam(
        "cardCount",
        "卡片数量",
        7,
        2,
        30,
        1,
        "cardCount：转盘一圈中的逻辑卡片数量，不是序列帧数量；序列帧图层仅在 VNI 预览中作为贴图库，按 cardIndex % frameCount 循环取图",
      ),
      numberParam(
        "targetIndex",
        "停中索引",
        0,
        0,
        29,
        1,
        "targetIndex：最终停在中间的卡片索引，0 为第一张；外部程序可运行时替换",
      ),
      numberParam(
        "rounds",
        "停止额外圈数",
        3,
        0,
        20,
        0.25,
        "rounds：停止阶段在对齐目标卡之前额外旋转的圈数，越大越像抽选",
      ),
      selectParam(
        "direction",
        "旋转方向",
        1,
        [
          { value: 1, label: "向右/顺时针" },
          { value: -1, label: "向左/逆时针" },
        ],
        "direction：转盘旋转方向",
      ),
      numberParam(
        "introDuration",
        "开始转秒",
        1.2,
        0.1,
        10,
        0.05,
        "introDuration：开始阶段时长；卡片一边维持旋转，一边按顺序显示出来",
      ),
      numberParam(
        "introSpeed",
        "开始转速度",
        0.22,
        0,
        8,
        0.01,
        "introSpeed：开始阶段转速，单位约为圈/秒",
      ),
      selectParam(
        "revealDirection",
        "出现顺序",
        0,
        [
          { value: 0, label: "从左到右" },
          { value: 1, label: "从右到左" },
          { value: 2, label: "从中间向两侧" },
        ],
        "revealDirection：开始阶段卡片逐张出现的排序方式",
      ),
      numberParam(
        "revealStagger",
        "逐张间隔秒",
        0.08,
        0,
        2,
        0.01,
        "revealStagger：相邻卡片开始出现的时间间隔",
      ),
      numberParam(
        "revealOffsetX",
        "出现偏移 X",
        90,
        -1000,
        1000,
        1,
        "revealOffsetX：每张卡出现前的横向滑入偏移；负数反向",
      ),
      numberParam(
        "revealScaleFrom",
        "出现起始缩放",
        0.72,
        0.05,
        2,
        0.01,
        "revealScaleFrom：开始阶段单张卡从该倍率放大到正常尺寸",
      ),
      numberParam(
        "demoIdleDuration",
        "慢转演示秒",
        1.2,
        0.1,
        20,
        0.05,
        "demoIdleDuration：完整演示中 idle 慢转的预览时长；真实运行可无限循环等待点击",
      ),
      numberParam(
        "idleSpeed",
        "慢转速度",
        0.18,
        0,
        8,
        0.01,
        "idleSpeed：持续慢转阶段转速，单位约为圈/秒",
      ),
      numberParam(
        "fastDuration",
        "快速转秒",
        1.1,
        0.1,
        10,
        0.05,
        "fastDuration：玩家点击后快速旋转阶段的时长",
      ),
      numberParam(
        "fastSpeed",
        "快速转速度",
        2.8,
        0,
        20,
        0.05,
        "fastSpeed：快速旋转阶段目标转速，单位约为圈/秒",
      ),
      numberParam(
        "accelRatio",
        "快速加速占比",
        0.28,
        0,
        0.9,
        0.01,
        "accelRatio：快速阶段前段从慢转速度加速到快速速度的时间占比",
      ),
      numberParam(
        "stopDuration",
        "减速停止秒",
        1.6,
        0.1,
        10,
        0.05,
        "stopDuration：减速停止阶段，用于从快速旋转对齐 targetIndex 的时长",
      ),
      numberParam(
        "holdDuration",
        "停止定格秒",
        1,
        0,
        20,
        0.05,
        "holdDuration：目标卡停在中间后的展示定格时长；完整演示会在停止后继续保持该秒数",
      ),
      numberParam(
        "stopOvershoot",
        "停止过冲",
        0.18,
        0,
        2,
        0.01,
        "stopOvershoot：停止时轻微越过再回落的强度，0=无过冲",
      ),
      numberParam(
        "finalPop",
        "停中弹出",
        0.12,
        0,
        1,
        0.01,
        "finalPop：停止末尾目标卡片额外弹出放大强度",
      ),
      numberParam(
        "finalGlow",
        "停中提亮",
        0.18,
        0,
        1,
        0.01,
        "finalGlow：停止末尾目标卡片额外提亮强度",
      ),
      numberParam(
        "radius",
        "转盘半径",
        360,
        20,
        3000,
        1,
        "radius：转盘基础半径，会同时影响横向展开和轻微纵深下沉",
      ),
      numberParam(
        "cardSpacing",
        "卡片间距",
        1,
        0.2,
        3,
        0.01,
        "cardSpacing：只调整卡片横向分布间距；1=默认，增大到 1.2~1.6 可避免卡片互相挨住",
      ),
      numberParam(
        "perspective",
        "透视强度",
        0.72,
        0,
        1,
        0.01,
        "perspective：纵深透视强度，越大远处卡片越小更暗",
      ),
      numberParam(
        "slices",
        "竖向切片",
        12,
        2,
        48,
        1,
        "slices：每张可见卡片竖切片数量；越多越平滑但更耗性能",
      ),
      numberParam(
        "visibleRange",
        "可见半圈",
        0.72,
        0.1,
        1,
        0.01,
        "visibleRange：正面可见范围，0.5 约等于只显示前半圈，1 显示整圈",
      ),
      numberParam(
        "cardSize",
        "卡片最长边",
        360,
        20,
        1200,
        1,
        "cardSize：单张卡片预览最长边像素",
      ),
      numberParam(
        "centerScale",
        "中间放大",
        1.12,
        0.1,
        5,
        0.01,
        "centerScale：停在中间的卡片额外放大倍率",
      ),
      numberParam(
        "sideScale",
        "侧边缩放",
        0.72,
        0.05,
        3,
        0.01,
        "sideScale：侧边卡片基础缩放，越小空间感越强",
      ),
      numberParam(
        "sideAlpha",
        "侧边透明",
        0.38,
        0,
        1,
        0.01,
        "sideAlpha：侧边/远处卡片最低透明度",
      ),
      numberParam(
        "shadeStrength",
        "明暗强度",
        0.42,
        0,
        0.9,
        0.01,
        "shadeStrength：卡片转到侧面/远处时变暗强度",
      ),
      numberParam(
        "curve",
        "卡面弧度",
        0.55,
        0,
        1,
        0.01,
        "curve：单张卡片竖切片的圆柱弯曲感，越大切片透视越明显",
      ),
      numberParam(
        "tilt",
        "侧向倾斜°",
        8,
        0,
        45,
        1,
        "tilt：侧边卡片轻微倾斜角度，增强 3D 运动感",
      ),
      numberParam(
        "sourceOpacity",
        "原图层透明度",
        0,
        0,
        1,
        0.05,
        "sourceOpacity：动画播放时原始图层自身保留透明度，0=只显示转盘",
      ),
      checkboxParam(
        "hideBack",
        "隐藏背面",
        true,
        "开启后背面卡片不绘制，更像前半圈转盘且性能更好",
      ),
      checkboxParam(
        "keepOriginal",
        "保留原图",
        false,
        "开启后原图层按 sourceOpacity 显示；关闭后只显示 3D 卡片转盘",
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
  if (type === "multi_move") {
    return { pointsJson: DEFAULT_MULTI_MOVE_POINTS_JSON };
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
  if (type === "bounce_jump") {
    return {
      height: 300,
      anticipationRatio: 0.18,
      squash: 0.28,
      stretch: 0.18,
      topSquash: 0.08,
      bounceCount: 2,
      bounceDecay: 0.45,
      landSquash: 0.22,
    };
  }
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
  if (type === "speed_lines") {
    return {
      mode: 0,
      count: 72,
      radius: 520,
      length: 120,
      speed: 1.4,
      direction: 0,
      spreadAngle: 360,
      lineWidth: 3,
      alpha: 0.75,
      fadeOut: true,
      keepOriginal: false,
    };
  }
  if (type === "drift_fall") {
    return {
      count: 48,
      areaWidth: 900,
      areaHeight: 1600,
      cycles: 1,
      wind: 45,
      swayAmplitude: 42,
      swayFrequency: 1,
      size: 48,
      sizeRandom: 0.45,
      rotationSpeed: 1,
      alpha: 1,
      fadeEdges: true,
      keepOriginal: false,
    };
  }
  if (type === "path_particles") {
    return {
      pathMode: 1,
      count: 36,
      size: 42,
      endX: 360,
      endY: 0,
      curve: 160,
      amplitude: 70,
      frequency: 2.5,
      radiusStart: 240,
      radiusEnd: 60,
      turns: 1.5,
      loop: true,
      speed: 1,
      stagger: 1,
      oneShotStagger: 0.25,
      trailCount: 3,
      trailSpacing: 0.035,
      trailFade: 0.55,
      alpha: 1,
      rotateToPath: true,
      fadeEnds: true,
      keepOriginal: false,
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
  if (type === "gather_particles") {
    return {
      count: 48,
      size: 42,
      sourceOpacity: 0,
      spawnRadius: 360,
      spawnRatio: 0.2,
      targetX: 0,
      targetY: 0,
      travelMode: 1,
      curve: 160,
      spiralTurns: 0.75,
      staggerRatio: 0.28,
      trailCount: 3,
      trailSpacing: 0.04,
      trailFade: 0.55,
      vanishMode: 1,
      vanishRatio: 0.18,
      flashScale: 1.6,
      flashIntensity: 1.35,
    };
  }
  if (type === "smoke_mist") {
    return {
      count: 56,
      size: 96,
      sourceOpacity: 0,
      spawnRadius: 80,
      spread: 320,
      windX: 80,
      windY: 40,
      swirl: 120,
      startAlpha: 0.62,
      fadePower: 1.35,
      grow: 2.1,
      sizeRandom: 0.55,
      rotationSpeed: 0.6,
      keepOriginalAtEnd: false,
    };
  }
  if (type === "energy_ring") {
    return {
      ringCount: 2,
      startScale: 0.25,
      endScale: 2.4,
      sourceOpacity: 0,
      alpha: 1,
      stagger: 0.28,
      rotation: 60,
      pulse: 0.08,
      vanishMode: 1,
      additive: true,
    };
  }
  if (type === "slash_light") {
    return {
      mode: 0,
      angle: -25,
      travel: 180,
      lengthScale: 2.4,
      widthScale: 0.55,
      sourceOpacity: 0,
      flashAlpha: 1,
      startScale: 0.18,
      fadeRatio: 0.45,
      curve: 90,
      additive: true,
    };
  }
  if (type === "flame_flicker") {
    return {
      count: 52,
      emitterWidth: 180,
      height: 420,
      direction: 270,
      spreadAngle: 22,
      vanishSpread: 120,
      lengthRandom: 0.35,
      size: 96,
      sourceOpacity: 0,
      sway: 54,
      turbulence: 80,
      grow: 1.65,
      alpha: 0.9,
      flicker: 0.35,
      cycles: 1,
      additive: true,
    };
  }
  if (type === "wave_band") {
    return {
      mode: 0,
      count: 36,
      length: 720,
      amplitude: 70,
      frequency: 2.5,
      speed: 1,
      direction: 0,
      size: 48,
      alpha: 1,
      trailFade: 0.75,
      rotateToWave: true,
      keepOriginal: false,
    };
  }
  if (type === "wave_distort") {
    return {
      rows: 36,
      amplitude: 24,
      frequency: 2,
      cycles: 1,
      phaseOffset: 1,
      verticalBob: 0,
      alpha: 1,
      edgeFeather: 0,
      keepOriginal: false,
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
      turns: 1,
      direction: 1,
      accelRatio: 0.12,
      decelRatio: 0.12,
      pressure: 0,
      pressureStretch: 0.35,
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
  if (type === "card_carousel_3d") {
    return {
      phasePreviewMode: "full_demo",
      cardCount: 7,
      targetIndex: 0,
      rounds: 3,
      direction: 1,
      introDuration: 1.2,
      introSpeed: 0.22,
      revealDirection: 0,
      revealStagger: 0.08,
      revealOffsetX: 90,
      revealScaleFrom: 0.72,
      demoIdleDuration: 1.2,
      idleSpeed: 0.18,
      fastDuration: 1.1,
      fastSpeed: 2.8,
      accelRatio: 0.28,
      stopDuration: 1.6,
      holdDuration: 1,
      stopOvershoot: 0.18,
      finalPop: 0.12,
      finalGlow: 0.18,
      radius: 360,
      cardSpacing: 1,
      perspective: 0.72,
      slices: 12,
      visibleRange: 0.72,
      cardSize: 360,
      centerScale: 1.12,
      sideScale: 0.72,
      sideAlpha: 0.38,
      shadeStrength: 0.42,
      curve: 0.55,
      tilt: 8,
      sourceOpacity: 0,
      hideBack: true,
      keepOriginal: false,
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
  const orderedAnimations = [...animations].sort(
    (a, b) => a.startTime - b.startTime,
  );
  for (const animation of orderedAnimations) {
    if (!animation.enabled) continue;
    const progress = getAnimationProgressForSampling(animation, time);
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
    else if (animation.type === "multi_move")
      sampleMultiMove(result, animation, time);
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
    else if (animation.type === "bounce_jump")
      sampleBounceJump(result, animation, progress);
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
    else if (
      animation.type === "particle_combo" ||
      animation.type === "gather_particles" ||
      animation.type === "smoke_mist" ||
      animation.type === "energy_ring" ||
      animation.type === "slash_light" ||
      animation.type === "flame_flicker"
    )
      sampleParticleComboSource(result, animation, base);
    else if (
      animation.type === "wave_band" ||
      animation.type === "wave_distort" ||
      animation.type === "speed_lines" ||
      animation.type === "drift_fall" ||
      animation.type === "path_particles"
    )
      sampleParticleKeepOriginalSource(result, animation);
    else if (animation.type === "card_carousel_3d")
      sampleCardCarousel3DSource(result, animation, base);
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
  "gather_particles",
  "smoke_mist",
  "energy_ring",
  "flame_flicker",
  "wave_band",
  "speed_lines",
  "drift_fall",
  "path_particles",
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

export function shouldHideLayerOutsideActiveAnimation(
  animations: V5GAnimationConfig[],
  time: number,
): boolean {
  const enabledAnimations = animations.filter((animation) => animation.enabled);
  if (enabledAnimations.length === 0) return false;
  return !enabledAnimations.some((animation) => {
    const start = animation.startTime;
    const end = animation.startTime + animation.duration;
    return time >= start && time <= end;
  });
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

function sampleMultiMove(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  time: number,
): void {
  const points = parseMultiMovePoints(
    animation.params.pointsJson,
    animation.duration,
  );
  if (points.length === 0) return;
  const localTime = clampNumber(
    time - animation.startTime,
    0,
    animation.duration,
  );
  if (points.length === 1 || localTime <= points[0].time) {
    result.transform.x += points[0].x;
    result.transform.y += points[0].y;
    return;
  }
  const lastPoint = points[points.length - 1];
  if (!lastPoint || localTime >= lastPoint.time) {
    result.transform.x += lastPoint?.x ?? 0;
    result.transform.y += lastPoint?.y ?? 0;
    return;
  }
  for (let index = 1; index < points.length; index += 1) {
    const fromPoint = points[index - 1];
    const toPoint = points[index];
    if (!fromPoint || !toPoint || localTime > toPoint.time) continue;
    const segmentDuration = Math.max(toPoint.time - fromPoint.time, 0.0001);
    const progress = clampNumber(
      (localTime - fromPoint.time) / segmentDuration,
      0,
      1,
    );
    const easedProgress = easeProgress(progress, toPoint.easing);
    result.transform.x += lerpOvershoot(fromPoint.x, toPoint.x, easedProgress);
    result.transform.y += lerpOvershoot(fromPoint.y, toPoint.y, easedProgress);
    return;
  }
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

function sampleBounceJump(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const p = clampNumber(progress, 0, 1);
  const height = Math.max(0, getNumberParam(animation, "height", 300));
  const anticipationRatio = clampNumber(
    getNumberParam(animation, "anticipationRatio", 0.18),
    0.02,
    0.6,
  );
  const squash = clampNumber(getNumberParam(animation, "squash", 0.28), 0, 0.9);
  const stretch = clampNumber(
    getNumberParam(animation, "stretch", 0.18),
    0,
    0.9,
  );
  const topSquash = clampNumber(
    getNumberParam(animation, "topSquash", 0.08),
    0,
    0.6,
  );
  const bounceCount = Math.round(
    clampNumber(getNumberParam(animation, "bounceCount", 2), 0, 8),
  );
  const bounceDecay = clampNumber(
    getNumberParam(animation, "bounceDecay", 0.45),
    0.05,
    0.95,
  );
  const landSquash = clampNumber(
    getNumberParam(animation, "landSquash", 0.22),
    0,
    0.9,
  );

  let offsetY = 0;
  let scaleXRatio = 1;
  let scaleYRatio = 1;

  if (p < anticipationRatio) {
    const phase = clampNumber(p / anticipationRatio, 0, 1);
    const wave = Math.sin(phase * Math.PI);
    const squashWave = easeProgress(phase, "easeOutQuad");
    offsetY = -height * 0.06 * wave;
    scaleXRatio *= 1 + squash * 0.55 * squashWave;
    scaleYRatio *= Math.max(0.1, 1 - squash * squashWave);
  } else {
    const jumpProgress = clampNumber(
      (p - anticipationRatio) / Math.max(1 - anticipationRatio, 0.0001),
      0,
      1,
    );
    const lobeCount = Math.max(1, bounceCount + 1);
    const lobeHeights = Array.from(
      { length: lobeCount },
      (_, index) => height * Math.pow(bounceDecay, index),
    );
    const totalWeight = lobeHeights.reduce(
      (sum, value) => sum + Math.sqrt(Math.max(value, 1)),
      0,
    );
    let accumulated = 0;
    let currentStart = 0;
    let currentEnd = 1;
    let currentHeight = lobeHeights[0] ?? height;
    for (const lobeHeight of lobeHeights) {
      const span =
        Math.sqrt(Math.max(lobeHeight, 1)) / Math.max(totalWeight, 0.0001);
      currentStart = accumulated;
      currentEnd = accumulated + span;
      currentHeight = lobeHeight;
      if (
        jumpProgress <= currentEnd ||
        lobeHeight === lobeHeights[lobeHeights.length - 1]
      ) {
        break;
      }
      accumulated = currentEnd;
    }
    const lobeProgress = clampNumber(
      (jumpProgress - currentStart) /
        Math.max(currentEnd - currentStart, 0.0001),
      0,
      1,
    );
    offsetY = 4 * currentHeight * lobeProgress * (1 - lobeProgress);

    const velocity = 1 - 2 * lobeProgress;
    const flightStretch = Math.max(0, velocity) * stretch;
    const apex = 1 - clampNumber(Math.abs(lobeProgress - 0.5) / 0.18, 0, 1);
    const landing =
      lobeProgress < 0.5
        ? 1 - clampNumber(lobeProgress / 0.14, 0, 1)
        : 1 - clampNumber((1 - lobeProgress) / 0.14, 0, 1);
    const lobeIndex = lobeHeights.findIndex((value) => value === currentHeight);
    const decayScale = Math.pow(bounceDecay, Math.max(0, lobeIndex));
    const landingSquash = landSquash * landing * decayScale;
    const topCompress = topSquash * apex;

    scaleYRatio *= Math.max(
      0.1,
      1 + flightStretch - landingSquash - topCompress,
    );
    scaleXRatio *= Math.max(
      0.1,
      1 - flightStretch * 0.35 + landingSquash * 0.55 + topCompress * 0.35,
    );
  }

  result.transform.y += offsetY;
  result.transform.scaleX *= scaleXRatio;
  result.transform.scaleY *= scaleYRatio;
}

function sampleRotate(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  progress: number,
): void {
  const pressure = clampNumber(
    getNumberParam(animation, "pressure", 0),
    0,
    0.8,
  );
  if (Object.prototype.hasOwnProperty.call(animation.params, "turns")) {
    const turns = getNumberParam(animation, "turns", 1);
    const direction = getNumberParam(animation, "direction", 1) < 0 ? -1 : 1;
    const motionProgress = easeSpinProgress(
      progress,
      getNumberParam(animation, "accelRatio", 0.12),
      getNumberParam(animation, "decelRatio", 0.12),
    );
    const rotation = turns * 360 * direction * motionProgress;
    if (pressure > 0.001) {
      const pressureStretch = clampNumber(
        getNumberParam(animation, "pressureStretch", 0.35),
        0,
        1,
      );
      result.transform.scaleX *= 1 + pressure * pressureStretch;
      result.transform.scaleY *= Math.max(0.1, 1 - pressure);
      result.visualRotation = (result.visualRotation ?? 0) + rotation;
    } else {
      result.transform.rotation += rotation;
    }
    return;
  }

  // Legacy projects created before VNI_0.086 used fromRotation/toRotation.
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

function sampleParticleKeepOriginalSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
): void {
  if (getBooleanParam(animation, "keepOriginal", false)) return;
  result.opacity = 0;
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

function sampleCardCarousel3DSource(
  result: V5GAnimationSampleResult,
  animation: V5GAnimationConfig,
  base: V5GAnimationSampleBase,
): void {
  if (getBooleanParam(animation, "keepOriginal", false)) {
    result.opacity =
      base.opacity * getNumberParam(animation, "sourceOpacity", 0);
    return;
  }
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

function parseMultiMovePoints(
  value: V5GAnimationParamValue | undefined,
  duration: number,
): V5GMultiMovePoint[] {
  const rawText =
    typeof value === "string" ? value : DEFAULT_MULTI_MOVE_POINTS_JSON;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = DEFAULT_MULTI_MOVE_POINTS;
  }
  const parsedItems: unknown[] = Array.isArray(parsed)
    ? parsed
    : DEFAULT_MULTI_MOVE_POINTS;
  const points = parsedItems
    .map((item: unknown): V5GMultiMovePoint | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const x = Number(record.x);
      const y = Number(record.y);
      const pointTime = Number(record.time);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: roundTo(clampNumber(x, -5000, 5000), 4),
        y: roundTo(clampNumber(y, -5000, 5000), 4),
        time: roundTo(
          clampNumber(Number.isFinite(pointTime) ? pointTime : 0, 0, duration),
          4,
        ),
        easing: normalizeEasingName(record.easing),
      };
    })
    .filter((item): item is V5GMultiMovePoint => item !== null)
    .sort((a, b) => a.time - b.time);

  return points.length > 0 ? points : [...DEFAULT_MULTI_MOVE_POINTS];
}

function normalizeEasingName(value: unknown): V5GEasingName {
  return V5G_EASINGS.some((item) => item.value === value)
    ? (value as V5GEasingName)
    : "linear";
}

function getAnimationProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start) return null;
  if (time > end) return null;
  if (time === end) return 1;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}

function getAnimationProgressForSampling(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const progress = getAnimationProgress(animation, time);
  if (progress !== null) return progress;
  const end = animation.startTime + animation.duration;
  if (time > end && shouldPersistEndedTransform(animation.type)) return 1;
  return null;
}

function shouldPersistEndedTransform(type: V5GAnimationType): boolean {
  return (
    type === "move" ||
    type === "multi_move" ||
    type === "slide_in" ||
    type === "slide_out" ||
    type === "squash_stretch"
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
  visibleWhen?: V5GAnimationParamVisibilityRule,
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
    visibleWhen,
  };
}

function selectParam(
  key: string,
  label: string,
  defaultValue: string | number,
  options: { value: string | number; label: string }[],
  recommendedRange: string,
  visibleWhen?: V5GAnimationParamVisibilityRule,
): V5GAnimationParamSpec {
  return {
    key,
    label,
    inputType: "select",
    defaultValue,
    recommendedRange,
    options,
    visibleWhen,
  };
}

function checkboxParam(
  key: string,
  label: string,
  defaultValue: boolean,
  recommendedRange: string,
  visibleWhen?: V5GAnimationParamVisibilityRule,
): V5GAnimationParamSpec {
  return {
    key,
    label,
    inputType: "checkbox",
    defaultValue,
    recommendedRange,
    visibleWhen,
  };
}

function getLoopWave(progress: number, cycles: number): number {
  return (1 - Math.cos(progress * Math.PI * 2 * cycles)) / 2;
}

function easeSpinProgress(
  progress: number,
  accelRatio: number,
  decelRatio: number,
): number {
  const t = clampNumber(progress, 0, 1);
  const accel = clampNumber(accelRatio, 0, 0.8);
  const decel = clampNumber(decelRatio, 0, 0.8);
  const totalEase = accel + decel;
  if (totalEase <= 0.0001) return t;
  const normalizedAccel = totalEase > 0.95 ? (accel / totalEase) * 0.95 : accel;
  const normalizedDecel = totalEase > 0.95 ? (decel / totalEase) * 0.95 : decel;
  const linearSpan = Math.max(0, 1 - normalizedAccel - normalizedDecel);
  const speedArea = linearSpan + normalizedAccel * 0.5 + normalizedDecel * 0.5;
  if (speedArea <= 0.0001) return t;

  if (t <= normalizedAccel && normalizedAccel > 0) {
    const phase = t / normalizedAccel;
    return (normalizedAccel * phase * phase * 0.5) / speedArea;
  }
  if (t >= 1 - normalizedDecel && normalizedDecel > 0) {
    const phase = (t - (1 - normalizedDecel)) / normalizedDecel;
    const beforeDecel = normalizedAccel * 0.5 + linearSpan;
    const decelArea = normalizedDecel * (phase - phase * phase * 0.5);
    return (beforeDecel + decelArea) / speedArea;
  }
  return (normalizedAccel * 0.5 + (t - normalizedAccel)) / speedArea;
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
