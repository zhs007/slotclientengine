# 192 rendercore-trusted-operation-rendering 任务计划

## 1. 目标与完成定义

### 目标

系统审计 packages/rendercore 全包的 assert、validate、expected/continuity 比较和显式 throw，按职责判断每一项是否必要。
rendercore 直接信任 finalizer 产出的 operation plan 或 direct consumer 已决定的业务事实，只负责把命令转换为动画、
资源创建和 display tree mutation，不再复核 remove、dropdown、refill、selective spin、replacement、transfer 等流程的
scene、code、value、held、hole、occurrence 逻辑连续性。

不能按函数名机械删除全部 assert：资源/schema 消费边界、精确动画能力、display slot、异步 transaction、
prepare/cleanup/destroy 等 renderer 自身才能证明的条件必须保留。请求的动画或 asset 不存在时原位显式失败，不增加
normal、首项、placeholder 或其它视觉降级。

### 完成定义

- [x] packages/rendercore/src 下所有 assert*/validate*、expected/continuity equality 和相关显式 throw 均完成逐文件审计，
      执行报告记录分类标准、移除项和保留项摘要，不遗漏非 assert 命名的同类检查。
- [x] assertSelectiveTargetContinuity() 及 standard/grid-cell cascade 的 source/target matrix、code/value continuity
      断言从 renderer 执行路径删除；selective spin 只渲染 plan 选中的格。
- [x] remove、dropdown/refill、replacement、transfer 不再接收 renderer 用来复核业务前态的 predicate、
      expectedCode、expectedSourceCode、expectedTargetCode 或 shadow snapshot。
- [x] dropdown/refill occurrence 配对、fixed/held、hole closure、carried value 和目标 scene 合法性只在 logiccore
      operation/fact 编译或 direct consumer 调用前完成；rendercore 只消费 render-ready movement/value commits。
- [x] terminal remove 消费上游已决定的 remove positions；rendercore 不按当前 code 二次决定 retained/removed，也不在
      动画完成后比较业务 code/value identity。
- [x] 缺失 exact symbol state/animation、output symbol asset、可渲染坐标或 runtime ownership 时仍显式失败；
      dropdown 不再静默回退 normal。
- [x] standard/grid-cell reel、Scene Layout facade、operation coordinator 的异步失败继续 fail-stop，pending playback、
      detached occurrence、mask、transfer lease 与 destroy cleanup 不泄漏。
- [x] logiccore、rendercore、gameframeworks、game002/game002v2 及直接 public consumer 的 L2 定向验收通过，并生成 UTC
      中文执行报告。

## 2. 范围

### 包含

- packages/rendercore/src 全量 assertion inventory 与职责审计，包括 assert/validate helper、内联 throw、matrix/code/value
  equality、capability fallback、phase/ownership/resource checks。
- rendercore operation/profile handlers、Scene Layout main-reel API、standard/grid-cell reel 的 selective spin、remove、
  cascade、replacement、transfer trusted execution contract。
- logiccore 中通用 remove/dropdown/refill/held/hole/occurrence relation 的单一 strict 编译边界，以及 gameframeworks
  必需的 public re-export。
- game002 operation compiler/payload/handler 对 render-ready movement facts 的接入；game002v2 无 operation 流程在调用
  rendercore 前自行决定 WL/CN held、remove/refill 业务 positions。
- 直接相关 tests、README、领域规则和最终 assert 审计证据。

### 不包含

- 不删除或放宽 manifest/project/package parser、resource closure、Spine/VNI/image decode、animation binding、typed union、
  numeric geometry/timing 等 rendercore 自己拥有的输入与资源边界校验。
- 不删除 destroyed/active phase、AbortSignal、坐标对应 display slot、重复/冲突 transaction target、prepare/rollback/
  cleanup/destroy 等避免半提交、泄漏或 display tree 损坏的安全检查。
- 不放宽 logiccore server parser、operation generator、V2 finalizer、source binding、snapshot shape、plan closure 或
  symbol catalog 校验，也不把这些校验复制到 app/rendercore。
- 不让 malformed raw server data 直接进入 rendercore；正式 operation consumer 仍先 finalize immutable
  SlotOperationPlanV2。game002v2 继续在 app 边界解析业务。
- 不改变 cascade/selective/remove/transfer 的动画时序、运动曲线、mask、renderPriority、Nearwin 或 anticipation 顺序。
- 不保留旧 expected-code/full-matrix API overload、compatibility alias 或静默 fallback；direct consumers 同任务切换。
- 不修改 server 协议、assets/manifest/YAML、生成物、根工具链、lockfile 或引入新依赖。

