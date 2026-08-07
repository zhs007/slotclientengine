# game002

动画状态切换、业务时序和配置来源汇总见 [`docs/animation-flow-and-timing.md`](./docs/animation-flow-and-timing.md)。调整动画节奏时应同步更新该文档、对应 source contract 和测试。

`game002` 是基于 Pixi、`@slotclientengine/gameframeworks`、`@slotclientengine/gameloading` 和 `@slotclientengine/rendercore` 的 live slot app，并通过 `@slotclientengine/platformbootstrap-leo` 获取只读平台初始化 snapshot、通过 `@slotclientengine/game-ui-leo` 注入独立 Leo 游戏内 HUD。运行时只有一个 Gamelayouteditor Scene Layout 包，不再提供 skin 选择；CDN 部署的是 `assets/crave` 解包目录，浏览器按 manifest/map 加载文件，不下载或解压 ZIP。旧 `skin` 与 `serverUrl` query 都会显式失败。

## 启动与 live 边界

首屏由 `packages/gameloading` controller 承载，并显式注入零运行时依赖的 `@slotclientengine/gameloading-ui-leo`。Loading UI 挂载后，`readiness.start()` 通过独立 bootstrap chunk 严格解析一次 query，并让 Leo provider 与唯一 `prepareSlotGameLiveSession()` 同 CDN 资源并行。资源进度只表示 `0..99%` 的真实资源完成度；99% 是 platform snapshot、translation/setting、已 enter 的 live session、visual readiness 与 package/resource validation 的 join barrier，不是请求起点。全部完成后才发布 100%、创建 framework/Pixi，并把同一个 prepared session 交给 framework。任一分支失败都会 abort 并清理其它已完成 owner；不会创建第二条 WebSocket。

100% 后的正式 `game-entry` 才加载 React、ReactDOM 和 `@slotclientengine/game-ui-leo/styles.css`，并在 `createSlotGameFramework()` 中注入 per-instance Leo factory。Leo HUD 与默认 UI 复用 `uiframeworks` 的同一 frame/viewport host，只消费 framework snapshot 并调用 typed commands；session、spin、presentation、collect、balance reconciliation 和 adapter 生命周期仍完全属于 framework。initial loading chunk 不包含 React 或 Leo 游戏内资产。

loading 资源 ID 必须唯一且 URL 不能为空。Vite 开发和发布环境把 `assets/crave` 作为解包静态目录原样提供；game002 从 `assets.map.json` 的 physical path 动态生成 URL，相同 physical path 只加载一次。替换 Gamelayouteditor 导出目录不再生成 TypeScript 或逐文件 `?url` import。运行时的 VNI project 仍保留各自的逻辑资源路径映射。

manifest 精确引用的 CN valuePresentation Pixi 纹理（共享 `Symbol.png`、`CN.spinBlur.png`、`CN.disabled.png` 和 `cn-digits` glyph）在 loading 0%–99% 阶段通过动态 Pixi `Assets.load()` 注册；99% 回调只最终构造可销毁 value resource bundle，唯一 live session 已在 early readiness 中并行准备。这样 defaultScene 创建 value controller 时直接复用 Pixi Cache，不会先显示透明 CN 再补数字；任一准备失败会回滚 platform handle、session 与 bundle。

live server 固定为 `wss://gameserv.rgstest.slammerstudios.com/`。launcher canonical 参数与 legacy compatibility alias 由同一个 strict parser 归一化；两者同时存在时必须 trim 后完全相等，空值、重复 key 或冲突都会在 early readiness 立即失败。`lines` 是 game002 固定游戏合同，URL 只能显式提供 `30`：

