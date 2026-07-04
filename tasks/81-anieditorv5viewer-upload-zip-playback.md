# anieditorv5viewer upload zip playback 任务计划

## 1. 任务目标

更新现有 Vite + TypeScript + Pixi.js viewer：

```text
/Users/zerro/github.com/slotclientengine/apps/anieditorv5viewer
```

把当前依赖本地内置 JSON / 图片资源的播放方式，改为用户在浏览器中上传 `.zip` 后直接播放。当前 viewer 支持的本地资源可以先全部移除，后续播放资源必须来自用户上传的 zip 文件。

本任务必须直接支持下面两种 zip 格式：

```text
docs/anieditor5/roundreel.zip
docs/anieditor5/megawin.zip
```

任务完成后必须新增中文任务报告：

```text
tasks/81-anieditorv5viewer-upload-zip-playback-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/81-anieditorv5viewer-upload-zip-playback-260704-123456.md
```

本计划是完整可执行版本，不能依赖任何别的聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、浏览器验收交接、协作规则判断和最终报告。

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务需要在浏览器端解压 zip。仓库当前没有 zip 解析依赖，优先新增轻量浏览器依赖 `fflate`：

```bash
pnpm --filter anieditorv5viewer add fflate
```

如果下载失败，使用上面的代理环境变量后重试同一命令。任务报告必须说明 `apps/anieditorv5viewer/package.json` 和 `pnpm-lock.yaml` 的变化。

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。禁止通过缺资源静默跳过、未知 zip 结构自动猜测、缺 manifest 自动扫描随机 JSON、资源路径大小写不匹配时宽松匹配、未知 profile 自动降级、或者吞掉 `@slotclientengine/vnicore` 校验错误来“跑通”。

## 3. 当前实现事实

执行时必须重新阅读当前实现，以实际代码为准。至少阅读：

```text
agents.md
apps/anieditorv5viewer/package.json
apps/anieditorv5viewer/README.md
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/tests/bundled-projects.test.ts
apps/anieditorv5viewer/tests/setup.ts
apps/anieditorv5viewer/.prettierignore
apps/anieditorv5viewer/vite.config.ts
apps/anieditorv5viewer/tsconfig.json
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/types.ts
packages/vnicore/src/pixi/vni-player.ts
```

制定本计划时观察到的现状如下，执行时需要重新确认：

- `apps/anieditorv5viewer/src/main.ts` 默认加载 `roundreel`，并通过 `bundledProjects` 下拉切换内置项目。
- `apps/anieditorv5viewer/src/config/bundled-projects.ts` 手工 import 多个内置 JSON，包括 `roundreel`、`number2`、`number3`、`bigwin`、`megawin`、`superwin`、`game003-l1-wins` 到 `game003-l5-wins` 等。
- `apps/anieditorv5viewer/src/runtime/asset-manifest.ts` 使用 `import.meta.glob("../assets/assets/*")` 和 `import.meta.glob("../../../../assets/game003-s1/assets/*")` 建立 Vite 本地资源 URL manifest。
- `apps/anieditorv5viewer/src/assets/**` 当前存放内置 JSON 和图片资源。
- `apps/anieditorv5viewer/tests/bundled-projects.test.ts` 当前验证内置项目列表、sourcePath 对齐和本地资源 URL 解析。
- `apps/anieditorv5viewer/tests/bundled-projects.test.ts` 当前还断言 `.prettierignore` 包含 `src/assets`、`vite.config.ts` coverage exclude 包含 `src/assets/**`、`tsconfig.json` include 包含 `src/**/*.json`。移除内置资源后，这些旧断言必须一起更新，不能留下“仍需要内置资源目录”的测试合同。
- `apps/anieditorv5viewer/tests/main.test.ts` 当前假设启动后已经有默认项目和项目 select。
- `apps/anieditorv5viewer/tests/setup.ts` 当前只做 `vi.restoreAllMocks()`，没有为 Blob URL 生命周期提供稳定 mock。新增上传 zip 测试时需要显式 mock / spy `URL.createObjectURL` 和 `URL.revokeObjectURL`，并在每个用例后清理。
- `apps/anieditorv5viewer/.prettierignore` 当前包含 `src/assets`，这是为大量内置资源避免格式化而存在；移除内置资源后必须重新判断是否删除该 ignore。
- `apps/anieditorv5viewer/vite.config.ts` 当前 coverage exclude 包含 `src/assets/**`，移除内置资源后必须重新判断是否删除该 exclude，确保新增 zip 解析模块被正常纳入 coverage。
- `apps/anieditorv5viewer/tsconfig.json` 当前 include 包含 `src/**/*.json`，移除内置 JSON import 后必须重新判断是否仍需要该 include。
- `@slotclientengine/vnicore` 已经拥有 VNI/V5G 校验、profile 校验、Pixi 播放、texture 尺寸校验、segmented playback、文字层替换、组间插入等 runtime 行为；viewer 只应做上传、zip 解析、UI 组装、Blob URL 生命周期和调用 public API。

