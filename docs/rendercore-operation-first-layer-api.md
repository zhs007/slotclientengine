# RenderCore operation 渲染第一层接口设计

> 状态：任务 199、200 与 202 已实施；本文同时作为第一层 public contract。
>
> 本文只定义由 operation 最终驱动的 RenderCore 第一层 public API，以及当前
> `grid-cell` 的兼容边界。第二层只记录必要方向，不设计第三层模板。

## 目标

RenderCore 为游戏提供一组足够简单、可以直接编排的渲染对象和原子操作：

- 游戏从具体画面区域按坐标取得 symbol，并直接改变状态、附加节点或复制；
- 普通整列转和单格转都在落停后回到相同的 symbol 访问方式；
- 新单格转只提供“转一个格”的原子能力，跨格顺序直接使用 `async/await` 组合；
- game002v2 已使用的 `grid-cell` 行为和 plan 保持兼容，不强制迁移；
- logiccore 继续拥有 operation plan，RenderCore 第一层不再创建另一套 public plan。

第一层追求少量直接方法。复杂性应留在 RenderCore 内部实现、第二层组合或以后再讨论的模板，
不能通过大量 Handle、Snapshot、Geometry、Lease 或 choreography DSL 转嫁给游戏。

## 区域与实例

RenderCore 不是进程级 singleton，一个游戏可以同时拥有多个转轮区或 symbol 区域。每个区域都提供
相同的 symbol 访问合同：

```ts
interface SymbolArea {
  getSymbol(pos: SymbolPosition): SymbolRender;
}

interface SymbolPosition {
  readonly x: number;
  readonly y: number;
}
```

需要 settled mutation 的 consumer 显式取得 `SymbolMutationArea`；这不会扩大所有旧 `SymbolArea` fake/consumer 的必选合同：

```ts
interface SymbolMutationArea extends SymbolArea {
  replaceSymbol(pos, target): SymbolRender;
  replaceSymbols(replacements): SymbolGroup;
}
```

批量 replacement 和 `SymbolGroup.setValues()/setStates()` 先全量验证。replacement 返回新 exact occurrence，旧 façade stale。
CellSpin 同时正式拥有 active cell session、`transferSymbols()` 和 `dropOccurrences()`；grid-cell 在 Crave 仍使用期间同步支持相同基础能力。
RenderCore 的所有 symbol area 与 spin 模型统一使用 `-1` 表示空图标，其它负数非法。CellSpin、snapshot、remove 以及未来 ReelSpin 的空位能力都使用同一语义，不得各自定义 hole code。新接口不接收 RenderCore gameplay plan；game002v2 旧入口保持兼容。

空图标仍是可由 `getSymbol(pos)` 取得的内置轻量 `SymbolRender`。它不拥有贴图、Spine、粒子或对象池 entry，只复用 position 已有容器来提供坐标、anchor 与附加节点能力；需要真实 symbol 资源的 state、text 和非 null value 操作必须显式失败。

区域如何从 package runtime、游戏 runtime 或依赖注入中取得，后续结合 runtime 装配接口确定；
`getSymbol()` 必须属于具体区域实例，不能成为全局 `rendercore.symbol(pos)`。

示意：

```ts
const mainArea: SymbolArea = getGameArea("main");
const featureArea: SymbolArea = getGameArea("feature");

const mainSymbol = mainArea.getSymbol({ x: 2, y: 1 });
const featureSymbol = featureArea.getSymbol({ x: 0, y: 0 });
```

`getSymbol()` 是严格取得接口。坐标越界、合法 hole 或尚未落地的滚动格没有可用 symbol 时显式失败。
只有出现真实的可选探测需求时才考虑独立 `findSymbol()`，第一层不预先增加两套查询。

Standard reel 与 Crave legacy grid-cell 共同用 `PresentableSymbolArea` 管理安全 attachment layers 和
game-owned await presentation；standard reel 的完整第一层 `ReelArea` 再增加最高优先级 spin 与 area point anchor：

```ts
interface PresentableSymbolArea extends SymbolArea {
  getLayer(id: "bottom" | "top" | "win"): SymbolAreaLayer;
  present(
    presentation: (context: SymbolAreaPresentationContext) => Promise<void>,
    options?: { repeat?: boolean },
  ): Promise<void>;
}

interface ReelArea extends PresentableSymbolArea {
  readonly spin: AreaSpinController;
  getAnchor(point: RenderPoint): RenderAnchor;
}
```

