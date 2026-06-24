# vnicore layer group slot insertion 任务计划

## 1. 任务目标

持续完善 Pixi.js v8 VNI 动画核心库：

```text
/Users/zerro/github.com/slotclientengine/packages/vnicore
```

以及基于它播放 VNI 导出资源的 viewer：

```text
/Users/zerro/github.com/slotclientengine/apps/anieditorv5viewer
```

本任务要跟进 `docs/anieditor5/src` 的最新导出合同，支持 VNI layer group 概念、新增动画类型，并让外部宿主可以把自定义 Pixi 节点精准挂接到两个相邻 group 之间。

核心场景：

- `docs/anieditor5/export/3reel_multipay_01.json` 是新的 VNI 导出文件，当前有 2 个 layer group：
  - `group_default`，名称 `上层光效`，`order: 0`
  - `layer_group_mqqo064b_4`，名称 `下层光效`，`order: 1`
- 该文件的实际渲染 layer 顺序是 `project.layers` 顺序：第 0 层属于 `下层光效`，后续层属于 `上层光效`。
- 外部宿主需要能在 `下层光效` 和 `上层光效` 之间插入节点，例如插入 slot 游戏的 reel、其它 Pixi 容器或调试图片。
- 插入定位必须用两个 group id 精准定位；两个 group 必须在 runtime 渲染顺序上相邻，否则显式报错，不能猜测、重排或静默兜底。
- `apps/anieditorv5viewer` 需要增加 UI：选择当前 project 的一张 asset 图片，不上传文件，把它插入到相邻 group 的中间。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、浏览器验收、文档同步、协作规则同步判断和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/44-vnicore-layer-group-slot-insertion-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/44-vnicore-layer-group-slot-insertion-260624-123456.md
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
git status --short
git diff --stat
```

当前协作规则文件在目录列表中是：

```text
agents.md
```

在大小写不敏感文件系统上，`AGENTS.md` 可能解析到同一个文件。若实现后新增了长期协作规则，例如“VNI layer group 渲染分层、group slot 挂接 API 必须属于 `packages/vnicore`，viewer 不能直接操作 runtime 内部 Pixi 容器”，需要同步更新 `agents.md`。如果执行环境中实际存在 `AGENTS.md` 和 `agents.md` 两个文件，必须保持两者内容同步。是否更新以及原因必须写入任务报告。

## 3. 当前实现事实

执行时必须重新阅读当前实现，以实际代码为准。当前已经观察到的相关事实如下。

### 3.1 editor 和导出差异

当前工作树已有 editor 侧改动：

```text
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/constants.ts
docs/anieditor5/src/export_project.ts
docs/anieditor5/src/main.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/types.ts
```

当前新增导出文件：

```text
docs/anieditor5/export/3reel_multipay_01.json
docs/anieditor5/export/3reel_multipay_02.json
```

当前 editor 版本已从旧值更新到：

```text
VNI_0.016
```

`docs/anieditor5/src/constants.ts` / `export_project.ts` 当前还把导出 JSON 文件名从固定的 `project.json` 改为按项目名生成，例如 `3reel_multipay_01.json`。因此 viewer 和测试新增资源时不能继续默认“所有 VNI project JSON 都叫 `project.json`”。现有 `export2/edit_full/project.json`、`export2/runtime_50/project.json` 仍是当前 fixture 事实，但未来 bundle path 必须以 `manifest.json` 或具体 bundled definition 为准。

`docs/anieditor5/src/types.ts` 新增了：

- `V5GLayerConfig.groupId?: string`
- `V5GLayerGroupConfig`
- `V5GProjectConfig.layerGroups`
- 动画类型 `idle`
- 动画类型 `shatter`
- 动画类型 `glow`

`docs/anieditor5/src/project_state.ts` 新增了：

- `DEFAULT_LAYER_GROUP_ID = "group_default"`
- `createDefaultLayerGroup(...)`
- `normalizeProjectLayerGroups(...)`
- `getLayerGroup(...)`
- `isLayerEffectivelyVisible(...)`
- 导出时隐藏 group 会跳过相关 layer 和 asset

`docs/anieditor5/src/pixi_stage.ts` 当前仍按 `project.layers` 顺序创建和重新添加 Pixi display。它不会按 `layerGroups.order` 重排渲染层级。`layerGroups.order` 当前主要是 editor UI/group header 的排序元数据；runtime 实现不能用它改变既有画面前后关系。

`docs/anieditor5/export/3reel_multipay_01.json` 当前摘要：

```text
schemaVersion: VNI_0.016
editor.name: VNI
name: 3reel_MultiPay_01
layerGroups:
  group_default / 上层光效 / order 0
  layer_group_mqqo064b_4 / 下层光效 / order 1
