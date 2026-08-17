# 224 symbolseditor-spine-asset-replacement 任务计划

## 1. 目标与完成定义

### 目标

修复 `apps/symbolseditor` 在正常美术迭代中的重复绑定问题：用户已配置多个
symbol/state 后，再以同一 filename key 覆盖 Spine skeleton、atlas 和 texture bytes，
编辑器应把它视为资源内容更新，而不是重新 author 每个 state。兼容的新资源必须保留
现有 skeleton/atlas/texture 引用、animation、transform、composite layer、value tier、
ImgNumber/slot、音效和其它 owner-owned 配置；只有新资源确实不能满足某个 exact typed
binding 时，才按既有 strict 规则精确清理或回滚。

仓库不存在用户所写的 `packages/symbolseditor`；本任务实际目标是
`apps/symbolseditor`，不新建同名 package。

### 完成定义

- [ ] 用户可在一次导入中覆盖已引用的 Spine skeleton、atlas、PNG/JPEG/WebP；若
      filename key、atlas page 关系、已选 animation/slot 等合同仍兼容，所有已编辑
      symbol/state 保持原绑定，无需逐项打开 Picker 或重新选择 animation。
- [ ] 同一 Spine 资源被多个 symbol、normal/custom state、composite exact layer 或
      value tier 共用时，覆盖只提交一次，并对全部 exact 引用一致生效。
- [ ] 覆盖 atlas 后若其唯一 page logical name 合法改变，事务使用导入后 atlas
      metadata 结构化更新引用该 atlas 且仍指向旧 page 的 texture binding；不按文件名
      猜测、不修改无关图片引用。
- [ ] 覆盖 skeleton 后，现有 animation 仍存在时保持选择；缺少 animation 时只清空
      受影响的 exact selection 并列出位置。value-managed shared animation 继续按全部
      tier skeleton 交集统一判断。
- [ ] Picker 选择当前 skeleton/atlas 必须是语义 no-op；选择不同但兼容的 skeleton 时
      保留仍有效的 animation/slot，只有已确认不兼容的字段才精确清理并反馈。
- [ ] atlas closure、slot、ImgNumber、VNI 或其它 typed binding 不兼容时，整批资源和
      draft 配置原子回滚，不留下半覆盖或半重写状态。
- [ ] review、成功提示和错误信息明确区分“bytes 已覆盖且配置保持”“精确清理了哪些
      binding”“事务因不兼容未修改项目”。
- [ ] Symbols ZIP 导出和 standalone production preview 使用覆盖后的 bytes 与完整 exact
      closure；manifest 版本、filename-key 大小写和 content-addressed 物理路径合同不变。
- [ ] 完成定向自动测试、真实浏览器工作流验收，并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- `apps/symbolseditor` 的普通资源导入 prepare/review/commit、Spine 覆盖 reconcile、
  typed resource Picker 和反馈文案。
- 对普通 Spine state、normal base、composite Spine layer、value-managed tier、共享
  active Spine animation 和多 symbol 引用的精确遍历与兼容性判断。
- 同批 skeleton/atlas/page texture 覆盖后的最终 candidate 校验、结构化 texture
  binding 更新、失败 rollback 和 preview/export 复验。
- 直接保护上述合同的 model、Picker、UI 测试以及 Symbols Editor README 更新。

### 不包含

- 不改变“覆盖”的 identity 语义：同 filename key overwrite 仍更新所有引用该 key 的
  owner；若第二套独立美术与已有资源同名，用户必须提供不同合法 key 或使用明确支持的
  keep-both 流程，不能把 overwrite 静默解释为复制资源。
- 不恢复目录身份、logical resource 分组、按 symbol 自动匹配、filename guess、hash
  比较 gate 或第二份资源表。
- 不自动把新导入资源绑定到未配置 state，不自动选择首个 animation/slot，不用相似
  bytes 或同名 animation 猜测不同业务 identity。
