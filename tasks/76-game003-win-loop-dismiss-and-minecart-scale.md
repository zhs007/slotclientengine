# game003 win loop dismiss and minecart scale 任务计划

## 1. 任务目标

本任务优化 `apps/game003` 当前中奖展示、中奖金额点击关闭和矿车 payload 图标尺寸：

- 中奖金额 big / super / mega 动画在多次点击后会停在最终金额位置；现在要求最后再点击一次时，播放当前 tier 的 end / dismiss 段，播放完成后隐藏金额和特效。
- symbol 中奖状态不能只按 `bg-wins` result 遍历一次；需要按 result 顺序循环播放：例如 3 个 result 时，播放 `1 -> 2 -> 3`，然后暂停一个 symbol 中奖展示时长，再继续 `1 -> 2 -> 3`。
- 每个 result 的中奖 symbol 处需要临时显示该 result 的中奖金额：选择这一组中奖 symbols 中间位置的 symbol，在该 symbol 中间偏下位置显示格式化后的金额；该 result 的 symbol 中奖状态结束时，金额同步消失。
- 矿车上的传送带 feature 图标不能再被缩小；payload 应保持 bg-bar symbol manifest / catalog 的原始显示 scale。

本计划必须能独立落地，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、协作规则同步判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/76-game003-win-loop-dismiss-and-minecart-scale-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/76-game003-win-loop-dismiss-and-minecart-scale-260703-123456.md
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

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。缺少金额字段、非法 result 坐标、找不到可见 symbol 几何信息、生成物不同步、未知 YAML 字段、payload scale 非法、动画状态机非法跳转，都必须明确抛错或让测试失败，不要静默跳过、自动归零、用 totalwin 代替 result 金额、用默认坐标补救或隐藏问题。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

当前关键文件：

```text
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
apps/game003/src/game-adapter.ts
apps/game003/src/game-demo.ts
apps/game003/src/game-layout.ts
apps/game003/src/money.ts
apps/game003/src/skin-config.ts
apps/game003/src/win-sequence.ts
apps/game003/src/win-symbol-loop-config.ts
apps/game003/src/win-symbol-loop.ts
apps/game003/src/win-amount-config.ts
apps/game003/src/minecart-interaction-config.ts
apps/game003/src/minecart-interaction-runtime.ts
apps/game003/src/bg-bar-runtime.ts
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/reel/render-reel-set.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/src/win-amount/win-amount-player.ts
packages/rendercore/src/win-amount/types.ts
packages/rendercore/src/win-amount/win-amount-stage.ts
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/win-sequence.test.ts
apps/game003/tests/win-symbol-loop-config.test.ts
apps/game003/tests/win-symbol-loop.test.ts
apps/game003/tests/minecart-interaction-runtime.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/source-boundary.test.ts
packages/rendercore/tests/reel/render-reel.test.ts
packages/rendercore/tests/reel/render-reel-set.test.ts
packages/rendercore/tests/win-amount/win-amount-player.test.ts
apps/game003/README.md
agents.md
```

当前已观察到：

