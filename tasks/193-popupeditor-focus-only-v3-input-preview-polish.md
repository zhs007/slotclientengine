# 193 popupeditor-focus-only-v3-input-preview-polish 任务计划

## 1. 目标与完成定义

### 目标

把 Popup 新 authoring 收敛为只由重点区域驱动的无界坐标适配：项目不再配置有限
`designViewport`，重点区域以 Popup 原点为基准定义必须可见的有限范围，runtime 按宿主 viewport
比例显示重点区域并允许在其它方向看到额外的无界 authored space。

同时修复 Popup Editor 首页入口尺寸、预览背景和表单键盘输入问题；新增 Popup manifest v3，
新建项目直接使用 v3，导入 v1/v2 项目 ZIP 时在严格校验后自动、原子迁移到 v3。

### 完成定义

- [ ] Popup v3 manifest 不包含 `designViewport`；`adaptation.focus.left/right/top/bottom` 都是正有限数，
      不再受任何画布宽高上限约束，unknown/残留 `designViewport` 仍按 strict schema 失败。
- [ ] v3 以 authored 原点 `(0,0)` 和 focus extents 构造重点矩形；任意宿主 viewport 下重点区域完整可见，
      页面比例需要的额外范围可向重点区域外扩展，不因有限 art bounds 裁切或钳制。
- [ ] 对称 focus 的中心映射到宿主 viewport 中心；非对称 focus 的几何中心映射到宿主 viewport 中心；
      host `x/y/scale` 仍叠加到内容矩阵，backdrop 仍独立覆盖整个宿主 viewport。
- [ ] rendercore 继续原样解析、播放 v1/v2；v1 仍使用旧 center-origin placement，v2 仍使用
      `designViewport + focus` 的有限画布算法，不改变历史 package runtime 结果。
- [ ] Popup Editor 创建 award 或 Spine 项目时默认得到 canonical v3，项目页不再显示 viewport width/height，
      也不再提供手动升级按钮。
- [ ] 导入合法 v1/v2 Popup ZIP 时自动迁移到 v3：v1 用 `designViewport` 的四个半边生成 focus，v2 原样保留
      focus；旧 prompt、layer alpha、name/backdrop 等按既有升级合同规范化。迁移失败时不打开半迁移项目。
- [ ] 导入后的下一次 preview/export 只生成 v3；原 ZIP bytes 不被改写，资源 filename key、hash、closure、
      layer 坐标、order、动画和类型专属字段保持不变。
- [ ] 首页“创建项目”和“导入项目”入口有相同的可视高度、内边距、对齐与交互状态，隐藏 file input
      不再造成 label 与 button 尺寸差异。
- [ ] preview-only 背景持续按红 -> 蓝 -> 黄 -> 绿 -> 红平滑循环；背景不进入 project、manifest、ZIP、
      Pixi player 或 production runtime，50% backdrop 仍可在其上观察。
- [ ] 当焦点位于 input、textarea、select、button 或 contenteditable 内时，键盘事件不触发 Popup
      advance/dismiss、不被 preventDefault，文本和数字输入可正常编辑；canvas pointer 与非表单区域键盘输入保持现状。
- [ ] L2 定向验收通过并生成 UTC 中文执行报告；真实浏览器中的颜色循环、入口尺寸与输入连续性完成验收，
      或在报告中明确列为待验。

## 2. 范围

### 包含

- `packages/rendercore/popup` 的 v3 types、strict parser、focus-only presentation、输入过滤 public contract。
- `packages/rendercore/viewport` 的无有限 art bounds、focus-only maximized viewport 纯几何算法；Popup presentation
  只消费该算法，不复制第二套坐标计算。
- `apps/popupeditor` 的 canonical v3 draft、v1/v2 自动迁移、项目表单、首页入口、动态背景与 keyboard filter 接入。
- Game Frameworks 的 v3 type re-export，以及 Game Layout Editor、Scene Layout package runtime、
  Game Layout package CLI 对 v3 Popup 的解析、vendoring、filename-key rewrite 和闭包保护。
