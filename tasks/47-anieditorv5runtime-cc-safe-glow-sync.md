# anieditorv5runtime-cc safe glow sync 任务计划

## 1. 任务目标

更新 Cocos Creator 3.8.6 runtime：

```text
/Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
```

把任务 46 已在 `packages/vnicore` 落地的 VNI 能力同步到 Cocos runtime，尤其是当前主要交付面：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone.zip
```

本任务的核心是支持 `VNI_0.017` 新动画类型 `safe_glow`，并用任务 46 新增的 `lock_01.json` 作为真实导出 fixture 验收。`safe_glow` 必须在 Cocos runtime 中真实可播放，不能像旧 `shatter` / `glow` 一样 fail-fast unsupported。

必须同步的任务 46 能力：

- `V5GAnimationType` 新增 `safe_glow`。
- `safe_glow` 参数校验：`spread`、`minOpacity`、`maxOpacity`、`pulses` 必须是 finite number；`keepOriginal` 是 optional boolean。
- `safe_glow` 默认 easing 是 `linear`。
- `sampleLayerAnimationsAtTime(...)` 中 `safe_glow` 与旧 `glow` 一样支持 `keepOriginal=false` 隐藏源图。
- 新增独立 safe glow sampler，按任务 46/vnicore 语义输出同图副本采样：
  - 使用当前图层同一张 `SpriteFrame`。
  - 使用 normal blend。
  - alpha 使用 cosine wave 在 `minOpacity` 和 `maxOpacity` 之间呼吸。
  - scale 使用 sampled transform 的 `scaleX/scaleY * (1 + spread)`。
  - `alpha <= 0.002` 或 `spread <= 0.001` 时不创建副本。
  - 起始帧 `time === startTime` 可以采样，不沿用旧 render effect 的“起始帧不出效果”规则。
- `project-sampler` 必须新增 `hasActiveSafeGlowAnimation`，让 `keepOriginal=false` 且源图 opacity 为 0 时仍保持该 layer 的 runtime 可见性；同时 `renderImageDisplay=false`，只隐藏源图，不隐藏 safe glow 副本。
- `V5GCocosPlayer` 必须为每个 image layer 创建 safe glow 渲染容器或可复用节点池，渲染顺序为：

```text
<layer image node>
<layer safe glow container/nodes>
<layer particles node>
```

- `validateCocosV5GProject(...)` 继续对 enabled `shatter` / `glow` 显式失败，但不能拒绝 enabled `safe_glow`。
- 新增 `lock_01.json` Cocos fixture，并覆盖 `VNI_0.017`、`safe_glow`、`idle`、`particle_twinkle`、单 group 无合法 slot 的验收。
- 保持任务 45 已有的 layer group、slot 挂接、粒子、segmented playback、atlas 绑定、standalone 单文件和 zip 交付合同不回归。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、standalone 交付、文档同步、协作规则同步判断和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/47-anieditorv5runtime-cc-safe-glow-sync-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/47-anieditorv5runtime-cc-safe-glow-sync-260625-123456.md
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
git status --short --untracked-files=all
git diff --stat
```

当前仓库同时存在：

```text
AGENTS.md
agents.md
```

当前协作规则已经要求：更新 `packages/anieditorv5runtime-cc` 的 public runtime 行为时，必须同步模块化源码、`standalone/anieditorv5runtime-cc.ts`、`scripts/check-standalone.mjs`、standalone 测试和 `standalone.zip`。因此本任务默认不需要新增长期规则。若实现中新增了必须长期遵守的规则，必须同步更新 `AGENTS.md` 和 `agents.md`，并用下面命令确认一致：

```bash
cmp -s AGENTS.md agents.md
```

是否更新以及原因必须写入任务报告。

## 3. 需要先阅读的上下文

执行时必须重新阅读当前实现，以实际代码为准。至少阅读以下文件：

```text
tasks/46-vnicore-safe-glow-node-insertion.md
tasks/46-vnicore-safe-glow-node-insertion-260625-034429.md
tasks/45-anieditorv5runtime-cc-layer-groups-render-effects.md
tasks/45-anieditorv5runtime-cc-layer-groups-render-effects-260624-065715.md
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/safe-glow-sampler.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/core/safe-glow-sampler.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/tests/fixtures/export/lock_01.json
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/core/animation-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/project-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/README.md
AGENTS.md
agents.md
```

建议用下面命令核对任务 46 和最近 runtime 相关提交：

```bash
git log --oneline --decorate -n 20
git show --stat --oneline d799de6
git show --stat --oneline d187ad6
git show --stat --oneline 3c8876b
```

当前已知：

