# 262 rendercore-award-popup-runtime-play-options 任务计划

## 1. 目标与完成定义

### 目标

为 RenderCore `award-celebration` Popup 的每次播放增加金额时间缩放和货币格式化合同：宿主可用小于 `1` 的系数加快数字变化，并在 `playAwardCelebrationForCurrentMode()` 每次调用时传入 `(number) => string` 的 `formatMoney`。数字自然跨档时必须与现有点击跳档一样当帧隐藏旧档画面，不等待旧档动画时长。

### 完成定义

- [ ] `playAwardCelebrationForCurrentMode()` 的公开输入必须接受 `formatMoney: (amount: number) => string`，并用它格式化该次播放的所有自动金额。
- [ ] 同一个缓存 Popup runtime 连续或排队播放不同 formatter 时，每个请求只使用自己捕获的 formatter，不泄漏到后续 `play`、legacy `start` 或 programmatic Popup。
- [ ] 每次播放可配置可选 `amountDurationScale`，省略等价于 `1`；例如 `0.8` 使整条金额计数与最终减速轨迹的时间缩短到基准的 `80%`，金额轨迹形状、threshold 和 final 不变。
- [ ] 时间系数只影响数字 motion clock，不缩放 Pixi/VNI/Spine 的 `start/loop/end`、粒子 drain、音频或宿主 ticker delta。
- [ ] 自然计数和 `requestAdvance()` 抵达下一档的当帧都立即隐藏旧档容器并显示新档；即使旧档动画长于数字时间，也不阻塞跨档。
- [ ] 被隐藏的旧档仍走现有 official end/drain/cleanup，不在画面后残留可见内容、挂起 Promise、音频或资源。
- [ ] `win <= bet` 直接 final、完整 threshold span 标定、跨档连续加速、最终单次减速、点击跳档、final auto-dismiss 和 manual text override 现有合同保持。
- [ ] 定向自动化、直接 consumer typecheck、文档、稳定领域规则和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- Popup Core 每次 `start` 的 formatter override 和 amount duration scale，以及默认 formatter 的恢复边界。
- `award-amount-motion` 中整条金额时间轴的等比缩放，包括每档计数和 terminal braking。
- Scene Layout `playAwardCelebrationForCurrentMode()` 的 public input、严格校验、队列捕获与 Popup Core 转发。
- Core/player/Scene Layout scheduler 的定向测试，以及 RenderCore 和 Crave 人工迁移说明。

### 不包含

- 不修改 Popup manifest/schema/version，不把 runtime 系数或 formatter 写入 Popup ZIP、Scene Layout YAML 或 Editor project。
- 不缩放、截断或重采样 VNI/Spine 动画，不新增第二 ticker、timer 或可见 fallback。
- 不改变 `startAwardCelebrationForCurrentMode()` 和 `enqueuePopup({type:"award-celebration"})` 的现有调用形状；它们继续使用 runtime 创建时的默认 formatter 与 `amountDurationScale=1`。
- 不修改 game002v2/game003v2 的轮次业务编排，不直接修改外部 Crave 仓库。
- 不调整任务 259 的加速/减速公式、threshold、raw scale、ImgNumber 字形布局或 award 美术资源。
- 不新增依赖，不修改 lockfile、根工具链或无关 package。

## 3. 制定计划时的基线

```text
UTC: 2026-08-28T05:31:32Z
HEAD: bc5488b5de01e296f564422fe692d686fc08e88f
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/editor-artifacts.md`、`docs/agent-rules/shared-game-runtime.md`；`packages/rendercore` 下没有补充 `AGENTS.md`。
- `packages/rendercore/src/scene-layout/types.ts` 中 `playAwardCelebrationForCurrentMode()` 当前只接受 `betAmountRaw/winAmountRaw`；仓库内调用只存在于 RenderCore 测试和 `docs/crave-task203-manual-migration.md`。
- `packages/rendercore/src/scene-layout/package-runtime.ts` 会为每个 Popup binding 缓存一个 `AwardCelebrationRuntime`。`formatPopupAmount` 只在 `preparePopup()` 创建 runtime 时传入，因此当前无法按每次 `play` 选择货币格式。
- `enqueueAwardCelebration()` 捕获金额 input 并在请求轮到时调用 `popup.start(input)`；这是保存每次 formatter/scale 并防止排队串值的现有 scheduler 边界。
- `DefaultAwardCelebrationRuntime.#formatAmount` 当前是构造时 readonly formatter；`updateAmount()` 对 floored raw amount 去重后调用它，并严格拒绝空字符串或非字符串结果。
- `createAwardAmountMotionPlan()` 使用 manifest `countDurationSeconds` 构造 standard/bigwin/superwin/megawin 的连续加速 descriptor 和唯一 terminal brake；当前没有 per-play 时间系数。
- `DefaultAwardCelebrationRuntime.startStage()/switchVisibleTiers()` 同时被自然跨档和点击跳档复用；旧档容器会当帧 `visible=false`，然后请求 official end 并在隐藏状态 drain。需增加长动画直接测试锁定该合同。
- game002v2、game003v2 和 Game Layout Editor 当前使用未改签名的 `startAwardCelebrationForCurrentMode()`；`@slotclientengine/gameframeworks` 直接重导出 `SceneLayoutPackageRuntime`。
- 本规划会话只新增本计划，未修改 runtime、资源或生成物，未安装依赖或运行测试/构建。

