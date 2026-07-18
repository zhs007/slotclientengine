# 任务 104：Symbols Editor 工作区重构执行报告

## 1. 执行信息

- UTC 完成记录时间：`2026-07-18 09:11:24`
- 分支：`main`
- 起始 HEAD / 最终 HEAD：`220472e6b8b36fc0e36544b22c95df66f28de01e`
- 起始提交：`220472e Merge branch 'main' of github.com:zhs007/slotclientengine`
- Node.js：`v24.14.0`
- pnpm：`10.0.0`
- 起始 `git status --short`：clean
- 任务 104 最终状态：包含 `apps/symbolseditor` 工作区重构、用户验收反馈确认后的 rendercore VNI lifecycle 正式能力、Spine atlas 自动绑定与 texture 派生、对应测试和本报告；任务实现未改动任务 103、game002/game003、browserartifactio、production assets/manifest 或生成文件。
- 最终验收期间工作区并行出现用户所有的 `apps/reelsviewer` 整目录删除。该改动不属于任务 104，未恢复、修改或纳入任务文件列表；因此早先根级门禁范围为 27 packages，最新工作区范围为 26 packages。

执行时仓库 HEAD 已晚于计划制定时记录的任务 103 HEAD；本任务没有回退或修改任务 103 的 gamelayouteditor 功能。

## 2. 实际修改文件

- `apps/symbolseditor/src/ui/app-shell.ts`
- `apps/symbolseditor/src/ui/workspace-app.ts`
- `apps/symbolseditor/src/ui/ui-session.ts`
- `apps/symbolseditor/src/ui/resource-picker.ts`
- `apps/symbolseditor/src/styles.css`
- `apps/symbolseditor/tests/app-shell.test.ts`
- `apps/symbolseditor/tests/ui-session.test.ts`
- `apps/symbolseditor/tests/resource-picker.test.ts`
- `apps/symbolseditor/tests/setup.ts`
- `apps/symbolseditor/README.md`
- `packages/rendercore/src/symbol/manifest.ts`
- `packages/rendercore/src/symbol/vni-animation.ts`
- `packages/rendercore/scripts/generate-symbol-state-textures.mjs`
- `packages/rendercore/tests/symbol/manifest.test.ts`
- `packages/rendercore/tests/symbol/vni-animation.test.ts`
- `packages/rendercore/README.md`
- 本报告

## 3. 最终信息架构

项目建立后，左侧一次只渲染一个主工作区：

1. `资源`：上传入口、搜索、类型/引用状态筛选、按上传批次或类型分组、紧凑缩略图行、详情、依赖诊断、引用跳转、替换和删除。
2. `Symbols`：独立滚动的 symbol rail，以及当前单个 symbol 的 `基础 / 状态 / Value / Cascade` Inspector。
3. `项目配置`：package id、cellSize、项目 state definitions、custom state、legacy 只读摘要和导出摘要。

右侧继续固定为全部 included display symbols 的单一 state 预览，保留 Replay、preview value、Fit、`25%..400%` zoom 和 stale preview request token。切换左侧 Tab 不创建第二个 Pixi Application，也不重置手动 zoom。

新建 game config 默认进入资源工作区；导入已有 ZIP 默认进入 Symbols。active workspace、Inspector Tab、selected symbol/state、筛选、展开项、Picker 和 transient feedback 全部由 `SymbolsEditorUiSession` 管理，没有加入 typed project 或 ZIP。

## 4. 状态添加与 Resource Picker

状态 Inspector 同时只展开一个 state。`＋ 添加状态` 菜单只列出当前 symbol 尚未添加的项目 state definition，并显示 lifecycle。成功后：

- 仍通过 `addSymbolState()` 原子 transaction；
- 自动选中新 state；
- 同步右侧 preview state；
- 显示 aria-live 成功提示；
- 聚焦 visual kind；
- 明确提示初始配置是 explicit empty，而非 fallback。

删除、移动继续调用既有 model API；cascade 引用保护失败时保留当前 state，不显示假成功反馈。

图片、layer/keyframe、normal base image、Spine skeleton/atlas、VNI project 和 Value tier skeleton/atlas 均使用结构化 `ResourceBindingContext` 打开原生 dialog Picker。Picker：