- 定向单测、README、Popup manifest 文档和最小领域规则更新。

### 不包含

- 不删除 v1/v2 parser、types、player 或历史 runtime 行为；不批量重写仓库内既有 Popup ZIP/fixture/production assets。
- 不移除预览侧栏的目标分辨率、custom width/height、zoom 或 guides；这些是宿主 viewport 调试参数，
  不是 Popup 项目的 `designViewport`。
- 不改 layer 自身 `x/y/scale/rotation/anchor/order`，不增加拖拽、无限画布编辑器、缩放手柄或坐标平移工具。
- 不改变 award tier、金额格式、Spine start/loop/end、prompt-to-text、字体、VNI、ImgNumber 或资源导入合同。
- 不把动画背景导出为 resource/backdrop，不新增图片或依赖，不修改 lockfile、YAML、生成物或游戏业务代码。
- 不让导入忽略 invalid v1/v2；自动迁移发生在原版本 strict parse、map/hash/closure 校验和可选 prepare 成功之后。

## 3. 制定计划时的基线

```text
UTC: 2026-08-11T04:17:29Z
HEAD: c401d4656e145f257955839a5c847aeb2a14181f
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
tasks/191-popupeditor-centered-adaptation-font-text-editing.md
tasks/191-popupeditor-centered-adaptation-font-text-editing-260810-082911.md
docs/popup-manifest.md
apps/popupeditor/{README.md,package.json}
packages/rendercore/{README.md,package.json}
apps/gamelayouteditor/package.json
apps/gamelayoutpkgcli/package.json
```

目标目录没有补充 `AGENTS.md`。规划会话没有运行构建或测试。当前结论：

- `PopupManifest` 目前只有 v1/v2；两版都有 required `designViewport`。v2 parser 的
  `parseAdaptation()` 还强制四个 focus extent 不超过对应 viewport 半边，因此不能表达无界 authored space。
- `createPopupPresentation()` 只对 v2 建立 focus/backdrop presentation，并把 focus 转成有限 art-space rect 后调用
  `calculateMaximizedFocusedArtViewport()`；该通用算法按 `artSize` 钳制 projected visible rect。
- Popup Editor draft 的 `formatVersion` 仅为 `1 | 2`，创建默认 v2；项目页仍编辑 viewport width/height，
  v1 仍显示“升级为 v2”按钮。`importPopupZip()` 当前把 source version 保留在 draft，只有 v2 legacy prompt 自动迁移。
- v1 -> 新合同可无坐标改写地迁移：旧 `designViewport.width/height` 的一半分别成为 left/right/top/bottom；
  v2 已有 focus，可直接保留。两版 layer 都以 Popup 中心为原点，不需要移动 layer transform。
- `PopupPreview.init()` 把 `window` 作为 `keyboardTarget`；rendercore input binding 在 capture 阶段消费播放中的所有
  non-repeat `keydown`。因此 input 获得焦点时，事件在到达输入框前已被 advance/dismiss、preventDefault 和
  `stopImmediatePropagation()`。
- 首页用原生 `button` 表示创建、用 `label.file-action` 包裹隐藏 file input 表示导入；二者虽然共享 padding，
  但 display/line box 与原生控件基线不同，没有共同的入口布局尺寸合同。
- Preview 已使用透明 Pixi canvas 和宿主 `.popup-preview-gradient`；当前只是固定 radial/linear gradient，适合直接替换为
  preview-only CSS color cycle，无需修改 player 或 manifest。
- Game Layout Editor、Scene Layout package resource 和 Game Layout package CLI 都调用 rendercore strict parser；
  CLI filename-key rewriter 通过 spread 保留 manifest 的 versioned 公共字段，但当前没有 v3 fixture 保护。
- Game Frameworks 显式 re-export `PopupManifestV1/V2` 与 `SpinePopupManifestV1/V2`，新增 v3 后必须同步 public type surface。
- 任务 191 报告记录了当时的自动验收与两个既有 fixture 问题；它是历史证据，不替代任务 193 执行时的当前复验。

