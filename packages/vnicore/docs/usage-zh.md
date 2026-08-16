# VniCore 使用指南

游戏 runtime 只使用 `data + core`：

```ts
import { assertVNIProject } from "@slotclientengine/vnicore/data";
import { VNIRuntime } from "@slotclientengine/vnicore/core";

const project = assertVNIProject(json);
const runtime = new VNIRuntime({ parent, project, assetUrls });
await runtime.init();
runtime.play();
ticker.add((deltaSeconds) => runtime.update(deltaSeconds));
```

Browser viewer 使用 `data + viewer`：

```ts
import { VNIViewer } from "@slotclientengine/vnicore/viewer";

const viewer = new VNIViewer({
  parent,
  project,
  assetUrls,
  projectId,
  bundleId,
  profileId,
  profilePurpose,
  assetScale,
  viewport,
  diagnosticsElement,
  requestRender,
});
await viewer.init();
viewer.play();
```

不要从包根路径或旧 `./pixi` 导入。不要在 game runtime 中使用 viewer，也不要在 app 复制 core 的 sampling、mask、particle drain、manual transport 或 private Pixi tree 操作。

Core 始终透明，不绘制 `stage.backgroundColor`。缺失 asset、错误 texture size、未知 animation/easing/blend、非法 mask/group/path 和 lifecycle 冲突都会抛错，不做 placeholder 或静默降级。
