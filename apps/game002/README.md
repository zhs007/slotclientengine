# game002

`game002` 是基于 Pixi、`@slotclientengine/gameframeworks`、`@slotclientengine/gameloading` 和 `@slotclientengine/rendercore` 的 live slot app。当前项目已收口为单资源集：URL `skin=1` 固定映射 `assets/game002-s3`；`skin=2|3|4|5`、缺失 `skin` 和旧 `serverUrl` query 都会显式失败。

## 启动与 live 边界

首屏由 `packages/gameloading` 承载。资源加载到 99% 时才校验 query 并调用 `prepareSlotGameLiveSession()`；资源到 100% 后才创建 framework、Pixi canvas 并用同一个 prepared session 连接。因此 loading 前不会挂载游戏，也不会创建第二条 WebSocket。

loading 资源 ID 必须唯一且 URL 不能为空。Vite 发布构建允许把内容相同的多个逻辑图片合并为同一个产物 URL；这种情况下 loading 清单保留第一个资源并只预加载该 URL 一次，不能把生产态 content-addressed URL 合并误判成资源重复。运行时的 VNI project 仍保留各自的逻辑资源路径映射。

manifest 精确引用的 CN valuePresentation Pixi 纹理（共享 `Symbol.png`、`CN.spinBlur.png`、`CN.disabled.png` 和完整数值图片）在 loading 0%–99% 阶段通过动态 Pixi `Assets.load()` 注册；99% 回调和 100% 进入游戏都在这些 Promise 完成之后。这样 defaultScene 创建 value controller 时复用 Pixi Cache，不会先显示透明 CN 占位再补出 Coin。JSON/atlas 和无关 win-amount 图片继续使用 gameloading 默认 loader，不把整套美术提前常驻为 GPU Texture。上述纹理进入游戏本来就必须驻留，因此只前移加载时机，不增加游戏稳态纹理集合。

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
- 转轮表现配置：`assets/game002-s3/reel.manifest.json`。当前 `spin.bounceStrength=0`，因此 game002 普通 spin 完全不做上下回弹；`1` 才等价于 rendercore 原始力度。`spin.dimmingAlpha=0.6` 控制普通 spin 中除 `WL/CN` 外实际滚动 occurrence 的格底和 symbol 压暗强度；它与 cascade 强调阶段的 `0.82` 是两个独立配置。该 manifest 由 rendercore fail-fast parser 读取并进入 loading/dist 精确闭包，app 不硬编码第二份值。
- 可展示 symbol 顺序固定为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`。
- 12 个普通 symbol 必须由 manifest 顶层声明 normal、`spinBlur`、`disabled` 和 `scale: 1`；`CN` 顶层只声明 `scale: 1 + valuePresentation`，不允许顶层 normal/state。CN 的无值 reel normal 是 `valuePresentation.reelStates.normal` 显式透明占位，blur/disabled 也只放在 `reelStates`，实际 normal art 只来自命中 tier 的 Spine。`emptySymbols=[]`，`BN` 是真实贴图，不是透明兜底。
- `CN_1..CN_4` 不属于主 symbol 集，只是当前 `CN.valuePresentation` 精确引用的附属 Spine；`Nearwin1..Nearwin3`、`WM_Fx` 仍未接入。附属资源由 `generate:symbol-value-resources` 从 manifest 生成精确闭包，禁止宽泛 glob。

## CN otherScene value presentation

第 0 step 触发 `bg-gencoins` 时，app 通过 gameframeworks facade 读取且只读取一个 `usedOtherScenes`。目标 scene 的 `CN` 格必须对应 positive safe integer，非 `CN` 格必须精确为 `0`；缺 basic data、尺寸漂移、非法值或 code 不匹配都会在启动 reel 前或展示前显式失败。raw value 不走美元 formatter；当前通过完整数值图片显示。

档数、`maxExclusive`、默认候选数组、Spine skeleton/atlas/texture、animation、数字显示类型、图片前缀、`slot`/local offset 唯一来自 `assets/game002-s3/symbol-state-textures.manifest.json`。当前默认候选为 `[1,2,5,10,25,50,100,250,500,1000]`，档位为 `<10`、`<100`、`<1000`、无上限四档；`text.type=image,prefix=./` 把完整值映射为 `./${value}.png`。这 10 张图片进入精确 Vite/loading/dist 闭包，并由 rendercore 使用 Pixi `Assets.load<Texture>()` 真正加载后再创建 Sprite，不依赖 `Texture.from(URL)` 的 cache 假设；服务器返回其它值、图片缺失或加载失败时，在 spin 前 prepare 或初始 reel update 显式失败，不回退 font。defaultScene 没有 otherScene 时，每个 CN 从候选数组取一个随机值；spin 的本地临时轮带也为每个 CN occurrence 固定一个候选值，使档位 Spine/数字图片跟随 reel slot 滚动而不是空白。目标 endpoint 在启动 spin 前写入服务器 otherScene 值，逐格落地到最终停轴都不回退为随机值或空值；未触发 `bg-gencoins` 时继续使用本地候选值。数字图片绑定每个 skeleton 真实存在的 `Num` slot，继承 slot/bone 动画；production TypeScript 不固定候选、四档、`CN_数字` 或 slot 名。CN value 属于实际 main-reel symbol，world 顺序仍为 background、main reels、`bg-win` carousel、global win-amount。

逐格停轴动画由 `RenderGridCellReelSet` 统一调度：每格落地时，manifest 显式配置了 appear 的 symbol 先播放大小写精确的 `Start`，once 完成后回到 normal，整轮完成边界会等待落地 appear 结束。当前除 `BN` 外的主 display symbol 都配置 `Start`；`BN` skeleton 没有 `Start`，因此不触发 appear，也不使用 builtin/default fallback。normal animation 按资源真实能力配置：`CO` 与 `CN_1..CN_4` 使用 `Loop`，其它普通主 symbol 使用 `Idle`。CN 的普通中奖 `win once` 已移除；coin collect 由 manifest 扩展 state 驱动同一 tier player 执行 `Win_Start once -> Win loop -> Collect once -> End once`，数字图片始终挂在同一 `Num` slot 下；值不变、状态切换和 dropdown 搬运都不会二次 set/create/attach。

- scale、render priority 和 animation 都从 `assets/game002-s3/symbol-state-textures.manifest.json` 派生；app 不维护第二份表。

Spine 统一由 rendercore 的官方 Pixi runtime 解析，只接受 4.3.x skeleton。当前 12 个普通主 symbol skeleton 是 4.3.23：`WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN`；`CN` 没有同名 skeleton，其 normal 由命中 value tier 的 Spine 提供。背景 skeleton 也是 4.3.23，并与 symbol 共用 rendercore 的版本、atlas、skeleton 和手动 update 底层，不在 app 内复制 adapter。manifest 中 animation name 区分大小写并必须真实存在。

背景状态合同为 `BaseGame=BG loop`、`FreeGame=FG loop`、`BaseGame -> FreeGame=BG_FG once`、`FreeGame -> BaseGame=FG_BG once`。当前 app 只初始化并持续播放 `BaseGame`；FreeGame 的服务端触发语义尚未定义，因此 app 不猜测 GMI 字段，也不提供 query/debug fallback。以后业务合同明确后，只调用 rendercore background player 的 `requestState()`。

`assets/game003-s1` 仍是已知的 Spine 4.2 非发布资源。本项目不为它提供 4.2 fallback，也不把它打包进 game002。

## 布局与 spin

art world 固定为 `2000 x 2000`，portrait reference 为 `1125 x 2000`。主棋盘是 `x=637.5,y=330,width=720,height=1080`、`6 x 9`、cell `120 x 120`；唯一重点区域在棋盘四边各扩 `60`，即 `focusRegion=x=577.5,y=270,width=840,height=1200`。

单背景使用 rendercore 的 `maximized-focus` 适配：先把重点区域完整且最大化地放进页面，再按页面宽高比反推应展示的背景范围。focus 以外只要仍在 `2000 x 2000` 背景内就继续显示，不按横竖屏分类主动裁掉；只有反推范围超过完整背景时才封顶，并允许出现不可避免的黑边。art size、focus 和 policy 直接从 background manifest 派生；uiframeworks 只消费 rendercore resolver 的结果，不复制算法。Spine animation 或状态切换不会改变 art/focus/viewport。game003 的双背景仍独立使用 YAML landscape/portrait variant 和 `orientation-focus`。

framework 负责 live、HUD、spin/collect；adapter 负责 Pixi 画面和 grid-cell reel。spin 使用本地公开轮带滚动，服务器最终 `6 x 9` scene 只叠加到本轮临时可见窗口。客户端不读取、缓存或泄露服务器真实轮带；目标 scene 无法从公开轮带反查 stop y 也不能失败。

默认 54 格按从上到下、从左到右启停，使用 `16ms/16ms` step、`6` 个最小循环、`54 symbols/s` 和每行 `16` 的 local reel offset；`reel.manifest.json` 把回弹力度配置为 `0`，所以启停过程中微型 reel 不产生额外 y 偏移。spin 暗度按实际滚动 occurrence 的 symbol code 决定，不按格子奇偶生成棋盘格：app 把 code 映射回 paytable symbol 后，仅 `WL`、`CN` 保持全亮；其它 occurrence 的格底使用随当前 reel slot 一起滚动的 `0.82` 半透明黑层，symbol 同步使用等效亮度的灰阶 tint，二者一起变黑且保留图标轮廓，淡入/淡出继续使用 `80ms/160ms`。该效果不通过降低 symbol alpha 制造透明，也不是固定在棋盘坐标上的黑块。通用滚动、resolver 校验和暗层/tint 同步属于 rendercore；`WL/CN` 名单只属于 game002。完成时必须校验可见 scene 与服务端目标一致，之后 `playSpin()` 才能进入金额阶段并最终允许 framework collect。

## 中奖金额

`assets/game002-s3/win-amount` 当前是从 game003 复制的临时 big/super/mega 美术资源。`win-amount.manifest.json` 是 tier project、asset glob、阈值和 segmented 时间的唯一资源来源；app 只配置金额 formatter 和布局，不复制 rendercore 状态机。

服务端整数 `100` 显示为 `$1.00`，但 spin/live 协议仍传原始整数。正中奖只在全部级联 step、remove、统一 fall 和必要的 gencoins 数据边界完成后启动金额动画；win-amount 播放期间 adapter 继续逐帧推进 main reel runtime，因此 CN 与其它 symbol 的 normal Loop 不会被冻结。`playSpin()` 等到金额进入 `awaiting-dismiss` 即可 resolve，不要求用户点击关闭。点击只调用 `requestAdvance()`：用于跳金额、进下一档或从最终等待态播放 dismiss。下一次 spin 会先清理遗留金额。

## bg-win 消除级联

`bg-spin/bg-gencoins/bg-win/bg-remove/bg-respin/bg-dropdown/bg-refill` 是 game002 app-owned 映射，只有 `historyComponents` 对应的 `step.hasComponent()` 才代表触发；`historyComponentsEx` 和 map 中的空组件不触发。adapter 预解析全部 steps 后，严格执行初始 spin、逐组 emphasis/win/remove、dropdown/refill 统一 fall 和最终 gencoins；任一结构漂移都在启动画面前失败。

每个 result 的全部 `pos` 会在主转轮停稳后按 manifest presentation 执行。现有单组现金 overlay 与底部临时汇总都严格使用 `cashWin64 !== undefined ? cashWin64 : cashWin`；汇总要求 result cash 为 positive safe integer cents，并复用 `formatServerUsdAmount` 除以 `100` 显示。不能从 bet、lines、component total 或 `totalwin` 推导。`bg-win.basicComponentData.cashWin/coinWin` 只在字段存在时作为累计协议证据，不能替代 result 权威字段。

普通 symbol 与 WL 在 manifest 配置 `order=0/group/groupAmount`，CN 配置 `order=1/sequentialCollect/itemAmount`；因此服务器 `usedResults` 即使把 CN 放在前面，实际播放仍稳定为全部普通组后再 coin group，同 order 内保持服务器相对顺序。普通组请求 win 的同一边界把该 result cash cents 用 `0.35s` 计数加入 summary，动画和计数都完成后才 remove。coin group 先让全部 CN 同时 `Win_Start`，完成后全部进入 `Win` loop，再按 `y`、后 `x` 的屏幕行优先顺序逐枚 `Collect`；未轮到的 CN 保持 Win loop，当前 CN 只有真实 resolved state 进入 collect 后才按 `itemCoin/groupCoin * groupCash` 把精确 cents 加入 summary，随后等待 `End` 完成并 release 消失。逐格 coin value 总和必须精确等于 result coin amount，cash 份额不能整除时显式失败。参与 coin 判定的 WL 只与 CN start 同播自身 win，之后回 normal，不进入 collect/remove。

summary 是 cascade container 内的 Pixi Text，位置从 reel layer 尺寸派生为 `(boardWidth/2, boardHeight+36)`，样式为 `48/900/#fff7d6/#5a2500/6`。值为 0 时完全隐藏；跨普通组、coin、fall 和后续 step 保留累计，全部 cascade 完成后在 global cash win-amount 启动前清零隐藏。单组 cash overlay、临时 cash summary 与最终 global cash amount 使用相同 cents formatter，但生命周期各自独立。

