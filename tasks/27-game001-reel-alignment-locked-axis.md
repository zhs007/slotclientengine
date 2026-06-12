# game001 reel alignment locked axis 任务计划

## 1. 任务目标

完善 `apps/game001` 的主转轮视觉表现，解决当前截图中转轮内容与 `assets/game001/reels1bk.png` 内框/分隔线不对齐的问题，并加入 game001 特有的第 4 轴锁定显示规则。

本计划是完整可执行版本，不依赖其它上下文。执行者只需要阅读本文件，即可完成实现、测试、浏览器验收、README 更新和任务报告。

核心目标：

- 保持核心渲染能力在 `packages/rendercore`，但本任务里的需求都是 `apps/game001` 的游戏特殊需求，默认只在 `apps/game001` 内实现。
- 主转轮内容不再用整张 `reels1bk.png` 的外框宽度做 fit，而是按底图里的实际 reel 内框、列中心和可视窗口做校准。
- 修正主转轮 symbol 与底图竖向分隔线、底部圆点中心的对齐关系。
- 用户说的“第4轴”明确解释为从左到右第 4 列，对应 `scene[x][y]` / rendercore 的 0-based `x = 3`。
- 第 4 轴只显示最中间的一个图标，对应 5 行 scene 的中心行 `y = 2`。
- 第 4 轴不参与旋转动画：视觉上不滚动、不上下 bounce、不请求 `spinBlur`，固定在第 4 列中心位置。
- spin 结果仍然必须严格解析完整 `5 x 5` 主 scene；第 4 轴只是 game001 的视觉呈现特殊规则，不改变服务器 scene、logiccore 解析或 gameconfig 停轴反查语义。
- 不做不必要兜底。资源缺失、scene 非法、停轴反查失败、校准配置非法、第四轴配置越界都必须明确失败。
- 如果是测试导致一些奇怪写法，修改测试，不要为了测试扭曲生产逻辑。
- 完成后新增中文任务报告：`tasks/27-game001-reel-alignment-locked-axis-[utctime].md`，其中 `[utctime]` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。
- 如果实现过程中改变仓库协作规则、目录规范或基础脚本，需要同步更新根目录 `agents.md`；预计本任务不需要修改 `agents.md`。

## 2. 当前仓库事实

仓库事实：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- 包管理器为 `pnpm`。
- 如果依赖安装失败，可先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

`apps/game001` 当前已存在，关键文件：

```text
apps/game001/src/game-layout.ts
apps/game001/src/game-demo.ts
apps/game001/src/main.ts
apps/game001/src/scene.ts
apps/game001/src/assets.ts
apps/game001/src/symbol-animation-config.ts
apps/game001/tests/game-layout.test.ts
apps/game001/tests/game-demo.test.ts
apps/game001/tests/scene.test.ts
apps/game001/README.md
```

当前静态资源尺寸：

- `assets/game001/bk.jpg`: `941 x 1672`
- `assets/game001/logo.png`: `881 x 391`
- `assets/game001/reels1bk.png`: `1025 x 415`
- `assets/game001/reels2bk.png`: `751 x 641`

当前 stage 与静态坐标：

- Pixi stage: `941 x 1672`
- 背景：`x=0`, `y=0`
- logo：`x=30`, `y=0`
- 主转轮背景：`x=-42`, `y=401`
- 副转轮背景：`x=95`, `y=826`
- Spin 按钮：`x=470.5`, `y=1550`

当前 `apps/game001/src/game-layout.ts` 中的主转轮布局逻辑：

- `createMainReelsLayerLayout()` 计算：
  - `rawReelsContentWidth = reelCount * cellWidth + (reelCount - 1) * columnGap`
  - `mainReelsFitScale = reels1bk.width / rawReelsContentWidth`
  - `cropY = 1.5 * cellHeight`
  - `cropHeight = 2 * cellHeight`
  - `x = mainReelsBackground.x`
- 这个算法会把 reel 内容按整张 `1025px` 底图宽度拉齐，但 `reels1bk.png` 的左右装饰边框、竖向分隔线和底部圆点并不是整张图的边界，因此容易造成画面和轮子内框不齐。

当前 `apps/game001/src/game-demo.ts` 中的 runtime 逻辑：

