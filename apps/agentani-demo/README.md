# agentani-demo

`agentani-demo` 用来验证把 `docs/victory_editor_v2` 导出的编辑器动画转换为可维护 TypeScript 代码的流程。首期已转换 `assets/editor2/bg/project.json`，运行时不复制、不 import、也不 fetch 编辑器导出的 JSON。

## 运行方式

```bash
pnpm --filter agentani-demo dev
pnpm --filter agentani-demo typecheck
pnpm --filter agentani-demo lint
pnpm --filter agentani-demo test
pnpm --filter agentani-demo build
```

如果依赖安装失败，可先设置代理：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 资源来源

`bg` 的图片来自 `assets/editor2/bg/project.json` 中每个 `pic` 图层的 base64 data URL。转换后输出到 `src/assets/bg/layer-00.png` 至 `layer-14.png`，文件名按图层顺序稳定生成，中文图层名保留在代码配置中。

转换辅助脚本保留在 `tools/extract-editor2-project.mjs`：

```bash
node apps/agentani-demo/tools/extract-editor2-project.mjs
```

源 data URL 的 MIME 是 `application/octet-stream`，脚本会按 PNG 文件头识别为 `.png`。

## 代码动画组织

- `src/animations/bg.ts` 是 `bg` 运行时事实来源，包含动画元信息、15 个图层、资源 import、基础属性、遮罩、混合模式和时间线配置。
- `src/animations/registry.ts` 维护下拉列表。`bg` 为 ready，其余 `assets/editor2/*` 目录先标记为 todo。
- `src/runtime/animation-effects.ts` 显式实现 `fadeIn`、`fadeOut`、`pulse`、`starlight`、`sweepLight`、`swing`，不执行导出脚本字符串。
- `src/runtime/player.ts` 负责加载 Pixi 贴图、构建图层、绑定遮罩和控制 GSAP 时间线。

## 新增下一个动画

1. 从对应 `assets/editor2/[id]/project.json` 解码图片到 `src/assets/[id]/`。
2. 新增 `src/animations/[id].ts`，按 `CodeAnimationProject` 写出图层和动画配置。
3. 在 `src/animations/registry.ts` 中把该项改为 `ready` 并挂入 project。
4. 为新增效果补充 `src/runtime/animation-effects.ts` 和测试。

## 当前范围

已实现动画：`bg`。

待转换动画：`fang`、`heart`、`mei`、`tao`、`海滩`、`竹子1`。

已支持效果：`fadeIn`、`fadeOut`、`pulse`、`starlight`、`sweepLight`、`swing`。

已知限制：`starlight` 是按编辑器语义做的近似闪烁实现；遮罩图层保持源 alpha 为 0，但会作为 Pixi mask 绑定到 `刷光`。
