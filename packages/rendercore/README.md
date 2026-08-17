# @slotclientengine/rendercore

Editor materialization 使用格式 owner 的结构化边界。四个 Editor 的新 package 在
manifest 中只引用扁平 filename key，并由根 `assets.map.json` 解析到完整 SHA-256
payload；image-string、Popup、Symbols、Scene Layout 的 ZIP、Blob 与 URL loader 共用
同一 map validator。父 package 已验证全局 map 后使用 resolved-files bridge 组装 nested
resource，不要求内层第二份 map。无 map 的合法 legacy direct path 继续加载，但 map/direct
不得混用，也不提供 basename、404 或 glob fallback。

`rendercore` 是 slot 前端渲染核心库。它基于 `pixi.js` v8、复用 `@slotclientengine/pixiani` 的基础显示对象生命周期，并复用 `@slotclientengine/logiccore` 的 game config/paytable 契约。`apps/symbolsviewer` 和 `apps/reelsviewer` 是调试 app，业务展示逻辑不放进核心库。

## Reel rolling 与 settled occurrence

`RenderReel` 的每个 buffer slot 固定拥有一个轻量 rolling Sprite。reel 处于
`starting | spinning | settling` 时只替换该 Sprite 的 registry texture、scale 和
render priority；不会为滚动途中经过的 code 创建 `SymbolPlayer`，snapshot 中此时
`mode="rolling"`、`symbol=null`。Sprite 只是内部滚动视觉，不是可操作的
`SymbolHandle`。

带 `valuePresentation` 的 rolling symbol 还会消费游戏注入的
`presentationValueResolver`。每个 slot 按 `symbol code + value tier` 有界缓存轻量
image-string view，同 tier 只更新文字，跨 tier 切换对应 manifest resource；不会创建 tier
Spine。`createWeightedGridCellPresentationValueResolver()` 默认按 cell 保留最近 32 个
occurrence，保证当前滚动值稳定且不会随 continuous `symbolY` 永久增长。游戏负责选择权重表和
随机源；RenderCore 不猜业务值。

有明确 target 的 start/settle 会在离屏位置为最终可见非空 occurrence 各准备一个完整
`SymbolPlayer`。相邻相同 code 仍是独立 occurrence，并分别保存 presentation value。
一旦显式传入 target scene，任何带 `valuePresentation` 的 target 都必须同时传入非 null 的
target value；最终 rolling frame 和 settled occurrence 都只使用该 explicit value，不允许回退
随机 resolver。
完整 `SymbolPlayer` 必须在离屏状态下先写入该最终 value，并在挂到可见树前再次核对；不允许
先显示 rolling/random value，再修改为最终 value。
normal official Spine、VNI 或 value presentation 尚未 ready 时，reel 保持最终
spinBlur frame 和 clip；全部 ready 后 landing 才挂载 prepared occurrence 并对外发布 stopped
状态。准备失败会在改变原 stopped 画面前回滚；replacement、reset 和 destroy 会释放未提交
owner。

stopped 阶段只有实际可见行持有完整 `SymbolPlayer`，上下 buffer 只保留隐藏的轻量 view，
且不解析隐藏 buffer 的 code/presentation value，所以 idle update 不会推进隐藏动画或索取
业务滚动值。既有 symbol pool 仍只服务 settled occurrence；rolling
Sprite 不进入 pool。`RenderReelSlotSnapshot` 的 `mode`、`rollingVisual` 和
`renderPriority` 用于底层诊断及 grid dimming/order，同一 rollingVisual identity 会跨帧复用。

完整 `SymbolPlayer` 内部按实际资源身份复用 runtime instance。普通图片只切稳定 Sprite 的
texture/visibility；named ImgNumber 和 value ImgNumber 保持稳定 renderer，后者跨 value tier 时
重绑已加载的 resource/profile、anchor、transform 和 slot，不按 tier 编号重建。official Spine
按 skeleton/atlas/texture 缓存 player，VNI 延续 root-local cache；离开状态或回池只 reset、pause、
detach，只有 `SymbolPlayer.destroy()` 才销毁这些缓存。不同同时可见 occurrence 仍各自拥有独立
mutable player/renderer，不跨 Symbol 共享时间轴或文字状态。

RenderCore相关游戏API按“渲染对象与原子动作 / 安全组合 / 玩法模板”分为三层；第三层默认属于gameframeworks或等价模板模块，
不是RenderCore core primitive。完整职责、依赖方向和禁止边界见
[`docs/rendercore-three-layer-api-architecture.md`](../../docs/rendercore-three-layer-api-architecture.md)。

## Operation 渲染第一层 API

任务 202 增量提供 `SymbolMutationArea`、Reel/Cell active spin session，以及一次 await 的 occurrence transfer/drop。
`CellSpin` 是后续新游戏的主实现；Crave/game002v2 仍使用 grid-cell 时，grid-cell 同步提供相同基础 mutation/transfer/drop
能力，但不继续发展独有的高级接口。RenderCore 的所有 symbol area 与 spin 模型都约定 `-1` 是唯一空图标标记；其它 symbol code 必须为非负整数，
`-1` 不进入 registry、轮带或 SymbolPlayer pool。`getSymbol(pos)` 对空位返回内置轻量 `SymbolHandle`（`code: -1`、`kind: "empty"`）：它不创建贴图或动画资源，但保留位置、anchor 和节点挂载能力；state、文字和非 null value 等依赖真实 symbol 资源的操作会显式失败。

```ts
const changed = mutations.replaceSymbol(pos, { code, value });
changed.setState("normal", "immediate");

const session = createCellSpinSessionController(cellSpin).start(positions);
const landed = await session.getCell(pos).land(target);

await cellSpin.transferSymbols({ transfers, durationMs: 300 });
await cellSpin.dropOccurrences({ movements, values });
```

`replaceSymbols()`、`SymbolGroup.setValues()/setStates()` 均先完整 preflight。session 中的 `overlay` 是稳定 cell/reel
attachment；land Promise resolve 后统一通过 `getSymbol()` 取得 exact symbol（包括 `-1` Empty SymbolHandle）。现有 game002v2 plan/drain/polling API
保持兼容；新能力不继续扩展 plan surface。

`SymbolArea.getSymbol({x,y})` 是 standard reel、legacy grid-cell 与新 `CellSpin`
共同的实例级入口；没有全局 rendercore singleton。它返回简单的 `SymbolHandle`，可直接
`setState()` / `playState()`、读写 presentation value、`add/remove` 通用 `RenderObject`，以及
创建独立 player/display identity 的 `clone()`。facade 捕获 exact symbol：尚未落地、leased、replacement/release 后的 stale 引用都会显式失败，不按相同坐标重绑；hole 返回 exact Empty SymbolHandle，而不是失败。reel 内 symbol 是
borrowed，不能 destroy；clone 是 owned `RenderObject`，由调用方 remove 后 destroy。

`RenderObject` 是 Container-backed 的 opaque capability，不是 Pixi `Container` 子类，也不公开
`parent/children/worldTransform`。`SymbolHandle`、普通文字对象以及 symbol 的 value/text part 使用同一
`getAnchor()/clone()/transfer()` 组合；只有可复制对象暴露 `clone()`。例如：

```ts
const source = area.getSymbol(position);
const part = source.getPart({ kind: "text", name: "multiplier" });
const flying = part.clone();

await area.present((context) =>
  context.transfer(area.getLayer("win"), flying, {
    ownership: "destroy",
    from: part.getAnchor(),
    to: runtime.getNodeAnchor("coin-meter"),
    durationSeconds: 0.5,
  }),
);
```

value part 使用 `{kind:"value"}`；whole-symbol flight 直接把 `source` 当 origin。part selector 不猜唯一节点、
不在 value/text 之间 fallback。`setValue/getValue` 与 exact-name `setText/getText` 继续保留各自严格语义。

`createRenderCellSpin()` 提供无 public plan 的逐格 `roll/start/settle/cancel`。不同格可以并发，
同一格冲突失败；`roll/settle` 只在目标 occurrence 原子落地、可立即 `getSymbol()` 后 resolve。
`start(pos, { localPhaseY })` 可在切入 `spinBlur` 的同一原子边界把该格重定位到指定本地公开轮带
phase；当前可见 code/value 在边界保持不变，后续滚动只读取该 phase 后的公开轮带。phase 必须是
安全整数，不接收 random function、服务器 scene 或业务规则；跨格无重复抽样由上层使用共享 helper 完成。
`getCell(pos)` 允许在目标落地前附加稳定 cell-space `RenderObject`。full、selective、hold、refill、
stagger 和 anticipation 由 operation handler 用普通 `async/await`、frame delay 与 `Promise.all()`
组合，不增加 `CellSpinPlan`。现有 `GridCellReelSpinPlan` 仅作为 game002v2 legacy compatibility
surface 保留，新游戏使用 `CellSpin`；logiccore 继续拥有权威 operation plan。

Standard `RenderReelSet` 同时实现无 public plan 的逐列 `ReelSpin`：`roll(x,target)` 直接滚动一列，
`start(x)` 使用本地公开轮带 targetless 预转，`settle(x,target)` 注入服务器可见窗口，`cancel(x)`
取消活动列。不同列可并发，同列冲突显式失败；`roll/settle` 只在整列原子落停、每个
`getSymbol({x,y})` 已可用后 resolve。跨列 stagger/full/held 由 operation handler 使用 frame delay
和 `Promise.all()` 组合，不增加 `ReelSpinPlan`。`getReel(x)` 是稳定 reel-space `RenderObject`
attachment 入口。

`getSymbolArea("main")` 返回 standard reel 与 Crave legacy grid-cell 共同的 `PresentableSymbolArea`，公开
`getSymbol()`、`bottom|top|win` 安全图层和 `present(async context => ...)`。`getReelArea("main")` 只返回
standard reel 的第一层 `ReelArea` façade，并额外公开最高优先级
`area.spin.start/land/cancel`。游戏用普通 await 编排 idle/win loop；spin 内部中断当前 presentation并清理
win layer，再调用默认或装配时注入的 `AreaSpinFunction`。游戏不持有 interruption signal。`SymbolHandle.getPosition()`
只返回 area-local occurrence 中心；通用 `createTextRenderObject()` 可据此定位后挂入 win layer。

Area、Scene Layout顶层和exact named node attachment统一使用增量兼容的`RenderObjectLayer`。既有
`layer.add(node, order?)/remove(node)`保持不变；新`getAnchor/resolveAnchor/addAt`允许用opaque anchor按调用时
transform对齐object。`SceneLayoutPackageRuntime.getRenderLayer(ref)`统一取得stable、`main.top|win|bottom`与exact node attachment；canonical node可用裸id或`.child|before|after`，旧带点号node使用`node:<legacyId>`。
旧`getLayer/getNode/attachChild/attachRelative` borrowed Container seam继续兼容既有host/editor，不要求游戏批量迁移。

Scene Layout package runtime 只为 standard reel 提供 `getReelSpin("main")`；未知
area、未 ready 或首次 scene 尚未 commit 都严格失败。详细合同见
[`docs/rendercore-operation-first-layer-api.md`](../../docs/rendercore-operation-first-layer-api.md)。

