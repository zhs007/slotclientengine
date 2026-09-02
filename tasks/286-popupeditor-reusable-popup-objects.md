# 286 popupeditor-reusable-popup-objects 任务计划

## 1. 目标与完成定义

### 目标

在 Popup Editor 中增加可复用的 `popup-object`（子对象/预制体）项目。美术可像编辑单状态 Popup 一样组合图片、字体文字、ImgNumber、VNI 与 Spine，
例如统一制作“背景图 + Tap to continue 文字”，再由获奖庆祝、普通 Spine 或 single-state Popup 以一个具名实例整体组合、定位和复用。

`popup-object` 不是可独立弹出或关闭的 Popup：项目级只配置一个稳定 `name`，不拥有 project id、Popup type、重点区域、全屏压暗、金额合同、
状态/tier 或输入生命周期。既有 `popup.manifest.json` 最新版本保持 v9；对象使用独立 `popup-object.manifest.json` v1，并作为 v9 的新增 typed resource/layer
被包含 Popup 消费。

### 完成定义

- [ ] Popup Editor 创建项目 dialog 可选择“Popup 子对象”；对象项目的项目页只编辑一个 lowercase kebab-case `name`，不显示或保存 id、适配重点区域、
      全屏压暗、Popup 类型、金额或状态配置。
- [ ] 对象项目可编辑一组严格命名的 image、text、image-string、VNI 与 Spine 图层，并复用现有 transform、alpha、order、attachment、文字样式、
      widthRange、资源选择和动画配置；对象内部 attachment 只能引用同一对象的 layer，不能引用宿主 Popup 或 `main-spine`。
- [ ] 对象项目使用无 backdrop、无 focus transform 的独立预览；预览 viewport/zoom/guides 只属于 session，不进入对象工件。Play/Replay 只重启对象内部可播放图层，
      不产生 Popup dismiss/input 状态机。
- [ ] 对象可导出、重开 self-contained `<name>-popup-object.zip`；包内包含 strict `popup-object.manifest.json` v1、`assets.map.json` 与 exact transitive
      content-addressed payload，未知字段、缺资源、坏 closure、orphan 或非法引用显式失败。
- [ ] 普通 Popup 项目可从资源入口导入 Popup Object ZIP，经现有 review 显式处理同名不同 bytes 的覆盖/keep-both；导入结果作为一个 typed object resource，
      不把内部图层复制到宿主 draft。
- [ ] award 每档、普通 Spine overlays 与 single-state layers 都可新增 object 实例；实例只配置 exact id、object resource、transform、alpha、order、
      当前 Popup 作用域允许的 attachment，以及普通 Spine 的 segment visibility。
- [ ] 同一 object resource 可创建多个相互独立实例；每个实例在 display tree 中是一个原子 Container，内部 order 不与宿主兄弟交错，实例整体可挂 Popup root、
      合法 Spine slot 或 VNI text layer，并继承宿主 tier/segment/active 可见性。
- [ ] player 通过 exact object instance id 返回 borrowed `PopupObjectInstanceHandle`；内部 `getLayer/getTextNode/getImageStringNode` 使用对象局部 exact name，
      不把 child name 扁平拼接到宿主全局 registry。award 跨 tier 复用同一 object id 时必须保持 exact object resource 不变，使 handle identity 稳定。
- [ ] 对象内部 layer runtime 在实例激活时启动/恢复、隐藏时停止并清理 active playback，随宿主 update 恰好推进一次；对象自身不延长、提前完成或接管宿主的
      award/Spine/single-state completion、advance、dismiss 与 input 边界。
- [ ] Popup v1–v8 source 的 strict parsing/migration 和既有 v9 三种 Popup 保持不变；未使用 object 的 v9 ZIP 字节语义、资源闭包、player API 与 Game Layout
      vendoring 行为不回归，`LATEST_POPUP_MANIFEST_VERSION` 仍为 9。
- [ ] Popup namespace/materialize、EditorCore catalog/export、Game Layout Editor 导入/替换/导出和 Scene Layout production package 对 object nested closure 做 typed
      递归改写与校验，不扫描任意 JSON、不按 filename/hash 推断业务 identity。
