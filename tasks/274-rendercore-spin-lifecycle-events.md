# 274 rendercore-spin-lifecycle-events 任务计划

## 1. 目标与完成定义

### 目标

在 RenderCore 现有 Game Layout runtime event catalog 中新增统一的 Spin 生命周期事件，供 Game Layout
Editor 的 Event 音乐音效对话框直接选择：每个参与单元真实开始、落停时分别发布事件，最后一个参与单元落停后再发布整组事件。
覆盖 standard `ReelSpin`、legacy `grid-cell` 主转轮以及独立 `CellSpin`，并沿用现有 owner-first
`gamelayout:/` 地址、shared catalog、同步 occurrence 和 EditorCore family/facet 选择流程。

### 完成定义

- [x] standard `ReelSpin` 为每个 `x` 编译 exact 与 `x=*` 地址，真实进入 rolling 时发布 `started`，提交目标画面后发布
      `stopped`；本组最后一个轴落停后再发布一次 `all-stopped`。
- [x] legacy `grid-cell` 与独立 `CellSpin` 为 `x/y` 编译 exact、指定列、指定行与全体 wildcard 地址，每个参与 cell 发布
      `started/stopped`，最后一个参与 cell 落停后发布 `all-stopped`。
- [x] 三类 Spin 均额外发布无坐标的整体 `started/ended`：cohort 建立时先发布一次 `started`，成功落定时在
      `all-stopped` 后发布一次 `ended`；取消、失败和销毁不伪造 `ended`。
- [x] full/selective、direct/session、continuous settle 与 grid-cell immediate stop 使用同一合同；cancel、无目标 continuous、
      reset、失败和 destroy 不伪造 stopped/all-stopped，连续两轮各自只发布一次 all-stopped。
- [x] 同一 update 跨过多个 start/stop 边界时按既有稳定轴/格顺序发布；最后一个 stop 后才发布 all-stopped。stopped 发生在 target
      occurrence 已提交之后，不等待 landing appear、暗层恢复或其它收尾动画。
- [x] wildcard listener 收到的 occurrence `address` 始终是实际 exact `x/y` 地址，detail 同时携带真实坐标；无相关订阅时不构造 detail。
- [x] RenderCore editor inspector 返回新增 frozen descriptor/family/facets；EditorCore、Editordemo 与 Game Layout Editor
      可显示和选择这些事件，Game Layout Editor 不维护第二份 family/address 表。
- [x] Event audio 可绑定某轴/格、行列 wildcard、全体 wildcard 或 all-stopped：start/stop 音效按匹配 occurrence 播放，整组音效每轮一次。
- [x] 原有 event、spin Promise、edge drain、scene commit、symbol state、animation 和资源生命周期保持不变；文档、规则、定向测试
      与 UTC 中文执行报告完成。

## 2. 范围

### 包含

- RenderCore reel 层对三类 spin producer 的中性整体 started/ended 与单元 started/stopped/all-stopped edge 观察能力。
- Scene Layout shared event catalog 的 `spin-lifecycle` family、canonical address、facets、descriptor detail 与 package runtime
  occurrence 映射。
- package-owned、host-updated injected grid-cell reel、runtime-owned CellSpin overlay、full/selective/continuous/immediate/direct/session
  路径的统一事件边界。
- EditorCore event dialog 的 family/facet 中文标签和 shared catalog 回归测试。
- Editordemo 的通用 dialog 展示回归，以及 Game Layout Editor Event audio 对真实 shared catalog 新候选与绑定保存的回归。
- RenderCore/EditorCore/Game Layout Editor 文档、runtime address 文档和最小领域规则更新。

### 不包含

- 不新增独立 all-started、spinning progress、cancelled、failed、speed、near-win、bounce、symbol appear 或动画完成事件。
- wildcard 只允许预编译的 ReelSpin `x=*`，以及 grid-cell/CellSpin 的 exact/exact、exact/_、_/exact、_/_；不支持任意 glob、范围、
  负坐标或 bind/wait 额外 selector。
- 不把 all-stopped 等同于现有 grid-cell `completed`；后者可能等待 landing appear/暗层收尾，本任务只表达最后一个目标落停 commit。
- 不新增/升级 Scene Layout、AudioCore、Symbols 或 Popup schema，不修改 `eventAudio` 持久结构，不生成或迁移资源。
- 不在 EditorCore、Editordemo 或 Game Layout Editor 解析 address 字符串推导业务语义，不增加 app-local catalog。
- 不修改 logiccore operation plan、游戏业务 app、production assets、外部仓库、依赖或 lockfile。
- 不顺带统一或删除 legacy `GridCellReelSpinPlan`、`ReelSpinPlan`、CellSpin/ReelSpin API，也不新增通用 choreography DSL。

