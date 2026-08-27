# 257 minecart2-bg-bar-coin-feature-collection 任务计划

## 1. 目标与完成定义

### 目标

在 `/Users/zerro/gitee.com/piximinecart2` 的 Minecart2 `bg-bar.curFeature=coin` 回合中，补全 exact
`bg-coinwins2` 的中奖收集表现。现有任务 252 已完成 Searchlight、CO Topick 和逐列落停；本任务在该 landing 完整结束后、
普通 `bg-wins` symbol 中奖前，把最终盘面中的全部 exact CO 按确定顺序逐个收集到 5×5 转轮区下方的单一字体计数器，
并把完成收集的 CO cell 提交为 canonical `-1/-1` hole。

该流程没有 CL collector：盘面即使暂时仍出现 CL，也必须忽略并保留，不能把它当 target、source 或触发条件。任务 256
已有的 CO state、owned clone、motion、counter、粒子拖尾、mutation 和 cleanup 能力足够，本任务默认只扩展 Minecart2 app，
不修改 LogicCore/RenderCore。任务 256 当前金色粒子偏小、偏少，本任务同时调大并加密同一份 versioned trail config，且新旧
两种 CO collection 必须复用完全相同的效果和自然排空生命周期。

### 完成定义

- [ ] 只有同一 step 同时满足 `bg-bar.curFeature=coin` 和 exact `bg-coinwins2` 时才生成 collector-less collection；
      component 缺失时保持任务 252 的 coin landing、普通中奖和后续流程。
- [ ] 收集成员只来自 landing 后 immutable snapshot 中的全部 game config exact `CO`，沿现有 column-major scene scan
      顺序执行；不使用 CL、不硬编码 symbol code、不从资源名 CN 推断业务 symbol。
- [ ] 盘面存在 CL 时 collection 仍正常执行，但 CL 不播放状态、不作为目标、不进入计数、不变为 hole；若同轮还出现
      会争用相同 CO 的 exact `bg-coinwins`，在任何画面 mutation 前显式拒绝该歧义组合。
- [ ] 每枚 CO 必须有 `bg-gencoins` hydration 后的正 safe-integer presentation value；CO 数量与
      `bg-coinwins2.symbolNum`、value 合计与同单位的 `wins/basicComponentData.coinWin` 严格一致。
- [ ] `collectorNum` 和 `usedResults` 的业务语义当前没有仓库证据，本任务不读取、不猜测，也不据此寻找 target；
      `cashWin` 仍视为随下注换算金额，不与 raw CO presentation value 比较。
- [ ] landing resolve 后先在转轮底边中心下方创建一个 operation-owned 字体计数器；初始逻辑值为 0，但以空字符串呈现，
      页面不显示 `0`。
- [ ] CO 严格串行执行：borrowed occurrence 播放 `win` once；完成并回到 manifest default normal 后创建 normal owned
      clone，隐藏原 occurrence并飞向计数器 anchor；到达时 clone 播放 `end` once，同时计数器从旧累计值有界、单调、
      整数递增到旧值加该 CO value。
- [ ] 每枚 CO 的 `end` 与 count-up 均完成后才把对应 cell 原子提交为 hole并处理下一枚；clone随后销毁，不能留下
      normal 闪帧、残影、stale handle 或重复计数。
- [ ] 每枚飞行 clone 都挂接任务 256 的 exact `256-co-gold-particle-128` RenderCore trail；到达只停止发射，存量粒子
      自然排空，下一枚 CO 不等待上一条 drain，最终 operation 在 presentation scope 退出前统一等待 pending trails。
- [ ] 同一份 `coinCollection.trail` 默认调为明显偏强、便于浏览器往回校准的初始目标：`maxParticles=96`、`emissionRate=180`、
      `sizeMinPixels=28`、`sizeMaxPixels=64`，保持 `maxConcurrent=2` 和现有 0.32–0.55 秒寿命；浏览器通过后再按观感回调，
      并在执行报告记录最终值。任务 256 CL flow 与任务 257 collector-less flow 必须同时消费该唯一配置。
