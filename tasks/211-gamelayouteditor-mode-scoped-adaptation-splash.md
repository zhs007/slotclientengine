# 211 gamelayouteditor-mode-scoped-adaptation-splash 任务计划

## 1. 目标与完成定义

### 目标

把 Scene Layout 从“项目根级只有一种适配类型，下面再切换 game mode”升级为“每个 mode 独立声明适配类型与背景/focus 几何”的 v2 合同，并在 Game Layout Editor 中把 Splash/Info 欢迎页作为正式 mode 纳入同一编辑、预览和转场流程。保留现有 `gameModes`、`initialMode`、`requestGameMode()` 等命名与稳定场景语义，不另造 page graph/API。

新建项目以 `Splash` 为初始页面；用户必须在 Splash 上执行真实点击，runtime 才沿显式 `Splash -> BaseGame` 边进入 `BaseGame`。该边继续支持 none、Spine 或 MP4 blackout 等现有转场效果。合法 v1 包保持 runtime 兼容；进入 Editor 时先原子升级成 v2 draft，后续预览和导出只使用 v2。

### 完成定义

- [ ] v2 manifest 不再用根级 `adaptation` 决定整个项目类型；`gameModes.modes[*].adaptation` 独立选择 `maximized-focus` 或 `orientation-focus`，前者拥有一个 `default focusRect`，后者拥有互相独立的 `landscape/portrait focusRect`。
- [ ] 同一项目可同时存在双背景 Splash mode 和单背景 BaseGame mode，或其它混合组合；mode 切换时 art、focus、背景、普通节点可见性、main reel、Symbols、Popup 和 displayed mode 原子提交。
- [ ] 新建项目显式创建 `Splash` 与 `BaseGame`，`initialMode=Splash`；Splash 声明唯一 primary click action 指向 BaseGame，并有一条可在 Editor 中改成 none/Spine/video 的显式有向边。
- [ ] 每个 mode 显式声明 `reelEnabled`：关闭时不显示主转轮、不允许 Symbols 且 focus 相对 art 边缘；开启时要求 main placement 且 focus 按 reel 四边外扩。新 Splash 默认关闭、BaseGame 和普通新增 mode 默认开启，v1 升级默认开启。
- [ ] 新项目中的Splash/BaseGame及后续“新增mode”dialog都必须通过下拉框显式选择该mode的`maximized-focus`（单背景）或`orientation-focus`（横竖双背景）；未选择时创建按钮disabled，不使用当前mode、项目历史或首项作为默认类型。
- [ ] Splash 未收到 trusted click 时保持稳定、BaseGame 不可交互也不可见；点击会在同一 trusted gesture 调用栈启动需要手势的 MP4/audio，再按现有 prepare/commit/rollback 语义完成或显式失败。
- [ ] v1 manifest/ZIP 继续可由 rendercore、production ZIP loader 和现有 v1 consumer 读取运行；未知版本、混合 v1/v2 字段及非法 mode/action/edge 明确失败。
- [ ] Game Layout Editor 打开合法、当前可编辑的 v1 项目时调用共享 upgrader：旧 project adaptation 复制到每个旧 mode 的新 `adaptation`，背景取该 mode 的 exact `backgroundNodes`，旧 initial/mode scope/symbol/popup/transition 保持命名并结构化迁移且不改变画面。
- [ ] v1->v2 upgrade与main现有Editor node-id migration组成一次可解释的原子导入：version upgrader本身保留exact node id，Editor随后确定性规范化旧点号/下划线/保留名并重写v2 per-mode background/nodeStates引用、显示完整rename map；失败不打开半迁移draft。
- [ ] v1 升级不伪造 Splash、资源或转场；旧项目的 `initialMode` 保持不变。只有新建项目采用 Splash-first 默认流程。
- [ ] Editor 内存 draft、manifest preview、ZIP 重导和正式导出均为 v2；不存在继续编辑 v1 或再次导出 v1 的分支。
- [ ] gamelayoutpkgcli 可严格读取、改写和优化 v2 package，并按 mode ownership 生成最新 asset-groups 交付物；v1 输入兼容与 main 最新 Popup v6 nested package 闭包/改写不回归。
- [ ] mixed-mode adaptation切换继续复用main新增canonical layer/node façade：`getRenderLayer()`、`getRenderObject()`identity与program visibility不因mode/variant/resize重建或重置，layout point/Anchor始终按最新committed mode snapshot解析。
- [ ] Symbols dependency已验证的大小写敏感filename key在v1升级、v2导出、替换、优化与重导全程exact保留；不得被Layout-owned lowercase规范化或physical hash path反推。
- [ ] schema、共享 upgrader、runtime、Editor UI/IO、CLI、直接 consumer 类型、文档、定向测试及 UTC 执行报告完成；真实浏览器视觉与 trusted-click 流程完成手工验收。

