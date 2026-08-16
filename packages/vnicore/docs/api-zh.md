# VniCore API

## 公开入口

- `@slotclientengine/vnicore/data`：`VNI*` 数据类型、`assertVNIProject()`、manifest/profile 校验、asset URL 解析和路径重写。
- `@slotclientengine/vnicore/core`：`VNIRuntime`、manual playback、particle-combo variant 和 core runtime pool。
- `@slotclientengine/vnicore/viewer`：`VNIViewer`、viewer preview pool，以及 viewer 需要的 transport 类型。

包根路径、`./pixi` 和 `V5G*` public alias 均不再提供。

## VNIRuntime

构造参数只有：

```ts
interface VNIRuntimeOptions {
  parent: PIXI.Container;
  project: VNIProjectConfig;
  assetUrls: AssetUrlManifest;
}
```

稳定方法包括 `init()`、`play()`、`pause()`、`restart()`、`seek()`、`playRange()`、`requestSegmentedPlaybackEnd()`、`update(deltaSeconds)`、marker/complete listener、manual playback、group slot/text replacement、`getDisplayObject()`、标量播放状态查询和 `destroy()`。

Core 不启动 RAF。每个 game/runtime 宿主必须从自己的 ticker 调用 `update(deltaSeconds)`。`deltaSeconds` 必须是正有限数；未知或冲突状态显式失败。

`getInspection()` 返回即时只读检查值，仅用于调试或 viewer adapter；game hot path 优先使用 `needsUpdate()`、`getLoopIndex()`、`getPlaybackPhase()`、`getLiveParticleCount()` 等标量查询。

## VNIViewer

`VNIViewer` 组合而非继承 `VNIRuntime`。它额外拥有：

- RAF 调度；
- `setViewportSize()` / `setViewportScale()`；
- DOM `data-vni-*` diagnostics；
- `requestRender`、`onTimeChange`、`onPlayingChange`；
- `VNIViewerPoolManager` 对 pooled core clone 的 viewport 和 RAF 驱动。

`autoTick: false` 只用于 deterministic viewer tests 或已有外层 preview scheduler；它不是 core 选项。

## Ownership

- 宿主持有 Pixi Application、renderer、canvas 和传入的 parent。
- Core 持有自己的 display tree、mutable playback state、particle、listener、派生 texture view 和 cache。
- Project/host source texture 不由 runtime 销毁；runtime 只释放自己创建的派生资源。
- `destroy()` 后所有公开 mutation 显式失败；异步 init/attach 失败不得留下半提交节点。
