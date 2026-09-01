# 278 editorcore-event-dialog-search 执行报告

## 结果

已在 EditorCore 共享 Game Layout event dialog 中完成全 catalog 筛选检索；Event 组新增/修改与 single picker
复用同一行为。浏览器人工验收按用户要求保留给用户执行。

## 实现与文件

- `packages/editorcore/src/assets/ui/game-layout-event-dialog.ts`
  - 检索框在 row editor 激活后始终显示，不再依赖当前 facet 候选数量。
  - query 在 family、facet 与 breadcrumb 操作间保留，row/open/root 生命周期仍按原逻辑清空。
  - family id/展示名优先匹配；没有 family 命中时，再匹配 facet key/展示名/value 与 canonical address。
  - family、facet、后续数量、exact selected entry 与保存按钮共用过滤后的 catalog entry 集。
  - 无结果时显式提示且禁用保存；清空 query 恢复原路径与完整候选。
- `packages/editorcore/src/assets/ui/assets-view.css`
  - 增加搜索栏、匹配数量、空状态和窄屏单列样式。
- `packages/editorcore/tests/adapters-and-ui.test.ts`
  - 覆盖 `spin` family 优先、大小写/首尾空白、深层 facet value、完整 address、无结果、清空恢复、query 跨
    facet 保留、输入焦点和 single picker。
- `packages/editorcore/README.md`
  - 记录始终可用的全 catalog 检索、匹配字段、family 优先级和深层命中的祖先分支投影。

## 关键决策与计划偏差

- 首轮测试发现 Symbol event 的 canonical address 也包含通用 `/spin/` 路径；若所有字段等权匹配，输入 `spin`
  会同时显示 Symbol family，与用户示例冲突。
- 最终采用 family 优先：query 命中任一 family id/展示名时只显示对应 family；否则才检索 facet/address。完整
  canonical address 和 `entered` 等深层值检索仍保留。这是计划内 matcher 的小幅语义收紧，没有修改 public API、
  RenderCore catalog 或 consumer。

## 自动验收

使用 Node.js `v24.14.0`：

```text
pnpm --filter @slotclientengine/editorcore typecheck
PASS

pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
PASS: 1 file, 16 tests

pnpm --filter @slotclientengine/editorcore build
PASS

pnpm exec prettier --check <任务 278 的 EditorCore 源码、CSS、测试、README 与本报告>
PASS

git diff --check
PASS
```

依赖环境说明：仓库现有 `pnpm-lock.yaml` 缺少一条 `@typescript-eslint/eslint-plugin` resolution，导致规定的
`CI=true pnpm install --frozen-lockfile` 在安装前失败。本次仅为 8 个 EditorCore 依赖链 workspace package 执行
`pnpm install --filter @slotclientengine/editorcore... --no-frozen-lockfile --lockfile=false`；未读写 lockfile，Git 状态
没有依赖或生成物变更。

## 人工验收

未执行，由用户在浏览器验收。建议检查：

1. Event 组添加界面输入 `spin`，只显示“Spin 生命周期”及其可达分支。
2. 输入深层 facet value 或完整 canonical address，确认只保留通向匹配 Event 的祖先分支；无结果时不能保存，
   清空后原选择路径恢复。
3. Gamelayout Editor 结束 Event single picker、窄屏布局、连续输入焦点、取消和重开行为。

## 剩余风险

- 真实浏览器视觉布局、原生 search 清除按钮与窄屏交互尚待用户确认。
- 检索为每次输入线性扫描当前 immutable catalog；现有 fixture 与自动测试无性能问题，若未来 catalog 规模显著
  增长可增加 dialog-session 内缓存，但不应引入持久索引或第二份 event 表。
