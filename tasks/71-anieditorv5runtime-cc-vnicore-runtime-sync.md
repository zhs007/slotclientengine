# anieditorv5runtime-cc vnicore runtime sync 任务计划

## 1. 任务目标

更新 Cocos Creator 3.8.6 runtime：

```text
/Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
```

把任务 70 已经在 `packages/vnicore` 和 `apps/anieditorv5viewer` 落地的 VNI runtime/editor 新能力完整同步到 Cocos runtime。当前 Cocos 主要交付面仍然是 standalone 单文件和 zip：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone.zip
```

本任务必须覆盖任务 70 的全部新增/变更能力，不只覆盖单个显眼功能：

- `V5GLayerMaskConfig` / `mask`：支持 `legacy_alpha` 和 `precompose_light_alpha` 的运行期语义，至少要有真实 Cocos 可验证路径；如果 Cocos 3.8.6 公共 API 被最小探针证明无法可靠支持某个 mask composite，必须在 `validateCocosV5GProject(...)` / `init()` 显式失败，并在报告里把探针证据写清楚，不能静默跳过 mask。
- text layer：Cocos runtime 不再把 `text` 图层整体当 unsupported；需要提供 public API 让宿主把 text layer 替换/绑定为业务 `Node`、动态文本或图片节点，绑定节点必须继承该 text layer 的 transform、scale、rotation、opacity、visible、blendMode、渲染顺序和播放生命周期。
- `particle_stream`：同步类型、参数校验、deterministic 采样、live runtime、segmented hold 和 drain 语义。
- `chaser_light`：同步类型、参数校验、core sampler、Cocos 节点池渲染、`keepOriginal=false` 隐藏源图但保留走马灯的语义。
- 粒子新参数：`particles` 和相关粒子采样要同步 `emissionAngle`、`emissionSpreadAngle`、`trailCount`、`trailSpacing`、`trailFade`、`rotateParticles`、`randomRotation`、`randomRotationDegrees`、`spinSpeed` 等任务 70 参数。
- `bounce_in`：确认并测试 eased progress 语义与 `vnicore` 一致，不能退回原始 progress。
- diagnostics / 性能上限：Cocos 没有 DOM dataset，但必须提供可测试的 diagnostics 或等价状态查询，覆盖 particle、chaser、mask、text binding、mounted node、safe glow 等 runtime 计数；粒子、走马灯、mask 不能每帧无上限创建节点或纹理。
- 新导出 fixture：`number2.json`、`number3.json`、新版 `roundreel.json` 必须进入 Cocos runtime 测试矩阵，并与 `docs/anieditor5/export` 保持字节一致。
- `runtime_100` 资源 metadata：任务 54 已经固定 `runtime_100` 即使 `assetScale=1` 也要保留 `fileWidth/fileHeight/fileScale` 校验；本任务不得为了接收新 fixture 放松该合同。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、standalone 交付、真实 Cocos 验收/交接、文档同步、协作规则同步判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/71-anieditorv5runtime-cc-vnicore-runtime-sync-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/71-anieditorv5runtime-cc-vnicore-runtime-sync-260702-123456.md
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

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 运行时依赖。若确实新增或调整依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前根级协作规则文件是：

```text
agents.md
```

如果执行时又出现根级 `AGENTS.md`，且两个文件都存在，必须检查两者是否需要同步，并记录判断：

```bash
cmp -s AGENTS.md agents.md
```

当前 `agents.md` 已规定：更新 `packages/anieditorv5runtime-cc` 的 public runtime 行为时，必须同步模块化源码、`standalone/anieditorv5runtime-cc.ts`、`scripts/check-standalone.mjs`、standalone 测试和 `standalone.zip`。本任务会新增 public runtime 行为，执行时必须按这条规则完整同步。如果实现中新增了长期 Cocos 边界，例如 text layer 图片绑定不做 URL loader、某种 mask composite 的真实 Cocos 限制、diagnostics API 约定等，也必须同步更新 `agents.md` 并在报告中说明。

如果 `pnpm --filter ...` 或 `pnpm exec ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。禁止通过 missing placeholder、自动猜资源路径、静默忽略动画、未知类型退回 `idle`、未知 blend mode 退回 `normal`、吞掉 callback 错误等方式“跑通”。

## 3. 必须先阅读的上下文

执行时必须重新阅读当前实现，以实际代码为准。至少阅读：

```text
tasks/70-vnicore-runtime-editor-sync.md
tasks/70-vnicore-runtime-editor-sync-260702-040454.md
tasks/54-anieditorv5runtime-cc-vnicore-runtime-profile-sync.md
tasks/54-anieditorv5runtime-cc-vnicore-runtime-profile-sync-260626-095410.md
tasks/47-anieditorv5runtime-cc-safe-glow-sync.md
tasks/47-anieditorv5runtime-cc-safe-glow-sync-260625-042718.md
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/src/core/chaser-light-sampler.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/core/animation-sampler.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/particle-sampler.test.ts
packages/vnicore/tests/core/particle-runtime.test.ts
packages/vnicore/tests/core/chaser-light-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
docs/anieditor5/export/number2.json
docs/anieditor5/export/number3.json
docs/anieditor5/export/roundreel.json
docs/anieditor5/export/assets/*
packages/anieditorv5runtime-cc/package.json
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/particle-sampler.ts
packages/anieditorv5runtime-cc/src/core/particle-runtime.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/core/*
packages/anieditorv5runtime-cc/tests/cocos/*
packages/anieditorv5runtime-cc/tests/standalone/*
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
agents.md
```

