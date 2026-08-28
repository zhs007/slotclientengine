# 264 popup-landscape-horizontal-centering 任务计划

## 1. 目标与完成定义

### 目标

先纠正 Scene Layout 当前两条适配路径的不一致：无论单背景 `maximized-focus` 还是双 variant `orientation-focus`，logical
viewport 的尺寸、缩放和中心都只能由当前 exact `focusRect`（及显式 margin）和宿主 page aspect 决定；`artSize` 只描述背景
覆盖、authored 坐标和诊断，不得封顶 viewport、把 visible rect 拉回 art 边界或参与居中。随后定位并修复
`/Users/zerro/gitee.com/pixicrave` 中所有 Popup 在横版看起来向右偏移、而竖版水平居中的问题，重点覆盖
`award-celebration`。在 slotclientengine 的本地 `codex/task-264-popup-landscape-centering` 分支完成通用修复和提交，再只把
实际 shared 变更同步到 pixicrave。

### 完成定义

- [ ] Scene Layout 单背景 `maximized-focus` 与 orientation variant 选定后的 focus 投影共享同一无界 contain 合同：实际 focus
      完整可见且取得最大等比 scale；无显式 margin 时至少一轴贴合 page。单独改变 `artSize`、但保持 exact focus/page 不变时，
      `frameDesignSize`、`visibleRect`、`worldOffset` 和 `focusRectInViewport` 均不变化。
- [ ] `artSize` 继续保留在 manifest/snapshot 中用于背景覆盖、authored origin/point 映射和未覆盖区域诊断；viewport/focus/reel
      越出 art 不失败、不裁切、不 clamp、不重新居中，实际黑边、未覆盖或不可见结果交给编辑者判断。
- [ ] orientation variant 仍只由宿主原始 page 宽高选择；正方形保持当前 variant、首次为 landscape。派生 viewport、focus 和
      `artSize` 不反馈参与方向判断，Task 238 已建立的 orientation 行为不得回归。
- [ ] Crave 的 `award-celebration`、普通 Spine Popup `fg`/`congratulations` 与 single-state
      `popup-freegamesadd` 在代表性横版、竖版和正方形 viewport 下，都以宿主可见 viewport 的水平中心为基准；对于 Crave
      当前左右对称 focus，manifest placement `x=0` 时 content authored origin 的屏幕 x 等于 viewport 中线，非零 x 仍只
      产生一次显式偏移。非对称 focus 保留既有 focus 几何语义。
- [ ] 横竖屏 resize、BaseGame/FreeGame mode、Popup 首次 prepare/延迟 prepare/缓存复用不残留旧 viewport 或重复应用
      Scene Layout `worldOffset`；全屏 backdrop 继续覆盖完整宿主 viewport。
- [ ] award、普通 Spine、single-state 三类 Popup 复用同一 presentation/host placement 合同，不在 Crave app 或某个
      award tier 中增加特例、magic offset、方向判断或第二份 placement 表。
- [ ] slotclientengine 在上述本地分支形成一个聚焦提交，至少完成 Scene Layout 无界适配修正；同步后的 pixicrave shared
      源码/测试/必要文档与该提交逐文件一致，Crave app typecheck/build 通过。除非用户后续明确要求，不 push、不创建 PR，
      也不替用户提交 pixicrave 仓库。
- [ ] 如果证据证明 engine 的最终屏幕坐标已正确居中、偏移来自 Popup 内部美术/Spine authored bounds，则不修改通用 engine、
      不直接改 production ZIP；执行报告列出 exact Popup/layer/资源和需从 Popup Editor 重导的修正依据。
- [ ] 自动化几何验收与真实浏览器截图/测量分别完成，生成 UTC 中文执行报告。

## 2. 范围

### 包含

- RenderCore Scene Layout 单背景 `maximized-focus` 和 orientation-focus 的 frame/runtime viewport、visible rect、world offset、
  square variant 与 mode commit 一致性。
- shared unbounded focus projection 与 Scene Layout frame policy；finite art helper只作为兼容回归，不作为 Scene Layout适配入口。
- RenderCore Popup v1 与 v2–v9 presentation 的 viewport、focus、content root、host placement 和 backdrop 几何。
- Scene Layout package runtime 对 award/Spine/single-state Popup 的统一 `applyViewport(viewportSize, placement)` 接线、resize、
  late prepare 和 mode snapshot variant placement。
