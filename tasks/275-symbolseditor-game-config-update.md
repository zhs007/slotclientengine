# 275 symbolseditor-game-config-update 任务计划

## 1. 目标与完成定义

### 目标

为 `apps/symbolseditor` 增加项目内更新公开 `gameconfig.json` 的能力。用户建立或导入 Symbols
项目后，可在“项目配置”页选择一份新的 game config，先查看 exact symbol 对账摘要，再原子替换项目的
`rawGameConfig`；已有同名 symbol 的全部 authoring 配置继续保留，新增和删除项按明确规则同步，下一次
预览、导出和重导均使用新配置。

### 完成定义

- [ ] “项目配置”页显示当前 game config 来源，并提供独立的“更新 gameconfig.json”文件入口；它不要求
      用户通过“新建（game config）”重置整个项目。
- [ ] 新 JSON 先通过现有 RenderCore/LogicCore strict game config parser；坏 JSON、坏 schema、code/paytable/
      reel 不一致或其它非法输入显式失败，当前项目、UI session 和预览保持不变。
- [ ] 更新按 exact symbol name 对账：同名项保留 state、resource、value、ImgNumber、cascade、include、scale
      和 priority，只采用新 numeric code；新增项建立当前标准的 explicit-empty 草稿；删除项不保留隐藏
      manifest 草稿；rename 不猜测为同一 symbol。
- [ ] 提交前向用户列出保留、新增、删除和 code 变化；用户取消时零修改，确认且项目 revision 未变化时
      一次提交新 config、filename 和 symbol map。
- [ ] 项目 id、cellSize、状态定义、asset library、dependency library 和未受影响 symbol 配置保持不变；被删
      symbol 原来使用的资源变成普通未引用资源，不自动删除 bytes，也不进入无引用的导出闭包。
- [ ] 导出 ZIP 的唯一公开 `gameconfig.json` 精确来自更新后的配置；`symbols.package.json`、inner v3 manifest、
      assets map/exact closure 仍由现有正式路径生成并可重新导入。
- [ ] model、DOM 和 ZIP round-trip 测试及 README/领域规则覆盖该工作流，并完成真实浏览器人工验收。

## 2. 范围

### 包含

- Symbols Editor 项目模型中的 game config update prepare/reconcile 合同和结构化结果摘要。
- “项目配置”页的更新按钮、JSON file input、确认文案、revision 防陈旧提交、成功/失败反馈。
- exact symbol 集合与 numeric code 更新后，当前选择、Picker、value preview 等 UI session 的现有 normalize
  行为回归。
- 更新后 preview/export/reimport 使用新 config 的定向测试。
- `apps/symbolseditor/README.md` 与 `docs/agent-rules/editor-artifacts.md` 的最小工作流说明。

### 不包含

- 不在浏览器内编辑 paytable、symbolCodes、reels 或任意 game config JSON 字段；本任务只替换一份由外部
  工具生成并 strict 校验的完整 JSON。
- 不修改 `apps/gengameconfig`、Excel 输入、production `assets/gamecfg002|003` 或任何游戏配置生成物。
- 不改变 Symbols package v1、inner symbol manifest v3、assets map、content addressing 或 ZIP closure schema。
- 不按 numeric code、paytable 顺序、文件名或相似名称推断 symbol rename，也不提供 rename mapping UI。
- 不为被删除 symbol 建 tombstone、隐藏草稿或第二份 symbol 表；不自动 GC 其原资源和 dependency。
- 不把新 game config 的文件名改成 project id，也不因文件名变化自动改 project id。
- 不修改 RenderCore/LogicCore parser 或 Gamelayout Editor consumer；现有 shared strict contract 已足够。
- 不新增依赖、不修改 `package.json`、workspace 配置或 `pnpm-lock.yaml`。

## 3. 制定计划时的基线