建议用下面命令核对任务 70 提交内容：

```bash
git log --oneline --decorate -n 20
git show --stat --name-only --format=fuller HEAD -- tasks/70-vnicore-runtime-editor-sync.md packages/vnicore apps/anieditorv5viewer
git show --format= -- packages/vnicore/src/core/types.ts packages/vnicore/src/core/particle-sampler.ts packages/vnicore/src/core/chaser-light-sampler.ts packages/vnicore/src/core/validation.ts packages/vnicore/src/pixi/vni-player.ts
```

当前已观察到任务 70 对应提交为：

```text
212a57b1b60989b0d85f175fbe05d485b11475f6
```

如果执行时该 commit 已不可用，用下面命令按文件历史找任务 70 对应提交：

```bash
git log --oneline -- tasks/70-vnicore-runtime-editor-sync.md packages/vnicore/src/core/chaser-light-sampler.ts docs/anieditor5/export/number2.json docs/anieditor5/export/number3.json
```

## 4. 当前已知事实

### 4.1 任务 70 已完成的内容

任务 70 报告结论：

- 已把 `number2.json`、`number3.json`、新版 `roundreel.json` 同步到 `packages/vnicore` fixtures 和 `apps/anieditorv5viewer` bundled projects。
- 已把新增 7 张导出 PNG 同步到 viewer assets，并用 `cmp` 校验源文件和 viewer copy 一致。
- `packages/vnicore` 已同步 mask 类型、`particle_stream`、`chaser_light`、`bounce_in` eased progress、粒子新参数、走马灯 sampler/Pixi runtime、文字层 public binding API 和 diagnostics。
- `apps/anieditorv5viewer` 仅作为验证壳注册新项目、暴露文字层替换 UI，并调用 `VNIPlayer` public API；没有把动画、mask、粒子或 private Pixi tree 逻辑放到 viewer。
- 已补充 `packages/vnicore` 文档、examples 和 `agents.md` 协作边界。

任务 70 明确新增或确认的性能上限：

```text
particles burst 上限：320
particle_stream runtime/deterministic 上限：360
chaser_light.totalCount validation 和 runtime 上限：200
```

任务 70 新增 public API 在 Pixi runtime 中为：

```text
attachNodeToTextLayer(options): () => void
attachTextToTextLayer(options): { dispose(): void; setText(text: string): void }
attachImageToTextLayer(options): Promise<() => void>
```

Cocos runtime 不应照搬 `imageUrl` loader 语义；Cocos 资源加载、`JsonAsset` 读取、`SpriteAtlas` 绑定和 scene 组件仍属于宿主项目职责。Cocos 侧需要提供等价的 text layer 绑定能力，但不能在 runtime 内调用 `resources.load()`、访问 DOM、访问 Node builtins 或依赖 `@slotclientengine/vnicore`。

### 4.2 新导出样例

`docs/anieditor5/export/number2.json`：

- `schemaVersion`: `VNI_0.022`
- `exportProfile.id`: `runtime_100`
- `stage.duration`: `2.5`
- 包含一个 `image` 粒子图层和一个 `text` 图层。
- text 图层名和内容为 `文字`。
- text 图层动画顺序：
  - `pop`
  - `scale_up`
  - `idle`
  - `scale_out`

`docs/anieditor5/export/number3.json`：

- `schemaVersion`: `VNI_0.036`
- `exportProfile.id`: `runtime_100`
- 包含多个 image 图层。
- 包含 `mask.enabled=true` 且 `compositeMode="precompose_light_alpha"` 的光效遮罩样例。
- 包含 `particles` 新参数、`safe_glow`、`bounce_in`、`fade`、`move` 等动画。

`docs/anieditor5/export/roundreel.json`：

- schema 已更新。
- stage duration 当前为 `5`。
- 新增多个 layer group。
- 新增或更新 `safe_glow`、`blink`、`scale_out`。
- 新增 `chaser_light` 走马灯图层。

任务 70 新增并被新 fixture 使用的 7 张 PNG 资源为：

```text
docs/anieditor5/export/assets/1_asset_image_mqz5pzh7_p.png
docs/anieditor5/export/assets/2_asset_image_mqz76b37_19.png
docs/anieditor5/export/assets/3_asset_image_mquxm61x_3.png
docs/anieditor5/export/assets/3_asset_image_mqz642ku_s.png
docs/anieditor5/export/assets/big_asset_image_mr1utn0b_g.png
docs/anieditor5/export/assets/gx5_asset_image_mr1uxa3i_j.png
docs/anieditor5/export/assets/qq_202606291adsa71906_asset_image_mqz4fdt8_c.png
```

