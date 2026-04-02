# spine2pixiani-demo 镜像节点旋转异常修复任务计划

## 1. 任务目标

修复 `apps/spine2pixiani-demo` 中 `ui_k` 与 `ui_k2` 镜像效果不一致的问题，确保右侧镜像分支在静态姿态与动画播放时都与左侧分支保持可预期的镜像关系，重点解决 `ui18` 这类挂在 `ui_k2` 上的 slot 在旋转角度上明显失真的问题。

本计划是可直接执行版本，不依赖额外口头说明。

## 2. 当前问题与已知事实

基于当前仓库代码，可确认以下事实：

- 目标应用位于 `apps/spine2pixiani-demo`。
- 原始 Spine 数据位于 `apps/spine2pixiani-demo/src/data/cabin-spine.json`。
- 骨骼数据中：
  - `ui_k` 挂在 `root` 下。
  - `ui_k2` 也挂在 `root` 下，但 `scaleX = -1`，被设计为 `ui_k` 的镜像分支。
  - `ui18` 是直接绑定到 `ui_k2` 的 slot。
- 当前世界变换计算在 `apps/spine2pixiani-demo/src/runtime/timeline-sampler.ts`：
  - `computeWorldBoneTransforms(...)`
  - `composeAttachmentTransform(...)`
- 当前渲染落点在 `apps/spine2pixiani-demo/src/ani/cabin/cabin-scene.ts`，其中 slot 精灵直接使用计算后的 `position / rotation / scale`。
- 当前实现把层级世界变换简化为：
  - 位移：父节点旋转缩放后再叠加
  - 旋转：父旋转 + 子旋转
  - 缩放：父缩放 * 子缩放
- 这种“TRS 拆开相加/相乘”的实现，在普通骨骼层级下基本可用，但在父节点含负缩放时并不等价于真实二维仿射矩阵组合，因此镜像链路下的旋转方向与局部轴会失真。
- 现有测试覆盖了普通时间轴采样和包围盒逻辑，但没有专门验证“负缩放父骨骼 + 子骨骼/attachment 旋转”的场景。

结论：

- 这不是 `cabin-spine.json` 资源录入错误的优先问题。
- 这是 demo Runtime 的世界变换合成方式不完整，导致镜像父节点下的旋转结果错误。

## 3. 完成定义

当以下条件全部满足时，可认为本任务完成：

- `ui_k` 与 `ui_k2` 在默认姿态下呈现为结构一致、方向相反的镜像关系。
- `ui18`、`ui15`、`ui17` 等直接挂在 `ui_k2` 上的 slot，视觉旋转与 `ui_k` 对应分支保持镜像一致，不再出现明显角度偏差。
- `ui1`、`ui2` 等 `ui_k2` 子骨骼上的 attachment 也保持正确镜像，不因父节点负缩放导致额外旋转漂移。
- `cabin` 与 `cabin_s` 两个动画在修复后都能正常播放。
- 现有调试能力保持可用：
  - 节点树可选中
  - 选中高亮框位置正确
  - 视口缩放与平移不受影响
- 至少新增一组自动化测试，覆盖镜像父节点下的世界变换或 attachment 变换。
- 如修复影响 README 中对运行时能力的描述，需要同步更新 `apps/spine2pixiani-demo/README.md`。
- 任务完成后，在 `tasks/` 下新增一份中文任务报告，命名为 `7-spine2pixiani-demo-mirror-fix-[utctime].md`，其中 `utctime` 使用 UTC 时间，格式为 `年月日时分秒`，例如 `260402-103932`。
- 若执行过程中修改了仓库协作规则、目录规范或基础脚本，需要同步更新根级 `agents.md`；若只是修复 demo 运行时逻辑，则无需修改。

## 4. 默认实现假设

为保证任务可落地，默认按以下假设推进：

- 首版优先修复当前 demo 使用到的二维骨骼变换子集，不扩展到完整 Spine 全特性兼容。
- 允许调整 `WorldTransform` 的内部表示，只要对外行为更正确且调用点可控。
- 可以把“用于渲染的世界变换”和“用于调试包围盒的世界变换”统一到同一套底层数学实现，避免两套逻辑再次分叉。
- 不要求引入 Spine 官方运行时库，也不把本次修复升级为通用 Spine Runtime 重构。
- 若最终采用矩阵方案，允许在边界处再还原出 Pixi 可直接消费的 `position / rotation / scale`，但内部计算必须以矩阵正确性优先。
- 若依赖下载或安装失败，可先执行：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 5. 影响范围

本任务默认覆盖以下路径：

- `apps/spine2pixiani-demo/src/runtime/timeline-sampler.ts`
- `apps/spine2pixiani-demo/src/runtime/spine-types.ts`
- `apps/spine2pixiani-demo/src/runtime/debug-bounds.ts`
- `apps/spine2pixiani-demo/src/ani/cabin/cabin-scene.ts`
- `apps/spine2pixiani-demo/tests/runtime/timeline-sampler.test.ts`
- `apps/spine2pixiani-demo/tests/runtime/debug-bounds.test.ts`
- `apps/spine2pixiani-demo/README.md`
- `tasks/7-spine2pixiani-demo-mirror-fix.md`
- 任务完成后的报告文件 `tasks/7-spine2pixiani-demo-mirror-fix-[utctime].md`

