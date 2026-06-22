# 37 任务执行报告：game001 接入 gameframeworks

- 报告时间：260622-091639 UTC
- 任务计划：`tasks/37-game001-gameframeworks-integration.md`
- 执行范围：`apps/game001`、`packages/gameframeworks`、`packages/rendercore/src/reel/spin-strip.ts`、`pnpm-lock.yaml`

## 实现摘要

已将 `apps/game001` 从私有 `netcore` 客户端与本地 Spin UI 迁移为 `@slotclientengine/gameframeworks` 驱动的应用入口：

- `apps/game001/src/main.ts` 只负责创建 `createSlotGameFramework()`、注入 game001 adapter、传入 live 配置和固定画布设计尺寸。
- `apps/game001/src/game-adapter.ts` 承担 Pixi/rendercore 视觉职责，挂载到 framework 的 `gameLayer`，加载静态图与 symbol texture，应用 live `defaultScene`，并在 `playSpin()` 中等待 rendercore 卷轴动画完成后才 resolve。
- `apps/game001/src/framework-config.ts` 统一解析 `VITE_GAME001_*` 环境变量，复用历史 live 默认值，校验 `ws://` / `wss://`、非空字符串、正数下注参数和整数 `autonums`。
- 删除旧的 `apps/game001/src/game-client.ts`、`apps/game001/src/spin-button.ts` 以及对应旧测试，避免 game001 绕过 facade 自己处理网络、collect 或 Spin UI。
- `apps/game001/package.json` 的运行依赖已收敛为 `@slotclientengine/gameframeworks`、`@slotclientengine/rendercore`、`pixi.js`；未再直接依赖 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`。
- `apps/game001/README.md` 已同步新的 facade 架构、live env、Spin 流程和 fail-fast 边界。

## gameframeworks 同步

为让游戏应用通过 facade 获取必要逻辑 helper，而不是直接依赖底层包，`packages/gameframeworks` 增加：

- `createGameConfig` 从 facade 入口导出。
- `GameConfigPaytableEntry`、`LogicGameConfig`、`LogicReels`、`ReelStopYOptions` 类型从 facade 类型面导出。
- README 补充游戏配置 helper 用法。
- `vite.config.ts` 不再把内部 workspace 包作为浏览器构建 external，避免应用端加载 facade dist 时继续暴露底层 CommonJS/ESM 命名导出问题。

## rendercore 同步

浏览器验收时发现 game001 仍通过 rendercore 源码 alias 触发 `logiccore/dist/index.js does not provide an export named 'LogicReelsModel'`。已在 `packages/rendercore/src/reel/spin-strip.ts` 去掉 `LogicReelsModel` 运行时依赖，改为直接使用传入的 `LogicReels` 接口读取当前可见区 symbol；该改动保持 rendercore API 不变，并通过 rendercore 测试、lint、typecheck、build。

## 测试与边界覆盖

新增/更新 game001 测试覆盖：

- `tests/game-adapter.test.ts`：验证 adapter 挂载到 `gameLayer`、只在 live `defaultScene` 存在时应用初始局面、`playSpin()` 等待动画完成后才 resolve、重复 spin 与异常路径 fail-fast。
- `tests/framework-flow.test.ts`：用假 client/adapter 验证 framework 流程中 spin 参数、adapter 动画完成、之后再由 gameframeworks 判断并执行最终 collect；adapter reject 时不 collect；并发 spin fail-fast。
- `tests/source-boundary.test.ts`：扫描 game001 源码、测试、package 和 Vite 配置，禁止直接引用 `netcore/uiframeworks/logiccore`，并校验直接运行依赖清单。
- `tests/env.test.ts`：覆盖新增 framework config 和 `autonums` 解析。

## 严格验收结果

已执行并通过：

- `pnpm install`
- `pnpm --filter @slotclientengine/gameframeworks lint`
- `pnpm --filter @slotclientengine/gameframeworks test`：8 files / 20 tests passed
- `pnpm --filter @slotclientengine/gameframeworks typecheck`
- `pnpm --filter @slotclientengine/gameframeworks build`
- `pnpm --filter @slotclientengine/gameframeworks format:check`
- `pnpm --filter @slotclientengine/rendercore lint`
- `pnpm --filter @slotclientengine/rendercore test`：16 files / 85 tests passed
- `pnpm --filter @slotclientengine/rendercore typecheck`
- `pnpm --filter @slotclientengine/rendercore build`
- `pnpm exec prettier --check packages/rendercore/src/reel/spin-strip.ts`
- `pnpm --filter game001 lint`
- `pnpm --filter game001 test`：9 files / 43 tests passed
- `pnpm --filter game001 typecheck`
- `pnpm --filter game001 build`
- `pnpm --filter game001 format:check`
- `pnpm lint`：20 packages passed
- `pnpm test`：20 packages passed
- `pnpm typecheck`：20 packages passed
- `pnpm build`：20 packages passed
- `git diff --check`

已执行且预期失败/范围外：

- `pnpm format:check`：失败在既有任务外格式债，首个失败包为 `@slotclientengine/pixiani`，涉及 `src/ani/index.ts`、`src/core/index.ts`、`src/index.ts`、`src/layout.ts`、`tests/layout.test.ts`、`tsconfig.build.json`、`tsconfig.eslint.json`。该命令同时打印了多个包的 `coverage/` 格式警告。
- `pnpm --filter @slotclientengine/rendercore format:check`：失败在既有 package-wide 格式债，包含 `coverage/`、`dist/` 以及 rendercore 多个旧源码/测试文件。当前修改文件 `packages/rendercore/src/reel/spin-strip.ts` 已单独通过 Prettier 检查。

## 边界搜索

以下命令均无输出，表示没有发现被禁止的实现路径或旧 UI/客户端残留：

- `rg -n "@slotclientengine/(netcore|logiccore|uiframeworks)" apps/game001/src apps/game001/tests apps/game001/package.json apps/game001/vite.config.ts --glob '!source-boundary.test.ts'`
- `rg -n "collect\\(|shouldCollectGame001FinalResult|SlotcraftClient|createGame001Client" apps/game001/src apps/game001/tests`
- `rg -n "spin-button|createGame001SpinButton|game001 spin" apps/game001/src apps/game001/README.md`
- `rg -n "collect.*动画|动画.*collect|replay|fixture|mock" apps/game001/README.md apps/game001/src`

## 浏览器验收

启动命令：

- 首次无提权启动 `pnpm --filter game001 dev -- --host 127.0.0.1 --port 5205` 失败：`listen EPERM: operation not permitted 127.0.0.1:5205`。
- 使用同一命令提权后启动成功，验收地址：`http://127.0.0.1:5205/`。

