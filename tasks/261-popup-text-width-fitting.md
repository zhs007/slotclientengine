# 261 popup-text-width-fitting 任务计划

## 1. 目标与完成定义

### 目标

为 Popup 的命名字体文字图层增加可选的最小/最大排版宽度。游戏因多语言或其它业务原因通过 exact name
`setText()` 修改文字后，RenderCore 以 authored `fontSize` 为基准：文字宽于最大值时缩小字号，窄于最小值时放大字号，
已经位于区间内时保持基准字号。Popup Editor 必须能编辑、预览、导入和导出同一 production 合同，并在 preview guides
中显示宽度约束，让用户用附件所示长短差异明显的英文、德文标题直接判断排版结果。

### 完成定义

- [ ] Popup latest manifest 升级为 v9；三类 Popup 的 `text` layer 都显式保存一对严格的
      `minWidth/maxWidth`。两者同时为 `0` 表示关闭；合法 v1–v8 继续按原版本 strict 读取，规范化时自动补 `0/0` 并升级为 v9。
- [ ] straight/正负弧排字体文字在创建、`setText()`、award 跨档 `setPresentation()` 后都使用同一个 RenderCore
      fitting 算法；越界时只调整有效字号，不换行、不截断、不拉伸字形。
- [ ] 已在范围内、未启用范围和空字符串保持明确的既有行为；非法范围、无效测量或不能形成有限正字号时在画面提交前失败，
      旧 renderer/string override 保持不变。
- [ ] Popup Editor 的 award、普通 Spine overlay 和 single-state 文字 inspector 都可启用/关闭并编辑范围；preview 使用
      production player，guides 打开时显示与 runtime 实际测量一致的最小/最大宽度框线。
- [ ] v9 ZIP 经 Popup Editor、Game Layout Editor、Scene Layout package resource 与 Game Layout Package CLI 的导入、
      namespace/rewrite、vendor、重导后保留文字宽度合同；旧包不会被误写回旧版本。
- [ ] 自动化测试、Popup/Editor 文档和稳定领域规则同步；用附件三条文案做真实浏览器人工视觉验收。

## 2. 范围

### 包含

- `packages/rendercore/popup/data` 的 v9 types、strict parser、latest normalizer 与兼容测试。
- `packages/rendercore/popup/core` 的字体测量、有效字号求解、straight/curved layout、原子重建和 editor-only guide seam。
- `apps/popupeditor` 的 v9 draft、三类文字 inspector、production preview guide、ZIP round-trip 和 UI/preview 测试。
- 直接 consumer 的 latest type/version 跟进：RenderCore Scene Layout package、Game Layout Editor Popup 导入和
  Game Layout Package CLI reference rewrite。
- `docs/popup-manifest.md`、相关 README 和两份 Popup 领域规则。

### 不包含

- 不接入翻译系统、不保存 locale/translation key、不决定具体语言文案；游戏继续提交最终单行 NFC string。
- 不增加自动换行、多行、ellipsis、裁切、horizontal scale、字距自动调整、字体替换或语言 fallback。
- 不给 ImgNumber/image-string 增加同名能力；其 glyph layout 与 `setText()` 合同保持不变。
- 不改变 Popup focus、host placement、backdrop、attachment、播放状态机、award 金额或 Scene Layout 调度。
- 不修改游戏 app、production 美术、附件图片、YAML、生成物、依赖或 lockfile；附件只作为视觉需求证据，不作为资源输入。

## 3. 制定计划时的基线

```text
UTC: 2026-08-28T04:54:46Z
HEAD: 643db02164485468e2a1cd411210d28185df0721
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
docs/popup-manifest.md
tasks/191-popupeditor-centered-adaptation-font-text-editing.md
tasks/230-popupeditor-single-state-freeform-popup.md
apps/popupeditor/{README.md,package.json}
packages/rendercore/{README.md,package.json}
```

目标目录没有补充 `AGENTS.md`。当前结论：

- `packages/rendercore/src/popup/data/types.ts::PopupTextStyle` 只有 `fontSize/letterSpacing/fill/stroke/shadow/arcDegrees`；
  `manifest.ts::parseTextStyle()` 对字段做 exact-key 校验，当前 latest 是 v8。
- `normalize.ts::loadPopupManifest()` 是唯一默认 normalizer；它把合法 v1–v7 升到 v8。`single-state` 从 v8 开始，
  因此 v9 必须保留 v8 union，不能另建平行 schema。