- [ ] 完成 L2 定向自动化、真实浏览器人工验收、最小长期文档更新和任务 286 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/popup/data` 的 `popup-object` v1 schema、v9 object resource/layer union、strict parser、引用图、exact closure 与 namespace rewrite。
- `packages/rendercore/popup/core` 的对象资源 prepare、共享 layer-collection runtime、对象实例 handle、activation/update/cleanup/destroy 及三类 Popup player 接入。
- `packages/rendercore/popup/editor` 的对象 standalone inspector/preview façade 与导入导出所需 public contract。
- `apps/popupeditor` 的 object 项目 discriminated model、创建/打开/编辑/预览/导出、普通 Popup 中的 object 资源导入和实例 authoring。
- EditorCore、Game Layout Editor 和 Scene Layout package 对含 object 的 Popup ZIP 的直接 consumer 回归保护。
- Popup/Object manifest 文档、Popup Editor/RenderCore README 和最小 Editor artifact/shared runtime 领域规则更新。

### 不包含

- v1 对象不能再包含另一个 `popup-object`；不实现递归 prefab、继承、variant、override patch、对象 slot 暴露或跨 package object dependency graph。
- 宿主 Popup 不能把普通 layer 挂到对象内部 Spine/VNI target，对象内部 layer 也不能引用宿主 target；第一版只把对象当 opaque 原子节点。
- 不在宿主内联编辑 imported object 的 child；修改统一对象应打开其 Popup Object ZIP，重新导出后通过资源 review 原子替换。
- 不给对象增加 backdrop、focus/adaptation、page placement、tier、amount、audio cue、dismiss、advance、keyboard/canvas input 或独立 completion。
- 不把对象展开/复制成宿主普通 layers，不生成隐式 suffix name，不按唯一资源/首项/相似名字自动绑定。
- 不让 Game Layout Editor 编辑对象内部图层；它仍只 vendor 完整 Popup package并配置 Popup placement/调用。
- 不修改游戏 assets、业务触发、翻译表、Scene Layout manifest schema、根工具链、依赖版本或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-09-02T07:27:46Z
HEAD: 0b02433b24aa8df6eaae0a96e389b5f3722bd629
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `docs/agent-rules/editor-artifacts.md`
- `docs/agent-rules/shared-game-runtime.md`
- `tasks/285-popupeditor-vni-text-layer-all-layer-attachments.md`
- `tasks/167-popupeditor-styled-text-and-imgnumber-nodes.md`
- `tasks/210-popup-award-layer-identity-and-immediate-end.md`
- `docs/popup-manifest.md`
- `apps/popupeditor/README.md`
- `packages/rendercore/README.md`

`apps/popupeditor` 与 `packages/rendercore` 下没有补充 `AGENTS.md`。执行时保留届时出现的用户无关修改。

当前结论：

- `apps/popupeditor/src/model/project.ts#PopupEditorProject` 当前只表示三种 production Popup，并始终持有 id、adaptation、backdrop、tiers/spine/singleState；
  尚无只含 name + layers/resources 的 authoring project 分支。
- `projectToManifest()` 与 `apps/popupeditor/src/io/popup-zip.ts` 把 Editor snapshot直接序列化为 production Popup v9，preview也通过 export/import/prepare
  运行正式 player；不能用 session-only 对象引用伪装成已持久化功能。
- `packages/rendercore/src/popup/data/types.ts#PopupResourceSpec` 只含 image/font/image-string/VNI/Spine，v9 layer union也没有 group/object；当前 manifest无法把
  多个 child 作为具有单一 transform/order/attachment 的原子节点保存。
- `packages/rendercore/src/popup/single-state-player.ts#DefaultSingleStatePopupRuntime` 已拥有五类 layer 的创建、attachment、string registry、update 和 destroy，
  可抽出通用 layer-collection runtime；不得为 object 复制第二套渲染状态机。
- `packages/rendercore/src/popup/data/package-closure.ts#collectMappedPopupAssetKeys()` 与 `collectPopupPackagePaths()` 已严格校验 Popup exact transitive
  closure，但只递归 image-string/VNI；object manifest必须作为 typed nested root加入递归，并阻止 object-in-object。
- `packages/rendercore/src/popup/core/package-resource.ts#createPopupPackageResourceFromResolvedFiles()` 统一 prepare Popup resources并在失败时回收字体、纹理、
  URL和 nested runtime；object资源应进入同一 prepare/rollback owner，而不是由 app 临时解析。
