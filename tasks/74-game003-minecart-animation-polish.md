# game003 minecart animation polish 任务计划

## 1. 任务目标

本任务优化 `apps/game003` 当前矿车互动和中奖金额动画的体验问题：

- 矿车完成互动后不要在中间原地消失；本轮互动结束时应停在主转轮下方中间并保持可见。
- 下一次 spin 开始时，如果上一轮有停在中间的矿车，矿车应从中间飞快继续向右冲出屏幕，再进入本轮正常流程。
- 中奖金额动画不再要求玩家点击关闭；它可以在中奖展示完成后留在屏幕上，下一次 spin 开始时自动关闭。
- 从矿车里飞出的 feature symbol 动画要更慢一些，到达主转轮中心后要明显停留一小段时间再消失。
- feature symbol 在矿车上的装载位置要更靠车厢中间，不能继续偏在当前较靠上的位置。

本计划必须能独立落地，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/74-game003-minecart-animation-polish-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/74-game003-minecart-animation-polish-260703-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/minecart2
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。若确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game003 test
CI=true pnpm --filter @slotclientengine/rendercore test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。缺少配置字段、未知配置字段、矿车图片尺寸漂移、动画阶段非法跳转、上一轮矿车冲出尚未完成就开始新矿车入场、生成物不同步、`bg-bar` 数据非法，都必须尽早抛错，不要用默认坐标、静默隐藏、自动跳过或拉长转轮时间掩盖问题。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

当前关键文件：

```text
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/game-adapter.ts
apps/game003/src/minecart-interaction-config.ts
apps/game003/src/minecart-interaction-layout.ts
apps/game003/src/minecart-interaction-runtime.ts
apps/game003/src/win-amount-config.ts
apps/game003/src/bg-bar-runtime.ts
assets/game003-s1/bg-bar-symbol-state-textures.manifest.json
packages/rendercore/src/win-amount/types.ts
packages/rendercore/src/win-amount/win-amount-player.ts
packages/rendercore/src/win-amount/index.ts
packages/rendercore/README.md
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/bg-bar-runtime.test.ts
apps/game003/tests/minecart-interaction-config.test.ts
apps/game003/tests/minecart-interaction-layout.test.ts
apps/game003/tests/minecart-interaction-runtime.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/README.md
agents.md
```

当前矿车实现：

- `apps/game003/src/minecart-interaction-runtime.ts` 只有 `idle | cart-rush | symbol-fly | destroyed` 阶段。
- `symbol-fly` 完成后 runtime 回到 `idle`，payload 隐藏，但矿车没有稳定的 `parked` 阶段。
- `reset()` 会清掉 payload、把 phase 设为 `idle`、把矿车 `visible=false`。
- `apps/game003/src/game-adapter.ts` 在每次 `playSpin()` 开始时调用 `this.#requireMinecartRuntime().reset()`，这会导致上一轮停在中间的矿车在下一次 spin 开始前原地消失。
- 当前矿车入场起点从 `visibleRect` 外推导，停点来自 `stopOffsetFromReelAreaBottomCenter`。
- 当前 `payloadAnchorInImage` 为 `{ x: 184.5, y: 92 }`，`minecart.png` 尺寸为 `369 x 252`。图片几何中心 y 为 `126`，因此当前 payload 明显偏上。

当前时间配置：

```text
bg-bar shift:                 0.28s
bg-bar terminal win:          0.24s
cart rush + brake settle:     0.38s
payload fly + fade:           0.36s
total before reel stop:       1.26s
main reel baseDurationMs:     1300ms
```

当前中奖金额动画实现：

- `packages/rendercore/src/win-amount/win-amount-player.ts` 的 `requestDismiss()` 已经是 public API。
- 金额动画完成计数后会进入 `awaiting-dismiss`，此时 `isPlaying()` 仍为 `true`。
- `apps/game003/src/game-adapter.ts` 当前只在 canvas `pointerdown` 时调用 `requestDismiss()`。
- `playSpin()` 当前通过 `this.#requireWinAmountPlayer().isPlaying()` 判断是否还能 resolve，因此有中奖金额动画时会等待玩家点击关闭。

