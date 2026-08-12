# 201 rendercore-second-layer-composition-api 任务计划

## 1. 目标与完成定义

### 目标

在任务 199/200 已建立的 `SymbolArea/SymbolRender/ReelArea/ReelSpin/CellSpin` 第一层原子接口之上，增加一组仍以普通
TypeScript、`for`、`await` 和 `Promise.all()` 使用的第二层安全组合能力：presentation scope 自动管理临时节点生命周期，
anchor 统一表达 symbol/group/scene node 的定位关系，SymbolGroup 提供批量预检和一致播放，motion/transfer 负责跨对象移动、
坐标换算和 clone cleanup，并提供可复用的 area spin 装配函数。

第二层不是 plan、operation DSL 或业务模板。游戏继续决定 Win、Coin 收集、Symbol 互动、播放顺序和业务含义；RenderCore
只接管容易重复出错的 ownership、打断、批量一致性、跨坐标系转换和异步清理。

以 game003v2 的 Win 循环作为第一条直接 consumer 验证路径：保留当前 `for + await` 业务编排，同时移除手写金额节点
`add/try/finally/remove/destroy`、中奖组中心计算和完整自定义 `AreaSpinFunction`。

### 完成定义

- [ ] `SymbolAreaPresentationContext` 提供 scoped node mount/withNode；callback 正常完成、失败、repeat 下一轮、spin interruption
      和 area destroy 都会按明确 ownership 自动 detach/destroy，游戏不再手写对称 cleanup。
- [ ] RenderCore public contract 提供不泄露 Pixi transform/display tree 的 `RenderAnchor`；可由单个 Symbol、SymbolGroup、
      area-local point 和显式 Scene Layout named node 建立，并由 RenderCore 完成 source/target layer 坐标转换。
- [ ] `SymbolArea.getSymbols(positions)` 返回轻量 `SymbolGroup`；批量 state/play/node 操作在任何 mutation 前完整预检，支持明确
      parallel/sequential 模式，任一非法/stale occurrence 不留下部分播放或部分 attachment。
- [ ] 通用 motion/transfer 可移动普通 RenderNode 或 owned Symbol clone，从 anchor 到 anchor，以 manual runtime clock 推进；
      completion、abort、spin interruption、失败和 destroy 不留下临时节点、parent、waiter 或 owned clone。
- [ ] 第二层 motion 与任务 197 已存在的 grid-cell occurrence transfer 复用或收敛同一 path/easing/sampling primitive；不得
      建立两套含义冲突的坐标、时钟或 cleanup contract。legacy grid-cell commit/lease 语义保持兼容。
- [ ] 提供基于第一层逐列 `ReelSpin` 的 typed area spin function factory，至少覆盖同步 start、指定列顺序和固定 landing stagger；
      不重新引入 `ReelSpinPlan`、matrix command 或 operation DSL。
- [ ] game003v2 使用 `SymbolGroup`、anchor、scoped node 和通用 stagger spin factory；Win 单轮核心保持直接可读，业务 amount/style、
      groups 顺序和 cycle pause 继续由 app 决定。
- [ ] game003v2 的 Win 首轮 resolve、后台 repeat、下一 Spin 打断、金额层级/位置、120ms 逐列落停、CO value 和 popup 行为保持。
- [ ] public exports、RenderCore/game003v2 README、长期接口文档、最小领域规则、定向测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- `PresentationScope`：`mount/unmount/withNode`、ownership、块级 cleanup、repeat cycle cleanup 和 interruption cleanup。
- `RenderAnchor`：Symbol、SymbolGroup、area point、Scene Layout named node 的受控 anchor；内部坐标转换和 stale validation。
- `SymbolGroup`：严格 positions normalization、批量预检、parallel/sequential state playback 和必要的 node attachment 组合。
- 通用 `move/transfer`：RenderNode/owned Symbol clone、line/cubic path、easing、duration、layer attachment、manual update、abort/destroy。
- 任务 197 grid-cell transfer sampler/clock/lifecycle primitive 的复用或最小重构，保持其 public compatibility。
- `createAreaSpinFunction()` 或职责等价的 typed factory：start/land order、stagger 和默认逐列原子调用。
- game003v2 Win 和 area spin 装配迁移，以及直接保护第二层边界的 source-boundary/behavior tests。
- rendercore public API、README、第一层/第二层长期合同与 `shared-game-runtime/game003` 最小规则更新。

