# game002 grid cell reels 任务计划

> 260626 合同修订：任务51 responsive 适配后，grid-cell 的外层 `120 x 120` 裁切从“永久裁切”修订为“转动期裁切”。每个 cell 开始滚动时开启外层裁切，单个 cell 落地后立即移除外层裁切；落地暗度折叠到当前 cell 内继续淡出，最终静态 symbol 不继续依赖 mask。本文后续出现的“永久裁切”旧表述均以本修订为准。

> 260626 live 轮带合同修订：服务器真实轮带不会下发给前端，前端 spin 必须使用本地公开轮带滚动。拿到服务器最终 scene 后，如果该目标窗口无法在本地轮带反查连续 stop y，不视为服务端结果非法；渲染层应构造“本地轮带 + 本轮服务器落点窗口”的临时融合轮带。未知 symbol code、缺失贴图、非法 scene 仍然显式失败。本文后续出现的“impossible stop y 必须失败”旧表述均以本修订为准。

## 1. 任务目标

为 `apps/game002` 实现一种可复用的特殊转轮表现：棋盘上的每个格子都有自己的裁切矩形，格子内独立垂直滚动；所有格子按“从上到下、从左到右”的顺序依次启动，再按同一顺序依次停下；旋转期间棋盘格式暗度方块必须挂在每个格子的微型 reel 内部并跟随滚动，让固定格子能看到快速明暗变化；停下后不播放 symbol 出现动画，只移除暗度并保持最终 symbol 的 `normal` 状态。

本任务不是只调 `game002` 的转轮参数，而是把这种“grid cell reel / 格子微型转轮”作为 `@slotclientengine/rendercore` 的可复用转轮算法实现，供后续类似游戏复用。`game002` 只负责提供布局、资源、game config、live `GameLogic` 和本游戏的表现参数。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、文档同步、`agents.md` 同步判断和最终任务报告。

核心交付：

- 在 `packages/rendercore` 新增可复用 grid-cell reel API。
- `apps/game002` 使用该 API 替换当前整列 `RenderReelSet` 表现。
- `game002` spin 表现满足：
  - 每个 `6 x 9` 格子都有 `120 x 120` 永久裁切矩形。
  - 每个格子内部都有一个独立垂直微型 reel。
  - 启动顺序为 `x=0,y=0..8`，再 `x=1,y=0..8`，直到 `x=5,y=8`，即“从上到下、从左到右”。
  - 停止顺序与启动顺序一致。
  - 启停间隔不要太长：能看出节奏，但不能拖慢整局表现。
  - 旋转时按顺序交替覆盖黑色暗度方块：偶数序号 `alpha=0.50`，奇数序号 `alpha=0.35`；暗度方块必须跟随格子内微型 reel 滚动，不允许作为固定在格子外部的静态遮罩。
  - 格子启动有轻微向上回弹，再快速向下滚动。
  - 格子停下时有力度感，可以有轻微落地回弹。
  - 格子停下后立即保持目标 symbol 的 `normal` 状态，不请求 `appear`；暗度淡出后，本局 `adapter.playSpin(logic)` 才 resolve。
- 保持 `game002` 现有 live / HUD / collect 边界不变：仍然只通过 `@slotclientengine/gameframeworks` 接入。
- 完成后新增中文任务报告：

```text
tasks/50-game002-grid-cell-reels-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/50-game002-grid-cell-reels-260625-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 新增空目录必须放 `.keepme`

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。若确实需要新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

## 3. 当前实现参考

### 3.1 game002 当前边界

当前 `apps/game002` 已经完成初始化，关键文件如下：

```text
apps/game002/src/main.ts
apps/game002/src/framework-config.ts
apps/game002/src/game-adapter.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-layout.ts
apps/game002/src/assets.ts
apps/game002/src/scene.ts
apps/game002/src/symbol-animation-config.ts
apps/game002/src/styles.css
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/README.md
```

当前实现事实：

- `game002` 使用 `@slotclientengine/gameframeworks` 创建 live / HUD / spin / collect 流程。
- `game002` 不直接依赖 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`。
- `game002` 目前在 `apps/game002/src/game-demo.ts` 中用 `RenderReelSet` 一次性渲染 `6` 列、每列 `9` 行。
- 当前 `RenderReelSet` 是“按列启动 / 按列停止”，不是“按格子启动 / 按格子停止”。
- 当前 `game002` 的棋盘布局已经按任务 49 复验修正为真实美术棋盘：

