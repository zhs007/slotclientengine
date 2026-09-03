# 291 symbolseditor-preview-spacing 任务计划

## 1. 目标与完成定义

### 目标

为 Symbols Editor 的全 display-symbol 预览 toolbar 在缩放控件旁增加“偏移（px）”配置。美术资源视觉范围超过
package `cellSize` 时，用户可通过该值增加相邻预览 cell 的横纵间隔，避免图标彼此遮挡；该能力只改变编辑器预览
排布，不改变单个图标缩放、项目数据、Symbols manifest、导出 ZIP 或游戏运行时。

### 完成定义

- [ ] 预览缩放旁显示可访问的非负像素偏移输入，默认值为 `0`；`0` 时排布与当前版本一致。
- [ ] 偏移同时应用于横向和纵向相邻 cell：相邻中心距分别为 `cellWidth + offset`、
      `cellHeight + offset`，cell guide 与 symbol 自身尺寸/transform 不变。
- [ ] 偏移位于 gallery 的 local layout 空间并随现有 gallery zoom 一起缩放；例如偏移 `200px`、缩放 `50%`
      时，屏幕上的新增间隔为 `100px`，不能在缩放后再叠加固定屏幕像素。
- [ ] 修改偏移立即重排当前 preview，保留当前手动 zoom；“适配全部”和容器 resize 使用含偏移的完整网格 bounds
      重新计算 fit zoom，不能因只扩大位置而把最外侧 cell 裁掉。
- [ ] 偏移只属于当前编辑器实例的 UI session，不触发 package resource/player 重建，不进入 project snapshot、
      manifest、assets map 或 ZIP；修改偏移前后的项目导出业务内容一致，新建/打开项目时仍可沿用本次 app session
      的预览设置。
- [ ] 空 gallery、单个 symbol、横竖 viewport、资源预览失败/重试和 app destroy 保持现有安全行为。
- [ ] Symbols Editor 定向测试、README、浏览器人工验收和 UTC 中文执行报告完成。

## 2. 范围

### 包含

- `SymbolEditorPreview` 的 session-only offset 状态、setter、网格步长、cell position、列数选择与 fit bounds 计算。
- Symbols Editor preview toolbar 的偏移 number input、输入校验、即时接线和必要 CSS。
- 纯布局测试与 app-shell DOM 接线测试，覆盖默认值、缩放关系、重排/fit 语义和非法输入。
- Symbols Editor README 对 preview-only 偏移的最小说明。

### 不包含

- 不修改 project `cellSize`、per-symbol `scale`、Spine/VNI/Image/ImgNumber transform 或任何资源 visual bounds。
- 不增加独立 X/Y 间隔、每 symbol 偏移、拖拽排版、碰撞检测、自动测量美术 bounds 或自动推导建议值。
- 不修改 Symbols manifest/package schema、assets map、ZIP import/export、RenderCore symbol player 或游戏 consumer。
- 不把偏移持久化到 localStorage、URL、项目、配置文件或导出物；刷新页面后恢复默认 `0`。
- 不改变现有 zoom 范围、缩放按钮倍率、cell guide/label 内容、state/replay/value preview 或资源 lifecycle。
- 不新增依赖，不修改 lockfile、production assets、YAML、生成物或其它 app/package。

## 3. 制定计划时的基线

```text
UTC: 2026-09-03T04:23:03Z
HEAD: 508242343fc0098d0c24b399f2420091ad87586c
branch: detached HEAD（HEAD 同时由 main、origin/main、origin/HEAD 指向）
git status --short --untracked-files=all: clean
```

