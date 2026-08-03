# 153 gamelayouteditor-preview-mode-runtime-resource-export 任务计划

## 1. 目标与完成定义

### 目标

修复 Game Layout Editor 在一次有向转场完成后没有可靠衔接下一条反向边的问题，并为
“不属于 scene node/transition、但由游戏程序按约定读取”的资源增加显式强制导出合同。
程序资源必须有稳定、显式的程序键，参与 production ZIP 的精确传递闭包、严格加载和
优化改写；共享 Spine atlas/贴图只保留一份，未被 scene、dependency 或程序资源引用的
sibling skeleton JSON 继续排除。

### 完成定义

- [ ] BaseGame -> FreeGame settle 后，runtime stable mode、preview 状态、开启 follow 时的主编辑状态和转场 UI 一次同步；用户选择 BaseGame 后可直接准备并执行显式 FreeGame -> BaseGame 边。
- [ ] 正向转场完成后反向“切换到该状态”按钮会在反向边准备完成时启用，不需要切换分辨率、重建 preview 或先手工来回刷新 selector。
- [ ] follow 关闭时主编辑状态仍可独立，但 preview 按钮、source 诊断和转场准备只以 runtime settled snapshot 为权威；失败、stale request 或未 settle 不提交虚假状态。
- [ ] 资源列表可把一个当前 top-level layout resource 显式绑定为程序资源，并要求唯一、稳定的程序键；取消绑定后，若没有其它引用，该资源恢复为不导出。
- [ ] image、official Spine、runtime VNI、image-string 和 MP4 现有资源 kind 都可作为程序资源；未知 kind、重复/非法程序键、缺 bytes、错误嵌套闭包或不兼容资源显式失败。
- [ ] `layout.manifest.json` 保存程序键到 typed resource spec 的权威映射；ZIP 重新导入后强制导出状态和程序键保持，不依赖 UI session、文件顺序或 physical hash path 重建。
- [ ] rendercore package loader 按程序键公开严格 typed 的已准备资源；consumer 不猜 filename、目录或 `assets/<hash>`，资源 URL/player 输入由 package resource 持有并随其 destroy 释放。
- [ ] gamelayoutpkgcli WebP 后处理结构化改写程序资源内部图片引用，但不改程序键；asset-groups 把程序资源闭包纳入 shared/initial 集并保持全集覆盖。
- [ ] 多个 Spine JSON 共享 atlas/PNG 时，只导出被 scene、transition、dependency 或程序键选中的 skeleton 根及其正向闭包；共享 leaf 去重，未选 sibling JSON 不因共享 leaf 被反向带入。
- [ ] 完成 L2 定向自动化、真实浏览器/真实 ZIP 人工验收清单和任务 153 UTC 中文执行报告；人工结果不由 fake runtime、编译或单测冒充。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 的 preview stable/target/edit mode 协调、正反向边选择与按钮状态回归。
- editor project 中程序键到 resource id 的显式 binding、clone/replace/delete/validation 和资源列表 UI。
- scene-layout v1 根 manifest 的可选 typed `runtimeResources` 映射，以及 editor manifest projection/import/export round-trip。
- rendercore scene-layout parser、asset collector、direct/mapped package validator、URL/ZIP loader、typed runtime resource lookup 与生命周期。
- image、Spine、VNI、image-string、video 五类现有 top-level layout resource 的 exact closure；同一资源同时被 scene 和程序键使用时 bytes 只进入一次。
- gamelayoutpkgcli 对 `runtimeResources` 的 typed image reference rewrite、优化后复验和 asset group membership。
- model/UI/parser/package/ZIP/optimizer 的直接测试，README、manifest 文档和最小领域规则更新。

### 不包含