## 4. 边界和非目标

- 矿车互动仍然属于 `apps/game003` app 层，不上移到 `packages/rendercore`、`packages/logiccore` 或 `packages/gameframeworks`。
- shared 包只能继续透传通用 `appExtensions`，不能硬编码 `minecart`、轨道、刹车、payload、`game003MinecartInteraction`、`bg-bar`、`wild` 或 `up` 语义。
- `packages/rendercore` 可以为中奖金额动画新增通用 public API，但 `apps/game003` 不能直接操作 rendercore 的私有 Pixi display tree、私有字段或内部 stage。
- 不改 live server、`gamecode`、URL query 合同、服务器协议、`FeatureBar2Data` 数据形状或本地公开轮带边界。
- 不通过延长主转轮 `baseDurationMs`、`speedSymbolsPerSecond`、`minimumSpinCycles`、`startDelayMs` 或 `stopDelayMs` 掩盖动画节奏问题。
- 不新增透明 PNG；`normal` 继续使用 `bg-bar-symbol-state-textures.manifest.json` 中的透明 symbol。
- `bg-bar` 终点 feature 为 `normal` 时仍然不启动矿车入场、不播放透明空载矿车；但如果上一轮矿车处于 parked 状态，下一次 spin 开始时仍应执行矿车向右冲出屏幕。

## 5. 实现方案

### 5.1 矿车状态机改造

在 `apps/game003/src/minecart-interaction-runtime.ts` 中把矿车状态机扩展为：

```text
idle
cart-rush
symbol-fly
symbol-hold
parked
cart-exit
destroyed
```

要求：

- `cart-rush`：矿车从当前入场侧冲入并刹车到 `cartStopCenter`。
- `symbol-fly`：payload 从矿车车厢中心飞到主转轮可见区中心，飞行阶段不要线性衰减到完全透明；到达时必须仍然可见。
- `symbol-hold`：payload 停在 `payloadTargetCenter`，保持可见一小段时间；进入 `parked` 前不能提前隐藏。
- `parked`：payload 清掉或隐藏，矿车保持在 `cartStopCenter` 可见，`isPlaying()` 返回 `false`，表示本轮互动已完成但矿车停在中间。
- `cart-exit`：下一次 spin 开始时，从 `cartStopCenter` 快速冲向右侧屏幕外，完成后进入 `idle` 并隐藏矿车。

新增或调整 runtime public API：

```ts
start(feature: Game003BgBarFeature): void;
startExitIfParked(): boolean;
clearParkedCart(): void; // 仅用于显式清理、destroy 或测试，不在 playSpin 开始时静默调用。
isPlaying(): boolean;
getSnapshot(): Game003MinecartInteractionSnapshot;
```

执行者可保留 `reset()`，但必须改变调用语义：`playSpin()` 开始时不能再用 `reset()` 隐藏 parked 矿车。如果保留 `reset()`，它只能作为显式重置/销毁用途，并在测试中覆盖“不要在普通 spin 开始时调用 reset 隐藏矿车”。

`getSnapshot()` 需要暴露足够信息供测试断言：

```ts
phase: "idle" | "cart-rush" | "symbol-fly" | "symbol-hold" | "parked" | "cart-exit" | "destroyed";
cartVisible: boolean;
payloadVisible: boolean;
payloadAlpha: number | null;
cartPosition: Point;
payloadPosition: Point | null;
```

payload 透明度要求：

