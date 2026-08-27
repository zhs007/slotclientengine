# 256 minecart2-cl-coin-collection 任务计划

## 1. 目标与完成定义

### 目标

在 `/Users/zerro/gitee.com/piximinecart2` 的 Minecart2 回合中接入 exact `bg-coinwins`
所描述的 CL 收集 CO 流程。该流程发生在转轮及 feature landing 完成后、普通 `bg-wins`
symbol 中奖前：CL 进入收集状态，按服务器 result 坐标顺序逐个收集 CO，将每枚 CO 的
presentation value 累加显示在 CL 上。CO 飞向 CL 时挂接金色粒子拖尾；到达只停止新粒子发射，
已发射粒子继续按自身寿命自然衰减。收集结束后让 CO cell 成为 canonical `-1` hole，再继续既有中奖、
award、BO collection 与 mode transition。

现有 RenderCore 已覆盖 symbol clone/motion/text/mutation，但没有从 exact image runtime resource 创建、跟随锚点并
自然排空的通用粒子拖尾 primitive。本任务须先在 slotclientengine 增加最小 typed emit/drain contract，定向验证后
逐文件同步到 piximinecart2；LogicCore/VNICore 不修改。

### 完成定义

- [ ] 没有 exact `bg-coinwins` 时 operation trace、landing、普通中奖、award、BO collection、transition 和下一次
      spin 保持现状，不因盘面存在 CL/CO 自行触发收集。
- [ ] exact `bg-coinwins` 只接受一份 `usedResults` group；result positions 在当前 established landing scene
      中必须恰好包含一个 active game config 的 CL 和至少一个 CO，CO 顺序保持 result `pos` 顺序。
- [ ] 用户样例严格编译为 collector `(0,3)`，CO `(4,1)=1`、`(4,2)=750`，累计值 `751`；不硬编码
      symbol code、坐标、数量或金额。
- [ ] compiler 在任何画面 mutation 前验证每个 CO 的正 safe-integer presentation value、CO 数量与
      `symbolNum`、value 合计与 `wins`/component coin win 一致；未知或矛盾数据显式失败。
- [ ] round plan 在 landing 后、`game003:wins` 前插入独立 `game003:coin-collect` state-mutation；其 output
      只把被收集 CO 的 scene/value 改为 `-1/-1`，CL 和其它 cell 不变，后续 operation 从该 output 继续。
- [ ] CL 严格执行 `collect_start` once 完成后进入 `collect_idle`；随后 CO 串行执行
      `win` once、normal owned clone 飞向 CL、到达后 `end` once，每枚完成后对应盘面 cell 提交为 hole。
- [ ] 每枚飞行中的 CO clone 只挂一个 RenderCore-owned emitter，纹理只取 exact runtime resource
      `256-co-gold-particle-128`；到达后调用 graceful end 停止继续发射，
      存量粒子继续 update 至 live count 为零后才销毁 effect。正常完成路径禁止 `stop/reset/restart/destroy` 硬切粒子。
- [ ] 粒子排空不阻塞下一枚 CO 的 win/flight/end/count-up；operation 跟踪有限个 pending drain，并在最终退出
      presentation owner 前统一 await。abort/destroy 才允许作为异常清理强制销毁，且不得泄漏 ticker/listener/node。
- [ ] CL 上只创建一个字体计数对象，初始 `0` 不显示；每枚 CO 到达后的 `end` 期间按 app runtime config
      做短促、单调、整数累计，最终值精确等于全部 CO value 合计，不为每枚 CO 重建文字。
- [ ] 全部 CO 收集完成后 CL 执行 `collect_end` once，再执行 `win` once；计数在 CL win 完成后销毁，
      随后才开始既有普通 symbol win 首轮。
- [ ] failure、abort、next-spin cleanup 与 destroy 清理未提交 clone/文字并恢复尚未提交的隐藏 CO；已完整收集并
      提交的前序 CO 不倒放，当前 operation fail-stop，后续中奖不得继续。
