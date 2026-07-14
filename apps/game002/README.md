# game002

`game002` 是基于 Pixi、`@slotclientengine/gameframeworks`、`@slotclientengine/gameloading` 和 `@slotclientengine/rendercore` 的 live slot app。当前项目已收口为单资源集：URL `skin=1` 固定映射 `assets/game002-s3`；`skin=2|3|4|5`、缺失 `skin` 和旧 `serverUrl` query 都会显式失败。

## 启动与 live 边界

首屏由 `packages/gameloading` 承载。资源加载到 99% 时才校验 query 并调用 `prepareSlotGameLiveSession()`；资源到 100% 后才创建 framework、Pixi canvas 并用同一个 prepared session 连接。因此 loading 前不会挂载游戏，也不会创建第二条 WebSocket。

live server 固定为 `wss://gameserv.rgstest.slammerstudios.com/`。`gamecode` 和下列运行参数来自 URL，不从环境变量、cookie 或 localStorage 推导；其中 `lines` 是 game002 固定游戏合同，URL 只能显式提供 `30`，其它值会在 loading 99% 阶段失败，不能进入 spin：

| 参数                                                                        | 合同                  |
| --------------------------------------------------------------------------- | --------------------- |
| `skin`                                                                      | 必须且只能为 `1`      |
| `gamecode`、`token`、`businessid`、`clienttype`、`jurisdiction`、`language` | 必填非空字符串        |
| `bet`、`times`、`requestTimeoutMs`                                          | 必填正数              |
| `lines`                                                                     | 必填且必须精确为 `30` |
| `autonums`                                                                  | 必填整数，允许 `-1`   |

示例：

```text
http://127.0.0.1:5207/?skin=1&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

参数值必须 URL encode。URL query 可能进入地址栏、历史记录、access log 和 Referer，发布环境应使用短期或一次性 token。

## 资源合同

- 背景唯一配置源：`assets/game002-s3/background.manifest.json`。资源闭包为 `BG.json`、`BG.atlas` 和 `BG.png,BG_2.png..BG_8.png`；完整 art 仍为 `2000 x 2000`，Spine 原点通过 manifest 的 `{x:1000,y:1000,scale:1}` 映射到 art 中心，并裁切在完整 art 内。
- 游戏配置：`assets/gamecfg002/gameconfig.json`，继续使用本地公开 `reels-001`。
- 可展示 symbol 顺序固定为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`。
- 13 个 symbol 都必须由 manifest 声明 normal、`spinBlur`、`disabled` 和 `scale: 1`；`emptySymbols=[]`，`BN` 是真实贴图，不是透明兜底。
- `CN_1..CN_4`、`Nearwin1..Nearwin3`、`WM_Fx`、背景和 atlas texture 不属于主 symbol 集，不能被宽泛 glob 接入。
- scale、render priority 和 animation 都从 `assets/game002-s3/symbol-state-textures.manifest.json` 派生；app 不维护第二份表。

Spine 统一由 rendercore 的官方 Pixi runtime 解析，只接受 4.3.x skeleton。当前 12 个主 symbol skeleton 是 4.3.23：`WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN`；`CN` 没有同名 skeleton，因此保持静态贴图。背景 skeleton 也是 4.3.23，并与 symbol 共用 rendercore 的版本、atlas、skeleton 和手动 update 底层，不在 app 内复制 adapter。manifest 中 animation name 区分大小写并必须真实存在。

背景状态合同为 `BaseGame=BG loop`、`FreeGame=FG loop`、`BaseGame -> FreeGame=BG_FG once`、`FreeGame -> BaseGame=FG_BG once`。当前 app 只初始化并持续播放 `BaseGame`；FreeGame 的服务端触发语义尚未定义，因此 app 不猜测 GMI 字段，也不提供 query/debug fallback。以后业务合同明确后，只调用 rendercore background player 的 `requestState()`。

`assets/game003-s1` 仍是已知的 Spine 4.2 非发布资源。本项目不为它提供 4.2 fallback，也不把它打包进 game002。

