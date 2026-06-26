# vnicore runtime bundle profiles 任务计划

## 1. 任务目标

持续完善 Pixi.js v8 VNI 动画核心库：

```text
/Users/zerro/github.com/slotclientengine/packages/vnicore
```

以及基于它播放 VNI 导出资源的 viewer：

```text
/Users/zerro/github.com/slotclientengine/apps/anieditorv5viewer
```

本任务跟进 `docs/anieditor5/src` 的最新 editor 代码和 `docs/anieditor5/export2` 的新导出合同，完成以下交付：

1. `packages/vnicore` 支持 `VNI_0.020` 语义下的运行时导出合同：
   - `export2` ZIP 无论是否压缩资源，都导出 `manifest.json`、`edit_full/` 和 `runtime_N/` 双 profile。
   - `runtime_100` 是合法运行时 profile，不应被当成 legacy 100% 单项目导出。
   - bundle entry 的 JSON 文件名来自项目名，例如 `runtime_100/roundreel.json`，不能假设一定叫 `project.json`。
   - `runtime` profile 是编辑器裁剪隐藏组/隐藏层后的运行包；`editing` profile 保留完整编辑数据。
2. `packages/vnicore` 更新 `safe_glow` 的 Pixi 语义：`safe_glow` 仍然是同图副本、缩放和透明度呼吸，不使用滤镜或模糊，但副本的 `blendMode` 必须继承图层显示模式，例如 `add`、`screen`、`lighten`、`multiply` 或 `normal`，不能继续固定为 `normal`。
3. `apps/anieditorv5viewer` 支持 manifest 驱动的 `export2` profile 注册：
   - 可以注册 `runtime_50/project.json`、`runtime_100/roundreel.json` 这类不同 profile id 和不同 JSON 文件名。
   - 资产 URL 仍然必须按 profile 作用域解析，不能退化成全局 `asset.path -> url` 映射。
   - project selector、summary、diagnostics、group insertion asset 列表都能显示和使用新 profile。
