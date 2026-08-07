# 183 game002-runtime-plan-consolidation 任务计划

## 1. 目标与完成定义

### 目标

重构 game002 的 round 数据流、presentation execution 和 Scene Layout 接入。服务器 response 先一次性
解码为 game002-owned immutable facts，再直接编译为唯一 `SlotOperationPlanV2`；WM、CM、CO、WL increment、
FreeGame AF/CO 等 presentation 由 rendercore 通用 awaitable transaction runner 执行，不再在 aggregate
transform、atomic payload、synthetic session 和大型 `#activity` 状态机之间重复表达。

一个完整 `SceneLayoutPackageRuntime` 应拥有 layout、唯一 main reel、reel overlay、transition、popup 和
presentation root。game002 只注入 manifest-derived 资源和 typed 业务 plan，不再使用
`presentationOnly` surface、自建 reel root 或手工 `worldLayer.addChild(...)`。本任务以删除重复职责为结果，
不以拆文件、改名或搬运相同行数冒充简化。

### 完成定义

- [ ] 每个 round 在首次画面 mutation 前解码为一份 deep-frozen `Game002RoundFacts`，一次完成 component、
      scene、otherScene、value、position、symbol 和跨 step continuity 校验；compiler/target 不再读取 raw
      `GameLogicStep`、component raw 或再次选择 otherScene。
- [ ] compiler 只消费 facts，直接输出 closure 完整的 atomic `SlotOperationPlanV2`；每个 operation payload
      是按 kind 区分的最小 evidence，不复制整批 transform/final snapshot供 target反向重建。
- [ ] 删除 `createSyntheticTransformStep()`、deprecated `coReplacements`、mutable
      `Game002WlWmMultiplierCompiler` payload cache和 aggregate/atomic双轨，不保留 alias/feature flag。
- [ ] rendercore runner用 awaitable symbol playback和 visual transaction journal执行线性命令、checkpoint、
      rollback、abort、cleanup、destroy；game002不再用二十多个 activity分支轮询 WM/CM/CO phase。
- [ ] 未被 production使用、依赖 `onceCompletionCount` 的
      `createSlotOperationCellChoreographyExecutor` 被替换或删除，不并存三套 executor。
- [ ] Pixi stage只挂一个 Scene Layout package root；package runtime创建唯一 main reel并按 manifest
      order/placement挂载，跨 BaseGame/FreeGame相同 binding保持 reel identity。game002源码不再出现
      `worldLayer`、`mainReelsLayer`装配或 `createGame002SceneLayoutPlayers()`。
- [ ] runtime显式支持 deferred/uncommitted initial reel：mount可 prepare reel，但 live `defaultScene` commit
      前不可见且业务 API严格失败；不猜 stop、制造 placeholder或读取服务器真实轮带。
- [ ] cascade overlay通过 main-reel typed attach/ownership API接入且低于 transition/popup；app不借用并
      修改 package内部 display tree。
- [ ] 当前公开本地轮带、Web Crypto phase、anticipation/Nearwin、cascade、WL/WM/CM/CN/CO、FreeGame、
      popup、金额、strict preflight/rollback和下一轮 cleanup行为保持。
- [ ] package bytes、catalog/registry/reel和 runtime resources各有唯一 owner/prepare路径，不扩大 initial
      resource closure；adapter删除无生产消费者的 deprecated injection/layout/request surface。
- [ ] L2自动化、真实浏览器人工验收和独立验收完成，生成 UTC中文报告；报告记录旧职责删除和 production
      diffstat，但行数不是正确性通过条件。

## 2. 范围

### 包含

- `packages/logiccore/slot-operation`：补齐不认识 game002业务的 exact server-selection、matrix、position和
  occurrence validation。
- `apps/game002`：single-pass facts decoder、atomic compiler、presentation program、reel business controller、
  operation registration、完整 Scene Layout runtime接入和旧轨删除。
