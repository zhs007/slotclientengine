# spine2victoryani-demo

`spine2victoryani-demo` 是一个可运行的 Vite 应用，用来把 `cabin` Spine 示例转换成可落盘的 VictoryAni 导出结果，并直接在页面里回放导出后的 `project.json` 与切图资源。

## 项目目的

- 复用 `spine2pixiani-demo` 现有 Spine 解析与时间轴采样能力。
- 对齐 `victoryani-demo` 当前 `project.json` 结构，不改 VictoryAni 数据协议。
- 在导出阶段切图，把 atlas region 还原为独立 PNG 资源。
- 提供最小预览页面，验证“Spine -> VictoryAni”链路闭环成立。

## 参考来源

- Spine 侧参考：`apps/spine2pixiani-demo`
- VictoryAni 侧参考：`apps/victoryani-demo`

## 输入资源

- `src/assets/cabin.atlas`
- `src/assets/cabin.png`
- `src/data/cabin-spine.json`

## 输出文件

导出脚本会生成以下目录：

- `public/exported/project.json`：默认动画的 VictoryAni 项目文件
- `public/exported/animations/*.project.json`：每个 Spine 动画各自的项目文件
- `public/exported/assets/*.png`：从 atlas 切出的独立图片资源
- `public/exported/manifest.json`：导出摘要、动画列表、镜像校验目标

## 转换流程

1. 使用 `spine-adapter` 把 Spine JSON 适配为内部 `SpineModel`。
2. 使用 `timeline-sampler` 对每个动画按 `fps` 离散采样。
3. 按 `slot + attachment` 粒度生成稳定 layer id，例如 `ui14__ui6`。
4. 利用世界矩阵计算每个 attachment 的最终位置、旋转、缩放和 alpha。
5. 把每层的离散帧编码到 VictoryAni `animations[].script` 字符串里，类型为 `timeline`。
6. 浏览器预览页只读取导出结果，不直接读取原始 Spine 数据。

## atlas 处理方式

- 采用“导出阶段切图”方案。
- 使用 `sharp` 从 `cabin.png` 中裁切 atlas region。
- 支持 `rotate`、`orig`、`offset` 的恢复逻辑。
- 每个 region 会生成独立 PNG 文件，供 `project.json` 直接引用。

## 镜像处理方式

- 优先保留导出的负缩放和对应旋转，不额外生成镜像图片。
- 当前 `ui_k` / `ui_k2` 分支会在导出后的关键帧里保留镜像关系。
- 自动化测试覆盖了已知镜像对：`ui14__ui6 <-> ui20__ui6`、`ui16__ui6 <-> ui25__ui6`、`ui3__ui3 <-> ui15__ui3`。

## 当前支持范围

- bone timelines: `translate`、`rotate`、`scale`
- slot timelines: `attachment`、`color`
- curve: `linear`、`stepped`、4 点 bezier
- atlas fields: `rotate`、`xy`、`size`、`orig`、`offset`、`index`

## 预览交互

- 点击预览渲染区后进入相机激活态，右上角状态标签会切换为 `Camera Zoom Active`
- 激活态下，鼠标滚轮会以指针所在位置为锚点缩放整个导出场景
- 鼠标左键拖拽渲染区可平移场景，拖拽中状态标签会显示 `Panning Scene`
- 点击侧边栏、详情面板或页面其他区域会退出激活态，滚轮不再控制场景缩放
- 浏览器窗口 resize 只会重新计算 canvas 的显示尺寸，不会重置当前平移和缩放状态

## 已知限制

- 当前导出器按本仓库 `cabin` 示例定制，没有覆盖通用 Spine 特性全集。
- `color` 目前只稳定映射 alpha；若后续资源出现显著 RGB tint，需要单独补充策略。
- draw order 动画当前未实现，因为这份输入资源没有使用该能力。
- 预览器只实现本项目导出的 `timeline` 动画类型，不等同于 `victoryani-demo` 的全部预设动画运行时。

## 运行与导出命令

建议在仓库根目录执行：

```bash
pnpm install
pnpm --filter spine2victoryani-demo export
pnpm --filter spine2victoryani-demo dev
pnpm --filter spine2victoryani-demo test
pnpm --filter spine2victoryani-demo typecheck
pnpm --filter spine2victoryani-demo build
```

## 手工验收

1. 执行 `pnpm --filter spine2victoryani-demo dev` 并打开预览页面。
2. 不点击预览区直接滚动鼠标滚轮，确认页面不会触发场景缩放。
3. 点击预览区激活相机后滚动鼠标滚轮，确认场景围绕鼠标附近位置缩放。
4. 在预览区按住鼠标左键拖拽，确认场景持续平移，松开后拖拽状态立即结束。
5. 点击侧边栏或右侧详情面板后再次滚轮，确认不会误触场景缩放。
6. 调整浏览器窗口大小，确认当前视口平移和缩放状态仍被保留。

## 测试覆盖

- Spine 输入解析与导出结构映射
- atlas 切图输出
- 镜像分支对称性
- 导出 manifest 与资源引用完整性
- 视口平移、锚点缩放、缩放边界
- 激活态门禁、拖拽收尾、视口 transform 应用

## 目录说明

- `src/runtime`: Spine 解析、atlas 切图、导出器
- `src/preview`: 导出结果加载与最小播放器
- `scripts/export-demo.ts`: 导出脚本入口
- `public/exported`: 已落盘的示例导出结果
- `tests/runtime`: 转换链路回归测试