# vnicore safe glow node insertion 任务计划

## 1. 任务目标

持续完善 Pixi.js v8 VNI 动画核心库：

```text
/Users/zerro/github.com/slotclientengine/packages/vnicore
```

以及基于它播放 VNI 导出资源的 viewer：

```text
/Users/zerro/github.com/slotclientengine/apps/anieditorv5viewer
```

本任务跟进 `docs/anieditor5/src` 的最新 editor 代码和 `docs/anieditor5/export` 的新增导出资源，完成三件事：

1. 在 `packages/vnicore` 支持 `VNI_0.017` 新动画类型 `safe_glow`。
2. 在 `apps/anieditorv5viewer` 接入新增导出 `lock_01.json` 和它引用的 assets。
3. 保持并严格验收 layer group 中间插入节点能力：viewer UI 可以从当前 assets 目录选择一张图片，不上传文件，把图片插入两个相邻 render group 中间。

同时必须确认既有 `docs/anieditor5/export2` 缩小图片导出资源不回归。`export2/edit_full` 和 `export2/runtime_50` 的 profile-scoped asset manifest、`fileWidth/fileHeight/fileScale` 校验、`assetScale` diagnostics 和显示补偿都属于本任务的非回归验收范围。

`safe_glow` 是这次 editor 侧最重要的变化。它和旧 `glow` 不同：

- `safe_glow` 不使用旧 render effect 语义，不依赖滤镜、模糊、`screen` / `lighten` 等特殊效果。
- `safe_glow` 使用同一张图片的副本，通过缩放和透明度呼吸模拟高亮。
- `safe_glow` 的 Pixi 渲染必须使用 `normal` blend，参数为 `spread`、`minOpacity`、`maxOpacity`、`pulses`、`keepOriginal`。
- `keepOriginal=false` 时，原图隐藏，但发光副本仍然需要渲染；不能因为 sampled layer opacity 为 0 就把整层提前裁掉。
- `safe_glow` 在动画起始帧就可以出现，不能复用旧 `render-effect-sampler` 对 `glow/shatter` 的“起始帧不出效果”规则。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、浏览器验收、文档同步、协作规则同步判断和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/46-vnicore-safe-glow-node-insertion-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/46-vnicore-safe-glow-node-insertion-260625-123456.md
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

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
git diff -- docs/anieditor5/src/animation_presets.ts docs/anieditor5/src/constants.ts docs/anieditor5/src/pixi_stage.ts docs/anieditor5/src/types.ts
```

注意：`git diff` 不会展示 untracked 文件内容，本任务新增的 `docs/anieditor5/export/lock_01.json` 和 7 张图片当前可能只出现在 `git status --short --untracked-files=all` 中。执行者必须显式检查 untracked 文件，不能只看 `git diff`。

当前仓库同时存在：

```text
AGENTS.md
agents.md
```

两者当前内容一致。若本任务新增长期协作规则，必须同步更新两个文件，并用下面命令确认一致：

```bash
cmp -s AGENTS.md agents.md
```

当前 `AGENTS.md` / `agents.md` 已经要求 `packages/vnicore` 拥有 VNI 播放状态机、layer group render order 和 group slot 挂接语义，viewer 只能做 UI 配置、输入校验、状态展示和调用。因此本任务默认不需要修改协作规则；只有当实现中新增了必须长期遵守的仓库级规则时才更新两个文件。是否更新以及原因必须写入任务报告。

## 3. 当前已知事实

执行时必须重新阅读当前实现，以实际代码为准。当前已经观察到的事实如下。

### 3.1 editor 侧最新改动

当前 tracked diff 涉及：

```text
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/constants.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/types.ts
```

关键变化：

- `docs/anieditor5/src/constants.ts` 把 `VNI_VERSION` 从 `VNI_0.016` 升到 `VNI_0.017`。
- `docs/anieditor5/src/types.ts` 在 `V5GAnimationType` 中新增 `safe_glow`。
- `docs/anieditor5/src/animation_presets.ts` 新增 `safe_glow` preset：
  - label：`Safe Glow Cocos发光`
  - 默认时长：`1.2`
  - 默认 easing：`linear`
  - 参数：`spread`、`minOpacity`、`maxOpacity`、`pulses`、`keepOriginal`
  - 说明：只用同图副本、缩放和透明度呼吸模拟高亮，不依赖滤镜、模糊或特殊混合。
- `docs/anieditor5/src/animation_presets.ts` 的 `sampleLayerAnimationsAtTime(...)` 已经把 `glow` 和 `safe_glow` 都交给 `sampleGlowSource(...)` 处理 `keepOriginal`。
- `docs/anieditor5/src/pixi_stage.ts` 新增 `drawSafeGlow(...)`：
  - 从 animation params 读取 `spread`、`minOpacity`、`maxOpacity`、`pulses`。
  - `wave = pulses <= 0 ? 1 : (1 - cos(progress * PI * 2 * pulses)) / 2`
  - `alpha = layerOpacity * lerp(minOpacity, maxOpacity, wave)`
  - 创建同 texture 的 `PIXI.Sprite`。
  - 使用原 layer anchor、position、rotation。
  - scale 乘以 `1 + spread`。
  - `blendMode = "normal"`。
  - `alpha <= 0.002` 或 `spread <= 0.001` 时不绘制副本。

### 3.2 新增导出资源

当前新增导出文件：

```text
docs/anieditor5/export/lock_01.json
```

当前新增图片：

```text
docs/anieditor5/export/assets/2_asset_image_mqqlcjh9_h.png
docs/anieditor5/export/assets/image_asset_image_mqp7sep7_i.png
docs/anieditor5/export/assets/image_asset_image_mqp7sgo9_k.png
docs/anieditor5/export/assets/image_asset_image_mqp7sii7_m.png
docs/anieditor5/export/assets/image_asset_image_mqp7sjxy_o.png
docs/anieditor5/export/assets/image_asset_image_mqs1j1mw_g.png
docs/anieditor5/export/assets/image_asset_image_mqs1pl10_h.png
```

`lock_01.json` 摘要：

```text
schemaVersion: VNI_0.017
name: lock_01
stage: 2000x2000, duration 4s, coordinate center
layerGroups:
  group_default / 默认组 / order 0