内部 display 顺序固定为 `bottom < symbols < top < win`。symbols 主层不向游戏开放；`bottom/top/win`
只提供 `RenderObject add/remove`。`win` 是最高 area presentation layer，金额文字等独立节点放在这里，
不绑定 symbol 或 reel 生命周期。

## SymbolRender

`getSymbol()` 返回游戏可直接操作的 `SymbolRender`。游戏代码不接触 `SymbolHandle` 名称，也不需要理解
内部 occurrence generation、player、pool 或 display tree ownership。

第一层目标形状：

```ts
interface SymbolRender {
  getPosition(): RenderPoint;
  setState(state: string): void;
  playState(state: string, options?: SymbolPlayOptions): Promise<void>;
  setValue(value: number | null): void;
  getValue(): number | null;
  setText(name: string, text: string): void;
  getText(name: string): string;
  getPart(
    ref: { kind: "value" } | { kind: "text"; name: string },
  ): CloneableRenderObject;

  add(node: RenderObject, options?: SymbolNodeOptions): void;
  remove(node: RenderObject): void;

  clone(options?: SymbolCloneOptions): SymbolRender;
}
```

示意：

```ts
const symbol = area.getSymbol(pos);

symbol.setState("win");
await symbol.playState("collect", {
  completion: "once-complete",
  signal,
});

symbol.add(glow);
symbol.remove(glow);

const copy = symbol.clone();
```

`getPosition()` 返回当前 occurrence 中心在所属 SymbolArea 本地坐标系中的位置。它只提供定位点，不恢复
`SymbolGeometry`、bounds、mask、world transform 或 mutable display object；stale、未落停或 detached clone 没有
area position 时显式失败。

Symbols package registry 可为 occurrence 配置 `SymbolValueTextBindingMap`，Scene Layout package runtime
通过 `symbolValueTextBindings` 下传。映射粒度为 `symbol -> exact image-string node -> (value) => string`，
因此同类 symbol 可同时驱动多个命名 ImgNumber。reel resolver/current/target 已交给 occurrence 的
presentation value 会统一驱动 value tier 与这些 node；同一文字跨 `spinBlur` profile、landing 和 settled
state 保持，不在逐帧 render 时重新调用 formatter。

提交前会完整求值并校验所有 formatter、node、glyph/special image 和 value tier。任一失败时保留上一次
完整 presentation；`null` 不调用 formatter，并清空全部已绑定 node。未绑定 node 的 `setText()` 语义不变；
若手工覆盖已绑定 node，下一次 `setValue()` 即使 number 相同也会重新应用 binding。formatter 只能同步返回
非空 string，RenderCore 不猜 node、前缀或默认格式。

第一层不提供 `SymbolSnapshot` 或完整 `SymbolGeometry`。跨 symbol、scene node 或其它目标的坐标换算由
RenderCore 内部 anchor/motion 能力处理，游戏不计算 reel-space、scene-space 和 world-space 变换。

### 节点与 clone

Spine、VNI、粒子、光效、图片和后续 typed custom node 应统一表现为 `RenderObject`，而不是为每种资源在
`SymbolRender` 上增加专用方法。节点的创建、播放和资源校验属于 RenderCore；`add/remove` 只负责附加关系。

`RenderObject` 内部由 Pixi `Container` 承载，但 public interface 不继承或返回 Container。对象统一提供受控
position/visibility/play/stop/anchor/destroy；`CloneableRenderObject` 额外提供 clone。whole symbol、value part和
exact-name text part共享该合同，part通过严格discriminated selector取得，不使用字符串猜测或唯一节点fallback。

游戏附加节点不能直接放入现有 animation-owned overlay。RenderCore 需要稳定的自定义 attachment layer，避免
symbol state 切换、Spine/VNI player 重建或 value presentation 同步误删游戏节点。

`clone()` 共享 immutable resource，但创建独立 display/player identity。clone 不与来源 symbol 实时联动；
不支持复制的运行态节点或播放状态必须显式失败，不能猜测或静默省略。clone 的简化释放方式在实施前结合
operation scope 与 pool 冻结，但不向普通游戏暴露一组复杂 ownership 类型。

### occurrence 生命周期

