# game003 win symbol sequence 任务计划

## 1. 任务目标

本任务为 `apps/game003` 增加中奖 symbol 播放能力：live spin 的主转轮停到服务器目标 scene 后，如果本轮逻辑里触发了中奖组件 `bg-wins`，需要按照 `bg-wins.basicComponentData.usedResults` 指向的 `clientData.results[]` 顺序，依次把每个中奖 result 的 `pos` 坐标对应 symbol 切到 `win` 状态，播放完所有中奖 result 后才结束本次 `playSpin()`。

本任务中的关键数据合同：

- `bg-wins.basicComponentData.usedResults` 是本轮需要播放的中奖 result 索引列表。
- 每个 `clientData.results[index]` 表示一组中奖。
- `result.pos` 是中奖 symbol 的可见窗口坐标，格式为成对数字：`[x0, y0, x1, y1, ...]`。
- 坐标基准是 `game003` 当前 5 列 x 5 行主转轮的目标可见 scene，`x` 为列索引，`y` 为列内可见行索引。
- `result.symbol` 不应在共享 helper 中默认校验。若某个游戏需要 symbol 语义校验，应由 app 通过可选 per-position validator 明确传入规则；不传 validator 时不检查 `result.symbol` 和 target scene 是否一致。`game003` 当前是 Ways 游戏，wild / 替代 symbol 规则可能随游戏变化，不在本任务中写死 WL 规则。
- 一个 result 的所有 `pos` 同时播放；多个 result 按 `usedResults` 顺序依次播放。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、文档同步、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/66-game003-win-symbol-sequence-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/66-game003-win-symbol-sequence-260630-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- VS Code 调试运行 TypeScript：`ts-node`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。若确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game003 test
CI=true pnpm --filter @slotclientengine/rendercore test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。缺少 `bg-wins` 映射、`usedResults` 越界、`pos` 非成对坐标、坐标越界、symbol 无 `win` 状态资源或运行时状态 API 不足，都必须尽早暴露。`result.symbol` 与 target scene 的语义匹配不做默认校验；如后续游戏需要，应由 app 显式传入 validator。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 当前相关文件

逻辑解析和组件结果：

```text
packages/logiccore/src/types.ts
packages/logiccore/src/parser.ts
packages/logiccore/src/component.ts
packages/logiccore/src/game-logic.ts
packages/logiccore/src/index.ts
packages/logiccore/tests/component.test.ts
packages/logiccore/tests/parser.test.ts
```

framework facade 和 app 可用导出：

```text
packages/gameframeworks/src/index.ts
packages/gameframeworks/src/component-helpers.ts
packages/gameframeworks/tests/component-helpers.test.ts
```

rendercore symbol / reel 状态能力：

```text
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/state-machine.ts
packages/rendercore/src/symbol/animation-resolver.ts
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/reel/render-reel-set.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/src/reel/index.ts
packages/rendercore/tests/reel/render-reel.test.ts
packages/rendercore/tests/reel/render-reel-set.test.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
```

game003 实现和测试：

```text
apps/game003/src/game-adapter.ts
apps/game003/src/game-demo.ts
apps/game003/src/game-layout.ts
apps/game003/src/scene.ts
apps/game003/src/assets.ts
apps/game003/src/symbol-animation-config.ts
apps/game003/tests/fixtures/game003-gmi.ts
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/game-demo.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/tests/scene.test.ts
apps/game003/README.md
apps/game003/config/game-static.yaml
```

协作规则：

```text
agents.md
tasks/66-game003-win-symbol-sequence.md
```

### 3.2 logiccore 现状

`packages/logiccore` 已经解析：

- `replyPlay.results[]`
- 每个 step 的 `clientData.scenes[]`
- 每个 step 的 `clientData.results[]`
- `curGameModParam.historyComponents`
- `curGameModParam.mapComponents`
- 组件 `basicComponentData.usedScenes`
- 组件 `basicComponentData.usedResults`

现有 API：

```ts
step.hasComponent(name);
step.getComponent(name);
step.getComponentResults(name);
logic.getComponentResults(stepIndex, name);
```

现有 `buildLogicComponent(...)` 已经会校验 triggered component 必须存在于 `mapComponents`，并校验 `usedResults` 不越界。

当前缺口：`WinResult.pos` 只是 number array，尚未提供通用工具把它解析成 `{ x, y }[]` 并做成对、整数、非负和 scene 边界校验；symbol 语义校验应是可选 callback，不应默认启用。

