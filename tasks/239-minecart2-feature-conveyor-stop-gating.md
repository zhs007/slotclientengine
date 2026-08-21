# 239 minecart2-feature-conveyor-stop-gating 任务计划

## 1. 目标与完成定义

### 目标

在外部项目 `/Users/zerro/gitee.com/piximinecart2` 中完善 Minecart2 的中奖、feature bar、横竖屏
pickup 和转轮落停编排：移除 symbol 中奖时叠加的字体金额；让竖屏 `conveyor-3-2` 与横屏
`conveyor-3` 走同一套 `Topick → Loop` 业务；把首次没有历史 `bg-bar` 的状态从伪造五个
`normal` 改为显式待初始化，并用首次 spin 响应完成快速传送带初始化；当非 normal feature 进入
转轮中央 `feature` Spine 后，从 `Feature` 开始播放起至少 0.5 秒才允许主转轮落停。

### 完成定义

- [ ] symbol win 仍按 `SymbolGroup.playState("win")` 播放，但不再创建、挂载或显示字体金额节点。
- [ ] 横屏使用 `conveyor-1` + `conveyor-3`，竖屏使用 `conveyor-2` + `conveyor-3-2`；非 normal
      feature 在 active conveyor Start 完成后让对应 pickup 播放一次 `Topick`，随后循环 `Loop`。
- [ ] 普通 spin 使用 start 前冻结的上一份 `bg-bar.features[0]` 决定本轮 feature；响应到达后的
      `curFeature` 和 `features[0]` 都不能覆盖本轮判断，`features` 只进入下一轮 queue。
- [ ] 没有历史 `bg-bar` 时保持 `uninitialized`，不再以五个 `normal` 冒充服务器状态；第一次 spin
      仍立即转动主转轮，响应到达后只以本次 `curFeature` 作为当前玩法，并使用
      `curFeature + features[0..3]` 建立快速初始化画面；此时不能读取不存在的上一轮 `features[0]`。
- [ ] 首次初始化按当前 variant 使用各自 exact slot 和 `Conveyor1_Start2` / `Conveyor2_Start2`，
      再把 `curFeature` 交给 Car、播放对应 pickup，并进入与普通流程一致的后续状态；成功后才标记
      initialized，失败或取消后仍可从待初始化状态重试。
- [ ] 非 normal 的 `Feature` 播放开始后，landing handler 至少等待配置的 0.5 秒 gate；初始化轮还要
      等初始化整体流程完成，之后才调用 `area.spin.land()`。等待期间 reel 保持正常连续滚动。
- [ ] node、resource、reel、layer 和 variant event 优先通过 task 228 的 canonical `gamelayout:/`
      地址解析；不恢复 raw Container、路径猜测、node/resource 同名 fallback 或 viewport 私有判断。
- [ ] 自动测试覆盖首次响应、普通响应先后时序、横竖屏、0.5 秒 stop gate、取消/失败和金额移除；
      真实浏览器完成横竖屏动画与落停时序验收。

## 2. 范围

### 包含

- Minecart2 `FeatureBarConveyor` 的 `uninitialized | initialized` 状态、每轮不可变 feature snapshot、
  Start/Start2、pickup、Car、中央 Feature 与 landing barrier 编排。
- `round-adapter.ts#land()` 在调用 RenderCore 原子 `area.spin.land()` 前等待游戏侧 barrier。
- 横竖屏 conveyor/pickup 的 exact node、slot、animation 与 canonical runtime address 配置。
- win carousel 删除字体金额 RenderObject 及对应 app runtime config。
- 0.5 秒最小落停等待的 versioned app runtime config、定向测试、README 与执行报告。
- 只读验证 `assets/minecart2/layout.manifest.json`、`assets.map.json` 和实际 Spine JSON 中的 exact
  资源事实；缺少或不一致时显式失败。
- 执行阶段按用户补充要求，把当前 slotclientengine 的 `packages/logiccore`、`packages/rendercore`
  精确同步到 piximinecart2；若同步后的 rendercore 依赖更新过的直接 shared package，则同步该直接依赖并
  升级为 L2 验收，不在 rendercore 内加入旧接口兼容分支。
