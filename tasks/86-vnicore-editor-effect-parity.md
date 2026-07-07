# vnicore editor effect parity 任务计划

## 1. 任务目标

持续完善 `packages/vnicore`，把 `docs/anieditor5/src` 编辑器当前更新同步到 Pixi v8 runtime 与上传式 viewer：

```text
packages/vnicore
apps/anieditorv5viewer
```

本任务的核心不是 Cocos Creator 兼容，也不是给 vnicore 增加 Cocos fallback。`packages/vnicore` 本来就是 Pixi.js v8 VNI runtime，vnicore 只关心两件事：

1. 性能：runtime 不能因为编辑器实现方便就每帧重建昂贵资源、重复读像素、泄漏 texture 或绕过现有 sprite/cache/pool 机制。
2. 动画效果必须和编辑器 Pixi 预览完全一样：同一个给 vnicore 用的 VNI 导出，在 `docs/anieditor5/src/pixi_stage.ts` 里看到的 Pixi 预览效果，必须在 `packages/vnicore` / `apps/anieditorv5viewer` 中一致。

编辑器导出的 vnicore runtime 包一定不是 Cocos Creator 兼容版本。因此：

- 不以 `legacy_alpha` / Cocos-compatible export 作为 vnicore 的目标输入。
- 不为了 Cocos 兼容保留或扩展 vnicore 行为。
- 不修改 `packages/anieditorv5runtime-cc`。
- 如果 implementation 发现输入是 Cocos-compatible 路径，应显式失败或明确标记为非 vnicore runtime export，不要做隐藏兼容。

本计划是完整可执行版本，不能依赖任何别的上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、viewer 同步、文档同步、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/86-vnicore-editor-effect-parity-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/86-vnicore-editor-effect-parity-260707-123456.md
```

## 2. 当前已观察到的更新内容

以下是制定本计划时在本地工作区观察到的事实。执行时必须重新验证，不能只照抄本节。

当前 `git status --short --untracked-files=all` 显示：

```text
 M docs/anieditor5/src/constants.ts
 M docs/anieditor5/src/main.ts
 M docs/anieditor5/src/project_state.ts
 M docs/anieditor5/src/types.ts
