# 任务 103：gamelayouteditor 随机轮带 symbol 预览执行报告

## 1. 执行信息

- UTC 完成记录时间：2026-07-18 05:30:01
- branch：`main`
- 起始 HEAD：`36ca1a8fa30a18d74be467db21a8f5786cbd7f0e`
- 最终 HEAD：`36ca1a8fa30a18d74be467db21a8f5786cbd7f0e`（本任务未提交 commit）
- Node.js：`v24.14.0`（Codex bundled runtime）
- 实际执行 pnpm：`11.9.0`；仓库 `packageManager` 仍为 `pnpm@10.0.0`，未修改 package manager 或 lockfile
- 代理使用：未使用 sub-agent；全部实现、审阅和验收由主代理完成

起始 `git status --short`：

```text
?? tasks/103-gamelayouteditor-random-reel-symbol-preview.md
```

报告生成后的最终 `git status --short`：

```text
 M agents.md
 M apps/gamelayouteditor/README.md
 M apps/gamelayouteditor/src/preview/layout-preview.ts
 M apps/gamelayouteditor/src/styles.css
 M apps/gamelayouteditor/src/ui/app-shell.ts
 M apps/gamelayouteditor/tests/app-shell.test.ts
 M apps/gamelayouteditor/tests/layout-preview.test.ts
?? apps/gamelayouteditor/src/preview/random-reel-scene.ts
?? apps/gamelayouteditor/tests/production-reel-preview.test.ts
?? apps/gamelayouteditor/tests/random-reel-scene.test.ts
?? tasks/103-gamelayouteditor-random-reel-symbol-preview.md
?? tasks/103-gamelayouteditor-random-reel-symbol-preview-260718-053001.md
```

所有起始未跟踪内容均保留；未执行 reset、checkout、stash、clean 或范围外格式化。

## 2. 实际修改文件

- `apps/gamelayouteditor/src/preview/random-reel-scene.ts`
  - 新增 Web Crypto uint32 source、unbiased bounded integer、reel set inspection、完整轮带 displayability validation 和冻结 sampled scene。
- `apps/gamelayouteditor/src/preview/layout-preview.ts`
  - 新增 symbols preview session、reel selection、重新随机、grid shape 同步、sampled scene 渲染、manifest priority 与稳定 row-major z-order、request token 和幂等释放。
- `apps/gamelayouteditor/src/ui/app-shell.ts`
  - 增加 reel selector、重新随机按钮、stop/scene 诊断和导入 busy/revision 处理；symbols package 与 cellSize clone 全部准备成功后才提交。
- `apps/gamelayouteditor/src/styles.css`
  - 增加 symbols panel selector 与诊断布局。
- `apps/gamelayouteditor/tests/random-reel-scene.test.ts`
  - 新增纯采样、回绕、拒绝 modulo bias、非法随机源、Web Crypto 缺失、reel mismatch 和不可展示 code 测试。
- `apps/gamelayouteditor/tests/layout-preview.test.ts`
  - 新增 preview selection/randomize/persistence/geometry/value/priority/rows-columns/race/destroy 回归。
- `apps/gamelayouteditor/tests/app-shell.test.ts`
  - 新增 UI metadata、disabled option、selection、randomize、clear 和 replacement failure 原子性回归。
- `apps/gamelayouteditor/tests/production-reel-preview.test.ts`
  - 使用仓库现有公开配置验证 game002 `reels-001` 6 reels 与 game003 `bg-reel01` 5 reels。
- `apps/gamelayouteditor/README.md`
  - 替换旧 code-order 合同，记录 strict ZIP、cellSize、reel selection、random stop/window、Web Crypto 和 scene persistence。
- `agents.md`
  - 将长期规则从 numeric-code row-major 改为公开 reel set 随机 stop/连续窗口合同。
- `tasks/103-gamelayouteditor-random-reel-symbol-preview.md`
  - 用户提供的任务计划，保持未跟踪且内容未修改。
- 本报告。

未修改 logiccore、rendercore、game002/game003 production manifest/config/resource，也未修改 layout ZIP 或 symbol-package schema。

## 3. 最终行为合同

### 3.1 random stop / window

