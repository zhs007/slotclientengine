# 26 uiframeworks DOM Slot UI Bootstrap 任务报告

生成时间：2026-06-12T07:08:22Z

## 任务摘要

已按 `tasks/26-uiframeworks-dom-slot-ui-bootstrap.md` 落地一个 DOM/CSS-only 的 slot UI 框架包和可运行 viewer：

- 新增 `packages/uiframeworks`，提供可复用的 slot UI HUD、状态管理、live session、netcore/logiccore 接入和样式出口。
- 新增 `apps/uiframeworksviewer`，提供 mock/live 两种运行模式和 9 个验收场景。
- 新增单元测试、静态源码约束测试、README 文档，并完成根级严格验收。
- 本任务未改变仓库协作规则、目录规范或基础脚本，因此未更新 `agents.md`。

## 新增和修改文件

新增 `packages/uiframeworks/`：

- `package.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `tsconfig.eslint.json`
- `eslint.config.cjs`
- `vite.config.ts`
- `README.md`
- `src/index.ts`
- `src/types.ts`
- `src/errors.ts`
- `src/format.ts`
- `src/layout.ts`
- `src/state.ts`
- `src/dom.ts`
- `src/session.ts`
- `src/styles.css`
- `tests/setup.ts`
- `tests/test-helpers.ts`
- `tests/layout.test.ts`
- `tests/format.test.ts`
- `tests/state.test.ts`
- `tests/dom.test.ts`
- `tests/session.test.ts`
- `tests/errors.test.ts`
- `tests/exports.test.ts`
- `tests/static-source.test.ts`

新增 `apps/uiframeworksviewer/`：

- `package.json`
- `tsconfig.json`
- `tsconfig.eslint.json`
- `eslint.config.cjs`
- `vite.config.ts`
- `README.md`
- `index.html`
- `src/main.ts`
- `src/scenarios.ts`
- `src/mock-client.ts`
- `src/demo-game.ts`
- `src/styles.css`
- `src/vite-env.d.ts`
- `tests/setup.ts`
- `tests/scenarios.test.ts`
- `tests/mock-client.test.ts`
- `tests/demo-game.test.ts`

修改：

- `pnpm-lock.yaml`：新增 workspace 包后由 `pnpm install` 更新。

参考但未修改：

- `docs/ui001.png`
- `tasks/26-uiframeworks-dom-slot-ui-bootstrap.md`

## Public API 摘要

`@slotclientengine/uiframeworks` 导出：

- `createSlotUiFramework(options)`：创建 UI 框架实例。
- `SlotUiFramework`：提供 `connect()`、`spin()`、`setBalance()`、`setBetIndex()`、`setMuted()`、`setFastMode()`、`setAutoMode()`、`getState()`、`destroy()`。
- `SlotUiFrameworkOptions`：包含 `root`、`gameAdapter`、`designSize`、`live`、`betOptions`、初始状态、金额格式化、`buildSpinParams`、`clientFactory`、`logicFactory`、`logger`、`onStateChange`、`onError`。
- `SlotGameAdapter`：承载游戏层挂载、初始状态应用、spin 结果应用、UI 状态同步和销毁。
- `SlotUiStateSnapshot`、`SlotUiSpinResult`、`SlotUiLiveConfig`、`SlotUiBetOption` 等类型。
- CSS 入口：`@slotclientengine/uiframeworks/styles.css`，构建产物为 `dist/uiframeworks.css`。

## UI 和 CSS 绘制

- UI 使用 DOM 和 CSS 绘制，不使用 canvas、SVG、图片、icon font 或自定义字体。
- 顶部栏包含菜单、声音和 fast mode 控件。
- 中部提供可交给游戏适配器挂载的 `gameLayer`。
- 底部栏包含 balance、win、bet、下注步进、spin 和 auto 按钮。
- 金额和长文本使用稳定容器、`min-width: 0`、截断和响应式缩放，避免窄屏溢出。
- 画面框按设计尺寸等比缩放，窄屏使用 top-center 变换，保证整套 HUD 在移动宽度下仍完整可见。

## netcore / logiccore 数据流

- live 模式只接受 `ws://` 或 `wss://`，非法协议在创建 session 时直接抛错。
- 默认使用 `SlotcraftClient`，测试和 viewer mock 只能通过显式 `clientFactory` 注入。
- `connect()` 执行 `client.connect(token)`、`client.enterGame(gamecode)`，再读取并校验 `getUserInfo()`。
- `spin()` 使用当前 UI 状态和 bet 构造 `SpinParams`，调用 `client.spin(params)`。
- spin 返回必须包含 `gmi`、`totalwin`、`results`。
- `results` 必须是非负整数，并且必须等于 `gmi.replyPlay.results.length`。
- `totalwin` 必须是有限数值。
- 通过 `createGameLogicFromGmi(gmi, meta)` 生成 logic 实例。
- collect 规则为 `(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1)`。
- collect 完成后重新读取并校验 userInfo，再更新 UI 状态和游戏适配器。