## Operation 渲染第二层 API

第二层保持游戏侧普通 `for/await/Promise.all`，只接管跨 await 容易出错的机械工作。`area.getSymbols(positions)`
返回捕获 exact occurrences 的 `SymbolGroup`，批量 `setState/playState` 会先完整预检；group提供输入顺序的奇数`getMiddleSymbol()`、members/bounds center与稳定area-local `getCellBounds()`，不读取visual bounds。`getAnchor({align:"center"})`
返回 opaque `RenderAnchor`，不暴露 Pixi matrix 或 display tree。单个 Symbol、area-local point和Scene Layout
exact named node同样可提供anchor，由RenderCore在实际mount/move时完成坐标转换。

`area.present()` context提供`mount/unmount/withNode/move/transfer`。临时节点声明`detach|destroy` ownership；callback
完成、失败、repeat轮次结束、spin interruption和destroy都会统一cleanup。motion复用现有visible-occurrence transfer的
line/cubic path与easing sampler，并由同一manual runtime clock推进；generic transfer只移动临时RenderObject/owned clone，
不提交盘面mutation。`createAreaSpinFunction()`用于装配column order和landing stagger，仍只调用第一层ReelSpin原子方法，
不生成public plan。

PresentationScope接受任意已登记的`RenderObjectLayer`，因此area scope也可临时挂到Scene/node layer；该对象仍受area spin
打断。永久Scene attachment使用第一层`add/addAt/remove`并由caller负责最终destroy。

`ReelArea.resolveAnchor(anchor)`可在确有数值计算需求时，把任意有效RenderCore Anchor只读解析为该area本地`RenderPoint`；
它不开放world coordinate或raw target Container。只为挂载/移动时应继续直接使用`mount/withNode/move/transfer`。完整合同见
[`docs/rendercore-coordinate-and-anchor-api.md`](../../docs/rendercore-coordinate-and-anchor-api.md)。

数字表现有两种严格来源。声明 `valuePresentation` 的 symbol 使用 `setValue/getValue` 和
`getPart({kind:"value"})`；
`setValue()` 会按 `maxExclusive` 自动同步 value tier。WL/WM/CM 这类命名 `imageStringNodes` 使用
`setText/getText` 与 `getPart({kind:"text",name})` 并传 exact node name。`initialText` 是 authoring preview 默认，不是 production
业务值。两类 part 的 clone 都返回 owned `RenderObject`，可交给同一个 presentation `transfer()` 飞向 area/named-node anchor或另一个
symbol 的对应 anchor；飞行本身不会推断或提交目标 value。

## Popup API

Popup 使用三个显式入口：`popup/data` 提供 v1–v7 strict source parser、纯数据校验、引用闭包和唯一默认 latest normalizer；`popup/core` 提供 production resolved-resource prepare、轻量 Runtime、presentation 与宿主 input binding；`popup/editor` 组合前两层，提供 mapped standalone package、namespace/materialize 与完整 snapshot wrapper。旧的混合 `popup` 入口和 rendercore root Popup wildcard export 已移除。

`loadPopupManifest()` 接受任一受支持版本，先按 source version strict validate，再确定性升级并复验为 `LATEST_POPUP_MANIFEST_VERSION`（当前为 v7）。v7 沿用 v6 图层语义并新增 package-local audio effect/cue；未知未来版本继续显式失败。

两类 Popup 都只有一份 Core 状态。游戏和 Scene Layout 从 `@slotclientengine/rendercore/popup/core` 使用 `createAwardCelebrationRuntime()` / `createSpinePopupRuntime()`：`update(deltaSeconds): void` 只推进状态，阶段判断使用 `getPhase()` / `isPlaying()`，不会构造完整 snapshot。Popup Editor 从 `@slotclientengine/rendercore/popup/editor` 使用 player wrapper；wrapper 委托同一个 Runtime，并额外提供 `update() -> snapshot` 与 `getSnapshot()`。游戏 facade 不导出 editor package adapter、factory/player 或 snapshot。

Scene Layout package runtime同样只向游戏暴露`getActiveAwardCelebrationPhase()`；Game Layout Editor需要完整award诊断值时，从`@slotclientengine/rendercore/scene-layout/editor`创建inspector。inspector借用现有package runtime，不创建第二份Popup或Scene状态。

字体文字 renderer 支持可选 package font（省略时才使用系统字体）、字号、字距、canonical color、纯色/线性渐变、描边、投影、Unicode grapheme 弧排、anchor 与原子 `setText()`。两类 player 都公开稳定的 `textNodes` / `imageStringNodes`，并可按 exact name 或各 kind 零基 index 取得 handle；业务绑定优先使用 exact name。覆盖 string 跨档位和重复播放保持，`resetText()` 恢复 manifest/自动金额值，destroy 后 handle 失效。

Scene Layout transition prelude 可在 `requestGameMode(modeId, { preludePopupStrings })` 中按 `text | image-string` 和 exact name 接收本轮最终 string。runtime 在 Popup start 前应用这些值，并在 complete、失败、取消或 destroy 后恢复调用前 handle 状态；该输入不进入 transition resource prepare/cache identity。需要跨播放保持或在 active Popup 中更新时，继续使用 player 的 exact handle `setText/resetText`。

## Image String API

Image String 使用三个显式入口：`image-string/data` 提供 v1 schema、strict parser 与纯校验；
`image-string/core` 提供游戏 runtime 使用的 Pixi resource/renderer；`image-string/editor` 组合前两层，
提供 mapped package、materialize 与按需 inspection。旧的混合 `image-string` 入口已移除。

core renderer 支持原子的 `setText()`、`setResource()`、`setAnchor()`、必要 geometry query 与有界
Sprite 复用，不创建 snapshot、`Application`、canvas、DOM、RAF 或字体 fallback。anchor 以当前
`visualBounds` 计算；中心 anchor 会随字符串实际宽高变化重算 pivot，空字符串才使用 logical bounds。
完整 occurrence snapshot 只由 editor inspection 按需物化。完整 schema、公式、ZIP 与生命周期示例见
[`docs/image-string-manifest.md`](../../docs/image-string-manifest.md)。

## Scene Layout API

`@slotclientengine/rendercore/scene-layout` 提供严格且向后兼容的 scene-layout v1–v4 parser、精确资源闭包和 production package runtime。package resource会把合法v1–v3规范化为v4并生成确定性的`runtimeAllocation`与空音频合同；原生v4必须完整且与typed引用严格一致。v4 按 mode 配置 optional loop BGM，在成功 commit 后 crossfade，并把 Popup/Symbol local effect 聚合为严格全局 route。

第一层统一使用`getSymbolArea()`、`getRenderLayer()`、`getRenderObject()`与`createRenderObject()`。authored object按image/Spine/VNI/image-string返回borrowed typed capability，可见性与mode/variant做AND且不开放position/destroy；program object从exact `runtimeResources`异步创建并由caller拥有。`getLayoutPoint/getLayoutAnchor/resolveLayoutAnchor`直接读写configured authored space，center-origin游戏无需复制Pixi左上角偏移。完整ref grammar、ownership、SymbolGroup几何、坐标映射与示例见[`docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md`](../../docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md)。

外部`applyGeometryManifest()`仍在mutation前校验immutable structure；package-owned mode target已经过manifest parse与transition prepare，switch commit直接应用prepared geometry、visibility和背景层序，不在热路径重复解析或全结构比较。lazy runtime resource的exact key/kind来自canonical runtime manifest，initial layout view省略程序资源只影响prepare时机，不改变可创建对象目录。

`inspectSceneLayoutPackageZipBytes()` /
`loadSceneLayoutPackageFromZipBytes()` 是 canonical production ZIP 边界：使用 bounded
extract、严格 path collision、assets map hash/size/media/orphan 与 nested exact closure
校验，不执行 editor Finder-wrapper/legacy migration。

`createSymbolPackageReelRegistry()` 将 package catalog、paytable code、value controller
与 cell size 组装成共享 reel registry；`createSceneLayoutPresentationSurface()` 用于
“manifest-owned layout/background/popup + app-owned reel/round target”的组合，继续
由 rendercore 管理 mode background、popup placement 和资源生命周期。

`createSymbolPackageReelRegistry()`、`createSymbolPackageReelRegistryFromCatalog()` 与
`createSceneLayoutPackageRuntime()` 可接收同步的 `valueTextBindings` /
`symbolValueTextBindings`。配置按 symbol 名和 exact ImgNumber node 名把同一个 presentation value
格式化成文字；一个 symbol 可绑定多个 node。全部 formatter 结果、node 和 glyph 会先完成预检，再与
value tier 一起提交；`null` 清空绑定 node，未绑定 node 仍由 `setText(name, text)` 独立控制。

```ts
createSceneLayoutPackageRuntime({
  resource,
  symbolValueTextBindings: {
    Wild: {
      multiplier: (value) => `x${value}`,
      badge: (value) => String(value),
    },
  },
});
```

formatter 必须同步返回非空 string。unknown symbol/node、非函数、formatter 异常或缺 glyph 都在画面
部分更新前显式失败；RenderCore 不默认选择 node，也不默认添加 `x` 或调用 `String(value)`。

模板 reel presentation 是 strict `standard | grid-cell` union；round flow 通过
`SlotReelPresentationCapabilities` 与 remove/dropdown/refill requirement 匹配，不通过
reel kind 推断 cascade。`createConfiguredSceneLayoutRoundAdapter()` 只串接现有
scene-layout、reel、symbol state 与 popup owner，并继续使用 package 内公开本地轮带和
注入的 Web Crypto phase random。

本地 authoring consumer 可使用 `inspectSceneOtherSceneFlowPackage()`、
`createDefaultSceneOtherSceneFlowProject()`、`inspectSceneOtherSceneFlowReadiness()` 与
`createSceneOtherSceneFlowRuntime()`。这组 API 直接复用 production ZIP 中公开轮带、
number weight table、Symbols state preset 和现有 standard/grid-cell runtime；首个 snapshot
边执行 strict v2 合并 Spin，固定串联 before-spin、spinning 与 landing-driven
stopping；stopping 首状态和 target value 在各 occurrence 的 exact landing transaction
中一起生效，上层 landing drain 只追踪后续 once completion。后续 snapshot 原位提交。所有可完成序列以 exact `normal`
结尾，scene 显式选择全格或左上第一格 completion barrier；Spin 始终保留
reel settle 硬屏障。v1 local-flow project 不做猜测迁移。
scene/operation flow 完成只结束编排调度，不结束 preview renderer 生命周期；同一宿主 ticker
继续推进最终 `normal` Symbol loop 和 Gamelayout 中其它 Spine/VNI/node 动画，直到 Replay 或 destroy。
完成边界不重播、重置或重建这些 player。
该 facade 不解析 server round 或 component，也不创建 DOM 配置 UI；runtime owner 负责
Pixi Application、package resource 与所有 player 的 destroy。

