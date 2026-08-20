# 231 EditorCore Assets Dialog、预览与导出任务计划

## 1. 目标与完成定义

### 目标

在任务 229 已完成的 typed asset graph、统一导入事务、树投影和使用状态基础上，继续完善
`@slotclientengine/editorcore` 的 Assets 管理体验：把常驻式 Assets 工作区封装为由专用按钮打开的共享 dialog，缩小并允许拖动调整树区宽度，精简详情区，补齐 Spine、VNI、ImgNumber 预览，以及按 root 类型导出可直接使用的文件或 ZIP。

该能力继续先在 `apps/editordemo` 证明 public contract；四个正式 Editor 后续只需挂载共享入口和提供 host adapter，
本任务不提前迁移它们。

### 完成定义

- [ ] Editordemo 默认只显示“Assets 管理”按钮；点击后打开由 EditorCore 当前 Assets UI 渲染的 modal dialog，关闭后不占用宿主编辑区。
- [ ] dialog 支持标题、关闭、Escape、焦点进入/返回和 destroy；关闭或切换资源时释放 preview player、Pixi/Application、ticker、Object URL 和事件监听。
- [ ] 左侧树默认宽度明显小于任务 229，桌面布局可拖动 splitter 调整；宽度只属于 UI session，不写入 project、catalog 或 manifest。
- [ ] 右侧信息只显示所选项的名称、所属 root 和类型，不再显示 owner、logical key、引用列表、hash、size 或 metadata JSON。
- [ ] image、audio、video 继续可预览；Spine 可从 strict animation 列表选择并播放；VNI 可播放；ImgNumber 可见并可修改 preview text；Popup、Symbols、Game Layout 明确显示“暂不支持预览”。
- [ ] root 底部固定操作区提供程序使用状态、导出和删除；未标记时不允许编辑程序 key，标记/取消标记互斥，内部 leaf 不可独立标记、删除或导出。
- [ ] ImgNumber、Popup、Symbols、Game Layout root 导出 owner 可重新打开的完整 ZIP；VNI 导出完整可播放 ZIP；Spine 导出 skeleton JSON、atlas 与 atlas 实际使用的图片；image/audio/video 直接导出原 bytes。
- [ ] 导出前 strict 校验 schema、引用和 exact closure；失败不触发半成品下载，也不修改 controller snapshot。
- [ ] 任务 229 的统一导入、筛选、虚拟树、atomic transaction、usage 派生和 Demo 工程 ZIP 往返行为保持不变。

## 2. 范围

### 包含

- `packages/editorcore/assets/data`：preview/export 所需的最小 public types。
- `packages/editorcore/assets/core`：单 root 导出的 controller 编排、destroyed/state guard 和 format adapter 注入点。
- `packages/editorcore/assets/adapters`：按 root kind 读取 workspace exact closure，物化并复验下载交付物。
- `packages/editorcore/assets/ui`：共享管理按钮、modal dialog、可调 splitter、精简 inspector、preview host、底部操作区与下载生命周期。
- `apps/editordemo`：以 public API 演示非侵入式按钮/dialog，并提供浏览器人工验收入口。
- EditorCore/Editordemo 的直接测试、README、package manifest 和必要 lockfile importer 更新。

### 不包含

- 不把 EditorCore Assets 接入 `imgnumbereditor`、`popupeditor`、`symbolseditor` 或 `gamelayouteditor`。
- 不修改四个正式 Editor 的 project schema、manifest、现有导出流程或页面布局。
- 不为 Popup、Symbols、Game Layout 实现 preview；本任务只显示明确的不支持状态。
- 不为 opaque text/binary 增加编辑器或 preview；它们作为原子 root 只允许导出原 bytes。
- 不恢复内部 leaf 的独立 binding、删除、改名或导出。
- 不重写 Spine/VNI/ImgNumber runtime，不复制 owner player、parser、ZIP 安全、hash 或 content-addressing 算法。
- 不引入第三方 dialog、split-pane 或组件库。

## 3. 制定计划时的基线