### 3.3 gameframeworks 现状

`apps/game003` 不能直接依赖 `@slotclientengine/logiccore`，当前只应通过 `@slotclientengine/gameframeworks` 使用 game logic facade。

`packages/gameframeworks/src/component-helpers.ts` 已经提供：

```ts
findComponentSteps(logic, name);
getComponentScenesByName(logic, name, { stepIndex });
getComponentResultsByName(logic, name, { stepIndex });
```

若本任务在 `logiccore` 增加通用 win position 工具，需要从 `gameframeworks` 重新导出或封装，保证 `game003` 仍不直接 import `logiccore`。

### 3.4 rendercore 现状

`RenderSymbol` 已经支持：

```ts
renderSymbol.requestState("win");
renderSymbol.update(deltaSeconds);
```

默认 `win` 状态是一次性动画，完成后状态机会回到 `normal`。`game003` 不需要自己硬编码切回 `normal` 的兜底定时器。

`RenderReel` 内部 slot 已经能拿到可见 symbol，但目前缺少稳定公共 API 让使用者按可见窗口坐标请求状态。不要在 `apps/game003` 中遍历 `RenderReel` 私有 children、slot container 或 snapshot 里的 `symbol` 引用来直接调用 `requestState("win")`。这类坐标到 symbol 的映射属于 `rendercore` 的通用 reel 能力。

### 3.5 game003 现状

`apps/game003/src/game-adapter.ts` 当前流程大致为：

1. `playSpin(logic)` 读取 `logic.getStep(0).getScene(0)` 作为目标 scene。
2. 调用 `runtime.spinToScene(targetScene, "spin main scene")`。
3. ticker 中等待 `runtime.update(deltaSeconds)` 返回 `completed`。
4. 校验 `runtime.getVisualSnapshot()` 与 target scene 一致。
5. 直接 resolve `playSpin()`。

本任务应把中奖播放接在第 4 步之后、第 5 步之前。这样 framework 的 spin Promise、HUD win 状态和后续 collect 流程不会抢在中奖动画之前结束。

`apps/game003/src/game-demo.ts` 当前 `Game003ReelRuntime` 包装了 `RenderReelSet`，并暴露 `getVisualSnapshot()`。本任务应在这里增加 game003 专用的薄封装，例如按 `{ x, y }[]` 请求可见 symbol 状态、读取目标坐标状态、驱动非 spin 状态下的 symbol update。不要把 `bg-wins` 字符串放入 `rendercore`。

## 4. 数据样例和验收 fixture

执行实现时必须把附件中的中奖样例固化成测试 fixture，避免只依赖 live 手测。

目标 scene 示例：

```ts
export const GAME003_WIN_SPIN_SCENE = [
  [8, 7, 3, 1, 4],
  [6, 10, 4, 3, 1],
  [4, 6, 6, 6, 3],
  [22, 5, 7, 5, 1],
  [7, 2, 6, 8, 4],
] as const;
```

中奖结果示例：

```ts
[
  {
    pos: [0, 4, 1, 2, 2, 0],
    symbol: 4,
    coinWin: 10,
    cashWin: 100,
    symbolNums: 3,
  },
  {
    pos: [0, 2, 1, 3, 2, 4],
    symbol: 3,
    coinWin: 15,
    cashWin: 150,
    symbolNums: 3,
  },
];
```

`bg-wins` 组件示例：

```ts
"bg-wins": {
  basicComponentData: {
    usedScenes: [],
    usedResults: [0, 1],
    usedPrizeScenes: [],
    pos: [],
    coinWin: 25,
    cashWin: 250,
    targetScene: 0,
    runIndex: 0,
    output: 0,
    strOutput: "",
  },
  nextComponent: "",
  symbolNum: 6,
  wildNum: 0,
  respinNum: 0,
  wins: 25,
  winMulti: 1,
}
```

fixture 要求：

- 保留完整 raw GMI 形态，不要只构造半截对象。
- `historyComponents` / `historyComponentsEx` 中包含 `bg-spin` 和 `bg-wins`。
- `bg-spin.basicComponentData.usedScenes = [0]`。
- `bg-wins.basicComponentData.usedResults = [0, 1]`。
- 顶层 `totalwin = 250`，`results = 1`。
- `replyPlay.results[0].coinWin = 25`，`cashWin = 250`。
- fixture scene 坐标用于覆盖 `pos` 边界；`result.symbol` 不作为默认一致性校验依据。

