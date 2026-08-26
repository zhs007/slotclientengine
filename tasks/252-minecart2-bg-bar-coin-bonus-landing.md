# 252 minecart2-bg-bar-coin-bonus-landing 任务计划

## 1. 目标与完成定义

### 目标

在 `/Users/zerro/gitee.com/piximinecart2` 的 Minecart2 当前 `bg-bar` 流程中接入 `coin` 与
`bonus` 两种玩法的落停表现，并复用任务 250 已完成的池化 `Topick`、program symbol factory、stable
cell anchor 与逐列 landing 能力。

- `coin`：中央 `feature.json#Feature` 完整结束后，在转轴中心播放一次
  `searchlight.json#Start`；动画结束后，若本轮触发 exact `bg-coinwins2`，则在最终 landing scene
  的全部 CN/CO cell 播放 `Topick_Start -> Topick_Loop -> Topick_End`，随对应列落停结束并回池；未触发
  `bg-coinwins2` 时不创建 Topick，按现有逐列流程落停。
- `bonus`：只有本轮触发 exact `bg-addbo` 才进入特殊流程；转轮先落到 `bg-spin` scene，在
  `bg-addbo.pos` 指定的 cell 复用 wild 的 Topick + preview 流程，把最终 BO 提交到 `bg-addbo` scene；
  未触发 `bg-addbo` 时保持现有普通 landing。

### 完成定义

- [ ] `coin` 每轮都严格等待中央 `Feature` 完成后才播放一次中央 `searchlight#Start`；Searchlight 完成前
      不创建/播放 Topick，也不开始落停。
- [ ] `coin` 没有 `bg-coinwins2` 时，Searchlight 完成后不执行其它 coin 特效，仍按既有
      left-to-right cadence 落完整 scene。
- [ ] `coin` 有 `bg-coinwins2` 时，从本轮最终 `bg-spin|bg-addbo` scene 按 game config 的 exact `CO`
      symbol code 收集 CN 图标位置；用户样例得到 `(0,0)、(0,1)、(0,2)、(0,3)`，不从
      `usedResults` 复制位置，也不硬编码 code `11`。
- [ ] coin 的所有目标先完成 `Topick_Start` 并进入 `Topick_Loop`，之后才开始逐列落停；每个目标在其列
      真实 settle 后播放一次 `Topick_End` 并回池，不替换已经属于最终 scene 的 CO。
- [ ] `bonus` 没有 `bg-addbo` 时不创建 Topick/BO preview，不改变当前 0.5 秒普通 feature landing gate。
- [ ] `bonus` 有 `bg-addbo` 时只用 `bg-spin` 的唯一 scene 作为滚动落点、用 `bg-addbo` 的顶层 `pos`
      和唯一 scene 作为最终 output；用户样例 `(3,0)` 从 `L1` 变为 `BO`，不硬编码 code `6/26`。
- [ ] bonus 的目标先播放 Topick Start/Loop 并显示池化 normal BO preview；对应列 settle 到 bg-spin 后播放
      End，原子替换为正式 BO，移除 preview，正式 occurrence 播放 `appear` 后回到 `normal`。
- [ ] 最终 BO scene 继续供既有 `bg-wins`、award、BO collection 和可选 mode round trip 使用；coin 的
      `bg-wins`、`bg-coinwins2` 金额、CO ImgNumber、award 与其它后续 operation 顺序不回退。
- [ ] up/wild、normal、其它 feature、首次初始化、连续 spin、横竖屏、取消/失败/destroy 和现有资源
      ownership 保持；池化 Searchlight/Topick/BO 在成功和失败路径都无泄漏、无 stale continuation。
- [ ] 定向自动测试与真实浏览器视觉验收明确分开；执行结束生成 UTC 中文报告。

## 2. 范围

### 包含

- Minecart2 对 `bg-bar.curFeature` 的 app-owned coin/bonus landing 选择。
- `bg-coinwins2` trigger、最终 scene 中 CO 位置、`bg-addbo.pos/usedScenes` 的最小 strict 解析。
- 两个 exact scene-landing operation、Feature complete barrier、中央 Searchlight、池化 Topick/BO preview、
  per-column settle 与最终 BO mutation。
