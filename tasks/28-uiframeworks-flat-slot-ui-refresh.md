# uiframeworks flat slot UI refresh 任务计划

## 1. 任务目标

在现有 `packages/uiframeworks` 基础上重做默认 slot HUD 的视觉与图标实现，使其贴近 `docs/ui002.png` 的扁平化参考风格，并保留任务 26 已完成的数据流、状态管理、fail-fast 和 viewer 验收能力。

本计划是完整可执行版本，不依赖其它上下文。执行者只需要阅读本文件，即可完成需求分析、依赖调整、DOM/CSS 改造、viewer 更新、测试更新、文档更新、验收和任务报告。

核心目标：

- 使用 `docs/ui002.png` 作为新默认 HUD 视觉参考。
- 允许并应当使用现成 icon 资源，不再要求所有 icon 都由 CSS/DOM 手绘。
- 默认风格改为黑色舞台、白色扁平 icon、轻量文字信息、底部裸排信息区和金色 `BUY BONUS` CTA。
- 保留 `@slotclientengine/uiframeworks` 的框架职责：
  - 固定设计分辨率 frame。
  - game layer 和 UI overlay。
  - viewport 缩放。
  - live `netcore` + `logiccore` spin 数据流。
  - fail-fast 错误策略。
- 不增加静默 mock、fixture、replay、默认 GMI、默认余额等兜底。
- 如果现有测试阻碍新视觉合同，应修改测试来表达新合同，不要为了通过旧测试保留不该保留的旧 DOM/CSS。
- 完成后新增中文任务报告：`tasks/28-uiframeworks-flat-slot-ui-refresh-[utctime].md`，`utctime` 使用 UTC 年月日时分秒，例如 `260401-181300`。
- 如果任务影响仓库协作规则、目录规范或基础脚本，需要同步更新根目录 `agents.md`；如果没有影响，在任务报告中明确说明无需更新。

## 2. 当前仓库事实

仓库事实：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- pnpm 要求为 `>=10.0.0`。
- 前端构建使用 `vite`。
- 测试使用 `vitest`。
- lint 使用 `eslint`。
- 格式化使用 `prettier`。
- 根目录协作文件路径是 `agents.md`。
- 新增空目录时必须放置 `.keepme` 文件；本任务预计不需要新增空目录。
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

当前相关目录与文件：

- `docs/ui002.png` 存在，尺寸是 `941 x 1672`，是本任务的新视觉参考图。
- `docs/ui001.png` 是旧任务参考图，本任务不再以它作为默认 HUD 视觉目标。
- `packages/uiframeworks` 已存在。
- `apps/uiframeworksviewer` 已存在。
- `tasks/26-uiframeworks-dom-slot-ui-bootstrap.md` 是任务 26 的原始计划。
- `tasks/26-uiframeworks-dom-slot-ui-bootstrap-260612-070822.md` 是任务 26 的完成报告。

`packages/uiframeworks` 当前实现摘要：

- 包名：`@slotclientengine/uiframeworks`。
- 当前 public API 入口：`packages/uiframeworks/src/index.ts`。
- 当前 DOM 构建：`packages/uiframeworks/src/dom.ts`。
- 当前布局计算：`packages/uiframeworks/src/layout.ts`。
- 当前状态管理：`packages/uiframeworks/src/state.ts`。
- 当前 live session：`packages/uiframeworks/src/session.ts`。
- 当前样式：`packages/uiframeworks/src/styles.css`。
- 当前测试目录：`packages/uiframeworks/tests`。
- 当前 viewer：`apps/uiframeworksviewer`。

当前实现存在的视觉问题：

- `styles.css` 使用了较多深色渐变、青绿色描边、卡片背景、重阴影和拟物按钮。
- 顶部是左侧菜单按钮加右上声音/快速按钮，与 `ui002.png` 的左侧竖排 icon、右上品牌不一致。
- 声音、快速、spin 等 icon 大量通过 CSS 几何图形手绘，后续维护成本高。
- 底部是完整深色 banner 和卡片式数值块，与 `ui002.png` 的黑底裸排信息层不一致。
- `packages/uiframeworks/tests/static-source.test.ts` 明确禁止 `.svg/.png/.jpg/icon-font`，这是任务 26 的旧约束；本任务需要改成允许受控 icon 资源，但仍禁止 canvas 和散落的自制复杂图标。