验收过程：

- 首次浏览器加载发现 gameframeworks dist 仍把内部包 external，修复为 facade browser dist 自包含后重验。
- 第二次浏览器加载发现 rendercore 源码 alias 仍触发 `LogicReelsModel` 运行时命名导出错误，修复 `spin-strip.ts` 后重验。
- 桌面视口 `1280x720`：存在 `.slot-ui-page`、`.slot-ui-frame`、`.slot-ui-game-layer`、`.slot-ui-overlay`；不存在旧 `.game001-page`、`.game001-frame`；canvas parent 为 `.slot-ui-game-layer`；画布 backing size 为 `941x1672`；frame 缩放后完整落入视口，Spin 按钮数量为 1，连接错误时按钮 disabled。
- 移动视口 `390x844`：frame rect 为 `390x693`，canvas backing size 为 `941x1672`，完整显示主舞台和底部 HUD，Spin 按钮数量为 1，连接错误时按钮 disabled。
- live 服务返回 `noticemsg2`，`msgcode: 6`，`dtapierrcode: "000101|211005"`。该错误作为外部 live fail-fast 状态展示，没有引入本地替代数据或静默兜底。

## 二次遗漏检查

- 旧私有客户端与按钮文件已删除，旧测试已删除。
- game001 运行依赖没有直接底层包。
- game001 源码和 README 没有本地替代数据、旧按钮文案或手写 collect 流程残留。
- adapter 的 `playSpin()` Promise 只在 rendercore 卷轴完成并校验最终视觉快照后 resolve；最终 collect 由 gameframeworks 在 adapter resolve 后执行。
- live `defaultScene` 缺失时不会发明初始局面。
- README 已更新为当前 architecture、env、运行命令和验收边界。
- 本任务没有改变仓库协作规则、目录规范或根级基础脚本，因此未更新 `AGENTS.md`。