layerCount: 8
assetCount: 7
animationTypes:
  pop, fade, move, safe_glow, shake, idle, scale_out, slide_out, particle_twinkle
```

`lock_01.json` 只有一个 layer group，因此它不会产生合法 group slot。它用于验收 `VNI_0.017`、`safe_glow`、`idle`、`particle_twinkle` 和新增 assets 播放；组间插入仍需要使用 `3reel_multipay_01.json` 或 `3reel_multipay_02.json` 这类有两个相邻 render group 的 fixture。

`docs/anieditor5/export` 是单项目 100% 导出资源目录，`docs/anieditor5/export2` 是带 `manifest.json` 的多 profile 导出资源目录：

```text
docs/anieditor5/export2/manifest.json
docs/anieditor5/export2/edit_full/project.json
docs/anieditor5/export2/edit_full/assets/
docs/anieditor5/export2/runtime_50/project.json
docs/anieditor5/export2/runtime_50/assets/
```

`runtime_50` 图片文件是缩小后的运行时资源，但 JSON 中的 `asset.width` / `asset.height` 仍表示逻辑尺寸，真实文件尺寸由 `fileWidth` / `fileHeight` / `fileScale` 描述。实现 `safe_glow` 和组间插入时不能破坏这条显示补偿和校验合同。

### 3.3 当前 vnicore 状态

当前 `packages/vnicore` 已经支持：

- `VNI_0.x` schemaVersion。
- `idle`。
- `glow`。
- `shatter`。
- `squash_stretch`。
- `particle_twinkle`、`particle_wall`、`particle_combo`。
- `project.layerGroups + layer.groupId`。
- render group 顺序来自 `project.layers` 中连续的 group run，不使用 `layerGroups.order` 重排画面。
- `getLayerGroupSlots()` 只返回相邻 group run 之间的 slot。
- `VNIPlayer.attachNodeBetweenLayerGroups(...)`。
- `VNIPlayer.attachImageBetweenLayerGroups(...)`。
- `VNIPlayer.attachExternalImageBetweenLayerGroups(...)`。
- `VNIPlayer.detachMountedNode(...)`。
- `VNIPlayer.clearMountedNodes()`。

当前缺口：

- `packages/vnicore/src/core/types.ts` 尚未包含 `safe_glow`。
- `packages/vnicore/src/core/animation-sampler.ts` 尚未把 `safe_glow` 纳入 supported/default easing/`keepOriginal` source opacity 逻辑。
- `packages/vnicore/src/core/validation.ts` 尚未验证 `safe_glow` 必需参数。
- `packages/vnicore/src/core/render-effect-sampler.ts` 当前只处理 `shatter | glow`，且 `glow` 是旧 deterministic render effect；`safe_glow` 不应加入这里。
- `packages/vnicore/src/core/project-sampler.ts` 当前只用 `hasActiveRenderEffect` 保持 `keepOriginal=false` 的旧 effect 层可见；`safe_glow` 需要独立可见性状态。
- `packages/vnicore/src/pixi/layer-instance.ts` / `vni-player.ts` 当前只有 `display`、`effectDisplay`、`particleDisplay`；`safe_glow` 应作为普通同图副本覆盖层渲染，不应混进旧 render effect 计数。

### 3.4 当前 viewer 状态

当前 `apps/anieditorv5viewer` 已经有组间插入 UI：

- `apps/anieditorv5viewer/src/ui/controls.ts`
  - asset 下拉。
  - slot 下拉。
  - `插入` 按钮。
  - `移除` 按钮。
  - `setLayerGroupSlots(...)`。
  - `setInsertedNodeActive(...)`。
- `apps/anieditorv5viewer/src/main.ts`
  - 通过 `VNIPlayer.attachImageBetweenLayerGroups(...)` 插入当前 project asset。
  - 通过 `VNIPlayer.attachExternalImageBetweenLayerGroups(...)` 插入当前 assets 目录中未被当前 project 引用的图片。
  - 插入位置默认是 stage 中心。

当前 viewer 缺口：

- `apps/anieditorv5viewer/src/assets/projects/lock_01.json` 尚未接入。
- `apps/anieditorv5viewer/src/assets/assets/` 尚缺 `lock_01.json` 引用的 7 张图片。
- `apps/anieditorv5viewer/src/config/bundled-projects.ts` 尚未 import/register `lock_01`。
- viewer 的 project selector、summary、asset 下拉、slot 状态需要覆盖：
  - `lock_01`：播放正常、显示 `VNI_0.017`、类型包含 `safe_glow`，slot 状态为无合法 slot。
  - `3reel_multipay_01` / `3reel_multipay_02`：仍可选择 asset 并插入相邻 group 中间。

### 3.5 非目标

本任务不修改 Cocos Creator runtime：

```text
packages/anieditorv5runtime-cc
```

`safe_glow` 以后确实有跨引擎价值，但本任务的实现范围是 `packages/vnicore` 和 `apps/anieditorv5viewer`。如果后续需要同步到 Cocos runtime，应另开任务，继续遵守 `packages/anieditorv5runtime-cc` 的模块化源码、standalone 单文件、`scripts/check-standalone.mjs`、standalone 测试和 `standalone.zip` 同步规则。不要在任务 46 中顺手改 Cocos 交付面。

## 4. 目标文件清单

### 4.1 只读参考源

执行时必须重新阅读：

```text
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/constants.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/types.ts
docs/anieditor5/export/lock_01.json
docs/anieditor5/export/3reel_multipay_01.json
docs/anieditor5/export/3reel_multipay_02.json
docs/anieditor5/export2/manifest.json
docs/anieditor5/export2/edit_full/project.json
docs/anieditor5/export2/runtime_50/project.json
tasks/44-vnicore-layer-group-slot-insertion.md
tasks/45-anieditorv5runtime-cc-layer-groups-render-effects.md
AGENTS.md
agents.md
```

不要把 `docs/anieditor5/src` 当作 vnicore 的运行时代码直接复用；它是 editor/source-of-truth 参考。vnicore 要实现自己的稳定 core/pixi API 和测试。

### 4.2 vnicore 需要修改或新增的文件

```text
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/safe-glow-sampler.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/fixtures/export/lock_01.json
packages/vnicore/tests/core/animation-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/safe-glow-sampler.test.ts
packages/vnicore/tests/core/render-effect-sampler.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
```

若实现时确认不需要新增 `safe-glow-sampler.ts`，必须在任务报告说明替代设计；但 `safe_glow` 不允许作为 `render-effect-sampler` 的 `VNIRenderEffectType` 实现。

### 4.3 viewer 需要修改或新增的文件

```text
apps/anieditorv5viewer/src/assets/projects/lock_01.json
apps/anieditorv5viewer/src/assets/assets/2_asset_image_mqqlcjh9_h.png
apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sep7_i.png
apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sgo9_k.png
apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sii7_m.png
apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sjxy_o.png
apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqs1j1mw_g.png
apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqs1pl10_h.png
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/styles.css
```

`main.ts`、`controls.ts`、`styles.css` 只有在现有插入 UI 不能满足本任务验收时才修改。不要为了“看起来新增了 UI”重复实现一套插入逻辑。

## 5. 实施步骤

### 5.1 准备和资源同步

1. 在仓库根目录执行：

   ```bash
   git status --short --untracked-files=all
   git diff --stat
   ```

2. 确认新增资源存在。若任何文件缺失，停止实现并在任务报告中说明，不要伪造 asset 或 JSON：

   ```bash
   test -f docs/anieditor5/export/lock_01.json
   test -f docs/anieditor5/export/assets/2_asset_image_mqqlcjh9_h.png
   test -f docs/anieditor5/export/assets/image_asset_image_mqp7sep7_i.png
   test -f docs/anieditor5/export/assets/image_asset_image_mqp7sgo9_k.png
   test -f docs/anieditor5/export/assets/image_asset_image_mqp7sii7_m.png
   test -f docs/anieditor5/export/assets/image_asset_image_mqp7sjxy_o.png
   test -f docs/anieditor5/export/assets/image_asset_image_mqs1j1mw_g.png
   test -f docs/anieditor5/export/assets/image_asset_image_mqs1pl10_h.png
   ```

3. 复制新增导出 JSON 到 viewer 和 vnicore test fixture：

   ```bash
   cp docs/anieditor5/export/lock_01.json apps/anieditorv5viewer/src/assets/projects/lock_01.json
   cp docs/anieditor5/export/lock_01.json packages/vnicore/tests/fixtures/export/lock_01.json
   ```

4. 复制新增图片到 viewer 内置 assets 目录：

   ```bash
   cp docs/anieditor5/export/assets/2_asset_image_mqqlcjh9_h.png apps/anieditorv5viewer/src/assets/assets/
   cp docs/anieditor5/export/assets/image_asset_image_mqp7sep7_i.png apps/anieditorv5viewer/src/assets/assets/
   cp docs/anieditor5/export/assets/image_asset_image_mqp7sgo9_k.png apps/anieditorv5viewer/src/assets/assets/
   cp docs/anieditor5/export/assets/image_asset_image_mqp7sii7_m.png apps/anieditorv5viewer/src/assets/assets/
   cp docs/anieditor5/export/assets/image_asset_image_mqp7sjxy_o.png apps/anieditorv5viewer/src/assets/assets/
   cp docs/anieditor5/export/assets/image_asset_image_mqs1j1mw_g.png apps/anieditorv5viewer/src/assets/assets/
   cp docs/anieditor5/export/assets/image_asset_image_mqs1pl10_h.png apps/anieditorv5viewer/src/assets/assets/
   ```

5. 用 Node 摘要确认 `lock_01` 的 schema、动画类型、assets，没有解析错误：

   ```bash
   node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('docs/anieditor5/export/lock_01.json','utf8')); console.log({schemaVersion:p.schemaVersion,name:p.name,groups:p.layerGroups?.length,layers:p.layers?.length,assets:p.assets?.length,types:[...new Set(p.layers.flatMap(l=>l.animations.map(a=>a.type)))]});"
   ```

6. 确认 `export2` 缩小资源合同仍存在，不要因为复制 `lock_01` 资源影响 profile-scoped assets：

   ```bash
   test -f docs/anieditor5/export2/manifest.json
   test -f docs/anieditor5/export2/edit_full/project.json
   test -f docs/anieditor5/export2/runtime_50/project.json
   node -e "const fs=require('fs'); const manifest=JSON.parse(fs.readFileSync('docs/anieditor5/export2/manifest.json','utf8')); const runtime=JSON.parse(fs.readFileSync('docs/anieditor5/export2/runtime_50/project.json','utf8')); const asset=runtime.assets.find(a=>a.fileScale===0.5); console.log({exports:manifest.exports.map(e=>e.id), runtimeProfile:runtime.exportProfile, sampleRuntimeAsset:asset&&{path:asset.path,width:asset.width,height:asset.height,fileWidth:asset.fileWidth,fileHeight:asset.fileHeight,fileScale:asset.fileScale}}); if (!asset) throw new Error('runtime_50 asset with fileScale=0.5 not found');"
   ```

7. 不要批量复制 `docs/anieditor5/export/assets/` 整个目录，避免把 `.DS_Store` 或无关图片带入 viewer。只能复制第 3.2 节列出的 7 张新增图片。交付前执行：

   ```bash
   find apps/anieditorv5viewer/src/assets -name .DS_Store -print
   ```

   若输出新增 `.DS_Store`，必须删除；不要把它纳入提交。

### 5.2 vnicore core 支持 safe_glow

1. 在 `packages/vnicore/src/core/types.ts` 中把 `safe_glow` 加入 `V5GAnimationType`。

2. 在 `packages/vnicore/src/core/animation-sampler.ts` 中：

   - 把 `safe_glow` 加入 `SUPPORTED_ANIMATION_TYPES`。
   - 把 `safe_glow` 加入 `DEFAULT_EASING_BY_TYPE`，默认值为 `linear`。
   - 在 `sampleLayerAnimationsAtTime(...)` 中让 `safe_glow` 复用 source opacity 逻辑：`keepOriginal=false` 时把 source opacity 置 0，`keepOriginal=true` 时保留原图。
   - 不要把 `safe_glow` 当成 particle animation。
   - 不要把 `safe_glow` 当成旧 `glow` render effect。

3. 在 `packages/vnicore/src/core/validation.ts` 中：

   - 为 `safe_glow` 增加必需 numeric params：`spread`、`minOpacity`、`maxOpacity`、`pulses`。
   - 为 `safe_glow` 增加 optional boolean param：`keepOriginal`。
   - 缺失参数、字符串数字、`NaN`、`Infinity` 必须显式失败。
   - 不要为了通过 fixture 给 `safe_glow` 加默认参数兜底。

4. 新增 `packages/vnicore/src/core/safe-glow-sampler.ts`：

   - 导出 `VNISafeGlowSpriteSample`。
   - 导出 `getSafeGlowProgress(animation, time)` 或同等函数。
   - 导出 `hasActiveSafeGlowAnimation(layer, time)`。
   - 导出 `sampleSafeGlowSpritesForLayer(layer, sampledLayer, time)`。
   - `safe_glow` 起始帧可以返回有效 progress；不要照搬旧 `getRenderEffectProgress(...)` 的 `progress <= 0 ? null` 行为。
   - 采样公式以 `docs/anieditor5/src/pixi_stage.ts` 的 `drawSafeGlow(...)` 为准：

     ```text
     spread = clamp(spread, 0, 1)
     minOpacity = clamp(minOpacity, 0, 1)
     maxOpacity = clamp(maxOpacity, 0, 1)
     pulses = clamp(pulses, 0, 60)
     wave = pulses <= 0 ? 1 : (1 - cos(progress * PI * 2 * pulses)) / 2
     alpha = sampledLayer.baseOpacity * lerp(minOpacity, maxOpacity, wave)
     scale = sampledLayer.transform.scale * (1 + spread)
     blendMode = normal
     ```

   - `alpha <= 0.002` 或 `spread <= 0.001` 时返回空数组。
   - 参数缺失或类型错误必须抛出明确错误，不能静默默认。

5. 在 `packages/vnicore/src/core/project-sampler.ts` 中：

   - 为 sampled layer 增加 `hasActiveSafeGlowAnimation` 或同等字段。
   - `visible` 计算要包含 safe glow 活跃状态：

     ```text
     visible = layer.visible && (opacity > 0 || activeRenderEffect || activeSafeGlow)
     ```

   - `renderImageDisplay` 仍然只表示原图是否显示，不应因为 safe glow 活跃而把原图显示出来。
   - `keepOriginal=false` 的 safe glow layer 必须满足：`opacity=0`、`renderImageDisplay=false`、`visible=true`。

6. 在 `packages/vnicore/src/core/index.ts` 中导出新增 safe glow sampler 的 public core API。

### 5.3 vnicore Pixi 渲染支持 safe_glow

1. 在 `packages/vnicore/src/pixi/layer-instance.ts` 中给每个 layer instance 增加一个独立 overlay container，例如：

   ```text
   safeGlowDisplay
   ```

   建议 render order：

   ```text
   display -> safeGlowDisplay -> effectDisplay -> particleDisplay
   ```

   如果最终选择不同顺序，必须以 editor 侧 `drawSafeGlow(...)` 的视觉语义为准，并在任务报告说明原因。

2. 在 `packages/vnicore/src/pixi/vni-player.ts` 中：

   - 导入 `sampleSafeGlowSpritesForLayer(...)`。
   - 在每一帧渲染中独立清理和渲染 safe glow sprites。
   - 不要把 safe glow sprites 塞进 `renderRenderEffectSamples(...)`。
   - 不要让 `data-vni-render-effect-sprites` 因 safe glow 增加。
   - 新增诊断字段，例如：

     ```text
     data-vni-safe-glow-sprites
     ```

   - `destroy()`、`clearDiagnostics()` 必须清理 safe glow display 和 diagnostics。

3. 渲染 safe glow sprite 时：

   - 使用 layer 原 texture。
   - anchor 使用 sampled transform anchor。
   - position 使用 sampled transform 的 editor-to-Pixi 转换坐标。
   - scale 使用 sampler 输出的 scale 乘以 asset display compensation。
   - rotation 使用 radians。
   - alpha 使用 sampler 输出 alpha。
   - blendMode 固定为 `normal`。

4. 保持旧 `glow` 和 `shatter` render effect 行为不变。若测试暴露旧行为问题，先判断是否为测试假设错误；不要为了让 `safe_glow` 通过而改坏旧 effect 语义。

### 5.4 viewer 接入 lock_01 和保持插入 UI

1. 在 `apps/anieditorv5viewer/src/config/bundled-projects.ts` 中：

   - import `../assets/projects/lock_01.json`。
   - 把 `lock-01` 加入 `BundledProjectId`。
   - 在 `bundledProjectDefinitions` 注册：

     ```text
     id: "lock-01"
     filename: "lock_01.json"
     sourcePath: "docs/anieditor5/export/lock_01.json"
     bundleId: "legacy"
     profileId: "legacy_full"
     purpose: "legacy"
     assetScale: 1
     assetUrlManifest: bundledAssetUrlManifest
     ```

   - 继续使用 `validateVNIProject(project)` 和 `resolveProjectAssetUrls(...)`，不要因为新导出缺资源而跳过验证。

2. `apps/anieditorv5viewer/src/runtime/asset-manifest.ts` 当前使用：

   ```text
   import.meta.glob("../assets/assets/*", ...)
   ```

   因此复制到 `apps/anieditorv5viewer/src/assets/assets/` 的新增图片会自动进入 asset manifest。不要额外写静态 fallback URL。

3. 检查 `apps/anieditorv5viewer/src/ui/controls.ts`：

   - `lock_01` 只有一个 group 时，slot 下拉应 disabled，状态显示无合法 slot，插入按钮 disabled。
   - `3reel_multipay_01` / `3reel_multipay_02` 有合法 slot 时，asset 下拉和 slot 下拉可用。
   - asset 下拉必须来自当前 assets 目录 manifest，不提供上传。
   - 如果选择的 asset 是当前 project 自身 asset，使用 `attachImageBetweenLayerGroups(...)`。
   - 如果选择的 asset 是同一 assets 目录中但不属于当前 project 的图片，使用 `attachExternalImageBetweenLayerGroups(...)`。
   - viewer 不得直接操作 `VNIPlayer` 内部 Pixi container、group container、slot container 或 layer instance。

4. 检查 `apps/anieditorv5viewer/src/main.ts`：

   - 插入成功后必须设置 `setInsertedNodeActive(true)`。
   - 切换 project 或 player 被销毁时必须清空插入状态。
   - 异步 `attachExternalImageBetweenLayerGroups(...)` 完成时，如果当前 player 已切换，必须 dispose 刚创建的节点。
   - 插入失败时错误展示在 UI 中，不要吞掉异常。

5. 检查 `apps/anieditorv5viewer/src/styles.css`：

   - 新 project label 和 asset label 较长时，select/button 文本不能溢出或互相遮挡。
   - 不需要新增说明性大段文字；这个 viewer 是工具界面，不做 landing page。

### 5.5 测试更新

#### vnicore core tests

1. `packages/vnicore/tests/core/validation.test.ts`

   - 新增 fixture `lock_01.json` 验证：
     - `schemaVersion` 为 `VNI_0.017`。
     - 动画类型包含 `safe_glow`。
     - `validateVNIProject(...)` 通过。
   - 验证 `safe_glow` 缺少 `spread/minOpacity/maxOpacity/pulses` 任一参数时显式失败。
   - 验证 `safe_glow.keepOriginal` 如果不是 boolean 显式失败。
   - 验证字符串数字不被接受，例如 `"0.12"` 必须失败。

2. `packages/vnicore/tests/core/animation-sampler.test.ts`

   - `safe_glow keepOriginal=true` 保留原 opacity。
   - `safe_glow keepOriginal=false` 把 source opacity 置 0。
   - `safe_glow` 不改变 transform。

3. 新增 `packages/vnicore/tests/core/safe-glow-sampler.test.ts`

   - 起始帧可以采样出 safe glow sprite。
   - `spread/minOpacity/maxOpacity/pulses` 计算出的 alpha 和 scale 确定。
   - `pulses=0` 时使用 max opacity。
   - `spread=0` 或 alpha 太低时返回空数组。
   - `blendMode` 固定为 `normal`。
   - 非 image layer、disabled animation、非 safe_glow animation 返回空数组。
   - 缺失或错误参数显式抛错。

4. `packages/vnicore/tests/core/project-sampler.test.ts`

   - `keepOriginal=false` 且 safe glow 活跃时，layer `visible=true`、`renderImageDisplay=false`。
   - safe glow 非活跃且 source opacity 为 0 时，不应被误判可见。

5. `packages/vnicore/tests/core/render-effect-sampler.test.ts`

   - 验证 `isRenderEffectAnimationType("safe_glow")` 为 false。
   - 验证旧 `glow` 和 `shatter` 现有行为不变。

#### vnicore Pixi tests

更新 `packages/vnicore/tests/pixi/vni-player.test.ts`：

- 加入 safe glow 渲染用例，确认：
  - `data-vni-safe-glow-sprites` 在 active 时间大于 0。
  - `data-vni-render-effect-sprites` 不因为 `safe_glow` 增加。
  - `keepOriginal=false` 时原图 display 不显示但 safe glow display 有 sprite。
  - `destroy()` 清理 safe glow diagnostics。
- 保留现有组间插入测试：
  - 未 init 调用 attach 显式失败。
  - 重复 mounted node id 显式失败。
  - 未知 group、反向 group、非相邻 group 显式失败。
  - `attachImageBetweenLayerGroups(...)` 使用 project asset texture。
  - `attachExternalImageBetweenLayerGroups(...)` 使用显式 URL，不把外部图片伪装成 project asset。
  - `clearMountedNodes()` / `detachMountedNode(id)` 正确清理。

#### viewer tests

如果 `apps/anieditorv5viewer` 已有测试，补充：

- bundled projects 包含 `lock-01`。
- `lock-01` 的 `insertionAssets` 包含 7 张新增图片。
- `lock-01` 初始化后无合法 slot，插入按钮 disabled。
- `3reel-multipay-01` 初始化后有 1 个合法 slot。
- `bigwin-edit-full` 和 `bigwin-runtime-50` 仍从 `export2/manifest.json` 注册，`runtime_50` 的 `assetScale` 为 `0.5`，且 `fileWidth/fileHeight/fileScale` 校验不被绕过。

如果 viewer 当前没有足够测试基础，不要为了覆盖率写与真实 UI 脱节的奇怪测试。可以把主要验收放到浏览器验收，但任务报告必须说明 viewer 自动化测试覆盖范围。

## 6. 文档和示例同步

必须同步更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
```

