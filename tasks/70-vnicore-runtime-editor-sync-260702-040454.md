# 70 vnicore runtime editor sync 执行报告

## UTC 完成时间

- 报告时间：2026-07-02 04:04:54 UTC
- 任务计划：`tasks/70-vnicore-runtime-editor-sync.md`

## 实现摘要

- 已把编辑器导出的 `number2.json`、`number3.json`、新版 `roundreel.json` 同步到 `packages/vnicore` fixtures 和 `apps/anieditorv5viewer` bundled projects。
- 已把新增 7 张导出 PNG 同步到 viewer assets，并用 `cmp` 校验源文件和 viewer copy 一致。
- `packages/vnicore` 已同步 mask 类型、`particle_stream`、`chaser_light`、`bounce_in` eased progress、粒子新参数、走马灯 sampler/Pixi runtime、文字层 public binding API 和 diagnostics。
- `apps/anieditorv5viewer` 仅作为验证壳注册新项目、暴露文字层替换 UI，并调用 `VNIPlayer` public API；没有把动画、mask、粒子或 private Pixi tree 逻辑放到 viewer。
- 已补充 `packages/vnicore` 文档、examples 和 `agents.md` 协作边界。

## 修改文件列表

- 协作规则：`agents.md`
- viewer：`apps/anieditorv5viewer/README.md`、`src/config/bundled-projects.ts`、`src/main.ts`、`src/styles.css`、`src/ui/controls.ts`、`tests/bundled-projects.test.ts`、`tests/main.test.ts`
- viewer 新资源：`apps/anieditorv5viewer/src/assets/projects/number2.json`、`number3.json`、`roundreel.json`，以及 `src/assets/assets/*.png` 新增 7 张
- 编辑器导出输入：`docs/anieditor5/export/number2.json`、`number3.json`、`roundreel.json`、`export/assets/*.png`
- vnicore runtime：`packages/vnicore/src/core/*`、`src/pixi/layer-instance.ts`、`src/pixi/vni-player.ts`
- vnicore tests：`packages/vnicore/tests/core/*`、`tests/pixi/vni-player.test.ts`、`tests/fixtures/export/*`
- vnicore docs/examples：`README.md`、`docs/api-zh.md`、`docs/usage-zh.md`、`docs/migration-from-viewer-zh.md`、`examples/README.md`、`examples/basic-player.ts`
- 格式边界：`packages/vnicore/.prettierignore` 新增 fixture JSON 忽略，避免和 docs/export 的字节级同步冲突。

## 新增 public API

`@slotclientengine/vnicore/pixi` 通过 `VNIPlayer` 暴露：

- `attachNodeToTextLayer(options): () => void`
- `attachTextToTextLayer(options): { dispose(): void; setText(text: string): void }`
- `attachImageToTextLayer(options): Promise<() => void>`

行为要点：

- `layerId` 必须指向 text layer，错误 layer 或重复 id 显式失败。
- 默认隐藏原始 text child，`hideOriginal: false` 才保留。
- 绑定节点挂在 text layer wrapper 下，继承该层 transform、scale、rotation、opacity、visible、blendMode 和 render order。
- `setText()` 只更新已有 `PIXI.Text.text`。
- dispose、`clearMountedNodes()`、`destroy()` 和 project switch 清理绑定节点。

## 性能约束落实

- `particles` burst 上限：320。
- `particle_stream` runtime/deterministic 上限：360。
- `chaser_light.totalCount` validation 和 runtime 上限：200。
- `chaser_light` Pixi runtime 使用 sprite pool，并写入 `data-vni-chaser-light-sprites`。
- mask runtime 维护 mask sprite/cache key，并写入 `data-vni-mask-sprites`；`showSourceLayer=false` 时普通 source display 隐藏但仍可作为 mask source。
- 文字层替换计数写入 `data-vni-text-layer-bindings`；diagnostics 在 `updateDiagnostics()` / `clearDiagnostics()` 成对维护。
- `packages/vnicore/vite.config.ts` coverage threshold 保持 `lines/functions/branches/statements = 80`，未降低。

## 新样例验证结果

JSON 动画类型解析：

- `number2.json`：`idle`、`particles`、`pop`、`scale_out`、`scale_up`
- `number3.json`：`bounce_in`、`fade`、`idle`、`move`、`particles`、`pop`、`safe_glow`、`scale_out`、`scale_up`
- `roundreel.json`：`blink`、`chaser_light`、`safe_glow`、`scale_out`

一致性校验已通过：

- `cmp docs/anieditor5/export/{number2,number3,roundreel}.json packages/vnicore/tests/fixtures/export/*.json`
- `cmp docs/anieditor5/export/{number2,number3,roundreel}.json apps/anieditorv5viewer/src/assets/projects/*.json`
- 7 张 `docs/anieditor5/export/assets/*.png` 与 viewer assets 同名文件逐个 `cmp` 通过。

## agents.md 更新

已更新。原因：本任务新增了 `mask`、文字层绑定/动态文本替换、`particle_stream`、`chaser_light`、runtime sprite/texture 性能上限和 viewer public API 边界，属于仓库协作规则变更。

