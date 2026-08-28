# 任务 259：Award Popup 金额曲线与跳档逻辑执行报告

## 1. 执行状态

- 代码、文档、定向自动化与 RenderCore typecheck 已完成。
- 真实浏览器视觉与交互验收按用户要求未执行，由用户在 Popup Editor 和 Game Layout Editor 中完成。
- 执行分支：`codex/task-259-award-popup-countup`。
- 执行基线：`643db02164485468e2a1cd411210d28185df0721`（本机最新 `main`）。执行前已 fetch `origin/main` 与 `gitee/main`；`gitee/main` 为计划时基线 `2f7d76da`，`origin/main` 更旧，本机 `main` 另含 4 个已有提交，因此从三者中最新的本机 `main` 建立任务分支。

## 2. 最终实现

- `winAmountRaw <= betAmountRaw` 不再滚动 base，启动时只提交一次 exact final，并立即进入既有正式 end/dismissing drain。
- `winAmountRaw > betAmountRaw` 跳过 base，首个可见计数档为 standard，金额从 exact bet 开始。
- 新增内部 immutable amount motion plan。standard、bigwin、superwin 分别按完整相邻 threshold span 与 manifest duration 标定；开放的 megawin 使用最近封闭的 `superwin → megawin` span 标定。partial final 只截取完整曲线前段，不按本轮 final 重算速度。
- 每档采用常加速度曲线；下一档继承上一档终端速度，并在需要时缩短 effective canonical duration，保证档内和跨档速度继续增加。零时长档位按同步、有限值路径处理。
- actual final 前只生成一个 cubic ease-out terminal braking tail。自然播放和 `requestAdvance()` 跳向 final 共用该尾段；重复 advance 不越过停表效果。`requestDismiss()` 仍按宿主明确意图直接提交 final 并结束。
- `requestAdvance()` 不再等待庆祝档的 start/loop 边界：bigwin/superwin/megawin 的 start 动画未结束时，第一次点击就同步退出当前档并进入下一非最终里程碑或 final braking。
- 跨 motion/stage/braking 边界的单次大 delta 会继续消费剩余时间；automatic amount 按 floored raw amount 去重提交，移除了同一更新的重复 ImgNumber write。
- exact threshold final 在前一正区间完成最终减速后，激活 exact threshold 所属视觉档并立即进入其 end，保持金额与最终 tier 合同一致。

## 3. 实际修改文件

新增：

- `packages/rendercore/src/popup/award-amount-motion.ts`
- `packages/rendercore/tests/popup/award-amount-motion.test.ts`
- `tasks/259-rendercore-award-popup-countup-curve.md`
- 本执行报告

修改：

- `packages/rendercore/src/popup/award-player.ts`
- `packages/rendercore/src/popup/award-sequence.ts`
- `packages/rendercore/src/popup/core/types.ts`
- `packages/rendercore/tests/popup/award-player.test.ts`
- `packages/rendercore/tests/scene-layout/package-runtime.test.ts`
- `packages/rendercore/README.md`
- `docs/popup-manifest.md`
- `docs/agent-rules/shared-game-runtime.md`

未修改 manifest/schema、public 方法签名、资源、生成物、依赖或 lockfile。

## 4. 计划适配与说明

- 计划预计可能修改 `award-sequence.test.ts`，实际 existing sequence threshold 测试无需改变；新增曲线性质放入独立 pure-helper 测试，sequence 只复用统一的输入与 safe-threshold helper。
- 计划中的整条 Vitest 命令包含完整 `tests/scene-layout/package-runtime.test.ts`。该文件全量执行时有 2 条与本任务无关的 reel-parent 既有失败：
  - `creates, orders and resets the standard reel from package contracts`
  - `creates, orders and resets the grid-cell reel from package contracts`

  失败断言均为 `reel.parent === runtime.container.children[0]`，不经过 award popup。本任务对应的 Scene Layout legacy award flow 已单独最小化并通过；未扩大范围修复 reel 基线问题。

## 5. 自动化验收

使用 Node.js `v24.14.0`、pnpm `10.0.0`。依赖通过 `CI=true pnpm install --frozen-lockfile` 补齐，lockfile 未变化。

通过：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/award-amount-motion.test.ts tests/popup/award-sequence.test.ts tests/popup/award-player.test.ts
# 3 files / 37 tests passed

pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime.test.ts -t "loads legacy v1 directly through the default latest game-mode flow"
# 1 passed / 22 skipped

pnpm --filter @slotclientengine/rendercore typecheck
# passed（含 prepare:deps）

pnpm exec prettier --check packages/rendercore/src/popup/award-amount-motion.ts packages/rendercore/src/popup/award-player.ts packages/rendercore/src/popup/award-sequence.ts packages/rendercore/src/popup/core/types.ts packages/rendercore/tests/popup/award-amount-motion.test.ts packages/rendercore/tests/popup/award-sequence.test.ts packages/rendercore/tests/popup/award-player.test.ts packages/rendercore/tests/scene-layout/package-runtime.test.ts packages/rendercore/README.md docs/popup-manifest.md docs/agent-rules/shared-game-runtime.md tasks/259-rendercore-award-popup-countup-curve.md tasks/259-rendercore-award-popup-countup-curve-260828-044950.md
# passed

git diff --check
# passed
```

## 6. 浏览器人工验收交接

按用户要求，本次没有启动或控制浏览器，以下项目保持待验，不能用单测或 fake layer 冒充通过：

1. Popup Editor：测试 `<bet`、`=bet`、`2×bet`。前两者应直接显示 final/end，无滚动；2 倍应从 exact bet 开始，以完整 standard 曲线前段计数，并在 final 前可见减速。
2. Popup Editor：测试跨 bigwin/superwin/megawin 的高额获奖。应跳过 base，金额在档内及跨档整体越来越快，只有 actual final 前减速，threshold 切档时金额与视觉同步。
3. Popup Editor：bigwin 或 superwin 的 start 动画刚出现即点击一次。第一次点击应立即进入下一可达档或 final braking；点击跳 final 后仍应看到最后数字减速，重复点击不应直接抹掉该效果。
4. Game Layout Editor：分别用 canvas 与 keyboard 重复 start-segment 点击及 final stop，确认与 Popup Editor 一致；最终 end 完整 drain、FIFO 后项继续、画面无残留且控制台无新错误。

建议记录浏览器版本、viewport、fixture 输入、通过/失败项、控制台和必要截图。收到人工验收反馈前，最终产品验收状态为“自动化完成，浏览器待用户签收”。

## 7. 剩余风险

- 加速包络和 terminal braking 的数学性质、边界与 Core 生命周期已有自动化覆盖，但最终节奏是否符合美术观感仍依赖真实帧率、实际 ImgNumber 字形和 VNI/Spine 动画下的浏览器观察。
- Scene Layout 全文件的两条 reel-parent 基线失败仍存在，但与任务 259 的 award popup 路径无关；本任务没有修改 reel/runtime ownership。
- 未 commit、未 push、未创建 PR。
