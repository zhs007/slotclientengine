# 266 gamelayouteditor-preview-rebuild-optimization 任务计划

## 1. 目标与完成定义

### 目标

消除 Game Layout Editor 在可原位应用的编辑和预览尺寸调整中对主预览区的全量重建。重点修复转场工作区修改前置
Popup `x/y/scale` 时销毁并重建 Scene Layout package runtime、导致画面闪烁、Symbols 重新抽样和明显卡顿的问题；预览页宽高、
拖拽缩放和 zoom 继续即时反馈，但不得重载资源或重建轮带。真正改变资源、拓扑或 binding 的结构性事务仍在用户完成一次输入后
自动重建，不引入需要用户维护预览一致性的手动刷新流程。

### 完成定义

- [ ] 在转场工作区或 Popup 工作区提交任一 active variant 的 Popup root `x/y/scale` 后，主预览通过
      `applyGeometryManifest()` 原位更新；不调用 `setLayout()`，不销毁 package runtime、Popup player、reel/player 或已加载资源。
- [ ] Popup placement 更新后再次播放该转场前置 Popup、mode award Popup或programmatic Popup时使用新值；三类 Popup 继续共享
      production package runtime 的 viewport-center placement 语义。
- [ ] Popup placement、node/reel/transition placement、focus、art size和coordinate origin等已支持的geometry-only修改保持当前
      mode、prepared direct transition、Symbols scene和动画连续性，不重新抽样轮带；非法或 active transition/prelude 期间不允许的
      更新继续显式失败，不以全量重建掩盖错误。
- [ ] 预览分辨率下拉、宽高输入和右下角拖拽只调用现有 page-size/viewport 路径；拖拽的高频 pointer move 按浏览器 animation
      frame 合并，不为每个事件执行 renderer resize，更不调用 `setLayout()`。跨横竖屏时仍按 raw page width/height 选择正确 variant。
- [ ] zoom in/out/reset 继续只改变 preview display/CSS size，不修改 manifest、不应用 runtime geometry、不重建预览；guide 开关也不
      重建资源或轮带。
- [ ] 数字输入的 `input` 阶段只保留 UI draft；blur、Enter、spinner commit 对应的 `change` 才提交一次项目事务。资源替换、节点/Popup/
      Symbols binding、transition kind/resource等真实结构变化仍在显式提交后自动执行一次 full prepare/commit。
- [ ] 不新增“刷新预览”按钮；自动预览能在不牺牲 strict validation、失败可见性和结构变化正确性的前提下保持同步。
- [ ] RenderCore shared geometry contract、Gamelayout Editor定向测试、typecheck/build和浏览器人工验收通过，并生成UTC中文执行报告。

## 2. 范围

### 包含

- RenderCore `assertSceneLayoutGeometryCompatible()` 对 Popup binding immutable structure 与 mutable `placements` 的正确拆分。
- Scene Layout package runtime 在 geometry commit 后对 award-celebration、Spine、single-state Popup root 重新应用当前 variant
  `x/y/scale`，同时复用既有 player、reel、scene、mode和已准备转场。
- Gamelayout Editor `EditorStore` 的 geometry/structural 分类，以及订阅者选择 `refreshPreviewGeometry()` 或 `refreshPreview()` 的路径。
- 转场和 Popup placement 数字字段的提交时机与 regression test；不在每个 keystroke 重建项目或预览。
- 预览 preset/custom page size、拖拽 resize、zoom和guide controls 的轻量路径与高频事件合并。
- RenderCore/Gamelayout Editor README、最小 Scene Layout 领域规则和直接保护上述合同的测试。

### 不包含

- 不改变 Scene Layout v1-v5、Popup v1-v9、Symbols package、transition或editor project schema，不新增 manifest 字段或版本。
- 不把 Popup `order`、node/reel `order`、资源、package manifest、mode/variant topology、binding或transition kind/resource误归类为
  geometry；这些字段在 runtime 未提供完整原位事务前继续走结构重建。
- 不改变 Popup 内部 layer/tier/animation/string、Symbols 内部状态机、随机轮带算法、公开 reel set或production game runtime业务。
- 不以 debounce 丢弃已提交项目事务，不在错误时保留一份未标记的 stale draft，也不加入静默 fallback、默认 placement或首项资源猜测。
- 不恢复真实服务器轮带、不写入 sampled scene、不修改 ZIP/export closure、assets map、YAML、生成器或生产美术。
- 不引入手动刷新模式、自动刷新开关、worker、缓存库、新依赖或 lockfile 变化；不做与本问题无关的 UI 框架重构。
- 不运行整仓发布验收，不 commit、不 push、不创建 PR。

