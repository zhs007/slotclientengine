# vnicore 使用说明

## 手工连续周期选择

高级宿主流程参见 `examples/manual-cyclic-playback.ts`：创建唯一 manual session，通过稳定 `layerId/animationId` 获取 `cyclic-selection` controller；播放 intro 一次；hold 主时间轴并启动 `idle` continuous phase；用户操作和服务器等待期间由 RAF 或宿主 `update(deltaSeconds)` 继续累计真实相位；提交 selected item 并等待 safe replacement committed；最后 release hold、启动 resolve 并播放 ending。

不启用 manual session 时，原 full-demo、range、segmented 和粒子排空行为保持不变。编辑器和 VNI JSON schema 不需要为该能力新增字段。

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

- `parent`: 一个由宿主 Pixi app 或游戏 renderer 持有的 `PIXI.Container`。
- `project`: 已通过 `assertVNIProject` / `validateVNIProject` 的导出 JSON。
- `assetUrls`: `AssetUrlManifest`，key 必须是导出 JSON 里的 `asset.path`。

```ts
import { Application } from "pixi.js";
import {
  assertVNIProject,
  resolveProjectAssetUrls,
  validateVNIProject,
} from "@slotclientengine/vnicore/core";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";

const app = new Application();
await app.init({ backgroundAlpha: 0, autoStart: false });
document.querySelector("#stage")?.appendChild(app.canvas);

const project = assertVNIProject(projectJson);
validateVNIProject(project);

const player = new VNIPlayer({
  parent: app.stage,
  diagnosticsElement: document.querySelector("#stage") ?? undefined,
  viewport: { width: app.renderer.width, height: app.renderer.height },
  requestRender: () => app.render(),
  projectId: "roundreel",
  bundleId: "legacy",
  profileId: "runtime_100",
  profilePurpose: "runtime",
  assetScale: 1,
  project,
  assetUrls: resolveProjectAssetUrls(project, manifest),
});

await player.init();
player.play();
```

`VNIPlayer` 不创建自己的 `PIXI.Application`、renderer、canvas 或 DOM 节点；viewer、game runtime 或测试宿主必须自己持有这些外层对象。游戏内嵌场景通常传 `autoTick: false`，由主 ticker 调用 `update(deltaSeconds)`，并把 player 的 display tree 直接挂进同一个 Pixi renderer。

运行时不会绘制导出 JSON 的 `stage.backgroundColor`。如果黑底 JPG 或 RGB PNG 光效图的所有 image layer 用法都属于 `add` / `screen` / `lighten`，并且解码后的像素没有有效 alpha，`VNIPlayer` 会在加载时派生一张透明 matte texture，避免透明宿主 canvas 上出现黑框；这不是播放 canvas，也不会改写原始资源文件。已有透明 alpha 的 PNG、被 normal layer 复用的图片不会走 matte 派生。

`sequence` layer 使用 `sequence.frameAssetIds`、`cycleDuration` 和 `loop` 显式切帧。它和 image layer 一样是 texture-backed layer，runtime 在同一个 Pixi sprite 上切换当前帧 texture；mask、粒子和新增 deterministic effects 都基于当前帧资源计算。`assetId` 必须为 `null`，缺帧、缺资源、非 image frame 或非法 `cycleDuration/loop` 都会显式失败。

VNI_0.074 `multi_move` 使用 `params.pointsJson` 承载多段位移点。runtime 只接受合法 JSON string 数组，每个点必须有 finite number 的 `x/y/time` 和受支持的 `easing`；每段使用到达点 easing，`backOut` 等超调不会被 clamp。`move` / `multi_move` / `slide_in` / `slide_out` / `squash_stretch` 结束后仍以 progress 1 继续参与 transform 累加，供后续动画接力；visibility 单独判断，所以两个 enabled animation 之间的空帧仍会隐藏。

VNI_0.087 `basicAnimation` 提供 opacity、positionX/Y、scaleX/Y、rotation 六条独立轨道。runtime 先采样 basic track，再把结果交给 preset/particle animation stack；每段采用右侧到达点的 easing，首点前和末点后保持端点，`backOut` 超调不会被截断。`bounce_jump` 只在自身闭区间内应用蓄力、主跳、顶点压缩、落地和衰减反弹。新版 `rotate` 使用 `turns/direction/accelRatio/decelRatio/pressure/pressureStretch`，旧版 `fromRotation/toRotation` 仍明确兼容；pressure 大于阈值时外层只压缩，内容在稳定内层容器中旋转。宿主不得操作该内层容器或复制采样器。非空 legacy `keyframes` 继续显式失败。