| 参数                                                                                   | 合同                                            |
| -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `skin`                                                                                 | 已移除；传入即失败                              |
| `gameCode/gamecode`、`platformToken/token`、`businessCode/businessid`、`lang/language` | 每组至少一个；双写必须相等                      |
| `jurisdiction`、`clienttype`                                                           | 必填非空字符串                                  |
| `configUrl`、`license`、`currency`                                                     | 可选 launcher 参数                              |
| `moneymode=fun`                                                                        | 仅 `businessCode=guest` 时进入 fun setting 路径 |
| `bet`、`times`、`requestTimeoutMs`                                                     | 必填正数                                        |
| `lines`                                                                                | 必填且必须精确为 `30`                           |
| `autonums`                                                                             | 必填整数，允许 `-1`                             |

示例：

```text
http://127.0.0.1:5207/?gameCode=GAME_CODE&platformToken=TOKEN&businessCode=guest&clienttype=web&jurisdiction=MT&lang=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

参数值必须 URL encode。URL query 可能进入地址栏、历史记录、access log 和 Referer，发布环境应使用短期或一次性 token。

### 测试服下一轮 RNG

game002 在正式 framework entry 中显式启用了 gameframeworks 的测试服 RNG
控制台能力。每次成功解析 spin 后，控制台会输出可直接复制的
`rng(8,61,41,33,13,729)`；修改数字并执行后，只有下一次实际发出的 spin
`ctrlparam` 会增加同值 `lstrand`，再下一轮恢复正常请求。

`rng(...)` 只接受一个或多个非负 safe integer。空调用、负数、小数、string 或
array 参数都会显式失败，并保留之前合法但尚未消费的序列。该入口只用于固定测试服
局面，不写入 URL/配置/玩家状态，不控制本地公开轮带或 visual phase RNG。
framework destroy 或页面刷新会清理 command 和 pending 序列。

## 资源合同

- 唯一 Scene Layout 包的 layout/background/focus/棋盘 geometry/symbols/公开轮带/popup
  唯一来自 `assets/crave/layout.manifest.json`、`assets.map.json` 和当前美术 payload。
  美术可直接替换 `assets/crave` 中的内容或保留未引用文件；game002 以
  map 的 logical key→安全 physical path 作为路由，不比对过时的 `sha256`/
  `byteLength`，也不以 orphan 阻断构建。实际引用文件仍必须存在并通过
  manifest/Spine/VNI/image decoder；Vite/CDN 原样提供解包目录，loading 根据 map
  并行下载当前包。Crave CN 使用其 symbols manifest 的 ImgNumber
  `slot: "coin"` 与包内 `0..9` glyph，不使用旧 `Num` binding、完整数值图片或字体。
- `apps/game002/config/reel-presentation.manifest.json` 保存期待 timing/effect policy 和 `nearwin1/nearwin2` 程序键；实际资源全部来自 Crave package。
- 转轮表现配置：`apps/game002/config/reel-presentation.manifest.json`。当前 `spin.bounceStrength=0`、`spin.dimmingAlpha=0.5`；普通逐格 timing、Nearwin effect policy、2-WL activation timing 以及 refill 顺序也只来自该 manifest。
- 可展示 symbol 顺序固定为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`。
- symbol package 的 game config、公开本地轮带、state、scale、render priority、
  animation、Spine、ImgNumber 和依赖闭包全部从 Crave package resource/registry
  取得；app 不从 filename 或旧 manifest 重建第二份表，也不保留 raw symbol asset
  loader。棋盘行列、cell、gap、placement 与 reel set 名同样直接从 layout manifest
  派生，不在 app 维护第二份布局数值。

## CN otherScene value presentation

第 0 step 触发 `bg-gencoins` 时，app 通过 gameframeworks facade 最多读取一个 `usedOtherScenes`。服务器在 auxiliary matrix 没有变化时可以省略该引用，此时不生成 CN value update；实际提供矩阵时，目标 scene 的 `CN` 格必须对应 positive safe integer，非 `CN` 格必须精确为 `0`。缺 basic data、超过一个引用、尺寸漂移、非法值或 code 不匹配都会在启动 reel 前或展示前显式失败。raw value 不走美元 formatter，直接由 ImgNumber 渲染 `String(value)`。