## 3. 制定计划时的基线

    UTC: 2026-08-11T03:44:13Z
    HEAD: c401d4656e145f257955839a5c847aeb2a14181f
    branch: (detached HEAD)
    git status --short --untracked-files=all: clean

实际读取：

    AGENTS.md
    tasks/templates/task-plan.md
    docs/agent-rules/{shared-game-runtime,scene-layout,game002,game003}.md
    docs/slot-operation-effect-composition-refactor.md
    tasks/{173-slot-operation-plan-refactor,178-slot-operation-effect-composition-refactor,
      191-popupeditor-centered-adaptation-font-text-editing}.md
    packages/{logiccore,rendercore}/README.md
    packages/{logiccore,rendercore,gameframeworks}/package.json
    apps/{game002,game002v2,game003v2}/package.json

目标目录没有补充 AGENTS.md。当前结论：

- 初步静态 inventory 显示 assertion/validation/explicit throw 广泛分布于 rendercore；高密度文件包括
  scene-layout/package-runtime.ts、reel/render-grid-cell-reel-set.ts、symbol/manifest.ts、
  symbol-cascade/create-symbol-cascade-player.ts、reel/manifest.ts、reel/render-reel-set.ts 等。名称搜索只是入口，
  不能替代逐项职责判定。
- packages/logiccore/src/slot-operation/operation-generators.ts 的 genRemoveOperation、genDropdownOperation、
  genRefillOperation 已严格验证 retained cell、held/顺序/下落方向、hole/known code/carried cell；
  v2-finalizer.ts 再证明 operation 顺序与 snapshot closure。
- packages/rendercore/src/scene-layout/package-runtime.ts::assertSelectiveTargetContinuity() 又读取 runtime current
  scene/value，拒绝 selective plan 未选择格与完整 target 不一致；这是用户明确要求删除的 renderer 逻辑复核。
- packages/rendercore/src/reel/grid-cell-cascade-plan.ts::createGridCellCascadeDropPlan() 同时解析四份 matrix、匹配
  occurrence、验证 fixed/refill closure，并由 deriveGridCellCascadeSettledValues() 推导业务 value；职责与 plan 编译重叠。
- RenderGridCellReelSet.startCascadeDrop() 和 RenderReelSet.startCascadeDrop() 在开始/完成边界比较 source/target
  scene/value 与 movement code/value；grid-cell terminal remove 又执行 canRemoveOccurrence 并在 once 完成后比较
  code/value identity。
- standard/grid-cell prepareVisibleOccurrenceReplacement() 通过 expectedCode 做前态复核；grid-cell transfer 通过
  expectedSourceCode/expectedTargetCode 复核。game002 handler 从 context.input 填这些字段，同一事实被 plan 与 renderer
  验证两次。
- 两种 reel 的 dropdown 在缺 dropdown state capability 时静默请求 normal；这与“动画不存在即报错”和 unknown
  animation 不降级规则冲突。
- game002 operation-data.ts 在 compiler 阶段反向调用 rendercore derive helper；game-adapter.ts 随后又在 handler start
  构建/校验 cascade plan。game002v2 没有 operation plan，当前把 WL retained predicate 传入 rendercore remove，并依赖
  返回结果复核 remove scene。
- 合同可由当前代码、测试和领域规则确认，不需要完整 Git 历史审计。

## 4. 需求解释与技术决策

### 需求解释

- “所有 assert 都检查一遍”指覆盖 rendercore 全包所有显式 guard 语义，而不只搜索 assert 前缀；每项按 owner、
  输入边界、失败后果与上游是否已证明来判断。
- “不必要”包括：上游 plan/schema 已证明的重复校验、renderer 对业务状态连续性的复算、用当前显示状态反向推断
  operation 是否合理，以及以严格校验为名的动画 fallback。
- “必要”包括：rendercore 是首个解析 raw manifest/package/resource 的 owner，或只有 runtime 才知道 animation/asset、
  display occurrence、active transaction、prepared identity、abort/destroy 状态。此类检查不能移到 plan 假装已验证。
- direct consumer 没有 operation plan 时也不改变 rendercore 信任边界。确属游戏合同的 WL/CN held/remove positions
  由 game002v2 在调用前决定；rendercore 不因 producer 类型不同恢复业务 validator。

