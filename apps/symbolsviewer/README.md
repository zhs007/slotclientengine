# symbolsviewer

`symbolsviewer` 是 `@slotclientengine/rendercore` 的 PC 横屏调试 app，用来一次性展示当前 game config 中可处理的 slot symbol，并验证全局状态序列。

## 资产

使用仓库根目录资产：

- `assets/gamecfg/game2.json`
- `assets/symbols/*.png`

viewer 只展示 paytable 与图片资源的交集。当前可展示 symbol 是 `S00`、`S0`、`S1`、`S5`、`S10`。paytable 中缺图的 `BN`、`SC`、`RS`、`X2`、`X5`、`X10` 不会进入展示列表；孤儿图片 `SX.png` 也不会进入展示列表。

## 运行

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

## 界面

第一屏就是状态展示工具：

- 顶部工具栏可播放、暂停、进入下一状态、重置和切换默认 stable 状态。
- 右侧序列区可增加、移除、上移、下移状态。
- `stable` 状态可设置停留秒数。
- `appear` 和 `win` 是单次状态，等待全部图标播放完成后进入下一步。
- 状态面板显示每个 symbol 的 requested/resolved/default/pending 状态。

默认序列是 `normal -> appear -> win -> spinBlur -> disabled`。本任务中 `spinBlur` 和 `disabled` 等价到 `normal`，所以面板会显示 requested 分别为 `spinBlur` / `disabled`，resolved 为 `normal`。

## 验收

PC 横屏建议使用 `1280x720` 或更大视口确认：

- Pixi canvas 非空。
- `S00`、`S0`、`S1`、`S5`、`S10` 全部可见。
- 默认序列自动播放。
- `appear` 有放大弹回效果。
- `win` 有扫光效果。
- 移除、调整、增加状态后，播放顺序按当前序列执行。
- 修改默认 stable 状态后，单次状态结束回到新的默认状态。
