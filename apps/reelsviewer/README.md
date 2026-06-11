# reelsviewer

`reelsviewer` 是 `@slotclientengine/rendercore` 的 reel 旋转验证工具。第一屏就是 5 轴 5 行 reels 和操作按钮，不做 landing page。

## 数据来源

- 游戏配置：`assets/gamecfg/game2.json`
- symbol 图片和状态贴图：`assets/symbols`
- 复合 symbol 配置：`assets/symbols/symbol-composites.json`
- 状态贴图 manifest：`assets/symbols/symbol-state-textures.manifest.json`
- GMI：直接引用 `packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json`

默认读取 GMI 的 step0 scene0，并用 `game2.json` 的 `reels01` 计算最终停留 y。当前验收值是：

```text
finalYs = [1, 1, 4, 0, 27]
```

## 规则

- `BN` 是显式空图标。
- paytable 中缺少普通图的 symbol 按空 cell 处理。
- 有普通图且参与 reels 渲染的 symbol 必须有 `spinBlur` 状态贴图。
- `CO.png`、`SX.png` 当前不在 paytable 中，是孤儿图片，不参与 reels 渲染。
- 共享 state texture manifest 支持单图 normal string 和 layered normal object。
- `SC`、`RS`、`X2`、`X5`、`X10` 在 reels 中按 layered normal 渲染普通态，`SC-0` 这类 layer 文件不会成为独立 paytable asset。
- `SC` / `RS` 的 `appear` 与 symbolsviewer 一致：layer `0` 不动，layer `1` 弹动缩放，layer `2` 扫光缩放。
- `X2` / `X5` / `X10` 的 `appear` 与 symbolsviewer 一致：layer `0` 不动，layer `1` 扫光缩放。
- 特殊 symbol 的 `win` 使用 named animation profile 让上层做错峰扫光缩放，layer `0` 不动。
- 每种 symbol 都可以通过 `symbolScales` 配置整体缩放；默认 `SC`、`RS`、`X2`、`X5`、`X10` 为 `1.5`。
- `spinBlur` 使用从完整复合图标生成的合成状态贴图，不回退普通 layers。
- cell 尺寸由非空、可渲染普通图在应用 `symbolScales` 后的最大宽高计算；多层 symbol 使用 layer 共同尺寸，小图居中显示。

默认 viewer 配置在 `src/reels-config.ts`：

- `reelsName = "reels01"`
- `visibleRows = 5`
- `emptySymbols = ["BN"]`
- `symbolScales = { SC: 1.5, RS: 1.5, X2: 1.5, X5: 1.5, X10: 1.5 }`
- `minimumSpinCycles = 10`
- `baseDurationMs = 1600`
- `speedSymbolsPerSecond = 42`
- `startDelayMs = 90`
- `stopDelayMs = 180`

## 运行

```bash
pnpm --filter reelsviewer dev -- --host 0.0.0.0
```

## 验收点

- Pixi canvas 非空。
- 页面上有明确的 `Spin` 按钮。
- 点击 `Spin` 后触发一次完整 spin。
- 第 1 到第 5 轴依次启动。
- 旋转期间非空 symbol 使用 `spinBlur`。
- 第 1 到第 5 轴依次停止。
- 停止后非空可见 symbol 播放 `appear`。
- `appear` 后回到 `normal`。
- 最终 scene 与 GMI step0 scene0 一致。