- `d799de6` 是任务 46 的主要提交，包含 `safe_glow`、`lock_01.json`、vnicore safe glow sampler、viewer 接入和任务 46 报告。
- `d187ad6` / `3c8876b` 近期改过 `packages/anieditorv5runtime-cc` 的 opacity 和粒子位置逻辑。实现本任务时必须尊重当前最终代码状态：不要为了 `safe_glow` 重新引入已经删除的旧 render effect 泛化保活逻辑；只添加 safe glow 专用状态。
- 如果执行时这些 commit id 已不可用，用 `git log --oneline -- packages/vnicore packages/anieditorv5runtime-cc tasks/46-vnicore-safe-glow-node-insertion.md` 找到对应提交和当前代码差异，再以当前代码为准。

## 4. 当前已知事实

### 4.1 任务 46 的 vnicore 结果

任务 46 已在 `packages/vnicore` 实现：

- `V5GAnimationType` 包含 `safe_glow`。
- `SUPPORTED_ANIMATION_TYPES` 包含 `safe_glow`。
- `DEFAULT_EASING_BY_TYPE.safe_glow = "linear"`。
- `REQUIRED_NUMERIC_PARAMS.safe_glow = ["spread", "minOpacity", "maxOpacity", "pulses"]`。
- `OPTIONAL_BOOLEAN_PARAMS.safe_glow = ["keepOriginal"]`。
- `safe_glow` 不属于旧 `VNIRenderEffectType`；`isRenderEffectAnimationType("safe_glow")` 必须为 `false`。
- `safe-glow-sampler.ts` 输出 `VNISafeGlowSpriteSample`，并提供：
  - `getSafeGlowProgress(...)`
  - `hasActiveSafeGlowAnimation(...)`
  - `sampleSafeGlowSpritesForLayer(...)`
- `project-sampler.ts` 中 `SampledLayerState` 包含：
  - `hasActiveRenderEffect`
  - `hasActiveSafeGlowAnimation`
  - `renderImageDisplay`
- `safe_glow` 起始帧可以采样；旧 `render-effect-sampler` 的起始帧空采样规则不能套用到 `safe_glow`。
- Pixi 渲染顺序为：

```text
display -> safeGlowDisplay -> effectDisplay -> particleDisplay
```

### 4.2 safe_glow 的语义边界

`safe_glow` 不是旧 `glow`：

- 不使用滤镜。
- 不使用模糊。
- 不使用 `screen` / `lighten` 等特殊混合。
- 不需要 shader / Effect 资产。
- 不需要 Cocos material 自定义 pass。
- 只用同图副本、缩放和透明度呼吸模拟高亮。

因此 Cocos runtime 应该支持 `safe_glow`，并继续拒绝旧 `shatter` / `glow`：

```text
validateCocosV5GProject(project with enabled safe_glow) => pass
validateCocosV5GProject(project with enabled shatter/glow) => throw
```

不允许用以下方式“凑过测试”：

- 把 `safe_glow` 静默当成 `idle`。
- 把 `safe_glow` 直接忽略。
- 把 `safe_glow` 当旧 `glow` fail-fast unsupported。
- 改掉 `lock_01.json` fixture 中的动画，绕开真实导出。
- 为了测试简单而让生产逻辑吞掉未知参数或缺失资源。
- 引入 hidden fallback，例如缺少 SpriteFrame 时创建 placeholder、自动猜路径、自动退回 normal 之外的任意效果。

如果测试出现奇怪写法，应优先修改测试断言或 fake driver，让测试表达真实合同；不要为了测试绿去改不该改的生产语义。

### 4.3 当前 anieditorv5runtime-cc 状态

当前 `packages/anieditorv5runtime-cc` 已有：

- Cocos Creator 3.8.6 runtime/adapter package。
- copyable standalone 单文件。
- `VNI_0.x` schema 接收。
- `fileWidth/fileHeight/fileScale` 资源 metadata。
- `project.layerGroups + layer.groupId`。
- render group 顺序来自 `project.layers` 中连续 group run，不使用 `layerGroups.order` 重排画面。
- `getLayerGroups()` / `getLayerGroupSlots()`。
- `attachNodeBetweenLayerGroups(...)` / `detachMountedNode(...)` / `clearMountedNodes()`。
- `attachProjectAssetBetweenLayerGroups(...)` / `attachSpriteFrameBetweenLayerGroups(...)`。
- atlas lookup 使用 `filenameStem(asset.path)`。
- `idle`。
- `particle_wall`、`particle_combo`、`particle_twinkle`、`particles`。
- `squash_stretch`。
- segmented playback、range playback、markers、completion listener、live particle drain。
- `normal/add/screen/multiply/lighten` blend mode。
- fake Cocos driver tests、standalone parity tests、standalone checker。

当前缺口：

