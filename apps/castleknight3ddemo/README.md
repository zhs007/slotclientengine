# castleknight3ddemo

Three.js 卡通渲染城堡骑士棋盘 demo。场景包含 5×6 中世纪符号棋盘、石砌王座大厅、拱门与立柱、
旗帜、吊灯、火把和可交互的老虎机风格 HUD。模型由代码生成，墙面、地面、木材与织物使用项目内的
手绘无缝贴图，细节纹理、toon gradient、轮廓线和屏幕空间合成效果在运行时生成。

`public/textures/` 下的四张手绘贴图由 OpenAI ImageGen 根据本项目的城堡参考画面生成，分别用于
墙砖、地砖、深色木料和酒红织物。

单张参考图没有展示侧后方结构，因此当前实现是面向浏览器实时渲染的低多边形近似重建，不是原图资产的
精确网格提取。

```bash
pnpm --filter castleknight3ddemo dev
```

定向验收：

```bash
pnpm --filter castleknight3ddemo typecheck
pnpm --filter castleknight3ddemo lint
pnpm --filter castleknight3ddemo test
pnpm --filter castleknight3ddemo build
```
