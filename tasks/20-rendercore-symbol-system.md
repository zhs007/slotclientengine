# rendercore symbol system 初始化任务计划

## 1. 任务目标

新增内部渲染核心库 `packages/rendercore`，基于 `PixiJS v8` 和仓库已有的 `@slotclientengine/pixiani` 动画基础设施，优先完成 slot symbol 的状态逻辑、渲染对象和展示验证应用。

本计划是可直接执行版本，不依赖额外上下文。执行者只需要阅读本文件，即可完成项目初始化、核心 API、symbol 状态机、动画接入、`apps/symbolsviewer`、README、测试、验收和任务报告。

核心目标：

- 新增 workspace package：`packages/rendercore`。
- 包名使用 `@slotclientengine/rendercore`。
- `rendercore` 必须是核心渲染库，不是单一 demo 代码；业务 demo 只能放在 `apps/symbolsviewer`。
- `rendercore` 基于 `pixi.js@^8.1.6` 与 `@slotclientengine/pixiani`，并复用仓库现有 pnpm/turbo/vite/vitest/eslint/prettier 工具链。
- 完成 `Symbol` 游戏对象逻辑：
  - symbol 与 paytable entry 关联。
  - 支持可扩展状态定义。
  - 支持默认状态，默认状态只允许是循环或静态状态。
  - 支持状态等价配置。
  - 支持循环、静态、单次三类播放语义。
  - 单次状态播放完成后必须自动回到当前默认状态。
  - 循环状态切换必须等待当前循环动画播放完毕。
  - 静态状态可以立即切换。
  - 静态状态按单帧循环处理，显式帧时长不得小于 `1 / 60` 秒。
- 所有 symbol 状态表现都按 ani 模型实现；静态图也是单帧 ani，不在逻辑里开特殊贴图分支。
- 状态和动画效果不能强绑定：状态机只负责状态语义、状态等价、默认状态和切换规则；具体动画效果必须通过可替换的 animation resolver 注入。同一个状态在不同游戏、不同 symbol 上可以使用不同动画。
- symbol 资源占用必须尽可能小：viewer 默认动画中，同一个 symbol 的默认状态、出现状态和中奖状态复用同一份图片/Texture；默认 `appear` 只对同一个主 `Sprite` 做缩放动画，默认 `win` 只临时叠加轻量扫光对象，不为不同状态复制图片资源。
- 新增前端测试项目 `apps/symbolsviewer`：
  - 依赖 `@slotclientengine/rendercore`。
  - 使用 `assets/gamecfg/game2.json` 的 paytable 配置。
  - 使用 `assets/symbols` 下按 symbol 名命名的图片资源。
  - 只处理“既在 paytable 里、又有图片”的 symbol。
  - 一次性渲染全部可处理图标。
  - 展示 symbol 的普通、旋转模糊、不可用、出现、中奖状态。
  - 所有图标共用一组 viewer 状态序列控制器。
  - 默认自动按几种状态顺序切换；用户可以移除状态、调整状态位置、增加状态并控制播放。
  - 本任务中 `旋转模糊状态` 和 `不可用状态` 均配置为等价于 `普通状态`。
  - `普通状态` 使用默认图。
  - viewer 默认动画 resolver 中，`出现状态` 是单次放大弹动效果，最大缩放约 `1.5`。
  - viewer 默认动画 resolver 中，`中奖状态` 是单次扫光效果。
  - 演示页面只需要考虑 PC 横屏，不需要做复杂移动端适配。
- 新增 `packages/rendercore/README.md`，说明定位、安装依赖、核心 API、状态语义、viewer 用法和测试命令。
- `rendercore` 必须有足够测试用例，Vitest coverage 阈值 lines/functions/branches/statements 均不低于 80%。
- 本任务默认不调整 pixiani；只有确认出现跨 rendercore/reel/winline/特效都可复用的通用 ani primitive 需求时，才做最小必要增量。如果需要破坏性修改或大范围重构，先和需求方沟通，不擅自改架构。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `20-rendercore-symbol-system-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

## 2. 当前仓库事实

当前仓库可确认事实如下：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- `pnpm-workspace.yaml` 已匹配：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- 根级脚本包括：
  - `pnpm build`
  - `pnpm dev`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm format`
  - `pnpm format:check`
- 当前不存在 `packages/rendercore`，本任务需要从零初始化该 package。
- 当前存在 `packages/pixiani`：
  - 包名是 `@slotclientengine/pixiani`。
  - `type` 是 `module`。
  - 当前依赖 `gsap@^3.12.5` 和 `pixi.js@^8.1.6`。
  - 根入口导出 `core`、`layout`、`ani`。
  - `@slotclientengine/pixiani/core` 当前导出 `VisualEntity`、`ObjectPool`、`EntityManager`。
  - `packages/pixiani/src/ani/index.ts` 当前基本为空导出，尚未提供通用 ani clip。
  - `packages/pixiani/README.md` 说明 `src/ani` 是后续动画实体聚合入口。
- 当前存在 `packages/logiccore`：
  - 包名是 `@slotclientengine/logiccore`。
  - 已有 `createGameConfig(rawJson)`，可严格解析 `apps/gengameconfig` 输出的 `paytable`、`symbolCodes`、`reels` JSON。
  - 已有 `GameConfigPaytableEntry` 等类型。
  - `logiccore` 对未知 code、空 reels、空轴、symbol 映射不匹配等情况会抛 `LogicParseError`，不做兜底。
- 当前 `assets/gamecfg/game2.json` 的 paytable symbol 包含：
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
- 当前 `assets/symbols` 下已有图片：
  - `S00.png`
  - `S0.png`
  - `S1.png`
  - `S5.png`
  - `S10.png`
  - `SX.png`
- 因此当前资源与配置并非完全一一对应：
  - paytable 中有图的 symbol 是 `S00`、`S0`、`S1`、`S5`、`S10`。
  - paytable 中缺图的 symbol 是 `BN`、`SC`、`RS`、`X2`、`X5`、`X10`。
  - 图片中不在 paytable 的孤儿资源是 `SX.png`。
- 本任务只处理 paytable 与图片资源的交集，即 `S00`、`S0`、`S1`、`S5`、`S10`。
- `apps/symbolsviewer` 不需要展示缺图 symbol 或孤儿图片，也不需要做复杂适配逻辑；但不能把缺图 symbol 静默替换成其它图片。
- 根目录协作文件实际路径是 `agents.md`。只有当本任务改变仓库级协作规则、目录规范或基础脚本时，才需要同步更新 `agents.md`。
- 如果执行 `pnpm install` 或依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

