# 从 anieditorv5viewer runtime 迁移到 vnicore

本次迁移把 `apps/anieditorv5viewer/src/runtime/*` 中已验证的 Pixi runtime 抽到 `packages/vnicore`。viewer 只保留 app shell、Vite 资源导入、项目列表、控件和样式。

## import 对照

| 旧路径                              | 新路径                                          |
| ----------------------------------- | ----------------------------------------------- |
| `src/v5g/types`                     | `@slotclientengine/vnicore/core`                |
| `src/runtime/validation`            | `@slotclientengine/vnicore/core`                |
| `src/runtime/coordinates`           | `@slotclientengine/vnicore/core`                |
| `src/runtime/animation-sampler`     | `@slotclientengine/vnicore/core`                |
| `src/runtime/particle-sampler`      | `@slotclientengine/vnicore/core`                |
| `src/runtime/project-sampler`       | `@slotclientengine/vnicore/core`                |
| `src/runtime/asset-manifest` 纯函数 | `@slotclientengine/vnicore/core`                |
| `src/runtime/v5g-player`            | `@slotclientengine/vnicore/pixi` 的 `VNIPlayer` |

## 留在 viewer 的职责

- `import.meta.glob` 导入内置 assets。
- bundled project list、label、默认项目和 selector。
- 页面 controls、styles、fatal error UI。
- 高级播放 UI 的输入校验、按钮状态和 phase 展示。
- 把 Vite modules 转成 `AssetUrlManifest`。
- 浏览器验收时读取 diagnostics。

## 进入 vnicore 的职责

- VNI/V5G 类型 alias。
- export JSON 和 bundle manifest 校验。
- profile-scoped asset URL resolver。
- center-coordinate 到 Pixi coordinate 的转换。
- animation、particle、project sampler。
- Pixi texture 加载、真实尺寸校验和 `runtime_50` 显示补偿。
- `VNIPlayer` 的 RAF 播放、range、segmented 三段式状态机、live 粒子排空、marker、complete listener、destroy 清理和 diagnostics。

viewer 不能维护自己的 segmented playback 状态机；它只能调用 `play({ mode: "segmented", ... })` 和 `requestSegmentedPlaybackEnd()`。

## Cocos runtime 边界

`packages/anieditorv5runtime-cc` 只作为纯校验/纯采样差异审计参考。`vnicore` 不依赖 `cc`、不包含 Cocos Component、不同步 standalone zip，也不改变 Pixi player 的 RAF 模型。

如果未来要同步 Cocos runtime 的某个纯算法修正，必须先证明它适用于 Pixi viewer，再加 vnicore 测试；不要为了 Cocos 交付约束修改 Pixi public API。