## 4. 需求解释与技术决策

### 需求解释

- “viewport 可以不用配置”指移除 Popup 项目/manifest 的 authored `designViewport`，不指移除 runtime 调用者提供的
  实际 viewport，也不指移除 Editor 的预览分辨率控件。
- “viewport 可以无限大”解释为 authored 坐标平面没有有限边界；manifest 不保存 `Infinity` 或任意超大占位数。
  focus 始终是有限、正面积的适配合同，layer 可位于 focus 外任意有限坐标。
- “用重点区域来适配”采用 maximized-focus 语义：先 contain 整个 focus，再把宿主 page aspect 投影回 authored
  space；较宽/较高一轴显示 focus 外的额外无界内容，从而填满宿主 viewport，不制造项目画布黑边。
- “以前版本”覆盖 v1 和 v2。导入自动迁移只改变 Editor 内存 draft 和后续 v3 导出，不改变 runtime 对旧 ZIP 的支持。
- “新版本”定义为 v3，而不是原地改变 v2 schema；否则已交付的 v2 相同 version 会出现两种不兼容结构。

### 关键决策

1. **新增 strict Popup v3**
   - `PopupManifestBaseV3` 保留 v2 的 `name/adaptation/backdrop/resources`，删除 `designViewport`；两种 popup type
     继续使用互斥内容 schema，layer alpha/text 等 v2 能力在 v3 保持 required/canonical。
   - parser 按 exact version 选择 allowed keys。v1/v2 继续要求 `designViewport`；v3 明确拒绝它，禁止 optional 双形态、
     超大默认 viewport 或 silent alias。
2. **无界 focus 使用一套纯几何算法**
   - focus rect 为 `x=-left, y=-top, width=left+right, height=top+bottom`；
     `focusScale=min(page.width/focus.width, page.height/focus.height)`，visible rect 使用 page aspect 并以 focus 几何中心居中。
   - v3 content origin、focus guide 和 snapshot 全部从同一 visible rect -> page matrix 得出；host placement 最后叠加。
   - v2 保留有限 `artSize` 分支，v1 保留现有 center placement；不得为了 v3 改写 shared v2 数学结果。
3. **Editor 永远 author canonical v3**
   - `PopupEditorProject.formatVersion` 收敛为 `3`，移除 draft `designViewport` 和 upgrade UI；create factory 只创建 v3。
   - import 先保留 source manifest 进行完整校验，再由一个 typed migration transaction 生成 v3 draft：v1 生成对称 focus，
     v2 保留 focus，二者补齐 canonical name/backdrop/alpha，并复用现有 prompt migration。
   - prompt name/order collision、非法 layer 或 prepare failure 使整次导入失败；不保留可编辑的 v1/v2 半成品，也不猜测新名称。
4. **表单键盘事件在宿主边界过滤**
   - rendercore input binding 增加显式 keyboard-event eligibility/filter contract，并在 dispatch 前检查；默认 player 分派、
     handled completion 与 destroy 语义不变。
   - Popup Preview 用 `event.composedPath()` 识别 input/textarea/select/button/contenteditable 等交互控件；这些事件透传，
     非控件键盘事件继续走 production advance/dismiss。过滤逻辑不通过 CSS class、activeElement 猜测或临时解绑实现。
5. **入口尺寸使用共同组件样式**
   - 首页新增 actions 容器和统一 action class；button 与 file label 都使用 `inline-flex`、相同 min-height、padding、
     line-height、align-items/justify-content 和 box sizing，保留 file input 的可访问 label 点击与 focus ring。
6. **动态背景只由 CSS 宿主拥有**
   - `.popup-preview-gradient` 改为命名 keyframes，稳定经过红、蓝、黄、绿并回到红，使用平滑线性插值和无限循环。
   - Preview init/destroy 继续只添加/移除 class；rebuild 不重启动 Pixi Application、不写项目状态，也不创建 ticker/RAF 动画。

## 5. 职责与合同

