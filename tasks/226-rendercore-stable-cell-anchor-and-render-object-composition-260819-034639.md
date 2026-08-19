# 任务 226 执行报告

- 执行时间（UTC）：2026-08-19 03:46:39
- 任务计划：`tasks/226-rendercore-stable-cell-anchor-and-render-object-composition.md`
- 基线提交：`ada0ebd3e848ff6526e2909d0f7ef66fa69b9be7`
- 基线状态：detached HEAD，执行前除任务计划外无其它修改
- 工具链：Node.js 24、pnpm 10
- 浏览器验收：未执行（用户明确不需要）

## 完成内容

### 稳定 cell 坐标

- `SymbolArea` 新增 `getCellAnchor(position)` 与统一的 `resolveAnchor(anchor)`。
- standard ReelSpin、CellSpin、legacy grid-cell 都从各自权威 grid geometry 生成 cell-center Anchor；rolling、
  targetless 和 settle 期间不依赖 Symbol occurrence。
- `getSymbol()` 继续保持 landed-only 与 stale occurrence 显式失败；cell Anchor 不伪造 rolling Symbol。

### RenderObject 动画与 Spine slot

- `RenderObject.play()` 新增严格的 `{ loop?: boolean }`；默认仍为非循环。
- program Spine 与 VNI 在 `loop:true` 时于首圈完成后 resolve Promise，并继续播放到 `stop()`、下一次 play 或
  destroy。
- 新增 `attachRenderObjectToSpineSlot()`，可把 detached owned ImgNumber/RenderObject 绑定到 program Spine 的
  exact slot；返回幂等 `detach()`，双方 destroy 前自动解绑，且不转移 child ownership。

### 换层

- `RenderObjectLayer.moveHere(object, { order })` 可把已挂载 RenderObject 或 settled Symbol 原子移动到目标
  opaque layer，同时保持视觉原点，并返回幂等 `restore()`。
- reel owner 在 spin、replacement、release 或 occurrence 失效前自动恢复临时移出的 borrowed Symbol；不会把
  后续同格的新 occurrence 拉出。
- runtime/layer cleanup 会恢复 active move；普通 layer add/remove/addAt 合同保持不变。

### Public API 与文档

- RenderCore root/presentation/reel exports 已同步。
- `@slotclientengine/gameframeworks` facade 重导出 helper 与相关公共类型，游戏无需直接依赖 RenderCore 内部入口。
- 新增中文 API 文档：`docs/rendercore-game-runtime-composition-api.md`。
- 更新 RenderCore README、坐标指南与 shared game runtime 长期规则。

## 计划偏差

- 计划原先把 `packages/gameframeworks/**` 列为原则上不修改；执行时根据用户补充“全部是 game runtime 需求”以及
  仓库“游戏默认依赖 gameframeworks”的长期不变量，增加了纯 facade re-export，没有加入业务编排。
- slot attachment 测试合并进既有 `render-object-factory.test.ts`，未创建重复 fixture/test 文件。
- attachment 不额外限制 child 与 Spine 必须由同一个 factory 实例创建；只要二者都是有效 owned RenderCore
  object、child detached 且 Spine 明确注册 slot capability 即可。ownership 与 cleanup 合同不因此放宽。

## 自动化验收

通过：

- `pnpm --filter @slotclientengine/rendercore typecheck`
- `pnpm --filter @slotclientengine/rendercore build`
- `pnpm --filter @slotclientengine/gameframeworks typecheck`
- 任务相关定向测试：`7` files / `96` tests
- 所有本次修改文件的 Prettier check
- `git diff --check`

全包现状：

- `pnpm --filter @slotclientengine/rendercore test`：`111` files / `914` tests 通过，`5` files / `17` tests
  失败。剩余失败位于未修改的 manifest/fixture 版本基线：configured-round fixture 缺 v1 nodes、scene-layout
  latest 期望 v3 但实现为 v4、symbol fixture 期望 v2 但实现为 v3，以及 popup v6 fixture 缺 audio。本次新增的
  layer cleanup 曾暴露 3 个失败，修复后相关 scene-layout tests 已全部通过，剩余 17 个与任务 diff 无交集。
- `pnpm --filter @slotclientengine/rendercore format:check`：被 3 个未修改的既有文件阻断：
  `benchmarks/image-string-hot-path.mjs`、`src/popup/editor-types.ts`、`src/popup/editor.ts`；本次修改文件单独检查
  全部通过。

安装依赖使用 frozen lockfile；未新增依赖，未修改 `pnpm-lock.yaml`。

## 人工验收与剩余风险

- 按用户要求未启动浏览器，也未使用真实游戏 Spine/VNI 资源做视觉检查。
- deterministic fake/manual player 已覆盖 loop 首圈、slot exact attach/detach/自动 cleanup、rolling cell Anchor
  和 Symbol spin cleanup。手动接入时仍建议用实际资源确认 slot 名、ImgNumber 局部 offset 以及目标 layer order。
- 无限循环 Promise 在首圈 resolve 后仍继续播放；consumer 必须显式调用 `stop()` 或随 runtime cleanup。