`SymbolRender` 是简单 public façade，不是把内部、可被 reel 回池的 `RenderSymbol` 原样返回给游戏。内部需要保留
严格的失效检查：

- selective spin 未参与格继续指向原 symbol；
- dropdown 搬运 surviving occurrence 时保持同一个 symbol identity；
- 某格落地后，即使其它格仍在转，`getSymbol(pos)` 已可返回该格最终 symbol；
- 尚未落地的滚动格调用 `getSymbol(pos)` 显式失败；
- replacement、remove、release 或回池后，旧 `SymbolRender` 的后续操作显式失败；
- active transfer 已独占 occurrence 时，冲突操作显式失败。

这些检查留在 RenderCore 内部，不改变游戏侧的简单对象模型。

## Spin 类型

Public surface 支持三种 spin 形态，但后续只主力维护两种新接口：

| 类型               | 定位                   | 后续策略                     |
| ------------------ | ---------------------- | ---------------------------- |
| `ReelSpin`         | 新普通整列转接口       | 主力维护                     |
| `CellSpin`         | 新单格转接口           | 主力维护                     |
| legacy `grid-cell` | game002v2 当前兼容接口 | 行为冻结，只保兼容与必要修复 |

三者最终都必须提供 `SymbolArea.getSymbol()`。legacy `grid-cell` 不因新增共同接口而改变现有 spin、
continuous、cascade、effect 或 edge 时序。

“不再维护 grid-cell”指不再扩展其 public gameplay contract。资源泄漏、destroy、浏览器兼容和共享底层错误仍需
修复；`SymbolRender`、资源播放器和 pool 等共同基础能力可以同步改进。新游戏不选择 legacy `grid-cell`，未来第二层
也只面向 `CellSpin` 和 `ReelSpin`。

## 新 CellSpin 第一层

新 `CellSpin` 不接收整盘 plan，只执行单格原子操作：

```ts
interface CellSpin extends SymbolArea {
  roll(
    pos: SymbolPosition,
    target: CellRollTarget,
    options?: CellRollOptions,
  ): Promise<void>;

  start(pos: SymbolPosition, options?: CellRollStartOptions): void;

  settle(
    pos: SymbolPosition,
    target: CellRollTarget,
    options?: CellRollOptions,
  ): Promise<void>;

  cancel(pos: SymbolPosition): void;
  getCell(pos: SymbolPosition): CellRender;
}

interface CellRollTarget {
  readonly code: number;
  readonly value?: number | null;
  readonly state?: string;
}
```

`getCell(pos)` 只提供稳定 cell-space 的 `RenderObject add/remove`，用于目标尚未落地前的
Nearwin 等效果；它不提供 activation plan、effect schedule 或业务状态机。

命名可在实现时按仓库风格小幅调整，但必须保持以下语义：

- `roll()`：已有单格目标，立即开始并在该格完整落停后 resolve；
- `start()`：没有服务器目标时，仅用本地公开轮带启动该格持续滚动；
- `settle()`：向已经持续滚动的该格注入明确目标，并在落停后 resolve；
- `cancel()`：取消该格尚未落停的 targetless rolling，不伪造目标；
- Promise resolve 时，该格最终 symbol 已经可以通过 `getSymbol(pos)` 取得。

默认方向、速度、minimum cycles、bounce、mask 和常用 timing 在 `CellSpin` 创建时绑定。每次调用的 options 只保存
该格真正需要覆盖的视觉参数与 `AbortSignal`，不能重新膨胀成匿名 plan。

### 直接编排

单格串行：

```ts
await context.delay(0.25);
await cellSpin.roll(pos, target);
cellSpin.getSymbol(pos).setState("appear");
```

多格 stagger 且允许滚动重叠：

```ts
const jobs: Promise<void>[] = [];

for (const pos of positions) {
  await context.delay(0.25);
  jobs.push(
    (async () => {
      await cellSpin.roll(pos, targetAt(pos));
      cellSpin.getSymbol(pos).setState("appear");
    })(),
  );
}

await Promise.all(jobs);
```

这里必须使用由宿主 ticker 推进、支持 abort 的 frame delay，例如 operation context 的 `delay()`；不得用
`setTimeout()` 或 wall-clock sleep 猜测渲染时间。

同一组原子调用自然表达：