- [ ] 全部 CO 完成后立即移除并销毁计数器，collector-less operation resolve；此后才播放既有普通 symbol win 首轮，
      award、BO collection 与 mode transition 维持当前相对顺序。
- [ ] operation output 的所有 CO 坐标均为 scene/value `-1/-1`，CL 与其它 cell 完全不变；后续 `bg-wins` 从该 output
      编译和执行，下一次 targetless standard spin 能正常接管 holes。
- [ ] win/move/end/count-up/mutation、abort、next-spin cleanup 或 destroy 失败时恢复尚未提交 CO 的 visibility并销毁临时
      clone/counter；已提交的前序 hole 不倒放，operation fail-stop且普通 wins 不继续。
- [ ] 不改变任务 256 exact `bg-coinwins` 的 CL 状态序列、计数器、多 group/shared CO 与trail graceful drain合同；只把
      唯一trail配置调大、加密并复用于新流程，不新增第二份粒子配置、CL动画或美术资源。
- [ ] 定向自动测试、真实浏览器视觉验收和 UTC 中文执行报告完成；不新增依赖或 lockfile。

## 2. 范围

### 包含

- Minecart2 对 `bg-bar.curFeature=coin + bg-coinwins2` 的 app-owned strict 编译和 source evidence。
- 独立 collector-less CO collection state-mutation、post-collection snapshot closure 与 registry handler。
- 转轮底边中心下方的 geometry-derived anchor、单实例字体计数器、串行 CO state/clone/motion/trail/end/count-up/hole commit。
- 任务256与任务257共用的金色粒子尺寸、发射密度、fixed-capacity和自然排空配置调优。
- 任务 252 coin landing 到本任务 collection、再到任务 256/既有普通 wins 的顺序与互斥验证。
- synthetic parser-shape fixture 中 `bg-gencoins` CO values 和 `bg-coinwins2` totals 的完整合同。
- compiler、handler、adapter、source-boundary 测试，Minecart2 README 和执行报告。

### 不包含

- 不改变任务 252 的 Searchlight、Topick Start/Loop/End、逐列 settle 或 CO landing scene。
- 不改变任务 256 的 exact `bg-coinwins` CL 收集；`bg-coinwins2` 不 alias 或 fallback 到 `bg-coinwins`。
- 不收集 CL、BO 或普通 symbol，不删除盘面临时存在的 CL，不从 `usedResults` 或 component `pos` 猜 CO 顺序。
- 不把本次 raw CO 累计值重复接入普通 `bg-wins` carousel；最终 total award 继续使用现有 round total。
- 不新增粒子纹理、美术、Spine animation、Scene Layout node、runtime resource、YAML/delivery 生成物或资源 fallback；
  只复用exact `256-co-gold-particle-128`并调整现有有界参数。
- 不修改 feature bar queue、server 协议、真实轮带、请求/下注、BonusGame、Popup、普通 win formatter或下一 spin 策略。
- 不修改 `apps/game003v2`；实现只落在 external Minecart2 consumer。

## 3. 制定计划时的基线

```text
UTC: 2026-08-27T06:39:57Z
slotclientengine HEAD: d44b2c547902490f106349a790854e402e4db3f5
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean

piximinecart2 HEAD: 1be21c57830894421ef35d2ee909d840a965bbd4
piximinecart2 branch: rgs
piximinecart2 git status --short --untracked-files=all: clean
```

- 已读取两仓根 `AGENTS.md`、`tasks/templates/task-plan.md`、任务 252/256 计划与执行报告，以及主仓
  `docs/agent-rules/{game003,shared-game-runtime,loading-ui}.md`；目标 Minecart2 app 没有子目录 `AGENTS.md`。
- `round-compiler.ts#compileGame003v2Round()` 当前顺序为 landing → optional `game003:coin-collect`（仅
  `bg-coinwins` CL 流程）→ optional `game003:wins` → award → BO collection → transitions；普通 wins 已从
  collection output 编译，但 `bg-coinwins2` 尚未生成 post-landing state mutation。