## 3. 术语定义

### 3.1 paytable entry

`paytable entry` 来自 `assets/gamecfg/game2.json`，字段至少包括：

```ts
interface GameConfigPaytableEntry {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
}
```

`rendercore` 的 symbol 对象必须保留 paytable 关联，至少能读取：

- `code`
- `symbol`
- `pays`

不要只保存贴图路径而丢掉 paytable 信息。

### 3.2 symbol 状态

本任务固定初始状态集合如下，后续可以继续增加：

| 状态 id | 中文含义 | 状态类别 | 播放方式 | symbolsviewer 默认动画 |
| --- | --- | --- | --- | --- |
| `normal` | 普通状态 | 稳定态 | 循环或静态 | 默认图，静态单帧 ani |
| `spinBlur` | 旋转模糊状态 | 稳定态 | 循环或静态 | 在 viewer 中等价于 `normal` |
| `disabled` | 不可用状态 | 稳定态 | 循环或静态 | 在 viewer 中等价于 `normal` |
| `appear` | 出现状态 | 单次态 | 单次 | 放大到约 `1.5` 再弹回 |
| `win` | 中奖状态 | 单次态 | 单次 | 光从图标上扫过一次 |

状态类别：

- `stable`：可长期停留的状态，包括循环和静态。
- `once`：单次状态，不允许长时间停留。

播放方式：

- `loop`：循环动画。
- `static`：静态单帧循环，是 `loop` 的特例。
- `once`：只播放一次。

注意：

- 状态定义只描述语义和播放类别，不描述具体视觉效果。
- `appear` 不天然等于“放大弹一下”，`win` 也不天然等于“扫光”；这些只是 `apps/symbolsviewer` 的默认动画 resolver。
- 后续游戏可以把同一个 `appear` 状态实现为淡入、翻牌、粒子或其它效果，只要它满足 `once` 播放语义。

### 3.3 默认状态

每个 symbol 都有当前默认状态：

- 初始默认状态建议为 `normal`。
- 默认状态只允许设置为 `stable` 状态。
- 如果调用方试图把 `appear`、`win` 或其它单次状态设为默认状态，必须抛错。
- 单次状态播放完成后，必须切换到当时的当前默认状态。
- 如果单次状态播放期间调用方修改了默认状态，单次播放结束时应回到新的当前默认状态，而不是进入单次开始时的旧默认状态。

### 3.4 状态等价

状态等价用于把一个状态映射到另一个可等价状态。例如：

```ts
{
  spinBlur: "normal",
  disabled: "normal"
}
```

规则：

- 等价目标必须存在。
- `stable` 状态只允许等价为另一个 `stable` 状态。
- `once` 状态只允许等价为另一个 `once` 状态。
- 不允许等价链出现环。例如 `a -> b` 且 `b -> a` 必须抛错。
- 不允许把未知状态当成 noop。
- 解析等价状态时可以支持多级链，但最终必须得到一个明确状态。
- `apps/symbolsviewer` 本任务配置：
  - `spinBlur` 等价为 `normal`。
  - `disabled` 等价为 `normal`。
  - `appear` 不等价。
  - `win` 不等价。

## 4. rendercore 包初始化

新增目录：

```text
packages/rendercore
```

建议新增文件：

```text
packages/rendercore/package.json
packages/rendercore/tsconfig.json
packages/rendercore/tsconfig.build.json
packages/rendercore/tsconfig.eslint.json
packages/rendercore/vite.config.ts
packages/rendercore/eslint.config.cjs
packages/rendercore/README.md
packages/rendercore/src/index.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/errors.ts
packages/rendercore/src/symbol/state-machine.ts
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/symbol/animation-resolver.ts
packages/rendercore/src/symbol/sequence.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/tests/setup.ts
packages/rendercore/tests/symbol/state-machine.test.ts
packages/rendercore/tests/symbol/ani.test.ts
packages/rendercore/tests/symbol/animation-resolver.test.ts
packages/rendercore/tests/symbol/sequence.test.ts
packages/rendercore/tests/symbol/catalog.test.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
```

如果创建空目录，必须放置 `.keepme`。如果目录内已有实际文件，不需要额外 `.keepme`。

### 4.1 package.json 要求

`packages/rendercore/package.json` 建议使用 ESM，与 `pixiani` 保持一致：

```json
{
  "name": "@slotclientengine/rendercore",
  "version": "0.1.0",
  "private": true,
  "description": "Internal PixiJS render core for slotclientengine.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./symbol": {
      "types": "./dist/symbol/index.d.ts",
      "import": "./dist/symbol/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "lint": "eslint .",
    "test": "vitest run --coverage",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "@slotclientengine/logiccore": "workspace:*",
    "@slotclientengine/pixiani": "workspace:*",
    "gsap": "^3.12.5",
    "pixi.js": "^8.1.6"
  },
  "devDependencies": {
    "@eslint/js": "^9.34.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^4.0.0",
    "eslint-config-prettier": "^9.1.0",
    "globals": "^15.15.0"
  }
}
```

说明：

- `pixi.js` 是运行时直接 import 的库，应作为直接依赖。
- `gsap` 如果只通过 `pixiani` 间接使用，可以不直接依赖；如果 `rendercore` 的 appear/win ani 直接 import `gsap`，则必须直接依赖。
- `@slotclientengine/logiccore` 用于复用 paytable 类型和 `createGameConfig` 解析契约。
- 不要从 `@slotclientengine/logiccore/node` 导入 Node-only 能力。
- 顶层入口必须 browser-safe，不得 import `node:fs`、`node:path`、`process`、`Buffer` 等 Node-only API。

### 4.2 TypeScript 与 Vitest 要求

`tsconfig.json`、`tsconfig.build.json`、`tsconfig.eslint.json` 可参考 `packages/pixiani`，但 coverage 阈值必须是 80%：

```ts
coverage: {
  provider: "v8",
  reporter: ["text", "html", "json"],
  exclude: [
    "src/index.ts",
    "src/symbol/index.ts",
    "vite.config.ts",
    "eslint.config.cjs",
    "tests/setup.ts"
  ],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80
  }
}
```

不要为了覆盖率写奇怪生产代码。如果测试推动了不自然实现，应优先调整测试结构或拆出纯逻辑模块，而不是污染核心代码。

## 5. rendercore 公开 API 建议

### 5.1 类型

建议公开以下类型，执行者可以按实现细节微调命名，但语义必须保持：

