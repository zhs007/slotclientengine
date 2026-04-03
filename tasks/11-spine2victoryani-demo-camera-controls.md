# spine2victoryani-demo 相机拖拽与滚轮缩放任务计划

## 1. 任务目标

为 `apps/spine2victoryani-demo` 增加一套可直接落地的场景观察交互，满足以下需求：

- 鼠标拖动时，像控制摄像机一样平移场景视角。
- 鼠标滚轮时，缩放整个场景。
- 滚轮缩放只有在鼠标位于 Pixi 渲染区内时才生效。
- 为避免误触，只有先点选激活 Pixi 渲染区后，滚轮缩放才生效。

本计划基于仓库当前代码结构编写，执行时不依赖额外口头上下文。

## 2. 当前实现现状

结合当前仓库代码，可确认 `apps/spine2victoryani-demo` 目前具备以下基础：

- `src/main.ts`
  - 创建 Pixi `Application`，设计尺寸固定为 `1280 x 900`。
  - 通过 `computeCanvasLayout()` 只做 canvas 的 DOM 尺寸与居中适配。
  - 当前把 `ExportPreviewPlayer.root` 直接挂到 `app.stage`，尚未建立单独的相机容器层。
  - 已有播放、暂停、重播、循环切换等 UI 与回放逻辑。
- `src/preview/player.ts`
  - `ExportPreviewPlayer.root` 是一个 Pixi `Container`，内部承载所有导出层精灵。
  - 播放逻辑通过更新时间轴采样来修改 layer sprite 的 position、scale、rotation、alpha、visible。
  - 当前实例创建时使用固定 layer 顺序生成 sprite，运行时没有按帧重排绘制顺序。
  - 该类不负责视口交互，适合继续保持“纯播放层”职责。
- `src/runtime/viewport-controller.ts`
  - 已存在 `createViewportState`、`panViewport`、`zoomViewportAtPoint`。
  - 已有 `tests/runtime/viewport-controller.test.ts` 覆盖平移与按锚点缩放、缩放上下限钳制。
  - 说明仓库已经有“纯计算层”的视口状态模块，可优先复用，不建议重复发明一套缩放公式。
- `src/styles.css`
  - `stage` 已是 Pixi canvas 的外层容器。
  - 当前没有渲染区激活态、拖拽态、聚焦态的视觉反馈。

由此可以确定，本次任务重点不是重写播放器，而是：

- 在 `main.ts` 与 Pixi 容器层之间补一层“视口/相机控制接线”。
- 复用现有 `viewport-controller.ts` 做状态计算。
- 给 DOM 渲染区补激活门禁与样式反馈。
- 补回 Spine 导出播放所缺失的“画家算法 / 绘制顺序控制”能力。

## 3. 当前已确认的关键 bug

结合当前导出与播放代码，可以确认一个必须先纳入实现范围的问题：

- `spine-to-victoryani.ts` 当前按 slot 收集 layer，并把父骨骼影响烘焙进每帧世界坐标、旋转、缩放。
- 这意味着“父子变换”并不是完全丢了，而是被拍平成每个 layer 的世界变换结果。
- 但 `preview/player.ts` 当前只在初始化时按固定数组顺序创建 sprite，并未在播放过程中依据 Spine 的 slot draw order 或逐帧层级变化去重排。
- 因此一旦动画里存在：
  - 不同 slot 的前后遮挡切换
  - 同一父骨骼下多个子元素在某些时刻需要换前后关系
  - Spine draw order timeline 改变
  当前播放器就会出现“位置是对的，但遮挡顺序不对”的问题。

结论：

- 本项目不一定要在运行时恢复完整的 Spine 父子节点树。
- 但必须实现可落地的绘制顺序方案。
- 默认方案应采用“导出每帧绘制顺序 + 播放时按画家算法重排 sprite”。

## 4. 需求解释与默认约束

为保证执行时不再反复确认，默认采用以下解释：