Cocos 手工导入时，`SpriteAtlas` 中的 frame 名必须严格等于 `filenameStem(asset.path)`，例如 `assets/3_asset_image_mqz642ku_s.png` 对应 atlas key `3_asset_image_mqz642ku_s`。不要新增 `assetId`、`originalName`、prefix 或路径猜测 fallback。

执行时必须复制并校验这些真实 fixture，而不是手写简化 JSON 绕过导出合同：

```bash
cmp docs/anieditor5/export/number2.json packages/anieditorv5runtime-cc/tests/fixtures/number2.json
cmp docs/anieditor5/export/number3.json packages/anieditorv5runtime-cc/tests/fixtures/number3.json
cmp docs/anieditor5/export/roundreel.json packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
```

### 4.3 当前 anieditorv5runtime-cc 状态

当前 `packages/anieditorv5runtime-cc` 已有：

- 模块化 runtime/adapter 源码。
- copyable standalone 单文件。
- `scripts/check-standalone.mjs` 单文件边界扫描。
- fake `cc` Vitest。
- standalone import / parity / player tests。
- `V5G_0.x` / `VNI_0.x` schema 接收。
- `runtime_50` / `runtime_100` 资源 metadata 和 atlas-first 资源绑定。
- `project.layerGroups + layer.groupId`。
- `normal/add/screen/multiply/lighten` blend mode。
- range playback、segmented playback、marker、completion listener、live particle drain。
- `particles`、`particle_twinkle`、`particle_wall`、`particle_combo`、`safe_glow`、`squash_stretch` 等前序能力。

当前已观察到的缺口：

- `src/core/types.ts` 还缺少 `V5GMaskCompositeMode`、`V5GLayerMaskConfig`、`layer.mask`、`particle_stream`、`chaser_light`。
- `src/core/validation.ts` 还缺少 mask 校验、`particle_stream` / `chaser_light` 必须参数和可选参数校验、`chaser_light.totalCount <= 200`。
- `src/core/animation-sampler.ts` / `project-sampler.ts` 需要与 `vnicore` 的 `bounce_in` eased progress、`chaser_light keepOriginal=false` 源图隐藏语义保持一致。
- `src/core/particle-sampler.ts` / `particle-runtime.ts` 需要同步 `particle_stream` 和粒子新参数，当前只覆盖了部分粒子参数。
- 缺少 `src/core/chaser-light-sampler.ts` 及对应导出。
- `validateCocosV5GProject(...)` 当前拒绝所有 `text` 图层，需要改为接受并通过 Cocos player 渲染/绑定。
- `V5GCocosPlayer` 当前 `ManagedLayer` 假设 image layer 必有 asset/spriteFrame，需要支持 text layer 和 mask source layer。
- `V5GCocosNodeDriver` 当前没有 text、mask、diagnostics 相关 driver 能力。
- `README.md` 当前把 `text` 图层列为明确不支持，需要更新。
- `standalone/anieditorv5runtime-cc.ts`、`scripts/check-standalone.mjs`、standalone tests、`standalone.zip` 必须跟随上述 public runtime 行为更新。
- `tests/standalone/standalone-import.test.ts` 当前 public API 断言还不包含 `particle_stream`、`chaser_light`、mask、text layer binding 和 diagnostics；执行时必须同步更新，避免 standalone 表面漏导出。

## 5. 必须实现的行为契约

### 5.1 schema、资源和边界

必须继续接受：

- `schemaVersion` 为 `V5G_0.x`
- `schemaVersion` 为 `VNI_0.x`
- `editor.name` 为 `victory_editor_v5_g`
- `editor.name` 为 `VNI`
- `engineTarget.name === "cocos_creator"`
- `engineTarget.version === "3.8.6"`
- `stage.coordinate === "center"`
- `exportProfile.id === "runtime_100"` 的新导出样例

必须继续显式失败：

- 非 `V5G_0.x` / `VNI_0.x` schema。
- 非 Cocos Creator engine target。
- 非 `center` 坐标。
- top-level `project.particles` 非空。
- `group` layer、非空 `parentId`、非空 `keyframes`。
- 未知资源、未知 animation type、未知 easing、未知 blend mode。
- 缺失必须 numeric param。
- numeric param 是字符串。
- Cocos SpriteFrame 可读尺寸与 JSON `fileWidth/fileHeight` 或 `width/height` 不一致。
- `runtime_100` fixture 缺失 `fileWidth/fileHeight/fileScale` metadata，或者 metadata 与真实 SpriteFrame 尺寸不一致。

禁止新增 runtime dependency 到 `@slotclientengine/vnicore`、`pixi.js`、DOM、Node builtins 或 workspace 源码路径。`vnicore` 只能作为语义参考和 fixture oracle。

模块边界必须继续保持：

- `src/core/*` 不得 import `"cc"`。
- `src/cocos/player.ts`、`src/index.ts` 不得 runtime import `"cc"`。
- 只有 `src/cocos/cocos-node-driver.ts` 和 standalone 单文件可以 runtime import `"cc"`。
- package 根入口不要为了方便新增真实 Cocos driver factory；真实 Cocos factory 保持在 `./cocos` 子入口和 standalone 文件中。

