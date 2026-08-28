# 260 rendercore-immediate-game-mode-switch 任务计划

## 1. 目标与完成定义

### 目标

为 `SceneLayoutPackageRuntime.requestGameMode()` 增加显式的立即切换参数，服务于免费游戏等重入场景：宿主让用户选择
正常观看游戏转场或直接跳过时，`requestGameMode(target, { immediate: true })` 只准备并原子提交目标 mode 的稳定画面，
不显示 transition prelude Popup、不播放 Spine/video 转场或等待动画 event，也不伪造被跳过表现的 lifecycle/effect event。

默认请求继续完整播放 manifest 声明的 Popup 和转场；立即切换仍使用同一 production mode、资源准备、reel ownership、
visibility 和 strict direct-edge 合同，不借用 editor authoring API，也不成为缺边或资源错误的 fallback。

### 完成定义

- [ ] `requestGameMode(modeId, { immediate: true })` 成为公开 typed API；省略或传 `false` 时现有 Popup、Spine、video、
      none、trusted gesture、prepare/cache 和 event 顺序逐项保持不变。
- [ ] immediate 请求仍校验 exact target mode 和当前 source 到 target 的显式 direct edge，但不创建、启动或推进 edge 的
      prelude Popup、Spine/video player，也不依赖 Spine `switchEvent`、video media time 或 Popup complete。
- [ ] target geometry、delivery chunk、Symbols/reel 和 mode-scoped nodes 在任何可见 mutation 前完成准备；成功时一次提交
      background、普通节点、reel、displayed/stable mode，Promise 随即完成。
- [ ] immediate 路径不发布 transition `started/switched/ended/failed`、configured Spine effect event、video effect lifecycle
      或 prelude Popup session/player event；实际发生的 mode displayed/stable entered/exited 及由真实状态变化产生的 BGM event
      继续发布。
- [ ] compatible 已准备 transition 可把 target prepare ownership 安全移交给 immediate commit，同时销毁未播放的 overlay
      player；不兼容或未准备时走 target-only prepare，不加载仅供被跳过表现使用的 Popup/transition media。
- [ ] target prepare 失败、非法 option 组合、并发 request、active/pending Popup 或 destroy 时保留 source stable/displayed scene，
      释放新准备资源且不留下 player、target、reel 或 Promise 泄漏。
- [ ] RenderCore public surface、Gameframeworks facade、README/reference、定向测试、L2 验收和 UTC 中文执行报告完成；
      不新增依赖、manifest 版本、生成物或 lockfile 变化。

## 2. 范围

### 包含

- RenderCore Scene Layout 的 request-only immediate option、严格组合校验和 public type/export。
- 从现有 directed transition 中分离可复用的 target scene prepare/commit ownership，使立即路径不构造 presentation player。
- compatible prepared transition 到立即提交的 ownership transfer，以及 stale/mismatch prepare cleanup。
- package runtime、presentation surface 和 primary action forwarding 的一致参数传递。
- immediate 对 mode/transition/Popup/effect/BGM event 的明确发布矩阵。
- RenderCore/Gameframeworks 文档、定向测试和最小领域规则更新。

### 不包含

- 不修改 Scene Layout manifest/schema/version、transition graph、Popup package或资源 ZIP；不新增 authored `immediate` edge。
- 不修改 `apps/game002v2`、`apps/game003v2`、Game Layout Editor 或外部 pixicrave/piximinecart2 consumer；本任务只提供通用 API。
- 不取消已经开始的 prelude/Spine/video transition，也不把 immediate 作为重入中的抢占、回滚或强制 destroy API。
- 不允许缺 direct edge 时瞬切，不反向复用、不自动寻路、不按 `BaseGame/FreeGame` 名称推断目标。
- 不播放一个不可见转场来复用其 event，也不手工伪造 Spine event、Popup complete、video ended 或 transition lifecycle。
- 不把实际 mode commit 改成完全静默 mutation；displayed/stable 和真实 BGM 状态变化仍按现有 canonical event 合同发布。
- 不顺手重构完整 game-mode 状态机、event manager、delivery loader、Popup scheduler 或 audio runtime。

