# 186 game002v2-spin-default-scene-presentation 任务计划

## 1. 目标与完成定义

### 目标

补齐 `apps/game002v2` 重写后与原 game002 不一致的 initial grid-cell spin 和
`defaultScene` 表现：普通单格转动时只有 CN/WL/本轮特殊 WM/CM/CO 保持全亮，第 2 枚
WL 按真实落地顺序触发 Nearwin/anticipation 后只有 WL 全亮；最终落地使用任务 185
已选定的最后完整 scene，并让不存在于本地公开轮带的 WM/CM/CO 在正确格子内转入、落定。

rendercore 保留轮带、临时 strip、逐格落地、dimming 和状态边界的通用逻辑，在
Scene Layout package runtime 的 spin plan 建立阶段和 activation/landing 阶段暴露可选 typed
function；game002v2 仅在这些阶段注入本游戏的 symbol 分类、第 2 枚 WL 触发和
`Reel_NearWin` 请求，不复制 reel 状态机，也不新增业务配置 schema。

`defaultScene` 中的 CN 初始 presentation value 从当前 Symbol package
`gameConfig.getNumberWeightTable("bgcoinweight")` 独立加权抽取；rendercore 提供稳定 occurrence
抽样 helper，并通过已有 `gridCellPresentation.presentationValueResolver` function 补入；非 CN 保持 `null`。

### 完成定义

- [ ] 非期待 initial spin 中，每个实际滚动 occurrence 按 code 解析暗度：CN、WL、WM、CM、CO
      为 `0`，其它 symbol 为 `0.5`；暗层跟随该 cell 的滚动 strip，不是固定棋盘遮罩。
- [ ] 第 2 枚 paytable-exact WL 在真实 landing edge 打开 anticipation；从该边界起 CN/WM/CM/CO
      也使用 `0.5`，只有 WL 继续为 `0`。
- [ ] Nearwin 不再只依赖“第 3 枚以后 WL”的预计结果或 spin 完成后补播；即使目标
      scene 恰好只有 2 枚 WL，activation 也在第 2 枚落地时发生，app 可在该阶段
      请求已落地/后续 WL 的 `Reel_NearWin` Symbols state，完成时恢复 normal。
- [ ] `spinMainReelToScene()` 的默认 consumer 行为保持；只有显式提供 function 的 game
      改写 grid-cell spin plan/phase，不增加 WM/CM/CO/CN/WL 或 game002 共享分支。
- [ ] `bg-spin | bg-refill | bg-genwm | bg-gencm | bg-genco` 继续按任务 185 的最后触发组件
      选择唯一完整 landing scene；该 scene 中的 WM/CM/CO 只注入它所在 cell 的临时
      target window，不写入、不泄漏、不反推本地公开轮带。
- [ ] 每个 `defaultScene` CN 使用 `bgcoinweight` 独立加权抽取 positive safe integer，结果
      通过 rendercore presentation-value resolver 显示；同一本地可视 occurrence 在重建前保持稳定值。
- [ ] 缺 `bgcoinweight`、缺 CN code、非法 random 边界、无法请求 Nearwin state 或阶段
      function 返回非法 plan 均立即报错，不回退到 manifest `defaultValues`、均匀随机或全亮。