```text
stage = 1125 x 2000
boardFrame.x = 200
boardFrame.y = 330
boardFrame.width = 720
boardFrame.height = 1080
columns = 6
rows = 9
cell = 120 x 120
symbol source = 500 x 500
symbol display scale = 0.4
```

这些尺寸是本任务的基线，不能退回早期 `150 x 150` 假设。若实现时发现视觉仍有偏差，必须同步修改 `apps/game002/src/game-layout.ts`、测试和 `apps/game002/README.md`，不能在 runtime 中自动猜测或静默修正。

### 3.2 rendercore 当前能力

`packages/rendercore` 当前通过主入口和子路径导出 reel 能力：

```ts
import {
  RenderReel,
  RenderReelSet,
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry,
} from "@slotclientengine/rendercore/reel";
```

当前可复用能力：

- `RenderReel` 已有单列裁切 mask、`spinBlur` 状态、落点后 `appear` 状态、启动向上回弹和停靠回弹。
- `RenderReelSet` 负责多个 reel 轴的启动、停止和完成判断。
- `createReelSpinPlan()` 当前生成的是按轴的 spin plan，维度是列，不是棋盘格。
- `RenderReel.start(axisPlan, { targetVisibleSymbols })` 已支持传入目标可见 symbol，这可以用于单格 `visibleRows=1` 的微型 reel。
- `RenderSymbol` 默认 `appear` 动画时长是 `0.42s`，完成后回到 `normal`。

本任务应复用这些已有能力，新增“格子级调度和外层裁切 / 跟随滚动暗度 / 完成边界”算法，不要把已有 symbol 状态机复制到 `game002`。grid-cell runtime 可以在 `RenderReel` landed 后立即复位为目标 symbol 的 `normal` 状态，以取消本游戏不需要的 `appear` 效果。

## 4. 架构边界

### 4.1 必须放在 rendercore 的部分

以下逻辑属于可复用特殊转轮算法，必须放在 `packages/rendercore`：

- grid cell 顺序生成：包括“从上到下、从左到右”的确定性顺序。
- grid cell spin plan：为每个格子计算 `startAtMs`、`stopAtMs`、`durationMs`、`finalY`、`targetVisibleSymbols`、暗度 alpha。
- 每个格子的永久裁切矩形。
- 每个格子内部的 `visibleRows=1` 微型 reel 创建与更新。
- 格子级启动、停止、落地、暗度淡出和整体完成判断。
- grid runtime snapshot：用于测试和游戏层诊断。
- 参数校验和 fail-fast 错误。

### 4.2 只留在 game002 的部分

以下逻辑属于 `game002` 集成层：

- 读取 `assets/gamecfg002/gameconfig.json`。
- 加载 `assets/game002/bg.jpg` 和 `assets/symbols002`。
- 锁定 `6 x 9`、`120 x 120`、棋盘原点和 symbol `0.4` 缩放。
- 使用 live `defaultScene` 和 spin `GameLogic` 主 scene。
- 调用 `gameConfig.getStopYCoordinates({ reelsName: "reels-001", sceneName, scene })`。
- 传入本游戏的表现参数：启动/停止步进、暗度模式、回弹强度等。
- 保持 `SlotGameAdapter.playSpin(logic)` Promise 边界。

### 4.3 明确非目标

- 不修改 `gameframeworks` 的 live、HUD、spin、collect 流程。
- 不在 `game002` 直接创建 live client 或直接调用 `collect()`。
- 不增加 mock/replay/local scene 兜底。
- 不把 game002 资源路径、symbol 名或 `6 x 9` 常量写死进 `rendercore`。
- 不为了测试方便暴露不该公开的内部状态；如果测试导致奇怪写法，优先改测试方式或增加合理 snapshot API。
- 不用自动补资源、自动跳过缺失状态图或用本地 scene 替代服务器 scene 等隐藏 fallback。目标 scene 不在本地轮带时使用临时融合轮带，这是 live 前端保护真实轮带的既定合同，不属于 mock/replay/local scene 兜底。

## 5. rendercore 设计方案

### 5.1 新增或调整文件

建议新增：

```text
packages/rendercore/src/reel/grid-cell-order.ts
packages/rendercore/src/reel/grid-cell-spin-plan.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/tests/reel/grid-cell-order.test.ts
packages/rendercore/tests/reel/grid-cell-spin-plan.test.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
```

