# 136 gamelayouteditor-ui-state-refresh-fixes 任务计划

## 1. 目标与完成定义

### 目标

统一修复 Game Layout Editor 中“重绘或开关后丢失用户编辑状态”的问题：

1. 双背景（`orientation-focus`）项目中，普通图层的横屏、竖屏显示开关会清空已编辑 placement；关闭后再次开启应恢复原有 `x/y/scale`。
2. production preview 转场完成后，runtime 已提交目标 stable mode，但默认开启“跟随编辑状态”时左侧主状态和各 Inspector 仍停在 source；成功转场后应同步到目标状态，不再要求用户手工切过去再切回来。
3. Symbols otherScene 行关闭再开启或切换 source kind 时，会丢失 target、权重表和 fixed-number；应保留每个 symbol 的最后编辑值。
4. workspace/Picker 重绘会丢失部分控件焦点、caret、selection range、转场创建 from/to，以及 BigWin placement 的未提交输入；刷新后应恢复仍有效的 UI draft。

### 完成定义

- [ ] 普通图层的 landscape 与 portrait placement 分别记忆；关闭再开启任一方向时，精确恢复该方向关闭前的 `x/y/scale`。
- [ ] 关闭方向后，该图层在该方向的 preview 和正式导出中仍保持不可见，不因保存了编辑器侧记忆值而被渲染。
- [ ] 首次开启一个从未配置过 placement 的方向时，仍使用明确固定初值 `{x:0,y:0,scale:1}`；不得从另一方向猜测或复制值。
- [ ] 重复关闭、重复开启、切换选中图层和执行无关编辑 transaction 不得覆盖已记忆值。
- [ ] 图层隐藏期间切换项目坐标类型时，记忆中的 placement 与可见 placement 一起转换；重新显示后的视觉位置语义正确。
- [ ] 背景 binding、main reel placement、popup、transition、单背景项目和 scene-layout v1 的正式可见性合同保持不变。
- [ ] 转场成功 settle 后，preview selector 精确反映 runtime `stableMode`；“跟随编辑状态”开启时主状态 selector、Layout、Symbols 和 BigWin 一次同步到同一目标 mode。
- [ ] “跟随编辑状态”关闭时，preview stable mode 可变化，但左侧编辑状态继续保持用户选择；转场失败、取消或 stale request 不得修改编辑状态。
- [ ] 完成一次正向转场后，可直接以新 stable mode 准备并执行反向转场，不需要手工切换 selector 刷新状态。
- [ ] BigWin runtime 状态和可播放 binding 始终读取 runtime stable mode，不从可能独立的左侧编辑 selector 猜测。
- [ ] otherScene 每个 package/symbol 的 enabled、target、table 与 fixed-number 独立保留；关闭、重开和 source kind 往返不回退首项或 `1`。
- [ ] store/preview/error/筛选刷新后，仍存在的活动控件恢复 focus、caret、selection range；资源搜索和 Picker 搜索不破坏 IME composition。
- [ ] 新建转场的 from/to 只在成功创建或项目替换后清空；BigWin placement 编辑中间态不被异步刷新覆盖，成功 change 后仍以 project 为权威值。
- [ ] `gamelayouteditor` 定向自动化完成，向用户交付真实浏览器人工验收清单，并生成任务 136 UTC 中文执行报告；浏览器验收由用户执行。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 普通图层 draft 中“当前可见 placement”与“隐藏方向 placement 记忆”的分离。
- `setLayerVariantVisibility()` 的幂等关闭、恢复和首次初始化语义。
- Inspector checkbox、placement 字段和操作反馈文案。
- editor draft clone/transaction、manifest/preview projection和坐标原点转换中的隐藏值处理。
- preview transition completion 到编辑状态、Inspector 与 runtime 控件的单向同步。
- Symbols otherScene preview-only 行 draft，以及启用/source kind 的非破坏性投影。
- 通用 focus/caret/selection/IME 刷新合同、转场创建 draft 和 BigWin placement 输入中间态。
- model、store、UI 和坐标转换的定向回归测试，以及 README 中最小用户行为说明。