- `packages/rendercore/slot-operation`：awaitable presentation transaction runner及 symbol/value/replacement/
  transfer/progress typed host contract。
- `packages/rendercore/scene-layout`：deferred initial reel、package-owned creation/order/placement、generic effect/
  value input、custom plan spin、awaitable symbol与 transaction facade、reel overlay attachment。
- `packages/gameframeworks`：新增 logiccore/rendercore public contract的最小 facade re-export。
- 直接测试、README、source-boundary和最小领域规则更新。

### 不包含

- 不改变 WM/CM/CO/WL/AF/FreeGame公式、component/symbol/animation名、时序或 server协议；不得删校验换行数。
- 不把 game002 component顺序、CO邻域、WL policy、金额或 FreeGame语义下沉到 shared package。
- 不把 round/transform/FreeGame压回 opaque operation；每个 mutation继续有 exact input/output/source/closure。
- 不修改 manifest/schema、`assets/**`、YAML、ZIP、assets map、生成物或正式资源。
- 不迁移 game003、Viewer、Editor或其它 consumer；不恢复 V1/profile compiler/cascade sequence/旧 FreeGame。
- 不改变 loading 99%/100%、live session、Leo UI、network、bet、currency或 frame DOM policy。
- 不新增依赖，不修改根工具链、workspace、package manager或 lockfile，不整仓格式化。

## 3. 制定计划时的基线

```text
UTC: 2026-08-07T10:16:09Z
HEAD: e6a1020a7a035e6a01b4e7c671a86c9427302a94
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{game002,shared-game-runtime,loading-ui,scene-layout}.md
tasks/{178-slot-operation-effect-composition-refactor-260806-103800,
       181-rendercore-awaitable-symbol-state-playback-260807-072308,
       182-rendercore-popup-canvas-input}.md
```

目标目录无补充 `AGENTS.md`。当前结论：

- `apps/game002/src` 约 10,783 行；facts/plan/target七个主要文件约 7,176 行，仅用于定位重复职责。
- multiplier compiler同时选择 raw component、保存 pending WL、合成 scene/value、生成 transform和缓存
  payload；operation compiler再拆 atomic op，target又用 synthetic step拼回 aggregate。
- `Game002RoundTarget` 保存 batch/session、prepared transactions和二十多个 activity；Task 181虽已提供
  awaitable playback，transform仍是手写 phase machine。
- 四个 plan/data文件重复实现 matrix/position/cardinality/raw parsing helper；logiccore已有 server view、
  snapshot/change/mutation/finalizer，但 exact data能力不足。
- rendercore现有 choreography executor仅自身测试使用且轮询 counter；Task 181明确未迁移它。
- 完整 Scene Layout runtime已有 main reel creation/placement/mode/spin/cascade/symbol/popup基础能力，但缺
  deferred initial、Nearwin/value creation input、custom plan、awaitable batch、replacement/transfer和 overlay API。
- game002当前以 `presentationOnly`取得 background/transition/popup，另建 reel并拼 world root；没有重复下载
  package，却保留两套 runtime ownership和重复 geometry/placement facade。
- crave当前 background/reel/popup order必须继续由 manifest驱动，不得硬编码现值。
- 规划会话未安装依赖、修改生产代码或运行构建/测试。

## 4. 需求解释与技术决策

### 需求解释

- game002只应显式拥有 WM、CM、CO、WL、AF/FreeGame的选择、公式、顺序和 animation/commit policy；严格
  validation、snapshot mutation和 transaction lifecycle必须保留，但不能在业务模块重复。
- “一次 gamelayout”指一个 package resource、一个 full package runtime、一个 main reel和一个 root；typed
  runtime resource仍可 lazy prepare，Nearwin1/2仍是唯一显式增量资源。
- 简化证据是旧双轨删除、同一事实只解释一次、boundary阻止回流且行为/rollback/视觉通过，不是文件变多。

