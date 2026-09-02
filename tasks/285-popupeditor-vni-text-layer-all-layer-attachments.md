# 285 popupeditor-vni-text-layer-all-layer-attachments 任务计划

## 1. 目标与完成定义

### 目标

让 Popup Editor 中每一种图层都能把当前可共同实例化作用域内某个 VNI 图层的任意 exact 文字层选为父节点，使图片、字体文字、
ImgNumber，以及其它合法 Popup 图层可以作为 VNI 文字占位内容嵌入并继承该文字层的动画。现有 Popup 根节点和 Spine slot 父节点继续保留。

### 完成定义

- [ ] award 每档、普通 Spine overlays 和 single-state layers 中的 image、text、image-string、VNI、Spine 图层均显示 VNI 文字层父节点候选；
      award 候选限定同档位，另外两类限定各自同一 Popup 作用域。
- [ ] 候选来自作用域内已经存在并引用有效 VNI resource 的 VNI layer，以及该 project 中全部 exact `type="text"` 图层；只导入资源库但未建立
      VNI layer 的资源不是可挂载父节点。
- [ ] 图片、字体文字和 ImgNumber 选择目标后，在 production preview/runtime 中进入 VNI text content，继承目标的位移、缩放、旋转、透明度、
      可见性、混合与时间轴；自身 transform、anchor、alpha 和 string 更新继续按目标局部坐标生效。
- [ ] 同一个 VNI 文字层可承载多个 child，并按 resolved parent 内唯一 `order` 排序；target 原文字在有挂载内容时隐藏，detach/destroy 后按既有
      VNI lifecycle 恢复，不销毁 child owner 管理的 runtime。
- [ ] self、任意长度 VNI/Spine 混合循环、缺 VNI layer、缺或非 text 的 exact target、跨作用域引用、同父 order 冲突、rename/delete/资源覆盖后
      失效均在 display-tree mutation 前显式失败，transaction 保留之前合法 project/preview，不自动回根或猜其它文字层。
- [ ] Popup v1–v3 的 legacy ImgNumber `parent` 兼容语义保持不变；v4–v9 沿用既有 `PopupLayerAttachment` 结构，最新导出仍为 v9，不升级 schema、
      不修改 VNI project 或 bundle。
- [ ] Popup ZIP 往返精确保留所有 layer kind 的 VNI attachment；旧 Popup、Spine slot attachment、string handle、award tier 切换和 single-state
      layer lookup 行为保持不变。
- [ ] 完成 L2 定向自动化、真实浏览器人工验收说明、最小长期文档更新和任务 285 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/popup/data` 对通用 VNI text attachment target、父子依赖图、同父 order 与 cycle 的严格验证。
- `packages/rendercore/popup/core` 对三种 Popup 全部作用域、全部 child kind 的 VNI project exact text-layer 交叉验证。
- 既有通用 `attachPopupLayerRuntimes()` 和 VNI `attachNodeToTextLayer()` 路径的 image/text/image-string/VNI/Spine 容器挂载、排序、回滚和销毁回归保护。
- `apps/popupeditor` 的候选枚举、所有图层卡片父节点选择、rename/delete/覆盖 diagnostics、project transaction、preview 与 ZIP round-trip。
- Popup manifest、RenderCore/Popup Editor README 和最小 Editor artifact 领域规则更新。

### 不包含

- 不新增 VNI layer、文字占位层、VNI schema 字段、export profile 或 VNI Editor authoring；Popup Editor 只消费已校验 VNI project metadata。
- 不把 Popup image/font/ImgNumber bytes 写入 VNI package，不合并两个资源，不复制 VNI transform/timeline，也不访问 private Pixi display tree。
- 不让未放入当前显示作用域的 VNI asset、其它 award tier、其它 Popup 或任意 filename 成为父节点候选。
- 不放宽 exact id、`type="text"`、资源签名、closure、hash/path 或版本校验；不按 name、唯一候选、首项或相似 id 自动绑定。
- 不改变 layer transform/anchor/style/string/playback schema，不新增跨父节点 world-coordinate 自动换算或隐藏视觉补偿。
- 不修改 Game Layout Editor 的 Popup 内部编辑能力、游戏 assets、VNI runtime public API、根工具链、依赖版本或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-09-02T04:19:42Z
HEAD: e2f8bde9d7a2ee8aca8083ab0e35c2bbad81aa90
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `docs/agent-rules/editor-artifacts.md`
- `docs/agent-rules/shared-game-runtime.md`
- `docs/agent-rules/vni-runtime.md`
- `tasks/143-popupeditor-vni-text-layer-imgnumber.md` 及执行报告
- `tasks/167-popupeditor-styled-text-and-imgnumber-nodes.md`
- `tasks/195-popupeditor-spine-slot-layer-attachments.md`
- `docs/popup-manifest.md`
- `apps/popupeditor/README.md`
- `packages/rendercore/README.md`

`apps/popupeditor`、`packages/rendercore` 和 `packages/vnicore` 下没有补充 `AGENTS.md`。任务 285 当前不存在；执行时保留届时出现的用户无关修改。

当前结论：

- `packages/rendercore/src/popup/data/types.ts#PopupLayerAttachment` 从 v4 起已经是所有 layer 共用的
  `popup-root | vni-text-layer | spine-slot` union；image、text、image-string、VNI、Spine 均保存 `attachment`，无需新字段或 v10。
