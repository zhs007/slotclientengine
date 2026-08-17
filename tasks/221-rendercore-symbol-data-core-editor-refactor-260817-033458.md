# 221 RenderCore Symbols 分层重构执行报告

## 结果

- RenderCore 新增 `symbol/data`、`symbol/core`、`symbol/editor` 三个显式 public subpath，删除旧 `./symbol` export 与 root symbol wildcard。
- 内部 mutable occurrence 统一为 `SymbolPlayer`，游戏公开 capability 统一为 `SymbolHandle`；生产源码、测试和非迁移文档中的旧倒装 API 名为零。
- `SymbolPlayer` 未从 root、core 或 editor barrel 导出；Symbols Editor、Game Layout Editor 与 symbolsviewer 改用 `SymbolPreviewPlayer` wrapper，只挂载 `view`，Application/canvas/ticker 仍由 app 拥有。
- `SymbolPackageResource.createCatalog()` 对同一 resource 只构造并缓存一次 catalog；增加 identity 回归测试和 symbol steady-update benchmark。
- gamelayoutpkgcli 使用 data；Game Layout Editor 的纯 parser/rewrite 使用 data，mapped package/preview 使用 editor；gameframeworks、game002v2、game003v2 的 runtime 类型使用 core。
- game002v2/game003v2 的 source、tests type import 与 Vite 子路径 alias 已直接迁移。
- 已新增 Crave 手工迁移文档；外部 Crave 仓库保持未修改。

## 关键文件

- `packages/rendercore/src/symbol/{data,core,editor}/index.ts`
- `packages/rendercore/src/symbol/editor/preview-player.ts`
- `packages/rendercore/src/symbol/symbol-player.ts`
- `packages/rendercore/src/symbol/symbol-handle.ts`
- `packages/rendercore/src/reel/symbol-player-pool.ts`
- `packages/rendercore/tests/symbol/public-boundary.test.ts`
- `packages/rendercore/benchmarks/symbol-runtime-hot-path.mjs`
- `docs/crave-task221-symbol-layer-migration.md`

## 自动验收

通过：

- RenderCore typecheck、build。
- gameframeworks、symbolseditor、gamelayouteditor、gamelayoutpkgcli、symbolsviewer、game002v2、game003v2 typecheck。
- symbol/reel 定向测试：35 files，291 tests。
- Game Layout Editor wrapper 定向测试：13 tests。
- gamelayoutpkgcli：6 files，25 tests。
- game002v2：8 files，16 tests；game003v2：3 files，9 tests。
- symbolseditor、gamelayouteditor、symbolsviewer、game002v2、game003v2 build。
- public export/旧名/旧混合 import 搜索与 `git diff --check`。
- benchmark：100000 steady updates，2.131ms，heap delta -10536 bytes（本机观测值，不作门槛）。

未通过但已最小化：

- RenderCore 全量 test 尚有 14 个非 task 221 失败：13 个既有 Scene Layout 测试 fixture 使用空 `nodes`，被当前 strict parser 拒绝；1 个既有 popup placement 断言不匹配。本任务未修改对应 production 行为或 fixture。
- editor/viewer 聚合 test 中，Symbols Editor、production preview 和 symbolsviewer 的失败均为当前 `assets/crave/assets.map.json` 不提供 `symbol-state-textures.manifest.json` 等 Crave fixture；与 task 221 API 编译无关。Game Layout Editor wrapper mock 的 task 221 回归已修复并单独通过。

## 浏览器验收

按用户安排未执行，由用户复验 Symbols Editor、Game Layout Editor、game002v2 与 game003v2 的视觉、Performance 和 Memory。自动验收不能替代该项。

## Crave

只读审计基线为 `e726d37acf4da4238df29830b0b374fa23638d6c`，审计时干净。迁移说明明确允许无 `--delete` 的 shared `packages/` 覆盖同步，同时保留 Crave 独有 `bridgecore` 等 package，并列出 Crave app type import、Vite alias、测试和浏览器复验步骤。
