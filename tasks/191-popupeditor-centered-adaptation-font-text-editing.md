# 191 popupeditor-centered-adaptation-font-text-editing 任务计划

## 1. 目标与完成定义

### 目标

继续收敛 Popup Editor 的适配与文字工作流。修正 Popup v2 在横屏、方屏和自定义 viewport 中的 production
focus transform，使重点区域始终完整可见，缩放后的内容以 viewport 中心为基准放置；预览用有方向感的渐变底明确
呈现 contain、留边和全屏 backdrop 的实际覆盖范围。

移除 Popup Editor 侧栏的 prompt 临时文案和“文字节点 Set/Reset”功能，并移除普通 Spine 项目的“启用提示”
authoring。文字统一进入命名的“字体文字”图层：用户可选择已导入字体，未选择字体时才明确使用系统字体；runtime
继续通过 exact layer name 修改文字。补齐可选色板与手写颜色、Curved Text 控件，并解除 inspector 输入与自动预览
rebuild/整块 DOM 重绘之间的耦合。

### 完成定义

- [ ] 默认 `designViewport=1080x1920`、focus 覆盖完整设计区域时，切到 `1920x1080` 必须看到完整重点区域，
      内容等比缩小并在横纵两个方向居中；不得按横轴比例放大后裁掉上下半区。
- [ ] 同一项目在 `1080x1920`、`1920x1080`、`2000x2000` 和自定义 viewport 中均使用一套 production
      transform；方屏留边对称，设计中心 `(0,0)` 映射到适配后的 viewport 中心，不贴左/上边。
- [ ] 非对称 focus 仍按 shared maximized-focus 合同定位并保证整个 focus 可见；host placement 的
      `x/y/scale` 继续叠加在适配结果上，backdrop 继续覆盖整个 viewport 且不随 content 缩放。
- [ ] Popup Editor 的预览逻辑 viewport 后方默认显示 preview-only 渐变底；它不进入 project、manifest、资源闭包
      或 production runtime。50% 黑色 backdrop 叠加后仍能观察其透明度和 viewport 边界。
- [ ] 删除侧栏 `Prompt preview`、节点 kind/name/index/string、`Set string`、`Reset string` 及对应 preview
      session/API；Play/Replay 只以 manifest 默认值启动 production player。
- [ ] 新项目和 v2 authoring 不再显示或生成独立“单行点击提示/启用提示”配置；普通 Spine 的提示文字用普通
      命名字体文字 overlay 表达，并服从同一 transform/order/alpha/style/segment 合同。
- [ ] 字体文字可在“系统字体”和全部已导入 font resource 之间显式选择；选择的资源缺失或类型错误必须失败，
      只有未选择 resource 时才使用 `system-ui, sans-serif`，不得对失效选择静默 fallback。
- [ ] award tier 与 Spine overlay 的字体文字都有必填、lowercase kebab-case、作用域内唯一的 `name`；
      rendercore player 可按 exact name 取得 handle 并原子 `setText()/resetText()`，跨档同名 variant 保持 kind 一致。
- [ ] 所有文字颜色字段提供同步的浏览器色板和 string 输入；string 仍写入同一 strict canonical 颜色字段，非法值
      就地报错且不提交，不引入任意 CSS/renderer-dependent 颜色 fallback。
- [ ] 字体文字 inspector 明确提供 Curved Text 开关/角度控件；`0` 为直排，正负角度复用 rendercore 现有
      grapheme 弧排，范围仍为 `-180..180`，不另建 preview-only 排版实现。
- [ ] 字号、字距、描边、投影、颜色、弧度和文案可在 production preview 正常播放/非黑画面时连续编辑；异步
      rebuild 不得抢走焦点、重置半输入值或禁用 inspector，失败只更新 diagnostics 并保留最后一次成功 preview。
- [ ] v1 及任务 190 已产出的含 `spine.prompt` 包继续 strict parse、play 和无损兼容；旧字段不重新成为新 UI，
      显式升级/迁移到 layer 时必须结构化、可诊断且不猜测字体或名称。
- [ ] L2 定向自动验收通过并生成 UTC 中文执行报告；真实浏览器视觉与输入连续性验收完成或在报告中明确列为待验。