- [ ] 收集后的 `-1` hole 可被下一次 targetless standard spin 正常接管；现有 BO hole、Collect/Jackpot/Coin
      landing、期待、横竖屏和低 FPS manual-update 行为无回归。
- [ ] 使用单张 128×128 RGBA 金色粒子纹理、单 emitter/flight、bounded emission/live-particle config 和 RenderCore
      manual clock；不创建 per-particle Pixi object/ticker，不使用 1254×1254 母图进入 production delivery。
- [ ] 正式 image runtime resource 已进入 production Layout source/delivery，shared package parity、生成器 checker、自动化与真实浏览器
      分别完成合同、性能和视觉验收；不新增依赖或 lockfile，执行结束生成 UTC 中文报告。

## 2. 范围

### 包含

- Minecart2 exact `bg-coinwins` component/result/presentation value 的 app-owned strict 编译。
- immutable coin collection state-mutation operation、post-collection snapshot closure 与 operation registry。
- CL/CO symbol state 编排、逐枚 owned clone 飞行、逐格 hole commit、单实例累计字体文字。
- 金色拖尾128×128 image runtime resource/delivery binding及已更新的用户Layout资源输入。
- RenderCore typed pooled particle emit/request-end/natural-drain生命周期及主仓到piximinecart2的逐文件同步。
- app runtime config 中独立的 CO 飞行 path/easing/timing 与 counter style/offset/count-up 参数。
- app runtime config 中 exact trail resource、segment、emission、粒子寿命和 hard cap；禁止运行时猜资源或无界发射。
- 用户样例 parser-shape fixture、compiler/handler/resource/source-boundary 定向测试、Minecart2 README 和执行报告。

### 不包含

- 不改变任务 252 的 `bg-coinwins2` Coin landing trigger；`bg-coinwins2` 与本任务 `bg-coinwins` 是两个
  exact component，不 alias、不互相 fallback。
- 不改变 `bg-gencoins` 的 CO ImgNumber hydration，不把 `bg-coinwins.wins` 当作 CO 单格 value 来源。
- 不从盘面扫描全部 CL/CO 代替 `usedResults`；不收集 result positions 之外的 CO。
- 不推断 `collectorNum` 的服务器业务含义；当前坐标角色由 result positions 对 established scene 中 exact CL/CO
  code 的严格分类确定。若未来要消费 `collectorNum`，需由新的服务器合同和 fixture 定义。
- 不实现多个 result group、多个 CL、零 CO、跨 step 或跨 collector 收集；这些输入本任务显式失败。
- 不改变普通 `bg-wins` 金额、carousel repeat、total award、BO collection target/squib 或 BonusGame transition。
- 不新增 RenderCore gameplay DSL、standard-reel transfer API、raw Pixi Container/SymbolPlayer 入口或第二套 ticker；
  shared 扩展只表达通用 image-backed particle emit/end/drain，不出现 CL/CO/金币语义。
- 不修改 `apps/game003v2`；该 app 继续遵守主仓当前暂停动态 feature bar 的合同。

## 3. 制定计划时的基线

```text
UTC: 2026-08-27T04:52:50Z
slotclientengine: HEAD 7105c3bc325219d8d28cf971e94cdead50534a7b; detached; clean
piximinecart2: HEAD 7da2613ca9c8da559bd97d716bc566b0345e02ae; rgs ahead origin/rgs 3; clean
```

- 已读取两仓根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{game003,shared-game-runtime,loading-ui}.md`；目标源码目录没有补充 `AGENTS.md`。
- 已读取任务 250、252、253、254 的计划/报告和 piximinecart2 当前源码；当前 HEAD 已包含 Collect/Jackpot
  landing、reel anticipation、BO collection 及后续视觉调整，不应从旧计划基线重做这些能力。
- `round-compiler.ts#compileGame003v2Round()` 当前顺序是 landing → optional `game003:wins` → optional award →
  optional `game003:bo-collect` → mode transitions；尚未查询 exact `bg-coinwins`，wins/BO 均消费 landing snapshot。