```ts
import type { Container, Sprite, Texture } from "pixi.js";

export type SymbolStateId = string;

export type SymbolStatePhase = "stable" | "once";

export type SymbolPlaybackKind = "loop" | "static" | "once";

export interface SymbolStateDefinition {
  readonly id: SymbolStateId;
  readonly phase: SymbolStatePhase;
  readonly playback: SymbolPlaybackKind;
  readonly frameDurationSeconds?: number;
}

export interface SymbolStateEquivalence {
  readonly from: SymbolStateId;
  readonly to: SymbolStateId;
}

export interface SymbolStatePreset {
  readonly defaultState: SymbolStateId;
  readonly states: readonly SymbolStateDefinition[];
  readonly equivalences?: readonly SymbolStateEquivalence[];
}

export interface SymbolDefinition {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly defaultState: SymbolStateId;
  readonly states: readonly SymbolStateDefinition[];
  readonly equivalences?: readonly SymbolStateEquivalence[];
}

export interface SymbolStateSnapshot {
  readonly requestedState: SymbolStateId;
  readonly resolvedState: SymbolStateId;
  readonly defaultState: SymbolStateId;
  readonly pendingState: SymbolStateId | null;
  readonly isOnce: boolean;
}

export interface SymbolSequenceStep {
  readonly state: SymbolStateId;
  readonly holdSeconds?: number;
}

export interface SymbolSequenceUpdateInput {
  readonly deltaSeconds: number;
  readonly onceCompleted?: boolean;
}

export interface SymbolSequenceUpdateResult {
  readonly shouldRequestState: boolean;
  readonly state: SymbolStateId;
  readonly currentIndex: number;
}

export interface SymbolStateSequenceControllerOptions {
  readonly statePreset: SymbolStatePreset;
  readonly steps: readonly SymbolSequenceStep[];
  readonly autoplay?: boolean;
}

export interface RenderSymbolUpdateResult {
  readonly requestedState: SymbolStateId;
  readonly resolvedState: SymbolStateId;
  readonly loopCompleted: boolean;
  readonly onceCompleted: boolean;
  readonly stateChanged: boolean;
}
```

### 5.2 纯逻辑状态机

必须把状态切换逻辑拆成可单测的纯逻辑类，避免所有测试都依赖真实 Pixi 渲染：

```ts
export class SymbolStateMachine {
  constructor(definition: SymbolDefinition);
  getSnapshot(): SymbolStateSnapshot;
  setDefaultState(state: SymbolStateId): void;
  requestState(state: SymbolStateId): void;
  notifyLoopComplete(): void;
  notifyOnceComplete(): void;
  canSwitchImmediately(): boolean;
}
```

语义要求：

- 构造时严格校验所有状态定义。
- 缺少默认状态必须抛错。
- 默认状态不是 `stable` 必须抛错。
- 状态 id 重复必须抛错。
- `playback: "once"` 必须对应 `phase: "once"`。
- `playback: "loop"` 或 `playback: "static"` 必须对应 `phase: "stable"`。
- 显式 `frameDurationSeconds` 小于 `1 / 60` 必须抛错。
- 未显式设置 `frameDurationSeconds` 时，可以按 `1 / 60` 秒作为默认帧时长。
- 请求未知状态必须抛错。
- 当前状态是 `static` 时，请求状态立即切换。
- 当前状态是 `loop` 时，请求状态进入 pending，等待当前 loop 完成后切换。
- 当前状态是 `once` 时，不长期停留；播放完成后必须回到当前默认状态。
- 如果 `loop` 或 `once` 期间收到多个请求，保留最后一次请求作为 pending，避免执行过时状态。
- `notifyLoopComplete()` 只在动画层确认当前 loop 已完成时调用。
- `notifyOnceComplete()` 只在动画层确认当前 once 已完成时调用。

### 5.3 ani 层

`rendercore` 的 symbol 表现都必须走 ani 模型：

- `static`：单帧循环 ani。
- `loop`：多帧循环 ani。
- `once`：单次 ani。

建议抽象：

```ts
export interface SymbolAni {
  readonly stateId: SymbolStateId;
  readonly playback: SymbolPlaybackKind;
  reset(): void;
  update(deltaSeconds: number): SymbolAniUpdateResult;
}

export interface SymbolAniUpdateResult {
  readonly loopCompleted: boolean;
  readonly onceCompleted: boolean;
}

export interface SymbolAnimationContext {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly requestedState: SymbolStateId;
  readonly resolvedState: SymbolStateId;
  readonly state: SymbolStateDefinition;
  readonly texture: Texture;
  readonly root: Container;
  readonly sprite: Sprite;
  readonly overlayLayer: Container;
}

export type SymbolAniFactory = (context: SymbolAnimationContext) => SymbolAni;

export type SymbolAnimationResolver = (context: SymbolAnimationContext) => SymbolAni;
```

实现要求：

- ani 的时间推进由外部 ticker 调用 `update(deltaSeconds)` 驱动。
- `deltaSeconds` 必须是有限非负数，否则抛错。
- 单次 ani 到达结尾后只能上报完成，不允许无限停留在单次状态。
- 循环 ani 每完成一次循环必须能上报 `loopCompleted`，用于状态机切换。
- `loopCompleted` 和 `onceCompleted` 必须是本次 `update` 产生的边沿事件，不能在完成后每一帧都持续返回 `true`。
- 静态 ani 是单帧循环，可以立即认为处于可切换边界。
- 不要用 `setTimeout` / `setInterval` 驱动核心状态机；时间必须由调用方显式推进，便于测试和游戏主循环统一。
- animation resolver 必须是可注入的，不能在 `SymbolStateMachine` 或 `RenderSymbol` 中把 `stateId` 和具体视觉效果写死。
- resolver 可以按游戏、symbol code、symbol name、requested state、resolved state 返回不同 ani。
- `resolvedState` 相同不代表动画必须相同；例如两个游戏都使用 `win` 状态，一个可以扫光，另一个可以跳动或粒子。
- resolver context 必须包含主 `Sprite`、稳定根 `Container` 和临时 `overlayLayer`，否则默认 `appear` / `win` 动画无法实现。
- animation resolver 可以在内部委托给 ani factory 或 factory map，但公开边界必须返回可运行的 `SymbolAni`。
- 如果 resolver 找不到当前 `resolvedState` 对应的 ani，必须抛错，不允许静默退回 `normal`。
- viewer 默认 resolver 可以内置 `normal` 静态、`appear` 放大弹动、`win` 扫光；这只是 demo preset，不是状态系统硬规则。

### 5.4 全局状态序列

为 `apps/symbolsviewer` 和后续批量 symbol 控制提供一个轻量的全局状态序列控制器。它不替代每个 `RenderSymbol` 内部状态机，而是负责统一决定“下一步请求哪个状态”，再把请求广播给全部 symbol。

