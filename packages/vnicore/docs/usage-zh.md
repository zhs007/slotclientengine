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
- `play()`: 使用 RAF 自动推进时间轴。
- `pause()`: 暂停 RAF，不清空 range、marker 或 complete listener。
- `restart()`: 清空 active range 并回到 0 秒。
- `seek(time)`: 采样指定时间并重绘 layer/particle；不会触发 marker。
- `setLoop(loop)` / `getLoop()`: 控制普通播放和未显式传 `loop` 的 range 播放。
- `destroy()`: 停止 RAF、断开 `ResizeObserver`、清理 particles、diagnostics、marker 和 complete listener，并销毁 Pixi app。

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

## Diagnostics

播放器会在 `container.dataset` 写入：

- `data-vni-project-id`
- `data-vni-time`
- `data-vni-visible-layers`
- `data-vni-particle-sprites`
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
- group layer、非空 keyframes、非空 top-level `project.particles`。
