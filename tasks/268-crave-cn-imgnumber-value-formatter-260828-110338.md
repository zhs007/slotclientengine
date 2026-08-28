# 268 crave-cn-imgnumber-value-formatter 执行报告

## 最终实现

- RenderCore 新增 `SymbolValueTextFormatterMap`，Scene Layout package runtime 通过
  `symbolValueTextFormatters` 接收 `symbol -> (rawValue) => string`。
- raw presentation value 继续负责 tier 选择和 occurrence 状态；formatter string 只进入 intrinsic
  image-string value display。
- package/generic reel registry、lightweight rolling、settled/landing SymbolPlayer 和 standalone presenter
  使用同一 formatter/validation helper。
- 未注册 formatter 时保持 `String(rawValue)`；现有 named node `symbolValueTextBindings` 不变。
- formatter 注册目标、函数、异常、非空 string、default value 与运行值的 tier glyph/special closure 均严格校验。
- package prepare 不再要求 raw default value 本身可由 ImgNumber glyph 渲染；formatter 已知后在 registry/presenter
  装配阶段完成 closure 校验。tier binding、资源 dependency 和 layout compatibility 仍在 prepare 阶段校验。
- 更新 RenderCore README、shared runtime 领域规则和任务计划。未修改 pixicrave。

## 计划偏差

- 用户在执行前明确把范围从 pixicrave app 改为 Engine-only，计划已按最后指令重写。
- 实施审查发现 package prepare 的 raw string glyph 校验会阻止 `raw 50 -> "5"` 一类合法 formatter，因此把该
  校验延后到 formatter 已知的装配阶段，并增加 symbol package dependency closure 定向测试。

## 验收结果

```text
PASS pnpm --filter @slotclientengine/rendercore exec vitest run \
  tests/symbol/package.test.ts \
  -t "derives the exact nested image-string dependency closure"
  1 passed, 13 skipped

PASS pnpm --filter @slotclientengine/rendercore exec vitest run \
  tests/symbol-value-presentation/manifest-resources.test.ts \
  tests/reel/symbol-registry.test.ts \
  tests/symbol-value-presentation/symbol-player-value-controller.test.ts \
  tests/symbol-value-presentation/symbol-value-presenter.test.ts
  36 passed

PASS pnpm --filter @slotclientengine/rendercore typecheck
PASS pnpm --filter @slotclientengine/rendercore build
PASS prettier --check（本任务文件）
PASS git diff --check
PASS /Users/zerro/gitee.com/pixicrave git status --short（clean）
```

补充观察：扩展运行整个 `tests/symbol/package.test.ts` 时，14 个用例中 13 个通过；未通过用例仍期望
`rawSymbolManifest.version === 2`，当前基线 parser 返回 version 3。该断言与本任务修改的 ImgNumber dependency
closure/formatter 路径无关，本任务未修改 manifest version/parser，也未顺手调整该既有期望。

## 未完成的人工验收

- 按用户要求未修改或运行 pixicrave。consumer 接入后仍需在真实资源中观察 CN rolling、landing、settled 显示一致，
  并确认 raw value 继续命中原有 tier。

## 剩余风险与未完成项

- Engine 工作项已完成。consumer formatter 返回值必须属于各 tier ImgNumber glyph 或 special-value exact closure；否则
  Engine 会在画面 mutation 前显式失败。