### 关键决策

1. **唯一 `Game002RoundFacts`**
   - decoder从 `SlotOperationServerView` 和 game002 component-role catalog读取完整 round，返回 discriminated、
     deep-frozen facts并保留 source evidence。
   - BaseGame facts表达 landing/win/fall/WL/WM/CM/CO，FreeGame facts表达 trigger/transition/spin/AF/CO/win/
     popup/exit；跨 step WL在 immutable reducer中闭合，不暴露 mutable cache。
   - facts不保存 raw component/step或可二次选择的 scene；unknown/missing/duplicate立即失败。

2. **atomic operation是唯一 execution IR**
   - compiler按 app-owned顺序遍历 facts，用 logiccore neutral snapshot/change/finalizer直接生成 plan。
   - payload按 operation kind形成 strict union，只含该 op所需位置、数值、relocation和 evidence；input/output从
     operation本身读取。target不得按 stepIndex/flowKey回查或重建 aggregate。

3. **通用 awaitable presentation transaction runner**
   - program支持 awaitable symbol-state batch、value/text mutation、prepared replacement/transfer、progress和
     commit checkpoint；host完整 validate/prepare后才 start。
   - Promise由宿主 ticker推进；generation/AbortSignal隔离 late completion。已 checkpoint的 visual transaction
     写入 journal，后续失败逆序 rollback。
   - app只映射 exact payload到短 program；shared runner不认识业务 symbol/component/animation。旧 counter
     executor同步删除。

4. **完整 Scene Layout runtime拥有唯一 reel/root**
   - game002停止用 presentation surface；package runtime非 presentation-only创建 manifest-selected reel，
     公开中性 main-reel API而非 internal display tree。
   - instance options接收 generic effect resources/capacities、value resolver和 custom grid-cell plan能力，不进入
     versioned manifest/profile或第二份业务表。
   - deferred initial是显式状态；首次合法 `defaultScene`原子建立 occurrence/value/phase后才可业务操作。
   - cascade player通过 attach/dispose API加入 reel overlay；runtime root直接挂 stage并接受 art-space offset。

5. **game002 controller只保留业务 state/plan**
   - 保留 anticipation、Nearwin、selective refill、public-strip phase和业务 snapshot；通用 reel操作走 Scene
     Layout facade。替换 `game-demo.ts` 时必须删除 generic forwarding和 display container字段。
   - 迁移不设 old/new feature flag；tests跟随最终 contract，不为旧 doubles恢复 optional/deprecated API。

## 5. 职责与合同

- **logiccore**：通用 selection cardinality、matrix/position/snapshot validation、neutral mutation和 final closure。
- **game002 facts/compiler**：component role、业务公式、跨 step关联、operation顺序；不拥有 display lifecycle。
- **rendercore runner**：await/abort、prepare/checkpoint/journal、rollback/destroy和 exact-once completion。
- **Scene Layout runtime**：package catalog、唯一 reel/root、manifest placement/order、mode、popup/transition、overlay。
- **game002 mapper/controller**：atomic payload到 program及 anticipation/Nearwin policy，不复制通用状态机。
- facts、plan finalization、handler capability和 resource closure必须在首次 mutation前成功；失败后 visual
  snapshot回到当前 operation input或上一个 committed output。
- resource由 loading owner销毁；runtime拥有 catalog/reel/effects/popup/transition/overlay；cascade player由
  game002拥有，attach disposer只 detach，destroy不得重复释放。
- 禁止 raw reread、duplicate helper、aggregate/atomic双轨、counter polling、global registry、placeholder、
  fallback/alias、硬编码 order/placement、第二 reel/catalog和 app直接修改 children。

## 6. 文件范围

### 预计新增