```text
UTC: 2026-08-20T04:53:36Z
HEAD: 06b81e5528cf49feaf557bfe02f0220cdf058613
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md`、`tasks/templates/task-plan.md`、任务 229 计划与执行报告、`packages/editorcore/README.md` 及当前 Assets 实现/测试。
- 当前 public UI 入口是 `mountEditorAssetsView(...)`（`packages/editorcore/src/assets/ui/assets-view.ts`）；它把完整工作区常驻挂入传入 root，没有独立管理按钮、open/close 合同或 modal 生命周期。
- 当前主区 CSS 为 `minmax(360px, 1.7fr) minmax(280px, 1fr)`（`assets-view.css`），树区默认比 inspector 更宽且没有 splitter。
- 当前 `renderInspector()` 同时显示 owner、logical key、SHA-256、bytes、引用、程序 binding 和 metadata JSON；用户要求只保留名称、root、类型和 preview。
- 当前 preview 只对 image/audio/video 建立原生元素与 Object URL；compound animation preview 在 README 中仍明确留给 owner runtime。
- 当前程序 binding UI 始终显示可编辑 key 与保存按钮，已标记时又同时显示取消按钮；不符合“未标记不可编辑、标记与取消互斥”。
- 当前 `EditorAssetsController` 只提供 `createExportPlan/createAssetsMap/materializePayloads`，用于 host/Demo 工程闭包；没有按单 root 生成 owner ZIP 或原文件的 artifact API。
- 当前 default adapters 已严格识别并规范化 VNI、Spine、ImgNumber、Popup、Symbols、Game Layout，root 的 `exactKeys` 与 workspace bytes 足以作为导出输入；owner control manifest 与 mapped payload 的 ZIP 布局仍需按格式重新物化，不能把 Demo 工程 ZIP 当单资源导出。
- `apps/editordemo/src/main.ts` 当前直接常驻 `mountEditorAssetsView`，已有 download helper 和完整 Demo 工程 ZIP；本任务应保留工程 ZIP，并另行演示单 root 导出。
- 规划时 shell 的 `node` 不在 PATH；执行会话按仓库约定切换 Node 24 后再运行 pnpm。
- 未审计完整 Git 历史；当前代码、规则、任务 229 报告和 owner public API 足以确认本任务边界。

## 4. 需求解释与技术决策

### 需求解释

- “Assets 做成 dialog”解释为共享入口只向宿主渲染一枚专用按钮，资源工作区位于真正的 modal dialog 中；宿主不需要为 Assets 永久划分 panel。
- dialog 继续复用任务 229 的 toolbar、virtual tree、import review 和 inspector 视觉组件，不另做一套 catalog/UI 状态。
- “左边空间小一些”解释为缩小默认宽度，并在宽屏提供可访问 splitter；窄屏继续顺序堆叠，不强行保留横向拖动。
- “名字、root、类型就够了”适用于所选 tree occurrence；内部 leaf 可显示自己的名称和 node type，同时明确所属 root，但 root-only 命令仍隐藏。
- preview 只使用当前 catalog/workspace 的已提交 snapshot；导入 preparation 尚未 commit 的资源不提前进入 preview。
- “ImgNumber 可以改 text”仅修改 preview session，并调用共享 `RenderImageString.setText()`；不得写回 manifest 或 host project。
- “完整可用 ZIP”表示由对应 strict owner parser/resource 重新打开并通过 exact closure 校验，不只是把 catalog JSON 或任意 bytes 打包。
- 已知 atomic root image/audio/video/text/binary 直接下载原 bytes；用户明确列出的三类媒体之外，opaque text/binary 也保持同一原子导出语义，但不增加 preview。

### 关键决策

1. **新增共享 Assets dialog facade，保留底层 view。**
   - `mountEditorAssetsDialog(...)`（最终命名可小幅适配现有命名风格）负责按钮、native modal dialog、open/close/destroy 与焦点；内部仍挂载同一个 `mountEditorAssetsView(...)`。
   - 这样现有 headless controller 和可嵌入 view 不被破坏，正式 Editor 后续只增加一个挂载点，不需要让 Assets 侵入主布局。

2. **splitter 是纯 UI session state。**
   - 桌面默认采用较窄、受 min/max 约束的像素或比例宽度；pointer drag 使用 pointer capture，键盘方向键也能调整，`role="separator"` 同步 ARIA value。
   - 宽度不进入 manifest、Demo 工程或 controller snapshot；重新挂载可回到共享默认值，避免产生第二份业务配置。

