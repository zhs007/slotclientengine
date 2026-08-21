# 235 rendercore-award-popup-tier-skip-final-loop 执行报告

## 结果

任务 235 的 runtime 实现已完成。`award-celebration` Popup 现在把玩家点击解释为金额与画面档位的同一跳档命令：
bigwin 前跳到 bigwin 或最终值，bigwin 后每次只跳一个实际可达档位；最终金额到达后保持最后档 loop，玩家再次点击
不再关闭 Popup。configured round 的下一次 spin 继续在 reel mutation 前立即清理上一轮遗留展示。

执行基线：

```text
UTC report: 2026-08-21T04:03:16Z
HEAD: aead46cafd6e6ca7c6acf76c9b9860aac3e83051
branch: detached HEAD
```

## 已实现

- `DefaultAwardCelebrationRuntime.requestAdvance()` 在 base/standard 阶段先选择首个可达庆祝档；没有庆祝档时直接进入
  最后实际可达的 base/standard 档并提交最终金额。
- 进入 bigwin/superwin/megawin 时先提交目标 threshold 的 automatic amount，再切换 tier、rebind 共享 ImgNumber 并把
  同一 formatted text 传给新档 effect，修复 raw amount 已跳而 ImgNumber 仍显示旧值的问题。
- bigwin 之后点击只进入下一个实际存在于本轮 stage list 的庆祝档；不存在下一档时留在当前庆祝档并把金额跳到 final。
- `awaiting-dismiss` 保留为兼容 phase，但语义改为最终档 host-cleanup hold：runtime 继续逐帧推进最后档到 loop，
  `requestAdvance()` 幂等 no-op。
- `requestDismiss()` 仍保留正式 end/drain，`dismissImmediately()` 仍用于下一次 spin、失败和 destroy 的同步清理；
  public 方法注释已明确三者差异。
- Popup Editor wrapper、Scene Layout package runtime 和 Game Layout Editor inspector 没有新增私有状态机，继续自动复用同一
  Popup Core 实现。
- RenderCore README、Popup manifest 文档和 shared game runtime 领域规则已同步。

## 测试覆盖

- bigwin、superwin、megawin 点击后同时断言 active tier、raw amount、formatted amount 与 effect `enter(amountText)`。
- 低于 bigwin 且高于 bet 的获奖从 base 一次跳到 standard 最终值；重复 advance 不关闭。
- 已在 bigwin 但达不到 superwin 时，下一次点击直接跳 final 并保持 bigwin。
- 最后实际档进入 loop 后重复 advance 仍保持 `awaiting-dismiss` 和同一画面；显式 dismiss 仍完整 drain。
- Scene Layout pointer primary interaction 在最终档不清除 active Popup；immediate cleanup 仍 settle completion。
- slot-operation coordinator 继续验证每个 plan start 先触发 `cleanup("next-spin")`，而
  `ConfiguredRoundTarget.cleanup()` 现有 wiring 调用 `dismissActiveAwardCelebrationImmediately()`。

## 与计划的实现差异

- 未修改 `configured-round-adapter.test.ts`。当前 HEAD 中该文件已有 13 个与任务 235 无关的基线失败，全部在 round 行为前因
  旧 fixture 的 `scene layout manifest.nodes must be a non-empty array` 失败。为避免扩大范围修复旧 fixture，next-spin 顺序
  使用可运行的 `slot-operation/coordinator.test.ts` 与现有 `ConfiguredRoundTarget.cleanup()` wiring 验证。
- 没有修改 `award-sequence.ts`、Popup schema、Editor app 或 standalone `src/win-amount` player；现有 stage list 已足以表达
  所需跳档目标。

## 自动验收

```text
PASS  pnpm --filter @slotclientengine/rendercore exec vitest run
      tests/popup/award-sequence.test.ts
      tests/popup/award-player.test.ts
      tests/scene-layout/package-runtime.test.ts
      tests/slot-operation/coordinator.test.ts
      4 files, 58 tests passed

PASS  pnpm --filter @slotclientengine/rendercore typecheck

PASS  pnpm exec prettier --check <任务 235 实际修改文件与计划/报告>

PASS  git diff --check
```

补充基线检查：原计划包含的 `tests/scene-layout/configured-round-adapter.test.ts` 单独运行时有上述 13 个既有 fixture 失败；
同次运行的 `package-runtime.test.ts` 通过。本任务没有修改该测试文件或相关 manifest parser。

执行前使用 Node 24 和 `pnpm install --frozen-lockfile` 恢复 workspace 依赖；安装内容来自本机 pnpm store，
`pnpm-lock.yaml`、package manifest 和 workspace 配置均未修改。

## 待用户完成的浏览器验收

1. Popup Editor：最终值低于 bigwin 时，在 base/standard 计数中点击一次，确认金额直接到 final；再次点击 Popup 不消失。
2. Popup Editor：最终值达到 megawin 时连续点击，确认 ImgNumber 与画面依次同步落在 bigwin、superwin、megawin 阈值，
   最后持续 loop。
3. Game Layout Editor：播放 mode award，确认 canvas/keyboard 行为与 Popup Editor 一致，最终档再次点击不关闭。
4. 开始下一次真实 configured spin，确认上一轮 Popup 在 reel 开始前立即消失且没有 end 残留。

浏览器真实渲染与交互验收按用户约定未由本执行会话代跑。

## 剩余风险

- 仓库内若有绕过 configured Scene Layout round adapter 的自定义 programmatic Popup owner，仍需按其 lifecycle 显式调用
  `closePopup()` 或 `dismissImmediately()`；runtime 不猜测任意 caller 的 spin 边界。
- `awaiting-dismiss` 名称为兼容保留，含义已不再是“必须等待玩家点击”；仓库内已知 Editor/runtime consumer 均复用 Core，
  浏览器状态提示是否符合产品文案由本次人工验收确认。
