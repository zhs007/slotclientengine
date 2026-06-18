# anieditorv5runtime-cc standalone runtime assets 任务计划

## 1. 任务目标

更新现有 Cocos Creator 3.8.6 动画运行时包：

```text
packages/anieditorv5runtime-cc
```

让它跟上任务 29、31、33 后动画编辑器和 viewer 的最新导出合同，尤其是 `docs/anieditor5/export2/runtime_50` 这种运行发布用压缩资源。

本任务的主要交付是 standalone 版：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone.zip
```

`anieditorv5runtime-cc` 是最终发布环境用的 runtime，不是编辑器预览器，也不是资源包管理器。本任务只需要把压缩运行资源处理正确，避免最终发布版本携带不必要的大体积编辑资源。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、standalone zip 更新、验收和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/35-anieditorv5runtime-cc-standalone-runtime-assets-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/35-anieditorv5runtime-cc-standalone-runtime-assets-260618-123456.md
```

## 2. 仓库和环境事实

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 新增空目录必须放 `.keepme`
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。如果确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告里记录 `pnpm-lock.yaml` 是否变化。若下载失败，再使用上面的代理环境变量重试。

当前根协作规则文件是：

```text
agents.md
```

如果本任务只更新 `packages/anieditorv5runtime-cc`、任务文件、README、测试 fixture 和 standalone zip，通常不需要同步更新 `agents.md`。如果实现阶段改变了仓库协作规则、目录规范、根级脚本或通用执行约定，必须同步更新 `agents.md`，并在任务报告中说明原因。

## 3. 当前 package 事实

package 名称：

```text
@slotclientengine/anieditorv5runtime-cc
```

当前关键文件：

```text
packages/anieditorv5runtime-cc/package.json
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/particle-sampler.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone.zip
```

当前 package 脚本：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

当前已具备：

- 模块化 core 和 Cocos adapter。
- standalone 单文件 runtime。
- `standalone.zip`，当前包含：
  - `standalone/anieditorv5runtime-cc.ts`
  - `standalone/V5GPreview.example.ts`
- 播放控制和 range event API。
- `src/index.ts` 刻意不 runtime re-export `createV5GCocosPlayer`，避免根入口运行时引入真实 `"cc"` 模块。

任务 34 已经给 `V5GCocosPlayer` 增加 range/event API。本任务同步类型、校验和压缩资源支持时，不能回退或删除这些已完成能力：

```text
playRange(...)
addPlaybackEvent(...)
clearPlaybackEvent(...)
clearPlaybackEvents(...)
onPlaybackComplete(...)
```

当前明显落后点：

- `src/core/types.ts` 和 standalone 类型还没有 `fileWidth`、`fileHeight`、`fileScale`、`exportProfile`。
- `validateV5GProject()` 还只接受 `V5G_0.x`，README 也只写 `V5G_0.x`。
- `assertSpriteFrameSize()` 还按 `asset.width/height` 校验 SpriteFrame 尺寸，会错误拒绝 `runtime_50` 压缩资源。
- `tests/fixtures` 只有旧 `docs/anieditor5/export` 四个 JSON，没有 `docs/anieditor5/export2/runtime_50/project.json`。
- standalone 单文件必须跟模块化源码同步，否则普通 Cocos Creator 项目复制导入时仍然会失败。

## 4. 最新导出合同

必须参考任务 33 后的 viewer 最新实现：

```text
apps/anieditorv5viewer/src/v5g/types.ts
apps/anieditorv5viewer/src/runtime/validation.ts
apps/anieditorv5viewer/src/runtime/layer-instance.ts
apps/anieditorv5viewer/src/runtime/v5g-player.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
```

必须参考最新运行资源输入：

```text
docs/anieditor5/export2/manifest.json
docs/anieditor5/export2/runtime_50/project.json
docs/anieditor5/export2/runtime_50/assets/*
```

`manifest.json` 当前包含两个 profile：

```text
edit_full: purpose=editing, assetScale=1, path=edit_full/project.json
runtime_50: purpose=runtime, assetScale=0.5, path=runtime_50/project.json
```

本任务的发布验收只围绕 `runtime_50`。不要把 `edit_full` 资源复制进 package、standalone zip 或示例交付路径；不要新增 profile 选择 UI、bundle manifest loader、资源下载器或 Cocos 项目资源导入器。

`runtime_50/project.json` 当前关键事实：