layerCount: 6
assetCount: 3
animationTypes: glow, fade, particle_wall, particle_combo, scale_up
assetPaths:
  assets/1_asset_image_mqp1egz4_b.png
  assets/image_asset_image_mqp31v5g_14.jpg
  assets/2_asset_image_mqp4tfmw_i.jpg
```

`docs/anieditor5/export/3reel_multipay_02.json` 当前摘要：

```text
schemaVersion: VNI_0.016
editor.name: VNI
name: 3reel_MultiPay_02
layerGroups:
  group_default / 上层光效 / order 0
  layer_group_mqqo4zrn_6 / 下层光效 / order 1
layerCount: 6
assetCount: 3
animationTypes: blink, fade, particle_wall, particle_combo, scale_up
assetPaths:
  assets/1_asset_image_mqp1egz4_b.png
  assets/image_asset_image_mqp31v5g_14.jpg
  assets/2_asset_image_mqp4tfmw_i.jpg
```

注意：`3reel_multipay_01.json` 中 `project.layers` 的渲染顺序是：

```text
0 下层光效
1 上层光效
2 上层光效
3 上层光效
4 上层光效
5 上层光效
```

所以这个项目的有效 group 渲染顺序是：

```text
layer_group_mqqo064b_4 -> group_default
```

也就是说插入 slot 的合法定位应是：

```ts
afterGroupId: "layer_group_mqqo064b_4"
beforeGroupId: "group_default"
```

不要把 `layerGroups.order` 误当成 Pixi child 渲染顺序。

### 3.2 vnicore 当前状态

当前 `packages/vnicore/src/core/types.ts` 还没有：

- `V5GLayerGroupConfig`
- `VNI/V5GProjectConfig.layerGroups`
- `V5GLayerConfig.groupId`
- `idle`
- `shatter`
- `glow`

当前 `packages/vnicore/src/core/validation.ts` 会拒绝 `type: "group"` layer 和 `parentId`，这个旧边界必须保留。新需求的 group 是 `project.layerGroups + layer.groupId`，不是 `type: "group"` layer，也不是 nested layer。

当前 `packages/vnicore/src/pixi/vni-player.ts` 在 `init()` 中直接遍历 `project.layers`，把每个 layer 的 `display` 和 `particleDisplay` 依次加入 `contentRoot`：

```text
contentRoot
  layer display
  layer particleDisplay
  layer display
  layer particleDisplay
```

当前还没有 group container，也没有公开的 group slot 挂接 API。

当前 `packages/vnicore/src/core/animation-sampler.ts` 支持的类型还不包括 `idle`、`shatter`、`glow`。

当前 `packages/vnicore/src/core/particle-sampler.ts` 把 `particles`、`particle_twinkle`、`particle_wall`、`particle_combo` 当作粒子动画处理，并已保留 `progress <= 0` 不渲染的首帧防漏逻辑。这个逻辑必须保留。

当前 `packages/vnicore/README.md` 和 `packages/vnicore/docs/api-zh.md` 已经把 `VNIPlayer` 作为稳定 public API，且明确应用层不要绕开 `VNIPlayer` 直接装配内部 layer instance。新增 group slot 能力应进入 `VNIPlayer` public methods，而不是让 viewer 访问私有 `contentRoot`。

### 3.3 viewer 当前状态

当前 viewer 入口：

```text
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/src/styles.css
```

当前 bundled project 列表还没有：

```text
3reel_multipay_01
3reel_multipay_02
```

当前 viewer assets 中已经能看到这两个新项目需要的图片文件：

```text
apps/anieditorv5viewer/src/assets/assets/1_asset_image_mqp1egz4_b.png
apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp31v5g_14.jpg
apps/anieditorv5viewer/src/assets/assets/2_asset_image_mqp4tfmw_i.jpg
```

执行时仍必须用 `resolveProjectAssetUrls(...)` 或测试确认所有新 project asset path 都能解析到 URL。

当前 viewer 测试：

```text
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/tests/bundled-projects.test.ts
```

`bundled-projects.test.ts` 把 bundled project id 列表写死了，所以添加新项目时必须同步更新测试。

当前 viewer 还承担 `docs/anieditor5/export2` 的 profile-scoped 资源验收：

```text
apps/anieditorv5viewer/src/assets/export2/manifest.json
apps/anieditorv5viewer/src/assets/export2/edit_full/project.json
apps/anieditorv5viewer/src/assets/export2/runtime_50/project.json
```

`edit_full` 和 `runtime_50` 可以共享同一个 `asset.path`，但 URL 必须按 profile 维度解析，不能退回到单一全局 `asset.path -> url`。本任务新增 group/slot 插入时必须保持这个旧合同不退化。

## 4. 必须实现的行为契约

### 4.1 layer group schema 合同

`packages/vnicore` 必须支持新的 VNI group schema：

```ts
export interface V5GLayerGroupConfig {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
}
```

`V5GProjectConfig` / `VNIProjectConfig` 必须包含：

```ts
layerGroups: V5GLayerGroupConfig[];
```

`V5GLayerConfig` / `VNILayerConfig` 必须包含：

```ts
groupId?: string;
```

兼容规则必须明确：

- 旧 `V5G_0.x` 导出、旧 `VNI_0.x` 导出可能没有 `layerGroups` 和 `groupId`。如果整个 project 没有 `layerGroups`，且所有 layer 都没有 `groupId`，可以显式规范化为单个 `group_default`。这是旧导出兼容，不是错误兜底。
- 一旦 project 提供了 `layerGroups`，就必须严格校验：
  - `layerGroups` 必须是非空数组。
  - 每个 group 的 `id` 必须是非空字符串。
  - group id 不能重复。
  - `name` 必须是字符串。
  - `visible` 必须是 boolean。
  - `collapsed` 必须是 boolean。
  - `order` 必须是 finite number。
  - 同一个 project 内不允许重复 `order`，除非执行者有明确理由保留并在报告中说明。
  - 每个 layer 的 `groupId` 必须引用已存在 group。
- 如果 project 提供了 `groupId` 但没有提供 `layerGroups`，必须显式失败。
- 如果 project 提供了 `layerGroups` 但某个 layer 缺 `groupId`，必须显式失败。
- 不允许把未知 groupId 静默改成 `group_default`。
- 不允许把非法 group schema 静默过滤。
- `type: "group"` layer 和非空 `parentId` 仍然不支持，必须继续显式失败。

推荐新增 helper：

```ts
export const DEFAULT_VNI_LAYER_GROUP_ID = "group_default";