- 不增加隐式反向转场、自动寻路、瞬切或复用正向边；FreeGame -> BaseGame 仍必须有显式有向边并成功 prepare。
- 不让分辨率切换成为 mode reset API，也不改变 rendercore 的 transition event、video media-time、trusted-click、rollback 或 settle 行为。
- 不把 arbitrary raw file、整个上传批次或目录标记为强制导出；只绑定资源列表中已经严格识别的 typed root。
- 不允许程序通过 physical content-addressed path、basename 猜测、glob 或资源列表序号读取；程序键是唯一公开身份。
- 不直接标记 Symbols/Popup/VNI 内部任意 leaf。nested owner 仍按自身 manifest 导出完整合法闭包；需要独立程序 Spine 时，必须作为 top-level Spine root 导入并显式绑定。
- 不删除仍被 Symbols manifest、Popup、scene node、transition 或程序资源引用的文件；“优化”不以破坏 owner manifest 为代价。
- 不裁剪 atlas 内部 region、不重新打 atlas、不分析 skeleton 实际使用了哪些 attachment，也不做纹理降分辨率；本任务只做文件级 root/closure 精确化和现有 WebP 优化。
- 不修改 game002/game003 业务代码、资源包、root 工具链、workspace 依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-03T08:22:35Z
HEAD: df801ff54f240374b85b1a82c4c735fc13a3b5d7
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和依据：

```text
AGENTS.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
tasks/templates/task-plan.md
tasks/130-gamelayoutpkgcli-asset-optimization.md
tasks/136-gamelayouteditor-ui-state-refresh-fixes.md
tasks/137-gamelayouteditor-resource-workflow-improvements.md
apps/gamelayouteditor/README.md
docs/scene-layout-manifest.md
```

当前代码基线：

- `GameLayoutEditorApp.requestPreviewMode()` 已在 promise resolve 后校验 `stableMode/displayedMode` 并同步两个 selector；但现有 `app-shell.test.ts` 只覆盖一次 BaseGame -> FreeGame，未执行第二次反向 prepare/request，也未保护反向按钮从 disabled 到 enabled 的完整 UI 流。
- `#selectedGameMode`、`#selectedPreviewMode`、`preview.getGameModeSnapshot().stableMode` 和 `EditorUiSession.previewTransition` 是四个相关状态；按钮条件分布在 `renderPreviewRuntimeControls()` 与 `transitionsWorkspaceMarkup()`，selected transition key 仍可能停留在上一条正向边。
- 分辨率改变会调用 `setPreviewSize()` -> `refreshPreview()`，重新从 manifest initial mode 建 runtime，因此会掩盖转场后的 UI/source 漂移，但不应作为恢复手段。
- `EditorProject.resources` 保存 top-level typed roots，`assets` 保存共享 filename-key bytes；当前没有程序资源 binding。`getLayoutResourceReferences()` 只统计 node/background/transition。
- `editorProjectToManifest()` 只把 node、transition、Symbols 和 Popup binding 投影为正式 root；`exportLayoutZip()` 从这些 root 收集 exact closure，并反馈“未引用资源未写入 ZIP”。
- `SceneLayoutManifestV1` 没有程序资源字段；`parseSceneLayoutManifest()` 拒绝 unknown root key，`collectSceneLayoutPackagePaths()` 拒绝 missing/orphan，因此不能靠额外塞 payload 实现强制导出。
- `manifestToEditorProject()` 只从 node 和 transition 重建 top-level resources；若没有正式 binding，ZIP round-trip 后无法恢复未显示的程序资源或其业务名称。
- `SceneLayoutPackageResource` 已分别拥有 image URL、official Spine bytes/texture URLs、VNI project/asset URLs、image-string resource、video URL 及统一 destroy 基础，但这些集合当前只为 node/transition root 准备，也没有程序键 lookup。
- `gamelayoutpkgcli/reference-rewriter.ts` 只结构化改写现有 node/transition/dependency 引用；`asset-groups.ts` 的 shared group 只来自非背景 scene nodes，新增程序 root 若不入组会触发全集未覆盖。
- 现有 `zip-io.test.ts` 已证明两个 sibling Spine JSON 可共享 atlas/PNG，导出只选中一个 root 时另一个 JSON 被排除而共享 leaves 保留；任务 153 应扩展该合同到“程序 root + scene/Symbols shared leaf”，不能改成 leaf 反向拥有 sibling。

