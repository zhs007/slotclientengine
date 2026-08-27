# 258 minecart2-bo-reel-collector-state-effects 任务计划

## 1. 目标与完成定义

### 目标

在 `/Users/zerro/gitee.com/piximinecart2` 中继续完善任务 248/255 已实现的 BO 收集表现：让 BaseGame 的 authored
`reel-collect` Spine 节点严格绑定 exact `bg-collector` 的累计 `val`，在初始进入游戏和回合稳定状态播放对应档位的
持续 Idle；BO 到达后根据累计值是否跨档以及 exact `cg-initbn` 是否触发，播放 Squib、Collect 或
`Collect -> Full -> Full_Loop` 序列。

任务 257 已提供的 exact 金色粒子拖尾同时挂到每个飞行中的 BO clone。盘面 BO 选择、`collect_start -> collect_idle`、
飞行目标/曲线、批量 hole 提交、award 与 BonusGame 往返顺序保持不变；本任务只补 server evidence、collector 状态和
presentation 生命周期，不改变游戏逻辑结果。

### 完成定义

- [ ] `bg-collector.val` 只接受 `0..100` 的安全整数，普通累计只映射三个档位：`0 -> state 0`、
      `1 <= val < 15 -> state 1`、`15 <= val <= 100 -> state 2`；value本身永远不把collector升到state 3。
- [ ] 初始 active wager 的 persisted collector value 能从 `SlotGameInitialState.userInfo.playerState.public.json` 的
      exact `lines -> mapBet -> bet -> mapComponentData["bg-collector"]` 路径读取；当前 lines/bet/component 尚无数据时按
      领域初值 `0` 启动且不借用其它下注档，当前下注档条目存在但 malformed 或 value 越界时显式失败。
- [ ] `reel-collect` 的普通持续状态使用正式资源中的 exact `0_Ilde/1_Ilde/2_Ilde`，bonus满状态持续使用exact
      `Full_Loop`；用户语义中的Idle不改写或alias资源实际拼写`Ilde`，也不调用manifest default `play()`假装任意档位Idle。
- [ ] BO round 必须有 exact `bg-collector`；compiler 从 `val/newCollector` 得到收集前/后的值，验证 delta、BO 数量与
      state transition，并把 old/new value、old/new state、bonus-triggered 固化进 immutable BO operation payload。
- [ ] 未出现 `cg-initbn` 且未跨档时，BO 到达后播放一次收集后档位的 exact `{state}_Squib`，完成后恢复同档
      `{state}_Ilde` loop。
- [ ] 未出现 `cg-initbn` 且跨一档时，播放一次收集后档位的 exact `{nextState}_Collect`，完成后切入同档
      `{nextState}_Ilde` loop；普通路径只会进入state 1或2，不构造资源中不存在的`0_Collect`，也不跳过多档或猜动画。
- [ ] 出现 exact `cg-initbn` 时，不走 Squib/普通跨档分支；直接播放exact `3_Collect`，随后`Full` once，再进入持续
      `Full_Loop`，然后才允许既有BonusGame transition operations执行。
- [ ] 每个 BO owned clone 在飞行前挂接任务 257 同一 exact `256-co-gold-particle-128` trail 和唯一参数配置；到达后
      立即停发、存量粒子自然 drain，collector 动画不等待尾迹才开始，operation resolve 前统一收敛全部 drain。
- [ ] BO 仍在同一个 `game003:bo-collect` state-mutation 中并行飞行、到达后消失，再由单一 collector 节点播放一次
      round-level 状态序列，最后批量提交 payload BO 为 canonical `-1/-1` holes。
- [ ] landing、CO collection、普通 wins、award、BO collection、BonusGame entry/BaseGame return 的相对顺序及
      `cg-initbn` 判据不变；scene、value、coinWin、totalWin、下注和服务器请求均不改变。
- [ ] malformed player state/component、非法 value/delta、跨多档、缺动画、播放/motion/trail/mutation failure 均在明确
      边界 fail-stop；未提交 BO 恢复可见，owned clone/trail 清理，已成功进入的 persistent state 不留下未处理 Promise。
- [ ] 定向自动化、真实浏览器视觉验收和 UTC 中文执行报告完成；不新增依赖或 lockfile。

## 2. 范围

### 包含

