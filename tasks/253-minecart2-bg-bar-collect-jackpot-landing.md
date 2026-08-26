# 253 minecart2-bg-bar-collect-jackpot-landing 任务计划

## 1. 目标与完成定义

### 目标

在 `/Users/zerro/gitee.com/piximinecart2` 的 Minecart2 当前 `bg-bar` 流程中接入
`collect` 与 `jackpot` 两种当前玩法：中央 `feature.json#Feature` 完整结束后，Collect 先沿第一轴
自上而下执行五格、每格 120ms 的 `topick.json#Topick_Loop` 扫描，再对该轴最终 scene 中的 CL
执行任务 250 的 Topick/preview 落停流程；Jackpot 仅在 exact `bg-addjk` 存在时，以其 `pos` 和唯一
final scene 执行 Topick/CO handoff，并让 CO ImgNumber 使用 `bg-gencoins.otherScene` 的同坐标值。

为此先在 slotclientengine 的 RenderCore canonical symbol factory 增加严格的
`presentationValue` 创建选项，使池化 CO preview 在首次可见前即获得本轮最终值；验证后只把实际
shared 变更文件同步到 piximinecart2，再实现 app 业务编译和播放时序。

### 完成定义

- [ ] Collect 当前玩法等待中央 `Feature` 完整结束；随后只在第一轴 `(x=0)` 按
      `(0,0) -> (0,1) -> ... -> (0,4)` 顺序播放 exact `Topick_Loop`，每格显示 120ms 后消失，任意
      时刻至多存在一个扫描 Topick，五格结束前不开始停轴。
- [ ] Collect 扫描结束后，从 immutable landing output 按 active game config 的 exact `CL` code
      计算第一轴全部 CL 坐标；无 CL 时直接按既有 left-to-right cadence 落停，有 CL 时全部目标执行
      `Topick_Start -> Topick_Loop` 和 normal CL preview，目标列落停后 `Topick_End`，再清理
      preview/topick，露出已正式落停的同一个 CL，不做 replacement或读取presentation value。
- [ ] 用户 Collect 样例按当前 game config 解析时，CL code 为 `12`，位于第一轴 `(0,0)`；第三轴的
      code `11` 是 CO，与 Collect 目标无关。样例必须执行五格扫描后对 `(0,0)` 运行 CL Topick/preview。
- [ ] Jackpot 当前玩法缺少 exact `bg-addjk` 时不进入特殊 operation，继续既有普通 feature landing
      gate；存在时等待完整 `Feature`，使用 `bg-spin` 唯一 scene 作为 initial、`bg-addjk.pos` 与唯一
      `usedScenes` scene 作为 final output。
- [ ] Jackpot 每个 target 必须从 initial symbol 变化为 active game config 的 exact `CO`；样例
      `(4,2)` 从 code `8` 变为 CO code `11`，preview 和正式 CO 都使用
      `bg-gencoins.otherScene[4][2] = 10`，不硬编码坐标、code 或数值。
- [ ] Jackpot 复用任务 250 的 wild handoff：全部 Topick Start 完成并进入 Loop、挂载带 ImgNumber 的
      CO preview 后才逐列落 initial scene；目标列 settle 后播放 End，以 final CO/value 原子替换，清理
      preview，再在正式 occurrence 播放 exact `appear -> normal`。
- [ ] RenderCore symbol factory 的 `presentationValue` 只对 exact symbol factory 合法；永久/池化创建都在
      返回前应用 value，池化复用每次重新应用本次 value（未提供时重置为 `null`），错误 value 在可见或
      mount 前显式失败，旧池化句柄 destroy 后保持 stale。
- [ ] Up/Wild/Coin/Bonus、normal、首次初始化、0.5 秒普通 feature gate、中奖、award、BO collection、
      mode transition、横竖屏与取消/destroy 既有行为保持。
