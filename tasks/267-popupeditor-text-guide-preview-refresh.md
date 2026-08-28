# 267 popupeditor-text-guide-preview-refresh 任务计划

## 1. 目标与完成定义

### 目标

提升 Popup Editor 字体文字 `minWidth/maxWidth` guide 的可见性，并消除表单逐字符输入触发完整 production preview rebuild
造成的卡顿。宽度 guide 应始终绘制在对应文字之上，使用明显粗于重点区域绿框的高对比边框和斜线强调；用户继续通过现有
`guides` 选项即时隐藏全部参考线。预览继续自动反映合法 authoring 修改，但文字/数字输入只在一次字段编辑完成后提交并重建，
不再每输入一个字符就刷新。

### 完成定义

- [ ] 启用 `widthRange` 的 straight/正负弧排字体文字均显示可区分的最小宽度框与最大宽度框；两框位于文字 display
      上层，不能被 fill、stroke、shadow、Spine slot 或 VNI attachment 中的文字遮住。
- [ ] min/max guide 的最终画布线宽明显大于当前重点区域绿色框，带与 Game Layout Editor 选中图层相同语义的高对比斜线；
      常用横竖分辨率、25%–200% zoom 和有缩放/旋转的文字层下仍可清楚辨认，不能只增大 local stroke 后被父级缩放抵消。
- [ ] 现有 `guides` checkbox 继续作为唯一 session-only 开关：关闭后 viewport、中心、重点区域和全部文字宽度 guide 立即消失，
      再开启时恢复；该状态和 guide 样式不进入 project、manifest 或 ZIP。
- [ ] 普通 text/number/color 字段的一串 `input` 事件不修改 project、不校验半成品为正式 draft，也不 rebuild；blur、Enter 或
      浏览器产生的 `change` 提交后，在短合并窗口内对最后一个合法 snapshot 自动 rebuild 一次。
- [ ] select、checkbox、结构操作等本身已完成的离散编辑仍在 `change`/click 后自动预览；viewport、zoom、guides、preview
      bet/win 和预览金额格式继续走已有 session-only 直接更新，不为它们重建 package/player。
- [ ] 当前 `Play / Replay` 只负责播放或重播已准备好的 production player，不被当成 Build 按钮；不新增或恢复
      `Rebuild Replay`/`Build` 按钮。无效 authoring commit 显示 diagnostics 并保留最后一次成功预览。
- [ ] late rebuild 继续使用 generation gate：快速连续 commit、项目关闭和 destroy 不得提交过期 player、泄漏 resource、
      Object URL、guide 或 timer。
- [ ] RenderCore/Popup Editor 定向自动化、README、真实浏览器视觉与交互验收完成，并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- RenderCore Popup editor-only text width guide 的绘制顺序、min/max 几何、颜色、有效画布线宽、斜线和销毁行为。
- award-celebration、普通 Spine Popup 与 single-state Popup 三种 editor player 的 guide visibility 接线回归。
- Popup Editor 表单事件策略：连续输入与正式字段 commit 分离、合法 commit 自动 preview、短时间 burst 合并和过期 rebuild 取消。
- Popup Editor 已有直接更新型 preview controls 与 `Play / Replay` 语义的回归保护。
- 直接相关单测、README 和人工浏览器验收。

### 不包含

- 不修改 Popup v9 manifest、`widthRange` 的 `0/0 | positive/positive` 合同、字号拟合算法、文字测量口径或 ZIP 版本。
- 不增加多行、换行、裁切、横向拉伸、自动字距、翻译/locale 或新的文字配置字段。
- 不给 production game/Scene Layout runtime 显示 guide，不把 Pixi `Graphics`、guide snapshot 或 mutable display tree 暴露给游戏。
- 不为常规 authoring 字段新增一套局部 production runtime mutation API；本任务先以“字段 commit 后合并一次完整 rebuild”解决
  卡顿。以后若有实测证据表明特定 rebuild 仍是瓶颈，再另立任务设计 typed incremental update。
- 不新增持续 pulse/marching animation、额外 ticker、RAF、shader 或每帧重建 Graphics。用户所说的效果按其 Game Layout Editor
  参照落地为静态斜线强调，避免与本任务性能目标冲突。
