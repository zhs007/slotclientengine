# 28 uiframeworks flat slot UI refresh 完成报告

## 生成时间

- UTC：2026-06-15 06:52:07

## 任务摘要

已按 `docs/ui002.png` 重做 `@slotclientengine/uiframeworks` 默认 slot HUD：黑色舞台、白色扁平 icon、左侧竖排工具栏、右上可配置品牌、底部裸排 `BALANCE/WIN/BET`、金色 `BUY BONUS`、右下 spin/auto 圆形按钮。

保留任务 26 的核心能力：固定设计分辨率 frame、game layer + UI overlay、viewport 缩放、live `netcore` + `logiccore` 数据流、fail-fast 错误策略、无静默 mock/fixture/replay fallback。

## 修改文件列表

- `packages/uiframeworks/package.json`
- `pnpm-lock.yaml`
- `packages/uiframeworks/src/icons.ts`
- `packages/uiframeworks/src/types.ts`
- `packages/uiframeworks/src/layout.ts`
- `packages/uiframeworks/src/dom.ts`
- `packages/uiframeworks/src/styles.css`
- `packages/uiframeworks/src/index.ts`
- `packages/uiframeworks/vite.config.ts`
- `packages/uiframeworks/tests/dom.test.ts`
- `packages/uiframeworks/tests/icons.test.ts`
- `packages/uiframeworks/tests/layout.test.ts`
- `packages/uiframeworks/tests/exports.test.ts`
- `packages/uiframeworks/tests/static-source.test.ts`
- `packages/uiframeworks/README.md`
- `apps/uiframeworksviewer/src/main.ts`
- `apps/uiframeworksviewer/src/scenarios.ts`
- `apps/uiframeworksviewer/src/styles.css`
- `apps/uiframeworksviewer/tests/scenarios.test.ts`
- `apps/uiframeworksviewer/README.md`

## 新增依赖

- 新增 `lucide@1.18.0` 到 `@slotclientengine/uiframeworks` 的运行时依赖。
- 安装时因 sandbox 网络限制，第一次下载被 `EPERM` 拦截；已按权限流程在沙箱外执行同一 `pnpm --filter @slotclientengine/uiframeworks add lucide` 命令完成安装。

## bundle / external 处理

- `packages/uiframeworks/vite.config.ts` 已将 `lucide` 加入 `rollupOptions.external`。
- 最终选择：`lucide` 作为外部运行时依赖，不把 icon 包整体打进 `dist/index.js`。
- 构建结果：`dist/index.js 25.43 kB gzip 7.49 kB`，`dist/uiframeworks.css 6.17 kB gzip 1.81 kB`。

## Public API 变化

新增配置：

- `brandLabel?: string`
- `clock?: false | SlotUiClockOptions`
- `buyBonus?: false | SlotUiBuyBonusOptions`
- `showFastToggle?: boolean`
- `onMenu?: () => void`
- `onInfo?: () => void`
- `onSettings?: () => void`
- `onBuyBonus?: () => void`

新增导出类型：

- `SlotUiClockOptions`
- `SlotUiBuyBonusOptions`

行为约束：

- `brandLabel` 不传时不渲染品牌，基础库不硬编码 `HYPER GAMING`。
- `clock === false` 时不渲染时间；`clock.updateIntervalMs` 必须是正整数，否则抛 `SlotUiConfigError`。
- `buyBonus === false` 时不渲染按钮；`enabled: false` 同步 `disabled` 与 `aria-disabled`。
- `showFastToggle` 默认显示 fast toggle；显式传 `false` 时隐藏左侧 fast 按钮，fast 状态和 `setFastMode()` 仍保留。
- `onMenu` 是左侧 menu 按钮 callback；`onInfo` 作为兼容 fallback。

## UI 对齐说明

- `.slot-ui-frame` / `.slot-ui-page` 改为纯黑背景。
- 移除旧版顶部 menu 三横线、青绿色/紫色拟物 toggle、厚底部 banner、卡片式数值块和 CSS 手绘 spin/sound icon。
- 新 DOM 包含 `.slot-ui-top-hud`、`.slot-ui-clock`、`.slot-ui-brand`、`.slot-ui-left-rail`、`.slot-ui-bottom-hud`。
- 左侧工具栏默认 menu/fast/sound；fast 与 sound 都是 toggle 控件，sound off 使用 `volume-off` icon 和灰色状态。
- 底部改为两排：上排 `BUY BONUS` 与居中 `WIN`，下排 `BALANCE`、带币种 `BET`、竖排 `+/-`、spin、auto；长金额使用固定轨道和 ellipsis。
- viewer 默认传入 `brandLabel: "HYPER GAMING"` 与稳定时钟 `18:25`。

## icon 资源使用说明

- 所有默认 HUD icon 通过 `packages/uiframeworks/src/icons.ts` 集中创建。
- icon 使用 `lucide` 的 icon node，统一添加 `.slot-ui-icon`、`aria-hidden="true"`、`focusable="false"`。
- icon 颜色走 `currentColor`，由 CSS 控制状态色。
- 未知 icon 名称直接抛错，不回退到 CSS 手绘 icon。

## fail-fast / 无兜底边界复核

