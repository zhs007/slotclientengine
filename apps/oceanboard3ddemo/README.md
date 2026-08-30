# oceanboard3ddemo

Three.js 竖屏浅海棋盘场景的分阶段视觉样片。当前阶段只实现程序化天空、固定地平线、Gerstner 风格
几何波浪、片元级细波纹、视角相关反射和太阳碎光路径；尚未加入海床、真实折射、焦散、棋盘、
symbols、鱼群、船或 UI。

参考图采用美术化透明海面，并不追求严格物理正确。后续阶段会把水下场景渲染到独立 RenderTarget，
在保持棋盘可读性的前提下加入深度吸收与折射。

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