## 2. 范围

### 包含

- Scene Layout manifest v2 的 per-mode adaptation、per-mode main-reel placement、primary action 与现有 directed game-mode transition 合同；`gameMode` node scope继续沿用。
- v1 strict parser 与 runtime 兼容、v1 -> v2 单向共享 upgrader、latest-version export 和 v1/v2 exact dependency closure。
- rendercore package runtime 对 mixed mode adaptation 的 target prepare、viewport/variant 解析、原子 commit、rollback、snapshot、primary click 与现有 transition player 复用。
- Game Layout Editor 的 mode-based latest draft、每 mode 适配类型、Splash-first 新建流程、mode/variant 选择、布局 Inspector、资源绑定、转场编辑、预览和 ZIP 导入导出。
- gamelayoutpkgcli 对 v2 reference rewrite、mode/transition ownership、initial assets 与 versioned asset-groups 的同步。
- 直接依赖 Scene Layout public types/frame policy 的 gameframeworks 与已有 app 编译兼容；只做新旧 schema 分支或 additive API 接入所需的最小修改。
- README、manifest 文档与最小范围 scene-layout/editor-artifacts/shared-runtime 规则更新。

### 不包含

- 不为旧项目自动生成缺素材的 Splash，不猜 `Splash`/`BaseGame` 大小写 alias，不按文件名识别欢迎页。
- 不新增第三种适配类型、任意数量 orientation variant、跨 mode 自动寻路、反向复用转场或缺边瞬切 fallback。
- 不改变 focus 算法含义：单背景 mode 一份 default focus；双背景 mode 横、竖各一份 focus，不合并成项目级单矩形。
- 不把 Splash 做成 Popup、DOM/CSS overlay 或游戏 app 私有状态机；它是正式 Scene Layout mode。
- 不在 mode transition 中复制 Spine/video/prelude Popup player；继续复用 rendercore 现有有向转场与 ownership 边界。
- 不修改 Symbols/Popup nested schema、资源内容、服务器 round/mode resolver、loading 页面或 loading 进度；Splash 发生在 loading 完成之后。
- 不降级或重写 Popup v6 的tier-presence/stable-id业务语义；Layout Editor与CLI只通过main现有Popup parser/typed rewriter处理exact v1–v6 dependency closure。
- 不修改task 212的canonical layer ref语法、node-id policy、borrowed/owned RenderObject职责或authored coordinate定义；per-mode geometry只为这些现有façade提供最新snapshot与visibility。
- 不强制现有 v1 production package 批量重导，也不修改仓内 production 美术 ZIP/YAML。
- 不借本任务解决当前 Editor 已明确拒绝、无法确定 switch event 的 pre-canonical state-machine layout；兼容边界是 rendercore 继续运行全部合法 v1，而 Editor 自动升级其现有可编辑 v1 authoring 子集。若用户要求该历史子集也可编辑，必须另行给出确定迁移语义，不能猜 event。
- 不新增依赖、不修改 lockfile、根工具链或无关 app/package。

## 3. 制定计划时的基线

```text
UTC: 2026-08-14T09:18:12Z
HEAD: 1656444a7b1061695196e05b13ddfc267eb95ac4
branch: detached HEAD
git status --short --untracked-files=all: ?? tasks/211-gamelayouteditor-mode-scoped-adaptation-splash.md
```

