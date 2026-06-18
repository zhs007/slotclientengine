# anieditorv5viewer scaled assets 任务计划

## 1. 任务目标

更新现有 Vite + TypeScript + Pixi.js viewer：

```text
apps/anieditorv5viewer
```

让它支持 `docs/anieditor5/export2` 最新导出的多资源档位动画播放：

- `edit_full`：原始图片，供编辑/100% 质量播放使用。
- `runtime_50`：缩小到约 50% 的图片，供运行发布播放使用。

同时继续支持任务 29、31 已完成的旧导出：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/bigwin.json
docs/anieditor5/export/megawin.json
docs/anieditor5/export/superwin.json
```

旧导出没有 `fileWidth`、`fileHeight`、`fileScale`、`exportProfile` 和 bundle `manifest.json`，viewer 必须把这些旧动画明确视为原始图片播放，即默认：

```text
fileWidth = width
fileHeight = height
fileScale = 1
```

新编辑器在导出 100% 资源时也可能生成没有 bundle `manifest.json`、没有 `exportProfile` 的单文件 VNI 项目；这种 VNI 单文件 100% 导出同样应按原图 profile 处理，不允许因为缺少 `exportProfile` 而拒绝播放。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成差异确认、资源同步、viewer 更新、测试、浏览器验收和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/33-anieditorv5viewer-scaled-assets-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/33-anieditorv5viewer-scaled-assets-260617-123456.md
```

## 2. 仓库和环境事实

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 新增空目录必须放 `.keepme`
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖；如果确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告里记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，再使用上面的代理环境变量重试。

当前根协作规则文件同时存在：

```text
AGENTS.md
agents.md
```

如果本任务只更新 `apps/anieditorv5viewer`、任务文件、README 和内置资源，通常不需要同步更新协作规则。如果任务执行中新增或改变仓库协作规则、目录规范、基础脚本或通用执行约定，必须同时更新 `AGENTS.md` 和 `agents.md`，并在任务报告中说明原因。

## 3. 当前输入状态

执行前先确认工作区，不要回滚用户已有改动：

```bash
git status --short
git diff -- docs/anieditor5/src/constants.ts docs/anieditor5/src/export_project.ts docs/anieditor5/src/main.ts docs/anieditor5/src/pixi_stage.ts docs/anieditor5/src/project_state.ts docs/anieditor5/src/types.ts
find docs/anieditor5/export2 -maxdepth 3 -type f | sort
```

当前已观察到的输入状态：

```text
M docs/anieditor5/src/constants.ts
M docs/anieditor5/src/export_project.ts
M docs/anieditor5/src/main.ts
M docs/anieditor5/src/pixi_stage.ts
M docs/anieditor5/src/project_state.ts
M docs/anieditor5/src/types.ts
?? docs/anieditor5/export2/
```

关键源码变化：

- `docs/anieditor5/src/constants.ts` 从 `V5G_VERSION` 迁移到 `VNI_VERSION`，当前代码里 `VNI_VERSION = "VNI_0.003"`。
- `docs/anieditor5/src/export_project.ts` 新增 bundle 导出：
  - 根目录 `manifest.json`
  - `edit_full/project.json`
  - `runtime_50/project.json`
  - 每个 profile 自己的 `assets/*`
- `docs/anieditor5/src/types.ts` 新增：
  - `V5GAssetConfig.fileWidth`
  - `V5GAssetConfig.fileHeight`
  - `V5GAssetConfig.fileScale`
  - `V5GExportProfileConfig`
  - `V5GBundleManifest`
  - `V5GBundleManifestEntry`
- `docs/anieditor5/src/pixi_stage.ts` 新增缩小资源的显示补偿：用逻辑尺寸除以实际贴图尺寸，让 50% 图片仍按原始设计尺寸显示。
- `docs/anieditor5/src/main.ts` 新增导出资源缩放选择 `select-export-asset-scale`，但执行时仍需确认 HTML/UI 是否完整；本任务不要顺手修编辑器 UI，除非它直接阻塞 viewer 验收。

`docs/anieditor5/export2` 当前结构：

```text
docs/anieditor5/export2/manifest.json
docs/anieditor5/export2/edit_full/project.json
docs/anieditor5/export2/edit_full/assets/*.png
docs/anieditor5/export2/runtime_50/project.json
docs/anieditor5/export2/runtime_50/assets/*.png
```

注意：`docs/anieditor5/export2/.DS_Store` 不应复制进 viewer。

## 4. export2 数据合同

`docs/anieditor5/export2/manifest.json` 当前摘要：