- `src/core/types.ts` 尚未包含 `safe_glow`。
- `src/core/animation-sampler.ts` 尚未支持 `safe_glow` default easing 和 `keepOriginal` source opacity。
- `src/core/validation.ts` 尚未校验 `safe_glow` 参数，也没有 `lock_01` / `VNI_0.017` fixture 验收。
- `src/core/project-sampler.ts` 当前只有 `hasActiveParticleAnimation`，没有 `hasActiveSafeGlowAnimation`；`keepOriginal=false` 的 safe glow 会因为 source opacity 为 0 被整体隐藏。
- `src/core/index.ts` 还没有 safe glow sampler export。
- `src/cocos/player.ts` 每层当前只有 image node 和 particle container，没有 safe glow container/node 池。
- `standalone/anieditorv5runtime-cc.ts` 与模块化源码尚未同步 safe glow。
- `scripts/check-standalone.mjs` 尚未检查 safe glow public API/snippet。
- README 尚未声明 `safe_glow` 支持。
- `standalone.zip` 需要重建。

## 5. 非目标和边界

本任务不做：

- 不新增 `apps/anieditorv5viewer-cc`，也不把 Cocos Creator 项目工程、`.meta`、`Library` 缓存或场景文件作为本仓库交付物。真实 Cocos 验收可以在临时项目或用户现有项目中执行，但验收材料和结果只写入任务报告。
- 不在 runtime 中加载 JSON、加载资源目录或调用 `resources.load()`；JSON 和资源绑定仍由宿主 Cocos Component 负责。
- 不让 `packages/anieditorv5runtime-cc` runtime 依赖 `@slotclientengine/vnicore`。
- 不改 `apps/anieditorv5viewer`。
- 不改 `packages/vnicore`，除非执行时发现任务 46 本身有明确 bug，并需要另行记录。
- 不实现旧 `shatter` / `glow` 的 Cocos 渲染；它们仍然 fail-fast unsupported。
- 不新增 shader / Effect 文件；`safe_glow` 不需要 shader。
- 不为未知动画、未知资源、未知 blend mode、缺失参数提供隐藏兜底。
- 不把测试 fixture 改成更简单的假导出以规避真实合同。

## 6. 目标文件清单

预计需要修改或新增：

```text
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/safe-glow-sampler.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/fixtures/lock_01.json
packages/anieditorv5runtime-cc/tests/core/animation-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/project-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/safe-glow-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone.zip
tasks/47-anieditorv5runtime-cc-safe-glow-sync-[utctime].md
```

只有在新增长期协作规则时才修改：

```text
AGENTS.md
agents.md
```

## 7. 实施步骤

### 7.1 建立 baseline

在仓库根目录执行：

```bash
node --version
pnpm --version
git status --short --untracked-files=all
git diff --stat
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
```

如果 baseline 已经失败，先判断是否与本任务相关：

- 与本任务无关的既有失败，不要顺手重构；在任务报告记录失败命令、关键错误和为什么不阻塞本任务。
- 与本任务相关的失败，需要在实现中修复。

### 7.2 同步类型、动画采样和校验

更新 `src/core/types.ts`：

- 在 `V5GAnimationType` 中新增 `"safe_glow"`。

更新 `src/core/animation-sampler.ts`：

- `SUPPORTED_ANIMATION_TYPES` 新增 `"safe_glow"`。
- `DEFAULT_EASING_BY_TYPE.safe_glow = "linear"`。
- 在 `sampleLayerAnimationsAtTime(...)` 中让 `safe_glow` 进入 `sampleGlowSource(...)`，语义与 vnicore 对齐：

```text
keepOriginal=true 或未设置 => 源图保持显示
keepOriginal=false => 源图 opacity 变成 0
```

- 不要把 `safe_glow` 加入 `PARTICLE_ANIMATION_TYPES`。
- 不要把 `safe_glow` 当作 `idle`。
- 不要让 `safe_glow` 进入旧 `shatter/glow` unsupported 路径。

更新 `src/core/validation.ts`：

- `REQUIRED_NUMERIC_PARAMS.safe_glow = ["spread", "minOpacity", "maxOpacity", "pulses"]`。
- `OPTIONAL_BOOLEAN_PARAMS.safe_glow = ["keepOriginal"]`。
- `validateCocosV5GProject(...)` 只拒绝 enabled `shatter` / `glow`，不拒绝 enabled `safe_glow`。
- 添加测试证明 `validateV5GProject(...)` 和 `validateCocosV5GProject(...)` 都接受 `lock_01`。
- 添加测试证明缺少 `safe_glow.params.spread` 或 `minOpacity/maxOpacity/pulses` 会显式失败。
- 添加测试证明 `safe_glow.params.keepOriginal = "false"` 这种字符串会失败。

### 7.3 新增 safe glow sampler

新增：

```text
packages/anieditorv5runtime-cc/src/core/safe-glow-sampler.ts
```

优先从 `packages/vnicore/src/core/safe-glow-sampler.ts` 移植语义，但注意：