- 不删除 `Play / Replay`，不改 Popup 播放、advance、dismiss、amount、audio、attachment 或状态机。
- 不修改 Game Layout Editor 的选中图层实现；只参考其斜线语义，不建立跨 app UI 依赖或复制其布局状态机。
- 不修改游戏 app、production assets、YAML、生成物、根工具链、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-28T08:20:03Z
HEAD: 5037f7ffe830fd55af4223f10f96ff22a02e6e9d
branch: (detached HEAD; HEAD 同时由 main、gitee/main、gitee/HEAD 指向)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
tasks/193-popupeditor-focus-only-v3-input-preview-polish.md
tasks/261-popup-text-width-fitting{,-260828-053657}.md
apps/popupeditor/{README.md,package.json}
apps/popupeditor/src/{ui/app-shell,preview/popup-preview,model/project}.ts
apps/popupeditor/tests/{app-shell,preview}.test.ts
packages/rendercore/{README.md,package.json}
packages/rendercore/src/popup/{styled-text,editor-types,award-player,spine-player,single-state-player}.ts
packages/rendercore/tests/popup/styled-text.test.ts
apps/gamelayouteditor/src/preview/{layout-preview,preview-guides}.ts
```

目标目录没有补充 `AGENTS.md`。当前结论：

- `packages/rendercore/src/popup/styled-text.ts::redrawGuide()` 当前把 max 矩形画成蓝色 `width: 1`，把 min 表示成两条黄色
  `width: 1` 竖线；随后 `container.addChildAt(guide, 0)` 把 guide 放在实际文字后方。重点区域绿框由
  `apps/popupeditor/src/preview/popup-preview.ts::layout()` 以 `width: 2` 绘制，因此现状既更细又可能被文字遮挡。
- text guide 位于字体文字 local container 内，因而已经能跟随 anchor、rotation、Popup focus transform、Spine slot 和 VNI
  attachment；改层级和样式时应保留这条 ownership，不在 app 重新测量文字或猜 attachment 坐标。
- Game Layout Editor 的 `drawSelectedLayerOutline()/drawDiagonalHatch()` 先在可见 bounds 内以固定间隔画斜线，再画红色粗边框；
  它是静态 editor overlay，不依赖动画 ticker，适合作为视觉语义参照，但 helper 目前是 app-private。
- `PopupEditorApp.bindGlobal()` 当前监听 workspace 的每个 `input`，对匹配的 text/number 字段主动派发 `change`。各 inspector
  的 `change` listener 随即 `PopupEditorStore.transact()`；subscribe 后 `schedulePreview()` 取消 pending rebuild，并以
  `120ms` debounce 完整 materialize package、prepare resource/player。连续键入因此会反复 clone、diagnose、cancel 和 prepare。
- `transactField()` 已可在 scalar commit 后保留当前 inspector DOM；`PopupEditorStore` 的 clone/diagnostics/transaction 合同不需
  改写。project id 的 `input` 只做就地 production 同源校验，正式值在 `change` 才提交，这正是其它连续输入应采用的模式。
- preview viewport/zoom/guides 已直接调用 `setViewport()`；bet/win 和 amount format 也直接更新 preview session，不经过
  project rebuild。结构按钮、select/checkbox 和合法 authoring scalar 最终仍需生成同一 production package/player。
- 当前 HEAD 没有 `#preview-build`；右侧按钮是 `#preview-play`，文案为 `Play / Replay`，调用 `PopupPreview.play()` 而非
  `rebuild()`。自动 rebuild 已存在，只是触发频率不合理，因此不能按旧 UI 印象恢复手动 Build 工作流。
- `schedulePreview()` 与 `PopupPreview.rebuild()` 已分别用 timer generation 和 resource/player generation 丢弃过期结果；
  `clear()/destroy()` 已负责 player、resource、audio URL 和 guide 清理。新事件策略必须保留并补足 timer/burst 测试。
- 本规划会话只新增本计划；未修改实现、安装依赖或运行测试/构建。

## 4. 需求解释与技术决策

### 需求解释

