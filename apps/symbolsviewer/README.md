# symbolsviewer

`symbolsviewer` 是 `game003-s1` symbol 调试 app，用来一次性展示 `game003` 当前可处理的 slot symbol，并验证 manifest 驱动的状态动画。

## 资产

viewer 只绑定 `game003-s1`：

- `assets/gamecfg003/gameconfig.json`
- `assets/game003-s1/*.png`
- `assets/game003-s1/*.spinBlur.png`
- `assets/game003-s1/*.disabled.png`
- `assets/game003-s1/symbol-state-textures.manifest.json`
- `assets/game003-s1/*-wins.json`
- `assets/game003-s1/assets/*.{png,jpg,jpeg,webp}`

可展示 symbol 是 `WL`、`H1`、`H2`、`H3`、`H4`、`H5`、`L1`、`L2`、`L3`、`L4`、`L5`、`CO`、`CL`、`SC`。背景、主转轮框、传送带和 VNI 内部 asset 不会被当成 symbol 展示。

每个可展示 symbol 的 `scale`、`appear` / `win` 动画类型和 `durationSeconds` 都来自 `symbol-state-textures.manifest.json`。viewer 只把 manifest、VNI project modules 和 VNI asset modules 传给 `@slotclientengine/rendercore`，不在 app 内维护第二份 scale 表，也不硬编码 `L1`-`L5` 的播放逻辑。

`game003-s1` 的动画规则：

- `L1.appear` 到 `L5.appear`：manifest `kind: "static"`，直接保持普通状态静态图。
- `L1.win` 到 `L5.win`：manifest `kind: "vni"`，播放对应 `assets/game003-s1/L*-wins.json`。
- 其它可展示 symbol 的 `appear` / `win`：manifest `kind: "builtin"`，使用 manifest 中声明的 `durationSeconds` 调用 rendercore 内置效果。

`stageRect` 不属于 runtime manifest；如果 manifest 中写入 `stageRect`，rendercore 会作为未知字段显式失败。

生成 symbol 状态贴图和 manifest：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
```

重新生成状态贴图时，生成器会保留仍然有效的 `animations` 元数据，不能手动丢掉 manifest animation。

## 运行

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

## 界面

第一屏就是状态展示工具：

- 顶部工具栏可播放、暂停、进入下一状态、重置和切换默认 stable 状态。
- 顶部 `Set` selector 只包含 `game003-s1`。
- 右侧序列区可增加、移除、上移、下移状态。
- 下方状态面板展示当前 symbol set、可展示 symbol、paytable 缺图和孤儿图片检查结果。
