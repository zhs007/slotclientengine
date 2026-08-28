# 263 pixicrave-grid-cell-immediate-spin-stop 任务计划

## 1. 目标与完成定义

### 目标

先在 slotclientengine RenderCore 为 grid-cell target-aware spin 增加显式立即停转 API，再把已提交的 engine 实现同步到
pixicrave，并接入 Crave quick-stop。调用后，所有尚未落停的选中格立即提交服务器目标，停止滚动、暗层、clip/bounce 与
Nearwin 等 spin-only 表现；已落停格不重复落停，新落停格仍正常播放 exact landing/`appear` 状态并进入后续 feature/win。

refill/cascade/dropdown/effect sweep 不响应该能力。已启动 Nearwin 走现有结束/取消边界，尚未启动的 Nearwin 不再创建；
不伪造服务器目标，不把 quick stop 变成失败取消、scene reset 或整轮 skip。

### 完成定义

- [ ] engine 从当前 HEAD 创建 `codex/task-263-grid-cell-immediate-spin-stop`，先完成 shared API、测试、README/规则并形成
      本地权威 commit；只有该 commit 完成后才开始同步和修改 pixicrave。
- [ ] `RenderGridCellReelSet.stopSpinImmediately()` 可在 target-aware plan 的 `waiting`、rolling/settling、部分格已
      `landed` 及 landing appear 尚未完成阶段调用；所有 remaining selected cells 在同一同步 commit 边界显示 exact target。
- [ ] Scene Layout 公开 `stopMainReelGridCellSpinImmediately()`；只接受 active grid-cell target-aware spin，返回/记录本次
      新落停坐标，standard、idle、targetless continuous、cascade/drop/effect sweep 显式拒绝。
- [ ] 新落停格按原 `targetLandingState` 或 manifest landing appear 合同启动状态；runtime 继续推进 once appear，reel
      activity 只在 appear 完成后收敛。已落停格不重启 appear、不重复 landing edge。
- [ ] 未开始 scheduled cell effect 永不启动；已播放 effect 立即 `cancelAll()`，只发布真实 `ended/outcome=stopped`；强停
      不发布 activation edge，也不等待 effect loop、stop cadence、dimming fade 或 bounce。
- [ ] Crave 在 target 已注入时立即调用 shared API；若点击发生于 targetless 预转/网络等待，app latch 一次请求，在
      `settleMainReelContinuousSpin()` 注入 response target 的同一调用栈立刻消费，不显示猜测落点。
- [ ] BaseGame Nearwin symbol 状态立即结束；FreeGame Nearwin 取消当前 spin gap display、静默提交本轮 landing facts并
      保留跨 free-spin won set；重复 quick-stop 不重复结束或落停。
- [ ] Crave 明确区分普通/FreeGame spin 与 refill；refill dropdown、sweep、selective refill spin 期间事件被忽略且不遗留。
- [ ] engine commit 的精确任务差异同步到 pixicrave 后，完成 external RenderCore parity、Crave L2验收、人工验收和UTC报告；
      不新增依赖、schema、manifest、资源或lockfile。

## 2. 范围

### 包含

- engine RenderCore grid-cell 的两阶段 immediate landing、spin-only effect suppression、appearance completion与landing edge。
- engine Scene Layout package runtime 的 grid-cell-only public façade、严格activity校验和同步edge记录。
- engine shared测试、README、最小shared规则与本地分支/commit。
- 从已提交engine commit向pixicrave同步相同shared合同；分叉文件应用task-scoped patch，不覆盖外部独有变化。
- Crave `UpdateGameQuickStop`订阅、pre-response latch、active spin调用、Nearwin收尾和refill exclusion。
- BaseGame、FreeGame selective/held cell、Nearwin active/inactive、early request、重复请求、错误/destroy验证。

### 不包含