- 使用 `createReelSymbolRegistry()` 创建 symbol registry。
- 使用 `createReelLayout()` 创建 5 轴、5 行 layout。
- 使用 `new RenderReelSet()` 创建完整 5 轴 reel set。
- 使用一个大 viewport mask 显示中间一行和上下相邻半行。
- `applyScene()` 对完整 `5 x 5` scene 反查 `finalYs`，然后 `reelSet.resetToFinalYs(finalYs)`。
- `spinToScene()` 对完整 `5 x 5` scene 反查 `finalYs`，创建完整 5 轴 `ReelSpinPlan`，然后 `reelSet.spin(plan)`。
- `update()` 在完成后用 `reelSet.getVisibleScene()` 对完整 scene 做一致性校验。

当前 rendercore 事实：

- `@slotclientengine/rendercore/reel` 已导出：
  - `RenderReel`
  - `RenderReelSet`
  - `createReelLayout`
  - `createReelSpinPlan`
  - `createReelSymbolRegistry`
- `RenderReelSet.spin(plan)` 要求 `plan.axes.length === reelCount`，并会启动每个 axis。
- `RenderReel` 本身也可单独创建、`resetToY()`、`start(axisPlan)`、`update(deltaSeconds)` 和读取 snapshot。
- 因此本任务不需要为了 game001 的第 4 轴锁定行为修改 rendercore。更合适的方式是在 game001 内用 rendercore 的 `RenderReel` 原语组合出 game001 专用主转轮视图。

## 3. 设计原则

### 3.1 app 与核心库边界

`packages/rendercore` 继续负责通用 reel/symbol 渲染能力：

- 单轴 reel 的渲染与旋转。
- reel spin plan 的计算。
- symbol registry、状态贴图和动画 resolver。

`apps/game001` 负责本游戏的特殊视觉规则：

- 主转轮底图内框校准。
- 第 4 轴只显示中心 symbol。
- 第 4 轴不滚动、不显示上下半行、不进入 `spinBlur`。
- 根据 server scene 的 `scene[3][2]` 更新锁定中心 symbol。
- game001 自己定义最终视觉验收规则，而不是要求 rendercore 的完整 5 轴 visible scene 与 target scene 完全相同。

只有当实现过程中发现 rendercore 缺少真正通用且必要的 API 时，才允许修改 `packages/rendercore`。如果修改 rendercore，必须说明为什么这不是 game001 特例，并补对应 rendercore 测试和验收命令。

### 3.2 scene 与视觉呈现的关系

logic scene 仍然是完整 `5 x 5`：

```text
scene[x][y]
x: 0..4，从左到右 5 轴
y: 0..4，从上到下 5 行
```

game001 的视觉呈现规则：

- 普通轴：`x = 0, 1, 2, 4`
  - 使用 rendercore `RenderReel`。
  - 视觉显示中心行和上下相邻半行。
  - spin 时正常滚动。
- 锁定轴：`x = 3`
  - 只显示 `scene[3][2]` 对应的单个 symbol。
  - 固定在第 4 列中心位置。
  - spin 请求期间保持在原位置，不滚动、不 bounce、不请求 `spinBlur`。
  - 如果已有 live defaultScene，初始化时显示 defaultScene 的 `scene[3][2]`。
  - 如果没有 live defaultScene，第一次 live spin 结算前锁定轴保持 hidden，不能用 y=0 或 fixture 兜底。
  - 每次 spin 的其它普通轴全部停止后，锁定轴用目标 scene 的 `scene[3][2]` 更新一次，使用 `normal` 状态固定显示；如果 symbol code 未变化，不需要重建。

注意：这个“结算时硬切到目标中心 symbol”的规则是为了满足“不需要旋转，固定住”。不要通过让第 4 轴高速转一小段、透明旋转、隐藏 spinBlur 等方式假装固定。

### 3.3 不做不必要兜底

以下情况必须 fail-fast：

- `GAME001_LOCKED_AXIS_INDEX` 不在 `0..4`。
- `GAME001_LOCKED_CENTER_Y` 不等于合法中心行 `2` 或不在 `0..4`。
- 主转轮校准的列中心数量不是 5。
- 主转轮校准列中心不是严格递增。
- 主转轮校准的第 4 列中心不在主转轮内框范围内。
- scene 不是完整 `5 x 5`。
- `scene[3][2]` 不是非负整数 symbol code。
- `registry.createRenderSymbolByCode(scene[3][2])` 返回 `null`，包括该 code 映射到 empty symbol 的情况。锁定轴要求显示中心图标，不能静默显示空白。
- 目标 scene 无法通过 `gameConfig.getStopYCoordinates()` 反查完整 5 轴 `finalYs`。
- 普通轴 spin 完成后任一普通轴 visible scene 与 target scene 对应列不一致。
- 锁定轴最终显示的 code 与 `scene[3][2]` 不一致。

