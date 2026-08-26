# 254 minecart2-reel-anticipation-effects 任务计划

## 1. 目标与完成定义

### 目标

在 `/Users/zerro/gitee.com/piximinecart2` 的 Minecart2 主转轮中加入与玩法表现可并发的期待效果：第一轴落停并显示
exact `CL` 后，对后四轴降速、按 240ms 间隔播放 pooled `reel_nearwin2#Loop`、放慢逐轴落停并推进/抖动主场景；
已落停列累计出现至少两个 exact `SC` 时，对当时尚未落停的列执行同类但更强的相机效果。

为满足仍在 continuous spin 中动态降速和安全主场景相机变换，先在 slotclientengine 的 RenderCore 增加玩法无关的
逐轴滚动速度调整与 owner-scoped Scene Layout camera-effect contract，定向验证后只同步实际 shared 文件到
piximinecart2，再接入游戏业务控制器。

### 完成定义

- [ ] 第一轴 `land()` resolve 且该列实际 landing target 含至少一个 exact `CL` 时才进入普通期待；此前不提前显示
      nearwin、不推进相机，也不依据未来列提前暴露结果。
- [ ] 普通期待把其余四个 pending reel 从下一 runtime update 起降到配置速度；每轴各 checkout 一个
      `gamelayout:/resource/spine/reel_nearwin2` pooled object，按 `x=1 -> 4`、相邻精确 240ms 挂载并循环 exact
      `Loop`，不得共享 mutable player。
- [ ] 每个 nearwin effect 至少经过配置的可见转动阶段；对应 reel 的 landing Promise resolve 时，在启动该列玩法
      post-land 表现的同一边界 stop/remove/destroy，归还 pool，不残留到 stopped 画面。
- [ ] 期待后的 pending reels 使用独立于普通 `stopDelayMs=120` 的较慢 stop cadence、settle duration 和速度；逐列
      落停清晰可见，未触发 round 完全保持当前普通节奏。
- [ ] 每次列落停后累计该列及此前已落停列中的 exact `SC`；累计首次达到 2 且仍有 pending reel 时进入强期待。
      强期待只覆盖当时未落停列，相机 zoom 必须大于普通期待、shake amplitude 必须更大。
- [ ] 同一 round 先由 CL 进入普通期待、后又达到两个 SC 时，只升级现有 camera session并继续复用各 pending reel
      的唯一 nearwin对象；不得重复挂载、重复减速或创建第二套停止流程。首列同时满足两条件时强期待优先。
- [ ] 期待 controller 与 Up/Wild/Coin/Bonus/Collect/Jackpot 的 Topick、preview、replacement、Feature barrier 等玩法
      controller并发：玩法不等待整个期待效果结束，期待也不等待玩法 post-land 动画结束；operation 只在全部物理
      landing、必要玩法工作和结构化 cleanup 都收敛后完成。
- [ ] next-spin、request failure、AbortSignal、动画/资源/land失败、mode transition和destroy均取消未完成reel，释放
      nearwin与camera lease；旧异步回调不能停止或重置下一 round/其它camera lease。
- [ ] 用户刚更新的 delivery 保持为权威输入：程序键 `reel_nearwin2`、Spine 4.3资源闭包和 exact `Loop` 由正式
      manifest/bytes决定；app不新增资源表、路径猜测、动画alias或fallback。
- [ ] shared先在slotclientengine实现并验证，再逐文件同步到piximinecart2；LogicCore、server协议、公开轮带、
      game003v2 app、依赖和lockfile不变。自动化与真实浏览器验收完成后生成UTC中文报告。

## 2. 范围

### 包含

- RenderCore standard ReelSpin pending continuous reel 的 strict即时速度调整；session只向仍pending的
  `SpinningReel` 暴露原子能力。
- Scene Layout package runtime 的多session、owner-scoped主场景zoom/shake/push/release能力；与viewport reapply、
  mode、popup、transition及destroy的组合边界。