## 3. 制定计划时的基线

```text
UTC: 2026-08-28T04:46:58Z
HEAD: 643db02164485468e2a1cd411210d28185df0721
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、任务 209/240 的相关合同、
  `packages/rendercore/src/scene-layout/{types,package-runtime,presentation-surface}.ts`、相关测试、RenderCore README 与
  `docs/scene-layout-manifest.md`；`packages/rendercore` 下没有补充 `AGENTS.md`。
- 本规划会话只新增 `tasks/` 计划，按根规则未加载实现领域规则；执行会话必须读取
  `docs/agent-rules/{shared-game-runtime,scene-layout}.md`。
- `SceneLayoutGameModeRequestOptions` 当前同时被 authoring selection、prepare 和 request 使用，包含 `recreateReel`、
  `reels.main` 与 request-only `preludePopupStrings`；`requestOptionsSignature()` 只把 reel prepare identity纳入缓存签名。
- `requestGameMode()` 当前先要求 exact direct edge；prelude 优先激活 Popup，Spine 在 authored event occurrence 提交，video
  在 fade boundary 提交，none 在 target prepare 后直接提交。video 无 prelude 时还要求 trusted gesture 前已有 compatible prepare。
- `buildPreparedTransition()` 当前把 target geometry/reel prepare 与 none/Spine/video overlay player prepare绑定在同一 owner；
  immediate 若直接复用它会无必要加载被跳过媒体，若借用 `selectAuthoringGameMode()` 则会绕过 directed-edge 和 production 合同。
- `commitPreparedTarget()` 已集中提交 mode geometry、Symbols/reel、scoped node visibility 与 displayed mode；stable mode、资源
  ownership settle、refresh 和 event boundary 分布在 none/Spine/video completion 路径。
- 任务 240 已定义 mode displayed/stable 与 transition lifecycle canonical events。mode event 描述真实 committed state，
  transition/effect/Popup event 描述实际发生的 presentation；两类不能因“跳过动画”被混为同一静默语义。
- 当前 `docs/scene-layout-manifest.md` 明确缺边不瞬切；新 option 必须收窄为“有显式 direct edge 时选择跳过该 edge 的表现”，
  不能改变 graph strictness。

## 4. 需求解释与技术决策

### 需求解释

1. 用户所说“重入模式”是游戏业务在一次 mode request 前让用户选择“观看”或“跳过”的场景，不是允许第二个
   `requestGameMode()` 抢占正在执行的 transition；现有并发/重入拒绝继续保留。
2. “立刻切换”指不经过用户可见的 Popup/overlay/timeline等待；如 target chunk 或新 Symbols reel 尚未准备，仍必须先异步
   prepare，画面保持 source，准备成功后再原子提交，不能用半加载 scene 换取 wall-clock 立即返回。
3. “event也不需要发”解释为不发布未实际播放的 transition、configured animation、video 和 prelude Popup event。
   displayed/stable mode确实发生改变，因此对应 state event 继续在 commit 后发布；否则 mode subscriber 与 event-audio/BGM
   会停留在 source，形成与画面不一致的状态。
4. immediate 是 request 的一次性执行策略，不进入 manifest、prepared target/resource cache identity，也不改变以后同一 edge
   的正常播放方式。

### 关键决策

1. **公开参数使用 `immediate?: boolean`。**
   - `undefined/false` 保持当前行为，`true` 选择 target-only production commit；运行时对非 boolean 值显式失败。
   - 拆分 `SceneLayoutGameModePrepareOptions` 与 `SceneLayoutGameModeRequestOptions extends ...`，让 `immediate` 和
     `preludePopupStrings` 只出现在 request/primary action，不污染 prepare 或 authoring selection。
2. **继续要求 direct edge，但不实例化 edge presentation。**
   - edge 仍是 source 是否允许到 target 的唯一权威；immediate 只覆盖“如何呈现”，不覆盖“是否可达”。
   - 从 `buildPreparedTransition()` 抽出 target-only prepare record/helper；normal path再按 edge kind附加 Popup/overlay owner。
3. **prepared ownership显式转移。**
   - matching source/target/reel signature 的 prepared transition 可保留其 target prepared record，释放未播放 player，再交给
     immediate commit；mismatch 则按现有规则完整释放后重新准备。
   - transfer 后旧 prepared owner清空，成功 commit 后由 active cache/runtime接管，失败只释放尚未提交 target，避免双销毁。
4. **事件按“事实发生”而非调用名称发布。**
   - immediate 不调用 transition lifecycle emitter、configured Spine/video emitter或 Popup scheduler；也不发 `failed`，因为
     presentation 从未 started。
   - mode displayed/stable setter和真实 BGM切换继续使用既有事件源；事件顺序仍是内部 commit在先，再 old exited/new entered。
5. **非法组合 strict fail。**
   - `immediate: true` 与 `preludePopupStrings` 互斥，因为 Popup 明确不会显示；不静默忽略本轮字符串。
   - active/pending Popup、active transition、另一个 prepare/request、unknown mode、缺 edge、非法/多余 reel input继续在可见
     mutation前失败；same-mode无附加输入时仍为no-op。

## 5. 职责与合同

- **Public request contract**：`requestGameMode`/`requestPrimaryGameModeAction`拥有一次性 normal/immediate策略；
  `prepareGameModeTransition`只准备完整正常转场，authoring selection继续是editor-only无边预览。
- **Target prepare**：Scene Layout package runtime拥有delivery、geometry、Symbols binding/reel输入预校验和prepared target；
  不创建 Popup或overlay player，不发event，不改display tree。
- **Presentation prepare**：normal edge在target prepare之外拥有Spine/video/none和prelude信息；immediate不取得这些player ownership。
- **Commit**：复用唯一 geometry/reel/visibility/displayed/stable mutation入口，禁止复制第二套 mode 状态机；成功后刷新稳定 presentation
  并继续既有旧reel retention/cache策略。
- **资源生命周期**：prepared target和overlay player owner分离；reuse、mismatch、failure、destroy各有单一 release/transfer边界，
  已commit资源不被rollback helper误销毁。
- **失败策略**：unknown target、缺direct edge、非法options、target资源/scene/reel错误、并发状态和destroy均显式reject；
  prepare失败保持source画面且不伪造transition failed event。
- **禁止行为**：不调用 `selectAuthoringGameMode()` 冒充production，不创建隐藏none edge，不静默丢 Popup strings，不播放后隐藏，
  不手动调用listener或构造fake occurrence，不按mode名或首项猜测。

## 6. 文件范围

### 预计新增

```text
tasks/260-rendercore-immediate-game-mode-switch-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/types.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/src/scene-layout/presentation-surface.ts
packages/rendercore/tests/scene-layout/package-runtime-mode.test.ts
packages/rendercore/tests/scene-layout/package-runtime-video.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/tests/scene-layout/presentation-surface.test.ts
packages/rendercore/README.md
packages/gameframeworks/src/index.ts
packages/gameframeworks/README.md
docs/scene-layout-manifest.md
docs/agent-rules/scene-layout.md
```

执行时可把 target prepare/ownership helper保留在 `package-runtime.ts`，无需为单一职责强行新增文件。若 public option已通过
现有 wildcard/facade完整导出，可不改对应 index，但必须用consumer typecheck证明，而不是复制类型。

### 原则上不应修改

```text
apps/**
assets/**
packages/{logiccore,uiframeworks,netcore,audiocore,vnicore,editorcore}/**
packages/rendercore/src/scene-layout/{manifest-v2,manifest-v3,delivery-loader}.ts
docs/agent-rules/shared-game-runtime.md
{AGENTS.md,pnpm-lock.yaml,pnpm-workspace.yaml}
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

若执行发现必须改变manifest、delivery schema、Popup core、event manager或游戏consumer，属于明显扩围，需先说明原因；不得修改
计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线和事件矩阵**
   - 重核HEAD/status、本计划、两份领域规则、public exports、prepare signature和normal none/Spine/video/prelude顺序。
   - 先用测试表固定normal与immediate在player创建/播放、Popup、snapshot、mode event、transition/effect event和resource owner上的差异。
2. **分离prepare与request options**
   - 在`types.ts`建立prepare基础options和request扩展，加入strict `immediate?: boolean`；同步package runtime、presentation surface、
     primary action与Gameframeworks facade类型。
   - `requestOptionsSignature()`继续只描述target reel prepare identity；immediate和Popup strings不进入cache key。
3. **抽出target-only prepare ownership**
   - 从`buildPreparedTransition()`提取geometry、delivery、binding/reel preflight和prepare record；normal builder在其上附加edge media player。
   - 为matching prepared transition实现显式target detach/overlay release；覆盖reuse、mismatch、prepare rejection和destroy，不双销毁。
4. **实现immediate request分支**
   - 在任何Popup/player activation前校验option、runtime稳定性、target和direct edge；拒绝Popup strings及active/pending work。
   - 准备target后复用唯一commit primitive，同一成功边界提交geometry、reel、visibility、displayed/stable并settle ownership；不设置可观察的
     active transition/prelude，也不要求video trusted gesture prepare。
5. **固定event与兼容行为**
   - 断言immediate不触发transition lifecycle、Spine configured event、video lifecycle或Popup事件，仍按实际commit发布mode和BGM状态。
   - 回归默认Spine/video/none/prelude、same-mode、primary action、presentation surface和prepare/cache行为，确保`immediate:false`无差异。
6. **文档与收尾**
   - README/reference增加reentry选择示例、direct-edge要求、target prepare语义、互斥option和event矩阵；领域规则只补稳定的
     production immediate边界。
   - 运行L2定向验收、检查diff/旧表述残留并生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- 以neutral BaseGame/FreeGame fixtures覆盖none、Spine、video及有/无prelude；不读取production Crave/Minecart2资源。
- 对每条immediate测试同时断言player/Popup未创建或未播放、Promise已settle、snapshot稳定、visible node/reel正确和event序列。
- 覆盖无prepared、matching prepared复用、mismatch prepared释放、不同Symbols binding+`reels.main`、same binding、无Symbols target、
  `recreateReel`、prepare failure与destroy cleanup。
- 覆盖unknown target、缺direct edge、`immediate`非boolean、与Popup strings组合、active/pending Popup和active transition重入的strict failure。
- normal path继续覆盖Spine switch event、video trusted gesture/prepare、prelude start-loop-end、none lifecycle与既有mode event顺序；
  不为迁就新增测试改变原合同。

### 验收级别

`L2`。本任务修改RenderCore跨包public API、异步target prepare/commit ownership和Gameframeworks直接consumer；需要验证RenderCore
实现、public declaration与facade类型链，但不涉及manifest/生成器、根工具链或release，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime-mode.test.ts tests/scene-layout/package-runtime-video.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/presentation-surface.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks typecheck
rg -n 'requestGameMode|immediate|缺边不瞬切|preludePopupStrings' packages/rendercore packages/gameframeworks docs/scene-layout-manifest.md docs/agent-rules/scene-layout.md
git diff --check
```

- 定向测试失败时先缩小到单个edge kind/ownership case，不立即运行RenderCore全量coverage或整仓test。
- `rg`用于人工核对public签名、文档和旧“任何情况下都不瞬切”的绝对表述，结果需逐项判断，不以命中数作为通过标准。

### 人工验收

不要求真实美术或浏览器视觉验收；fake player足以证明“没有创建/播放”和事件边界，geometry/reel原子提交由现有runtime fixture验证。
如执行时接入实际游戏consumer，则另行补一次真实重入流程验收，不在本计划默认范围内。

### 独立验收建议

`建议`。原因是跨包public contract及prepared target/overlay异步ownership发生变化。独立复验重点是：

1. matching prepared transition转为immediate后player只销毁一次、target reel不被误释放；
2. immediate没有transition/Popup/effect事件，但mode displayed/stable事件与最终snapshot一致；
3. `immediate:false`的video trusted-gesture和Spine/prelude顺序无回归。

复验命令限于上述RenderCore定向vitest、RenderCore typecheck和Gameframeworks typecheck。

## 9. 环境与依赖

- 使用仓库要求的Node 24和pnpm。当前shell缺少Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的Node/pnpm，不切换npm/yarn，不主动调版本。
- 依赖缺失时运行`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 本任务不需要新增依赖或修改lockfile；若实现提出依赖变化，先停止说明。

## 10. 生成物、文档与规则

- 本任务不修改YAML、manifest版本或生成文件，不运行生成器。
- `packages/rendercore/README.md`记录production调用、默认兼容、target prepare/direct-edge/event语义；
  `docs/scene-layout-manifest.md`把“缺边不瞬切”更新为允许显式immediate跳过已有edge表现但仍禁止缺边fallback。
- Gameframeworks确实命名导出新增option type时同步其README；若只经runtime interface透传且无需文档示例，可保持最小改动。
- `docs/agent-rules/scene-layout.md`只补稳定的immediate production边界；不把任务编号、测试矩阵或具体reentry业务写入规则。
- 根`AGENTS.md`和`docs/agent-rules/shared-game-runtime.md`职责不变，原则上不修改。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/260-rendercore-immediate-game-mode-switch-<utctime>.md
```

UTC由`date -u +%y%m%d-%H%M%S`生成。报告简要记录最终API/行为、实际文件、prepared ownership实现、event矩阵、计划偏差、
验收命令结果、独立验收状态与剩余风险；不收集无关coverage、整仓统计或profiler数据。

## 12. 风险、假设与待确认

### 风险

- prepared transition当前同时持有target和overlay，拆分/移交不严谨会造成新reel误销毁、旧player泄漏或double destroy。
- 若immediate错误复用authoring selection，可能绕过direct edge、recreate语义或production event/audio合同。
- 若完全压制mode event，event-audio/BGM和外部mode subscriber会与实际画面不一致；若误发transition event，又会让consumer认为
  未播放动画真实发生。
- target delivery/reel prepare仍可能耗时；“立即”是无presentation等待的原子切换，不保证资源未缓存时同步完成。

### 假设

- 用户要求跳过的是mode transition自带Popup与动画，不是取消已经active的transition或任意普通Popup。
- `event不需要发`指被跳过presentation的transition/animation/Popup事件；真实mode/BGM状态事件必须保留。
- 重入业务已有current source到FreeGame target的显式direct edge，且consumer会在调用前选择normal或immediate。
- 首次落地只需要通用API，不要求同步改造某个游戏app。

### 待确认

无。若执行前用户把“event不需要发”明确扩展为连mode displayed/stable与BGM event也完全静默，则会改变任务240的状态事实合同，
必须先重新确认event/audio consumer影响，不能在实现中自行扩大解释。

## 13. 完成清单

- [ ] `immediate:true`目标和normal-path非目标均满足。
- [ ] direct-edge、strict options、prepare/commit/rollback和resource ownership符合计划。
- [ ] 被跳过presentation不发event，真实mode/BGM event与snapshot一致。
- [ ] public types、Gameframeworks facade、README/reference和领域规则按需同步。
- [ ] 指定L2自动化验收通过，人工/独立验收状态已明确。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、`docs/agent-rules/{shared-game-runtime,scene-layout}.md`和本计划；
2. 核对Git基线、工作区及任务240当前event合同；
3. 按计划实现，不重新制定另一套方案；
4. 小幅适配当前实现时在报告记录，manifest/event/audio/consumer等重大扩围先停止说明；
5. 只运行计划规定的L2验收，失败先最小化复现；
6. 完成后生成UTC中文执行报告；
7. 除非用户明确要求，不commit、不push、不创建PR。