```text
schemaVersion: VNI_0.002
editor.name: victory_editor_v5_g
editor.version: VNI_0.002
engineTarget.name: cocos_creator
engineTarget.version: 3.8.6
name: bigwin
stage.width: 2000
stage.height: 2000
stage.coordinate: center
stage.duration: 5
exportProfile.id: runtime_50
exportProfile.purpose: runtime
exportProfile.assetScale: 0.5
```

压缩资源字段合同：

```text
asset.width / asset.height       = 设计逻辑尺寸，也是 Cocos 节点显示尺寸
asset.fileWidth / asset.fileHeight = 当前 profile 的真实文件像素尺寸，也是 SpriteFrame 尺寸校验值
asset.fileScale                  = profile 缩放比例，只用于校验和诊断，不直接作为节点缩放
```

示例：

```text
assets/bigwin_asset_image_mqgf7e6h_g.png
logical: 730x735
runtime_50 file: 365x368
fileScale: 0.5
```

正确 runtime 行为：

- SpriteFrame 实际尺寸必须匹配 `fileWidth/fileHeight`。
- Cocos 节点 `UITransform` 尺寸仍必须设置为 `width/height`。
- 粒子贴图复用同一个 SpriteFrame 时，粒子节点内容尺寸和粒子采样边界也应继续使用逻辑 `width/height`。
- 不要把显示尺寸设为 `fileWidth/fileHeight`。
- 不要把节点 `scaleX/scaleY` 额外乘以 `1 / fileScale`。
- 不要根据 SpriteFrame 尺寸反推 `fileScale`。
- 对旧 `V5G_0.x` 导出和没有压缩字段的 100% 导出，明确按 `fileWidth=width`、`fileHeight=height`、`fileScale=1` 的合同处理。

## 5. 范围边界

本任务要做：

- 更新 `packages/anieditorv5runtime-cc/src/core/types.ts`，补齐 viewer 已有的 VNI/export profile/压缩资源字段。
- 更新 `packages/anieditorv5runtime-cc/src/core/validation.ts`，支持 `V5G_0.x` 和 `VNI_0.x`，支持 `victory_editor_v5_g` 和 `VNI` 编辑器名，严格校验压缩资源字段。
- 更新 Cocos player 的 SpriteFrame 尺寸校验，让 `runtime_50` 的半尺寸 PNG 可以通过，同时仍按逻辑尺寸显示。
- 更新 standalone 单文件，使普通 Cocos Creator 项目复制 `anieditorv5runtime-cc.ts` 后得到同样行为。
- 更新 standalone 检查脚本、测试、README、示例和 `standalone.zip`。
- 新增 `runtime_50` fixture，并用测试固定压缩资源合同。

本任务不要做：

- 不新增 `apps/anieditorv5viewer-cc`。
- 不实现 Cocos Creator 完整项目、场景、`.meta`、`Library`、`Temp`、构建目录或资源导入数据库。
- 不在 runtime 或 standalone 里读取文件、import JSON、绑定 `JsonAsset`、调用 `resources.load()`、远程下载图片或猜测资源路径。
- 不新增 bundle/profile 选择 UI。
- 不把 `edit_full` 图片资源复制进 package、standalone zip 或示例发布路径。
- 不为 `runtime_50` 加占位图、自动修复 metadata、自动猜 `fileScale`、自动降级为原图尺寸校验。
- 不吞掉 callback 错误或 validation 错误。
- 不为了测试通过修改不该改的生产语义。如果测试导致一些奇怪写法，就修改测试，不要改不该改的东西，以免后续出现问题难查。

## 6. 实现步骤

### 阶段 1：执行前确认

在仓库根目录执行：

```bash
git status --short
rg -n "fileWidth|fileHeight|fileScale|exportProfile|VNI_0|SUPPORTED_EDITOR_NAMES" apps/anieditorv5viewer packages/anieditorv5runtime-cc docs/anieditor5/export2
unzip -l packages/anieditorv5runtime-cc/standalone.zip
node -e "const fs=require('fs');const base='docs/anieditor5/export2/runtime_50';const project=JSON.parse(fs.readFileSync(base+'/project.json','utf8'));for(const asset of project.assets){const file=base+'/'+asset.path;const png=fs.readFileSync(file);if(png.toString('ascii',1,4)!=='PNG')throw new Error(file+' is not a PNG');const width=png.readUInt32BE(16);const height=png.readUInt32BE(20);if(width!==asset.fileWidth||height!==asset.fileHeight)throw new Error(file+' expected '+asset.fileWidth+'x'+asset.fileHeight+', got '+width+'x'+height);}console.log('runtime_50 png dimensions match project metadata');"
```