已读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/editor-artifacts.md
tasks/278-editorcore-event-dialog-search.md（仅用于核对当前计划格式）
apps/symbolseditor/{README.md,package.json}
apps/symbolseditor/src/preview/symbol-preview.ts
apps/symbolseditor/src/ui/{workspace-app,ui-session}.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{preview-layout,app-shell,ui-session}.test.ts
```

`apps/symbolseditor` 下没有补充 `AGENTS.md`。当前结论：

- `apps/symbolseditor/src/preview/symbol-preview.ts::SymbolEditorPreview` 拥有唯一 Pixi `Application`、gallery、zoom、
  resize/rebuild 和 symbol player lifecycle；`setResource()` 与 `rebuild()` 都直接以 manifest `cellSize` 设置 root position。
- `calculateGalleryLayout()` 用 cell 宽高和 viewport 宽高选择 columns；`applyLayout()` 用
  `columns * cellWidth`/`rows * cellHeight` 计算 fit zoom。现有位置、列数和 fit 都不知道额外间隔，因而超出 cell 的
  visual 会遮挡相邻图标。
- 单个 cell 的 guide 精确画在 `±cellWidth/2`、`±cellHeight/2`，symbol player view 位于 cell center；间隔能力无需
  改 guide 或 player transform，只需改变各 root center 的布局距离。
- zoom 通过 `this.#gallery.scale` 统一作用于 roots、guide 和 symbol；把 offset 加入 gallery local position 后天然满足
  `200 × 50% = 100` 的屏幕间隔语义。
- `apps/symbolseditor/src/ui/workspace-app.ts::shellMarkup()/bindToolbar()` 提供现有 fit、zoom 按钮/slider；zoom state
  保存在 preview 实例而非 `SymbolsEditorUiSession` 或 project。新增 offset 应沿用同一 ownership，并直接调用 preview，
  不走 store transaction/`refreshPreview()`。
- `apps/symbolseditor/src/styles.css` 已预留 `.preview-toolbar input[type="number"]` 的 `78px` 样式，但当前 toolbar
  尚无 number input。
- `apps/symbolseditor/tests/preview-layout.test.ts` 已覆盖列数、zoom clamp 和空 gallery；
  `apps/symbolseditor/tests/app-shell.test.ts` mock 了 preview public commands，适合保护 toolbar 到 preview 的接线。
- 本规划会话只新增本计划；未修改实现、安装依赖或运行测试/构建。

## 4. 需求解释与技术决策

### 需求解释

1. “偏移”解释为每两个相邻预览 cell 之间额外增加的空白，不是把所有图标统一平移，也不是修改 symbol 内部
   transform。一个数值同时用于 X/Y，符合“2 个图标间隔多少 pixel”的单项配置要求。
2. offset 是未缩放的 preview local pixel。网格先按 `cellSize + offset` 排列，再由现有 gallery zoom 整体缩放；
   因而 50% zoom 下可见的额外空白也是配置值的 50%。
3. offset 只描述相邻 cell 间隙：多列总宽为 `columns * cellWidth + (columns - 1) * offset`，多行总高同理；
   不在网格外缘凭空增加一圈 offset。单 cell 因无相邻项，不应因 offset 改变自身 fit bounds。
4. 输入合同为有限非负 pixel，默认 `0`。UI 使用 `type="number" min="0" step="1"` 表达整数像素；非法、空、
   负数或非有限值不提交到 preview，恢复最后一个合法显示值并在既有 errors/feedback 边界显式提示，不静默接受
   `NaN`、负间距或任意 clamp。
5. offset 在 app 实例存活期间保留，和手动 zoom 一样不属于项目。切换/新建/打开项目或资源 rebuild 不重置它；
   页面刷新、app destroy 后不承诺保留。

### 关键决策

1. **在 preview owner 内维护单一 offset 状态。**
   - `SymbolEditorPreview` 增加具名 getter/setter；setter strict 校验后只调用共享 relayout，不重新创建 package resource、
     catalog 或 symbol players。
   - `workspace-app` 只负责读取 number input、调用 setter和恢复/报告错误；不把 offset 放进 `SymbolEditorProject` 或
     `SymbolsEditorUiSession`，避免误入 clone/export 数据流。
