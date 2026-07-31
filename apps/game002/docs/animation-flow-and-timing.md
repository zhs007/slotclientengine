# game002 动画流程与时长

本文记录 game002 当前实际使用的动画状态切换、业务时序、排序规则和配置来源。最后更新：2026-07-28。

本文是便于策划、美术和开发查阅的汇总，不替代代码与 manifest。数值冲突时按下列优先级确认：

1. active skin manifest：唯一支持的 skin2 从 `assets/crave` mapped scene-layout
   package 取得 layout/background/geometry/symbol/ImgNumber/popup。Nearwin
   timing/effect 继续使用显式的
   `assets/game002-s3/reel.manifest.json` presentation extension。
2. `apps/game002/src/*-config.ts` 中的 game002 业务 timing。
3. Spine/VNI 资源自身的真实 animation duration。
4. 本文档。

修改前三级内容后，必须同步本文、相关 source contract、单元测试和 `release:check`。

## 总流程

```text
initial spin
  -> settled multiplier transform（若存在）
  -> 按 result 分组播放 emphasis / opening win
  -> 按稳定顺序 remove 或 CN collect
  -> 有 cascade 时：
       非期待：unified fall
       已期待：existing-only dropdown -> Nearwin2 sweep -> selective refill spin
  -> refill settled multiplier transform（若存在）
  -> 重复 win/remove/cascade
  -> global win-amount
  -> awaiting-dismiss / 下一次 spin 清理
```

期待状态在本轮 initial spin、win、remove、cascade、refill 和 global win-amount 之间保持；下一次合法 initial spin 真正开始时清除。

## 时间单位和完成边界

- manifest 的 reel timing 使用毫秒。
- game002 TypeScript presentation config 使用秒。
- `once` Spine 动画不以业务 timer 伪造完成，必须收到官方 runtime 的真实 completion。
- Nearwin loop 必须收到真实 loop boundary 后才允许对应格落地。
- 表格中的“资源时长”来自当前资源；美术替换 JSON 后，应重新核对官方 parser 读到的实际值。

## Initial spin

配置来源：[`reel.manifest.json`](../../../assets/game002-s3/reel.manifest.json)、[`game-layout.ts`](../src/game-layout.ts)。

### 普通模式

| 项目           |         当前值 | 说明                                 |
| -------------- | -------------: | ------------------------------------ |
| 格子启动间隔   |         `16ms` | `spin.timing.startStepMs`            |
| 格子停轴间隔   |         `16ms` | `spin.timing.stopStepMs`             |
| 最后启动后等待 |        `180ms` | `spin.timing.settleAfterLastStartMs` |
| 最小滚动圈数   |            `6` | 本地公开轮带                         |
| 滚动速度       | `54 symbols/s` | 每个 grid-cell reel                  |
| 回弹力度       |            `0` | 完全不回弹                           |
| Nearwin        |             无 | 普通 initial spin 不播 Nearwin       |
| 压暗淡入       |         `80ms` | 滚动 occurrence 黑层与灰阶 tint 同步 |
| 压暗淡出       |        `160ms` | 落地恢复                             |
| 压暗强度       |          `0.5` | 非期待时 WL/CN 全亮，其它压暗        |

54 格下当前普通停轴公式：

```text
firstStop = (54 - 1) * 16 + 180 = 1028ms
lastStop  = 1028 + (54 - 1) * 16 = 1876ms
```

### 期待触发与 Nearwin1 接力

- 第 2 个按真实 landing order 落地的 paytable exact `WL` 激活期待。
- 触发格自身不补播 Nearwin1，只有后续尚未落地的格播放。
- Nearwin1 当前 `Loop` 真实单循环约 `666.6667ms`，`loopCount=1`。
- 第一枚后续格在 activation 后约 `133.3333ms` 起播 Nearwin1，并在 activation 后约 `800ms` 落地。
- 下一格在前一格 Nearwin1 起播 `100ms` 后开始自己的 Nearwin1。
- 每格播放完自己的真实单循环后立即落地，不增加动画结束后的等待。
- 因为所有格使用相同 Nearwin1 时长，所以 effect start 与 landing 都是 `100ms` cadence。
- 期待激活边界起只有 WL 保持全亮；CN 与普通 symbol 一样按 `0.5` 压暗。

