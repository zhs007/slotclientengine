# 204 RenderCore symbol value-to-text 与 compact viewport 执行报告

## 结果

任务 204 已在 SlotClientEngine 工作区实现。Crave 项目未修改；人工迁移步骤已写入
`docs/crave-task204-manual-migration.md`，浏览器验收按用户要求待 Crave 维护者执行。

基线：

```text
UTC: 2026-08-12T12:57:25Z
SlotClientEngine HEAD: 8deb918ac3955ec1f31aa8dab4e23a653831b803
Crave path: /Users/zerro/gitee.com/pixicrave
Crave HEAD: 49c19087b825c4bbebce00f2286c9d60080e9ebb
Crave status: clean
```

## 实现摘要

- 新增 public `SymbolValueTextFormatter`、`SymbolValueTextBindings`、
  `SymbolValueTextBindingMap`。Symbols package registry 使用 `valueTextBindings`，Scene Layout package
  runtime 使用 `symbolValueTextBindings` 下传；注册期严格校验 display symbol、exact node 和函数类型。
- `RenderSymbol.setPresentationValue()` 现在先求值并预检全部绑定 formatter、value tier、node 与
  glyph/special image，再提交 value 和多 node text。预检结果缓存到提交，避免 `SymbolGroup` preflight 后
  重复调用 formatter；same-value、manual `setText()` invalidation、`null` clear 和 pool reset 已覆盖。
- `SymbolImageStringController` 增加多 node batch validate/commit；单 node `setText()` 复用同一校验。旧自定义
  controller 的新 preflight 方法保持 optional，只有启用 binding 时要求 atomic batch capability。
- value controller 增加 optional preflight；内置 controller 在画面 mutation 前校验 tier/display resource，且
  同步 player factory 失败时保留旧 player/value。
- `calculateMaximizedFocusedArtViewport()` 对反投影后的 focus/art 两侧边界使用基于
  `Number.EPSILON` 和操作数尺度的 snap；直接 `calculateFocusedArtViewport()` 的严格 margin 合同未放宽。
- README、第一层 API 文档和 shared runtime 长期规则已同步。RenderCore 源码未硬编码 WL、WM、CM、
  `multiplier`、`x` 前缀或 `otherScene`。

## 测试与验收

当前 worktree 初始缺少依赖目录，`pnpm` 自动安装因受限网络失败；未修改 lockfile。随后只读复用同一 HEAD
主工作区的现有依赖，并以对应底层 `tsc`、`vitest`、`prettier` 命令完成 L2 验收。

通过：

```text
tsc -p packages/rendercore/tsconfig.json --noEmit
  PASS

vitest run tests/symbol-image-string/controller.test.ts
  tests/symbol-value-presentation/render-symbol-value-controller.test.ts
  tests/symbol/package.test.ts
  tests/viewport/focused-art-viewport.test.ts
  PASS: 4 files, 53 tests

vitest run <计划指定集合，排除两项已确认基线失败>
  PASS: 32 files, 273 tests

tsc -p packages/rendercore/tsconfig.build.json
  PASS

prettier --check <任务文档集合>
  PASS

git diff --check
  PASS
```

计划指定测试集合首次完整运行有两项失败：

1. `tests/symbol/render-symbol.test.ts` 仍期待旧的五层 children，实际基线已有七层；
2. `tests/symbol/manifest-cascade-presentation.test.ts` 未期待 v1 upgrader 已补出的
   `afterComplete: "return-to-default"`。

两项均在未包含任务 204 改动、同一 HEAD `8deb918...` 的主工作区独立复现，属于既有基线失败；本任务未修改
这些无关测试。除这两项外，计划指定集合 273 项全部通过。

## Crave 交付与待办

- 已新增 `docs/crave-task204-manual-migration.md`，按 Crave 当前 `round-adapter.ts`、
  `feature-anis.ts`、`default-scene-values.ts` 说明 formatter 注册、现有 `otherScene` target value 流、
  rolling resolver 边界和旧手工 `setText("multiplier", ...)` 清理方式。
- Crave 源码和 assets 均未修改，检查时工作区保持 clean。
- 浏览器人工验收未执行，按用户要求由 Crave 维护者完成；重点覆盖极小窗口 resize，以及 WL/WM/CM 在
  spinBlur、landing、settled 的同值连续性。

## 计划偏差与剩余风险

- 未新增 reel 状态机或 spin callback；rolling/target/landing 继续复用已有 presentation value 通道，因此
  reel/Scene Layout 以既有回归加 symbol transaction 测试证明，不新增重复状态机测试 fixture。
- 本地 rolling occurrence 若 resolver 返回 `null`，绑定文字按合同为空。Crave 当前 resolver 只给 CN 本地
  采样；WL/WM/CM 若需要本地临时模糊数字，仍需 Crave 明确配置公开本地策略，不能推断服务器轮带。
- 浏览器与真实 Crave package 的视觉结果仍需人工验收；本文不宣称外部项目已经迁移。