- `styled-text.ts::createPopupStyledText()` 同时拥有 straight Pixi `Text` 与按 grapheme 弧排；`setText()` 已先 build
  后替换 display，但 `setPresentation()` 当前先写 family/style/anchor 再 build，新增可能失败的 fitting 后必须收紧事务边界。
- `string-node-registry.ts` 已保证 exact-name `setText()` 先调用 target，成功后才提交 override；award、Spine 和
  single-state 三类 runtime 已统一经过 `createPopupStyledText()`，不需要复制状态机。
- `apps/popupeditor/src/model/project.ts` 固定 `formatVersion/version=8`，三类文字创建路径复用 `PopupTextStyle`；
  `app-shell.ts::textStyleMarkup()/updateTextStyleField()` 是共享 inspector seam。
- `PopupPreview` 已只托管一个 production player，并把 viewport/focus guide 画在独立 `Graphics`；没有临时 string override，
  scalar 编辑会重建同一 production package。新 guide 不能重新实现字体测量或进入 manifest/session project。
- `packages/rendercore/src/scene-layout/package-resource.ts` 仍把 normalized nested Popup 写死为 `PopupManifestV8`；
  Game Layout Editor 与 CLI 使用 `LatestPopupManifest`，但测试和 README 仍断言 latest v8。
- 三张附件分别为 `363x642`、`361x643`、`362x631`：短英文、长德文和长英文在相同标题位置呈现明显宽度/字号差异；
  图片没有给出权威像素阈值，因此 min/max 数值必须由用户在 Editor 项目内显式 author。

## 4. 需求解释与技术决策

### 需求解释

1. “最大宽度和最小宽度”是 text layer 自身局部 authored 坐标中的排版宽度，不是 viewport、focus、CSS canvas 或
   `layer.transform.scale` 之后的屏幕像素。这样同一 Popup 在横竖屏与不同 host placement 下保持相同字号选择。
2. `style.fontSize` 是设计基准字号。每次文字或 presentation 变化先用基准字号排版；宽度位于闭区间时不改字号，
   小于 min 时求放大字号，大于 max 时求缩小字号，不沿用上一条语言文案的有效字号。
3. fitting 的 width 使用 RenderCore 同一条 typographic layout：straight 使用文本 advance，curved 使用最终旋转 grapheme
   boxes 的横向 bounds；包含 letter spacing，不用 stroke/shadow 外扩驱动字号，guide 也显示这一口径。
4. 配置关闭时完全保持现有视觉。配置开启但 string 为空时没有可扩张的字形，明确回到基准字号和零 layout width，
   不因满足不了 minWidth 而破坏既有 `setText("")` 合同。
5. “渲染框”解释为 Popup Editor 的 session-only guide：只为当前 production player 中可见且启用 width range 的文字绘制
   min/max 边界；跟随 root、Spine slot、弧排、anchor、rotation 与 viewport transform，不写入 ZIP，也不成为游戏 API。

### 关键决策

1. **Popup v9 增量字段，而不是改写 v8。**
   - v9 text style 增加 required `widthRange: { minWidth, maxWidth }`；`0/0` 是唯一关闭值。启用时两值都必须是正有限数且
     `minWidth <= maxWidth`；负数、单边为 `0`、倒置或非有限值都显式失败。
   - v1–v8 使用不含该字段的 legacy style type，出现 `widthRange` 仍按各自 strict schema 拒绝；default normalizer 在
     source strict 校验成功后为每个 text style补 `{ minWidth: 0, maxWidth: 0 }`，再以 v9 parser复验。
   - canonical v9 无论启用与否都写出 required range；v9 自身缺字段同样失败，不能把 optional/缺字段当第二种关闭表示。
2. **只改变有效 fontSize。**
   - fill、stroke、shadow、letterSpacing、arcDegrees、anchor 和 layer transform 均保持 authored 值；不通过内部 container
     `scale.x` 冒充字号变化。
   - 抽取纯 `resolvePopupTextFontSize()`，以真实 layout-width callback 做有界、确定性求解；基准已命中时零额外迭代，
     其它情况得到有限正字号和范围内宽度，无法收敛/非法 metrics 显式失败。
3. **layout 先 prepare，再原子 commit。**
   - `create/setText/setPresentation` 都先校验 string、测量、求字号、创建 gradient/Text/grapheme tree 和 guide geometry，
     全部成功后才替换 active display 与 family/style/anchor/text。
   - failure 销毁 candidate 并保留旧 display、文字 override、有效字号和 guide；destroy 继续幂等并释放所有 Pixi 对象。
