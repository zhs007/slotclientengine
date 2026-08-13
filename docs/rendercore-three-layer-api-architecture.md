# RenderCore 三层 API 架构与边界

> 状态：架构规划。第一层与第二层骨架已经落地，仍在按真实游戏需求补齐；第三层只确定职责和候选模板，尚未冻结具体 API。
>
> 本文描述由游戏最终使用的 RenderCore 能力分层。它不取代第一层详细合同、LogicCore operation plan 或具体任务执行报告。

## 目标

RenderCore 相关 API 分为三个层次：

1. 第一层提供可以直接取得和操作的渲染对象，以及一次原子动作；
2. 第二层安全组合多个第一层对象和跨 `await` 生命周期；
3. 第三层用前两层实现常见玩法模板，减少游戏重复代码。

三层按“由谁决定玩法语义”划分，不按 class 继承、package 数量或功能复杂度划分。依赖只能向下：

```text
LogicCore immutable execution result
                 │
                 ▼
第三层：玩法模板 / gameframeworks façade
                 │
                 ▼
第二层：安全组合 / RenderCore composition
                 │
                 ▼
第一层：渲染对象与原子动作 / RenderCore primitives
```

上层不是强制通道。第三层模板可以直接使用第一层对象，游戏也必须能够随时跳过模板，回到第二层或
`area.getSymbol(pos)`。分层的目的只是降低常见玩法的使用成本，不能牺牲第一层的表达能力。

## 当前状态

| 层级   | 当前状态                       | 主要内容                                                                                             |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 第一层 | 已实施，进入合同收口阶段       | `SymbolArea`、`SymbolRender`、`RenderNode`、`ReelSpin`、`CellSpin`、area layer、原子 mutation        |
| 第二层 | 骨架已实施，继续由真实游戏补齐 | `SymbolGroup`、`RenderAnchor`、`PresentationScope`、motion/transfer、spin session、area spin factory |
| 第三层 | 只确定方向，尚未实施           | standard reel、cascade、hold-and-respin 等可选玩法模板                                               |

## 第一层：渲染对象与原子动作

### 职责

第一层回答两个问题：

- 游戏怎样取得一个明确的渲染对象；
- 游戏怎样让这个对象立即执行一件明确的原子操作。

第一层 public surface 应保持少量、直观，并允许游戏使用普通 TypeScript、`for`、`await` 和
`Promise.all()` 自行完成任意编排。

核心入口和对象包括：

- `SymbolArea.getSymbol(pos)`：从具体 area 实例取得当前位置的 exact `SymbolRender`；
- `SymbolRender`：改变 state/value/text，播放 state，附加或移除 `RenderNode`，取得位置或 anchor，创建 owned clone；
- `RenderNode`：统一表达文本、图片、Spine、粒子、光效、VNI 及后续 typed custom node；
- `ReelSpin.roll/start/settle/cancel`：执行单列原子运动；
- `CellSpin.roll/start/settle/cancel`：执行单格原子运动；
- `SymbolMutationArea.replaceSymbol/replaceSymbols`、occurrence transfer/drop 等明确盘面 mutation 原语；
- area/reel/cell 的安全 attachment 入口，不向游戏暴露 raw Pixi display tree。

示意：

```ts
const symbol = area.getSymbol({ x: 2, y: 1 });

symbol.setValue(25);
await symbol.playState("win");
symbol.add(glow);

await reelSpin.roll(2, target);
const landed = area.getSymbol({ x: 2, y: 1 });
```

### 第一层稳定合同

- RenderCore 不是进程级 singleton；每个转轮区或 symbol 区域都有独立 `SymbolArea` 实例。
- 不论普通整列转、单格转或 legacy grid-cell，落停后都通过相同的 `getSymbol(pos)` 取得 symbol。
- `getSymbol()` 捕获 exact occurrence。replacement、release、回池或 area destroy 后旧 façade stale，不按坐标偷偷重绑。
- `-1` 是所有 symbol area 和 spin 模型唯一的空图标 code，其它负数非法。
- 空位置同样返回内置的轻量 Empty `SymbolRender`。它没有贴图、动画资源或 pool entry，但保留 position、anchor 和节点附加能力；需要真实资源的 state、text 和非 null value 操作显式失败。
- reel 内 occurrence 是 borrowed，游戏不能 destroy；`clone()` 等显式创建的对象是 owned，按调用合同清理。
- state、资源、节点名、symbol code、position、ownership 或生命周期非法时显式失败，不使用 fallback 或 placeholder。
- 游戏不能取得内部 `RenderSymbol`、player、pool entry、Pixi `Container`、matrix 或 mutable display tree。