```text
packages/logiccore/src/slot-operation/exact-data.ts
packages/logiccore/tests/slot-operation/exact-data.test.ts
packages/rendercore/src/slot-operation/presentation-transaction.ts
packages/rendercore/tests/slot-operation/presentation-transaction.test.ts
apps/game002/src/{game002-round-facts,game002-presentation-program,game002-reel-controller}.ts
tasks/183-game002-runtime-plan-consolidation-<utctime>.md
```

可按单一职责小幅合并，但不得为每个 component建立重复 decoder/runner。

### 预计修改

```text
packages/logiccore/src/{index,slot-operation/{index,server-view,operation-generators}}.ts
packages/logiccore/tests/slot-operation/{server-view,operation-generators}.test.ts
packages/logiccore/README.md
packages/rendercore/src/{index,slot-operation/index}.ts
packages/rendercore/src/{scene-layout/{types,package-runtime},reel/{types,render-grid-cell-reel-set}}.ts
packages/rendercore/tests/{scene-layout/{package-runtime,package-runtime-mode},reel/render-grid-cell-reel-set}.test.ts
packages/rendercore/README.md
packages/gameframeworks/src/index.ts
packages/gameframeworks/README.md
apps/game002/src/{game-adapter,game002-operation-compiler,package-config,game-layout}.ts
apps/game002/tests/{source-boundary,game-adapter,game002-round-transform,operation-plan-composition,
                    package-config,game-layout}.test.ts
apps/game002/README.md
docs/agent-rules/{game002,shared-game-runtime,scene-layout}.md
```

其它 game002 tests可作 import/fixture迁移，但不得降低断言。

### 预计删除或完整取代

```text
packages/rendercore/src/slot-operation/choreography-executor.ts
packages/rendercore/tests/slot-operation/choreography-executor.test.ts
apps/game002/src/{scene-layout-presentation,operation-data,wl-wm-multiplier-plan,
                  co-collection-plan,freegame-plan,freegame-operation-target,game-demo}.ts
```

旧文件若保留，报告必须说明不可替代职责；不得保留 deprecated/synthetic/raw duplicate/full reel forwarding。

### 原则上不应修改

```text
assets/**
apps/{game003,gameviewer,gameviewer2,gamelayouteditor,gamelayoutpkgcli,popupeditor,symbolseditor}/**
packages/{netcore,uiframeworks,vnicore,editorresource,browserartifactio}/**
apps/game002/config/**
pnpm-lock.yaml
package.json
AGENTS.md
```

如需改变 schema/resource、排除 consumer、root tooling或无法界定的 API，必须先停止说明。

## 7. 实施步骤

1. **固定基线与 characterization**
   - 复核 HEAD/status和 Tasks 178/181/182 后 API；用现有 fixtures固定 BaseGame、WL/WM、CM、CO、
     anticipation、FreeGame、rollback和 mode输出。
   - 先补 boundary断言，禁止 raw reread、synthetic session、counter choreography、worldLayer和第二 reel。

2. **补 logiccore exact data能力**
   - 增加 scene/otherScene/result cardinality、matrix shape、position set、safe value和 occurrence lookup；错误
     保留 step/component/index path。只提取至少两个旧模块重复使用且无业务名的能力并测试 strict failure。

3. **实现 single-pass facts decoder**
   - 集中解析 CN/fall/win/pending WL/WM/CM/CO relocation及 FreeGame AF/CO；证明 evidence全消费、scene/value
     continuity闭合和 deep freeze，删除旧 plan私有 raw/matrix helper。

4. **从 facts直接生成 atomic plan**
   - compiler不再接收 reel runtime；定义最小 payload union，保持 stable order、businessKey、source和 closure。
   - 删除 payload cache、`coReplacements`、flowKey反解、synthetic session和 aggregate API并更新 plan tests。

5. **实现 awaitable transaction runner**
   - 定义 program/host/journal lifecycle，覆盖完整 preflight、Promise顺序/并行、checkpoint、逆序 rollback、
     abort/late settlement/cleanup/destroy；使用 Task 181 API，不读取 counter。
   - 删除旧 executor/export/test并确认无 consumer。

