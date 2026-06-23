# anieditorv5runtime-cc atlas assets 任务计划

## 1. 任务目标

更新 Cocos Creator 3.8.6 runtime：

```text
/Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
```

让 Cocos Creator 宿主使用动画时不再需要逐个配置 `assetID` 和 `SpriteFrame` 数组，而是可以直接传入一个 `SpriteAtlas`，由 runtime 按：

```text
spriteFrameName = filenameStem(asset.path)
```

自动绑定动画中所有 `project.assets[]` 对应的 `SpriteFrame`。`filenameStem(asset.path)` 表示 `asset.path` 去掉目录和扩展名后的文件名。

目标宿主代码应支持类似下面的用法：

```ts
const atlas = Define.GameBundle.get("Img/v5gani", SpriteAtlas);

const player = createV5GCocosPlayer({
  root,
  project,
  assets: {
    atlas,
  },
  loop: true,
});
```

例如：

```text
asset.path = assets/respin_asset_image_mqkv73wu_e.png
atlas.getSpriteFrame("respin_asset_image_mqkv73wu_e")
```

同时，runtime 不再渲染 `project.stage.backgroundColor` 或其它 stage 背景配置。stage 背景属于编辑器预览或宿主场景职责；Cocos runtime 只创建动画内容、图层节点和粒子节点，不创建 `V5G Background`，也不使用 Cocos `Graphics` 绘制背景矩形。

本任务以 standalone 版为主要交付面。模块化源码通过不代表完成；必须同步更新：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/standalone.zip
```

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、standalone 交付、文档同步、协作规则同步判断和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/43-anieditorv5runtime-cc-atlas-prefix-assets-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/43-anieditorv5runtime-cc-atlas-prefix-assets-260623-123456.md
```

## 2. 仓库和环境约束

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

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。如果确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，再使用上面的代理环境变量重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short
git diff --stat
```

当前仓库同时存在：

```text
AGENTS.md
agents.md
```

如果本任务更新长期协作规则、目录规范、根级脚本或基础执行约定，必须同步更新这两个文件，并保持内容一致。只更新 `packages/anieditorv5runtime-cc` 的 runtime API、README、测试、standalone 文件和任务报告时，通常不需要更新 `AGENTS.md` / `agents.md`；最终判断和原因必须写入任务报告。

## 3. 当前实现事实

执行时必须重新阅读当前实现，以实际代码为准。当前已经观察到的相关事实如下。

核心路径：

```text
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/README.md
```

当前资源绑定事实：

- `V5GCocosAssetResolver<TSpriteFrame>` 只有 `getSpriteFrame(assetPath, assetId)`。
- `V5GCocosPlayerOptions.assets` 当前必须传 resolver。
- `V5GPreview.example.ts` 当前用 `assetIds: string[]` 和 `spriteFrames: SpriteFrame[]` 成对配置资源。
- `README.md` 当前写明宿主必须显式绑定 `asset.id -> SpriteFrame`，并且不要依赖 `SpriteFrame.name` 猜测资源。
- 当前缺资源会显式失败，错误包含 asset id 和 asset path；这个 fail-fast 行为必须保留。

当前 stage 背景事实：

- `V5GStageConfig` 当前包含 `backgroundColor: string`。
- `validateV5GProject(...)` / `validateCocosV5GProject(...)` 当前会校验 `project.stage.backgroundColor` 的颜色格式。
- `V5GCocosPlayer.init()` 当前会创建 `V5G Background` 节点。
- `V5GCocosNodeDriver` 当前有 `createBackgroundNode(...)`。
- `src/cocos/cocos-node-driver.ts` 和 standalone runtime 当前 import Cocos `Graphics`，用 `Graphics` 绘制背景色矩形。
- `README.md` 当前写明 runtime 会创建 `V5G Background`。
- `tests/cocos/player.test.ts` 和 `tests/standalone/standalone-player.test.ts` 当前把背景节点存在当成正确行为。

当前 standalone 边界：

- `standalone/anieditorv5runtime-cc.ts` 可以 import Cocos Creator 内置 `"cc"`。
- standalone runtime 不能 import 仓库源码、Node、DOM、Pixi、package 路径或相对 runtime 文件。
- standalone runtime 不能绑定 `JsonAsset`，不能调用 `resources.load()`。
- standalone runtime 不能包含 decorated Component。
- standalone runtime 需要保持 ES2015 兼容，特别是不能出现 `.includes(...)`。
- `scripts/check-standalone.mjs` 是 standalone 边界守卫；新增 public API 时必须同步更新 required exports。

## 4. 行为契约

### 4.1 atlas 资源绑定

必须新增 atlas 资源源，支持宿主直接传：

```ts
assets: {
  atlas,
}
```

建议 public API：

```ts
export interface V5GCocosSpriteAtlasLike<TSpriteFrame = SpriteFrame> {
  getSpriteFrame(name: string): TSpriteFrame | null;
}

