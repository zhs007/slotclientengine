# Shared game runtime rules

本文件适用于 `packages/logiccore`、`packages/rendercore`、`packages/gameframeworks`、`packages/uiframeworks` 及消费这些能力的游戏 app。

## 依赖与职责

- `packages/gameframeworks` 是后续游戏默认 facade，整合 UI、网络、logic 数据流和 production scene-layout API。
- `packages/logiccore` 只拥有通用 server round/component/result/otherScenes 解析、strict selector/generator、scene/value output 校验和不可变 `SlotOperationPlanV2` finalizer；业务 component、symbol、金额语义与渲染提交粒度由 app 注入。logiccore 不提供通用画面 mutation DSL 或 renderer identity。
- 已展开为 JSON 的 protobuf component 可由 logiccore 按 exact type 与通用字段 shape 提供 name-parameterized readonly query；shared parser 不限制业务 component 名、value 枚举、队列长度或跨 response 关系，也不猜测/解码 binary Any。
- operation kind/version/effect、source evidence、state output 和 plan final closure
  必须由 logiccore strict compiler/finalizer 证明。正式 server source 与本地
  snapshot-authored source 不得互相 fallback；本地 suggestion 只存在于独立
  `slotoperationauthoring` package。
- 结构相同的业务变化统一使用 logiccore `SlotChgOperation`/`genChg`：普通变化只保存
  `pos`，驱动变化保存 `mainPos + pos`，跨格转移保存 `mainPos + routes`。operation
  kind 选择具体 render program；payload 不得重复保存业务 symbol 名、output code/value
  或第二份 changes。前态由 coordinator 作为 `context.input` 提供；只有动画驱动者时允许
  `pos` 为空且 output 与前态相同。
- 所有配置驱动 round 必须在任何画面 mutation 前完整编译。component role、remove/drop/value/sequential companion policy 只能来自 strict versioned profile，并按 active symbol package 大小写精确校验。
- settled transform 的跨格变化在 operation payload 只保存 source/target 坐标关系；
  overwritten target 与 source replacement 从 `context.input` 和 `operation.output` 读取。
  release-only win positions 只加入 holes 和 release IDs，不得伪造金额组。grid-cell transfer 的租约、临时 display 与回池由
  rendercore 内部拥有，对 app 只暴露一次异步调用；Promise settle 或 abort 后必须释放。
- rendercore 内部 relocation 必须按操作开始时的不可变坐标快照定位槽位，不得按已经
  被前序 target 改写的显示对象再查找；source/target 坐标遍历顺序不能改变结果。
- `packages/rendercore` 的实例级 operation registry/coordinator 是 standard/grid-cell、
  base/cascade 的共享编排入口。coordinator 直接接受 logiccore 已编译、已验证的 immutable plan，
  精确按 kind/version 调用单一异步 `start`；handler 可在调用链中等待动画、帧或延迟，不再拥有
  preflight/prepare/update/commit/rollback/destroy 生命周期，也不使用进程级 registry、kind alias
  或首项 fallback。coordinator 在每个非 presentation operation 成功后保存其 output，并把它作为
  下一 handler 的 `context.input`；plan 不重复携带 input。
- render handler 自己决定动画边界、逐格或批量提交，直接执行 finalizer/producer 已证明的
  operation output、movement 和 value commit，不再对 `context.input`/`operation.output` 做 scene/code/value
  continuity 复核。Promise 成功后推进下一 operation；失败后立即
  fail-stop 并取消 pending playback，不倒放已经完成的动画或 mutation。
- settled 后、中奖前的业务转换必须由 logiccore 的中性 immutable output operation
  和 app-owned 异步调用链显式表达；renderer 只消费显式 output code/value，
  不读取显示前态反向验证业务连续性，共享层不认识业务 symbol、component 或动画名。没有 transform 的 consumer
  trace 保持不变。
- remove/dropdown/refill 的 held、hole closure、occurrence relation、carried value 和 target value
  必须在 logiccore compiler 或 direct consumer 调用前确定。rendercore cascade plan 只保存 render-ready
  movement、value commit、尺寸和时序，不保存用于复核的 source/settled/target matrix，也不接收业务 predicate。