不要把锁定轴缺图、非法 code、缺少状态贴图等问题用空图标、旧图标、其它 symbol 或透明占位静默替代。

## 4. 文件计划

优先新增：

```text
apps/game001/src/main-reels-view.ts
apps/game001/tests/main-reels-view.test.ts
```

需要修改：

```text
apps/game001/src/game-layout.ts
apps/game001/src/game-demo.ts
apps/game001/src/scene.ts
apps/game001/src/main.ts
apps/game001/tests/game-layout.test.ts
apps/game001/tests/game-demo.test.ts
apps/game001/tests/scene.test.ts
apps/game001/README.md
```

通常不应修改：

```text
packages/rendercore/**
packages/logiccore/**
packages/netcore/**
agents.md
```

如果最后确实没有修改 `agents.md`，任务报告中必须明确写明：本任务没有改变仓库协作规则、目录规范或基础脚本，因此无需更新 `agents.md`。

## 5. 实现步骤

### 5.1 增加 game001 主转轮校准常量

在 `apps/game001/src/game-layout.ts` 增加 game001 专用校准常量。建议先使用以下以 `assets/game001/reels1bk.png` 为基准的初始测量值，再通过浏览器截图微调；最终值必须写入测试、README 和任务报告。

```ts
export const GAME001_LOCKED_AXIS_INDEX = 3;
export const GAME001_LOCKED_CENTER_Y = 2;

export const GAME001_MAIN_REELS_CALIBRATION = Object.freeze({
  backgroundLocalFrame: Object.freeze({
    x: 25,
    y: 96,
    width: 975,
    height: 281,
  }),
  columnCentersX: Object.freeze([125, 319, 514, 708, 902]),
});
```

说明：

- `backgroundLocalFrame` 是相对于 `reels1bk.png` 左上角的主转轮内框，而不是相对于 stage。
- `columnCentersX` 是相对于 `reels1bk.png` 左上角的 5 个列中心，应该与底部圆点和竖向分隔线所定义的窗口中心一致。
- 如果实际浏览器截图证明这些值需要微调，只允许集中修改此校准常量和对应测试期望，不要把补偿散落在 runtime 逻辑里。

新增校准校验函数：

```ts
export function validateGame001MainReelsCalibration(...): void
```

至少校验：

- frame 的 `x/y/width/height` 都是有限正数，且落在 `1025 x 415` 主转轮背景范围内。
- `columnCentersX.length === 5`。
- 列中心严格递增。
- 每个列中心都落在 frame 横向范围内。
- `GAME001_LOCKED_AXIS_INDEX === 3`。
- `GAME001_LOCKED_CENTER_Y === 2`。

### 5.2 用列中心计算 fit scale 与 x/y

改造 `createMainReelsLayerLayout()`，不要再用整张主转轮背景宽度计算 fit scale。

新算法：

1. 根据 rendercore layout 计算 raw reel center：

```ts
rawCenterX(x) = layout.getReelX(x) + layout.cellWidth / 2
```

2. 根据底图列中心计算横向 scale：

```ts
scale =
  (columnCentersX[4] - columnCentersX[0]) /
  (rawCenterX(4) - rawCenterX(0))
```

3. 根据第 1 列中心反推主转轮内容 layer 的 stage x：

```ts
x =
  gameLayout.mainReelsBackground.x +
  columnCentersX[0] -
  rawCenterX(0) * scale
```

4. 根据底图内框垂直中心反推主转轮内容 layer 的 stage y：

```ts
const cropY = 1.5 * layout.cellHeight;
const cropHeight = 2 * layout.cellHeight;
const targetVisibleTop =
  gameLayout.mainReelsBackground.y + backgroundLocalFrame.y;
const targetVisibleHeight = backgroundLocalFrame.height;
const y =
  targetVisibleTop +
  (targetVisibleHeight - cropHeight * scale) / 2 -
  cropY * scale;
```