- [ ] shared 源码/测试先在 slotclientengine 完成，再逐文件同步到 piximinecart2；资源、schema、生成物和
      lockfile 不变化。自动化与真实浏览器分别完成合同和视觉验收，执行结束生成 UTC 中文报告。

## 2. 范围

### 包含

- RenderCore Game Layout exact symbol factory 的 typed `presentationValue` checkout、pool reuse/reset 和
  strict option validation。
- Minecart2 step 0 exact `bg-bar.curFeature=collect|jackpot` 选择、`bg-addjk` source/scene/pos 解析、
  Collect CL code 与 Jackpot CO code/value 解析及 immutable scene-landing operation。
- Collect 五格 120ms Topick_Loop 扫描、第一轴 CL 目标计算、CL preview/正式 occurrence handoff。
- Jackpot `bg-spin -> bg-addjk` initial/final handoff、CO preview value、replacement 与 `appear -> normal`。
- 任务 250/252 controller、Feature barrier、operation registry 的最小扩展，以及 parser-shape fixture、
  定向测试、shared parity、Minecart2 README 和执行报告。

### 不包含

- 不实现或改变 `scatter/nail/expand`，不重做 Up/Wild/Coin/Bonus，不改变 `bg-bar.features` 下一轮 queue。
- 不把 `bg-collector.val`、result type/pos、中奖 symbol 或 `usedFeatures` 当作 Collect CL 目标；目标只来自
  final landing scene 第一轴的 exact CL。
- 不把第一轴扩张为全部五轴，不把第三轴 CO 当成 Collect 目标，不按 authored skeleton 名猜逻辑 symbol。
- 不修改服务器协议/protobuf、真实轮带、下注、结果金额、win group、jackpot 金额或 BonusGame 业务。
- 不新增 gameplay DSL、Topick plan、reel state machine、raw Pixi/Spine/SymbolPlayer 入口或第二份资源表。
- 不修改 Scene Layout/Symbols/ImgNumber manifest schema、production ZIP、delivery bytes/assets map、YAML、
  生成器、依赖或 lockfile。
- 不修改 `apps/game003v2`；该 app 继续遵守主仓当前“动态 feature bar 暂停”合同。

## 3. 制定计划时的基线

```text
UTC: 2026-08-26T09:28:18Z
slotclientengine HEAD: cf001e9a9ea2b2c86d9f008b1a28fab873f0f6c2
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean
piximinecart2 HEAD: 3581a01c7423a442a365ea5631322c2c74dd3050
piximinecart2 branch: rgs
piximinecart2 git status --short --untracked-files=all: clean
```

- 已读取两仓根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{game003,shared-game-runtime,loading-ui,scene-layout}.md`；目标源码目录没有补充
  `AGENTS.md`。
- 已读取任务 250 计划/报告、任务 252 计划/报告和 piximinecart2 当前源码。任务 250 的 shared pool、
  canonical resource/symbol factory、top layer、stable cell anchor、`ReelSpinSession`、settled replacement 已在
  两仓相关源码保持一致；任务 252 已把 Up/Wild/Coin/Bonus 汇入
  `feature-symbol-transform.ts#playFeatureSymbolTransform()`。
- `round-compiler.ts#compileGame003v2Round()` 当前读取 exact `bg-bar.curFeature`，已有
  up/wild/coin/bonus scene-landing kind；latest landing scene 只在 `bg-spin|bg-addbo` 中选择，尚未绑定或编译
  `bg-addjk`，也没有 collect/jackpot operation。
- `feature-bar-conveyor.ts#waitUntilReelCanStop()` 只有 up/wild/coin/bonus 可请求完整 `Feature` barrier；其它
  feature 在 `Feature` 开始后继续使用配置的 `featureReelStopDelaySeconds=0.5`。
- canonical symbol factory 当前只接受 `{ pooled }`，实际创建 owned `SymbolHandle`，但 public endpoint 返回
  `RenderObject` 且没有创建期 value 输入；业务不能在不扩张 typed contract 的情况下安全地为池化 CO preview
  调用 `setValue()`。`RenderObjectPool.create(prepare)` 已支持每次 checkout 在返回前重设底层对象，无需修改
  pool 算法。
