# vnicore runtime editor sync 任务计划

## 1. 任务目标

本任务把 `docs/anieditor5/src` 中编辑器新增和更新的 VNI 功能同步到最终 Pixi runtime `packages/vnicore`，并更新 `apps/anieditorv5viewer` 作为验证壳。

本任务必须坚持以下核心边界：

- `packages/vnicore` 是最终 runtime，动画的具体采样、状态推进、Pixi 渲染、mask、文字层绑定、粒子和性能约束都必须放在 `packages/vnicore`。
- `apps/anieditorv5viewer` 只能做项目注册、资源选择、控制面板、文本输入、图片替换验证和浏览器可视化入口，不允许复制动画算法、mask 算法、粒子算法或直接操作 `VNIPlayer` 私有 Pixi display tree。
- 新编辑器导出的 `number2.json`、`number3.json`、更新后的 `roundreel.json` 和新增图片资源必须能通过 viewer 选择并由 `vnicore` 正确播放。
- 文字层是 runtime 占位层。游戏里可以把它替换成数字、文本或其它自定义 Pixi 节点；绑定后该节点必须继承文字层的 transform、scale、rotation、opacity、visible、blendMode、渲染顺序和播放生命周期。
- viewer 需要提供文字层测试入口：既能把文字层替换成图片，也能通过文本输入框替换/更新成动态文本，方便验证渲染效果。
- 性能是必要考核要求。不能为了快速对齐编辑器预览而引入每帧重建纹理、每帧 canvas 预合成、无上限 sprite 生成、无清理的 runtime 节点或隐藏 fallback。
- 本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。

本计划是完整可执行版本，不能依赖任何别的上下文，也不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、文档同步、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/70-vnicore-runtime-editor-sync-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/70-vnicore-runtime-editor-sync-260702-123456.md
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
- VS Code 调试运行 TypeScript：`ts-node`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方运行时依赖。若确实新增或调整 npm 依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前已知工作区输入改动包括：

```text
docs/anieditor5/export/roundreel.json
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/constants.ts
docs/anieditor5/src/main.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/types.ts
docs/anieditor5/export/number2.json
docs/anieditor5/export/number3.json
docs/anieditor5/export/assets/1_asset_image_mqz5pzh7_p.png
docs/anieditor5/export/assets/2_asset_image_mqz76b37_19.png
docs/anieditor5/export/assets/3_asset_image_mquxm61x_3.png
docs/anieditor5/export/assets/3_asset_image_mqz642ku_s.png
docs/anieditor5/export/assets/big_asset_image_mr1utn0b_g.png
docs/anieditor5/export/assets/gx5_asset_image_mr1uxa3i_j.png
docs/anieditor5/export/assets/qq_202606291adsa71906_asset_image_mqz4fdt8_c.png
```

这些是本任务输入，执行时不要删除、回滚、移动或用旧资源覆盖。

