# game002 demo

`game002` 是基于 Pixi、`@slotclientengine/gameframeworks` 和 `@slotclientengine/rendercore` 的第二套 live slot app。第一屏就是游戏画面，不包含 landing page。

## 运行结构

生产入口由 `createSlotGameFramework()` 创建通用 slot shell、HUD、live 连接、enter game、spin、`GameLogic` 转换、余额/下注/win 状态和最终 `collect()`。`game002` 提供 `SlotGameAdapter`，只负责把 Pixi canvas 挂到 `context.gameLayer`、加载 game002 资源、应用 live `defaultScene`、读取 `GameLogic` 主 scene，并配置 `@slotclientengine/rendercore` 的 `54` 个 grid cell reels 展示。

`game002` 不直接创建 live client，不直接调用 `collect()`，也不直接依赖底层 live、UI 或 logic 包。需要读取 game config、reels 或 stop y 时，从 `@slotclientengine/gameframeworks` facade 导入 `createGameConfig`、`LogicGameConfig`、`SceneMatrix` 等 API / type。

## 数据来源

`game002` 是单 app、多皮肤入口，不新增 `apps/game003`，也不新增 `assets/gamecfg003`。页面 URL 的 `skin` query 参数只选择前端背景和 symbol 资源，不改变 live 服务器、`gamecode`、token、下注参数、spin request 或 collect 流程。

三套皮肤共用：

- `assets/gamecfg002/gameconfig.json`
- 同一份 live `serverUrl`
- 同一个 URL 传入的 `gamecode`

`skin=1` 使用：

- `assets/game002-s1/bg.jpg`
- `assets/symbols001/*.png`
- `assets/symbols001/symbol-state-textures.manifest.json`

`skin=2` 使用：

- `assets/game002/bgfull.jpg`
- `assets/symbols002/*.png`
- `assets/symbols002/symbol-state-textures.manifest.json`

`skin=3` 使用：

- `assets/game003/bg.jpg`
- `assets/symbols003/*.png`
- `assets/symbols003/symbol-state-textures.manifest.json`

运行时背景尺寸均为 `2000 x 2000`。`assets/game002/bg.jpg` 是旧 `1125 x 2000` portrait 参考图，不再作为运行时背景。

`skin=1` 当前可贴图 symbol 是 `WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`CN`、`BN`。其中 `BN` 是透明空图标，作为显式贴图参与加载；它不是通用 catalog fallback。`skin=1` 当前缺贴图的 `WM`、`CM`、`CO`、`AF` 仍然显式失败，不会自动映射为 `BN`。

`skin=2` 当前可贴图 symbol 是 `WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`WM`、`CN`、`CM`、`CO`、`AF`。`skin=3` 当前可贴图 symbol 是 `WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`CN`、`CO`。`skin=2` / `skin=3` 中 `BN` 是 empty symbol，不要求图片。

第三套当前不会收到缺资源的 `WM`、`CM`、`AF`、`BN` 数据；如果未来服务端开始下发这些 symbol，必须先补齐 `assets/symbols003` 普通图、`spinBlur`、`disabled`、manifest、测试和 README，再允许进入运行时。`skin=3` 不会借用 `symbols002` 图片，也不会生成 placeholder 或空纹理兜底；scene 里出现当前皮肤缺贴图的 code 会显式失败。

## 布局

Framework 创建：

```text
.slot-ui-page
  .slot-ui-frame
    .slot-ui-game-layer
    .slot-ui-overlay