- production 首次需要抽样时创建 Web Crypto `getRandomValues()` source；不可用时明确失败，不影响未使用 symbols preview 的普通 layout editor 初始化。
- `sampleUnbiasedInteger()` 对 uint32 rejection sampling，拒绝会产生明显 modulo bias 的尾部区间；随机 source 只能返回 `0..2^32-1` 安全整数。
- 每列独立抽取 `stopY in [0, reelLength)`。
- 每格严格使用 `reels.get(x, stopY + y)`；尾部回绕交给 logiccore `LogicReels` public API。
- code 通过 `gameConfig.getPaytableEntry(code)` 映射 exact symbol，snapshot 的 stop/code/symbol matrices 均冻结。
- 不使用 `Math.random()`、server scene、server reel、GMI、randomNumbers、otherScene 或网络输入。

### 3.2 reel set selection

- 对 game config 的全部 reel set 显示名称和 reel count。
- 完整遍历每条公开轮带；paytable/symbolCodes 不一致或 symbol 不属于 package display set 时，该 reel set 不可用并返回 name/column/position/code/symbol 定位信息。
- reel count 等于 layout columns 才兼容。
- 唯一兼容项自动选择并抽样；多个兼容项进入 pending-selection，不猜第一项；零兼容项在新导入时失败并保留旧 package/scene，在现有 layout columns 改变时暂停 overlay 并显示完整原因。
- rows 改变后保留 reel selection 并重新抽样新高度；columns 改变重新执行兼容性选择。

### 3.3 Preview 渲染与生命周期

- 旧的 `displaySymbols[index % displaySymbols.length]` code-order 填充已删除。
- 每格由 catalog `createRenderSymbol()` 创建，只请求 normal；value presentation 使用 `defaultValues[0]`。
- position 使用 `SceneLayoutSnapshot.reels.main.viewportRect/stride/cellSize`。
- scale 与 renderPriority 来自 package manifest；同 priority 按稳定 row-major order。
- ticker 持续调用 `RenderSymbol.update()`。
- page size、zoom、guide、variant、placement、focus 和普通 runtime rebuild 复用当前 sampled scene；不会在 `applySize()` 中无条件抽样。
- “重新随机”不重建 resource/catalog，只替换 scene 与 RenderSymbols。
- package prepare 失败、catalog 失败、无兼容 reel、stale request 均保留上一个完整 package/session；过期新 resource 自行 destroy。
- clear/destroy 幂等释放 RenderSymbols、resource、texture/Blob URL owner；清 package 不回滚 cellSize。

## 4. cellSize 原子覆盖结果

- 继续复用 `applySymbolPackageCellSize()` 在 layout clone 上同时覆盖 width/height。
- columns、rows、gapX/gapY、variant placements、art/background/nodes 均保留。
- 继续按 focus offsets 重派生 focus。
- 任一 variant 越出 art/focus 时在 preview/package commit 前失败；旧 EditorProject、metadata、catalog 和 scene 保留。
- layout ZIP 仍不包含 game config、symbol manifest、sampled scene 或 symbol resources。

## 5. 测试与覆盖率

专项最终结果：

```text
Test Files  11 passed (11)
Tests       55 passed (55)
Statements  87.58%
Branches    75.40%
Functions   89.63%
Lines       89.67%
```

关键覆盖：

- 短轮带 stop 0 / length-1、跨尾回绕、不同列长度。
- rejection sampling 和非法 uint32 source。
- Web Crypto 缺失时无 `Math.random()` fallback。
- 多 reel set pending-selection、disabled reason、非法选择拒绝。
- reel code -> paytable symbol，不依赖 display order。
- rows 重抽；resize/zoom/guide/relayout 保留 scene identity。
- runtime geometry、manifest scale/priority、value `defaultValues[0]`。
- randomize 不重建 catalog。
- stale async package destroy；replacement failure 保留旧 owner/metadata。
- game002 `reels-001` 6-column、game003 `bg-reel01` 5-column 真实公开配置集成。

## 6. 自动化门禁

专项门禁全部通过：

```text
pnpm --filter gamelayouteditor format:check  PASS
pnpm --filter gamelayouteditor lint          PASS
pnpm --filter gamelayouteditor typecheck     PASS
pnpm --filter gamelayouteditor test          PASS (55/55)
pnpm --filter gamelayouteditor build         PASS
git diff --check                             PASS
```