CN 档数、threshold、Spine resource、animation、`coin` slot 和数字 dependency 唯一
来自 active Crave Symbols manifest。缺 glyph、slot、resource 或尺寸漂移显式失败，
不回退完整图片或字体。每个 CN occurrence 拥有独立 renderer，但共享 glyph
resource；default/local strip/otherScene 的 occurrence/value 搬运语义不变。

逐格停轴动画由 `RenderGridCellReelSet` 统一调度：每格落地时，package manifest
显式配置了 appear 的 symbol 先播放大小写精确的 `Start`，once 完成后回到 normal，
整轮完成边界等待 appear 结束。CN collect 由 manifest state 驱动同一 tier player
执行 `Win_Start once -> Win loop -> Collect once -> End once`；值不变、状态切换和
dropdown 搬运不会二次 create/attach 或重播等价 Loop。

## 布局与 spin

art world 固定为 `2000 x 2000`，portrait reference 为 `1125 x 2000`。主棋盘的唯一坐标源是完整 art 内的整数坐标 `x=640,y=337,width=720,height=1080`，对应 portrait reference 坐标 `x=202.5,y=337`；棋盘为 `6 x 9`、cell `120 x 120`。唯一重点区域在棋盘四边各扩 `60`，即 `focusRegion=x=580,y=277,width=840,height=1200`。

单背景使用 rendercore 的 `maximized-focus` 适配：先把重点区域完整且最大化地放进页面，再按页面宽高比反推应展示的背景范围。focus 以外只要仍在 `2000 x 2000` 背景内就继续显示，不按横竖屏分类主动裁掉；只有反推范围超过完整背景时才封顶，并允许出现不可避免的黑边。art size、focus 和 policy 直接从 background manifest 派生；uiframeworks 只消费 rendercore resolver 的结果，不复制算法。Spine animation 或状态切换不会改变 art/focus/viewport。game003 的双背景仍独立使用 YAML landscape/portrait variant 和 `orientation-focus`。

framework 负责 live、HUD、spin/collect；adapter 负责 Pixi 画面和 grid-cell reel。spin 使用本地公开轮带滚动，服务器最终 `6 x 9` scene 只叠加到本轮临时可见窗口。客户端不读取、缓存或泄露服务器真实轮带；目标 scene 无法从公开轮带反查 stop y 也不能失败。

默认 54 格按从上到下、从左到右启停，使用 `16ms/16ms` step、`6` 个最小循环和 `54 symbols/s`；`reel.manifest.json` 把回弹力度配置为 `0`，所以启停过程中微型 reel 不产生额外 y 偏移。每次 initial spin 和期待 selective refill spin 都通过 rendercore 对每列完整的 77 个本地公开轮带相位做 partial Fisher-Yates，为同列 9 格无重复抽取视觉相位；不再使用固定 `16*y` offset，也不打乱轮带 symbol 顺序。相位使用独立 `spinPhaseRandom`，production 默认来自 Web Crypto，不消费服务器 randomNumbers、全局 `Math.random` 或 CN 默认值的 presentation random；最终服务端目标窗口仍只在当前临时 strip 的落点覆盖。spin 暗度按实际滚动 occurrence 的 symbol code 和通用 activation 状态决定，不按格子奇偶生成棋盘格：app 把 code 映射回 paytable symbol，非期待时 `WL/CN` 全亮，期待激活后仅 `WL` 全亮；被压暗 occurrence 的格底使用随当前 reel slot 一起滚动的 `0.5` 半透明黑层，symbol 同步使用等效亮度的灰阶 tint，二者一起变黑且保留图标轮廓，淡入/淡出继续使用 `80ms/160ms`。该效果不通过降低 symbol alpha 制造透明，也不是固定在棋盘坐标上的黑块。通用滚动、activation 切换、resolver 校验、相位洗牌和暗层/tint 同步属于 rendercore；`WL/CN` 名单与视觉 RNG 注入只属于 game002。完成时必须校验可见 scene 与服务端目标一致，之后 `playSpin()` 才能进入金额阶段并最终允许 framework collect。