## 3. 制定计划时的基线

```text
UTC: 2026-08-28T08:08:21Z
HEAD: 5037f7ffe830fd55af4223f10f96ff22a02e6e9d
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{scene-layout,editor-artifacts}.md
tasks/264-popup-landscape-horizontal-centering.md（仅参考当前计划格式）
apps/gamelayouteditor/{package.json,README.md}
apps/gamelayouteditor/src/model/{editor-project,editor-store}.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/{app-shell,layout-workspace,transitions-workspace}.ts
apps/gamelayouteditor/tests/{app-shell,editor-store,layout-preview,transitions-workspace}.test.ts
packages/rendercore/{README.md,src/scene-layout/{manifest,package-runtime,runtime}.ts}
packages/rendercore/tests/scene-layout/{manifest,package-runtime,runtime}.test.ts
```

目标目录没有补充 `AGENTS.md`。当前结论：

- `AppShell.init()` 的 store subscriber 只在 `snapshot.changeKind === "geometry"` 且前一 revision 已成为 ready preview 时调用
  `refreshPreviewGeometry()`；其它 revision 都调用 `refreshPreview()`。
- `EditorStore.classifyProjectChange()` 在 assets bytes相同后复用 RenderCore `assertSceneLayoutGeometryCompatible()`；因此 app没有第二份
  geometry字段表，这是应保留的正确职责边界。
- `sceneLayoutStructure()` 已从 node/reel placement和Spine transition overlay placement中移除mutable geometry，但把
  `manifest.popups` 整体放入immutable structure。只改 Popup `placements.default.scale` 因此被误判为 structural。
- `AppShell.refreshPreview()` 调用 `LayoutPreview.setLayout()`；后者重新验证资源、为每个 Symbols binding调用
  `sampleRandomReelScene()`、创建新runtime，成功后由 `clearRuntime()` 销毁旧runtime/package。该链路直接解释闪烁、图标变化和卡顿。
- `SceneLayoutPackageRuntime.applyGeometryManifest()` 已先 strict parse/immutable check，再替换document/manifest并重新应用当前viewport；
  `applySnapshot()` 对 award、Spine、single-state 三类 Popup 都从当前 manifest读取variant placement。因此shared runtime已有原位更新
  Popup transform的实现基础，缺口主要是immutable projection和直接回归测试。
- 普通 node placement的原位更新已有 `layout-preview.test.ts` 保护，且现有测试证明 page resize、guide和geometry修改不会改变
  standalone Symbols preview scene；目前没有覆盖combined package runtime的Popup placement identity/scene连续性。
- `AppShell.setPreviewSize()` 先调用 `LayoutPreview.setPageSize()`，后者已经同步 frame viewport、renderer、runtime viewport、CSS和guide；
  随后又无条件调用 `refreshPreview()`。右下角resize handle在每次`pointermove`调用该方法，形成大量重叠全量重建。
- `LayoutPreview.setZoom()` 当前只调用 `applyDisplaySize()`，zoom按钮本身没有重建。宽高输入使用`change`；Popup工作区在`input`仅保存
  session draft、`change`才提交；转场 placement也只在`change`提交。任务应固定这些边界，而不是增加任意时间延迟。
- full preview已有revision/request token避免旧结果最终覆盖新结果，但被supersede的请求仍可能完成一部分解析、抽样和prepare；本任务从
  源头移除geometry/resize触发即可，不能把token当性能修复。

未审计完整 Git 历史；当前代码、测试和领域合同已足以确定根因与实现边界。

## 4. 需求解释与技术决策

### 需求解释

1. “没有必要的时候不要完全重建”转换为：只有immutable structure变化才调用`setLayout()`；可由production runtime原位提交的
   manifest geometry和纯preview viewport/display状态都复用现有实例。
2. “编辑过程不要实时重建，好歹等全部输入完成”转换为：文本/数字`input`只更新session draft，合法`change`才原子提交project；不把
   未完成的空串、负号或小数中间态送入strict manifest parser。
3. “缩放”同时覆盖三个已确认入口：Popup/transition/node `scale`是manifest geometry，preview page resize是runtime viewport，toolbar
   zoom是CSS display-only；三者不得共享full rebuild实现。
4. 结构性选择仍应自动更新预览。用户把手动刷新作为不好优化时的可接受退路，不是必须功能；当前shared runtime已有正确能力，因此
   不把一致性责任转移给用户。

### 关键决策