```json
{
  "type": "vni_export_bundle",
  "version": "VNI_0.002",
  "exports": [
    {
      "id": "edit_full",
      "purpose": "editing",
      "assetScale": 1,
      "path": "edit_full/project.json",
      "label": "100% 原图编辑备份"
    },
    {
      "id": "runtime_50",
      "purpose": "runtime",
      "assetScale": 0.5,
      "path": "runtime_50/project.json",
      "label": "50% 运行发布包"
    }
  ]
}
```

`edit_full/project.json` 和 `runtime_50/project.json` 当前共同事实：

| 字段 | 值 |
| --- | --- |
| `schemaVersion` | `VNI_0.002` |
| `editor.name` | `victory_editor_v5_g` |
| `editor.version` | `VNI_0.002` |
| `engineTarget.name` | `cocos_creator` |
| `engineTarget.version` | `3.8.6` |
| `name` | `bigwin` |
| `stage.width` | `2000` |
| `stage.height` | `2000` |
| `stage.coordinate` | `center` |
| `stage.duration` | `5` |
| `stage.backgroundColor` | `#0a0a0a` |
| 图层数 | `9` |
| 资源数 | `9` |
| 动画类型 | `fade`, `particle_twinkle`, `particles`, `pulse`, `rotate`, `scale_up`, `shake`, `slide_in` |

`edit_full` 与 `runtime_50` 的关键区别：

| asset.path | 逻辑尺寸 | edit_full 文件尺寸 | runtime_50 文件尺寸 |
| --- | --- | --- | --- |
| `assets/bigwin_asset_image_mqgf7e6h_g.png` | `730x735` | `730x735 @ 1` | `365x368 @ 0.5` |
| `assets/image_asset_image_mqgg2jz6_a.png` | `295x212` | `295x212 @ 1` | `148x106 @ 0.5` |
| `assets/effect3_asset_image_mqgihw37_p.png` | `320x277` | `320x277 @ 1` | `160x139 @ 0.5` |
| `assets/big_asset_image_mqgir7t1_u.png` | `482x257` | `482x257 @ 1` | `241x129 @ 0.5` |
| `assets/bigwin_asset_image_mqgix37g_13.png` | `438x207` | `438x207 @ 1` | `219x104 @ 0.5` |
| `assets/2_asset_image_mqgl9o49_3.png` | `50x50` | `50x50 @ 1` | `25x25 @ 0.5` |
| `assets/image_asset_image_mqgmcogx_3.png` | `241x161` | `241x161 @ 1` | `121x81 @ 0.5` |
| `assets/2_asset_image_mqgmd9ai_4.png` | `455x320` | `455x320 @ 1` | `228x160 @ 0.5` |
| `assets/2_asset_image_mqgmdln6_5.png` | `455x320` | `455x320 @ 1` | `228x160 @ 0.5` |

验收时不要用 `width * fileScale` 的浮点结果直接判定贴图尺寸；应优先使用 JSON 中的 `fileWidth` / `fileHeight` 与真实 PNG 尺寸、Pixi texture 尺寸比对。`fileScale` 用于表达 profile 缩放比例和 UI/诊断展示。

## 5. 需要参考的现有实现

viewer 当前关键文件：

```text
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/v5g/types.ts
apps/anieditorv5viewer/src/runtime/animation-sampler.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/src/runtime/blend-mode.ts
apps/anieditorv5viewer/src/runtime/coordinates.ts
apps/anieditorv5viewer/src/runtime/layer-instance.ts
apps/anieditorv5viewer/src/runtime/particle-sampler.ts
apps/anieditorv5viewer/src/runtime/project-sampler.ts
apps/anieditorv5viewer/src/runtime/v5g-player.ts
apps/anieditorv5viewer/src/runtime/validation.ts
apps/anieditorv5viewer/src/styles.css
apps/anieditorv5viewer/tests/runtime/*.test.ts
apps/anieditorv5viewer/README.md
```

editor 当前关键参考文件：

```text
docs/anieditor5/src/types.ts
docs/anieditor5/src/export_project.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/constants.ts
```

不要从 `docs/anieditor5/src/**` runtime import 代码到 viewer。viewer 应保持独立、可构建、可测试；可以参考并移植必要逻辑。

任务 31 中“`PIXI.Texture.width/height` 必须与 JSON `asset.width/height` 一致”的旧验收条款已不再适用于 `runtime_50`。本任务要把合同升级为：

```text
asset.width / asset.height = 原始设计逻辑尺寸
asset.fileWidth / asset.fileHeight = 当前 profile 实际文件像素尺寸
PIXI.Texture.width / PIXI.Texture.height = 当前 profile 实际文件像素尺寸
显示尺寸 = 原始设计逻辑尺寸
```

## 6. 范围边界

本任务要做：