- 已读取根`AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/{scene-layout,editor-artifacts,game003,shared-game-runtime,loading-ui}.md`及`tasks/212-rendercore-layer-access-and-layout-coordinate-api-260814-090855.md`；相关app/package下没有补充`AGENTS.md`。
- `packages/rendercore/src/scene-layout/types.ts#SceneLayoutManifestV1` 当前固定 `version: 1`，根级只有一份 `adaptation`；`maximized-focus` 含一个 default `focusRect`，`orientation-focus` 的 landscape/portrait variant 各含一份 `focusRect`。
- `packages/rendercore/src/scene-layout/manifest.ts#parseSceneLayoutManifest` 只接受 v1，并用根 adaptation 的 active variants 校验全部 node/reel/mode background/transition placement。
- `apps/gamelayouteditor/src/model/editor-project.ts#EditorProject` 把 `mode`、`variants` 和 main reel geometry 放在项目根；`gameModes.modes[*]` 只拥有 per-variant background、Symbols、award Popup 和旧 node state。
- `createNewEditorProject(mode)` 当前只创建 initial `BaseGame`；新建 dialog 要求在项目级选择 `maximized-focus` 或 `orientation-focus`。
- `editorProjectToManifest()` 恒导出 v1；`manifestToEditorProject()` 以 root adaptation 创建 draft，并将缺少 `gameModes` 的 legacy v1 显式迁移成单个 `BaseGame`。
- `SceneLayoutPackageRuntime` 当前以 `initialMode` 启动，复用 exact directed mode transition、Spine/MP4/prelude Popup、target reel prepare 和原子 visibility commit；它没有 per-mode adaptation 或 Splash primary click 合同。
- `apps/gamelayouteditor/src/ui/app-shell.ts` 已有自动准备 selected direct edge、trusted-click 同步 `requestGameMode()` 和统一 canvas/window Popup input，Splash click 应复用这些竞态与手势边界。
- `apps/gamelayoutpkgcli/src/{asset-groups,reference-rewriter}.ts` 与 `packages/gameframeworks/src/scene-layout-template/index.ts` 直接读取 `manifest.gameModes` 或根 `adaptation`，是 v2 schema 的必要直接 consumer。
- `apps/game002v2` 当前调用 game-mode runtime API；v2继续沿用该API，其现有v1package与行为必须保持不变。
- `assets/minecart2/layout.manifest.json` 当前是根级`orientation-focus`：landscape art/focus为`2000×1125 / 1954×940`，portrait为`1174×2000 / 1056×1435`；BaseGame/FreeGame/BonusGame只更换各自双背景，不改变focus。
- `calculateResponsiveArtViewport()`和uiframeworks frame policy当前都以输入尺寸`height > width`选择portrait，否则landscape，因此`width === height`会选landscape；focus只参与缩放/裁切。当前没有focus反馈回方向选择的循环，但外部resize尺寸真实反复跨越正方形边界时会按输入切回。
- `479f0c5..1656444`包含两项与本任务相交的main变化：`f738387`要求Symbols dependency owner-owned filename key在Layout导入/替换/导出/重导保持exact case；`1656444`新增canonical `getRenderLayer(ref)`、authored point/Anchor、borrowed authored `getRenderObject()`与program visibility AND，并让Editor迁移旧node id、禁止`layout|reel|transition|popup`保留名。
- task 212执行报告记录当前main的既有基线问题：`gamelayouteditor typecheck`被未修改Popup union测试的三处narrowing错误阻断，production build和定向测试通过。任务211执行时必须先最小复现并区分基线，不得为消除该错误扭曲v2schema/runtime；若同一测试因本任务union改动必须更新，则只补正确narrowing。
- 当前worktree已detached到用户指定的本地`main`；只保留本计划untracked，未修改实现、未安装依赖、未运行测试或构建。

## 4. 需求解释与技术决策

### 需求解释

- “一个重点区域”按当前 schema 不能概括所有类型：单背景 mode只有一个default focus；双背景mode需要横、竖两份独立focus。任务按用户后续确认保留这一逻辑。
- “页面决定项目类型”落到现有命名后，解释为adaptation ownership从manifest root下移到exact game mode；不引入page概念，也不保留两套权威配置。
- Splash与BaseGame/FreeGame处于同一个`gameModes`有向图；transition、Symbols、award Popup与普通node的`gameMode`scope继续使用现有命名。
- Splash的“需要用户点击”是mode内显式primary action，不根据mode id、是否initial、是否无Symbols推断。每个mode至多一个primary action；没有action的mode点击保持透传。
- “创建mode”包含新项目内置Splash/BaseGame与状态管理器后续新增mode：两种入口都必须先选择适配类型，取消/Escape或未选择不修改draft；类型一经选择即创建对应1或2个active variant空配置。
- Splash -> BaseGame 的转场沿用 exact directed edge。primary action 只选择目标并请求该 edge，不自带第二套 overlay 配置。
- 新项目必须有Splash-first；旧项目升级以视觉/行为兼容优先，不插入没有配置来源的新mode。

### 关键决策

1. **v2 保留 gameModes，只把 adaptation 下移。**
   - 根级继续是`gameModes: { initialMode, modes, transitions }`；每个mode增加required `adaptation`、可选`primaryAction`和该mode的main reel placements，继续保存现有`backgroundNodes`、symbolPackage、awardCelebrationPopup与nodeStates。
   - `nodes`、resource bindings、dependency libraries和main reel共享columns/rows/cell/gap/order继续留在根级；只把会随art space/mode改变的adaptation和reel placement放到mode，避免复制资源表和reel算法。
   - v2普通node继续用optional exact `gameMode`表达单mode scope；字段缺失继续表示全局。现有`initialMode/modes/transitions/backgroundNodes/requestGameMode()`命名不改成page。

2. **mode adaptation 是稳定场景的完整几何 owner。**
   - `maximized-focus` mode active variants精确为`default`；`orientation-focus`精确为`landscape/portrait`。
   - mode adaptation只保存各active variant的artSize、focus与orientation-only frame/margin；背景继续由同mode的`backgroundNodes`绑定，避免重复权威字段。mode main reel placement、该mode可见node及转场source placement必须覆盖各自合同要求的variant。
   - transition prepare以source mode解析overlay placement，同时准备target mode自己的adaptation/variant/reel；commit边界一次切换displayed mode与viewport geometry，禁止先改frame再发现target失败。