- `apps/popupeditor/src/io/resource-import.ts#discoverPopupResources()` 目前只识别图片、字体、ImgNumber、VNI 与 Spine，未知 ZIP 显式失败；需要用 exact root
  sentinel区分可打开的 object project和可导入宿主的 object resource。
- EditorCore、Game Layout Editor 与 Scene Layout consumer 已复用 RenderCore Popup parser/closure/materialize API；新增 nested typed resource 会改变共享 public
  contract，必须做 L2 直接依赖链验收，但原则上不需要各 consumer 复制 object schema。
- 当前仓库没有 Popup 子对象、prefab或通用 display group artifact。现有 schema、tests与文档足以制定计划，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “子对象/预制体”定义为 Popup 内可重复实例化的美术组合，不是第四种可独立展示的 Popup。对象只在包含它的 Popup 活跃时存在，宿主继续拥有屏幕适配、
   压暗、输入和关闭行为。
2. “项目里只需要配一个 name”指对象项目的项目级合同只有 name；资源与内部 layers仍在对应编辑页配置。name同时是 package业务 identity，要求 lowercase
   kebab-case，避免再引入隐藏 id或从文件名猜 identity。
3. 第一版对象内部复用 single-state 的五种 typed layer与局部 attachment语义；所有 child始终属于对象 active scope，不再配置 backdrop或状态可见性。
4. 宿主 object instance 是一个普通逻辑 layer：award由 containing tier决定可见，Spine保存宿主 start/loop/end visibility，single-state在 active中显示。
5. “统一配置”要求宿主持久引用 object resource，而不是导入时复制 layers。重新导入同一 root key的新版对象经完整 candidate prepare后替换，所有引用该资源的实例
   自动使用新定义；失败保留旧 project/preview。

### 关键决策

1. **新增独立 `popup-object.manifest.json` v1，Popup latest继续是 v9。**
   - object root只允许 `{version:1, kind:"popup-object", name, resources, layers}`；明确禁止 id/type/adaptation/backdrop/audio/tier/singleState/spine root字段。
   - `popup.manifest.json` v9增加 `PopupObjectResourceSpec {kind:"popup-object", manifest}` 和 object layer union member；parser只在 v9接受，v1–v8继续拒绝。
   - 这是新增可选 kind且不改变任何既有 source字段含义，也没有 migration/default，所以不增加 v10；object自身从 v1开始独立演进。旧 reader遇到新 kind仍显式失败，
     不会误读或降级；monorepo内 parser与全部直接 consumer在同一任务同步。
   - 若执行发现存在必须独立升级、却要求读取新 object package的已发布旧 v9 consumer，则该兼容目标需要 Popup v10，必须先停止说明，不能悄悄放宽旧 reader。
2. **对象内部复用 single-state layer合同，但保持封装边界。**
   - object layers支持 image/text/image-string/VNI/Spine，name/id、style、widthRange、playback和资源引用沿用latest strict类型；不增加第二份视觉字段。
   - object内部 attachment仅为 `popup-root`、object内 exact Spine slot或VNI text layer；拒绝 `main-spine`、object layer kind和任何外部 target。
   - data层用对象自身一张DAG校验missing/self/cycle与同resolved parent order；宿主图只把object实例视为一个child，不穿透内部节点。
3. **对象实例是 runtime原子节点，不做导出时 flatten。**
   - 每个实例拥有独立root Container，实例transform/alpha/order/attachment作用于root；对象内部layer排序只发生在该Container内，因此不会与宿主兄弟交错。
   - 抽取single-state现有layer collection的create/init/start/update/stop/destroy与attachment逻辑供两者复用；对象不创建Application/canvas/ticker/RAF。
   - immutable prepared object definition可由package resource缓存；mutable layer runtime必须per instance创建，不能让两个实例共享Container、string override或animation state。
4. **对象生命周期从属宿主，不成为第四套Popup状态机。**
   - instance visible commit时激活内部layers；被tier/segment切走、Popup complete、init rollback或destroy时停止、detach并释放active贡献。
   - 宿主ticker每帧只经现有player推进当前/ending layer collection一次；对象不自行注册ticker，不因内部once/segmented completion改变宿主phase。
   - activation中途失败必须撤销已建child、attachment group与object root，保持宿主未提交或既有稳定snapshot。