3. **preview 使用按 root kind 分派的共享 provider，并由 dialog/view 拥有渲染器生命周期。**
   - image/audio/video 使用 Object URL；Spine 复用 RenderCore official Spine player；VNI 复用 VNICore viewer；ImgNumber 复用 RenderCore image-string resource/renderer。
   - EditorCore UI 只拥有 preview 用 Pixi `Application`、canvas、ticker、fit-to-viewport 和控件，不复制动画状态机。选中项、dialog open generation 和异步 prepare token 必须一致后才 commit preview，避免旧异步结果覆盖新选择。
   - `pixi.js` 是 UI 直接使用的 runtime，因此在 EditorCore 声明与根工具链一致的直接依赖，不依赖未声明的传递依赖。

4. **单 root 导出由 format adapter 物化，controller 只编排。**
   - data/core 定义 `rootKey -> { filename, mediaType, bytes }` 一类 artifact contract；default adapter 根据 root kind 物化，UI 只负责触发下载和回收 URL。
   - package control files、logical key、`assets.map.json` 和 content-addressed payload 必须按 owner 正式格式生成；不能直接复用 Demo archive，也不能从 hash path 反推 logical identity。

5. **各格式采用明确导出矩阵。**
   - ImgNumber：标准 `image-string.manifest.json`、map 和 glyph exact closure，复用 RenderCore mapped materializer/loader 复验。
   - Popup：标准 `popup.manifest.json`、map 和 exact closure，复用 Popup data/core strict resource prepare 后 destroy。
   - Symbols：标准 `symbols.package.json`、manifest 声明的 game config/symbol manifest control files、map/payload exact closure，复用 Symbols materializer/resource 校验。
   - Game Layout：标准 `layout.manifest.json`、map/payload exact closure，复用 Scene Layout package parser/closure 校验；不运行生产图片优化或改写 owner 内容。
   - VNI：输出项目 JSON 与其 schema 引用的全部图片；有合法 runtime export profile 时物化单 profile bundle，没有 profile 的合法 loose project 输出 viewer 支持的完整 single-project ZIP，不猜 assetScale/profile。
   - Spine：输出 skeleton JSON、atlas 和 atlas page relation 实际使用的图片；atlas page logical path 与 workspace texture key 分离处理，确保 ZIP 内路径可被 atlas 直接解析。
   - atomic root：直接输出 workspace 中该 logical key 的 exact bytes 和 media type。

6. **程序标记采用显式两态交互。**
   - 未标记态只显示“标记为程序使用”；进入标记流程后才启用必填 program key，确认成功后成为已标记态。
   - 已标记态显示可编辑的现有 key、显式保存和“取消标记”，不再同时显示“标记”；任何 host validation 失败都保留原绑定和输入错误提示。

## 5. 职责与合同

- **模块职责**：data 保存稳定类型；core 校验 root、snapshot 和 adapter 结果；default adapters 负责格式识别/物化/strict 复验；UI 负责 dialog、控件、Pixi preview host 和浏览器下载；owner runtime 继续负责实际解析与播放。
- **数据/API**：导出只接受当前 catalog 中的 top-level `rootKey`，返回 immutable artifact；filename 来自 strict manifest id/root key，不猜路径或使用 hash 作为业务名。
- **资源生命周期**：preview 先 prepare bytes/URL/player，再在 selection generation 仍有效时挂载；失败销毁 candidate；切换、关闭和 destroy 均停止 ticker、销毁 player/resource/Application、撤销 URL 并移除 canvas/listener。
- **导出生命周期**：先收集 exact closure、物化、strict 复验和确定 artifact，全部成功后 UI 才创建下载 URL；anchor click 后立即 revoke。失败不修改 snapshot、不留下 URL、不下载部分 ZIP。
- **程序 binding**：继续由 host adapter 的 `collectProgramBindings/setProgramBinding/validateProject` 实时派生和事务提交，不在 UI 保存第二份 `programmatic` boolean。
- **失败策略**：未知 root kind、缺 root/entry/relation、坏 manifest、缺 atlas page、非法 VNI profile、unsupported animation、缺 glyph、ZIP path 冲突、owner strict prepare 失败都显式报错；不降级为空 preview 或残缺 ZIP。
- **禁止行为**：不得复制 owner parser/player、直接操作 owner display tree 内部、导出内部 leaf、静默重命名、默认选首个不确定 profile/资源、在 project 保存 splitter/text/animation selection，或把 Demo archive 伪装成 owner ZIP。

## 6. 文件范围

### 预计新增

