# 230 popupeditor-single-state-freeform-popup 任务计划

## 1. 目标与完成定义

### 目标

在现有五状态 `award-celebration` 与三状态 `spine` Popup 之外，新增 strict
`single-state` Popup：它只有一个 active 状态，不要求主 Spine、固定动画段、获奖档位、金额层或任何必选图层，
允许项目从空画布开始添加任意数量的现有 typed 图层（image、字体 text、ImgNumber/image-string、VNI、
official Spine）。

每个图层使用唯一 exact layer id 作为编辑器中的“图层名称”和 runtime identity；图层可挂 Popup root、已存在
Spine 图层的 exact slot，ImgNumber 还可挂已存在 VNI 图层的 exact text layer。Runtime 可按 exact name 取得
borrowed 图层或 ImgNumber handle，修改 ImgNumber string，并通过任务 228 已落地的 `gamelayout:/` 地址取得同一
对象，不公开 raw Pixi/Spine/VNI display tree。

### 完成定义

- [x] Popup latest schema 升级为 v8并新增互斥 `type="single-state"`；合法 v1–v7 先按原版本 strict 校验，再确定性
      规范化为 v8，既有两类 Popup 的数据与行为不变。
- [x] `single-state` 只含一个 active presentation；空 `layers` 合法，不要求主 Spine、start/loop/end、五档、
      threshold、count duration、`win-amount`、VNI 或其它资源。
- [x] 用户可添加任意数量的受支持 typed layer；未知 kind、资源 kind 不匹配、非法 name/order/transform、坏
      playback 或缺失引用显式失败，不用“任意图层”接受未声明 JSON。
- [x] layer id 在单状态 Popup 内唯一，并同时作为 UI 名称、`getLayer(name)` identity 与 task 228 popup-layer
      address segment；不保存会漂移的第二份 name/id 映射。
- [x] parent 只能引用候选项目内已存在的 Spine/VNI layer及其 strict metadata；循环、缺 target/slot/text layer、
      同 parent order 冲突、删除/替换导致引用失效均在 transaction 提交前失败。
- [x] Core 提供 single-state Runtime/player，支持 init、start、manual update、立即 dismiss、phase query、exact
      `getLayer()`、`getTextNode()`、`getImageStringNode()` 与 destroy；宿主仍拥有 Application/canvas/ticker。
- [x] ImgNumber 可按 exact name 在显示前或显示中 `setText()/resetText()`，缺 glyph 时原子失败；字体 text 沿用相同
      exact-name string handle。
- [x] Scene Layout 可显式注册 single-state Popup 并从
      `gamelayout:/popup/<binding-id>/layer/<exact-layer-id>` 取得 borrowed layer，从
      `.../string/image-string/<exact-layer-id>` 取得可改字 handle；list/describe/input 等任务 228 行为保持兼容。
- [x] Popup Editor 新建、导入、编辑、预览、导出和 ZIP 重导支持第三种类型；Game Layout Editor 可导入、显式注册、
      预览及复制其派生地址，但不能把它误绑为 mode award 或 transition prelude。
- [x] public exports、README、schema 文档、最小领域规则、定向测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- RenderCore Popup data 的 v8 type/parser/latest normalizer、typed closure 与 single-state layer/attachment 合同。
- RenderCore Popup core 的 single-state resource validation、layer materialization、borrowed exact-name lookup、
  string registry、presentation、manual update 与 destroy。
- `apps/popupeditor` 的第三种项目类型、单画布 layer workspace、严格 parent picker、preview 与 mapped ZIP 往返。
- Scene Layout data/core 的第三种 Popup binding、package runtime getter、presentation placement、task 228 address
  catalog/endpoint 与 lifecycle。
- Game Layout Editor 对 single-state dependency 的最小导入、显式注册、preview/address readout、closure 与 round-trip。
- RenderCore/Popup Editor/Game Layout Editor 测试、README、Popup/Scene Layout文档和稳定领域规则。