- `rendercore/viewport` 拥有 focus-only page projection；`rendercore/popup` 拥有 versioned manifest、presentation matrix、
  backdrop、input dispatch 和 snapshot；Popup Editor 只拥有 draft/migration/UI 与独立 preview canvas。
- v3 `focus` 是 authored origin 周围的四个正有限 extent，不是资源 bounds、裁切区或隐式 viewport；focus 外 layer 合法，
  但 runtime 是否可见只由宿主 aspect、focus matrix 和显式 host placement 决定。
- v1/v2 package bytes 继续是合法 runtime 输入；Popup Editor import 的 validate/prepare 是迁移前置条件，v3 draft 只在全部
  步骤成功后 commit。失败时保留当前已打开项目、preview player 和宿主 canvas。
- 资源 map、hash、closure 与 owner refs 在版本迁移中不变；迁移只改 Popup manifest-owned version/presentation 字段及既有
  typed prompt/alpha normalization，不重新 hash 未改变的 payload。
- keyboard filter 只决定事件是否有资格进入 popup dispatch；eligible 事件仍由 player phase 决定 handled/unhandled。
  禁止 app 复制 award/Spine 状态机或用全局 `keydown.stopPropagation()` 掩盖问题。
- version、focus、旧 prompt、资源或迁移冲突显式失败；禁止无限数值、magic art size、首项默认、静默降级或旧版原样 authoring。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/viewport/unbounded-focused-viewport.ts
packages/rendercore/tests/viewport/unbounded-focused-viewport.test.ts
tasks/193-popupeditor-focus-only-v3-input-preview-polish-<utctime>.md
```

若现有 viewport 文件可在不混淆有限/无界合同的前提下容纳新 helper，可不新增前两个文件；不能把 v3 算法复制到 Editor。

### 预计修改

```text
packages/rendercore/src/viewport/index.ts
packages/rendercore/src/popup/{types,manifest,presentation,input-binding}.ts
packages/rendercore/tests/popup/{manifest,presentation,input-binding,package-resource}.test.ts
packages/rendercore/README.md

packages/gameframeworks/src/index.ts

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/popup-zip.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/styles.css
apps/popupeditor/tests/{project,preview,app-shell}.test.ts
apps/popupeditor/README.md

apps/gamelayouteditor/tests/{popup-package,zip-io}.test.ts
apps/gamelayoutpkgcli/tests/{reference-rewriter,asset-groups}.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts

docs/popup-manifest.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

只有 v3 暴露出实际 type narrowing 问题时才修改 Game Layout Editor/CLI production source；当前 spread/reparse 路径原则上
应直接保留 v3 字段，不为测试制造无意义分支。

### 原则上不应修改

```text
apps/{game002,game002v2,game003,gameviewer,gameviewer2}/**
apps/gamelayouteditor/src/**
apps/gamelayoutpkgcli/src/**
packages/{logiccore,uiframeworks,vnicore,editorresource,browserartifactio}/src/**
packages/rendercore/src/{background,reel,symbol,scene-layout}/**
assets/**
package.json
pnpm-lock.yaml
AGENTS.md
```

若 v3 type union 迫使直接 consumer source 修改，执行前应说明精确 narrowing/parity 原因；不得顺手改写 Scene Layout 或游戏业务。

## 7. 实施步骤

1. **确认执行基线并先固定失败用例**
   - 重新核对 HEAD、工作区、v1/v2 parser 与任务 191 后的代码，确认没有影响本计划的并行变化。
   - 为 v3 no-`designViewport` parser、无界对称/非对称 focus、旧版本 runtime 不变、输入控件 keydown 透传、
     新建/导入 v3 和入口结构先添加最小失败测试。
2. **实现 v3 manifest 与 focus-only presentation**
   - 在 rendercore 增加 v3 types/overloads/strict key validation，并把 layer/prompt规则按 version 明确分支；v3 不接受 legacy prompt。
   - 实现无界 focus geometry helper，接入 Popup presentation，输出一致的 `contentScale/contentPosition/focusRectInViewport`；
     保持 v1/v2 分支和 backdrop/placement 生命周期不变。
   - 同步 popup exports 与 Game Frameworks v3 type re-export。