```text
packages/editorcore/src/assets/adapters/default-export.ts
packages/editorcore/src/assets/ui/assets-dialog.ts
packages/editorcore/src/assets/ui/default-preview.ts
packages/editorcore/tests/dialog-preview-and-export.test.ts
```

文件名可按现有模块粒度小幅合并或拆分，但职责边界保持不变。

### 预计修改

```text
packages/editorcore/package.json
packages/editorcore/README.md
packages/editorcore/src/assets/data/types.ts
packages/editorcore/src/assets/core/controller.ts
packages/editorcore/src/assets/adapters/index.ts
packages/editorcore/src/assets/adapters/default-adapters.ts
packages/editorcore/src/assets/ui/index.ts
packages/editorcore/src/assets/ui/assets-view.ts
packages/editorcore/src/assets/ui/assets-view.css
packages/editorcore/tests/adapters-and-ui.test.ts
apps/editordemo/README.md
apps/editordemo/src/main.ts
apps/editordemo/src/styles.css
apps/editordemo/tests/**
pnpm-lock.yaml
```

### 原则上不应修改

```text
apps/imgnumbereditor
apps/popupeditor
apps/symbolseditor
apps/gamelayouteditor
packages/editorresource
packages/rendercore 的 data/core/runtime 行为
packages/vnicore 的 data/core/viewer 行为
docs/agent-rules/*.md
AGENTS.md
assets/**
```

若 owner 当前 public API 无法完成 strict export/preview，只允许最小开放已存在的纯 materializer、parser 或 player export；不得把 app 私有 project exporter 搬入 EditorCore。发生 public API 扩张时先说明具体缺口，并把直接 owner package 加入文件范围和验收。

## 7. 实施步骤

1. **确认执行基线与 owner API**
   - 重新核对 HEAD、工作区、任务 229 public contract、Node 24/pnpm 和本计划列出的 owner exports。
   - 为七类 compound root 列出 control file、exact closure、materializer、strict reopen 和 destroy 路径；若当前代码已变化到无法保持本计划职责边界，先停止说明。

2. **补充 preview/export 数据合同和 controller 编排**
   - 在 data 增加最小 artifact/adapter 类型，在 controller 增加严格的单 root export 方法和 injected adapter。
   - default controller factory 注入格式导出 adapter；headless core 不隐式加载 Pixi、RenderCore/VNICore viewer 或 DOM。
   - 保护不存在 root、内部 leaf、destroy 后调用、adapter 返回空 filename/bytes/错误 media type 等边界。

3. **实现格式化导出**
   - 从 snapshot workspace 按 `root.exactKeys` 和 typed relations 收集输入，分别物化 atomic、Spine、VNI、ImgNumber、Popup、Symbols、Game Layout artifact。
   - ZIP 使用 BrowserArtifactIO deterministic ZIP；mapped package 继续使用 EditorResource map/payload primitives，control manifest 按 owner sentinel 放置。
   - 每种 ZIP 在返回前调用对应 strict parser/closure/resource prepare；所有临时 resource 在成功或失败路径 destroy。

4. **把 Assets UI 封装为 dialog**
   - 新增共享管理按钮和 native modal dialog facade，保留现有 view 作为内部内容；实现 open、close、Escape、focus return、关闭按钮、destroy 和 pending preview/import cleanup。
   - Editordemo 改为挂载 facade，不再为 Assets 常驻保留 workspace 高度；保留 Demo 工程打开/导出和 10,000-root fixture。

5. **调整布局和 inspector 操作**
   - 将树区默认宽度调小，引入 pointer/keyboard splitter 与 min/max clamp；窄屏切换为上下布局并禁用无意义的横向拖动。
   - inspector 只渲染名称、root、类型、preview 状态和底部 actions；移除 hash/size/JSON/引用等重复信息。
   - 重做 program binding 两态交互，加入单 root 导出 loading/error/disabled 状态；删除仍遵守 direct/program reference gate。

6. **实现共享 preview providers**
   - image/audio/video 保留 native preview；Spine 创建 official player、列出 exact animations 并用 UI ticker 驱动；VNI 创建 viewer 并播放完整 timeline；ImgNumber 创建 resource/renderer 和 preview-only text 控件。
   - canvas 按 preview viewport resize/fit，不修改 runtime 内部 display tree；Popup/Symbols/Game Layout 和 text/binary 显示明确的 preview capability 状态。
   - 为快速切换、异步失败、dialog close/reopen、controller/view destroy 补 stale result guard 和完整 cleanup。