- Crave 当前 production delivery 中四个 Popup binding/manifest 的只读基线核对，以及真实横竖屏浏览器验收。
- 确认 engine bug 后的 slotclientengine 本地分支/提交，以及实际变更文件到 pixicrave 的最小同步和 byte parity 检查。

### 不包含

- 不删除 manifest/snapshot 的 `artSize`，不改变 authored `top-left|center` 坐标、背景 clip/display、reel/node placement、Anchor
  或 point mapping；“不参与适配”不等于“从数据合同移除”。
- 不全局改写有限 `calculateMaximizedFocusedArtViewport()`；Popup v2 等显式拥有 finite design viewport 的 consumer继续保留
  有界行为，避免把 Scene Layout修正扩大成通用 helper破坏性迁移。
- 不改变 Popup 播放、点击、dismiss、award 金额递增、tier、音频、text width fitting、attachment 或队列状态机。
- 不改变 Scene Layout/Popup manifest schema、placement 单位、资源 closure、delivery manifest、ZIP、YAML 或生成器。
- 不用 `x=-N`、横版 media query、Crave 私有 transform、Spine bounds 反推或某档图片边界补偿 engine 错误。
- 不重导或手改 production 美术；若资源 authored center 有误，必须回到 Popup Editor 的 owner project 修正后正式导出，本任务
  在缺少 owner project 时只报告 exact 证据。
- 不同步整份 RenderCore/其它 packages，不覆盖 pixicrave 的 app-owned drift、`dist/`、`node_modules/`、lockfile 或当前远端新增
  gameplay 修改。
- 不运行整仓发布验收，不 push、不创建 PR；pixicrave 不 commit，除非用户后续明确授权。

## 3. 制定计划时的基线

```text
UTC: 2026-08-28T05:56:21Z

slotclientengine HEAD: 27c33dd41529e4f052e5871e76905ae65bf9b9c7
slotclientengine branch: (detached HEAD)
slotclientengine refs at HEAD: main, codex/task-262-award-popup-runtime-play-options
slotclientengine git status --short --untracked-files=all: clean

pixicrave HEAD: 40be9a33a9041177db98946e3ce017033e40f924
pixicrave branch: master
pixicrave git status --short --untracked-files=all: clean
pixicrave upstream: origin/master, behind 3
pixicrave fetched origin/master: 35a484d
```

实际读取：

```text
AGENTS.md、tasks/templates/task-plan.md
docs/agent-rules/{editor-artifacts,shared-game-runtime,scene-layout}.md
tasks/238-orientation-focus-maximized-focus{,-260821-101755}.md
docs/background-adaptation.md
packages/rendercore/src/popup/presentation.ts
packages/rendercore/src/scene-layout/{geometry,package-runtime,presentation-surface}.ts
packages/rendercore/src/viewport/{focused-art-viewport,responsive-art-viewport,unbounded-focused-viewport}.ts
packages/uiframeworks/src/{frame-host,layout}.ts
packages/rendercore/tests/{popup/presentation,scene-layout/{geometry,package-runtime,coordinate-space}}.test.ts
/Users/zerro/gitee.com/pixicrave/AGENTS.md
/Users/zerro/gitee.com/pixicrave/apps/crave/src/{main,round-adapter,styles.css}
/Users/zerro/gitee.com/pixicrave/assets/crave/delivery.manifest.json、chunks/initial-*.zip（只读）
```

目标目录没有补充 `AGENTS.md`。当前结论：

- Task 238 的 orientation-focus 已先按raw page选variant，再由 `calculateUnboundedMaximizedFocusedViewport()` 只按actual
  focus/margin/page求logical viewport并允许越出art。
- 单背景 `maximized-focus` 的frame/policy/runtime仍调用finite helper；其`normalizeProjectedLength()`以`artSize`封顶，
  `preferArtBoundedOrigin()`优先art边界，与用户确认合同及orientation路径不一致。
