# 202 rendercore-planless-spin-and-mutation-api 任务计划

## 1. 目标与完成定义

### 目标

在任务 199/200 的第一层和任务 201 的第二层之上，增量建立 RenderCore 的 direct/session API：

- settled symbol 的 replacement、批量 value/state、occurrence transfer 和 cascade drop 都成为可直接 `await` 的原子接口；
- spin 期间提供真实运行中的 `SpinSession`、`SpinningReel` 和 `SpinningCell`，游戏可以在滚动阶段附加效果、调整表现和决定后续落停；
- 游戏继续使用普通 TypeScript、`for`、`await` 和 `Promise.all()` 编排，不提交 RenderCore animation plan；
- 现有 game002v2 使用的 plan、polling/drain façade 保持兼容且不扩展；
- LogicCore 的 immutable `SlotOperationPlanV2` 保持，并交付 Crave 完整人工迁移文档。

本任务主要修改 `packages/rendercore`；game002v2 只做兼容回归，不迁移现有调用链。

### 完成定义

- [ ] `SymbolArea` 提供原子 `replaceSymbol/replaceSymbols`；成功返回新的 exact `SymbolRender`，旧 façade 立即 stale，批量操作先完整
      preflight，失败不产生部分 replacement。
- [ ] `SymbolGroup` 提供严格映射的批量 value/state mutation；输入与成员一一对应，先完整验证再提交，不以位置、首项或当前值 fallback。
- [ ] area 提供 awaitable occurrence `transferSymbols()`；RenderCore 拥有 lease、临时 display、motion、原子 commit 和 cleanup，游戏不再调用
      `prepare/start/setProgress/commit/destroy`。
- [ ] area 提供 awaitable `dropOccurrences()`；调用方传入已确定的 movement、value commit 和 motion 参数，RenderCore 直接执行，不先创建
      `GridCellCascadeDropPlan`。
- [ ] `area.spin.start()` 返回 active `SpinSession`；session 可取得 `SpinningReel/SpinningCell`，区分固定 overlay 与 rolling presentation，
      允许在实际 spin 中附加/移除 effect、修改 dimming/speed/cadence 等明确 visual 参数，并查询仍待落停的轴/格。
- [ ] `SpinningReel.land()` 和 `SpinningCell.land()` 是 awaitable 原子落停；resolve 后返回最终 `SymbolRender` 或 `SymbolGroup`，同时保证
      `area.getSymbol(pos)` 已可取得同一 exact occurrence。
- [ ] idle/win 等 game-owned presentation 仍由最高优先级 `area.spin` 自动中断；游戏不直接接触 interruption signal 或清理内部 rolling host。
- [ ] 新 API 不接受 `ReelSpinPlan`、`GridCellReelSpinPlan` 或 `GridCellCascadeDropPlan`；旧接口只为 game002v2 compatibility 保持冻结。
- [ ] game002v2 当前调用链、时序、tests 和 public compatibility 不变；任务 202 不强制它作为新接口首个 consumer。
- [ ] 外部 `/Users/zerro/gitee.com/pixicrave` 生产源码不由本任务修改；本仓库交付一份完整 Crave 迁移文档，包含逐文件改法、必要时的
      整文件替换内容、旧 API 零残留检查、自动化命令和人工验收项。
- [ ] public exports、README、长期文档、领域规则、定向测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- settled symbol 原子 replacement、批量 mapped value/state 和严格 stale/lease/ownership 合同。
- awaitable occurrence transfer 和 cascade drop，收敛现有 prepare/manual-progress/commit lifecycle。
- spin runtime object：`SpinSession`、`SpinningReel`、`SpinningCell`、stable overlay 和 land/cancel。
- CellSpin 是后续主实现；Crave 仍使用期间，grid-cell 同步相同基础 mutation/transfer/drop，且复用现有 motion/pool/player owner。
- Scene Layout additive 暴露 mutation/session/direct transaction；现有 plan façade不变。
- game002v2 compatibility tests 与旧接口回归保护。
- Crave 外部 consumer 的只读对照与本仓库迁移文档交付。

### 不包含

