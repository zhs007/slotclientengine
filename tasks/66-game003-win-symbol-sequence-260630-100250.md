# 66 game003 中奖 symbol 播放执行报告

时间：2026-06-30 10:02:50 UTC

## 结论

已按 `tasks/66-game003-win-symbol-sequence.md` 执行完成，并按用户最新修正收口：

- `symbolNums` / `symbolNum` 不作为 `pos` 数量校验依据，Ways 中奖允许二者不一致。
- 默认不校验 `result.symbol` 与 target scene 可见 symbol 是否一致。
- 如后续游戏确实需要 symbol 语义校验，只能由 app 显式传 `validatePosition` callback；不传即不校验。
- `game003` 当前未传 symbol 语义 validator，因此不会再触发：
  - `symbolNums 3 does not match 4 positions`
  - `coordinate (2, 4) expected symbol 3, got 0`
- 浏览器验收按用户要求未执行，交由用户验收。

## 本次改动

### logiccore

新增：

- `packages/logiccore/src/win-results.ts`
- `packages/logiccore/tests/win-results.test.ts`

导出：

- `parseWinResultPositions`
- `getComponentWinResultGroups`
- `ComponentWinResultPositionValidator`
- 相关 win result position/group 类型

行为：

- 只做通用结构校验：`pos` 数组、偶数长度、非负整数、非空、单 result 内重复坐标、可选 scene 越界。
- 保留 `usedResults` 顺序和原始 result index。
- 未触发组件返回空数组；触发但映射缺失、result 越界沿用现有显式失败。
- `validatePosition` 只有在调用方显式传入时才执行。

### gameframeworks

新增 facade：

- `packages/gameframeworks/src/component-helpers.ts`
  - `getComponentWinResultGroupsByName(logic, name, { stepIndex, scene, validatePosition })`

同步导出类型，保证 `apps/game003` 不直接依赖 `@slotclientengine/logiccore`。

### rendercore

新增通用可见 symbol 状态 API：

- `RenderReel.requestVisibleSymbolState(windowY, state)`
- `RenderReel.getVisibleSymbolStateSnapshot(windowY)`
- `RenderReelSet.requestVisibleSymbolState(x, y, state)`
- `RenderReelSet.requestVisibleSymbolStates(positions, state)`
- `RenderReelSet.getVisibleSymbolStateSnapshot(x, y)`
- `RenderReelSet.getVisibleSymbolStateSnapshots(positions)`

边界：

- 只能请求当前可见窗口。
- spinning 中请求显式失败。
- 越界、empty symbol、目标 symbol 不支持状态均显式失败。
- `rendercore` 不知道 `bg-wins`、Ways、WL、game003 或 live GMI。

### game003

新增：

- `apps/game003/src/win-sequence.ts`
- `apps/game003/tests/win-sequence.test.ts`
- `apps/game003/tests/fixtures/game003-gmi.ts`

流程：

- `playSpin()` 从 logic 第 0 step 读取 `bg-wins.basicComponentData.usedResults`。
- 停到服务器 target scene 后，按 `usedResults` 顺序依次播放中奖组。
- 每个 result 的所有 `pos` 同时请求 `win` 状态。
- 当前组 once 动画回到 `normal` 后进入下一组。
- 所有中奖组播放完成后才 resolve `playSpin()`。
- spin 阶段或中奖播放阶段重复 `playSpin()` 继续显式失败。

### 文档和规则

已更新：

- `apps/game003/README.md`
- `agents.md`
- `tasks/66-game003-win-symbol-sequence.md`

补充了 `bg-wins` app 层边界、Ways 下 `symbolNums/symbolNum` 不等同 `pos` 数量、默认不做 symbol 语义校验、可选 validator 的长期规则。

## 验收命令

全部通过：

```bash
CI=true pnpm --filter @slotclientengine/logiccore lint
CI=true pnpm --filter @slotclientengine/logiccore test
CI=true pnpm --filter @slotclientengine/logiccore typecheck
CI=true pnpm --filter @slotclientengine/logiccore build
CI=true pnpm --filter @slotclientengine/logiccore format:check

CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
CI=true pnpm --filter @slotclientengine/gameframeworks format:check

CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore format:check

CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 format:check

CI=true pnpm lint
CI=true pnpm build
git diff --check
```

测试结果要点：

- `logiccore`：9 files / 56 tests passed。
- `gameframeworks`：9 files / 31 tests passed。
- `rendercore`：21 files / 127 tests passed。
- `game003`：16 files / 68 tests passed，branch coverage 80.73%，满足阈值。
- root `lint`：25 packages successful。
- root `build`：25 packages successful。
- `game003 release:check`：通过，`game003 static dist check passed`。

## 静态边界验收

全部符合预期：

```bash
rg -n "\"bg-wins\"" packages/logiccore packages/rendercore packages/gameframeworks
```

无匹配，说明共享包未硬编码 `bg-wins`。

```bash
rg -n "from [\"']@slotclientengine/logiccore[\"']|import\([\"']@slotclientengine/logiccore[\"']\)" apps/game003/tests
rg -n "@slotclientengine/logiccore" apps/game003/src
```

无 app 源码/import 匹配；测试里只保留 source-boundary 断言。

```bash
rg -n "\.children|removeChildren|requestState\(\"win\"\)" apps/game003/src
```

无匹配，未通过 Pixi/private children 或私有 symbol API 绕过 `rendercore`。

```bash
rg -n "serverUrl" apps/game003/src apps/game003/tests apps/game003/README.md
```

只命中固定 live server 配置、拒绝旧 query 参数的测试/文档和生成静态配置，未引入 URL 覆盖 live server 的回归。

## 过程中发现并处理的问题

- 初版实现曾按 `symbolNums/symbolNum` 与 positions 数量做校验；已按用户修正删除，并补测试覆盖 mismatch 仍正常生成播放队列。
- 初版实现曾默认校验 `result.symbol` 与 target scene；已改为可选 validator，`game003` 当前不传 validator，并补测试覆盖 scene symbol 不一致仍不阻断。
- 移除 symbol 语义校验后，`game003` 覆盖率曾低于阈值；已补充 win sequence 和 adapter 行为测试，最终 `game003 test` 通过。
- `packages/logiccore` 的 `format:check` 初次暴露包内既有格式不一致；已执行包级 format，因此本次 diff 中包含一批 `logiccore` Prettier-only 调整，最终 format check 通过。
- 未直接手改 `apps/game003/src/generated/game-static.generated.ts` 或 `game-loading.generated.ts`；`generate:static-config` 返回生成文件已是最新，`check:static-config` 通过。

## 浏览器验收交接

本次未启动浏览器。建议用户重点验收：

- live spin 正常停到服务器返回 scene。
- 中奖后第一组 result 的全部 `pos` 同时进入 win 状态。
- 第一组结束后再播放第二组，按 `usedResults` 顺序推进。
- 中奖播放期间 spin 不提前 resolve，按钮/collect 流程不抢跑。
- 不再出现 `symbolNums ... does not match ... positions`。
- 不再出现 `coordinate (...) expected symbol ..., got ...`。

