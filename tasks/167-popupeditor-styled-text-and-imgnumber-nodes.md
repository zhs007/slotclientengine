# 167 popupeditor-styled-text-and-imgnumber-nodes 任务计划

## 1. 目标与完成定义

### 目标

为 Popup Editor 的 `award-celebration` 与普通 `spine` 弹窗增加通用、可命名的系统文字和 ImgNumber 节点。系统文字保存固定默认文案，并可编辑字号、颜色、投影、描边、线性渐变与弧形排版；ImgNumber 复用 standalone image-string 资源。两类节点都进入 Popup package 的严格资源闭包和 production player，游戏可按稳定名字或零基 index 取得节点句柄并修改其 `string`。

参考图拆分为两个独立节点：固定系统文字 `congratulations` 显示 `CONGRATULATIONS!`，动态 ImgNumber `win-amount` 显示金额。获奖庆祝继续要求每档恰好一个自动金额 ImgNumber，并允许增加其它手动 ImgNumber；普通 Spine 弹窗可按需添加零到多个系统文字和 ImgNumber。

### 完成定义

- [ ] 两种 Popup 都可添加多个具有全局唯一 lowercase kebab-case `name` 的系统文字和 ImgNumber，并在 editor 中增删、排序、选资源、编辑 transform/default string 和 production preview。
- [ ] 系统文字可编辑正数 `fontSize`、solid/linear-gradient fill、可选 stroke、可选 drop shadow、letter spacing、anchor、rotation 与有符号弧度；`arcDegrees=0` 精确表示直排。
- [ ] 曲排按 Unicode grapheme、实际字体测量 advance 和稳定阅读顺序布置，正负弧度方向明确，字符沿圆弧切线旋转；直排继续使用整行 Text，不能为实现弧形破坏正常 kerning/shaping。
- [ ] `AwardCelebrationPlayer` 与 `SpinePopupPlayer` 都公开稳定 string-node 列表，并可用 `name | zero-based index` 精确取得 text/image-string 句柄；不存在、越界、kind 错配和重复名字显式失败。
- [ ] 句柄提供当前 string、`setText(string)` 与 `resetText()`；修改只影响当前 runtime，不回写 manifest/ZIP。手动 override 跨 start/tier 切换保持，直到 reset 或 destroy。
- [ ] award 的 `win-amount` 仍由现有 formatter/count sequence 驱动；对其句柄调用 `setText()` 后显式 override 当前显示而不停止 raw 计数，`resetText()` 恢复自动 formatter，snapshot 的 formatted string 与真实显示一致。
- [ ] award 每档仍恰好有一个 `binding="win-amount"` ImgNumber；可另加 `binding="manual"` ImgNumber。普通 Spine 只接受 manual ImgNumber，不接受金额 binding。
- [ ] 同名 award 节点可在不同 tier 拥有不同 resource/style/transform；player 只挂载 active tier variant，并把当前 string 原子重绑到新 variant。节点可只存在于部分 tier，未激活时 setter 仍保存值。
- [ ] 既有合法 award Popup、无 prompt/overlay Spine Popup，以及 task 163 的 legacy `spine.prompt` 文件继续 parse、播放、导入导出、layout vendoring；旧 prompt 继续支持 `start(text?)`，并作为保留名 `prompt` 暴露给 text-node API。
- [ ] Popup ZIP、Scene Layout ZIP、CLI 优化与 typed namespace rewrite 保留字体、ImgNumber、名字、样式和 exact resource closure，不增加 orphan、路径猜测或第二份资源表。
- [ ] 文档、README、稳定领域规则、直接 consumer 类型测试、L2 自动化验收、真实浏览器视觉验收与 UTC 中文执行报告完成。

## 2. 范围

### 包含

- `packages/rendercore/popup` 的通用 styled-text/image-string layer schema、严格 parser、渲染算法、命名节点 registry、player API、snapshot 与生命周期。
- Popup Editor 的两类 Popup authoring、资源绑定、effect controls、节点名字/顺序、preview string override、ZIP round-trip 和 diagnostics。
- award tier 之间同一 logical node 的 variant 重绑，以及既有 VNI text-layer parent 下金额 ImgNumber 的兼容。
- rendercore Scene Layout、Game Layout Editor、Package CLI 与 gameframeworks 对新 nested Popup contract 的只读透传、typed rewrite、public type parity 和直接测试。
- Popup manifest 文档、Popup/RenderCore/Layout/CLI README 以及最小领域规则更新。

### 不包含