5. 输出结果里保留足够的调试字段：

```ts
interface MainReelsLayerLayout {
  readonly rawReelsContentWidth: number;
  readonly rawReelsContentHeight: number;
  readonly mainReelsFitScale: number;
  readonly cropY: number;
  readonly cropHeight: number;
  readonly visibleHeight: number;
  readonly x: number;
  readonly y: number;
  readonly stageColumnCentersX: readonly number[];
  readonly stageVisibleFrame: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly lockedAxis: {
    readonly xIndex: 3;
    readonly sceneY: 2;
    readonly stageCenterX: number;
    readonly stageCenterY: number;
    readonly localCenterX: number;
    readonly localCenterY: number;
  };
}
```

验收要求：

- `stageColumnCentersX[x]` 必须等于 `mainReelsBackground.x + columnCentersX[x]`。
- 普通轴 `x=0,1,2,4` 的 raw center 经过 `x + rawCenter * scale` 后，与 `stageColumnCentersX[x]` 的误差不超过 `1px`。
- `lockedAxis.stageCenterX` 必须是第 4 列中心。
- `lockedAxis.stageCenterY` 必须是主转轮内框垂直中心。

### 5.3 新增 Game001MainReelsView

新增 `apps/game001/src/main-reels-view.ts`，将主转轮视觉组合从 `RenderReelSet` 改为 game001 专用 view。

建议接口：

```ts
export interface Game001MainReelsView {
  readonly root: Container;
  readonly normalAxisIndexes: readonly number[];
  readonly lockedAxisIndex: 3;
  readonly lockedCenterY: 2;
  applyScene(scene: SceneMatrix, finalYs: readonly number[]): void;
  spinToScene(scene: SceneMatrix, finalYs: readonly number[], plan: ReelSpinPlan): void;
  update(deltaSeconds: number): Game001MainReelsViewUpdateResult;
  getCurrentScene(): SceneMatrix | null;
  getTargetScene(): SceneMatrix | null;
  getVisualSnapshot(): Game001MainReelsVisualSnapshot;
  isSpinning(): boolean;
}
```

建议 `Game001MainReelsVisualSnapshot` 至少包含以下纯数据字段，便于测试和任务报告引用，不要让测试依赖 Pixi 私有字段：

```ts
export interface Game001MainReelsVisualSnapshot {
  readonly visible: boolean;
  readonly spinning: boolean;
  readonly normalAxisIndexes: readonly number[];
  readonly startedNormalAxes: readonly number[];
  readonly stoppedNormalAxes: readonly number[];
  readonly normalVisibleScene: readonly (readonly number[])[];
  readonly lockedAxis: {
    readonly xIndex: 3;
    readonly sceneY: 2;
    readonly code: number | null;
    readonly symbol: string | null;
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
    readonly requestedState: string | null;
    readonly visibleSymbolCount: number;
  };
}
```

建议内部结构：

- `root`: 加到 Pixi stage 的主容器，承担 `x/y/scale/visible`。
- `reelsLayer`: 放普通轴 `RenderReel`。
- `lockedAxisLayer`: 放第 4 轴的固定中心 symbol。
- `maskLayer`: 放普通轴可视裁剪 mask。
- `normalReels`: `Map<number, RenderReel>`，只创建 `x=0,1,2,4`。
- `lockedSymbol`: 当前固定中心 symbol，可为空。
- `pendingLockedCode`: spin 期间目标 `scene[3][2]`。

普通轴创建方式：

```ts
const reel = new RenderReel({
  reels,
  x,
  layout,
  registry,
});
```

不要为 `x=3` 创建普通可见 reel。

mask 要求：

- 普通轴必须被裁剪在各自列窗口内，避免 symbol 压住底图竖向分隔线、底部圆点或边框。
- 可以用一个 `Graphics` mask 画多个 rect，每个 rect 对应普通轴：

```ts
for (const x of [0, 1, 2, 4]) {
  mask.rect(layout.getReelX(x), cropY, layout.cellWidth, cropHeight);
}
```

- 锁定轴不使用普通轴的半行 mask；它只显示单个中心 symbol。

锁定 symbol 创建方式：

- 使用同一个 `registry.createRenderSymbolByCode(code)`，保证贴图、缩放、动画 resolver 与普通轴一致。
- 创建后调用 `symbol.init()`。
- 固定位置使用 layout 的第 4 列 raw center 和 center row raw center：