当前要移除的“本地资源”指 viewer 自己为了播放而复制/注册的本地动画资源，包括：

```text
apps/anieditorv5viewer/src/assets/project.json
apps/anieditorv5viewer/src/assets/projects/*.json
apps/anieditorv5viewer/src/assets/assets/*
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts 中面向内置资源的 import.meta.glob
```

不要删除 `docs/anieditor5/roundreel.zip`、`docs/anieditor5/megawin.zip` 或 `assets/game003-s1/**` 源资源；它们不是 viewer 的内置拷贝。

## 4. 输入 zip 合同

### 4.1 `roundreel.zip`：编辑器完整导出包

当前样例结构：

```text
docs/anieditor5/roundreel.zip
manifest.json
edit_full/roundreel.json
edit_full/assets/*
runtime_100/roundreel.json
runtime_100/assets/*
```

`manifest.json` 当前摘要：

```json
{
  "type": "vni_export_bundle",
  "version": "VNI_0.042",
  "exports": [
    {
      "id": "edit_full",
      "purpose": "editing",
      "assetScale": 1,
      "path": "edit_full/roundreel.json",
      "label": "100% 完整编辑备份"
    },
    {
      "id": "runtime_100",
      "purpose": "runtime",
      "assetScale": 1,
      "path": "runtime_100/roundreel.json",
      "label": "100% 运行发布包"
    }
  ]
}
```

必须用 `@slotclientengine/vnicore/core` 的 `assertVNIBundleManifest` / `validateVNIBundleManifest` / `validateManifestProjectProfile` 处理 manifest 和 profile 一致性。profile 身份来自 manifest entry 与项目 JSON 的 `exportProfile`，不能从目录名推导；目录名只能用于定位 zip 内文件。

资源解析规则：

- manifest entry 的 `path` 指向项目 JSON，例如 `runtime_100/roundreel.json`。
- 项目内 `asset.path` 仍是 profile 内相对路径，例如 `assets/cut_asset_image_mqtaq85j_8.png`。
- 真实 zip entry 应解析为 `dirname(entry.path) + "/" + asset.path`，例如 `runtime_100/assets/cut_asset_image_mqtaq85j_8.png`。
- `edit_full` 和 `runtime_100` 可共享相同 `asset.path`，asset URL manifest 必须按当前 profile 独立生成，不能使用全局 `asset.path -> url` 缓存。
- 默认加载规则：如果 manifest 中恰好存在一个 `purpose === "runtime"` 的 export，上传后自动加载该 profile；仍要提供 profile select 允许用户切换到 `edit_full`。如果没有唯一 runtime profile，则不自动猜测，要求用户通过 profile select 明确选择。

### 4.2 `megawin.zip`：运行播放 zip 包

当前样例结构：

```text
docs/anieditor5/megawin.zip
project.json
assets/*
__MACOSX/*
```

`project.json` 当前关键事实：

- `name = "megawin"`
- `schemaVersion = "VNI_0.003"`
- `editor.name = "victory_editor_v5_g"`
- `stage.duration = 5`
- `exportProfile.id = "runtime_50"`
- `exportProfile.purpose = "runtime"`
- `exportProfile.assetScale = 0.5`
- asset 使用 `fileWidth` / `fileHeight` / `fileScale = 0.5`

资源解析规则：

- 没有 `manifest.json` 时，只支持 zip 根目录存在唯一 `project.json` 的单项目包。
- 项目内 `asset.path` 相对 zip 根目录解析，例如 `assets/effect2_asset_image_mq6j09f0_k.png`。
- `__MACOSX/**`、`.DS_Store`、`._*` 只作为 macOS zip 元数据忽略，不参与项目发现和资源匹配。
- 单项目包的 `profileId`、`profilePurpose`、`assetScale` 必须来自 `project.exportProfile`。本任务的上传播放路径不为缺失 `exportProfile` 的单项目包发明 `legacy_full` 或其它隐式 profile；如果缺失，必须显式报错，直到有明确需求和测试再扩展。
- 如果根目录没有 `project.json`，或者存在多个非 manifest 项目 JSON，必须显式报错。

