# 162 gamelayouteditor-multi-package-transition-popup 任务计划

## 1. 目标与完成定义

### 目标

修复 Game Layout Editor 中 Symbols/Popup package “界面看似可以有多个，但实际共用固定 root/leaf filename key，后上传会覆盖前一个 bytes”的单例缺口，建立真正可并存、可按 id 替换、可由下拉列表逐状态/逐转场引用的 typed package library。

在 task 161 普通 Spine Popup 基础上，为有向游戏状态转场增加可选前置弹窗：例如 `BaseGame -> FreeGame` 先播放 `start -> loop`，用户点击后等待完整 loop 边界与 end 完成，再开始原有转场动画。未配置前置弹窗时保持直接转场。

所有普通 assets、Symbols 与 Popup package 最终使用同一 filename-key 引用图和 `assets.map.json` 内容寻址输出：只导出被 mode、transition 或显式 programmatic binding 引用的 exact package closure，物理 payload 按完整 SHA-256 去重，不保留或输出未启用的原始大 ZIP。

### 完成定义

- [ ] 同一 editor project 可同时导入多个不同 id 的 Symbols、`award-celebration` Popup 和普通 Spine Popup，其 root/leaf bytes 不互相覆盖。
- [ ] 导入同一 validated package id 时进入明确替换审查；成功后保留已有 mode/transition binding、Popup placement 与兼容配置，失败时整个 project 不变。
- [ ] 不同 package id 内的同 filename key + 相同 bytes 可安全共享；同 key + 不同 bytes 通过稳定唯一 key 与 typed reference rewrite 并存，不直接覆盖其它 owner。
- [ ] 每个 game mode 可独立下拉选择 Symbols package/reelSet/renderMode 和 BigWin `award-celebration` Popup，BaseGame、FreeGame 可引用不同 package。
- [ ] 每条 Spine 有向转场可选择一个普通 Spine `preludePopup`；未选择时转场现有行为和时序不变。
- [ ] 带 `preludePopup` 的转场保持 source mode 显示，弹窗完整结束后才开始 overlay；点击 latch、loop boundary、end completion 继续由 task 161 production player 拥有。
- [ ] 中途重复点击、prepare/start/update 失败、immediate cleanup、project/preview 替换与 destroy 不留下半提交 mode、popup player、transition owner、texture 或 Blob URL。
- [ ] 未被任何 mode/transition/programmatic binding 启用的 Symbols/Popup library item 不进入 layout manifest、production ZIP 或 asset groups；导出/重导后不伪造其存在。
- [ ] 同 bytes 物理 payload 在最终 ZIP 只出现一次；不同 logical owners 仍保持独立 package id、manifest root 和 typed binding。
- [ ] Scene Layout schema/runtime、Game Layout Editor、Package CLI asset groups、文档与直接 consumer 同步，完成 L2 验收并生成任务 162 UTC 中文报告。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 的 Symbols/Popup package library owner 模型、导入审查、同 id 替换、下拉引用、删除/GC、preview 和 ZIP round-trip。
- `packages/rendercore/scene-layout` 的 transition `preludePopup` strict schema、可达性验证、runtime orchestration、snapshot/public API 和 lifecycle。
- 每个 mode 的 Symbols 与 `award-celebration` 绑定现有能力的保护与 UI 澄清，以及每条 transition 的可选普通 Spine Popup 绑定。
- Game Layout ZIP 的 referenced-package exact closure、logical filename-key 分配、typed nested rewrite、SHA-256 payload 去重和重导恢复。
- `apps/gamelayoutpkgcli` 的 transition/Popup asset-group ownership、initial/incremental assets 和 optimized ZIP parity。
- `gameframeworks` 的最小 public type/API parity；不增加游戏专属 facade。

### 不包含

- 不修改 Symbols Editor、Popup Editor 内部 authoring schema、动画、tier、ImgNumber 或 skeleton 内容。
- 不从 ZIP 文件名、上传顺序、`BaseGame/FreeGame` 名字或首项推断 package/transition 绑定。
- 不将原始 Symbols/Popup ZIP bytes 当作最终 layout asset；ZIP 只是 import transport，提交后由 typed manifest/leaf graph 拥有资源。
- 不导出未引用 library item 作为“备份”，也不新增 editor-only 全量 project archive 格式。
- 不自动为所有 mode 绑定最新上传 package，不为缺少 popup 的 transition 自动补默认弹窗。
- 不修改 game002/game003 业务触发、server component 解析或 production assets。
- 首版不允许 `preludePopup` + MP4 overlay：弹窗 end 完成后才异步调用有声 `video.play()` 无法保证仍在 trusted-click 调用栈，不能用静音、提前暗播或跳过弹窗收尾来降级。
- 不新增依赖，不修改 lockfile、根工具链、无关 app 或 assets 生成物。