## 4. 需求解释与技术决策

### 需求解释

- “时间配置系数”解释为数字时间轴的 duration scale，不是 playback rate：`effective time = baseline time * amountDurationScale`。因此 `0.8` 会使同一金额轨迹以 `1/0.8 = 1.25` 倍速度播放。
- “主要用于数字变化速度”解释为只缩放 task 259 amount motion 的所有时间坐标，包括 terminal braking；动画仍按美术资源和 Popup manifest 原速播放。
- “数字到了跨档，动画直接消失”解释为旧档的可见容器当帧隐藏，不用旧动画 completion 作档位 gate；资源层仍以不可见的 official end/drain 收敛，不以强制 destroy 破坏寿命周期。
- `formatMoney` 每次接收当前 floored `amountRaw`，与 `betAmountRaw/winAmountRaw` 单位一致；币种、小数位、分组和 locale 由外部方法负责。

### 关键决策

1. 在 Scene Layout public types 定义具名 `SceneLayoutAwardCelebrationPlayInput`（最终名称可按现有命名小幅调整），字段为 `betAmountRaw`、`winAmountRaw`、必填 `formatMoney` 和可选 `amountDurationScale`。`playAwardCelebrationForCurrentMode()` 改用该类型；默认 scale 为 `1`。
2. `amountDurationScale` 必须是 finite positive number。`0`、负数、`NaN` 和无穷值在入队前显式失败，不把 `0` 静默当成 instantaneous；manifest 内已有的 zero-duration 合同保持独立。
3. Popup Core 给 `AwardCelebrationRuntime.start()` 增加可选 playback options，包含 `formatAmount` 和 `amountDurationScale`。保持纯 `AwardCelebrationInput` 只有金额数据，不让函数或 runtime tuning 进入 manifest/data 语义。
4. runtime 保留构造时 default formatter，每次 `start()` 先选择 active formatter，完成、立即关闭、失败回滚或下次 clear 时恢复 default。Scene Layout `play` 将 `formatMoney` 映射为 Core `formatAmount`；legacy `start`/programmatic 不传 override。
5. 金额轨迹采用时间等比变换：在 scale `s` 下 duration 乘 `s`、rate 除 `s`、acceleration 除 `s²`，terminal brake duration 乘 `s`。这保证任意时刻 `scaledAmount(t) = baselineAmount(t/s)`，不重算 threshold span、brake distance 或 curve tuning。
6. Scene Layout 队列每项保存完整不可变 playback input；只在该项激活时将 formatter/scale 传给缓存 player。不把 formatter 保存到 package runtime 的全局 mutable option，不使后来的排队项改写当前播放。
7. 自然跨档和点击跳档继续复用唯一 `startStage()/switchVisibleTiers()` 提交边界。若为测试需要抽出具名 helper，只做 Core 内部小幅整理，不为两种跨档新建分支状态机。

## 5. 职责与合同