4. **Editor guide 消费 Core 结果。**
   - styled-text runtime 持有 immutable layout inspection 与惰性 guide Graphics；editor player wrapper 通过私有/WeakMap
     inspection seam 统一切换 guide，不向 production Runtime 暴露 mutable Container、Graphics 或完整 snapshot。
   - guide 复用 resolved width、anchor 与有效字号；Popup Editor 只控制全局 guides 开关，不按 manifest 重算矩形。
5. **直接 consumer 统一依赖 latest alias。**
   - Scene Layout nested Popup cache 从 `PopupManifestV8` 改为 `LatestPopupManifest`；Editor/CLI rewrite 继续先 load latest、
     结构化改 path、再 strict load，不能丢 `widthRange` 或把 v9 降回 v8。

## 5. 职责与合同

- **Popup data**：拥有 v1–v9 union、v9 width range、strict keys/数值关系、latest normalization 与 unknown-future failure。
- **Popup core**：拥有字体 metrics、straight/curved bounds、有效字号求解、原子 renderer/string lifecycle 和 guide geometry；
  不理解 locale、翻译 key、业务文案或 Editor 表单。
- **Popup editor wrapper**：只开放完整诊断/guide 控制并复用同一 Core runtime；production game/Scene Layout facade 继续只公开
  command、scalar phase 和 exact string handle。
- **Popup Editor app**：拥有 enable/min/max draft 控件、输入校验、preview host 和 guide session state；不复制排版算法，
  不保存 effective fontSize 或 measuredWidth 为第二份可漂移状态。
- **资源生命周期**：FontFace/package resource ownership 不变；候选 Pixi Text/gradient/grapheme/guide 由 styled-text renderer
  prepare/commit/destroy，player rebuild 仍由 generation gate 原子替换旧 resource/player。
- **失败策略**：非法 range、版本、metrics、非 NFC/控制字符、缺字体、destroyed handle 或 candidate build 失败均显式抛错；
  不回退系统字体、不忽略 range、不保留半提交 guide。
- **禁止行为**：不按字符数估宽，不用 DOM/CSS 测量另建 Editor 算法，不缓存 locale→字号表，不猜 min/max，不加 placeholder、
  silent clamp、alias 或效果降级。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/text-width-fit.ts
packages/rendercore/tests/popup/text-width-fit.test.ts
tasks/261-popup-text-width-fitting-<utctime>.md
```

若纯求解器保持在 `styled-text.ts` 更清晰，可不新增前两个文件，但算法与 renderer/Pixi 生命周期测试必须仍保持分层。

### 预计修改

```text
packages/rendercore/src/popup/data/{types,manifest,normalize}.ts
packages/rendercore/src/popup/{styled-text,editor-types,award-player,spine-overlay-runtime,spine-player,single-state-player}.ts
packages/rendercore/src/scene-layout/package-resource.ts
packages/rendercore/tests/popup/{fixtures,manifest,state-visibility,styled-text,award-player,spine-player,single-state-player}.test.ts
packages/rendercore/tests/scene-layout/package-resource.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/tests/{project,app-shell,preview}.test.ts
apps/popupeditor/README.md

apps/gamelayouteditor/tests/popup-package.test.ts
apps/gamelayouteditor/README.md
apps/gamelayoutpkgcli/tests/reference-rewriter.test.ts
apps/gamelayoutpkgcli/README.md

docs/popup-manifest.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

### 原则上不应修改

```text
apps/game*/**
packages/{logiccore,netcore,uiframeworks,gameframeworks,audiocore,vnicore}/src/**
packages/rendercore/src/{image-string,symbol,reel,background}/**
assets/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
AGENTS.md
```

若执行发现必须改变 production Runtime public surface、Scene Layout schema、Popup attachment graph 或字体资源格式，先说明具体
capability 缺口并重新界定直接 consumer；不能用扩大文件列表事后合理化。

## 7. 实施步骤

1. **确认执行基线和兼容矩阵**
   - 重查 HEAD/status、latest version、三类 text fixture、Scene Layout `PopupManifestV8` 硬编码和 Editor/CLI latest 断言。
   - 先加入 v8 拒绝新字段、v9 合法/非法 range、v1–v8→v9 和 unknown v10 的失败/兼容测试。
2. **建立 Popup v9 data 合同**
   - 新增 v9 manifest union/latest alias与 legacy/latest text style区分；`parseTextStyle()` 按 source version exact解析，
     v9要求 required range并校验 `0/0 | positive/positive` union及大小关系。
   - 默认 normalizer 先 strict parse source，再递归为所有 legacy text layer补 `0/0`、升级并复验 v9；保留
     single-state、audio、visibility、attachment 和资源闭包。