## 5. 设计合同和边界

### 5.1 logiccore 边界

允许新增通用工具，但不能写入任何 game003 专属语义。

建议新增：

```text
packages/logiccore/src/win-results.ts
packages/logiccore/tests/win-results.test.ts
```

建议类型：

```ts
export interface WinResultPosition {
  readonly x: number;
  readonly y: number;
}

export interface ComponentWinResultGroup {
  readonly stepIndex: number;
  readonly resultIndex: number;
  readonly result: WinResult;
  readonly positions: readonly WinResultPosition[];
}
```

如实现中要直接读取 `result.symbol` / `result.symbolNums`，可以同步把 `WinResult`
类型补充为可选只读数字字段；默认 helper 不应校验 symbol 语义，游戏如需校验应显式传入 per-position validator。

建议 API：

```ts
parseWinResultPositions(result: WinResult, label?: string): readonly WinResultPosition[];

getComponentWinResultGroups(
  step: GameLogicStep,
  componentName: string,
  options?: {
    readonly scene?: SceneMatrix;
    readonly validatePosition?: ComponentWinResultPositionValidator;
  },
): readonly ComponentWinResultGroup[];
```

实现要求：

- `componentName` 只作为参数传入，不在 `logiccore` 内硬编码 `bg-wins`。
- 读取 `usedResults` 时必须通过 `step.getComponent(componentName)?.usedResultIndexes`
  保留原始 result index，不要只用 `getComponentResults(...)` 后丢失索引。
- `pos.length` 必须是偶数。
- 被组件引用的中奖 result 的 positions 必须非空。
- `x` / `y` 必须是非负整数。
- 单个 result 内不得出现重复坐标；跨 result 重复坐标允许顺序重播。
- 如果传入 `scene`，`x` 必须小于列数，`y` 必须小于该列行数。
- `symbolNums` / `symbolNum` 在 Ways 中奖里不等同于可见坐标数量，不作为 `pos` 数量校验依据；中奖播放以 `usedResults` 指向的 `result.pos` 和坐标边界为准。
- 默认不校验 `result.symbol` 与 target scene 的一致性；如某游戏需要，应由 app 显式传入 `validatePosition`，共享包只调用 callback，不硬编码 WL / wild / game003 规则。
- 未触发组件返回空数组；触发但 `mapComponents` 缺失、`usedResults` 越界等沿用现有显式失败。
- 协议解析/校验失败使用现有 `LogicParseError`，不要新建一套无关错误类型。
- `logiccore` 和 `gameframeworks` 的共享包测试应使用中性组件名，例如
  `lineWin` / `winComponent`，不要在共享包测试或 README 中写死 `bg-wins`。

### 5.2 gameframeworks 边界

`game003` 不直接依赖 `@slotclientengine/logiccore`。如果 app 需要使用新增 win position helper，需要通过 `packages/gameframeworks` 导出。

建议新增或扩展：

```text
packages/gameframeworks/src/component-helpers.ts
packages/gameframeworks/tests/component-helpers.test.ts
```

建议导出：

```ts
getComponentWinResultGroupsByName(logic, name, {
  stepIndex,
  scene,
  validatePosition,
});
```

或直接从 `packages/gameframeworks/src/index.ts` 重新导出 `logiccore` 的纯工具。无论选择哪种方式，`apps/game003/tests/source-boundary.test.ts` 必须继续证明 app source 没有直接 import `@slotclientengine/logiccore`。

### 5.3 rendercore 边界

`rendercore` 只提供通用可见 symbol 状态请求能力，不认识 `bg-wins`、`WaysTriggerData`、game003 或 live GMI。

建议在普通 reel 体系补 API：

```ts
RenderReel.requestVisibleSymbolState(windowY: number, state: SymbolStateId): void
RenderReelSet.requestVisibleSymbolState(x: number, y: number, state: SymbolStateId): void
RenderReelSet.requestVisibleSymbolStates(
  positions: readonly { readonly x: number; readonly y: number }[],
  state: SymbolStateId,
): void
```

也可以采用等价命名，但必须满足：