1. “马上生效”解释为编辑者完成一个字段编辑后自动生效，而不是每个键盘字符都形成正式 project。text/number 输入以原生
   `change`（blur 或 Enter 后）作为 commit；离散 select、checkbox 和 click 本身即为完成编辑，可立即 commit。
2. “不是所有修改都要完全刷新”先保护仓库中已经存在的直接更新路径：viewport/zoom/guides/bet/win/amount-format 不 rebuild。
   其它 manifest authoring 仍以 production package/player 完整 prepare 保证 strict validation 和资源生命周期，不在本任务临时
   增加不完整的 setter/fallback。
3. min/max 是同一文字 local typographic coordinate 中的两个边界。启用时显示两个完整、颜色不同的嵌套矩形，而不是让 min
   继续只靠两条细竖线表达；斜线强调范围几何，不改变 fitting、bounds 或文字 hit/input 行为。
4. “在字体上面渲染”指 guide 在该 styled-text container 内始终是最高 visual child；它仍跟随文字的 parent/slot/transform，
   `eventMode=none`，不截获 Popup pointer/keyboard input。
5. “比绿框粗”按最终 preview canvas 的视觉线宽验收，不按 authored local 数字自证。实现必须考虑 preview zoom、Popup focus scale
   和 layer scale，确保常用验收矩阵中 min/max 主边框稳定明显粗于绿色 `width: 2` focus guide。

### 关键决策

1. **保留自动 preview，删除逐字符隐式 commit。**
   - 移除 workspace `input → synthetic change` 代理；为需要即时反馈的字段只保留无 project mutation 的本地校验/显示。
   - authoring listener 统一在原生 `change`/click 提交。color picker 拖动时只同步可见控件，picker commit 后才写 project，不能在
     每个颜色采样点 rebuild。
   - 延用一个具名短 debounce 合并同一操作产生的同步/近邻 transactions；每次只 clone 最后合法 snapshot。无错误时自动 rebuild，
     有错误时取消 pending rebuild、显示 diagnostics 并保留现有 player。
2. **不恢复手动 Build。**
   - `Play / Replay` 继续只调用现有 player 的 start/replay；preview 尚未 ready 或最新 commit 非法时沿用显式错误。
   - 如果执行中发现某一 authoring 操作无法在现有 prepare/commit 边界安全自动刷新，先记录 exact 操作与原因并停止扩张；不能
     静默改成部分字段自动、部分字段必须手动 Build 的隐式双模式。
3. **guide 保持 RenderCore owner，Popup Editor 只控制 session visibility。**
   - `styled-text` 生成 min/max guide geometry、颜色、斜线、层级和 cleanup；三类 editor player 继续只通过
     `setTextWidthGuidesVisible()` 遍历 production tree。
   - app 不复制 `widthRange` 测量、anchor/arc/slot transform 或斜线几何；Game Layout helper 不直接跨 app import。如斜线小算法需要
     复用，放在 RenderCore Popup 内部具名 helper，而不是把 app-private helper提升为无关 public API。
4. **静态高对比 guide，不增加逐帧动画。**
   - min/max 主框使用不同稳定颜色和不透明粗描边；区间区域添加较低 alpha 的斜线，边框始终保持清晰。
   - guide geometry 仅在 create、text/presentation 变化、visibility/有效显示尺度变化时重画；不在每帧重建 Graphics。关闭 guides
     后立即 destroy/remove guide，避免隐藏对象继续产生绘制成本。
5. **有效线宽与层级是合同，不是 magic local value。**
   - 把 guide/focus 样式收敛为具名常量或纯 style plan，并在 preview scale 改变时刷新必要的 local stroke/spacing 补偿；禁止复制
     多处颜色/宽度表。
   - commit 新文字 display 时先完成 candidate，再替换 active，最后把 guide 提到最上层；失败保持旧 display 与旧 guide，沿用
     styled-text 现有原子提交/destroy 合同。

## 5. 职责与合同

- **RenderCore Popup styled-text**：拥有文字 local bounds、min/max guide geometry、斜线、canvas-visible stroke policy、display
  order、`eventMode=none` 与 create/setText/setPresentation/destroy 生命周期。
