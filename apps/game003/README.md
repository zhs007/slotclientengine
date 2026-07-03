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
- 矿车互动资源：`assets/game003-s1/minecart.png`
- `bg-bar` 独立 symbol manifest：`assets/game003-s1/bg-bar-symbol-state-textures.manifest.json`
- `bg-bar` symbol 资源：`assets/game003-s1/wild.png`、`assets/game003-s1/up.png`；`normal` 是 manifest 声明的透明 symbol，不使用透明 PNG。
- `L1`-`L5` 中奖 VNI project：`assets/game003-s1/L1-wins.json` 到 `assets/game003-s1/L5-wins.json`
- `L1`-`L5` 中奖 VNI assets：`assets/game003-s1/assets/*.{png,jpg,jpeg,webp}`
- Spine skeleton：`assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json`
- Spine atlas / texture：`assets/game003-s1/Symbol.atlas`、`assets/game003-s1/Symbol.png`
- big/super/mega 金额动画 VNI project：`assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json`
- big/super/mega 金额动画 VNI assets：`assets/game003-s1/win-amount/assets/*.{png,jpg,jpeg,webp}`

生成 `gameconfig.json`：

```bash
CI=true pnpm --filter gengameconfig dev -- --paytable assets/gamecfg003/paytable.xlsx --reel assets/gamecfg003/bg-reel01.xlsx --out assets/gamecfg003/gameconfig.json
```

`H1.jpg` 到 `H5.jpg` 是原始输入，运行时 symbol 普通态必须使用一次性规范化后的 `H1.png` 到 `H5.png`。不要为了 JPG 输入扩展共享 symbol 生成器或运行时。

