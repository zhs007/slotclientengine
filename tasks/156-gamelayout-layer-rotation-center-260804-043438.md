# 156 gamelayout-layer-rotation-center 执行报告

UTC：2026-08-04 04:34:38

## 最终实现

- rendercore scene-layout v1 的 node placement 支持有限度数 `rotation` 与 `[0,1]`
  normalized `center`。旧 placement 缺少字段时 parser 规范化为 `rotation: 0`、
  `center: {x:0.5,y:0.5}`；Popup/Spine transition 仍严格只接受 `x/y/scale`，reel 仍只接受
  `x/y`。
- production runtime 在统一 outer node container 上应用 position、scale、pivot、angle，并补偿
  pivot position，保证 rotation 0 的旧画面不变。image 使用 manifest size，VNI 使用 stage，
  image-string 使用 authored layout；Spine 的默认 `0.5/0.5` 精确映射 authored origin `(0,0)`。
- geometry-only manifest 更新可实时修改 x/y/scale/rotation/center，不重建 texture、player、reel
  或 mode。package/presentation surface 复用同一 runtime。
- Game Layout Editor 的普通图层和背景 Inspector 增加 rotation、center x/y；新建、背景绑定、
  方向首次启用统一物化默认值，方向隐藏/恢复深拷贝完整 transform。
- editor mapped ZIP、legacy import 后 canonical export、gamelayoutpkgcli reference rewrite 与优化
  package flow 均保留 rotation/center。
- 更新 editor README、scene-layout manifest 文档及领域规则。

## 实际修改范围

```text
packages/rendercore/src/scene-layout/{types,manifest,runtime}.ts
packages/rendercore/tests/scene-layout/{manifest,runtime,presentation-surface}.test.ts
apps/gamelayouteditor/src/model/{editor-project,resource-commands}.ts
apps/gamelayouteditor/src/ui/{app-shell,layout-workspace,ui-markup}.ts
apps/gamelayouteditor/tests/{app-shell,coordinate-origin,editor-store,ui-markup,validation,zip-io}.test.ts
apps/gamelayoutpkgcli/tests/{reference-rewriter,package-flow}.test.ts
apps/gamelayouteditor/README.md
docs/scene-layout-manifest.md
docs/agent-rules/scene-layout.md
tasks/156-gamelayout-layer-rotation-center.md
```

没有修改游戏 app、资源、CLI 生产代码、依赖声明或 lockfile。

## 关键决策与计划偏差

- `SceneLayoutNodePlacement` 的 TypeScript rotation/center 保持 optional，允许旧 v1 typed fixture
  与 legacy in-memory caller 继续编译；`parseSceneLayoutManifest()` 的返回对象始终物化 canonical
  默认字段，editor 新建 draft 也始终物化。UI 在遇到旧内存 draft 时会在首次编辑前补齐字段。
- 没有修改 `game-mode-commands.ts`，因为其中的 `x/y/scale` 初值只属于任务明确排除的 Popup
  与 Spine transition；node/background 初值集中在 `resource-commands.ts`。
- optimizer 生产代码原有结构化 object spread 已正确保留 node placement，因此只增加 CLI
  round-trip 测试，没有制造多余 transform 分支。
- 增加 `ui-markup.test.ts` 定向覆盖 center input 的 min/max 标记；它是 UI helper 的直接测试。

## 自动验收

以下命令均使用 Codex 内置 Node 24 PATH 执行：

1. `pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest.test.ts tests/scene-layout/runtime.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/presentation-surface.test.ts`
   - 通过：4 files，45 tests。
2. `pnpm --filter gamelayouteditor exec vitest run tests/coordinate-origin.test.ts tests/editor-store.test.ts tests/layout-preview.test.ts tests/validation.test.ts tests/zip-io.test.ts tests/app-shell.test.ts tests/ui-markup.test.ts`
   - 通过：7 files，103 tests。
3. `pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/package-flow.test.ts`
   - 通过：2 files，7 tests。
4. `pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli typecheck`
   - 三个 package 全部通过。
5. `pnpm --filter gamelayouteditor build`
   - 通过。Vite 报告既有 dynamic import 无法拆 chunk 与大 chunk 提示，无 build error。
6. `git diff --check`
   - 通过。

首次运行测试时工作区缺失依赖，受限网络重试后用 Codex 内置 Node 24 PATH 完成 pnpm 安装；
lockfile 未变化。

## 浏览器验收（待用户执行）

运行：

```bash
pnpm --filter gamelayouteditor dev
```

建议复验：

1. 导入旧 layout ZIP，确认 image、Spine、VNI、image-string 原位置/scale/动画不变；分别设置
   `90`、`180`、`-90` 后切换 variant、mode、分辨率。
2. 对同一节点比较 center `0/0`、`0.5/0.5`、`1/1`；重点确认 Spine `0.5/0.5` 围绕
   authored origin 旋转，以及选中红框覆盖旋转后范围。
3. 导出、重新导入，再经 gamelayoutpkgcli 优化后用 production renderer 打开，确认字段、画面、
   mode/background 和 animation 保持，无新增 missing/orphan 诊断。

浏览器结果由用户回填；本报告不把自动化或 fake runtime 记为浏览器通过。

## 剩余风险

- 自定义非默认 Spine center 依赖 official Spine view 的 node-local width/height；默认
  `0.5/0.5` 不读取 bounds，固定为 authored origin。真实复杂 skeleton/skin 的非默认中心仍需
  浏览器视觉确认。
- 未执行 L3 整仓测试或发布验收；任务范围由 rendercore、gamelayouteditor、gamelayoutpkgcli
  直接依赖链的 L2 证据覆盖。
