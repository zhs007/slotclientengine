# 281 editorcore-spin-wildcard-event-selection 任务计划

## 1. 目标与完成定义

### 目标

让 EditorCore Game Layout event 对话框把 shared catalog 已提供的 Spin 坐标范围明确呈现为可选择的业务语义，用户无需理解
`scope=all/axis/cell/column/row` 内部值即可选择具体轴、全部轴通配，或具体格、整列、整行、全局通配的
`started/stopped` 事件。最终保存的仍是 RenderCore catalog 中唯一的 canonical `gamelayout:/` address。

### 完成定义

- [ ] ReelSpin 的单元事件可明确选择具体 `x` 或全部轴 `x=*`，并分别选择 `started`、`stopped`。
- [ ] GridCell 与 CellSpin 的单元事件可明确选择具体 `x/y`、整列 `x/<x>/y/*`、整行 `x/*/y/<y>`、全局
      `x/*/y/*`，并分别选择 `started`、`stopped`。
- [ ] UI 在选择按钮、breadcrumb、结果摘要和已保存行中使用一致的可读标签，并显式展示 `*` 的含义；raw facet 值只作为
      catalog identity，不再是用户理解通配范围的唯一线索。
- [ ] 搜索 `通配符`、`全部轴`、`整列`、`整行`、`全部格` 或对应 `*` 表达时，能够投影到真实 catalog entry；搜索不会
      生成地址或增加 catalog 中不存在的候选。
- [ ] group dialog 与 single picker 都能完成上述选择并回传 exact immutable event item；取消、编辑、失效复验、行配置 lifecycle
      和其它 event family 的既有行为保持不变。
- [ ] Game Layout Editor 的正式 Event audio 对话框直接获得相同行为；自动测试至少完成 ReelSpin 全轴、GridCell 整列、
      CellSpin 全局三条代表性通配选择，并验证保存到 project draft 的 canonical start/end address。
- [ ] 不修改 RenderCore event family、facets、canonical address、dispatch 语义、Scene Layout schema 或 Game Layout Editor
      event-audio schema；完成定向自动测试、人工验收说明、README 与 UTC 执行报告。

## 2. 范围

### 包含

- `packages/editorcore` event dialog 对 Spin family/facet value 的上下文显示与搜索文本投影。
- 基于真实 RenderCore inspector catalog 的 ReelSpin、GridCell、CellSpin wildcard 选择、保存、编辑和 single picker DOM 回归测试。
- `apps/gamelayouteditor` 正式 Event audio consumer 对代表性 wildcard start/end 选择及 project draft 提交的回归测试。
- EditorCore README 中 Spin 范围选择方式和 canonical address 边界说明。
- 在 Game Layout Editor Event audio 对话框进行人工消费链验收，不在 app 内复制 selector 或地址表。

### 不包含

- 不新增 Spin event、`all-started`、cancelled/failed、范围表达式、坐标区间或任意 glob。
- 不改变 `all-stopped`、整体无坐标 `started/ended`、exact occurrence 或 wildcard dispatch 的 runtime 语义。
- 不修改 RenderCore catalog facet 顺序，不把 `*` 伪造为新的 draft value，也不解析 canonical address 来反推候选。
- 不新增手输 address/坐标、自动首选、silent alias、模糊坐标纠正或非法/越界 fallback。
- 不修改 Game Layout Editor production project/model、Event audio 持久结构、资源导入导出、production assets、其它 Editor 或游戏 app；
  只允许调整正式 consumer 的定向测试。
- 不顺带重构通用 event dialog、搜索算法、CSS 布局或拆分现有大测试文件，除非执行时出现直接阻断且先说明证据。

## 3. 制定计划时的基线

```text
UTC: 2026-09-01T06:40:56Z
HEAD: 2dd2c07125d7ab8d3e20b1d255ec2c6c69d1045b
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `docs/agent-rules/editor-artifacts.md`
- `tasks/274-rendercore-spin-lifecycle-events.md` 及其执行报告
- `tasks/278-editorcore-event-dialog-search.md`

目标目录下没有补充 `AGENTS.md`。任务 281 当前不存在；执行时保留届时出现的用户无关修改。

当前结论：

- `packages/rendercore/src/scene-layout/core/runtime-address-catalog.ts#addSpinLifecycleAddresses()` 已编译完整能力：ReelSpin 有
  exact axis 与 `x=*`；GridCell/CellSpin 有 exact cell、column、row、all 四种范围。该 catalog 是 runtime 与 editor 的唯一权威，
  本任务不需要扩展 RenderCore。