- Minecart2 landing target中的CL首列规则、已落停SC累计规则、普通/强期待等级和无剩余列规则。
- 240ms nearwin启动波次、pool checkout、per-reel overlay、物理落停/玩法post-land并发编排、取消与fail-stop。
- ordinary landing和六类feature landing对同一个期待controller的复用；versioned runtime config、测试、README、
  shared文档/规则、双仓parity和执行报告。
- 对用户现有Minecart2 delivery更新做只读闭包与deterministic `--check`验证，不把它当成Codex新生成的资产改动。

### 不包含

- 不修改中奖计算、CL/SC服务器语义、component/result/otherScene compiler、SlotOperationPlanV2或LogicCore。
- 不在收到server scene前预测期待，不读取/推断服务器真实轮带，不使用server randomNumbers驱动视觉随机。
- 不新增第三种期待symbol、声音、变色、压暗、symbol animation、UI或Feature Bar玩法。
- 不改变已落停列，不给最后一轴达到两个SC的情况制造无目标camera/effect；无pending reel时不进入期待。
- 不把camera缩放/抖动写入Layout manifest，不改art/focus/reel placement，不让popup、transition/video overlay随主场景抖动。
- 不直接操作app私有Pixi display tree，不复制RenderReel、Spine player、pool、viewport或camera update状态机。
- 不修改 `apps/game003v2`；它只作为来源基线。除shared真实缺口外，不同步整个package或覆盖piximinecart2 drift。
- 不新增依赖，不修改package.json、pnpm lock/workspace、根工具链或正式server配置。

## 3. 制定计划时的基线

```text
UTC: 2026-08-26T10:26:56Z
slotclientengine HEAD: 552552d984e999d55274018f20a4f7772f414537
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean

piximinecart2 HEAD: 11f6f70295cc6294ee3a56045ee7e541098216d0
piximinecart2 branch: rgs
piximinecart2 git status --short --untracked-files=all:
 D assets/minecart2/chunks/initial-ac1b5c09.760e249b027ba25b6d2d4fbd75980de95b4143f79d39c40bd3844c0b844d5570.zip
 M assets/minecart2/delivery.manifest.json
?? assets/minecart2/chunks/initial-ac1b5c09.a089a6c50264cbf97560cbbffb92da0f2e495d33fde6c5f72d71cd02dbe2905b.zip
```

- 已读取两仓根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{game003,shared-game-runtime,loading-ui,scene-layout}.md`；目标源码目录没有补充规则。
- 上述piximinecart2 assets变更是用户本轮更新，执行时必须保留，不能恢复旧chunk、重新生成或顺手提交。新initial
  chunk的canonical `layout.manifest.json.runtimeResources.reel_nearwin2` 为 official Spine，引用
  `reel_nearwin2.json + specialfeature.atlas + SpecialFeature.png -> specialfeature.png`；skeleton只公开大小写精确
  `Loop`。delivery manifest把skeleton metadata和共享atlas/texture闭包归initial。
- `/Users/zerro/Downloads/minecart2/layout31.zip` 的程序资源声明与当前delivery相同，且时间上是当前最新Layout ZIP；
  执行时必须先用deterministic `--check`证明它确为本次delivery输入。若用户又更新输入，以当时最新明确源ZIP重核，
  不用旧路径失败来改写delivery。
- `apps/minecart2/src/round-adapter.ts#land()` 当前以120ms错峰发起全部五列`SpinningReel.land()`，再
  `Promise.all()`；当第一列实际resolve时，后续列已进入settle，现有结构无法按已落停CL/SC调整remaining continuous reels。
- `feature-symbol-transform.ts#landColumns()`复制了同类逐列landing scheduling，并在target列settle后执行Topick End、
  replacement或appear。期待若只接普通landing会漏掉Up/Wild/Coin/Bonus/Collect/Jackpot。
- RenderCore当前`ReelRollStartOptions`只在start时设置`speedSymbolsPerSecond`；`ActiveContinuousSpin`持有readonly speed，
  `SpinningReel`没有pending期间retime能力。`land()`已有per-call `durationMs/minimumSpinCycles/speedSymbolsPerSecond`，
  因此只缺continuous阶段动态降速，不需要新reel plan。