生成 symbol 状态贴图和 manifest：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
```

`symbol-state-textures.manifest.json` 只能包含 `WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC`，每个 symbol 必须显式 `scale: 1`。背景、主转轮框、传送带和 `Symbol.png` atlas texture 不是可展示 symbol。`normal` / `appear` / `win` 的动画类型、Spine `animationName` 和 `durationSeconds` 由这个 manifest 声明：`WL,H1,H2,H3,H4,H5` 的 `normal` 是 Spine `Idle`；`WL.appear` 是 Spine `start`，`H1.appear` 是 Spine `Start`；`H2` 到 `H5` 当前资源没有 Start 动画，`appear` 仍使用 manifest 里的 `builtin` animation 秒数；`L1.appear` 到 `L5.appear` 是静态普通态，`L1.win` 到 `L5.win` 是 VNI animation。Spine animation name 区分大小写，manifest 必须写 skeleton 中真实存在的名字。重新生成状态贴图时，生成器会保留仍然有效的 `animations` 元数据，不能手动丢掉。

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

`symbols.vniProjectGlob` 和 `symbols.vniAssetGlob` 只用于把 manifest 声明的 VNI symbol 动画资源纳入 Vite 静态模块。`symbols.spineSkeletonGlob`、`symbols.spineAtlasGlob` 和 `symbols.spineTextureGlob` 必须三者同时配置，用于把 manifest 声明的 Spine skeleton、atlas raw text 和 texture URL 纳入静态模块；修改 Spine 资源时必须同步 YAML、loading 资源、generated TS、symbolsviewer 和 runtime resolver。`loading.resources` 只承载随游戏包发布的静态资源 path/glob 和权重，不承载 token、cookie、serverUrl、服务器真实轮带或玩家本次下注。glob 必须是明确资源组，不能用 `assets/game003-s1/*.png` 这类宽泛写法把主转轮框、传送带和 symbol 混在一起。

`skins."1".winAmount` 配置中奖金额动画的显示规则、layout anchor、阈值和 VNI tier 资源。金额输入仍来自 live/GMI 的服务器整数；当前显示 formatter 与 framework HUD 共用 `formatServerUsdAmount(...)`，所以 `100` 显示为 `$1.00`。big/super/mega 的 project 和 assets 只属于 `assets/game003-s1/win-amount`，不要混入 symbol VNI manifest 或 `assets/game003-s1/assets`。

`skins."1".featureBars.bgBar` 配置 `bg-bar` 传送带展示。它只属于 `game003` app 层：组件名固定为 `bg-bar`，feature 只允许 `normal`、`wild`、`up`，队列长度固定 5，可见数量固定 4，终点格固定 `slot 4`。`symbols.manifest` 指向独立的 `bg-bar-symbol-state-textures.manifest.json`，`requiredStates` 为空，`normal` 通过 manifest 的 `{ kind: "transparent", width: 172, height: 158 }` 声明稳定空图标，`wild.png` 为 `172 x 158`，`up.png` 为 `172 x 130`。这些尺寸漂移时运行时会显式失败。

`skins."1".appExtensions.game003MinecartInteraction` 配置 `bg-bar` 终点后的矿车互动。`appExtensions` 是 shared 静态配置层的通用透传对象，`gameframeworks` 和 `buildgamestatic` 不理解 `minecart` 语义；所有矿车字段都在 `apps/game003` app 层严格解析。`loadingResourceId` 固定为 `game003-minecart`，必须能在 `game-loading.generated.ts` 中找到 `assets/game003-s1/minecart.png` 的 URL；`imageSize` 当前为 `369 x 252`，加载后的 Pixi texture 尺寸不一致会显式失败。

矿车 layout 坐标基准是当前 art 像素：`stopOffsetFromReelAreaBottomCenter` 相对主转轮可见区底部中心，`cartPivotInImage` 和 `payloadAnchorInImage` 相对 `minecart.png` 左上角。横屏和竖屏各自配置停点、`exitSide` 和图片内 anchor，运行时从当前 `visibleRect` 推导屏幕外起点和右侧出屏点，不写死 viewport 坐标。当前 `payloadAnchorInImage` 为 `{ x: 184.5, y: 126 }`，对应矿车图片内车厢中部。当前入场时间预算为 `bg-bar shift 0.28s + terminal win 0.20s + cart rush 0.26s + payload fly 0.43s + payload hold 0.12s = 1.29s`，必须小于主转轮基础落停时间；`cartExitDurationSeconds` 当前为 `0.18s`，只用于下一轮 spin 开始时的右侧出屏，不计入上一轮入场预算。不能通过延长 `baseDurationMs`、`speedSymbolsPerSecond`、`minimumSpinCycles`、`startDelayMs` 或 `stopDelayMs` 来掩盖节奏问题。

## Symbol Manifest 动画

`game003` 的 symbol 动画 resolver 来自 `@slotclientengine/rendercore`：

- app 层从生成配置读取 symbol manifest、VNI project modules、VNI asset modules、Spine skeleton modules、Spine atlas raw modules 和 Spine texture URL modules。
- `rendercore` 解析 manifest，并优先使用 manifest 声明的 `builtin` / `static` / `vni` / `spine` animation。
- 未声明 animation 的 symbol 状态才会走 fallback；fallback 不承载 game003 的 `appear` / `win` 秒数。
- app 的中奖逻辑仍只按可见窗口坐标请求 symbol 状态为 `win`，不在 `game-adapter.ts`、`game-demo.ts` 或 `win-sequence.ts` 中写 `L1-wins.json` 到 `L5-wins.json`、Spine JSON/atlas 路径、VNI/Spine 播放细节或动画秒数。

runtime 不读取 VNI `stageRect`，VNI 动画按 project 自己的 stage 在目标 symbol 位置播放；如果 manifest 里写入 `stageRect`，会作为未知字段显式失败。Spine 动画由 rendercore 的官方 Spine Pixi adapter 初始化，app 不直接 import `@esotericsoftware/spine-pixi-v8`、不解析 atlas/skeleton、不复制播放状态机。缺 animation `durationSeconds`、缺 VNI project、缺 VNI asset、缺 Spine skeleton/atlas/texture、Spine animation name 大小写不匹配、非法 manifest 字段或动画初始化失败都会显式失败，避免 symbol 动画悄悄退回普通表现后难以排查。

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

`mainreelbg`、`conveyor1`、`conveyor2` 的组合、视觉间隔、层级和校准属于 game003 app 专属实现，位于 `apps/game003/src/game-layout.ts` 和 `apps/game003/src/game-adapter.ts`，不要上移到 `rendercore`。间隔已经体现在 `positionInFocusRect` 数值中，运行时代码不再通过 conveyor 尺寸、gap 或 placement 枚举推导位置。

第一版转轮区独立配置为 `mainreelbg.png` 内 `{ x: 124, y: 130, reelCount: 5, reelGap: 15, cellWidth: 165, cellHeight: 130 }`，它不是主转轮背景框本身；单轴宽度和单格高度由 YAML 显式给出，内容区 `width=885`、`height=650` 由 buildgamestatic 派生。转动中按单轴裁切，停止后彻底取消裁切，允许偏大的 symbol 超出格子外框。

`bg-bar` 的 slot 位置同样只从 `config/game-static.yaml` 的显式 `slotRectsInConveyor` 读取，不从 conveyor 宽高除 5 推导。每个 rect 表示传送带的视觉格子，不表示 symbol 尺寸；symbol 可以比格子大，运行时只把 symbol 中心对齐到 rect 中心。横屏使用 `conveyor1.png`，movement 为 `down`，`slot 0` 在上方、`slot 4` 在底部火焰终点格；竖屏使用 `conveyor2.png`，movement 为 `right`，`slot 0` 在左侧、`slot 4` 在右侧火焰终点格。当前配置为：

```text
landscape slotRectsInConveyor:
0 { x: 55, y: 75,  width: 174, height: 126 }
1 { x: 55, y: 204, width: 174, height: 132 }
2 { x: 55, y: 339, width: 174, height: 132 }
3 { x: 55, y: 474, width: 174, height: 132 }
4 { x: 55, y: 609, width: 174, height: 132 }

portrait slotRectsInConveyor:
0 { x: 74,  y: 55, width: 153, height: 115 }
1 { x: 232, y: 55, width: 153, height: 115 }
2 { x: 390, y: 55, width: 153, height: 115 }
3 { x: 548, y: 55, width: 153, height: 115 }
4 { x: 706, y: 55, width: 153, height: 115 }
```

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

## bg-bar 播放

`apps/game003/src/bg-bar-sequence.ts` 只从本轮 step 0 读取 `logic.getStep(0).getComponent("bg-bar")`。如果本轮没有触发 `bg-bar`，返回 `null`，空传送带不参与完成条件；如果组件触发但 `mapComponents` 缺失、`features` 不是长度 5 的数组、出现未知 feature、`@type` 不是 `type.googleapis.com/sgc7pb.FeatureBar2Data`、`basicComponentData` 不符合第一版空结果合同，都会显式失败。

本轮 `features` 的 5 个值在 spin 开始时立即交给 `apps/game003/src/bg-bar-runtime.ts`。shift 映射固定为：`features[0]` 从 `slot 3` 移到 `slot 4` 并播放终点 `win` 后消失；`features[1]`、`features[2]`、`features[3]` 分别从 `slot 2/1/0` 移到 `slot 3/2/1`；`features[4]` 从传送带外进入 `slot 0` 并播放 `appear`。完成后静止队列为 `[features[1], features[2], features[3], features[4]]`，仅作为当前视觉状态；下一次 spin 以服务端新下发的本轮 `features` 为权威，客户端会重建传送带动画，不因两轮 feature 队列不同而失败。

`game-adapter.ts` 在 `playSpin()` 启动主转轮的同时启动 `bg-bar`，不会等主转轮落停。`features[0]` 到达终点、终点 `win` 播完并隐藏后，只有 `features[0]` 为 `wild` 或 `up` 时才触发矿车从屏幕外冲入，停在主转轮区下方轨道并做 overshoot / 倾翻 / 回正；随后车厢内的同一个 feature symbol 垂直飞向主转轮中心，并在 `symbol-hold` 阶段短暂停留后隐藏。矿车完成互动后进入 `parked`，保留在主转轮下方中间；下一次 spin 开始时如果仍有 parked 矿车，必须先用 `cart-exit` 向右快速冲出屏幕，不能 reset 原地隐藏。`normal` 只播放并完成 `bg-bar` 终点流程，不启动矿车、不播放透明空载矿车。`playSpin()` 的 resolve 条件包含主转轮落停与 target scene 校验、`bg-bar` 终点 win、上一辆矿车出屏、非 normal 时的新矿车入场/飞行/停留、`bg-wins` symbol sequence 和中奖金额主要播放；只要其中任一仍在阻塞阶段，framework 就不会进入后续 collect / idle。

## 中奖播放

`bg-wins` 是 `game003` 当前的中奖组件名，只在 app 层配置和识别；`logiccore`、`gameframeworks` 和 `rendercore` 只提供通用组件 result 解析和可见 symbol 状态 API，不硬编码 `bg-wins`。

live spin 停到服务器目标 scene 并完成可见窗口校验后，`apps/game003/src/win-sequence.ts` 读取第 0 step 的 `bg-wins.basicComponentData.usedResults`。每个索引指向同 step 的 `clientData.results[]`，并保留 `usedResults` 顺序生成中奖播放队列。

`result.pos` 是 `[x, y]` 成对坐标，坐标基准是当前 5 列 x 5 行主转轮可见窗口：`x` 为列索引，`y` 为列内可见行索引。一个 result 内的所有 `pos` 同时请求 symbol `win` 状态；多个 result 按 `usedResults` 顺序依次播放。全部中奖组的 once 动画回到 `normal` 后，`playSpin()` 才 resolve，framework 才进入后续 collect 流程。

如果本轮 `logic.getTotalWin() > 0`，`game-adapter.ts` 会在 spin 落停并完成 target scene 校验后启动 Pixi 中奖金额动画。动画使用 `logic.getBet()` 和 `logic.getTotalWin()` 的 raw amount，先在主转轮区底部递增小额数字，超过 1x 后切到主转轮区中心，并在到达 15x / 30x / 50x 时由 rendercore 切换 bigwin / superwin / megawin segmented VNI tier。symbol win sequence 和金额动画的 counting/tier-counting 阶段都会纳入 `playSpin()` 完成条件。canvas 点击只调用 rendercore 的 `requestAdvance()` 做加速：不到 bigwin 时直接跳到最终金额并停留；到 bigwin 以上时每点一次跳到下一档并继续播放；最后停在 `awaiting-dismiss` 后继续留在屏幕上，不会因点击消失。下一次 spin 开始时才会通过 `dismissImmediately()` 自动关闭上一轮金额展示。

当前 `game003` 不对 `result.symbol` 和 `targetScene[x][y]` 做默认一致性校验，因为 Ways 游戏里的 wild / 替代 symbol 规则可能随游戏变化，且同一游戏也可能存在多个 wild。`logiccore` / `gameframeworks` 只提供可选的 per-position validator 接口；不传 validator 时不做 symbol 语义校验。`game003` 仍会校验 `pos` 非成对、空坐标、重复坐标、越界和 win 金额汇总不一致，并且不会因为缺少 `bg-wins` 就自动遍历全部 results 作为隐藏兜底。`symbolNums` / `symbolNum` 在 Ways 中奖里不等同于可见坐标数量，不作为 `pos` 数量校验依据。

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