如执行中发现拆分更清晰，可新增以下文件：

- `apps/spine2pixiani-demo/src/runtime/transform.ts`
- `apps/spine2pixiani-demo/tests/runtime/transform.test.ts`

默认不修改以下区域，除非执行中确认确有必要：

- 根级工具链配置
- `packages/**`
- 根级 `agents.md`

## 6. 核心设计决策

### 决策 1：世界变换必须升级为矩阵语义

当前实现的问题根源是把二维仿射变换拆成 `rotation + scale` 来逐级传播。对带负缩放的父节点，这种表示无法正确表达“镜像后再旋转”的局部轴翻转。

建议改为以下之一：

- 方案 A：内部统一使用 2D 仿射矩阵计算世界变换，再在渲染边界解出 Pixi 所需属性。
- 方案 B：内部维护 `a / b / c / d / tx / ty` 这类矩阵字段，并在需要时转换。

本任务默认选择方案 A 或 B 中更贴近现有代码的实现，但原则是不再依赖“旋转直接相加”作为最终真值。

### 决策 2：bone 与 attachment 组合逻辑共用一套底层变换

当前 `computeWorldBoneTransforms(...)` 和 `composeAttachmentTransform(...)` 都基于同一套简化假设，因此 bug 会同时污染：

- 舞台渲染
- selection box
- 调试几何

修复时应让骨骼世界变换和 attachment 世界变换共用同一个底层组合函数，避免只修渲染、不修调试，或反过来。

### 决策 3：先锁定数学正确性，再做视觉验证

`ui18` 只是最明显的症状，不是唯一问题点。首版应优先建立可自动验证的数学用例，再用实际页面做目视确认。

原因：

- 单靠肉眼调角度容易把错误“调顺眼”，但底层仍不正确。
- 后续再出现别的镜像分支时，自动化测试可以直接兜底。

### 决策 4：不要用“对特定节点打补丁”的方式修

不接受以下修法作为主方案：

- 只对 `ui_k2` 或 `ui18` 做特殊角度取反。
- 在 `CabinScene` 渲染层按节点名硬编码修正 rotation。
- 在资源数据里复制出另一套人工改过角度的 attachment 数据。

这些方案不能泛化，也会破坏 demo 作为 Spine 数据验证工具的可信度。

## 7. 可落地实施方案

### 方案结论

建议采用“引入统一二维变换组合层 + 补镜像回归测试 + 用现有调试界面做人工验收”的方案：

1. 在 runtime 层补一套可靠的本地变换转矩阵、父子矩阵合成、矩阵应用到点的工具。
2. 重写骨骼世界变换与 attachment 世界变换的组合逻辑，使镜像父节点下的子旋转正确传播。
3. 在场景渲染和调试包围盒中复用该逻辑。
4. 新增针对 `ui_k` / `ui_k2` 镜像关系的自动化测试。
5. 最后通过页面节点树和 selection box 对 `ui18` 等节点做肉眼复核。

## 8. 任务拆分

### 任务 1：梳理当前镜像链路与可复现样本

目标：把问题从“看起来不对”收敛成稳定的可验证样本。

执行内容：

- 审查 `cabin-spine.json` 中 `ui_k`、`ui_k2`、`ui1`、`ui2`、`ui18` 等节点的骨骼/slot/attachment 关系。
- 确认哪些 slot 直接挂在镜像根骨骼上，哪些挂在其子骨骼上。
- 用当前调试面板记录至少一组可复现观察点：
  - 默认姿态
  - 某个动画播放时刻（如果镜像问题在动画中更明显）
- 把这些观察点写进后续任务报告，作为修复前后对比依据。

验收标准：

- 已明确至少 2 个镜像验证样本，其中至少包含 `ui18`。
- 已确认问题发生在世界变换链路，而不是纹理 atlas 旋转解析。

### 任务 2：抽离统一二维变换工具

目标：提供能正确表达负缩放镜像的底层数学能力。

执行内容：

- 在 runtime 中新增或整理二维变换工具模块。
- 提供最少以下能力：
  - 本地骨骼变换转矩阵
  - 本地 attachment 变换转矩阵
  - 父子矩阵相乘
  - 从矩阵提取平移
  - 将矩阵作用到局部点
- 如渲染层必须拿到 `rotation / scale`，明确矩阵到 Pixi 显示属性的解算规则，并保证镜像不会再次丢失符号信息。

验收标准：

- 底层工具可独立表达 `scaleX = -1` 的镜像变换。
- 至少有纯函数测试覆盖“负缩放父节点 + 子节点旋转”的组合结果。

### 任务 3：重写骨骼世界变换合成

目标：让骨骼世界坐标系在镜像父节点下仍然正确。

执行内容：

- 改造 `computeWorldBoneTransforms(...)`，不再单纯依赖：
  - 旋转相加
  - 缩放相乘