## 5. zip 安全和失败边界

新增 zip 解析必须集中在纯 TypeScript 模块中，避免把规则散落在 DOM 事件里。建议新增：

```text
apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts
apps/anieditorv5viewer/tests/uploaded-zip-project.test.ts
```

建议导出模型：

```ts
export interface UploadedVNIProjectProfile {
  id: string;
  label: string;
  purpose: "editing" | "runtime" | "legacy";
  assetScale: number;
  projectPath: string;
}

export interface LoadedUploadedVNIProject {
  projectId: string;
  bundleId: string;
  profileId: string;
  profilePurpose: "editing" | "runtime" | "legacy";
  assetScale: number;
  sourcePath: string;
  project: VNIProjectConfig;
  assetUrls: AssetUrlManifest;
  insertionAssets: readonly UploadedInsertionAsset[];
  dispose: () => void;
}
```

必须实现以下边界：

- `bundleId` 使用上传 zip 文件名派生的稳定值，例如 `uploaded:roundreel` / `uploaded:megawin`；派生时只做显示和诊断用的安全化，不参与 profile 判断。
- `projectId` 使用项目 JSON 的 `project.name`；如果为空或不是字符串，由 `assertVNIProject` / `validateVNIProject` 显式失败。
- manifest 包的 `profileId`、`profilePurpose`、`assetScale` 只来自 manifest entry，并用 `validateManifestProjectProfile(...)` 与项目 JSON 的 `exportProfile` 对齐。
- 单项目包的 `profileId`、`profilePurpose`、`assetScale` 只来自项目 JSON 的 `exportProfile`；本任务不支持给上传单项目包自动补 legacy profile。
- zip entry path 必须使用 POSIX 风格 `/`，拒绝绝对路径、空路径、`.`、`..`、反斜杠、重复 normalized path。
- JSON 使用 `TextDecoder("utf-8", { fatal: true })` 解码；JSON parse 失败直接报错。
- 只允许项目 JSON 引用 zip 内存在的资源；缺任何一个 `asset.path` 都报错。
- 资源匹配大小写敏感，不做宽松匹配。
- 只为当前选中 profile 的项目资源创建 `URL.createObjectURL`。
- zip 目录 entry 只能用于结构识别，不能作为资源；所有项目引用的资源必须是文件 entry。
- 只支持浏览器可播放图片资源扩展：`.png`、`.jpg`、`.jpeg`、`.webp`。发现其它 image asset 扩展先显式报错，除非同时扩展测试和文档。
- `Blob` MIME 根据扩展设置：`image/png`、`image/jpeg`、`image/webp`。
- 每次加载新 zip、切换 profile、加载失败或销毁 player 时，必须 `URL.revokeObjectURL` 清理旧 profile 的所有 Blob URL。
- 不能把 zip 内容写入 repo，也不能把上传文件持久化到 localStorage / IndexedDB。
- `@slotclientengine/vnicore` 的 `assertVNIProject`、`validateVNIProject`、`resolveProjectAssetUrls`、texture-size 校验错误必须原样暴露到 UI 错误区域，不允许被替换成“播放失败”这种无诊断信息。

## 6. 实施步骤

### 6.1 新增 zip 解析依赖

执行：

```bash
pnpm --filter anieditorv5viewer add fflate
```

如果依赖下载失败，使用第 2 节代理后重试。新增依赖后确认：

```bash
git diff -- apps/anieditorv5viewer/package.json pnpm-lock.yaml
```

`fflate` 必须放在 `apps/anieditorv5viewer` 的 `dependencies`，因为浏览器运行时代码需要它。

### 6.2 建立上传 zip 领域模块

新增 `apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts`，职责只包含：

- 接收 `File` / `Blob` / `ArrayBuffer`，用 `fflate` 解压为 zip entry map。
- 过滤 macOS 元数据 entry。
- 校验并规范化 zip entry path。
- 判断 zip 格式：
  - 根目录 `manifest.json`：按 bundle manifest 格式处理。
  - 根目录 `project.json`：按单项目包处理。
  - 其它结构：报错。