### 不包含

- 不增加第三层 `collectCoins/playWins/expandWild` 等业务模板，不在 RenderCore 识别 CM、WM、CO、WL 或游戏 component。
- 不设计 JSON/YAML choreography、timeline DSL、`PresentationPlan`、`MotionPlan`、`ReelSpinPlan` 或新的 logiccore operation schema。
- 不把 raw Pixi `Container/DisplayObject/Matrix/worldTransform`、Spine/VNI player 或 pooled `RenderSymbol` 暴露给游戏。
- 不让 `SymbolRender.getPosition()` 膨胀为完整 geometry/snapshot API；第一层 center API 保持兼容，第二层优先使用 anchor。
- 不迁移 game002v2 到新第二层，不扩展或删除 legacy grid-cell plan/effect/cascade；只在共享 motion primitive 必须收敛时修改底层。
- 不实现 Symbol 扩展、1x1→1x3、大图标占格、hold、收集业务规则或 scene mode transition；本任务只提供可组合原语。
- 不新增 tween/particle 第三方依赖，不修改 lockfile、manifest/YAML、正式 assets、生成物或根工具链。
- 不在本任务删除第一层 `getLayer/add/remove/getPosition/map + Promise.all`；它们继续是最灵活 fallback。

## 3. 制定计划时的基线

```text
UTC: 2026-08-12T06:19:31Z
HEAD: 42368a42bb70183f37494fb9af1d536bb53f360d
branch: codex/task-199-rendercore-first-layer-api
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/{task-discussion,task-plan}.md`、
  `docs/agent-rules/{shared-game-runtime,game003}.md`、任务 197/199/200、第一层接口文档和 RenderCore/game003v2 直接实现；
  目标目录无补充 `AGENTS.md`。
- `packages/rendercore/src/reel/reel-area.ts` 当前提供 `getSymbol/getLayer/present/spin`；`present(..., { repeat: true })` 首轮
  resolve 后由 area 持有后台重复，spin 自动 interruption。
- `packages/rendercore/src/symbol/{render-node,symbol-render}.ts` 当前提供安全 RenderNode、SymbolRender state/play/add/remove/clone
  和 area-local center，但没有 scoped mount、anchor 或 group。
- `apps/game003v2/src/round-adapter.ts` 当前 Win 已是单轮 `for + await`，但每组仍手写 TextRenderNode 创建、中心 Symbol 选择、
  layer add/remove/destroy；area spin 仍为 app 实现完整 `AreaSpinFunction` 以表达 120ms landing cadence。
- `packages/rendercore/src/reel/render-grid-cell-reel-set.ts` 与任务 197 已有 grid-cell occurrence transfer scope、manual update、
  line/cubic path、easing、lease/commit/rollback。它处理“移动盘面 occurrence 并提交 source/target”的低层语义，不直接等于
  本任务“移动临时 RenderNode/clone 到 anchor”；公共 sampler、clock 和 cleanup 不应重复实现。
- Scene Layout package runtime 已拥有 named nodes 和统一 `runtime.update()`，但稳定 package `getLayer()` 只公开
  `layout | reel | transition | popup` borrowed container；第二层 anchor 可解析 named node，不扩大 raw layer mutation surface。
- 当前规划会话只创建任务 201 文档；不修改源码、不安装依赖、不运行构建或测试。

## 4. 需求解释与技术决策

### 需求解释

- 第一层继续负责“取得一个对象并直接操作”；第二层只封装跨对象或跨 await 的安全机械工作，不取代 `getSymbol()`。
- 第二层 API 必须让游戏代码仍清楚表达业务顺序。`for/await/Promise.all` 是正式编排方式，不把流程编译成匿名 plan。
- “Anchor”表达位置关系和坐标 owner，不等同于向游戏返回 world coordinate；游戏只在确有同 area 静态定位时继续使用
  `getPosition()`。