- 更新 `apps/anieditorv5viewer` 的 VNI/V5G 类型、校验、资源 manifest、内置项目配置、渲染尺寸补偿、UI 摘要、诊断、测试和 README。
- 保留旧 4 个 `docs/anieditor5/export` 项目播放能力。
- 新增 `docs/anieditor5/export2` 的 `edit_full` 与 `runtime_50` 两个 profile 播放能力。
- 在 UI 中可以选择并播放：
  - 旧 `project`
  - 旧 `bigwin`
  - 旧 `megawin`
  - 旧 `superwin`
  - 新 `bigwin / edit_full / 100%`
  - 新 `bigwin / runtime_50 / 50%`
- 对旧动画缺失资源缩放字段的情况，明确按原图 profile 处理。
- 对缩小资源加载时，保持动画的设计尺寸、位置、锚点、缩放、粒子效果和混合模式语义。
- 缺失资源、未知 schema/editor、未知动画、未知 easing、未知 blend mode、非法 JSON 结构、贴图尺寸不匹配必须显式失败。
- 如果测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑。
- 不做不必要的兜底；有些逻辑 bug 越早暴露越好。

本任务不要做：

- 不要修改 `docs/anieditor5/src/**`，除非发现明确的编辑器 bug 阻塞本任务；如果修改，必须在报告中说明原因和影响。
- 不要在 viewer 运行时动态缩放或重新生成图片文件；viewer 只消费已经导出的资源。
- 不要把 `runtime_50` 缩小图静默替换为 `edit_full` 原图。
- 不要把 `edit_full` 和 `runtime_50` 的同名 `asset.path` 放进同一个全局 manifest，导致后者覆盖前者。
- 不要删除任务 29、31 已支持的旧项目选择和粒子动画播放能力。
- 不要新增 Cocos Creator app。
- 不要把 `packages/anieditorv5runtime-cc` 改成依赖 viewer 内部代码。
- 不要为了测试通过在生产逻辑里写特殊分支；测试预期错误就改测试。

## 7. 资源同步方案

保留旧导出资源路径，新增 export2 profile 路径。目标结构建议如下：

```text
apps/anieditorv5viewer/src/assets/project.json
apps/anieditorv5viewer/src/assets/projects/bigwin.json
apps/anieditorv5viewer/src/assets/projects/megawin.json
apps/anieditorv5viewer/src/assets/projects/superwin.json
apps/anieditorv5viewer/src/assets/assets/*

apps/anieditorv5viewer/src/assets/export2/manifest.json
apps/anieditorv5viewer/src/assets/export2/edit_full/project.json
apps/anieditorv5viewer/src/assets/export2/edit_full/assets/*
apps/anieditorv5viewer/src/assets/export2/runtime_50/project.json
apps/anieditorv5viewer/src/assets/export2/runtime_50/assets/*
```

复制命令：

```bash
mkdir -p apps/anieditorv5viewer/src/assets/projects
mkdir -p apps/anieditorv5viewer/src/assets/export2/edit_full/assets
mkdir -p apps/anieditorv5viewer/src/assets/export2/runtime_50/assets

cp docs/anieditor5/export/project.json apps/anieditorv5viewer/src/assets/project.json
cp docs/anieditor5/export/bigwin.json apps/anieditorv5viewer/src/assets/projects/bigwin.json
cp docs/anieditor5/export/megawin.json apps/anieditorv5viewer/src/assets/projects/megawin.json
cp docs/anieditor5/export/superwin.json apps/anieditorv5viewer/src/assets/projects/superwin.json
rsync -a --delete --exclude '.DS_Store' docs/anieditor5/export/assets/ apps/anieditorv5viewer/src/assets/assets/

cp docs/anieditor5/export2/manifest.json apps/anieditorv5viewer/src/assets/export2/manifest.json
cp docs/anieditor5/export2/edit_full/project.json apps/anieditorv5viewer/src/assets/export2/edit_full/project.json
cp docs/anieditor5/export2/runtime_50/project.json apps/anieditorv5viewer/src/assets/export2/runtime_50/project.json
rsync -a --delete --exclude '.DS_Store' docs/anieditor5/export2/edit_full/assets/ apps/anieditorv5viewer/src/assets/export2/edit_full/assets/
rsync -a --delete --exclude '.DS_Store' docs/anieditor5/export2/runtime_50/assets/ apps/anieditorv5viewer/src/assets/export2/runtime_50/assets/
```

资源同步验收命令：

```bash
find apps/anieditorv5viewer/src/assets -maxdepth 5 -type f | sort
find apps/anieditorv5viewer/src/assets -name '.DS_Store' -print
```

第二条命令必须无输出。

用 Node 校验所有 JSON 引用的资源都存在：