### 5.2 text layer

必须支持 `text` layer：

- `assertV5GProject(...)` / `validateV5GProject(...)` 接收 `text` layer，且 text layer 必须 `assetId === null`。
- `validateCocosV5GProject(...)` 不再因为 `layer.type === "text"` 直接失败。
- Cocos player 初始化时为 text layer 创建 runtime wrapper，并创建原始 `Label` 或等价文本节点显示 `layer.text ?? ""`。
- text layer 需要跟随 `sampleProjectAtTime(...)` 的 transform、scale、rotation、opacity、visible、blendMode 和 render order。
- `attachNodeToTextLayer(...)` 只能绑定到 text layer；错误 layer、未知 layer、重复 id、空 id 必须抛错。
- `attachTextToTextLayer(...)` 创建 runtime-owned dynamic text node，返回 `{ dispose, setText }`；`setText()` 只更新已有节点，不重建整棵树。
- Cocos runtime 不负责 URL loader。图片绑定必须使用已准备好的 `SpriteFrame` 或项目内 `assetId`，建议提供：
  - `attachSpriteFrameToTextLayer(...)`
  - `attachProjectAssetToTextLayer(...)`
- 默认隐藏原始 text child，`hideOriginal: false` 才保留。
- `dispose()`、`clearMountedNodes()`、`destroy()`、project re-init 必须清理 text layer binding，不泄露宿主节点引用。

### 5.3 mask

必须同步 mask 类型和校验：

- `V5GMaskCompositeMode = "legacy_alpha" | "precompose_light_alpha"`
- `V5GLayerMaskConfig`
- `V5GLayerConfig.mask?: V5GLayerMaskConfig`
- `mask.mode` 只支持 `"alpha"`。
- `mask.compositeMode` 只支持 `"legacy_alpha"` 和 `"precompose_light_alpha"`。
- `mask.enabled=true` 时必须有 `sourceLayerId`。
- mask source 不能引用自身，不能引用不存在的 layer。
- `showSourceLayer=false` 时，source layer 普通显示隐藏，但 source 仍可作为 mask source 参与采样。

Cocos 实现要求：

- 先写一个最小真实 Cocos 3.8.6 探针或手工验收步骤，确认 `Mask` / `Sprite` stencil / RenderTexture 路线的真实行为，不能只靠 fake `cc` 推断。
- `legacy_alpha` 优先用 Cocos 公共 API 支持。
- `precompose_light_alpha` 目标是支持任务 70 的 `number3.json`；实现不得每帧重建纹理。需要按 source/target asset、mask composite、关键 transform/opacity 状态维护 cache key，依赖变化时才刷新。
- 如果真实 Cocos 3.8.6 公共 API 证明无法可靠支持 `precompose_light_alpha`，必须在 Cocos-specific 校验或 `init()` 阶段显式失败，错误消息包含 layer id、sourceLayerId、compositeMode 和建议使用 `legacy_alpha` 或等待 Cocos mask adapter；不得假装支持。
- 如果支持 `precompose_light_alpha` 需要额外 Cocos `Effect`、shader、material 或 `.meta` 资产，必须先把这些资产纳入明确交付合同、README、standalone zip 内容和真实 Cocos 验收。若无法以 copyable standalone 方式可靠交付这些资产，本任务应选择 fail-fast 路线并记录原因，不能让 standalone 单文件隐式依赖仓库外资产。
- fake driver tests 必须覆盖 mask source 隐藏、缺 source 显式失败、非法 composite 显式失败、destroy 清理 mask 节点/cache。

### 5.4 particle_stream 和粒子新参数

必须同步 `vnicore` 的 core 语义：

- `V5GAnimationType` 新增 `particle_stream`。
- `REQUIRED_NUMERIC_PARAMS.particle_stream` 至少包含：
  - `spawnRate`
  - `lifetime`
  - `spread`
  - `speed`
  - `emissionAngle`
  - `emissionSpreadAngle`
  - `size`
  - `gravity`
  - `trailCount`
  - `trailSpacing`
  - `trailFade`
  - `randomRotationDegrees`
  - `spinSpeed`
- `OPTIONAL_BOOLEAN_PARAMS.particle_stream` 包含：
  - `fadeOut`
  - `rotateParticles`
  - `randomRotation`
- `particles` 支持任务 70 的可选 numeric params：
  - `emissionAngle`
  - `emissionSpreadAngle`
  - `trailCount`
  - `trailSpacing`
  - `trailFade`
  - `randomRotationDegrees`
  - `spinSpeed`
- deterministic sampling 和 live runtime 都必须支持 `particle_stream`。
- segmented playback hold 下，`keepParticlesAlive=true` 时 `particle_stream` 的 live particles 继续按真实 `deltaSeconds` 推进；end 段结束后进入 drain，排空后才触发 completion。
- sprite/node 数量必须有硬上限：`particles` burst 320，`particle_stream` 360。

