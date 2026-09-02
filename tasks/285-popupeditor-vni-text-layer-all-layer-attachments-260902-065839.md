# 任务 285 执行报告：Popupeditor 任意图层嵌入 VNI 文字图层

## 结论

已完成任务 285。Popupeditor 的图片、字体文字、ImgNumber、VNI、Spine 图层现在都可以把当前运行作用域内既有 VNI 实例的任意文字图层选为父节点；Award、Spine Popup 和 Single State 三种编辑场景均已覆盖。

共享 RenderCore 同步采用相同语义：VNI 文字父子关系与 Spine 父子关系共同参与有向无环图校验，拒绝自引用、纯 VNI 环和 VNI/Spine 混合环；资源准备阶段严格验证目标 VNI 实例及精确文字图层存在。

## 实际改动

- 扩展 Popupeditor 的 VNI 文字图层候选查询，使其支持 Award tier、Spine Popup 和 Single State 三种作用域。
- 所有五种 Popup 图层均展示 VNI 文字父节点选项，并在选择时立即校验精确目标、自引用和组合环路；失败不会提交草稿。
- 扩展 RenderCore attachment graph，使所有图层到 VNI 文字图层的关系进入与 Spine 关系共用的 DAG。
- 在 package resource 准备阶段统一校验 Award、Spine overlay 和 Single State 的 VNI 文字父节点，不再只覆盖 ImgNumber。
- 保持 v4-v9 现有 attachment 数据结构不变；v1-v3 legacy ImgNumber parent 兼容语义不变。
- 补充编辑器、manifest、资源准备和 runtime attachment 生命周期测试，并更新相关 README、manifest 文档和领域规则。

## 关键实现决定

- 不升级 manifest 版本。v4 起所有 Popup 图层已经共用 `PopupLayerAttachment`，现有 `vni-text-layer + vniLayerId + textLayerId` 足以无损表达本次能力；本次只扩大已有结构的合法组合并加强校验，不改变序列化形状。
- 继续遵守版本兼容合同：Runtime/Editor 可读取 v1-v9，旧版本缺省 attachment 时沿现有升级链补为 `popup-root`，v1-v3 legacy ImgNumber `parent` 结构化迁移为 attachment，Editor canonical export 固定输出最新 v9。
- 候选只来自当前项目、当前运行作用域内已经存在的 VNI 图层实例，不从 assets 列表构造尚未实例化的父节点。
- 父节点保存精确的 VNI 图层 id 与文字图层 id；未知资源、未知图层或非文字图层显式失败。
- 子图层仍由调用方持有，RenderCore 只负责稳定挂载、顺序和幂等解绑，不改变资源 ownership。
- 原计划预留了 VNI runtime 修改，但现有通用文字挂载能力已经支持任意 DisplayObject，因此无需修改 `packages/vnicore`。

## 自动化验收

在 Node.js `v24.14.0` 下完成：

- `pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/layer-attachment.test.ts tests/popup/manifest.test.ts tests/popup/package-resource.test.ts tests/popup/award-player.test.ts tests/popup/spine-player.test.ts tests/popup/single-state-player.test.ts`
  - 6 个测试文件、135 项测试通过。
- `pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/app-shell.test.ts tests/preview.test.ts`
  - 3 个测试文件、32 项测试通过。
- `pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/state-visibility.test.ts`
  - 1 个测试文件、7 项版本兼容测试通过，覆盖旧 source version 到 latest 的规范化、latest 重读幂等和未知版本拒绝。
- `pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck`
  - 两个目标包均通过。
- `pnpm --filter @slotclientengine/rendercore --filter popupeditor build`
  - 两个目标包均通过；仅保留 Vite 已有的 `__dirname` 迁移提示和大 chunk 提示。
- 变更文件 Prettier 检查通过。
- `git diff --check` 通过。
- 搜索旧的 ImgNumber-only/VNI attachment 限制描述，无残留。

依赖安装时，仓库当前 `pnpm-lock.yaml` 缺少 `@typescript-eslint/eslint-plugin@8.58.0` 对应条目，导致 `CI=true pnpm install --frozen-lockfile` 失败。为完成验收，随后使用 `CI=true pnpm install --no-frozen-lockfile --lockfile=false` 补齐本地依赖；没有修改 lockfile、package manifest 或依赖版本声明。

## 浏览器验收交接

按任务约定未代跑浏览器验收。建议人工覆盖：

1. 在 Award tier、Spine Popup、Single State 中分别创建一个 VNI 图层，并确认其文字图层会出现在同作用域其他各类图层的“父节点”列表中。
2. 分别把图片、字体文字、ImgNumber、VNI、Spine 挂到 VNI 文字图层，预览位置、层级、动画跟随和保存后重载结果。
3. 尝试 VNI 自引用以及 VNI/Spine 混合成环，确认编辑器拒绝提交且原项目数据保持不变。

## 剩余风险

自动化测试覆盖了 schema、候选枚举、编辑交互、资源校验、组合环路和 runtime 挂载生命周期。不同正式 VNI 美术中文字锚点、局部变换和遮挡效果仍需以上浏览器视觉验收确认。
