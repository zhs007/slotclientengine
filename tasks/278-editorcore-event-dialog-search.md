# 278 editorcore-event-dialog-search 任务计划

## 1. 目标与完成定义

### 目标

为 `packages/editorcore` 的 Game Layout event 新增/选择对话框增加全 catalog 筛选检索。用户进入“添加 Event”或
单 Event picker 后输入 `spin`，选择器只显示检索文本相关的 Event family 和后续候选，不相关分支不再显示；清空
检索后恢复完整 catalog。检索继续服从 RenderCore 提供的 typed event catalog，不解析或拼造第二份 event 地址表。

### 完成定义

- [ ] 添加或选择 Event 时始终有明确的检索输入框，不再仅在某一 facet 候选超过 8 项时才出现局部筛选。
- [ ] 检索采用去除首尾空白、大小写不敏感的包含匹配；`spin` 能匹配 raw family `spin-lifecycle` 和展示文案
      `Spin 生命周期`，并隐藏 Symbol、Popup、mode 等无关 family。
- [ ] family raw id/展示文案、facet raw key/展示文案、facet value 和 canonical address 都可被检索；命中深层
      facet/address 时，其祖先 family 和当前层分支仍可逐级进入，但不显示无法到达任何命中 Event 的 sibling。
- [ ] family 数量、当前 facet 候选和“后续”计数都基于检索后的 catalog entry；无匹配时显示明确空状态，不能
      默认选择首项、保留不可见候选或生成 raw address。
- [ ] 检索只影响 row editor 的候选投影，不修改 catalog、已确认 group、row configuration 或当前 host value；
      清空检索可无损恢复候选，取消/关闭/重开遵守现有 draft 生命周期。
- [ ] group dialog 与复用同一实现的 `mountEditorGameLayoutEventPickerDialog()` 行为一致；新增、编辑、保存、取消、
      duplicate validation、Layout replacement revalidation 和 destroy 行为保持不变。
- [ ] EditorCore 定向测试、README、浏览器人工验收和 UTC 中文执行报告完成。

## 2. 范围

### 包含

- `game-layout-event-dialog.ts` 中检索 session state、catalog entry 匹配、渐进式候选投影、计数、空状态和输入焦点。
- event dialog/picker 共用 DOM 的检索框文案、可访问名称与必要样式。
- EditorCore DOM 测试，覆盖 family、深层 facet/address、大小写/空白、无结果、清空恢复和 picker 复用。
- `packages/editorcore/README.md` 对 event selector 检索语义的最小更新。

### 不包含

- 不修改 RenderCore event catalog compiler、family/facet/address schema、dispatch 行为、manifest 或 Game Layout ZIP。
- 不增加模糊匹配、拼音、正则、通配符、多条件查询语法、搜索历史、排序权重或第三方检索依赖。
- 不把全部 exact event 永久平铺为长列表，不绕过现有 family/facet 渐进选择流程，也不增加 raw address 输入。
- 不筛选左侧已添加 Event 组列表；本任务只筛选添加/修改/单选时右侧的 catalog 候选。
- 不在 `apps/editordemo`、`apps/gamelayouteditor` 复制检索状态或 event 表，不修改其业务 schema、audio 配置或资源。
- 不新增依赖，不修改 lockfile、production assets、YAML、生成物或外部仓库。

## 3. 制定计划时的基线

```text
UTC: 2026-09-01T03:13:31Z
HEAD: d0d7eb8c606368b7f6b7d5b54a81ea6f4c3d97c7
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `tasks/241-editorcore-gamelayout-event-dialog.md`
- `tasks/276-audiocore-background-resume-no-stale-effects.md`（仅用于核对当前计划格式）
- `docs/agent-rules/editor-artifacts.md`
- `packages/editorcore/README.md`

`packages/editorcore` 下没有补充 `AGENTS.md`。

当前结论：

- `packages/editorcore/src/assets/ui/game-layout-event-dialog.ts#renderProgressiveEditor()` 先列 family，再按
  `entry.facets` 一层层缩小候选；group dialog 和 single picker 最终都复用该实现。
- 当前 `ProgressiveSelection.query` 只由 `renderNextFacet()` 使用，而且仅当当前 facet 的原始候选超过 8 项时渲染
  `[data-event-search]`；它只匹配当前 `value`，选择下一 facet 时立即清空。因此在初始 family 页面输入
  `spin` 的能力不存在，也无法通过深层 facet 或 canonical address 找到 Event。
