# 任务 79 执行报告：RenderSymbol 池化与 VNIPlayer 缓存

## 改动摘要

- 在 `packages/rendercore` 新增通用 `RenderSymbolPoolModel`，由 `RenderReelSet` 共享持有并传给每个 `RenderReel`。
- `RenderReel.syncSlot` 在 symbol code 变化时改为 release/acquire；空 symbol 仍为 `null`，不进入池。
- `RenderSymbol` 新增 pool release reset 入口，释放前清理位置、alpha、visible、mask、filters、zIndex、状态机、overlay 和当前动画对象。
- `VniSymbolAni` 改为按 `RenderSymbol` root 维度缓存 VNIPlayer；普通状态切换只解绑监听和显示挂接，`RenderSymbol.destroy()` 才统一销毁 VNI 缓存。
- `apps/game003` 主转轮显式开启池化；bg-bar、minecart payload、win-amount VNI tier 不接入本次主转轮池。
- 同步补齐 rendercore、game003、symbolsviewer 测试，其中 symbolsviewer 的 `H2-H5.appear` 测试按 manifest 真实 `static` 合同修正。

## 修改文件

- `packages/rendercore/src/reel/render-symbol-pool.ts`
- `packages/rendercore/src/reel/types.ts`
- `packages/rendercore/src/reel/render-reel-set.ts`
- `packages/rendercore/src/reel/render-reel.ts`
- `packages/rendercore/src/reel/index.ts`
- `packages/rendercore/src/symbol/render-symbol.ts`
- `packages/rendercore/src/symbol/vni-animation.ts`
- `packages/rendercore/tests/reel/render-symbol-pool.test.ts`
- `packages/rendercore/tests/reel/render-reel-set.test.ts`
- `packages/rendercore/tests/symbol/vni-animation.test.ts`
- `apps/game003/src/game-demo.ts`
- `apps/game003/tests/game-demo.test.ts`
- `apps/symbolsviewer/tests/symbol-set-config.test.ts`

## 池化策略

- 共享包默认不启用：`RenderReelSetOptions.symbolPool` 未配置或 `enabled: false` 时不创建 pool。
- game003 显式启用：
  - `targetIdlePerCode = 5`
  - `maxIdlePerCode = 10`
  - `maxIdleTotal = 80`
- pool 按 symbol code 分桶，不跨 code 复用。
- 单 code 空闲数量超过 `maxIdlePerCode` 时裁剪回 `targetIdlePerCode`。
- 全局空闲数量超过 `maxIdleTotal` 时按最早 release 的 LRU 顺序裁剪。
- pool 所有权在 `RenderReelSet`；同一个 reel set 的所有 reel 共享一个 pool。`RenderGridCellReelSet` 未传入 pool，保持不启用。

## VNIPlayer 缓存生命周期

- 缓存位置：`packages/rendercore/src/symbol/vni-animation.ts` 内部 WeakMap，以 `SymbolAnimationContext.root` 为 key，即对应 `RenderSymbol` root。
- 缓存 key 包含：
  - symbol
  - state
  - manifest project path
  - playback start/end/loop
  - VNI project name、stage width/height/duration
  - 排序后的 assetUrls
- `VniSymbolAni.destroy()` 只解绑 playback complete listener、pause 并从 overlay 移除 display object，不销毁 cached player。
- `RenderSymbol.destroy()` 调用 `destroyVniSymbolAnimationCache(this)`，pool eviction、pool destroy、reel set destroy 最终都会销毁 cached VNIPlayer。
- 异步 init 使用 request id 防旧 promise 回来污染新状态；过期结果只移除 stale display object，不重新挂回 overlay。

## 内存和对象观察

- 本次未重新做 Node heap 或 GPU 资源测量。
- 未复用旧的 8.3 KB / 11.7 KB 粗略数字作为新证据；本次只通过对象复用与 destroy 调用测试验证生命周期。

## 验收结果

- `git status --short --untracked-files=all`：执行前工作区干净；执行后仅本任务文件和报告变更。
- `env CI=true pnpm --filter @slotclientengine/rendercore lint`：通过。
- `env CI=true pnpm --filter @slotclientengine/rendercore test`：通过，29 个测试文件、181 个测试。
- `env CI=true pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- `env CI=true pnpm --filter @slotclientengine/rendercore build`：通过。
- `env CI=true pnpm --filter game003 lint`：通过。
- `env CI=true pnpm --filter game003 test`：通过，25 个测试文件、114 个测试。
- `env CI=true pnpm --filter game003 typecheck`：通过。
- `env CI=true pnpm --filter game003 check:static-config`：通过，生成文件校验通过。
- `env CI=true pnpm --filter game003 release:check`：通过，包含 static dist 校验。
- `env CI=true pnpm --filter symbolsviewer lint`：通过。
- `env CI=true pnpm --filter symbolsviewer test`：通过，2 个测试文件、15 个测试。
- `env CI=true pnpm --filter symbolsviewer typecheck`：通过。
- `git diff --check`：通过。
- `env CI=true pnpm format:check`：失败，失败来自历史无关格式问题，首个明确失败为 `apps/reelsviewer` 多个文件；未修改这些无关文件。
- `env CI=true pnpm --filter @slotclientengine/rendercore format:check`：仍失败，唯一剩余文件是历史无关的 `packages/rendercore/scripts/generate-symbol-state-textures.mjs`。
- `env CI=true pnpm --filter game003 format:check`：通过。
- `env CI=true pnpm --filter symbolsviewer format:check`：通过。
- `env CI=true pnpm --filter @slotclientengine/rendercore exec prettier --check ...任务内 rendercore 文件...`：通过。

## 二次遗漏检查

- 已执行任务要求的 grep：
  - `new RenderSymbol`
  - `createRenderSymbolByCode`
  - `destroy({ children: true })`
  - `VniSymbolAni`
  - `SpineSymbolAni`
  - `VNIPlayer`
  - `symbolPool`
- 结论：
  - reel 内创建入口走 `RenderReelSet` 共享 pool。
  - catalog 直接创建仍保留给 symbolsviewer、bg-bar、minecart payload 等非主转轮场景。
  - win-amount VNI tier 仍在 `packages/rendercore/src/win-amount`，未接入 symbol VNI 缓存。
  - generated 文件没有手改；game003 static config check 通过。

## 浏览器人工验收

未执行浏览器验收，按用户要求由人工最后验收 game003。

建议场景：

- 打开 game003 连续 spin 多轮，观察主转轮普通滚动是否仍有额外闪烁。
- 触发 WL/H1-H5 win，观察 `Idle -> Win -> Idle` 是否无异常闪烁。
- 触发 L1/L2/L3/L4/L5 VNI win，观察重复中奖是否没有首帧空白或完成事件重复。
- 触发 big/super/mega 金额动画，确认 win amount VNI tier 未受 symbol VNI 缓存影响。

## agents.md

未更新 `agents.md`。本次没有新增仓库协作规则、目录规范、渲染边界或基础脚本；实现仍遵守既有 rendercore/game003/vnicore 边界。

## 未解决风险

- 根级 `format:check` 和 rendercore 包级 `format:check` 仍有历史无关格式失败；本任务触及文件已单独 Prettier 校验通过。
- 本次未做真实浏览器性能/闪烁验收，需按上方场景在浏览器中最终确认。
