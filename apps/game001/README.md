# game001 demo

`game001` 是一个基于 Pixi、`@slotclientengine/logiccore`、`@slotclientengine/rendercore` 和 `@slotclientengine/netcore` 的 live slot demo。第一屏就是游戏画面，不包含 landing page。

## 数据来源

- `assets/game001/bk.jpg`
- `assets/game001/logo.png`
- `assets/game001/reels1bk.png`
- `assets/game001/reels2bk.png`
- `assets/gamecfg/game2.json`
- `assets/symbols/*.png`
- `assets/symbols/symbol-composites.json`
- `assets/symbols/symbol-state-textures.manifest.json`

`symbol-composites.json` 是复合图标配置契约。运行时会校验 `SC`、`RS`、`X2`、`X5`、`X10` 在该文件中的 layers 与 `symbol-state-textures.manifest.json` 的 layered normal 完全一致。`SC` 的普通态 layer `1` 使用 `SC-1-0.png`，并声明 `SC-1-0.png` 到 `SC-1-4.png` 五帧 keyframes；`SC.spinBlur.png` 基于 `SC-1-0.png` 这一静态普通态合成。

## 布局

Pixi stage 固定为 `941 x 1672`，页面层只创建：

- `.game001-page`
- `.game001-frame`

Pixi canvas 的 backing size 和背景图像素尺寸一致，固定为 `941 x 1672`。canvas 放在 `.game001-frame` 内并 `width: 100%; height: 100%` 占满该 div；`.game001-frame` 自身保持 `941px x 1672px`，由外层 `.game001-page` 水平居中、垂直从顶部开始显示，并通过 CSS transform 按页面尺寸自动缩放。宽度允许时优先占满屏幕高度，宽度过窄时按宽度缩小以保证完整可见。游戏元素都在 Pixi stage 内按背景图坐标系定位。

静态坐标：

- 背景：`x=0`, `y=0`, `941 x 1672`
- logo：`x=30`, `y=0`, `881 x 391`
- 主转轮背景：`x=-42`, `y=401`, `1025 x 415`
- 副转轮背景：`x=95`, `y=826`, `751 x 641`
- Spin 按钮：`x=470.5`, `y=1550`

主 scene 始终按完整 `5 x 5` 解析、反查停轴和验收。视觉上只通过 viewport mask 显示中间一行，以及上方相邻一行的下半部分和下方相邻一行的上半部分。裁剪规则为 `cropY = 1.5 * cellHeight`，`cropHeight = 2 * cellHeight`。

主转轮宽度适配规则：

1. 根据 rendercore registry 得到 cell 尺寸。
2. 计算 `rawReelsContentWidth = reelCount * cellWidth + (reelCount - 1) * columnGap`。
3. 计算 `mainReelsFitScale = reels1bk.width / rawReelsContentWidth`。
4. `SC`、`RS`、`X2`、`X5`、`X10` 保留自身 `1.5` 缩放，再由主转轮父容器追加 `mainReelsFitScale`。

副转轮区当前只显示 `reels2bk.png` 背景。本任务没有猜测或伪造副 scene 数据。

## Live 配置

运行态只支持 live WebSocket，不支持 `http(s)` replay URL，也不会用本地 fixture 兜底。

| 变量                              | 必需 | 默认值                                       | 说明                       |
| --------------------------------- | ---- | -------------------------------------------- | -------------------------- |
| `VITE_GAME001_SERVER_URL`         | 否   | `wss://gameserv.rgstest.slammerstudios.com/` | 只接受 `ws://` 或 `wss://` |
| `VITE_GAME001_TOKEN`              | 否   | `3a820433c341f7932d6654c4f16147a2`           | 登录 token                 |
| `VITE_GAME001_GAMECODE`           | 否   | `CqbQ0Y7gtBpO5419j8h02`                      | 游戏 code                  |
| `VITE_GAME001_BUSINESSID`         | 否   | `guest`                                      | business id                |
| `VITE_GAME001_CLIENTTYPE`         | 否   | `web`                                        | client type                |
| `VITE_GAME001_JURISDICTION`       | 否   | `MT`                                         | jurisdiction               |
| `VITE_GAME001_LANGUAGE`           | 否   | `en`                                         | language                   |
| `VITE_GAME001_BET`                | 否   | `10`                                         | 正数                       |
| `VITE_GAME001_LINES`              | 否   | `10`                                         | 正数                       |
| `VITE_GAME001_TIMES`              | 否   | `1`                                          | 正数                       |
| `VITE_GAME001_REQUEST_TIMEOUT_MS` | 否   | `30000`                                      | 正数                       |

这些默认值与 `apps/gameclientcli` 的 live smoke 默认配置保持一致。缺省 env 会使用默认值；显式提供空字符串、非法 URL 或非正数仍会明确失败。

启动后会先执行 `connect()` 和 `enterGame()`。如果 live `defaultScene` 存在，会严格校验为 `5 x 5` 并作为初始画面；如果不存在，主转轮 viewport 保持隐藏，第一次 live spin 返回 scene 后再显示和播放，不读取本地 GMI fixture。

Spin 点击后只发送一次 live `spin({ bet, lines, times })` 请求。收到结果并通过 GMI、`results`、scene、停轴反查校验后，会按当前 spin 返回的 `totalwin/results` 判断是否需要最终 `collect()`；需要时先发送一次最终 collect，再启动 reel 动画。重复点击、配置非法、资源缺失、未知状态贴图、netcore warning/error、collect 失败、意外断线、GMI 异常、scene 非 `5 x 5` 或最终 scene 不一致都会明确失败。

`game001` 创建 `SlotcraftClient` 时保留 `autoCollectIntermediateResults: true`，与 `apps/gameclientcli` 的多次 spin 流程一致：多段结果的中间段由 netcore 自动 collect，最终结果由 game001 在本次 spin 后显式 collect。最终 collect 规则为 `(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1)`。

## 命令

```bash
pnpm --filter game001 dev -- --host 0.0.0.0
pnpm --filter game001 lint
pnpm --filter game001 test
pnpm --filter game001 typecheck
pnpm --filter game001 build
```

## Symbol 动画

`SC`、`RS`、`X2`、`X5`、`X10` 的 profile 位于 `src/symbol-animation-config.ts`。`SC.win` 绑定 `layerTextureSequence`，手动请求可见 `SC` 的 `win` 状态时，layer `1` 会播放 `SC-1-0.png` 到 `SC-1-4.png`。`RS.appear` 与 `RS.win` 会让 layer `1` 在放大时向左旋转约 `20` 度，并在缩小时还原；本 demo 不在没有中奖线坐标契约的情况下推断哪些 SC 应自动进入 `win`。

如果依赖安装失败，可先设置代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 常见失败

- 显式提供空 env、非法 URL 或非正数：页面进入 `ERROR` 状态，Spin 禁用。
- `VITE_GAME001_SERVER_URL` 使用 `http(s)`：明确失败，不进入 replay。
- `symbol-composites.json` 与 manifest layered normal 或 SC keyframes 不一致：资源加载失败。
- server 返回的 GMI 无法被 `createGameLogicFromGmi()` 解析：不启动动画。
- 主 scene 不是 `5 x 5`：不启动动画。
- `gameConfig.getStopYCoordinates()` 无法反查停轴：不启动动画。
- 动画完成后完整 visible scene 与目标 scene 不一致：进入错误状态。