- 对 manifest 包列出 profile，并按规则选择默认 profile。
- 按选中 profile 读取项目 JSON、调用 vnicore 校验、校验 manifest 与项目 `exportProfile` 一致性。
- 为项目 `asset.path` 生成 profile-scoped Blob URL manifest。
- 生成用于组间插入和文字层图片替换的 asset 列表；该列表只来自当前 profile zip 内资源，不再来自 viewer 内置全局资源池。
- 返回 `dispose()`，统一释放本次创建的 Blob URL。

不要在这个模块中创建 Pixi `Application`、DOM 节点或 `VNIPlayer`。

### 6.3 改造 viewer 启动和加载流程

更新 `apps/anieditorv5viewer/src/main.ts`：

- 移除 `bundledProjects` / `getBundledProject` import。
- 启动后不再自动加载默认项目，不创建 `VNIPlayer`，直到用户上传 zip。
- 增加 `.zip` 文件上传入口：

```text
<input type="file" accept=".zip,application/zip,application/x-zip-compressed">
```

- 上传成功后：
  - 解析 zip。
  - 如果存在唯一默认 runtime profile，直接加载。
  - 如果需要用户选择 profile，更新 profile select，但不猜测播放。
  - 创建 Pixi `Application` 和 `VNIPlayer`，传入上传项目的 `project`、`assetUrls`、`bundleId`、`profileId`、`profilePurpose`、`assetScale`。
- 上传失败后：
  - 销毁旧 player 和旧 Pixi app。
  - 释放旧 Blob URL。
  - 在 UI 错误区域显示完整错误 message。
  - 不保留半初始化 player。
- 重复上传、profile 切换、页面销毁时，必须复用现有清理路径：销毁 player、清空插入节点、清空文字层替换、销毁 Pixi app、释放 Blob URL。

保留现有能力：

- Play / Pause / Restart / Loop / seek。
- segmented advanced playback。
- canvas zoom 使用 renderer resize 和 `setViewportSize(...)`。
- group insertion 继续走 `VNIPlayer.attachImageBetweenLayerGroups(...)` / `attachExternalImageBetweenLayerGroups(...)` public API。
- text layer replacement 继续走 `VNIPlayer.attachTextToTextLayer(...)` / `attachImageToTextLayer(...)` public API。

### 6.4 改造 controls UI

更新 `apps/anieditorv5viewer/src/ui/controls.ts`：

- 移除启动时必须存在 `projects` 和 `selectedProjectId` 的假设。
- 将项目 select 改为上传文件 + 当前 zip/profile 信息：
  - file input：选择 zip。
  - profile select：仅当 manifest 包有多个 profile 时启用。
  - summary：显示 zip 文件名、项目名、sourcePath、schema、profile、purpose、assetScale、layers、assets、duration、动画类型。
- 没有加载项目时，播放、timeline、advanced、group insertion、text replacement 控件应禁用。
- 错误区域必须显示上传/解析/校验错误，不吞掉具体错误信息。
- profile 切换必须调用主流程重新加载所选 profile，而不是只改 summary。

注意：UI 文案可以保持中文，重点是功能入口明确；不要添加与播放无关的说明页或营销式落地页。

### 6.5 移除 viewer 内置资源

完成 zip 上传能力和测试后，移除 viewer 本地资源注册：

```text
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts 中内置资源 glob
apps/anieditorv5viewer/src/assets/project.json
apps/anieditorv5viewer/src/assets/projects/*.json
apps/anieditorv5viewer/src/assets/assets/*
```

如果删除后保留空目录，必须放 `.keepme`；如果目录整体不再需要，可以删除目录本身。不得删除 `docs/anieditor5/*.zip` 样例。

同时更新：

```text
apps/anieditorv5viewer/README.md
apps/anieditorv5viewer/tests/bundled-projects.test.ts
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/tests/setup.ts
apps/anieditorv5viewer/.prettierignore
apps/anieditorv5viewer/vite.config.ts
apps/anieditorv5viewer/tsconfig.json
```

`tests/bundled-projects.test.ts` 应删除或重命名为上传 zip 合同测试。不要保留“完整内置项目列表必须存在”的旧预期。

`.prettierignore`、`vite.config.ts`、`tsconfig.json` 必须按最终文件树同步清理：

- 如果 `src/assets` 已不存在或只剩 `.keepme`，删除 `.prettierignore` 中的 `src/assets`。
- 如果不再有内置资源目录，删除 `vite.config.ts` coverage exclude 中的 `src/assets/**`，不要让新增 zip 解析模块被误排除。
- 如果不再从 `src/**/*.json` import JSON，删除或收紧 `tsconfig.json` 中的 `src/**/*.json` include；如果仍保留某个 JSON import，必须在 README 和测试中说明原因。
- 如果 `index.html`、README 或测试文案还写着 project selector / bundled projects / V5G project 下拉，必须同步改成上传 zip / profile select。

