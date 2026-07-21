# 任务 112：Game Layout Editor 主状态工作区执行报告

## 结论

任务 112 的实现与自动化验收已完成。真实浏览器人工验收按用户要求未由 Codex 执行，状态为“待用户验收”，不能记为已通过。

## 执行基线

- 分支：`main`
- 起始提交：`bc5693e`
- Node.js：`v24.14.0`
- pnpm：`10.0.0`
- 初始工作区只有未跟踪的任务计划 `tasks/112-gamelayouteditor-state-workspaces.md`；未覆盖或删除用户已有修改。
- 基线 RenderCore：66 files / 454 tests 通过。
- 基线 Game Layout Editor：17 files / 118 tests 通过。
- 两个作用域的基线 typecheck 均通过。

## 已完成实现

### RenderCore scene-layout

- scene-layout v1 新增 canonical plural `symbolPackages` 与 mode `symbolPackage` 引用；legacy singular `symbolPackage` 保持 production 可读，singular/plural 同写明确失败。
- strict parser 校验 per-mode active-variant background 完整覆盖、bootstrap/initial 一致、background-only node、stateful node target、直接有向 transition、symbols/popup orphan 与 nested id/path。
- package closure、URL loader、resource owner 与 rollback 支持多个 symbols dependency；canonical resource 公开只读 `symbolPackages`。
- package runtime 按 stable mode 管理背景 `visible/renderable`、symbols binding、reel 与 popup；不同背景只在 transition 完成提交边界原子显隐。
- mode 切换先准备并校验目标 catalog/reel/scene/local phase/value，再启动 shared node transition；失败保持 source mode/background/reel 不变。
- 相同 Symbols binding 默认保留同一 reel、scene 与 player，不重新随机、不 replay、不 destroy/recreate。
- 按用户追加的性能合同新增 `requestGameMode(..., { recreateReel: true, reels: { main } })`：只有显式开启才强制准备并替换相同 binding 的 reel，旧 reel 在提交后销毁。
- snapshot 增加 stable/target symbols package 与 active background node ids；stable mode 无 symbols 时 reel 明确移除。

### Game Layout Editor model / IO

- editor project 从 singular symbols dependency 改为 `Map` library；mode 显式拥有 background、symbols 与 BigWin popup binding。
- 新项目建立显式 BaseGame、per-active-variant 空背景、空 symbols/popup binding。
- background bind/clear 只作用当前 mode + variant；共享 node 在需要时 fork，rename/reference graph 同步更新。
- symbols import/replace/delete/bind 使用 typed command；同 id 普通导入失败，替换保持引用，删除受引用保护；绑定校验 cell size、reel count 与 display strip。
- 导出只从 mode 引用集合派生 plural symbols 与 popup dependencies；未引用 library item 不进入 production ZIP；无 `includeInExport` 双重开关。
- legacy no-gameModes / old modes / singular symbols 导入迁移为 canonical draft，再导出只写 mode background + plural symbols。
- preview 从每个 validated package 的公开本地轮带生成目标 scene；相同 binding 切 mode 保留 scene，不同 binding 在 mutation 前准备目标输入。

### UI / session

- 左侧固定为五个 Tab：资源、布局、Symbols、BigWin、项目；旧 Symbols/Popup drawer 已删除。
- 新增 outer 主状态栏、状态管理 dialog、独立 preview 状态 selector、“跟随编辑状态”和 production mode request。
- Layout Inspector 按当前 mode 显示/编辑背景；Symbols 与 BigWin 拆成独立 workspace module；Project 显示逐 mode background/symbol/popup readiness 与未引用 dependency。
- 分辨率改为单 select + 宽高；四个预设、自定义输入与 resize handle 双向同步；旧 preset buttons 已删除。
- 顶部只保留一个“新建项目”入口，以原生 dialog 显式选择单背景或横竖双背景；旧双按钮已删除。
- `expandedInspectorSections` 使用稳定语义 key；main reel advanced、background focus details 在 store 重绘后保留 open，沿用 scroll/focus 恢复。
- 清除了 `symbolsDrawerOpen`、旧 drawer CSS、旧 product node-state controls 和 dead handlers。

### 文档与长期规则

- 更新 `apps/gamelayouteditor/README.md`。
- 更新 `docs/scene-layout-manifest.md`。
- 更新 public runtime JSDoc。
- 更新 `agents.md`，删除旧 singular/global symbols 与“导入后覆盖 grid、不 vendor symbols”的过时约束，记录 mode-aware background/symbol/popup ownership、reel 默认复用和显式强制重建合同。

## 自动化验收结果

### Scoped