3. **共享 upgrader是唯一 v1 -> v2 迁移 owner。**
   - rendercore 提供 strict、纯函数、幂等的 `upgradeSceneLayoutManifestToLatest()`（最终名字按现有风格确定），输入先按声明版本 strict parse，输出只可能是 canonical frozen v2。
   - 对canonical v1：保留`gameModes`及所有mode id/backgroundNodes/transition；为每个mode克隆root adaptation的type/art/focus/frame/margin（移除root内重复的backgroundNode），并复制root main reel placement到该mode。
   - 对无gameModes的可编辑v1：生成一个`BaseGame`mode，使用root adaptation/background、legacy symbol binding和root reel placement，`initialMode`为`BaseGame`。
   - v2 输入 strict parse 后返回等价 canonical v2；不得重复加 Splash、重命名 id、补首项 animation 或吞掉 unknown fields。
   - version upgrader不承担Editor-only node-id policy。Layout ZIP导入事务固定为：验证map/hash/size/orphan与source schema -> upgrade到canonical v2 -> 在v2结构上执行现有node-id migration并同步改写per-mode `backgroundNodes`/`nodeStates` -> 复验latest manifest与closure -> prepare/commit draft。这样rename只发生一次且完整反馈。

4. **runtime 兼容源版本，game-mode API保持，Editor只编辑latest。**
   - `parseSceneLayoutManifest()` 返回显式 v1/v2 union或等价可判别类型；保留 `SceneLayoutManifestV1` public type，并新增 latest v2 类型。
   - loader/runtime对v1走共享规范化层后运行；v1/v2都使用现有game-mode public API与snapshot字段，不新增同义page API，也不改变exact mode id语义。
   - Editor import 在任何 draft mutation/Object URL/player prepare 前完成 package integrity 校验、版本 parse 和 upgrade；失败保持当前项目不变。Editor model 不保留 source-version 分支。

5. **primary click 是 gameModes graph 的显式输入合同。**
   - primary action形如exact target mode reference，并要求同source/target的一条直接transition；重复target、self target、缺边、非initial-only的硬编码限制均不允许。
   - package runtime 提供可在 trusted pointer/click 调用栈同步发起的 primary-action request，并复用现有 transition prepare/player/rollback。Editor 将真实 preview canvas 绑定到该入口；idle/no-action/popup active/transition active 的输入优先级必须显式且有测试。
   - 新建项目建立`Splash -> BaseGame` explicit none edge与Splash primary action；用户随后可替换该edge的overlay。删除/重命名mode或edge必须事务性重写或阻止悬空action。

6. **mixed adaptation需要动态frame合同和单向variant判据。**
   - rendercore统一根据stable/displayed/target mode解析Scene Layout snapshot与frame policy；mode commit后consumer可取得新的mode/frame snapshot并重做viewport。
   - variant只能从host提供的原始`pageSize`选择：`height > width`为portrait，`width > height`为landscape；`width === height`且已有active variant时保持当前variant，首次初始化无历史状态时确定性选择landscape。focus/art/frameDesignSize等派生输出不得反馈成下一次variant输入，mode切换本身不能制造landscape->portrait->landscape循环。
   - 每次外部resize形成递增viewport revision。prepare记录/更新target资源，但commit必须用最新revision的同一原始pageSize重新解析纯geometry；旧revision不得在新resize后提交。resize期间真实尺寸再次跨边界时允许按新输入切回，不用focus反馈、timer或猜测hysteresis掩盖。
   - gameframeworks只接入动态public contract，不复制mode id、orientation判断或Splash逻辑。现有v1 static `createSceneLayoutFramePolicy(manifest)`行为保持兼容。
   - 如果当前UI frame host无法原子接受policy变化，实施时必须先补additive mode-aware callback/controller；不得把v2降级为项目级共同adaptation。

7. **main新增layer/coordinate/object façade必须跨geometry commit稳定。**
   - mode切换与viewport revision只更新既有SceneLayoutRuntime的committed manifest/snapshot、authored visibility和placement；不得重建canonical layer controller、named node attachment band、borrowed `SceneLayoutRenderObject`或程序visibility map。
   - `getLayoutPoint()`、point↔Anchor与`getRenderObject().getAnchor()`每次从当前committed mode的artSize/visibleRect/origin解析；prepare中的target geometry不可提前泄露给source snapshot。
   - target commit后旧Point仍只是旧调用时快照，opaque Anchor按现有延迟解析合同落到新transform；unknown/stale layer/object仍沿task 212严格失败，不增加mode名或资源名fallback。

## 5. 职责与合同