- symbol package 到 reel registry 的 catalog/value-controller 适配属于 rendercore；
  game app 不从 package bytes 重建 asset 表。完整 package runtime 必须拥有唯一 root/reel、manifest
  placement/order 与 overlay attachment；确实只消费 layout/background/popup 且不需要 package main reel 的
  consumer 才使用 rendercore presentation surface，不复制 scene-layout visibility、placement
  或 popup lifecycle。需要 mode transition 时，surface 必须委托 package runtime 的
  prepare/request/event/switch/settle 状态机并公开独立 transition container。
- operation handler 和游戏取得 symbol 时只使用具体区域实例的 `SymbolArea.getSymbol(pos)`；
  standard reel、legacy grid-cell 和新 CellSpin 必须返回同一 `SymbolHandle` 合同。facade 捕获 exact
  occurrence；hole 返回 exact Empty SymbolHandle，未落地、leased、replacement/release 后 stale 必须失败，不得按坐标重绑或暴露
  pooled SymbolPlayer/display tree。borrowed reel symbol 禁止 destroy，owned clone 由创建者 destroy。
- 新逐格转使用无 public plan 的 CellSpin `roll/start/settle/cancel` 原子接口；full、selective、hold、
  refill、stagger 和 anticipation 由 operation handler 以 frame delay、Promise 与明确业务事实编排。
  不新增 CellSpinPlan/RefillPlan 或 renderer 业务 predicate。game002v2 的 GridCellReelSpinPlan 仅为
  legacy compatibility，新能力不得继续扩展该 surface。
- 新普通转使用无 public plan 的 ReelSpin `roll/start/settle/cancel` 逐列原子接口；不同列并发、
  full/held/stagger/barrier 由 operation handler 以 frame delay 和 Promise 编排。落停 Promise resolve 时
  整列 `getSymbol()` 必须可用。standard legacy batch façade只能复用同一 RenderReel 单轴运动 owner，
  不得复制另一套 motion/pool/player 状态机。
- standard 与 legacy grid-cell 的 `RenderReel` 在 rolling 阶段只能用每个 slot 稳定持有的轻量
  Sprite 显示 registry 解析后的 rolling texture；不得为经过的轮带 code 构造、初始化或 update
  完整 `SymbolPlayer`。target-aware start/settle 只提前准备最终可见 occurrence；official
  Spine、VNI 或 value display 未 ready 时保持最终 rolling frame，全部 ready 后才提交 settled
  occurrence。stopped buffer 不持有完整 symbol；rolling Sprite 不属于 `SymbolHandle`，不能被
  state、value、clone、cascade 或 transfer API 操作。
- 带 valuePresentation 的 lightweight rolling view 必须使用游戏注入的 presentation-value resolver
  取得中间随机值，并按 manifest value tier 显示对应轻量 image-string resource；不得创建 tier
  Spine。随机 occurrence cache 必须有界。显式 target scene 中的 value symbol 必须同时提供最终
  non-null value；最终 rolling frame 与 settled commit 只能使用该值，不得回退随机/default value。
  完整 `SymbolPlayer` 必须在离屏 prepare 时写入最终 value，并在 value resource ready 且挂载前
  复核；禁止先把完整 symbol 挂到可见树，再把 rolling/random value 改成最终 value。
- standard ReelArea 与 Crave legacy grid-cell 的共同 PresentableSymbolArea 拥有
  `bottom < symbols < top < win` 图层及 game-owned await presentation；standard ReelArea 额外拥有 area-local
  point anchor 与最高优先级 area.spin。游戏决定 idle/win 等循环内容，但不接触 interruption signal；spin
  必须在内部中断当前 presentation、清理 transient win layer并以 immediate spinBlur 接管 occurrence，再调用
  默认或typed game spin function。`present(..., { repeat: true })` 在首轮 callback 完成后 resolve并由 area 继续后台
  重复，operation handler 不得为 lingering loop 自建 deferred Promise 或 `while(true)`。symbols 主层、raw Container
  和完整geometry不向游戏开放。
- SymbolArea统一拥有按settled position替换式设置/清除symbol dimming的能力；standard ReelArea、CellSpin与legacy grid-cell
  必须保持同一`dimmed positions + alpha`合同，具体tint/overlay表现由各自reel owner实现。旧highlighted positions接口只作
  configured round与legacy grid-cell兼容，不作为新游戏入口。
