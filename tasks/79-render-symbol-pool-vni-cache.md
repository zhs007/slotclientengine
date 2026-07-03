# 任务 79：RenderSymbol 池化与 VNIPlayer 缓存

## 任务目标

在 `/Users/zerro/github.com/minecart2` 中，为 `packages/rendercore` 补齐可复用的 `RenderSymbol` 池化能力，并让 symbol 级 VNI 动画的 `VNIPlayer` 可以缓存在对应 `RenderSymbol` 生命周期内复用，优先解决 `apps/game003` 中主转轮 symbol 频繁销毁重建、VNI win 动画反复初始化、状态切换时闪烁和性能抖动的问题。

本任务必须严格遵守现有仓库边界：

- `packages/rendercore` 拥有通用 Pixi slot 渲染算法、symbol 状态机、manifest 驱动的 VNI/Spine symbol 动画适配和生命周期管理。
- `apps/game003` 只能配置和调用通用能力，不在 app 内复制转轮调度、symbol 状态机、VNI/Spine 播放生命周期或 `if symbol === "H1"` 这类专属运行时代码。
- `packages/vnicore` 的 `VNIPlayer` 是 runtime-only，不拥有 `PIXI.Application`、renderer、canvas 或 DOM 容器；symbol 动画必须继续挂在同一个 Pixi 渲染树中。
- 不要增加不必要的兜底。池化或缓存无法安全复用时必须显式失败或销毁重建并在测试中覆盖原因，不能静默吞掉状态错误。
- 如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

## 当前已知事实

执行本任务前必须重新核对这些事实，不能只依赖本文件的旧描述：

- `packages/rendercore/src/reel/render-reel.ts` 当前在 `syncSlot(slot, code)` 中，当 code 变化时会对旧 `slot.symbol` 执行 `destroy({ children: true })`，然后通过 `#registry.createRenderSymbolByCode(code)` 创建新对象。
- `packages/rendercore/src/reel/symbol-registry.ts` 当前直接 `new RenderSymbol(...)`，并按 manifest / texture set 设置 scale。
- `packages/rendercore/src/symbol/render-symbol.ts` 当前在 symbol 状态切换时会创建当前状态动画，并销毁上一个动画对象。
- `packages/rendercore/src/symbol/vni-animation.ts` 当前 `VniSymbolAni.reset()` 会 `disposePlayer()`，`ensureInitialized()` 会创建新的 `VNIPlayer`，`destroy()` 也会释放 player；也就是说 VNIPlayer 现在没有缓存在 `RenderSymbol` 内。
- `packages/rendercore/src/symbol/spine-animation.ts` 已经有 Spine symbol 动画的缓存/复用逻辑，本任务不能破坏 H1-H5 / WL 在 `Idle` 与 `Win` 间的复用行为。
- `apps/game003` 主转轮是 5 x 5 可见窗口，滚动窗口通常还包含上下缓冲格；池化设计不能假设永远只有 25 个对象，要按实际 reel slot 窗口和动画临时对象留余量。
- 之前基于 Node heap 的粗略测量显示，单纹理 `RenderSymbol` 基础 JS heap 约 8.3 KB / 个，三层 composite `RenderSymbol` 约 11.7 KB / 个；这个数字不包含贴图、GPU 资源、Spine/VNI player 内部对象。执行本任务时如重新测量，必须在报告里注明脚本、环境和是否包含 GPU/动画资源。

## 实施范围

### 1. RenderSymbol 池化

在 `packages/rendercore` 中实现通用池化，不写入 `game003` 专属语义。

建议新增或调整以下文件：