- 用户提供的 coin/bonus GMI 样例的精简 fixture，以及 compiler、handler、resource、cleanup 和回归测试。
- Minecart2 README、source boundary 和任务执行报告。

### 不包含

- 不实现 `collect/jackpot/scatter/nail/expand` 等其它玩法，不改变 `bg-bar.features` queue/初始化规则。
- 不把 `bg-coinwins2` 当作新的 win carousel；其金额仍由现有 total award 流程处理，本任务只用 exact trigger
  决定是否播放 CO cell Topick。
- 不从 `bg-coinwins2.usedResults`、result type 或 result symbol 反推目标位置；位置权威是最终 scene 中的
  game-config `CO`。
- 不修改服务器协议、protobuf、真实轮带、请求/下注、金额格式、BonusGame 内部玩法或 `cg-initbn` mode round trip。
- 不新增业务动画 DSL、Topick plan schema、raw Pixi/Spine/SymbolPlayer 访问、路径猜测、alias 或 fallback。
- 不修改 Scene Layout/Symbols manifest、delivery、production bytes、assets map、生成器、依赖或 lockfile。
- 不修改 `apps/game003v2`；该 app 当前暂停 feature bar，外部 Minecart2 才是本任务 consumer。
- 当前没有 LogicCore/RenderCore capability 缺口，默认不修改或同步 shared package；若执行时发现真实缺口，
  必须先在 slotclientengine 修复并定向验证，再逐文件同步到 piximinecart2，不能只改外部副本。

## 3. 制定计划时的基线

```text
UTC: 2026-08-26T09:00:54Z
slotclientengine HEAD: 1f55dee544486f6ad53e94f5bb62b7ec27184974
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean

piximinecart2 HEAD: 212c35185ac7a3bb59c3cd99e7cba61c0cc8e9e1
piximinecart2 branch: rgs
piximinecart2 git status --short --untracked-files=all: clean
```

- 已读取两仓根 `AGENTS.md`、`tasks/templates/task-plan.md`、任务 239/247/250 计划与相关执行报告、
  `docs/agent-rules/{game003,shared-game-runtime,scene-layout,loading-ui}.md`；目标 app 目录没有补充
  `AGENTS.md`。
- 任务 250 已建立并同步 canonical `resource-factory.create({ pooled })`、exact Symbols factory、
  `destroy()` 回池、main reel top layer、stable cell anchor、`ReelSpinSession` 和 `replaceSymbols()`；抽查的
  pool/address 源码与测试在两仓逐字一致，无需新增 shared API。
- `round-compiler.ts#compileGame003v2Round()` 当前先从 `bg-spin|bg-addbo` 历史中选最新唯一 scene，再可选编译
  `bg-up|bg-addwilds` transform；它尚不按 `bg-bar.curFeature` 编译 coin/bonus 专用 landing，也未绑定
  `bg-coinwins2`。
- `feature-symbol-transform.ts#playFeatureSymbolTransform()` 当前只支持 up/wild；已有池化 Topick、WL preview、
  逐列 land、End、replacement、appear/normal 与 finally cleanup，可扩展 app policy 而无需复制播放器或池。
- `feature-bar-conveyor.ts#waitUntilReelCanStop()` 已能把 up/wild 切到完整 `Feature` barrier，其类型和 strict
  feature matching 尚未包含 coin/bonus；其它 feature 当前在 `Feature` 开始后按配置的 0.5 秒放行。
- 当前 delivery 的权威资源事实：
  - `gamelayout:/resource/spine/searchlight` 使用 `searchlight.json + specialfeature.atlas`，Spine `4.3.23`，
    exact animation 只有 `Start`；
  - `gamelayout:/resource/spine/topick` exact animations 为
    `Topick_Start/Topick_Loop/Topick_End/Topick_Line`；
  - active Symbols binding 是 `minecart2`，`BO` 有 `normal/appear`，main reel 为 5x5，并已有全局 top layer。
- game config 的逻辑 symbol 是 `CO`，当前 code 为 `11`；它的 authored Spine skeleton/slot 使用 `CN` 命名，
  因此用户所说“CN 图标”在 app contract 中必须按 exact `CO` 查询。`BO` 当前 code 为 `26`。这些数值只用于
  基线理解与 fixture 断言，生产代码始终从 `LogicGameConfig.getSymbolCode()` 取得。
