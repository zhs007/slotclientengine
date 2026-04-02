# spine2pixiani-demo 节点列表包围盒高亮任务计划

## 1. 任务目标

在现有 `apps/spine2pixiani-demo` 调试能力基础上，补充“右侧节点列表驱动画布高亮”的可视反馈方案：

- 点击右侧节点列表中的节点后，Pixi 渲染区内能立即显示对应节点的包围盒。
- 包围盒使用更容易识别的渐变色盒子表现，线条明显加粗，避免在复杂场景中看不清。
- 该方案优先服务“看得见、好判断”，不再依赖用户在舞台中直接精确点击深层节点。

本计划为可直接执行版本，不依赖额外口头说明。

## 2. 当前现状

基于仓库当前代码，可确认以下事实：

- 页面入口在 `apps/spine2pixiani-demo/src/main.ts`。
- 右侧节点树面板在 `apps/spine2pixiani-demo/src/ui/node-tree.ts`，当前点击节点后只会调用 `onSelect(node.id)`。
- 选中状态在 `main.ts` 中统一维护，`setSelectedNode(nodeId)` 会同步：
  - `cabinEntity.setSelectedNode(nodeId)`
  - `nodeTree.setSelectedNodeId(nodeId)`
  - 左侧控制面板的选中信息
- 实际渲染高亮逻辑在 `apps/spine2pixiani-demo/src/ani/cabin/cabin-scene.ts`。
- 当前 `CabinScene` 只有 `boneMarkers` 这种菱形点位高亮：
  - 选中 bone 时，只会把 marker 放大、改色。
  - 选中 slot 时，会退化为高亮其所属 bone。
- 当前没有：
  - 针对 bone 或 slot 的可见包围盒绘制
  - attachment 世界空间矩形的调试数据结构
  - 专门的调试 overlay 图层管理
  - 节点列表点击后在 Pixi 区域显示“明确框选结果”的反馈
- `CabinScene.applyPose(...)` 每帧已经具备以下计算基础：
  - bone 的世界变换 `computeWorldBoneTransforms(...)`
  - slot attachment 的世界变换 `composeAttachmentTransform(...)`
  - 每个 slot 对应的 `sprite.position / rotation / scale`
- `SpineModel` 的 `AttachmentPose` 已包含包围盒计算所需的基础尺寸字段：
  - `width`
  - `height`
  - `x`
  - `y`
  - `rotation`
  - `scaleX`
  - `scaleY`

结论：

- 当前问题不是“树节点没有选中”，而是“选中后画布没有足够明显的定位反馈”。
- 现有架构已经足够支持补一层调试包围盒，无需重做节点树或主状态流。

## 3. 需求澄清与落地解释

为保证实现一致，默认按以下方式解释需求：

- “点击右边的节点列表后”指右侧 `Node Tree` 面板中的节点按钮点击。
- “在 pixi 渲染区，把包围盒渲染出来”指在舞台 canvas 内新增一层调试图形，跟随动画当前帧和当前视口实时显示。
- “用一个渐变颜色的 box，线条可以粗一些”指首版至少满足：
  - 边框颜色具备明显的渐变过渡效果
  - 线宽显著高于当前 bone marker 的视觉权重
  - 在深色背景与复杂贴图上依然容易识别
- 该需求的核心验收不是像素级精确命中，而是“从节点树点击后，用户能立刻知道它在画面哪里”。

## 4. 完成定义

当以下条件全部满足时，可认为本任务完成：

- 右侧节点树点击 bone 节点后，舞台中会显示与该 bone 对应的可见包围范围或定位框。
- 右侧节点树点击 slot 节点后，舞台中会显示该 slot 当前 attachment 的包围盒。
- 包围盒绘制位于现有动画内容上方，不会被角色贴图遮住。
- 包围盒会随着当前动画帧更新位置与旋转，不出现明显滞后。
- 包围盒在缩放、平移视口后依然与目标内容保持对齐。
- 包围盒在视觉上满足“高可见性”：
  - 线宽明显增大
  - 有渐变色或等价的双层颜色过渡表现
  - 至少带有轻微透明填充或发光感，避免只剩一条细线
- 没有可用包围盒时，行为清晰可预期：
  - 例如 slot 当前没有 attachment，则不报错，并隐藏包围盒或降级显示 owner bone 框
- 原有能力保持可用：
  - 动画播放正常
  - 右侧树高亮正常
  - `select / pan` 模式切换正常
  - 滚轮缩放与拖拽平移正常