低层 `createSceneLayoutResource()` / `createSceneLayoutRuntime()` 保持用于 layout-only 和自定义 attachment；自包含 production 包使用 `createSceneLayoutPackageResource()` / `loadSceneLayoutPackageFromUrl()` 与 `createSceneLayoutPackageRuntime()`。URL loader 可接收 loading 阶段已取得的 `manifestBytes`，随后仍只按 manifest 与 assets map 的实际引用获取 package 文件。旧v1–v3无需Editor重导；缺Symbols binding时组合reel初始化与reset API仍显式不可用。

完整 package runtime 可以 deferred prepare main reel：首次合法 scene commit 前 reel 不可见，scene/value/spin API 会严格失败。业务自定义 grid-cell controller 可通过 ownership-transfer factory 注入，package 仍拥有唯一 reel、manifest placement/order 和最终 destroy；cascade 等借用 overlay 通过 typed attach disposer 接入，保持在 transition/popup 下方。

多Symbols binding package会在runtime init按allocation准备稳定reel entry。首次进入尚无scene的entry必须提交完整`reels.main`；之后离开和返回复用同一reel、catalog、player与settled scene，dormant entry不update。`recreateReel: true`是唯一强制替换入口，旧entry只在candidate成功commit后销毁；普通transition player仍按edge request创建和释放，Popup继续按exact id保持package owner。

`getInitialSceneLayoutSymbolPackageResource(resource)` 按 layout 的 legacy binding 或
`gameModes.initialMode` 返回初始稳定模式实际选择的 Symbols package resource。游戏需要读取同一
解包 package 内的 typed `gameConfig` 时使用该接口，不自行遍历 manifest/binding，也不读取额外
assets 或 raw 文件；binding/resource 缺失时显式失败。

slot operation handler 只实现一个异步 `start(operation, context)`。业务 app 可直接用 `await` 组合动画、逐格 mutation、`context.delay()` 和 `context.waitForFrame()`；coordinator 只负责精确分派、顺序推进、abort 与 fail-stop，不在 render 重做 plan preflight，也不提供通用 transaction phase runner。

普通 Scene Layout node 可省略 `gameMode` 表示跨全部状态存在，或声明一个 exact mode id；旧 v1 node 因缺少该字段自然保持全局可见。package runtime 在初始化和 production transition switch commit 时一起更新 mode background 与 scoped 普通 node，可见性再与当前 variant placement 组合。编辑器预览可调用独立的 `selectAuthoringGameMode()` 直接选择稳定状态；该 API 不查找或播放 transition，且不会为相同 Symbols binding 重建 reel 或重新抽样。

完整 manifest、zip 目录、构建期/CDN 接入和生命周期示例见 [`docs/scene-layout-manifest.md`](../../docs/scene-layout-manifest.md)。

## Symbol API

Symbols API 使用三个显式入口：`@slotclientengine/rendercore/symbol/data` 提供 strict manifest/package parser、upgrade 与闭包；`/core` 提供游戏 runtime resource、catalog、reel registry 和公开 `SymbolHandle`；`/editor` 叠加 mapped package、materialize、introspection、生成和 standalone preview wrapper。旧 `./symbol` 与 root symbol wildcard 已移除。完整 ZIP 合同见 [`docs/symbol-package.md`](../../docs/symbol-package.md)。

主要入口：

```ts
import {
  parseSymbolPackageManifest,
  parseSymbolStateTextureManifest,
} from "@slotclientengine/rendercore/symbol/data";
import type {
  SymbolHandle,
  SymbolPackageResource,
} from "@slotclientengine/rendercore/symbol/core";
```

游戏不构造或持有内部 `SymbolPlayer`；通过 `SymbolArea.getSymbol()`、replace、land 或 clone 取得 exact `SymbolHandle`。Symbols Editor 和独立 viewer 使用 `/editor` 的 `SymbolPreviewPlayer`，app 仍拥有 Application、canvas 与 ticker。

## 状态语义

状态由 `SymbolStateDefinition` 描述：

- `stable` 状态可以长期停留，播放方式只能是 `loop` 或 `static`。
- `once` 状态只播放一次，播放方式必须是 `once`。
- 默认状态只能是 `stable`。
- `once` 必须声明 `afterComplete: "return-to-default" | "terminal"`；前者完成后回当前默认状态，后者保持终态。
- 当前状态是 `loop` 时，请求切换会等待下一次 loop 完成边界。
- 当前状态是 `static` 时，请求切换会立即生效。
- 显式 `frameDurationSeconds` 不得小于 `1 / 60` 秒。

默认 preset 包含 `normal`、`spinBlur`、`disabled`、`appear`、`win`、`remove`、`dropdown`。symbol manifest v3 沿用 v2 的完整 state lifecycle，并新增 package-local effect 与 state cue；合法 v1/v2 统一由 upgrader 迁移，runtime 不按 state id 推断。

## 状态贴图

资源 map 兼容旧写法，也支持显式状态贴图集合：

```ts
const catalog = createSymbolCatalog({
  gameConfig,
  assets: {
    S00: {
      normal: normalTexture,
      states: {
        spinBlur: spinBlurTexture,
        disabled: disabledTexture,
      },
    },
  },
  texturePolicy: {
    requiredStateTextures: ["spinBlur", "disabled"],
  },
});
```

`normal` 可以是旧的 `Texture` / URL 字符串，也可以是显式 normal source：

```ts
const single = {
  normal: { kind: "single", texture: normalTexture },
  states: { spinBlur, disabled },
};

const layered = {
  normal: {
    kind: "layered",
    layers: [
      { index: 0, texture: bottomTexture },
      {
        index: 1,
        texture: topTexture,
        keyframes: [topTexture, topOpenTexture, topOpenedTexture],
      },
    ],
  },
  states: { spinBlur, disabled },
};
```

layer index 必须从 `0` 开始连续，不能重复、缺层或为负数；已加载 `Texture` 的多层 symbol 会校验每层尺寸一致。layer 可选 `keyframes` 表示同一 layer 的贴图序列；声明后必须非空，第一帧必须等于该 layer 的静态 `texture`，所有已加载帧尺寸必须一致。未声明 keyframes 的 layer 会规范化为空序列，但外部配置不能写 `keyframes: []`。

`getTextureSet(symbol)` 返回规范化后的 source；`getAsset(symbol)` 只用于旧单图 symbol，遇到 layered symbol 会抛错，避免把 layer `0` 伪装成普通图。

`states` 可以提供 `spinBlur`、`disabled` 等状态贴图。`spinBlur` / `disabled` 可以在状态机语义上继续等价到 `normal`，但默认静态 ani 会按 `requestedState` 选择状态贴图；因此 snapshot 仍可显示 `spinBlur -> normal`，画面使用 `spinBlur` 贴图。多层 symbol 进入状态贴图时，`SymbolPlayer` 会隐藏普通 layers，并用单张 `stateSprite` 展示合成后的状态图；回到 `normal`、`appear`、`win` 后恢复普通 layers。

`texturePolicy.requiredStateTextures` 用于声明某些状态贴图必须存在。缺少必需贴图、状态贴图声明了未知 state，或 `createSymbolPlayer()` 收到尚未加载的 URL 字符串时都会抛错，避免静默回退到普通图。

## Symbol Manifest

`rendercore` 提供共享 manifest helper，供游戏 app、viewer 和构建链路复用同一套解析规则：

- `parseSymbolStateTextureManifest(...)`：校验 `symbol-state-textures.manifest.json`，读取 normal、states、scale、renderPriority 和可选 animations。
- `createSymbolAssetMapFromManifestModules(...)`：把 Vite glob module 转成 `createSymbolCatalog(...)` 可消费的 stateful asset map。
- `createSymbolScaleMapFromManifest(...)`：从 manifest 读取每个 symbol 的显示 scale。
- `createSymbolRenderPriorityMapFromManifest(...)`：从 manifest 读取每个 symbol 的 Pixi 渲染叠放优先级。
- `getSymbolDisplaySymbolsFromManifest(...)`：得到 manifest 声明且可展示的 symbol 顺序。
- `createSymbolVniAnimationResourcesFromManifest(...)`：从 manifest animations、VNI project modules 和 VNI asset modules 解析 VNI 动画资源。
- `createSymbolSpineAnimationResourcesFromManifest(...)`：从 manifest animations、Spine skeleton modules、atlas raw modules 和 texture URL modules 解析 Spine 动画资源。

manifest 允许每个 symbol 声明可选 `renderPriority`。缺省值为 `0`，显式值必须是非负安全整数；负数、小数、`NaN`、`Infinity`、字符串或 `null` 都会显式失败。优先级只影响 Pixi slot symbol 的叠放顺序：数值越大越靠上；数值相同继续保持默认顺序，即下面压住上面、右边压住左边。它不改变服务器 scene、reel stop、win result 顺序、symbol state、中奖金额 overlay 或点击逻辑。

manifest 允许每个 symbol 通过 `animations` 声明状态动画。当前支持：

- `kind: "builtin"`：使用 rendercore 的内置 once 表现，但 `durationSeconds` 必须由 manifest 显式声明。
- `kind: "static"`：播放一次静态普通态，可用于把某个 once 状态显式配置成无额外动画；`durationSeconds` 必须由 manifest 显式声明。
- `kind: "vni"`：显式声明 project 路径和 range playback，`loop` 与 Spine 一样由 symbol state lifecycle 编排；once state 必须为 `false`，loop state 必须为 `true`。VNI project 会通过 `@slotclientengine/vnicore` 校验，project 引用的所有 assets 必须能从 Vite asset modules 中解析到 URL。
- `kind: "spine"`：显式声明 `skeleton`、`atlas`、`texture` 和 `playback`。`skeleton` 必须是 `./*.json`，`atlas` 必须是 `./*.atlas` raw text，`texture` 必须是本地 raster filename key（支持 png/jpeg/webp），`playback.mode` 固定为 `animation`，`animationName` 区分大小写并且必须存在于 skeleton，`loop` 必须符合 state playback 合同；`transform.x/y/scale` 只做显式位置和等比缩放，不做 app 侧推导。
- `kind: "composite"`：显式选择 `normal` 或当前 state texture 作为 base，并声明非空、有唯一 kebab-case `id` 的有序动画层；每层只能是 Spine 或 VNI，并明确放在 `underlay` 或 `overlay`。同一 placement 按数组顺序叠放，once/loop 只有在所有子层分别越过同一共享完成边界时才对外完成。

`stageRect` 是 editor/export 侧概念，不属于 runtime symbol manifest；manifest 中出现 `stageRect` 会作为未知字段显式失败。atlas page 是 atlas 内部 logical name，manifest texture 是 filename key，mapped package 再由 `assets.map.json` 把该 key 解析为 content-addressed physical path；三者不比较 basename。缺 manifest、未知 manifest 字段、未知 state、缺贴图、非法 scale、缺 animation `durationSeconds`、缺 VNI project、缺 VNI asset、缺 Spine skeleton/atlas/texture、atlas page/texture 显式映射不闭合或 Spine animation name 不匹配都会显式失败。app 和 viewer 不应复制 manifest parser，也不应在运行时代码里写 `if symbol === "L1"` 这类专属 VNI/Spine 逻辑。

## 动画解耦

状态定义只描述语义，不描述视觉效果。具体动画通过 `SymbolAnimationResolver` 注入：