```bash
node -e "const fs=require('fs'); const entries=[['apps/anieditorv5viewer/src/assets/project.json','apps/anieditorv5viewer/src/assets'],['apps/anieditorv5viewer/src/assets/projects/bigwin.json','apps/anieditorv5viewer/src/assets'],['apps/anieditorv5viewer/src/assets/projects/megawin.json','apps/anieditorv5viewer/src/assets'],['apps/anieditorv5viewer/src/assets/projects/superwin.json','apps/anieditorv5viewer/src/assets'],['apps/anieditorv5viewer/src/assets/export2/edit_full/project.json','apps/anieditorv5viewer/src/assets/export2/edit_full'],['apps/anieditorv5viewer/src/assets/export2/runtime_50/project.json','apps/anieditorv5viewer/src/assets/export2/runtime_50']]; for (const [file,base] of entries) { const json=JSON.parse(fs.readFileSync(file,'utf8')); for (const asset of json.assets) { const path=base+'/'+asset.path; if (!fs.existsSync(path)) throw new Error(file+' missing '+asset.path); } } console.log('all bundled assets exist');"
```

用 `file` 校验 export2 图片像素尺寸：

```bash
file docs/anieditor5/export2/edit_full/assets/*.png docs/anieditor5/export2/runtime_50/assets/*.png
```

报告中必须记录：

- 旧 `docs/anieditor5/export` 仍有 4 个项目。
- 新 `docs/anieditor5/export2` 有 1 个 bundle manifest 和 2 个 profile。
- `edit_full` 和 `runtime_50` 均有 9 个 asset。
- `runtime_50` 的真实 PNG 尺寸与 JSON `fileWidth/fileHeight` 一致。

## 8. 类型和 schema 更新方案

更新：

```text
apps/anieditorv5viewer/src/v5g/types.ts
apps/anieditorv5viewer/src/runtime/validation.ts
```

`V5GAssetConfig` 增加可选字段：

```ts
fileWidth?: number;
fileHeight?: number;
fileScale?: number;
```

新增类型：

```ts
export interface V5GExportProfileConfig {
  id: string;
  purpose: "editing" | "runtime";
  assetScale: number;
  label?: string;
}

export interface V5GBundleManifestEntry {
  id: string;
  purpose: "editing" | "runtime";
  assetScale: number;
  path: string;
  label?: string;
}

export interface V5GBundleManifest {
  type: "vni_export_bundle";
  version: string;
  exports: V5GBundleManifestEntry[];
}
```

`V5GProjectConfig` 增加：

```ts
exportProfile?: V5GExportProfileConfig;
```

校验规则：

- `schemaVersion` 明确支持：
  - `V5G_0.x`：旧导出
  - `VNI_0.x`：新导出
- `editor.name` 明确支持：
  - `victory_editor_v5_g`：当前旧导出和 `export2` 样例
  - `VNI`：当前 `docs/anieditor5/src/constants.ts` 已改为 `TOOL_NAME = "VNI"`，执行时如果新鲜导出出现该值，应作为同一代 VNI 合同处理
- 其它 schema 或 editor name 必须显式失败，不要静默兼容。
- `asset.width` / `asset.height` 必须是正有限数，表示设计逻辑尺寸。
- `asset.fileWidth` / `asset.fileHeight` / `asset.fileScale` 三者要么全部缺失，要么全部存在；部分存在视为非法导出数据，必须显式失败。
- 三者全部缺失时，按旧原图导出处理：`fileWidth = width`、`fileHeight = height`、`fileScale = 1`。
- 三者全部存在时，`fileWidth` / `fileHeight` 必须是正有限数，`fileScale` 必须满足 `0 < fileScale <= 1`。
- 编辑器缩放导出遇到不能整除的尺寸时，文件像素采用 `Math.round(logicalSize * fileScale)` 四舍五入，并用 `Math.max(1, ...)` 保证至少 1px；例如 `735 * 0.5 = 367.5` 导出为 `368`。
- 对存在 `fileWidth/fileHeight/fileScale` 的 asset，必须校验：
  - `fileWidth === Math.max(1, Math.round(width * fileScale))`
  - `fileHeight === Math.max(1, Math.round(height * fileScale))`
- `exportProfile` 如果存在：
  - `id` 必须非空。
  - `purpose` 必须是 `editing` 或 `runtime`。
  - `assetScale` 必须满足 `0 < assetScale <= 1`。
- `manifest.json` 如果被导入：
  - `type` 必须是 `vni_export_bundle`。
  - `version` 必须匹配 `VNI_0.x`。
  - `exports[]` 的 `id` 必须唯一。
  - 每个 entry 的 `path` 必须存在于 app 内置资源。
  - 每个 entry 指向的 project 如果存在 `exportProfile`，则 `exportProfile.id`、`purpose`、`assetScale` 必须与 manifest entry 一致。
  - 每个 entry 指向的 project 如果缺失 `exportProfile`，只允许作为 100% 原图单项目导出处理；bundle 内 profile 缺失 `exportProfile` 应显式失败。
  - `edit_full` 应作为同一 bundle 的默认原图 profile。

