# anieditorv5runtime-cc layer groups render effects 任务计划

## 1. 任务目标

更新 Cocos Creator 3.8.6 runtime：

```text
/Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
```

把任务 44 已在 `packages/vnicore` 落地的 VNI 能力同步到 Cocos runtime，尤其是 standalone 单文件交付版：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

本任务不是新增 Cocos Creator 工程，也不是修改 Pixi viewer。目标是在现有 Cocos runtime 中支持最新 VNI 导出合同和播放/挂接语义，让真实 Cocos 宿主可以把 slot reel、业务节点或调试节点插入到 VNI 动画的两个相邻 layer group 中间，用于遮挡和前后层级控制。

必须同步的任务 44 能力：

- VNI group schema：`project.layerGroups + layer.groupId`。
- render group 顺序：必须来自 `project.layers` 中连续的 group run，不能使用 `layerGroups.order` 重排画面。
- group slot 查询和相邻性校验：只允许挂接到两个相邻 render group 之间，未知、反向、非相邻 group id 必须显式失败。
- 外部 Cocos 节点挂接：宿主传入的 `Node` 能插入到相邻 group 中间，坐标应保持 Cocos runtime 的 stage center 坐标体系。
- 新增动画类型识别：`idle` 必须支持；`shatter` / `glow` 必须先判断 Cocos 侧能否可靠渲染。
- deterministic render effect：`shatter` / `glow` 如果能可靠支持，必须和 live particle 分开处理；如果不能可靠支持，Cocos runtime 必须显式报错，不能半支持。
- 旧导出兼容：只有整个 project 完全没有 `layerGroups` 且所有 layer 都没有 `groupId` 时，才规范化为单个 `group_default`。
- fail-fast 边界：不允许用 placeholder、跳过图层、猜测 group、自动重排、静默退回 normal 或隐藏 fallback 掩盖逻辑 bug。

重要决策：本任务不要求为了“同步 task44”强行在 Cocos 中实现 `shatter` / `glow`。如果没有把握在 Cocos Creator 3.8.6 真实渲染语义里正确实现 effect，尤其是 `shatter` 的裁剪碎片和 `glow` 的 blend 表现，就先在 `validateCocosV5GProject(...)` 或 `V5GCocosPlayer.init()` 阶段显式失败，错误必须指出不支持的 animation id、type 和 layer id。不要做看似能跑但画面语义不可靠的假 effect。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、standalone 交付、文档同步、协作规则同步判断和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/45-anieditorv5runtime-cc-layer-groups-render-effects-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/45-anieditorv5runtime-cc-layer-groups-render-effects-260624-123456.md
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

两者当前内容一致。若本任务新增长期协作规则，必须同步更新两个文件，并用下面命令确认一致：

```bash
cmp -s AGENTS.md agents.md
```

是否更新以及原因必须写入任务报告。

## 3. 需要先阅读的上下文

执行时必须重新阅读当前实现，以实际代码为准。至少阅读以下文件：

```text
tasks/44-vnicore-layer-group-slot-insertion.md
tasks/44-vnicore-layer-group-slot-insertion-260624-051351.md
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/layer-groups.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/render-effect-sampler.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/docs/api-zh.md
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/render-effect-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
packages/anieditorv5runtime-cc/tests/core/project-sampler.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/README.md
AGENTS.md
agents.md
```

建议用下面命令查看任务 44 对 `vnicore` 的实际提交范围：

```bash
git show --stat --name-only --format=fuller HEAD -- packages/vnicore packages/anieditorv5viewer docs/anieditor5 tasks/44-vnicore-layer-group-slot-insertion.md tasks/44-vnicore-layer-group-slot-insertion-260624-051351.md
git diff HEAD~1..HEAD -- packages/vnicore/src packages/vnicore/tests packages/vnicore/docs packages/vnicore/examples
```

注意：如果执行时 HEAD 已经不是任务 44 提交，改用 `git log --oneline -- packages/vnicore tasks/44-vnicore-layer-group-slot-insertion.md` 找到任务 44 对应提交，再用该提交范围核对。

## 4. 当前已知事实

### 4.1 任务 44 的 vnicore 结果

任务 44 已在 `packages/vnicore` 实现：

- `V5GLayerGroupConfig` / `VNILayerGroupConfig`
- `V5GProjectConfig.layerGroups`
- `V5GLayerConfig.groupId`
- `DEFAULT_VNI_LAYER_GROUP_ID`
- `normalizeVNIProjectLayerGroups(project)`
- `getVNIProjectRenderGroupOrder(project)`
- `getVNIProjectLayerGroupSlots(project)`
- `assertVNIAdjacentLayerGroupSlot(project, afterGroupId, beforeGroupId)`
- `idle` animation type
- `shatter` / `glow` animation type
- `sampleRenderEffectSpritesForLayer(...)`
- `SampledLayerState.hasActiveRenderEffect`
- `SampledLayerState.renderImageDisplay`
- `VNIPlayer.getLayerGroups()`
- `VNIPlayer.getLayerGroupSlots()`
- `VNIPlayer.attachNodeBetweenLayerGroups(...)`
- `VNIPlayer.attachImageBetweenLayerGroups(...)`
- `VNIPlayer.attachExternalImageBetweenLayerGroups(...)`
- `VNIPlayer.detachMountedNode(id)`
- `VNIPlayer.clearMountedNodes()`

任务 44 还新增了两个真实导出：

```text
docs/anieditor5/export/3reel_multipay_01.json
docs/anieditor5/export/3reel_multipay_02.json
apps/anieditorv5viewer/src/assets/projects/3reel_multipay_01.json
apps/anieditorv5viewer/src/assets/projects/3reel_multipay_02.json
packages/vnicore/tests/fixtures/export/3reel_multipay_01.json
packages/vnicore/tests/fixtures/export/3reel_multipay_02.json
```

