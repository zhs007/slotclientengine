# 任务 175 执行报告：Symbols Editor 档位 ImgNumber 与模糊状态

## 结果

- 将 value presentation 的 ImgNumber 编辑入口收进各档位卡片；共享资源、slot、transform、颜色和特殊值配置仍保留在父级区域。
- 为每个档位增加独立 `spinBlur` profile、状态提示和“生成并绑定模糊图”操作。
- 扩展 symbols manifest、资源闭包、package materialize、Vite 资源生成和 runtime，使档位 ImgNumber 能在 `normal` 与精确 `spinBlur` 状态间切换。
- `spinBlur` 状态没有对应档位 profile 时隐藏该 ImgNumber，不回退到清晰图；返回 `normal` 时恢复原 profile。
- 同源档位复用已经生成的模糊 dependency；生成过程不修改其他命名 ImgNumber 节点。
- 档位新增、删除、排序时保持 profile 数组对齐；源资源或特殊值变化时使相关模糊绑定失效。

## 主要合同

- shared value ImgNumber 使用与 `bindings` 对齐的 `tierSpinBlurProfiles`，未绑定项为 `null`。
- legacy tier binding 可直接携带 `spinBlurProfile`。
- 任一档位声明模糊 profile 时，symbol 必须声明精确的 `spinBlur` state。
- 模糊 profile 与 normal profile 的 glyph 字符集合、特殊值集合必须严格一致。
- normal 与 blur 使用同一个 display root；状态切换只改变 profile 和挂载位置，不重新分配展示实例。

## 验收

以下命令通过：

```text
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter symbolseditor typecheck
pnpm --filter @slotclientengine/rendercore test -- tests/symbol-value-presentation/manifest-resources.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts tests/symbol/package.test.ts tests/symbol/symbol-value-vite-resource-generator.test.ts tests/symbol-value-presentation/create-symbol-value-presenter.test.ts tests/symbol-value-presentation/value-display.test.ts
pnpm --filter symbolseditor test -- tests/app-shell.test.ts tests/image-string-spin-blur-generation.test.ts tests/editor-project.test.ts tests/resource-import.test.ts tests/zip-io.test.ts
pnpm --filter symbolseditor build
node --check packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
git diff --check
```

- Rendercore：6 个测试文件、87 个测试通过。
- Symbols Editor：5 个测试文件、54 个测试通过。
- Vite production build 通过，仅有既存的大 chunk 提示。
- 本地浏览器确认 Symbols Editor 可启动并显示初始工作区。当前浏览器自动化接口不能向原生文件选择器注入本地 game config，因此带真实 Spine/ImgNumber 资源的最终画面检查仍需人工复核。

## 后续人工复核

1. 导入包含两个 value tiers、`normal`/`spinBlur` Spine slot 和 ImgNumber dependency 的项目。
2. 确认每个档位卡片内均显示自己的 ImgNumber JSON、模糊绑定状态和生成按钮。
3. 分别为两个档位生成模糊图，确认第二次复用同源 dependency。
4. 在预览中切换 `normal`/`spinBlur`，确认同一显示对象在 Spine slot 与 blur overlay 间切换，且返回 normal 后恢复清晰图。
5. 导出 ZIP 后重新导入，确认档位 profile、特殊值图片和资源闭包保持一致。

## 关联文档

- 计划：`tasks/175-symbolseditor-tier-imgnumber-blur.md`
- 更新：`apps/symbolseditor/README.md`、`packages/rendercore/README.md`、`docs/symbol-package.md`