- 只允许作用于当前可见窗口，不允许请求 buffer slot。
- `x` / `y` 越界显式失败。
- 目标 slot 是 empty symbol 时显式失败，避免用透明/空图静默吞中奖。
- 目标 symbol 不支持 `win` 状态时沿用 `RenderSymbol.requestState(...)` 的显式失败。
- API 可以读取状态 snapshot，便于测试和 adapter 判断当前中奖组是否播放完成。
- 普通转轮停止后仍能通过 `update(deltaSeconds)` 推进 symbol once 动画。
- 判断一次性 `win` 动画完成时，不能只在请求状态的同一个 tick 立即检查
  `requestedState`；runtime/adapter 必须记录中奖组已经启动，并至少经过一次
  post-request update，或使用明确的 once-completed 信号，避免同帧误判完成。
- rendercore 层错误继续使用 `ReelError` / 现有 symbol error 类型，不新增 app
  专属错误类型。

不要把该能力写成 `game003` 私有 DOM/Pixi children 遍历。

### 5.4 game003 边界

`bg-wins` 是 game003 自己的配置合同，应放在 app 层：

```ts
const GAME003_WIN_COMPONENT_NAME = "bg-wins";
```

建议新增：

```text
apps/game003/src/win-sequence.ts
apps/game003/tests/win-sequence.test.ts
```

`win-sequence.ts` 负责：

- 从 `GameLogic` 第 0 step 和目标 scene 中提取 `bg-wins` 中奖组。
- 复用 gameframeworks 导出的通用 helper。
- 输出 game003 adapter 可直接消费的中奖播放队列。
- 保持 fail-fast 校验，不做 component 名称猜测、不从其它组件自动兜底。
- 读取 `bg-wins` 的 raw component 数据，若存在有限数字字段，校验：
  - `wins` / `basicComponentData.coinWin` 等于被引用 result 的 `coinWin` 汇总。
  - `basicComponentData.cashWin` 等于被引用 result 的 `cashWin` 汇总。
  - `game003` 是 Ways 游戏，本任务不写死 WL / wild 替代规则；symbol 语义校验只能通过可选 validator 显式传入，不传时不做默认校验。

`game-adapter.ts` 负责：

- `playSpin(logic)` 中保存本次 logic、targetScene 和待播放中奖队列。
- 转轮完成并校验 target scene 后，如果中奖队列为空，直接 resolve。
- 如果中奖队列非空，进入 win sequence phase。
- 每个中奖 result 的所有 positions 同时请求 `win` 状态。
- 当前中奖组播放完成后，自动进入下一组。
- 所有中奖组播放完成后 resolve `playSpin()`。
- `destroy()` 时继续 reject pending animation。
- 第二次 `playSpin()` 在 spin 或中奖播放期间仍应显式失败。

不要在 app 中：

- 直接 import `@slotclientengine/logiccore`。
- 直接遍历 `RenderReel` / `RenderSymbol` 的私有 Pixi children。
- 直接根据 `totalwin > 0` 猜中奖位置。
- 在缺少 `bg-wins` 时通过所有 `results` 自动兜底播放。
- 靠固定 `setTimeout` 硬切下一组；应使用 ticker delta、symbol 状态完成或明确的 runtime sequence state。

## 6. 实施步骤

### 6.1 盘点和 fixture

1. 执行工作区检查：

   ```bash
   git status --short --untracked-files=all
   git diff --stat
   ```

2. 重新阅读相关文件：

   ```bash
   sed -n '1,220p' packages/logiccore/src/component.ts
   sed -n '1,220p' packages/gameframeworks/src/component-helpers.ts
   sed -n '1,260p' packages/rendercore/src/reel/render-reel.ts
   sed -n '1,260p' packages/rendercore/src/reel/render-reel-set.ts
   sed -n '1,260p' apps/game003/src/game-adapter.ts
   sed -n '1,260p' apps/game003/src/game-demo.ts
   ```

3. 在 `apps/game003/tests/fixtures/game003-gmi.ts` 中新增 win fixture：
   - `GAME003_WIN_SPIN_SCENE`
   - `GAME003_WIN_RESULTS`
   - `GAME003_SAMPLE_WIN_SPIN_RESULT`

4. 新增 fixture 必须可被 `createSlotGameLogicResult(...)` 或 `createGameLogicFromGmi(...)` 解析。

### 6.2 logiccore 通用工具