这两个 JSON 的 `engineTarget.name` 都是 `cocos_creator`，`engineTarget.version` 是 `3.8.6`，可以直接作为 Cocos runtime fixture 使用。

`3reel_multipay_01.json` 的关键事实：

```text
schemaVersion: VNI_0.016
editor.name: VNI
engineTarget.name: cocos_creator
engineTarget.version: 3.8.6
layerGroups:
  group_default / 上层光效 / order 0
  layer_group_mqqo064b_4 / 下层光效 / order 1
project.layers render group order:
  layer_group_mqqo064b_4 -> group_default
合法 slot:
  afterGroupId: layer_group_mqqo064b_4
  beforeGroupId: group_default
包含动画:
  glow, fade, particle_wall, particle_combo, scale_up
```

`3reel_multipay_02.json` 的关键事实：

```text
schemaVersion: VNI_0.016
editor.name: VNI
engineTarget.name: cocos_creator
engineTarget.version: 3.8.6
layerGroups:
  group_default / 上层光效 / order 0
  layer_group_mqqo4zrn_6 / 下层光效 / order 1
project.layers render group order:
  layer_group_mqqo4zrn_6 -> group_default
合法 slot:
  afterGroupId: layer_group_mqqo4zrn_6
  beforeGroupId: group_default
包含动画:
  blink, fade, particle_wall, particle_combo, scale_up
```

重点：不要把 `layerGroups.order` 当作渲染顺序。渲染顺序只来自 `project.layers`。

### 4.2 anieditorv5runtime-cc 当前缺口

当前 `packages/anieditorv5runtime-cc` 已有：

- `V5G_0.x` / `VNI_0.x` schema 接收。
- Cocos Creator `3.8.6` 校验。
- `image` layer、中心坐标、负 scale、opacity、visible、rotation、anchor。
- `normal/add/screen/multiply/lighten` blend mode 写入 Cocos Sprite / material pass。
- `particles`、`particle_twinkle`、`particle_wall`、`particle_combo`。
- `playRange(...)`、open-ended range、segmented playback、marker、completion listener。
- live particle runtime 和粒子排空。
- `SpriteAtlas` 绑定，atlas key 为 `filenameStem(asset.path)`。
- standalone 边界检查和 standalone parity tests。

当前仍缺少或需要重构：

- `src/core/types.ts` 还没有 `layerGroups`、`groupId`、`idle`、`shatter`、`glow`。
- `src/core/validation.ts` 还没有 group schema 规范化和连续 group run 校验。
- `src/core/animation-sampler.ts` 还没有 `idle` 支持；`shatter` / `glow` 需要先决定是路线 A 支持还是路线 B 拒绝。
- 路线 A 才需要补 `src/core/project-sampler.ts` 的 `hasActiveRenderEffect`、`renderImageDisplay` 与 render effect 保活语义。
- 路线 A 才需要新增 `src/core/render-effect-sampler.ts`。
- `src/cocos/player.ts` 当前仍把 layer 和 particle container 线性加入 `V5G Content`，没有 group container、slot container 和 mounted node 管理；路线 A 还需要 render effect container。
- `src/cocos/node-driver.ts` 目前没有移除未销毁外部节点所需的 driver API；路线 A 还需要创建 clipped/masked effect 节点所需的 driver API。
- `standalone/anieditorv5runtime-cc.ts` 必须同步所有 core、cocos、driver、public API 和检查脚本 required exports。

当前模块化导入边界必须保留：

- `src/cocos/cocos-node-driver.ts` 可以 runtime import `"cc"`。
- `src/cocos/types.ts` 可以 type-only import `Node` / `SpriteFrame`。
- `src/core/*`、`src/cocos/player.ts`、`src/cocos/node-driver.ts`、`src/index.ts` 不应 runtime import `"cc"`。
- `src/cocos/index.ts` 是真实 Cocos 子入口，可以导出 `createV5GCocosPlayer(...)` 并通过 `createCocosNodeDriver()` 依赖真实 Cocos driver；但 package 根入口不要新增依赖真实 `"cc"` 的 factory 或 driver re-export。
- package 根入口可以导出 fake-friendly types、core helper、driver interface、blend/coordinate helper 和 `V5GCocosPlayer` class，但不能让普通根入口 import 触发真实 Cocos runtime 依赖。
- standalone 单文件可以 import `"cc"`，但不能 import 仓库源码、package 路径或相对 runtime 文件。

## 5. 行为契约

### 5.1 schema 和 group 合同

必须新增类型：

```ts
export interface V5GLayerGroupConfig {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
}

export interface V5GLayerConfig {
  groupId?: string;
}

export interface V5GProjectConfig {
  layerGroups: V5GLayerGroupConfig[];
}
```

`V5GAnimationType` 必须新增：

```ts
"idle" | "shatter" | "glow"
```

必须新增或同步 layer group helper：

```ts
export const DEFAULT_VNI_LAYER_GROUP_ID = "group_default";

export interface VNIRenderGroupInfo {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
  layerIds: readonly string[];
  renderIndex: number;
}

export interface VNILayerGroupSlot {
  afterGroupId: string;
  afterGroupName: string;
  beforeGroupId: string;
  beforeGroupName: string;
  renderIndex: number;
}

export function normalizeVNIProjectLayerGroups(project): V5GProjectConfig;
export function getVNIProjectRenderGroupOrder(project): readonly VNIRenderGroupInfo[];
export function getVNIProjectLayerGroupSlots(project): readonly VNILayerGroupSlot[];
export function assertVNIAdjacentLayerGroupSlot(project, afterGroupId, beforeGroupId): VNILayerGroupSlot;
```

