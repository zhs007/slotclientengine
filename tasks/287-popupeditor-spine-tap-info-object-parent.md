# 287 popupeditor-spine-tap-info-object-parent 任务计划

## 1. 目标与完成定义

### 目标

在 Popup Editor 的普通 Spine 弹窗“项目”配置中增加一个可选的 `tap info` 子对象挂载点。项目只声明将来承载 tap info 子对象的父节点：
主 Spine 的一个 exact slot，或当前 Spine Popup overlays 中某个 VNI 图层的 exact 文字图层；不在该配置中选择、复制或打包 tap info 对象本身。

该配置进入 strict Popup production manifest，供后续 consumer 按 typed contract 绑定 tap info 子对象。未配置时不生成字段，现有 Spine Popup 的画面、资源闭包、
start→loop→end、点击关闭和导入导出行为保持不变。

### 完成定义

- [ ] 普通 Spine Popup 的项目页显示可选“Tap info 子对象父节点”；默认/清空为未配置，award、single-state 与 Popup Object 项目不显示该配置。
- [ ] 父节点候选只来自已选择主 Spine resource 的大小写精确 slot，以及当前 `spine.overlays` 中有效 VNI layer 的全部 exact `type="text"` 图层。
- [ ] 选择主 Spine 时保存 exact slot；选择 VNI 时保存 exact overlay layer id + VNI text layer id。展示 label/name 不作为持久 identity，也不按唯一候选自动选择。
- [ ] Popup v9 Spine manifest 可选保存 `spine.tapInfoObject.attachment`；其 union 只允许 main-Spine slot 或 VNI text layer，不接受 Popup root、overlay Spine slot、
      layer transform、order、resource、object id、visibleStates 或其它未知字段。
- [ ] 未配置时 manifest 省略 `tapInfoObject`；合法旧 v1–v9 Popup 导入后保持未配置，重新导出不产生隐式默认挂载点。
- [ ] 配置的 main Spine slot、VNI overlay 与 text layer 在 parser/project transaction 后的 resource prepare 边界再次严格验证；资源替换、layer rename/delete 或
      VNI 内容变化造成悬空引用时显式失败，并保留最后一次合法 project/preview。
- [ ] Popup ZIP 导出、重开与再次导出精确保留可选挂载点；该字段不新增 asset reference，不改变 exact package closure、namespace/materialize 或 production ZIP vendoring。
- [ ] 配置本身不实例化 tap info Popup Object，也不创建 Container/ticker/input/completion；实际对象来源、绑定 API、显示状态和生命周期不属于本任务。
- [ ] 完成 L2 定向自动化、真实浏览器人工验收说明、最小长期文档更新和任务 287 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/popup/data` 的 v9 Spine Popup 可选 tap info mount contract、strict parser、source-version gate 与 public type。
- `packages/rendercore/popup/core` 对 mount target 的 official Spine slot / prepared VNI exact text layer交叉验证。
- `apps/popupeditor` 的项目模型、创建/导入缺省值、项目页候选选择、transaction diagnostics、ZIP round-trip 与 production preview rebuild。
- Popup manifest、Popup Editor/RenderCore README 和最小 Editor artifact 领域规则说明。

### 不包含

- 不在 Spine Popup 中选择、导入、内嵌或自动查找名为 `tap-info` 的 Popup Object resource；不按 object name、ZIP filename、唯一资源或首项猜测对象。
- 不新增 tap info 的文案、翻译、图片、动画、transform、alpha、order、segment visibility、点击命中或关闭时序配置。
- 不新增 runtime `bindTapInfo()`、对象工厂、GameFrameworks/Scene Layout 自动注入或游戏业务接线；后续 consumer 必须显式提供对象与 ownership 合同。
- 不允许 Popup root、overlay Spine layer slot、其它 Popup/tier/object 内部节点成为 tap info 父节点，也不扩展到 award、single-state 或 Popup Object 项目。
- 不修改 Popup Object v1 schema、对象资源闭包、VNI schema/runtime、Spine skeleton/atlas、Scene Layout schema、游戏 assets、根工具链、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-09-02T09:01:03Z
HEAD: a652783b089b946cd2691d30203349607989a717
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `docs/agent-rules/editor-artifacts.md`
- `docs/agent-rules/shared-game-runtime.md`
- `tasks/285-popupeditor-vni-text-layer-all-layer-attachments.md` 及执行报告
- `tasks/286-popupeditor-reusable-popup-objects.md` 及执行报告
- `docs/popup-manifest.md`
- `docs/popup-object-manifest.md`
- `apps/popupeditor/README.md`
- `packages/rendercore` Popup data/core 与 Popup Editor 当前实现和定向测试

`apps/popupeditor`、`packages/rendercore` 与 `packages/editorcore` 下没有补充 `AGENTS.md`。执行时保留届时出现的用户无关修改。

当前结论：

- `packages/rendercore/src/popup/data/types.ts#SpinePopupManifestV9` 的 `spine` 当前只有 main resource、transform、segmented playback 与可选 overlays，尚无
  外部/语义子对象挂载点；普通 `popup-object` overlay 必须同时配置 resource、instance id、transform/order/visibility，与“项目只保存父节点”不是同一合同。
