# 160 Symbols Editor ImgNumber 特殊值与全状态 target 执行报告

## 实现结果

- 为命名 `imageStringNodes` 与 `valuePresentation.text.type: "image-string"` 增加 strict、稀疏、无数量上限的 `specialValueImages: [{ value, image }]`。exact safe-integer 字符串命中时显示整图，未命中时继续严格 glyph 渲染。
- RenderCore 增加 mapped ImgNumber display、特殊图片共享资源池、精确 package/Vite closure、原子文本切换和共享 texture 生命周期；特殊图片复用既有 anchor、transform、target/slot 与颜色合同。
- 命名 ImgNumber target 扩展到全部 symbol state：official Spine 和档位 activeSpine 必须配置 exact slot；其余 visual kind 使用无 slot 的 state target，挂载到固定顶层 ImgNumber overlay；composite 不选择内部 leaf。
- Symbols Editor 增加命名/档位 ImgNumber 特殊映射的逐项增删、整数编辑与普通 Image Picker 绑定；state selector 展示全部 state，并只对 Spine-backed state 展示 slot selector。
- 更新 manifest parser、Symbols ZIP 导入/导出、asset references、生成器、README、Symbol Package 文档和两份领域规则。

主要改动位于：

- `packages/rendercore/src/symbol-image-string/`
- `packages/rendercore/src/symbol-value-presentation/`
- `packages/rendercore/src/symbol/{manifest,package,render-symbol,types}.ts`
- `packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs`
- `apps/symbolseditor/src/model/editor-project.ts`
- `apps/symbolseditor/src/ui/{resource-picker,ui-session,workspace-app}.ts`
- 对应 RenderCore / Symbols Editor 测试与 README/领域文档。

## 关键决策与计划偏差

- 保持 manifest v1，通过可选字段向后兼容；无 mapping 的旧 manifest round-trip 不新增空字段。
- direct overlay 使用独立、固定顶层 container，不复用 animation overlay，避免 state reset 清空 ImgNumber。
- 特殊图片和 glyph 共用现有 image module/texture loading owner，不新增第二套资源表，也不销毁共享 texture。
- 未修改正式业务 manifest 或 generated TypeScript；generator 行为由新增测试验证，因此没有需要执行的实例 `--check`。
- 浏览器人工验收完成了真实 game config 加载、Symbols/ImgNumber 面板和控制台错误检查；仓库没有可直接导入的 standalone ImgNumber ZIP，因此完整 CRUD/导出重开由自动化测试覆盖，未伪造正式资源。

## 验收结果

- `pnpm --filter @slotclientengine/rendercore --filter symbolseditor typecheck`：通过。
- `pnpm --filter @slotclientengine/rendercore test`：通过，80 files / 642 tests，coverage 门槛通过。
- `pnpm --filter symbolseditor test`：通过，10 files / 74 tests。
- `pnpm --filter @slotclientengine/rendercore --filter symbolseditor build`：通过；Symbols Editor 仅保留既有 Vite chunk-size warning。
- `git diff --check`：通过。
- 本地浏览器：`assets/gamecfg002/gameconfig.json` 可创建项目；Symbols → ImgNumber 面板显示“任意 state / Spine exact slot / 其他类型顶层图层”合同；控制台无 error。

## 剩余风险与未完成项

- 无代码或自动化未完成项。
- 特殊图片使用自然尺寸；最终美术仍需在真实 ImgNumber ZIP 与目标 Spine/普通 state 上确认视觉尺寸和 anchor/scale。
- mapping 数量不设产品上限，会线性增加 package 体积和预加载成本，继续受现有 workspace/ZIP 限制约束。
