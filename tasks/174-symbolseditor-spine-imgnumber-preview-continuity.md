# 174 symbolseditor-spine-imgnumber-preview-continuity 任务计划

## 1. 目标与完成定义

### 目标

修复 `apps/symbolseditor` 中命名 ImgNumber 的共享 Spine slot、非 Spine 状态预览和
档位预览体验，并收紧 `packages/rendercore` 的 instance 连续性：

- 普通 symbol 的多个 top-level Spine state 在“Normal 共享配置”中列出所有这些
  skeleton 的 slot 交集；value-managed symbol 继续列出全部 tier skeleton 的 slot 交集。
- 相同 Spine 资源在 normal/win/appear 等状态之间只切换 animation，不因 semantic state
  改变创建第二个 official Spine player；资源或 value tier 真正改变时才允许重建。
- 已配置 exact non-Spine `spinBlur` / `disabled` target 的命名 ImgNumber 在预览中可见；
  `spinBlur` 使用已 prepare 的模糊 profile，`disabled` 沿用 normal profile，二者均复用
  同一个 renderer/container。
- 每个 value tier 可在档位卡中设置并启用一个只用于当前编辑会话的预览数值，预览同时
  命中该档 Spine、该档 ImgNumber JSON 和输入的实际 string。

### 完成定义

- [ ] 普通 symbol 至少两个 top-level Spine state 使用有交集的 slot 时，命名 ImgNumber 的
      “Normal 共享配置”下拉稳定显示交集；任一 state 不含的 slot 不出现。
- [ ] value-managed symbol 的共享 slot 候选仍严格来自全部 tier skeleton 的交集；普通
      state Spine 与 tier Spine 不再误用同一个空集合入口。
- [ ] 同一 occurrence、同一 exact skeleton/atlas/texture/atlas-page 的 top-level Spine
      state 切换只创建一个 player 并调用不同 animation；value-managed symbol 在同一 tier
      内的 normal/win/appear/remove 同样只使用一个 tier player。
- [ ] exact Spine 资源或命中的 value tier 改变时明确重建并释放旧 player；不按文件名、
      hash 相似或 slot 相同错误合并不同资源。
- [ ] value player 在异步初始化完成前后切到 `spinBlur` 或 `disabled`，均不得把命名
      ImgNumber 从 direct overlay 抢回不可见 Spine slot；来回切换不创建第二个 ImgNumber。
- [ ] `spinBlur` 显示模糊 ImgNumber profile，`disabled` 显示 normal ImgNumber profile；
      manual preview string、特殊值映射、slot transform 和颜色合同保持不变。
- [ ] 每个 tier 卡可输入属于该 tier 区间的 positive safe integer 并将其设为当前预览；
      UI 明确标识当前预览档位，非法或越界值显式报错且不替换上一次有效预览。
- [ ] tier 预览值只保存在 `SymbolsEditorUiSession`，新建/打开项目时重置，不进入
      symbol manifest、package ZIP、资源闭包或 undo transaction。
- [ ] Symbols ZIP canonical/legacy round-trip、任务 170 的 shared Normal 合同、任务 171
      的 blur dependency 去重以及无 ImgNumber symbol 的行为保持不变。
- [ ] 定向自动化通过，并用真实 Spine 4.3、普通/模糊 ImgNumber 和多档资源完成浏览器
      人工视觉验收。

## 2. 范围

### 包含

- `apps/symbolseditor` 的共享 slot 候选计算、ImgNumber/tier 表单、preview session 状态和
  per-symbol preview cell value。
- `packages/rendercore` 命名 ImgNumber controller 对 shared Spine state、exact direct state、
  late async activation 和 normal/blur profile 的 attachment 边界。
- 现有 top-level Spine player cache 与 value tier player ownership 的回归保护。
- Symbols Editor、rendercore 的定向测试、README 和最小领域规则同步。

### 不包含

- 不修改 symbol manifest、image-string manifest 或 package manifest 的 version/schema；
  不把预览数值导出为业务配置。
- 不把每个 Spine state 的资源字段迁移为新的 shared-resource schema，也不强制历史包中
  不同 state 使用同一 skeleton；只有 exact runtime resource identity 相同时复用 player。
