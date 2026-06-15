# uiframeworksviewer

`uiframeworksviewer` 是 `@slotclientengine/uiframeworks` 的 DOM slot UI 布局与状态 viewer。第一屏即为可交互 viewer，默认 mock 模式用于检查 `docs/ui002.png` 参考风格：黑底舞台、白色扁平 icon、右上品牌、底部裸排信息区和金色 `BUY BONUS`。

## 启动

```bash
pnpm --filter uiframeworksviewer dev -- --host 0.0.0.0
```

默认 mode 是 `mock`。mock mode 显式传入 `ws://mock.uiframeworksviewer.local` 和 `clientFactory`，不会因为缺少 live config 而触发隐式 fallback。默认场景传入 `brandLabel: "HYPER GAMING"` 和稳定时钟 `18:25`。

## Live Mode

live mode 必须显式启用：

```bash
VITE_UIFRAMEWORKSVIEWER_MODE=live
VITE_UIFRAMEWORKSVIEWER_SERVER_URL=wss://example.test/game
VITE_UIFRAMEWORKSVIEWER_TOKEN=token
VITE_UIFRAMEWORKSVIEWER_GAMECODE=game001
pnpm --filter uiframeworksviewer dev -- --host 0.0.0.0
```

live mode 缺少 `SERVER_URL`、`TOKEN` 或 `GAMECODE` 会明确报错，不会回退到 mock。

默认 HUD icon 资源由 `@slotclientengine/uiframeworks` 内部的 `lucide` helper 生成；viewer 不额外提供图片 HUD 资产。

## Scenarios

- `default-portrait`
- `small-mobile`
- `landscape-letterbox`
- `long-numbers`
- `loading-and-disabled`
- `win-state`
- `sound-off`
- `error-state`
- `auto-active`
- `buy-bonus-disabled`
- `no-brand`
- `clock-disabled`
- `fast-active`

## 视觉验收视口

建议至少检查：

- `375 x 667`
- `390 x 844`
- `414 x 896`
- `941 x 1672`
- `1366 x 768`
- `1920 x 1080`

检查重点：frame 完整可见或按预期 letterbox；背景接近黑色且没有旧青绿色/紫色大渐变；左上时间、左侧 menu/fast/sound、右上品牌不重叠；底部上排 `BUY BONUS` 和居中 `WIN`、下排 `BALANCE` 和带币种 `BET`、竖排 `+/-`、spin、auto 不重叠；label 黄色、金额白色且字号一致；长金额不覆盖相邻区域；spin 是大圆形 rotate icon；fast/sound off、disabled、connecting、error 状态明确可见；运行 DOM 没有 UI canvas。

## 验收命令

```bash
pnpm --filter uiframeworksviewer lint
pnpm --filter uiframeworksviewer test
pnpm --filter uiframeworksviewer typecheck
pnpm --filter uiframeworksviewer build
```