- `symbol-fly` 过程中默认保持 `fadeStartAlpha` 或只做非常轻微的透明度变化，不能在到达中心前接近 `fadeEndAlpha`。
- `symbol-hold` 阶段保持可见，alpha 不低于 `fadeStartAlpha * 0.9`。
- `symbol-hold` 完成进入 `parked` 时才隐藏 payload，并把 alpha 设为 `fadeEndAlpha`。

非法状态必须显式失败：

- `start("normal")` 继续抛错。
- `start(feature)` 在 `cart-exit`、`cart-rush`、`symbol-fly` 或 `symbol-hold` 中被调用时抛错。
- `startExitIfParked()` 在 `cart-rush`、`symbol-fly` 或 `symbol-hold` 中被调用时抛错。
- `update()` 遇到非法 delta 继续抛错。

### 5.2 布局与 YAML 配置

在 `apps/game003/config/game-static.yaml` 的 `skins."1".appExtensions.game003MinecartInteraction` 中调整或新增字段。

目标落地值：

```yaml
timing:
  cartExitDurationSeconds: 0.18
  cartRushDurationSeconds: 0.26
  symbolFlyDurationSeconds: 0.43
  symbolHoldDurationSeconds: 0.12
  maxTotalBeforeReelStopSeconds: 1.3
payload:
  symbolScale: 0.72
  fadeStartAlpha: 1
  fadeEndAlpha: 0
layout:
  landscape:
    entrySide: left
    exitSide: right
    offscreenMargin: 120
    stopOffsetFromReelAreaBottomCenter: { x: 0, y: 85 }
    cartPivotInImage: { x: 184.5, y: 220 }
    payloadAnchorInImage: { x: 184.5, y: 126 }
  portrait:
    entrySide: left
    exitSide: right
    offscreenMargin: 120
    stopOffsetFromReelAreaBottomCenter: { x: 0, y: 145 }
    cartPivotInImage: { x: 184.5, y: 220 }
    payloadAnchorInImage: { x: 184.5, y: 126 }
```

说明：

- `payloadAnchorInImage.y` 从 `92` 调到 `126`，表示 payload 更靠近 `minecart.png` 的图片中心。实际浏览器校准后允许微调，但最终值必须写回 YAML、生成物、测试和任务报告。
- `exitSide` 必须显式为 `right`，不要在 runtime 里用隐式默认值。
- `cartExitDurationSeconds` 是下一次 spin 开始时的冲出时间，不计入上一轮矿车入场的 `maxTotalBeforeReelStopSeconds`。
- `symbolHoldDurationSeconds` 必须计入本轮入场互动总时长。
- `apps/game003/src/minecart-interaction-config.ts` 的 `Game003MinecartLayoutConfig` 和解析器需要新增 `exitSide` 字段，`assertKeys(...)` 必须同步更新，未知字段仍显式失败。
- `apps/game003/src/minecart-interaction-layout.ts` 的 `Game003MinecartInteractionLayout` 需要新增 `cartExitCenter`。它应根据当前 `visibleRect`、`imageSize`、`cartPivotInImage`、`offscreenMargin` 和 `exitSide` 推导；本任务第一版 `exitSide` 固定校验为 `right`，但 helper 可以保持通用左右两侧计算。
- 为了给 payload 更慢飞行和停留留出预算，需要把 `assets/game003-s1/bg-bar-symbol-state-textures.manifest.json` 中 `normal/wild/up` 的 `win.durationSeconds` 从当前 `0.24` 调整到目标 `0.20`，并同步 `apps/game003/src/bg-bar-runtime.ts` 的 `GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS`。
- `GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS` 和 manifest 中三个 feature 的 `win.durationSeconds` 必须保持一致；不能只改常量或只改 manifest。
- 同步更新 `apps/game003/tests/bg-bar-runtime.test.ts` 和 `apps/game003/tests/static-config.test.ts` 中对 terminal win 时长的断言。
- 本轮入场互动总时长计算应改成：

```text
bg-bar shift
+ bg-bar terminal win
+ cartRushDurationSeconds
+ symbolFlyDurationSeconds
+ symbolHoldDurationSeconds
```