3. **收敛 Editor create/import/export**
   - 把 Editor draft/factory/project-to-manifest 收敛为 v3，删除 `designViewport`、旧 version UI 与手动 upgrade handler。
   - 重构 `importPopupZip()`：source v1/v2/v3 均先 strict validate/map/closure/prepare，再构建 canonical v3；复用原子 prompt
     migration 和 alpha normalization，确保 preview/export round-trip 只输出 v3。
4. **修复输入和界面细节**
   - 给 rendercore binding 增加 keyboard eligibility callback并补 dispose/handled/unhandled 测试；Popup Preview 过滤表单与
     contenteditable composed path，验证播放中输入事件不再被消费。
   - 为首页两个入口增加共同结构/样式；把固定 preview gradient 替换为红蓝黄绿循环 keyframes，保持透明 canvas 与 class cleanup。
5. **保护直接 consumer 与文档合同**
   - 为 Game Layout Editor 导入/vendor、Scene Layout package prepare、CLI reference rewrite/asset grouping 添加最小 v3 fixture，
     证明 `designViewport` 不被补回、focus 与资源引用保持 exact。
   - 更新 Popup/Rendercore README、`docs/popup-manifest.md` 和两份领域规则，明确 v3、新建/自动迁移、旧 runtime 与输入边界。
6. **定向验收与报告**
   - 按第 8 节运行 L2 命令，先最小化任何失败并区分本任务与既有 fixture 问题。
   - 完成浏览器验收后生成 UTC 中文执行报告；不把执行证据追加到规则或 runtime 文档。

## 8. 测试与验收

### 测试原则

- parser 覆盖合法 v3、v3 残留 `designViewport`、缺 focus/非法 extent/unknown version，并保留 v1/v2 fixture。
- geometry 使用精确对称与非对称矩阵覆盖 portrait/landscape/square；同时断言 focus 完整可见、extra authored space
  无 art clamp、backdrop 全屏、placement 叠加和 destroy 幂等。
- migration 分别覆盖 v1 award、v1 prompt Spine、v2、v3 round-trip；校验 source validation 先于迁移、冲突不 commit、
  assets/map/hash/closure 不变和导出只为 v3。
- 输入测试必须从真实 input 子节点冒泡到 window capture binding，断言 dispatch 未调用、event 未 prevent；另保留 canvas、
  非表单 keydown、repeat、idle、playing 与 dispose 测试。
- CSS 动画与实际视觉尺寸以浏览器人工验收为准；DOM 测试只保护 class、共同 action 结构与 preview init/destroy，
  不用 happy-dom computed style 冒充视觉验收。

### 验收级别

