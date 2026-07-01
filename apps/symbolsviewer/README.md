# symbolsviewer

`symbolsviewer` 是 `@slotclientengine/rendercore` 的 PC 横屏调试 app，用来一次性展示当前 game config 中可处理的 slot symbol，并验证全局状态序列。

## 资产

viewer 支持七套显式 symbol set。每套都绑定自己的 runtime game config、PNG glob 和状态贴图 manifest；缺少 manifest、缺少必需状态图、manifest 引用不存在的 PNG、未知 manifest 字段或非法 `scale` 会直接报错。每个可展示 symbol 的显示缩放系数从 `symbol-state-textures.manifest.json` 的 `scale` 字段读取，仓库内生成物必须显式写出 `scale`，不要在 viewer 里维护第二份手写 scale 表。

第一套 `symbols` 使用仓库根目录资产：

- `assets/gamecfg/game2.json`
- `assets/symbols/*.png`
- `assets/symbols/*.spinBlur.png`
- `assets/symbols/*.disabled.png`
- `assets/symbols/symbol-composites.json`
- `assets/symbols/symbol-state-textures.manifest.json`

第一套可展示 symbol 是 `S00`、`S0`、`S1`、`S5`、`S10`、`SC`、`RS`、`X2`、`X5`、`X10`。paytable 中缺图的 `BN` 不会进入展示列表；孤儿图片 `CO.png`、`SX.png` 也不会进入展示列表。

第二套 `symbols001` 使用：

- `assets/gamecfg002/gameconfig.json`
- `assets/symbols001/*.png`
- `assets/symbols001/*.spinBlur.png`
- `assets/symbols001/*.disabled.png`
- `assets/symbols001/symbol-state-textures.manifest.json`

