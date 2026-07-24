# game002 rules

本文件保存 game002 专属业务和 presentation 合同。通用 reel、symbol、Spine、scene-layout 和 coordinator 规则同时遵守 `shared-game-runtime.md`。

## 固定入口和资源

- 只支持严格的 `skin=1|2`：
  - `skin=1` 固定映射：
    - `assets/game002-s3/background.manifest.json` 及 BG Spine 资源；
    - `assets/game002-s3` symbols/reel/win-amount；
    - `assets/gamecfg002/gameconfig.json`。
  - `skin=2` 固定映射 `assets/crave` 的完整 mapped scene-layout package；layout、
    background、focus、grid geometry、symbols、公开本地轮带和 award popup 只从该包
    的 manifest/map 取得。
- 两个 skin 共用同一 game002 round target、期待/cascade/WL/CN/summary/cleanup
  policy；Game Viewer 的简化流程不是 game002 的行为来源。`skin=3|4|5`、缺失、
  重复、`01` 和未知值显式失败，不保留 alias 或默认值。
- `assets/game002-s3/reel.manifest.json` 的 Nearwin1/2 是两个 skin 共用的显式
  game002 presentation extension，不伪装成 Crave layout closure。
- live server 固定为 `wss://gameserv.rgstest.slammerstudios.com/`；URL 不接受 `serverUrl`，旧参数也显式失败。
- URL 必须显式提供 `lines=30`，其它值在 loading 99% 配置解析阶段失败。
- 首屏遵守 `docs/agent-rules/loading-ui.md`；99% 准备 live session，100% 后创建 framework/Pixi，并复用 session。

## Symbol package

