import type { AnimationSupportEntry } from "../config/victory-types.js";

export const ANIMATION_SUPPORT_MATRIX: AnimationSupportEntry[] = [
  { type: "bounceIn", status: "supported", note: "示例使用，按编辑器语义实现弹性缩放进入。" },
  { type: "fadeIn", status: "supported", note: "示例使用，支持透明度进入与缓动。" },
  { type: "fadeOut", status: "supported", note: "示例使用，支持透明度退出与缓动。" },
  { type: "fireDistortion", status: "supported", note: "示例使用，使用位移滤镜和噪声纹理近似火焰热浪。" },
  { type: "firework", status: "supported", note: "示例使用，支持升空后爆裂粒子。" },
  { type: "float", status: "supported", note: "示例使用，支持上下悬浮循环。" },
  { type: "particleBurst", status: "supported", note: "示例使用，支持持续发射与衰减。" },
  { type: "slideIn", status: "supported", note: "示例使用，支持绝对起始坐标进入。" },
  { type: "starlight", status: "supported", note: "示例使用，支持随机闪烁星光生成。" },
  { type: "sweepLight", status: "supported", note: "示例使用，支持扫光与重复播放。" },
  { type: "swing", status: "supported", note: "示例使用，支持绕中心摇摆。" },
  { type: "wave", status: "supported", note: "示例使用，支持横向偏移、纵向起伏和轻微旋转。" },
  { type: "zoomIn", status: "supported", note: "示例使用，支持 back.out 缩放进入。" },
  { type: "slideOut", status: "implemented-not-used", note: "已实现，与 slideIn 对应。" },
  { type: "pulse", status: "implemented-not-used", note: "已实现，支持呼吸缩放。" },
  { type: "rotate", status: "implemented-not-used", note: "已实现，支持匀速旋转。" },
  { type: "flipX", status: "implemented-not-used", note: "已实现，支持水平翻转震荡。" },
  { type: "flipY", status: "implemented-not-used", note: "已实现，支持垂直翻转震荡。" },
  { type: "plexus", status: "implemented-not-used", note: "已实现，使用 Graphics 绘制连线粒子。" },
  { type: "shatter", status: "implemented-not-used", note: "已实现为近似碎裂特效，使用块状碎片而非逐像素切片。" },
  { type: "glitch", status: "implemented-not-used", note: "已实现，支持抖动和透明度闪烁。" },
  { type: "magicShine", status: "implemented-not-used", note: "已实现，支持遮罩扫光带。" },
  { type: "cloudSea", status: "implemented-not-used", note: "已实现，使用位移滤镜近似云海流动。" },
  { type: "sequenceScale", status: "implemented-not-used", note: "已实现，支持三段式缩放与透明度。" },
  { type: "custom", status: "unsupported", note: "初始化阶段不执行任意脚本，避免引入不透明运行时和安全边界问题。" }
];