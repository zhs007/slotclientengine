# underwater3ddemo

Three.js 竖屏海底视觉样片。使用程序化几何和 shader 构建动态水面、体积光柱、海床焦散、深度雾、
气泡、悬浮颗粒、远景沉船、鱼群剪影、洞穴岩石边框、珊瑚和 6×7 简化符号阵列。

该 demo 的目标是验证海底氛围与移动端实时渲染路线，不是从单张参考图提取精确模型。符号使用低面数
实例化占位模型，后续可替换为正式 GLB、Spine 或透明图片资产。

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