要求：

- `README.md` 的 supported runtime contract 和 supported animation types 必须包含 `safe_glow`，并说明它不是旧 `glow` deterministic render effect。
- `api-zh.md` 说明 `safe_glow` 是普通同图副本高亮，不是 `render-effect-sampler` 的 effect。
- `usage-zh.md` 增加 `safe_glow` 参数说明：
  - `spread`
  - `minOpacity`
  - `maxOpacity`
  - `pulses`
  - `keepOriginal`
- `usage-zh.md` 说明 `glow` 和 `safe_glow` 的差别：
  - `glow`：旧 deterministic render effect，可用特殊 blend。
  - `safe_glow`：跨引擎安全方案，normal blend，同图副本缩放和透明度呼吸。
- `usage-zh.md` 的 diagnostics 列表必须新增 `data-vni-safe-glow-sprites`，并说明它和 `data-vni-render-effect-sprites` 分开计数。
- `migration-from-viewer-zh.md` 继续强调 viewer 不能直接操作 runtime 私有 Pixi tree，组间插入只能调用 `VNIPlayer` public API。
- `examples/README.md` 如果列出支持的示例或动画类型，需要包含 `safe_glow` 或说明 fixture 覆盖。

如果新增 `packages/vnicore/examples/safe-glow.ts`，必须同步：