## 3. `ui002.png` 视觉分析与落地合同

参考图事实：

- 画布尺寸：`941 x 1672`。
- 主背景：纯黑或近黑。
- 顶部左侧显示时间 `18:25`。
- 左侧从上到下竖排三个白色圆形 icon：
  - info。
  - settings。
  - sound。
- 顶部右侧显示品牌文字 `HYPER GAMING`。
- 底部左侧是金色 `BUY BONUS` 按钮。
- 底部中部是 `BALANCE`、`WIN`、`BET` 三个信息组。
- 信息组 label 使用黄色 uppercase。
- 金额使用白色粗体。
- `BET` 右侧是竖排 `+` / `-` 两个圆形描边按钮。
- 右下是大号圆形 spin 按钮，白色旋转箭头，深色圆底，白色细描边。
- 最右下是小号圆形 auto/settings 类按钮。
- 整体不是卡片化 HUD；UI 像贴在黑色游戏画面上。

默认 HUD 视觉合同：

- 默认设计分辨率继续使用 `941 x 1672`，与参考图一致。
- `.slot-ui-frame` 背景改为纯黑或近黑，移除旧的青绿色/紫色/重渐变舞台背景。
- UI overlay 不再使用任务 26 的厚重底部 banner 视觉；保留必要容器类名可以，但视觉必须接近透明/黑底裸排。
- 顶部区域：
  - 左上显示时间文本。
  - 右上显示品牌文本，品牌不能硬编码在基础库里，必须由配置传入；viewer 传入 `HYPER GAMING`。
  - 左侧竖排工具栏包含 info、settings、sound。
- 底部区域：
  - 左侧 `BUY BONUS` 按钮。
  - 中部横向显示 `BALANCE`、`WIN`、`BET`。
  - `+` / `-` 位于 `BET` 与 spin 按钮之间，竖向排列。
  - spin 按钮在右下主操作位，尺寸明显大于 auto 按钮。
  - auto 按钮在 spin 右侧或右下侧，维持圆形。
- 颜色：
  - 背景：`#000000` 或极接近黑。
  - 主文字/icon：`#ffffff`。
  - label：明黄，例如 `#ffe600`。
  - `BUY BONUS`：金色系，可有轻微高光，但不要回到旧版大面积青绿色拟物风格。
  - 禁用态：中性灰，不能隐式隐藏。
  - 错误态：明确红色文本或小型错误条，不要覆盖关键 UI。
- 字体：
  - 使用系统 sans-serif。
  - 不引入自定义字体文件。
  - 不使用 viewport width 动态缩放字体。
  - 字体大小通过设计分辨率固定尺寸和容器约束保证缩放后稳定。
- 图标：
  - 使用现成 icon 资源，优先选轻量 ESM icon 包。
  - 不再通过大量 CSS `clip-path`、border 三角形、伪元素组合手绘 icon。
  - icon 颜色使用 `currentColor`，由 CSS 控制状态色。

## 4. 技术方案

### 4.1 新增 icon 依赖

新增 `lucide` 作为 `packages/uiframeworks` 的运行时依赖，用于默认 HUD icon。

建议命令：

```bash
pnpm --filter @slotclientengine/uiframeworks add lucide
```

如果下载失败，执行代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm --filter @slotclientengine/uiframeworks add lucide
```

要求：

- 更新 `packages/uiframeworks/package.json`。
- 更新 `pnpm-lock.yaml`。
- 不要误装 React/Vue 等框架绑定版本，例如不要使用 `lucide-react`；本包仍然是 framework-agnostic DOM/TypeScript 实现。
- `lucide` 的具体导入 API 以本地安装后的包导出为准；如果导入失败，修正导入，不要写一套 CSS 手绘 fallback。
- 将 icon 创建逻辑集中放在 `packages/uiframeworks/src/icons.ts`。
- 业务 DOM 构建代码只调用统一 helper，例如 `createSlotIcon("info")`。
- 检查 `packages/uiframeworks/vite.config.ts`：
  - 如果决定把 icon 代码打进 `dist/index.js`，需要确认 bundle 大小和构建结果可接受。
  - 如果决定将 `lucide` 作为外部运行时依赖，需把它加入 `rollupOptions.external`，并确保 `package.json` 的 `dependencies` 已声明。
  - 两种方式都可以，但必须在任务报告中说明最终选择。
- `src/icons.ts` 负责：
  - 创建 `SVGElement` 或由包提供的 icon element。
  - 设置 `aria-hidden="true"`。
  - 设置 `focusable="false"`。
  - 设置统一 class，例如 `.slot-ui-icon`。
  - 让 stroke/fill 走 `currentColor`。

默认需要的 icon：

- `info`
- `settings`
- `volume`
- `volume-off`
- `refresh-cw` 或等价 spin icon
- `plus`
- `minus`
- `circle-dot` / `rotate-cw` / `settings-2` 等 auto icon
- 如果保留可见 fast 控件，再使用 `zap`

### 4.2 Public API 调整

在不破坏已有核心能力的前提下，扩展 `SlotUiFrameworkOptions`：

```ts
export interface SlotUiFrameworkOptions {
  // existing fields...
  readonly brandLabel?: string;
  readonly clock?: false | SlotUiClockOptions;
  readonly buyBonus?: false | SlotUiBuyBonusOptions;
  readonly showFastToggle?: boolean;
  readonly onInfo?: () => void;
  readonly onSettings?: () => void;
  readonly onBuyBonus?: () => void;
}