6. **扩展 Scene Layout main-reel合同**
   - 增加 deferred state、effect/value/custom plan creation input、awaitable symbol、value/text、replacement/
     transfer/cascade/spin facade和 overlay attach。
   - 测试首次 scene commit、单 catalog/reel、manifest order、same-binding identity、prepare rollback、detach/
     destroy及现有 presentationOnly consumer不回归。

7. **接入精简 game002 controller/program**
   - controller只生成 initial/selective/cascade/anticipation plans；WM/CM/CO/WL/AF handler映射 atomic payload到
     runner program，保持 animation barrier与中间 commit。BaseGame/FreeGame复用同一 runner能力。

8. **收敛 mount与 ownership**
   - package config不再预建第二 registry；adapter创建 full runtime、controller、cascade和 coordinator，attach
     overlay后只挂 runtime root。art-space/viewport/ticker/popup/mode/destroy由同一 owner协调。
   - 删除 wrappers、worldLayer、重复 reel placement/layout no-op，保持 loading/frame/live不变。

9. **删除旧轨并收紧测试**
   - 删除旧模块/injection/types/import，source-boundary禁止 synthetic、deprecated payload、game002
     `presentationOnly/mainReelsLayer`、counter和 raw reread；一个 fact/op/mutation只允许一个 owner。

10. **文档、验收和报告**
    - 更新 README/规则，运行 L2与浏览器矩阵；失败先定位 facts/compiler/runner/runtime，不恢复旧轨。
    - 创建 UTC报告，记录模块删除/保留、API偏差、diffstat、命令、人工结果和风险。

## 8. 测试与验收

### 测试原则

- authoritative fixtures验证 facts和最终 plan，不只 snapshot中间对象；negative fixtures保持全部 strict gate。
- decoder测试证明 response只选择一次；compiler只接收 facts并验证 kind/source/input/output/mutation/final。
- runner用真实 Promise和 prepared transaction doubles覆盖 pre-mutation failure、checkpoint后失败、abort、
  rollback逆序、late completion、cleanup和 destroy。
- Scene Layout断言单 catalog/reel/root、deferred gate、manifest placement/order、mode identity和 ownership。
- game002 integration覆盖 spin、普通/anticipation cascade、WL/WM/CM/CN/CO、FreeGame、popup、cleanup和 fatal
  failure；每个 committed visual snapshot匹配 operation output。

### 验收级别

采用 `L2`：修改 logiccore、rendercore和 Scene Layout public contract及直接 consumer
gameframeworks/game002，并涉及异步 transaction和 reel ownership；直接链可限定为四个 workspace目标，
不修改根工具链、lockfile、schema、生成器或资源，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter game002 typecheck
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter game002 test
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter game002 build
pnpm --filter game002 release:check
git diff --check
```

`release:check`额外验证正式 static dist/resource boundary；不默认运行根级命令。

### 人工验收

1. 合法 live配置与真实 crave启动后确认一个 Scene Layout root/main reel，无第二 catalog/reel初始化；
   defaultScene前不闪 placeholder。
2. 覆盖普通 spin、普通 cascade、initial/unified-refill anticipation和 selective refill，核对公开轮带、
   Nearwin、dimming、landing和 value continuity。
3. 覆盖 WL increment、WM、CM、CO组合，核对 Start/Idle/End/Change、CN value、CO transfer和下一轮 cleanup。
4. 完整 BaseGame→FreeGame→BaseGame，核对 popup/transition、AF/CO/final win、same-binding reel identity和最终 scene。
5. 横竖屏/resize检查所有层级/位置无双 offset；注入 playback/prepare失败，确认回到上个 committed snapshot。

无合法 live round时必须标未完成并交接 fixture/query；visual fixture、单测和 build不能冒充真实通过。

### 独立验收建议

`必须`：本任务涉及跨包 API、完整 plan preflight、checkpoint/rollback和 reel ownership。最多复验：

```bash
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/gameframeworks --filter game002 test
git diff --check
```

人工抽查一次 WM→CM→CO失败恢复和 Base/Free前后 reel identity。

## 9. 环境与依赖

- 使用 Node 24与 pnpm；未加载 Node时执行 `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 缺依赖时使用 `CI=true pnpm install --frozen-lockfile`；仅下载失败后设置现有代理重试。
- 不新增依赖或修改 manifest/lockfile；现有 Promise/AbortSignal、Pixi和 core primitives足够。

