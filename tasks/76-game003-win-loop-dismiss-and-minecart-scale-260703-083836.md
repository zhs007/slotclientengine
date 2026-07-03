# 76 game003 win loop dismiss and minecart scale 任务报告

## 实现摘要

- `packages/rendercore` 的中奖金额动画 `requestAdvance()` 已支持在 `awaiting-dismiss` 阶段再次点击时走 dismiss/end：有 active tier 时播放当前 tier end 段，非 tier 金额直接隐藏并进入 `complete`。
- `packages/rendercore` 新增通用可见 symbol 几何快照 API，app 可读取 stopped reel 的 cell center / cell size，不在 `apps/game003` 复制 reel 坐标算法。
- `apps/game003` 新增 `game003WinSymbolLoop` 严格配置解析和 runtime：按 `bg-wins.usedResults` 顺序首轮播放，首轮完成后 `playSpin()` 可 resolve，后续作为 lingering loop 按配置 pause 循环到下一次 spin 清理。
- 每个 `bg-wins` result 必须有 finite positive `cashWin`；result 金额 overlay 使用 `formatServerUsdAmount(cashWin)`，锚到该 result 中心中奖 symbol 的中间偏下位置，result win 状态结束时隐藏。
- 矿车 payload `symbolScale` 已从 `0.72` 改为 `1`，表示不在 bg-bar manifest / catalog scale 外额外缩小。

## 修改文件清单

- rendercore：`packages/rendercore/src/reel/{types,render-reel,render-reel-set}.ts`、`packages/rendercore/src/win-amount/win-amount-player.ts` 及对应测试。
- game003 runtime/config：`apps/game003/src/game-adapter.ts`、`game-demo.ts`、`skin-config.ts`、`win-sequence.ts`、`minecart-interaction-runtime.ts`，新增 `win-symbol-loop-config.ts`、`win-symbol-loop.ts`。
- game003 静态配置和生成物：`apps/game003/config/game-static.yaml`、`apps/game003/src/generated/game-static.generated.ts`。
- 测试：新增 `win-symbol-loop-config.test.ts`、`win-symbol-loop.test.ts`，并更新 adapter/demo/static/minecart/win-sequence/source-boundary 测试。
- 文档/协作规则：`apps/game003/README.md`、`agents.md`。

## 行为合同

- win amount 最后点击：canvas 仍只转发 `requestAdvance()`；最终 `awaiting-dismiss` 后再次点击由 rendercore 通用 player 触发 dismiss/end 或直接隐藏，`dismissing` 阶段重复点击保持 no-op。
- win symbol loop：`playSpin()` 只等待首轮 result 顺序展示；首轮完成后 lingering loop 继续按 `usedResults -> pause -> usedResults` 播放，下一次 spin 开始显式清理 loop 和 result amount overlay。
- result 金额 overlay：金额只来自单个 result 的 positive `cashWin`，格式化只走 `formatServerUsdAmount`；锚点选择规则为中心点平均值最近的实际中奖 symbol，平局按 `x/y` 升序；result win 状态结束即隐藏。
- minecart payload scale：`payload.symbolScale: 1` 是 bg-bar catalog scale 上的额外缩放系数，当前表示保持原始显示尺寸。

## 生成物和依赖

- 已执行 `game003 generate:static-config`；`game-static.generated.ts` 更新了 `game003WinSymbolLoop` 和 `payload.symbolScale: 1`。
- `game-loading.generated.ts` 无变化。
- 未新增依赖，`pnpm-lock.yaml` 无变化。

## 文档同步

- 已更新 `agents.md`：记录 win amount 最后点击 dismiss、`bg-wins` 首轮 blocking / 后续 lingering、result 金额 overlay、矿车 payload 原 scale 合同。
- 已更新 `apps/game003/README.md`：替换旧的点击不关闭/只播一次描述，补充 `game003WinSymbolLoop`、overlay 锚点和 payload scale 说明。

## 验收结果