- **rendercore manifest/upgrader**：拥有v1/v2 strict schema、版本dispatch、单向canonical migration、gameModes引用校验和active variant规则；Editor/CLI/app不复制upgrader。
- **Scene Layout runtime**：拥有mode target prepare、variant/art/focus/frame解析、背景/node/reel/popup可见性、primary action与directed transition原子状态机；不解释`Splash`/`BaseGame`名字。
- **Game Layout Editor**：拥有latest v2 draft、per-mode type选择、UI transaction、preview input、filename-key workspace和最新版本导出；不保存第二份项目类型。
- **Editor import migrations**：shared version upgrader保留业务identity，Editor node-id migration随后负责canonical/reserved rename与v2typed引用改写；filename-key migration继续区分Layout-owned key和Symbols owner-owned exact-case key。三者必须在一个导入transaction内按固定顺序执行，不互相代替。
- **gamelayoutpkgcli**：按v1/v2 typed gameModes graph收集/改写资源；不从id猜initial或Splash。
- **consumer**：loading完成后创建runtime并绑定真实输入；mode完成/业务round时继续调用公开game-mode API，不直接切背景、frame或内部display tree。
- **数据/API**：v1与v2都是严格versioned输入；v1 upgrader保留exact mode id/path/order/placement/edge，v2 export把adaptation/reel placement放进mode。禁止v2同时声明root adaptation和per-mode adaptation。
- **资源生命周期**：mixed-mode target的texture/player/reel/video先完整prepare；commit前失败释放临时owner并保持source mode、frame、input与已准备资源一致。destroy取消pending primary action/transition且Promise确定settle。
- **稳定façade**：Scene Layout runtime继续拥有task212 layer controller、node attachment、borrowed render object、program visibility与Anchor解析；mode geometry commit只能更新其唯一owner，不创建第二套registry或visibility状态。
- **失败策略**：未知版本/mode/type/variant/action/edge、缺背景/placement/symbol/popup、非法focus/reel边界、重复id/order、stale viewport/click和不可trusted video启动显式失败，不瞬切或采用首项。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/manifest-upgrade.ts
packages/rendercore/tests/scene-layout/manifest-upgrade.test.ts
packages/rendercore/src/viewport/stable-orientation-variant.ts
tasks/211-gamelayouteditor-mode-scoped-adaptation-splash-<utctime>.md
```

`manifest-upgrade.ts`和stable orientation resolver也可放入现有职责明确的manifest/viewport模块；最终只能有一个version upgrade owner和一个横竖判定owner，rendercore/uiframeworks/Editor不得各写一套边界规则。

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,manifest,geometry,runtime,resource,package-resource,package-runtime,production-zip,index}.ts
packages/rendercore/tests/scene-layout/{fixtures,manifest,geometry,runtime,resource,package-resource,package-runtime,production-zip,package-runtime-mode,coordinate-space,render-layer-ref}.test.ts
apps/gamelayouteditor/src/model/{editor-project,game-mode-commands,resource-commands,layer-order,coordinate-origin,node-id}.ts
apps/gamelayouteditor/src/io/{imported-layout-zip,exported-layout-zip}.ts
apps/gamelayouteditor/src/preview/{layout-preview,preview-asset-paths}.ts
apps/gamelayouteditor/src/ui/{app-shell,project-workspace,layout-workspace,resources-workspace,state-manager-dialog,transitions-workspace,ui-session}.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/**
apps/gamelayouteditor/README.md
apps/gamelayoutpkgcli/src/{package-reader,reference-rewriter,asset-groups,types}.ts
apps/gamelayoutpkgcli/tests/**
packages/gameframeworks/src/scene-layout-template/index.ts
packages/gameframeworks/src/index.ts
packages/gameframeworks/tests/**
packages/uiframeworks/src/{types,layout,frame-host}.ts
packages/uiframeworks/tests/{layout,frame-host}.test.ts
apps/game002v2/src/{main,round-adapter}.ts
apps/game002v2/tests/**
docs/scene-layout-manifest.md
docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md
```

`apps/game002v2`只在Scene Layout public union或dynamic mode adaptation导致直接编译/兼容测试需要时修改；其现有v1package、BaseGame/FreeGame resolver和round时序不得借机迁移。

### 原则上不应修改

```text
assets/**
apps/{game003v2,gameviewer,gameviewer2}/**
packages/{logiccore,netcore,vnicore,editorresource,browserartifactio}/**
packages/rendercore/src/{popup,symbol,image-string,reel}/**
pnpm-lock.yaml
package.json
AGENTS.md
tasks/111-*.md
tasks/116-*.md
```

若 direct-consumer 编译证明 game003v2 或其它 app 必须按 v1/v2 union 分支，可做最小类型适配并在执行前说明；不得把本任务扩大为全部游戏资源升级或 Splash 业务接入。

## 7. 实施步骤