要求：

- 不回滚用户已有改动。
- 先确认 viewer 当前最新合同，再改 runtime-cc。
- 确认 `standalone.zip` 当前只包含 standalone runtime 和示例，后续更新后也保持这个范围。
- 确认 `docs/anieditor5/export2/runtime_50/assets/*` 真实 PNG 像素与 `runtime_50/project.json` 的 `fileWidth/fileHeight` 一致；如果源资源本身不一致，先在任务报告里记录并停止实现，不要修改 runtime 去兜底坏资源。

### 阶段 2：同步 core 类型

修改：

```text
packages/anieditorv5runtime-cc/src/core/types.ts
```

按 viewer 最新类型补齐：

```ts
export interface V5GAssetConfig {
  id: string;
  type: V5GAssetType;
  path: string;
  originalName: string;
  width: number;
  height: number;
  fileWidth?: number;
  fileHeight?: number;
  fileScale?: number;
}

export interface V5GExportProfileConfig {
  id: string;
  purpose: "editing" | "runtime";
  assetScale: number;
  label?: string;
}

export interface V5GProjectConfig {
  schemaVersion: string;
  editor: {
    name: string;
    version: string;
  };
  engineTarget: {
    name: "cocos_creator";
    version: string;
  };
  name: string;
  exportProfile?: V5GExportProfileConfig;
  stage: V5GStageConfig;
  assets: V5GAssetConfig[];
  layers: V5GLayerConfig[];
  particles: V5GParticleConfig[];
}
```

不需要把 viewer 的 `V5GBundleManifest` 作为 runtime 必需能力。runtime-cc 接收的是已经选好的 `V5GProjectConfig`，发布环境只需要宿主传入 `runtime_50/project.json` 对象和对应 SpriteFrame。

### 阶段 3：严格校验 VNI 和压缩资源字段

修改：

```text
packages/anieditorv5runtime-cc/src/core/validation.ts
```

必须实现：

- `assertV5GProject()` 解析可选 `project.exportProfile`。
- `validateV5GProject()` 接受：
  - `schemaVersion` 匹配 `V5G_0.x`
  - `schemaVersion` 匹配 `VNI_0.x`
  - `editor.name === "victory_editor_v5_g"`
  - `editor.name === "VNI"`
- `validateV5GProject()` 继续要求：
  - `engineTarget.name === "cocos_creator"`
  - `stage.coordinate === "center"`
  - `project.particles.length === 0`
  - 未知 layer、animation、easing、blendMode 直接失败
- `assertAsset()` 必须把可选 `fileWidth`、`fileHeight`、`fileScale` 解析为 number 或 `undefined`；如果传入非 number 值，应在 assert/validate 阶段显式失败，不要保留未校验的 unknown。
- `validateExportProfile(profile, path)`：
  - `id` 非空
  - `purpose` 只能是 `editing` 或 `runtime`
  - `assetScale` 必须是 `0 < assetScale <= 1`
- `validateAssetFileMetadata(asset)`：
  - `fileWidth/fileHeight/fileScale` 三者必须同时缺失或同时存在
  - 全部缺失时按旧导出和 100% 导出处理，不失败
  - `fileWidth/fileHeight` 必须是正整数
  - `fileScale` 必须是 `0 < fileScale <= 1`
  - `fileWidth === Math.max(1, Math.round(width * fileScale))`
  - `fileHeight === Math.max(1, Math.round(height * fileScale))`
  - 部分缺失、非正数、`fileScale > 1`、尺寸不匹配都必须抛错
- 如果 `project.exportProfile` 存在：
  - `exportProfile.assetScale < 1` 时，每个 asset 都必须提供 `fileWidth/fileHeight/fileScale`。
  - 每个提供了 `fileScale` 的 asset，其 `fileScale` 必须等于 `project.exportProfile.assetScale`。
  - `exportProfile.purpose === "runtime"` 时不允许出现缺失压缩字段的 asset。

不要为了兼容坏数据添加自动补齐。压缩资源 metadata 错误越早暴露越好。