5. **通过对象handle保留typed child能力，不污染宿主name空间。**
   - 三类player增加exact `getObject(id)` / readonly object清单；handle提供对象局部`getLayer/getTextNode/getImageStringNode`和只读manifest name。
   - 宿主原有`textNodes/imageStringNodes`不扁平包含object child，避免多个实例同名冲突，也不构造`instance-child`等可碰撞alias。
   - award同一logical id跨tier复用object时要求exact resource一致；因此object handle和内部child handle可跨tier保持，transform/order/attachment仍可按tier变化。
6. **对象ZIP与宿主nested closure都走typed filename-key事务。**
   - standalone object导出文件名为`<name>-popup-object.zip`，root sentinel固定为`popup-object.manifest.json`；name不从ZIP文件名反推。
   - 导入宿主时把object root与其exact closure作为一个owner candidate交给共享workspace review；rename只结构化改写object manifest内known resource refs和宿主spec.manifest。
   - Popup export、namespace/materialize与consumer vendoring递归收集object manifest及内部image-string/VNI/Spine/font/image refs；相同bytes只在physical payload去重，
     logical filename key不合并。
7. **Editor按项目kind显示最小authoring surface。**
   - `PopupEditorProject`改为production Popup/object discriminated union，共享assets/resources但不以大量无关默认字段模拟object。
   - object项目隐藏Popup focus/backdrop/id/type/amount/tier UI，layer编辑复用single-state card；object preview以对象原点居中，所选viewport只用于观察裁切和缩放。
   - 普通Popup资源页把object显示为typed root，layer页只编辑实例级字段；内部child只读摘要并提供“打开源Object项目”的工作流说明，不实现内联副本。

## 5. 职责与合同

- **Popup Object data**：拥有object v1 strict schema、内部layer/resource/reference graph与exact closure；不拥有Pixi、宿主state或文件上传UI。
- **Popup v9 data**：拥有object resource/layer typed引用、宿主scope DAG和版本gate；v1–v8 source normalization保持纯历史迁移。
- **Popup core resource**：拥有nested object manifest/resource prepare、并发收敛、缓存、rollback和package destroy；不把mutable instance放进resource cache。
- **Popup layer collection runtime**：拥有五类child runtime、attachment、string registry、activation/update/stop/destroy；供single-state与object复用。
- **三类Popup player**：拥有object instance placement、visibility、逻辑id/handle和宿主phase；对象不能接管completion/input。
- **Popup Editor**：拥有project union、表单、导入review、standalone object ZIP、对象preview和实例authoring；不复制production parser/runtime。
- **EditorCore/Layout consumer**：只通过RenderCore typed parser/closure/rewrite vendor完整Popup，不解释object内部业务或直接改display tree。
- **数据/API**：object name、宿主instance id、内部layer id和resource key均大小写精确；display label、ZIP source path和physical hash不作为alias。
- **资源生命周期**：standalone object project拥有workspace bytes；包含Popup package resource拥有prepared immutable object definition；每个Popup player拥有各object instance runtime。
- **失败策略**：unknown version/kind/field、非法name、object-in-object、缺/错kind resource、orphan、路径alias、跨边界attachment、cycle、重复order、handle selector错误、
  替换后invalid和destroy后调用全部fail-fast，不fallback到root/首项/静态图。
- **禁止行为**：不展开配置、不复制single-state状态机、不从filename/hash猜name、不允许extra orphan sidecar、不让object创建canvas/ticker、不把borrowed child交给caller destroy。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/data/object-manifest.ts
packages/rendercore/src/popup/core/object-resource.ts
packages/rendercore/src/popup/object-runtime.ts
packages/rendercore/tests/popup/{object-manifest,object-resource,object-runtime}.test.ts

apps/popupeditor/src/io/popup-object-zip.ts
apps/popupeditor/tests/popup-object.test.ts

docs/popup-object-manifest.md
tasks/286-popupeditor-reusable-popup-objects-<utctime>.md
```

文件名可按既有 `data → core → editor` 分层小幅调整；不得把object strict parser或production runtime放进app。

### 预计修改

```text
packages/rendercore/src/popup/data/{types,manifest,package-closure,index}.ts
packages/rendercore/src/popup/core/{types,package-resource,index}.ts
packages/rendercore/src/popup/{package-resource,spine-overlay-runtime,single-state-player,award-player,spine-player,editor-types}.ts
packages/rendercore/src/popup/editor/index.ts
packages/rendercore/tests/popup/{manifest,package-resource,single-state-player,award-player,spine-player,public-boundary}.test.ts
packages/rendercore/tests/scene-layout/{package-resource,production-zip}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/{popup-zip,resource-import}.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/styles.css
apps/popupeditor/tests/{project,resource-import,app-shell,preview}.test.ts
apps/popupeditor/README.md

