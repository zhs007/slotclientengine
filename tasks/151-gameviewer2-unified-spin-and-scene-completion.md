# 151 gameviewer2-unified-spin-and-scene-completion 任务计划

## 1. 目标与完成定义

### 目标

调整 `apps/gameviewer2` 的本地 scene / Symbol 编排模型与编辑界面：

1. scene 格子始终按 `width = columns`、`height = rows` 的常规矩阵方向显示；
2. 将首个 Spin 边原先分属 source / target 的两段编排合并为一个特殊 Spin 编排，由固定的“Spin 前 → Spin 中 → 停止”节点和真实转轮事件驱动，不再依赖 `holdSeconds` 卡时间；
3. 每个非 initial scene 状态显式选择“所有格都回到 `normal`”或“第一格回到 `normal`”作为进入下一个 scene 的完成策略。

### 完成定义

- [ ] 导入一个 `6 x 9` layout 时，每个 scene 卡片按每行 6 格、共 9 行显示；其它尺寸同理，坐标与编辑仍精确对应 x-first `scene[x][y]` 数据。
- [ ] 首个处理边只引用一个 Spin 编排：所有 source 格先处理“Spin 前”，开始真实转轮时进入“Spin 中”，每个 target 格真实落点时进入“停止”，最后精确请求 `normal` 后该格完成。
- [ ] Spin 编排的三个节点在 schema 和 UI 中都是固定结构，不可删除、换序或拆回两个 snapshot 编排；“停止”序列的最后一项必须是 exact `normal`。
- [ ] 普通 Symbol 编排不再接受 `holdSeconds`；中间项只允许能依真实 animation completion 推进的 `once` state，最后一项必须是 exact stable `normal`。
- [ ] scene 选择 `all-cells-normal` 时，所有格的当前编排都进入最后 `normal` 才处理下一个 scene。
- [ ] scene 选择 `first-cell-normal` 时，左上角 `(x=0,y=0)` 进入最后 `normal` 即可结束当前 scene；未完成 controller 被当前 scene 一次性退役，不得在下一 scene 提交后发出过期 state request。
- [ ] Spin 的转轮物理停稳仍是不可越过的安全边界；`first-cell-normal` 可提前记录第一格完成，但只在 standard / grid-cell reel 已 settle 后提交下一 scene。
- [ ] 新建项目、项目 JSON 导入导出、新窗口 launch payload、readiness、Replay 与 runtime snapshot 统一使用新版严格合同；旧 v1 不静默迁移或按新语义误读。
- [ ] 完成 L2 定向自动化和 UTC 中文执行报告；在报告中交付 standard / grid-cell 真实 ZIP 浏览器验收清单，由用户执行。

## 2. 范围

### 包含

- `scene-other-scene-flow` 本地 project 的 v2 strict schema、parser、default authoring 和 package-aware readiness。
- 带 `kind` 的 Spin / 普通 Symbol choreography union，以及 Spin 固定三节点、最终 `normal` 和无 hold 合同。
- initial snapshot 与后续 scene state 的职责分离；后续 state 显式持有 transition kind、逐格 choreography 引用和 completion policy。
- rendercore 本地 flow runtime 的 Spin 阶段、normal 完成屏障、first-cell 超越与过期 controller 隔离。
- gameviewer2 的矩阵排布、scene 完成策略编辑、分类 choreography 编辑、v2 项目文件与 launch protocol。
- 直接保护 parser/readiness/runtime/UI 的测试、README 和最小领域规则同步。

### 不包含

