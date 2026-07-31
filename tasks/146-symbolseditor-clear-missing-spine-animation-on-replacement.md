# 146 symbolseditor-clear-missing-spine-animation-on-replacement 任务计划

## 1. 目标与完成定义

### 目标

调整任务 140 引入的 Symbols Editor 资源替换事务：当覆盖后的有效 Spine skeleton
不再包含已有配置引用的动画时，不再拒绝整批替换，而是在候选 project 中只清空受影响
的 `animationName` 选择，保留 skeleton、atlas、texture、transform、state、tier、
ImgNumber、cascade 和其它未受影响配置。

除“已配置动画在新 skeleton 中不存在”这一项外，资源解析、atlas page、slot、glyph、
closure、版本和其它 typed binding 校验继续保持严格；任何其它失败仍使整批事务回滚。

### 完成定义

- [ ] 覆盖有效 Spine skeleton 时，仍存在于新 skeleton 的动画配置原样保留。
- [ ] 新 skeleton 缺少已配置动画时，替换成功，只清空对应 draft
      `animationName`；不删除 state、不更换 visual kind、不猜测或自动选择其它动画。
- [ ] 普通 Spine state 逐 binding 判断；同一 skeleton 上仍有效的其它 state 动画不被
      连带清理。
- [ ] value presentation 的 normal animation 和 `activeSpine` state 按既有
      “全部档位共享动画”合同处理：任一相关档位不再支持该动画时，只把对应共享
      animation name 清空；normal 必须同步清空所有 tier 的同一字段。
- [ ] 只处理本批次实际 `overwrite` 的 skeleton 所影响的 binding；`add`、`noop`、
      `keep-both` 和未替换 skeleton 不触发清理，也不顺手修复已有无关诊断。
- [ ] 替换与最小清理在 clone 上完成并一次提交；若同批次还有缺 slot、atlas page、
      texture、VNI asset、glyph、closure、版本或解析错误，原 project 和旧 bytes
      全部不变。
- [ ] 导入成功反馈明确报告上传数量和被清空的动画 binding，不再无条件显示
      “现有配置保持不变”；编辑器把这些 binding 呈现为待重新选择。
- [ ] 重新选择新 skeleton 中存在的动画后，preview 与 export 恢复通过；不把空动画名
      当作 production fallback 或导出合法值。
- [ ] 完成 Symbols Editor L1 定向验收、必要浏览器验收和 UTC 中文执行报告。

## 2. 范围

### 包含

- `apps/symbolseditor` 资源替换 transaction 中对已覆盖 Spine skeleton 的引用分析、
  animation name 调和、原子提交和清理结果摘要。
- 普通 `EditorStateVisual.kind="spine"` 的 `animationName`。
- value presentation tiers 的共享 normal
  `tier.animation.playback.animationName`。
- value presentation 非静态 state 的
  `EditorStateVisual.kind="activeSpine"` `animationName`。
- model transaction、UI 成功反馈、状态重新呈现、README、领域规则和直接回归测试。

### 不包含

- 不自动选择新 skeleton 的首个动画，不做同义名、大小写或模糊匹配，不新增 alias。
- 不清除 skeleton/atlas/texture、base visual、transform、tier threshold、text、
  ImgNumber target、slot、cascade、state definition 或其它 owner-owned 配置。
- 不放宽缺 slot、atlas page、texture、glyph、VNI asset、closure、非法版本或损坏
  bytes 的失败策略。
- 不改变 Symbols production manifest/schema，也不允许空 `animationName` 被正式导出。
- 不修改 `editorresource` 的冲突 resolution/suffix public API，不扩展其它 editor。
- 不修改 rendercore Spine parser/player，不新增 dependency，不改 lockfile。
- 不处理用户手动更换 binding、删除 state 或项目 ZIP 导入时的自动迁移。

## 3. 制定计划时的基线

