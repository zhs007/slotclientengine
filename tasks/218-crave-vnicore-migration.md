# Task 218 Crave 迁移说明

Task 218 改变了 `@slotclientengine/vnicore` 的 public subpath。按用户要求，本任务没有修改 Crave 仓库代码；以下内容由 Crave 维护者在其仓库执行。

## 需要检查的旧用法

```bash
rg -n '@slotclientengine/vnicore(?:"|/pixi|/core)|VNIPlayer' .
```

只安装 workspace dependency 的 `package.json` 不需要改；需要迁移的是源码 import、Vite alias、测试 mock 和直接构造 player 的代码。

## Import 映射

| 旧用法                                           | 新用法                                            |
| ------------------------------------------------ | ------------------------------------------------- |
| 包根导入 schema、validation、asset manifest      | `@slotclientengine/vnicore/data`                  |
| `./core` 导入 schema、validation、asset manifest | `@slotclientengine/vnicore/data`                  |
| `./pixi` 的 `VNIPlayer`，由游戏 ticker 推进      | `@slotclientengine/vnicore/core` 的 `VNIRuntime`  |
| `./pixi` 的 `VNIPlayer`，独立 browser preview    | `@slotclientengine/vnicore/viewer` 的 `VNIViewer` |
| `VNIPlayerPoolManager`，游戏内 pool              | `VNIRuntimePoolManager`                           |
| `VNIPlayerPoolManager`，viewer target preview    | `VNIViewerPoolManager`                            |

不要添加 Crave 本地 compatibility barrel、旧路径 alias 或 fallback；这会重新制造 task 218 删除的双重 public contract。

## 游戏 runtime 构造变化

```ts
const runtime = new VNIRuntime({
  parent,
  project,
  assetUrls,
});
await runtime.init();
```

删除旧构造项：`projectId`、`bundleId`、`profileId`、`profilePurpose`、`assetScale`、`diagnosticsElement`、`viewport`、`viewportScale`、`requestRender`、`autoTick`、`fitPadding` 和 UI callbacks。

Crave 的游戏 ticker 每帧调用一次 `runtime.update(deltaSeconds)`。不要启动第二个 RAF，也不要从 `getPlaybackState()` 复制整份状态到 hot path；循环检测优先使用 `getLoopIndex()`，继续推进判断使用 `needsUpdate()`。

## Viewer 构造变化

独立预览工具改为 `VNIViewer`，原 viewport、zoom、diagnostics、profile metadata 和 render callback 可继续传入。Viewer 组合 core 并负责 RAF；不要由外层再重复推进同一个 viewer。

## Crave 定向验收

1. Crave package typecheck/build，确认不存在旧 subpath 或 `VNIPlayer` import。
2. 游戏内 VNI 动画由现有 ticker 推进，复验 once/loop、particle drain、complete、mask 和 destroy。
3. 如果 Crave 含独立 preview，复验 resize/zoom、diagnostics、重复 load/unload 和 RAF/listener 清理。

若 Crave 只通过已迁移的 `@slotclientengine/rendercore` 间接使用 VniCore，源码通常不需要改；仍应运行上述搜索确认没有隐藏的直接依赖。