```ts
const normalFallbackResolver = createDefaultSymbolAnimationResolver();

const resolver = (context) => {
  if (context.resolvedState === "win" && context.symbol === "S10") {
    return createMyS10WinAni(context);
  }

  return normalFallbackResolver(context);
};
```

resolver context 同时包含 `requestedState` 和 `resolvedState`，所以调用方可以区分 `spinBlur -> normal` 这类等价请求。resolver 找不到动画时必须抛错，不能静默退回 `normal`。

默认 resolver 只提供 `normal` 静态表现，不提供全局默认 `appear` / `win`。需要 once 动画时，调用方必须通过 manifest `kind: "builtin" | "static" | "vni" | "spine" | "composite"` 或 named animation profile 显式声明：

- `normal`：静态单帧 ani。
- manifest `kind: "builtin"` 的 `appear`：单次放大弹回，结束后 scale 复位；需要显式正数 `durationSeconds`。
- manifest `kind: "builtin"` 的 `win`：单次扫光 overlay，结束后清理 overlay；需要显式正数 `durationSeconds`。

`createSymbolManifestAnimationResolver()` 会优先使用 manifest 声明的 animation，再回落到调用方传入的 fallback resolver。VNI animation 直接把 `VNIRuntime` 的 Pixi display tree 挂到当前 symbol 的 `overlayLayer` 中；runtime 不创建隐藏 canvas、canvas-to-texture、额外 renderer、`stageRect` viewport 或 mask。VNI root 按 project stage 中心对齐，project 的 stage background 不会作为 symbol 动画背景绘制。VNI 与 Spine 都把资源和 lifecycle 编排分离：normal/stable loop 使用循环 playback，once state 使用单次 playback，VNI stable/loop 在真实 range loop boundary 上报 `loopCompleted`。Spine animation 由 rendercore 的 Spine adapter 解析 atlas/skeleton/texture，并把 display tree 挂到同一个 `overlayLayer`，不由 app 侧直接 import Spine parser 或播放状态机；rendercore 只接受 Spine `4.3.x` skeleton，并使用锁定在 `4.3.x` 的官方 Pixi v8 runtime。3.8、4.2、未知版本、malformed skeleton 或 runtime major/minor 不匹配都会显式失败。composite 为每个 leaf 建立独立 player slot，按声明顺序挂到共享 underlay/overlay，并统一拥有 reset、完成 barrier 与 destroy。对 `normal.kind: "spine"` 的 symbol，如果 `appear` / `win` 没有 manifest animation，resolver 只退回该 symbol 自身 normal Spine 展示并按当前 once 状态完成，不退回通用 builtin/default 动画；manifest 中显式声明的 Spine animation name 仍必须真实存在且大小写完全一致。动画生命周期由 `SymbolPlayer.update(deltaSeconds)` 推进。manifest Spine、active value Spine 与 VNI ani 都提供实际资源/playback 的 continuity key；状态名改变但 key 相同时，`SymbolPlayer` 保留当前 player 和时间轴，不 reset/replay 等价动画。reset、value/tier 改变或 key 不同仍销毁旧 ani 并创建新 ani。

业务编排等待 symbol 状态时使用 `SymbolPlayer.playState(state, options)`，reel 消费方使用 `playVisibleSymbolStates(positions, state, options)`。Promise 只表达完成边界，动画仍由宿主逐帧调用 `update(deltaSeconds)` 推进；`completion` 必须显式选择进入状态、once 完成或目标 loop 的下一次完整边界：

```ts
await reelSet.playVisibleSymbolStates(positions, "win", {
  transitionMode: "immediate",
  completion: "once-complete",
  signal,
});
```

批量调用会先校验全部坐标、状态和完成语义，再开始播放，避免部分提交。外部 `requestState()`、reset、回池、destroy 或 `AbortSignal` 会拒绝尚未完成的 Promise；调用方必须处理拒绝。旧 completion snapshot 只保留兼容与诊断用途，不应用于新的业务轮询。

同一业务阶段需要为不同坐标组播放不同 state 时，使用一次 `playVisibleSymbolStateBatch(requests, { signal })`。它会跨全部 request 检查空组、越界、重复坐标、occupied symbol 和 completion/state 匹配，再统一启动；不要在 app 中用多次 `playVisibleSymbolStates()` 裸组 `Promise.all`，否则无法保证跨组 preflight。

`createNamedSymbolAnimationResolver()` 支持用“名字 + 参数”绑定动画 profile：

```ts
const resolver = createNamedSymbolAnimationResolver({
  profiles: {
    SC: {
      appear: {
        playback: "once",
        durationSeconds: 0.46,
        effects: [
          {
            name: "layerBounceScale",
            params: { layer: 1, maxScale: 1.2, offsetY: -12 },
          },
          { name: "layerShineScale", params: { layer: 2, maxScale: 1.2 } },
        ],
      },
    },
  },
  fallback: createDefaultSymbolAnimationResolver(),
});
```

内置 named animation：

- `layerTextureSequence`：参数 `layer`、`frameDurationSeconds`、`delaySeconds`、`durationRatio`，按 layer 的 `keyframes` 切换贴图，结束后恢复静态 `texture`。
- `layerBounceScale`：参数 `layer`、`maxScale`、`offsetY`、`cycles`、`delaySeconds`、`rotationDegrees`。`rotationDegrees` 为可选峰值旋转角度，负数表示逆时针/向左旋转，缩放归零时会还原到 `0`。
- `layerShineScale`：参数 `layer`、`maxScale`、`shineAlpha`、`shineWidthRatio`、`delaySeconds`、`durationRatio`、`rotationDegrees`。`rotationDegrees` 与缩放脉冲同步，结束后还原到 `0`。
- `layerStaggeredShineScale`：参数 `layers`、`maxScale`、`staggerSeconds`、`durationRatio`。
- `singleSpriteAppear`：兼容单图 `appear`。
- `singleSpriteWinShine`：兼容单图 `win`。

`layerTextureSequence` 引用不存在的 layer、目标 layer 未声明至少两帧 keyframes、参数类型错误、`durationRatio` 超出 `(0, 1]` 或未知参数都会抛 `SymbolAnimationError`。其他 named animation 遇到未知动画名、未知参数、错误参数类型、非法范围或引用不存在的 layer 也会抛 `SymbolAnimationError`。

## Win Amount Animation

中奖金额动画从 `@slotclientengine/rendercore/win-amount` 子路径导出。它只处理通用 raw amount、formatter、阈值倍率、Pixi layout 和 VNI tier 资源，不硬编码 USD、game003、GMI 字段名、中奖组件名或 Ways 规则。

```ts
import {
  createWinAmountAnimationPlayer,
  createWinAmountAnimationTiersFromManifestModules,
  parseWinAmountAnimationManifest,
} from "@slotclientengine/rendercore/win-amount";
```

调用方必须传入服务器整数金额和当前下注整数金额：

- `betAmountRaw` 必须是 finite positive number。
- `winAmountRaw` 必须是 finite non-negative number。
- 阈值比较使用 `winAmountRaw / betAmountRaw`，不要先格式化或除显示 scale。
- formatter 由 app 显式注入，返回空字符串或抛错会显式失败。

播放器只暴露一个 Pixi `container`，不创建 `PIXI.Application`、canvas、DOM overlay、RAF 或独立 renderer。游戏主 ticker 负责调用 `update(deltaSeconds)`，viewport 变化时调用 `applyLayout(...)`。big/super/mega 等 VNI tier 和其它 VNI 动画一样按资源自身 100% 尺寸渲染，`tierStageRect` 只提供定位基准，不用 VNI `stage.width` / `stage.height` 做 fit、cover 或缩放适配。

`requestAdvance()` 是玩家点击加速语义：普通数字阶段如果本轮不到 bigwin，会直接跳到最终金额并停在 `awaiting-dismiss`；如果本轮会到 bigwin 以上，会一次点击跳一档，依次进入 big/super/mega 等 tier，最后仍停在 `awaiting-dismiss`，不会隐藏文字或 tier effect。`requestDismiss()` 仅保留给调用方显式请求渐隐关闭；segmented VNI 会进入 end，once VNI 则继续自然完成，二者都等待 effect 排空。`dismissImmediately()` 用于调用方在开始下一轮前同步清理上一轮展示，对 `idle` / `complete` 幂等，对 counting、tier-counting、awaiting-dismiss 或 dismissing 阶段都会立即清空文字和 tier effect。

big/super/mega tier 使用 VNI segmented playback：`durationSeconds`、`loopStartTime`、`loopEndTime` 和 `keepParticlesAlive` 全部来自 win-amount manifest。推荐入口是 `createWinAmountAnimationTiersFromManifestModules(...)`；它先用 `parseWinAmountAnimationManifest(...)` 校验 manifest 的白名单字段、相对 glob、tier 顺序和时间区间，再校验 project modules、asset modules、asset basename 重复、缺 project、缺 asset，以及 `0 <= loopStartTime <= loopEndTime <= durationSeconds <= project.stage.duration`。`durationSeconds` 可以小于 5 秒；当配置的 `durationSeconds` 小于源 project 时，会 clone runtime project 并截断 `stage.duration`，不会 mutate import 进来的 JSON。

## Catalog

`createSymbolCatalog` 用 `LogicGameConfig` 和资源 map 建立 paytable 与图片的精确匹配关系：

```ts
import { createGameConfig } from "@slotclientengine/logiccore";

const gameConfig = createGameConfig(rawGameConfig);
const catalog = createSymbolCatalog({
  gameConfig,
  assets: {
    S00: texture,
  },
});
```

catalog 只把 paytable 与资源 map 的交集加入 `displayableSymbols`。请求创建不可展示 symbol、未知状态、非法默认状态、非法等价配置或 URL 资产未加载为 `Texture` 时都会抛错。

`getAsset(symbol)` 继续返回普通贴图以保持兼容；需要完整状态贴图集合时使用 `getTextureSet(symbol)`。

## Ticker

`SymbolPlayer` 不创建 Pixi `Application`，也不从磁盘加载图片。调用方负责加载 `Texture`，并在游戏主循环里显式推进：

```ts
const symbol = catalog.createSymbolPlayer("S00", { texture });
stage.addChild(symbol);

app.ticker.add((ticker) => {
  symbol.update(ticker.deltaMS / 1000);
});

symbol.requestState("appear");
symbol.requestState("win");
```

## Background API

manifest-driven Spine 背景从主入口和 `@slotclientengine/rendercore/background` 导出：

```ts
import {
  createSpineBackgroundPlayer,
  createSpineBackgroundResource,
  parseSpineBackgroundManifest,
} from "@slotclientengine/rendercore/background";
```

`parseSpineBackgroundManifest()` 严格解析 version 1 的 `artSize`、`maximized-focus` focus rect、skeleton/atlas/texture map、art-space transform、逻辑稳态和有向 transition；未知字段、绝对/逃逸/重复路径、非法尺寸、focus 越界、unknown state、self/duplicate transition 都会显式失败。`createSpineBackgroundResource()` 进一步校验 Spine 4.3、exact animation name、多页 atlas 与 texture URL 一一闭合以及 skeleton attachment 可解析。app 只传入 manifest 和精确 Vite modules，不直接 import Spine runtime。

