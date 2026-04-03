# spine2victoryani-demo 任务报告

## 1. 完成情况

已完成 `apps/spine2victoryani-demo` 初始化，并实现以下闭环：

- 复制并复用 `spine2pixiani-demo` 的 Spine 解析、采样与仿射变换能力。
- 新增 Node 侧导出脚本 `pnpm --filter spine2victoryani-demo export`。
- 导出脚本会把 `cabin.atlas + cabin.png + cabin-spine.json` 转为真实落盘的 VictoryAni 产物。
- 产物默认输出到 `apps/spine2victoryani-demo/public/exported/`。
- 页面预览只加载导出结果，不直接消费原始 Spine 数据。
- 自动化测试覆盖 atlas 切图、Spine -> VictoryAni 映射、镜像关系和导出文件结构。

## 2. 主要实现

### 2.1 应用骨架

- 新应用包名已改为 `spine2victoryani-demo`。
- 保持与仓库一致的 `vite`、`vitest`、`eslint`、`prettier` 工具链。
- 新增 `export` 脚本，使用 `tsx` 运行 TypeScript 导出脚本。

### 2.2 Spine 基础能力复用

- 保留 `src/runtime/spine-adapter.ts`、`timeline-sampler.ts`、`transform.ts` 等核心逻辑。
- 继续使用二维仿射矩阵处理镜像父骨骼与子 attachment 的世界变换。

### 2.3 atlas 切图方案

- 新增 `src/runtime/atlas-core.ts` 与 `src/runtime/atlas-slicer.ts`。
- 采用导出阶段切图方案，使用 `sharp` 输出独立 PNG。
- 支持 `rotate`、`orig`、`offset` 还原。
- 当前示例一共导出 `29` 个图片资源。

### 2.4 Spine -> VictoryAni 映射

- 新增 `src/runtime/spine-to-victoryani.ts`。
- layer 粒度固定为 `slot + attachment`，例如 `ui14__ui6`。
- 动画按 `fps=24` 离散采样，编码到 VictoryAni `animations[].script` 中。
- `project.json` 仍使用 VictoryAni 当前协议字段：`version`、`name`、`duration`、`layers[]`。
- layer 字段输出包含：`id`、`type`、`asset`、`x`、`y`、`scaleX`、`scaleY`、`rotation`、`alpha`、`blendMode`、`visible`、`animations`。

### 2.5 预览器

- 新增 `src/preview/**` 最小播放器。
- 页面会加载 `public/exported/manifest.json` 与对应动画的 `project.json`。
- 支持动画选择、播放/暂停、重播、循环。
- 预览器明确展示当前播放的是导出结果而不是原始 Spine 运行时。

## 3. 导出结果

当前已生成以下产物：

- `public/exported/project.json`
- `public/exported/manifest.json`
- `public/exported/animations/cabin.project.json`
- `public/exported/animations/cabin_s.project.json`
- `public/exported/assets/*.png`

其中：

- 默认动画为 `cabin`
- `cabin` 时长为 `2s`
- `cabin_s` 时长为 `0s`
- 每个项目当前导出 `67` 个 layer

## 4. 镜像处理结论

本次最终采用“直接保留导出层镜像变换”的方案，没有额外生成镜像图片。

具体验证结论：

- `ui_k` / `ui_k2` 分支导出后仍保持左右镜像关系。
- 关键层对包括：
  - `ui14__ui6 <-> ui20__ui6`
  - `ui16__ui6 <-> ui25__ui6`
  - `ui3__ui3 <-> ui15__ui3`
- 自动化测试会校验它们关于导出舞台锚点 `anchorX=665.6` 的对称性。

## 5. 自动化验证

已执行并通过：

```bash
pnpm --filter spine2victoryani-demo typecheck
pnpm --filter spine2victoryani-demo export
pnpm --filter spine2victoryani-demo test
pnpm --filter spine2victoryani-demo build
pnpm --filter spine2victoryani-demo dev
```

补充说明：

- `dev` 启动成功。
- 因 `5173` 端口已被其他进程占用，本次自动切换到 `5174`。

## 6. 已知限制

- 当前导出器针对 `cabin` 示例定制，并非通用 Spine 全量转换器。
- `color` 当前稳定映射的是 alpha；若后续出现明显 RGB tint 需求，需要继续补策略。
- 预览器只支持本项目输出的 `timeline` 动画类型。
- draw order 动画当前未实现，因为本输入资源未使用该能力。

## 7. 结论

本任务要求的最小可运行闭环已经完成：

- 新 demo 已创建并可运行。
- Spine 输入可解析、可采样。
- atlas 已真实切图并落盘。
- VictoryAni `project.json` 与图片资源已导出。
- 新项目内可直接回放导出结果。
- 镜像问题已有明确落地方案与自动化校验。