- Cocos runtime 不依赖 vnicore。
- 使用本包自己的 `clampNumber`、`roundTo`、`V5GAnimationConfig`、`V5GLayerConfig`、`V5GTransformConfig`。
- 不使用 `Array.prototype.includes(...)` 的代码如果会复制进 standalone；standalone checker 禁止 ES2016 `includes()`。

建议导出：

```ts
export interface VNISafeGlowLayerSampleState {
  layerId: string;
  transform: V5GTransformConfig;
  baseOpacity: number;
}

export interface VNISafeGlowSpriteSample {
  type: "safe_glow";
  layerId: string;
  animationId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  blendMode: "normal";
}

export function getSafeGlowProgress(...): number | null;
export function hasActiveSafeGlowAnimation(...): boolean;
export function sampleSafeGlowSpritesForLayer(...): VNISafeGlowSpriteSample[];
```

采样公式必须与任务 46 对齐：

```text
progress = clamp((time - startTime) / max(duration, 0.0001), 0, 1)
time < startTime 或 time >= startTime + duration => null
pulses <= 0 ? wave = 1 : wave = (1 - cos(progress * PI * 2 * pulses)) / 2
alpha = sampledLayer.baseOpacity * lerp(minOpacity, maxOpacity, wave)
scaleX = sampledLayer.transform.scaleX * (1 + spread)
scaleY = sampledLayer.transform.scaleY * (1 + spread)
rotation = sampledLayer.transform.rotation * PI / 180
blendMode = "normal"
```

保留 fail-fast：

- 参数不是 finite number 时抛错。
- 不要给缺失参数提供默认值。
- 只 clamp 数值范围，不吞掉类型错误。

更新 `src/core/index.ts`：

```ts
export * from "./safe-glow-sampler.js";
```

### 7.4 更新 project sampler 的显示状态

更新 `src/core/project-sampler.ts`：

- import `hasActiveSafeGlowAnimation`。
- `SampledLayerState` 新增：

```ts
hasActiveSafeGlowAnimation: boolean;
```

- 计算：

```text
activeSafeGlow = layer.visible && baseOpacity > 0 && hasActiveSafeGlowAnimation(layer, time)
visible = layer.visible && (opacity > 0 || activeSafeGlow)
renderImageDisplay = layer.visible && opacity > 0
```

注意：

- 当前 `hasActiveParticleAnimation` 仍只用于粒子 runtime。
- 不要恢复旧 `hasActiveRenderEffect` 泛化字段，除非实现旧 `shatter/glow`；本任务不实现旧 effect。
- `particle_combo.sourceOpacity` 仍按当前逻辑只影响源图，不清空粒子透明度。
- 入场动画首帧隐藏逻辑不能回归。

必须补测试：

- `safe_glow keepOriginal=false`：source opacity 为 0，`renderImageDisplay=false`，但 `visible=true`、`hasActiveSafeGlowAnimation=true`。
- `safe_glow` 结束后：`hasActiveSafeGlowAnimation=false`，source hidden 时 `visible=false`。
- `spread=0` 或 `alpha<=0.002` 时 sampler 不输出副本；project sampler 的 active 状态可以仍按动画 active 判断，但 renderer 不应创建可见副本。

### 7.5 更新 Cocos player 渲染树

更新 `src/cocos/player.ts`。

`ManagedLayer` 建议新增：

```ts
safeGlowContainer: TNode;
safeGlowNodes: TNode[];
```

初始化每个 image layer 时，group child 顺序必须变为：

```text
V5G Group <id>
  <layer image node>
  <layer name> Safe Glow
  <layer name> Particles
```

safe glow container 要求：

- `setContentSize(container, stage.width, stage.height)`。
- `setAnchorPoint(container, 0.5, 0.5)`。
- append 到同一个 group node，位于 image node 之后、particle container 之前。

在 deterministic frame / timeline frame 渲染时：

1. 先调用 `sampleProjectAtTime(...)`。
2. 更新源图 node transform、opacity、active，保持当前行为。
3. 根据 sampled layers 调用 `sampleSafeGlowSpritesForLayer(...)`。
4. 使用同一层的 `spriteFrame` 创建或复用 safe glow image node。
5. 对每个 safe glow node 设置：

```text
content size: managed.asset.width / managed.asset.height
anchor: managed.layer.transform.anchorX / managed.layer.transform.anchorY
position: v5gTransformToCocosPosition(sampledLayer.transform)
scale: safeGlow.scaleX / safeGlow.scaleY
rotation: safeGlow.rotation * 180 / Math.PI
opacity: opacityToCocosOpacity(safeGlow.alpha)
blend mode: getCocosBlendModeConfig("normal")
active: true
```

6. 多余 safe glow nodes 要销毁或 inactive，不能残留上一帧画面。
7. `destroyManagedNodes()` / `init()` 失败清理 / `destroy()` 必须清掉 safe glow nodes。