- `SpinningReel.overlay`已提供per-reel安全`ReelRender.add/remove`；canonical runtime resource factory已提供
  `create({pooled:true})`、checkout reset、stale handle和runtime destroy合同，nearwin不需要新pool算法。
- `SceneLayoutPackageRuntime.container`当前直接组合layout、popup、transition/video roots，没有主场景camera effect façade；
  app直接缩放container会同时影响popup/transition，并绕过viewport与并发ownership，不能作为正式方案。
- 当前runtime config v2的普通reel参数为`speedSymbolsPerSecond=44`、`baseDurationMs=1300`、`stopDelayMs=120`；
  期待数值尚无权威配置。用户给出的近似间隔按exact 240ms落入新版app config，普通/强zoom、shake、慢速和stop参数
  在真实浏览器定标后固定到同一versioned config并由关系校验保护，不散落在controller/tests。
- 当前shared reel/session源码在两仓对应文件byte parity；LogicCore和现有operation finalizer已足以提供immutable landing
  scene，本任务没有LogicCore缺口，也不审计完整Git历史。

## 4. 需求解释与技术决策

### 需求解释

1. “第一轴停下来出现CL以后”解释为column-major `x=0` 的物理landing Promise已resolve，且该次传给reel的exact
   target column含active game config解析出的CL code；不是看到最终operation output中未来replacement后的CL。
2. “停下来的轴上有2个SC”解释为从左到右已经resolve的所有landing target列累计SC数量达到至少2；两个SC可在
   同列或不同列。SC code同样从active game config exact `SC`解析，不硬编码数字。
3. controller可从immutable landing target预先算出最早可能触发列，只用于保证其右侧列仍保持continuous；真实视觉、
   降速、camera和effect仍只在该触发列land resolve后提交。若阈值只在最后一列达到，走原普通节奏且无空期待。
4. CL普通期待与SC强期待是同一round状态机的单调等级`none -> normal -> strong`；strong不会降回normal。首列同时含
   CL且累计SC达到2时直接strong；normal期间后续land使SC达2时原地升级camera和remaining参数。
5. nearwin启动波次与reel stopping是两个受同一AbortSignal管理的并发任务：所有remaining实例先完整checkout，随后
   按240ms挂载Loop；每列只有在自己的effect已挂载并达到minimum-visible gate后才允许land。
6. 进入期待后的物理reel按列慢落，但该列land resolve后立刻启动玩法post-land promise，controller继续调度下一列，
   不await上一列Topick End/replacement/appear才停下一轴；最终只在结构化`Promise.all`收敛全部工作。
7. “主摄像机推进/抖动”只作用layout+reel主场景，围绕逻辑viewport中心推进；popup、transition和video保持viewport-space
   稳定。普通与强数值由app config传入，shared runtime不认识CL/SC或期待等级。

### 关键决策

1. **给pending ReelSpin增加原子滚动速度setter，不扩展plan。**
   - `ReelSpin.setContinuousSpeed(x, speedSymbolsPerSecond)`由RenderReel唯一motion owner验证并更新；
     `SpinningReel.setRollingSpeed(speedSymbolsPerSecond)`只在active session且该列仍pending/continuous时转发。
   - 非finite/非positive、stale、已settling/stopped、cancelled或destroy均显式失败；下一次tick完整使用新速度，随后
     settle的initial slope读取最新速度，phase、公开轮带、target和pool identity不变。
2. **Scene Layout runtime提供可组合camera session，而不是app缩放raw Container。**
   - package root新增只包裹layout主场景的camera root；popup/transition/video仍为兄弟层。
   - `startSceneCameraEffect()`返回owner session，使用runtime host clock执行push、deterministic shake和release；session可
     `setTarget()`升级强度、`finish()`缓动释放、`cancel()`立即释放。多个session确定性组合，结束一个不得重置其它session。
   - applyViewport/variant变更重建baseline center但保留active session；abort、supersede、mode/destroy必须收敛promise和root
     transform，不创建RAF/setTimeout/随机源。