- 两份领域规则已允许viewport/focus越出art，但`background-adaptation.md`仍有“按artSize封顶”的冲突旧说明，必须同步收敛。
- `createPopupPresentation()` 对 v2–v9 把 outer container 固定在 `(0,0)`，用 Popup focus 计算
  `contentRoot.position/scale`；v1 继续直接把 container 放在 `viewport/2 + placement`。现有测试覆盖部分横竖 viewport，
  但没有从 Scene Layout host 到最终 global/screen center 对三种 Popup 类型建立同一不变量。
- package runtime的三类Popup都会调用`applyViewport(viewportSize, placement)`；Popup root不应继承layout/camera
  `worldOffset`，late prepare使用缓存的current viewport。Crave把同一frameDesignSize交给renderer和runtime，没有私有横版offset。
- Crave production Layout `coordinateOrigin=center`，BaseGame/FreeGame 都是 maximized-focus；四个 Popup binding 只有
  `default` placement，全部 `x=0`。`award-celebration` 仅有 `y=-64, scale=1.3`，其余为 `y=0, scale=1`。
- 可直接读取的 `award-celebration` v8、`fg` v4 和 `popup-freegamesadd` v8 manifest 都声明对称 Popup focus
  `left=right=540`、`top=bottom=960`；因此当前横版右偏不能合理归因于显式 Layout x 或非对称 focus。
- 两仓Popup presentation当前byte相同，package runtime有无关drift；同步必须按本任务patch，禁止整文件/整目录覆盖。
- Popup v3–v9 已使用 shared unbounded helper，方向符合新 Scene Layout合同；Popup v2因保留 explicit `designViewport` 仍使用
  finite helper。任务不能为了统一 Scene Layout而删除这项版本兼容边界。
- pixicrave 的已获取 upstream 3 个提交只改 Crave gameplay 与 BridgeCore 文件，不改 Popup/RenderCore；执行开始时若仍为 clean
  且仅 fast-forward，可先更新到已获取 upstream，若出现新 drift/冲突则停止同步并报告，不覆盖用户修改。

## 4. 需求解释与技术决策

### 需求解释

1. “Scene Layout不考虑artSize”表示scale/logical viewport/visible rect只消费exact focus、margin、page aspect及orientation
   state；artSize仍是authored坐标/背景coverage元数据，不从schema移除。
2. “水平居中”以可见canvas viewport中线为准；placement相对该中线，`x=0`保护authored origin。runtime不按`getBounds()`猜
   视觉中心，资源不对称回owner authoring修正。
3. 三类Popup必须共同验证，不在Award业务层修特例。Scene Layout有界残留已确认必须修；它是否解释全部Popup偏移仍由global
   transform与真实画面证明。
4. 用户要求的commit只适用于slotclientengine本地任务分支；pixicrave保留可审查未提交diff，不push。

### 关键决策

1. **Scene Layout统一使用无界 focus投影。**
   - single frame、framework policy和runtime projection复用unbounded helper；orientation仍在选定variant后调用同一helper。
   - focus+margin按page contain反推viewport；artSize不参与封顶、origin偏好或方向，snapshot仍原样携带它。
2. **保留 finite helper的明确 consumer。**
   - finite helper保持既有语义，Popup v2继续用designViewport。Scene Layout policy wrapper只委托既有pure unbounded helper，不导出
     新public API、不在三处复制公式，也不持有DOM/Pixi。
3. **先固定最终屏幕中心不变量，再选择 Popup修复层。**
   - pure Popup记录center/content/scale/backdrop，Scene Layout再验证global transform；浏览器覆盖横竖/正方形及live resize。
4. **修最早产生错误坐标的唯一 owner。**
   - Popup focus 投影错误归 `popup/presentation.ts` 或 shared viewport helper；Scene Layout 重复 placement/旧 viewport 归
     `scene-layout/package-runtime.ts`；DOM frame/canvas snapshot 只有在证据表明两者不一致时才升级到 UI framework 范围。
   - 不在下游 app 抵消上游错误，也不同时改多个层制造相互抵消。
5. **保持 manifest/public API 不变。**
   - 预期是内部几何/调用修正与测试补强，不新增 orientation flag、placement 字段、Crave callback 或 Popup schema version。
   - 非零 placement 必须在 base centered transform 之后恰好应用一次；scale 不改变偏移单位或 backdrop。