- 至少补充针对新增计算逻辑的自动化测试。
- 如当前 `README.md` 对调试能力的说明已不足，需要同步补充。
- 任务完成后，在 `tasks/` 下新增中文任务报告，命名为 `6-spine2pixiani-demo-selection-box-[utctime].md`，其中 `utctime` 使用 UTC 时间，格式为 `年月日时分秒`，例如 `260401-181300`。
- 若执行过程中修改了仓库协作规则、目录规范或基础脚本，再同步更新根级 `agents.md`；若只是功能增强，则无需修改。

## 5. 默认实现假设

为保证任务可落地，默认采用以下假设：

- 不新增新的调试模式，仍沿用当前“节点树点击 + 舞台选中状态同步”的机制。
- 首版主路径以“节点树点击触发包围盒显示”为准，不以“pan 模式下画布点击命中”作为主要交互入口。
- bone 与 slot 的包围盒允许采用不同策略：
  - slot：优先使用 attachment 的世界空间矩形
  - bone：优先使用该 bone 关联 slot 的联合包围盒；若无可见 attachment，则退化为围绕 bone marker 的固定尺寸强调框
- “渐变 box” 优先采用 Pixi 可稳定落地的近似方案，而不是为首版引入复杂 shader：
  - 方案 A：双层描边 + 半透明填充，制造渐变感
  - 方案 B：若 Pixi 当前版本易于实现，再用 `FillGradient` 或等价能力做真正渐变填充
- 首版允许只同时显示“当前选中节点”的单个包围盒，不要求多选或历史残影。
- 包围盒调试层挂在 `CabinScene.debugLayer` 或其子层中，避免污染业务渲染层。

## 6. 影响范围

本任务默认覆盖以下路径：

- `apps/spine2pixiani-demo/src/main.ts`
- `apps/spine2pixiani-demo/src/ani/cabin/cabin-scene.ts`
- `apps/spine2pixiani-demo/src/runtime/debug-tree.ts`
- `apps/spine2pixiani-demo/src/runtime/spine-types.ts`
- `apps/spine2pixiani-demo/src/styles.css`
- `apps/spine2pixiani-demo/tests/**`
- `apps/spine2pixiani-demo/README.md`
- `tasks/6-spine2pixiani-demo-selection-box.md`
- 任务完成后的报告文件 `tasks/6-spine2pixiani-demo-selection-box-[utctime].md`

如有必要，可新增以下模块：

- `apps/spine2pixiani-demo/src/runtime/debug-bounds.ts`
- `apps/spine2pixiani-demo/src/runtime/geometry.ts`

默认不修改以下区域，除非执行中确认确有必要：

- 根级工具链配置
- `packages/**`
- 根级 `agents.md`

## 7. 核心设计决策

### 决策 1：以“树点选驱动画布定位反馈”为主路径

当前用户问题集中在“深层节点不好点、pan 模式点击没感觉”，因此首版不继续强化画布点击命中，而是把树点击后的视觉反馈做强。

这样做的好处：

- 与现有 `nodeTree -> setSelectedNode -> CabinScene` 状态流天然兼容。
- 不需要额外解决深层显示对象命中优先级问题。
- 更符合调试场景，用户先在树里定位，再在舞台上看结果。

### 决策 2：包围盒数据应从当前 pose 实时推导

包围盒不能只基于静态骨架数据，因为当前动画会持续改变：

- bone 世界位置
- attachment 的旋转与缩放
- slot 当前 attachment 切换

因此包围盒应在 `CabinScene.applyPose(...)` 中基于当前帧 pose 更新，而不是初始化时一次性生成。

### 决策 3：bone 与 slot 分开处理

两类节点的数据特征不同：

- slot 天然对应“当前可见 attachment”，适合直接计算矩形包围盒。
- bone 本身不一定有尺寸，单纯高亮点位仍然不够直观。

建议策略：

- slot 选中时：显示该 slot 当前 attachment 的旋转矩形包围盒。
- bone 选中时：优先聚合该 bone 直接或间接关联的可见 slot 包围盒，形成联合包围盒。
- 如果某个 bone 当前没有任何可见 attachment，可退化显示一个明显的定位框或十字强调框，并在任务报告中说明。

### 决策 4：渐变效果优先选择稳定实现

用户关注的是“更容易看见”，不是图形技术实现方式本身。

建议按稳定性排序：