- `packages/rendercore/src/reel/render-symbol-pool.ts`：新增池实现。
- `packages/rendercore/src/reel/types.ts`：新增池配置类型。
- `packages/rendercore/src/reel/render-reel-set.ts`：拥有主转轮共享 pool，并把同一个 pool 传给每个子 `RenderReel`。
- `packages/rendercore/src/reel/render-reel.ts`：在 reel slot code 变化时从共享 pool acquire/release。
- `packages/rendercore/src/reel/symbol-registry.ts`：保留真实创建逻辑，必要时提供 `createRenderSymbolByCode` 的可测量封装，不把池放进 registry 内部。
- `packages/rendercore/src/symbol/types.ts`：如需要给 `SymbolAnimationContext` 增加 `RenderSymbol` 持有的动画缓存句柄，必须在这里补类型。
- `packages/rendercore/src/symbol/render-symbol.ts`：补齐复用前 reset/release 所需的 public 方法或内部安全入口。
- `packages/rendercore/src/index.ts`、`packages/rendercore/src/reel/index.ts`：如新增 public type，需要同步导出。
- `apps/game003/src/game-demo.ts`：如果池化默认关闭，在创建 `RenderReelSet` 时显式传入 game003 的池配置。

池化策略必须满足：

- 按 symbol code 分桶，不跨 code 复用。不能把 H1 的 `RenderSymbol` 改绑成 H2，也不能把普通 sprite symbol 改造成 VNI/Spine symbol。
- 每个 code 使用高低水位：默认 `targetIdlePerCode = 5`，`maxIdlePerCode = 10`。当某个 code 空闲池超过 10 个时，一次性裁剪回 5 个。
- 增加全局空闲上限，建议默认 `maxIdleTotal = 80`。当总空闲数量超过上限时，按 LRU 或明确可测试的顺序裁剪，直到回到上限内。
- 共享包默认不改变现有行为：`RenderReelSetOptions.symbolPool` 未配置或 `enabled: false` 时不启用池化；`apps/game003` 必须显式开启。
- pool 所有权固定在 `RenderReelSet`，同一个 `RenderReelSet` 的所有 reel 共享同一个 pool。不要让每个 `RenderReel` 各自创建一套 pool，否则每 code 高低水位会被 reel 数放大。
- `RenderGridCellReelSet` 内部也使用 `RenderReel`，但本任务不默认给 grid-cell reel 开池；修改 `RenderReelOptions` 时必须保证 `RenderGridCellReelSet` 不被无意启用池化，既有 grid-cell 测试继续通过。
- release 前必须从 parent 移除，并清理所有会影响下次展示的可变状态：`visible`、`alpha`、`position`、`scale`、`rotation`、`pivot`、`mask`、filters、zIndex、requested/resolved symbol state、当前动画状态、overlay layer、base/state sprite 可见性等。
- acquire 后必须重新挂载到当前 slot container，重新按当前 symbol code 的 manifest scale 和当前请求状态初始化，不能依赖旧状态自然残留。
- pool trim 或 reel/game destroy 时必须真正 `destroy({ children: true })`，并释放内部 VNI/Spine 缓存。
- 空图标或 entry.kind 为 `empty` 的 code 不进入池。

### 2. VNIPlayer 缓存在 RenderSymbol 内

目标是让同一个 `RenderSymbol` 在 `normal -> win -> normal -> win` 的重复状态切换中复用同一套 VNIPlayer 资源，不再每次 win 都重新构建 VNIPlayer。

建议调整：

- `packages/rendercore/src/symbol/vni-animation.ts`
- `packages/rendercore/src/symbol/render-symbol.ts`
- `packages/rendercore/src/symbol/types.ts`
- 必要时扩展 `packages/vnicore` 的 public API，但不要从 rendercore 直接操作 vnicore 私有 Pixi display tree。

约束：

