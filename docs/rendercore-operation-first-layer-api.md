# RenderCore operation 渲染第一层接口设计

> 状态：任务 199 已实施；本文同时作为第一层 public contract。
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

## SymbolRender

`getSymbol()` 返回游戏可直接操作的 `SymbolRender`。游戏代码不接触 `SymbolHandle` 名称，也不需要理解
内部 occurrence generation、player、pool 或 display tree ownership。

第一层目标形状：

```ts
interface SymbolRender {
  setState(state: string): void;
  playState(state: string, options?: SymbolPlayOptions): Promise<void>;
  setValue(value: number | null): void;
  getValue(): number | null;

  add(node: RenderNode, options?: SymbolNodeOptions): void;
  remove(node: RenderNode): void;

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

第一层不提供 `SymbolSnapshot` 或完整 `SymbolGeometry`。跨 symbol、scene node 或其它目标的坐标换算由
RenderCore 内部 anchor/motion 能力处理，游戏不计算 reel-space、scene-space 和 world-space 变换。

### 节点与 clone

Spine、VNI、粒子、光效、图片和后续 typed custom node 应统一表现为 `RenderNode`，而不是为每种资源在
`SymbolRender` 上增加专用方法。节点的创建、播放和资源校验属于 RenderCore；`add/remove` 只负责附加关系。

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

`getCell(pos)` 只提供稳定 cell-space 的 `RenderNode add/remove`，用于目标尚未落地前的
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

## 第二层方向

第二层可以用第一层原子操作封装常见组合，例如 full cell spin、selective spin、held respin、wave、refill 和
anticipation。它应是可选便利层：模板无法覆盖的游戏仍可直接调用第一层，不需要修改 RenderCore 内部状态机。

本文不冻结第二层函数名、配置形状或第三层 operation handler 模板。

## 非目标

- 本文不实施或迁移代码；
- 不修改 game002v2 当前 grid-cell 行为；
- 不设计第三层模板；
- 不把普通整列转和单格转合并为一个巨型 union API；
- 不让游戏直接操作内部 Pixi/Spine/VNI display tree；
- 不允许服务器 scene 反查、缓存或推断服务器真实轮带；
- 不用 fallback、默认动画、首项资源或 placeholder 掩盖非法状态。