需要同步调整：

```text
packages/rendercore/src/reel/types.ts
packages/rendercore/src/reel/index.ts
packages/rendercore/README.md
```

### 5.2 建议公开 API

从 `@slotclientengine/rendercore/reel` 导出以下 API。最终命名可以微调，但必须保持语义清楚并写入 README：

```ts
export interface GridCellCoordinate {
  readonly x: number;
  readonly y: number;
  readonly orderIndex: number;
}

export type GridCellOrderMode = "top-down-left-right";

export function createGridCellOrder(options: {
  readonly columns: number;
  readonly rows: number;
  readonly mode: GridCellOrderMode;
}): readonly GridCellCoordinate[];

export interface GridCellReelSpinTiming {
  readonly startStepMs: number;
  readonly stopStepMs: number;
  readonly settleAfterLastStartMs: number;
  readonly minimumSpinCycles: number;
  readonly speedSymbolsPerSecond: number;
}

export interface GridCellDimmingPattern {
  readonly evenAlpha: number;
  readonly oddAlpha: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

export type GridCellReelPhase =
  | "idle"
  | "waiting"
  | "spinning"
  | "landed"
  | "completed";

export interface GridCellReelPlanCell {
  readonly x: number;
  readonly y: number;
  readonly orderIndex: number;
  readonly startAtMs: number;
  readonly stopAtMs: number;
  readonly durationMs: number;
  readonly axisPlan: ReelAxisSpinPlan;
  readonly targetVisibleSymbols: readonly [number];
  readonly dimmingAlpha: number;
}

export interface GridCellReelSpinPlan {
  readonly direction: ReelSpinDirection;
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly GridCellReelPlanCell[];
  readonly lastStopAtMs: number;
}

export interface RenderGridCellReelSetOptions {
  readonly reels: LogicReels;
  readonly registry: ReelSymbolRegistry;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly order: readonly GridCellCoordinate[];
}

export interface RenderGridCellReelSetUpdateResult {
  readonly spinning: boolean;
  readonly completed: boolean;
  readonly startedCells: readonly GridCellCoordinate[];
  readonly landedCells: readonly GridCellCoordinate[];
}

export interface RenderGridCellReelCellSnapshot {
  readonly x: number;
  readonly y: number;
  readonly orderIndex: number;
  readonly phase: GridCellReelPhase;
  readonly hasClipMask: boolean;
  readonly dimmingAlpha: number;
  readonly requestedState: string | null;
  readonly visibleSymbol: number;
}

export interface RenderGridCellReelSetSnapshot {
  readonly spinning: boolean;
  readonly completed: boolean;
  readonly visibleScene: SceneMatrix;
  readonly cells: readonly RenderGridCellReelCellSnapshot[];
}

export function createGridCellReelSpinPlan(options: {
  readonly reels: LogicReels;
  readonly finalYs: readonly number[];
  readonly targetScene: SceneMatrix;
  readonly columns: number;
  readonly rows: number;
  readonly order: readonly GridCellCoordinate[];
  readonly direction?: ReelSpinDirection;
  readonly timing: GridCellReelSpinTiming;
  readonly dimming: GridCellDimmingPattern;
}): GridCellReelSpinPlan;

export class RenderGridCellReelSet extends Container {
  constructor(options: RenderGridCellReelSetOptions);
  resetToScene(scene: SceneMatrix, finalYs: readonly number[]): void;
  spin(plan: GridCellReelSpinPlan): void;
  update(deltaSeconds: number): RenderGridCellReelSetUpdateResult;
  getVisibleScene(): SceneMatrix;
  getSnapshot(): RenderGridCellReelSetSnapshot;
}
```

重要约束：

- `createGridCellOrder({ columns: 6, rows: 9, mode: "top-down-left-right" })` 必须返回：

```text
(0,0),(0,1),(0,2),...,(0,8),(1,0),(1,1),...,(5,8)
```

- `createGridCellReelSpinPlan()` 必须校验：
  - `columns`、`rows` 为正整数。
  - `targetScene.length === columns`。
  - 每列 `targetScene[x].length === rows`。
  - `finalYs.length === columns`。
  - `order.length === columns * rows`。
  - order 不能有重复格子、越界格子或缺失格子。
  - timing 均为有效正数或非负数，且每个格子的 `stopAtMs > startAtMs`。
  - dimming alpha 在 `[0, 1]` 范围内，`fadeInMs`、`fadeOutMs` 非负。