2. **抽出单一 gallery layout plan。**
   - 用纯 helper 从 count、viewport、cellSize、offset 计算 columns/rows、center stride、每个 root position 和 exact
     content bounds；`setResource()`、resize/rebuild、offset setter 和 fit 共用结果，避免四条路径公式漂移。
   - columns 选择考虑 `cellWidth + offset` 与 `cellHeight + offset` 的纵横比例；边界 bounds 只包含相邻间隙，
     `count=0/1` 保持确定结果。
3. **把 offset 放在 zoom 之前。**
   - root positions 以 unscaled `cellSize + offset` 计算，继续只在 gallery 上设置 scale；不使用 CSS gap、屏幕坐标补偿
     或给每个 symbol player 重复设置 transform。
   - offset change 保持 `#zoom/#manualZoom`，让用户在 50% 下调整时直接看到线性结果；fit button 显式退出 manual
     zoom 并用新 bounds，resize 延续当前“重新 fit”行为。
4. **保持 production/runtime 合同不变。**
   - preview 创建仍使用同一个 `SymbolPackageResource` 与 rendercore player；不修改 `packageManifest.cellSize` 的候选值，
     不向 `setResource()` 传伪造 manifest，也不新增 RenderCore API。
   - UI 配置变化不调用 store transaction，因此不增加 revision、diagnostics、ZIP closure 或 resource ownership 负担。

## 5. 职责与合同

- **Symbols Editor app shell**：拥有 offset number input 的展示、DOM 事件、可访问名称与非法输入反馈；调用 preview
  typed command，不触碰 project/export。
- **Symbols Editor preview**：拥有 offset session state、gallery layout plan、root 重排、fit zoom 与 Pixi display tree；
  resource/player prepare/commit/destroy 边界保持现状。
- **RenderCore symbol editor wrapper**：继续拥有 package strict prepare、catalog/player、state/value/animation 与 view；
  不感知 gallery offset。
- **数据/API**：只新增 app-private `SymbolEditorPreview` command/pure layout helper；Symbols project type、manifest、ZIP 和
  package public API 不变。offset 为单个整数 `>= 0`，X/Y 共享。
- **资源生命周期**：offset setter 只更新既有 roots 的 position/gallery scale；不 create/destroy resource、player、texture、
  canvas、ticker 或 observer。空/失败 preview 同样可安全保存设置，之后成功刷新使用该值。
- **失败策略**：无效输入不修改最后合法 offset；layout helper 拒绝非有限/负 offset，不默认绝对值、不静默 clamp。
- **禁止行为**：不测量 display bounds、不按资源类型猜间隔、不改变 symbol scale/cellSize、不创建第二个 canvas/ticker、
  不保存预览偏移、不用资源重建冒充 relayout。

## 6. 文件范围

### 预计新增

```text
tasks/291-symbolseditor-preview-spacing-<utctime>.md
```

### 预计修改

```text
apps/symbolseditor/src/preview/symbol-preview.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/preview-layout.test.ts
apps/symbolseditor/tests/app-shell.test.ts
apps/symbolseditor/README.md
```

若纯布局 helper 留在 `symbol-preview.ts` 已足够清晰，不新增文件；只有该文件因此混合 Pixi 与布局断言、导致测试必须
初始化 renderer 时，才可将纯计算机械拆到同目录 `gallery-layout.ts`，不得扩大为 shared/runtime public API。

### 原则上不应修改

```text
apps/symbolseditor/src/{model,io}/**
apps/symbolseditor/src/ui/ui-session.ts
packages/rendercore/**
packages/{editorcore,editorresource,browserartifactio}/**
apps/{gamelayouteditor,popupeditor,imgnumbereditor,gameviewer,gameviewer2}/**
assets/**
docs/agent-rules/**
package.json
pnpm-lock.yaml
```

若执行中发现必须修改 manifest/project schema、RenderCore player 或 consumer 才能实现间隔，说明实现已越过 preview-only
边界，应先停止并报告证据，不能以修改 `cellSize`、symbol scale 或导出配置替代本任务。

## 7. 实施步骤

