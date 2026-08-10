# 190 Popup Editor 项目/资源/适配/图层重构执行报告

## 结果

任务于 `2026-08-10T06:38:02Z` 完成代码与自动化验收，真实浏览器验收按约定留给用户。

- Popup Editor 启动为未打开项目；创建 dialog 固定项目名与类型，项目 ZIP 和资源导入使用独立入口。
- 新项目默认输出 Popup v2；v1 ZIP 保持 v1 导入/预览/写回，可显式升级 v2。
- VNI、ImgNumber 资源只接受导出 ZIP；Spine 按 JSON/atlas/texture 闭包导入；同名不同 bytes 必须选择覆盖或 keep-both。
- v2 增加中心基准 focus extent、maximized-focus 适配、默认 50% 黑色全 viewport backdrop 和 layer alpha。
- award v2 要求五档共享一个 win-amount ImgNumber，bigwin/superwin/megawin 各有 VNI；Spine 要求 root 与三段互异动画。
- image、Spine、VNI、ImgNumber、上传字体文字和系统字体文字均可作为附加层；第一版文字效果保留纯色/线性渐变、描边、投影和弧排。
- Popup Editor 自己拥有唯一 preview Application/canvas；rendercore 只提供可挂载 Container，不创建 Application、Renderer、canvas、ticker 或 RAF。
- Preview 合法变化后自动 debounce rebuild，并丢弃过期异步结果；Build、Advance、Dismiss、Immediate Dismiss 按钮已删除，canvas/keyboard 是唯一 popup 交互输入。
- Scene Layout runtime/presentation surface、Game Layout Editor、CLI 与 gameframeworks 已接入 v1/v2 public contract。

## 主要合同与文件

- `packages/rendercore/src/popup/types.ts`：`PopupManifestV2`、focus/backdrop、alpha、host placement 与 presentation snapshot。
- `packages/rendercore/src/popup/presentation.ts`：caller-owned viewport 中的 backdrop/content 分层和 focus transform。
- `packages/rendercore/src/popup/{manifest,package-resource,award-player,spine-player,spine-overlay-runtime}.ts`：v1/v2 strict parse、资源闭包与 player viewport API。
- `apps/popupeditor/src/{model,io,preview,ui}`：no-project 工作流、资源冲突决策、v1/v2 draft、自动预览和 inspector。
- `packages/rendercore/src/scene-layout/{package-runtime,presentation-surface}.ts`：通过 player `applyViewport()` 组合 host placement；旧 fake/consumer 保留兼容分支。
- `apps/gamelayoutpkgcli/src/reference-rewriter.ts`、`apps/gamelayouteditor/src/model/editor-project.ts`、`packages/gameframeworks/src/index.ts`：v2 typed consumer/re-export。
- `docs/popup-manifest.md` 与相关领域规则：记录 v1/v2、canvas ownership、资源入口和适配边界。

## 验收证据

通过：

```text
pnpm --filter @slotclientengine/rendercore test
  91 files / 766 tests passed，coverage threshold passed
pnpm --filter popupeditor test
  4 files / 28 tests passed，coverage threshold passed
pnpm --filter gamelayoutpkgcli test
  6 files / 21 tests passed
pnpm --filter @slotclientengine/gameframeworks test
  13 files / 91 tests passed
pnpm --filter gamelayouteditor exec vitest run \
  tests/popup-package.test.ts tests/zip-io.test.ts tests/app-shell.test.ts
  3 files / 55 tests passed
pnpm --filter @slotclientengine/rendercore --filter popupeditor \
  --filter gamelayouteditor --filter gamelayoutpkgcli \
  --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter popupeditor \
  --filter gamelayouteditor --filter gamelayoutpkgcli \
  --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/rendercore --filter popupeditor \
  --filter gamelayouteditor --filter gamelayoutpkgcli \
  --filter @slotclientengine/gameframeworks lint
git diff --check
```

Game Layout Editor 全量测试为 `184/185` 通过；唯一失败是
`tests/production-reel-preview.test.ts` 缺少仓库外/当前 fixture map 中的
`symbol-state-textures.manifest.json`（`Crave fixture ... is unavailable`）。该测试不经过 Popup 路径；直接相关的
Popup package、ZIP 与 app-shell 55 个测试已单独通过。

## 偏差与剩余事项

- 没有实现彩虹字、完整圆形或任意路径排版，符合第一版范围；保留 solid/linear-gradient、stroke、shadow、arc。
- 未修改 `assets/**`、workspace 依赖或 lockfile。
- 真实浏览器视觉、不同分辨率适配、透明 canvas 区点击、旧项目样本和实际游戏主 Pixi stage 的验收仍由用户执行。
- 构建仅有既有的大 chunk warning，没有新增构建错误。