金额锚点先计算所有中奖格中心的算术平均点，再从本组实际中奖格中选择最近的一格；等距时按 `x`、再按 `y` 升序。所有组金额立即同时显示，并以 `0.82` 同时压暗全部中奖坐标之外的格子黑层与 symbol 本体。完整强调段为 `1.2s`：`0.1s` 渐暗、`1s` 保持、`0.1s` 渐亮；恢复正常亮度后，从第一组开始严格执行“本组全部中奖 symbol 播放一次 `win`，完成后立即 remove 本组可消除 symbol，再进入下一组 win”。game002 通过函数向 rendercore 声明 `WL` 既不 remove 也不 drop，rendercore 不硬编码 wild。WL 仍参与所在组的中奖高亮与 win；manifest 为 WL 声明最高 `renderPriority: 1`，其它下落 symbol 可从它后面经过。

dropdown 与 refill 合并为一次 rendercore fall：幸存 occurrence 和新增 symbol 同时从上向下移动，不进入 spin/appear 流程；fall 期间只在整个 grid-cell reel set 上启用一个完整轮子矩形 mask，下落 symbol 自身不叠加 mask，棋盘上方的新 symbol 进入轮子区后才可见，落地后解除 reel-set mask。每列仍保持下方优先的轻微错峰，并增加从左到右的列启动延迟。当前 motion 使用更短的落下时间、更大的 overshoot 和更短的 settle，使下落与回弹更有力度。既有 CN value 随 occurrence 搬运；refill 新增 CN 时必须触发当前 step 的 `bg-gencoins` 并直接使用服务端值，没有新增 CN 时服务器可省略该组件，sequence 从 dropdown 严格携带既有 CN value，不能生成随机替代值。末 step 没有真实 `bg-win` 时直接结束级联；global win-amount 只能在全部 steps 结束后开始。game003 原有 carousel/lingering 合同不受影响。