### 不包含

- 不把 single-state Popup 用作 `gameModes[].awardCelebrationPopup`；该 binding 仍只接受
  `award-celebration`。
- 不把 single-state Popup 用作 directed transition `preludePopup`；任务 230 不新增等待、点击锁存或转场业务语义，
  prelude 仍只接受普通 `spine` Popup。
- 不删除或合并现有两种 Popup，不改变 award 五档、普通 Spine 三段、persistent string override 或 per-play
  `preludePopupStrings` 合同。
- 不支持任意未知 layer/plugin kind；首期只复用已存在的 image、text、image-string、VNI、official Spine。
- 不公开 raw Container、Spine player、VNI runtime、Pixi ticker/RAF，不允许 caller destroy borrowed layer。
- 不新增单状态音频 cue target、i18n、金额 formatter、业务状态机、服务器数据或游戏专属 Popup 名。
- 不迁移 Popup Editor 到 EditorCore，不修改 production assets/YAML、ZIP 美术、lockfile 或根工具链。

## 3. 制定计划时的基线

```text
UTC: 2026-08-19T09:54:04Z
HEAD: 6e3726f5ade062c58cc9830efea71d45e0347364
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{editor-artifacts,shared-game-runtime,scene-layout}.md`；目标目录没有补充 `AGENTS.md`。
- 用户写的 `packages/popupeditor` 在当前仓库实际对应 `apps/popupeditor`；versioned Popup data/core/editor 合同位于
  `packages/rendercore/src/popup`，计划按实际 ownership 同时覆盖两处。
- `PopupManifestV7` 仅含 `award-celebration | spine`；`parsePopupManifest()`严格拒绝其它 type，
  `loadPopupManifest()`把 v1–v6 升到 v7。
- `PopupEditorProject.type`、创建 dialog、visibility、project-to-manifest、preview player union均只处理上述两类；
  普通 Spine 导出必须有主 Spine与三段动画，award diagnostics 强制五档、同一 `win-amount` 和三档 VNI。
- 当前 layer union 已覆盖 image/text/image-string/VNI/Spine，v4–v7 attachment 已支持 Popup root、同作用域
  Spine exact slot和 ImgNumber→VNI text layer，并已有 DAG、missing target、slot 与 per-parent order 校验。
- `PopupStringNodeHandle` 已提供 exact name/index、`setText()/resetText()`；两个现有 Runtime 都公开 text与
  image-string lookup，但没有按 name 取得任意 Popup layer 的 public borrowed handle。
- 任务 228 已在当前 HEAD 落地 canonical `gamelayout:/` resolver。它已枚举 Popup layer/string address，但
  `popup-layer` 目前只是 structural endpoint，`popup-string` 只能生成 request input，尚不能直接取得 runtime handle；
  `collectPopupAddresses()`仍递归扫描对象而不是按 Popup typed owner 枚举。
- Scene Layout Popup binding、package runtime/presentation surface与Game Layout Editor draft当前只接受
  `award-celebration | spine`；award绑定到mode，普通Spine可作prelude或显式programmatic注册。
- 本规划会话只新增本计划；未修改实现、安装依赖、运行构建或重型测试。

## 4. 需求解释与技术决策

### 需求解释

1. “只有一个状态”定义为 Popup 自身只有 `inactive → active → complete`，没有 award tier 或
   start/loop/end presentation segment；dismiss 立即结束，不伪造 outro 状态。
2. “没有任何强制配置”指没有类型级必选资源、动画、图层或金额语义；共同的 id/name、adaptation、backdrop、
   空 audio 合同及用户实际新增 layer 的 typed 字段仍必须 strict。
3. `singleState.layers` 允许空数组。添加 image/text/ImgNumber 后静态显示；Spine/VNI 未配置 autoplay 时分别保持
   setup pose/时间零帧，配置 autoplay 时才按 exact animation/timeline 参数播放，不能猜首个动画或循环区间。