export interface SlotUiClockOptions {
  readonly now?: () => Date;
  readonly locale?: string;
  readonly hour12?: boolean;
  readonly updateIntervalMs?: number;
  readonly format?: (date: Date) => string;
}

export interface SlotUiBuyBonusOptions {
  readonly label?: string;
  readonly enabled?: boolean;
}
```

落地约束：

- `brandLabel` 不传时基础库不硬编码品牌；viewer 必须传 `HYPER GAMING`。
- `clock === false` 时不渲染时间；默认可以渲染浏览器时间。
- `clock.now` 和 `clock.format` 用于测试稳定输出。
- `clock.updateIntervalMs` 必须是正整数；非法值抛 `SlotUiConfigError`。
- `buyBonus === false` 时不渲染按钮；默认 viewer 渲染 `BUY BONUS`。
- `buyBonus.enabled === false` 时按钮 disabled。
- `onBuyBonus` 未传但 buy bonus 可见时，点击只保持当前状态并触发不了业务动作；不要伪造购买逻辑。
- `showFastToggle` 默认 `false`，因为 `ui002.png` 没有 fast icon；但保留 `fastMode` 状态、`setFastMode()` 和 `buildSpinParams()` 行为。
- 如果后续游戏需要显示 fast toggle，可显式启用；启用时用现成 icon，不能恢复旧版紫色/青色按钮。

如果执行中发现 API 扩展会造成过大破坏，可以保守处理为：

- 保留 public API 只加 `brandLabel`、`clock`、`buyBonus`。
- `onInfo` / `onSettings` / `onBuyBonus` 先只通过 `onStateChange` 外部管理之外的普通 callback 暴露。
- 不移除已有导出类型。

### 4.3 DOM 结构调整

修改 `packages/uiframeworks/src/dom.ts`。

目标 DOM 层级仍保留：

```html
<main class="slot-ui-page">
  <div class="slot-ui-frame">
    <div class="slot-ui-game-layer"></div>
    <div class="slot-ui-overlay"></div>
  </div>
</main>
```

overlay 内建议结构：

```html
<div class="slot-ui-top-hud">
  <time class="slot-ui-clock"></time>
  <div class="slot-ui-brand"></div>
</div>

<div class="slot-ui-left-rail">
  <button class="slot-ui-rail-button slot-ui-info-button"></button>
  <button class="slot-ui-rail-button slot-ui-settings-button"></button>
  <button class="slot-ui-rail-button slot-ui-sound-button"></button>
</div>

<div class="slot-ui-bottom-hud">
  <button class="slot-ui-buy-bonus-button"></button>
  <div class="slot-ui-value-block slot-ui-balance-block"></div>
  <div class="slot-ui-value-block slot-ui-win-block"></div>
  <div class="slot-ui-value-block slot-ui-bet-block"></div>
  <div class="slot-ui-bet-steps"></div>
  <button class="slot-ui-spin-button"></button>
  <button class="slot-ui-auto-button"></button>
</div>