3. **实现共享字号求解与原子 layout**
   - 抽取纯 fitting helper；覆盖 below/in-range/above、equal min/max、straight、正负弧排、letterSpacing、空 string 和坏 metrics。
   - 重构 `createPopupStyledText()` 让 build 显式接收 candidate family/style/anchor，返回 layout inspection；只有完整成功后提交。
4. **贯通三类 Popup 与 editor guide**
   - award logical layer reuse、普通 Spine overlay、single-state layer 都把 v9 style交给同一 renderer；exact `setText/resetText`
     和 award 跨档重新从基准字号求解。
   - 增加 editor-wrapper-only guide toggle；guide 惰性创建、随 layout/attachment/visibility 更新并在 rebuild/destroy 清理。
5. **升级 Popup Editor authoring**
   - 项目/导出固定 v9；shared text inspector 增加“自动适配宽度”、min/max 输入和就地关系校验。关闭时提交 `0/0`，
     启用中的空白/单边输入只留在local form，形成合法正数对前不写入project。
   - award、Spine、single-state 的新层默认 `0/0`；v9 round-trip始终写required range，v1–v8导入显示关闭且后续只导出v9。
   - `PopupPreview` 把现有 guides 开关同步给 editor player，late rebuild仍受 generation gate，不能让旧 player guide 泄漏。
6. **接通直接 consumer**
   - Scene Layout nested Popup 使用 latest type；Game Layout Editor standalone import/namespace 与 CLI rewrite 测试证明 v9
     range原样保留、资源路径仍只结构化改写。
   - gameframeworks 只做 typecheck；不因 latest version 提升修改其业务 API 或复制 fitting。
7. **文档、规则与收尾**
   - 更新 v9 schema/单位/算法边界、Editor 控件/guide、runtime exact-name 用法和 v1–v8兼容说明。
   - 按第8节运行 L2 验收；用三张附件对应文案做真实浏览器测试并生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- data 覆盖三类 text layer、legacy无字段→v9 `0/0`、v9缺字段、`0/0`、positive/positive、单边0、负数、
  NaN/Infinity/倒置范围、旧版本夹带字段、v9 round-trip与v10拒绝。
- fitting 使用注入式 deterministic metrics 精确验证：基准字号在区间内不变；长文缩小、短文放大；min=max；弧排 bounds；
  empty 回到基准；迭代有界且错误不提交。
- styled-text 断言 style/letterSpacing/stroke/shadow/arc/anchor 不被改写，`setText()` 可在短/长/短之间恢复基准求解；
  `setPresentation()` failure 保留旧 family/style/display/guide，destroy无残留。
- player 测试覆盖 award 同逻辑 text 跨 tier、Spine 和 single-state exact handle；guide只从 editor wrapper开启，隐藏层不显示，
  production Runtime API没有 guide/inspection字段。
- Popup Editor 测试覆盖三类 inspector、enable/disable、非法中间值、关闭后显式 `0/0`、v8导入自动补默认值、
  v9 canonical导出、焦点保持、preview generation race和guides同步。
- consumer 测试以真实 v9 nested manifest 证明 Scene Layout prepare、Game Layout namespace和CLI rewrite不丢 range，不只改版本断言。

### 验收级别