- 不为standard reel、CellSpin、cascade drop、effect sweep、terminal remove或refill spin增加immediate stop。
- 不在无server target的continuous阶段把当前本地窗口冒充结果，也不先显示临时随机结果后再替换。
- 不跳过landing appear、feature state、wins、award、mode transition、collect/settlement；这不是`skipGame()`/skip round。
- 不修改BridgeCore/Game UI quick-stop store/event语义；按钮已发布`UpdateGameQuickStop`，本任务只在Crave消费。
- 不修改reel manifest、effect资源、Symbols/Layout ZIP、delivery assets、YAML/生成物或Nearwin时序配置。
- 不统一pixicrave与engine当前所有RenderCore差异，不带入/删除task 260、camera、particle等无关能力。
- 不push、不建PR；pixicrave是否另建分支/commit未获授权，默认保留为可检查工作区修改。

## 3. 制定计划时的基线

```text
UTC: 2026-08-28T06:06:34Z

slotclientengine HEAD: 27c33dd41529e4f052e5871e76905ae65bf9b9c7
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean

pixicrave HEAD: 40be9a33a9041177db98946e3ce017033e40f924
pixicrave branch: master
pixicrave git status --short --untracked-files=all: clean
```

- 已读取两仓根`AGENTS.md`、计划模板、任务254/260的跨仓实施方式，以及两仓grid-cell/Scene Layout源码、测试与Crave
  round adapter、quick-stop、Nearwin、refill实现；目标目录没有补充`AGENTS.md`。
- 本规划会话只新增`tasks/`计划，按根规则未加载实现领域规则；执行会话必须读取engine与pixicrave的
  `docs/agent-rules/shared-game-runtime.md`，以及pixicrave实际适用的Crave/game002规则。
- `RenderGridCellReelSet`以`#spinPlan/#continuousSpin`区分已知/未知target；每格保存`planCell`、target value/state和
  `waiting|spinning|landed|completed`，目前没有立即提交active plan target的API。
- 正常landing在`updateCell()`内reset exact target并请求landing state，`updateLanded()`同时等待dim fade与
  `hasActiveLandingAppear()`；quick stop必须复用landing transaction，不能`resetToScene()`后直接完成。
- `updateSpinTimeline()`在effect boundary创建Nearwin，并禁止effect未完成时landing；`GridCellEffectController.cancelAll()`
  已能停止active player并发布一次真实`ended/outcome=stopped`，可作为强停结束边界。
- Scene Layout只在`update()`消费grid result并记录started/landing/activation drain；同步stop API必须写入相同队列。
- Crave在网络请求发出后立即targetless预转，response第一段才settle并创建`#spinWaiter`；UI quick-stop可能早于target，
  所以shared不能凭空落点，app需要one-shot latch。
- `UpdateGameQuickStop`已由BridgeCore UI button发布；Crave目前只有`state.ts`示例日志，`UIBridge`未接到adapter。
- Base Nearwin用activation/landing把WL切到`Reel_NearWin`，`finish()`恢复`normal`；FreeGame controller持有跨spin won set与
  异步gap RenderObject，单次quick stop不能调用永久`finish()`。
- refill由`cascadeTo()`的dropdown、`refillStart()`、effect sweep和selective target-aware spin组成，不经过普通
  `spinTo(base|freegame)`的唯一eligibility边界。
- engine与pixicrave的`render-grid-cell-reel-set.ts`当前byte parity；Scene Layout types/runtime因其他任务合法分叉，执行时只
  同步task 263 commit的精确diff，不整文件覆盖。

## 4. 需求解释与技术决策

### 需求解释

1. “任意阶段”覆盖取得authoritative target后的未起转、滚动、减速、部分落停、Nearwin active和appear阶段。网络等待时的
   用户请求也不丢失，但真正落目标必须等response；此前继续本地公开轮带预转。
2. “马上停止”指API同步返回前，所有remaining selected cell的物理运动已结束并提交exact target；appear仍由后续tick推进，
   所以`isMainReelSpinning()`可继续为true直到appear完成，和现有完成合同一致。
3. “spin状态下的效果彻底不管”包含waiting cadence、roll/settle、bounce、clip、dimming/fade、scheduled Nearwin和activation；
   不包含落点appearance、后续feature/win。