4. 同步测试、README、`packages/vnicore/docs/*`、examples 和必要的 fixture，保持 `vnicore` 覆盖率门槛不低于 80%。
5. 对本次 `docs/anieditor5/src` 的所有 diff 做逐项归类：哪些需要 `vnicore` / viewer 实现，哪些当前已经支持，哪些明确不是本任务目标。不能只处理 `runtime_100` 后忽略其它 editor 行为变化。
6. 判断是否需要同步更新 `agents.md`。只有本任务产生新的长期仓库协作规则时才更新；如果现有规则已经覆盖，任务报告必须说明未更新原因。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、浏览器验收、文档同步、协作规则同步判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/53-vnicore-runtime-bundle-profiles-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/53-vnicore-runtime-bundle-profiles-260626-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 新增空目录必须放 `.keepme`

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。若确实需要新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
git diff -- docs/anieditor5/src
```

注意：

- `git diff` 不会展示 untracked 文件内容；本任务涉及的新增 JSON 和图片必须通过 `git status --short --untracked-files=all` 显式检查。
- 当前已经观察到 `tasks/52-game002-static-release.md` 是未跟踪文件，本任务不要修改它。
- 当前仓库实际存在的协作规则文件是 `agents.md`。如果执行时又出现 `AGENTS.md`，且两个文件都存在，则需要按实际仓库状态检查是否同步更新。

## 3. 当前已知事实

执行时必须重新阅读当前实现，以实际代码为准。当前已经观察到的事实如下。

### 3.1 editor 侧最新改动

当前 tracked diff 涉及：

```text
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/constants.ts
docs/anieditor5/src/export_project.ts
docs/anieditor5/src/main.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/types.ts
```

关键变化：

- `docs/anieditor5/src/constants.ts` 把 `VNI_VERSION` 从 `VNI_0.017` 升到 `VNI_0.020`。
- `docs/anieditor5/src/export_project.ts` 的 `buildProjectJson(state)` 改为导出 `toExportProject(state.project, "runtime")`。
- `exportProjectZip(...)` 不再在 `assetScale >= 0.999` 时导出 legacy 单项目 ZIP，而是始终写入：
  - `manifest.json`
  - `edit_full/<projectName>.json`
  - `runtime_${Math.round(assetScale * 100)}/<projectName>.json`
- `edit_full` 的 `purpose` 是 `editing`，`runtime_N` 的 `purpose` 是 `runtime`。
- `project_state.ts` 新增 `V5GExportProjectPurpose = "editing" | "runtime"`。
- `toExportProject(project, "editing")` 保留完整编辑数据。
- `toExportProject(project, "runtime")` 会过滤隐藏组/隐藏层，并只保留运行包实际引用的 assets。
- `toExportProject(project, "runtime")` 会把 `project.particles` 引用的 asset 也计入保留集合，避免运行包粒子资源被误删。
- `types.ts` 已明确：隐藏 group 在 canvas 上隐藏；runtime export 跳过，editing export 保留。
- `main.ts` 的导出提示已改为“所有资源比例都会导出 edit_full + runtime 双份 Bundle”。
- `pixi_stage.ts` 的 safe glow 预览现在把 `layer.blendMode` 传给绘制函数，safe glow 副本继承图层显示模式。
- `animation_presets.ts` 的 safe glow 文案已改为：预览副本会继承图层显示模式，但仍不依赖滤镜或模糊。

执行时还必须把每个 changed source file 的 diff 分类写入任务报告：

```text
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/constants.ts
docs/anieditor5/src/export_project.ts
docs/anieditor5/src/main.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/types.ts
```

分类格式建议为：

- `需要实现`：当前 `vnicore` 或 viewer 不能正确消费的新 runtime 合同。
- `已支持但需测试锁定`：当前代码已有能力，但缺少 fixture、测试或文档证明。
- `非本任务目标`：明确不在 `packages/vnicore` / `apps/anieditorv5viewer` 范围内，且没有被静默忽略。

### 3.2 当前 export2 新资源状态

当前工作区新增了：

```text
docs/anieditor5/export2/runtime_100/roundreel.json
docs/anieditor5/export2/runtime_100/assets/gx_6_asset_image_mqthi919_1e.png
docs/anieditor5/export2/runtime_100/assets/image_asset_image_mqtjdi3v_3.jpg
```

`runtime_100/roundreel.json` 摘要：

```text
schemaVersion: VNI_0.020
editor.version: VNI_0.020
name: roundreel
stage: 2000 x 2000
duration: 3.1
exportProfile.id: runtime_100
exportProfile.purpose: runtime
exportProfile.assetScale: 1
assetCount: 2
layerGroupCount: 1
blendMode: add
animationTypes: rotate, safe_glow, blink, scale_out
```

当前 `docs/anieditor5/export2/manifest.json` 仍是旧的 `VNI_0.002`，只登记：

```text
edit_full/project.json
runtime_50/project.json
```

这意味着当前 `export2` 目录可能还不是一个完整同步后的 `VNI_0.020` bundle。执行本任务时必须先补齐或重新确认 `docs/anieditor5/export2` 的源数据，不能只围绕孤立的 `runtime_100/` 目录写隐藏兜底。

可接受的源数据整理方式：

1. 如果当前目标是把 `roundreel` 作为新的完整 bundle，则必须让 `docs/anieditor5/export2/manifest.json`、`edit_full/roundreel.json`、`runtime_100/roundreel.json` 和对应 assets 成为同一个 bundle。
2. 如果需要保留旧 `bigwin` 的 `runtime_50` 非回归 fixture，则把旧 bundle 和新 `roundreel` bundle 分清楚，不要让一个 manifest 同时描述互不对应的项目。
3. 无论采用哪种方式，最终 viewer 和 `vnicore` fixture 都必须来自同一套自洽的 manifest/project/profile 数据。

`docs/anieditor5/export` 也必须清点。它是旧的单项目 100% 导出资源目录，当前 viewer 仍把其中多个 JSON 作为 legacy fixture 注册。执行本任务时需要确认：

- 本次 editor 更新是否也产生了新的或更新后的 `docs/anieditor5/export/*.json`。
- 如果有新增或更新的 legacy 单项目导出，是否需要同步到 `apps/anieditorv5viewer/src/assets/projects/`、`apps/anieditorv5viewer/src/assets/assets/` 和 `packages/vnicore/tests/fixtures/export/`。
- 如果没有更新，则在任务报告说明 legacy `export` 仅做非回归验收，不作为 `runtime_100` 新合同来源。

### 3.3 当前 vnicore 状态

当前 `packages/vnicore` 已经支持：

- `V5G_0.x` 和 `VNI_0.x` schema family。
- `VNIBundleManifest` / `VNIBundleManifestEntry` 类型。
- `assertVNIBundleManifest(...)`、`validateVNIBundleManifest(...)`、`validateManifestProjectProfile(...)`。
- `exportProfile.id/purpose/assetScale` 与 manifest entry 一致性检查。
- `fileWidth` / `fileHeight` / `fileScale` all-or-none 校验。
- `runtime_50` 贴图真实尺寸校验和逻辑显示尺寸补偿。
- `safe_glow`、`glow`、`shatter`、`squash_stretch`、粒子、segmented playback、layer group slot insertion。
- profile-scoped asset URL resolver 的基础函数 `createAssetUrlManifest(...)` 和 `resolveProjectAssetUrls(...)`。

当前缺口：

- `packages/vnicore/src/core/safe-glow-sampler.ts` 的 `VNISafeGlowSpriteSample.blendMode` 仍固定为 `"normal"`。
- `packages/vnicore/README.md`、`packages/vnicore/docs/usage-zh.md`、`packages/vnicore/docs/api-zh.md`、`packages/vnicore/examples/README.md` 仍把 `safe_glow` 描述为 fixed normal blend。
- `packages/vnicore/tests/core/safe-glow-sampler.test.ts` 和 `packages/vnicore/tests/pixi/vni-player.test.ts` 仍有固定 normal blend 的断言，需要按新语义改测试。
- `packages/vnicore/tests/fixtures/export2` 目前只覆盖旧 `edit_full/project.json` 和 `runtime_50/project.json`，缺少 `runtime_100/roundreel.json`、任意 JSON 文件名、`assetScale=1` 的 runtime profile 验收。
- `packages/vnicore/src/core/validation.ts` 当前显式拒绝非空 top-level `project.particles`。本次 editor 只是确保 runtime 导出保留 `project.particles` 引用的 assets；这不等同于 `vnicore` 已支持 top-level particles。

### 3.4 当前 anieditorv5viewer 状态

当前 `apps/anieditorv5viewer` 已经是 `@slotclientengine/vnicore` 的薄壳：

- viewer 负责 bundled JSON/assets、project selector、controls、styles、browser assembly。
- validation、sampling、Pixi rendering、texture-size checks、particles、playback ranges、segmented playback、particle draining 和 diagnostics 都在 `packages/vnicore`。

当前缺口：

- `apps/anieditorv5viewer/src/config/bundled-projects.ts` 直接 import：
  - `../assets/export2/manifest.json`
  - `../assets/export2/edit_full/project.json`
  - `../assets/export2/runtime_50/project.json`
- `BundledProjectId` 把 `bigwin-edit-full` 和 `bigwin-runtime-50` 写成固定 union。
- `requireExport2ManifestEntry(...)` 硬编码 `edit_full/project.json` 和 `runtime_50/project.json`。
- `validateExport2ManifestPaths(...)` 只允许这两个路径。
- `apps/anieditorv5viewer/src/runtime/asset-manifest.ts` 只 glob：
  - `../assets/export2/edit_full/assets/*`
  - `../assets/export2/runtime_50/assets/*`
- 当前 viewer 不能注册 `runtime_100/roundreel.json`，也不能接受任意 profile id 或任意 JSON 文件名。

## 4. 架构边界和非目标

### 4.1 必须放在 vnicore 的部分

以下逻辑属于 `packages/vnicore`：

- VNI project 和 bundle manifest 的类型、assert、validate。
- manifest entry 与 project `exportProfile` 一致性检查。
- asset metadata 和 texture size 的 fail-fast 校验。
- `safe_glow` 采样和 Pixi 渲染语义。
- `safe_glow` 与旧 `glow` / `shatter` render effect 的职责分离。
- profile-agnostic 的 asset URL 解析工具。
- docs/examples 中对 public runtime contract 的说明。

### 4.2 必须留在 viewer 的部分

以下逻辑属于 `apps/anieditorv5viewer`：

- 从 `src/assets` 注册 bundled JSON 和图片。
- 通过 `import.meta.glob` 或等价静态导入机制把 Vite bundle 内资源变成 URL。
- 根据 manifest entry 生成 project selector 的项目定义。
- 维护 UI 控件、summary、diagnostics 展示和 group insertion asset 列表。
- 浏览器验收脚本、happy-dom UI 测试和 README 中的 viewer 使用说明。

### 4.3 明确非目标

- 不把 editor-only 的 `toExportProject(...)` 逻辑搬到 `vnicore`；运行时只消费已经导出的 JSON。
- 不在 viewer 里复制 `vnicore` 的播放状态机、group adjacency 算法或直接操作 runtime 私有 Pixi container。
- 不把 `runtime_100` 当成 legacy 单项目导出，也不因为 `assetScale=1` 就跳过 manifest/profile 校验。
- 不为了测试保留旧的 hard-coded `runtime_50/project.json` 假设；如果测试因此失败，修改测试合同。
- 不做“找不到 profile 就自动选第一个”“找不到 asset 就跳过”“manifest 不匹配就忽略 exportProfile”等隐藏兜底。数据不完整或不自洽必须显式失败。
- 不把不同 profile 的同名 `asset.path` 合并到全局映射；`edit_full/assets/foo.png` 和 `runtime_50/assets/foo.png` 必须可以解析成不同 URL。
- 不在本任务顺手实现 top-level `project.particles` 播放。如果新的 `VNI_0.020` fixture 出现非空 `project.particles`，必须显式决定是否扩大任务范围；不扩大时继续 fail-fast，并在报告中说明这是当前不支持的 runtime 能力，而不是忽略粒子通过测试。
- 不修改 `packages/anieditorv5runtime-cc`、`standalone/anieditorv5runtime-cc.ts` 或 `standalone.zip`。本任务目标是 Pixi `vnicore` 和 viewer；如果后续明确要求同步 Cocos runtime，必须按仓库规则另行同步模块化源码、standalone、checker、测试和 zip。
- 不新增 npm 依赖，除非实现中有无法用现有 Vite/TypeScript 能力解决的真实问题。

## 5. 实施步骤

### 5.1 现状复核和源数据同步

执行：

```bash
git status --short --untracked-files=all
git diff --stat
git diff -- docs/anieditor5/src/export_project.ts docs/anieditor5/src/project_state.ts docs/anieditor5/src/pixi_stage.ts docs/anieditor5/src/animation_presets.ts docs/anieditor5/src/constants.ts docs/anieditor5/src/main.ts docs/anieditor5/src/types.ts
```

复核 `export_project.ts` 的实际合同：

- `runtimeProfileId = runtime_${Math.round(assetScale * 100)}`。
- manifest entry 的 `path` 使用 `${profileId}/${jsonFilename}`。
- `jsonFilename` 来自 `buildExportJsonFilename(state.project.name)`。
- `edit_full` 使用 `projectPurpose: "editing"`。
- `runtime_N` 使用 `projectPurpose: "runtime"`。

复核 `docs/anieditor5/export2` 是否完整自洽：

```bash
find docs/anieditor5/export2 -maxdepth 3 -type f | sort
```

同时复核 legacy `export` 目录：

```bash
find docs/anieditor5/export -maxdepth 2 -type f | sort
```

若 `manifest.json` 没有登记 `runtime_100/roundreel.json`，或者缺少匹配的 `edit_full/roundreel.json`，执行者必须先补齐源数据。可以从 editor 重新导出，也可以按 `export_project.ts` 的明确合同同步文件；无论方式如何，任务报告必须说明来源。

同步源数据后，需要把同一套 fixture 复制或更新到：

```text
apps/anieditorv5viewer/src/assets/export2/
packages/vnicore/tests/fixtures/export2/
```

如果保留旧 `runtime_50` 作为非回归 fixture，必须确保测试里清楚地区分旧 fixture 和新 `runtime_100` fixture，不能让一个 manifest 描述两套互不对应的 project。

### 5.2 更新 packages/vnicore

建议调整文件：

```text
packages/vnicore/src/core/safe-glow-sampler.ts
packages/vnicore/src/core/asset-manifest.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/core/safe-glow-sampler.test.ts
packages/vnicore/tests/core/asset-manifest.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/tests/fixtures/export2/
packages/vnicore/README.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
packages/vnicore/examples/basic-player.ts
packages/vnicore/examples/validate-project.ts
```

实现要求：

1. `VNISafeGlowLayerSampleState` 或 `sampleSafeGlowSpritesForLayer(...)` 的输入必须能拿到图层 `blendMode`。
2. `VNISafeGlowSpriteSample.blendMode` 类型改为 `V5GBlendMode`，不再是 `"normal"`。
3. `sampleSafeGlowSprite(...)` 输出的 `blendMode` 必须继承当前图层显示模式。
4. `VNIPlayer.renderSafeGlowSprite(...)` 继续通过 `toPixiBlendMode(...)` 写入 Pixi sprite。
5. `safe_glow` 仍然不进入 `render-effect-sampler`，不能和旧 `glow/shatter` 的 render effect 统计混在一起。
6. `data-vni-safe-glow-sprites` 继续只统计 safe glow 副本数量；`data-vni-render-effect-sprites` 继续只统计旧 render effect。
7. `validateV5GBundleManifest(...)` 必须接受 `runtime_100/roundreel.json` 这类 JSON path，但仍要拒绝非 JSON path、重复 id、非法 purpose、非法 assetScale。
8. `validateManifestProjectProfile(...)` 对 `assetScale=1` 的 runtime profile 也必须严格检查，不允许因为 100% 而跳过。
9. asset manifest 测试必须覆盖 profile-scoped 同名 path：同一个 `assets/foo.png` 在 `edit_full`、`runtime_50`、`runtime_100` 下可以解析到不同 URL。
10. 如果新增 helper，必须保持 helper 是 profile-agnostic 的通用能力，不把 viewer 的目录结构写死进 `vnicore`。

测试要求：

- `safe_glow` 采样测试要覆盖至少一个非 normal blend，例如 `add`。
- Pixi player 测试要确认 safe glow 副本实际 sprite 的 `blendMode` 继承图层模式。
- validation 测试要覆盖 `VNI_0.020`、`runtime_100`、`assetScale=1` 的 runtime profile、任意 JSON 文件名。
- validation 测试要保留非空 top-level `project.particles` 的显式失败，除非本任务经过明确范围扩大并完整实现该能力。
- 旧 `runtime_50` 逻辑和 texture size display compensation 不回归。
- 如果旧测试断言 `safe_glow` 固定 normal，删除或改写该断言；不要为了旧测试保留错误生产语义。

### 5.3 更新 apps/anieditorv5viewer

建议调整文件：

```text
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/tests/bundled-projects.test.ts
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/src/assets/export2/
apps/anieditorv5viewer/README.md
```

实现要求：

1. 用 manifest 驱动 `export2` profile 注册，不再硬编码 `edit_full/project.json` 和 `runtime_50/project.json`。
2. 推荐使用 Vite 静态 glob 注册 JSON 和 assets：

```ts
const export2ProjectModules = import.meta.glob("../assets/export2/*/*.json", {
  eager: true,
  import: "default",
});