允许同时导出 `V5G*` alias，但不能只做 Cocos 私有实现；这些 helper 必须从模块化 `./core` 和 standalone 单文件导出，方便宿主和测试直接验证。

规范化规则：

- 如果 `project.layerGroups` 不存在，且所有 layer 都没有 `groupId`，规范化为单个 `group_default`，并给每个 layer 补 `groupId: "group_default"`。
- 如果任何 layer 有 `groupId`，但 `project.layerGroups` 不存在，显式失败。
- 如果 `project.layerGroups` 存在，每个 layer 都必须有合法 `groupId`。
- `project.layerGroups` 不能为空。
- group id 不能重复。
- group order 不能重复。
- layer 引用不存在的 group 必须失败。
- group 在 `project.layers` 中必须连续；同一个 group 不能被其它 group 打断后再次出现。
- `layerGroups.visible`、`collapsed`、`order` 是导出元数据；runtime 渲染顺序和是否创建 layer 节点必须以 `project.layers` 为准，不要因为 `order` 或 `collapsed` 重排/跳过画面。
- 继续拒绝 `type: "group"` layer、非空 `keyframes`、`parentId` 嵌套和顶层 `project.particles`。

### 5.2 animation 和 render effect 合同

`idle`：

- 是 coverage-only no-op。
- 不改变 transform 或 opacity。
- 用于让时间段被认为有 active coverage，不能导致该段图层隐藏。

`shatter` / `glow` 的 Cocos 支持必须走显式决策，不能默认认为可用。

合格路线只有两条：

- 路线 A：确认可以在 Cocos Creator 3.8.6 中可靠渲染，并用模块化 fake driver、standalone fake `cc`、文档和任务报告说明实现方式。此时按下面的 render effect 合同完整实现。
- 路线 B：暂不支持 Cocos render effect。此时仍可在类型/结构断言中识别 `shatter` / `glow`，但 `validateCocosV5GProject(...)` 或 `V5GCocosPlayer.init()` 必须显式失败，不能进入播放；错误要包含 layer id、animation id、animation type 和“Cocos runtime does not support VNI render effect animations yet”这类可定位信息。

路线 B 是可接受完成状态，前提是 group slot、外部节点挂接、旧导出兼容、`3reel_multipay_02` 播放能力、standalone 同步和报告全部完成。路线 B 下，`3reel_multipay_01.json` 因含 `glow` 可以作为 fail-fast fixture；`3reel_multipay_02.json` 不含 `shatter/glow`，应继续用于验证 group slot 和播放。

如果选择路线 A，`shatter` 合同如下：

- 是 deterministic render effect，不是 live particle。
- required numeric params：

```text
count
pieceSize
force
impactAngle
spreadAngle
gravity
spin
sourceOpacity
```

- optional boolean params：

```text
fadeOut
```

- source image opacity 必须按 `base.opacity * sourceOpacity` 采样。
- render effect 在 `progress <= 0` 时不渲染，避免首帧漏图。

如果选择路线 A，`glow` 合同如下：

- 是 deterministic render effect，不是 live particle。
- required numeric params：

```text
intensity
spread
minAlpha
maxAlpha
pulses
blendMode
```

- optional boolean params：

```text
keepOriginal
```

- `blendMode` 数值映射为：

```text
0 -> add
1 -> screen
2 -> lighten
```

- `keepOriginal === false` 时，source image 可隐藏，但 glow effect 必须继续渲染。
- render effect 在 `progress <= 0` 时不渲染，避免首帧漏图。

路线 A 必须新增 `src/core/render-effect-sampler.ts`，并从 `src/core/index.ts` 和 standalone 导出：

```ts
export type VNIRenderEffectType = "shatter" | "glow";
export interface VNIRenderEffectLayerSampleState { ... }
export interface VNIRenderEffectTextureSize { ... }
export interface VNIShatterPieceSample { ... }
export interface VNIGlowSpriteSample { ... }
export type VNIRenderEffectSpriteSample = VNIShatterPieceSample | VNIGlowSpriteSample;
export function isRenderEffectAnimationType(value: string): value is VNIRenderEffectType;
export function getRenderEffectProgress(animation, time): number | null;
export function hasActiveRenderEffectAnimation(layer, time): boolean;
export function sampleRenderEffectSpritesForLayer(layer, sampledLayer, textureSize, time): VNIRenderEffectSpriteSample[];
```

路线 A 的 `SampledLayerState` 必须新增：

```ts
baseOpacity: number;
renderImageDisplay: boolean;
hasActiveRenderEffect: boolean;
blendMode: V5GBlendMode;
```

`visible` 与 `renderImageDisplay` 必须区分：

- `visible` 表示 layer 在该帧仍有视觉贡献，source image 或 render effect 任一存在即可为 true。
- `renderImageDisplay` 只控制原 source image 节点显示。
- `glow keepOriginal=false` 或 `shatter sourceOpacity=0` 不允许让 render effect 被错误清掉。

路线 B 不需要新增 render effect sampler，也不需要修改 project sampler 的 render effect 可见性语义；但必须新增明确的 Cocos 不支持测试，证明含 `shatter` / `glow` 的 project 不会被播放或半渲染。

### 5.3 Cocos render tree 合同

`V5GCocosPlayer.init()` 必须改为 group-aware tree。推荐结构：

```text
V5G Stage
  V5G Content
    V5G Group <lower group id>
      <layer image node>
      <layer effects node，仅路线 A 支持 render effects 时存在>
      <layer particles node>
    V5G Slot <lower group id> -> <upper group id>
      <mounted external nodes>
    V5G Group <upper group id>
      <layer image node>
      <layer effects node，仅路线 A 支持 render effects 时存在>
      <layer particles node>
  V5G Particles
```