根级门禁：

```text
pnpm lint       PASS (26/26 packages)
pnpm typecheck  PASS (26/26 packages)
pnpm build      PASS (26/26 packages)
pnpm test       BLOCKED by existing packages/netcore timeout
```

根 `pnpm test` 中本任务和已输出的其它套件通过，但未修改的 `packages/netcore/tests/main-adv.test.ts` 7 项测试各自超时 10 秒，总计约 70 秒。随后单独运行 `pnpm --filter @slotclientengine/netcore test` 可独立复现相同 7 项超时；为避免无限等待，在失败结果已经完整输出后中止该范围外进程。未修改 netcore。

根 `pnpm format:check` 也被范围外既有格式问题阻断，首个失败 package 为 `apps/gengameconfig`（`src/cli.ts` 等 7 个文件），同时输出了 reelsviewer、victoryani-demo、spine2pixiani-demo 等既有问题。任务 package 的 format check 单独通过，未格式化范围外文件。

Codex bundled pnpm 11 检测到现有 node_modules 的 `enableGlobalVirtualStore` 设置不同；为保护用户依赖目录，所有门禁使用 `verify-deps-before-run=warn`，根 Turbo 使用 loose env 透传。没有执行依赖目录重建。Vite build 只有既有的 chunk-size warning。

## 7. 浏览器人工验收

状态：**待用户执行，未声称通过。**

按用户要求，最后的浏览器验收由用户完成；本报告没有浏览器版本、实际导出的 game002/game003 symbols ZIP、layout ZIP、截图或控制台信息，因此任务计划第 15 节的全部项目仍需人工记录：

- game002 6-column / `reels-001`、CN value loop、resize/variant persistence；
- game003 5-column / `bg-reel01`、rows 重抽、priority；
- mismatch、多兼容、非 display code、坏资源、快速导入、clear、layout export closure 等失败路径。

浏览器验收完成前，任务 103 不能按计划的“完整完成定义”宣称最终验收通过。

## 8. 已知限制与未完成项

- 浏览器人工验收待用户执行，这是唯一任务范围内未完成项。
- 根 test 受范围外 netcore 超时阻断；根 format 受范围外既有格式问题阻断。
- sampled scene 只存在当前内存 preview session，刷新或重新导入会产生新 scene，符合计划。
- 本任务不实现 spin/appear/win/cascade/nearwin，也不随机 valuePresentation value。

`agents.md` 已更新，因为原规则明确要求 numeric-code row-major，与本任务最终合同冲突；不更新会让后续实现再次回退到错误行为。

## 9. 浏览器验收反馈修正（2026-07-18）

用户开始浏览器验收后发现两条 Pixi Assets 警告：Blob 图片仍使用已弃用的 `loadParser`，以及 Assets 管理的 Texture 被直接 `destroy()`。本轮修正如下：

- scene-layout 与 symbol-package 的 extensionless Blob URL 显式 loader 改用 Pixi 当前 `parser: "loadTextures"` 参数。
- vnicore 的共享 VNI Blob texture loader 同步改用 `parser`，避免预览 VNI symbol 时再次出现相同弃用警告。
- scene-layout runtime 对默认 Assets loader 记录唯一已加载 URL，在初始化回滚和 runtime destroy 时统一调用 `Assets.unload(url)`；不再直接销毁 Assets 管理的 Texture。
- 自定义 texture loader 仍默认由调用方持有；如需 runtime 配对释放，可显式提供 `unloadTexture`。尺寸不匹配和重复 destroy 均有回归覆盖。

修正后自动门禁：

```text
@slotclientengine/rendercore format/lint/typecheck/build  PASS
@slotclientengine/rendercore test                         PASS (318/318)
@slotclientengine/vnicore format/lint/typecheck/build     PASS
@slotclientengine/vnicore test                            PASS (206/206)
gamelayouteditor format/lint/typecheck/build              PASS
gamelayouteditor test                                     PASS (55/55)
git diff --check                                          PASS
```

浏览器验收状态仍为待用户复验；本修正不替代浏览器控制台的最终确认。