1. **以唯一shared immutable checker扩展Popup placement geometry。**
   - `sceneLayoutStructure()`对每个Popup保留package manifest、order和其它binding identity，只排除`placements`；新增/删除Popup、改
     manifest或order仍structural。
   - EditorStore继续调用shared checker，不在app维护字段白名单或按path字符串猜geometry。
2. **复用package runtime现有geometry commit，不建立editor专用Popup transform。**
   - next manifest完整strict parse和compatibility通过后，runtime在当前snapshot上对三类Popup应用新placement；Layout Editor只调用
     public `applyGeometryManifest()`。
   - active transition/prelude期间的禁止更新保持fail-fast；不通过destroy/recreate偷偷取消production状态机。
3. **page resize与manifest refresh彻底分层。**
   - preset/custom/drag只调用`setPageSize()`；其内部统一解析frame viewport、resize renderer、apply runtime viewport和更新CSS/guide。
   - pointer move使用单个pending RAF消费最新宽高，pointerup先flush最终值再解绑；destroy或新drag必须取消旧RAF/listener，避免stale resize。
4. **zoom和guide保持局部更新。**
   - zoom只改display scale；guide只重画guide/必要snapshot，不触发manifest parse、asset load或Symbols sample。测试以调用计数和scene identity
     固定当前正确行为。
5. **结构修改仍自动、一次提交一次重建。**
   - resource bytes/topology/binding/transition kind等仍由subscriber进入`refreshPreview()`；UI字段在`change`前不transact。
   - 不新增任意毫秒debounce，避免blur/Enter后预览延迟或最后一次提交丢失；高频pointer stream只用RAF合并视觉帧。
6. **不加入刷新按钮。**
   - 自动分类和事务边界能够满足需求；手动按钮会允许project与preview长期不一致，并增加导出前是否已刷新的新状态。

## 5. 职责与合同

- **RenderCore data/manifest**：拥有唯一strict parser及immutable-vs-geometry判定；Popup package identity/order保持immutable，root placements
  是可原子提交geometry。
- **RenderCore package runtime**：拥有Popup/reel/node/player实例、当前mode/scene/prepared transition和viewport commit；geometry更新复用
  owner，不创建第二个player或随机scene，不泄漏旧资源。
- **Gamelayout Editor store/UI**：store拥有validated draft revision和change kind；UI拥有未完成input draft、page size、zoom、RAF调度和反馈，
  不直接操作Pixi display tree。
- **失败策略**：非法数字、缺variant placement、immutable结构变化、active transition/prelude冲突和destroy后调用继续显式失败；geometry失败
  保留此前已提交preview，不自动full rebuild或清空来掩盖问题。
- **资源生命周期**：full structural replacement继续prepare新package/runtime后再commit并destroy旧owner；geometry/page/zoom路径不transfer、
  destroy或重新load资源。resize RAF和window pointer listener必须在pointerup、下一次drag和AppShell destroy时cleanup。
- **禁止行为**：不得复制Popup transform、轮带scene或variant选择算法；不得通过manifest stringify全等、filename、控件path alias或silent
  fallback猜测更新类型。

## 6. 文件范围

### 预计新增

```text
tasks/266-gamelayouteditor-preview-rebuild-optimization-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/manifest.ts
packages/rendercore/tests/scene-layout/{manifest,package-runtime}.test.ts
packages/rendercore/README.md
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/tests/{app-shell,editor-store,layout-preview}.test.ts
apps/gamelayouteditor/README.md
docs/agent-rules/scene-layout.md
```

`layout-preview.test.ts`仅在combined-runtime scene/player continuity缺少直接证据时修改；若package-runtime与app-shell测试已充分证明，不为
凑文件增加重复断言。

### 原则上不应修改

```text
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/ui/{layout-workspace,transitions-workspace}.ts
packages/rendercore/src/scene-layout/{package-runtime,runtime}.ts（现实现已消费next Popup placement；仅测试暴露真实缺口时小幅适配）
packages/rendercore/src/{popup,symbol,reel}/**
packages/{logiccore,gameframeworks,uiframeworks,editorcore,editorresource,browserartifactio}/**
apps/{popupeditor,symbolseditor,gameviewer,gameviewer2}/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

若执行证据表明需要改变public API、Popup/order schema、runtime active-transition策略或其它consumer，属于明显范围扩张，必须先说明；
不得修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与可复现调用链**
   - 重核HEAD/status、计划、两份领域规则及目标文件；保留执行时出现的用户无关修改。
   - 用现有test fixture固定两条回归：transition prelude Popup `scale` commit当前调用`setLayout()`，page resize当前在
     `setPageSize()`后调用`setLayout()`；记录Symbols scene/随机源调用数作为重建证据。
2. **修正shared geometry compatibility合同**
   - 在`manifest.ts#sceneLayoutStructure`对Popup binding只剥离`placements`，保留id映射、manifest、order和其它immutable字段。
   - 补manifest测试：只改Popup任一variant `x/y/scale`通过；新增/删除Popup、改manifest/order继续拒绝；既有node/reel/transition和
     resource structural测试不回归。