要求：

- `V5G Content` 仍是 runtime 主内容根。
- `V5G Particles` 可继续保留为空占位，兼容现有文档和测试。
- 每个 group container、slot container、particle container，以及路线 A 中的 effect container，都应设置 stage content size 和 `0.5, 0.5` anchor，保持 Cocos center 坐标。
- group container 加入 `V5G Content` 的顺序必须来自 `getVNIProjectRenderGroupOrder(project)`。
- slot container 必须插在相邻 group container 之间。
- 每个 layer 的顺序必须保持 `project.layers` 在该 group run 内的顺序。
- layer 内部顺序建议为 source image、effect container、particle container，对齐 vnicore 的 display、effectDisplay、particleDisplay；路线 B 可以省略 effect container，但必须在遇到 effect animation 时先失败，不能让含 effect 的 project 进入该树。
- 不允许为了让测试通过而继续把所有 layer 线性挂在 content 下。
- `destroy()` 必须销毁 runtime 创建的 group、slot、effect、particle 节点，并清理 mounted node registry。

### 5.4 外部节点挂接 API 合同

必须在模块化和 standalone 中提供 Cocos 版 group slot public API。

建议新增类型：

```ts
export interface V5GCocosLayerGroupInfo {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  layerIds: readonly string[];
  renderIndex: number;
}

export type V5GCocosLayerGroupSlot = VNILayerGroupSlot;

export interface V5GCocosAttachNodeBetweenLayerGroupsOptions<TNode = Node> {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  node: TNode;
  destroyOnDetach?: boolean;
}
```

`V5GCocosPlayer` 必须新增：

```ts
getLayerGroups(): readonly V5GCocosLayerGroupInfo[];
getLayerGroupSlots(): readonly V5GCocosLayerGroupSlot[];
attachNodeBetweenLayerGroups(options): () => void;
detachMountedNode(id: string): void;
clearMountedNodes(): void;
```

行为要求：

- `attachNodeBetweenLayerGroups(...)` 必须要求 player 已 `init()`。
- `id` trim 后不能为空。
- 重复 `id` 必须失败。
- `afterGroupId` / `beforeGroupId` 必须经过 `assertVNIAdjacentLayerGroupSlot(...)` 校验。
- 未知 group、反向 group、非相邻 group 必须显式失败。
- external node 默认不销毁，只从 slot container 移除；`destroyOnDetach === true` 时才销毁。
- 返回的 dispose 函数必须幂等。
- `detachMountedNode(id)` 对未知 id 必须失败。
- `clearMountedNodes()` 必须清理所有 mounted nodes。
- `destroy()` 必须调用 `clearMountedNodes()`，避免宿主 Component 销毁后残留业务节点引用。
- 外部节点的坐标系是 Cocos stage center 坐标，和 runtime layer 节点一致；不要套用 Pixi 的 `editorToPixi(...)` 左上角转换。
- 挂接 API 只负责插入到正确层级，不替宿主重置外部节点 transform。若提供 project asset / spriteFrame helper，则 helper 自己创建的节点才应用传入的 `x/y/scale/rotation/anchor/opacity/blendMode`。

为了覆盖 vnicore 的 image mount 能力，Cocos runtime 不应新增 URL loader，也不应调用 `resources.load()`。推荐提供 Cocos-native 等价接口：

```ts
export interface V5GCocosAttachProjectAssetBetweenLayerGroupsOptions {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  assetId: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: V5GBlendMode;
  destroyOnDetach?: boolean;
}

export interface V5GCocosAttachSpriteFrameBetweenLayerGroupsOptions<TSpriteFrame = SpriteFrame> {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  spriteFrame: TSpriteFrame;
  width: number;
  height: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: V5GBlendMode;
  destroyOnDetach?: boolean;
}
```

并提供：

```ts
attachProjectAssetBetweenLayerGroups(options): () => void;
attachSpriteFrameBetweenLayerGroups(options): () => void;
```

说明：

- `attachProjectAssetBetweenLayerGroups(...)` 使用当前 project 的 asset resolver/atlas 结果创建 image node，必须复用 runtime 既有资源解析和 size/metadata 校验规则。
- `attachSpriteFrameBetweenLayerGroups(...)` 由宿主传入已准备好的 `SpriteFrame` 和逻辑宽高，适合插入非当前 project asset 的调试图或业务图。
- 两者创建的 runtime-owned image node 默认 `destroyOnDetach: true`。
- 如果实现阶段认为只需要 `attachNodeBetweenLayerGroups(...)` 即可覆盖业务场景，必须在任务报告解释为什么不提供 project asset / spriteFrame helper；但不能缺少 node 挂接 API。

### 5.5 Cocos render effect 决策合同

执行阶段必须先做 effect 支持判断，结论写入任务报告。

路线 B：暂不支持 effect 时，要求如下：

- `V5GAnimationType` 可以包含 `shatter` / `glow`，`assertV5GProject(...)` 可以解析含 effect 的新 JSON。
- `validateV5GProject(...)` 必须按通用 VNI schema 校验 effect 参数，方便诊断导出合同；不要用“Cocos 不支持 effect”掩盖 malformed animation params。
- `validateCocosV5GProject(...)` 必须拒绝任何 enabled `shatter` / `glow` animation。
- `V5GCocosPlayer.init()` 调用 `validateCocosV5GProject(...)` 后必须在创建节点前失败，不能留下半初始化节点。
- 错误信息必须包含 project name、layer id、animation id、animation type，并明确 Cocos runtime 暂不支持 VNI render effect animations。
- `3reel_multipay_01.json` 因含 `glow` 应在 Cocos validation 或 player init 阶段失败。
- `3reel_multipay_02.json` 不含 `shatter/glow`，必须继续通过 validation、group slot 和播放测试。
- 路线 B 下，`assertV5GProject(...)`、`normalizeVNIProjectLayerGroups(...)`、`getVNIProjectRenderGroupOrder(...)`、`getVNIProjectLayerGroupSlots(...)` 仍应能用于 `3reel_multipay_01.json` 的 schema/group 诊断；失败点只应发生在 Cocos 支持校验或 player init，不应阻断纯结构解析。
- README 必须写明当前 Cocos runtime 对 `shatter/glow` 的状态是 fail-fast unsupported，而不是渲染支持。

