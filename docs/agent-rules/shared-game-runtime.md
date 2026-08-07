# Shared game runtime rules

本文件适用于 `packages/logiccore`、`packages/rendercore`、`packages/gameframeworks`、`packages/uiframeworks` 及消费这些能力的游戏 app。

## 依赖与职责

- `packages/gameframeworks` 是后续游戏默认 facade，整合 UI、网络、logic 数据流和 production scene-layout API。
- `packages/logiccore` 只拥有通用 server round/component/result/otherScenes 解析、strict selector/generator、mutation reducer 和不可变 `SlotOperationPlanV2` finalizer；业务 component、symbol、金额语义与最终排列由 app 注入。
- operation kind/version/effect、source evidence、state-mutation occurrence closure 和 plan final closure
  必须由 logiccore strict compiler/finalizer 证明。正式 server source 与本地
  snapshot-authored source 不得互相 fallback；本地 suggestion 只存在于独立
  `slotoperationauthoring` package。
- 所有配置驱动 round 必须在任何画面 mutation 前完整编译。component role、remove/drop/value/sequential companion policy 只能来自 strict versioned profile，并按 active symbol package 大小写精确校验。
- settled transform 的跨格 relocation 必须显式保存 source occurrence identity、
  overwritten target 与 source replacement；release-only win positions 只加入 holes
  和 release IDs，不得伪造金额组。grid-cell transfer 由 rendercore 以整批
  prepare/start/commit/rollback/destroy transaction 承担。
- relocation 输出 occurrence 必须按不可变 input occurrence 定位槽位，不得按已经
  被前序 target 改写的 output id 再查找；source/target 坐标遍历顺序不能改变结果。
- `packages/rendercore` 的实例级 operation registry/coordinator 是 standard/grid-cell、
  base/cascade 的共享编排入口。必须在 next-spin cleanup 与首次 mutation 前预检完整 plan；
  handler 按 prepare/start/update/commit/rollback/destroy 生命周期执行，不使用进程级 registry、
  kind alias 或首项 fallback。
- registry 必须精确注册 kind/version/effect；scene landing 与 state mutation commit 后校验
  output snapshot，presentation 不读取或提交不存在的 output。
- settled 后、中奖前的业务转换必须由 logiccore 的中性 immutable transform step
  和 rendercore 的 capability phase 显式表达；共享层只校验 occurrence
  code/value continuity 与 prepare/commit/rollback，不认识业务 symbol、component
  或动画名。没有 transform 的 consumer trace 保持不变。
- symbol package 到 reel registry 的 catalog/value-controller 适配属于 rendercore；
  game app 不从 package bytes 重建 asset 表。完整 package runtime 必须拥有唯一 root/reel、manifest
  placement/order 与 overlay attachment；确实只消费 layout/background/popup 且不需要 package main reel 的
  consumer 才使用 rendercore presentation surface，不复制 scene-layout visibility、placement
  或 popup lifecycle。需要 mode transition 时，surface 必须委托 package runtime 的
  prepare/request/event/switch/settle 状态机并公开独立 transition container。
- 游戏 app 只保留业务 component/value/result resolver、formatter、layout、anticipation 和 typed extension；不得复制 Pixi、Spine、reel、cascade 或 popup 状态机。

## Reel 与 server 数据边界

- 客户端 spin 始终使用本地公开轮带。服务器 scene 只覆盖本轮临时 strip 的可见落点窗口；scene 无法反查本地 stop 时不得失败。
- 不读取、缓存、输出或推断服务器真实轮带，也不消费服务器 randomNumbers 作为本地视觉随机源。
- 测试服 `lstrand` 只能由 gameframeworks 的显式 opt-in、instance-scoped
  console contract 覆盖下一次实际发出的 spin；消费后立即清除，不持久化、不自动
  重放，也不得驱动本地公开轮带、reel phase 或其它 presentation random。