## 3. 制定计划时的基线

```text
UTC: 2026-08-31T07:06:10Z
HEAD: 686c10936bc4bc63a86f9ca16c5c62bf9d88691b
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `tasks/228-rendercore-gamelayout-runtime-addressing.md`
- `tasks/242-gamelayouteditor-global-event-audio.md`
- `docs/agent-rules/{shared-game-runtime,editor-artifacts,scene-layout}.md`

目标目录下没有补充 `AGENTS.md`。任务编号已由用户从 273 更正为 274；既有任务 273 计划与执行报告保持不动。

当前结论：

- `packages/rendercore/src/scene-layout/core/runtime-address-catalog.ts#compileGameLayoutRuntimeEventCatalog()` 是 production
  runtime 与 editor inspector 共用的唯一 event compiler；当前 family 尚无 spin lifecycle。
- canonical reel owner 已是 `gamelayout:/reel/main`；现有地址采用 owner-first、lowercase structural segment、exact identity
  segment 和 `lifecycle/<edge>` 结构。新增地址不需要写回 manifest。
- `DefaultSceneLayoutPackageRuntime.update()` 已取得 standard `startedAxes/stoppedAxes` 与 grid-cell `startedCells/landedCells`，但只用于旧的
  main-reel landing drain；没有向 address manager 发布 spin 事件。
- `RenderReelSetUpdateResult.completed` 描述 plan 完成，`RenderGridCellReelSetUpdateResult.completed` 还可能等待 landing
  appear/暗层恢复，均不能不加区分地充当“最后一个落停”事件。
- `RenderCellSpin.update()` 当前返回 `void`，direct `start()` 与内部 `landed` 边界都没有外部 edge；package runtime 无法可靠复原
  每格开始、落停与一组结束。
- `hostUpdatesMainReel=true` 时 package runtime 不调用 injected grid-cell reel 的 `update()`；只在 package runtime 外层读取
  update result 会漏事件，因此 stopped edge 必须由实际 spin owner 发布，再映射到唯一 Game Layout event manager。
- `stopMainReelGridCellSpinImmediately()` 已同步提交并返回本次新落停 positions；本任务需让底层 immediate path 与常规 update
  经过同一 observer，避免 facade 单独补事件。
- `packages/editorcore/src/assets/adapters/game-layout-events.ts` 已直接返回 RenderCore catalog，无需改数据 adapter；
  `game-layout-event-dialog.ts` 只需为新 family/facets提供显示标签。
- `apps/gamelayouteditor/src/ui/event-audio-dialog.ts` 对非 `mode-state` family 默认 `effect + once`，新 Spin family 自然符合音效
  默认，无需增加业务分支；候选来自 `inspectEditorWorkspaceRuntimeEventCatalog()`。
- `apps/editordemo/tests/demo-project.test.ts` 已以 synthetic `symbol-state` / `symbols-state-batch` 验证 shared dialog family 展示，适合
  增量证明 Spin family 不是由正式 app 私自解释。

## 4. 需求解释与技术决策

### 需求解释

1. “第几轴开始和停止”是坐标可选的事件：standard 按 `x`，grid-cell/CellSpin 按 `x/y`；started 在该单元真实进入 rolling 时发生，
   stopped 在其目标画面真实提交后发生。
2. wildcard 表示订阅范围，不改变 occurrence identity。ReelSpin exact 事件同时 dispatch 给 `x=*`；cell exact 事件同时 dispatch 给
   exact/column/row/all 四个预编译地址，与现有 `symbol-state` 规则一致。
3. “最后一个也停下来以后”是该次 active spin cohort 的最后一个参与单元已提交目标画面，不是 Promise continuation、整帧末尾、
   symbol appear 完成或任意 idle 检查。
4. full spin、selective spin、direct 原子调用和 session 都以实际参与集合为 cohort；单轴/单格 direct roll 的第一次落停同时也是该 cohort
   的 all-stopped。并发 direct 原子调用以当时仍 active 的同 owner 集合收敛，最后一个才发 all-stopped。
