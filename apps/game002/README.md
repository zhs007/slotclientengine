# game002 demo

`game002` 是基于 Pixi、`@slotclientengine/gameframeworks` 和 `@slotclientengine/rendercore` 的第二套 live slot app。第一屏就是游戏画面，不包含 landing page。

## 运行结构

生产入口由 `createSlotGameFramework()` 创建通用 slot shell、HUD、live 连接、enter game、spin、`GameLogic` 转换、余额/下注/win 状态和最终 `collect()`。`game002` 提供 `SlotGameAdapter`，只负责把 Pixi canvas 挂到 `context.gameLayer`、加载 game002 资源、应用 live `defaultScene`、读取 `GameLogic` 主 scene，并驱动 `6 x 9` reels 展示。

`game002` 不直接创建 live client，不直接调用 `collect()`，也不直接依赖底层 live、UI 或 logic 包。需要读取 game config、reels 或 stop y 时，从 `@slotclientengine/gameframeworks` facade 导入 `createGameConfig`、`LogicGameConfig`、`SceneMatrix` 等 API / type。

## 数据来源

- `assets/game002/bg.jpg`
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

Pixi canvas 位于 `.slot-ui-game-layer` 内，backing size 固定为 `1125 x 2000`，与 `bg.jpg` 一致。`game002` 只补充 canvas 样式，不复制 HUD 布局。

固定布局：

- stage：`1125 x 2000`
- background：`x=0`, `y=0`, `1125 x 2000`
- board frame：`x=200`, `y=330`, `width=720`, `height=1080`
- cell：`120 x 120`
- scene：`6 x 9`
- reels：`reels-001`
- symbol：`500 x 500` 原图按 `40%` 缩放显示，并以 cell 中心定位

如果 live `defaultScene` 存在，初始化显示该 scene；如果不存在，第一次 live spin 结算前 reels 层保持 hidden，不用本地数据顶替。

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
  -> game002 adapter.playSpin(logic) 播放 6x9 reels
  -> reels 展示完成并校验目标 scene
  -> adapter.playSpin resolve
  -> gameframeworks optional collect
  -> HUD 回 idle
```

`adapter.playSpin(logic)` 的 Promise resolve 是 framework 执行 optional `collect()` 的边界。adapter reject 时，framework 进入 error，且本局不会结算最终 `collect()`。

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
- `bg.jpg` 尺寸不是 `1125 x 2000`。
- `symbols002` manifest 缺少普通图、`spinBlur`、`disabled` 或出现未知 state。
- 主 scene 不是完整 `6 x 9`。
- 目标 scene 在 `reels-001` 找不到 stop y。
- spin 完成后可见 scene 不等于目标 scene。
- 断线、鉴权失败、服务端错误消息、logger warn/error 或最终 `collect()` 失败。

以上失败都应进入 error，不切换到 mock、replay 或本地默认 scene。
