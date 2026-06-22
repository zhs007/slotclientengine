# gameframeworks bootstrap 任务计划

## 1. 任务目标

新增 `packages/gameframeworks`，作为后续 slot 游戏默认依赖的集成层。它整合：

- `@slotclientengine/uiframeworks`：负责 DOM HUD、余额、下注、win、spin/auto/buy bonus 等 UI 展示与交互。
- `@slotclientengine/netcore`：负责 live WebSocket 连接、进入游戏、spin、collect。
- `@slotclientengine/logiccore`：负责把服务器返回的 GMI 转成游戏可消费的逻辑对象。

新增 `apps/gameframeworksviewer`，作为 `gameframeworks` 的最小可运行验证 app。viewer 必须能点击 spin，走通 `spin -> logic 数据 -> 游戏侧处理完成 -> gameframeworks collect` 的完整流程，并把格式化后的逻辑消息输出成一个简单 list。本 viewer 不做真实游戏渲染。

本计划是完整可执行版本，不依赖其它上下文。执行者只需要阅读本文件，即可完成项目初始化、API 设计、实现、测试、文档、验收和任务报告。

核心目标：

- 新增 workspace package：`packages/gameframeworks`。
- 包名使用 `@slotclientengine/gameframeworks`。
- 新增 Vite app：`apps/gameframeworksviewer`。
- 后续游戏默认只依赖 `@slotclientengine/gameframeworks`，不直接依赖 `uiframeworks`、`netcore`、`logiccore`。如果确实需要直接依赖底层包，必须有明确的框架内部原因。
- `gameframeworks` 对游戏暴露的是逻辑数据，不暴露网络层 raw 协议作为游戏业务入口。
- 游戏通过当前局面的 `GameLogic` 读取逻辑细节，例如 `logic.getComponentScenes(0, "xxx")`、`logic.getStep(0).getComponentScenes("xxx")` 或 `gameframeworks` 重新导出的 helper/type，而不是自己解析 `gmi.replyPlay`。
- UI 的 `balance`、`bet`、`win`、spin 状态、collect 状态由 `gameframeworks` 自动驱动，游戏不处理这些通用 HUD 状态。
- 网络等待不能阻塞页面渲染。框架必须先更新 UI 状态并把控制权还给浏览器事件循环，再等待异步网络 Promise；不得用同步等待、忙循环、启动前阻塞渲染的 top-level await 或长时间同步解析卡住页面。
- 玩家点击 spin 后，框架按当前 bet 参数发起 spin；网络层收到并验证消息后，把 `GameLogic`/逻辑视图交给游戏侧；游戏侧完成动画或展示后，通过 Promise resolve 通知框架；框架再决定是否需要 collect。
- spin 后如果有赢分，必须在游戏处理完成后 collect；不能在游戏拿到逻辑对象前提前 collect。对于 `totalwin === 0` 但服务器处于多段结果/需要 collect 的情况，必须延续现有已验证的协议判断，不能为了简化而让下一次 spin 卡在 `SPINEND`。
- 不增加静默 mock、fixture、replay、默认 GMI、默认余额等生产兜底。mock 只能存在于测试和 viewer 的显式 mock 模式。
- 如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。
- 任务完成后，需要新增中文任务报告：`tasks/36-gameframeworks-bootstrap-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒，例如 `260401-181300`。
- 本任务会把“后续游戏默认依赖 `gameframeworks`”变成仓库协作规则，因此需要同步更新根目录 `agents.md`。如果实现者判断无需更新，必须在任务报告中写出具体理由。

## 2. 当前仓库事实

仓库事实：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 版本要求：`>=24.0.0`。
- pnpm 版本要求：`>=10.0.0`。
- workspace 匹配：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- 根级命令：
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm format`
  - `pnpm format:check`
- 根目录协作文件实际路径是 `agents.md`。
- 新增空目录时必须放置 `.keepme` 文件。
- 如果执行 `pnpm install` 或依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

当前相关目录：

- `packages/gameframeworks` 当前不存在。
- `apps/gameframeworksviewer` 当前不存在。
- `packages/uiframeworks` 已存在，包名是 `@slotclientengine/uiframeworks`。
- `apps/uiframeworksviewer` 已存在，可参考其 viewer 结构、mock/live 场景配置、happy-dom 测试方式和 CSS 引入方式。
- `packages/netcore` 已存在，包名是 `@slotclientengine/netcore`。
- `packages/logiccore` 已存在，包名是 `@slotclientengine/logiccore`。
- `apps/game001` 已有 live spin、GMI 校验、logiccore 解析、最终 collect 的历史实现，可参考其 fail-fast 网络与 collect 行为，但不要把 game001 的渲染细节搬进 `gameframeworks`。

`uiframeworks` 当前事实：

- 当前 public API 入口：`packages/uiframeworks/src/index.ts`。
- 当前样式入口：`@slotclientengine/uiframeworks/styles.css`。
- 当前 DOM 构建：`packages/uiframeworks/src/dom.ts`。
- 当前状态管理：`packages/uiframeworks/src/state.ts`。
- 当前 live session：`packages/uiframeworks/src/session.ts`。
- 当前类型：`packages/uiframeworks/src/types.ts`。
- 当前 `createSlotUiFramework()` 已经包含 live `netcore` + `logiccore` spin 流程，并且当前实现会在 `gameAdapter.applySpinResult(result)` 之前执行最终 collect。
- 新需求要求 collect 发生在游戏侧处理本次 logic 数据完成之后，所以 `gameframeworks` 不能简单薄包装当前 `createSlotUiFramework().spin()`。

`netcore` 当前事实：