- 不删除、不重命名 RenderCore 现有 game002v2 plan/drain/poll 接口，也不改变 LogicCore plan。
- 不在 RenderCore 识别 WL、WM、CM、CO、CN、AF、Nearwin 或具体 component；业务触发条件、目标和顺序仍由 game operation handler 决定。
- 不增加 `PresentationPlan/SpinSchedule/CascadeRecipe`、JSON/YAML choreography、callback event DSL 或第三层玩法模板。
- 不实现 Symbol 扩展占格、1x1→1x3、Megaways、大图标拓扑或新的 hold 业务规则；已有 hold/selective 只通过不启动对应轴/格表达。
- 不开放 raw Pixi 对象、滚动 occurrence pool、Spine/VNI player、mutable geometry 或 internal transaction。
- 不修改 Crave production 源码、资源、配置、lockfile、Git branch 或 commit；只读分析不得改变其工作区。若用户以后明确选择直接迁移 Crave，
  应在独立执行边界和 Crave 自己的分支内进行，不作为任务 202 隐式写入。
- 不修改正式 assets、manifest/YAML、生成物、根工具链或新增第三方 tween/timeline 依赖。

## 3. 制定计划时的基线

```text
UTC: 2026-08-12T07:19:53Z
HEAD: 002a379bc91e17df360da2b5b4ae6308a0dec4fb
branch: codex/task-199-rendercore-first-layer-api
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/{shared-game-runtime,game002}.md`、任务
  199/200/201 计划与报告、`docs/rendercore-operation-first-layer-api.md`；目标目录无补充 `AGENTS.md`。
- `packages/rendercore/src/reel/reel-area.ts` 当前有 `AreaSpinController.start/land/cancel`，但 `start()` 不返回 active session，游戏无法通过
  稳定对象操作 spin 中的 reel/cell/rolling presentation。
- `packages/rendercore/src/reel/{reel-spin,render-cell-spin}.ts` 已有无 plan 的逐列/逐格 `roll/start/settle/cancel`，可作为新 session 唯一
  motion owner；不得再实现一套并行动画 runtime。
- legacy `packages/rendercore/src/reel/{spin-plan,grid-cell-spin-plan,grid-cell-cascade-plan}.ts` 仍公开 plan DTO/builder；Scene Layout 和
  game002v2 仍直接消费这些入口，因此任务 199 所述“grid-cell compatibility”尚未真正退出。
- `RenderGridCellReelSet` 已拥有 occurrence replacement、transfer lease/manual progress、cascade、continuous spin、landing/activation edge 和
  player update 能力；任务目标是把必要底层能力保留在内部 owner 中，同时用直接 await API 取代 public plan/lifecycle machinery。
- 外部 Crave 的 `apps/crave/src/{round-adapter,spin-presentation,feature-anis,nearwin,reel-presentation}.ts` 真实使用 replacement prepare/commit、
  manual occurrence transfer RAF、cascade plan、initial/refill plan、continuous spin drain 和 nearwin landed/activated edge；这些用法是新 API
  的 consumer evidence，但不是任务 202 的写入目标。
- 当前规划会话只新增本任务文档，不实施或运行测试。

## 4. 需求解释与技术决策

### 需求解释

- 新 direct/session API 不接收 render plan；现有 plan 仅冻结给 game002v2 compatibility，后续删除另立任务。
- spin 不是 landed symbol 操作的空白期。游戏需要操作的是“正在转动的轮子/格”，因此 session 必须提供稳定 spinning host；尚未落停的
  坐标仍不能通过 `getSymbol()` 伪造一个 symbol。
- 业务循环由游戏直接 `await`。RenderCore 负责原子动作内部的 pool、mask、timeline、player update、lease、commit 和 cleanup；游戏负责
  action 之间的顺序、并行、Nearwin 激活条件和具体状态/效果选择。
- 新 API 的简单性来自运行对象和直接 Promise，而不是把旧 plan 的每个字段平移到一个巨大 options object。
- Crave 必须有可落地的迁移路径，但本任务以基础库为主，采用“只读 consumer evidence + 完整人工迁移文档”边界。

### 关键决策