按目标落地值，总时长为：

```text
0.28 + 0.20 + 0.26 + 0.43 + 0.12 = 1.29s
```

这组数值满足当前 `1.3s` 硬约束，并且比旧 `0.36s` payload fly 明显更慢，同时提供 `0.12s` 的终点停留。实施时仍必须在浏览器中做一次真实校准；如果最终视觉微调了数值，提交值必须继续满足：

```text
totalBeforeReelStop < DEFAULT_GAME003_REEL_CONFIG.baseDurationMs / 1000
totalBeforeReelStop <= maxTotalBeforeReelStopSeconds
maxTotalBeforeReelStopSeconds <= 1.3
```

可接受的落地策略：

- 优先保留 `symbolFlyDurationSeconds` 和 `symbolHoldDurationSeconds` 的体验提升。
- 必要时在 `cartRushDurationSeconds`、`bg-bar` terminal win 时长和 `symbolHoldDurationSeconds` 之间微调，但不能让矿车刹车动作变成瞬移，也不能让 payload 到达后马上消失。
- 不能延长主转轮 timing 来换预算。
- 最终时间值必须在 `apps/game003/tests/minecart-interaction-config.test.ts` 和任务报告中写清楚。

如果视觉上确实无法在 `1.3s` 内同时满足“飞得更慢”和“停一会儿”，任务应显式阻断并报告这个冲突，不要偷偷放宽主转轮时间。

修改 YAML 后必须重新生成：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

生成文件禁止手改：

```text
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

### 5.3 中奖金额动画关闭语义

目标语义：

- 当前 spin 的中奖金额动画完成主要播放后，不再因为等待手动点击关闭而阻塞 `playSpin()` resolve。
- 金额动画可以保持在 `awaiting-dismiss` 可见状态。
- 下一次 `playSpin()` 开始时，自动关闭上一轮仍可见的金额动画。
- canvas 点击关闭可以保留为额外入口，但不能再是继续下一轮的必要条件。

推荐实现：

1. 在 `packages/rendercore/src/win-amount/types.ts` 为 `WinAmountAnimationPlayer` 增加一个通用 public API，例如：

```ts
dismissImmediately(): void;
```

2. 在 `packages/rendercore/src/win-amount/win-amount-player.ts` 中实现为 public wrapper，调用现有私有 `completeAndHide()`。`packages/rendercore/src/win-amount/index.ts` 当前通过 `export * from "./types.js"` 导出类型，实施时必须确认新 API 从 `@slotclientengine/rendercore/win-amount` 子路径可见；如果导出结构变化，必须同步修改 index。

该 API 必须：

- 对 `idle` / `complete` 幂等。
- 对 `minor-counting` / `major-counting` / `tier-counting` / `awaiting-dismiss` / `dismissing` 都立即清空文字和 tier effect。
- 不能破坏现有 `requestDismiss()` 的点击渐隐语义。

3. 同步更新 `packages/rendercore/README.md` 的 Win Amount Animation 文档，说明 `requestDismiss()` 仍是渐隐关闭，`dismissImmediately()` 用于调用方在开始下一轮前立即清理上一轮展示。

4. 在 `apps/game003/src/game-adapter.ts` 的 `playSpin()` 开始处，在新一轮 reels 和 `bg-bar` 启动前调用：

```ts
this.#requireWinAmountPlayer().dismissImmediately();
```

5. 修改 adapter 对当前中奖金额动画完成的判断。不要再用 `isPlaying()` 作为唯一阻塞条件。应跟踪 `update()` 返回的 phase：

- `minor-counting`、`major-counting`、`tier-counting` 仍然阻塞当前 `playSpin()`。
- `awaiting-dismiss` 视为当前中奖金额主要播放已完成，不阻塞 resolve。
- `dismissing`、`complete`、`idle` 不阻塞 resolve。

建议在 `apps/game003/src/game-adapter.ts` 内新增小 helper，例如：

```ts
function isWinAmountBlockingSpin(phase: WinAmountAnimationPhase): boolean {
  return (
    phase === "minor-counting" ||
    phase === "major-counting" ||
    phase === "tier-counting"
  );
}
```

6. 由于 `playSpin()` 在 `awaiting-dismiss` 后会 resolve，`#onTick` 不能在 `#pendingAnimation === null` 时完全停止处理 win amount。必须让 lingering win amount 在无 pending 时仍随 ticker 调用 `update(deltaSeconds)`，直到玩家点击 `requestDismiss()` 或下一次 spin 调用 `dismissImmediately()`。否则 big/super/mega tier 进入 `awaiting-dismiss` 后会停在最后一帧或粒子不继续推进。