- 不改 production scene-layout ZIP、Symbols package、game config、公开轮带或 reel spin timing schema。
- 不连接服务器，不引入 round/component/cascade/win/popup/game mode 语义。
- 不允许用 wall-clock timer 替代 once completion、landing 或 reel settle 边界。
- 不为旧 v1 项目提供猜测式转换、alias 或隐式 fallback；如以后需要迁移器，应另立有明确输出与失败合同的任务。
- 不扩展条件分支、循环、并行 scene 保留、snapshot 拖拽排序或自定义“第一格”坐标。
- 不改通用 `SymbolStateSequenceController` 的旧 consumer 默认行为；本地 flow 在 readiness 和专用 runner 边界收紧无 hold 语义。
- 不新增依赖，不修改 root toolchain 或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-03T05:07:29Z
HEAD: 34512b00220aa99b8133748ff841d73f107d3034
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 本规划会话读取了根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/{gameviewer2-local-flow,shared-game-runtime,scene-layout}.md`；`apps/gameviewer2` 和 `packages/rendercore` 范围内没有更深层 `AGENTS.md`。
- `tasks/150-gameviewer2-local-scene-flow-preview.md` 与对应执行报告确认当前 v1 设计：`snapshots[0]` 全格引用 `Spin: normal -> spinBlur`，`snapshots[1]` 全格引用 `Landing: appear -> normal`，这正是本任务要取消的两段式编排。
- `packages/rendercore/src/scene-layout/local-scene-authoring.ts` 当前只有 `SceneOtherSceneFlowProjectV1`；choreography 是无 `kind` 的 `steps[]`，中间 stable state 必须配 `holdSeconds`，末项只要是任意 stable state，每个 snapshot 都有一张 choreography id matrix。
- `packages/rendercore/src/scene-layout/local-scene-flow.ts` 当前先运行 snapshot 0 的 source 编排，全部 controller 清空后开始 Spin；landing delta 启动 snapshot 1 编排，之后只以全局 `#active.size === 0` 推进。
- `SymbolStateSequenceController({loop:false})` 在进入最后一项时即标记 completed；once state 依真实 completion 推进，stable state 默认依时间推进。因此本任务可通过限制中间项为 once、锁定末项 `normal` 来消除 hold，不需要改变通用 controller 默认。
- `apps/gameviewer2/src/ui/app-shell.ts` 当前以 `snapshot.scene.flatMap(column => column.map(...))` 生成 DOM，即 x-major 顺序；`apps/gameviewer2/src/styles.css` 又以 `repeat(columns)` 换行。对 `columns != rows` 的布局，DOM 顺序与常规“y 为行、x 为列”视觉矩阵不一致。
- `apps/gameviewer2/src/model/project.ts` 与 `src/runtime/launch-channel.ts` 都是 strict v1 wrapper / payload；本任务改变持久化语义，不应就地篡改 version 1。
- `SceneLayoutPackageRuntime` 已经提供逐格 landing drain、整体 spin status、state request/snapshot、原子 scene/value snapshot commit 和 reset/destroy；实现新屏障不需要为 standard / grid-cell 新建转轮状态机。

## 4. 需求解释与技术决策

### 需求解释

- 布局中 `columns` 是视觉 width，`rows` 是视觉 height。正式 matrix 仍保持 rendercore 已有 x-first 合同；只在 UI 渲染时按 `for y` 外层、`for x` 内层输出左到右、上到下的格子，不转置或复制数据。
- 第一个 snapshot 只是 initial scene，不再单独执行一份“Spin source 编排”。从 initial 进入第二个 snapshot 是唯一 `transition: "spin"` 的 scene state，该 state 的每格引用一个 `kind: "spin"` 编排，一份引用横跨 source 与 target 落点。
- Spin 编排使用固定结构：`beforeSpin.state`、`spinning.state`、`stopping.steps[]`。`beforeSpin` 是 once 时等真实完成，是 stable 时立即打开启转 gate；`spinning` 必须是 stable 并由实际 reel spin 边界保持；`stopping` 从每格 landing 开始，中间只允许 once，末项固定为 stable `normal`。
- 普通 `kind: "sequence"` 编排用于第三个及后续 `transition: "settled"` scene state；序列的中间项只允许 once，末项固定为 stable `normal`。
- “第一格”固定指左上角 `(0,0)`。`all-cells-normal` 等待当前 scene 所有格进入终态；`first-cell-normal` 只等 `(0,0)`，达成后当前一代 controller 全部失去写权，再处理下一 scene。
- Spin 中的 scene 完成策略只决定 Symbol stopping 的等待范围，不取消转轮必须 settle 的资源/画面安全边界。

### 关键决策