4. “通过 name 取”中的 name 使用已有 stable lowercase-kebab layer `id`。Editor 将它标为“图层名称”；不再新增
   一个可与 attachment/address 漂移的平行 `name` 字段。single-state text与ImgNumber的 string name同样从id派生。
5. “父节点已经存在”指编辑 transaction 只能从 candidate draft 当前已存在的 layer metadata 中选择；import仍按
   exact id验证完整 graph，不依赖 JSON 数组先后顺序来制造隐式 parent。

### Schema 与播放决策

- v8新增互斥分支：

  ```ts
  interface SingleStatePopupManifestV8 extends PopupManifestBaseV8<"active"> {
    readonly type: "single-state";
    readonly singleState: {
      readonly layers: readonly SingleStatePopupLayerV8[];
    };
  }
  ```

- single-state layer复用公共 transform/alpha/attachment/resource/style/anchor语义，但不含
  `visibleStates`、`binding="win-amount"` 或 segment字段；ImgNumber只表示 manual string node。
- Spine可选 autoplay 只接受 exact animation与显式 loop；VNI可选 autoplay 只接受完整 once或显式
  loop range/particle策略。字段缺失的静态初始姿态是schema语义，不是运行时 fallback。
- `audio` 继续作为 latest manifest 公共空合同，以保证 package shape与旧 importer一致；本任务不为 active 状态新增
  audio cue，single-state cue非空时strict失败。若后续需要音效，另行扩展Popup audio version。
- v1–v7先用各自允许的 keys/type解析，再升级为v8；不能让 v8 parser 放宽旧源版本，也不能给旧类型写入
  `singleState` 或改变其 visible state/audio行为。

### Runtime 与地址决策

- 新增 `SingleStatePopupRuntime`/editor player，沿用现有 Popup presentation与 layer factory能力；`start()`原子显示
  全部layer并启动显式autoplay，`update()`只推进active dynamic layer，dismiss/destroy逆序stop、detach、release。
- Runtime新增 `getLayer(name): RenderObject`，返回 stable borrowed façade：可使用安全 position/visibility/anchor及该
  layer明确支持的play/stop，`destroy()`显式失败。single-state layer在runtime init后可取；unknown、kind/action错误、
  runtime destroy后访问全部失败。
- `getTextNode(id)`/`getImageStringNode(id)`沿用现有handle与原子glyph validation。ImgNumber string修改不重建
  layer、不改变attachment/order/resource；`resetText()`恢复manifest default。
- 任务228的`popup-layer`从structural endpoint拆为typed borrowed endpoint并提供`get()`；`popup-string`在保留
  `input(text)`的同时增加`get()`。地址从typed Popup catalog收集，不再递归扫描任意object。
- 既有 award/spine layer address保持原字符串与descriptor兼容；其borrowed lookup只作用于当前可用logical runtime，
  inactive variant/stale/destroy显式失败。single-state layer无variant歧义。
- Scene Layout新增`getSingleStatePopup(id)`并按binding type strict分派；该类型只允许显式programmatic注册，
  不进入mode award、prelude或隐式playback状态机。

## 5. 职责与合同

- **Popup data**：拥有 v8 union、single-state typed layers、exact identity、attachment/reference、autoplay与strict
  version normalization；不依赖 Pixi、Editor或Scene Layout。
- **Popup core**：拥有 prepared resource、single-state layer runtime、presentation、manual update、borrowed layer/string
  handle、start/dismiss/destroy；不解释game mode或业务用途。
- **Popup Editor**：拥有新建/编辑transaction、资源picker、已存在parent候选、preview controls与mapped ZIP；不复制
  parser、Spine/VNI metadata或runtime状态机。
- **Scene Layout**：拥有Popup dependency binding、root order/placement、package lifetime和canonical address bridge；
  不编辑Popup内部layer，也不把single-state猜成award/prelude。
- **Game Layout Editor**：只vendor exact Popup package、显式注册、显示派生address和调用同一production runtime预览；
  内部layer继续回Popup Editor编辑。
