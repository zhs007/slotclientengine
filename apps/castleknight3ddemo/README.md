# castleknight3ddemo

程序化 Three.js 城堡骑士棋盘 demo。场景包含 5×6 中世纪符号棋盘、石砌王座大厅、拱门与立柱、
旗帜、吊灯、火把和可交互的老虎机风格 HUD。所有模型和石材纹理均由代码生成，不依赖外部美术包。

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
