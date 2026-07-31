# 143 Popup Editor VNI 文字层 ImgNumber 执行报告

## 结论

已实现 Popup Editor 为每档 ImgNumber 显式选择同档 VNI 的文字层作为父节点。VNI 与
ImgNumber 仍是两个独立 Popup 图层；选择文字层后，ImgNumber 挂入 VNI text layer，继承
其动画与渲染顺序，原有 `x/y/scale/anchor` 继续作为相对该父节点的微调值。

## 实施内容

- `rendercore/popup`：增加 `PopupImageStringParent` 判别合同；旧 v1 未提供 `parent` 时
  canonical 为 `popup-root`。parser 校验 VNI 父 layer 必须位于同一档位；资源 prepare
  校验目标 VNI project 的 exact layer id 存在且为 `text`。
- award player：复用既有 `VNIPlayer.attachNodeToTextLayer`，给每个 VNI 父档创建稳定的
  空 mount container。档位切换会把共享 ImgNumber 放入当前档的 mount；旧档 end drain
  期间原文字保持隐藏。prepare、detach 与 destroy 均处理 mount disposer；attach 失败时
  立即销毁尚未挂载的 container。
- Popup Editor：从已校验的 VNI project 枚举同档文字层，ImgNumber 新增“父节点”选择框。
  无自动选择；候选失效、VNI 解析失败或引用不存在均通过 diagnostics 显式报错。新建
  ImgNumber 默认父节点为 Popup 根节点。
- 文档：更新 Popup manifest、rendercore 和 Popup Editor README。
- 自动化：覆盖旧配置 root 兼容、合法/非法 binding、VNI mount 与 disposer、资源 prepare
  的 exact text layer 校验，以及编辑器文字层枚举和新建默认值。

## 验收

以下均在 Node 24、`CI=true` 下通过：

- `pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck`
- `pnpm --filter @slotclientengine/rendercore --filter popupeditor test`：rendercore 73 files /
  577 tests；popupeditor 4 files / 17 tests。
- `pnpm --filter @slotclientengine/rendercore build`
- `pnpm --filter popupeditor build`
- `pnpm --filter @slotclientengine/rendercore --filter popupeditor lint`
- `git diff --check`

Popup Editor production build 完成；仅有既有 bundle 大小提示，未产生错误。

未执行真实 Pixi 浏览器人工视觉验收：当前任务未提供可编辑的实际美术 Popup/VNI 包。后续
美术导入包后，应在 Popup Editor 选择文字层，确认开始、loop、档位切换与 end drain 中
ImgNumber 始终跟随目标文字层，且原占位文字不闪现。