- `GameLayoutRuntimeEventCatalogEntry` 已提供唯一检索所需事实：`family`、有序 `facets` 与
  `descriptor.address`；family/facet 展示名由同文件 `FAMILY_LABELS`、`FACET_LABELS` 生成。无需修改 adapter、
  RenderCore public API 或解析 address segment。
- `packages/editorcore/tests/adapters-and-ui.test.ts` 已用真实 EditorCore→RenderCore catalog 路径覆盖 group dialog、
  configured row 和 single picker，但没有针对 event 检索的断言。
- `packages/editorcore/src/assets/ui/assets-view.css` 已拥有 event editor、choice scroll、responsive group/single 布局；
  只需在现有区域内补输入框/结果提示样式。
- 直接 consumer 是 `apps/editordemo` 与 `apps/gamelayouteditor/src/ui/event-audio-dialog.ts`；二者调用共享 mount API，
  不需要 app-local 代码即可获得本次行为。

## 4. 需求解释与技术决策

### 需求解释

1. “添加 event 时”同时覆盖 Event 组里的新增/修改和单 Event picker；两者共享 catalog selector，不能只修一个入口。
2. “输入 spin”不应要求用户先知道应该点哪个 family。检索从尚未选择 family 的初始页就可用，并在后续 facet
   选择中持续生效。
3. “相关的都列出来，不相关的不显示”解释为过滤完整 catalog 后投影现有渐进式分支：只显示至少通向一条命中
   exact Event 的 family/facet 候选，而不是一次渲染所有 exact address。
4. “相关”由 catalog 自身和既有 UI label 确定：匹配 family id/label、facet key/label/value 或 canonical address。
   不读取 descriptor address 结构来发明 alias，也不做语言推断。
5. 本任务使用单个连续字符串的大小写不敏感包含匹配；除首尾空白外不改写输入。不新增 fuzzy、拼音、正则或
   空格分词语法，避免产生仓库中没有合同的相关性排序。

### 关键决策

1. **把现有局部 query 升级为 row editor 的全 catalog query。**
   - 检索框在 `editorActive && catalog` 时始终显示，family 页面也可输入；不再以候选数量阈值决定能力是否出现。
   - query 在选择 family/facet 和点击 breadcrumb 回退时保留；开始另一条新增/编辑、取消 row、关闭并重开或切换
     Layout 时按既有 `emptySelection()/resetRowEditor()` 生命周期清空。
2. **建立单一 entry matcher，再由匹配集驱动每层 UI。**
   - 为每个 entry 组合 raw/展示 family、raw/展示 facet key、facet value 与 canonical address，使用统一 normalize 后
     进行包含匹配；空 query 返回原 catalog entries。
   - family 列表、`candidates()`、`nextFacet()`、`countAfter()` 和 selected-entry 可保存性都以“当前路径与 query
     同时满足”的 entry 集为准，避免标题被过滤但计数或保存仍引用未过滤数据。
3. **检索不成为新的数据或 public contract。**
   - query 只属于 DOM/session state，不进入 `EditorGameLayoutEventGroup`、configuration、snapshot 或 exported ZIP。
   - 不修改 mount options、callback、catalog entry 类型或 adapter；consumer 不传搜索索引，也不维护本地 family 表。
4. **保留渐进选择与严格保存边界。**
   - 命中深层 term 时显示可到达该命中的祖先分支；选择仍逐 facet 显式完成，只有当前 query 下唯一 exact entry
     才能保存。
   - query 使当前路径无匹配时显示“没有匹配的 Event”并禁用保存；不自动清空已选 facet。清空 query 后原路径恢复，
     避免检索输入悄悄改写 row draft。
5. **DOM 重渲染保持输入连续性。**
   - 沿用事件委托，在 input 后 render 再恢复搜索框 focus 与 caret；检索框提供 `type="search"`、可辨识 label/
     `aria-label` 和稳定 selector，CSS 保证 group/single 及窄屏布局可用。

## 5. 职责与合同

- **RenderCore catalog**：继续拥有 exact event family、facets、descriptor 和 canonical address；本任务只读，不扩展索引。
- **EditorCore event UI**：拥有 query、entry match、过滤后的渐进投影、输入焦点和 row draft；只使用 catalog + 既有
  label formatter，不解析 address 语义。
- **Host consumer**：继续提供 controller/sources、optional configuration 和 confirm callback；无需感知 query，也不保存它。
- **数据/API**：`EditorGameLayoutEventGroup`、`EditorGameLayoutEventItem`、mount options 和 callback 保持不变；检索不会
  改变 entry 顺序，过滤结果沿用 catalog/既有 facet 的确定性顺序。
