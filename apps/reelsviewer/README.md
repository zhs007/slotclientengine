# reelsviewer

`reelsviewer` 是 `@slotclientengine/rendercore` 的 reel 旋转验证工具。第一屏就是 5 轴 5 行 reels 和操作按钮，不做 landing page。

## 数据来源

- 游戏配置：`assets/gamecfg/game2.json`
- symbol 图片和状态贴图：`assets/symbols`
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
- cell 尺寸由非空、可渲染普通图的最大宽高计算，小图居中显示。

默认 viewer 配置在 `src/reels-config.ts`：

- `reelsName = "reels01"`
- `visibleRows = 5`
- `emptySymbols = ["BN"]`
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