1. 新增 `packages/logiccore/src/win-results.ts`。
2. 实现 `parseWinResultPositions(...)` 和 `getComponentWinResultGroups(...)`。
3. 从 `packages/logiccore/src/index.ts` 导出新类型和工具。
4. 新增 `packages/logiccore/tests/win-results.test.ts`，覆盖：
   - 正常解析 `[0,4,1,2,2,0]` 为三组坐标。
   - `usedResults` 顺序被保留。
   - `resultIndex` 保留原索引。
   - 共享包测试使用中性组件名，不出现 `bg-wins`。
   - `pos` 奇数长度失败。
   - `pos=[]` 且被组件引用时失败。
   - `pos` 非整数、负数失败。
   - 单个 result 内重复坐标失败。
   - 坐标越界失败。
   - `symbolNums` / `symbolNum` 与 positions 数量不一致时仍按 `pos` 播放，不应失败。
   - 未传 `validatePosition` 时 symbol 与 scene 不一致不失败。
   - 传入 `validatePosition` 时按调用方规则失败。
   - 未触发组件返回空数组。
   - 触发组件缺少 `mapComponents` 仍沿用现有显式失败。

### 6.3 gameframeworks facade

1. 按最终实现方式更新 `packages/gameframeworks/src/component-helpers.ts` 或 `packages/gameframeworks/src/index.ts`。
2. 确保 app 可从 `@slotclientengine/gameframeworks` 拿到 win result group helper。
3. 更新 `packages/gameframeworks/tests/component-helpers.test.ts`，覆盖：
   - 通过 `GameLogic` 和 component name 读取 win positions。
   - `stepIndex` 指定时只读该 step。
   - 空 component name 仍显式失败。
   - app 不需要直接 import `logiccore`。
   - 共享 facade 不硬编码 `bg-wins`，测试组件名保持中性。

### 6.4 rendercore 可见 symbol 状态 API

1. 更新 `packages/rendercore/src/reel/types.ts`，增加必要的 public snapshot 类型。
2. 更新 `packages/rendercore/src/reel/render-reel.ts`，提供按 visible `windowY` 请求 symbol 状态的 public API。
3. 更新 `packages/rendercore/src/reel/render-reel-set.ts`，提供按 `{ x, y }` 请求可见 symbol 状态的 public API。
4. 保持现有 `spinBlur`、落地回 `normal`、target visible scene injection 行为不变。
5. 新增/更新测试：

   ```text
   packages/rendercore/tests/reel/render-reel.test.ts
   packages/rendercore/tests/reel/render-reel-set.test.ts
   ```

   覆盖：
   - 停止后可对可见 slot 请求 `win`。
   - `update(deltaSeconds)` 可推进一次性 win 动画并回到 `normal`。
   - 中奖组请求后的同一个 tick 不会被误判为已经播放完成。
   - x/y 越界失败。
   - empty slot 请求 win 失败。
   - spin 中请求中奖状态要么显式失败，要么由测试证明不会破坏 spin 状态；建议实现为 spin 中失败，game003 只在完成后请求。

### 6.5 game003 runtime 和 adapter

1. 新增 `apps/game003/src/win-sequence.ts`：
   - 定义 `GAME003_WIN_COMPONENT_NAME = "bg-wins"`。
   - 定义 game003 win queue 类型。
   - 从 `GameLogic` 第 0 step、target scene 生成中奖队列。
   - 不传 symbol validator，只依赖通用 helper 做 `pos` 形状和 scene 边界校验。

2. 更新 `apps/game003/src/game-demo.ts` 的 `Game003ReelRuntime`：
   - 增加请求 visible positions 进入 `win` 状态的方法。
   - 增加查询指定 positions 当前 requested/resolved state 的方法，或能判断当前中奖组是否完成的方法。
   - 确保非 spinning 时调用 `update(deltaSeconds)` 仍会推进 symbol 动画。
   - `getVisualSnapshot().requestedStates` 继续反映 5 x 5 可见状态。

3. 更新 `apps/game003/src/game-adapter.ts`：
   - `PendingAnimation` 增加 phase 和 win queue。
   - `playSpin(logic)` 创建 pending 时保存 win queue。
   - ticker 中如果 phase 是 spinning，按现有逻辑等待转轮完成。
   - 转轮完成后校验 target scene，再开始第一组 win。
   - phase 是 win sequence 时继续调用 runtime update 并推进当前组。
   - 全部中奖组完成后 resolve。
   - 错误路径继续 stop ticker 并 reject pending。
   - destroy 和 reentry 语义保持现有显式失败。