### 关键决策

1. **用 assertion ledger 做全包审计**
   - inventory 至少分为：raw schema/parser、resource/asset closure、animation capability、geometry/timing、runtime phase/
     ownership、transaction lifecycle、logical plan continuity、重复 defensive check、fallback/alias。
   - 每个命中记录 keep/remove/move-to-producer 及理由；相同 helper 可按调用边界分别判断，不能因名称相同整函数删除。
   - 报告给出按目录和类别的摘要、所有 remove/move 项的精确 symbol；必要 keep 项给代表性理由，不全文复制数百条。

2. **建立 trusted render command**
   - cascade public plan 只保留动画所需的 explicit existing/refill movement、target value commit、timing 与尺寸；删除
     source/settled/target scene/value、refill hole closure 和 canDropOccurrence。
   - existing movement 从坐标取得当前 render occurrence；refill movement用 output code/value 创建 occurrence。renderer
     不比较 current code/value；完成边界只执行显式 target value commit。

3. **通用 occurrence relation 只在 logiccore 编译一次**
   - 从 atomic generators 抽取/复用 neutral cascade fact compiler，产出 source-to-target relation、refill insertion 与
     value commits；不包含 Pixi object、animation name、timing 或 renderer identity。
   - genDropdownOperation/genRefillOperation、game002 compiler 消费同一结果；configured trace 已有 movement facts 时直接
     适配，不重新扫描 matrix。

4. **selective spin 只执行选择**
   - 删除 assertSelectiveTargetContinuity() 及两处调用；spinSelective/settleContinuous 只提交 plan.cells 的 landing。
   - game002v2 FreeGame WL/CN 原位一致要求保留在 app plan-input tests；其它 consumer 不自动获得该游戏规则。

5. **remove/mutation API 删除 renderer-side expected input**
   - terminal remove 改为 explicit positions + exact state/playback，移除 canRemoveOccurrence 和 retained/removed 业务结果；
     game002v2 从 remove scene/业务 symbol 先算最终 remove positions。
   - replacement 删除 expectedCode/inputCode；transfer 删除 expected source/target code。renderer 仍要求坐标存在可租用
     occurrence、output asset 可创建、transaction 无冲突，并保持 prepare/start/commit/rollback/destroy。

6. **资源/动画完整预检后才 mutation**
   - standard/grid-cell cascade 与 remove 在 detach/release 前对全部目标做 renderer preflight；refill/replacement output
     occurrence 先完整创建，任一失败释放已 prepare 项且不半提交。
   - existing dropdown 请求 exact dropdown state；无 capability/resource 立即失败，不再 normal fallback。动画正常结束后
     回 normal 是既有 lifecycle，不是缺 dropdown 的 fallback。

7. **operation handler 使用类型收窄，不写第二套 validator**
   - profile handlers 按 exact kind 的 typed operation/payload 读取 step/output；移除 finalizer/producer 已证明的 effect、
     payload shape 等重复分支。
   - coordinator 保留 missing handler、frame/delay、abort、fail-stop 和 current output 传递；不新增 full-plan preflight
     或 snapshot assertion。

## 5. 职责与合同

- logiccore/producer：拥有 raw server 解析、remove/dropdown/refill/held/hole/value relation、snapshot output、operation
  source/order/closure 和 immutable finalization；neutral fact 不含 renderer callback 或 visual timing。
- rendercore parser/resource owner：继续严格解析自身 manifest/package/resource，验证 exact closure、decoder/runtime
  compatibility、animation binding 与资产可创建性。
- rendercore runtime：拥有 timing、display occurrence lease、运动、mask、atomic commit、abort/cleanup/destroy；不解释
  scene 变化是否符合游戏规则。
- game app：拥有 business symbol predicate、component role 和 operation order。无 plan 的 direct flow 必须把 predicate
  解析成 explicit positions/facts，不能交给 renderer callback。
- 数据/API：render command 是 immutable plain data；坐标/output code/value 是要执行的命令，不是与 shadow snapshot
  比对的 evidence。presentation timing 仍来自 manifest/config。
- 失败策略：missing handler、destroyed/active conflict、不可渲染坐标、缺 output asset、缺 exact animation/state、
  resource/player failure 显式 fail-stop；logical mismatch 只能由 producer/plan 边界报告。
- 禁止行为：renderer scene/code/value continuity、business predicate callback、normal/首项 fallback、full matrix shadow
  plan、compatibility overload、placeholder、跨包 renderer object 或静默 effect 降级。