```

Pixi canvas 位于 `.slot-ui-game-layer` 内，backing size 由 `gameframeworks` 透传的 viewport snapshot 决定。`game002` 使用 `framePolicy` 提交最大不超过 `2000 x 2000` 的逻辑尺寸，并在 Pixi stage 内使用完整 `2000 x 2000` art world；resize 时只调用 renderer resize 并移动 world container，不重建 live/framework。`game002` 只补充 canvas 样式，不复制 HUD 布局。

`skin=2` / `skin=3` 的 art 坐标和旧坐标映射：

- art/background：`2000 x 2000`，运行时背景为 `bgfull.jpg`
- 旧 reference crop：`1125 x 2000`，在 art 中为 `x=437.5`, `y=0`
- 旧 board frame：`x=200`, `y=330`, `width=720`, `height=1080`
- art board frame：`x=637.5`, `y=330`, `width=720`, `height=1080`
- cell：`120 x 120`
- scene：`6 x 9`
- reels：`reels-001`
- symbol：`200 x 200` 原图按 `100%` 缩放显示，并以 cell 中心定位

`skin=1` 使用同一个 `2000 x 2000` art world，但 `assets/game002-s1/bg.jpg` 的棋盘格更大，不能套用 `skin=2` / `skin=3` 的 `120 x 120` 棋盘：

- background：`assets/game002-s1/bg.jpg`
- board frame：`x=620`, `y=465`, `width=750`, `height=1200`
- cell：`125 x 133.333333`
- scene：`6 x 9`
- reels：`reels-001`
- `BN`：透明贴图，scene code 为 `BN` 时显示为空，但仍走显式 symbol 资源

不同 viewport 的期望：

- `1125 x 2000` portrait：visible art rect 为 `x=437.5,y=0,width=1125,height=2000`，board 回到屏幕内 `x=200,y=330`。
- `1200 x 1200` square：visible art rect 为 `x=397.5,y=270,width=1200,height=1200`，board 在 viewport 内为 `x=240,y=60`，不会显示完整 `2000 x 2000` 背景。
- `3000 x 1200` ultra-wide：DOM frame/canvas 逻辑尺寸为 `2000 x 1200` 并水平居中，页面左右多余空间保持黑色。

每个棋盘格在滚动期间都有按当前 skin 配置的裁切窗口：`skin=2` / `skin=3` 是 `120 x 120`，`skin=1` 是 `125 x 133.333333`。格子内是独立 `visibleRows=1` 的垂直微型 reel。深浅交替的暗度 strip 挂在每个转动微型 reel 内部，随 reel 滚动经过裁切窗口，所以每个格子在旋转中会快速明暗变化。单个格子落地后会立即移除外层裁切，最终静态 symbol 不继续依赖 mask；落地暗度折叠在当前格内淡出，不串到邻格。格子启动和停止顺序固定为从上到下、从左到右：`x=0,y=0..8`，然后 `x=1,y=0..8`，直到 `x=5,y=8`。每个 cell 的本地轮带窗口还会使用 `@slotclientengine/rendercore` 的 per-cell reel offset；当前配置为同列每往下一格额外偏移 `16`，加上原本行号偏移后，同列 9 个格子的滚动窗口会更分散，但最终可见 scene 仍严格等于服务器目标 scene。

如果 live `defaultScene` 存在，初始化显示该 scene；如果不存在，idle 初始化阶段 reels 层保持 hidden，不用本地数据顶替；第一次真实 live spin 结果返回后，grid-cell reels 会立即显示并播放到该真实目标 scene。

live spin 的滚动过程使用本地 `reels-001` 公开轮带。服务器真实轮带不会下发到前端；服务器返回的最终 `6 x 9` scene 只作为本轮落点窗口叠加到临时渲染轮带里。因此目标 scene 即使无法在本地 `reels-001` 中反查出连续 stop y，也会继续用本地轮带滚动并在落点窗口显示服务器结果；未知 symbol code 或缺失贴图仍然显式失败。

## Live 配置

静态发布版只从页面 URL query 读取 live 和 spin 参数，不从构建环境、hash、cookie、`localStorage`、远程配置文件或默认值读取运行参数。第一屏仍然直接启动游戏画面；参数缺失或非法时初始化显式失败，不进入 mock、replay 或本地默认 scene。

| 参数               | 必需 | 说明                                            |
| ------------------ | ---- | ----------------------------------------------- |
| `skin`             | 是   | 皮肤 id，只接受 `1`、`2` 或 `3`                 |
| `serverUrl`        | 是   | live WebSocket 地址，只接受 `ws://` 或 `wss://` |
| `gamecode`         | 是   | live game code，非空；不从 skin 推导            |
| `token`            | 是   | 登录 token，非空                                |
| `businessid`       | 是   | business id，非空                               |
| `clienttype`       | 是   | client type，非空                               |
| `jurisdiction`     | 是   | jurisdiction，非空                              |
| `language`         | 是   | language，非空                                  |
| `bet`              | 是   | 正数，按服务端整数单位发送                      |
| `lines`            | 是   | 正数                                            |
| `times`            | 是   | 正数                                            |
| `autonums`         | 是   | 整数，允许 `-1`                                 |
| `requestTimeoutMs` | 是   | 正数，传给 live request timeout                 |

示例：

```text
http://127.0.0.1:5207/?skin=2&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
http://127.0.0.1:5207/?skin=1&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
http://127.0.0.1:5207/?skin=3&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

参数值必须先用 `encodeURIComponent()` 编码再拼到 URL，尤其是 `serverUrl` 中的 `:`、`/`，以及 token 中可能出现的 `+`、`&`、`=`。如果页面通过 HTTPS 发布，`serverUrl` 必须使用 `wss://`，避免浏览器混合内容拦截。

URL query 会进入浏览器地址栏、历史记录、Caddy/CDN access log、监控日志和可能的 Referer。发布环境应使用短期 token 或一次性启动 token，并按安全策略处理日志。

## 静态发布

生产构建产物位于：

```text
apps/game002/dist/
```

构建和检查：

```bash
pnpm --filter game002 build
pnpm --filter game002 release:check
```

本地静态预览：

```bash
pnpm --filter game002 exec vite preview --host 127.0.0.1 --port 5207 --strictPort
```