- **资源生命周期**：Popup package resource由owner prepare并一次commit；layer handle borrowed且不可destroy；Popup/runtime
  destroy使handle stale；失败prepare等待已启动任务收敛并逆序释放texture/font/player/Object URL。
- **失败策略**：unknown type/kind/version/name、duplicate identity/order、missing resource/parent/slot/text layer、cycle、
  bad animation/range、missing glyph、inactive/stale/destroy均显式失败，不回根、不猜首项、不静默降级。
- **禁止行为**：不保存第二份name/address表，不从filename/hash/path生成layer identity，不扫描raw JSON建立地址，不暴露
  raw display tree，不让app复制Popup update或attachment状态机。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/single-state-player.ts
packages/rendercore/tests/popup/single-state-player.test.ts
tasks/230-popupeditor-single-state-freeform-popup-<utctime>.md
```

如 layer runtime能安全复用现有模块，可新增一个共享 `popup/layer-runtime.ts` 并让
`spine-overlay-runtime.ts` 委托；不得复制五种layer materializer。

### 预计修改

```text
packages/rendercore/src/popup/data/{types,manifest,normalize,package-closure,attachment,state-visibility}.ts
packages/rendercore/src/popup/{core/{types,package-resource,index},editor/{index},editor-types}.ts
packages/rendercore/src/popup/{award-player,spine-player,spine-overlay-runtime,string-node-registry}.ts
packages/rendercore/src/scene-layout/{types,manifest,package-resource,package-runtime,presentation-surface}.ts
packages/rendercore/src/scene-layout/core/runtime-address.ts
packages/rendercore/tests/{popup,scene-layout}/**
apps/popupeditor/src/{model,io,preview,ui}/**
apps/popupeditor/{tests/**,README.md}
apps/gamelayouteditor/src/{model,io,preview,ui}/**
apps/gamelayouteditor/tests/**
packages/rendercore/README.md
docs/{popup-manifest,gamelayout-runtime-addresses,scene-layout-manifest}.md
docs/agent-rules/{editor-artifacts,shared-game-runtime,scene-layout}.md
```

### 原则上不应修改

```text
apps/{game002v2,game003v2,gameviewer,gameviewer2}/**
packages/{logiccore,gameframeworks,uiframeworks,vnicore,audiocore,editorcore,editorresource,browserartifactio}/**
packages/rendercore/src/{reel,symbol,image-string}/**
assets/**
{package.json,pnpm-workspace.yaml,pnpm-lock.yaml,AGENTS.md}
tasks/228-*.md
```

执行时若需要把single-state接入mode/prelude、增加新资源/layer/audio kind、修改游戏consumer、公开raw Container、
新增依赖或改变旧Popup地址，必须先说明范围扩张，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与兼容矩阵**
   - 重核HEAD/status、Popup v1–v7 parser/normalizer、五类layer factory、attachment、string registry、Scene Layout
     Popup binding/runtime/address和两个Editor当前行为。
   - 用自包含fixture固定旧两类manifest、runtime phase、address list与ZIP round-trip，区分必须兼容和新能力。
2. **建立 Popup v8 data合同**
   - 新增single-state manifest/layer/autoplay类型、strict keys/parser、typed reference/closure与v1–v7→v8 normalizer。
   - 固定空layers、id即runtime name、string name派生、无状态visibility、attachment DAG与旧类型互斥字段测试。
3. **实现 single-state Core runtime**
   - 抽取/复用五类layer materialization，完成prepare/init/start/update/dismiss/destroy与可选autoplay。
   - 为所有single-state layer建立borrowed RenderObject registry，为text/ImgNumber接入现有string registry；覆盖失败回滚、
     缺glyph、stale handle、parent attachment和destroy顺序。
4. **接入 Popup Editor**
   - create dialog增加“单状态弹窗”；draft只展示一个layer workspace并允许空项目，不显示tier、金额或主Spine三段表单。
   - 复用资源导入与typed layer controls，增加exact layer name、可选autoplay和只来自已存在layer metadata的parent picker；
     rename原子改写引用，删除/覆盖先预检。
   - preview使用single-state editor player，Play/Replay显示active，dismiss立即结束；export/import只写canonical v8并保持map/closure。
5. **接入 Scene Layout、任务228地址与Game Layout Editor**
   - 扩展binding/package prepare/runtime/presentation分派及`getSingleStatePopup()`，保持award/prelude类型限制。
   - 用typed Popup catalog替换递归地址扫描；让popup-layer/string endpoint取得同一个borrowed layer/string handle，保留
     canonical address、descriptor与input行为。
   - Game Layout Editor允许导入/显式注册/preview single-state dependency，显示/copy Popup root、layer与string地址；
     closure/export/reimport保持exact type，mode/prelude picker排除该类型。
6. **同步测试、文档与规则**
   - 更新三包直接测试、Popup v8与runtime address文档、README和最小稳定规则；示例覆盖direct getter与address getter改字。
   - 运行L2定向验收，检查diff/旧值与生成物边界，生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- shared fixture自包含，不读取`assets/**`或真实游戏美术；Editor ZIP fixture使用最小mapped closure。
- parser覆盖v8三分支互斥、空layers、unknown keys/kinds、id/name、resource kind、autoplay与v1–v7 strict升级。
- attachment覆盖root、Spine slot、ImgNumber→VNI text、missing/cycle/self/cross-scope、同parent order、rename/delete/replace。
- runtime覆盖静态与dynamic layer、显式/缺省autoplay、manual update、repeated start/dismiss、string set/reset、missing glyph、
  prepare中失败、destroy与borrowed handle stale。
- address测试核对list/describe/resolve exact一致、percent encoding、popup-layer `get()`、popup-string `get()/input()`、
  unknown/kind mismatch/destroy；不以raw manifest递归碰巧出现的`id/name`建立地址。
- 两个Editor覆盖创建类型、空项目、layer增删改/parent picker、preview、导出重导、Game Layout显式注册及award/prelude排除。

### 验收级别

`L2`。原因是修改RenderCore Popup latest version与public Runtime、Scene Layout public binding/address contract，并接入
Popup Editor和Game Layout Editor两个直接consumer；不涉及根工具链、lockfile、production assets或release，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/manifest.test.ts tests/popup/package-resource.test.ts tests/popup/single-state-player.test.ts tests/popup/layer-attachment.test.ts tests/popup/string-node-registry.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/preview.test.ts tests/app-shell.test.ts tests/resource-import.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts tests/layout-preview.test.ts tests/app-shell.test.ts
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor typecheck
git diff --check
```

如果public export产物变化使consumer typecheck依赖新dist，再将三包定向`build`替换进第五条并在报告说明；不为此运行
根级build/typecheck。

### 人工验收

- Popup Editor创建空single-state项目即可preview/export；依次添加image、字体text、ImgNumber、VNI、Spine，横竖屏下
  backdrop/focus、层序、transform和可选autoplay正确。
- 先添加Spine/VNI parent，再添加child并选择exact slot/text layer；覆盖资源使target消失、删除被引用parent或构造cycle时
  UI阻止提交且preview保持旧画面。
- 在Game Layout Editor导入并显式注册ZIP，确认只读preview和复制地址稳定；它不出现在award/prelude候选中。
- 在最小runtime宿主中分别用direct name和`gamelayout:/`地址取得同一ImgNumber handle，连续改两次string后画面更新，
  reset恢复default；错误name或缺glyph不留下半更新。

### 独立验收建议

`必须`。涉及Popup正式schema升级、跨包public contract、borrowed runtime handle、attachment和异步resource lifecycle。
重点复验v1–v7兼容、single-state destroy/rollback、task228地址不建立第二份identity。复验命令：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/manifest.test.ts tests/popup/single-state-player.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/preview.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的Node.js 24与pnpm；shell没有Node时加载`/Users/zerro/.nvm/nvm.sh`后`nvm use 24`。
- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置现有HTTP/HTTPS proxy并重试。
- 复用现有Pixi、official Spine、VNI、image-string、Popup presentation与Editor resource workspace；不新增依赖、
  不修改lockfile。

## 10. 生成物、文档与规则

- 本任务不修改YAML、production asset或生成TypeScript；Popup/Scene Layout manifest与mapped ZIP是运行时数据，不手改
  fixture外正式交付物。
- 更新`docs/popup-manifest.md`为v1–v8并记录single-state完整schema、layer/attachment/autoplay/string/lifecycle；
  清理当前文档中仍写“v1–v6/current v6”的过时说明。
- 更新`docs/gamelayout-runtime-addresses.md`与`docs/scene-layout-manifest.md`，给出single-state direct/address lookup、
  borrowed ownership、programmatic-only binding和strict failure示例。
- 更新RenderCore与Popup Editor README；只把第三类型、exact name与ownership等稳定边界写入
  `docs/agent-rules/{editor-artifacts,shared-game-runtime,scene-layout}.md`，不把具体fixture或执行证据写入规则。
- 不修改根`AGENTS.md`，不回写任务228历史计划/报告。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/230-popupeditor-single-state-freeform-popup-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终schema/API、实际文件、任务228地址接入、旧版本兼容、
验收结果、未完成人工验收和剩余风险。

## 12. 风险、假设与待确认

### 风险

- v8 union会穿过Popup package、Scene Layout binding与两个Editor；漏掉一个type exhaustiveness分支可能把single-state
  错分派为award，必须用显式switch/never与跨包fixture保护。
- layer既参与attachment又暴露borrowed runtime handle；rename、state重建或destroy若维护两份registry会产生stale指向，
  必须以canonical layer id和owner runtime唯一账本派生。
- Spine/VNI autoplay和caller手动play可能竞争；Runtime需定义start时只启动manifest显式autoplay，后续exact handle命令
  supersede同layer当前播放，不影响其它layer或Popup active phase。
- Game Layout当前Popup UX偏向award/Spine；最小注册支持必须避免把single-state顺手塞入既有业务picker。

### 假设

- 用户所说“任意图层”指当前Popup已支持的typed layer集合，而不是允许未知plugin JSON或任意Pixi对象。
- single-state用于程序显式start/dismiss与按name操作，不承担任务209的transition prelude等待语义。
- layer id可作为用户所称name；该选择与现有attachment identity及任务228地址一致，避免新增平行identity。

### 待确认

- 无。若执行时用户希望single-state直接参与mode/prelude，或需要active audio cue/new layer kind，应作为明确范围扩张先讨论。

## 13. 完成清单

- [x] 目标和非目标已满足，single-state空项目与五类typed layer均可用。
- [x] v8 strict schema、v1–v7 normalization和两类旧Popup行为兼容。
- [x] parent、layer name、string name和task228 address只有一份canonical identity。
- [x] direct与address layer/ImgNumber lookup、set/reset、borrowed/stale/destroy合同完整。
- [x] Scene Layout只显式注册single-state，award/prelude类型边界未放宽。
- [x] 实际修改未超范围，或偏差已在报告说明。
- [x] 测试、README、长期文档和领域规则已按需同步。
- [x] 指定L2自动化已通过，人工验收未冒充自动化。
- [x] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的三份领域规则与本计划；
2. 重核Git基线、Popup latest、任务228 endpoint和两个Editor当前public surface；
3. 按data→core→editor、Popup→Scene Layout→consumer顺序实施，先锁strict schema/fixture再接UI；
4. 小幅文件拆分变化在报告记录，若扩大到mode/prelude/audio/new kind/游戏consumer则先停止说明；
5. 只运行第8节L2定向验收并完成独立复验；
6. 最后生成UTC中文执行报告，不修改历史task文档。