## 6. 文件范围

### 预计新增

    packages/logiccore/src/slot-operation/cascade-facts.ts
    packages/logiccore/tests/slot-operation/cascade-facts.test.ts
    tasks/192-rendercore-trusted-operation-rendering-<utctime>.md

若在 operation-generators.ts 内抽取后仍清晰，可不新增 cascade-facts.ts，但 strict relation 只能有一个实现。assert ledger
进入最终执行报告，不新增 runtime contract 文件。

### 预计修改

    packages/logiccore/{README.md,src/index.ts,src/slot-operation/{index,operation-generators}.ts,
      tests/slot-operation/operation-generators.test.ts}
    packages/gameframeworks/src/index.ts
    packages/rendercore/{README.md,src/reel/{types,index,grid-cell-cascade-plan,render-reel-set,
      render-grid-cell-reel-set}.ts}
    packages/rendercore/src/scene-layout/{types,package-runtime,configured-round-adapter}.ts
    packages/rendercore/src/slot-operation/profile-round-handlers.ts
    packages/rendercore/tests/reel/{grid-cell-cascade-plan,render-reel-set,render-grid-cell-reel-set}.test.ts
    packages/rendercore/tests/scene-layout/{package-runtime,configured-round-adapter}.test.ts
    packages/rendercore/tests/slot-operation/profile-round-handlers.test.ts

    apps/game002/src/{operation-data,game002-operation-compiler,game-adapter,game002-reel-controller,
      freegame-operation-target}.ts
    apps/game002/tests/{game002-operation-compiler,game-adapter,game002-round-transform,
      freegame-operation-target}.test.ts
    apps/game002v2/src/{round-adapter,spin-presentation}.ts
    apps/game002v2/tests/{round-adapter,spin-presentation}.test.ts

    docs/agent-rules/{shared-game-runtime,scene-layout,game002}.md

全量审计可能在 packages/rendercore/src 其它文件发现同类重复 logical/defensive assertion；只有 ledger 能明确证明
remove/move-to-producer 的文件才允许追加修改，并在报告逐项说明。不能借审计顺手重构必要 parser/resource validators。