- `packages/rendercore/src/popup/data/types.ts#PopupLayerAttachment` 已能表达 `main-spine` slot 与 `{vniLayerId,textLayerId}`，但还包含本需求不允许的
  `popup-root` 和 overlay Spine target；应定义窄 union，而不是复用后再在各 consumer 运行时猜合法分支。
- `packages/rendercore/src/popup/data/manifest.ts#parseSpinePopup()` 对 `spine` 执行 unknown-field strict parsing，并用 overlay attachment graph 校验现有 layer；新增
  mount config需要显式 version gate，但它不是 overlay layer，不进入 layer DAG、同父 order 或 used-resource 统计。
- `packages/rendercore/src/popup/core/package-resource.ts#validateAnimationBindings()` 已集中验证 main Spine required slots，并通过
  `validatePopupVniTextLayerAttachments()` 核对 overlay 的 prepared VNI exact text layer；可复用相同 metadata owner验证 tap info target，不需要读取 private display tree。
- `apps/popupeditor/src/model/project.ts#PopupEditorProject.spine`、`projectToManifest()`、Popup ZIP 导入映射和 `validatePopupEditorAttachments()` 是项目状态、序列化与
  transaction diagnostics入口；当前没有 nullable tap info attachment。
- `apps/popupeditor/src/model/project.ts#getPopupSpineAttachmentTargets()` 与 `getPopupVniTextLayerTargets()` 已从 strict Spine/VNI bytes提供 scope-aware exact候选；
  项目页应复用它们，但 Spine候选必须过滤为 `main-spine`，VNI候选限定当前 `spine.overlays`。
- `apps/popupeditor/src/ui/app-shell.ts#projectMarkup()` 当前只展示公共项目配置，普通 Spine专属配置集中在动画页；本需求明确要求放在项目配置页，不能伪装成普通 overlay。
- `packages/rendercore/src/popup/spine-player.ts` 只实例化 manifest中已有 overlay/object。仓库没有 tap info 对象来源、外部注入 ownership 或 sibling order合同，
  因此本任务只能形成经过验证的 mount metadata，不能安全推断实际绑定生命周期。
- 该字段不引用文件或 resource key；现有 typed Popup closure、filename-key rewrite 和 consumer vendoring原则上无需新增 rewrite分支，但需用回归测试证明字段未被丢弃。

现有 schema、task 285/286、parser、resource validator 和 Editor候选API已足以制定计划，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “tap info 的子对象节点配置”解释为一个具名业务用途的可选 mount point，不是普通 `popup-object` layer。它只描述将来对象应挂在哪里，Popup package不拥有
   tap info 对象资源或实例。
