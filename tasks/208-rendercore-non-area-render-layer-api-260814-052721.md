# 208 RenderCore Area 外渲染图层 API 执行报告

UTC：2026-08-14 05:27:21

## 1. 最终实现

- 新增通用 opaque `RenderObjectLayer` 第一层合同：保留 `add/remove`，增加 `getAnchor/resolveAnchor/addAt`。`addAt` 先校验 runtime、object、order、offset 与 anchor，再提交 position、zIndex 与 parent；提交异常会回滚。
- 现有 `SymbolAreaLayer` 增量继承该合同。standard reel 与 grid-cell reel 复用同一个 controller，并缓存 layer identity；旧 `getLayer().add/remove`、`area.present()` 签名与调用方式未改变。
- Scene Layout 新增：
  - `getRenderLayer("layout" | "reel" | "transition" | "popup")`；
  - `getRootRenderLayer()`；
  - `getNodeRenderLayer(nodeId, "child" | "before" | "after")`。
- named-node façade 直接复用现有 `named/before/after` Container 与 authored transform/visibility；没有复制 display tree。presentation-only runtime 请求 `reel` 继续显式失败。
- Scene Layout、area 与 `PresentationScope` 共用现有 mount-target adapter。直接 layer 只 detach、不取得 object ownership；runtime destroy 会先安全卸载 layer 中由 caller 拥有的对象。
- `SceneLayoutPresentationSurface` 增量提供相同安全入口；旧 `getLayer/getNode/attachChild/attachRelative` raw host seam 保留。
- `@slotclientengine/gameframeworks` re-export `RenderObjectLayer`、`RenderObjectLayerAddAtOptions` 与 `SceneLayoutNodeRenderLayerPlacement` 类型。
- 新增 Crave 接入指南：`docs/crave-render-layer-integration.md`。本任务未读取或修改 Crave 仓库，也未修改 `apps/**`、`assets/**`、manifest/schema、依赖或 lockfile。

## 2. 实际文件

新增：

- `packages/rendercore/src/presentation/render-object-layer.ts`
- `packages/rendercore/tests/presentation/render-object-layer.test.ts`
- `packages/rendercore/tests/scene-layout/render-object-layer.test.ts`
- `docs/crave-render-layer-integration.md`
- 本报告与任务计划

修改：

- RenderCore presentation、reel area、Scene Layout runtime/types/surface 与相应测试；
- `packages/rendercore/README.md`、三份 RenderCore API/架构文档；
- Crave task 206 文档入口；
- shared runtime 与 Scene Layout 最小领域规则；
- `packages/gameframeworks/src/index.ts` 类型出口。

## 3. 关键决策与计划偏差

- 通用 layer controller/factory 保持 RenderCore 内部实现；公开出口只暴露游戏需要的 opaque interface/options，避免把 raw Pixi Container 包装能力变成游戏 API。
- `reel` render layer 使用稳定 sibling root，跟随当前 main reel 的 local origin；mode 替换 reel 时 façade identity 不变，无 reel 时严格失败。
- `layout` render layer 是独立的受控程序对象层；`transition/popup` 在各自稳定 root 内使用高 local zIndex，不改变 manifest-owned 全局 order。
- 未修改 `presentation-scope.ts`：已有 `PresentationMountTarget` adapter 已可直接消费新 layer。联合测试证明 area scope 可挂到 Scene named-node layer并按 ownership 清理。
- `scene-layout/index.ts` 与 RenderCore 根 index 已通过现有 `export *` 自动导出新增 Scene Layout 类型，无需额外修改。

## 4. 自动验收

通过：

```text
RenderCore 定向 Vitest：8 files / 77 tests passed
pnpm --dir packages/rendercore build
tsc -p packages/rendercore/tsconfig.build.json --noEmit
pnpm --dir packages/rendercore lint
pnpm --dir packages/gameframeworks typecheck
pnpm --dir apps/game002v2 typecheck
pnpm --dir apps/game003v2 typecheck
git diff --check
```

最终复验再次通过定向 77 个测试、RenderCore 生产源码编译与 GameFrameworks typecheck。测试覆盖 transformed layer 跨层对齐、invalid input failure atomicity、stale anchor、direct detach ownership、area 两种 reel、Scene root、node child/before/after、package top layers、presentation-only reel failure、runtime destroy，以及 Area PresentationScope 挂 Scene layer。

`pnpm --dir packages/rendercore typecheck` 未全绿，唯一错误是任务 207 已存在且与本任务无关的测试类型转换：

```text
tests/popup/award-player.test.ts(21,6) TS2352
readonly visibleStates 被转换为 string[]
```

本任务没有修改该 popup 文件或为通过检查改动无关代码；RenderCore production build/source compile、lint 与本任务定向测试均通过。

## 5. 人工验收与剩余风险

浏览器验收按用户要求未执行，由用户在真实 Crave/Gamelayout 环境完成：

1. named image/Spine/VNI/ImgNumber 分别挂到 area、Scene root、exact node child/before/after；
2. 横竖屏、viewport 与 mode 切换后重新对齐，确认无 world-coordinate 漂移；
3. remove、spin interruption、mode 切换和 runtime destroy 后无残留；
4. 既有 Crave 挂载路径与视觉表现无回归。

剩余风险主要是真实 Crave 的 exact resource/node 名、业务触发时序与视觉层级只能在其仓库和正式资源中确认。执行时应遵循 `docs/crave-render-layer-integration.md`，不得猜测名字或增加 fallback。