```ts
symbol.x = layout.getReelX(3) + layout.cellWidth / 2;
symbol.y = cropY + cropHeight / 2;
```

- `root.x/root.y/root.scale` 会把 raw 坐标映射到底图校准后的 stage 坐标。
- 固定 symbol 默认请求/保持 `normal`，不请求 `spinBlur`。

### 5.4 修改 Game001ReelRuntime

改造 `apps/game001/src/game-demo.ts`：

- 继续保留 `createGameConfig()`、`createReelSymbolRegistry()`、`createReelLayout()`、`createReelSpinPlan()`。
- 用 `createGame001MainReelsView()` 替代 `new RenderReelSet()`。
- Runtime 对外仍可以保留 `mainReelsLayer` 字段，但来源应改为 `mainReelsView.root`，减少 `main.ts` 改动。
- `applyScene(scene)`：
  1. `validateGame001Scene(scene, label)`。
  2. 使用完整 scene 计算 `finalYs`。
  3. `mainReelsView.applyScene(validScene, finalYs)`。
  4. 保存 `currentScene = validScene`。
  5. 用新的 game001 视觉校验替代旧的 `reelSet.getVisibleScene()` 完整比较。
- `createSpinPlan(scene)`：
  1. 仍对完整 scene 计算完整 5 轴 finalYs。
  2. 仍创建完整 5 轴 `ReelSpinPlan`，因为停轴反查和 spin plan 属于完整 game logic。
- `spinToScene(scene)`：
  1. 如果正在 spin，明确失败。
  2. 校验完整 scene。
  3. 计算完整 finalYs。
  4. 创建完整 plan。
  5. 调用 `mainReelsView.spinToScene(validScene, finalYs, plan)`。
  6. 普通轴只启动 `[0, 1, 2, 4]` 对应的 axis plan；第 4 轴 `x=3` 不调用 `RenderReel.start()`。
- `update(deltaSeconds)`：
  1. 调用 `mainReelsView.update(deltaSeconds)`。
  2. 普通轴全部完成后，`mainReelsView` 更新锁定轴到 pending target center code。
  3. 调用 game001 视觉校验：
     - 普通轴 visible scene 与 target scene 对应列一致。
     - 锁定轴显示 code 等于 `targetScene[3][2]`。
     - 锁定轴只有一个 visible symbol。
  4. 完成后保存 `currentScene = targetScene`，清空 target。

删除或停止依赖旧的完整 `reelSet.getVisibleScene()` 验收。这个旧验收会把第 4 轴的隐藏行也当成视觉需求，和本任务目标冲突。若测试仍要求完整 `reelSet` scene 一致，应改测试，不要为了测试让生产代码继续渲染/旋转第 4 轴。

### 5.5 scene helper

在 `apps/game001/src/scene.ts` 增加小而明确的 helper：

```ts
export function getGame001LockedCenterCode(scene: SceneMatrix): number
```

要求：

- 先复用 `validateGame001Scene()` 或只接受已经验证过的 `SceneMatrix`。
- 返回 `scene[3][2]`。
- 如果 code 不是非负整数，明确失败。

可增加：

```ts
export function assertGame001VisualSceneMatchesTarget(...)
```

但不要把 Pixi `Container` 细节塞进 `scene.ts`。更推荐让 `main-reels-view.ts` 产出纯数据 snapshot，再由 helper 校验纯数据。

### 5.6 README 更新

更新 `apps/game001/README.md`，至少补充：

- 主转轮对齐不是使用整张 `reels1bk.png` 宽度，而是使用 game001 的内框校准：
  - `backgroundLocalFrame`
  - `columnCentersX`
  - `mainReelsFitScale` 计算方式
- 第 4 轴说明：
  - 用户语义“第4轴” = 0-based `x=3`
  - 只显示 `scene[3][2]`
  - 不参与 spin
  - spin 完成时硬切到目标中心 symbol
- 这是 game001 特殊视觉需求，不是 rendercore 通用行为。
- 如果未来别的游戏也需要锁定轴，另开任务抽象通用 API，不在本任务提前泛化。

## 6. 测试计划

### 6.1 game-layout.test.ts

修改 `apps/game001/tests/game-layout.test.ts`：