路线 A：确认支持 effect 时，`V5GCocosPlayer` 必须在每次 deterministic frame 和 playback frame 中：

1. 调用 `sampleProjectAtTime(...)` 更新 source image。
2. 清理上一帧 runtime 创建的 render effect nodes。
3. 对 `hasActiveRenderEffect` 的 image layer 调用 `sampleRenderEffectSpritesForLayer(...)`。
4. 将 effect nodes 添加到该 layer 的 effect container。
5. 再处理 live particle samples，不让 render effect 进入 particle drain runtime。

路线 A 的 `glow` 渲染要求：

- 用同一层的 `SpriteFrame` 创建 full image node。
- 使用 sampled transform 的 anchor 和 stage center 坐标。
- 使用 sample 中的 scale、rotation、alpha、blendMode。
- blend 行为必须有测试或真实 Cocos 验证依据；没有依据时转路线 B。

路线 A 的 `shatter` 渲染要求：

- 必须表现为裁剪碎片，而不是完整大图重复飞散。
- 推荐 driver 新增 clipped image 节点能力，例如：

```ts
createClippedImageNode(name, spriteFrame, clip): TNode;
```

其中 clip 至少包含：

```ts
{
  width: number;
  height: number;
  spriteOffsetX: number;
  spriteOffsetY: number;
  anchorX: number;
  anchorY: number;
}
```

- 真实 Cocos driver 可用 `Mask` 矩形裁剪父节点 + 子 Sprite 偏移实现；需要同步 `types/cc-3.8.6-shim.d.ts`、`tests/fakes/cc.ts` 和 standalone `"cc"` import。
- 如果 Cocos 3.8.6 的真实 API 与 fake 不一致，必须修正 driver 和 shim；不要把生产语义降级成测试可通过的假实现。
- shatter 节点必须使用 sample 的 position、scale、rotation、alpha、blendMode。
- 清理 effect nodes 时必须销毁 runtime 创建的 mask/sprite 子节点。

### 5.6 standalone 合同

standalone 是本任务主要交付面。模块化源码通过不代表完成。

必须同步更新：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/standalone.zip
```

standalone runtime 仍然必须满足：

- 只能 import Cocos Creator 内置 `"cc"`。
- 不能 import 仓库源码、Node、DOM、Pixi、package 路径或相对 runtime 文件。
- 不能绑定 `JsonAsset`。
- 不能调用 `resources.load()`。
- 不能包含 decorated Component。
- 不能出现 internal `.js` suffix imports。
- 需要保持 ES2015 兼容，特别是不能出现 `.includes(...)`。
- 新增 public API 必须加入 `scripts/check-standalone.mjs` 的 required exports。

`scripts/check-standalone.mjs` 至少要补齐以下新增导出检查：

- `export const DEFAULT_VNI_LAYER_GROUP_ID`
- `export interface VNIRenderGroupInfo`
- `export interface VNILayerGroupSlot`
- `export function normalizeVNIProjectLayerGroups`
- `export function getVNIProjectRenderGroupOrder`
- `export function getVNIProjectLayerGroupSlots`
- `export function assertVNIAdjacentLayerGroupSlot`
- `export interface V5GCocosLayerGroupInfo`
- `export type V5GCocosLayerGroupSlot`
- `export interface V5GCocosAttachNodeBetweenLayerGroupsOptions`
- 若实现 project asset / spriteFrame helper，也要检查对应 options type 和 player method 名称。
- 路线 A 才检查 render effect sampler 相关导出；路线 B 不应为了 checker 硬导出未实现的 sampler。

若新增 `Mask` 或其它 Cocos 类型，只能从 `"cc"` 导入，并在 fake `cc` 与 shim 中补齐测试所需最小行为。

重建 standalone zip：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
```

`standalone.zip` 被 `.gitignore` 忽略，仍然必须在任务报告中记录它是否已重建，以及 `zipinfo -1` 输出摘要。预期只包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

## 6. 实施步骤

### 阶段 1：现状确认和 fixture 准备

1. 执行：

```bash
git status --short
git diff --stat
node -v
pnpm -v
```

2. 阅读第 3 节列出的上下文文件。
3. 复制或引入 Cocos runtime fixture：

```text
packages/anieditorv5runtime-cc/tests/fixtures/3reel_multipay_01.json
packages/anieditorv5runtime-cc/tests/fixtures/3reel_multipay_02.json
```

来源优先使用：

```text
docs/anieditor5/export/3reel_multipay_01.json
docs/anieditor5/export/3reel_multipay_02.json
```

4. 写一个摘要测试或脚本核对 fixture 的 schema、engineTarget、group、render order、合法 slot 和 animation type，避免后续误用旧 fixture。

### 阶段 2：同步 core 类型、group helper 和 validation

1. 更新：

```text
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/index.ts
```

2. 新增：

```text
packages/anieditorv5runtime-cc/src/core/layer-groups.ts
packages/anieditorv5runtime-cc/tests/core/layer-groups.test.ts
```