普通 initial spin 不播放 Nearwin effect。game002 按真实 landing edge 统计 paytable exact `WL`：initial spin 第 2 枚 WL 落地的同一边界激活期待状态，该格也不补播 effect，只有后续格才在落地前播放 `Nearwin1.Loop` 真实 1 次（单次官方时长约 `0.6666667s`）；首个后续格从 activation boundary 起等待 `800ms` 落地，Nearwin1 在 activation 后约 `133.3333ms`、也就是目标 landing 前约 `0.6666667s` 起播。之后每隔 `100ms` 启动下一格 Nearwin1，每格自身播放完就立即落地，因此 effect start 与 landing 都保持 `100ms` cadence。若 initial spin 尚未激活，而后续 unified refill 的新增 WL 按 movement 真实完成顺序使当前盘面达到 2 个 WL，则在该 refill 原子提交边界激活期待；本次已完成的 refill 不倒放 effect，下一 cascade 立即走期待 split 路径。期待状态跨当前轮 win/remove/cascade/win-amount 保留，只在下一次合法 initial spin 真正开始、apply initial state、fatal cleanup 或 destroy 时清除。rendercore 只接收通用 gate coordinate/effect id，不识别 WL 或资源文件名。

## 中奖金额

big/super/mega popup 的资源、阈值、动画和布局全部由 Crave package 内的 popup package 管理；app 只配置金额 formatter，不复制 rendercore 状态机。

服务端整数 `100` 显示为 `$1.00`，但 spin/live 协议仍传原始整数。正中奖只在全部级联 step、remove、普通 unified fall 或期待 split refill 和必要的 gencoins 数据边界完成后启动金额动画；win-amount 播放期间 adapter 继续逐帧推进 main reel runtime，因此 CN 与其它 symbol 的 normal Loop 不会被冻结。`playSpin()` 等到金额进入 `awaiting-dismiss` 即可 resolve，不要求用户点击关闭。game002 将完整 canvas 与 window keyboard 绑定到 shared Scene Layout Popup input；active award 的 pointer/key 只调用一次 `requestAdvance()`，转场 prelude 走同一 rendercore 分派，idle 输入透传。下一次 spin 会先清理遗留金额。

## WL/WM/CM multiplier

spin 和每次 refill 的 symbol 全部落定后、中奖开始前，game002 会执行服务器
multiplier transform。新 WL/WM/CM 的 multiplier 分别来自 `bg-genwilds`、
`bg-setwm` 和 `bg-setcm` 的 `otherScene`，使用 paired Symbols package 中同一个
ImgNumber dependency，在 exact `Mult` slot 显示 `xN`。initial spin 与 refill
的动画前落定 scene 优先级固定为
`bg-gencm > bg-genwm > bg-spin/bg-refill`，每个落定 step 最多允许一个 CM。
`bg-genco.scene` 是 WM/CM 转 CN 后、CO collection 前的最终盘面；其中新增 CO
会在 initial spin/refill 落定前 overlay，不能在 multiplier transform 末尾突然出现。

如果上一步有中奖 WL，服务器在下一 cascade step 的 `bg-dropdown` 后、
`bg-refill` 前通过 `bg-incwl.otherScene` 将其值加一。客户端跨 step 关联中奖 WL，
在本次 refill 落定后先更新 WL 并播放一次 WL `Start`，随后才处理当前 WM。WM 同批并行执行
`Mult_Start -> Mult_Idle(一个真实 loop) -> Mult_End -> Change`；进入
`Mult_Idle` 时按 `bg-updwl` 同时更新全部 WL。盘面没有 WL 时仍完整播放 WM 流程，
只跳过 WL 更新。

WM `Change` 完成后才按 `bg-wm2cn` 原位置原子替换 CN，并用
`bg-genwmcn.otherScene` 设置中间 CN value。若当前有 CM，随后播放 CM
`Feature1`；`bg-updcn.otherScene` 将当时全部 CN（包含 WM 新生成的 CN）更新为
原值乘 CM multiplier，并同时播放 CN `Feature_Change`。最后播放 CM `Change`，
按 `bg-cm2cn` 原位置替换为 CN，并使用 `bg-gencmcn.otherScene` 的新 CN value。
CM 流程完成后才进入现有中奖/cascade；没有 CM 时不制造空阶段。

