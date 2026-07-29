# 137 gamelayouteditor-resource-workflow-improvements 任务计划

## 1. 目标与完成定义

### 目标

改进 Game Layout Editor 的资源选择、Spine 批量导入、production ZIP 资源裁剪和资源替换体验：

1. 在图层 Resource Picker 右侧显示当前候选的真实可视预览，不再只靠 filename key 判断素材。
2. 支持一次导入多个 Spine skeleton JSON，并把每个 JSON 分别单向绑定到同一个 atlas 和该 atlas 精确声明的全部贴图。
3. 导出时只写入实际被 layout、mode transition 或嵌套 owner 引用的资源闭包；共享 Spine atlas/贴图按被使用 JSON 的依赖写入一次，未使用的 sibling JSON 不进入 ZIP。
4. 图层重绑、背景更换和资源 bytes 替换时尽量保留已有配置；尺寸变化不再自动重置整套 geometry。

### 完成定义

- [ ] Resource Picker 右栏对当前选择显示 typed preview：图片显示原图；Spine 在未选 animation 时显示全部 atlas page 缩略图，明确选择 animation 后使用 official player 预览；VNI 播放完整 timeline；image-string 显示完整 glyph contact sheet。
- [ ] preview 只读取当前 project 的 validated bytes，不修改 resource、node、playback、selection 或 manifest；候选快速切换、关闭对话框、项目替换和 app destroy 都会清理旧 player、texture、ticker 与 Object URL。
- [ ] Spine 上传接受 `N >= 1` 个 4.3 JSON、恰好一个 atlas，以及 atlas 精确声明的一张或多张贴图；其它文件、缺页、额外贴图、重复/alias key、非法 JSON、错误版本或无 animation 均在提交前失败。
- [ ] 每个 Spine JSON 成为独立 filename-key resource root；每个 root 保存相同 atlas/texture 映射，但不创建 atlas/贴图到 JSON 的反向业务绑定，也不自动创建 node。
- [ ] Spine 多 JSON 批次经过一次统一 import review 并原子提交；任一 root 或共享 leaf 冲突、校验、覆盖兼容性失败时，整个批次不修改 project。
- [ ] 删除或替换一个 Spine root 时，只在没有其它 resource 引用后回收共享 atlas/贴图；覆盖共享 leaf 会校验全部受影响 Spine roots，不留下半更新素材。
- [ ] 普通图层、背景和 transition 只要引用某个 Spine JSON，导出就包含该 JSON、共享 atlas 和精确 texture closure；同批未引用 JSON 不导出，共享 leaf 不重复。
- [ ] 完全未引用的 image、Spine root、VNI、image-string、video 以及未绑定的 Symbols/Popup dependency 不进入 production ZIP；VNI/image-string/Symbols/Popup 仍按各自 typed owner 收集完整传递闭包。
- [ ] 导出后的 `assets.map.json`、payload、manifest 无 orphan；重新导入允许多个 Spine roots 合法共享相同 atlas/texture keys，并保持各 root 的 identity、animation metadata 与关联。
- [ ] 普通图层重绑始终保留 node id、order、可见/隐藏 placement；同 kind 或兼容动画 kind 还保留仍合法的 loop、Spine animation、image-string text/anchor，只重置无法应用到新类型或新素材的字段。
- [ ] 背景更换和被背景引用的 image bytes 替换遇到尺寸变化时，更新对应 variant `artSize`，但保留用户编辑的 node/reel/popup placement、reel cell/gap/order、focus rect/offset/margin 和其它 mode 配置。
- [ ] 如果保留的 geometry 在新 art size 下不合法，编辑器显示严格校验错误并禁止导出，由用户明确调整；不得自动缩放、居中、裁剪、猜测新值或回退到初始化配置。
- [ ] 首次绑定尚无完整 geometry 的图片背景仍执行现有初始化；Spine 背景 art size 仍必须由用户明确输入，不从 skeleton bounds 或 texture 推导。
- [ ] `gamelayouteditor` 定向自动化、build、真实浏览器人工验收和任务 137 UTC 中文执行报告完成。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 的 typed resource preview、preview 生命周期和 Picker UI。
- Spine loose-file 批量识别、共享 leaf 数据模型、import review、覆盖/删除 transaction 和 round-trip。
- editor project 到 scene-layout manifest 的引用闭包、production ZIP 裁剪、反馈计数和导入校验。
- 普通图层重绑、背景资源更换、image/Spine resource replacement 的配置保留策略。
- 直接保护上述行为的 model、UI、ZIP 和 lifecycle 测试。
- Game Layout Editor README 及最小范围 scene-layout/editor-artifacts 规则更新。