如果 `pnpm --filter ...` 或 `pnpm exec ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter anieditorv5viewer test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

`packages/vnicore/dist` 是 build 输出，不要手改；执行 `pnpm --filter @slotclientengine/vnicore build` 验证最终 subpath 输出即可。若实际仓库状态显示某些 build 输出被跟踪，必须在报告中说明，并只接受 build 命令生成的差异。

## 3. 当前实现事实

执行本计划时必须重新盘点，以实际代码为准。当前已观察到的相关事实如下。

### 3.1 编辑器新增能力

`docs/anieditor5/src/constants.ts` 中编辑器版本已从旧版本推进到：

```text
VNI_0.038
```

`docs/anieditor5/src/types.ts` 新增或变更：

- `V5GMaskCompositeMode = "legacy_alpha" | "precompose_light_alpha"`
- `V5GLayerMaskConfig`
- `V5GLayerConfig.mask?: V5GLayerMaskConfig`
- `V5GAnimationType` 新增：
  - `particle_stream`
  - `chaser_light`

`docs/anieditor5/src/project_state.ts` 新增或变更：

- `normalizeProjectMasks(project)`
- `getLayerMaskSource(project, layer)`
- `isLayerHiddenByMaskSourcePreference(project, layerId)`
- runtime 导出时，被 mask 使用的 source layer 会保留在导出数据中；如果 `showSourceLayer=false`，source layer 自身可见性会被标为 false，但仍可作为 mask source。

`docs/anieditor5/src/animation_presets.ts` 新增或变更：

- `particles` 增加 `emissionAngle`、`emissionSpreadAngle`、`trailCount`、`trailSpacing`、`trailFade`、`rotateParticles`、`randomRotation`、`randomRotationDegrees`、`spinSpeed`。
- 新增 `particle_stream` 持续发射。
- 新增 `chaser_light` 走马灯。
- `bounce_in` 采样从原始 progress 改为 eased progress。
- `chaser_light` 的 `keepOriginal=false` 会隐藏源图层。

`docs/anieditor5/src/pixi_stage.ts` 新增或变更：

- text layer 预览仍是 `PIXI.Text` 占位。
- mask 支持普通 alpha mask 和 `precompose_light_alpha` 光效预合成。
- `precompose_light_alpha` 只在依赖变化时重建 canvas/texture，不能每帧重建。
- 粒子绘制加入移动端友好的 sprite 数量上限。
- `particle_stream` 和 `chaser_light` 都在编辑器预览中有具体 Pixi 表现。

### 3.2 新导出样例

`docs/anieditor5/export/number2.json` 当前用于文字层验证：

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

`docs/anieditor5/export/number3.json` 当前用于 mask 和组合验证：

- `schemaVersion`: `VNI_0.036`
- `exportProfile.id`: `runtime_100`
- 包含多个 image 图层。
- 包含 `mask.enabled=true` 且 `compositeMode="precompose_light_alpha"` 的光效遮罩样例。
- 包含 `particles` 新参数、`safe_glow`、`bounce_in`、`fade`、`move` 等动画。

`docs/anieditor5/export/roundreel.json` 当前更新点：

- schema 由旧版本变更为 `VNI_0.022`。
- stage duration 变为 `5`。
- 新增多个 layer group。
- 新增或更新 `safe_glow`、`blink`、`scale_out`。
- 新增 `chaser_light` 走马灯图层。

### 3.3 `packages/vnicore` 当前相关文件

核心类型和校验：

```text
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/src/core/render-effect-sampler.ts
packages/vnicore/src/core/safe-glow-sampler.ts
packages/vnicore/src/core/layer-groups.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/index.ts
```

Pixi runtime：

```text
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/additive-matte-texture.ts
packages/vnicore/src/pixi/blend-mode.ts
packages/vnicore/src/pixi/index.ts
```

测试：

```text
packages/vnicore/tests/core/animation-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/particle-sampler.test.ts
packages/vnicore/tests/core/particle-runtime.test.ts
packages/vnicore/tests/core/render-effect-sampler.test.ts
packages/vnicore/tests/core/safe-glow-sampler.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/tests/fixtures/export
packages/vnicore/tests/fixtures/export2
```

测试和覆盖率配置：

```text
packages/vnicore/vite.config.ts
```

当前 `packages/vnicore` 的 vitest coverage threshold 是 `lines/functions/branches/statements >= 80`。本任务新增 runtime 能力后不能通过降低覆盖率阈值过关；如果覆盖率下降，应补测试，不要改阈值。

当前 `vnicore` 已有能力：

- `VNIPlayer` 是 Pixi runtime，不拥有 `PIXI.Application`、renderer、canvas 或 DOM 容器。
- viewer/game runtime 必须提供外部 Pixi `parent`。
- `packages/vnicore` 已拥有 group-aware rendering 和 public group slot insertion API。
- `attachImageBetweenLayerGroups(...)` 用于项目内 asset。
- `attachExternalImageBetweenLayerGroups(...)` 用于当前 bundle/profile asset manifest 中非项目 asset。
- `safe_glow` 已是独立 sampler/render path，不应混入旧 `glow` / `shatter`。
- `project.particles` 非空仍是显式 unsupported 边界。
- segmented playback 已支持 `play({ mode: "segmented", loopStart, loopEnd, keepParticlesAlive })`，并要求 hold 点保持 emitter 配置但 live particles 继续独立推进。

当前缺口：

- `types.ts` / `validation.ts` 尚未完整支持 mask、`particle_stream`、`chaser_light`。
- 文字层当前只是默认 `PIXI.Text`；缺少 public runtime API 让游戏绑定或替换成自己的节点。
- `particle_stream` 尚未接入 `particle-sampler.ts` / `particle-runtime.ts` 的 live runtime。
- `chaser_light` 尚未作为 vnicore runtime 效果实现。
- mask 尚未作为 runtime 渲染能力实现。
- `bounce_in` eased progress 语义尚需与编辑器同步确认。

### 3.4 `apps/anieditorv5viewer` 当前相关文件

```text
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/styles.css
apps/anieditorv5viewer/tests/bundled-projects.test.ts
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/README.md
```

当前 viewer 是 `@slotclientengine/vnicore` 的薄壳：

- `main.ts` 创建 Pixi `Application`，把 `nextApp.stage` 传给 `VNIPlayer`。
- `bundled-projects.ts` 注册 `docs/anieditor5/export`、`export2` 和 `game003-s1` 的 VNI project。
- `asset-manifest.ts` 用 `import.meta.glob("../assets/assets/*")` 自动收集 legacy/export 资源。
- `controls.ts` 已提供 project 选择、play/restart/loop、segmented playback、组间插入 image 的 UI。
- viewer 插入图片当前调用 public `attachImageBetweenLayerGroups(...)` 或 `attachExternalImageBetweenLayerGroups(...)`。
- `vite.config.ts` 使用 alias 指向 `packages/vnicore/src`，所以 viewer 测试会直接暴露 vnicore public API 的源码兼容问题。

本任务必须保持这个薄壳模型，不允许 viewer 复制 runtime 私有逻辑。

## 4. 目标行为合同

### 4.1 schema 和 validation

`packages/vnicore` 必须接受新版 `VNI_0.x` project，但仍严格校验字段：

- `project.schemaVersion` 继续只接受 `VNI_0.x` 或历史兼容范围中已有的 `V5G_0.x`。
- `layer.mask` 如果存在，必须校验：
  - `enabled` 为 boolean。
  - `sourceLayerId` 为 string 或 null。
  - `enabled=true` 时 `sourceLayerId` 必须存在、不能等于当前 layer id、必须指向存在 layer。
  - `mode` 当前只支持 `"alpha"`。
  - `compositeMode` 只支持 `"legacy_alpha"` 和 `"precompose_light_alpha"`。
  - `showSourceLayer` 必须是 boolean。
- 不允许为 mask 缺 source、source 指向自己、source 指向不存在 layer 做静默禁用 fallback；这类数据问题必须显式失败。
- `project.particles.length > 0` 继续显式失败，错误信息要说明当前支持的是 layer particle animations，不支持 top-level particles。
- `text` layer 仍必须 `assetId: null`。
- `image` layer 必须有合法 assetId。
- `keyframes` 仍按当前支持边界处理；如果仍不支持，继续显式失败，不要为新样例暗中忽略。

### 4.2 动画实现全部归属 vnicore

以下所有逻辑必须放在 `packages/vnicore`：

- `particles` 新参数采样。
- `particle_stream` 采样、live runtime、drain duration、segmented hold 行为。
- `chaser_light` 采样和 Pixi runtime 渲染。
- `bounce_in` eased progress 行为。
- mask runtime 行为。
- 文字层替换节点绑定和每帧状态应用。
- 性能优化、对象复用、清理和诊断计数。
- `sampleProjectAtTime(...)` / `sampleLayerAtTime(...)` 对 active effect、mask source visibility、`showSourceLayer=false` 的采样语义。

viewer 只能调用 public API 验证，不允许为了让样例看起来正确而在 viewer 内实现这些效果。

### 4.3 文字层 runtime API

`VNIPlayer` 必须提供 public API 支持文字层占位替换。建议 API 形态如下，执行时可按代码风格微调，但能力必须等价：

```ts
attachNodeToTextLayer(options: {
  id: string;
  layerId: string;
  node: PIXI.Container;
  destroyOnDetach?: boolean;
  hideOriginal?: boolean;
}): () => void;