`L2`。本任务提升 RenderCore Popup public schema/latest type，并影响 Popup Editor、Scene Layout package、Game Layout Editor、
Package CLI 和 gameframeworks 直接 consumer；不改根工具链、lockfile或大规模无关 package，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor test
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter popupeditor build
git diff --check
```

失败先缩小到对应 manifest/fitting/player/editor/consumer case；不运行根级全量 lint/test/build，也不因“更保险”扩大到 L3。

### 人工验收

1. 在真实浏览器创建含字体文字的 Popup，启用例如 `minWidth=360/maxWidth=620`，打开 guides；确认 min/max边界跟随
   anchor、rotation、正/负弧排、Popup root 与至少一个 Spine slot attachment，关闭 guides 后无任何框线。
2. 依次把默认文案改为附件中的短英文 `CONGRATS`、长德文 `Herzliche Glückwünsche!` 和长英文
   `CONGRATULATIONS!`：短文放大、长文缩小、结果宽度进入同一 authored 区间，画面仍为单行且未横向拉伸。
3. 将基准字号对应宽度调到区间内，确认不发生无谓字号变化；关闭自动适配后project/ZIP写出 `0/0`，相同三条文案
   恢复既有固定字号行为。
4. 导出 v9 ZIP、重开 Popup Editor、导入 Game Layout Editor并运行 production preview；范围、字号结果与guide一致，
   ZIP/Scene Layout 中不出现 measuredWidth、effectiveFontSize或 guide session字段。
5. 在 runtime fixture 通过 exact name `setText()` 短→长→空→reset；确认每次原子更新、空 string合法、reset恢复默认文案和对应字号。

### 独立验收建议

`建议`。涉及跨包 public schema、字体 metrics、异步 renderer替换和 destroy，但不涉及 credential或服务器数据。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor test
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter @slotclientengine/gameframeworks typecheck
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时仅运行 `CI=true pnpm install --frozen-lockfile`；下载真实失败后才设置仓库约定代理重试。
- 不新增依赖、不修改 lockfile。测量、Graphics 与字体渲染继续使用现有 Pixi/browser能力。

## 10. 生成物、文档与规则

- 本任务没有 YAML 或生成 TypeScript，不运行 generator，不修改 production assets或三张附件。
- `docs/popup-manifest.md` 更新为 v1–v9，记录 required range、`0/0`关闭、legacy自动补默认值、局部单位、
  基准/有效字号、empty语义、弧排宽度口径和兼容规则。
- RenderCore/Popup Editor/Game Layout Editor/CLI README 更新 latest v9及各自职责；不复制完整 schema到每份 README。
- `editor-artifacts.md` 记录 Popup Editor v9 authoring与production guide复用；`shared-game-runtime.md` 记录宽度 fitting、
  exact `setText()` 和原子 layout属于 RenderCore。该职责是稳定跨任务合同，因此需要更新领域规则。
- 不更新根 `AGENTS.md`：现有 data→core→editor、strict schema和职责边界没有改变。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/261-popup-text-width-fitting-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 v9 字段/算法、实际文件、直接 consumer跟进、自动命令、
三条文案的浏览器验收、计划偏差和剩余风险；不收集无关 coverage、完整历史矩阵、整仓统计或 profiler数据。

## 12. 风险、假设与待确认

### 风险

- browser/system font metrics可能因平台与字体 hinting产生亚像素差异；纯算法测试应注入稳定 metrics，真实 FontFace结果必须以浏览器
  视觉验收确认，不能写死截图像素成为跨平台 oracle。
- curved width对字号不是简单的字符串长度比例，negative letterSpacing也可能形成低字号平台段；solver必须有界并用实际候选
  bounds验证，不能一次比例缩放后假设命中。
- 极端窄/宽范围可能产生很小/很大的文字纹理与重建成本；非有限/不能收敛应失败，不能 silent clamp到任意字号。
- editor guide若绕过attachment runtime，Spine/VNI父节点运动时会漂移；必须挂在同一文字局部树并严格随 owner销毁。
- latest v9会穿过Scene Layout与工具链；残留 `PopupManifestV8` 或硬编码版本断言可能让合法包编译失败或被降版。

### 假设

- min/max都是 Popup authored local x-axis单位，且作为一对配置；`0/0`关闭，positive/positive启用，不提供只填一边、
  optional缺字段、百分比或viewport-relative模式。
- 字号适配只改变 glyph fontSize；letterSpacing、stroke、shadow和layer transform继续是绝对 authored值。
- empty string继续是合法单行值，width fitting对它不放大；若未来要求空文案也占最小视觉宽度，应另行定义placeholder语义。
- 三张附件只证明多语言长度差异和视觉目标，不提供权威数值、字体文件、颜色、曲率或最终golden screenshot。

### 待确认

无阻塞项。若执行时用户要求多行/裁切、按viewport百分比、独立最小/最大字号、stroke/shadow计入宽度或ImgNumber同类能力，
均属于新合同，应先说明并重新规划，不能静默加入任务261。

## 13. 完成清单

- [x] 目标和非目标已满足，固定字号/旧Popup/三类player既有行为无回归。
- [x] v9 public schema、normalizer、Scene Layout与工具链consumer一致。
- [x] straight/curved fitting、set/reset/presentation、失败原子性和destroy符合计划。
- [x] Editor三类文字控件、production preview和session-only guide符合计划。
- [x] 测试、README、manifest文档和领域规则已同步。
- [x] 指定自动化验收通过，真实浏览器与自动化结果明确区分。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/{editor-artifacts,shared-game-runtime}.md` 和本计划；
2. 核对 Git 基线、工作区与 Popup latest direct consumer；
3. 按计划实现，不重新制定另一套 fitting/guide/schema；
4. 小幅适配当前实现时在报告记录；
5. public Runtime、Scene Layout schema或多行/字体范围等重大扩张时先停止说明；
6. 只运行计划规定的 L2 验收；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