- 不实现 i18n、translation key、语言表、locale、远程字体、字体转码/子集化、glyph coverage 检测或游戏专属文案映射；游戏传入最终 string。
- 不实现多行、自动换行、HTML/富文本、逐字时间动画、路径贝塞尔编辑、3D/透视文字、滤镜编辑器或任意 shader。
- 不给 ImgNumber 增加字体式 stroke/shadow/gradient/arc；其 glyph 美术、metrics 与 fixed advance 仍由 ImgNumber Editor/image-string manifest 拥有。
- 不修改 award threshold、金额格式 schema、计数时长、advance/dismiss/end drain、Spine start/loop/end 或 VNI playback 状态机。
- 不让 Game Layout Editor 编辑 nested Popup 节点；内部文字/ImgNumber 仍只回 Popup Editor 修改。
- 不写入 game002/game003 production assets，不接业务触发，不新增依赖，不修改 lockfile、根工具链或无关 package。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T07:08:48Z
HEAD: 4e9705610c2fe17a1987b3d490b15a27a71325dd
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
docs/agent-rules/scene-layout.md
tasks/157-popupeditor-imgnumber-preview-formatting.md
tasks/161-popupeditor-spine-popup.md
tasks/163-popupeditor-spine-prompt-layers.md
tasks/163-popupeditor-spine-prompt-layers-260805-051846.md
apps/popupeditor/README.md
packages/rendercore/README.md
docs/popup-manifest.md
```

目标目录没有更深层 `AGENTS.md`。当前实现结论：

- `packages/rendercore/src/popup/types.ts` 的 `PopupLayer` 只允许 image/image-string/VNI/Spine；award image-string 固定 `binding="win-amount"`。`PopupOverlayLayer` 不允许 text 或 image-string。`SpinePopupManifestV1` 另有单个可选 `prompt`。
- `manifest.ts::parseTier()` 要求每档恰好一个动态 ImgNumber；`parseOverlays()` 显式拒绝 image-string。资源使用项、order、kind、exact closure 已严格校验，是扩展 union 的权威边界。
- `award-player.ts::DefaultAwardCelebrationPlayer` 已把五档 amount image-string 作为一个 renderer 跨 tier `rebindAmountLayer()`；这是 `win-amount` logical node 的复用基础，不应改回每档独立 renderer。
- `spine-player.ts::DefaultSpinePopupPlayer` 只持有一个 `prompt`，`start(text?)` 设置文案；`prompt-text.ts` 只支持 fill 和 area fit，没有字号、描边、投影、渐变或弧形布局。
- `PopupEditorProject` 的 award layer draft 与 Spine overlay draft直接使用 rendercore 类型；`addLayer()` 会替换同档已有 ImgNumber，因此当前不能增加第二个 ImgNumber。
- Popup Editor 已能导入 package-owned WOFF2/WOFF/TTF/OTF 与 standalone ImgNumber，preview 通过导出、重读、prepare 后的 production player 渲染，不需要新的资源通道。
- `RenderImageString.setText()` 已提供 strict glyph validation、原子 layout/commit、sprite reuse 和动态 visualBounds anchor，可作为所有 Popup ImgNumber 句柄的唯一底层实现。
- Scene Layout runtime/presentation surface 已原样返回 `AwardCelebrationPlayer` 与 `SpinePopupPlayer`，游戏可沿既有 facade 取得扩展后的句柄；nested Popup namespace/rewrite 和 CLI exact closure 仍需同步保护新增 reference。
- Pixi 8 已提供 Text、stroke、dropShadow 与 TextStyle 能力；仓库没有可复用的通用弧形文字 renderer。本任务应在 rendercore/popup 建立唯一算法，不在 editor/game 复制。
- 当前 schema、测试和文档足够制定计划，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “系统文字”指 Pixi/浏览器字体渲染的 package-owned font text，不是 VNI 内部文字、Spine slot 或 ImgNumber glyph；固定 default string 随 manifest 导出，但 runtime 可以覆盖。
- “颜色、渐变”建模为互斥 fill union：solid color 或具有方向与有序 stops 的 linear gradient；不会同时保存两个互相覆盖的字段。
- “弧度”解释为单行 baseline 的 signed `arcDegrees`，范围 `-180..180`；`0` 为直线，正负值决定上下弯方向，不把弧度误解为文字 rotation。
- 名字是游戏 public identity，layer `id` 是某个 tier/overlay variant 的内部 identity。相同 logical `name` 可跨 award tier 重复，但同一 tier 内不得重复，且跨 tier kind 必须一致。
- index 分别在 `textNodes` 与 `imageStringNodes` 内从 `0` 开始。Spine 按 overlay order；award 按 `base -> standard -> bigwin -> superwin -> megawin` 和各档 order 的首次出现确定，后续 variant 不改变 index。
- ImgNumber setter 接受普通 string，不只接受 number；缺 glyph、控制字符、非 NFC 或坏 surrogate 继续由 image-string strict contract拒绝。

### 关键决策

1. **扩展 Popup v1 layer union，不建立旁路 text 表**
   - award tier `layers` 与 Spine `overlays` 共用 `text` / `image-string` node 类型；font/image-string 都继续通过 `resources` 正向引用。
   - 新 `text` layer 包含 `name/defaultText/resource/font style/anchor/transform/visibleSegments`；新 manual image-string 包含 `name/defaultText/binding/anchor/transform/visibleSegments`。
   - award 旧 amount layer 可省略 `name`，parser 规范化为保留名 `win-amount`；新 canonical export 写出名字。其它新节点必须显式命名，不根据 resource、layer id 或数组位置猜名字。
   - 保持 `version: 1`：新增 union member和可选字段不改变旧文件语义，延续 task 163 的 additive v1 边界；unknown field/kind 与未来 version 仍失败。

2. **style 使用严格、可完整复验的数据合同**
   - color 统一为 canonical CSS hex；gradient 至少两个 stop，offset 为升序 `0..1` 且必须覆盖 `0` 和 `1`，angle 为 finite degree。
   - stroke 为可选 `{color,width}`，width 非负；shadow 为可选 `{color,alpha,blur,distance,angleDegrees}`，各字段严格 finite/range 校验；省略表示关闭，不保存 enabled + stale values。
   - `fontSize` 为正数，`letterSpacing` 为 finite，anchor 在 `0..1`，transform 的 `x/y/rotation` finite、scale positive；不 clamp、不猜默认特效。

3. **直排与弧排由同一个 rendercore styled-text owner 管理**
   - `arcDegrees=0` 使用单个 Pixi Text，保留字体 shaping/kerning，并在 authored bounds 上应用 solid/gradient、stroke 和 shadow。
   - 非零弧度使用 `Intl.Segmenter` 的 grapheme cluster、TextMetrics advance 与总 arc length 求半径，按中心 anchor 分布并沿切线旋转；不按 UTF-16 code unit 拆字。
   - 曲排 gradient 以整串的 normalized reading progress 取色/切分 stops，不能让每个 glyph 从 gradient 起点重新开始。
   - `setText()` 先完成 string/style/metrics/layout 与新 children prepare，再一次性 commit；失败保留旧画面。renderer destroy 释放 Text、gradient 和 container，不销毁 package-owned FontFace。

4. **用稳定 string-node registry 统一两个 player 的游戏接口**
   - public `PopupStringNodeHandle` 暴露 readonly `kind/name/index/text`、`setText()` 和 `resetText()`；两个 player 提供 readonly node lists 与 `getTextNode(name | index)` / `getImageStringNode(name | index)`。
   - registry 不公开可 destroy 的内部 Text、RenderImageString 或 borrowed Container。selector 必须大小写精确；不提供 alias、模糊匹配或首项 fallback。
   - manual node override 跨播放与 tier 保持；reset 恢复 manifest default。award `win-amount` reset 恢复 player formatter，override 时 raw count/stage 继续但显示和 `formattedAmount` 使用 override。
   - 同名 award variants 共享一个 handle和当前 string；tier prepare/rebind 只切换 resource/style/transform，不替换 handle identity。

5. **保留 legacy prompt 和 production consumer 边界**
   - `spine.prompt` 继续 parse/play；其 runtime 以保留名 `prompt` 加入 text node list，`start(text?)` 保持现有 per-play convenience。新 editor 节点不借 prompt 字段保存高级样式。
   - Popup Editor 预览直接调用 public handle setter，证明游戏真实 API；Game Layout Editor 继续只读 vendor，不增加 nested effect controls。
   - package-resource、namespace/rewrite、Scene Layout ZIP 和 CLI 只处理 typed resource/name/style 字段；gradient color/string 不做路径扫描或重写。

## 5. 职责与合同

- **rendercore popup manifest/resource**：拥有 node/style schema、strict parse、font/image-string exact closure、namespace rewrite、prepare/rollback/destroy。
- **styled-text renderer**：拥有 TextStyle 投影、straight/arc layout、gradient continuity、atomic string update 和 Pixi child lifecycle。
- **popup string-node registry**：拥有 name/index、logical variant、override/reset 与 exact selector；不拥有业务翻译。
- **Award player**：继续拥有 win raw、formatter、count/tier/segment、amount variant rebind，并把其显示接到 reserved `win-amount` handle。
- **Spine player**：继续拥有 start/loop/end、click latch、legacy prompt 和 overlay phase；新增节点不得成为 completion authority。
- **Popup Editor**：拥有 draft/UI/资源 binding/effect authoring/preview/ZIP；不复制 gradient/arc pixel算法或 player 状态机。
- **Layout/CLI/gameframeworks**：只读透传、typed rewrite、vendoring 与 public type facade；游戏通过 player handle 提交最终 string。
- **失败策略**：未知字段/kind/style、非法 name/order/color/stop/arc/string、缺 font/glyph/resource、同名 kind 冲突、坏 selector、metrics/layout failure、destroy 后调用、hash/path/size/orphan 全部显式失败。
- **禁止行为**：不猜资源或名字、不按 filename 建 identity、不静默改名/clamp/fallback、不扫描任意 JSON string、不让 game/editor 操作内部 display tree。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/styled-text.ts
packages/rendercore/src/popup/string-node-registry.ts
packages/rendercore/tests/popup/styled-text.test.ts
packages/rendercore/tests/popup/string-node-registry.test.ts
tasks/167-popupeditor-styled-text-and-imgnumber-nodes-<utctime>.md
```