VNI_0.095 `card_carousel_3d` 只允许挂在 image/sequence layer。所有参数、phase duration 和 `targetIndex < cardCount` 都必须通过严格校验；runtime 不用 editor 默认值修补坏 JSON。sequence 的全部 `frameAssetIds` 是卡片贴图库，按逻辑 card index 循环取图；当前 sequence 播放帧不会缩小这份贴图库。卡片容器、竖切片 sprite 和 frame-view texture 在初始化边界池化，seek/restart/loop 只更新状态，`destroy()` 释放 owned view 而不销毁共享 source texture。

standalone viewer 需要缩放时，保持 renderer 和 `setViewportSize()` 为真实 mount 尺寸，仅调用 `setViewportScale(0.1)` 等比例缩放 display tree。不要通过缩小 viewport 或 canvas 来模拟 zoom，否则 runtime 裁剪边界也会缩小。

## 生命周期

- `init()`: 加载贴图、校验真实 texture size，把 VNI display tree 挂到宿主 `parent`，初始化 layer 和 particle 容器。
- `play()`: 使用 RAF 自动推进普通时间轴；无参数旧行为保持不变。
- `pause()`: 暂停用户播放，冻结主时间轴和 live 粒子年龄，不清空 range、marker 或 complete listener。
- `restart()`: 清空 active range、segmented 状态和 live 粒子，回到 0 秒。
- `seek(time)`: 退出 range/segmented live playback，清空 live 粒子状态，并按指定时间做确定性预览；不会触发 marker。
- `setLoop(loop)` / `getLoop()`: 控制普通播放和未显式传 `loop` 的 range 播放。
- `destroy()`: 停止 RAF、清理 mounted nodes、safe glow overlays、render effects、particles、diagnostics、marker 和 complete listener，并从宿主 parent 移除和销毁 VNI 自己的 display tree；不会销毁宿主 Pixi app、renderer 或 canvas。

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

## 文字层替换

text layer 是 runtime placeholder。宿主可以把它替换成 Pixi 节点、动态文本或图片；替换节点作为 text layer wrapper 的 child，会继承该层 transform、scale、rotation、opacity、visible、blendMode、render order 和播放生命周期。

```ts
const binding = player.attachTextToTextLayer({
  id: "score-text",
  layerId: "layer_text_score",
  text: "$1,234.00",
});

binding.setText("$2,468.00");
binding.dispose();
```

图片替换可以使用当前 project asset，也可以使用宿主显式 URL：

```ts
const disposeImage = await player.attachImageToTextLayer({
  id: "score-image",
  layerId: "layer_text_score",
  assetId: "asset_number_sprite",
});

disposeImage();
```

`layerId` 不是 text layer、重复 mounted id、project asset 不存在或外部 URL 加载失败都会显式失败。默认会隐藏原始文字；需要保留原文字时传 `hideOriginal: false`。`clearMountedNodes()` 和 `destroy()` 会清理文字层替换节点。

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

如果传入 `diagnosticsElement`，播放器会在它的 `dataset` 写入：

- `data-vni-project-id`
- `data-vni-time`
- `data-vni-visible-layers`
- `data-vni-particle-sprites`
- `data-vni-render-effect-sprites`
- `data-vni-deterministic-effect-sprites`
- `data-vni-safe-glow-sprites`
- `data-vni-chaser-light-sprites`
- `data-vni-mask-sprites`
- `data-vni-text-layer-bindings`
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

`data-vni-safe-glow-sprites` 只统计 `safe_glow` 的同图副本；副本继承当前 layer 的 `blendMode`，但仍不进入旧 render effect 统计。`data-vni-render-effect-sprites` 只统计旧 `shatter` / `glow` render effect。`data-vni-deterministic-effect-sprites` 统计 VNI_0.070 新增效果生成的 sprite / slice / line sample，三类不会混计。

当前也保留 `data-v5g-*` 的 legacy diagnostics alias，用于旧验收脚本兼容；`destroy()` 会清理新旧字段。

## runtime_50 尺寸关系

`runtime_50` 的 PNG 文件像素是 50%，但 JSON 中的 `asset.width` / `asset.height` 仍表示设计逻辑尺寸。`vnicore` 会用 `fileWidth` / `fileHeight` 校验真实贴图，再对 sprite 做显示补偿。`runtime_100` 是合法运行包，`assetScale` 为 `1` 时也不会跳过 `exportProfile` 和资源校验。profile id、purpose 和 assetScale 来自 JSON 的 `exportProfile`，不是从目录名或文件名推断。缺失或部分填写 `fileWidth` / `fileHeight` / `fileScale` 会失败。

## 常见显式失败