### 6.6 README 和协作规则

更新 `apps/anieditorv5viewer/README.md`：

- 说明 viewer 现在通过用户上传 zip 播放，不再打包内置动画资源。
- 写清支持的两种格式：
  - `manifest.json` + profile 目录。
  - 根目录 `project.json` + `assets/`。
- 写清 profile 选择、资源路径、Blob URL 生命周期和 fail-fast 边界。
- 更新 commands。

检查 `agents.md` 是否需要同步。若本任务只是改 viewer 上传 zip 工作流，通常不需要更新 `agents.md`；若执行中新增了仓库协作规则、目录规范、基础脚本或长期约束，必须同步更新 `agents.md`，并在任务报告中说明。

## 7. 测试计划

### 7.1 zip 解析合同测试

新增或更新测试文件：

```text
apps/anieditorv5viewer/tests/uploaded-zip-project.test.ts
```

必须覆盖：

- 读取真实 `docs/anieditor5/roundreel.zip`，识别 `edit_full` 和 `runtime_100` 两个 profile。
- `roundreel.zip` 默认选择唯一 runtime profile `runtime_100`。
- `roundreel.zip` 加载 `runtime_100` 后：
  - `project.name === "roundreel"`。
  - `schemaVersion === "VNI_0.042"`。
  - `profileId === "runtime_100"`。
  - `assetScale === 1`。
  - asset URL keys 与 `project.assets[].path` 完全一致。
  - zip entry 实际来自 `runtime_100/assets/*`。
- `roundreel.zip` 切换到 `edit_full` 后，asset URL 仍按 `edit_full/assets/*` profile-scoped 解析。
- 读取真实 `docs/anieditor5/megawin.zip`，忽略 `__MACOSX/**`、`.DS_Store`、`._*`。
- `megawin.zip` 加载后：
  - `project.name === "megawin"`。
  - `profileId === "runtime_50"`。
  - `profilePurpose === "runtime"`。
  - `assetScale === 0.5`。
  - `bundleId === "uploaded:megawin"` 或实现中定义的等价安全化上传 bundle id，并在 README 中说明。
  - `assetUrls` 覆盖所有 `project.assets[].path`。
- 单项目包缺失 `project.exportProfile` 时显式失败，不自动补 `legacy_full`。
- 缺 `manifest.json` 且缺根 `project.json` 时显式失败。
- 缺任意引用资源时显式失败。
- zip entry 包含 `../`、绝对路径、反斜杠或重复 normalized path 时显式失败。
- 多个非 manifest 项目 JSON 时显式失败。
- 多个 runtime profile 且用户未选择时不自动猜测。
- `dispose()` 会对已创建的所有 Blob URL 调用 `URL.revokeObjectURL`。
- 测试环境必须在 `apps/anieditorv5viewer/tests/setup.ts` 或用例内 mock `URL.createObjectURL` / `URL.revokeObjectURL`，断言创建次数、释放次数和失败路径释放，不依赖 Node/happy-dom 的默认实现差异。

### 7.2 main / UI 测试

更新 `apps/anieditorv5viewer/tests/main.test.ts`：

- 启动后没有默认 `VNIPlayer`，播放控件禁用。
- 上传 `megawin.zip` 后创建一个 `VNIPlayer`，参数包含：

```text
projectId: "megawin"
profileId: "runtime_50"
profilePurpose: "runtime"
assetScale: 0.5
```

- 上传 `roundreel.zip` 后默认创建 `runtime_100` player，profile select 可切换 `edit_full`。
- 重复上传会销毁旧 player、旧 Pixi app，并释放旧 Blob URL。
- 解析失败时展示错误，不创建新 player。
- Play / seek / segmented / zoom / group insertion / text replacement 仍调用 `VNIPlayer` public API。

### 7.3 删除旧内置资源测试

新增一个 cheap contract 检查，防止旧本地资源悄悄回流。可以用 Vitest 或脚本测试覆盖：

```text
apps/anieditorv5viewer/src/config/bundled-projects.ts 不存在
apps/anieditorv5viewer/src/assets/projects 不存在
apps/anieditorv5viewer/src/assets/assets 不存在
apps/anieditorv5viewer/src/runtime/asset-manifest.ts 不再 import.meta.glob viewer 内置动画资源
apps/anieditorv5viewer/.prettierignore 不再忽略不存在的 src/assets
apps/anieditorv5viewer/vite.config.ts coverage exclude 不再排除不存在的 src/assets/**
```