- display symbols 固定为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`，manifest 中显式 `scale: 1`；`BN` 是真实贴图，`emptySymbols` 为空。
- `CN_1..CN_4`、glyph 和 Nearwin effect 是附属资源，不得进入 display set 或由宽泛 glob 接入。
- 除 `BN` 外当前主 display symbol 都有真实 `Start` appear；不得伪造 builtin/default appear。
- normal Spine 有 `Loop` 时使用 exact `Loop`，否则使用 exact `Idle`；当前 `CO` 和 `CN_1..CN_4` 使用 `Loop`。
- 当前 `renderPriority` 只由 reel/symbol manifest 派生，不在 app 或 YAML 维护第二份表；WL 的优先级事实留在 manifest。

## CN value presentation

- `CN` 不配置顶层 `normal/spinBlur/disabled`；normal art 只来自 resolved tier Spine。
- CN text 按 active symbols manifest 使用 `image-string`：skin1 绑定真实 `Num`
  slot，skin2 绑定 Crave 的真实 `coin` slot；tier/resource/glyph 均不得跨 skin
  复用或回退。
- glyph 集、slot、resource、binding、tier 和尺寸均严格校验。完整数值图片与 ImgNumber 互斥，不回退字体、旧完整图片或 fixture glyph。
- explicit reel state texture（如 spinBlur/disabled）优先于 normal active Spine。tier player 异步 init 不得把当前 reel texture 隐藏为空格；回 normal/activeSpine 后再显示同一 player。
- normal 与 loop 使用同一 resource/playback 时保持时间轴 continuity，不 reset/replay，并同步新的 semantic playback 以报告真实 loop completion。

## Initial spin、dimming 与 anticipation

- 普通 initial grid-cell spin 不播放 Nearwin effect。
- 非期待 initial spin 中 WL/CN 全亮。第 2 个按真实 landing order 落地的 paytable-exact WL 在同一边界打开 anticipation gate；从该边界起只有 WL 全亮，其它实际滚动 occurrence（包括 CN）压暗。
- 激活 gate 的第 2 个 WL 自身不补播 effect，后续格各播放 `Nearwin1.Loop` 真实一次。
- 第一枚后续格在 activation 后 `800ms` 落地；Nearwin1 在落地前一个真实单循环时长起播。之后 effect start 与 landing 都保持 `100ms` cadence。
- anticipation 状态跨本轮 win/remove/cascade/refill/global win-amount 保留，只在下一次合法 initial spin apply state、fatal cleanup 或 destroy 时清除。
- dimmingAlpha 只从 reel manifest 读取，当前为 `0.5`。暗层跟随 reel slot 同速移动；symbol 使用灰阶 tint 且 alpha 保持 `1`。不得使用固定棋盘矩形或奇偶格假象。
- bounceStrength 只从 reel manifest 读取；`1` 表示原始力度，按非负值缩放，当前事实由 manifest 表达，不在 app 复制。

## 本地视觉 phase

- grid-cell initial spin 和 anticipation selective refill 每次按列重新生成本地视觉 phase。
- rendercore 对每列完整公开轮带做 partial Fisher-Yates，为同列各格无重复抽取 phase；只洗 phase，不洗 symbol 顺序。
- game002 注入独立 `spinPhaseRandom`；production 使用 Web Crypto，不消费 server randomNumbers、全局 `Math.random` 或 CN presentation random。
- 最终服务器 scene 只覆盖本轮临时 strip 落点窗口，不改变方向、速度、timing 或公开轮带边界。

## Cascade 与 fall

- emphasis 固定为 `0.1s` 渐暗、`1s` 保持、`0.1s` 渐亮。
- 压暗开始边界并行启动全部中奖 symbol 的 opening win；emphasis 结束后按稳定组顺序等待已启动的 win 并依次 remove，不能重播 opening win。
- WL 的 no-remove/no-drop 由 game002 predicate 声明；rendercore 不硬编码 wild。
- 非期待 unified fall 不走 spin/appear，并保留列内 stagger 与从左到右列 delay。
- 普通 symbol 可穿过固定 WL 下落；叠放只服从 manifest `renderPriority`。
- anticipation cascade 严格执行 existing-only dropdown、refill-hole Nearwin2 sweep、selective refill spin/appear；survivor 不重新 spin/appear。
- anticipation refill sweep 顺序是 `y desc/x asc`，`80ms` stagger，Nearwin2 一次。
- selective spin 从最左有 hole 列的最下 hole 建立“本列向上 + 有 hole 列从左到右”的右上对角波；同层以 `16ms` start group 边界同时启动，稳定顺序按波层、层内从左到右，landing cadence `100ms`，`settleAfterLastStartMs=800ms`。
- 非期待 refill 完成时，如果新增 exact WL 按真实完成顺序使盘面达到 2 个 WL，在完成边界激活 gate；不倒放当前 refill，后续流程切换 anticipation 路径。
- fall 期间整个 grid-cell reel set 只使用一个完整 board mask；active symbol 不叠加自己的 mask。
- normal 与 dropdown 指向相同 resource/playback 时保留 player 和时间轴，不 reset/replay 等价 Loop。
- 所有 step 完成后才播放 global win-amount；播放期间 reel runtime 继续逐帧 update。

## CN otherScene、collect 与 summary

- CN value 随 occurrence dropdown 搬运。只有 refill 新增 CN 时才要求当前 step 的 `bg-gencoins` 提供不可推导值；没有新增 CN 时允许缺失。
- game002 对 remove/dropdown/refill 的 otherScene：可从权威 scene 或 occurrence 推导时允许省略；提供时最多一份并严格比对。
- cascade summary 使用 cash 单位，`0` 时隐藏；跨 step/fall 保留，在全部 cascade 后、global win-amount 前清零。
- result cash 严格按字段存在性选择 `cashWin64 !== undefined ? cashWin64 : cashWin`，要求 positive safe integer cents，并统一用 `formatServerUsdAmount`。
- 普通组在压暗和 win 请求阶段并行累计整组 cash。
- CN item 逐格读取 positive safe integer raw coin value；item coin 和必须等于 result coin amount，再按 `itemCoin/groupCoin * groupCash` 精确分配 cents，不能整除时失败。
- `cascadeWinPresentation.order/mode/state` 决定稳定排序和 group/sequential collect。当前普通/WL 先于 CN 的事实保存在 manifest。
- CN 组同时请求全部实例 `Win_Start`，完成后进入 `Win` loop，再按 `y`、`x` 行优先逐格 Collect。
- Collect/End 真实时长来自官方 animation；相邻 Collect 当前以 `0.3s` cadence 起播，不等待前一枚完成，允许重叠。每枚自身仍执行 Collect once、End once、release。
- official Spine loop 必须报告真实 loop boundary，不能卡住 pending Collect。
- WL 作为 app 显式批准的 sequential companion，与 CN `Win_Start` 同时播放自身 win；等待完成后回 normal，但不贡献 item value、不进入 loop/Collect/End、不 remove/drop。

## Win carousel

- game002 中奖 component 名是 app-owned `bg-win`。
- rendercore carousel 按 component 数组和各自 `usedResults` 顺序驱动 symbol win、金额 anchor、首轮阻塞、lingering 和下一 spin cleanup。
- 单组金额只使用 result 的 `cashWin64/cashWin` 字段存在性选择；不以 truthy、component total 或 totalwin 兜底。