- 顶层入口导出 `SlotcraftClient`、`ConnectionState`、`SlotcraftClientOptions`、`SpinParams`、`UserInfo` 等。
- `SlotcraftClientOptions.autoCollectIntermediateResults` 已存在，默认保持旧消费者行为。
- live 生产路径应使用 `ws://` 或 `wss://`。传入 `http://`、`https://` 或 replay URL 时，`gameframeworks` 必须明确失败，不允许进入 replay 兜底。
- 浏览器 live 模式使用全局 `WebSocket`，不需要安装 Node `ws`。
- Node CLI 使用 netcore 时才需要把 `ws` 安装到 `globalThis.WebSocket`；本任务的 viewer 是浏览器 app，不应引入 Node `ws` 作为运行时依赖。

`logiccore` 当前事实：

- `createGameLogicFromGmi(gmi, meta)` 可将服务器 spin 返回的 `gmi` 加下注元数据转换为 `GameLogic`。
- `GameLogic` / `GameLogicStep` 已提供：
  - `getTotalWin()`
  - `getStepCount()`
  - `getStep(index)`
  - `getScene(stepIndex, sceneIndex)`
  - `getResult(stepIndex, resultIndex)`
  - `hasComponent(stepIndex, name)`
  - `getComponent(stepIndex, name)`
  - `getComponentScenes(stepIndex, name)`
  - `getComponentResults(stepIndex, name)`
- `logiccore` 是 fail-fast 解析：协议结构异常、关键字段缺失、scene 非法、组件索引越界等情况应抛错，不应在上层吞掉。

## 3. 设计边界

### 3.1 包职责

`packages/gameframeworks` 是游戏默认 facade：

- 对 app/game 暴露 `createSlotGameFramework()`。
- 对 app/game 暴露 `@slotclientengine/gameframeworks/styles.css`，让游戏只从一个包引入框架样式。
- 内部依赖 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore`。
- 负责连接、进入游戏、spin、GMI 校验、logiccore 转换、collect、HUD 状态同步。
- 负责把网络事件转成游戏可理解的逻辑事件。
- 负责统一错误类型和 fail-fast 行为。

`packages/uiframeworks` 是 UI/HUD 基础能力：

- 默认 HUD、DOM frame、game layer、overlay、适配、按钮、金额展示等仍归它负责。
- 新增或暴露一个 UI-only 控制层给 `gameframeworks` 使用，不能要求 `gameframeworks` 走当前“UI 自己发网络并提前 collect”的旧流程。
- 为兼容任务 26/28，现有 `createSlotUiFramework()` 可暂时保留，但 `gameframeworks` 和 `gameframeworksviewer` 不应依赖它的旧网络流程。

`apps/gameframeworksviewer` 是集成验证 app：

- `package.json` 的业务依赖只允许有 `@slotclientengine/gameframeworks`。
- viewer 不直接依赖 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore`。
- viewer 默认 mock 模式必须能离线运行和测试。
- viewer live 模式可通过显式环境变量开启，不能在生产路径隐式 fallback 到 mock。

### 3.2 游戏侧 API 边界

游戏侧只关心逻辑数据和渲染流程：

- 游戏可以调用 `framework.spin()`，返回值就是当前局面的 `GameLogic`。
- 游戏可以实现 `adapter.playSpin(logic)`，在收到 `GameLogic` 后播放动画或展示 list。
- `adapter.playSpin(logic)` 的 Promise resolve 表示游戏已经完成本次 spin 展示。
- 游戏不调用 `client.collect()`，不判断网络状态机，不处理 `SPINEND`。
- 游戏不直接读取 `rawResult.gmi.replyPlay.results` 来推断玩法；必须通过 `GameLogic` 或 `gameframeworks` 提供的逻辑视图读取。
- `rawResult` / `rawGmi` 如需保留，只能作为框架内部 debug/诊断字段，不作为游戏侧公开业务入口。README 必须明确“游戏业务不要依赖 raw 协议”。
- 如果游戏需要在别的地方继续使用本次结果，由游戏自己缓存 `GameLogic`。框架不为游戏维护“上一局 logic”公开状态，避免隐藏生命周期和 stale data。

### 3.3 collect 时序

必须实现如下时序：

```text
玩家点击 spin
  -> gameframeworks 读取当前 bet/lines/times
  -> UI 状态更新为 spinning/requesting，按钮禁用，页面继续渲染
  -> netcore live spin Promise 开始
  -> 网络返回 spin 消息
  -> gameframeworks 严格校验 gmi/totalwin/results
  -> logiccore 创建 GameLogic
  -> gameframeworks 更新 win，并把 GameLogic 交给游戏 adapter
  -> adapter.playSpin(logic) 开始播放动画或输出 list
  -> adapter.playSpin(logic) resolve
  -> gameframeworks 判断是否需要 collect
  -> 如需 collect，UI 状态更新为 collecting，然后调用 netcore collect
  -> 更新 balance / 状态回 idle
```

关键约束：

- collect 不能早于 `adapter.playSpin(logic)` resolve。
- adapter Promise reject 时，框架进入 error，不能静默 collect，也不能静默回 idle。
- 重复调用 `spin()` 时，如果当前状态不是 `idle`，必须抛错。
- UI button disabled 阻止用户重复点击是正常行为；程序直接并发调用 `spin()` 必须抛错。
- collect 失败必须抛错并进入 error，不允许假装成功。
- 如果 spin 成功且需要 collect，但 collect 因网络/状态失败，下一次 spin 不应被允许静默继续。

建议复用并迁移当前已验证的最终 collect 判定：

```ts
function shouldCollectFinalResult(totalwin: number, results: number): boolean {
  return (totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1);
}
```