若当前 `bg-win` 有实际 result，它始终优先走原中奖/remove。否则
`bg-triggerco` 命中 CO 后，客户端严格编译 `bg-co.pos` 的分段 transfer：
CO `Feature` 与 source `Feature1` 并行，完成后 source 播放 `Feature2` 并携带
value presentation 移到 CO 八邻域 target；整批提交后 source 成为 BN、CO 变为
selected symbol。随后 `bg-win2` 走既有金额/中奖流程，`bg-bn` 只在 remove 完成
边界 release，不生成零金额 carousel group。

各 multiplier component 只读取当前操作所需的目标 symbol cell，非目标 cell
保留给服务器其它用途且不参与该 component 的语义校验；目标 multiplier、WM sum、
CM 乘法、矩阵尺寸和 occurrence continuity 都在画面 mutation 前严格校验。

## FreeGame

一次 `playSpin(logic)` 只启动一份 `SlotOperationPlanV2`。BaseGame operations、
multiplier/CO transform payload 与 `game002:freegame@2` 由同一个 coordinator 持有；
FreeGame 不再在 BaseGame Promise 完成后启动第二份 playback contract。transform payload
已拆成 WL increment、WM、WM→CN、CM、CM→CN、CO 的 strict 最小 evidence union，Target
不再用 stepIndex 查询 presentation batch，也没有 mutable payload cache。游戏侧 compiler 在进入 coordinator 前形成
`wl-increment`、`wild-multiplier-presentation`、`wm-to-cn`、`coin-multiplier`、`cm-to-cn` 与
`co-collect` exact operations；缺席阶段不生成 operation，每个实际 visual commit 后才推进。

运行时 stage 只挂完整 Scene Layout package root。package runtime 按 manifest order/placement
拥有唯一 main reel，首次 `defaultScene` commit 前保持 deferred/uncommitted；cascade 通过 main-reel
overlay attach API 借用接入。background、reel、transition、popup 不再由 app 用 `worldLayer` 手工排序。

包含 `bg-triggerfg` 的 round 会在表现开始前完整编译 BaseGame 尾段和全部 FreeGame
step。trigger 必须是无其它 `bg-win/bg-win2` 赔付的 type-5 WL result；先播放 WL
`win`，再走 Layout 的 `BaseGame -> FreeGame` transition，转场前后复用同一 reel 和
同一触发 scene。

每次 `fg-spin` 只释放并滚动当前 scene 中非 WL、非 CN 的格子，WL/CN occurrence
与 value 保持不动。落定后严格按 `AF -> CO` 处理：AF 从 `fg-rollaf.number` 显示
不带 `x` 的免费次数，依次播放 `Feature/Change` 后变 CN；CO 只从 post-AF scene
的 WL/CN 搬运完整 occurrence/value，source 变 BN、CO 变 CN。`fg-start` 的当前
次数和剩余次数必须逐步连续，AF number 必须计入同一步剩余次数。

只有末次 spin 的 `fg-win` 可以赔付，且只接受 type-6 CN group。它复用 CN collect
但不 remove，随后等待 BigWin popup 真正完成，再走 `FreeGame -> BaseGame`
transition；回到 BaseGame 后仍显示 FreeGame 最终 scene。

## bg-win 消除级联

`bg-spin/bg-genwm/bg-gencm/bg-genco/bg-gencoins/bg-win/bg-triggerco/bg-co/bg-win2/bg-bn/bg-remove/bg-respin/bg-dropdown/bg-refill` 是 game002 app-owned 映射，只有 `historyComponents` 对应的 `step.hasComponent()` 才代表触发；`historyComponentsEx` 和 map 中的空组件不触发。adapter 预解析全部 steps 后，严格执行初始 spin、逐组 emphasis/win/remove、普通局 dropdown/refill unified fall，或期待局 existing-only dropdown -> refill-hole Nearwin2 sweep -> selective refill spin；任一结构漂移都在启动画面前失败。