注意：

- safe glow 副本不挂到全局 `V5G Particles`。
- safe glow 副本不使用 particle runtime。
- safe glow 副本不改变 external mounted node 的 slot 顺序。
- safe glow 副本使用当前 layer 的 `SpriteFrame`；缺失 SpriteFrame 仍然沿用当前 fail-fast resolver，不创建 placeholder。
- atlas source 的 trimmed frame 行为保持任务 43 的合同：node content size 使用 JSON 逻辑尺寸；atlas source 不因 readable size 与 JSON 不一致而失败。
- normal blend 应走已有 `getCocosBlendModeConfig("normal")` / driver 默认 Sprite 路径，不引入 shader。

### 7.6 同步 standalone 单文件和检查脚本

必须把模块化源码的 safe glow 变更同步到：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

standalone 要求：

- 只允许 import `"cc"`。
- 不允许 workspace import、relative import、Node builtin、`window`、`document`、`resources.load()`。
- 不允许 `.includes(...)`。
- 必须保持 ES2015-safe。
- 必须包含 safe glow 类型、sampler、project sampler 字段、Cocos player 渲染逻辑、validation 逻辑。

更新：

```text
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
```

至少检查：

- `export interface VNISafeGlowLayerSampleState`
- `export interface VNISafeGlowSpriteSample`
- `export function getSafeGlowProgress`
- `export function hasActiveSafeGlowAnimation`
- `export function sampleSafeGlowSpritesForLayer`
- `hasActiveSafeGlowAnimation: boolean`
- `safe_glow`

如果执行时决定 safe glow sampler 不作为 public export，也必须在计划报告中解释原因，并让 checker 覆盖 standalone 必需片段，防止漏同步。

更新 standalone parity/import/player tests，证明：

- standalone 和 modular 都接受 `safe_glow`。
- standalone 和 modular 的 `sampleSafeGlowSpritesForLayer(...)` 输出一致。
- standalone `V5GCocosPlayer` 创建相同的 safe glow child order。
- `validateCocosV5GProject(...)` 在 standalone 中仍拒绝旧 `glow/shatter`，但接受 `lock_01` 的 `safe_glow`。

### 7.7 接入 lock_01 fixture

新增：

```text
packages/anieditorv5runtime-cc/tests/fixtures/lock_01.json
```

来源优先使用：

```text
packages/vnicore/tests/fixtures/export/lock_01.json
```

若该文件不存在，使用：

```text
docs/anieditor5/export/lock_01.json
```

fixture 不能删改真实动画来绕过测试。

必须在测试中验证：

```text
schemaVersion: VNI_0.017
name: lock_01
engineTarget.name: cocos_creator
engineTarget.version: 3.8.6
animationTypes includes safe_glow, idle, particle_twinkle
layerGroups length = 1
getVNIProjectLayerGroupSlots(project) returns []
validateCocosV5GProject(project) passes
V5GCocosPlayer.init() passes with fake sprite frames
```

fake asset resolver 可以根据 `asset.id` 返回 fake SpriteFrame；不需要把 PNG 图片复制到 runtime package。

### 7.8 更新测试

新增或更新 core tests：

```text
packages/anieditorv5runtime-cc/tests/core/animation-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/project-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/safe-glow-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
```

必须覆盖：

- `safe_glow` 是 supported animation type。
- 默认 easing 是 `linear`。
- `keepOriginal=false` 隐藏源图。
- `safe_glow` 不改变 transform。
- 起始帧 `time === startTime` 可采样。
- `time < startTime` / `time >= endTime` 不采样。
- `spread/minOpacity/maxOpacity/pulses` 参数类型错误显式失败。
- `keepOriginal` 类型错误显式失败。
- `lock_01` 被通用和 Cocos validation 接受。
- 旧 `glow/shatter` 在 Cocos validation 仍 fail-fast。

新增或更新 Cocos player tests：

```text
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
```

必须覆盖：

- `lock_01` 可以 init。
- safe glow container 在 source image node 后、particle container 前。
- `keepOriginal=false` 时源 image node inactive，但 safe glow node active。
- safe glow node 使用同一 `spriteFrame`。
- safe glow node opacity、scale、rotation 与 sampler 结果一致。
- safe glow node blend mode 是 normal。
- safe glow 节点数量随帧更新，不残留上一帧多余节点。
- 单 group 的 `lock_01` 没有合法 slot；已有 `3reel_multipay_02` slot 挂接测试不回归。
- enabled 旧 `glow` fixture 仍在 init 前失败，root 不残留半初始化节点。

新增或更新 standalone tests：

```text
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
```

必须覆盖：

- standalone 导出包含 safe glow API 或必要片段。
- standalone 与模块化 sampler 输出一致。
- standalone 与模块化 validation 对 `lock_01` / 旧 `glow` 的结果一致。
- standalone player 渲染 safe glow child order 与模块化一致。