- coin 样例的 `bg-spin` scene 在 `(0,0..3)` 为四个 CO，且触发 `bg-coinwins2`；bonus 样例的
  `bg-spin` scene 在 `(3,0)` 为 code `6`，`bg-addbo.pos=[3,0]` 的 scene 把该格改为 BO code `26`。

## 4. 需求解释与技术决策

### 需求解释

1. “当前玩法”以 step 0 exact `bg-bar.curFeature` 为准，不使用上轮 frozen queue 的 `features[0]`；
   `FeatureBarConveyor.applySpin()` 继续先接收 GMI，compiler 与 handler 必须对同一 current feature 做 strict 匹配。
2. coin 的 Searchlight 是玩法固定前奏，不取决于 `bg-coinwins2`；component 只决定 Searchlight 结束后是否创建
   cell Topick。没有 component 仍需完整播放 Searchlight，然后走普通逐列 landing。
3. coin 的“决定 spin 结束 scene”沿用现有 history 顺序：从 `bg-spin|bg-addbo` 中取最新触发组件的唯一 scene。
   `bg-coinwins2` 只提供 trigger evidence，不提供 scene 或位置。
4. bonus 的“回退到 bg-spin”不是丢弃服务器最终结果，而是拆分为 initial landing 与 final mutation：
   reel settle 使用 `bg-spin` snapshot，Topick/BO handoff 后 operation output 必须是 `bg-addbo` snapshot。
5. “wild 的 topick 流程”指任务 250 已有的 preview handoff：Start 完成后显示 normal preview，目标列 settle 后
   End、replace、移除 preview、正式 occurrence `appear -> normal`；bonus 仅把 preview/final symbol 改为 BO。
6. coin 不需要 symbol preview/replacement，因为 CO 已在其最终 landing scene；对应列 settle 后只播放 End 并清理
   Topick，settled CO/value 由 Reel owner 正常提交。

### 关键决策

1. **新增 app-owned coin/bonus landing kind，不扩展 shared operation DSL。**
   - coin 在 `curFeature=coin` 时总是编译 exact scene-landing operation，payload 保存 initial snapshot、可为空的
     CO positions 和 `bg-coinwins2` trigger 事实；output 与最终 landing snapshot相同。
   - bonus 仅在 `curFeature=bonus` 且存在 `bg-addbo` 时编译 exact scene-landing operation；payload 保存
     bg-spin initial snapshot与pos，output是bg-addbo final snapshot。
   - definitions/registry只认识 exact kind/version；其它 feature继续现有 `slot:spin` 或up/wild kind。
2. **server scene/component 在 mutation 前完整编译。**
   - source bindings增加 exact `coinWins2` evidence；coin有trigger时用game config `CO`扫描最终scene，结果必须非空。
   - bonus用`parseExactPositionPairs()`读取顶层pos、`getComponentScenes()`取得唯一final scene；只允许pos cell变化，
     每个target必须变化为game config `BO`，非pos变化或重复/越界/空pos显式失败。
3. **Searchlight 与 Topick 都从 canonical address pool 创建。**
   - Searchlight挂在main reel top layer的中心cell anchor，只播放exact `Start`，完成后立即detach/destroy回池。
   - Topick与BO preview沿用同layer、stable cell anchor和明确order；BO从
     `gamelayout:/symbol-package/minecart2/symbol/BO` 创建，不读取manifest bytes或维护第二份资源表。
4. **复用一个 landing controller，以 feature policy 区分行为。**
   - 现有up/wild时序保持；coin增加Searchlight前奏和“End后仅cleanup”，bonus复用wild的preview/mutation策略。
   - coin/bonus special path都把`featureComplete`传给Feature barrier；无`bg-addbo`的bonus继续普通0.5秒gate。
5. **最终 output 是后续 operation 的唯一输入。**
   - bonus wins、award、BO collection按bg-addbo final scene运行，不能回读已经落停的bg-spin或component raw。
   - coin win groups仍只来自既有`bg-wins`；`bg-coinwins2`不被伪装成`bg-wins`，total award保持现状。
6. **失败采用 partial-commit fail-stop。**
   - Searchlight/Start/Loop/End/land/replace/appear失败或abort时取消未完成reels并归还全部池对象；已成功settle/
     replace的列不倒放，后续operation不执行，旧round continuation不得进入下一spin。

