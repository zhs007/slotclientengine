# anieditorv5viewer update 任务计划

## 1. 任务目标

更新现有 Vite + TypeScript + Pixi.js viewer：

```text
apps/anieditorv5viewer
```

让它跟上 `docs/anieditor5/src` 当前编辑器代码和 `docs/anieditor5/export` 当前导出数据：

- 同步新版 V5G 动画类型、采样语义和 Pixi 渲染语义。
- 继续支持原样例 `docs/anieditor5/export/project.json`。
- 新增并内置 3 个导出动画 JSON：
  - `docs/anieditor5/export/bigwin.json`
  - `docs/anieditor5/export/megawin.json`
  - `docs/anieditor5/export/superwin.json`
- 在 viewer UI 里能选择 `project`、`bigwin`、`megawin`、`superwin` 并播放。
- 缺失资源、未知动画、未知 easing、未知 blend mode、非法 JSON 结构必须显式失败，不允许静默跳过、渲染占位或用不必要的兜底掩盖问题。
- 如果测试导致一些奇怪写法，应修改测试，不要为了测试改不该改的生产逻辑。

任务完成后必须新增中文任务报告：

```text
tasks/31-anieditorv5viewer-update-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/31-anieditorv5viewer-update-260617-123456.md
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
- 根协作规则文件当前同时存在并内容一致：
  - `AGENTS.md`
  - `agents.md`
- 新增空目录必须放 `.keepme`
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增依赖；如果确实新增依赖，必须执行 `pnpm install` 并在报告里记录 `pnpm-lock.yaml` 是否变化。

## 3. 当前输入状态

当前 `git status --short` 显示 `docs/anieditor5/src` 有编辑器代码更新：

```text
M docs/anieditor5/src/animation_presets.ts
M docs/anieditor5/src/constants.ts
M docs/anieditor5/src/main.ts
M docs/anieditor5/src/pixi_stage.ts
M docs/anieditor5/src/types.ts
```

当前 `docs/anieditor5/export` 新增 3 个 JSON：

```text
docs/anieditor5/export/bigwin.json
docs/anieditor5/export/megawin.json
docs/anieditor5/export/superwin.json
```

当前 `docs/anieditor5/export/assets` 有 28 张图片。执行时必须确保 viewer 内置资源覆盖 4 个 JSON 里所有 `asset.path`。

`docs/anieditor5/src/constants.ts` 当前 `V5G_VERSION` 已更新到 `V5G_0.0051`，但现有 4 个导出 JSON 同时包含 `V5G_0.0014`、`V5G_0.0043`、`V5G_0.0051`。viewer 校验应继续支持 `V5G_0.x` 系列，不要硬编码成只接受最新 `V5G_0.0051`。

4 个导出 JSON 当前摘要：

| 文件 | name | schemaVersion | duration | layers | assets | animations |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `project.json` | `胜利测试` | `V5G_0.0014` | 10 | 5 | 4 | `scale_up`, `fade`, `rotate`, `move`, `scale_down` |
| `bigwin.json` | `bigwin` | `V5G_0.0043` | 5 | 9 | 9 | `scale_up`, `rotate`, `fade`, `pulse`, `shake`, `slide_in`, `particles`, `particle_twinkle` |
| `megawin.json` | `megawin` | `V5G_0.0014` | 10 | 10 | 9 | `scale_up`, `rotate`, `fade`, `move`, `shake`, `pulse`, `slide_in`, `particle_twinkle`, `particles` |
| `superwin.json` | `superwin` | `V5G_0.0051` | 5 | 9 | 9 | `scale_up`, `rotate`, `fade`, `particles`, `move`, `shake`, `pulse`, `slide_in`, `particle_twinkle` |

当前 4 个导出 JSON 的共同事实：

- `editor.name` 为 `victory_editor_v5_g`。
- `engineTarget.name` 为 `cocos_creator`。
- `engineTarget.version` 为 `3.8.6`。
- `stage.coordinate` 为 `center`。
- 顶层 `particles` 数组为空。
- 图层类型都是 `image`。
- 所有图层 `keyframes` 为空。
- 没有非空 `parentId`。
- 使用的 blend mode 包含 `normal`、`add`，`bigwin.json` 额外使用 `screen`。

注意：新版粒子效果不是顶层 `project.particles`，而是图层动画类型 `particles` / `particle_twinkle`。本任务要支持这两个 layer animation；顶层 `project.particles` 如果非空，仍保持显式失败，除非执行时确认导出格式已经变化并在报告中解释原因。

## 4. 需要参考的现有实现

viewer 当前关键文件：

```text
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/config/bundled-project.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/v5g/types.ts
apps/anieditorv5viewer/src/runtime/animation-sampler.ts
apps/anieditorv5viewer/src/runtime/project-sampler.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/src/runtime/blend-mode.ts
apps/anieditorv5viewer/src/runtime/coordinates.ts
apps/anieditorv5viewer/src/runtime/layer-instance.ts
apps/anieditorv5viewer/src/runtime/v5g-player.ts
apps/anieditorv5viewer/src/runtime/validation.ts
apps/anieditorv5viewer/tests/runtime/*.test.ts
apps/anieditorv5viewer/README.md
```

editor 当前关键参考文件：

```text
docs/anieditor5/src/types.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/coordinates.ts
docs/anieditor5/src/export_project.ts
```

不要从 `docs/anieditor5/src/**` runtime import 代码到 viewer。viewer 应继续保持独立、可构建、可测试；可以参考并移植必要逻辑。

`docs/anieditor5/src/main.ts` 这次也包含编辑器 UI 侧更新，例如图片替换、动画复制/粘贴、Backspace 删除行为等。这些不是 viewer 播放导出 JSON 的必要能力，不要误搬进 `apps/anieditorv5viewer`。viewer 本轮只同步与导出播放相关的类型、采样、资源、多项目选择和 Pixi 运行时渲染语义。

## 5. 范围边界

本任务要做：

- 更新 `apps/anieditorv5viewer` 的 V5G 类型、校验、采样、渲染和 UI。
- 内置 4 个导出 JSON 和它们需要的图片资源。
- 增加项目选择能力，并确保切换项目时旧 player 被销毁，新的 player 从 0 秒开始播放或待播。
- 支持新版 layer animation：
  - `scale_in`
  - `scale_out`
  - `pop`
  - `shake`
  - `blink`
  - `particles`
  - `particle_twinkle`
- 更新测试、README 和任务报告。

本任务不要做：

- 不要修改 `docs/anieditor5/src/**`，除非发现明确的编辑器 bug 阻塞本任务；如果修改，必须在报告中说明原因和影响。
- 不要新增 Cocos Creator app。
- 不要把 `packages/anieditorv5runtime-cc` 改成依赖 viewer 内部代码。
- 不要把未知动画、未知资源、未知 blend mode、未知 easing 静默降级成默认值。
- 不要为了测试通过在生产逻辑里写奇怪分支；测试预期错误就改测试。

## 6. 资源同步方案

保留现有默认 JSON 路径，新增项目 JSON 目录：

```text
apps/anieditorv5viewer/src/assets/project.json
apps/anieditorv5viewer/src/assets/projects/bigwin.json
apps/anieditorv5viewer/src/assets/projects/megawin.json
apps/anieditorv5viewer/src/assets/projects/superwin.json
apps/anieditorv5viewer/src/assets/assets/*
```

执行资源同步时使用：

```bash
mkdir -p apps/anieditorv5viewer/src/assets/projects
cp docs/anieditor5/export/project.json apps/anieditorv5viewer/src/assets/project.json
cp docs/anieditor5/export/bigwin.json apps/anieditorv5viewer/src/assets/projects/bigwin.json
cp docs/anieditor5/export/megawin.json apps/anieditorv5viewer/src/assets/projects/megawin.json
cp docs/anieditor5/export/superwin.json apps/anieditorv5viewer/src/assets/projects/superwin.json
rsync -a --delete docs/anieditor5/export/assets/ apps/anieditorv5viewer/src/assets/assets/
```

资源验收命令：

```bash
find apps/anieditorv5viewer/src/assets -maxdepth 3 -type f | sort
node -e "const fs=require('fs'); const files=['apps/anieditorv5viewer/src/assets/project.json','apps/anieditorv5viewer/src/assets/projects/bigwin.json','apps/anieditorv5viewer/src/assets/projects/megawin.json','apps/anieditorv5viewer/src/assets/projects/superwin.json']; for (const file of files) { const json=JSON.parse(fs.readFileSync(file,'utf8')); for (const asset of json.assets) { const path='apps/anieditorv5viewer/src/assets/'+asset.path; if (!fs.existsSync(path)) { throw new Error(file+' missing '+asset.path); } } } console.log('all bundled assets exist');"
```

资源同步后必须确认：

- 4 个 JSON 合计引用 28 个唯一 `asset.path`。
- 没有旧图片残留导致 `src/assets/assets` 多于或少于导出目录。
- 浏览器加载每个项目时，`PIXI.Texture.width/height` 必须与 JSON 里的 `asset.width/height` 一致；现有 `V5GPlayer.loadTexture()` 已有尺寸校验，本任务不得删除或绕过该校验。
- `apps/anieditorv5viewer/.prettierignore` 继续排除 `src/assets`，避免复制的 JSON/PNG 被 app-local `format:check` 当成手写源码格式化。

## 7. 多项目配置和 UI 方案

将单项目配置升级为多项目配置。建议把：

```text
apps/anieditorv5viewer/src/config/bundled-project.ts
```

改为或新增：

```text
apps/anieditorv5viewer/src/config/bundled-projects.ts
```

导出一个稳定清单，包含：

- `id`: `project` / `bigwin` / `megawin` / `superwin`
- `label`: UI 显示名称，建议包含项目名和 JSON 文件名，例如 `bigwin (bigwin.json)`
- `sourcePath`: 来源文件说明
- `project`: 已通过 `assertV5GProject()` 和 `validateV5GProject()` 的项目对象
- `assetUrls`: 通过 `resolveProjectAssetUrls(project, bundledAssetUrlManifest)` 得到的资源 URL manifest

保持 Vite/TypeScript JSON import 配置可用：

- `apps/anieditorv5viewer/tsconfig.json` 必须继续 include `src/**/*.json`。
- `apps/anieditorv5viewer/vite.config.ts` 的 coverage exclude 必须继续排除 `src/assets/**`。
- 如果 `bundled-project.ts` 被替换为 `bundled-projects.ts`，所有测试 import 和 README 说明必须同步更新，不允许留下同时维护两套项目清单。

`apps/anieditorv5viewer/src/main.ts` 需要管理当前选择：

- 首次加载默认选择 `project`。
- 切换项目时：
  1. 暂停并 `destroy()` 旧 `V5GPlayer`。
  2. 清空 stage mount。
  3. 用新 project 和 assetUrls 创建新的 `V5GPlayer`。
  4. `await player.init()`。
  5. timeline 重置到 0。
  6. controls 更新项目摘要、时长、播放状态、loop 状态。
- 如果清单里找不到选中项目，直接 throw，不做 fallback。

`apps/anieditorv5viewer/src/ui/controls.ts` 需要新增项目选择控件：

- 使用 `<select>` 列出 4 个项目。
- 切换时触发 `onProjectChange(projectId)`。
- 摘要区域随当前项目更新：
  - project name
  - JSON filename/source
  - layer count
  - asset count
  - animation type summary
  - duration
- timeline 的 `max` 必须随当前项目 `stage.duration` 更新。
- 切换项目后 play button 文案必须回到 `Play`，不允许显示旧项目的播放状态。

## 8. V5G 类型和校验更新

同步 `apps/anieditorv5viewer/src/v5g/types.ts` 的 `V5GAnimationType`，至少包含：

```text
move
fade
scale_up
scale_down
scale_in
scale_out
pop
shake
blink
rotate
slide_in
slide_out
bounce_in
pulse
float
swing
particles
particle_twinkle
```

更新 `apps/anieditorv5viewer/src/runtime/animation-sampler.ts`：

- `SUPPORTED_ANIMATION_TYPES` 包含上述全部类型。
- `DEFAULT_EASING_BY_TYPE` 同步 editor preset：
  - `scale_in`: `easeOutQuad`
  - `scale_out`: `easeInQuad`
  - `pop`: `easeOutQuad`
  - `shake`: `linear`
  - `blink`: `linear`
  - `particles`: `linear`
  - `particle_twinkle`: `linear`
- `particles` 和 `particle_twinkle` 必须被识别为合法动画类型，但普通 `sampleLayerAnimationsAtTime()` 不应修改 transform/opacity；它们的视觉效果由粒子渲染路径负责。

更新 `apps/anieditorv5viewer/src/runtime/validation.ts` 的参数校验：

- 继续要求未知动画、未知 easing、未知 blend mode 显式失败。
- 继续要求顶层 `project.particles.length > 0` 显式失败。
- 继续要求非空 `keyframes`、`group`、非空 `parentId` 显式失败。
- 所有导出 JSON 中应为数字的参数必须是 finite number；不要接受字符串数字作为正常数据。
- optional boolean 如果出现，必须是 boolean。

新增动画参数要求：

| 动画 | 必需数字参数 | 可选 boolean |
| --- | --- | --- |
| `scale_in` | `fromScale`, `toScale` | `fadeIn` |
| `scale_out` | `fromScale`, `toScale` | `fadeOut` |
| `pop` | `peakScale`, `settleScale`, `peakAt` | 无 |
| `shake` | `amplitudeX`, `amplitudeY`, `cycles` | `decay` |
| `blink` | `minOpacity`, `maxOpacity`, `blinks`, `endOpacity` | 无 |
| `particles` | `count`, `spread`, `speed`, `size`, `gravity` | `fadeOut` |
| `particle_twinkle` | `radius`, `count`, `spawnInterval`, `twinkleDuration`, `batchMin`, `batchMax`, `size` | 无 |

## 9. 动画采样语义更新

采样语义以当前 `docs/anieditor5/src/animation_presets.ts` 为准，但 viewer 内仍保持严格校验。

必须更新这些行为：

- 多个动画重叠时，位移、缩放、旋转类效果要在当前 result 上叠加，而不是每个动画都从 base 重置。
- `move`：
  - `result.transform.x += lerp(fromX, toX, progress) - baseX`
  - `result.transform.y += lerp(fromY, toY, progress) - baseY`
- `slide_in` / `slide_out`：
  - x/y 偏移叠加到 result。
  - `fadeIn` / `fadeOut` 仍按 base opacity 插值。
- `bounce_in`：
  - 缩放乘到 result 上。
  - `fadeIn` 仍按 base opacity 插值。
- `scale_up` / `scale_down`：
  - 按 `Math.abs(baseScale) || 1` 计算比例。
  - 比例乘到 result 上。
  - 负 scale 符号必须保留，用于镜像。
- `scale_in` / `scale_out`：
  - `fromScale` 到 `toScale` 插值后作为 scale ratio 乘到 result。
  - `scale_in.fadeIn` 从 0 到 base opacity。
  - `scale_out.fadeOut` 从 base opacity 到 0。
- `pop`：
  - `peakAt` clamp 到 `0.05..0.95`。
  - 先从 1 到 `peakScale`，再从 `peakScale` 到 `settleScale`。
- `shake`：
  - x 使用 sin 波，y 使用 cos 波。
  - `decay=true` 时幅度随 `1 - progress` 衰减。
- `blink`：
  - 按 `getLoopWave(progress, blinks)` 在 `maxOpacity` 和 `minOpacity` 间切换。
  - `progress >= 1` 时使用 `endOpacity`。
- `pulse`：
  - scale ratio 乘到 result。
- `float`：
  - y 偏移叠加到 result。
- `swing`：
  - rotation 偏移叠加到 result。
- `rotate`：
  - rotation 偏移叠加到 result。

保留现有最终边界行为：普通动画 `time >= animation.startTime + animation.duration` 时采样为 `progress = 1`，这样已有“动画结束帧可见”的测试语义不丢失。粒子动画的 active 判断单独按 `time >= start && time < end`，结束瞬间不再生成粒子。

`particles` / `particle_twinkle` 的普通采样边界：

- `sampleLayerAnimationsAtTime()` 遇到这两个类型时不抛错、不改 transform、不改 opacity。
- `sampleLayerAtTime()` 可以暴露额外标记，例如 `hasActiveParticleAnimation` / `renderAsParticles`，或在 player 内独立判断 active particle。
- 不要为了隐藏普通 image display 而把 sampled opacity 改成 0；粒子渲染仍需要使用采样后的 transform 和 opacity 作为 emitter 与 alpha 基础。
- 隐藏普通 image display 应发生在 Pixi layer 应用阶段，或通过独立 display visibility 标记实现。

## 10. 粒子动画渲染方案

新增或拆分纯逻辑模块，建议路径：

```text
apps/anieditorv5viewer/src/runtime/particle-sampler.ts
```

该模块负责无 Pixi 依赖的粒子采样，便于测试：

- `hasActiveParticleAnimation(layer, time)`
- `sampleParticleSpritesForLayer(layer, sampledLayer, textureSize, time)`
- `seededRandom(seed, index, salt)`
- `getParticleProgress(animation, time)`

`particles` 行为按 `docs/anieditor5/src/pixi_stage.ts`：

- 使用当前 image layer 的图片纹理作为粒子纹理。
- `count` clamp 到 `1..200`。
- `spread` clamp 到 `0..1000`。
- `speed` clamp 到 `0..2000`。
- `size` clamp 到 `1..400`。
- `gravity` clamp 到 `-2000..2000`。
- `fadeOut !== false` 时 alpha 使用 `Math.pow(1 - progress, 1.35)` 衰减。
- 粒子位置、缩放、旋转使用 `seededRandom(animation.seed, index, salt)` 保持确定性。

`particle_twinkle` 行为按 `docs/anieditor5/src/pixi_stage.ts`：

- 使用当前 image layer 的图片纹理作为闪烁粒子纹理。
- `count` clamp 到 `1..1000`。
- `radius` clamp 到 `0..3000`。
- `spawnInterval` clamp 到 `0.01..10`。
- `twinkleDuration` clamp 到 `0.03..10`。
- `batchMin` clamp 到 `1..100`。
- `batchMax` clamp 到 `batchMin..100`。
- `size` clamp 到 `1..400`。
- alpha 使用 `Math.sin(localAge * Math.PI)` 和 shimmer 波形。

更新 `apps/anieditorv5viewer/src/runtime/v5g-player.ts`：

- 在 `contentRoot` 之后新增 `particleRoot`，粒子绘制在普通图层之上。
- 每次 `seek()` 后重绘粒子；先销毁旧粒子 sprite，避免泄漏。
- 粒子 emitter 使用当前 sampled layer transform 和 sampled opacity，而不是只用 base layer transform。
- 如果 image layer 当前有 active `particles` 或 `particle_twinkle` 动画，普通 layer display 在该时间段隐藏，粒子 sprite 负责显示。
- 粒子 sprite 的 blendMode 使用原 layer blendMode。
- 缺失 texture、缺失 asset 或 texture size 不匹配继续显式失败。
- 保留并扩展现有 canvas 诊断能力，至少继续写入 `data-v5g-time`、`data-v5g-visible-layers`、`data-v5g-pixel-samples`、`data-v5g-non-background-samples`、`data-v5g-max-pixel-delta`；建议新增 `data-v5g-project-id`，方便浏览器验收区分当前项目。
- `destroy()` 必须取消 playback RAF、pixel diagnostics RAF，断开 `ResizeObserver`，销毁 Pixi app 和显示对象；项目切换后 DOM 中不得残留旧 canvas 或旧项目 dataset。

更新 `apps/anieditorv5viewer/src/runtime/layer-instance.ts`：

- `V5GLayerInstance` 建议保存 image texture 或 texture size，方便粒子渲染使用。
- `text` 图层仍可保留现有基础支持；当前 4 个 JSON 没有 text 图层。

## 11. 测试计划

更新或新增测试时，优先改测试 fixture 和预期，不要为了测试改生产语义。

必须覆盖：

```text
apps/anieditorv5viewer/tests/runtime/animation-sampler.test.ts
apps/anieditorv5viewer/tests/runtime/project-sampler.test.ts
apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts
apps/anieditorv5viewer/tests/runtime/validation.test.ts
```

建议新增：

```text
apps/anieditorv5viewer/tests/runtime/particle-sampler.test.ts
```

测试要求：

- `validation.test.ts`
  - 4 个内置 JSON 都能 `assertV5GProject()` + `validateV5GProject()`。
  - 新动画类型被接受。
  - 缺失新动画必需数字参数会失败。
  - 新动画 numeric param 如果是字符串数字也失败。
  - `particles` 的 `fadeOut`、`shake` 的 `decay` 如果不是 boolean 会失败。
  - 顶层 `project.particles` 非空仍失败。
  - 未知动画、未知 easing、未知 blend mode 仍失败。
- `asset-manifest.test.ts`
  - 4 个项目的所有 `asset.path` 都能从 `bundledAssetUrlManifest` resolve。
  - manifest 缺资源仍失败。
- `animation-sampler.test.ts`
  - `shake` 会叠加 x/y 偏移。
  - `scale_in` / `scale_out` 会叠加缩放并处理 fade。
  - `pop` 在 `peakAt` 前后符合预期。
  - `blink` 在结束帧使用 `endOpacity`。
  - `move + shake`、`rotate + swing`、`scale_up + pulse` 这类组合动画不会互相覆盖 base。
  - 负 `scaleX` / `scaleY` 经过 scale 动画后符号仍保留。
- `project-sampler.test.ts`
  - 普通动画结束边界仍按现有语义可见。
  - active particle animation 时间段能标记原 layer display 需要隐藏，但 sampled opacity 不应被清零。
  - particle animation 结束瞬间不再 active。
- `particle-sampler.test.ts`
  - 同 seed、同时间采样结果稳定。
  - `particles` count 和关键范围 clamp 生效。
  - `particle_twinkle` batch 数、alpha 和 active 时间符合预期。

## 12. README 更新

更新：

```text
apps/anieditorv5viewer/README.md
```

至少说明：

- viewer 现在内置 4 个项目：
  - `project.json`
  - `bigwin.json`
  - `megawin.json`
  - `superwin.json`
- JSON 来源和图片来源：
  - `docs/anieditor5/export/*.json`
  - `docs/anieditor5/export/assets/*`
- UI 可以选择项目播放。
- 当前支持的动画类型完整列表。
- `particles` / `particle_twinkle` 是 layer animation，已支持。
- 顶层 `project.particles`、非空 keyframes、group、nested parentId 仍不支持并显式失败。
- 正确 dev 命令使用：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

## 13. 验收命令

基础检查：

```bash
git status --short
git diff -- docs/anieditor5/src/animation_presets.ts docs/anieditor5/src/constants.ts docs/anieditor5/src/main.ts docs/anieditor5/src/pixi_stage.ts docs/anieditor5/src/types.ts
```

如果依赖缺失或 lockfile 需要更新：

```bash
pnpm install
```

如果下载失败，先执行代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

app 级验收：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

根级验收：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

如果根级命令因为本任务无关的既有问题失败，必须在报告里写清楚：

- 失败命令
- 失败摘要
- 为什么判断为既有问题或环境问题
- 本任务相关的 app 级命令是否通过

## 14. 浏览器冒烟验收

启动本地 dev server：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

然后打开：

```text
http://localhost:5175
```

必须检查：

- 页面无 fatal error。
- 项目选择器有 4 个选项：
  - `project`
  - `bigwin`
  - `megawin`
  - `superwin`
- 4 个项目都能切换。
- 每个项目切换后：
  - stage 清空旧项目并显示新项目。
  - timeline 最大值等于该项目 `stage.duration`。
  - Play/Pause、Restart、Loop、拖动 timeline 可用。
  - canvas 非空。
  - `data-v5g-project-id` 或等价诊断能证明当前项目已切换。
  - `data-v5g-non-background-samples` 在可见时间点大于 0。
- 对 `bigwin`、`megawin`、`superwin`：
  - 播放到包含 `particles` / `particle_twinkle` 的时间段，能看到粒子效果。
  - active particle 时间段原图层不会同时叠出一份静态原图。
- 浏览器控制台没有未处理异常。
- 用窄屏 viewport 复查一次，确认控制条、项目选择器和 timeline 没有水平溢出。

如果端口 5175 被占用，换一个端口并在报告中记录实际 URL。

浏览器验收完成后停止 dev server，不要留下后台进程。

## 15. agents.md 同步规则

本任务默认不需要更新 `AGENTS.md` / `agents.md`，因为只是更新现有 app 和 app 内 README，没有改变仓库协作规则、目录规范或根级脚本。

但如果实现中发生以下任一情况，必须同步更新两个文件，并保持内容一致：

- 新增仓库级脚本。
- 新增资源同步的仓库级强制规范。
- 改变 `apps/`、`packages/`、`tasks/`、`docs/` 的目录约定。
- 改变依赖安装、测试、构建的仓库级约定。
- 新增需要后续所有任务遵守的 viewer 资源提交规则。

报告中必须说明是否更新了 `AGENTS.md` / `agents.md`；如果未更新，说明原因。

## 16. 任务报告要求

任务完成后新增：

```text
tasks/31-anieditorv5viewer-update-[utctime].md
```

报告必须是中文，至少包含：

- 任务结论。
- 新增/修改/删除文件列表。
- 资源同步结果：
  - 4 个 JSON 路径。
  - 图片资源数量。
  - 所有 `asset.path` 是否有对应文件。
  - 纹理尺寸校验是否通过。
- 支持的项目列表和每个项目的摘要。
- 新增支持的动画类型。
- 粒子动画实现说明。
- fail-fast 边界说明。
- 测试和构建命令结果。
- 浏览器冒烟结果和实际 URL。
- canvas 诊断数据摘要，例如每个项目至少一个可见时间点的 `data-v5g-non-background-samples`。
- 是否更新 `AGENTS.md` / `agents.md`，以及原因。
- 是否有偏离本计划的实现决策。
- 如有未完成项或环境问题，必须明确列出。

## 17. 二次检查清单

提交报告前，执行者必须重新检查：

- 是否 4 个 JSON 都被内置并能在 UI 中选择。
- 是否所有 JSON `asset.path` 都能解析到 `apps/anieditorv5viewer/src/assets/assets/*`。
- 是否每个已加载纹理的实际尺寸与 JSON `asset.width/height` 一致。
- 是否遗漏 `screen` blend mode。
- 是否把 `particles` / `particle_twinkle` 当成顶层 `project.particles` 处理错了。
- 是否仍然错误拒绝新 layer animation 类型。
- 是否为了新 JSON 关闭了未知动画、未知资源、未知 easing 的失败。
- 是否粒子动画 active 时原 image layer 被隐藏。
- 是否项目切换时销毁旧 player，避免 RAF、ResizeObserver 或 Pixi display 泄漏。
- 是否 timeline duration 随项目切换。
- 是否 README 仍只说支持单个 `project.json`。
- 是否保留或更新了 `data-v5g-*` canvas 诊断，浏览器验收不是只靠肉眼。
- 是否 app 级 `typecheck/lint/test/build/format:check` 都执行并记录。
- 是否根级 `typecheck/lint/test/build/format:check/git diff --check` 都执行并记录，或清楚记录了无关失败。
- 是否做了浏览器冒烟，并确认 3 个新 JSON 都能播放。
- 是否 dev server 在验收后停止。
- 是否写了 UTC 命名的中文任务报告。
- 是否确认 `AGENTS.md` 和 `agents.md` 是否需要同步。