const export2AssetModules = import.meta.glob(
  "../assets/export2/*/assets/*",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);
```

3. 根据 manifest entry 的 `path` 查找对应 project JSON；找不到必须 throw。
4. 根据 manifest entry 的 `id` 或 `path` 第一段筛选该 profile 的 asset modules；找不到 project 需要的 asset 必须 throw。
5. 验证 `entry.path` 必须是相对 JSON path，不能是绝对路径、不能包含 `..`，并且 path 第一段应与 `entry.id` 一致。若实际 editor 合同变化，必须在任务报告说明原因并用测试锁定新合同。
6. 每个 manifest entry 都必须执行：
   - `assertVNIProject(projectData)`
   - `validateVNIProject(project)`
   - `validateManifestProjectProfile(entry, project)`
   - `resolveProjectAssetUrls(project, profileAssetManifest)`
7. `BundledProjectId` 不应继续是固定 union；可以改为 `string` 或由定义数组推导，但必须允许 `roundreel-runtime-100` 这类新 id。
8. project id 推荐规则：
   - legacy 项目保留当前 id。
   - export2 项目使用 `${project.name}-${profile.id}` 后把 `_` 转成 `-`，例如 `bigwin-runtime-50`、`roundreel-runtime-100`。
   - 若需要保持已有 UI 测试稳定，必须通过 deterministic id 规则保持旧 `bigwin-runtime-50`，不能加别名兜底。
9. label 继续展示 project name、bundle/profile、百分比和 purpose，例如 `roundreel (export2/runtime_100, 100% 运行资源)`。
10. group insertion asset 列表必须来自当前 profile 的 asset manifest 全集；同名 asset path 在不同 profile 下不能串 URL。
11. selector 切换到 `roundreel-runtime-100` 后，`VNIPlayer` options 必须包含：
    - `bundleId: "export2"`
    - `profileId: "runtime_100"`
    - `profilePurpose: "runtime"`
    - `assetScale: 1`
12. viewer 不负责把 editing profile 动态裁剪成 runtime profile；它只播放导出 JSON 中已有的 `visible` 和 `exportProfile` 数据。

测试要求：

- `bundledProjects.map((project) => project.id)` 要包含 `roundreel-runtime-100`。
- `roundreel-runtime-100` 的 `project.schemaVersion` 是 `VNI_0.020`。
- `roundreel-runtime-100` 的 `profileId/purpose/assetScale` 分别为 `runtime_100/runtime/1`。
- `roundreel-runtime-100` 能解析所有 asset URL。
- `safe_glow` 和 `add` blendMode 在 fixture 中可被测试观测到。
- `export2` manifest 任意 JSON 文件名和新增 profile path 被测试覆盖。
- 旧 `bigwin-runtime-50` 若保留，profile-scoped URL 非回归测试继续保留。
- UI main 测试要切换一次 `roundreel-runtime-100` 并断言传给 `VNIPlayer` 的 options 正确。

### 5.4 文档和 examples 同步

必须更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/api-zh.md
packages/vnicore/examples/README.md
apps/anieditorv5viewer/README.md
```