6. **shared 同步按提交实际 touched files，而不是“替换 RenderCore”。**
   - engine通过后提交实际shared patch；pixicrave有drift时只做最小语义适配并记录，禁止整文件覆盖。
7. **资源问题保持 owner 边界。**
   - 若 content authored origin 已在屏幕中线而肉眼图形仍偏右，使用 layer/Spine slot 的 local bounds 只作为诊断证据；修复
     应由 Popup Editor project 调整 layer transform/focus 并重导，runtime 不保存视觉 bounds 补偿。

## 5. 职责与合同

- **Shared viewport/Scene Layout geometry**：helper拥有focus/margin contain无界投影；geometry选mode/variant并原样保留artSize，不读取
  art边界或复制公式。
- **UI/gameframeworks**：拥有DOM frame、canvas逻辑尺寸、CSS scale/offset和subscription；只应用RenderCore policy，保持renderer、
  runtime viewport与canvas中线一致。
- **Popup core/Scene Layout runtime**：分别拥有content/backdrop transform与binding/placement/cache；Popup root不继承background/reel
  `worldOffset`，不理解Crave业务。
- **Popup package/Editor与Crave**：前者拥有authored origin/layer/美术，后者只提供resource/viewport/业务调用；两者都不建立横版补偿。
- **资源生命周期**：ownership/prepare/cache/reuse/destroy不变；resize失败不得混用新旧viewport形成半提交transform。
- **失败策略**：非法 viewport/placement、destroy 后调用、缺 binding/variant 与 prepare 失败继续显式失败；不加入默认方向、首项
  placement、静默 clamp 或旧 viewport fallback。

## 6. 文件范围

### 预计新增

```text
tasks/264-popup-landscape-horizontal-centering-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/presentation.ts（仅统一Scene Layout后仍确认Popup core有错时）
packages/rendercore/tests/popup/presentation.test.ts
packages/rendercore/src/scene-layout/geometry.ts
packages/rendercore/tests/scene-layout/geometry.test.ts
packages/rendercore/src/scene-layout/package-runtime.ts（仅 host placement/resize/late prepare 是根因时）
packages/rendercore/tests/scene-layout/package-runtime.test.ts（仅对应集成回归）
packages/rendercore/README.md
docs/background-adaptation.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md

/Users/zerro/gitee.com/pixicrave/packages/rendercore/**（只同步上述实际 engine shared 变更）
```

根因可能只需测试暴露后修改其中一条实现路径；未触及的候选文件不因列表存在而修改。

### 原则上不应修改