- 校验 `GAME001_LOCKED_AXIS_INDEX === 3`。
- 校验 `GAME001_LOCKED_CENTER_Y === 2`。
- 校验 `GAME001_MAIN_REELS_CALIBRATION.columnCentersX` 长度为 5 且严格递增。
- 校验第 4 列中心等于 `columnCentersX[3]`。
- 校验 `createMainReelsLayerLayout()` 的 scale 不再等于 `reels1bk.width / rawReelsContentWidth`。
- 校验普通轴 raw center 映射到 stage 后与目标列中心一致，误差不超过 `1px`。
- 校验 visible frame 的 stage 坐标来自 `mainReelsBackground + backgroundLocalFrame`。
- 校验 locked axis center 位于第 4 列中心和内框垂直中心。

### 6.2 main-reels-view.test.ts

新增 `apps/game001/tests/main-reels-view.test.ts`：

- 创建测试 registry、layout 和合法 `5 x 5` scene。
- `applyScene()` 后：
  - `normalAxisIndexes` 等于 `[0, 1, 2, 4]`。
  - 不存在普通 `x=3` reel。
  - 锁定轴显示一个 symbol。
  - 锁定轴 code 等于 `scene[3][2]`。
  - 锁定轴位置等于第 4 列中心/中心行。
- `spinToScene()` 后：
  - 只对普通轴启动 `RenderReel.start()`。
  - 普通轴进入 spinning/starting。
  - 锁定轴仍保持原 code、原 x/y、`rotation = 0`。
  - 锁定轴 requested state 不是 `spinBlur`。
- `update()` 到完成后：
  - 普通轴 visible scene 分别等于 target scene 的 `x=0,1,2,4`。
  - 锁定轴 code 更新为 target `scene[3][2]`。
  - 锁定轴仍只有一个 visible symbol。
  - `isSpinning()` 为 false。
- 如果没有 initial scene：
  - root 可以保持 hidden。
  - 锁定轴没有用 y=0 或 fixture 兜底显示。
  - 第一次 spin 完成后才显示 target center symbol。
- 非法校准、非法 locked axis index、非法 center y、非法 code 都明确抛错。
- 如果 `scene[3][2]` 映射到 `BN` 或其它 configured empty symbol，必须明确抛错；锁定轴要求显示中心图标，不能把 empty 当成可接受的空白。
- 多次 `applyScene()` 或多次 spin 完成后，锁定轴层仍只能有一个当前 symbol，不能累积旧 symbol。

### 6.3 game-demo.test.ts

修改 `apps/game001/tests/game-demo.test.ts`：

- 保留完整 scene 校验和 finalYs 反查测试。
- 保留特殊 symbol `1.5` 缩放测试。
- 把旧的 `runtime.reelSet.getVisibleScene()` 完整比较改为新的 game001 视觉比较：
  - 普通轴全列匹配。
  - 锁定轴只校验 center code。
- 增加第 4 轴不旋转测试：
  - 调用 `spinToScene()` 后，snapshot 中 started normal axes 不包含 `3`。
  - update 过程中 locked symbol 的位置和 rotation 不变。
  - locked symbol 不进入 `spinBlur`。
- 增加第 4 轴目标中心 symbol 改变的测试，确认完成时更新一次。

### 6.4 scene.test.ts

修改 `apps/game001/tests/scene.test.ts`：

- 覆盖 `getGame001LockedCenterCode()` 成功路径。
- 覆盖 scene 非 `5 x 5` 失败。
- 覆盖 `scene[3][2]` 非非负整数失败。

### 6.5 不应改动的测试方向

不要为了旧测试继续要求第 4 轴完整 5 行 visible scene 与 target scene 一致。这个要求已经不符合本任务视觉需求。

如果测试 fixture 不完整，应修 fixture 或测试断言；不要放宽生产代码中的 scene 校验、资源校验或停轴反查。

## 7. 浏览器与视觉验收

启动 app：

```bash
pnpm --filter game001 dev -- --host 0.0.0.0
```

浏览器验收至少覆盖：

