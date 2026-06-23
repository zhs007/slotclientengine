# vnicore advanced playback 任务报告

## 1. 基本信息

- UTC 时间戳：260623-055342
- 执行者：Codex
- 任务计划：`tasks/40-vnicore-advanced-playback.md`
- 主要范围：
  - `packages/vnicore`
  - `apps/anieditorv5viewer`
  - `agents.md`

## 2. 修改文件清单

核心实现：

- `packages/vnicore/src/core/playback-sequence.ts`
- `packages/vnicore/src/core/particle-runtime.ts`
- `packages/vnicore/src/core/index.ts`
- `packages/vnicore/src/pixi/vni-player.ts`

测试：

- `packages/vnicore/tests/core/playback-sequence.test.ts`
- `packages/vnicore/tests/core/particle-runtime.test.ts`
- `packages/vnicore/tests/pixi/vni-player.test.ts`
- `apps/anieditorv5viewer/tests/main.test.ts`

viewer：

- `apps/anieditorv5viewer/src/main.ts`
- `apps/anieditorv5viewer/src/ui/controls.ts`
- `apps/anieditorv5viewer/src/styles.css`

文档和示例：

- `packages/vnicore/README.md`
- `packages/vnicore/docs/api-zh.md`
- `packages/vnicore/docs/usage-zh.md`
- `packages/vnicore/docs/migration-from-viewer-zh.md`
- `packages/vnicore/examples/README.md`
- `packages/vnicore/examples/playback-events.ts`
- `packages/vnicore/examples/segmented-playback.ts`
- `apps/anieditorv5viewer/README.md`

协作规则：

- `agents.md`

## 3. public API 变更摘要

- `VNIPlayer.play(options?)` 保留无参旧行为，并新增：
  - `play({ mode: "timeline" })`
  - `play({ mode: "range", range, loop })`
  - `play({ mode: "segmented", loopStart, loopEnd, keepParticlesAlive })`
- `playRange(...)` 保留，内部仍作为兼容入口。
- 新增 `requestSegmentedPlaybackEnd()`：只允许 active segmented playback 调用，否则显式抛错。
- 新增 `getPlaybackState()`：返回 mode、phase、currentTime、isPlaying、isDrainingParticles、liveParticleCount、loopIndex、keepParticlesAlive。
- 新增 core 纯逻辑：
  - `VNISegmentedPlaybackSequence`
  - `normalizeSegmentedPlaybackOptions(...)`
  - `VNIParticleRuntime`
  - `sampleLiveParticleSprites(...)`

## 4. 粒子排空实现方案摘要

- `seek()` 仍走确定性采样预览，会退出 range/segmented live playback 并清理 live 粒子状态。
- 自然播放路径不再依赖每帧 `clearParticles()` 重建全部粒子，而是按 layer 复用 Pixi sprite 数组。
- 非循环 timeline、非循环 range、segmented end 到终点后进入 `particle-draining`。
- `onPlaybackComplete(...)` 在视觉完全结束后触发；如果终点没有可排空粒子，则可以立即触发。
- `pause()` 冻结主时间轴和粒子年龄；`restart()`、`seek()`、`destroy()` 会清理 live 粒子。
- `getTime()` 在 draining 期间保持终点时间，不为了驱动粒子超过 `project.stage.duration`。

## 5. viewer 高级播放 UI 行为摘要

- 新增独立高级播放区域，不混入基础 Project / Play / Restart / Loop / 时间轴控件。
- 高级区域包含：
  - `loopStart` 数字输入
  - `loopEnd` 数字输入
  - “开始”按钮
  - “结束”按钮
  - “维持粒子活动” checkbox，默认勾选
  - 当前 phase 显示
  - 输入错误状态
- `multipay` 默认 `loopStart = 3`、`loopEnd = 3`；其它项目默认 `min(3, duration)`。
- 非法输入会禁用“开始”并显示错误，不会调用 runtime。
- “结束”只在 segmented `start` / `loop` 阶段可用。
- Project 切换会 destroy 旧 player，并重置高级播放输入、phase 和错误状态。

## 6. agents.md 同步

已更新 `agents.md`。原因：本任务新增长期协作边界，要求 `packages/vnicore` 拥有 segmented 播放状态机和 live 粒子排空语义，viewer 只能做 UI 配置、输入校验、状态展示和调用。

仓库中只有 `agents.md`，未发现 `AGENTS.md`，因此不需要双文件同步。

## 7. 依赖和 lockfile

- 未新增 npm 依赖。
- 未执行 `pnpm install`。
- `pnpm-lock.yaml` 未变化。

## 8. 命令验收结果