### 不包含

- 修改 scene-layout manifest v1 的正式 Spine resource schema；现有
  `{skeleton, atlas, textures}` 已能表达多个 JSON 共享 leaf。
- 多 atlas 自动配对、按 basename 猜 JSON 与 atlas、atlas 到 JSON 的反向关联、目录上传、二进制 `.skel` 或 Spine 4.3 之外版本。
- 把多个 JSON 合并为一个 logical resource、自动把全部 JSON 绑定到同一图层，或从文件顺序选择默认 JSON/animation。
- 编辑 atlas、拆分 atlas page、重新打图、转换图片编码或修改 Spine skeleton 内容。
- 为 VNI/image-string 增加新的 authoring 配置；本任务只为 Picker 提供只读预览并保护现有 exact closure。
- 自动修复因新背景尺寸造成的越界布局；本任务保留配置并显式暴露校验错误。
- 修改 rendercore production runtime、gamelayoutpkgcli、游戏 app、根工具链、依赖版本或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-07-29T10:39:47Z
HEAD: c391722fe70b471bea78670fe499bce310c6adae
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和计划依据：

```text
AGENTS.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
tasks/templates/task-plan.md
tasks/134-gamelayouteditor-vni-spine-animation-layers.md
tasks/136-gamelayouteditor-ui-state-refresh-fixes.md
```

当前代码基线：

- `src/ui/app-shell.ts::renderPicker()` 的右栏只有 root/path、node id、variant、animation 和提示，没有图像或 runtime preview。
- `src/ui/app-shell.ts::syncThumbnailUrls()` 与 `src/ui/resources-workspace.ts` 只为普通 image 建立缩略图；已有 `ObjectUrlRegistry` 可复用其可回收 URL ownership。
- `src/model/resource-commands.ts::prepareSpineResource()` 强制恰好一个 JSON、一个 atlas 和精确 textures；`groupSourceFiles()` 当前把全部 loose files 放入同一组，因此多 JSON 会整体失败。
- `EditorSpineLayoutResource` 已把 `skeleton` 与 `atlas/textures` 分开保存；多个 roots 可以共享相同 leaf keys，`garbageCollectAssetPaths()` 也会按所有剩余 resources 计算保留集合。
- `manifestToEditorProject()::registerResource()` 当前禁止不同 Spine signature 复用同一 leaf path，导致包含多个 skeleton、共享 atlas/texture 的合法 layout ZIP 无法重新导入。
- `exportLayoutZip()` 已从正式 manifest 收集 node/transition 资源并对 VNI、image-string、Symbols、Popup 做 typed nested closure；未使用的普通 asset bytes 已有不写入 ZIP 的测试。
- 当前闭包模型只缺少多 Spine root 共享 leaf 的 round-trip 覆盖、引用统计一致性，以及 sibling JSON 精确裁剪测试；不需要新增 manifest 字段或第二份业务资源表。
- `rebindLayerResource()` 保留 placement，但无条件删除 playback/imageString 并重建类型配置；同类资源重绑也会丢失可兼容设置。
- `assignBackgroundResource()` 和 `commitResourceReplacement()` 在图片尺寸变化时要求确认并调用 `resetVariantGeometry()`，会重置 art、reel 和 focus 配置。
- `EditorStore` 允许保存暂时不满足 production manifest 的 draft 并在错误面板显示严格错误，因此可以保留尺寸变化后的配置，同时继续阻止非法导出。