- `packages/rendercore/src/popup/data/attachment.ts#validatePopupLayerAttachmentGraph()` 当前硬性要求 VNI text child 必须是 `image-string`，且只把
  Spine parent edge 放进 cycle graph；直接放宽 kind 会遗漏 VNI self/cycle 和 VNI/Spine 混合循环。
- `packages/rendercore/src/popup/core/package-resource.ts#validateAnimationBindings()` 只完整验证 legacy award amount 与 single-state 的 VNI text target，
  普通 Spine overlays 和 award 非金额层没有统一 exact text-layer resource validation，错误文案仍把 child 假定为 ImgNumber。
- `packages/rendercore/src/popup/layer-attachment.ts#attachPopupLayerRuntimes()` 已按 resolved parent 建 stable group并接收任意 runtime `Container`；
  `spine-player.ts`、`single-state-player.ts` 与 v6+ `award-player.ts` 都调用该通用挂载器，不需要建立第二套 image/text attachment runtime。
- `packages/vnicore/src/core/vni-runtime.ts#attachNodeToTextLayer()` 已用 public API 挂任意 caller-owned node、隐藏 authored text、返回幂等 disposer，
  `destroyOnDetach: false` 可保持 Popup child ownership；本任务不需要修改 VNI public contract。
- `apps/popupeditor/src/model/project.ts#getPopupVniTextLayerTargets()` 已严格解析当前 scope 的 VNI bytes，但 diagnostics 仅复验 award win-amount；
  `validatePopupEditorAttachments()` 只对 Spine slot 做 metadata 交叉验证。
- `apps/popupeditor/src/ui/app-shell.ts#attachmentMarkup()` 只给 award image-string 提供 VNI 候选，`singleStateParentMarkup()` 也只给 image-string；普通
  Spine overlay 没有 VNI 候选，change handler 还显式拒绝非 image-string。
- `docs/popup-manifest.md` 对 v8 已声明所有 layer 可使用 VNI text parent，而 Popup Editor README 和长期领域规则仍写成 ImgNumber-only；当前实现与
  文档边界不一致。

现有 schema、runtime public API、测试和 task 143/195 已足以确认缺口，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “任意图层”按当前三类 Popup 支持的全部五种 typed layer 解释，而不只放宽用户举例的 image、字体 text 和 ImgNumber。VNI/Spine 作为 child
   也复用相同 Container attachment，但必须通过统一依赖图排除 self 与 cycle。
2. “当前项目里存在的 VNI”指当前 child 会与之共同实例化的 VNI layer metadata，不是 Assets 中一份尚未放入画面的 VNI resource。award 的
   每个 tier 是独立运行作用域，因此不能引用另一档；普通 Spine overlays 与 single-state layers 各是一个作用域。
3. “任意文字图层”指目标 VNI strict project 中全部大小写精确 `type="text"` layer id；显示 label 可以包含 name，但持久 identity 只保存现有
   `{vniLayerId,textLayerId}`，不新增 alias。
