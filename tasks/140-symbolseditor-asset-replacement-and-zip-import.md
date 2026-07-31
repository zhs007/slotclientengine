# 140 symbolseditor-asset-replacement-and-zip-import 任务计划

## 1. 目标与完成定义

### 目标

让美术在 Symbols Editor 的统一“导入资源 / ZIP”入口中，按原始 filename key
替换单个或整批资源；同名冲突时可逐项或批量选择覆盖，也可保留为稳定 suffix 名称。
任何替换都不得改写已经配置好的 symbol、state、value、ImgNumber、Spine/VNI
binding 或 game config。

同时修复任务 135 Symbols ZIP 打开后无可观察结果、失败时也没有错误提示的问题，使
项目导入、预览和错误反馈具有明确且可复验的状态。

### 完成定义

- [ ] 单个文件、多选文件、通用资源 ZIP、普通文件与通用 ZIP 混选，均经过同一
      bounded ingestion、typed discovery、冲突 review 和原子 commit。
- [ ] 新 key 保持原 basename；同名同 bytes 为 `noop`；同名不同 bytes 必须显示
      existing references，并让用户逐项或一键选择“全部替换/全部保留”。
- [ ] 保留两份时使用扩展名前最小可用 `-1`、`-2`……，如
      `Symbol.png -> Symbol-1.png`；同时避开 workspace、当前批次和大小写/NFC alias。
- [ ] 覆盖只更新相同 key 的 bytes/hash/metadata/preview；raw game config、
      symbol/state 顺序与配置、value/cascade、ImgNumber targets 和全部引用不变。
- [ ] 新 bytes 缺少旧配置要求的 animation、atlas page、VNI asset、glyph/slot 或
      exact closure 时整批失败并保留旧项目；不得自动清配置、重绑或降级。
- [ ] keep-both 只结构化改写 incoming candidate 自己的 typed refs；现有配置不变，
      新资源不自动绑定，Spine page logical name、VNI `originalName` 和业务 identity
      不变。
- [ ] 唯一 Symbols package ZIP 仍作为“打开/替换项目”处理，并在提交前明确说明；
      project ZIP 不与 loose resources 混成含义不明的批次。
- [ ] `/Users/zerro/Downloads/game002-s3-symbols-task135.zip` 可显示
      `game002-s3` 的 symbols/states/resources；loading、成功、项目失败和预览失败都有
      可见反馈，不再静默成为空预览。
- [ ] export/reimport 后替换 bytes、keep-both keys、既有配置和 exact closure 一致，
      `assets.map.json` 无 hash/size/path/missing/orphan 错误。
- [ ] 完成 L2 定向自动化、真实浏览器验收和 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/editorresource` 的显式 conflict resolution、稳定 suffix allocator、
  review 重算和原子 commit。
- `apps/symbolseditor` 对共享 workspace 的接入，以及 files/generic ZIP/mixed
  sources 的统一导入。
- 原生 review dialog、逐项/批量决定、引用影响、busy/success/error 和 cancel。
- image、Spine、VNI、standalone ImgNumber 的 typed prepare、incoming rename、
  overwrite compatibility validation 和 preview refresh。
- Symbols project ZIP 的替换确认、任务 135 mapped package UI/preview 回归。
- 直接相关 model、UI、ZIP、rollback/lifecycle 测试、README 和领域规则。

### 不包含

- 不改 Symbols/image-string/VNI/scene-layout production schema、任务 135 ZIP、
  game002 runtime、服务器或游戏表现。
- 不猜 symbol/state/binding，不自动绑定，不把目录作为 identity，不恢复第二套资源表。
- 不无条件 suffix；只有用户在冲突 review 中明确选择 keep-both 才分配。
- 不把完整 Symbols package ZIP 当普通素材合并，也不支持多个 project ZIP 同批导入。
- 不扩展到其它三个 editor 的 UI；shared API 可复用，但本任务只接入 Symbols Editor。
- 不新增依赖、不改 lockfile，不做 undo/redo、持久化或无关 UI 重构。

## 3. 制定计划时的基线

```text
UTC: 2026-07-30T14:24:20Z
HEAD: 272a9e94efd73c8c43bfdab5f098871a1d3cdffa
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