- 不扩展 structured Spine keep-both/批量重命名能力；该相邻需求需要独立设计 atlas
  page 与全部 exact reference 的 rename transaction。
- 不修改 rendercore symbol manifest/runtime schema、VNI/ImgNumber/audio 合同、production
  美术、Game Layout consumer、根工具链、依赖或 lockfile。
- 不顺手重构 `workspace-app.ts`、资源库 UI 或共享 editorresource importer。

## 3. 制定计划时的基线

```text
UTC: 2026-08-17T09:24:36Z
HEAD: f1295fdcbcc03bccae2b0983b60b782c705038e8
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md` 和
  `docs/agent-rules/editor-artifacts.md`；目标 app 及直接相关 package 下无补充
  `AGENTS.md`。
- `apps/symbolseditor/src/model/resource-import.ts#prepareSymbolResourceImport()` 已把一次
  多文件上传准备为统一 review；`commitSymbolResourceImport()` clone project、写入全部
  resolved bytes、再校验 candidate，已有原子 transaction 基础。
- `commitSymbolResourceImport()` 当前只用 overwritten skeleton key 驱动
  `reconcileMissingSpineAnimations()`；animation 仍存在时可保留，缺失时会清空 exact
  state/composite layer/tiered shared selection，并由
  `validateReconciledSpineImport()` 复验。
- `apps/symbolseditor/tests/resource-import.test.ts` 已覆盖普通图片 bytes 覆盖、保留
  skeleton animation、精确清理缺失 animation、composite leaf、tier 交集和失败 rollback；
  尚未覆盖完整 skeleton+atlas+texture 美术批次、atlas page 改写、多 symbol 深度不变性和
  Picker no-op parity。
- `apps/symbolseditor/src/ui/resource-picker.ts#applyResourceBinding()` 当前在
  `spine-skeleton` 分支无条件写 `animationName: ""`；value tier skeleton 分支还会无条件
  清空 normal animation 与 slot。即使 `path` 等于当前 path，也会产生重新 author 的工作量。
- 同文件的 `spine-atlas` 分支会由新 atlas 解析 texture path，但普通导入覆盖 atlas 时不会
  调用 Picker；`commitSymbolResourceImport()` 尚无 old atlas page → new atlas page 的 exact
  reference reconcile。
- `apps/symbolseditor/src/ui/workspace-app.ts#importOrdinarySources()` 已在冲突 review 后一次
  replace store，并能报告 `clearedAnimations`；结果模型尚不能表达 atlas texture rewrite、
  Picker 保留/清理详情或统一的 binding reconciliation 摘要。
- `apps/symbolseditor/README.md` 和领域规则已经声明“覆盖保持所有 state/value/node 引用；
  只有缺失 Spine animation 可精确清空”。本任务实现应服从该合同，不把当前缺口写成新规则。
- 当前代码、测试和规则足以确定责任边界，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “替换文件”解释为对已导入 filename key 的新 bytes 做一次显式 overwrite review，
   典型输入是同批 skeleton JSON、atlas 和 page image；不是删除旧资源后重新建 state。
2. 用户已 author 的 symbol/state 配置是 owner-owned 业务数据。资源 bytes 更新不能成为
   清空 animation、slot 或 transform 的信号；是否清理只能由导入后 candidate metadata
   对 exact binding 的兼容性决定。
3. “做第二个 symbol”允许在同一项目中继续导入新 skeleton key，并可能复用共同 atlas；
   已完成的第一个 symbol 不应因上传或在 Picker 中查看/确认同一路径而变化。
4. 若第二套独立资源使用与第一套完全相同的 filename key，选择 overwrite 就表示更新同一
   logical resource。任务不会猜测用户其实想 keep-both；review 必须继续把受影响引用列清楚。
5. atlas page 变化可由 atlas 文本和 batch 内图片唯一确定，因此可以结构化迁移；若旧 binding
   本就不等于该 atlas 的旧唯一 page、存在多 page、缺 page 或类型错误，则不猜测，事务失败。

