# underwater3ddemo

Three.js 竖屏海底环境样片。当前基线包含水体颜色衰减、极弱全局折射、一层宽柔环境光域、一束
软边主光和远中近三层低浓度动态水雾；不包含海面、海床、气泡、微粒、symbol、鱼群、沉船、
洞穴边框或珊瑚。摄像机保持固定，动态只来自水体内部的低频明暗流动。主光和三层水雾共享一张
1024×1024 无缝 RGBA 数据贴图：RG 保存两种尺度的密度，BA 保存二维流向；贴图不参与背景水色，
避免重新产生海面映射的错觉。运行时贴图采用带完整 mipmap 的 UASTC KTX2，并使用
Three.js 本地依赖中随生产包输出的 Basis JS/WASM 转码器，不依赖 CDN。后续效果以单一元素逐步加入。

顶部波光由第二张无缝 KTX2 聚光数据贴图驱动：近表层保持细碎、较快的亮度变化，同一光场向下调制
唯一的宽主光，使其随深度轻微弯曲、扩散和改变密度，而不是将表层纹理向下拉伸成规则光柱。

该 demo 的目标是先验证纯海底氛围与移动端实时渲染路线。独立的 `viewer.html` 仍可用于检查后续加入
场景的 GLB 资源及其动画。

```bash
pnpm --filter underwater3ddemo dev
```

定向验收：

```bash
pnpm --filter underwater3ddemo typecheck
pnpm --filter underwater3ddemo lint
pnpm --filter underwater3ddemo test
pnpm --filter underwater3ddemo build
```