## 2. 范围

### 包含

- `packages/rendercore/popup` 的 v2 content transform、snapshot、命名文字 registry/player 接入、legacy prompt 兼容边界。
- `apps/popupeditor` 的 preview 背景/guide、侧栏清理、Spine prompt authoring 收口、字体文字/颜色/Curved Text
  inspector，以及不会因 scalar edit 重建整块表单的编辑事务。
- Popup manifest/project ZIP 对 legacy prompt 与 canonical font-text layer 的结构化导入、导出、升级和资源引用维护。
- rendercore、Popup Editor 及直接 consumer 的定向测试、README、Popup manifest 文档和最小领域规则更新。

### 不包含

- 不修改 maximized-focus 的 Game Layout/Background 通用算法语义；只修 Popup presentation 对其结果的缩放和居中映射。
- 不做画布拖拽回写、缩放手柄、时间轴、关键帧、路径编辑器、任意 Bézier/圆环文字、3D 字或新滤镜系统。
- 不把 preview 渐变底导出为图片/manifest layer，不改变 production 默认 backdrop，也不新增 placeholder 资源。
- 不让字体选择自动匹配文件名，不做 web font 下载、字体子集、glyph 预检或选中字体失败后的系统字体降级。
- 不删除 rendercore 对已交付 legacy `spine.prompt` 的 decoder/runtime；不借本任务改变 start/loop/end、dismiss、
  award threshold/amount 或 Scene Layout popup placement 业务合同。
- 不改游戏 app、production assets、YAML、生成物、workspace 依赖或 lockfile；不扩展到 Game Layout Editor 的 UI 重构。

## 3. 制定计划时的基线

```text
UTC: 2026-08-10T07:47:58Z
HEAD: ad0da3b999c3addaa26335ad325bcf1df0ea8426
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
tasks/190-popupeditor-project-resource-responsive-layer-refactor.md
tasks/190-popupeditor-project-resource-responsive-layer-refactor-260810-063802.md
docs/popup-manifest.md
apps/popupeditor/{README.md,package.json}
packages/rendercore/{README.md,package.json}
```

目标目录没有补充 `AGENTS.md`。当前结论：

- `packages/rendercore/src/popup/presentation.ts::createPopupPresentation().applyViewport()` 已调用
  `calculateMaximizedFocusedArtViewport()`，但用 `viewport.width / focused.viewportSize.width` 单轴计算最终比例；
  visible rect 被 art size 封顶而与 page aspect 不同时，该比例会把 `1080x1920` 在 `1920x1080` 中放大到只见一半。
- 同一函数的 `contentPosition` 没有加入缩放后 visible rect 在 page 中的 letterbox offset，所以方屏/横屏不能保证
  centered contain；现有 `presentation.test.ts` 只断言 scale 为正，没有保护三种目标分辨率的精确矩阵。
- `PopupPreview.layout()` 又把逻辑 viewport fit 到固定 `540x720` canvas 并画 guide；production player 已拥有内部
  focus snapshot。preview 目前用 `Application` 的实色 `#050814` 背景，没有独立于 popup/backdrop 的参照图层。
- `PopupEditorApp.shell()` 仍包含 `preview-prompt`、按 kind/name-or-index set/reset 节点控件；`PopupPreview` 仍保存
  `#promptText` 并暴露 `setPromptText/setNodeText/resetNodeText`，这套 session override 与图层 authoring 重复。
- `PopupEditorProject.spine.prompt`、`spineMarkup()` 的“启用提示”以及 `projectToManifest()` 仍生成独立 prompt。
  rendercore 同时保留 `PopupPromptSpec/createPopupPromptText()` 和通用 text overlay，形成两套文字配置。
- 通用 text layer 已有 required `name/defaultText/style`；rendercore 的 `PopupStringNodeRegistry` 与两类 player 已提供
  `getTextNode(exactName).setText()`，manual ImgNumber 也有 exact-name handle。任务 191 应接通并明确该合同，不复制 registry。