- 当前 delivery 的权威资源事实：Topick exact animations 为
  `Topick_Start/Topick_Loop/Topick_End/Topick_Line`；active binding id 为 `minecart2`；CL 逻辑 symbol code
  为 `12`，公开 `normal/appear/collect_start/collect_idle/collect_end` 且没有 ImgNumber；CO 逻辑 symbol code
  来自 game config（当前 `11`），公开 `normal/appear/end/loop/win`，
  `appear` 使用 exact `Start`；exact `image-value` ImgNumber node 同时绑定 `normal/appear/win`。
- 用户 Jackpot 样例有 `bg-addjk.pos=[4,2]`、`usedScenes=[1]`：scene 0 的 `(4,2)=8`，scene 1 的
  `(4,2)=11`，`bg-gencoins.usedOtherScenes=[0]` 且 otherScene `(4,2)=10`。非 target scene cell 不变。
- 用户 Collect 样例的 `curFeature=collect`、唯一 landing scene 的 CL code `12` 位于第一轴 `(0,0)`；
  `(2,0)/(2,1)` 的 code `11` 与 otherScene `2/20` 是 CO 数据，不属于 Collect 目标。
- 任务 252 报告记录 Minecart2 定向测试和 build 通过；外部 typecheck 当时仅被任务前已有 BridgeCore/
  device-detector NodeNext import 与 implicit-any 错误阻断，执行时需重新最小化判断，不为这些错误改本任务生产代码。

## 4. 需求解释与技术决策

### 需求解释

1. “当前玩法”继续以 step 0 exact `bg-bar.curFeature` 为准，不使用上一轮 frozen queue 的
   `features[0]` 或 `usedFeatures[0]`；compiler 与 Feature barrier 对同一个 current feature strict 匹配。
2. “第一轴”按仓库 column-major scene 合同解释为 `x=0`，“最上面”是 `y=0`；五格扫描固定覆盖当前
   5×5 main reel 的 `y=0..4`。用户给出的 120ms 进入 versioned app runtime config，不散落成测试/handler 常量。
3. Collect 的扫描阶段只播放 exact `Topick_Loop`，每格到时立即 stop/detach/destroy，再创建下一次池化句柄；
   不补播用户未要求的 Start/End。扫描后的 CL 阶段才完整复用任务 250 的 Start/Loop/End + preview 流程。
4. Collect landing initial/output 相同；CL preview 只是正式目标落停前的遮盖，不触发 replacement。目标列 settle
   后 End 完成，移除 preview 即露出 reel owner 已提交的正式 CL，不读取 `bg-gencoins` value。
5. Jackpot 只有 `curFeature=jackpot` 且 exact `bg-addjk` 存在时才是 special landing；缺 component 走普通
   landing/0.5s gate。component 存在却 feature 不匹配、scene/pos/value 非法时显式失败，不能静默忽略。
6. Jackpot 的 `bg-spin` 唯一 scene 是视觉 initial，`bg-addjk` 唯一 scene 是 operation final output；pos cell
   必须变成 CO，非 pos cell不得变化。`bg-gencoins` 必须为 target 提供可在首次可见前验证的 positive safe integer。
7. CO preview 与正式 replacement 使用同一个 compiled output value；preview checkout 时设置 value，正式 reel
   occurrence 由 `replaceSymbols({code,value})` 一次创建，随后播放 CO manifest 的 `appear -> normal`。

### 关键决策

1. **扩展 canonical symbol factory，而不向 app 暴露 SymbolPlayer。**
   - `resource-factory.create()` 增加可选 `presentationValue?: number | null`；只有 descriptor
     `resourceKind=symbol` 接受，普通 Spine/image/VNI/image-string factory 收到该字段显式失败。
   - symbol factory 永久/池化创建都在返回前调用 owned SymbolHandle 的正式 value contract；池化 checkout
     未传字段时也明确设置 `null`，避免复用上一局 CO 数值。
   - value validation/ImgNumber controller/资源选择仍属于 canonical Symbol package；app 不读取 manifest bytes。
