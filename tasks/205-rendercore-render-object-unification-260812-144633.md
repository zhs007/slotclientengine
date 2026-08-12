# 任务 205 执行报告：RenderCore RenderObject 统一

## 结果

- 新增 Container-backed、但不公开 Pixi display tree 的 `RenderObject` 与 `CloneableRenderObject` 公共合同。
- `SymbolRender`、普通 `TextRenderObject`、symbol value part和exact-name text part统一使用
  `clone()/getAnchor()/mount/transfer()`；`PresentationScope`、area/reel/cell/symbol attachment同步消费`RenderObject`。
- `SymbolRender.getPart()`使用strict `{kind:"value"}`或`{kind:"text",name}`；删除public
  `cloneValue/getValueAnchor/cloneText/getTextAnchor`，未知kind/name和未准备value显式失败。
- logical part的backing Container在每次操作/anchor resolve时读取；value跨tier替换display后，同一part façade解析当前表现。
- 盘面symbol/part为borrowed，禁止destroy和generic transfer；clone/factory object为owned，presentation scope按声明清理。
- detached image-string/value clone现在可再次clone，并保持创建时的文字、profile、transform与资源选择，不回读后续source状态。
- public `RenderNode/TextRenderNode/createTextRenderNode`一次性迁移为
  `RenderObject/TextRenderObject/createTextRenderObject`；game003v2只做对应factory机械迁移，业务时序不变。
- 新增Crave canonical人工迁移文档`docs/crave-render-object-migration.md`；旧task 203文档保留Popup/转场说明并链接新文档。

## 实际文件

核心新增：

```text
packages/rendercore/src/presentation/render-object.ts
packages/rendercore/src/presentation/text-render-object.ts
packages/rendercore/tests/presentation/render-object.test.ts
docs/crave-render-object-migration.md
```

删除旧实现：

```text
packages/rendercore/src/symbol/render-node.ts
packages/rendercore/src/symbol/text-render-node.ts
```

其余修改集中在RenderCore presentation/symbol/reel/value controller、直接测试、game003v2 factory调用、README、长期合同和领域规则。

## 验收

以下命令通过：

```text
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/symbol/symbol-render.test.ts tests/symbol-image-string/controller.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts tests/reel/render-reel-spin.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-cell-spin.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game003v2 test
pnpm --filter game003v2 typecheck
git diff --check
```

- RenderCore计划内组合：5个测试文件、43个测试通过；额外CellSpin定向文件10个测试通过。
- game003v2：3个测试文件、9个测试通过。
- source/长期文档定向搜索确认没有残留`RenderNode/TextRenderNode/createTextRenderNode/createRenderNode`。
- 首次把game003v2 test与typecheck并行启动时，测试早于typecheck的`gameframeworks`依赖build完成，出现一次import resolution失败；依赖完成后串行重跑以及最终并行复验均通过，不是代码回归。
- 初始workspace依赖不完整；使用Node 24环境与frozen lockfile补齐，lockfile未修改。

## 计划偏差

- 新增`docs/crave-render-object-migration.md`作为不带历史task编号的canonical Crave文档；原计划中的
  `docs/crave-task203-manual-migration.md`改为链接新文档，并继续保存Popup/转场合同。
- 为保证`CloneableRenderObject`语义完整，补充了detached value/image-string clone的再次clone能力；未扩大资源schema或业务API。
- 因game003v2直接consumer改名，补读并同步`docs/agent-rules/game003.md`中的旧类型名。

## 浏览器人工验收

按用户要求未由本会话执行，待用户完成。重点验证：

1. WL/WM/CM multiplier、CN value和whole symbol clone使用统一transfer形态且起终点正确。
2. CN跨tier后飞出外观与source当前tier、文字、颜色和scale一致。
3. spin打断后win layer无残留，borrowed source未被detach/destroy。
4. game003v2中奖金额文字的样式、group center位置、repeat和spin interruption无视觉回归。

## 剩余风险

- Crave是外部人工consumer，需按`docs/crave-render-object-migration.md`应用后执行其typecheck/test与浏览器验收。
- 本任务没有保留旧public命名alias；未登记的仓外consumer若显式import旧类型，需要按迁移表一次性更新。