4. child 的 transform 保持原数值；选择父节点只改变其局部坐标系，不尝试保持选择前的 world position。用户可继续编辑 image/text/ImgNumber
   各自现有 anchor、文字和 style。
5. 多个 child 选择同一 text layer 是合法嵌入场景；VNI authored original text 在 group 挂载期间按 public API 隐藏，不把原文字当 fallback。

### 关键决策

1. **保留 v4–v9 attachment schema，只扩展严格合法性。**
   - `PopupLayerAttachment` 已经是通用 layer contract；不新增 `parentVni`、不复活 canonical v4+ 的 legacy `parent`，也不升级 Popup version。
   - v1–v3 继续只有历史 ImgNumber `parent`，latest normalizer 仍结构化迁移为 v9 `attachment`；本任务不让旧 source version 接受过去未知的字段。
2. **把 Spine 与 VNI parent 合并为一张有向依赖图。**
   - 每个 non-root attachment 都建立 `child layer id -> target layer id` edge；main Spine 是作用域外正式 root，不进入 layer cycle。
   - 先校验 target kind，再检测 self、纯 Spine、纯 VNI 与混合任意长度 cycle；同 resolved parent 的 order 唯一性继续使用 exact
     attachment parent key。
   - 图验证只处理 metadata identity；exact Spine slot 与 VNI text layer 是否存在仍在 prepared resource 层复验，避免 data 层读取 bytes。
3. **统一 resource-level VNI text target 验证。**
   - 在 `validateAnimationBindings()` 抽出按 scope 遍历所有 VNI attachment 的 helper，从同 scope exact VNI layer 取得已 prepare resource，核对
     `textLayerId` 存在且 `type === "text"`。
   - award 五档、普通 Spine overlays、single-state 共用 helper和包含 child/target/scope 的错误；资源替换造成目标消失时 package prepare 整体失败。
4. **复用通用 runtime attachment，不新增 layer-kind 分支。**
   - image、styled text、ImgNumber、VNI 与 Spine runtime 都已提供 owner-owned Container，统一交给 `attachPopupLayerRuntimes()` 的 stable group。
   - 通过定向 player 测试证明嵌套挂载、同父排序、placeholder hide/dispose、tier detach/rebind、init failure cleanup 与 destroy；只有测试证明现有挂载器
     无法正确处理某个 typed runtime 时，才最小修正该共享实现。
5. **Editor 用一套 scope-aware candidate 与 transaction validation。**
   - 扩展 `getPopupVniTextLayerTargets()` 的 scope 参数覆盖 award tier、spine-popup、single-state，并由所有 layer card 共用；当前 child 自身不能形成
     parent，选择导致更长 cycle 时由同一 shared graph 在 transaction commit 前拒绝。
   - `validatePopupEditorAttachments()` 对每个 VNI attachment 精确命中枚举结果；rename 原子改写 `vniLayerId`，delete 和 resource overwrite 保持引用保护。
   - UI change 不再检查 `layer.kind === "image-string"`；合法提交保留 transform，非法提交保留上一份 draft/preview，不静默更改 select 或父节点。
6. **用 production preview/ZIP 证明 end-to-end，而不在 Editor 模拟挂载。**
   - Popup Editor 继续通过 `projectToManifest -> mapped package -> rendercore popup editor/core` rebuild；app 不直接 reparent Pixi node。
   - ZIP round-trip 只保存既有 typed attachment ids，resource closure 和 filename-key rewrite 不因 parent kind 扩张而新增路径处理。

## 5. 职责与合同

- **Popup data**：拥有 attachment union、scope-local target kind、resolved-parent order 和完整 layer dependency cycle 校验；不读取资源 bytes。
- **Popup core resource**：拥有 prepared VNI project 的 exact text id/type 与 prepared Spine slot验证；任何失败发生在发布 runtime/display mutation 前。
- **Popup runtime**：拥有 stable parent group、child Container reparent、同父排序、VNI disposer、tier rebind、rollback 与 destroy；不取得 child runtime ownership。
- **vnicore**：继续拥有 text content、authored text visibility、动画继承和 mounted-node lifecycle；Popup 只调用 public API。
- **Popup Editor model/UI**：拥有当前 scope 候选投影、显式选择、rename/delete/overwrite transaction、diagnostics 和表单 local-coordinate 说明。
- **数据/API**：持久结构仍为 exact `PopupLayerAttachment`; label/name/session select 不进入 manifest，Assets 中未实例化资源不构造虚假 layer id。
- **失败策略**：unknown kind/field、missing/wrong-kind target、non-text VNI layer、self/cycle、duplicate sibling order、stale replacement 和 runtime capability 缺失
  全部 fail-fast，不 fallback 到 root/first/name match。
