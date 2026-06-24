# vnicore 使用说明

`@slotclientengine/vnicore` 是 Pixi.js v8 的 VNI 动画 runtime core。宿主应用负责页面、项目选择、资源导入和 UI 控件；`vnicore` 负责校验、采样、Pixi 渲染、贴图尺寸校验、播放控制和 diagnostics。

## 依赖方式

workspace 内部应用使用：

```json
{
  "dependencies": {
    "@slotclientengine/vnicore": "workspace:*"
  }
}
```

## 最小播放器流程

宿主需要准备三样东西：

- `container`: 一个真实 `HTMLElement`。
- `project`: 已通过 `assertVNIProject` / `validateVNIProject` 的导出 JSON。
- `assetUrls`: `AssetUrlManifest`，key 必须是导出 JSON 里的 `asset.path`。

```ts
import {
  assertVNIProject,
  resolveProjectAssetUrls,
  validateVNIProject,
} from "@slotclientengine/vnicore/core";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";

const project = assertVNIProject(projectJson);
validateVNIProject(project);

const player = new VNIPlayer({
  container,
  projectId: "bigwin-runtime-50",
  bundleId: "export2",
  profileId: "runtime_50",
  profilePurpose: "runtime",
  assetScale: 0.5,
  project,
  assetUrls: resolveProjectAssetUrls(project, manifest),
});

await player.init();
player.play();
```

## 生命周期

- `init()`: 加载贴图、校验真实 texture size、创建 Pixi app、初始化 layer 和 particle 容器。
- `play()`: 使用 RAF 自动推进普通时间轴；无参数旧行为保持不变。
- `pause()`: 暂停用户播放，冻结主时间轴和 live 粒子年龄，不清空 range、marker 或 complete listener。
- `restart()`: 清空 active range、segmented 状态和 live 粒子，回到 0 秒。
- `seek(time)`: 退出 range/segmented live playback，清空 live 粒子状态，并按指定时间做确定性预览；不会触发 marker。
- `setLoop(loop)` / `getLoop()`: 控制普通播放和未显式传 `loop` 的 range 播放。
- `destroy()`: 停止 RAF、断开 `ResizeObserver`、清理 mounted nodes、render effects、particles、diagnostics、marker 和 complete listener，并销毁 Pixi app。

播放到终点和视觉完全结束不是同一件事。非循环 timeline、非循环 range 和 segmented end 段到达终点后会停止发射器并进入 `particle-draining`；已有 live 粒子继续衰减，排空后才进入 `complete` 并触发 `onPlaybackComplete(...)`。`isPlaying()` 在主时间轴停止推进后会是 `false`，但内部 RAF 可能仍会继续驱动粒子排空；使用 `getPlaybackState().isDrainingParticles` 判断排空状态。

## Range 和事件

`playRange(...)` 只允许在 `init()` 后调用。time range 使用秒，frame range 必须显式传入 `fps`，不会默认 60fps。

```ts
player.playRange({
  range: { unit: "frame", start: 30, end: 90, fps: 60 },
  loop: false,
});

const disposeMarker = player.addPlaybackEvent({
  id: "flash",
  at: { unit: "time", at: 1.2 },
  once: true,
  listener: (event) => console.log(event.time),
});

const disposeComplete = player.onPlaybackComplete((event) => {
  console.log(event.startTime, event.endTime);
});
```

`end` 省略、`undefined` 或 `-1` 都表示播放到 `project.stage.duration`。marker 只在播放推进跨过时间点时触发；`seek()`、`init()`、`restart()` 不触发 marker。marker 与终点同一时刻时，marker 先于 complete。

## Segmented 高级播放

三段式播放把动画拆成 `0 -> loopStart`、`loopStart -> loopEnd`、`loopEnd -> duration`。`loopStart` 和 `loopEnd` 必须是合法秒数或帧点，满足 `0 <= loopStart <= loopEnd <= duration`，非法输入会显式失败，不会被 clamp。

```ts
player.play({
  mode: "segmented",
  loopStart: { unit: "time", at: 3 },
  loopEnd: { unit: "time", at: 3 },
  keepParticlesAlive: true,
});

player.requestSegmentedPlaybackEnd();
```

`loopStart === loopEnd` 表示非粒子动画维持在该帧；粒子发射器维持该帧的配置，但已经发射的粒子继续按运行时 delta 老化、移动，连续发射器也会继续发射。`loopStart < loopEnd` 表示非粒子动画和发射器配置都在 `[loopStart, loopEnd)` 循环；开启 `keepParticlesAlive` 时，live 粒子不会因为 loop 时间回绕而重置。`keepParticlesAlive` 默认是 `true`。`setLoop(false)` 不会让 segmented loop 自动结束，只有 `requestSegmentedPlaybackEnd()` 会进入 end 段。