3. **证明package runtime原位提交Popup geometry**
   - 扩展package-runtime测试，在ready runtime和current viewport上修改Popup placement，断言同一Popup container/player、同一reel
     presentation和visible scene被复用，当前位置/scale更新，stable/displayed mode与prepared direct edge不变。
   - 分别覆盖共享placement循环所需的代表性Popup类型；若测试发现next manifest没有完整应用，才在`package-runtime.ts`做最小原子
     commit修正，不下沉到app或Popup owner。
4. **接通Editor geometry path并固定输入提交边界**
   - 通过shared checker让`EditorStore`把Popup placement事务分类为geometry；补store测试确认resource/binding/order仍structural。
   - 在app-shell测试模拟转场Popup scale的`input`与`change`：input不transact/不刷新，change只调用一次
     `applyGeometryManifest()`，`setLayout()`为零；普通Popup入口共享相同结果。
   - 保持geometry apply失败的可见错误和旧preview，不加入full rebuild fallback。
5. **移除page resize冗余重建并合并拖拽事件**
   - 从`setPreviewSize()`移除无条件`refreshPreview()`；preset/custom input沿用LayoutPreview的page-size路径。
   - 为resize handle增加latest-size RAF调度和明确flush/cleanup，确保每帧最多一次`setPageSize()`、pointerup提交最终尺寸、跨orientation
     正确更新variant，AppShell destroy后不再回调。
   - 补app-shell/layout-preview测试，证明page resize、drag、zoom和guide不调用`setLayout()`、不重采样Symbols且最终frame/CSS值正确。
6. **文档、规则与收尾**
   - 更新RenderCore README的geometry-only字段边界、Gamelayout Editor README的输入/resize/rebuild语义；在Scene Layout领域规则明确
     Popup root placement与preview resize/zoom不得重建或重采样。
   - 运行L2定向验收和浏览器人工验收，核对diff/旧措辞，生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- 以runtime/player/reel/scene identity、随机源调用数和`setLayout/applyGeometryManifest`调用计数证明“未重建”，不能只断言最终像素值。
- 覆盖Popup placement正常路径、immutable字段拒绝、active transition/prelude fail-fast、resize跨orientation和destroy cleanup。
- 不为测试绕过strict parser，不把mock-only假runtime结果冒充浏览器Pixi/Popup人工验收。

### 验收级别

`L2`。任务改变RenderCore shared geometry compatibility及Scene Layout package runtime可接受的外部manifest更新范围，并由
Gamelayout Editor直接消费；需要shared package与直接consumer的定向测试、typecheck和build，但不涉及schema、lockfile、生成物或release，
无需L3整仓验收。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/editor-store.test.ts tests/layout-preview.test.ts tests/app-shell.test.ts
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor typecheck
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor build
pnpm exec prettier --check packages/rendercore/src/scene-layout/manifest.ts packages/rendercore/tests/scene-layout/manifest.test.ts packages/rendercore/tests/scene-layout/package-runtime.test.ts packages/rendercore/README.md apps/gamelayouteditor/src/ui/app-shell.ts apps/gamelayouteditor/tests/app-shell.test.ts apps/gamelayouteditor/tests/editor-store.test.ts apps/gamelayouteditor/tests/layout-preview.test.ts apps/gamelayouteditor/README.md docs/agent-rules/scene-layout.md tasks/266-gamelayouteditor-preview-rebuild-optimization.md
git diff --check
```

若执行时`layout-preview.test.ts`未修改，从Prettier参数删除该文件即可；若package runtime实现确需小幅修改，把实际文件加入同一命令，
不新增一条格式命令。失败先最小化复现并判断是否由本任务引入，不立即扩大到全仓。

### 人工验收

1. 启动Gamelayout Editor，导入同时含Symbols和普通Spine前置Popup的真实Layout ZIP，记录当前轮带图标；在转场页连续编辑Popup
   `scale`、`x/y`，输入未完成时画布不闪，blur/Enter后Popup下一次播放使用新geometry，轮带图标、mode和动画连续。
2. 连续拖拽preview右下角跨越横/竖比例，再使用preset和自定义宽高；画布/guide即时更新且无黑帧、runtime重启、Popup/轮带重置。
   点击zoom in/out/reset只改变显示倍率。
3. 执行一个明确结构变化（例如切换transition resource或替换资源），确认完成选择后自动重建且新资源生效；证明优化没有阻断必要
   rebuild，也不要求手动刷新。

### 独立验收建议

`建议`。复验shared immutable projection是否仅放开Popup `placements`、package runtime是否复用reel/Popup identity，以及page resize是否完全
绕开`setLayout()`。不涉及credential、服务器数据、正式schema/ZIP或release。最多复验前两条定向test命令和双package typecheck。

## 9. 环境与依赖

- 使用仓库要求的Node.js 24和pnpm；shell没有Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行`CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库约定代理并重试原命令。
- 不新增依赖、不修改lockfile、不切换npm/yarn。浏览器人工验收使用现有`pnpm --filter gamelayouteditor dev`。