当前 schema、editor、package loader 和 optimizer 足以确认缺口，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “预览状态是 FreeGame”表示 runtime 已 settle；后续返回 BaseGame 的 source 必须是该 snapshot 的 `stableMode`，不能使用可能独立的左侧 Inspector selection。
- “切换回 BaseGame”同时覆盖 preview toolbar 和 Transitions Inspector：选择目标或选择显式反向边后，UI 应自动对齐 exact `stable -> target` 边并在 prepare 完成时启用对应按钮。
- “强制导出”不是放宽 orphan 校验，而是给原本无 scene 引用的 typed resource 新增一个正式 root binding。
- “命名约定”解释为用户显式填写的 extension-independent 程序键，例如 `nearwin`；代码按该键取得 typed resource，图片优化从 `.png` 改为 `.webp` 时键不变。
- “symbols atlas/png 被 nearwin 共用”按依赖方向解释：nearwin skeleton root 可与 Symbols resource 共享相同 atlas/texture filename key 和 bytes；任何 root 使用 shared leaves 时 leaves 保留，但 leaves 不反向拉入其它 skeleton roots。
- 内容寻址已去重相同 bytes；本任务承诺的是 logical key/root 精确闭包，不承诺裁剪一张 atlas 图片内部未使用的像素区域。

### 关键决策

1. **用 settled snapshot 统一提交预览状态**
   - 抽出单一 reconcile 路径，在成功 settle、selector change、transition row selection 和 preview rebuild 后统一读取 snapshot。
   - runtime `stableMode` 决定 source；preview selector 决定 target；follow 只决定是否把主编辑状态同步到 stable/target，不参与 runtime source 判断。
   - 选择目标后按 exact `stable -> target` 更新 selected transition key；只有该显式边 prepare snapshot 匹配时按钮启用。

2. **保留 initial rebuild 语义，但禁止把它当修复**
   - 分辨率造成 structural preview rebuild 时 runtime 可以按现有合同回到 manifest initial mode。
   - rebuild 完成后同样运行 reconcile，所有 selector、selected edge、提示和按钮必须反映新的 stable snapshot，不留下重建前 ready/complete 状态。
   - 不在 resize handler 手工写 BaseGame，也不硬编码任何 mode 名。

3. **在 scene-layout v1 增加可选 `runtimeResources` typed record**
   - key 使用现有通用 identifier 约束，作为稳定程序身份；value 是 image/Spine/VNI/image-string/video 的严格 discriminated union。
   - Spine 程序资源声明 skeleton/atlas/textures，不强制默认 animation；具体动画由业务 consumer 在使用时显式选择并由 official Spine validator 校验。
   - 旧 manifest 缺少字段时语义完全不变；unknown field/kind 和不完整 union 继续失败，不创建 legacy alias 或 fallback。

4. **editor binding 与 resource bytes 分离**
   - `EditorProject` 保存唯一 `programKey -> resourceId` binding；一个 resource 最多一个程序键，同一程序键不能绑定多个资源。
   - 勾选“强制导出”是显式 binding 动作；要求确认合法键后才 commit。取消只删 binding，不删资源或 scene reference。
   - replace 保留 binding；删除无 scene 引用的资源时同步删除其 binding；clone、project replace 和 ZIP import 深拷贝/重建 binding。

5. **资源列表明确区分三种状态**
   - 行内展示 scene 引用数、程序键和最终是否导出；提供强制导出开关及程序键输入/确认。
   - 筛选区分“scene 已引用”“程序资源”“不会导出”，避免强制资源仍显示“未引用，不会导出”。
   - UI 只调用 model command；不在 DOM/session Map 维护第二份强制导出状态。

6. **rendercore 提供 typed lookup，不暴露 raw package 猜路径**
   - package prepare 计算 node/transition/runtimeResources 的 union closure，共享 bytes/URL 只准备一次。
   - `SceneLayoutPackageResource` 公开按程序键索引的 readonly typed resources，并提供 exact key/kind resolver；未知键或 kind mismatch 显式失败。
   - prepare 任一程序资源失败时销毁本次创建的 Object URL/nested resource，不提交半成品；package destroy 统一释放且幂等。

7. **程序 root 纳入 export、optimizer 和 loading groups**
   - editor export、direct/mapped package resolver、URL/ZIP loader都从 manifest typed spec 收集完整正向闭包。
   - optimizer 只结构化改写 spec 内 path/texture/VNI/image-string refs；程序键、atlas page logical name、VNI identity 不变，随后重算 map/hash/size 并复验 exact closure。
   - 当前没有 mode ownership 的程序资源进入 `shared` group，因而也进入 `initialAssets`；本任务不引入隐含按 mode 懒加载配置。