- `packages/rendercore/src/win-amount/win-amount-player.ts` 中 `requestAdvance()` 在 `awaiting-dismiss` 阶段不会隐藏；最后 tier 停在最终金额和 active tier 上，继续点击无效果。
- `requestDismiss()` 已能让 active tier 播放 end 段并进入 `dismissing`，end 完成后 `completeAndHide()`。
- `apps/game003/src/game-adapter.ts` 当前 canvas `pointerdown` 只调用 `winAmountPlayer.requestAdvance()`，不直接调用 `requestDismiss()`。
- `apps/game003/src/game-adapter.ts` 当前中奖 symbol 播放逻辑在 pending spin 内使用 `winQueue / winIndex / winGroupStarted / winGroupAdvanced / winSequenceComplete`，只遍历一次。
- `apps/game003/src/win-sequence.ts` 已能从 `bg-wins` 解析 result 组，当前每组包含 `positions`、`coinWin`、`cashWin`，其中 `cashWin` 当前缺失时会被当作 `0`。
- `apps/game003/src/money.ts` 已提供 `SERVER_USD_AMOUNT_SCALE = 100` 和 `formatServerUsdAmount(...)`，game003 金额显示必须复用它，避免 `100` 显示成 `100` 而不是 `$1.00`。
- `packages/rendercore` 当前只有可见 symbol 状态快照 API，没有公开可见 symbol 的几何中心坐标。
- `apps/game003/config/game-static.yaml` 当前 `appExtensions.game003MinecartInteraction.payload.symbolScale` 为 `0.72`，这会让矿车 payload 在 bg-bar symbol manifest / catalog scale 之外再缩小。
- `apps/game003/src/generated/game-static.generated.ts` 和 `apps/game003/src/generated/game-loading.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改。

## 4. 边界和非目标

- `bg-wins`、中奖 symbol 循环、result 金额 overlay、矿车 payload 仍属于 `apps/game003` app 层；`packages/logiccore` / `packages/gameframeworks` / `packages/rendercore` 不能硬编码 `bg-wins`、game003、GMI、Ways、矿车、bg-bar、wild、up 或 conveyor 语义。
- `packages/rendercore` 可以新增通用的可见 symbol 几何快照 API，供 app 使用；不能把 game003 result 循环、金额格式、bg-wins 解析或矿车语义放进 rendercore。
- 不改 live server、`gamecode`、URL query 合同、服务器协议、`FeatureBar2Data` 数据形状或本地公开轮带边界。
- 不通过延长主转轮 `baseDurationMs`、`speedSymbolsPerSecond`、`minimumSpinCycles`、`startDelayMs` 或 `stopDelayMs` 掩盖动画节奏问题。
- 不新增透明 PNG；`normal` 继续使用 `bg-bar-symbol-state-textures.manifest.json` 中的透明 symbol。
- 不在 app 内复制 rendercore 的 reel 状态机、裁切、symbol update、VNI/Spine 播放生命周期或 reel cell 几何推导。
- `playSpin()` 不能为了无限循环的中奖 symbol 而永远不 resolve。它只需要等待首轮 `bg-wins` result 展示完成；后续循环作为 lingering 展示继续 tick，下一次 spin 开始时显式清理。
- 金额动画进入 `awaiting-dismiss` 后仍不阻塞 `playSpin()`。玩家最后一次点击关闭的是 lingering 金额动画，不应该重新要求本轮 spin promise 等待点击。

## 5. 实现方案

### 5.1 调整 rendercore 中奖金额点击语义

修改 `packages/rendercore/src/win-amount/win-amount-player.ts` 的 `requestAdvance()`：

- counting 阶段保持现有语义：
  - minor / major 阶段点击：跳到下一个 tier 阶段，若没有 tier 则跳到最终金额并进入 `awaiting-dismiss`。
  - tier-counting 阶段点击：完成当前 tier 对应的金额增长段。
- `awaiting-dismiss` 阶段新增语义：
  - 如果存在 `#activeTier`，调用与 `requestDismiss()` 一致的逻辑，让当前 tier 播放 end 段并进入 `dismissing`。
  - 如果不存在 `#activeTier`，直接隐藏文本和 overlay，进入 `complete`。
- `dismissing` 阶段继续忽略重复点击，避免重复 `requestEnd()`。
- `idle` / `complete` 阶段继续保持幂等 no-op。

不要在 `apps/game003/src/game-adapter.ts` 私自把 pointerdown 改成调用 `requestDismiss()`。canvas 点击继续调用 `requestAdvance()`，由 rendercore 的通用 player 负责“最后一次点击关闭”的状态语义。

需要更新测试：

```text
packages/rendercore/tests/win-amount/win-amount-player.test.ts
apps/game003/tests/game-adapter.test.ts
```

