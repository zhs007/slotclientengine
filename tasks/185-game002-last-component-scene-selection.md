# 185 game002-last-component-scene-selection 任务计划

## 1. 目标与完成定义

### 目标

修正 game002 每个 BaseGame step 的起始落定 scene 选择：`bg-spin`/`bg-refill`、`bg-genwm`、
`bg-gencm`、`bg-genco` 都可能在触发时产生新 scene，后续对该 step scene 的所有操作必须以这组候选
组件中最后触发者的 scene 为权威输入，不再固定从 `bg-spin`/`bg-refill` 开始后由 app 合成。

在 `logiccore` 增加通用的“候选组件中最后触发者” scene、otherScene 和 result 查询接口；
game002 通过该 public contract 取得当前 step 的第一个权威 settled scene。

### 完成定义

- [ ] `GameLogicStep` 和对称的 `GameLogic` step-index facade 可接收一组组件名，分别返回
      最后触发候选组件的 scenes、otherScenes 或 results。
- [ ] “最后”由 server `historyComponents` 的实际顺序决定，不由调用方传入候选数组的
      排列决定；对 scene 而言，现有服务器样本中该结果与取最大 `usedScenes` index 一致。
- [ ] 无候选组件触发时返回冻结空数组；已触发组件的 map/basic data/index 非法时显式失败，
      不跳过错误改选较早组件。
- [ ] game002 initial spin 与每次 refill 均从
      `bg-spin | bg-refill | bg-genwm | bg-gencm | bg-genco` 中取当前 step 最后触发者的唯一完整
      scene；`bg-spin` 与 `bg-refill` 互斥的现有协议行为保持。
- [ ] 删除 game002 对 `bg-genwm`/`bg-gencm` scene 的手工合并以及 `bg-genco` overlay；spin/refill
      operation 从开始即使用 server 最后完整 scene，后续 value hydration、WM/CM/CO transform、win/remove
      继续基于该 snapshot。
- [ ] 原有 component-scoped 单名接口、scene 冻结/x-first 结构、strict index validation、cascade
      时序和 server/local reel 边界保持不变。