packages/editorcore/tests/adapters-and-ui.test.ts
apps/gamelayouteditor/tests/popup-package.test.ts
docs/popup-manifest.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

若共享collection抽取需要新文件，可将`spine-overlay-runtime.ts`的通用部分迁到明确命名的shared layer runtime；必须保留旧public import与行为。若consumer测试暴露
typed rewrite遗漏，可最小修改其共享adapter调用，但不能在consumer复制object parser。

### 原则上不应修改

```text
packages/vnicore/**
packages/rendercore/src/popup/data/normalize.ts
packages/rendercore/src/scene-layout/data/**
packages/rendercore/src/scene-layout/core/**
apps/gamelayouteditor/src/model/**
apps/gamelayoutpkgcli/**
packages/gameframeworks/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若执行需要Popup v10、递归object、Scene Layout schema、游戏facade、外部依赖或lockfile，先说明证据和范围扩张，不能用raw JSON、extra ZIP sidecar或private Container绕过。

## 7. 实施步骤

1. **确认执行基线并固定失败样例**
   - 重核HEAD/status、本计划与两份领域规则，确认task 285后的v9类型和consumer入口未漂移。
   - 先补object root、v9 object resource/layer、未知旧版本kind、nested object和当前unknown ZIP的失败测试，固定本任务前缺口。
2. **建立Popup Object v1 data合同**
   - 定义object manifest/types/parser，复用latest layer字段校验并限制内部scope、resource kinds、DAG、order和exact used-resource closure。
   - 导出data API与typed path collector；覆盖五类layer、字体可省略resource、VNI/Spine metadata、missing/wrong-kind/self/cycle/main-spine/unused resource。
3. **扩展Popup v9的object引用**
   - 给v9增加object resource spec和三种scope对应object layer，旧source version显式拒绝；把object加入layer id、attachment graph、order和award stable identity校验。
   - 要求award跨tier同id object保持exact resource；保留现有kind-specific字段互斥与v1–v8升级结果。
4. **实现nested package prepare与runtime**
   - 扩展closure/namespace/materialize递归读取object manifest并结构化改写nested refs，禁止object-in-object和路径/identity猜测。
   - 从single-state抽取共享layer collection；实现object definition prepare、per-instance runtime、atomic init/attach、activation/update/stop/destroy和local string registry。
   - 三类player接入object原子Container与handle；覆盖多实例隔离、slot/VNI parent、tier/segment切换、ending/update、replace/init failure和destroy。
5. **实现Popup Editor对象项目**
   - 把project/store/clone/diagnostics改成discriminated union；创建dialog增加object，object项目页只保留name并复用资源与layer编辑能力。
   - 增加object ZIP export/import和root sentinel分流；object项目preview直接使用RenderCore object inspector，不合成虚假focus/backdrop Popup。
   - 覆盖name即时校验、五类layer编辑、attachment候选、preview rebuild rollback、ZIP round-trip及关闭/重开。
6. **实现宿主对象资源与实例authoring**
   - 资源导入识别Popup Object ZIP，作为单一candidate参与shared conflict review；keep-both/overwrite结构化改写完整closure并在commit前prepare。
   - award/Spine/single-state UI增加object layer，编辑实例id/placement/attachment/visibility；只显示内部摘要，不复制child cards。
   - 覆盖同resource多实例、award复用、rename/delete/reference count、object replacement、invalid child更新rollback和preview exact handle。
7. **保护直接consumer与production交付**
   - EditorCore adapter和Game Layout Editor用含object的mapped Popup ZIP验证import/catalog/export/replace；Scene Layout package验证namespace后nested root与payload exact closure。
   - 复验production package只包含typed引用闭包，physical bytes可去重但object name、instance id、child id与filename key保持exact。
8. **文档、人工验收与收尾**
   - 新增Popup Object v1文档，并更新Popup v9、RenderCore/Popup Editor README及最小领域规则，说明opaque边界、无focus/backdrop和独立lifecycle。
   - 按第8节执行L2验收，检查diff与旧值/遗漏分支，生成任务286 UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- data测试使用最小self-contained fixtures，分别证明object standalone contract与host v9 reference；不依赖游戏`assets/`。
- runtime mock可证明Container层级、order、activation/update次数、handle identity与cleanup；真实文字/图片、VNI/Spine动画和slot/VNI继承仍由浏览器验收。
- import/export测试必须从ZIP bytes与DOM操作进入，不直接向project Map塞入已构造object后只测serializer。
- 正常路径至少覆盖“背景image + Tap to continue text”、同resource两个实例、三类宿主各一个实例、award跨tier复用和一次object资源替换。
- 失败路径至少覆盖旧version使用object、object-in-object、坏name、missing/orphan、跨边界attachment、cycle、重复order、同名不同resource award variant和partial commit。
- 既有v1–v9 fixture、无object的三类player和Popup ZIP exact closure必须继续通过，不为新功能放宽unknown field或allowExtraFiles。

### 验收级别

`L2`：本任务新增Popup共享typed schema成员、独立正式object工件、nested资源闭包与player public handle，并影响Popup Editor、EditorCore、Game Layout/Scene Layout
直接consumer及resource ownership。无需根工具链、lockfile、游戏assets或release级整仓验证，因此不升级L3。

### 执行会话必须运行

以下8条超过默认6条，因为四个package的Vitest配置和fixture root相互独立，另需public typecheck、Popup Editor production build、定向格式和diff检查；不能用一次根级
全仓test替代：

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter @slotclientengine/editorcore --filter gamelayouteditor typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/object-manifest.test.ts tests/popup/object-resource.test.ts tests/popup/object-runtime.test.ts tests/popup/manifest.test.ts tests/popup/package-resource.test.ts tests/popup/single-state-player.test.ts tests/popup/award-player.test.ts tests/popup/spine-player.test.ts tests/popup/public-boundary.test.ts tests/scene-layout/package-resource.test.ts tests/scene-layout/production-zip.test.ts
pnpm --filter popupeditor exec vitest run tests/popup-object.test.ts tests/project.test.ts tests/resource-import.test.ts tests/app-shell.test.ts tests/preview.test.ts
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts
pnpm --filter popupeditor build
pnpm exec prettier --check packages/rendercore/src/popup packages/rendercore/tests/popup packages/rendercore/tests/scene-layout/package-resource.test.ts packages/rendercore/tests/scene-layout/production-zip.test.ts apps/popupeditor packages/editorcore/tests/adapters-and-ui.test.ts apps/gamelayouteditor/tests/popup-package.test.ts docs/popup-manifest.md docs/popup-object-manifest.md docs/agent-rules/editor-artifacts.md docs/agent-rules/shared-game-runtime.md tasks/286-popupeditor-reusable-popup-objects.md
git diff --check
```

