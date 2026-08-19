# 227 gamelayouteditor-audio-asset-workflow 任务计划

## 1. 目标与完成定义

### 目标

重构 `apps/gamelayouteditor` 的音乐/音效 authoring workflow：音频文件先作为统一
filename-key asset 导入资源库，再由布局为各 game mode 绑定 loop BGM，或在资源库中以
显式名字登记为程序音效。预览、production ZIP 和 `gamelayoutpkgcli` 继续消费同一份
Scene Layout v4 typed audio 合同，不在 editor、runtime 或 CLI 维护第二份音频资源表。

### 完成定义

- [ ] 资源 Tab 的“导入资源 / ZIP”能原子导入受支持的音频，音频与图片、Spine、VNI、
      ImgNumber 和视频共用 `project.assets` filename-key namespace、覆盖审查和 bytes ownership。
- [ ] 新导入音频只进入 Assets，不自动成为 BGM、不自动进入程序 allowlist，也不自动
      创建 scene node。
- [ ] Layout workspace 在当前 mode 上编辑“无 BGM / exact audio asset”；新绑定固定生成
      `loop: true`，不提供 once BGM 或隐式继承上一 mode 的路径。
- [ ] 预览在真实用户手势解锁音频后由 Scene Layout production package runtime 播放当前 mode BGM；
      authoring 选 mode 和 production transition 都只在成功 mode commit 后切歌，同曲不重启，失败/
      rollback 保留旧曲。
- [ ] 任一 audio asset 可以显式绑定为程序音效并设置 strict local name；只有该绑定进入
      `audio.effects` 与 `audio.programmaticEffects`，游戏仍通过 runtime `playEffect()` / `stopEffect()` 使用。
- [ ] 删除、替换、取消 BGM/程序绑定与 ZIP 重导入保持 exact reference；仍被 mode 或程序名引用
      的音频不能删除，失去最后引用的 asset 不进入 production closure。
- [ ] production ZIP 结构化写入实际被 BGM/程序音效引用的音频与 map entry；未绑定音频不导出，
      导出再导入保留资源、mode BGM 和程序名。
- [ ] `gamelayoutpkgcli` 能直接处理 editor 的产物：统一收集 root/nested typed audio，将引用音频转为
      AAC-LC/M4A、改写 typed path/media type、重建 map/ZIP 并保留独立 `audio:scene-layout` group。
- [ ] 保持 Scene Layout v1–v3 导入升级、v4 strict parser、Popup/Symbol local effect route、视频转场和非音频
      asset workflow 不变。

## 2. 范围

### 包含

- `apps/gamelayouteditor` audio resource kind、统一导入/替换/删除、Assets UI、Layout mode BGM UI、
  preview unlock/session、manifest projection、ZIP 往返和定向测试。
- 复用 `@slotclientengine/audiocore/editor` 的扩展名/media type/signature 验证，以及
  `@slotclientengine/editorresource` 的 filename-key 边界。
- `packages/rendercore` 现有 mode-audio transaction 的定向回归证据，以及
  `apps/gamelayoutpkgcli` 对 editor ZIP 的端到端音频后处理测试。
- Game Layout Editor/CLI README 和最小领域规则同步。

### 不包含

- 不再次升级 Scene Layout v4、audio v1、Popup v7 或 Symbol v3 schema，不增加 legacy audio 别名或 fallback。
- 不在 Game Layout Editor 编辑 Popup/Symbol owner 内部 cue、duck/pause、voice policy 或状态音效；
  这些继续回各 owner editor 编辑。
- 不把 audio asset 当 scene node/background/视频转场，不把音频塞进现有 `runtimeResources`
  的 image/Spine/VNI/ImgNumber/video union。
