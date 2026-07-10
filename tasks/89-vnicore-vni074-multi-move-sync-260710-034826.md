# 89 VNI_0.074 multi_move 同步执行报告

执行时间：2026-07-10 03:48:26 UTC

## 结论

- 已按 `tasks/89-vnicore-vni074-multi-move-sync.md` 完成 `packages/vnicore` 对 VNI_0.074 `multi_move` 的 runtime / 校验 / 测试 / 文档同步。
- `apps/anieditorv5viewer` 仍保持薄壳定位：只消费 `VNIPlayer` public API，不解析 `pointsJson`，不复制采样算法。
- `packages/rendercore` 未新增 `multi_move`、`pointsJson` 或 VNI 私有采样逻辑；继续只通过 vnicore public 行为受益。
- 已完成非浏览器严格验收；最终浏览器视觉验收按用户要求交由用户执行。

## 编辑器侧差异对齐

- 当前工作区已有 `docs/anieditor5/src/animation_presets.ts`、`constants.ts`、`coordinates.test.ts`、`main.ts`、`types.ts` 的编辑器侧修改，本轮将这些作为 VNI_0.074 / `multi_move` schema 来源，不在 viewer 或 rendercore 中复制编辑器实现。
- 运行时只消费导出产物中的 `animation.type = "multi_move"` 与 `animation.params.pointsJson`。
- 未修改 `docs/anieditor5/export`、`packages/vnicore/tests/fixtures/export`、`packages/anieditorv5runtime-cc`、`standalone` 交付面。

## 代码修改

- 新增 `packages/vnicore/src/core/multi-move.ts`：
  - 严格解析 `pointsJson`，只接受 JSON 字符串和顶层数组。
  - 每个点必须是对象，且 `x` / `y` / `time` 必须为有限数字；字符串数字、NaN、无限值均显式失败。
  - 至少 2 个点；`x` / `y` 范围限制为 `-5000..5000`；`time` 必须位于 `0..duration`。
  - `easing` 必须是 vnicore 已支持 easing；同一 `time` 保持输入顺序，解析后按 `time` 稳定排序。
  - 解析结果在 runtime 侧缓存，避免逐帧重复 `JSON.parse`。
- 更新 `packages/vnicore/src/core/types.ts`：`V5GAnimationType` 增加 `multi_move`。
- 更新 `packages/vnicore/src/core/animation-sampler.ts`：
  - `SUPPORTED_ANIMATION_TYPES` 支持 `multi_move`。
  - 新增 `sampleMultiMove`，按点到点区间采样，并继承目标点 easing。
  - `move` / `multi_move` / `slide_in` / `slide_out` / `squash_stretch` 在动画结束后继续以 `progress=1` 贡献最终 transform。
  - 位移插值保留 easing overshoot，不再把 backOut 之类 easing 结果夹回 `0..1`。
  - 新增 `shouldHideLayerOutsideActiveAnimation`，用于把 transform 持久化与空帧可见性分离。
- 更新 `packages/vnicore/src/core/project-sampler.ts`：
  - 层在动画覆盖范围外仍可继承最后 transform，但空帧按规则隐藏。
  - 保留 scale 入场动画起始隐藏语义。
- 更新 `packages/vnicore/src/core/validation.ts`：
  - `multi_move` 不再依赖传统数值参数表。
  - 通过 `pointsJson` 解析器执行 fail-fast 校验。

## 测试覆盖

- `packages/vnicore/tests/core/animation-sampler.test.ts`
  - 覆盖 `multi_move` 分段采样、目标点 easing、首尾点边界、`move` / `multi_move` backOut overshoot、结束后 transform 保留，以及 fade 结束后不作为 transform 持久化。
- `packages/vnicore/tests/core/project-sampler.test.ts`
  - 覆盖 slide 结束位移向后续 move 交接、空帧隐藏、`multi_move` 最终点持久化但覆盖范围外隐藏。