- `env CI=true pnpm --filter @slotclientengine/rendercore test`：通过，28 files / 171 tests。
- `env CI=true pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- `env CI=true pnpm --filter game003 test`：通过，25 files / 114 tests。
- `env CI=true pnpm --filter game003 typecheck`：通过。
- `env CI=true pnpm --filter game003 check:static-config`：通过。
- `env CI=true pnpm --filter game003 release:check`：通过；仅有 Vite chunk size warning。
- `env CI=true pnpm lint`：通过，23 tasks。
- `env CI=true pnpm --filter game003 format:check`：通过。
- `node_modules/.bin/prettier --check` 本任务触及的 rendercore 文件：通过。
- `git diff --check`：通过。
- 二次 grep 检查：未发现 `symbolScale: 0.72` 残留；未发现 shared 包写入 `bg-wins` / `game003WinSymbolLoop` / minecart 语义；`Game003SkinConfig` 暴露严格解析后的 `winSymbolLoop`。

## 未通过或待人工项

- `env CI=true pnpm typecheck`：失败在未改动的 `apps/uiframeworksviewer/tests/demo-game.test.ts`，测试假 mount context 缺少 `getViewport` / `onViewportChange`；后续并发任务被 turbo 终止。该失败不来自本任务改动，game003 和 rendercore typecheck 均已单独通过。
- `env CI=true pnpm format:check`：失败在未改动包的历史格式问题，首个失败为 `apps/reelsviewer`，另有 `victoryani-demo`、`spine2victoryani-demo` 等提示；未对无关包做批量格式化。本任务涉及的 game003 包 format check 通过，rendercore 触及文件 direct prettier check 通过；rendercore 包级 format check 仍因未改动的 `packages/rendercore/scripts/generate-symbol-state-textures.mjs` 失败。
- 浏览器验收待人工确认。

## 复验反馈修正

- 用户复验发现 bigwin 播放期间背后的 symbol 中奖流程没有继续走。原因是 adapter 把“首轮完成后不再阻塞 `playSpin()`”误实现成了“pending 期间首轮完成后不再 tick `winSymbolLoop`”。
- 已修正 `apps/game003/src/game-adapter.ts`：pending 仍未 resolve 时，只要 `winSymbolLoop` 不是 `idle` 就继续 update；`winSequenceComplete` 只作为 resolve 条件，不再控制 loop 是否播放。
- 已更新 `apps/game003/tests/game-adapter.test.ts`：覆盖金额动画仍 blocking 时，首轮 symbol 展示完成后继续 tick 足够久，必须重新进入下一轮 symbol win 请求。
- 复验命令：`env CI=true pnpm --filter game003 test` 通过，25 files / 114 tests；`env CI=true pnpm --filter game003 typecheck` 通过。

## 复验反馈修正 2

- 用户复验发现 `game003` 高级图标 `H1-H5` 的 symbol win 动画不像 Spine，而像旧默认 win。原因是 `assets/game003-s1/symbol-state-textures.manifest.json` 中 `WL/H1/H2/H3/H4/H5.win` 仍声明为 `builtin`，而这些 skeleton 实际都存在 Spine `Win` 动画。
- 已修正 manifest：`WL/H1/H2/H3/H4/H5.win` 改为 `kind: "spine"`，`animationName: "Win"`，`loop: false`，继续由 rendercore manifest resolver 驱动，不在 game003 app 层写 symbol 分支。
- 已更新 `apps/game003/tests/symbol-animation-config.test.ts`、`apps/game003/tests/static-config.test.ts` 和 `packages/rendercore/tests/symbol/manifest.test.ts`，覆盖 game003 resolver 和 rendercore manifest 资源解析都必须把高级图标 win 解析为 Spine。
- 复验命令：`env CI=true pnpm --filter game003 test` 通过，25 files / 114 tests；`env CI=true pnpm --filter game003 typecheck` 通过；`env CI=true pnpm --filter @slotclientengine/rendercore test` 通过，28 files / 171 tests；`env CI=true pnpm --filter @slotclientengine/rendercore typecheck` 通过；`env CI=true pnpm --filter game003 check:static-config` 通过；`env CI=true pnpm --filter game003 release:check` 通过，仅保留 Vite chunk size warning；`git diff --check` 通过。

## 复验反馈修正 3

- 用户复验发现 `game003` 高级图标 `H1-H5` 进入 win 前、win 播完回 idle 时仍会闪一下。进一步判断后采用用户指出的正确模型：同一个 symbol 的 Spine 动画都在同一份 skeleton / atlas / texture 中，`Idle -> Win -> Idle` 不应销毁重建 Spine 对象，只应复用 player 并切换 animation。
- 已修正 `packages/rendercore/src/symbol/spine-animation.ts`：按 `RenderSymbol root + symbol + skeleton + atlas + texture + atlasPage` 缓存 Spine player；同一 symbol 状态切换时引用计数保持 player 不被销毁，只调用 `play(animationName)`；最后一个 owner 销毁时才释放 player。
- 已修正 `packages/rendercore/src/symbol/render-symbol.ts`：状态切换顺序改为先 reset/acquire 新动画，再 destroy/release 旧动画，确保同一 cache key 切换时引用计数不会短暂归零。
- 已修正 `packages/rendercore/src/reel/render-reel.ts`：slot symbol code 真实变化时先销毁旧 `RenderSymbol`，再创建新 symbol，使 Spine cache 的释放边界和“symbol 真的发生变化”一致。
- 已更新 `packages/rendercore/tests/symbol/spine-animation.test.ts`：覆盖同一 root 上 `normal -> win` 只创建一个 Spine player，销毁旧 state wrapper 不销毁 player，最后一个 owner 销毁才清理。
- 复验命令：`env CI=true pnpm --filter @slotclientengine/rendercore test` 通过，28 files / 171 tests；`env CI=true pnpm --filter @slotclientengine/rendercore typecheck` 通过；`env CI=true pnpm --filter game003 test` 通过，25 files / 114 tests；`env CI=true pnpm --filter game003 typecheck` 通过；`env CI=true pnpm --filter game003 check:static-config` 通过；`env CI=true pnpm --filter game003 release:check` 通过，仅保留 Vite chunk size warning；`git diff --check` 通过。
