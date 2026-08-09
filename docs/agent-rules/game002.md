# game002 rules

本文件保存 game002 专属业务和 presentation 合同。通用 reel、symbol、Spine、scene-layout 和 coordinator 规则同时遵守 `shared-game-runtime.md`。

## game002v2 精简实现

- `apps/game002v2` 是从 Scene Layout package runtime 直接编排的精简实现；它读取
  server step 后直接调用 spin、Symbols state、mode transition 和 Popup API，不生成
  facts/draft/plan/payload，不使用 mutation contract、operation registry 或 rollback。
- v2 只把 `assets/crave/assets.map.json` 当 logical key 到 physical path 的路由表；运行时
  不读取或比对 sha256、byteLength、content-addressed filename，也不因 404 orphan 阻断。
  实际被 Scene Layout/Symbols/Popup 引用的资源缺失时由对应 runtime 自然失败。
- 背景、Symbols 内部动画绑定、FreeGame 有向转场和 Popup 流程全部由 Gamelayout package
  拥有。v2 只保留业务 component 到 semantic Symbols state 的调用顺序；不得直接操作
  Spine/VNI player 或 display tree。
- Nearwin 是唯一 app-owned landing rule，但表现仍请求 Symbols 的 `Reel_NearWin` state；
  app 不直接选择或播放底层 animation。
- v2 的 initial grid-cell spin 通过 rendercore 的 typed spin-plan stage function 注入业务暗度和
  第 2 枚 WL activation；未注入 function 的游戏保持 rendercore 默认行为。package runtime
  暴露真实 landing/activation edge，v2 不复制 reel update loop。
- v2 的 `defaultScene` CN presentation value 必须从 active Symbols package 的 exact
  `bgcoinweight` 独立加权抽取；稳定 occurrence 缓存和无偏抽样属于 rendercore，v2 只选择
  CN code 与权重表。active package 必须由 rendercore 的 initial Symbol package resource 接口
  从同一 Crave layout package 解析，app 不自行遍历 binding 或读取额外资源。缺 CN、缺表或
  非法权重/random 必须失败，不回退 manifest default value。
- v2 采用 fail-stop：异步调用失败立即结束本轮并上报，不回滚已经完成的画面变化。
- v2 在业务事实确定后直接请求对应 Symbols state，不在执行 edge 反向查询 capability 或静默跳过；
  state/resource 无法播放时由实际 render request 原位失败。landing/final scene 只来自明确候选
  component，不回退 step 的泛化 scenes。
- cascade plan 的 target presentation values 对同 code carried occurrence 继承当前值，再由本 step
  明确 otherScene 覆盖；refill 新 occurrence 不继承 hole。rendercore 保留 occurrence identity，并在
  fall 完成边界采用 plan target value，不重新验证业务 value closure。

## 固定入口和资源

- game002 只有一个 Scene Layout package，不提供 skin 选择；URL 传入 `skin` 即
  显式失败。运行时固定读取 CDN 上 `assets/crave` 的解包目录，按 manifest/map
  加载文件，不下载或在浏览器解压 ZIP。layout、background、focus、grid geometry、
  symbols、公开本地轮带、transition 和 award popup 只从该包取得。
- 解包目录不得生成逐文件 TypeScript `?url` import。Vite dev/build 与 CDN 均原样
  提供 package root；替换编辑器导出后，loading 从 `assets.map.json` 的 physical
  path 动态生成去重 URL。不存在的 orphan physical path 可延迟到实际引用时失败，
  不得让过期生成源码在 Vite import-analysis 阶段阻断。
- `assets/crave` 的当前美术 files/bytes 是 game002 权威交付；game runtime/build
  天然不比对 map `sha256`/`byteLength`、不因未引用 entry/file 阻断，不依赖 app
  传 policy 才关闭 integrity gate。实际引用的 logical key 仍必须路由到安全存在的
  path，并通过对应资源 parser/decoder；不猜测未声明资源。
