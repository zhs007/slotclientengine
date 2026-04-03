# spine2pixiani-demo 接入 12 号动画资源任务报告

## 1. 任务目标

为 `apps/spine2pixiani-demo` 接入 `12` 号 Spine 资源组，并保持当前 demo 的实现路线仍然是“直接消费 atlas + JSON，不依赖 Spine 官方运行时”。

本次目标包含：

- 支持 `cabin` 与 `12` 两组资源切换
- 补齐 `shear` 与 `drawOrder` 的适配、采样和渲染能力
- 保持 `cabin` 现有播放与调试能力不回归
- 补充自动化测试与 README 说明

## 2. 实际改动

### 2.1 资源与数据入口

- 将以下资源复制到 demo 内部目录，保持应用自包含：
  - `src/assets/12.atlas`
  - `src/assets/12.png`
  - `src/data/asset-12-spine.json`
- 新增 `src/data/asset-12-animation-data.ts` 与 `src/data/asset-12-atlas.ts`
- 新增 `src/data/animation-bundles.ts`，统一注册：
  - `cabin`
  - `asset-12`

### 2.2 运行时能力补齐

- 在 `src/runtime/spine-types.ts` 中补充：
  - bone setup / pose 的 `shearX`、`shearY`
  - bone timeline 的 `shear`
  - animation timeline 的 `drawOrder`
- 在 `src/runtime/spine-adapter.ts` 中实现：
  - `shear` timeline 适配
  - `drawOrder` offsets 展开为完整 slot 顺序
  - duration 计算纳入 `shear` 与 `drawOrder`
- 在 `src/runtime/timeline-sampler.ts` 中实现：
  - shear 逐帧采样
  - drawOrder 逐帧采样
- 在 `src/runtime/transform.ts` 中扩展局部矩阵生成，使 shear 参与骨骼变换合成

### 2.3 渲染与主流程

- `src/ani/cabin/cabin-scene.ts` 改为按照采样出的 `drawOrder` 设置 sprite `zIndex`
- `src/ani/cabin/cabin-animation.ts` 改成按模型首个动画或传入默认动画初始化，不再写死 `cabin`
- `src/ui/animation-select.ts` 新增 bundle 选择控件，并支持动态刷新动画列表与面板文案
- `src/main.ts` 改为 bundle 驱动：
  - 按资源组异步加载 atlas 纹理
  - 切换资源组时重建实体、调试树与动画下拉框
  - 清理旧场景监听
  - 依据当前资源首帧可见包围盒自动估算首屏缩放与定位

### 2.4 测试与文档

- 更新 / 新增测试覆盖：
  - `tests/runtime/spine-adapter.test.ts`
  - `tests/runtime/timeline-sampler.test.ts`
  - `tests/runtime/transform.test.ts`
  - `tests/ani/cabin-animation.test.ts`
  - `tests/ani/cabin-scene.test.ts`
  - `tests/data/animation-bundles.test.ts`
- 更新 `apps/spine2pixiani-demo/README.md`

## 3. 测试结果

在仓库根目录执行：

- `pnpm --filter spine2pixiani-demo typecheck`：通过
- `pnpm --filter spine2pixiani-demo test`：通过，`10` 个测试文件共 `24` 个测试全部通过
- `pnpm --filter spine2pixiani-demo build`：通过

补充说明：

- `vite build` 仍提示主 chunk 超过 `500 kB`，这是打包体积告警，不影响本次功能交付

## 4. 遗留问题

- 当前 `ani/cabin` 目录名仍保留历史命名，内部逻辑已经能服务多资源组，但目录语义仍偏向旧实现
- README 已说明当前仍未覆盖 clipping、mesh、constraint、event/deform 等完整 Spine 特性
- 本次首屏布局使用“首帧可见包围盒估算”策略，适合当前两组资源；若后续资源首帧为空或极端偏移，可能需要引入更显式的 bundle 视图配置

## 5. agents.md 是否更新

未更新根级 `agents.md`。

原因：

- 本次修改仅涉及 demo 应用代码、测试、README 与任务报告
- 没有修改仓库协作规则、目录规范或根级基础脚本