如果测试需要调整 fake driver，应改测试/fake driver 表达 Cocos 合同，不要改生产逻辑绕过问题。

### 7.9 更新 README 和示例

更新：

```text
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

README 至少说明：

- `safe_glow` 已支持。
- `safe_glow` 使用同图副本、缩放和透明度，不需要 shader。
- 旧 `shatter/glow` 仍然 enabled fail-fast unsupported。
- `keepOriginal=false` 只隐藏源图，不隐藏 safe glow 副本。
- standalone 版是主要交付面，更新 public runtime 行为必须同步 standalone、checker、tests 和 zip。

示例如果不需要新增代码，可以只保持现状；如果新增注释或示例，不要把 JSON loading / resources loading 放进 runtime 示例。宿主仍负责 JSON 和 SpriteAtlas 绑定。

### 7.10 重建 standalone.zip

完成代码、测试和文档后，在 package 目录执行：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
cd ../..
```

`standalone.zip` 被 `.gitignore` 忽略也必须重建，用于交付验收。任务报告必须记录它是否存在、是否被 git 跟踪、以及 `zipinfo -1` 输出摘要。

预期 `zipinfo -1 standalone.zip` 只包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

不得包含：

```text
__MACOSX/
._*
dist/
src/
node_modules/
```

### 7.11 真实 Cocos Creator standalone 验收和换机交接

本任务的自动化验收基于 TypeScript、Vitest fake driver、standalone checker 和 build；这些不能等同于真实 Cocos Creator 编辑器验收。因为用户明确强调主要使用 standalone 版，执行者必须处理真实 Cocos 验收状态：

- 如果当前机器可以运行 Cocos Creator 3.8.6，必须用 standalone 版做一次真实项目验收。
- 如果当前机器不能运行 Cocos Creator 3.8.6，不能把 fake driver 测试写成真实验收通过；必须在任务报告中写明未运行原因，并提供可换机执行的 standalone 验收步骤。