2. “Spine 的一个 slot”指普通 Spine Popup 的 main Spine，而不是 overlays 中另一 Spine layer；这与当前 UI 中“主 Spine”候选和 runtime owner一致。
3. “项目里某个 VNI 节点的某个文字图层”指当前 `spine.overlays` 已实例化的 VNI layer + 其 strict project 中 exact `type="text"` layer；只导入资源但未创建
   VNI overlay不构成父节点。
4. “可以不配置”表示数据层真正 optional：未配置不写默认 root、不选择第一个 slot/text layer、不生成 placeholder，也不影响现有运行时。
5. 选择父节点只保存 identity，不保存位置和层级参数；tap info 对象自身视觉配置留在 Popup Object工件，未来绑定者负责对象 ownership与何时显示。

### 关键决策

1. **在 v9 Spine专属结构增加窄的可选 `tapInfoObject` 合同。**
   - canonical形状为 `spine.tapInfoObject?: { attachment: SpinePopupTapInfoAttachment }`；wrapper只标识该 attachment的业务用途，不把它混入 overlays。
   - `SpinePopupTapInfoAttachment` 只含 `{kind:"spine-slot",target:{kind:"main-spine"},slot}` 或
     `{kind:"vni-text-layer",vniLayerId,textLayerId}`，字段均大小写精确。
   - 沿用任务286的workspace lockstep前提：这是v9的新增可选能力，latest继续为v9；v1–v8夹带该字段strict失败，v9省略字段保持合法。若执行发现需要让旧已发布
     v9 reader无升级读取新package，则必须改为v10并先说明范围扩张，不能放宽unknown-field策略。
2. **mount metadata不作为 overlay layer。**
   - 不分配layer id/resource/transform/order/alpha/visibility，也不加入`objects/getObject()` registry、attachment DAG或used-resource closure。
   - 这样精确满足“项目只配置父节点”，并避免创建一个没有对象来源却看似可播放的半实例。
3. **data metadata与prepared bytes分层验证。**
   - parser验证窄union、非空exact ids、VNI parent必须命中同一`spine.overlays`的VNI layer；main-spine是唯一允许的Spine target。
   - core prepare把main slot合入official Spine required slot集合，或按overlay id取得prepared VNI project并核对exact text layer存在且`type="text"`；全部成功后才返回package resource。
   - mount point不指回子对象，因此不产生新的graph edge/cycle；已有overlay DAG仍独立严格验证。
4. **Editor项目页复用strict候选，使用显式未配置状态。**
   - model保存nullable窄attachment；创建项目和旧ZIP导入为`null`，导出时`null`转为字段省略。
   - 项目页先选“未配置 / 主 Spine slot / VNI文字层”。选主Spine后必须再选exact slot；VNI候选直接编码exact overlay/text ids。
   - resource/layer rename同步结构化改写VNI overlay id；删除、main Spine替换、VNI替换或text layer消失由同一transaction diagnostics阻止，不自动清空或迁移到相似候选。
5. **preview只验证宿主配置，不模拟tap info对象。**
   - Popup Editor继续通过正式`projectToManifest → package prepare → Spine player`自动rebuild，确保目标metadata真实可解析/prepare。
   - 因项目没有tap info对象来源，preview不绘制占位文字、假Container或辅助动画；人工验收关注候选、round-trip与失败回滚。
6. **不扩大filename-key与consumer职责。**
   - 新字段没有path/resource reference，typed closure和rewrite不应改变；补Popup package flatten/namespace或Game Layout现有consumer回归测试，只证明字段被保留且资源集合不变。
   - 不在EditorCore、Game Layout或Scene Layout复制tap info schema；它们继续把完整Popup工件交给RenderCore owner parser。

## 5. 职责与合同