- **Popup data/manifest**：继续只拥有 threshold、`countDurationSeconds`、amount format 默认值和资源引用；不持久化每次调用的 formatter/scale。
- **Popup Core motion**：拥有基准轨迹和时间缩放数学；仍为 O(tier count) prepare、O(1) 每帧求值，不按 raw amount 预生成数组。
- **Popup Core player**：拥有 per-play formatter 选择、amount/text/ImgNumber/tier 同步提交、档位可见性、end/drain 和 cleanup。
- **Scene Layout scheduler**：拥有 public input 校验、FIFO 请求隔离、Promise completion 和对缓存 Popup Core 的调用；不解析货币或复制 amount motion。
- **Consumer**：外部游戏在每次 `playAwardCelebrationForCurrentMode()` 传入明确 formatter，并按需传 scale；不在 app 建立第二套计数或跨档定时器。
- **API 兼容边界**：`playAwardCelebrationForCurrentMode()` 新必填 formatter 是任务要求的源码合同更改；`startAwardCelebrationForCurrentMode()`、programmatic Popup、manifest/schema 和 factory-level `formatPopupAmount` 保持兼容。
- **失败策略**：非法 scale、非函数 formatter、formatter throw/空字符串/非字符串结果显式失败；同步激活失败必须 dismiss 候选 player、reject 对应 Promise 并继续处理后续队列。
- **资源生命周期**：时间 descriptor 和 formatter 不拥有 Pixi/VNI/Spine 资源；旧档隐藏后仍使用现有 official update/end/destroy 边界。
- **禁止行为**：不用调整 ticker delta 伪造数字加速，不强制销毁跨档动画，不将 formatter 写入 manifest，不为缺 formatter 猜 locale/currency 或静默 fallback。

## 6. 文件范围

### 预计新增

```text
tasks/262-rendercore-award-popup-runtime-play-options-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/core/types.ts
packages/rendercore/src/popup/award-player.ts
packages/rendercore/src/popup/award-amount-motion.ts
packages/rendercore/src/scene-layout/types.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/tests/popup/award-amount-motion.test.ts
packages/rendercore/tests/popup/award-player.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/README.md
docs/popup-manifest.md
docs/crave-task203-manual-migration.md
docs/agent-rules/shared-game-runtime.md
```

`packages/rendercore/src/popup/data/types.ts` 已有 `PopupAmountFormatter`，原则上直接复用；只在现有 data/core 导出无法保持分层时做最小 type-only 调整。

### 原则上不应修改

```text
apps/{game002v2,game003v2,gamelayouteditor,popupeditor}/**
packages/{gameframeworks,logiccore,uiframeworks,vnicore}/**
packages/rendercore/src/popup/{data,editor}.ts
packages/rendercore/src/{win-amount,image-string,vni-playback,reel,symbol}/**
assets/**
{package.json,pnpm-workspace.yaml,pnpm-lock.yaml,AGENTS.md}
```

若执行时必须改 Popup schema、Editor 表单、游戏 app、VNI/Spine runtime、资源、依赖或 lockfile，应先说明现有 per-play Core/scheduler 边界为何不足，不能扩大范围后修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与行为矩阵**
   - 重核 HEAD/status、task 259 motion plan、Popup Core start/clear/complete、Scene Layout FIFO 激活和 formatter 默认来源。
   - 固定 scale `1/0.8/2`、自然跨档/点击跨档、长动画/短数字、两个不同 formatter 排队、legacy start 恢复和非法输入的 expected result。
2. **扩展 Core playback options 与时间轨**
   - 在 Popup Core types 中定义不持久化的 playback options，使 `start(input, options?)` 选择 active formatter 和 scale。
   - 在 pure motion helper 对现有 stage/brake descriptor 做数学上一致的时间缩放，保持 zero-duration manifest stage、safe integer threshold、partial final 和 frame slicing 合同。
   - 在 clear/complete/dismiss/failure 边界清除 active options，不让已完成请求的函数被缓存 player 持有或复用。
3. **接入 Scene Layout public play API**
   - 为 `playAwardCelebrationForCurrentMode()` 增加必填 `formatMoney` 和可选 `amountDurationScale`，在 Promise 创建/入队前 strict validate。
   - 让 `enqueueAwardCelebration()` 的请求项捕获该次 options，激活时转为 Core `formatAmount` 与 scale；同步失败和排队取消仍只 settle 正确 Promise。
   - 保留 `startAwardCelebrationForCurrentMode()` 及 programmatic session 旧签名，并证明它们在 per-play override 之后恢复 factory/manifest formatter 和 scale `1`。
4. **锁定跨档可见性与生命周期**
   - 构造一个 `start` 长于缩放后数字档时长的 fake animated layer，验证自然跨档在 threshold 当帧隐藏旧容器、启动新档，不等 `isLoopReady()`。
   - 用同一 fixture 比较 `requestAdvance()`，保证自然/点击复用同一 transition 语义；旧 layer 不可见但仍收到 end/update，完成和 destroy 后无残留。