7. **补测试、Demo 与文档**
   - 单测覆盖 dialog/button/focus/splitter、精简字段、program 两态、leaf action gate、下载 URL cleanup 和 preview destroy。
   - 用真实最小 strict fixture 覆盖 Spine/VNI/ImgNumber 播放 prepare 和所有导出矩阵；owner package ZIP 必须可重新 strict 打开并保持 exact closure。
   - 更新 EditorCore/Editordemo README，说明一行挂载、生命周期、preview capability、导出矩阵和正式 Editor 尚未迁移。

8. **验收与报告**
   - 因新增 EditorCore 对 Pixi 的直接依赖并更新 lockfile importer，按 L3 做整仓验收；失败先最小化到 EditorCore/Editordemo 或直接 owner，不顺手修无关问题。
   - 完成浏览器人工验收并生成任务 231 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- preview 测试使用真实 strict manifest/atlas/project 和最小图片 bytes；允许在 DOM 单测注入渲染器工厂观察 lifecycle，但不能用永远成功的 fake 代替 owner parser/prepare 集成测试。
- 覆盖快速连续选择、关闭时仍在 prepare、播放器异常、重复 open/close/destroy，确认旧 preview 永不提交且每个资源恰好 cleanup。
- Spine 覆盖多 animation 与多 atlas page；VNI 覆盖有/无 runtime profile；ImgNumber 覆盖有效 text、非法 glyph 和连续 `setText()`。
- 导出覆盖 atomic exact bytes、四类 Editor package、VNI、Spine，多 leaf 相同 hash 只物化一次 payload但 logical key 不合并。
- 覆盖缺 control manifest、missing/orphan、bad hash、坏 atlas path、unknown kind、leaf export、strict reopen failure；任何失败不得触发 browser download。
- 保留任务 229 的虚拟行上限、导入 review、program usage、delete gate、Demo 工程 round-trip 回归测试。

### 验收级别

`L3`。功能主体位于单 package，但 EditorCore UI 将直接创建 Pixi Application，需要在 package manifest 声明当前 workspace 已使用的 `pixi.js` 并同步 `pnpm-lock.yaml` importer；根规则把 lockfile 修改列为 L3 触发条件。若执行确认无需 package/lockfile 变化，才可在报告中有证据地降为覆盖 EditorCore、Editordemo 和直接 owner 的 L2。

### 执行会话必须运行

```bash
CI=true pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

命令超过默认六条是因为 L3 必须覆盖五类根级行为验证，`frozen-lockfile` 单独证明 importer parity，`git diff --check` 单独证明补丁文本质量；三者不能由同一命令替代。

### 人工验收

- 在真实浏览器打开 Editordemo，确认初始只有 Assets 管理按钮；反复打开/关闭 dialog，Escape 与关闭按钮行为正确，焦点返回 trigger，宿主布局不为关闭的 Assets 预留大块空间。
- 在桌面拖动 splitter 到两侧边界并用键盘调整，确认树默认更窄、宽度受约束、虚拟滚动和选择不跳动；窄屏确认改为上下布局。
- 分别导入真实 image/audio/video、Spine、VNI、ImgNumber，检查播放/动画选择/text 修改；快速切换与关闭 dialog 后确认无继续播放、残留 canvas 或控制台异步错误。
- 导出四类 Editor package、VNI、Spine 和三类媒体，分别用对应正式 Editor/viewer 或 strict importer 打开；确认 ZIP 完整、Spine atlas 图片可解析、媒体 bytes 不变。
- 标记程序使用，确认 key 只有标记流程/已标记态可编辑且按钮互斥；取消后可删除，内部 leaf 始终没有独立命令。

### 独立验收建议

`必须`。本任务涉及跨包 player/resource 生命周期、异步 preview cleanup、正式 ZIP 和 lockfile。重点复验 compound export 的 owner reopen、dialog 快速切换 destroy，以及 logical key 与 physical hash 不被混合。最多运行：

```bash
pnpm --filter @slotclientengine/editorcore test
pnpm --filter editordemo test
pnpm --filter editordemo build
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；当前 shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 Node/pnpm，不切换 npm/yarn，不升级根工具链。
- 依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库模板中的本地代理并重试原命令。
- EditorCore 新增 `pixi.js` 直接依赖时，版本必须与根 workspace/RenderCore 一致；BrowserArtifactIO、EditorResource、RenderCore、VNICore 均复用现有 workspace 依赖，不新增 dialog/splitter/ZIP 第三方库。
- 只更新 `packages/editorcore` 的 lockfile importer；若 pnpm 产生无关版本漂移，应停止并查明环境，不接受顺带升级。