- `round-adapter.ts#playBoCollection()` 已证明 standard `ReelArea` 的 borrowed handle、owned
  `clone({state:"current"})`、`area.present()`、`context.move()`、visibility rollback 和 per-cell
  `replaceSymbols()` 可在 app 层安全组合，但 BO 是并行飞向 authored node，不能直接冒充本任务串行 CL 收集。
- LogicCore/BridgeCore 已有 `getComponentWinResultGroupsByName()`、result position strict parsing、
  `selectServerComponentSource()`、`genRemoveOperation()` 与 immutable v2 finalizer；无需新增
  `SymbolValWinsData` 专属 shared parser。
- RenderCore `createTextRenderObject()`、`PresentationScopeContext`、`SymbolHandle` 和
  `SymbolMutationArea` 已覆盖收集主体；shared code 仍无需识别 CL、CO、`bg-coinwins` 或业务动画名。
- RenderCore 当前能由exact image runtime resource创建普通RenderObject，但没有高性能world-space trail emitter、
  pooled粒子或“停发后自然排空”的typed lifecycle；app直接操作Pixi/自建ticker违反shared ownership边界。
- 当前 delivery 权威资源：CL 提供 `normal/win/collect_start/collect_idle/collect_end`；
  `collect_start` 为 terminal once、`collect_idle` 为 stable loop、`collect_end` 和 `win` 完成后回 default。
  CO 提供 `normal/win/end`；`win` 完成后回 default normal，`end` 为 terminal once。CL 无 ImgNumber，CO 的
  `image-value` 只绑定 normal/appear/win，不绑定 end，符合到达后由独立字体计数承接 value 的需求。
- SymbolPlayer 同一 update slice 在 terminal/return-to-default once completion 后 resolve await；CL
  `collect_start → collect_idle` 和 CO `win → current normal clone` 可通过现有 API 无可见中间帧完成，
  不需要改变 engine completion contract。
- 用户样例 established scene 的 CL `(0,3)` code `12`，CO `(4,1)/(4,2)` code `11`；otherScene value
  分别为 `1/750`。`bg-coinwins.usedResults=[0]` 的 result `pos` 为上述三点，`symbol=12`、`symbolNums=2`，
  component `wins/coinWin/cashWin=751`。
- 用户已于2026-08-27导出`/Users/zerro/Downloads/minecart2/layout32.zip`并更新delivery；initial chunk中的
  Layout manifest将exact key`256-co-gold-particle-128`声明为128×128 image runtime resource，且路由到onDemand组。
- delivery asset保留logical path`256-co-gold-particle-128.png`、sourceByteLength 18903并进入atlas；
  `tasks/256-co-gold-particle-128.png`是相同规格来源。1254×1254母图不得进入production。
- Minecart2 最近验收记录：package build、测试和 app lint 可通过；direct typecheck 仍可能被任务前已有的
  BridgeCore/device-detector NodeNext diagnostics 阻断，执行时只最小化判断，不顺手修无关基线。

## 4. 需求解释与技术决策

### 需求解释

1. “图标中奖以前”解释为 landing operation resolve 后立即执行 coin collection state-mutation，并在它完整 resolve 后
   才创建/执行普通 `game003:wins` presentation。award 和其它后处理维持现有相对顺序。
2. `bg-coinwins.usedResults` 是本次收集成员的权威集合；group 中唯一 CL 是 target，其余 exact CO 是 source。
   CO 的先后沿 result `pos` pair 顺序，不按坐标重新排序。
3. 单格金额继续取已编译 landing snapshot 的 presentation value，即 `bg-gencoins.otherScene` hydration 结果；
   `wins` 只做合计 parity，不复制为每格 value。
4. “CO win 后 normal 飞行”使用 borrowed CO 播完 `win`，随后从 current normal 创建 owned clone。原 occurrence
   在 clone 挂载后隐藏；clone 到达 CL 后播放 terminal `end`，再把原 cell 提交为 hole并销毁 clone。