- v2 text 的 `resource` 已可省略，runtime 在省略时使用 `system-ui`；当前 Editor 却通过“选 font resource 添加层”或
  “添加系统文字”分成两个入口，创建后没有统一 font selector。
- `PopupTextStyle.arcDegrees` 和 grapheme 弧排已经存在；UI 只暴露无说明的 raw `arcDegrees` 数字字段。颜色目前
  backdrop 只有 `type=color`，文字 fill/stroke/shadow 只有文本框，没有共享的色板 + string 编辑体验。
- `PopupEditorStore` 每次 scalar transaction 都触发 `renderWorkspace()`，用 `innerHTML` 替换整个 inspector；自动
  preview 又在每次合法提交后异步 rebuild。当前测试只 dispatch 单次 `change`，没有覆盖活跃 preview 下连续输入、
  focus/selection 保持、非法中间文本和 late rebuild failure。
- 任务 190 的自动验收已通过；真实浏览器适配与输入是报告中明确未完成项。本计划不重复审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “重点区域全可见”采用 contain 语义：先由 shared maximized-focus 得到 art-space visible rect，再用横纵比例的较小值
  映射到 page；多余空间在两侧或上下平均分配。focus 比设计区域小时仍允许按既有算法显示额外 art 或裁掉 focus 外 art。
- “中心坐标系”指 authored layer 的 `(0,0)` 是 `designViewport` 中心；preview 不另存一套左上角坐标。对称 focus
  下该点精确映射到 viewport 中心，非对称 focus 按 production visible rect 得到可解释的偏移。
- “彻底移除文字节点功能”指删除 Popup Editor preview 侧栏的运行时临时 override，不删除 production game 按 name
  注入翻译/金额的能力；后者继续是 rendercore public contract。
- “移除启用提示”指新 authoring 只有字体文字 layer。legacy prompt 只为已导出包保留 parser/runtime/round-trip；
  不以破坏旧包来伪装 UI 已收口，也不允许 legacy 字段重新出现在新项目。
- “没有字体时回到系统字体”是显式 optional resource union：`font resource | system`。选择过但资源失效属于错误，
  不是“没有字体”。
- “颜色可以写 string”按当前跨 runtime strict schema 解释为手写同一 canonical lowercase
  `#rrggbb | #rrggbbaa` color；图层/backdrop alpha 仍使用既有独立字段。
  如未来需要 named color、rgba 或 Display-P3，应另开 schema 版本，而不是把浏览器 CSS parser 当 production 合同。

### 关键决策

1. **从 visible rect 建立唯一居中矩阵**
   - `fitScale = min(page.width / visible.width, page.height / visible.height)`；先计算居中的 page-space visible origin，
     再把 art center、focus rect 和 host placement 映射到同一坐标系。
   - snapshot 返回的 `contentScale/contentPosition/focusRectInViewport` 必须来自同一矩阵；preview guide 不二次推导。
2. **preview 背景只属于宿主**
   - PopupPreview 在 player 下方拥有一个随逻辑 viewport 一起 fit/center 的渐变参照层；player 的 backdrop 正常叠加。
   - rebuild 只替换 player/resource，不销毁背景、guide、宿主 Application/canvas 或其 transform。
3. **一个字体文字 authoring 路径**
   - “添加字体文字”先创建无 resource 的 system-font text layer；font select 可切换为 exact imported font 或回到 system。
   - generic resource layer picker 不再把 font 伪装成另一类图层；award 与 Spine overlay 复用同一 defaults、style editor 和命名校验。
4. **name 是 string binding identity，id 是结构 identity**
   - text/manual ImgNumber 使用 required exact name；image/VNI/Spine 继续只有 layer id，不为不能 setText 的节点制造假 name。
   - 保留既有按 kind 的 handle API 和 index 兼容，但文档/consumer 首选 exact name；不得按 label、order 或首项查找。
5. **legacy prompt 隔离**
   - import model 将 legacy prompt 标成 typed legacy 数据；v1 未升级写回保持原字段。升级到 canonical v2 时显式转换为
     `name=prompt` 的字体文字 overlay，并复验 name/order/resource collision；失败不修改项目。
   - 对任务 190 已生成的 v2 prompt，导入边界执行同一结构化迁移并明确提示；runtime parser 在兼容期继续读取，
     canonical Editor export 不再新写 prompt。迁移不猜测缺失字体或另选名称。