## Layer group 和组间插入

VNI layer group 使用 `project.layerGroups + layer.groupId`。`type: "group"` layer 和 `parentId` 嵌套仍不支持。旧导出只有在整个 project 没有 `layerGroups` 且所有 layer 都没有 `groupId` 时，才会被规范化为单个 `group_default`。

runtime render order 来自 `project.layers`，不是 `layerGroups.order`。`getLayerGroupSlots()` 只返回两个相邻 group run 之间的合法边界；反向、未知或非相邻 group id 会显式失败。

```ts
const [slot] = player.getLayerGroupSlots();
if (!slot) throw new Error("no slot");

const dispose = player.attachImageBetweenLayerGroups({
  id: "slot-reel-preview",
  afterGroupId: slot.afterGroupId,
  beforeGroupId: slot.beforeGroupId,
  assetId: "asset_image_mqp31v5g_14",
  x: project.stage.width / 2,
  y: project.stage.height / 2,
  anchorX: 0.5,
  anchorY: 0.5,
});

dispose();
```

如果宿主要挂接当前 assets 目录里未被当前 project 引用的图片，使用显式 URL API：

```ts
const disposeExternal = await player.attachExternalImageBetweenLayerGroups({
  id: "slot-any-asset-preview",
  afterGroupId: slot.afterGroupId,
  beforeGroupId: slot.beforeGroupId,
  imageUrl: assetUrlManifest["assets/extra.png"],
  label: "assets/extra.png",
  x: project.stage.width / 2,
  y: project.stage.height / 2,
  anchorX: 0.5,
  anchorY: 0.5,
});

disposeExternal();
```

挂接坐标是 Pixi stage content 坐标，`x=0,y=0` 是 stage 左上角。`attachImageBetweenLayerGroups(...)` 复用 `VNIPlayer` 已加载且已通过 texture size 校验的 project asset texture。`attachExternalImageBetweenLayerGroups(...)` 不把外部图片伪装成 project asset，适合 viewer 的当前 assets 目录全集选择。`attachNodeBetweenLayerGroups(...)` 默认只 remove 外部传入 node，不 destroy；传 `destroyOnDetach: true` 才销毁。`detachMountedNode(id)` 找不到 id 会失败，`clearMountedNodes()` 清理所有挂接节点。

## Diagnostics

播放器会在 `container.dataset` 写入：

- `data-vni-project-id`
- `data-vni-time`
- `data-vni-visible-layers`
- `data-vni-particle-sprites`
- `data-vni-render-effect-sprites`
- `data-vni-playback-mode`
- `data-vni-playback-phase`
- `data-vni-particle-draining`
- `data-vni-live-particles`
- `data-vni-layer-groups`
- `data-vni-layer-group-slots`
- `data-vni-mounted-nodes`
- `data-vni-bundle-id`
- `data-vni-profile-id`
- `data-vni-asset-scale`
- `data-vni-profile-purpose`
- `data-vni-pixel-samples`
- `data-vni-non-background-samples`
- `data-vni-max-pixel-delta`
- `data-vni-pixel-sample-error`

当前也保留 `data-v5g-*` 的 legacy diagnostics alias，用于旧验收脚本兼容；`destroy()` 会清理新旧字段。

## runtime_50 尺寸关系

`runtime_50` 的 PNG 文件像素是 50%，但 JSON 中的 `asset.width` / `asset.height` 仍表示设计逻辑尺寸。`vnicore` 会用 `fileWidth` / `fileHeight` 校验真实贴图，再对 sprite 做显示补偿。缺失或部分填写 `fileWidth` / `fileHeight` / `fileScale` 会失败。

## 常见显式失败

- asset URL manifest 缺少 `asset.path`。
- 贴图真实尺寸与 `fileWidth` / `fileHeight` 不一致。
- manifest entry 与 project `exportProfile` 不一致。
- 未知 animation/easing/blend mode。
- 必需 numeric param 缺失、`NaN`、`Infinity` 或被写成字符串。
- 非法 `layerGroups`、未知 `groupId`、非连续 group run、反向或非相邻 group slot。
- group layer、非空 `parentId`、非空 keyframes、非空 top-level `project.particles`。

## 新动画类型

- `idle`: 只提供 animation coverage，不改变 transform/opacity。
- `shatter`: deterministic render effect。`sourceOpacity` 控制原图透明度，碎片在 `progress <= 0` 不渲染。
- `glow`: deterministic render effect。`keepOriginal === false` 会隐藏原图但保留 glow effect；`blendMode` 使用 `0=add`、`1=screen`、`2=lighten`。