- [ ] 完成 L2 定向验收并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/logiccore`：新增通用 last-triggered component data selector，补齐 model/interface/facade、
  strict validation、单测和 README。
- `apps/game002`：为 initial spin/refill 定义唯一候选 component set，通过新接口取当前
  step 权威 scene，删除重复 scene 合成路径。
- `packages/gameframeworks`：作为 logiccore type facade 和 game002 直接依赖链参与编译验收；如现有
  type re-export 已自动暴露新 method，不为本任务制造额外 wrapper。
- 直接 fixture/characterization test 与 `docs/agent-rules/game002.md` 中冲突的旧 scene 合成合同。

### 不包含

- 不改变 server 协议、`historyComponents` 生成方式或 `usedScenes`/`usedOtherScenes`/`usedResults`
  含义，不读取 `historyComponentsEx` 作 fallback。
- 不把 `bg-*` 组件名、WM/CM/CO 业务顺序或 symbol code 下沉到 logiccore。
- 不改变 WM/CM/CO 的动画、数值来源、operation 类型、commit 边界或赢奖/cascade 算法。
- 不修改 FreeGame `fg-*` scene 选择、game003、Viewer、Editor、rendercore 或其它游戏 consumer。
- 不改 manifest、YAML、`assets/**`、生成物、根工具链、workspace 配置或 lockfile；不新增依赖。

## 3. 制定计划时的基线

```text
UTC: 2026-08-08T11:41:56Z
HEAD: 27453aaceffbefe6297a6ff6291bd6b31868777a
branch: (detached HEAD; HEAD also points at main and codex/remove-slot-operation-mutations)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{game002,shared-game-runtime}.md
tasks/183-game002-runtime-plan-consolidation.md
```

`apps/game002` 和 `packages/logiccore` 目标目录无补充 `AGENTS.md`。当前结论：

- `packages/logiccore/src/component.ts` 已有单个组件的 scenes/otherScenes/results 映射；
  `GameLogicModel`/`GameLogicStepModel` 及 `types.ts` 上下层均只接受单个 component name。
- `historyComponents` 已在 parser 阶段严格解析并保存于 `ParsedGameLogicStepData`，
  `hasComponent()` 以它为唯一 trigger authority；当前没有公开“候选集合中最后触发”查询。
- `packages/logiccore/src/slot-operation/server-view.ts` 的 `lastPresent(candidates)` 按调用方候选数组
  顺序选择，不是 server history 顺序；不能用它冒充本任务合同。
- `apps/game002/src/operation-data.ts` 当前固定先取 `bg-spin` 或 `bg-refill`；refill 再经
  `resolveGeneratedMultiplierScene()` 取 WM/CM scene。
- `apps/game002/src/wl-wm-multiplier-plan.ts#resolveSettledScene()` 又合并 WM/CM scene 并把 CO overlay
  到盘面；`game002-operation-compiler.ts` 在 spin 和 refill 均调用该路径，形成两处业务合成。
- 用户随任务提供的更新服务器样本是本任务的行为基线：step 0 的候选 history 为
  `bg-spin -> bg-gencm -> bg-genco`，对应 `usedScenes=[0] -> [1] -> [2]`；step 1 为
  `bg-refill -> bg-genwm`，对应 `usedScenes=[2] -> [3]`。两步均证明“按 history 最后触发”
  与“取候选组件使用的最大 scene index”一致，且覆盖 initial/refill 两条路径。
- 仓内 `docs/crave/gameresults.json` 是旧服务器数据，只用于规划时定位现有代码，不得用它
  覆盖新样本的 index、history 或期望，也不在本任务中顺手更新该文档。
- `docs/agent-rules/game002.md` 现有“合成 multiplier 输入再 overlay CO”条款与本需求冲突，
  执行时必须用新权威 scene 选择合同取代。
- 规划会话未修改运行时代码、未安装依赖、未运行构建或测试。

## 4. 需求解释与技术决策

### 需求解释

- “最后一个组件”指传入候选集合中、在当前 step `historyComponents` 里最后出现的已触发
  组件；候选数组只定义允许集合。
- 每个新接口先选定最后触发组件，再复用现有单 component mapping 返回它的完整
  scenes/otherScenes/results 数组；不把多个组件的数据 flatten 在一起。
- game002 每个 BaseGame step 只需一个“第一个 settled scene”：step 0 以 `bg-spin` 保底，
  cascade step 以 `bg-refill` 保底；两者可同时放入候选集合，但对单 step 仍要求互斥。
- `bg-genwm`/`bg-gencm`/`bg-genco` 未触发时自然退回本 step 的 spin/refill scene；
  这是显式候选选择结果，不是路径猜测或效果降级。

### 关键决策

1. **以 `historyComponents` 作为通用“最后触发”合同**
   - 它已是 logiccore `hasComponent()` 的 trigger authority，能同样服务 scene、otherScene 和 result。
   - 不把“最大 scene index”泛化为 results/otherScenes 的隐式排序规则；该 index 仅作为
     game002 当前 server sample 的等价验证。

2. **保持现有查询对称性**
   - 在 `GameLogicStep` 增加 `getLastComponentScenes(names)`、
     `getLastComponentOtherScenes(names)`、`getLastComponentResults(names)`，并在 `GameLogic` 增加带
     `stepIndex` 的对称方法；最终名称可按现有命名风格微调，但不改变语义。
   - 返回类型、冻结与空值行为与单名 `getComponent*` 一致，不引入 nullable 或首项 fallback。

3. **game002 直接信任最后组件的完整 scene**
   - 在 app-owned config 保存候选业务组件名，logiccore 只实现中性选择。
   - 删除 WM/CM merge 和 CO overlay，不再从多个 server scene 重建第二份盘面真值。
   - 既有 WM/CM/CO transform 仍读取各自后续 component scene/otherScene 作 operation output，
     不因起始 snapshot 修正而改写动画流程。

## 5. 职责与合同

- **logiccore**：验证候选 component names，根据当前 step history 选中最后触发者，复用
  component map/index validation 返回冻结数据；不认识 game002 组件。
- **game002 operation data**：声明 settled-scene 候选组件，要求选中结果恰好一个完整、
  尺寸合法 scene，并用它作为本 step 后续 snapshot 基线。
- **game002 multiplier compiler**：只负责已选 settled scene 上的 value hydration 和后续 WM/CM/CO
  operation；不再拥有起始 scene 合成。
- **失败策略**：空候选数组、空白/重复名、已触发但 map 缺失、basic indexes 非法、
  game002 无 base spin/refill、spin 与 refill 同 step 触发或选中 scene cardinality/shape 非法均显式失败。
- **禁止行为**：不按候选数组顺序伪造 server 顺序，不读 `mapComponents` object 插入顺序，
  不使用 `historyComponentsEx`，不遇错跳过，不合并/猜测/填充 scene。

## 6. 文件范围

### 预计新增

```text
apps/game002/tests/operation-data.test.ts
tasks/185-game002-last-component-scene-selection-<utctime>.md
```

如现有 game002 adapter/compiler test 能清晰承载全部回归，可不新建 `operation-data.test.ts`。

### 预计修改

```text
packages/logiccore/src/{component,game-logic,types}.ts
packages/logiccore/tests/component.test.ts
packages/logiccore/README.md
apps/game002/src/{cascade-config,operation-data,wl-wm-multiplier-plan,game002-operation-compiler}.ts
apps/game002/tests/{wl-wm-multiplier-plan,game-adapter}.test.ts
apps/game002/tests/fixtures/game002-cascade-gmi.ts
docs/agent-rules/game002.md
```

执行时只修改实际需要的上述文件；fixture 只添加能证明最后 scene 选择的最小差异，
不复制整份 `docs/crave/gameresults.json`。

### 原则上不应修改

```text
packages/logiccore/src/slot-operation/**
packages/gameframeworks/src/**
packages/rendercore/**
apps/game002/config/**
assets/**
apps/{game003,gameviewer,gameviewer2,gamelayouteditor,gamelayoutpkgcli}/**
pnpm-lock.yaml
package.json
AGENTS.md
docs/agent-rules/shared-game-runtime.md
```

如执行时发现必须改变 slot-operation server view 语义、其它 consumer、server schema 或生成物，
先说明直接触发原因并重新界定范围，不在执行中顺手扩张。

## 7. 实施步骤

1. **确认执行基线与 characterization**
   - 重新核对 HEAD/status、根/领域规则和现有 public types。
   - 从更新服务器样本提取最小、脱敏 fixture，固定 step 0
     `spin[0] -> gencm[1] -> genco[2]` 与 step 1 `refill[2] -> genwm[3]`；不复制无关的
     result、数值或 server metadata。
   - 确认变化仍只影响 logiccore 和 game002 直接依赖链，不以旧 `docs/crave` 样本的
     scene index 重写新期望。

2. **实现 logiccore last-triggered 选择合同**
   - 在 `component.ts` 增加一个共享的候选名验证/逆序 history 选择 helper，三类 data API
     均复用它及现有 `getComponent*ForStep()`。
   - 在 `GameLogicStepModel`/`GameLogicModel` 和 public interfaces 补齐对称 method；保持返回数组
     immutable，不暴露可变 parsed data。

3. **保护通用 API 语义**
   - 测试候选数组顺序与 history 顺序不同时仍选 history 最后者，三种 data 均只返回
     选中组件的 mapping。
   - 覆盖无命中的冻结空数组、空/空白/重复候选、触发组件 map 缺失和越界 index；
     确认 invalid latest 不会 fallback 到 earlier candidate。
   - README 记录精确选择、返回和失败语义，不写 game002 业务名。

4. **game002 接入当前 step 权威 scene**
   - 在 `cascade-config.ts` 定义 app-owned settled-scene candidate set，同时包含互斥的
     `bg-spin`/`bg-refill` 和可选的 WM/CM/CO generator。
   - `operation-data.ts` 的 spin/refill 读取共用新 step API，仍用 `exactlyOneFullScene()`
     校验 cardinality、尺寸与 symbol code；删除 `resolveGeneratedMultiplierScene()`。
   - 显式校验每 step 的 base component：step 0 必须是 spin，cascade step 必须是 refill，
     且二者不同时触发。

5. **删除 app 内重复 scene 合成**
   - 从 multiplier compiler 删除 `resolveSettledScene()` 及 `mergeGeneratedMultipliers()`/CO overlay
     分支，保留 value hydration 与 settled transform 职责。
   - operation compiler 直接以 `spinData.scene`/`fall.refillScene` 生成 spin/refill output，
     确认所有后续 transform/win/remove 消费该 output continuity。
   - 删除只保护旧合成算法的单测，用“最后 component scene 原样成为起始/回填 output”
     的断言取代，不为旧算法保留兼容分支。

6. **规则、验收与报告**
   - 将 `game002.md` 中“WM/CM 合成 + CO overlay”替换为最后触发 component 的完整
     scene 合同，保留 transform 顺序和数值权威来源。
   - 运行下述 L2 定向验收、检查 diff/旧 helper 残留，生成 UTC 执行报告。

## 8. 测试与验收

### 测试原则

- logiccore 用与游戏无关的 `a/b/c` component fixture 测试 history 选择，不在 shared test
  引入 game002 组件名或读取 `assets/**`。
- game002 覆盖至少：只有 spin、spin + 最后 generator、只有 refill、refill + 最后 generator，
  以及候选触发但 scene 缺失/多份的 strict failure。
- 更新服务器样本的回归必须精确断言 step 0 选中 `bg-genco` scene index 2，step 1
  选中 `bg-genwm` scene index 3；这两个用例不得由手工 merge/overlay 算法生成相同矩阵来冒充。
- 断言 operation plan/reel 收到的 initial/refill target 是 server 最后 scene 的精确值，
  不只断言“没有抛错”或单个 CO/WM/CM 坐标。
- 不为旧 merge/overlay 测试扭曲新生产合同；旧期望与新权威 scene 冲突时更新期望。

### 验收级别

`L2`。原因是修改 logiccore public `GameLogic`/`GameLogicStep` contract，并接入经 gameframeworks
facade 消费该合同的 game002 直接依赖链；不涉及根工具链、schema、生成物或 release，
因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/logiccore test -- tests/component.test.ts
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter game002 exec vitest run tests/operation-data.test.ts tests/wl-wm-multiplier-plan.test.ts tests/game-adapter.test.ts
pnpm --filter game002 typecheck
git diff --check
```

如执行时没有新建 `operation-data.test.ts`，第 4 条删除该路径，不为满足命令而创建空测试。
`gameframeworks typecheck` 的 prepare 链会构建 logiccore public 产物，用于证明 facade 与下游类型消费；
不再额外运行整仓 build/test/lint/format。验收失败时先最小化复现并判定是否由本任务引入。

### 人工验收

不要求视觉素材或时序调整。若本地 game002 dev 环境已可用，建议用一份同 step
含 `bg-genco` 的真实/已脱敏 response 确认 initial spin 落定后立即显示最终 CO/WM/CM 盘面，
且后续 transform 不出现 scene continuity 错误。本建议不代替自动化验收，也不扩大为完整视觉回归。

### 独立验收建议

`建议`。原因是跨包 public contract 与每 step 权威 scene 基线同时改变，但不涉及 credential、
服务器私有轮带、resource ownership、异步 transaction、schema、ZIP、生成物或 release。独立复验聚焦：

```bash
pnpm --filter @slotclientengine/logiccore test -- tests/component.test.ts
pnpm --filter game002 exec vitest run tests/operation-data.test.ts tests/game-adapter.test.ts
pnpm --filter game002 typecheck
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时执行 `CI=true pnpm install --frozen-lockfile`，不切换 npm/yarn。
- 只有下载实际失败后才设置 `http_proxy`/`https_proxy=http://127.0.0.1:1087` 重试原命令。
- 本任务不需要新依赖或 lockfile 变化；如出现必须先停止并说明原因。

## 10. 生成物、文档与规则

- 本任务不修改 YAML/manifest，无生成器或 parity checker。
- 更新 `packages/logiccore/README.md` 的 component query 用法和 strict failure 说明。
- 最小更新 `docs/agent-rules/game002.md`，将旧的 scene 合成条款替换为最后触发组件的
  完整 scene 合同；不把具体样本 index 或一次性执行证据写入规则。
- `shared-game-runtime.md` 已明确 logiccore 拥有通用 strict selector，无需为此复制新条款；
  根 `AGENTS.md` 也不修改。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/185-game002-last-component-scene-selection-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 API 名称/语义、实际文件、
删除的合成路径、计划偏差、验收命令/结果、未做的建议人工验收和剩余风险；
不收集无关 coverage、全仓统计、历史矩阵或 profiler 证据。

## 12. 风险、假设与待确认

### 风险

- 若 server 未来不再保证 `historyComponents` 是执行顺序，新 selector 会选错权威组件；
  本任务以用户确认语义和 logiccore 现有 trigger authority 为合同，不另读隐式 object 顺序。
- 最后组件 scene 必须是完整累积盘面；如某个 server 版本仅返回 delta，直接使用会
  显式触发 shape/continuity/test 失败，不应恢复 app 猜测合成。
- 现有测试 double 手写 `GameLogicStep` 方法，public interface 增加 method 后可能暴露多处 mock 缺口；
  只更新直接消费新接口的 double，不顺手重构全仓 fixtures。

### 假设

- `historyComponents` 保持当前的实际触发顺序语义，而 `historyComponentsEx` 可包含未实际
  产生数据的扩展记录，因此不参与选择。
- 用户提供的更新服务器样本优先于仓内旧 `docs/crave/gameresults.json`；本计划不假设
  旧文档中的 scene index 仍是当前 server 事实。
- 候选组件一次触发后的 `basicComponentData` 按现有 model 仍是单个 component record；
  本任务不引入 component occurrence index。
- game002 同一 step 不同时触发 `bg-spin` 和 `bg-refill`，且该候选组件只要实际触发就
  会提供恰好一份完整 scene。

### 待确认

无。如执行时真实 response 推翻上述 server history/完整 scene 假设，必须停止并以具体
step/component/index 证据请求重新决策，不恢复静默合成或 fallback。