建议 API：

```ts
export class SymbolStateSequenceController {
  constructor(options: SymbolStateSequenceControllerOptions);
  getSteps(): readonly SymbolSequenceStep[];
  getCurrentIndex(): number;
  getCurrentStep(): SymbolSequenceStep;
  play(): void;
  pause(): void;
  reset(): void;
  next(): SymbolSequenceStep;
  addStep(step: SymbolSequenceStep, index?: number): void;
  removeStep(index: number): void;
  moveStep(fromIndex: number, toIndex: number): void;
  update(input: SymbolSequenceUpdateInput): SymbolSequenceUpdateResult;
}
```

语义要求：

- 序列不能为空。
- 序列 step 的 `state` 必须存在于 preset/state definitions。
- `stable` 状态使用 `holdSeconds` 控制停留时长。
- `once` 状态不依赖 `holdSeconds` 长期停留；viewer 收集全部已展示 `RenderSymbol.update()` 的 `onceCompleted` 后，通过 `SymbolSequenceUpdateInput.onceCompleted` 通知序列推进。
- 增加、移除、重排必须保持 current index 有效。
- `update(input)` 不直接操作 Pixi；只返回是否应切换到某个状态，viewer 再广播给全部 `RenderSymbol`。
- 不使用 timer，由 viewer ticker 显式推进。
- viewer 层只有一组全局状态序列控制器；每个 `RenderSymbol` 内部仍可有自己的 `SymbolStateMachine` 实例用于执行同一套状态规则和动画完成通知。不要给单个图标做独立的 viewer 序列配置。

### 5.5 RenderSymbol

建议提供 Pixi 渲染对象：

```ts
export interface RenderSymbolOptions {
  readonly definition: SymbolDefinition;
  readonly texture: Texture;
  readonly animationResolver: SymbolAnimationResolver;
}

export class RenderSymbol extends Container {
  constructor(options: RenderSymbolOptions);
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  getStateSnapshot(): SymbolStateSnapshot;
  setDefaultState(state: SymbolStateId): void;
  requestState(state: SymbolStateId): void;
  update(deltaSeconds: number): RenderSymbolUpdateResult;
  reset(): void;
}
```

`RenderSymbol` 要求：

- 必须保留 paytable 关联信息。
- 不应自己创建 Pixi Application；只作为可加入任意 stage/container 的对象。
- 不应从磁盘加载图片；贴图或图片 URL 解析应由上层 asset loader 完成后传入。
- 同一个 `RenderSymbol` 只持有一个主 `Sprite` 和一份共享 `Texture` 引用，不为 `normal`、`appear`、`win` 等状态复制 texture。
- 多个同名 symbol 实例如果使用同一张图，应共享同一个 Pixi `Texture` 对象引用。
- 必须通过 `SymbolAnimationResolver` 获取当前状态的 `SymbolAni`，不能把 `appear`、`win`、`normal` 等状态 id 和具体动画效果硬编码在状态机里。
- 可以提供 viewer 默认 resolver，但 `RenderSymbolOptions` 必须允许调用方覆盖 resolver。
- 同一个状态 id 在不同 `RenderSymbol` 实例上可以解析到不同 `SymbolAni`。
- 对外暴露 `update(deltaSeconds)`，由 app 或游戏主循环调用，并返回 `RenderSymbolUpdateResult`。
- `RenderSymbolUpdateResult.onceCompleted` 必须能用于 viewer 判断“全部图标本轮 once 状态都播放完成”。
- `RenderSymbolUpdateResult.onceCompleted` 和 `loopCompleted` 必须是本次 `update` 的边沿事件，避免 viewer 状态序列连续跳过多个步骤。
- 每次状态切换必须重置当前 ani，避免上一状态残留 scale、alpha、mask、filter、overlay。
- 单次 `appear` 只对主 `Sprite` 或其稳定父容器做 scale 动画，结束后 scale 必须回到正常值。
- 单次 `win` 只临时叠加扫光 overlay/mask/filter，结束后必须清理或复位，不能污染后续普通状态。
- 资源缺失、状态缺失、`SymbolAni` 缺失都必须抛错，不允许静默显示空白或默认图。

## 6. pixiani 增量策略

基于本任务的最小资源占用设计，默认不需要调整 `packages/pixiani`。`rendercore` 应优先用共享 Texture、单主 Sprite、手动 `update(deltaSeconds)` 和临时扫光 overlay 在自身包内完成 symbol 行为。

`rendercore` 仍应基于 `@slotclientengine/pixiani`，但不要因为本任务先行扩展 pixiani 架构。执行顺序如下：

1. 先用 `pixiani/core` 的 `VisualEntity`、`ObjectPool`、`EntityManager` 作为生命周期与对象管理基础。
2. 先在 `rendercore` 内实现 symbol animation resolver 和默认 demo ani，不把 paytable、symbol 状态、扫光、弹动等业务概念放入 pixiani。
3. 只有当执行过程中确认 `rendercore`、后续 reel、winline、特效对象都会复用同一种“可手动推进的 ani clip/clock”抽象时，才允许在 `packages/pixiani/src/ani` 增加小而稳定的通用能力，例如：

```text
packages/pixiani/src/ani/types.ts
packages/pixiani/src/ani/frame-clock.ts
packages/pixiani/src/ani/index.ts
packages/pixiani/tests/ani/frame-clock.test.ts
```

4. pixiani 增量只做可复用基础设施，不放 rendercore 的 paytable、symbol 状态、slot 业务逻辑。
5. 如果修改 pixiani，需要同步：
   - `packages/pixiani/README.md`
   - pixiani 相关测试
   - pixiani 验收命令
6. 如果必须改变 `VisualEntity`、`ObjectPool`、`EntityManager` 的现有公开语义，先暂停并沟通，不在本任务里擅自破坏已有 demo。

## 7. symbol catalog 与资源校验

新增 catalog 能力，用于把 game config paytable 和图片资源关联起来。本任务只把“paytable 中存在且图片资源也存在”的 symbol 视为可处理 symbol。

建议 API：

```ts
export interface SymbolAssetMap {
  readonly [symbol: string]: Texture | string;
}

export interface SymbolCatalogValidation {
  readonly displayableSymbols: readonly string[];
  readonly ignoredPaytableSymbolsWithoutAssets: readonly string[];
  readonly ignoredAssetsWithoutPaytable: readonly string[];
}

export function createSymbolCatalog(options: {
  readonly gameConfig: LogicGameConfig;
  readonly assets: SymbolAssetMap;
  readonly statePreset?: SymbolStatePreset;
  readonly animationResolver?: SymbolAnimationResolver;
}): SymbolCatalog;
```