- 不在浏览器内转码、不自动改声道/采样率，不处理 video 内嵌音轨，不内置 FFmpeg。
- 不新增 production 音频素材，不修改 game002/game003 业务配置，不修改 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-19T04:22:06Z
HEAD: befa3c7fc2d9c431bfb707adab963bc27048b519
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/scene-layout.md`、`docs/agent-rules/editor-artifacts.md`；目标目录无子级
  `AGENTS.md`。
- Task 223 已完成 `@slotclientengine/audiocore` data/core/editor、Scene Layout v4 optional mode BGM、
  programmatic allowlist、production runtime 和三个 editor 的基础接入；Task 225 已完成 CLI AAC-LC/M4A
  后处理。Task 227 不重做这两个任务。
- `apps/gamelayouteditor/src/ui/project-workspace.ts::projectWorkspaceMarkup()` 当前提供独立
  “导入 BGM / 导入程序音效”入口；
  `apps/gamelayouteditor/src/ui/app-shell.ts::importAudioFiles()` 导入时立即按文件名决定用途，
  直接写 `project.assets`/`project.audio` 并自动加入 allowlist。
- `apps/gamelayouteditor/src/model/editor-resource.ts::EditorLayoutResource` 目前没有 audio kind；
  `resourcesWorkspaceMarkup()` 与 `EditorUiSession.resourceType` 也无 Audio，因此音频 bytes 不可在统一资源库
  查看、替换、删除或绑定用途。
- `apps/gamelayouteditor/src/model/editor-project.ts::editorProjectToManifest()` 已写出 `project.audio` 与
  `mode.bgm`；`manifestToEditorProject()` 会恢复 audio catalog，但不会为其 source 重建 editor resource。
- `apps/gamelayouteditor/src/preview/layout-preview.ts::LayoutPreview` 已使用同一
  `createSceneLayoutPackageRuntime()`；`requestGameMode()` 会 unlock audio，但编辑选 mode/无转场的 preview
  没有独立、可观察的声音解锁会话。
- `exportLayoutZip()` / RenderCore exact closure 已会收集 typed audio；
  `apps/gamelayoutpkgcli/src/audio-assets.ts::collectTypedAudioAssets()` 已收集 Scene Layout、Symbol 和 Popup
  audio，`reference-rewriter.ts` 已结构化同步 path/media type。本任务首先补 editor 端到端产物证据，
  不预设 CLI production code 需要重写。

## 4. 需求解释与技术决策

### 需求解释

- “当做 assets 导入”指先建立 audio resource 与 bytes，用途是可后置变更的 typed binding；
  不再用两个 file input 把文件立即分为 BGM/effect。
- “BGM 在布局里编辑”指 BGM 属于 exact game mode，在 Layout workspace 的当前 mode inspector
  选择；Splash 不伪造 BGM，新 mode 不继承旧 mode 选择。
- “默认 loop”指 editor 新建 music binding 恒为 `loop: true`，且 latest strict schema 不允许 false；
  音效的 once/manual loop 语义不因此改变。
- “设置为程序使用，可以给名字”指 audio-specific effect route，不是现有 typed
  `runtimeResources` 的强制导出键。新 effect 使用现有 once/offset=0/maxConcurrent=4/keep BGM 默认值，
  名字必须符合 audiocore lowercase kebab-case local-name 合同。
- “CLI 统一处理”指 editor 导出的 root BGM/programmatic effect 与 nested Popup/Symbol effect 走现有
  typed collector，不扫描扩展名或 orphan bytes 猜音频。

### 关键决策

1. **保持现有 versioned contract。** `AudioCatalogManifestV1` 仍是 runtime/export 合同；
   editor resource 只描述 media asset，`project.audio` 只描述对 asset path 的业务绑定，bytes 仍只在
   `project.assets` 一处。
2. **导入与绑定分离。** 新导入创建 `EditorAudioLayoutResource { id, kind: "audio", path,
mediaType }`；只有 Layout BGM 或 Assets programmatic action 才创建 catalog binding。
3. **绑定按 exact resource path 回指。** 新 BGM 名默认从 filename key 确定性生成，名冲突显式失败；
   从旧 v4 ZIP 导入时保留 manifest 内 exact music/effect name 与参数，不按文件名重命名。
4. **生命周期由 typed references 决定。** 删除/替换音频先检查 mode BGM 和 programmatic binding；取消
   最后一个 binding 只移除 catalog reachability，不自动删除 asset bytes，用户可再显式删除未引用资源。
5. **预览只走 production runtime。** Editor 提供一次真实手势声音解锁，之后保持 preview-session
   unlocked state；布局重建时销毁旧 runtime/audio owner 并将已解锁状态应用到新 runtime。Editor
   不直接 new `Audio`、`@pixi/sound` 或复制 crossfade/mode state machine。
6. **保留 MP4 的现有歧义边界。** 统一 uploader 中 `.mp4` 继续走视频 metadata 路径；ISO audio
   asset 使用 `.m4a`。不仅凭 `ftyp` 把可能带视频轨的 MP4 静默识别成音频。
7. **CLI 复用而非并行实现。** 用由 editor 导出的 fixture 证明未绑定音频被剪枝、两类 root
   binding 被收集和改写；只在该证据暴露 typed collector/rewriter 缺口时才修改 CLI production code。

## 5. 职责与合同

- **Editor resource 职责**：`EditorAudioLayoutResource` 持有 filename key、media type 和 provenance；
  导入/替换必须在 prepare 阶段校验 extension/signature/alias/size，整批成功后才 commit。
- **Authoring binding 职责**：mode 只保存 exact music name，programmatic effect 名只进
  `audio.effects`/`programmaticEffects`；名字、source 与 media type 必须一致且 strict 复验。
- **Runtime 职责**：RenderCore package runtime 拥有 unlock、loop BGM、crossfade、同曲保持、mode
  prepare/commit/rollback、effect handle 和 destroy；Editor 只调用公开 API。
- **Export/CLI 职责**：RenderCore 从 latest manifest 计算 exact closure；Editor 输出 mapped production ZIP；
  CLI 从 typed graph 收集/改写并原子提交优化 ZIP 与 asset-groups JSON。
- **失败策略**：未知格式、扩展名/签名不符、重名不同 bytes、非法/重复程序名、
  dangling BGM/effect、缺 bytes、decoder 失败或 CLI transcode 失败均显式报错并不留半提交状态。
- **禁止行为**：不按扩展名扫 ZIP 猜 owner，不从 `assets/<hash>.*` 反推名字，不用 orphan
  allowlist 强制导出，不在 mode 名上猜 BGM，不在预览失败时降级为无声成功。

## 6. 文件范围

### 预计新增

```text
apps/gamelayouteditor/tests/audio-assets.test.ts
packages/rendercore/tests/scene-layout/package-runtime-audio.test.ts
tasks/227-gamelayouteditor-audio-asset-workflow-<utctime>.md
```

### 预计修改

```text
apps/gamelayouteditor/src/model/{editor-resource,editor-project,resource-commands,validation}.ts
apps/gamelayouteditor/src/ui/{app-shell,ui-session,resources-workspace,layout-workspace,project-workspace}.ts
apps/gamelayouteditor/src/preview/{layout-preview,preview-asset-paths}.ts
apps/gamelayouteditor/tests/{app-shell,layout-preview,ui-markup,validation,zip-io}.test.ts
apps/gamelayouteditor/tests/fixtures.ts
apps/gamelayouteditor/README.md
apps/gamelayoutpkgcli/tests/{audio-optimizer,package-flow}.test.ts
apps/gamelayoutpkgcli/README.md
docs/agent-rules/{scene-layout,editor-artifacts}.md
```

`apps/gamelayouteditor/src/io/{exported-layout-zip,imported-layout-zip}.ts` 只在现有 generic typed closure/导入恢复无法满足
audio resource 往返时修改；`apps/gamelayoutpkgcli/src/**` 只在端到端测试证明现有 typed 处理有缺口时
扩大，扩大前必须说明原因。

### 原则上不应修改

```text
packages/audiocore/src/{data,core}/**
packages/rendercore/src/scene-layout/**
apps/popupeditor/**
apps/symbolseditor/**
apps/game002v2/**
apps/game003v2/**
assets/**
package.json
pnpm-lock.yaml
```

## 7. 实施步骤

1. **确认执行基线**
   - 重新核对 HEAD、工作区、Task 223/225 合同、Scene Layout latest version 和目标测试。
   - 确认 audio adapter 支持集、`.mp4`/`.m4a` 路由、现有 CLI typed collector 与 ZIP closure 行为；
     若 latest/schema 已变，先判断小幅适配或重新规划。

2. **建立 audio asset 合同与原子命令**
   - 扩展 `EditorLayoutResource`、primary path/paths/signature/description/provenance 和 resource type filter，
     让音频成为一等 filename-key root。
   - 实现批量导入、same-key 覆盖、same-kind 替换、引用检查、删除与 asset GC；复用
     `audioEditorFormatAdapter` 与现有 import review，不保留 `importAudioFiles()` 第二入口。
   - 增加 resource↔music/programmatic binding 查询与 transaction command；未绑定导入、重名、
     被引用删除、替换 rollback 均用 model test 保护。

3. **改造 Assets 和 Layout authoring UI**
   - 统一 uploader accept/routing 加入 MP3/OGG/WAV/M4A/AAC/WebM，结果在 Assets 列表可搜索、
     筛选、查看 media type/引用、替换、删除和试听。audio 不出现在 scene Resource Picker 候选。
   - 移除 Project workspace 的两个专用导入框和 mode BGM 总表；在 Layout inspector 增加
     当前 mode BGM asset 选择、loop 固定提示与现有 fade 值编辑/保留。
   - 在 audio resource row 增加程序音效名字绑定、取消、试听和停止；非法或已占用名
     不修改 draft，不展示普通 runtime-resource/layer/background action。

4. **结构化恢复与 canonical manifest projection**
   - `manifestToEditorProject()` 从 `audio.music/effects` 的 unique source path 恢复 audio resources，保留 exact
     binding name/settings/mode reference；同 path 复用一个 resource，dangling/missing bytes 显式失败。
   - `editorProjectToManifest()`/validation 从有效绑定输出 canonical v4；只有 mode 实际引用的
     music 和 allowlist 实际引用的 root effect 进 closure，不用 stale catalog item 强制导出。
   - 扩展 ZIP round-trip 测试，覆盖同一 BGM 被多 mode 复用、不同 BGM、无 BGM、程序名、
     unused audio 剪枝、map/hash/size 和 v1–v3 空音频升级。

5. **通过 production runtime 验证预览**
   - 为 preview 提供明确的声音启用/状态，在 trusted gesture 调用 package runtime `unlockAudio()`；
     preview rebuild 原子替换 owner，destroy 停止旧音频且不留晚到播放。
   - 用 fake audio backend/host update 定向证明 initial BGM、authoring mode switch、production transition commit、
     同曲不重启、失败/rollback 不切歌和 destroy；预览 app 测试只证明公开 runtime API 被正确调用。

6. **贯通 production ZIP 与 CLI**
   - 用 editor workflow 构造同时含 mode BGM、程序音效和 unused audio 的 mapped ZIP，复验只导出
     exact referenced audio。
   - 将该产物交给现有 CLI runner seam，验证 BGM/effect role 码率、M4A key/mediaType 改写、
     content-addressed map、`audio:scene-layout` group、确定性和失败 rollback。
   - 若现有 CLI 已完整通过，只增测试/文档；若有缺口，只修 typed collector/rewriter 的最小路径。

7. **文档与收尾**
   - 更新 Game Layout Editor README，说明 asset-first import、Layout BGM、programmatic name、
     preview unlock、ZIP closure 与 CLI workflow；CLI README 只补 editor 输入路径。
   - 最小同步 scene-layout/editor-artifacts 稳定责任边界，按第 8 节执行 L2 验收并生成
     UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- model/UI 测试覆盖 asset import 与 binding 分离、用途后置变更、名字 strict failure、删除/替换
  transaction 和导入审查；不用调整 production code 迁就旧的专用入口测试。
- ZIP/CLI 覆盖 exact closure、unused exclusion、结构化 path/mediaType rewrite、map integrity 和 output-pair
  rollback；不使用 extension scan 伪造 typed owner。
- Runtime 用可注入 audio backend/host clock 验证调用和 lifecycle；DOM fake 不冒充真实 decoder、
  autoplay、听觉 loop/crossfade 验收。

### 验收级别

`L2`：修改 Game Layout Editor 的 typed draft/production ZIP authoring workflow，并需要复验 RenderCore runtime 和
CLI 这两个直接 consumer；不修根工具链、lockfile 或 release 配置，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime-audio.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/audio-optimizer.test.ts tests/package-flow.test.ts
git diff --check
```

任一定向命令失败时先缩小到 exact test/case 并判断是否由本任务引入；不自动扩大到整仓
typecheck/lint/test/build/format。

### 人工验收

- 真实 Chrome 和可用的 Safari/iOS 环境：导入 WAV/MP3/OGG/M4A，确认只进 Assets；在 Layout
  为两个 mode 选择同曲/不同曲，首次手势后 loop 播放，同曲不重启，不同曲在场景 commit
  后渐变切换，失败转场保持原 BGM。
- 将一个音效命名为程序 effect，用 preview 试听/停止；取消后确认不再导出，同时未绑定
  audio asset 仍保留在 editor workspace。
- 用真实 FFmpeg/FFprobe 处理导出 ZIP，在目标浏览器复验 AAC-LC/M4A 解码、BGM loop
  接缝、音效声道/听感、ZIP 体积与 asset-groups。

### 独立验收建议

`建议`：不涉及 credential/服务器数据，但修改正式 ZIP closure、audio owner lifecycle 与 CLI 产物。
独立复验聚焦上述三组风险，最多重跑：

```bash
pnpm --filter gamelayouteditor test
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime-audio.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/audio-optimizer.test.ts tests/package-flow.test.ts
```

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 `pnpm`，不切换 npm/yarn。依赖缺失时：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置代理并重试原命令。本计划不需要新 npm 依赖或 lockfile 变化。
- CLI 真实人工验收使用系统 `ffmpeg`/`ffprobe`；自动化继续用可注入 runner，不要求 CI
  安装 binary。

## 10. 生成物、文档与规则

- 本任务不手改生成物。若执行时引入 YAML/manifest generator 变化，必须用对应生成器更新并
  运行 `--check`/parity checker，同时说明文件范围扩大原因。
- `apps/gamelayouteditor/README.md` 是新 authoring workflow 的主文档；
  `apps/gamelayoutpkgcli/README.md` 只描述从 editor ZIP 到优化产物的统一流程。
- 仅把“audio 是统一 resource asset、mode BGM 是 Layout binding、programmatic name 是 typed allowlist”
  这类稳定边界更新到领域规则；不把具体音频清单、码率实例或执行证据追加到根
  `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/227-gamelayouteditor-audio-asset-workflow-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/修改文件、对 Task 223/225 的复用与计划偏差、实际验收命令/结果、
未完成人工验收与剩余风险；不收集无关整仓 coverage、历史矩阵或 profiler 证据。

## 12. 风险、假设与待确认

### 风险

- 当前 audio binding 直接保存 source path，而 audio resource 也保存 path；替换、ZIP key normalization 和重导入
  必须结构化同步，否则会出现资源列表存在但 runtime dangling 的双轨状态。
- preview 在每次 manifest 编辑后可能重建 package runtime；若 unlock state、旧 owner destroy 或异步失败
  generation 处理不完整，可能重播 BGM、声音重叠或留下晚到播放。
- 同一 source 可被多 mode 或多个历史名引用；不得按 bytes/path 静默合并业务名，也不得删除
  一个 binding 时误删共享 bytes。
- AAC encoder padding 可能影响 loop 接缝，Safari/iOS autoplay 与真实 decoder 也不能由 happy-dom/fake backend
  证明，必须保留人工验收。

### 假设

- Scene Layout v4/audio v1 仍是执行时 latest；如已有新版本合并，将本任务作为 asset-first editor
  workflow 小幅适配，不创建竞争 latest。
- 新 BGM 引用既有正数 fade 默认值并恒定 loop；从 ZIP 导入的合法 fade/name/settings 原样保留。
- 新程序音效使用现有默认 once/voice/focus 策略；更完整的 effect authoring 仍属 Popup/Symbol
  owner editor，不借本任务扩展。
- `.mp4` 保留为 Game Layout Editor 视频转场资源，`.m4a` 是 ISO audio asset 的无歧义导入扩展名。

### 待确认

无阻塞实施项。若执行时用户希望同一 audio asset 同时绑定多个不同程序名，可按现有
audio catalog 的多 binding 能力实现，但 UI 必须以显式列表呈现每个 binding，不得用隐式 alias。