1. **新增 strict v2，不改写 v1 语义。** `SceneOtherSceneFlowProjectV2`、`GameViewer2ProjectFileV2` 和 launch payload v2 同步替换当前 app consumer；parser 对 v1 给出精确的 unsupported-version 失败。两段编排无法在不猜测用户意图的前提下自动合并，因此不增加静默 migration。
2. **用 choreography discriminated union 表达特殊 Spin。** Spin 的事件节点属于 rendercore local-flow 通用表现语义，不放入 app 私有 timer；普通 sequence 继续是可配置 Symbol state 序列。
3. **把编排定义放在 project 列表，把完成策略放在 scene state。** 编排可被多格复用；是否统一结束是每个大 scene 的推进决策，不应重复到每个 Symbol 定义。
4. **以精确 `normal` 作为格完成标志。** readiness 要求 state preset 存在 exact stable `normal`，且对应 source/target symbol 真实支持所有节点。显式 manifest equivalence 仍由现有 Symbol resolver 处理，但 project 末项本身不接受其它名称代替 `normal`。
5. **不让非统一结束产生跨 scene 过期写入。** runtime 为每个 scene run 使用 generation/owner token；屏障达成时原子退役本代剩余 controller，然后才调用已有 snapshot transaction。不实现两个 scene 同时争抢同一 occurrence 的隐式并行状态机。
6. **保留 reel settle 硬屏障。** 即使 `(0,0)` 先落点并回到 normal，也不在其它 reel 尚在 spin 时对整个 main reel 提交新 snapshot；这保持 standard / grid-cell 已有 ownership 与 transaction 边界。
7. **UI 只改视觉遍历，不改 matrix 存储方向。** 用 y-major DOM 顺序和 `repeat(columns)` 呈现 width/height；所有 `data-x/data-y`、roll、clone、readiness 和 runtime 仍消费 x-first matrix，避免为 UI 引入第二份转置数据。

## 5. 职责与合同

- **rendercore authoring/readiness**：拥有 v2 类型、strict unknown-key/version validation、默认项目、matrix/reference/kind 校验和 package capability preflight。
- **rendercore local flow runtime**：拥有 before-spin gate、spinning state、landing-driven stopping、settled sequence、completion barrier、generation retirement、Replay 与 destroy；仍只通过 `SceneLayoutPackageRuntime` public surface 操作画面。
- **gameviewer2**：拥有 y-major 可视排布、v2 draft、分类编辑控件、scene completion policy 控件、项目文件和一次性新窗口传输；不复制 runtime 屏障。
- **v2 snapshot 合同**：第 0 项是只持有 `scene/otherScene` 的 initial snapshot；第 1 项必须是 `transition: "spin"`，其逐格引用必须指向 Spin choreography；第 2 项起必须是 `transition: "settled"` 并只引用 sequence choreography。
- **choreography 合同**：不存在 `holdSeconds`。Spin 三节点结构必须完整；`spinning` 必须 stable；两类可完成序列都只允许 once 中间项并以 exact stable `normal` 结尾。
- **capability 合同**：Spin `beforeSpin/spinning` 对前一 snapshot 的 source symbol/value 验证，`stopping` 对当前 target symbol/value 验证；settled sequence 对当前 snapshot 验证。
- **完成合同**：格在 runner 进入并成功请求最终 `normal` 时完成，不轮询猜测 animation duration。`all-cells-normal` 与 `first-cell-normal` 是必填 enum，未知值显式失败。
- **生命周期**：当前 scene generation 是本代 controller 的 owner；advance/replay/error/destroy 先退役 controller 并清 landing/phase 状态，再 reset/commit/destroy，不留半提交或跨代写入。
- **禁止行为**：不用 timeout 完成 state，不用首个 stable state/first choreography fallback，不以 DOM 顺序反推 runtime 坐标，不让 app 直接操作 reel/display tree。

## 6. 文件范围

### 预计新增

```text
apps/gameviewer2/tests/launch-channel.test.ts
tasks/151-gameviewer2-unified-spin-and-scene-completion-<utctime>.md
```

### 预计修改

```text
apps/gameviewer2/README.md
apps/gameviewer2/src/model/project.ts
apps/gameviewer2/src/runtime/launch-channel.ts
apps/gameviewer2/src/ui/app-shell.ts
apps/gameviewer2/src/styles.css
apps/gameviewer2/tests/{project,app-shell,runtime-entry}.test.ts
packages/rendercore/README.md
packages/rendercore/src/scene-layout/{local-scene-authoring,local-scene-flow}.ts
packages/rendercore/tests/scene-layout/{local-scene-authoring,local-scene-readiness,local-scene-flow}.test.ts
docs/agent-rules/gameviewer2-local-flow.md
```