- `apps/game002/config/reel-presentation.manifest.json` 只保存 game002 转轮时序和 Nearwin 程序资源键；Nearwin1/2 是 app 唯一显式 prepare 的美术资源，只来自 `assets/crave` 并通过 typed runtime-resource API 加载。其它 layout/presentation/transition/popup 由 Scene Layout package 直接驱动；未请求的 Nearwin3 不 prepare。
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
- 非期待 initial spin 中 WL/CN/WM/CM/CO 全亮，其它实际滚动 occurrence 压暗。第 2 个按真实 landing order 落地的 paytable-exact WL 在同一边界打开 anticipation gate；从该边界起只有 WL 全亮，其它实际滚动 occurrence（包括 CN/WM/CM/CO）压暗。
- v2 以任务 185 选出的最后完整 landing scene 建 plan；不在本地公开轮带中的 WM/CM/CO
  只经 rendercore 的目标 cell 临时 landing window 注入，完成后不得写入或反推公开轮带。
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

- 同一 server response 的 BaseGame 与 FreeGame 必须属于同一 `SlotOperationPlanV2` 和同一
  coordinator execution。不得在 BaseGame completion Promise 后再启动第二份 round plan；
  FreeGame 必须展开为 trigger、transition、spin、AF、CO、win、popup 等显式 operation；不得
  重新封装为一个内部推进全部阶段的 opaque operation。render 直接认可 logiccore 生成的 plan，
  不再预检整轮业务公式、final closure、scene shape 或资源能力；画面变化时只检查当前 operation
  当前坐标的 `context.input`/`operation.output` continuity。

- game002 spin flow 使用 fail-stop、无 rollback 模型。所有权威 scene/value mutation 必须位于对应
  animation 完成边界；调用链任一步失败立即停止当前 round、禁止继续
  后续 operation 或下一次 spin，并交由显式重新初始化/重新同步恢复。cleanup 只取消 pending playback、
  handler wait 和临时资源，不恢复 operation 开始前的 snapshot。未参与当前 operation 的额外 server field、component
  或 matrix cell 不作为失败条件；当前 operation 必需的数据缺失、越界或类型非法仍
  显式失败。只有显式声明为 best-effort 且不改变 scene/value 的装饰效果允许跳过。

- `bg-triggerfg` 只接受没有其它 BaseGame 赔付的 type-5 WL result；WL win once
  完成后才进入 Layout transition，转场不得重建 reel 或替换触发 scene。
- `fg-spin` 的视觉 mask 从 committed scene 的非 WL/CN 格派生；服务器 scene 只
  提供本步可见落点，`fg-spin.pos` 只作为 feature result set。
- 每步顺序固定为 `spin -> AF -> CO`。AF number 只取 `fg-rollaf.number`，以 raw
  digits 显示并计入 `fg-start.lastRespinNum`；AF Change 完成才提交 AF -> CN。
- FG CO 将 `fg-triggerco` 坐标作为 `mainPos`，将 `fg-vortex.pos` 四元组作为 routes，
  source、target、CO 的 code/value 直接取 `context.input`/`operation.output`，不在 render 中重算业务规则。
  app 异步调用 rendercore transfer，资源租约在调用结束时内部回池。
- 只有剩余次数为 0 的最后一步允许 `fg-win`，且只赔付 type-6 CN group；collect
  不 remove，BigWin complete 后才反向 transition，最终 scene 跨模式保留。

## WL/WM/CM multiplier 与中奖前转换

- WL/WM/CM/CO 的权威新 code/value 只保存在对应 `operation.output`，前态由 coordinator 通过
  `context.input` 提供；Target 不按
  stepIndex 查询 presentation batch。每个 operation 由一个直接的异步调用链表达动画、
  延迟和画面提交；提交边界与粒度由该 render program 决定，并在失败时进入统一 fail-stop。
- WL/WM/CM/CO 共用一个 `SlotChgOperation` 类型，只按坐标关系使用 `pos`、
  `mainPos + pos` 或 `mainPos + routes`。具体 operation key 挂接对应 render program，
  payload 不得加入 WL/WM/CM/CO 字段或 `phase` 分流。multiplier compiler 不得维护
  stepIndex payload cache；game002 自己组合 Promise/await 调用链，不引入通用 transaction runner。
