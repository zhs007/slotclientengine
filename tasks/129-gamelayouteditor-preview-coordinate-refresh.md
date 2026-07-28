# 129 gamelayouteditor-preview-coordinate-refresh 任务计划

## 1. 目标与完成定义

### 目标

修复 Game Layout Editor 导出再导入后图层可读名称被内容 hash 取代的问题；为当前选中普通图层增加红色边框与可见区斜线；重整编辑器 DOM 与 Pixi preview 的刷新分级，使纯选择和几何编辑不再重建 symbols；并增加可持久化、可转换、兼容旧包的全局左上角/中心坐标类型。根据执行后的产品决策，主转轮不增加整体缩放，横竖屏适配由背景素材、art size 与 reel placement 完成。

### 完成定义

- [ ] layout ZIP 导出、导入、再次导出后，`SceneLayoutNode.id` 仍是原图层名称；资源列表和 Inspector 使用 logical filename key，不显示 `assets/<sha256>.*` 物理 payload 路径充当图层或资源名称。
- [ ] 选中普通图层时，预览画布以红色非交互框标出当前 variant 中该图层的实际可见边界；黄色、绿色现有 guide 不变，隐藏/删除/切换选择时红框立即清除或更新。
- [ ] 纯 UI selection 不触发 store mutation、资源 prepare、runtime 重建或 symbols 抽样；只改 node/reel placement、art/focus 几何或坐标类型时保留已加载资源、Spine player、当前 game mode、reel 与 sampled symbols scene。
- [ ] 资源、node topology、animation、symbols binding、mode/transition 等结构变化仍走严格 prepare/commit；失败和 stale async 结果不半提交。
- [ ] `main` 图标区不提供整体 scale；`orientation-focus` 仅保留 landscape/portrait `x/y` placement，适配由背景素材和 art size 完成。
- [ ] 项目可在 `top-left` 与 `center` 间全局切换；切换事务按当前 variant art size 原子转换现有 node、reel 和 art-space Spine transition placement，切换前后视觉位置不跳变。
- [ ] 新包保存坐标类型；缺少该字段的旧包按 `top-left` 正确读取、渲染并可 canonical re-export。
- [ ] rendercore、gamelayouteditor 的定向自动化验收和真实浏览器人工视觉/刷新验收完成，并生成任务 129 UTC 中文执行报告。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 的 typed draft、manifest conversion、ZIP round-trip、布局/项目 Inspector、selection guide、preview 更新分级和相关测试。
- `packages/rendercore/src/scene-layout` 的兼容 schema、坐标解析、reel geometry 和原子几何更新 API。
- scene-layout manifest 文档、Game Layout Editor README，以及稳定职责边界所需的最小领域规则更新。
- rendercore 直接 consumer `gamelayouteditor` 的 L2 验收；只在定向测试暴露回归时扩展到其它直接 consumer。

### 不包含

- canvas 拖拽编辑、缩放手柄、snapping、multi-select、undo/redo、图层锁定或 hover hit-test。
- 图标区整体缩放 UI、per-symbol scale 改写、symbol package schema 改造或服务器 scene/reel 逻辑。
- popup 坐标迁移；popup 已明确使用 viewport center offset。
- video blackout 坐标迁移；它是 viewport-space，不是 art-space placement。
- 用 editor sidecar、physical hash、原文件目录或运行时猜测恢复名称。
- 整仓 UI 框架重写、无关编辑器刷新重构、root 工具链/lockfile/依赖变更。

## 3. 制定计划时的基线

