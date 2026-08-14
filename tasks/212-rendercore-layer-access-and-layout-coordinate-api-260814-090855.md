# 212 rendercore-layer-access-and-layout-coordinate-api 执行报告

## 结果

任务 212 已完成实现与文档同步：

- `getRenderLayer(ref)` 统一 stable、SymbolArea、canonical node 与 `node:` legacy node 路由；旧 getter 仅保留兼容。
- Scene Layout runtime/package runtime/presentation surface 新增 authored point、Point↔Anchor 和 typed borrowed authored object capability。
- authored visibility override 与 mode/variant visibility 做 AND；程序资源 factory 的 caller-owned 合同不变。
- standard、grid-cell、CellSpin 的 `SymbolGroup` 统一提供 ordered middle、members/bounds center 与稳定 `getCellBounds()`。
- Gamelayout Editor 禁止 node 点号/保留 layer 名；旧 ZIP 导入确定性迁移点号、下划线、保留名与 collision，并原子重写 typed node references、显示 rename map。
- 新增完整 canonical 指南，并同步 RenderCore/Editor README、原坐标文档及三份领域规则。

## 关键文件

- `packages/rendercore/src/scene-layout/{render-layer-ref,types,runtime,package-runtime,presentation-surface}.ts`
- `packages/rendercore/src/symbol/symbol-group.ts`
- `packages/rendercore/src/reel/{render-reel-set,render-grid-cell-reel-set,render-cell-spin}.ts`
- `apps/gamelayouteditor/src/model/node-id.ts`
- `apps/gamelayouteditor/src/io/imported-layout-zip.ts`
- `docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md`

## 验收

- RenderCore 定向测试：8 files / 84 tests，通过。
- Gamelayout Editor 定向测试：3 files / 39 tests，通过。
- `@slotclientengine/rendercore` typecheck：通过。
- `@slotclientengine/gameframeworks` typecheck：通过。
- RenderCore 与 Gamelayout Editor build：通过。Vite 仅报告既有 dynamic-import/chunk-size warning。
- 目标文档 Prettier check：通过。
- `git diff --check`：通过。
- 浏览器人工验收：按用户要求留给用户执行。

## 已知基线问题

`gamelayouteditor typecheck` 的 source/dependency build 成功，但最终被未修改的 `tests/popup-package.test.ts` 三处既有 union narrowing 错误阻断：旧 `PopupManifest` variant 不保证 `backdrop`，旧 layer variant 不保证 `visibleStates`。本任务未扩大范围修改 Popup 测试或合同；Gamelayout Editor production build及本任务定向测试均通过。

## 偏差与剩余风险

- Editor 原有新建 node policy 已同时禁止下划线；为保证旧 ZIP 导入后可再次合法编辑/导出，migration 将旧下划线与点号一并规范化为连字符。
- 未迁移任何游戏业务代码；旧 production v1 package 继续由 rendercore parser 读取，并可用 `node:<legacyId>` 消歧。
- 未执行浏览器视觉验收、commit、push 或 PR。
