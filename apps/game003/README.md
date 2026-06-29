# game003

`apps/game003` 是 `game003` live slot 客户端。入口第一屏直接加载游戏画面，通过 URL query 读取 live 参数，并使用 `@slotclientengine/gameframeworks` 作为 UI / live / logic facade。

## 资源

- 游戏配置：`assets/gamecfg003/gameconfig.json`
- Excel 输入：`assets/gamecfg003/paytable.xlsx`、`assets/gamecfg003/bg-reel01.xlsx`
- 视觉资源：`assets/game003-s1`
- 横版背景：`assets/game003-s1/bg1.jpg`
- 竖版背景：`assets/game003-s1/bg2.jpg`
- 主转轮框：`assets/game003-s1/mainreelbg.png`
- 横版传送带：`assets/game003-s1/conveyor1.png`
- 竖版传送带：`assets/game003-s1/conveyor2.png`

生成 `gameconfig.json`：

```bash
CI=true pnpm --filter gengameconfig dev -- --paytable assets/gamecfg003/paytable.xlsx --reel assets/gamecfg003/bg-reel01.xlsx --out assets/gamecfg003/gameconfig.json
```

`H1.jpg` 到 `H5.jpg` 是原始输入，运行时 symbol 普通态必须使用一次性规范化后的 `H1.png` 到 `H5.png`。不要为了 JPG 输入扩展共享 symbol 生成器或运行时。

生成 symbol 状态贴图和 manifest：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
```

`symbol-state-textures.manifest.json` 只能包含 `WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC`，每个 symbol 必须显式 `scale: 1`。背景、主转轮框和传送带不是 symbol。

## 布局边界

横竖屏 art 和 focus region 选择使用 `@slotclientengine/rendercore` 的 `calculateResponsiveArtViewport(...)`：

- 当前 canvas 逻辑尺寸 `height > width` 时使用竖版 `bg2.jpg`。
- 其它情况使用横版 `bg1.jpg`，包括正方形。
- 横版 focus region 是 `conveyor1 + 10px gap + mainreelbg` 的 union rect。
- 竖版 focus region 是 `conveyor2 + 10px gap + mainreelbg` 的 union rect。

DOM frame 使用 `gameframeworks` / `uiframeworks` 的 `orientation-focus` policy 提交横竖屏不同 canvas 逻辑上限：横版不超过 `2000 x 2000`，竖版不超过 `1174 x 2000`。实际 art 裁切、居中和 focus-rect 映射仍由 `rendercore` 完成，app 不直接绕过 framework 的 DOM frame policy。

`mainreelbg`、`conveyor1`、`conveyor2` 的组合、间距、层级和校准属于 game003 app 专属实现，位于 `apps/game003/src/game-layout.ts` 和 `apps/game003/src/game-adapter.ts`，不要上移到 `rendercore`。

第一版主转轮窗口校准为 `mainreelbg.png` 内 `{ x: 135, y: 87, width: 860, height: 650 }`，对应 5 列 x 5 行、单格 `172 x 130`。

## Live URL

必需 query 参数：

```text
skin=1
serverUrl=<ws/wss url>
gamecode=EfedJuHEaydXNghnmO9KI
token=<token>
businessid=<business id>
clienttype=<client type>
jurisdiction=<jurisdiction>
language=<language>
bet=5
lines=10
times=1
autonums=-1
requestTimeoutMs=30000
```

示例：

```text
http://127.0.0.1:5208/?skin=1&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=EfedJuHEaydXNghnmO9KI&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
```

`token` 中如果包含 `+`、`&`、`=` 等字符，调用方必须先使用 `encodeURIComponent()`。

## Reel 边界

`game003` 使用 `assets/gamecfg003/gameconfig.json` 中的本地公开轮带 `bg-reel01` 进行普通 reel 滚动。服务器返回的 scene 只作为本轮目标可见窗口叠加进临时 strip；如果目标窗口无法在本地公开轮带反查 stop y，不作为 live spin 失败条件。未知 symbol code 或当前资源缺失的 paytable symbol 仍然显式失败。

## 命令

```bash
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```