1. **确认执行基线与版本/consumer矩阵**
   - 重新核对HEAD/status、SceneLayoutManifestV1所有parser/loader/rewriter入口、Editor version/node-id/filename-key migration顺序、runtime mode/layer/coordinate/object API、frame policy与仓内直接consumer。
   - 先固定v1manifest/ZIP/runtime snapshot、task212 façade/coordinate/visibility、Symbols exact-case round-trip与game002v2编译/行为回归；最小复现main已知gamelayouteditor typecheck基线错误并记录，不立即扩大扫描。

2. **建立v2 per-mode schema与共享upgrade合同**
   - 在types/manifest中增加判别明确的v2 per-mode adaptation、mode reel placement与primary action；保留gameModes/mode scope/transition命名，并按source/target mode active variants严格校验。
   - 实现v1/v2version dispatch和唯一upgrader；覆盖single/double adaptation复制、每mode独立background、legacy无gameModes、node/symbol/popup/transition引用、mixed-field/unknown-version failure与输入不mutation。
   - 更新collectors、geometry、resource/package/production ZIP路径，使v1继续运行、v2以mode geometry运行，资源闭包不漏项也不带入未引用dependency；Symbols owner key保持exact case。

3. **让runtime原子运行mixed modes、稳定variant与primary click**
   - 内部把v1root adaptation/v2per-mode adaptation规范化到一个稳定mode owner；v2init使用initialMode，完整prepare该mode geometry/background/reel/popup并生成mode-aware snapshot/frame contract。
   - 扩展target prepare/commit，使single<->double切换在source overlay边界原子改变adaptation、variant、background/node/reel/displayed mode；失败回滚source snapshot和owner。
   - 新增primary-action prepare/request/input seam，复用none/Spine/video/prelude player与trusted gesture；定义Popup active、transition active、idle/no-action和destroy时输入优先级与settlement。
   - 用raw host pageSize+previous active variant统一解析方向：宽高相等保持当前、首次正方形选landscape；viewport revision保护prepare/commit，覆盖旋转中间尺寸和stale target。
   - 把mode/variant visibility写入task212现有authored visibility通道，与program visibility继续AND；geometry commit后复用原layer controller/render object并刷新anchor transform，失败时source façade/snapshot/visibility完全不变。
   - 保留并扩展现有game-mode API/snapshot，同步public exports、presentation surface和fake contracts；不增加page同义API。

4. **把Editor draft改成per-mode geometry ownership**
   - 将root `mode/variants/reel placements`下移到现有`gameModes.modes[*]`draft；所有activeVariantIds、focus/reel派生、background/node scope、resource replacement、coordinate conversion和order校验显式接收mode id。
   - mode add/rename/delete/set initial/set adaptation/set primary action/transition命令统一事务处理引用；`addGameMode`必须接收显式adaptation type并据此创建exact active variants，不读取当前mode类型。切type时保留仍兼容variant数据，删除不再active的variant必须显式确认或在无绑定时执行，禁止静默丢placement。
   - 新建project dialog去掉单一项目类型，分别要求Splash与BaseGame用下拉框显式选择适配类型；状态管理器的新增mode dialog同样提供无默认选中的单/双背景下拉框。未选时按钮disabled，取消不mutation；创建后选择Splash，建立primary action和none edge，不绑定猜测资源。

5. **接入Editor UI、preview与ZIP边界**
   - mode管理器显示initial、适配类型、1/2focus/background/Symbols readiness；Layout/Resources/Transitions工作区以selected mode和该mode active variants编辑，Project页不再展示根适配模式。
   - preview初始呈现Splash；authoring selection不播放转场，实际Splash canvas click走primary action、现有automatic prepare和trusted-click同步request，并在完成后显示BaseGame。
   - import先验证完整v1/v2mapped package，按“version upgrade -> latest node-id migration -> latest复验”创建v2draft并显示rename map；export/manifest preview/ZIP reimport恒写v2，source v1信息不进入UI session或ZIP。
   - 扩展`node-id.ts`到latest manifest，结构化改写每个mode的backgroundNodes/nodeStates而不触碰mode id、primary action、edge或资源identity；升级前后Symbols owner-owned mixed-case filename key保持原样。
   - 覆盖v1导入后再导出v2的结构/视觉parity、mixed mode round-trip、失败原子性、selection/focus恢复和Object URL/player cleanup。

6. **同步CLI、直接consumer、文档与收尾**
   - gamelayoutpkgcli同时接受v1/v2，reference rewrite保持源manifest版本；asset groups继续使用mode/initialMode命名，Splash initial集合包含其资源及发出transition closure，不硬编码名字。
   - gameframeworks成为raw pageSize、previous variant和mode-aware frame更新的协调owner；uiframeworks只消费显式选择结果/动态policy，不重新从派生frame尺寸选择方向。保持v1static policy，只对实际编译失败的game app做最小compat分支。
   - 更新EditorREADME和scene-layout manifest文档，给出v1->v2迁移例、mixed Splash/BaseGame例、focus数量、正方形保持规则、trusted click和consumer兼容说明；把稳定mode ownership加入最小领域规则。
   - 运行第8节L2定向验收，执行真实浏览器流程，生成UTC中文执行报告并记录任何文件范围/兼容偏差。