- 不让 composite state 的不同 Spine layer 共享 player；每个 composite leaf 继续拥有独立
  `instanceKey` 和生命周期。
- 不为 `disabled` 生成第二份 ImgNumber dependency，不增加任意 state effect DSL，也不改变
  任务 171 只为 `spinBlur` 生成派生 profile 的合同。
- 不修改 standalone `apps/imgnumbereditor`、Popup、Scene Layout、游戏业务 resolver、正式
  `assets/**`、生成器、lockfile 或根工具链。
- 不复制 Spine/player/image-string 状态机到 editor preview，不用 DOM 假预览替代 Pixi runtime。

## 3. 制定计划时的基线

```text
UTC: 2026-08-06T05:13:05Z
HEAD: 83b678b6de3ce633d4446cae21610d83a207ec3c
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md`、
  `docs/agent-rules/shared-game-runtime.md`、`apps/symbolseditor/README.md`、
  `packages/rendercore/README.md`，目标目录没有补充 `AGENTS.md`。
- 已核对任务 169～171 的计划/执行结果；当前代码已经落地 per-tier ImgNumber、shared Normal
  slot、单 ImgNumber container 和 `spinBlurProfile`，本任务修复其组合后的 UI/runtime 缺口，
  不重做这些 schema。
- `imageStringInspectorMarkup()` 当前把 `valueSlotOptions()` 同时用于普通命名 node 的
  shared slot；该函数只遍历 `symbol.valuePresentation?.tiers`，所以普通多状态 Spine 没有
  value presentation 时必然返回空数组。位置：
  `apps/symbolseditor/src/ui/workspace-app.ts`。
- 普通 top-level Spine state 的 skeleton `slotNames` 已由资源导入/introspection 写入
  `EditorAssetRecord.metadata`；无需重新解析 skeleton 或新增资源表。legacy exact state target
  已按目标 state 单独读取 `slotNames`。
- `SpineSymbolAni` 的 cache key 已排除 animation name并包含 symbol、instanceKey、exact
  skeleton/atlas/texture/atlasPage；`spine-animation.test.ts` 已证明同资源 normal/win 两个 owner
  共用一个 player，最后 owner 才 destroy。不同资源与 composite leaf 仍隔离。
- `RenderSymbolValueControllerModel` 已让一个 value tier player 在 normal/win/remove/dropdown
  之间只切 animation；只有 value 命中不同 tier、release 或 destroy 才销毁 player。
- `SymbolImageStringController.syncState()` 已用 `spineStates` 判断 shared slot 是否能连续保留，
  但 `activate()` 只要存在 `spec.spineSlot` 就会尝试 attach，没有再次确认当前 state 是否为
  Spine-backed。value player 的 `initializePlayer()` 晚到后会用当前 `spinBlur/disabled` state
  通知 activation，因此可能把 direct overlay 的同一 ImgNumber 移到当前不可见的 Spine player，
  与用户现象一致。
- preview 当前用 `SymbolsEditorApp.#previewValue = 1` 对所有 value symbol 传同一个值；toolbar
  虽有通用 `Value` input，但档位卡没有当前 tier、区间合法性或 per-symbol value 控件，不能
  明确联动所编辑 tier 与该 tier 的 ImgNumber。
- `createPreviewCells()` 已支持为每个 cell 传 `value` 和命名 node string；无需修改
  `SymbolEditorPreview` 或引入新的 preview runtime。

## 4. 需求解释与技术决策

### 需求解释

- “每个状态的 spine 的 slot 公共部分”指一个普通 symbol 所有 top-level `kind: "spine"`
  state skeleton 的 exact slot-name 交集；不包含 VNI、图片、空状态或 composite leaf。
- value-managed symbol 的 top-level Spine 来自当前 tier player，故共享 slot 继续取所有 tier
  skeleton 的交集，确保任意预览/运行档位都能绑定。
- “尽量保证一个 instance”指同一 `RenderSymbol` occurrence 内、exact Spine 资源身份相同或
  同一 active value tier 时复用一个 official player；不同资源不能为了数量少而错误复用。