- “移动摄像机位置”：
  - 本质是平移场景容器，不修改导出动画数据，不修改 `project.json`。
- “缩放整个 scene”：
  - 缩放对象是承载 `ExportPreviewPlayer.root` 的 Pixi 场景容器，而不是改 canvas 的 CSS 宽高。
- “元素层级不对”：
  - 默认按 Spine slot draw order 缺失处理，而不是误判为必须恢复完整父子容器树。
  - 对导出播放器而言，只要每帧世界变换正确、每帧绘制顺序正确，即可满足画面表现。
- “鼠标在 pixi 渲染区上时，可以点选中 pixi 渲染区才生效”：
  - 必须先点击一次渲染区，使其进入 active 状态。
  - 仅当 active 为 `true` 且滚轮事件来自该渲染区时，才响应缩放。
  - 点击侧边栏、详情面板或页面其他区域后，active 状态应取消。
- 拖拽优先使用 Pointer Events，实现上优先支持鼠标，保留后续扩展到触控的空间。
- resize 时，保留当前用户的视口状态，不在窗口变化后自动重置缩放和平移。
- 缩放默认以指针所在的渲染区坐标为锚点，这样体验更接近“相机缩放到鼠标关注位置”。

## 5. 完成定义

当以下条件全部满足时，视为任务完成：

- 播放端不再依赖固定 layer 数组顺序，能够按导出顺序正确决定 sprite 前后关系。
- 若动画过程中 slot draw order 发生变化，播放结果能随时间正确切换遮挡关系。
- `apps/spine2victoryani-demo` 中新增独立的视口交互接线，且不破坏现有播放功能。
- 鼠标在渲染区按下并拖动时，场景可连续平移。
- 鼠标松开、指针取消、窗口失焦后，拖拽状态都能可靠结束。
- 先点击激活渲染区后，滚轮才会缩放场景；未激活时滚轮不缩放场景。
- 滚轮缩放仅在事件位于 Pixi 渲染区时触发，不影响侧栏滚动或页面其他区域。
- 缩放存在最小值和最大值钳制，场景不会无限缩小或放大。
- resize 后，当前视口缩放与平移状态仍保持一致，不出现明显跳变。
- 新增最小自动化测试，至少覆盖：
  - 绘制顺序 / 画家算法
  - 视口状态应用
  - 激活态门禁
  - 拖拽状态收尾
  - 滚轮缩放边界
- `README.md` 补充交互说明、运行方式与手工验收步骤。
- 任务完成后新增中文任务报告，放在 `tasks/` 下，文件名为 `11-spine2victoryani-demo-camera-controls-[utctime].md`。
  - `utctime` 使用 UTC 时间，格式为 `年月日时分秒`，例如 `260403-081530`。
- 若实际执行只改动 demo 代码、测试和文档，则无需更新根级 `agents.md`；若影响仓库协作规则、目录规范或基础脚本，则必须同步更新。

## 6. 实施范围

本计划默认涉及以下路径：

- `apps/spine2victoryani-demo/src/main.ts`
- `apps/spine2victoryani-demo/src/preview/player.ts`
- `apps/spine2victoryani-demo/src/preview/timeline.ts`
- `apps/spine2victoryani-demo/src/runtime/viewport-controller.ts`
- `apps/spine2victoryani-demo/src/runtime/spine-to-victoryani.ts`
- `apps/spine2victoryani-demo/src/runtime/export-types.ts`
- `apps/spine2victoryani-demo/src/styles.css`
- `apps/spine2victoryani-demo/tests/runtime/viewport-controller.test.ts`
- `apps/spine2victoryani-demo/tests/runtime/spine-to-victoryani.test.ts`
- `apps/spine2victoryani-demo/tests/preview/*`
- `apps/spine2victoryani-demo/README.md`
- `tasks/11-spine2victoryani-demo-camera-controls.md`
- 任务完成后的报告文件 `tasks/11-spine2victoryani-demo-camera-controls-[utctime].md`