1. **确认执行基线与布局合同**
   - 重核 HEAD/status、本计划、领域规则、preview ownership 和现有 zoom/resize/resource refresh 路径。
   - 先扩充纯布局测试，固定 offset `0` parity、横纵 center stride、exact content bounds、columns 响应、空/单 cell 和
     非法 offset 行为；用算式断言 50% 下 `200px` offset 的屏幕增量为 `100px`。
2. **统一 offset-aware gallery layout**
   - 在 preview 内建立纯 layout plan，使用 `cellSize + offset` 选择网格纵横比，以 exact content bounds 计算 fit，
     并输出每个 root center；guide/player/label 仍以原 cellSize 绘制。
   - 让初次 `setResource()`、现有 resource rebuild、resize 和 offset setter 共用该 plan；不复制 position/fit 公式。
3. **增加 preview offset command**
   - `SymbolEditorPreview` 以默认 `0` 保存 offset，setter 校验后立即重排现有 roots并保持手动 zoom；getter供 UI 在
     rerender/错误恢复时读取。
   - 覆盖空 gallery、资源为 null、manual zoom、fitAll、resize和 resource replacement，确保 offset不引发 prepare/destroy。
4. **接入 toolbar 与输入反馈**
   - 在 zoom 控件旁加入“偏移（px）”number input及稳定 `data-*` selector，复用 toolbar number 样式并检查横向滚动。
   - 在 `bindToolbar()` 监听完成值变更，合法值调用 offset setter；非法值恢复 preview 当前值并通过既有错误呈现，
     不 dispatch store transaction、不调用 `refreshPreview()`。
   - app-shell mock/DOM 测试断言默认值、合法 `200` 接线、非法值不提交、offset和 zoom 控件可同时操作，并保护
     new/import/resource refresh 不重置 UI 值；同时证明 offset 操作不触发 store/project transaction，导出 snapshot/ZIP
     不出现 offset 字段且业务内容不因该操作变化。
5. **文档、验收与报告**
   - 在 Symbols Editor README 的 preview 段说明 offset 的横纵间隔、zoom 线性关系、session-only 和不影响导出。
   - 运行 L1 定向验收，完成真实浏览器视觉检查，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 纯 helper 测试使用非正方形 cell、横竖 viewport和多种 count，避免只在 `160 × 160` 正方形上碰巧通过。
- 区分 center stride、网格 exact bounds 和最终 screen delta；`200 × 0.5 = 100` 必须由“layout 后统一 zoom”证明，
  不能仅测试 UI label。
- DOM 测试只验证 app shell 接线和 session 边界，不在 mock 中复制 production layout算法；Pixi lifecycle沿用现有测试。
- 继续保护 offset `0` 下当前列数/位置/fit 行为，不为新配置改变既有 manifest scale 或 project revision。

### 验收级别

`L1`：改动仅位于 `symbolseditor` app-private preview/UI、测试和 README，不改变跨 package public API、schema、生成器、
正式交付物、依赖或 lockfile。`rendercore` 只是既有依赖，不需要修改或扩展直接依赖链验收。

### 执行会话必须运行

```bash
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor exec vitest run tests/preview-layout.test.ts tests/app-shell.test.ts
pnpm --filter symbolseditor build
pnpm exec prettier --check apps/symbolseditor/src/preview/symbol-preview.ts apps/symbolseditor/src/ui/workspace-app.ts apps/symbolseditor/src/styles.css apps/symbolseditor/tests/preview-layout.test.ts apps/symbolseditor/tests/app-shell.test.ts apps/symbolseditor/README.md
git diff --check
```

若纯 helper 新增为 `gallery-layout.ts`，将其加入 Prettier 命令；不因此运行根级 typecheck/test/build/format。

### 人工验收

1. 在 Symbols Editor 打开包含多个超出 `cellSize` 视觉范围图标的真实 Symbols project；确认 offset `0` 保持当前
   遮挡基线，输入足够大的正值后横纵相邻图标立即分开，cell guide、label、动画、state和图标自身比例不变。