5. 事件只代表成功落停。abort/cancel/destroy 即使把 runtime 变回 idle，也不等于 stopped；失败不得发布部分 all-stopped。

### Canonical event 决策

```text
gamelayout:/reel/main/spin/reel-spin/lifecycle/<started|ended>
gamelayout:/reel/main/spin/reel-spin/x/<x|*>/lifecycle/<started|stopped>
gamelayout:/reel/main/spin/reel-spin/lifecycle/all-stopped
gamelayout:/reel/main/spin/grid-cell/lifecycle/<started|ended>
gamelayout:/reel/main/spin/grid-cell/x/<x|*>/y/<y|*>/lifecycle/<started|stopped>
gamelayout:/reel/main/spin/grid-cell/lifecycle/all-stopped
gamelayout:/reel/main/spin/cell-spin/lifecycle/<started|ended>
gamelayout:/reel/main/spin/cell-spin/x/<x|*>/y/<y|*>/lifecycle/<started|stopped>
gamelayout:/reel/main/spin/cell-spin/lifecycle/all-stopped
```

- family 固定为 `spin-lifecycle`；facets 顺序固定为 `reel=main`、`spin=<reel-spin|grid-cell|cell-spin>`、
  `scope=<spin|axis|column|row|cell|all>`、适用的 `x/y`、`lifecycle=<started|stopped|ended|all-stopped>`。
- ownerAddress 固定为既有 `gamelayout:/reel/main`，不另建 transient spin owner/address instance。
- exact occurrence detail 包含 `eventFamily="spin-lifecycle"`、`reelId="main"`、`spin`、`lifecycle` 和实际 `x/y`；wildcard
  listener 仍收到 exact address/detail。all-stopped 不伪造坐标，可包含本 cohort 的参与单元数。
- catalog 只在 manifest 有 main 和 Symbols binding 时暴露 Spin family：存在任一 `standard` binding 时加入 ReelSpin，存在任一
  `grid-cell` binding 时加入 grid-cell；CellSpin 对任一可用 Symbols binding 加入一次。多 mode/binding 不重复地址。
- 坐标范围只来自 canonical `main.columns/rows`；unknown/out-of-range 组合显式失败，Editor 只能选择 catalog 已有 entry。

### 关键实现决策

1. **由 spin owner 发布中性 started/committed edge。**
   - 在 reel 内部建立无 Pixi/Game Layout 依赖的同步 lifecycle observer seam，`RenderReelSet`、
     `RenderGridCellReelSet`、`RenderCellSpin` 都在真实 rolling start 与 target commit 边界通知。
   - Scene Layout package runtime 订阅并映射为 canonical address；低层不知道 audio、manifest 或 `gamelayout:/`。
   - observer 必须能附着到 `createGridCellReel` 返回的 injected instance，使 host 自己调用 `update()` 时仍不会漏事件；不得要求 host
     重放 update result 或复制 all-stopped 判定。
2. **catalog 预编译 exact/wildcard dispatch。**
   - ReelSpin exact `x` entry dispatch 给 exact 与 `x=*`；cell exact `x/y` entry dispatch 给 exact、column、row、all，复用
     runtime event manager 的 `dispatchAddresses`，热路径不解析 wildcard。
   - observer 只发布实际坐标，package runtime 格式化 exact occurrence address；Editor 不从 detail 生成候选。
3. **all-stopped 使用独立 edge，不复用 completed。**
   - ReelSpin 在本 cohort 最后一个 active axis 已落停后通知；grid-cell 在最后一个 selected cell target commit 时通知，即使其
     landing appear 尚未完成；CellSpin 在最后一个 active cell 从 pending 集合移除时通知。
   - 一个 update 同时落停多个单元时先按既有稳定顺序通知每个 unit，再通知一次 all-stopped。
4. **immediate 与常规路径同源。**
   - grid-cell immediate stop 在底层完成全部 target commit 后通过同一 observer 发布 unit + all-stopped；package facade 不二次合成。
   - continuous 的每个单元真实开始时发布 started；只有 settle 注入 target 后的 landing 才发布 stopped。cancel/reset/destroy 只清理 cohort。
5. **Editor consumer 只补展示，不复制语义。**
   - EditorCore 增加 `spin-lifecycle` 与 `reel/spin/lifecycle` label；选择和 validation 继续基于 catalog entry。
   - Editordemo 只证明 generic UI，Game Layout Editor 只证明真实 inspector/Event audio round-trip；两者不新增地址常量表。

