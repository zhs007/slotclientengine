# 181 rendercore awaitable symbol state playback 执行报告

## 结果

任务 181 已完成代码、测试和文档实现。rendercore 保留逐帧 `update(deltaSeconds)` 推进动画，新增由真实 state playback 边界完成的 Promise；game002 transform 与 FreeGame 已迁移到 awaitable API，不再轮询 loop/once completion counter。game001、game003 未修改。

浏览器视觉验收按用户要求由用户执行，本报告不以单测或 build 代替该项结果。

## 最终合同

- `RenderSymbol.playState(state, options)` 的 `completion` 必须显式为 `entered | once-complete | next-loop-complete`，且必须与目标 state playback 匹配。
- Promise 只由目标 state 的真实 update 边界完成；outgoing loop、旧 generation 或坐标上的后继 symbol 不会完成当前等待。
- `AbortSignal`、外部 `requestState()`、return-to-default、reset、pool release 和 destroy 会拒绝未完成等待。
- standard reel set 与 grid-cell reel set 的 `playVisibleSymbolStates(...)` 会先校验整个批次，再并行启动 exact symbol waiter；同步或异步失败会取消兄弟请求。
- 旧 fire-and-forget API 与 completion snapshot 暂留兼容，game002 production source 已由 boundary test 禁止重新使用 counter baseline。

## 实际修改

- rendercore symbol：新增 awaitable completion 类型、waiter、目标边界识别和完整取消生命周期。
- rendercore reel：新增单 reel 校验/播放入口、standard/grid-cell 批量 facade 和批次取消 helper。
- game002：runtime 转出批量 API；BaseGame transform、FreeGame trigger/AF/CO 改为 generation-scoped Promise settlement，coordinator 仍在同步 ticker update 边界提交事务。
- 测试：新增 symbol once/loop/entered、outgoing loop 隔离、abort/reset/pool/destroy、grid-cell barrier/preflight/release，以及 game002 成功、失败、取消、回滚和覆盖率保护。
- 文档：更新 rendercore README、shared runtime 稳定规则和 source boundary。

新增文件：

```text
packages/rendercore/src/reel/symbol-state-playback.ts
apps/game002/tests/freegame-operation-target.test.ts
tasks/181-rendercore-awaitable-symbol-state-playback-260807-072308.md
```

计划中的独立 symbol controller/test 文件未新增：waiter 保留在拥有 animation/state lifecycle 的 `RenderSymbol` 内，测试并入现有 `render-symbol.test.ts`；批量取消 helper 独立放在 reel 目录。

## 自动验收

执行环境：Node `24.14.0`；HEAD `61816b10a2f7b8e5e1279f40604d7a3e22b22002`，detached HEAD。

| 命令                                                  | 结果                                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @slotclientengine/rendercore build`    | 通过                                                                                                                                                                |
| `pnpm --filter @slotclientengine/rendercore test`     | 未通过：86 files / 699 tests 通过，5 tests + 1 suite 因当前 HEAD 的 `assets/crave/assets.map.json` 缺少 `symbol-state-textures.manifest.json`、`h1.json` 映射而失败 |
| rendercore 排除上述 3 个缺失夹具测试文件的全套 Vitest | 通过：86 files / 664 tests                                                                                                                                          |
| `pnpm --filter game002 typecheck`                     | 通过                                                                                                                                                                |
| `pnpm --filter game002 test`                          | 通过：24 files / 180 tests；statements 85.15%，branches 80.03%，functions 88.51%，lines 85.90%                                                                      |
| `pnpm --filter game002 build`                         | 通过；只有既有 chunk size warning                                                                                                                                   |
| `git diff --check`                                    | 通过                                                                                                                                                                |

缺失 Crave logical key 在工作区和 `git show HEAD:assets/crave/assets.map.json` 中均不存在，本任务没有修改该资源映射，也没有复制或伪造 fixture。rendercore 本任务直接相关的定向测试和 build 均通过。

## 人工验收

状态：待用户浏览器验收。

建议复验包含 WM、CM、CN、CO 与 FreeGame AF/CO 的 round，重点观察：

- multStart → multIdle 完整 loop → multEnd → change 的顺序和视觉 timing；
- AF feature → change、CO 同批 feature/feature1 → feature2 与 transfer progress；
- cleanup/下一轮后无残留动画、晚到 mutation 或 unhandled rejection；
- ticker 在 Promise 等待期间持续推进。

## 边界与剩余事项

- game001、game003、Game Viewer、scene-layout choreography 等 consumer 仍使用旧兼容 API；不属于任务 181。
- rendercore 全量 coverage 验收仍受当前 Crave logical fixture 映射缺失阻塞；应由资源任务恢复真实映射后重跑，不能在本任务中建立 fallback。
- 未修改 lockfile、manifest、YAML、生成资源、logiccore/gameframeworks public API；未 commit、push 或创建 PR。