如果执行者选择不新增 `dismissImmediately()`，必须证明 `requestDismiss()` 在所有金额动画 phase 下都能在下一次 spin 启动前同步隐藏，并用 rendercore 测试覆盖；否则不能用 `requestDismiss()` 作为隐藏兜底。

### 5.4 Adapter 编排

在 `apps/game003/src/game-adapter.ts` 中调整 `playSpin()` 和 tick 流程。

当前不允许保留的行为：

```ts
this.#requireMinecartRuntime().reset();
```

新的 `playSpin()` 开始流程应为：

1. 如果已有 `#pendingAnimation`，继续显式失败。
2. 先解析并校验本轮 `targetScene`、`winQueue`、`bgBarPlan`、`minecartReturnExpected`、下注金额和中奖金额；这些校验必须在关闭上一轮金额动画或启动矿车出屏前完成，避免本轮输入非法时先破坏上一轮画面。
3. 自动关闭上一轮中奖金额动画。
4. 如果上一轮矿车处于 `parked`，调用 `startExitIfParked()`，记录本轮 `minecartExitStarted=true`；没有 parked 矿车时记录 `false`。
5. 启动主转轮 `runtime.spinToScene(...)`。
6. 创建并启动本轮 `bg-bar` plan。
7. 创建 `PendingAnimation`，记录：

```ts
minecartExitStarted: boolean;
minecartReturnExpected: boolean; // bgBarPlan exists 且 terminal feature 非 normal
minecartReturnStarted: boolean;
winAmountPlaybackComplete: boolean;
lastWinAmountPhase?: WinAmountAnimationPhase;
```

tick 要求：

- `#onTick` 需要分成两层：先规范化 delta 并在 try/catch 中处理 pending spin；如果没有 pending，但 win amount player 仍处于 `awaiting-dismiss` / `dismissing` 等 playing 状态，也要继续调用 `update(deltaSeconds)`。lingering win amount 更新出错时仍应停 ticker 并抛出明确错误。
- 只要 `minecartExitStarted` 或 `minecartReturnStarted` 为 true，就必须 tick minecart runtime。
- 如果 `bg-bar` terminal event 到来时 `minecartRuntime.isPlaying()` 仍为 true，说明前一辆矿车还没冲出屏幕，必须显式失败，不要悄悄抢占或隐藏。
- `completePendingIfReady()` 必须等待：
  - 主转轮完成。
  - `bg-bar` 完成。
  - 如果本轮启动了矿车出屏，出屏完成。
  - 如果本轮需要非 normal 矿车入场，入场 + payload fly + hold 完成并进入 `parked`。
  - `bg-wins` 播放完成。
  - 中奖金额主要播放完成，但不等待 `awaiting-dismiss` 的手动关闭。

### 5.5 文档和协作规则同步

必须更新：

```text
apps/game003/README.md
```

需要同步说明：