5. “文字只第一次生成、0 不显示”解释为每个 coin collection operation 创建一个初始空字符串的
   `TextRenderObject`，锚到 collector handle；整个串行循环只调用 `setText()`，不为每枚 CO 新建节点。
6. “一点点增加”使用 app config 的固定 count-up duration 与整数 step 数，通过同一 RenderCore manual-update
   `context.delay()` 推进；每一步单调插值，去重重复整数并强制最后一步等于新累计值，不按金额大小创建无限 step。
7. 计数从当前 operation 的 `0` 开始，不读取或持久化跨 spin collector 值；`collectorNum` 当前没有足够仓库合同，
   不拿它猜初始金额或 collector 坐标。

### 关键决策

1. **新增独立 state-mutation，不扩展 landing 或伪装成 wins。**
   - landing 负责 established scene；`bg-coinwins` 会改变 settled scene，所以必须有 output snapshot。
   - `game003:coin-collect` 使用 `genRemoveOperation()`，把 CO code/value 同步写成 `-1/-1`，finalizer 证明 retained cell
     不变，coordinator 在成功后把 output 传给普通 wins。
   - 不把它塞进 `game003:wins`，避免 presentation operation 隐式改变 coordinator state。
2. **业务 strict parser 留在 Minecart2，通用粒子 primitive 先补主仓。**
   - BridgeCore 通用 helper 只解析 used result 和坐标；app 校验 exact component、single group、CL/CO role、
     `result.symbol`、`symbolNums`、positive value、safe sum 与 component totals。
   - shared package不出现Minecart2语义；RenderCore仅新增从exact image resource创建的typed pooled emitter、anchor follow、
     graceful end和awaitable drain，先在主仓实现/测试，再逐文件同步external package。
3. **复用通用 clone/motion/Text API，不新增 standard reel transfer。**
   - source/target 都是当前 settled `SymbolHandle` anchor，owned clone 可由 presentation scope 挂载、移动和销毁。
   - mutation 仍由 area owner 提交，app 不 reparent raw display、不复制 SymbolPlayer、不创建 RAF/GSAP ticker。
4. **逐枚 commit，失败采用 fail-stop。**
   - 每枚 CO 的 win、flight、end、count-up 完成后提交自身 hole，再进入下一枚；这与用户看到的逐个消失一致。
   - 当前枚失败时恢复尚未提交原 occurrence；之前完成的 hole 不倒放。operation reject 后 coordinator 不执行 wins，
     符合 shared runtime 的 partial commit fail-stop，而不是伪造跨多段视觉 rollback。
5. **counter 是 app-owned临时字体文字。**
   - style、collector-local offset、count-up duration/steps 位于 versioned runtime config；文字用 raw integer，不走
     server amount/currency formatter。
   - presentation scope 在 success/failure/abort/destroy 都销毁唯一节点；不修改 CL manifest 或添加第二份业务资源表。
6. **trail 用单 emitter、自然排空和有界配置。**
   - 每次flight创建一个operation-owned RenderCore trail并绑定clone anchor；particle owner留在stationary presentation layer，
     RenderCore每个manual update采样anchor生成world-space粒子。到达请求end，只停emission，live归零才resolve。
   - drain Promise 可与 CO `end`、counter和下一枚 flight并行；最终 scope关闭前 await全部 pending drain。正常路径不调用
     hard stop/reset/destroy，异常 abort/destroy才强制回收。
   - runtime只使用128×128 texture和RenderCore固定容量pool/batched container；rate/lifetime/size/speed/gravity/max-live写入
     versioned app config并严格验证，禁止per-frame allocation、per-particle ticker或无界队列。
7. **Layout source ZIP 仍由用户维护。**
   - `layout32.zip`及当前delivery已提供exact image key`256-co-gold-particle-128`；代码直接消费此key，不要求用户再author VNI。
   - 执行会话不手改source ZIP；资源缺失显式失败，不用颜色滤镜、旧coin图或placeholder降级。后续用户重新导出Layout时，
     只要保留该exact runtime resource合同即可，delivery继续由正式generator生成并`--check`。

## 5. 职责与合同