3. 从 `packages/vnicore` 同步 group helper 逻辑，但要保留 Cocos runtime 的现有命名和校验边界。
4. 更新 validation 测试，覆盖：
   - 旧无 group 导出规范化为 `group_default`。
   - 有 `groupId` 但缺 `layerGroups` 失败。
   - 空 `layerGroups` 失败。
   - 重复 group id 失败。
   - 重复 group order 失败。
   - layer 缺 `groupId` 失败。
   - layer 引用未知 group 失败。
   - 非连续 group run 失败。
   - `type: "group"` layer 继续失败。
   - `parentId` 继续失败。
   - 非空 keyframes 继续失败。
   - 顶层 `project.particles` 继续失败。

### 阶段 3：同步 animation、project sampler 和 render effect sampler

1. 更新：

```text
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/index.ts
```

2. 路线 A 才新增：

```text
packages/anieditorv5runtime-cc/src/core/render-effect-sampler.ts
packages/anieditorv5runtime-cc/tests/core/render-effect-sampler.test.ts
```

3. 必须同步 `idle` 行为，并让 `shatter` / `glow` 进入类型识别和 Cocos 支持决策。
4. 路线 B 时，在 `validateCocosV5GProject(...)` 中显式拒绝 enabled `shatter` / `glow`，并新增测试证明 `3reel_multipay_01.json` fail-fast。
5. 路线 A 时，同步 vnicore 的 `shatter` / `glow` sampler 行为。
6. 测试覆盖：
   - `idle` 不改变 transform/opacity，并维持 active coverage。
   - `shatter` required params 和 `fadeOut` boolean 校验。
   - `glow` required params 和 `keepOriginal` boolean 校验。
   - disabled `shatter` / `glow` 是否允许，必须按最终合同明确测试；如果路线 B 选择“一律拒绝 effect type”，也要把原因写进 README 和报告。
   - 路线 B：enabled `shatter` / `glow` 在 Cocos validation 或 player init 前置失败，且不创建半初始化节点。
   - 路线 B：`3reel_multipay_01.json` 的纯 group helper 仍可返回合法 slot，但 Cocos validation/player init 会失败。
   - 路线 A：`sampleRenderEffectSpritesForLayer(...)` 在 `progress <= 0` 不产生 sample。
   - 路线 A：`glow keepOriginal=false` 隐藏 source image 但 `hasActiveRenderEffect` 为 true。
   - 路线 A：`shatter sourceOpacity=0` 隐藏 source image 但仍可产生 shatter sample。
   - 路线 A：render effect 与 `particle_combo` / live particle 互不污染。

### 阶段 4：重构 Cocos player render tree 和 mounted node API

1. 更新：

```text
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
```

2. `V5GCocosPlayer` 内部需要新增 registry：
   - `layerGroups`
   - `layerGroupSlots`
   - `groupNodesById`
   - `slotNodesByKey`
   - `mountedNodesById`
   - 路线 A 的 per-layer `effectContainer`
3. 初始化时按第 5.3 节生成 group-aware tree。
4. 新增 public API：
   - `getLayerGroups()`
   - `getLayerGroupSlots()`
   - `attachNodeBetweenLayerGroups(...)`
   - `detachMountedNode(id)`
   - `clearMountedNodes()`
5. 推荐新增 image helper：
   - `attachProjectAssetBetweenLayerGroups(...)`
   - `attachSpriteFrameBetweenLayerGroups(...)`
6. 更新 fake driver，使测试能检查：
   - group/slot child order。
   - external node parent 位置。
   - external node 保留宿主已有 transform，不被 attach API 重置。
   - detach 不 destroy 外部节点。
   - `destroyOnDetach` 会 destroy runtime-owned node。
   - duplicate id / unknown id / invalid slot 显式失败。

### 阶段 5：effect 支持决策和实现/拒绝

1. 先判断 Cocos 3.8.6 当前 runtime 是否能可靠实现 `glow` 和 `shatter`。
2. 如果没有可靠依据，选择路线 B：
   - 不新增 effect render tree。
   - `validateCocosV5GProject(...)` 或 `V5GCocosPlayer.init()` 显式拒绝 enabled `shatter` / `glow`。
   - `3reel_multipay_01.json` 作为 fail-fast 测试。
   - `3reel_multipay_02.json` 继续作为 group slot 和播放测试。
   - README 和任务报告写明 Cocos runtime 暂不支持 render effect。
3. 如果确认可支持，选择路线 A：
   - 给每个 image layer 增加 effect container。
   - 在 `renderDeterministicFrame(...)`、`renderPlaybackFrame(...)` 和粒子排空相关路径中正确清理/刷新 render effect。
   - 用 `sampleRenderEffectSpritesForLayer(...)` 渲染 `glow` 和 `shatter`。
4. 路线 A 需要扩展 driver：
   - 支持创建 clipped/masked image node，或支持创建 mask container + child image node。
   - 支持 remove child without destroy，用于外部 node detach。
5. 路线 A 中真实 Cocos driver 可 import `Mask`；同步更新：

```text
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
```

6. 路线 B 测试覆盖：
   - enabled `glow` 项目在 Cocos validation 或 player init 阶段失败。
   - enabled `shatter` 项目在 Cocos validation 或 player init 阶段失败。
   - fail-fast 后 root 不残留 stage/content/group 节点。
   - `3reel_multipay_02.json` 不受影响，仍可 init、查询 slot、挂接外部节点和播放。
   - `3reel_multipay_01.json` 可用于 `assertV5GProject(...)` 和 group slot helper 测试，但不能进入 Cocos player init。
7. 路线 A 测试覆盖：
   - `glow` 创建 effect nodes，source hidden 时 effect 不丢。
   - `shatter` 创建 clipped effect nodes，clip 尺寸和 offset 来自 sample。
   - seek 到 0 秒不会有 start-frame effect leakage。
   - seek 到中段有 render effect nodes。
   - seek 到 effect 结束后清空旧 effect nodes。
   - render effect nodes 使用正确 blend mode。
   - render effect 不增加 `liveParticleCount`。