- RenderCore第一层的opaque `RenderObjectLayer`统一area、Scene顶层和exact named node attachment；保留既有add/remove并增加
  layer-local anchor/resolve与原子aligned add，不公开world coordinate、raw Container或Matrix。RenderCore第二层只组合第一层对象：PresentationScope拥有临时node的mount/withNode、明确detach/destroy ownership、repeat
  child scope和interruption cleanup；opaque RenderAnchor负责Symbol/Group/area point/named Scene node坐标转换；SymbolGroup
  批量state/play必须先完整preflight。generic motion只作用于受exact owner clock/lease保护的RenderObject或owned clone，
  在同一manual-clock transaction中支持position、`[0,1]` opacity、x/y scale、clockwise degree rotation及多属性并行；
  position复用line/cubic path，所有属性共享duration/easing。它不取得盘面commit；游戏仍用普通for/await/Promise.all，
  不新增presentation/motion plan或业务DSL。
- RenderObject是Container-backed的opaque public capability，不继承或公开raw Pixi Container。whole Symbol、普通文字及
  symbol value/text part统一使用clone/getAnchor/mount/transfer；part只通过strict `{kind:"value"}`或
  `{kind:"text",name}`取得，不猜唯一node、不在value/text间fallback。盘面Symbol/part为borrowed，只有owned clone可transfer或destroy。
- 带object-owned playback update的RenderObject只在挂载到registered layer或attachment后继承该owner clock；remove/detach暂停驱动，重新挂载后继续，destroy必须解绑。borrowed reel Symbol仍只由reel owner驱动，临时换层不得取得第二个update clock；游戏不手动调用或注册update。
- 确需数值坐标时，`ReelArea.resolveAnchor()`只把有效RenderAnchor解析为该area本地RenderPoint；不开放world coordinate、raw
  Container或Matrix。解析结果是调用时快照，长期presentation/motion继续持有Anchor并在使用时转换，不缓存跨transform坐标。
- standard ReelSpin、CellSpin与legacy grid-cell统一提供与occurrence解耦的稳定cell-center Anchor；它在rolling/部分落停期间可解析，
  settled后与同格Symbol中心一致。rolling `getSymbol()`、stale occurrence与leased Symbol仍显式失败。
- game runtime的program Spine/VNI RenderObject可显式`play(...,{loop:true})`；Promise在首圈完成后resolve且循环继续，直到stop、supersede或destroy。
  detached owned RenderObject只可按exact Spine slot通过opaque attachment绑定，不猜slot/root且不转移destroy ownership。RenderObject局部opacity/rotation/scale可通过strict opaque setter或同一motion capability修改；fade只缓动opacity，不改visible，旋转使用不归一化的顺时针度数，负scale表示对应轴镜像。direct setter、新motion、abort、detach、owner interruption与destroy必须确定性cancel/reject旧transaction且不泄漏；Spine attachment不解释或改写child transform。
- registered RenderObjectLayer可原子移动已挂载RenderObject并保持视觉原点；settled borrowed Symbol临时换层必须在spin、replacement、release或destroy前由reel owner恢复，
  不公开symbols主层、raw Container、world coordinate或直接zIndex。
- area spin通用factory只装配column order与stagger并调用逐列ReelSpin；不得接受业务predicate、matrix command或state名。
- RenderCore相关API按职责分为三层：第一层提供渲染对象与原子动作，第二层负责玩法无关的ownership、坐标、时钟、批量一致性和中断组合，
  第三层才解释Win/Coin/Wild/Free等玩法结构。第三层默认位于gameframeworks或等价recipes/template模块，必须允许游戏随时回落到第二层或
  `SymbolArea.getSymbol()`，不得成为唯一入口、复制renderer状态机或在RenderCore重建gameplay plan。
- `CellSpin`是新grid玩法的正式owner，提供settled mutation、active session、direct transfer/drop；`-1`是CellSpin和grid-cell唯一hole
  标记，其它symbol code非负。Crave仍消费grid-cell期间，相同基础能力同步到grid-cell但不得扩展grid-cell独有高级接口；迁移完成后停止维护。
  新direct/session API复用既有reel/pool/ticker owner，不接受gameplay plan或暴露prepared/manual-progress lifecycle；game002v2旧surface保持兼容。
- 游戏 app 只保留业务 component/value/result resolver、formatter、layout、anticipation 和 typed extension；不得复制 Pixi、Spine、reel、cascade 或 popup 状态机。
- shared package 测试必须使用包内自包含的最小数据验证 parser、binding、player 和 lifecycle
  合同，不得读取任一游戏的 `assets/` 美术交付。只校验当前 Gamelayout 文件、bytes、
  manifest/map 闭包或动画清单的测试不属于 shared package；美术交付作为 Gamelayout
  权威输入，由实际 loading/runtime 消费边界按引用解析并显式失败。