任务相关包命令：

- `pnpm --filter @slotclientengine/vnicore typecheck`：通过
- `pnpm --filter @slotclientengine/vnicore lint`：通过
- `pnpm --filter @slotclientengine/vnicore examples:typecheck`：通过
- `pnpm --filter @slotclientengine/vnicore test`：通过，103 tests passed，coverage 总体 statements 91.00 / branches 80.72 / functions 98.03 / lines 91.94
- `pnpm --filter @slotclientengine/vnicore build`：通过
- `pnpm --filter @slotclientengine/vnicore format:check`：通过
- `pnpm --filter anieditorv5viewer typecheck`：通过
- `pnpm --filter anieditorv5viewer lint`：通过
- `pnpm --filter anieditorv5viewer test`：通过，7 tests passed
- `pnpm --filter anieditorv5viewer build`：通过
- `pnpm --filter anieditorv5viewer format:check`：通过

仓库根命令：

- `pnpm typecheck`：通过，21 tasks successful
- `pnpm lint`：通过，21 tasks successful
- `pnpm test`：通过，21 tasks successful
- `pnpm build`：通过，21 tasks successful
- `git diff --check`：通过
- `pnpm format:check`：未通过。失败来自本任务之外的包既有格式问题和生成产物扫描，例如 `apps/gengameconfig/src/*.ts`、`packages/logiccore/src/*.ts`、`apps/reelsviewer/src/*.ts`、`apps/symbolsviewer/src/*.ts`、`apps/uiframeworksviewer/coverage` / `dist`。本任务相关的 `@slotclientengine/vnicore` 和 `anieditorv5viewer` format check 均已通过。

## 9. 浏览器验收结果

计划命令：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

实际结果：

- `0.0.0.0:5175` 启动失败：`listen EPERM: operation not permitted 0.0.0.0:5175`
- 申请提升权限重试被环境自动审核拒绝，原因是当前会话 usage limit。
- 改用更收敛的 `127.0.0.1:5175` 仍失败：`listen EPERM: operation not permitted 127.0.0.1:5175`
- 尝试用 in-app Browser 打开构建产物 `file:///Users/zerro/github.com/slotclientengine/apps/anieditorv5viewer/dist/index.html`，被 Browser URL policy 拒绝。

因此，本次没有完成真实浏览器视觉验收，未能记录截图或 DOM dataset 证据。自动化替代覆盖如下：

- `apps/anieditorv5viewer/tests/main.test.ts` 验证高级播放 UI 存在、输入传给 `play({ mode: "segmented" })`、`keepParticlesAlive: false` 透传、非法输入不调用 runtime、结束按钮调用 `requestSegmentedPlaybackEnd()`。
- `packages/vnicore/tests/pixi/vni-player.test.ts` 验证 segmented hold、range loop、非法状态、seek 退出、particle-draining 和 complete listener 时机。
- `pnpm --filter anieditorv5viewer build` 验证 viewer 生产构建通过。

浏览器验收结论：

- `multipay` 的 `3s/3s` hold-frame 视觉验收：未完成，原因是本地 server 和 file URL 都被当前环境阻止。
- `2.5s/3s` range-loop 视觉验收：未完成，原因同上。
- 桌面和移动布局浏览器截图验收：未完成，原因同上；CSS 已按桌面和移动 grid 规则实现，单元测试覆盖控件存在和状态。

## 10. 最终语义

- `onPlaybackComplete(...)`：视觉完全结束后触发，即时间轴到终点且 live 粒子排空后触发；如果没有 live 粒子，则可立即触发。
- `isPlaying()`：只表示主时间轴是否仍在用户播放推进；particle-draining 期间可能为 `false`。
- `getPlaybackState().isDrainingParticles`：判断内部是否仍在排空粒子。
- `getPlaybackState().phase`：
  - segmented：`start` / `loop` / `ending` / `particle-draining` / `complete`
  - timeline/range：播放中使用 `start`，自然终点后使用 `particle-draining` / `complete`

## 11. 第二遍遗漏检查