## 3. 制定计划时的基线

```text
UTC: 2026-08-04T10:02:47Z
HEAD: 41279e7c78894b5d0f8d8866e8985e0e36ca2f26
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与计划输入：

```text
AGENTS.md
tasks/templates/task-plan.md
tasks/161-popupeditor-spine-popup.md
tasks/161-popupeditor-spine-popup-260804-095621.md
tasks/116-gamelayouteditor-project-state-transition-workflow.md
tasks/137-gamelayouteditor-resource-workflow-improvements.md
tasks/140-symbolseditor-asset-replacement-and-zip-import.md
```

本次只新增任务计划文档，根规则明确允许不加载领域规则；执行会话必须按实际修改范围读取 `editor-artifacts.md`、`scene-layout.md` 和 `shared-game-runtime.md`。

当前实现结论：

- `EditorProject.symbolDependencies` 和 `popupDependencies` 已是 Map，Symbols/BigWin UI 也已有 library 与 mode 下拉列表；需要保留而不是重造第二套选择模型。
- `importSymbolDependency()` / `importPopupDependency()` 却把每个 package root 都存成固定 `symbols.package.json` / `popup.manifest.json`，`mergeDependencyAssets()` 对同 key 直接 `Map.set()`；两个不同 package 可留下两个 id，但前一个 root/leaf bytes 可被后一个覆盖。
- `editorProjectToManifest()` 已允许不同 mode 引用不同 Symbols 和 `awardCelebrationPopup`，也只将 mode 引用或 `registeredSpinePopupIds` 集合中的 Popup 写入 root `popups`。
- 当前 Symbols binding 把 `reelSet/renderMode` 存在 package binding 级；同一 package 被多个 mode 引用时两者必须一致。任务不改这个 production contract，只支持不同 mode 选择不同 package binding。
- `replaceSymbolDependency()` 已要求 id 不变并复验已绑定 reel set；`replacePopupDependency()` 已要求 id/type 不变，但两者尚未安全处理多 owner filename-key 分配、旧 exclusive leaf GC 和批量 rollback。
- `SceneLayoutGameModeTransition` 当前只有 `from/to/overlay`；`requestGameMode()` 直接开始 Spine/MP4 overlay，普通 Spine Popup 只能通过 `getSpinePopup(id)` 独立播放，没有转场前置编排。
- task 161 的 `SpinePopupPlayer` 已证明点击 latch、完整 loop boundary、end completion 和 immediate dismiss；新编排应调用该 public player，不复制弹窗状态机。
- `exportLayoutZip()` 已从正式 manifest 收集被引用 package closure，再通过 `editorresource` 生成 `assets.map.json` 和 `assets/<sha256>.<ext>`；物理 bytes 去重已存在，缺口在导入/库内 logical owner 冲突和 transition reachability。
- CLI 目前把所有 `spine-popup` 视为无 mode owner 并放入 initial assets；转场前置绑定后必须把它的 exact closure 纳入对应 transition owner，不能继续全局预载所有 Spine Popup。

当前 schema、测试和导出链已足以制定计划，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “可以传多个”是指多个完整 typed package graph 可在 editor library 中同时存在，不是只留多个 id 但共用最后一份 bytes。
- package 的稳定身份是 nested manifest `id`，不是用户选择的外层 ZIP 文件名。再上传同 id 走替换；不同 id 走新增，即使两个 ZIP 同名也不猜测它们是同一 package。
- “不配置启用就弃用”按正式引用图定义：Symbols 由 mode `symbolPackage` 启用，BigWin 由 mode `awardCelebrationPopup` 启用，普通 Spine Popup 由 transition `preludePopup` 或保留的显式 programmatic registration 启用。library 中未引用项在当前会话可继续编辑/绑定，但不属于 production export。
- BigWin 仍指 `award-celebration` Popup，它属于稳定 mode；task 161 普通 Spine Popup 属于一条 `from -> to` 转场，因为同一 target 可能从不同 source 以不同顺序进入。
- 前置弹窗可选；不配置时不生成 placeholder player、空动画或延时。

### 关键决策

1. **package library 用 owner graph，不再依赖固定 sentinel key**
   - import 先解析/验证 standalone package，再为 root 与 leaf 分配全局 logical filename keys；root 使用包含 package id 的稳定名称，leaf 由统一 collision review 分配。
   - 相同 key/bytes 复用一份 logical entry；同 key/不同 bytes 为 incoming owner 分配稳定 suffix，并通过 Symbols/Popup 正式 rewrite API 改写 nested reference。
   - dependency record 继续只保存 id、root key、exact keys 与 typed editor config；bytes 仍只存一份全局 asset workspace，不按 package id 创建隐式目录 namespace。

2. **同 id 替换是 prepare/review/commit 事务**
   - 替换前列出 add/noop/overwrite/重写结果和所有 mode/transition users；用户确认后才提交。
   - Symbols 对每个现有 user 复验 reelSet、cellSize、reel count 和 display codes；Popup 要求 id/type 不变并重建 exact closure。
   - commit 后只回收无其它 package/resource owner 引用的旧 key；任一分配、rewrite、parse 或 runtime prepare 失败都回滚到原 project。

3. **Scene Layout v1 对 Spine transition 增加可选 `preludePopup`**
   - transition canonical 形式为 `{ from, to, preludePopup?, overlay }`；`preludePopup` 必须引用 root `popups` 中 `type="spine"` 的 binding。
   - `award-celebration` 不能充当 prelude，Spine Popup 不能充当 mode BigWin。unknown id/type、orphan，以及 video overlay + prelude 在 parser/editor command 中显式失败。
   - 保留 `getSpinePopup(id)` 和现有显式 programmatic registration 作为底层兼容能力；新 editor 主流入口在 transition inspector 绑定 prelude，不再要求用户先做一次无业务语义的“注册”才能配转场。

4. **runtime 拥有 popup -> overlay 编排，app 不串联两个 player**
   - `requestGameMode()` 对带 prelude 的 Spine edge 先 prepare 目标 scene/overlay，再启动 popup；source stable/displayed mode 不改变。
   - snapshot 显式区分 `popup | before-switch | after-switch`，并报告 active prelude id；高层 click API 只请求当前 prelude dismiss，不让 app 猜 id 或观察 private track。
   - runtime `update()` 观察 production player 的 complete snapshot，完成后才原子开始已准备的 Spine overlay；返回的 mode request Promise 在整条 popup + overlay 完成后才 resolve。
   - 弹窗或 overlay 失败时保留已确定的 source/displayed boundary，释放 target/popup/transition owner，不瞬切目标 mode。

5. **导出以 reachable package roots 为唯一权威**
   - editor 从 mode Symbols、mode BigWin、transition prelude 和显式 programmatic registrations 收集 package ids，只将可达 binding 写入 manifest 并展开 typed exact closure。
   - 不同 package 引用同 bytes 时，logical keys/owners 按 schema 保留，`assets.map.json` payload path 按 SHA-256 合并。
   - CLI transition group 同时包含 overlay 和 prelude closure；Spine Popup group 记录 `usedByTransitions`，只有 initial mode 可达 transition 或显式 programmatic popup 才进 initial assets。

## 5. 职责与合同

- **Game Layout Editor dependency library**：拥有 package id、root/leaf owner graph、导入冲突审查、替换事务、引用统计与 GC。
- **rendercore Symbols/Popup API**：拥有 standalone parse、typed reference rewrite、exact closure 和 production player；editor 不递归扫描任意 JSON 字符串。
- **Scene Layout manifest/runtime**：拥有 transition prelude binding、strict type/reachability、prepare/commit/rollback、phase snapshot 和 popup -> overlay 编排。
- **Game modes**：稳定 mode 拥有 background、Symbols 和 BigWin；有向 transition 拥有可选 prelude 与 overlay。
- **editorresource / browserartifactio**：拥有 filename-key collision token、import review、SHA-256、payload path、map/hash/size/orphan 验证和确定 ZIP。
- **Package CLI**：拥有 optimized typed rewrite、asset-group ownership、initial/incremental closure 和输出 parity。
- **资源生命周期**：导入/替换使用 prepare-all / validate-all / commit-once；旧 leaf 只在最后 owner 移除后回收。runtime 拥有 popup/transition player，app 借用 presentation layer 不 destroy。
- **失败策略**：非法 id/type/version、错误 nested reference、同 key 冲突未决议、绑定不兼容、缺 bytes、orphan、video+prelude、并发 mode request 和 destroyed-after-use 全部显式失败。
- **禁止行为**：不直接 `Map.set()` 覆盖其它 owner，不猜 package 身份/路径/默认绑定，不复制 popup 状态机，不全量导出 library，不用 placeholder 或效果降级掩盖错误。

## 6. 文件范围

### 预计新增

```text
apps/gamelayouteditor/src/model/package-library.ts
apps/gamelayouteditor/tests/package-library.test.ts
tasks/162-gamelayouteditor-multi-package-transition-popup-<utctime>.md
```

如现有 model/io 边界能清晰承载 owner graph，可减少新文件；不得把 typed rewrite 散落到 UI event handler。

### 预计修改

```text
apps/gamelayouteditor/src/model/{editor-project,game-mode-commands,validation}.ts
apps/gamelayouteditor/src/io/{imported-symbol-package,imported-popup-package,imported-layout-zip,exported-layout-zip}.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/{app-shell,symbols-workspace,bigwin-workspace,transitions-workspace,project-workspace,ui-session}.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/{app-shell,game-mode-commands,imported-symbol-package,popup-package,zip-io,layout-preview,transitions-workspace,validation}.test.ts
apps/gamelayouteditor/README.md