重点覆盖：

- 非 tier 金额：第一次点击跳最终金额并进入 `awaiting-dismiss`，第二次点击隐藏并 `complete`。
- big / super / mega：点击逐级跳档；到最终 tier 的 `awaiting-dismiss` 后，再点一次应触发当前 tier 的 end 请求；`update()` 到 end 完成后 `complete`。
- `dismissing` 阶段重复点击不重复发送 end 请求。
- game003 canvas 点击仍只转发 `requestAdvance()`；不新增 app 层隐藏兜底。

### 5.2 新增 rendercore 可见 symbol 几何快照 API

为避免 game003 app 复制 reel cell 坐标算法，在 `packages/rendercore` 增加最小只读 API。

建议新增类型：

```ts
export interface RenderVisibleSymbolGeometrySnapshot {
  readonly x: number;
  readonly y: number;
  readonly code: number;
  readonly kind: ReelSymbolKind;
  readonly centerX: number;
  readonly centerY: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
}
```

坐标语义：

- `RenderReel.getVisibleSymbolGeometrySnapshot(windowY)` 返回坐标相对该 reel 的父级 reel set。
- `RenderReelSet.getVisibleSymbolGeometrySnapshot(x, y)` / `getVisibleSymbolGeometrySnapshots(positions)` 返回坐标相对 `RenderReelSet` 本地坐标。
- API 只在 reel stopped 时允许读取；spinning 阶段读取必须沿用现有 state API 的 fail-fast 语义。
- 空 symbol / empty symbol 仍返回几何位置和 code/kind；是否能显示金额由 app 决定。

需要更新：

```text
packages/rendercore/src/reel/types.ts
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/reel/render-reel-set.ts
packages/rendercore/src/reel/index.ts
packages/rendercore/tests/reel/render-reel.test.ts
packages/rendercore/tests/reel/render-reel-set.test.ts
```

测试要覆盖：

- stopped reel 的可见 symbol center 为 `reelX + cellWidth / 2`、`cellY + cellHeight / 2`。
- 多 reel set 坐标包含 column gap。
- spinning 阶段读取几何快照明确抛错。
- 越界 x/y 明确抛错。

### 5.3 在 game003 reel runtime facade 暴露几何快照

在 `apps/game003/src/game-demo.ts` 的 `Game003ReelRuntime` 增加 facade 方法：

```ts
getVisibleSymbolGeometrySnapshots(
  positions: readonly { readonly x: number; readonly y: number }[],
): readonly RenderVisibleSymbolGeometrySnapshot[];
```

要求：

- 仅转发 `RenderReelSet` 的通用 API。
- 不在 `apps/game003` 中重新根据 `cellWidth`、`cellHeight`、`reelGap` 计算 symbol center。
- fake runtime 和相关测试同步补齐该方法。

### 5.4 收紧 bg-wins result 金额合同

修改 `apps/game003/src/win-sequence.ts`：

- 对需要展示的 `bg-wins` result，`cashWin` 必须是 finite number 且 `> 0`。
- 不能再把缺失 `cashWin` 静默当作 `0` 用于 overlay。
- 不能用 `coinWin`、component `totalwin` 或本轮 `logic.getTotalWin()` 兜底单个 result 金额。
- `formatServerUsdAmount(group.cashWin)` 是唯一显示文本来源。
- 保留现有 `pos` 越界、`usedResults` 顺序、component totals 校验。

如果旧测试认为 `cashWin` 可省略，需要按新产品需求修改测试，不要为了兼容旧测试保留隐藏 fallback。

需要更新：

```text
apps/game003/src/win-sequence.ts
apps/game003/tests/win-sequence.test.ts
```

### 5.5 新增 game003 中奖 symbol 循环配置和 runtime

建议新增文件：

```text
apps/game003/src/win-symbol-loop-config.ts
apps/game003/src/win-symbol-loop.ts
apps/game003/tests/win-symbol-loop-config.test.ts
apps/game003/tests/win-symbol-loop.test.ts
```