## 5. 职责与合同

- **LogicCore/BridgeCore**：继续提供 frozen component/raw scene/position query、snapshot与finalizer；不认识
  coin/bonus/CN/CO/BO/Searchlight/Topick，预计不修改。
- **RenderCore**：继续拥有 official Spine/Symbol player、canonical factory pool、opaque layer/anchor、ReelSpinSession、
  replacement、stale/reset/destroy；不认识业务 component或feature，预计不修改。
- **Minecart2 compiler**：拥有 curFeature、component名、initial/final scene选择、CO/BO symbol语义、strict position与
  immutable operation/output。
- **Minecart2 handler/controller**：拥有 Feature/Searchlight/Topick/preview/column settle/mutation时序和exact layer order；
  不接触raw display tree。
- **资源生命周期**：package runtime拥有factory pool；当前operation拥有取出的Searchlight/Topick/BO句柄。
  create/mount中途失败必须释放已创建项；成功、reject、abort、next-spin和destroy均detach后调用一次`destroy()`回池。
- **失败策略**：unknown current feature组合、错误component shape、非唯一scene、非法pos、目标非CO/BO、缺address/
  animation/state、pool stale与异步播放/落停/mutation失败全部显式reject，不增加placeholder或跳过错误。
- **禁止行为**：不硬编码symbol code，不读取服务器真实轮带，不用result位置替代scene扫描，不复制资源表/对象池/
  reel状态机，不按filename或首项猜资源，不把业务字面量写进shared package。

## 6. 文件范围

### 预计新增

```text
tasks/252-minecart2-bg-bar-coin-bonus-landing-<utctime>.md
```