### 原则上不应修改

```text
apps/{gameviewer,gamelayouteditor,game002,game003}/**
packages/rendercore/src/{reel,symbol}/**
packages/rendercore/src/scene-layout/{manifest,production-zip,package-runtime}.ts
packages/{logiccore,gameframeworks,uiframeworks,netcore}/**
assets/**
AGENTS.md
pnpm-lock.yaml
```

若执行时发现必须修改 reel/package-runtime public API、production schema、通用 Symbol controller、其它 app consumer 或 lockfile，必须先说明现有 public surface 无法承载的精确缺口和直接影响，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线**
   - 重新核对 HEAD、工作区、本计划列出的领域规则、v1 parser、readiness、local flow runtime 和 app 项目/launch 入口。
   - 确认 production layout geometry 仍以 `columns/rows` 为权威，当前 reel landing/snapshot API 足以完成本计划；若基线已变为其它 project version，先判断是小幅适配还是需要重新规划。

2. **定义并严格解析 flow project v2**
   - 在 `local-scene-authoring.ts` 定义 initial / processed snapshot union、`spin | settled` transition、completion policy 和 `spin | sequence` choreography union。
   - parser 拒绝 v1、unknown key、缺失的 Spin 固定节点、`holdSeconds`、非 once 中间项、非 `normal` 末项、错误 transition/kind 引用、非法 policy 和不合维度。
   - 保留至少两个 snapshot；第二个固定是 Spin target，后续 clone 固定生成 settled state。

3. **更新 default project 与 package-aware readiness**
   - 默认只创建一个合并 Spin choreography：`beforeSpin=normal`、`spinning=spinBlur`、`stopping=appear -> normal`；另创建一个可供后续 settled state 使用的 `normal` sequence。
   - initial snapshot 不持有不会执行的 choreography matrix；Spin target 全格显式引用默认 Spin 编排并设置明确 completion policy。
   - readiness 按 source/target 分别校验 Spin 节点的 symbol state/value capability，按 target 校验 settled sequence，要求 exact stable `normal` 存在且可用，任一格失败都报 snapshot/坐标/choreography/state。

4. **重构本地 flow runtime 的合并 Spin**
   - 初始化 snapshot 0 后，对 Spin target 的每格启动 source-side `beforeSpin`；所有 before gate 完成后请求 `spinning` 并调用现有 `spinMainReelToScene()`。
   - 每个 exact landing position 只启动一次 target-side `stopping` sequence，依 once completion 推进到 `normal`；转轮 settle 与 Symbol completion policy 作为两个显式 gate。
   - 删除 snapshot 0/1 分立 choreography 的 `#spinStarted + #active.size` 隐式组合，以明确 phase/generation 状态表达 before/spinning/stopping/settled。

5. **实现每 scene 完成策略与跨代隔离**
   - settled state 继续先用现有 transaction 提交 scene/value，再启动逐格 sequence。
   - runner 精确记录哪些坐标已进入最后 `normal`；`all-cells-normal` 看完整集合，`first-cell-normal` 只看 `(0,0)`。
   - 屏障达成时先退役本代剩余 controller、忽略本代迟到 completion/landing，再 advance；Replay/error/destroy 用同一清理路径。

6. **接入 gameviewer2 v2 project 与 launch protocol**
   - `model/project.ts` 只导入导出 `gameviewer2-project` v2，保持 layout hash 严格绑定；旧 v1 显示可理解的版本错误，不部分 commit draft。
   - `launch-channel.ts` 同步 payload type/version/handshake，仍一次性传递 ZIP bytes + hash + 完整 project；runtime 窗口继续重做 readiness。
   - 新增 launch parser 测试，覆盖 v1、错 version、缺 ZIP/hash/project 和合法 v2 payload。

7. **调整 scene 编辑器与矩阵布局**
   - scene 卡片标明 `width x height`，按 y-major 生成 DOM，CSS 以 width 为 column count 并保留水平 overflow；格子坐标仍显示 `(x,y)`。
   - initial 卡片只编辑 scene/otherScene；Spin target 只列出 Spin choreography；settled 卡片只列出 sequence choreography，每个非 initial 卡片提供“统一结束 / 第一格结束”选择。
   - Clone 仍 deep clone scene/otherScene。若前一项已是 settled，同步 clone 其 sequence assignments 和 policy；若从唯一 Spin target 新建第一个 settled state，显式使用 default `normal` sequence，不把 Spin 引用静默当作普通 sequence。