- **LogicCore/BridgeCore**：继续提供通用 immutable result/source/remove/finalizer能力；预计不修改。
- **Minecart2 compiler**：拥有 `bg-coinwins`、CL/CO role、result/cardinality、value total 和 operation order；输出
  render-ready collector/ordered coins/amount payload 及 post-collection snapshot。
- **Minecart2 handler**：拥有 exact symbol states、串行顺序、counter formatter/style、motion path/easing、逐枚 commit
  与 cleanup；不重新解析 server component或重算 symbol code。
- **RenderCore**：拥有handle identity、clone/motion manual clock、exact image加载、pooled world-space particle emission、natural
  drain、text/mutation/scope cleanup；不认识CL/CO或金色语义。VNICore预计不修改。
- **Layout source/delivery**：用户维护source ZIP；`256-co-gold-particle-128` exact image runtime resource是纹理权威，
  generator只输出delivery；粒子运动参数由Minecart2 versioned config唯一持有，app不维护物理文件名表。
- **资源生命周期**：collector/CO 是 borrowed、不得 destroy；clone/text/trail emitter 是 operation-owned。当前 CO 在隐藏前完成
  clone/mount；到达后 emitter停止发射但继续由同一manual clock排空，drain完成才destroy。commit前失败恢复visibility，commit后旧handle stale。
- **失败策略**：缺 component basic data、非单 result、position 越界/重复、CL/CO role错误、value/total溢出或不一致、
  state/resource缺失、move/end/count-up/mutation失败均显式 reject；不猜首项 collector、不扫描替代 target、不吞错误。
- **禁止行为**：不把 `bg-coinwins2` alias 为 `bg-coinwins`，不硬编码 code/pos/value，不用 raw Pixi display tree、
  wall-clock timer、silent fallback、第二份animation表、per-particle ticker/object；正常路径不得用 emitter `stop/reset/destroy`
  代替 graceful end/drain。

## 6. 文件范围

### 预计新增

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/coin-collection.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/coin-collection.test.ts
tasks/256-co-gold-particle-128.png（已生成，用户导入Layout ZIP的RGBA输入）
tasks/256-minecart2-cl-coin-collection-<utctime>.md
```

### 预计修改

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/{config,round-compiler,round-adapter}.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/{round-compiler,round-adapter,feature-bar-resource,source-boundary}.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/fixtures/game003-gmi.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
packages/rendercore/src/presentation/particle-trail-render-object.ts及public export（实际命名小幅适配）
packages/rendercore/src/scene-layout/{package-runtime,types}.ts及对应定向测试
packages/rendercore/README.md
docs/agent-rules/shared-game-runtime.md
/Users/zerro/gitee.com/piximinecart2/packages/rendercore/**（仅上述主仓改动的逐文件同步）
/Users/zerro/gitee.com/piximinecart2/assets/minecart2/**（从用户更新的Layout ZIP生成）
```

### 原则上不应修改

```text
packages/{logiccore,gameframeworks,bridgecore}/**
apps/game003v2/**
{package.json,pnpm-lock.yaml,pnpm-workspace.yaml,AGENTS.md}
docs/agent-rules/{game003,loading-ui}.md
```

`/Users/zerro/Downloads/minecart2/layout32.zip`是本任务当前用户维护输入，不由代码执行会话解包手改；执行会话仅用
gamelayoutpkgcli检查delivery。若typed API实际落点还需相邻文件，须保持最小public surface、更新定向测试并逐文件parity，
不能直接只改piximinecart2副本。

## 7. 实施步骤

1. **确认双仓执行基线与资源事实**
   - 重核两仓 HEAD/status、本计划、三份领域规则和 external ahead commits，保留执行时新增的用户无关修改。
   - 通过 current delivery parser fixture 复核 CL/CO exact states及 completion；若资源合同变化则按新的 exact 能力小幅适配，
     缺必需状态时停止，不猜 animation alias。
   - 以`layout32.zip`/当前delivery确认exact`256-co-gold-particle-128` image runtime resource、128×128及18903-byte来源；
     运行generator `--check`。资源合同漂移时显式失败，不以临时效果继续。