## 10. 生成物、文档与规则

- 本任务预计没有 YAML 或生成 TypeScript；若执行中引入生成物，必须使用正式生成器并运行 checker，禁止手改。
- `packages/editorcore/README.md` 更新 dialog facade、host 接入示例、preview/export capability、资源生命周期和 leaf 权限。
- `apps/editordemo/README.md` 更新按钮/dialog 操作、fixture、导出和浏览器人工验收步骤。
- 根 `AGENTS.md` 与 `docs/agent-rules/editor-artifacts.md` 已包含 EditorCore、owner runtime、exact closure 和 destroy 的稳定边界，本任务原则上不重复追加具体 UI/导出矩阵。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/231-editorcore-assets-dialog-preview-export-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终 dialog/public API、preview/export 矩阵、owner API 复用或最小开放、实际文件与 lockfile 变化、自动化结果、浏览器验收、计划偏差和独立验收结论。

## 12. 风险、假设与待确认

### 风险

- Spine/VNI/ImgNumber preview 都有异步纹理加载和 ticker；如果只替换 DOM 而不显式 destroy，dialog 关闭后会泄漏 GPU、Object URL 或继续播放。
- 当前 catalog 保存的是 host 内规范化/namespace 后 logical keys；owner ZIP 必须用 strict manifest 引用物化 control/map/payload，不能假设导入 ZIP 的原始目录仍存在。
- VNI loose project 可能没有 runtime export profile；本计划允许输出完整 single-project ZIP，不能伪造 profile 或 assetScale。
- dialog 内还包含 import review modal；焦点、Escape 和遮罩事件必须区分外层 dialog 与内层 review，避免误提交或绕过 review。
- root lockfile importer 变化触发 L3；必须区分本任务失败与执行前既有整仓失败，不因验收范围大而修改无关包。

### 假设

- 任务 229 已提交的 normalized workspace bytes、typed relations 和 exactKeys 是本任务导出/preview 的权威输入，不需要保存原始上传 ZIP。
- `apps/anieditorv5viewer` 支持的 single-project VNI ZIP 属于“完整可播放 ZIP”；有 profile 的 root 仍优先输出标准单 runtime profile bundle。
- “用现在的 UI 组件”指复用 EditorCore 当前 DOM/CSS Assets 组件，不要求引入新的设计系统或第三方组件库。
- 四个正式 Editor 的迁移会在共享 dialog 经 Editordemo 和自动测试证明后另行规划。

### 待确认

无。

## 13. 完成清单

- [x] 专用 Assets 管理按钮与共享 modal dialog 完成，宿主无需常驻 Assets panel。
- [x] 树默认更窄、splitter 可访问且 UI 状态不污染 project/catalog。
- [x] inspector 字段精简，program 标记两态、root-only 删除/导出符合合同。
- [ ] image/audio/video、Spine、VNI、ImgNumber preview 及完整 cleanup 有自动化和浏览器证据。
- [x] atomic、Spine、VNI、ImgNumber、Popup、Symbols、Game Layout 导出符合矩阵并通过 strict reopen。
- [x] 任务 229 导入、虚拟树、usage、transaction 和 Demo 工程 ZIP 无回归。
- [x] 正式 Editor、owner schema/runtime 和共享身份模型未被越权修改。
- [ ] package manifest、lockfile、README 与测试同步，指定 L3 通过。
- [x] 自动化、人工和独立验收结论明确区分。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md`、本计划和任务 229 的 public contract；
2. 核对 Git 基线与工作区，保留所有用户已有和无关修改；
3. 按“data/core contract → format export → dialog/layout → preview → Demo”的顺序实现，不另建资源表或播放器；
4. owner API 有缺口时先证明并只开放现有纯能力，重大 app/schema/runtime 扩张先停止说明；
5. 所有 preview/export 必须先 prepare/strict validate，成功后 commit mount/download，失败完整 rollback/destroy；
6. 按本计划运行 L3，完成真实浏览器和 owner reopen 人工验收；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