要求：

- `createSymbolCatalog` 必须基于 paytable entries 生成 symbol definition。
- paytable symbol 与图片资源按 symbol 名精确匹配，不做大小写模糊匹配。
- catalog 的主输出只包含 `displayableSymbols`，即 paytable 与图片资源的交集。
- 请求创建某个不在 `displayableSymbols` 内的 symbol 必须抛错，不能静默替换成其它图。
- catalog 可以接收默认 animation resolver，并在创建 `RenderSymbol` 时传入；调用方也可以在创建具体 symbol 时覆盖 resolver。
- catalog 不应把状态 id 和动画效果绑定在 symbol definition 里。
- catalog 可以提供 validation summary，供测试和报告使用：
  - `displayableSymbols`
  - `ignoredPaytableSymbolsWithoutAssets`
  - `ignoredAssetsWithoutPaytable`
- `apps/symbolsviewer` 只实例化并展示 `displayableSymbols`，不需要在主界面展示缺图 symbol 或孤儿图片。
- 当前仓库数据下，`displayableSymbols` 必须精确包含：
  - `S00`
  - `S0`
  - `S1`
  - `S5`
  - `S10`
- 当前仓库数据下，`ignoredPaytableSymbolsWithoutAssets` 应包含：
  - `BN`
  - `SC`
  - `RS`
  - `X2`
  - `X5`
  - `X10`
- 当前仓库数据下，`ignoredAssetsWithoutPaytable` 应包含：
  - `SX`
- `ignoredPaytableSymbolsWithoutAssets` 和 `ignoredAssetsWithoutPaytable` 是明确忽略列表，不是兜底资源列表；执行者不要为这些 symbol 创建默认贴图。

## 8. 初始状态与默认动画 preset

为 viewer 和后续游戏模板提供一个明确的初始状态 preset，同时提供一个可替换的默认动画 resolver。状态语义和动画效果必须分开配置，不要把具体动画写进状态定义。

建议新增：

```ts
export function createDefaultSymbolStatePreset(): SymbolStatePreset;
export function createDefaultSymbolAnimationResolver(): SymbolAnimationResolver;
```

### 8.1 状态 preset 语义

- `normal`
  - `phase: "stable"`
  - `playback: "static"`
  - `frameDurationSeconds: 1 / 60`
- `spinBlur`
  - `phase: "stable"`
  - `playback: "static"`
  - 等价到 `normal`。
- `disabled`
  - `phase: "stable"`
  - `playback: "static"`
  - 等价到 `normal`。
- `appear`
  - `phase: "once"`
  - `playback: "once"`
- `win`
  - `phase: "once"`
  - `playback: "once"`

### 8.2 symbolsviewer 默认动画 resolver

`createDefaultSymbolAnimationResolver()` 只提供 viewer 默认表现：

- `normal`：使用 symbol 默认贴图的静态单帧 ani。
- `spinBlur`：由于状态等价到 `normal`，默认使用 `normal` 的静态单帧 ani。
- `disabled`：由于状态等价到 `normal`，默认使用 `normal` 的静态单帧 ani。
- `appear`：
  - 建议时长 `0.35` 到 `0.5` 秒。
  - 默认效果：scale `1 -> 1.5 -> 1`，可使用 ease/back/弹性曲线，但结束值必须严格复位。
- `win`：
  - 建议时长 `0.6` 到 `0.9` 秒。
  - 默认效果：一个高亮条或渐变光从图标左侧扫到右侧，结束后清理。

要求：

- 这些动画只是 viewer 默认映射，不是状态 id 的固定含义。
- 调用方必须能为任意状态注入不同动画 resolver。
- 调用方必须能按 symbol 覆盖动画。例如同为 `win` 状态，`S00` 可以扫光，`S10` 可以跳动，状态机语义不应变化。

注意：

- `spinBlur` 和 `disabled` 本任务只是等价到 `normal`，不要额外做模糊滤镜或灰度滤镜。
- 后续要增加真实模糊/不可用动画时，应通过替换 animation resolver 或调整等价配置完成，不改状态机语义。

## 9. apps/symbolsviewer

新增前端测试项目：

```text
apps/symbolsviewer
```

建议新增文件：

```text
apps/symbolsviewer/package.json
apps/symbolsviewer/index.html
apps/symbolsviewer/tsconfig.json
apps/symbolsviewer/tsconfig.eslint.json
apps/symbolsviewer/vite.config.ts
apps/symbolsviewer/eslint.config.cjs
apps/symbolsviewer/README.md
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/src/styles.css
apps/symbolsviewer/src/vite-env.d.ts
apps/symbolsviewer/tests/setup.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
```

### 9.1 package.json

建议 package 名称：

```json
{
  "name": "symbolsviewer",
  "private": true,
  "type": "module",
  "dependencies": {
    "@slotclientengine/logiccore": "workspace:*",
    "@slotclientengine/rendercore": "workspace:*",
    "pixi.js": "^8.1.6"
  }
}
```

脚本对齐其它 apps：