2. **先实现并同步通用 pooled particle trail**
   - 在slotclientengine RenderCore新增typed factory/object：由exact image resource创建固定容量pool，绑定RenderObject anchor，
     用presentation manual clock在stationary layer发射world-space粒子，并提供awaitable`stopEmissionAndDrain()`。
   - 定向测试anchor follow、停止后spawn不增长/live递减/零时resolve、低FPS deterministic update、无per-frame allocation、
     pool cap/backpressure及abort/destroy cleanup；更新最小README/领域规则。
   - 主仓测试通过后逐文件同步到piximinecart2，并以diff/parity和external同测试证明一致；不得在external先行实现。
3. **编译 `bg-coinwins` strict state mutation**
   - 在 source selection 中加入独立 exact `bg-coinwins` binding；仅 component 存在时读取 single used result group。
   - 以 established snapshot 的 game-config code 分类唯一 CL 与有序 CO，读取每个 CO presentation value；验证
     `result.symbol`、`symbolNums`、component `wins` 与 basic coin/cash totals，并安全求和。
   - 用 `genRemoveOperation()`生成 `game003:coin-collect`：payload冻结 collector、ordered
     `{position,amount}` 与 total，output只将这些 CO改为`-1/-1`；把后续 win/BO 的 scene/value输入切到 collection output。
   - 扩展 definitions并用用户样例 fixture 断言 plan 顺序、payload和 snapshot closure；覆盖 absent、multiple group/CL、
     non-CO member、missing/zero/overflow value、count/total drift和 result越界。
4. **实现串行 CL/CO presentation transaction**
   - 新建 `coin-collection.ts` 负责 operation/payload/output preflight，取得 exact collector与 ordered CO handles。
   - CL await `collect_start` 后 immediate进入 `collect_idle`；创建一次空 counter并通过 top presentation layer锚到 CL。
   - 对每个CO：await `win`、切到normal、clone/mount并隐藏source；从`256-co-gold-particle-128`创建emitter随clone飞行。到达立即
     request graceful end并记录drain Promise，不await即可并行CO `end`、counter与下一枚CO。
   - 每枚end/count-up完成后提交hole并释放clone；全部业务动画结束后await pending drains，再关闭scope。正常路径不得对
     draining emitter调用stop/reset/destroy，只有abort/destroy异常cleanup允许硬回收。
   - 全部 CO完成后 await CL `collect_end`、`win`，再退出 scope销毁 counter；catch/finally恢复未提交 source与 collector normal，
     不访问已被 mutation stale 的 handle。
5. **接入 adapter、资源与 config**
   - 在runtime manifest/config parser增加`coinCollection` motion、counter和trail字段，严格验证finite duration、safe steps、
     exact image resource、bounded emission/lifetime/size/speed/gravity/max-live、合法bezier和非空字体/style；不复制物理路径。
   - registry注册 exact kind并透传 coordinator signal；保持 `game003:wins` handler不变，使 operation顺序自然形成 barrier。
   - 更新 source-boundary只允许通过RenderCore public `createTextRenderObject`/presentation API实现本业务，继续禁止 raw
     Container、SymbolPlayer、ticker和asset filename。
6. **测试 resource、时序、性能、partial failure 与 cleanup**
   - handler测试使用可控 state/move/delay Promise，断言 result order、单 counter identity、0为空、单调/最终累计、
     `collect_start→idle→CO序列→collect_end→CL win→普通 wins` barrier和逐格hole。
   - 覆盖flight结束后emission停止、存量粒子自然归零、drain不阻塞下一CO、final barrier、win/move/end/count-up/mutation失败、
     abort/destroy、visibility恢复、前序hole保留和无listener/node泄漏；测试不依赖真实wall clock。
   - resource测试从更新delivery证明CL/CO states与`256-co-gold-particle-128`能力；断言texture为128×128、大小受控，
     emission/live cap有界，不在app或测试维护物理filename/animation副本。