2. **Collect 与 Jackpot 使用两个 app-owned operation kind，共用 controller primitives。**
   - 新增 exact `game003:collect-landing` 与 `game003:jackpot-landing` version 2；payload 仍只保存 feature、
     render-ready target positions 和 initial snapshot，output 是后续 operations 的唯一 scene/value 输入。
   - controller 增加 scan policy 与 CL/CO preview policy，不复制逐列 landing、pool cleanup 或 replacement state machine。
3. **Collect 目标只从 final scene 的第一轴计算。** 不读取 result.pos、`bg-collector` 或其它轴；使用 game config
   exact CL code。无目标仍编译 collect landing，因为五格扫描是玩法固定前奏。
4. **Jackpot server 数据在 mutation 前完整编译。** source bindings 增加 exact `addjk`；component 顶层 pos 用
   `parseExactPositionPairs()`，唯一 scene 用既有 component scene query，shape/bounds/duplicate/non-target drift/
   required CO/value 全部在 immutable plan 前失败。
5. **失败采用 partial-commit fail-stop。** 扫描/Topick/preview/land/replace/appear 任一失败或 abort 时取消未完成
   reel，detach/destroy 全部 owned 池对象；已 settle/replacement 的列不倒放，后续 win/award 不执行。

## 5. 职责与合同

- **LogicCore/BridgeCore**：继续提供 frozen component/raw scene/position query、snapshot/finalizer；不认识
  collect/jackpot/bg-addjk/CL/CO/Topick，预计不修改。
- **RenderCore**：symbol package runtime 创建带 value controller 的 owned SymbolHandle；runtime address factory
  负责 strict typed option、checkout prepare、pool stale/reset/destroy，不认识 Minecart2 玩法。
- **Minecart2 compiler**：拥有 current feature、component 名、第一轴 CL policy、initial/final scene、Jackpot CO value 与
  operation/output 顺序；不硬编码 symbol code、坐标样例或数值。
- **Minecart2 controller**：拥有 Feature barrier、Collect 扫描、Topick/preview、逐列 settle、replacement、
  appear/normal 时序；不接触 raw display tree/player。
- **资源生命周期**：package runtime 拥有 canonical factory pool；当前 operation 拥有 scan Topick、target Topick
  和 CL/CO preview 句柄。create/mount 中途失败回收已创建项；成功、reject、abort、next-spin、destroy 均只释放一次。
- **失败策略**：unknown feature/component 组合、非唯一 scene、非法 pos、错误 target symbol、缺/非法 CO value、
  factory option/kind 错误、stale handle 和异步播放/落停/mutation 失败全部显式 reject。
- **禁止行为**：不增加 symbol alias、首项/default value、路径猜测、placeholder、无 component 效果降级、
  第二份 symbol/resource 表、服务器真实轮带读取或 app-owned reel/player/pool 实现。

## 6. 文件范围

### 预计新增

```text
tasks/253-minecart2-bg-bar-collect-jackpot-landing-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/core/runtime-address.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/tests/scene-layout/runtime-address-pool.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts（仅实际 runtime value 接线测试需要时）
packages/rendercore/README.md
docs/gamelayout-runtime-addresses.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md

/Users/zerro/gitee.com/piximinecart2/packages/rendercore/**（只同步上述实际 shared package 源码/测试/README）
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/{config,round-compiler,feature-bar-conveyor,feature-symbol-transform,round-adapter}.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/{round-compiler,feature-bar-conveyor,feature-symbol-transform,feature-bar-resource,round-adapter,source-boundary}.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/fixtures/game003-gmi.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
```