每个 result 的全部 `pos` 会在主转轮停稳后按 manifest presentation 执行。现有单组现金 overlay 与底部临时汇总都严格使用 `cashWin64 !== undefined ? cashWin64 : cashWin`；汇总要求 result cash 为 positive safe integer cents，并复用 `formatServerUsdAmount` 除以 `100` 显示。不能从 bet、lines、component total 或 `totalwin` 推导。`bg-win.basicComponentData.cashWin/coinWin` 只在字段存在时作为累计协议证据，不能替代 result 权威字段。

普通 symbol 与 WL 在 manifest 配置 `order=0/group/groupAmount`，CN 配置 `order=1/sequentialCollect/itemAmount`；因此服务器 `usedResults` 即使把 CN 放在前面，实际播放仍稳定为全部普通组后再 coin group，同 order 内保持服务器相对顺序。普通组请求 win 的同一边界把该 result cash cents 用 `0.35s` 计数加入 summary，动画和计数都完成后才 remove。coin group 先让全部 CN 同时 `Win_Start`，完成后全部进入 `Win` loop，再按 `y`、后 `x` 的屏幕行优先顺序逐枚 `Collect`；四档 CN 官方动画均为 `Collect=0.3333333s`、`End=0.5s`，相邻 Collect 固定按 `0.3s` 起播间隔推进，并在 cadence 边界立即中断当前 CN 自己的 `Win` loop 开始 `Collect`，不再等待多个 CN 的同步 loop boundary 而成组起播。前一枚 Collect 尚未结束时下一枚已经起播，End/release 也不阻塞后续 Collect，允许尾段重叠。未轮到的 CN 保持 Win loop，每枚 CN 只有真实 resolved state 进入 collect 后才按 `itemCoin/groupCoin * groupCash` 把精确 cents 加入 summary；自身 Collect 完成后仍正常播放 End，End 完成后 release 消失。逐格 coin value 总和必须精确等于 result coin amount，cash 份额不能整除时显式失败。参与 coin 判定的 WL 只与 CN start 同播自身 win，之后回 normal，不进入 collect/remove。

summary 是 cascade container 内的 Pixi Text，位置从 reel layer 尺寸派生为 `(boardWidth/2, boardHeight+36)`，样式为 `48/900/#fff7d6/#5a2500/6`。值为 0 时完全隐藏；跨普通组、coin、fall 和后续 step 保留累计，全部 cascade 完成后在 global cash win-amount 启动前清零隐藏。单组 cash overlay、临时 cash summary 与最终 global cash amount 使用相同 cents formatter，但生命周期各自独立。

金额锚点先计算所有中奖格中心的算术平均点，再从本组实际中奖格中选择最近的一格；等距时按 `x`、再按 `y` 升序。所有组金额立即同时显示，并以 `0.5` 同时压暗全部中奖坐标之外的格子黑层与 symbol 本体。完整强调段为 `1.2s`：`0.1s` 渐暗、`1s` 保持、`0.1s` 渐亮；压暗开始的同一边界即并行启动全部中奖 symbol 的 opening win。普通组直接播放 `win`；CN 组先全部播放 `Win_Start`，完成后进入 `Win` loop，批准的 WL companion 同时播放自身 `win`。强调结束后按稳定组顺序等待已启动的 win 完成并依次 remove，不重播 opening win。game002 通过函数向 rendercore 声明 `WL` 既不 remove 也不 drop，rendercore 不硬编码 wild。WL 仍参与所在组的中奖高亮与 win；manifest 为 WL 声明最高 `renderPriority: 1`，其它下落 symbol 可从它后面经过。