- Minecart2 app-owned collector value/state parser、persisted player-state wager selector及严格边界校验。
- `game003:bo-collect` payload 增加 collector old/new value/state、delta 和 bonus evidence，不改变 output。
- `reel-collect` 初始 Idle、no-cross Squib、cross Collect、bonus Full/Full_Loop 的 exact Spine 编排。
- BO clone 接入任务 257 的共享 app-local particle trail factory/config和 graceful drain。
- Minecart2 私有 versioned runtime config 增加唯一 collector threshold/animation binding，并把通用 collection trail 从
  coin-only 命名中整理为 BO/CO 共用配置。
- 用户提供的真实 payload shape 对应的精简 parser fixture、compiler/adapter/config/source-boundary测试及 README。

### 不包含

- 不改变 BO 识别、位置顺序、symbol state、117 像素目标、0.32 秒 motion、curve/easing、并发飞行或 holes 语义。
- 不改变任务 256/257 的 CL/CO collection、counter、CO win/end、partial commit和既有粒子视觉参数。
- 不改变 `cg-initbn` 触发判据、BonusGame/BaseGame mode transition、Popup、video、award或普通 win carousel。
- 不改变 `bg-collector` 的服务器计算、持久化、上限、protobuf schema或玩家状态；客户端只解析并呈现服务器事实。
- 不新增动画 alias、拼写修复 fallback、placeholder、代码拼接动画名、第二份 threshold表或第二份 particle参数。
- 不修改 `apps/game003v2`，不把 Minecart2 的业务 component/state 写入 LogicCore/RenderCore。
- 不做无关 shared package 同步、资源优化、全仓重构、依赖升级或发布。

## 3. 制定计划时的基线

```text
UTC: 2026-08-27T08:20:49Z
slotclientengine HEAD: cff56a3e41be21bedfa962799ce20ae4285fc431
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean

piximinecart2 HEAD: 9b6b4da6d6479f3de9f3f6c79e3eb3f5ae4fae89
piximinecart2 branch: rgs
piximinecart2 git status --short --untracked-files=all: clean
```

- 已读取两仓根 `AGENTS.md`、`tasks/templates/task-plan.md`、任务 255 计划、任务 257 计划/执行报告，以及主仓
  `docs/agent-rules/{game003,shared-game-runtime,loading-ui}.md`；目标 app、主仓 LogicCore/RenderCore 下没有补充
  `AGENTS.md`，piximinecart2 没有 `docs/agent-rules` 副本。
- `round-compiler.ts#compileGame003v2Round()` 当前顺序为 landing -> optional CO collection -> optional
  `game003:wins` -> optional award -> `game003:bo-collect` -> optional BonusGame entry/BaseGame return。
  BO positions 来自 coin collection 后的 settled snapshot，output 只把这些 positions 变为 `-1/-1`。
- compiler 已以 `BONUS_TRIGGER_COMPONENT = "cg-initbn"` 决定最后两个 mode operations，但 BO payload 当前只有
  `positions`，没有 `bg-collector` evidence，handler 因而固定播放 `0_Squib`。
- 用户样例为一个 BO，round component 是 exact `bg-collector {val:7,newCollector:1}`，history 不含 `cg-initbn`；
  同一响应 `playerState.public.json` 在 lines `10`、bet `2` 下保存 `bg-collector: {value:7}`。该样例支持
  “`val` 是收集后的累计值、`newCollector` 是本轮增量、old=`val-newCollector`”的解释，但仍需fixture明确保护。
- `applyInitialState()` 当前只用 `defaultScene` 初始化 package，没有解析 player state；`main.ts` 已持有 launch 的固定
  spin request bet/lines，可把 exact active wager传给adapter，无需扩展framework public API。
- `round-adapter.ts#playBoCollection()` 当前让全部 BO 执行 `collect_start -> collect_idle`，clone 后并行飞向转轮顶部中心上方
  117 logical px，presentation scope结束后固定 `0_Squib -> collect.play()`，再批量提交holes。它尚未创建particle trail。
- `coin-collection.ts` 已通过 `SceneLayoutPackageRuntime.createParticleTrailRenderObject()` 为每枚 CO 创建 exact
  `256-co-gold-particle-128` trail，follow owned clone self anchor，到达停发，允许多条并行自然drain并在operation末尾统一收敛。
  主仓与piximinecart2的particle trail和Scene Layout Spine public types当前逐文件parity，现有API足够BO复用。
- Minecart2 runtime config当前version 6，唯一trail配置仍位于`coinCollection.trail`；本任务应提升私有version并改成语义中性的
  单一collection trail binding，不能复制一份`boCollection.trail`。