```json
{
  "scripts": {
    "build": "vite build",
    "dev": "vite",
    "lint": "eslint .",
    "test": "vitest run --coverage",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### 9.2 资源加载

`symbolsviewer` 必须直接使用根目录资产：

- `assets/gamecfg/game2.json`
- `assets/symbols/*.png`

建议实现方式：

```ts
import game2Config from "../../../assets/gamecfg/game2.json";

const symbolAssetUrls = import.meta.glob("../../../assets/symbols/*.png", {
  eager: true,
  query: "?url",
  import: "default"
});
```

如果 Vite dev server 因访问 workspace 根资产受限，需要在 `apps/symbolsviewer/vite.config.ts` 里明确允许 workspace 根目录，例如使用 Vite 的 `server.fs.allow`。不要复制资产到 app 目录来规避问题，除非需求方明确同意。

### 9.3 界面要求

第一屏必须是可用的 symbol 状态展示工具，不做营销落地页。

建议 UI：

- 顶部紧凑工具栏，面向 PC 横屏：
  - 播放 / 暂停。
  - 下一状态。
  - reset。
  - 当前默认状态选择，仅允许选择 `stable` 状态。
  - 当前全局状态序列概览。
- 全局状态序列编辑区：
  - 所有图标共用一组状态序列控制器。
  - 默认序列建议为 `normal -> appear -> win -> spinBlur -> disabled`。
  - 用户可以从候选状态 `normal`、`spinBlur`、`disabled`、`appear`、`win` 中增加状态。
  - 用户可以移除序列中的状态。
  - 用户可以调整状态顺序。
  - 对于 `stable` 状态，允许配置停留时长，例如 `0.5s`、`1s`。
  - 对于 `once` 状态，等待单次动画完成后自动进入下一步，不允许长期停留。
  - 序列播放时，由全局控制器对全部已展示图标同时发起状态切换。
- 中间 Pixi canvas：
  - 网格展示所有 `displayableSymbols`。
  - 每个格子显示 symbol 图片和简短 symbol 名。
  - 默认一次性渲染全部可处理图标，不需要单图标筛选页。
- 侧边或底部状态面板：
  - 显示全局序列当前 index、当前状态、播放/暂停状态。
  - 显示每个图标当前 requested/resolved/default/pending 状态的紧凑列表。

界面约束：

- 不要用大 hero 区或营销文案。
- 不要用解释性长段落占据主界面。
- 只需要考虑 PC 横屏，建议以 `1280x720` 及以上视口为主。
- icon/state 控制应紧凑、清晰，按钮文本不要溢出。
- canvas 必须非空渲染，默认展示至少 `S00`、`S0`、`S1`、`S5`、`S10`。
- 不需要做复杂移动端适配。

### 9.4 viewer 验证点

浏览器验收时必须确认：

- 默认打开页面后，Pixi canvas 非空。
- `S00`、`S0`、`S1`、`S5`、`S10` 一次性全部可见。
- 默认状态序列会自动驱动全部图标按顺序切换。
- 序列运行到 `spinBlur` 时，状态面板显示 requested 是 `spinBlur`，resolved 是 `normal`。
- 序列运行到 `disabled` 时，状态面板显示 requested 是 `disabled`，resolved 是 `normal`。
- 序列运行到 `appear` 时，viewer 默认动画 resolver 让全部图标有放大弹回效果，结束后进入序列下一步或回到当前默认状态。
- 序列运行到 `win` 时，viewer 默认动画 resolver 让全部图标有扫光效果，结束后进入序列下一步或回到当前默认状态。
- 用户可以移除一个状态，播放序列不再进入该状态。
- 用户可以调整状态位置，播放顺序按调整后的序列执行。
- 用户可以增加一个状态，播放序列能进入新增状态。
- 将默认状态改为另一个 `stable` 状态后，单次状态结束回到新的默认状态。
- PC 横屏视口下界面无明显重叠。

## 10. 测试计划

### 10.1 rendercore 测试

`packages/rendercore` 至少覆盖以下用例：

#### 状态定义校验

- 正常状态集合可以构造成功。
- 缺少默认状态抛错。
- 默认状态不存在抛错。
- 默认状态是 `once` 抛错。
- 状态 id 重复抛错。
- `phase` 与 `playback` 不匹配抛错。
- 显式 `frameDurationSeconds < 1 / 60` 抛错。
- `frameDurationSeconds` 为 `0`、负数、`NaN`、`Infinity` 抛错。

#### 状态等价

- `spinBlur -> normal` 能正确 resolved。
- `disabled -> normal` 能正确 resolved。
- 未知等价目标抛错。
- `stable -> once` 抛错。
- `once -> stable` 抛错。
- 等价环抛错。
- 多级等价链能解析到最终状态。

#### 状态切换

- 静态状态下请求其它状态立即切换。
- 循环状态下请求其它状态不会立即切换。
- 循环状态收到 `notifyLoopComplete()` 后切换到 pending 状态。
- 循环期间多次请求只保留最后一次 pending。
- 单次状态播放完成后回到当前默认状态。
- 单次状态播放期间修改默认状态，完成后回到新默认状态。
- 单次状态播放期间多次请求不会导致状态机长时间停留在单次状态。
- 请求未知状态抛错。

#### ani 时间推进

- `deltaSeconds` 非有限数或负数抛错。
- 静态单帧 ani 可以更新且不会丢帧。
- 循环多帧 ani 能在完整循环后上报 `loopCompleted`。
- 单次 ani 能在时长结束后上报 `onceCompleted`。
- `loopCompleted` 和 `onceCompleted` 只在完成发生的那次 `update` 为 `true`，后续帧不能持续为 `true`。
- 大 `deltaSeconds` 跨过多个帧时结果稳定。

#### animation resolver

- 状态定义不包含具体动画效果。
- 默认 resolver 能为 viewer 的 `normal`、`appear`、`win` 返回对应 `SymbolAni`。
- 自定义 resolver 能让同一个 `win` 状态在不同 symbol 上返回不同 `SymbolAni`。
- 自定义 resolver 能让不同游戏复用同一状态机定义但替换全部动画效果。
- resolver 找不到当前状态对应 `SymbolAni` 时抛错。
- 状态等价后，resolver 能收到 requested state 和 resolved state，便于调用方自行决定按哪个维度选动画。

#### catalog 与资源

- 能从 `createGameConfig(game2Config)` 和资产 map 生成 catalog。
- 当前仓库资产下，`displayableSymbols` 精确包含 `S00`、`S0`、`S1`、`S5`、`S10`。
- 当前仓库资产下，`ignoredPaytableSymbolsWithoutAssets` 包含 `BN`、`SC`、`RS`、`X2`、`X5`、`X10`。
- 当前仓库资产下，`ignoredAssetsWithoutPaytable` 包含 `SX`。
- 请求创建不在 `displayableSymbols` 内的 symbol 抛错。
- paytable 信息在 symbol definition 和 `RenderSymbol` 上可读。

#### RenderSymbol

- 构造后默认状态是 `normal`。
- 同一个 `RenderSymbol` 的 `normal`、`appear`、`win` 复用同一个主 `Sprite`/Texture 引用，不创建状态专属 texture。
- `RenderSymbol` 使用注入的 animation resolver 创建 ani。
- 两个 symbol 请求同一个状态时，可以通过不同 resolver 或同一 resolver 的 symbol 分支得到不同动画。
- `RenderSymbol.update(deltaSeconds)` 返回 `RenderSymbolUpdateResult`，并能在单次状态完成时上报 `onceCompleted: true`。
- `RenderSymbolUpdateResult.onceCompleted` 和 `loopCompleted` 只表示本次更新发生的完成事件，不是持久状态。
- `requestState("spinBlur")` resolved 到 `normal`。
- `requestState("disabled")` resolved 到 `normal`。
- `appear` 完成后 scale 复位。
- `win` 完成后扫光对象或 mask/filter 复位。
- `reset()` 清理 pending 状态、临时效果和显示变换。

#### 全局状态序列

- 默认序列可以按配置顺序输出下一个状态。
- 移除状态后，序列不会再进入该状态。
- 调整状态位置后，播放顺序随之变化。
- 增加状态后，序列能进入新增状态。
- `stable` 状态按配置停留时长推进。
- `once` 状态在 `onceCompleted` 为 `false` 时不推进。
- `once` 状态在 viewer 汇总全部 `RenderSymbolUpdateResult.onceCompleted` 后推进。
- 全局序列控制器对全部 `RenderSymbol` 同步发起状态切换。

### 10.2 pixiani 测试

只有修改 `packages/pixiani` 时才新增或更新 pixiani 测试。至少覆盖：

- 新增 ani clock 或 frame helper 的帧推进。
- 最小帧时长校验。
- loop/once 完成事件或返回值。
- 现有 `VisualEntity`、`ObjectPool`、`EntityManager` 测试不回退。

### 10.3 symbolsviewer 测试

`apps/symbolsviewer` 至少覆盖：

- game2 JSON 能被 `createGameConfig` 解析。
- `assets/symbols` glob 结果能转换成 symbol asset map。
- viewer 只把 paytable 与图片资源的交集加入 displayable list。
- viewer 默认状态序列包含几种初始状态，且支持增加、移除、重排后的数据更新。
- 不允许孤儿资源或缺图资源被加入 displayable list。

## 11. README 要求

新增 `packages/rendercore/README.md`，必须包含：

- 包定位：
  - `rendercore` 是 slot 前端渲染核心库。
  - `symbolsviewer` 才是调试 app。
- 依赖边界：
  - 基于 `pixi.js v8`。
  - 基于 `@slotclientengine/pixiani`。
  - 复用 `@slotclientengine/logiccore` 的 game config/paytable 契约。
- Symbol 模型：
  - paytable 关联。
  - shared Texture / 单主 Sprite 资源模型。
  - 状态语义与动画效果解耦。
  - animation resolver / `SymbolAni` 注入方式。
  - 默认状态。
  - `stable` / `once`。
  - `loop` / `static` / `once`。
  - 状态等价。
  - 单次状态完成回默认状态。
  - 循环状态切换等待 loop 边界。
- 示例代码：
  - 从 `createGameConfig` 创建 config。
  - 创建 catalog。
  - 注入默认或自定义 animation resolver。
  - 创建 `RenderSymbol`。
  - 在 ticker 中调用 `update(deltaSeconds)`。
  - 触发 `appear` 和 `win`。
  - 示例说明同一个状态在不同 symbol 上使用不同动画的写法。
- 错误策略：
  - 请求创建不可展示 symbol、未知状态、非法默认状态、等价非法都抛错。
  - 不做静默兜底。
- 常用命令：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

新增 `apps/symbolsviewer/README.md`，必须包含：

- app 定位。
- 使用的配置和资产路径。
- 如何启动。
- 当前只展示 paytable 与图片资源交集的规则。
- 全局状态序列编辑方式，包括增加、移除、重排状态。
- PC 横屏验收方式。

如果修改 `packages/pixiani`，还要同步更新 `packages/pixiani/README.md`。

## 12. 实施步骤

### 12.1 预检

1. 确认工作区状态：

```bash
git status --short
```

2. 确认当前任务文件存在：

```bash
ls tasks/20-rendercore-symbol-system.md
```

3. 确认关键路径：

```bash
ls packages/pixiani packages/logiccore assets/gamecfg/game2.json assets/symbols
```

4. 如依赖未安装或新增依赖后 lockfile 需要更新，执行：

```bash
pnpm install
```

如果依赖下载失败，先执行代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

### 12.2 初始化 rendercore

1. 新增 `packages/rendercore` 包结构。
2. 配置 `package.json`、TypeScript、ESLint、Vitest。
3. 暴露根入口和 `./symbol` 子入口。
4. 确保 `pnpm --filter @slotclientengine/rendercore typecheck` 能识别 workspace 依赖。

### 12.3 实现纯逻辑

1. 实现错误类型，例如 `RenderCoreError`、`SymbolStateError` 或 `SymbolAssetError`。
2. 实现状态定义校验。
3. 实现状态等价解析。
4. 实现 `SymbolStateMachine`。
5. 实现纯 ani clock 或 symbol ani 更新结果。
6. 实现 `SymbolAnimationResolver` / `SymbolAni` 注入模型，确保状态定义和动画效果解耦。
7. 实现 viewer 默认 animation resolver。
8. 实现 `SymbolStateSequenceController`，支持默认序列、增加、移除、重排和显式时间推进。
9. 先补齐纯逻辑测试，再接 Pixi 渲染对象。

### 12.4 接入 Pixi 和 pixiani

1. 实现 `RenderSymbol`。
2. 用 Pixi `Container`/`Sprite` 承载基础图标。
3. 确保每个 `RenderSymbol` 只有一个主 `Sprite`，并复用传入的共享 Texture 引用。
4. 通过注入的 animation resolver 获取当前状态对应 `SymbolAni`。
5. `normal` 使用单帧 static ani。
6. viewer 默认 resolver 中的 `appear` 实现单次 scale bounce，不复制图片。
7. viewer 默认 resolver 中的 `win` 实现单次扫光，只临时叠加轻量 overlay。
8. 确保所有临时显示对象、mask、filter、scale 在状态结束或 reset 后复位。
9. 默认不修改 pixiani；如确需 pixiani 增量，按第 6 节最小范围执行。

### 12.5 实现 catalog

1. 接入 `@slotclientengine/logiccore` 的 `createGameConfig` / 类型。
2. 实现 paytable 到 symbol definition 的转换。
3. 实现 asset map 校验。
4. 实现 paytable 与图片资源交集的可展示 symbol 列表。
5. 实现缺图 paytable symbol 和孤儿图片的忽略列表，仅供测试/报告，不作为 viewer 主流程。
6. 测试当前 `assets/gamecfg/game2.json` 与 `assets/symbols` 的真实结果。

### 12.6 初始化 symbolsviewer

1. 新增 `apps/symbolsviewer`。
2. 配置 Vite、TypeScript、ESLint、Vitest。
3. 通过 import/glob 加载 `assets/gamecfg/game2.json` 和 `assets/symbols/*.png`。
4. 创建 Pixi Application。
5. 创建 symbol catalog。
6. 一次性网格展示全部 `displayableSymbols`。
7. 增加全局状态序列控制器，默认按多种状态顺序播放。
8. 增加状态序列编辑 UI，支持增加、移除、重排状态。
9. 增加默认状态选择和紧凑状态面板。
10. 确保全局状态序列驱动所有 `RenderSymbol.requestState()`，ticker 驱动 `update(deltaSeconds)`。
11. viewer 每帧收集全部可展示 `RenderSymbol.update()` 的结果；当前序列 step 是 `once` 时，只有全部图标都上报 `onceCompleted` 后才向 `SymbolStateSequenceController.update()` 传入 `onceCompleted: true`。

### 12.7 文档与验收

1. 写 `packages/rendercore/README.md`。
2. 写 `apps/symbolsviewer/README.md`。
3. 如修改 pixiani，更新 `packages/pixiani/README.md`。
4. 如改变仓库协作规则、目录规范或基础脚本，更新 `agents.md`；否则不要修改。
5. 运行第 13 节命令。
6. 启动 viewer 并做浏览器验收。
7. 写任务报告。

## 13. 验收命令

建议从仓库根目录执行。

### 13.1 rendercore 局部验收

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

要求：

- `test` 输出中 coverage lines/functions/branches/statements 均不低于 80%。
- 不允许通过降低阈值完成任务。

### 13.2 symbolsviewer 局部验收

```bash
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
```

### 13.3 pixiani 验收

如果修改了 `packages/pixiani`，必须执行：

```bash
pnpm --filter @slotclientengine/pixiani lint
pnpm --filter @slotclientengine/pixiani test
pnpm --filter @slotclientengine/pixiani typecheck
pnpm --filter @slotclientengine/pixiani build
```

### 13.4 根级验收

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

### 13.5 浏览器验收

启动 viewer：

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

浏览器打开 dev server 输出的本地地址，验收第 9.4 节所有项目。

如果使用自动化浏览器或截图验收，任务报告里写清：

- 打开的 URL。
- 验收的 PC 横屏视口尺寸，建议至少 `1280x720`。
- 截图路径或结论。
- 是否手动确认了 `appear` 和 `win` 动画。

### 13.6 收尾检查

```bash
git diff --check
git status --short
```

如果测试或构建留下 ignored 产物，例如 `dist/`、`coverage/`、`.turbo/`、`node_modules/`，在确认没有用户手写内容后清理对应 ignored 产物。不要删除 `assets/` 下的源文件。

## 14. 任务报告要求

任务完成后新增：

```text
tasks/20-rendercore-symbol-system-[utctime].md
```

`utctime` 生成命令：

```bash
date -u +%y%m%d-%H%M%S
```

报告必须使用中文，并包含：

- 完成摘要。
- 实际新增/修改文件列表。
- `rendercore` 公开 API 摘要。
- symbol 状态机规则摘要。
- 状态等价配置摘要。
- 状态与动画解耦实现摘要，说明 animation resolver 如何注入，以及是否覆盖了同状态不同动画。
- symbol 资源复用实现摘要，说明默认/出现/中奖是否复用同一份 Texture。
- `apps/symbolsviewer` 全局状态序列实现摘要，说明默认序列、增加、移除、重排状态的实现方式。
- `apps/symbolsviewer` 资源校验结果：
  - 可展示 symbols。
  - 被忽略的 paytable 缺图 symbols。
  - 被忽略的孤儿图片。
- 测试覆盖率结果，尤其是 `@slotclientengine/rendercore` 的 80% 阈值。
- 实际执行过的验收命令和结果。
- 浏览器验收结果；如果没有跑浏览器，必须明确写“未执行浏览器验收”以及原因。
- 是否修改了 pixiani；如果修改，说明修改原因和兼容性影响。
- 是否修改了 `agents.md`；如果未修改，说明未改变仓库协作规则、目录规范或基础脚本。
- 已知限制和后续建议。

## 15. 明确不做的事

- 不在本任务里实现真实旋转模糊滤镜；`spinBlur` 只等价到 `normal`。
- 不在本任务里实现真实不可用灰度/禁用滤镜；`disabled` 只等价到 `normal`。
- 不把缺图 symbol 静默替换成 `normal`、`BN`、空白图或其它任意图。
- 不为 `normal`、`appear`、`win` 分别复制图片资源。
- 不把状态 id 和具体动画效果硬绑定在状态机或 symbol definition 里。
- 不在 viewer 中处理 paytable 缺图 symbol 或孤儿图片；只处理 paytable 与图片资源的交集。
- 不做复杂移动端适配，本任务只验收 PC 横屏。
- 不把 app demo 代码混入 `packages/rendercore`。
- 不在 `rendercore` 顶层入口引入 Node-only API。
- 不为了通过测试改出与需求相反的生产逻辑。
- 不降低 coverage 阈值。
- 不修改 `assets/gamecfg/game2.json` 或 `assets/symbols` 源资产来掩盖资源校验问题，除非需求方另行明确要求。

## 16. 最终验收标准

本任务视为完成必须同时满足：

- `packages/rendercore` 初始化完成并纳入 pnpm workspace。
- `@slotclientengine/rendercore` 能被 TypeScript/Vite 正常 import。
- Symbol paytable 关联、默认状态、状态等价、循环/静态/单次切换语义全部有实现和测试。
- 状态语义和动画效果解耦，具体动画通过 animation resolver 注入。
- 同一个状态在不同游戏或不同 symbol 上可以使用不同动画，并有测试覆盖。
- 单次状态结束后回到当前默认状态。
- 循环状态切换等待 loop 完成。
- 静态状态立即切换。
- 静态状态按单帧 ani 实现，显式帧时长小于 `1 / 60` 秒会抛错。
- `spinBlur` 和 `disabled` 在 viewer 中等价到 `normal`。
- viewer 默认 animation resolver 中，`appear` 有放大弹回效果。
- viewer 默认 animation resolver 中，`win` 有扫光效果。
- `normal`、`appear`、`win` 复用同一份 symbol 图片/Texture，不为状态复制图片资源。
- `apps/symbolsviewer` 一次性展示 `assets/symbols` 中与 `game2.json` paytable 匹配的全部 symbol。
- `apps/symbolsviewer` 有全局状态序列控制器，所有展示图标共用同一组状态序列。
- 默认状态序列能自动播放。
- 用户可以移除状态、调整状态位置、增加状态。
- viewer 只处理 paytable 与图片资源的交集；缺图资源和孤儿图片不进入可展示列表，也不被静默兜底。
- PC 横屏验收通过。
- `packages/rendercore/README.md` 完成。
- `apps/symbolsviewer/README.md` 完成。
- `rendercore` coverage lines/functions/branches/statements 均大于或等于 80%。
- 第 13 节相关命令通过。
- 中文任务报告已写入 `tasks/20-rendercore-symbol-system-[utctime].md`。