1. **Logic plan 与 render plan 明确分层。**
   - `SlotOperationPlanV2` 继续由 LogicCore 证明业务 operation 顺序和 immutable output。
   - operation handler 收到业务 operation 后直接调用 RenderCore 原子方法，不再创建第二份 animation plan。
   - RenderCore 内部允许 `PreparedReplacement/ActiveTransfer/SpinSessionState` 等 implementation detail，但不 export、不携带业务 predicate，
     也不能由游戏拼装后回传。

2. **settled mutation 是 area 的原子能力。**
   - 目标 public 形态接近：

     ```ts
     const next = area.replaceSymbol(pos, { code, value, state });
     const nextGroup = area.replaceSymbols(replacements);
     symbols.setValues(values);
     symbols.setStates(states);
     ```

   - mutation 在可见变更前解析全部 occurrence、resource/state/value 和 lease；成功后一次提交，旧 façade stale。
   - 单次 replacement 返回新 `SymbolRender`，批量返回按输入稳定排序的 `SymbolGroup`，便于下一句继续直接操作。

3. **transfer/drop 是 awaitable transaction，不是 public lifecycle。**
   - 目标调用形态接近：

     ```ts
     await area.transferSymbols({ routes, replacements, motion });
     await area.dropOccurrences({ movements, valueCommits, motion });
     ```

   - RenderCore 内部完成 start snapshot、preflight、lease、临时 display、motion、commit、release 和 cleanup。
   - transfer 的 source/target/output 和 cascade movement/value commits 必须由 LogicCore output 或 app 在调用前确定；RenderCore 不反推业务规则。
   - 失败遵循 fail-stop：未 commit 的临时 transaction 清理；已经按合同完成的前序独立原子动作不倒放。

4. **spin session 表达“现在正在转什么”。**
   - `area.spin.start(options?)` 先中断 idle/win presentation，再返回 exact active `SpinSession`。重复 start、跨 area handle、stale session 显式失败。
   - session 按模式提供 `getReel(x)` 或 `getCell(pos)`，并提供 pending reels/cells 的 immutable 查询；不让游戏轮询内部 elapsed 或 completion counter。
   - `SpinningReel/SpinningCell` 至少区分：
     - `overlay`：固定在 reel/cell 空间的 effect attachment，不随 rolling occurrences 移动；
     - `rolling`：作用于当前滚动内容的受控 presentation，例如 dimming、typed effect attachment 和明确 visual speed/timing 调整。
   - rolling host 不是 `SymbolRender`，不提供 landed value/code mutation，不允许游戏取得 pool occurrence 或 display tree。

5. **落停返回 landed object，统一回到 `getSymbol()`。**
   - `await spinningCell.land(target, options)` 返回一个最终 `SymbolRender`。
   - `await spinningReel.land(target, options)` 返回该列最终 `SymbolGroup`；session 的 area-level `land(target)` 只做默认全盘便利组合。
   - 某格/列完成后即可取得其 symbol，不必等待整个 session；全部 pending 结束后 session complete 并释放 rolling-only resource。
   - Nearwin 等业务可以在 `for/await` 中依据已落停 symbol 更新后续 spinning cell/reel，而不是消费 renderer 的 activation plan callback。

6. **默认 spin 仍简单，扩展 spin 使用同一 session。**
   - 无特殊玩法的游戏继续使用 `area.spin.start(); await area.spin.land(target)` 或等价 convenience。
   - 特殊玩法保留 session，在后续轴/格落停前修改 rolling visual 或附加 effect；不注册 renderer callback，不 drain event queue。
   - `createAreaSpinFunction()` 若保留，只能作为委托 session 的默认 typed factory；若 session 已足够简单则删除，避免两套扩展点。

7. **旧 public plan 冻结兼容。**
   - characterisation tests 固定 game002v2 的公开轮带、target injection、低 FPS、Nearwin、cascade identity/value 行为。
   - 新 API 复用同一底层 owner，不向旧 plan 增加新字段，也不要求 game002v2 迁移。