若为降低 `main.ts` 复杂度，允许新增局部模块，例如：

- `apps/spine2victoryani-demo/src/preview/viewport-interaction.ts`
- 或 `apps/spine2victoryani-demo/src/runtime/viewport-dom.ts`

前提是职责明确，且不引入共享层改造依赖。

## 7. 推荐实现方案

### 6.1 Pixi 容器分层

建议将当前直接挂到 `app.stage` 的结构调整为三层：

- `app.stage`
  - 只作为 Pixi 根容器。
- `viewportRoot`
  - 承担平移与缩放，是本次“相机容器”。
- `sceneRoot`
  - 挂载 `ExportPreviewPlayer.root`，保持“播放内容层”职责。

建议关系如下：

- `app.stage.addChild(viewportRoot)`
- `viewportRoot.addChild(sceneRoot)`
- `sceneRoot.addChild(player.root)`

这样可以把：

- 播放逻辑留在 `player.root`
- 视口状态集中作用于 `viewportRoot`
- 后续若要加调试层、辅助网格或选框，也更容易继续叠加

### 6.2 绘制顺序方案

需要把“画家算法”作为正式实现项，而不是后补优化。建议采用以下方案：

- 导出阶段：
  - 从 `sampleAnimationPose(...).drawOrder` 读取每一帧 slot 绘制顺序。
  - 为每个导出 layer 记录对应帧的 `drawOrderIndex`。
  - 若某 attachment 当前帧不可见，则仍保留一个稳定的默认顺序值，避免排序结果抖动。
- 数据结构阶段：
  - 扩展导出的 timeline frame 编码，增加绘制顺序字段，例如 `drawOrder` / `zIndex`。
  - 如果不想改基础 layer 结构，可以只在 timeline script 中追加一列。
- 播放阶段：
  - `sampleTimelineLayer()` 返回值里增加 `drawOrder`。
  - `ExportPreviewPlayer.applyTime()` 在每帧更新 sprite transform 后，同步更新 sprite 的 `zIndex`，或按排序值重排子节点。
  - Pixi 层建议启用 `sortableChildren`，减少手写重排复杂度。

核心原则：

- 父子变换继续使用当前“拍平成世界变换”的导出思路。
- 遮挡顺序问题单独通过画家算法解决。
- 不要求为了层级先后而强行恢复完整骨骼树容器结构。

### 6.3 视口状态模型

优先复用 `src/runtime/viewport-controller.ts`，不要另起一套数学逻辑。执行时建议明确以下状态：

- `zoom`
- `minZoom`
- `maxZoom`
- `panX`
- `panY`
- `isActive`
- `isDragging`
- `pointerId`
- `dragStartClientX`
- `dragStartClientY`
- `dragStartPanX`
- `dragStartPanY`

其中：

- 平移与缩放计算继续由 `panViewport` / `zoomViewportAtPoint` 负责。
- DOM 事件态与生命周期收尾可以由 `main.ts` 或新增交互模块管理。

### 6.4 视口应用策略

需要定义一个统一的 `applyViewport` 步骤，把状态同步到 `viewportRoot`：

- `viewportRoot.position.set(panX, panY)`
- `viewportRoot.scale.set(zoom)`

初始值建议为：

- `zoom = 1`
- `panX = designWidth / 2`
- `panY = designHeight / 2`
- `sceneRoot.position.set(0, 0)`
- `player.root.position.set(0, 0)`

执行时需统一约定“场景原点”：

- 若当前导出层已经以设计稿中心为基准，则让 `viewportRoot` 初始位于画布中心即可。
- 若测试发现初始位置偏移，则只允许在一个层级上补偿，避免多个容器重复平移。

## 8. 具体实施步骤

### 步骤 1：先修正导出与播放的绘制顺序

执行内容：

