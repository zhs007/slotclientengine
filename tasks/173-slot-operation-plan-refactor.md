# 173 slot-operation-plan-refactor 任务计划

## 1. 目标与完成定义

### 目标

落实 `docs/slot-operation-plan.md` 的 typed operation execution plan 重构：将当前固定的
`SlotRoundExecutionPlan`、game002 隐式 multiplier/CO phase 数据和 Game Viewer 2 直接 snapshot
mutation，统一为一份有序、不可变、可扩展的 `SlotOperationPlanV1`。

正式游戏继续只从权威 `GameLogic/component` 编译 operation；本地 Game Viewer 2 通过独立的
renderer-free authoring package 执行“建议 → 人工编辑 → strict finalize”。两条路径最终生成相同
operation IR，并由 rendercore 实例级 handler registry 在首次画面 mutation 前完成完整 preflight。

### 完成定义

- [x] `logiccore` 提供 stable、deep-frozen 的 `SlotOperationPlanV1`、strict source evidence、built-in builders、custom definition/program compiler 和 chain/final closure；相同输入重复编译深相等。
- [x] 每个可观察 scene/value/occurrence commit 都有连续 `input/output`；dropdown/refill/replacement/relocation/release/collect 保留 identity、权威索引及具名 component role。
- [x] 未知/重复 kind-version/definition/handler/capability、非法 cardinality/index/pos 或无法证明的 output 在 mutation 前失败；正式路径不调用 scene 推导补值。
- [x] rendercore 实例级 registry/coordinator 执行 built-in/custom operation；prepared transaction rollback/destroy 幂等，失败无当前 operation 半提交或泄漏。
- [x] game002 BaseGame、WL/WM/CM/CO 和同一 server round 的 FreeGame 编入一份 plan；WM→CN、CM 后 value、CO relocation 可按 operation 断言，不依赖 presentation batch/Target 私有 phase。
- [x] Game Viewer 2 生成 exact/ambiguous/unresolved suggestions，人工编辑后 strict finalize；未闭合 draft 不可 preview/export，replay 新建 generation。
- [x] configured adapter 和全部 direct consumer parity 迁移后删除固定 step union、旧 target surface 和兼容 adapter。
- [x] public exports、README、v3 格式和领域规则同步；L3 通过，浏览器人工验收状态如实记录。

## 2. 范围

### 包含

- `packages/logiccore`：operation IR/source/selector/definition/compiler、built-ins、snapshot continuity/output proof；`SlotRoundFlowProfileV1` adapter 继续承载配置业务。
- 新建 `packages/slotoperationauthoring`：snapshot diff suggestion、edit evidence、draft parser/finalizer；只依赖 logiccore。
- `packages/rendercore`：实例级 registry/coordinator、built-in handlers、逐格 choreography、runtime assertion/transaction。
- `packages/gameframeworks`：只转出正式游戏所需的 operation compiler/type facade，不暴露本地 authoring。
- `apps/game002`：server compiler/definitions、custom handlers、BaseGame/FreeGame 接入并删除重复 batch/lookup/大 transform phase。
- `apps/gameviewer2`：v3 project/draft、建议/编辑 UI、strict readiness/finalize、runtime/replay；保留本地 ZIP/公开轮带/独立窗口/一次性 channel。
- `packages/rendercore/scene-layout/configured-round-adapter.ts`：迁移到 built-in operation program/handlers。
- package metadata、`pnpm-lock.yaml`、相关测试、README、`docs/slot-operation-plan.md` 状态和领域规则。

### 不包含

- 不修改服务器协议、GMI 原始结构、credential/live URL、本地公开轮带策略或读取服务器真实轮带。
- 不把 game002 symbol/component/动画名放入 logiccore/rendercore，不让 shared package 反向 import game002。
- 不建立进程级 definition/handler registry、TypeScript declaration merging、default operation、首项 handler
  fallback、kind alias、路径猜测、placeholder 或静默效果降级。