- catalog 用有序 facets 表达上述范围：ReelSpin 为 `scope=axis|all`，cell 类型为
  `scope=cell|column|row|all`；只有 exact 维度继续提供 `x/y` facet，通配的 `*` 保留在 descriptor canonical address 中。
- `packages/editorcore/src/assets/adapters/game-layout-events.ts#inspectEditorGameLayoutEventCatalog()` 原样透传 shared catalog，
  `validateEditorGameLayoutEventGroup()` 已按 exact address 严格复验，不是能力缺口。
- `packages/editorcore/src/assets/ui/game-layout-event-dialog.ts#renderNextFacet()`、breadcrumb、结果和 event row 当前直接显示 raw
  facet value。用户能点击 `all/column/row`，但 UI 没有解释它分别等于 `x=*`、`y=*` 或 `x=*,y=*`，因此通配能力不可发现。
- 同文件 `eventMatchesSearch()` 只索引 raw family/facet、facet key label 与 canonical address；中文 `通配符/全部轴/整列/整行/全部格`
  不是可搜索语义。
- `packages/editorcore/tests/adapters-and-ui.test.ts` 已断言 `x=*` catalog entry 存在，并覆盖整体
  `scope=spin/lifecycle=started`；但没有从 DOM 选择并保存 ReelSpin wildcard，也没有覆盖 GridCell/CellSpin 的四种坐标范围。
- `apps/gamelayouteditor/tests/event-audio-dialog.test.ts` 当前只选择无坐标的 ReelSpin 整体 `started`，不能证明用户可 author
  单元 wildcard。正式 app 复用 EditorCore mount API，不需要 app-local 生产代码修复，但需要 consumer 回归证明 start/end picker 与
  project draft 提交链没有过滤或改写 wildcard entry。

## 4. 需求解释与技术决策

### 需求解释

1. “每轴 started/stopped”指 ReelSpin 的单元 lifecycle；具体轴映射 catalog `scope=axis + x`，通配轴映射
   `scope=all` 对应的 canonical `x/*` entry。它不等于无坐标的整次 Spin `started/ended`。
2. “每格 started/stopped”同时适用于 legacy GridCell 和独立 CellSpin。具体坐标、列、行、全局分别映射
   `scope=cell/column/row/all`，未出现的维度就是该 catalog entry 已编译的 `*`，不是 UI 自行补造的坐标。
3. “支持通配符”包括可发现、可区分、可搜索、可选中和可保存；仅在结果地址中偶然出现 `*`，或只证明 catalog 中存在 entry，
   都不足以完成需求。
4. `all-stopped` 与整体 `started/ended` 继续作为同 family 的相邻 lifecycle 候选显示；本任务只改善标签，不改变它们与
   unit wildcard 的事件边界。
5. 当前 catalog 与 runtime 已满足能力，合理假设是修正 shared UI 即可让 Editordemo 和 Game Layout Editor 同步获得行为；该假设必须
   由 Game Layout Editor 的正式 Event audio consumer 测试验证。若测试证明 production consumer 过滤或改写了候选，属于新的直接证据，
   再按文件范围扩张规则处理。

### 关键决策

1. **以 catalog facet 为选择事实，以上下文 formatter 负责显示。**
   - 在 EditorCore event UI 内建立纯显示 helper，把 `spin`、`scope`、`lifecycle` 等 raw value 格式化为业务标签。
   - `scope=axis/cell/column/row/all` 根据当前 entry 的 `spin` facet显示“具体轴”“具体格”“整列（y=_）”“整行（x=_）”以及
     “全部轴（x=_）/全部格（x=_, y=*）”。
   - helper 只读 entry/facets，不拆分 `descriptor.address`，不改变 button `data-value`、selection draft 或保存值。