- 每个 cell 的 timing 必须按确定性公式计算，不能在 runtime 随机化：

```text
cellCount = columns * rows
orderIndex = cell.orderIndex
startAtMs = orderIndex * timing.startStepMs
firstStopAtMs = (cellCount - 1) * timing.startStepMs + timing.settleAfterLastStartMs
stopAtMs = firstStopAtMs + orderIndex * timing.stopStepMs
durationMs = stopAtMs - startAtMs
lastStopAtMs = firstStopAtMs + (cellCount - 1) * timing.stopStepMs
```

- 每个 cell 的 travel 必须根据 `durationMs`、`speedSymbolsPerSecond` 和 `minimumSpinCycles` 推导，不能写固定 travel：

```text
durationTravel = ceil(durationMs / 1000 * speedSymbolsPerSecond)
travelSymbols = max(minimumSpinCycles, durationTravel)
```

- 每个 cell 的最终 reel y 应按下面规则计算：

```text
cellFinalY = reels.normalizeY(x, finalYs[x] + y)
targetVisibleSymbols = [targetScene[x][y]]
```

这样可以保证格子级停止后还原出的 `6 x 9` scene 与 `GameLogic` 目标 scene 完全一致。

### 5.3 默认 timing 建议

`rendercore` 只提供参数化能力，不把 game002 默认值写死到算法内部。`game002` 可使用以下初始参数：

```ts
const GAME002_GRID_CELL_REEL_TIMING = Object.freeze({
  startStepMs: 16,
  stopStepMs: 16,
  settleAfterLastStartMs: 180,
  minimumSpinCycles: 6,
  speedSymbolsPerSecond: 54,
});

const GAME002_GRID_CELL_DIMMING = Object.freeze({
  evenAlpha: 0.5,
  oddAlpha: 0.35,
  fadeInMs: 80,
  fadeOutMs: 160,
});
```

以 `54` 个格子计算：

```text
lastStartAtMs = 53 * 16 = 848
firstStopAtMs = 848 + 180 = 1028
lastStopAtMs = 1028 + 53 * 16 = 1876
overlay fade out = 160ms
```

总表现约 `2.0s` 左右，能看出节奏但不会拖太久。若浏览器验收觉得节奏过慢或过快，可以调整这些常量，但必须同步测试、README 和任务报告，不能把随机或环境自适应节奏放进 runtime。

### 5.4 裁切和暗度

`RenderGridCellReelSet` 的每个格子建议结构：

```text
cellRoot (x * cellWidth, y * cellHeight)
  cellClipMask: Graphics.rect(0, 0, cellWidth, cellHeight)
  reelHolder
    RenderReel visibleRows=1
  dimOverlay: Graphics.rect(0, 0, cellWidth, cellHeight)
```

要求：

- 坐标只能归一到一层，避免双重位移。因为现有 `RenderReel` 构造函数会执行 `this.x = layout.getReelX(options.x)`，如果把 `RenderReel` 放进已经位于 `x * cellWidth` 的 `cellRoot`，必须显式把该 `RenderReel.x` 复位为 `0`，或者采用“RenderReel 直接挂在 gridRoot、cellRoot 只承载 mask/overlay”的结构。无论选择哪种结构，都必须有测试证明第 `x` 列 cell 的最终全局 x 只等于 `x * cellWidth`，不是 `2 * x * cellWidth`。
- `cellRoot.mask = cellClipMask` 必须长期存在，不能只在 spin 时裁切。
- 现有 `RenderReel` 在 stopped 阶段会把自己的 `mask` 置空，所以永久裁切必须由 `cellRoot.mask` 保证；`RenderReel` 自己的 spin mask 可以保留，两层 mask 不冲突。
- `dimOverlay` 位于每个格子的微型 `RenderReel` 内部、symbol 上方，alpha 初始为 `0`。
- cell 进入 spin 时，`dimOverlay.alpha` 淡入；strip 的可见行按微型 reel 的 `currentY` 同步滚动，固定格子中能看到 `0.50 / 0.35` 快速切换。
- 偶数 order index 使用 `0.50`，奇数 order index 使用 `0.35`。
- cell landed 后立即把可见 symbol 复位到目标 y 的 `normal` 状态，不请求 `appear`，并启动 `dimOverlay` 淡出。
- reset 初始 scene 时，每个格子应使用 `cellFinalY = reels.normalizeY(x, finalYs[x] + y)` 并展示 `targetVisibleSymbols = [scene[x][y]]`，建议调用现有 `RenderReel.resetToVisibleSymbols([scene[x][y]], cellFinalY)` 或等价逻辑，避免初始静态画面与 live `defaultScene` 不一致。
- grid runtime 必须维护自己的 per-cell phase，不要直接把 `RenderReel.update().completed` 当作 cell 是否参与过本次 spin 的判断；尚未启动的 stopped reel 也可能返回 completed。
- grid runtime 完成条件必须包含：
  - 所有 cell 都已 landed。
  - 所有 dim overlay alpha 已归零。