更新内容：

- `export2` 不再等价于 `edit_full + runtime_50`，而是 manifest 驱动的多 profile bundle。
- `runtime_100` 是合法 runtime profile，仍必须有 `exportProfile` 和 manifest entry。
- JSON 文件名来自项目名，不能假设 `project.json`。
- `safe_glow` 继承图层 blendMode，但仍不是旧 render effect，不使用滤镜或模糊。
- top-level `project.particles` 仍是当前 `vnicore` 不支持项；如果未来 editor runtime 包依赖它，需要单独做 runtime 设计，不能在 viewer 中静默忽略。
- profile-scoped asset URL 映射是硬合同。
- unsupported 或 invalid data 必须 fail fast。

examples 如果写死 `bigwin-runtime-50`，需要改成通用 profile 示例，或同时说明 `runtime_100` 的 `assetScale=1` 运行包用法。

### 5.5 agents.md 同步判断

当前 `agents.md` 已经有这些规则：

- `packages/vnicore` 拥有 VNI 播放状态机、segmented 高级播放、live 粒子排空、layer group render order 和 group slot 挂接语义。
- viewer 只能做 UI 配置、输入校验、状态展示和调用。

如果本任务只是在现有边界内支持新 export2 profile 和 safe glow blendMode，原则上不需要修改 `agents.md`。