继续保持任务 31 的失败边界：

- `stage.coordinate` 只支持 `center`。
- `project.particles.length > 0` 仍显式失败；当前支持的是 layer animation `particles` / `particle_twinkle`。
- 非空 layer `keyframes` 仍显式失败。
- group layer 和非空 `parentId` 仍显式失败。
- 未知动画、未知 easing、未知 blend mode、未知资源都显式失败。

## 9. 资源 manifest 和 bundled projects 方案

更新：

```text
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts
```

核心原则：

`edit_full` 和 `runtime_50` 的 JSON 中 `asset.path` 完全相同，例如：

```text
assets/bigwin_asset_image_mqgf7e6h_g.png
```

因此不能再只维护一个全局 `asset.path -> url` manifest。必须让 manifest 按 profile 分域，否则两个 profile 的同名文件会互相覆盖。

建议在 `asset-manifest.ts` 保留现有函数，并新增 profile-aware manifest：

```ts
export type AssetUrlManifest = Readonly<Record<string, string>>;

export function createAssetUrlManifest(
  modules: Record<string, string>,
): AssetUrlManifest;

export function resolveProjectAssetUrls(
  project: V5GProjectConfig,
  manifest: AssetUrlManifest,
): AssetUrlManifest;
```

然后为每个资源根各自创建 manifest：

```ts
const legacyAssetModules = import.meta.glob("../assets/assets/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const export2EditFullAssetModules = import.meta.glob(
  "../assets/export2/edit_full/assets/*",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const export2Runtime50AssetModules = import.meta.glob(
  "../assets/export2/runtime_50/assets/*",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;
```

每个 glob 都可以继续把模块路径归一成 JSON 里的 `assets/<filename>`，但只能传给对应 profile 的 project。

`bundled-projects.ts` 建议输出 6 个可选项：

```text
project
bigwin
megawin
superwin
bigwin-edit-full
bigwin-runtime-50
```

每个 bundled project 至少包含：

- `id`
- `label`
- `sourcePath`
- `bundleId`：旧导出可用 `legacy`，新导出用 `export2`
- `profileId`：旧导出用 `legacy_full`，新导出用 `edit_full` / `runtime_50`
- `purpose`：旧导出用 `editing` 或 `legacy`；新导出取 manifest entry
- `assetScale`：旧导出默认 `1`；新导出取 manifest entry
- `project`
- `assetUrls`

`label` 建议包含 profile，避免 UI 上看不出正在播放哪套资源：

```text
胜利测试 (legacy/project.json, 100%)
bigwin (legacy/bigwin.json, 100%)
megawin (legacy/megawin.json, 100%)
superwin (legacy/superwin.json, 100%)
bigwin (export2/edit_full, 100% 原图)
bigwin (export2/runtime_50, 50% 运行资源)
```

默认选择应保持原图：

- 如果继续用单一 select，默认选中 `project` 或 `bigwin-edit-full` 都可以，但必须是 100% 原图 profile。
- 不允许默认打开 `runtime_50`。
- 旧项目缺失 profile 字段时，也必须按 100% 原图显示。
- VNI 单文件 100% 项目如果缺失 `exportProfile`，也必须按 100% 原图 profile 显示。

新增嵌套资源后必须确认配置仍覆盖 `src/assets`：

- `apps/anieditorv5viewer/.prettierignore` 必须继续排除 `src/assets`。
- `apps/anieditorv5viewer/vite.config.ts` 的 coverage exclude 必须继续排除 `src/assets/**`。
- `apps/anieditorv5viewer/tsconfig.json` 必须继续 include `src/**/*.json`，保证新 JSON import 可用。

## 10. 渲染尺寸补偿方案

更新：

```text
apps/anieditorv5viewer/src/runtime/layer-instance.ts
apps/anieditorv5viewer/src/runtime/v5g-player.ts
apps/anieditorv5viewer/src/runtime/particle-sampler.ts
```

### 10.1 贴图尺寸校验

当前 `V5GPlayer.loadTexture()` 按 `asset.width/height` 校验 texture 尺寸，这会导致 `runtime_50` 失败。必须改为按实际文件尺寸校验：

```text
expectedTextureWidth = asset.fileWidth ?? asset.width
expectedTextureHeight = asset.fileHeight ?? asset.height
```

不能整除时不要反推或重算 `fileScale`，也不要用 `width * fileScale` 的浮点值直接比对贴图；真实贴图尺寸以 JSON 的 `fileWidth/fileHeight` 为准。

错误信息应同时包含逻辑尺寸和文件尺寸，方便定位：