- “SymbolGroup”核心价值是先完整验证再批量提交，不只是少写一次 `map()`；单 Symbol 定制仍回到第一层。
- “Transfer”分两类：临时 node/clone presentation 只移动并 cleanup；grid-cell occurrence transfer 还拥有盘面 lease/commit。
  两者共享 motion 基础设施，但不能模糊 occurrence identity 和 scene mutation 边界。
- “Spin helper”是 runtime 装配时的 typed function factory，不是每轮提交的 plan；游戏仍通过 `area.spin.start/land/cancel` 使用。

### 关键决策

1. **Presentation scope 先建立统一资源账本。**
   - context 提供块级 `withNode(layer, node, options, playback)`；`mount()` 只在需要跨多个 await 手动提前卸载时使用。
   - options 明确 anchor、order 和 ownership；默认 ownership 不猜测，推荐 owned 临时 node 使用 `destroy`，borrowed node 使用
     `detach`。重复挂载、跨 parent、错误 owner 或重复 destroy 显式失败。
   - 每次 repeat callback 是独立 child scope；一轮结束时清理该轮未显式卸载的 transient node，防止跨轮累积。

2. **Anchor 是 opaque capability，不是 geometry DTO。**
   - public `RenderAnchor` 只携带 RenderCore 可验证的 owner/identity；不公开 mutable matrix、bounds 或 display object。
   - `symbol.getAnchor()` 捕获 exact occurrence；stale/release/pool 后失败。`group.getAnchor({ align: "center" })` 从成员中心计算；
     第一版 align 只支持有真实需求的 center，不预埋九宫格或 arbitrary offset DSL。
   - area point 和 named scene node anchor 必须声明目标 coordinate owner；实际转换在 mount/move 时按当前 transform 计算，跨 area
     或 viewport 变化不由游戏手算。

3. **SymbolGroup 使用 transactional preflight。**
   - `area.getSymbols(positions)` 保持输入顺序、拒绝空组/重复位置/非法或 stale occurrence，并捕获 exact identities。
   - `playState()` 默认 parallel，可显式 sequential；开始前检查所有 state/player/completion 能力。若 preflight 失败，任何成员
     都不改变。运行中真实 player failure 遵循 fail-stop并统一中断剩余 waiters，不倒放已经完成动画。
   - 不为每个 SymbolRender 方法机械复制 group 方法；只增加有批量一致性价值的 state/play 和 scoped attachment seam。

4. **Motion 使用唯一 manual clock 和严格 typed input。**
   - 提取/复用任务 197 的 path/easing sampler，不引入 GSAP、RAF 或 wall-clock timer。area/runtime update 是唯一推进源。
   - `context.move/transfer` 接受 node、from/to anchor、duration、path/easing、目标 layer/order 和 ownership；输入在 mutation 前
     normalize/freeze，unknown kind、非法时间、失效 anchor 或跨 runtime owner 显式失败。
   - 普通 node transfer 不改变盘面；Symbol clone 必须是 owned clone，成功/失败/abort 后按 ownership cleanup。移动 borrowed
     visible Symbol 明确失败，需盘面 relocation 时使用 occurrence transfer 原语。

5. **收敛而非复制任务 197 transfer 基础设施。**
   - path/easing/sampling、frame delay、active waiter 和 abort/destroy cleanup 提取为 rendercore internal presentation motion core。
   - grid-cell transfer 继续拥有 source/target lease、replacement/hole 和 explicit commit；新的 generic transfer 不获得 commit API。
   - 现有 task 197 public signatures 原则上 additive compatibility；若当前实现尚未对外稳定，可在执行报告记录最小命名调整，
     但不得迁移 game002/game002v2 或改变既有盘面结果。

6. **Area spin factory 只组合 ReelSpin 原子调用。**
   - factory 输入限定为 start/land column order、非负 stagger seconds 或 typed delay resolver；生成现有 `AreaSpinFunction`。
   - default simultaneous behavior 继续存在。game003v2 使用 left-to-right、landing 120ms，配置仍来自 app config。
   - factory 不接受 scene matrix plan、held positions、业务 predicate、completion polling 或 state 名。