- **Popup data**：拥有v9 tap info mount结构、版本gate、窄target union与同scope VNI layer identity；不读取资源bytes、不实例化对象。
- **Popup core resource**：拥有official main Spine slot和prepared VNI exact text layer验证；失败不得发布半准备package resource。
- **Popup runtime**：本任务保持现有Spine player和Popup Object生命周期不变；mount metadata仅随normalized manifest存在，不新增隐藏display mutation。
- **Popup Editor model/UI**：拥有nullable项目字段、候选投影、显式选择、rename/delete/replace transaction、diagnostics和ZIP round-trip。
- **后续consumer**：若要真正绑定tap info对象，必须另行定义对象来源、owned/borrowed关系、activation/update/detach/destroy与同父兄弟顺序；不得从本字段推断默认对象。
- **失败策略**：unknown field/kind、旧version夹带、空slot/id、Popup root、overlay Spine target、missing/wrong-kind VNI overlay、non-text/missing VNI layer与替换后失效
  均fail-fast，不fallback到root/首项/同名资源。
- **禁止行为**：不把tap info编码成特殊overlay id/name，不扫描object name，不增加raw JSON sidecar，不把UI label当identity，不为预览造placeholder。

## 6. 文件范围

### 预计新增

```text
tasks/287-popupeditor-spine-tap-info-object-parent-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/data/{types,manifest}.ts
packages/rendercore/src/popup/core/package-resource.ts
packages/rendercore/tests/popup/{manifest,package-resource,state-visibility}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/tests/{project,app-shell,preview}.test.ts
apps/popupeditor/README.md

docs/popup-manifest.md
docs/agent-rules/editor-artifacts.md
```

若Popup ZIP round-trip测试暴露adapter重建对象时丢字段，可最小修改`apps/popupeditor/src/io/popup-zip.ts`；若最终production consumer测试暴露typed clone遗漏，可只修复
复用Popup parser的直接adapter并在执行报告记录证据。没有证据时不扩大文件面。

### 原则上不应修改