## Reel 与 server 数据边界

- 客户端 spin 始终使用本地公开轮带。服务器 scene 只覆盖本轮临时 strip 的可见落点窗口；scene 无法反查本地 stop 时不得失败。
- 请求发出后的无目标预转由 gameframeworks 的 paired adapter hook 启动和取消，连续滚动与响应后
  落停由 rendercore 拥有。预转阶段只能使用本地公开轮带；服务器目标只能在 settle 边界注入。
  standard 与 grid-cell reel presentation 必须复用同一 Scene Layout start/settle/cancel ownership；
  standard 不接受 positions/dimming 等 grid-cell-only 参数，也不得复制 app-owned continuous 状态机。
  每个请求只有一个 continuous transaction，由响应内第一个 landing 消费；同一响应后续 FG/refill
  使用普通 target-aware presentation，不重新等待或预转。失败 cleanup 必须只取消一次并 fail-stop。
- standard ReelSpin 的跨列 targetless start 可由同步 hook 同帧逐列调用；response landing cadence 留在
  operation handler 的 frame delay。consumer 必须传递完整受控 elapsed delta，由 rendercore 内部切片，
  不得通过 clamp 丢弃长帧时间或轮询完成状态。
- grid-cell targetless pre-roll 必须复用 manifest timing 的 stable start group cadence；响应早于全部格启动时，
  pending cell 保留剩余 cadence 后进入 target-aware spin。落点 appear immediate 进入，不等待刚 reset 的
  stable loop boundary；低 FPS ticker 必须分片消费完整受控 elapsed delta，不得通过截断单帧时间拉长业务等待。
- 不读取、缓存、输出或推断服务器真实轮带，也不消费服务器 randomNumbers 作为本地视觉随机源。
- 测试服 `lstrand` 只能由 gameframeworks 的显式 opt-in、instance-scoped
  console contract 覆盖下一次实际发出的 spin；消费后立即清除，不持久化、不自动
  重放，也不得驱动本地公开轮带、reel phase 或其它 presentation random。
- `otherScenes` 是变化数据：业务 component 触发但 auxiliary matrix 未变化时可以没有 update。logiccore 不强制每个 component 恰好一份，app 负责区分可推导省略和不可推导的新值。
- `renderPriority` 只允许非负安全整数，默认 `0`；只影响 Pixi display order，不改变 scene、stop、result、state、金额或点击逻辑。同优先级保持默认稳定顺序。
- stopped reel 的不可见 buffer slot 不解析公开轮带 code 或 presentation value，也不向游戏 resolver 索值；只有实际可见或正在滚动的 value symbol 才执行严格非 null 校验。

## Symbol、Spine 与 image-string

- symbol manifest parser、animation resolver、VNI/official Spine adapter、resource closure、player lifecycle、裁切和 pooling 属于 rendercore。
- symbol-state-textures manifest v2 的 `settings.stateDefinitions` 是 once 完成行为的唯一来源；once 必须显式声明 return-to-default 或 terminal，stable 禁止完成行为。合法 v1 只在 rendercore 加载 upgrader中按 exact remove 迁移为 terminal，其它 once 迁移为 return-to-default；runtime、editor preview 和 game 不得保留 state-name fallback。
- 单个完整 SymbolPlayer 的 asset binding 创建后不可变；状态切换与回池必须优先复用其稳定 Sprite、
  ImgNumber renderer 及按实际 resource identity 缓存的 Spine/VNI player。value tier 变化只重绑
  ImgNumber resource/profile、geometry 和 slot，不得仅因 tier index 变化重建 renderer；回池只清
  value、playback、attachment 等 mutable 状态，缓存只在 SymbolPlayer 真正 destroy 时销毁。不同
  occurrence 的 mutable player/renderer 不得共享。
