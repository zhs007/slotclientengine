# 163 popupeditor-spine-prompt-layers 任务计划

## 1. 目标与完成定义

### 目标

补齐 task 161 普通 Spine Popup 的点击提示表现能力：Popup Editor 可为 `type="spine"` 弹窗配置一条单行提示文字、默认文案、字体文件、渲染区域和叠加装饰层；rendercore 在每次播放时接受游戏传入的已翻译 `string`，未传时使用 package 内默认文案，并按渲染区域自动缩放文字。

装饰层是 Popup owner 内的可选有序 overlay，可使用图片、official Spine 4.3 或 runtime VNI，并配置位置、缩放和旋转。Game Layout Editor 继续把 Popup package 当只读 dependency，可用自定义 preview 文案验证 production runtime；相同字体 bytes 在 Layout ZIP 与运行时均按完整 SHA-256 复用。

### 完成定义

- [ ] 既有无提示、无装饰层的合法 task 161 `type="spine"` Popup 继续 parse、导入、播放、layout vendoring 和重导，不改变 start → loop → end 点击边界。
- [ ] 新 Spine Popup 可选配置一个 prompt：绑定 exact 字体资源、非空单行默认文案、颜色、z-order 和 popup-root 坐标中的中心式 `x/y/width/height` 渲染区域。
- [ ] rendercore `SpinePopupPlayer.start(text?)` 接受游戏已经翻译的单行 string；省略参数使用 manifest `defaultText`，非法空文本或换行显式失败。
- [ ] prompt 始终单行、关闭换行；runtime 在字体加载完成后测量实际文案，在区域内按宽高共同约束求最大可用字号并居中，不把字号作为第二份手工配置。
- [ ] prompt 在 start/loop 显示，主 Spine 进入 end 时隐藏；重复播放可使用不同 string，上一轮文字和测量结果不泄漏。
- [ ] 浏览器对已成功加载字体中的缺失 glyph 使用正常 font-family fallback；rendercore 不做字符集探测、语言分支、替换字符或 image-string fallback。字体文件缺失、格式错误或加载失败仍显式失败。
- [ ] Spine Popup 可添加、删除、排序图片/Spine/VNI overlay；每层可配置 `x/y/scale/rotation`，图片可配置 anchor/可见 segment，Spine/VNI 使用现有 strict playback 合同。
- [ ] Popup Editor 可导入受支持字体、显式绑定 prompt、编辑默认/preview 文案与区域、编辑 overlay 并用 production player 预览；ZIP export/import/export 保持配置和 bytes 无损。
- [ ] Game Layout Editor 可对导入的新 Popup 使用 manifest 默认文案或临时 preview 文案播放；内部 prompt、字体、overlay 和坐标仍只读，需回 Popup Editor 修改。
- [ ] 两个 Popup 使用相同字体 bytes 时可保留独立 logical owner/key，但 FontFace 只加载一份，最终 `assets.map.json` 指向同一 hash payload 且 ZIP 只包含一份物理字体文件；最后 owner destroy 后才释放运行时字体。
- [ ] Popup/Scene Layout 文档、相关 README、领域规则、CLI typed rewrite 和 gameframeworks public type parity 同步，完成 L2 验收并生成任务 163 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/popup` 的 font resource、strict prompt/overlay schema、字体 prepare/ref-count registry、单行区域自适应算法和 Spine Popup player 接入。
- Popup Editor 的字体 source discovery/review/commit、prompt draft/UI、默认与临时 preview 文案、overlay authoring、diagnostics 和 ZIP round-trip。
- Game Layout Editor 的新 Popup dependency 校验、只读 metadata、preview string 输入、字体 media type、layout ZIP vendoring/reimport 和 hash 去重证明。
- `packages/editorresource` 对 `.woff2/.woff/.ttf/.otf` 与对应 `font/*` media type 的 strict filename-key/content-addressed 支持。
- `apps/gamelayoutpkgcli` 对字体资源的 pass-through、typed Popup reference rewrite、hash/map/path/size/orphan 与 asset-group closure parity。
- `gameframeworks` 对更新后的 `SpinePopupPlayer.start(text?)` public contract 的最小类型/测试同步。

### 不包含

- 不在 rendercore 内翻译文案，不接入 i18n 库、语言表、locale、服务器文案或游戏专属 key；游戏只传最终 string。
- 不做字体子集化、转码、合并、字形覆盖扫描、CJK 特判、远程字体下载或缺字告警。
- 不支持多行、自动换行、富文本、HTML、逐字动画、手工字号、动态字重、斜体、letter-spacing 或文本 rotation。
- 不把 prompt 做成 award-celebration ImgNumber/image-string，也不修改 award 金额格式、tier 或点击状态机。
- 不增加新的 Popup discriminator；能力只扩展现有 `type="spine"`，旧无 prompt manifest 保持合法。
- 不让 Game Layout Editor 改写 nested Popup prompt、overlay 或字体；它只提供 runtime preview string 和现有 root placement。
- 不修改 task 162 的 mode/transition ownership、MP4 手势边界、game002/game003 业务触发或 production assets。
- 不新增依赖、不修改 lockfile、根工具链或无关 package。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T04:30:56Z
HEAD: 38ccd2a4f5c2aa864fa8b30c53c3f5d91835dc01
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与计划输入：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
docs/agent-rules/scene-layout.md
tasks/templates/task-plan.md
tasks/161-popupeditor-spine-popup.md
tasks/161-popupeditor-spine-popup-260804-095621.md
tasks/162-gamelayouteditor-multi-package-transition-popup.md
tasks/162-gamelayouteditor-multi-package-transition-popup-260805-041639.md
```

目标目录不存在更深层 `AGENTS.md`。

当前实现结论：

- `packages/rendercore/src/popup/types.ts::PopupResourceSpec` 只支持 image/image-string/VNI/Spine；`SpinePopupManifestV1.spine` 只有一个主 Spine resource、transform 和 segmented animations，没有 prompt 或 overlay。
- `manifest.ts::parsePopupManifest()` 对 Spine Popup 要求 resources 只能含主 Spine root；owned path 扩展名也不接受字体，新增字体/overlay 前必须同步 strict referenced-resource 与 orphan 规则。
- `spine-player.ts::DefaultSpinePopupPlayer` 只创建主 Spine child，`start()` 不接收文案；现有 loop boundary、early click latch、immediate dismiss 和 destroy 已由 task 161 测试保护，扩展时不得复制或改变该状态机。
- `award-player.ts` 已有 image/Spine/VNI layer runtime、segment visibility 和 resource lifecycle，但 transform 没有 rotation，且混有 ImgNumber/tier 语义；可抽取通用非文字 leaf adapter，不能让普通 Popup 依赖 award tier 状态机。
- Popup Editor project 虽是 `award-celebration | spine` 判别 draft，Spine 分支目前只编辑主 resource/animation/transform；importer 未识别字体，preview 只调用无参数 `start()`。
- Game Layout Editor 已把多个 Popup 按 manifest id 命名空间化并只读 vendor；`LayoutPreview.playSpinePopup(id)` 调用无参数 `start()`。task 162 已证明 logical owner 独立、最终 `assets.map.json` 以 SHA-256 合并相同 physical payload。
- `apps/gamelayouteditor/src/io/exported-layout-zip.ts::layoutMediaType()`、`packages/editorresource::assertMediaTypeMatchesExtension()` 和 CLI fixture/media helpers 尚不认识 font media type，因此仅扩展 Popup parser 仍无法完成 production ZIP。
- `packages/game-ui-leo/src/assets/font/Anton-Regular.woff2` 与 `NotoSansR.woff2` 可作为执行期本地浏览器验收输入；本任务不复制或迁移它们到 Popup/asset production 目录。

当前 schema、播放器、编辑器与 ZIP 测试已足以制定计划，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “文字内容由游戏传入并翻译”表示 rendercore 接收最终显示 string，不知道 translation key 或 locale；Popup package 的 `defaultText` 只用于无覆写时和编辑器预览。
- “根据渲染区域决定文字大小”表示 manifest 不保存 `fontSize`。区域以 popup 中心坐标系中的中心点 `x/y` 和正数 `width/height` 表达，runtime 对每次实际 string 重新测量并自动 fit。
- “一定是单行”既是 authoring 约束也是 runtime 输入约束；所有 Unicode line terminator 均拒绝，不通过压缩空白或截断来伪造单行。
- “配置字体无法渲染时浏览器切本地字体”只适用于 font 已成功加载但缺 glyph。资源本身坏、浏览器拒绝字体或 FontFace prepare 失败不是同一情况，必须失败而不是静默使用系统字体。
- “叠加图片层”统一建模为 optional overlay layer，不新增专用 background 字段。图片、Spine、VNI 都可添加多项并排序；prompt 与 overlay 共享 z-order，主 Spine 始终是底层。
- Game Layout Editor 的“预览文字”是 session-only runtime input，默认取 nested manifest `defaultText`；它不进入 layout manifest，也不改变 Popup owner ZIP。

### 关键决策

1. **在 Popup v1 的 Spine 分支增加可选字段，保留 task 161 manifest**
   - `spine.prompt?` 保存 `font/defaultText/fill/order/area`；`spine.overlays?` 保存有序 image/Spine/VNI union。
   - 字体作为 `PopupResourceSpec { kind: "font", path }` 进入 exact closure；prompt.font 必须引用 font，overlay.resource 必须与 layer kind 精确匹配。
   - prompt 与 overlay 的 order 全局唯一；主 Spine 固定在全部 overlay 之下。省略 prompt/overlays 的旧 manifest 不生成 placeholder、默认字体或默认装饰层。
   - award 分支不允许引用 font；所有新增资源仍必须从 prompt/overlay 正向可达，未引用 resource 显式失败。

2. **单行区域 fit 属于 rendercore 的唯一算法**
   - prompt area 的 `x/y` 是中心，`width/height` 必须 finite positive；Text anchor 固定中心，`wordWrap=false`。
   - runtime 先以区域高度作为测量字号，再依据实际 Text metrics 按 `min(width/textWidth, height/textHeight, 1)` 缩放，最终视觉 bounds 不超过区域；零/非有限 metrics 显式失败。
   - 每次 `start(text?)` 在显示前完成验证和重新布局。显式 string 原样显示；只用 trim 判断非空，不改写空格、大小写或 Unicode code point。
   - prompt 只在 start/loop 可见，进入 end 即隐藏；main Spine 的 complete 仍是 Popup complete 的唯一权威。

3. **字体资源以完整 SHA-256 注册和复用**
   - importer 只接受 magic 与扩展名一致的 WOFF2、WOFF、TrueType 和 OpenType；media type 分别为 `font/woff2`、`font/woff`、`font/ttf`、`font/otf`。
   - package prepare 对 font bytes 求完整 SHA-256，以 digest + format 建立进程内 ref-count registry 和稳定 namespaced family；同 bytes 并发 prepare 复用同一个 Promise/FontFace。
   - family chain 为 `[registeredFamily, sans-serif]`，让浏览器自然完成缺 glyph fallback；不检测 glyph coverage。
   - prepare/后续 resource 失败时释放本次引用；最后一个 package resource destroy 后从 `document.fonts` 移除 owned face。测试通过注入 font loader/metrics，不伪装真实浏览器字体结果。

4. **overlay 复用通用 leaf runtime，不复制动画 transport**
   - 把 award player 中可复用的 image/Spine/VNI layer adapter 抽到 popup 内部共享模块；award 的现有行为、ImgNumber parent 和 tier orchestration保持不变。
   - 新 overlay transform 明确包含 degree `rotation`；image 继续显式 anchor/visibleSegments，Spine 继续大小写精确 start/loop/end，VNI 继续 strict `segmented | once`。
   - overlay 的动画随主 Popup phase 进入相应 segment，但不取代 main Spine completion/loop boundary；任一 leaf init/update 失败按 player transaction 清理并向宿主抛错。

5. **Layout Editor 只透传 owner package并验证 hash dedup**
   - Popup Editor ZIP 中字体与其它 leaf 一样使用 filename key + content-addressed payload。
   - task 162 的 per-Popup logical namespace 保留；两个 owner 可有不同 font logical key，但最终 map entry 的 `path/sha256/byteLength/mediaType` 必须一致，payload map 只写一次。
   - Layout preview 新增临时单行输入并调用 `player.start(text?)`；nested prompt/overlay metadata 只读，替换同 id Popup 时沿用现有 placement/transition/programmatic binding transaction。
   - CLI 不转码字体，只通过 Popup typed rewriter/collector携带 exact font leaf，并复验 asset group ownership 与 optimized package parity。

## 5. 职责与合同

- **rendercore popup manifest/resource**：拥有 font/prompt/overlay schema、strict parse、exact closure、font prepare/ref count、rollback 和 destroy。
- **rendercore SpinePopupPlayer**：拥有 main start/loop/end、点击锁存、prompt text validation/fit/visibility、overlay phase drive 和 display lifecycle。
- **Popup Editor**：拥有字体与装饰资源导入、draft、显式 binding、表单、临时 preview string 和 standalone ZIP；不翻译文案，不实现另一套 Text fit/动画状态机。
- **Game Layout Editor**：拥有 Popup dependency library、root placement、session preview string、vendoring 和 reimport；nested Popup 表现只读。
- **editorresource/browserartifactio**：拥有 media type/extension、Web Crypto SHA-256、content path、map/hash/size/orphan 和 physical payload 去重。
- **Package CLI**：拥有 optimized package typed rewrite、font pass-through、asset-group closure 与 parity；不检查字体 glyph 或重编码字体。
- **gameframeworks/game app**：facade 暴露 player 类型；游戏先完成翻译，再调用 `start(translatedText)`，或调用 `start()` 使用 manifest 默认文案。
- **资源生命周期**：Popup package prepare 先验证 manifest/bytes/font/main/overlay 全部资源再 commit；FontFace registry ref count、Pixi Text、texture、Spine/VNI player、Blob URL 各由创建方释放，borrowed Scene Layout popup layer 不由 app destroy。
- **失败策略**：未知字段/kind/format、坏 font magic、缺资源、order 重复、非法 area/string/metrics、动画缺失、hash/path/size/orphan、并发 start 和 destroyed-after-use 全部显式失败。
- **禁止行为**：不猜字体/路径/首项/字号，不截断或换行，不把加载失败当 glyph fallback，不合并 logical owner，不扫描任意 JSON 字符串改 path，不复制 popup/Spine/VNI 状态机。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/font-resource.ts
packages/rendercore/src/popup/layer-runtime.ts
packages/rendercore/src/popup/prompt-text.ts
packages/rendercore/tests/popup/{font-resource,prompt-text}.test.ts
tasks/163-popupeditor-spine-prompt-layers-<utctime>.md
```

如现有模块可清晰承载，可合并新增文件；字体 registry、Text fit 与 UI handler 不得互相耦合。

### 预计修改

```text
packages/editorresource/src/{workspace,assets-map}.ts
packages/editorresource/tests/{workspace,assets-map}.test.ts

packages/rendercore/src/popup/{types,manifest,package-resource,index,award-player,spine-player}.ts
packages/rendercore/tests/popup/{fixtures,manifest,package-resource,award-player,spine-player}.test.ts
packages/rendercore/tests/scene-layout/{package-resource,package-runtime,production-zip}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/{resource-import,popup-zip}.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/styles.css
apps/popupeditor/tests/{project,resource-import,preview,app-shell}.test.ts
apps/popupeditor/README.md

apps/gamelayouteditor/src/io/{imported-popup-package,exported-layout-zip,imported-layout-zip}.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/{app-shell,bigwin-workspace,ui-session}.ts
apps/gamelayouteditor/tests/{popup-package,zip-io,layout-preview,app-shell}.test.ts
apps/gamelayouteditor/README.md

apps/gamelayoutpkgcli/src/{image-optimizer,package-reader,package-writer}.ts
apps/gamelayoutpkgcli/tests/{fixtures,package-flow,asset-groups}.test.ts
apps/gamelayoutpkgcli/README.md

packages/gameframeworks/src/index.ts
packages/gameframeworks/tests/scene-layout-template.test.ts
docs/{popup-manifest,scene-layout-manifest}.md
docs/agent-rules/{editor-artifacts,shared-game-runtime,scene-layout}.md
```

仅在 FontFace test seam 确实需要 public typing 时修改 `packages/gameframeworks/src/index.ts`；否则保留现有 re-export，只更新直接类型测试。

### 原则上不应修改

```text
packages/rendercore/src/spine/**
packages/vnicore/**
packages/logiccore/**
apps/symbolseditor/**
apps/imgnumbereditor/**
apps/game002/**
apps/game003/**
assets/**
packages/game-ui-leo/**
pnpm-lock.yaml
AGENTS.md
```

若实现要求更改 official Spine/VNI leaf API、添加多语言系统、写入真实游戏 assets 或把 nested Popup 配置开放给 Layout Editor，必须先说明范围扩张，不能通过修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线并锁定 task 161/162 parity**
   - 重读根规则、三份领域规则、本计划和当前 public schema/API，重核 HEAD/status。
   - 先固定旧无 prompt Spine Popup 的 parse/player/Popup ZIP/Layout ZIP/transition prelude 回归，以及相同 physical bytes 不合并 logical owner 的 task 162 行为。

2. **扩展字体 media boundary 与 Popup strict schema**
   - 给 editorresource 增加四种字体扩展名/media type parity；Popup importer 用 magic + extension识别字体并进入统一 review transaction。
   - 增加 font resource、optional prompt、optional overlay union、area/order/transform/string parser，更新 direct/mapped collector、flatten/namespace/rewrite 和 exact orphan 校验。
   - 覆盖旧 manifest parity、unknown/cross-kind fields、坏字体、缺引用、重复 order、非法 area/defaultText、mapped/direct round-trip 和 namespace rewrite。

3. **实现字体 registry 与单行 Text fit**
   - 在 package resource prepare 中按 SHA-256 + format acquire FontFace；覆盖并发 acquire、same bytes reuse、不同 format、load failure、prepare rollback、idempotent release 和 last-owner removal。
   - 实现可注入 metrics 的单行 fit helper，覆盖短/长 string、width/height limit、Unicode line terminator、空白文本、fallback family chain、零/非有限 metrics。
   - FontFace load 完成前不得创建可播放 prompt；缺 glyph 不进入 validation。

4. **接入 Spine Popup player 与通用 overlay runtime**
   - 抽取并复用 image/Spine/VNI leaf runtime，支持 overlay rotation/order/segment；保持 award ImgNumber/tier 现有测试不变。
   - 扩展 `start(text?)`，在 start 前选择 explicit/default string、布局 prompt、启动 main/overlay；进入 end 隐藏 prompt，complete/immediate dismiss/restart/destroy 清理 display 状态。
   - 覆盖默认/explicit text、不同长度重复播放、early/mid-loop click、overlay phase、layer failure、concurrent start、immediate cleanup 和 destroy。

5. **扩展 Popup Editor authoring 与 production preview**
   - 在 Spine draft 增加 optional prompt 与 overlay collection；new project 预填 `Press any key to continue`，但只有显式选择字体并启用 prompt 后才导出该字段。
   - 资源页支持字体 review/commit；Spine workspace 支持 font、default text、fill、area、order 和 image/Spine/VNI overlay 的新增/删除/排序/transform/playback。
   - preview string 是 session state，可修改后调用 production `start(string)`；default text 修改进入 draft/ZIP，preview string 不进入 manifest。
   - 导入旧 Popup 恢复无 prompt 状态；新 ZIP import/export 恢复 exact font/overlay owner、配置和 bytes，失败不替换当前 project/preview。

6. **接入 Game Layout Editor、Layout ZIP 与 CLI**
   - popup dependency import/replace 识别新 nested closure与 font media type，保持 id/type/placement/transition/programmatic users。
   - Popup preview 面板显示只读默认文案/字体/overlay 摘要，并提供 session-only单行输入；空输入选择“使用默认”而不是传空 string。
   - 增加两个 Popup 共用同 font bytes 的 export/import/export 测试：logical keys 分离、map digest/path 相同、physical payload 一份、删除一个 owner 不丢另一个。
   - CLI 将 font 当非图片 pass-through，typed rewrite/asset groups 收入 exact closure，优化后重新验证 map/hash/mediaType/size/path/orphan。

7. **同步 facade、文档、规则并验收**
   - 更新 `SpinePopupPlayer.start(text?)` 类型测试、Popup/Scene Layout 文档、三个 app/package README 和最小领域规则。
   - 运行 L2 定向自动化验收，整理真实浏览器 font/fit/overlay/Popup ZIP/Layout ZIP 验收清单交给用户，并生成 UTC 中文报告；执行会话不代替用户完成浏览器验收。

## 8. 测试与验收

### 测试原则

- parser/ZIP 测试直接覆盖 font/prompt/overlay typed graph、old-v1 parity、mapped/direct namespace rewrite、missing/orphan 和同 hash physical payload，不只断言导出成功。
- player 测试用 fake FontFace、metrics、Spine/VNI leaf 明确验证 string 选择、fit bounds、phase/z-order、loop boundary、rollback 和 destroy；fake metrics 不能替代真实浏览器视觉验收。
- 缺 glyph 不写成 strict failure 测试；只证明 style family chain 保留 browser fallback。字体文件坏或 `FontFace.load()` 拒绝必须是 strict failure。
- 不为旧 fixture 保留“Spine Popup resources 只能一个”的过时期望；旧无 prompt package 的用户可观察行为必须保持。

### 验收级别

`L2`。本任务修改 rendercore public player signature、Popup manifest/resource union、正式 Popup/Layout ZIP exact closure、editorresource media contract和 Game Layout/CLI 直接 consumer；不修改根工具链、lockfile或 release，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/editorresource --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/editorresource --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/editorresource --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/editorresource --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks format:check
git diff --check
```

### 用户人工验收

以下浏览器验收由用户执行。执行会话只需交付可复现步骤，并在报告中标为“待用户验收”；不得用 fake runtime、单测或 build 冒充已通过。

1. 在 Popup Editor 导入一个 task 161 Spine root、`Anton-Regular.woff2` 和一张背景图；启用 prompt，配置区域/颜色/order 与图片 rotation，分别用默认和更长的临时文案播放，确认单行居中且不越界。
2. 添加一个 Spine overlay 和一个 VNI overlay，观察 start/loop/end；在 start 和 loop 中段点击，确认 prompt 进入 end 时隐藏、主 Popup 仍只在真实 loop boundary 后收尾。
3. 用含 Anton 未覆盖字符的单行 string 检查浏览器本地 glyph fallback；再导入破损字体，确认后者明确失败且不提交 project。前者只做视觉确认，不把具体 fallback 字体名称写入合同。
4. 导出/重导 Popup ZIP，确认字体、默认文案、区域、overlay、transform/playback 和 bytes 无损；重导旧 task 161 ZIP，确认仍无 prompt 且播放正常。
5. 在 Game Layout Editor 导入两个共用同一字体的 Popup，分别用默认/临时文案预览并导出 Layout ZIP；检查两个 logical font key 指向相同 SHA/path、物理字体 payload 只有一份，重导后两 Popup 均可播放。

### 独立验收建议

`必须`。本任务涉及跨包 public contract、FontFace ref-count lifecycle、正式 Popup/Layout ZIP 与 hash 去重。独立自动化复验重点：

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor test
pnpm --filter gamelayoutpkgcli test
git diff --check
```

真实浏览器自定义字体、长单行 auto-fit、缺 glyph fallback 和主 Spine + overlay 完整点击收尾仍由用户按上方清单验收，不属于独立执行者代跑范围。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只运行 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改 lockfile；浏览器 `FontFace`/`document.fonts`、Pixi Text、browserartifactio SHA-256 和现有 editorresource/ZIP 工具已足够。
- 单测使用注入 loader/metrics，不需要下载字体；人工验收可只读使用仓库现有 `packages/game-ui-leo/src/assets/font/*.woff2`。

## 10. 生成物、文档与规则

- 本任务修改正式 Popup schema、Popup/Layout ZIP typed graph 和 media contract，必须同步 parser、collector、writer/rewrite、fixtures 与 parity tests；禁止手改生成物或扫描任意 JSON 猜 path。
- 更新 `docs/popup-manifest.md` 的 font/prompt/overlay/string/fit/fallback/lifecycle；更新 `docs/scene-layout-manifest.md` 的 nested font vendoring、session preview 与 hash physical dedup。
- 更新 Popup Editor、Game Layout Editor、rendercore、CLI README，说明可编辑/只读边界、默认与 runtime string、支持字体格式和失败策略。
- 最小更新 `editor-artifacts.md`、`shared-game-runtime.md`、`scene-layout.md`，记录稳定跨任务的 font owner/ref-count、单行 fit、nested readonly 和 physical hash dedup；不把具体字体、任务证据或精确 UI 文案写入根 `AGENTS.md`。
- 本任务不修改 YAML、assets 或 generated game config，因此没有游戏生成器命令。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/163-popupeditor-spine-prompt-layers-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 schema/API、实际文件、字体/overlay lifecycle、hash 去重证据、自动化命令、交给用户的浏览器验收清单、偏差与剩余风险；浏览器项在用户反馈前保持“待用户验收”，不收集无关整仓 coverage、历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- Pixi Text metrics 与实际 fallback glyph 取决于浏览器/平台字体，自动化只能证明 bounds 算法和 family chain，不能证明所有系统的像素一致。
- FontFace 是 document 级共享资源；若 ref count key、并发 Promise 或 rollback 错误，可能提前删除其它 Popup 正在使用的字体或永久泄漏 font face。
- overlay 抽取会触及既有 award player leaf adapter；必须以 award 全量定向测试证明没有改变 ImgNumber parent、tier segment 或 destroy 行为。
- task 162 为不同 Popup 保留 namespaced logical keys；若错误地按 digest 合并 logical key，会破坏 owner-aware replacement/GC。去重只能发生在 registry/physical payload 层。
- 较长翻译会缩小字号；这是区域 fit 的明确结果，不允许换行或溢出，但需要真实设计稿人工确认区域是否足够。

### 假设

- 用户需要的是浏览器可加载的 WOFF2/WOFF/TTF/OTF 单字体文件，不包含 variable-font axis authoring、font collection (`.ttc`) 或多 face family 编排。
- 默认 prompt 文案属于 Popup owner，游戏传入的翻译 string 是一次播放输入，不需要在播放中途动态修改。
- optional overlay 都位于主 Spine 之上；prompt/overlay 通过唯一 order 决定相互层级，不需要把 overlay 插到主 Spine 内部 slot 或其下方。
- `fill` 是首版唯一可配置 Text style；字体文件本身决定 face/weight，浏览器 fallback 决定缺 glyph 的替代 face。

### 待确认

无。若执行目标增加多行、字体轴/多 face、stroke/shadow、slot attachment 或运行中 `setText()`，需先定义新的 schema 与测量/lifecycle 合同，不能在本任务中推断。

## 13. 完成清单

- [ ] 旧 task 161 Spine Popup 与 task 162 multi-package/transition 行为无回归。
- [ ] font/prompt/overlay strict schema、exact closure 和 typed rewrite 符合计划。
- [ ] `start(text?)`、默认文案、单行 fit、浏览器 glyph fallback 和 strict font failure 符合计划。
- [ ] image/Spine/VNI overlay transform/order/playback 与 lifecycle 受测试保护。
- [ ] Popup Editor authoring/preview/ZIP 和 Game Layout Editor readonly preview/vendoring/reimport 完整。
- [ ] logical owner 保留、FontFace 与 physical payload 按 SHA-256 去重、最后 owner release 正确。
- [ ] public API、测试、README、文档、领域规则和 CLI parity 已同步。
- [ ] 指定 L2 自动化、独立复验与待用户执行的真实浏览器验收已分开记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`editor-artifacts.md`、`shared-game-runtime.md`、`scene-layout.md` 和本计划；
2. 核对 Git 基线与工作区，保留用户无关修改；
3. 先固定旧 Spine Popup 与 multi-package parity，再依次实现 schema/font、player、Popup Editor、Layout/CLI；
4. 小幅适配当前文件结构时在报告记录；若要加入多语言系统、多行、slot attachment 或游戏业务触发，先停止说明；
5. 只运行计划指定的 L2 自动化验收；不代跑浏览器验收，将 fake metrics 结果与待用户验收项分开记录；
6. 完成后生成任务 163 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