8. **重做分类 choreography UI**
   - 编排列表显示 `Spin` / `Sequence` kind；新建普通 sequence，复制保留 kind 并生成新 id/name。
   - Spin 编辑器固定呈现“Spin 前”、“Spin 中”、“停止”三个节点；前两项只可换 state，不可移动/删除，停止节点可编辑 once 中间项但锁定最后 `normal`。
   - Sequence 编辑器保留中间 once 项的增删排序，删除 hold 输入，锁定最后 `normal`；UI mutation 仍每次经 strict parser/readiness，不让无效中间态进入预览。

9. **测试、文档与收尾**
   - authoring/readiness 覆盖 v2 union、固定 Spin 节点、source/target capability、最终 normal、禁止 hold、policy 和 transition/kind mismatch 的 strict failure。
   - runtime 覆盖 before once/stable gate、spinning request 时序、landing stopping、两种 policy、first-cell 早于 reel settle、过期 controller 不写入、后续 settled state、Replay/error/destroy。
   - app-shell 用非方阵 fixture 断言 DOM 顺序为 `(0,0),(1,0)...(0,1)`、CSS width 变量正确，并覆盖 policy/kind 编辑和锁定 normal。
   - 更新 app/rendercore README 和 `gameviewer2-local-flow.md` 中已过时的 v1、两段 Spin、hold 与统一结束规则，运行 L2 验收后生成 UTC 报告。

## 8. 测试与验收

### 测试原则

- 以 v2 明确合同替换已过时的 v1 期望，不为保留两段 Spin 测试而扭曲生产实现。
- 必须分别验证 schema shape、package capability 与 runtime 时序；编译成功不代替 once/landing/settle 边界测试。
- 矩阵显示测试同时断言视觉 DOM 顺序和 `data-x/data-y` 编辑结果，防止只“看起来正确”却写错 x-first matrix。
- 覆盖正常路径、v1/unknown/illegal-state strict failure、first-cell 超越、Replay 与 destroy；不重复扩张未改动的 ZIP/resource/reel 全量测试。

### 验收级别

`L2`。原因是修改 `@slotclientengine/rendercore/scene-layout` 已导出的 versioned project schema 和 runtime 推进行为，并同步直接 consumer `apps/gameviewer2` 的持久化文件与 launch protocol；不涉及 root toolchain、lockfile 或无法界定的整仓重构，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter gameviewer2 test
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 lint
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 build
git diff --check
```

- rendercore 全 package test 必要，因为变更的 scene-layout public facade 与现有 reel/symbol/package runtime 直接组合，局部测试不能证明旧 consumer 未回归。
- gameviewer2 独立 test 必要，其 coverage threshold 同时要求新增的 v2 UI/protocol 分支有直接保护。

### 人工验收

本节由用户在浏览器中执行。执行会话不代为打开浏览器或使用真实 ZIP；只需在执行报告中保留下列清单，并记录“待用户验收”或用户已回传的结果：

- 用一个非方阵 production ZIP（优先 `6 x 9`）确认每行 width=6、共 height=9 行，且修改左上/右下格后预览中是同一坐标。
- 分别使用 standard 和 grid-cell ZIP 预览默认 Spin，确认 `normal -> spinBlur -> appear -> normal` 由固定节点与真实 landing/completion 驱动，UI 中不再出现 hold 时间输入。
- 同一条至少三个 scene 的流程分别选择两种 completion policy，确认统一结束会等全格 normal，第一格结束会在 reel settle 后及时进入下一 scene，且无旧 scene 延迟 state request 覆盖新画面。
- Replay 两次，确认每次都回到 initial scene 并重走合并 Spin，没有遗留 landing/controller 导致提前跳 scene。

### 独立验收建议

`建议`。本任务不涉及 credential、服务器数据或新资源交付，但涉及跨 app/package public schema、逐格异步 completion 和过期 controller ownership。独立验收聚焦：

```bash
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter gameviewer2 test
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置代理并重试原命令：

  ```bash
  export http_proxy=http://127.0.0.1:1087
  export https_proxy=http://127.0.0.1:1087
  ```