7. **game003v2 是可读性和边界验收，不是第二层特例。**
   - 目标调用形态接近：

     ```ts
     return area.present(
       async (context) => {
         for (const win of wins) {
           const symbols = area.getSymbols(win.positions);
           const amount = createTextRenderNode({
             text: formatAmount(win.amount),
             style,
           });
           await context.withNode(
             area.getLayer("win"),
             amount,
             {
               anchor: symbols.getAnchor({ align: "center" }),
               ownership: "destroy",
             },
             () => symbols.playState("win"),
           );
         }
         await context.delay(cyclePause);
       },
       { repeat: true },
     );
     ```

   - 具体名称可按 TypeScript 风格小幅调整，但最终不得恢复 deferred Promise、raw container、geometry snapshot 或 app-owned
     cleanup bookkeeping。

## 5. 职责与合同

- **游戏/operation handler**：拥有业务 groups/routes、播放顺序、amount/style/formatter、使用哪个 state、并行/串行选择和
  何时开始 Spin；不拥有资源账本、坐标转换或 motion ticker。
- **PresentationScope**：拥有当轮 transient mount、owned cleanup、repeat child scope、interruption propagation 和真实错误上抛。
- **RenderAnchor**：拥有 exact source identity、coordinate owner 和 resolve-time validation；不成为业务坐标存储或 geometry API。
- **SymbolGroup**：拥有成员 immutable identity、批量 preflight、一致 start/cancel barrier；不解释中奖或 symbol code。
- **Motion core**：拥有 path/easing sampling、manual elapsed、anchor resolution、temporary parent、abort/destroy 和 completion Promise。
- **Grid-cell occurrence transfer**：继续独占盘面 occurrence lease/commit/rollback；generic transfer 不能提交 scene mutation。
- **Area spin factory**：只生成 typed `AreaSpinFunction`，内部调用 `ReelSpin.start/roll/settle/cancel`；不拥有 server operation。
- **失败策略**：unknown layer/anchor/state/motion/easing、empty/duplicate/stale group、invalid timing/order/ownership、cross-runtime anchor、
  borrowed transfer、active scope conflict、missing resource/player 都显式失败；不 fallback center/normal/linear 或静默 detach。
- **资源生命周期**：node creator 明确 owned/borrowed；scope 只按声明 detach/destroy。anchor/group 不延长 occurrence 生命周期；
  pool/replacement/destroy 使其 stale。任何异步失败都先收敛已启动 cleanup，再 reject。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/presentation/presentation-scope.ts