## 剩余风险

- 全仓 `format:check` 仍受任务外格式债阻断；本任务触达的 game001、gameframeworks 和 rendercore 修改文件已完成对应格式验收。
- 当前默认 live token/server 返回外部错误，浏览器无法用默认配置完成真实 live spin 动画；collect 时序通过 gameframeworks flow 单测和 adapter 动画完成单测覆盖。

## 补充修正：脱敏轮带 stopY 不匹配

- 修正时间：260622-103125 UTC
- 背景：使用外部提供的 live token 启动后，live `defaultScene` 返回第 0 轴可见列 `[2,0,2,0,3]`，当前前端本地 `reels01` 无法反查该列 stopY。该情况不是服务端数据错误，而是前端轮带可能是裁剪/脱敏轮带，不能要求它完整复刻真实轮子。
- 实现调整：`RenderReel` 新增静态可见列与目标可见列注入能力；`createTemporaryReelStrip()` 支持把当前可见列和服务器目标列写入本次 spin 的临时轮带。`game001` 在 stopY 无候选时使用合成落点生成动画计划，并把服务器 scene 注入临时轮带，最终停在服务器返回的可见列。
- 保留边界：主 scene 仍必须是完整 `5 x 5`；未知 symbol、资源缺失、动画完成后可见列不等于服务器目标 scene、locked axis 不一致仍然显式失败；没有切换到本地替代数据。

补充验收：

- `pnpm --filter @slotclientengine/rendercore test -- tests/reel/render-reel.test.ts tests/reel/spin-strip.test.ts`：通过，rendercore 16 files / 86 tests passed。
- `pnpm --filter game001 test -- tests/game-demo.test.ts tests/main-reels-view.test.ts tests/game-adapter.test.ts`：通过，game001 9 files / 45 tests passed。
- `pnpm --filter @slotclientengine/rendercore lint`
- `pnpm --filter @slotclientengine/rendercore typecheck`
- `pnpm --filter @slotclientengine/rendercore build`
- `pnpm --filter game001 lint`
- `pnpm --filter game001 typecheck`
- `pnpm --filter game001 build`
- `pnpm --filter game001 format:check`
- `pnpm exec prettier --check packages/rendercore/src/reel/types.ts packages/rendercore/src/reel/spin-strip.ts packages/rendercore/src/reel/render-reel.ts packages/rendercore/tests/reel/render-reel.test.ts`
- `git diff --check`

补充浏览器验收：

- 启动命令：

```bash
VITE_GAME001_TOKEN=d8c08cac23c24f3b87781b7591a1505b VITE_GAME001_GAMECODE=CqbQ0Y7gtBpO5419j8h02 pnpm --filter game001 dev -- --host 127.0.0.1 --port 5205
```

- 页面地址：`http://127.0.0.1:5205/`
- 页面状态：`Ready`；该次验收发生在 USD formatter 接入前，当时显示 Balance `214,210.00`、Bet `10.00`；`.slot-ui-page`、`.slot-ui-frame`、`.slot-ui-game-layer`、canvas 均存在；旧 `.game001-page` 不存在。
- 控制台 error：空；未再出现 `LogicParseError: No stop y candidate found ... visibleSymbols [2,0,2,0,3]`。
- 未点击 Spin：避免使用 live token 发起真实下注请求；spin 落地注入逻辑由新增单测覆盖。

