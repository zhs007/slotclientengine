# VniCore 分层迁移

旧入口迁移如下：

| 旧 API                                                | 新 API                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| 包根的 schema/validation                              | `@slotclientengine/vnicore/data`                            |
| `@slotclientengine/vnicore/core` 的 schema/validation | `@slotclientengine/vnicore/data`                            |
| `@slotclientengine/vnicore/pixi` 的 `VNIPlayer`       | game 使用 `core/VNIRuntime`；viewer 使用 `viewer/VNIViewer` |
| `VNIPlayerPoolManager`                                | `VNIRuntimePoolManager` 或 `VNIViewerPoolManager`           |

Game adapter 删除 `projectId`、bundle/profile metadata、diagnostics、viewport、`autoTick` 和 `fitPadding` 构造项，改由宿主 ticker 调用 `runtime.update(deltaSeconds)`。

Viewer adapter 保留这些 UI/展示参数，但构造 `VNIViewer`。Viewer 不访问内部 layer/group container，不复制 manual transport、carousel、particle 或 stopping plan。

迁移是显式破坏性切换：没有 root re-export、旧 `./pixi` alias 或静默 fallback。