### 不包含

- 修改 `packages/rendercore` scene-layout v1 schema，或给 production manifest 新增 `visible`、`enabled`、`cachedPlacement` 字段。
- 让隐藏 placement 随正式 layout ZIP 导出并在重新导入后恢复；正式 ZIP 继续只保存运行时可见 placement。
- 改变“缺少该 variant placement 即该 node 在该方向不可见”的 production runtime 合同。
- 修改背景显示逻辑、game mode background binding、main reel、popup 或 transition 的 placement 合同。
- 修改 rendercore 转场 prepare/commit、Spine/MP4 播放、event/fade 边界或 scene-layout runtime snapshot 合同。
- 在“跟随编辑状态”关闭时强制把左侧 Inspector 切到 runtime stable mode。
- 把 otherScene preview-only binding、转场创建草稿或未提交表单值写入 layout manifest/ZIP。
- 新增全局表单框架、undo/redo、localStorage 或跨页面刷新草稿恢复。
- 新增 undo/redo、localStorage、自动保存、跨浏览器会话草稿恢复或从另一方向复制 placement。
- 修改游戏 app、资源、生成物、workspace 工具链、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-07-29T08:02:35Z
HEAD: 7d4ecb694d7b73fe656b4b667dc975c436f22584
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和计划依据：

```text
AGENTS.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
tasks/templates/task-plan.md
tasks/129-gamelayouteditor-preview-coordinate-refresh.md
tasks/134-gamelayouteditor-vni-spine-animation-layers.md
apps/gamelayouteditor/README.md
```

当前代码基线：

- `apps/gamelayouteditor/src/ui/layout-workspace.ts` 的 `placementMarkup()` 直接以 `node.placements[variant]` 是否存在决定 checkbox 和字段显示；无 placement 时提示重新启用会创建固定初值。
- `apps/gamelayouteditor/src/model/resource-commands.ts` 的 `setLayerVariantVisibility()` 在关闭时 `delete node.placements[variant]`，开启时无条件覆盖为 `{x:0,y:0,scale:1}`，是已编辑值丢失的直接原因。
- `apps/gamelayouteditor/src/ui/app-shell.ts` 的 checkbox handler 调用上述 command，并向用户提示 placement 已删除或以固定初值创建。
- `EditorNodeDraft` 当前只有 `placements`；`cloneEditorProject()` 会 clone draft，但没有独立的隐藏 placement 记忆。
- `editorProjectToManifest()` 和 `editorProjectToPreviewManifest()` 最终只把 `node.placements` 投影到 scene-layout manifest；rendercore parser/runtime 继续以某方向 placement 是否存在表示该方向可见性。
- `convertProjectCoordinateOrigin()` 当前只转换 `node.placements`。若新增 editor-only 隐藏值而不纳入转换，隐藏期间切换 `top-left/center` 后会恢复到错误坐标语义。
- `apps/gamelayouteditor/tests/validation.test.ts` 与 `app-shell.test.ts` 现有断言保护的是“关闭删除、开启归零”的旧行为，需要改为任务 136 的保值合同。
- `requestPreviewMode()` 成功分支读取 runtime settled snapshot 后只更新 `#selectedPreviewMode` 和完成文案，没有在 `#followEditMode` 为 true 时同步 `#selectedGameMode`；随后 `renderWorkspace()` 仍按旧编辑 mode 重建 Layout/Symbols/BigWin。
- `renderPreviewRuntimeControls()` 虽用 snapshot stable mode 决定 popup play 是否可用，但诊断中的 popup id 取自 `#selectedGameMode`，follow 关闭或同步遗漏时会报告错误 binding。
- `app-shell.test.ts` 的转场完成测试只断言完成文案和控件解锁，没有断言 `data-game-mode`、目标 mode Inspector、BigWin binding 或无需手工操作即可执行反向转场。
- `renderOtherSceneBindings()` 对缺失 binding 使用首个 target/权重表或 fixed `1`；`commitOtherSceneBindings()` 又跳过 unchecked 行，所以关闭后重绘必然清空旧 target/source。
- `renderWorkspace()` 对非固定 Tab 整体替换 `panel.innerHTML`；`captureFocusToken()` 只识别少量控件且只恢复 `focus()`，未保存 selection range。Picker 搜索每次 `input` 也整体重建 dialog。
- 转场创建 from/to 只存在 DOM，`EditorUiSession` 没有对应 draft；`renderPopupControls()` 每次刷新无条件覆盖 popup placement input value。