### 5.5 回弹

当前 `RenderReel` 已有：

- 启动阶段向上偏移：约 `cellHeight * 0.08`。
- 停止阶段向下偏移：约 `cellHeight * 0.1`。

本任务优先复用这个已有回弹。如果验收发现单格 `visibleRows=1` 的力度不足，可以在 `RenderGridCellReelSet` 增加可配置的外层 cell bounce，但必须满足：

- bounce 参数在 `rendercore` API 中显式配置。
- 默认值可复用当前 `RenderReel` 行为，不重复叠加导致幅度过大。
- 测试覆盖启动负向偏移和停靠正向偏移。
- 不在 `game002` 单独写一套私有 easing。

## 6. game002 集成方案

### 6.1 需要调整的文件

```text
apps/game002/src/game-demo.ts
apps/game002/src/game-adapter.ts
apps/game002/src/game-layout.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/game-layout.test.ts
apps/game002/README.md
```

可能需要调整：

```text
apps/game002/tests/source-boundary.test.ts
agents.md
```

### 6.2 game-demo.ts 目标结构

`apps/game002/src/game-demo.ts` 当前自己组合 `RenderReelSet`。本任务后应改为：

- 仍然用 `createGameConfig(rawGameConfig)`。
- 仍然用 `createReelSymbolRegistry({ gameConfig, assets, emptySymbols, symbolScales, texturePolicy })`。
- 用 `createGridCellOrder()` 创建 `top-down-left-right` 顺序。
- 用 `RenderGridCellReelSet` 创建 `6 x 9` 格子微型 reel。
- `mainReelsLayer` 继续作为 adapter 加入 Pixi stage 的主层，但内部改为 grid-cell runtime。
- `applyScene(scene)`：
  - 校验 `6 x 9` scene。
  - 使用 `getStopYCoordinates()` 获取列级 `finalYs`。
  - 调用 `gridReelSet.resetToScene(validScene, finalYs)`。
  - 设置可见。
- `createSpinPlan(scene)`：
  - 校验 `6 x 9` scene。
  - 获取列级 `finalYs`。
  - 调用 `createGridCellReelSpinPlan(...)`。
- `spinToScene(scene)`：
  - 拒绝并发 spin。
  - 创建 grid-cell spin plan。
  - 调用 `gridReelSet.spin(plan)`。
  - 记录 `targetScene` 和 `finalYs`。
- `update(deltaSeconds)`：
  - 推进 `gridReelSet.update(deltaSeconds)`。
  - 只有在 grid runtime 报告 `completed` 后，才校验最终可见 scene 并更新 `currentScene`。

### 6.3 adapter Promise 边界

`apps/game002/src/game-adapter.ts` 的 `playSpin(logic)` Promise 仍由 runtime 完成时 resolve，但完成边界必须改为 grid runtime 的完整完成：

```text
最后一个格子 landed
  -> 目标 symbol 保持 normal，不播放 appear
  -> 最后一个格子暗度淡出到 0
  -> 最终 visible scene 校验等于目标 scene
  -> playSpin resolve
  -> gameframeworks 执行 optional collect
```

如果 runtime 在更新中抛错，保持当前行为：

- 停止 ticker。
- reject pending animation。
- framework 进入 error。
- 不执行最终 collect。

### 6.4 game002 参数锁定

建议在 `apps/game002/src/game-layout.ts` 或 `apps/game002/src/game-demo.ts` 中新增常量：