4. 更新 `apps/game003/tests/win-sequence.test.ts`：
   - 附件样例应解析出两组中奖。
   - 第一组 positions 为 `(0,4),(1,2),(2,0)`，symbol 为 `4`。
   - 第二组 positions 为 `(0,2),(1,3),(2,4)`，symbol 为 `3`。
   - `wins=25`、`coinWin=25`、`cashWin=250` 与两组 result 汇总一致。
   - `symbolNum` / `symbolNums` 不作为 positions 数量校验依据。
   - `result.symbol` 与 target scene 不一致时，如果未传 validator，不应阻断播放。
   - pos 越界、缺失 `bg-wins` 的行为符合设计。

5. 更新 `apps/game003/tests/game-demo.test.ts`：
   - runtime 可在完成 spin 后对指定 positions 请求 `win`。
   - `requestedStates` 中对应位置切到 `win`，其它位置保持 `normal`。
   - win 动画完成后回到 `normal`。

6. 更新 `apps/game003/tests/game-adapter.test.ts`：
   - `playSpin()` 在转轮完成但中奖组未播完时仍不 resolve。
   - 第一组请求 `win` 的同一个 ticker 中不能立即 resolve 或直接进入第二组。
   - 多个 result 按顺序播放，第一组完成前不进入第二组。
   - 无 `bg-wins` 或 `usedResults=[]` 时保持原先完成即 resolve。
   - spin 期间二次 `playSpin()` 失败；中奖播放期间二次 `playSpin()` 也失败。
   - error / destroy / visual mismatch 路径仍 reject。

### 6.6 文档和协作规则

1. 更新 `apps/game003/README.md`，说明：
   - `bg-wins` 是 game003 当前中奖组件。
   - `usedResults` 指向 `clientData.results[]`。
   - `pos` 是 `[x,y]` 成对坐标。
   - 转轮完成后按 result 顺序播放 symbol `win` 状态。
   - game003 不直接依赖 `logiccore`。

2. 判断是否需要更新 `agents.md`：
   - 如果新增了跨模块长期边界，例如“game003 中奖组件名只在 app 层配置，logiccore/rendercore 不硬编码 `bg-wins`”，应同步更新 `agents.md`。
   - 如果实现只是在现有规则内补代码且没有新增协作约束，可以不改，但任务报告必须说明“不需要更新 agents.md”。

3. 如果新增 public API，必要时更新：

   ```text
   packages/rendercore/README.md
   packages/logiccore/README.md
   packages/gameframeworks/README.md
   ```

   是否更新取决于 API 是否已经属于 package 对外使用面；不要为了凑文档而写重复说明。

## 7. 自动化验收

触达包必须全部通过以下命令。若命令失败且确认是环境依赖下载问题，先设置代理后原命令重试；若确认是非本任务历史问题，必须在报告中写清失败包、失败用例和为什么与本任务无关。

### 7.1 logiccore

```bash
CI=true pnpm --filter @slotclientengine/logiccore lint
CI=true pnpm --filter @slotclientengine/logiccore test
CI=true pnpm --filter @slotclientengine/logiccore typecheck
CI=true pnpm --filter @slotclientengine/logiccore build
CI=true pnpm --filter @slotclientengine/logiccore format:check
```

### 7.2 gameframeworks

如果修改或重新导出 helper，必须执行：

```bash
CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
CI=true pnpm --filter @slotclientengine/gameframeworks format:check
```

### 7.3 rendercore

```bash
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore format:check
```