2. **同一 formatter 驱动所有可见位置与搜索。**
   - choice、breadcrumb、selected result、event row summary 使用相同值标签，避免选择时看到“全部格”而保存后只剩 `all`。
   - search index 加入 formatter 产生的显示文本及必要的通配表达，确保显示得到的术语就搜索得到；canonical address 仍继续可搜。
3. **保留渐进式 scope-first 交互。**
   - ReelSpin 先选具体轴/全部轴；具体轴再选 `x`，全部轴直接进入 lifecycle。
   - GridCell/CellSpin 先选具体格/整列/整行/全部格；只继续询问该 scope 所需的 exact `x/y`，不要求用户为通配维度重复选择 `*`。
   - 这与 catalog 现有 facet 顺序一致，也避免创建一份 UI-only 坐标组合表。
4. **用 exact address 证明真正选中了 wildcard。**
   - DOM 测试通过用户可见选择路径完成保存，再断言 callback 的 descriptor address 等于 shared catalog 中对应 `x/*` 或
     `x/*/y/*` entry；不直接调用 adapter helper冒充 UI 验收。
   - group 和 single picker 复用同一 selector；EditorCore 覆盖完整共享矩阵，Game Layout Editor 只覆盖代表性正式消费路径，
     不复制完整矩阵或地址生成逻辑。
5. **不改 public contract。**
   - `EditorGameLayoutEventItem/Group`、mount options、configuration adapter、RenderCore entry 类型和 consumer callback 均保持不变。
   - 本任务是 EditorCore 内部 DOM 呈现与回归保护，不需要 schema/version、生成器或迁移。

## 5. 职责与合同

- **RenderCore catalog**：继续拥有 Spin family、ordered facets、canonical address、exact/wildcard dispatch 与坐标有效范围。
- **EditorCore adapter**：继续从 committed Game Layout exact closure 获取 frozen catalog，并按 exact address 验证 item；不规范化 scope。
- **EditorCore UI**：拥有 session selection、catalog facet 的人类可读投影、搜索索引和 DOM lifecycle；不拥有 Spin runtime 语义表或地址生成。
- **Host consumer**：继续拥有 project、row configuration、asset picker 与整组提交；Editordemo/Game Layout Editor 不增加本地 wildcard 分支。
- **数据/API**：保存只返回 catalog entry 的 immutable `address + descriptor`；显示 label、query 和 breadcrumb 都是 session-only。
- **生命周期**：add/edit/cancel/open/close/setValue/destroy 与 configuration adapter mount/dispose 顺序保持不变；格式化不持有资源或异步状态。
- **失败策略**：未知 family/facet/value 继续显示 raw value；无法唯一命中 catalog entry 时禁止保存；stale exact address 继续阻止整组确认。
- **禁止行为**：解析 address 推导坐标、UI 自造 wildcard entry、自动把 unknown scope 当 all、隐藏 raw identity 导致 callback 改值、consumer
  维护第二份 Spin scope 表。

## 6. 文件范围

### 预计新增

```text
tasks/281-editorcore-spin-wildcard-event-selection-<utctime>.md
```

### 预计修改

```text
packages/editorcore/src/assets/ui/game-layout-event-dialog.ts
packages/editorcore/tests/adapters-and-ui.test.ts
packages/editorcore/README.md
apps/gamelayouteditor/tests/event-audio-dialog.test.ts
```

若现有 DOM 结构无法在不影响布局的情况下清楚呈现 raw value 与业务标签，可最小修改
`packages/editorcore/src/assets/ui/assets-view.css`；执行报告必须说明触发证据，不借机调整其它 Assets UI。

### 原则上不应修改