## 10. 生成物、文档与规则

- 本任务不修改YAML或生成文件，不运行generator。
- 更新`packages/rendercore/README.md`和`apps/gamelayouteditor/README.md`，分别记录shared geometry contract与editor preview同步策略。
- 更新`docs/agent-rules/scene-layout.md`的稳定约束：Popup root placement、resize、variant、zoom和普通relayout必须复用runtime/scene，不能
  重建或重新抽样。`editor-artifacts.md`无需修改，因为filename-key、import/export和owner合同不变。
- 不修改根`AGENTS.md`；具体测试结果和执行证据只写task报告。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/266-gamelayouteditor-preview-rebuild-optimization-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、geometry字段边界、计划偏差、实际验收命令结果、浏览器验收、
剩余风险和未完成项；不收集无关coverage、完整历史或整仓统计。

## 12. 风险、假设与待确认

### 风险

- Popup placement目前由package runtime的`applySnapshot()`消费，但active transition/prelude明确禁止geometry mutation；测试必须区分
  “复用失败”与合法的状态机保护，不能用rebuild取消active状态。
- orientation incomplete draft可能由`editorProjectToPreviewManifest()`生成v1 fallback；移除page-size rebuild后要确认跨方向仍显示当前可用
  fallback并明确错误。若只有fallback切换确需新资源，最多在resize gesture结束后执行一次有证据的refresh，不能恢复每个pointermove重建。
- RAF合并若未flush/cancel会丢最后尺寸或在destroy后访问DOM；必须测试pointerup、连续drag和destroy。
- `setLayout()`的async token只防stale commit，不会取消全部prepare成本；若仍有未识别的高频structural transaction，人工验收可能继续卡顿，
  应先定位exact字段，不能把所有structural更新误放进geometry。

### 假设

- 用户所说“转场里弹窗的scale”对应`data-transition-popup-placement-field="scale"`，它最终修改共享Popup dependency的variant
  placement；代码证据支持该解释。
- “缩放”同时包含Popup/node scale和preview resize/zoom；本计划分别按manifest geometry、runtime viewport、CSS display处理。
- 真实结构变化继续自动刷新符合用户预期；用户提出refresh按钮仅为优化困难时的后备方案。

### 待确认

无。当前仓库已能确认触发链、runtime能力和验收边界。

## 13. 完成清单

- [ ] Popup placement和preview resize不再触发full rebuild，目标与非目标均满足。
- [ ] immutable/geometry职责、public API和runtime ownership符合计划。
- [ ] Symbols scene、mode、Popup/reel/player identity和动画连续性有自动化证据。
- [ ] 必要结构变化、strict failure和active transition/prelude保护未回归。
- [ ] README、Scene Layout规则和直接测试已按需同步。
- [ ] 指定L2自动化与浏览器人工验收已分别通过。
- [ ] diff范围经检查，UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、`docs/agent-rules/{scene-layout,editor-artifacts}.md`和本计划；
2. 核对Git基线与工作区，保留用户已有和无关修改；
3. 先用调用计数/identity测试固定Popup scale与resize重建，再按shared checker→runtime证据→editor接线→RAF resize顺序实现；
4. 小幅适配当前实现时在报告记录，public API/schema/order/active-state策略或consumer范围扩张时先停止说明；
5. 只运行计划规定的L2验收，自动化不能代替真实浏览器视觉/交互验收；
6. 完成后生成UTC中文执行报告；
7. 除非用户明确要求，不commit、不push、不创建PR。
