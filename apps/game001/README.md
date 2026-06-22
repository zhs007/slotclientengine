# game001 demo

`game001` 是基于 Pixi、`@slotclientengine/gameframeworks` 和 `@slotclientengine/rendercore` 的 live slot demo。第一屏就是游戏画面，不包含 landing page。

## 运行结构

生产入口由 `createSlotGameFramework()` 创建通用 slot shell、HUD、live 连接、enter game、spin、`GameLogic` 转换、余额/下注/win 状态和最终 `collect()`。`game001` 提供 `SlotGameAdapter`，只负责把 Pixi canvas 挂到 `context.gameLayer`、加载 game001 资源、应用 live `defaultScene`、读取 `GameLogic` 主 scene，并驱动主转轮展示。

`game001` 不直接创建 live client，不直接调用 `collect()`，也不直接依赖底层 live、UI 或 logic 包。需要读取 game config / stop y 时，从 `@slotclientengine/gameframeworks` facade 导入 `createGameConfig`、`LogicGameConfig`、`LogicReels` 等 helper。

## 数据来源

- `assets/game001/bk.jpg`
- `assets/game001/logo.png`
- `assets/game001/reels1bk.png`
- `assets/game001/reels2bk.png`
- `assets/gamecfg/game2.json`
- `assets/symbols/*.png`
- `assets/symbols/symbol-composites.json`
- `assets/symbols/symbol-state-textures.manifest.json`

`symbol-composites.json` 是复合图标配置契约。运行时会校验 `SC`、`RS`、`X2`、`X5`、`X10` 的 layered normal 与 state texture manifest 完全一致。`SC` 的普通态 layer `1` 声明 `SC-1-0.png` 到 `SC-1-4.png` 五帧 keyframes。

## 布局

Framework 创建：

```text
.slot-ui-page
  .slot-ui-frame
    .slot-ui-game-layer
    .slot-ui-overlay
```

Pixi canvas 位于 `.slot-ui-game-layer` 内，backing size 固定为 `941 x 1672`，与 `bk.jpg` 一致。`game001` 只补充 canvas 样式，不复制 HUD 布局。背景、logo、主转轮背景、副转轮背景都按 `941 x 1672` 坐标系定位。

静态坐标：

- 背景：`x=0`, `y=0`, `941 x 1672`
- logo：`x=30`, `y=0`, `881 x 391`
- 主转轮背景：`x=-42`, `y=401`, `1025 x 415`
- 副转轮背景：`x=95`, `y=826`, `751 x 641`

主转轮对齐使用 game001 专用内框校准：

- `backgroundLocalFrame`: `x=25`, `y=96`, `width=975`, `height=281`
- `columnCentersX`: `[125, 319, 514, 708, 902]`

第 4 轴按从左到右第 4 列解释，也就是 0-based `x=3`；中心行是 `y=2`。主转轮 view 只为普通轴 `x=0,1,2,4` 创建 `RenderReel`，第 4 轴只显示 `scene[3][2]` 对应的一个中心 symbol。第 4 轴不参与 spin，不上下 bounce，不请求 `spinBlur`；本局展示完成时硬切到目标 scene 的 `scene[3][2]`，并保持在第 4 列中心。

如果 live `defaultScene` 存在，初始化显示该 scene；如果不存在，第一次 live spin 结算前主转轮保持 hidden，不用本地数据顶替。

## Live 配置

运行态只支持 live WebSocket，`VITE_GAME001_SERVER_URL` 只接受 `ws://` 或 `wss://`。

