# 157 Popup Editor ImgNumber 预览格式执行报告

## 结果

任务 157 已完成。Popup Editor 预览区新增仅当前页面会话生效的“小数位数”和“千位分隔”设置：小数位默认 `0`、严格限制为 `0..6` safe integer，千位分隔默认关闭；启用后固定使用 `.` 作为小数点、`,` 作为分组符。raw `1234567` 配置两位小数和分组后显示为 `1,234,567.00`，整数始终按配置补足尾零。

新设置通过现有 `createAwardCelebrationPlayer({ formatAmount })` 注入 production preview player，并复用 rendercore 的 `formatPopupAmount(rawScale=1)`。它不进入 `PopupEditorProject`、production `amountFormat`、manifest、asset map 或 Popup ZIP；导入 Popup project 不覆盖当前会话设置，刷新页面恢复默认值。

## 主要修改

- `apps/popupeditor/src/preview/popup-preview.ts`
  - 增加 app-private `PopupPreviewAmountFormat`、默认值、严格校验和格式 helper。
  - player formatter 动态读取当前 preview 设置，不重建资源或复制 award 状态机。
- `apps/popupeditor/src/ui/app-shell.ts`
  - 预览区增加小数位和千位分隔控件，并明确标注“仅预览”。
  - 空值、非整数和越界值进入现有 diagnostics，不隐式转换为默认值。
- `apps/popupeditor/tests/{preview,app-shell}.test.ts`
  - 覆盖默认值、固定 2/3 位尾零、多组 comma、非法输入、player callback、production amountFormat 隔离、导出不携带和 Popup ZIP 导入不覆盖会话设置。
- `apps/popupeditor/README.md`
  - 记录 raw whole-unit 解释、固定符号、默认值、会话边界和 missing-glyph strict failure。

没有修改 model、Popup ZIP IO、resource import、rendercore public API/schema、lockfile 或领域规则。

## 计划偏差

- 不需要新增独立 formatter 文件或修改样式；helper 留在现有 `popup-preview.ts`，现有 preview controls 布局可直接容纳两个控件。
- 浏览器/Pixi/真实 ImgNumber 人工验收按用户明确要求由用户处理，本会话未执行，也未用 DOM 测试或 build 冒充视觉验收。
- 工作区最初缺少依赖，使用 bundled Node 24 和 `CI=true pnpm install --frozen-lockfile` 恢复；`pnpm-lock.yaml` 未变化。

## 自动验收

以下任务计划规定的 L1 命令最终全部通过：

```text
pnpm --filter popupeditor typecheck
pnpm --filter popupeditor exec vitest run tests/app-shell.test.ts tests/preview.test.ts
  2 files / 6 tests passed
pnpm --filter popupeditor lint
pnpm --filter popupeditor build
pnpm --filter popupeditor format:check
git diff --check
```

production build 成功；保留既有主 chunk 大于 500 kB 的 Vite warning，没有新增 build error。

## 待用户浏览器验收

1. 导入同时包含 `0..9`、`.`、`,` glyph 的真实 ImgNumber 并 Build preview。
2. 用 win raw `1234567` 分别验证 `0`、`2`、`3` 位小数结果，以及开启分组后的 `1,234,567.00`/`1,234,567.000`。
3. 验证计数过程、跨档、Advance、Dismiss 和 Replay 只改变金额文本格式，不改变时序与动画生命周期。
4. 导出并重导 Popup ZIP，确认预览设置不被 ZIP 恢复或覆盖；刷新页面后回到 0 位和关闭分组。
5. 用缺少 `.` 或 `,` glyph 的 ImgNumber 启用对应设置，确认 exact missing-glyph error，无 fallback 或空白替代。

## 剩余风险

- 实际标点 glyph 的 advance、offset 和 fixed group 完全由 ImgNumber manifest 决定；自动化只证明格式文本、严格失败和数据流，最终视觉间距仍需真实资源验收。
- 播放中修改格式会从下一次 player tick 起生效，可能使金额宽度即时变化，但不会重启计数或改变当前 tier。

未 commit、未 push、未创建 PR。