- 矿车完成后会停在中间，下一次 spin 开始时向右冲出屏幕。
- `payloadAnchorInImage` 的新坐标基准和最终数值。
- `symbolFlyDurationSeconds`、`symbolHoldDurationSeconds`、`cartExitDurationSeconds` 的最终值和时间预算计算。
- 中奖金额动画不再要求点击关闭，下一次 spin 开始时自动关闭。

需要评估并通常应更新：

```text
agents.md
```

如果本任务把以下规则变成长期协作约束，必须写入 `agents.md`：

- `game003` 矿车 parked 后不能在下一次 spin 开始时 reset/hide，必须先向右冲出屏幕。
- payload fly/hold、exit timing 和 payload anchor 属于 YAML/app 扩展配置；缺失或非法时显式失败。
- 中奖金额动画不再以点击关闭作为 `playSpin()` resolve 的必要条件；下一次 spin 开始时自动关闭上一轮金额展示。

如果判断不需要更新 `agents.md`，必须在任务报告中说明理由。

## 6. 测试计划

### 6.1 game003 矿车配置测试

更新：

```text
apps/game003/tests/minecart-interaction-config.test.ts
apps/game003/tests/static-config.test.ts
```

覆盖：

- 新 timing 字段解析成功：`cartExitDurationSeconds`、`symbolFlyDurationSeconds`、`symbolHoldDurationSeconds`、`maxTotalBeforeReelStopSeconds`。
- 总入场互动时间计入 `symbolHoldDurationSeconds`，且严格不超过硬预算。
- `cartExitDurationSeconds` 必须为正数，并建议小于等于 `0.25s`。
- `exitSide` 必须存在且为 `right`。
- `payloadAnchorInImage` 必须在图片尺寸内。
- `bg-bar` manifest 的 `normal/wild/up` terminal win 时长均为最终目标值，且与 `GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS` 一致。
- 未知字段、缺字段、超预算、非法 anchor 均显式失败。

### 6.2 game003 矿车 layout 测试

更新：

```text
apps/game003/tests/minecart-interaction-layout.test.ts
```

覆盖：

- 横屏和竖屏 `cartStopCenter` 仍来自当前主转轮可见区底部中心 + YAML offset。
- `payloadStartCenter.x` 仍应接近 `payloadTargetCenter.x`，保证飞行近似垂直。
- `payloadStartCenter.y` 因 `payloadAnchorInImage.y` 下移而更靠车厢中间。
- 新增 `cartExitCenter`，其右侧边界必须在当前 `visibleRect` 右侧 `offscreenMargin` 之外。
- 横竖屏 resize 后 layout 重新计算，不复用旧 viewport 坐标。

### 6.3 game003 矿车 runtime 测试

更新：

```text
apps/game003/tests/minecart-interaction-runtime.test.ts
```

覆盖：

- `start("wild")` 后经历 `cart-rush -> symbol-fly -> symbol-hold -> parked`。
- 进入 `parked` 后 `cartVisible=true`、`payloadVisible=false`、`isPlaying()=false`。
- `symbol-fly` 过程中 payload 速度比当前实现更慢；至少在半程时仍未到达 target。
- `symbol-hold` 阶段 payload 停在 `payloadTargetCenter` 且仍可见。
- `startExitIfParked()` 从 parked 进入 `cart-exit`，向右移动到屏幕外后进入 `idle` 并隐藏矿车。
- 没有 parked 矿车时 `startExitIfParked()` 返回 `false` 且不改变状态。
- `cart-exit` 未完成时调用 `start("wild")` 显式失败。
- resize / `applyLayout()` 时，当前 phase 进度保持，但位置按新 layout 重算。

### 6.4 game003 adapter 测试

更新：

```text
apps/game003/tests/game-adapter.test.ts
```

覆盖：