当前实现和测试已足以确认根因与范围，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “双背景”解释为 `orientation-focus` 项目；问题对象是布局大纲中的普通图层，不是每个 game mode 的稳定背景节点。
- “以前编辑好的值不会被清空”解释为同一个 editor draft 生命周期内，关闭后再次开启恢复该 node、该 variant 的最后 `x/y/scale`。
- landscape 与 portrait 独立记忆；操作一个方向不得修改另一个方向。
- 隐藏仍是有效的编辑动作：关闭后 preview 和 export 必须不含该方向 placement，不能为了保值而继续显示节点。
- 正式 layout ZIP 只描述 production 可见状态。隐藏值属于 editor-only 临时记忆，导出隐藏状态并重新导入后没有信息可恢复，这是本任务明确的持久化边界。
- 用户已确认真实浏览器验收由用户处理；执行会话负责自动化验证和交付可复验步骤，不代跑或把未收到人工结果视为实现失败。
- “当前状态没变”解释为 runtime 已 settle 到目标 stable mode，但默认 follow 模式下左侧主状态 selector 和按 mode 渲染的 Inspector 仍显示 source；不把它误判为 rendercore 没有完成 scene commit。
- otherScene、转场创建、focus/caret 和 BigWin 中间态只要求当前 editor session 内保留；不进入 production ZIP，也不承诺页面重载恢复。

### 关键决策

1. **在 editor draft 保存隐藏 placement，不扩展 production schema**
   - 为普通 node 增加 editor-only、按 variant 索引的隐藏 placement 记忆（字段名可在实现时按现有命名确定）。
   - 可见时权威值仍在 `node.placements`；隐藏时把原值移入记忆并从 `placements` 删除。
   - `editorProjectToManifest()` 继续只输出 `placements`，因此 rendercore、ZIP、consumer 和 schema 均不改变。

2. **切换 command 使用“保存、恢复、首次初始化”三态语义**
   - `true -> false`：复制当前 placement 到隐藏记忆，再删除可见 placement。
   - `false -> true`：优先恢复同方向记忆；仅在没有历史值时创建固定初值。
   - 重复关闭不得用空值覆盖记忆；重复开启不得重置当前值。非法 node/variant 继续显式失败。

3. **隐藏值跟随 editor 内部几何变换**
   - `convertProjectCoordinateOrigin()` 对可见与隐藏 placement 使用同一资源类型、art size、scale 和 origin 公式。
   - 这只保持 editor draft 的坐标语义，不把隐藏 node 提交给 preview/runtime。
   - 不给隐藏状态增加另一套坐标算法，也不从当前 variant 或资源 bounds 猜恢复值。

4. **UI 继续只编辑当前可见 placement**
   - checkbox 仍以正式可见状态为 checked 条件；隐藏时不展示可编辑数值输入。
   - 隐藏提示改为“placement 已保留，重新显示会恢复”；开启反馈区分“恢复原值”和“首次创建固定初值”。
   - UI 不直接维护缓存，所有状态变更经 model command 和 `EditorStore` transaction 完成。

5. **导入、导出和 preview 保持严格边界**
   - manifest import 只为实际存在的 placement 建立可见状态，不伪造缺失方向的历史值。
   - editor-only 记忆不得出现在 manifest、assets map、ZIP 或 preview runtime spec。
   - 当前 manifest 对普通 node 至少一个有效 placement 的 strict validation 不放宽；若用户把所有方向都关闭，项目继续显示现有不完整状态，重新开启后可恢复值。