`win-symbol-loop-config.ts` 负责严格解析 `GAME003_STATIC_CONFIG.skins["1"].appExtensions.game003WinSymbolLoop`，并由 `apps/game003/src/skin-config.ts` 暴露到 `Game003SkinConfig`：

- `appExtensions.game003WinSymbolLoop` 缺失时显式失败。
- 只允许 `cyclePauseSeconds` 和 `resultAmount` 两组字段，未知字段显式失败。
- `cyclePauseSeconds` 必须是 finite positive number。
- `resultAmount.yOffsetRatioFromCellCenter` 必须是 finite number，建议限制在 `[-0.5, 0.5]`，避免金额飞出 symbol cell。
- `resultAmount.fontSize` / `strokeWidth` 必须是 finite positive number；`fill` / `stroke` 必须是非空字符串。
- 不在 `game-adapter.ts` 里直接读 raw `appExtensions`，避免绕过 app 层校验。

职责：

- 接收 `Game003WinSymbolGroup[]`、`Game003ReelRuntime`、金额 formatter 和已解析的 `Game003WinSymbolLoopConfig`。
- 按 result 顺序启动当前组：
  - 调用 `runtime.requestVisibleSymbolStates(group.positions, "win")`。
  - 读取 `runtime.getVisibleSymbolGeometrySnapshots(group.positions)`。
  - 选择这一组中奖 symbols 的中间 symbol 作为金额锚点。
  - 显示 `formatServerUsdAmount(group.cashWin)`。
- 每帧调用 `runtime.update(deltaSeconds)` 后检查当前组是否完成：
  - `runtime.getVisibleSymbolStateSnapshots(group.positions)` 全部回到 `requestedState === "normal"` 且 `resolvedState === "normal"` 时，隐藏当前 result 金额。
  - 切到下一组 result。
- 完成最后一组后进入 cycle pause：
  - pause 期间不显示 result 金额。
  - pause 时长必须放进 YAML：`appExtensions.game003WinSymbolLoop.cyclePauseSeconds`。
  - 第一版建议 `cyclePauseSeconds: 1`，因为当前 `L1` 到 `L5` 的 VNI win range 为 `0 -> 1s`；如果产品验收确认要更短，只改 YAML 配置和测试期望，不允许 runtime 从某个 symbol manifest 隐式推导或写死。
  - pause 完成后从第一个 result 重新循环。
- runtime 需要暴露 `firstCycleComplete`，供 `playSpin()` 只等待第一轮完整 `1 -> 2 -> 3` 后 resolve。
- `clear()` 必须隐藏 result 金额并停止循环；下一次 spin 开始前由 adapter 显式调用。

中间 symbol 选择规则必须确定且可测试：

1. 先读取每个中奖位置的几何中心。
2. 计算这些中心点的平均点。
3. 选择距离平均点最近的实际中奖 symbol。
4. 若距离相同，按 `x` 再按 `y` 升序打破平局。

金额位置：

- 以被选中 symbol 的中心为基准。
- y 方向向下偏移 `cellHeight * yOffsetRatioFromCellCenter`。
- 第一版建议 `yOffsetRatioFromCellCenter: 0.22`。
- x 保持 symbol center。
- 文本 anchor 使用 `(0.5, 0.5)`。

金额样式建议也进入 YAML，避免硬编码：

```yaml
appExtensions:
  game003WinSymbolLoop:
    cyclePauseSeconds: 1
    resultAmount:
      yOffsetRatioFromCellCenter: 0.22
      fontSize: 38
      fill: "#fff7d6"
      stroke: "#5a2500"
      strokeWidth: 5
```

如果 `apps/buildgamestatic` 或 static config validator 不支持该 app extension 结构，需要做最小同步，让 generated TS 原样携带该静态对象；shared 包不能理解 game003 语义。

需要更新测试：