```text
UTC: 2026-07-31T04:44:23Z
HEAD: effb9dfc64e90116077b1bedf973c9ec975e9b13
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

读取的规则和依据：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
tasks/templates/task-plan.md
tasks/140-symbolseditor-asset-replacement-and-zip-import.md
tasks/140-symbolseditor-asset-replacement-and-zip-import-260730-145451.md
apps/symbolseditor/README.md
```

当前代码基线：

- `apps/symbolseditor/src/model/resource-import.ts::
commitSymbolResourceImport()` 在 clone 上上传 resolved items，并通过
  `getProjectDiagnostics()`/`exportSymbolPackageZip()` 复验；任何新增 typed
  diagnostic 都拒绝提交。任务 140 的 missing-animation rollback 发生在这条路径。
- `prepareSymbolResourceImport()` 已为 incoming Spine JSON 调用
  `createEditorAssetRecord()`；有效 skeleton record 的 metadata 已包含严格 introspection
  得到的 `animationNames` 与 `slotNames`，无需复制 Spine JSON parser。
- `EditorStateVisual` 已分开保存 Spine 资源路径、transform 与 `animationName`，清空
  animation name 不要求删除其它字段或改变 schema。
- value presentation 的 normal animation 存在于每个 tier 的
  `animation.playback.animationName`，`validateTieredSpineEditorContract()` 要求各 tier
  值一致；非静态额外 state 使用单一 `activeSpine.animationName`，运行时作用于当前
  tier。
- UI 的 `activeSpineAnimationOptions()` 使用全部 tier skeleton animation 的交集，
  与“任一档位缺少即清空共享选择”的目标一致。
- `workspace-app.ts::uploadResources()` 当前成功消息固定为
  `已上传 ...；现有配置保持不变`，任务 146 后必须根据 transaction 返回的清理摘要
  改写。
- rendercore introspection 是 animation/slot metadata owner；production manifest
  prepare 继续严格拒绝 missing animation 和 missing slot。
- `apps/symbolseditor/tests/resource-import.test.ts` 当前只覆盖普通图片 overwrite 与
  keep-both，尚无 Spine overwrite 的保留、最小清理和混合失败 rollback 测试。

## 4. 需求解释与技术决策

### 需求解释

- “动画不存在”特指：本批次按原 filename key 覆盖一个或多个有效 Spine skeleton
  后，已有 binding 的非空 exact `animationName` 不在其所依赖的新
  `animationNames` 中。
- “把这个动画的配置清掉”解释为只把对应 editor draft 的 `animationName` 设为
  空字符串，使 UI 回到“请选择动画”的未完成状态；资源 binding 和其它属性继续保留。
- “别的配置依然保留”既包括同一 visual 上的其它字段，也包括同一 project 中未受
  影响的 symbol/state/tier/node。不得通过删除整个 animation spec、state 或 visual
  kind 来绕过校验。
- 空 animation name 是 authoring 阶段的待配置状态，不是 runtime 的 `empty`
  resource kind，也不是 production fallback。用户仍需显式选择一个存在的动画才能
  完成 preview/export。
- 若替换同时暴露 missing slot 等非动画问题，不能通过清空更多配置让替换通过；
  仍按任务 140 的 transaction 合同整批回滚。

### 关键决策

1. **只调和已覆盖 skeleton 的受影响 binding**
   - 从 resolved review 中收集 `action="overwrite"` 且 candidate kind 为
     `spine-skeleton` 的 target keys。
   - 在 candidate project 上传新 bytes 后遍历 exact skeleton references；新增、
     noop、keep-both 或仅覆盖 atlas/texture 时不运行清理。
   - 这样不会把资源导入变成全项目自动修复，也不会改变 task 140 的 conflict 合同。

2. **普通 state 逐项最小清理**
   - 对 `visual.kind="spine"`，只有其 `skeletonPath` 命中覆盖集合且非空
     `animationName` 不在新 metadata 中时才清空该字段。
   - `baseVisual`、三条 resource path、transform、state lifecycle 和 sibling state
     保持 byte-for-byte/structural parity。