- **生命周期**：open/start-row 创建空 query，row/path 操作只更新 session draft，close/cancel/destroy 丢弃未确认状态；
  configuration adapter 的 mount/dispose 次序保持现状。
- **失败策略**：无匹配显式显示空状态；未知 family/facet 仍以 raw value 作为既有展示，不添加 alias 或 fallback。
- **禁止行为**：第二份 event 表、raw address parser、自动首选、模糊猜测、持久化 query、consumer-local filter 和
  通过隐藏错误 entry 放宽 strict catalog validation。

## 6. 文件范围

### 预计新增

```text
tasks/278-editorcore-event-dialog-search-<utctime>.md
```

### 预计修改

```text
packages/editorcore/src/assets/ui/game-layout-event-dialog.ts
packages/editorcore/src/assets/ui/assets-view.css
packages/editorcore/tests/adapters-and-ui.test.ts
packages/editorcore/README.md
```

若现有单个测试过长，只允许把 event dialog DOM cases 机械拆到同目录的专用测试文件，并复用已有 fixture/helper；
不得因此复制 catalog fixture 或 production matcher。

### 原则上不应修改

```text
packages/editorcore/src/assets/{adapters,core,data}/**
packages/rendercore/**
apps/{editordemo,gamelayouteditor}/**
docs/agent-rules/**
assets/**
package.json
pnpm-lock.yaml
```

若执行时发现检索必须修改 catalog schema/public API，说明当前 entry 缺少必要事实，属于明显范围扩张；应先停止并
提交缺口证据，不能通过解析 canonical address 或新增 app-local event 表绕过。

## 7. 实施步骤

1. **确认执行基线与检索 fixture**
   - 重核 HEAD/status、本计划、`editor-artifacts.md` 和当前 event dialog 测试。
   - 在现有自包含 catalog fixture 上先添加失败测试，固定 `spin` family 命中、深层 facet/address 命中、无结果和
     清空恢复；不读取 production assets。
2. **实现统一 entry 检索投影**
   - 在 `game-layout-event-dialog.ts` 增加纯 normalize/match helper，只消费 entry 与现有 label formatter。
   - 让 family、当前路径 candidates、next facet values、后续数量和 selected entry 统一从 query-matched entries 派生，
     保持原 catalog 顺序/既有排序和 exact validation。
3. **调整渐进式检索交互**
   - 把检索框移到所有渐进选择层级都可见的位置，补 label/placeholder/result count 或空状态；移除“候选超过 8 项”
     才能检索的阈值语义。
   - family/facet/breadcrumb 操作保留 query；query 本身不清空路径。无匹配时隐藏无关分支、禁用保存，清空后恢复。
   - 保持 input 后重渲染的 focus/caret，并验证 group/single、配置 adapter mount/dispose 与 row cancel 不回归。
4. **补充样式与自动测试**
   - 在 `assets-view.css` 为搜索区域、结果/空状态补最小样式，验证桌面双栏、single picker 和窄屏布局不溢出。
   - DOM 测试覆盖大小写与 trim、family label/raw id、深层 facet/address、无关项隐藏、匹配计数、无结果、清空、
     breadcrumb/query 保留、保存 exact entry、重开 reset、single picker 和 destroy。
5. **文档、验收与报告**
   - 更新 EditorCore README：检索始终可用、匹配字段、过滤的是 catalog 分支且不改变 canonical selection。
   - 运行 L1 定向验收，完成浏览器人工检查，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 使用现有 self-contained catalog/ZIP fixture；断言 catalog 驱动的可见分支和最终 exact address，不复制一份业务
  event 索引到测试 helper。
- 覆盖空 query、大小写/首尾空白、raw family、展示 label、深层 facet value、canonical address、0 match 和恢复。
- 检索过程要证明未修改 group/row configuration；已有 add/edit/remove/cancel/replacement/destroy 期望继续成立。
- 不以快照整段 HTML 代替关键可见/不可见、计数、disabled、focus 和 confirm callback 断言。

### 验收级别