- [ ] 完成 L2 定向自动验收、真实浏览器视觉验收，并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore` reel/scene-layout：拆出可独立于 effect resource 使用的 activation
  landing schedule，增加可选 spin-plan/activation 阶段与通用权重抽样的稳定 occurrence
  resolver helper；保持默认 plan 路径。
- `apps/game002v2`：从 active Symbol package `gameConfig` 解析 WL/CN/WM/CM/CO code，注入两阶段
  dimming、第 2 枚 WL gate、Nearwin Symbols state 处理和 `bgcoinweight` defaultScene value resolver。
- 任务 185 已接入的 landing component set 与 rendercore 临时 target-window 注入路径的
  characterization/regression test。
- rendercore public README 与 `docs/agent-rules/game002.md` 的最小同步。

### 不包含

- 不改 server 协议、logiccore scene/otherScene/result 解析、任务 185 的最后组件选择语义，
  不重算、合并或校验 WM/CM/CO 业务数据。
- 不将 server scene 当作轮带，不向公开轮带持久追加 WM/CM/CO，不使用 server
  `randomNumbers`、全局 `Math.random` 或 CN value random 驱动轮带 phase。
- 不处理 cascade/refill Nearwin2、win/remove/transform/FreeGame 业务时序或特殊 symbol 逻辑数据；
  本任务只修正 initial spin 与 defaultScene 表现。
- 不新增 manifest/YAML/versioned schema，不复制 `bgcoinweight` 数值，不改
  `assets/gamecfg002/bgcoinweight.xlsx`、`assets/gamecfg002/gameconfig.json` 或 `assets/crave/**`。
- 不改 game002、game003、Viewer、Editor 行为，不新增依赖或修改 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-09T03:58:26Z
HEAD: a1be86617a7ed3856338bcfc14f06b60bc91773d
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{game002,shared-game-runtime,loading-ui}.md
tasks/185-game002-last-component-scene-selection{,-260808-121152}.md
tasks/106-image-string-symbol-nodes-and-otherscene-preview.md
```

`apps/game002v2` 和 `packages/rendercore` 无子目录 `AGENTS.md`。当前结论：

- `apps/game002v2/src/round-adapter.ts` 已以 `LANDING_COMPONENTS` 调用
  `getLastComponentScenes()`，候选含 `bg-spin/bg-refill/bg-genwm/bg-gencm/bg-genco`；任务 185
  的最终 scene 基线已存在，不应在本任务再做 scene merge/overlay。
- `SceneLayoutPackageRuntime.spinMainReelToScene()` 对 grid-cell 路径已拥有 scene/phase/value/state
  验证、本地公开轮带、partial Fisher-Yates cell phase 和临时 target-window 注入；
  但当前把 dimming 固定为始终 `0`，也不接受 game-owned spin-plan stage function。
- `createGridCellReelSpinPlan()`/`RenderGridCellReelSet` 已对每帧滚动 strip 的实际 code 重新
  调用 `resolveDimmingAlpha(code, activated)`，并在 activation landing edge 切换
  `activated=true`；底层能表达所需两阶段 dimming。
- 现有 plan 把 `activationGate` 耦合在 `effects.activated` 中；没有 grid-cell effect resource 就不能
  单独使用 gate/dimming activation。`RenderGridCellReelSet.update()` 已返回
  `activationCells`，但 package runtime 只公开/drain `landedCells`，吞掉 activation edge。
- `apps/game002v2/src/nearwin.ts` 当前只在全 scene 预计中将第 3 枚以后 WL 标为
  `Reel_NearWin`；恰好 2 枚 WL 时返回 `null`，且 adapter 在 spin 结束后再播一次，
  没有表达“第 2 枚真实落地开 gate”。
- `createGridCellReelSpinPlan()` 会把每个 cell 的 target code 放入
  `targetVisibleSymbols`；`spin-strip.ts` 只为该临时落点窗口注入 target。因此任务 185
  scene 里的 WM/CM/CO 不需进入公开轮带就能在精确 cell 停住；本任务需要保护
  这条已有通用路径，而不是新建游戏专属 strip。
- `createSceneLayoutPackageRuntime({ gridCellPresentation })` 已有可选
  `presentationValueResolver` function；`resetToScene()` 在未显式传 values 时会调用它，可直接
  补 `defaultScene` CN value，不需新 schema。
- rendercore `local-scene-authoring.ts` 已有内部 number-weight 累计抽样，但 reel public API 尚无
  “按 occurrence 稳定、用调用方选表”的 helper；不应在 game002v2 再复制旧 Map key/权重遍历。
- `SceneLayoutPackageResource.symbolPackages[id]` 已公开 typed `SymbolPackageResource.gameConfig`；
  `getNumberWeightTable("bgcoinweight")` 可返回 production 10 项/总权重 240，无需新 raw-config API。
- 规划会话未修改运行时代码、未安装依赖、未运行构建或测试。

## 4. 需求解释与技术决策

### 需求解释

- “单轮转”指 game002v2 initial `bg-spin` 的 grid-cell 逐格 spin，不包含 cascade/refill
  selective spin。
- “压暗 0.5”指 rendercore 当前 grid-cell dimming 合同中的 `dimmingAlpha=0.5`；
  symbol alpha 保持 1，且滚动内容换 slot 后仍重新应用，不把静态黑矩形盖在整个棋盘。
- “期待模式”从第 2 枚 WL 真实落地边界开始，不是开 spin 时根据最终 scene
  提前全盘打开，也不是等第 3 枚 WL 落地才开始。
- “特殊图标补到转动轮子”解释为 rendercore 对 target scene 的临时 landing-window
  注入：只影响指定 `(x,y)` cell 的本轮 strip，spin 完成后不改变公开轮带。
- `defaultScene` 没有 server otherScene 时，CN 值是纯表现数据；game002v2 选择
  `bgcoinweight`，rendercore 拥有 occurrence/value attachment 生命周期。本地抽样不写回
  `SlotGameInitialState` 或 logic/server model。

### 关键决策

1. **暴露阶段 function，不增加特殊 symbol 配置**
   - rendercore 在 `spinMainReelToScene()` 完成通用 strict validation、order、local phase offset
     后，向可选 game function 提供不可变 target/order/reels/profile context 与由 rendercore
     执行的 plan builder；function 只返回 typed grid-cell plan 扩展。
   - function 精确名称按现有 `gridCellPresentation` 命名落实，语义固定为“本次 spin
     plan 建立阶段”；不设置时使用现有全亮默认 plan。
   - rendercore 不认识 `WL/CN/WM/CM/CO`；game002v2 的 function 用 gameConfig 将 code
     映射为两阶段 alpha。

2. **将 activation schedule 与特定 effect resource 解耦**
   - `GridCellReelSpinPlan` 保留唯一 activation gate，但 gate/后续 landing cadence 可在没有
     `effects.activated` 时独立存在；dimming activation 与时间线都服从该 gate。
   - 旧 effect consumer 仍可把 effect 挂在同一 gate，不改 effect pool/resource 生命周期。
   - package runtime 对称公开可 drain 的 activation positions；game002v2 ticker 在同一 update
     边界读取 landing/activation，请求 `Reel_NearWin`，不直接操作 player/display tree。

3. **复用临时 target-window，不建第二份轮带**
   - WM/CM/CO 依然来自任务 185 的 server 最终 scene；它们与其它 target code 一样交给
     `targetVisibleSymbols` 的精确 cell window。
   - 测试使用“special code 不在本地 strip”的 fixture，同时断言转动中可见、
     终点正确且 `LogicReels` 未改变。

4. **`bgcoinweight` 选择留在 game002v2**
   - app 通过 public `gameConfig.getNumberWeightTable()` 取表，用 Web Crypto 与累计权重
     为每个 CN occurrence 抽样；不读 raw JSON，不使用 symbol manifest `defaultValues`
     代替权重。
   - rendercore 抽出中性 helper：以 `(x,y,symbolY,code)` 稳定缓存 occurrence，用 caller 返回的权重表和 uint32 source 无偏抽样；app 只决定“CN 使用 bgcoinweight，其它 null”。

- rendercore 提供 initial active Symbol package resource 的只读解析接口；game002v2 通过该接口
  取得同一 Crave layout 解包资源中的 typed gameConfig，禁止 app 自行遍历 binding、读取额外
  assets 或使用 raw/fallback。

## 5. 职责与合同

- **rendercore reel plan**：验证坐标、时间线、dimming resolver 返回值和 activation 唯一性；
  在真实 cell landing edge 切换 activated，保证滚动 strip 和落地格共用同一 resolver。
- **rendercore package runtime**：拥有当前 Symbol binding、公开轮带、临时 target injection、
  spin start/update/complete 和 activation/landing event queue；只调用显式注入的 function。
- **game002v2 spin extension**：声明哪些 code 在普通/期待阶段全亮，按实际
  order 定位第 2 枚 WL，在 activation/landing 边界请求 Symbols state；不操作 Pixi
  child、tint 或 Spine player。
- **rendercore value helper/game002v2 resolver**：共享层拥有稳定 occurrence cache 和无偏权重抽样；
  app 只对 exact CN 选 exact `bgcoinweight`，server landing values 仍以 `readPresentationValues()` 为准。
- **失败策略**：未知 code、缺权重表、非法权重/random、gate 不在 order、重复 activation、
  state 无 capability 或非法 plan 立即 fail-stop；不跳过、猜值或降级为 normal。
- **禁止行为**：不复制 reel update loop，不向 rendercore 写 game002 symbol/component 分支，
  不改宿主借用 display tree，不建第二份权重表/特殊轮带，不为旧错误 Nearwin
  语义保留 fallback。

## 6. 文件范围

### 预计新增

```text
apps/game002v2/src/spin-presentation.ts
apps/game002v2/src/default-scene-values.ts
apps/game002v2/tests/{spin-presentation,default-scene-values}.test.ts
tasks/186-game002v2-spin-default-scene-presentation-<utctime>.md
```

如小型 helper 放回 `nearwin.ts`/`round-adapter.ts` 更清晰，可不新建对应 src/test 文件，但不得把
可单测的业务选择藏入 Pixi mount 流程。

### 预计修改

```text
packages/rendercore/src/reel/{types,grid-cell-spin-plan,render-grid-cell-reel-set}.ts
packages/rendercore/src/reel/weighted-presentation-value.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/tests/reel/{grid-cell-spin-plan,render-grid-cell-reel-set,spin-strip,weighted-presentation-value}.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/README.md
apps/game002v2/src/{round-adapter,nearwin}.ts
apps/game002v2/tests/{nearwin,source-boundary}.test.ts
docs/agent-rules/game002.md
```

### 原则上不应修改

```text
packages/{logiccore,gameframeworks,uiframeworks}/**
apps/game002/**
apps/{game003,gameviewer,gameviewer2,gamelayouteditor,gamelayoutpkgcli}/**
assets/**
docs/agent-rules/{shared-game-runtime,loading-ui}.md
AGENTS.md
package.json
pnpm-lock.yaml
```

若执行时需要新 schema、修改交付资源、把 server 数据编译成新逻辑 plan，或实际必须改
refill/FreeGame，先说明原因并重新界定范围，不在执行中顺手扩张。

## 7. 实施步骤

1. **确认执行基线与 characterization**
   - 重新核对 HEAD/status、相关规则、任务 185 的 landing candidate 路径和 active Symbol
     package/gameConfig 入口。
   - 先用 rendercore 最小 fixture 固定当前默认全亮 plan、activation edge 数据、
     target-only code 注入和公开轮带不变，防止新 hook 改写普通 consumer。

2. **拆分通用 activation 与 effect**
   - 在 reel types/plan builder 中让 activation gate 和其后的 landing schedule 成为独立 typed
     输入；`effects` 可选关联该 gate，但不再是 gate 存在的前提。
   - 保留无 gate、带 effect gate、`dimmingActivatedAtStart` 现有语义；覆盖 gate 缺失/
     越界/重复触发和没有 effect 时的 dimming 切换。

3. **暴露 Scene Layout spin/activation 阶段 function**
   - 在 package-runtime public types 增加可选 grid-cell spin-plan stage function；输入只包含已验证的
     current binding/reels/scene/phases/order/offset/profile 和通用 builder，返回值仍由 rendercore
     进行结构与 runtime 校验后才 `spin()`。
   - 将 `RenderGridCellReelSet.update().activationCells` 记录到 instance-scoped queue，增加对称
     drain API；new spin/reset/mode switch/destroy 清理未消费 edge，不泄漏到下一轮。
   - 测试默认无 function、function 成功、function 抛错、standard reel 不适用以及 destroy/reset
     清理。

4. **实现 game002v2 spin presentation extension**
   - 从 initial Symbol package `gameConfig` exact 取 WL/CN/WM/CM/CO code，任一缺失显式失败；
     不在 rendercore 传 symbol name 表。
   - 重构 `createNearwinLandingState()`：按 package profile order 找第 2 枚 WL 并返回 activation
     gate，恰好 2 枚也返回 active state；保留后续 WL 的 typed landing-state matrix。
   - spin-plan stage function 注入 `0.5` dimming resolver 和 gate；普通阶段 CN/WL/WM/CM/CO
     全亮，activated 阶段仅 WL 全亮。
   - adapter ticker 在 `runtime.update()` 后 drain landing/activation edge，以已落地的 exact WL 坐标
     请求 `Reel_NearWin`；spin complete/failure/destroy 恢复或清理本轮临时状态，删除
     spin 完成后重复补播。

5. **接入 `defaultScene` CN 加权 value**
   - 在 rendercore reel 实现/导出通用 weighted occurrence resolver，严格验证 caller table/uint32 source，用 rejection sampling 避免 modulo bias，并保持同 occurrence 值稳定。
   - runtime 创建前取 exact CN code 与 exact `bgcoinweight`，注入 Web Crypto 和 `CN -> table | other -> null` function；不与 `localPhases()` 共用随机消耗。
   - 将 resolver 传入 `gridCellPresentation.presentationValueResolver`；确认 init
     `resetToScene(defaultScene, ..., values=undefined)` 自然为 CN 补值，其它 code 返回 `null`。
   - 测试权重边界、每 occurrence 独立、同 occurrence 稳定、非 CN null、缺表/random
     失败，并确认 server spin 的显式 `presentationValues` 不被初始 resolver 覆盖。

6. **保护特殊 symbol 落点与 dimming**
   - 构造本地轮带不含 WM/CM/CO、target scene 在不同 `(x,y)` 含这些 code 的用例；
     逐帧断言只有目标 cell 的临时 strip/终点出现该 code。
   - 分别在 gate 前后断言特殊 code 暗度为 `0`/`0.5`，CN 同样变为 `0.5`，WL 仍为
     `0`；断言普通 symbol 一直为 `0.5`。
   - game002v2 测试直接使用 task-185 候选顺序的最小 step double，证明最后
     `bg-genwm/bg-gencm/bg-genco` scene 原样传到 spin，不通过手工 overlay 产生相同结果。

7. **文档、验收与报告**
   - README 记录阶段 function 的调用时机、默认行为、activation queue 和临时 target
     边界；`game002.md` 补充 v2 initial spin/defaultScene 表现合同。
   - 运行下述 L2 定向命令和真实浏览器视觉验收，生成 UTC 执行报告。

## 8. 测试与验收

### 测试原则

- rendercore 测试只用中性 code，不出现 CN/WL/WM/CM/CO、`bgcoinweight` 或 game002 fixture。
- game002v2 测试使用注入 random source 的纯 helper 稳定覆盖权重边界；production 才使用
  Web Crypto，不用概率统计测试代替精确边界。
- Nearwin 覆盖 0/1/2/3+ WL，候选顺序与坐标顺序不同的用例，并断言 gate 发生在
  真实 order 的第 2 枚，不只断言最终 matrix。
- rendercore runtime test 逐帧观测 strip code、`dimmingAlpha`、`symbolDimmingAlpha`、activation edge
  和最终 scene；不用只验证 plan object 来冒充运行时表现。
- 旧测试与“第 2 枚落地开 gate”冲突时更新期望，不为旧 post-spin Nearwin 保留分支。

### 验收级别

`L2`。原因是修改 rendercore public reel/Scene Layout runtime contract 并接入直接 consumer
game002v2；game002 也直接消费变化的 grid-cell plan 类型，需编译复验。不涉及根工具链、
workspace、lockfile、schema、生成物或 release，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/grid-cell-spin-plan.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/reel/spin-strip.test.ts tests/reel/weighted-presentation-value.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter game002v2 test
pnpm --filter game002v2 typecheck
pnpm --filter game002 typecheck
git diff --check
```

`game002 typecheck` 只用于证明既有 grid-cell activation/effect consumer 继续编译，不扩展为 game002
全量测试。失败时先最小化复现并判断是否由本任务引入，不立即运行整仓命令。

### 人工验收

`必须`，使用 game002v2 真实 Crave package 和可观测/live round：

1. 打开含 CN 的 `defaultScene`，确认每个 CN 初始即显示 `bgcoinweight` 允许的值，非 CN
   没有伪造 value；重绘/更新不无故换值。
2. 普通 initial spin 观察每个正在转的 cell：CN/WL 全亮、其它图标为 0.5 暗；
   第 2 枚 WL 落地后 Nearwin 可见，后续 CN 改为暗、WL 仍全亮。
3. 使用最后 `bg-genwm/bg-gencm/bg-genco` scene 含特殊 code 的 round，确认特殊图标在该
   cell 的滚动尾段出现并停在正确位置；gate 前全亮、gate 后变暗，无串列/邻格
   污染或下一轮残留。

人工验收不用 fake runtime、编译或单测代替；若执行环境无法获得相应 live round，报告必须
明确列为未完成验收和剩余风险。

### 独立验收建议

`必须`。本任务同时改变跨包 public contract、逐帧状态边界和真实视觉效果，但不涉及
credential、服务器私有轮带、异步 transaction/rollback、正式 schema、ZIP、生成物或 release。
独立复验聚焦：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/grid-cell-spin-plan.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter game002v2 test
pnpm --filter game002v2 typecheck
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时执行 `CI=true pnpm install --frozen-lockfile`，不切换 npm/yarn。
- 只有下载实际失败后才设置 `http_proxy`/`https_proxy=http://127.0.0.1:1087` 重试原命令。
- 本任务不需要新依赖或 lockfile 变化；出现时先停止并说明必要性。

## 10. 生成物、文档与规则

- 本任务不修改 YAML/manifest/gameconfig/xlsx/资源 ZIP，无生成器或 parity checker。
- 更新 `packages/rendercore/README.md` 的 grid-cell package runtime 示例：阶段 function 的调用顺序、
  activation drain/cleanup、dimming resolver 和 target-window 边界；示例使用中性 code。
- 最小更新 `docs/agent-rules/game002.md` 的 game002v2 合同：第 2 枚 WL gate、两阶段
  dimming、任务 185 target scene 临时 special-code landing 和 `bgcoinweight` defaultScene CN value。
- `shared-game-runtime.md` 已经要求 app 通过 typed extension 注入 anticipation 且禁止共享层认识游戏
  symbol，无需重复条款；`loading-ui.md` 和根 `AGENTS.md` 也不修改。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/186-game002v2-spin-default-scene-presentation-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 public function/API 名称与语义、实际文件、
Nearwin/dimming/default value 实现、计划偏差、验收命令结果、真实视觉验收与剩余风险；
不收集无关 coverage、全仓统计、历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- `runtime.update()` 同帧可跨过多个 landing edge；activation/landing queue 必须保持 rendercore
  稳定顺序，app 不得用最终 scene 重算边界，否则会提前或漏播 Nearwin。
- `Reel_NearWin` 是 stable loop Symbols state；如果在 spin completion/failure 没有明确恢复 normal，
  会污染 win/transform/下一轮。清理路径必须有测试。
- target-only WM/CM/CO 需要 paytable/catalog 中有可渲染资源；缺资源应显式失败，不改写为
  CN/普通 symbol 或跳过。
- 真实 live round 不一定能稳定产生“2+ WL 且后续 CN/WM/CM/CO”；自动测试保护确定
  合同，但仍需可观测 fixture/live override 完成视觉复验。

### 假设

- initial grid-cell landing order 继续是 package profile 的 `top-down-left-right`，Nearwin gate 以该
  stable order 计数；若 profile 改变，app 消费 rendercore 提供的 order，不复制坐标排序。
- `bgcoinweight` 是 defaultScene CN 表现值的唯一权威权重表；每个 CN occurrence
  独立抽样，不要求与后续 server `bg-gencoins.otherScene` 一致。
- 任务 185 候选组件的最后 scene 是完整 target scene，不是 delta；如协议改为 delta，
  现有 strict scene/continuity 应报错，本任务不恢复 app merge。

### 待确认

- 无。用户已确认 defaultScene otherScene 使用 `gameconfig.bgcoinweight`；当前 public
  Symbol package gameConfig 入口可用，无需为本计划阻塞询问。