文件名可按现有边界小幅调整，但弧形算法与 registry 不放进 editor。

### 预计修改

```text
packages/rendercore/src/popup/{types,manifest,package-resource,index,award-player,spine-player,spine-overlay-runtime,prompt-text}.ts
packages/rendercore/tests/popup/{fixtures,manifest,package-resource,award-player,spine-player,spine-overlay-runtime}.test.ts
packages/rendercore/tests/scene-layout/{package-resource,package-runtime,production-zip}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/{popup-zip,resource-import}.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/styles.css
apps/popupeditor/tests/{project,resource-import,preview,app-shell}.test.ts
apps/popupeditor/README.md

apps/gamelayouteditor/tests/{popup-package,zip-io,layout-preview}.test.ts
apps/gamelayoutpkgcli/tests/{reference-rewriter,package-flow,asset-groups}.test.ts
packages/gameframeworks/tests/scene-layout-template.test.ts

docs/popup-manifest.md
docs/agent-rules/{editor-artifacts,shared-game-runtime,scene-layout}.md
```

只有直接测试暴露 type/rewrite 缺口时，才最小修改对应的
`apps/gamelayouteditor/src/io/*`、`apps/gamelayoutpkgcli/src/*`、
`packages/rendercore/src/scene-layout/*` 或 `packages/gameframeworks/src/*`，并在报告说明。