```text
apps/game003/tests/win-symbol-loop-config.test.ts
apps/game003/tests/win-symbol-loop.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/source-boundary.test.ts
```

测试重点：

- generated config 中包含 `game003WinSymbolLoop`。
- `getGame003SkinConfig("1").winSymbolLoop` 返回严格解析后的配置。
- 缺字段、未知字段、非法 pause、非法文字样式都显式失败。
- `source-boundary.test.ts` 增加 shared package 边界检查，确保 `bg-wins`、`game003WinSymbolLoop`、result amount overlay 等 game003 语义不进入 `packages/rendercore` / `packages/gameframeworks` / `packages/logiccore`。

### 5.6 接入 game003 adapter

修改 `apps/game003/src/game-adapter.ts`：

- mount 时创建 `Game003WinSymbolLoopRuntime` 和对应 overlay container。
- `winSymbolLoop.container` 的坐标空间必须与 `runtime.mainReelsLayer` 一致：
  - 如果作为 `worldLayer` 下的 sibling 渲染，必须在 mount 和每次 `#applyViewport()` 后把 `winSymbolLoop.container.position` 设置为 `runtime.mainReelsLayer.x/y` 或 `runtime.layerLayout.x/y`。
  - 如果作为 `runtime.mainReelsLayer` 的 child 渲染，必须确认层级在 reel symbols 之上、不会被 reel mask 或 symbol 状态机清理。
  - 禁止在 `win-symbol-loop.ts` 内重新计算 `mainReelBackground` 或 art viewport 映射。
- world layer 子节点顺序建议：

```text
background
conveyor
bgBarRuntime.container
mainReelBackground
runtime.mainReelsLayer
winSymbolLoop.container
minecartRuntime.container
winAmountPlayer.container
```

这样 result 金额贴在 symbol 上方，但不会盖过矿车和 big / super / mega 金额动画。

- `playSpin()` 开始时：
  - 先清理上一轮 lingering win symbol loop。
  - 再 `winAmountPlayer.dismissImmediately()` 清理上一轮金额动画。
  - 再启动 parked minecart exit、主转轮 spin、bg-bar spin。
- 主转轮完成后：
  - 如果 `winQueue.length > 0`，启动 win symbol loop，并让 pending 等待 `firstCycleComplete`。
  - 如果没有中奖组，pending 直接视为 win symbol 部分完成。
- pending resolve 条件：
  - 主转轮完成。
  - win symbol loop 的第一轮完整 result 展示完成。
  - win amount 已进入非 blocking phase，也就是沿用 `isWinAmountBlockingSpin()`：`awaiting-dismiss` / `dismissing` / `complete` 不阻塞本轮 resolve。
  - bg-bar / minecart 仍按现有合同完成。
- pending resolve 后：
  - ticker 继续 tick lingering win amount 和 lingering win symbol loop。
  - 下一次 spin 开始时显式清理 lingering loop 和金额。

注意：

- 不能让 `playSpin()` 等待无限循环。
- 不能在 `#tickLingeringWinAmount()` 里只 tick 金额而漏掉 win symbol loop；建议改名为 `#tickLingeringAnimations()`。
- 如果 lingering loop 更新时抛错，应该停止 ticker 并抛出明确错误，不能吞掉。
- `#applyViewport()` 必须同步更新 win symbol loop overlay 的坐标空间；否则横竖屏切换或 resize 后 result 金额会错位。

### 5.7 调整矿车 payload 图标 scale

修改 `apps/game003/config/game-static.yaml`：

```yaml
appExtensions:
  game003MinecartInteraction:
    payload:
      symbolScale: 1
```

要求：

- `payload.symbolScale` 代表在 bg-bar symbol catalog scale 基础上的额外缩放。设为 `1` 表示保持传送带图标原始显示尺寸。
- 不改 `assets/game003-s1/bg-bar-symbol-state-textures.manifest.json` 的 symbol scale。
- 不改 `apps/game003/src/bg-bar-runtime.ts` 的传送带 slot 坐标和 symbol scale。
- 不改 `wild.png` / `up.png` 图片。
- 修改 YAML 后必须重新生成：