若 shared 测试可在现有 `runtime-address-pool.test.ts` 完整覆盖 bridge 与 pool checkout，则不修改
`package-runtime.test.ts`；若 app controller 为保持职责清晰需拆出 Collect scan helper，可在同一 app 新增一个
helper及对应测试，并在报告记录小幅文件适配。

### 原则上不应修改

```text
packages/{logiccore,gameframeworks,bridgecore}/**
packages/rendercore/src/presentation/render-object-pool.ts
apps/game003v2/**
assets/**
/Users/zerro/gitee.com/piximinecart2/packages/{logiccore,gameframeworks,bridgecore}/**
/Users/zerro/gitee.com/piximinecart2/assets/**
AGENTS.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

若实现需要修改 pool 算法、LogicCore/public operation schema、Symbols/Scene Layout manifest、production assets、
依赖或 lockfile，属于明显范围扩张，必须先说明真实缺口，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认双仓执行基线与 canonical 资源事实**
   - 重核两仓 HEAD/status、本计划、领域规则、任务 250/252 最终合同和 shared 文件 parity。
   - 从当前 delivery ZIP 复核 Topick exact animations、CO normal/appear/image-value、binding、5×5 geometry 与
     top layer；资源变化时按新 exact contract 小幅适配或停止，不猜 alias/path。
2. **在 slotclientengine 扩展 symbol factory value checkout**
   - 扩展 runtime resource endpoint typed options和 bridge 的 symbol create 参数；symbol factory对每次永久/池化
     checkout 在返回前应用 `presentationValue ?? null`，其它 resource kind 严格拒绝该字段。
   - 测试永久创建、池复用 `10 -> 20 -> null`、invalid value、非 symbol option rejection、stale/destroy；确认
     prepare 失败的实例永久移出池且不返回半配置对象。
   - 更新 RenderCore README、runtime address 文档和最小 shared/scene-layout 稳定规则；完成定向验证后逐文件
     同步到 piximinecart2并校验 parity，不覆盖外部无关 drift。
3. **编译 Collect/Jackpot immutable landing**
   - source bindings 加入 exact `bg-addjk`；landing final candidate 纳入其 history 顺序，同时保持 bg-spin/bg-addbo
     既有语义。
   - `curFeature=collect` 总是生成专用 landing，按 output scene 第一轴收集 exact CL positions；用户样例
     `(0,0)=12` 直接保护 presence，另构造第一轴无 CL 保护 absence，Collect 不读取 `bg-gencoins` value。
   - `curFeature=jackpot + bg-addjk` 以 exact bg-spin构造 initial，以pos/final scene/otherScene构造 output；验证
     only-pos change、target CO与positive value。无addjk保持普通 landing；错误feature/component组合显式失败。
   - definitions/finalizer确保后续 wins、award、BO collection/transition只消费 special landing output。
4. **扩展 Feature barrier 与 Collect/Jackpot controller**
   - 允许 collect以及有addjk的jackpot请求完整 Feature barrier；jackpot无addjk仍走普通0.5s gate。
   - Collect按runtime config的0.12s逐格创建/挂载/Loop/stop/release scan Topick；扫描完成后无CL直接land，
     有CL则批量Topick Start/Loop与CL preview，再按目标列settle/End/cleanup。
   - Jackpot批量创建Topick与带final value的CO preview，落initial；目标列settle后End、replace final CO/value、
     preview cleanup、正式CO `appear -> normal`。保留Up/Wild/Coin/Bonus现有policy和layer order。
5. **接入 registry、测试、文档与收尾**
   - 注册两个 exact kind/version；next-spin/cancel/destroy统一终止scan、Feature、Topick、preview和active session。
   - 把用户两份样例压缩成真实 parser fixture；用可控Promise/host delay验证精确时序、value与cleanup，不使用
     wall-clock sleep。resource测试保护CL normal/appear、CO appear/image-value和Topick Loop能力，source boundary保护业务字面量只在app。
   - 更新 Minecart2 README，运行L2定向验收，生成UTC中文报告并分别记录自动化与浏览器结果。

## 8. 测试与验收

### 测试原则

- fixture必须经过 `createSlotGameLogicResult()` 真实 parser，不只手写编译后 operation；保留
  `historyComponents/mapComponents/scenes/otherScenes/pos/curFeature` 的协议 shape，删除随机数等无关字段。
- compiler覆盖 Collect第一轴 CL 有/无、其它轴 CL和任意CO不误触发、Jackpot addjk 有/无、feature mismatch、非唯一scene、
  空/重复/越界pos、non-target drift、target非CO、缺失/非法value；同时保护既有四种special landing顺序。
- controller使用可控 Feature/Topick/reel/appear Promise和 `context.delay()`；精确断言五个0.12s delay、扫描不重叠、
  第五格完成前zero land、全部Start后才land、目标列settle后才End/replace。
- shared pool测试证明每次checkout重新设置value且旧value不泄漏；cleanup覆盖scan Loop、Topick Start/End、reel
  settle、replace、appear失败和abort/destroy，断言每个owned对象释放一次、active session取消。
- 不为旧测试扭曲生产合同；发现任务前typecheck错误先最小化并记录，不顺手修无关package。

### 验收级别

`L2`：修改 RenderCore 跨 package public factory option，并同步给外部直接 consumer；需要验证 shared producer、
逐文件 parity 与 Minecart2 app。没有修改 schema、生成器、正式资源、lockfile或根工具链，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address-pool.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/round-compiler.test.ts tests/feature-bar-conveyor.test.ts tests/feature-symbol-transform.test.ts tests/feature-bar-resource.test.ts tests/round-adapter.test.ts tests/source-boundary.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git diff --check
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
```

