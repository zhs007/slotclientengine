# 222 RenderCore Game Layout 分层重构执行报告

## 结果

- RenderCore 新增 `scene-layout/data`、`scene-layout/core`、`scene-layout/editor` 三个显式 public subpath，删除旧 `./scene-layout` export 与 root Scene Layout wildcard。
- data 承载 versioned manifest、latest normalization、runtime allocation、geometry/reference 与 ZIP limits；core 承载 production resource/runtime/presentation；editor 包装 mapped ZIP、authoring、standalone viewer、configured template 与 runtime inspector。
- Game Layout Editor 的 model/纯 geometry 使用 data，ZIP/preview/inspection 使用 editor + core；Game Viewer/Viewer2 和 scene-layout template 因拥有 standalone/editor flow 使用 editor 包装。
- gameframeworks production facade、game002v2、game003v2 迁到 data/core；gamelayoutpkgcli 的纯 rewrite 使用 data，mapped ZIP closure validation 使用 editor package adapter。
- package runtime 新增无分配 `getStableGameMode()`、`getGameModePhase()`；`getGameModeIds()` 缓存稳定只读数组。game002v2 的 FreeGame 判断不再构造完整 mode snapshot。
- 完整 mode snapshot 接入与 award snapshot 相同的 editor inspector WeakMap bridge，并在 destroy 时删除 reader；Game Layout Editor preview 已迁到 inspector。
- 新增 Scene Layout 稳定帧 benchmark、public boundary tests、领域规则与 Crave 手工迁移文档。外部 Crave 项目代码、配置和资源均未修改。

## 关键文件

- `packages/rendercore/src/scene-layout/{data,core,editor}/index.ts`
- `packages/rendercore/src/scene-layout/package-runtime.ts`
- `packages/rendercore/src/scene-layout/editor.ts`
- `packages/rendercore/tests/scene-layout/public-boundary.test.ts`
- `packages/rendercore/benchmarks/scene-layout-runtime-hot-path.mjs`
- `tasks/222-crave-scene-layout-entrypoint-migration.md`

## 自动验收

通过：

- RenderCore typecheck、build；gameframeworks、gamelayouteditor、gamelayoutpkgcli、gameviewer、gameviewer2、game002v2、game003v2 typecheck。
- manifest/package/public-boundary：3 files，36 tests；mode inspector/scalar query 定向回归：1 test。
- Game Layout Editor：3 files，41 tests；gameframeworks scene-layout template：30 tests。
- Game Viewer：3 files，8 tests；Game Viewer2：2 files，4 tests。
- gamelayoutpkgcli：8 tests；game002v2：4 tests；game003v2：9 tests。
- 旧公开入口、root Scene Layout wildcard、core Application/ticker/RAF 搜索均为零；`git diff --check` 通过。
- benchmark：100000 stable updates，1.647ms，约 60.7M updates/s，GC 后 heap delta -11008 bytes（本机观测值，不作为发布门槛）。

已最小化的非本任务失败：

- RenderCore 全量 `package-runtime.test.ts` 仍有 1 条既有 Popup placement 断言：期望 `(103,46)`，实际 `(0,0)`。本次 diff 未修改 Popup placement、viewport placement 或该 fixture；新增 public boundary、mode scalar/inspector 及相关 package tests 均单独通过。

## 浏览器验收

按用户安排未执行。Game Layout Editor、Game Viewer/Viewer2、game002v2、game003v2，以及 Crave 的视觉、Performance、Memory 与重复 destroy 验收由用户完成；自动化测试不替代该项。

## Crave

仅新增 `tasks/222-crave-scene-layout-entrypoint-migration.md`，包含 import 分类、runtime 标量 query、Vite/Vitest alias、资源 ownership 与浏览器验收步骤。没有读取或修改外部 Crave 工作区。