```ts
export const GAME002_GRID_CELL_REEL_ORDER = "top-down-left-right";
export const GAME002_GRID_CELL_REEL_TIMING = Object.freeze({
  startStepMs: 16,
  stopStepMs: 16,
  settleAfterLastStartMs: 180,
  minimumSpinCycles: 6,
  speedSymbolsPerSecond: 54,
});
export const GAME002_GRID_CELL_DIMMING = Object.freeze({
  evenAlpha: 0.5,
  oddAlpha: 0.35,
  fadeInMs: 80,
  fadeOutMs: 160,
});
```

测试必须锁定这些常量，避免后续无意改变节奏。

## 7. 测试计划

### 7.1 rendercore 单测

新增 `packages/rendercore/tests/reel/grid-cell-order.test.ts`：

- `top-down-left-right` 对 `6 x 9` 生成 54 个格子。
- 前 10 个坐标为 `(0,0)..(0,8),(1,0)`。
- 最后一个坐标为 `(5,8)`。
- 非法 columns/rows 抛错。

新增 `packages/rendercore/tests/reel/grid-cell-spin-plan.test.ts`：

- 用 `createBasicReels()` 或新 fixture 创建 `columns=2, rows=3` 的小场景，验证每个 cell plan 的：
  - `startAtMs` 按 order 递增。
  - `stopAtMs` 按 order 递增。
  - `stopAtMs > startAtMs`。
  - `finalY = normalizeY(x, finalYs[x] + y)`。
  - `targetVisibleSymbols = [targetScene[x][y]]`。
  - dimming alpha 按 `0.50 / 0.35` 交替。
  - `lastStopAtMs` 等于最后一个格子的 stop 时间。
- 校验重复 order、缺失 order、越界 order、scene 宽高不一致、`finalYs` 长度错误、非法 alpha、非法 timing 全部抛错。

新增 `packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts`：

- 创建 `2 x 3` grid，断言每个 cell 有永久 mask，位置为 `x * cellWidth`、`y * cellHeight`。
- 断言第 `x` 列的实际全局 x 只应用一次 `x * cellWidth`，防止 `cellRoot.x` 和 `RenderReel.x` 叠加造成双倍位移。
- `resetToScene(scene, finalYs)` 后 `getVisibleScene()` 等于输入 scene，overlay alpha 全为 `0`。
- `spin(plan)` 后按 tick 推进，验证 cell 按 order 进入 spinning。
- spinning 时对应 cell 请求 `spinBlur`，overlay alpha 淡入到 plan alpha。
- landed 时立即保持目标 symbol 的 `normal` 状态，overlay 开始淡出。
- 继续推进超过 fade out 后，runtime completed，所有 overlay alpha 为 `0`，所有 symbol 不处于 `appear` 状态。
- 验证尚未启动的 stopped cell 不会被误判为本轮已完成；只有经历过当前 plan 的 cell 才能进入 `landed` / `completed`。
- 并发 spin 抛错。
- `update(deltaSeconds)` 对非法 delta 抛错，沿用现有 rendercore 行为。

注意：如果 Pixi `Graphics` 的真实 mask 难以直接断言，不要为了测试改生产逻辑成奇怪结构；可以通过 snapshot 暴露 `hasClipMask`、`cellX`、`cellY`、`dimmingAlpha`、`phase`、`requestedState` 等测试友好的只读信息。

### 7.2 game002 单测

更新 `apps/game002/tests/game-demo.test.ts`：

- 不再期望 `plan.axes` 长度为 `6`，改为期望 grid cell plan 长度为 `54`。
- 校验 `order[0] = (0,0)`、`order[8] = (0,8)`、`order[9] = (1,0)`、`order[53] = (5,8)`。
- 校验 game002 plan 使用 `0.50 / 0.35` 交替暗度。
- 校验 `plan.lastStopAtMs` 和 runtime 完整完成时间在可接受范围内，例如 `lastStopAtMs >= 1800ms` 且完整完成时间 `<= 2600ms`；若实际参数不同，测试应锁定最终选择值。
- spin 过程中 snapshot 能看到 `spinBlur`。
- 最终完成后 visible scene 等于目标 scene。
- invalid scene、未知 symbol code、资源缺失继续 fail-fast；目标 scene 无法在本地轮带反查 stop y 时，按 live 轮带合同使用临时融合轮带。

更新 `apps/game002/tests/game-adapter.test.ts`：