### 阶段 6：同步 standalone 单文件和示例

1. 把阶段 2 到 5 的所有 core/cocos/driver/API 同步到：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

2. 更新：

```text
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

3. 示例中可展示：
   - `player.getLayerGroupSlots()`
   - 按合法 slot 插入外部 `Node`
   - 在 `onDestroy()` 中 dispose 或 `player.destroy()`
4. 示例不能引入 `resources.load()`、`JsonAsset` 绑定或 decorated runtime 入口之外的隐藏 loader。
5. 更新 standalone tests，确保 standalone 与模块化版本在下面行为上等价：
   - validation
   - project sampling
   - layer group helpers
   - 路线 B 的 effect fail-fast，或路线 A 的 render effect sampler
   - group-aware player tree
   - mounted node API
   - playback state 与 live particle 语义
   - 模块化导入边界：除 `src/cocos/cocos-node-driver.ts` 和 type-only `src/cocos/types.ts` 外，不新增 runtime `"cc"` import；root entry 不新增真实 Cocos factory。

### 阶段 7：文档和协作规则同步

必须更新：

```text
packages/anieditorv5runtime-cc/README.md
```

README 至少说明：

- Cocos runtime 已支持 `project.layerGroups + layer.groupId`。
- render order 来自 `project.layers`，不是 `layerGroups.order`。
- 如何调用 `getLayerGroupSlots()` 找到合法 slot。
- 如何通过 `attachNodeBetweenLayerGroups(...)` 插入 slot reel 或宿主节点。
- 外部 node 坐标是 Cocos stage center 坐标。
- `idle` 的支持范围。
- `shatter/glow` 的 Cocos 支持决策：如果路线 B，写明当前 fail-fast unsupported；如果路线 A，写明 deterministic render effect 语义和限制。
- standalone 仍是推荐交付方式。
- runtime 仍不读取 JSON、不加载 resources、不猜测资源路径、不创建 placeholder。

协作规则判断：

- 如果实现只是同步 package 内 API、README、standalone 和测试，可以不更新 `AGENTS.md` / `agents.md`，但报告必须说明原因。
- 如果实现新增长期规则，例如“更新 `packages/anieditorv5runtime-cc` 时必须同时更新 modular source、standalone single-file、standalone checker 和 standalone zip”，建议同步更新 `AGENTS.md` / `agents.md`。
- 如果更新其中一个文件，必须更新另一个并执行：

```bash
cmp -s AGENTS.md agents.md
```

## 7. 验收命令

基础环境和工作区：

```bash
git status --short
git diff --stat
node -v
pnpm -v
```

package 验收：

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
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
cd /Users/zerro/github.com/slotclientengine
```

最终空白和格式检查：

```bash
git diff --check
```

模块化 Cocos 导入边界检查：

```bash
rg -n "from ['\"]cc['\"]" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
rg -n 'createV5GCocosPlayer|createCocosNodeDriver|cocos-node-driver' packages/anieditorv5runtime-cc/src/index.ts
```

预期：

- 第一条命令只应出现 `src/cocos/cocos-node-driver.ts` 的 runtime import、`src/cocos/types.ts` / `src/cocos/index.ts` 的 type-only import，以及 standalone 单文件的 `"cc"` import。
- 第二条命令不应有输出；如果 package 根入口必须新增真实 Cocos factory，必须先更新本计划和 `AGENTS.md` / `agents.md` 的长期边界说明。

如果更新了 `AGENTS.md` / `agents.md`：

```bash
cmp -s AGENTS.md agents.md
```

如果任一命令失败：

- 先判断是代码缺陷、测试过期还是环境问题。
- 如果是测试导致奇怪写法，修改测试，不要改不该改的 production 逻辑。
- 不要通过隐藏 fallback、跳过断言、降低校验或吞掉错误来让测试变绿。
- 依赖下载失败时才使用第 2 节代理环境变量。

## 8. 必须新增或更新的测试

至少覆盖以下测试面：

```text
packages/anieditorv5runtime-cc/tests/core/layer-groups.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
packages/anieditorv5runtime-cc/tests/core/animation-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/project-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/render-effect-sampler.test.ts  # 仅路线 A 需要
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
```

测试必须证明：

- `3reel_multipay_01.json` 的合法 slot 是 `layer_group_mqqo064b_4 -> group_default`。
- `3reel_multipay_02.json` 的合法 slot 是 `layer_group_mqqo4zrn_6 -> group_default`。
- `layerGroups.order` 不改变 render order。
- `layerGroups.collapsed` 不改变 render order；`layerGroups.visible` 不在 runtime 中额外重排或猜测过滤 layer。
- 旧无 group 导出仍能播放，并规范化为单个 `group_default`。
- 半新半旧导出显式失败。
- 非连续 group run 显式失败。
- unknown/reversed/non-adjacent group slot 显式失败。
- Cocos tree 中 slot container 位于两个 group container 中间。
- external node 挂接后 parent 是 slot container。
- external node 挂接后原 transform 保持不变。
- detach 后 external node 不被销毁。
- `destroyOnDetach` 为 true 时 runtime-owned node 被销毁。
- `destroy()` 清空 mounted nodes。
- `idle` 不改变 transform/opacity。
- 路线 B：`3reel_multipay_01.json` 因 `glow` 在 Cocos validation 或 player init 阶段显式失败，且 root 不残留半初始化节点。
- 路线 B：`3reel_multipay_01.json` 的 `assertV5GProject(...)` 和 group slot helper 不失败。
- 路线 B：enabled `shatter` fixture 在 Cocos validation 或 player init 阶段显式失败。
- 路线 B：`3reel_multipay_02.json` 不含 effect，仍可 init、查询 slot、挂接外部节点和播放。
- 路线 A：`glow keepOriginal=false` 时 source image 隐藏但 effect nodes 存在。
- 路线 A：`shatter sourceOpacity=0` 时 source image 隐藏但 shatter pieces 存在。
- 路线 A：render effect 不增加 live particle count。
- standalone 和 modular 的 validation、sampler、player 行为一致。
- standalone checker 能捕获遗漏的 public exports 和 forbidden imports。