8. **Spine 优化保持 root 单向拥有 leaf**
   - 每个 skeleton JSON 是独立 root；atlas/texture 是可共享 leaf。闭包从 scene、transition、nested owner 或程序 binding root 正向遍历。
   - 被多个 root 使用的 leaf 在 logical map 中一份、content-addressed payload 可复用；未被任何 root 选择的 sibling JSON 排除。
   - 如果 Symbols manifest 本身引用某 skeleton，它就是有效 owner root，不能因 Layout 未单独引用而删除。

## 5. 职责与合同

- **gamelayouteditor UI/model**：拥有程序 binding 编辑、preview UI 协调和 manifest projection；不加载业务动画、不猜程序键。
- **rendercore scene-layout manifest**：拥有 `runtimeResources` schema、strict validation、asset collection 和 public typed lookup。
- **rendercore package resource**：拥有 prepare/commit/rollback/destroy、URL/decoded resource 生命周期及共享 bytes 复用。
- **nested owner**：Symbols/Popup/VNI/image-string manifest 继续拥有各自完整闭包；Layout 不扫描任意 JSON 或删除 owner-declared file。
- **gamelayoutpkgcli**：拥有 typed WebP reference rewrite、content-address 重建和 group coverage；不定义第二份程序资源清单。
- **失败策略**：非法/重复程序键、未知 kind、缺文件、hash/size/path/orphan、Spine atlas page mismatch、VNI/profile 或 decoder 错误在 commit 前失败。
- **禁止行为**：不增加 orphan allowlist、raw path lookup、basename fallback、反向 dependency、静默重命名或自动导出整个 batch。

## 6. 文件范围

### 预计修改

```text
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/editor-resource.ts
apps/gamelayouteditor/src/model/resource-commands.ts
apps/gamelayouteditor/src/model/validation.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/io/imported-layout-zip.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/ui/resources-workspace.ts
apps/gamelayouteditor/src/ui/transitions-workspace.ts
apps/gamelayouteditor/tests/app-shell.test.ts
apps/gamelayouteditor/tests/validation.test.ts
apps/gamelayouteditor/tests/zip-io.test.ts
apps/gamelayouteditor/README.md
packages/rendercore/src/scene-layout/types.ts
packages/rendercore/src/scene-layout/manifest.ts
packages/rendercore/src/scene-layout/resource.ts
packages/rendercore/src/scene-layout/package-resource.ts
packages/rendercore/src/scene-layout/index.ts
packages/rendercore/tests/scene-layout/manifest.test.ts
packages/rendercore/tests/scene-layout/resource.test.ts
packages/rendercore/tests/scene-layout/package-resource.test.ts
packages/rendercore/tests/scene-layout/production-zip.test.ts
apps/gamelayoutpkgcli/src/reference-rewriter.ts
apps/gamelayoutpkgcli/src/asset-groups.ts
apps/gamelayoutpkgcli/tests/reference-rewriter.test.ts
apps/gamelayoutpkgcli/tests/asset-groups.test.ts
apps/gamelayoutpkgcli/tests/package-flow.test.ts
docs/scene-layout-manifest.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
```

如 typed resolver 能清晰留在现有 `resource.ts/package-resource.ts`，不新增碎片模块。若实现
发现必须新增 helper/test 文件，可在上述三个目标范围内最小增加并在报告说明。

### 原则上不应修改