- `spinBlur` 的“生成模糊 ImgNumber”只决定 profile assets；node 是否在某状态显示仍由 exact
  non-Spine target 决定。`disabled` 没有派生 profile时显示 normal assets，不静默隐藏。
- “档位配置预览数值”解释为每张 tier 卡的 preview-only input。输入成功后该 symbol 的预览
  使用该值，进而由现有 threshold resolver 命中 tier，并把同一个值传给该 tier ImgNumber。

### 关键决策

1. **拆分普通 state 与 value tier 的 slot 交集 helper。**
   - 普通 helper 遍历 top-level `EditorSpineVisual.skeletonPath`；value helper保留当前 tier逻辑。
   - 两者都使用已准备的 metadata，并保留首集合顺序，避免重复 parser和不稳定排序。
2. **不新增 shared Spine schema。**
   - manifest 继续逐 state 声明资源，runtime 按 exact resolved resource key共享 instance；历史包、
     不同动画 transform和显式不同资源都保持可表达。
3. **attachment 资格由当前 state capability 决定。**
   - canonical `spineSlot` 只有在 `definition.spineStates.has(state)` 时可交给 player；legacy
     `{state, slot}` 仍按 exact target工作。late/stale activation不得覆盖direct overlay/hidden状态。
4. **预览值属于 UI session，不属于 draft。**
   - session 为 symbol/tier 保存最后一个有效预览值和当前激活 tier；初值优先使用落在该区间的
     `defaultValues`，否则用区间内最小正整数。
   - 输入必须为 positive safe integer 且满足前一档上界 `<= value < 本档 maxExclusive`；最后一档
     只校验下界。阈值、tier移动/删除后由 session normalize丢弃失效项并重新派生，不修改manifest。
5. **preview cell 按 symbol取值。**
   - 移除单一 `#previewValue` 作为全项目事实来源；无 value presentation的symbol不携带value。
   - toolbar不保留与档位卡冲突的第二套可编辑value；state、replay、zoom行为不变。

## 5. 职责与合同

- **Symbols Editor UI**：枚举 exact metadata、维护 preview-only tier value、显示当前 tier/错误，
  并把 per-symbol value与manual string传给现有 preview API。
- **rendercore**：拥有 Spine player cache、value tier player、slot attach/detach、profile切换和
  renderer/container生命周期；editor不接触Pixi内部display tree。
- **数据/API**：不增加public schema/API。canonical `spineSlot + non-Spine targets[]`、legacy exact
  target和`spinBlurProfile`输入输出保持原样。
- **资源生命周期**：same-resource state切换先取得共享player owner再释放旧ani；late init必须核对
  request/state/attachment资格。tier改变、pool release和destroy释放旧player一次且不遗留slot object。
- **失败策略**：空slot交集、非法preview value、缺profile资源/target、未知state和坏slot继续显式失败；
  不选择首slot、不猜同资源、不回退字体/placeholder或隐藏错误。
- **禁止行为**：不增加第二个ImgNumber instance、第二份preview manifest、按文件名合并Spine、
  runtime像素生成或editor私有player状态机。

## 6. 文件范围

### 预计新增

```text
无
```

### 预计修改

```text
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/ui/ui-session.ts
apps/symbolseditor/tests/app-shell.test.ts
apps/symbolseditor/tests/ui-session.test.ts
apps/symbolseditor/README.md
packages/rendercore/src/symbol-image-string/controller.ts
packages/rendercore/tests/symbol-image-string/controller.test.ts
packages/rendercore/tests/symbol-value-presentation/render-symbol-value-controller.test.ts
packages/rendercore/README.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
```

