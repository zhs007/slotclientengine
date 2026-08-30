# oceanboard3ddemo

Three.js 竖屏浅海棋盘场景的分阶段视觉样片。当前阶段实现程序化天空、固定地平线、Gerstner 风格
几何波浪、片元级细波纹、视角相关反射、太阳碎光路径，以及独立水下 RenderTarget 驱动的浅海床、
深度吸收、折射和动态焦散；尚未加入棋盘、symbols、鱼群、船或 UI。

参考图采用美术化透明海面，并不追求严格物理正确。水下场景使用 72% drawing-buffer 尺寸的独立
RenderTarget；后续棋盘会进入同一水下场景，在保持可读性的前提下接受深度吸收、折射和焦散。
海面细法线与海床焦散分别使用 app 自有的 UASTC KTX2 高度纹理和焦散强度纹理，并通过不同旋转、
尺度与镜像重复消除接缝和规则方向感。近景弱化表面纹理以保持浅海透明度，远景保留完整波光并压低
两侧天空染色。太阳碎光仅由水面法线与太阳方向决定，不再绘制人为的横向或中心光带。

```bash
pnpm --filter oceanboard3ddemo dev
```

定向验收：

```bash
pnpm --filter oceanboard3ddemo typecheck
pnpm --filter oceanboard3ddemo lint
pnpm --filter oceanboard3ddemo test
pnpm --filter oceanboard3ddemo build
```
