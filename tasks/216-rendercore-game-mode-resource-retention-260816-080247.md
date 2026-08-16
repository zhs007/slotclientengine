# 216 RenderCore game mode资源保留执行报告

## 结果

已完成Scene Layout manifest v3、Editor latest-only导出和RenderCore跨mode稳定owner改造。合法v1/v2可由runtime直接加载，在RenderCore内生成默认allocation并进入同一v3执行流程；原生v3缺字段或allocation parity不一致会显式失败。

跨mode的authored nodes、Popup和既有package资源继续保持package lifetime；所有声明的Symbols binding在runtime init并发准备reel entry。mode切换只激活/隐藏entry，返回已提交binding时恢复原reel与scene；无reel mode不销毁entry，只有`recreateReel:true`在candidate提交后替换目标entry。transition player仍是directed-edge request owner。

没有修改Crave、game002v2、game003v2、Minecart2或任何production assets。

## Schema与兼容

| 输入 | RenderCore读取结果                         | Editor导出 |
| ---- | ------------------------------------------ | ---------- |
| v1   | strict解析，确定性升级为v3并生成allocation | v3         |
| v2   | strict解析，确定性升级为v3并生成allocation | v3         |
| v3   | strict解析并逐字段验证allocation parity    | v3         |

`SceneLayoutPackageResource.manifest`保留initial-mode v1-compatible视图，避免已有game host读取`adaptation`时需要改动；新增`runtimeManifest`是package runtime唯一执行的canonical v3文档。

v3 `runtimeAllocation`记录：

- package-lifetime node、Symbols binding、Popup owner；
- on-demand directed transition和runtime resource owner；
- 每个mode/variant的active node，以及mode对应的Symbols/award Popup binding。

allocation不保存physical path、hash、bytes或asset closure。Editor项目页新增只读allocation摘要，ZIP/filename rewrite/CLI round-trip保持canonical结构。

## Minecart2只读基线

- 42个authored node：32 image、6 Spine、4 image-string；
- 35 global node，BaseGame 3 scoped、FreeGame 2 scoped、BonusGame 2 scoped；
- 三个mode共用一个Symbols binding；
- BaseGame与BonusGame共用一个award Popup；
- 两个directed transition使用不同MP4；
- assets map有207个route，allocation不扫描或复制该表。

现有image/image-string/VNI/Popup package cache继续复用。没有把不同logical owner按相同URL/bytes合并，也没有共享mutable player。official Spine SkeletonData的跨player共享本次未增加：当前runtime库的immutable安全边界未得到证明，贸然共享会违反独立track/event/slot状态合同。

## 自动化验收

通过：

- RenderCore typecheck；
- RenderCore Scene Layout定向测试：10 files / 85 tests；
- Game Layout Editor定向测试：4 files / 55 tests；
- Game Layout Package CLI定向测试：3 files / 14 tests；
- Game Frameworks scene-layout-template：1 file / 30 tests；
- Game Frameworks typecheck；
- game002v2 TypeScript检查；
- game003v2 typecheck；
- Game Layout Editor Vite build；
- Game Layout Package CLI source build。

未作为本任务失败处理的既有检查问题：

- `gamelayouteditor typecheck`在未修改的`tests/popup-package.test.ts`有3个Popup版本联合类型窄化错误；
- `gamelayoutpkgcli typecheck`在未修改的`tests/reference-rewriter.test.ts`有对应3个Popup版本联合类型窄化错误；
- 两个应用的source build和本任务定向测试均通过。

## 人工验收

按用户要求，浏览器验收由用户执行，当前状态为待验收。建议检查：

1. Editor导入Minecart2旧包，确认allocation摘要为42 node、1 Symbols、1 award Popup、2 transition；导出为v3并重导一致。
2. BaseGame→FreeGame→BaseGame与BaseGame→BonusGame→BaseGame往返，检查背景、scoped/global node、reel、Popup和层级无闪白或重复挂载。
3. 首次init后重复往返，确认stable reel/catalog/node/Popup create/destroy计数不增长，仅transition request player变化。
4. Crave只做旧manifest BaseGame↔FreeGame视觉回归，不需要修改其代码或资源。

## 环境

- UTC报告时间：2026-08-16T08:02:47Z
- HEAD：`759d990d599ccdebad21ffe4b88ca519f7085cae`
- Node：24.x
- package manager：pnpm