真实 Cocos 验收建议文件清单：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
docs/anieditor5/export/lock_01.json
docs/anieditor5/export/assets/2_asset_image_mqqlcjh9_h.png
docs/anieditor5/export/assets/image_asset_image_mqp7sep7_i.png
docs/anieditor5/export/assets/image_asset_image_mqp7sgo9_k.png
docs/anieditor5/export/assets/image_asset_image_mqp7sii7_m.png
docs/anieditor5/export/assets/image_asset_image_mqp7sjxy_o.png
docs/anieditor5/export/assets/image_asset_image_mqs1j1mw_g.png
docs/anieditor5/export/assets/image_asset_image_mqs1pl10_h.png
```

真实 Cocos 验收步骤：

1. 使用 Cocos Creator 3.8.6 创建临时项目，或打开用户已有验证项目。不要把该项目、`.meta`、`Library`、临时场景提交回本仓库。
2. 把 `standalone/anieditorv5runtime-cc.ts` 复制到项目脚本目录，例如 `assets/scripts/anieditorv5runtime-cc.ts`。
3. 用宿主 Component 负责加载 `lock_01.json` 和图片资源，构造 `V5GProjectConfig` 与 `SpriteFrame` resolver 或 `SpriteAtlas` source；runtime 本身不能调用 `resources.load()`、不能读取 JSON、不能猜路径。
4. 按 `asset.path` filename stem 绑定 SpriteFrame，保持任务 43 的 atlas 合同：`filenameStem(asset.path)` 是 atlas key。
5. 创建 `V5GCocosPlayer`，调用 `init()`，并在宿主 Component 的 `update(deltaTime)` 中驱动 `player.update(deltaTime)`。
6. 播放 `lock_01`，观察 `safe_glow` 是否在起始帧附近可见，是否有同图放大/透明度呼吸效果，控制台是否无错误。
7. 如果 fixture 中某个 `safe_glow` 使用 `keepOriginal=false`，确认源图隐藏时 safe glow 副本仍可见；如果真实导出中没有可直观看出的 `keepOriginal=false` 场景，可以用最小测试 project 构造一个单层 `safe_glow keepOriginal=false` 用例，仍由宿主加载资源。
8. 可选但推荐：用含旧 `glow` 的 `3reel_multipay_01.json` 验证 `validateCocosV5GProject(...)` 或 `init()` 显式失败，确认没有把旧 `glow` 偷偷降级成 `safe_glow` 或 normal。

需要记录或回传的证据：

- Cocos Creator 版本号，必须是 `3.8.6`。
- 使用的 standalone runtime 文件来源和 `standalone.zip` 生成时间。
- 控制台错误截图或文本；无错误也要写明。
- `lock_01` 播放截图或短视频，至少覆盖起始帧附近和 0.5 秒左右的 safe glow 状态。
- 如果执行了 `keepOriginal=false` 最小用例，记录源图隐藏但 safe glow 副本仍显示的截图或说明。
- 如果执行了旧 `glow` fail-fast 验证，记录错误文本。

报告规则：

- 真实 Cocos 验收已执行时，任务报告必须写明项目路径、Cocos 版本、验收步骤摘要和证据位置。
- 真实 Cocos 验收未执行时，任务报告只能写“monorepo 自动化验收通过，真实 Cocos Creator 3.8.6 standalone 验收待换机执行”，并附上本节可复制步骤；不能写“真实 Cocos 验收通过”。

### 7.12 协作规则同步判断

执行：

```bash
cmp -s AGENTS.md agents.md
```

如果本任务只是同步 `safe_glow` 到 runtime、standalone、checker、tests、README 和 zip，通常不需要更新 `AGENTS.md` / `agents.md`，因为现有规则已经覆盖。

如果实现中发现需要新增长期规则，例如某个新的 Cocos runtime public 行为还有额外交付面，必须同步更新两份文件，并再次执行：

```bash
cmp -s AGENTS.md agents.md
```

任务报告必须写明：

- 是否更新 `AGENTS.md` / `agents.md`。
- 如果未更新，原因是什么。
- `cmp -s AGENTS.md agents.md` 是否通过。

## 8. 验收命令

在仓库根目录执行：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

standalone zip 验收：

```bash
cd packages/anieditorv5runtime-cc
zipinfo -1 standalone.zip
cd ../..
```

边界检查：

```bash
rg -n "^\\s*import.*from ['\\\"]cc['\\\"]" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
rg -n "from ['\\\"]@slotclientengine/vnicore|from ['\\\"]\\.\\.?/|pixi\\.js|resources\\.load|JsonAsset|window|document" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
rg -n "safe_glow" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/tests packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts packages/anieditorv5runtime-cc/scripts/check-standalone.mjs packages/anieditorv5runtime-cc/README.md
cmp -s AGENTS.md agents.md
git diff --check
git status --short --untracked-files=all
```

`rg "^\\s*import.*from ['\\\"]cc['\\\"]"` 的合理命中范围：

- `src/cocos/cocos-node-driver.ts` 真实 runtime import。
- `src/cocos/index.ts` / `src/cocos/types.ts` type-only import。
- `standalone/anieditorv5runtime-cc.ts` standalone 允许 import `"cc"`。

根入口仍不应 re-export 真实 Cocos factory/driver 到 browser-hostile surface。若执行时需要核对：

```bash
rg -n "createV5GCocosPlayer|createCocosNodeDriver|cocos-node-driver" packages/anieditorv5runtime-cc/src/index.ts
```

预期无输出，除非本任务明确改变 package root export 策略，并在报告中解释。

## 9. 验收标准

功能验收：

- `safe_glow` 已加入模块化源码和 standalone 单文件。
- `lock_01` fixture 可被 `assertV5GProject(...)`、`validateV5GProject(...)`、`validateCocosV5GProject(...)` 接受。
- `V5GCocosPlayer` 能用 fake Cocos driver 初始化 `lock_01`。
- `safe_glow` 起始帧可渲染。
- `keepOriginal=false` 时源图隐藏，safe glow 副本仍渲染。
- safe glow 副本使用同一 `SpriteFrame`、normal blend、正确 opacity/scale/rotation。
- safe glow 副本节点不会残留上一帧多余节点。
- 单 group project 没有合法 layer group slot。
- 旧 `shatter/glow` 仍 fail-fast unsupported，错误包含 project、layer、animation id 和 type。
- 现有 `3reel_multipay_02` slot 挂接、segmented playback、粒子 drain、atlas lookup 不回归。
- 真实 Cocos Creator 3.8.6 standalone 验收状态已处理：环境可用时已执行并记录证据；环境不可用时已在任务报告中写明未运行原因和可换机执行步骤。

交付面验收：

- 模块化源码、standalone 单文件、checker、standalone tests、README、standalone.zip 已同步。
- `standalone.zip` 已重建，内容仅包含两个 standalone 文件。
- `scripts/check-standalone.mjs` 能防止 standalone 漏掉 safe glow。
- 不新增 runtime 对 vnicore、Pixi、Node builtin、DOM、resources loader 的依赖。
- 未新增隐藏 fallback。

命令验收：

- 第 8 节命令全部通过，或报告中明确记录与本任务无关的既有失败。
- `git diff --check` 通过。
- `cmp -s AGENTS.md agents.md` 通过。

报告验收：

- 新增中文任务报告：

```text
tasks/47-anieditorv5runtime-cc-safe-glow-sync-[utctime].md
```

- 报告包含修改文件清单、实现摘要、测试命令和结果、standalone zip 内容、AGENTS/agents 同步判断、依赖/lockfile 状态、二次遗漏检查。

## 10. 任务报告模板

任务完成后按下面结构写报告：

```markdown
# 任务 47 执行报告：anieditorv5runtime-cc safe glow sync