- full spin：遍历全部格；
- selective spin：只调用选中格；
- hold：不调用 held 格；
- refill spin：只调用 hole；
- stagger/wave：调用前插入明确 delay；
- landing appear：`roll/settle` resolve 后取得 symbol 并改变状态；
- anticipation：在明确的触发格落地后改变后续调用的 cadence、dimming 或 effect 编排；
- 并行 barrier：使用 `Promise.all()`。

调用方负责跨格顺序，不负责单格内部 reel 状态机。RenderCore 仍拥有本地公开轮带、临时目标窗口、cell mask、
symbol pool、spinBlur、低 FPS timeline slicing、落停原子提交、同格并发冲突、abort/cleanup，以及每个 timeline slice
对所有 occupied symbol player 恰好一次的 update。

### 落地前 cell effect

Nearwin 等 effect 可能在目标 symbol 落地前就在 cell 位置播放，不能通过尚不存在的目标 symbol 的
`getSymbol(pos)` 附加。该能力后续应设计为同样简单的 cell-level node/effect 原语，或由第二层组合已有节点能力；
不能为了它恢复整盘 plan、activation gate callback 或 drain edge API。

## 新 ReelSpin 第一层

`ReelSpin` 与 `CellSpin` 使用相同的第一层设计：它只执行一列的原子运动，不接收整盘 plan。它同时是
`SymbolArea`，因此任意一列落停后，最终 symbol 仍统一通过 `getSymbol({ x, y })` 取得。

```ts
interface ReelSpin extends SymbolArea {
  roll(
    x: number,
    target: ReelRollTarget,
    options?: ReelRollOptions,
  ): Promise<void>;

  start(x: number, options?: ReelRollStartOptions): void;

  settle(
    x: number,
    target: ReelRollTarget,
    options?: ReelRollOptions,
  ): Promise<void>;

  cancel(x: number): void;
  getReel(x: number): ReelRender;
}

interface ReelRollTarget {
  readonly symbols: readonly number[];
  readonly values?: readonly (number | null)[];
  readonly states?: readonly string[];
}

interface ReelRender {
  add(node: RenderObject, options?: ReelNodeOptions): void;
  remove(node: RenderObject): void;
}
```

语义固定为：

- `roll(x, target)`：已有整列目标，立即滚动该列，并在该列所有目标 symbol 完整落停后 resolve；
- `start(x)`：没有服务器目标时，只使用本地公开轮带启动该列持续滚动；
- `settle(x, target)`：向已经持续滚动的该列注入明确目标，并在整列落停后 resolve；
- `cancel(x)`：取消该列当前尚未落停的 rolling；targetless rolling 不根据当前画面伪造目标，targeted motion
  回滚未提交目标并拒绝其 Promise；
- `getReel(x)`：取得稳定 reel-space attachment 入口，用于整列 mask 内的 Nearwin、光效等节点；
- Promise resolve 时，目标列每个可见位置都已原子提交，所有 `getSymbol({ x, y })` 都可立即使用。

`target.symbols` 的长度必须与区域可见行数一致；`values/states` 存在时同样必须等长。非法列、长度、symbol、value、
state、同列并发、没有 active rolling 的 `settle()` 都显式失败。不同列可以并发，同一列只有一个 active transaction。

### 直接编排整列运动

普通整盘 spin 由调用方并发启动各列：

```ts
await Promise.all(
  scene.map((symbols, x) =>
    reelSpin.roll(x, {
      symbols,
      values: values[x],
    }),
  ),
);
```

targetless pre-spin 与服务器响应后的错峰落停同样直接表达：

```ts
for (let x = 0; x < columns; x += 1) {
  reelSpin.start(x);
}

const landings: Promise<void>[] = [];

for (let x = 0; x < columns; x += 1) {
  if (x > 0) {
    await context.delay(0.12);
  }

  landings.push(
    reelSpin.settle(x, {
      symbols: scene[x],
      values: values[x],
    }),
  );
}

await Promise.all(landings);
```

第一层不提供 `ReelSpinPlan`、full/selective/held mode、整盘 matrix command、stagger 数组或 completion polling。
调用方使用调用哪些列、frame-driven delay 和 `Promise.all()` 表达跨列顺序。部分格 hold、refill 或单格变化使用
`CellSpin`，不能把一列拆成 ReelSpin 的隐式 selective mode。