dropdown 请求仍是通用 symbol state，但 `RenderSymbol` 会比较切换前后实际动画的 continuity key。底层 Spine/VNI 资源与 playback 完全相同时只更新状态语义，保留当前 player 和时间轴，不 reset/replay；因此 CN 的 normal `Loop` 进入 dropdown `Loop` 时持续播放，其它 normal/dropdown 相同的动画也自动获得相同行为。动画名、资源、transform 或 playback 不同则照常切换；reset、value/tier 变化仍强制重建，不能误复用旧时间轴。

组件、索引、pos、金额或 geometry 非法时在转轮启动前显式失败。game002 只提供组件名、金额 resolver、formatter/style 和可见 symbol target；组件 result 解析、symbol 状态、Pixi 金额 renderer、确定性 anchor 与轮播生命周期由 rendercore 拥有。

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

生产产物在 `apps/game002/dist/`。`release:check` 会检查相对 URL、敏感默认值、background manifest/4.3 skeleton/8-page atlas 的 source 与 dist 字节闭包、12 个普通 normal、13 组 reel state 贴图、12 个普通 symbol Spine JSON、CN tier skeleton/slot、symbol atlas/texture、win-amount manifest/projects/assets，以及 bundle 不引用 `bg.jpg`、CN 顶层 normal 或旧 skin 目录。`BG.png` 与 `BG_2.png` 当前源字节相同，Vite 可只输出一份 hashed bytes；两页运行时 URL 仍通过稳定 `spineAtlasPage` query 保持一一对应，parser 禁止两个 page 直接共用同一 URL。所有背景资源都在 loading 99% 前闭合，100% 后才创建 background player/framework/Pixi。子目录部署必须保留尾斜杠，例如 `https://cdn.example.com/game002/?skin=1&...`。

常见显式失败包括：query 缺失/重复/非法、旧 skin 或 `serverUrl`、资源或 loading closure 缺项、manifest unknown field/路径/尺寸/focus/state/transition 非法、Spine 非 4.3、atlas page/texture/animation 不匹配、并发背景切换、scene 不是 `6 x 9`、未知 symbol、金额输入非法、最终可见 scene 不一致、live/collect 失败。不得切换到静态背景、首帧、mock、旧 skin、placeholder、BN 兜底或 Spine 4.2/3.8 fallback。
