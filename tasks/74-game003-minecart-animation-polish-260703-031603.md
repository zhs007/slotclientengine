# game003 矿车动画体验优化任务报告

## 1. 执行结论

已按 `tasks/74-game003-minecart-animation-polish.md` 落地非浏览器实现与验收。

- 矿车互动新增 `symbol-hold`、`parked`、`cart-exit` 状态。
- 矿车完成后停在主转轮下方中间并保持可见；下一次 spin 开始时若存在 parked 矿车，会先向右快速出屏，不再 reset 原地隐藏。
- payload 起飞锚点从 `{ x: 184.5, y: 92 }` 调整为 `{ x: 184.5, y: 126 }`，更靠近车厢中部。
- payload fly 调整为 `0.43s`，到达主转轮中心后新增 `0.12s` hold，飞行阶段不再线性淡到不可见。
- `bg-bar` terminal win 从 `0.24s` 调整为 `0.20s`，manifest 和 runtime 常量保持一致。
- 中奖金额动画新增 rendercore 通用 `dismissImmediately()` API；`playSpin()` 不再等待 `awaiting-dismiss` 的点击关闭，下一次 spin 开始会自动关闭上一轮金额展示。

最终入场预算：

```text
bg-bar shift 0.28s
+ terminal win 0.20s
+ cart rush 0.26s
+ payload fly 0.43s
+ payload hold 0.12s
= 1.29s
```

该预算小于 `maxTotalBeforeReelStopSeconds = 1.3s`，也小于主转轮 `baseDurationMs = 1300ms`。

`cartExitDurationSeconds = 0.18s` 只用于下一轮 spin 开始时的右侧出屏，不计入上一轮入场预算。

## 2. 关键修改

- `apps/game003/config/game-static.yaml`
  - 新增 `cartExitDurationSeconds`、`symbolHoldDurationSeconds`、`exitSide`。
  - 更新 `cartRushDurationSeconds=0.26`、`symbolFlyDurationSeconds=0.43`、`payloadAnchorInImage.y=126`。
- `apps/game003/src/generated/game-static.generated.ts`
  - 由 `generate:static-config` 重新生成，未手改。
- `apps/game003/src/minecart-interaction-config.ts`
  - 严格解析新字段，未知/缺失/非法字段显式失败。
  - 总时长计算纳入 `symbolHoldDurationSeconds`。
  - `cartExitDurationSeconds` 限制为 `<= 0.25s`。
- `apps/game003/src/minecart-interaction-layout.ts`
  - 新增 `cartExitCenter`，根据 `visibleRect`、图片尺寸、pivot、`exitSide` 和 margin 推导右侧屏幕外位置。
- `apps/game003/src/minecart-interaction-runtime.ts`
  - 状态机扩展为 `idle | cart-rush | symbol-fly | symbol-hold | parked | cart-exit | destroyed`。
  - 新增 `startExitIfParked()` 和 `clearParkedCart()`。
  - `parked` 阶段 `isPlaying() = false`，矿车可见，payload 隐藏。
- `apps/game003/src/game-adapter.ts`
  - `playSpin()` 开始前先完成本轮输入校验，再 `dismissImmediately()`，再 `startExitIfParked()`。
  - 删除普通 spin 开始时隐藏 parked 矿车的 reset 行为。
  - `completePendingIfReady()` 等待 parked 矿车出屏、新矿车入场/hold、`bg-bar`、`bg-wins` 和中奖金额主要播放。
  - `awaiting-dismiss` 不再阻塞本轮 resolve；无 pending 时仍 tick lingering win amount。
- `packages/rendercore/src/win-amount/*`
  - `WinAmountAnimationPlayer` 新增 `dismissImmediately()`。
  - counting、tier、awaiting-dismiss、dismissing 阶段可立即清理；`requestDismiss()` 渐隐语义保留。
- `apps/game003/README.md`、`packages/rendercore/README.md`、`agents.md`
  - 同步 parked/exit、payload anchor、时间预算和金额自动关闭规则。