- 先不要做全局 VNIPlayer 池。`RenderSymbol` 池化后，VNIPlayer 由对应 `RenderSymbol` 持有并随池对象自然复用，复杂度和内存上限更可控。
- 缓存不能只放在 `VniSymbolAni` 的局部字段里，因为 `RenderSymbol` 状态切换时会销毁旧 ani 对象。缓存所有权必须上移到 `RenderSymbol` 或由 `RenderSymbol` 持有并通过 `SymbolAnimationContext` 传入的 runtime cache。
- `VniSymbolAni.destroy()` 需要区分“当前 ani 对象解绑/停止播放”和“彻底销毁 cached player”。普通状态切换只释放本次 listener 和显示挂接，`RenderSymbol.destroy()` 或 pool eviction 才真正销毁 cached player。
- VNI 缓存 key 必须包含足以区分资源身份的字段，例如 symbol、resolved state、project identity、assetUrls identity、playback range 或 manifest resource key。不同资源不能共用同一个 player。
- 每次复用前必须清理播放完成 listener、播放状态、range、可见性和上一次播放残留。异步 init 尚未完成时遇到 destroy/release，必须避免旧 promise 回来后污染新状态。
- 如果现有 `VNIPlayer` public API 无法安全 reset/replay，应先在 `packages/vnicore` 增加明确 public 方法或修正现有方法契约；不能在 rendercore 中绕过 public API 直接改内部节点。
- `packages/rendercore/src/win-amount/*` 的中奖金额 VNI tier 播放不是 symbol 动画，不纳入本次 symbol VNIPlayer 缓存，除非测试证明共享修正是必须的。
- `apps/symbolsviewer` 也使用 `createSymbolManifestAnimationResolver` 预览 manifest 驱动的 Spine/VNI symbol 动画；本任务可以不让 symbolsviewer 使用主转轮池，但必须确认 VNI/Spine adapter 的 public 行为没有被破坏。

### 3. game003 接入

RenderSymbol 池化在共享包中默认关闭，`apps/game003` 必须显式开启，并使用以下初始策略：

- `targetIdlePerCode = 5`
- `maxIdlePerCode = 10`
- `maxIdleTotal = 80`

接入位置必须服从现有边界：

- 可以在 game003 创建 rendercore reel / reel set 时传入通用池配置。
- 不要把 H1-H5、WL、L1 或 `bg-wins` 的 symbol 语义硬编码到共享包。
- 不要在 YAML 中新增运行期输入、token、服务器轮带或每局动态下注等字段。若只是性能调优配置，优先放在 TS app 配置中；若放入 YAML，必须补中文注释并执行生成与 `--check`。

## 不做的事

- 不做跨 symbol code 的 RenderSymbol 重绑定复用。
- 不优先做 raw `Sprite` 池、全局 `VNIPlayer` 池或全局 Spine 池；只有在 RenderSymbol 池化和 VNIPlayer 内缓存仍无法满足验收时，才写入报告作为后续任务。
- 不为了通过测试而在生产代码里加入隐藏 fallback、延时重试或吞错逻辑。
- 不修改 live server、gamecode、本地公开轮带、服务器 scene 叠加边界。
- 不把 `game003` 专属 symbol、bg-bar、minecart、bg-wins 语义写入 `packages/rendercore`、`packages/gameframeworks` 或 `packages/logiccore`。

## 详细步骤

### 第 1 步：基线审计

1. 在仓库根目录执行：

   ```sh
   git status --short --untracked-files=all
   ```

2. 核对当前实现面：

   ```sh
   rg -n "syncSlot|createRenderSymbolByCode|new RenderSymbol|VniSymbolAni|SpineSymbolAni|VNIPlayer|destroy\\(" packages/rendercore/src apps/game003/src packages/rendercore/tests apps/game003/tests
   ```

3. 记录现有测试基线：

   ```sh
   env CI=true pnpm --filter @slotclientengine/rendercore test
   env CI=true pnpm --filter game003 test
   ```

4. 如果依赖下载失败，先在当前 shell 执行：

   ```sh
   export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
   ```

   然后重跑同一个命令。不要因为依赖或网络问题改生产代码。

### 第 2 步：实现池 API

1. 在 `RenderReelSetOptions` 上增加 `symbolPool?: RenderSymbolPoolOptions`，在 `RenderReelOptions` 内部接收共享 `RenderSymbolPool` 实例。不要要求 app 直接构造 pool 对象。
2. 增加 `RenderSymbolPoolOptions`，至少包含：

   ```ts
   export interface RenderSymbolPoolOptions {
     readonly enabled?: boolean;
     readonly targetIdlePerCode?: number;
     readonly maxIdlePerCode?: number;
     readonly maxIdleTotal?: number;
   }
   ```