## Fail-fast 行为

- `live.serverUrl` 非 `ws://` / `wss://`：立即抛 `SlotUiConfigError`。
- connect 前 spin、重复 spin、已销毁实例继续操作：立即抛 `SlotUiRuntimeError`。
- netcore `error`、非预期 `disconnect`、`reconnecting`、`logger.warn`、`logger.error`：触发 fail-fast。
- 服务端消息包含 `noticemsg2`、`error`、`err`、`errmsg`、`errorMessage`：触发 fail-fast。
- spin 结果缺少 `gmi`、`totalwin`、`results`，或字段类型不合法：立即失败。
- 不存在静默 replay、mock 或 HTTP fallback；mock 仅限 viewer 和测试中显式注入。

## Viewer 摘要

`apps/uiframeworksviewer` 支持：

- 默认 mock 模式，可直接启动验收。
- live 模式，通过 `VITE_UIFRAMEWORKSVIEWER_MODE=live` 与 `VITE_UIFRAMEWORKSVIEWER_SERVER_URL`、`VITE_UIFRAMEWORKSVIEWER_TOKEN`、`VITE_UIFRAMEWORKSVIEWER_GAMECODE` 配置真实连接。
- 9 个场景：`default-portrait`、`small-mobile`、`landscape-letterbox`、`long-numbers`、`loading-and-disabled`、`win-state`、`toggles-off`、`error-state`、`auto-active`。

## 覆盖率

`pnpm --filter @slotclientengine/uiframeworks test` 已通过，包级总覆盖率：

- Statements：95.21%
- Branches：89.24%
- Functions：92.37%
- Lines：95.38%

四项均高于 80%。

## 执行命令和结果

依赖：

- `pnpm install`：通过。

包级验收：

- `pnpm --filter @slotclientengine/uiframeworks lint`：通过。
- `pnpm --filter @slotclientengine/uiframeworks test`：通过，覆盖率见上。
- `pnpm --filter @slotclientengine/uiframeworks typecheck`：通过。
- `pnpm --filter @slotclientengine/uiframeworks build`：通过。

Viewer 验收：

- `pnpm --filter uiframeworksviewer lint`：通过。
- `pnpm --filter uiframeworksviewer test`：通过。
- `pnpm --filter uiframeworksviewer typecheck`：通过。
- `pnpm --filter uiframeworksviewer build`：通过。

根级验收：

- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。

静态源码约束：

- `rg -n "createElement\(['\"]canvas|new OffscreenCanvas|<canvas" packages/uiframeworks/src apps/uiframeworksviewer/src`：无输出，符合预期。
- `rg -n "<svg|createElementNS|\.svg|\.png|\.jpg|\.jpeg|icon-font|@font-face" packages/uiframeworks/src apps/uiframeworksviewer/src`：无输出，符合预期。
- `git diff --check`：通过。

## 浏览器验收

启动命令：

- `pnpm --filter uiframeworksviewer dev -- --host 0.0.0.0`

本地地址：

- `http://localhost:5202/`

说明：

- sandbox 内首次监听 `0.0.0.0:5202` 被系统拒绝，已按权限流程升级后启动。
- 使用 Codex in-app Browser 做真实页面检查。

视口验收：

| viewport | 结果 |
| --- | --- |
| 375x667 | frame 可见、无 canvas、顶部不重叠、底部栏可见、数值在栏内、下注步进正确、spin/auto 圆形按钮比例正确 |
| 390x844 | frame 可见、无 canvas、顶部不重叠、底部栏可见、数值在栏内、下注步进正确、spin/auto 圆形按钮比例正确 |
| 941x1672 | frame 可见、无 canvas、顶部不重叠、底部栏可见、数值在栏内、下注步进正确、spin/auto 圆形按钮比例正确 |
| 1366x768 | frame 可见、无 canvas、顶部不重叠、底部栏可见、数值在栏内、下注步进正确、spin/auto 圆形按钮比例正确 |
| 1920x1080 | frame 可见、无 canvas、顶部不重叠、底部栏可见、数值在栏内、下注步进正确、spin/auto 圆形按钮比例正确 |

场景补充验收：

- `long-numbers`：长 balance/win/bet 文案不互相重叠，仍在底部栏内。
- `toggles-off`：声音关闭和 fast 关闭态可见。
- `error-state`：展示 `mock connect error`，spin 禁用。
- `loading-and-disabled`：展示 `Connecting` 和 `Loading`，spin、减注、加注均禁用。

## 二次检查

- 复核 public API 与实际导出一致。
- 复核 live/mock 边界：默认生产 live 不会隐式退回 mock。
- 复核 UI 禁用项：新源码无 canvas/SVG/图片/icon font/font-face。
- 复核 `agents.md` 更新条件：本任务未触发仓库级协作规则、目录规范或基础脚本变更。

## 已知风险

无已知遗留问题。