报告时间：[utctime] UTC

## 实现摘要

- ...

## 修改文件清单

- ...

## safe_glow 同步说明

- 类型、校验、sampler、project sampler、Cocos player、standalone 的同步点。
- `keepOriginal=false` 的处理。
- 与旧 `shatter/glow` fail-fast 边界的区别。

## lock_01 fixture 验证

- schemaVersion、animation types、slot 数量、Cocos validation/init 结果。

## Standalone 结果

- `standalone/anieditorv5runtime-cc.ts` 同步内容。
- `scripts/check-standalone.mjs` 新增检查。
- `standalone.zip` 是否重建。
- `zipinfo -1 standalone.zip` 输出。

## 真实 Cocos Creator standalone 验收

- 是否在 Cocos Creator 3.8.6 中执行。
- 如果已执行：项目路径、版本号、验收步骤摘要、控制台结果、截图/视频证据。
- 如果未执行：未运行原因，以及给用户换机执行的文件清单、步骤、判定标准和需要回传的证据。

## AGENTS 同步

- 是否更新 `AGENTS.md` / `agents.md`。
- `cmp -s AGENTS.md agents.md` 结果。

## 依赖和 lockfile

- 是否新增依赖。
- 是否执行 `pnpm install`。
- `pnpm-lock.yaml` 是否变化。

## 命令验收

- `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck`：...
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc lint`：...
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc test`：...
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone`：...
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check`：...
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc build`：...
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check`：...
- `git diff --check`：...

## 二次遗漏检查

- [ ] safe_glow 类型、default easing、参数校验已同步。
- [ ] safe glow sampler 与 vnicore 公式一致。
- [ ] keepOriginal=false 隐藏源图但不隐藏副本。
- [ ] Cocos render tree 中 safe glow 位于 image 和 particles 之间。
- [ ] lock_01 fixture 未被删改绕过。
- [ ] 旧 shatter/glow 仍 fail-fast unsupported。
- [ ] standalone 单文件、checker、tests、zip 已同步。
- [ ] 真实 Cocos Creator standalone 验收已执行或已写明换机交接步骤。
- [ ] README 已更新。
- [ ] AGENTS/agents 同步判断已记录。
- [ ] 无隐藏 fallback。

## 遗留风险

- ...
```

## 11. 二次遗漏检查清单

提交前必须逐项检查：

- [ ] 是否只改 `packages/anieditorv5runtime-cc`、相关测试/README/standalone/任务报告，以及必要时 `AGENTS.md` / `agents.md`。
- [ ] 是否没有误改 `packages/vnicore` 或 `apps/anieditorv5viewer`。
- [ ] `safe_glow` 是否没有进入旧 render effect unsupported 判断。
- [ ] `safe_glow` 是否没有被当作 particle animation。
- [ ] `safe_glow` 是否没有被静默当作 idle。
- [ ] `safe_glow` 缺失参数是否会失败。
- [ ] `keepOriginal=false` 是否只隐藏源图，不隐藏 safe glow 副本。
- [ ] `renderImageDisplay` 和 layer `visible` 是否表达不同语义。
- [ ] Cocos safe glow node 是否使用 normal blend。
- [ ] Cocos safe glow node 是否使用同一 SpriteFrame 和 JSON 逻辑尺寸。
- [ ] Cocos safe glow node 是否正确处理 opacity、scale、rotation、anchor、position。
- [ ] 多余 safe glow nodes 是否清理，destroy/init 失败是否清理。
- [ ] `lock_01` 是否作为真实 fixture 覆盖 `VNI_0.017`。
- [ ] 单 group 无 slot 是否覆盖。
- [ ] 旧 `3reel_multipay_02` slot 挂接是否不回归。
- [ ] 旧 `3reel_multipay_01` enabled `glow` 是否仍 fail-fast。
- [ ] `standalone/anieditorv5runtime-cc.ts` 是否完整同步。
- [ ] `scripts/check-standalone.mjs` 是否能抓住 safe glow 漏同步。
- [ ] `standalone.zip` 是否重建且内容干净。
- [ ] README 是否说明 safe_glow 支持和旧 glow/shatter 边界。
- [ ] 真实 Cocos Creator 3.8.6 standalone 验收是否已执行；若未执行，报告是否包含未运行原因和换机执行步骤。
- [ ] 真实验收或换机步骤是否列出了 `lock_01.json` 和 7 张新增图片。
- [ ] 如果测试需要奇怪写法，是否优先修测试而不是扭曲生产逻辑。
- [ ] 是否没有新增不必要兜底。
- [ ] `cmp -s AGENTS.md agents.md` 是否通过。
- [ ] `git diff --check` 是否通过。