- **RenderCore Popup editor wrapper**：只对 existing production tree 开关/刷新 editor guide；production core/game facade 不得到
  guide 配置、Graphics 或检查快照。
- **Popup Editor app**：拥有 DOM draft interaction、字段 commit policy、debounce/generation、session-only controls 与 diagnostics；
  不复制 Popup renderer 或 materialization validation。
- **数据/API**：Popup manifest、project shape、`widthRange` 和 production player public commands不变。若有效线宽刷新需要扩展 seam，
  只能是 popup editor-only typed method，三类 editor player 同步实现，不能进入 production runtime interface。
- **资源生命周期**：candidate package/resource/player 继续 prepare 后 generation-check 再 commit；stale/failed candidate完整 destroy，
  timer/project close/app destroy 清除 pending work。guide 由 styled-text renderer owner destroy，不由 app 单独释放其 children。
- **失败策略**：非法中间输入留在 DOM，不伪造成 project；正式 commit 后的非法值进入现有 diagnostics并保留最后有效 preview。
  rebuild 失败不得清空当前 canvas或降级为 placeholder/manual silent mode。
- **禁止行为**：不按字符数重算 guide，不用 CSS overlay 猜 Pixi 坐标，不把表单半成品写进第二份 project，不用同步 busy loop、
  新 RAF/ticker、首项 fallback、silent clamp 或异常时自动恢复 Build 按钮。

## 6. 文件范围

### 预计新增

```text
tasks/267-popupeditor-text-guide-preview-refresh-<utctime>.md
```

若 guide geometry/style 抽成纯内部 helper 能显著提高测试可读性，可新增：

```text
packages/rendercore/src/popup/text-width-guide.ts
packages/rendercore/tests/popup/text-width-guide.test.ts
```

不得从 public barrel 导出该 helper。

### 预计修改

```text
packages/rendercore/src/popup/styled-text.ts
packages/rendercore/src/popup/{award-player,spine-player,single-state-player}.ts
packages/rendercore/tests/popup/{styled-text,award-player,spine-player,single-state-player}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/tests/{app-shell,preview}.test.ts
apps/popupeditor/README.md
```

若执行证明三类 player 无需新 refresh seam，则不为凑范围修改对应 player/tests；现有 visibility 回归可集中在 styled-text 与
PopupPreview 测试。

### 原则上不应修改

```text
packages/rendercore/src/popup/{data,core,text-width-fit}.ts
packages/rendercore/src/{scene-layout,image-string,symbol,reel}/**
apps/gamelayouteditor/**
apps/{game002v2,game003v2,gameviewer,gameviewer2}/**
packages/{logiccore,gameframeworks,uiframeworks,vnicore,editorcore,editorresource}/**
assets/**
docs/popup-manifest.md
docs/agent-rules/**
AGENTS.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

若执行必须改变 Popup manifest/public production API、跨 editor shared UI、lockfile或正式资源，先说明现有合同为何不足并重新界定
任务，不能扩大文件范围后修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与事件矩阵**
   - 重核 HEAD/status、current guide child order/style、三类 player visibility seam、表单 selector和所有 `input/change/click` listener。
   - 固定字段类别矩阵：连续 text/number/color、离散 select/checkbox、结构按钮、project-id live validation、session-only preview
     controls；为每类明确 DOM input、project commit、diagnostics和preview rebuild次数。
2. **建立 guide 视觉 plan 与几何测试**
   - 在 RenderCore Popup 内定义 min/max 完整矩形、颜色、主框有效线宽、斜线间距/alpha和可见尺度补偿；复用现有 resolved layout
     height、anchor 与 range，不重新测量文字。
   - 测试 `0/0`/hidden 不创建 guide，enabled range产生两个边界与斜线，guide为 container最高 child且 `eventMode=none`；
     setText/setPresentation 后更新几何/顺序，failure保留旧 guide，destroy无残留。
3. **贯通三类 editor player 与 preview layout**
   - 保留已有 `setTextWidthGuidesVisible()`；若 zoom/focus/layer scale 后需要刷新画布线宽，通过最小 editor-only seam触发，三类 player
     行为一致，production runtime surface不变。
   - `PopupPreview.setViewport()/layout()/rebuild()` 在 commit 后按正确顺序应用 transform、刷新 guide尺度并保持 stage 上层 guide；
     guides关闭、过期 rebuild、clear和destroy全部清理。
4. **收敛 Popup Editor 表单 commit**
   - 删除 global synthetic change；连续字段的 `input` 只改变浏览器控件或执行本地即时校验，原生 `change` 才调用
     `transactField()/store.transact()`。
   - 收敛 color picker双控件同步，避免 picker拖动事件逐点提交；保证 blur/Enter后值、焦点/selection和diagnostics正确。
   - 继续让 select/checkbox/click自动提交；保持 scalar commit不替换 inspector DOM，结构变更才按既有路径重画 workspace。
5. **约束自动 preview 调度**
   - 把 debounce/generation行为提炼为可测试的“最后合法 commit生效”：一次字段编辑最多一个 rebuild，burst只消费最后 snapshot，
     新 commit取消旧 prepare，错误/close/destroy取消 pending timer但不清空最后成功 preview。
   - 明确 session-only controls直接调用 preview，不进入 store/rebuild；`Play / Replay` 测试只断言 `play()`，并继续断言没有
     `#preview-build`。