8. **Crave 交付采用可人工应用的迁移说明。**
   - 文档逐文件覆盖 round flow、spin orchestration、nearwin、cascade、WM/CM/CO replacement/transfer 和 presentation value mutation。
   - 每处给出旧 API→新 API、ownership/commit 边界、调用顺序和验证方法。仅当局部 patch 会比整文件更难安全应用时附完整 replacement file。
   - replacement file 必须基于执行时只读获取的 Crave 当前版本，并标明 source commit/status；不得把 Crave 代码复制进 RenderCore runtime/test。

## 5. 职责与合同

- **LogicCore**：拥有 server 数据解析、业务 operation 顺序、movement/routes/output/value commits 和 immutable `SlotOperationPlanV2`；不持有
  RenderCore session、symbol identity 或 display object。
- **游戏 operation handler**：拥有玩法语义、`for/await/Promise.all` 顺序、目标 state/effect、Nearwin gate、hold/selective positions 和
  timing policy；不拥有 pool、manual RAF、plan builder、lease 或 commit lifecycle。
- **SymbolArea/SymbolGroup**：拥有 exact landed occurrence 访问、批量 preflight 和 atomic replacement/value/state mutation。
- **SpinSession**：拥有一次 active spin 的 interruption、pending axes、rolling host、land/cancel barrier 和 session cleanup；不是可序列化 plan。
- **SpinningReel/SpinningCell**：拥有单轴/单格 active motion 的受控 presentation seam；land 后 stale，不能伪装为 landed Symbol。
- **transfer/drop transaction**：拥有 start snapshot、lease、motion、commit 和 cleanup；Promise settle 后不泄漏临时 display/player/waiter。
- **Scene Layout runtime**：提供 area/session/direct mutation 并拥有 main reel placement/layers/update；不代理旧 plan DTO。
- **失败策略**：非法/重复位置、stale occurrence/session、unknown code/state/effect、value shape mismatch、cross-area route、active lease conflict、非法
  timing/speed、缺 target 或 duplicate land 均原位显式失败；不 fallback normal、首项、当前 symbol 或 settled snapshot。
- **取消策略**：取消未落停 spin/transaction 时清理 rolling-only/temporary resource，不根据当前滚动窗口伪造 server target；已提交的 landed
  symbol 不倒放。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/reel/spin-session.ts
docs/crave-rendercore-direct-api-migration.md
tasks/202-rendercore-planless-spin-and-mutation-api-<utctime>.md
```

文件名可按现有 owner 收敛，不能为 standard/cell/grid-cell 复制三套 session、mutation 或 clock 实现。

### 预计修改

```text
packages/rendercore/src/{index}.ts
packages/rendercore/src/symbol/{symbol-render,symbol-group}.ts
packages/rendercore/src/reel/{index,types,reel-area,reel-spin,render-cell-spin,render-reel-set,render-grid-cell-reel-set}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/tests/{reel,scene-layout}/**/*.test.ts
packages/rendercore/README.md
docs/rendercore-operation-first-layer-api.md
docs/agent-rules/shared-game-runtime.md
```

### 原则上不应修改

```text
/Users/zerro/gitee.com/pixicrave/**
packages/logiccore/**
apps/game002*/**
apps/game003v2/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若实现发现必须改变 `SlotOperationPlanV2`、正式 asset/schema、Crave production source或新增依赖，属于重大范围变化，
必须停止说明，不能通过修改任务报告事后合理化。

## 7. 实施步骤

1. **确认执行基线与 plan 消费闭包**
   - 核对 HEAD/status、任务 199-201 合同和外部 Crave source commit/status；Crave 只读，不清理其已有修改。
   - 用 exports/imports/calls/tests 建立 RenderCore gameplay plan、builder、stage、poll/drain 的完整 consumer 清单，区分 LogicCore plan。
   - 补最小 characterisation tests 固定现有 motion/pool/player/target injection/low-FPS/cascade identity 行为。

2. **实现 landed symbol 原子 mutation**
   - 从现有 visible occurrence replacement/value controller 中提取统一 area owner，实现单个/批量 replacement 和 mapped group mutation。
   - 保证 exact identity、全量 preflight、一次 commit、旧 façade stale 和失败零部分 mutation；增加 normal/stale/duplicate/leased/resource failure 测试。