export interface V5GCocosSpriteAtlasAssetSource<TSpriteFrame = SpriteFrame> {
  atlas: V5GCocosSpriteAtlasLike<TSpriteFrame>;
}

export type V5GCocosAssetSource<TSpriteFrame = SpriteFrame> =
  | V5GCocosAssetResolver<TSpriteFrame>
  | V5GCocosSpriteAtlasAssetSource<TSpriteFrame>;
```

`V5GCocosPlayerOptions.assets` 和 `V5GCocosPlayerFactoryOptions.assets` 应改为 `V5GCocosAssetSource<TSpriteFrame>`。

必须保持旧 resolver 用法可用：

```ts
assets: {
  getSpriteFrame(assetPath, assetId) {
    return framesByAssetId.get(assetId) ?? null;
  },
}
```

原因：

- 旧测试和非 atlas 宿主仍可能需要 resolver。
- 新需求是降低 Cocos Creator 使用繁琐度，不要求破坏已有 resolver API。

atlas 绑定规则：

- 对每个 `project.assets[]`，runtime 使用 `filenameStem(asset.path)` 作为 `atlas.getSpriteFrame(...)` 的 key。
- 不允许 fallback 到 `asset.id`、`asset.originalName` 或其它猜测规则。
- 不允许缺某张图时创建 placeholder。
- 不允许缺某张图时跳过图层继续播放。
- 不允许 catch `atlas.getSpriteFrame(...)` 错误后吞掉并继续渲染。
- atlas `SpriteFrame` 可能被合图工具 trim/crop，runtime 不使用 atlas frame 的可读尺寸校验 JSON 尺寸；节点 content size 仍按 JSON `asset.width/height` 设置。
- 旧 resolver API 仍保留 SpriteFrame size mismatch 校验，用于非 atlas 直接贴图或宿主自管映射场景。

缺资源错误必须显式、可定位。atlas 路径的错误信息至少包含：

  - `asset.id`
  - `asset.path`
  - 实际查询的 atlas key，例如 `respin_asset_image_mqkv73wu_e`

建议错误文案形态：

```text
Missing Cocos SpriteFrame for V5G asset "asset_image_mqkv73wu_e" at "assets/..." using atlas key "respin_asset_image_mqkv73wu_e".
```

如果传入 atlas 对象为空或没有 `getSpriteFrame` 函数，必须在 `init()` 阶段显式失败，错误说明 `assets.atlas` 无效。不要静默切换到旧 resolver 或其它猜测路径。

### 4.2 stage 背景不渲染

runtime 必须停止创建 stage 背景节点。

新的 stage 子节点顺序应为：

```text
V5G Stage
  V5G Content
  V5G Particles