6. **文档、视觉验收与收尾**
   - 更新 RenderCore/Popup Editor README：guide层级/斜线/开关、字段完成后自动 preview、Play/Replay 与 rebuild 的区别。
   - 按第8节运行 L2 定向验收；真实浏览器覆盖三类 Popup、attachment/rotation/zoom、长输入、颜色选择和快速切字段，记录未完成
     的视觉或性能验收并生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- guide 测试覆盖 straight、正弧、负弧、anchor 0/0.5/1、旋转/缩放 parent、min=max、普通区间、`0/0`、visibility toggle、
  setText/setPresentation、candidate failure和destroy。
- 绘制测试必须能证明两个完整边界、斜线命令、颜色/alpha、最高 child顺序与有效线宽策略；不能只断言 child 数量从1变2。
- app-shell 使用 fake timer或可控 scheduler证明：同一字段10次 `input` 为0次 rebuild，1次 `change` 合并为1次；两个快速合法
  commit只提交最后 snapshot；非法 commit不替换旧 preview；close/destroy后timer不执行。
- 分别覆盖 text/number/color、select/checkbox/button和project-id即时校验，防止删除全局代理后某类控件完全不提交。
- preview 测试继续覆盖 generation race、failed prepare cleanup、guides直接开关、viewport直接 layout和 `Play / Replay` 不 rebuild。
- 性能判断以 rebuild 次数与真实浏览器交互为准；编译通过不能冒充输入流畅性或guide可见性的人工验收。

### 验收级别

