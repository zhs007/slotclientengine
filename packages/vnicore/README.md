# @slotclientengine/vnicore

VNI Pixi.js v8 runtime，按职责提供三个显式入口：

```ts
import { assertVNIProject } from "@slotclientengine/vnicore/data";
import { VNIRuntime } from "@slotclientengine/vnicore/core";
import { VNIViewer } from "@slotclientengine/vnicore/viewer";
```

包根路径和旧 `./pixi` 路径不再导出。新代码必须选择具体层级。

## 分层

- `data`：VNI schema、类型、严格校验、bundle/profile 校验、asset URL manifest、路径重写和 layer-group 数据合同；不依赖 Pixi。
- `core`：给 game runtime 使用的透明 Pixi display tree、采样、mask、particle、manual transport、挂接 API 和 runtime pool。宿主持有 ticker，并调用 `update(deltaSeconds)`。
- `viewer`：组合 `VNIRuntime`，提供 RAF、viewport/zoom、DOM diagnostics、UI 回调和 viewer preview pool，供 `apps/anieditorv5viewer` 使用。

`VNIRuntimeOptions` 只包含 `parent`、`project` 和 `assetUrls`。Core 不创建 `PIXI.Application`、renderer、canvas、DOM、RAF，也不拥有 viewport。`VNIViewerOptions` 才接受 diagnostics、viewport、render callback 和 profile 展示元数据。

## Core 使用

```ts
const runtime = new VNIRuntime({ parent, project, assetUrls });
await runtime.init();
runtime.playRange({
  range: { unit: "time", start: 0, end: 1 },
  loop: false,
});
hostTicker.add((deltaSeconds) => runtime.update(deltaSeconds));
```

Core 对未知 schema、animation、asset、mask、路径、texture size 和 lifecycle 状态显式失败。`stage.backgroundColor` 仅是数据元信息，runtime 始终透明。Loaded clone 只共享只读 texture；project、transport、particle、listener 和 display tree 均独立。

## Viewer 使用

```ts
const viewer = new VNIViewer({
  parent,
  project,
  assetUrls,
  projectId,
  bundleId,
  profileId,
  profilePurpose,
  assetScale,
  diagnosticsElement,
  viewport,
  requestRender,
});
await viewer.init();
viewer.play();
```

Viewer 不复制采样、particle drain、segmented/manual transport 或 private Pixi tree 操作；这些仍由 core 负责。

## 支持能力

严格支持当前 VNI/V5G schema 家族、basic tracks、`multi_move`、sequence、particle、deterministic effects、`safe_glow`、`chaser_light`、`card_carousel_3d`、mask/light precompose、range/segmented/manual playback、cyclic selection、layer-group slot、text/image replacement 和 bounded runtime pool。详细合同以 validation、fixtures 和测试为准。

## 验收命令

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
```

更多说明见 [中文使用](./docs/usage-zh.md)、[English usage](./docs/usage-en.md)、[API](./docs/api-zh.md) 和 [迁移指南](./docs/migration-from-viewer-zh.md)。