<div class="slot-ui-status-text"></div>
```

要求：

- 移除旧的三条线菜单 DOM 作为默认控件；如果仍保留 menu 能力，应映射到 settings 或在 API 中明确 `onSettings`。
- `slot-ui-sound-button` 使用 `volume` / `volume-off` icon，而不是 CSS speaker 手绘。
- `slot-ui-spin-button` 使用现成 rotate icon，不再用 `.slot-ui-spin-ring::before/after` 手绘箭头。
- `slot-ui-bet-decrease` 和 `slot-ui-bet-increase` 使用现成 plus/minus icon 或纯文本 `+` / `-`；优先 icon。
- 所有 button 保持：
  - `type="button"`。
  - 明确 `aria-label`。
  - toggle 使用 `aria-pressed`。
  - disabled 同步 `disabled` 和 `aria-disabled`。
- `statusText` 不要占用参考图底部主信息区；可放在底部 HUD 上方的小型透明文本区，error 时可显示。
- clock interval 必须在 `destroy()` 时清理。
- resize listener 继续在 `destroy()` 时清理。
- 键盘交互不能退化：button 保持原生 focus，CSS 需要提供可见的 `:focus-visible` 状态。
- 点击区域必须大于纯 icon 尺寸，移动端不能因为 icon 变小而难以触控。

### 4.4 CSS 改造

修改 `packages/uiframeworks/src/styles.css`。

必须删除或显著弱化的旧视觉：

- `.slot-ui-page` 的青绿色/紫色径向渐变背景。
- `.slot-ui-frame` 的边框和重阴影。
- `.slot-ui-menu-line` 以及手绘菜单三条线。
- `.slot-ui-speaker-*`、`.slot-ui-sound-wave-*`、`.slot-ui-fast-bolt`。
- `.slot-ui-spin-ring` 以及伪元素手绘箭头。
- 厚重 `.slot-ui-bottom-banner` 深色面板、描边和大阴影。
- 数值块的卡片边框和背景。

新增或调整的视觉：

- `.slot-ui-page` / `.slot-ui-frame` 使用黑色背景。
- `.slot-ui-top-hud` 绝对定位到顶部，左右留白接近参考图。
- `.slot-ui-clock` 位置接近左上，白色粗体。
- `.slot-ui-brand` 位置接近右上，白色 uppercase，小号粗体。
- `.slot-ui-left-rail` 绝对定位在左侧，竖向排列。
- `.slot-ui-rail-button` 是透明按钮，icon 白色，触控区域足够；hover/active 只做轻微 opacity 或 scale。
- `.slot-ui-bottom-hud` 绝对定位在底部，使用 grid 或 absolute 布局，保证参考图比例。
- `.slot-ui-buy-bonus-button` 使用金色 CTA，文字两行 `BUY` / `BONUS`，允许轻微高光和描边，但不要影响整体扁平风格。
- `.slot-ui-value-block` 背景透明，无边框，固定宽度或使用 grid track，避免金额互相覆盖。
- `.slot-ui-value-label` 黄色 uppercase。
- `.slot-ui-value-number` 白色粗体，长数字使用 `font-size` 约束、`min-width: 0`、`text-overflow` 或 `font-variant-numeric: tabular-nums`，不得溢出相邻区域。
- `.slot-ui-bet-steps` 竖向排列两个圆形描边按钮。
- `.slot-ui-spin-button` 大圆形，深色圆底、白色细描边、白色 rotate icon。
- `.slot-ui-auto-button` 小圆形描边按钮，使用现成 icon。
- 禁用态保留可见灰度，不隐藏。

建议默认设计尺寸下的空间分布：

- 顶部 padding：约 `20px 22px`。
- 左侧 rail x：约 `27px`。
- 左侧 rail icon 触控尺寸：约 `54px` 到 `64px`。
- 底部 HUD 高度：约 `150px` 到 `180px`。
- `BUY BONUS`：约 `180px x 96px`。
- spin：约 `128px` 到 `150px` 直径。
- auto：约 `68px` 到 `80px` 直径。
- bet step：约 `48px` 到 `56px` 直径。

这些尺寸可以通过 `createDefaultSlotLayout()` 输出 CSS 变量，并随自定义设计尺寸按比例 clamp。

### 4.5 布局计算

修改 `packages/uiframeworks/src/layout.ts`。

保留：

- `DEFAULT_SLOT_UI_DESIGN_SIZE = { width: 941, height: 1672 }`。
- `validateDesignSize()`。
- `calculateFrameScale()`。

调整 `createDefaultSlotLayout()` 输出：

- `topInset`
- `sideInset`
- `bottomHudHeight`
- `leftRailButtonSize`
- `leftRailGap`
- `buyBonusWidth`
- `buyBonusHeight`
- `spinButtonDiameter`
- `autoButtonDiameter`
- `betStepButtonDiameter`

如果保留旧字段名以减少改动，也必须保证语义清晰；不要让 `bottomBannerHeight` 继续代表不存在的厚重 banner。

### 4.6 状态与数据流

原则：本任务主要改 UI，不重写 session。

必须保留：

- `live.serverUrl` 只接受 `ws://` / `wss://`。
- `clientFactory` 只用于测试和 viewer 显式 mock。
- `connect()` 后必须读取并校验 finite balance。
- `spin()` 并发调用必须抛错。
- spin 结果必须校验 `gmi`、`totalwin`、`results`。
- `results` 必须等于 `gmi.replyPlay.results.length`。
- `logicFactory` 默认继续使用 `createGameLogicFromGmi`。
- final collect 规则保持当前实现，除非有明确协议依据。