### 阶段 4：修正 Cocos SpriteFrame 尺寸合同

修改：

```text
packages/anieditorv5runtime-cc/src/cocos/player.ts
```

新增或内联一个明确 helper：

```ts
function getExpectedSpriteFrameSize(asset: V5GAssetConfig): {
  width: number;
  height: number;
} {
  return {
    width: asset.fileWidth ?? asset.width,
    height: asset.fileHeight ?? asset.height,
  };
}
```

`assertSpriteFrameSize(asset, spriteFrame)` 必须改为：

- `driver.getSpriteFrameSize(spriteFrame) === null` 时维持当前合同：不能伪造已校验，保留现有行为和 README 说明。
- 能读取尺寸时，使用 `fileWidth/fileHeight` fallback `width/height` 作为 expected。
- 错误信息要同时包含 logical 尺寸和 expected file 尺寸，方便定位是资源绑定错还是 metadata 错。

继续保持：

- `driver.setContentSize(node, asset.width, asset.height)`
- 粒子节点 `setContentSize(node, managed.asset.width, managed.asset.height)`
- 粒子采样 size 使用逻辑尺寸：

```ts
{
  width: managed.asset.width,
  height: managed.asset.height,
}
```

这一步的验收重点是：`runtime_50` SpriteFrame 是 365x368 时通过，Cocos 节点显示尺寸仍是 730x735。

### 阶段 5：更新 standalone 单文件

修改：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

standalone 必须同步阶段 2、3、4 的全部行为：

- `V5GAssetConfig` 新增 `fileWidth/fileHeight/fileScale`
- 新增 `V5GExportProfileConfig`
- `V5GProjectConfig` 新增可选 `exportProfile`
- `assertV5GProject()` 解析 `exportProfile`
- `validateV5GProject()` 接受 `VNI_0.x`
- 压缩资源 metadata 严格校验
- SpriteFrame 尺寸按 `fileWidth/fileHeight` 校验，节点显示尺寸仍用逻辑 `width/height`

standalone 仍只能 import：

```ts
from "cc"
```

禁止新增任何相对 import、workspace import、Node builtin、DOM global、资源加载 API 或 Cocos Component 装饰器。

同时更新：

```text
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
```

检查脚本至少要确认 standalone 暴露：

- `export interface V5GExportProfileConfig`
- `export interface V5GAssetConfig`
- `export interface V5GProjectConfig`
- `export function validateV5GProject`
- `export function validateCocosV5GProject`
- `export class V5GCocosPlayer`
- `export function createV5GCocosPlayer`

不要把 `V5GBundleManifest` 作为 standalone 必需导出，除非实现阶段明确决定 runtime 也要公开 manifest 校验。按本计划，发布路径不需要 manifest loader。

### 阶段 6：新增 runtime_50 fixture 和测试

新增 fixture：

```text
packages/anieditorv5runtime-cc/tests/fixtures/export2-runtime-50.json
```

内容从这里复制：

```text
docs/anieditor5/export2/runtime_50/project.json
```

不要复制 `docs/anieditor5/export2/edit_full/assets/*` 或 `runtime_50/assets/*` 到 package。runtime 单元测试使用 fake SpriteFrame 尺寸即可，不需要把 PNG 资源放进 runtime 包。

更新测试：

```text
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
```

必须覆盖：

- `validateV5GProject()` 接受 `export2-runtime-50.json`。
- `validateCocosV5GProject()` 接受 `export2-runtime-50.json`。
- `schemaVersion=VNI_0.x` 被接受，非 `V5G_0.x` / `VNI_0.x` 被拒绝。
- `editor.name="VNI"` 被接受，未知 editor 被拒绝。
- 旧四个 legacy fixture 缺失 `fileWidth/fileHeight/fileScale` 时仍通过。
- `fileWidth/fileHeight/fileScale` 部分缺失时失败。
- `fileScale <= 0` 和 `fileScale > 1` 失败。
- `fileWidth/fileHeight` 不等于 `Math.round(width * fileScale)` / `Math.round(height * fileScale)` 时失败。
- Cocos player 使用 `fileWidth/fileHeight` 校验 SpriteFrame：
  - fake SpriteFrame 为压缩文件尺寸时通过。
  - fake SpriteFrame 为逻辑原图尺寸时失败。
  - 创建出的 layer node 内容尺寸仍为逻辑 `width/height`。