- `packages/vnicore/tests/core/validation.test.ts`
  - 覆盖合法 `multi_move` 参数，以及缺失 `pointsJson`、非法 JSON、非数组、点数量不足、字符串数字、坐标越界、时间越界、未知 easing 等显式失败。
- `packages/vnicore/tests/pixi/vni-player.test.ts`
  - 覆盖 `VNIPlayer` 加载 VNI_0.074 `multi_move` 项目，`seek(1)` 到达终点并可见，`seek(1.5)` 位置保持但 alpha 隐藏。

## 文档同步

- 已更新：
  - `packages/vnicore/README.md`
  - `packages/vnicore/docs/api-zh.md`
  - `packages/vnicore/docs/usage-zh.md`
  - `packages/vnicore/docs/usage-en.md`
  - `packages/vnicore/docs/migration-from-viewer-zh.md`
  - `packages/vnicore/examples/README.md`
  - `apps/anieditorv5viewer/README.md`
  - `agents.md`
- `AGENTS.md` 与 `agents.md` 为同一 inode 硬链接，`agents.md` 更新后两者内容一致。

## 验收记录

以下命令已执行并通过：

- `CI=true pnpm --filter @slotclientengine/vnicore typecheck`
- `CI=true pnpm --filter @slotclientengine/vnicore lint`
- `CI=true pnpm --filter @slotclientengine/vnicore examples:typecheck`
- `CI=true pnpm --filter @slotclientengine/vnicore test`
  - 15 个测试文件通过，195 个测试通过。
  - all-files coverage：statements 91.28%，branches 82.24%，functions 98.57%，lines 92.33%。
- `CI=true pnpm --filter @slotclientengine/vnicore build`
- `CI=true pnpm --filter @slotclientengine/vnicore format:check`
- `CI=true pnpm --filter anieditorv5viewer typecheck`
- `CI=true pnpm --filter anieditorv5viewer lint`
- `CI=true pnpm --filter anieditorv5viewer test`
  - 2 个测试文件通过，25 个测试通过。
  - all-files coverage：statements 93.57%，branches 77.86%，functions 96.03%，lines 94.44%。
- `CI=true pnpm --filter anieditorv5viewer build`
- `CI=true pnpm --filter anieditorv5viewer format:check`
- `CI=true pnpm --filter @slotclientengine/rendercore typecheck`
- `CI=true pnpm --filter @slotclientengine/rendercore test`
  - 30 个测试文件通过，195 个测试通过。
  - all-files coverage：statements 89.25%，branches 81.39%，functions 94.63%，lines 89.24%。
- `CI=true pnpm --filter @slotclientengine/rendercore build`
- `git diff --check`

## 二次审计

- `git diff --name-only -- docs/anieditor5/export packages/vnicore/tests/fixtures/export packages/anieditorv5runtime-cc standalone` 无输出，确认未误改导出 fixture、Cocos runtime 或 standalone 交付面。
- `rg` 检查 `apps/anieditorv5viewer` 与 `packages/rendercore`，未发现 `multi_move` / `pointsJson` 解析或采样逻辑复制。
- `rg` 检查文档与 agents 约束，确认 VNI_0.074 / `multi_move` runtime 边界、fail-fast 和 viewer 薄壳说明已同步。

## 浏览器验收交接

浏览器视觉验收未由本轮执行，按用户要求交由用户完成。建议手动关注：

- `apps/anieditorv5viewer` 加载包含 VNI_0.074 `multi_move` 的项目后，运动轨迹与编辑器预览一致。
- 运动段结束后 transform 停在最终点；无动画覆盖的空帧不应继续显示层。
- backOut 等 overshoot easing 在位移上保留越界效果。
- viewer UI 不应出现 `pointsJson` 私有解析、修正或兜底行为。

## 遗留与风险

- 最终浏览器视觉验收尚未执行，需用户手动确认。
- 工作区中 `docs/anieditor5/src/*` 已有编辑器侧修改，本轮未回滚、未改写；这些差异应作为任务 89 的上游编辑器变更单独确认。