不要因为旧测试假设“content.children 直接等于 layer/particle 线性列表”而保留旧树结构。旧测试应改成验证新的 group-aware tree。

## 9. 非目标和禁止事项

本任务不做：

- 不新增 `apps/anieditorv5viewer-cc`。
- 不创建 Cocos Creator 项目、`.meta`、Library 缓存或编辑器场景。
- 不修改 `packages/vnicore` 的 task44 语义，除非发现 task44 本身 bug，且必须单独说明。
- 不修改 `apps/anieditorv5viewer` UI。
- 不新增资源下载器、bundle manifest loader、`resources.load()` 或 `JsonAsset` 绑定。
- 不把外部 URL 图片加载能力搬到 Cocos runtime。
- 不用 placeholder、跳过图层、自动猜测资源路径、自动猜测 group 顺序、静默降级 blend mode 或吞掉 driver 错误。
- 不为了测试保留错误 production 结构。

## 10. 任务报告要求

完成后新增：

```text
tasks/45-anieditorv5runtime-cc-layer-groups-render-effects-[utctime].md
```

报告必须是中文，并包含：

- 报告时间，格式为 `YYMMDD-HHMMSS UTC`。
- 实现摘要。
- 修改文件清单。
- 同步自任务 44 的功能列表。
- 新增或变更 public API。
- `3reel_multipay_01/02` fixture 验证结果。
- Cocos render tree 结构说明。
- 外部节点挂接 API 验证结果。
- `idle` 验证结果。
- `shatter/glow` 的 Cocos 支持决策：路线 B 的 fail-fast 验证结果，或路线 A 的 render effect 验证结果。
- standalone 单文件同步结果。
- `standalone.zip` 是否已重建及 `zipinfo -1` 输出摘要。
- `AGENTS.md` / `agents.md` 是否更新及原因；如果更新，记录 `cmp -s AGENTS.md agents.md` 结果。
- 是否新增依赖，`pnpm-lock.yaml` 是否变化。
- 完整命令验收结果。
- 测试修改说明，特别说明哪些测试是为了新真实合同而更新。
- 二次遗漏检查。
- 遗留风险。

报告命名命令：

```bash
date -u +%y%m%d-%H%M%S
```

## 11. 二次遗漏检查清单

交付前必须逐项检查：

- [ ] `types.ts` 已包含 `layerGroups`、`groupId`、`idle`、`shatter`、`glow`。
- [ ] 旧无 group 导出只在完全无 group 信息时规范化为 `group_default`。
- [ ] 半新半旧 group schema 会失败。
- [ ] render order 来自 `project.layers`，不是 `layerGroups.order`。
- [ ] group run 非连续会失败。
- [ ] group slot 只允许相邻 group。
- [ ] `V5GCocosPlayer` 已有 `getLayerGroups()` 和 `getLayerGroupSlots()`。
- [ ] `attachNodeBetweenLayerGroups(...)` 已支持外部 node 插入、detach、clear、destroy 清理。
- [ ] external node 默认不 destroy。
- [ ] runtime-owned image helper 如有实现，默认 destroy。
- [ ] slot container 坐标保持 Cocos stage center 体系。
- [ ] Cocos tree 中 group、slot、particle 的 child order 有测试；路线 A 还要覆盖 effect。
- [ ] `idle` 是 no-op coverage marker。
- [ ] `shatter` / `glow` 的 Cocos 支持路线已明确记录为路线 A 或路线 B。
- [ ] 路线 B：enabled `shatter` / `glow` 在 Cocos validation 或 player init 阶段显式失败。
- [ ] 路线 B：`3reel_multipay_01.json` fail-fast，`3reel_multipay_02.json` 继续可播放和挂接外部节点。
- [ ] 路线 A：`shatter` / `glow` 参数校验已同步。
- [ ] 路线 A：`render-effect-sampler.ts` 已导出并有测试。
- [ ] 路线 A：`SampledLayerState.renderImageDisplay` 和 `hasActiveRenderEffect` 已同步。
- [ ] 路线 A：`glow keepOriginal=false` 不会丢 effect。
- [ ] 路线 A：`shatter sourceOpacity=0` 不会丢 effect。
- [ ] 路线 A：`progress <= 0` 不产生 render effect 首帧漏图。
- [ ] 路线 A：render effect 不污染 live particle drain。
- [ ] 路线 A：Cocos `shatter` 不是完整大图重复飞散，必须有 clip/mask 或等价裁剪。
- [ ] 路线 A：新 Cocos driver API 已同步 fake driver、真实 driver、types shim 和 standalone。
- [ ] standalone 单文件已同步全部 core/cocos API。
- [ ] `scripts/check-standalone.mjs` 已包含新增 public exports。
- [ ] standalone tests 覆盖新增能力。
- [ ] `standalone.zip` 已重建且内容干净。
- [ ] README 已说明 group slot、external node、`shatter/glow` 支持决策和 standalone 用法。
- [ ] 模块化导入边界检查已记录，package 根入口没有新增真实 Cocos factory 或 driver re-export。
- [ ] 如更新 `AGENTS.md` / `agents.md`，两者内容一致。
- [ ] 所有验收命令通过。
- [ ] `git diff --check` 通过。