- 在 `spine-to-victoryani.ts` 中，把每帧 `pose.drawOrder` 编码进导出 timeline。
- 在 `export-types.ts`、`preview/timeline.ts` 中扩展 frame 数据结构与采样结果，增加绘制顺序字段。
- 在 `preview/player.ts` 中按采样结果驱动 sprite `zIndex` 或容器重排。
- 明确同一帧内的排序规则：
  - 先按 draw order
  - 再按 layer 初始索引兜底，保证排序稳定

交付标准：

- 静态层级和动态层级切换都能被播放器正确还原。
- 不再依赖 `project.layers` 当前固定数组顺序碰运气渲染。

### 步骤 2：梳理并固定容器职责

执行内容：

- 在 `main.ts` 中补出 `viewportRoot` 和 `sceneRoot`。
- 改为把 `player.root` 挂到 `sceneRoot`，不再直接挂到 `app.stage`。
- 增加统一的视口应用函数，避免在事件回调里散落设置 Pixi transform。

交付标准：

- 代码中能明确区分“DOM 布局适配”和“Pixi 场景相机变换”。
- 播放器替换动画项目时，仍然只关心 `player.root` 的增删，不直接污染视口层。

### 步骤 3：补齐渲染区激活态

执行内容：

- 以 `.stage` 作为激活目标容器。
- 点击 `.stage` 或 canvas 时，设置 active。
- 点击 `.sidebar`、`.detail-panel` 或文档其他区域时，取消 active。
- 在 `styles.css` 中为 `.stage` 增加激活态与拖拽态样式，例如边框高亮、阴影增强、cursor 变化。

交付标准：

- 用户能明确感知“当前滚轮是否会控制场景缩放”。
- 切回侧栏后，不会误触场景缩放。

### 步骤 4：实现拖拽平移

执行内容：

- 在 `.stage` 或 canvas 上监听 `pointerdown`。
- 只有主按钮按下时才开始拖拽。
- 记录 `pointerId`、起始指针位置、起始平移值。
- 拖拽中根据指针位移更新 `panX` / `panY`。
- 优先使用 `setPointerCapture` / `releasePointerCapture`，确保拖出区域也能正确结束。
- 结束条件至少覆盖：
  - `pointerup`
  - `pointercancel`
  - `lostpointercapture`
  - `window.blur`

交付标准：

- 拖动过程连续，无明显跳变。
- 释放鼠标后不会出现“场景还在跟着鼠标移动”的残留状态。

### 步骤 5：实现滚轮缩放

执行内容：

- 在 `.stage` 上监听 `wheel`。
- 缩放触发前增加双重门禁：
  - 当前 `isActive === true`
  - 事件目标属于 `.stage` / canvas 渲染区
- 使用渲染区局部坐标作为缩放锚点，把锚点传给 `zoomViewportAtPoint`。
- 对 `wheel` 调用 `preventDefault()`，避免渲染区内缩放时触发页面滚动。
- 统一缩放倍率策略，例如：
  - 向上滚动：`factor = 1.1`
  - 向下滚动：`factor = 1 / 1.1`

交付标准：

- 鼠标位于渲染区内时，缩放围绕指针附近区域展开。
- 鼠标不在渲染区或渲染区未激活时，不触发场景缩放。

### 步骤 6：保证 layout 与 viewport 不互相覆盖

执行内容：

- 保持 `computeCanvasLayout()` 只负责 canvas 在 DOM 中的显示尺寸与偏移。
- `applyLayout()` 中不要重置 `zoom`、`panX`、`panY`。
- resize 后只更新 canvas DOM 样式，不重建视口状态。

交付标准：

- 用户缩放或拖拽后调整窗口大小，视口状态仍保留。
- 不出现 resize 后场景突然跳回默认位置的问题。

### 步骤 7：补充自动化测试

执行内容：

- 为导出与播放顺序补测试，至少覆盖：
  - 导出帧里包含 draw order 信息
  - 同一时间点采样后能得到正确排序值
  - 播放器能根据排序值更新 sprite 前后关系
- 保留并扩展 `tests/runtime/viewport-controller.test.ts`，覆盖：
  - 缩放上限/下限
  - 锚点缩放后锚点对应的世界位置不变
