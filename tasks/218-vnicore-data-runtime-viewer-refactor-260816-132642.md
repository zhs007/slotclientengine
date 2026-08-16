# Task 218 VniCore data/runtime/viewer 重构执行报告

## 结果

Task 218 已完成代码与自动化验收。VniCore public surface 已切换为三个显式入口：

- `@slotclientengine/vnicore/data`：schema/types、strict validation、bundle/profile、asset manifest/path rewrite 和 layer-group 数据合同；不依赖 core/viewer。
- `@slotclientengine/vnicore/core`：`VNIRuntime`、manual transport、particle-combo variant 和 runtime pool；构造只接收 `parent/project/assetUrls`，由 game host 调用 `update(deltaSeconds)`。
- `@slotclientengine/vnicore/viewer`：组合 `VNIRuntime`，拥有 RAF、viewport/zoom、DOM diagnostics、UI callbacks 和 viewer preview pool。

包根和旧 `./pixi` 已停止导出，没有 compatibility alias 或 fallback。Core 不再拥有 RAF、viewport、DOM diagnostics、profile 展示 metadata 或 render callback。

## Consumer 迁移

- `packages/rendercore`：数据 import 改为 `data`，运行实例改为 `VNIRuntime`，删除 viewer-only options，loop hot path 改用 `getLoopIndex()`。
- `apps/anieditorv5viewer`：改用 `data + viewer`，保留既有 profile、五页签、preview、zoom、diagnostics、manual/cyclic/target pool 行为。
- `apps/gamelayouteditor`、`popupeditor`、`gamelayoutpkgcli`：schema/validation 改用 `data`；需要 Pixi host ticker 的 preview 改用 `core`。
- `apps/gameviewer`、`gameviewer2` 和相关 Vite aliases 已同步到 data/core/viewer 源入口。
- `game002v2`、`game003v2` 没有 VniCore 直接 import，本任务无需修改。
- Crave 仓库未修改；迁移步骤见 `tasks/218-crave-vnicore-migration.md`。

## 测试与验证

通过：

- `pnpm --filter @slotclientengine/vnicore typecheck`
- `pnpm --filter @slotclientengine/vnicore test`：19 files，248 tests；coverage statements 88.77%、branches 80.27%、functions 90.94%、lines 90.08%。
- `pnpm --filter @slotclientengine/vnicore build`
- `pnpm --filter @slotclientengine/vnicore examples:typecheck`
- `pnpm --filter @slotclientengine/rendercore typecheck`
- `pnpm --filter anieditorv5viewer typecheck`
- `pnpm --filter gamelayouteditor typecheck`
- `pnpm --filter popupeditor typecheck`
- RenderCore VNI/派奖定向测试：3 files，24 tests。
- AniEditor Viewer：2 files，32 tests。
- `pnpm --filter anieditorv5viewer build`；仅有既存的大于 500 kB chunk 提示。
- 所有本任务修改/新增文件 Prettier check。
- `git diff --check`。

已识别但不属于 task 218 的既有失败：

- `gamelayoutpkgcli typecheck` 在 `tests/reference-rewriter.test.ts` 的 PopupManifest union narrowing 报错（`backdrop` / `visibleStates`），与 VniCore import 或 API 无关。
- RenderCore 全量 test 仍有 14 个既有失败：13 个 `configured-round-adapter` fixture 缺少非空 `manifest.nodes`，1 个 cascade presentation 测试的 `afterComplete` 期望过时。Task 218 直接相关的 VNI/派奖测试均通过。

依赖通过现有 lockfile 补齐，未修改 `pnpm-lock.yaml`，未新增 runtime dependency。

## 人工浏览器验收

按用户约定由用户执行，当前标记为待完成。建议使用相同浏览器、硬件和 ZIP fixture 复验：

1. Profile 切换、普通/range/segmented、cyclic auto-preview、particle-combo target preview。
2. 组间插入、文字/图片替换、10%–400% zoom、diagnostics 和重复 load/unload 清理。
3. 粒子、mask、sequence effect、`multi_move`、basic tracks、card carousel 的首/中/尾关键帧。
4. 至少 20 次 load/play/unload/profile switch，观察 RAF、listener、display object、texture/view、pool lease 和 heap slope。

自动测试不代替真实视觉、Performance 或 Memory profiler 结论，因此本报告没有声明真实 FPS 或浏览器内存改善数值。

## 计划偏差

- 原计划要求记录重构前后 browser benchmark；用户明确接管浏览器验收，本次只完成自动化责任边界和资源生命周期验证，真实 benchmark 留待用户补充。
- Core 仍保留既有 additive-matte 与 light-mask 的一次性纹理预处理 canvas；它不创建播放 canvas、renderer 或 DOM diagnostics，也不改变既有视觉合同。
