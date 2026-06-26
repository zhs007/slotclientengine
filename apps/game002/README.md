# game002 demo

`game002` 是基于 Pixi、`@slotclientengine/gameframeworks` 和 `@slotclientengine/rendercore` 的第二套 live slot app。第一屏就是游戏画面，不包含 landing page。

## 运行结构

生产入口由 `createSlotGameFramework()` 创建通用 slot shell、HUD、live 连接、enter game、spin、`GameLogic` 转换、余额/下注/win 状态和最终 `collect()`。`game002` 提供 `SlotGameAdapter`，只负责把 Pixi canvas 挂到 `context.gameLayer`、加载 game002 资源、应用 live `defaultScene`、读取 `GameLogic` 主 scene，并配置 `@slotclientengine/rendercore` 的 `54` 个 grid cell reels 展示。

`game002` 不直接创建 live client，不直接调用 `collect()`，也不直接依赖底层 live、UI 或 logic 包。需要读取 game config、reels 或 stop y 时，从 `@slotclientengine/gameframeworks` facade 导入 `createGameConfig`、`LogicGameConfig`、`SceneMatrix` 等 API / type。

## 数据来源

- `assets/game002/bgfull.jpg`
- `assets/game002/bg.jpg`：旧 `1125 x 2000` portrait 参考图，不再作为运行时背景。
- `assets/gamecfg002/gameconfig.json`
- `assets/symbols002/*.png`
- `assets/symbols002/symbol-state-textures.manifest.json`

`BN` 是 empty symbol，不要求图片。`WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`WM`、`CN`、`CM`、`CO`、`AF` 必须加载普通图、`spinBlur` 和 `disabled` 状态图。

## 布局

Framework 创建：

```text
.slot-ui-page
  .slot-ui-frame
    .slot-ui-game-layer
    .slot-ui-overlay
```

Pixi canvas 位于 `.slot-ui-game-layer` 内，backing size 由 `gameframeworks` 透传的 viewport snapshot 决定。`game002` 使用 `framePolicy` 提交最大不超过 `2000 x 2000` 的逻辑尺寸，并在 Pixi stage 内使用完整 `2000 x 2000` art world；resize 时只调用 renderer resize 并移动 world container，不重建 live/framework。`game002` 只补充 canvas 样式，不复制 HUD 布局。

art 坐标和旧坐标映射：

- art/background：`2000 x 2000`，运行时背景为 `bgfull.jpg`
- 旧 reference crop：`1125 x 2000`，在 art 中为 `x=437.5`, `y=0`
- 旧 board frame：`x=200`, `y=330`, `width=720`, `height=1080`
- art board frame：`x=637.5`, `y=330`, `width=720`, `height=1080`
- cell：`120 x 120`
- scene：`6 x 9`
- reels：`reels-001`
- symbol：`500 x 500` 原图按 `40%` 缩放显示，并以 cell 中心定位

不同 viewport 的期望：

- `1125 x 2000` portrait：visible art rect 为 `x=437.5,y=0,width=1125,height=2000`，board 回到屏幕内 `x=200,y=330`。
- `1200 x 1200` square：visible art rect 为 `x=397.5,y=270,width=1200,height=1200`，board 在 viewport 内为 `x=240,y=60`，不会显示完整 `2000 x 2000` 背景。
- `3000 x 1200` ultra-wide：DOM frame/canvas 逻辑尺寸为 `2000 x 1200` 并水平居中，页面左右多余空间保持黑色。

每个棋盘格在滚动期间都有 `120 x 120` 的裁切窗口，格子内是独立 `visibleRows=1` 的垂直微型 reel。深浅交替的暗度 strip 挂在每个转动微型 reel 内部，随 reel 滚动经过裁切窗口，所以每个格子在旋转中会快速明暗变化。单个格子落地后会立即移除外层裁切，最终静态 symbol 不继续依赖 mask；落地暗度折叠在当前格内淡出，不串到邻格。格子启动和停止顺序固定为从上到下、从左到右：`x=0,y=0..8`，然后 `x=1,y=0..8`，直到 `x=5,y=8`。

如果 live `defaultScene` 存在，初始化显示该 scene；如果不存在，idle 初始化阶段 reels 层保持 hidden，不用本地数据顶替；第一次真实 live spin 结果返回后，grid-cell reels 会立即显示并播放到该真实目标 scene。

live spin 的滚动过程使用本地 `reels-001` 公开轮带。服务器真实轮带不会下发到前端；服务器返回的最终 `6 x 9` scene 只作为本轮落点窗口叠加到临时渲染轮带里。因此目标 scene 即使无法在本地 `reels-001` 中反查出连续 stop y，也会继续用本地轮带滚动并在落点窗口显示服务器结果；未知 symbol code 或缺失贴图仍然显式失败。

## Live 配置

运行态只支持 live WebSocket，`VITE_GAME002_SERVER_URL` 只接受 `ws://` 或 `wss://`。