## 验收命令和结果

通过：

- `CI=true pnpm --filter @slotclientengine/vnicore format`
- `CI=true pnpm --filter @slotclientengine/vnicore format:check`
- `CI=true pnpm --filter @slotclientengine/vnicore lint`
- `CI=true pnpm --filter @slotclientengine/vnicore typecheck`
- `CI=true pnpm --filter @slotclientengine/vnicore test`
  - 13 files passed，153 tests passed
  - coverage：statements 90.67，branches 81.63，functions 98.48，lines 91.83
- `CI=true pnpm --filter @slotclientengine/vnicore examples:typecheck`
- `CI=true pnpm --filter @slotclientengine/vnicore build`
- `CI=true pnpm --filter anieditorv5viewer format:check`
- `CI=true pnpm --filter anieditorv5viewer lint`
- `CI=true pnpm --filter anieditorv5viewer typecheck`
- `CI=true pnpm --filter anieditorv5viewer test`
  - 2 files passed，18 tests passed
- `CI=true pnpm --filter anieditorv5viewer build`
  - 通过，Vite 仅提示大 chunk warning
- `CI=true pnpm build`
  - 25 packages successful
- `git diff --check`

未通过但已确认不是本任务相关包：

- `CI=true pnpm typecheck`
  - 失败包：`apps/uiframeworksviewer`
  - 失败原因：`tests/demo-game.test.ts` 中 mock 的 `SlotGameMountContext` 缺少 `getViewport`、`onViewportChange`。
- `CI=true pnpm test`
  - 失败包：`@slotclientengine/netcore`
  - 失败原因：当前沙箱不允许测试 mock server 监听 `0.0.0.0`，报 `listen EPERM: operation not permitted 0.0.0.0`，导致 `tests/integration.test.ts` 和 `tests/main-adv.test.ts` hook timeout。
- `CI=true pnpm format:check`
  - 根级失败在无关历史格式噪声，已观察到 `apps/gameclientcli`、`apps/spine2pixiani-demo`、`apps/spine2victoryani-demo` 等包有 Prettier warning。
  - 本任务相关 `@slotclientengine/vnicore` 和 `anieditorv5viewer` format:check 均已单独通过。

## 浏览器验收

浏览器验收未执行，按用户要求交给用户执行。手动清单：

- 启动：`pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1`
- 选择 `number2`，确认原始文字层按 `pop + scale_up + idle + scale_out` 播放。
- 文本替换模式输入不同文本，不重启 player，文本继续跟随文字层动画。
- 图片替换模式选择图片，图片替换文字层并跟随文字层动画。
- 移除替换后，原始文字恢复。
- 选择 `number3`，检查 `precompose_light_alpha` mask 视觉效果和 `showSourceLayer` 显隐。
- 选择 `roundreel`，检查 `chaser_light` 走马灯可见且无明显卡顿。
- segmented playback hold 下，持续粒子不冻结。
- 检查 diagnostics：`data-vni-particle-sprites`、`data-vni-chaser-light-sprites`、`data-vni-mask-sprites`、`data-vni-text-layer-bindings`、`data-vni-mounted-nodes` 计数合理，连续 restart/play/seek 至少 5 次不持续增长。

## pnpm-lock.yaml

- 未变化。
- 本任务未新增第三方运行时依赖，未执行 `pnpm install`。

## 第二遍遗漏检查

- schema/type 覆盖 `mask`、`particle_stream`、`chaser_light`：已覆盖。
- validation 对非法 mask/source/params 显式失败：已覆盖测试。
- `number2`、`number3`、`roundreel` 进入 docs export、vnicore fixture、viewer projects：已完成并 `cmp`。
- 新图片进入 viewer asset manifest 目录：已完成并 `cmp`。
- viewer bundled-project 测试同步项目顺序：已覆盖。
- `VNIPlayer` public API 通过 `@slotclientengine/vnicore/pixi` 导出：已确认。
- docs/examples typecheck：已通过。
- viewer 未操作 runtime private Pixi tree：已检查，viewer 只持有 dispose/setText handle。
- mask precompose 有 cache key/diagnostics，不做每帧无界重建；最终视觉效果待浏览器验收。
- particle/chaser 有 sprite 上限和复用/清理：已覆盖。
- diagnostics 新增字段成对维护：已检查 `updateDiagnostics()` / `clearDiagnostics()`。
- coverage threshold 保持 80：已确认。
- `clearMountedNodes()`、`destroy()`、project switch 清理替换节点和 runtime sprites：已覆盖测试。
- `agents.md` 已同步。
- `git diff --check` 已通过。

## 当前 git status 摘要

- 已修改：`agents.md`、viewer 源码/测试/README、docs/anieditor5 输入改动、vnicore 源码/测试/文档/examples。
- 新增：viewer 新项目 JSON、新 PNG assets、docs export 新 JSON/PNG、`packages/vnicore/src/core/chaser-light-sampler.ts`、对应测试、vnicore fixture JSON、本任务计划和本报告。
- 无 `pnpm-lock.yaml` 变化。