export function normalizeVNIProjectLayerGroups(
  project: VNIProjectConfig,
): VNIProjectConfig;

export function getVNIProjectRenderGroupOrder(
  project: VNIProjectConfig,
): readonly VNIRenderGroupInfo[];
```

如果实现为 mutating helper，必须在函数名或文档里写清楚；优先返回新对象，减少宿主侧意外状态变化。

### 4.2 group 渲染顺序和相邻判断

runtime 渲染顺序必须来自 `project.layers`，不是 `layerGroups.order`。

原因：当前 editor 预览和导出画面以 `project.layers` 的顺序决定 Pixi child 顺序；`3reel_multipay_01.json` 的 `layerGroups.order` 与实际渲染上下层名称相反，如果 runtime 用 `layerGroups.order` 重排，会改变画面。

runtime 必须扫描 `project.layers`，生成 contiguous group run：

```text
layer_group_mqqo064b_4 -> group_default
```

每个 group 必须形成连续 layer 段，才能作为可插入 slot 的边界。如果同一个 group 在 `project.layers` 中分成多个不连续片段，必须显式失败或至少让 group slot API 对该 project 显式失败。推荐在 `validateVNIProject(...)` 阶段失败，错误包含 group id 和 `project.layers`。

合法 slot 是相邻 group run 之间的边界。对 `3reel_multipay_01.json`，合法 slot 只有：

```ts
{
  afterGroupId: "layer_group_mqqo064b_4",
  beforeGroupId: "group_default",
}
```

如果调用：

```ts
afterGroupId: "group_default",
beforeGroupId: "layer_group_mqqo064b_4",
```

必须失败，因为顺序反了。

如果两个 group 之间还有其它 group，必须失败，错误说明它们不是相邻 group。

如果 group id 不存在，必须失败。

### 4.3 VNIPlayer group container 和 public API

`VNIPlayer` 需要把内部 Pixi 结构调整为 group-aware，但不能改变现有 layer 画面顺序。

推荐内部结构：

```text
contentRoot
  group container: layer_group_mqqo064b_4
    layer display
    layer particle/effect display
  mounted slot container: layer_group_mqqo064b_4 -> group_default
    host node(s)
  group container: group_default
    layer display
    layer particle/effect display