### 原则上不应修改

    apps/{game003,game003v2,gameviewer,gameviewer2,gamelayouteditor}/**
    packages/{netcore,uiframeworks,vnicore,slotoperationauthoring}/**
    assets/**
    pnpm-lock.yaml
    AGENTS.md
    docs/agent-rules/{game003,loading-ui}.md

若 game003v2 因 public type 收口必须小幅编译适配，可以加入 direct consumer 修改并在报告说明；不得扩大其业务流程、资源
或美术。需要改变 server schema、SlotOperationPlanV2 version 或 production asset 时属于重大范围扩张，必须先停止说明。

## 7. 实施步骤

1. **确认基线并完成全包 assertion inventory**
   - 重新核对 HEAD/status、public exports/direct imports；用 rg 搜索 assert、validate、throw、expected、continuity、
     equals/matches、fallback/capability 分支，再人工逐文件去重。
   - 建 ledger，标注 owner、输入来源、上游 proof、失败后果、keep/remove/move-to-producer；先完成审计再开始批量删除。

2. **冻结必要 runtime 行为**
   - 用现有 tests 固定 timing、mask、renderPriority、selective landing order、remove playback、transfer rollback、
     resource parse 与 cleanup/destroy。
   - 旧“renderer 应拒绝 logical mismatch”tests 只作为迁移定位；parser/resource/ownership failure tests 必须继续通过。

3. **在 logiccore 建唯一 cascade facts 编译**
   - 合并 dropdown/refill source-target matching、held/fixed、hole/refill、value carry/override 校验，返回 immutable neutral
     movements/value commits。
   - atomic generator 与 game002 compiler 复用同一结果；覆盖 malformed input、held、upward move、duplicate refill、
     carried value、known code。

4. **收窄 rendercore cascade contract**
   - 重写 GridCellCascadeDropPlan/Movement 和 timing builder，只接受 finalized movements/value commits；删除 full matrices、
     canDropOccurrence、deriveGridCellCascadeSettledValues() 与 renderer closure validation。
   - configured adapter 直接转 SlotRound movement facts；game002/game002v2 使用 producer facts，不在 handler start 分析 scene。

5. **删除 selective/cascade runtime continuity assertions**
   - 删除 assertSelectiveTargetContinuity、source/target matrix equality、movement/current code/value equality、完成后 target
     equality；standard/grid-cell 两种 reel 同步处理。
   - 保留 runtime phase、coordinate/display slot、target occupancy/transaction collision 与 exact output occurrence prepare；
     trust tests 证明可渲染但 logical mismatch 的 command 不再被 renderer 拒绝。

6. **收口 remove/replacement/transfer**
   - terminal remove 改为 producer 已选 positions，批量 preflight exact playback；删除 business predicate、retained result
     和 completion code/value identity check。
   - standard/grid-cell replacement 与 grid-cell transfer 删除 expected input code；修改 Scene Layout facade、game002
     transform/FreeGame targets 和 tests，保留 transaction ownership、rollback/destroy。

7. **移除 fallback 并验证 renderer-only failures**
   - cascade occurrence 一律请求 exact dropdown state；refill/replacement output 一律创建 exact symbol asset。
   - 覆盖第二项 prepare failure、abort、destroy、occupied target、missing state/asset，证明 mutation 前失败且 cleanup 完整。

8. **迁移 direct consumers**
   - game002 payload 保存 compiler 已产出的 movements/value commits；handler 只提供 motion timing 并调用 runtime。
   - game002v2 在 app 内从 remove scene/WL predicate得到最终 remove positions，并在 selective FreeGame request 前保护
     WL/CN held contract；rendercore result 不再作为 business validation evidence。

9. **收窄 operation handlers 并执行第二轮全包审计**
   - exact typed handler 直接读取 finalized operation；删除 effect/payload 重复 validator，保留 handler/animation/resource
     缺失与 coordinator fail-stop。
   - 重跑 inventory，与 ledger 逐项核对新增/残留 guard；任何 keep 项必须有 rendercore-owned 理由，任何 removed helper
     必须同步删除 dead tests/exports。

10. **文档、验收与报告**
    - 更新 README/领域规则，运行 L2 与浏览器人工验收。
    - 生成 UTC 中文报告，附 assertion audit 摘要、所有 remove/move symbols、代表性 keep 分类、计划偏差与剩余风险。

## 8. 测试与验收

### 测试原则

- logiccore tests 证明 logical mismatch 仍在 producer/finalizer 失败；rendercore tests 刻意传入与 current/full target 不一致
  但可渲染的 trusted command，证明 renderer 不补验 business logic。
- parser/resource tests 保持 unknown key、bad manifest、missing exact resource/animation、decoder/version mismatch strict failure。
- runtime tests 保持 phase、coordinate/display slot、transaction collision、partial prepare、abort、cleanup/destroy failure。
- standard/grid-cell 都覆盖 selective、existing/refill movement、value commit、remove、replacement；grid-cell 额外覆盖 transfer。
- consumer tests 只在 producer 边界保护 game002/game002v2 business contract，不得通过 mock renderer 重建被删 validator。

### 验收级别

L2。任务审计 rendercore 全包，但行为修改限于 trusted operation/rendering contract 及明确 direct consumers；跨包 public
types 需要 logiccore/rendercore/gameframeworks 和 game002/game002v2 直接依赖链验证。若 ledger 实际要求修改多个无关
rendercore 子域或无法界定 direct consumers，应在实施前升级为 L3 并说明新增命令，不能以“全量审计”自动运行整仓。

### 执行会话必须运行

    pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore test
    pnpm --filter game002 --filter game002v2 test
    pnpm --filter @slotclientengine/rendercore lint
    pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter game002 --filter game002v2 --filter game003v2 typecheck
    pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks build
    git diff --check

失败先缩小到对应 package/case，不运行根级全量 test/build/format。lint 用于捕获 assertion 删除后的 dead helper/import；
assertion ledger 由两轮 inventory 人工核对，不能用“assert 数量越少”作为验收。

### 人工验收

- game002：initial、win/remove、unified dropdown+refill、anticipation dropdown-only+sweep+selective refill、WL retained、
  multiplier/CO/FreeGame transfer；确认顺序/时序不变，缺 exact animation 时 fail-stop。
- game002v2：BaseGame initial、FreeGame WL/CN selective landing、remove retained WL、普通/anticipation refill；确认 app
  已决定 positions，rendercore 不再对完整 target 做第二次 business check。
- 用真实 Symbols package 注入缺 dropdown state 或 output symbol asset，确认 mutation 前失败并清理 temporary occurrence/
  mask；fake runtime/compile 不能替代。

### 独立验收建议

必须。任务涉及跨包 public contract、operation trust boundary、resource preflight、async playback、temporary occurrence
ownership、rollback/cleanup/destroy。独立复验重点是“删除 logical validator 但保留 execution safety”和 ledger 无漏项：

    pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore test
    pnpm --filter game002 --filter game002v2 test
    pnpm --filter @slotclientengine/rendercore lint

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm。shell 缺 Node 时：

      source /Users/zerro/.nvm/nvm.sh
      nvm use 24

- 依赖缺失时使用 CI=true pnpm install --frozen-lockfile；只有真实下载失败后才设置仓库约定代理重试。
- 预计不新增依赖、不修改 lockfile。

## 10. 生成物、文档与规则

- 本任务没有 YAML、manifest、production assets 或生成 TypeScript；不得手改生成物。
- 更新 logiccore README：记录 neutral cascade facts/atomic generator 的 strict producer ownership。
- 更新 rendercore README：删除 renderer 验证 fixed/hole/code identity/target closure 的说明，记录 trusted command、
  exact animation/resource preflight、transaction cleanup 与 assertion 分类标准。
- 更新 shared-game-runtime：删除 render handler 的 input/output continuity 责任，明确 finalized operation 即使上游漏检
  也不由 rendercore 补验；保留 fail-stop 与 exact resource failure。
- 更新 scene-layout：selective main-reel runtime 只执行 explicit positions，不验证 held business target。
- 更新 game002：operation flow 删除 render continuity；game002v2 direct flow 明确 app 先决定 held/remove positions。
- 具体 assertion 名、审计数量、test fixture 和执行证据只进 task report，不写根 AGENTS.md。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

    tasks/192-rendercore-trusted-operation-rendering-<utctime>.md

UTC 使用 date -u +%y%m%d-%H%M%S。报告简要记录 final public contract、actual files、assertion ledger summary、所有
remove/move symbols、代表性 keep categories、commands/results、browser verification、deviation 和 remaining risks。

## 12. 风险、假设与待确认

### 风险

- cascade plan 同时承载 logical relation 与 presentation timing；若只删 throw 但保留 full matrices，renderer 仍隐式
  推导/覆盖逻辑。必须先改 render-ready command。
- exact dropdown state 替换 normal fallback 可能暴露真实 package 缺能力；这是目标 strict failure，不能加 alias。
- expected-code 删除后 transaction safety 必须由 runtime exclusive ownership、prepared object identity、phase/resource
  lease 保证，不能误解为“所有状态检查都删除”。
- 全包 audit 命中大量必要 manifest/resource validators；机械删减会破坏 exact resource contract。ledger 必须先判 owner。
- game002v2 无 finalizer；business predicate 必须在 render request 前形成 explicit facts，不能只把动画后比较搬到 app。

### 假设

- “动画或 assets 不存在，报错即可”不要求删除 runtime phase、display slot、transaction collision、abort/destroy 等
  execution-safety checks。
- selective plan 未选格是 renderer no-op；完整 target 对 held 格的一致性不属于 rendercore。

### 待确认

无阻塞项。若执行时要求连 raw manifest/resource parser 或 runtime ownership checks 也删除，将违反仓库 strict resource
和 lifecycle invariants，属于不同范围，必须先停止说明。

## 13. 完成清单

- [ ] 全包 assertion ledger 已完成且二次 inventory 无漏项。
- [ ] 目标和非目标满足，actual changes 未超范围或 deviation 已报告。
- [ ] rendercore 不复核 logical scene/code/value/held/hole/occurrence continuity。
- [ ] logiccore/direct producer 保留必要 business validation 且没有第二份 relation。
- [ ] exact animation/asset、transaction ownership、cleanup/destroy checks 已覆盖。
- [ ] public API consumers、tests、README、rules 已同步。
- [ ] 自动化验收通过，browser verification 与自动化明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

1. 读取根 AGENTS.md、本计划列出的领域规则和本计划，核对 Git baseline/worktree 并保留无关修改。
2. 先完成 assertion inventory/ledger 和 producer facts，再收窄 render API；不能先批量删检查。
3. 小幅适配记录在报告；重大范围扩张或 L3 trigger 先停止说明。
4. 只运行本计划规定验收，失败先最小化复现；完成后生成 UTC 中文报告。
5. 除非用户明确要求，不 commit、不 push、不创建 PR。
