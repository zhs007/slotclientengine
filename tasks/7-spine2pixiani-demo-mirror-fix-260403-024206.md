# spine2pixiani-demo 镜像节点旋转异常修复报告

## 1. 问题现象

- `apps/spine2pixiani-demo` 中，`ui_k2` 作为 `ui_k` 的镜像分支，静态姿态与动画播放时都出现了旋转失真。
- 最明显的样本是 `slot:ui18`：它直接挂在 `ui_k2` 上，角度与左侧对应节点不呈稳定镜像关系。
- 调试框与舞台渲染共用同一套世界变换假设，因此 selection box 也会跟着偏。

本次修复前后，默认姿态下已用以下样本复核镜像关系：

- `slot:ui13` 对 `slot:ui18`
- `bone:ui01` 对 `bone:ui1`
- `bone:ui02` 对 `bone:ui2`

## 2. 根因分析

- 原实现把二维层级变换拆成了“位移旋转后相加、旋转直接相加、缩放直接相乘”的 TRS 传播模型。
- 该模型在普通父子骨骼下大致可用，但对 `scaleX = -1` 这种镜像父节点并不等价于真实二维仿射矩阵组合。
- 在 `ui_k2` 这类负缩放父节点下，子骨骼与 attachment 的局部坐标轴已经翻转，继续用角度相加会得到错误的世界旋转。
- `timeline-sampler.ts` 和 `debug-bounds.ts` 都建立在这个错误假设上，所以渲染和高亮框会一起出错。

## 3. 修改范围

- 新增 `apps/spine2pixiani-demo/src/runtime/transform.ts`
- 更新 `apps/spine2pixiani-demo/src/runtime/spine-types.ts`
- 更新 `apps/spine2pixiani-demo/src/runtime/timeline-sampler.ts`
- 更新 `apps/spine2pixiani-demo/src/runtime/debug-bounds.ts`
- 更新 `apps/spine2pixiani-demo/src/ani/cabin/cabin-scene.ts`
- 更新 `apps/spine2pixiani-demo/tests/runtime/debug-bounds.test.ts`
- 新增 `apps/spine2pixiani-demo/tests/runtime/transform.test.ts`
- 更新 `apps/spine2pixiani-demo/tests/setup.ts`
- 更新 `apps/spine2pixiani-demo/README.md`

## 4. 修复方案

### 4.1 统一底层变换语义

- 在 runtime 层引入二维仿射矩阵字段 `a / b / c / d / tx / ty`。
- `WorldTransform` 不再只是 `x / y / rotation / scaleX / scaleY`，而是额外携带 `matrix` 真值。
- bone 世界变换与 attachment 世界变换统一通过矩阵乘法组合。

### 4.2 世界变换链路改造

- `computeWorldBoneTransforms(...)` 改为父矩阵乘本地矩阵，不再依赖角度直接相加。
- `composeAttachmentTransform(...)` 改为 bone 世界矩阵乘 attachment 本地矩阵。
- 调试包围盒的点投影改为直接走矩阵投影，避免渲染和 selection box 再次分叉。

### 4.3 Pixi 渲染落点改造

- attachment 精灵不再使用 `position + rotation + scale` 手动赋值。
- `CabinScene` 改为把世界矩阵转换为场景矩阵后，直接 `sprite.setFromMatrix(...)`。
- 这样镜像链路中的旋转和翻转不会在显示层再次丢失。

## 5. 自动化测试

新增和调整的测试覆盖了以下场景：

- 负缩放父骨骼下的子骨骼旋转组合
- attachment 仿射矩阵与手工矩阵乘法结果一致
- `ui_k` / `ui_k2` 默认姿态下的镜像骨骼位置关系
- `slot:ui13` / `slot:ui18` 的 selection bounds 镜像对称关系
- 测试环境 Pixi mock 补充 `Matrix` 与 `setFromMatrix(...)`，确保渲染路径可测

## 6. 验证结果

已在仓库根目录执行并通过：

```bash
pnpm --filter spine2pixiani-demo test
pnpm --filter spine2pixiani-demo typecheck
pnpm --filter spine2pixiani-demo build
```

验证结论：

- 18 项测试全部通过
- `typecheck` 通过
- `vite build` 通过
- `ui_k2` 镜像链路的世界变换现在按矩阵传播，`ui18` 这类 slot 的旋转失真问题已从运行时根因上修正

## 7. 剩余风险

- 当前修复覆盖的是本 demo 使用到的 2D 仿射变换子集，尚未扩展到完整 Spine Runtime 特性。
- 如果后续引入 shear、path constraint、mesh deformation 等更复杂能力，需要继续扩展底层变换模型。
- 目前自动化测试验证了镜像数学关系和调试包围盒，但仍建议在浏览器中对 `cabin` 与 `cabin_s` 做一次肉眼回归，重点复核 `slot:ui18`、`slot:ui15`、`slot:ui17`。

## 8. 其他说明

- 本次没有修改资源数据 `cabin-spine.json`。
- 本次没有修改仓库协作规则、目录规范或基础脚本，因此未更新根级 `agents.md`。