以第一个后续格 Nearwin1 起播为 `t=0`：

| 格序号 | Nearwin1 起播 |         落地 |
| -----: | ------------: | -----------: |
|      1 |         `0ms` | `666.6667ms` |
|      2 |       `100ms` | `766.6667ms` |
|      3 |       `200ms` | `866.6667ms` |

## Symbol 落地 appear

配置来源：`assets/crave` active Symbols package manifest。

- manifest 配置 `appear` 的 symbol 在逐格 reel landing 时播放一次真实 `Start`。
- `Start` 完成后回到同一个 symbol 的 normal：多数 symbol 为 `Idle`，CO 和 CN tier 为 `Loop`。
- 当前除 BN 外的主 display symbol 都有 `Start`；BN 没有 `Start`，因此不伪造 appear。
- 整轮完成边界会等待已经开始的 appear 完成。
- 非期待 unified fall 不走 spin/appear；期待 selective refill 的新 symbol 才走逐格 appear。
- `Start` 的准确时长由各 Spine JSON 自身决定，runtime 等待真实 completion，不在 app 中复制时长表。

## WL/WM/CM multiplier 与 CN 更新

每次 initial spin 或 refill 必须先等待全部 symbol 落定，再进入本节流程；本节完成前
不得启动中奖。

```text
bg-incwl（若上一中奖步有参与中奖的 WL）
  -> 更新对应 WL 为 +1
  -> WL Start once
  -> 当前 WM Mult_Start once
  -> 更新全部 WL：当前值 + 本批全部 WM multiplier 之和
  -> 当前 WM Mult_Idle 一个真实 loop
  -> 当前 WM Mult_End once
  -> 当前 WM Change once
  -> 原位置原子替换 WM -> CN
  -> 当前唯一 CM Feature1 once
  -> 当时全部 CN 同时更新 value 并播放 Feature_Change once
  -> 当前 CM Change once
  -> 原位置原子替换 CM -> CN
  -> 若 bg-win 无 result 且 bg-triggerco 命中：CO Feature + sources Feature1 once
  -> sources Feature2 once + 跨格移动
  -> 原子提交 sources -> BN、targets <- sources、CO -> selected
  -> bg-win2；正常 remove 完成边界 release bg-bn
  -> 开始现有中奖流程
```

- `bg-incwl` 的服务器数据位于中奖 step 的下一 cascade step，在 `bg-dropdown`
  后、`bg-refill` 前；客户端跨 step 关联中奖 WL，表现等该 refill 全部落定后执行。
  它先于当前 WM 生效。没有 WM 时，WL Start 完成即结束 transform。
- 没有 WL 时不要求 `bg-updwl`，但 WM 的四段动画、WM -> CN 和新 CN value 流程
  仍完整执行。
- WM 的 `Mult_Start/Mult_Idle/Mult_End/Change` 同批并行；Idle 必须跨过一个真实
  loop boundary，其余等待 once completion。
- initial/refill 的动画前 scene 优先级是
  `bg-gencm > bg-genwm > bg-spin/bg-refill`；每个落定 step 最多一个 CM。
  `bg-genco.scene` 是 WM/CM 转 CN 后、CO collection 前的终态盘面；新增 CO 在
  spin/refill 落定前 overlay，不在 multiplier transform 末尾 replacement。
- WM 阶段完整结束后才开始 CM。CM `Feature1` 完成时按 `bg-updcn` 一次更新当时
  全部 CN（含本批 WM 新转出的 CN），并行播放 `Feature_Change`；完成后才播放
  CM `Change`，其真实 once completion 边界按 `bg-cm2cn/bg-gencmcn` 提交新 CN。
- 没有 CM 时跳过全部 CM/CN 更新阶段；CM 存在但当时没有 CN 时只跳过
  `Feature_Change`，仍完整播放 CM `Feature1/Change` 与 CM -> CN。
- WL/WM/CM 数字使用唯一 multiplier ImgNumber，格式为 `xN`，exact Spine slot
  为 `Mult`。
- `bg-co.pos` 按 `-1` 分段，每段 4..8 个 source/target 四元组；同段 target
  必须落在唯一 CO 八邻域。所有 CO/source 的第一段动画并行，全部真实 once 完成
  后才开始第二段；整批 transfer 完成才 commit。

