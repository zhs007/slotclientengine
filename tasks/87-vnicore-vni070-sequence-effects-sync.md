# vnicore VNI 0.070 sequence effects sync 任务计划

## 1. 任务目标

持续完善 `packages/vnicore`，把 `docs/anieditor5/src` 当前编辑器更新同步到 Pixi v8 runtime 和上传式 viewer：

```text
packages/vnicore
apps/anieditorv5viewer
```

本任务的核心不是 Cocos Creator 兼容，也不是给 vnicore 增加 Cocos fallback。`packages/vnicore` 是 Pixi.js v8 VNI runtime，只关心两件事：

1. 性能：不能因为编辑器预览代码方便就每帧重建大量 `Sprite`、`Texture`、`Graphics`、切片纹理或 canvas。
2. 动画效果必须和编辑器 Pixi 预览完全一样：同一份给 vnicore 用的 VNI 导出，在 `docs/anieditor5/src/pixi_stage.ts` 中看到的效果，必须在 `packages/vnicore` / `apps/anieditorv5viewer` 中一致。

编辑器导出的 vnicore runtime 包不是 Cocos Creator 兼容版本。因此：

- 不以 `legacy_alpha` / Cocos-compatible export 作为 vnicore 目标输入。
- 不修改 `packages/anieditorv5runtime-cc`。
- 不为了 Cocos 兼容在 vnicore 中增加隐藏适配。
- 对缺资源、未知动画、非法参数、错误 sequence 配置显式失败，不做静默兜底。

本计划是完整可执行版本，不能依赖任何别的上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、viewer 同步、文档同步、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/87-vnicore-vni070-sequence-effects-sync-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/87-vnicore-vni070-sequence-effects-sync-260709-123456.md
```

## 2. 当前已观察到的更新内容

以下是制定本计划时在本地工作区观察到的事实。执行时必须重新验证，不能只照抄本节。

当前 `git status --short --untracked-files=all` 显示只有编辑器源码被修改：

```text
 M docs/anieditor5/src/animation_presets.ts
 M docs/anieditor5/src/constants.ts
 M docs/anieditor5/src/export_project.ts
 M docs/anieditor5/src/main.ts
 M docs/anieditor5/src/pixi_stage.ts
 M docs/anieditor5/src/project_state.ts
 M docs/anieditor5/src/types.ts
```

当前 `git diff --stat -- docs/anieditor5/src packages/vnicore apps/anieditorv5viewer docs/anieditor5/export` 显示：

```text
 docs/anieditor5/src/animation_presets.ts | 1783 ++++++++++++++++++++++++++--
 docs/anieditor5/src/constants.ts         |    2 +-
 docs/anieditor5/src/export_project.ts    |    5 +
 docs/anieditor5/src/main.ts              | 1115 ++++++++++++++++--
 docs/anieditor5/src/pixi_stage.ts        | 1883 +++++++++++++++++++++++++++---
 docs/anieditor5/src/project_state.ts     |   91 ++
 docs/anieditor5/src/types.ts             |   25 +-
 7 files changed, 4535 insertions(+), 369 deletions(-)