- 不从 scene 猜测 amount、result grouping/order、multiplier 来源、CO pairing 或业务触发原因；歧义留给人工。
- 不把纯动画内部 `Start/Idle/End` 阶段强制拆成 operation；是否拆分只由语义 commit/rollback 边界决定。
- 不修改 game003、其它 editor、production assets/YAML/生成资源、根工具版本或引入第三方 runtime 依赖。
- 不为 Game Viewer 2 提供任意游戏插件加载系统；本任务 UI 只允许选择本地注册且具有 editor schema 与
  render handler 的 built-in operation，未知 custom kind/version 精确失败。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T13:58:22Z
HEAD: 7ab552549d559c607d3aeff2f52ba18afb69eee9
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与输入：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/slot-operation-plan.md
docs/agent-rules/shared-game-runtime.md
docs/agent-rules/game002.md
docs/agent-rules/gameviewer2-local-flow.md
docs/agent-rules/scene-layout.md
```

当前实现结论：

- `slot-round-plan.ts` 仅有 `win/dropdown/refill/settled-transform`；spin 特殊处理、win/remove 合并，custom callback 只给最终 diff，source 无 role/index evidence。
- compiler 已有 x-first snapshot、occurrence id、dropdown/refill/relocation 校验和 `cloneAndFreeze()`，应作为新 IR 唯一基础。
- rendercore coordinator 按固定 union 调一个 Target；只有 plan preflight，无 kind-version registry 或统一 transaction lifecycle。
- `apps/game002/src/wl-wm-multiplier-plan.ts` 将完整 WM/CM/CO 最终变化压成一个 settled transform，同时把
  `wlIncrements/wmReplacements/cnUpdates/cm/coCollection` 另存为
  `Game002WlWmMultiplierPresentationBatch`。
- `Game002RoundTarget` 用私有 phase 解释 batch 并由 `cascade-sequence.ts` 再比对；FreeGame 独立串接，单次 response 有多份 execution contract。
- configured scene-layout adapter 是旧 compiler/coordinator 的另一个直接 consumer；仓内没有其它 production
  direct consumer。`gameframeworks/src/index.ts` 当前原样转出旧 plan 类型与 compiler。
- Game Viewer 2 当前 strict v2 project 保存 snapshots/choreographies；rendercore 的
  `local-scene-flow.ts` 对 settled 边直接 `applyMainReelSnapshot()` 并维护独立 cell sequence generation，尚无
  operation suggestion、人工补全、source proof 或 plan closure。
- 新建 workspace package 会新增 lockfile importer；此次同时删除跨 package public API，验收按 L3，不以定向
  consumer 集合为由降级。当前代码和方案合同足以制定计划，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- `docs/slot-operation-plan.md` 是最终需求合同；不得重新引入 runtime fallback、全局 registry 或 logiccore 游戏分支。
- “一轮一份 plan”覆盖 game002 一次 `playSpin(logic)` 的 BaseGame 和随后 FreeGame；mode transition、AF、CO、final win 等不再另起 playback plan。
- operation 是语义 commit；无 scene mutation 的 spin/win/presentation 可 `input === output`，但仍需 source/payload/capability。首个 full spin 以权威落定 snapshot 同时作为 plan.initial/target，不反推 spin 前的本地 strip/stop。
- Game Viewer 2 snapshot 仍是 checkpoint；相邻 edge 可有多个可排序 draft，中间 snapshot 由顺序确定，最后 output 必须 exact 等于目标。
- 项目升级为 strict v3；v2 只允许用户显式 upgrade 为待 review/finalize draft，不静默播放或覆盖原文件；v1 仍拒绝。

### 关键决策

1. **固定 `kind` 与 `version` 分字段，注册键由二者派生**
   - operation 保存 namespaced `kind` 和正安全整数 `version`；`toSlotOperationKey()` 生成唯一 key，如 `game002:wild-multiplier@1`。
   - id 唯一、`operationIndex` 连续；`stepIndex` 只在 server source evidence。本地 edge 不伪装 server step；capability 是稳定、非空白、去重的 namespaced string。

2. **logiccore finalizer 拥有可信 plan，compiler/definition 只产 draft/result**
   - `compileSlotOperationPlan({ logic, compiler, definitions, profile, symbolCodes, columns, rows })` 从纯 program compiler 取得 drafts，再按当前 snapshot 调用 exact definition。
   - definitions 以 immutable 参数传入，重复 kind-version 预先失败；custom result 仍通过 dimensions/catalog/identity/change/relocation/output/deep-data 校验。
   - plan/source/payload 禁止 function、class/runtime object 和循环引用，统一 clone/deep-freeze；app 不可 cast/构造可信 plan。

3. **component source 使用具名 role selection，不保存平行数据袋**
   - selector 统一解析 component name/index、`usedScenes/usedOtherScenes/usedResults` 原索引、规范化 matrix/result/positions 和 cardinality。
   - definition 声明 `bindings: Record<role, ComponentSelection>`；缺失、重复、越界、大小写漂移和 cardinality 不匹配失败。
   - local source 保存 snapshot id 与 suggestion/edit evidence；finalizer 只接受无 ambiguous/unresolved 且可重算 output 的 proof。

4. **built-in operation 拆开语义 commit，旧 profile 只保留业务配置职责**
   - 首批实现 `slot:spin/win/remove/dropdown/refill/update-values/replace-occurrences/relocate-occurrences/collect@1`；win/collect 可不改 snapshot，remove 独立生成 holes。
   - `SlotRoundFlowProfileV1` adapter 保持 component/result/order/amount policy；旧/new trace parity 后迁移 consumer，最终删除旧 plan 与 adapter。
   - spin 仍用本地公开轮带，只以 operation.output 为权威落点；source 不保存/推断 server strip/randomNumbers。

5. **rendercore registry/coordinator 是实例 owner，handler 只持借用 runtime**
   - registry exact 注册 handler；duplicate/unknown/payload/capability mismatch 在 `cleanup("next-spin")` 和 mutation 前全 plan preflight。
   - coordinator 执行 `prepare → start/update → commit → runtime snapshot assert → destroy`；失败 rollback 当前未提交 transaction、destroy、fatal cleanup，并保留原始/cleanup error。
   - coordinator 只拥有 prepared state；reel/Symbol/popup/cascade/win player 由 app/runtime owner 后释放，handler 不 destroy borrowed tree。

6. **抽取通用 choreography executor，但不把动画阶段写入 plan 状态机**
   - 将 once completion count、all/first-cell barrier、generation retirement 抽为通用 assignment executor。
   - payload 只保存 cell assignment/completion policy；WM/CM 私有动画 phase 留在 custom handler，mutation 仍由 operation commit。

7. **独立 authoring package + Game Viewer 2 v3**
   - `@slotclientengine/slotoperationauthoring` 只依赖 logiccore，提供七类 suggest、diagnostics/edit evidence、draft parser/serializer 和 edge/plan finalizer。
   - Game Viewer 2 直接依赖 rendercore + authoring；rendercore 不反向依赖，正式 bundle 不加载推导代码。
   - v3 edge 保存 ordered drafts/evidence；UI 编辑候选、冲突、required fields、pairing、result/amount/order/choreography，全部 closure 后才 launch。

8. **game002 payload 拥有业务事实，shared handler 拥有显示事务**
   - game002 compiler/definitions 输出 WL、WM、WM→CN、CM、CM→CN、CO、win/remove、FreeGame 连续 operations；业务 names/codes/formula 留在 app。
   - payload 直接保存 animation target、intermediate/final update、relocation/replacement proof 和 server bindings，不再另建 step batch 或反推大 diff。
   - handlers 复用 rendercore public capability，不复制 Pixi/Reel/Spine；原动画顺序、cadence、anticipation、summary、win-amount blocking 保持。

## 5. 职责与合同

- **logiccore**：拥有 server selection、operation/snapshot IR、built-in algorithms、definition invocation、strict
  plan finalization 和 immutable execution proof；不认识游戏 symbol/component/animation。
- **slotoperationauthoring**：拥有本地 diff suggestion、歧义/未解字段、人工 edits 和 authored closure；不读取
  GMI、不伪造 component、不导入 rendercore。
- **rendercore**：拥有 registry/coordinator、built-in presentation handlers、choreography executor、reel/symbol/
  popup transaction 和 runtime output assertion；不解释 game002 payload 业务含义。
- **gameframeworks**：正式游戏 facade，只导出 logiccore/rendercore production surface。
- **game002**：拥有 operation 顺序、custom definition/payload、业务 resolver/formatter 与 custom handler 组合；
  handler 只能通过 rendercore public capability 操作画面。
- **Game Viewer 2**：拥有本地文件/UI draft/editor choice；ZIP/readiness、reel 和 player 仍由 rendercore，建议与
  finalize 由 authoring package。
- **资源生命周期**：compiler/finalizer 无资源；registry 借用长期 runtime，coordinator 独占当前 prepared
  transaction；commit/rollback 后都 destroy，fatal/next-spin/app destroy 清理幂等且顺序明确。
- **禁止行为**：第二份 operation/resource 表、全局 mutable registry、raw renderer callback 入 plan、silent
  migration/fallback、scene 推断正式数据、跨 package 游戏硬编码和手改生成物。

## 6. 文件范围

### 预计新增

```text
packages/logiccore/src/slot-operation/{types,source-selectors,builtins,compiler,validation,index}.ts
packages/logiccore/tests/slot-operation/{source-selectors,builtins,compiler,validation,parity}.test.ts
packages/slotoperationauthoring/{package.json,tsconfig*.json,eslint.config.cjs,README.md}
packages/slotoperationauthoring/src/{types,suggestions,edits,finalizer,project,index}.ts
packages/slotoperationauthoring/tests/{suggestions,finalizer,project}.test.ts
packages/rendercore/src/slot-operation/{types,registry,coordinator,builtin-handlers,choreography-executor,index}.ts
packages/rendercore/tests/slot-operation/{registry,coordinator,builtin-handlers,choreography-executor}.test.ts
apps/game002/src/slot-operations/{types,compiler,definitions,handlers}.ts
apps/game002/tests/{operation-compiler,operation-handlers,operation-round-parity}.test.ts
apps/gameviewer2/src/{model/operation-project,ui/operation-editor}.ts
apps/gameviewer2/tests/{operation-project,operation-editor,operation-runtime}.test.ts
tasks/173-slot-operation-plan-refactor-<utctime>.md
```

### 预计修改

```text
packages/logiccore/{package.json,README.md,src/{index,slot-round-plan,validation}.ts,tests/slot-round-flow.test.ts}
packages/rendercore/{package.json,README.md,src/{index,slot-round/**,scene-layout/index}.ts}
packages/rendercore/src/scene-layout/{configured-round-adapter,local-scene-authoring,local-scene-flow}.ts
packages/rendercore/tests/{slot-round/**,scene-layout/{configured-round-adapter,local-scene-authoring,local-scene-flow,local-scene-readiness}.test.ts}
packages/gameframeworks/{README.md,src/index.ts}
apps/game002/{README.md,package.json,src/{game-adapter,cascade-sequence,wl-wm-multiplier-plan,freegame-plan,freegame-playback}.ts}
apps/game002/tests/{game-adapter,game002-round-transform,freegame-plan}.test.ts
apps/gameviewer2/{package.json,README.md,src/styles.css,src/{model/project,runtime/entry,ui/app-shell}.ts}
apps/gameviewer2/tests/{project,app-shell}.test.ts
docs/slot-operation-plan.md
docs/agent-rules/{shared-game-runtime,game002,gameviewer2-local-flow}.md
pnpm-lock.yaml
```

文件可按职责细分；consumer 切换后可删除旧 plan/coordinator/batch/FreeGame 独立 plan，不得留下 public alias。
`scene-layout.md` 仅在其稳定职责确实变化时最小更新。

### 原则上不应修改

```text
apps/game003/**
apps/gamelayouteditor/**
apps/gamelayoutpkgcli/**
apps/popupeditor/**
apps/symbolseditor/**
packages/netcore/**
packages/uiframeworks/**
assets/**
docs/agent-rules/loading-ui.md
AGENTS.md
```

若执行需要改变 GMI/server schema、加入全局 registry、允许正式 scene fallback、修改 production 资源/动画
时序、增加第三方依赖或迁移未列出的 app，属于重大范围扩张，必须先停止说明。

## 7. 实施步骤

1. **确认基线并建立 legacy characterization/parity fixture**
   - 核对 HEAD/status、direct consumer/dependency graph；固定 logiccore base/cascade、game002 BaseGame+FreeGame、configured adapter、Game Viewer 2 v2 replay/generation 的可比 trace/event。

2. **建立 logiccore operation IR、source selector 和 finalizer**
   - 实现 kind/version/id、source、snapshot/occurrence、selection、draft/definition/program compiler 和 plan；复用旧 snapshot/position/identity 算法。
   - 验证纯数据、capability、id/index、chain/final、change/relocation proof/deep-freeze，并覆盖重复/unknown/非法版本/遍历顺序。

3. **实现 built-in definitions/builders 与旧 profile parity adapter**
   - 拆出 built-ins，统一 role selector 与 amount/result/position normalization；profile adapter 生成 draft。
   - 短暂保留旧 compiler 对比 scene/value/occurrence/movement/release/result，parity 后切换 direct consumers。

4. **建立独立 local authoring package**
   - 创建 package、strict parser、七类 suggestion、diagnostics/edits、edge/plan finalizer；非唯一解保留 candidates，缺失数据 unresolved。
   - 测试三类状态、relocation 多解、closure、edit 重校验、determinism/deep-freeze 和纯数据边界。

5. **实现 rendercore registry、coordinator 和 built-in handlers**
   - 建立 exact registry、全 plan preflight、prepared lifecycle、fatal cleanup/runtime assertion，并注入各 lifecycle stage failure。
   - 用现有 reel/cascade/replacement/transfer 组合 built-in handlers；抽取 choreography executor，保持两种 reel landing/generation 语义。

6. **迁移 configured scene-layout adapter 和 framework facade**
   - adapter 改用 profile compiler/registry/coordinator/built-ins；award popup 仍由 adapter 在 plan 完成后触发。
   - gameframeworks 转出新 production API；acceptance 固定 local reel、win/cascade、cleanup/popup。

7. **将 game002 server 数据编译为完整 operation program**
   - 将 multiplier/CO/FreeGame 解析迁入 definitions，使用 selector/evidence，按原子边界输出 WL/WM/CM/CO、win/remove、FreeGame、win-amount operations。
   - 固定完整 sample/缺 component failure；删除 batch、step lookup、optional plan fallback 和双 plan 串接。

8. **拆分 game002 custom handlers 并复用 shared transaction**
   - 将大 target 拆为实例 handlers；animation phase 可私有，但不可旁路 payload/input/output/commit。
   - 复用 shared capability，验证 WM/CM/CO 中间 snapshot、anticipation/summary/win amount、rollback/destroy 和原时序。

9. **升级 Game Viewer 2 v3 项目与 authoring UI**
   - parser 移入 authoring package，edge 保存 drafts/evidence；显式 v2→v3 upgrade 不覆盖原文件且默认待 review。
   - UI 编辑 status/kind/positions/pairing/result/order/amount/choreography/policy；未解、歧义或 closure error 禁用 preview/export。

10. **让本地 preview 执行 finalized operation plan**
    - app finalize 后由 rendercore 校验 layout/hash/dimensions/code/value/state/handler；launch 只传 ZIP/hash、plan/presentation。
    - local runtime 用同一 coordinator，删除 settled snapshot 直通；replay 重建 coordinator/generation 并退役旧 controller。

11. **删除 legacy contract 并完成 public surface/依赖收敛**
    - parity 后删除旧 plan/step/capability、fixed target/export/adapter；搜索旧 compiler、`settled-transform` 和 batch 残留。
    - 更新 package/importers/lockfile，只新增 workspace link。

12. **同步文档、规则并收尾**
    - 更新 README、v3/upgrade 文档、方案状态和三份领域规则；运行 L3/人工验收并检查 diff/旧值/lockfile。
    - 生成 UTC 中文报告，记录偏差和未完成人工项。

## 8. 测试与验收

### 测试原则

- 使用当前真实 GMI fixture、scene-layout ZIP fixture 与 fake runtime failure seam；fake runtime 只证明顺序/
  transaction，不替代 game002/Game Viewer 2 浏览器视觉验收。
- 测试正常链路、component/source/capability strict failure、deep freeze、determinism、identity continuity、所有
  transaction failure stage、authoring ambiguity/edit closure、replay generation 和 legacy removal。
- parity 只保护明确业务合同和可观察事件，不为了匹配旧大 target 私有 phase 而扭曲新 handler 架构。

### 验收级别

`L3`。本任务新增 workspace package并修改 `pnpm-lock.yaml`，删除 logiccore/rendercore/gameframeworks public API，
同时迁移两个 app 和 configured adapter，属于根依赖元数据与大规模跨包重构。需整仓验证，不能只做 L2 direct
consumer 检查。

### 执行会话必须运行

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

实施期间先运行修改 package 的定向测试最小化失败；上述六条是最终 L3 收口命令，不以定向通过替代。新
package/importer 使用 Node 24 下的 pnpm 更新 lockfile，并检查 diff 只有预期 workspace link。

### 人工验收

- game002：用真实 Crave package/GMI sample 检查 BaseGame cascade、WM/CM/CO、FreeGame enter/spin/AF/CO/exit、
  anticipation、summary、global win amount 和下一 spin cleanup；核对动画顺序与重构前一致。
- Game Viewer 2：导入真实 layout ZIP，新建 exact edge 可直接预填；制造 relocation 多解和缺 amount/result 的
  unresolved edge，确认不可 preview；人工补全后播放并 replay，确认 scene/value/choreography 和 generation 正确。
- fault injection：至少人工观察一次 handler/preflight 资源缺失在 mutation 前报错，以及 active operation 失败后
  无半替换/残留 controller。未执行的人工项必须写入报告，不得标为通过。

### 独立验收建议

`必须`。涉及跨包 public contract、server 数据边界、occurrence identity、异步 transaction/destroy、正式项目
schema 和 workspace lockfile。独立验收重点是 source/chain proof、mutation 前 preflight、game002 中间 commit
和 v3 unresolved gate；最多复验：

```bash
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/slotoperationauthoring --filter gameviewer2 --filter game002 test
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 新 package 只新增 `@slotclientengine/logiccore: workspace:*`；Game Viewer 2 新增
  `@slotclientengine/slotoperationauthoring: workspace:*`。rendercore 和正式游戏不得依赖 authoring package。
- 用 pnpm 更新 `pnpm-lock.yaml`，禁止手改 importer；依赖缺失时使用
  `CI=true pnpm install --frozen-lockfile`。不切换 npm/yarn，不新增外部依赖。
- 只有实际下载失败后才设置 `http_proxy/https_proxy=http://127.0.0.1:1087` 并重试原命令。

## 10. 生成物、文档与规则

- 本任务不修改 assets/YAML 或现有 generated TypeScript；若意外触发生成物变化，先判断是否越界，不手改。
- 新 package build 生成 `dist` 但不提交；package export/build/typecheck/test 配置对齐根 Node/TypeScript/Vitest 工具链。
- 更新 logiccore/rendercore/gameframeworks/game002/Game Viewer 2 README；v3 schema、v2 explicit upgrade 和正式/
  authoring 数据边界写入长期文档。
- 将 `docs/slot-operation-plan.md` 从“架构提案，尚未实现”更新为实施后的正式合同或指向正式 API；不复制
  执行证据。只更新 `shared-game-runtime.md`、`game002.md`、`gameviewer2-local-flow.md` 的稳定职责边界；除非
  scene-layout public runtime 边界确实变化，否则不更新 `scene-layout.md`，不修改根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/173-slot-operation-plan-refactor-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、关键决策与偏差、六条 L3 命令结果、
game002/Game Viewer 2 人工验收状态、legacy 搜索结果、lockfile 变化和剩余风险；不收集无关 coverage 历史矩阵。

## 12. 风险、假设与待确认

### 风险

- TypeScript custom union/handler payload 关联若设计不严，可能退化为 cast 或全局 declaration merging；必须以
  definition/registry 泛型和 runtime exact validator 同时保护。
- game002 当前 target 混合 cascade、anticipation、multiplier、FreeGame 和 win amount；拆 handler 时最易丢失
  animation barrier、prepared transfer rollback 或跨 mode scene continuity，需要完整 sample parity 和浏览器验收。
- 一条 Game Viewer 2 snapshot edge 可能有多种合法 operation 分解；建议器不能假装唯一，UI/项目必须允许
  多 operation、候选保留和人工补全，否则会形成新的 silent fallback。
- coordinator 只能 rollback 当前未提交 operation，已提交前序 operation 不做整轮倒放；fatal cleanup 必须
  把 runtime 收敛到不可继续 spin 的显式失败状态，不能假装恢复到 plan.initial。
- v3 explicit upgrade 会把 v2 项目转为待审阅草稿，不能保证旧项目一键播放；这是引入 source/edit proof 的
  必要严格性，README/UI 必须提前说明。
- L3 命令和真实视觉验收耗时较长；失败先最小化到 package/fixture，不通过修改 unrelated code 掩盖。

### 假设

- `docs/slot-operation-plan.md` 是用户最后确认方案，任务 173 可以按该合同同时迁移 formal game、configured
  adapter 和 Game Viewer 2，而不是只增加一组未使用类型。
- 新 package 名固定为 `@slotclientengine/slotoperationauthoring`；只使用现有 workspace 工具链和依赖。
- 当前仓内旧 plan direct consumer 搜索结果完整；执行时出现新的 direct consumer 先按同一 API 做小幅迁移，
  若涉及未列 app 或不同业务合同则停止说明。

### 待确认

无。

## 13. 完成清单

- [x] 目标和非目标已满足，正式/authoring 路径严格隔离。
- [x] 实际修改未超范围，或偏差已在报告说明。
- [x] operation public API、source schema、identity/closure 和职责边界符合计划。
- [x] registry/preflight/prepare/commit/rollback/destroy 及资源 ownership 已验证。
- [x] game002、configured adapter、Game Viewer 2 全部使用新 plan，旧 contract/alias 无残留。
- [x] v3 项目、v2 explicit upgrade、README、领域规则和 lockfile 已同步。
- [x] 六条 L3 自动化验收通过；自动化与人工验收已明确区分。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的四份领域规则、本计划和 `docs/slot-operation-plan.md`；
2. 核对 HEAD/status/direct consumer 与 package dependency graph；
3. 按“legacy characterization → core IR → authoring → rendercore → consumers → 删除 legacy”的顺序实施；
4. 迁移期 compatibility adapter 只能短暂存在，交付时不得保留 public 旧 alias；
5. 小幅适配当前实现时在报告记录，重大范围扩张时先停止说明；
6. 定向排错后运行计划规定的 L3 验收，并如实记录人工验收；
7. 完成后生成执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