packages/rendercore/src/presentation/render-anchor.ts
packages/rendercore/src/presentation/presentation-motion.ts
packages/rendercore/src/symbol/symbol-group.ts
packages/rendercore/tests/presentation/presentation-scope.test.ts
packages/rendercore/tests/presentation/render-anchor.test.ts
packages/rendercore/tests/presentation/presentation-motion.test.ts
packages/rendercore/tests/symbol/symbol-group.test.ts
tasks/201-rendercore-second-layer-composition-api-<utctime>.md
```

实现时可按现有 package 目录风格把 presentation 文件放入 `symbol/` 或 `reel/`，但 anchor/scope/motion 不能在多个 runtime
复制定义。

### 预计修改

```text
packages/rendercore/src/{index}.ts
packages/rendercore/src/symbol/{index,render-node,symbol-render}.ts
packages/rendercore/src/reel/{index,reel-area,render-reel-set}.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/tests/reel/{render-reel-spin,render-grid-cell-reel-set}.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/README.md
apps/game003v2/src/round-adapter.ts
apps/game003v2/tests/source-boundary.test.ts
apps/game003v2/README.md
docs/rendercore-operation-first-layer-api.md
docs/agent-rules/{shared-game-runtime,game003}.md
```

### 原则上不应修改

```text
packages/logiccore/**
packages/{gameframeworks,uiframeworks,netcore}/**
apps/game002v2/**
apps/game002/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若实现需要新增第三方 tween 依赖、修改 operation/schema/manifest、迁移 game002v2、增加业务模板或开放 raw display tree，属于
重大范围扩大，必须停止说明，不能通过修改计划事后合理化。

## 7. 实施步骤

1. **确认基线并固定第一层兼容行为**
   - 重新核对 HEAD/status、任务 197/199/200 报告、现有 public exports、ReelArea repeat lifecycle 和 game003v2 tests。
   - 为第一层 `getSymbol/getPosition/getLayer/present/spin` 补必要兼容断言，确保第二层是 additive façade而非替代实现。

2. **建立 PresentationScope 和资源账本**
   - 扩展 presentation context，实现 `mount/unmount/withNode`、明确 ownership、order、幂等 cleanup 和 repeat child scope。
   - 把 callback success/error、spin interruption、destroy 与 node playback failure 纳入同一 cleanup barrier；真实错误 cleanup 后上抛。
   - 测试 borrowed/owned node、nested block、manual unmount、repeat 不累积、interruption/destroy 和 cleanup failure。

3. **建立 RenderAnchor 与 Scene Layout 路由**
   - 定义 opaque anchor capability和内部 resolver，接入 SymbolRender、area point、SymbolGroup center及exact named scene node。
   - 实现 layer-local转换、stale/cross-runtime validation和viewport transform后的resolve-time定位，不暴露Pixi Matrix/Container。
   - 测试同 area、跨 layer、scene node、stale symbol、destroyed runtime和非法 owner。

4. **实现 SymbolGroup transactional batch**
   - 增加 `getSymbols()`、identity capture、empty/duplicate/position validation和group anchor。
   - 实现批量 state/play preflight、parallel/sequential barrier与运行中失败后的 waiter cleanup；避免 partial preflight mutation。
   - 用 mixed resource/state、stale member、duplicate position、abort和顺序测试固定合同。

5. **收敛 motion core 并实现 generic transfer**
   - 从 grid-cell transfer 提取/复用 path/easing sampler、manual elapsed和abort/destroy waiter；保持现有 occurrence transfer结果。
   - 在 presentation scope 增加 generic node/clone move/transfer，使用 anchors、目标 layer/order和ownership，不提供scene commit。
   - 覆盖端点、line/cubic/easing、低FPS完整delta、cross-area、spin interruption、clone destroy、borrowed rejection和真实失败。

6. **实现 typed area spin factory**
   - 基于现有 `defaultAreaSpinFunction` 提供 simultaneous/staggered、column order和frame delay组合；严格验证重复/越界列和时间。
   - 保证partial start rollback、settle/roll选择、cancel和Promise barrier继续委托第一层唯一transaction owner。

7. **迁移 game003v2 验证第二层**
   - Win 使用 `getSymbols/group anchor/context.withNode`；删除 `selectMiddleSymbol()` 和 app-owned layer cleanup。
   - area spin 装配改用通用 stagger factory，删除完整自定义 `AreaSpinFunction` 实现；保留config 120ms与left-to-right顺序。
   - source-boundary 禁止 deferred loop、manual transient cleanup、geometry/raw container和自定义逐列spin复制。

8. **同步文档、规则与L2验收**
   - 更新 RenderCore/game003v2 README、第一层文档中的第二层章节和最小 shared/game003规则；不把精确游戏配置复制进shared规则。
   - 运行第8节命令，生成UTC中文执行报告；浏览器视觉验收明确留给用户。

## 8. 测试与验收

### 测试原则

- scope测试必须覆盖 success/error/interruption/repeat/destroy五条cleanup路径，并验证detach/destroy恰好一次。
- anchor测试验证坐标owner和resolve-time转换，不以暴露raw matrix或固定world coordinate简化测试。
- SymbolGroup测试先证明全组preflight，再证明parallel/sequential运行边界；非法成员不能产生部分state变化。
- generic transfer与grid-cell occurrence transfer分别验证“只移动临时表现”和“提交盘面mutation”，防止API语义混淆。
- manual ticker推进Promise；不使用`setTimeout()`、RAF或直接修改private elapsed。
- game003v2 source-boundary保护简单调用形态，行为测试保护首轮/repeat/spin interruption和120ms landing。

### 验收级别

采用 `L2`：任务新增 RenderCore 跨模块 public API、收敛共享 motion/lifecycle primitive，并迁移直接 consumer game003v2。
无需 L3，因为不修改根工具链、lockfile、正式 schema/YAML/assets或全仓 consumer。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/symbol/symbol-group.test.ts tests/reel/render-reel-spin.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game003v2 test
pnpm --filter game003v2 typecheck
git diff --check
```

### 人工验收

由用户浏览器验收 game003v2：每组中奖 Symbol 同步播放、金额中心和最上层显示、组间/轮间节奏、首轮后可点击 Spin、Spin
无异常中断后台循环、下一轮无残留文字、五列同步 pre-spin、120ms逐列落停、CO value和popup。自动化不能替代视觉结果。

### 独立验收建议

`建议`。本任务涉及跨模块 public contract、异步ownership、坐标转换、后台repeat和共享motion core。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/symbol/symbol-group.test.ts tests/reel/render-grid-cell-reel-set.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter game003v2 test
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell缺Node时按根规则加载工作区Node runtime。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置代理并重试原命令。
- 本任务不新增依赖、不修改lockfile；motion复用现有RenderCore manual ticker和任务197 sampler。

## 10. 生成物、文档与规则

- 本任务无YAML、schema、assets或生成物变化，不运行无关generator。
- 更新`packages/rendercore/README.md`、`apps/game003v2/README.md`和`docs/rendercore-operation-first-layer-api.md`，明确第一层、
  第二层和未来第三层边界。
- `docs/agent-rules/shared-game-runtime.md`只记录稳定的scope/anchor/group/motion ownership约束；game003具体使用方式进入
  `docs/agent-rules/game003.md`，不修改根`AGENTS.md`。

## 11. 执行报告

执行完成后创建：

```text
tasks/201-rendercore-second-layer-composition-api-<utctime>.md
```

报告简要记录最终API、实际文件、任务197 primitive收敛方式、game003v2简化结果、验收命令、待用户浏览器验收和剩余风险。

## 12. 风险、假设与待确认

### 风险

- opaque anchor跨Scene Layout层和viewport transform的转换若依赖当前raw container层级，容易形成隐藏耦合；必须由内部resolver测试固定。
- repeat presentation首轮resolve后发生的真实错误没有原调用方Promise可reject，必须继续通过runtime update fail-stop显式抛出。
- task197 grid-cell transfer同时拥有lease/commit；过度抽象会把generic motion与scene mutation混合，只复用纯motion和cleanup部分。
- SymbolGroup批量preflight需要player/resource提供无mutation检查能力；若现有API只能边请求边验证，应先补internal prepare而不是接受partial mutation。

### 假设

- 第一版group anchor只需要中奖组center；其它align、bounds和offset可由真实玩法需求再增加。
- generic transfer第一版覆盖RenderNode和owned Symbol clone，不直接移动borrowed盘面Symbol。
- game003v2仍是第二层第一条正式consumer；game002v2迁移和第三层业务模板另开任务。

### 待确认

无。已确认第二层顺序为PresentationScope、RenderAnchor、SymbolGroup、Motion/Transfer、AreaSpinFunction factory，第三层待第二层
实际consumer形态稳定后再设计。

## 13. 完成清单

- [ ] 目标和非目标已满足，第二层没有演变为plan或业务DSL。
- [ ] 第一层API和legacy grid-cell行为保持兼容。
- [ ] scope、anchor、group、motion、spin factory职责和lifecycle符合计划。
- [ ] game003v2重复机械代码已删除且业务编排仍清晰。
- [ ] RenderCore/game003v2定向测试、typecheck/build和diff check通过。
- [ ] README、长期合同、领域规则和UTC中文执行报告已同步。
- [ ] 浏览器人工验收明确记录为待用户完成。

## 14. 执行会话交接

执行会话应读取根`AGENTS.md`、本计划、`shared-game-runtime.md`、`game003.md`和任务197/199/200相关报告；先核对Git基线，
再按步骤实施。允许对当前命名做不改变语义的小幅适配并在报告记录；若需要新增依赖、修改schema/assets、迁移game002v2、
引入业务模板或开放raw Pixi对象，必须停止说明。除非用户明确要求，不commit、不push、不创建PR。
