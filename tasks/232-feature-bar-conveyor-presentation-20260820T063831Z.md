# 232 feature-bar-conveyor-presentation 执行报告

## 结果

task 232 的 shared package 能力、测试、规则与 Minecart2 手工迁移文档已完成。未修改
`/Users/zerro/gitee.com/piximinecart2`；该仓库仍为 clean，HEAD 仍是
`19dfc7a24d4bd60293d474b28bd08b1b9c85ce5c`。真实浏览器/美术验收按约定留给用户。

执行基线：

```text
UTC report: 2026-08-20T06:38:31Z
slotclientengine HEAD: e9120f4b4c9c4d6eb0bf99dbddec11755ce536ee
branch: detached HEAD
```

## 已实现

- logiccore 新增冻结的 `FeatureBar2Data` 与按 exact component name 的
  `GameLogicStep.getFeatureBar2Data(name)` / `GameLogic.getFeatureBar2Data(stepIndex, name)`。
  未触发返回 `undefined`；错误 protobuf `@type` 或字段 shape 抛 `LogicParseError`。shared
  parser 不解释 feature 名、数量、顺序或跨 spin 关系。
- authored non-state-machine Spine node 新增 `playAnimation(exactName, { loop, signal })`、
  `stopAnimation()` 与 `bindSlotObjects(batch)`。completion 复用 Scene Layout 的唯一 update drain；
  supersede/abort/stop/destroy reject waiter，slot batch 失败恢复原 attachment，child/runtime destroy
  清理关系且不转移 caller ownership。
- Game Layout 地址目录新增全局 `gamelayout:/event/variant-changed`。package runtime 只在已提交
  snapshot 的 variant 真正变化后派发 previous/current detail；首次、同 variant 和失败 apply 不派发。
- gameframeworks facade 重新导出 FeatureBar2 parser/type 与 authored Spine 新 public types；测试 fake
  同步实现新增 `GameLogic` contract。
- README、runtime address 文档及最小领域规则已更新。
- 新增 `docs/minecart2-task232-feature-bar-conveyor-update.md`，给出 15 个 occurrence-owned 图片池、
  Start/Idle、response race、variant 迁移、rollback、cancel/destroy 与 round adapter 接入代码。

## 与计划的实现差异

- exact-slot transaction 直接放在 Scene Layout runtime 内实现，没有另建 presentation attachment 文件；
  authored player、node attachment 和 destroy owner 都在该 runtime，此处能复用现有 official slot adapter并
  保持 opaque boundary。
- variant event descriptor 对所有 package 固定存在；没有 variant edge 的 package不会产生 occurrence。
  这保持地址 catalog稳定，也覆盖 v4 mode 之间 adaptation可能不同的情况。
- Minecart2 跨两个 authored conveyor 迁移同一批 15 个 object 时，迁移文档采用同步
  detach-old → bind-new → failure rebind-old；单个 authored node内部的 batch replacement仍由 rendercore
  原子 rollback。一个 Pixi occurrence不能同时属于两个 parent，因此没有制造双重 attachment。

## 自动验收

计划要求的六条命令全部通过：

```text
PASS  pnpm --filter @slotclientengine/logiccore typecheck
PASS  pnpm --filter @slotclientengine/logiccore exec vitest run tests/feature-bar2.test.ts tests/game-logic.test.ts
      2 files, 11 tests passed
PASS  pnpm --filter @slotclientengine/rendercore typecheck
PASS  pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime.test.ts tests/scene-layout/runtime-address.test.ts tests/scene-layout/package-runtime.test.ts
      3 files, 40 tests passed
PASS  pnpm --filter @slotclientengine/gameframeworks typecheck
PASS  git diff --check
```

附加检查：

```text
PASS  pnpm --filter @slotclientengine/logiccore test:exports
PASS  pnpm --filter @slotclientengine/logiccore lint
PASS  pnpm --filter @slotclientengine/gameframeworks lint
```

`pnpm --filter @slotclientengine/rendercore lint` 仍报告两个基线问题，均可在未修改的 HEAD 内容中复现，
本任务未扩大范围修复：

```text
src/scene-layout/package-runtime.ts:339  #catalog written but never read
tests/reel/render-reel.test.ts:492       vi is not defined
```

依赖目录起初不存在，使用 frozen lockfile恢复；没有修改 `pnpm-lock.yaml` 或 workspace配置。

## 浏览器验收跟进：center origin slot 对齐

用户同步到 Minecart2 后发现 feature 图片以左上角而不是中心对齐 Spine slot。跟进确认
authored image node 已按 package `coordinateOrigin` 设置 Sprite anchor，但
`SceneLayoutRenderObjectFactory` 创建的 `runtimeResources` image 始终保留 Pixi 默认 `(0,0)` anchor。

已于 `2026-08-20T07:15:37Z` 在 rendercore 统一修复：`coordinateOrigin: "center"` 的程序图片使用
`anchor=(0.5,0.5)`，缺失/`top-left` 继续使用 `(0,0)`。Minecart2 无需写死 `-width/2,-height/2`
偏移；同一 runtime image 挂到 Spine slot 或其它 anchor 时都遵守 package 坐标合同。

```text
PASS  pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/render-object-factory.test.ts tests/scene-layout/runtime.test.ts
      2 files, 23 tests passed
PASS  pnpm --filter @slotclientengine/rendercore typecheck
PASS  git diff --check
```

## 浏览器验收跟进：RenderObject transform

rendercore 增加 finite 的 `RenderObject.setRotation()`、`setScale()` opaque setter，供后续玩法设置
对象自身的局部旋转、缩放或镜像，并已同步到 Minecart2。浏览器验证确认当前竖版 conveyor 同时包含
rotation 与 mirrored scale；Minecart2 对 Feature 图片的 transform 补偿已按用户要求撤销，改由美术修正 Spine。

```text
PASS  pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation/render-object.test.ts tests/symbol/symbol-handle.test.ts tests/background/runtime-player.test.ts tests/scene-layout/runtime.test.ts
      4 files, 24 tests passed
PASS  pnpm --filter @slotclientengine/rendercore typecheck
PASS  piximinecart2: pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation/render-object.test.ts tests/symbol/symbol-handle.test.ts
      2 files, 9 tests passed
PASS  piximinecart2: pnpm --filter minecart2 test
      3 files, 9 tests passed
PASS  piximinecart2: pnpm --filter minecart2 build
PASS  git diff --check（两个仓库）
```

`piximinecart2` 的 rendercore 全量 typecheck 仍因仓库未包含 `test-utils/minecart2-fixtures.js` 与
`assets/gamecfg/game2.json` 失败；报错全部位于未修改的测试文件，定向测试与 Minecart2 build 已覆盖本次改动。

## 待用户完成

按 `docs/minecart2-task232-feature-bar-conveyor-update.md` 同步 packages并修改 Minecart2 后，在真实浏览器验证：

- 横/竖版初始五个 normal、exact slot反向顺序与三种 feature图片映射；
- Start自然完成、response先到、response后到三类时序，最终服务器 queue不被旧 continuation覆盖；
- Start/Idle期间方向切换，旧动画停止、只显示 active conveyor且临时 shift不重复；
- 网络失败、连续 spin/resize、退出重进无 stale attachment、listener、动画或 unhandled rejection。

当前真实素材事实是：竖版动画名为 `Conveyor2_Start/Conveyor2_Idle`，但
`conveyor_2.json` 的五个 slot仍为 exact小写 `conveyor1_0`…`conveyor1_4`。若浏览器使用的新美术包改变
了这些名字，应更新游戏侧 exact配置，不在 shared runtime增加 alias。