```text
VNI asset texture size mismatch for asset_image_x (assets/x.png):
logical 730x735, expected file 365x368, got 730x735.
```

旧导出没有 `fileWidth/fileHeight`，因此会继续按 `width/height` 校验，不需要额外 fallback。

### 10.2 图层显示补偿

缩小图片要按原始设计尺寸显示。建议让 `createLayerInstance()` 能拿到对应 asset：

```ts
createLayerInstance(layer, texturesByAssetId, assetsById)
```

image layer 创建 Sprite 后设置子 sprite 的补偿比例：

```text
compensationX = asset.width / texture.width
compensationY = asset.height / texture.height
```

规则：

- compensation 必须是正有限数。
- 如果计算结果非法，显式失败，不要静默使用 `1`。
- compensation 应放在 child sprite 上。
- layer container 的 `display.scale` 仍由 `applySampledLayerState()` 设置，保留动画采样、负缩放镜像和 transform 语义。
- 对旧导出，texture 尺寸等于逻辑尺寸，compensation 为 `1`。
- 对 `runtime_50`，compensation 约为 `2`，但以真实 `asset.width / texture.width`、`asset.height / texture.height` 为准。

### 10.3 粒子尺寸

现有粒子是从 layer texture 创建 Sprite。粒子采样里的 `textureSize` 建议继续使用实际 texture 尺寸，因为粒子 `size` 参数表示最终显示尺寸，`size / textureEdge` 可以让 50% texture 仍显示为目标粒子大小。

验收要覆盖：

- `runtime_50` 下主图层显示尺寸不缩小。
- `runtime_50` 下粒子仍可见，不因贴图尺寸变小而消失。
- `edit_full` 与 `runtime_50` 在同一时间点的图层位置和整体视觉尺寸一致，差异只应是图片清晰度。

## 11. UI 和诊断方案

更新：

```text
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/styles.css
apps/anieditorv5viewer/src/runtime/v5g-player.ts
```

UI 继续使用项目选择控件，可以是一个 select，也可以拆成“项目 + 资源 profile”两个 select。无论选择哪种形式，都必须满足：

- 能清楚选择 `edit_full` 和 `runtime_50`。
- 默认是 100% 原图。
- 摘要区域显示：
  - project name
  - sourcePath
  - schemaVersion
  - profile id
  - purpose
  - assetScale
  - layers/assets/duration
  - animation types
- 切换 profile 时必须销毁旧 player，清空旧 canvas，重新从 0 秒加载。
- 如果 id 不存在，直接 throw，不做 fallback 到默认项目。

建议保留并扩展 app-side diagnostics：

```text
data-v5g-project-id
data-v5g-time
data-v5g-visible-layers
data-v5g-pixel-samples
data-v5g-non-background-samples
data-v5g-max-pixel-delta
```

新增 profile 诊断：

```text
data-vni-bundle-id
data-vni-profile-id
data-vni-asset-scale
data-vni-profile-purpose
```

`destroy()` 必须继续清理：

- RAF
- pixel diagnostics RAF
- `ResizeObserver`
- particle sprites
- canvas
- container dataset 中旧 project/profile 诊断值

如果当前 `destroy()` 没清理新增 dataset，要在本任务补齐。

## 12. README 更新

更新：

```text
apps/anieditorv5viewer/README.md
```

README 至少说明：

- viewer 支持旧 `docs/anieditor5/export` 的 V5G 原图导出。
- viewer 支持新 `docs/anieditor5/export2` 的 VNI bundle。
- `edit_full` 是 100% 原图。
- `runtime_50` 是 50% 文件像素，但按原始逻辑尺寸播放。
- 旧导出缺失 `fileScale` 时默认原图。
- 支持的 schema：
  - `V5G_0.x`
  - `VNI_0.x`
- 显式不支持/会 fail-fast 的项目：
  - top-level `project.particles`
  - non-empty keyframes
  - group layers
  - nested parentId
  - unknown resources/layer types/animation types/blend modes/easing
- 本 app 的命令：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

## 13. 测试计划

更新或新增测试：

```text
apps/anieditorv5viewer/tests/runtime/validation.test.ts
apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts
apps/anieditorv5viewer/tests/runtime/project-sampler.test.ts
apps/anieditorv5viewer/tests/runtime/particle-sampler.test.ts
```

如需测试显示补偿，建议从生产代码中导出纯函数，例如：

```ts
getAssetTextureSize(asset)
getAssetDisplayCompensation(asset, textureSize)
```

然后新增专门测试文件：

```text
apps/anieditorv5viewer/tests/runtime/asset-scale.test.ts
```

必须覆盖：