未激活期待时，dropdown 与 refill 仍合并为一次 rendercore fall：幸存 occurrence 和新增 symbol 同时从上向下移动，不进入 spin/appear 流程。已激活期待时，每个 cascade step 先只搬运既有 occurrence 到带 hole 的 dropdown scene；随后按 `y desc/x asc`、`80ms` 起播间隔在 hole 上预扫一次 Nearwin2，等待最后一个真实 loop completion；最后只让 empty hole 使用本地公开轮带 selective spin。selective spin 从最左侧有 hole 列的最下 hole 起步，以“列内向上序号 + 有 hole 的列从左向右序号”作为 wave index：起点先动，下一层的起点上方与下一列最下 hole 同时动，再逐层向右上扩散；同一层共享 `16ms` start group 边界，Nearwin1 与 landing 的稳定顺序按 wave、层内从左向右推进，cadence 为 `100ms`。每格在 landing 前约 `0.6666667s` 起播 Nearwin1 并真实播放 1 次，播放完立即落地；整体 `settleAfterLastStartMs=800`，新 symbol 继续走 manifest appear。两条路径都保留整板 mask、WL fixed/renderPriority、CN value/occurrence continuity；期待 selective spin 不重启 survivor player。refill 新增 CN 时必须使用当前 step `bg-gencoins` 的服务端值，不能随机覆盖。

`bg-remove`、`bg-dropdown` 和 `bg-refill` 的 `usedOtherScenes` 都遵守服务端 delta 语义：矩阵没有独立变化时允许省略。remove value holes 从权威 remove scene 与 source occurrence 推导；dropdown value 搬运由 rendercore 通用 occurrence 算法推导；refill intermediate otherScene 只在存在时校验尺寸。服务器若提供任一矩阵，仍必须最多一份并通过完整一致性校验。只有 refill 新增 CN 这种无法从旧 occurrence 推导的新 raw value，才要求 `bg-gencoins` 提供 otherScene。

dropdown 请求仍是通用 symbol state，但 `RenderSymbol` 会比较切换前后实际动画的 continuity key。底层 Spine/VNI 资源与 playback 完全相同时只更新状态语义，保留当前 player 和时间轴，不 reset/replay；因此 CN 的 normal `Loop` 进入 dropdown `Loop` 时持续播放，其它 normal/dropdown 相同的动画也自动获得相同行为。动画名、资源、transform 或 playback 不同则照常切换；reset、value/tier 变化仍强制重建，不能误复用旧时间轴。

组件、索引、pos、金额或 geometry 非法时在转轮启动前显式失败。game002 只提供组件名、金额 resolver、formatter/style 和可见 symbol target；组件 result 解析、symbol 状态、Pixi 金额 renderer、确定性 anchor 与轮播生命周期由 rendercore 拥有。

## 开发与发布

真实 renderer 的本地资源 smoke 可打开
`/visual-fixture.html`；该入口使用正式
package prepare、adapter、公开本地轮带与 Pixi/Spine ticker，但不连接 live，也不进入
production build。它只能证明资源、geometry、mask、background、symbol 和 resize
装配；期待/cascade/CN collect/popup 仍由自动化 fixture 与真实 live 分开验收。

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
pnpm --filter game002 format
pnpm --filter game002 lint
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
pnpm --filter game002 release:check
```

生产产物在 `apps/game002/dist/`。`release:check` 除既有背景、symbol、effect 和 win-amount 合同外，还逐档校验 CN tier skeleton/slot、nested image-string v1 exact source closure、glyph decoded size 与 source/dist 字节；并断言旧完整值图片不进入 dist。所有 glyph texture 在 loading 99% 前闭合，100% 后才创建 player/framework/Pixi。

常见显式失败包括：query 缺失/重复/非法、已移除的 `skin` 或 `serverUrl`、资源或 loading closure 缺项、manifest unknown field/路径/尺寸/focus/state/transition 非法、Spine 非 4.3、atlas page/texture/animation 不匹配、并发背景切换、scene 不是 `6 x 9`、未知 symbol、金额输入非法、最终可见 scene 不一致、live/collect 失败。不得切换到静态背景、首帧、mock、旧资源、placeholder、BN 兜底或 Spine 4.2/3.8 fallback。
