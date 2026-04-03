# victoryani-demo

`victoryani-demo` 是一个可运行的 Vite 测试应用，用来验证 `docs/victory_editor_v2/export-example/` 导出的 VictoryAni 项目能否在当前 monorepo 里以 PixiJS + GSAP 的方式独立播放。

## 项目目的

- 直接加载应用内置的 `project.json` 与示例图片资源。
- 复刻编辑器导出结构的核心语义：图层、遮罩、混合模式、主时间线和预设动画注册。
- 提供最小控制面板，便于反复验证播放、停止、重播和循环。

## 运行方式

建议在仓库根目录执行：

```bash
pnpm install
pnpm --filter victoryani-demo dev
pnpm --filter victoryani-demo test
pnpm --filter victoryani-demo typecheck
pnpm --filter victoryani-demo build
```

如果依赖下载失败，可先设置代理：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 资源来源

- 配置：`docs/victory_editor_v2/export-example/project.json`
- 图片：`docs/victory_editor_v2/export-example/assets/*`

初始化时这些资源被复制到 `src/assets/`，保证 demo 自包含，不依赖 `docs/` 原始路径。

## 播放器结构

- `src/config`: 导出协议类型和配置标准化。
- `src/runtime`: 资源解析、图层构建、遮罩/混合模式、主时间线和支持矩阵。
- `src/animations`: 预设动画注册表实现。
- `src/scene/victory-player.ts`: 场景播放器，负责重建时间线、播放、停止、重播和循环。
- `src/interaction`: 场景相机状态和 DOM 交互控制器。
- `src/ui/control-panel.ts`: 最小控制面板。

## 相机交互

- 点击 Pixi 渲染区后，渲染区进入激活态，边框会高亮。
- 只有在激活态下，滚轮才会缩放整个场景；点击控制面板或渲染区外部会取消激活。
- 在渲染区内按住鼠标左键拖动，可以像摄像机一样平移场景。
- `Reset View` 会把场景恢复到居中、`1.00x` 的默认视角。
- 浏览器 resize 时会保留当前相机平移和缩放，只重新计算 canvas 的 DOM 展示尺寸。

控制面板新增只读调试信息，可直接观察当前激活态、缩放倍数和相机平移值，便于后续定位遮罩、混合模式或容器错位问题。

## 当前支持范围

示例当前使用到的 13 种动画均已实现：

- `bounceIn`
- `fadeIn`
- `fadeOut`
- `fireDistortion`
- `firework`
- `float`
- `particleBurst`
- `slideIn`
- `starlight`
- `sweepLight`
- `swing`
- `wave`
- `zoomIn`

其余预设动画中，以下类型已实现但不在当前示例中使用：

- `slideOut`
- `pulse`
- `rotate`
- `flipX`
- `flipY`
- `plexus`
- `shatter`
- `glitch`
- `magicShine`
- `cloudSea`
- `sequenceScale`

`custom` 当前明确不支持。原因是编辑器原始实现依赖字符串脚本和动态执行；在 demo 初始化阶段保留显式 TypeScript 动画注册更安全，也更容易测试。

## 已知限制

- `shatter` 是语义兼容版本，使用块状碎片近似原始碎裂效果，没有做真实贴图切片。
- `font` 图层已预留兼容路径，但当前内置示例全部是 `pic` 图层，字体渲染未做编辑器级的样式对齐。
- `fireDistortion` / `cloudSea` 采用 Pixi 位移滤镜近似编辑器效果，视觉上会受 Pixi 版本和浏览器 canvas 行为影响。

## 最小回归覆盖

测试当前覆盖以下关键环节：

- 导出配置解析和默认值补齐
- 图层实例构建
- 遮罩和混合模式基础行为
- 时间线调度
- `fireDistortion` 特效构建
- 相机状态计算、缩放边界、激活态门禁和拖拽位移换算

## 手工验收清单

- 首屏加载后是否自动播放示例
- 是否能看到 16 个图层叠加的完整场景
- 点击渲染区后是否出现激活态边框，点击控制面板后是否取消激活
- 未激活时滚轮不缩放，激活后滚轮能稳定缩放场景
- 拖拽渲染区时场景是否随鼠标平移，松开或窗口失焦后是否停止拖拽
- `Reset View` 后是否回到居中视角且调试信息同步更新
- `火` 和 `光效` 两处遮罩是否生效
- `火` / `火_copy_6` 的 `screen` 混合是否明显提亮
- 粒子、烟花、星光和热浪是否出现
- 连续重播后是否没有明显残留对象