默认方向、速度、minimum cycles、bounce、mask 和常用 timing 在区域创建时绑定。每次调用的 options 只允许覆盖该列真正
需要的视觉参数与 `AbortSignal`。RenderCore 内部拥有公开轮带、临时目标窗口、pool/player、低 FPS timeline slicing、
原子提交、abort/destroy 和 Promise edge；这些内部 motion 数据不是 public plan。

### 与 standard reel 和 game003v2 的关系

`ReelSpin` 必须复用 standard `RenderReel` 的单轴运动核心。现有 standard batch spin/continuous 接口可以作为兼容 façade
保留，但必须翻译到同一组 per-reel transaction，不能继续维护第二个整盘状态机。

任务 200 以 game003v2 作为第一个正式 consumer：

- Scene Layout package runtime 按区域实例提供 `getReelSpin("main")`，不增加 singleton；
- request-time pre-spin 在同步 hook 中立即启动全部列，第一版不保留原 `startDelayMs` 的逐列启动错峰；
- response-time landing 使用 operation context 的 frame delay 保留列间 stop cadence，再以 `Promise.all()` 等待；
- 不再由 game003v2 计算或传入每轮 `localPhaseYs/finalY`，目标只包含服务器 scene/value；
- 不再轮询 `isMainReelSpinning()`，`roll/settle` Promise 本身就是 landing barrier；
- game ticker 把完整 delta 交给 runtime，由 ReelSpin 内部切片，不能以 `1/30` clamp 丢弃时间；
- win carousel 暂时继续使用现有 occurrence geometry compatibility API，本任务不把 geometry 加回 `SymbolRender`。

game003v2 迁移后，legacy standard Scene Layout 方法仍暂时可用，但它们只是同一 ReelSpin owner 的兼容入口。新游戏和新
operation handler 直接使用 `getReelSpin()`。

## Area presentation 与最高优先级 spin

普通 idle、win loop 或其它由游戏决定的场景表现使用直接的 await 编排：

```ts
await area.present(
  async (context) => {
    for (const group of groups) {
      const symbols = group.positions.map((pos) => area.getSymbol(pos));
      await Promise.all(
        symbols.map((symbol) =>
          symbol.playState("win", {
            completion: "once-complete",
            transitionMode: "immediate",
          }),
        ),
      );
    }
    await context.delay(1);
  },
  { repeat: true },
);
```

游戏决定单轮 presentation 内容，不管理 AbortController、generation、后台循环或 interruption error。默认 `present()`
等待整段 callback 完成；`repeat: true` 时 Promise 在首轮完成后 resolve，RenderCore 继续重复 callback，直到 spin 打断。
这使 operation 可以只等待首轮，而 lingering win/idle loop 不需要游戏手工创建 deferred Promise。一个 area 同时只拥有一个
game presentation。`area.spin.start()` 与 `area.spin.land()` 是最高优先级入口，内部先中断当前 presentation、阻止旧 await
continuation、清理 transient win layer，再调用绑定的 spin function。首轮完成前由 spin 产生的 interruption在
`area.present()` 边界正常结束；真实资源、state 或 player 错误继续 reject。

```ts
interface AreaSpinController {
  start(): void;
  land(target: AreaSpinTarget, options?: AreaSpinLandOptions): Promise<void>;
  cancel(): void;
}
```

RenderCore 提供所有列同时 start/land 的默认 `AreaSpinFunction`。游戏可以在 runtime 装配时注入同形扩展，例如 game003v2
只增加列间 landing delay；扩展仍只能调用逐列 ReelSpin 原子能力，不取得 plan、pool、display tree 或 interruption owner。
请求方只调用 `area.spin`，不显式 interrupt。

每列真正开始时，ReelSpin 以 immediate `spinBlur` 接管其 visible occurrence，正在等待的 symbol playback 被 supersede；
尚未开始的列仍可继续原 presentation。landing 建立全新的 target occurrences，不继承旧 win 状态。

通用文字通过 `createTextRenderObject()` 创建，使用 symbol 中心定位但挂入独立 win layer：

```ts
const anchor = area.getSymbol(middlePos).getPosition();
const amount = createTextRenderObject({ text: formatAmount(win), style });
amount.setPosition(anchor);
area.getLayer("win").add(amount);
```

## Legacy grid-cell 兼容边界

game002v2 当前依赖的以下能力保持：

