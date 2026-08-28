# 260 RenderCore 立即切换 GameMode 执行报告

UTC：2026-08-28T05:01:47Z

## 最终实现

- `SceneLayoutGameModeRequestOptions` 新增 `immediate?: boolean`，并拆出只供 authoring/prepare 使用的
  `SceneLayoutGameModePrepareOptions`；RenderCore presentation surface 与 Gameframeworks facade 同步公开类型。
- `requestGameMode(target, { immediate: true })` 仍要求当前 source 到 target 的显式 direct edge，完整准备 target delivery、
  geometry 和必要 Symbols/reel 后直接原子提交 displayed/stable mode。
- immediate 路径不启动 prelude Popup，不创建或播放 Spine/video overlay，不发布 transition lifecycle、configured Spine
  effect 或 video effect event；真实 mode displayed/stable event及其BGM驱动保持不变。
- matching prepared transition会销毁未播放的overlay player并把target prepare ownership移交给immediate commit；mismatch、
  prepare failure和destroy沿既有单一release边界清理。
- `immediate`严格要求boolean，并与`preludePopupStrings`互斥；缺edge、active/pending Popup或并发transition继续显式失败。

## 实际修改

- Runtime/API：`packages/rendercore/src/scene-layout/{types,package-runtime,presentation-surface}.ts`
- Facade：`packages/gameframeworks/src/index.ts`
- 测试：`packages/rendercore/tests/scene-layout/{package-runtime-mode,package-runtime-video,package-runtime,presentation-surface}.test.ts`
- 文档/规则：`packages/{rendercore,gameframeworks}/README.md`、`docs/scene-layout-manifest.md`、
  `docs/agent-rules/scene-layout.md`
- 计划与本报告：`tasks/260-rendercore-immediate-game-mode-switch*.md`

## 关键决策与计划偏差

- 保留mode displayed/stable event，因为它们描述真实commit并驱动mode BGM；只抑制没有实际发生的Popup/transition/effect event。
- target prepare共享点实现为同步plan/preflight，避免normal prelude/none路径额外增加microtask；normal严格时序测试保持原样通过。
- 计划中的四文件合并vitest命令会触发`package-runtime.test.ts`两个与本任务无关的既有root-parent断言失败；没有修改无关display
  hierarchy。改为完整运行三个直接文件，并单独运行本任务修改的跨Symbols binding用例。

## 验收结果

- `pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime-mode.test.ts tests/scene-layout/package-runtime-video.test.ts tests/scene-layout/presentation-surface.test.ts --no-file-parallelism`
  - 通过：3 files，30 tests。
- `pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime.test.ts -t "prevalidates and atomically swaps canonical per-mode symbol packages"`
  - 通过：1 test，22 skipped。
- `pnpm --filter @slotclientengine/rendercore typecheck`
  - 通过。
- `pnpm --filter @slotclientengine/rendercore build`
  - 通过。
- `pnpm --filter @slotclientengine/gameframeworks typecheck`
  - 通过。
- targeted Prettier、合同搜索与`git diff --check`
  - 通过。

未纳入通过结论的基线失败：完整`packages/rendercore/tests/scene-layout/package-runtime.test.ts`有
`creates, orders and resets the standard reel from package contracts`与
`creates, orders and resets the grid-cell reel from package contracts`两个root-parent identity断言失败；本任务新增的同文件immediate
Symbols/reel用例单独通过，失败位置不经过本任务game-mode request改动。

## 人工验收与剩余风险

- 浏览器验收按用户要求由用户执行，本报告不标记为已完成。
- 未运行独立第二人复验；高风险prepared Spine/video ownership分别有fake player destroy/play断言覆盖。
- “立即”表示跳过presentation等待，不保证target delivery未缓存时同步完成；资源准备期间仍保持source稳定画面。
- 未修改manifest、资源、游戏app、外部仓库、依赖版本或lockfile。
