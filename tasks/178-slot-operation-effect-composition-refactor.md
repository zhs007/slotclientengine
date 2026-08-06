# 178 slot-operation-effect-composition-refactor 任务计划

## 1. 目标与完成定义

### 目标

落实 `docs/slot-operation-effect-composition-refactor.md`：把 V1 固定 profile compiler 同时承担的
server 解析与 operation 排列拆开，建立按 `scene-landing | presentation | state-mutation` 分类的
`SlotOperationPlanV2`。`logiccore` 提供 strict selector、无状态 generator、mutation reducer 和
finalizer；game002 显式拥有最终 operation 顺序；rendercore 只按 frozen plan 顺序执行 effect-aware
handler lifecycle；Game Viewer 2 以显式 effect authoring 生成同一 V2 IR。

本任务允许实施过程中短暂并存 V1/V2 以完成 direct consumer 迁移，但最终交付不得保留固定 profile
compiler、V1 runtime adapter、kind alias 或长期双轨执行路径。

### 完成定义

- [ ] `SlotOperationPlanV2` 使用 effect discriminated union；公共 envelope 不再强制 `input/output`，Spin landing 只有 `output`，Win/Completion presentation 不含伪造 snapshot，mutation 才含 `input/output/mutations`。
- [ ] logiccore finalizer 按游戏给定顺序生成稳定 id/index、聚合 capability、验证 effect-definition、source evidence、scene establishment、mutation closure、final snapshot、plain data 和 deep freeze，不补项、不重排。
- [ ] strict server view 明确区分 absent 与 present-invalid；`requireExactlyOne/firstPresent/lastPresent/allPresent` 保留原 step/component/index/result/scene/otherScene/position evidence，present-invalid 不得回退。
- [ ] built-in Spin/Win/dropdown/refill generator 是无状态纯函数，接受 typed selection；optional absent 只返回 `null`，`compactOperations()` 只移除 `null`，不吞解析错误。
- [ ] game002 compiler 中可直接阅读 BaseGame、cascade transform、Win、FreeGame 的最终顺序；删除 `slot:settled-transform` 后置 `flatMap`、手工 operationIndex/capability/freeze 和 append 第二阶段 plan。
- [ ] game002 WL/WM/CM/CN/CO 每次可观察 scene/value/identity commit 对应 typed mutation，纯动画/金额只作为 presentation；现有业务顺序、动画 timing、anticipation、summary、FreeGame 与下一轮 cleanup 行为保持。
- [ ] rendercore coordinator 继续逐项执行 `preflight → prepare → start/update → commit → destroy`；只在 landing/mutation commit 后断言 snapshot，presentation 不提交不存在的 output，失败 rollback/cleanup 无半提交或泄漏。
- [ ] configured scene-layout consumer、gameframeworks facade、slotoperationauthoring 和 Game Viewer 2 全部迁移到 V2；authoring V1/旧 viewer 项目只允许显式升级到 `review: required`，不自动推断 effect。
- [ ] 删除 V1 public/runtime 残留，更新 README、正式合同与领域规则；自动化 L3 和两项浏览器人工验收完成，未完成项在报告中如实记录。

## 2. 范围

### 包含

- `packages/logiccore`：V2 effect/mutation/source/definition/draft/plan 类型，typed server/step/component view、strict selectors、无状态 built-in generators、mutation reducer/closure 和 finalizer。
- `packages/rendercore`：V2 typed registry/handler/coordinator、effect preflight、landing/mutation snapshot assertion、configured round adapter 与本地 scene flow consumer 迁移。
- `packages/gameframeworks`：转出正式游戏所需的 V2 production API/type，移除 V1 facade。
- `apps/game002`：显式 round compiler、专属 generator/payload/handler、BaseGame + FreeGame 单 plan 迁移及旧二次 expansion 删除。
- `packages/slotoperationauthoring`：显式 effect authoring schema、V2 parser/finalizer、V1 显式升级与 review gate。
- `apps/gameviewer2`：外层项目升版、effect 编辑/校验、V2 launch/runtime/replay 和旧项目显式升级。
- 相关 public exports、package README、方案状态、领域规则、测试与任务执行报告。