- 下一次 `playSpin()` 开始时不再调用会隐藏矿车的 `reset()`；如果 fake minecart 处于 parked，必须调用 `startExitIfParked()`。
- parked 矿车在下一次 spin 开始时先向右出屏，且本轮 `playSpin()` 会等待出屏完成。
- 如果本轮 terminal feature 非 `normal`，必须在出屏完成后才允许启动新矿车入场；出屏未完成就收到 terminal event 要抛错。
- terminal feature 为 `normal` 时，本轮不启动新矿车入场，但仍能完成上一辆 parked 矿车出屏。
- 当前 spin 的中奖金额动画到达 `awaiting-dismiss` 后，`playSpin()` 可以 resolve，不需要 canvas click。
- 下一次 `playSpin()` 开始时会调用金额动画的立即关闭 API。
- `playSpin()` resolve 后，如果 win amount 仍处于 `awaiting-dismiss`，后续 ticker 仍会继续调用 `winAmount.update(deltaSeconds)`；下一次 spin 开始后不再继续 tick 已被立即关闭的上一轮金额展示。
- Fake `Game003MinecartInteractionRuntime` 必须实现真实 interface，包括 `startExitIfParked()`、`clearParkedCart()`、`getSnapshot().phase = "parked" | "cart-exit"` 等状态，不要用 `resetCount` 这种旧行为作为新合同的唯一断言。
- Fake `WinAmountAnimationPlayer` 必须实现真实 interface，包括 `dismissImmediately()` 和可脚本化返回 `awaiting-dismiss` phase 的 `update()`，不要用测试专属的布尔绕过真实 phase 语义。
- 仍保留 canvas click listener 的清理测试，destroy 后点击不能继续调用 player。

### 6.5 rendercore 金额动画测试

如果新增 `dismissImmediately()`，必须更新：

```text
packages/rendercore/src/win-amount/types.ts
packages/rendercore/src/win-amount/win-amount-player.ts
packages/rendercore/src/win-amount/index.ts
packages/rendercore/README.md
packages/rendercore/tests/win-amount/**/*.test.ts
```

若当前没有对应测试目录，先用 `rg --files packages/rendercore/tests | rg 'win-amount|amount'` 查找现有位置，并按现有结构新增测试。

覆盖：

- `dismissImmediately()` 对 `idle` / `complete` 幂等。
- counting 中调用会立即清空 stage，`isPlaying()` 变为 `false`。
- tier 播放中调用会 destroy active tier 和 ending tiers，`isPlaying()` 变为 `false`。
- `requestDismiss()` 的原有渐隐/结束行为不被破坏。
- `@slotclientengine/rendercore/win-amount` 子路径类型导出包含更新后的 `WinAmountAnimationPlayer`。

### 6.6 边界 grep

执行并记录结果：

```bash
rg -n 'minecart|Minecart|game003MinecartInteraction|game003-minecart' packages/rendercore packages/logiccore packages/gameframeworks
```

预期：除非本任务为了中奖金额动画新增通用 rendercore API，shared 包中仍不应出现 game003 矿车语义。

```bash
rg -n 'baseDurationMs|speedSymbolsPerSecond|minimumSpinCycles|startDelayMs|stopDelayMs' apps/game003/config/game-static.yaml apps/game003/src apps/game003/tests
```

预期：不应为了本任务延长主转轮 timing。测试中可以读取这些字段做预算断言。

```bash
rg -n 'height\s*/\s*5|width\s*/\s*5|conveyor.*\/\s*5' apps/game003/src apps/game003/tests apps/game003/config
```

预期：仍不通过 conveyor 宽高等分推导 slot 或矿车位置。

## 7. 验收命令

基础生成和 game003 验收：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
```

如果修改了 `packages/rendercore` 的金额动画 public API，必须额外执行：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore format:check
```

如果修改了 `apps/buildgamestatic` 或 shared static-config 类型，必须额外执行：

```bash
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic build
CI=true pnpm --filter buildgamestatic format:check
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
CI=true pnpm --filter @slotclientengine/gameframeworks format:check
```

最终必须执行：

```bash
git diff --check
git status --short --untracked-files=all
```