3. **期待属于Minecart2 app controller，shared不识别业务symbol。**
   - 新`reel-anticipation.ts`接收exact CL/SC code、实际landing columns、session、camera/options与`landColumn`回调；
     负责等级、effect、速度、stop scheduling和cleanup，不生成operation或复制RenderReel。
   - ordinary和feature landing都调用同一controller；feature模块只提供每列land target和独立post-land callback。
4. **保持未触发路径字节级行为语义。**
   - immutable scene不可能留下pending目标时直接复用现有120ms stagger+Promise.all；不为了侦测SC把所有round改成串行。
   - 可能触发时仅把最早触发列右侧保留为continuous；触发前列仍按普通cadence发起land，触发列resolve后才切换期待。
5. **失败采用partial-commit fail-stop和identity-safe cleanup。**
   - 已落停/已完成玩法mutation不倒放；取消remaining reel，stop/remove/destroy全部owned effect，结束本session camera lease，
     reject当前operation且不进入后续win/award。late callback检查round/session identity，不能清理下一round。

## 5. 职责与合同

- **LogicCore/BridgeCore**：继续拥有通用server解析、immutable snapshot/finalizer；不认识CL、SC、nearwin、camera或期待，
  预计不修改。
- **RenderCore reel**：拥有continuous speed、settle motion、reel overlay和session stale边界；只接受positive speed与原子动作，
  不接受symbol predicate、scene matrix或anticipation plan。
- **RenderCore Scene Layout**：拥有main-scene camera root、host-clock push/shake、viewport rebase、多lease组合与destroy；
  不认识游戏等级和数值来源。
- **Minecart2 controller**：拥有CL/SC业务判断、等级升级、240ms effect schedule、慢速/stop/camera数值和玩法并发组合；
  code来自active game config，resource/animation来自exact canonical factory。
- **资源生命周期**：package runtime拥有factory pool；本round拥有checkout句柄和camera lease。批量checkout失败释放已成功项；
  effect挂载后由对应pending reel拥有显示期，land resolve或任意失败时exactly-once remove/destroy。
- **数据/API**：runtime config升级为v3并严格解析anticipation normal/strong参数与相对关系；不新增Layout/Symbol/operation schema。
- **禁止行为**：不使用raw Container、manual ticker、setTimeout、Math.random、hardcoded code/path/hash、首项resource fallback、
  静默animation alias、第二份pool或fire-and-forget rejection。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/tests/scene-layout/scene-camera-effect.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/reel-anticipation.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/reel-anticipation.test.ts
tasks/254-minecart2-reel-anticipation-effects-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/reel/{reel-spin,render-reel,render-reel-set,spin-session}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/tests/reel/{render-reel,render-reel-spin}.test.ts
packages/rendercore/README.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md