### 不包含

- 不修改服务器协议、GMI 原始结构、credential/live URL、本地公开轮带或服务器 scene 数据边界。
- 不把 game002 component/symbol/金额/动画名放入 logiccore/rendercore，不让 shared package 反向依赖游戏 app。
- 不新增 renderer callback、Pixi object、player 或 mutable runtime object 到 operation payload/source。
- 不从 snapshot diff 猜 Win、amount、result group、presentation target 或业务原因；无法证明的 authoring 内容保持 unresolved 并要求人工 review。
- 不增加 placeholder、首项默认、unknown kind fallback、静默 alias、effect 降级或 V1→V2 runtime adapter。
- 不修改 game003、其它 editor、production assets/YAML/生成资源、根工具版本或引入第三方依赖。
- 不顺手重写 reel、symbol、popup、scene-layout 或 FreeGame 动画状态机；只调整其 operation 接入边界。

## 3. 制定计划时的基线

```text
UTC: 2026-08-06T09:04:34Z
HEAD: b63fac40ea05b8cfb241c8976106712bd26bef84
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与输入：

```text
AGENTS.md; tasks/templates/task-plan.md
docs/{slot-operation-effect-composition-refactor,slot-operation-plan}.md
docs/agent-rules/{shared-game-runtime,game002,gameviewer2-local-flow,scene-layout}.md
tasks/173-slot-operation-plan-refactor{,-260805-154804}.md
```

当前实现结论：

- `packages/logiccore/src/slot-operation/types.ts` 的 `SlotOperationBase` 强制每项包含 `input/output`；`SlotOperationPlanV1` 保存 `initial/final`，未表达 effect。
- `profile-compiler.ts::compileSlotRoundOperationPlan()` 先由固定 profile trace 决定 Spin → Win/remove → dropdown → refill → settled-transform → completion；Spin/Completion 使用相等 snapshot，Win 仍被绑定到 state chain。
- `source-selectors.ts::selectComponent()` 只有单 component + cardinality API，optional absent 由空 selection 表示；尚无 presence union、candidate first/last/all policy 或自带 strict accessor 的 step view。
- `compiler.ts` 让 definition 从隐藏的 `current` 编译 output；`validation.ts::validateSlotOperationPlan()` 假定所有 operation 都推进同一 input/output chain。
- `rendercore/slot-operation/coordinator.ts` 已有实例级 registry 和事务 lifecycle，但 `update()` 在每项 commit 后无条件读取 `operation.output`；handler/plan 类型仅接受 V1。
- `apps/game002/src/game-adapter.ts` 先调用 fixed compiler，再由
  `attachGame002TransformOperationPayloads()` 展开 `slot:settled-transform`，最后由
  `appendGame002FreeGameOperation()` 重建 index/capability/frozen plan，正是本任务要删除的二次编排。
- `packages/rendercore/src/scene-layout/configured-round-adapter.ts`、`local-scene-flow.ts`、`packages/gameframeworks/src/index.ts` 是 V1 direct consumers；仓内搜索未发现 game003 direct consumer。
- `slotoperationauthoring` 当前为 project V1；Game Viewer 2 外层为 v3。snapshot 无变化时 `operation-project.ts` 会生成 `slot:collect` placeholder，且旧 schema 没有显式 effect。
- 现有 V1 compiler/coordinator、game002 transform/FreeGame、configured adapter、authoring/viewer tests 可用作迁移前
  characterization；方案和当前合同足以制定计划，无需审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- `docs/slot-operation-effect-composition-refactor.md` 是本任务需求合同；示例 component 名和伪代码只说明职责，
  game002 精确角色仍来自现有 versioned profile/config 和当前业务 parser。
- “游戏拥有最终顺序”表示 logiccore 不再暴露会暗中固定完整 round 排列的高级 compiler；selector/generator 可以
  提供一行式调用，但不得自行扫描未声明 component 或读隐藏 current。
- “无状态 generator”不等于让 app 手写 envelope。generator 产 draft/segment，finalizer 承担 source binding、
  id/index、definition 默认、capability 聚合、closure 与 freeze。
- 最终 V2 plan 不保存伪造的逻辑 `initial`。finalizer 从 `current = null` 开始；首个 landing 建立可信 snapshot，
  允许 definition 声明不依赖 scene 的 pre-spin presentation；`plan.final` 来自最后一次 landing/mutation。
- 实施分五个可验证阶段，但一次任务交付必须完成 consumer cutover 和 V1 删除，不能把临时兼容层留作完成状态。

### 关键决策

1. **V2 使用 effect-specific operation 与 definition registry**
   - public 类型固定为 `SlotOperationPlanV2`、`SlotSceneLandingOperation`、
     `SlotPresentationOperation`、`SlotStateMutationOperation`；plan version 为 `2`，不提供 V1 alias。
   - definition 精确绑定 `kind@version + effect`，声明默认 capability、presentation 是否要求已建立 scene，以及
     mutation reducer/validator；unknown 或 effect mismatch 在 finalization/preflight 失败。

2. **source selection 与 operation generation 分层**
   - `createSlotOperationServerView()` 只绑定 `GameLogic`、dimensions/catalog/context，提供 ordered `steps` 和 typed
     step view；selector 明确返回 `presence: present | absent`。
   - `lastPresent` 仅跳过 absent；候选一旦 present 就完整解析，非法 scene/result/otherScene/pos 立即失败，绝不退回
     更早候选。generator 接受 selection，不接受 component 名后自行搜索。

3. **finalizer 不拥有业务排列，只拥有可信化**
   - game/app 传入 ordered drafts；finalizer 顺序保持不变，只补稳定 id/index/default capability、验证 source
     consumption、plain data、effect chain、mutation closure 和 final，再统一 deep-freeze。
   - 一个 component 合法产生多个原子 operation 时由 generator 返回具名 segment/共享 consumption key；finalizer
     将其视为显式一次消费，禁止调用点通过复制 source evidence 绕过重复消费校验。

4. **mutation union 必须足以精确重算 output**
   - 保留提案的 `remove/relocate/replace/value-update`；补充 strict `insert`，因为 refill 从 hole 创建 occurrence，
     不能用 unexplained output 或伪 replacement 表达。
   - dropdown/refill 使用共享 reducer；Game002 CO 等需要 source replacement/overwritten target 的复合 mutation 使用
     typed game-specific mutation + 注册 reducer，继续保存 occurrence identity 和中间/最终 value evidence。
   - reducer 从 immutable input 计算 output；重复位置、非法 overlap、错误 input id/value、未知 mutation 或声明 output
     不闭合全部失败。

5. **Game002 compiler 直接产最终 V2 drafts**
   - 新 compiler 显式遍历 server step，调用 built-in landing/presentation/mutation generator，并在准确位置插入 WL、
     WM、CM、CN、CO 与 FreeGame segment。
   - 常规 Spin/Win/dropdown/refill 保持一行式；业务复杂读取集中在少量 game002 generator。删除按 kind 字符串
     `flatMap`、step payload map、手工 reindex/refreeze 和追加第二份 plan 的路径。

6. **rendercore lifecycle 保持，snapshot assertion 按 effect 分派**
   - registry registration 同时校验 kind/version/effect/capability；coordinator 在 cleanup/mutation 前预检完整 plan。
   - landing/mutation handler commit 后断言 output；presentation 不触发 output assertion。rollback/destroy 仍只管理当前
     prepared transaction，runtime/reel/player 所有权不转入 plan/coordinator。

7. **Authoring schema 明确升版并禁止 effect 猜测**
   - `slot-operation-authoring-project` 升为 V2，每个 draft 显式保存 effect/targets/mutations；V1 只能显式升级并全部
     标记 `review: required`。
   - Game Viewer 2 外层升为 v4 以绑定 authoring V2；v2/v3 均不可直接 preview/export。升级可以保留 snapshot 和人工
     evidence，但不得仅用 `input === output` 判定 presentation。
   - viewer 首个 authored scene 用 landing 建立 current；后续相同 snapshot 不自动制造 collect/Win placeholder，只有
     人工提供 presentation evidence 才生成 presentation。

8. **迁移完成后单轨收口**
   - configured adapter 在自身 consumer 边界按 versioned profile role 显式组合 built-in drafts，不把固定完整顺序重新
     包回 logiccore；gameframeworks 只转出 V2。
   - 删除 V1 types/compiler/validators/profile handlers 和所有 compatibility adapter；`docs/slot-operation-plan.md` 标为
     V1 历史合同，effect composition 文档转为当前已实现合同。

## 5. 职责与合同

- **logiccore**：拥有 server component/index/result/scene/otherScene strict view、effect IR、通用 generator/reducer、
  definition validation、source consumption、snapshot closure 和 immutable finalization；不认识具体游戏。
- **rendercore**：拥有 V2 registry/coordinator、effect-aware preflight/assertion 和 reel/symbol/popup transaction；不解释
  component、symbol、金额或 mutation 的游戏业务原因。
- **game002**：拥有精确 component role、业务参数、operation 顺序、专属 mutation reducer/payload 和 handler 组合；
  不复制 shared envelope/freeze/coordinator/reel 状态机。
- **slotoperationauthoring/Game Viewer 2**：前者拥有本地 suggestion/edit/review/schema/finalize，后者拥有 UI、File、
  launch payload；均不伪造 server evidence。
- **数据/API**：source 是 server-component 或 snapshot-authored strict union；effect/kind/version 精确匹配；targets 只表
  presentation，mutations 才表达状态位置；payload/source/snapshot 只含 plain immutable data。
- **资源生命周期**：selector/generator/finalizer 无资源；registry 借用长期 runtime；coordinator 独占当前 prepared；
  commit/rollback 后 destroy，next-spin/fatal/app destroy 幂等 cleanup。
- **失败策略**：absent 可以由 optional generator 规范化为 `null`；present-invalid、重复消费、未知 schema/effect/kind/
  mutation、closure 失败、缺 handler/capability/resource 全部尽早显式失败。
- **禁止行为**：固定 shared round 排列、隐藏 current、第二份业务 operation 表、执行期修改 frozen plan、placeholder、
  路径/首项猜测、kind alias、静默迁移或效果降级。

## 6. 文件范围

### 预计新增

```text
packages/logiccore/{src,tests}/slot-operation/{server-view,effect-generators,v2-finalizer}.*
packages/rendercore/tests/slot-operation/effect-coordinator.test.ts
apps/game002/{src/slot-operations/{types,compiler,generators,handlers}.ts,tests/{slot-operation-compiler,slot-operation-handlers}.test.ts}
packages/slotoperationauthoring/tests/v2-upgrade.test.ts; apps/gameviewer2/tests/operation-project-v4.test.ts
tasks/178-slot-operation-effect-composition-refactor-<utctime>.md
```

### 预计修改

```text
packages/logiccore/{README.md,src/index.ts,src/slot-operation/{types,source-selectors,builtins,compiler,validation,index}.ts,tests/{slot-round-flow.test.ts,slot-operation/**}}
packages/rendercore/{README.md,src/index.ts,src/slot-operation/{types,registry,coordinator,profile-round-handlers,index}.ts}
packages/rendercore/src/scene-layout/{configured-round-adapter,local-scene-flow,index}.ts; packages/rendercore/tests/{slot-operation/**,scene-layout/**}
packages/gameframeworks/{README.md,src/index.ts}
apps/game002/{README.md,src/{game-adapter,cascade-sequence,wl-wm-multiplier-plan,freegame-plan,freegame-playback}.ts}
apps/game002/tests/{game-adapter,game002-round-transform,freegame-plan,freegame-playback}.test.ts
packages/slotoperationauthoring/{README.md,src/{types,project,finalizer,suggestions,index}.ts,tests/**}
apps/gameviewer2/{README.md,src/{model/{project,operation-project},runtime/launch-channel,ui/app-shell}.ts,tests/**}
docs/{slot-operation-plan,slot-operation-effect-composition-refactor}.md
docs/agent-rules/{shared-game-runtime,game002,gameviewer2-local-flow}.md
```

consumer 切换后预计删除 `packages/logiccore/src/slot-operation/profile-compiler.ts` 和 V1-only compiler/validator
surface；`profile-round-handlers.ts` 若无 V2 职责则删除，否则改名并只保留 effect handler 注册。文件可按职责小幅
细分，但不得以新文件保留旧固定排列或 compatibility adapter。

### 原则上不应修改

```text
apps/{game003,gamelayouteditor,gamelayoutpkgcli,popupeditor,symbolseditor}/**
packages/{netcore,uiframeworks}/**
assets/**
pnpm-lock.yaml
AGENTS.md
docs/agent-rules/loading-ui.md
```

若执行发现必须改变 GMI/server schema、production asset、根工具链/lockfile、game003 或新增依赖，属于重大范围扩张，必须先停止说明；不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与冻结 characterization**
   - 重新核对 HEAD/status、V1 direct consumers 和方案文档；用现有 logiccore、configured adapter、game002
     BaseGame+FreeGame、viewer fixtures 固定 operation 顺序、最终 snapshot、动画事件和失败行为。

2. **建立 V2 effect IR、definition 与 finalizer**
   - 在 logiccore 实现 V2 envelope/effect plan、definition map、draft/segment、source union、stable id/index/capability 和
     plain-data deep freeze。
   - 实现 scene establishment、presentation requirement、mutation reducer/closure、source consumption、final snapshot 与
     unknown/duplicate/effect mismatch validation；V1 暂时保持原样供迁移对照。

3. **抽取 strict server view、selectors 和无状态 generators**
   - 从现有 profile/compiler 复用 index/result/scene/otherScene/position 校验，建立 typed step/selection accessor 与四类
     selection policy。
   - 实现 Spin landing、Win/Completion presentation、dropdown/refill mutation、`insert` reducer、optional `null` 和
     `compactOperations()`；覆盖 present-invalid 不回退和 generator determinism。

4. **让 configured consumer 和 framework facade 先接通 V2**
   - configured scene-layout adapter 在 consumer 内显式排列 profile role，使用 shared selector/generator/finalizer；迁移
     built-in handlers 和 snapshot assertions。
   - gameframeworks 暂时并列转出 V2 供 game002 迁移；不把 V1 alias 到 V2，也不暴露 authoring API。

5. **实现 game002 显式 compiler 与专属 mutation generators**
   - 将现有 BaseGame、cascade settled transform 和 FreeGame source 解析改为 typed selections，在单个 compiler 中显式
     形成最终 ordered drafts。
   - 将 WL increment、WM/CM multiplier、WM/CM→CN、CO collect/relocation 和 FreeGame scene/value commits 转为 typed
     mutation/segment；Win、金额、transition/纯动画转 presentation。
   - 保持 component role 来自现有 profile/config；主 compiler 不出现 bind/index/envelope/freeze 样板。

6. **迁移 game002 handlers 与 round execution**
   - handler 改为 V2 effect-specific 类型，复用现有 `Game002RoundTarget`、reel/Symbol/popup public runtime 与私有动画
     phase；commit 只能提交 operation 声明的 output。
   - 删除 settled-transform 二次 expansion、payload map、手工 reindex/refreeze 和 append FreeGame；用完整 fixture 验证
     exact order、intermediate snapshot、rollback/destroy、下一轮 cleanup 和现有 presentation timing。

7. **升级 authoring package 与 Game Viewer 2**
   - 增加 authoring V2 strict parser/finalizer/suggestion；V1 upgrade 保留证据并把全部 effect 判定设为 review required，
     不生成 no-change placeholder。
   - Game Viewer 2 升 v4，编辑器显式选择 effect/targets/mutations；未闭合或未 review 时禁用 preview/export。
   - local scene flow 用首个 landing 建立 authored scene，按 V2 coordinator 执行后续 operation；replay 重建
     coordinator/generation，presentation 不直通 scene mutation。

8. **完成 coordinator effect contract 与 failure matrix**
   - 全 plan preflight 校验 handler effect/capability，landing/mutation commit 后 assert exact snapshot，presentation 保持
     current；注入 preflight/prepare/start/update/commit/assert/rollback/destroy failure。
   - 证明首次 mutation 前失败不改变画面，失败只 rollback 当前未提交 transaction，cleanup/destroy 不泄漏或重复释放。

9. **删除 V1 与固定 profile 路径**
   - 全部 direct consumer parity 后删除 V1 types/compiler/finalizer/profile compiler/handlers/export 和临时分支。
   - 搜索 `SlotOperationPlanV1`、`compileSlotRoundOperationPlan`、`slot:settled-transform`、V1 `operation.input/output`
     假设、旧 authoring project 和 game002 expansion 残留；不得保留 compatibility alias。

10. **同步文档、规则与收尾**
    - 更新 package/app README；将 effect composition 文档标为当前合同、V1 文档标为历史；把三份领域规则中的 V1
      职责更新为稳定 V2 边界，scene-layout 规则仅在稳定职责变化时最小更新。
    - 运行 L3 与浏览器人工验收，生成 UTC 中文报告，记录计划偏差、未完成视觉项和剩余风险。

## 8. 测试与验收

### 测试原则

- 先用当前 fixtures 做 V1/V2 characterization parity，再按新合同更新期望；不为保留伪 input/output 或固定 shared
  排列扭曲 V2 生产代码。
- logiccore 覆盖三种 effect、scene 未建立、presentation requirement、四类 selector、absent/present-invalid、stable
  id/index、source duplicate、insert/relocate/replace/value-update closure、unknown 和 deep freeze。
- game002 覆盖最终数组顺序、可插入 operation、每个 multiplier/CO/FreeGame 中间 commit、component 缺失/重复/非法、
  transform closure 和 handler lifecycle；现有动画测试继续保护 timing。
- authoring/viewer 覆盖 V1→V2/v3→v4 review gate、禁止 effect 猜测、相同 snapshot 无 placeholder、preview/export gate、
  launch/replay/destroy；fake runtime 只证明顺序和事务，不替代浏览器视觉。
- configured adapter/gameframeworks 覆盖 public export 和 direct consumer compile/runtime；删除 V1 后用残留搜索证明单轨。

### 验收级别

`L3`。原因是本任务同时破坏并替换 logiccore/rendercore 跨包 public API、versioned authoring/viewer schema、
game002 production round compiler 和全部 direct consumers，并最终删除 V1；范围无法用单 package 或单一直接依赖链
充分证明。未修改根工具链，但大规模跨包迁移满足 L3 条件。

### 执行会话必须运行

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

失败时先在对应 package/fixture 最小化复现并判断是否由本任务引入，不立即修改无关 package；上述六项用于最终
收口，不用重复运行收集无关 coverage 或历史矩阵。

### 人工验收

- Game002 浏览器：普通 Spin、Win、cascade dropdown/refill、WL/WM/CM/CN/CO、FreeGame、下一轮 cleanup；确认实际
  播放顺序等于 compiler 数组，Win/presentation 不重建 scene，中途失败恢复无残留。
- Game Viewer 2 浏览器：打开旧项目后显式升级/逐项 review、编辑 landing/presentation/mutation、preview/export gate、
  replay 和关闭窗口 cleanup；确认相同 snapshot 不自动产生 presentation。
- 人工项记录浏览器、fixture/project 和结果；编译、单测或 fake runtime 不能标记为视觉通过。

### 独立验收建议

`必须`。本任务涉及跨包 public contract、versioned schema、resource ownership、异步 transaction、rollback/destroy 和
production game round。独立复验重点是 effect/source/mutation closure、Game002 原子提交、Viewer 升级无静默推断：

```bash
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore test
pnpm --filter game002 test
pnpm --filter @slotclientengine/slotoperationauthoring --filter gameviewer2 test
```

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24；shell 无 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 pnpm，不切换 npm/yarn，不强制调版本。
- 依赖缺失时执行 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 本任务不需要新增第三方依赖、workspace package 或修改 `pnpm-lock.yaml`；若实现出现此需求，先说明必要性和影响。

## 10. 生成物、文档与规则

- 本任务原则上不修改 YAML、manifest 或生成资源；若意外触及，必须用正式生成器更新并运行对应 `--check`，不得
  手改 generated TypeScript。
- 更新 logiccore/rendercore/gameframeworks/slotoperationauthoring/game002/gameviewer2 README 的 V2 API、schema、升级和
  lifecycle；不复制完整 proposal。
- `docs/slot-operation-effect-composition-refactor.md` 在 consumer cutover 后改为已实现/current；
  `docs/slot-operation-plan.md` 明确为 V1 历史合同，不能继续宣称 current。
- 最小更新 `shared-game-runtime.md`、`game002.md`、`gameviewer2-local-flow.md` 的稳定职责；只有 scene-layout 的稳定
  production 边界发生变化时才更新 `scene-layout.md`。不修改根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/178-slot-operation-effect-composition-refactor-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、关键决策与偏差、六条自动化命令结果、两项
人工验收、V1 残留搜索、剩余风险；不收集无关 coverage、完整历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- V1 的 fixed profile trace 同时隐含 snapshot 解析与顺序，抽 selector/generator 时若没有 characterization，可能丢失 remove hole、dropdown identity、otherScene authority 或 result order。
- Game002 当前大 transform/FreeGame handler 内含多个异步动画与 commit；拆成 operation 后必须保持原 timing，同时避免已提交前段被后段 rollback 错误撤销。
- presentation 不再有 output 后，现有 coordinator/local viewer 依赖 `operation.output` 的 checkpoint 逻辑必须按 effect 重写，否则可能误提交或无法推进 snapshot。
- authoring schema 无法可靠自动判别 V1 equal-snapshot operation；升级会增加人工 review，但这是避免伪语义的必要兼容成本。
- 全量 L3 和浏览器验收耗时较长；执行会话应分阶段跑定向测试，最终只做一次完整收口。

### 假设

- `docs/slot-operation-effect-composition-refactor.md` 是最后确认方案，现有 game002 profile/config 和测试 fixture 是 component 角色、业务顺序与动画行为的权威实现证据。
- 当前仓内 V1 direct consumer 集合以本计划基线搜索为准；执行开始时重新搜索，新增 consumer 必须迁移后才能删除 V1。
- refill 必须显式建模 `insert` 才能从 hole 精确建立 occurrence；Game002 复合 relocation 可以通过 typed custom mutation definition/reducer 扩展，但不能绕过 shared finalizer closure。

### 待确认

无。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、schema、职责和资源生命周期符合计划。
- [ ] V1 fixed compiler/runtime/authoring 残留已删除，无 alias 或双轨。
- [ ] 测试、生成物、README 和规则已按需同步。
- [ ] 指定自动化验收已通过，人工验收状态已明确记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的领域规则、本计划和方案文档；
2. 核对 Git 基线、工作区和 V1 direct consumer；
3. 按计划的五阶段迁移思路实现，不重新制定固定 shared 编排或兼容 alias；
4. 小幅适配当前实现时在报告记录，重大范围扩张时先停止说明；
5. 分阶段运行定向测试，最终只运行计划规定的 L3 验收；
6. 完成后生成执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