### 5.5 chaser_light

必须同步 `chaser_light`：

- `V5GAnimationType` 新增 `chaser_light`。
- 默认 easing 为 `linear`。
- 必须 numeric params：
  - `totalCount`
  - `spacing`
  - `lightDuration`
  - `interval`
  - `trajectory`
  - `radius`
  - `centerX`
  - `centerY`
  - `endX`
  - `endY`
  - `curve`
  - `lightSize`
  - `dimAlpha`
- optional boolean params：
  - `keepOriginal`
- `totalCount` 必须在 validation 和 runtime 中限制为 `1..200`。
- 新增 `chaser-light-sampler.ts`，输出可由 Cocos 渲染的 sample：位置、scale、rotation、alpha、blendMode、isLit。
- Cocos player 为每个 image layer 维护 chaser light container 和 node pool，不能每帧无上限创建/销毁。
- `keepOriginal=false` 隐藏源图时，chaser light 仍必须可见。
- lit sprite 使用 `add` blend；dim sprite 使用 sampled layer blendMode，与 `vnicore` 保持一致。

### 5.6 bounce_in

必须确认：

- `bounce_in` 采样使用 eased progress。
- `bounce_in` 的 `fadeIn` 语义与 `vnicore` 一致。
- 不允许为了贴近旧测试把生产逻辑改回 raw progress；如果旧测试断言 raw progress，应修改测试。

### 5.7 diagnostics 和性能

Cocos runtime 没有 DOM dataset，因此必须提供可测试的等价 diagnostics API，例如：

```ts
player.getRuntimeDiagnostics()
```

返回值至少包含：

```text
particleSpriteCount
chaserLightSpriteCount
maskSpriteCount 或 maskNodeCount
textLayerBindingCount
mountedNodeCount
safeGlowSpriteCount
liveParticleCount
```

如果最终 API 名不同，必须在 README、standalone checker 和 standalone import tests 中固定下来。diagnostics 只用于调试和测试，不得改变播放语义。

性能边界：

- 不要每帧重建所有 `Label`、mask texture、chaser light sprite 或 particle node。
- runtime-owned 节点必须池化或复用；确实需要清理时必须在 `destroy()`、`clearMountedNodes()`、project re-init 中成对清理。
- 单次 `restart/play/seek` 多次循环后 diagnostics 计数不能持续增长。

## 6. 实施步骤

### 6.1 差异矩阵

先写一份临时差异矩阵，至少覆盖这些文件对：

```text
packages/vnicore/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/types.ts

packages/vnicore/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts

packages/vnicore/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts

packages/vnicore/src/core/particle-sampler.ts
packages/anieditorv5runtime-cc/src/core/particle-sampler.ts

packages/vnicore/src/core/particle-runtime.ts
packages/anieditorv5runtime-cc/src/core/particle-runtime.ts

packages/vnicore/src/core/chaser-light-sampler.ts
packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts

packages/vnicore/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/validation.ts

packages/vnicore/src/pixi/vni-player.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
```

矩阵结论要写入任务报告，分类为：

- 必须同步到 Cocos runtime 的纯 core 语义。
- 必须用 Cocos adapter 实现的渲染能力。
- Pixi/viewer 专属能力，Cocos 不应迁入。
- 真实 Cocos API 有不确定性的能力，需要探针和显式结论。

### 6.2 fixture 同步

同步真实导出 JSON：

```bash
cp docs/anieditor5/export/number2.json packages/anieditorv5runtime-cc/tests/fixtures/number2.json
cp docs/anieditor5/export/number3.json packages/anieditorv5runtime-cc/tests/fixtures/number3.json
cp docs/anieditor5/export/roundreel.json packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
```

同步后必须校验：

```bash
cmp docs/anieditor5/export/number2.json packages/anieditorv5runtime-cc/tests/fixtures/number2.json
cmp docs/anieditor5/export/number3.json packages/anieditorv5runtime-cc/tests/fixtures/number3.json
cmp docs/anieditor5/export/roundreel.json packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
```

不要让 Prettier 改这些 fixture。如果 package format check 会改 fixture 字节，需要在 `packages/anieditorv5runtime-cc/.prettierignore` 排除测试 fixture JSON，并在报告说明原因。

PNG 资源默认仍以 `docs/anieditor5/export/assets/*` 作为真实 Cocos 手工导入来源，不强制复制到 runtime package。若 fake/单元测试必须复制图片，必须保持字节一致并写入报告。

### 6.3 core 类型、校验和 sampler

修改：

```text
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/particle-sampler.ts
packages/anieditorv5runtime-cc/src/core/particle-runtime.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/index.ts
```

新增：

```text
packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts
packages/anieditorv5runtime-cc/tests/core/chaser-light-sampler.test.ts
```

要求：