- 按目标字段类型筛选；
- 使用解析 metadata 和 atlas page 的 canonical dependency 精确约束；
- 将解析错误或缺直接依赖候选标记为不可确认；
- 搜索、浏览、Escape/取消均不 mutation；
- Enter、双击或确认按钮才执行一次 store transaction；
- Picker 内上传后只刷新候选，不自动绑定；
- stale symbol/state/tier target 会显式失败。

浏览器验收反馈后，Spine texture 不再作为人工 Picker 字段：atlas page 已包含精确图片名，编辑器统一按 atlas 所在目录解析 canonical texture path，同时写入 manifest 所需的显式 texture 闭包。普通 Spine state 和 Value tier 都遵循该规则；项目中恰好只有一个依赖完整的 atlas 时，创建 Spine 配置、启用 Value tier 或首次选择 skeleton 会自动填入 atlas 与派生 texture。多个 atlas 时仍要求选择 atlas，但永远不再要求二次选择 PNG。当前 symbol runtime 的单 page atlas 限制会在 atlas diagnostics 阶段显式显示，多 page 不会被误绑定。

visual kind 切换和新增 layer/keyframe 不再取资源列表第一项，也不写 `select-an-*` 伪路径。

## 5. 数据合同与范围

- `SymbolEditorProject`、symbol-package v1 schema、ZIP IO 和 exact resource closure 未修改。
- 用户验收反馈明确 VNI 与 Spine 都是中性动画资源，`loop/once` 只属于 state playback 编排。为此正式扩展 rendercore symbol manifest/runtime：VNI range playback 的 `loop` 由 state lifecycle 校验，once state 必须为 `false`，stable/loop state 必须为 `true`；normal 与 Spine 一致持续循环展示。
- `VniSymbolAni` 不再硬编码 `once`，而是采用当前 state playback；循环 VNI 通过 `VNIPlayer.getPlaybackState().loopIndex` 在真实 range loop boundary 上报 `loopCompleted`，once VNI 继续在实际 playback/particle drain 完成后只上报一次 `onceCompleted`。
- Symbols Editor 现在对 normal、once 和 stable/loop state 都提供 VNI；导出分别生成 normal/loop=`true`、once=`false`、stable loop=`true`，Cascade loop state 也接受 looping VNI。
- generator preservation、rendercore README 和 editor README 已同步该正式合同。没有修改 `packages/browserartifactio` 或 production assets/manifests。
- 没有增加 filename guess、basename fallback、placeholder、state fallback、localStorage、IndexedDB 或新 UI framework。
- 原有 game002/game003 manifest round-trip、deterministic ZIP 和 strict validation 测试继续通过。

## 6. 生命周期与性能边界

- 图片缩略图 Object URL 由 app 单一 registry 按 `path + bytes fingerprint` 复用；替换、删除、project replace 和 destroy 时撤销。
- app destroy、Picker close 和 preview request 均为幂等/可失效处理。
- 顶层 shell、preview 和 dialog mount point 只初始化一次；左侧只替换 active workspace 内容。
- workspace、asset list、symbol rail、Inspector 的 scroll position 和可恢复焦点在 transaction 后保留。
- Value tier 为单开 accordion；高级 transform 默认折叠。
- 未执行真实浏览器内 100 resources / 30 symbols / 7 states / 4 tiers 性能观察；按用户要求留给最终浏览器验收，不以 happy-dom 冒充。

## 7. 自动化验收

### Symbolseditor 专项

以下全部通过：

- `pnpm --filter symbolseditor format:check`
- `pnpm --filter symbolseditor lint`
- `pnpm --filter symbolseditor typecheck`
- `pnpm --filter symbolseditor test`
- `pnpm --filter symbolseditor build`

测试结果：`6` 个 test files、`30` 个 tests 全部通过。覆盖率：overall statements `61.51%`、branches `49.87%`、functions `67.12%`、lines `63.31%`；UI statements `60.62%`、UI lines `62.69%`。

新增测试覆盖无项目按钮状态、主/Inspector ARIA Tab、键盘切换、session 规范化、active Tab transaction 保持、单 active workspace、状态添加反馈链、Picker 类型/atlas dependency/query、唯一 atlas 默认、atlas page 精确派生 texture、无 texture Picker、Picker 取消零绑定和确认绑定、atomic revision、stale target、custom state 联动、Value/Cascade 按需展开、引用保护错误、destroy 幂等，以及 normal/once/stable-loop 三类 state 的 VNI 选项与 manifest loop 导出。