```text
packages/vnicore/tsconfig.examples.json
packages/vnicore/examples/README.md
```

但本任务不强制新增示例文件；如果文档已足够覆盖，可以不加。

## 7. 验收命令

所有命令从仓库根目录执行：

```bash
pwd
node --version
pnpm --version
```

必须满足 Node.js `>=24.0.0`、pnpm `>=10.0.0`。

### 7.1 vnicore 必跑

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check
```

`pnpm --filter @slotclientengine/vnicore test` 必须继续执行 coverage gate。`packages/vnicore/vite.config.ts` 中 coverage 不得低于 80% 的门槛。

### 7.2 viewer 必跑

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

### 7.3 仓库级检查

```bash
git diff --check
cmp -s AGENTS.md agents.md
```

如果修改了 `AGENTS.md` / `agents.md`，必须确认两者一致。若未修改，也要在任务报告中写明检查结果。

可选但建议执行：

```bash
pnpm typecheck
pnpm test
pnpm build
```

如果根级命令因与本任务无关的历史格式或其它包问题失败，不要为了让根级命令变绿改无关代码。记录失败命令、失败包、错误摘要，并保留本任务局部命令作为硬验收。

## 8. 浏览器验收

本任务涉及 viewer UI 和 Pixi 画面，必须做浏览器验收。启动 dev server：

```bash
pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1 --port 5173
```

如果 5173 被占用，换一个端口，并在任务报告中记录实际 URL。

在浏览器打开：

```text
http://127.0.0.1:5173
```

验收 `lock_01`：

1. 在 project selector 中选择 `lock_01`。
2. summary 显示：
   - `schema VNI_0.017`
   - `4.00s duration`
   - 动画类型包含 `safe_glow`、`idle`、`particle_twinkle`
3. 画面非空，canvas 中央区域能看到锁相关图片。
4. 播放到 `0.5s` 到 `0.8s` 附近时，safe glow 副本可见。
5. DOM diagnostics 满足：
   - `data-vni-project-id="lock-01"`
   - `data-vni-safe-glow-sprites` 在 safe glow 活跃时间大于 `0`
   - `data-vni-render-effect-sprites` 不因为 `safe_glow` 增加
   - `data-vni-pixel-sample-error` 不存在
   - `data-vni-non-background-samples` 大于 `0`
6. 因为 `lock_01` 只有一个 group，组间插入区域应显示无合法 slot，插入按钮 disabled。

验收组间插入：

1. 切换到 `3reel_multipay_01`。
2. 确认 DOM diagnostics：
   - `data-vni-layer-groups="2"`
   - `data-vni-layer-group-slots="1"`
3. asset 下拉可选当前 assets 目录中的图片。
4. slot 下拉显示类似：

   ```text
   下层光效 -> 上层光效
   ```

5. 选择一张图片并点击 `插入`。
6. 确认：
   - UI 状态为已插入。
   - `data-vni-mounted-nodes="1"`。
   - 画面 stage 中心出现插入图片。
7. 点击 `移除`。
8. 确认：
   - `data-vni-mounted-nodes="0"`。
   - 插入图片从画面消失。
9. 切换 project 后插入状态必须重置。

验收 `export2` 非回归：

1. 切换到 `bigwin-edit-full`。
2. 确认 summary 显示 `profile edit_full`、`purpose editing`、`assetScale 1`。
3. 确认画面非空，`data-vni-bundle-id="export2"`，`data-vni-profile-id="edit_full"`，`data-vni-asset-scale="1"`。
4. 切换到 `bigwin-runtime-50`。
5. 确认 summary 显示 `profile runtime_50`、`purpose runtime`、`assetScale 0.5`。
6. 确认画面非空，`data-vni-bundle-id="export2"`，`data-vni-profile-id="runtime_50"`，`data-vni-asset-scale="0.5"`。
7. `runtime_50` 不得出现 texture size mismatch；若报错，优先检查 `fileWidth/fileHeight/fileScale` 和真实 PNG 尺寸，不要把校验改松。

如果使用自动化浏览器工具验收，任务报告中记录截图路径或关键 DOM dataset 值。若本地环境没有可用浏览器，必须写清楚未做浏览器验收的原因，并提供跨机器复验步骤；但不能把未验收说成已验收。

## 9. 失败边界和禁止事项

- 不要给 `safe_glow` 写隐藏默认参数兜底。缺参数、错类型、缺 asset、缺 texture 都要显式失败。
- 不要为了测试通过把 `safe_glow` 塞进旧 `glow` render effect。
- 不要让 `safe_glow` 污染 `data-vni-render-effect-sprites`。
- 不要用 `layerGroups.order` 重排 runtime 画面；render order 仍来自 `project.layers` 中连续的 group run。
- 不要在 viewer 中复制播放状态机、group adjacency 算法或直接操作 runtime 私有 Pixi container。
- 不要让 viewer 上传图片；本任务只允许从当前 bundled assets 目录选择图片。
- 不要把外部 assets 目录图片伪装成当前 project asset；当前 project 引用的 asset 才走 `attachImageBetweenLayerGroups(...)`，非 project asset 走 `attachExternalImageBetweenLayerGroups(...)`。
- 不要修改 `packages/anieditorv5runtime-cc`；Cocos runtime parity 不是任务 46 的范围。
- 不要批量复制资源目录导致 `.DS_Store` 或未引用图片进入 viewer assets。
- 如果测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续问题难查。
- 不要回滚用户已有改动。若遇到与本任务相关的未提交改动，先理解并沿用；只有冲突到无法继续时才询问。

## 10. 任务报告要求

完成后新增报告：

```text
tasks/46-vnicore-safe-glow-node-insertion-[utctime].md
```

报告必须使用中文，至少包含：

1. 任务摘要。
2. 实际修改文件清单。
3. `safe_glow` 设计说明：
   - 为什么不是 render effect。
   - `keepOriginal` 怎么处理。
   - 起始帧怎么处理。
   - diagnostics 怎么区分 safe glow 和旧 render effect。
4. `lock_01` 接入说明：
   - JSON 路径。
   - 7 张图片路径。
   - viewer project id。
5. 组间插入验收说明：
   - 使用哪个 project 验收。
   - 选择了哪张图片。
   - 使用哪个 slot。
   - 插入/移除后的 diagnostics。
6. `export2` 非回归说明：
   - `bigwin-edit-full` / `bigwin-runtime-50` 是否仍可加载。
   - `runtime_50` 的 `assetScale`、`fileWidth/fileHeight/fileScale` 和 texture size 校验是否正常。
7. 测试命令和结果，逐条列出本计划第 7 节命令。
8. 浏览器验收结果，包含实际 URL、关键 dataset 或截图说明。
9. `AGENTS.md` / `agents.md` 是否更新及原因。
10. `packages/anieditorv5runtime-cc` 是否保持未修改。
11. `pnpm-lock.yaml` 是否变化。
12. 已知风险、未完成事项或跨机器复验步骤。

生成报告文件名示例命令：

```bash
REPORT_TS="$(date -u +%y%m%d-%H%M%S)"
REPORT_PATH="tasks/46-vnicore-safe-glow-node-insertion-${REPORT_TS}.md"
```

## 11. 二次遗漏检查

交付前必须做第二遍遗漏检查，并把结果写入任务报告：

- `docs/anieditor5/export/lock_01.json` 是否复制到 viewer 和 vnicore fixture。
- 7 张新增图片是否全部复制到 `apps/anieditorv5viewer/src/assets/assets/`。
- `apps/anieditorv5viewer/src/assets` 下是否没有新增 `.DS_Store`。
- `apps/anieditorv5viewer/src/config/bundled-projects.ts` 是否注册 `lock-01`。
- `bigwin-edit-full` / `bigwin-runtime-50` 是否仍从 `export2/manifest.json` 注册并通过 profile 校验。
- `runtime_50` 是否仍保持 `assetScale 0.5`、`fileWidth/fileHeight/fileScale` 校验和显示补偿。
- `packages/vnicore/src/core/types.ts` / `animation-sampler.ts` / `validation.ts` 是否都包含 `safe_glow`。
- `safe_glow` 是否没有进入 `render-effect-sampler` 的 effect type。
- `keepOriginal=false` 是否有 core test 和 Pixi test。
- 起始帧 safe glow 是否有 test。
- `data-vni-safe-glow-sprites` 是否被设置并在 destroy/clear diagnostics 时清理。
- 旧 `glow` / `shatter` / particle tests 是否仍然通过。
- 组间插入 UI 是否在无 slot project 上 disabled，在双 group project 上可用。
- viewer 是否仍然只调用 public `VNIPlayer` attach/clear API。
- `packages/vnicore/README.md`、`packages/vnicore/docs` 和 examples README 是否同步。
- `packages/anieditorv5runtime-cc` 是否没有被任务 46 修改。
- `AGENTS.md` 和 `agents.md` 是否一致。
- `git diff --check` 是否通过。
- 最终 `git status --short --untracked-files=all` 是否只包含本任务预期文件和用户原有改动。
