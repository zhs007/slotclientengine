# spine2pixiani-demo 调试交互增强任务报告

## 1. 任务概述

本次在 `apps/spine2pixiani-demo` 上实现了面向 Spine 数据排查的调试交互层，完成了以下目标：

- 页面从双栏升级为三栏布局：左侧控制区、中间舞台区、右侧节点树区。
- 新增 `Select` / `Pan` 鼠标模式切换。
- 支持拖拽平移视角与滚轮缩放场景。
- 支持从舞台点击 bone 调试标记进行选中。
- 支持从右侧树选择 bone 或 slot，并与舞台高亮同步。
- 新增纯函数测试，覆盖节点树构建和视口缩放逻辑。

## 2. 实现结果

### 页面与交互

- 左侧控制面板扩展了鼠标模式、选中节点信息、缩放比例展示。
- 中间舞台使用 `viewportRoot -> sceneRoot -> CabinAnimationEntity` 的层级，将运行时视口缩放和平移与业务默认摆位解耦。
- 右侧新增节点树面板，显示 bone 层级及其 slot 归属，并支持点击选中。

### 场景调试能力

- 在 `CabinScene` 中为每个 bone 注入了可点击调试标记。
- 选中 bone 时，舞台上对应标记会高亮。
- 选中 slot 时，右侧树会高亮该 slot，同时舞台高亮其所属 bone，便于定位挂点归属。
- 动画切换 `cabin / cabin_s` 后，节点树与调试状态仍可继续使用。

### 纯函数与测试

- 新增 `src/runtime/debug-tree.ts`，从 `SpineModel` 派生稳定的调试树结构与节点索引。
- 新增 `src/runtime/viewport-controller.ts`，封装平移与按锚点缩放的状态计算。
- 新增测试：
  - `tests/runtime/debug-tree.test.ts`
  - `tests/runtime/viewport-controller.test.ts`

## 3. 验证结果

已执行以下命令并通过：

- `pnpm --filter spine2pixiani-demo lint`
- `pnpm --filter spine2pixiani-demo test`
- `pnpm --filter spine2pixiani-demo typecheck`
- `pnpm --filter spine2pixiani-demo build`

其中测试结果为 6 个测试文件、10 个测试用例全部通过。

## 4. 关键实现说明

- 视口缩放采用“以鼠标指针为锚点”的实现，而非固定舞台中心，因此放大细节时定位更直接。
- 首版舞台点击优先覆盖 bone 调试标记，未直接实现 slot 精确命中，避免把复杂的 attachment 包围盒或像素命中逻辑提前引入。
- 节点树直接从 `SpineModel` 派生，不依赖 DisplayObject 反推，因此不会随动画播放抖动。

## 5. 遗留项与后续建议

- 若后续需要更强的排查能力，可以继续补：
  - slot 世界包围盒命中
  - 树节点折叠/搜索
  - 选中节点的更多姿态信息展示，例如世界坐标、旋转、缩放
- 当前实现没有修改仓库协作规则、目录规范或基础脚本，因此无需更新根级 `agents.md`。