`createSpineBackgroundPlayer()` 创建一个官方 Spine instance，使用 `autoUpdate=false` 并由宿主 ticker 调用 `update(deltaSeconds)`。稳态固定 loop，transition 固定 once；`requestState(target)` 只接受 manifest 中存在的 direct transition，完成事件到达的同一 update 内切到目标 loop。并发请求、destroy 后调用和缺失 transition 都失败，不排队、不猜多跳，也不回落静态图、首帧或默认动画。player 用 manifest art rect 裁切 display tree，并应用 manifest transform；skeleton bounds 不参与 art/focus/viewport 推导。

background 与 symbol animation 复用同一套官方 Spine 4.3 版本、atlas/skeleton、manual update、completion 和 destroy 底层。background 允许显式多页 texture map；symbol manifest 仍保持既有单页合同，不因共享底层而放宽。

## Viewport API

两种对外背景适配方案的选择、配置、公式、边界和验收要求见 [`docs/background-adaptation.md`](../../docs/background-adaptation.md)。当前只把单背景 `maximized-focus` 与横竖双背景 `responsive-art` 视为完整可复用方案；下列 focus/mapping API 是两套方案共用的几何能力。

viewport 能力从主入口和子路径导出：

```ts
import {
  calculateFocusedArtViewport,
  calculateMaximizedFocusedArtViewport,
  calculateResponsiveArtViewport,
  createMaximizedFocusedArtViewportPolicy,
  mapAnchorRectToArt,
  mapArtRectToViewport,
  mapReferenceRectToArt,
} from "@slotclientengine/rendercore/viewport";
```

`calculateFocusedArtViewport()` 用于“完整 art 坐标系 + 当前 canvas 逻辑尺寸 + 游戏 focus rect”的裁切计算。调用方传入完整背景或最大美术空间 `artSize`、当前 canvas backing 的 `viewportSize`、必须完整保留的 `focusRect`，可选传入 `minMargin`。返回值包含：

- `visibleRect`：当前 viewport 应显示 art 中的哪一块。
- `worldOffset`：把完整 art world container 移到 viewport 内的偏移，等于 `-visibleRect.x/y`。
- `focusRectInViewport`：focus rect 在当前 viewport 内的位置，用于测试和诊断。

该 helper 只做通用几何计算，不读取资源、不创建 Pixi 对象，也不包含任何 game002 路径、symbol 名或棋盘常量。`viewportSize` 大于 `artSize`、`focusRect` 超出 art、focus 加 margin 无法放入 viewport、`NaN`/`Infinity`/非正数都会显式抛错，避免运行时静默裁掉关键区域。

`calculateMaximizedFocusedArtViewport()` 用于只有一套背景和一个重点区域的页面适配。算法先按 contain 语义计算 focus 在页面内完整显示时的最大 scale，再用页面宽高除以该 scale，反推出当前应展示的 art-space viewport；因此 focus 保持完整且最大化，focus 以外只要仍在背景范围内就继续显示，不会因为横竖屏分类主动裁掉。只有反推 viewport 超过完整 `artSize` 时才按对应轴封顶，此时页面极端宽高比造成的黑边才是不可避免的。随后仍复用 `calculateFocusedArtViewport()` 完成居中和 art 裁切。`createMaximizedFocusedArtViewportPolicy()` 把这一计算封装成 frame policy resolver，framework/UI 层只消费 resolver 结果，不复制几何算法。

`calculateUnboundedMaximizedFocusedViewport()` 用于没有有限 art bounds 的 authored plane。它同样先 contain focus，再按 page aspect 反推 visible rect，并以 focus 几何中心向外扩展；不会把 `Infinity` 或超大 magic size 当 artSize，也不会执行边界钳制。Popup v3 presentation 使用该 helper，v2 继续使用有限 art helper。

`mapReferenceRectToArt()` 用于把旧设计稿或旧 portrait crop 里的矩形映射到新的完整 art 坐标。典型用法是把旧 `1125 x 2000` 坐标中的棋盘矩形映射到 `2000 x 2000` art 中，再把映射后的矩形作为 focus rect。

`mapArtRectToViewport()` 用于在已有 `visibleRect` 下，把完整 art 坐标系中的任意矩形映射到当前 viewport 坐标。典型用法是 focus rect 与棋盘、调试框或其它 art rect 不同的时候，先用 `calculateFocusedArtViewport()` 得到裁切结果，再用该 helper 映射其它矩形。`rect` 和 `visibleRect` 都必须在 `artSize` 内；`rect` 不要求完全落在 `visibleRect` 内，超出当前可见区域时仍返回确定坐标。app 不应自行复制 `rect.x - visibleRect.x` 这类通用映射算法。

`mapAnchorRectToArt()` 用于把相对某个 art-space anchor 左上角的 child rect 映射回完整 art 坐标。`anchorRect` 必须位于 `artSize` 内，child rect 的 `x/y` 是相对 anchor 的偏移，可以是负数；child 可以视觉上越过 anchor 边界，但映射后的 rect 必须仍位于完整 art 内。该 helper 不知道具体游戏的部件语义，只做通用 anchor/focus rect 几何映射和 fail-fast 校验。

`calculateResponsiveArtViewport()` 用于横竖屏有不同 art 和 focus rect 的场景。调用方必须同时传入 `landscape` 和 `portrait` 两套 variant；当 `viewportSize.height > viewportSize.width` 时选择 `portrait`，否则选择 `landscape`，包括正方形 viewport。选中 variant 后仍复用 `calculateFocusedArtViewport()` 的校验和返回语义，因此 variant 缺失、focus rect 越界或 margin 放不进 viewport 都会显式失败。该 API 只处理通用横竖屏 art 选择和几何裁切，不包含具体游戏的资源名、部件摆放或转轮区常量。

## Reel API

reel 能力从主入口和子路径导出：

```ts
import {
  RenderReelSet,
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry,
} from "@slotclientengine/rendercore/reel";
```

`ReelSymbolRegistry` 把 `LogicGameConfig` 的 paytable、已加载 `Texture`、空图标配置和 symbol 状态贴图合并成可渲染 registry：

- `texturedSymbols`：paytable 中有普通图且可创建 `SymbolPlayer` 的 symbol。
- `configuredEmptySymbols`：调用方显式配置为空的 symbol，例如 viewer 里的 `BN`。
- `missingAssetEmptySymbols`：paytable 中缺少普通图的 symbol，按空 cell 处理。
- `ignoredAssetsWithoutPaytable`：有图片但不在 paytable 的孤儿资产，不参与 reels 渲染。

空图标会占据 cell 和 reel 位置，但 `createSymbolPlayerByCode()` 返回 `null`，状态请求是 no-op。有普通图的 symbol 如果缺少 `texturePolicy.requiredStateTextures` 声明的状态贴图会直接抛错，不会静默回退到普通图。

cell 尺寸由当前参与 reels 渲染的非空普通图动态计算：单图使用普通 texture 尺寸，多层 symbol 使用 layer 共同尺寸；若配置了 `symbolScales`，则使用 `texture width/height * scale` 后的尺寸参与最大宽高计算。显式空图标、缺图空图标、孤儿图片和状态贴图都不参与尺寸计算。`RenderReel` 会把每个非空 symbol 放在 cell 中心，并在创建 `SymbolPlayer` 时把对应 `scale` 应用到根容器。`symbolScales` 只能配置 paytable 中存在的 symbol，缩放系数必须是正数。`symbolRenderPriorities` 同样只能配置 paytable 中存在的 symbol，值必须是非负安全整数；普通 reel、reel set 和 grid-cell reel 都只用它调整 Pixi render order，所有值为 `0` 时保留默认层级。

`createReelLayout()` 支持 `columnGap` 控制轴间距；`RenderReel` 只在 starting / spinning / settling 等非静止态裁切单轴内容，停止态会取消裁切，允许偏大的 symbol 自然超出格子外框。

逐帧 presentation 协调读取当前 slot 时使用 `getSlotRenderViews()`，exact `windowY` 读取使用 `getSlotRenderView(windowY)`：数组和每个 view 都在 reel 创建时一次建立，字段通过只读 getter 反映当前 code/kind/symbol/presentation value，不提供 snapshot isolation。RenderCore 不再提供包含 display object 的通用 slot snapshot；状态、几何和 aggregate diagnostics 使用各自的标量 snapshot。热路径读取当前位置和阶段使用 `getCurrentY()` / `getPhase()`，不要为了一个标量创建完整 `getSnapshot()`。`RenderReel.renderAtY()` 直接遍历既有 slots，`update()` 对相同 phase 复用冻结结果，避免每格每帧创建 window/slot/update 快照。standard ReelSet 在内部按固定 slice 消费宿主提交的完整 delta，复用 stopped/start 聚合 scratch，仅在真实 start/landing/completion edge 创建不可变结果；宿主不得再次 clamp 或对子 runtime 重复切片。grid-cell runtime 同样复用每格 key、slot view 索引、timeline scratch arrays 和无 edge 的 update result；只有实际 started/landed/activation edge 才生成对外不可变坐标快照。

典型流程：

```ts
const finalYs = gameConfig.getStopYCoordinates({
  reelsName: "reels01",
  sceneName: "step0.scene0",
  scene,
});

const registry = createReelSymbolRegistry({
  gameConfig,
  assets: loadedTextures,
  emptySymbols: ["BN"],
  symbolScales: {
    SC: 1.5,
  },
  texturePolicy: { requiredStateTextures: ["spinBlur"] },
});

const cellSize = registry.getCellSize();
const layout = createReelLayout({
  reelCount: reels.getReelCount(),
  visibleRows: 5,
  cellWidth: cellSize.width,
  cellHeight: cellSize.height,
});

const reelSet = new RenderReelSet({ reels, layout, registry });
reelSet.resetToFinalYs(finalYs);
const plan = createReelSpinPlan({
  reels,
  finalYs,
  visibleRows: 5,
  minimumSpinCycles: 10,
  baseDurationMs: 1600,
  speedSymbolsPerSecond: 42,
  startDelayMs: 90,
  stopDelayMs: 180,
});
reelSet.spin(plan, { targetVisibleScene: scene });
```

`createReelSpinPlan()` 先使用最终 y、时长、速度和最小转动距离反推每轴 `travelSymbols` 与 `startY`。默认 viewer 语义下每轴至少转动 `minimumSpinCycles * visibleRows`，即 `10 * 5 = 50` 个 symbol 位置。`RenderReelSet.update(deltaSeconds)` 按 `startDelayMs` 一轴一轴启动，并按每轴 `stopAtMs` 一轴一轴停下。

`RenderReelSet.spin(plan, { targetVisibleScene })` 可把服务器本轮目标可见窗口叠加进临时 spin strip。滚动过程仍从本地公开轮带读取，完成后 `getVisibleScene()` 等于 `targetVisibleScene`。因此 live slot 前端不需要也不应该读取、缓存或泄露服务器真实轮带；如果目标窗口无法在本地公开轮带反查出 stop y，调用方可以继续使用当前 y 或 `0` 生成物理 spin plan，再把目标窗口传给 `targetVisibleScene`。