- **资源生命周期**：child runtime 由其 Popup player 拥有；attachment handle 只 detach，VNI disposer 不 destroy child；init/attach 中途失败按逆序解除 group并保留
  package resource 的既有 cleanup。
- **禁止行为**：不复制 VNI timeline/private tree，不维护第二份 asset/layer table，不扫描任意 JSON string，不从 filename/hash 推断 target，不自动跨 tier迁移。

## 6. 文件范围

### 预计新增

```text
tasks/285-popupeditor-vni-text-layer-all-layer-attachments-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/data/attachment.ts
packages/rendercore/src/popup/core/package-resource.ts
packages/rendercore/tests/popup/{layer-attachment,manifest,package-resource,award-player,spine-player,single-state-player}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/tests/{project,app-shell,preview}.test.ts
apps/popupeditor/README.md

docs/popup-manifest.md
docs/agent-rules/editor-artifacts.md
```

若通用 runtime 测试暴露实际 cleanup/order 缺口，可最小修改 `packages/rendercore/src/popup/layer-attachment.ts`；若 UI 需要区分 target/local-coordinate 状态，
可最小修改 `apps/popupeditor/src/styles.css`。两者都必须在执行报告记录触发证据。

### 原则上不应修改

```text
packages/vnicore/**
packages/rendercore/src/popup/data/types.ts
packages/rendercore/src/popup/data/normalize.ts
packages/rendercore/src/image-string/**
packages/rendercore/src/scene-layout/**
apps/popupeditor/src/io/**
apps/gamelayouteditor/**
apps/gamelayoutpkgcli/**
packages/gameframeworks/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若执行发现需要新增 manifest 字段/version、修改 VNI public API、跨 Popup/tier attachment 或改 Game Layout consumer，先提供最小复现并说明范围扩张，
不能以 raw Container、路径猜测或 app-local fallback 绕过。

## 7. 实施步骤

1. **确认执行基线与失败用例**
   - 重核 HEAD/status、三份领域规则、task 143/195、latest v9 parser和现有 attachment runtime。
   - 先增加当前应失败的 image/text/VNI/Spine child -> VNI text metadata、Editor select 与 resource exact target测试，固定旧 ImgNumber-only 限制。
2. **泛化 attachment 依赖图**
   - 移除 `validatePopupLayerAttachmentGraph()` 的 image-string-only 限制，对 VNI text 与 Spine slot target统一建立 edge。
   - 覆盖每种 child kind、同 text target 多 child、per-parent order、self、纯 VNI cycle、Spine/VNI mixed cycle、missing/wrong-kind target和 main-spine 边界。
   - 复验 v1–v3 legacy 与 v4–v9 parser strict unknown-field/version 行为不变。
3. **统一 prepared VNI text target校验**
   - 在 `package-resource.ts` 建立 scope-local helper，遍历三种 Popup 的所有 VNI attachment并核对 prepared VNI project exact text layer。
   - 覆盖 award 同档、普通 overlays、single-state 的 image/text/image-string 代表路径，以及 non-text、missing、跨 scope和资源覆盖失效。
   - 保持 image/font/ImgNumber/VNI/Spine 自身资源与 playback/slot 校验顺序，失败不发布半准备 resource。
4. **证明通用 runtime 与生命周期**
   - 扩展 `layer-attachment` 测试，证明不同 child runtime 容器共享 stable VNI text group并按 order 排序，dispose 后全部回到 owner 可清理状态。
   - 在 award、Spine、single-state player测试中各覆盖至少一个真实 typed child，重点验证 award tier切换/runtime variant、普通 overlay segment、
     single-state start/destroy和挂载失败 rollback。
   - 若既有 runtime 已完全满足则只补测试；若出现直接缺口，仅修 `layer-attachment.ts`，不按 layer kind复制挂载代码。
5. **扩展 Popup Editor model 与全部图层 UI**
   - 将 VNI target 枚举改成显式 scope union，并让 project diagnostics 对全部 VNI attachment复验 exact target。
   - award layer、Spine overlay、single-state layer 的父节点 select 均列出当前 scope 全部 VNI text候选；对当前 VNI layer 自引用和 transaction cycle显式拒绝。
   - 移除 image-string-only change guard，保留 Spine slot选择；选择目标后不改 transform/anchor/order，界面说明其成为目标局部值。
   - 覆盖 image、text、image-string、VNI、Spine 卡片，rename/delete、VNI bytes覆盖、invalid commit rollback和空候选。
6. **保护 preview、导入导出与旧合同**
   - 经正式 production preview验证 image/text/ImgNumber 的实际 VNI animation inheritance，而不是在测试中直接操作 private Container。
   - Popup ZIP export/reimport断言所有 child kind attachment exact保留；旧 v1–v3 ImgNumber parent升级、v9 Spine slot和root配置保持 parity。
   - 确认 parent ids不参与 filename-key/path rewrite，资源 closure没有新增、遗漏或 orphan。
7. **文档、人工验收与收尾**
   - 更新 Popup manifest、RenderCore/Popup Editor README 和 Editor artifact规则，统一“全部 layer kind、scope-local、exact text、cycle strict failure”边界。
   - 按第 8 节执行 L2 定向验收和真实浏览器检查，审阅 diff后生成任务 285 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- data parser/graph 测试只使用 typed metadata，resource测试使用 package内 self-contained最小 VNI fixture；shared package测试不读取游戏 `assets/`。
- 正常路径至少直接保护 image、text、image-string；VNI/Spine child必须覆盖 cycle和一个合法嵌套路径，证明“任意图层”没有停留在 UI 文案。
- 失败测试同时断言 project/resource/display tree未部分提交；不能用 silent root fallback让测试通过。
- runtime mock可证明 mount/dispose/order/ownership，真实文字层动画继承、alpha/visibility和视觉局部坐标仍必须由浏览器验收。
- Editor DOM测试必须通过真实 select/change/store transaction，不直接修改 draft后只断言 serializer。

### 验收级别

`L2`：虽然 manifest字段和版本不变，但本任务扩大 RenderCore public Popup attachment的合法语义，并由 Popup Editor直接消费，且涉及 nested display-tree
ownership、rollback/destroy和三类 production player。无需修改 VNI API、Scene Layout schema、生成器、lockfile或 release，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/layer-attachment.test.ts tests/popup/manifest.test.ts tests/popup/package-resource.test.ts tests/popup/award-player.test.ts tests/popup/spine-player.test.ts tests/popup/single-state-player.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/app-shell.test.ts tests/preview.test.ts
pnpm --filter @slotclientengine/rendercore --filter popupeditor build
pnpm exec prettier --check packages/rendercore/src/popup/data/attachment.ts packages/rendercore/src/popup/core/package-resource.ts packages/rendercore/tests/popup apps/popupeditor/src/model/project.ts apps/popupeditor/src/ui/app-shell.ts apps/popupeditor/tests apps/popupeditor/README.md packages/rendercore/README.md docs/popup-manifest.md docs/agent-rules/editor-artifacts.md tasks/285-popupeditor-vni-text-layer-all-layer-attachments.md
git diff --check
```