```text
apps/{game002v2,game003v2,popupeditor,gamelayouteditor}/**
packages/{logiccore,gameframeworks,uiframeworks,audiocore,vnicore}/**
packages/rendercore/src/popup/{award-player,spine-player,single-state-player}.ts
packages/rendercore/src/scene-layout/presentation-surface.ts
packages/rendercore/src/viewport/{focused-art-viewport,responsive-art-viewport}.ts
assets/**
/Users/zerro/gitee.com/pixicrave/apps/crave/**
/Users/zerro/gitee.com/pixicrave/assets/**
/Users/zerro/gitee.com/pixicrave/packages/rendercore/dist/**
AGENTS.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

若证据要求修改shared unbounded helper、uiframeworks、Popup/Scene Layout schema、Popup Editor owner project或production
delivery，属于明显范围扩张；先说明exact缺口和新的consumer/生成器验收，不得直接扩大实现。

## 7. 实施步骤

1. **确认双仓执行基线与真实资源事实**
   - 重核两仓 HEAD/status、engine 当前 main、pixicrave upstream 和本计划；slotclientengine 从执行时确认的基线创建
     `codex/task-264-popup-landscape-centering`，不在 detached HEAD 或 task 262 分支直接提交。
   - pixicrave 若仍 clean、仅落后已获取的 3 个提交且可 fast-forward，则先更新到 `origin/master`；否则保留现场、停止同步并
     报告冲突，不 reset、不覆盖。
   - 从 current delivery ZIP 重新读取 Layout/Popup manifest，确认 exact binding、placement、focus 和版本；不比较未消费资源
     hash，不修改 ZIP。
2. **先锁定 Scene Layout无界适配回归**
   - 为 single `maximized-focus` 增加成对fixture：相同 page/focus、不同小/大/偏移 artSize，断言frame与scene的
     `frameDesignSize/visibleRect/worldOffset/focusRectInViewport`逐项相等；focus或显式margin改变时结果才改变。
   - 覆盖 focus完整在art内、部分/全部越出art、logical viewport大于art、超宽/超高page与非法focus/page；越出只产生真实未覆盖
     几何，不失败、不clamp。
   - 保留Task 238 orientation回归：raw page选variant、square连续性、actual focus最大contain，并新增同focus不同artSize不变断言。
3. **统一 Scene Layout frame/runtime/policy实现**
   - 把single `resolveSceneLayoutFrameViewport()`与`resolveSceneLayoutViewport()`迁移到既有shared unbounded projection；
     `createSceneLayoutFramePolicy()`用内部wrapper委托同一helper，orientation路径保持复用且不复制数学。
   - snapshot继续返回manifest exact artSize；background/node/reel authored映射仍只使用art坐标与unbounded visibleRect，未覆盖区域
     如实呈现。finite helper及Popup v2测试保持原样，证明兼容consumer未变。
   - 更新README、背景适配文档和两份领域规则，删除/改写Scene Layout“按artSize封顶/优先art边界”旧说明，明确artSize只描述
     coverage/authored geometry。
4. **在统一Scene Layout基准上诊断并修复Popup**
   - 扩充 Popup presentation 表驱动测试：v1、v2、v3+ 对称 focus，landscape/portrait/square，placement `x=0` 与非零 x；
     断言 authored origin、focus rect、scale、outer/content transform 和 backdrop。
   - 在 Scene Layout fixture 统一准备具有 Crave 同款对称 focus 的 award/Spine/single-state，验证 resize、mode、late
     prepare/cache 后三者 global x 都满足 `viewport.width/2 + placement.x`，且 layout `worldOffset` 不进入 Popup root。
   - 在 Crave 浏览器输出一次只读诊断：page/frameDesign/canvas backing、Popup local/global transform 和 visual bounds；用横版、竖版、
     正方形及横→竖→横resize截图。若统一Scene Layout后仍有engine偏移，只修最早错误owner：Popup focus投影归presentation，
     host旧viewport/重复placement归package runtime；资源visual center错误转为owner-project重导结论。
   - 所有候选几何先完整验证再原子提交container/contentRoot/backdrop transform；保持非对称focus、v2 design viewport和v1 legacy。
5. **验证 engine 并提交本地分支**
   - 运行第8节 engine 定向测试/typecheck和 diff检查；复查没有 Crave常量、方向特例、schema/asset/lockfile变化。
   - 在 `codex/task-264-popup-landscape-centering` 只stage本任务文件，创建一个说明Scene Layout无界适配与Popup居中的本地
     commit；记录commit id，不push、不合并main。
6. **最小同步到 pixicrave并做 consumer验收**
   - 以 engine commit touched-file清单为准同步 shared patch；对无 drift 文件做 byte parity，对有 drift 文件做最小语义适配并
     记录差异，绝不复制 `dist/node_modules` 或整份 package。
   - 运行 pixicrave RenderCore+Crave typecheck、Crave build与真实横竖屏复验；确认四类 Popup、Base/Free模式、resize及 backdrop。
   - pixicrave 保持可审查工作区 diff且不 commit；生成 UTC 报告，记录 engine commit、同步文件、parity、自动化结果、截图与
     未完成的 owner-resource事项。

## 8. 测试与验收

### 测试原则

- Scene Layout核心不变量是：固定page/focus/margin时任意合法artSize得到同一viewport投影；固定artSize/page时改变focus才改变
  投影。测试必须直接比较frame policy与runtime snapshot，不能只看最终CSS宽高。
- orientation必须分别断言raw page方向、selected variant、square previous variant、logical viewport与CSS scale；派生尺寸和artSize
  不得反馈选方向。
- 用确定性数值保护 viewport center，不以肉眼截图替代坐标测试；截图负责证明真实 canvas/CSS/美术组合的最终效果。
- Popup test 覆盖宽屏、窄屏、正方形、连续 resize、zero/nonzero placement、symmetric/asymmetric focus、v1/v2/latest；非对称 focus
  仍按 authored focus几何计算，不被强制视觉居中。
- Scene Layout test 让三类 Popup经过真实 package runtime接线，并覆盖 init时已准备与 delivery late prepare；不能只 mock一个
  `Container.position` 断言。
- 若实现采用共享 helper，覆盖 invalid viewport/placement、destroy和candidate失败保留旧稳定 transform；不为错误旧测试扭曲
  生产合同。
- engine 提交前检查本仓库，外部同步后检查 pixicrave；失败先缩小到 pure Popup、Scene Layout host、UI frame或资源 authored
  bounds，不立刻跑整仓。

### 验收级别

`L2`。修改 RenderCore Scene Layout public frame policy的可观察行为并同步给外部直接consumer pixicrave，同时影响
Game Layout Editor/gameframeworks的viewport结果；需要证明producer几何、直接consumer编译和真实浏览器效果。不改schema、根工具链、
lockfile或正式交付物，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/viewport/unbounded-focused-viewport.test.ts tests/viewport/responsive-art-viewport.test.ts tests/viewport/focused-art-viewport.test.ts tests/scene-layout/geometry.test.ts tests/popup/presentation.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter @slotclientengine/gameframeworks typecheck
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter @slotclientengine/rendercore --filter crave typecheck
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter crave build
git diff --check
git -C /Users/zerro/gitee.com/pixicrave diff --check
```