不需要审计完整 Git 历史；当前 draft、manifest parser、ZIP closure 和测试已足以确定合同。

## 4. 需求解释与技术决策

### 需求解释

- “右边有预览图”解释为 Resource Picker 右侧对所有可创建图层的 visual resource 提供 typed preview，而不只是为普通 image 加一个缩略图。
- Spine 在用户尚未明确选择 animation 前不自动播放首项；先展示 atlas 声明的全部 page，选择 animation 后再显示真实 official Spine 播放结果。
- “多个 json 搭配一个 atlas 和贴图”解释为一次批次内所有 JSON 共同使用恰好一个 atlas，以及 atlas 声明的一张或多张 texture page。
- “JSON -> 贴图单向关联”解释为每个 JSON resource root 显式持有
  `atlas + textures` 引用；atlas/texture 只是共享 leaf，不拥有或枚举 sibling JSON。
- “完整资源没用到”按 root 是否存在 node/background/transition/package binding 判断；root 被使用时收集其 typed 传递闭包，不能只看单个文件是否直接出现在 node 上。
- “图层替换资源”同时覆盖普通 layer rebind、background resource change 和资源库中同 root bytes replacement，因为三条入口都可能影响已经编辑好的节点配置。

### 关键决策

1. **保持 scene-layout v1，只扩展 editor 的共享 leaf 能力**
   - 每个 JSON 继续对应一个独立 `EditorSpineLayoutResource`，resource id 等于 skeleton filename key。
   - siblings 复用同一 atlas key 和同一 page-to-texture map；正式 node/transition 仍输出现有 Spine spec。
   - 不新增 batch id、atlas owner 或 reverse map 到 production manifest，避免第二份资源表和 consumer 变更。

2. **Spine 批次采用 prepare-all / validate-all / commit-once**
   - 先建立 bounded source index，解析唯一 atlas/page map，验证全部 texture bytes，再逐 JSON 解析 metadata/version/animations。
   - 一次检查所有 root/leaf filename-key、NFC/case alias、现有覆盖和引用兼容性；全部通过后才写 `resources/assets`。
   - 共享 leaf 同 key 不同 bytes 仍遵循全局覆盖语义，但必须把受影响 roots 从现有 resource graph 动态求出并一起复验；不维护反向持久表。

3. **Picker preview 使用真实 typed renderer，并保持只读**
   - image 使用 Blob URL 和 contain 显示。
   - Spine texture contact sheet 按 atlas page 顺序全部展示；animation 明确选择后复用 rendercore official player。
   - VNI 复用 `VNIPlayer` 的 manual tick 完整 timeline；image-string 从其 manifest/assets 构建 glyph contact sheet，不猜一段示例文本。
   - preview 使用独立 owner 管理 Pixi app/ticker/player/texture/Object URL；每次异步 prepare 带 request token，stale 结果立即 destroy，错误只显示在预览区域。

4. **导出以正式 manifest 的 root 引用图为唯一权威**
   - node/background/transition 先决定 used roots，再按 kind 展开 exact closure。
   - Spine 展开当前 root 的 skeleton、atlas、textures；共享 leaf 通过 filename key 去重，未使用 sibling skeleton 不会因为共享 atlas 而被反向带入。
   - VNI/image-string 和 Symbols/Popup 保持现有 owner parser/collector；不扫描任意 JSON 字符串或全量复制 workspace。
   - flatten、`assets.map.json` 和 production parser 继续验证 path/hash/size/missing/orphan。

5. **配置保留按“通用字段总是保留，typed 字段兼容才保留”**
   - rebind 不改 node id/order/placements/hiddenPlacements。
   - Spine -> Spine：保留 loop；旧 animation 在新资源存在时保留，否则要求用户明确选择。
   - VNI -> VNI 保留 loop；Spine <-> VNI 可保留共同的 loop，但 Spine animation 必须显式合法。
   - image-string -> image-string 仅在新 manifest 接受现有 text 时保留 text/anchor；否则在 commit 前明确失败，不静默清空已编辑文本。
   - 跨到不兼容 kind 时只移除该 kind 独有字段，不能重置 geometry。