第二套可展示 symbol 是 `WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`CN`、`BN`。其中 `BN` 是显式透明图标，会显示 label 和状态，但不是通用缺图 fallback。`symbols001` 的 manifest scale 全部为 `0.8`，viewer 按 80% 逻辑尺寸排布。

第三套 `symbols002` 使用：

- `assets/gamecfg002/gameconfig.json`
- `assets/symbols002/*.png`
- `assets/symbols002/*.spinBlur.png`
- `assets/symbols002/*.disabled.png`
- `assets/symbols002/symbol-state-textures.manifest.json`

`symbols001`、`symbols002`、`symbols003`、`game002-s2` 和 `game002-s3` 使用的 runtime game config 由 `gengameconfig` 从 Excel 生成，viewer 只消费生成后的 `assets/gamecfg002/gameconfig.json`，不在 viewer 侧解析编辑器原始导出：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

第三套可展示 symbol 是 `WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`WM`、`CN`、`CM`、`CO`、`AF`。paytable 中缺图的 `BN` 不会进入展示列表；当前没有孤儿图片。第三套 PNG 保留美术原始 `200 x 200` 文件，`spinBlur` / `disabled` 派生图与普通图尺寸一致；manifest scale 全部为 `1`，按 100% 逻辑尺寸展示。

第四套 `symbols003` 复用同一份 runtime game config：

- `assets/gamecfg002/gameconfig.json`
- `assets/symbols003/*.png`
- `assets/symbols003/*.spinBlur.png`
- `assets/symbols003/*.disabled.png`
- `assets/symbols003/symbol-state-textures.manifest.json`

第四套可展示 symbol 是 `WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`CN`、`CO`。`gamecfg002` paytable 中当前缺少第四套图片的 `WM`、`CM`、`AF`、`BN` 不会进入展示列表，也不会用其它 set 的图片、placeholder 或空纹理顶替。第四套 PNG 保留美术原始 `180 x 180` 文件，`spinBlur` / `disabled` 派生图与普通图尺寸一致；manifest scale 全部为 `1`，按 100% 逻辑尺寸展示。

第五套 `game002-s2` 复用同一份 runtime game config：

- `assets/gamecfg002/gameconfig.json`
- `assets/game002-s2/*.png`
- `assets/game002-s2/*.spinBlur.png`
- `assets/game002-s2/*.disabled.png`
- `assets/game002-s2/symbol-state-textures.manifest.json`

第五套可展示 symbol 是 `WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`CN`、`CO`。`gamecfg002` paytable 中当前缺少第五套图片的 `WM`、`CM`、`AF`、`BN` 不会进入展示列表，也不会用其它 set 的图片、placeholder 或空纹理顶替。`assets/game002-s2/bg.png` 是 game002 背景图，不是 symbol；viewer 会在 set 配置层排除它，不能把它展示为 orphan symbol。第五套 PNG 保留美术原始 `200 x 200` 文件，`spinBlur` / `disabled` 派生图与普通图尺寸一致；manifest scale 全部为 `1`，按 100% 逻辑尺寸展示。

第六套 `game002-s3` 复用同一份 runtime game config：

- `assets/gamecfg002/gameconfig.json`
- `assets/game002-s3/*.png`
- `assets/game002-s3/*.spinBlur.png`
- `assets/game002-s3/*.disabled.png`
- `assets/game002-s3/symbol-state-textures.manifest.json`

第六套可展示 symbol 是 `WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`WM`、`CN`、`CM`、`CO`、`AF`。paytable 中缺图的 `BN` 不会进入展示列表。第六套 PNG 保留美术原始 `200 x 200` 文件，`spinBlur` / `disabled` 派生图与普通图尺寸一致；manifest scale 全部为 `1`，按 100% 逻辑尺寸展示。

第七套 `game003-s1` 使用 `game003` 的 runtime game config 和第一版皮肤资源：

- `assets/gamecfg003/gameconfig.json`
- `assets/game003-s1/*.png`
- `assets/game003-s1/*.spinBlur.png`
- `assets/game003-s1/*.disabled.png`
- `assets/game003-s1/symbol-state-textures.manifest.json`
- `assets/game003-s1/*-wins.json`
- `assets/game003-s1/assets/*.{png,jpg,jpeg,webp}`

第七套可展示 symbol 是 `WL`、`H1`、`H2`、`H3`、`H4`、`H5`、`L1`、`L2`、`L3`、`L4`、`L5`、`CO`、`CL`、`SC`。背景、主转轮框、传送带和 VNI 内部 asset 不会被当成 symbol 展示。`game003-s1` 的 manifest scale 全部为 `1`，并由同一个 manifest 声明 `L1.win` 的 VNI 动画；viewer 只把 manifest、VNI project modules 和 VNI asset modules 传给 `rendercore`，不在 app 内硬编码 `L1` 或 VNI 播放细节。

`SC`、`RS`、`X2`、`X5`、`X10` 使用拆层资源作为普通态来源：

- `SC`: `SC-0.png`、`SC-1-0.png`、`SC-2.png`；其中 layer `1` 还有 `SC-1-0.png` 到 `SC-1-4.png` 五帧 keyframes
- `RS`: `RS-0.png`、`RS-1.png`、`RS-2.png`
- `X2`: `X2-0.png`、`X2-1.png`
- `X5`: `X5-0.png`、`X5-1.png`
- `X10`: `X10-0.png`、`X10-1.png`

这些特殊 symbol 不使用旧的 `SC.png`、`RS.png`、`X2.png`、`X5.png`、`X10.png` 作为 viewer 普通态来源。manifest 必须把它们声明为 layered normal；缺 layer、index 不连续或引用不存在的 layer 文件会直接报错。

`spinBlur` 和 `disabled` 状态图由 `rendercore` 的 Node 脚本生成：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json --scale 1
```

`symbols001` 状态图生成命令：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols001 --output-dir assets/symbols001 --symbols WL,H1,H2,L1,L2,L3,L4,CN,BN --scale 0.8
```

`symbols002` 状态图生成命令：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF --scale 1
```

`symbols003` 状态图生成命令：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols003 --output-dir assets/symbols003 --symbols WL,H1,H2,L1,L2,L3,L4,CN,CO --scale 1
```

`game002-s2` 状态图生成命令：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game002-s2 --output-dir assets/game002-s2 --symbols WL,H1,H2,L1,L2,L3,L4,CN,CO --scale 1
```

`game002-s3` 状态图生成命令：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game002-s3 --output-dir assets/game002-s3 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF --scale 1
```

复合 symbol 的 `spinBlur` 和 `disabled` 是“先合成完整 symbol，再生成状态贴图”的结果，不是逐层模糊/置灰后再叠加。viewer 会读取 manifest，并要求当前可展示 symbol 同时具备 `spinBlur` 和 `disabled` 贴图；缺失或写入未知状态会直接报错。

## 特殊动画

`SC`：

- `appear`: layer `0` 不动，layer `1` 上下弹动并缩放到约 `1.2`，layer `2` 缩放到约 `1.2` 并扫光。
- `win`: layer `1` 播放 `SC-1-0.png` 到 `SC-1-4.png` 的贴图序列，同时 layer `1`、`2` 错峰扫光并缩放到约 `1.2`。

`RS`：

- `appear`: layer `0` 不动，layer `1` 上下弹动并缩放到约 `1.2`，同时向左旋转到约 `20` 度并在缩小时还原；layer `2` 缩放到约 `1.2` 并扫光。
- `win`: layer `0` 不动；layer `1` 扫光缩放到约 `1.2`，同时向左旋转到约 `20` 度并在缩小时还原；layer `2` 延迟 `0.08s` 扫光缩放到约 `1.2`。

`X2` / `X5` / `X10`：

- `appear`: layer `0` 不动，layer `1` 缩放到约 `1.2` 并扫光。
- `win`: layer `0` 不动，layer `1` 扫光并缩放到约 `1.2`。

`symbols001`、`symbols002`、`symbols003`、`game002-s2`、`game002-s3` 和 `game003-s1` 的所有可展示 symbol：

- `appear`: 主普通图保持原始 scale，普通图后方额外出现一张半透明普通图副本，副本放大到约 `1.6` 后消退。
- `win`: 默认使用单图扫光效果；`game003-s1` 的 `L1.win` 由 manifest 驱动播放 `assets/game003-s1/L1-wins.json` 对应的 VNI 动画。

动画配置位于 `src/symbol-animation-config.ts`，执行和参数校验由 `@slotclientengine/rendercore` 的 resolver 完成。manifest 解析、scale map、stateful asset map 和 VNI animation resource 组装也来自 `@slotclientengine/rendercore`，viewer 只负责选择资源集合和展示状态。

## 运行

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

## 界面

第一屏就是状态展示工具：

- 顶部工具栏可播放、暂停、进入下一状态、重置和切换默认 stable 状态。
- 顶部 `Set` selector 可在 `symbols`、`symbols001`、`symbols002`、`symbols003`、`game002-s2`、`game002-s3` 和 `game003-s1` 之间切换；切换时会重建 catalog、Pixi symbol 和状态序列。
- 右侧序列区可增加、移除、上移、下移状态。
- `stable` 状态可设置停留秒数。
- `appear` 和 `win` 是单次状态，等待全部图标播放完成后进入下一步。
- 状态面板显示每个 symbol 的 requested/resolved/default/pending 状态。

默认序列是 `normal -> appear -> win -> spinBlur -> disabled`。`spinBlur` 和 `disabled` 的状态机 resolved 仍是 `normal`，所以面板会显示 requested 分别为 `spinBlur` / `disabled`，resolved 为 `normal`；画面会根据 requested state 分别使用纵向模糊贴图和灰色贴图。

## 验收

PC 横屏建议使用 `1280x720` 或更大视口确认：

- 默认进入 `symbols`。
- Pixi canvas 非空。
- `S00`、`S0`、`S1`、`S5`、`S10`、`SC`、`RS`、`X2`、`X5`、`X10` 全部可见。
- `SC`、`RS`、`X2`、`X5`、`X10` 的普通态来自多层图，不是旧单图。
- 默认序列自动播放。
- `normal` 显示普通图。
- `SC` / `RS` 的 `appear` 中 layer `0` 不动，layer `1` 弹动缩放，layer `2` 扫光缩放；其中 `RS` layer `1` 会在放大时向左旋转约 `20` 度并还原。
- `X2` / `X5` / `X10` 的 `appear` 中 layer `0` 不动，layer `1` 扫光缩放。
- `SC.win` 中 layer `1` 播放 `SC-1-0.png` 到 `SC-1-4.png`，`RS/X2/X5/X10.win` 不播放贴图序列。
- `win` 中特殊 symbol 上层按各自 layer 错峰扫光缩放，layer `0` 不动；其中 `RS` layer `1` 会在放大时向左旋转约 `20` 度并还原。
- `spinBlur` 显示纵向模糊图，不是普通图。
- `disabled` 显示灰色图，不是普通图。
- 移除、调整、增加状态后，播放顺序按当前序列执行。
- 修改默认 stable 状态后，单次状态结束回到新的默认状态；默认状态是 `spinBlur` 或 `disabled` 时，`appear` / `win` 结束后分别回到模糊图或灰图。
- 切换到 `symbols001` 后，`WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`CN`、`BN` 全部有状态面板；`BN` 图像透明但 label 和状态存在。
- `symbols001` 的 9 个图标使用 manifest 中的 `0.8` 缩放系数展示，并按当前舞台宽度自动换行，图标和 label 不重叠。
- 切换到 `symbols002` 后，`WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`WM`、`CN`、`CM`、`CO`、`AF` 全部可见，`BN` 不显示。
- `symbols002` 的 12 个图标使用 manifest 中的 `1` 缩放系数展示，并按当前舞台宽度自动换行，图标和 label 不重叠。
- `symbols002.appear` 中主图不缩放，图后半透明副本放大消退。
- `symbols002.spinBlur` 显示纵向模糊图，`symbols002.disabled` 显示灰色图。
- 切换到 `symbols003` 后，`WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`CN`、`CO` 全部可见，`WM`、`CM`、`AF`、`BN` 不显示。
- `symbols003` 的 9 个图标使用 manifest 中的 `1` 缩放系数展示，并按当前舞台宽度自动换行，图标和 label 不重叠。
- `symbols003.appear` 中主图不缩放，图后半透明副本放大消退。
- `symbols003.win` 使用默认单图扫光效果。
- `symbols003.spinBlur` 显示纵向模糊图，`symbols003.disabled` 显示灰色图。
- 切换到 `game002-s2` 后，`WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`CN`、`CO` 全部可见，`WM`、`CM`、`AF`、`BN` 不显示，`bg` 不显示且不出现在 orphan 资产列表。
- `game002-s2` 的 9 个图标使用 manifest 中的 `1` 缩放系数展示，并按当前舞台宽度自动换行，图标和 label 不重叠。
- `game002-s2.appear` 中主图不缩放，图后半透明副本放大消退；`spinBlur` 显示纵向模糊图，`disabled` 显示灰色图。
- 切换到 `game002-s3` 后，`WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`WM`、`CN`、`CM`、`CO`、`AF` 全部可见，`BN` 不显示。
- `game002-s3` 的 12 个图标使用 manifest 中的 `1` 缩放系数展示，并按当前舞台宽度自动换行，图标和 label 不重叠。
- `game002-s3.appear` 中主图不缩放，图后半透明副本放大消退；`win` 使用默认单图扫光效果，`spinBlur` 显示纵向模糊图，`disabled` 显示灰色图。
- 切换到 `game003-s1` 后，`WL`、`H1`、`H2`、`H3`、`H4`、`H5`、`L1`、`L2`、`L3`、`L4`、`L5`、`CO`、`CL`、`SC` 全部可见。
- `game003-s1` 的 14 个图标使用 manifest 中的 `1` 缩放系数展示，并按当前舞台宽度自动换行，图标和 label 不重叠。
- `game003-s1.L1.win` 播放 VNI 动画，其它 symbol 的 `win` 继续使用默认单图扫光效果。
- `game003-s1.spinBlur` 显示纵向模糊图，`game003-s1.disabled` 显示灰色图。
- 连续执行 `symbols -> symbols001 -> symbols002 -> symbols003 -> game002-s2 -> game002-s3 -> game003-s1 -> symbols` 至少 3 次，旧 symbol、旧状态面板和旧 Pixi 对象不残留，浏览器 console 无错误。