- `compileCurrentFeatureLanding()` 在 `curFeature=coin` 时已经以 exact `bg-coinwins2` 作为 trigger，并从最终 landing
  scene 按 game config CO code 生成 column-major positions；任务 252 只用这些 positions 播放 landing Topick，output
  仍保留全部 CO。
- 当前 synthetic coin fixture 有四个 CO `(0,0..3)`、`bg-coinwins2.wins=36/symbolNum=4/collectorNum=0`，但没有
  `bg-gencoins` otherScene，且 basic `coinWin` 仍是默认 0；它只证明了任务 252 trigger，不足以证明本任务金额合同，
  执行时必须补成同单位、合计 36 的 parser-shape fixture并明确标注为 synthetic evidence。
- `coin-collection.ts#playCoinCollection()` 已实现任务 256 的 borrowed CO `win`、normal owned clone、opaque anchor motion、
  `end` 与 count-up并行、逐格 `replaceSymbols()` hole commit、visibility恢复和 presentation scope cleanup；新流程应抽取/复用
  app-local中性步骤，不能复制第二套 player/mutation lifecycle。
- 当前 CO manifest 的 `win` terminal once 在完成边界回 manifest default normal，`end` 为 terminal once；任务 256 已用
  `SymbolHandle.playState()`/`clone({state:"normal"})` 验证该路径，因此用户提出的“看是否需要改 engine”结论为：不需要。
- `ReelArea` 已提供 `getCellAnchor()`、`resolveAnchor()`、`getAnchor()` 和受管 top presentation layer。可由 bottom-row
  左右 cell中心、cell height与versioned offset构造转轮下方target；无需获取raw Container、Matrix或新增RenderCore API。
- 主仓与 piximinecart2 的 task 256 相关 `particle-trail-render-object.ts`、`symbol-handle.ts`、`symbol-area.ts` 当前逐文件
  parity；fixed-capacity pool、anchor follow、`stopEmissionAndDrain()`和hard cleanup已满足新流程，本任务不需要新增
  shared能力或同步shared package。
- 当前唯一trail配置原为每emitter 32粒子、42粒子/秒、8–18 px、0.32–0.55秒寿命、最多2条并发；首轮调至
  48粒子、72粒子/秒、16–36 px 后用户仍确认不明显，因此本轮将app parser预算提高到每emitter最多96粒子，仍保持最多2条并发和最长0.6秒寿命。
- 当前 delivery main reel 为 manifest-owned 5×5、cell `172×130`；精确数值只用于基线理解，运行时 target 必须由
  ReelArea geometry计算，不能复制这些数值。

## 4. 需求解释与技术决策

### 需求解释

1. “展示过程在图标中奖以前”解释为任务 252 的 `game003:coin-landing` 完整 resolve 后立即执行新的 collector-less
   state-mutation，并以其 Promise completion 作为 `game003:wins` 首轮启动 barrier。
2. “没有 CL；如果有 CL，忽略”解释为 selection 只判断 exact CO。CL occurrence继续留在 operation input/output，
   不做 state调用、visibility变化、计数或删除；这不是把 CL 当错误，也不是让 CL 参与 task 256 流程。
3. `bg-coinwins2` 没有可用 result position合同，因此 CO成员与顺序沿用任务 252 已确立的最终 scene scan；每格数值来自
   同一 landing snapshot 的 `bg-gencoins` presentation value。
4. “转轮区下方”解释为转轮 area-local bottom-center anchor：取底行最左/最右cell中心的X中点，Y为底行中心加半格高度，
   再加 runtime config 的向下offset。counter与所有clone使用同一opaque anchor，横竖屏随area placement解析。
5. “0不用显示”通过counter初始text `""`实现；逻辑累计仍从0开始。每枚CO到达后的`end`与count-up同时开始，二者都
   完成后才提交hole。