2. 设置 offset `200`，把 zoom 调为 `50%`，用 guide center/画布测量确认新增可见中心间距为 `100px`；随后调整
   offset 时 zoom 仍为 `50%`，点击“适配全部”后完整网格重新居中且最外侧 cell 不被裁切。
3. 检查单 symbol、空/未配置/错误 cell、横竖窗口 resize、Replay、state切换、项目新建/ZIP打开和 preview失败重试；
   offset 在同一 app session 内保持。修改 offset 前后各导出一次并比较 manifest/assets map/资源闭包，确认业务内容一致；
   ZIP重开后项目内容不含该配置，控制台无异常。
4. 输入空值、负数和非数字，确认不产生重叠方向反转、`NaN` 坐标或资源重建；UI恢复最后合法值并显示明确错误。

### 独立验收建议

`不需要`。本任务不涉及跨包 public contract、credential、安全/服务器数据、resource ownership transaction、schema、ZIP、
生成物或 release；执行者完成定向自动化与真实浏览器视觉验收即可。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 复用现有 TypeScript、Pixi、DOM、CSS、Vitest 与 happy-dom；不新增/升级依赖，不修改 lockfile。

## 10. 生成物、文档与规则

- 本任务无 YAML、manifest、schema或生成 TypeScript 变化，不运行生成器；`dist` 由 app build 验证但不手改、不纳入计划文件。
- 更新 `apps/symbolseditor/README.md` 的预览说明，明确 offset 只控制编辑器 gallery 间隔、先布局后缩放且不导出。
- `docs/agent-rules/editor-artifacts.md` 已规定 Symbols Editor 拥有 browser UI/session 和 standalone preview；本任务不改变
  稳定职责边界，因此不更新领域规则或根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/291-symbolseditor-preview-spacing-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终 offset/zoom/layout 行为与实际修改文件；
2. 关键决策和计划偏差；
3. 实际验收命令及结果；
4. 浏览器视觉验收结果或未完成项；
5. 剩余风险。

除 L3 外，不收集无关 coverage、完整历史矩阵、全仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 过大的 offset 会降低 fit zoom，使图标整体变小；这是“适配全部”容纳完整网格的预期结果，手动 zoom 可用于放大查看。
- offset 按 cell 几何增加空白，不测量实际美术 visual bounds；不同资源溢出量不同时需用户选择足够值，本任务不承诺
  自动消除所有遮挡。
- toolbar 可用宽度有限；必须依靠已有横向滚动并在实际窄窗口确认 number input、zoom slider和按钮均可操作。

### 假设

- 用户要求的是横纵共用的单一相邻 cell 额外间隔，而不是 X/Y 两个独立值或所有 symbol 的绝对坐标平移。
- “设置 200，缩小 50% 看起来为 100”确认 offset 属于 gallery local pixel，并接受 offset随着 fit zoom缩放。
- offset 只改变预览且无需跨页面持久化，因此与现有 zoom 一样保存在 preview实例，不写入 project或浏览器存储。

### 待确认

无。

## 13. 完成清单

- [ ] offset `0` parity、横纵间隔、zoom线性关系和 exact fit bounds 均满足。
- [ ] preview-only/session-only边界满足，project/manifest/ZIP/RenderCore/consumer未改变。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] resource/player lifecycle、preview错误恢复和 destroy保持原合同。
- [ ] 定向测试、typecheck、build、格式和 diff检查通过。
- [ ] README、自动化与人工验收已按计划完成并明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md` 和本计划；
2. 核对 Git 基线与工作区，保留用户已有/无关修改；
3. 按本计划实现，不重新制定另一套方案；
4. 小幅适配当前实现时在报告记录；
5. 涉及 project/schema/RenderCore/consumer 等重大范围扩张时先停止说明；
6. 只运行计划规定的 L1 验收，人工浏览器验收不能由单测或 build 代替；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