## 5. 职责与合同

- **RenderCore reel primitive**：拥有 active cohort、真实 rolling/target commit、稳定单元顺序、started/stopped/all-stopped edge 与
  cancel/reset/destroy 清理；不知道 Game Layout 和音频。
- **Scene Layout event compiler**：从 canonical manifest 能力编译唯一 Spin descriptor/family/facets；不实例化 reel/player。
- **Scene Layout package runtime**：把当前 active reel/CellSpin observer 映射到唯一 address manager；负责 listener/event-audio
  dispatch 顺序和 replacement/destroy 时 observer disposal。
- **EditorCore**：按 shared family/facet 显示渐进式选择器；不保存 Spin 业务状态，不解析 occurrence detail 生成候选。
- **Game Layout Editor**：沿用现有 Event audio project transaction、asset picker 和 exact start/end address validation；不创建 Spin
  事件或第二份 label/address 表。
- **资源生命周期**：observer 由具体 reel/CellSpin instance 拥有，package runtime 对 active/dormant/replaced/injected instance 的注册
  必须恰好一次并可幂等释放；destroy 后不得回调 address manager。
- **失败策略**：unknown address/family、无 main/Symbols capability、stale/destroyed spin、非法 target、observer/event listener failure
  继续显式失败；事件 listener 抛错发生在已提交 landing 后，不伪装成画面 rollback。
- **禁止行为**：轮询 snapshot 猜边界、用 Promise `.then()` 延迟派发、把 `isSpinning=false` 当成功落停、复用 grid-cell
  `completed`、热路径解析 wildcard、app 生成坐标地址或为音效硬编码列数/格数。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/reel/spin-lifecycle.ts
tasks/274-rendercore-spin-lifecycle-events-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/reel/{types,render-reel-set,render-grid-cell-reel-set,render-cell-spin}.ts
packages/rendercore/src/scene-layout/core/runtime-address-catalog.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/tests/reel/{render-reel-set,render-grid-cell-reel-set,render-cell-spin,grid-cell-immediate-stop}.test.ts
packages/rendercore/tests/scene-layout/{runtime-address,package-runtime}.test.ts
packages/rendercore/README.md

packages/editorcore/src/assets/ui/game-layout-event-dialog.ts
packages/editorcore/tests/adapters-and-ui.test.ts
packages/editorcore/README.md

apps/editordemo/tests/demo-project.test.ts
apps/gamelayouteditor/tests/event-audio-dialog.test.ts
apps/gamelayouteditor/README.md