- 浏览器验收若暴露同步后 RenderCore 的通用 viewport 回归，先在主仓修复并以通用回归测试证明，再同步
  外部 rendercore；不得在 Minecart2 app 绕开或吞掉 geometry 错误。

### 不包含

- 不改变 `bg-wins` 结果选择、symbol win state、循环顺序、pause 或 award Popup 金额。
- 不改变公开轮带、服务器 scene 边界、landing scene/value、列落停顺序或 stop stagger。
- 不把 `bg-bar`、feature 枚举、Car、conveyor 或动画名放进 logiccore/rendercore。
- 不给首次缺数据恢复五个 normal、首项 fallback、slot alias、animation fallback 或路径猜测。
- 不修改 Game Layout manifest/schema、生产美术 bytes、assets map、生成器、lockfile 或依赖。
- 任务 239 不在 slotclientengine 内新增 logiccore/rendercore public API；执行阶段仍按用户补充要求同步
  两个 package 的当前既有实现。同步产生的直接 shared dependency 必须保持与主仓同版本，不允许在外部
  shared package 写游戏专属补丁。

## 3. 制定计划时的基线

```text
UTC: 2026-08-21T11:04:41Z
slotclientengine HEAD: 0ede2ad71a8e0ef2c78c3675bf3c462be986574c
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean
piximinecart2 HEAD: 3ce11708360dd2aa0f4b7f508e48acdbc70f82d9
piximinecart2 branch: rgs
piximinecart2 git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、外部项目根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout,game003}.md`；目标目录没有补充 `AGENTS.md`。
- task 228 已提供 owner-first `gamelayout:/` catalog/resolver、authored node、runtime resource、reel/layer
  与 `gamelayout:/event/variant-changed`；task 232 已提供 `FeatureBar2Data` strict query、authored Spine
  exact playback/slot binding及 Minecart2 基础 conveyor 实现。
- 仓库中未找到 task 237 计划/报告；当前外部代码和 commit `074de42` 已证明其结果：
  `feature-bar-conveyor.ts` 创建一次 `gamelayout:/resource/spine/feature`，挂到
  `gamelayout:/reel/main/layer/top` 的中心 cell，播放 exact `Feature` 并在 `Icon` slot 挂 feature 图片。
- `feature-bar-conveyor.ts#queue` 当前直接初始化为五个 normal；`startSpin()` 冻结 `#queue[0]`，
  `applySpin()` 读取 step 0 exact `bg-bar` 并把响应 `features` 作为下一 queue。上一份数据的冻结时点
  是正确基线，任务只替换“无上一份数据”的启动状态。
- 当前 pickup 只有 `conveyor-3`，且 portrait 分支直接跳过；最新 manifest 已新增 portrait-only
  `conveyor-3-2`，两者 skeleton 都是 `conveyor_3.json`，包含 exact `Topick` 与 `Loop`。
- 当前 conveyor 资源事实：`conveyor-1` 有 `Conveyor1_Start/Start2/Idle/Idle2`，`conveyor-2` 有
  `Conveyor2_Start/Start2/Idle/Idle2`。两份当前 skeleton 的业务 slot literal 都包含
  `conveyor1_0..4`，但排列/语义必须按 node 分别配置，不能继续共享一个无 variant 身份的 slot 数组；
  若执行基线的更新美术确实改成不同 literal，以当时 manifest/map 指向的 skeleton 为权威并 strict 更新。
- `round-adapter.ts#land()` 当前收到第一个 `slot:spin` operation 后立即调用 `area.spin.land()`；现有
  `SlotOperationExecutionContext.delay()` 使用 coordinator/runtime host clock，足够实现 app-owned stop
  barrier，无需在 RenderCore 增加业务 predicate、wall-clock timer 或新的 AreaSpinFunction option。
- `round-adapter.ts#playWinGroup()` 当前通过 `createTextRenderObject()` + win layer 显示格式化金额；
  `config/game-runtime.manifest.json#winCarousel.amountText` 仅服务该节点，可随效果一起删除。

## 4. 需求解释与技术决策

### 需求解释

