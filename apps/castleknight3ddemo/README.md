# castleknight3ddemo

Three.js 卡通渲染城堡骑士棋盘 demo。场景包含 5×6 中世纪符号棋盘、石砌王座大厅、拱门与立柱、
旗帜、吊灯、火把和可交互的老虎机风格 HUD。场景模型主要由代码生成，板凳、木桶、战斧、王座台阶、王座、墙体和立柱使用压缩后的外部 GLB，
墙面、地面、木材与织物使用项目内的
手绘无缝贴图，细节纹理、toon gradient、轮廓线和屏幕空间合成效果在运行时生成。

`public/textures/` 下的手绘贴图由 OpenAI ImageGen 根据本项目的城堡参考画面生成，除墙砖、地砖、
深色木料和酒红织物外，还包含宝箱专用胡桃木、锤纹金属、圆柱紫灰石材、橡木板、城堡切石和深色
锻铁贴图，以及魔法书使用的酒红皮革和书页贴图。宝箱、
壁挂火把、双环吊灯，以及魔法书、王冠两个棋盘符号，均按 img2threejs 的
参考准入、严格雕塑规格、无贴图结构门禁和最终贴图多角度门禁完成重建。运行时贴图统一使用 WebP；
参考图、细节裁剪和验收截图只保留在临时工作目录，不进入 Git。

单张参考图没有展示侧后方结构，因此当前实现是面向浏览器实时渲染的低多边形近似重建，不是原图资产的
精确网格提取。

```bash
pnpm --filter castleknight3ddemo dev
```

开发时可用
`?prop=chest|column|bench|barrel|wall|torch|stair|throne|chandelier|battleAxe|spellbook|crown`
查看对应道具的无贴图结构门禁；追加 `&mode=final` 查看最终贴图，追加 `&view=side` 检查侧视体积。
外部 GLB 板凳、木桶、战斧、王座台阶、王座、墙体和立柱始终显示模型自带的 PBR 材质。

定向验收：

```bash
pnpm --filter castleknight3ddemo typecheck
pnpm --filter castleknight3ddemo lint
pnpm --filter castleknight3ddemo test
pnpm --filter castleknight3ddemo build
```
