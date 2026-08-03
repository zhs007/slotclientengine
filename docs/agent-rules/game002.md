# game002 rules

本文件保存 game002 专属业务和 presentation 合同。通用 reel、symbol、Spine、scene-layout 和 coordinator 规则同时遵守 `shared-game-runtime.md`。

## 固定入口和资源

- 只支持严格的 `skin=2`，固定映射 `assets/crave` 的完整 mapped scene-layout
  package；layout、background、focus、grid geometry、symbols、公开本地轮带和
  award popup 只从该包的 manifest/map 取得。`skin=1|3|4|5`、缺失、重复、`01`
  和未知值显式失败，不保留 alias 或默认值。
- `apps/game002/config/reel-presentation.manifest.json` 只保存 game002 转轮时序和程序资源键；Nearwin1/2 的资源只来自 `assets/crave`，通过 typed runtime-resource API 显式 prepare，未请求的 Nearwin3 不 prepare。
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
- CN text 按 active Crave symbols manifest 使用 `image-string`，绑定真实 `coin`
  slot；tier/resource/glyph 均不得复用或回退。
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

## FreeGame

- `bg-triggerfg` 只接受没有其它 BaseGame 赔付的 type-5 WL result；WL win once
  完成后才进入 Layout transition，转场不得重建 reel 或替换触发 scene。
- `fg-spin` 的视觉 mask 从 committed scene 的非 WL/CN 格派生；服务器 scene 只
  提供本步可见落点，`fg-spin.pos` 只作为 feature result set。
- 每步顺序固定为 `spin -> AF -> CO`。AF number 只取 `fg-rollaf.number`，以 raw
  digits 显示并计入 `fg-start.lastRespinNum`；AF Change 完成才提交 AF -> CN。
- FG CO source 只允许 post-AF scene 中的 WL/CN，并复用 rendercore relocation
  transaction；source 变 BN、target 接收 occurrence/value、CO 变 CN。
- 只有剩余次数为 0 的最后一步允许 `fg-win`，且只赔付 type-6 CN group；collect
  不 remove，BigWin complete 后才反向 transition，最终 scene 跨模式保留。

## WL/WM/CM multiplier 与中奖前转换

- initial spin 和 refill 的动画前落定 scene 先按
  `bg-gencm > bg-genwm > bg-spin/bg-refill` 合成 multiplier 输入，再把
  `bg-genco` 中新增 CO overlay 到落定盘面；CO 不得在 transform 末尾凭空出现。
  `bg-genco` 仍是 WM/CM 后、CO collection 前的权威完整盘面。
- `bg-genwilds`、`bg-setwm` 和 `bg-setcm` 的 component-scoped `otherScene`
  分别给新 WL/WM/CM 提供 positive safe integer multiplier；每个 settled step
  最多一个 CM，值随 occurrence dropdown/refill 搬运。
- multiplier component 只读取当前操作目标 symbol cell；同一 `otherScene`
  的其它 cell 由服务器保留作其它用途，不得按当前 component 的零值合同拒绝。
- spin 和每次 refill 都必须等全部 symbol 落定后再处理 multiplier，且 transform
  完成后才允许进入该 settled snapshot 对应的中奖流程。
- 上一步参与中奖的 WL 由下一 cascade step 中、`bg-dropdown` 后且 `bg-refill`
  前的 `bg-incwl.otherScene` 权威加一。客户端跨 step 关联中奖 WL，等该 refill
  全部落定后先更新 multiplier 并播放 WL 的 `Start` once；随后才处理当前 WM。
  没有当前 WM 时，WL Start 完成后 transform 直接结束。
- 当前 WM 存在时，`bg-updwl.otherScene` 必须把每个 WL 更新为其当前值加本批全部
  WM multiplier 之和。盘面没有 WL 时仍完整处理 WM，只有 WL 更新阶段为空。
- 同批 WM 并行执行 `Mult_Start` once、`Mult_Idle` 一个真实 loop、`Mult_End`
  once、`Change` once；进入 `Mult_Idle` 时提交全部 WL multiplier 显示更新。
- `Change` 完成边界才原子提交 `bg-wm2cn.scene` 的原位置 WM -> CN replacement，
  新 CN value 只取 `bg-genwmcn.otherScene`；prepare 或动画失败必须 rollback，
  不得重建无关 symbol。
- WM 全流程提交完成后才处理 CM。CM 先播放 `Feature1` once；完成边界按
  `bg-updcn.otherScene` 将当时全部 CN（包含本批 WM 新转出的 CN）严格更新为
  当前值乘唯一 CM multiplier，并同步播放 CN `Feature_Change` once。
- 全部 CN `Feature_Change` 完成后播放 CM `Change` once；完成边界才按
  `bg-cm2cn.scene` 原子提交该 CM -> CN，且新 CN value 只取
  `bg-gencmcn.otherScene`。CM 全流程完成后才允许开始中奖；无 CM 时不得制造空阶段。
- `bg-win` 有实际 result 时优先走原中奖流程，不启动 CO。没有 `bg-win` result
  且 `bg-triggerco` 命中 CO 时，严格解析 `bg-co.pos` 的 `-1` 分段和 4..8 个
  source/target 四元组；target 必须是该 CO 的八邻域，多 CO 必须全批 disjoint。
- CO `feature` 与全部 source `feature1` 同时播放；全部真实 once 完成后 source
  播放 `feature2`，完整 occurrence（含 value/image-string）在 board mask 内移到
  target。全批完成后原子提交 source->BN、target<-source、CO->selected symbol。
  `bg-co.otherScene` 只校验 vortex 搬运后的中间 value；CO 转为 value symbol 的
  新 value 必须从后续 `bg-cogencn.otherScene` 取得并校验最终完整矩阵；转为
  非 value symbol 时该 CO 格的生成数值不进入 presentation value。
  `bg-win2` 进入普通中奖，`bg-bn` 只作为 release-only holes，不参与金额或 carousel。
- WL/WM/CM multiplier 共用 paired Symbols package 的唯一 ImgNumber dependency，
  formatter 为 exact `x${value}`，Spine slot 为 exact `Mult`；不得使用 `Multi`
  alias、CN digits、字体或路径猜测。

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

- game002 正中奖 component 顺序是 app-owned `bg-win,bg-win2`；`bg-bn` 仅是
  release-only result role。
- rendercore carousel 按 component 数组和各自 `usedResults` 顺序驱动 symbol win、金额 anchor、首轮阻塞、lingering 和下一 spin cleanup。
- 单组金额只使用 result 的 `cashWin64/cashWin` 字段存在性选择；不以 truthy、component total 或 totalwin 兜底。