6. 新流程复用任务256同一条金色trail：emitter跟随normal clone，到达调用graceful end，已发射粒子自然排空；新旧流程
   共享一份config和并发backpressure，不能复制第二套参数或用hard destroy制造尾迹硬切。

### 关键决策

1. **新增 exact collector-less operation，不复用带 CL payload 的 kind。**
   - 新 kind（建议 `game003:coin-feature-collect`）仍为 v2 `state-mutation`，payload只保存有序
     `{position, amount}`、total和必要的target policy标识，output把全部payload CO变为hole。
   - 与 `game003:coin-collect` 分开可保持两个 strict payload、handler和失败信息，避免 optional collector 或 silent分支。
2. **复用 app-local CO presentation primitives，不扩展 shared DSL。**
   - 在现有 `coin-collection.ts` 内抽取一次 CO 的 win→normal clone→trail+move→end/count-up→commit步骤、counter创建、
     curve与pending drain管理；CL handler传collector anchor及collector-state policy，新handler传bottom-center anchor，
     两者使用同一trail policy。
   - RenderCore继续只拥有handle、anchor、motion、text、mutation和lifecycle，不出现Minecart2 component语义。
3. **编译时完整证明金额、成员和output。**
   - 仅在exact coin feature触发时读取`bg-coinwins2`，按snapshot扫描CO并读取positive value；验证non-empty、unique、
     `symbolNum`与`wins/coinWin`。`collectorNum/cashWin/usedResults`不参与未经证明的parity。
   - 同轮若还有exact `bg-coinwins`，两个component会争用CO，必须preflight fail，不能按代码顺序静默选择一个。
4. **counter target属于geometry/config，不属于Scene Layout新资源。**
   - 唯一新增定位配置是finite non-negative `targetOffsetDownPixels`；字体、count-up、flight path/easing和trail复用当前严格
     `coinCollection`配置，不复制style、timing、resource或particle参数表。
   - trail参数先调为96 max particles、180/s、28–64 px，寿命和最多2条并发保持不变；先提供明显偏强的浏览器基线，
     仍受96 hard cap约束，视觉通过后再从versioned config往回调。
   - 目标计算失败、anchor不可解析或配置非法时在隐藏任何CO前显式失败。
5. **逐枚提交、整operation fail-stop。**
   - 每枚完成后立即成为hole，前序成功不倒放；当前枚及尚未开始的CO在失败时保持/恢复可见，coordinator阻止普通wins。
   - operation最终output仍一次性描述全部holes，finalizer和后续consumer不依赖画面反推状态。

## 5. 职责与合同

- **LogicCore/BridgeCore**：继续提供component query、immutable snapshot、`genRemoveOperation()`和finalizer；不认识
  `bg-coinwins2`、CO/CL、字体位置或动画名，预计不修改。
- **Minecart2 compiler**：拥有feature/component匹配、CO scene scan/value totals、歧义component拒绝、operation顺序、
  collector-less payload及post-collection output。
- **Minecart2 handler**：拥有bottom-center target、CO exact states、串行顺序、count-up、trail并发barrier、逐枚commit与
  cleanup；不重新解析server component或扫描display tree。
- **RenderCore**：继续拥有borrowed/owned handle identity、opaque anchor、manual-clock motion、TextRenderObject、
  presentation scope和symbol mutation；无需新增public API。
- **资源生命周期**：CO occurrence是borrowed；clone、counter与trail是operation-owned。先成功mount clone/trail再隐藏source；
  到达后trail停发并自然drain，最多保留两条emitting/draining，容量满时await最早项；commit前失败恢复source，commit后handle
  允许stale且不倒放；scope在success/reject/abort/destroy均销毁临时对象，异常清理才允许hard destroy trail。
- **失败策略**：错误feature/component组合、两个collection component并存、无CO、非法value/count/total、overflow、非法output、
  缺state/anchor或异步失败均显式reject；不猜CL target、不跳过无value CO、不把0显示或累计。
