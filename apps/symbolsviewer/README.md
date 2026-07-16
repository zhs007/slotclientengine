# symbolsviewer

`symbolsviewer` 是 manifest 驱动的 symbol 调试 app。当前 Set selector 包含：

- `game002-s3`：任务 91 的发布目标，13 个主 symbol、12 个 Spine 4.3.23 skeleton。
- `game003-s1`：现有游戏资源，Spine 4.3.23；由 rendercore 的官方 4.3.x runtime 解析和播放。
- `game003-bg-bar`：独立 `normal|wild|up` 组件资源。

`game002-s3` 的 display set 固定为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`，所有 scale 为 `1`。viewer 只把这 13 项放进 symbol selector；同名主 skeleton 仍是 12 个。`CN_1..CN_4` 仅作为当前 `CN.valuePresentation` manifest 精确引用的附属 Spine，通过生成闭包和 rendercore 的 `RenderSymbol` value controller 预览，不成为独立 symbol；`Nearwin*` 与 `WM_Fx` 仍不会被宽泛 glob 接入。

当当前 set 含 `valuePresentation` 时，toolbar 显示 positive integer Value、Apply Value 和 Clear Value。默认值 `25` 可预览当前 CN 第二档；输入 `9/10/99/100/999/1000` 可核对 manifest 边界。数字由 rendercore 绑定到 manifest 配置的 Spine `Num` slot，跟随该 slot/bone 动画。切 set、Reset 或 Clear 会清理展示，普通 set 不显示该控件。viewer 不解析阈值、不创建私有 Spine adapter，也不把 appear/win 控件映射到未配置动画。

scale、renderPriority 和 normal/appear/win/remove/dropdown animation 都来自各自的 `symbol-state-textures.manifest.json`，解析和 Spine/VNI player 生命周期由 `@slotclientengine/rendercore` 提供。viewer 只负责 UI、输入校验、状态展示和 public resolver 调用。

对 `game002-s3`，只有 manifest 明确声明的 appear/win/remove/dropdown 才播放。`CN` 的全部状态在同一个 tier player 上切换，数字不会二次创建或 attach。`BN` 没有 remove/appear，`WM` 没有 win；viewer 对这类未配置状态显示 normal，不会伪造 builtin/static 动画。dropdown 未配置时同样保持 normal，美术位移仍由实际 grid-cell runtime 负责。

运行与验收：

```bash
pnpm --filter symbolsviewer format
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

界面支持播放、暂停、下一状态、重置、stable state 和 Set 切换。状态面板展示当前 display set、manifest priority、paytable 缺图和孤儿资源校验结果。缺 manifest、资源、atlas page/region、精确 animation name 或受支持 Spine 版本都必须显式失败。
