# 176 gamelayouteditor-symbol-resource-order-roundtrip 执行报告

UTC：`2026-08-06T07:58:34Z`

## 最终实现

- `flattenLayoutClosure()` 对 `kind="symbol-package"` 改用 typed filename-key rewrite：只改写
  `entrypoints.gameConfig`、`entrypoints.symbolManifest` 和 `resources[]`。
- Symbols resources 在完整 source → final logical key mapping 后按
  `localeCompare(..., "en")` 重新排序，并立即由 `parseSymbolPackageManifest()` 严格复验。
- mapped workspace 提交前新增 `collectSceneLayoutPackagePaths()` 复验，确保改写后的 layout、nested package
  与 exact closure 自洽。
- 未修改 rendercore parser、standalone Symbols import、mapped Layout import migration、art-size 合同或
  `layout3.zip` 兼容行为。

修改文件：

```text
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/tests/zip-io.test.ts
tasks/176-gamelayouteditor-symbol-resource-order-roundtrip.md
tasks/176-gamelayouteditor-symbol-resource-order-roundtrip-260806-075834.md
```

## 回归保护

- 新增 `A-+.png` / `A-1.png` synthetic Symbols dependency；source package 先满足 strict canonical order，
  punctuation/lowercase normalization 后要求 exporter 按最终 `a-1.png` / `a.png` 顺序重新 canonicalize。
- 测试解析实际导出 ZIP 中的 mapped nested `symbols.package.json`，再通过正式 `importLayoutZip()` 重导，
  并验证 adaptation、Symbols binding 和 package closure 保留。
- 修复前该用例稳定复现 `symbol package resources must be sorted by canonical path.`；修复后通过。

## 验收结果

```text
PASS pnpm --filter gamelayouteditor exec vitest run tests/zip-io.test.ts
     1 file, 21 tests passed
PASS pnpm --filter gamelayouteditor typecheck
PASS pnpm --filter gamelayouteditor build
PASS pnpm --filter gamelayouteditor format:check
PASS git diff --check
```

环境准备：按仓库规则使用 Node `24.14.0`，执行 `CI=true pnpm install --frozen-lockfile`；lockfile 未变化。
首次依赖准备发现 `browserartifactio` 尚无 dist，先定向构建该基础包后再运行既定命令，未修改 package script。

## 人工验收

按用户要求，真实浏览器流程由用户执行，当前未标记通过：

```text
/Users/zerro/Downloads/crave/layout2.zip
  → 导入 /Users/zerro/Downloads/crave/symbols.zip
  → 重新导出 Layout ZIP
  → 重新导入新 ZIP
```

复验重点：新 ZIP 不再出现 resource-order/art-size 错误，`adaptation.artSize` 保持 `2000 × 2000`，
Symbols preview 可准备。现有 `layout3.zip` 按确认删除或忽略，不属于兼容目标。

## 计划偏差与剩余风险

- 无实现范围偏差；未修改计划外 public API、schema、规则、依赖或 lockfile。
- 真实 PNG/Spine/ImgNumber 浏览器解码与 File Picker 往返仍待用户人工验收；headless test 使用
  `loadSymbolTextures:false`，不冒充该视觉验收。