如果保留 `src/assets/.keepme`，测试要允许 `.keepme`，但不得允许 JSON / PNG / JPG 动画资源回流。

## 8. 验收命令

执行顺序：

```bash
git status --short --untracked-files=all
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
git diff --check
```

如果改动触及 `packages/vnicore`，还必须执行：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
```

如果改动触及 `agents.md`、根脚本、workspace 配置或跨包约束，追加执行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

如果 `pnpm --filter ...` 或 `pnpm exec ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter anieditorv5viewer test
```

如果是依赖下载问题，按第 2 节代理重试，不要因此改弱生产逻辑。

## 9. 浏览器验收

本地启动：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

浏览器验收至少覆盖：

- 打开 `http://127.0.0.1:5175/` 后没有默认内置项目自动播放。
- 上传 `docs/anieditor5/megawin.zip` 后能播放 megawin 动画。
- 上传 `docs/anieditor5/roundreel.zip` 后默认播放 `runtime_100`。
- `roundreel.zip` profile select 能切换到 `edit_full` 并播放。
- 反复上传 `megawin.zip` / `roundreel.zip` 后没有旧画面残留，控制台没有 Blob URL 或 Pixi 销毁相关错误。
- seek、restart、loop、segmented start/end、canvas zoom 仍可用。
- 对有合法 layer group slot 的上传项目，组间插入仍走 public API；没有合法 slot 时按钮禁用并显示无合法 slot。
- 对有 text layer 的上传项目，文字层替换仍走 public API；没有 text layer 时按钮禁用。
- 上传非法 zip 时显示明确错误，并且旧 player 不继续播放。

如果当前执行者不能完成真实浏览器验收，任务报告必须明确写成“浏览器验收待手工确认”，不能把未执行的浏览器结果写成已完成。

## 10. 任务报告要求

完成后新增：

```text
tasks/81-anieditorv5viewer-upload-zip-playback-[utctime].md
```

报告必须包含：

- 改动摘要。
- 最终支持的 zip 格式说明。
- 新增/删除/重命名的关键文件列表。
- 是否新增依赖，`pnpm-lock.yaml` 是否变化。
- 是否更新 `agents.md`，如果没有更新，说明“不涉及仓库协作规则变化”。
- 验收命令、结果、失败重试记录。
- 浏览器验收结果；如果由用户验收，必须明确列出待验收项。
- 已知限制和非目标。

## 11. 二次遗漏检查

交付前必须做一次真实的遗漏检查，并把结果写入任务报告：

- `git status --short --untracked-files=all`：确认没有遗漏新测试、删除资源或报告文件。
- `rg -n "bundledProjects|getBundledProject|DEFAULT_PROJECT_ID|import.meta.glob\\(\\\"../assets/assets|game003S1AssetUrlManifest|docs/anieditor5/export/|project selector|bundled projects|V5G project" apps/anieditorv5viewer`：确认旧内置资源路径和旧 UI 概念不再驱动运行时。README 中作为历史说明出现时必须明确是已移除，不可误导为现行机制。
- `find apps/anieditorv5viewer/src/assets -maxdepth 3 -type f | sort`：若目录存在，只允许 `.keepme` 或非动画运行资源。
- `rg -n "src/assets|src/\\*\\*/\\*.json" apps/anieditorv5viewer/.prettierignore apps/anieditorv5viewer/vite.config.ts apps/anieditorv5viewer/tsconfig.json apps/anieditorv5viewer/tests`：确认工具链配置和测试没有保留旧内置资源假设；如仍保留，必须有明确理由。
- `rg -n "roundreel|megawin|runtime_100|runtime_50|manifest.json|project.json" apps/anieditorv5viewer/tests apps/anieditorv5viewer/README.md`：确认两个 zip 样例和两种格式都有测试/文档覆盖。
- `rg -n "TODO|FIXME|fallback|silent|placeholder" apps/anieditorv5viewer/src apps/anieditorv5viewer/tests`：确认没有把核心逻辑留成 TODO 或隐藏兜底。
- 确认 `docs/anieditor5/roundreel.zip`、`docs/anieditor5/megawin.zip` 没被修改。
- 确认没有把上传 zip 解压产物写入仓库。

只有上述实现、测试、命令、报告和遗漏检查都完成后，任务才算完成。