3. **tiered Spine 按共享字段的真实作用域清理**
   - 若本批次覆盖了该 symbol 任一 tier skeleton，则以提交后全部 tier skeleton 的
     animation intersection 判断已选 normal/activeSpine animation。
   - normal 不再位于交集时，将所有 tier 的 normal `animationName` 一起清空，维持
     “全部档位共用同一个 normal animation”的已有不变量。
   - 某个非静态 state 的 activeSpine name 不在交集时，只清空该 state 的单一
     `animationName`；其它 activeSpine state 和静态 reel state 不变。

4. **使用 typed 清理结果，不解析错误字符串**
   - transaction 返回 readonly 清理摘要，至少包含 binding location、旧
     animation name 和关联 skeleton key；UI 只负责展示。
   - missing animation 由 metadata/reference graph 结构化识别，不从 rendercore
     英文报错中截取名称，也不把所有新 diagnostic 静默忽略。

5. **预期未完成状态与其它不兼容必须分开验证**
   - 调和前后都在 candidate clone 上工作；先验证 candidate record、Spine closure、
     atlas/texture 和所有受影响 exact slot。
   - 清理后允许清理摘要对应的 animation selection 进入 authoring “missing” 状态；
     其它新增 typed incompatibility 仍阻止 commit。
   - 验证实现必须使用结构化字段或明确的 app-owned validation result，不能用
     `catch` 后按 message 包含 `missing animation` 放行，因为这会掩盖同批次后续错误。

6. **成功反馈如实披露 mutation**
   - 无清理时继续说明配置保持不变。
   - 有清理时报告数量并列出/可查看 binding location 与旧动画名，使用户知道需要
     重新选择；不得只显示笼统“替换成功”。

## 5. 职责与合同

- **rendercore introspection**：继续严格解析 Spine 版本并产出
  `animationNames/slotNames`；不增加 fallback 或 replacement policy。
- **Symbols project model**：拥有 editor draft 的 exact reference traversal 和最小
  animation-name mutation；不解析 ZIP/hash/conflict choice。
- **Symbols resource import coordinator**：从 resolved overwrite items 确定影响集合，
  在 clone 上执行 reconcile、非动画兼容校验并一次 commit，返回 typed 摘要。
- **Symbols UI**：展示清理摘要与待选择状态；不自行扫描 skeleton、不猜动画名。
- **原子性**：prepare 和 reconcile 不修改 active project；任一非预期错误都丢弃
  clone，成功后仅调用一次 `store.replace()`。
- **失败策略**：损坏/未知 JSON、错误 Spine 版本、atlas/page/texture/slot/closure
  不匹配、VNI/ImgNumber 不兼容继续显式失败。
- **禁止行为**：不自动选首项、不字符串匹配错误、不清整个 state/tier、不产生
  placeholder、不把空动画导出为合法 runtime 配置。

## 6. 文件范围

### 预计新增

```text
tasks/146-symbolseditor-clear-missing-spine-animation-on-replacement-<utctime>.md
```

若 reconciliation 测试与现有文件职责明显不合，可新增一个 Symbols model test file；
默认优先扩展现有直接测试。

### 预计修改

```text
apps/symbolseditor/src/model/resource-import.ts
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/tests/resource-import.test.ts
apps/symbolseditor/tests/app-shell.test.ts
apps/symbolseditor/README.md
docs/agent-rules/editor-artifacts.md
```

若 exact traversal 能保持在 `resource-import.ts` 内且不复制 project 语义，则
`editor-project.ts` 可不改；不能把 model mutation 反向散落到 DOM handler。

### 原则上不应修改