### Rendercore VNI lifecycle 专项

以下全部通过：

- `pnpm --filter @slotclientengine/rendercore format:check`
- `pnpm --filter @slotclientengine/rendercore lint`
- `pnpm --filter @slotclientengine/rendercore typecheck`
- `pnpm --filter @slotclientengine/rendercore test`
- `pnpm --filter @slotclientengine/rendercore build`

测试结果：`55` 个 test files、`346` 个 tests 全部通过。新增测试覆盖 VNI normal/loop manifest、once/loop lifecycle 冲突显式失败、stable/loop Cascade 能力，以及 runtime 将 `loop: true` 传给 VNIPlayer 并按真实 `loopIndex` 上报边界。

### 根级门禁

VNI lifecycle 修改后、`apps/reelsviewer` 删除出现前，以下通过：

- `pnpm lint`：`27/27` packages
- `pnpm typecheck`：`27/27` packages
- `pnpm test`：`27/27` packages
- `pnpm build`：`27/27` packages
- `git diff --check`

Spine atlas/texture 交互修改后，针对最新工作区再次执行：

- `pnpm lint`：`26/26` packages
- `pnpm typecheck`：`26/26` packages
- `pnpm test`：`26/26` packages
- `pnpm build`：`26/26` packages
- `git diff --check`、`git diff --cached --check`、`git diff HEAD --check`

最新范围减少一项仅因为并行删除的 `apps/reelsviewer/package.json` 已不再被 pnpm/Turbo 识别；任务 104 没有规避或过滤失败包。

首次根级 typecheck 暴露 `apps/Imgnumbereditor` 的 workspace `node_modules` 尚未安装。锁文件已有该 importer，使用 pnpm 10 `--frozen-lockfile` 重建链接后再次执行，最终 `27/27` 通过；没有修改 lockfile。沙箱内访问本机 `127.0.0.1:1087` 代理返回 EPERM，获准在沙箱外通过同一本机代理完成安装。未下载新版本，最终输出为 reused `237`、downloaded `0`。VNI lifecycle 追加修改完成后，使用 Node `v24.14.0` / pnpm `10.0.0` 再次完整执行四项根级门禁，仍全部 `27/27` 通过。

根级 `pnpm format:check` 被任务范围外既有 `apps/reelsviewer` 格式问题阻断，首个失败 package 为 `reelsviewer`，列出 16 个既有文件；未顺手格式化。任务范围 `symbolseditor format:check` 已通过。

构建仅有仓库既有的 Vite 大 chunk warning；没有任务 104 build error。

## 8. README 与 agents.md

README 已更新为新的三工作区、rail/Inspector、Resource Picker、显式确认和 UI session 不入 ZIP 流程；同时补充 VNI/Spine lifecycle 编排一致性。rendercore README 同步 VNI range loop 合同和真实循环边界语义。

无需更新 `agents.md`：VNI/Spine animation resource 及 lifecycle 编排仍归 `packages/rendercore`，编辑器只生成正式 manifest；现有跨 package ownership 已准确覆盖本次能力扩展。

## 9. 浏览器人工验收

按用户明确要求，最终浏览器验收由用户执行。本报告不把自动化测试或 build 冒充浏览器验收。

当前状态：**待用户验收**。

建议至少记录：

- Chromium 版本；
- `1040 / 1280 / 1440 / 1920` viewport；
- game002/game003 fixture；
- 30+ 图片/Spine/VNI 上传后的独立滚动和筛选；
- WL/H1/L1 state 添加、Picker 绑定、取消、焦点恢复；
- CN Value 四 tier 和 group/sequentialCollect Cascade；
- ZIP 导入、导出、重新导入 round-trip；
- 键盘 Tab/Picker 操作；
- 快速切换时 stale preview、Object URL、Pixi/Spine/VNI player 和控制台情况；
- 100 resources / 30 symbols / 7 states / 4 tiers 的交互流畅度。

## 10. 已知限制与未完成项

- 浏览器视觉、真实 Pixi/Spine/VNI 交互和性能矩阵尚未由用户验收，因此任务 104 的最终产品验收仍待用户确认。
- 本任务没有增加虚拟列表；资源和 symbol 列表使用独立滚动与紧凑 DOM，符合当前合同允许的实现。
- 根级 format check 的 `reelsviewer` 既有格式问题属于范围外，未处理。