如果实现者认为新框架只应在 `totalwin > 0` 时 collect，必须先用 netcore 状态机和测试证明 `totalwin === 0 && results > 1` 不会卡住下一次 spin；否则不能改窄这个规则。

### 3.4 网络不阻塞渲染

必须做到：

- App 初始化先渲染 viewer shell/HUD，再异步 connect；不能为了等待 live 连接而白屏。
- spin click handler 只触发 `void framework.spin().catch(...)` 或等价异步流程；不得同步等待网络完成才更新 UI。
- `framework.spin()` 开始时必须同步更新状态，使 UI 能立即显示 spinning/disabled。
- 网络请求、collect、游戏 adapter 动画都必须 Promise 化。
- 不允许使用同步 XHR、忙循环、阻塞式 sleep、超大同步 JSON 格式化等会冻结主线程的实现。
- viewer 需要有一个 delayed mock spin 场景，用于验证网络 Promise pending 期间 UI 仍处于可渲染状态。

## 4. 建议公开 API

新增入口：

```ts
import {
  createSlotGameFramework,
  type SlotGameFramework,
  type SlotGameFrameworkOptions,
  type SlotGameAdapter,
  type GameLogic,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
```

建议核心类型：

```ts
// packages/gameframeworks 内部可以从 logiccore/netcore 导入这些类型，
// 但必须从 @slotclientengine/gameframeworks 重新导出给游戏使用。
import type {
  GameLogic,
  GameLogicMeta,
  GameLogicStep,
  LogicComponent,
  SceneMatrix,
  WinResult,
} from "@slotclientengine/logiccore";
import type {
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from "@slotclientengine/netcore";

export interface SlotGameLiveConfig {
  readonly serverUrl: string;
  readonly token?: string;
  readonly gamecode?: string;
  readonly businessid?: string;
  readonly clienttype?: string;
  readonly jurisdiction?: string;
  readonly language?: string;
  readonly requestTimeoutMs?: number;
}

export interface SlotGameBetOption {
  readonly bet: number;
  readonly lines: number;
  readonly times?: number;
  readonly label?: string;
}

export interface SlotGameSpinRequest {
  readonly bet?: number;
  readonly lines?: number;
  readonly times?: number;
  readonly autonums?: number;
  readonly ctrlname?: string;
  readonly [key: string]: unknown;
}

export type SlotGameSpinState =
  | "idle"
  | "connecting"
  | "spinning"
  | "presenting"
  | "collecting"
  | "error"
  | "disabled";

export interface SlotGameStateSnapshot {
  readonly connected: boolean;
  readonly spinState: SlotGameSpinState;
  readonly balance: number | null;
  readonly win: number;
  readonly betIndex: number;
  readonly betOption: SlotGameBetOption;
  readonly muted: boolean;
  readonly fastMode: boolean;
  readonly autoMode: boolean;
  readonly error: string | null;
}

export interface SlotGameMountContext {
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
  getState(): SlotGameStateSnapshot;
}

export interface SlotGameInitialState {
  readonly userInfo: Readonly<UserInfo>;
  readonly balance: number;
  readonly defaultScene?: SceneMatrix;
}

export interface SlotGameClientLike {
  getUserInfo(): Readonly<UserInfo>;
  connect(token?: string): Promise<void>;
  enterGame(gamecode?: string): Promise<unknown>;
  spin(params: SpinParams): Promise<unknown>;
  collect(playIndex?: number): Promise<unknown>;
  disconnect(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off?(event: string, callback: (...args: unknown[]) => void): void;
}

export type SlotGameClientFactory = (
  live: SlotGameLiveConfig,
  options: SlotcraftClientOptions,
) => SlotGameClientLike;

export type SlotGameLogicFactory = (
  gmi: unknown,
  meta: GameLogicMeta,
) => GameLogic;

export interface SlotGameFrameworkOptions {
  readonly root: HTMLElement;
  readonly gameAdapter: SlotGameAdapter;
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex?: number;
  readonly initialBalance?: number;
  readonly initialWin?: number;
  readonly designSize?: { readonly width: number; readonly height: number };
  readonly brandLabel?: string;
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
  readonly buildSpinRequest?: (
    state: SlotGameStateSnapshot,
    bet: SlotGameBetOption,
  ) => SlotGameSpinRequest;
  readonly clientFactory?: SlotGameClientFactory;
  readonly logicFactory?: SlotGameLogicFactory;
  readonly onStateChange?: (state: SlotGameStateSnapshot) => void;
  readonly onError?: (error: Error) => void;
}

export interface SlotGameAdapter {
  mount(context: SlotGameMountContext): void | Promise<void>;
  applyInitialState?(state: SlotGameInitialState): void | Promise<void>;
  playSpin(logic: GameLogic): void | Promise<void>;
  setFrameworkState?(state: SlotGameStateSnapshot): void;
  destroy?(): void;
}

export interface SlotGameFramework {
  connect(): Promise<void>;
  spin(): Promise<GameLogic>;
  setBetIndex(index: number): void;
  setMuted(muted: boolean): void;
  setFastMode(enabled: boolean): void;
  setAutoMode(enabled: boolean): void;
  getState(): SlotGameStateSnapshot;
  destroy(): void;
}

export function findComponentSteps(
  logic: GameLogic,
  name: string,
): readonly number[];

export function getComponentScenesByName(
  logic: GameLogic,
  name: string,
  options?: { readonly stepIndex?: number },
): readonly SceneMatrix[];

export function getComponentResultsByName(
  logic: GameLogic,
  name: string,
  options?: { readonly stepIndex?: number },
): readonly WinResult[];
```

公开 API 要求：