```text
packages/rendercore/src/symbol/**
packages/rendercore/src/popup/**
packages/editorresource/**
packages/browserartifactio/**
packages/vnicore/**
apps/symbolseditor/**
apps/popupeditor/**
apps/game002/**
apps/game003/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若需要修改 nested owner schema、增加 manifest v2、改变 asset-groups group kind、引入新依赖
或修改游戏 consumer，属于明显范围扩张，执行前必须停止说明，不能修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线并建立回归**
   - 重查 HEAD/status、规则和当前 schema/public exports。
   - 先补一条真实 UI 顺序测试：准备 BG -> FG、trusted click、settle、选择 BG、准备 FG -> BG、按钮启用并再次 settle；同时覆盖 follow on/off 和 resize rebuild 后 reconcile。

2. **收敛 preview 状态协调**
   - 在 `app-shell.ts` 建立 snapshot-driven reconcile，统一 selected preview/edit mode、selected transition key、prepare identity 和 UI phase。
   - 让 toolbar 与 transition Inspector 共用 exact stable/source/target/ready 判定；stale prepare、失败和 rebuild 清理旧 ready/complete 状态。
   - 保持现有 trusted-click 同步 `requestGameMode()` 调用和 runtime transition 实现不变。

3. **建立程序资源 editor 合同与 UI**
   - 给 project/clone/validation 增加程序 binding；实现 bind/rename/unbind/delete/replace 的原子 command。
   - 资源列表显示程序键、最终导出状态和新筛选；非法输入不修改 project，成功后刷新导出诊断。
   - manifest projection 写 `runtimeResources`，import 按 typed spec/signature 重建 resource 与 binding；同一资源 scene+program 双重使用不复制 identity/bytes。

4. **扩展 rendercore schema、closure 与 package resource**
   - 增加五类 strict runtime resource spec、parser、collector 和 exact key/kind resolver。
   - 扩展 direct/mapped package path validation、nested VNI/image-string closure、CDN/ZIP loader和 decoded resource preparation。
   - 验证共享 resource prepare 去重、部分失败 rollback、destroy 幂等、unknown key/kind failure 和旧 manifest parity。

5. **同步 export 与 optimizer**
   - editor export/flatten 把程序 root 加入 exact closure，content-addressed map 只含 union reachable files。
   - optimizer 重写程序 spec 的 typed refs，保持程序键不变；asset-groups 把完整程序闭包并入 shared/initial。
   - 用“Symbols/scene root + nearwin 程序 Spine + unused sibling JSON + shared atlas/PNG”fixture 证明保留/剔除和 WebP rewrite 行为。

6. **文档、规则与收尾**
   - README 说明 UI 操作、程序键命名/lookup、导入导出和 sibling closure；manifest 文档记录 schema/API/lifecycle。
   - 只把稳定的显式 runtime root、正向 closure 和职责边界加入两份领域规则。
   - 运行 L2 验收、检查 diff，生成任务 153 UTC 中文执行报告并保留人工验收待办。

## 8. 测试与验收

### 测试原则

- mode 测试必须连续执行正向和反向两次真实 app-shell 状态流，不能只调用内部 helper 或用 resize 重建替代反向切换。
- 覆盖 follow on/off、Spine/MP4 至少共享状态协调路径、prepare stale/error、popup/transition lock 和 rebuild initial reconcile；无需复制底层播放器已有测试。
- 程序资源覆盖五个 kind 的 parser/lookup，重点用 image、Spine 和 VNI 验证 nested closure/lifecycle。
- ZIP fixture 同时存在 scene root、program-only root、共享 leaf、unused sibling 和完全无关 bytes；分别断言 map、manifest、resolved files 和 reimport project。
- optimizer 断言 `.png -> .webp` 只改 typed path，程序键、atlas logical page、skeleton JSON 和 sibling inclusion 不变。
- 旧 v1 manifest 缺少 `runtimeResources` 时 byte/behavior parity；非法键、duplicate binding、missing/orphan、wrong kind 和 partial prepare 均失败。

### 验收级别

`L2`。任务修改 rendercore scene-layout public manifest/package API、正式 production ZIP closure
及 gamelayoutpkgcli 直接 consumer；需要验证三个目标的直接依赖链，但不修改 lockfile、root
工具链或大规模无边界代码，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli test
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli build
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli format:check
git diff --check
```

失败时先在单个 package/单个 test file 最小化复现；不扩到整仓扫描，也不为通过旧测试放宽
strict closure 或 fallback 规则。

### 人工验收