`L2`。本任务同时改变 RenderCore popup editor guide 行为和 Popup Editor 直接 consumer 的刷新策略；可能需要最小 editor-only seam，
并涉及异步 candidate resource/player 生命周期。它不改 schema、production public API、根工具链、lockfile或发布物，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/styled-text.test.ts tests/popup/award-player.test.ts tests/popup/spine-player.test.ts tests/popup/single-state-player.test.ts
pnpm --filter popupeditor exec vitest run tests/app-shell.test.ts tests/preview.test.ts
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
pnpm --filter popupeditor build
git diff --check
```

若实际未修改三类 player，则第一条只运行实际受影响的 styled-text/guide 定向测试并在报告说明；失败先缩小到 guide、DOM event、
scheduler或resource generation case，不运行根级全量 lint/test/build。

### 人工验收

1. 在真实浏览器分别打开 award、Spine和single-state项目，给 straight/正负弧排文字设置有效 min/max；验证蓝/黄两个粗框和斜线
   始终覆盖在文字上方，并跟随 root、旋转和至少一个 Spine slot/VNI attachment。对比绿色重点框，主框必须明显更粗。
2. 在 1920×1080、1080×1920、2000×2000 和 custom viewport 下切换 fit、25%、100%、200% zoom；guide不得变成比绿框更细、
   错位或裁成残线。关闭 `guides` 后画面立即干净，再开启恢复且不重建 player。
3. 在文字、字号、位置、min/max和颜色字段连续输入/拖动；编辑过程中无逐字符闪烁或反复重启，blur/Enter/颜色选择完成后自动出现
   最终值。快速Tab编辑多个字段只显示最终合法preview，播放中点击 `Play / Replay` 仍只重播。
4. 用浏览器 Performance/自有诊断观察一次长字段编辑：连续 key input期间 package/player rebuild为0，commit后为1；如仍明显卡顿，
   记录 exact字段、资源类型和耗时阶段，作为后续 typed incremental update任务证据，不在本任务中猜测setter。

### 独立验收建议

`建议`。不涉及 credential、服务器数据、schema、ZIP或release；但涉及跨包 editor seam、异步 player/resource generation和主观视觉
清晰度。独立复验只需执行前两条定向测试，并人工复查 guide上层/粗细及“10次input→1次commit rebuild”。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改 lockfile。斜线使用 Pixi `Graphics`，表单调度使用现有浏览器事件与 timer/generation机制。

## 10. 生成物、文档与规则

- 本任务不改 YAML、manifest schema或生成文件，无生成器/parity checker。
- 更新 `apps/popupeditor/README.md` 与必要的 `packages/rendercore/README.md`，说明 guide视觉和字段完成后自动preview。
- 不更新 `docs/popup-manifest.md`：持久数据与 fitting合同未变。
- 不更新根/领域 `AGENTS.md` 或 `docs/agent-rules/*.md`：owner边界与“合法配置自动 rebuild、guide session-only”稳定规则已存在；
  本任务只是修正具体视觉和事件频率实现。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/267-popupeditor-text-guide-preview-refresh-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/文件、事件分类与guide决策、计划偏差、实际命令结果、人工验收状态、剩余卡顿证据和风险；不收集无关
coverage、完整历史、整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- local guide跟随复杂slot/rotation很好，但stroke也会受多级scale影响；若只把`width: 1`改成`4`，fit zoom或小scale下仍可能不如
  绿框清楚。执行必须以最终canvas线宽矩阵验证并补偿，而不是只检查绘制参数。
- 取消逐字符commit后，依赖实时store值重画candidate选项的隐藏表单可能暴露事件分类遗漏；必须逐类审计selector并覆盖测试，不能
  全局删除listener后只验证一类文字字段。
- 完整player rebuild可能仍受大型Spine/VNI/font prepare耗时影响；本任务降低次数而不改变prepare成本。若单次commit仍卡，需用
  exact profile另立typed incremental update任务，不能用silent partial apply破坏preview与export一致性。
- 浏览器原生color input的`input/change`时机有平台差异；双控件同步必须以最终change为authoritative commit，并在目标浏览器人工验证。

### 假设

- 用户所称右侧 `Rebuild Replay` 对应旧版本或对当前 `Play / Replay` 的理解；当前 HEAD 的既定方向是合法配置自动 rebuild，
  因此本计划保留自动preview并明确play按钮只控制播放。
- 用户提到的“动画效果”以其明确举例的 Game Layout Editor 静态斜线为准；持续运动不是完成目标所必需，且会增加视觉干扰与每帧成本。
- 现有 `guides` 总开关满足“妨碍视线时可关闭”，无需增加第二个 text-guide session选项。

### 待确认

无。执行可从当前代码与用户给出的优先级确定自动preview、字段commit和guide样式方向。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] min/max guide 的上层、粗细、斜线、开关和生命周期符合计划。
- [ ] 表单事件矩阵与自动preview调度符合计划，无逐字符完整rebuild。
- [ ] public API、schema、职责和资源生命周期符合计划。
- [ ] 测试、README和规则已按需同步。
- [ ] 指定自动化验收已通过，自动化与人工验收已明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的两份领域规则和本计划；
2. 核对 Git 基线、工作区及当前 UI 是否仍无 Build 按钮；
3. 先固定 guide与DOM事件/rebuild计数测试，再按计划实现；
4. 小幅适配当前实现时在报告记录，重大 public API/范围扩张时先停止说明；
5. 只运行计划规定的 L2 定向验收，并明确记录真实浏览器验收是否完成；
6. 完成后生成 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