| 变量                              | 必需 | 默认值                                       | 说明                       |
| --------------------------------- | ---- | -------------------------------------------- | -------------------------- |
| `VITE_GAME001_SERVER_URL`         | 否   | `wss://gameserv.rgstest.slammerstudios.com/` | live WebSocket 地址        |
| `VITE_GAME001_TOKEN`              | 否   | `3a820433c341f7932d6654c4f16147a2`           | 登录 token                 |
| `VITE_GAME001_GAMECODE`           | 否   | `CqbQ0Y7gtBpO5419j8h02`                      | 游戏 code                  |
| `VITE_GAME001_BUSINESSID`         | 否   | `guest`                                      | business id                |
| `VITE_GAME001_CLIENTTYPE`         | 否   | `web`                                        | client type                |
| `VITE_GAME001_JURISDICTION`       | 否   | `MT`                                         | jurisdiction               |
| `VITE_GAME001_LANGUAGE`           | 否   | `en`                                         | language                   |
| `VITE_GAME001_BET`                | 否   | `10`                                         | 正数                       |
| `VITE_GAME001_LINES`              | 否   | `10`                                         | 正数                       |
| `VITE_GAME001_TIMES`              | 否   | `1`                                          | 正数                       |
| `VITE_GAME001_AUTONUMS`           | 否   | `-1`                                         | 整数，随 spin request 发送 |
| `VITE_GAME001_REQUEST_TIMEOUT_MS` | 否   | `30000`                                      | 正数                       |

缺省 env 会使用默认值；显式提供空字符串、非法 URL、非正数 bet/lines/times/request timeout 或非法 `autonums` 会明确失败。

## Spin 时序

```text
点击 framework HUD Spin
  -> gameframeworks live spin
  -> gameframeworks 创建 GameLogic
  -> game001 adapter.playSpin(logic) 播放 reel
  -> reel 展示完成
  -> adapter.playSpin resolve
  -> gameframeworks optional collect
  -> HUD 回 idle
```

`adapter.playSpin(logic)` 的 Promise resolve 是 framework 执行 optional `collect()` 的边界。adapter reject 时，framework 进入 error，且本局不会结算最终 `collect()`。最终 collect 规则由 `gameframeworks` 维护：

```ts
(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1);
```

## 金额显示

服务端金额单位按整数传输，`100` 对应 `1` 美元。`game001` 保持 spin request、balance、win、bet 的原始整数协议值不变，只在 HUD 展示时格式化为 USD。因此默认 `VITE_GAME001_BET=10` 会发送 `10`，HUD 显示为 `$0.10`。

## 命令

```bash
pnpm --filter game001 dev -- --host 127.0.0.1 --port 5205
pnpm --filter game001 lint
pnpm --filter game001 test
pnpm --filter game001 typecheck
pnpm --filter game001 build
```

## Symbol 动画

`SC`、`RS`、`X2`、`X5`、`X10` 的 profile 位于 `src/symbol-animation-config.ts`，基础缩放为 `1.75` 倍。`SC.win` 绑定 `layerTextureSequence`，手动请求可见 `SC` 的 `win` 状态时，layer `1` 会播放 `SC-1-0.png` 到 `SC-1-4.png`。`RS.appear` 与 `RS.win` 会让 layer `1` 在放大时向左旋转约 `20` 度，并在缩小时还原；`appear` 只用于普通轴停轴落地，下一次 spin 启动前会清除未完成的 `appear` 状态。

如果依赖安装失败，可先设置代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 常见失败

- 显式提供空 env、非法 URL 或非正数：framework 进入 error。
- `VITE_GAME001_SERVER_URL` 使用非 WebSocket 协议：明确失败。
- symbol composite 与 state texture manifest 不一致：资源加载失败。
- 服务器返回的 GMI 无法转换为 `GameLogic`：不启动 reel 展示。
- 主 scene 不是完整 `5 x 5`：不启动 reel 展示。
- 服务器返回的可见列在本地脱敏轮带中没有停轴候选：使用本次 spin 的临时轮带注入目标列后停轴，不切换到本地替代数据。
- 展示完成后普通轴 visible scene 与目标 scene 对应列不一致：进入 error。
- 展示完成后第 4 轴显示 code 不等于目标 `scene[3][2]`，或锁定轴不是恰好一个可见 symbol：进入 error。
- 断线、鉴权失败、服务端错误消息、logger warn/error 或最终 `collect()` 失败：进入 error，不切换到本地替代数据。