### 关键决策

1. **以最终 candidate 做一次 reconcile，不按文件到达顺序修改 draft。**
   - prepare 记录覆盖前 typed metadata 和 exact references；commit 先在 clone 中安装整批
     resolved records，再统一计算 old/new Spine resource delta。
   - skeleton、atlas、texture 同批替换只校验最终闭包，避免 JSON、atlas、PNG 逐个到达时的
     临时缺失导致配置被清空。
2. **binding 是否保留由 exact compatibility 决定。**
   - same skeleton key 或改选 compatible skeleton 时，已选 animation 存在则保留；ImgNumber
     slot 仍存在于适用 skeleton 交集则保留。
   - normal/custom state、composite layer 和 value tier 使用一份 typed traversal/reconcile
     helper，避免 UI Picker 与 importer 各自实现不同清理规则。
3. **atlas page 只做可证明的一对一结构化更新。**
   - 对被覆盖且 old/new 都是合法单 page atlas 的 key，找到 exact 绑定该 atlas并引用 old page
     的 state/layer/tier，将 texture path 改为 new page resolved key。
   - atlas key 未变、page 未变时配置对象保持；不扫描任意 PNG、不按 basename/bytes 猜页面。
4. **Picker 采用 idempotent + compatible-preserving mutation。**
   - path 与当前值相同直接 no-op；选择不同 path 时先在 clone/candidate 上解析 metadata，保留
     仍合法的 animation/slot/atlas texture，并复用同一 reconciliation 结果。
   - 需要清理时 UI 必须显示 exact location/field；不能用无条件置空规避校验。
5. **保持现有 public artifact contract。**
   - 修改限于 editor draft/import/UI internal API；rendercore schema、manifest latest、ZIP
     filename keys 和 consumer API 不升版。

## 5. 职责与合同

- **模块职责**：`resource-import.ts` 拥有整批资源 prepare/commit、old/new delta、原子
  reconcile 和结果摘要；`resource-picker.ts` 拥有单字段 typed selection，但复用同一
  compatibility helper；`workspace-app.ts` 只编排 dialog/store 和展示结果。
- **数据/API**：输入是显式 incoming filename key/bytes、review resolutions 和当前 typed
  project；输出是新 project、resolved review 及 readonly reconciliation summary。内部
  summary 至少区分 preserved、rewritten texture、cleared animation/slot；不进入 manifest。
- **资源生命周期**：原 project 与现有 asset records 在 prepare/validation 期间只读；全部
  bytes、metadata 和 draft rewrite 在 clone 上 prepare，完整 export/diagnostics 通过后一次
  replace store。失败丢弃 candidate，不修改原 project、preview 或 Picker selection。
- **失败策略**：未知资源类型、非法 skeleton/atlas、非唯一 page、缺 page image、非法
  animation/slot、stale revision 和新 diagnostics 显式失败。只允许既有合同明确规定的
  missing animation/slot 做 exact 清理；其它不兼容回滚。
- **禁止行为**：不逐 state 重绑、不根据 symbol code/文件名猜资源、不自动首项选择、不把
  overwrite 变成 keep-both、不静默 alias、不保留半提交画面。

## 6. 文件范围

### 预计新增

```text
apps/symbolseditor/src/model/spine-binding-reconciliation.ts
apps/symbolseditor/tests/spine-binding-reconciliation.test.ts
tasks/224-symbolseditor-spine-asset-replacement-<utctime>.md
```

若 shared helper 保持在 `resource-import.ts` 更清晰，可不新增前两个文件，并把测试并入现有
`resource-import.test.ts`；不得为了目录形式制造无意义模块。

### 预计修改

```text
apps/symbolseditor/src/model/resource-import.ts
apps/symbolseditor/src/ui/resource-picker.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/tests/resource-import.test.ts
apps/symbolseditor/tests/resource-picker.test.ts
apps/symbolseditor/tests/app-shell.test.ts
apps/symbolseditor/README.md
```