## 8. 测试与验收

### 测试原则

- v1 fixture必须覆盖maximized、orientation、canonical多mode与legacy无gameModes；断言parse/runtime行为不回归，upgrader输出v2且再次upgrade幂等。
- v1 canonical多mode migration要用不同background node，逐mode断言adaptation type/art/focus复制、background替换、main reel placement、node scope、symbol/popup与edge保留，不能只比较version。
- v2 parser覆盖single-only、double-only和mixed项目；严格失败覆盖缺variant、多余variant、focus越界、mode/action/edge悬空、self action、重复edge、v1/v2字段混写和未知version。
- runtime用精确snapshot断言Splash double -> BaseGame single及反向/其它mixed边的variant、focus、background、node、reel、symbol与displayed mode commit时点；target失败前后source状态和owner数量一致。
- task212回归要在持有同一`getRenderLayer()`、`getRenderObject()`和Anchor期间完成single<->double mode切换与resize：façade identity不变，program hidden不被mode visibility覆盖，Point读取最新mode snapshot，旧Point保持旧快照而Anchor延迟解析到当前transform。
- variant测试覆盖portrait、landscape、首次square->landscape、active portrait+square->portrait、active landscape+square->landscape，以及resize revision `landscape -> square -> portrait`、`portrait -> square -> landscape`；focus/art/frame输出不得作为下一次输入，stale prepare不得提交。
- trusted click测试证明request在真实listener同步栈触发；MP4 `play()` reject、pending action、rapid double click、popup active、transition active、mode rename/delete和destroy均不留下半提交。
- Editor导入测试从真实v1 mapped ZIP经integrity验证升级，再导出v2并重导；断言assets map/hash/size/orphan、logical keys和nested dependency closure继续严格，并至少包含一个main latest Popup v6 award package，证明stable id/tier结构原样保留。
- Editor migration组合测试使用含点号/下划线/`layout|reel|transition|popup`保留名、collision、mode background/nodeStates、primary action和transition的v1fixture；断言先升级再rename、完整old->new反馈、v2重导幂等及任一步失败不commit。
- Symbols filename测试在同一v1->v2 round-trip放入合法mixed-case owner keys，并断言Layout-owned key仍按现有规则规范化、Symbols keys exact保留、大小写alias显式失败。
- UI测试覆盖新建project时Splash/BaseGame两个type下拉框、后续新增mode的type下拉框、空选择disabled、取消不mutation、创建后exact 1/2 variants、Splash初选、每mode 1/2focus编辑、type切换阻止数据丢失、mode readiness、preview click和BaseGame到达；DOM fake不冒充真实Pixi/browser验收。
- CLI测试覆盖v1compat与v2mode groups/reference rewrite，initial assets按initialMode计算，未引用mode/package不进入closure；Popup v6 filename-key/WebP rewrite必须保持tier presence、stable id与attachment引用。

### 验收级别

