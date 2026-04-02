# spine2pixiani-demo

`spine2pixiani-demo` 是一个可运行的 Vite 应用，用来验证如何把 `assets/spine2pixiani/` 里的 Spine 资源翻译为“不依赖 Spine 运行时”的 Pixi/Pixiani 手写播放实现。

## 项目目标

- 直接加载 `cabin.atlas` 与 `cabin.png`。
- 读取 `cabin-spine.json`，转换为当前 demo 使用的内部数据结构。
- 支持 `cabin` 与 `cabin_s` 两个动画的循环播放与切换。
- 页面提供下拉框、重播按钮、循环开关，以及一套用于排查数据问题的调试交互。

## 调试交互

- 左侧面板新增 `Select` / `Pan` 两种鼠标模式。
- `Select` 模式下可以点击舞台中的 bone 调试标记，左侧会显示当前选中节点，右侧树会同步高亮。
- `Pan` 模式下按住左键拖动画布可以平移视角，不影响动画播放。
- 鼠标滚轮会以当前指针位置为锚点缩放整个场景，缩放范围带上下限钳制。
- 右侧树状面板直接从 `SpineModel` 派生，展示 bone 层级和每个 bone 下的 slot 归属。
- 首版舞台直接点选优先覆盖 bone；slot 选中通过右侧树完成，并会高亮其所属 bone。

## 当前支持的数据子集

- bone timelines: `translate`、`rotate`、`scale`
- slot timelines: `attachment`、`color`
- curve: `linear`、`stepped`、4 点 bezier
- atlas fields: `rotate`、`xy`、`size`、`orig`、`offset`、`index`

当前资源没有使用 draw order 动画，因此本 demo 没有实现 draw order 采样。

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
- `src/runtime/viewport-controller.ts`: 视口平移与缩放状态计算
- `src/ani/cabin`: cabin 场景构建与动画实体
- `src/ui/node-tree.ts`: 右侧调试树面板
- `src/data`: 原始 Spine JSON 与转换后的内部模型入口
- `tests`: atlas、适配、采样、动画切换与调试交互纯函数回归测试

## 资源来源

- atlas/image: `assets/spine2pixiani/cabin.atlas`, `assets/spine2pixiani/cabin.png`
- raw json: `assets/spine2pixiani/cabin.json`

这些资源在初始化时复制到应用目录，保持 demo 自包含。