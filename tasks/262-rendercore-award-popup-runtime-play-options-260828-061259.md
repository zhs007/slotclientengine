# 任务 262：Award Popup Runtime 播放参数执行报告

## 1. 执行状态

- 代码、文档、定向自动化、RenderCore typecheck 与直接 facade typecheck 已完成。
- 真实浏览器视觉与交互验收按用户要求未执行，由用户处理。
- 执行分支：`codex/task-262-award-popup-runtime-play-options`。
- 更新后的执行基线：最新本地 `main` `27c33dd41529e4f052e5871e76905ae65bf9b9c7`，已包含任务 261；执行前已 fetch `origin` 与 `gitee`，两者的 `main` 均旧于该提交。

## 2. 最终实现

- 新增 public `SceneLayoutAwardCelebrationPlayInput`。`playAwardCelebrationForCurrentMode()` 现在每次必须传入 `formatMoney(amountRaw)`，并可传正有限 `amountDurationScale`；省略 scale 等价于 `1`。
- Popup Core `AwardCelebrationRuntime.start(input, options?)` 支持 per-play `formatAmount` 与 `amountDurationScale`。缓存 player 在 complete、immediate dismiss、start rollback 和 destroy 时恢复构造期 formatter，不把本次闭包泄漏到后续 legacy start 或 programmatic Popup。
- Scene Layout FIFO 每项捕获自己的 formatter、scale 与 raw amounts，只在该项激活时传给缓存 player。非法 formatter/scale 在入队前返回 rejected Promise；激活期 formatter 失败沿用现有 Popup failure/reject/queue continuation 边界。
- amount motion 先构造任务 259 的基准轨迹，再做严格时间等比变换：duration 乘 `s`、rate 除 `s`、acceleration 除 `s²`、terminal brake duration 乘 `s`。因此 `0.8` 保持 threshold、amount path、brake distance 和 final 不变，只把整条数字时间轴缩短到 80%。
- VNI/Spine/粒子/音频与宿主 delta 不参与缩放。自然和点击跨档继续复用同一 stage switch：outgoing tier 当帧隐藏，新档立即显示，不等待旧动画 completion。
- 补齐 outgoing tier 的 hidden end/update/drain。对跨档复用同一个 v6 logical layer runtime 的情况，只 drain 不被新档接管的 detached layer，避免共享 runtime 在同一帧重复 update 或旧 ending 干扰新档。

## 3. 实际修改文件

新增：

- `tasks/262-rendercore-award-popup-runtime-play-options.md`
- 本执行报告

修改：

- `packages/rendercore/src/popup/core/types.ts`
- `packages/rendercore/src/popup/core/index.ts`
- `packages/rendercore/src/popup/award-player.ts`
- `packages/rendercore/src/popup/award-amount-motion.ts`
- `packages/rendercore/src/scene-layout/types.ts`
- `packages/rendercore/src/scene-layout/package-runtime.ts`
- `packages/rendercore/tests/popup/award-amount-motion.test.ts`
- `packages/rendercore/tests/popup/award-player.test.ts`
- `packages/rendercore/tests/scene-layout/package-runtime.test.ts`
- `packages/rendercore/README.md`
- `docs/popup-manifest.md`
- `docs/crave-task203-manual-migration.md`
- `docs/agent-rules/shared-game-runtime.md`

未修改 Popup/Scene Layout schema、Editor project、资源、游戏 app、依赖声明或 lockfile。`popup/core/index.ts` 是计划文件范围外的最小 type barrel 同步，用于公开新 playback options；未扩大架构职责。

## 4. 关键决策与计划适配

- 最新 `main` 比计划基线前进 5 个提交，目标 award API/motion/scheduler 未冲突，因此直接按计划适配，无需重新规划。
- `formatMoney` 接收当前 floored raw amount，与 `betAmountRaw/winAmountRaw` 单位一致；货币符号、小数位和 locale 由 consumer 负责。
- scale 为 duration multiplier，不是 playback rate；`0.8` 等价于 1.25 倍数字速度。`0`、负数、`NaN` 和无穷值显式失败，manifest 自身已有的 zero-duration stage 合同不变。
- 初始实现验证时发现旧档虽隐藏并收到 `requestEnd()`，但没有进入 hidden update 队列。最终实现新增 per-tier detached ending layer 集合，并直接测试普通独立 runtime 会继续 drain、跨档共享 v6 runtime 只 update 一次。
- 依赖起初未安装；按仓库约定执行 frozen-lockfile 安装。沙箱禁止连接本机代理后，经批准在沙箱外重试成功；lockfile 未变化。

## 5. 自动化验收

环境：Node.js `v24.14.0`、pnpm `10.0.0`。

通过：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/award-amount-motion.test.ts tests/popup/award-player.test.ts
# 2 files / 38 tests passed

pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime.test.ts -t "starts, advances and clears the popup bound to the current mode"
# 1 passed / 22 skipped

pnpm --filter @slotclientengine/rendercore typecheck
# passed（含 prepare:deps）

pnpm --filter @slotclientengine/gameframeworks typecheck
# passed（含直接依赖 build）

pnpm exec prettier --check <任务 262 代码、测试、文档和报告文件>
# passed

git diff --check
# passed
```

首次在 prepare:deps 前运行 Vitest 因 `@slotclientengine/audiocore/data` 尚未 build 而失败；完成 frozen install 并通过 RenderCore typecheck/prepare:deps 后，计划内定向测试全部通过。该环境准备失败不是生产代码回归。

## 6. 浏览器人工验收交接

按用户要求，本次未启动或控制浏览器。请人工验证：

1. 对同一高额获奖分别使用 `amountDurationScale: 1` 与 `0.8`：数字跨档和最终减速应整体缩短到 80%，VNI/Spine、粒子和 end 速度不变。
2. 使用动画明显长于数字档时间的 Popup：自然抵达 threshold 时旧档应当帧消失、新档立即显示，无旧档叠在背后；最终 end/drain 正常完成且控制台无错误。
3. 连续或排队播放两次并传不同 `formatMoney`：第二项激活前不应调用自己的 formatter，激活后金额只使用第二项格式；legacy start 不继承前一次 override。

浏览器验收结果可补充记录浏览器版本、viewport、输入金额/scale、通过项、控制台和必要截图；自动化结果不能替代该视觉签收。

## 7. 剩余风险

- 数学时间等比、FIFO 隔离、shared/detached layer lifecycle 已有自动化保护；真实素材下的节奏观感和字体 glyph 覆盖仍需浏览器验收。
- `playAwardCelebrationForCurrentMode()` 新增必填 `formatMoney` 是有意的源码合同变化。仓库内测试与 Crave 迁移文档已更新，但外部 Crave 源码未由本任务直接修改，仍需按文档迁移并 typecheck。
- 未 commit、未 push、未创建 PR。
