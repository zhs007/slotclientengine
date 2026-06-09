# agentani-demo2

`agentani-demo2` 用来验证另一条动画代码化路线：编辑器导出的 JSON 只作为开发期输入，运行时播放的是面向 PixiJS 手写/转换后的 TypeScript 动画代码。

## 运行命令

```bash
pnpm --filter agentani-demo2 dev
pnpm --filter agentani-demo2 typecheck
pnpm --filter agentani-demo2 lint
pnpm --filter agentani-demo2 test
pnpm --filter agentani-demo2 build
```

如果依赖安装或下载失败，可先设置代理：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 与 agentani-demo 的差异

`agentani-demo` 把导出项目转换为代码化数据，再由 `runtime` 解释图层、遮罩、混合模式和动画效果。`agentani-demo2` 刻意不做这层通用解释器，`src/animations/pixi/bg.ts` 直接创建 Pixi `Container`、`Sprite` 和 GSAP timeline。

这样做的目的不是否定 runtime 路线，而是验证特殊动画逻辑留在具体作品代码里时，是否能减少公共层膨胀。当前项目没有 `src/runtime`，也没有 `playProjectJson`、`buildProjectTimeline` 或按 effect 字符串分发的公共 API。

## 资源来源与导出

首期只转换 `assets/editor2/bg/project.json`。源 JSON 里的 base64 图片通过以下脚本解码：

```bash
pnpm --filter agentani-demo2 extract:bg
```

脚本位于 `tools/extract-editor2-assets.mjs`，会读取源 JSON，按图片 bytes 计算 hash 去重，并把图片写入 `src/assets/bg/`。15 个源图层当前去重为 9 张 PNG；相同图片内容只保留一份文件，多个图层在 `bg.ts` 中复用同一个 import 和 Pixi texture。

运行时不会复制、import 或 fetch `project.json`。

## 动画组织方式

`src/animations/pixi/bg.ts` 是 `bg` 的运行时事实来源，包含：

- 动画元信息：`id`、`label`、`duration`
- 图片资源 import
- 15 个源图层片段的直接 TS 描述
- Pixi Sprite 创建、基础 transform、混合模式和遮罩绑定
- `fadeIn`、`fadeOut`、`pulse`、`starlight`、`sweepLight`、`swing` 的显式 GSAP 实现
- 播放、暂停、重播、循环和销毁接口

源数据按视频编辑时间片理解：除明确静态常显的 `底2` 外，动画片段只在自己的时间窗口内显示。片段进入前会隐藏或 alpha 为 0，结束后会淡出或隐藏，避免空白时间段残留旧画面。

## 新增下一个 Pixi 动画

1. 用开发期脚本把 `assets/editor2/[id]/project.json` 的 base64 图片导出到 `src/assets/[id]/`。
2. 新增 `src/animations/pixi/[id].ts`，直接实现 Pixi 场景和 GSAP timeline。
3. 在 `src/animations/pixi/registry.ts` 把对应条目从 `todo` 改为 `ready` 并挂上模块。
4. 为资源去重、遮罩、混合模式、时间片显隐和重播状态补测试。

## CocosCreator 翻译策略

如果后续需要 CocosCreator 版本，建议让 agent 同时参考源 JSON 和 Pixi 版 `bg.ts`，翻译出 `src/animations/cocos/bg.ts`。不要为了跨引擎提前引入 adapter/facade；Pixi 的 `Sprite/Texture/mask/blendMode` 和 Cocos 的节点语义差异应在目标引擎代码里处理。

## 当前范围

已实现动画：`bg`

待转换动画：`fang`、`heart`、`mei`、`tao`、`海滩`、`竹子1`

已覆盖动画行为：`fadeIn`、`fadeOut`、`pulse`、`starlight`、`sweepLight`、`swing`

已知限制：

- 当前只是测试播放器，不是编辑器。
- `starlight` 和 `swing` 是可验收的 Pixi/GSAP 近似实现，不执行编辑器里的字符串脚本。
- 只实现 PixiJS 版本，未实现 CocosCreator 版本。
- 首期只完整转换 `bg`。