选择 `L2`：修改 rendercore Popup public versioned schema、Game Frameworks type export 和正式 Popup ZIP，并影响
Game Layout Editor、Scene Layout runtime 与 package CLI 直接 consumer；不涉及根工具链、lockfile或大规模跨包重构，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/viewport/unbounded-focused-viewport.test.ts tests/popup/manifest.test.ts tests/popup/presentation.test.ts tests/popup/input-binding.test.ts tests/popup/package-resource.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/preview.test.ts tests/app-shell.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/asset-groups.test.ts
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter popupeditor build
git diff --check
```

共 7 条是因为 v3 同时改变 shared parser、Editor 正式导出和两个相互独立的 ZIP consumer；前四条分别提供算法/parser、
authoring/migration、Layout vendoring、CLI rewrite/grouping 证据，第五条保护 public type union，第六条验证浏览器 bundle，最后一条
检查所有文本改动。它们不替换为整仓 test/build。

### 人工验收

- 新建 award 与 Spine 项目，确认项目页显示 v3、没有 viewport width/height 或 upgrade 按钮，focus 可直接输入大于旧
  `1080x1920` 半边的值并正常 preview/export。
- 分别导入一个 v1 和 v2 ZIP，确认提示已自动转为 v3、资源/层坐标未变、下一次导出 manifest 为 v3 且无
  `designViewport`；再把导出 ZIP 导入 Game Layout Editor 并预览。
- 在播放中的 text/number/color 输入框连续输入、退格、方向键和 Enter，确认不会 advance/dismiss；点击 canvas 与焦点不在
  表单时按键仍触发原有交互。
- 观察预览背景持续平滑经过红、蓝、黄、绿并回到红；打开 50% 黑色 backdrop 后仍能看出颜色与 viewport 边界。
- 在同一浏览器缩放下比较“创建项目”“导入项目”的高度、padding、文字基线、hover、pressed 与 keyboard focus。

### 独立验收建议

`建议`。原因是正式 Popup schema/ZIP 从 v2 升到 v3并影响多个 consumer。独立复验重点：

1. v1/v2 runtime parser/player 结果不变，Editor import 才自动迁移；
2. v3 ZIP 经 Game Layout Editor 和 CLI rewrite 后仍无 `designViewport`，focus 与 hash closure 不变；
3. 播放中表单 keydown 透传，但非表单键盘与 canvas pointer 仍只分派一次。

最多复验前三条定向 test 命令中的 rendercore、popupeditor、gamelayouteditor 命令。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试原命令。
- 本任务不需要新依赖或 lockfile 修改。focus geometry 使用纯 TypeScript，颜色循环使用 CSS keyframes，输入过滤使用现有 DOM Event。

## 10. 生成物、文档与规则

- 本任务没有 YAML 或生成文件；不得手改 `dist/` 或提交 build 输出。
- `docs/popup-manifest.md` 升级为 v1/v2/v3 合同，明确 v3 无界 focus、旧版 runtime、Editor 自动迁移与 canonical 示例。
- Popup Editor/Rendercore README 记录用户工作流与 public API；Game Frameworks 只同步 type export，不复制 schema 文档。
- 更新 `editor-artifacts.md` 中“显式升级 v2”的旧规则为“新建与旧 ZIP 导入 canonical v3”，并在
  `shared-game-runtime.md` 记录 v3 focus-only presentation；根 `AGENTS.md` 不变。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/193-popupeditor-focus-only-v3-input-preview-polish-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 v3/migration/UI/input 实现、实际文件、计划偏差、
验收命令结果、浏览器验收、既有失败与剩余风险；不收集无关 coverage、全仓统计或历史矩阵。

## 12. 风险、假设与待确认

### 风险

- v3 是正式 schema 变化；任何直接 consumer 若按 `version === 2` 才启用 backdrop/focus/alpha，会在编译或定向测试中暴露，
  必须修正为显式 version union，而不能把 v3 当 v2 alias。
- v1 prompt 自动迁移可能遇到 `id/name=prompt` 或 order 冲突；按现有 strict 合同整次导入失败，不能自动 rename。
- 无界 focus 会让 focus 外 layer 在宽/高屏显示更多区域，这是需求语义；现有内容若依赖旧 designViewport 边缘裁切，
  自动迁移后的 Editor preview 可能与旧 runtime 不同，应在导入提示和报告中明确这是升级结果。
- CSS 动画、原生 file label 基线和键盘默认行为依赖真实浏览器，单测/构建不能替代人工验收。

### 假设

- authored 原点继续是 Popup `(0,0)`，focus 四个 extent 相对该原点；移除 designViewport 不重定义 layer 坐标。
- “自动转换为新版本”允许在导入失败时拒绝打开项目，而不是保留旧版只读或旧版原样导出入口。
- Preview 分辨率是宿主 viewport 测试工具，继续保留；用户要求移除的是项目级 viewport 配置。
- 动态背景使用平滑循环而非离散闪烁，颜色顺序精确为红、蓝、黄、绿、红，周期可由实现选择一个便于观察且不刺眼的固定值。

### 待确认

无。若执行时发现已有外部 consumer 只接受 v1/v2 且无法在本仓直接更新，必须先报告兼容边界，不得把 v3 静默伪装成 v2。