- 如将 DOM 激活态与事件收尾抽到单独模块，则补对应单测，至少覆盖：
  - 未激活时滚轮请求被拒绝
  - 激活后滚轮请求通过
  - `window.blur` 或取消事件会清理拖拽态

交付标准：

- 最少有一组自动化测试能说明本次不是纯 UI 手工改动，而是核心状态逻辑已被验证。

### 步骤 8：补充文档与任务报告

执行内容：

- 更新 `apps/spine2victoryani-demo/README.md`，补充：
  - 当前实现如何处理 Spine 父子变换与 draw order
  - 新增交互能力
  - 鼠标操作说明
  - 激活态说明
  - 手工验收步骤
- 实现完成后新增中文任务报告到 `tasks/`：
  - 文件名：`11-spine2victoryani-demo-camera-controls-[utctime].md`
  - 内容至少包含：目标、实际改动、测试结果、遗留问题、是否更新 `agents.md`

交付标准：

- 其他同事只看 README 与任务报告，就能理解如何使用、如何验证、改了什么。

## 9. 手工验收清单

执行完成后按以下步骤验收：

1. 运行 `pnpm --filter spine2victoryani-demo dev`，确认页面可正常打开。
2. 对照 Spine 预期画面，确认存在遮挡关系的元素前后顺序正确。
3. 若动画过程中存在前后切换，确认播放过程中顺序会跟着切换，不是固定死的。
4. 点击侧边栏控件，确认播放、暂停、重播、循环功能仍正常。
5. 不点击渲染区，直接滚动鼠标滚轮，确认场景不缩放。
6. 点击渲染区使其激活，再滚动滚轮，确认场景开始缩放。
7. 将鼠标移到侧边栏区域滚动，确认不会触发场景缩放。
8. 在渲染区按下鼠标左键并拖动，确认场景跟随平移。
9. 拖动中把指针移出渲染区后释放，确认拖拽不会卡住。
10. 缩放到上限和下限，确认场景不会消失、反转或无限放大。
11. 调整浏览器窗口大小，确认当前视口状态不会被无故重置。

## 10. 执行命令建议

推荐执行顺序如下：

1. 安装依赖或补依赖后执行 `pnpm --filter spine2victoryani-demo test`
2. 本地开发验证执行 `pnpm --filter spine2victoryani-demo dev`
3. 如需全量静态检查，可执行 `pnpm --filter spine2victoryani-demo lint`

若依赖下载失败，可先执行：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 11. 风险与决策边界

- 风险 1：把“父子关系问题”和“绘制顺序问题”混为一谈
  - 规避方式：先确认世界变换是否已正确烘焙，再单独修正 draw order。
- 风险 2：只修静态初始层级，不修逐帧层级变化
  - 规避方式：导出帧数据时就记录每帧排序值，不能只看初始 pose。
- 风险 3：DOM 缩放与 Pixi 缩放混用
  - 规避方式：始终把交互缩放限制在 `viewportRoot`，不改 canvas CSS 尺寸。
- 风险 4：拖拽结束条件不完整导致状态残留
  - 规避方式：必须覆盖 `pointercancel`、`lostpointercapture`、`window.blur`。
- 风险 5：缩放锚点坐标系错误导致缩放时场景跳动
  - 规避方式：统一使用渲染区本地坐标，并复用 `zoomViewportAtPoint` 已有数学逻辑。
- 风险 6：切换动画项目时视口层被重建
  - 规避方式：只替换 `player.root`，不重建 `viewportRoot` 状态。

## 12. agents.md 是否需要更新

按当前需求判断，本任务默认只影响：

- demo 应用代码
- 对应测试
- README
- `tasks/` 内的计划与报告

因此默认不需要更新根级 `agents.md`。

只有在实际执行中出现以下情况时，才需要同步更新：

- 修改仓库协作规则
- 调整 `tasks/` 目录规范
- 变更根级基础脚本或通用执行约定