### 原则上不应修改

```text
packages/rendercore/src/image-string/**
packages/rendercore/src/spine/**
packages/editorresource/**
packages/browserartifactio/**
packages/vnicore/**
packages/logiccore/**
apps/imgnumbereditor/**
apps/game002/**
apps/game003/**
assets/**
AGENTS.md
pnpm-lock.yaml
```

若实现需要改 image-string glyph schema、字体加载协议、Popup version、真实游戏 assets 或业务 trigger，必须先说明范围扩张，不能事后修改计划来合理化。

## 7. 实施步骤

1. **确认基线与旧 Popup parity**
   - 重读本计划、三份领域规则和当前 public schema/API，核对 HEAD/status。
   - 先固定旧 award、旧 Spine、task 163 prompt/overlay、amount formatter/rebind、Popup ZIP/Layout ZIP 的回归 fixture。

2. **建立 strict text/image-string node schema**
   - 扩展共享 type、parser、resource use collection、direct/mapped namespace rewrite 和 canonical export。
   - 实现 name/variant/index、style union、visible segment、manual/win-amount binding规则；award 每档保留 exactly-one win amount。
   - 覆盖 old normalization、unknown/cross-kind fields、重复名字/order、跨 tier kind 冲突、非法 effect/arc/default string、missing/orphan 与 direct/mapped round-trip。

3. **实现 styled-text renderer 与 string-node registry**
   - 实现 straight/arc metrics、grapheme layout、tangent rotation、solid/gradient、stroke/shadow和 atomic update。
   - 实现 stable handle/list/selector、override/reset、inactive award variant 与 destroy guard。
   - 单测精确断言 glyph positions/rotations、正负/零弧度、gradient progress、anchor、长短/空 string、invalid metrics、prepare failure rollback 与幂等 destroy。

