# rendercore reels viewer 任务计划

## 1. 任务目标

在已有 `packages/rendercore` symbol 系统基础上，实现可复用的 slot reel 渲染与旋转编排能力，并新增 `apps/reelsviewer` 作为前端验证应用。

本计划是完整可执行版本，不依赖任何其它上下文。执行者只需要阅读本文件，即可完成实现、测试、README、验收和任务报告。

核心目标：

- 在 `packages/rendercore` 中新增 reel 模块，不能把 reel 逻辑写死在 demo app 里。
- 核心实现必须放在 `packages/rendercore`；具体操作入口、页面按钮、demo 参数、资产路径、GMI 选择、`game2.json`/`assets/symbols` 绑定等配置和操作相关逻辑必须放在 `apps/reelsviewer`。
- 沿用任务 20/21 的配置输入：
  - 游戏配置：`assets/gamecfg/game2.json`
  - symbol 图片：`assets/symbols`
  - symbol 状态贴图 manifest：`assets/symbols/symbol-state-textures.manifest.json`
- 使用任务 19 的 GMI 数据：
  - 源数据文件：`packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json`
  - 从 GMI 解析 step0 scene0，结合 `game2.json` 的 `reels01` 反查最终停留 y。
- reel 旋转流程必须为：
  1. 根据 GMI scene 和 game config 计算每轴最终停止 y。
  2. 根据每轴动画时长和最小转动距离反推每轴起始 y。
  3. 一轴一轴开始转动。
  4. 旋转中 symbol 切换到 `spinBlur` 状态。
  5. 一轴一轴停止，停止时有力度感和回弹。
  6. 停止后可见 symbol 全部请求 `appear` 状态。
  7. `appear` 播放完成后回到 `normal`。
- 当前可见区域按 5 行设计；每轴至少转动 `10 * 5 = 50` 个 symbol 位置才能停下来。实现应把这个写成 `minimumSpinCycles * visibleRows`，默认 `minimumSpinCycles = 10`，不要硬编码只适配 5 行。
- 转动需要快速启动、有力度感；停止前逐步减速，但在进入最终落点前仍维持足够高的速度，保持 `spinBlur` 视觉语义。
- 图标 cell 尺寸必须由当前参与 reels 渲染的非空普通图片动态计算：
  - 宽度取最大普通图片宽度。
  - 高度取最大普通图片高度。
  - 所有非空 symbol 原图在这个 cell 内居中显示。
  - 不要用写死的 `449 x 319`、`449 x 341` 或其它当前观察值作为实现逻辑。
- 新增空图标概念：
  - `BN` 是空图标。
  - paytable 中缺少普通图片的 symbol 等价为空图标。
  - 空图标占据 cell 和 reel 位置，但不渲染任何 Pixi display object。
  - 空图标切换 `spinBlur`、`appear`、`normal` 都是 no-op，但不能影响其它 symbol 的状态流转。
- 当前 `assets/symbols` 比任务 21 多了普通图片，必须同步处理状态贴图：
  - `SC.png`
  - `RS.png`
  - `X2.png`
  - `X5.png`
  - `X10.png`
  - 这些 symbol 如果参与 reels 渲染且有普通图，则必须具备 `spinBlur` 状态贴图；不能因为缺少 `spinBlur` 贴图就静默回退到普通图。
- 新增 `apps/reelsviewer`：
  - 依赖 `@slotclientengine/rendercore`、`@slotclientengine/logiccore`、`pixi.js`。
  - 第一屏就是可运行的 reels 验证工具，不做营销页。
  - 默认加载 `game2.json` 和任务 19 GMI 数据。
  - 默认展示 5 轴 5 行，必须提供一个简单明确的 Spin 按钮，用来触发一次完整 spin 操作；可额外提供 Reset 等最小必要控制。
  - 旋转完成后画面必须停在 GMI scene 对应的可见结果上。
- 更新 README：
  - `packages/rendercore/README.md` 增加 reel API、空图标、cell 尺寸、spin plan、状态切换说明。
  - 新增 `apps/reelsviewer/README.md`。
  - 如状态贴图资源范围影响 `apps/symbolsviewer`，同步更新 `apps/symbolsviewer/README.md`。