5. **补全 scheduler 与 formatter 回归**
   - 测试两个排队 `play` 分别使用不同 formatter/scale，第二个在首项完成前不调用 formatter，激活后不继承首项配置。
   - 覆盖 `amountDurationScale` 默认值、数学 parity、最终 exact amount/tier、formatter result 校验、手动 text override、immediate dismiss、队列继续与 runtime destroy reject。
6. **文档、规则与收尾**
   - 更新 RenderCore README、Popup manifest runtime 说明和 Crave 迁移示例，展示必填 `formatMoney` 与 `amountDurationScale: 0.8`，明确 formatter 接收 raw amount。
   - 最小更新 shared runtime 稳定规则，记录 per-play formatter ownership、amount-only time scale 和数字跨档不等动画。
   - 运行 L2 定向验收，生成 UTC 中文执行报告并检查最终 diff。

## 8. 测试与验收

### 测试原则

- pure motion 测试固定时间等比关系：对相同输入，scale `0.8` 在 `0.8t` 的 amount/tier/phase 应等于 scale `1` 在 `t` 的结果，并保持 terminal brake exact final。
- 不只断言总完成时间；必须分别证明 rate/acceleration/duration 缩放、threshold 不变、frame slicing parity 和非法 scale 失败。
- formatter 测试使用可辨识前缀，断言每个排队请求的调用次数与文本；不只验证最后一次 formatter。
- 跨档测试同时观察 old/new container visibility、active tier/amount、old layer end/update/drain/destroy，防止只改 snapshot 却留下可见画面。
- 不为保留旧 `play` 缺 formatter 的编译期用法而把新必填合同改为静默 fallback；仓库测试和迁移文档应更新。

### 验收级别

`L2`。任务修改 `@slotclientengine/rendercore` 导出的 `SceneLayoutPackageRuntime` public method 输入，`@slotclientengine/gameframeworks` 直接重导出该类型，且外部 Crave 是明确 consumer。不改 schema、生成器、资源、依赖或 lockfile，因此 RenderCore 定向测试/typecheck 加直接 facade typecheck 足够，不升级整仓 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/award-amount-motion.test.ts tests/popup/award-player.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime.test.ts -t "starts, advances and clears the popup bound to the current mode"
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm exec prettier --check packages/rendercore/src/popup/core/types.ts packages/rendercore/src/popup/award-player.ts packages/rendercore/src/popup/award-amount-motion.ts packages/rendercore/src/scene-layout/types.ts packages/rendercore/src/scene-layout/package-runtime.ts packages/rendercore/tests/popup/award-amount-motion.test.ts packages/rendercore/tests/popup/award-player.test.ts packages/rendercore/tests/scene-layout/package-runtime.test.ts packages/rendercore/README.md docs/popup-manifest.md docs/crave-task203-manual-migration.md docs/agent-rules/shared-game-runtime.md tasks/262-rendercore-award-popup-runtime-play-options*.md
git diff --check
```

若 Scene Layout 新回归采用独立测试名，将第二条的 `-t` 替换为包含新用例的精确 regex；不因目标用例命名变化运行已知含无关 reel 基线的整文件扩展扫描。失败时先缩小到单一 scale/formatter/queue/transition case，不立即运行根级 test/build。

### 人工验收

- Popup/Scene Layout 真实预览中对同一高额获奖分别用 scale `1` 和 `0.8`，确认数字跨档和最终减速整体加快，而 VNI/Spine 本身速度、end 和粒子 drain 不变。
- 使用明显长于缩放后数字档时长的庆祝动画，确认数字自然到 threshold 时旧档当帧消失、新档立即显示，无旧档叠在背后。
- 连续播放两次，分别传入不同货币符号/小数位 formatter，确认首次 end 和第二次 start 之间无格式串值，控制台无新错误。

### 独立验收建议

`建议`。不涉及 credential、服务器轮带、schema、ZIP 或 release，但涉及跨 package public contract、FIFO 每请求函数隔离和隐藏后异步 end/destroy。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/award-amount-motion.test.ts tests/popup/award-player.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime.test.ts -t "starts, advances and clears the popup bound to the current mode"
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell 未加载 Node 时执行 `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试原命令。
- 本任务不新增依赖、不修改 package manifest 或 lockfile；时间缩放只使用 TypeScript/JavaScript 数学能力。

## 10. 生成物、文档与规则