`RenderReelSet.resetToVisibleScene(scene, finalYs?)` 用于进入游戏后的默认可见窗口展示；它只设置当前静态窗口，不启动 spin。`finalYs` 可用于记录/保持物理 y，不要求目标窗口在本地公开轮带中连续存在。

状态流转由核心库触发：

- 旋转中，非空 symbol 请求 `spinBlur`。
- 落点刷新后，可见非空 symbol 请求 `appear`。
- `appear` 播放完成后，`SymbolPlayer` 回到默认 `normal`。

## Grid Cell Reel API

grid-cell reel 用于逐格启动、逐格停止的特殊转轮表现。每个正在滚动的 cell 都有 `cellWidth x cellHeight` 的裁切窗口，内部复用 `RenderReel` 的 `visibleRows=1` 微型 reel。调用方通过 `resolveDimmingAlpha(code)` 为实际滚动 occurrence 决定暗度；spin 期间 rendercore 为当前 reel slots 生成同速滚动的半透明黑色格层，并对对应 symbol 根节点同步应用灰阶 brightness tint，使格底和图标一起变黑但保持 symbol alpha 为 `1`。暗层按实际 code 决定，不固定在棋盘坐标上，也不按格子生成棋盘格；resolver 返回 `0` 的特殊 symbol slot 不绘制暗层且 tint 保持白色。单个 cell 落地后会立即移除外层裁切，最终静态 symbol 不继续依赖 mask；落地阶段暗层与 tint 同步渐变恢复并关闭暗层渲染。

```ts
import {
  RenderGridCellReelSet,
  createGridCellOrder,
  createShuffledGridCellReelOffsetMatrix,
  createGridCellReelSpinPlan,
  parseReelManifest,
} from "@slotclientengine/rendercore/reel";

const reelManifest = parseReelManifest(rawReelManifest);

const order = createGridCellOrder({
  columns: 6,
  rows: 9,
  mode: "top-down-left-right",
});
const cellReelOffsets = createShuffledGridCellReelOffsetMatrix({
  reels,
  columns: 6,
  rows: 9,
  random: visualRandom,
});

const gridReels = new RenderGridCellReelSet({
  reels,
  registry,
  columns: 6,
  rows: 9,
  cellWidth: 120,
  cellHeight: 120,
  order,
  bounceStrength: reelManifest.spin.bounceStrength,
});

gridReels.resetToScene(defaultScene, finalYs, cellReelOffsets);
const plan = createGridCellReelSpinPlan({
  reels,
  finalYs,
  targetScene,
  columns: 6,
  rows: 9,
  order,
  cellReelOffsets,
  timing: {
    startStepMs: 16,
    stopStepMs: 16,
    settleAfterLastStartMs: 180,
    minimumSpinCycles: 6,
    speedSymbolsPerSecond: 54,
  },
  dimming: {
    resolveDimmingAlpha: (code) =>
      brightSymbolCodes.has(code) ? 0 : reelManifest.spin.dimmingAlpha,
    fadeInMs: 80,
    fadeOutMs: 160,
  },
});
gridReels.spin(plan);
```

网络等待期间可调用 `startContinuous()` 启动 targetless 连续滚动。该阶段只读取本地公开轮带，
不接收、缓存或猜测服务器目标；响应到达后用 `settleContinuous(plan)` 把目标窗口注入临时 strip，
并从当前速度和位置连续减速落停，不重新起转。start 与 settle 的 selected positions 必须完全一致；
未选 held cells 始终保持原 occurrence。`cancelContinuous()` 仅停止并提交当前本地窗口，用于请求、
解析或表现失败的 fail-stop cleanup，不能伪造服务器落点。同一 transaction 只能 settle 一次。
`startStepMs` 按 positions 的稳定 `startGroupIndex` 分批启动；响应早于全部格起转时，未启动格保留
剩余 cadence 后直接进入 target-aware spin。grid-cell landing appear 在落点边界 immediate 进入，
不会先等待 normal loop boundary；完成仍等待该次真实 once appear。

`RenderReel.startContinuous({ localPhaseY })` 是单格 phase 起转的唯一原子 owner。
`CellSpin.start()` 直接复用它；Crave 仍使用的 legacy grid-cell 只通过
`cellLocalPhaseYs` 复用同一能力，不建立第二套 phase 状态机。Scene Layout grid-cell facade 的
`startMainReelContinuousSpin({ random })` 会在请求开始时调用
`createShuffledGridCellReelPhaseMatrix()`，按列对完整公开轮带做 partial Fisher–Yates，并在每格真实
start edge 应用 phase。响应早于某格起转时，该格在剩余 cadence 后从已抽取 phase 进入 target-aware
spin；held 格不应用 phase。省略 `random` 保持旧 consumer 行为，random 必须返回 `[0,1)` 且不得来自服务器。

Scene Layout package runtime 通过 `startMainReelContinuousSpin()`、
`settleMainReelContinuousSpin()` 和 `cancelMainReelContinuousSpin()` 暴露相同 ownership。一个网络
请求只创建一个 continuous transaction；响应中的第一个 landing 消费它，之后同一响应内的
free-game 连续段和 refill 继续调用普通 target-aware spin API，不等待下一条消息。
该合同同时支持 standard `RenderReelSet` 和 grid-cell；standard 复用每轴 `RenderReel`
continuous primitive，并显式拒绝 positions/dimming 等 grid-cell-only 输入。

`createGridCellOrder({ mode: "top-down-left-right" })` 生成 `(0,0),(0,1)...(0,rows-1),(1,0)...` 的稳定顺序。`createGridCellReelSpinPlan()` 对每个 cell 计算 `startAtMs`、`stopAtMs`、`durationMs`、`axisPlan`、`targetVisibleSymbols` 和目标暗度；默认每个 cell 的最终 y 使用 `reels.normalizeY(x, finalYs[x] + y)`。selective `positions` 可以全部提供非负、从 0 开始且非递减的 `startGroupIndex`；相同 group 的 cell 共享 `startGroupIndex * startStepMs` 起播边界，而 stop timeline 仍按 positions 稳定顺序计算，因此能做同时启动的波纹而不改变既有逐格停轴 cadence。省略 group 时继续使用原来的逐格 sequence index。dimming resolver 同时接收通用 `activated` 布尔上下文；plan 可用 `dimmingActivatedAtStart` 设置起始状态，存在 activation gate 时 runtime 会在 gate 真实 landing edge 切为 `true`。滚动 strip 和 landing fade 都用当前 code 与当前状态重新解析暗度，不缓存业务 symbol 结论。运行时每帧仍对临时 spin strip 中当前真实 slot code 调用同一 resolver，而不是只看 endpoint 或 cell 序号；resolver 必须返回 `[0,1]`，游戏语义由调用方负责，rendercore 不认识具体 symbol 名。如果传入 `cellReelOffsets`，则使用 `reels.normalizeY(x, finalYs[x] + y + cellReelOffsets[x][y])`，让同一列内不同格子也能使用更分散的本地轮带窗口滚动。`createGridCellReelOffsetMatrix()` 适合固定线性 offset；`createShuffledGridCellReelOffsetMatrix()` 则对每一列做 partial Fisher-Yates，从该列完整本地公开轮带相位中为各格无重复抽取相位。调用方每次创建 spin plan 时重新调用即可获得新的视觉相位；注入的 random 必须返回 `[0,1)`，不能使用服务器随机数。两种 helper 都不打乱 symbol 顺序。`targetVisibleSymbols` 仍会注入临时 spin strip 的落点窗口，因此完成后的 `getVisibleScene()` 能还原目标 scene。调用方可以用本地公开轮带提供滚动内容，再把服务器本轮目标窗口叠加到临时 strip，不需要也不应该暴露服务器真实轮带。

`createShuffledGridCellReelPhaseMatrix()` 复用同一 partial Fisher–Yates，但直接返回每格可用于
continuous start 的 phase；legacy `createShuffledGridCellReelOffsetMatrix()` 继续把抽样结果转换为
spin plan offset。两者的随机调用顺序和同列无重复合同一致。

activation 时间线可通过 plan 的 `activation` 独立使用，不要求绑定 effect resource；gate
仍只在目标 cell 的真实 landing edge 打开。Scene Layout package runtime 的 grid-cell spin 输入可选
`buildGridCellSpinPlan(stage)`，stage 提供已验证的目标 scene/order 和受控 `createPlan()`，让游戏注入
dimming、activation 或 effect，而无需复制 phase、临时 target window 和 reel 生命周期。默认不配置
function 时行为不变；`drainMainReelActivationPositions()` 与 landing drain 对称返回 instance-scoped
edge，reset/new spin/mode switch/destroy 都会清理未消费事件。standard reel 传入该 function 会显式失败。

`createWeightedGridCellPresentationValueResolver()` 是中性的 grid-cell presentation helper：调用方按
occurrence context 选择 number-weight table，rendercore 对 `(x,y,symbolY,code)` 缓存稳定值，并以
uint32 rejection sampling 避免 modulo bias。空表、重复/非正 value 或 weight、总权重越界和非法随机值
全部失败；helper 不选择业务表、不读取 server random，也不把抽样值写入 scene/轮带。

grid-cell API 会 fail-fast 校验 scene 尺寸、final y 长度、order 重复/越界/缺失、offset 矩阵尺寸和整数值、timing、alpha 范围和 reel 列数。资源状态缺失仍由 `ReelSymbolRegistry` / `SymbolPlayer` 按 `texturePolicy.requiredStateTextures` 显式失败，不会静默回退到普通图。

grid-cell 可选 effect API 把逐格 presentation 与 symbol state 分离。`createGridCellEffectResourcesFromManifest()` 用精确 module maps 校验官方 Spine 4.3 skeleton、atlas page/texture closure、大小写精确 animation 和官方 duration；cell effect `loopCount` 接受正安全整数。`GridCellEffectController` 在 prepare 阶段按总循环时长和 schedule-derived capacity 初始化有界 player pool，并用一个完整 grid rect mask 承载 cell-center overlay；即使单次 update 跨越多个循环，也会逐个官方 Spine loop boundary 切片并计数，达到请求次数才释放。spin plan 可为每格声明完整 effect lead 和可选 activation gate；runtime 只在真实 gate landing edge 后开放 gated effect，全部真实 loop completion 必须先于同边界 landing。`startEffectSweep()` 支持已排序 position 副本和 stagger，当前 sweep 合同仍为一次真实 loop，并等待最后一个真实 loop edge；reset/error/destroy 会清理并归还全部 player，不用 timer、symbol state 或 app 私有 Spine track。

`parseReelManifest()` 读取独立 reel manifest 的 `spin.bounceStrength` 和 `spin.dimmingAlpha`。`bounceStrength=1` 等于 rendercore 既有回弹力度，正数按比例缩放，`0` 完全关闭回弹；`dimmingAlpha` 必须位于 `[0,1]`，由游戏作为通用 dimming resolver 的输入。负数、非有限值、缺字段和未知字段都显式失败。`RenderReel`、`RenderReelSet` 与 `RenderGridCellReelSet` 都接收同一 `bounceStrength`，未传时保持默认 `1`；具体哪些 symbol 保持全亮仍由游戏 resolver 决定。游戏应从自己的 reel manifest 传入这两项 spin 表现值，不在 app runtime 再维护第二份数值。