```

组内仍按原始 `project.layers` 顺序添加每个 layer 的 `display` 和 `particleDisplay` / effect display。不要为了 UI 顺序反转 layer。

推荐新增 public 类型：

```ts
export interface VNILayerGroupInfo {
  id: string;
  name: string;
  visible: boolean;
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

export interface VNIAttachNodeBetweenLayerGroupsOptions {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  node: PIXI.Container;
  destroyOnDetach?: boolean;
}

export interface VNIAttachImageBetweenLayerGroupsOptions {
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
  blendMode?: VNIBlendMode;
  destroyOnDetach?: boolean;
}
```

推荐新增 public methods：

```ts
getLayerGroups(): readonly VNILayerGroupInfo[];
getLayerGroupSlots(): readonly VNILayerGroupSlot[];
attachNodeBetweenLayerGroups(
  options: VNIAttachNodeBetweenLayerGroupsOptions,
): () => void;
attachImageBetweenLayerGroups(
  options: VNIAttachImageBetweenLayerGroupsOptions,
): () => void;
detachMountedNode(id: string): void;
clearMountedNodes(): void;
```

实现要求：

- `attachNodeBetweenLayerGroups(...)` 和 `attachImageBetweenLayerGroups(...)` 只允许在 `init()` 完成后调用；否则显式失败。
- `id` 必须是非空字符串，重复 id 必须显式失败。
- 两个 group id 必须组成当前 project 的一个合法相邻 slot；否则显式失败。
- 插入节点要随 `stageRoot` 缩放、pivot、resize 一起工作，因此必须挂在 `contentRoot` 下的 slot container，而不是 DOM overlay。
- 插入节点的坐标使用 Pixi stage content 坐标：`x=0,y=0` 是 stage 左上角，和 layer display 的最终 Pixi 坐标空间一致。
- `attachImageBetweenLayerGroups(...)` 使用已经由 `VNIPlayer` 加载和校验过的 texture，按 `asset.width/height` 与 `fileWidth/fileHeight` 做同样的显示补偿，不能再次绕过 texture size 校验。
- `detachMountedNode(id)` 找不到 id 必须显式失败。
- `clearMountedNodes()` 可以清理所有挂接节点。
- `destroy()` 必须清理挂接记录、从 Pixi tree 移除节点、清理 diagnostics。
- 外部传入的 `node` 默认只 remove，不 destroy；当 `destroyOnDetach === true` 时才 destroy。这个语义必须写进文档和测试。
- 项目切换时 viewer 调用旧 player 的 `destroy()` 即可完成清理，viewer 不需要直接碰 Pixi internals。

推荐 diagnostics：

```text
data-vni-layer-groups
data-vni-layer-group-slots
data-vni-mounted-nodes
```

其中值可以是数字或简短字符串，必须在 `destroy()` 中清理。现有 `data-v5g-*` legacy diagnostics 不要删除。

### 4.4 新增动画类型

`packages/vnicore` 必须跟进 editor 新增动画：

```text
idle
shatter
glow
```

`idle` 合同：

- 不改变 transform。
- 不改变 opacity。
- 不需要 numeric params。
- 默认 easing 为 `linear`。
- 它的作用是让 layer 在该时间段内进入 animation coverage，从而配合现有“动画覆盖外隐藏”逻辑。

`shatter` 合同：

- 必须支持 editor 当前参数：
  - `count`
  - `pieceSize`
  - `force`
  - `impactAngle`
  - `spreadAngle`
  - `gravity`
  - `spin`
  - `sourceOpacity`
  - `fadeOut`
- `sourceOpacity` 控制原图保留透明度。
- 碎片渲染必须是 deterministic，使用 animation seed。
- 不允许缺参数时靠默认值吞掉导出问题；validation 必须要求 numeric params，`fadeOut` 必须是 boolean 或缺省。
- 首帧边界不能漏出错误碎片；沿用或补齐 `progress <= 0` 抑制。

`glow` 合同：

- 必须支持 editor 当前参数：
  - `intensity`
  - `spread`
  - `minAlpha`
  - `maxAlpha`
  - `pulses`
  - `blendMode`
  - `keepOriginal`
- `keepOriginal === false` 时原图层应隐藏，只显示 glow 效果。
- `blendMode` 目前来自 editor 的数值约定：`0=add`、`1=screen`、`2=lighten`。
- 不允许缺参数时靠默认值吞掉导出问题；validation 必须要求 numeric params，`keepOriginal` 必须是 boolean 或缺省。

实现建议：

- `animation-sampler.ts` 增加 `idle` no-op、`shatter` source opacity、`glow` source visibility/opacity 采样。
- 不要把 `glow` 简单塞进 stateful live particle runtime；它是确定性 render effect。
- 可以新增 `render-effect-sampler.ts`，或在现有 Pixi layer/effect 绘制路径中单独处理 `shatter/glow`。
- `particle_wall`、`particle_combo` 等现有 live 粒子排空语义不能被破坏。
- `project-sampler.ts` 需要能表达“原图不可见但 render effect 仍可见”的情况，避免 `glow keepOriginal=false` 或 `shatter sourceOpacity=0` 把整层误判成完全无渲染。

### 4.5 viewer 插入图片 UI

`apps/anieditorv5viewer` 必须新增一个独立 UI 区域，建议标题：

```text
组间插入
```

UI 要求：

- 只使用当前 bundled project 的 `project.assets[]`，不上传文件。
- 图片下拉显示 `asset.originalName` 和 `asset.path`，value 使用 `asset.id`。
- slot 下拉来自 `player.getLayerGroupSlots()` 或等价 runtime API，显示 `afterGroupName -> beforeGroupName`。
- 如果当前 project 少于 2 个 group，或没有合法相邻 slot，UI 要禁用插入按钮，并显示简短状态。
- 点击“插入”后调用 `VNIPlayer.attachImageBetweenLayerGroups(...)`，不要在 viewer 里访问 `contentRoot`、`layerInstances` 或其它私有字段。
- 默认插入图片的位置应可见，建议居中：
  - `x = project.stage.width / 2`
  - `y = project.stage.height / 2`
  - `anchorX = 0.5`
  - `anchorY = 0.5`
  - `opacity = 1`
- UI 至少提供“移除插入节点”按钮，调用 `detachMountedNode(...)` 或 `clearMountedNodes()`。
- 项目切换时必须自动清空旧插入节点；正常路径应由旧 player 的 `destroy()` 完成。
- 插入错误必须显示在 viewer 控件区域；不要吞掉错误，也不要 fallback 到第一个 slot。
- 对 `3reel_multipay_01`，浏览器验收必须能选择 `assets/image_asset_image_mqp31v5g_14.jpg` 或其它当前 assets 图片并插入到 `layer_group_mqqo064b_4 -> group_default` 之间。

UI 不需要上传文件；本任务范围也不需要做拖拽定位、缩放手柄或持久保存插入节点配置。

### 4.6 fail-fast 边界

用户明确要求：

```text
如果是测试导致一些奇怪写法，就修改测试，不要改不该改的东西，以免后续出现问题难查
我不希望一些不必要的兜底，有些逻辑bug，越早暴露出来越好
```

因此本任务必须遵守：

- 不允许为了让旧测试过而削弱生产校验。
- 如果测试 fixture 与真实导出合同不一致，优先更新 fixture 或测试预期。
- 不允许未知 group、非相邻 group、重复挂接 id、缺失 asset、缺失 texture URL、未知动画类型、缺失 required param 静默继续。
- 不允许 viewer 自动猜第一个 group slot 来掩盖错误。
- 不允许用 placeholder 图片代表缺失 asset。
- 不允许通过 `as any` 大面积绕过类型；如测试需要 mock Pixi，更新 mock 能力。
- 不允许在 `apps/anieditorv5viewer` 复制 `vnicore` 的播放状态机、group adjacency 算法或 Pixi layer 装配逻辑。

### 4.7 旧导出、export2 和 JSON 文件名兼容

本任务新增的是 group/slot 能力，不允许破坏已有导出播放面：

- 旧 `docs/anieditor5/export/*.json` 必须继续可播放。
- `docs/anieditor5/export2/manifest.json`、`edit_full`、`runtime_50` 必须继续可播放。
- `runtime_50` 的 `fileWidth/fileHeight/fileScale` all-or-none、真实 texture size 校验和逻辑尺寸显示补偿必须保留。
- viewer 的 export2 asset URL 必须继续 profile scoped；不能为了新增 `3reel_multipay_01/02` 把 `asset.path` 合并成一个全局 map。
- 新增 JSON import 时必须支持任意具体文件名，例如 `3reel_multipay_01.json`，不要把新 VNI project 文件名硬编码成 `project.json`。
- 如果未来新增 bundle manifest entry，viewer 必须按 manifest entry 的 `path` 注册对应 JSON import；缺少注册必须显式失败，而不是默默跳过该 profile。
- `validateManifestProjectProfile(...)` 的现有 manifest/profile 一致性检查必须保留。

## 5. 实施步骤

### 5.1 基线确认

执行：

```bash
git status --short
git diff --stat
```

阅读：

```text
docs/anieditor5/src/types.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/export/3reel_multipay_01.json
docs/anieditor5/export/3reel_multipay_02.json
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/layer-instance.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
```

确认新导出文件的 group、animation、asset 摘要：

```bash
node -e "const fs=require('fs'); for (const f of ['docs/anieditor5/export/3reel_multipay_01.json','docs/anieditor5/export/3reel_multipay_02.json']) { const p=JSON.parse(fs.readFileSync(f,'utf8')); console.log(f, p.schemaVersion, p.name); console.log(p.layerGroups); console.log([...new Set(p.layers.flatMap(l => l.animations.map(a => a.type)))]); console.log(p.assets.map(a => a.path)); }"
```

如果摘要与本计划不同，以当前文件为准，并在任务报告说明差异。

### 5.2 同步 fixtures 和 viewer bundled assets

把新 JSON 同步到 viewer：

```text
apps/anieditorv5viewer/src/assets/projects/3reel_multipay_01.json
apps/anieditorv5viewer/src/assets/projects/3reel_multipay_02.json
```

把新 JSON 同步到 vnicore 测试 fixtures：

```text
packages/vnicore/tests/fixtures/export/3reel_multipay_01.json
packages/vnicore/tests/fixtures/export/3reel_multipay_02.json
```

确认新项目需要的图片在 viewer assets 中存在：

```text
apps/anieditorv5viewer/src/assets/assets/1_asset_image_mqp1egz4_b.png
apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp31v5g_14.jpg
apps/anieditorv5viewer/src/assets/assets/2_asset_image_mqp4tfmw_i.jpg
```

如果缺失，必须从：

```text
docs/anieditor5/export/assets/
```

同步对应图片到：

```text
apps/anieditorv5viewer/src/assets/assets/
```

不要新增第二套 asset manifest；继续用 `createAssetUrlManifest(import.meta.glob(...))` 和 `resolveProjectAssetUrls(...)` 校验。

同时复核现有 export2 文件不要被误改或误删：

```text
apps/anieditorv5viewer/src/assets/export2/manifest.json
apps/anieditorv5viewer/src/assets/export2/edit_full/project.json
apps/anieditorv5viewer/src/assets/export2/runtime_50/project.json
packages/vnicore/tests/fixtures/export2/manifest.json
packages/vnicore/tests/fixtures/export2/edit_full/project.json
packages/vnicore/tests/fixtures/export2/runtime_50/project.json
```

如果执行时发现 editor 已重新导出了 `export2`，且 manifest entry path 已不再是 `project.json`，必须同步更新 viewer import、`validateExport2ManifestPaths(...)` 和测试，不要把 path 强行改回旧文件名。

### 5.3 更新 vnicore 类型和校验

修改：

```text
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/index.ts
```

要求：

- 增加 layer group 类型和 alias。
- 增加 `idle/shatter/glow` animation type。
- `assertV5GProject(...)` / `assertVNIProject(...)` 返回规范化后的 project，使旧无 group 导出拥有显式 `group_default`，新 group 导出严格保留 group id。
- `validateV5GProject(...)` / `validateVNIProject(...)` 校验 group schema、group reference、contiguous group run、动画参数。
- 保留旧的 `type: "group"` layer、`parentId`、非空 keyframes、top-level particles 失败行为。
- 错误信息包含可定位字段，例如 group id、layer id、asset id、animation id。

新增或更新测试：

```text
packages/vnicore/tests/core/validation.test.ts
```

至少覆盖：

- 接受 `3reel_multipay_01.json` 和 `3reel_multipay_02.json`。
- 旧 fixture 没有 `layerGroups` 时规范化为 `group_default`。
- 新 group project 中缺失 `layerGroups` 但 layer 有 `groupId` 会失败。
- 新 group project 中 layer `groupId` 不存在会失败。
- group id 重复会失败。
- group order 非 finite 或重复会失败。
- group 在 `project.layers` 中不连续会失败。
- `type: "group"` layer 仍失败。
- `idle` 无 required numeric params。
- `shatter` 和 `glow` required numeric params 缺失会失败。
- `fadeOut` / `keepOriginal` 非 boolean 会失败。

### 5.4 更新采样和 render effect

修改：

```text
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
```

如果新增独立文件，建议：

```text
packages/vnicore/src/core/render-effect-sampler.ts
```

要求：

- `idle` 在 animation coverage 内保持 layer 可见，但不改变 transform/opacity。
- `shatter.sourceOpacity` 作用于 source image opacity。
- `glow.keepOriginal === false` 时 source image 隐藏，但 glow effect 仍可渲染。
- `shatter/glow` 的确定性渲染效果不能污染 live particle drain 状态。
- 现有 `particle_combo.sourceOpacity`、`progress <= 0` 首帧抑制、scaled runtime texture 逻辑不退化。

新增或更新测试：

```text
packages/vnicore/tests/core/animation-sampler.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/particle-sampler.test.ts
```

至少覆盖：

- `idle` 不改变 transform/opacity，但使 layer 在覆盖时间内不因“无 active coverage”被隐藏。
- `glow keepOriginal=false` 时 source image 不渲染，但 project sample 能标识存在 active render effect。
- `shatter sourceOpacity=0` 时 source image 不渲染，但 shatter effect 仍可渲染。
- `progress <= 0` 不渲染 shatter 碎片或其它新 effect。

### 5.5 更新 Pixi player group container 和插入 API

修改：

```text
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/index.ts
packages/vnicore/src/index.ts
```

要求：

- `VNIPlayer.init()` 创建 group-aware Pixi tree。
- `contentRoot` child 顺序必须保持 `project.layers` 推导出的 group render order。
- 每个 group container 内保持原始 layer 顺序，且每个 image layer 的 particle/effect display 紧跟 source display。
- `getLayerGroups()` 和 `getLayerGroupSlots()` 返回稳定只读数据。
- `attachNodeBetweenLayerGroups(...)` 支持外部 Pixi node。
- `attachImageBetweenLayerGroups(...)` 支持用当前 project asset id 插入图片。
- `detachMountedNode(...)`、`clearMountedNodes()` 和 `destroy()` 清理正确。
- resize、seek、play、pause、restart、range、segmented playback 都不能破坏挂接节点位置。
- diagnostics 写入并清理 group/slot/mounted node 信息。

新增或更新测试：

```text
packages/vnicore/tests/pixi/vni-player.test.ts
```

至少覆盖：

- group container child 顺序符合 `project.layers`，不是 `layerGroups.order`。
- `3reel_multipay_01` 的 slot 是 `layer_group_mqqo064b_4 -> group_default`。
- 插入 node 后位于两个相邻 group container 中间。
- 反向传 group id 会失败。
- 非相邻 group 会失败。
- 未 init 调用插入 API 会失败。
- 重复 mount id 会失败。
- `detachMountedNode` 移除正确 node，未知 id 会失败。
- `destroy()` 清理 diagnostics 和挂接记录。
- `attachImageBetweenLayerGroups` 使用已加载 texture 和 display compensation。

如果 Pixi mock 缺少 `mask`、`addChildAt`、`removeChild`、`destroy({ children: true })` 等能力，更新测试 mock，不要改生产逻辑迁就 mock。

### 5.6 更新 viewer bundled projects 和 UI

修改：

```text
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/styles.css
apps/anieditorv5viewer/tests/bundled-projects.test.ts
apps/anieditorv5viewer/tests/main.test.ts
```

要求：

- `BundledProjectId` 增加：
  - `3reel-multipay-01`
  - `3reel-multipay-02`
- import 新 JSON：
  - `../assets/projects/3reel_multipay_01.json`
  - `../assets/projects/3reel_multipay_02.json`
- bundled list 中加入两个 project，sourcePath 指向：
  - `docs/anieditor5/export/3reel_multipay_01.json`
  - `docs/anieditor5/export/3reel_multipay_02.json`
- 不要新增“项目 JSON 必须名为 `project.json`”的假设；legacy/export project 可以是任意具体 JSON 文件名。
- `bundled-projects.test.ts` 更新固定 id 列表，并确认两个新项目 asset URL 全部可解析。
- `bundled-projects.test.ts` 必须继续覆盖 export2 edit_full/runtime_50 profile-scoped asset URL，不允许因为新增项目而删掉旧验收。
- UI 增加“组间插入”区域。
- `main.ts` 在 player init 后把 `player.getLayerGroupSlots()` 传给 controls 或由 controls 回调触发刷新。
- 点击插入时调用 `player.attachImageBetweenLayerGroups(...)`。
- 点击移除时调用 `player.detachMountedNode(...)` 或 `player.clearMountedNodes()`。
- 插入错误展示到 UI，不能 throw 到全局 fatal error，除非是 init 阶段的项目加载错误。
- 项目切换后 UI 状态重置，旧插入节点由旧 player `destroy()` 清掉。

viewer UI 测试至少覆盖：

- 新 project 能在下拉中出现。
- 选择 `3reel-multipay-01` 后，组间插入 UI 有一个合法 slot。
- 点击插入会调用 mock `VNIPlayer.attachImageBetweenLayerGroups(...)`，参数包含：
  - `afterGroupId: "layer_group_mqqo064b_4"`
  - `beforeGroupId: "group_default"`
  - 所选 asset id
- 点击移除会调用对应清理方法。
- 没有合法 slot 时插入按钮禁用。

### 5.7 更新文档和协作规则

必须更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
```

文档必须写清：

- layer group 是 `project.layerGroups + layer.groupId`，不是 `type: "group"` layer。
- runtime 渲染顺序来自 `project.layers`，不是 `layerGroups.order`。
- `getLayerGroupSlots()` 只返回相邻 group 之间的合法 slot。
- `attachNodeBetweenLayerGroups(...)` 和 `attachImageBetweenLayerGroups(...)` 的参数、错误、销毁语义。
- 插入节点坐标是 Pixi stage content 坐标。
- `idle/shatter/glow` 支持范围。
- fail-fast 行为。

必须新增或更新一个可 typecheck 的示例，建议：

```text
packages/vnicore/examples/group-slot-insertion.ts
```

示例需要演示：

- 读取 `player.getLayerGroupSlots()`。
- 选择相邻 group slot。
- 调用 `attachNodeBetweenLayerGroups(...)` 或 `attachImageBetweenLayerGroups(...)`。
- 使用 disposer 或 `detachMountedNode(...)` 清理。

`packages/vnicore/examples/README.md` 必须登记新示例。`pnpm --filter @slotclientengine/vnicore examples:typecheck` 必须覆盖该示例。

视实现结果判断是否更新：

```text
agents.md
```

如果新增了“viewer 只能通过 `VNIPlayer` group slot API 挂接节点，不得直接操作 runtime 私有 Pixi tree”这类长期协作规则，就更新 `agents.md`。如果没有更新，任务报告必须说明为什么不需要。

### 5.8 不做事项

本任务不做：

- 不实现上传图片。
- 不实现插入节点的拖拽、缩放、旋转 UI。
- 不把插入节点配置保存回 VNI JSON。
- 不修改 editor 的 group UI 或导出逻辑，除非发现当前导出合同存在阻塞 runtime 的明确 bug。
- 不修改 Cocos runtime `packages/anieditorv5runtime-cc`。
- 不用 `layerGroups.order` 改变 existing animation 渲染层级。
- 不添加 placeholder 兜底。

## 6. 验收命令

执行前确认 Node 版本：

```bash
node -v
pnpm -v
```

目标验证：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
git diff --check
```

如果某个测试失败是因为旧测试把“不支持 group schema”当正确行为，必须更新测试，不要回退生产实现。

如果依赖或下载失败，先执行代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

再重试对应命令，并在任务报告记录。

## 7. 浏览器验收

启动 viewer：

```bash
pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1 --port 5173
```

如果 `5173` 被占用，改用其它端口，例如：

```bash
pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1 --port 5174
```

任务报告必须记录实际 URL。

浏览器验收步骤：

1. 打开 viewer 实际 URL。
2. 选择 `3reel_MultiPay_01` 对应 project。
3. 确认 canvas 有可见画面，且 `data-vni-project-id`、`data-vni-layer-groups`、`data-vni-layer-group-slots` 写入正常。
4. 确认组间插入 UI 显示合法 slot：

```text
下层光效 -> 上层光效
```

5. 选择当前 project 的一张 asset 图片，例如：

```text
assets/image_asset_image_mqp31v5g_14.jpg
```

6. 点击插入，确认图片显示在下层光效和上层光效之间。
7. 点击 Play，确认插入图片持续存在，动画、粒子、glow 不报错。
8. 拖动时间轴 seek 到 0、动画中段、结束附近，确认插入图片不丢失，原动画正常。
9. 点击移除，确认插入图片消失，动画仍正常。
10. 切换到其它 project，再切回 `3reel_MultiPay_01`，确认旧插入节点不会泄漏。
11. 选择 `3reel_MultiPay_02`，确认 blink/particle/scale 动画可播放，新 group schema 不报错。

浏览器验收证据需要写入任务报告，至少包括：

- 实际 URL
- 验收 project id/name
- 插入 slot 的两个 group id
- 插入 asset id/path
- canvas diagnostics 摘要
- 是否有截图或人工观察结论

## 8. 任务报告要求

任务完成后新增中文报告：

```text
tasks/44-vnicore-layer-group-slot-insertion-[utctime].md
```

报告必须包含：

- 实现摘要。
- 改动文件列表。
- 是否同步了 `agents.md`，以及原因。
- 新增 public API 列表。
- `3reel_multipay_01/02` 的 group、slot、动画支持结果。
- viewer 插入图片 UI 的验收结果。
- 执行过的命令和结果。
- 浏览器验收 URL 和结果。
- 是否修改测试；如果修改，说明是为新真实合同更新测试，还是修复测试 mock 能力。
- 是否新增依赖；如果有，记录 `pnpm-lock.yaml` 是否变化。
- 遗留风险或后续建议。

## 9. 二次遗漏检查清单

提交前必须做第二轮检查，逐项确认：

- `docs/anieditor5/export/3reel_multipay_01.json` 和 `3reel_multipay_02.json` 已同步到 viewer 和 vnicore fixtures。
- 新 project 的所有 `asset.path` 都能在 viewer asset manifest 中解析。
- `VNI_0.016`、`layerGroups`、`groupId`、`idle`、`shatter`、`glow` 都已进入 vnicore 类型和校验。
- 旧 `V5G_0.x` / `VNI_0.x` 无 group 导出仍能播放，并且兼容逻辑只针对“整项目没有 group 信息”的旧合同。
- `type: "group"` layer、`parentId`、非空 keyframes、top-level particles 仍然失败。
- group render order 使用 `project.layers`，没有误用 `layerGroups.order` 重排。
- 非连续 group 会失败，两个不相邻 group 插入会失败。
- 反向 group id 插入会失败。
- viewer 没有访问 `VNIPlayer` 私有字段。
- `attachImageBetweenLayerGroups(...)` 复用已校验 texture，不绕过 `fileWidth/fileHeight` 校验。
- `destroy()` 会清理 mounted nodes 和 diagnostics。
- `glow keepOriginal=false`、`shatter sourceOpacity=0` 不会让效果丢失。
- `particle_combo`、segmented playback、particle-draining 既有语义不退化。
- `packages/vnicore` README/API/usage 文档已更新。
- `packages/vnicore/docs/migration-from-viewer-zh.md` 已更新 viewer/runtime 职责边界。
- `packages/vnicore/examples/group-slot-insertion.ts` 和 examples README 已更新并通过 typecheck。
- `export2` 的 profile-scoped asset URL、`runtime_50` texture size 校验和 manifest/profile 一致性未退化。
- 新增 JSON import 没有引入“所有项目文件都叫 `project.json`”的硬编码假设。
- `agents.md` 是否需要更新已经判断并写入报告。
- 所有验收命令和浏览器验收已执行，失败项有明确原因和修复结果。
- `git diff --check` 通过。