```text
UTC: 2026-07-28T04:18:02Z
HEAD: 78cda7ec1c4e874a9933ea1ba26f9dbc9890640f
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和计划依据：

```text
AGENTS.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
tasks/templates/task-plan.md
tasks/105-game-layout-editor-workspace-redesign.md
tasks/110-editor-resource-management-unification.md
tasks/112-gamelayouteditor-state-workspaces.md
```

当前代码基线：

- `apps/gamelayouteditor/src/io/exported-layout-zip.ts`
  的 `flattenLayoutClosure()` 通过 `assets.map.json` 把 logical filename key 映射到完整 SHA-256 payload；`rewriteLayoutManifestFilenameKeys()` 只应改资源引用，不应改 `node.id`。
- `apps/gamelayouteditor/src/model/editor-project.ts`
  的 `manifestToEditorProject()` 当前直接复制 `node.id`，并以 manifest resource path/skeleton/manifest key 重建 `resourceId`。名称 bug 必须在真实 export -> import 链路复现后修正 logical/physical key 混用点，不能新增第二套名称表。
- `apps/gamelayouteditor/src/ui/app-shell.ts`
  的 store subscription 对每个 revision 都调用 `renderWorkspace()` 和 `refreshPreview()`；后者最终调用 `LayoutPreview.setLayout()`。
- `apps/gamelayouteditor/src/preview/layout-preview.ts`
  的 `setLayout()` 会重新验证 package、重新 sample 每个 symbols binding、创建并初始化新 runtime，随后销毁旧 runtime；因此坐标 transaction 也会重排 symbols。
- `LayoutPreview` 当前没有 selection API；stage 只有 runtime、legacy symbol overlay 与黄/绿 guides。
- `SceneLayoutManifestV1` 当前没有坐标类型；node placement 是 `{x,y,scale}`，reel placement 只有 `{x,y}`。
- `packages/rendercore/src/scene-layout/runtime.ts` 当前把 art 左上角作为 `(0,0)`，node slot 直接使用 placement；`package-runtime.ts` 把 reel 放在 `grid.artRect.x/y`，没有 reel 父级 scale。
- `packages/rendercore/src/scene-layout/geometry.ts` 当前按未缩放 grid size 校验并映射 reel rect；旧包行为必须保持。

不需要审计 Git 历史；当前 schema、测试、规则和数据流足以制定计划。

## 4. 需求解释与技术决策

### 需求解释

- “图层名字”以 production `SceneLayoutNode.id` 为权威；资源 UI 使用 `assets.map.json` 的 logical filename key。完整 hash 只属于 payload path，不得成为 UI identity。共享资源仍可被多个不同名称 node 引用。
- 红框只表示布局大纲当前选中的普通 layer；背景和 main reel 仍由现有 guide 表达，本任务不增加点击画布选层。
- “尽量少刷”同时约束 DOM 和 Pixi：UI session 变化、几何变化、结构/资源变化使用不同更新路径，symbols 仅在 binding/grid topology/显式随机操作要求时重建或重新抽样。
- 主转轮不提供整体缩放；横竖屏差异通过背景素材宽度、art size 和 reel `x/y` 解决。
- 中心坐标是 art-space 的全局 authored coordinate mode，不改变 viewport focus 算法。中心模式中 art center 是 `(0,0)`；图片 placement 指图片中心，Spine/image-string placement 保持其 authored origin/anchor，reel placement 指 grid 的中心。

### 关键决策

1. **保持 manifest v1，增加兼容可选字段**
   - 根级增加 `coordinateOrigin?: "top-left" | "center"`；缺失严格解释为 `top-left`。
   - reel per-variant placement 继续只允许 `x/y`，scale 仍属于 unknown key。
   - 新编辑器导出显式写入 `coordinateOrigin`；legacy import 后可 canonical 化。
   - 不引入 `version: 2`，因为两个扩展都有无歧义旧默认；parser 仍拒绝未知值、NaN、零和负 scale。

2. **定义可逆坐标转换，保证切换不跳画面**
   - 对每个 active variant，令 art center 为 `C=(artWidth/2, artHeight/2)`，未缩放 grid size 为 `G`。
   - top-left -> center：
     - image node：`p' = p + scale * imageSize / 2 - C`；
     - Spine/image-string node及 art-space Spine transition：`p' = p - C`；
     - reel：`p' = p + G / 2 - C`。
   - center -> top-left 使用精确逆式；转换必须一次 transaction 覆盖所有 active variant placement。
   - `artSize`、`focusRect`、`frameFocusRect`、`minFocusMargin` 是区域几何，继续保持 top-left rect 表示，不转换。
   - popup placement 已是 viewport center offset，video transition 已是 viewport-space，二者不转换。
   - 任一所需 art size、image size 或 placement 非法时整次切换失败，原项目和 preview 不变。