3. 增加 `RenderSymbolPool`，提供：
   - `acquire(code: number, create: () => RenderSymbol | null): RenderSymbol | null`
   - `release(code: number, symbol: RenderSymbol): void`
   - `trimCode(code: number): void`
   - `trimTotal(): void`
   - `destroy(): void`
   - 测试可读的统计方法可以放在 internal/test-only 入口中，但不要把调试 UI 或 console 噪声带入生产路径。

4. 对所有参数做显式校验：
   - `targetIdlePerCode >= 0`
   - `maxIdlePerCode >= targetIdlePerCode`
   - `maxIdleTotal >= 0`
   - 无效配置直接 throw，不能静默改成默认值。

### 第 3 步：接入 RenderReel 生命周期

1. `RenderReelSet` 根据 `RenderReelSetOptions.symbolPool` 创建共享 pool，未启用时不创建。
2. `RenderReel` 只接收共享 pool 引用，不自行创建 pool。
3. `syncSlot(slot, code)` 中：
   - code 未变化时不动当前 symbol。
   - code 变化时，将旧 symbol 从 slot container 移除，按旧 code release 到 pool。
   - 新 code 是 empty 时 slot.symbol 为 null，不创建池对象。
   - 新 code 非 empty 时从 pool acquire，未命中才调用 registry 创建。
   - acquire 后重新 addChild、init/reset，并请求当前应展示的 state。

4. `RenderReelSet.destroy()` 必须 drain shared pool；active slot symbol 仍由 Pixi child destroy 路径销毁。测试要覆盖 `destroy({ children: true })` 后 pool idle symbol 和 active symbol 都被清理。
5. `RenderGridCellReelSet` 目前不传 `symbolPool`，行为保持现状；如果类型变更影响它，必须同步修正并补测试。

### 第 4 步：补齐 RenderSymbol 复用 reset

1. 为池化 release/acquire 设计明确 reset 点，避免 pool 直接改太多私有字段。
2. reset 必须覆盖：
   - Pixi transform 和显示属性。
   - symbol state machine。
   - 当前动画对象生命周期。
   - base/state/overlay layer。
   - mask/filter/zIndex 等可见副作用。

3. reset 不能吞掉 `SymbolAnimationError`、资源缺失、manifest 缺失或 animation name 错误。这类问题必须继续 fail fast。

### 第 5 步：实现 VNIPlayer 缓存

1. 参考 `SpineSymbolAni` 当前缓存策略，但不要复制 Spine 专属假设。
2. 在 `RenderSymbol` 内新增 symbol animation runtime cache，并通过 `SymbolAnimationContext` 传给 resolver / ani。`RenderSymbol.reset()` 和 pool release 不销毁这个 cache，`RenderSymbol.destroy()` 和 pool eviction 必须销毁。
3. 将 `VniSymbolAni.reset()` 从“每次 dispose + new player”改为“同资源 key 复用 player 并重新播放”，资源 key 变化或 `RenderSymbol.destroy()` 才释放 cached player。
4. 处理异步 init：
   - 每次 init/replay 记录 token 或 generation。
   - 旧 promise 完成时如果 ani 已 destroy 或 generation 过期，必须释放或忽略，不能把旧 player 接回当前 overlay。

5. onPlaybackComplete listener 必须每次播放只注册一次，并在 reset/destroy 时解绑。
6. player 复用前必须 `pause` 或 reset 到明确起点，再 `playRange`。

### 第 6 步：game003 开启与配置

1. 找到 game003 创建 rendercore reel / reel set 的入口。
2. 在 `apps/game003/src/game-demo.ts` 创建 `RenderReelSet` 时传入：

   ```ts
   symbolPool: {
     enabled: true,
     targetIdlePerCode: 5,
     maxIdlePerCode: 10,
     maxIdleTotal: 80,
   }
   ```

3. 如改了 YAML，必须执行：

   ```sh
   env CI=true pnpm --filter game003 generate:static-config
   env CI=true pnpm --filter game003 check:static-config
   ```

   并检查 `apps/game003/src/generated/game-static.generated.ts`、`apps/game003/src/generated/game-loading.generated.ts` 是否为生成结果，不要手改生成物。

