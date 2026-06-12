# uiframeworksviewer

`uiframeworksviewer` 是 `@slotclientengine/uiframeworks` 的 DOM slot UI 布局与状态 viewer。第一屏即为可交互 viewer，不连接真实服务器的默认 mock 模式用于检查布局、按钮状态、长金额、error 和 win 状态。

## 启动

```bash
pnpm --filter uiframeworksviewer dev -- --host 0.0.0.0
```

默认 mode 是 `mock`。mock mode 显式传入 `ws://mock.uiframeworksviewer.local` 和 `clientFactory`，不会因为缺少 live config 而触发隐式 fallback。

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

## Scenarios

- `default-portrait`
- `small-mobile`
- `landscape-letterbox`
- `long-numbers`
- `loading-and-disabled`
- `win-state`
- `toggles-off`
- `error-state`
- `auto-active`

## 视觉验收视口

建议至少检查：

- `375 x 667`
- `390 x 844`
- `941 x 1672`
- `1366 x 768`
- `1920 x 1080`

检查重点：frame 完整可见或按预期 letterbox；顶部按钮不重叠；声音/快速关闭态灰掉并显示斜线；底部 banner 可见；balance、bet、win 位于 banner 上；minus/plus 位于 bet 两侧；spin 和 auto 都是圆形；长金额不互相覆盖；error scenario 有明确错误；运行 DOM 没有 UI canvas。

## 验收命令

```bash
pnpm --filter uiframeworksviewer lint
pnpm --filter uiframeworksviewer test
pnpm --filter uiframeworksviewer typecheck
pnpm --filter uiframeworksviewer build
```