发布方只需要复制：

```text
apps/game002/dist/index.html
apps/game002/dist/assets/*
```

到 Caddy/CDN 静态目录，不需要复制源码、`node_modules`、coverage、`.turbo` 或测试文件，也不需要向 HTML 注入运行配置。

`release:check` 会确认 dist 同时包含 `skin=1`、`skin=2` 和 `skin=3` 的背景、普通 symbol、`spinBlur` 和 `disabled` 资源。因为多套 symbol 有同名文件，检查会按构建产物图片尺寸和必需文件名确认资源被打包；`skin=1` 还会检查透明 `BN` 资源。

Caddy 示例：

```caddyfile
game002.example.com {
  root * /srv/game002
  file_server
}
```

子目录部署示例：

```text
/srv/www/game002/index.html
/srv/www/game002/assets/*
https://cdn.example.com/game002/?serverUrl=...
```

由于 Vite `base: "./"` 会让资源从当前目录下的 `./assets/` 加载，子目录访问地址必须带尾斜杠，例如 `https://cdn.example.com/game002/?serverUrl=...`。不要使用 `https://cdn.example.com/game002?serverUrl=...`；如需兼容无尾斜杠入口，Caddy/CDN 必须配置保留原 query 参数的重定向。

## Spin 时序

```text
点击 framework HUD Spin
  -> gameframeworks live spin
  -> gameframeworks 创建 GameLogic
  -> game002 adapter.playSpin(logic) 播放 54 个 grid cell reels
  -> 最后一个格子 landed、目标 symbol 保持 normal、暗度淡出归零
  -> 校验最终可见 scene 等于目标 scene
  -> adapter.playSpin resolve
  -> gameframeworks optional collect
  -> HUD 回 idle
```

`adapter.playSpin(logic)` 的 Promise resolve 是 framework 执行 optional `collect()` 的边界。adapter reject 时，framework 进入 error，且本局不会结算最终 `collect()`。

默认 grid-cell 表现参数：

- order：`top-down-left-right`
- start/stop step：`16ms / 16ms`
- settle after last start：`180ms`
- minimum spin cycles：`6`
- speed：`54` symbols/s
- per-cell reel offset：`rowOffsetStep=16`
- dimming：偶数 order index `alpha=0.50`，奇数 order index `alpha=0.35`
- dim fade：`80ms` 淡入，`160ms` 淡出

旋转中非空 symbol 请求 `spinBlur` 状态；格子落点后直接复位到目标 symbol 的 `normal` 状态，不播放 `appear`，只等待随轮滚动的暗度 strip 淡出后允许本局 spin resolve。

adapter 会对单个 Pixi ticker 帧的 `deltaMS` 做上限保护，resize、切回页面或调试暂停后的超大帧不会一次性跳过 54 个 grid-cell reels 的滚动表现。

## 金额显示

服务端金额单位按整数传输，`100` 对应 `1` 美元。`game002` 保持 spin request、balance、win、bet 的原始整数协议值不变，只在 HUD 展示时格式化为 USD。因此 URL query 中 `bet=5` 会发送 `5`，HUD 显示为 `$0.05`。

## 命令

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
pnpm --filter game002 lint
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
pnpm --filter game002 release:check
```

如果依赖安装失败，可先设置代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 常见失败

- 缺少必需 URL query 参数、参数为空或同一参数重复出现。
- 缺少 `skin`、`skin` 重复、`skin` 为空，或 `skin` 不是 `1` / `2` / `3`。
- `serverUrl` 使用非 WebSocket 协议，或 HTTPS 页面使用 `ws://`。
- `bet`、`lines`、`times`、`requestTimeoutMs` 非正数，或 `autonums` 不是整数。
- token 等参数没有正确 URL encode，导致 `+`、`&`、`=` 被错误解析。
- 子目录静态发布入口缺少尾斜杠，导致 `./assets/*` 解析到错误路径。
- `skin=1` 的 `assets/game002-s1/bg.jpg`、`skin=2` 的 `bgfull.jpg` 或 `skin=3` 的 `bg.jpg` 尺寸不是 `2000 x 2000`。
- viewport policy 输出超过 `2000 x 2000`，或 focus 区域加 margin 无法放入当前 canvas 逻辑尺寸。
- 当前 skin 的 manifest 缺少普通图、`spinBlur`、`disabled` 或出现未知 state。
- 主 scene 不是完整 `6 x 9`。
- 主 scene 出现本地 paytable / symbol registry 不认识的 symbol code。
- 主 scene 出现当前 skin 缺少贴图且不是显式 empty symbol 的 code。
- grid cell order、timing 或 dimming 参数非法。
- spin 完成后可见 scene 不等于目标 scene。
- 断线、鉴权失败、服务端错误消息、logger warn/error 或最终 `collect()` 失败。

以上失败都应进入 error，不切换到 mock、replay 或本地默认 scene。