- 本任务不修改 YAML/schema，不产生生成文件，不运行 generator，不手改 `dist/`。
- `packages/rendercore/README.md` 和 `docs/popup-manifest.md` 记录 runtime-only `amountDurationScale`、不缩放美术动画、跨档当帧可见性与 per-play formatter 优先级。
- `docs/crave-task203-manual-migration.md` 的两个 `playAwardCelebrationForCurrentMode()` 示例必须增加 `formatMoney`，并给出 `amountDurationScale: 0.8` 的可选用法；不替 Crave 猜测具体 locale 或币种。
- 最小更新 `docs/agent-rules/shared-game-runtime.md` 的 Presentation 稳定合同。`editor-artifacts.md` 已规定 Editor 复用 Core，职责未变，不重复追加任务级参数。
- 不修改根 `AGENTS.md`。精确缩放公式由 pure helper/测试保存，执行证据只进入任务报告。

## 11. 执行报告

执行完成后创建：

```text
tasks/262-rendercore-award-popup-runtime-play-options-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 API/type 名称、缩放公式、实际修改文件、关键决策或偏差、自动验收结果、未完成人工验收和剩余风险；不收集无关 coverage、完整历史矩阵、整仓统计或 profiler。

## 12. 风险、假设与待确认

### 风险

- 任务 259 的后续档位为保持跨档加速，effective canonical duration 可短于 manifest duration；scale 必须应用到已构造的整条时间轴，不能只乘某一档 `countDurationSeconds` 而破坏边界速度连续性。
- terminal brake 有最小可见时长 tuning；若先缩放配置再重算 min，`0.8` 可能无法等比加快尾段。应先构造基准 brake 再缩放其时间坐标。
- formatter 是可变外部行为；排队必须捕获函数 identity，缓存 player 必须在完成/失败后释放 active reference，否则会产生跨币种串值或不必要的闭包持有。
- 旧档隐藏但继续 end/drain 意味着同一时刻可有多个内部 runtime 被 update；测试必须区分“不可见”和“已立即销毁”，不为了视觉结果破坏 official cleanup。
- `playAwardCelebrationForCurrentMode()` 的 formatter 从可选 factory 级改为每次必填，外部 consumer 需要源码迁移；仓库只能更新已知 Crave 迁移文档，不能以本地 typecheck 代替外部仓验收。

### 假设

- `amountDurationScale` 为可选 per-play 参数，默认 `1`；它表示 duration multiplier，因此小于 `1` 加快，不采用小于 `1` 反而减速的 playback-rate 语义。
- `formatMoney` 的 number 入参就是现有 `amountRaw`，不在 RenderCore 内先除以 raw scale；这与现有 `PopupAmountFormatter` 和 `betAmountRaw/winAmountRaw` 合同一致。
- 用户说“现在点击的效果应该是对的”意味着应复用现有点击的当帧隐藏 + official hidden drain，而不是改为跳档时强制 destroy 动画。

### 待确认

无。上述参数语义可由用户的 `0.8` 示例、任务 259 现有 amount motion、`PopupAmountFormatter` 的 raw amount 合同和当前点击跨档实现形成可执行计划。

## 13. 完成清单

- [ ] per-play `formatMoney` 和 `amountDurationScale` public contract 完成，默认/非法输入语义明确。
- [ ] scale `0.8` 保持同一 amount curve/threshold/final，并将计数与 terminal brake 时间缩短为 `80%`。
- [ ] 自然/点击跨档都当帧隐藏旧档，不等动画，隐藏后 end/drain/destroy 完整收敛。
- [ ] 不同排队播放的 formatter/scale 不串值，legacy start/programmatic 默认行为不回归。
- [ ] 任务 259 起跳、加速、减速、点击和 auto-dismiss 合同保持。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、schema、职责和资源生命周期符合计划。
- [ ] 指定 L2 自动验收通过，自动化与真实视觉验收已明确区分。
- [ ] README、Popup 文档、Crave 迁移示例、领域规则和 UTC 中文执行报告已同步。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md`、`docs/agent-rules/shared-game-runtime.md` 和本计划。
2. 核对 Git 基线、工作区与任务 259 当前实现，保留用户无关修改。
3. 按计划实现，不重新制定另一套时间系数、formatter ownership 或跨档方案。
4. 小幅适配当前实现时在报告记录；需改 schema、app、资源或重大 public 范围时先停止说明。
5. 只运行本计划规定的 L2 验收，失败先最小化复现，不自动扩为整仓扫描。
6. 完成后生成 UTC 中文执行报告，区分已通过自动化与待人工验收项。
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