- public export 包含新增类型和方法：通过，`core/index.ts` 和 `pixi/vni-player.ts` 已导出。
- `play()` 无参旧行为保持：通过，有旧 RAF 和 reset-from-end 测试。
- `playRange(...)` 旧入口保持：通过，range 测试仍覆盖。
- `setLoop(false)` 不破坏 segmented 等待用户结束语义：通过，player 测试覆盖。
- 非法 segmented 时间显式失败：通过，core 和 player 测试覆盖。
- `loopStart === loopEnd` hold frame：通过，core 和 player 测试覆盖。
- `loopStart < loopEnd` range loop：通过，core 和 player 测试覆盖。
- `keepParticlesAlive` 默认 true：通过，core 测试和 viewer 默认 checkbox 覆盖。
- `keepParticlesAlive` 传入 runtime：通过，viewer 测试覆盖 false 透传，player 状态覆盖。
- 播放完成后停止发射并排空：通过，particle runtime 和 player 测试覆盖；真实浏览器视觉未验收。
- 粒子排空后进入 complete：通过，player 测试覆盖。
- `pause()` 冻结粒子年龄：通过语义实现；未单独新增断言。
- `seek()` / `restart()` / `destroy()` 清理 live 粒子：`seek()` 和 `restart()` 测试覆盖，`destroy()` 旧测试覆盖 diagnostics/粒子清理。
- `particle_combo.sourceOpacity = 0` 粒子仍显示：旧 player 测试保留。
- per-layer 粒子层级保持：旧 player 测试保留。
- 0 秒首帧粒子漏出：旧 sampler 行为保留。
- viewer 高级播放 UI 独立：通过，结构和测试覆盖。
- 移动端布局不溢出：CSS 已实现；真实浏览器截图未完成。
- README、中文 API、中文使用文档、migration 文档、示例、viewer README 已同步。
- `agents.md` 已按长期边界同步。
- 任务报告已生成。
- `git status --short` 检查：仅本任务相关改动和原本未跟踪的计划文件。

## 12. 已知限制

- 浏览器视觉验收未完成，原因是当前环境禁止本地端口监听，且 in-app Browser 禁止打开 `file://` 构建产物。
- 根 `pnpm format:check` 未通过，原因是本任务范围外的既有包源码格式和生成产物扫描；最新失败点包括 `apps/gameclientcli/src/gameplay-stats.ts`、`apps/gameclientcli/tests/fixtures/logic-gmi.ts`、`apps/gameclientcli/tests/gameplay-stats.test.ts` 以及若干 coverage 输出。`@slotclientengine/vnicore` 和 `anieditorv5viewer` 的 format check 均通过。

## 13. 实际验收反馈修正

用户实际验收 `multipay` 的 `3s/3s` hold-frame 时发现：进度停在 3s，但粒子会明显停一会儿、再发射、再停一会儿。

原因：第一版 segmented loop 的 particle clock 使用 `3s -> project.stage.duration` 循环；`multipay` 的 `particle_wall` 动画实际 active window 是 `1.3s -> 5.0s`，因此 `5.0s -> 6.8s` 会采不到发射器，视觉上形成停发空窗。第二版曾尝试按粒子动画 active window 循环，但这仍不符合最终语义。第三版把 particle sample time 固定在 loop 点，又导致粒子本身也被定格，连续发射器不再继续发射。

最终修复：segmented loop 拆成两层时间。非粒子动画和发射器配置使用 segmented 当前 loop 时间；live 粒子 runtime 维护独立的 animation elapsed，并按真实 `deltaSeconds` 继续推进。`loopStart === loopEnd` 时，发射器维持该单点的配置，但已经发射的粒子继续老化、移动，`particle_wall` 这类连续发射器也会继续发射；`loopStart < loopEnd` 时，发射器配置只在 `[loopStart, loopEnd)` 内循环，live 粒子不会因为 loop 时间回绕而重置。`multipay 3s/3s` 因此会维持 3s 的发射器配置，同时粒子继续正常运动和发射。

补充验证：

- `pnpm --filter @slotclientengine/vnicore typecheck`：通过
- `pnpm --filter @slotclientengine/vnicore lint`：通过
- `pnpm --filter @slotclientengine/vnicore test`：通过，104 tests passed
- `pnpm --filter @slotclientengine/vnicore format:check`：通过
- `pnpm --filter @slotclientengine/vnicore examples:typecheck`：通过
- `pnpm --filter @slotclientengine/vnicore build`：通过
- `pnpm --filter anieditorv5viewer typecheck`：通过
- `pnpm --filter anieditorv5viewer lint`：通过
- `pnpm --filter anieditorv5viewer test`：通过，7 tests passed
- `pnpm --filter anieditorv5viewer format:check`：通过
- `pnpm --filter anieditorv5viewer build`：通过
- `pnpm typecheck`：通过，21/21 tasks successful
- `pnpm lint`：通过，21/21 tasks successful
- `pnpm test`：通过，21/21 tasks successful
- `pnpm build`：通过，21/21 tasks successful
- `git diff --check`：通过
- `pnpm format:check`：未通过，失败点为任务范围外 `gameclientcli` 格式和 coverage 产物扫描；本任务相关包 format check 已单独通过