## Win、压暗和 remove

配置来源：[`cascade-config.ts`](../src/cascade-config.ts)、`assets/crave` active
Symbols package manifest。

| 阶段             |    时长 | 行为                                       |
| ---------------- | ------: | ------------------------------------------ |
| 渐暗             |  `0.1s` | 同一边界启动全部中奖 symbol 的 opening win |
| 保持             |    `1s` | 非中奖格保持 `0.5` 压暗                    |
| 渐亮             |  `0.1s` | 恢复非中奖格                               |
| 强调总时长       |  `1.2s` | `0.1 + 1 + 0.1`                            |
| summary 单次计数 | `0.35s` | 普通组现金加入临时汇总                     |

普通 symbol/WL 的切换：

```text
normal -> win once（压暗开始时已启动）
       -> 等真实 win completion
       -> remove/End once
       -> release
```

- opening win 不会在强调结束后重播。
- WL 参与中奖高亮和 win，但 game002 明确声明 WL 不 remove、不 drop；完成后回 normal。
- Win、End、Start 的准确时长来自对应 Spine 资源，runtime 使用真实 completion。
- result group 按 manifest `order` 排序：普通 symbol/WL 为 `order=0`，CN 为 `order=1`；同 order 保留服务端相对顺序。
- 单组 symbol win carousel 的组间 pause 为 `1s`，配置在 [`win-symbol-carousel-config.ts`](../src/win-symbol-carousel-config.ts)。

## CN coin 中奖与收集

业务 cadence 来源：[`cascade-win-summary-config.ts`](../src/cascade-win-summary-config.ts)。
状态映射来源：`assets/crave` active Symbols package manifest。

整体状态：

```text
全部中奖 CN：Win_Start once -> Win loop
逐枚 CN：     Win loop --立即中断--> Collect once -> End once -> release
```

当前固定规则：

| 项目                          |                当前值 |
| ----------------------------- | --------------------: |
| Collect 排序                  | `y` 升序，再 `x` 升序 |
| 相邻 Collect 起播间隔         |                `0.3s` |
| Collect 资源时长              |          `0.3333333s` |
| End 资源时长                  |                `0.5s` |
| 单枚从 Collect 起播到 release |       约 `0.8333333s` |

第 `i` 枚 CN（从 `i=0` 开始）的相对时间：

```text
CollectStart(i) = i * 0.3s
CollectEnd(i)   = i * 0.3s + 0.3333333s
Release(i)      = i * 0.3s + 0.8333333s
```

这意味着下一枚会在上一枚 Collect 结束前约 `0.0333333s` 起播，后续 End 也会明显重叠。cadence 不等待前一枚 Collect、End 或 release；但每枚自身仍严格执行 `Collect once -> End once -> release`。全部 active item 和 summary 完成后 coin group 才结束。

其它 CN 规则：

- 全部 CN 同时播放 `Win_Start`，完成后进入 `Win` loop。
- cadence 边界立即中断当前实例的 Win loop，不等待下一个 loop boundary。
- 当前 occurrence 的 raw coin value 决定逐枚 summary 分配；所有 item coin 总和必须精确等于 result coin amount。
- 参与 CN 判定的 WL companion 与全部 CN `Win_Start` 同时播放自身 win，之后回 normal；WL 不进入 Collect/End，也不贡献 item value。
- 四档 CN tier 共用上述状态名和 timing 合同，数字图片始终绑定同一 player 的 `Num` slot。

## Cascade 下落与 refill

下落配置来源：[`cascade-config.ts`](../src/cascade-config.ts)。期待 refill 配置来源：[`reel.manifest.json`](../../../assets/game002-s3/reel.manifest.json)。

### 非期待 unified fall

dropdown survivor 与 refill 新 symbol 合并为一次 fall，不进入逐格 spin/appear。

| 项目                   |      当前值 |
| ---------------------- | ----------: |
| 列启动错峰             |    `0.045s` |
| 同列 movement 启动错峰 |    `0.018s` |
| 基础下落               |     `0.11s` |
| 每行追加               |     `0.04s` |
| 最大下落               |     `0.36s` |
| settle                 |     `0.09s` |
| overshoot              | `0.16 cell` |