- composite symbol state 的 base 可见性、underlay/overlay 稳定顺序、每 leaf 独立 player ownership、共享 once/loop completion barrier 与幂等 destroy 属于 rendercore；app/editor 不直接操作其 display tree 或补写时序。
- symbol 状态完成边界由 rendercore 的 awaitable playback API 表达，宿主 ticker 仍逐帧调用 update 推进。app 不轮询 loop/once completion counter；批量播放必须先完整预检，AbortSignal、reset、回池、destroy 或外部状态取代必须拒绝未完成等待。
- grid-cell 的 symbol 状态 batch 必须按目标 cell 的 occurrence ownership 预检；部分 spin、cascade drop 或 effect sweep 不得全局封锁未受影响的 `landed/completed` occupied cell。目标 cell 仍在 waiting/spinning、为空或 occurrence 已被移动流程取走时必须显式拒绝，且 batch 不得部分启动。
- 通用 symbol state texture versioned preset 与 DOM-free RGBA transform 属于
  rendercore；Node 生成器和纯前端 editor 必须消费同一参数来源。browser image codec、
  用户选择和 filename-key transaction 留在 editor，不得把用户资源发送到服务端。
- app/viewer 只能传 manifest、显式 modules、resolver 和 validator；禁止根据 symbol code 写共享分支或直接操作 player/display tree。
- official Spine Pixi runtime 当前只支持 `4.3.x`。atlas、skeleton、animation 名和版本大小写精确校验；不得恢复 3.8/4.2 adapter 或手写兼容层。
- normal/win/appear 共享相同 Spine resource 时复用 player，只切换语义 animation；资源、value/tier 或 symbol 真实变化时才按合同重建。
- image-string parser、Unicode code-point layout、glyph exact closure、natural/fixed advance、动态 `visualBounds` anchor 和 `setText()` 生命周期属于 rendercore。缺 glyph、slot、resource 或 binding 显式失败，不回退字体、占位图、glob 或路径猜测。
- image-string public contract 固定拆为 data/core/editor：game runtime 与 rendercore presentation 只能依赖 data + core，不得依赖 editor package/map/materializer；core 的 mutation 热路径不得物化完整 occurrence snapshot，Sprite spare pool 必须有界，setText/setResource 必须先完成布局再提交。
- symbol命名image-string node的`initialText`只属于authoring preview，不是production业务value；正式游戏通过exact node name显式setText，或在package/runtime装配时显式注册`symbol -> exact node -> synchronous formatter`，由同一presentation value事务原子同步value tier与多个命名node。formatter不得进入manifest，runtime不得猜唯一node、业务前缀或默认格式；resolver仍只负责选择occurrence number。clone/anchor不得按唯一node或symbol业务名猜测。数字飞行只移动owned display clone，不自动提交目标value。
- value presentation 使用 strict `font | image | image-string` union；新 image-string 每 tier 声明 normal JSON resource及可选explicit non-Spine `spinBlur` profile，并共享 Normal slot/transform/color/special配置；旧per-tier完整binding继续兼容。profile必须与normal layout/special集合一致，package在mutation前prepare exact closure；每occurrence复用稳定外层container，同tier改值只`setText()`，state切换只切profile和slot/overlay attachment。
- 新 image-string logical node 用一个 `spineSlot` 覆盖全部 top-level Spine state，非 Spine state 仍使用唯一 exact `{state}` target；旧逐 Spine state `{state,slot}` 保持兼容且不扩大覆盖。
- requested state 因 equivalence 解析到 normal、但自身有显式 state texture 时，ImgNumber attachment 使用 requested presentation state；shared `spineSlot` 只允许 attach 到 prepared Spine state，late init 不得覆盖 exact non-Spine direct overlay。回到 Spine state 前先同步 attachment 资格，同一 renderer/container 保持连续。
- 命名node的显式`spinBlurProfile`必须与normal ImgNumber布局和special value集合一致；package在画面mutation前prepare两套共享资源，occurrence只保留一个renderer/container并在state边界切换assets。runtime不得解码、生成或按state创建第二个ImgNumber instance；旧无profile target保持既有normal-assets语义。
- image-string 特殊值整图映射属于 manifest-owned strict sparse config；exact 命中显示整图，未命中继续 glyph layout，二者复用 node transform/anchor/target 与资源生命周期；
  runtime 只挂载当前 resolved state 的目标，同一 renderer/text identity 跨 state
  保持连续。旧单 `target` 只在 parser 边界规范化，canonical 输出使用 `targets`。

## Background、viewport 与 UI