读取的规则和依据：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
tasks/templates/task-plan.md
tasks/135-game002-co-collection-flow.md
tasks/135-game002-co-collection-flow-260729-073659.md
apps/symbolseditor/README.md
packages/editorresource/README.md
```

当前代码基线：

- `editorresource/src/workspace.ts::reviewEditorAssetImport()` 已分类
  `add/noop/overwrite/rename-required` 并列覆盖引用；
  `commitEditorAssetImport()` 已在 candidate workspace 验证后一次提交。
- shared workspace 尚无用户选择 keep-both 后的唯一 key 分配、整批冲突重算和
  incoming refs rewrite API；README 禁止无条件自动 suffix，本任务保留该边界。
- `symbolseditor/src/model/editor-project.ts::uploadAssetBatch()` 自己按 basename 写
  `assetLibrary.records`，同名先覆盖，之后才由通用 `window.confirm` 确认；UI 新导入
  尚未接 shared transaction，也没有 prospective typed validation。
- `workspace-app.ts::uploadResources()` 只让 loose files 走普通导入。单个 ZIP 被硬分
  Symbols package 或 ImgNumber；generic ZIP 会误入 ImgNumber importer，mixed ZIP
  会成为 unsupported record。
- `editorresource/src/ingestion.ts::ingestEditorResourceSources()` 已拥有 bounded
  file/ZIP、macOS metadata 清理和 flat basename 输出，Symbols Editor 尚未使用。
- Symbols project ZIP 当前直接 `store.replace()`，没有项目替换影响或 loading；
  `refreshPreview()` 又用空 `catch` 吞掉 package/preview exception 并回退 null
  resource，确实存在“无预览且无错误”的静默路径。
- task135 ZIP 为 6,223,098 bytes，SHA-256
  `e59d9014e3ea802c647c1fd184b2d91c5b2817ed5c2bd2d0ee3bfa96b3c7d255`，
  与任务报告一致；83 entries、7,403,163 uncompressed bytes 均通过 `unzip -t`，
  根 manifest 存在且未超 limits，不能归因于下载损坏。
- 任务 135 只证明 headless authoring export/reimport；没有真实 UI 打开 mapped ZIP、
  呈现项目或报告 preview failure 的回归证据。

当前代码、规则和 ZIP 证据足以界定计划，不需审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “一个个/一组”同时指 file picker 单选/多选/ZIP batch，以及同一 review 可逐冲突
  决定或一键应用全部。
- “按原始文件名覆盖”以 flat NFC filename key 为 identity；ZIP 目录不参与匹配，
  case alias 按现有 collision token 冲突，并保留 workspace 已有拼写。
- “否则改文件名”是用户拒绝覆盖但仍要导入时显式 keep-both；普通非冲突 key 不改名，
  错误也不静默 fallback。
- “配置不变”指 owner-owned authoring semantics 和引用不变。覆盖可改变视觉 bytes；
  incompatible bytes 必须拒绝，不能迁移配置。
- task135 bytes 已有效；执行时分开观察 project prepare、store commit、preview
  prepare 三阶段，不重生成或改写 ZIP。

### 关键决策

1. **shared package 拥有 resolution 与 suffix**
   - 初始同名不同 bytes 仍是 `overwrite` candidate，但 UI 确认前不能提交。
   - 每个 conflict 记录 `overwrite | keep-both`；shared helper 在扩展名前从 `-1`
     选择最小可用 key，按稳定 source order 重算 batch。
   - allocator 检查 workspace、已解决 items 和 case/NFC token；app 不复制算法。

2. **replacement 是 bytes transaction**
   - overwrite 保持 target key，existing reference graph 原样有效。
   - commit 前用 candidate workspace 重建受影响 typed candidates 并复验全部 existing
     refs；失败不修改 store、thumbnail 或 preview owner。
   - 测试对导入前后 semantic project snapshot 做 parity，只允许被选 asset 的
     bytes、batch provenance、derived hash/metadata 改变。

3. **keep-both 只改 incoming graph**
   - image 只分配 key；Spine/VNI/ImgNumber 由 owner adapter 改写 incoming typed map。
   - 不调用 project reference rename 去改旧 state/value/node，新 candidate 保持
     unbound；不能安全改写时禁用 keep-both 并说明原因。

4. **统一 ingestion，严格区分 project/resource**
   - loose/generic ZIP 走 `ingestEditorResourceSources()`，再 prepare-all typed
     candidates；generic ZIP 可与 loose files 混选。
   - 唯一含 `symbols.package.json` 的 ZIP 是 project import，必须单独导入并显示
     “替换当前项目”review；Finder metadata/wrapper 按 shared boundary 清理。

5. **用可测试 dialog 替代 confirm/prompt 链**
   - dialog 显示 source、incoming/target key、action、bytes、kind、references 和
     errors，提供逐项、全部覆盖、全部保留、确认、取消。
   - UI 只收集 choice；shared model 重新计算 resolved review，不信任 DOM target key。

6. **项目导入和预览错误分层**
   - 显示 `reading -> validating -> committing -> previewing -> ready/error`，避免
     大 ZIP 处理看似无响应。
   - project commit 后 preview 失败时保留可编辑项目，在 preview 区显示 exact error
     与重试；stale request/project replacement/destroy 释放 resource、texture 和 URL。

## 5. 职责与合同

- **editorresource**：key、classification、resolution、suffix、candidate workspace、
  atomic commit；不解析 symbol 业务。
- **Symbols model/adapters**：映射 shared entry/asset record，收集 references，改写
  incoming typed closure，复验 project。
- **Symbols UI**：source、choice、project replace、progress/error；不直接改 key、
  bytes、binding 或 hash。
- **rendercore/vnicore**：继续拥有 package/Spine/VNI/image-string parsing 和 exact
  closure；app 不复制 parser。
- **lifecycle**：prepare 不改 store；完整 resolution 全部验证后 commit once。
  cancel/failure/stale/destroy 清 prepared owners 和 dialog，不碰 active project。
- **failure**：alias、unsupported candidate、bad hash/path、typed incompatibility、
  missing/orphan、preview failure 都显式。
- **禁止**：不自动重绑/清配置/suffix，不猜 state，不用 null preview 掩盖错误，
  不维护第二份 workspace/hash。

## 6. 文件范围

### 预计新增

```text
apps/symbolseditor/src/model/resource-import.ts
apps/symbolseditor/src/ui/import-review-dialog.ts
apps/symbolseditor/tests/resource-import.test.ts
apps/symbolseditor/tests/import-review-dialog.test.ts
tasks/140-symbolseditor-asset-replacement-and-zip-import-<utctime>.md
```

能保持职责清晰时可并入现有 model/UI，不能把 resolution 散落到 DOM handler。

### 预计修改

```text
packages/editorresource/src/{workspace,key,index}.ts
packages/editorresource/tests/editorresource.test.ts
packages/editorresource/README.md
apps/symbolseditor/src/model/{editor-project,editor-store}.ts
apps/symbolseditor/src/ui/{workspace-app,ui-session}.ts
apps/symbolseditor/src/io/{symbol-package-zip,image-string-dependency}.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{app-shell,editor-project,ui-session,zip-io}.test.ts
apps/symbolseditor/README.md
docs/agent-rules/editor-artifacts.md
```

### 原则上不应修改

```text
packages/{browserartifactio,rendercore,vnicore}/**
apps/{imgnumbereditor,popupeditor,gamelayouteditor,game002,game003}/**
assets/**
tasks/artifacts/135/**
pnpm-lock.yaml
AGENTS.md
```

若 task135 最小复现确认是 owner public parser/player 缺陷，扩大前须给出证据，不能在
Symbols Editor 加 fallback；若 shared API 迫使其它 editor 同步，也须先说明。

## 7. 实施步骤

1. **固定失败证据**
   - 重查 HEAD/status、规则、task135 ZIP hash/entries。
   - 用实际 ZIP 记录 headless prepare、store commit、preview prepare；为 UI 无反馈、
     preview swallow、single/batch/generic ZIP/cancel 建失败测试。

2. **扩展 shared resolution**
   - 增加扩展名前 suffix allocator 和 immutable resolution API。
   - 按 source order 处理 workspace/batch collision，保留 existing spelling，产出
     resolved target/actions/references/errors/`canCommit`。
   - 覆盖 `foo.png`、已有 `foo-1.png`、multi-dot、case/NFC、duplicate、noop、
     invalid extension 和 deterministic parity。

3. **建立 Symbols import transaction**
   - 将 asset library 适配为 shared workspace/project adapter，UI 新导入不再直接
     调 `uploadAssetBatch()` 覆盖。
   - 从 ingestion prepare image/Spine/VNI/ImgNumber，收集 existing/incoming graph。
   - overwrite 复验受影响 consumers，keep-both 只改 incoming；成功后一次换 store。

4. **实现 review dialog**
   - 呈现 actions、allocated key、source/bytes/kind/references/errors。
   - 实现逐项、全部替换、全部保留、confirm/cancel、键盘关闭和重开清理。
   - blocking、async failure、cancel 和 stale 均保持原 snapshot。

5. **统一 files/ZIP 路由**
   - loose/generic ZIP/mixed 使用 shared ingestion，不再把 ZIP 当 unsupported 或强制
     ImgNumber。
   - standalone ImgNumber、shared Spine、VNI 走 typed discovery，不自动绑定。
   - 单独 Symbols package 显示 project replace review，拒绝和其它 source 混用。

6. **修复 task135 可观察性**
   - 增加 import phase/busy、success summary 和 exact error。
   - 将 `refreshPreview()` 空 catch 改为带 owner/request token、visible error/retry 的
     preview transaction；preview 失败不丢 project。
   - 用 task135-shaped mapped fixture 覆盖 map、nested ImgNumber、tiered Spine/state
     和 multi-target；实际 Downloads ZIP 留作浏览器验收，不复制进仓库。

7. **round-trip、文档和报告**
   - 验证 replacement/keep-both export/import/export semantic parity 与
     hash/size/path/missing/orphan。
   - 更新两个 README 和最小 editor-artifacts 规则：冲突可见，显式 keep-both 才可
     suffix，覆盖/rename 均事务性保引用。
   - 运行 L2、完成浏览器清单并生成 UTC 报告。

## 8. 测试与验收

### 测试原则

- model：add/noop/overwrite/keep-both、single/batch/mixed、suffix、case/NFC、typed
  rewrite、config parity、rollback。
- UI：逐项/批量、impact、cancel、busy/success/error、project replace、preview
  failure/retry、stale/destroy。
- ZIP：用仓库构造的 task135-shaped mapped fixture，不让 CI 依赖 Downloads；实际
  task135 ZIP 只作浏览器输入。
- fake preview 只证明 UI/lifecycle，不冒充 Pixi/Spine/VNI 视觉验收。

### 验收级别

`L2`。任务扩展 editorresource public transaction 并接入直接 consumer
symbolseditor，也改变正式 ZIP 工作流；不改根工具链、lockfile、schema 或游戏。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/editorresource --filter symbolseditor typecheck
pnpm --filter @slotclientengine/editorresource --filter symbolseditor test
pnpm --filter @slotclientengine/editorresource --filter symbolseditor build
pnpm --filter @slotclientengine/editorresource --filter symbolseditor format:check
git diff --check
```

失败先跑对应 test file 的最小复现，不扩根级命令。

### 人工验收

- 在完整项目中记录配置；单独替换同名图片，确认 review/reference、配置 parity 和
  preview 更新。
- 导入 loose/generic ZIP mixed batch，逐项混用 overwrite/keep-both，再验证两种
  “全部”动作、suffix、cancel 和 export/reimport。
- 用 incompatible Spine/VNI/ImgNumber 替换已绑定 key，确认提交前失败且旧项目不变；
  坏 ZIP 显示 exact error。
- 无项目/已有项目时分别打开 task135 ZIP，确认 project replace、loading/success、
  CO/WL/WM/CM/CN states/value/ImgNumber、all-symbol preview、重复导入和 destroy。
- 人工检查 image/official Spine/VNI/ImgNumber 真实视觉和 console。

### 独立验收建议

`建议`，因为涉及 shared transaction、resource ownership、正式 ZIP 和配置不变合同。
独立复验两个 package 的 test/typecheck、`git diff --check`，再人工跑一个 mixed
overwrite/keep-both batch 和实际 task135 ZIP。

## 9. 环境与依赖

- 使用仓库要求的 Node 24；shell 无 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用 pnpm，不切 npm/yarn。依赖缺失时才运行
  `CI=true pnpm install --frozen-lockfile`；下载真实失败后才设置现有本地代理重试。
- 复用现有 browserartifactio/editorresource/rendercore/vnicore，不新增依赖，
  lockfile 不应变化。

## 10. 生成物、文档与规则

- 不新增/手改业务生成物，不修改 task135 ZIP。
- Symbols README 记录 replacement/review/keep-both/project ZIP/preview error。
- editorresource README 明确 allocator 只服务显式 resolution，“不得自动 suffix”
  继续成立。
- editor-artifacts 只更新稳定合同：冲突必须可见，显式 keep-both 可 suffix，覆盖/
  rename 事务性保引用；不加入 task135 hash。
- 不改根 AGENTS、production manifest 和其它 editor README。

## 11. 执行报告

执行完成后创建：

```text
tasks/140-symbolseditor-asset-replacement-and-zip-import-<utctime>.md
```

用 `date -u +%y%m%d-%H%M%S` 取 UTC。报告简记最终 resolution/config parity/task135
行为、实际文件/API/偏差、自动化结果、实际 ZIP stage 与浏览器结果、剩余风险；不收集
无关 coverage、全仓统计或历史矩阵。

## 12. 风险、假设与待确认

### 风险

- Spine/VNI/ImgNumber keep-both 是多文件 closure；漏改 incoming ref 会延迟到导出
  暴露，必须 owner adapter + round-trip 双保护。
- 批量覆盖可能影响多个 symbols，validation 必须走动态 reference graph。
- task135 可能还含 WebGL/texture 环境差异；silent catch 必须修，但真实视觉仍需浏览器。
- 大 ZIP hash/introspection 要有 busy/stale cleanup，避免重复导入晚到 commit。

### 假设

- suffix 解释为 `name-1.ext`、`name-2.ext`，取最小可用正整数并按稳定输入顺序。
- task135 目标是 `game002-s3-symbols-task135.zip`，不是属于 Layout Editor 的
  `crave-layout-task135.zip`。
- flat filename key、case-insensitive collision token、完整 SHA-256 合同不变。

### 待确认

无。行为可由用户描述、现有规则、代码和 task135 ZIP 证据确定。

## 13. 完成清单

- [ ] single/batch/generic ZIP/mixed source 导入符合目标。
- [ ] 逐项/批量 overwrite 与显式 keep-both suffix 已实现。
- [ ] 配置 parity、typed rollback、stale/destroy cleanup 已证明。
- [ ] task135 实际 ZIP 可打开，project/preview error 不再静默。
- [ ] export/reimport、map/hash/path/missing/orphan 通过。
- [ ] README/规则、L2、浏览器证据和 UTC 报告完成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、editor-artifacts 规则和本计划；
2. 核对 Git 与 task135 ZIP hash，先固定实际失败 stage；
3. 按计划实现，不另建 app-owned collision/hash/ZIP 算法；
4. 小幅文件调整写报告，shared owner/其它 editor 扩张先停止说明；
5. 只运行计划规定的 L2 和 Symbols Editor 浏览器验收；
6. 生成 UTC 中文报告；除非用户要求，不 commit/push/建 PR。