`RenderGridCellReelSet.update(deltaSeconds)` 在每个 cell landed 后先把目标 symbol 复位到最终 y，再只对 registry 显式启用的 symbol 请求一次 `appear`。once appear 完成后 `SymbolPlayer` 回到 normal；grid-cell 完成边界会等待所有 cell landed、滚动暗层恢复且所有已请求的 landing appear 完成。没有 manifest appear 的 symbol 不应进入 `landingAppearSymbols`，不能伪造 builtin/default fallback。该逐格调度只属于 `RenderGridCellReelSet`，不改变普通 `RenderReelSet`。snapshot 提供 `phase`、`hasClipMask`、`cellX/cellY`、`reelX/reelY`、当前可见 `dimmingAlpha` / `symbolDimmingAlpha`、`dimmingOverlayRenderable`、`requestedState` 和 `visibleSymbol`，用于游戏层诊断和测试，不暴露可变内部对象。

停轴后，`RenderReelSet`（逐轴 spin）和 `RenderGridCellReelSet`（逐格 spin）都结构化实现 `VisibleSymbolPresentationTarget`：批量请求可见 symbol state、读取状态/几何快照并推进 animation。这个共同能力不合并两种 spin plan；grid-cell 的几何会把内部单行 reel 坐标转换为完整 grid 本地坐标，且 idle `update()` 会继续推进 `win once -> normal`。

grid-cell main reel 还提供 occurrence identity 能力：`getMainReelVisibleOccurrence(x, y)` 返回受控 handle，可读取状态/几何、播放 state、设置 presentation value，并用 exact Scene Layout `spine | vni` runtime resource 附着 occurrence effect；它不暴露 Pixi Container、SymbolPlayer 或 raw zIndex。occurrence effect 随同一 symbol identity 移动，和固定在坐标上的既有 cell effect 是两套独立 ownership；显式 `detach()`、occurrence release/回池或 runtime destroy 会清理 attachment。

`runMainReelVisibleOccurrenceTransfer(input, choreography)` 是 runtime-owned 的单次异步事务。`tx.delay()` 和 `tx.move()` 都只由宿主唯一的 `runtime.update(deltaSeconds)` 推进，不使用 GSAP、RAF 或 wall-clock timer。空间 path 支持 `line` 和多段 `cubic-bezier-path`（按总弧长采样），时间 easing 独立支持 `linear` 和 CSS-style cubic Bezier；`above-symbols | above-effects` 加非负整数 order 表达语义叠放。callback 在 `move()` 完成后正常返回时，runtime 自动执行唯一原子 finalization；callback 未完成 move、reject、abort、reset 或 destroy 时直接 reject，并只清理尚未 finalization 的临时 display lease、listener、mask 和预创建资源，不执行旧 scene/业务数据 rollback。source replacement 可为非负 symbol code，或 exact `-1/null` hole：

```ts
for (const transfer of transfers) {
  await runtime.waitForPresentationDelay(transfer.gapMs);
  await runtime.runMainReelVisibleOccurrenceTransfer(transfer, async (tx) => {
    const trail = await tx.moving.attachEffect({ key: "trail", kind: "vni" });
    await Promise.all([
      tx.move({
        durationMs: 320,
        path: { kind: "line" },
        easing: { kind: "cubic-bezier", x1: 0.2, y1: 0, x2: 0.2, y2: 1 },
        stacking: { layer: "above-effects", order: 0 },
      }),
      trail.play({ kind: "vni" }),
    ]);
  });
}
```

游戏仍拥有 route、循环顺序、间隔、control points、业务 state/effect 名与后续 Promise 链；rendercore 不解释 CO 或其它 operation component。

完整接口、生命周期、曲线路径、附加效果和 `for + await` 示例见 [`docs/visible-occurrence-transfer.md`](./docs/visible-occurrence-transfer.md)。

## Scene Layout named RenderObject 与 ImgNumber

`SceneLayoutPackageRuntime.createRenderObject(name)` 从 package manifest 的 exact `runtimeResources` name 创建 detached、caller-owned `RenderObject`，支持 image、official Spine 和 VNI；不会把 name 当路径或猜 kind。Spine/VNI 实例由创建它的 package runtime 在 `update(deltaSeconds)` 中推进，object destroy 会注销并释放 player，runtime destroy 会清理剩余实例。image-string 必须使用 typed `createImgNumberRenderObject(name, {text, anchor?})`，video 不支持此对象 factory。

`ImgNumberRenderObject` 是 image-string-backed `CloneableRenderObject`，提供 `setText/getText` 并继承 `setPosition/setVisible/getAnchor/destroy`。它不公开 raw Pixi container；文字变化继续使用 image-string 的原子 glyph validation 与动态 anchor，clone 共享 package-owned resource 但拥有独立 renderer 和生命周期。

Crave 的 Nearwin1/2 与图标中奖迁移示例见 [`docs/crave-named-render-object-migration.md`](../../docs/crave-named-render-object-migration.md)。
area/Scene/node layer挂载、跨layer对齐、兼容与cleanup说明见
[`docs/crave-render-layer-integration.md`](../../docs/crave-render-layer-integration.md)。
Scene Layout prelude Popup 的翻译文字、ImgNumber 和 FreeGame 退出顺序见
[`docs/crave-scene-layout-popup-inputs.md`](../../docs/crave-scene-layout-popup-inputs.md)。

## 通用 symbol win carousel

`createSymbolWinCarousel(...)` 是一个职责收敛的通用效果：按调用方传入的一个或多个组件名解析各自 `usedResults`，同组 `pos` 同时请求 manifest `win`，显示该组 resolver 金额，依次完成首轮后暂停并 lingering。未触发组件跳过，全部未触发时保持 idle；同一 result 被多个组件引用时分别播放并在 snapshot 中保留 `componentName/resultIndex`。

```ts
const carousel = createSymbolWinCarousel({
  target: visibleSymbolTarget,
  resolveAmount: ({ result }) => Number(result.cashWin),
  formatAmount: (amount) => String(amount),
  cyclePauseSeconds: 1,
  amountText: {
    yOffsetRatioFromCellCenter: 0.22,
    fontSize: 38,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 5,
  },
});

const prepared = carousel.prepare({
  logic,
  stepIndex: 0,
  scene,
  componentNames: ["line-win", "scatter-win"],
});
// reels 停稳后调用；prepare 已在视觉启动前完成协议校验。
carousel.start(prepared);
```

`prepare()` 只解析、校验并冻结 groups，不触碰 target；plan compiler 已经产出 plain groups 时使用
`prepareGroups()`，避免 renderer 保留 `GameLogic`。`start()` 读取 target 本地 geometry，从中奖格中心平均点附近选择一个真实格（等距按 x/y），开始状态与金额展示。`update()` 只根据 symbol 自然回到 normal 判断组完成，不使用固定动画 timer；`clear()` 清理当前组和金额；`destroy()` 释放 Pixi 容器。金额来源、formatter、style 和可选 component validator 都由调用方提供，carousel 不读取 totalwin 或游戏专属字段。manifest 仍是 symbol animation 的唯一来源。未来 ReelSet 只要实现 `VisibleSymbolPresentationTarget` 即可接入；不同中奖效果应新增并列函数，不向本 carousel 堆游戏分支。

symbol cascade 的 `WinSummaryCollectOptions.sequentialCollectStartIntervalSeconds` 可选开启逐格 collect 起播 cadence。未配置时保持严格串行的 `collect -> remove -> 下一格`；配置正有限秒数后，每一格会在自己的 cadence 边界立即从当前 loop 切入 collect，避免多个同步 loop 等到同一 boundary 后成组起播。各格仍独立等待自身 collect 完成再 remove/release，但下一格只按起播间隔启动，不等待上一格 remove 完成。rendercore 同时推进全部 active item，并在全部 item release、summary 计数完成后才结束该组；游戏 symbol、动画名和具体间隔仍由调用方配置。

## 全局序列

`SymbolStateSequenceController` 只决定下一步请求哪个状态，不直接操作 Pixi。viewer 或游戏层把返回的状态广播给全部 `SymbolPlayer`。`once` 状态需要等全部 symbol 都上报 `onceCompleted` 后再推进。

## 命令

状态贴图生成脚本只在 Node 侧使用 `sharp`，不会进入浏览器运行时代码或发布 bundle。`assets/symbols/symbol-composites.json` 可声明多层资源；旧字符串 layer 继续用文件名推导 index，对象 layer 使用显式 `index`、`texture` 和可选 `keyframes`。复合 symbol 会先按 layer 静态 `texture` 顺序合成完整图标，再从合成结果生成 `spinBlur` 和 `disabled`，manifest 的 `normal` 会写为 layered object 并保留对象 layer 的 keyframes。生成器会为每个 symbol 写入显示缩放系数 `scale`，默认值为 `1`，也可以通过 `--scale` 指定；`scale` 必须是有限正数。仓库内生成物应显式写出 `scale`，consumer 应从 manifest 读取，不要维护第二份手写 scale 表。重新生成 manifest 时，生成器会保留旧 manifest 中仍然有效的 `animations` 和显式 `renderPriority`，非法 `renderPriority` 会让生成失败，避免叠放规则被悄悄删掉。当前 viewer/reels 资源可用下面命令生成：

`state-texture-generation-preset.v1.json` 是 state texture 参数的唯一来源。Node/Sharp
生成脚本和 browser-safe `generateSymbolStateTextureRgba()` 共同消费该 preset；
后者只接受严格 width/height/RGBA 和单个 `spinBlur|disabled` 目标，不依赖 DOM、
Pixi、filename 或 symbol 业务。浏览器 editor 自己负责 local image codec、像素预算、
资源事务和 PNG 输出，不复制 kernel/brightness，也不把用户图片发送到服务器。

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json --scale 1
```

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter reelsviewer dev -- --host 0.0.0.0
```

# Symbol value presentation

## Symbol image-string nodes

symbol 可声明零到多个有唯一 name 的 `imageStringNodes`。新配置用一个 `spineSlot` 自动覆盖全部 top-level Spine/档位 activeSpine state，并只用 `targets[]` 表达 non-Spine exact overlay state；旧逐 Spine state `{state,slot}` target 继续兼容。每个 logical node 在 occurrence 内只有一个稳定 container，state 切换只改变 slot/overlay/hidden attachment 与 `visible/renderable`。shared `spineSlot` 只有在当前 presentation state 确实由 prepared Spine 支持时才能 attach；晚到的 player init 不得把 exact direct overlay 抢回不可见 slot。

命名 node 可为 non-Spine exact `spinBlur` target 声明 `spinBlurProfile: { resource, specialValueImages? }`。profile 的字符、metrics、glyph size/offset、fixed groups 和特殊值集合必须与 normal profile一致；package prepare一次加载共享资源。state切换调用同一 mapped renderer的`setResource()`并复用container、special Sprite和glyph Sprite pool，不在runtime生成或复制模糊纹理。缺profile的旧target-only node继续按既有normal-assets语义运行。

