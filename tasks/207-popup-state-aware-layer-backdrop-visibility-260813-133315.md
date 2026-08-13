# 207 Popup 状态可见性执行报告

## 结果

- Popup canonical authoring 升级为 strict v5。
- `award-celebration` 的 backdrop 与所有 layer kind 使用五档 `visibleStates`；普通 Spine Popup 使用三阶段 `visibleStates`。
- 新图层默认全选当前项目状态，Editor UI 按项目类型显示对应复选项。
- v1–v4 仍按原版本 strict parse/prepare；Popup Editor 随后调用 shared upgrader 原子转换为 v5。
- 旧三阶段全选扩展为目标状态全选，部分选择按固定 index 迁移；旧无字段 layer 与 backdrop 迁移为全选。
- award / Spine production player 与 viewport backdrop 已按当前项目状态应用 visibility gate，动画 playback 生命周期保持独立。
- Game Layout 导入与 CLI typed rewrite 增加了 v5 `visibleStates` 保真测试，gameframeworks 导出 v5 public types。

## 自动验收

通过：

- `pnpm --filter @slotclientengine/rendercore lint`
- `pnpm --filter popupeditor lint`
- `pnpm --filter @slotclientengine/rendercore build`
- `pnpm --filter popupeditor typecheck`
- `pnpm --filter popupeditor build`
- `pnpm --filter @slotclientengine/gameframeworks typecheck`
- rendercore popup tests：15 files / 154 tests
- Popup Editor 定向 tests：3 files / 25 tests
- Game Layout v5 import 定向 test
- Game Layout package CLI reference rewriter：1 file / 7 tests
- `git diff --check`

未归因于本任务的既有 fixture 问题：

- Popup Editor 全量测试中的 4 个 `resource-import.test.ts` 用例缺少 Minecart2 logical asset `big_win0721.json`；本任务相关的 project / app-shell / preview 用例全部通过。
- Game Layout `popup-package.test.ts` 全量中的 multi-page Spine 用例使用的 fixture 缺少 `start` animation；新增 v5 import 用例单独通过。

## 人工验收

按用户安排，浏览器人工验收由用户执行。本次未启动浏览器验收。