验收失败先最小化到 attachment graph、prepared text target、对应 player或 Editor card，不立即运行根级 typecheck/test/build/lint。

### 人工验收

1. 在 Popup Editor 分别打开 award、普通 Spine 和 single-state项目，导入带多个文字层的 runtime VNI bundle，并在当前 scope建立 VNI layer。
2. 分别把 image、系统/字体 text、manual或 win-amount ImgNumber挂到不同 exact text layer；至少再验证两个 child共享同一文字层，调整 order、
   transform、anchor、alpha和动态 string后播放 preview。
3. 确认 child随 VNI 位移/缩放/旋转/透明度/可见性运行、占位原文字隐藏、同父顺序正确；切档、重播、关闭和 rebuild后无闪回、重复节点或泄漏。
4. 尝试 self、两层 VNI cycle、VNI/Spine mixed cycle、删除/改名父 VNI、覆盖为缺目标文字层的 resource和跨 tier引用，确认原合法 preview保留且
   preview/export显式报 exact target错误。
5. 导出再导入，确认所有选择和 local transform精确保留；Assets中未建立 layer的 VNI resource不出现在父节点列表。

真实美术包未提供时，执行报告必须区分“self-contained fixture/browser验证”和“待实际项目美术复验”，不得把 happy-dom或 build称为视觉验收。

