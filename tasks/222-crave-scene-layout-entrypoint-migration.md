# Task 222 Crave Scene Layout 迁移说明

Task 222 将 RenderCore Scene Layout 的混合公开入口拆为 `data`、`core`、`editor`。按约定，本任务没有修改 Crave 项目的源码、配置或资源；以下步骤由 Crave 维护者手动执行并在浏览器中验收。

## 1. 搜索旧入口

在 Crave 仓库根目录执行：

```bash
rg -n '@slotclientengine/rendercore(/scene-layout)?|scene-layout/index|SceneLayout(GameModeSnapshot|PackageRuntime|PackageResource)' .
```

重点检查源码 import、Vite/Vitest alias、测试 mock 与内部 compatibility barrel。不要保留旧路径 alias 或新增 Crave 本地兼容层。

## 2. Import 分类

| 使用目的                                                                                                     | 新入口                                             |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| manifest v1/v2/v3 type、strict parser、latest upgrader、runtime allocation、frame/geometry/reference helper  | `@slotclientengine/rendercore/scene-layout/data`   |
| 游戏内 package resource/runtime、presentation surface、node/layer/point、reel、Popup/transition 命令         | `@slotclientengine/rendercore/scene-layout/core`   |
| mapped production ZIP import/export/inspection、authoring/standalone viewer、完整 runtime inspector snapshot | `@slotclientengine/rendercore/scene-layout/editor` |

旧 `@slotclientengine/rendercore/scene-layout` 已删除。原先从 `@slotclientengine/rendercore` 根入口导入的 `createSceneLayout*`、`loadSceneLayout*` 和 `SceneLayout*` 类型也必须按上表迁走；非 Scene Layout 的 reel/symbol/presentation 通用能力仍保留其原入口。

## 3. 游戏 runtime 调整

- 每帧仍只由 Crave 已有 ticker 调用一次 `runtime.update(deltaSeconds)`；不要创建第二个 Application、canvas、ticker 或 RAF。
- 只判断当前稳定 mode 时使用 `runtime.getStableGameMode()`；只判断是否正在切换时使用 `runtime.getGameModePhase()`。
- 不要在稳定帧或业务分支反复调用 `getGameModeSnapshot()`。完整 mode snapshot 仅供 editor/diagnostic UI，通过 `createSceneLayoutPackageRuntimeInspector(runtime)` 读取。
- `getGameModeIds()` 返回 runtime 生命周期内稳定的只读数组；调用方不得修改。
- package runtime 继续拥有传入 package resource，并在 `destroy()` 时释放；Crave 不应再单独 destroy 同一 resource。

示例：

```ts
import {
  createSceneLayoutPackageRuntime,
  type SceneLayoutPackageResource,
} from "@slotclientengine/rendercore/scene-layout/core";

const runtime = createSceneLayoutPackageRuntime({ resource });
await runtime.init();

if (runtime.getStableGameMode() === "FreeGame") {
  // Crave 业务分支
}
```

## 4. Vite/Vitest alias

如果 Crave 将 workspace package alias 到源码，必须为实际使用的 subpath 添加比根 alias 更靠前的精确规则：

```ts
{
  find: "@slotclientengine/rendercore/scene-layout/data",
  replacement: resolve(repoRoot, "packages/rendercore/src/scene-layout/data/index.ts"),
},
{
  find: "@slotclientengine/rendercore/scene-layout/core",
  replacement: resolve(repoRoot, "packages/rendercore/src/scene-layout/core/index.ts"),
},
{
  find: "@slotclientengine/rendercore/scene-layout/editor",
  replacement: resolve(repoRoot, "packages/rendercore/src/scene-layout/editor/index.ts"),
},
```

游戏 bundle 通常不应出现 `editor` alias。测试 mock 的模块字符串必须与生产源码的新 subpath 完全一致。

## 5. Crave 手工验收

1. 运行 Crave 自身 typecheck、定向测试与 production build。
2. 确认 bundle/source search 中游戏路径没有 `scene-layout/editor`、`Application`、第二个 ticker/RAF 或旧 Scene Layout 入口。
3. 浏览器复验 Base/Free 等 mode 切换、Spine/video/prelude Popup、resize/orientation、main reel 与程序 layer。
4. 用 Performance/Memory 复验稳定帧无持续 snapshot 分配，重复进入/退出及 destroy 后无 canvas、listener、ticker、Object URL 或 package resource 残留。

浏览器、Performance 与 Memory 的最终验收结果由 Crave 维护者记录；本仓库的 Task 222 执行报告只记录代码级和自动化验证证据。