- game002 stage 只挂完整 Scene Layout package root；package runtime 拥有唯一 main reel 与 manifest order/placement，defaultScene commit 前保持 deferred，cascade 只经 typed overlay attach 接入。
- game002 compiler 直接生成按需出现的 `game002:wl-increment`、
  `game002:wild-multiplier`、`game002:wm-to-cn`、`game002:coin-multiplier`、
  `game002:cm-to-cn`、`game002:co-collect` operations；不得先生成 aggregate
  transform 再由 runtime 拆 phase。缺席阶段不得生成 operation；WM 已触发但没有
  WL 数值变化时仍生成 output 与前态相同、`pos` 为空的 keyed change operation。

- initial spin 和 refill 的动画前落定 scene 只从当前 step 已触发的
  `bg-spin`/`bg-refill`、`bg-genwm`、`bg-gencm`、`bg-genco` 中，按 server
  `historyComponents` 选择最后触发组件的唯一完整 scene。`bg-spin` 与
  `bg-refill` 在同一 step 必须互斥并作为各自流程的 base scene。app 不再合并
  WM/CM scene 或 overlay CO；后续 value hydration、transform、win/remove 均基于该
  server 完整 scene。
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
- `Change` 完成边界才应用 `bg-wm2cn.scene` 的原位置 WM -> CN replacement，
  新 CN value 只取 `bg-genwmcn.otherScene`；动画或 mutation 失败必须停止当前 round，
  不继续执行后续 operation。
- WM 全流程完成后才处理 CM。CM 先播放 `Feature1` once；随后每个受影响 CN 都执行
  自己的 `Feature_Change` await 链，并在该格动画完成后立刻按 `bg-updcn.otherScene`
  更新该格值。各格调用链可以并行，也可按明确 presentation 时序插入 delay；不得做全盘复核。
- 全部 CN `Feature_Change` 完成后播放 CM `Change` once；完成边界才按
  `bg-cm2cn.scene` 原子提交该 CM -> CN，且新 CN value 只取
  `bg-gencmcn.otherScene`。CM 全流程完成后才允许开始中奖；无 CM 时不得制造空阶段。
- `bg-win` 有实际 result 时优先走原中奖流程，不启动 CO。没有 `bg-win` result
  且 `bg-triggerco` 命中 CO 时，将命中的 CO 坐标作为 `mainPos`，并把
  `bg-co.pos` 按 source/target 四元组解析为 routes；`-1` 只作为段分隔符，客户端
  不再证明每段数量、八邻域归属或跨组件业务公式。
- CO `feature` 与全部 source `feature1` 同时播放；全部真实 once 完成后 source
  播放 `feature2`，完整 occurrence（含 value/image-string）在 board mask 内移到
  target。source、target 和 CO 的 output code 直接采用服务器 `bg-co.scene`；target
  value 继承 source input，CO 转为 value symbol 时只读取
  `bg-cogencn.otherScene` 对应 `mainPos`，非 value symbol 的 presentation value 为 null。
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

## game002v2 selective 与期待模式

- game002v2 的 `fg-spin` 以每次输入 scene 为准保留 WL/CN occurrence，只选择其它格
  spin；held code/value 必须与 server 完整 target 原位一致，不允许静默退回 full spin。
- game002v2 的期待模式业务状态和 component 解释留在 app；真实 effect、dropdown-only、
  effect sweep、selective refill、started edge、player update 与 terminal remove transaction
  只调用 rendercore typed API，不在 app 复制 player/state machine。
- Nearwin1/2 只从 Crave Scene Layout runtime resource exact key 加载，并消费
  `apps/game002/config/reel-presentation.manifest.json` 的唯一 timing/effect 配置；未使用的
  Nearwin3 不加载。WL 是当前 remove retained 业务 predicate，rendercore 不认识 WL。

## Win carousel

- game002 正中奖 component 顺序是 app-owned `bg-win,bg-win2`；`bg-bn` 仅是
  release-only result role。
- rendercore carousel 按 component 数组和各自 `usedResults` 顺序驱动 symbol win、金额 anchor、首轮阻塞、lingering 和下一 spin cleanup。
- 单组金额只使用 result 的 `cashWin64/cashWin` 字段存在性选择；不以 truthy、component total 或 totalwin 兜底。