- core 代码不得 import `"cc"`。
- core 代码不得 import `@slotclientengine/vnicore`。
- `validation.test.ts` 覆盖 `number2`、`number3`、`roundreel`。
- `animation-sampler.test.ts` 覆盖 `particle_stream`、`chaser_light` default easing 和 `bounce_in` eased progress。
- `particle-sampler.test.ts` 覆盖粒子新参数、stream deterministic cap、rotation/trail/fade 语义。
- `particle-runtime.test.ts` 覆盖 `particle_stream` live runtime 和 drain。
- `project-sampler.test.ts` 覆盖 `chaser_light keepOriginal=false` 时源图隐藏但走马灯保持 runtime-visible。

### 6.4 Cocos driver 和 player

修改：

```text
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
```

要求：

- `node-driver.ts` 扩展 text、mask、diagnostics 所需的最小 driver API；不要把 Cocos 具体类泄漏到 core。
- `cocos-node-driver.ts` 可以 import `"cc"`，但必须只用 Cocos Creator 3.8.6 可用 API。
- fake `cc` 只模拟真实 API 行为，不要为了测试方便创造生产不存在的能力。
- player 初始化支持 image layer 和 text layer。
- text driver 至少需要覆盖创建 `Label`/等价文本节点、设置文本、设置颜色/opacity、设置 content size/anchor，并能在 tests 中证明 `setText()` 不重建 player。
- mask driver 至少需要覆盖创建/更新/清理 mask 节点或显式 fail-fast 路线；如果真实 Cocos 路线需要 `Mask`、`Graphics`、`RenderTexture`、`Material`、`Effect` 中任意 API，fake `cc` 中必须有与真实 API 形状一致的最小模拟。
- player render order 至少保持：

```text
V5G Stage
  V5G Content
    V5G Group <id>
      <image layer node 或 text layer wrapper>
      <layer Safe Glow>
      <layer Chaser Light>
      <layer Particles>
    V5G Slot <after> -> <before>
  V5G Particles
```

- `V5G Particles` 仍可保留为空占位；真实 layer particle/chaser/mask 节点必须位于正确 group 内。
- `destroy()` 必须清理 layer nodes、safe glow nodes、chaser nodes、particle nodes、mask nodes/cache、text binding registry、mounted nodes、playback events 和 complete listeners。

### 6.5 standalone 同步

修改：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
```

standalone 单文件硬边界：

- 只能 import Cocos Creator 内置 `"cc"`。
- 不能有相对 import、workspace import、Node builtins、Pixi、DOM、`window`、`document`。
- 不能绑定 `JsonAsset`。
- 不能调用 `resources.load()`。
- runtime 单文件不能包含 decorated Component。
- standalone 需要保持 ES2015 兼容，特别是不能出现 `.includes(...)`。
- 不能依赖 `dist/` 或 `src/` 路径。

`scripts/check-standalone.mjs` 必须新增 required exports / snippets，至少覆盖：

- `V5GMaskCompositeMode`
- `V5GLayerMaskConfig`
- `particle_stream`
- `chaser_light`
- `sampleChaserLightSpritesForLayer`
- text layer binding public API
- diagnostics public API
- mask 校验/应用相关关键 snippet
- `precompose_light_alpha`
- `MAX_STREAM_PARTICLE_SPRITES`
- `MAX_CHASER_LIGHT_SPRITES`
- standalone `SUPPORTED_ANIMATION_TYPES` 包含 `particle_stream` 和 `chaser_light`
- standalone `PARTICLE_ANIMATION_TYPES` 包含 `particle_stream`
- `V5GCocosPlayer.prototype.attachNodeToTextLayer`
- `V5GCocosPlayer.prototype.attachTextToTextLayer`
- text 图片绑定 API 的最终命名
- `V5GCocosPlayer.prototype.getRuntimeDiagnostics` 或最终 diagnostics API 名

`standalone-parity.test.ts` 必须把 `number2`、`number3`、`roundreel` 放进 fixture 矩阵，证明 standalone 与模块化源码同样接收并采样这些导出。

### 6.6 README 和示例

修改：

```text
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

README 必须更新：

- 从“不支持 text 图层”改为说明 text layer 支持范围和绑定 API。
- 新增 `mask` 支持范围；如果某个 composite 只能 fail-fast，必须明确写出限制和错误位置。
- 新增 `particle_stream`、`chaser_light`、粒子新参数和性能上限。
- 说明 Cocos runtime 不负责 URL loader、`resources.load()`、`JsonAsset` 读取、bundle manifest 或 profile 选择。
- 说明 standalone 是主要交付面，真实 Cocos Creator 3.8.6 验收是 fake tests 之外的独立验收面。
- 说明 `runtime_100` 资源 metadata 不因 `assetScale=1` 放松；atlas frame 名仍使用 `filenameStem(asset.path)`。
- 如果 mask 支持需要额外 Effect/shader/material 资产，README 必须列出这些文件和导入步骤；如果本任务选择 fail-fast，README 必须列出失败条件和错误消息入口。

`V5GPreview.example.ts` 至少展示：

- 导入 standalone runtime。
- `SpriteAtlas` 绑定。
- `player.update(deltaTime)` 驱动。
- `onDestroy()` 调用 `player.destroy()`。
- 一个 text layer dynamic text 绑定示例。
- 可选展示 `player.getRuntimeDiagnostics()` 或最终 diagnostics API，用于真实 Cocos 验收连续 restart/seek 后计数不增长。
- 不调用 `resources.load()`。