6. **以 runtime settled snapshot 提交 UI mode 同步**
   - `requestGameMode()` resolve 后必须重新读取 snapshot，并要求其 `phase=stable`、`stableMode` 等于请求目标；不使用 DOM 选项或过期 target 猜测成功状态。
   - 始终把 preview selector 同步为 settled stable mode；仅当 follow 开启时同步编辑 mode，并在一次 workspace 重绘中刷新 Layout/Symbols/BigWin。
   - follow 关闭时保持编辑 selector 独立；失败、stale、destroy 和未 settle snapshot 继续保持 source UI，不提前切换。
   - runtime popup 诊断、play enablement 与反向 transition source 使用 snapshot stable mode，不读取左侧 selector 代替 runtime 状态。

7. **建立统一 UI draft 与 focus snapshot**
   - otherScene UI draft 按 package/symbol 保存 enabled、target、最后 table 和 fixed-number；只把 enabled 行投影给 preview，切换 kind 不删除另一分支值。
   - transition create from/to 与 BigWin dirty placement 存入 session；成功提交后清理，失败或无关重绘保留，项目 replace 时统一 reset。
   - focus snapshot 保存稳定 selector 及适用的 selectionStart/End/direction；Picker 与 workspace 共用恢复语义。composition 期间不替换活动输入，`compositionend` 后再刷新结果。
   - 不保留已经删除、禁用或上下文变化后失效的 DOM token；strict model validation 仍决定最终可提交值。

## 5. 职责与合同

- **Editor model**：拥有普通图层可见 placement、隐藏记忆和切换 command；保证 node/variant 隔离、幂等与首次初始化。
- **Editor UI**：展示可见性、字段与反馈，不复制 placement 缓存或恢复算法。
- **Editor manifest projection**：只把当前可见 placement 投影到 scene-layout v1；隐藏记忆是非导出 draft 状态。
- **Editor transition UI**：以 runtime settled snapshot 更新 preview 状态，并按显式 follow 开关决定是否同步编辑状态；不拥有或伪造 scene commit。
- **Editor UI session**：拥有 preview-only row draft、transition create draft、dirty input 和 focus snapshot；项目/manifest 不保存这些临时状态。
- **Rendercore**：继续按正式 manifest placement 决定节点可见性；本任务不修改其 schema、runtime 或资源生命周期。
- **失败策略**：未知 node、背景 node、非法 variant 或非法 placement 继续显式失败；transaction 失败不得部分移动或丢失 placement。
- **禁止行为**：不新增 schema fallback、不从另一方向复制值、不用 UI session Map 作为第二状态源、不让隐藏记忆泄漏到正式 ZIP。

## 6. 文件范围

### 预计修改

```text
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/resource-commands.ts
apps/gamelayouteditor/src/model/coordinate-origin.ts
apps/gamelayouteditor/src/ui/layout-workspace.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/ui/ui-session.ts
apps/gamelayouteditor/src/ui/transitions-workspace.ts
apps/gamelayouteditor/tests/validation.test.ts
apps/gamelayouteditor/tests/editor-store.test.ts
apps/gamelayouteditor/tests/coordinate-origin.test.ts
apps/gamelayouteditor/tests/app-shell.test.ts
apps/gamelayouteditor/tests/ui-session.test.ts
apps/gamelayouteditor/README.md
```

若现有 `source-boundary.test.ts` 或 `zip-io.test.ts` 是证明 editor-only 字段未导出的更直接位置，可在不扩大产品范围的前提下补充对应断言，并在执行报告记录。

### 原则上不应修改