- 第一条证明共享public contract和四个直接consumer编译；第二至第五条分别使用各package正式test config保护owner与consumer。
- `popupeditor build`同时构建其RenderCore依赖并验证实际Vite入口；不再重复运行其它package全量build。
- Prettier只检查计划列出的改动面；执行时应按实际新增文件调整，不扫描dist/coverage/cache。
- 任一失败先最小化到object fixture或单一consumer，不立即扩大为根级test/lint/build。

### 人工验收

1. 在真实浏览器新建`tap-to-continue` Object，只配置name，导入背景图/字体并制作image + text；确认项目页没有id/focus/backdrop/type，横竖/方形viewport只改变观察范围。
2. 导出并重开Object ZIP，再在award、Spine、single-state各导入并添加实例；验证整体transform/order、Popup root与至少一个official Spine slot/VNI text attachment、
   同resource两个实例、内部文字handle和宿主播放/关闭行为。
3. 修改源Object的文字或背景并重新导入同名ZIP：确认review展示替换，成功后所有实例更新；故意导入缺资源/坏attachment版本时确认project与最后成功preview完整保留。

### 独立验收建议

`必须`。原因是新增跨包public schema/handle、nested正式ZIP closure，以及per-instance display/resource lifecycle。独立验收重点：

- object v1与Popup v9版本gate是否严格，旧v1–v9无object fixture是否零迁移回归；
- 两实例是否真正隔离mutable runtime，失败/替换/destroy是否无半提交、重复update或资源泄漏；
- EditorCore/Game Layout/Scene Layout是否只经typed collector改写完整nested closure。