7. **文档与收尾**
   - 更新 Minecart2 README 的 `bg-coinwins` 数据合同、与 `bg-coinwins2` 区别、状态顺序、counter/raw value、hole和失败边界。
   - 运行L2 producer→同步副本→delivery→Minecart2消费者定向验收和真实浏览器性能观察，不扩大到整仓L3。
   - 生成UTC中文执行报告，记录实际 visual参数、命令结果、基线 typecheck诊断及未完成浏览器验收。

## 8. 测试与验收

### 测试原则

- compiler测试从真实 parser-shape fixture进入，不能直接伪造最终 payload绕过 `bg-coinwins.usedResults`。
- handler测试按 controlled Promise 检查严格串行，不用 fake wall-clock sleep；count-up只断言单调、无0、step有界和最终精确。
- failure测试区分未提交当前CO可恢复与已提交前序CO不倒放；operation reject后普通wins/award不启动。
- particle fake-clock测试分别计数emitted/live/completed：arrival后emitted不再增长、live逐步降至0才complete；下一CO可先启动。
- resource测试读取production delivery作为能力权威，不复制CL/CO manifest对象或physical filename清单；预算为纹理
  128×128且≤32KB、单emitter live≤48、最长粒子寿命≤0.6s、同时emitting≤1、emitting+draining≤2。若第三个effect
  将超cap，先await最早drain形成显式backpressure，不允许无界积压。
- 既有测试若与本计划明确顺序冲突则更新期望；不得为了保留过时期望把收集降级成非阻塞presentation。

### 验收级别

