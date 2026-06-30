# game003

`apps/game003` 是 `game003` live slot 客户端。入口第一屏先显示轻量 loading 页面，通过游戏包体内的 loading 资源清单预加载静态资源；资源阶段最多到 `99%`，随后在 `99%` 回调中连接固定 live server 并完成 `enterGame`。只有 loading 到 `100%` 后，才创建 `@slotclientengine/gameframeworks` framework、挂载 Pixi 画面并进入正式游戏渲染。

## 资源

- 静态配置源：`apps/game003/config/game-static.yaml`
- 生成配置模块：`apps/game003/src/generated/game-static.generated.ts`
- loading 资源生成模块：`apps/game003/src/generated/game-loading.generated.ts`
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

## 静态配置

`config/game-static.yaml` 是 `game003` 可编辑静态配置源，保留中文注释给美术、配置人员和发布流程理解字段用途、坐标基准与修改边界。注释只给人看，构建工具只读取 YAML 数据字段。

`src/generated/game-static.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改。
`src/generated/game-loading.generated.ts` 同样由 `apps/buildgamestatic` 生成，禁止手改。
修改 YAML 后执行：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

`gameConfig` 字段只引用 `assets/gamecfg003/gameconfig.json`；Excel 到 JSON 仍由 `apps/gengameconfig` 负责。symbol scale 仍由 `assets/game003-s1/symbol-state-textures.manifest.json` 负责，不在 YAML 或 app 内维护第二份 scale 表。

`loading.resources` 只承载随游戏包发布的静态资源 path/glob 和权重，不承载 token、cookie、serverUrl、服务器真实轮带或玩家本次下注。glob 必须是明确资源组，不能用 `assets/game003-s1/*.png` 这类宽泛写法把主转轮框、传送带和 symbol 混在一起。

## Loading 启动顺序

- `src/main.ts` 是轻入口，只静态导入 `@slotclientengine/gameloading` 和 `src/loading-resources.ts`。
- `src/loading-resources.ts` 合并 `game-loading.generated.ts` 的静态资源和 `game003-runtime-module` 动态模块资源。
- `src/game-entry.ts` 才导入 `gameframeworks`、Pixi adapter、game layout 和正式游戏配置。
- loading 资源阶段完成后停在 `99%`，调用 `prepareGame003At99()` 解析 query、拒绝旧 `serverUrl`、创建预连接 live session，并完成真实 `connect + enterGame`。
- `prepareGame003At99()` 成功后进度到 `100%`，再调用 `enterGame003()` 创建 framework 和 Pixi adapter。
- framework 使用同一个预连接 session，`framework.connect()` 不会产生第二次 WebSocket connect / enterGame。
- loading DOM 和 game DOM 分别挂载到 `loadingHost` / `gameHost`，进入游戏失败时会保留 loading 错误态，不留下半挂载 canvas。

## 布局边界

横竖屏 art 和 focus region 选择使用 `@slotclientengine/rendercore` 的 `calculateResponsiveArtViewport(...)`：

- 当前 canvas 逻辑尺寸 `height > width` 时使用竖版 `bg2.jpg`。
- 其它情况使用横版 `bg1.jpg`，包括正方形。
- `focusRect` 是背景图上的重点区域，也是 `mainreelbg` 和传送带的相对定位 anchor。
- 横版和竖版分别在 `config/game-static.yaml` 中声明自己的 `focusRect`、`mainReelBackgroundPositionInFocusRect` 和 `conveyor.positionInFocusRect`。
- `positionInFocusRect` 坐标允许负数；例如横屏主转轮相对 `focusRect` 上移 10px 时使用 `y: -10`。

DOM frame 使用 `gameframeworks` / `uiframeworks` 的 `orientation-focus` policy 提交横竖屏不同 canvas 逻辑上限：横版不超过 `2000 x 2000`，竖版不超过 `1174 x 2000`。实际 art 裁切、居中、anchor rect 和 focus-rect 映射仍由 `rendercore` 完成，app 不直接绕过 framework 的 DOM frame policy，也不复制 `rect.x - visibleRect.x` 这类通用映射算法。

`mainreelbg`、`conveyor1`、`conveyor2` 的组合、10px 视觉间隔、层级和校准属于 game003 app 专属实现，位于 `apps/game003/src/game-layout.ts` 和 `apps/game003/src/game-adapter.ts`，不要上移到 `rendercore`。间隔已经体现在 `positionInFocusRect` 数值中，运行时代码不再通过 conveyor 尺寸、gap 或 placement 枚举推导位置。

第一版主转轮窗口校准为 `mainreelbg.png` 内 `{ x: 135, y: 87, width: 860, height: 650 }`，对应 5 列 x 5 行、单格 `172 x 130`。

修改 `config/game-static.yaml` 后必须同步执行：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

## Live URL

必需 query 参数：

```text
skin=1
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

live server 和 gamecode 固定来自 `config/game-static.yaml`。URL 中不支持 `serverUrl` 参数；旧链接继续携带 `gamecode` 时可以省略，若提供则必须等于 `EfedJuHEaydXNghnmO9KI`。

示例：

```text
http://127.0.0.1:5208/?skin=1&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
```

`token` 中如果包含 `+`、`&`、`=` 等字符，调用方必须先使用 `encodeURIComponent()`。如果 URL 中继续携带旧的 `serverUrl` 参数，初始化会显式失败，避免误以为服务器地址仍可由链接覆盖。

## Reel 边界

`game003` 使用 `assets/gamecfg003/gameconfig.json` 中的本地公开轮带 `bg-reel01` 进行普通 reel 滚动。服务器返回的 scene 只作为本轮目标可见窗口叠加进临时 strip；如果目标窗口无法在本地公开轮带反查 stop y，不作为 live spin 失败条件。未知 symbol code 或当前资源缺失的 paytable symbol 仍然显式失败。

## 命令

```bash
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```