1. **当前玩法来源按初始化状态分支**：`uninitialized` 的第一次 spin只能在本次响应到达后读取
   `curFeature`，并把它作为本轮当前玩法；`initialized` 的普通 spin只使用 `startSpin()` 前最后一次
   已提交 queue 的 `features[0]`。普通轮响应中的 `curFeature` 与新 `features[0]` 都不得改变已冻结的
   `roundFeature`。
2. “第一次 spin”是 feature bar 尚未取得任何服务器 `bg-bar` 的状态。主转轮仍在 paired
   `startSpinPresentation()` 中立即 targetless start；只有 response landing 被初始化动画 gate 阻塞。
3. 首次响应临时窗口为 `[curFeature, features[0], features[1], features[2], features[3]]`，按每个
   conveyor 自己的 slot map 写入视觉上的 4→0 五格。Start2 完成后提交 canonical `features[0..4]`
   queue，并把临时 `curFeature` 从 conveyor presentation 移交 Car；不丢弃 `features[4]`。
4. 横竖屏是两条对等路径：landscape 的 active pair 为 `conveyor-1/conveyor-3`，portrait 为
   `conveyor-2/conveyor-3-2`。只驱动当前可渲染 pair，避免等待 Scene Layout 暂停的 hidden variant
   Spine；variant change 使用 task 228 committed event切换 owner，不监听 raw resize。
5. “Feature 放 0.5 秒后才能停”定义为 `Feature` exact animation开始后的普通轮最小 landing gate，
   而不是修改 reel 自身速度/周期。landing 可以在 gate 后开始，不等待 authored Feature 动画剩余时长；
   Feature/Car 视觉尾动画继续完成，首次初始化除外。
6. “初始化整体流程”定义为 Start2、临时窗口到 canonical queue 的提交、必要的 pickup/Car/Feature
   handoff及其 0.5 秒 gate都成功收敛。只有该 Promise 完成，首次 landing 才可开始并把状态改为 initialized。

### 关键决策

1. **stop barrier 留在游戏 landing handler**：`FeatureBarConveyor` 暴露本轮 awaitable gate，
   `round-adapter.ts#land()` 先 await，再调用 `area.spin.land()`。这让“何时允许停轮”由 immutable
   operation执行链控制，同时 RenderCore 仍只拥有逐列原子落停与 host-clock delay。
2. **Feature 开始前取得 operation delay owner**：若 conveyor Start早于响应完成，效果可继续到 handoff
   前，但 `Feature` 真正开始前等待本轮 landing context注册；随后并行启动 exact `Feature` 与
   `context.delay(configuredSeconds)`。这样 0.5 秒从明确动画边界计时，不使用 `setTimeout`/RAF；普通轮
   delay完成即放行 landing，初始化轮仍等待完整动画流程。
3. **显式初始化状态，不伪造 queue**：controller 初始化时不提交 normal queue；首次响应的当前玩法
   只能来自 exact `curFeature`，不能借用 `features[0]`。首次 cancel、网络失败、strict parse失败或动画
   失败都清理临时 attachment并保持 uninitialized，下一次 spin重新走同一路径。
4. **每个 variant 独立 exact 配置**：为 conveyor node、pickup node、Start/Start2/Idle和 slot map建立
   readonly per-variant配置；不按前缀拼动画名、不把一个 slot数组隐式复用于另一 skeleton。
5. **继续使用 task 228 地址**：node、runtime image/Spine、reel、top layer和 variant event都经
   `runtime.addresses.resolve/bind`；动画 completion继续使用 opaque Spine Promise，不发明 app event总线。
6. **中奖金额只移除 presentation**：保留 group.amount 的编译与业务数据合同，不修改 shared TextRenderObject；
   只删除 Minecart2 的创建/挂载调用及已无 consumer 的 amountText app配置。

## 5. 职责与合同

- **logiccore/gameframeworks**：继续按 exact step/name返回冻结的 `FeatureBar2Data`，不解释 feature 枚举、
  五格、历史/当前关系或初始化语义。
- **rendercore**：继续拥有 runtime address、authored Spine exact playback、slot attachment、program Spine、
  RenderObject ownership、host-clock `context.delay()` 与 reel start/land/cancel；不认识 Minecart2业务。