### 第一层禁止内容

第一层不提供：

- `SymbolSnapshot`、完整 `SymbolGeometry` 或 raw world transform；
- `CellSpinPlan`、`ReelSpinPlan`、`RefillPlan`、timeline DSL；
- `collectCoin()`、`playWin()`、`expandWild()` 等带玩法语义的方法；
- full/selective/held/cascade 等整盘业务命令；
- CM、WM、CO、WL、免费游戏或具体 component 的识别逻辑。

判断一项能力是否属于第一层：

> 如果游戏取得一个明确对象后，可以立即让它做一件不需要解释玩法含义的事情，它属于第一层。

## 第二层：安全组合能力

### 职责

第二层仍不知道具体玩法。它只接管多个第一层对象跨对象、跨坐标系或跨 `await` 组合时容易重复出错的机械工作：

- 批量 preflight，避免部分 symbol 已开始而后续成员才发现非法；
- 临时节点的 mount、detach、destroy 和 ownership 账本；
- repeat、失败、spin interruption 与 runtime destroy 时的统一 cleanup；
- symbol、group、area point 和 Scene Layout named node 之间的坐标换算；
- motion path、easing 和唯一 manual runtime clock；
- 多列或多格 spin session 的 pending、land、cancel 和 stale 边界；
- 通用顺序、并行和 stagger 装配。

已经形成的第二层能力包括：

- `area.getSymbols(positions)` 与 exact-occurrence `SymbolGroup`；
- opaque `RenderAnchor`；
- `area.present()` 的 `PresentationScope`；
- `mount/unmount/withNode/move/transfer`；
- `createReelSpinSessionController()` 与 `createCellSpinSessionController()`；
- `createAreaSpinFunction()` 的 column order 与 landing stagger 装配。

典型形态仍然是直接的 `for/await`：

```ts
await area.present(async (scope) => {
  for (const win of wins) {
    const symbols = area.getSymbols(win.positions);
    await scope.withNode(
      area.getLayer("win"),
      createAmountNode(win.amount),
      {
        anchor: symbols.getAnchor({ align: "center" }),
        ownership: "destroy",
      },
      () => symbols.playState("win"),
    );
  }
});
```

### 第二层接下来的候选方向

这些方向需要由 Crave、game003v2 或后续真实游戏验证后再冻结 API：

1. **spin 生命周期扩展点**：允许游戏在 reel start、spinning、before-land、land、complete 等中性边界附加效果或调整表现；扩展点只取得当前 reel/cell、可见 symbol 和 presentation context，不取得业务 operation 解释权。
2. **symbol/node/value 的统一移动组合**：收敛 owned clone、命名文字、value presentation 和 occurrence relocation 的调用习惯，同时继续区分“临时展示并 cleanup”和“提交盘面 mutation”。
3. **popup 与 transition 的 await 组合**：确保 start 不可跳过、loop 点击立即进入 end、popup 完成后才继续转场；是否播放、何时播放和播放哪个 popup 仍由游戏决定。

### 第二层禁止内容

- 不建立 `PresentationPlan`、`MotionPlan` 或 JSON/YAML choreography DSL；
- 不解析 LogicCore operation kind，不从 server 数据推断业务结果；
- 不识别 Win、Coin、Wild、免费游戏、Near-win 或具体 symbol code；
- generic motion 不自动提交目标 symbol value 或盘面 mutation；
- 不把游戏的 `for/await/Promise.all()` 隐藏成不可观察的巨型状态机；
- 不阻止游戏对单个特殊对象回落到第一层操作。

判断一项能力是否属于第二层：

> 如果它协调多个渲染对象，但规则对所有玩法都成立，并且主要解决 ownership、坐标、时钟、批量一致性或中断问题，它属于第二层。

## 第三层：玩法模板

### 职责与位置

第三层开始理解常见玩法结构，用第一层和第二层实现可选的简化模板。它是游戏侧的 convenience layer，默认应位于
`packages/gameframeworks` 或职责等价的独立 recipes/template 模块，而不是继续扩大 RenderCore 核心 primitive surface。

候选模板包括：

```ts
createStandardReelGamePresentation(...);
createCascadeGamePresentation(...);
createHoldAndRespinPresentation(...);
```

模板可以理解这些中性以上的业务事实：

- 哪些位置中奖、hold、remove、drop 或 refill；
- Coin/value 从哪里收集到哪里；
- 哪些 symbol 互动、复制、扩展或变化；
- 何时播放庆祝 popup；
- 何时进入或离开免费场景；
- Near-win、落停延迟和玩法阶段顺序。