- `pnpm --filter @slotclientengine/rendercore test`：通过，66 files / 457 tests。
- `pnpm --filter gamelayouteditor test`：通过，17 files / 121 tests。
- `pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- `pnpm --filter gamelayouteditor typecheck`：通过。
- `pnpm --filter @slotclientengine/rendercore lint`：通过。
- `pnpm --filter gamelayouteditor lint`：通过。
- `pnpm --filter @slotclientengine/rendercore build`：通过。
- `pnpm --filter gamelayouteditor build`：通过；Vite 仅报告既有大 chunk warning。
- `pnpm --filter @slotclientengine/rendercore format:check`：通过。
- `pnpm --filter gamelayouteditor format:check`：通过。

新增 direct tests 覆盖 canonical plural parse、mode background 原子提交、目标 scene 预校验、不同 binding reel swap/旧 reel destroy、相同 binding reel identity 保持、`recreateReel` 强制替换、无 symbols mode 移除 reel，以及 UI 五 Tab/旧入口消失/details/分辨率/new-project dialog 回归。

### Root

- `pnpm typecheck`：通过，27/27 tasks。
- `pnpm lint`：通过，27/27 tasks。
- `pnpm build`：通过，27/27 tasks；Vite 仅报告既有大 chunk warning。
- `pnpm format:check`：通过，27/27 tasks。
- `pnpm test`：通过，27/27 tasks。
- `git diff --check`：通过。

## 浏览器人工验收（待用户执行）

Codex 未启动 dev server、未操作浏览器、未生成截图，原因是用户明确要求最后浏览器验收由用户完成。建议按以下顺序验收，并把实际素材路径、package id、浏览器、dev URL、结果和截图补到本节：

1. 运行 `pnpm --filter gamelayouteditor dev -- --host 0.0.0.0`，打开终端给出的 URL。
2. 用“新建项目”创建单背景项目，添加 BG/FG 两个主状态。
3. 导入包含 BG、FG、BG_FG、FG_BG 的 official Spine 4.3 背景；同 node 配置双向有向 transition，确认 once 完整结束后才进入目标 loop。
4. BG/FG 绑定同一 Symbols dependency，确认双向切换保持 reel、scene 与播放实例；普通 UI 不触发 `recreateReel`。
5. 再导入第二个 strict symbols package，给另一状态绑定，确认切换提交边界才替换资源/reelSet。
6. 导入 strict `award-celebration` popup，分别绑定状态，验证 play、Advance、立即清理与 per-variant placement。
7. 展开 main reel advanced，连续修改 cell、gap、placement，确认 details、scroll 与 focus 不丢失。
8. 切换四个分辨率预设、手工自定义宽高并拖 resize handle，确认 select 正确回写。
9. 导出、刷新、重新导入 ZIP，复验主状态、Symbols、BigWin 与 deterministic binding；再建 orientation-focus 项目复验横竖 variant。

浏览器验收状态：**待用户执行**。

## 2026-07-21 浏览器反馈修复

用户人工浏览器验收发现：绑定 Symbols 后状态切换报“当前 layout preview 没有 package runtime”、
同一 Spine 背景被拆成两个 node、缺少易用的有向 transition 配置，以及资源导入逐项询问 logical id。

- 根因是首个 mode Symbols binding 未给 `reels.main.order` 建立确定值，strict preview manifest 失败后退回了不含 `gameModes` 的 layout-only preview。现在首次绑定时把 reel 排在现有 node 之后，完整 preview manifest 继续携带 package runtime。
- 同一 variant 的多个 mode 选择同一 Spine logical resource 时复用一个背景 node，并把各 mode 选择的稳定 animation 自动映射为 state-machine state；不同 resource 仍创建独立 node。既有重复背景在再次选择共享 resource 时会收敛并移除无引用旧 node。
- 背景 Inspector 的 transition 新增 `from / to / animation` 显式下拉配置，不再用三次 prompt；production mode request 继续由 RenderCore 执行 once transition，完成后进入目标 loop。
- image / Spine 导入按文件名规则直接生成 logical id，冲突稳定追加 `-2`、`-3`，不再逐资源弹出命名 prompt；批次总审查确认仍保留。
- preview 未形成 package runtime 时禁用状态切换控件，并给出配置未就绪诊断，不再暴露误导性的可点击按钮。

新增回归覆盖同一 Spine 单 node 的 BG/FG 稳定状态、BG_FG/FG_BG 双向 transition、Symbols 绑定后 canonical preview 仍保留两个 gameModes 与 reel order、默认命名冲突后缀及零命名 prompt。

反馈修复后的自动化验收：

- Game Layout Editor：17 files / 123 tests 通过；typecheck、lint、format:check、build 均通过。
- RenderCore 定向 package-runtime/mode transition：2 files / 13 tests 通过。
- 根级 typecheck、lint、format:check、build、test：27/27 tasks 全部通过。
- `git diff --check` 通过；Vite 只有既有的大 chunk warning。
- 未执行浏览器操作，最终浏览器验收仍由用户完成。

## 2026-07-21 ZIP Spine page 可读性与 FG 素材核查

针对用户提供的 `new-layout-layout (3).zip`，逐项核对 `layout.manifest.json`、导出 atlas、
skeleton JSON、8 个 texture payload 与 `assets/game002-s3/BG*` 原文件：

- ZIP 中 8 个 atlas page 全部存在；将 hash page key 还原为 `BG.png` 至 `BG_8.png` 后，导出 atlas 与原 `BG.atlas` 逐字一致。
- 导出 skeleton 与原 `BG.json` JSON 语义完全一致；texture payload 的 SHA-256 全部与源文件匹配，没有漏页或错绑证据。
- 源文件 `BG.png` 与 `BG_2.png` 本身逐字节相同，分别承载 atlas region `BG/bg_14` 与 `FG/fg_16`；其它 FG region 分布在 `BG_3.png`、`BG_4.png`、`BG_5.png`。此外这些 `.png` 文件的真实媒体类型是 WebP，因此 content-addressed payload 使用 `.webp` 扩展是正确的。
- 可读性问题成立：旧实现把 atlas 逻辑 page key 也改成 hash。现改为保留导入时原始 page 文件名，manifest `textures` 显式映射 `BG_2.png -> assets/<sha256>.webp`；只有 owned payload path 保持完整 SHA-256。相同 bytes 的多个 page 继续共享一个 payload，不影响去重和性能。
- 修改后 Game Layout Editor 17 files / 123 tests、typecheck、lint、build 全部通过；根级 test、build、format:check 27/27 tasks 通过，`git diff --check` 通过。浏览器验收仍由用户执行。