### 原则上不应修改

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts
apps/symbolseditor/src/preview/symbol-preview.ts
apps/imgnumbereditor/**
apps/{popupeditor,gamelayouteditor,game002,game003,gameviewer,gameviewer2}/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

若定向测试证明现有 player cache/value controller 本身未满足同资源单 instance 或 late-init
request guard，才允许修改上列对应 runtime 文件；这属于计划内最小修复，但必须在执行报告说明
触发证据。若需要 schema/version、composite ownership 或正式 assets 变化，停止并重新确认范围。

## 7. 实施步骤

1. **确认执行基线**
   - 重新核对 HEAD、工作区、任务 170/171 合同和上述目标文件。
   - 用现有 fixture/最小测试分别复现普通 state slot 空列表、late value-player 抢占 direct
     ImgNumber和单一全局preview value，不先扩大到完整浏览器调试。

2. **修复共享 slot 候选**
   - 在 `workspace-app.ts` 将普通 top-level Spine slot交集与value tier slot交集分开。
   - 命名node的`Normal共享配置`调用与symbol形态匹配的helper；legacy exact target仍读取目标
     skeleton自己的slots。零交集时保留空列表和未完成状态，不猜首项。
   - 在app-shell测试中使用至少两个slot集合，覆盖交集、非交集排除和tiered行为不回归。

3. **收紧 ImgNumber state/player attachment**
   - 调整`SymbolImageStringController.activate()`：shared `spineSlot`必须同时满足当前state在
     prepared `spineStates`内；否则只允许exact legacy slot，或由`syncState()`保留direct overlay/hidden。
   - 覆盖value player init在请求non-Spine状态之前/之后完成两种顺序，以及
     normal↔spinBlur↔disabled↔normal往返；断言container identity、profile textures、attach/remove次数。
   - 复验现有top-level cache和同tier active Spine测试仍只创建一个player；不同tier继续重建。

4. **实现档位内预览数值**
   - 在`SymbolsEditorUiSession`增加per-symbol/per-tier preview value与active tier状态、区间校验、
     normalize/reset；它不经过store transaction。
   - 每张tier卡显示preview input、区间和当前标识。有效变更立即刷新preview并选中该tier；非法值
     显式呈现且保留旧有效值。
   - `createPreviewCells()`按symbol解析active preview value，传给现有
     `RenderSymbol.setPresentationValue()`；manual named string继续独立传入。
   - tier新增、删除、移动或threshold改变后清理失效session key并确定有效current tier；移除/替换
     toolbar旧全局value输入，避免双重来源。

5. **同步测试、文档与规则**
   - UI测试覆盖preview值不写入export snapshot/ZIP、不同symbol互不串值、边界值选择正确tier、
     ImgNumber cell得到同一value以及项目替换重置。
   - runtime测试覆盖late activation不抢direct overlay、blur/disabled profile语义和destroy幂等。
   - 更新两个README和最小领域规则，记录slot交集、same-resource player复用、non-Spine late-init
     attachment及preview-only value边界；不把任务编号或fixture清单写入根规则。

6. **验收与报告**
   - 按第8节执行L2定向命令，再完成真实浏览器视觉验收。
   - 生成UTC中文执行报告，记录是否触发原则上不应修改的runtime文件及未完成人工项。

## 8. 测试与验收

### 测试原则

- UI测试证明候选、session与preview输入流；rendercore测试证明真实owner/attachment生命周期，
  两者不能互相替代。
- 复用现有真实Crave Spine metadata/ImgNumber fixture或最小合法fixture，不用手写slot列表绕过导入。
- 对异步init至少覆盖完成前切state、完成后切state、重复通知和destroy，不接受只测同步happy path。
- 现有single-player测试若已完整证明不变合同，不复制另一套fixture；只补本任务新增race断言。

### 验收级别

选择`L2`：rendercore共享runtime行为变化并由Symbols Editor直接消费，需同时验证修改package与直接
consumer；不改public schema、生成器、lockfile或根工具链，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol-image-string/controller.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts tests/symbol/spine-animation.test.ts
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor exec vitest run tests/app-shell.test.ts tests/ui-session.test.ts
pnpm --filter symbolseditor build
git diff --check
```

失败时先运行单个测试文件/用例最小化，不立即运行根级typecheck、lint、test、build或coverage。

### 人工验收

1. 启动Symbols Editor，导入一个普通symbol：normal/win/appear共用同一Spine资源但动画不同；
   确认Normal共享slot只列三者交集，切换state连续播放且无可见instance闪换。
2. 为命名ImgNumber配置shared slot、manual string、exact `spinBlur`和`disabled` target，生成blur
   profile；反复切normal/spinBlur/disabled，确认两种非Spine状态均显示，blur外观只在spinBlur生效。
3. 使用DevTools/debug spy检查上述切换始终是一个ImgNumber container、同资源一个Spine player；
   改成不同Spine资源时旧player被释放且新player只创建一次。
4. 导入至少两档且每档ImgNumber JSON外观不同的value symbol；在每张tier卡分别输入边界内数值，
   确认当前tier Spine和该档ImgNumber/string一起变化，越界值报错且画面保留上次有效结果。
5. 导出并重导Symbols ZIP，确认preview-only数值没有进入包，正式state/ImgNumber配置无损。

### 独立验收建议

`建议`。风险集中在共享resource ownership、late async init与同一container跨slot/overlay切换。独立验收
重点复查：

1. same-resource/different-resource player计数与最后owner destroy；
2. late value-player init期间spinBlur/disabled direct overlay不被抢占；
3. `pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol-image-string/controller.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts`。

## 9. 环境与依赖

- 使用仓库要求的Node 24和pnpm；shell没有Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时运行`CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才设置`http_proxy/https_proxy=http://127.0.0.1:1087`并重试原命令。
- 本任务不新增依赖、不修改lockfile、不切换npm/yarn。

## 10. 生成物、文档与规则

- 本任务不修改YAML或生成文件，不运行symbol/game生成器。
- `apps/symbolseditor/README.md`记录普通/tier slot交集和档位内preview-only value工作流。
- `packages/rendercore/README.md`澄清shared slot只在Spine-backed state attach、late init不得覆盖direct
  overlay，以及exact同资源player复用边界。
- `editor-artifacts.md`与`shared-game-runtime.md`只更新稳定职责/生命周期，不记录具体fixture或执行证据。
- 根`AGENTS.md`、manifest版本和精确资源清单不变。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/174-symbolseditor-spine-imgnumber-preview-continuity-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/文件、关键决策与偏差、六条验收结果、人工验收状态、剩余风险；不收集
无关coverage、历史矩阵、全仓统计或profiler数据。

## 12. 风险、假设与待确认

### 风险

- value player异步init与state切换交错，修复若只看当前player而不看state capability，仍可能在
  快速normal↔static往返时出现一次错误detach/attach。
- same-resource cache按manifest exact路径/resource identity工作；相同bytes但不同logical key不会
  自动合并，这是ownership正确性而非性能缺陷。
- preview tier值可能因threshold编辑、tier移动/删除而失效；session normalize必须避免旧index串档。
- 自动化可证明identity和attachment调用，但不能证明真实Spine slot可见性、blur外观或闪帧。

### 假设

- 用户所说的slot“公共部分”只指top-level Spine states；composite leaf按现有独立player合同排除。
- `disabled`未要求派生ImgNumber assets，使用normal profile并由exact target控制显示。
- 档位预览值是authoring/session偏好，不是游戏默认值或发布manifest字段。

### 待确认

无。上述解释与当前shared Normal、exact non-Spine target、value threshold和preview职责边界一致。

## 13. 完成清单

- [ ] 普通/tier Spine slot交集、同资源player复用和不同资源重建均符合计划。
- [ ] spinBlur/disabled在同步与late-init顺序下可见且只用一个ImgNumber container。
- [ ] 每档preview value、区间校验、per-symbol隔离与session-only边界满足需求。
- [ ] legacy target、canonical schema、blur dependency、ZIP闭包和无关consumer未回归。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] README和两个领域规则已同步，未修改根规则/生成物/lockfile。
- [ ] 指定L2自动化已通过，真实浏览器验收与独立验收状态已记录。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划、`editor-artifacts.md`和`shared-game-runtime.md`；
2. 核对Git基线、工作区及任务170/171当前实现；
3. 先用定向测试固定三个缺口，再按计划实施，不重新设计schema；
4. 小幅文件适配写入报告；触发schema/composite/assets/lockfile扩张时先停止说明；
5. 只运行第8节L2命令并明确区分自动化与真实浏览器验收；
6. 完成后生成UTC中文执行报告；
7. 除非用户明确要求，不commit、不push、不创建PR。