- `framework.spin()` 返回 `Promise<GameLogic>`，不要再额外包一层 `SlotGameSpinResult`，也不要要求游戏写 `spin.logic`。
- `adapter.playSpin(logic)` 的入参就是 `GameLogic`。
- `GameLogic` 表示当前 spin 返回后的当前局面逻辑。游戏如果后续还要在别的对象或系统里使用，应自己缓存这个 `logic`。
- `adapter.playSpin(logic)` 必须在网络返回并完成 `GameLogic` 校验后、最终 collect 之前调用；这是游戏拿到本次逻辑并播放动画的时机。
- `framework.spin()` 的 Promise 返回同一个 `GameLogic`，但必须在 `adapter.playSpin(logic)` resolve 且必要 collect 完成后才 resolve，确保调用方 `await framework.spin()` 后框架已经回到可安全下一次 spin 的状态。
- `gameframeworks` 必须从自己的入口重新导出游戏常用逻辑类型，例如 `GameLogic`、`GameLogicStep`、`LogicComponent`、`SceneMatrix`、`WinResult`，让游戏只从 `@slotclientengine/gameframeworks` import type，不直接依赖 `@slotclientengine/logiccore`。
- `totalwin`、`stepCount`、`resultCount`、`bet` 等游戏常用信息直接从 `GameLogic` 读取：
  - `logic.getTotalWin()`
  - `logic.getStepCount()`
  - `logic.getBet()`
  - `logic.getLines()`
  - `logic.getStep(index).getResultCount()`
- 框架内部可以有 `SlotGameRoundContext` 或等价私有结构保存 raw result、betOption、balanceBefore、collect 判断等，但不要把这个内部结构作为游戏侧返回值。
- 必须从 `gameframeworks` 导出纯 helper：
  - `findComponentSteps(logic, name)`
  - `getComponentScenesByName(logic, name, options?)`
  - `getComponentResultsByName(logic, name, options?)`
- helper 只能接收 `GameLogic` 并返回只读数据，不能把 helper 挂到额外 wrapper 对象上。
- `options.stepIndex` 不传时，helper 应返回所有触发该组件的 step 数据；传入时只读取该 step。
- 如果需要展示所有组件名，但 `logiccore` 现有 API 不够，优先在 `logiccore` 增加通用只读 API，例如 `GameLogicStep.getComponentNames()`，并同步更新 `packages/logiccore/README.md` 和测试。不要让 viewer 或游戏散落解析 `curGameModParam.historyComponents`。
- `SlotGameSpinRequest` 可以映射到底层 `SpinParams`，但不应直接要求游戏使用 `netcore` 类型。需要保留额外字段时，可使用受控 index signature，并在 README 中说明它会被传给 netcore。

## 5. 目标文件结构

新增 `packages/gameframeworks`：

```text
packages/gameframeworks/
  README.md
  package.json
  tsconfig.json
  tsconfig.build.json
  tsconfig.eslint.json
  vite.config.ts
  eslint.config.cjs
  src/
    index.ts
    types.ts
    errors.ts
    state.ts
    session.ts
    logic-result.ts
    round-context.ts
    component-helpers.ts
    collect.ts
    ui-adapter.ts
    styles.css
  tests/
    setup.ts
    exports.test.ts
    state.test.ts
    session.test.ts
    logic-result.test.ts
    round-context.test.ts
    component-helpers.test.ts
    collect.test.ts
    framework-flow.test.ts
    render-nonblocking.test.ts
```

新增 `apps/gameframeworksviewer`：

```text
apps/gameframeworksviewer/
  README.md
  package.json
  tsconfig.json
  tsconfig.eslint.json
  vite.config.ts
  eslint.config.cjs
  index.html
  src/
    main.ts
    scenarios.ts
    mock-client.ts
    logic-list-game.ts
    message-format.ts
    styles.css
    vite-env.d.ts
  tests/
    setup.ts
    scenarios.test.ts
    mock-client.test.ts
    logic-list-game.test.ts
    message-format.test.ts
    flow.test.ts
```

如果某个目录创建后暂时没有文件，必须放置 `.keepme`。本计划列出的目录预计都会有实际文件，因此通常不需要 `.keepme`。

## 6. 实施步骤

### 6.1 开始前检查

执行：

```bash
git status --short
rg --files packages/uiframeworks apps/uiframeworksviewer packages/netcore packages/logiccore apps/game001 tasks | sort
```

要求：

- 不回退用户已有修改。
- 如果遇到与本任务无关的 dirty 文件，忽略并在任务报告中说明。
- 如果 dirty 文件正好影响本任务路径，先读懂变更再继续，不要覆盖。

### 6.2 调整 `uiframeworks` 的可复用边界

目标：让 `gameframeworks` 能复用 HUD/DOM/状态，但不被迫使用当前 `uiframeworks` 的旧网络/提前 collect 流程。

建议方案：

- 在 `packages/uiframeworks` 新增或暴露 UI-only API，例如：

```ts
export interface SlotUiController {
  readonly elements: {
    readonly frame: HTMLElement;
    readonly gameLayer: HTMLElement;
    readonly overlay: HTMLElement;
  };
  update(state: SlotUiStateSnapshot): void;
  destroy(): void;
}

export function createSlotUiController(
  options: SlotUiControllerOptions,
): SlotUiController;
```

- `SlotUiControllerOptions` 只接受 DOM/HUD 配置和事件 handlers，不接受 `live`、`clientFactory`、`logicFactory`。
- `gameframeworks` 通过 handlers 接管 spin、bet、sound、fast、auto、buy bonus。
- `gameframeworks` 状态包含 `presenting`。实现者必须二选一并写入测试：
  - 扩展 `uiframeworks` 的 `SlotUiSpinState` 支持 `presenting`。
  - 或在 `gameframeworks` 到 `uiframeworks` 的 UI adapter 中把 `presenting` 明确映射成按钮禁用的 UI 状态，例如继续显示 `spinning` 或专门显示 `presenting` 文案。