不允许新增：

- HTTP/replay fallback。
- 缺少余额时默认显示 `0`。
- 缺少 GMI 时默认 fixture。
- icon 加载失败时回退到旧 CSS 手绘 icon。
- 自动 spin 循环。
- 静默吞掉 adapter 或 client 错误。
- React/Vue/Svelte 等额外 UI 框架依赖。

## 5. Viewer 更新

更新 `apps/uiframeworksviewer`，让第一屏直接展示新风格。

需要修改：

- `apps/uiframeworksviewer/src/main.ts`
- `apps/uiframeworksviewer/src/scenarios.ts`
- `apps/uiframeworksviewer/src/styles.css`
- `apps/uiframeworksviewer/README.md`
- `apps/uiframeworksviewer/tests/*`

要求：

- viewer 创建框架时传入：
  - `brandLabel: "HYPER GAMING"`。
  - 稳定 clock 配置，默认场景可显示 `18:25`，避免测试随系统时间波动。
  - `buyBonus` 可见。
- viewer 的 demo game layer 背景应尽量不干扰 HUD，可使用黑底或极暗占位。
- viewer toolbar 是开发辅助 UI，不要压缩或遮挡 stage。
- 场景保留任务 26 的核心覆盖：
  - default portrait。
  - small mobile。
  - landscape letterbox。
  - long numbers。
  - loading/disabled。
  - win state。
  - sound off。
  - error state。
  - auto active。
- 可新增：
  - buy bonus disabled。
  - no brand。
  - clock disabled。
  - optional fast toggle。

viewer README 更新：

- 明确新参考图是 `docs/ui002.png`。
- 说明 mock/live 模式。
- 说明 icon 资源由 `uiframeworks` 提供。
- 说明视觉验收视口和检查重点。

## 6. 测试计划

### 6.1 单元测试

更新 `packages/uiframeworks/tests/dom.test.ts`：

- 断言新 DOM 结构存在：
  - `.slot-ui-clock`
  - `.slot-ui-brand`
  - `.slot-ui-left-rail`
  - `.slot-ui-info-button`
  - `.slot-ui-settings-button`
  - `.slot-ui-sound-button`
  - `.slot-ui-buy-bonus-button`
  - `.slot-ui-bottom-hud`
  - `.slot-ui-spin-button`
  - `.slot-ui-auto-button`
- 断言 icon 元素来自统一 class，例如 `.slot-ui-icon`。
- 断言按钮 aria：
  - info/settings/buy bonus/spin/auto 有 `aria-label`。
  - sound/auto toggle 有 `aria-pressed`。
- 断言 sound off 使用 off icon 或对应状态 class/data attribute。
- 断言 disabled 状态同步 button disabled 和 `aria-disabled`。
- 断言 click handler：
  - info。
  - settings。
  - sound toggle。
  - buy bonus。
  - bet increase/decrease。
  - spin。
  - auto。
- 断言 `destroy()` 后 resize listener、clock interval 和事件 listener 都清理。

新增或更新 `packages/uiframeworks/tests/icons.test.ts`：

- `createSlotIcon()` 对已知 icon 返回 SVG/HTMLElement。
- icon 包含 `.slot-ui-icon`。
- icon 设置 `aria-hidden="true"` 和 `focusable="false"`。
- 未知 icon 名必须抛错，不要 fallback。

更新 `packages/uiframeworks/tests/layout.test.ts`：