## 布局与 spin

art world 固定为 `2000 x 2000`，portrait reference 为 `1125 x 2000`。主棋盘是 `x=637.5,y=330,width=720,height=1080`、`6 x 9`、cell `120 x 120`；唯一重点区域在棋盘四边各扩 `60`，即 `focusRegion=x=577.5,y=270,width=840,height=1200`。

单背景使用 rendercore 的 `maximized-focus` 适配：先把重点区域完整且最大化地放进页面，再按页面宽高比反推应展示的背景范围。focus 以外只要仍在 `2000 x 2000` 背景内就继续显示，不按横竖屏分类主动裁掉；只有反推范围超过完整背景时才封顶，并允许出现不可避免的黑边。art size、focus 和 policy 直接从 background manifest 派生；uiframeworks 只消费 rendercore resolver 的结果，不复制算法。Spine animation 或状态切换不会改变 art/focus/viewport。game003 的双背景仍独立使用 YAML landscape/portrait variant 和 `orientation-focus`。

framework 负责 live、HUD、spin/collect；adapter 负责 Pixi 画面和 grid-cell reel。spin 使用本地公开轮带滚动，服务器最终 `6 x 9` scene 只叠加到本轮临时可见窗口。客户端不读取、缓存或泄露服务器真实轮带；目标 scene 无法从公开轮带反查 stop y 也不能失败。

默认 54 格按从上到下、从左到右启停，使用 `16ms/16ms` step、`6` 个最小循环、`54 symbols/s` 和每行 `16` 的 local reel offset。完成时必须校验可见 scene 与服务端目标一致，之后 `playSpin()` 才能进入金额阶段并最终允许 framework collect。

## 中奖金额

`assets/game002-s3/win-amount` 当前是从 game003 复制的临时 big/super/mega 美术资源。`win-amount.manifest.json` 是 tier project、asset glob、阈值和 segmented 时间的唯一资源来源；app 只配置金额 formatter 和布局，不复制 rendercore 状态机。

服务端整数 `100` 显示为 `$1.00`，但 spin/live 协议仍传原始整数。正中奖在主转轮完成后启动金额动画；`playSpin()` 等到金额进入 `awaiting-dismiss` 即可 resolve，不要求用户点击关闭。点击只调用 `requestAdvance()`：用于跳金额、进下一档或从最终等待态播放 dismiss。下一次 spin 会先清理遗留金额。

## 开发与发布

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
pnpm --filter game002 format
pnpm --filter game002 lint
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
pnpm --filter game002 release:check
```

生产产物在 `apps/game002/dist/`。`release:check` 会检查相对 URL、敏感默认值、background manifest/4.3 skeleton/8-page atlas 的 source 与 dist 字节闭包、13 组状态贴图、12 个 symbol Spine JSON、symbol atlas/texture、win-amount manifest/projects/assets，以及 bundle 不引用 `bg.jpg` 或旧 skin 目录。`BG.png` 与 `BG_2.png` 当前源字节相同，Vite 可只输出一份 hashed bytes；两页运行时 URL 仍通过稳定 `spineAtlasPage` query 保持一一对应，parser 禁止两个 page 直接共用同一 URL。所有背景资源都在 loading 99% 前闭合，100% 后才创建 background player/framework/Pixi。子目录部署必须保留尾斜杠，例如 `https://cdn.example.com/game002/?skin=1&...`。

常见显式失败包括：query 缺失/重复/非法、旧 skin 或 `serverUrl`、资源或 loading closure 缺项、manifest unknown field/路径/尺寸/focus/state/transition 非法、Spine 非 4.3、atlas page/texture/animation 不匹配、并发背景切换、scene 不是 `6 x 9`、未知 symbol、金额输入非法、最终可见 scene 不一致、live/collect 失败。不得切换到静态背景、首帧、mock、旧 skin、placeholder、BN 兜底或 Spine 4.2/3.8 fallback。