### 第 7 步：测试补齐

至少补齐以下测试：

- `packages/rendercore`：
  - pool 按 code 分桶，同 code 可复用，不同 code 绝不复用。
  - per-code 超过 10 个空闲时裁剪回 5 个。
  - 全局空闲超过 80 时按明确顺序裁剪。
  - release 后再次 acquire 的 `RenderSymbol` 不残留位置、alpha、visible、mask、filters、requested state、overlay children、动画完成状态。
  - pool eviction 和 destroy 会调用 symbol destroy，并释放内部 VNI/Spine 动画资源。
  - `RenderReel.syncSlot` code 变化时走 release/acquire，code 不变时不重建。
  - `RenderReelSet` 的 5 个 reel 共享同一个 pool，per-code 和 global 上限按 reel set 总量计算。
  - `RenderGridCellReelSet` 没有因为 `RenderReelOptions` 变更被默认启用池化，既有 grid-cell 行为不变。
  - empty symbol 不进池。
- `packages/rendercore` VNI：
  - 同一个 `RenderSymbol` / 同资源 key 重复进入 win 时只创建一次 `VNIPlayer`。
  - 状态切换销毁 `VniSymbolAni` 对象时不会销毁仍由 `RenderSymbol` cache 持有的 player。
  - destroy 后会释放 cached VNIPlayer。
  - playback complete listener 不重复注册，不会一次完成触发多次 `onceCompleted`。
  - 异步 init 过期后不会污染新状态。
- `packages/rendercore` Spine 回归：
  - H1-H5 / WL 类 Spine manifest 动画仍能按 exact animation name 播放。
  - `Idle -> Win -> Idle` 不因池化产生 destroy/recreate 闪烁。
- `apps/game003`：
  - `symbol-animation-config.test.ts` 继续证明 WL/H1-H5 使用 Spine，L1 win 使用 VNI。
  - game003 adapter / win loop / bg-bar / minecart 既有测试继续通过。
- `apps/symbolsviewer`：
  - `symbol-set-config.test.ts` 继续证明 manifest 驱动的 Spine/VNI symbol 动画 resolver 可用于预览。
  - symbolsviewer 不需要接入主转轮池，但必须通过测试和 typecheck，证明 rendercore public type / resolver 行为未破坏。

如果测试要求生产代码做奇怪分支，优先修测试或测试 helper，不能为测试污染生产路径。

## 验收命令

在仓库根目录执行，除浏览器人工验收外，以下命令必须在报告中记录结果：

```sh
git status --short --untracked-files=all
env CI=true pnpm --filter @slotclientengine/rendercore lint
env CI=true pnpm --filter @slotclientengine/rendercore test
env CI=true pnpm --filter @slotclientengine/rendercore typecheck
env CI=true pnpm --filter @slotclientengine/rendercore build
env CI=true pnpm --filter game003 lint
env CI=true pnpm --filter game003 test
env CI=true pnpm --filter game003 typecheck
env CI=true pnpm --filter game003 check:static-config
env CI=true pnpm --filter game003 release:check
env CI=true pnpm --filter symbolsviewer lint
env CI=true pnpm --filter symbolsviewer test
env CI=true pnpm --filter symbolsviewer typecheck
env CI=true pnpm format:check
git diff --check
git status --short --untracked-files=all
```

如果 `pnpm format:check` 或根级 turbo 命令因为历史无关文件失败，不能直接改无关文件；必须在任务报告中记录失败命令、失败文件、判断为任务内还是任务外，并确保任务内改动已通过对应 package 的 format/test/typecheck。

浏览器验收由人工执行时，任务报告只写清楚手动验收入口、建议场景和当前代码侧验收证据，不把“未执行的浏览器验收”写成已完成。

建议浏览器手动验收场景：

- 打开 game003，连续 spin 多轮，观察普通滚动过程中主转轮 symbol 是否有额外闪烁。
- 触发 WL/H1-H5 win，观察 `Idle -> Win -> Idle` 状态切换前后是否闪一下。
- 触发 L1 win，观察 VNI win 动画是否正常播放且重复中奖不出现首帧空白或播放完成事件重复。
- 触发 big/super/mega 金额动画，确认本任务没有影响 win amount VNI tier 播放。

