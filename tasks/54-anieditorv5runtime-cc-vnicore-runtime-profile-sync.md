# anieditorv5runtime-cc vnicore runtime profile sync 任务计划

## 1. 任务目标

更新 Cocos Creator 3.8.6 runtime：

```text
/Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
```

把任务 53 已经在 `packages/vnicore` 和 `apps/anieditorv5viewer` 落地、但尚未同步到 Cocos runtime 的 VNI 运行时语义同步过来。当前 Cocos 主要交付面是 standalone 单文件和 zip：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone.zip
```

本任务至少必须覆盖以下任务 53 变化：

1. `safe_glow` 运行时副本继承图层 `blendMode`，不能继续固定为 `normal`。
2. `VNI_0.020` / `runtime_100` / `roundreel` 运行包可以被 Cocos runtime 严格接收和播放：
   - `project.schemaVersion === "VNI_0.020"`。
   - `project.editor.name === "VNI"`。
   - `project.engineTarget.name === "cocos_creator"`。
   - `project.engineTarget.version === "3.8.6"`。
   - `project.exportProfile.id === "runtime_100"`。
   - `project.exportProfile.purpose === "runtime"`。
   - `project.exportProfile.assetScale === 1`。
   - 动画包含 `safe_glow`，图层 `blendMode` 包含 `add`。
3. 对任务 53 提到的其它 vnicore/viewer 改动做逐项分类，明确哪些属于 Cocos runtime 必须同步，哪些是 Pixi viewer / bundle 注册逻辑，哪些因为 Cocos runtime 边界不应迁入。
4. 同步模块化源码、standalone 单文件、`scripts/check-standalone.mjs`、standalone 测试、README 和 `standalone.zip`。
5. 保持 Cocos runtime 的 fail-fast 边界：不做缺资源 placeholder，不自动猜路径，不因为测试难写而改变生产合同，不把未知或不可靠行为静默退回 normal。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、standalone 交付、文档同步、协作规则同步判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/54-anieditorv5runtime-cc-vnicore-runtime-profile-sync-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/54-anieditorv5runtime-cc-vnicore-runtime-profile-sync-260626-123456.md
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
```

当前实际协作规则文件是：

```text
agents.md
```

如果执行时又出现 `AGENTS.md`，且两个文件都存在，则必须检查两者是否需要同步，并记录判断：

```bash
cmp -s AGENTS.md agents.md
```

当前 `agents.md` 已规定：更新 `packages/anieditorv5runtime-cc` 的 public runtime 行为时，必须同步模块化源码、`standalone/anieditorv5runtime-cc.ts`、`scripts/check-standalone.mjs`、standalone 测试和 `standalone.zip`。如果本任务只是同步任务 53 的 runtime 语义，通常不需要更新 `agents.md`；如果实现中新增了长期协作规则，必须同步更新并在报告中说明。

当前 `packages/anieditorv5runtime-cc/package.json` 的格式化脚本是 `prettier --check .`，仓库规则要求 Prettier 不覆盖 `dist/`、`coverage/` 等生成物。执行时必须确认 `packages/anieditorv5runtime-cc/.prettierignore` 至少继续排除 `coverage`、`dist`、`node_modules`。如果 `standalone.zip` 或其它生成物导致 format check 异常，应更新 `.prettierignore`，不要删除格式化验收或扩大生产代码改动。

## 3. 必须先阅读的上下文

执行时必须重新阅读当前实现，以实际代码为准。至少阅读：

```text
tasks/53-vnicore-runtime-bundle-profiles.md
tasks/53-vnicore-runtime-bundle-profiles-260626-081442.md
tasks/47-anieditorv5runtime-cc-safe-glow-sync.md
tasks/47-anieditorv5runtime-cc-safe-glow-sync-260625-042718.md
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/safe-glow-sampler.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/asset-manifest.ts
packages/vnicore/tests/core/safe-glow-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/core/asset-manifest.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/tests/fixtures/export/roundreel.json
docs/anieditor5/export/roundreel.json
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/safe-glow-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/.prettierignore
packages/anieditorv5runtime-cc/tests/core/safe-glow-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/README.md
agents.md
```