`L1`：只修改 `@slotclientengine/editorcore` 内部 DOM UI、样式、测试和 README，不改变 public API、RenderCore catalog、
schema、生成物、依赖或 lockfile。共享 mount API 的两个 consumer 自动获得新行为，但无需跨包编译改动。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/editorcore typecheck
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
pnpm --filter @slotclientengine/editorcore build
pnpm exec prettier --check packages/editorcore/src/assets/ui/game-layout-event-dialog.ts packages/editorcore/src/assets/ui/assets-view.css packages/editorcore/tests/adapters-and-ui.test.ts packages/editorcore/README.md
git diff --check
```

若测试被拆分为专用文件，第二条命令同步加入该精确文件；不升级为根级 typecheck/test/build/format。

### 人工验收

1. 在 Editordemo 导入能产生 Spin、Symbol、Popup/mode 等多类 Event 的自包含 Game Layout ZIP，打开“添加 Event”；
   输入 `spin` 后只剩通向 Spin Event 的 family/分支，逐级选择后得到 catalog 中的 exact canonical address。
2. 输入只存在于深层 facet/value 或 address 的文本，确认祖先 family 可见、无关 sibling 隐藏；清空输入后完整候选和
   原选择路径恢复。输入无匹配文本时显示空状态且不能保存。
3. 在 Gamelayout Editor 的结束 Event single picker 重复检查检索、清空、选定、取消和重开；窄窗口下输入框与候选
   列表可操作，无焦点跳失、横向溢出或控制台错误。

### 独立验收建议

`建议`。本任务不涉及跨包 public contract、credential、资源 ownership、schema、ZIP 或生成物；建议独立抽查
`spin`、深层 value 和无结果三条用户路径，并复验：

```bash
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 复用现有 TypeScript、DOM、CSS 与 Vitest/happy-dom，不新增依赖、不升级包、不修改 lockfile。

## 10. 生成物、文档与规则

- 本任务无 YAML、manifest、schema 或生成 TypeScript 变化，不运行生成器；`dist` 由 package build 验证但不手改。
- `packages/editorcore/README.md` 更新“当前层候选较多时搜索”为“始终可用的全 catalog 分支检索”，说明 raw/展示
  family、facet 和 canonical address 的匹配边界。
- `docs/agent-rules/editor-artifacts.md` 已明确 event selector 只消费 RenderCore shared catalog；本任务不改变稳定职责
  边界，原则上不更新领域规则或根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/278-editorcore-event-dialog-search-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终匹配字段、query/selection 生命周期、实际修改文件、自动化与
人工验收结果、计划偏差和剩余风险；不收集无关 coverage、全仓统计或完整历史矩阵。

## 12. 风险、假设与待确认

### 风险

- query 若只过滤当前按钮文本，深层 `state`/address 命中会在 family 页消失；必须先匹配 entry，再向上投影可达分支。
- query、当前 facet 路径和 `selectedEntry()` 若使用不同候选集，可能出现 UI 显示“无结果”但保存按钮仍可用，或
  计数包含隐藏项；所有派生必须共用同一 matcher。
- 当前 DOM 在每次 input 后整体重渲染；未恢复 focus/caret 会导致连续输入中断，配置 adapter 也可能被无意义反复
  mount/dispose。测试需固定焦点行为，并确认检索未进入已选 entry 的配置阶段时不会创建配置 draft。
- catalog entry 较多时每个键入都遍历 searchable fields；预期规模下线性过滤足够。若真实 fixture 出现明显卡顿，
  可在 dialog session 内缓存每个 immutable entry 的 normalized search text，但不得引入持久索引或新依赖。

### 假设

- 用户希望检索右侧“添加/选择 Event”的 catalog 候选，不是左侧已添加 group 列表。
- `spin` 是代表性查询；匹配既支持 raw typed identity，也支持当前 UI 展示文案和 catalog 深层事实。
- 现有渐进式 family→facets 交互仍保留，需求不要求把全部 exact address 改成可虚拟滚动的扁平结果列表。

### 待确认

无。若执行时用户实际需要的是左侧已添加 Event 列表筛选或 flat exact-result picker，应视为不同交互范围并先说明，
不能同时塞入本任务造成 query 语义混杂。

## 13. 完成清单

- [ ] 添加/修改 Event 与 single picker 均提供始终可见的全 catalog 检索。
- [ ] family、facet、address 匹配与逐层分支投影符合计划，无关项和计数正确过滤。
- [ ] exact selection、draft/configuration、cancel/reopen/replacement/destroy 行为无回归。
- [ ] 样式、可访问名称、输入焦点与空状态完成。
- [ ] EditorCore README 和指定 L1 验收完成。
- [ ] 自动化与人工验收已明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划和 `docs/agent-rules/editor-artifacts.md`；
2. 核对 Git 基线与工作区，先用现有 fixture 固定失败检索用例；
3. 按“统一 entry matcher → 渐进候选投影 → DOM/CSS → 测试/README”实施，不复制 event catalog；
4. 小幅文件粒度适配在报告说明；需要改 RenderCore/public API/schema/consumer 时先停止说明；
5. 只运行计划规定的 L1 验收并区分浏览器人工检查；
6. 完成后生成 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
