# `modify_get_anchor` Code Review 与修复方案

## 背景与结论

远端分支 `gitee/modify_get_anchor` 的提交 `e2007342` 为 `RenderObject.getAnchor()` 增加九宫格
alignment。这是实际玩法 presentation 所需能力：粒子、飞行物和临时渲染对象需要取得对象边缘或中心的
opaque `RenderAnchor`，不能由游戏读取 Pixi display tree 自行计算。

原提交的功能方向正确，但实现不能直接合并。当前修复保留该需求，并把合同明确为：

- `getAnchor()` 省略 alignment 时保持既有 display origin 语义，兼容所有现有调用方；
- 显式 `top-left`、`top-center`、`top-right`、`center-left`、`center`、`center-right`、
  `bottom-left`、`bottom-center`、`bottom-right` 时，按当前对象 local/logical bounds 返回 live anchor；
- anchor 在 resolve 时读取当前 view、bounds 和 transform，必须跟随动态 view、scale 及 ImgNumber 文本变化；
- 未知 alignment、非法 bounds 和 destroyed object 显式失败；
- 公共 API 继续只暴露 opaque `RenderObject`/`RenderAnchor`，不公开 raw Pixi `Container`。

## Code Review 问题

### 1. Anchor 缓存旧 Container

原提交在 `getAnchor()` 调用时读取一次 `registered.view` 并由闭包长期持有。`RenderObjectAdapter.view`
允许返回动态 Container，现有 runtime pool/alias 会在同一逻辑对象下替换实际 view；旧实现因此把 anchor
永久绑定到第一次取得的 Container，并破坏已有动态 view 回归测试。

### 2. 混用 world size 与 local point

原提交以 Pixi `Container.width/height` 生成本地 anchor point。Pixi 的 width/height 已包含对象 scale，
随后 `toGlobal()` 又会应用同一 transform，导致缩放被计算两次；负 scale 还会丢失方向。同时只使用
`0..width/height`，忽略了 local bounds 的非零 `x/y`。

### 3. ImgNumber Anchor 缓存旧文字尺寸

原提交在创建 anchor 时只读取一次 `renderer.getGeometry()`。ImgNumber 调用 `setText()` 后 logical width
可能改变，但已创建的 center/right/bottom anchor 仍使用旧尺寸，不满足动态金额和计数 presentation。

### 4. 破坏 opaque API 与 lifecycle

原提交从 package presentation index 公共导出 `getRenderObjectAdapter()`，使游戏可以取得 raw Pixi
Container，违反 RenderObject 的 opaque capability 边界。ImgNumber 自定义 `getAnchor()` 还会在 destroyed
后先返回一个延迟失败的 anchor，而不是在方法调用边界立即失败。

### 5. 缺少有效验收

原提交没有测试九种 alignment、非零 local bounds、scale、动态 view、动态 ImgNumber geometry、未知输入和
destroyed lifecycle，因此上述回归没有被发现。

## 修复方案

1. 在 `RenderObject` 公共合同增加可选 `RenderObjectAlignment`，但不改变无参数行为。
2. 显式 alignment 使用当前 view 的 `getLocalBounds()`；只把 local point 交给 RenderAnchor 坐标转换，
   transform 仍由 Pixi 恰好应用一次。
3. `createContainerRenderAnchor()` 把本次 resolve 得到的 exact owner 传给 point resolver，确保动态 view 的
   owner 与 bounds 来自同一个 Container。
4. `RenderObjectAdapter.getAlignmentBounds()` 允许 ImgNumber 提供 manifest/runtime 拥有的 logical bounds；
   callback 在每次 resolve 时调用，不缓存文字 geometry。
5. 保持 `getRenderObjectAdapter()` 为 rendercore 内部 seam，不从 package index 导出。
6. 对 alignment 和 bounds 做严格运行时校验，并复用 RenderObject 既有 `assertUsable()` lifecycle。

## 验收证据

- `vitest run packages/rendercore/tests/presentation/render-object.test.ts packages/rendercore/tests/presentation/imgnumber-render-object.test.ts`
  ：2 个测试文件、7 个测试全部通过。
- `pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- 目标文件 Prettier 检查：通过。
- `git diff --check`：通过。
- rendercore 整包 coverage 测试另有 16 个与本改动路径无关的当前基线失败，集中在 Scene Layout 旧 fixture、
  package runtime 层级断言及 symbol manifest v2/v3 预期；本次不扩大范围修改这些失败。