### 预计修改

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-compiler.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/feature-bar-conveyor.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/feature-symbol-transform.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-adapter.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-compiler.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/feature-bar-conveyor.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/feature-symbol-transform.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/feature-bar-resource.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/fixtures/game003-gmi.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/source-boundary.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
```

如果 controller 为保持职责清晰需要拆分，可在同一 app 新增一个 coin/bonus landing helper及对应测试，报告记录小幅
文件适配；不得借机复制 shared player/pool/reel实现。

### 原则上不应修改

```text
packages/{logiccore,rendercore,gameframeworks,bridgecore}/**
apps/game003v2/**
assets/**
/Users/zerro/gitee.com/piximinecart2/packages/**
/Users/zerro/gitee.com/piximinecart2/assets/**
docs/agent-rules/**
AGENTS.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

若需要shared public API，属于范围升级：先说明真实缺口和拟改文件，在slotclientengine实现/测试，再只同步实际文件到
piximinecart2并做parity；不得覆盖外部无关drift。manifest/schema、production assets、lockfile或根工具链变化必须停止确认。

## 7. 实施步骤

1. **确认双仓执行基线与资源合同**
   - 重核两仓HEAD/status、本计划、领域规则、task 250 parity及当前delivery exact resource/Symbol能力。
   - 从当时active initial chunk复核Searchlight/Topick动画、CO/BO symbol、binding、5x5 geometry和top layer；
     任一事实变化时按新canonical合同小幅适配或报告阻塞，不猜alias、不手改content-addressed文件。
2. **编译 coin/bonus landing合同**
   - 在step 0读取exact `bg-bar.curFeature`，扩展source bindings与definitions；保持现有latest
     `bg-spin|bg-addbo`选择供普通/coin/up/wild使用。
   - coin总是生成专用landing；有`bg-coinwins2`才按final scene收集CO positions，无trigger保持空positions；
     保护样例的四个position和absence路径。
   - bonus有`bg-addbo`时从exact bg-spin构造initial、从addbo component构造pos/final output并验证仅pos变BO；
     无addbo继续普通spin。wins/award/BO collection/final closure统一消费最终output。
3. **扩展Feature barrier与池化表现**
   - `FeatureBarConveyor`允许coin/bonus special handler请求完整Feature barrier，并继续strict校验本轮curFeature；
     不改变up/wild与普通feature gate。
   - coin在barrier后创建/挂载池化Searchlight，await exact Start并回池；positions非空时再批量创建Topick，全部
     Start完成进入Loop后才land，每列settle后End/cleanup。
   - bonus按任务250 wild策略创建Topick与池化BO preview，落bg-spin initial，在目标列End后replace到final BO并
     `appear -> normal`；保留up/wild既有时序与layer order。
4. **接入operation registry与后续链路**
   - 注册coin/bonus exact kind/version并调用同一app controller；普通landing继续现有handler。
   - 确认bonus output后依次编排现有wins、award、BO collection和可选cg-initbn mode round trip；coin继续现有
     bg-wins/award，bg-coinwins2不新增重复金额展示。
   - next-spin/cancel/destroy统一终止Feature、Searchlight、Topick、preview和active ReelSpinSession。
5. **测试、文档与收尾**
   - 将两份用户样例压缩为真实parser fixture，覆盖trigger存在/缺失、scene/pos、operation顺序和final closure。
   - 用可控Promise测试Feature/Searchlight/Topick/column/replace/appear顺序，以及各阶段失败、abort、连续spin和池回收；
     resource测试读取真实delivery证明exact能力与CN→CO contract。
   - 更新Minecart2 README和source boundary；运行L1定向验收，在主仓生成UTC中文报告并明确shared未修改/同步。

## 8. 测试与验收

### 测试原则

- fixture必须经过`createSlotGameLogicResult()`真实parser，不只手写已编译operation；精简掉随机数等无关数据，但保留
  `historyComponents/mapComponents/scenes/pos/curFeature`的协议shape。
- compiler覆盖coin trigger有/无、最终scene用last component、CO为空失败；bonus addbo有/无、非唯一scene、空/重复/
  越界pos、非pos变化、target非BO失败；同时保护up/wild和operation顺序。
- handler用可控Feature/Searchlight/Topick/reel Promise与host `context.delay()`，不用wall-clock sleep；精确断言
  Searchlight结束前零Topick/zero land、全部Start后才land、目标列settle后才End/replace。
- cleanup覆盖Searchlight Start、Topick Start/End、reel settle、replace、appear失败与abort/destroy；断言池化对象各归还
  一次、active session取消、已提交列不伪rollback。
- resource测试只读取canonical delivery映射，不把hash/path/code复制为生产业务表；source boundary保证业务literal只在app。

### 验收级别

`L1`：默认只修改外部Minecart2 app内部compiler/controller/registry、测试和README，复用既有shared public API，
不改schema、资源、生成物、依赖或lockfile。若执行发现真实shared缺口，则因跨仓public consumer升级`L2`，并先完成
slotclientengine package定向测试/typecheck与逐文件parity后再继续app验收。

### 执行会话必须运行

```bash
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/round-compiler.test.ts tests/feature-bar-conveyor.test.ts tests/feature-symbol-transform.test.ts tests/feature-bar-resource.test.ts tests/round-adapter.test.ts tests/source-boundary.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
git diff --check
```

最后一条在slotclientengine执行。若出现shared改动，新增修改package的定向test/typecheck与两仓实际同步文件parity，
并说明升级L2原因；不因此运行整仓typecheck/test/build。

### 人工验收

1. coin无`bg-coinwins2`：完整Feature后只播放中央Searchlight；Start结束才开始逐列停轴，无cell Topick。
2. coin样例：Searchlight后四个CN/CO格同时Start/Loop；第0列真实落停后各播放一次End并消失，CO数字、win与award正常。
3. bonus无`bg-addbo`：保持现有0.5秒gate和普通landing，无Topick/BO preview。
4. bonus样例：完整Feature后`(3,0)`显示Topick/BO preview；第3列先落旧L1，End后无闪跳变为正式BO并
   `appear -> normal`，随后既有win/award/BO collection正常。
5. 横竖屏、首次初始化、连续coin/bonus、取消/刷新/退出重进：中心与cell anchor正确，无残影、重复对象、旧round提交或池增长。
6. 注入资源/动画失败：回合显式失败，未完成reel取消，Searchlight/Topick/BO均清理，不进入后续win/collection/transition。

### 独立验收建议

`建议`：不改跨包public contract，但涉及服务器scene选择、逐列partial commit、池化对象与正式BO handoff。独立复验：

```bash
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/round-compiler.test.ts tests/feature-symbol-transform.test.ts tests/feature-bar-resource.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
```

## 9. 环境与依赖

- 两仓使用Node 24与pnpm；shell没有Node时先`source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时在对应仓运行`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置约定代理重试。
- 不新增依赖，不修改package.json/lockfile，不切换npm/yarn，不引入timer、pool或动画状态机库。

## 10. 生成物、文档与规则

- 本任务不修改YAML、delivery manifest/chunk、assets map、Symbols manifest或其它生成物，不运行资源生成器，也不手改
  content-addressed文件。
- 更新外部`apps/minecart2/README.md`，记录coin/bonus数据来源、Feature/Searchlight/Topick/landing顺序、
  CN是CO authored skeleton命名以及strict failure/cleanup边界；不复制资源hash/code表。
- app业务职责未改变shared长期规则，默认不更新根`AGENTS.md`或`docs/agent-rules/*`；若shared合同真实改变，才更新
  最小范围shared/scene-layout规则。
- 执行结束重新核对两仓status，保留用户执行期间产生的无关修改，不清理、不顺手格式化。

## 11. 执行报告

规划时不生成报告。执行完成后在slotclientengine创建：

```text
tasks/252-minecart2-bg-bar-coin-bonus-landing-<utctime>.md
```

报告简要记录两仓实际基线、最终coin/bonus operation合同、实际修改文件、shared是否升级/同步、自动化与浏览器结果、
计划偏差和剩余风险；未完成的人工视觉验收必须明确标记。

## 12. 风险、假设与待确认

### 风险

- 用户称“CN”，当前canonical game symbol却是`CO`，只是其Spine skeleton/slot叫CN；未来资源若重命名，必须继续以
  active game config + Symbol package为权威，不能按旧skeleton filename猜业务symbol。
- Topick跨cell尺寸、Searchlight中心视觉、低FPS下bonus preview到正式BO handoff只能在真实浏览器确认，单测不能证明无闪跳。
- coin的CO values来自`bg-gencoins.otherScene`；Topick不应提前创建完整CO preview，否则可能复制或丢失ImgNumber值。
- bonus在目标列完成后发生partial mutation；后续列失败时不能倒放已提交BO，必须fail-stop并清理剩余临时对象。
- 现有`cg-initbn`触发的BonusGame往返与本任务`curFeature=bonus/bg-addbo`不是同一判据；本任务不得把用户样例中的
  `bg-botrigger`重新解释为mode transition。

### 假设

- “CN图标”指当前Symbol package中由`CN` skeleton呈现的逻辑`CO`，并按最终landing scene的全部CO位置播放Topick。
- “回退到bg-spin”指视觉落停前态，不改变immutable plan的最终服务器scene；Topick结束后仍提交bg-addbo的BO。
- coin/bonus特殊流程只作用于step 0 exact current feature；组件缺失时按本计划定义的正常路径处理，不跨step搜索。

### 待确认

无；上述语义均可由用户描述、两份样例和当前canonical资源/代码合同确定。

## 13. 完成清单

- [ ] coin/bonus目标和缺component正常路径均已满足。
- [ ] actual修改未超范围，或偏差已在报告说明。
- [ ] component/scene/pos/symbol、immutable output与operation顺序符合计划。
- [ ] Searchlight/Topick/BO pool、partial commit、abort和destroy生命周期正确。
- [ ] up/wild、其它feature、win/award/BO collection/mode round trip回归受保护。
- [ ] shared无需修改，或已按主仓先行、定向验证、逐文件同步和parity完成L2升级。
- [ ] 指定自动化验收通过，真实浏览器结果单独记录。
- [ ] README/source boundary按需同步，UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根`AGENTS.md`、本计划列出的四份领域规则、本计划与task 250最终合同；
2. 核对两仓Git基线、当前delivery exact资源和task 250 shared parity；
3. 按“编译完整operation -> 扩展Feature barrier/controller -> registry接入 -> 定向测试”的顺序实现；
4. 若暴露shared缺口，先停止说明，再按“slotclientengine实现/验证 -> 外部逐文件同步/parity -> app接入”执行；
5. 小幅文件名/API适配在报告记录，manifest/schema/assets/lockfile或明显public范围扩张先停止确认；
6. 只运行本计划规定的L1验收；真实升级shared时按触发条件补充L2定向命令，不扩到整仓；
7. 完成后生成UTC中文报告，明确自动化、人工验收和剩余风险；
8. 除非用户明确要求，不commit、不push、不创建PR。