- 不允许让 `presenting` 落到 `idle`，否则游戏动画播放期间用户会误触下一次 spin。
- 当前 `createSlotUiFramework()` 可用新 controller 重写或保留原实现，但现有 `packages/uiframeworks` 测试必须继续通过。
- 不要为了兼容旧测试保留提前 collect 的生产路径给新框架使用；如果旧测试表达了旧视觉/旧流程，按新边界修改测试，而不是污染 `gameframeworks`。
- 更新 `packages/uiframeworks/README.md`：说明它现在提供 UI-only controller，完整游戏流程推荐使用 `@slotclientengine/gameframeworks`。

如果实现者确认无需修改 `uiframeworks` 即可复用 HUD，任务报告必须说明：

- `gameframeworks` 如何避免使用当前提前 collect 的路径。
- `gameframeworks` 如何驱动 balance/bet/win UI。
- 为什么没有引入重复 DOM/CSS 实现。

### 6.3 初始化 `packages/gameframeworks`

`packages/gameframeworks/package.json` 建议：

```json
{
  "name": "@slotclientengine/gameframeworks",
  "version": "0.1.0",
  "private": true,
  "description": "Integrated slot game framework facade for UI, network and game logic.",
  "packageManager": "pnpm@10.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./styles.css": "./dist/gameframeworks.css",
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "prepare:deps": "pnpm --filter @slotclientengine/uiframeworks build && pnpm --filter @slotclientengine/netcore build && pnpm --filter @slotclientengine/logiccore build",
    "build": "pnpm run prepare:deps && vite build && tsc -p tsconfig.build.json --emitDeclarationOnly",
    "lint": "eslint .",
    "test": "vitest run --coverage",
    "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "@slotclientengine/logiccore": "workspace:*",
    "@slotclientengine/netcore": "workspace:*",
    "@slotclientengine/uiframeworks": "workspace:*"
  }
}
```

要求：

- devDependencies 与当前本仓库同类包保持根级版本一致，例如 `@eslint/js`、`@typescript-eslint/*`、`@vitest/coverage-v8`、`eslint-config-prettier`、`globals`、`happy-dom`。
- `vite.config.ts` 的 library build 输出 `dist/index.js` 和 `dist/gameframeworks.css`。
- `rollupOptions.external` 至少包含：
  - `@slotclientengine/uiframeworks`
  - `@slotclientengine/uiframeworks/styles.css`
  - `@slotclientengine/netcore`
  - `@slotclientengine/logiccore`
- `resolve.alias` 指向 workspace 源码，便于测试和 viewer dev：
  - `../uiframeworks/src/index.ts`
  - `../uiframeworks/src/styles.css`
  - `../netcore/src/index.ts`
  - `../logiccore/src/index.ts`
- coverage 阈值建议四项都设置为 `80` 或更高，不能低于本仓库现有基础包水平。

`src/styles.css` 应只作为 facade 样式入口：

- 引入或复用 `uiframeworks` 样式。
- 放置 `gameframeworks` 自己的极少量 viewer/debug class。
- 游戏侧只需要 `import "@slotclientengine/gameframeworks/styles.css";`。

### 6.4 实现 `gameframeworks` 状态与错误

新增错误类型：

- `SlotGameConfigError`
- `SlotGameRuntimeError`

状态建议：

```ts
export type SlotGameSpinState =
  | "idle"
  | "connecting"
  | "spinning"
  | "presenting"
  | "collecting"
  | "error"
  | "disabled";
```

状态快照至少包含：

- `connected`
- `spinState`
- `balance`
- `win`
- `betIndex`
- `betOption`
- `muted`
- `fastMode`
- `autoMode`
- `error`

要求：

- `betOptions` 不能为空。
- `bet` / `lines` / `times` 必须是正数；`lines` 必须是正整数。
- `initialBetIndex` 越界必须抛 `SlotGameConfigError`。
- balance/win 必须是 finite number；不能把非法值格式化成 0。
- 状态更新必须同步推给 `uiframeworks` controller 和 `onStateChange`。

### 6.5 实现 live session

`src/session.ts` 负责：

- 校验 `live.serverUrl` 必须是 `ws://` 或 `wss://`。
- 创建 `SlotcraftClient`。
- 设置：
  - `maxReconnectAttempts: 0`
  - `autoCollectIntermediateResults: true`，除非实现明确需要手动处理中间段并写入测试。
  - fail-fast logger。
- 监听 netcore `error`、`disconnect`、`reconnecting`、`message` 事件。
- `connect()` 执行 `client.connect(token)` 和 `client.enterGame(gamecode)`。
- `spin(request)` 执行 `client.spin(params)`，只负责返回 raw spin，不执行最终 collect。
- `collect()` 执行 `client.collect()`。
- `disconnect()` 标记预期断开后关闭 client。

fail-fast 要求：

- netcore `warn` / `error` logger 默认视为框架错误，除非有明确可忽略白名单；本任务不建议新增白名单。
- 意外 disconnect / reconnecting 必须让当前 Promise reject。
- `noticemsg2` 或带 `error` / `err` / `errmsg` / `errorMessage` 的服务端消息必须失败。
- 不允许自动重连后继续假装本次 spin 成功。

### 6.6 实现 logic result / round context

`src/logic-result.ts` 负责：