### 7.4 game003

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 format:check
```

### 7.5 根级和静态审计

```bash
CI=true pnpm lint
CI=true pnpm build
git diff --check
```

静态边界审计：

```bash
rg -n "\"bg-wins\"" packages/logiccore packages/rendercore packages/gameframeworks
rg -n "@slotclientengine/logiccore" apps/game003/src
rg -n "from [\"']@slotclientengine/logiccore[\"']|import\\([\"']@slotclientengine/logiccore[\"']\\)" apps/game003/tests
rg -n "getSlotSnapshots\\(|requestState\\(\"win\"\\)|\\.children|removeChildren" apps/game003/src
rg -n "serverUrl" apps/game003/src apps/game003/tests apps/game003/README.md
```

预期：

- 第一、第二、第三个命令无匹配时 `rg` 会返回 1，这是预期结果，不代表验收失败。
- 第一个命令无匹配，说明共享包未硬编码 `bg-wins`。
- 第二个命令无匹配，说明 game003 source 仍不直接依赖 logiccore。
- 第三个命令无匹配，说明 game003 tests 没有直接从 logiccore import；`source-boundary.test.ts` 中用于断言的字符串不应被误判为依赖。
- 第四个命令不能出现 app 为了中奖播放直接翻 rendercore/Pixi 私有结构；如有匹配，必须逐项确认是已有合法代码或改成 runtime/rendercore API。
- 第五个命令保持既有固定 live server 合同，不能因为本任务恢复 `serverUrl`。

根级 `CI=true pnpm test` 和 `CI=true pnpm typecheck` 若可承受也建议执行；如果失败在未触达包，按任务报告格式记录，不得把无关历史失败伪装成本任务通过。

## 8. 浏览器验收

如需要本地浏览器验收，先启动：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1
```

验收重点：

- game003 首屏仍先走 `packages/gameloading`。
- loading `99%` 后才 live 初始化，`100%` 后才创建 gameframeworks / Pixi 画面。
- spin 停止后目标 scene 与服务器返回 scene 一致。
- 有 `bg-wins` 时，第一组中奖 symbol 同时进入 win 效果，结束后第二组再进入 win 效果。
- 全部中奖播放完后，framework 才回到可继续操作状态。
- 无中奖时保持原有 spin 完成流程。
- 横屏和竖屏下中奖坐标都对应可见主转轮，不受背景适配影响。

如果用户明确表示浏览器验收由用户执行，任务报告中写明“未启动浏览器验收，用户将自行验收”，并列出自动化已经覆盖的范围。

## 9. 完成报告要求

完成实现后新增：

```text
tasks/66-game003-win-symbol-sequence-[utctime].md
```

报告必须包含：

- 执行结论。
- 主要改动文件。
- `bg-wins` 数据如何被解析。
- `pos` 坐标和 target scene 边界如何校验，以及为何不默认校验 `result.symbol`。
- rendercore 新增的通用状态 API 名称和边界。
- game003 adapter 的 spin -> win sequence -> resolve 流程。
- 所有执行过的命令和结果。
- 如果有失败命令，写清失败原因、是否与本任务相关、是否阻塞验收。
- 是否更新 `agents.md`，如果没有更新，说明原因。
- 是否新增依赖，`pnpm-lock.yaml` 是否变化。
- `git status --short --untracked-files=all` 的最终摘要。

## 10. 二次遗漏审计清单

实施者交付前必须逐项确认：

- `logiccore` 没有硬编码 `bg-wins`。
- `rendercore` 没有硬编码 game003、GMI、WaysTriggerData 或 component 名称。
- `game003` 没有直接 import `@slotclientengine/logiccore`。
- `game003` 没有直接遍历 rendercore 私有 Pixi children 来切状态。
- `bg-wins` 未触发时不会播放全部 results 作为隐藏兜底。
- `usedResults` 的顺序被保留。
- 一个 result 内的多个 positions 同时播放。
- 单个 result 空 positions、重复 positions、win 金额汇总不一致都会显式失败。
- `symbolNums` / `symbolNum` 与 positions 数量不一致时不应失败，因为 Ways 中奖里它们不是可见坐标数量合同。
- 不应在共享 helper 或 game003 当前实现里默认写死 WL / wild 规则；symbol 语义校验只能通过可选 validator 显式传入。
- 多个 result 按顺序播放。
- 中奖组启动同 tick 不会被误判完成。
- `pos` 成对、整数、非负、边界都有失败测试；symbol 语义校验只覆盖可选 validator，不作为 game003 默认行为。
- 中奖播放期间 `playSpin()` Promise 不提前 resolve。
- destroy、runtime error、visual mismatch 仍 reject pending。
- symbol `win` 状态播放完成后回到 `normal`，不会污染下一轮 spin。
- 横竖屏 layout 不改变中奖坐标基准，坐标始终是 5 x 5 主转轮可见窗口。
- `game-static.generated.ts` / `game-loading.generated.ts` 没有被手改；如 YAML 未改，生成文件不应变化。
- `serverUrl` 固定 live server 合同未被回退。
- README / agents.md / package README 的同步判断已写入报告。