如果实现中发现需要新增长期协作规则，例如“viewer 的 export2 注册必须 manifest 驱动，不能硬编码 runtime_N/profile JSON 文件名”，则必须同步更新 `agents.md`，并在任务报告写明：

- 修改了哪条规则。
- 为什么这是长期仓库协作规则，不只是本任务实现细节。
- 是否存在 `AGENTS.md`，如果存在是否也同步更新。

## 6. 验收命令

执行前如果依赖缺失，先运行：

```bash
pnpm install
```

如下载失败，使用代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

`packages/vnicore` 必跑：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check
```

`apps/anieditorv5viewer` 必跑：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

仓库通用检查：

```bash
git diff --check
git status --short --untracked-files=all
```

如果 root 级命令因为无关历史问题失败，不能为了通过本任务改无关文件；任务报告必须写明失败命令、失败原因、与本任务的关系，并保留上述 package-local 命令作为本任务验收信号。

## 7. 浏览器验收

启动 viewer：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

如果端口占用，换一个空闲端口，并在任务报告记录实际 URL。

浏览器验收至少覆盖：

1. 打开 viewer 后，project selector 包含 `roundreel-runtime-100`。
2. 选择 `roundreel-runtime-100` 后，页面 summary 显示：
   - `schema VNI_0.020`
   - `profile runtime_100`
   - `assetScale 100%` 或等价展示
   - 动画类型包含 `safe_glow`
3. stage 非空，能够看到 `roundreel` 画面。
4. container diagnostics 包含：
   - `data-vni-project-id="roundreel-runtime-100"`
   - `data-vni-bundle-id="export2"`
   - `data-vni-profile-id="runtime_100"`
   - `data-vni-profile-purpose="runtime"`
   - `data-vni-asset-scale="1"`
5. 播放到 safe glow 时间段时，`data-vni-safe-glow-sprites` 大于 `0`。
6. 旧 `bigwin-runtime-50` 如果保留，仍能播放，且 `data-vni-asset-scale="0.5"`。
7. legacy `docs/anieditor5/export` 项目中至少抽查一个旧项目可播放，证明 manifest 化改造没有破坏旧单项目资源。
8. `3reel-multipay-01` 或其它已有多 group 项目的 group insertion UI 不回归。

浏览器验收建议使用 Playwright 或现有 browser 工具截图并读取 DOM dataset。任务报告需要写明：

- dev server URL。
- 验收的项目 id。
- 关键 diagnostics 值。
- 是否截图或人工观察到非空画面。

## 8. 完成标准

代码和资源：

- `packages/vnicore` 支持 `safe_glow` 继承图层 blendMode。
- `safe_glow` 不进入旧 render effect 统计。
- `packages/vnicore` 测试 fixture 覆盖 `VNI_0.020`、`runtime_100`、`assetScale=1` runtime profile 和任意 JSON 文件名。
- `apps/anieditorv5viewer` 不再硬编码 `edit_full/project.json` 和 `runtime_50/project.json`。
- `apps/anieditorv5viewer` 能根据 manifest 注册 `runtime_100/roundreel.json`。
- `export2` asset URL 解析保持 profile-scoped。
- 不引入隐藏 fallback；数据不完整时显式失败。

测试和文档：

- 第 6 节命令全部通过，或任务报告明确记录与本任务无关的失败。
- 第 7 节浏览器验收完成。
- `packages/vnicore/README.md`、`packages/vnicore/docs/*`、`packages/vnicore/examples/*` 和 `apps/anieditorv5viewer/README.md` 已同步新合同。
- 如果测试因旧合同失败，已修改测试而不是保留错误生产逻辑。
- `agents.md` 已按第 5.5 节判断是否需要更新，并在报告记录原因。

任务报告：

- 新增 `tasks/53-vnicore-runtime-bundle-profiles-[utctime].md`。
- 报告必须包含：
  - 实际修改文件列表。
  - export2 源数据整理方式和最终 bundle/profile 列表。
  - legacy `docs/anieditor5/export` 是否同步或仅非回归验收的结论。
  - 每个 `docs/anieditor5/src` changed file 的影响分类。
  - vnicore safe glow blendMode 语义说明。
  - viewer manifest 驱动注册说明。
  - 执行过的命令和结果。
  - 浏览器验收结果。
  - `agents.md` 是否更新及原因。
  - `git status --short --untracked-files=all` 的最终摘要。

## 9. 二次遗漏检查

提交或交付前必须再做一遍语义检查：

- `docs/anieditor5/export2/manifest.json`、viewer assets、vnicore fixtures 是否来自同一套自洽数据。
- 是否还有代码或文档写死 `runtime_50/project.json` 作为唯一 export2 runtime。
- 是否还有代码或文档写着 `safe_glow` 固定 normal blend。
- `runtime_100` 是否仍经过 manifest/profile 校验，而不是被当作 legacy full-size 项目。
- `docs/anieditor5/export` legacy 资源是否已清点，且 viewer 旧项目没有被 manifest 化改造破坏。
- top-level `project.particles` 是否仍是显式失败或已被完整实现，不能处于“数据里有但运行时忽略”的状态。
- `packages/anieditorv5runtime-cc` 是否保持未触碰；如触碰，是否按 standalone 规则完成同步。
- 同名 `asset.path` 是否仍按 profile 分开 URL。
- `roundreel-runtime-100` 是否出现在 selector、测试和 README 中。
- hidden group/layer 的 runtime/exporting 语义是否只由 editor 导出决定，viewer/vnicore 没有静默二次裁剪。
- 是否删除了 `.DS_Store`、临时截图、临时 zip、临时导出目录等不该提交的文件。
- `git status --short --untracked-files=all` 是否只剩本任务应有文件和已知其它任务文件。
- 任务报告是否按 UTC 命名并写清楚所有验收结果。