另对报告列出的每个 shared 同步文件执行逐文件 byte parity；命令超过6条是因为L2同时需要shared producer测试/
typecheck、外部直接consumer测试/typecheck/build和两个独立worktree的diff检查，不扩到整仓命令。

### 人工验收

1. Collect 样例：完整 Feature 后第一轴从上到下每格只显示约120ms Loop，五格无重叠；随后第一轴 `(0,0)`
   的 exact CL 同时Start/Loop并显示CL preview，第一轴settle后End并无闪跳地露出正式CL。
2. 第一轴无CL或含多个CL的真实局：无目标时扫描后普通落停；多目标时全部使用CL preview且不显示ImgNumber，
   第三轴的 CO `2/20` 不触发Collect特效。
3. Jackpot无`bg-addjk`：保持普通0.5s feature gate，无Topick/CO preview/replacement。
4. Jackpot样例：完整Feature后`(4,2)`显示Topick与值`10`的CO preview；第4轴先落code8，End后无闪跳变成
   正式CO且仍显示10，播放`appear -> normal`，随后既有wins/award正常。
5. 横竖屏、连续Collect/Jackpot、低FPS、取消/刷新/退出重进：anchor/layer正确，无残影、旧value、重复对象、
   旧round提交或无界池增长。
6. 注入资源/value/动画失败：回合显式失败，未完成reel取消，Topick/CL/CO均清理，不进入后续win/award。

### 独立验收建议