1. 双层粗描边 + 半透明填充
2. 外层高亮描边 + 内层暖色描边
3. 若 Pixi 当前 API 足够直接，再引入真正的渐变填充或渐变描边

只要视觉结果明显，即可满足首版目标。

### 决策 5：调试 overlay 独立管理

建议把当前选中框绘制逻辑从 `refreshSelectionHighlight()` 中拆出来，形成独立的 overlay 更新流程。

理由：

- 当前 `refreshSelectionHighlight()` 只处理 marker 的颜色和尺寸，不适合继续堆复杂图形逻辑。
- 独立后更方便测试“节点 -> 包围盒数据”的映射。
- 未来若要加 hover、锁定、多框对比，也更容易扩展。

## 8. 可落地实施方案

### 方案结论

建议采用“实时计算选中节点调试包围盒 + 单独 overlay 图层绘制”的方案：

- 在 `CabinScene` 中新增一个专门的选中框图层。
- 每帧动画更新后，根据当前 `selectedNodeId` 计算选中目标的世界空间包围信息。
- 用 `Graphics` 或等价 Pixi 图元绘制：
  - 半透明填充
  - 粗外框
  - 内层亮色描边
  - 可选角标或中心十字

这套方案与现有代码最兼容，也最容易快速验证视觉效果。

## 9. 任务拆分

### 任务 1：梳理当前选中链路并补齐调试数据接口

目标：让 `selectedNodeId` 不只是“给 marker 改色”，而是能驱动包围盒计算。

执行内容：

- 审查 `main.ts` 中 `setSelectedNode(...)` 的现有调用链，确认不需要改动状态入口。
- 审查 `CabinScene.setSelectedNode(...)` 与 `refreshSelectionHighlight()` 的职责边界。
- 为 `CabinScene` 增加获取当前选中节点调试几何信息所需的内部辅助方法。
- 如果现有 `debug-tree.ts` 缺少必要辅助函数，可补充统一的节点类型判断或 id 解析函数。

验收标准：

- 代码结构上已经明确“marker 高亮”和“包围盒 overlay”是两条并行能力。
- 选中状态仍然只维护一份，不出现 UI 与舞台状态分叉。

### 任务 2：实现 slot attachment 的世界空间包围盒计算

目标：为 slot 节点建立可靠的矩形包围盒数据来源。

执行内容：

- 基于当前帧 `pose.slots[slotName]`、`composeAttachmentTransform(...)` 和 attachment 尺寸，推导四个角点的世界坐标。
- 明确坐标系统：
  - Spine 逻辑坐标
  - Pixi 渲染坐标中 Y 轴翻转的处理
- 基于角点结果计算：
  - 旋转矩形绘制点
  - 轴对齐包围盒，用于 bone 聚合或测试断言
- 对 “slot 当前无 attachment” 情况做空值保护。

验收标准：

- 任一 slot 在当前帧都可以得到：
  - 可绘制的四角点数据，或
  - 明确的“当前不可绘制”结果
- 计算结果与 slot sprite 的实际位置、旋转、缩放保持一致。

### 任务 3：实现 bone 节点的联合包围策略

目标：让 bone 选中时也能在画布里有足够明确的定位结果。

执行内容：

- 建立 bone 到 slot 的关联查找逻辑，至少覆盖其直接挂载 slot。
- 如果实现成本可控，进一步支持把该 bone 子树下所有可见 slot 的包围盒并入联合范围。
- 对没有任何可见 attachment 的 bone，设计退化策略：
  - 方案 A：围绕 bone marker 画固定尺寸强调框
  - 方案 B：画十字准星和小型脉冲框
- 在计划实施时优先选择视觉识别度最高、实现复杂度最低的方案。

验收标准：

- 选中常见 bone 时，用户能在舞台中快速判断其大致作用区域。
- 没有 attachment 的 bone 也不会出现“点击后完全没反应”的情况。

### 任务 4：新增选中框 overlay 图层并绘制渐变 box

目标：把包围数据转成高可见性的 Pixi 调试图形。

执行内容：

- 在 `CabinScene` 中新增 `selectionOverlay` 或等价图层。
- 采用 `Graphics` 或当前 Pixi 稳定可用的图元 API 绘制：
  - 半透明填充
  - 粗描边
  - 内外双色过渡，营造渐变感
- 调整绘制顺序，确保 overlay 在贴图之上、但不遮挡整个画面。
- 必要时增加：
  - 四角角标
  - 中心点
  - 轻量外发光