```text
packages/editorcore/src/assets/{adapters,core,data}/**
packages/rendercore/**
apps/editordemo/**
apps/gamelayouteditor/src/**
docs/agent-rules/**
assets/**
package.json
pnpm-lock.yaml
AGENTS.md
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

若执行发现必须改变 RenderCore facets/address、Scene Layout schema、EditorCore public API 或正式 app 的候选过滤，先记录最小复现并
说明范围扩张原因，不能通过 app-local address 常量或计划外 fallback 绕过。

## 7. 实施步骤

1. **确认执行基线与失败用例**
   - 重核 HEAD/status、任务 274/278 合同、领域规则和 shared catalog 的三类 Spin entry 矩阵。
   - 在现有真实 Game Layout ZIP fixture 上添加 DOM 失败测试，固定当前 raw `all/column/row` 不足以表达 wildcard，以及选择保存
     callback 必须得到 catalog exact address。
2. **建立 catalog-driven facet value formatter**
   - 在 `game-layout-event-dialog.ts` 增加无状态 helper，输入 entry/facet/当前候选上下文，输出 Spin 类型、scope、lifecycle 的
     可读标签；未知值保持 raw fallback。
   - ReelSpin 与 cell 类型的 `scope=all` 只根据 `spin` facet 区分“全部轴/全部格”；column/row 明示被通配的维度。
   - 不改变 `ProgressiveSelection` 保存的 raw key/value，不修改 adapter 或 descriptor。
3. **统一接入选择、摘要与搜索**
   - 将 formatter 用于下一 facet choice、breadcrumb、选择完成详情与已保存 event row；保留 canonical address 可见和复制能力。
   - `eventMatchesSearch()` 索引同一显示标签与通配表达，使中文范围词和 `*` 能找到真实 entry；过滤、计数、唯一选择仍基于原 entry。
   - 检查 query 保留/清空、edit truncate、configuration mount、single selection 自动确认和 stale row 行为不受影响。
4. **补齐 Spin wildcard DOM 矩阵**
   - ReelSpin 覆盖 exact axis 与 `x=*` 的 `started/stopped`。
   - GridCell、CellSpin 各覆盖 exact cell、column、row、all；至少对每种 scope 证明 `started/stopped` 都是可到达候选，并对保存路径
     断言 canonical address 中 exact/`*` 位置正确。
   - 覆盖可见中文标签、breadcrumb/row summary、`通配符/整列/整行/全部格` 搜索、group dialog 与 single picker；不复制 catalog
     生成逻辑到测试 helper。
5. **验证 Game Layout Editor 正式 consumer**
   - 扩展 `apps/gamelayouteditor/tests/event-audio-dialog.test.ts`，通过真实 `mountProjectEventAudioDialog()`、workspace inspector 和
     EditorCore selector 选择 ReelSpin `x=*`、GridCell column、CellSpin all 的代表性 started/stopped address。
   - 至少完成一组 start/end row 保存与 dialog confirm，断言 project draft 保留 exact canonical address、默认 audio 配置和已有资源引用；
     不直接注入 callback value、不在 fixture 复制 app-local wildcard 表。
   - 若现有 fixture 只暴露 standard 或 grid-cell 之一，使用最小的两份 canonical project fixture 分别证明能力，不修改 production model。
6. **文档、验收与报告**
   - 更新 EditorCore README，说明 scope-first 选择与各 wildcard 地址的映射、搜索术语和 catalog-only 保存边界。
   - 运行 L2 定向验收，在正式 Game Layout Editor 做一次 Event audio 人工选择检查，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 使用 `inspectEditorGameLayoutEventCatalog()` 从现有 self-contained ZIP fixture 得到候选；测试只按 facets 查找期望 entry，不手写另一份
  完整业务候选表。
- 对每种 scope 同时验证“UI 路径可达”和“最终 address exact”，防止只改善文案却仍无法保存 wildcard。
- `started/stopped` 均需覆盖；`all-stopped` 与整体 `started/ended` 只做回归，不能用它们代替单元 wildcard 测试。
- group 与 single picker 共用 mount 实现，重点覆盖一次完整 group matrix 和 representative single wildcard，不重复整套相同断言。
- Game Layout Editor consumer 测试必须从正式 workspace inspector 取得 entry 并经真实 start/end picker 提交；不能只断言 shared dialog 文本，
  也不能手工构造最终 `eventAudio` draft 冒充 UI 路径。
- 原有 Symbol、Popup、mode 等 family 的 raw fallback、搜索、编辑/删除、失效复验和 configuration adapter 测试继续通过。

### 验收级别

`L2`：EditorCore 内部 DOM 显示/search 投影不改变 public API，但用户明确要求 Game Layout Editor 也正确，且正式 Event audio consumer
可能在 configuration/project commit 链过滤或改写选中项，因此加入直接 consumer 自动验收。仍不修改 RenderCore catalog、schema、生成物、
依赖或 lockfile，也不扩展到其它 app 或整仓验收。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/editorcore typecheck
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor exec vitest run tests/event-audio-dialog.test.ts
pnpm exec prettier --check packages/editorcore/src/assets/ui/game-layout-event-dialog.ts packages/editorcore/tests/adapters-and-ui.test.ts packages/editorcore/README.md apps/gamelayouteditor/tests/event-audio-dialog.test.ts tasks/281-editorcore-spin-wildcard-event-selection.md
git diff --check
```