```bash
pnpm --filter game003 generate:static-config
pnpm --filter game003 check:static-config
```

需要更新或新增测试：

```text
apps/game003/tests/static-config.test.ts
apps/game003/tests/minecart-interaction-config.test.ts
apps/game003/tests/minecart-interaction-runtime.test.ts
```

测试重点：

- generated config 中 `payload.symbolScale === 1`。
- minecart runtime 创建 payload 后，payload scale 等于 catalog / manifest scale，不再额外乘 `0.72`。
- 非法 `payload.symbolScale <= 0` 仍显式失败。

## 6. 文档和协作规则同步

实现完成后必须判断是否同步 `agents.md`。本任务改变了 game003 的长期协作规则，因此如果实现落地，应在 `agents.md` 增加或更新以下规则：

- game003 中奖金额动画：最后一次点击应从最终停留状态播放 dismiss/end 并隐藏；`awaiting-dismiss` 后不阻塞 `playSpin()`。
- game003 `bg-wins` symbol 展示：按 `usedResults` 顺序循环播放，首轮完整播放后 `playSpin()` 可 resolve，后续循环作为 lingering 展示到下一次 spin 清理。
- game003 result 金额 overlay：每个 result 使用 `cashWin` 通过 `formatServerUsdAmount` 显示，锚到当前 result 中间 symbol 的中间偏下位置，result win 状态结束时隐藏。
- game003 矿车 payload：feature symbol 保持 bg-bar manifest / catalog 原 scale，不能在 runtime 或 YAML 中再次缩小。

如果执行者判断 `agents.md` 不需要更新，必须在任务报告中写明理由。

同时必须更新 `apps/game003/README.md`，因为当前 README 仍描述旧合同：

- 旧文档写着“最后停在 `awaiting-dismiss` 后继续留在屏幕上，不会因点击消失。下一次 spin 开始时才会通过 `dismissImmediately()` 自动关闭上一轮金额展示”，实现本任务后必须改为“最终停留后再点击一次播放 dismiss/end 并隐藏；下一次 spin 开始仍会清理残留展示”。
- 旧文档写着中奖组只按 `usedResults` 顺序依次播放、全部中奖组 once 动画回到 normal 后 `playSpin()` resolve；实现本任务后必须说明首轮完整播放后 `playSpin()` 可 resolve，后续按 `usedResults` 循环作为 lingering 展示。
- README 要补充 result 金额 overlay 的 `cashWin` 来源、`formatServerUsdAmount` 格式化、锚点选择规则和生命周期。
- README 要补充矿车 payload `symbolScale: 1` 表示保持 bg-bar manifest / catalog 原始 scale。

## 7. 验收命令