3. **收敛 transfer 与 cascade direct transaction**
   - 把现有 occurrence transfer 的 prepare/manual progress/commit/destroy 变为内部 transaction，由 `transferSymbols()` 一次 await 拥有。
   - 把 cascade builder 的 pure timing normalization 下沉到 `dropOccurrences()` 内部，调用方只传 render-ready facts 和 motion policy。
   - 复用任务 201 motion clock，覆盖低 FPS完整 delta、abort、cleanup、source snapshot和value commit。

4. **建立 SpinSession 与 spinning objects**
   - 以现有 `ReelSpin/CellSpin/RenderGridCellReelSet` 单轴 owner 为底层，建立一次 area active session 和 exact reel/cell façade。
   - 实现 stable overlay、rolling presentation、pending 查询、dynamic visual control、land/cancel 和 stale validation；不开放 pool/display tree。
   - 把 area presentation interruption 与 session start 统一，验证 win repeat→spin、部分 landed、cancel、destroy 和真实 player failure cleanup。

5. **以 direct await 重建现有 spin 能力**
   - 用普通循环和 session 实现 full/selective/hold/refill/stagger/continuous response landing。
   - Nearwin activation 由 game handler 根据已落停业务事实调整尚 pending cell/reel 的 dimming/effect/cadence；RenderCore 只执行明确 visual 调用。
   - 保持本地公开轮带、target window、visual phase、mask、bounce、player update 和 commit 边界不变。

6. **Scene Layout additive 接入并回归 game002v2**
   - Scene Layout 增量暴露 mutation/session/direct transaction，现有 plan/drain/polling façade保持。
   - 不修改 game002v2 源码；运行其测试证明旧调用链兼容。

7. **固定新旧接口边界**
   - 新 API tests 禁止接收 plan DTO 或暴露 prepared/manual lifecycle；旧 API compatibility tests 保持。
   - 文档标明旧接口冻结、新游戏使用 direct/session API；完全移除旧 plan 留待真实 consumer 验证后的独立任务。

8. **产出 Crave 完整迁移文档**
   - 基于只读 Crave 当前 commit，逐文件给出新调用链、旧→新 API 映射、删除清单和顺序/ownership说明。
   - 对改动特别大的文件提供完整 replacement file；明确由人工复制覆盖，不在本任务写入外部仓库。
   - 给出 Crave 自己仓库内可运行的 typecheck/test/old-API rg 命令和浏览器验收清单，不宣称未执行的外部验收已通过。

9. **同步长期合同并完成 L2 验收**
   - 更新 RenderCore、第一层文档和最小 shared规则，明确新 API 无 plan、旧接口冻结兼容。
   - 运行第 8 节定向命令，生成 UTC 中文执行报告；浏览器验收留给用户。

## 8. 测试与验收

### 测试原则

- mutation 测试先证明全量 preflight 和 exact occurrence，再证明 commit/stale；非法批量输入不得产生部分画面变化。
- session 测试使用 manual ticker 推进，不使用 RAF、`setTimeout()`、`performance.now()` 或轮询 private counter。
- spinning object 测试验证 stable overlay、land 后 stale、partial landing 后 `getSymbol()` 可用。
- transfer/drop 测试分别覆盖 immutable source snapshot、lease conflict、低 FPS完整 delta、atomic commit、abort/error/destroy cleanup。
- compatibility 测试保护视觉和数据边界，不保护旧 plan 类型名、builder 形状或 polling 调用方式。
- Crave 只提供迁移指令和待人工执行命令；本仓库测试不得导入外部 Crave source 或 assets。

### 验收级别