```text
packages/rendercore/src/popup/data/{normalize,object-manifest,package-closure}.ts
packages/rendercore/src/popup/{object-runtime,spine-player,layer-attachment}.ts
packages/vnicore/**
packages/gameframeworks/**
packages/rendercore/src/scene-layout/**
apps/gamelayouteditor/src/**
apps/gamelayoutpkgcli/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若执行需要Popup v10、runtime对象注入API、Scene Layout/GameFramework接线、对象资源选择、order/visibility字段、VNI public API或lockfile，先说明需求证据和范围扩张，
不能用private Container或hard-coded `tap-info` layer绕过。

## 7. 实施步骤

1. **确认执行基线并固定版本/unknown-field测试**
   - 重核HEAD/status、本计划、两份领域规则和task 286最终合同，确认latest v9及项目模型未漂移。
   - 先增加v9两种合法target、字段省略，以及v1–v8夹带、unknown key、root/overlay-Spine target、空identity失败样例。
2. **建立tap info mount data合同**
   - 在`types.ts`定义窄attachment和`spine.tapInfoObject`；在`parseSpinePopup()`按version解析并deep-freeze canonical结果。
   - VNI target必须命中同scope VNI overlay metadata；不把mount point加入overlay order/DAG、used resources或Popup Object manifest。
   - 扩展版本矩阵，证明v1–v8→v9规范化不生成字段、old v9不变化、latest重读幂等、未来version继续失败。
3. **增加prepared target验证**
   - main-Spine路径把tap info slot纳入`validateOfficialSpineResource()` required slots；VNI路径复用/抽取exact text-layer helper验证prepared project。
   - 覆盖missing slot、missing/wrong-kind overlay、missing/non-text VNI layer、replace后失效和prepare failure cleanup；不创建runtime挂载节点。
4. **接入Popup Editor项目模型与transaction**
   - 为`PopupEditorProject.spine`增加nullable字段，更新create/clone/import/projectToManifest和diagnostics；未配置只省略字段。
   - VNI overlay rename时结构化改写target id；删除被引用overlay、替换主Spine/VNI资源或目标文字层失效时阻止commit并保留合法snapshot。
   - ZIP export/import/re-export断言exact parity，且assets map与closure在配置前后相同。
5. **实现项目页authoring**
   - 只对`type="spine"`在项目页渲染Tap info子对象父节点控件，使用显式“未配置”。
   - 复用main Spine slot和spine-popup VNI text候选；切换target按窄union提交，未完成slot选择保持诊断错误而不猜默认值。
   - DOM测试从真实select/change/store transaction进入，覆盖配置、清空、invalid candidate、resource replacement和其它项目类型不显示。
6. **保护preview与直接consumer边界**
   - production preview rebuild覆盖两种target和未配置路径，确认合法配置可prepare、坏target不替换最后成功preview且画面没有伪tap info节点。
   - 复验Popup flatten/namespace/materialize或既有Game Layout package用例，确认字段保留且不产生新path、payload或orphan处理。
7. **文档、人工验收与收尾**
   - 更新Popup manifest、RenderCore/Popup Editor README和Editor artifact规则，明确optional mount metadata、候选范围与非对象ownership边界。
   - 按第8节执行L2定向验收，检查diff和旧值/遗漏分支，生成任务287 UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- data测试用最小Spine/v9 fixture保护窄union与版本gate；resource测试使用self-contained official Spine/VNI metadata，不读取游戏`assets/`。
- 正常路径覆盖main Spine slot、VNI exact text layer、未配置和ZIP round-trip；失败路径覆盖wrong target kind、missing/non-text、旧版本夹带与replacement stale ref。
- Editor DOM测试必须操作项目页真实控件；不能直接改draft后只断言serializer。
- preview/runtime测试只证明正式package prepare和既有Spine画面不回归，不用假tap info Container冒充真实绑定。
- 该字段无资源引用，测试应显式断言配置前后closure/path集合相同。

### 验收级别

`L2`：本任务新增共享Popup v9 public schema字段，并由Popup Editor与RenderCore resource prepare共同消费；涉及旧版本strict parsing和直接consumer工件保真。
不新增runtime对象ownership、Scene Layout schema、生成器、依赖或lockfile，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/manifest.test.ts tests/popup/package-resource.test.ts tests/popup/state-visibility.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/app-shell.test.ts tests/preview.test.ts
pnpm --filter popupeditor build
pnpm exec prettier --check packages/rendercore/src/popup/data/types.ts packages/rendercore/src/popup/data/manifest.ts packages/rendercore/src/popup/core/package-resource.ts packages/rendercore/tests/popup apps/popupeditor/src/model/project.ts apps/popupeditor/src/ui/app-shell.ts apps/popupeditor/tests apps/popupeditor/README.md packages/rendercore/README.md docs/popup-manifest.md docs/agent-rules/editor-artifacts.md tasks/287-popupeditor-spine-tap-info-object-parent.md
git diff --check
```

- 第一条保护RenderCore public type与Editor直接consumer；第二、三条分别使用各package正式Vitest config。
- `popupeditor build`验证production preview/import入口；Prettier仅检查计划改动面，执行时按实际新增测试文件调整。
- 任一失败先最小化到parser、prepared target或项目页transaction，不立即运行根级typecheck/test/build/lint。

### 人工验收

1. 新建普通Spine Popup，导入并选择有多个slot的official Spine；在项目页选择一个exact slot、导出重开，并确认选择保持。
2. 添加含多个文字层的VNI overlay，在项目页选择指定overlay/文字层；rename该overlay后确认引用同步，尝试删除或用缺该文字层的资源覆盖时确认transaction失败且preview保持。
3. 清空配置并导出重开，确认字段完全省略；打开award、single-state和Popup Object项目，确认不显示该控件。
4. 播放普通Spine preview，确认未出现placeholder tap info、既有start→loop→end与点击关闭不变。

### 独立验收建议

