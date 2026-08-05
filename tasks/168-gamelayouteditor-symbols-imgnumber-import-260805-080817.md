# 168 Game Layout Editor Symbols ImgNumber 导入执行报告

## 结果

任务 168 已完成自动化实现与验收。Game Layout Editor 物化 Symbols dependency 时，现在会同步改写：

- `imageStringNodes[].resource`；
- 命名 ImgNumber 的 `specialValueImages[].image`；
- `valuePresentation.text.type="image-string"` 的每档 `tiers[].resource`；
- value ImgNumber 的 `specialValueImages[].image`；
- nested image-string manifest 内的 glyph filename key。

package id、image-string id、node name、targets、tier 与其它业务配置保持不变；不同 package id 继续由稳定
owner prefix 隔离，同 package id 只通过显式 replace 覆盖 owner 独占 bytes。

真实 `/Users/zerro/Downloads/minecart2/minecart2-symbols.zip` 已通过无纹理解码的正式 importer：

```text
id: minecart2
resources: 82
dependency files: 85
rootKey: pkg-9-minecart2-symbols.package.json
imageStringResource: ./pkg-9-minecart2-new-image-string-2.image-string.manifest.json
```

## 实际修改文件

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/materialize-package.ts
packages/rendercore/tests/symbol/materialize-package.test.ts
apps/gamelayouteditor/tests/imported-symbol-package.test.ts
apps/gamelayouteditor/tests/game-mode-commands.test.ts
tasks/168-gamelayouteditor-symbols-imgnumber-import.md
tasks/168-gamelayouteditor-symbols-imgnumber-import-260805-080817.md
```

未修改 SymbolsEditor、ImgNumber Editor、editorresource、browserartifactio、Scene Layout schema、assets、
生成物或 lockfile。

## 关键决策与计划偏差

- 核心修复保留在 rendercore Symbols materializer；gamelayouteditor 没有新增 ImgNumber 私有解析或命名
  分支。
- 执行中发现命名 ImgNumber 已允许 flat mapped manifest key，但 value ImgNumber parser 仍只接受旧的
  `./.../image-string.manifest.json` 目录形式。为满足计划中的两类 ImgNumber parity，
  `packages/rendercore/src/symbol/manifest.ts` 改为让两者复用同一个严格本地 path 校验，并允许
  `./<owner-prefix>-image-string.manifest.json`；仍要求 `./`、固定 manifest 后缀、无反斜杠且能安全解析。
- 这是有直接失败用例支持的小幅文件范围扩展，不改变 schema 字段或 runtime API。
- 未新增 `zip-io.test.ts` 用例：现有 ZIP round-trip/exact closure 测试和 filename-key physical dedup 测试
  已覆盖交付边界，本次直接重跑对应 ZIP suite；新增测试集中保护此前缺失的 owner typed rewrite 与
  dependency owner isolation。

## 自动化验收

以下命令最终均通过：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/manifest.test.ts tests/symbol/materialize-package.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/imported-symbol-package.test.ts tests/game-mode-commands.test.ts tests/zip-io.test.ts
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor typecheck
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor build
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor format:check
git diff --check
```

结果：

- rendercore 定向测试：2 files，45 tests passed；
- gamelayouteditor 定向测试：3 files，40 tests passed；
- 两 package typecheck、build、format check 与 `git diff --check` 全部通过；
- 真实 minecart2 ZIP 的 map/hash/size、standalone schema、exact closure、owner-prefix materialization 和
  物化后 revalidation 通过；
- gamelayouteditor build 只有既有的 dynamic import/code splitting 与大 chunk 警告，构建成功。

新工作树最初缺少 workspace 依赖与 dist。按仓库约定使用 Node 24 执行
`CI=true pnpm install --frozen-lockfile` 并构建直接依赖后完成验收；未修改 `pnpm-lock.yaml`。

## 待用户浏览器验收

状态：`待用户验收`。

1. 在空白 Game Layout Editor project 导入 `minecart2-symbols.zip`，确认不再出现缺少
   `new-image-string-2.image-string.manifest.json`。
2. 绑定合法 reelSet/renderMode，打开 reel preview，确认 `image-value` ImgNumber glyph 正常显示。
3. 切换 mode/variant，确认 dependency 与 preview 不丢失或串包。
4. 导出 Layout ZIP 并重导，确认 Symbols binding、ImgNumber 和 preview 保持一致。
5. 如有另一个不同 package id、但内部使用同名 ImgNumber 的 ZIP，连续导入并确认两个 package 可独立
   选择与预览。

## 交付状态

- 自动化验收：完成。
- 真实 ZIP headless importer：完成。
- 用户浏览器验收：待执行。
- commit/push/PR：未执行。