```text
UTC: 2026-08-31T07:14:14Z
HEAD: 686c10936bc4bc63a86f9ca16c5c62bf9d88691b
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `tasks/100-symbols-editor-bootstrap.md`
- `tasks/273-editor-legacy-audio-authoring-removal.md`
- `docs/agent-rules/editor-artifacts.md`
- `apps/symbolseditor/README.md`

`apps/symbolseditor` 与 `packages/rendercore` 目标目录下没有补充 `AGENTS.md`。

当前结论：

- `apps/symbolseditor/src/ui/workspace-app.ts#shellMarkup()` 只有 toolbar 的“新建（game config）”及
  `data-new-input`；`#createProject()` 会调用 `createFromGameConfig()` 并完整 `store.replace()`，没有保留
  当前项目内容的 update 入口。
- 同文件 `projectWorkspaceMarkup()` 已拥有“项目配置”页和只读 Game config 文件名摘要，是新增更新入口的
  合适位置；`bindProjectControls()` 已集中绑定该页命令。
- `apps/symbolseditor/src/model/editor-project.ts#SymbolEditorProject` 以 `rawGameConfig` 保存唯一 config，以
  `gameConfigFileName` 保存 UI 来源名，以 `Map<string, EditorSymbolDraft>` 保存 authoring state。
- `createFromGameConfig()` 已定义新增 symbol 的 canonical blank：`included=true`、`scale=1`、
  `renderPriority=0`、只有 explicit transparent `normal`，尺寸取项目 cellSize；可提取复用而无需新 schema。
- `parseSymbolPackageGameConfig()` 通过 LogicCore strict parser 读取 config，并按 numeric code 返回
  `{code,symbol}`；`validateSymbolPackageGameConfig()` 已在 export 时交叉验证 included manifest symbols。
- `exportSnapshot()` 固定声明 `entrypoints.gameConfig="gameconfig.json"` 并复制当前 `rawGameConfig`；
  `exportSymbolPackageZip()` 再经 mapped package materialize 与 production resource validation。因此更新项目
  model 后不需要另写 ZIP 序列化路径。
- `SymbolEditorStore#replace/transact()` 都基于 clone 和 revision 通知；但 `transact()` 允许项目暂时存在
  diagnostics，因此 game config update 不能错误地要求当前全部 symbol/resource 已可导出。
- `SymbolsEditorUiSession#normalize()` 已能在 selected symbol 被删除时按 code 选择新的 exact 项、关闭失效
  Picker并清理失效 value preview；新流程应复用并测试，不另存 reconciliation session。

## 4. 需求解释与技术决策

### 需求解释

- “更新 gameconfig.json”解释为在不重建 Symbols 项目的前提下，选择一份完整的新公开 game config 替换
  当前项目 config，而不是在 Editor 内提供 JSON 文本编辑器。
- “可以放在项目里”解释为入口放在现有“项目配置”workspace 内，与 package id、cellSize 和项目状态同属
  project-level 操作；toolbar 的“新建”仍保持创建新项目语义。
- 更新必须覆盖 config 中不仅是 symbolCodes，也包括 paytable、reels 和其它 LogicCore 接受的公开字段；
  Editor 不拆字段合并，避免形成部分新、部分旧的第二份 config。
- symbol authoring identity 使用 exact symbol string。numeric code 是新 game config 派生值，可以更新；同名才
  能证明是同一草稿，code 相同但名称变化不能证明 rename。

### 关键决策

1. **以 candidate + summary 建模两阶段更新。**
   - 在 model 提供类似 `prepareGameConfigUpdate(project, input)` 的纯 prepare helper，先 parse 新 config、clone
     项目并完成 exact reconcile，返回冻结的 candidate 与结构化 `kept/added/removed/codeChanged` 摘要。
   - UI 在确认前不写 store；确认后还需核对读取开始时的 store revision，防止慢文件读取/确认覆盖期间的
     新编辑。
2. **同名保留，新项使用 canonical blank，删除不猜迁移。**
   - 同名 draft 复制原配置，只把 readonly `code` 更新为新值；这保留全部 typed binding 与资源 identity。
   - 新项用当前 `project.cellSize` 创建 explicit-empty normal，默认 included；这与首次创建项目行为一致，且
     不以 placeholder 或缺资源掩盖错误。
   - 旧名不在新 config 时从 candidate symbol map 删除；同 code 新名称按 remove + add 显示，不搬运配置。