验收标准：

- 在默认缩放下，框线明显优于当前 marker 可见性。
- 在复杂贴图区域与深色背景上，框体仍容易识别。

### 任务 5：将 overlay 更新接入每帧 pose 刷新

目标：保证包围盒与动画、平移、缩放始终同步。

执行内容：

- 在 `CabinScene.applyPose(...)` 末尾加入 overlay 数据刷新。
- 确保切换动画、replay、loop 改变时，选中框仍能正确更新。
- 处理选中节点切换为 `null` 时的 overlay 清空。
- 验证 overlay 使用与 slot sprite 相同的父级坐标空间，避免错位。

验收标准：

- 动画播放过程中，选中框稳定跟随目标内容移动。
- `pan` 与 `zoom` 操作只改变整体视图，不破坏选中框对齐。

### 任务 6：补充 UI 说明与交互兜底

目标：让用户知道当前行为已经从“靠点中节点”转为“靠树定位节点”。

执行内容：

- 评估是否需要在右侧面板或左侧说明文案中补一行提示：
  - 点击节点列表可在舞台中显示包围盒
- 如果当前空状态文案不够清晰，补充描述。
- 维持 `select / pan` 模式现有逻辑，不因本次改动造成误解。

验收标准：

- 首次使用者无需额外解释，也能理解“点击右侧树会在舞台中出现定位框”。

### 任务 7：补充自动化测试与回归验证

目标：让关键几何计算具备可重复校验能力。

执行内容：

- 为新增的几何计算逻辑补充测试，优先覆盖：
  - slot 包围盒角点计算
  - 旋转矩形转轴对齐包围盒
  - bone 联合包围盒结果
  - 空 attachment 的保护逻辑
- 若图形绘制本身不易直接断言，则至少验证输入几何数据。
- 执行项目相关校验命令，例如：
  - `pnpm --filter spine2pixiani-demo test`
  - `pnpm --filter spine2pixiani-demo typecheck`
- 如果依赖下载或命令执行失败，可先设置代理：
  `export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;`

验收标准：

- 核心几何逻辑有自动化测试覆盖。
- 测试与类型检查可通过，或在任务报告中明确记录未通过项与原因。

## 10. 推荐执行顺序

建议按以下顺序推进：

1. 先完成 slot 包围盒的数学计算与测试。
2. 再完成 `CabinScene` 的 overlay 图层绘制。
3. 然后补 bone 的联合包围与退化方案。
4. 最后做样式微调、说明文案和整体回归。

原因：

- slot 的世界空间矩形是整个方案最核心、最可验证的基础。
- 先有正确几何数据，再调视觉效果，返工成本最低。

## 11. 风险与应对

### 风险 1：Pixi 当前版本的渐变 API 不够直接

表现：

- 真正渐变描边实现复杂，容易拉长开发时间。

应对：

- 首版优先使用“双层粗描边 + 半透明填充”的近似方案，只要可见性达标即可。

### 风险 2：bone 缺少天然尺寸，包围盒定义不稳定

表现：

- 某些 bone 没有关联可见 attachment，难以画出“真实框”。

应对：

- 采用“联合可见 slot 包围盒 + 无内容时退化强调框”的两级策略。

### 风险 3：Spine 坐标到 Pixi 坐标的 Y 轴翻转导致框体错位

表现：

- 选中框与 sprite 看起来上下颠倒或旋转方向不一致。

应对：

- 把角点计算提炼为可测试纯函数，并用现有 pose 数据做断言验证。

### 风险 4：overlay 每帧重绘带来不必要开销

表现：

- 如果每帧创建大量对象，可能影响调试体验。

应对：

- 首版只维护单个当前选中框。
- 尽量复用 `Graphics` 实例，不在每帧重复 new 大量对象。

## 12. 交付物清单

任务完成后，应至少产出以下内容：

- 节点树点击后可在舞台中显示的包围盒高亮能力
- 对应源码改动与测试
- 必要的 README 使用说明更新
- 中文任务报告文件：
  - `tasks/6-spine2pixiani-demo-selection-box-[utctime].md`

## 13. agents.md 是否需要同步

基于当前任务范围判断：

- 本次任务属于 `apps/spine2pixiani-demo` 的功能增强。
- 不改变仓库协作规则、目录规范或基础脚本。

因此默认不需要修改根级 `agents.md`。

只有在执行过程中确实新增了新的仓库级规则，才需要同步更新。