- 正式initial delivery的`layout.manifest.json`把`reel-collect`声明为loop Spine，default animation是exact `0_Ilde`。
  对应`reel_collect.json`实际动画闭包是`0_Ilde,0_Squib,1_Collect,1_Ilde,1_Squib,2_Collect,2_Ilde,2_Squib,
3_Collect,3_Ilde,Full,Full_Loop`；没有`0_Collect`。调整后的合同只在bonus路径使用state 3，并精确使用现有
  `3_Collect -> Full -> Full_Loop`闭包。

## 4. 需求解释与技术决策

### 需求解释

1. 调整后的普通累计合同只有三个档位：`[0,1)、[1,15)、[15,101)`；因此0->positive进入state 1，14->15进入
   state 2，15之后无论value增长到100仍保持state 2。state 3不是value区间，只由exact `cg-initbn`触发。
2. “当前档位的Collect”解释为BO收集完成后的档位。正式资源只有`1/2/3_Collect`，其闭包正好表达进入对应新档；
   不能按收集前state 0构造不存在的`0_Collect`。
3. “Idle和Loop都是循环持续状态”解释为once动画完成后启动exact loop并让它继续留在唯一authored node；普通档位使用
   exact `*_Ilde`，满状态使用exact `Full_Loop`。handler只等待public `playAnimation(...,{loop:true})` 的
   first-loop边界，不额外建ticker、timer或状态机。
4. `bg-collector.val`按样例视为本轮收集后的累计值，`newCollector`视为本轮BO增量；old value严格由两者相减，且delta必须
   与payload BO数量一致。客户端不自行加总或持久化collector值。
5. 初始value按launch固定lines/bet选择persisted map。empty/new-player state，以及当前lines/bet/component尚无条目都显式定义
   为0且不扫描其它下注档；一旦当前下注档component条目存在，任何双层JSON、字段或类型错误都必须失败，不能回到0掩盖损坏数据。
6. BO粒子与collector动画以“到达”为共同边界：每条trail立即stop emission并在后台drain，clone到达后移除；collector
   once/loop序列马上开始，operation最终等待collector first-loop和全部trail完成，不用wall-clock补等待。

### 关键决策

1. **collector业务映射只放在Minecart2 versioned config。**
   - 新增exact node binding、value上下界、三个普通value档、bonus-only state 3及Idle/Squib/Collect/Full动画binding。
   - parser校验三个value区间连续、无重叠，state 0没有Collect，state 3只能由bonus触发且只需要`3_Collect`；运行时按
     binding取exact name，不字符串拼接。
2. **编译阶段固定presentation evidence，不让handler重新解析server。**
   - `round-compiler.ts`从exact `bg-collector` raw shape取得`val/newCollector`，从同一logic判断`cg-initbn`，并将不可变
     collector transition加入既有BO payload。
   - handler只消费已经验证的old/new state和bonus flag，并继续验证payload/output/BO handle；LogicCore保持业务中性。
3. **初始persisted state由app边界严格解析。**
   - adapter构造时接收launch的fixed wager；`applyInitialState()`在runtime commit后取得exact authored node并启动对应Idle。
   - 不扩展`SlotGameInitialState`、GameFrameworks或NetCore；playerState envelope选择和业务component JSON均封装在Minecart2 helper。
4. **复用一份app-local particle primitive。**
   - 从`coin-collection.ts`抽出config conversion、factory调用和pending drain bookkeeping；CO和BO都使用同一resource/config，
     只用seed offset区分emitter。
   - RenderCore继续拥有fixed-capacity pool、anchor follow、manual update和destroy；app不接触raw Pixi/ticker。
5. **state 3只属于BonusGame触发路径。**
   - 普通累计只使用state 0/1/2的Squib、Collect和Ilde；所有`val >= 15`都保持state 2，因此现有`2_Squib`闭包完整。
   - exact `cg-initbn`把本轮presentation target直接提升到state 3，固定播放`3_Collect -> Full -> Full_Loop`；不读取
     state 3的value threshold。

## 5. 职责与合同

- **LogicCore/BridgeCore**：继续提供name-parameterized raw component、immutable snapshot、remove operation和finalizer；不认识
  `bg-collector`、BO、threshold或animation，预计不修改。
- **Minecart2 player-state helper**：拥有active wager选择、双层JSON strict parse、new-player zero合同及value->state映射；
  不缓存服务器真实逻辑或猜其它bet条目。