- **Minecart2 app**：拥有 `bg-bar`、`normal/up/wild`、per-variant node/slot/animation、curFeature初始化、
  普通轮上一份 `features[0]` snapshot、0.5 秒业务 gate、round epoch和何时允许落停。
- **资源生命周期**：authored conveyor/pickup/Car为 borrowed且不可 destroy；feature图片和程序 Spine为
  caller-owned。一个 RenderObject不能同时挂两个 parent；variant切换、cancel、失败和 destroy必须依次
  abort waiter/playback、detach、恢复/清除画面、destroy owned object。
- **失败策略**：缺 `bg-bar`、错误 shape、unknown feature、错误 address/kind、缺 node/slot/animation、
  stale epoch或 gate playback失败均显式 reject当前 round并由 coordinator fail-stop；不得只 log后让 reel
  永久滚动，也不得静默按 normal继续。
- **禁止行为**：不读取服务器真实轮带；初始化轮不以 `features[0]` 代替 `curFeature`；普通轮不以响应
  `curFeature` 或新 `features[0]` 覆盖已冻结 roundFeature；不使用 raw Container/player、wall-clock、
  slot alias、首项/default animation、路径/hash或 raw resize fallback。

## 6. 文件范围

### 预计新增

```text
tasks/239-minecart2-feature-conveyor-stop-gating-<utctime>.md
```

