# game003 rules

本文件保存 game003 专属业务和 presentation 合同。通用能力同时遵守 `shared-game-runtime.md`。

## 固定入口

- 使用 `apps/game003`、`assets/gamecfg003/gameconfig.json` 和 `assets/game003-s1`。
- 首版只支持 `skin=1`，live `gamecode=EfedJuHEaydXNghnmO9KI`；不得作为 game002 新皮肤实现。
- live server 固定为 `wss://gameserv.rgstest.slammerstudios.com/`；URL 中 `serverUrl` 显式失败。
- 首屏遵守 `docs/agent-rules/loading-ui.md`，99% 准备 live session，100% 后创建 framework/Pixi。

## Background、frame 与主转轮 layout

- landscape 使用 `bg1.jpg`，portrait 使用 `bg2.jpg`；variant、focus rect 和 canvas 上限通过 rendercore/uiframeworks 的 `orientation-focus` policy。
- app 不使用私有 CSS/DOM resize 绕过 framework，也不让 landscape focus 撑爆 portrait art。
- `mainreelbg.png`、`conveyor1.png`、`conveyor2.png` 的组合与位置属于 game003 app layout，不进入 rendercore。
- main reel background 和 conveyor placement 来自 YAML 中相对 variant focusRect 的显式字段。
- reel 内容区来自 `reelAreaInMainReelBackground` 的 `x/y/reelCount/reelGap/cellWidth/cellHeight`；width/height 由 buildgamestatic 派生，app 不从图片尺寸或 placement 枚举推断。

## Main reel 与 symbol

- spin 使用 `gameconfig.json` 的本地公开 `bg-reel01`；服务器目标 scene 只覆盖临时可见窗口。
- display symbol manifest scale 必须显式为 `1`。美术给 JPG normal 时在资源准备阶段一次性转换为同名 PNG，不扩展 shared runtime 支持 JPG normal。
- `renderPriority` 只由 symbol manifest 派生。当前高优先级 symbol 的事实留在 manifest，不在 YAML、app、viewer 或测试复制 zIndex 表。
- VNI/Spine animation resource、state 名、loading glob、生成物、symbolsviewer 和 runtime resolver 必须同步。
- Spine animation 名大小写精确。缺 appear 的 symbol 回自身 normal Spine 并按 once 状态完成，不伪造 builtin/static appear。
- 非 display JSON、effect 或 auxiliary symbol 不得被宽泛 glob 接入主转轮。

## bg-bar conveyor

- `bg-bar` 是 app-owned component，只支持 `normal | wild | up`。
- 每次 spin 与主转轮同时根据本轮 `FeatureBar2Data.features` 启动。
- `normal` 是 bg-bar manifest 显式声明的透明 symbol，不新增透明 PNG。
- feature 图片尺寸、原始 scale 和 `slotRectsInConveyor` 来自 manifest/YAML；app 不以 conveyor 宽高除 5 推断 slot，共享包不硬编码 bg-bar/wild/up。
- `playSpin()` 等待主转轮、bg-bar 终点 win、bg-wins 首轮、矿车互动和 win-amount 主要播放；win-amount 进入 `awaiting-dismiss` 后不再阻塞。

## Minecart

- minecart 是 app-level typed extension；shared package 只透传通用 `appExtensions`，不出现 minecart、轨道、刹车、payload 或 game003MinecartInteraction 语义。
- 图片、横竖屏轨道停点、payload anchor、exit/fly/hold timing、尺寸和预算全部来自 YAML/app extension；缺失或漂移显式失败。
- bg-bar 终点为 normal 时不启动矿车，也不显示透明空载矿车。
- 非 normal 互动必须在主转轮停轴前完成；payload 使用 bg-bar manifest/catalog 原 scale，不在 runtime/YAML 二次缩小。
- parked minecart 在下一次 spin 先向右冲出屏幕，不能 reset/hide。
- 不通过延长主转轮 duration、speed、cycles、startDelay 或 stopDelay 掩盖矿车节奏问题。

## bg-wins

- 中奖 component 名 `bg-wins` 只在 game003 app 配置；logiccore/gameframeworks/rendercore 不硬编码。
- 按 `bg-wins.basicComponentData.usedResults` 指向的 `clientData.results[]` 顺序播放首轮；首轮结束后 `playSpin()` 可 resolve，后续按 `usedResults -> pause -> usedResults` lingering 到下一 spin cleanup。
- `result.pos` 坐标基准是当前 `5 x 5` 可见窗口。缺失或越界显式失败。
- 每个 result 使用自身 finite positive `cashWin` 经 `formatServerUsdAmount` 显示，锚到该 result 中间中奖 symbol 的中间偏下位置，并随该 result win 状态结束隐藏。
- 不使用 `coinWin`、totalwin 或全部 results 兜底。Ways 的 `symbolNums/symbolNum` 不等同于 `pos` 数量。
- symbol 语义校验只由 app 显式 validator 决定；shared code 未收到 validator 时不默认比较 result.symbol 与 target scene。

## Coin otherScene

- game003 的 `bg-gencoins`/CO overlay 把零份 otherScene 视为本 step 无 update；提供时最多一份。
- CO cell 显示 raw positive integer，非 CO cell 必须为 `0`。
- shared package 不硬编码 bg-gencoins 或 CO。

## Win amount

- framework HUD、Pixi win-amount 和 result overlay 复用同一 formatter；服务器整数按 cents 解释，不直接渲染 raw integer。
- tier resource、VNI project、asset glob 和 segmented timing 只来自 `assets/game003-s1/win-amount/win-amount.manifest.json`，不在 YAML/app/test 维护第二份。
- 点击只调用 `requestAdvance()`：未到 bigwin 时先跳最终金额、再隐藏；bigwin 及以上逐档推进，最终 awaiting-dismiss 后再点击播放 dismiss/end。
- awaiting-dismiss 不阻塞 `playSpin()`；下一 spin 清理残留。
- win-amount VNI 保持资源原始显示尺寸，不使用 VNI stage 或背景框做 fit/cover/contain。