- **Minecart2 compiler**：拥有`bg-collector`/`cg-initbn`业务语义、三个普通档、bonus-only state 3、old/new/delta/BO parity、
  多档拒绝和immutable payload。
- **Minecart2 adapter**：拥有唯一`reel-collect`节点的persistent playback、BO clone/trail并发、once->loop顺序、holes前barrier
  和failure恢复；不重新读取component或playerState。
- **RenderCore**：继续拥有authored Spine exact animation、first-loop completion、opaque anchor/motion、particle pool和presentation
  cleanup；当前不需public API变化。
- **资源生命周期**：authored collector node与original BO均borrowed/package-owned；clone和trail为operation-owned。trail成功路径
  stop-and-drain，abort/failure才hard destroy；node playback被新exact状态有序supersede，pending Promise必须await或显式收敛。
- **失败策略**：非法wager/player state/component/value/delta/state jump、缺mapping/animation/node、motion/trail/playback/mutation错误
  均显式reject；mutation前失败恢复BO visibility和old Idle，batch mutation成功后不倒放holes。
- **禁止行为**：不硬编码symbol code/geometry/animation推导，不读取raw display tree，不复制server累计值，不维护第二份资源表，
  不增加placeholder、alias、silent default或效果降级。

## 6. 文件范围

### 预计新增

```text
tasks/258-minecart2-bo-reel-collector-state-effects-<utctime>.md
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/collector-presentation.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/collection-particle-trail.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/collector-presentation.test.ts
```

