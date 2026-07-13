# symbolsviewer

`symbolsviewer` 是 manifest 驱动的 symbol 调试 app。当前 Set selector 包含：

- `game002-s3`：任务 91 的发布目标，13 个主 symbol、12 个 Spine 4.3.23 skeleton。
- `game003-s1`：现有游戏资源，Spine 4.2.43；当前明确为非发布例外，选择其 Spine 状态会因 rendercore 仅支持 4.3.x 而显式失败。
- `game003-bg-bar`：独立 `normal|wild|up` 组件资源。

`game002-s3` 的 display set 固定为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`，所有 scale 为 `1`。viewer 只接入这 13 组 normal/spinBlur/disabled PNG、同名的 12 个 skeleton、`Symbol.atlas` 和 `Symbol.png`；不会通过宽泛 glob 接入 `CN_1..CN_4`、`Nearwin*` 或 `WM_Fx`。

scale、renderPriority 和 normal/appear/win animation 都来自各自的 `symbol-state-textures.manifest.json`，解析、Spine/VNI player 和 fallback 生命周期由 `@slotclientengine/rendercore` 提供。viewer 只负责 UI、输入校验、状态展示和 public resolver 调用。

对 `game002-s3`，只有 manifest 明确声明的 appear/win 才播放。比如 `WM.win`、`BN.appear`、`CN.appear/win` 不可用时，viewer 跳过该自定义状态并回到 normal；不会伪造 builtin/static 动画，也不会把 normal Spine 播放冒充自定义 win/appear。

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