### 6.7 格式化边界

当前 `packages/anieditorv5runtime-cc/package.json` 使用：

```text
prettier --check .
```

执行时必须确认是否存在：

```text
packages/anieditorv5runtime-cc/.prettierignore
```

若不存在或内容不足，新增/更新它，至少排除：

```text
coverage
dist
node_modules
standalone.zip
tests/fixtures/*.json
```

排除 fixture JSON 的原因是它们必须与 `docs/anieditor5/export/*.json` 字节一致，不应被 Prettier 或测试手改。

### 6.8 重建 standalone.zip

完成源码和 standalone 同步后重建 zip：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
```

预期 zip 只包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

如果本任务最终证明 mask 支持必须交付额外 Effect/shader/material 资产，不能继续沿用这个两文件预期；必须同步更新本节 zip 内容合同、`scripts/check-standalone.mjs`、README、真实 Cocos 导入步骤和任务报告。若无法做到这组同步，选择显式 fail-fast 路线，保持 zip 两文件合同不变。

`standalone.zip` 被 `.gitignore` 忽略也必须重建和直接验证。不要用 `git status` 证明 zip 已交付。

### 6.9 agents.md 同步判断

执行时必须检查 `agents.md` 现有规则是否已经覆盖本任务新增长期规则。

通常必须考虑新增或更新的规则：

- `packages/anieditorv5runtime-cc` 同步 `vnicore` public runtime 行为时，standalone 单文件、checker、standalone 测试和 `standalone.zip` 是主交付面。
- Cocos runtime 支持 text layer 绑定，但不提供 URL loader、`resources.load()` 或 `JsonAsset` 绑定。
- Cocos mask 如果存在被证明无法支持的 composite，必须 fail-fast 并记录真实 Cocos 证据，不能静默跳过。

如果新增规则，修改：

```text
agents.md
```

并在报告中说明是否更新以及原因。

## 7. 验收命令

### 7.1 focused package 验收

必须通过：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc build
```

如果 package wrapper 出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，允许使用 package-local binaries 或加 `CI=true` 的等价命令，但报告必须写明替代命令。

focused package 验收必须保留 coverage 输出。当前 `packages/anieditorv5runtime-cc/vitest.config.ts` 尚未设置 coverage threshold，本任务不强制新增阈值；但不得通过缩小 `coverage.include`、扩大 `coverage.exclude` 或删除 tests 来掩盖新增代码缺测。报告必须记录 `test` 输出中的 coverage 摘要；如果 coverage 明显下降，应补测试而不是绕过统计。

### 7.2 fixture 和 zip 验收

必须通过：

```bash
cmp docs/anieditor5/export/number2.json packages/anieditorv5runtime-cc/tests/fixtures/number2.json
cmp docs/anieditor5/export/number3.json packages/anieditorv5runtime-cc/tests/fixtures/number3.json
cmp docs/anieditor5/export/roundreel.json packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
test -f packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
git diff --check
```

### 7.3 根级验收

至少尝试：

```bash
CI=true pnpm build
```

可选但建议尝试：

```bash
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm format:check
```

如果根级命令因无关历史问题失败，不能把它当作本任务通过证据。报告必须写清楚：

- 失败命令。
- 失败包。
- 失败原因。
- 为什么判断不是本任务引入。
- 本任务相关 package 命令是否全部通过。

### 7.4 真实 Cocos Creator 3.8.6 验收/交接

如果本机有 Cocos Creator 3.8.6，必须做真实导入验收；如果本机没有，报告必须把下面清单作为明确手工交接，不能把 fake tests 等同于真实编辑器验收。

执行或交接前先记录 Cocos 可用性：

```bash
command -v CocosCreator || true
CocosCreator --version || true
```

如果本机 Cocos Creator 不是通过 `CocosCreator` 命令暴露，报告中写明实际检查路径、版本或不可用原因。