- 校验 raw spin result 是 object。
- 必须存在 `gmi`、`totalwin`、`results`。
- `totalwin` 必须 finite。
- `results` 必须非负整数。
- `results` 必须等于 `gmi.replyPlay.results.length`。
- 用当前 bet 和 userInfo 构造 `GameLogicMeta`：
  - `bet`
  - `lines`
  - `totalwin`
  - 如存在合法 `gameid`，传入 `gameid`
- 调用 `createGameLogicFromGmi(gmi, meta)`。
- 校验 `logic.getTotalWin() === totalwin`。
- 返回 `GameLogic`。

`src/round-context.ts` 负责框架内部上下文：

- 保存本次 spin 的内部序号、betOption、raw result、results 数量、balanceBefore、balanceAfterSpin、是否需要 collect 等框架流程数据。
- 该上下文只给框架内部、测试和 debug 使用，不作为游戏侧 API 返回。
- viewer 如需展示 spin id，应在自己的 game adapter 内维护递增序号，不要求 framework 返回一个带 id 的 spin 对象。

`src/component-helpers.ts` 负责组件名读取 helper：

- `findComponentSteps(logic, name)` 遍历 `logic.getSteps()`，返回触发该组件的 step index。
- `getComponentScenesByName(logic, name, options?)` 只通过 `GameLogic` / `GameLogicStep` API 读取 scene，不解析 raw GMI。
- `getComponentResultsByName(logic, name, options?)` 只通过 `GameLogic` / `GameLogicStep` API 读取 result，不解析 raw GMI。
- `name` 必须是非空字符串；非法 name 必须抛 `SlotGameConfigError` 或 `SlotGameRuntimeError`。
- `options.stepIndex` 非法时必须抛错，不能静默返回空数组。

如果需要组件名枚举：

- 优先扩展 `logiccore`：在 `GameLogicStep` 增加只读 `getComponentNames()` 或 `getTriggeredComponentNames()`。
- 同步更新：
  - `packages/logiccore/src/types.ts`
  - `packages/logiccore/src/game-logic.ts`
  - `packages/logiccore/tests/*`
  - `packages/logiccore/README.md`
- 如果暂时不扩展 `logiccore`，`gameframeworks` 只能提供“按调用方传入组件名读取”的 helper；viewer 不应直接解析 raw GMI 获取组件名。

### 6.7 实现主框架流程

`src/index.ts` / `src/framework.ts` 负责 `createSlotGameFramework()`。

要求：

- 构造时立即创建 UI controller 和 game layer，让页面可见。
- `connect()`：
  - 状态设为 `connecting`。
  - 异步连接并进入游戏。
  - 从 `userInfo.balance` 或显式 `initialBalance` 读取余额；都没有 finite number 时必须失败。
  - 调用 `adapter.applyInitialState()`。
  - 成功后状态回 `idle`。
- `spin()`：
  - 如果未连接，抛错。
  - 如果 `spinState !== "idle"`，抛错。
  - 读取当前 betOption。
  - 状态设为 `spinning` 并更新 UI。
  - 异步发送 spin。
  - 网络返回后创建当前局面的 `GameLogic` 和内部 `SlotGameRoundContext`。
  - 状态设为 `presenting`，更新 `win = logic.getTotalWin()`。
  - 调用 `adapter.playSpin(logic)`，并等待它 resolve。
  - 根据 `shouldCollectFinalResult()` 决定是否 collect。
  - collect 前状态设为 `collecting`。
  - collect 成功后从 `client.getUserInfo()` 刷新 balance。
  - 状态回 `idle`。
  - 返回 `GameLogic`。
- `destroy()`：
  - 销毁 UI controller。
  - disconnect live session。
  - 调用 `adapter.destroy()`。
  - destroy 后任何方法调用都必须抛 `SlotGameRuntimeError` 或安全 no-op；`spin()`、`connect()` 必须抛错。

`adapter.playSpin(logic)` 是游戏完成本次渲染/动画后通知框架的唯一默认方式。不要额外要求游戏调用 `collect()`。

### 6.8 初始化 `apps/gameframeworksviewer`

`apps/gameframeworksviewer/package.json`：

- `name`: `gameframeworksviewer`
- `type`: `module`
- dependencies 只包含：

```json
{
  "@slotclientengine/gameframeworks": "workspace:*"
}
```

- scripts 参考 `apps/uiframeworksviewer`：
  - `prepare:deps`
  - `build`
  - `dev`
  - `lint`
  - `test`
  - `typecheck`
  - `format`
  - `format:check`

`vite.config.ts`：

- `base: "./"`。
- alias `@slotclientengine/gameframeworks` 到 `../../packages/gameframeworks/src/index.ts`。
- alias `@slotclientengine/gameframeworks/styles.css` 到 `../../packages/gameframeworks/src/styles.css`。
- 如果 Vite 需要解析 transitive workspace package，允许 alias 底层包源码，但 app 源码不能直接 import 底层包。
- dev server 建议端口：`5203`。

viewer 功能：

- 顶部/侧边可有极简 toolbar，显示：
  - mode：mock/live。
  - scenario 选择。
  - status。
- 主体使用 `gameframeworks` 的 HUD 和 game layer。
- game layer 不做 reels/canvas/Pixi 渲染，只输出格式化消息 list。
- 必须有可点击 spin。
- 每次 spin 后 list 追加一条记录，至少显示：
  - viewer 自己维护的 spin id。
  - bet/lines/times。
  - totalwin。
  - stepCount。
  - resultCount。
  - 每个 step 的 `cashWin`、`coinWin`、scene count、result count。
  - 配置的组件名查询结果，例如 `bonus`、`freeSpin`、`lineWin` 或 mock fixture 实际包含的组件名。