- **禁止行为**：不硬编码code/geometry/physical path，不读取raw Pixi display tree，不新增ticker/wall-clock timer，不让
  presentation handler隐式生成业务output，不以placeholder/alias/fallback掩盖server或resource错误。

## 6. 文件范围

### 预计新增

```text
tasks/257-minecart2-bg-bar-coin-feature-collection-<utctime>.md
```

### 预计修改

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/config.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-compiler.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/coin-collection.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-adapter.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-compiler.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/coin-collection.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-adapter.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/source-boundary.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/fixtures/game003-gmi.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
```

若为保持handler职责清晰需要新增同app helper/test文件，可作为小幅文件适配在报告记录；不得复制
`SymbolHandle`、motion、counter或mutation runtime。

### 原则上不应修改

```text
packages/{logiccore,rendercore,gameframeworks,bridgecore}/**
/Users/zerro/gitee.com/piximinecart2/packages/**
apps/game003v2/**
/Users/zerro/gitee.com/piximinecart2/assets/**
assets/**
docs/agent-rules/**
AGENTS.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

执行时若发现真实 shared capability 缺口，必须先说明为何现有 opaque anchor/SymbolHandle/mutation API 不足；获准扩围后
先在 slotclientengine 对应 LogicCore/RenderCore package 实现并定向验证，再逐文件同步到 piximinecart2 并做 parity，
不能只改 external 副本。

## 7. 实施步骤

1. **确认双仓执行基线和协议fixture**
   - 重核两仓HEAD/status、本计划、任务252/256最终合同、CO manifest states与相关shared文件parity，保留用户无关修改。
   - 将synthetic coin fixture补齐`bg-gencoins` otherScene与匹配36的四个positive values，并把
     `bg-coinwins2.basicComponentData.coinWin`改为同单位36；不把它伪称真实服务器样例。
2. **编译collector-less state mutation**
   - 增加exact kind/definition/payload；在coin landing snapshot后检查feature/component组合及与`bg-coinwins`互斥。
   - 复用任务252的CO scan顺序，读取presentation values并严格校验non-empty、unique、safe sum、`symbolNum/wins/coinWin`；
     不读取CL、collectorNum、cashWin或usedResults。
   - 用`genRemoveOperation()`构造output，使全部CO为`-1/-1`且CL/其它cell不变；把普通wins、award、BO与transition继续
     串到新output，并由finalizer证明closure。
3. **抽取可复用的app-local单枚CO流程**
   - 保持任务256 public handler/payload不变，把counter创建、bounded count-up、normal clone motion、end与逐枚commit拆为
     strict内部helper；既有CL流程继续传collector state，两个流程共用trail创建、capacity backpressure和final drain，
     任务256的自然排空时序不得改变。
   - 新流程从ReelArea bottom row解析center/cellHeight，应用config offset得到target；创建一次空counter并与clone共用target。
4. **实现并注册`bg-coinwins2`收集handler**
   - preflight operation/payload/output、全部CO handles和target，再进入presentation scope；存在CL只作为无关盘面内容。
   - 按payload顺序await CO win，创建normal clone和同资源trail、隐藏source并move；到达后停止发射，并发执行
     `Promise.all(end, countUp)`，成功后commit hole、销毁clone，再处理下一枚，不等待上一条trail drain。
   - 最后一枚完成后unmount counter，await全部pending trails自然归零后resolve；catch/finally恢复未提交visibility、
     hard-clean异常trail及其它owned对象，保留已提交holes。
   - 在adapter registry注册exact kind/version，使landing→collection→normal wins形成真实Promise barrier。
5. **配置、测试与文档**
   - 在versioned runtime config增加并strict parse `targetOffsetDownPixels`；把唯一trail参数初始调到
     `96 particles / 180 per second / 28–64 px`，复用既有resource、lifetime和并发，不增加第二份trail表。
   - compiler测试覆盖trigger/absence、CL ignored、scan顺序、values/totals、component互斥、output closure和普通wins顺序；
     handler测试覆盖状态/计数/commit顺序、single counter、failure/abort/cleanup和任务256回归。
   - 更新README说明`bg-coinwins2` landing与collection两阶段、与`bg-coinwins`区别、CL ignore、value来源、hole及失败边界。
6. **定向验收与报告**
   - 运行L1 Minecart2定向测试/typecheck/build和两仓diff检查；不运行整仓L3或资源generator。
   - 完成真实浏览器横竖屏视觉验收，生成UTC中文报告；若用户接管浏览器验收，报告明确标为待完成。

## 8. 测试与验收

### 测试原则

- compiler fixture必须经真实parser入口，不直接构造最终operation；保留`bg-bar/bg-spin/bg-gencoins/bg-coinwins2`的
  history、mapComponents、scene与otherScene shape。
- 正常路径断言 operation kind严格为 landing → collector-less collection → ordinary wins；collection output只在全部CO
  坐标产生`-1/-1`，临时CL和其它symbol不变。
- handler使用可控`playState/move/delay/trail drain` Promise，不用wall-clock sleep；断言单一counter identity、初始空字符串、
  无0、单调有界整数step、每枚最终精确值及总和。
- 精确断言每枚 `win complete → normal clone → move → end+count-up → hole → next CO`；普通wins在counter销毁前不得开始。
- 复验两个流程都把同一config传给exact particle factory；arrival后停止新增粒子、drain不阻塞下一CO、capacity为2时等待最早
  drain、最终resolve前live归零，调大/加密参数仍通过parser hard budget。
- failure测试区分当前未提交CO的visibility恢复与前序已提交hole不倒放；abort/destroy后无clone/counter/trail/listener残留。
- 保留任务256 CL collection全部现有断言，尤其collector states、shared CO、particle natural drain和failure cleanup，防止抽取helper
  改变旧行为。

### 验收级别

`L1`：预计只修改 external Minecart2 app内部compiler、handler、config、测试和README，复用既有shared public API；不改
schema、资源、生成物、依赖或lockfile。若执行证明必须改变LogicCore/RenderCore public contract，则按用户要求升级`L2`，
先验收slotclientengine producer，再同步和验收external consumer。

### 执行会话必须运行

```bash
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/round-compiler.test.ts tests/coin-collection.test.ts tests/round-adapter.test.ts tests/source-boundary.test.ts tests/feature-symbol-transform.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
git diff --check
```

- direct typecheck若仍被任务256报告中的BridgeCore/device-detector既有NodeNext诊断阻断，最小化确认输出是否涉及本任务文件并
  在报告记录；不得用build通过冒充typecheck，也不顺手修无关基线。
- 若实际发生shared修改，追加对应主仓package的定向test/typecheck、external同步副本测试和逐文件parity；这是L2扩围证据，
  不因此运行整仓命令。

### 人工验收

1. `curFeature=coin`且同时无`bg-coinwins2/bg-coinwins`：任务252 Searchlight/landing后直接进入既有wins，无counter、
   飞行或holes。
2. 正常trigger：landing全部完成后，转轮底边中心下方不显示0；CO带明显且密度足够的金色trail逐个win、normal飞行、
   到达end并逐步累加，尾迹自然消散无硬切，最后counter消失，随后才播放普通symbols中奖。
3. 临时含CL：CL全程不变、不播放collect/win、不吸收CO；全部CO仍飞向底部counter并成为holes。
4. 横/竖屏及viewport切换：counter/flight target始终位于当前转轮底边中心下方，不按旧world坐标漂移，不被mask错误裁切。
5. 任务256 CL收集与任务257无CL收集都观察调大、加密后的同一trail；两条重叠drain和低FPS下无明显断带、过曝、掉帧或
   越界粒子，粒子尺寸/密度差异可见但不遮住CO数字和counter。
6. 连续spin、取消/刷新/退出：下一spin能从holes正常启动，无CO/数字/粒子残影、stale提交或owned对象增长。
7. value/state/anchor/mutation/trail故障注入：显式失败，未提交CO恢复，已提交hole不倒放，普通wins不启动。

### 独立验收建议

`建议`：不涉及跨包public contract，但涉及server component金额、异步逐格mutation、partial commit和下一spin hole接管。独立复验：

```bash
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/round-compiler.test.ts tests/coin-collection.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
```

## 9. 环境与依赖

- 使用仓库要求的Node 24和pnpm；shell没有Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时仅运行`CI=true pnpm install --frozen-lockfile`；下载失败后才按仓库约定设置代理重试。
- 本任务不新增依赖、不修改lockfile、不切换npm/yarn。

## 10. 生成物、文档与规则

- 本任务不修改YAML、Layout ZIP、delivery或生成TypeScript，因此不运行generator/checker；若执行发现必须改正式资源或schema，
  属于明显范围扩大，先停止说明。
- 更新Minecart2 README，不更新根`AGENTS.md`或领域规则：本任务是现有职责边界内的游戏业务接入，不形成新的跨任务不变量。
- 任务计划与执行报告留在主仓`tasks/`；不把精确offset、fixture数值或验收证据写入规则文件。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/257-minecart2-bg-bar-coin-feature-collection-<utctime>.md
```

UTC由`date -u +%y%m%d-%H%M%S`生成。报告简要记录最终行为、实际文件、计划偏差、验收命令结果、人工验收状态、
shared是否保持未修改以及剩余风险；不收集无关coverage、历史矩阵或整仓统计。

## 12. 风险、假设与待确认

### 风险

- 当前`bg-coinwins2` fixture的value来源不完整；计划以现有`bg-gencoins` hydration和组件字段命名建立strict同单位合同。
  若真实server payload证明`wins/coinWin`单位或CO成员来源不同，必须用真实fixture重新规划，不能放宽为silent fallback。
- bottom-center target虽可由ReelArea geometry稳定计算，但转轮外top layer的真实裁切、与HUD重叠和最合适offset只能由浏览器
  横竖屏验收确认；视觉调整仅改versioned offset，不改anchor ownership。
- 逐枚partial commit意味着中途失败会留下已完成holes；这是shared fail-stop合同，服务器重试/恢复策略不在本任务范围。

### 假设

- `bg-coinwins2.symbolNum`表示本轮全部CO数量，raw `wins`和basic `coinWin`与CO presentation values同单位；现有synthetic
  fixture的`36/4`支持该解释，但执行仍须以可用真实payload优先校正。
- 新流程与任务256复用同一金色粒子拖尾和唯一配置；浏览器首轮先采用96粒子cap、180/s、28–64 px，最终视觉值从该强基线
  往回调整并记录。
- `bg-coinwins2`与`bg-coinwins`正常不会同轮出现；出现时按歧义server数据显式失败。

### 待确认

无。字体样式、count-up节奏和flight曲线沿用任务256当前config，唯一新增的转轮下方offset在浏览器验收中调节。

## 13. 完成清单

- [ ] 目标和非目标已满足，任务252与256既有行为无回归。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] operation payload/output、server parity、职责和资源生命周期符合计划。
- [ ] CO/CL selection、状态顺序、counter、holes、普通wins barrier和下一spin均已验证。
- [ ] 指定自动化验收已通过，人工视觉验收状态已明确。
- [ ] 未修改shared package；若有必要扩围，已按producer→同步副本→consumer完成L2验收。
- [ ] README和UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根`AGENTS.md`、本计划列出的领域规则、本计划及任务252/256最终报告；
2. 核对两仓Git基线、工作区和相关shared文件parity；
3. 按计划实现，不重新引入CL target、usedResults位置或第二份trail配置；
4. 小幅适配当前实现时在报告记录，真实server合同冲突或shared/asset/schema扩围时先停止说明；
5. 只运行计划规定的L1定向验收；确有shared改动时按用户要求升级L2并先改slotclientengine再同步piximinecart2；
6. 完成后生成UTC中文执行报告；
7. 除非用户明确要求，不commit、不push、不创建PR。