4. 已播放Nearwin使用owner现有真实结束：shared player发布stopped end，Base恢复symbol，FreeGame取消/销毁gap display；
   未创建player不伪造lifecycle。
5. “refill不需要”由Crave activity routing保证；shared API不识别`bg-refill`等业务component。

### 阶段行为

| 调用时状态                             | 行为                                                           |
| -------------------------------------- | -------------------------------------------------------------- |
| targetless continuous/response pending | Crave latch；shared拒绝无target；target注入同栈消费            |
| target-aware waiting/rolling/settling  | prepare全部remaining landing，原子提交target并产生landing edge |
| 部分landed/appear active               | 已落格不重提状态，remaining立即落停，保留appear completion     |
| Nearwin/cell effect active             | 走现有stop/end cleanup，以后不再启动本plan effect/activation   |
| idle/completed/standard/drop/sweep     | shared显式失败；Crave对过期UI事件安全忽略                      |
| refill activity                        | Crave忽略且不latch，不改变refill cadence/effect/state          |

### 关键决策

1. **独立stop command，不伪造0ms timing。** `stopSpinImmediately()`表示提交当前已验证target，与
   `cancelContinuous()`保留当前本地窗口严格区分；不改plan/schema/config，也不跑“极短动画”。
2. **remaining landing使用prepare/commit。** 先为全部未落停格验证/准备target occurrence、value和landing state；失败释放
   临时owner且原spin不变。全部ready后才取消effect并按plan顺序commit，避免partial scene。
3. **强停后进入landing-only completion。** 新落停格沿用现有`landed`/appear；强停标志禁止未来effect、effect completion gate、
   activation和dimming回写。全部appear完成后才清plan/resolve waiter。
4. **landing是事实，activation是跳过的spin表现。** lower API返回新落停坐标，Scene Layout写canonical landing drain；
   waiting cells不伪造started，强停不发activation。Crave立即drain本批edge，避免Nearwin ticker重复消费。
5. **Crave用小型gate管理early request/refill。** gate只保存`idle|awaiting-target|target-aware|refill`和one-shot requested，
   不复制reel phase、target或Nearwin状态机；重复点击幂等，failure/new round/destroy清旧generation。
6. **engine commit是同步权威。** 执行先建`codex/task-263-grid-cell-immediate-spin-stop`，engine验收通过后只stage任务文件并
   commit。pixicrave只应用该commit的task diff；分叉文件做上下文适配，不从未提交engine工作区临时拷贝。

## 5. 职责与合同

- **RenderReel/grid-cell owner**：target occurrence prepare、rolling owner释放、landing state commit、clip/dimming清理、
  appearance推进和effect suppression；不认识quick-stop按钮、Nearwin业务名或refill。
- **Scene Layout façade**：校验main reel为active grid-cell target-aware plan，调用唯一stop command并记录landing drain；
  不重建scene、不直接操作display tree。
- **Crave gate**：消费Bridge事件、区分early/active/refill、保证请求只命中当前round；不保存server scene或复制plan。
- **Crave Nearwin**：Base走`finish()`；FreeGame增加current-spin无视觉finalize，取消tokens/displays并更新必要won facts，保留
  下一free spin可复用的controller；RefillNearwin不参与。
- **资源生命周期**：prepared landing全部成功后才commit；prepare失败释放新owner。active effect、pending RenderObject、listener和
  gate generation在stop/error/destroy exactly once结束，late completion不得触碰下一spin。
- **失败策略**：无target、standard、非法activity、过期generation、target/state prepare失败显式失败；Crave只对UI竞态的
  idle/refill做有意no-op，不吞shared实现错误。
- **禁止行为**：不猜落点、不用`resetReelScene()`冒充landing、不发fake effect/activation、不在app循环改cell phase、不把refill
  component写进shared、不覆盖两仓无关差异。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/tests/reel/grid-cell-immediate-stop.test.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/tests/reel/grid-cell-immediate-stop.test.ts