| 变量                              | 必需 | 默认值                                       | 说明                       |
| --------------------------------- | ---- | -------------------------------------------- | -------------------------- |
| `VITE_GAME002_SERVER_URL`         | 否   | `wss://gameserv.rgstest.slammerstudios.com/` | live WebSocket 地址        |
| `VITE_GAME002_TOKEN`              | 否   | `7a82f5ca45b5aa3246b2ad0123272295`           | 登录 token                 |
| `VITE_GAME002_GAMECODE`           | 否   | `065P8NOEgwdSXFTB6uDqX`                      | 游戏 code                  |
| `VITE_GAME002_BUSINESSID`         | 否   | `guest`                                      | business id                |
| `VITE_GAME002_CLIENTTYPE`         | 否   | `web`                                        | client type                |
| `VITE_GAME002_JURISDICTION`       | 否   | `MT`                                         | jurisdiction               |
| `VITE_GAME002_LANGUAGE`           | 否   | `en`                                         | language                   |
| `VITE_GAME002_BET`                | 否   | `5`                                          | 正数                       |
| `VITE_GAME002_LINES`              | 否   | `30`                                         | 正数                       |
| `VITE_GAME002_TIMES`              | 否   | `1`                                          | 正数                       |
| `VITE_GAME002_AUTONUMS`           | 否   | `-1`                                         | 整数，随 spin request 发送 |
| `VITE_GAME002_REQUEST_TIMEOUT_MS` | 否   | `30000`                                      | 正数                       |

缺省 env 会使用默认值；显式提供空字符串、非法 URL、非正数 bet/lines/times/request timeout 或非法 `autonums` 会明确失败。

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
- dimming：偶数 order index `alpha=0.50`，奇数 order index `alpha=0.35`
- dim fade：`80ms` 淡入，`160ms` 淡出

旋转中非空 symbol 请求 `spinBlur` 状态；格子落点后直接复位到目标 symbol 的 `normal` 状态，不播放 `appear`，只等待随轮滚动的暗度 strip 淡出后允许本局 spin resolve。

adapter 会对单个 Pixi ticker 帧的 `deltaMS` 做上限保护，resize、切回页面或调试暂停后的超大帧不会一次性跳过 54 个 grid-cell reels 的滚动表现。

## 金额显示

服务端金额单位按整数传输，`100` 对应 `1` 美元。`game002` 保持 spin request、balance、win、bet 的原始整数协议值不变，只在 HUD 展示时格式化为 USD。因此默认 `VITE_GAME002_BET=5` 会发送 `5`，HUD 显示为 `$0.05`。

## 命令

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
pnpm --filter game002 lint
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
```

如果依赖安装失败，可先设置代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 常见失败

- `VITE_GAME002_SERVER_URL` 使用非 WebSocket 协议。
- 显式提供空 env、非法 URL 或非正数。
- `bgfull.jpg` 尺寸不是 `2000 x 2000`。
- viewport policy 输出超过 `2000 x 2000`，或 focus 区域加 margin 无法放入当前 canvas 逻辑尺寸。
- `symbols002` manifest 缺少普通图、`spinBlur`、`disabled` 或出现未知 state。
- 主 scene 不是完整 `6 x 9`。
- 主 scene 出现本地 paytable / symbol registry 不认识的 symbol code。
- grid cell order、timing 或 dimming 参数非法。
- spin 完成后可见 scene 不等于目标 scene。
- 断线、鉴权失败、服务端错误消息、logger warn/error 或最终 `collect()` 失败。

以上失败都应进入 error，不切换到 mock、replay 或本地默认 scene。