- standalone 和模块化 runtime 对 `export2-runtime-50.json` 的 `assert/validate/sample` 结果一致。
- standalone player 对压缩 SpriteFrame 的通过/失败行为与模块化 player 一致。
- 已有任务 34 的 range/event API 测试仍然通过，不能因为重写 standalone 或 player 同步逻辑丢失 `playRange(...)`、marker 或 complete 行为。
- `project.exportProfile.assetScale` 与 asset `fileScale` 不一致时失败；`runtime` profile 缺失压缩字段时失败。

如果测试为了方便构造假数据，导致生产代码需要出现奇怪分支，改测试，不改生产合同。

### 阶段 7：更新 README 和示例

修改：

```text
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

README 必须说明：

- 当前支持 `V5G_0.x` 和 `VNI_0.x`。
- 当前支持 `fileWidth/fileHeight/fileScale` 压缩资源 metadata。
- 普通 Cocos Creator 项目优先复制 standalone 单文件。
- 发布环境推荐使用 `docs/anieditor5/export2/runtime_50/project.json` 和对应压缩 SpriteFrame。
- runtime 不读取 project.json、不加载图片、不解析 bundle manifest、不选择 profile。
- 宿主必须显式绑定 `asset.id -> SpriteFrame`。
- 宿主给 runtime 传入 `runtime_50/project.json` 时，也必须绑定同一 profile 下的压缩 SpriteFrame；不要因为 `asset.path` 文件名与 `edit_full` 相同而误绑原图 SpriteFrame。
- 如果能读取 SpriteFrame 尺寸，runtime 会按 `fileWidth/fileHeight` 校验实际文件像素；没有压缩字段时按 `width/height` 校验。
- runtime 创建的 Cocos 节点内容尺寸仍使用逻辑 `width/height`。
- 不要把 `edit_full` 当作发布资源路径。

示例只展示宿主如何传入已经准备好的 project 对象和 SpriteFrame resolver，不要在示例里添加 `resources.load()`、bundle manifest 选择器或 edit_full 资源路径。

### 阶段 8：更新 standalone.zip

实现和测试通过后，在 package 目录更新压缩包：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
cd ../..
```

随后检查：

```bash
unzip -l packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
```

验收要求：

- zip 内只有 standalone runtime 和 standalone 示例。
- zip 内不要出现 `edit_full`。
- zip 内不要出现 `runtime_50/assets` 图片资源。
- zip 内不要出现 `dist`、`src`、`tests`、`node_modules`。
- zip 内不要出现 `__MACOSX` 或 `._*`。

## 7. 验证命令

在仓库根目录依次执行：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
unzip -l packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
node -e "const fs=require('fs');const base='docs/anieditor5/export2/runtime_50';const project=JSON.parse(fs.readFileSync(base+'/project.json','utf8'));for(const asset of project.assets){const file=base+'/'+asset.path;const png=fs.readFileSync(file);if(png.toString('ascii',1,4)!=='PNG')throw new Error(file+' is not a PNG');const width=png.readUInt32BE(16);const height=png.readUInt32BE(20);if(width!==asset.fileWidth||height!==asset.fileHeight)throw new Error(file+' expected '+asset.fileWidth+'x'+asset.fileHeight+', got '+width+'x'+height);}console.log('runtime_50 png dimensions match project metadata');"
git diff --check
git status --short
```

如果 `pnpm` 依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

然后重试原命令。不要因为网络或依赖安装问题修改 runtime 生产逻辑。

如果 `format:check` 只因为本任务触碰的 `packages/anieditorv5runtime-cc` 文件失败，可以执行：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc format
```

然后重新执行完整验证命令。不要格式化或改写无关 package 来掩盖本任务结果。

## 8. 验收清单

完成时必须逐项确认：