`建议`。原因是新增跨包public manifest字段和strict resource target验证，但不涉及credential、服务器数据、异步对象ownership、nested ZIP closure或release。
独立复验重点是旧版本gate、两种exact target和Editor ZIP保真。

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/manifest.test.ts tests/popup/package-resource.test.ts tests/popup/state-visibility.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/app-shell.test.ts tests/preview.test.ts
git diff --check
```

## 9. 环境与依赖

- Node.js使用仓库要求的Node 24。shell没有Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的Node和pnpm，不切换npm/yarn，不主动调版本。
- 依赖缺失时运行`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改package manifest或`pnpm-lock.yaml`；Spine/VNI metadata解析、Popup schema和Editor表单能力均已存在。

## 10. 生成物、文档与规则

- 本任务没有YAML或代码生成物；Popup ZIP是测试/运行时动态工件，不提交手工生成ZIP。
- `docs/popup-manifest.md`记录v9 `spine.tapInfoObject.attachment`形状、optional语义、两类合法target和旧version gate。
- Popup Editor README说明项目页配置、未配置状态、候选来源和ZIP往返；RenderCore README说明data/core validation边界。
- `docs/agent-rules/editor-artifacts.md`只追加稳定的“tap info mount metadata不拥有对象资源/实例”边界；不把精确字段清单复制进规则。
- 不修改`shared-game-runtime.md`和根`AGENTS.md`：本任务不新增runtime绑定/lifecycle职责；未来真正绑定对象时再按实际稳定边界更新。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/287-popupeditor-spine-tap-info-object-parent-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、关键决策与偏差、实际命令结果、浏览器人工验收、剩余风险和未完成项；不收集无关coverage、
完整历史矩阵、全仓统计或profiler数据。

## 12. 风险、假设与待确认

### 风险

- v9新增optional字段要求Popup workspace reader与writer同版本发布；旧的strict v9二进制读取含新字段package会显式失败，不会静默忽略。
- VNI目标用overlay layer id + internal text id双重identity；rename/replace/delete任一结构化路径遗漏都会产生stale ref，需model transaction与prepared validation双层保护。
- 项目只保存父节点意味着当前preview不会显示tap info；若人工验收误把配置当成已绑定对象，需以文档和UI说明区分mount metadata与实际实例。
- 不配置order在本任务没有歧义，因为没有发生runtime child mount；未来绑定任务必须明确同一slot/text layer已有多个child时的稳定兄弟顺序，不能私设默认z-order。

### 假设

- `tap info`对象由后续consumer显式提供，本任务只需要在Spine Popup工件中声明可选父节点；用户所说“项目里只需要配置父节点”不要求本任务选择对象资源或实现runtime注入。
- “Spine的一个slot”特指普通Spine Popup的main Spine；overlay Spine slot不在本次候选范围。
- Popup及其直接consumer仍按任务286的monorepo workspace lockstep方式构建/发布，因此可在latest v9增加optional能力而不要求旧二进制读取新package。

### 待确认

无。若执行时发现已有consumer合同要求本任务同时提供tap info对象来源/绑定生命周期，或存在必须兼容的独立旧v9 reader，应停止并说明需要新增runtime任务或Popup v10，
不在本计划内推断默认行为。

## 13. 完成清单

- [ ] 目标和非目标已满足，Spine项目只新增可选父节点配置。
- [ ] 两种exact target、未配置与旧版本strict行为符合计划。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public schema、prepared validation和Editor transaction职责符合计划。
- [ ] 资源闭包、旧Popup与既有Spine runtime行为未改变。
- [ ] 测试、README和领域规则已按需同步。
- [ ] 指定自动化验收已通过，自动化与人工验收已明确区分。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对Git基线与工作区，保留用户无关修改；
3. 按计划实现，不重新制定另一套方案；
4. 小幅适配当前实现时在报告记录；
5. 需要Popup v10、runtime绑定API或其它重大范围扩张时先停止说明；
6. 只运行计划规定的L2验收；
7. 完成后生成UTC中文执行报告；
8. 除非用户明确要求，不commit、不push、不创建PR。