/Users/zerro/gitee.com/piximinecart2/packages/rendercore/**（只同步上述实际shared源码/测试/README）
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/{config,round-adapter,feature-symbol-transform}.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/{round-adapter,feature-symbol-transform,feature-bar-resource,source-boundary}.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
```

若camera测试能清晰放入既有`package-runtime.test.ts`，可不新增独立测试文件；若ordinary/feature landing共享callback
类型需要一个app内部小型types helper，可新增并在报告记录。用户现有assets三项只保留和验证，不作为执行时预计修改。

### 原则上不应修改

```text
packages/{logiccore,bridgecore,gameframeworks,uiframeworks}/**
apps/game003v2/**
assets/**
/Users/zerro/gitee.com/piximinecart2/packages/{logiccore,bridgecore,gameframeworks,uiframeworks}/**
/Users/zerro/gitee.com/piximinecart2/assets/minecart2/**（保留用户当前更新）
AGENTS.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

若需修改LogicCore/operation schema、Layout/Symbol manifest、camera影响Popup层、pool算法、资产bytes或依赖，属于明显扩围，
必须先说明真实缺口，不能改计划来事后合理化。

## 7. 实施步骤

1. **重核双仓基线、资源与parity**
   - 重读本计划/规则，核对两仓HEAD/status和用户assets未被覆盖；从current initial chunk验证程序键、Spine版本、
     `Loop`及共享atlas/texture closure。
   - 确认Layout源ZIP后对delivery运行deterministic `--check`；重核计划列出的shared文件当前parity和app landing入口。
2. **在slotclientengine实现pending reel速度合同**
   - 在RenderReel唯一continuous owner增加strict speed mutation，接到ReelSpin和SpinningReel；保持currentY连续、
     local公开轮带不变，settle使用最新speed。
   - 测试正常retime、多次retime、下一tick位移、settle连续斜率、stale/phase/invalid/cancel/destroy失败；不新增plan。
3. **在slotclientengine实现Scene Layout camera session**
   - 在package runtime引入只包裹layout的camera root和public owner session；用runtime update推进push、shake、target升级、
     release，并对多session组合和viewport reapply建立明确算法。
   - 测试普通/强target、多个lease独立结束、popup/transition root不动、resize/reapply、abort/finish/cancel/destroy与Promise
     收敛；更新RenderCore README和最小shared/scene-layout规则。
4. **验证并同步shared文件**
   - 运行RenderCore定向测试/typecheck；只把报告中实际改动的shared源码、测试和README逐文件同步到piximinecart2，
     每个文件做byte parity，不覆盖外部独有app/assets修改。
5. **实现Minecart2期待controller与配置**
   - runtime config升v3，新增exact 240ms effect step、minimum-visible、normal/strong rolling/settle/stop/camera参数；parser
     校验finite/positive及strong zoom/shake严格大于normal。
   - controller从active game config取得CL/SC code，计算最早有效trigger列；无剩余/无trigger走原fast path。
   - trigger后批量checkout pooled effect、设置pending speed、启动camera和240ms wave；逐列land resolve边界回池，SC达到
     阈值时升级强camera，最终并发finish camera并收敛cleanup。
6. **接入ordinary与feature landing并保护并发**
   - `round-adapter.land()`把物理land callback交给controller；`feature-symbol-transform.landColumns()`复用同一入口，
     把Topick End/replacement/appear作为per-column post-land job交回，不复制期待状态机。
   - coordinator cleanup、cancelSpinPresentation、next-spin、feature failure和destroy统一取消active anticipation；确认玩法job与
     下一列stop并发、但operation结尾结构化等待两者。
7. **测试、文档、人工验收与收尾**
   - 用可控runtime update、delay deferred、fake reels/factory/camera验证时间线，不用wall-clock sleep；resource测试读取当前
     delivery并保护exact程序键/Loop/closure。
   - 更新Minecart2 README，运行L2验收和真实浏览器横竖屏/低FPS检查；生成UTC中文报告并分开记录自动化、人工结果、
     最终调参值、shared parity、用户assets状态和计划偏差。

## 8. 测试与验收

### 测试原则

- shared reel测试只用包内最小公开轮带/registry；camera测试用最小Scene Layout fixture，不读取Minecart2美术。
- app controller测试使用可控delay、land deferred和camera/effect fake，精确断言`land resolve -> trigger`、四次240ms wave、
  per-reel remove边界、slow cadence、post-land与下一stop并发，不依赖真实毫秒sleep。
- 覆盖CL presence/absence/多个CL、SC同列/跨列/只在最后列、CL后SC升级、首列直接strong、未知CL/SC、无pending列。
- 覆盖普通landing及至少一条有replacement/appear的feature landing；再用existing feature回归保护六类玩法。
- cleanup覆盖batch checkout、Loop start、delay、land、post-land、camera push/release各阶段failure/abort/destroy，断言每个
  pooled handle一次回收、remaining reel一次cancel、late callback不触碰新session。
- resource测试从current delivery parser读取程序键和exact `Loop`，不把physical hash/filename复制成业务合同。

### 验收级别

`L2`：修改RenderCore跨package ReelSpin/Scene Layout public contract并同步外部直接consumer，同时用户更新了正式delivery
输入，需要shared producer、parity、Minecart2 app/build和delivery checker。未修改根工具链/lockfile，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel.test.ts tests/reel/render-reel-spin.test.ts tests/scene-layout/scene-camera-effect.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter gamelayoutpkgcli start -- --input /Users/zerro/Downloads/minecart2/layout31.zip --delivery-dir /Users/zerro/gitee.com/piximinecart2/assets/minecart2 --quality 80 --check
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/reel-anticipation.test.ts tests/round-adapter.test.ts tests/feature-symbol-transform.test.ts tests/feature-bar-resource.test.ts tests/source-boundary.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git diff --check
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
```

执行前若用户已用更新的Layout ZIP替换`layout31.zip`，第三条只把`--input`切到经manifest核对的当前源并在报告记录，
不得用旧源检查失败去重写delivery。命令超过6条是因为L2同时覆盖shared producer、正式delivery、外部consumer及两个独立
worktree的diff，不扩到整仓命令。另对报告中的每个shared同步文件执行逐文件byte parity。

### 人工验收

1. CL普通期待：第一轴正常落停并清楚显示CL后，后四轴明显降速；nearwin按约0/240/480/720ms出现，各轴停下的
   同帧消失，转动过程和慢停节奏清晰，camera适度推进和轻抖。
2. SC强期待：两个SC可同列或跨已落停列；达到第二个时仅remaining轴出现/保留nearwin，camera比CL路径更近、抖动更明显；
   最后一轴才达2个SC时不闪现空效果。
3. CL后SC升级：不重复nearwin、不重启已存在Loop，剩余轴继续慢停，camera平滑升级且最终回到准确baseline。
4. Up/Wild/Coin/Bonus/Collect/Jackpot各抽查一局：Feature/Topick/preview/replacement/appear与期待同时推进，无互相await造成的
   空窗、死锁或提前停轴；随后wins/award/mode transition顺序正常。
5. 横竖屏切换、低FPS/长帧、连续spin、快速取消/刷新/退出重进：effect仍贴各reel，camera中心稳定，不抖Popup/transition，
   无残影、旧lease、unhandled rejection或无界pool增长。
6. 注入resource/Loop/land/camera failure：当前round显式失败并清理，已落停列不倒放，下一spin可正常开始。

### 独立验收建议

`必须`：涉及跨包public contract、continuous motion mutation、多个异步owner、camera transform和池化对象逐列回收。独立复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel-spin.test.ts tests/scene-layout/scene-camera-effect.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/reel-anticipation.test.ts tests/feature-symbol-transform.test.ts tests/feature-bar-resource.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
```

## 9. 环境与依赖

- 两仓使用Node 24与pnpm；shell没有Node时先`source /Users/zerro/.nvm/nvm.sh`，再`nvm use 24`。
- 依赖缺失时在对应仓运行`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置约定代理重试。
- gamelayoutpkgcli `--check`复用当前quality 80和本机既有cwebp；不安装新工具，不切换npm/yarn。
- 不新增依赖或修改lockfile；camera shake使用宿主clock的确定性函数，不引入timer/random/tween库。

## 10. 生成物、文档与规则

- 用户已通过Editor/CLI更新Minecart2 delivery；本任务不手改`delivery.manifest.json`或content-addressed chunk，只运行
  `--check`与消费测试。若checker不一致，先确认源ZIP/参数和用户是否再次更新，不自动覆盖。
- 不修改YAML或生成TypeScript；若执行时出现配置生成物，必须回到正式generator并运行对应`--check`。
- 更新RenderCore README与`shared-game-runtime/scene-layout`最小规则，记录continuous speed和owner-scoped camera的通用
  lifecycle/并发边界，不写CL/SC、240ms或Minecart2数值。
- 更新Minecart2 README记录业务trigger、等级、资源程序键、玩法并发、取消与人工调参结果；不复制hash或symbol code表。
- 不更新根AGENTS；精确资源、动画和时序继续由delivery/runtime config/tests拥有。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/254-minecart2-reel-anticipation-effects-<utctime>.md
```

报告简要记录双仓最终基线、shared API和同步parity、普通/强最终配置、实际修改文件、delivery `--check`输入/result、
自动化/浏览器结果、用户assets保留状态、计划偏差与剩余风险。

## 12. 风险、假设与待确认

### 风险

- 现有120ms stagger会在第一列resolve前让其余列进入settle；若未按trigger barrier重构，就无法实现“出现CL以后才降速”。
- nearwin effect共享SpecialFeature atlas/texture；factory pool必须共享immutable resource但隔离每个player的mutable playback，
  否则四轴Loop会串playhead或destroy彼此。
- camera root层级放错会抖动Popup/transition，viewport reapply若覆盖active transform会跳变；单测和真实横竖屏都必需。
- 期待stop scheduling与feature post-land若使用同一串行await，会把Topick/replace错误地变成下一轴停止barrier；若完全
  fire-and-forget则会泄漏rejection。必须使用分离jobs加结构化收敛。
- settle duration、rolling speed、minimum-visible、zoom和shake是视觉参数；自动测试只能证明关系/时序，最终值必须由真实
  浏览器确认并固定在v3 config/report。
- 当前delivery为用户未提交修改，执行期间可能再次替换initial chunk；所有资源结论和`--check`必须以执行时manifest为准。

### 假设

- “CL图标”是active game config的exact `CL`；“SC图标”是exact `SC`，不存在别名或按美术文件名判断。
- “有2个SC”按所有已物理落停列累计数量解释，不要求两枚位于同一轴。
- 第一轴是`x=0`，后四轴是`x=1..4`；240ms指相邻remaining reel nearwin Loop启动间隔。
- 普通/强差异至少由camera zoom和shake严格关系表达；两者都复用同一个nearwin `Loop`资源。
- camera推进只作用main game scene而不作用Popup/transition/video，符合“主摄像机”而非全屏DOM/canvas缩放。

### 待确认

无；“适当/更明显”和“慢一些”的精确视觉值在执行时通过versioned config调参与浏览器验收落定，不需要新增业务选择。

## 13. 完成清单

- [ ] CL普通期待、SC强期待、升级和无pending路径符合计划。
- [ ] 未触发ordinary节奏与六类玩法、win/award/mode transition回归保持。
- [ ] shared API不含业务predicate/plan，LogicCore、schema、assets和依赖未扩围。
- [ ] continuous speed、camera多lease、pool、AbortSignal、partial commit和destroy生命周期正确。
- [ ] slotclientengine先行验证、piximinecart2逐文件同步和byte parity完成。
- [ ] 用户assets更新被保留，正式delivery `--check`与exact资源消费测试通过。
- [ ] 指定自动化验收通过或基线阻断已最小化；真实浏览器结果与最终调参单独记录。
- [ ] README/最小领域规则已同步，UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根规则、本计划和四份领域规则，先核对双仓status、current delivery/source ZIP与shared parity；
2. 按“slotclientengine ReelSpin speed -> Scene camera -> shared定向验证/同步 -> Minecart2 controller/config ->
   ordinary+feature接入”的顺序实现；
3. 保留用户现有assets变更，不恢复旧chunk、不手改delivery；用current源ZIP执行只读`--check`；
4. 让物理landing scheduling、nearwin wave、camera和玩法post-land成为同一AbortSignal下的独立jobs并结构化收敛；
5. 小幅文件名/API适配在报告记录；LogicCore/schema/pool算法/assets/lockfile或明显职责扩张先停止说明；
6. 只运行本计划L2命令，失败先最小化，不扩到整仓；真实浏览器验收不能由fake或编译替代；
7. 完成后生成UTC中文报告，明确最终视觉数值、自动化、人工结果、parity、assets状态与剩余风险；
8. 除非用户明确要求，不commit、不push、不创建PR。