### 独立验收建议

`必须`。涉及 RenderCore public attachment语义、嵌套 VNI/Spine display-tree、resource exact target、tier rebind与 destroy/rollback。独立验收重点运行：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/layer-attachment.test.ts tests/popup/package-resource.test.ts tests/popup/award-player.test.ts tests/popup/spine-player.test.ts tests/popup/single-state-player.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/app-shell.test.ts tests/preview.test.ts
git diff --check
```

并用真实 VNI文字动画复验一次 image、font text、ImgNumber共享/不同 text target、cycle拒绝和 ZIP round-trip。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell没有 Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 复用现有 Pixi、vnicore、RenderCore Popup API和 Vitest/happy-dom，不新增依赖、不升级 package、不修改 lockfile。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、生成 TypeScript、VNI schema或 fixture export source，不运行生成器；`dist`只用于 build验证，不手改或提交缓存。
- `docs/popup-manifest.md` 明确 v4–v9 所有 layer kind可引用 scope-local VNI exact text layer、local transform、多 child和完整 cycle规则；v1–v3 legacy
  ImgNumber parent边界保持。
- `apps/popupeditor/README.md` 更新三类项目的父节点选择流程；`packages/rendercore/README.md` 补充 data/core通用 attachment验证和 lifecycle。
- `docs/agent-rules/editor-artifacts.md` 将 Popup 的 ImgNumber-only VNI attachment稳定规则更新为所有 typed layer；shared runtime和 vnicore职责不变，
  不修改根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/285-popupeditor-vni-text-layer-all-layer-attachments-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终 layer矩阵、实际修改文件、graph/resource/runtime关键决策、计划偏差、自动化命令结果、浏览器验收状态和剩余风险；不收集整仓
coverage、完整历史矩阵或 profiler数据。

## 12. 风险、假设与待确认

### 风险

- 放宽 VNI child kind后，VNI与Spine都能同时成为 child和parent；只检测同 kind cycle会让混合 display-tree环逃过 parser，必须使用统一 graph。
- award v6+会跨 tier复用相同 layer variant runtime并在切档时重建 attachment handle；nested VNI child必须在 outgoing drain、incoming mount和共享
  win-amount reparent之间保持唯一 parent，不能产生重复 update或提前 destroy。
- VNI text layer挂载会隐藏 authored text；多个 child必须共享一个 stable group/disposer，逐 child dispose可能导致原文字过早恢复或 sibling丢失。
- happy-dom与 Container mock不能证明真实字体 metrics、混合模式和复杂 VNI动画的视觉结果，因此必须保留浏览器检查。

### 假设

- `VNIRuntime.attachNodeToTextLayer()` 对 caller-owned任意 Container的 transform/alpha/visibility继承和 `destroyOnDetach: false` 语义保持稳定。
- 用户所说“当前项目”接受 runtime可共同实例化的 scope边界：award同档、普通 Spine overlays、single-state layers，而不是跨 tier或仅 Assets资源库。
- 所有五种 layer kind都应获得 VNI父节点能力；图片、字体文字和 ImgNumber是必须人工验证的主要场景，不是限制其它 typed child的白名单。
- 选择父节点后保留原 authored local transform数值符合预期；不要求自动换算以维持选择前的 world position。

### 待确认

无。若执行时确认需要跨 award tier引用未同时实例化的 VNI、直接从 Assets资源创建隐藏 VNI parent，或选择时自动保持 world position，属于新的 runtime/
authoring合同，需另行确认后规划。