```text
packages/editorresource/**
packages/rendercore/**
packages/browserartifactio/**
packages/vnicore/**
apps/{imgnumbereditor,popupeditor,gamelayouteditor,game002,game003}/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

执行时若发现只有修改 rendercore public validation API 才能结构化区分 animation 与
其它 Spine 错误，必须先给出最小复现和扩大理由；不能用错误字符串过滤代替。

## 7. 实施步骤

1. **确认执行基线并固定现有失败**
   - 重新核对 HEAD/status、根规则、editor-artifacts、本计划和任务 140 transaction。
   - 添加一个有效 replacement skeleton 缺少旧 animation 的失败测试，证明当前
     `commitSymbolResourceImport()` 拒绝且 active project/bytes 未被修改。

2. **建立 typed Spine animation reconciliation**
   - 从 resolved review 精确计算 overwritten Spine skeleton keys。
   - 在 candidate project 中实现普通 spine visual、tier normal 和 activeSpine
     state 的遍历与 animation intersection 判断。
   - 只清空不再存在的非空 animation name，生成稳定、无重复、可测试的清理摘要。

3. **拆分预期清理与严格 compatibility validation**
   - 保持 incoming record diagnostics、closure、atlas page/texture、slot、VNI、
     ImgNumber 和其它 project invariants 的原有失败语义。
   - 让清理摘要对应的空 animation selection 可随 draft 提交，但不允许它伪装成
     export-ready；其它新增错误仍 rollback。
   - 对 candidate project 做 semantic parity 断言：除 resolved bytes/provenance 和
     摘要列出的 exact animation-name 字段外，owner-owned 配置不得变化。

4. **接入 import result 与 UI**
   - 扩展 `commitSymbolResourceImport()` 结果，返回清理摘要。
   - `uploadResources()` 根据摘要输出准确成功反馈；重新 render 后，对应 animation
     select 为空且 state/tier 标为未完成，资源选择与其它字段仍可见。
   - 保留 request token、cancel、preview error 和 store transaction 的任务 140
     生命周期，不增加第二次隐式提交。

5. **补齐回归矩阵**
   - 覆盖动画仍存在、单 state 缺失、同 skeleton 多 state 只清缺失项、未关联
     skeleton 不清理。
   - 覆盖 tier normal 全组清空、activeSpine 单 state 清空、其它 tier/value/text/
     ImgNumber/cascade 配置 parity。
   - 覆盖 missing slot/atlas page/closure 和“animation 清理 + 另一成员失败”的整批
     rollback。
   - 覆盖 UI 成功摘要、待选择状态，以及重新选择有效动画后 preview/export 恢复。

6. **文档、规则与报告**
   - 更新 Symbols README，说明 overwrite 的 missing-animation 唯一例外、最小清理
     与重新选择要求。
   - 更新 editor-artifacts 稳定合同，将任务 140 的“一律整批回滚”细化为：missing
     Spine animation 只清 exact animation selection；其它 typed incompatibility
     仍 rollback。
   - 运行 L1 定向验收和人工清单，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 使用最小合法 official Spine 4.3 skeleton/atlas/texture fixture，明确控制
  `animationNames` 与 `slotNames`；不依赖开发机 Downloads。
- 对项目做深层 semantic snapshot 比较，允许变化只包括目标 asset bytes/batch metadata
  和清理摘要列出的 animation-name 字段。
- 同时断言传入的原 project 不变，证明 clone/rollback 边界。
- 不为让 replacement 通过而弱化 production parser；空 animation 只表示 editor
  draft 未完成。

### 验收级别

`L1`。改动限定在 `apps/symbolseditor` package 内部 transaction/model/UI；不改变跨包
public API、production schema、生成器或 lockfile。领域规则更新只是同步这一 app-owned
稳定行为，不触发 L2。

### 执行会话必须运行

```bash
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build
pnpm --filter symbolseditor format:check
git diff --check
```

失败时先运行 `resource-import.test.ts` 或 `app-shell.test.ts` 的最小复现，不扩大到根级
typecheck/test/build。

### 人工验收

- 打开一个已配置多个 Spine states 的 Symbols project，以同名新 skeleton 覆盖：
  保留其中一个旧动画、删除另一个。确认替换成功，只缺失项变为“请选择动画”，资源、
  transform、其它 state 和 preview 可观察状态符合摘要。
- 对 value presentation project 覆盖一个 tier skeleton，使 normal 或一个
  activeSpine state 不再位于 tier intersection；确认共享字段按组最小清理，tier、
  ImgNumber、slot、threshold 和静态 reel state 不变。
- 用缺必需 slot 或不匹配 atlas 的替换复验 rollback；再选择新 skeleton 中存在的动画，
  确认 preview 和 export 恢复。

### 独立验收建议

`建议`。因涉及资源替换 transaction 与用户配置 mutation，独立复验 Symbols Editor
test/typecheck、`git diff --check`，并人工抽查普通与 tiered Spine 各一次。

## 9. 环境与依赖

- 使用仓库要求的 Node 24；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用 pnpm，不切换 npm/yarn。依赖缺失时才运行
  `CI=true pnpm install --frozen-lockfile`；真实下载失败后才设置已有本地代理重试。
- 复用现有 editorresource resolution、rendercore introspection 和 Symbols model，
  不新增依赖，`pnpm-lock.yaml` 不应变化。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、production manifest 或生成文件，不运行无关生成器。
- Symbols README 记录 replacement 后 missing animation 的最小清理、可见摘要和
  重新选择后方可 export。
- `docs/agent-rules/editor-artifacts.md` 只更新稳定 Symbols replacement 合同，不写
  任务号、测试数量或一次性资源清单。
- 不修改根 `AGENTS.md`；职责边界未发生跨领域变化。

## 11. 执行报告

执行完成后创建：

```text
tasks/146-symbolseditor-clear-missing-spine-animation-on-replacement-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 实际 reconciliation 规则、清理摘要与修改文件；
2. 普通/tiered Spine 最小清理和其它错误 rollback 证据；
3. 实际验收命令与结果；
4. 人工 preview/export 验收是否完成；
5. 计划偏差、剩余风险和未完成项。