docs/gamelayout-runtime-addresses.md
docs/agent-rules/{shared-game-runtime,editor-artifacts,scene-layout}.md
```

测试文件按实际最小覆盖点收敛；若 neutral observer 可完全封装在现有 reel 文件中，可不新增
`spin-lifecycle.ts`，但不得在三个 producer 各自复制 cohort/all-stopped 判定协议。

### 原则上不应修改

```text
packages/{logiccore,audiocore,gameframeworks,uiframeworks}/**
packages/rendercore/src/scene-layout/{manifest*,types,package-resource}.ts
apps/{game002v2,game003v2,gameviewer,gameviewer2}/**
assets/**
pnpm-lock.yaml
package.json
pnpm-workspace.yaml
AGENTS.md
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

若执行发现必须新增 manifest version、修改 event-audio schema、要求外部游戏配合转发 update result、支持计划外 glob/range 或修改
game app 才能形成正确事件，属于范围扩张，先停止并报告证据。

## 7. 实施步骤

1. **确认执行基线与事件矩阵**
   - 重核 HEAD/status、本计划、三份领域规则、当前 catalog/address grammar 和三类 spin 的 direct/session/continuous/
     selective/immediate/cancel 边界。
   - 用最小 standard、grid-cell、mixed-binding 与 no-main fixture 固定 exact/wildcard 地址矩阵、dispatch、owner 与 facets。
2. **建立 reel 层中性 lifecycle observer**
   - 定义 typed 整体 started/ended、单元 started/stopped/all-stopped 通知和 attach/dispose owner；只传 immutable reel id-independent
     coordinate/cohort 数据。
   - 在 RenderReelSet、RenderGridCellReelSet、RenderCellSpin 的 direct/session/full/selective/continuous start 与
     settle/immediate landing 处发布；单 tick 按稳定顺序，最后 stop 后再发 all-stopped。
   - cancel/reset/failure/destroy 不补 stopped/all-stopped；保留现有 update result、Promise、drain 和 animation completion 语义。
3. **扩展 shared Game Layout event catalog**
   - 在 `GameLayoutRuntimeEventFamily` 增加 `spin-lifecycle`，按 manifest 中实际可用 renderMode 去重加入 ReelSpin/grid-cell，
     并在 main + Symbols capability 下加入 CellSpin。
   - 按 main columns/rows 预编译 exact/wildcard entry 与 dispatchAddresses，使用 shared formatter生成 owner/facets/detail；保持稳定排序、
     重复地址和越界组合 fail-fast。
4. **接入 package runtime occurrence**
   - 对每个 package-owned reel entry、host-updated injected grid-cell reel 与每个 runtime-owned CellSpin session 安装 observer，
     将中性 edge 映射为 address manager `emit()`。
   - 在 replacement/dormant reactivation/session destroy/package destroy 清理或复用 exact observer，避免重复派发和 stale callback。
   - started 映射实际 exact 坐标；stopped 保证落点 drain/scene commit 先成立，再同步 emit，all-stopped 最后；用 mock audio 证明
     exact/wildcard 匹配次数和顺序。
5. **同步 Editor consumer**
   - EditorCore 增加 Spin family/facet label 与 progressive choice 测试；adapter 继续透传 RenderCore catalog。
   - Editordemo synthetic catalog 覆盖 family 展示和选择；Game Layout Editor 用真实 layout inspector 覆盖候选、默认 effect/once、
     confirm/export/reinspect 后 exact address 不丢失。
   - 不向 app project、UI session 或 manifest 增加 Spin-specific state。
6. **文档、规则与收尾**
   - 更新 RenderCore README 和 runtime address 文档，列出 canonical exact/wildcard 地址、dispatch、detail、all-stopped 与 cancel 语义。
   - 最小更新 shared runtime、editor artifact、scene-layout 规则：Spin family 来自 shared catalog，editor/app 只消费；all-stopped 不等待
     presentation completed。
   - 执行 L2 定向验收，完成必要人工检查并生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- ReelSpin 覆盖 full/direct/session/continuous 的逐轴 started/stopped、exact 与 `x=*` dispatch、单 tick 多轴、cancel/destroy 与重入。
- grid-cell 覆盖 full/selective/continuous/immediate 的逐格 started/stopped、四种坐标 scope 与 landing appear 延迟；all-stopped
  紧随最后 target landing，不等待 `completed=true`。
- CellSpin 覆盖 direct roll、start→settle、session 多格、并发、四种 scope、cancel/destroy；单格 cohort 依次得到 started、stopped、
  all-stopped。
- package runtime 覆盖 default standard/grid-cell、host-updated injected grid-cell、CellSpin overlay、reel replacement/destroy 和
  listener error after commit；不通过轮询 snapshot 或 fake `emit()` 绕过真实 producer。
- catalog 覆盖 standard/grid-cell/mixed/no-main、坐标上下界、exact/wildcard dispatch、binding 去重与 frozen output；原有 family 保持。
- Event audio 分别绑定 exact、wildcard 与 all-stopped，断言 exact 只命中对应单元、wildcard 命中范围内每次 start/stop、整组每轮一次；
  未解锁 once 仍沿用现有丢弃合同。
- Editor 测试从 shared catalog 选择新 family，不能只断言硬编码文本存在。

### 验收级别

`L2`。本任务增加 RenderCore public event family/address contract，并修改 reel 生命周期到 EditorCore、Editordemo、Game Layout Editor
的直接消费链；不改 schema、生成物、依赖或 lockfile，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel-set.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/reel/render-cell-spin.test.ts tests/reel/grid-cell-immediate-stop.test.ts tests/scene-layout/runtime-address.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
pnpm --filter editordemo exec vitest run tests/demo-project.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/event-audio-dialog.test.ts
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/editorcore --filter editordemo --filter gamelayouteditor typecheck
git diff --check
```

失败时先在对应 producer/catalog/dialog 的单文件测试中最小化复现，不扩大到根级 test/build/lint。

### 人工验收

- 在 Game Layout Editor 打开同时具有 standard/grid-cell binding 的合法项目，确认“编辑音乐音效”中只出现 shared catalog 声明的
  Spin 类型与生命周期，选择后保存、关闭、重开仍为同一 canonical address。
- 分别给 exact started、wildcard stopped 与 all-stopped 配置不同短音效，在本地 preview/harness 执行三类 Spin，确认指定轴开始、
  每轴/格停止和最后停止的听感顺序；浏览器音频须先经过现有 trusted unlock。
- 若当前 Game Layout Editor 本身没有 spin 驱动入口，第二项记录为未完成的真实 consumer 人工验收，不得用单测冒充浏览器听感。

### 独立验收建议

`建议`。涉及跨包 public event address、三套异步 spin cohort 和 host-updated ownership seam。独立复验重点是：

1. all-stopped 是否误用了 grid-cell `completed`；
2. injected reel、immediate stop 与 CellSpin destroy 是否漏发/重复发；
3. wildcard occurrence 是否保持 exact address，以及 Editor 是否只消费 shared catalog。

最多复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-grid-cell-reel-set.test.ts tests/reel/render-cell-spin.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置既有本地代理重试。
- 本任务不新增依赖、不修改 package importer 或 `pnpm-lock.yaml`。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、schema version 或生成文件，无生成器/checker。
- `packages/rendercore/README.md` 与 `docs/gamelayout-runtime-addresses.md` 记录 exact/wildcard address、dispatch、detail 和顺序。
- `packages/editorcore/README.md` 说明 Spin family 与其它 family 一样来自 shared catalog；
  `apps/gamelayouteditor/README.md` 只补 Event audio 可选择 Spin 生命周期，不复制地址全集。
- `docs/agent-rules/shared-game-runtime.md` 保存 producer/commit/all-stopped 稳定合同；`editor-artifacts.md` 保存 shared catalog
  consumer 边界；`scene-layout.md` 只补 Event audio 可消费该 family。根 `AGENTS.md` 不修改。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/274-rendercore-spin-lifecycle-events-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终地址/事件顺序、实际修改文件、计划偏差、验收命令与结果、未完成人工听感、剩余风险；不收集无关整仓
coverage、历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- grid-cell 的最后 landing 与既有 `completed` 不同；若错误复用会让 all-stopped 音效被 landing appear/暗层时长推迟。
- host-updated injected reel 不经过 package runtime update；observer 若只挂在外层会静默漏事件。
- direct ReelSpin/CellSpin 可并发不同单元；cohort 判定若只看单个 Promise 会过早或重复发布 all-stopped。
- wildcard metadata 若运行时解析或逐订阅扫描，会放大 reel update 热路径；必须预编译有限 dispatchAddresses。
- 同 tick 多个 started/stopped 会连续触发音效；AudioCore 仍按现有 voices/overflow 合同处理。
- event address 是新的 public contract；命名、owner、facets 一旦导出到 Layout eventAudio 后不能用 silent alias 修正。

### 假设

- ReelSpin 按 exact `x`/全部轴 author；grid-cell/CellSpin 按 exact cell、行、列、全部 cell author，采用现有 symbol wildcard 语义。
- “最后一个停下”指 target landing commit，不等待 landing appear、dimming 或其它 presentation completion。
- CellSpin 的 all-stopped 按每个独立 `RenderCellSpin` owner 的 active cohort计算；多个 overlay session 互不合并。
- 新 Spin family 默认 `effect + once` 符合现有 Game Layout Editor 非 mode-state 默认策略。

### 待确认

无。

## 13. 完成清单

- [x] 三类 producer 的 exact/wildcard started/stopped 与 all-stopped 目标、顺序和非目标均满足。
- [x] 三类 producer 的整体 started/ended 每个 cohort 各发布一次，取消或失败不伪造 ended。
- [x] canonical address、family、facets、detail 与 owner 合同符合计划。
- [x] host-updated、immediate、continuous、direct/session、cancel/destroy 边界已覆盖。
- [x] EditorCore、Editordemo、Game Layout Editor 均只消费 shared catalog。
- [x] 现有 event/audio/spin/drain/animation 行为未回归。
- [x] 文档与最小领域规则已同步。
- [x] 指定 L2 自动化验收通过，人工验收与未完成项明确区分。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划和三份列出的领域规则；
2. 核对 Git 基线、工作区和 current catalog/spin API 是否有新变化；
3. 按计划先固定事件矩阵与 committed edge，再实现 observer、catalog、runtime 和 editor consumer；
4. 小幅适配当前实现时在报告记录；涉及 schema、游戏 app、外部 host 转发或计划外 glob/range 时先停止说明；
5. 只运行计划规定的 L2 验收；
6. 完成后生成 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