/Users/zerro/gitee.com/pixicrave/apps/crave/src/spin-immediate-stop.ts
/Users/zerro/gitee.com/pixicrave/apps/crave/tests/spin-immediate-stop.test.ts
/Users/zerro/gitee.com/pixicrave/apps/crave/tests/freegamenearwin.test.ts
tasks/263-pixicrave-grid-cell-immediate-spin-stop-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/reel/{render-reel,render-grid-cell-reel-set}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/tests/{reel/render-reel,scene-layout/package-runtime}.test.ts
packages/rendercore/README.md
docs/agent-rules/shared-game-runtime.md

/Users/zerro/gitee.com/pixicrave/packages/rendercore/src/reel/{render-reel,render-grid-cell-reel-set}.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/src/scene-layout/{types,package-runtime}.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/tests/{reel/render-reel,scene-layout/package-runtime}.test.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/README.md
/Users/zerro/gitee.com/pixicrave/docs/agent-rules/shared-game-runtime.md
/Users/zerro/gitee.com/pixicrave/apps/crave/src/{round-adapter,uibridge,freegamenearwin}.ts
/Users/zerro/gitee.com/pixicrave/apps/crave/tests/{nearwin,source-boundary}.test.ts
/Users/zerro/gitee.com/pixicrave/apps/crave/README.md
```

若两阶段prepare可在grid set内完整复用现有detached occurrence API且证明commit不会抛错，可不改`render-reel.ts`及其测试；
不得为了少改文件退回partial commit。若FreeGame无视觉finalize可清晰加入既有测试，可不新增独立测试文件。

### 原则上不应修改

```text
packages/{logiccore,bridgecore,gameframeworks,uiframeworks}/**
apps/**
assets/**

/Users/zerro/gitee.com/pixicrave/packages/{logiccore,bridgecore,gameframeworks,uiframeworks,game-ui-ws}/**
/Users/zerro/gitee.com/pixicrave/assets/**
/Users/zerro/gitee.com/pixicrave/apps/crave/src/{refillnearwin,feature-anis,wins}.ts
{package.json,pnpm-lock.yaml,pnpm-workspace.yaml,AGENTS.md}
```

若必须改BridgeCore事件、refill controller、manifest/schema/assets或standard reel，属于明显扩围，先停止说明。

## 7. 实施步骤

1. **建立engine分支并重核双仓基线**
   - 重读本计划/规则，确认两仓status；从detached HEAD创建`codex/task-263-grid-cell-immediate-spin-stop`。
   - 重核shared差异及target-aware/continuous/landing/effect queue边界，先固定阶段、edge、event、owner测试矩阵。
2. **在engine实现原子immediate landing**
   - 建立remaining cell prepare/cancel/commit owner，复用exact target/value/state和landing appear；全部prepare完成前不改画面。
   - `RenderGridCellReelSet.stopSpinImmediately()`取消active cell effect，屏蔽未来effect/activation/dimming，提交remaining target；
     held/already-landed不重复，appearance继续由runtime update完成。
3. **在engine接入Scene Layout façade**
   - types/package runtime增加grid-cell-only命令，strict拒绝无target、standard及其它activity；同步记录landing，不记录started/activation。
   - 回归normal spin、continuous settle/cancel、selective、effect loop、appear与destroy，默认路径不变。
4. **验证并提交engine权威commit**
   - 更新README/最小shared规则，运行engine定向验收和diff检查。
   - 只stage计划、shared源码/测试/文档/规则并创建本地commit；记录hash，确认没有未提交engine实现。
5. **从commit同步pixicrave shared实现**
   - 以engine commit文件清单/patch为唯一输入。byte-parity文件逐文件同步；types/runtime等分叉文件只应用task hunk。
   - 在pixicrave运行同一shared测试/typecheck；API/语义/测试必须parity，不用app workaround补shared差异。
6. **实现Crave gate与Nearwin收尾**
   - `UIBridge.bind()`接入事件并提供disposer；adapter用generation-safe gate处理early latch、active stop、重复请求和destroy。
   - 普通/FreeGame target启动后消费：先结束Base Nearwin，调用shared stop并立即drain edge；FreeGame静默finalize facts/取消gap，
     保留跨spin won set。错误沿现有spin waiter fail-stop。
7. **隔离refill并回归完整流程**
   - `cascadeTo()`的dropdown/sweep/selective refill区间显式标记ineligible；点击只ignore且不污染下一spin。
   - 验证后续feature/wins/award/mode与normal路径不变，下一次普通/FreeGame仍可quick stop。
8. **验收、报告与engine收尾commit**
   - 运行L2与浏览器矩阵，检查双仓diff、同步清单、Nearwin无残留、refill无变化。
   - engine生成UTC报告，记录首commit hash和外部同步适配；报告作为同一本地分支第二个收尾commit。默认不commit pixicrave。

## 8. 测试与验收

### 测试原则

- shared用中性2×3 grid和可控player/update，在waiting、mid-roll、partial-land、effect-active、appear-active调用。
- 同时断言exact target/value、remaining landing顺序、held/already-landed identity、clip/bounce/dimming归零、无activation、
  未启动effect零event、active effect恰好一次`ended/stopped`。
- landing state覆盖显式state、manifest default appear、无appear和hole；movement同步停止但activity等待真实once complete。
- prepare failure覆盖中间target创建/state错误，证明原spin/effect/scene未半提交且临时occurrence释放。
- façade覆盖landing drain、targetless拒绝、settle后立即成功、standard/idle/drop/sweep拒绝、重复调用和destroy。
- Crave gate用fake runtime测试early latch、active、duplicate、late、failure、new generation和refill ignore，不用wall-clock sleep。
- Nearwin覆盖未启动、Base active、Free gap pending/committed、silent facts finalize及下一free spin复用；RefillNearwin零调用。

### 验收级别

`L2`。新增RenderCore跨package public API与多格prepare/commit ownership，并同步外部直接consumer；Crave还增加event/generation/
Nearwin异步收尾。未改schema、资源、生成器、根工具链或release，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel.test.ts tests/reel/grid-cell-immediate-stop.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel.test.ts tests/reel/grid-cell-immediate-stop.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter @slotclientengine/rendercore typecheck
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter crave exec vitest run tests/spin-immediate-stop.test.ts tests/nearwin.test.ts tests/freegamenearwin.test.ts tests/source-boundary.test.ts
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter crave typecheck
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter crave build
git diff --check && git -C /Users/zerro/gitee.com/pixicrave diff --check
```

- 超过6条是因为必须先验证/提交engine producer，再验证分叉后的external shared runtime与Crave consumer/build；不跑整仓。
- 若既有`package-runtime.test.ts`全文件有无关基线失败，先最小复现，只用明确命名的新增用例隔离并报告；不删断言。
- engine commit前检查status/staged diff/commit内容；同步后按文件核对task hunk，byte-parity子集用`shasum`，分叉文件用签名与测试证明。

### 人工验收

1. BaseGame在首格未起、全格滚动、部分格已停、Nearwin1已显示时quick stop：remaining同帧显示最终格，Nearwin结束，
   无后续nearwin/暗层/回弹，appear完整后进入wins。
2. response晚于点击：不显示猜测scene；target到达时同帧落停，目标和值正确，无第二次起转。
3. FreeGame selective：WL/CN held occurrence不重建，其它格立即落停并播appear，gap消失，下一free spin won/gap仍正确。
4. Nearwin尚未开始/已开始各一局：前者无fake lifecycle，后者只有一次stopped end，event audio无悬挂voice。
5. refill普通与期待路径点击：dropdown、Nearwin2 sweep、selective refill cadence/state不变，点击不影响下一spin。
6. 重复点击、低FPS长帧、横竖屏、错误注入、刷新/destroy重进：无stale gate、半提交、pool/RenderObject/listener泄漏。

### 独立验收建议

`必须`。涉及跨仓public contract、多格原子landing、effect/appearance owner和UI generation routing。独立复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/grid-cell-immediate-stop.test.ts
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter crave exec vitest run tests/spin-immediate-stop.test.ts tests/freegamenearwin.test.ts
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter crave build
```

并人工复验一次Nearwin active强停和一次refill不受影响。

## 9. 环境与依赖

- 两仓使用Node 24与pnpm；shell没有Node时先`source /Users/zerro/.nvm/nvm.sh`，再`nvm use 24`。
- 依赖缺失时在对应仓运行`CI=true pnpm install --frozen-lockfile`；只有下载失败后才设置约定代理重试。
- 不新增依赖/lockfile；时间推进继续使用唯一`runtime.update(deltaSeconds)`，不新增timer/RAF。
- engine分支使用`codex/`前缀；commit只包含任务文件，不夹带pixicrave或用户无关修改。

## 10. 生成物、文档与规则

- 不修改YAML、manifest、ZIP、delivery或生成TypeScript，不运行生成器。
- 两仓RenderCore README记录target-aware stop、continuous无target边界、appear和effect lifecycle；Crave README记录latch、
  Nearwin收尾和refill exclusion。
- 两仓`shared-game-runtime.md`只补稳定的target prepare/atomic commit、landing/activation和effect cleanup边界；不写Crave业务名。
- engine首commit hash是external同步依据；报告列同步文件、exact-parity文件与因基线分叉做的上下文适配。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/263-pixicrave-grid-cell-immediate-spin-stop-<utctime>.md
```

UTC由`date -u +%y%m%d-%H%M%S`生成。报告记录engine分支/首commit hash、最终API、两仓文件、同步方式/parity、Nearwin/refill
决策、验收、pixicrave未提交状态和剩余风险；随后提交为engine同一分支的收尾commit。

## 12. 风险、假设与待确认

### 风险

- waiting cells尚未创建target occurrence；无全批prepare时，逐格reset失败会留下半落停scene。
- 强停后若仍走normal timeline，后续boundary会重启Nearwin或要求已取消effect完成，必须有landing-only模式。
- 立即把`isSpinning`置false会让feature/win抢在appear前；一直保留spin dim/effect又不符合“马上停止”。
- early click时target不存在；同步落点只能是猜测。latch会继续滚到response，但保证结果正确。
- FreeGame若永久`finish()`会破坏下一spin；若只取消display不更新facts，下一轮gap会使用过时won set。
- Scene Layout两仓合法分叉；整文件复制会带入/删除无关能力，必须同步commit hunk并分别测试。

### 假设

- quick stop只缩短当前普通/FreeGame reel presentation，不代表放弃整轮或跳过wins/feature/mode/collect。
- “出现状态”是exact `targetLandingState`/Symbols landing appear；未声明appear的symbol继续normal，不新增fallback。
- 用户允许执行会话在engine创建本地`codex/`分支并commit两次（shared权威commit、报告commit）；不授权push/PR或pixicrave commit。
- pixicrave的`UpdateGameQuickStop`仍是canonical signal；若执行时变化，只做有证据的小幅适配。

### 待确认

无。

## 13. 完成清单

- [ ] engine分支、权威commit和同步顺序满足用户要求。
- [ ] immediate landing、appear、Nearwin结束和refill exclusion满足目标/非目标。
- [ ] public API、prepare/commit、edge、effect和资源生命周期符合计划。
- [ ] 两仓shared parity、Crave测试/build及指定自动化通过。
- [ ] 浏览器/独立验收已完成或明确记录未完成。
- [ ] UTC报告已生成并提交engine分支；未push/PR，pixicrave状态已报告。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根规则、本计划和列出的领域规则，核对双仓HEAD/status；
2. 从engine当前HEAD创建`codex/task-263-grid-cell-immediate-spin-stop`；
3. 先完成engine shared实现、测试、文档和规则，不触碰pixicrave；
4. engine验收通过后检查staged diff并创建本地权威commit，记录hash；
5. 只从该commit同步task 263 shared差异到pixicrave，再实现Crave app接入；
6. 分叉文件最小适配，明显扩围先停止；refill/BridgeCore/assets不得顺手修改；
7. 按L2运行两仓验收并完成人工/独立验证，失败先最小化复现；
8. 生成UTC报告并在engine同一本地分支创建收尾commit；
9. 除非用户再次明确要求，不commit pixicrave、不push、不创建PR。