4. **接入两个 production player**
   - award layer runtime增加 styled text 与 manual ImgNumber；把现有 amount rebind接入 reserved handle，保持 count/advance/dismiss状态机。
   - Spine overlay runtime增加 styled text 与 manual ImgNumber；legacy prompt 注册为 `prompt`，但主 Spine completion仍是唯一结束权威。
   - 覆盖按名/index修改、重复播放、部分 tier variant、跨 tier resource/style切换、amount override/reset、segment visibility、early click、immediate dismiss与 cleanup。

5. **扩展 Popup Editor authoring 与 preview**
   - award tier 和 Spine overlay 都提供“添加系统文字 / 添加 ImgNumber”；不再用“替换唯一 ImgNumber”阻止 manual 节点。
   - UI 编辑 name、default string、resource、order、transform、anchor、visible segments及全部基础 effect；互斥 fill与可选 effect不保留 stale export字段。
   - Build preview 继续走真实 export/import/package prepare；节点选择器列出 name/index，preview string通过 public handle即时设置/reset。
   - import/export恢复 exact draft、名字、variant、style与 bytes；非法导入原子失败且不替换当前 project。

6. **保护 Layout/CLI/game facade 直接依赖链**
   - 用 Popup -> Layout -> optimized package -> reimport round-trip证明新增 font/image-string引用只 vendor一次，hash/map/path/asset-group完整。
   - 证明 Scene Layout/runtime surface返回的 player可列举和按 name/index修改节点；gameframeworks类型无需业务 adapter。
   - Game Layout Editor保持内部只读，不把 preview override写入 Scene Layout manifest。

7. **文档、视觉验收与收尾**
   - 更新 Popup schema/API、两份 README和三份最小领域规则，明确 arc数学、index顺序、override/reset与 legacy prompt边界。
   - 按第 8 节执行 L2 验收；用真实字体、ImgNumber与 Spine/VNI资源完成浏览器视觉验收。
   - 检查目标 diff和旧 fixture parity，生成任务 167 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- parser测试同时覆盖两种 Popup、旧文件、canonical新文件和 strict failure；不能只靠 TypeScript类型。
- styled-text测试使用可注入 metrics验证数学与 transaction，不把 fake metrics称为真实字体视觉结果。
- player测试通过真实 public handle观察显示 string、active variant和snapshot，不直接修改私有 Pixi child。
- round-trip测试断言完整结构、名字、effect数值、资源 bytes/hash/path与 canonical output，不只断言文件存在。
- cleanup覆盖 package prepare失败、preview rebuild、tier rebind、Popup replace、layout reimport和最终 destroy。

### 验收级别

`L2`。任务修改 rendercore popup public player API、versioned manifest union、正式 Popup/Layout ZIP typed reference，并影响 Popup Editor、Scene Layout、CLI 和 gameframeworks 直接 consumer；需要直接依赖链验收，但不涉及根工具链、lockfile或 release，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks format:check
git diff --check
```

失败时先缩小到 manifest、styled-text、player registry 或 nested ZIP 对应 case，不立即运行根级 test/typecheck/build。

### 人工验收

1. Node 24 下启动 Popup Editor，导入真实 WOFF2/OTF、包含金额字符的 ImgNumber、official Spine/VNI；在 award big/super/mega 配置 `congratulations` 与 `win-amount`，还原参考图的白/红描边、投影、金色渐变与弧形效果。
2. 分别把 arcDegrees 设为负值、0、正值，确认方向、居中、字距、切线旋转、gradient连续，直排字体 shaping未退化；修改长短/中英文 string确认无裁切或旧 glyph残留。
3. 在 award 增加额外 manual ImgNumber，在普通 Spine 增加至少两个 text和两个 ImgNumber；按名字和 index逐个 set/reset，确认只改变目标节点。
4. 让同一 logical award text在不同 tier使用不同字体/style/transform，并只在部分 tier存在；跨档确认 handle identity/string保持且 inactive节点不泄漏显示。
5. 覆盖 `win-amount` string后继续计数/切档，再 reset恢复自动格式；核对 snapshot与画面一致，advance/dismiss/end行为不变。
6. 导出/reimport Popup ZIP，再经 Game Layout Editor导出/reimport Layout ZIP并运行 CLI优化；确认节点配置、字体/ImgNumber bytes、hash去重、typed reference与运行时setter均无损。
7. 导入旧 award、旧无 prompt Spine和 task 163 prompt Popup，确认旧画面与 API兼容；destroy/replace后旧句柄调用必须显式失败且无 FontFace/texture/player泄漏。

### 独立验收建议

`必须`。涉及跨包 public contract、versioned Popup/Layout ZIP、FontFace/Pixi/image-string ownership、原子 string update和 tier variant重绑。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor test
pnpm --filter gamelayouteditor --filter gamelayoutpkgcli test
git diff --check
```