- 覆盖新增布局字段。
- 覆盖非法设计尺寸仍抛 `SlotUiConfigError`。
- 覆盖不同设计尺寸下按钮尺寸 clamp。

更新 `packages/uiframeworks/tests/exports.test.ts`：

- 新增 public type/option 的导出或行为验证。
- 保持 CSS export 路径验证。

更新 `packages/uiframeworks/tests/static-source.test.ts`：

- 旧规则 `not.toMatch(/<svg|.../)` 不再适用。
- 新规则：
  - 禁止 canvas：`createElement("canvas")`、`new OffscreenCanvas`、`<canvas`。
  - 禁止图片 HUD 资产：`.png`、`.jpg`、`.jpeg` 出现在 `packages/uiframeworks/src`。
  - 禁止 icon font：`@font-face`、`icon-font`。
  - 禁止 DOM/CSS 散落复杂手绘 icon：检查旧类名 `.slot-ui-speaker-`、`.slot-ui-sound-wave`、`.slot-ui-fast-bolt`、`.slot-ui-spin-ring` 不存在。
  - 允许 `src/icons.ts` 使用 icon 包创建 SVG。

测试原则：

- 测试表达新产品合同。
- 如果旧测试要求旧 DOM 或旧 CSS，修改测试。
- 不要为了测试保留旧视觉或添加业务兜底。
- 不要把逻辑 bug 包在 try/catch 里吞掉；能早暴露就早暴露。

### 6.2 覆盖率

`packages/uiframeworks/vite.config.ts` 中 coverage 阈值继续保持四项 `81`：

- statements >= 81。
- branches >= 81。
- functions >= 81。
- lines >= 81。

新增 `icons.ts`、clock、buy bonus 等逻辑后，要补充测试以保持覆盖率。

### 6.3 Viewer 测试

更新 `apps/uiframeworksviewer/tests`：

- scenarios 测试覆盖新增场景配置。
- demo game 测试不应依赖旧青绿色视觉。
- mock client 测试保持 live/mock 边界清晰。
- 如果 main/bootstrap 测试因新 clock 配置变化失败，更新测试注入稳定时间，不要让测试依赖真实系统时间。

## 7. 文档更新

更新 `packages/uiframeworks/README.md`：

- 将“UI 不使用 SVG、图片图标或 icon font”改为：
  - UI 不使用 canvas。
  - 默认 icon 使用受控现成 icon 包。
  - 不使用图片 HUD 资产和 icon font。
  - 不在 DOM/CSS 中散落手绘复杂 icon。
- 增加 `brandLabel`、`clock`、`buyBonus`、`showFastToggle` 等新增配置说明。
- 更新 DOM 结构说明。
- 更新 HUD 控件说明为 `ui002.png` 风格。
- 保留 live 数据流、fail-fast、CSS 引入、viewer 和验收命令说明。

更新 `apps/uiframeworksviewer/README.md`：

- 指向 `docs/ui002.png`。
- 更新视觉验收描述。
- 更新场景列表。
- 保留 mock/live 运行方式。

如果新增依赖或脚本改变了仓库级协作规则，再更新 `agents.md`。单纯新增 `lucide` package dependency 通常不需要更新 `agents.md`。

## 8. 执行步骤

1. 确认当前状态：

```bash
git status --short
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter uiframeworksviewer test
```

2. 新增 icon 依赖：

```bash
pnpm --filter @slotclientengine/uiframeworks add lucide
```