```

不再出现：

```text
V5G Background
```

必须删除或停用这些运行期行为：

- `V5GCocosPlayer.init()` 中创建 background node 的逻辑。
- `backgroundNode` 管理字段，如果已经没有用途就删除。
- `V5GCocosNodeDriver.createBackgroundNode(...)` 接口。
- `src/cocos/cocos-node-driver.ts` 中仅为背景服务的 `Graphics` import 和绘制逻辑。
- standalone runtime 中同等的 `createBackgroundNode(...)`、`Graphics` import 和背景绘制逻辑。

本任务默认只移除背景渲染，不扩大其它 stage schema 接收范围：

- `stage.width`、`stage.height`、`stage.coordinate`、`stage.duration` 仍是 runtime 必需字段。
- `project.stage.backgroundColor` 可以继续作为当前 JSON schema 的兼容字段存在。
- 如果执行时发现新版导出已经让 stage 背景字段变成可选、非颜色或更复杂对象，才能同步调整 `V5GStageConfig` / validation，并在任务报告中解释为什么放宽。不要为了去掉背景渲染，顺手放宽无关校验。

### 4.3 standalone 契约

standalone 是硬验收面，必须和模块化 runtime 完全一致。

必须同步更新：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/standalone.zip
```

standalone runtime 的 import 仍只能来自 `"cc"`。允许新增 `SpriteAtlas` import 或 type 使用，但不能引入相对 import、workspace import、Node、DOM、Pixi、`JsonAsset`、`resources.load()` 或 Cocos Component 装饰器。

`V5GPreview.example.ts` 必须改成 atlas 版示例：

```ts
@property(SpriteAtlas)
atlas: SpriteAtlas | null = null;
```

示例里必须先检查：

```ts
if (!this.atlas) {
  throw new Error("V5GPreview.atlas must be assigned.");
}
```

然后用：

```ts
assets: {
  atlas: this.atlas,
}
```

示例里不再暴露 `assetIds: string[]` 和 `spriteFrames: SpriteFrame[]`。如果 README 仍想保留手动 resolver 作为高级用法，应该放在文档里，而不是作为默认 example Component。

## 5. 实现步骤

### 5.1 现状复核

执行以下搜索，确认没有漏掉背景和资源绑定路径：

```bash
rg -n "assetIds|spriteFrames|getSpriteFrame|SpriteAtlas|V5G Background|createBackgroundNode|backgroundNode|Graphics|backgroundColor" packages/anieditorv5runtime-cc
```

复核 `standalone.zip` 当前内容：

```bash
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
```

### 5.2 新增 atlas asset source

修改：

```text
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
```

要求：

- 新增 `V5GCocosSpriteAtlasLike`、`V5GCocosSpriteAtlasAssetSource`、`V5GCocosAssetSource` 类型。
- `V5GCocosAssetResolver` 继续保留。
- `V5GCocosPlayerOptions.assets` 接受 resolver 或 atlas source。
- `V5GCocosPlayer.init()` 统一走一个内部 `resolveSpriteFrame(asset)` helper。
- resolver 分支继续调用 `getSpriteFrame(asset.path, asset.id)`。
- atlas 分支调用 `atlas.getSpriteFrame(filenameStem(asset.path))`。
- atlas 分支缺资源时使用包含 atlas key 的新错误文案。
- 类型守卫只能检查结构，例如 `typeof source.getSpriteFrame === "function"` 或 `typeof source.atlas?.getSpriteFrame === "function"`；不要依赖真实 Cocos class，以便 fake 测试和 standalone parity 可用。

不要把 atlas 逻辑放到 `src/core/*`。`src/core/*` 必须继续不知道 Cocos 和 SpriteAtlas。

### 5.3 移除运行期背景渲染

修改：

```text
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
```

要求：

- `init()` 里 stage 创建后直接创建 `V5G Content` 和 `V5G Particles`。
- 不再调用 `parseColorHex(project.stage.backgroundColor)` 来创建背景。
- 不再 append `V5G Background`。
- 删除 `backgroundNode` 字段和相关 cleanup。
- 删除 `V5GCocosNodeDriver.createBackgroundNode(...)`。
- `cocos-node-driver.ts` 删除 `Graphics` import 和 background 绘制函数。
- 保持 stage 节点尺寸、anchor、content 节点尺寸、particle root 节点尺寸不变。