建议用下面命令核对任务 53 提交内容：

```bash
git log --oneline --decorate -n 20
git show --stat --name-only --format=fuller d090392
git show --format= -- packages/vnicore/src/core/safe-glow-sampler.ts packages/vnicore/src/core/validation.ts packages/vnicore/tests/core/safe-glow-sampler.test.ts packages/vnicore/tests/core/validation.test.ts packages/vnicore/tests/pixi/vni-player.test.ts
```

如果执行时 `d090392` 已不可用，用下面命令按文件历史找任务 53 对应提交：

```bash
git log --oneline -- tasks/53-vnicore-runtime-bundle-profiles.md packages/vnicore/src/core/safe-glow-sampler.ts docs/anieditor5/export/roundreel.json
```

## 4. 当前已知事实

### 4.1 任务 53 已完成的内容

任务 53 报告结论：

- `roundreel` 最终作为 `docs/anieditor5/export` 的单项目 JSON + 共享 `assets/` 资源池接入，而不是作为新的长期 `export2` bundle profile 接入。
- `runtime_100`、`assetScale`、`purpose` 等运行包语义来自 JSON 的 `exportProfile`，不从目录名或文件名推断。
- `safe_glow` 在 `packages/vnicore` 中仍是同图副本、缩放和透明度呼吸，不使用滤镜或模糊；副本现在继承图层 `blendMode`，不再固定为 `normal`。
- 旧 `docs/anieditor5/export2` 的 `bigwin edit_full/runtime_50` 保留为非回归 fixture。
- 任务 53 未修改 `packages/anieditorv5runtime-cc`、standalone runtime 或 `standalone.zip`。

任务 53 的核心修改文件包括：

```text
packages/vnicore/src/core/safe-glow-sampler.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/tests/core/safe-glow-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/tests/fixtures/export/roundreel.json
docs/anieditor5/export/roundreel.json
docs/anieditor5/export/assets/gx_6_asset_image_mqthi919_1e.png
docs/anieditor5/export/assets/image_asset_image_mqtjdi3v_3.jpg
```

### 4.2 roundreel 运行包事实

当前 `docs/anieditor5/export/roundreel.json` 摘要：

```text
schemaVersion: VNI_0.020
editor.name: VNI
editor.version: VNI_0.020
engineTarget.name: cocos_creator
engineTarget.version: 3.8.6
name: roundreel
stage: 2000 x 2000
duration: 3.1
exportProfile.id: runtime_100
exportProfile.purpose: runtime
exportProfile.assetScale: 1
assetCount: 2
layerGroupCount: 1
layerCount: 3
project.particles: 0
blendModes: add
animationTypes: rotate, safe_glow, blink, scale_out
```

这份 JSON 可以作为 Cocos runtime 的真实 fixture。图片资源位于：

```text
docs/anieditor5/export/assets/gx_6_asset_image_mqthi919_1e.png
docs/anieditor5/export/assets/image_asset_image_mqtjdi3v_3.jpg
```

如果测试需要复制 fixture，目标路径使用：

```text
packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
```

不要为了让测试简单而改 `roundreel.json` 的 schema、profile、blendMode 或动画类型。

### 4.3 当前 anieditorv5runtime-cc 缺口

当前已观察到的缺口：