手工导入文件：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
docs/anieditor5/export/number2.json
docs/anieditor5/export/number3.json
docs/anieditor5/export/roundreel.json
docs/anieditor5/export/assets/1_asset_image_mqz5pzh7_p.png
docs/anieditor5/export/assets/2_asset_image_mqz76b37_19.png
docs/anieditor5/export/assets/3_asset_image_mquxm61x_3.png
docs/anieditor5/export/assets/3_asset_image_mqz642ku_s.png
docs/anieditor5/export/assets/big_asset_image_mr1utn0b_g.png
docs/anieditor5/export/assets/gx5_asset_image_mr1uxa3i_j.png
docs/anieditor5/export/assets/qq_202606291adsa71906_asset_image_mqz4fdt8_c.png
```

真实 Cocos 验收点：

- `number2` 能初始化；原始 text layer 可见并跟随 `pop + scale_up + idle + scale_out`。
- `attachTextToTextLayer(...)` 能动态更新文本，`setText()` 不重建 player。
- `attachNodeToTextLayer(...)` / 图片绑定 API 能让宿主节点继承 text layer 播放生命周期。
- `number3` 能初始化；mask source `showSourceLayer=false` 时源普通显示隐藏但仍作为 mask source；`precompose_light_alpha` 若支持，视觉正确且无持续增长；若不支持，初始化显式失败且错误说明准确。
- `particle_stream` 在 segmented hold 下持续发射，end 后 drain 完成才触发 completion。
- `roundreel` 的 `chaser_light` 可见，`keepOriginal=false` 时源图隐藏但走马灯保留。
- 连续 `restart/play/seek` 至少 5 次后 diagnostics 计数不持续增长。
- 发布构建不能出现“可以玩但控制台红错”的完成状态；红错必须作为缺陷处理或在报告中明确阻塞。

## 8. 任务报告要求

完成后新增：

```text
tasks/71-anieditorv5runtime-cc-vnicore-runtime-sync-[utctime].md
```

报告必须使用中文，并至少包含：

- UTC 完成时间。
- 任务计划路径。
- 实现摘要。
- 任务 70 差异矩阵结论。
- 修改文件列表。
- 新增/变更 public API。
- standalone 同步摘要：单文件、checker、standalone tests、zip。
- fixture 同步结果和 `cmp` 命令结果。
- mask 支持结论：`legacy_alpha`、`precompose_light_alpha` 分别是支持、fail-fast 还是阻塞；如果 fail-fast/阻塞，必须附真实 Cocos 探针或原因。
- 性能上限和 diagnostics 结果。
- `agents.md` 是否更新及原因。
- `pnpm-lock.yaml` 是否变化。
- 完整验收命令和结果。
- `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test` 的 coverage 摘要。
- `standalone.zip` 的 `zipinfo -1` 输出。
- 真实 Cocos Creator 3.8.6 验收结果和版本探针；如果未执行，写明手工交接文件和验收清单。
- 第二遍遗漏检查结果。
- 当前 `git status --short --untracked-files=all` 摘要。

## 9. 第二遍遗漏检查

提交前必须逐项检查：

- [ ] 是否只看了任务 70 标题，没有阅读 `tasks/70-vnicore-runtime-editor-sync-260702-040454.md` 和对应提交内容。
- [ ] 是否把 `mask`、text layer、`particle_stream`、`chaser_light`、`bounce_in`、粒子新参数、diagnostics 都纳入计划和实现。
- [ ] 是否把 `number2.json`、`number3.json`、`roundreel.json` 同步进 Cocos fixture，并用 `cmp` 证明字节一致。
- [ ] 是否把任务 70 新增的 7 张 PNG 作为真实 Cocos 手工导入资源列清楚，并确认 atlas key 仍是 `filenameStem(asset.path)`。
- [ ] 是否保留 `runtime_100` 的 `fileWidth/fileHeight/fileScale` metadata 校验，没有为了接收新 fixture 放松资源合同。
- [ ] 是否仍然在 README 或 validation 中把全部 `text` 图层列为 Cocos unsupported。
- [ ] 是否为 text layer 提供了 public binding API，而不是让宿主操作 runtime 私有节点。
- [ ] 是否把 Cocos runtime 不负责 URL loader、`resources.load()`、`JsonAsset` 的边界写进 README/示例。
- [ ] 是否确认 `precompose_light_alpha` 是真实支持还是显式 fail-fast，不能静默跳过。
- [ ] 如果 mask 需要 Effect/shader/material 资产，是否已经把资产交付、README、standalone zip 和真实 Cocos 验收一起纳入；否则是否选择了显式 fail-fast。
- [ ] 是否更新 fake `cc` 以模拟真实 API，而不是为了测试创造生产不存在的行为。
- [ ] 是否保持 `safe_glow`、chaser、particle、mask、text binding 的节点清理成对。
- [ ] 是否确认 `src/core/*`、`src/cocos/player.ts`、`src/index.ts` 没有 runtime import `"cc"`，真实 Cocos factory 仍在 `./cocos` 子入口或 standalone。
- [ ] 是否检查 `src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts`、`tests/standalone/standalone-import.test.ts` 的 public export 面。
- [ ] 是否更新 `scripts/check-standalone.mjs`，让 standalone 漏同步会失败。
- [ ] 是否跑了 `typecheck:standalone`、`standalone:check` 和 standalone tests。
- [ ] 是否重建并验证 `standalone.zip`，而不是只改源码。
- [ ] 是否确认 `.prettierignore` 不会让 `coverage`、`dist`、`standalone.zip` 或字节级 fixture 破坏 format check。
- [ ] 是否记录 focused package test 的 coverage 摘要，并避免通过调整 coverage include/exclude 掩盖缺测。
- [ ] 是否检查 `agents.md` 是否需要更新，并在报告说明。
- [ ] 是否运行 `git diff --check`。
- [ ] 是否把真实 Cocos Creator 验收和 monorepo fake tests 分开记录。

只有上述检查完成，并且 focused package 验收、standalone 验收、fixture 验收和报告都完成后，任务才算结束。
