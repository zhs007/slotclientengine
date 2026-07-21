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
- 组间插入 UI 的当前 assets 目录全集 asset 下拉、slot 下拉、按钮状态和错误展示。
- 文字层替换 UI 的 layer/模式/文本/asset 输入、按钮状态和错误展示。
- 把 Vite modules 转成 `AssetUrlManifest`。
- 浏览器验收时读取 diagnostics。

## 进入 vnicore 的职责

- VNI/V5G 类型 alias。
- export JSON 和 bundle manifest 校验。
- profile-scoped asset URL resolver。
- center-coordinate 到 Pixi coordinate 的转换。
- animation、VNI_0.074 `multi_move`、VNI_0.087 basic tracks / `bounce_jump` / 新旧 rotate / pressure `visualRotation`、VNI_0.095 `card_carousel_3d` 五阶段/sequence modulo/切片几何/深度顺序与 pool/cache 生命周期、结束位移持续采样、空帧隐藏、sequence frame、particle、`particle_stream`、`chaser_light`、VNI_0.070 deterministic effects、mask、project sampler，以及独立的 `safe_glow` 同图副本高亮 sampler。viewer 只展示 summary 并调用公共播放/viewport API，不解析 CardCarousel 参数或操作其 Pixi tree。
- layer group schema 规范化、连续 group run 判断和相邻 slot 计算。
- Pixi texture 加载、真实尺寸校验和 `runtime_50` 显示补偿。
- `VNIPlayer` 的 RAF 播放、range、segmented 三段式状态机、live 粒子排空、sequence texture 切换、safe glow overlay 渲染、VNI_0.070 deterministic effect sprite/slice/line 池化渲染、mask、文字层绑定、走马灯、marker、complete listener、group slot 挂接、destroy 清理和 diagnostics。

viewer 不能维护自己的 segmented playback 状态机；它只能调用 `play({ mode: "segmented", ... })` 和 `requestSegmentedPlaybackEnd()`。
viewer 不能复制走马灯采样逻辑或用私有 Pixi tree 调整灯位；`chaser_light` 的固定灯位和亮灭推进必须来自 `VNIPlayer`。
viewer 不能复制 `sequence` 切帧、`multi_move` `pointsJson` 解析、结束位移采样、空帧 visibility 判断或 VNI_0.070 新增 deterministic effect 算法；上传 zip 中缺 sequence frame、非法 `pointsJson` 或 effect 必需参数时必须让 vnicore 校验显式失败。
viewer 也不能复制 basic track、bounce/rotate 公式或读取 pressure rotation 的内层 Pixi 节点；summary 只能展示已启用轨道和点数。
viewer 也不能直接操作 `VNIPlayer` 内部 Pixi tree、layer instance、group container 或 slot container；组间插入只能调用 `getLayerGroupSlots()`、`attachNodeBetweenLayerGroups(...)`、`attachImageBetweenLayerGroups(...)`、`attachExternalImageBetweenLayerGroups(...)`、`detachMountedNode(...)` 或 `clearMountedNodes()`。
文字层替换只能调用 `attachNodeToTextLayer(...)`、`attachTextToTextLayer(...)`、`attachImageToTextLayer(...)` 和返回的 dispose/setText 句柄；viewer 不应直接读取或修改 text layer wrapper、原始 Text child 或其它 runtime 私有 display object。

## Cocos runtime 边界

`packages/anieditorv5runtime-cc` 只作为纯校验/纯采样差异审计参考。`vnicore` 不依赖 `cc`、不包含 Cocos Component、不同步 standalone zip，也不改变 Pixi player 的 RAF 模型。

如果未来要同步 Cocos runtime 的某个纯算法修正，必须先证明它适用于 Pixi viewer，再加 vnicore 测试；不要为了 Cocos 交付约束修改 Pixi public API。
