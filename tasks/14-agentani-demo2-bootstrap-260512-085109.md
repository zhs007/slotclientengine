# agentani-demo2 初始化任务报告

## 任务目标

新增 `apps/agentani-demo2`，验证 editor2 导出 JSON 到 engine-specific TypeScript 动画实现的路线。首期完成 `assets/editor2/bg/project.json` 到 PixiJS + GSAP 代码动画的转换，不在运行时读取 JSON，不新增通用 animation runtime/interpreter。

## 实际完成内容

- 新增 `apps/agentani-demo2` Vite 应用，workspace 已通过 `pnpm install` 更新锁文件和依赖链接。
- 新增 Pixi 动画模块接口、注册表、UI 控制面板和 app shell。
- 完成 `bg` 动画的 PixiJS + GSAP 直接实现：
  - 文件：`apps/agentani-demo2/src/animations/pixi/bg.ts`
  - 元信息：`id = "bg"`、`label = "bg"`、`duration = 3`
  - 覆盖源 JSON 的 15 个图层片段。
  - 显式实现 `fadeIn`、`fadeOut`、`pulse`、`starlight`、`sweepLight`、`swing`。
  - 绑定 `刷光.maskId = 隐形框_copy_7`。
  - 对光效图层应用 `add` 混合模式。
  - 按视频编辑时间片处理显隐，避免动画区间外残留。
  - replay 前重置关键状态，保留负 `scaleX` 镜像值。
- 下拉列表注册全部 editor2 目录：
  - 已实现：`bg`
  - 待转换：`fang`、`heart`、`mei`、`tao`、`海滩`、`竹子1`
- 新增中文 `README.md`，说明项目目的、运行方式、与 `agentani-demo` 的差异、资源导出、时间片语义、后续 Pixi 动画扩展和 CocosCreator 翻译策略。

## 与 agentani-demo 的关键差异

`agentani-demo` 使用代码化数据配置加公共 runtime 解释项目；`agentani-demo2` 不引入 `src/runtime`，也没有 `playProjectJson`、`buildProjectTimeline`、`createAnimationEffect` 或 `CodeAnimationProject` 一类解释器 API。`bg.ts` 直接创建 Pixi `Container/Sprite` 并定义 GSAP timeline。

## 资源转换结果

- 输入路径：`assets/editor2/bg/project.json`
- 输出目录：`apps/agentani-demo2/src/assets/bg/`
- 源图层数量：15
- 输出图片数量：9
- 去重方式：按图片 bytes 计算 SHA-256 hash，相同 hash 只写出一份文件。
- 保留转换脚本：`apps/agentani-demo2/tools/extract-editor2-assets.mjs`
- 运行时未复制、import 或 fetch `project.json`。

## 代码实现说明

- `src/animations/pixi/bg.ts`：`bg` 的运行时事实来源，直接保存图层片段、资源引用、遮罩、混合模式、显隐时间片和 6 类动画函数。
- `src/animations/pixi/registry.ts`：注册 ready/todo 动画项，后续新增动画只需补资源、动画 TS 并把注册项改为 ready。
- `src/main.ts`：极薄 Pixi app shell，只负责初始化 Pixi、挂载当前动画、切换清理和按钮控制。
- `src/ui/controls.ts`：创建选择框、播放、暂停、重播和循环开关。
- `src/animations/pixi/helpers.ts`：仅保留低语义 Pixi helper，不知道 editor effect 类型。

## 验证命令与结果

全部通过：

```bash
pnpm --filter agentani-demo2 typecheck
pnpm --filter agentani-demo2 lint
pnpm --filter agentani-demo2 test
pnpm --filter agentani-demo2 build
pnpm --filter agentani-demo2 format:check
```

单测结果：4 个测试文件、11 个用例通过。覆盖资源解析、注册表、15 个源图层片段、图片去重、遮罩关系、add 混合模式、时间片显隐、负 scale 镜像值、显式动画函数和 runtime 边界。

页面服务验收：

- 固定端口启动命令：`pnpm --dir apps/agentani-demo2 exec vite --host 127.0.0.1 --port 5300 --strictPort`
- `curl http://127.0.0.1:5300/` 返回 `agentani-demo2` 的 HTML。
- `curl -I http://127.0.0.1:5300/src/main.ts` 返回 `200 OK` 与 `Content-Type: text/javascript`。

内置浏览器插件在本次连接阶段连续超时，未能完成截图级视觉验收；已用构建、测试和固定端口 HTTP 响应做替代验收。后续可在本机打开 `http://127.0.0.1:5300/` 补一次人工视觉确认。

## 已知限制

- 首期只完整转换 `bg`。
- `starlight` 和 `swing` 是 Pixi/GSAP 近似实现，不执行编辑器导出的字符串脚本。
- 未实现 CocosCreator 版本。
- UI 是测试播放器，不是编辑器。

## agents.md 修改情况

未修改根级 `agents.md`。本次只新增 demo 应用、资源、测试、文档和任务报告，没有改变仓库协作规则、目录规范或基础脚本。