- 如果 spin 有赢分，mock client 必须记录 collect 调用；viewer 状态必须能显示 collect 已发生。
- 添加 delayed spin 场景：spin Promise 延迟至少 1000ms，期间 UI 进入 spinning/presenting 前的合理状态，页面仍能更新 status/tick。

viewer 模式：

- 默认 mock 模式，不需要外部网络。
- live 模式必须显式设置：

```bash
VITE_GAMEFRAMEWORKSVIEWER_MODE=live
VITE_GAMEFRAMEWORKSVIEWER_SERVER_URL=wss://...
VITE_GAMEFRAMEWORKSVIEWER_TOKEN=...
VITE_GAMEFRAMEWORKSVIEWER_GAMECODE=...
```

- live 模式缺少必填 env 时必须启动失败并显示明确错误。
- mock 模式不得伪装成 live 验收。

## 7. 测试要求

### 7.1 `packages/gameframeworks` 单元测试

必须覆盖：

- 配置校验：
  - 非 ws/wss URL 失败。
  - 空 betOptions 失败。
  - 非法 bet/lines/times 失败。
  - initialBetIndex 越界失败。
  - initial balance/win 非 finite 失败。
- 状态：
  - connect 前不能 spin。
  - spin 并发调用失败。
  - spin pending 时状态为 `spinning`，UI 已更新。
  - adapter play pending 时状态为 `presenting`，collect 未发生。
  - adapter resolve 后才 collect。
  - collect 后状态回 `idle`。
  - `framework.spin()` resolve 时返回的 `GameLogic` 与传给 `adapter.playSpin(logic)` 的对象相同。
  - `framework.spin()` 必须在必要 collect 完成并回到 `idle` 后才 resolve，避免调用方 `await spin()` 后立刻发下一次 spin 时撞到 `SPINEND`。
  - `presenting` 映射到 UI 时按钮仍 disabled，不能误显示为 idle。
- 网络/session：
  - connect -> enterGame 顺序。
  - spin params 来自当前 bet。
  - `clientFactory` 能拿到 live config 和最终 `SlotcraftClientOptions`，mock/live 测试不需要复制生产选项构造逻辑。
  - `buildSpinRequest` 返回非法对象失败。
  - netcore error/disconnect/reconnecting/noticemsg2 都 fail-fast。
- logic result：
  - 缺少 `gmi` / `totalwin` / `results` 失败。
  - `results !== gmi.replyPlay.results.length` 失败。
  - logiccore 解析失败直接抛。
  - `logic.getTotalWin()` 和 `totalwin` 不一致失败。
  - game adapter 能用 `logic.getComponentScenes(stepIndex, name)`、`logic.getComponentResults(stepIndex, name)` 或 `logic.getStep(stepIndex).getComponentScenes(name)` 按组件名取数据。
- component helpers：
  - `findComponentSteps(logic, name)` 能返回所有触发该组件的 step index。
  - `getComponentScenesByName(logic, name)` 不传 `stepIndex` 时能汇总所有触发 step 的 scene。
  - `getComponentResultsByName(logic, name)` 不传 `stepIndex` 时能汇总所有触发 step 的 result。
  - helper 只通过 `GameLogic` / `GameLogicStep` API 工作，测试中禁止依赖 raw GMI 结构。
  - 空组件名和非法 stepIndex 必须失败。
- collect：
  - `totalwin > 0` 时 collect。
  - `totalwin === 0 && results === 1` 时不 collect。
  - `totalwin === 0 && results > 1` 的行为按最终协议决策测试清楚。
  - collect 失败进入 error，不回 idle。
- destroy：
  - destroy 后 disconnect。
  - destroy 后 spin/connect 抛错。
- exports：
  - package-name import 可用。
  - `@slotclientengine/gameframeworks/styles.css` export 可用。

### 7.2 `packages/uiframeworks` 回归测试

如果修改了 `packages/uiframeworks`，必须执行并通过：

```bash
pnpm --filter @slotclientengine/uiframeworks lint
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter @slotclientengine/uiframeworks typecheck
pnpm --filter @slotclientengine/uiframeworks build
```

测试调整原则：

- 如果旧测试阻碍 UI-only controller 或新边界，修改测试表达新合同。
- 不要为了旧测试保留 `gameframeworks` 不应使用的提前 collect 行为。
- 不要在生产代码里加不必要兜底。

### 7.3 `apps/gameframeworksviewer` 测试

必须覆盖：

- 默认 mock runtime config。
- live mode 缺 env 明确失败。
- viewer package 源码不直接 import `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore`。
- mock client：
  - spin 返回合法 GMI。
  - 中奖后 collect 记录正确。
  - delayed spin 能保持 Promise pending。
- message formatter：
  - 输出 viewer 自己维护的 spin id、bet、totalwin、step/result summary。
  - 组件查询成功/缺失都有明确文本。
- flow：
  - 点击或调用 spin 后 list 增加记录。
  - 中奖场景 collect 发生在 `playSpin` resolve 之后。
  - 无中奖单结果不 collect。

### 7.4 `packages/logiccore` 回归测试

如果为了组件名枚举或更顺手的逻辑读取扩展了 `packages/logiccore`，必须执行并通过：

```bash
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
```

要求：

- `logiccore` 仍保持 browser-safe 顶层导出。
- 不允许为了 viewer 方便而放宽 GMI 解析或组件索引校验。
- `packages/logiccore/README.md` 必须说明新增 API。

## 8. 文档要求

新增 `packages/gameframeworks/README.md`，必须包含：

- 这个包是后续游戏默认 facade。
- 安装/依赖方式：workspace 内游戏只依赖 `@slotclientengine/gameframeworks`。
- CSS 引入方式：