6. **可持续输入而非整表重建**
   - scalar inspector 使用本地编辑值和就地 validation；合法提交更新 project/diagnostics并调度 preview，但不替换当前 input DOM。
   - tab、add/delete、kind/font schema 切换等结构变化才重绘相应 inspector；异步 preview success/failure 不触发 workspace 全量重绘。
   - 空字符串、负号、小数点等合法输入中间态留在 form；只有完整合法值进入 manifest draft，避免为编辑体验放宽 parser。
7. **复用既有文字 renderer**
   - 色板和 string 控件都写 `PopupTextStyle`/backdrop 的同一字段；Curved Text 仍映射到 `arcDegrees`。
   - rendercore 继续由 `createPopupStyledText()` 负责字体、渐变、描边、投影、grapheme 和 destroy，不在 Editor 复制 Pixi Text。

## 5. 职责与合同

- `rendercore/popup` 拥有 manifest strict validation、focus-to-page matrix、字体资源 prepare、styled text、命名 string
  registry、player lifecycle 和 legacy prompt runtime；Popup Editor 只拥有 draft/UI、迁移提示与 preview 宿主。
- Popup layer `id` 决定结构、order 和生命周期；`name` 只属于可变 string node，作为游戏传入翻译/数值的 exact key。
  同一逻辑 name 不得跨 text/ImgNumber kind，也不得在同一活动 scope 重复。
- Editor asset workspace 拥有字体 bytes；PopupPackageResource 拥有 FontFace/hash reuse；styled text player 借用 prepared
  family；destroy 顺序不变。切换字体必须由下一次 preview prepare 成功后原子替换旧 player。
- invalid color/name/font/focus/viewport、duplicate name/order、缺资源、未知 legacy shape 或 destroyed handle 显式失败。
  禁止路径猜测、首项字体、静默 rename、system font fallback、preview-only schema 或第二份 focus/text 状态机。

## 6. 文件范围

### 预计新增

```text
tasks/191-popupeditor-centered-adaptation-font-text-editing-<utctime>.md
```

若 color field/inspector local draft 在 `app-shell.ts` 中无法维持清晰边界，可新增
`apps/popupeditor/src/ui/color-field.ts` 或 `form-draft.ts`；不得为每种 layer 复制一份实现。

### 预计修改