实现完成后至少执行：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter game003 test
pnpm --filter game003 typecheck
pnpm --filter game003 check:static-config
pnpm --filter game003 release:check
pnpm lint
pnpm typecheck
pnpm format:check
git diff --check
```

如果修改了 `apps/buildgamestatic`、`packages/gameframeworks/static-config` 或 generated static config 结构，还必须执行：

```bash
pnpm --filter buildgamestatic test
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
```

如果命令因依赖下载失败，先设置代理后原命令重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

如果命令因非 TTY pnpm module cleanup 失败，使用同一命令加 `CI=true` 重试，不要因此降低验收标准。

浏览器人工验收建议：

```bash
pnpm --filter game003 dev -- --host 127.0.0.1
```

浏览器验收点：

- 中奖后 symbol result 按 `1 -> 2 -> 3 -> pause -> 1 -> 2 -> 3` 循环。
- 每个 result 播放时，金额显示在该 result 中间 symbol 中间偏下位置，金额有小数点，例如服务器 `100` 显示为 `$1.00`。
- result win 状态结束时，当前 result 金额消失。
- big / super / mega 金额到最终位置后，再点击一次会播放消失段并隐藏；不需要等下一次 spin 才消失。
- `awaiting-dismiss` 后 spin 流程没有被点击关闭重新阻塞。
- 下一次 spin 开始时，上一轮 lingering symbol loop 和金额 overlay 被清理。
- resize 或横竖屏切换后，result 金额 overlay 仍贴在对应中奖 symbol 中间偏下位置，不漂移到主转轮外。
- 矿车 payload 的 `wild` / `up` 图标尺寸与传送带图标视觉尺寸一致，不再额外缩小。

## 8. 任务报告要求

完成后新增：

```text
tasks/76-game003-win-loop-dismiss-and-minecart-scale-[utctime].md
```

报告必须包含：

- 实现摘要。
- 修改文件清单。
- 行为合同说明：
  - win amount 最后点击 dismiss。
  - win symbol result 循环和首轮 blocking / 后续 lingering 边界。
  - result 金额 overlay 的金额来源、格式化、锚点规则和生命周期。
  - minecart payload scale 恢复为 `1` 的依据。
- 生成物同步说明，尤其是 `game-static.generated.ts` / `game-loading.generated.ts` 是否变化。
- `agents.md` 和 `apps/game003/README.md` 是否更新及理由。
- 完整验收命令和结果。
- 未完成的浏览器人工验收项，如果执行者没有浏览器验收，必须明确写“浏览器验收待人工确认”，不能写成已完成。
- 如有失败命令，写明失败原因、是否重试、最终是否通过。
- 如有依赖变更，说明 `pnpm-lock.yaml` 是否变化。

## 9. 二次遗漏检查清单

提交或交付前必须按下面清单再查一遍：

- `rg -n "requestAdvance|requestDismiss|awaiting-dismiss|dismissing" packages/rendercore/src packages/rendercore/tests apps/game003/src apps/game003/tests`
- `rg -n "winQueue|winIndex|winGroupStarted|winSequenceComplete|requestVisibleSymbolStates|getVisibleSymbolStateSnapshots|getVisibleSymbolGeometry" apps/game003/src packages/rendercore/src apps/game003/tests packages/rendercore/tests`
- `rg -n "cashWin|coinWin|formatServerUsdAmount|SERVER_USD_AMOUNT_SCALE" apps/game003/src apps/game003/tests`
- `rg -n "symbolScale: 0.72|symbolScale: 1|game003MinecartInteraction|game003WinSymbolLoop" apps/game003/config apps/game003/src apps/game003/tests apps/game003/README.md agents.md`
- `rg -n "最后点击|点击消失|awaiting-dismiss|usedResults|循环|cashWin|payload" apps/game003/README.md agents.md`
- 确认 `apps/game003/src/generated/game-static.generated.ts` 和 `apps/game003/src/generated/game-loading.generated.ts` 是命令生成结果，不是手改。
- 确认 `Game003SkinConfig` 暴露的是严格解析后的 `winSymbolLoop` 配置，不是 adapter 直接读 raw `appExtensions`。
- 确认 result 金额 overlay 的坐标空间跟随 `runtime.mainReelsLayer`，resize / 横竖屏切换后不会错位。
- 确认没有把 `bg-wins`、game003、矿车、bg-bar、wild、up 语义写入 `packages/rendercore` / `packages/gameframeworks` / `packages/logiccore`。
- 确认下一次 spin 开始时会清理 lingering win symbol loop 和 result amount overlay。
- 确认 `playSpin()` 不会被无限循环阻塞，只等待首轮中奖 symbol 展示。
- 确认金额 overlay 不用 totalwin 或 coinWin 兜底单个 result 的现金金额。
- 确认 payload scale 只恢复矿车 payload，不误改传送带 slot rect、bg-bar symbol manifest 或图片资源。