```

这次编辑器更新的 runtime 相关变化：

- `docs/anieditor5/src/constants.ts`：`VNI_VERSION` 从 `VNI_0.045` 升到 `VNI_0.070`。
- `docs/anieditor5/src/types.ts`：
  - `V5GLayerType` 新增 `"sequence"`。
  - `V5GAnimationType` 新增：
    - `gather_particles`
    - `smoke_mist`
    - `energy_ring`
    - `slash_light`
    - `flame_flicker`
    - `wave_band`
    - `wave_distort`
    - `speed_lines`
    - `drift_fall`
    - `path_particles`
  - 新增 `V5GSequenceConfig`，字段为 `frameAssetIds`、`cycleDuration`、`loop`。
  - `V5GLayerConfig` 新增可选 `sequence?: V5GSequenceConfig`。
- `docs/anieditor5/src/project_state.ts`：
  - 新增 `DEFAULT_SEQUENCE_FRAME_SECONDS = 0.1`。
  - 新增 `createSequenceLayer()`、`sanitizeSequenceDuration()`、`normalizeProjectSequences()`。
  - `toExportProject()` 会把 `sequence.frameAssetIds` 纳入资源引用集合。
- `docs/anieditor5/src/export_project.ts`：
  - 去重资源时会同步 remap `layer.sequence.frameAssetIds`，避免序列帧引用旧 asset id。
- `docs/anieditor5/src/animation_presets.ts`：
  - 参数规格新增 `select` 和 `visibleWhen`，这是编辑器 UI 能力，vnicore 只需要消费导出后的参数值，不需要实现 UI。
  - 新增 10 个效果的默认参数和 source-layer 显示规则。
  - `getAnimationProgress()` 改为 `time === end` 返回 `1`，只有 `time > end` 才返回 `null`。
  - `particle_combo`、`gather_particles`、`smoke_mist`、`energy_ring`、`slash_light`、`flame_flicker` 使用 `sourceOpacity` 控制原图层显示。
  - `wave_band`、`wave_distort`、`speed_lines`、`drift_fall`、`path_particles` 使用 `keepOriginal` 控制原图层显示，默认隐藏。
- `docs/anieditor5/src/pixi_stage.ts`：
  - `image` 和 `sequence` 都会作为可显示图层、mask 源、粒子/效果宿主处理。
  - `getSequenceFrameAssetId()` 使用 `playheadSeconds`、`cycleDuration`、`frameAssetIds.length` 和 `loop` 计算当前帧；非循环时 clamp 到最后一帧。
  - `drawParticles()` 新增上述 10 个效果的 Pixi 预览绘制路径。
  - 新增效果有明确性能上限，例如 `gather_particles` / `path_particles` 的拖尾会限制到最多约 360 个 sprite。
  - `wave_distort` 会按行切片绘制当前纹理，需要 runtime 侧特别避免每帧创建并泄漏切片 `Texture`。
  - `speed_lines` 使用 `PIXI.Graphics` 画线段，不依赖图片纹理。
- `docs/anieditor5/src/main.ts`：
  - 新增导入序列帧、序列帧属性编辑、图层拖拽时临时 solo、分组拖拽和删除确认等编辑器 UI 能力。
  - 这些 UI 变更不是 vnicore 的 runtime 目标；vnicore 只需要支持导出后的 `sequence` 图层和视觉效果。

当前未看到 `docs/anieditor5/export/*.json` 或 `docs/anieditor5/export/assets/*` 被 git diff 修改。不要手改导出 JSON 来“模拟”新版导出；只有真实编辑器导出或用户提供的新导出文件才作为 fixture 来源。

当前 `apps/anieditorv5viewer` 是上传 zip 为主，`apps/anieditorv5viewer/src/assets` 不存在。不要恢复旧内置 assets 入口。

### 2.1 二次审计补充

二次审计时额外确认了以下容易遗漏的点，执行时必须纳入实现和验收：

- 编辑器 `V5G_PARTICLE_ANIMATION_TYPES` 只是编辑器 UI 分类，不等同于 runtime 绘制入口。`slash_light`、`wave_distort` 虽然不在该集合里，但 `docs/anieditor5/src/pixi_stage.ts::drawParticles()` 明确绘制它们；runtime 必须以 `pixi_stage.ts` 的绘制入口为准。
- `speed_lines` 的几何绘制不使用图片纹理像素，但编辑器仍然只在 `image` / `sequence` 图层且能拿到当前图层 texture 后进入 `drawParticles()`。vnicore 不应把 `speed_lines` 扩成无资源图层上的全局 Graphics 效果。
- 新效果不应直接塞进现有 `VNIParticleRuntime` 的 live/drain 生命周期。现有 `particle_stream` / `particle_wall` / `particle_twinkle` 有 live 粒子排空语义；本次 10 个新增效果是按当前 timeline progress 确定性采样的 visual effect，除非逐项证明与 live particle 语义一致，否则应走单独 sampler / renderer。
- 编辑器当前的 `getAnimationProgress()` 在 `time === start` 返回 `0`，在 `time === end` 返回 `1`。vnicore 不能继续用 `time >= end` 或 `progress <= 0` 把 exact start/end 全局过滤掉；如果某个效果在 progress 0 因 alpha 为 0 不显示，应由该效果采样公式自然决定。
- 编辑器仍显式读取少量旧参数名作为兼容输入，例如 `flame_flicker.speed`、`wave_distort.speed`、`drift_fall.fallSpeed`。这些不是“不必要兜底”，而是编辑器代码当前定义的可选旧字段；vnicore 要么按编辑器语义支持并测试，要么在计划执行时证明新版导出不再需要。
- `packages/vnicore/src/pixi/vni-player.ts` 已经用 `loadPixiTextureFromUrl(... loadParser: "loadTextures")` 解决上传 zip 的 `blob:` texture 解析问题。sequence 帧切换和新增效果不能退回直接 `PIXI.Texture.from(blobUrl)` 或破坏 blob URL 显式 loader。
- `VNIPlayer` 当前 `loadTextures()` 会先对每个 layer 调用 `getLayerAsset(layer, assetsById)`；新增 `sequence` 后这里会成为阻塞点，必须改成 layer-aware validation，不要让 sequence 在初始化时被 image-only helper 拦住。
- `VNIPlayer` 是透明 runtime。`project.stage.backgroundColor` 仍是导出元数据，不要因为同步编辑器或 sequence 首帧而在 vnicore 中绘制 stage 背景。

## 3. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。若确实新增或调整依赖，必须执行：

```bash
pnpm install
```

并在任务报告中说明 `pnpm-lock.yaml` 是否变化。

如果 `pnpm --filter ...` 或 `pnpm exec ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter anieditorv5viewer test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。禁止通过未知动画退回 `idle`、缺资源静默跳过、自动猜资源路径、吞掉校验错误、viewer 私下复制 runtime 算法等方式“跑通”。

## 4. 必须先执行的现状确认

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat -- docs/anieditor5/src packages/vnicore apps/anieditorv5viewer docs/anieditor5/export
git diff -- docs/anieditor5/src/constants.ts docs/anieditor5/src/types.ts docs/anieditor5/src/project_state.ts docs/anieditor5/src/export_project.ts
git diff -- docs/anieditor5/src/animation_presets.ts docs/anieditor5/src/pixi_stage.ts docs/anieditor5/src/main.ts
```

必须确认 viewer 当前仍是上传 zip 入口：

```bash
test ! -e apps/anieditorv5viewer/src/assets
git ls-files apps/anieditorv5viewer
```

必须确认导出文件和 vnicore fixture 文件：

```bash
git ls-files docs/anieditor5/export
git ls-files packages/vnicore/tests/fixtures/export
```

如果 `docs/anieditor5/export` 有真实新增或修改的导出文件，必须同步到 `packages/vnicore/tests/fixtures/export` 并做字节一致校验。不要只复制 JSON，相关图片也要纳入 zip/viewer 验收。

## 5. 必须阅读的文件

执行时必须重新阅读当前实现，以实际代码为准。至少阅读：

```text
AGENTS.md
agents.md
docs/anieditor5/src/constants.ts
docs/anieditor5/src/types.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/export_project.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/main.ts
docs/anieditor5/export/*.json
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/src/core/render-effect-sampler.ts
packages/vnicore/src/core/safe-glow-sampler.ts
packages/vnicore/src/core/chaser-light-sampler.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/precomposed-light-mask.ts
packages/vnicore/src/pixi/index.ts
packages/vnicore/tests/core/*.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/examples/*
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts
apps/anieditorv5viewer/tests/*.test.ts
apps/anieditorv5viewer/README.md
```

特别对比：

```text
docs/anieditor5/src/pixi_stage.ts
  getSequenceFrameAssetId()
  drawParticles()
  drawGatherParticles()
  drawSmokeMist()
  drawEnergyRing()
  drawSlashLight()
  drawFlameFlicker()
  drawWaveBand()
  drawWaveDistort()
  drawSpeedLines()
  drawDriftFall()
  drawPathParticles()
  getAnimationProgress()
  samplePathParticlePoint()
  sampleGatherParticlePoint()

packages/vnicore/src/core/*
packages/vnicore/src/pixi/vni-player.ts
```

`packages/vnicore` 当前已经有 `precomposed-light-mask` 路径，本任务仍要保留回归测试，但不要把旧的 `precompose_light_alpha` 问题误当成这次主线。真正主线是 `VNI_0.070` 的 `sequence` 图层和新增效果族。

## 6. 实现范围和非范围

### 6.1 必须实现

1. `packages/vnicore` 支持 `VNI_0.070` 当前导出 schema 中的 `sequence` 图层。
2. `packages/vnicore` 支持 10 个新增效果，并与 `docs/anieditor5/src/pixi_stage.ts` Pixi 预览语义一致：
   - `gather_particles`
   - `smoke_mist`
   - `energy_ring`
   - `slash_light`
   - `flame_flicker`
   - `wave_band`
   - `wave_distort`
   - `speed_lines`
   - `drift_fall`
   - `path_particles`
3. `sequence` 图层的当前帧选择、mask、粒子/效果纹理都必须按编辑器 `getSequenceFrameAssetId()` 语义执行。
4. 所有动画进度 helper 必须按编辑器当前语义统一：`time < start` 为 inactive，`time > end` 为 inactive，`time === end` 返回 progress `1`。如果旧测试期待 exact end inactive，应修改测试 contract。
5. 新效果的原图层显示规则必须和编辑器一致：
   - `particle_combo`、`gather_particles`、`smoke_mist`、`energy_ring`、`slash_light`、`flame_flicker` 使用 `sourceOpacity`。
   - `wave_band`、`wave_distort`、`speed_lines`、`drift_fall`、`path_particles` 使用 `keepOriginal`，默认隐藏原图层。
   - 不要凭字段名自行新增编辑器没有使用的行为，例如不要擅自实现 `smoke_mist.keepOriginalAtEnd`，除非执行时确认编辑器代码已经使用它。
6. Pixi runtime 必须用更经济的实现达到编辑器视觉：
   - 可用 core sampler 输出确定性样本，再由 Pixi 层复用 sprite/graphics。
   - 不逐帧销毁重建成百上千个 `Sprite`。
   - `wave_distort` 的切片 texture 必须缓存并在 texture/rows/frame 改变或 player destroy 时释放。
   - `speed_lines` 可复用每层 `PIXI.Graphics`，每帧 clear/redraw，不要创建无限 graphics。
   - 粒子拖尾上限必须对齐编辑器的性能保护，例如 `gather_particles` / `path_particles` 总 sprite 约束。
7. `apps/anieditorv5viewer` 能加载新版 zip，并通过 `VNIPlayer` public API 预览，不在 viewer 中复制 runtime 算法。
8. 文档、示例和测试必须同步。
9. 任务完成后必须写中文任务报告。

### 6.2 不应实现

1. 不修改 `packages/anieditorv5runtime-cc`。
2. 不恢复 `apps/anieditorv5viewer/src/assets` 旧内置项目目录。
3. 不在 viewer 中 hardcode 新动画类型的 Pixi 绘制。
4. 不把编辑器 UI 的 `select` / `visibleWhen` 参数面板能力搬进 vnicore。
5. 不手工伪造 `docs/anieditor5/export/*.json` 的 `schemaVersion` 或动画数据。
6. 不让 vnicore 接受缺失 `frameAssetIds`、缺 asset、非法 `cycleDuration`、未知动画参数类型后继续渲染。
7. 不降低 `packages/vnicore` coverage 门禁。
8. 不绘制 `project.stage.backgroundColor`；vnicore 继续保持透明 Pixi runtime。

## 7. vnicore 实现步骤

### 7.1 类型和校验

修改：

```text
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/tests/core/validation.test.ts
```

要求：

- `V5GLayerType` 增加 `"sequence"`。
- 增加 `V5GSequenceConfig` / `VNISequenceConfig` 类型别名。
- `V5GLayerConfig` 增加 `sequence?: V5GSequenceConfig`。
- `V5GAnimationType` 增加 10 个新效果。
- `SUPPORTED_ANIMATION_TYPES`、默认 easing、required numeric params、optional boolean params、optional numeric params 同步当前编辑器默认参数。
- 更新 `packages/vnicore/src/core/index.ts` 的 public export；如新增 Pixi helper 类型，也同步 `packages/vnicore/src/pixi/index.ts`。
- `sequence` layer 校验必须显式：
  - `layer.type === "sequence"` 时 `assetId` 必须为 `null`。
  - `sequence` 必须存在。
  - `frameAssetIds` 必须是非空数组。
  - 每个 frame asset id 必须存在于 `project.assets`，且 asset type 为 `image`。
  - `cycleDuration` 必须是 finite positive number。
  - `loop` 必须是 boolean。
  - 允许多个 frame 引用同一个 asset，但不允许引用缺失 asset。
  - 非 `sequence` 图层不应携带 `sequence` 字段；如果出现，应显式失败，避免隐藏脏导出。
- 继续保持 `project.particles` 不支持的显式失败边界。
- 继续保持 `legacy_alpha` 在 vnicore Pixi runtime 中显式失败。

### 7.2 sequence 当前帧解析

建议新增或集中实现 helper，例如：

```text
packages/vnicore/src/core/sequence-layer.ts
```

或放在现有合适模块中，但必须有单测。语义必须等价于编辑器：

```text
frameAssetIds = layer.sequence.frameAssetIds
if frameAssetIds.length === 1 -> frameAssetIds[0]
cycleDuration = max(0.01, layer.sequence.cycleDuration)
frameDuration = cycleDuration / frameAssetIds.length
rawTime = max(0, sample/playhead time)
sequenceTime = loop === false
  ? min(rawTime, max(0, cycleDuration - 0.000001))
  : positiveModulo(rawTime, cycleDuration)
frameIndex = floor(sequenceTime / max(0.000001, frameDuration))
```

必须测试：

- 单帧 sequence 始终返回唯一帧。
- 多帧 loop sequence 在边界时间正确循环。
- 非 loop sequence 在超过 `cycleDuration` 后保持最后一帧。
- `time === cycleDuration` 的 loop sequence 回到第 0 帧；非 loop sequence 保持最后一帧。
- 非法 frame / duration 在 validation 阶段失败，不在 runtime helper 中兜底。

### 7.3 layer-instance 和 VNIPlayer 支持 sequence

修改：

```text
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/pixi/vni-player.test.ts
```

要求：

- `createLayerInstance()` 支持 `sequence`，创建一个可复用 `PIXI.Sprite`。
- 不要因为每帧变化而销毁重建 layer display。应该在 render/update 时根据当前时间切换 sprite texture、textureSize 和 display compensation。
- `getLayerAsset()` 当前只支持 `image`，不能直接拿来处理 sequence。应新增明确的当前显示资源解析函数，例如：
  - `getLayerDisplayAssetId(layer, time)`
  - `getLayerDisplayAsset(layer, time, assetsById)`
  - `getLayerDisplayTexture(layer, time, texturesByAssetId)`
- mask、precompose、safe glow、render effect、particle、chaser、新效果都必须拿当前显示帧，而不是拿 `assetId`。
- `loadTextures()` 必须继续加载 `project.assets` 中的所有图片，并继续使用显式 Pixi texture loader，避免上传 zip 的 `blob:` URL 解析回归。
- 按编辑器当前逻辑，`precompose_light_alpha` 仍只对 image target/source 生效；sequence 作为 mask 源时走 native mask，不要扩展成编辑器没有的 precompose 行为，除非执行时确认编辑器已改。
- viewer/player 的 diagnostics 可增加当前 sequence 帧或 sequence layer 数量，但不要把 diagnostics 当 runtime 逻辑依据。

### 7.4 动画进度语义统一

修改所有独立 progress helper，至少包括：

```text
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/render-effect-sampler.ts
packages/vnicore/src/core/safe-glow-sampler.ts
packages/vnicore/src/core/chaser-light-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
```

要求：

- 与编辑器 `getAnimationProgress()` 对齐：`time === start` 返回 `0`，`time === end` 返回 `1`，`time > end` inactive。
- 不允许在通用 progress helper 里用 `progress <= 0` 或 `time >= end` 过滤所有效果。
- 如果现有测试写着“exact start/end suppress”，必须逐条判断是不是旧 contract。若与编辑器效果冲突，修改测试，不要改生产逻辑迎合旧测试。
- `sampleProjectAtTime()` 的 coverage 判断已经使用 `time <= start + duration`，保留并补充新效果覆盖。

### 7.5 新效果 sampler

建议把新效果从旧 live particle runtime 中分层出来，避免一个文件无限膨胀。可以新增：

```text
packages/vnicore/src/core/effect-sampler.ts
```

也可以扩展现有 `particle-sampler.ts` / `render-effect-sampler.ts`，但必须保持职责清晰：

- `particle_stream`、`particle_twinkle`、`particle_wall` 等已有 live 粒子语义不要被新效果破坏。
- `gather_particles`、`smoke_mist`、`energy_ring`、`slash_light`、`flame_flicker`、`wave_band`、`wave_distort`、`speed_lines`、`drift_fall`、`path_particles` 必须有确定性采样输出。
- 不要只按编辑器 `V5G_PARTICLE_ANIMATION_TYPES` 分类接入；必须逐项对照 `drawParticles()` 的实际分支。
- 不要让新增效果默认进入 `VNIParticleRuntime` 的 live/drain 排空逻辑。若某个新增效果确实需要 drain，必须在实现和报告中单独说明依据。
- 每个 sampler 都必须使用编辑器中的 seed/salt、坐标正负、easing、alpha、scale、rotation、blendMode 语义。
- `targetY`、`endY`、`windY` 等 y 坐标需要按编辑器逻辑取反，不能只看参数名猜测。
- `slash_light` / `energy_ring` 的 `additive` 默认 true，false 时继承图层 blendMode。
- `speed_lines` 不读取 texture 像素，但仍必须保持 image/sequence 宿主、asset 存在性、layer opacity 和 blendMode 语义。
- `wave_distort` 的输出建议是行切片 sample，包含 source frame、目标位置、scale、rotation、alpha，而不是在 core 中创建 Pixi texture。
- 明确处理编辑器仍读取的旧字段 fallback：`flame_flicker.speed`、`wave_distort.speed`、`drift_fall.fallSpeed`。这些字段应作为受测 optional legacy params，而不是无记录兜底。

最低单测要求：

- 每个新增效果至少一条 deterministic sample 测试。
- 覆盖 alpha 为 0 时不输出。
- 覆盖 source-layer opacity 规则。
- 覆盖总 sprite 上限或 trail 上限。
- 覆盖 `time === animation.startTime + duration` 仍按 progress `1` 采样。
- 覆盖 `sequence` layer 作为效果宿主时使用当前帧 textureSize。

### 7.6 Pixi 渲染和对象复用

修改：

```text
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/pixi/vni-player.test.ts
```

要求：

- 新效果渲染统一走 `VNIPlayer` 内部 runtime display 管理，不能让 viewer 介入。
- 能复用 sprite 的效果必须复用数组池，类似当前 `chaserLightSpritesByLayer` / `liveParticleSpritesByLayer`。
- 不应照搬编辑器每帧 `new PIXI.Sprite(texture)` 后统一 destroy 的写法。
- `Graphics` 类效果可以复用每层 graphics，更新时 `clear()` 后重画。
- `wave_distort` 切片 texture 必须按 `texture source + frame + rows` 缓存；当项目切换、layer 销毁、rows 变化或 player destroy 时销毁。
- 运行时 display 顺序必须保持：
  - 原 layer display
  - precomposed light mask sprite
  - safe_glow
  - render/effect sprites
  - chaser_light
  - live/new particles
  - mounted external nodes 按现有规则
- 新效果不能改变 layer group render order、text layer attachment、mask 行为、segmented playback 事件。

### 7.7 viewer 同步

修改：

```text
apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/tests/uploaded-zip-project.test.ts
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/README.md
```

要求：

- 上传 zip 能加载包含 `sequence.frameAssetIds` 的项目。
- 资源 URL 解析必须覆盖所有 `project.assets`，包括只被 sequence frame 引用的资产。
- 如果 zip 中缺少 sequence frame 图片，必须明确报错。
- 如果 viewer summary / diagnostics 展示动画类型、资源数或 live particle 数，需要同步措辞，避免把新增 deterministic effect 误报成 live particle。
- viewer 不维护新增效果列表的绘制逻辑；最多用于 summary/diagnostics 展示。
- viewer 仍使用 `@slotclientengine/vnicore` public API，不访问 `VNIPlayer` 私有 Pixi display tree。

## 8. fixture 和导出同步

如果执行时 `docs/anieditor5/export` 有新版真实导出：

1. 同步 JSON：

```bash
cp docs/anieditor5/export/<name>.json packages/vnicore/tests/fixtures/export/<name>.json
```

2. 如果导出依赖新图片，保证测试 zip 或 viewer 测试输入包含这些图片。
3. 做字节一致校验：

```bash
cmp docs/anieditor5/export/<name>.json packages/vnicore/tests/fixtures/export/<name>.json
```

如果没有真实新版导出，不要伪造 `docs/anieditor5/export`。可以在 `packages/vnicore/tests` 中构造最小内联项目对象测试 schema 和 runtime 行为，但任务报告中必须说明真实编辑器导出仍待用户或后续任务补充。

## 9. 文档同步

至少检查并按实际实现更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
apps/anieditorv5viewer/README.md
```

文档必须说明：

- vnicore 是 Pixi v8 runtime。
- 支持 `VNI_0.070` 的 `sequence` 图层。
- 支持新增效果列表。
- `project.particles` 仍不支持。
- `legacy_alpha` / Cocos-compatible export 不是 vnicore 目标输入。
- `sequence` 的 `frameAssetIds` 必须完整携带在 zip/assets 中。
- viewer 通过上传 zip 预览，不恢复旧内置项目目录。

## 10. agents 同步判断

执行后必须判断是否需要同步协作规则：

- 如果只是实现 `tasks/87...` 内部功能，且没有新增长期仓库规则，可以不改 `AGENTS.md` / `agents.md`，但任务报告要写明“已检查，无需更新”。
- 如果确认 `sequence` 图层或 `VNI_0.070` 新效果成为长期协作规则，必须同步更新 `AGENTS.md` 和 `agents.md`，两者内容保持一致。
- 不要只改其中一个文件。

建议新增长期规则时包含以下边界：

```text
packages/vnicore 必须支持 VNI_0.070 sequence 图层和编辑器 Pixi 预览新增效果；sequence 当前帧、mask、粒子/效果纹理必须以 docs/anieditor5/src/pixi_stage.ts 为准；新增效果不得在 viewer 私下复制 runtime 算法。
```

## 11. 验收命令

任务完成前必须执行任务范围内的严格验收。推荐顺序：

```bash
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore build

CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer build

pnpm --filter @slotclientengine/vnicore format:check
pnpm --filter anieditorv5viewer format:check
git diff --check
```

如果执行 root 级命令：

```bash
CI=true pnpm typecheck
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm build
pnpm format:check
```

发现无关 package 失败，不要顺手改无关代码。任务报告必须区分：

- 任务范围内通过的命令。
- root 级无关失败的 package、错误摘要和是否与本任务无关。

## 12. 浏览器 / 视觉验收

`packages/vnicore` 的核心验收是非浏览器测试和构建必须通过，但视觉 parity 需要真实 viewer 或浏览器确认。

执行实现后启动 viewer：

```bash
pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1 --port 5178
```

用包含 `VNI_0.070`、`sequence`、新增效果的真实导出 zip 验证：

- sequence frame 播放速度、loop / non-loop 边界和编辑器一致。
- 10 个新增效果在关键时间点和编辑器 Pixi 预览一致。
- `sourceOpacity` / `keepOriginal` 的原图层显示一致。
- `wave_distort` 没有明显错位、反向或切片缝隙。
- `speed_lines` 位置、方向、alpha、线宽、blendMode 一致。
- 播放、暂停、seek、range/segmented playback 不破坏 sequence 当前帧。
- 反复播放、seek、切换 zip 后 diagnostics 中 runtime display 数量不会持续增长。

如果当前机器无法完成浏览器验收，任务报告必须明确写为“浏览器视觉验收未执行”，并给出用户手动验收步骤，不能写成已完成。

## 13. 二次审计清单

提交前必须做一次真实二次审计，逐项确认：

- `rg -n "sequence|gather_particles|smoke_mist|energy_ring|slash_light|flame_flicker|wave_band|wave_distort|speed_lines|drift_fall|path_particles" packages/vnicore apps/anieditorv5viewer` 能看到类型、校验、sampler、Pixi 渲染、测试覆盖。
- `rg -n "packages/anieditorv5runtime-cc|standalone.zip" git-diff-output` 不应出现本任务改动。
- `apps/anieditorv5viewer/src/assets` 仍不存在。
- 没有把新增效果绘制逻辑放到 viewer。
- 没有降低 coverage 阈值。
- 没有通过宽松 unknown fallback 接受新动画。
- 没有手工伪造 docs export。
- 没有新增 stage background 绘制。
- 没有让新增 deterministic effect 误入 `VNIParticleRuntime` live/drain 生命周期。
- 上传 zip / blob URL 图片加载仍走 `loadParser: "loadTextures"` 的共享 loader。
- 新增 core / pixi helper 的 public export、README、中文 docs 和 examples 已同步。
- `sequence` frame assets 被 validation、asset URL resolution、runtime texture switching、mask/effect sampling 覆盖。
- `time === start` / `time === end` 行为在所有相关 sampler 测试中一致。
- `wave_distort` 切片 texture 和 precomposed mask texture 都有 destroy 清理。
- `git status --short --untracked-files=all` 中只保留本任务相关改动。

## 14. 任务报告模板

任务完成后新增：

```text
tasks/87-vnicore-vni070-sequence-effects-sync-[utctime].md
```

报告必须包含：

```markdown
# vnicore VNI 0.070 sequence effects sync 任务报告

## 1. 完成内容

- ...

## 2. 关键实现

- `packages/vnicore/...`
- `apps/anieditorv5viewer/...`

## 3. 编辑器 parity 对照

- sequence 当前帧：
- 新增效果：
- sourceOpacity / keepOriginal：
- progress end-inclusive：

## 4. 性能处理

- sprite / graphics / texture 复用：
- wave_distort 切片 texture 清理：
- diagnostics 或测试证据：

## 5. 验收命令

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `CI=true pnpm --filter @slotclientengine/vnicore typecheck` | 通过/失败 | ... |

## 6. 浏览器视觉验收

- 已执行：说明 URL、zip、样例、结果。
- 未执行：说明原因和手动验收步骤。

## 7. agents.md 同步

- 已检查，是否更新 `AGENTS.md` / `agents.md`：

## 8. 未完成 / 风险

- ...
```

报告中不能把未执行的浏览器视觉验收写成已完成，不能隐瞒 root 级无关失败，也不能把测试为迎合错误实现而改弱。
