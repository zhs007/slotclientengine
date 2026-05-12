# 13 agentani-demo 初始化任务报告

## 任务目标

新增 `apps/agentani-demo`，把 `assets/editor2/bg/project.json` 中的 `bg` 动画转换为不依赖导出 JSON 的 TypeScript 代码动画，并提供 PixiJS + GSAP 播放器、下拉选择、基础控制、测试和中文 README。

## 实际完成内容

- 新增 `apps/agentani-demo` Vite 应用，已被 pnpm workspace 识别。
- 复制 `packages/pixiani/src/core/**` 到 `apps/agentani-demo/src/core/**`，并复制 `packages/pixiani/src/layout.ts`。
- 新增 `src/animations/bg.ts`，以 TypeScript 配置保存 `bg` 的 15 个图层、资源 import、基础属性、遮罩、混合模式和动画时间配置。
- 新增 `src/animations/registry.ts`，注册 `bg` 为 ready，`fang`、`heart`、`mei`、`tao`、`海滩`、`竹子1` 为 todo。
- 新增运行时模块：
  - `runtime/animation-effects.ts`
  - `runtime/blend-mode.ts`
  - `runtime/layer-factory.ts`
  - `runtime/mask-manager.ts`
  - `runtime/player.ts`
  - `runtime/timeline.ts`
- 新增测试播放器 UI：Pixi 渲染区域、动画下拉列表、播放、暂停、重播、循环和状态提示。
- 新增中文 `README.md`。
- 新增 `.prettierignore`，避免 `dist` 与 `coverage` 影响格式检查。

## 资源转换结果

- 输入路径：`assets/editor2/bg/project.json`
- 输出目录：`apps/agentani-demo/src/assets/bg/`
- 输出数量：15 个 PNG 文件，命名为 `layer-00.png` 至 `layer-14.png`
- 源 data URL 的 MIME 为 `application/octet-stream`，转换脚本按 PNG 文件头识别扩展名。
- 转换脚本已保留：`apps/agentani-demo/tools/extract-editor2-project.mjs`
- 运行时未复制、未 import、未 fetch `project.json`。

## 代码实现说明

- `bg.ts` 是运行时事实来源，保留中文图层 id，图片使用本应用内资源 import。
- `刷光.maskId` 保留为 `隐形框_copy_7`，混合模式为 `add`。
- 负 `scaleX` 图层保留镜像值，`pulse` 与 `starlight` 按初始缩放做乘法缩放，避免丢失镜像方向。
- 6 种动画效果均为显式 TypeScript 函数：`fadeIn`、`fadeOut`、`pulse`、`starlight`、`sweepLight`、`swing`。
- `starlight` 为编辑器语义的近似实现，包含 alpha、scale 与轻微 rotation 闪烁。

## 验证命令与结果

已通过：

```bash
pnpm --filter agentani-demo typecheck
pnpm --filter agentani-demo lint
pnpm --filter agentani-demo test
pnpm --filter agentani-demo build
pnpm --filter agentani-demo format:check
```

测试结果：7 个测试文件、10 个测试用例全部通过。

补充检查：

- `apps/agentani-demo/src/assets/bg/` 下图片数量为 15。
- `apps/agentani-demo/src/assets/bg/` 下没有 JSON 文件。
- Vite dev server 可启动，`http://127.0.0.1:5173/` 返回 `HTTP/1.1 200 OK`。

## 已知限制

- `starlight` 当前是近似效果，不复刻编辑器内部所有随机星光细节。
- 未转换目录在 UI 下拉列表中禁用显示，后续新增对应 `*.ts` 后再标记为 ready。
- 浏览器插件在本次验收中连接超时，未能获取页面截图；已通过构建、测试和本地 HTTP 响应做替代验收。

## agents.md 修改情况

未修改根级 `agents.md`。本任务仅新增 demo 应用、资源、测试、文档和本应用格式忽略配置，不涉及仓库协作规则、目录规范或基础脚本变更。