?? tasks/85-anieditorv5runtime-cc-playback-event-release-fix.md
```

不要修改、删除或回滚无关的 `tasks/85-anieditorv5runtime-cc-playback-event-release-fix.md`。

当前 `docs/anieditor5/src` diff 的主要变化：

- `docs/anieditor5/src/constants.ts`：`VNI_VERSION` 从 `VNI_0.042` 升到 `VNI_0.045`。
- `docs/anieditor5/src/types.ts`：`V5GProjectConfig` 新增可选字段 `maskCompositeMode?: V5GMaskCompositeMode`。
- `docs/anieditor5/src/project_state.ts`：新项目默认写入 `maskCompositeMode: "precompose_light_alpha"`。
- `docs/anieditor5/src/main.ts`：
  - 新增 `cb-cocos-compatible` 编辑器 UI 复选框。
  - 新增 `inferProjectMaskCompositeMode()`、`getCurrentMaskCompositeMode()`、`syncCocosCompatibilityCheckbox()`、`updateProjectMaskCompatibilityFromCheckbox()`。
  - 新建或恢复 mask 时使用当前项目遮罩模式。
  - 播放期间 `setPlayheadSeconds(..., { lightweightUi: true })` 只更新 playhead/time UI，减少属性面板重渲染。

对 vnicore 来说，上述 diff 的有效信息不是“要支持 Cocos 兼容”，而是：

- VNI schema 版本升到 `VNI_0.045`。
- vnicore runtime profile 应使用 Pixi 预览路径，即 `precompose_light_alpha` 相关效果。
- `project.maskCompositeMode` 是编辑器层面的项目偏好/导出元数据；vnicore 不能用它把错误 layer mask 偷偷改对。
- 编辑器播放优化提醒我们：runtime 侧也必须避免不必要的全量重算，但不要复制编辑器 DOM/UI 优化代码。

当前未看到 `docs/anieditor5/export/*.json` 或 zip 文件被 git diff 修改。不要手改导出 JSON 来“模拟”新版导出；只有真实导出或用户提供的新导出文件才作为 fixture 来源。

## 3. 二次审计发现的关键遗漏

这次复查发现上一版计划漏掉了真正重要的 runtime 视觉等价问题：

```text
docs/anieditor5/src/pixi_stage.ts
packages/vnicore/src/pixi/vni-player.ts
```

编辑器 Pixi 预览中，`precompose_light_alpha` 对 `add` / `screen` / `lighten` 这类光效图层不是简单 native alpha mask。编辑器当前逻辑是：

1. 只在以下条件满足时走预合成光效遮罩：
   - `layer.mask.enabled === true`
   - `layer.mask.compositeMode === "precompose_light_alpha"`
   - target layer 是 image
   - source layer 是 image
   - target layer `blendMode` 是 `add` / `screen` / `lighten`
   - source / target 都有可用 runtime asset
2. 用 stage 尺寸创建离屏 canvas。
3. 按 target transform 把目标光效图层画入 stage canvas。
4. 按 mask source transform 把遮罩源画入 stage canvas。
5. 对每个像素计算：

```text
sourceAlpha = targetAlpha / 255
lightAlpha = max(targetR, targetG, targetB) / 255 * sourceAlpha
maskAlpha = maskSourceAlpha / 255 * maskOpacity
outputAlpha = clamp(lightAlpha * maskAlpha, 0, 1)
targetAlpha = round(outputAlpha * 255)
```

6. 用生成的全舞台 sprite 承担视觉显示，原 display 只保留透明命中区域。
7. 使用 key 缓存预合成结果，只有 stage、asset、transform、opacity、blendMode 等影响输出的值变动时才重建。

当前 `packages/vnicore/src/pixi/vni-player.ts` 需要重点核对：现有代码对 `precompose_light_alpha` 做了 image texture 校验和 mask cache key 记录，但随后仍通过 `getOrCreateMaskSprite()` / `applyMaskSpriteState()` 走 Pixi native mask sprite。这个路径很可能没有实现编辑器的“去黑光效预合成”视觉语义，因此不能算和编辑器完全一致。

本任务必须把这个差异作为核心实现目标，而不是只处理 `project.maskCompositeMode` 的 schema 字段。

## 4. 仓库和环境约束

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

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。禁止通过未知字段静默吞掉、缺资源渲染占位图、自动猜资源路径、用 Cocos-compatible legacy 路径绕开 Pixi 效果差异、viewer 私下复制 runtime 算法等方式“跑通”。

## 5. 必须先执行的现状确认

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
git diff -- docs/anieditor5/src/constants.ts docs/anieditor5/src/main.ts docs/anieditor5/src/project_state.ts docs/anieditor5/src/types.ts
```

必须确认当前 viewer 是上传 zip 为主，不恢复旧 bundled assets：

```bash
git ls-files apps/anieditorv5viewer
test ! -e apps/anieditorv5viewer/src/assets
```

必须确认 `docs/anieditor5/export` 与 `packages/vnicore/tests/fixtures/export` 当前有哪些文件：

```bash
git ls-files docs/anieditor5/export
git ls-files packages/vnicore/tests/fixtures/export
```

必须阅读以下文件，以当前代码为准：

```text
agents.md
docs/anieditor5/src/constants.ts
docs/anieditor5/src/main.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/types.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/export_project.ts
docs/anieditor5/export/*.json
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/tests/uploaded-zip-project.test.ts
apps/anieditorv5viewer/README.md
```

必须特别对比这两段实现：

```text
docs/anieditor5/src/pixi_stage.ts
  shouldUsePrecomposedLightMask()
  syncPrecomposedLightMask()
  createPrecomposedLightMaskCanvas()

packages/vnicore/src/pixi/vni-player.ts
  syncLayerMasks()
  getOrCreateMaskSprite()
  applyMaskSpriteState()
  createMaskCacheKey()
```

## 6. 实现范围和非范围

### 6.1 必须实现

1. `packages/vnicore` 支持新版 `VNI_0.045` 项目字段解析，但实现重点是 Pixi 效果等价，不是 Cocos 兼容。
2. `packages/vnicore` 的 `precompose_light_alpha` 光效遮罩视觉必须和编辑器 Pixi 预览一致。
3. `packages/vnicore` 的实现必须有性能保护：
   - 不每帧读像素或重建预合成 texture。
   - cache key 覆盖 stage、asset URL/尺寸、target/source transform、target/source opacity、target blendMode 等所有影响输出的输入。
   - 输入未变时复用既有 sprite/texture。
   - 输入变化时销毁旧 texture，避免泄漏。
   - project 切换、destroy、layer mask 关闭时清理缓存。
4. `apps/anieditorv5viewer` 继续只做上传 zip、profile 选择、summary/diagnostics、播放控制和 `VNIPlayer` public API 调用。
5. 测试必须证明视觉算法和性能缓存，而不是只证明类型能编译。
6. 若出现新的真实 `docs/anieditor5/export` 导出文件，按字节一致规则同步到 `packages/vnicore/tests/fixtures/export`，并更新 viewer zip 测试输入。

### 6.2 不应实现

1. 不把编辑器 DOM 复选框 `cb-cocos-compatible` 搬进 `vnicore` 或 viewer。
2. 不把 `packages/anieditorv5runtime-cc` 纳入本任务。
3. 不为 `legacy_alpha` / Cocos-compatible export 增加 vnicore 支持。
4. 不以 `legacy_alpha` 作为 vnicore 的正常 runtime profile 验收输入。
5. 不用 `project.maskCompositeMode` 覆盖或修复 `layer.mask.compositeMode`。
6. 不把编辑器的轻量 playhead DOM 更新搬进 vnicore；runtime 只需要保持自身播放/seek/update 不触发不必要重建。
7. 不手工改 `docs/anieditor5/export/*.json` 的 `schemaVersion` 到 `VNI_0.045`。导出文件必须来自真实编辑器导出或用户提供。

## 7. vnicore 修改步骤

### 7.1 类型和 schema

修改：

```text
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
```

要求：

- `V5GProjectConfig` / `VNIProjectConfig` 加入可选 `maskCompositeMode?: V5GMaskCompositeMode`。
- `assertV5GProject(value)` 读取并保留合法字段。
- 字段缺失时保留为 `undefined`，不要根据 layer masks 推断。
- 字段存在时只能是 `"precompose_light_alpha"` 或 `"legacy_alpha"` 这两个 schema 字面量。
- 对给 vnicore 用的 runtime export，若 `project.maskCompositeMode === "legacy_alpha"`，必须作为非 Pixi-runtime 目标输入显式失败；不要把它当成需要适配的 Cocos 兼容模式。
- `layer.mask.compositeMode` 仍必须由 layer 自己声明。项目级字段不能兜底 layer 字段。

如果旧测试依赖 `legacy_alpha` 作为 vnicore 正常播放路径，应修改测试或重新划分测试合同，不要让测试倒逼生产代码继续支持 Cocos-compatible runtime export。新增 VNI Pixi 导出必须走 `precompose_light_alpha`。

### 7.2 抽出 Pixi 光效遮罩预合成算法

修改：

```text
packages/vnicore/src/pixi/vni-player.ts
```

可以在同文件内实现，也可以新增内部 helper 文件，例如：

```text
packages/vnicore/src/pixi/precomposed-light-mask.ts
```

要求按编辑器算法实现：

- 只在编辑器同等条件下启用预合成光效遮罩：
  - enabled alpha mask
  - `compositeMode === "precompose_light_alpha"`
  - target/source 都是 image
  - target blendMode 是 `add` / `screen` / `lighten`
  - target/source texture 与 asset metadata 可用
- 使用 stage 尺寸作为预合成画布/纹理尺寸。
- 按 editor 坐标和 asset display compensation 画入 target/source。
- 像素 alpha 公式必须与编辑器一致：

```text
sourceAlpha = targetAlpha / 255
lightAlpha = max(targetR, targetG, targetB) / 255 * sourceAlpha
maskAlpha = maskSourceAlpha / 255 * maskOpacity
outputAlpha = clamp(lightAlpha * maskAlpha, 0, 1)
targetAlpha = round(outputAlpha * 255)
```

- 预合成 sprite 的 blendMode 使用 target layer blendMode。
- 预合成 sprite 的 alpha 使用 target sampled opacity。
- 预合成视觉承担显示；原 target display 不应再以普通图像显示导致双重叠加。
- 非 light blendMode 的 `precompose_light_alpha` 仍按编辑器路径走普通 alpha mask，不要硬套光效预合成。

如果使用 canvas 读写像素：

- 只允许在缓存 miss 或输入变更时做。
- 不允许在每个 `update()` / `seek()` tick 中无条件做。
- 必须正确销毁旧 `PIXI.Texture` / sprite。

如果使用 Pixi RenderTexture 或 shader 优化：

- 仍必须用像素测试证明结果等价编辑器公式。
- 不能因为优化改变 alpha、blendMode、坐标、scale 或 opacity 结果。

### 7.3 缓存和生命周期

修改：

```text
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/pixi/vni-player.test.ts
```

要求：

- cache key 至少包含：
  - `precompose_light_alpha`
  - stage width/height
  - target layer id
  - source layer id
  - target/source texture identity 或 asset URL identity
  - target/source texture file size
  - target/source logical asset size
  - target/source transform
  - target/source opacity
  - target blendMode
- `seek()` 到不同时间但上述输入不变时，不重建预合成 texture。
- target/source transform、opacity、blendMode、stage 或 texture 变化时，必须重建。
- mask 关闭、layer 不再 active、project switch、`destroy()` 时必须释放旧 texture/sprite。
- 不要让隐藏的 mask source 因 `showSourceLayer=false` 消失后影响实际 mask 采样。

### 7.4 测试

修改或新增：

```text
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/tests/core/validation.test.ts
```

至少覆盖：

- `assertVNIProject` 接受 `VNI_0.045` 和 `maskCompositeMode: "precompose_light_alpha"`。
- `project.maskCompositeMode` 缺失的旧导出仍可加载。
- 对 vnicore runtime profile，`project.maskCompositeMode: "legacy_alpha"` 或 enabled layer mask 使用 `legacy_alpha` 时显式失败，错误信息说明这不是 Pixi runtime export 目标。
- `project.maskCompositeMode` 不能兜底缺失或非法 `layer.mask.compositeMode`。
- 用 1x1 或 2x2 小图证明 `precompose_light_alpha` 像素公式和编辑器一致。
- 用带 transform/opacity 的 source mask 证明坐标、scale、rotation、opacity 输入进入 cache key 和输出。
- `add` / `screen` / `lighten` 触发预合成光效遮罩。
- `normal` / `multiply` 等非 light blendMode 不走预合成，而走编辑器同等普通 alpha mask。
- cache miss / hit 行为：同一输入多次 `seek()` 不重复重建 texture，输入变化才重建。
- `destroy()` / project switch 清理 texture。

如果测试难以直接断言 Pixi 私有对象，优先提取纯 helper 做像素公式和 cache key 测试，再用 Pixi player 测试证明 helper 被正确接入。不要为了测试把生产代码写成奇怪的隐藏开关。

## 8. anieditorv5viewer 修改步骤

### 8.1 viewer 边界

检查：

```text
apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
```

要求：

- viewer 继续通过 `@slotclientengine/vnicore/core` 的 `assertVNIProject()` / `validateVNIProject()` 解析和校验项目。
- viewer 不实现自己的 mask/precompose 算法。
- viewer 不新增 Cocos-compatible 切换。
- viewer summary 可展示：
  - schema
  - profile
  - assetScale
  - animation type summary
  - mask summary
  - 是否包含 `precompose_light_alpha` light-mask 路径
- viewer 只调用 `VNIPlayer` public API，不能直接操作 runtime 私有 Pixi display tree。

### 8.2 viewer 测试

修改：

```text
apps/anieditorv5viewer/tests/uploaded-zip-project.test.ts
apps/anieditorv5viewer/tests/main.test.ts
```

至少覆盖：

- 上传/加载 `maskCompositeMode: "precompose_light_alpha"` 的 runtime project。
- summary 能显示 Pixi mask/precompose 信息。
- 输入为 Cocos-compatible / `legacy_alpha` runtime project 时显示上传或解析错误，不创建新 `VNIPlayer`。
- 保留现有检查：不要恢复 `src/assets/projects`、`src/assets/assets`、`src/config/bundled-projects.ts` 或 `src/runtime/asset-manifest.ts`。

### 8.3 viewer 文档

更新：

```text
apps/anieditorv5viewer/README.md
```

说明：

- viewer 是 vnicore 的 Pixi 预览壳。
- viewer 不支持 Cocos-compatible export。
- 光效遮罩和动画效果由 `packages/vnicore` 负责，与编辑器 Pixi 预览对齐。

## 9. 导出 fixture 和 zip 同步规则

当前 `docs/anieditor5/export/*.json` 没有 git diff。执行时仍需做二次确认：

```bash
git diff --name-only -- docs/anieditor5/export docs/anieditor5/*.zip
```

如果没有真实导出变更：

- 不要为了版本号手改 `docs/anieditor5/export/*.json`。
- 可以用测试内联 fixture 覆盖 `VNI_0.045` / `maskCompositeMode`。
- 保留现有 docs export 与 vnicore fixture。

如果有真实导出变更：

1. 同步 JSON：

```bash
cp docs/anieditor5/export/*.json packages/vnicore/tests/fixtures/export/
```

2. 用字节一致校验：

```bash
for f in docs/anieditor5/export/*.json; do
  target="packages/vnicore/tests/fixtures/export/$(basename "$f")"
  cmp "$f" "$target"
done
```

3. 如果 `docs/anieditor5/roundreel.zip` 或 `docs/anieditor5/megawin.zip` 发生变化，保留 viewer 测试读取这些 zip 的路径：

```text
docs/anieditor5/roundreel.zip
docs/anieditor5/megawin.zip
```

4. 不要把 zip 解包内容复制回 `apps/anieditorv5viewer/src/assets`；viewer 当前设计是上传 zip，不维护 bundled assets。

5. 若导出增加新图片，确认它们被 git 跟踪在：

```text
docs/anieditor5/export/assets/
```

并由 zip 或 project asset path 正确引用。

## 10. agents.md 同步判断

执行结束前必须检查并同步：

```text
agents.md
```

本任务很可能需要把以下长期规则写入 `agents.md`：

```text
packages/vnicore 是 Pixi.js v8 VNI runtime，目标是性能和编辑器 Pixi 预览效果完全一致；vnicore 使用的 VNI 导出不是 Cocos Creator 兼容版本，不为 Cocos-compatible legacy_alpha 路径增加隐藏适配。光效遮罩、粒子、走马灯等效果必须以 docs/anieditor5/src 的 Pixi 预览语义为准，并用缓存/池化保证 runtime 性能。
```

如果判断不需要更新，也必须在任务报告中写明原因。但如果本任务实际改变了 vnicore/Cocos 边界，默认应更新。

## 11. 验收命令

实现后至少执行以下命令：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
git diff --check
```

如果依赖下载失败，先执行代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

再重试失败命令。

如果修改了根级脚本、workspace 配置、`agents.md` 或影响多个包的 public export，再补跑：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

如果根级命令因为无关历史问题失败，任务报告中必须记录：

- 失败命令。
- 失败摘要。
- 是否与本任务改动相关。
- 本任务范围内已通过的 scoped 命令。

## 12. 可选浏览器验收

如果本机允许启动 dev server，执行：

```bash
pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1
```

在浏览器打开 Vite 输出地址，手动上传：

```text
docs/anieditor5/roundreel.zip
docs/anieditor5/megawin.zip
```

验收点：

- 上传后能创建画布和 `VNIPlayer`。
- summary 显示 schema、profile、assetScale、duration、动画类型和 Pixi mask 信息。
- `precompose_light_alpha` 光效遮罩效果与编辑器 Pixi 预览一致。
- 播放、暂停、seek、segmented playback 仍可用。
- 重复播放/seek 不出现明显卡顿或 texture 泄漏。
- viewer 没有 Cocos-compatible 切换或私有 mask 渲染逻辑。

如果无法做浏览器验收，不要写成已完成；在任务报告中标记为人工 handoff。

## 13. 二次遗漏检查

完成代码和测试后，必须做一次真实二次检查：

```bash
rg -n "maskCompositeMode|legacy_alpha|precompose_light_alpha|precompose|lightweightUi" docs/anieditor5 packages/vnicore apps/anieditorv5viewer packages/anieditorv5runtime-cc -g '!**/dist/**' -g '!**/coverage/**'
rg -n "VNI_0\\.042|VNI_0\\.045" docs/anieditor5 packages/vnicore apps/anieditorv5viewer packages/anieditorv5runtime-cc -g '!**/dist/**' -g '!**/coverage/**'
git diff --name-only
git diff --stat
```

检查重点：

- `packages/vnicore` 类型、validation、Pixi precompose 实现、tests、README/docs 是否同步。
- `precompose_light_alpha` 是否真正实现编辑器 Pixi 的去黑光效预合成，而不是只走 native mask。
- cache key 是否覆盖所有影响输出的输入。
- texture/sprite 生命周期是否清理。
- `apps/anieditorv5viewer` 是否仍是 thin shell，没有复制 runtime 算法。
- `apps/anieditorv5viewer/src/assets` 等旧 bundled 目录没有被恢复。
- `legacy_alpha` / Cocos-compatible 路径没有被当成 vnicore 正常目标扩展。
- `docs/anieditor5/export` 没有被手工改版本号。
- `packages/anieditorv5runtime-cc` 没有被无意修改。
- `agents.md` 是否同步了新的长期边界。

## 14. 任务报告要求

任务完成后新建中文报告：

```bash
utc="$(date -u +%y%m%d-%H%M%S)"
report="tasks/86-vnicore-editor-effect-parity-${utc}.md"
```

报告必须包含：

- 本次实际更新内容。
- 关键文件列表。
- vnicore 最终合同：性能 + 编辑器 Pixi 效果完全一致；不支持 Cocos-compatible runtime export。
- `precompose_light_alpha` 的最终实现说明和与编辑器公式的对齐证据。
- cache / texture 生命周期的性能证据。
- 是否同步 `docs/anieditor5/export` 与 `packages/vnicore/tests/fixtures/export`，以及校验证据。
- 是否更新 `agents.md`，若未更新说明原因。
- 所有验收命令和结果。
- 未完成的浏览器/真实编辑器验证 handoff。
- 已知风险和后续建议。

报告也必须写明：本任务是否新增依赖、是否改变 `pnpm-lock.yaml`、是否触碰 `packages/anieditorv5runtime-cc`。