独立验收者至少目视一次真实曲排 gradient/stroke/shadow，以及 award amount override/reset跨 tier行为。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell没有 Node时运行 `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；仅下载实际失败后设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改 lockfile。Pixi Text/TextMetrics、FontFace owner、image-string renderer与现有 editor工具链足够；若不够必须先说明缺口与影响。

## 10. 生成物、文档与规则

- 本任务不修改 YAML或 generated TypeScript，不需要 generator/parity checker；正式 ZIP由现有 exporter生成，禁止手改。
- 更新 `docs/popup-manifest.md` 的 node/style/selector/override合同；更新 Popup Editor和RenderCore README。Layout/CLI README只在实际 workflow或可观察输出变化时最小更新。
- 新的共同节点 ownership与游戏只通过句柄改string是稳定职责边界，更新 `editor-artifacts.md`、`shared-game-runtime.md`、`scene-layout.md`；不修改根 `AGENTS.md`。
- 精确资源、视觉截图和执行证据只写任务报告，不写入长期规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/167-popupeditor-styled-text-and-imgnumber-nodes-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录实际文件、最终 schema/API、弧形/gradient决策、资源生命周期、自动化结果、人工验收、偏差和剩余风险；不收集无关全仓 coverage、历史矩阵或 profiler数据。

## 12. 风险、假设与待确认

### 风险

- 曲排逐 grapheme渲染不能完整保留跨 grapheme连写；直排必须保持整行 Text，曲排对复杂 joining script的限制需在文档和真实字体验收中明确，不能静默声称与直排 shaping等价。
- stroke/shadow会扩张视觉 bounds，arc与anchor计算若只用逻辑 advance可能产生偏移或裁切；算法和视觉验收必须同时覆盖。
- award同名 variant在不同字体/ImgNumber resource间切换时，目标 string可能缺 glyph；必须在可见提交前失败并保留旧 tier，不可半提交。
- `win-amount` override可能使 raw snapshot与显示string语义不同；formatted string必须报告真实画面，并在 reset后重新同步当前 raw值。
- 旧 prompt保留名与新节点命名可能冲突；parser必须在prepare前拒绝，不能重命名任何一方。

### 假设

- “弧度”仅要求单行圆弧 baseline，不要求任意路径编辑或多行扇形排版。
- 系统文字使用显式 package-owned字体；浏览器只在已加载字体缺 glyph时沿 task 163 family chain fallback，字体加载失败仍显式失败。
- 新 string override是runtime状态，不写回配置；编辑器要改变正式默认文案时修改draft的 `defaultText`。

### 待确认

无。若执行目标扩大为接入 game002/game003真实获奖资源或业务触发，需要另行确认资源、名字、档位与发布范围。

## 13. 完成清单

- [ ] 两类 Popup 的多个系统文字/ImgNumber authoring、效果、名字和运行时修改满足需求。
- [ ] award mandatory `win-amount`、额外 manual节点、tier variant和旧 Popup兼容均受测试保护。
- [ ] public API、schema、typed rewrite、exact closure与resource生命周期符合计划。
- [ ] arc/gradient/stroke/shadow自动化数学验证与真实视觉验收已明确区分。
- [ ] Popup/Layout/CLI round-trip、README、领域规则和L2验收已同步。
- [ ] UTC中文执行报告已生成，偏差与未完成人工项已记录。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的三份领域规则、本计划与 Popup schema文档；
2. 核对Git基线和工作区，保留用户已有与无关修改；
3. 按计划先锁定旧Popup parity，再实现schema、renderer、player、editor与consumer；
4. 小幅适配当前代码时写入报告，Popup version/真实游戏/新依赖等重大扩张先停止说明；
5. 只运行计划指定的L2验收，失败先最小化复现；
6. 不用fake metrics/单测冒充真实字体、gradient与弧形视觉验收；
7. 完成后生成UTC中文执行报告；除非用户明确要求，不commit、不push、不创建PR。