- `rendercore` 是核心库，必须有足够测试用例；最终 `pnpm --filter @slotclientengine/rendercore test` 的实际 coverage lines/functions/branches/statements 均必须大于 80%，不能只满足等于阈值。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `22-rendercore-reels-viewer-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

## 2. 当前仓库事实

仓库事实：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`，pnpm 要求为 `>=10.0.0`。
- workspace 匹配 `apps/*` 和 `packages/*`。
- 根级命令包括：
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm format`
  - `pnpm format:check`
- 根目录协作文件路径是 `agents.md`。只有当本任务改变仓库级协作规则、目录规范或基础脚本时，才需要同步更新 `agents.md`。
- 如果执行 `pnpm install` 或依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

`logiccore` 当前事实：

- package 路径：`packages/logiccore`。
- 包名：`@slotclientengine/logiccore`。
- 已有 `createGameConfig(rawJson)`，可严格解析 `game2.json` 的 `paytable`、`symbolCodes`、`reels`。
- 已有 `createGameLogic(message)` 和 `createGameLogicFromGmi(gmi, meta)`。
- 已有 reel 查询与反推接口：
  - `gameConfig.getReels('reels01')`
  - `gameConfig.getStopYCoordinates({ reelsName, sceneName, scene })`
  - `gameConfig.getSpinStartYCoordinates({ reelsName, finalYs, speedSymbolsPerSecond, durationMs, direction })`
  - `reels.get(x, y)`
  - `reels.normalizeY(x, y)`
- 任务 19 已确认，使用 `packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json` 的 step0 scene0 和 `reels01` 时：
  - `gameConfig.getStopYCoordinates(...) === [1, 1, 4, 0, 27]`
  - 第 3 轴存在多个候选 `[4, 34]`，当前语义取第一个候选 `4`。
- 协议 scene 是 x 优先结构：`scene[x][visibleY]`。

`rendercore` 当前事实：

- package 路径：`packages/rendercore`。
- 包名：`@slotclientengine/rendercore`。
- 当前依赖：
  - `@slotclientengine/logiccore`
  - `@slotclientengine/pixiani`
  - `pixi.js`
- 当前入口只导出 symbol 模块：`packages/rendercore/src/index.ts`。
- 当前 symbol 模块包括：
  - `RenderSymbol`
  - `SymbolStateMachine`
  - `SymbolStateSequenceController`
  - `createDefaultSymbolStatePreset`
  - `createDefaultSymbolAnimationResolver`
  - `createSymbolCatalog`
- 当前默认 symbol 状态包括：
  - `normal`
  - `spinBlur`
  - `disabled`
  - `appear`
  - `win`
- 当前 `spinBlur -> normal`、`disabled -> normal` 是状态等价配置，但默认静态 ani 会按 `requestedState` 选择状态贴图。
- 当前 `RenderSymbol` 不创建 Pixi `Application`，也不从磁盘加载图片；调用方负责加载 `Texture` 并显式 `update(deltaSeconds)`。
- 当前 `packages/rendercore/vite.config.ts` 的 coverage 阈值为 lines/functions/branches/statements 均 80；本任务不能降低阈值，且最终实际结果必须大于 80%。
- 当前 `packages/rendercore/scripts/generate-symbol-state-textures.mjs` 会为普通图生成 `spinBlur` 和 `disabled` 贴图。
- 当前生成脚本已有 `sharp@^0.34.4`，只能用于 Node 脚本，不允许进入浏览器运行时代码。

`assets/gamecfg/game2.json` 当前 paytable symbols：

- `BN`
- `S00`
- `S0`
- `S1`
- `S5`
- `S10`
- `SC`
- `RS`
- `X2`
- `X5`
- `X10`

`assets/symbols` 当前普通图片包括：

- `CO.png`
- `RS.png`
- `S00.png`
- `S0.png`
- `S1.png`
- `S5.png`
- `S10.png`
- `SC.png`
- `SX.png`
- `X2.png`
- `X5.png`
- `X10.png`

当前特殊点：

- `BN` 在 paytable 中，但没有普通图片；本任务要求它作为空图标。
- `CO.png` 和 `SX.png` 当前不在 `game2.json` paytable 中；它们是孤儿图片，不应进入 reels 渲染。
- `S00`、`S0`、`S1`、`S5`、`S10` 已有 `spinBlur` 和 `disabled` 状态贴图。
- `SC`、`RS`、`X2`、`X5`、`X10` 当前有普通图，但需要补齐状态贴图，否则 `spinBlur` 旋转阶段不能 fail-fast 通过。

## 3. 设计原则

### 3.1 核心库和 app 边界

`packages/rendercore` 负责通用 reel 能力：

- symbol cell 尺寸计算。
- 空图标语义。
- reel strip 可视窗口。
- 根据 `LogicReels` 和 y 坐标渲染可见 symbol。
- spin plan 计算。
- reel spin 状态机和每轴时序。
- symbol 状态请求：`spinBlur`、`appear`、`normal`。

`packages/rendercore` 不负责：

- 读取具体的 `assets/gamecfg/game2.json`。
- 读取具体的 `assets/symbols` 目录。
- 选择任务 19 的具体 GMI fixture。
- 创建页面按钮、DOM 面板或用户操作流程。
- 写死 `reels01`、`BN`、某一组 symbol 名单、某一套 viewer 默认参数。

`apps/reelsviewer` 负责 demo/app 配置：

- 读取 `assets/gamecfg/game2.json`。
- 读取 `assets/symbols` 图片和 manifest。
- 读取或复制任务 19 的 GMI fixture。
- 创建 Pixi `Application`。
- 提供简单 Spin 按钮并把点击事件转换为一次 `RenderReelSet.spin(plan)` 或等价核心 API 调用。
- 提供 Reset 或状态展示等 viewer 操作。
- 选择当前默认 spin 参数、动画时长、速度、可见行数、reels 名称、空 symbol 配置和资源 manifest 策略。

不要把 `game2.json`、`assets/symbols`、`reels01`、`gamemoduleinfo-basic.json` 路径、Spin 按钮逻辑或 viewer 默认 symbol 名单写死进 `rendercore/src/**`。

### 3.2 空图标是显式语义，不是兜底

本任务允许“缺少普通图片的 paytable symbol 等价为空图标”，但必须显式体现在 API 和 validation 中，不能把任何错误都吞成空：

- `BN` 应进入 `emptySymbols` 或等价配置，并在 validation 里可见。
- paytable 中缺少普通图片的 symbol 应进入 `emptySymbolsByMissingAsset` 或类似 validation 字段。
- reel 中遇到空 symbol code 时渲染为空 cell。
- reel 中遇到 paytable 不存在的 symbol code 应继续由 `logiccore` 失败，不允许 rendercore 猜测为空。
- 有普通图的 symbol 如果缺少必需 `spinBlur` 状态贴图，应抛 `SymbolAssetError` 或新增 `ReelAssetError`，不能变成空图标。
- orphan 图片不参与 reel 渲染，可在 validation 中记录为 `ignoredAssetsWithoutPaytable`。

### 3.3 尺寸和居中

实现必须从已加载的 `Texture` 或其 source 尺寸计算 cell 尺寸：

- 只统计当前 game config/paytable 中非空、可渲染的普通图片。
- 不统计 `BN`。
- 不统计缺少普通图而变成空图标的 symbol。
- 不统计 `CO.png`、`SX.png` 这类不在 paytable 的孤儿图片。
- 不统计 `spinBlur`、`disabled` 状态贴图作为 cell 尺寸来源；状态贴图尺寸应与普通图一致或至少不大于 cell。
- 如果没有任何非空普通图，直接失败，不允许用 `0 x 0` 或硬编码默认值。

居中规则：

- cell 坐标以最大宽高作为布局单位。
- 每个非空 symbol 的主 sprite anchor 使用 `0.5, 0.5`。
- 每个 symbol container 放在 cell 中心。
- 小图保持原始尺寸，不拉伸填满 cell。
- 空图标 cell 不创建 sprite，但保留位置。

### 3.4 Spin plan 不依赖恒速假设

`logiccore.getSpinStartYCoordinates()` 适合恒定速度反推。reel 表现层需要加速、巡航、减速和回弹，因此 `rendercore` 应新增自己的 spin plan。

关键要求：起始 y 必须由最终 y、动画时长、速度或运动曲线距离共同反推出来，不能先随便选一个起点再让动画硬停到目标。动画时长不是展示用备注字段，必须参与 `travelSymbols` 或运动曲线积分计算。

推荐语义：

- 先确定每轴 `finalY`。
- 再根据每轴 `durationMs`、`speedSymbolsPerSecond` 和最小距离确定总转动距离 `travelSymbols`。
- `travelSymbols` 必须满足：
  - `travelSymbols >= minimumSpinCycles * visibleRows`
  - 当前默认即 `travelSymbols >= 50`
  - 推荐使用整数，避免最终落点因为浮点误差偏离。
- `travelSymbols` 推荐计算方式：
  - `durationTravel = Math.ceil((durationMs / 1000) * speedSymbolsPerSecond)`
  - `minimumTravel = minimumSpinCycles * visibleRows`
  - `travelSymbols = Math.max(minimumTravel, durationTravel) + x * visibleRows + extraTravel`
  - 如果实现改用非恒速 motion profile，也必须保证 profile 的距离积分等价于 `travelSymbols`，并保留同等测试。
- 根据方向反推起点：
  - forward：`startY = reels.normalizeY(x, finalY - travelSymbols)`
  - backward：`startY = reels.normalizeY(x, finalY + travelSymbols)`
- 动画过程用 easing 和 phase 控制展示速度，但最终必须满足：
  - `renderedY(t=0) === startY`
  - `renderedY(t=end) === finalY`
  - 可见 scene 与 GMI scene 完全一致。
- 修改 viewer 的动画时长或速度配置时，除非仍被 `minimumTravel` 夹住，否则 `travelSymbols` 和 `startY` 应随之变化。

不要为了使用现有 helper 而把加减速曲线改成奇怪的恒速测试写法；如果测试推动了这种实现，优先修改测试。

## 4. rendercore 新增模块建议

新增目录：

```text
packages/rendercore/src/reel
```

建议新增文件：

```text
packages/rendercore/src/reel/index.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/src/reel/errors.ts
packages/rendercore/src/reel/symbol-registry.ts
packages/rendercore/src/reel/layout.ts
packages/rendercore/src/reel/spin-plan.ts
packages/rendercore/src/reel/reel-window.ts
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/reel/render-reel-set.ts
```

同时修改：

```text
packages/rendercore/src/index.ts
packages/rendercore/package.json
packages/rendercore/vite.config.ts
packages/rendercore/README.md
```

`packages/rendercore/src/index.ts` 需要继续导出 symbol，同时新增：

```ts
export * from "./reel/index.js";
```

如果需要子路径导出，`packages/rendercore/package.json` 增加：

```json
{
  "exports": {
    "./reel": {
      "types": "./dist/reel/index.d.ts",
      "import": "./dist/reel/index.js"
    }
  }
}
```

不要破坏现有 `.` 和 `./symbol` export。

### 4.1 Reel symbol registry

新增 registry，用于把 paytable、assets、空图标和 `RenderSymbol` 创建能力合并在一起。

建议类型：

```ts
export interface ReelSymbolRegistryOptions {
  readonly gameConfig: LogicGameConfig;
  readonly assets: SymbolAssetMap;
  readonly emptySymbols?: readonly string[];
  readonly statePreset?: SymbolStatePreset;
  readonly animationResolver?: SymbolAnimationResolver;
  readonly texturePolicy?: SymbolTexturePolicy;
}

export type ReelSymbolKind = "textured" | "empty";

export interface ReelSymbolRegistryEntry {
  readonly code: number;
  readonly symbol: string;
  readonly kind: ReelSymbolKind;
}

export interface ReelSymbolRegistryValidation {
  readonly texturedSymbols: readonly string[];
  readonly configuredEmptySymbols: readonly string[];
  readonly missingAssetEmptySymbols: readonly string[];
  readonly ignoredAssetsWithoutPaytable: readonly string[];
}

export interface ReelSymbolRegistry {
  getValidation(): ReelSymbolRegistryValidation;
  getEntryByCode(code: number): ReelSymbolRegistryEntry;
  getEntryBySymbol(symbol: string): ReelSymbolRegistryEntry;
  getCellSize(): { readonly width: number; readonly height: number };
  createRenderSymbolByCode(code: number): RenderSymbol | null;
}
```

要求：

- `emptySymbols` 默认可为空，但 `apps/reelsviewer` 必须传入 `["BN"]`。
- `BN` 即使未来有图片，也应按显式 empty symbol 处理；这种情况下 validation 要记录，不能悄悄使用图片。
- paytable 中无普通图片的 symbol 作为 missing-asset empty symbol。
- 有普通图的 symbol 才能创建 `RenderSymbol`。
- 有普通图的 symbol 必须满足 `texturePolicy.requiredStateTextures`。
- `getCellSize()` 必须返回冻结或不可变对象。
- `createRenderSymbolByCode()` 对空图标返回 `null`；对未知 code 抛错。

### 4.2 Reel layout

新增 layout 纯函数，负责 cell 尺寸、坐标和窗口行范围。

建议类型：

```ts
export interface ReelLayoutOptions {
  readonly reelCount: number;
  readonly visibleRows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columnGap?: number;
  readonly bufferRowsBefore?: number;
  readonly bufferRowsAfter?: number;
}

export interface ReelLayout {
  readonly reelCount: number;
  readonly visibleRows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columnGap: number;
  readonly bufferRowsBefore: number;
  readonly bufferRowsAfter: number;
  getReelX(x: number): number;
  getCellY(visibleY: number): number;
}
```

要求：

- `visibleRows` 必须是正整数。
- `cellWidth` 和 `cellHeight` 必须是正数。
- `reelCount` 必须和 `LogicReels.getReelCount()` 匹配。
- buffer rows 默认至少上下各 1 行，避免滚动时出现空洞。

### 4.3 Spin plan

新增纯函数，便于测试。

建议类型：

```ts
export interface ReelSpinPlanOptions {
  readonly reels: LogicReels;
  readonly finalYs: readonly number[];
  readonly visibleRows: number;
  readonly direction?: "forward" | "backward";
  readonly minimumSpinCycles?: number;
  readonly baseDurationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly startDelayMs: number;
  readonly stopDelayMs: number;
  readonly extraTravelSymbolsPerReel?: readonly number[];
}

export interface ReelAxisSpinPlan {
  readonly x: number;
  readonly finalY: number;
  readonly startY: number;
  readonly travelSymbols: number;
  readonly startDelayMs: number;
  readonly durationMs: number;
  readonly stopAtMs: number;
}

export interface ReelSpinPlan {
  readonly axes: readonly ReelAxisSpinPlan[];
  readonly totalDurationMs: number;
}
```

`apps/reelsviewer` 默认配置建议如下，这些数值应放在 `apps/reelsviewer/src/reels-config.ts` 或等价 viewer 配置模块中；`rendercore` 只消费传入的 options、做校验和计算，不读取或写死这组 demo 默认值：

- `minimumSpinCycles = 10`
- `baseDurationMs = 1600`
- `speedSymbolsPerSecond = 42`
- `startDelayMs = 90`
- `stopDelayMs = 180`
- 第 x 轴：
  - `startDelayMs = x * options.startDelayMs`
  - `durationMs = options.baseDurationMs + x * options.stopDelayMs`
  - `durationTravel = Math.ceil((durationMs / 1000) * options.speedSymbolsPerSecond)`
  - `travelSymbols = Math.max(minimumSpinCycles * visibleRows, durationTravel) + x * visibleRows + extraTravel`

验收语义：

- 第 0 轴最先开始、最先停。
- 后续轴依次开始、依次停。
- 每轴 `travelSymbols >= 50`。
- `startY` 用 `reels.normalizeY()` 反推。
- `stopAtMs` 严格递增。
- 非法输入必须抛错：
  - `finalYs.length !== reels.getReelCount()`
  - 非正 `visibleRows`
  - 非正 `baseDurationMs`
  - 非正 `speedSymbolsPerSecond`
  - 负 `startDelayMs` 或 `stopDelayMs`
  - `minimumSpinCycles < 1`
  - `extraTravelSymbolsPerReel` 长度不匹配

### 4.4 RenderReel

新增单轴渲染对象。

建议职责：

- 持有某一轴的 `Container`。
- 根据当前 y 坐标和 `LogicReels.get(x, y)` 填充可见窗口。
- 复用固定 slot container，避免每帧创建大量 Pixi 对象。
- 对空图标 slot 保持空。
- 对非空图标创建或复用 `RenderSymbol`。
- 旋转中所有非空 symbol 请求 `spinBlur`。
- 停止落点时刷新最终窗口，所有非空可见 symbol 请求 `appear`。
- `appear` 完成后依靠 `RenderSymbol` 回到默认 `normal`。

建议状态：

```ts
export type RenderReelPhase = "idle" | "starting" | "spinning" | "settling" | "stopped";
```

建议方法：

```ts
export class RenderReel extends Container {
  start(plan: ReelAxisSpinPlan): void;
  update(deltaSeconds: number): RenderReelUpdateResult;
  resetToY(y: number): void;
  getSnapshot(): RenderReelSnapshot;
}
```

动画要求：

- start 阶段有短促回弹，可表现为 reel container 或 mask 内窗口 y 的轻微反向位移后快速进入高速。
- spinning 阶段以高速度滚动，持续保持 `spinBlur`。
- settling 阶段逐步减速，但不要慢到能清晰看到普通图；symbol 仍是 `spinBlur`。
- landed/stopped 时再切到最终 scene，并对可见 symbol 请求 `appear`。
- stop bounce 可对 reel container 做小幅过冲和回弹，不改变最终 `finalY` 语义。

不要用 CSS transition 驱动 Pixi reel；所有核心状态应在 `rendercore` 的 `update(deltaSeconds)` 中可测试。

### 4.5 RenderReelSet

新增多轴编排对象。

建议职责：

- 创建 5 个 `RenderReel`。
- 接收 `ReelSpinPlan` 后按每轴 `startDelayMs` 启动。
- 所有轴都 stopped 后返回 `completed`。
- 提供当前 visible scene 快照，便于测试和 viewer 面板展示。

建议方法：

```ts
export class RenderReelSet extends Container {
  spin(plan: ReelSpinPlan): void;
  update(deltaSeconds: number): RenderReelSetUpdateResult;
  resetToFinalYs(finalYs: readonly number[]): void;
  getVisibleScene(): readonly (readonly number[])[];
  getSnapshot(): RenderReelSetSnapshot;
}
```

`getVisibleScene()` 必须按 x 优先结构返回，与 `logiccore` scene 一致，方便断言：

```ts
visibleScene[x][visibleY] === expectedScene[x][visibleY]
```

## 5. 状态贴图资源同步

本任务需要保证有普通图的 paytable symbol 都能进入 `spinBlur`。

推荐先运行或更新生成脚本：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10
```

要求：

- `assets/symbols/symbol-state-textures.manifest.json` 必须包含这些有普通图的 paytable symbol。
- 每个 symbol 至少包含：
  - `normal`
  - `spinBlur`
- 如果沿用当前脚本同时生成 `disabled`，则 manifest 对这些 symbol 也必须包含 `disabled`，避免破坏 `apps/symbolsviewer`。
- 不要为 `BN` 生成图片。
- 不要为 `CO`、`SX` 生成状态贴图，除非后续它们进入 `game2.json` paytable；当前它们是 orphan。
- 生成脚本不得清理普通图或非本脚本生成的资源。
- `sharp` 不得出现在 `packages/rendercore/src/**`、`apps/reelsviewer/src/**`、`apps/symbolsviewer/src/**`。

因为新增了普通图资源，`apps/symbolsviewer` 也可能受到影响。必须检查并按实际结果处理：

- 如果 `symbolsviewer` 当前会把 `SC`、`RS`、`X2`、`X5`、`X10` 纳入 displayable symbols，则测试和 README 也要更新。
- 如果决定让 `symbolsviewer` 继续只展示任务 21 的五个 symbol，必须有显式过滤配置和测试说明，不能靠缺 manifest 失败。
- 推荐让 `symbolsviewer` 与新的资源现实保持一致，展示全部有普通图且在 paytable 中的非空 symbol。

## 6. apps/reelsviewer 初始化

新增目录：

```text
apps/reelsviewer
```

建议新增文件：

```text
apps/reelsviewer/README.md
apps/reelsviewer/package.json
apps/reelsviewer/index.html
apps/reelsviewer/vite.config.ts
apps/reelsviewer/eslint.config.cjs
apps/reelsviewer/tsconfig.json
apps/reelsviewer/tsconfig.eslint.json
apps/reelsviewer/src/main.ts
apps/reelsviewer/src/styles.css
apps/reelsviewer/src/vite-env.d.ts
apps/reelsviewer/src/assets.ts
apps/reelsviewer/src/reels-config.ts
apps/reelsviewer/src/gmi.ts
apps/reelsviewer/src/reels-demo.ts
apps/reelsviewer/src/ui.ts
apps/reelsviewer/tests/setup.ts
apps/reelsviewer/tests/assets.test.ts
apps/reelsviewer/tests/reels-config.test.ts
apps/reelsviewer/tests/reels-demo.test.ts
apps/reelsviewer/tests/ui.test.ts
```

如果创建空目录，必须放置 `.keepme`；如果目录内已有实际文件，不需要 `.keepme`。

`apps/reelsviewer/package.json` 建议：

```json
{
  "name": "reelsviewer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "prepare:deps": "pnpm --filter @slotclientengine/rendercore build",
    "build": "pnpm run prepare:deps && vite build",
    "dev": "pnpm run prepare:deps && sh -c 'if [ \"$1\" = \"--\" ]; then shift; fi; exec vite \"$@\"' sh",
    "lint": "eslint .",
    "test": "vitest run --coverage",
    "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "@slotclientengine/logiccore": "workspace:*",
    "@slotclientengine/rendercore": "workspace:*",
    "pixi.js": "^8.1.6"
  }
}
```

`vite.config.ts` 参考 `apps/symbolsviewer/vite.config.ts`：

- `base: "./"`
- alias 指向 `../../packages/rendercore/src/index.ts`
- alias 指向 `../../packages/logiccore/src/index.ts`
- server `fs.allow` 包含仓库根目录，允许读取 `assets/`。

### 6.1 GMI 数据处理

浏览器 app 需要可稳定 import 的 GMI 数据。推荐方案：

- 在 `apps/reelsviewer/src/gmi.ts` 中从 `packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json` 导入，或复制为 app-local fixture。
- 如果复制为 app-local fixture，文件名建议：

```text
apps/reelsviewer/src/data/gamemoduleinfo-basic.json
```

- 复制时必须在 README 和任务报告说明来源是 `packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json`。
- 不要改写原始 GMI 内容来适配渲染；如果 scene 与 reels 无法匹配，应修配置或测试，不要改生产逻辑兜底。

推荐运行时计算：

```ts
const gameConfig = createGameConfig(rawGameConfig);
const logic = createGameLogic(rawGmiMessage);
const scene = logic.getStep(0).getScene(0);
const finalYs = gameConfig.getStopYCoordinates({
  reelsName: "reels01",
  sceneName: "step0.scene0",
  scene
});
```

验收时必须确认：

```ts
finalYs === [1, 1, 4, 0, 27]
```

### 6.2 Viewer 交互

第一屏必须是实际 reels 工具：

- Pixi canvas 居中展示 5 轴 5 行 reels。
- 必须有一个可见的 `Spin` 按钮，建议设置 `data-testid="spin-button"`，点击后触发一次完整 spin 操作。
- 顶部或侧边提供最小控制：
  - Spin
  - Reset
  - Speed 或 Duration 可选。
- 显示必要状态时，使用简短状态信息；不要写大段功能说明进 UI。
- 默认启动后可以展示最终 scene 或默认 scene，但点击 Spin 必须完整执行旋转。
- 点击 Spin 时：
  - 如果当前正在旋转，可以禁用按钮或忽略重复点击；不要重入导致状态错乱。
  - 必须在 `apps/reelsviewer` 中读取 viewer 配置、构造 spin plan，再调用 `rendercore` 的 reel set API；不要让 `rendercore` 自己读取 demo 配置。
  - 每轴依次启动。
  - 每轴依次停止。
  - 全部停止后按钮恢复可用。

视觉验收点：

- 5 轴 5 行 cell 尺寸一致。
- 小尺寸图片在 cell 中居中。
- `BN` 位置为空，不渲染任何图。
- 旋转期间非空 symbol 是 `spinBlur` 贴图。
- 停止瞬间每个非空可见 symbol 有 `appear` 弹出效果。
- `appear` 后回到普通图。
- 最终可见 scene 与 GMI step0 scene0 完全一致。

## 7. 测试计划

### 7.1 rendercore tests

新增测试目录：

```text
packages/rendercore/tests/reel
```

建议新增测试：

```text
packages/rendercore/tests/reel/symbol-registry.test.ts
packages/rendercore/tests/reel/layout.test.ts
packages/rendercore/tests/reel/spin-plan.test.ts
packages/rendercore/tests/reel/reel-window.test.ts
packages/rendercore/tests/reel/render-reel.test.ts
packages/rendercore/tests/reel/render-reel-set.test.ts
```

必须覆盖：

- `ReelSymbolRegistry`
  - `BN` 被显式识别为空图标。
  - paytable 中缺少普通图的 symbol 被记录为 missing-asset empty symbol。
  - orphan 图片被记录但不参与渲染。
  - 有普通图的 symbol 缺少必需 `spinBlur` 状态贴图时抛错。
  - 有普通图的 symbol 可以创建 `RenderSymbol`。
  - 空图标 `createRenderSymbolByCode()` 返回 `null`。
  - `getCellSize()` 取非空普通图最大宽高。
  - 没有任何非空普通图时失败。
- `ReelLayout`
  - 5 轴 5 行布局坐标正确。
  - 小图 cell 中心位置稳定。
  - 非法 `visibleRows`、`cellWidth`、`cellHeight`、`reelCount` 失败。
- `createReelSpinPlan`
  - 使用 `finalYs = [1, 1, 4, 0, 27]` 时每轴 `travelSymbols >= 50`。
  - 每轴 `startY` 等于 `reels.normalizeY(x, finalY - travelSymbols)`。
  - 增大 `baseDurationMs` 或 `speedSymbolsPerSecond` 时，未被最小距离夹住的轴 `travelSymbols` 和 `startY` 会变化。
  - 每轴启动时间递增。
  - 每轴停止时间递增。
  - 非法输入 fail-fast。
- `ReelWindow`
  - 给定 y 后，返回的 visible scene 与 `LogicReels.get(x, y + visibleY)` 一致。
  - fractional y 不改变 symbol code 取整规则时，像素 offset 正确。
  - 空图标 slot 不创建 display object。
- `RenderReel`
  - start 后可见非空 symbol 请求 `spinBlur`。
  - landed 后可见非空 symbol 请求 `appear`。
  - `appear` 完成后回到 `normal`。
  - 最终 y 与 `finalY` 一致。
  - start bounce / stop bounce 不改变最终 scene。
- `RenderReelSet`
  - 5 轴按计划依次 start、依次 stop。
  - 完成后 `getVisibleScene()` 与 GMI scene 完全一致。
  - spin 过程中重复 `spin()` 被拒绝或明确失败，不允许重入产生静默错乱。

测试中可以用 `Texture.WHITE` 或构造不同尺寸的 `Texture` 模拟图片尺寸。不要为了测试方便把生产代码改成魔法常量或隐式 fallback。

### 7.2 reelsviewer tests

新增：

```text
apps/reelsviewer/tests/assets.test.ts
apps/reelsviewer/tests/reels-config.test.ts
apps/reelsviewer/tests/reels-demo.test.ts
apps/reelsviewer/tests/ui.test.ts
```

必须覆盖：

- 解析 `game2.json` 后，`BN` 是空图标。
- 从 asset modules 和 manifest 中构建 registry。
- viewer 的 `reels-config.ts` 或等价配置模块持有 `reelsName`、`visibleRows`、`emptySymbols`、spin 时长和速度，不在 `rendercore` 中硬编码。
- `Spin` 按钮或其纯逻辑 handler 会构造一次 spin plan 并调用 `RenderReelSet.spin(plan)`；重复点击 during spinning 不会重入。
- `SC`、`RS`、`X2`、`X5`、`X10` 有普通图时不会因为 manifest 缺状态图而静默 fallback。
- GMI step0 scene0 计算出的 `finalYs` 是 `[1, 1, 4, 0, 27]`。
- 生成的 spin plan 每轴最少 travel 50 个 symbol。
- viewer 默认参数下最终 visible scene 与 GMI scene 一致。

### 7.3 symbolsviewer 回归

因为本任务新增了更多 `assets/symbols/*.png`，必须回归 `apps/symbolsviewer`：

- 如果更新 manifest 让新 symbol 进入展示，修改 `apps/symbolsviewer/tests/symbol-assets.test.ts` 的期望：
  - `displayableSymbols` 应包含 `S00`、`S0`、`S1`、`S5`、`S10`、`SC`、`RS`、`X2`、`X5`、`X10`。
  - `ignoredPaytableSymbolsWithoutAssets` 应只包含 `BN`。
  - `ignoredAssetsWithoutPaytable` 应包含 `CO`、`SX`。
- 如果保留旧展示范围，必须加显式 allowlist，并在 README 说明；不允许靠缺贴图报错来排除新 symbol。

## 8. README 更新要求

### 8.1 packages/rendercore/README.md

新增或更新内容：

- Reel API 入口和示例 import。
- `ReelSymbolRegistry` 如何处理 textured symbol、empty symbol、missing asset symbol。
- cell 尺寸计算规则。
- 如何用 `logiccore` 的 `getStopYCoordinates()` 得到最终停留点。
- 如何用 `createReelSpinPlan()` 反推起点。
- `RenderReelSet` 的基本使用方式。
- 状态流转：
  - spin 中请求 `spinBlur`
  - stop 后请求 `appear`
  - `appear` 完成后回到 `normal`
- `apps/reelsviewer` 的运行命令。
- rendercore 测试命令和 coverage 要求。

### 8.2 apps/reelsviewer/README.md

必须说明：

- app 定位：reel 旋转验证工具。
- 数据来源：
  - `assets/gamecfg/game2.json`
  - `assets/symbols`
  - `packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json` 或 app-local copy。
- 空图标规则：
  - `BN` 是空图标。
  - 缺少普通图的 paytable symbol 为空。
- 状态贴图要求：
  - 有普通图的 symbol 必须有 `spinBlur`。
- 运行命令：

```bash
pnpm --filter reelsviewer dev -- --host 0.0.0.0
```

- 验收点：
  - canvas 非空。
  - 页面上有明确的 `Spin` 按钮，点击后触发一次完整 spin。
  - 一轴一轴启动。
  - 一轴一轴停止。
  - 旋转中是模糊状态。
  - 停止后出现动画。
  - 最终 scene 与 GMI 一致。

### 8.3 apps/symbolsviewer/README.md

如果状态贴图 manifest 扩展到新 symbol，更新当前可展示 symbol 列表和运行说明。

## 9. 验收命令

如果 `pnpm install` 或依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

建议按顺序执行：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter reelsviewer lint
pnpm --filter reelsviewer test
pnpm --filter reelsviewer typecheck
pnpm --filter reelsviewer build
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

还需要检查浏览器运行时不包含 Node 图片处理依赖：

```bash
rg -n "\"sharp\"|from \"sharp\"|node:fs|node:path|generate-symbol-state-textures" packages/rendercore/dist apps/reelsviewer/dist apps/symbolsviewer/dist
```

期望无匹配；`rg` 返回码为 `1` 属于无匹配正常结果。

还需要检查 `rendercore` 没有写死 viewer 的具体资源和操作逻辑：

```bash
rg -n "game2\\.json|assets/symbols|gamemoduleinfo-basic|reels01|spin-button|document\\.createElement|addEventListener" packages/rendercore/src
```

期望无匹配；`rg` 返回码为 `1` 属于无匹配正常结果。

## 10. 浏览器验收

需要启动本地 dev server：

```bash
pnpm --filter reelsviewer dev -- --host 0.0.0.0
```

打开本地页面后验证：

- 首屏是 reels 工具，不是 landing page。
- Pixi canvas 非空。
- 页面上存在明确的 `Spin` 按钮，点击它会触发一次完整 spin。
- 5 轴 5 行布局完整，无文字或 UI 重叠。
- 小图在统一 cell 中居中。
- `BN` 位置为空。
- 点击 Spin 后第 1 到第 5 轴依次启动。
- 旋转期间非空 symbol 使用 `spinBlur`。
- 第 1 到第 5 轴依次停止。
- 停止有回弹力度感。
- 停止后非空可见 symbol 播放 `appear`。
- `appear` 后回到 `normal`。
- 最终 scene 与 GMI step0 scene0 一致。

如果执行环境无法做浏览器验收，任务报告必须明确写“未执行浏览器验收”以及未验证的项目，不能暗示已经做过。

## 11. 任务报告要求

完成后新增：

```text
tasks/22-rendercore-reels-viewer-[utctime].md
```

报告必须是中文，并包含：

- 完成摘要。
- 新增和修改文件列表。
- 新增公开 API 和类型。
- 空图标实现说明。
- cell 最大尺寸计算说明。
- spin plan 参数和最终 `finalYs` / `startYs` / `travelSymbols` 示例。
- viewer 默认配置位置和具体值，包括 `reelsName`、`visibleRows`、`emptySymbols`、动画时长和速度。
- `Spin` 按钮实现位置，以及点击后如何调用 rendercore spin API。
- `rendercore` 未写死 `game2.json`、`assets/symbols`、`reels01`、GMI fixture 或按钮逻辑的检查结果。
- GMI 最终 scene 验证结果。
- rendercore coverage 实际结果，四项必须大于 80%。
- 所有验收命令结果。
- 浏览器验收结果；如果未执行，明确说明。
- 是否更新 `agents.md`；如果未更新，说明原因。
- 已知风险和后续建议。

## 12. agents.md 同步判断

本任务预计不需要更新 `agents.md`，因为它只是新增 `rendercore` reel 能力、一个 app、README、测试和资源。

只有出现以下情况才更新 `agents.md`：

- 新增或改变仓库级协作规则。
- 改变目录约定。
- 改变基础脚本语义。
- 新增必须所有后续任务遵守的 durable 规则。

如果没有这些变化，任务报告中写明“未更新 agents.md，因为未改变仓库级协作规则、目录规范或基础脚本”。

## 13. 实施顺序建议

推荐顺序：

1. 补齐 `assets/symbols` 状态贴图 manifest，确保新普通图不会破坏 `symbolsviewer`。
2. 在 `rendercore` 新增 reel 类型、错误类、registry 和 layout 的纯逻辑测试。
3. 实现 spin plan，并用任务 19 GMI + `game2.json` 建立真实 stopY 测试。
4. 实现 `RenderReel` 和 `RenderReelSet`，补状态流转测试。
5. 新增 `apps/reelsviewer`，先让静态最终 scene 正确，再接入 spin。
6. 更新 README。
7. 跑 package-local 验收。
8. 跑 root 验收。
9. 做浏览器验收。
10. 写任务报告。

过程中如果发现测试要求导致生产代码出现奇怪写法，优先修测试；不要为了测试通过引入不必要兜底或隐藏真实逻辑错误。