- `packages/anieditorv5runtime-cc/src/core/safe-glow-sampler.ts` 中：
  - `VNISafeGlowLayerSampleState` 没有 `blendMode` 字段。
  - `VNISafeGlowSpriteSample.blendMode` 类型仍是 `"normal"`。
  - `sampleSafeGlowSprite(...)` 仍返回 `blendMode: "normal"`。
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 中同样存在 standalone 版本的固定 `normal`。
- `packages/anieditorv5runtime-cc/tests/core/safe-glow-sampler.test.ts` 仍有 “fixed normal blend” 断言。
- `packages/anieditorv5runtime-cc/tests/cocos/player.test.ts` 和 `tests/standalone/standalone-player.test.ts` 对 safe glow 节点的 blend mode 断言仍偏向 normal。
- `packages/anieditorv5runtime-cc/README.md` 多处描述 `safe_glow` 使用 normal blend 或不需要特殊 blend mode，需要改为继承图层 `blendMode`，并保留 fail-fast Cocos blend 写入说明。
- `packages/anieditorv5runtime-cc/tests/fixtures/` 尚未包含 `roundreel.json`。
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts` 的 fixture 列表尚未包含 `roundreel`。
- `scripts/check-standalone.mjs` 只检查了 `safe_glow` 存在，没有检查 safe glow blendMode 继承语义。
- `packages/anieditorv5runtime-cc/src/core/index.ts` 当前已经导出 `safe-glow-sampler.ts`，本任务通常不需要新增导出；但执行者必须检查 `src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts` 和 `tests/standalone/standalone-import.test.ts`，确认 public API / standalone import 面没有漏同步。

当前 `packages/anieditorv5runtime-cc/src/cocos/player.ts` 已经在 `applySafeGlowSample(...)` 里调用：

```text
getCocosBlendModeConfig(safeGlow.blendMode)
```

因此生产实现的主要同步点很可能是 core sampler 和 standalone 复制体；但执行时必须重新核对当前代码，不能只按这个观察改动。

### 4.4 Cocos runtime 的边界

`packages/anieditorv5runtime-cc` 不是 Pixi runtime，也不是 viewer。它的长期边界是：

- 不运行时依赖 `@slotclientengine/vnicore`。
- 不运行时依赖 `pixi.js`。
- standalone 单文件只允许 import `"cc"`。
- runtime 只接收宿主已经准备好的 `V5GProjectConfig` 对象。
- runtime 不读取、导入、加载或解析 `project.json`。
- runtime 不解析 bundle manifest，不负责选择 `edit_full` / `runtime_50` / `runtime_100` profile。
- JSON 绑定、`JsonAsset` 读取、资源导入、profile 选择、Canvas/root 缩放、场景背景和屏幕适配属于宿主 Cocos 项目职责。

所以任务 53 的 viewer manifest 注册能力不要直接搬进 runtime。Cocos runtime 的同步目标是：当宿主已经选中并传入 `VNI_0.020` / `runtime_100` project 时，runtime 按 JSON 合同严格解析、校验、渲染和暴露错误。

## 5. 范围和非目标

### 5.1 必须同步

必须同步到模块化源码和 standalone：

- `VNISafeGlowLayerSampleState.blendMode: V5GBlendMode`。
- `VNISafeGlowSpriteSample.blendMode: V5GBlendMode`。
- `sampleSafeGlowSprite(...)` 使用 `sampledLayer.blendMode`。
- `safe_glow` 节点最终调用 `getCocosBlendModeConfig(safeGlow.blendMode)`，并在真实 Cocos blend 写入失败时显式抛错。
- `roundreel.json` 作为 `VNI_0.020` / `runtime_100` / `safe_glow + add blend` fixture。
- generic validation、Cocos validation、fake driver player、standalone parity、standalone fake `cc` player 测试覆盖 `roundreel` 和 inherited blend。
- public export 面检查：`src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts`、standalone required exports 和 `standalone-import.test.ts`。
- README、standalone checker、`standalone.zip`。
- `.prettierignore` / format check 生成物边界：`dist`、`coverage`、`node_modules` 不应被 Prettier 扫描。

### 5.2 不应同步或只做边界说明

以下内容不应直接迁入 Cocos runtime：

- `apps/anieditorv5viewer` 的 project selector、summary、diagnostics 或 bundled project registry。
- `packages/vnicore/src/core/asset-manifest.ts` 的 Vite URL manifest 行为。
- `export2/manifest.json` 自动读取或 profile 自动选择。
- 从目录名或文件名推断 `runtime_100`、`assetScale` 或 `purpose`。
- 为 Cocos runtime 新增 `@slotclientengine/vnicore` workspace 依赖。
- 为了绕过 Cocos Creator 限制而伪造 `apps/anieditorv5viewer-cc`。

如果执行者认为需要新增纯 manifest 类型或校验 helper，必须先证明它不会破坏 “runtime 不负责 profile 选择” 的边界，并在报告中解释为什么这不是 loader 或自动选择行为。默认实现不需要新增这类 helper。

### 5.3 fail-fast 要求

不允许引入以下兜底：

- 缺失 SpriteFrame 时创建 placeholder。
- atlas 查不到 frame 时退回 `asset.id`、`originalName` 或其它猜测 key。
- blend mode 写入失败时静默退回 normal。
- `safe_glow` 采样失败时吞错或当作 idle。
- `VNI_0.020` 校验失败时降低 schema 或删字段。
- `roundreel` 播放测试失败时修改 fixture 绕过真实导出。

如果测试导致一些奇怪写法，优先修改测试、fake driver 或断言结构，不要改不该改的生产逻辑，以免后续出现问题难查。

## 6. 实施步骤

### 6.1 预检查

在仓库根目录执行：

```bash
git status --short --untracked-files=all
git diff --stat
git log --oneline --decorate -n 20
```

记录已有用户改动，不要回滚不属于本任务的文件。

确认 standalone zip 当前内容：

```bash
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
```

预期 zip 最终只能包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

### 6.2 做任务 53 delta 分类

先按任务 53 报告和提交内容列出分类，报告中也要保留这张分类表。

建议分类：

| 任务 53 项 | Cocos runtime 处理 |
| --- | --- |
| `safe_glow` 继承 layer `blendMode` | 必须同步到 core sampler、Cocos player 测试、standalone、README、checker |
| `VNI_0.020` / `runtime_100` / `roundreel` | 必须作为真实 fixture 验收，profile 语义来自 JSON，不从 path 推断 |
| `validateV5GBundleManifest(...)` path 安全校验 | 默认不迁入 runtime；Cocos runtime 不解析 manifest，报告说明边界 |
| viewer manifest-driven profile registry | 不迁入 runtime；属于 viewer / 宿主 profile 选择 |
| profile-scoped Vite asset URL resolver | 不迁入 runtime；Cocos 使用 SpriteAtlas / resolver，缺资源显式失败 |
| `top-level project.particles` 继续 fail-fast | 保持现有 Cocos fail-fast，不因为任务 53 放宽 |
| vnicore docs/examples safe_glow 文案 | 同步 Cocos README 中 safe_glow 文案 |

这一步的验收不是写代码，而是防止“只改 safe_glow 一个点”后漏掉 `roundreel` 和 boundary 说明。

### 6.3 同步 core safe_glow 语义

修改：

```text
packages/anieditorv5runtime-cc/src/core/safe-glow-sampler.ts
```

要求：

- 从 `./types.js` 引入 `V5GBlendMode`。
- `VNISafeGlowLayerSampleState` 增加：

```ts
blendMode: V5GBlendMode;
```

- `VNISafeGlowSpriteSample.blendMode` 从 `"normal"` 改成：

```ts
blendMode: V5GBlendMode;
```

- `sampleSafeGlowSprite(...)` 返回：

```ts
blendMode: sampledLayer.blendMode;
```

不要改变 alpha、scale、rotation、起始帧、`spread <= 0.001` 或 `alpha <= 0.002` 的现有语义。

确认 `SampledLayerState` 已经包含 `blendMode`，且 `sampleProjectAtTime(...)` 已经把 `layer.blendMode` 放入 sampled layer。若当前实现已经存在，则只补测试，不重复抽象。

### 6.4 同步 Cocos player 渲染验收

检查：

```text
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
```

要求：

- safe glow 节点最终应用 `safeGlow.blendMode` 对应的 Cocos blend config。
- 如果 Cocos Sprite / material pass 无法写入目标 blend state，沿用现有显式抛错，不退回 normal。
- 节点创建时临时设置 normal 可以保留，但同帧必须被 sample blend 覆盖；测试必须断言最终节点 blend 是 layer blend。
- 不需要新增 shader、Effect、滤镜或 blur。

### 6.5 添加 roundreel fixture

新增或同步：

```text
packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
```

来源使用：

```text
docs/anieditor5/export/roundreel.json
```

不要复制图片到 package fixture；图片源仍在：

```text
docs/anieditor5/export/assets/
```

测试中如需检查 asset path 存在，应检查 `docs/anieditor5/export/assets/*`，不要创建第二套散落图片来源。

必须在测试中断言：

- schema 是 `VNI_0.020`。
- name 是 `roundreel`。
- exportProfile 是 `runtime_100/runtime/1`。
- animationTypes 包含 `safe_glow`。
- blendModes 包含 `add`。
- `validateV5GProject(...)` 通过。
- `validateCocosV5GProject(...)` 通过。
- fake driver 或 standalone fake `cc` 可以 `init()` 并 `seek()` 到 safe glow 时间段。
- `packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json` 必须与 `docs/anieditor5/export/roundreel.json` 保持内容一致；如果为了测试复制 fixture，测试或报告必须说明同步来源，不能手工删字段来绕过校验。
- `roundreel` asset 自带 `fileWidth/fileHeight/fileScale: 1`，实现应继续校验这些 metadata；不要因为 `runtime_100` / `assetScale=1` 就新增“缺 metadata 也通过”的宽松路径。

### 6.6 更新模块化测试

至少更新：

```text
packages/anieditorv5runtime-cc/tests/core/safe-glow-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
```

`safe-glow-sampler.test.ts` 要覆盖：

- 默认 normal layer 时仍输出 normal。
- add layer 时输出 add。
- 测试名称从 “fixed normal blend” 改成 inherited blend。
- 不改变原有 spread、opacity wave、rotation、alpha 边界测试。

`validation.test.ts` 要覆盖：

- `roundreel` 是 `VNI_0.020` / `runtime_100`。
- `roundreel` 的 `fileWidth/fileHeight/fileScale: 1` 被保留并通过现有 metadata 校验；不要放宽 runtime profile 的 metadata 要求。
- `top-level project.particles` 仍显式失败。
- `safe_glow` 在 Cocos validation 通过，旧 `glow` / `shatter` 仍按现有规则失败。

public export 面要覆盖：

- 如果只改类型字段，`src/core/index.ts` 通常不需要新增 export，但必须确认 `sampleSafeGlowSpritesForLayer`、`VNISafeGlowLayerSampleState`、`VNISafeGlowSpriteSample` 仍通过 package root、`./core` 和 standalone 可导入。
- `tests/standalone/standalone-import.test.ts` 至少要保持对 public API 的直接 import 验收；若新增 required export/snippet，只补测试，不绕过 checker。

`player.test.ts` 要覆盖：

- 一个 `blendMode: "add"` 的 safe glow 图层渲染后，safe glow node 的 `blendMode` 等于 `getCocosBlendModeConfig("add")`。
- 原 source layer 的 blend mode 也仍是 add。
- `keepOriginal=false` 只隐藏源图，不隐藏 safe glow 副本。
- `roundreel` 可以初始化并在 safe glow 时间段产生 safe glow node。

如果 fake driver 不足以表达真实 Cocos blend state，修改 fake driver 或断言辅助函数，不要削弱生产代码。

### 6.7 同步 standalone 单文件

必须同步：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

同步点至少包括：

- standalone 里的 `VNISafeGlowLayerSampleState`。
- standalone 里的 `VNISafeGlowSpriteSample`。
- standalone 里的 `sampleSafeGlowSprite(...)`。
- standalone 里的 Cocos player safe glow 应用逻辑。
- standalone 里的 README 对应 public API 若通过注释表达，也要保持一致。

standalone 仍必须满足：

- 只 import `"cc"`。
- 不 import workspace package。
- 不 import `pixi.js`。
- 不使用 Node/DOM API。
- 不使用 internal `.js` suffix imports。
- 不依赖 `dist/` 或 `src/` 路径。
- 不使用 ES2016 `Array.prototype.includes(...)`。

### 6.8 加强 standalone checker

更新：

```text
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
```

除现有 required exports/snippets 外，新增或强化检查，至少能抓住以下漂移：

- standalone 缺少 `export interface VNISafeGlowLayerSampleState`。
- standalone 缺少 `export interface VNISafeGlowSpriteSample`。
- standalone `VNISafeGlowSpriteSample.blendMode` 不是 `V5GBlendMode`。
- standalone 没有 `blendMode: sampledLayer.blendMode`。
- standalone 没有 `getCocosBlendModeConfig(safeGlow.blendMode)`。

可以用 required snippets 实现。不要只检查字符串 `safe_glow`，那不能防止语义回退到 fixed normal。

### 6.9 更新 standalone 测试

至少更新：

```text
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
```

要求：

- fixture 列表加入 `roundreel.json`。
- standalone 与模块化 sampler 在 `roundreel`、`lock_01` 或专用 add-blend fixture 上完全一致。
- standalone fake `cc` player 的 safe glow node 写入 add blend state。
- `standalone:check` 能证明单文件 public API 和 snippets 未漏同步。
- public API import 验收继续覆盖 standalone 对外导出；如果 `standalone-import.test.ts` 未新增业务断言，报告必须说明它已经检查且无需改。

如果 `standalone-import.test.ts` 当前只做导入边界，不需要强行加业务断言；但报告要说明已检查它是否需要更新。

### 6.10 更新 README 和示例边界

更新：

```text
packages/anieditorv5runtime-cc/README.md
```

必须替换旧描述：

- `safe_glow` 不再是固定 normal blend。
- 改为：`safe_glow` 使用当前图层同一张 `SpriteFrame` 创建副本，通过缩放和透明度呼吸模拟高亮，副本继承图层 `blendMode`，不需要 shader、Effect、滤镜或模糊。
- 保留：如果 Cocos Sprite / material pass blend 写入失败，runtime 显式抛错，不退回 normal。
- 样例数据来源增加 `docs/anieditor5/export/roundreel.json`。
- 保持：runtime 不解析 bundle manifest，不负责 profile 选择。

检查是否需要更新：

```text
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

如果示例没有描述 safe glow 或 profile 选择，可以不改；报告中说明已检查。

### 6.11 重建 standalone.zip

在 package 目录执行：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
```

`standalone.zip` 被 `.gitignore` 忽略也必须重建，用于交付验收。报告必须记录：

- 文件是否存在。
- `zipinfo -1` 输出。
- zip 是否只包含两个 standalone 文件。
- 是否出现 macOS metadata 或无关文件。
- 重建 zip 后继续确认 `packages/anieditorv5runtime-cc/.prettierignore` 没有丢失 `coverage`、`dist`、`node_modules`；如果 format check 因 zip 或生成物失败，修 `.prettierignore`，不要跳过 `format:check`。

## 7. 验收命令

在仓库根目录执行：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
git diff --check
find . -name .DS_Store -print
```

如果 `pnpm --filter ...` 因当前环境触发依赖下载、build scripts policy 或网络问题失败，按仓库规则先设置代理再重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

如果仍然是环境问题，而不是代码问题，可以使用等价本地二进制命令验证，但报告必须写清原因和等价命令。例如：

```bash
node_modules/.bin/tsc -p packages/anieditorv5runtime-cc/tsconfig.json --noEmit
cd packages/anieditorv5runtime-cc && ../../node_modules/.bin/eslint .
cd packages/anieditorv5runtime-cc && ../../node_modules/.bin/vitest run --coverage
node_modules/.bin/tsc -p packages/anieditorv5runtime-cc/tsconfig.standalone.json --noEmit
node packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
node_modules/.bin/tsc -p packages/anieditorv5runtime-cc/tsconfig.build.json
cd packages/anieditorv5runtime-cc && ../../node_modules/.bin/prettier --check .
```

standalone zip 验收：

```bash
test -f packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
```

语义 grep 验收：

```bash
rg -n "blendMode: sampledLayer.blendMode|VNISafeGlowSpriteSample|roundreel|runtime_100|safeGlow.blendMode|fixed normal|normal blend" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/tests packages/anieditorv5runtime-cc/standalone packages/anieditorv5runtime-cc/scripts packages/anieditorv5runtime-cc/README.md
```

`fixed normal` 或描述 safe glow 固定 normal 的旧文案不能残留。若 `normal blend` 出现在其它合法上下文，报告中说明原因。

## 8. 真实 Cocos Creator 验收

本仓库内测试只能证明 TypeScript、fake `cc`、standalone 边界和 zip 交付。因为 Cocos Creator 编辑器、`.meta`、Library、场景绑定和真实 Sprite material 行为依赖本机编辑器项目，真实编辑器验收是单独的交付面。

如果执行环境可以打开 Cocos Creator 3.8.6，建议做一次真实导入验收：

1. 新建或打开临时 Cocos Creator 3.8.6 项目。
2. 复制：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

到项目内，例如：

```text
assets/scripts/vendor/anieditorv5runtime-cc.ts
```

3. 复制或导入：

```text
docs/anieditor5/export/roundreel.json
docs/anieditor5/export/assets/gx_6_asset_image_mqthi919_1e.png
docs/anieditor5/export/assets/image_asset_image_mqtjdi3v_3.jpg
```

4. 用 `standalone/V5GPreview.example.ts` 的方式绑定 `SpriteAtlas` 和 project 对象。
5. 播放并观察：
   - `roundreel` 可以初始化。
   - safe glow 时间段有副本节点。
   - safe glow 副本继承 `add` blend，而不是 normal。
   - 资源缺失或 atlas key 不匹配时显式抛错。

如果本地不能执行真实 Cocos Creator 验收，报告必须写明未执行原因，并列出以上手工验收步骤和需要复制的文件。不能把 fake-driver/vitest 结果说成真实编辑器验收。

## 9. 任务报告要求

完成后新增：

```text
tasks/54-anieditorv5runtime-cc-vnicore-runtime-profile-sync-[utctime].md
```

报告必须是中文，并至少包含：

- 结论：是否完成，以及 standalone 是否是已验收主交付面。
- 修改文件清单。
- 任务 53 delta 分类表，说明每个变化如何处理。
- `safe_glow` 继承 blendMode 的实现摘要。
- `roundreel` / `VNI_0.020` / `runtime_100` 验收摘要。
- `roundreel` fixture 来源和 metadata 校验摘要，说明 package fixture 是否与 `docs/anieditor5/export/roundreel.json` 同步。
- standalone 同步摘要：单文件、checker、standalone tests、zip。
- public export 面检查结果：`src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts`、standalone import 是否需要更新。
- `.prettierignore` / format check 生成物边界检查结果。
- 验收命令和结果；失败命令要写明原因、是否环境问题、是否已用代理或等价命令重试。
- `standalone.zip` 内容列表。
- 真实 Cocos Creator 3.8.6 验收状态；若未执行，写明手工验收交接步骤。
- `agents.md` 是否更新及原因；如果 `AGENTS.md` 也存在，说明是否同步。
- 是否新增依赖、`pnpm-lock.yaml` 是否变化。
- `git status --short --untracked-files=all` 摘要，区分本任务改动和原有无关改动。
- 二次遗漏检查结果。

报告命名命令：

```bash
date -u +%y%m%d-%H%M%S
```

## 10. 完成标准

必须同时满足：

- [ ] `safe_glow` 副本在模块化源码中继承 layer `blendMode`。
- [ ] `safe_glow` 副本在 standalone 单文件中继承 layer `blendMode`。
- [ ] Cocos player 最终对 safe glow node 应用 `safeGlow.blendMode` 对应的 Cocos blend config。
- [ ] `roundreel.json` 已加入 Cocos runtime fixture，并覆盖 `VNI_0.020` / `runtime_100` / `safe_glow` / `add` blend。
- [ ] `roundreel` fixture 保留 `fileWidth/fileHeight/fileScale: 1` metadata，并与 `docs/anieditor5/export/roundreel.json` 同步。
- [ ] `validateV5GProject(...)` 和 `validateCocosV5GProject(...)` 对 `roundreel` 通过。
- [ ] public export 面已检查，package root、`./core`、`./cocos` 和 standalone import 没有漏同步。
- [ ] `packages/anieditorv5runtime-cc/.prettierignore` 仍排除 `coverage`、`dist`、`node_modules`，format check 没有覆盖生成物。
- [ ] 旧 `glow` / `shatter` Cocos unsupported fail-fast 不回归。
- [ ] `top-level project.particles` 仍显式失败。
- [ ] README 不再说 safe glow 固定 normal blend。
- [ ] `scripts/check-standalone.mjs` 能阻止 standalone safe glow blendMode 语义漏同步。
- [ ] `standalone.zip` 已重建，且只包含 `standalone/anieditorv5runtime-cc.ts` 和 `standalone/V5GPreview.example.ts`。
- [ ] 所有验收命令通过，或报告中清楚记录环境型失败与等价验收。
- [ ] 已写中文任务报告。
- [ ] 已判断是否需要更新 `agents.md`。

## 11. 二次遗漏检查清单

提交前按下面清单再检查一遍：

- [ ] 是否只改了模块化源码而忘了 standalone 单文件。
- [ ] 是否只改了 standalone 单文件而忘了模块化源码。
- [ ] 是否只让 tests 通过，却没有重建 `standalone.zip`。
- [ ] 是否 `scripts/check-standalone.mjs` 仍只检查字符串 `safe_glow`，无法防止 fixed normal 回退。
- [ ] 是否 README 还残留 `safe_glow` fixed normal / special blend mode old text。
- [ ] 是否把 viewer manifest registry 或 Vite asset URL resolver 错误塞进 Cocos runtime。
- [ ] 是否新增了 `@slotclientengine/vnicore`、`pixi.js`、Node 或 DOM runtime 依赖。
- [ ] 是否把 `runtime_100` 从目录名推断，而不是读取 JSON `exportProfile`。
- [ ] 是否为了测试方便修改了 `roundreel.json`、`lock_01.json` 或其它真实导出 fixture。
- [ ] 是否误以为 `runtime_100` 可以缺少 file metadata；当前 `roundreel` 应保留并校验 `fileScale: 1`。
- [ ] 是否检查了 `src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts` 和 standalone import 测试。
- [ ] 是否检查了 `packages/anieditorv5runtime-cc/.prettierignore`，避免 `prettier --check .` 扫到 `dist/`、`coverage/` 或其它生成物。
- [ ] 是否不小心放宽了缺资源、未知 blend mode、Cocos blend 写入失败的 fail-fast 行为。
- [ ] 是否保持旧 `runtime_50` 压缩资源 metadata 验收。
- [ ] 是否保持 atlas `filenameStem(asset.path)` 规则，不新增 path/id/originalName 猜测 fallback。
- [ ] 是否检查了 `.DS_Store`、`git diff --check` 和 ignored `standalone.zip`。
- [ ] 是否在报告中区分 fake-driver/vitest 与真实 Cocos Creator 编辑器验收。