- 本任务不需要新依赖或 lockfile 变更；若出现该需求，视为范围扩张先停止说明。

## 10. 生成物、文档与规则

- 本任务不修改 YAML 或生成物，不运行不相关生成器。
- 更新 `apps/gameviewer2/README.md` 的 width/height、v2 项目、合并 Spin、最终 normal 和 scene completion policy 使用说明。
- 更新 `packages/rendercore/README.md` 中 local authoring facade 的 v2 public workflow 和 runtime 完成语义。
- 更新 `docs/agent-rules/gameviewer2-local-flow.md` 中已过时的 strict v1、默认两段编排与全格统一结束表述；新规则保存稳定的 v2 职责和失败合同，不写入本次测试证据。
- 不修改根 `AGENTS.md` 或其它领域规则：当前路由和 shared/runtime/scene-layout 职责边界已足够，新语义只属于 gameviewer2 local flow。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/151-gameviewer2-unified-spin-and-scene-completion-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. v2 最终合同、合并 Spin、布局与 completion policy 实现；
2. 实际修改文件、关键决策和任何计划偏差；
3. 实际验收命令与结果；
4. 交付给用户的 standard / grid-cell / 非方阵 ZIP 浏览器验收清单，以及“待用户验收”或用户已回传的结果；
5. 剩余的 v1 兼容性、视觉时序或 ownership 风险。

除 L3 外不收集无关 coverage 明细、完整历史矩阵、整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- v2 会明确拒绝任务 150 导出的 v1 项目；这是避免将两个独立编排猜测合并的有意兼容性断点，需在 README 和错误信息中说清。
- `first-cell-normal` 会退役其它格未完成的当前 scene 编排；若未严格隔离 generation，迟到 once completion 可能覆盖下一 scene 的 state。
- 普通 sequence 不再能用 stable 中间态 + hold 表达定时效果；这是事件驱动目标的有意收紧，不应以隐式 0 秒或默认 1 秒保留。
- 非方阵矩阵修复只改 DOM 遍历时，所有事件处理必须继续以 `data-x/data-y` 写回 x-first matrix；若用 flat index 写回会引入坐标转置回归。
- Spin target 的第一格可能在其它 reel 之前 normal；必须同时保留 reel settle gate，否则后续整体 snapshot commit 会与 active spin 争用 occurrence。

### 假设

- 用户所说的 `width=6,height=9` 分别对应 layout `columns=6,rows=9`，并希望左到右是 x 增加、上到下是 y 增加。
- “第一格”指左上角 `(x=0,y=0)`，不是第一个落点格、第一个完成格或可配坐标。
- “不用卡时间”表示删除 local-flow choreography 的 `holdSeconds`，中间动画由 once completion 推进，Spin stable state 由固定 reel 节点推进。
- 首个 Spin 仍是唯一特殊 Spin 边；第三个及后续 scene 继续使用 settled snapshot commit，不新增多 Spin 边。

### 待确认

无。

## 13. 完成清单

- [ ] width/height 矩阵显示与 x-first 数据写回同时正确。
- [ ] 首个 Spin 已合并为三个固定节点，不再拆分 source/landing choreography。
- [ ] 所有可完成序列都无 hold 并以 exact stable `normal` 结尾。
- [ ] scene 级两种 completion policy 与 reel settle 安全边界均符合计划。
- [ ] v2 public API、project file、launch payload、readiness 和直接 consumer 已同步。
- [ ] 过期 controller、Replay、error 和 destroy 清理已有直接测试。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] README、领域规则和指定自动化已按需同步，用户浏览器验收清单已在报告交付。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/{gameviewer2-local-flow,shared-game-runtime,scene-layout}.md` 和本计划；
2. 核对 Git 基线与工作区，保留用户已有和无关修改；
3. 按 v2 严格合同实现，不重新制定两段 Spin 或 timer fallback 方案；
4. 小幅适配当前实现时在报告记录，重大范围扩张时先停止说明；
5. 只运行本计划规定的 L2 定向自动化；不代为执行浏览器/真实 ZIP 验收，在报告中把验收清单交给用户；
6. 完成后生成 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