若 Popup最终无需生产修复，可从第一条删除`package-runtime.test.ts`但保留`presentation.test.ts`作为shared unbounded兼容保护；finite
focused测试必须保留，证明Popup v2等consumer未被全局改写。shared patch的engine测试不在pixicrave重复全跑，以byte parity + external
typecheck/build + 浏览器验收覆盖consumer。命令保持6条，不运行根级全量任务。

### 人工验收

1. 在Game Layout Editor或同一production core runtime中，用single maximized-focus布局切换相同focus、明显不同artSize，确认focus
   guide/canvas logical viewport完全不动，只有背景coverage/art九宫格位置变化；超宽/超高viewport允许显示未覆盖区域。
2. 对orientation布局连续切换landscape、portrait、near-square、square，确认raw page选择与Task 238结果保持，修改artSize不改变
   已选variant的focus缩放/中心。
3. 在真实 Crave production delivery 下分别打开 `award-celebration`、`fg`、`congratulations`、
   `popup-freegamesadd`；至少使用 `1920×1080` 横版、`390×844` 竖版和 `1000×1000` 正方形。
4. 每种尺寸记录 canvas可见矩形中线、Popup authored origin/global x 和截图；`x=0` 必须落中线，award `y=-64/scale=1.3`
   只影响纵向/缩放，不能造成水平偏移。
5. 在 Popup active期间执行横→竖→横 resize，并在 BaseGame/FreeGame各验证一次；不能先右偏后回正、复用旧 viewport或发生双偏移。
6. backdrop四边覆盖完整 canvas；Popup content centered transform不受 backdrop、camera、layout `worldOffset` 或 UI overlay影响。
7. 若坐标中线正确但视觉仍偏，标注 exact layer/Spine local bounds相对 authored origin的差值，作为 Popup Editor owner修正证据，
   不把该 case宣布为 engine验收通过后的自动修复。

### 独立验收建议

`建议`。涉及跨仓shared几何与production美术，但不涉及credential、服务器数据、schema或新ownership。独立复验RenderCore的
unbounded/responsive/geometry/Popup四组测试，以及pixicrave RenderCore+Crave typecheck和Crave build。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只运行 `CI=true pnpm install --frozen-lockfile`；下载真实失败后才设置约定代理重试。
- 不新增依赖、不修改 lockfile。浏览器诊断使用现有 Crave dev/build入口和 production delivery。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、generated TypeScript、delivery manifest或 production ZIP，不运行资源生成器。
- RenderCore README与`docs/background-adaptation.md`必须明确：Scene Layout用focus/margin/page做无界投影，artSize只描述coverage与
  authored坐标；删除“超出轴按artSize封顶”等冲突旧说明。Popup placement文档只在需要时澄清。