3. **保留 library bytes，不保留已删除业务草稿。**
   - asset records、upload batches 和 image-string dependency library 原样保留；删除 symbol 后只改变 typed
     references，资源可供用户重新绑定，导出仍由 manifest exact closure 排除未引用内容。
   - 不在更新时自动 GC，避免一次 config 误选导致不可恢复的本地资源丢失。
4. **不把完整 export readiness 当作 update gate。**
   - 新 config 自身必须 strict parse；reconcile 后 symbol keys/code 必须与 parser 结果精确一致。
   - 当前项目可以因尚未配完资源而保留 diagnostics；更新成功后由现有 `getProjectDiagnostics()`、preview 和
     export gate 基于 candidate 重新计算，不能因无关的未完成 state 阻止 config 更新。
5. **来源名与 artifact 名分离。**
   - 成功提交后 `gameConfigFileName` 更新为用户所选文件名，供项目页展示；project id 不变化。
   - ZIP 内仍由现有 contract canonicalize 为 `gameconfig.json`，不把本地文件名带入 package path。

## 5. 职责与合同

- **LogicCore/RenderCore**：继续拥有完整 game config strict parse、symbol code 查询、paytable/reel 一致性和
  Symbols package config/manifest 交叉验证；本任务只调用现有 public editor export。
- **Symbols Editor model**：拥有 config update candidate、exact symbol reconcile 与结构化摘要；不得在 UI
  复制 symbol diff 算法。
- **Symbols Editor UI**：拥有文件读取、JSON parse 错误呈现、确认/取消、revision guard、store commit 和用户
  反馈；不直接逐字段 mutate symbol map。
- **数据合同**：输入为单个 JSON 文件；输出 candidate 的 `rawGameConfig` 是完整 clone，symbol map 的 key/
  `draft.symbol`/`draft.code` 与新 config exact 一致，其余 project-owned state保持。
- **事务边界**：prepare 或确认前失败零修改；取消零修改；revision 变化显式要求用户基于最新项目重试；
  成功时用一次 `store.replace(candidate)` 提交并触发一次 diagnostics/preview rebuild。
- **资源生命周期**：更新不新建 Object URL，不删除 asset bytes；preview 的旧异步 request 仍由现有 revision/
  request guard 失效，重新基于 committed snapshot prepare。
- **失败策略**：空文件、坏 UTF-8/JSON、invalid schema、重复/非法 code、未知 reel symbol、空或无法形成可用
  display set、candidate identity mismatch 均显式失败；不得退回旧 config 后显示成功。
- **禁止行为**：partial merge、filename/numeric-code rename guess、silent draft drop、自动改 project id、隐藏
  tombstone、自动资源 GC、跳过 strict parser，或在 app 维护第二套 game config validator。

## 6. 文件范围

### 预计新增

```text
tasks/275-symbolseditor-game-config-update-<utctime>.md
```

### 预计修改

```text
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/tests/editor-project.test.ts
apps/symbolseditor/tests/app-shell.test.ts
apps/symbolseditor/tests/zip-io.test.ts
apps/symbolseditor/README.md
docs/agent-rules/editor-artifacts.md
```

若新增控件无法复用现有 `.project-config`、`.form-row`、button 与 feedback 样式，才最小修改：

```text
apps/symbolseditor/src/styles.css
```

### 原则上不应修改

```text
packages/{logiccore,rendercore,editorcore,editorresource,browserartifactio}/**
apps/{gengameconfig,gamelayouteditor,game002v2,game003v2}/**
assets/**
apps/symbolseditor/package.json
pnpm-lock.yaml
AGENTS.md
docs/agent-rules/shared-game-runtime.md
```

执行时若发现必须改变 shared parser/schema、Symbols ZIP version、consumer API、dependency 或 lockfile 才能
更新 config，属于明显范围扩张，必须停止并说明证据，不能通过修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线与 fixture 矩阵**
   - 重核 HEAD/status、本计划、`editor-artifacts.md` 与目标 app README。
   - 固定四类 config fixture：只改 reels/paytable、同名改 code、增加/删除 symbol、同 code rename；记录现有
     draft、library 和导出结果作为前置断言。