不要删除 `parseColorHex(...)` public API，除非确认所有测试、README 和外部导出都不再需要它。即便不再用于背景渲染，它仍可能被 validation 或外部调试代码使用。

### 5.4 同步 standalone runtime

修改：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
```

要求：

- 把模块化代码中新增的 atlas source 类型和 resolver helper 同步到 standalone 单文件。
- 删除 standalone 中背景节点创建、`Graphics` import、`backgroundNode` 字段和 driver 的 `createBackgroundNode(...)`。
- `scripts/check-standalone.mjs` required exports 增加新的 public types，例如：
  - `export interface V5GCocosSpriteAtlasLike`
  - `export interface V5GCocosSpriteAtlasAssetSource`
  - `export type V5GCocosAssetSource`
- 如果新增了 public helper，例如 `createSpriteAtlasAssetResolver(...)`，也必须加入 required exports，并补 import/export 测试。
- standalone 仍必须通过 `.includes(...)` 禁用检查；新增代码不要使用 `.includes(...)`。

### 5.5 更新 standalone 示例

修改：

```text
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

要求：

- import `SpriteAtlas`。
- 删除 `assetIds` / `spriteFrames` 配置。
- 新增 `atlas` 配置。
- `start()` 中检查 `atlas` 非空。
- 使用 `assets: { atlas: this.atlas }` 创建 player。
- 保留 `projectJson` 由宿主绑定，runtime/example 不负责加载 JSON。
- 保留 `update(deltaTime)`、`onDestroy()`、range playback、segmented preview 等已有播放示例能力。
- 示例注释和错误文案必须强调：所有动画用到的资源必须已经在同一个 atlas 中，名字必须是 `filenameStem(asset.path)`。

### 5.6 更新测试

修改：

```text
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
```

必须覆盖：

- atlas source 会按 `filenameStem(asset.path)` 查询 SpriteFrame。
- atlas 缺少某个 frame 时显式失败，错误包含 asset id、asset path、atlas key。
- 旧 resolver 用法仍然可用，错误语义保持兼容。
- atlas source 不因 trim/crop 后的 SpriteFrame 可读尺寸小于 JSON 尺寸而失败，且节点尺寸仍使用 JSON `asset.width/height`。
- `V5GCocosPlayer.init()` 不再创建 `V5G Background`。
- stage 子节点顺序变为 `["V5G Content", "V5G Particles"]`。
- content 下仍保持每个 layer 后紧跟 `${layer.name} Particles`。
- standalone 和模块化 runtime 在 atlas 绑定、缺资源错误、无背景节点方面保持 parity。
- `V5GPreview.example.ts` 不再出现 `assetIds` / `spriteFrames`。

如果测试因为旧断言要求背景节点或显式 `assetIds` / `spriteFrames` 导致失败，要修改测试，不要为了测试保留不该保留的 runtime 行为。

### 5.7 更新 README

修改：

```text
packages/anieditorv5runtime-cc/README.md
```

必须同步说明：

- 推荐 Cocos Creator 项目使用 standalone 单文件。
- 默认资源绑定方式改为 `SpriteAtlas`。
- 示例代码使用 `assets: { atlas }`。
- 所有动画用到的资源必须在同一个 atlas 里。
- atlas 里的 sprite frame 名字必须是 `filenameStem(asset.path)`。
- 缺资源会显式失败，不会 placeholder、跳过或 fallback。
- 旧 resolver 仍可作为高级用法保留，但不是推荐路径。
- runtime 不再创建 `V5G Background`，也不绘制 `project.stage.backgroundColor`；背景由宿主场景或外部 UI 自己处理。
- 更新 `V5GPreview.example.ts` 的说明，删除 `assetIds + spriteFrames` 作为默认用法的描述。

### 5.8 重建 standalone.zip

完成代码和文档后，必须重建 standalone zip：

```bash
cd /Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
cd /Users/zerro/github.com/slotclientengine
```

`zipinfo -1` 预期只包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

如果将来 standalone 交付范围新增其它必需文件，必须在 README、测试或任务报告中说明原因；本任务不应该新增 Effect、shader 或图片资产。