`必须`：涉及跨包public contract、池化对象每次checkout状态、服务器scene/value与逐列partial commit。独立复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address-pool.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/round-compiler.test.ts tests/feature-symbol-transform.test.ts tests/feature-bar-resource.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
```

## 9. 环境与依赖

- 两仓使用Node 24与pnpm；shell没有Node时先 `source /Users/zerro/.nvm/nvm.sh` 后运行 `nvm use 24`。
- 依赖缺失时在对应仓运行 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置约定代理重试。
- 不新增依赖，不修改package.json/lockfile，不切换npm/yarn，不引入timer、pool或动画状态机库。

## 10. 生成物、文档与规则

- 本任务不修改YAML、delivery manifest/chunk/assets map、Symbols/ImgNumber manifest或其它生成物，不运行资源
  generator，也不手改content-addressed文件。
- 更新主仓 RenderCore README/runtime address文档和最小shared/scene-layout规则，记录symbol factory
  `presentationValue` 的kind、pool reset与strict failure；不写入CO、Topick或Minecart2业务。
- 更新外部 Minecart2 README，记录Collect扫描/第一轴规则、Jackpot bg-addjk scene/pos/value来源和partial
  commit/cleanup；不复制resource hash或symbol code表。
- 收尾重核两仓status，保留用户执行期间产生的无关修改，不清理、不顺手格式化。

## 11. 执行报告

规划时不生成报告。执行完成后在slotclientengine创建：

```text
tasks/253-minecart2-bg-bar-collect-jackpot-landing-<utctime>.md
```

报告简要记录两仓实际基线、shared factory最终合同与同步parity、Collect/Jackpot operation和时序、实际修改文件、
自动化/浏览器结果、typecheck基线问题、计划偏差和剩余风险。

## 12. 风险、假设与待确认

### 风险

- Collect样例第一轴 `(0,0)=12` 是 exact CL；第三轴 code 11 是 CO，不能因其带 `2/20` value而误选为Collect目标。
- Jackpot CO preview和正式occurrence都带ImgNumber；pool checkout若未每次重设value会跨局泄漏，handoff顺序错误会出现
  双数字/闪跳，只能由shared单测加真实浏览器共同证明。Collect CL 不带 ImgNumber。
- 低FPS下120ms扫描、Topick尺寸/遮罩/layer和CL preview到正式occurrence的视觉连续性不能由单测替代。
- Jackpot目标列发生partial replacement；后续列失败时不能倒放已提交CO，必须fail-stop并清理剩余临时对象。
- `bg-gencoins`当前是step级value矩阵，不是`bg-addjk`自己的otherScene；compiler必须按final CO坐标投影，不能
  把non-CO auxiliary值解释为ImgNumber。

### 假设

- Jackpot 业务始终按 active game config 的 exact `CO` 查询，不存在逻辑 `CN` 图标或别名。
- Collect“第一轴”是column-major `x=0`，“最上面”是`y=0`；扫描到`y=4`后才进入CL Topick阶段。
- Collect CL preview不带presentation value并在End后移除，不替换已落停的同code CL。
- Jackpot无`bg-addjk`的“不需要特殊处理”沿用普通feature 0.5秒gate，而不是等待完整Feature后增加空操作。

### 待确认

无；用户已更正Collect exact symbol为CL，样例 `(0,0)=12` 是presence基线，absence路径由严格按game config
构造的parser fixture验收，不需要猜测或修改坐标边界。

## 13. 完成清单

- [ ] Collect/Jackpot目标和无目标/缺component路径均已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] symbol factory value、component/scene/pos/CL/CO、immutable output与operation顺序符合计划。
- [ ] scan/Topick/CL/CO pool、partial commit、abort和destroy生命周期正确。
- [ ] Up/Wild/Coin/Bonus、其它feature、win/award/BO/mode transition回归受保护。
- [ ] shared已按主仓先行、定向验证、逐文件同步和parity完成。
- [ ] 指定自动化验收通过或基线阻断已最小化，真实浏览器结果单独记录。
- [ ] README/领域规则按需同步，UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根`AGENTS.md`、本计划列出的四份领域规则、本计划与任务250/252最终合同；
2. 核对两仓Git基线、当前delivery exact资源和shared parity；
3. 按“slotclientengine symbol factory value -> shared定向验证/同步 -> app compiler -> barrier/controller ->
   registry/tests”的顺序实现，不绕过canonical SymbolHandle/value controller；
4. 小幅文件名/API适配在报告记录；pool算法、logiccore/schema/assets/lockfile或明显范围扩张先停止说明；
5. 只运行本计划规定的L2验收，失败先最小化，不扩到整仓；
6. 完成后生成UTC中文报告，明确自动化、人工验收、typecheck基线和剩余风险；
7. 除非用户明确要求，不commit、不push、不创建PR。