- 页面第一屏仍然是游戏 demo，不是 landing page。
- canvas 仍按 `941 x 1672` stage 渲染。
- 主转轮背景、logo、副转轮背景仍按现有静态坐标显示。
- 普通轴 symbol 中心与 `reels1bk.png` 的列中心对齐。
- 普通轴 symbol 不压住底图竖向分隔线、底部圆点和外框。
- 视觉上只显示中间一行和上下相邻半行。
- 第 4 轴只显示一个中心 symbol。
- 第 4 轴没有上半行或下半行的 symbol 残留。
- 点击 Spin 后，第 4 轴在其它轴旋转期间位置不动、rotation 不变、不显示 `spinBlur`。
- 普通轴正常旋转并停到 server target scene 对应列。
- 普通轴停止后，第 4 轴硬切到 target `scene[3][2]`，仍固定在中心位置。

建议至少记录两张截图或一段短视频的结果：

- 初始/default scene：证明列中心对齐和第 4 轴单 symbol。
- spin 中或 spin 后：证明第 4 轴不旋转，普通轴正常旋转/停轴。

如果当前环境没有可用 live server，不能用本地 fixture 或 replay 冒充完整 live 验收。可以执行静态浏览器验收和单元测试，但任务报告必须明确写明 live spin 浏览器验收未完成。

## 8. 验收命令

先运行 game001 包级验收：

```bash
pnpm --filter game001 lint
pnpm --filter game001 test
pnpm --filter game001 typecheck
pnpm --filter game001 build
```

如果修改了 `packages/rendercore`，还必须运行：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

如果修改了 `packages/logiccore`，还必须运行：

```bash
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
```

如果修改了 `packages/netcore`，还必须运行：

```bash
pnpm --filter @slotclientengine/netcore lint
pnpm --filter @slotclientengine/netcore test
pnpm --filter @slotclientengine/netcore typecheck
pnpm --filter @slotclientengine/netcore build
```

最后运行根级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

如果依赖下载失败，先执行代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 9. 任务报告要求

完成后新增中文任务报告：

```text
tasks/27-game001-reel-alignment-locked-axis-[utctime].md
```

其中 `[utctime]` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

报告必须包含：

- 实现摘要。
- 新增和修改文件列表。
- 是否修改了 `agents.md`，以及原因。
- 是否修改了 `packages/rendercore`、`packages/logiccore`、`packages/netcore`，以及原因。
- 最终主转轮校准常量：
  - `backgroundLocalFrame`
  - `columnCentersX`
  - `mainReelsFitScale`
  - `stageColumnCentersX`
  - locked axis center stage 坐标
- 第 4 轴规则实现说明：
  - 0-based `x=3`
  - center row `y=2`
  - 初始 defaultScene 如何显示
  - 无 defaultScene 时是否保持 hidden
  - spin 期间如何保证不旋转
  - spin 完成时如何更新 target center symbol
- 最终视觉校验逻辑：
  - 普通轴如何对比 target scene
  - 锁定轴如何对比 `scene[3][2]`
- 执行过的命令和结果。
- 浏览器/视觉验收结果。
- 如果 live spin 浏览器验收未执行，必须明确说明不能标记为完整 live 验收完成。
- 未完成项或后续建议。

## 10. 完成标准

满足以下全部条件才算完成：

- `apps/game001` 仍可正常运行、测试和构建。
- 主转轮内容使用底图内框/列中心校准，不再使用整张 `reels1bk.png` 宽度作为唯一 fit 依据。
- 普通轴与底图列中心对齐，竖向分隔线和底部圆点不被 symbol 覆盖。
- 第 4 轴从左到右解释为 0-based `x=3`，并在代码、测试、README 中明确。
- 第 4 轴只显示 `scene[3][2]` 对应的一个中心 symbol。
- 第 4 轴 spin 期间不滚动、不 bounce、不旋转、不请求 `spinBlur`。
- 第 4 轴无 defaultScene 时不使用 y=0、fixture 或旧画面兜底。
- spin 完成后，第 4 轴固定显示 target `scene[3][2]`。
- 完整 `5 x 5` scene 仍被严格解析并用于停轴反查。
- 普通轴最终 visible scene 与 target scene 对应列一致。
- 锁定轴最终显示 code 与 target `scene[3][2]` 一致。
- 必要测试已新增或更新并通过。
- README 已更新。
- 包级和根级验收命令通过。
- 浏览器视觉验收已记录；如果 live 环境不可用，报告明确说明未完成的 live 项。
- 已新增中文任务报告。
- 如确实改变仓库协作规则、目录规范或基础脚本，已同步更新 `agents.md`；否则报告说明无需更新。