不收集无关 coverage、完整历史矩阵或整仓统计。

## 12. 风险、假设与待确认

### 风险

- tiered normal 在多个 tier 中重复保存；只清一个 tier 会违反共享合同，因此必须作为
  一个逻辑 binding 同步清空。
- 清理产生的 authoring incomplete diagnostic 可能掩盖同批次其它错误；validation
  必须结构化分层，不能简单忽略首次 export error。
- 一个 skeleton 可被多个 symbol/state 引用；遍历遗漏会让 preview/export 延迟失败，
  需要 reference matrix 和 semantic parity 双重保护。
- 成功后 preview 可能因待选择动画暂不可用；UI 必须把它呈现为明确的待配置状态，不能
  误报为资源替换 rollback，也不能静默显示旧 preview。

### 假设

- “清掉动画配置”指清空 exact `animationName`，不删除整个 state/animation visual。
- value presentation 的共享 normal/activeSpine 继续以全部 tier animation 交集为
  可选集合。
- 用户接受替换后相关 state 暂时未完成，并会显式选择新动画；系统不自动猜测替代项。
- 只有实际 overwrite 的 skeleton 能触发本任务行为；完整 Symbols project ZIP 的
  import validation 不在本任务中放宽。

### 待确认

无。以上边界可由用户要求、任务 140 现状和当前 editor model 合同确定。

## 13. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、editor-artifacts、本计划和任务 140 报告；
2. 先用 Spine replacement test 固定现有 rollback，再实现 typed reconciliation；
3. 保持 mutation 在 candidate clone 内，不在 UI 或 rendercore player 中加 fallback；
4. 用结构化 metadata/reference 验证，不按错误消息字符串放行；
5. 若需跨到 rendercore public API，先说明缺失的结构化能力和最小扩大范围；
6. 只运行计划规定的 L1 与人工清单，生成 UTC 中文报告；除非用户要求，不
   commit/push/创建 PR。
