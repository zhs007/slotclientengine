# castleknight3ddemo

Three.js 卡通渲染城堡骑士棋盘 demo。场景包含 5×6 中世纪符号棋盘、石砌王座大厅、拱门与立柱、
旗帜、吊灯、火把和可交互的老虎机风格 HUD。模型由代码生成，墙面、地面、木材与织物使用项目内的
手绘无缝贴图，细节纹理、toon gradient、轮廓线和屏幕空间合成效果在运行时生成。

`public/textures/` 下的手绘贴图由 OpenAI ImageGen 根据本项目的城堡参考画面生成，除墙砖、地砖、
深色木料和酒红织物外，还包含宝箱专用胡桃木、锤纹金属和圆柱紫灰石材贴图。宝箱与分段圆柱则按
img2threejs 的参考准入、雕塑规格、无贴图结构门禁和最终贴图门禁完成重建。运行时贴图统一使用
WebP；参考图、细节裁剪和验收截图不进入 Git。

单张参考图没有展示侧后方结构，因此当前实现是面向浏览器实时渲染的低多边形近似重建，不是原图资产的
精确网格提取。

```bash
pnpm --filter castleknight3ddemo dev
```

开发时可用 `?prop=chest` 或 `?prop=column` 查看无贴图结构门禁；追加 `&mode=final` 查看最终贴图，
追加 `&view=side` 检查侧视体积。

定向验收：

```bash
pnpm --filter castleknight3ddemo typecheck
pnpm --filter castleknight3ddemo lint
pnpm --filter castleknight3ddemo test
pnpm --filter castleknight3ddemo build
```