- rendercore 拥有通用 art-size、focus-rect、visible viewport、background manifest/resource resolver、Spine state machine 和完整 art clip 算法；app 只配置 art、focus、resource 和显式 state。
- artSize 只描述背景 art，focusRect 只描述适配重点区域；两者及 reel authored rect 不要求互相包含。RenderCore 不以越出 art 为配置错误，viewport 可扩展到 art 外并把未覆盖、裁切或不可见的实际结果交给 editor/runtime 呈现。
- Scene Layout mode切换可改变adaptation类型与active variants；target geometry/background/reel/presentation必须在同一commit边界生效，失败保持source snapshot和稳定render façade。正方形viewport保持现有方向，首次正方形为landscape。
- 宿主已经统一承担 viewport/focus transform 时，scene-layout presentation surface 必须使用完整 authored art space（原点 `0,0`）；不得在背景内部再次执行 maximized-focus 偏移。
- `packages/uiframeworks`/`gameframeworks` 拥有 DOM frame、canvas 逻辑尺寸上限、黑边居中和 viewport resize policy；app 不以私有 CSS/DOM resize 绕过。
- background、symbol 和 popup 复用官方 runtime、manual update、completion 和 destroy 底层；不得增加静态图、首帧或默认 animation fallback。

## Presentation

- rendercore 拥有通用 symbol win carousel、金额递增、big/super/mega tier、segmented VNI 播放、popup threshold sequence、完整 canvas/keyboard 输入绑定、advance/dismiss/end drain，以及普通 Spine popup 的 start→loop→end 状态机。Award advance 在 bigwin 前跳到 bigwin 或最终值，进入 bigwin 后每次只跳一个实际可达档位；共享 ImgNumber、formatted amount 与 active tier 必须在同一同步边界提交，不能出现新档位配旧金额。Popup 固定为 `data → core → editor`：gameframeworks、Scene Layout 与游戏只依赖 data/core，mapped package与完整snapshot只属于editor wrapper；所有 consumer 默认把任一受支持 source version strict规范化为latest，未知未来版本失败。每个领域只维护一份 canonical runtime state：游戏 Runtime 只开放命令、标量 query 与 edge drain，完整 snapshot 只由复用同一 Runtime 的 editor/diagnostic wrapper 生成；不得为 editor 与 game 复制状态机或把 mutable hot-path buffer 暴露为 public API。普通 Spine Popup 的 start点击忽略且不锁存，loop点击立即进入end，end点击忽略。Scene Layout transition prelude 只能编排 public Runtime；app/editor 只提供宿主 input target，不复制点击分派或状态边界。
- Popup player 是主 Pixi display tree 中的普通 Container 节点；rendercore 不为 Popup 创建独立 Application、canvas、Renderer、ticker 或 RAF。只有 Popup Editor 的独立预览页面可创建自己的预览 canvas，再挂载同一个 player Container。Popup v2 保留有限 design viewport 适配；v3–v7 不保存 design viewport，由 shared 无界 maximized-focus 以 focus 几何中心按 page aspect 扩展 visible rect。全屏 backdrop 始终覆盖宿主 viewport，不随 authored content focus transform 缩放；v6/v7 award layer 由 containing tier 决定可见性。
- Popup v4–v7 Spine-slot attachment graph、exact slot prepare、DAG/per-parent order 与一 slot 一稳定 owner group 属于 rendercore；同 slot 多 child 按 layer order 排序并保留局部 transform，跨 slot 顺序继续由 skeleton draw order 决定。award tier 切换必须先撤销旧 attachment/可见提交再挂新状态，旧效果不得在新档背后显示。
- popup 字体文字的单行/NFC 校验、字号/颜色/渐变/描边/投影/grapheme 弧排、显式 package 字体 FontFace hash 复用/释放及 image/ImgNumber/Spine/VNI overlay 生命周期属于 rendercore；省略 font resource 才使用 `system-ui/sans-serif`，系统字体不建模为 package 资源。游戏优先通过 player 的 exact name handle 原子 set/reset string；legacy prompt 仍可由 `start(text?)` 传入已翻译 string，省略时使用 manifest 默认值，但新 v5 authoring 不生成 prompt。
- Scene Layout transition prelude 的本轮 text/manual ImgNumber 最终 string 可由游戏随 `requestGameMode()` 按 kind + exact name提交；rendercore在Popup start前应用，并在complete、失败、取消或destroy后恢复调用前handle状态。翻译、金额formatter和长期persistent override仍由游戏拥有。
- component 名、amount resolver、formatter、样式和业务阻塞边界由 app 传入；shared code 不维护游戏专属金额或 symbol 规则。
- award win-amount 到达最终金额后必须立即进入 `dismissing`，播放最后实际到达档位的 end 并在 drain 完成后自动关闭；不得停在需要额外输入的 final hold。显式 `requestDismiss()` 同样先提交最终金额，再启动正式 end/drain。
- reel runtime 在金额或 popup 播放期间仍需逐帧 update，不能冻结 active Spine/VNI loop。
- grid-cell full/selective spin 活跃期间，rendercore 必须在每个 timeline slice 恰好推进一次
  所有 occupied cell 的 symbol player，包括 waiting、已落地/完成和未选 held cell；hole
  不推进，app 不补 ticker 或逐格 update。