```text
packages/rendercore/src/popup/{types,manifest,presentation,string-node-registry,award-player,
  spine-player,spine-overlay-runtime,package-resource}.ts
packages/rendercore/tests/popup/{manifest,presentation,string-node-registry,award-player,
  spine-player,spine-overlay-runtime,package-resource}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/{popup-zip,resource-import}.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/styles.css
apps/popupeditor/tests/{project,resource-import,preview,app-shell}.test.ts
apps/popupeditor/README.md

docs/popup-manifest.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

`prompt-text.ts` 原则上保留为 legacy runtime；只有迁移后能证明没有兼容 caller 时才可缩小导出，不能直接删除。

### 原则上不应修改

```text
apps/{game002,game002v2,game003,gameviewer,gameviewer2}/**
apps/gamelayouteditor/src/**
apps/gamelayoutpkgcli/**
packages/{logiccore,uiframeworks,vnicore,gameframeworks}/src/**
packages/rendercore/src/{viewport,scene-layout,background}/**
assets/**
package.json
pnpm-lock.yaml
AGENTS.md
```

若 exact-name API 或 legacy prompt 类型必须发生 breaking 变化，应先说明为何兼容层不足，并重新界定所有直接 consumer；
不能只修改 rendercore 类型后把 consumer 留给后续任务。

## 7. 实施步骤

1. **冻结执行基线与失败用例**
   - 重查 HEAD/status；用当前 v2 fixture 增加 `1080x1920 -> 1920x1080/2000x2000` 精确失败测试，记录现有错误
     `contentScale/contentPosition/focusRectInViewport`，并冻结 v1 placement 与 legacy prompt round-trip。
2. **修正 Popup presentation 矩阵**
   - 在 `presentation.ts` 从 shared visible rect 建立 contain + centered offset；统一映射 content、focus guide 和 placement。
   - 覆盖 portrait/landscape/square、完整/较小/非对称 focus、placement scale、backdrop viewport 和 destroy；不改 viewport package。
3. **收口命名文字与 legacy prompt**
   - 明确 text/manual ImgNumber name strict contract和 exact-name handle；保护跨 tier variant、reset、未挂载 target 和 destroy。
   - 新 v2 emitter 不再写 prompt；导入/升级结构化生成 font-text overlay，v1 原版本写回继续保留 typed legacy prompt。
4. **重构字体文字 UI**
   - 删除 prompt editor 与两个“系统文字”入口，增加共享“添加字体文字”和 per-layer font select；资源选择/删除/rename
     继续更新 exact reference并完整复验。为 name 提供就地唯一性错误，不自动 suffix production identity。
5. **完成颜色与 Curved Text inspector**
   - 为 backdrop、solid/gradient stop、stroke、shadow 提供同步 picker + string field；非法 string 保留在 local form并显示错误。
   - 把 `arcDegrees` 呈现为 Curved Text 开关与 `-180..180` range/number，直排/正弧/负弧都走 production renderer。
6. **解耦表单编辑与 preview rebuild**
   - scalar edit 不再 `innerHTML` 替换整块 workspace；保留 active element、selection 和尚未提交的中间值。
   - preview debounce/generation 只操作 preview owner；late failure 更新独立 status/diagnostics且保留成功画面，不禁用表单。
7. **清理 preview 临时文字入口并增加渐变参照层**
   - 删除 shell/handler/PopupPreview 的 prompt和node set/reset状态；Spine `play()` 不传 session prompt。
   - 在宿主 preview 中建立稳定渐变 viewport 背景，resize/zoom/guides 与 player 共用 layout transform，rebuild 不重复创建。
8. **兼容、文档与收尾**
   - 回归旧 v1/v2 prompt 包、canonical layer-only v2 ZIP、font closure/rewrite/GC、直接 consumer typecheck。
   - 更新 README、manifest 文档和两份领域规则；运行 L2 命令并生成简洁 UTC 报告，记录真实浏览器矩阵结果。

## 8. 测试与验收

### 测试原则

- presentation 使用精确数值断言，不只断言 `scale > 0`：完整 focus 在横屏应为 `0.5625` contain，设计中心映射到
  `(960,540)`；在 `2000x2000` 中中心为 `(1000,1000)` 且左右 letterbox 对称。
- smaller/asymmetric focus 与 host placement 以 shared viewport 输出为 oracle，验证 focus 四边都在 viewport 内；v1
  center placement保持现状。backdrop bounds 始终等于 page size。
- manifest/project 测试覆盖 system/font 两分支、font replacement/removal、duplicate/invalid name、legacy prompt v1 写回、
  v2 migration collision/rollback、canonical export 不含 prompt及资源 exact closure。
- styled text 测试复用现有 straight/positive/negative arc 和 grapheme；Editor 只验证控件写入合同、色板/string 同步和
  invalid local value，不用 fake DOM renderer 冒充视觉验收。
- app-shell 使用真实连续 `input`/`change` 序列：在 player active 和 rebuild pending 时输入多位字号、颜色和文案，断言
  同一 input node/焦点/selection 保留、最终 project正确；late failure 不清空或 disable inspector。
- preview 测试断言渐变背景只创建一次、位于 player/backdrop 之后、随三种 resolution 居中缩放且 destroy；DOM 断言
  prompt与node override控件/API完全不存在。

### 验收级别

`L2`。原因是修复 `packages/rendercore/popup` 的 public presentation 行为，并调整 Popup manifest/editor 的
canonical authoring与 legacy compatibility；Popup Editor 是直接 consumer，Game Layout/gameframeworks 需至少编译回归。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter popupeditor test
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts tests/zip-io.test.ts
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter popupeditor build
git diff --check
```

若 public export 实际未变化，consumer 测试/typecheck仍用于证明 legacy package 与调用面未破坏；不因此升级整仓验收。
失败先缩小到对应 popup/presentation/app-shell case，不运行根级全量 test/build。

### 人工验收

- 在真实浏览器创建 v2 `1080x1920` Popup，focus 保持默认全画布，依次切换 `1080x1920`、`1920x1080`、
  `2000x2000` 和至少一个超宽自定义尺寸；检查绿色 focus 框完整、中心十字、渐变留边和 backdrop 覆盖。
- 在 preview 播放且画面可见时连续编辑文案、字号、字体、fill/gradient、描边、投影和 Curved Text 正负角度；确认输入
  不丢焦点、不回跳，preview 合法变更后更新，非法 string 只就地报错。
- 导入一个真实字体与一个 legacy prompt Popup ZIP；确认字体可显式选择/切回系统字体、旧包可播放且迁移/写回行为有提示。

### 独立验收建议

`建议`。高风险点是跨包 Popup presentation matrix、legacy prompt 到命名 layer 的兼容边界，以及异步 preview 与表单
状态隔离。独立复验优先运行前两条测试命令，并人工检查横屏/方屏中心矩阵；不涉及 credential、安全或服务器数据。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm。shell 缺少 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有真实下载失败后才设置仓库约定代理重试。
- 预计不新增依赖、不修改 lockfile。颜色 picker 使用浏览器原生 input，弧排与渐变复用现有 Pixi/rendercore 能力。

## 10. 生成物、文档与规则

- 本任务没有 YAML 或生成 TypeScript；不得手改任何生成物或 production assets。
- 更新 `apps/popupeditor/README.md`：删除资源入口接受 Popup ZIP、prompt、preview node override和“系统文字”旧说明，
  记录字体文字、exact name、颜色、Curved Text、中心适配与渐变预览。
- 更新 `packages/rendercore/README.md` 和 `docs/popup-manifest.md`：给出 exact-name runtime 调用、canonical layer-only
  authoring、legacy prompt 边界和 centered contain 定义。
- 更新 `docs/agent-rules/editor-artifacts.md` 与 `shared-game-runtime.md` 中稳定的 Popup 文字/适配合同；不把分辨率样例、
  测试数字或一次性执行证据写入根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/191-popupeditor-centered-adaptation-font-text-editing-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终文件、presentation矩阵/文字迁移决策、实际命令结果、
浏览器验收、计划偏差和剩余风险；不收集无关整仓 coverage、历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 任务 190 后短时间内导出的 v2 package 可能已经包含 prompt；若直接从 parser 删除会破坏文件，因此必须先用 fixture
  证明兼容读取和 deterministic migration，再收口 canonical emitter。
- center/contain 修复会改变当前错误 v2 的所有 consumer 视觉结果；这是目标行为，但需要在 Popup Editor 与嵌套 Scene
  Layout host placement 中验证没有二次缩放。v1 placement不得改变。
- 字体文字切换会触发 FontFace/resource prepare；快速切换和失败必须由 generation/owner cleanup覆盖，避免旧 family 泄漏。
- 不整块重绘 inspector 后，DOM local value、project draft和 diagnostics 会形成明确的两阶段状态；结构 mutation 前必须先
  commit 或显式拒绝非法 local input，不能静默丢弃。

### 假设

- 颜色 string 需求指可手写 strict lowercase `#rrggbb` 或 `#rrggbbaa`；本任务不扩展 production color grammar。
- Curved Text 继续采用现有按 grapheme、以 `arcDegrees` 表示的圆弧排版，不要求可拖拽路径或完整圆周。
- “图层需要名字”只适用于 runtime 可修改 string 的字体文字与 manual ImgNumber；非文字 layer 继续使用稳定 `id`。
- 新 authoring 不再需要独立 prompt 的 area auto-fit；等效视觉由字体文字的 fontSize/scale/anchor/transform/style表达。

### 待确认

- 无阻塞项。若执行时发现用户期望 CSS named/rgba/P3 color、任意曲线路径或删除所有 legacy prompt runtime，均属于
  production schema/兼容范围扩大，应先说明并重新规划，不能在本任务中静默加入。