## 补充修正：临时轮带按起点/终点写入

- 修正时间：260622-103534 UTC
- 背景：进一步明确前端本地轮带只是本次动画的临时轮带，不应混用旧物理 `currentY` 作为起点窗口来源。
- 实现调整：`createTemporaryReelStrip()` 不再接收 `currentY`。无注入时，临时轮带按 `plan.startY -> plan.finalY` 从本地轮带填充；有注入时，将当前可见列写到本次 plan 的起点窗口，将服务器目标可见列写到本次 plan 的停点窗口。若目标列能在本地轮带找到停点，先用该停点反推起点；若找不到，先确定合成停点，再由 plan 反推起点，两个窗口同样按起点/终点写入。
- 保留边界：服务端 scene 仍是最终视觉真相；本地轮带只提供中间滚动填充，不被当作完整真实轮子。

补充验收：

- `pnpm --filter @slotclientengine/rendercore test -- tests/reel/spin-strip.test.ts tests/reel/render-reel.test.ts`：通过，rendercore 16 files / 87 tests passed。
- `pnpm --filter @slotclientengine/rendercore lint`
- `pnpm --filter @slotclientengine/rendercore typecheck`
- `pnpm --filter @slotclientengine/rendercore build`
- `pnpm --filter game001 test -- tests/game-demo.test.ts tests/main-reels-view.test.ts tests/game-adapter.test.ts`：通过，game001 9 files / 45 tests passed。
- `pnpm --filter game001 build`
- `pnpm exec prettier --check packages/rendercore/src/reel/types.ts packages/rendercore/src/reel/spin-strip.ts packages/rendercore/src/reel/render-reel.ts packages/rendercore/tests/reel/spin-strip.test.ts packages/rendercore/tests/reel/render-reel.test.ts`
- `git diff --check`

## 补充修正：game001 金额按美元展示

- 修正时间：260622-103926 UTC
- 背景：live 服务端金额是整数单位，`100` 对应 `1` 美元。game001 之前未传自定义金额 formatter，HUD 会把 `10` 直接显示为 `10.00`，容易误解为 10 美元。
- 实现调整：新增 `apps/game001/src/money.ts`，按 `amount / 100` 格式化为 `en-US` / `USD`；`apps/game001/src/main.ts` 将 `currency: "USD"`、`locale: "en-US"` 和 `formatServerUsdAmount` 传入 `createSlotGameFramework()`。
- 保留边界：只改变 HUD 展示，不改变 `VITE_GAME001_BET`、spin request、balance/win 内部状态或服务端协议值。默认 `VITE_GAME001_BET=10` 仍发送整数 `10`，展示为 `$0.10`。

补充验收：

- `pnpm --filter game001 test -- tests/money.test.ts tests/framework-flow.test.ts tests/env.test.ts`：通过，game001 10 files / 47 tests passed。
- `pnpm --filter game001 lint`
- `pnpm --filter game001 typecheck`
- `pnpm --filter game001 build`
- `pnpm --filter game001 format:check`
- `pnpm exec prettier --check apps/game001/src/money.ts apps/game001/tests/money.test.ts apps/game001/src/main.ts apps/game001/README.md tasks/37-game001-gameframeworks-integration-260622-091639.md`
- `git diff --check`

补充浏览器验收：

- 启动命令：

```bash
VITE_GAME001_TOKEN=d8c08cac23c24f3b87781b7591a1505b VITE_GAME001_GAMECODE=CqbQ0Y7gtBpO5419j8h02 pnpm --filter game001 dev -- --host 127.0.0.1 --port 5205
```

- 页面地址：`http://127.0.0.1:5205/`
- 页面状态：`Ready`；HUD 显示 Balance `$2,162.60`、Win `$0.00`、Bet `$0.10`。
- DOM 状态：`.slot-ui-page` 数量为 `1`，旧 `.game001-page` 数量为 `0`，Spin 按钮 enabled。
- 控制台 error：空。
- 未点击 Spin：避免使用 live token 发起真实下注请求。