- 让每个 bone 的世界结果由父矩阵与自身本地矩阵相乘得到。
- 视需要扩展 `WorldTransform` 类型，使其能承载矩阵或等价信息。
- 检查所有调用点，确保不会因类型变化导致别处仍使用旧假设。

验收标准：

- `ui_k2` 子树中 bone 的世界位置和方向与 `ui_k` 子树呈合理镜像关系。
- 普通非镜像骨骼链路行为不回退。

### 任务 4：重写 attachment 世界变换与场景落点

目标：修复 slot 贴图最终渲染姿态，直接解决 `ui18` 的旋转异常。

执行内容：

- 改造 `composeAttachmentTransform(...)`，让 attachment 世界姿态由 bone 世界矩阵与 attachment 本地矩阵合成得到。
- 检查 `CabinScene.applyPose(...)` 中 sprite 的赋值方式，确认 Pixi 精灵最终拿到的姿态与矩阵语义一致。
- 如果只传 `rotation / scale` 无法稳定表达镜像，改为：
  - 直接设置 Pixi `matrix`
  - 或者使用能完整保留镜像信息的赋值路径

验收标准：

- `ui18` 在页面上不再出现“明显差很多”的旋转偏差。
- `ui15`、`ui17` 及 `ui1` / `ui2` 分支的 attachment 与左侧镜像关系一致。

### 任务 5：同步修正调试包围盒与选中框

目标：避免渲染正确了，但 selection box 仍然沿用旧世界变换。

执行内容：

- 审查 `debug-bounds.ts` 中与 attachment 四角投影、bone 联合包围盒相关的计算。
- 让包围盒计算复用新的 attachment 世界变换结果，或直接复用统一矩阵工具。
- 检查节点树选中 `ui18` 时的高亮框是否紧贴实际贴图。

验收标准：

- 选中镜像分支节点时，高亮框与贴图位置、角度一致。
- 非镜像分支包围盒表现不回退。

### 任务 6：补自动化测试与回归样例

目标：把本次镜像 bug 固化成可长期防回归的测试。

执行内容：

- 在 `tests/runtime` 下新增或扩展测试，至少覆盖：
  - 负缩放父骨骼下的世界 bone 变换
  - 负缩放父骨骼下的 attachment 世界变换
  - `ui_k` / `ui_k2` 对应样本的镜像关系
- 推荐增加断言方向：
  - 对应点的 `x` 互为相反数或满足镜像约束
  - 对应姿态的轴方向满足镜像后的预期
  - `ui18` 中心点与角点投影合理
- 如现有 `debug-bounds.test.ts` 更适合承接，也可直接扩展该文件。

验收标准：

- 测试在修复前会失败，修复后通过。
- 测试不依赖肉眼截图判断。

### 任务 7：联调、文档与收尾

目标：完成可交付闭环。

执行内容：

- 本地执行：
  - `pnpm --filter spine2pixiani-demo test`
  - `pnpm --filter spine2pixiani-demo typecheck`
  - `pnpm --filter spine2pixiani-demo build`
- 若命令失败且判断与依赖拉取有关，先配置代理后重试。
- 若 README 中“当前支持的数据子集”或调试说明需要补充镜像修复背景，进行同步更新。
- 新增任务报告 `tasks/7-spine2pixiani-demo-mirror-fix-[utctime].md`，至少记录：
  - 问题现象
  - 根因分析
  - 修改范围
  - 验证结果
  - 剩余风险
- 仅当本次修改影响协作规则、目录规范或基础脚本时，再更新根级 `agents.md`。

验收标准：

- 测试、类型检查、构建均通过，或报告中明确记录未通过项与原因。
- 任务报告已落盘，命名符合要求。

## 9. 验证清单

执行完成后，至少按以下清单验收：

- 页面打开后，`ui_k` 与 `ui_k2` 的整体布局左右镜像。
- 选中 `slot:ui18` 时，selection box 与实际贴图角度一致。
- `cabin` 动画播放中，镜像分支不会出现额外旋转跳变。
- `cabin_s` 动画仍可正常播放，未引入新错误。
- 自动化测试通过，且包含镜像父节点场景。
- `README.md` 与任务报告已按实际修改情况更新。

## 10. 风险与注意事项

- 若直接把矩阵再粗暴拆回 `rotation + scale`，有可能在镜像边界再次丢失信息，需要特别小心。
- 如果 Pixi 当前赋值链路对负缩放与 rotation 的组合有额外约束，优先采用 `matrix` 直设而不是继续绕行。
- 本次修复可能影响调试包围盒、节点高亮和点击命中，需要一并回归。
- 若执行中确认问题还包含 atlas 旋转子图解析误差，应在任务报告中单列，但不要先假设主因是 atlas。

## 11. 交付物

本任务完成时，至少应产出以下交付物：

- 运行时镜像修复代码
- 覆盖镜像场景的自动化测试
- 视情况更新后的 `apps/spine2pixiani-demo/README.md`
- 中文任务报告：`tasks/7-spine2pixiani-demo-mirror-fix-[utctime].md`