```text
packages/rendercore/**
packages/editorresource/**
packages/browserartifactio/**
packages/vnicore/**
apps/gamelayoutpkgcli/**
apps/game002/**
apps/game003/**
assets/**
docs/scene-layout-manifest.md
docs/agent-rules/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若实现发现必须持久化隐藏 placement、修改 scene-layout public schema 或触及直接 consumer，属于明显范围扩张，执行前必须停止说明，不能通过改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线并建立失败回归**
   - 重查 HEAD、工作区、两份领域规则和本计划。
   - 在 model/UI 测试中先复现：编辑 landscape 与 portrait 为非默认值，关闭并开启一个方向后当前代码归零。
   - 同时记录另一个方向值、preview/export 可见性和 store revision，避免只验证单个对象字段。

2. **扩展 editor-only node draft 合同**
   - 在 `EditorNodeDraft` 增加隐藏 placement 记忆，并让 clone/replace/transaction 自然保留深拷贝值。
   - manifest import 的隐藏记忆保持为空；add layer 与首次显示只创建用户明确启用方向的固定初值。
   - 保持 background node 创建、重绑和 game mode background ordering 不受普通图层记忆字段影响。

3. **修正普通图层可见性 command**
   - 将 `setLayerVariantVisibility()` 改为原子保存、删除、恢复或首次初始化。
   - 覆盖 landscape/portrait 独立值、重复 toggle、首次启用、rebind/rename 后恢复和非法目标失败。
   - 确保关闭所有方向造成的现有 validation error 不清空记忆，用户重新启用后可恢复为合法项目。

4. **同步几何与 manifest 边界**
   - 让坐标原点转换同时处理隐藏 placement，并验证 top-left -> center -> top-left 可逆。
   - 证明 editor manifest、preview manifest 和 ZIP 只包含当前可见 `placements`，不序列化隐藏记忆。
   - 保持 visibility toggle 对 preview 的 structural update 语义，不让 editor-only cache 被误判为 runtime geometry。

5. **更新 Inspector、转场完成同步与交互反馈**
   - checkbox 继续反映当前方向是否实际可见；重新开启后数值输入显示恢复值。
   - 更新隐藏提示和操作反馈，首次初始化与恢复原值使用准确文案。
   - 在转场成功 settle 后同步 preview selector；follow 开启时同步主状态和全部 mode-aware Inspector，follow 关闭时保持编辑选择。
   - 修正 BigWin runtime 状态使用 stable mode，并确保成功后可直接准备反向边；失败或 snapshot 不匹配时不提交 UI mode。
   - otherScene 改为 enabled 与已编辑 binding 分离；source kind 往返恢复各自 table/fixed 值。
   - 扩展 session/focus snapshot，保护 workspace/Picker 的 caret、selection、IME、转场 from/to 和 BigWin dirty placement。
   - 不改变布局大纲、selection、focus/details 或其它 Inspector 字段。

6. **测试、文档与收尾**
   - 完成 model/store/origin/UI/manifest projection 定向测试，并整理用户可直接执行的浏览器人工验收清单。
   - 在 README 最小补充普通图层方向开关的 draft 记忆和 ZIP 持久化边界；不修改稳定领域规则。
   - 运行 L1 命令、检查 diff，并生成 `tasks/136-gamelayouteditor-ui-state-refresh-fixes-<utctime>.md`。

## 8. 测试与验收

### 测试原则

- 使用明显不同的 landscape/portrait `x/y/scale`，证明恢复的是原值而非默认值或另一方向值。
- 同时断言 editor draft 记忆、manifest projection、preview 可见性和 UI 输入值，避免只测内部缓存。
- 覆盖 image、Spine 或 VNI 共用的普通 node command；资源播放类型不影响 placement 记忆，不为每种资源复制同一组测试。
- 覆盖幂等 toggle、首次启用、关闭全部方向后的恢复、隐藏期间坐标转换和 transaction clone。
- 覆盖 follow 开/关、成功/失败/stale 转场、settled snapshot mismatch、正向后直接反向和 stable-mode popup binding。
- 覆盖 otherScene disable/enable、source kind 双向切换、package/symbol 隔离与 preview 只消费 enabled 行。
- 覆盖 workspace/Picker 中间插入、selection range、composition、转场 from/to、BigWin dirty/commit/error/project replace。
- 不放宽 rendercore parser 或导出 strict validation 来迁就 editor-only 状态。

### 验收级别

`L1`。改动限于 `apps/gamelayouteditor` 内部 draft、command 和 UI，不修改跨 package public API、正式 schema、生成器、依赖或 lockfile。

### 执行会话必须运行

```bash
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build
git diff --check
```

### 自动化验收重点

- model：`{landscape:{x:123,y:-45,scale:0.75}}` 关闭后不进入 manifest，再开启精确恢复。
- variant 隔离：切换 landscape 不修改 portrait，反向亦然。
- 首次启用：无可见 placement 且无记忆时只创建固定初值。
- 幂等：重复关闭保留首次关闭值；重复开启保留当前已编辑值。
- store：无关 transaction、clone 和 validation error 不丢失隐藏记忆。
- origin：隐藏值与可见值使用相同语义完成双向转换。
- UI：checkbox、提示、反馈和重新出现的数值输入与 model 状态一致。
- export/preview：隐藏方向没有 node placement，editor-only 字段不泄漏。
- transition：成功后 preview selector 与 stable mode 一致；follow 开启时编辑 selector 及各 Inspector 同步，关闭时编辑 selector 不变。
- reverse：BaseGame -> FreeGame 完成后无需手工刷新即可准备 FreeGame -> BaseGame。
- failure：request reject、stale completion 或 settled snapshot 不匹配时保持 source UI，不显示虚假的完成状态。
- BigWin：runtime status/playability 读取 snapshot stable mode，不受独立编辑 selector 影响。
- otherScene：关闭后重开恢复 target/source；table -> fixed -> table 分别恢复最后 table 和 fixed-number。
- focus：资源搜索、Picker、number、image-string 和 transition 控件重绘后恢复有效焦点与选区；IME 组合不被中断。
- form draft：转场 from/to 和 BigWin placement 经异步 preview/error 重绘不丢，成功提交或项目替换后按合同清理。

### 人工验收

由用户在真实浏览器运行双背景项目；Codex 不代跑。执行会话应在报告中交付以下清单：

1. 新增普通图层，同时启用横屏和竖屏，为两方向输入明显不同的 `x/y/scale`。
2. 分别关闭、切换其它图层或 Tab、再开启横屏和竖屏，确认各自恢复原值，preview 只在开启方向显示。
3. 隐藏一个方向后切换项目坐标类型，再恢复显示，确认视觉位置语义不变。
4. 隐藏一个方向导出 ZIP，检查生产 preview 中该方向不显示该图层；重新导入不声称恢复未写入 ZIP 的隐藏值。
5. 保持“跟随编辑状态”开启，完成正向转场，确认主状态、Layout 背景、Symbols、BigWin 与 preview stable mode 同步；不操作 selector，直接执行反向转场。
6. 关闭“跟随编辑状态”再转场，确认 preview 进入目标 stable mode 而左侧仍停在用户选择的编辑 mode；BigWin runtime 诊断仍显示 stable mode binding。
7. 在 Symbols otherScene 配置非默认 target、table 和 fixed-number，反复关闭/启用并切换 source kind，确认各分支值恢复。
8. 在资源/Picker 搜索框中间编辑中文，在转场 from/to 和 BigWin placement 未提交时触发 preview 刷新，确认焦点、caret 和输入不跳回默认值。

### 独立验收建议

`不需要`。本任务不涉及跨包 public contract、credential/服务器数据、resource ownership、异步 transaction、正式 schema、生成器或 release；Codex 完成目标 package 自动化验收，真实浏览器交互由用户按清单验收。

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 Node 和 pnpm，不切换 npm/yarn。
- 依赖缺失时才运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置仓库约定代理并重试原命令。
- 本任务不新增依赖、不修改 package manifest 或 lockfile。

## 10. 生成物、文档与规则

- 本任务没有 YAML、生成 TypeScript、资源 manifest 或其它生成物变化。
- `apps/gamelayouteditor/README.md` 最小记录方向显示开关会在当前 draft 中记忆 placement、隐藏值不进入 production ZIP，以及 follow 开启时成功转场会同步编辑状态。
- scene-layout v1、runtime 职责和 editor artifact 边界不变，因此不更新根 `AGENTS.md`、领域规则或长期 manifest 文档。
- 执行证据只写入任务 136 UTC 报告，不追加到 README 或规则文件。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/136-gamelayouteditor-ui-state-refresh-fixes-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终实现与实际修改文件；
2. editor-only 记忆字段、manifest projection 和计划偏差；
3. transition settled snapshot、follow 同步和 stable-mode runtime UI；
4. 实际验收命令及结果；
5. 已交付给用户的浏览器人工验收清单，以及用户已反馈的结果（如有）；未收到反馈时明确写“待用户验收”，不冒充已通过；
6. 剩余风险，尤其是隐藏值不随 production ZIP 持久化的边界。

## 12. 风险、假设与待确认

### 风险

- 隐藏 placement 若未纳入坐标原点转换，重新显示会产生位置偏移；必须用可逆测试保护。
- editor-only 字段若被直接 spread 到 manifest，可能让 strict parser 报 unknown key 或改变 production 可见性；必须通过显式 projection 测试保护。
- 关闭两个方向时正式 manifest 仍无有效普通 node placement，项目会保持现有 validation error；恢复任一方向应消除由此产生的错误，且不能丢记忆。
- 隐藏值不进入 production ZIP，因此导出后关闭页面再重新导入无法恢复该值；UI/README 和交付给用户的人工验收清单必须准确表达该边界。
- 若只更新完成文案或 preview selector，而未同步 follow 模式下的 `#selectedGameMode`，mode-aware Inspector 仍会显示 source；测试必须断言用户可见的 selector 和 binding。
- 若把同步提前到 transition event 切场边界或 Promise settle 之前，失败/once 收尾期间可能显示虚假 stable mode；只在严格 settled snapshot 后提交。
- UI draft 若没有 package/symbol/context 稳定 key，切 dependency、mode 或项目后可能串值；reset/normalize 边界必须有测试。
- 只恢复 focus 而不保护 composition 和 selection range，仍会造成中文输入中断或光标跳尾；两者必须作为同一合同实现。