`L2`：本任务新增RenderCore public typed particle lifecycle、同步其直接消费者副本，并检查正式Layout delivery。验收覆盖
主仓producer、external parity、delivery generator/checker和Minecart2消费者；不涉及根工具链/lockfile，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter @slotclientengine/rendercore test
pnpm --filter gamelayoutpkgcli start -- --input /Users/zerro/Downloads/minecart2/layout32.zip --delivery-dir /Users/zerro/gitee.com/piximinecart2/assets/minecart2 --quality 80 --check
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 test
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
git diff --check
```

命令超过默认6条是因为同一任务有shared producer、逐文件同步、delivery和app消费者四个证据边界；仍为定向L2，
不运行根级全仓test/build/format。后续若用户再导出ZIP，以最新明确路径替换并在报告记录。

- typecheck若仍被已有 BridgeCore/device-detector诊断阻断，最小化确认输出是否包含本任务文件并在报告列出；不以build
  通过冒充typecheck，也不扩大修复无关依赖。
- 不运行根级全仓test/build/format；delivery必须先生成再以同一输入`--check`，禁止手改生成结果。

### 人工验收

1. 用户样例落停后、普通中奖前：CL `(0,3)` 完整 start→idle；CO `(4,1)` 再 `(4,2)` 严格逐枚
   win、带金色粒子拖尾飞行、end，counter由空→1→751且只有一个实例。
2. 全部CO完成后盘面两格为空，CL collect_end→win和counter消失后才播普通symbols；下一spin从hole正常启动、落停。
3. 每枚CO到达后发射源立即停发，但飞出的金粒继续自然淡出，无骤然消失；淡出可与CO end/counter/下一枚并行，
   最后一批也不因scope关闭被硬切。DevTools/测试观测符合1个emitter、≤2个总effect及live cap，连续20局后回到基线对象数。
4. 含不同CL位置、跨列CO和小/大value的测试局：anchor跟随正确、result顺序不被坐标排序、字体不遮挡且整数累计清晰。
5. 横屏/竖屏/resize、低FPS、连续spin以及flight/drain/end/count-up中刷新或销毁：无clone、counter、particle pool、隐藏symbol残留，
   无未捕获Promise或下一局旧累计。

### 独立验收建议

`建议`：涉及跨包public contract、正式delivery、settled scene mutation、particle drain和性能生命周期；独立复验主仓
RenderCore测试、Minecart compiler/handler定向测试、Minecart build、delivery checker和external diff。

## 9. 环境与依赖

- 使用仓库要求的Node 24和pnpm；shell缺Node时`source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时运行`CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才加代理重试。不新增依赖/lockfile。

## 10. 生成物、文档与规则

- `tasks/256-co-gold-particle-128.png` 是交给用户的128×128 RGBA输入；ImageGen母图不进入production。
- 用户已用Layout editor将贴图导出为`layout32.zip`中的exact image runtime resource；执行会话不解包手改ZIP，也不覆盖用户后续
  Layout编辑，只用gamelayoutpkgcli对现有delivery运行同输入`--check`。
- 更新 `/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md`，使 `bg-coinwins` runtime contract
  不依赖本计划或对话。
- 更新最小RenderCore README和`docs/agent-rules/shared-game-runtime.md`，固定正常完成必须graceful drain、异常cleanup才可hard destroy；
  不修改根`AGENTS.md`或无关领域规则。

## 11. 执行报告

规划时不生成报告。执行后以`date -u +%y%m%d-%H%M%S`创建
`tasks/256-minecart2-cl-coin-collection-<utctime>.md`，简记实现/文件、偏差、验收、浏览器待验和剩余风险；
不收集无关coverage、整仓统计、历史矩阵或profiler证据。

## 12. 风险、假设与待确认

### 风险

- 仅有一份`bg-coinwins`样例；multiple result/collector和`collectorNum`语义未成合同，显式拒绝，后续形态需新fixture。
- CO `end`不挂ImgNumber，字体counter在视觉上必须及时承接value；offset、font size、count-up节奏和curve需真实浏览器调校。
- 自然drain会让短时间内多个effect并存；必须以≤2 runtime和≤48 live/emitter硬预算限制峰值，超限采用oldest-drain
  backpressure，不能为了视觉连贯允许无界积压，也不能为了性能在正常路径硬切粒子。
- 当前ZIP只提供trail image、没有authored effect；这是预期合同，RenderCore generic particle primitive负责emission/drain。
- 逐枚commit后后续枚失败不会倒放前序hole，这是架构规定的fail-stop；服务器重试/重连恢复不属于本任务。
- direct typecheck可能被既有NodeNext错误阻断；报告须区分本任务与基线。

### 假设

- 当前production delivery与样例一致：`bg-gencoins`已经为每个result CO提供正整数presentation value，CL value为null。
- `bg-coinwins`只在landing established后出现，且本轮普通 `bg-wins` positions不依赖将被收集的CO；compiler会用
  post-collection scene再次严格验证这一点。
- counter从0开始是本轮临时展示，不读取`collectorNum`或player持久状态。
- 当前exact runtime key为`256-co-gold-particle-128`；后续Layout若改key，只同步versioned config和测试，不增加alias。

### 待确认

无。`layout32.zip`和delivery已就绪；正式generator checker仍须在依赖/build产物可用的执行环境完成。

## 13. 完成清单

- [ ] exact `bg-coinwins` 触发、数据校验和非触发回归符合计划。
- [ ] operation顺序为 landing→coin collect→ordinary wins→award→BO collect→transition。
- [ ] CL/CO状态、串行motion、单counter、累计和hole output符合合同。
- [ ] 金色trail资源、单emitter、arrival graceful end、自然drain、并发/live cap和20局清理符合合同。
- [ ] failure/abort/destroy ownership和partial commit边界已测试。
- [ ] RenderCore主仓实现→测试→external逐文件同步顺序及parity有证据，LogicCore/VNICore/依赖/lockfile保持不变。
- [ ] 用户ZIP输入、生成delivery和`--check`有记录，未手改ZIP或生成物。
- [ ] L2自动化已通过或基线阻断已最小化记录，并与浏览器人工验收明确区分。
- [ ] Minecart2 README和UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取双仓规则/本计划并核对Git基线；按计划实现，小幅适配记报告，重大扩张先停止说明；
2. 用`layout32.zip`完成delivery checker，不手改ZIP/生成物；随后运行L2验收并生成UTC中文报告；
3. 除非用户明确要求，不commit、不push、不创建PR。