packages/rendercore/src/scene-layout/{types,manifest,package-runtime,index}.ts
packages/rendercore/tests/scene-layout/{manifest,package-resource,package-runtime,package-runtime-mode}.test.ts
packages/rendercore/README.md

apps/gamelayoutpkgcli/src/{asset-groups,types}.ts
apps/gamelayoutpkgcli/tests/{asset-groups,package-flow}.test.ts
apps/gamelayoutpkgcli/README.md

packages/gameframeworks/tests/scene-layout-template.test.ts
docs/scene-layout-manifest.md
docs/agent-rules/{editor-artifacts,scene-layout,shared-game-runtime}.md
```

Symbols/Popup 若缺可复用的 public typed key-rewrite helper，允许在其现有 package 模块增加最小 API 与测试；不得在 editor 复制 manifest schema。

### 原则上不应修改

```text
apps/symbolseditor/**
apps/popupeditor/**
packages/rendercore/src/popup/spine-player.ts
packages/rendercore/src/scene-layout/video-transition-player.ts
packages/logiccore/**
apps/game002/**
apps/game003/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

若要支持 MP4 + prelude、新增 editor 全量 archive 或修改游戏业务触发，必须先说明新的用户手势/持久化/业务合同，不得在本任务中顺带实现。

## 7. 实施步骤

1. **确认执行基线并固定当前失败行为**
   - 重读根规则、三份领域规则、本计划与当前 public schema/API，重核 HEAD/status。
   - 先写两个 Symbols 和两个 Popup 使用相同 sentinel/叶子名但不同 bytes 的回归，证明当前第二次导入污染第一个 owner。
   - 固定现有 per-mode Symbols/BigWin 下拉行为、同 id 替换引用保留和未引用 package 排除。

2. **建立统一 package-library import transaction**
   - 将 standalone Symbols/Popup 导入结果转换为 typed owner graph，通过 editorresource collision review 分配 root/leaf logical keys。
   - 为需改名的 leaf 调用正式 typed rewrite，重新 parse/closure validate 后才生成 dependency record。
   - 实现 new/noop/replace 和 same-bytes share，整批使用 clone + prepare + atomic store replace，取消不写入 project。

3. **实现同 id 替换、删除与 owner-aware GC**
   - 替换 Symbols 前复验所有 mode binding，替换 Popup 前复验 id/type、placements、programmatic/transition users。
   - 提交新 graph 后从全部普通 resource、Symbols、Popup 与 runtime binding 动态计算 asset owners，只移除无 owner 的旧 key。
   - 让 import review 显示 package id、是否替换、受影响 mode/transition、复用/新增/回收 key 数，确认后才更新预览与当前选择。

4. **扩展 Scene Layout transition schema 与 strict closure**
   - 为 Spine transition 增加可选 `preludePopup`，同步 type、parser、deep-freeze、known fields、type parity、orphan/reachability 和 canonical JSON 测试。
   - 让 manifest package collector/loader 将 transition 引用的 Popup 纳入 exact closure，并保持无 prelude 旧 manifest 的 parse/runtime 行为。
   - 显式拒绝 award popup 当 prelude、未知 popup、MP4 + prelude 和无任何 owner 的 editor export item。

5. **实现 runtime popup -> Spine overlay 编排**
   - 在 mode request prepare owner 中加入 prelude player，开始时保留 source scene，用新 snapshot phase 报告等待点击/收尾。
   - 增加高层 dismiss/advance API，调用 `SpinePopupPlayer.requestDismiss()`；完成后再启动现有 Spine transition player。
   - 覆盖早点击、中段点击、重复点击、无点击持续 loop、end 完成、popup/overlay error、immediate cleanup、重入 request 和 destroy。

6. **接入 Game Layout Editor mode/transition 工作流**
   - 保留 Symbols/Popup library selector 与当前 mode binding selector 的区分，明确显示每项被哪些 mode/transition 引用。
   - transition inspector 对 Spine edge 增加“转场前弹窗”下拉，只列出 validated Spine Popup；空选项表示直接转场。
   - preview 的一次“切换到该状态”请求驱动整条编排，弹窗点击按钮转发高层 API，中文状态区分 popup/切换前/切换后。
   - layout 导入恢复多 package keys、mode binding、transition prelude、placement 和显式 programmatic popup，不把 transition-only Popup 误恢复为全局 programmatic registration。

7. **收口 ZIP、CLI groups、文档与验收**
   - 导出只传递可达 package files，覆盖多 Symbols/多 Popup、共享 bytes、同名不同 bytes、unused root 裁剪、assets map/payload 去重与 export/import/export parity。
   - CLI 让 transition group 包含 prelude closure，计算 `usedByTransitions` 和 initial/incremental assets，复验所有 optimized assets 有 owner 且无 orphan。
   - 更新 README、Scene Layout 文档与三份最小领域规则，运行 L2 验收并生成 UTC 中文报告。

## 8. 测试与验收

### 测试原则

- package-library fixture 至少覆盖：不同 id + 相同 sentinel，相同 leaf bytes 共享，同名 leaf 不同 bytes 改名/rewrite，同 id 替换，部分解析失败全回滚，最后 owner 删除才 GC。
- mode 测试覆盖 BaseGame/FreeGame 使用不同 Symbols 和 BigWin，共用同 package 时现有 reelSet/renderMode 一致性仍显式校验。
- transition 测试覆盖无 prelude parity、有 prelude 完整顺序、早/重复点击、source 保持、popup complete 后才启 overlay、Promise settle、strict id/type/video failure。
- lifecycle 测试覆盖 import replace、preview rebuild、prepared transition invalidation、popup/overlay failure、immediate cleanup 和 destroy 的幂等释放。
- ZIP/CLI 测试直接检查 logical manifests、assets map、physical payload 数量、asset-group owners 和 round-trip，不只断言 export Promise 成功。
- 不为旧错误测试保留固定 sentinel 覆盖；与明确新合同冲突的 fixture/期望应同步更新。

### 验收级别

`L2`。任务修改 Scene Layout public schema/runtime API、正式 Layout ZIP logical owner graph、跨 package typed rewrite 和 CLI asset-group schema，并影响 editor、rendercore、CLI 与 gameframeworks 直接 consumer；不修改根工具链、lockfile 或 release，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks format:check
git diff --check
```

### 人工验收

1. 在 Game Layout Editor 连续导入两个 Symbols ZIP 和两个 Popup ZIP，它们内部使用相同 sentinel/贴图名但不同 bytes；确认 library 中四个 owner 均可选、预览正确。
2. 让 BaseGame/FreeGame 分别绑定不同 Symbols 与 BigWin，来回切换编辑状态，确认下拉值、reel preview 和 Popup preview 不串包。
3. 为 `BaseGame -> FreeGame` Spine 转场选择普通 Spine Popup，发起状态切换；等待至少两个 loop，在中段点击，确认 popup end 完成前 source mode 与 transition overlay 不变，之后 overlay 才开始。
4. 清空该 prelude 后重试，确认直接转场；尝试把 prelude 绑到 MP4 edge，确认编辑器明确拒绝而不降级。
5. 重上传同 package id 但更新 bytes 的 ZIP，确认显示替换审查、原 mode/transition binding 保留，其它 package 预览不变。
6. 保留一个未引用 Symbols 和 Popup，导出/重导 layout ZIP；确认它们的 manifest/leaf 不在 ZIP，共享 payload 按 hash 只写一次，已绑定 package 与 prelude 无损。

### 独立验收建议

`必须`。本任务涉及跨包 public schema/API、异步 popup -> transition transaction、多 owner 资源生命周期、正式 ZIP 与 asset-group 生成物。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor test
pnpm --filter gamelayoutpkgcli test
git diff --check
```

并至少目视一次真实普通 Spine Popup 收尾完成后才开始 Spine transition。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只运行 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改 lockfile；`editorresource`、`browserartifactio`、rendercore typed collectors/player 和当前 ZIP 工具已足够。

## 10. 生成物、文档与规则

- 本任务修改正式 Scene Layout/asset-group schema 和 ZIP workflow，必须同步 parser、writer、typed rewrite、fixture 与 parity checker；不手改任何由生成器拥有的文件。
- 更新 `docs/scene-layout-manifest.md` 的 multi-package filename-key owner、per-mode binding、transition prelude、strict MP4 边界和 exact closure。
- 更新 Game Layout Editor/RenderCore/CLI README，说明 package id 替换、多项下拉、unused export 排除、hash payload 去重与 popup -> transition 操作。
- 最小更新 `editor-artifacts.md`、`scene-layout.md`、`shared-game-runtime.md`，记录稳定 owner/transaction/runtime 边界；不把精确 package 名、任务结论或测试数据追加到根 `AGENTS.md`。
- 本任务默认不修改 `assets/**` 或游戏生成物；若执行时要接入真实游戏，先停止说明范围和额外 checker。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/162-gamelayouteditor-multi-package-transition-popup-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录实际修改、schema/API 决定、多 owner 资源事务、自动化命令、人工验收、计划偏差与剩余风险，不收集无关整仓 coverage 或历史矩阵。

## 12. 风险、假设与待确认

### 风险

- 将固定 sentinel 改为多 owner root 会暴露测试和 consumer 中对 `symbols.package.json` / `popup.manifest.json` 的隐式假设；必须通过 typed root 解析修复，不用可选链或“最后一个”降级。
- package replace 可以改变共享 leaf owner 集；如果 GC 只看当前 package，可删除其它普通 resource/package 仍需要的 bytes。
- popup complete 与 overlay start 可在同一 frame update 中发生；snapshot 和 Promise 必须保证 end 已 complete 后才进入 `before-switch`，不出现两个 overlay 重叠或丢失一帧状态。
- CLI 如仍把所有 Spine Popup 全局列入 initial，会抵消 transition ownership 和按需导出/加载收益；需直接验证 initial/incremental 列表。
- 真实 WebGL/Spine 视觉边界和点击节奏无法由 fake player 完全代替，必须保留浏览器验收。

### 假设

- task 161 的 `SpinePopupPlayer` public snapshot/requestDismiss/dismissImmediately/update 足以支持新编排，不需要读取 Spine private track 或修改 popup 动画合同。
- 用户说的“同名替换”对 package 指 validated manifest id 相同；普通 loose asset 仍按现有 filename-key 冲突合同替换。
- 新前置弹窗的产品顺序优先于 MP4 自动播放扩展，因此首版只与 Spine overlay 组合。

### 待确认

无。如执行目标改为“普通 Spine Popup 结束后也必须单击自动启动有声 MP4”，需先定义可在 iOS/WebKit 实机验证的媒体手势合同，不能在实施中猜测。

## 13. 完成清单

- [ ] 多 Symbols/多 Popup owner 真实并存，不再共用最后一份 sentinel/leaf bytes。
- [ ] 同 package id 替换、取消回滚、引用保留和 owner-aware GC 符合计划。
- [ ] BaseGame/FreeGame 等 mode 可独立选择 Symbols 和 BigWin。
- [ ] optional prelude popup、点击收尾、之后才启 Spine overlay 的全链路受测试保护。
- [ ] 无 prelude 直接转场和旧合法 mode/Popup 行为无回归。
- [ ] 未启用 package 不导出，logical owner 不丢失，physical payload 按 SHA-256 去重，CLI group 无 orphan。
- [ ] public API/schema、测试、README、领域规则和必要生成物已同步。
- [ ] 指定 L2 自动化、真实浏览器与独立验收已分开记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`editor-artifacts.md`、`scene-layout.md`、`shared-game-runtime.md` 和本计划；
2. 核对 Git 基线与工作区，保留用户无关修改；
3. 先用失败测试锁定多 package bytes 污染，再实现 owner graph/替换事务，之后接 schema/runtime/editor/CLI；
4. 小幅适配当前文件结构时在报告记录；若要支持 MP4 + prelude、新 archive 或游戏业务触发，先停止说明；
5. 只运行计划指定的 L2 验收，真实视觉项与自动化分开记录；
6. 完成后生成任务 162 UTC 中文报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