- `otherScenes` 是变化数据：业务 component 触发但 auxiliary matrix 未变化时可以没有 update。logiccore 不强制每个 component 恰好一份，app 负责区分可推导省略和不可推导的新值。
- `renderPriority` 只允许非负安全整数，默认 `0`；只影响 Pixi display order，不改变 scene、stop、result、state、金额或点击逻辑。同优先级保持默认稳定顺序。

## Symbol、Spine 与 image-string

- symbol manifest parser、animation resolver、VNI/official Spine adapter、resource closure、player lifecycle、裁切和 pooling 属于 rendercore。
- composite symbol state 的 base 可见性、underlay/overlay 稳定顺序、每 leaf 独立 player ownership、共享 once/loop completion barrier 与幂等 destroy 属于 rendercore；app/editor 不直接操作其 display tree 或补写时序。
- symbol 状态完成边界由 rendercore 的 awaitable playback API 表达，宿主 ticker 仍逐帧调用 update 推进。app 不轮询 loop/once completion counter；批量播放必须先完整预检，AbortSignal、reset、回池、destroy 或外部状态取代必须拒绝未完成等待。
- 通用 symbol state texture versioned preset 与 DOM-free RGBA transform 属于
  rendercore；Node 生成器和纯前端 editor 必须消费同一参数来源。browser image codec、
  用户选择和 filename-key transaction 留在 editor，不得把用户资源发送到服务端。
- app/viewer 只能传 manifest、显式 modules、resolver 和 validator；禁止根据 symbol code 写共享分支或直接操作 player/display tree。
- official Spine Pixi runtime 当前只支持 `4.3.x`。atlas、skeleton、animation 名和版本大小写精确校验；不得恢复 3.8/4.2 adapter 或手写兼容层。
- normal/win/appear 共享相同 Spine resource 时复用 player，只切换语义 animation；资源、value/tier 或 symbol 真实变化时才按合同重建。
- image-string parser、Unicode code-point layout、glyph exact closure、natural/fixed advance、动态 `visualBounds` anchor 和 `setText()` 生命周期属于 rendercore。缺 glyph、slot、resource 或 binding 显式失败，不回退字体、占位图、glob 或路径猜测。
- value presentation 使用 strict `font | image | image-string` union；新 image-string 每 tier 声明 normal JSON resource及可选explicit non-Spine `spinBlur` profile，并共享 Normal slot/transform/color/special配置；旧per-tier完整binding继续兼容。profile必须与normal layout/special集合一致，package在mutation前prepare exact closure；每occurrence复用稳定外层container，同tier改值只`setText()`，state切换只切profile和slot/overlay attachment。
- 新 image-string logical node 用一个 `spineSlot` 覆盖全部 top-level Spine state，非 Spine state 仍使用唯一 exact `{state}` target；旧逐 Spine state `{state,slot}` 保持兼容且不扩大覆盖。
- requested state 因 equivalence 解析到 normal、但自身有显式 state texture 时，ImgNumber attachment 使用 requested presentation state；shared `spineSlot` 只允许 attach 到 prepared Spine state，late init 不得覆盖 exact non-Spine direct overlay。回到 Spine state 前先同步 attachment 资格，同一 renderer/container 保持连续。
- 命名node的显式`spinBlurProfile`必须与normal ImgNumber布局和special value集合一致；package在画面mutation前prepare两套共享资源，occurrence只保留一个renderer/container并在state边界切换assets。runtime不得解码、生成或按state创建第二个ImgNumber instance；旧无profile target保持既有normal-assets语义。
- image-string 特殊值整图映射属于 manifest-owned strict sparse config；exact 命中显示整图，未命中继续 glyph layout，二者复用 node transform/anchor/target 与资源生命周期；
  runtime 只挂载当前 resolved state 的目标，同一 renderer/text identity 跨 state
  保持连续。旧单 `target` 只在 parser 边界规范化，canonical 输出使用 `targets`。

## Background、viewport 与 UI