- fake runtime 的 `update()` 必须模拟“未完成 -> 完成”。
- `playSpin` 只有在 runtime completed 且视觉 scene 校验通过后 resolve。
- runtime error 继续 reject 并停止 ticker。
- completed visual scene 不匹配继续 reject。

更新 `apps/game002/tests/game-layout.test.ts`：

- 保持 `1125 x 2000`、`x=200,y=330,width=720,height=1080`、`cell=120`。
- 新增 grid cell 参数断言：order、timing、dimming。

`apps/game002/tests/source-boundary.test.ts` 必须继续确保：

- `game002` 不直接引用 `@slotclientengine/netcore`。
- `game002` 不直接引用 `@slotclientengine/uiframeworks`。
- `game002` 不直接引用 `@slotclientengine/logiccore`。
- `apps/game002/vite.config.ts` 只允许 alias 到 `@slotclientengine/rendercore` / `@slotclientengine/rendercore/reel` / `@slotclientengine/rendercore/symbol` 的源码入口，不允许为了测试或构建方便 alias 到 `logiccore`、`netcore` 或 `uiframeworks`。
- `game002` 运行依赖仍只有：

```json
{
  "@slotclientengine/gameframeworks": "workspace:*",
  "@slotclientengine/rendercore": "workspace:*",
  "pixi.js": "^8.1.6"
}
```

## 8. 文档和协作规则同步

必须更新：

```text
packages/rendercore/README.md
apps/game002/README.md
```

`packages/rendercore/README.md` 需要新增 grid-cell reel 章节，说明：

- 适用场景：棋盘格、逐格启动、逐格停止的特殊转轮。
- API 示例：`createGridCellOrder()`、`createGridCellReelSpinPlan()`、`RenderGridCellReelSet`。
- fail-fast 规则：scene 尺寸、order、timing、alpha、资源状态缺失。
- 完成边界：landed + dim fade，不播放 `appear`。

`apps/game002/README.md` 需要更新：

- spin 表现从“6 列 reels”改为“54 个 grid cell reels”。
- 明确顺序为从上到下、从左到右。
- 明确暗度交替为 `0.50 / 0.35`。
- 明确 `adapter.playSpin` 等所有 cell landed 且暗度淡出完成后才 resolve。

本任务会把新的可复用特殊转轮算法放入 `packages/rendercore`。因此完成实现时需要同步更新 `agents.md`，建议新增类似规则：

```text
- `packages/rendercore` 拥有通用 Pixi slot 渲染算法，包括 symbol 状态、普通 reel、grid-cell reel 等可复用转轮表现；游戏 app 只能配置和调用，不要在 app 内复制通用转轮调度、裁切、状态机或 grid-cell spin 算法。
```

如果最终实现没有新增可复用 API，则必须在任务报告中解释为什么没有更新 `agents.md`；但按本计划执行时，预计需要更新。

## 9. 验收命令