6. **尺寸变化更新 art size，但不重新初始化 geometry**
   - 首次完整图片背景继续使用现有初始化；已存在完整 geometry 时，只更新受影响 variant 的 `artSize`。
   - 保留 background/普通 node/popup placement、reel cell/gap/order/placement、focus rect、frame focus、offset 和 margin 的数值。
   - 不自动 center、fit、scale、clamp 或调用 `resetVariantGeometry()`；如果新尺寸导致 reel/focus 越界，沿用 strict validator 显示问题并阻止 export。
   - Spine replacement 不从 bounds/texture 改 art size；Spine 背景尺寸仍由已编辑 manifest 值拥有。

## 5. 职责与合同

- **gamelayouteditor resource model**：拥有 JSON root 到 atlas/texture leaf 的单向引用、共享 leaf 回收和 batch transaction。
- **Picker preview**：拥有只读可视化、异步 prepare token 和临时 runtime 生命周期；不得修改 authoring draft。
- **rendercore/vnicore**：继续拥有 official Spine、image-string 与 VNI 的真实解析/播放算法；editor 只组合公开能力，不复制 player。
- **scene-layout manifest/export**：拥有 production root 引用和 exact typed closure；editor resource library 的未引用 roots 不进入正式包。
- **editorresource/browserartifactio**：继续拥有 filename-key、bounded input、冲突 review、SHA-256、payload 和 map 校验。
- **失败策略**：非法批次、共享 leaf 冲突、旧配置不兼容、missing/orphan、预览 decode 和尺寸后正式 geometry 错误必须显式；authoring transaction 失败不留半提交。
- **禁止行为**：不按 basename/顺序猜配对或 animation，不建立反向 atlas owner，不自动绑定 node，不全量导出 workspace，不用 placeholder/fallback 掩盖预览或闭包错误。

## 6. 文件范围

### 预计新增

```text
apps/gamelayouteditor/src/preview/resource-picker-preview.ts
apps/gamelayouteditor/tests/resource-picker-preview.test.ts
```

如 typed preview 可在不混合 UI 事件的前提下并入现有 preview 模块，可减少新增文件；不得把 player 生命周期直接散落到 markup 函数。

### 预计修改

```text
apps/gamelayouteditor/src/model/{editor-project,editor-resource,resource-commands}.ts
apps/gamelayouteditor/src/io/{exported-layout-zip,imported-layout-zip}.ts
apps/gamelayouteditor/src/ui/{app-shell,resource-picker,resources-workspace,ui-session}.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/{app-shell,editor-store,ui-session,validation,zip-io}.test.ts
apps/gamelayouteditor/README.md
docs/agent-rules/{scene-layout,editor-artifacts}.md
```

执行时根据职责把批量 Spine prepare/commit 拆入独立 model 文件是允许的小幅文件调整，但 public contract 不变。

### 原则上不应修改