命名 node 与 `valuePresentation.text.type: "image-string"` 的每个 tier binding 都支持可选 `specialValueImages: [{ value, image }]`。`value` 在所属 node/binding 内是唯一 safe integer，`image` 是 contained local 图片路径；完全匹配 `String(value)` 时整张 Sprite 替代该档 glyph renderer，其他字符串仍严格走该档 glyph closure。映射图片进入 package/Vite 精确闭包并与 glyph 纹理共享资源所有权，切换文本保持所属 binding 的 anchor、transform、target/slot 与 `followSlotColor`。parser 兼容旧的 `valuePresentation.text.specialValueImages`，将其规范化到每档；canonical typed 输出不保留共享字段，新旧位置同时声明会失败。

`SymbolPlayer` 公开 `getImageStringNodeNames()`、`setImageStringText(name, text)`、`getImageStringText(name)`。string 原样保存，缺 glyph/控制字符/非 NFC 或 unknown name 时原子失败；节点随目标 state/player attach/detach，保留等价 Loop 时间轴，并受 reel texture 显式优先级约束。consumer 不接触 Spine track、slot 私有对象或 Pixi glyph children。旧 `setPresentationValue()` value-presentation 合同独立保留，不会自动变成命名节点。

symbol manifest 可为任意 symbol 声明可选 `valuePresentation`。新 image-string wire 使用与 Spine tiers 等长的 `tierResources[]`，每档保存 normal ImgNumber JSON，并可用等长 `tierSpinBlurProfiles[]` 的 object/null 项显式绑定该档 non-Spine `spinBlur`；`slot`、anchor、transform、`followSlotColor` 与 special map 是一份共享 Normal 配置。旧完整 `text.tiers[]` 继续按原档位语义运行并可带同形 `spinBlurProfile`；shared 与 legacy 字段严格互斥。runtime 维持一个稳定外层 ImgNumber container：同档改值只 `setText()`，normal/spinBlur 在同一 renderer 切 profile并在 tier slot/顶层 overlay间移动，跨档替换内部 profile 而不改变外层 identity。

`createSymbolValuePresentationResourceBundleFromManifest()` 为 value-tier binding 创建可销毁的共享 image-string resource pool，并逐档校验 skeleton animation 与该档 exact slot；相同 canonical dependency 只加载一次，每个 occurrence 只创建独立轻量 renderer。`createSymbolValuePresenter()` 与 reel controller 共用 display factory 和 official Spine slot API，提供 `prepare/show/update/clear/destroy`。font Text、完整数值 Sprite 或 mapped `RenderImageString` 都通过 slot-follow wrapper 挂在当前 tier player 内：wrapper 接收 Spine bone matrix，内部 display 保留自己的 offset、scale、anchor/pivot，再继承 slot 的可见性与颜色。image 模式仍要求完整值图片；image-string 先检查 exact 特殊值映射，未匹配时渲染 `String(rawValue)` 并要求每个字符存在。缺图片、glyph、slot、resource 或晚到初始化失败都在可见提交前回滚，不提供跨模式 fallback。

reel 可为每个本地 symbol occurrence 携带可选 presentation value。`TemporaryReelStrip` 会把 current endpoint、公开本地轮带中间 occurrence 和 target endpoint 的值与 code 一起冻结；`SymbolPlayer` 的通用 value controller 据此直接在实际 reel slot 内播放命中 tier 的 Spine，并把文字只创建、attach 一次。normal/appear/win/remove/dropdown 都在同一 tier player 上切 animation，slot object 不重建；只有 value 真正改变、occurrence release 或 destroy 才 detach/destroy。

当 requested state 通过 equivalence 解析到 normal、但 requested state 自身有显式 reel texture（例如 `spinBlur` 或 `disabled`）时，显式 texture 优先，ImgNumber exact target 同样使用 requested presentation state；active Spine 不得在异步 init 完成后把 texture 或 direct ImgNumber 隐藏。回到真正的 active-Spine state 前先同步 ImgNumber attachment 资格，再重新显示 tier player。相同 active Spine resource/playback 跨 semantic state 复用时间轴时，animation 必须同步新的 semantic playback；official Spine player 会逐次上报真实 loop completion，以便状态机在 loop boundary 推进 pending once state。

## 通用 symbol cascade 与 grid-cell 级联

`createSymbolCascadePlayer()` 按冻结的中奖组执行 `aggregate emphasis -> ordered group/collect choreography`。emphasis 期间同时显示各组金额，并通过 target API 同步压暗全部中奖坐标之外的格子遮罩与 SymbolPlayer 本体，因此跨格美术也会完整变暗；fade-in、hold、fade-out 和目标 alpha 均由调用方配置。调用方可选 `startPresentationsWithEmphasis`，让全部 group win 与 sequential start/companion win 在压暗开始的同一边界并行起播；sequential start 完成后可在 emphasis 期间进入 loop，强调结束后仍按稳定顺序 remove/collect，且不会重播 opening state。未启用该选项时保持既有的 emphasis 结束后逐组 `win -> remove` 行为。

配置单一 `winSummaryCollect` 后，player 从 manifest 的 canonical `stateDefinitions` 和每个 symbol 的 `cascadeWinPresentation` 派生 state preset、稳定 `order`、group 或 sequential-collect mode 及状态 id。group mode 在 win 请求同一边界把 positive safe integer group amount 累加到 Pixi summary，并等待动画和 `0 -> target` tween 都完成后 remove；sequential mode 执行“全部 primary start once，并行播放调用方批准的 group-mode companion win -> 等全部完成 -> 全部 primary loop -> 按调用方稳定 item 顺序逐枚 collect once + item amount -> remove once -> release”。companion 不进入 item/loop/collect/remove，也不贡献金额；哪些实际 symbol 可作为 companion 完全由调用方 predicate 决定，rendercore 不认识 wild。计数只在 snapshot 的 `resolvedState` 真正进入 collect state后开始，loop pending 不会提前计数。summary 为 0 时隐藏，跨多次 `start()` 保留累计，只有 `clear()`/`destroy()` 重置。rendercore 不解析游戏组件、coin/cash 字段、symbol code 或专属动画名。

manifest 扩展 state 只能声明不覆盖 base preset 的 `once/once` 或 `stable/loop` 定义；presentation 引用必须与 animation capability/playback 一致。generator 根据派生 state 集合保留 animation，不为 phase animation 生成 PNG，也不维护游戏实例 state 白名单。`createLastUseRemoveGroups()` 仍支持调用方注入通用 position predicate；启用 summary/collect 时 player 会在 manifest order 稳定排序后重新计算最后使用者，remove 完成的同一 update 边界释放 occurrence。

grid-cell 级联以 `-1` 作为中间态空洞。`createGridCellCascadeDropPlan()` 根据 remove 后 source、服务器 settled/dropdown 和 refill 后完整 target，按列稳定匹配 symbol occurrence，并把既有 occurrence 与从棋盘上方创建的 refill occurrence 编入同一批 unified fall movement。rendercore 只拒绝无法执行该动画的结构，例如非法 hole/坐标、上移、code identity/顺序漂移或 fixed occurrence 被替换；不反向校验 plan 已决定的 presentation value。固定和移动 occurrence 保留 renderer identity，完成边界直接应用 plan 的 target values。`createGridCellCascadeDropdownPlan()` 复用同一 movement pairing，但只保留 existing movement，完成后允许精确 holes；调用方随后可用 effect sweep 与既有 selective `spin(positions)` 填洞，未选 occurrence 不重建、不 appear。`deriveGridCellCascadeSettledValues()` 使用相同 occurrence 顺序与 fixed predicate，从 source scene/value 和 settled scene 确定性推导 settled values。调用方可注入 `canDropOccurrence` 固定特殊 occurrence；其它 symbol 可从固定 symbol 后面穿过，渲染前后关系统一服从 manifest `renderPriority`。fall 期间只在整个 `RenderGridCellReelSet` 上启用一个完整 grid rect mask，活动 symbol 自身不绑定 mask。

grid-cell full/selective spin 的每个 timeline slice 都会恰好推进一次所有 occupied cell：
包括 waiting、已落地/完成和 selective held cell；hole 不推进。Scene Layout 的 plan stage
可传 `positions` 与显式 `timing`，package runtime 在释放 selected occurrence 前校验全部 held
code/value continuity，并通过 `drainMainReelStartedPositions()` 暴露真实 start edge。

`removeVisibleSymbols()` 是通用 terminal remove transaction：整批 positions/state/playback
先完成 preflight，并要求 state 的 `afterComplete` 为 `terminal`；每个 exact occurrence 在自身
once completion 的同步 `update()` 边界直接 release，不经过 normal，也不把 commit 推迟到 Promise
continuation。返回的 Promise 只汇总完成/失败；播放、identity、abort 或 destroy 失败采用 fail-stop，
不回滚已经完成的 release。
`createGridCellEffectResourceFromLoadedSpine()` 把 Scene Layout 已 exact 加载的 official Spine
resource 转成 grid effect，仍执行版本、atlas page、texture closure、animation 和 duration 校验。

`scripts/generate-symbol-value-vite-resources.mjs` 为 consumer 生成 tier Spine、`reelStates` PNG，以及 image 模式完整值图片或 image-string 模式 nested manifest/glyph 的 Vite 可静态分析精确 imports、module maps 和 loading URL；共享 dependency 去重，decoded glyph 尺寸也在生成时核对。`--check` 检查漂移。状态贴图 generator 会严格保留并验证三种互斥分支，确保重生成不丢 tier binding、不写回 value-managed symbol 的顶层 normal/state。

## Slot operation coordinator

`createSlotOperationHandlerRegistry()` 是 runtime 实例 owner；kind/version 不匹配、重复注册和未知
handler 精确失败。`createSlotOperationCoordinator()` 直接接受上游已编译、已验证的 immutable plan，
按顺序调用每个 handler 的异步 `start`。执行上下文提供上一 state output `input`、`AbortSignal`、逐帧等待和延迟；宿主 ticker
继续统一推进 runtime。plan 只保存每步 output，不携带通用 mutation DSL；render handler 决定动画检查点与提交粒度，并只在实际变更的坐标检查 input/output continuity，不做全局
snapshot assert。任一调用失败都会 abort pending playback、执行 fail-stop cleanup 并拒绝本轮 Promise，
不会 rollback 已经完成的 mutation。旧固定 round coordinator 和 presentation transaction runner
已从 public surface 删除。

standard `RenderReelSet` 与 grid-cell `RenderGridCellReelSet` 都提供真实 cascade movement：release 后保留 surviving renderer identity、presentation value 和等价 animation playback，dropdown 按编译 movement 落位，refill 只创建 hole occurrence。scene-layout configured adapter 使用同一 coordinator，不再用最终 scene reset 跳过 remove/drop/refill。金额 resolver、symbol policy、component 名和游戏 extension 仍留在 app/config。

`presentation.flow` V1 保持 Task 123 已发布语义；只有显式 V2 才提供 configured sequential collect。V2 的 cadence、decimal-cents formatter、item amount 文本和 summary 布局均为严格可序列化配置，实际 state/playback/value binding 仍由 active symbol manifest 拥有。value symbol 配合 V1 或缺少 manifest-owned `sequentialCollect` 时在 readiness/preflight 失败。