- asset URL manifest 缺少 `asset.path`。
- 贴图真实尺寸与 `fileWidth` / `fileHeight` 不一致。
- manifest entry 与 project `exportProfile` 不一致。
- 未知 animation/easing/blend mode。
- 非法 `sequence` layer：`assetId` 非空、缺 `sequence`、空 `frameAssetIds`、缺 frame asset、frame 不是 image、`cycleDuration` 非正数或 `loop` 非 boolean。
- 非法 `multi_move`：缺 `pointsJson`、非法 JSON、非数组、少于两个点、非 finite 数字点、坐标越界、time 越过 animation duration 或未知 easing。
- 必需 numeric param 缺失、`NaN`、`Infinity` 或被写成字符串。
- 非法 mask source、mask source 指向自身、未知 mask mode/compositeMode。
- 非法 `layerGroups`、未知 `groupId`、非连续 group run、反向或非相邻 group slot。
- group layer、非空 `parentId`、非空 keyframes、非空 top-level `project.particles`。

## 新动画类型

- `idle`: 只提供 animation coverage，不改变 transform/opacity。
- `multi_move`: VNI_0.074 多段位移，使用 `pointsJson` 严格声明位移点；每段使用到达点 easing，结束后保持最后点用于后续 transform 接力。
- 所有 layer animation 的覆盖区间都是首尾帧闭区间：`time === startTime` 有效，`time === startTime + duration` 也有效；只有超过 end 的时间才视为 inactive。结束后的 `move` / `multi_move` / `slide_in` / `slide_out` / `squash_stretch` transform 会继续累加，但空档 visibility 仍按 active coverage 隐藏。
- `shatter`: deterministic render effect。`sourceOpacity` 控制原图透明度，碎片采样由 timeline progress 决定。
- `glow`: deterministic render effect。`keepOriginal === false` 会隐藏原图但保留 glow effect；`blendMode` 使用 `0=add`、`1=screen`、`2=lighten`。
- `safe_glow`: 跨引擎安全发光方案。它不是 render effect，也不使用滤镜或模糊；runtime 用同一张图片的副本，通过 `spread` 放大、`minOpacity/maxOpacity/pulses` 透明度呼吸来模拟高亮，副本继承当前 layer 的 `blendMode`。`keepOriginal === false` 会隐藏原图，但 safe glow 副本仍会渲染；起始帧即可采样出副本。
- `particle_stream`: 持续发射粒子。runtime 会按 `lifetime` 决定排空时间，segmented hold 下 `keepParticlesAlive=true` 时 emitter 配置停在 hold 点但 live elapsed 继续推进，粒子不会冻结。
- `chaser_light`: 走马灯 runtime effect。灯位固定在圆形、直线或曲线轨迹采样点上，动画只推进亮灯/暗灯窗口，不让 sprite 沿轨迹移动或整体旋转。圆形轨迹中 `spacing` 按弧长换算角度；每盏灯的亮灭错位由 `lightDuration + interval` 共同决定。它由 `vnicore` sampler/Pixi renderer 负责，viewer 只显示结果；`keepOriginal === false` 会隐藏源图但走马灯继续渲染。
- `gather_particles` / `smoke_mist` / `energy_ring` / `slash_light` / `flame_flicker` / `wave_band` / `wave_distort` / `speed_lines` / `drift_fall` / `path_particles`: VNI_0.070 新增 deterministic effects，支持 image/sequence layer，不支持 text layer。`sourceOpacity` 或 `keepOriginal` 控制源图是否保留，effect 输出由 `vnicore` sampler/Pixi renderer 统一生成；viewer 不复制公式或直接操作 runtime 私有 display tree。
- `flame_flicker.speed`、`wave_distort.speed` 和 `drift_fall.fallSpeed` 只作为对应旧导出的显式兼容字段读取；其它缺失或拼错字段不会兜底。

## Mask

`vnicore` 是 Pixi.js runtime 目标，不播放 Cocos-compatible `legacy_alpha` 导出。项目级 `maskCompositeMode: "legacy_alpha"` 或启用的 `legacy_alpha` layer mask 会显式失败，导出给 vnicore/viewer 的项目应使用 `precompose_light_alpha`。

`layer.mask` 启用时必须声明合法 `sourceLayerId`，不能指向自身，不能缺 source。`showSourceLayer=false` 只隐藏普通 source layer，不会让 mask source 失效。`precompose_light_alpha` 在 image source/target 且 target 为 `add` / `screen` / `lighten` 时按编辑器 Pixi 预览做光效预合成：使用 stage 尺寸 canvas，按 layer transform 绘制 target/source，再用 target luminance、target alpha、mask source alpha 和 mask opacity 计算输出 alpha。runtime 会用 stage、asset、texture、transform、opacity 和 blendMode 组成 dirty/cache key，输入不变不会每帧重建 texture；非 light blendMode 仍走普通 Pixi alpha mask。

`glow` 和 `safe_glow` 的关键区别：`glow` 是旧 deterministic render effect，使用自己的 effect 采样和统计；`safe_glow` 是普通 sprite overlay，继承 layer blendMode，适合跨 Pixi 和 Cocos 等运行时复现。