- `shared-game-runtime.md`与`scene-layout.md`补足同一稳定职责合同，并保留orientation raw page/square规则；具体Crave尺寸、截图、
  commit和偏移数值只进入执行报告。
- pixicrave 的 `dist/` 已被 ignore，不能把本地 build产物作为同步文件或 runtime合同。

## 11. 执行报告

执行完成后以`date -u +%y%m%d-%H%M%S`创建`tasks/264-popup-landscape-horizontal-centering-<utctime>.md`，简要记录根因、
实际文件、engine分支/commit、pixicrave同步/parity、自动化、浏览器截图/测量、偏差和剩余风险；不收集无关coverage/历史/profiler。

## 12. 风险、假设与待确认

### 风险

- 单背景Scene Layout从finite迁移到unbounded后，超宽/超高页面可能得到更大的logical viewport和真实未覆盖区域；这是合同要求，
  但依赖旧art cap掩盖背景不足的项目会出现可观察变化，必须通过Editor guide而非fallback暴露给作者。
- finite helper仍被Popup v2等consumer使用；若为省事全局改写它，会造成不必要兼容回归，必须用focused helper测试阻止。
- Popup authored origin居中不等于美术 alpha/Spine visual bounds的视觉中心；必须同时报告数值中心与肉眼结果，不能互相冒充。
- pixicrave RenderCore与 engine已有无关 drift，整文件覆盖可能回退当前游戏所需能力；同步必须以本任务commit的最小 patch为准。
- pixicrave 当前 master落后 upstream 3个 gameplay提交，其中包含 `round-adapter.ts`；虽然未触及 shared Popup，执行时仍必须在
  fast-forward后重新做 app typecheck/build，不能用规划时 clean状态代替。
- 浏览器 Popup播放依赖真实资源加载、ticker和可触发业务路径；若服务器流程不可稳定触发，允许使用同一 production
  `SceneLayoutPackageResource` 的本地诊断入口主动打开 exact Popup，但不能替换最终真实游戏截图。

### 假设

- 用户已确认Scene Layout适配不以artSize约束viewport；artSize仅为background coverage/authored geometry输入，这是本任务权威合同。
- 当前 production delivery 仍是任务规划时读取的 Layout v5与四个 Popup binding；资源更新时以新manifest为权威小幅适配。
- 横版“偏右”指 Popup内容相对可见 canvas中线，不是相对 reel/focus区域或被左侧HUD占用后的主观剩余区域。
- 用户要求本地提交仅针对 slotclientengine；pixicrave同步默认保留未提交工作区diff供用户审查。

### 待确认

无。若执行证据证明用户所指中心是 reel/focus区域而非canvas viewport中线，该语义会改变manifest placement合同，必须先停止并
向用户确认，不能自行改写本计划目标。

## 13. 完成清单

- [ ] single/orientation Scene Layout都只按focus/margin/page投影，artSize不改变viewport结果。
- [ ] artSize继续正确服务background coverage、authored坐标与诊断，finite helper兼容consumer未回归。
- [ ] 三类 Popup与 Crave四个实际binding都满足横/竖/正方形居中合同。
- [ ] 根因只在唯一owner修复，没有app magic offset、资源猜测或重复状态。
- [ ] engine本地任务分支/commit已创建并记录；未push/未合并main。
- [ ] pixicrave只同步实际 shared变更，drift/parity与未提交状态已记录。
- [ ] public API/schema、资源和生命周期保持计划边界。
- [ ] 指定自动化验收与真实浏览器验收通过并明确区分。
- [ ] diff、文档/规则和 UTC中文执行报告已收尾。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对双仓 Git基线与工作区，安全处理 pixicrave fast-forward；
3. 在 slotclientengine创建 `codex/task-264-popup-landscape-centering` 并按证据实现，不重新制定另一套方案；
4. 必须先完成Scene Layout无界适配合同；Popup只在统一基准后按证据修复，资源问题保持owner边界并报告；
5. engine定向验收通过后再提交并同步 pixicrave，重大范围扩张先停止说明；
6. 只运行计划规定的 L2验收，不把自动化冒充人工浏览器结果；
7. 完成后生成执行报告；
8. 只提交用户明确要求的 slotclientengine本地分支，不push、不创建PR、不提交 pixicrave。