```ts
import "@slotclientengine/gameframeworks/styles.css";
```

- 最小使用示例：

```ts
const framework = createSlotGameFramework({
  root,
  live,
  betOptions,
  gameAdapter,
});
await framework.connect();
```

- `gameAdapter.playSpin(logic)` 的 Promise resolve 表示游戏动画结束，框架随后自动 collect。
- 游戏如何通过 `GameLogic` 以及 `findComponentSteps()`、`getComponentScenesByName()`、`getComponentResultsByName()` 按组件名读取数据。
- balance/bet/win 由框架处理，游戏不处理。
- fail-fast 策略。
- mock 只用于测试/viewer。
- live URL 只允许 ws/wss。
- 验收命令。

新增 `apps/gameframeworksviewer/README.md`，必须包含：

- viewer 目的。
- mock 模式运行命令。
- live 模式环境变量。
- spin 后消息 list 含义。
- collect 验证说明。
- 不做真实游戏渲染的说明。

更新根目录 `agents.md`：

- 在目录或执行约定中增加 `packages/gameframeworks` 的职责。
- 明确后续游戏默认依赖 `@slotclientengine/gameframeworks`，不要直接依赖 `uiframeworks`、`netcore`、`logiccore`，除非是在框架内部或有明确任务要求。
- 如果实现者不更新，任务报告必须列出不更新原因；但本任务按需求判断应更新。

## 9. 验收命令

安装/锁文件：

```bash
pnpm install
```

如果依赖下载失败：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

包级验收：

```bash
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
```

如果改了 `uiframeworks`：

```bash
pnpm --filter @slotclientengine/uiframeworks lint
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter @slotclientengine/uiframeworks typecheck
pnpm --filter @slotclientengine/uiframeworks build
```

如果改了 `logiccore`：

```bash
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
```

viewer 验收：

```bash
pnpm --filter gameframeworksviewer lint
pnpm --filter gameframeworksviewer test
pnpm --filter gameframeworksviewer typecheck
pnpm --filter gameframeworksviewer build
```

根级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
pnpm format:check
git diff --check
```

浏览器/手工验收：

```bash
pnpm --filter gameframeworksviewer dev -- --host 127.0.0.1 --port 5203
```

打开 `http://127.0.0.1:5203/`，检查：

- 首屏不白屏。
- 默认 mock 模式可点击 spin。
- spin pending 期间页面状态能更新，UI 没有卡死。
- spin 返回后 list 出现格式化逻辑消息。
- 中奖场景在游戏 list 更新后才 collect。
- collect 后状态回 idle，可再次 spin。
- 无中奖单结果不 collect。
- live mode 缺 env 时显示明确错误，不 fallback 到 mock。

如果当前环境无法做浏览器验收，任务报告必须明确写“未执行浏览器验收”和原因，不能把未执行项标记为通过。

## 10. 完成报告要求

任务完成后新增：

```text
tasks/36-gameframeworks-bootstrap-[utctime].md
```

`utctime` 生成命令：

```bash
date -u +"%y%m%d-%H%M%S"
```

报告必须包含：

- 实现摘要。
- 新增/修改文件清单。
- `gameframeworks` public API 摘要。
- `uiframeworks` 边界调整说明。
- spin 时序说明，特别是：
  - 网络返回后何时把 logic 给游戏。
  - 游戏完成后如何通知框架。
  - collect 如何保证在游戏完成之后发生。
- balance/bet/win 自动处理说明。
- viewer mock/live 说明。
- `agents.md` 是否更新及原因。
- 所有验收命令及结果。
- 浏览器验收结果；如未执行，说明原因。
- 已知风险和后续建议。

## 11. 第二遍遗漏检查清单

提交前必须逐项检查：

- `packages/gameframeworks` 和 `apps/gameframeworksviewer` 都进入 workspace，不需要改 `pnpm-workspace.yaml`。
- `pnpm-lock.yaml` 已反映新增 importer。
- viewer app `dependencies` 没有直接依赖 `uiframeworks`、`netcore`、`logiccore`。
- `framework.spin()` 返回 `GameLogic`，没有新增游戏侧 `SlotGameSpinResult` / `spin.logic` wrapper。
- `adapter.playSpin(logic)` 收到的 `GameLogic` 与 `framework.spin()` 最终 resolve 的对象一致。
- `framework.spin()` resolve 时必要 collect 已完成，状态已回到可安全下一次 spin 的状态。
- `findComponentSteps()`、`getComponentScenesByName()`、`getComponentResultsByName()` 已导出并测试，游戏可只通过组件名读取当前 `GameLogic` 数据。
- 游戏侧 API 没有要求游戏处理 collect。
- collect 测试证明发生在 `adapter.playSpin()` resolve 之后。
- adapter reject 不会静默 collect。
- `presenting` 状态不会映射成 UI idle，游戏展示期间 spin 控件仍 disabled。
- spin pending 不阻塞 UI 初始渲染。
- 生产路径没有 replay/mock/default GMI/default balance 兜底。
- live URL 非 ws/wss 会失败。
- `logiccore` 如有 API 扩展，README 和测试已同步。
- `logiccore` 如有 API 扩展，已跑包级 lint/test/typecheck/build。
- `uiframeworks` 如有 API 扩展，README 和测试已同步。
- `agents.md` 已同步“新游戏默认依赖 gameframeworks”的协作规则，或报告中有充分理由说明无需同步。
- 所有新增目录都有实际文件或 `.keepme`。
- `dist/coverage/node_modules` 等生成物没有被误提交，除非仓库当前任务明确要求。
- 中文任务报告已按 UTC 命名写入 `tasks/`。