游戏通过 strict typed config、resolver、formatter 和 callback 注入 symbol state 名、资源绑定、金额样式与具体业务规则。
共享模板不得硬编码游戏名、component 名、symbol code 或 manifest 中已经存在的第二份资源表。

### 模板的逃生口

第三层必须允许局部覆盖，而不是要求游戏复制整个模板：

```ts
const presentation = createStandardReelGamePresentation({
  area,
  resolveWinState,
  createWinAmountNode,
  async onBeforeLand(context) {
    // 可以使用第二层组合，也可以直接回到第一层对象。
    context.area.getSymbol(context.position).add(customEffect);
  },
});
```

逃生口必须是显式、typed 的生命周期边界，不能暴露模板内部 mutable state、raw display tree 或隐式 renderer lease。

### 第三层禁止内容

- 不建立一个包办所有玩法的 `renderOperations(operations)` 巨型模板；
- 不重新在 RenderCore 创建与 LogicCore 竞争的 gameplay plan；
- 不在共享模板硬编码 Crave、Minecart、game002、game003 或业务 symbol code；
- 不从画面当前状态反推服务器结果、真实轮带或业务连续性；
- 不让模板成为唯一入口，或阻止游戏混用第三层、第二层与第一层；
- 不为尚无真实 consumer 的玩法预建大而全的 DSL。

判断一项能力是否属于第三层：

> 如果它需要知道“为什么播放”、需要解释玩法阶段或需要认识 Win/Coin/Wild/Free 等业务概念，它属于第三层或具体游戏。

## LogicCore、RenderCore 与游戏的边界

LogicCore 继续拥有 server 数据解析、严格验证、operation closure 和画面 mutation 前的 immutable execution result。
RenderCore 第一层和第二层不创建另一套 public gameplay plan。

推荐的数据与调用方向是：

1. LogicCore 编译并证明本轮业务结果；
2. gameframeworks coordinator 或游戏 adapter 将已验证结果映射为第三层模板调用，或直接调用第二层/第一层；
3. 第三层决定常见玩法顺序；
4. 第二层保证组合安全；
5. 第一层执行渲染对象的原子动作。

第三层可以消费已验证的 typed 业务事实，但不能重新解析不可信 server payload，也不能在渲染后反向验证或重建另一份
scene/value 权威数据。legacy `GridCellReelSpinPlan` 只作为 game002v2/Crave 兼容例外，不是新三层架构的先例。

## 跨层共同合同

### Spin 优先级与中断

- 默认 idle、win loop 或其它长期 presentation 的内容由游戏决定，并可使用 await 风格持续播放；
- area spin 是最高优先级操作；
- 游戏调用 area spin 时，由 area 内部中断当前 presentation、清理 transient node 和 pending motion，再接管 reel/cell；
- 游戏不需要理解或持有内部 `AbortController`；
- 中断不是错误降级：已完成的画面 mutation 不倒放，未完成 waiter 按合同 settle/reject，临时资源必须收敛清理。

### 失败与资源所有权

- 所有层都使用 strict typed input；unknown kind/state/resource/node/position/code/version 显式失败；
- borrowed 对象不能 destroy，owned 对象必须有唯一 cleanup owner；
- mutation 前能完成的验证应先完整 preflight；
- 异步失败不得留下半挂载节点、活动 waiter、未释放 clone 或半提交盘面；
- manifest、YAML 或 versioned config 仍是资源、时序和变体绑定的唯一来源。

### 分层不是重复实现

- 第一、第二、第三层必须复用同一 reel、cell、symbol、player、pool、ticker 和 motion owner；
- 上层只能组合或配置下层，不得复制一套内部状态机；
- public API 可以由同一个 façade 暴露。例如 `ReelArea.getSymbol()` 属于第一层，`ReelArea.present()` 属于第二层；层级描述职责，不要求每层对应独立 class。

## 推进顺序

1. 冻结第一层核心命名与生命周期，只继续修复 standard/cell/grid-cell/empty symbol 的合同一致性；
2. 用 Crave 和 game003v2 的真实表现补齐第二层 spin hook、移动组合和 popup/transition 组合；
3. 先用结构简单的 standard reel 游戏验证一个第三层模板；
4. 再由真实 cascade 与 hold-and-respin consumer 反推对应模板；
5. 模板稳定后再决定其最终 package/entrypoint，不提前建立通用玩法 DSL。

## 相关文档

- [RenderCore operation 渲染第一层接口设计](./rendercore-operation-first-layer-api.md)
- [Crave RenderCore direct API 迁移说明](./crave-rendercore-direct-api-migration.md)
- [Slot operation plan](./slot-operation-plan.md)
- [Shared game runtime rules](./agent-rules/shared-game-runtime.md)