### 假设

- 用户反馈指同一编辑 draft 内反复点击横屏/竖屏显示开关，不包含跨导出、跨页面重载的隐藏值持久化需求。
- 任务只针对普通图层；双背景资源本身通过 game mode/variant background binding 管理，没有同一显示 checkbox。
- 当前固定初值仍适用于从未配置过的方向，且不得自动继承另一方向。
- 用户反馈发生在默认开启 follow 的产品流程；follow 关闭仍按既有合同允许编辑状态与 preview stable mode 独立。
- otherScene、transition create 和 dirty input 只在当前 editor session 保值；新建/导入项目明确清空。

### 待确认

无。若执行会话收到“隐藏值也必须随 ZIP 持久化”的新增要求，应视为 scene-layout schema/public consumer 范围扩张并重新确认，而不是在 app 内增加私有导出字段。

## 13. 完成清单

- [x] 普通图层横竖屏关闭/开启恢复各自原 placement。
- [x] 首次启用、重复 toggle、关闭全部方向和无关 transaction 行为明确。
- [x] preview/export 不渲染隐藏方向，editor-only 记忆不泄漏。
- [x] 隐藏 placement 已纳入坐标原点转换并通过可逆测试。
- [x] 背景、reel、popup、transition、schema 和 consumer 保持不变。
- [x] 转场完成后的 selector、mode-aware Inspector、反向边和 BigWin stable-mode 状态已同步。
- [x] otherScene 分支值、通用 focus/caret/IME、转场创建和 BigWin dirty input 已通过刷新回归。
- [x] README 与自动化验收已完成，浏览器人工验收清单已交付用户。
- [x] 实际修改未超范围，或偏差已在报告说明。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/scene-layout.md`、`docs/agent-rules/editor-artifacts.md` 和本计划；
2. 核对 Git 基线与工作区，保留用户无关修改；
3. 先建立 placement、otherScene、focus/caret、转场状态和 BigWin 输入的失败回归，再实现统一 UI 状态修复；
4. 保持 scene-layout v1 与 production ZIP 可见性合同不变；
5. 小幅适配当前实现时在报告记录，schema/public API 范围扩张时先停止说明；
6. 只运行计划规定的 L1 自动化验收；不代跑真实浏览器验收，向用户交付本计划中的人工验收清单；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
