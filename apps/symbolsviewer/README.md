# symbolsviewer

`symbolsviewer` 是 `@slotclientengine/rendercore` 的 PC 横屏调试 app，用来一次性展示当前 game config 中可处理的 slot symbol，并验证全局状态序列。

## 资产

使用仓库根目录资产：

- `assets/gamecfg/game2.json`
- `assets/symbols/*.png`
- `assets/symbols/*.spinBlur.png`
- `assets/symbols/*.disabled.png`
- `assets/symbols/symbol-composites.json`
- `assets/symbols/symbol-state-textures.manifest.json`

viewer 只展示 paytable 与普通图片资源的交集。当前可展示 symbol 是 `S00`、`S0`、`S1`、`S5`、`S10`、`SC`、`RS`、`X2`、`X5`、`X10`。paytable 中缺图的 `BN` 不会进入展示列表；孤儿图片 `CO.png`、`SX.png` 也不会进入展示列表。

`SC`、`RS`、`X2`、`X5`、`X10` 使用拆层资源作为普通态来源：

- `SC`: `SC-0.png`、`SC-1.png`、`SC-2.png`
- `RS`: `RS-0.png`、`RS-1.png`、`RS-2.png`
- `X2`: `X2-0.png`、`X2-1.png`
- `X5`: `X5-0.png`、`X5-1.png`
- `X10`: `X10-0.png`、`X10-1.png`

这些特殊 symbol 不使用旧的 `SC.png`、`RS.png`、`X2.png`、`X5.png`、`X10.png` 作为 viewer 普通态来源。manifest 必须把它们声明为 layered normal；缺 layer、index 不连续或引用不存在的 layer 文件会直接报错。

`spinBlur` 和 `disabled` 状态图由 `rendercore` 的 Node 脚本生成：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json
```

复合 symbol 的 `spinBlur` 和 `disabled` 是“先合成完整 symbol，再生成状态贴图”的结果，不是逐层模糊/置灰后再叠加。viewer 会读取 manifest，并要求当前可展示 symbol 同时具备 `spinBlur` 和 `disabled` 贴图；缺失或写入未知状态会直接报错。

## 特殊动画

`SC` / `RS`：

- `appear`: layer `0` 不动，layer `1` 上下弹动并缩放到约 `1.2`，layer `2` 缩放到约 `1.2` 并扫光。
- `win`: layer `0` 不动，layer `1`、`2` 错峰扫光并缩放到约 `1.2`。

`X2` / `X5` / `X10`：

- `appear`: layer `0` 不动，layer `1` 缩放到约 `1.2` 并扫光。
- `win`: layer `0` 不动，layer `1` 扫光并缩放到约 `1.2`。

动画配置位于 `src/symbol-animation-config.ts`，执行和参数校验由 `@slotclientengine/rendercore` 的 named animation resolver 完成。

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

默认序列是 `normal -> appear -> win -> spinBlur -> disabled`。`spinBlur` 和 `disabled` 的状态机 resolved 仍是 `normal`，所以面板会显示 requested 分别为 `spinBlur` / `disabled`，resolved 为 `normal`；画面会根据 requested state 分别使用纵向模糊贴图和灰色贴图。

## 验收

PC 横屏建议使用 `1280x720` 或更大视口确认：

- Pixi canvas 非空。
- `S00`、`S0`、`S1`、`S5`、`S10`、`SC`、`RS`、`X2`、`X5`、`X10` 全部可见。
- `SC`、`RS`、`X2`、`X5`、`X10` 的普通态来自多层图，不是旧单图。
- 默认序列自动播放。
- `normal` 显示普通图。
- `SC` / `RS` 的 `appear` 中 layer `0` 不动，layer `1` 弹动缩放，layer `2` 扫光缩放。
- `X2` / `X5` / `X10` 的 `appear` 中 layer `0` 不动，layer `1` 扫光缩放。
- `win` 中特殊 symbol 只让上层按各自 layer 错峰扫光缩放，layer `0` 不动。
- `spinBlur` 显示纵向模糊图，不是普通图。
- `disabled` 显示灰色图，不是普通图。
- 移除、调整、增加状态后，播放顺序按当前序列执行。
- 修改默认 stable 状态后，单次状态结束回到新的默认状态；默认状态是 `spinBlur` 或 `disabled` 时，`appear` / `win` 结束后分别回到模糊图或灰图。