3. **把坐标语义统一放在 rendercore**
   - `resolveSceneLayoutReelGrid()` 输出最终 top-left `artRect`；fit/focus 校验使用该 rect。
   - runtime 根据 coordinate origin 设置 image anchor/slot 映射；Spine 和 image-string 不伪造 visual bounds 或自动改内部 anchor。
   - package runtime 使用 resolved rect 设置 reel position，不缩放 reel root 或子 symbol。
   - editor 只维护 typed authored data、调用 public resolver/runtime API，不直接操作 production display tree 内部节点。

4. **增加受限的原子几何更新，而非每次重建 runtime**
   - rendercore 提供明确的 `applyGeometryManifest(nextManifest)`（最终命名可按现有风格微调）给 scene/package runtime。
   - API 先 strict parse，并比较 immutable compatibility signature；只允许 coordinate origin、adaptation geometry、node placements、reel placements 变化。
   - node id/order/resource、reel topology/cell/gap、mode/binding/popup/transition topology 等变化必须拒绝该快路径并由 caller 走完整 prepare。
   - commit 后复用 node container、Texture、Spine player、当前 mode、reel object 和当前 scene；失败不得改变旧 manifest/snapshot/display。

5. **以语义 diff 选择刷新级别**
   - 新增纯函数比较前后 project/preview manifest，至少返回 `ui-only | geometry | structural`。
   - selection/details/filter/focus 属于 `ui-only`，不增加 project revision。
   - `geometry` 调用原子几何更新和 `applyViewport()`，重画 guides、红框与可见区斜线；不调用 `validateLayoutAssets()`、`setLayout()`、random source 或 `resetReelScene()`。
   - `structural` 才异步准备新 package/runtime；继续使用 request token，准备成功后一次 commit 并销毁旧 owner。
   - DOM 使用稳定 shell 和 keyed view-model signature，只替换受影响的 outline/Inspector/status；不得把 input focus/selection range、scroll、details open 当成“少刷新”的牺牲品。

6. **红色选中框属于 editor overlay**
   - `LayoutPreview.setSelectedLayer(nodeId | null)` 接受已校验 selection；通过 runtime public node/bounds 能力取得实际 viewport bounds，在独立顶层 `Graphics` 绘制红色矩形，并在 bounds 与渲染区交集内绘制半透明红色斜线。
   - overlay 不写入 manifest/ZIP，不参与 hit test，不改变 mask、node order、runtime visibility 或 symbols。
   - 当前 variant 无 placement、node 非 active/不存在、bounds 为空或 preview 未 ready 时清空红框并给出可测试诊断，不画 `(0,0)` placeholder。

7. **名称修复不增加 editor-only sidecar**
   - export/import 始终把 `node.id` 当图层 identity，把 filename key 与 physical hash payload 分开。
   - 修复任何从 `assets.map.json` physical path、resource hash 或资源注册 key重建 layer label 的路径。
   - ZIP 测试必须断言 physical entry 确实是 SHA-256 path，同时导入后的 node name 和 logical resource label 仍可读；不能通过停用 content addressing“修复”。

## 5. 职责与合同

- **gamelayouteditor model**：拥有 `EditorProject.coordinateOrigin`、坐标转换 command 和 preview change classifier。
- **gamelayouteditor UI**：拥有全局坐标切换按钮、selection session 和分区 DOM 更新；不提供 reel scale。
- **gamelayouteditor preview**：编排 full prepare 与 geometry fast path，拥有红框生命周期；不复制 scene-layout 坐标算法。
- **rendercore scene-layout**：拥有 optional schema/default、坐标解析、reel geometry、runtime placement 和 geometry compatibility/commit。
- **ZIP/import**：只保存 canonical manifest、logical filename map 和精确 hash payload；旧 direct-path/map 包继续走统一 resolver。
- **失败策略**：未知 origin、非法 scale、不可逆转换、fast-path signature 不兼容、缺 node/bounds/asset 都显式失败或清除 selection guide，不猜默认资源或静默降级为 full mutation。
- **禁止行为**：不从 hash/basename 猜 node id；不修改 symbol child scale；不因坐标编辑重新随机；不让 app 直接访问 package runtime 私有 reel/display tree。

## 6. 文件范围

### 预计新增

```text
apps/gamelayouteditor/src/model/coordinate-origin.ts
apps/gamelayouteditor/src/preview/preview-update-plan.ts
apps/gamelayouteditor/src/preview/selection-outline.ts
apps/gamelayouteditor/tests/coordinate-origin.test.ts
apps/gamelayouteditor/tests/preview-update-plan.test.ts
```