### 9.1 局部验收

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game002 lint
pnpm --filter game002 format:check
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
```

### 9.2 仓库级验收

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

如果仓库级命令失败，必须区分：

- 本任务引入的问题：必须修复。
- 既有无关问题：记录精确失败包、命令和错误摘要，不要通过改本任务生产逻辑来掩盖。

### 9.3 浏览器视觉验收

启动：

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

打开：

```text
http://127.0.0.1:5206/
```

至少验收：

- 初始画面无 console error/warn。
- canvas backing size 为 `1125 x 2000`。
- 棋盘格与背景仍对齐，没有回到旧 `150px` 布局。
- 点击 Spin 后，可以看到格子按从上到下、从左到右逐个启动。
- 所有格子启动后，格子按同一顺序逐个停下。
- 旋转格子有 `0.50 / 0.35` 交替暗度，整体不是一片混乱的同亮度闪动。
- 启动有轻微上抬回弹，停下有落地力度。
- 每格停下后 symbol 保持 `normal`，不播放出现动画，暗度移除。
- 最后 HUD 回到 `Ready` / idle，且没有画面上移、裁切错位、黑块残留或 Promise 卡住。

任务报告中必须写明浏览器验收方式、URL、是否有截图或录屏证据、console 状态和观察结论。

## 10. 严格验收清单

实现完成前逐项检查：

- [ ] `packages/rendercore` 新增 grid-cell reel API，并从 `@slotclientengine/rendercore/reel` 导出。
- [ ] grid-cell API 不包含 game002 资源路径、symbol 名或固定 `6 x 9` 硬编码。
- [ ] `RenderGridCellReelSet` 没有 `cellRoot.x + RenderReel.x` 双重位移问题。
- [ ] grid runtime 使用 per-cell phase 判断本轮完成，未启动的 stopped cell 不会被误判为完成。
- [ ] `apps/game002` 不再自己实现通用格子调度算法，只配置并调用 rendercore。
- [ ] 每个格子都有永久 `120 x 120` 裁切。
- [ ] 顺序是 `x` 从左到右、每列 `y` 从上到下。
- [ ] 启动和停止都是同一 order。
- [ ] 暗度按 order index 交替 `0.50 / 0.35`。
- [ ] 停下后不请求 `appear`，暗度最终归零。
- [ ] `adapter.playSpin` 等 grid runtime 完整完成后才 resolve。
- [ ] 最终 `getVisibleScene()` 与 `GameLogic` 目标 scene 完全一致。
- [ ] invalid scene、未知 symbol code、资源缺失、order 错误、timing 错误都显式失败；目标 scene 无法在本地轮带反查 stop y 时使用临时融合轮带。
- [ ] 没有 mock/replay/local scene fallback。
- [ ] 没有为了测试改坏生产边界；奇怪测试应改测试。
- [ ] `packages/rendercore/README.md`、`apps/game002/README.md` 已同步。
- [ ] `agents.md` 已按本计划新增 rendercore/grid-cell reel 归属规则，或报告中解释未更新原因。
- [ ] 局部验收命令通过。
- [ ] 仓库级验收命令通过，或报告记录明确的无关既有失败。
- [ ] 浏览器视觉验收完成并记录。
- [ ] 已写中文任务报告 `tasks/50-game002-grid-cell-reels-[utctime].md`。

## 11. 二次遗漏检查

提交最终结果前再做一次语义检查：

1. 搜索是否还有旧整列 `RenderReelSet` 语义残留在 `apps/game002/src/game-demo.ts` 的主 spin 路径中。
2. 搜索 `apps/game002` 是否直接引用 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`。
3. 检查 `apps/game002/vite.config.ts` 是否只 alias rendercore 源码入口，没有绕过 facade alias 到 `logiccore`、`netcore` 或 `uiframeworks`。
4. 搜索 `packages/rendercore` 新增 API 是否从 `src/reel/index.ts` 导出，且 build 后 `dist/reel` 有对应 `.js` 和 `.d.ts`。
5. 检查 grid-cell 实现是否避免 `RenderReel` 内部 x 与 cellRoot x 双重叠加。
6. 检查 grid runtime 是否有独立 per-cell phase，未启动格子不会因为 `RenderReel` 处于 stopped 而提前算完成。
7. 检查 `packages/rendercore/README.md` 示例是否能独立理解，不依赖 game002。
8. 检查 `apps/game002/README.md` 是否写清视觉节奏和完成边界。
9. 检查 `agents.md` 是否同步了 rendercore 拥有通用 grid-cell reel 算法的规则。
10. 检查所有新增测试是否测行为而非测私有实现细节；如果必须测 snapshot，snapshot 必须是生产可解释的只读诊断。
11. 检查没有为了隐藏服务端、资源或 scene 错误新增兜底。
12. 检查任务报告是否包含命令、结果、浏览器验收、未完成项、`pnpm-lock.yaml` 是否变化和 `agents.md` 处理结论。

## 12. 任务报告模板

任务完成后新增：

```text
tasks/50-game002-grid-cell-reels-[utctime].md
```

报告至少包含：

```text
# 50-game002-grid-cell-reels 执行报告

- 报告时间：YYMMDD-HHMMSS UTC
- 计划文件：tasks/50-game002-grid-cell-reels.md
- 执行结论：完成 / 部分完成 / 阻塞

## 实施范围

列出 rendercore 新增 API、game002 集成、测试、文档、agents.md 更新。

## 关键实现说明

说明 grid-cell order、timing、跟随滚动暗度、裁切、无 appear 完成边界。

## 验收记录

逐条记录所有局部和仓库级命令结果。

## 浏览器验收

记录 dev server URL、点击 Spin 后的视觉结论、console 状态、截图/录屏证据。

## agents.md

说明是否更新以及更新内容。

## 风险与后续

只写真实残留风险，不写泛泛建议。
```