- `GridCellReelSpinPlan` 与 `buildGridCellSpinPlan(stage)`；
- full/selective grid-cell spin；
- continuous start/settle/cancel；
- positions、timing、order、dimming 与 activation；
- scheduled effect、effect controller 和 effect sweep；
- started、landed、activated edge；
- existing/refill cascade movement；
- 当前 low-FPS、mask、pool、held 和 landing 行为。

兼容实现只增加 `SymbolArea.getSymbol()` 和对应 `SymbolRender` 能力。game002v2 可以逐步使用新 symbol 接口，但不要求
在同一任务迁移已有 batch state、spin plan、Nearwin controller 或 cascade 调用。现有 batch preflight 和 fail-stop
边界不能因改写成零散 Promise 而退化。

新 `CellSpin` 初期可以复用 legacy grid-cell 的单格运动核心，但不能复制出第三套 reel 状态机。未来功能只进入
`CellSpin` public surface；只有在不改变 game002v2 已验证行为时，才抽取或共享内部 primitive。

## LogicCore 与 RenderCore 边界

Public `Plan` 属于 logiccore：

- server 数据解析；
- operation 顺序和 closure；
- target scene/value；
- 哪些坐标变化或 held；
- source/target occurrence relation；
- immutable `SlotOperationPlanV2` finalization。

RenderCore 第一层不创建 `CellSpinPlan`、`ReelSpinPlan` 或 `RefillPlan`。operation handler 从 logiccore operation 取得
单格目标和坐标，再结合 manifest/app-owned presentation 配置直接调用 `roll/start/settle/cancel`。

旧 `GridCellReelSpinPlan` 是 game002v2 compatibility exception，不作为新架构命名或数据流的先例。
RenderCore 内部仍可创建私有 timeline/motion 数据，但它不是跨层的业务权威来源，也不对新游戏形成 public plan contract。

refill 同样按实际视觉原语执行：

- 使用单格转补 hole：对每个 hole 调用 `CellSpin.roll()`；
- 新 symbol 与 surviving symbol 一起下落：以后由独立 fall/drop 原语表达；
- 第二层将来可以提供 refill 语义封装，但第一层不增加统一 `RefillPlan`。

## 第二层安全组合

第二层不替代第一层，也不引入plan或业务DSL。游戏继续使用普通`for`、`await`和`Promise.all()`，RenderCore只接管
跨对象/跨await的ownership、批量preflight、坐标转换、motion clock和interruption cleanup：

- `area.getSymbols(positions)`返回exact-occurrence `SymbolGroup`，批量`setState/playState`先完整预检；
- Symbol、SymbolGroup center、area point和Scene Layout named node提供opaque `RenderAnchor`，游戏不读取Pixi matrix/bounds；
- value-tier数字使用`setValue/getValue`与`getPart({kind:"value"})`，命名image-string文字使用exact-name
  `setText/getText`与`getPart({kind:"text",name})`；part和whole symbol统一使用`clone/getAnchor`；
  manifest `initialText`只用于authoring preview，production业务值必须显式设置；
- package/runtime可显式注册per-symbol/per-node value-to-text formatter；它复用同一`setValue()`事务同步
  value tier与多个命名node，不改变resolver负责选择occurrence number的职责；
- presentation context提供`mount/unmount/withNode/move/transfer`，临时node显式声明`detach|destroy` ownership；
- callback success/error、repeat轮次、spin interruption和destroy统一cleanup；
- generic transfer只移动RenderObject或owned Symbol clone，不改变盘面；盘面occurrence relocation继续使用带lease/commit的专用原语；
- motion复用line/cubic path、easing和manual runtime clock，不引入RAF/timer/tween engine；
- `createAreaSpinFunction()`只装配column order与landing stagger，内部仍调用第一层`ReelSpin`。

第二层仍不知道CM、WM、CO、Win或任何component。`collectCoins/playWins/expandWild`等第三层业务模板等第二层实际consumer
稳定后另行讨论。

## 非目标

- 本文不实施或迁移代码；
- 不修改 game002v2 当前 grid-cell 行为；
- 不设计第三层模板；
- 不把普通整列转和单格转合并为一个巨型 union API；
- 不让游戏直接操作内部 Pixi/Spine/VNI display tree；
- 不允许服务器 scene 反查、缓存或推断服务器真实轮带；
- 不用 fallback、默认动画、首项资源或 placeholder 掩盖非法状态。