- terminal remove/release 属于 rendercore：上游必须传入最终 remove positions，rendercore
  整批 preflight exact state/animation 后让每个 occurrence 在自身 once completion 边界直接
  同步 release，不插入 normal，也不以 Promise continuation 提交画面 mutation。retained symbol 规则由 logiccore compiler 或 app 在调用前解析，
  rendercore 不接收 retained predicate，也不返回业务 removed/retained 分类。

## Scene layout 与生成配置

- Scene Layout public contract 固定拆为 `scene-layout/data → scene-layout/core → scene-layout/editor`：data 只拥有 versioned schema、latest normalization、allocation 和纯 geometry/reference；core 只拥有 production resolved-resource/runtime/presentation，并由宿主 ticker 推进；editor 只包装 mapped ZIP、authoring/standalone viewer 与复用同一 core 的 inspector。禁止恢复旧 `./scene-layout` 混合入口或 root Scene Layout wildcard。
- 游戏、gameframeworks production facade 使用 data/core，稳定帧和业务判断优先使用标量 query 与 edge drain，不物化完整 diagnostic snapshot。完整 mode/award snapshot、独立 Application/canvas/ticker/RAF 只属于 editor inspector/standalone viewer；editor wrapper 不复制 runtime 状态机。只做纯 manifest/reference rewrite 的工具使用 data；需要验证/materialize mapped production ZIP 的 CLI 属于 editor package adapter。
- rendercore 拥有 strict scene-layout manifest parsing、exact asset closure、named-node attachment、focus/reel geometry、variant application、mode-aware visibility 和 production runtime。
- Scene Layout package resource必须在RenderCore内把合法v1–v3直接规范化为latest v4并确定性生成缺失的`runtimeAllocation`与空音频合同；不得要求先经Editor重导。package runtime只执行strict `runtimeManifest` v4，原生v4 allocation与typed mode/node/Symbols/Popup/transition/runtime-resource/audio引用不一致时显式失败，Editor只导出完整v4。
- `audiocore` 固定按 `data → core → editor` 分层：data 拥有 versioned audio schema/reference，core 拥有 host-clock runtime 与 owner-scoped backend，editor 只包装导入/表单/试听。游戏经 Scene Layout/gameframeworks facade 使用音频，不取得 mutable `@pixi/sound` 实例或全局 cache。
- effect 延迟、loop、voice bound 与 BGM keep/duck/pause 由同一 runtime 合同执行；focus 只在 effect 真正开始后持有，完成、stop、error、cancel、rollback、destroy 全部释放。BGM 按 mode 可选、恒 loop，并在成功 mode commit 后 crossfade。
- scene-layout init 可并发 prepare 相互独立的 node、reel/Symbol/effect 和 popup 资源，但必须等待所有
  已启动 prepare 收敛后处理失败/cleanup，并只在全部成功后按 manifest/order 确定性 commit 到 display tree。
- scene-layout package runtime按exact Symbols binding持有package-lifetime reel entry；active entry独占update和业务API，dormant entry保留已提交scene但不tick。跨mode返回不得释放重建；只有显式`recreateReel`或package destroy可替换/销毁，main reel overlay和render layer随active entry稳定重挂。
- scene-layout 普通 node 的 optional exact mode scope 缺失时表示全局；runtime 的 init、真实 transition switch 和 editor authoring stable selection 必须复用同一 visibility commit。authoring selection 不得伪装成 production transition，且相同 Symbols binding 不重建 reel/player/sample。
- `SceneLayoutPackageResource.loadRuntimeResource(key, kind)` 是包内程序资源的 typed async prepare 边界；同 key 并发请求复用同一 Promise，kind/未知 key 按 canonical runtime manifest 精确失败，lazy initial layout view 不作为程序键目录；`getLoadedRuntimeResource` 只返回已成功 prepare 的资源。
- package runtime 的canonical `getRenderLayer(ref)`统一解析稳定`layout|reel|transition|popup`、area `<id>.bottom|top|win`、canonical exact node及显式`node:<legacyId>`；底层仍委托各自唯一owner，不合并lifecycle或display parent。返回opaque安全attachment façade，presentation-only请求`reel`/area显式失败。既有
  `getLayer()`和`getNode()` borrowed container seam为host/editor兼容保留，调用方不得destroy或改写内部层级，不强制旧consumer迁移。