### 预计修改

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/feature-bar-conveyor.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-adapter.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/config.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/feature-bar-conveyor.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/feature-bar-resource.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/source-boundary.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
/Users/zerro/gitee.com/piximinecart2/packages/rendercore/**
/Users/zerro/gitee.com/piximinecart2/packages/editorresource/**（仅当 rendercore 当前接口要求）
packages/rendercore/src/viewport/unbounded-focused-viewport.ts（仅当浏览器暴露通用浮点 containment 回归）
packages/rendercore/tests/viewport/{unbounded-focused-viewport,responsive-art-viewport}.test.ts（同上）
```

### 原则上不应修改

```text
packages/{logiccore,editorresource,gameframeworks}/**（主仓只作为同步源，不在任务 239 修改）
/Users/zerro/gitee.com/piximinecart2/packages/gameframeworks/**
/Users/zerro/gitee.com/piximinecart2/assets/**
apps/game003v2/**
docs/agent-rules/**
AGENTS.md
package.json
pnpm-lock.yaml
```

执行时若需要修改 shared public API、外部 packages副本、生产资源/schema、生成物或 lockfile，必须先按
第 2 节的主仓优先顺序说明原因并升级验收，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认双仓执行基线与资源合同**
   - 重核两个仓库 HEAD/status，读取本计划和三份领域规则；保留用户已有无关修改。
   - 经 manifest → assets map → Spine JSON确认四个 node、per-variant slot、Start/Start2/Idle、Topick/Loop
     与 Feature/Icon；更新美术若与规划证据不同，使用新 exact值或因缺失显式停止，不能猜 alias。
2. **移除 symbol win 字体金额**
   - 简化 `playWinGroup()` 为 exact symbols批量 win state播放，删除 TextRenderObject、win layer挂载、
     formatter/style和相关 import。
   - 从 app runtime config/parser移除 `winCarousel.amountText`；保留 cycle pause、group amount编译和 award
     formatter。若 config shape version发生不兼容变化，显式提升其内部版本并同步 parser。
3. **重构 feature bar状态与横竖配置**
   - 用显式初始化状态替代默认 normal queue；为 landscape/portrait分别配置 conveyor、pickup、slot map、
     Start/Start2/Idle及 canonical node address。
   - 普通 `startSpin()` 只从 initialized queue冻结 roundFeature；Start完成后读取该 snapshot，非 normal走
     active pickup `Topick → Loop` 与现有 Car/Feature链。普通 `applySpin()`验证响应 `curFeature` shape但不把
     它用于当前玩法，只提交响应 `features` 作为下一 queue。
   - variant committed event切换 active pair；epoch/AbortSignal保证旧 variant continuation不能提交新画面。
4. **实现首次响应快速初始化**
   - uninitialized `startSpin()`只建立本轮/gate并允许 reel立即启动，不播放基于伪数据的普通 Start。
   - 首次 `applySpin()` strict读取 `curFeature` 与五项 features；明确选择 `curFeature` 为本轮当前玩法，
     先绑定临时五格，播放 active Start2，完成后原子提交 canonical features五格并把 curFeature交给
     Car/pickup/Feature正常链；首次当前玩法选择不得读取 `features[0]`。
   - 成功完成全部初始化边界后设 initialized；cancel/error/destroy清理临时和owned对象并保持可重试。
5. **把 0.5 秒 gate接入 landing operation**
   - 在 app config加入明确的 `featureReelStopDelaySeconds: 0.5`（最终字段名以既有命名风格为准）。
   - controller为每轮提供 identity-safe awaitable landing gate；非 normal在 exact Feature start时用
     operation context delay计时，normal立即放行，首次轮等待完整初始化。
   - `round-adapter.ts#land()` 在设置 `#preSpinActive=false` 和 `area.spin.land()` 前 await exact round gate；
     context abort、feature cancel、animation failure和destroy均拒绝 waiter且只清理一次。
6. **同步用户指定的 shared package**
   - 对比主仓与外部副本后，把 slotclientengine 当前 `logiccore`、`rendercore` 同步到 piximinecart2；同步后
     运行目录 parity 检查。若 rendercore 编译证明依赖了更新的直接 shared API，则同步该直接依赖并记录
     L2 触发原因。
   - 若真实窗口使 projected viewport 因浮点误差略小于 focus，主仓修复 unbounded contain 投影的最小轴
     钳制，运行 viewport 回归测试后再次同步 rendercore。
7. **测试、文档与收尾**
   - 扩展 controller fixture验证初始化临时/最终绑定、上一轮数据、横竖 exact配置、Topick/Loop、0.5 秒
     delay、land调用顺序、cancel/失败/destroy；资源测试读取实际 package验证 exact closure。
   - source boundary验证 `gamelayout:/` 使用和 win文字代码消失；README记录首次初始化与 reel gate。
   - 运行 L1定向验收、完成真实浏览器检查并在主仓 `tasks/` 写 UTC执行报告。

## 8. 测试与验收

### 测试原则

- controller单测用 strict fake address resolver、Spine playback、attachment和可控 operation delay；不以真实
  定时等待 0.5 秒，不依赖 wall-clock，并验证普通轮无需等待 authored Feature animation完成。
- 至少覆盖 response早于/晚于 Start、首次 `curFeature` 与 `features[0]` 不同、首次 curFeature
  normal/non-normal、普通上一份 `features[0]` 与响应 `curFeature/features[0]` 不同、portrait
  `conveyor-3-2`、variant切换、网络 cancel、playback reject和 destroy。
- 测试必须断言 `area.spin.land()` 在 gate前零调用、gate后恰好一次；reel start不等待首次初始化。
- asset-backed app测试可验证当前 Minecart2美术 exact动画/slot；shared package测试不得读取这些资源。

### 验收级别

`L1`：计划只修改外部 Minecart2 app内部业务编排、测试和静态 runtime config，没有跨 package public API、
schema、生成物、lockfile或 shared package变化。若触发 shared capability缺口则按第 2 节升级 `L2`。

### 执行会话必须运行

```bash
pnpm --filter minecart2 exec vitest run tests/feature-bar-conveyor.test.ts tests/feature-bar-resource.test.ts tests/source-boundary.test.ts
pnpm --filter minecart2 typecheck
pnpm --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
git diff --check
```

`typecheck`/`build` 会按 package脚本构建直接 workspace依赖，因此不再重复列 rendercore build。失败先定向
判断是否为既有缺失 fixture/resource；只有本任务引入的问题才扩大命令。

### 人工验收

1. 清空历史 `bg-bar` 后首次 spin：reel立即连续转动；GMI到达后当前方向播放 Start2，画面先出现
   `curFeature + features[0..3]`，并确认送入 Car的当前玩法是 `curFeature` 而不是 `features[0]`；再进入
   canonical features与 Car/pickup流程，完成前 reel不落停。
2. 横屏上一份 `features[0]` 非 normal：`conveyor-1` Start结束后 `conveyor-3` 播放一次 Topick再 Loop；
   中央 Feature开始后至少 0.5 秒才开始逐列落停，Feature 动画可继续播放。
3. 竖屏重复同一场景：使用 `conveyor-2` exact slot/动画与 `conveyor-3-2`，行为和横屏一致；Start或
   Feature中切方向不出现旧 continuation、双 attachment或永不结束 gate。
4. 普通轮 response返回的 `curFeature`、新 `features[0]` 都与上一份 `features[0]` 不同，确认本轮仍只
   消费上一份 `features[0]`，下一轮才消费新 queue。
5. 有 win group时只播放 symbol win，不出现字体金额；award Popup金额保持正常。

### 独立验收建议

`建议`：不涉及跨包 public contract，但涉及异步 stop barrier、首次状态和 attachment ownership。独立复验：

```bash
pnpm --filter minecart2 exec vitest run tests/feature-bar-conveyor.test.ts tests/source-boundary.test.ts
pnpm --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
```

## 9. 环境与依赖

- 两仓均使用 Node 24 与 pnpm；shell无 Node时按根模板加载 nvm并 `nvm use 24`。
- 依赖缺失时在对应仓库使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置约定代理重试。
- 不新增依赖，不修改 lockfile，不用 npm/yarn，不引入 timer/animation库。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、Scene Layout manifest、assets map或生成文件，无 generator/parity输出。
- 更新外部 `apps/minecart2/README.md`，记录上一轮数据、首次初始化、per-variant pickup与 0.5 秒 landing gate。
- 当前不改变稳定 shared职责，不更新根/领域 `AGENTS.md`；精确动画、slot和时长留在 app config、测试和报告。
- 若美术本身缺 exact slot/animation，只报告资源阻塞，不手改 content-addressed payload或 map。

## 11. 执行报告

规划时不生成报告。执行完成后在主仓创建：

```text
tasks/239-minecart2-feature-conveyor-stop-gating-<utctime>.md
```

报告简要记录两仓实际 HEAD/修改文件、初始化与 stop gate决策、五条验收结果、浏览器结果、计划偏差和
剩余资源/时序风险；若 shared package未修改，明确记录“不需要同步”。

## 12. 风险、假设与待确认

### 风险

- 当前两份 conveyor skeleton 的 0..4 slot literal表面相同，但用户说明横竖命名有差异；更新美术可能在
  执行前改变。必须分别解析、配置和测试，不能靠当前同名事实合并。
- Scene Layout variant-hidden authored Spine不推进 playback；实现只能等待 active variant的动画，切方向时
  必须 cancel旧 waiter并在新 active pair上确定性续接/重启，不能同时等待隐藏节点。
- Start完成、GMI、variant event、Feature handoff和 coordinator cleanup可能同帧交错；gate必须绑定 round
  epoch并让所有失败路径 reject，避免 reel永久滚动或旧轮放行新轮。
- 真实 Spine duration约 1 秒而普通轮 stop gate为 0.5 秒；Feature剩余动画、Car尾动画和落停并发只能
  在真实浏览器确认，单测只证明业务时钟和调用顺序。

### 假设

- 初始化轮的当前玩法只能是本次响应 `curFeature`；初始化完成后，普通轮的当前玩法才是 spin前冻结的
  上一轮 `features[0]`。响应 `features` 五项是初始化完成后或普通轮下一轮使用的 canonical queue。
- `normal/up/wild`、step 0 exact `bg-bar`和 `sgc7pb.FeatureBar2Data` 合同保持不变；缺失应失败而非跳过。
- “conveyor-1 与 conveyor-2、conveyor-3 与 conveyor-3-2”按当前 variant分别驱动，不要求不可见 variant
  的 Spine在后台推进；两条路径在测试和人工验收中都必须通过。
- 0.5 秒是从中央 `Feature` 开始播放起的普通轮最小落停延迟，不要求修改 Feature资源自身的 authored duration；
  初始化轮仍等待整体动画流程。

### 待确认

- 执行基线若仍使用当前资源，横竖业务 slot literal均为 `conveyor1_0..4`；若用户所指“名字有差异”的
  新 skeleton尚未同步到 `assets/minecart2`，执行必须等待/接收该权威资源后再锁定 portrait slot map，
  不根据口头描述猜名字。