## 完成标准

任务只有同时满足以下条件才算完成：

- `RenderSymbol` 池化已经落在 `packages/rendercore` 通用边界内，game003 只配置或调用，不复制共享渲染逻辑。
- 池按 code 分桶，并有可测试的 per-code 高低水位和全局上限；同一个 `RenderReelSet` 的所有 reel 共享同一个 pool。
- 共享包默认不改变现有行为，game003 显式开启池化；`RenderGridCellReelSet` 没有被无意启用。
- `RenderSymbol` 复用前后没有状态泄漏，测试覆盖可见属性、状态机、动画层和 destroy/eviction。
- symbol 级 `VNIPlayer` 已缓存到 `RenderSymbol` 生命周期内，重复同资源 win 不反复 new player。
- Spine symbol 动画缓存和 H1-H5 / WL 的 win 播放没有回退到默认动画。
- symbolsviewer 的 manifest 动画预览测试/typecheck 通过，证明 rendercore symbol animation public 行为未被破坏。
- 无隐藏 fallback；资源缺失、manifest 错误、animation name 错误继续显式失败。
- 任务内测试、typecheck、static config check、release check 和 diff check 按“验收命令”执行并记录。
- 如本任务新增或改变了仓库协作规则、目录规范、渲染边界或基础脚本，已同步更新 `/Users/zerro/github.com/minecart2/agents.md`。
- 已写中文任务报告，路径为 `/Users/zerro/github.com/minecart2/tasks/79-render-symbol-pool-vni-cache-[utctime].md`，其中 `[utctime]` 使用 UTC 年月日时分秒格式，例如 `260703-101530`。

## 任务报告要求

完成实现后，必须新增一份中文报告：

```text
tasks/79-render-symbol-pool-vni-cache-[utctime].md
```

报告必须包含：

- 本次改动摘要。
- 实际修改文件列表。
- 池化策略最终值，是否默认开启，game003 是否显式开启。
- pool 所有权说明：是否由 `RenderReelSet` 共享持有，grid-cell reel 是否保持不启用。
- VNIPlayer 缓存 key 和生命周期说明。
- 内存/对象数量观察结果；如果没有重新测量，必须说明未测量，不能复用旧数字当新证据。
- 完整验收命令和每条结果。
- 未执行的浏览器人工验收项和建议验收场景。
- 是否更新 `agents.md`，如果未更新，说明为什么不需要。
- 任何未解决风险、后续建议或任务外失败。

## 二次遗漏检查清单

提交前必须做一遍额外检查：

- `rg -n "new RenderSymbol|createRenderSymbolByCode|destroy\\(\\{ children: true \\}\\)|VniSymbolAni|SpineSymbolAni|VNIPlayer" packages/rendercore/src apps/game003/src packages/rendercore/tests apps/game003/tests`
- 检查所有 `RenderSymbol` 创建入口是否要走池，尤其是 reel 内创建和 catalog 直接创建的边界是否清楚。
- 检查 `RenderReelSet`、`RenderReel`、`RenderGridCellReelSet` 的构造链，确认 pool 只在主 reel set 显式开启时共享生效。
- 检查 `bg-bar`、minecart payload 这类 app 层临时 symbol 是否不应进入主转轮池；如果不进入，要在报告中说明边界。
- 检查 `apps/symbolsviewer` 的 `createSymbolManifestAnimationResolver` 使用面没有因 `SymbolAnimationContext` 或 VNI/Spine adapter 改动破坏。
- 检查 `win-amount` 的 VNI tier 播放没有被 symbol VNI 缓存误伤。
- 检查 generated 文件没有手改；如 YAML 变更，必须先生成再 `--check`。
- 检查 `agents.md` 是否需要补充新的持久规则。
- 检查 `git diff --check`，并确认 `git status --short --untracked-files=all` 中没有遗漏报告或临时文件。