## 8. 浏览器验收

非浏览器测试通过后，需要用浏览器做横竖屏视觉验收。可启动：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1
```

验收视口：

```text
横屏：1600 x 1000
竖屏：1174 x 2000
```

验收点：

- 非 `normal` terminal feature 触发后，矿车冲入、刹车、payload 飞出和 hold 都在主转轮停轴前完成。
- payload 从车厢更靠中间的位置飞出，不再明显偏上。
- payload 到达主转轮中心后有可见停留，不是到达瞬间消失。
- 本轮结束时矿车停在主转轮下方中间并保持可见。
- 下一次 spin 一开始，上一轮矿车向右快速冲出屏幕，不是原地消失。
- terminal feature 为 `normal` 时，不播放空载矿车入场。
- 上一轮中奖金额展示不需要点击关闭；下一次 spin 开始时自动关闭。
- 横竖屏切换后，矿车停点、出屏方向、payload anchor 和中奖金额关闭行为仍正确。

如果无法稳定触发目标 feature，需要在任务报告中记录实际使用的 live spin、fixture、临时测试入口或未完成原因。不要把浏览器未验收写成已验收。

## 9. 最终任务报告要求

完成后新增：

```text
tasks/74-game003-minecart-animation-polish-[utctime].md
```

报告必须包含：

- 结论：已完成 / 部分完成 / 阻断。
- 修改文件清单。
- 最终矿车状态机说明。
- 最终 timing 表：`bg-bar shift`、`terminal win`、`cartExit`、`cartRush`、`symbolFly`、`symbolHold`、总入场互动时长、主转轮 `baseDurationMs`。
- 最终横竖屏 `payloadAnchorInImage`、`cartPivotInImage`、`stopOffsetFromReelAreaBottomCenter`、`exitSide`。
- 中奖金额动画关闭语义说明：是否新增 rendercore API、当前 spin 何时 resolve、下一次 spin 如何关闭上一轮展示。
- `GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS` 与 `bg-bar-symbol-state-textures.manifest.json` 的最终一致性说明。
- 如果新增 rendercore public API，说明 `packages/rendercore/README.md` 是否已同步。
- `agents.md` 是否更新；如果没更新，说明理由。
- 所有验收命令的结果，包含失败命令和失败原因。
- 浏览器验收结果；如果未做浏览器验收，明确写“未验收”，不要含糊。
- `pnpm-lock.yaml` 是否变化。
- `git status --short --untracked-files=all` 的最终摘要。

## 10. 二次遗漏检查

提交前必须做一次二次检查：

- 检查 `apps/game003/src/game-adapter.ts` 是否还有 spin 开始时隐藏 parked 矿车的 reset/clear 调用。
- 检查 `minecart-interaction-runtime.ts` 是否存在从 `symbol-fly` 直接 `idle` 并隐藏矿车的旧路径。
- 检查 `minecart-interaction-config.ts` 的 `assertKeys` 是否覆盖新增字段，未知字段是否仍显式失败。
- 检查 `GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS` 和 `bg-bar-symbol-state-textures.manifest.json` 的 `normal/wild/up win.durationSeconds` 是否一致。
- 检查 `game-static.yaml` 的中文注释是否同步解释新增 timing、hold、exit 和 anchor 字段。
- 检查 generated 文件是否由命令生成，而不是手改。
- 检查 `playSpin()` resolve 条件是否仍错误依赖点击关闭金额动画。
- 检查 fake runtime / fake win amount player 是否按真实 public API 更新，避免测试用奇怪写法掩盖生产问题。
- 检查 `packages/rendercore/README.md` 是否同步说明新增的 win amount public API。
- 检查 `apps/game003/README.md`、`agents.md` 是否需要同步，不能只改代码。
- 检查 shared 包中没有新增 game003 矿车语义。
- 检查主转轮 timing 没有被延长。
