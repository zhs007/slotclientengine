# 127 game002-crave-skin-runtime-parity 执行报告

## 结果

任务 127 的实现与 L2 自动化验收已完成。`game002` 现在严格支持 `skin=1|2`：

- `skin=1` 保持 `assets/game002-s3` 现有路径；
- `skin=2` 从 `assets/crave/layout.manifest.json`、`assets.map.json` 和 119 个唯一
  内容寻址 payload 准备完整 scene-layout package；
- 两个 skin 共用原有 `Game002RoundTarget`、component/cascade/WL/CN/期待/summary/
  amount/cleanup policy，不经过 Game Viewer 简化 round；
- Crave CN 使用包内 ImgNumber、`slot: "coin"` 和 `0..9` glyph；
- Nearwin1/2 继续作为两个 skin 显式共用的 game002 presentation extension。

Crave 输入未被改写。收尾时 SHA-256 仍为：

```text
layout.manifest.json  fdc639cf37f09d22e38c050f4d75ea4b135008d08600d090ada16639ee3059c1
assets.map.json       c99a9299575bb44927d3229cefc532efdbfacb2e99310d711bfacb65c38ea810
```

## 实现摘要

- 新增通用 mapped-folder Vite generator，严格校验 map v1、路径、size、SHA-256、
  exact physical closure 和 orphan，并生成 121 个逻辑资源的静态 import。
- loading 在选择 active skin 后只下载该 skin；skin2 在 99% 使用已加载 bytes
  prepare package，不重复 fetch。prepare 失败和 destroy 都回收 package owner。
- rendercore 公共层新增：
  - 从 symbol package 构造 reel registry 的中性 helper；
  - 不创建第二套 reel 的 scene-layout background/popup presentation surface。
- game002 新增 scene-layout skin 薄适配：背景、manifest placement popup 与 Crave
  symbol registry 接入既有 adapter；geometry/focus/reelSet/mode/popup 均从 package
  派生。
- release checker 逐一验证 Crave source bytes 在生产 dist 中存在，并断言开发视觉
  fixture 不进入生产构建。
- 新增双 skin 真实 renderer 开发 fixture、Crave package/strict failure/ImgNumber/
  surface 生命周期测试，并同步 README、动画说明和三份领域规则。

主要新增文件：

```text
apps/game002/src/generated/crave-layout-resources.generated.ts
apps/game002/src/scene-layout-skin.ts
apps/game002/src/visual-fixture.ts
apps/game002/tests/crave-skin.test.ts
apps/game002/tests/scene-layout-skin.test.ts
apps/game002/visual-fixture.html
packages/rendercore/scripts/generate-scene-layout-vite-resources.mjs
packages/rendercore/src/scene-layout/presentation-surface.ts
packages/rendercore/tests/scene-layout/presentation-surface.test.ts
```

## 关键决策与计划偏差

- 没有新建完整的第二套 shared round adapter。现有
  `RenderGridCellReelSet`、cascade players 和 `createSlotRoundCoordinator`
  已承载通用 mechanics；本次只补缺失的 package registry 与无重复 reel 的
  presentation surface，game002 继续用同一个业务 target。这样没有把 WL、CN 或
  `bg-*` 下沉到 rendercore。
- Nearwin1/2 没有迁移到新的 assets 目录；它们继续由现有 reel manifest 作为明确
  game-owned extension，避免复制 timing 表或改写用户提供的 Crave package。
- 未修改 Game Viewer/gameframeworks 源码；其测试、typecheck 和 build 已证明新增
  rendercore public seam 对直接 consumer 兼容。
- 增加了仅 dev 使用的 `visual-fixture.html`。生产 checker 明确禁止它进入 dist。

## 自动化验收

以下计划命令最终均返回 0：

```text
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks \
  --filter gameviewer --filter game002 typecheck

pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks \
  --filter gameviewer --filter game002 test
  rendercore:      73 files / 550 tests
  gameframeworks: 12 files / 81 tests
  gameviewer:      7 files / 29 tests
  game002:         22 files / 108 tests

pnpm --filter game002 check:crave-layout-resources
  121 scene-layout logical resources checked

pnpm --filter game002 release:check
  build 与 game002 static dist check passed

pnpm --filter gameviewer build
  passed

git diff --check
  passed
```

测试补充后，rendercore branch coverage 为 `80.07%`，game002 为 `80.03%`，
均达到仓库门槛。

## 浏览器人工验收

使用真实 Vite/Pixi/Spine renderer、正式 skin prepare 和公开本地轮带完成：

- skin2 portrait `1125x2000`：Crave background、6x9 board、symbol 与 CN
  1/2/5/10/25/50/100/250/500/1000 正常，console 无错误；
- skin2 wide `2000x1200`：focus/background/board 正常，console 无错误；
- skin1 portrait `1125x2000`：原 skin 仍可正常装配。

`2000x1125` 不是合法的 game002 fixture design frame，因为其高度小于
`1200` focus；framework 不会产生该 frame，改用合法 `2000x1200` 验收。

## 未完成的外部验收与剩余风险

- 本轮没有可用 live credential，因此没有宣称真实 connect/spin/collect/destroy
  smoke 通过。
- 随机 live round 未触发全部期待/cascade/CN collect/popup 场景。业务阶段由同一
  game002 target 和现有 fixture 测试保护，Crave popup package/placement/lifecycle
  有自动化覆盖，但仍需带 credential 的独立视觉验收确认完整美术时序。
- 计划建议的独立验收仍应由另一执行者复验 public contract、resource ownership
  和真实 live 生命周期；这不影响本次代码与自动化交付完成状态。

未新增依赖，未修改 lockfile，未提交或暂存工作区。