```text
packages/rendercore/**
packages/vnicore/**
packages/editorresource/**
packages/browserartifactio/**
apps/gamelayoutpkgcli/**
apps/game002/**
apps/game003/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

若发现现有公开 renderer 无法在不复制 runtime 的前提下支持 Picker preview，或 manifest schema 必须变化，属于跨包 public API 扩张，执行前必须说明并重新确认范围。

## 7. 实施步骤

1. **确认执行基线并固定当前失败行为**
   - 重查 HEAD/status、领域规则和 task 134/136 已实现合同。
   - 为多 JSON Spine、共享 leaf ZIP round-trip、unused sibling 裁剪、Picker preview 和尺寸变化保留 geometry 建立失败测试。

2. **实现 Spine 多 root 单向共享 leaf transaction**
   - 将单 resource prepare 拆为共享 atlas/texture prepare 与逐 skeleton prepare。
   - 新增批量 upload API，返回稳定按输入 JSON filename key 排序的 roots，统一进入 import review。
   - 支持新建/覆盖混合批次，动态复验引用共享 leaf 的现有 roots，并确保删除/替换只回收无引用 bytes。

3. **放宽 editor round-trip 的合法共享规则**
   - 调整 `manifestToEditorProject()::registerResource()`：允许多个 Spine signatures 共享完全一致的 atlas/texture key 及 bytes/page mapping，但仍禁止同 key 被不同 kind 或不一致语义复用。
   - 保持 skeleton root identity 独立，导入后重建每个 JSON -> atlas/textures 的单向资源记录。
   - 增加 export/import/export parity，确认共享 leaf 只物化一次。

4. **把 production export 固定为 used-root exact closure**
   - 明确收集 node、background、Spine/MP4 transition 和 mode dependency 的引用 roots，再调用现有 typed collectors。
   - 添加多 JSON Spine、共享 atlas、多 page、unused image/VNI/image-string/video、未绑定 dependency 和 transition-only resource 测试。
   - 修正资源 Tab 状态和导出反馈计数，使“未使用”统一通过 `getLayoutResourceReferences()`/dependency binding 判断，不只统计 `project.nodes`。

5. **实现 Resource Picker typed preview**
   - 在 Picker 右栏增加固定 preview viewport、loading/error/empty 状态和资源 metadata。
   - 接入 image、Spine contact sheet/explicit animation、VNI timeline 和 image-string glyph sheet。
   - 将选择、animation 变化、搜索过滤、dialog close、project replace 与 app destroy 接入统一 prepare/cancel/destroy；保留键盘、focus 和 IME 行为。

6. **实现配置保留策略**
   - 重构普通 layer rebind，为通用 geometry 和 typed config 分别执行兼容迁移/校验。
   - 重构 background assign 与 library replacement：首次绑定才初始化；尺寸变化只更新 art size 并保留现有 geometry。
   - 删除“尺寸变化必须确认并重新初始化”的 UI 分支，改为成功保留后显示 validation 状态；非法 production draft 继续禁止 export。

7. **测试、文档与收尾**
   - 完成正常路径、冲突、rollback、shared leaf cleanup、stale preview、重复 destroy 和 strict geometry failure 测试。
   - 更新 README 与最小领域规则，说明多 JSON 单向共享、Picker preview、exact used-root closure 和尺寸替换保留策略。
   - 运行 L2 定向验收、真实浏览器人工验收、diff 检查，并生成任务 137 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- Spine fixture 至少覆盖两个合法 4.3 JSON、一个 atlas、单页和多页 texture；不得用跳过 metadata/atlas 校验的 mock 冒充导入成功。
- batch 测试覆盖 duplicate root、case/NFC alias、额外/缺失 texture、部分 JSON 错误、现有 root 覆盖、共享 leaf 不同 bytes，以及任一失败后的 project 深度不变。
- preview 测试注入 player/URL factory，验证候选与 animation 切换的 stale result、ticker、destroy 和 URL revoke；真实视觉效果留给浏览器验收。
- rebind 测试分别覆盖 same-kind、cross-kind、合法/缺失 Spine animation、image-string text 兼容失败和 hidden placement。
- 尺寸测试先写入非默认 reel/focus/node/popup 配置，再替换为更大和更小图片；断言配置精确保留、art size 更新、非法小尺寸显示错误且无法导出。
- ZIP 测试直接检查 logical keys、map/payload 数量与 import parity，不能只断言导出 Promise 成功。

### 验收级别

`L2`。正式 production ZIP exact closure、共享 Spine leaf round-trip 和 editor resource ownership 发生变化，需要验证 app build 及直接消费的 rendercore package parser；但不修改跨包 public API、root 工具链、依赖或 lockfile，不升级到 L3。

### 执行会话必须运行

```bash
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor build
pnpm --filter gamelayouteditor format:check
git diff --check
```

`gamelayouteditor build/test` 已经通过 workspace 依赖和 production package parser 覆盖直接 consumer，不默认运行根级全仓命令。

### 人工验收

1. 在真实浏览器打开图层 Picker，依次选择 image、包含多个 JSON 的 Spine、VNI 和 image-string，确认右栏预览与当前候选同步，Spine 不自动猜 animation。
2. 一次选择两个 Spine JSON、一个 atlas 和其全部 texture；确认资源库出现两个 root，详情分别显示同一 atlas/page mapping，且没有自动新增图层。
3. 只绑定其中一个 JSON 后导出并解压；确认已用 JSON、atlas、textures 存在，未用 sibling JSON 和其它未引用资源不存在，重新导入/导出保持一致。
4. 为普通图层和背景编辑非默认 placement、loop/animation、reel、focus；更换不同尺寸资源，确认可兼容配置保留。使用过小背景时应看到严格越界错误且不能导出，而不是被自动重置。
5. 连续快速切换 Picker 候选并关闭对话框，确认无残留动画、控制台错误、重复 ticker 或 Object URL 泄漏。

### 独立验收建议

`建议`。本任务涉及共享 resource ownership、异步 preview destroy 和正式 ZIP closure。独立复验重点：

```bash
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build
git diff --check
```

另人工抽查“只引用一个 sibling JSON 的 ZIP”以及“不同尺寸背景不重置但严格阻止非法导出”。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；不切换 npm/yarn。
- shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置本地代理并重试原命令。
- 计划不新增依赖、不修改 package manifest 或 lockfile；preview 复用现有 Pixi、rendercore 与 vnicore 能力。

## 10. 生成物、文档与规则

- 本任务无 YAML 或手改生成文件；production ZIP 仅作为测试/人工验收临时产物，不提交。
- 更新 `apps/gamelayouteditor/README.md`，记录 Picker typed preview、多 JSON Spine 输入合同、共享 leaf 与 exact export 语义、尺寸变化保留策略。
- 更新 `docs/agent-rules/editor-artifacts.md` 的 Spine import/filename-key ownership，明确 JSON root 到共享 atlas/texture 的单向关联。
- 更新 `docs/agent-rules/scene-layout.md` 的 editor resource lifecycle/production optimization，明确 used root 展开 typed closure、unused sibling 不反向进入闭包和尺寸替换不自动重置已编辑 geometry。
- 不修改根 `AGENTS.md`；本任务没有新增全仓职责边界。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/137-gamelayouteditor-resource-workflow-improvements-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终实现和实际修改文件；
2. Spine 共享 leaf、preview lifecycle、exact closure 与配置迁移的关键决策；
3. 实际验收命令及结果；
4. 未完成的浏览器人工验收；
5. 计划偏差、剩余风险和未完成项。

## 12. 风险、假设与待确认

### 风险

- 多个 Spine JSON 共享 atlas/texture 意味着同 key bytes 覆盖会同时影响多个 roots；transaction 必须复验全部动态受影响 roots，不能只验证本次选中的 JSON。
- official Spine/VNI preview 初始化是异步且带 GPU/URL 资源；候选快速切换若没有 request token 和集中 destroy，容易显示 stale 素材或泄漏。
- 保留旧 geometry 后，新 art size 可能使 reel/focus 越界；这是预期的显式 authoring 错误，UI 必须清楚提示且 export 必须继续失败。
- image-string glyph 很多或 Spine atlas 多 page 时 contact sheet 可能较重；preview 需要限定 viewport、复用 URL/texture，并避免一次创建不可控数量的 runtime player。

### 假设

- 一次 Spine loose-file 批次只有一个 atlas；如美术需要多个 atlas，应分批上传，而不是由文件名猜分组。
- atlas 可声明一张或多张 texture page；“一张贴图”的常见输入自然是单页特例，不把实现限制为只能一张。
- 每个 JSON 都与批次内同一个 atlas/texture map 兼容；编辑器不从 skeleton 内容推导另一套 atlas。
- Resource Picker preview 是只读辅助，不写入 production manifest，也不改变用户必须显式选择 resource/animation 的合同。
- 尺寸变化时“尽可能维持不变”优先保留精确 authored 数值；无法满足严格 production 约束时由用户编辑修复，不自动产生新布局。

### 待确认

无。若执行时发现现有公开 renderer 不能支持 typed preview、共享 leaf 必须改变正式 schema，或需要多个 atlas 自动分组，应在扩大范围前暂停并说明。