最终可合并进同职责现有文件，避免只含少量代码的碎片模块。

### 预计修改

```text
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/editor-store.ts
apps/gamelayouteditor/src/io/imported-layout-zip.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/preview/preview-guides.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/ui/layout-workspace.ts
apps/gamelayouteditor/src/ui/project-workspace.ts
apps/gamelayouteditor/src/ui/ui-session.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/{editor-store,zip-io,layout-preview,app-shell,ui-session,source-boundary}.test.ts
apps/gamelayouteditor/README.md
packages/rendercore/src/scene-layout/{types,manifest,geometry,runtime,package-runtime,index}.ts
packages/rendercore/tests/scene-layout/{manifest,geometry,runtime,package-runtime}.test.ts
docs/scene-layout-manifest.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
```

### 原则上不应修改

```text
packages/rendercore/src/symbol/**
packages/rendercore/src/reel/**
packages/logiccore/**
packages/uiframeworks/**
packages/gameframeworks/**
apps/game002/**
apps/game003/**
assets/**
pnpm-lock.yaml
package.json
AGENTS.md
```

若 geometry API 无法在不修改 reel public API 的情况下整体缩放，或直接 consumer 编译失败，执行前需说明扩大范围原因。

## 7. 实施步骤

1. **确认执行基线与建立回归**
   - 重查 HEAD/status/规则，先为 export -> import 名称、坐标编辑触发 runtime/symbols 重建写失败测试。
   - 记录真实 hash 泄漏发生在 node label、resource label 还是 resolved file key，并只修对应边界。

2. **扩展 scene-layout 兼容合同**
   - 增加 origin 类型/parser/default，保持 reel placement 只允许 `x/y`。
   - 调整 resolver、bounds/focus 校验、runtime image origin 和 package reel root placement。
   - 实现 immutable signature 与 `applyGeometryManifest()` 的 prepare/commit/rollback。

3. **扩展 editor draft 与转换**
   - 新项目默认 `top-left`；legacy manifest 缺字段时补默认。
   - 实现单一坐标转换 command，覆盖普通/背景 node、reel、Spine transition；同步 focus 计算使用 reel bounds。
   - manifest/ZIP round-trip 保留 node id 和 logical keys，canonical export 写新字段。

4. **重构 preview 更新策略**
   - 加入 project semantic classifier；geometry 走 runtime fast path，structural 走现有 async full prepare。
   - 保持 symbols scene/reel/player identity；移除 revision 与 full refresh 的一一绑定。
   - 将 UI session 更新与 project mutation 分离，按稳定 view signature 更新 DOM 区域。

5. **接入产品 UI**
   - 项目级显式按钮显示当前“左上角/中心”，点击确认后执行全量坐标转换并保存。
   - 双背景 main reel Inspector 只保留 landscape/portrait `x/y`，不增加 scale。
   - selection 变化同步红框与可见区斜线；resize、variant、mode、geometry update 后重算，隐藏/无效 selection 清除。

6. **测试、文档与收尾**
   - 完成 parser/geometry/runtime/editor/ZIP/UI/refresh 测试和浏览器人工验收。
   - 更新 manifest 文档、README 和最小领域规则；不修改生成资源。
   - 运行 L2 命令、检查 diff，生成 `tasks/129-gamelayouteditor-preview-coordinate-refresh-<utctime>.md`。

## 8. 测试与验收

### 测试原则

- 以 object identity、mock call count、固定 random source 和视觉 snapshot 数据证明“没有重建/重新抽样”，不只断言最终像素相似。
- 覆盖 top-left/center 双向转换、不同 art size/图片 scale、landscape/portrait 和 legacy 缺字段。
- fast path 必须覆盖成功、非法 signature、apply 失败 rollback、stale request、destroy 后不提交。
- 不放宽 strict unknown-key/path/hash/orphan 检查来通过旧 fixture。

### 验收级别