attachTextToTextLayer(options: {
  id: string;
  layerId: string;
  text: string;
  style?: Partial<PIXI.TextStyle>;
  destroyOnDetach?: boolean;
  hideOriginal?: boolean;
}): {
  dispose(): void;
  setText(text: string): void;
};

attachImageToTextLayer(options: {
  id: string;
  layerId: string;
  assetId?: string;
  imageUrl?: string;
  label?: string;
  destroyOnDetach?: boolean;
  hideOriginal?: boolean;
}): Promise<() => void> | (() => void);
```

必须满足：

- `layerId` 必须指向 `type === "text"` 的 layer，否则显式失败。
- 同一个 `id` 重复绑定必须显式失败。
- 绑定节点必须挂在该 text layer 的 runtime 容器中，继承该层动画状态。
- 默认应隐藏原始文字占位，避免替换节点和原始文字重叠；如果需要保留原文字，必须通过显式 `hideOriginal=false`。
- `setText()` 只能更新现有 Text 节点内容，不允许重建 `VNIPlayer` 或重建整个 layer tree。
- `dispose()` / `clearMountedNodes()` / `destroy()` / project switch 必须清理绑定节点，不能泄漏 Pixi display object、texture 或 listener。
- 绑定节点在 parent/child 关系下也必须正确继承动画。可以通过 text layer wrapper/container 作为 transform carrier，外部节点作为 child。
- 绑定后 runtime diagnostics 可显示文字层挂载数量，便于 viewer 和测试观察。

### 4.4 mask runtime

第一版必须支持：

1. `legacy_alpha`
   - 使用 source layer 的 alpha 作为 mask。
   - source layer transform、opacity、visibility 必须按当前采样时间生效。
   - 如果 `showSourceLayer=false`，source layer 自身不普通渲染，但仍作为 mask source 生效。

2. `precompose_light_alpha`
   - 目标为 light/add/screen/lighten 等光效层时，按编辑器语义去黑底：由光效图 luminance/source alpha 和 mask alpha 生成预合成结果。
   - 预合成必须缓存，只有在依赖变化时重算。依赖包括：
     - target texture
     - source mask texture
     - target transform
     - source transform
     - source opacity
     - target opacity
     - blendMode
     - stage width/height
   - 不能每帧创建 canvas、texture 或 sprite。
   - 如果当前运行环境无法提供必要 canvas 2D 能力，必须显式失败并说明是 `precompose_light_alpha` 不可用，不能退化成普通渲染。

性能要求：

- mask display object / render texture / precompose texture 必须可复用。
- mask source 如果也是 visible layer，普通渲染和 mask source 不能互相污染 transform。
- mask target 和 source 可以位于不同 layer group；实现必须保持 `project.layers` / layer group render order，不允许因为 mask clone 把 source 或 target 挪到错误层级。
- mask 相关资源在 `destroy()` 时必须释放。

### 4.5 粒子和走马灯

`particles` 新参数必须与编辑器语义一致：

- `emissionAngle`
- `emissionSpreadAngle`
- `trailCount`
- `trailSpacing`
- `trailFade`
- `rotateParticles`
- `randomRotation`
- `randomRotationDegrees`
- `spinSpeed`

`particle_stream` 必须支持：

- 按 `spawnRate`、`lifetime`、`spread`、`speed`、发射角、扩散角、size、gravity、fadeOut、trail 和 rotation 参数持续发射。
- deterministic preview 下，给定 time 必须得到稳定结果。
- live runtime 下，segmented hold 时如果 `keepParticlesAlive=true`，emitter 配置 pinned 在 hold 点，但 elapsed 继续推进并继续发射/更新粒子。
- drain duration 应以 `lifetime` 为主要依据，不能简单用 animation duration 导致粒子过早消失。

`chaser_light` 必须支持：

- `totalCount`
- `spacing`
- `lightDuration`
- `interval`
- `trajectory`: `0` 圆形、`1` 直线、`2` 曲线
- `radius`
- `centerX`
- `centerY`
- `endX`
- `endY`
- `curve`
- `lightSize`
- `dimAlpha`
- `keepOriginal`

渲染要求：

- 走马灯是 runtime 效果，不能在 viewer 内临时复制图层。
- 不能无限创建 sprite；必须有数量上限和复用策略。
- 走马灯 sprite 的亮灯状态、alpha、scale、rotation 和 blendMode 必须由 vnicore 采样结果驱动。
- `keepOriginal=false` 时源图层应隐藏，但走马灯仍继续渲染。

### 4.6 性能验收合同

本任务必须把性能作为可测行为，而不是事后主观观察：

- 粒子和走马灯每帧 sprite 数量必须有上限。建议：
  - `particles` burst 不超过约 `320` 个 runtime sprite。
  - `particle_stream` 不超过约 `360` 个 runtime sprite。
  - `chaser_light.totalCount` 校验和渲染上限不超过 `200`。
- `VNIPlayer` 每帧不得重建 layer instance、基础 image sprite 或 text layer wrapper。
- `PIXI.Texture.from(canvas)` / canvas precompose 只能在 dirty key 变化时发生。
- runtime display pools 需要复用 particle/chaser/mask/safe_glow/render-effect sprite；如果当前已有某类效果采用一次性创建，也必须评估并优先补复用，至少对新效果不能引入更差模式。
- `destroy()`、`restart()`、`seek()`、`clearMountedNodes()`、project switch 后不能保留旧 mounted nodes、mask textures、runtime sprites 或 live particle state。
- 测试必须覆盖重复播放、seek、destroy 后节点数量不增长或已清理。
- viewer 不需要做性能算法，但要暴露 diagnostics，至少能看到 rendered layer / particle / mounted node 计数变化，方便浏览器验收。
- 现有 `VNIPlayer` 已写入 `data-vni-particle-sprites`、`data-vni-render-effect-sprites`、`data-vni-safe-glow-sprites`、`data-vni-mounted-nodes` 等 diagnostics；新增 chaser/mask/text-layer binding 后必须新增或复用清晰的 diagnostics 字段，并在 `clearDiagnostics()` 中同步清理。

## 5. 实施步骤

### 5.1 预检查和差异盘点

执行：

```bash
git status --short --untracked-files=all
git diff --stat
git diff -- docs/anieditor5/src/types.ts docs/anieditor5/src/project_state.ts docs/anieditor5/src/animation_presets.ts docs/anieditor5/src/pixi_stage.ts
jq '[.layers[].animations[].type] | group_by(.) | map({type:.[0], count:length})' docs/anieditor5/export/number2.json docs/anieditor5/export/number3.json docs/anieditor5/export/roundreel.json
```

确认：

- 新样例 JSON 可解析。
- 新增图片资源路径与 JSON `assets[].path` 一致。
- `roundreel.json` 的 `exportProfile` 仍以 JSON 为 source of truth，不根据目录名推断。
- 当前已有用户改动不能回滚。
- `agents.md` 当前只写到 `VNIPlayer`、segmented playback、live 粒子、group slot 等旧边界；本任务完成时应补充新 runtime 边界，除非实现后已有其它同等规则覆盖。

### 5.2 同步 fixtures 和 viewer assets

新增或更新：

```text
packages/vnicore/tests/fixtures/export/roundreel.json
packages/vnicore/tests/fixtures/export/number2.json
packages/vnicore/tests/fixtures/export/number3.json
apps/anieditorv5viewer/src/assets/projects/roundreel.json
apps/anieditorv5viewer/src/assets/projects/number2.json
apps/anieditorv5viewer/src/assets/projects/number3.json
apps/anieditorv5viewer/src/assets/assets/1_asset_image_mqz5pzh7_p.png
apps/anieditorv5viewer/src/assets/assets/2_asset_image_mqz76b37_19.png
apps/anieditorv5viewer/src/assets/assets/3_asset_image_mquxm61x_3.png
apps/anieditorv5viewer/src/assets/assets/3_asset_image_mqz642ku_s.png
apps/anieditorv5viewer/src/assets/assets/big_asset_image_mr1utn0b_g.png
apps/anieditorv5viewer/src/assets/assets/gx5_asset_image_mr1uxa3i_j.png
apps/anieditorv5viewer/src/assets/assets/qq_202606291adsa71906_asset_image_mqz4fdt8_c.png
```

要求：

- JSON fixture 应与 `docs/anieditor5/export/*.json` 保持一致，不能为了测试通过手改 fixture。
- 图片资源应从 `docs/anieditor5/export/assets/*` 同名复制到 viewer assets。
- 新资源不能静默缺失；`resolveProjectAssetUrls(...)` 必须对缺资源显式失败。

资源一致性检查建议在实现后执行：

```bash
cmp docs/anieditor5/export/number2.json packages/vnicore/tests/fixtures/export/number2.json
cmp docs/anieditor5/export/number3.json packages/vnicore/tests/fixtures/export/number3.json
cmp docs/anieditor5/export/roundreel.json packages/vnicore/tests/fixtures/export/roundreel.json
cmp docs/anieditor5/export/number2.json apps/anieditorv5viewer/src/assets/projects/number2.json
cmp docs/anieditor5/export/number3.json apps/anieditorv5viewer/src/assets/projects/number3.json
cmp docs/anieditor5/export/roundreel.json apps/anieditorv5viewer/src/assets/projects/roundreel.json
```

图片资源至少检查文件存在和大小非 0；如果环境允许，逐个 `cmp` 同名源文件和 viewer copy：

```bash
for file in 1_asset_image_mqz5pzh7_p.png 2_asset_image_mqz76b37_19.png 3_asset_image_mquxm61x_3.png 3_asset_image_mqz642ku_s.png big_asset_image_mr1utn0b_g.png gx5_asset_image_mr1uxa3i_j.png qq_202606291adsa71906_asset_image_mqz4fdt8_c.png; do cmp "docs/anieditor5/export/assets/$file" "apps/anieditorv5viewer/src/assets/assets/$file"; done
```

### 5.3 更新 vnicore schema/types/validation

修改：

```text
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/index.ts
```

实现：

- 增加 mask 类型导出。
- 增加 `particle_stream` 和 `chaser_light`。
- 更新 `SUPPORTED_ANIMATION_TYPES`、默认 easing、required numeric params、optional boolean params。
- 增加 `layer.mask` 的 assert 和 validate。
- 增加 layer id / mask source cross-reference 校验。
- 保持 top-level `project.particles` fail-fast。

测试：

```text
packages/vnicore/tests/core/validation.test.ts
```

必须覆盖：

- 接受 `number2.json`、`number3.json`、新版 `roundreel.json`。
- 拒绝 mask source 缺失。
- 拒绝 mask source 指向自己。
- 拒绝未知 `compositeMode`。
- 拒绝非法 `particle_stream` 参数类型。
- 拒绝非法 `chaser_light` 参数类型。
- 保留 `project.particles` 非空 rejection。

### 5.4 同步动画采样

修改：

```text
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/tests/core/animation-sampler.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
```

实现：

- `bounce_in` 使用 eased progress。
- `chaser_light` 的 `keepOriginal=false` 会让 source opacity 为 0。
- `particle_stream` 与其它 particle animation 一样不在 animation-sampler 中改变基础 transform/opacity。
- `chaser_light` 如果作为独立 runtime effect，需要在 project sampling 中能标记 active effect。
- `sampleLayerAtTime(...)` 必须把 active `particle_stream`、`chaser_light`、mask/precompose 这类 source-hidden-but-effect-active 场景纳入 visible/renderImageDisplay 判定，避免源图隐藏后效果也被误关。

测试：

- `bounce_in` 在 `easeOutQuad` 下和旧 raw progress 有可观察差异。
- `chaser_light keepOriginal=false` 隐藏源图。
- `chaser_light keepOriginal=true` 保留源图。
- active `chaser_light` / `particle_stream` 在 source opacity 为 0 或 `keepOriginal=false` 时仍保留对应 runtime effect。

### 5.5 粒子 sampler 和 live runtime

修改：

```text
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/tests/core/particle-sampler.test.ts
packages/vnicore/tests/core/particle-runtime.test.ts
```

实现：

- `particles` 新参数完全同步编辑器。
- 新增 `particle_stream` deterministic sampler。
- 新增 `particle_stream` runtime sampler。
- drain duration 使用 `lifetime`。
- sprite 数量上限写入 sampler，不依赖 viewer。
- 参数非法时显式失败，不从字符串或 null 自动转数字。

测试：

- `particles` 新参数影响角度、拖尾、旋转。
- `particle_stream` 在同一 time 下 deterministic。
- `particle_stream` 的 runtime elapsed 在 segmented hold 中继续推进。
- `particle_stream` 超高 spawnRate/trailCount 不突破上限。
- `beginDrain()` 对 `particle_stream` 至少按 lifetime 保留 drain。

### 5.6 走马灯 sampler/render path

建议新增独立文件，避免把不同效果都塞进 `particle-sampler.ts`：

```text
packages/vnicore/src/core/chaser-light-sampler.ts
packages/vnicore/tests/core/chaser-light-sampler.test.ts
```

也可按现有结构放在 `render-effect-sampler.ts`，但必须保持语义清晰。

实现：

- 采样输出包含 `layerId`、`animationId`、`x`、`y`、`scale`、`rotation`、`alpha`、`blendMode`。
- 支持圆形、直线、曲线 trajectory。
- 支持亮灯/暗灯 alpha 和亮灯 scale wave。
- `isLit` 时 blendMode 可用 `add`，暗灯使用 layer blendMode。
- 数量上限不超过 validation 允许范围。

Pixi runtime 修改：

```text
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/index.ts
packages/vnicore/tests/pixi/vni-player.test.ts
```

要求：

- 走马灯 sprite 复用，不每帧销毁重建全部 sprite。
- render order 跟随对应 layer 后方，与 safe_glow / renderEffect / liveParticles 的顺序有明确规则并测试。
- diagnostics 显示走马灯 sprite 数量，或合并到 render effect count 中但名称要清楚。
- 如果新增 `data-vni-chaser-light-sprites`，必须在 `clearDiagnostics()` 删除该字段，并在 README/docs 中说明。

### 5.7 文字层替换 runtime API

修改：

```text
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/index.ts
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/examples/basic-player.ts
packages/vnicore/tests/pixi/vni-player.test.ts
```

实现建议：

- 为 text layer 创建稳定 wrapper/container。
- 原始 `PIXI.Text` 作为 wrapper 的默认 child。
- 绑定的外部 node 作为 wrapper 的 child。
- `applySampledLayerState(...)` 作用于 wrapper，确保原文字和替换节点都继承动画。
- `hideOriginal=true` 时只隐藏原始 text child，不隐藏 wrapper。
- `setText()` 只更新已创建 `PIXI.Text.text`。
- `attachImageToTextLayer(...)` 支持项目 asset 和外部 url。项目 asset 走已加载 texture 和 logical/file size compensation；外部 url 走显式 texture load。
- 所有 mounted text layer nodes 纳入 `clearMountedNodes()` 和 `destroy()` 清理。

测试必须覆盖：

- 绑定到不存在 layer 显式失败。
- 绑定到 image layer 显式失败。
- 同一 id 重复绑定显式失败。
- 绑定节点继承 scale/rotation/opacity/visible。
- `hideOriginal=true` 隐藏原 text。
- `setText()` 不重建 player，不替换 node，只更新内容。
- `dispose()` 后原 text 恢复可见。
- `destroy()` 清理 destroyOnDetach node。

### 5.8 mask runtime

建议新增独立文件：

```text
packages/vnicore/src/core/mask.ts
packages/vnicore/src/pixi/layer-mask.ts
packages/vnicore/tests/core/mask.test.ts
```

也可按现有结构放在 `vni-player.ts` 附近，但必须保持可测试。

实现：

- 在 `sampleProjectAtTime(...)` 或 VNIPlayer 层计算 mask source 与目标 layer 的关系。
- 对 `showSourceLayer=false` 的 source layer：普通 render 隐藏，但 mask clone/source 继续有效。
- `legacy_alpha` 使用 Pixi mask/display object 或 render texture 实现，不能污染普通 source layer。
- `precompose_light_alpha` 使用缓存 key 和 dirty flag。
- 如果 `precompose_light_alpha` 依赖 image layer，但 source/target 不是 image 或 texture 不可用，显式失败。
- text layer 作为 `legacy_alpha` mask source 可支持；text layer 作为 `precompose_light_alpha` source 若无法可靠实现，必须显式失败并在 validation 或 runtime 错误中说明，不要退化。
- mask source 的 sampled transform 必须来自同一时刻的 project sampler；不能读取 layer 原始 transform 导致 mask 动画和目标动画错帧。
- mask clone / precompose sprite 的插入位置必须不改变普通 layer group render order。

测试：

- `number3.json` 可 init。
- `showSourceLayer=false` 时 source 普通 display 隐藏但 mask 仍有效。
- mask source 缺失时 validation 已失败。
- `precompose_light_alpha` 不在每帧重建 texture。
- `destroy()` 释放预合成 texture。
- mask source 有动画时，mask 采样使用当前播放时间的 transform/opacity。

### 5.9 viewer 注册和文字层验证 UI

修改：

```text
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/styles.css
apps/anieditorv5viewer/tests/bundled-projects.test.ts
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/README.md
```

实现：

- 注册新项目：
  - `number2`
  - `number3`
  - 更新 `roundreel` 预期 schema/profile/animation types。
- `BundledProjectId` 加入新 id。
- `bundledProjects` 顺序测试同步更新。
- viewer controls 检测当前 project 中的 text layers。
- 新增文字层替换面板，至少包含：
  - text layer 选择框。
  - 模式选择：原始 / 文本替换 / 图片替换。
  - 文本输入框。
  - 图片 asset 选择框，资源来源仍是当前 bundle/profile 的完整 `insertionAssets`，不要只限制 `project.assets[]`。
  - 应用 / 移除按钮。
  - 错误显示区域。
- 文本输入变化时调用 `vnicore` public API 更新文本节点内容，不重建 player。
- 图片替换调用 `vnicore` public API 绑定到 text layer，不走 group insertion API。
- project switch 时清理 text layer replacement 状态。
- viewer 不允许保存任何 runtime 私有 display object 引用，只持有 dispose handle 或 public binding handle。

测试：

- `number2` 出现在项目列表。
- `number2` 有 text layer，并在 controls 中可选择。
- `number3` 出现在项目列表，资产解析完整。
- 文字层替换 controls 在无 text layer 的项目中 disabled 或显示无可用层。
- 文本输入事件调用 public handle `setText()`。
- 图片替换使用 current asset manifest，非 project asset 也能进入候选。

### 5.10 文档和例子

更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
packages/vnicore/examples/basic-player.ts
apps/anieditorv5viewer/README.md
```

必须说明：

- `VNIPlayer` 不拥有 Pixi Application / renderer / canvas / DOM。
- 文字层是 runtime placeholder，游戏可绑定自定义节点或动态文本。
- 动画效果实现全部在 `vnicore`。
- viewer 只是验证 shell。
- mask 支持范围和显式失败边界。
- `particle_stream` / `chaser_light` 支持范围和性能上限。
- top-level `project.particles` 仍不支持。
- `exportProfile` 是 runtime/profile source of truth，不能根据目录名推断。

### 5.11 agents.md 同步判断

本任务影响仓库协作规则、runtime 边界和 viewer 边界，完成实现时必须检查并优先更新：

```text
agents.md
```

当前 `agents.md` 已有 `packages/vnicore` 不拥有 `PIXI.Application`、viewer 不复制播放状态机、live 粒子等旧规则，但还没有覆盖本任务新增的文字层替换、mask、走马灯、持续粒子和性能边界。除非实现过程中发现这些规则已由其它新文本覆盖，否则应补充以下规则：

- `packages/vnicore` 拥有 VNI mask、文字层绑定、动态文本替换、走马灯、持续粒子和性能上限。
- `apps/anieditorv5viewer` 只能调用 public runtime API 验证，不复制动画实现。
- text layer 替换必须走 vnicore public API。
- `precompose_light_alpha` 不能每帧预合成。
- `particle_stream` 的 segmented hold 行为和 drain duration 属于 vnicore runtime，不属于 viewer 或 app 私有逻辑。
- 新增 VNI export 样例时必须同步 `docs/anieditor5/export`、`packages/vnicore/tests/fixtures/export`、viewer bundled projects 和 viewer assets。

如果确认现有 `agents.md` 已覆盖，无需强行修改，但任务报告必须写明检查结果和理由。不能跳过这一步。

## 6. 验收命令

### 6.1 基础检查

```bash
git status --short --untracked-files=all
git diff --stat
```

### 6.2 vnicore

```bash
pnpm --filter @slotclientengine/vnicore format:check
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore build
```

`pnpm --filter @slotclientengine/vnicore test` 必须保持 coverage threshold `lines/functions/branches/statements >= 80` 全部通过。不得通过降低 `packages/vnicore/vite.config.ts` 阈值完成任务。

若遇到非 TTY 依赖处理问题，用：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore build
```

### 6.3 anieditorv5viewer

```bash
pnpm --filter anieditorv5viewer format:check
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
```

viewer 测试通过不代表 runtime 语义完成；如果 viewer 绿但 `@slotclientengine/vnicore` 测试或覆盖率失败，任务仍未完成。

若遇到非 TTY 依赖处理问题，用：

```bash
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer build
```

### 6.4 根级回归

如果改动仅限 `packages/vnicore` 和 `apps/anieditorv5viewer`，至少运行：

```bash
pnpm typecheck
pnpm test
pnpm build
```

如果根级 `format:check` 已知存在无关历史噪声，仍需运行并在报告中记录实际失败包；本任务本地必须保证：

```bash
pnpm --filter @slotclientengine/vnicore format:check
pnpm --filter anieditorv5viewer format:check
git diff --check
```

### 6.5 浏览器手动验收

启动 viewer：

```bash
pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1
```

浏览器验收项：

- 选择 `number2`。
- 原始文字层可见并按 `pop + scale_up + idle + scale_out` 播放。
- 文本替换模式：输入不同文本后，不重启 player，文本节点继续按文字层动画播放。
- 图片替换模式：选择图片后，图片替换文字层并继续按文字层动画播放。
- 移除替换后，原始文字恢复。
- 选择 `number3`。
- `precompose_light_alpha` 光效 mask 可见，且 source layer 显隐符合 `showSourceLayer`。
- 选择 `roundreel`。
- `chaser_light` 走马灯可见，播放过程中没有明显卡顿。
- segmented playback hold 点下，持续粒子不会冻结。
- 检查 stage mount 的 diagnostics dataset：
  - `data-vni-particle-sprites` 不超过计划中的粒子上限。
  - `data-vni-render-effect-sprites` / `data-vni-safe-glow-sprites` / 新增 chaser/mask/text binding 计数有合理变化。
  - `data-vni-mounted-nodes` 在文字层替换应用后增加，移除后恢复。
- 连续 restart/play/seek 至少 5 次，diagnostics 计数不能持续增长。

如果执行环境无法做浏览器验收，任务报告必须明确写明“浏览器验收未执行”，并把以上步骤作为交给用户的手动验收清单，不能在报告中宣称已完成浏览器验收。

## 7. 必须新增或更新的测试清单

`packages/vnicore`：

- validation 接受 `number2`、`number3`、新版 `roundreel`。
- validation 拒绝非法 mask。
- validation 拒绝非法 `particle_stream` / `chaser_light` 参数。
- animation sampler 覆盖 `bounce_in` eased progress 和 `chaser_light keepOriginal`。
- particle sampler 覆盖新 `particles` 参数和 `particle_stream`。
- particle runtime 覆盖 `particle_stream` segmented hold 和 drain。
- chaser light sampler 覆盖三种 trajectory、亮灯/暗灯、数量上限。
- Pixi runtime 覆盖 text layer 替换 API、dynamic text update、dispose/destroy 清理。
- Pixi runtime 覆盖 mask 缓存和清理。
- Pixi runtime 覆盖重复播放后 runtime sprite 数量不持续增长。
- coverage threshold 仍保持 `>=80` 且通过，不允许调低阈值。

`apps/anieditorv5viewer`：

- bundled projects 列表新增 `number2`、`number3`。
- 新资源能被 `resolveProjectAssetUrls(...)` 解析。
- insertion/text replacement asset 列表来自当前完整 asset manifest。
- controls 在有 text layer / 无 text layer 项目中状态正确。
- text replacement UI 调用 public vnicore API，不依赖 private property。
- viewer 测试必须覆盖 project switch 后文字层替换状态清理。

## 8. 显式非目标

本任务不做以下事项：

- 不实现 top-level `project.particles`。
- 不把 `docs/anieditor5/src` 的编辑器 UI 代码迁移到 runtime。
- 不在 viewer 内复制动画算法。
- 不在 `VNIPlayer` 内创建或拥有 Pixi Application、renderer、canvas 或 DOM container。
- 不把 `export2` 作为未来资源池模型；`exportProfile` 仍以 JSON metadata 为准。
- 不为坏数据做隐藏修复，比如缺 mask source 自动禁用、缺资源自动跳过、非法数字字符串自动转换。
- 不扩展 Cocos runtime；若后续要同步 `packages/anieditorv5runtime-cc`，必须另开任务。

## 9. 第二遍遗漏检查

实现完成后必须按此清单做第二遍检查，并把结果写入任务报告：

- schema/type 是否覆盖 `mask`、`particle_stream`、`chaser_light`。
- validation 是否对非法 mask/source/params 显式失败。
- `number2`、`number3`、`roundreel` 是否同时进入：
  - `docs/anieditor5/export`
  - `packages/vnicore/tests/fixtures/export`
  - `apps/anieditorv5viewer/src/assets/projects`
- 新图片是否进入 viewer asset manifest 对应目录。
- `cmp` 或等价校验是否证明 docs source、vnicore fixture、viewer project JSON 一致。
- viewer bundled-project 测试是否同步项目顺序。
- `VNIPlayer` public API 是否导出到 `@slotclientengine/vnicore/pixi`。
- docs/examples 是否能 typecheck。
- 文字层替换是否没有 viewer 私有 Pixi tree 操作。
- mask 预合成是否有 dirty key/cache，不是每帧重建。
- particle/chaser 是否有 sprite 上限和复用/清理。
- diagnostics 新增字段是否在 `updateDiagnostics()` 和 `clearDiagnostics()` 成对维护。
- `packages/vnicore/vite.config.ts` coverage threshold 是否保持 `80`，未被降低。
- `clearMountedNodes()`、`destroy()`、project switch 是否清理替换节点和 runtime sprites。
- `agents.md` 是否需要同步；如果不需要，报告中写明原因。
- `git diff --check` 是否通过。

## 10. 任务报告要求

任务完成后必须新增：

```text
tasks/70-vnicore-runtime-editor-sync-[utctime].md
```

报告必须包含：

- UTC 完成时间。
- 实现摘要。
- 修改文件列表。
- 新增 public API。
- 性能约束如何落实。
- 新样例 `number2`、`number3`、`roundreel` 的验证结果。
- `agents.md` 是否更新以及原因。
- 执行过的命令和结果。
- 未执行或失败的验收项及原因。
- 浏览器验收结果；如果未执行，写明交给用户的手动验收清单。
- `pnpm-lock.yaml` 是否变化。
- 当前 `git status --short --untracked-files=all` 摘要。

报告中不能把未执行的浏览器验收写成已完成。