`editor-project.ts` 只有在 exact visual/value traversal 无法由独立 pure helper 安全完成时才修改；
不扩大其 public API。

### 原则上不应修改

```text
packages/{rendercore,editorresource,browserartifactio,audiocore}/**
apps/{gamelayouteditor,popupeditor,imgnumbereditor}/**
assets/**
docs/agent-rules/**
package.json
pnpm-lock.yaml
```

现有领域规则已经覆盖目标合同。执行时若发现必须修改共享 importer/public API、manifest
schema、lockfile 或其它 consumer，需先说明为何 app 内 transaction 无法满足，不得直接扩张。

## 7. 实施步骤

1. **确认执行基线并固化失败复现**
   - 重核 HEAD/status 和上述权威文件；构造至少两个 symbol、多 state、共同 atlas 的 project。
   - 先添加回归测试证明：完整同 key Spine 批次覆盖后配置被无条件清理/需要 Picker 重选，
     以及 Picker 重新确认当前 skeleton 会清空 animation/slot；测试断言原 project 未变。
2. **建立 typed Spine binding reconciliation**
   - 实现 old/new resource metadata delta 和对 normal/state/composite/value tier 的统一 exact
     traversal；结果用稳定 location/field 描述 preserved、texture rewrite 与 cleared selection。
   - 对 skeleton 检查 animation/slot，对 atlas 检查单 page old→new mapping；同值不重建业务
     对象，非 exact 关联不修改。
3. **接入整批导入 transaction**
   - 在 `commitSymbolResourceImport()` 的 clone 安装全部 resolved records 后调用 reconcile，
     再运行 existing/new diagnostics、headless export closure 校验和 optional candidate mutation。
   - 保留 stale revision、review resolution 和 ImageString invalidation 语义；任何不允许清理的
     incompatibility 使整批失败，原 store/preview 不 commit。
4. **接入 Picker 与 UI 反馈**
   - 将 `applyResourceBinding()` 的 skeleton/atlas/value tier 路径改为 idempotent、兼容保留；
     same-path confirmation 不产生 mutation，不清 animation 或 slot。
   - `workspace-app.ts` 展示结构化结果：兼容覆盖明确写“配置保持”，atlas page rewrite 和
     exact clear 列出位置；取消/失败明确说明项目未修改。
5. **补齐测试、文档与收尾**
   - 覆盖普通/共同 atlas、多 symbol、composite、value tier、same-path Picker、compatible new
     skeleton、missing animation/slot、atlas page change、partial batch、stale revision、rollback
     和 export/preview closure。
   - 更新 README 的美术增量工作流和 overwrite/keep-both 边界；执行第 8 节验收并生成 UTC
     中文报告。

## 8. 测试与验收

### 测试原则

- 以 deep snapshot 证明资源覆盖前后 owner-owned symbol 配置保持，只允许断言中明确列出的
  texture page rewrite 或 exact selection clear。
- model 测试覆盖正常路径、共享引用、复合/value 边界、strict failure 和原 project rollback；
  UI 测试只保护 review/result/Picker 编排，不用 DOM fake 代替 production preview。
- 使用合法 Spine 4.3 skeleton、单 page atlas 和真实可解析图片 fixture；不以缺字段假对象绕过
  metadata/closure 校验。
- 不为错误的“选择 skeleton 必须清空全部字段”旧期望扭曲实现；改为 compatibility-driven
  期望。

### 验收级别

`L1`。改动限于 `apps/symbolseditor` 内部导入/draft/UI，不改变跨 package public API、共享
schema、生成器或 lockfile；目标 app 全量 typecheck/test/build 足以证明直接风险。

### 执行会话必须运行

```bash
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build
pnpm --filter symbolseditor format:check
git diff --check
```