`L2`。本任务修改 rendercore public scene-layout schema/runtime API、正式 layout ZIP 和直接 consumer gamelayouteditor；范围仍可由这两个 package 界定，不需要 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build
git diff --check
```

### 自动化验收重点

- strict parser：旧字段缺失默认、显式两种 origin、scale 正数、unknown/invalid 失败。
- geometry/runtime：reel rect/guide/focus、image center anchor、Spine authored origin、variant resize。
- import/export：node ids、shared resources、Spine/image/image-string、physical hash 与 logical key 分离、legacy -> canonical -> reimport。
- refresh：selection 和 placement edit 的 `setLayout`/validate/sample/reel-create 次数为零；结构变更只 prepare/commit 一次。
- UI：坐标按钮、无 reel scale 字段、红框/斜线 set/clear、focus/details/scroll 保留。

### 人工验收

1. 在真实浏览器创建双背景项目，导入 image 与 Spine 图层及 symbols package，导出 ZIP 后重新导入；确认 outline/Inspector 名称未变且 ZIP payload 仍是 hash。
2. 选中不同普通图层、切横竖屏/状态并缩放预览；确认红框跟随实际图层，黄绿 guide 不变，隐藏 layer 无假框。
3. 连续只改 x/y，观察 symbols 排列和当前 animation 不重置；确认横竖 reel Inspector 均无整体 scale。
4. 往返切换 top-left/center，确认背景、普通图层、Spine transition 和图标区视觉位置不跳；刷新页面通过重新导入包验证持久化与旧包兼容。

### 独立验收建议

`必须`。涉及 formal scene-layout schema、ZIP、runtime geometry 与资源/reel 生命周期。独立复验高风险点：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 未加载 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`。
- 下载实际失败后才设置现有本地代理并重试原命令。
- 本任务不新增依赖、不修改 workspace 配置或 lockfile。

## 10. 生成物、文档与规则

- 本任务不修改 YAML 或现有 generated resource map，不应产生生成物。
- `docs/scene-layout-manifest.md` 记录 origin、legacy default、坐标/anchor 公式，以及 reel placement 不支持 scale。
- `apps/gamelayouteditor/README.md` 记录坐标切换、无 reel scale、红框/斜线和刷新分级的用户可见行为。
- `docs/agent-rules/scene-layout.md` 最小补充坐标 ownership、reel 不缩放和 geometry update 保留 runtime identity。
- `docs/agent-rules/editor-artifacts.md` 最小补充 logical name 与 hash payload 不得混用；不把具体任务证据写入规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/129-gamelayouteditor-preview-coordinate-refresh-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终文件、关键决策/偏差、实际命令结果、人工验收、剩余风险；不收集整仓 coverage、历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- Spine 动画实时 bounds 可能变化；红框若逐帧取 bounds 需避免额外 layout/GC，若使用稳定 authored bounds 则必须明确与实际可见 bounds 的差异。
- center 模式对 raster image 改为 center anchor，而 Spine/image-string 保持 authored origin/anchor；转换公式若在 scale/variant 上遗漏会造成视觉跳变。
- geometry fast path 若 compatibility signature 漏字段，可能错误复用过期资源；必须采用 allowlist 并让未知差异退回 structural prepare。
- 中心原点转换会改变 authored reel placement 数值；必须保证转换前后视觉位置等价，不自动 fit。

### 假设

- 用户所称图层名称对应 `SceneLayoutNode.id`；资源旁的可读名称对应 logical filename key，二者都不应来自 physical SHA-256 payload path。
- “屏幕中心”在 scene-layout 中指当前 variant 的 art center；DOM page/frame black bar 不改变 authored art-space origin。
- 中心坐标切换要求视觉等价迁移，而不是把所有现有 x/y 强制清零。
- 双背景指现有 `orientation-focus`，单背景指 `maximized-focus`。

### 待确认

无。

## 13. 完成清单

- [ ] 六项需求和非目标均已满足。
- [ ] old/new manifest、ZIP、logical/hash 边界和 direct consumer 兼容已验证。
- [ ] UI-only、geometry、structural 三种刷新路径均有自动化证据。
- [ ] symbols/reel/Spine 资源 identity 与失败 rollback 符合计划。
- [ ] README、manifest 文档和最小领域规则已同步。
- [ ] L2 自动化与真实浏览器人工验收已明确记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对 Git 基线、用户既有修改、Node/pnpm 环境；
3. 先固化名称 hash 和不必要 refresh 的失败测试，再实现合同；
4. 小幅适配当前实现时记录在报告，重大 schema/API/文件范围扩张时先停止说明；
5. 只运行计划规定的 L2 验收，失败先最小化；
6. 完成后生成 UTC 报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