独立复验命令最多3条：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/object-manifest.test.ts tests/popup/object-resource.test.ts tests/popup/object-runtime.test.ts tests/popup/package-resource.test.ts tests/popup/award-player.test.ts tests/scene-layout/production-zip.test.ts
pnpm --filter popupeditor exec vitest run tests/popup-object.test.ts tests/resource-import.test.ts tests/app-shell.test.ts tests/preview.test.ts
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
```

## 9. 环境与依赖

- Node.js使用仓库要求的Node 24。shell没有Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的Node和pnpm，不切换npm/yarn，不主动调版本。
- 依赖缺失时运行`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改package manifest或`pnpm-lock.yaml`；ZIP、asset workspace、Pixi与现有五类layer runtime均已有正式能力。

## 10. 生成物、文档与规则

- 本任务没有YAML或代码生成器；Popup/Object ZIP是测试/运行时动态工件，不提交手工生成的production ZIP。
- `docs/popup-object-manifest.md`记录object v1唯一正式结构、内部scope、resource closure和宿主instance边界。
- `docs/popup-manifest.md`只追加v9 object resource/layer能力与版本gate，不重写历史版本说明或把object称为第四种Popup type。
- Popup Editor/RenderCore README说明创建、导出、导入、替换、preview与handle工作流。
- `editor-artifacts.md`记录Popup Object的typed root、filename-key事务与非内联复用；`shared-game-runtime.md`记录opaque object container与宿主lifecycle ownership。
- 不修改根`AGENTS.md`；精确字段清单、文件名与版本能力留在manifest文档/tests，不复制到根规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/286-popupeditor-reusable-popup-objects-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、关键决策与偏差、实际命令结果、浏览器人工验收、剩余风险和未完成项；不收集无关coverage、
完整历史矩阵、全仓统计或profiler数据。

## 12. 风险、假设与待确认

### 风险

- object layer进入既有五类layer union与exhaustive switch较多；遗漏会表现为某一Popup类型可导入但无法preview/runtime，需靠public-boundary和三player测试锁定。
- nested object closure同时经过Popup Editor、EditorCore、Game Layout namespace/materialize；任何一处只重写顶层resource会在最终ZIP留下旧key或orphan。
- 抽取single-state共享collection可能意外改变旧start/dismiss/string handle行为；应先characterization test，再移动代码。
- VNI/Spine child有mutable playback；错误缓存runtime而非immutable prepared definition会导致多实例串状态、重复parent或destroy互相影响。
- 保持Popup v9意味着新object package不应交给未含本任务parser的旧runtime；旧runtime会按严格unknown kind失败，不会降级显示。

### 假设

- Popup及其直接consumer是本monorepo内workspace版本锁定并一同构建/发布；不要求旧二进制运行使用object的新v9 package。
- object第一版不需要递归包含object，也不需要宿主穿透attachment；“统一配置”通过替换typed object resource满足。
- object name可作为唯一稳定业务identity，因此使用lowercase kebab-case；展示文案仍由内部text layer保存，不把自由文本当project identity。
- 对象内部动画只从属实例active生命周期，不参与宿主Popup completion；如业务需要对象自己阻塞关闭，应另立运行编排任务。

### 待确认

无。若执行时上述版本锁定或opaque对象假设被新的仓库证据否定，按计划停止说明重大范围扩张。

## 13. 完成清单

- [ ] 目标和非目标已满足，对象项目级配置只有name。
- [ ] Popup latest仍为v9，object v1与旧版本gate符合计划。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、nested schema、exact closure、resource ownership与instance生命周期符合计划。
- [ ] 五类object child、三类宿主、多实例、替换和strict failures均有直接测试。
- [ ] Popup Editor真实预览、ZIP往返及直接consumer验收已通过。
- [ ] README、manifest文档和两份领域规则已按需同步。
- [ ] 指定自动化与独立验收已通过，人工验收单独记录。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的两份领域规则和本计划；
2. 核对Git基线、工作区与task 285后的Popup v9现状；
3. 先以tests固定object v1/v9 additive边界，再按`data → core → editor → app → consumer`实施；
4. 小幅适配当前文件分层时在报告记录，不重新制定另一套flatten或sidecar方案；
5. 需要Popup v10、递归object、Scene Layout schema或外部依赖时停止说明；
6. 只运行第8节L2验收，不扩大到整仓发布检查；
7. 完成后生成UTC中文执行报告；
8. 除非用户明确要求，不commit、不push、不创建PR。