若实际修改 `assets-view.css`，将其加入第四条命令。验收失败先最小化到目标 DOM case，不升级为根级 typecheck/test/build。

### 人工验收

1. 在 Game Layout Editor 导入/打开能产生 ReelSpin 的 standard Layout，在 Event audio 的 start/end picker 中分别选择具体轴与
   “全部轴（x=*）”的 `started/stopped`，确认结果区和已保存行显示一致且 canonical address 正确。
2. 在 grid-cell Layout 中分别选择 GridCell 与 CellSpin 的具体格、整列、整行、全部格 `started/stopped`；确认通配维度明确可见，
   不会与无坐标整体 `started/ended` 或 `all-stopped` 混淆。
3. 搜索 `通配符`、`整列`、`整行`、`全部格`，确认只出现能到达真实 catalog entry 的分支；取消、重开、修改已有 wildcard、窄窗口滚动
   均可操作，控制台无错误。

### 独立验收建议

`建议`。不涉及跨包 public contract、credential、资源 ownership、schema、ZIP 或生成物，但这是共享 dialog 与正式 consumer 的用户
可发现性修正，建议独立抽查 ReelSpin `x=*`、GridCell column、CellSpin all 三条路径，并复验：

```bash
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/event-audio-dialog.test.ts
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 复用现有 TypeScript、原生 DOM 与 Vitest/happy-dom，不新增依赖、不升级 package、不修改 lockfile。

## 10. 生成物、文档与规则

- 本任务无 YAML、manifest、schema 或生成 TypeScript 变化，不运行生成器；`dist` 只由 package build 验证，不手改、不提交缓存。
- 更新 `packages/editorcore/README.md` 的 event dialog 说明，明确 scope-first UI、三类 Spin wildcard 选择和搜索展示文本；不复制完整
  catalog 清单。
- `docs/agent-rules/editor-artifacts.md` 已明确 Spin family 的 reel/spin/scope/x/y/lifecycle 必须来自 shared catalog，本任务不改变稳定
  职责边界，原则上不更新领域规则或根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/281-editorcore-spin-wildcard-event-selection-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终 UI 行为、实际修改文件、计划偏差、自动化命令结果、未完成人工验收及剩余风险；不收集整仓 coverage、完整历史
矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- `scope=all` 同时覆盖 unit wildcard 与 `all-stopped` 相邻候选；标签必须依赖完整 entry/lifecycle 上下文，避免把无坐标组完成事件描述成
  某个虚假坐标 occurrence。
- 搜索一个范围词可能命中同一 Spin 类型下 started、stopped、all-stopped 多个 entry；UI 仍应要求用户完成 lifecycle 选择，不能因唯一
  显示词自动保存。
- 当前 EditorCore event DOM 测试集中在单文件，新增矩阵需使用 table-driven helper 控制重复和运行时间，同时不能隐藏真实点击路径。
- happy-dom 能证明 DOM 状态与 callback，不能替代正式浏览器中按钮密度、滚动、焦点和中文标签可读性检查。

### 假设

- RenderCore task 274 的 canonical address/facet 合同保持不变，三类 Spin wildcard entry 已在目标 Layout capability 下完整出现。
- “轮子轴”解释为 ReelSpin 的 `x` 轴；GridCell/CellSpin 的列、行与格坐标仍使用 catalog 的 `x/y` 定义。
- 用户要求的是 EditorCore shared selector 的 authoring 能力，不要求新增 runtime 事件或改变 Event audio 播放策略。
- raw catalog value 继续保留为 DOM `data-value` 与内部 selection identity；用户可见文案可以本地化，但不得改变保存结果。

### 待确认

无。若执行发现用户期望任意坐标 pattern、范围或多选 wildcard，而不是 catalog 已定义的 exact/axis/column/row/all，属于新需求，需另行确认。