2. **实现 model prepare/reconcile 合同**
   - 在 `editor-project.ts` 增加结构化 summary/candidate 类型与纯 helper；首先调用
     `parseSymbolPackageGameConfig()`，不得只读取 raw `symbolCodes`。
   - 以新 parser 顺序重建 symbol map：exact 同名 clone 并更新 code，新名称调用 canonical blank factory，旧
     名称只进入 removed summary；替换 raw config 与 UI source filename。
   - 保持 id、cellSize、stateDefinitions、legacy settings、asset library、image-string dependencies 和 upload
     counter，复验 candidate symbol identity 后冻结摘要返回。
3. **接入项目配置页**
   - 在 shell 增加仅接收单个 JSON 的 hidden update input；项目页显示当前来源、symbol 数量及更新按钮，
     `bindProjectControls()` 只负责触发输入。
   - change handler 捕获当前 revision/project，读取并 JSON.parse，调用 prepare helper；确认文案列出新文件名、
     kept/added/removed/code changed exact 清单，并明确 removed 配置将删除但资源保留。
   - 用户确认后重新核对 revision，再一次 `store.replace(candidate)`；调用现有 session normalize/render/preview
     链路，反馈成功摘要。取消、非法输入或 stale revision 保留当前 workspace 与项目。
4. **保护 authoring state 与 UI session**
   - model 测试证明同名 symbol 的 nested state/composite/value/ImgNumber/cascade 与 include/scale/priority 保持，
     只改变 code；project/library/dependency object content 不丢失。
   - 证明新增 symbol 使用当前 cellSize explicit empty，删除/rename 不猜迁移，unused bytes 仍在 library，按 code
     排序的列表/preview 与 selected symbol/picker/value session 自动规范化。
5. **保护 ZIP 与 strict failure**
   - DOM 测试覆盖项目页入口、摘要确认、取消、invalid JSON/schema、stale revision、成功反馈以及 toolbar
     新建行为不变。
   - ZIP 测试执行 update → export → extract/reimport，断言 canonical `gameconfig.json` 是新完整配置，manifest
     只含新 exact included symbols，未引用旧资源不进入 ZIP，现存有效绑定仍在 exact closure。
   - 增加 failure assertions，证明错误更新不改变 revision、原 config、symbols、selection 或 preview resource。
6. **文档与收尾**
   - README 记录“新建”与“项目配置 → 更新”的区别、exact reconcile/确认规则和 canonical ZIP 文件名。
   - 在 `editor-artifacts.md` 的 Symbols Editor 小节补充稳定职责：完整 config 原子替换、exact name 保留、
     rename 不推断、资源不自动 GC。
   - 执行 L1 定向验收、人工浏览器流程并生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 正常路径至少覆盖 config 其它字段变化而 symbol set 不变、same-name code change、add、remove、rename 与其
  组合；断言 summary 和 committed candidate 一致。
- 使用带真实 nested visual/value/ImgNumber/cascade draft 的 symbol 证明 preserve，而不是只检查 symbol 数量。
- 删除项资源既要断言仍留在 editor asset library，也要断言无其它 manifest owner 时不进入导出 ZIP；共享
  资源仍被其它 symbol 引用时必须继续导出一次。
- strict failure 覆盖 JSON syntax 与 parser-level schema/invariant；不能用 UI accept 属性代替解析测试。
- cancellation/stale revision 必须断言 store revision 不增加；成功提交只增加一次，不出现 prepare 半提交。
- 不为新功能放宽 `validateSymbolPackageGameConfig()`、export readiness、exact closure 或 package reimport。

### 验收级别

`L1`。改动限于 `apps/symbolseditor` 的 project model/UI/测试及说明文档，不改变 shared public API、schema、
生成器、依赖或 lockfile。ZIP round-trip 是该 app 现有正式导出路径的定向行为测试，不构成跨包 schema 修改。

### 执行会话必须运行

```bash
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor test
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor build
pnpm --filter symbolseditor format:check
git diff --check
```

如失败，先运行对应单个 Vitest 文件/用例最小化复现；不得立即升级到根级全仓命令。

### 人工验收

在真实浏览器启动 Symbols Editor：

1. 新建项目，给一个 symbol 配置资源/state/value 后，在“项目配置”更新为含同名改 code、新增、删除的合法
   config；核对确认摘要、保留配置、新空 symbol、资源库 unused 状态和预览。