`L2`。本任务升级共享正式schema、public runtime API、production ZIP/asset-groups、Editor导出和直接consumer；必须验证rendercore、Editor、CLI和gameframeworks直接依赖链，但不触及根工具链/lockfile，也不需要整仓L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/uiframeworks --filter gamelayouteditor --filter gamelayoutpkgcli test
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/uiframeworks --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor build
pnpm --filter @slotclientengine/gameframeworks --filter game002v2 typecheck
pnpm --filter gamelayoutpkgcli build
git diff --check
```

若CLI无独立build脚本，执行时以其实际package scripts中的等价typecheck/测试替代并在报告说明，不为凑命令新增脚本。`gamelayouteditor typecheck`先核对main已知Popup test narrowing基线；若仍是完全相同的非任务错误，报告必须单列，不能冒充任务通过，也不升级整仓。若public union使其它直接consumer编译失败，只追加该consumer定向typecheck。

### 人工验收

1. 在真实浏览器新建“Splash双背景、BaseGame单背景”项目，分别配置横/竖Splash背景与focus、default BaseGame背景与focus；切mode确认Inspector只出现该mode合法variants且配置往返保留。
2. 预览重载后只显示Splash。点击外部Editor控件不进入BaseGame；点击真实preview canvas才沿none、Spine以及一条带声音MP4边进入BaseGame，确认转场commit点、横竖resize、焦点区域和转轮位置正确，失败时仍停留Splash。
3. 导入一个现有v1单背景包和`assets/minecart2`同形的v1双背景多mode包，核对自动升级后的每mode类型/focus/background/transition；在可调窗口依次经过landscape、square、portrait及反向过程，确认square保持active variant且mode转场不诱发回切。导出ZIP确认manifest v2，再重导并运行preview；原v1ZIP仍可由productionloader运行。

### 独立验收建议

`必须`。任务涉及共享versioned schema、跨包public contract、trusted gesture输入、异步prepare/commit/rollback与正式ZIP/asset-groups。独立复验重点是v1迁移不变画面、mixed adaptation原子切换和Splash点击不被自动/伪点击绕过；最多复跑：

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor test
pnpm --filter gamelayoutpkgcli test
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的Node.js 24与pnpm 10；shell无Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有真实下载失败后才设置仓库约定代理重试。
- 本任务预计不新增依赖、不修改`pnpm-lock.yaml`。若实现要求新库，必须先说明现有rendercore/browser能力为何不足及lockfile影响。

## 10. 生成物、文档与规则

- Game Layout Editor正式ZIP中的`layout.manifest.json`恒为v2；`assets.map.json`继续由正式导出器生成，禁止手改hash/path/size。
- gamelayoutpkgcli的versioned asset-groups继续使用`initialMode/mode`语义；只有字段结构确实变化才升级其独立版本，并同步parser/types/writer/tests，不把它塞回production ZIP。
- 更新`docs/scene-layout-manifest.md`为v1兼容+v2canonical文档，明确每mode focus数量、upgrade映射、primary action、mixed adaptation与最新导出。
- 更新`apps/gamelayouteditor/README.md`的新建/导入/mode管理/preview click流程。
- 只把稳定职责写入`docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md`；具体任务证据留在执行报告，不修改根`AGENTS.md`。
- 本任务无YAML和现有生成TS目标；若执行中发现正式generator/parity owner，必须使用它更新并运行`--check`，禁止手改生成物。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/211-gamelayouteditor-mode-scoped-adaptation-splash-<utctime>.md
```

报告简要记录最终v2schema/API、v1兼容与upgrade结果、实际修改文件、CLI/consumer偏差、自动验收、真实浏览器验收、剩余风险及未完成项。UTC文件后缀使用`date -u +%y%m%d-%H%M%S`。

## 12. 风险、假设与待确认

### 风险

- mixed mode adaptation会把当前一次性frame policy变成动态状态；若host resize与mode commit边界处理不当，会出现背景已切但canvas/frame仍沿旧mode计算的半提交画面。
- Splash到BaseGame若使用带声音MP4，targetprepare与trusted gesture必须兼顾；任何await前错误调用`play()`都会在iOS/浏览器策略下拒绝。
- v1根reel placement迁入mode后容易出现共享对象被多个mode误引用；upgrader必须clone结构并保持exact identity，Editor修改一个mode不能污染另一个mode。
- v2upgrade与Editor node-id migration若顺序或typed reference集合不完整，会留下background/nodeStates悬空引用；两步必须在同一transaction中按latest schema复验。
- task212borrowed render object/program visibility与新mode visibility共用最终visible结果；若geometry commit重建runtime node或重置map，会造成游戏持有的façade stale或程序隐藏状态复活。
- Symbols owner-owned mixed-case key若误走Layout canonical filename mapping，会在v2重导时改变nestedmanifest identity或制造case alias；version升级不得接管filename policy。
- v1 runtime兼容与v2latest authoring并存会扩大publicunion；未定向覆盖的consumer可能错误假定根`adaptation`永远存在。
- 新建Splash没有资源时项目会处于strict not-ready，这是预期authoring状态；UI必须给出缺背景/edge/target诊断，不能放placeholder。

### 假设

- 用户确认双背景mode需要landscape与portrait两份独立focusRect；本任务不设计跨方向共享单一focus。
- 用户确认保留mode命名；`Splash`和`BaseGame`是新建项目的产品默认id，但shared parser/runtime不硬编码其名字，manifest通过initialMode、primaryAction与directed edge表达语义。
- main task212的canonical node/layer/coordinate contract是任务211实现基线；per-mode adaptation不引入新的layer ref、coordinate space或program visibility API。
- 宽高相等时已有active variant保持不变；首次初始化没有历史variant时选择landscape。除exact square外不引入未配置的hysteresis阈值。
- Splash 通常不绑定 Symbols/main reel；schema 不以名字推断，而由 mode required `reelEnabled` 显式决定。关闭时禁止 Symbols binding。
- 旧项目自动升级只发生在Editor内存draft/新导出，不原地覆盖用户导入的ZIP文件。

### 待确认

- 无阻塞项。执行时最终字段/API命名可按仓库现有风格小幅调整，但不得改变本计划确定的ownership、v1迁移、Splashtrusted-click、latest-onlyexport与strictfailure合同。