采用 `L2`：增量修改 RenderCore public API，并通过 Scene Layout additive export 和 game002v2 compatibility 验证无回归。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game002v2 test
git diff --check
```

第 5 条合并 game002v2 的 test/typecheck 是同一 direct consumer 验收。若 package 实际 filter 名不同，执行时只按 workspace manifest 作小幅
命令适配并在报告记录，不扩大到根级全仓命令。

### 人工验收

由用户浏览器验收 game002v2：Base/FreeGame initial spin、请求前 continuous spin、响应后一次落停、selective hold、Nearwin activation/dimming/effect、
normal/anticipation cascade/refill、WM/CM/CO transform/transfer、win 循环被下一 Spin 正确打断、value 与最终 scene 保持。

Crave 在人工应用迁移文档后由用户在其项目中完成同类浏览器验收；任务 202 自动化结果不得冒充 Crave 已迁移或已通过。

### 独立验收建议

`建议`。本任务增加跨模块 public contract和异步 ownership，同时要求 game002v2 无回归。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter game002v2 test
```

独立验收还应审阅 RenderCore 是否只是把 plan 改名，以及 cancel/destroy/partial landing 是否会泄漏或错误提交。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell 缺 Node 时按根规则加载工作区 Node runtime。
- 不新增依赖，不修改 lockfile；依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`。
- RenderCore runtime 继续只由宿主 ticker/manual elapsed 推进，不引入 wall-clock 或浏览器专属 timer。
- 外部 Crave 检查只申请只读权限，不得修改其工作区。

## 10. 生成物、文档与规则

- 本任务不修改 YAML/manifest/生成物；如执行中发现必须修改，先停止说明。
- 更新 `docs/rendercore-operation-first-layer-api.md`，把 legacy grid-cell compatibility 改为已迁移后的统一 direct/session contract。
- 新增 `docs/crave-rendercore-planless-migration.md`，记录 Crave 基线、逐文件更新、完整 replacement file 和验证；它不是 runtime 合同。
- `docs/agent-rules/shared-game-runtime.md` 保存新旧接口分层和 running-object ownership；`game002.md` 保持旧兼容事实。
- 不更新根 `AGENTS.md`，不把精确 API 清单或 Crave 临时 source 状态写入长期规则。

## 11. 执行报告

执行完成后创建：

```text
tasks/202-rendercore-planless-spin-and-mutation-api-<utctime>.md
```

报告记录最终 API、旧兼容边界、Crave 文档基线、命令结果、人工验收和风险；不宣称 Crave 已被修改或验证。

## 12. 风险、假设与待确认

### 风险

- legacy grid-cell 同时承载复杂 Nearwin、continuous、cascade 和 player update；若只换 façade 而复制内部 owner，可能产生双 ticker、双 pool 或
  commit 竞态。实现必须先收敛 owner 再删 surface。
- dynamic spin control 若接受过宽 options，可能变成隐形 plan；第一版只暴露已由 game002v2/Crave 证明需要、且作用于 active object 的能力。
- 新旧接口共存期间必须避免复制 motion/pool/ticker owner；旧 plan 只冻结兼容，不承接新能力。
- replacement/transfer/drop 从显式 lifecycle 收敛成一次 await 后，错误 cleanup 必须等待全部已启动资源收敛，否则会留下 leased occurrence。
- Crave 可能在任务执行前继续开发；完整 replacement file 必须绑定 source commit，人工应用时若基线不同需要按逐段说明合并。

### 假设

- game002v2 是仓库内 legacy grid-cell 的权威 compatibility consumer，本任务只验证不回归。
- Crave 当前调用模式只作为 API 需求和迁移文档依据，不要求任务 202 在外部仓库直接提交代码。
- 现有 game002v2 public APIs 在任务 202 保持兼容；未来删除必须另开任务并有真实 consumer 证据。

### 待确认

无。任务按“不修改 Crave production source、交付完整人工迁移文档”的边界执行；直接迁移 Crave 需用户另行明确启动。

## 13. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`shared-game-runtime.md`、`game002.md` 和任务 199-201 报告；
2. 核对 Git 基线与工作区，先建立旧 plan consumer 闭包；
3. 对 Crave 只读记录 commit/status，不修改、stage、commit 或清理其文件；
4. 按“mutation → transaction → session → 文档”顺序实施，新增接口必须复用旧底层 owner；
5. 小幅适配当前实现时在报告记录，触及 LogicCore plan/正式资源/Crave 写入等重大扩张时先停止说明；
6. 只运行计划规定的 L2 验收，浏览器验收交给用户；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