2. 分别取消一次更新、选择一份非法 JSON、并在文件读取期间编辑项目；确认三种情况都不覆盖当前项目。
3. 导出 ZIP 后重新打开，核对唯一 `gameconfig.json`、新 symbol/code/reels 与已有 exact binding 均生效。

### 独立验收建议

`建议`。不涉及跨包 public contract、credential、服务器数据、异步 resource owner 或新 schema；但删除 symbol
草稿属于用户可见的破坏性 reconcile，建议独立复核 exact-name rename 非推断、取消/stale 零提交和删除资源
不自动 GC。复验命令最多使用：

```bash
pnpm --filter symbolseditor test
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor build
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm。shell 未加载 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不新增依赖。若现有依赖缺失，使用：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置 `http_proxy`/`https_proxy` 为 `http://127.0.0.1:1087` 并重试原命令。
- 若 pnpm 试图修改 lockfile，停止并查明环境或依赖状态；本任务不接受 lockfile 漂移。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、schema version 或代码生成物，不运行无关生成器。
- Symbols ZIP 继续只由 `exportSymbolPackageZip()` 和 mapped package materializer 生成；测试不得手改产物来
  冒充更新成功。
- 更新 `apps/symbolseditor/README.md`，说明入口、两阶段确认、exact reconcile 和 ZIP 行为。
- 更新 `docs/agent-rules/editor-artifacts.md` 的最小稳定规则；不把具体按钮文案、测试 fixture 或任务证据写入
  根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/275-symbolseditor-game-config-update-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现、实际文件、reconcile 决策、计划偏差、六条定向验收结果、人工验收和剩余风险；
不收集无关 coverage、全仓测试矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 用户误选 config 可能删除已配置 symbol 草稿；通过 exact diff、明确确认和取消零提交降低风险，但 Editor
  没有持久 undo，确认后的草稿删除只能靠重新导入旧 ZIP 恢复。
- 新 config code/order 变化会改变 symbol 列表和 preview 顺序；这是权威 config 更新的预期结果，不能保留
  旧 order 作为隐藏副本。
- 资源库保留已删除 symbol 的 bytes 会增加当前 session 内存，但自动删除会造成更高的数据丢失风险；正式
  ZIP exact closure不会携带无引用资源。
- 当前项目本身可能已有未完成配置；update 应保留并重新报告这些 diagnostics，不能把它们误归因于新 config，
  也不能因此跳过新 config strict parse。

### 假设

- 更新输入仍是单个完整公开 game config JSON，与首次新建接受的 contract 相同。
- exact symbol string 是唯一可无歧义保留 authoring state 的 identity；numeric code 可变，不承担 rename identity。
- 用户希望保留项目内已导入资源，因此删除 symbol 时只删 typed draft，不自动删除 library bytes。
- 更新后的 project id 与 cellSize 仍由项目页独立管理，不从新文件名或 config 内容派生。

### 待确认

无。入口位置、唯一 config/ZIP 合同、strict parser、blank symbol 默认值和资源闭包行为都可从当前仓库确认；
rename mapping 或 browser 内字段编辑若后续需要，应另立任务。

## 13. 完成清单

- [ ] 项目页更新入口、目标和非目标已满足。
- [ ] exact reconcile、确认、revision guard 与原子提交符合计划。
- [ ] project-owned state、resource library 和 existing symbol authoring 按合同保留。
- [ ] strict failure、preview、export 与 reimport 测试已覆盖。
- [ ] README 和 editor artifact 规则已同步。
- [ ] 六条 L1 自动化验收已通过，人工验收结果已记录。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md`、本计划和 Symbols Editor README；
2. 核对 Git 基线与工作区，保留所有用户无关修改；
3. 按 pure prepare → user confirm → revision guard → single commit 实现，不重新设计 partial merge；
4. 复用 RenderCore strict parser、canonical blank 和现有 export/materialize 路径；
5. 小幅适配当前代码时在报告记录，shared API/schema/lockfile 范围扩张时先停止说明；
6. 只运行计划规定的 L1 验收与真实浏览器人工流程；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
