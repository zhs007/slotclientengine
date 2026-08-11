# 195 Popup Editor Spine slot 图层挂接执行报告

## 结果

已完成 Popup v4 图层挂接合同、rendercore strict graph/slot prepare/runtime assembler、Popup Editor 两级目标与 slot 选择、引用保护、资源覆盖回滚，以及 Game Layout/CLI/gameframeworks 的直接消费保护。浏览器人工验收按用户要求未执行，状态为待用户验收。

执行基线：

```text
UTC: 2026-08-11T07:31:43Z
HEAD: 152c59e2f023a5b055eda98066ccfe0b8d87c2e7
branch: (detached HEAD)
Node: 24.14.0
```

## 实现摘要

- Popup manifest 新增 strict v4：所有 award layer 与 Spine overlay 必须声明 `popup-root | vni-text-layer | spine-slot` attachment；v1/v2/v3 parser/runtime 保持兼容。
- graph 在 mutation 前校验同作用域 exact Spine target、main Spine 资格、self/任意长度 cycle 与 per-parent order；package prepare 汇总并校验每个目标的 exact required slots。
- award 与普通 Spine player 共用 slot assembler；同一 `(target, slot)` 只向 official Spine 注册一个稳定 owner group，组内 child 按各自 order 排序，destroy/detach 幂等。
- Popup Editor canonical 版本升级为 v4；旧 ZIP 缺失 attachment 和 ImgNumber legacy parent 迁移为 v4。所有图层卡片提供父节点下拉，选中 Spine 后再显示 exact slot 下拉；不默认猜 slot。
- 删除被引用 Spine layer 会列出依赖并阻止；资源 overwrite 使已选 slot 消失时 candidate transaction 回滚，原 bytes 和 attachment 不变。
- Game Layout Editor 可 vendor/import v4，CLI rewrite 保留 target layer id/slot 并只改资源引用；gameframeworks 导出 v4 public types。
- 更新 Popup Editor/rendercore README、Popup manifest 文档与两份领域规则。

## 自动验收

通过：

```text
rendercore popup + scene-layout: 7 files, 127 tests passed
popupeditor project/app-shell/preview: 3 files, 24 tests passed
popupeditor overwrite exact-slot rollback: included in project.test.ts, passed
gamelayoutpkgcli reference-rewriter/asset-groups: 2 files, 10 tests passed
gamelayouteditor v3/v4 vendor 定向用例: 1 passed
rendercore、popupeditor、gameframeworks、gamelayouteditor、gamelayoutpkgcli typecheck: passed
popupeditor build: passed（仅既有 chunk size warning）
git diff --check: passed
```

定向套件存在两组与本任务无关的既有 fixture 失败：

- `apps/popupeditor/tests/resource-import.test.ts`：4 个用例因 Minecart2 logical asset `big_win0721.json` 不存在而失败；其余 4 个通过。本任务新增的 overwrite rollback 用自包含 Spine fixture 覆盖并已通过。
- `apps/gamelayouteditor/tests/popup-package.test.ts`：multi-page Spine fixture 要求 animation `start`，当前 skeleton 不含该动画；同文件其余 4 个用例及 `zip-io.test.ts` 全部通过，新增 v4 vendor 断言所在用例单独运行通过。

依赖使用 `CI=true pnpm install --frozen-lockfile` 安装；未修改 lockfile，未新增依赖。

## 人工验收

待用户在浏览器完成计划第 8 节的五组场景：所有 layer kind 挂 exact slot、同 slot 背景/文字 order、main/nested Spine 与 cycle、overwrite/delete 引用保护、v4 导出重导入及 v3→v4 迁移。

## 偏差与剩余风险

- 未执行浏览器人工验收，这是用户明确保留的验收项。
- 未改 official Spine 单 owner API；Popup 层通过每 slot 一个 group 复用现有合同。
- 不支持跨 award tier target 或跨 slot 全局 order；不同 slot 的视觉顺序仍由 skeleton draw order 决定。
- 已知 Minecart2 与 multi-page Spine fixture 缺口未在任务 195 中扩范围修复。