- authored scene node只能通过`getRenderObject(exactId)`取得kind-discriminated borrowed capability；placement/destroy仍由Scene Layout拥有，program visibility只能与mode/variant可见性做AND。程序对象只通过exact runtime resource factory创建并由caller拥有，两者不得按同名互相fallback。
- authored non-state-machine Spine 的程序播放只接受 exact animation，并复用 Scene Layout 唯一 update/completion drain；once、首圈 loop、abort、stop、supersede 与 destroy 边界必须收敛。caller-owned detached RenderObject 可按 exact slot 批量绑定，失败恢复原 attachment，detach/child destroy/runtime destroy 清理关系且不转移 child ownership；state-machine node 不得绕过 `requestState()`。
- Game Layout production对象统一通过owner-first `gamelayout:/` runtime address定位；地址只从canonical manifest及nested owner identity派生，不写回manifest，不允许JSON Pointer、filename/path/hash、alias或raw display/audio fallback。package runtime只公开可枚举descriptor、strict kind endpoint与bind/wait事件；Spine transition event必须复用唯一official update drain并在target scene提交后派发，BGM lifecycle必须对应backend instance真实start及fade-out stop。
- Scene Layout 顶层`popups`是三类Popup的programmatic导出目录，不要求mode/transition直接引用。production普通请求通过exact owner address调用`enqueuePopup`，programmatic、mode award和transition prelude进入同一FIFO且任一时刻只有一个active Popup；当前项完整关闭后才启动下一项，不替换或叠加。`openPopup`只保留为显式fail-fast立即入口。每个session拥有identity-safe close/cancel与presented/finished边界，stale session不得关闭后来项。每个binding只缓存一个package-owned player，关闭后复用；同一package runtime全部Popup共用一个runtime-owned backdrop display object，并按active manifest更新，caller不持有或destroy raw player/backdrop。
- package-level layout variant event 必须来自成功提交后的 snapshot diff；首次 apply、同 variant resize 与失败 apply 不派发，detail 只携带 previous/current variant identity，不把 raw window resize 当作 variant commit。
- Gamelayout authored point由Scene Layout按当前snapshot和configured origin统一换算；logical viewport不是CSS/device viewport。跨parent只通过opaque Anchor和target-local解析，不向app公开world point、Matrix或visual bounds。SymbolGroup只可读取input-order odd middle、members/bounds center与稳定cell footprint，不能从当前display bounds推导业务rect。
- scene-layout node、main reel 与 Popup binding order 必须是全局唯一安全整数；Popup order 必须高于全部 art/reel order，并在当前 scene 的 `popup` layer 内排序。旧单 Popup v1 缺少 order 时规范化为 `2000`，多个缺省 Popup 的重复值显式失败。
- `gamelayoutpkgcli` 为每个 runtime resource 输出独立增量组，未请求程序资源不得并入 initial/shared。
- `columnGap`/`rowGap` 等 manifest geometry 必须一致作用于 standard/grid-cell reel、mask、effect、cascade 和 geometry snapshot。
- 游戏静态 YAML 只承载可发布的美术和静态配置，不承载 token、cookie、服务器真实轮带或本轮下注。
- YAML 保留中文注释说明字段用途和坐标基准；注释不作为构建逻辑。
- `game-static.generated.ts`、`game-loading.generated.ts` 等生成物由对应构建工具生成，修改 YAML 后同步生成并执行 `--check`。

## Symbols public boundary

Symbols 能力只从 `@slotclientengine/rendercore/symbol/data|core|editor` 按职责导入；禁止恢复旧 `./symbol` 混合入口或 root symbol wildcard。游戏 runtime、reel、Scene Layout 和 gameframeworks 使用 data/core，内部 mutable Pixi occurrence 为 `SymbolPlayer` 且不得作为 game API 导出；`SymbolArea` 对游戏暴露的 borrowed/owned/empty capability 统一为 `SymbolHandle`。