- [ ] `packages/anieditorv5runtime-cc/src/core/types.ts` 包含压缩资源字段和 `V5GExportProfileConfig`。
- [ ] `packages/anieditorv5runtime-cc/src/core/validation.ts` 接受 `VNI_0.x`，拒绝未知 schema。
- [ ] `validateV5GProject()` 对 `fileWidth/fileHeight/fileScale` 是 all-or-none 严格校验。
- [ ] `project.exportProfile.assetScale` 与 asset `fileScale` 不一致会失败。
- [ ] `exportProfile.purpose === "runtime"` 或 `assetScale < 1` 时，缺失压缩字段会失败。
- [ ] `fileScale` 没有被用作 Cocos 节点缩放。
- [ ] SpriteFrame 尺寸校验使用 `fileWidth/fileHeight` fallback `width/height`。
- [ ] Cocos 节点内容尺寸继续使用逻辑 `width/height`。
- [ ] 粒子节点和粒子采样继续使用逻辑尺寸。
- [ ] `docs/anieditor5/export2/runtime_50/project.json` 已作为测试 fixture 覆盖。
- [ ] `docs/anieditor5/export2/runtime_50/assets/*` 真实 PNG 尺寸已确认匹配 JSON `fileWidth/fileHeight`。
- [ ] 没有复制 `edit_full` 图片资源到 runtime package。
- [ ] 任务 34 已有的 range/event API 和测试没有被回退。
- [ ] `src/index.ts` 仍然没有 runtime re-export `createV5GCocosPlayer` 或 `createCocosNodeDriver`。
- [ ] standalone 单文件和模块化源码行为一致。
- [ ] `scripts/check-standalone.mjs` 能阻止 standalone 引入非 `"cc"` 依赖。
- [ ] `standalone.zip` 已更新，且只包含 standalone runtime 和示例，不含 `__MACOSX` 或 `._*`。
- [ ] README 明确说明发布环境使用 `runtime_50`，runtime 不负责加载或选择资源 profile。
- [ ] 所有验证命令已执行并记录结果。
- [ ] 如果没有改变根协作规则，任务报告明确写“无需更新 agents.md”。

## 9. 二次遗漏检查

提交前再做一次遗漏检查：

```bash
rg -n "V5G_0|VNI_0|fileWidth|fileHeight|fileScale|exportProfile|SpriteFrame size mismatch|runtime_50|edit_full" packages/anieditorv5runtime-cc
unzip -l packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
node -e "const fs=require('fs');const base='docs/anieditor5/export2/runtime_50';const project=JSON.parse(fs.readFileSync(base+'/project.json','utf8'));for(const asset of project.assets){const file=base+'/'+asset.path;const png=fs.readFileSync(file);const width=png.readUInt32BE(16);const height=png.readUInt32BE(20);if(width!==asset.fileWidth||height!==asset.fileHeight)throw new Error(file+' expected '+asset.fileWidth+'x'+asset.fileHeight+', got '+width+'x'+height);}console.log('runtime_50 png dimensions match project metadata');"
git diff -- packages/anieditorv5runtime-cc tasks/35-anieditorv5runtime-cc-standalone-runtime-assets.md
```

重点检查：

- `src` 和 `standalone` 是否都改了。
- 任务 34 的 range/event API 是否仍在模块化和 standalone 中存在并通过测试。
- 测试是否只为真实合同服务，没有为了通过测试引入生产兜底。
- README 是否没有误导用户把 edit_full 当作发布资源。
- `standalone.zip` 是否是最新内容，且没有旧条目或 macOS 元数据。
- `tasks/35-anieditorv5runtime-cc-standalone-runtime-assets-[utctime].md` 报告是否会在实现完成后补上。

## 10. 任务报告要求

实现完成后新增报告：

```text
tasks/35-anieditorv5runtime-cc-standalone-runtime-assets-[utctime].md
```

报告必须包含：

- 本次修改摘要。
- 修改文件清单。
- `runtime_50` 压缩资源合同如何落地：
  - SpriteFrame 文件尺寸按 `fileWidth/fileHeight` 校验。
  - Cocos 节点显示尺寸按 `width/height`。
  - `fileScale` 不直接参与节点缩放。
  - `exportProfile.assetScale` 与 asset `fileScale` 一致性如何校验。
- 任务 34 的 range/event API 是否保持兼容。
- standalone 单文件和 `standalone.zip` 更新结果。
- `unzip -l packages/anieditorv5runtime-cc/standalone.zip` 摘要。
- `zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` 摘要。
- `runtime_50` 源 PNG 尺寸与 JSON `fileWidth/fileHeight` 的检查结果。
- 每条验证命令的结果。
- 是否更新 `agents.md`；如果没有，说明原因。
- 已知限制：
  - runtime 不加载资源。
  - runtime 不解析 bundle manifest。
  - runtime 不复制或发布 `edit_full` 资源。
  - 真实 Cocos Creator 3.8.6 编辑器内资源导入仍需宿主项目人工确认。