1. 在真实浏览器配置 BG <-> FG 两条显式边，执行 BG -> FG，随后把 preview 目标改回 BG；确认反向按钮准备后启用并成功返回，全程不切换分辨率。
2. 分别打开/关闭 follow，确认 runtime stable/source 始终正确，主编辑 Inspector 只在 follow 开启时同步；再切一次分辨率，确认 UI 准确显示 rebuild 后的 initial stable 状态。
3. 导入含多个 sibling skeleton JSON 和共享 atlas/PNG 的 Spine batch，只给 nearwin root 设置程序键；导出、重新导入并确认 nearwin/leaf 存在、unused sibling 不存在、binding 保持。
4. 用 gamelayoutpkgcli 优化该 ZIP，确认程序键不变、贴图 ref 变成合法 WebP key、map/hash/orphan 复验通过；以 rendercore typed lookup 读取 image/Spine 程序资源并在 destroy 后不再使用 borrowed URL。

### 独立验收建议

`必须`。本任务涉及跨包 public schema、正式 ZIP、content-addressed rewrite 和 resource
ownership。独立验收重点复核：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter gamelayouteditor test
pnpm --filter gamelayoutpkgcli test
```

并额外人工检查一个真实共享 atlas 包的程序键 lookup 与 sibling 排除结果。

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24；shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用 pnpm，不切换 npm/yarn；依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`。
- 本任务不需要新增依赖或修改 lockfile；若实现出现该需求，先停止说明范围与 L3 影响。
- 只有下载实际失败后才设置仓库约定代理并重试原命令。

## 10. 生成物、文档与规则

- `layout.manifest.json` 和 `assets.map.json` 仍由正式 export/optimizer 生成；测试不得手改 production mapped payload 冒充结果。
- `runtimeResources` 是程序资源清单的唯一来源；README、测试、游戏代码不得维护第二份业务表。
- optimizer 改变图片 bytes/key 后重新计算 SHA-256、byte length、media type 和 physical path，并用 production parser 复验。
- 更新 `apps/gamelayouteditor/README.md` 与 `docs/scene-layout-manifest.md`；只把长期职责和闭包规则写入 `docs/agent-rules/{scene-layout,editor-artifacts}.md`。
- 不修改根 `AGENTS.md`，不提交真实美术 ZIP 或一次性 asset 清单。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/153-gamelayouteditor-preview-mode-runtime-resource-export-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/文件、关键决策和偏差、实际命令结果、未完成人工验收、剩余风险；
除 L2 直接证据外不收集整仓 coverage、历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- additive v1 字段要求所有正式 strict consumer 同步升级；遗漏 optimizer/URL loader 任一入口会导致新包 unknown field 或 orphan failure。
- 程序资源会进入 shared/initial group并增加首包体积；这是当前无 mode ownership 合同下的保守且确定行为，未来若需懒加载应单独设计 versioned ownership。
- shared atlas/PNG 只做文件级去重；若大图内部包含大量无用 region，体积不会因本任务下降，需要源美术拆包或独立 atlas repack 流程。
- borrowed Object URL 或 typed resource 被 consumer 保存到 package destroy 之后会失效；文档和类型必须明确 owner 边界。

### 假设

- 用户所说的程序读取资源属于当前 layout production package，并希望通过稳定业务键而非 physical filename/hash 访问。
- 强制导出对象是 Game Layout Editor 资源列表中的 typed top-level root；nested dependency 内部编辑仍归对应 owner editor。
- 当前 five-kind 资源 union 足以覆盖轮子动画、Spine 和普通图片，不需要本任务增加新的 raw/binary kind。

### 待确认

无。程序键、shared/initial ownership 和 atlas 文件级优化边界已在本计划明确，执行中不再通过猜路径补充隐含语义。

## 13. 完成清单

- [ ] 预览正反切换、follow 和 rebuild 状态合同均满足。
- [ ] 程序资源 schema、UI、lookup、closure 和 optimizer 目标满足，非目标未混入。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、strict validation、rollback/destroy 和 sibling dependency 方向符合计划。
- [ ] 测试、README、manifest 文档和领域规则已同步。
- [ ] L2 自动化通过，人工验收仍与自动化明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/scene-layout.md`、`editor-artifacts.md` 和本计划；
2. 核对 HEAD/status，确认 task 136 后续代码没有再次改变 preview 状态流；
3. 按计划先建立正反向 UI 回归，再实现程序资源 public contract；
4. 小幅适配当前实现时在报告记录，重大 schema/group/consumer 扩张时先停止说明；
5. 只运行本计划 L2 验收，完成后生成执行报告；
6. 除非用户明确要求，不 commit、不 push、不创建 PR。