若全量 test 暴露既有失败，先用 `pnpm --filter symbolseditor exec vitest run` 加 exact test
文件最小化复现并记录归因，不扩大为根级验收。

### 人工验收

在真实浏览器使用一份包含至少两个已完成 symbol、normal/win/custom state、共同 atlas 和
一个 composite 或 value-managed symbol 的项目：

1. 同时导入更新后的 skeleton JSON、atlas、page PNG，review 选择 overwrite；确认所有仍存在
   的 animation、slot、transform、layer order、ImgNumber、音效保持，预览立即使用新画面。
2. 再导入 atlas page logical name 改变但闭包完整的批次；确认只更新引用该 atlas 的 texture
   binding，未引用图片和其它 symbol 不变，ZIP 可导出并重导。
3. 导入删除一个已选 animation 的 skeleton，确认只提示并清理 exact 受影响 state；随后导入
   缺 page/slot 的非法批次，确认整个项目、预览和已绑定状态不变。
4. 对任一已配置 state 打开 Picker 并确认当前 skeleton/atlas，确认没有 animation/slot 清空、
   无需逐 state 重新操作。

### 独立验收建议

`建议`。虽不涉及跨包 public contract、credential 或正式 schema，但修改资源覆盖的异步
transaction、exact reference rewrite 和 rollback。独立复验重点是：

```bash
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build
git diff --check
```

并按上述人工场景至少复验一次多 symbol 同批覆盖与失败 rollback。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不新增依赖、不修改 lockfile。依赖缺失时使用：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置仓库约定代理并重试原命令；不因规划会话安装依赖。

## 10. 生成物、文档与规则

- 本任务无 YAML 或代码生成物；不得手改 `dist/`。
- 更新 `apps/symbolseditor/README.md`，给出一次覆盖整批 Spine closure 的推荐流程、兼容保留
  行为、exact clear 提示和 overwrite/keep-both identity 边界。
- `docs/agent-rules/editor-artifacts.md` 已明确 Symbols 覆盖保留 owner 配置、仅缺 animation
  精确清理和其它不兼容回滚，原则上不修改。只有执行发现稳定职责边界确有变化时才最小更新。
- 不向根 `AGENTS.md` 写入任务细节、文件清单或测试证据。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/224-symbolseditor-spine-asset-replacement-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终行为/文件、实际 reconcile 决策、验收命令结果、浏览器验收状态、计划偏差与
剩余风险；不收集无关 coverage、整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- atlas page logical name 改变会影响所有 exact 引用同一 atlas 的 bindings；实现必须以旧 atlas
  metadata + 旧 texture reference 双重匹配，避免误写独立图片。
- value-managed symbol 的 animation/slot 是 tier 交集合同；单个 tier skeleton 更新可能让共享
  selection 失效，不能为了“尽量保留”而让各 tier 偷偷分叉。
- 当前项目若在覆盖前已有 diagnostics，差集校验需继续区分既有问题与本次新增问题；不能让
  既有错误掩盖新的损坏，也不能借本任务自动修复无关旧数据。
- 真实 Spine skeleton/atlas decoder 与 fake metadata 测试可能表现不同，必须保留真实浏览器
  preview/export 验收。

### 假设

- 美术迭代会在一次文件选择或 ZIP 中提供完整、互相匹配的 skeleton/atlas/page image；同 key
  表示同一 logical resource 的新版本。
- animation 和 slot 的 exact name 在新 skeleton 中仍存在时代表合同兼容，可以安全保留选择；
  transform、playback、layer placement 和音效不依赖资源 bytes，无需重置。
- atlas 继续只支持当前 Symbols Editor 合同中的单 page；多 page 能力不在本任务引入。

### 待确认

- 无阻塞项。执行默认按“同 filename-key overwrite 是更新同一资源；独立同名资源不自动
  keep-both”实施。若用户实际要求第二套同名 Spine group 自动共存，应另行规划 structured
  keep-both/namespace rename，而不是改变本任务的 overwrite 语义。