## 3. 测试覆盖

新增或更新覆盖：

- 矿车配置解析：新 timing 字段、`exitSide:right`、总时长预算、非法 exit duration、非法 anchor 和未知/缺字段显式失败。
- 矿车 layout：横竖屏 `cartExitCenter` 在右侧可见区域外，payload 起点更靠车厢中部，飞行仍接近垂直。
- 矿车 runtime：`cart-rush -> symbol-fly -> symbol-hold -> parked -> cart-exit -> idle`，parked 可见、payload hold 可见、出屏完成隐藏。
- game003 adapter：下一轮 parked 矿车先出屏、出屏未完成收到非 normal terminal feature 显式失败、normal 不启动空载矿车、win amount 到 `awaiting-dismiss` 后 resolve、下一轮自动立即关闭上一轮金额展示。
- rendercore win amount：`dismissImmediately()` 对 idle/complete 幂等，counting 和 tier 播放中立即清理，并不破坏 `requestDismiss()`。

## 4. 非浏览器验收

已执行并通过：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore format:check
git diff --check
```

补充执行：

```bash
CI=true pnpm --filter game003 format
CI=true pnpm --filter @slotclientengine/rendercore format
CI=true pnpm exec prettier --write agents.md
CI=true pnpm exec prettier --write tasks/74-game003-minecart-animation-polish-260703-031603.md
file assets/game003-s1/minecart.png
sips -g pixelWidth -g pixelHeight assets/game003-s1/minecart.png
```

过程中 `pnpm exec prettier --write agents.md` 在非 CI 下触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，已按仓库约定用 `CI=true` 重试通过。

资源确认：

```text
assets/game003-s1/minecart.png: PNG image data, 369 x 252, 8-bit/color RGBA, non-interlaced
pixelWidth: 369
pixelHeight: 252
```

## 5. 边界 grep

已执行：

```bash
rg -n 'minecart|Minecart|game003MinecartInteraction|game003-minecart' packages/rendercore packages/logiccore packages/gameframeworks
```

结果：无命中。除 rendercore 的通用中奖金额 API 外，shared 包未引入 game003 矿车语义。

已执行：

```bash
rg -n 'baseDurationMs|speedSymbolsPerSecond|minimumSpinCycles|startDelayMs|stopDelayMs' apps/game003/config/game-static.yaml apps/game003/src apps/game003/tests
```

结果：只命中既有 reel 配置、读取逻辑、生成物和预算断言；未为本任务延长主转轮 timing。

已执行：

```bash
rg -n 'height\s*/\s*5|width\s*/\s*5|conveyor.*\/\s*5' apps/game003/src apps/game003/tests apps/game003/config
```

结果：无命中。仍未用 conveyor 宽高等分推导 slot 或矿车位置。

## 6. pnpm-lock 和依赖

本任务未新增第三方依赖，未执行 `pnpm install`，`pnpm-lock.yaml` 无变化。

## 7. 浏览器验收交接

浏览器验收按用户要求未由本次执行完成，待用户手动验收。

建议启动命令：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1
```

建议视口：

```text
横屏：1600 x 1000
竖屏：1174 x 2000
```

重点确认：

- 非 `normal` terminal feature 后，矿车冲入、payload fly 和 hold 在主转轮停轴前完成。
- payload 从更靠车厢中部的位置飞出。
- payload 到主转轮中心后有短暂停留，不是到达瞬间消失。
- 本轮结束后矿车 parked 在主转轮下方中间并保持可见。
- 下一次 spin 开始时上一辆 parked 矿车向右快速出屏，不是原地消失。
- terminal feature 为 `normal` 时不播放空载矿车。
- 中奖金额进入等待关闭后不阻塞下一轮，下一次 spin 开始自动关闭上一轮展示。
- 横竖屏切换后停点、出屏方向、payload anchor 和金额关闭行为仍正确。
