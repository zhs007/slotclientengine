# spine2pixiani-demo

`spine2pixiani-demo` 是一个可运行的 Vite 应用，用来验证如何把 `assets/spine2pixiani/` 里的 Spine 资源翻译为“不依赖 Spine 运行时”的 Pixi/Pixiani 手写播放实现。

## 项目目标

- 直接加载多组 atlas/image，并在运行时切换资源组。
- 读取 `cabin` 与 `12` 两组 Spine JSON，转换为当前 demo 使用的内部数据结构。
- 支持 `cabin`、`cabin_s`、`bonus1-5`、`fg1-3` 的播放、切换与重播。
- 页面提供资源组切换、动画切换、重播、循环开关，以及一套用于排查数据问题的调试交互。

## 当前支持的资源组

- `cabin`: 原始 cabin 资源组，动画为 `cabin`、`cabin_s`
- `12`: 12 号资源组，动画为 `bonus1`、`bonus2`、`bonus3`、`bonus4`、`bonus5`、`fg1`、`fg2`、`fg3`

## 调试交互

- 左侧面板最上方可以切换当前资源组，切换后会重建 atlas、模型、动画下拉框和调试树。
- 左侧面板新增 `Select` / `Pan` 两种鼠标模式。
- `Select` 模式下可以点击舞台中的 bone 调试标记，左侧会显示当前选中节点，右侧树会同步高亮。
- `Pan` 模式下按住左键拖动画布可以平移视角，不影响动画播放。
- 鼠标滚轮会以当前指针位置为锚点缩放整个场景，缩放范围带上下限钳制。
- 右侧树状面板直接从 `SpineModel` 派生，展示 bone 层级和每个 bone 下的 slot 归属。
- 点击右侧节点树后，舞台会在贴图上方绘制粗线条、双层高亮的 selection box。
- slot 节点优先显示当前 attachment 的旋转包围盒；bone 节点显示其子树内可见 slot 的联合范围，没有可见 attachment 时退化为固定强调框。
- 首版舞台直接点选优先覆盖 bone；slot 选中通过右侧树完成，并会同步高亮其所属 bone。

## 当前支持的数据子集

- bone timelines: `translate`、`rotate`、`scale`、`shear`
- slot timelines: `attachment`、`color`
- animation timelines: `drawOrder`
- curve: `linear`、`stepped`、4 点 bezier
- atlas fields: `rotate`、`xy`、`size`、`orig`、`offset`、`index`
- 世界变换内部使用二维仿射矩阵合成，可正确处理 `scaleX = -1` 这类镜像父骨骼及其子 attachment 的旋转传播
- `drawOrder` 会在适配层展开成完整 slot 顺序，并在渲染层通过 `zIndex` 生效
- `shear` 会参与局部矩阵生成与骨骼世界变换合成

## 当前未覆盖的 Spine 特性

- clipping
- mesh / weighted mesh
- path / IK / transform constraint
- event / deform / twoColor / sequence 等未在当前两组资源中使用的时间轴
- 复杂骨骼继承规则仍按当前 demo 的最小实现处理，目标是覆盖 `cabin` 与 `12` 的真实用例，而不是完整 Spine Schema

## 操作说明

1. 启动页面后，先在左侧 `Bundle` 下拉框选择 `Cabin` 或 `Asset 12`。
2. `Animation` 下拉框会自动切换成当前资源组对应的动画列表。
3. 点击 `Replay` 可以从头播放当前动画；关闭 `Loop` 后会停在动画尾帧。
4. 切换到 `Asset 12` 后，`fg1` 可以用来观察 `drawOrder` 与 `shear` 生效后的姿态与遮挡变化。

## 运行方式

建议在仓库根目录执行：

```bash
pnpm install
pnpm --filter spine2pixiani-demo dev
pnpm --filter spine2pixiani-demo test
pnpm --filter spine2pixiani-demo typecheck
pnpm --filter spine2pixiani-demo build
```

## 目录说明

- `src/runtime`: atlas 解析、Spine 适配、时间轴采样与显示层辅助
- `src/runtime/debug-tree.ts`: 从 `SpineModel` 构建调试树结构
- `src/runtime/debug-bounds.ts`: 选中节点包围盒与骨骼联合范围计算
- `src/runtime/viewport-controller.ts`: 视口平移与缩放状态计算
- `src/ani/cabin`: 当前 demo 的场景构建与动画实体，已可复用到多资源组
- `src/ui/node-tree.ts`: 右侧调试树面板
- `src/data`: bundle 注册表、原始 Spine JSON 与转换后的内部模型入口
- `tests`: atlas、适配、采样、bundle 注册、动画切换与调试交互回归测试

## 验收建议

1. 运行 `pnpm --filter spine2pixiani-demo dev`，确认默认资源组可正常显示。
2. 切换到 `Asset 12`，确认动画列表刷新为 `bonus1-5` 与 `fg1-3`。
3. 播放 `fg1`，确认遮挡顺序会在中段发生变化。
4. 切回 `Cabin`，确认旧动画和调试交互没有回归。
5. 运行 `pnpm --filter spine2pixiani-demo test`、`typecheck`、`build`，确认自动化校验通过。

## 资源来源

- atlas/image: `assets/spine2pixiani/cabin.atlas`, `assets/spine2pixiani/cabin.png`
- raw json: `assets/spine2pixiani/cabin.json`
- atlas/image: `assets/spine2pixiani/12.atlas`, `assets/spine2pixiani/12.png`
- raw json: `assets/spine2pixiani/12.json`

这些资源在初始化时复制到应用目录，保持 demo 自包含。