- 未改写 `SlotUiLiveSession` 核心数据流。
- `live.serverUrl` 仍只接受 `ws://` / `wss://`。
- `clientFactory` 仍仅由调用方显式传入；viewer mock 仍是显式 mock。
- `connect()` 仍校验 finite balance；未新增默认余额。
- `spin()` 并发、`gmi`、`totalwin`、`results` 与 `gmi.replyPlay.results.length` 校验保持有效。
- 未新增 HTTP/replay fallback、默认 GMI、fixture fallback、自动 spin 循环或静默吞错。

## 测试和覆盖率结果

包级：

- `pnpm --filter @slotclientengine/uiframeworks lint`：通过
- `pnpm --filter @slotclientengine/uiframeworks test`：通过，42 tests / 9 files
- `pnpm --filter @slotclientengine/uiframeworks typecheck`：通过
- `pnpm --filter @slotclientengine/uiframeworks build`：通过
- uiframeworks 覆盖率：statements 95.59，branches 89.38，functions 93.18，lines 95.72，均高于 81

Viewer：

- `pnpm --filter uiframeworksviewer lint`：通过
- `pnpm --filter uiframeworksviewer test`：通过，8 tests / 3 files
- `pnpm --filter uiframeworksviewer typecheck`：通过
- `pnpm --filter uiframeworksviewer build`：通过

根级：

- `pnpm lint`：通过，16/16
- `pnpm test`：通过，16/16
- `pnpm typecheck`：通过，16/16
- `pnpm build`：通过，16/16

静态检查：

- `rg -n "createElement\\(['\"]canvas|new OffscreenCanvas|<canvas" packages/uiframeworks/src apps/uiframeworksviewer/src`：无输出
- `rg -n "\\.png|\\.jpg|\\.jpeg|icon-font|@font-face" packages/uiframeworks/src`：无输出
- `rg -n "slot-ui-speaker|slot-ui-sound-wave|slot-ui-fast-bolt|slot-ui-spin-ring" packages/uiframeworks/src`：无输出
- `git diff --check`：通过

## Viewer 浏览器验收

启动：

- `pnpm --filter uiframeworksviewer dev -- --host 127.0.0.1`
- sandbox 内监听端口被 `listen EPERM` 拦截后，已按权限流程在沙箱外启动。

检查视口：

- `375 x 667`
- `390 x 844`
- `414 x 896`
- `941 x 1672`
- `1366 x 768`
- `1920 x 1080`

浏览器审计结果：

- 六个视口默认场景均无 canvas。
- 六个视口默认场景均无旧版 `speaker/sound-wave/fast-bolt/spin-ring/bottom-banner` 类。
- `.slot-ui-page` 与 `.slot-ui-frame` 计算背景均为 `rgb(0, 0, 0)`。
- 底部 `BUY BONUS`、`BALANCE`、`WIN`、`BET`、`+/-`、spin、auto 均无重叠。
- 默认场景 fast toggle 可见；`fast-active` 场景 `data-slot-fast="true"`。
- `sound-off`、`error-state`、`auto-active`、`buy-bonus-disabled`、`no-brand`、`clock-disabled`、`long-numbers` 均通过状态审计。

备注：in-app Browser 的截图 API 两次在 `Page.captureScreenshot` 超时，未产出截图文件；已完成 DOM、计算样式、元素矩形与状态审计。

## 二次复核记录

- 复核时移除了 `apps/uiframeworksviewer/src/scenarios.ts` 中未被运行时消费的 `spinState` 场景字段；`loading-and-disabled` 继续由 `mockConnectMode: "pending"` 驱动 connecting / disabled 验收状态。
- 复核后重新执行 `pnpm --filter uiframeworksviewer test`、`pnpm typecheck`、`pnpm build`、`pnpm lint`，均通过。
- 复核后重新执行三条静态禁用项 `rg` 检查与 `git diff --check`，均通过。

## 后续 UI 调整记录

- 左侧第一枚按钮由 info 改为 menu，icon 改为 `lucide` menu。
- 左侧第二枚按钮由 settings 改为 fast toggle，使用 `zap` icon，并与 sound 一样维护 `aria-pressed`。
- 底部 HUD 改成两排：`BUY BONUS` 与 `WIN` 上提；`BALANCE` 移到原 `BUY BONUS` 的下方区域；`BET` 与 `BALANCE/WIN` 使用一致的数值字号。
- `BET` 显示改为 `formatMoney(state.betOption.bet)`，因此和 `BALANCE/WIN` 一样带币种。
- 补充浏览器审计覆盖 `390 x 844`、`941 x 1672`、`1366 x 768` 默认场景，以及 `long-numbers`、`fast-active`、`sound-off`、`buy-bonus-disabled` 场景；审计结果均无元素重叠，`BALANCE/WIN/BET` 均无文本 overflow，且 `BET` 均带 `$` 币种。
- 后续微调 menu 不再使用白色实心圆背景，改为透明底白色 menu icon；`WIN` 数字元素收缩到文本宽度并按整条 frame 中心居中。补充浏览器审计 `390 x 844`、`941 x 1672`、`1366 x 768`，均确认 menu 透明白色、`WIN` 数字居中且不与 `BUY BONUS` 相交。

## agents.md / AGENTS.md 更新

本任务未改变仓库协作规则、目录规范或基础脚本，仅新增包级运行时依赖和 UI/API 合同；因此无需更新根目录 `agents.md` / `AGENTS.md`。

## 已知风险或遗留事项

无已知遗留问题。