- 所有旧 bundled exports 仍通过 `assertV5GProject()` 和 `validateV5GProject()`。
- `export2/edit_full/project.json` 通过校验。
- `export2/runtime_50/project.json` 通过校验。
- 旧 asset 缺失 `fileWidth/fileHeight/fileScale` 时，预期文件尺寸等于逻辑尺寸，scale 为 `1`。
- VNI 单文件 100% 项目缺失 `exportProfile` 时，仍按 100% 原图 profile 处理。
- `fileWidth/fileHeight/fileScale` 只出现一部分时会失败。
- `runtime_50` asset 预期文件尺寸来自 `fileWidth/fileHeight`，不是 `width/height`。
- `fileScale <= 0`、`fileScale > 1`、`fileWidth <= 0`、`fileHeight <= 0` 会失败。
- `fileWidth/fileHeight/fileScale` 与 `Math.round(width * fileScale)` 不一致时会失败。
- `VNI_0.x` schema 被接受，非 `V5G_0.x` / `VNI_0.x` 被拒绝。
- `editor.name` 只接受明确支持的 `victory_editor_v5_g` / `VNI`，其它值被拒绝。
- `manifest.json` 的 `vni_export_bundle` 被解析，`edit_full` 和 `runtime_50` entry 被纳入 bundled projects。
- manifest entry 与对应 project 的 `exportProfile.id/purpose/assetScale` 不一致时会失败。
- `edit_full` 和 `runtime_50` 同名 `asset.path` 能解析到不同 URL manifest，不会互相覆盖。
- `bigwin-runtime-50` 的所有 `asset.path` 都能在 runtime_50 manifest 找到。
- `.prettierignore`、`vite.config.ts`、`tsconfig.json` 对 `src/assets` 和 JSON import 的既有配置没有被破坏。
- 显示补偿：
  - `730x735` 逻辑图配 `365x368` texture 时，补偿为 `730/365` 和 `735/368`。
  - 旧导出补偿为 `1`。
- 粒子采样继续稳定，不因为 resource profile 切换改变随机确定性。

如果测试暴露现有测试假设已经过期，例如仍要求 texture 尺寸等于 `asset.width/height`，应修改测试表达新的导出合同，不要把生产逻辑改回旧语义。

## 14. 验收命令

执行前确认 Node/pnpm：

```bash
node -v
pnpm -v
```

资源和类型验收：

```bash
find apps/anieditorv5viewer/src/assets -maxdepth 5 -type f | sort
find apps/anieditorv5viewer/src/assets -name '.DS_Store' -print
node -e "const fs=require('fs'); const entries=[['apps/anieditorv5viewer/src/assets/project.json','apps/anieditorv5viewer/src/assets'],['apps/anieditorv5viewer/src/assets/projects/bigwin.json','apps/anieditorv5viewer/src/assets'],['apps/anieditorv5viewer/src/assets/projects/megawin.json','apps/anieditorv5viewer/src/assets'],['apps/anieditorv5viewer/src/assets/projects/superwin.json','apps/anieditorv5viewer/src/assets'],['apps/anieditorv5viewer/src/assets/export2/edit_full/project.json','apps/anieditorv5viewer/src/assets/export2/edit_full'],['apps/anieditorv5viewer/src/assets/export2/runtime_50/project.json','apps/anieditorv5viewer/src/assets/export2/runtime_50']]; for (const [file,base] of entries) { const json=JSON.parse(fs.readFileSync(file,'utf8')); for (const asset of json.assets) { const path=base+'/'+asset.path; if (!fs.existsSync(path)) throw new Error(file+' missing '+asset.path); } } console.log('all bundled assets exist');"
```

第二条 `find` 必须无输出。

app-local 验收：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

根级格式检查可视情况执行：

```bash
pnpm format:check
```

如果根级 `pnpm format:check` 因无关旧包失败，不能因此修改无关代码；在报告中记录失败文件和原因，并说明本任务已用 app-local `format:check` 覆盖自身边界。

最终差异检查：

```bash
git diff --check
git status --short
```

## 15. 浏览器验收

启动 dev server：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

如果 `5175` 已被占用，改用其它空闲端口，例如 `5176`，并在任务报告中记录实际 URL。

浏览器默认打开：

```text
http://localhost:5175
```

必须至少验证：

- 默认进入的是 100% 原图 profile。
- 旧 `project` 可以播放。
- 旧 `bigwin` 可以播放。
- 旧 `megawin` 可以播放。
- 旧 `superwin` 可以播放。
- `bigwin / edit_full / 100%` 可以播放。
- `bigwin / runtime_50 / 50%` 可以播放。
- `edit_full` 和 `runtime_50` 切换后，动画占位尺寸一致，`runtime_50` 不能显示为半尺寸。
- `runtime_50` 下粒子动画仍可见。
- 拖动时间轴、播放、暂停、重播、循环仍可用。
- 切换项目/profile 后旧 canvas 被清理，不叠加旧画面。
- 页面诊断属性包含当前 project/profile：
  - `data-v5g-project-id`
  - `data-vni-profile-id`
  - `data-vni-asset-scale`
  - `data-v5g-non-background-samples`