单个 movement 的 fall duration 由移动行数计算并封顶到 `0.36s`；最终还要完成 `0.09s` settle。

### 已期待 refill

固定流程：

```text
existing-only dropdown
  -> Nearwin2 refill-hole sweep
  -> selective refill spin + Nearwin1
  -> 新 symbol appear
```

Nearwin2 sweep：

| 项目     |                    当前值 |
| -------- | ------------------------: |
| 顺序     | `y desc`，同 y 下 `x asc` |
| 起播间隔 |                    `80ms` |
| 单格循环 |     约 `400ms`，真实 1 次 |

Selective refill spin：

| 项目                     |                                   当前值 |
| ------------------------ | ---------------------------------------: |
| reel 启动传播            |               最左下 hole 起，向右上传导 |
| 同一 start wave          |                                 同时启动 |
| start wave step          |                                   `16ms` |
| 最后 start 后 settle     |                                  `800ms` |
| Nearwin1/landing cadence |                                  `100ms` |
| Nearwin1                 | 约 `666.6667ms`，真实 1 次，播完立即落地 |
| 最小滚动圈数             |                                      `6` |
| 滚动速度                 |                           `54 symbols/s` |
| 高亮                     |                               仅 WL 全亮 |

survivor 不重新 spin/appear。非期待 unified refill 新增 WL 使盘面第一次达到 2 个 WL 时，在该 fall 完成边界激活期待；已经完成的当前 refill 不倒放 Nearwin，下一 cascade 立即使用期待路径。

## Global win-amount

配置来源：[`win-amount-config.ts`](../src/win-amount-config.ts)、[`win-amount.manifest.json`](../../../assets/game002-s3/win-amount/win-amount.manifest.json)。

| 档位  | 条件         | 金额计数时长 | VNI segmented timing                           |
| ----- | ------------ | -----------: | ---------------------------------------------- |
| minor | `< 15x bet`  |       `1.5s` | 无 tier VNI                                    |
| big   | `>= 15x bet` |         `3s` | `0..1s` start，`1..2.5s` loop，`2.5..2.9s` end |
| super | `>= 30x bet` |         `3s` | 同上                                           |
| mega  | `>= 50x bet` |         `3s` | 同上                                           |

- win-amount 只在全部 cascade step 完成后开始。
- 播放期间 main reel runtime 继续逐帧更新，CN/其它 symbol normal Loop 不冻结。
- 进入 `awaiting-dismiss` 后不再阻塞 `playSpin()`。
- 点击只调用 advance：跳金额、进下一档或播放最终 dismiss；下一次 spin 会清理遗留展示。

## Background

配置来源：[`background.manifest.json`](../../../assets/game002-s3/background.manifest.json)。

```text
BaseGame: BG loop
FreeGame: FG loop
BaseGame -> FreeGame: BG_FG once -> FG loop
FreeGame -> BaseGame: FG_BG once -> BG loop
```

普通局初始化并持续播放 BaseGame。`bg-triggerfg` 的 WL win once 完成后才请求
`BG_FG`；FreeGame 最终 CN collect 与 BigWin popup 完整完成后才请求 `FG_BG`。
两次切换都保留同一个 reel scene。状态 loop 和 transition 的时长由 Layout
transition 资源的真实 Spine completion/event 决定，不在 app 中硬编码。

FreeGame 单步固定为：

```text
selective spin（仅非 WL/CN）
-> AF Feature -> AF Change -> AF 变 CN（如有）
-> CO Feature + source Feature1
-> source Feature2 + transfer -> source 变 BN、CO 变 CN（如有）
-> 下一次 spin
```

只有最后一步播放 `fg-win` CN collect；该 collect 不 remove symbol。

## 调整时的检查清单

1. cadence、等待或顺序是否应该属于 reel manifest、symbol manifest，还是 game002 TypeScript config。
2. once 动画是否仍等待真实 completion，不能用相近 timer 提前结束。
3. initial spin 与 selective refill 是否需要同步修改。
4. 是否更新 source contract、单元测试、README、本文和任务报告。
5. 运行 game002 test、format、lint、typecheck、`release:check`。
6. 最后由浏览器覆盖普通局、期待 initial、期待 refill、多枚 CN overlap、resize 和 console/WebSocket。