## 6. 验收命令

在仓库根目录执行：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

最后执行：

```bash
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
git diff --check
git status --short
```

如果 package API 或 TypeScript exports 改动导致根构建链可能受影响，再补跑：

```bash
pnpm build
```

任务报告必须记录每条命令的结果。若某条命令因本机环境、Cocos Creator 不存在、网络或权限问题无法执行，必须写清楚未执行原因、错误摘要和替代验证；不能把未跑的命令写成通过。

## 7. 验收标准

必须全部满足：

- Cocos 宿主可以用 `assets: { atlas }` 创建 player。
- 对 `asset.path = "assets/respin_asset_image_mqkv73wu_e.png"`，runtime 查询的 atlas key 是 `respin_asset_image_mqkv73wu_e`。
- atlas 缺资源时显式失败，错误包含 asset id、asset path、atlas key。
- 旧 resolver API 仍可用。
- runtime 不再创建 `V5G Background`。
- stage 下只包含 `V5G Content` 和 `V5G Particles` 两类 runtime 子节点。
- runtime 不再 import 或使用 Cocos `Graphics` 画背景。
- `V5GPreview.example.ts` 默认只需要绑定 `projectJson`、`root`、`atlas`。
- `V5GPreview.example.ts` 不再要求手填 `assetIds` 和 `spriteFrames`。
- standalone runtime 和模块化 runtime 行为一致。
- `standalone.zip` 已重建，且不含旧文件或 macOS metadata。
- README 已同步新使用方式和背景不渲染规则。
- 没有为了测试保留旧背景节点或旧繁琐配置。
- 没有新增不必要 fallback、placeholder、资源名猜测或吞错逻辑。
- 若修改了仓库协作规则，`AGENTS.md` 和 `agents.md` 已同步；若未修改，任务报告中说明“不需要同步 agents 文件”的原因。

## 8. 任务报告要求

任务完成后新增：

```text
tasks/43-anieditorv5runtime-cc-atlas-prefix-assets-[utctime].md
```

报告必须用中文，至少包含：

- 实现摘要。
- 修改文件清单。
- atlas public API 的最终形态和示例代码。
- 缺资源 fail-fast 错误文案示例。
- stage 背景不再渲染的验证结果。
- standalone 文件和 `standalone.zip` 的更新结果。
- README 更新摘要。
- 测试和构建命令结果。
- `zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` 输出摘要。
- `git status --short` 最终摘要。
- 是否更新 `AGENTS.md` / `agents.md`；如果没有，说明原因。
- 已知限制或真实 Cocos Creator 3.8.6 人工验收事项。

## 9. 二次遗漏检查

提交最终报告前，执行者必须做一次遗漏检查，并把结果写入任务报告：

- 搜索 `assetIds`、`spriteFrames`：确认只在兼容测试、旧 API 文档或明确高级用法中出现，不再作为默认 Cocos 示例入口。
- 搜索 `V5G Background`、`createBackgroundNode`、`backgroundNode`、`Graphics`：确认 runtime 和 standalone 不再创建背景；如 `Graphics` 仍存在，必须说明它服务于什么非背景功能。
- 搜索 `getSpriteFrame(`：确认 atlas 分支只用 `filenameStem(asset.path)`，没有 asset.id/originalName fallback。
- 检查 `standalone/anieditorv5runtime-cc.ts` 与模块化源码的 public API、错误文案和行为一致。
- 检查 `scripts/check-standalone.mjs` required exports 覆盖新增 public API。
- 检查 `README.md` 不再宣称 runtime 会绘制 stage background。
- 检查 `standalone.zip` 已重建且内容干净。
- 检查 `AGENTS.md` 和 `agents.md` 是否需要同步；如果需要，两者内容必须一致。
- 检查没有修改与本任务无关的 `packages/vnicore`、`apps/anieditorv5viewer`、`docs/anieditor5/export*` 资源文件，除非报告中明确说明必要原因。