依赖下载失败时：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm --filter @slotclientengine/uiframeworks add lucide
```

3. 新增 `packages/uiframeworks/src/icons.ts`，集中封装 icon。

4. 扩展 `packages/uiframeworks/src/types.ts`，加入品牌、clock、buy bonus 和可选 fast toggle 配置。

5. 修改 `packages/uiframeworks/src/layout.ts`，输出新 HUD 所需尺寸变量。

6. 修改 `packages/uiframeworks/src/dom.ts`：

- 重组 overlay。
- 使用 `icons.ts`。
- 加入 clock lifecycle。
- 加入 info/settings/buy bonus handlers。
- 保留 spin/bet/sound/auto 状态渲染。

7. 修改 `packages/uiframeworks/src/index.ts`：

- 校验新增配置。
- 将新增 options 传给 DOM。
- 公开必要 callback。
- 保留 session 和 state 核心逻辑。

8. 重写 `packages/uiframeworks/src/styles.css` 为扁平 HUD。

9. 更新 `packages/uiframeworks/tests`。

10. 更新 `apps/uiframeworksviewer` 代码、样式、场景和测试。

11. 更新 README。

12. 运行包级验收。

13. 启动 viewer 做真实浏览器视觉验收。

14. 运行根级验收。

15. 写任务报告。

## 9. 验收命令

包级：

```bash
pnpm --filter @slotclientengine/uiframeworks lint
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter @slotclientengine/uiframeworks typecheck
pnpm --filter @slotclientengine/uiframeworks build
```

Viewer：

```bash
pnpm --filter uiframeworksviewer lint
pnpm --filter uiframeworksviewer test
pnpm --filter uiframeworksviewer typecheck
pnpm --filter uiframeworksviewer build
```

根级：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

静态检查：

```bash
rg -n "createElement\\(['\"]canvas|new OffscreenCanvas|<canvas" packages/uiframeworks/src apps/uiframeworksviewer/src
rg -n "\\.png|\\.jpg|\\.jpeg|icon-font|@font-face" packages/uiframeworks/src
rg -n "slot-ui-speaker|slot-ui-sound-wave|slot-ui-fast-bolt|slot-ui-spin-ring" packages/uiframeworks/src
git diff --check
```

期望：

- 第一条无输出。
- 第二条无输出。
- 第三条无输出。
- `git diff --check` 通过。

如果某条静态检查因 `icons.ts` 的合法 icon 包导入产生误报，应优先调整检查命令或测试白名单，不要删除 icon 包并退回手绘。

## 10. 浏览器视觉验收

启动：

```bash
pnpm --filter uiframeworksviewer dev -- --host 0.0.0.0
```

检查视口：

- `375 x 667`
- `390 x 844`
- `414 x 896`
- `941 x 1672`
- `1366 x 768`
- `1920 x 1080`

检查重点：

- frame 完整可见或按预期 letterbox。
- 背景接近黑色，没有旧版青绿色/紫色大渐变。
- 左上时间可见且不挤压左侧 icon。
- 左侧 info/settings/sound 竖排，白色扁平 icon，触控区域足够。
- 右上品牌可见，不贴边，不溢出。
- 底部 `BUY BONUS`、`BALANCE`、`WIN`、`BET`、`+/-`、spin、auto 不重叠。
- label 黄色，金额白色，长金额场景不覆盖相邻区域。
- spin 是大圆形白色 rotate icon，不再是旧版金青渐变大按钮。
- auto 是小圆形扁平 icon。
- sound off 状态可一眼看出。
- disabled、connecting、error 状态明确可见。
- 页面运行时没有 UI canvas。

## 11. 任务报告要求

任务完成后，在 `tasks/` 下新增中文报告：

```text
28-uiframeworks-flat-slot-ui-refresh-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒，例如：

```text
28-uiframeworks-flat-slot-ui-refresh-260401-181300.md
```

建议使用以下命令生成时间戳：

```bash
date -u +%y%m%d-%H%M%S
```

报告必须包含：

- 生成时间 UTC。
- 任务摘要。
- 修改文件列表。
- 新增依赖说明。
- icon 依赖的 bundle/external 处理说明。
- Public API 变化。
- UI 变化和 `docs/ui002.png` 对齐说明。
- icon 资源使用说明。
- fail-fast / 无兜底边界复核。
- 测试和覆盖率结果。
- viewer 浏览器验收结果和视口列表。
- 是否更新 `agents.md`，如果未更新说明原因。
- 已知风险或遗留事项；没有则写“无已知遗留问题”。

## 12. 完成标准

任务视为完成必须同时满足：

- `packages/uiframeworks` 默认 HUD 视觉贴近 `docs/ui002.png`。
- 默认 HUD 使用现成 icon 资源，不再大量 CSS 手绘 icon。
- 旧版重渐变、厚底部 banner、卡片式数值块和 CSS 手绘 spin/sound icon 已移除。
- `@slotclientengine/uiframeworks` 的 live 数据流和 fail-fast 行为保持有效。
- 不引入静默 fallback。
- 相关 README 已更新。
- 单元测试、viewer 测试、lint、typecheck、build 通过。
- `packages/uiframeworks` 覆盖率四项均不低于 81。
- 浏览器视觉验收已完成并记录。
- 中文任务报告已写入 `tasks/`。