### 预计修改

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/config.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/main.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-compiler.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-adapter.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/coin-collection.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/fixtures/game003-gmi.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-compiler.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-adapter.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/coin-collection.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/source-boundary.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
```

新增helper可在执行时按现有app结构合并为一个文件，但不得把compiler解析、Spine playback和particle ownership复制为多套实现。

### 原则上不应修改

```text
packages/{logiccore,rendercore,gameframeworks,bridgecore}/**
/Users/zerro/gitee.com/piximinecart2/packages/**
apps/game003v2/**
docs/agent-rules/**
AGENTS.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

若执行发现现有exact Spine loop或particle trail public API确实不足，先说明具体capability缺口；获准扩围后必须先在
slotclientengine实现/定向验证，再逐文件同步到piximinecart2并做parity，不能只改external副本。

## 7. 实施步骤

1. **确认双仓基线和资源闭包**
   - 重核两仓HEAD/status、本计划、任务257最终报告、current delivery animation keys及shared particle/Spine API parity。
   - 确认普通value只映射state 0/1/2、exact `cg-initbn`才进入state 3，且满状态持续动画为exact `Full_Loop`。
2. **建立唯一collector config与strict helper**
   - runtime config升级私有version，声明node、`0..100`、三个普通value档、bonus-only state 3及exact
     `Ilde/Squib/Collect/Full/Full_Loop` bindings；把
     `coinCollection.trail`重命名为BO/CO共用顶层binding并保持任务257全部数值不变。
   - helper实现value->state、persisted active-wager JSON解析、round `val/newCollector`解析及old/new transition校验；
     new-player empty state返回0，malformed existing state失败。
3. **扩充BO immutable operation evidence**
   - compiler source加入exact `bg-collector` selection；只有存在BO时要求唯一component，校验delta等于BO数量、old/new均在范围、
     state不倒退且普通路径至多跨一档。
   - 把collector transition和`cg-initbn` boolean加入BO payload；保持input/output、business key、operation位置和最后mode operations不变。
4. **初始化并驱动`reel-collect` persistent state**
   - `main.ts`把launch fixed bet/lines传入adapter；`applyInitialState()`在package runtime ready后strict读取persisted value并启动
     exact档位Ilde loop，失败走现有runtime cleanup。
   - BO到达后按payload分支：same-state Squib->Ilde、cross new-state Collect->Ilde、bonus
     `3_Collect -> Full -> Full_Loop`；
     每个once/first-loop Promise都纳入operation和abort ownership。
5. **让BO复用任务257粒子生命周期**
   - 抽取单一particle config/factory/drain helper；CO测试证明行为/参数不变。
   - BO clone mount后、source hide前创建trail并follow self anchor；并行motion到达即stop emission、移除clone并启动collector序列，
     最终等待全部trail自然排空。failure恢复未提交source并hard cleanup owned对象。
   - collector序列成功后继续现有batch hole commit；随后才让coordinator执行BonusGame entry。
6. **测试、文档与收尾**
   - fixture加入用户样例shape，测试初值/边界/所有分支、exact animation顺序、particle并发/drain、output/order和failure cleanup。
   - README更新collector state与资源拼写事实；按第8节运行L1验收、浏览器人工验收并生成UTC中文报告。

## 8. 测试与验收

### 测试原则

- player-state fixture覆盖empty新玩家、当前下注档缺失、active wager value 0/1/14/15/30/100、错误JSON、越界和非整数；
  阈值只从config/parser消费，不在测试另建算法表。
- compiler fixture经真实GameLogic parser入口，保留`bg-collector {val,newCollector}`、BO scene和可选`cg-initbn` shape；断言
  payload frozen、delta/BO parity、state jump及operation顺序，scene/value output与任务248保持一致。
- adapter用可控Spine/move/trail Promise断言：initial exact Ilde；non-cross `Squib -> Ilde`；cross `Collect -> Ilde`；bonus
  `Collect -> Full -> Full_Loop`；once与loop flag大小写精确且不调用`play()` fallback。
- 粒子测试断言每个BO一条与CO完全相同的resource/config、emitter跟随clone、arrival停发、collector无需等待drain、operation
  resolve前全部drain；abort/failure hard cleanup且未提交BO恢复。
- 保留BO `collect_start/collect_idle`、并行motion、117 target、0.32秒、curve/easing、单次collector序列和batch holes断言；
  不用wall-clock sleep或fake ticker冒充真实runtime。
- capability测试证明普通路径的state永远不超过2，bonus路径固定请求`3_Collect/Full/Full_Loop`，且不会按value进入state 3。

### 验收级别

默认`L1`：预计只修改external Minecart2 app私有config、compiler、presentation helper、测试和README，复用既有shared API；
不改public package contract、schema、依赖或lockfile。

若实际必须修改LogicCore/RenderCore public API或正式Scene Layout delivery，则升级`L2`：先验证slotclientengine
producer/generator，再同步external package或delivery并验证Minecart2 consumer/parity；不因此运行整仓L3。

### 执行会话必须运行

```bash
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/collector-presentation.test.ts tests/round-compiler.test.ts tests/round-adapter.test.ts tests/coin-collection.test.ts tests/source-boundary.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
git diff --check
```

- 若helper最终合并且没有`collector-presentation.test.ts`，第一条命令同步删除该不存在文件，不能用空测试冒充通过。
- 若typecheck仍被任务257报告记录的BridgeCore/device-detector既有NodeNext诊断阻断，最小化确认本任务文件无新增诊断并在报告记录。
- 若发生shared/resource条件扩围，追加对应package定向test/typecheck、Minecart2 generator `--check`、release checker和逐文件parity；
  报告说明L2触发项，不运行根级全量命令。

### 人工验收

1. 首次进入游戏分别用persisted val 0、7、15、30、100验证`0_Ilde/1_Ilde/2_Ilde/2_Ilde/2_Ilde`持续循环；
   value不会启动state 3，切换横竖屏不重启错误动画。
2. 用户样例（old 6 -> val 7、无`cg-initbn`）中，BO带任务257同款金色trail并行飞行；到达后只播放
   `1_Squib -> 1_Ilde`，然后BO格成为holes。
3. 14->15无bonus播放`2_Collect -> 2_Ilde`；15以上继续增长只播放`2_Squib -> 2_Ilde`，无按30升级、`0_Collect`请求、
   重复序列或闪回。
4. 任意有效post value且出现`cg-initbn`时固定播放`3_Collect -> Full -> Full_Loop`再进入BonusGame；`Full_Loop`持续且
   transition不提前。
5. 多BO并行时每个clone都有trail，到达后collector只响应一次；粒子自然消散不阻塞collector启动，无硬切、残影、过曝或对象增长。
6. malformed value、动画缺失、motion/trail/playback/mutation故障显式失败；未提交BO恢复，下一spin/退出/destroy无残留。

### 独立验收建议

`建议`：虽不改变shared public contract，但涉及persisted server state、跨round持续Spine状态和异步particle/playback/mutation
transaction。独立复验以下高风险点：

```bash
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/collector-presentation.test.ts tests/round-compiler.test.ts tests/round-adapter.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
```

## 9. 环境与依赖

- 使用仓库要求的Node 24和pnpm；shell没有Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时仅运行`CI=true pnpm --dir /Users/zerro/gitee.com/piximinecart2 install --frozen-lockfile`；下载失败后才按仓库约定
  设置代理并重试原命令。
- 本任务不新增依赖、不修改lockfile、不切换npm/yarn。

## 10. 生成物、文档与规则

- 默认不修改YAML、Layout ZIP、delivery manifest或生成TypeScript，因此不运行asset generator；当前动画闭包直接来自正式delivery。
- 本任务不需要修改正式资源；runtime直接使用现有exact `Full_Loop`，禁止手改delivery、chunk或skeleton来重命名动画。
- 更新Minecart2 README中任务248的固定`0_Squib/default play()`描述，写明collector value/state、exact`Ilde`资源名、
  `cg-initbn`分支和BO/CO共用trail；不复制完整配置表。
- 不更新根`AGENTS.md`或领域规则：本任务仍是现有app-owned业务语义注入和shared presentation能力消费，不形成新架构不变量。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/258-minecart2-bo-reel-collector-state-effects-<utctime>.md
```

UTC由`date -u +%y%m%d-%H%M%S`生成。报告简要记录最终状态映射、实际文件、exact
`3_Collect -> Full -> Full_Loop`序列、shared/resource是否扩围、自动命令结果、浏览器状态和剩余风险；不收集无关
coverage、历史矩阵、整仓统计或profiler数据。

## 12. 风险、假设与待确认

### 风险

- `Full_Loop`会跨BO operation和mode transition持续运行；supersede、abort、destroy必须收敛上一playback Promise，否则可能
  产生unhandled rejection或错误状态闪回。
- `playerState.public.json`是按lines/bet嵌套且component值再次JSON编码；active wager缺少条目表示尚未产生数据并返回0，
  数字key规范与样例不一致时必须以真实协议修正fixture/helper，不能扫描首项或其它bet兜底。
- 多BO粒子并行会把任务257的单emitter预算乘以BO数量；真实浏览器需验证低端设备性能，但不得通过静默少发trail改变行为。

### 假设

- 用户样例的`val=7,newCollector=1`与一个BO表示`val`是post value、`newCollector`是本轮BO数量；old value为6。
- Minecart2 launch仍只有一个固定bet/lines组合，`main.ts`可把它作为persisted map selector传给adapter；若未来支持切bet，需另行定义
  wager切换时collector state同步，不在本任务顺手扩展。
- empty/new-player player state表示collector初值0；存在对应component记录时必须严格提供`{value}`。
- 普通无bonus回合最多跨一个collector档位；若delta让state 0直接跳到state 2，没有明确动画时序，按非法
  server/presentation组合显式失败。

### 待确认

无。普通档位固定为0/1/2，exact `cg-initbn`唯一触发state 3，并使用exact `3_Collect -> Full -> Full_Loop`。

## 13. 完成清单

- [ ] 目标和非目标已满足，任务248/255/257既有行为无回归。
- [ ] player state、round collector evidence、state ranges和operation payload符合计划。
- [ ] exact Ilde/Squib/Collect/Full顺序、persistent loop和`cg-initbn`barrier均已验证。
- [ ] BO/CO共用唯一trail配置，normal drain与failure cleanup已验证。
- [ ] BO motion/output/order、award和mode round trip保持不变。
- [ ] 普通value不会进入state 3；bonus固定`3_Collect -> Full -> Full_Loop`且未引入动画alias。
- [ ] 指定自动化验收已通过，人工视觉验收状态已明确。
- [ ] shared/resource扩围若发生，已按producer -> sync -> consumer完成L2验收。
- [ ] README和UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根`AGENTS.md`、本计划列出的领域规则、本计划及任务257执行报告；
2. 核对两仓HEAD/status、active wager、真实component/playerState shape和delivery animation闭包；
3. 按普通0/1/2档、bonus-only state 3和exact `Full_Loop`合同实现，不重新引入30阈值或动画alias；
4. 保留用户无关修改，只在Minecart2 app范围小幅适配并在报告记录；
5. shared public API或正式资源需要扩围时先停止说明，并遵守主仓producer优先、external同步和generator纪律；
6. 只运行计划规定的L1验收；条件扩围时升级L2，不运行整仓L3；
7. 完成真实浏览器验收并生成UTC中文执行报告；用户接管的人工项明确标为待完成；
8. 除非用户明确要求，不commit、不push、不创建PR。