- rendercore 拥有通用 art-size、focus-rect、visible viewport、background manifest/resource resolver、Spine state machine 和完整 art clip 算法；app 只配置 art、focus、resource 和显式 state。
- 宿主已经统一承担 viewport/focus transform 时，scene-layout presentation surface 必须使用完整 authored art space（原点 `0,0`）；不得在背景内部再次执行 maximized-focus 偏移。
- `packages/uiframeworks`/`gameframeworks` 拥有 DOM frame、canvas 逻辑尺寸上限、黑边居中和 viewport resize policy；app 不以私有 CSS/DOM resize 绕过。
- background、symbol 和 popup 复用官方 runtime、manual update、completion 和 destroy 底层；不得增加静态图、首帧或默认 animation fallback。

## Presentation

- rendercore 拥有通用 symbol win carousel、金额递增、big/super/mega tier、segmented VNI 播放、popup threshold sequence、完整 canvas/keyboard 输入绑定、advance/dismiss/end drain，以及普通 Spine popup 的 start→loop→end 边界状态机和 runtime snapshot。Scene Layout transition prelude 只能编排该 public player；app/editor 只提供宿主 input target，不复制点击分派、latch 或 loop/end 边界。
- popup 系统文字的单行/NFC 校验、字号/颜色/渐变/描边/投影/grapheme 弧排、显式 package 字体 FontFace hash 复用/释放及 image/ImgNumber/Spine/VNI overlay 生命周期属于 rendercore；普通 Spine prompt 缺省使用 `system-ui/sans-serif`，系统字体不建模为 package 资源。游戏通过 player 的 exact name 或各 kind 零基 index handle 原子 set/reset string；legacy prompt 仍可由 `start(text?)` 传入已翻译 string，省略时使用 manifest 默认值。
- component 名、amount resolver、formatter、样式和业务阻塞边界由 app 传入；shared code 不维护游戏专属金额或 symbol 规则。
- win-amount 进入 `awaiting-dismiss` 后不得继续阻塞 `playSpin()`；下一次 spin 负责清理遗留展示。
- reel runtime 在金额或 popup 播放期间仍需逐帧 update，不能冻结 active Spine/VNI loop。

## Scene layout 与生成配置

- rendercore 拥有 strict scene-layout manifest parsing、exact asset closure、named-node attachment、focus/reel geometry、variant application、mode-aware visibility 和 production runtime。
- scene-layout 普通 node 的 optional exact mode scope 缺失时表示全局；runtime 的 init、真实 transition switch 和 editor authoring stable selection 必须复用同一 visibility commit。authoring selection 不得伪装成 production transition，且相同 Symbols binding 不重建 reel/player/sample。
- `SceneLayoutPackageResource.loadRuntimeResource(key, kind)` 是包内程序资源的 typed async prepare 边界；同 key 并发请求复用同一 Promise，kind/未知 key 精确失败，`getLoadedRuntimeResource` 只返回已成功 prepare 的资源。
- package runtime 稳定图层 id 仅为 `layout | reel | transition | popup`；`getLayer()` 和 `getNode()` 返回 borrowed container，调用方不得 destroy 或改写内部层级。presentation-only runtime 请求 `reel` 显式失败。
- scene-layout node、main reel 与 Popup binding order 必须是全局唯一安全整数；Popup order 必须高于全部 art/reel order，并在当前 scene 的 `popup` layer 内排序。旧单 Popup v1 缺少 order 时规范化为 `2000`，多个缺省 Popup 的重复值显式失败。
- `gamelayoutpkgcli` 为每个 runtime resource 输出独立增量组，未请求程序资源不得并入 initial/shared。
- `columnGap`/`rowGap` 等 manifest geometry 必须一致作用于 standard/grid-cell reel、mask、effect、cascade 和 geometry snapshot。
- 游戏静态 YAML 只承载可发布的美术和静态配置，不承载 token、cookie、服务器真实轮带或本轮下注。
- YAML 保留中文注释说明字段用途和坐标基准；注释不作为构建逻辑。
- `game-static.generated.ts`、`game-loading.generated.ts` 等生成物由对应构建工具生成，修改 YAML 后同步生成并执行 `--check`。