## 10. 生成物、文档与规则

- 不修改 YAML、manifest、assets map、ZIP或生成物，不运行资源生成器。
- 更新四个 package/app README，说明 single-pass facts、atomic-only plan、awaitable transaction和 single
  Scene Layout runtime/reel ownership。
- 更新 `docs/agent-rules/game002.md`、`shared-game-runtime.md`、`scene-layout.md` 的稳定职责；不改根
  `AGENTS.md`，精确字段/命令/证据留在类型、测试和报告。

## 11. 执行报告

规划时不生成报告。完成后用 `date -u +%y%m%d-%H%M%S` 创建：

```text
tasks/183-game002-runtime-plan-consolidation-<utctime>.md
```

记录最终 contract、实际文件/删除项、偏差、production diffstat、五条命令、人工/独立验收和剩余风险；
不收集无关 coverage、完整历史、整仓统计或 profiler。

## 12. 风险、假设与待确认

### 风险

- Scene Layout generic spin不足以表达 anticipation/effect；extension过宽会泄漏 reel，过窄会迫使 app复制。
- WM/CM/CO有中间 commit；runner缺 journal checkpoint会改变时序或在失败时留下半提交。
- single-pass迁移可能漏 pending WL、optional otherScene、CO disjoint、FreeGame closure等分散校验。
- deferred reel与 mode prepare可能创建第二 reel或提前暴露 API；identity/rollback必须直接测试。
- 删除测试注入 surface会改大量 doubles，不得因此恢复 production optional/deprecated API。

### 假设

- game002 BaseGame/FreeGame使用兼容的同一 Symbols binding；shared runtime仍正确处理其它 binding变化。
- 当前 server component、manifest、timing、Nearwin资源和 authoritative fixtures是业务合同。
- counter choreography executor没有仓库外受支持 consumer；若基线出现 consumer，迁移它而非保留旧实现。
- 所需 reel行为可通过 typed rendercore capability公开，无需改资源/schema或直接操作 display tree。

### 待确认

无。若某动画只能靠未公开 display-tree mutation实现，必须停止说明缺失 capability，不能恢复 children/index
访问或静默删除行为。

## 13. 完成清单

- [ ] single-pass facts、atomic-only plan和 source/final closure成立。
- [ ] synthetic/deprecated/counter/activity旧轨删除，awaitable transaction合同通过。
- [ ] 一个 Scene Layout runtime/root/catalog/reel拥有 presentation lifecycle。
- [ ] game002行为、strict failure、资源边界、mode identity和 cleanup保持。
- [ ] assets/schema/生成物/排除 consumer/lockfile/root tooling无无关修改。
- [ ] L2、人工、独立验收和 UTC报告完成。

## 14. 执行会话交接

1. 读取根规则、本计划及 `game002/shared-game-runtime/loading-ui/scene-layout` 领域规则。
2. 核对 HEAD/status和 Tasks 178/181/182后续变化。
3. 按 characterization→exact data→facts→atomic compiler→runner→Scene Layout reel→game002→删旧轨实施。
4. 小幅适配写报告；重大 API/schema/resource/consumer扩张先停止说明。
5. 只跑规定 L2，完成浏览器/独立验收和 UTC报告；不以 fake替代人工。
6. 除非用户要求，不 commit、不 push、不创建 PR。