- `data-v5g-non-background-samples` 或等价像素诊断能证明 canvas 有非背景像素。

浏览器验收要在任务报告中写出证据，例如：

```text
bigwin-edit-full: data-vni-profile-id=edit_full, data-vni-asset-scale=1, non-background-samples=...
bigwin-runtime-50: data-vni-profile-id=runtime_50, data-vni-asset-scale=0.5, non-background-samples=...
```

如果截图或自动浏览器 API 不稳定，可以使用 app-side `data-v5g-*` / `data-vni-*` 诊断作为证据，但必须说明没有使用截图，不要声称完成了未实际执行的浏览器验收。

验收后停止 dev server，不要留下后台进程。

## 16. 任务报告要求

完成实现和验收后，新建中文报告：

```text
tasks/33-anieditorv5viewer-scaled-assets-[utctime].md
```

报告必须包含：

- 任务摘要。
- 实际改动文件列表。
- 是否修改 `docs/anieditor5/src/**`；如果修改，说明原因。
- 是否更新 `AGENTS.md` / `agents.md`；如果没有，说明本任务未改变仓库协作规则。
- 资源同步结果：
  - 旧 export 资源数量。
  - export2 manifest/profile 数量。
  - `edit_full` asset 数量。
  - `runtime_50` asset 数量。
  - `.DS_Store` 是否排除。
- 核心实现说明：
  - V5G/VNI schema 支持。
  - `fileWidth/fileHeight/fileScale` 校验。
  - profile-scoped asset manifest。
  - manifest entry 与 project `exportProfile` 的一致性校验。
  - 贴图尺寸校验。
  - 显示补偿。
  - UI/profile 诊断。
  - `.prettierignore`、coverage exclude、JSON import 配置是否仍覆盖新增资源目录。
- 验收命令和结果：
  - `node -v`
  - `pnpm -v`
  - 资源存在性检查
  - `pnpm --filter anieditorv5viewer typecheck`
  - `pnpm --filter anieditorv5viewer lint`
  - `pnpm --filter anieditorv5viewer test`
  - `pnpm --filter anieditorv5viewer build`
  - `pnpm --filter anieditorv5viewer format:check`
  - `git diff --check`
- 浏览器验收证据。
- 已知问题或未做事项。
- 最终 `git status --short` 摘要。

报告命名命令：

```bash
UTC_TIME=$(date -u +%y%m%d-%H%M%S)
echo "tasks/33-anieditorv5viewer-scaled-assets-${UTC_TIME}.md"
```

## 17. 二次检查清单

交付前必须逐项确认：

- [ ] 计划中的目标文件都已检查或更新。
- [ ] 没有回滚用户在 `docs/anieditor5/src/**` 的已有改动。
- [ ] `docs/anieditor5/export2/.DS_Store` 没有复制进 app。
- [ ] 旧 4 个 V5G 项目仍可播放。
- [ ] 新 `edit_full` 可以播放。
- [ ] 新 `runtime_50` 可以播放。
- [ ] 旧导出缺失 `fileScale` 时默认原图。
- [ ] VNI 单文件 100% 导出缺失 `exportProfile` 时默认原图。
- [ ] `fileWidth/fileHeight/fileScale` 部分缺失会显式失败。
- [ ] `runtime_50` 的 texture 尺寸按 `fileWidth/fileHeight` 校验。
- [ ] `runtime_50` 的显示尺寸按 `asset.width/height` 补偿。
- [ ] manifest entry 与 project `exportProfile` 的 `id/purpose/assetScale` 已互相校验。
- [ ] `edit_full` 和 `runtime_50` 同名 `asset.path` 没有 manifest 覆盖。
- [ ] `.prettierignore`、coverage exclude、JSON import 配置仍覆盖新增资源目录。
- [ ] `schemaVersion` 没有硬编码成单一 `VNI_0.003` 或单一 `V5G_0.0051`。
- [ ] 未知 schema/editor/资源/动画/easing/blend mode 仍显式失败。
- [ ] 没有新增隐藏 fallback，也没有运行时偷偷替换资源 profile。
- [ ] 测试表达真实合同，没有为了测试通过改坏生产逻辑。
- [ ] README 已同步新资源 profile 语义。
- [ ] 如果协作规则未变，报告中明确说明不需要更新 `AGENTS.md` / `agents.md`。
- [ ] 任务报告已按 UTC 命名写入 `tasks/`。
- [ ] 验收命令、浏览器证据和最终 `git status --short` 已写入报告。
