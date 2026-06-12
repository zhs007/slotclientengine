# uiframeworks DOM slot UI bootstrap 任务计划

## 1. 任务目标

新增一个通用 slot 游戏 DOM UI 基础库 `packages/uiframeworks`，并新增 `apps/uiframeworksviewer` 用来验证不同视口、不同数值长度、不同按钮状态下的 UI 布局。

本计划是完整可执行版本，不依赖其它上下文。执行者只需要阅读本文件，即可完成项目初始化、DOM/CSS UI、netcore/logiccore 数据流、viewer、测试、README、验收和任务报告。

核心目标：

- 新增 workspace package：`packages/uiframeworks`。
- 包名使用 `@slotclientengine/uiframeworks`。
- UI 必须使用 DOM + CSS 实现，基础库和 viewer 都不得创建 canvas、SVG、图片图标或 icon font。
- 参考设计图 `docs/ui001.png` 只参考布局骨架，不直接使用其中任何图片资源。
- 按优化后的 slot HUD 方案实现：
  - 顶部左侧一个菜单按钮。
  - 顶部右侧两个开关型按钮：声音、快速。它们不使用外框按钮样式；关闭态需要灰掉并有斜线标识。
  - 底部固定一个 banner 条。
  - `balance`、`bet`、`win` 显示区都位于底部 banner 上。
  - 下注区在中间，减注按钮在 bet 左侧，加注按钮在 bet 右侧。
  - spin 按钮比参考图更大，使用圆形主按钮，可覆盖或半覆盖底部 banner。
  - auto 按钮使用圆形按钮。
- `uiframeworks` 负责页面适配：创建固定设计分辨率的 frame、game layer 和 UI overlay，并按视口缩放完整 frame。
- 游戏层始终维持设计分辨率，不需要自己适配浏览器视口。
- `uiframeworks` 通过 `@slotclientengine/netcore` 与服务器交互，通过 `@slotclientengine/logiccore` 解析 spin 返回的 GMI，并把原始 `gmi`、`GameLogic` 和必要的 spin 元数据交给游戏层 adapter。
- 生产路径不允许隐式使用本地 fixture、mock、replay URL 或默认 GMI 兜底。
- 基础库测试覆盖率必须超过 80%；本任务要求 `packages/uiframeworks` 的 statements、branches、functions、lines 四项阈值均设置为 `81`，实际测试输出也必须四项都高于 80%。
- 新增 `packages/uiframeworks/README.md`，说明 API、CSS 引入、DOM 结构、适配规则、netcore/logiccore 数据流、错误策略、viewer 和验收命令。
- 新增 `apps/uiframeworksviewer/README.md`，说明 viewer 场景、运行方式、mock/live 模式和布局验收方式。
- 如果实现过程中改变仓库协作规则、目录规范或基础脚本，需要同步更新根目录 `agents.md`；如果没有改变，在任务报告中明确说明无需更新。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `26-uiframeworks-dom-slot-ui-bootstrap-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

## 2. 当前仓库事实

仓库事实：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- pnpm 要求为 `>=10.0.0`。
- workspace 匹配：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- 根级基础工具链包含：
  - `typescript`
  - `vite`
  - `vitest`
  - `eslint`
  - `prettier`
  - `ts-node`
  - `turbo`
- 根级命令包括：
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm format`
  - `pnpm format:check`
- 根目录协作文件实际路径是 `agents.md`。
- 如果执行 `pnpm install` 或依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

当前相关目录状态：

- `packages/uiframeworks` 当前不存在。
- `apps/uiframeworksviewer` 当前不存在。
- `docs/ui001.png` 存在，是本任务的布局参考图。
- `packages/netcore` 已存在，包名是 `@slotclientengine/netcore`。
- `packages/logiccore` 已存在，包名是 `@slotclientengine/logiccore`。
- `apps/game001` 已有固定设计分辨率和外层 DOM scale 的实现，可参考其 frame 适配思路：
  - 设计分辨率：`941 x 1672`。
  - 外层 `.game001-frame` 固定像素尺寸。
  - 通过 `Math.min(viewportWidth / stage.width, viewportHeight / stage.height)` 计算缩放。
  - 游戏内部继续按设计分辨率坐标定位。

`logiccore` 当前事实：

- `createGameLogicFromGmi(gmi, meta)` 可将服务器 spin 返回的 `gmi` 加下注元数据转换为 `GameLogic`。
- `GameLogic` 保留原始 GMI，并提供 step、scene、result、component 查询能力。
- `logiccore` 采用 fail-fast 策略。协议结构异常、关键字段缺失、scene 非法、组件索引越界等情况应抛错，不应被调用方吞掉。

`netcore` 当前事实：

- 顶层入口导出 `SlotcraftClient`、`ConnectionState`、`SlotcraftClientOptions`、`SpinParams`、`UserInfo` 等。
- `SlotcraftClient` 根据 URL 协议选择 live WebSocket 或 replay HTTP 实现。
- 本任务的 `uiframeworks` 生产路径只接受 `ws://` 或 `wss://` live URL。传入 `http://` 或 `https://` 必须明确失败，不能进入 replay 兜底。
- 浏览器 live 模式使用全局 `WebSocket`，不需要安装 Node `ws`。
- live spin 成功结果应包含 `gmi`、`totalwin`、`results`。缺少任何字段都必须失败。

现有包配置参考：

- `packages/logiccore` 是 CommonJS 包，使用 `tsc` 构建，并在 `vitest.config.ts` 中配置 coverage。
- `packages/rendercore` 是 ESM 包，使用 `vite.config.ts` 提供测试配置，使用 package-local `lint/test/typecheck/build`。
- `apps/game001` 和 `apps/reelsviewer` 是 Vite app，使用 `vite.config.ts` 同时配置 dev/build/test，并在 app 内通过 alias 指向内部包源码。

## 3. 视觉与交互合同

### 3.1 设计分辨率与 frame

`uiframeworks` 必须支持通用设计分辨率，默认建议使用当前游戏 demo 已验证的：

```ts
{ width: 941, height: 1672 }
```

实际 API 必须允许调用方传入其它正数设计尺寸。无效尺寸必须抛错：

- `width <= 0`
- `height <= 0`
- 非 finite number

DOM 层级建议固定为：

```html
<main class="slot-ui-page">
  <div class="slot-ui-frame">
    <div class="slot-ui-game-layer"></div>
    <div class="slot-ui-overlay"></div>
  </div>
</main>
```

约束：

- `.slot-ui-frame` 使用设计分辨率像素宽高。
- `.slot-ui-frame` 使用 CSS transform 缩放并居中。
- `.slot-ui-game-layer` 和 `.slot-ui-overlay` 都铺满 frame。
- `uiframeworks` 不创建 canvas；如果具体游戏层自己创建 canvas，那属于游戏 adapter 的职责，不属于本基础库 UI。
- viewer 本身不得创建 canvas。

### 3.2 顶部按钮

顶部区域：

- 菜单按钮：
  - 位于左上。
  - 可使用 CSS 绘制圆角方形或轻量按钮底。
  - 图标使用三条 DOM/CSS 横线绘制。
  - 必须有可访问名称，例如 `aria-label="Menu"`。
- 声音开关：
  - 位于右上按钮组。
  - 属于 toggle，不使用外框型大按钮样式。
  - 开启态显示 CSS speaker + 声波。
  - 关闭态灰掉，显示斜线。
  - 使用 `aria-pressed` 和 `data-slot-muted` 或等价状态属性。
- 快速开关：
  - 位于声音按钮右侧。
  - 属于 toggle，不使用外框型大按钮样式。
  - 开启态显示 CSS lightning 或 speed 标识。
  - 关闭态灰掉，显示斜线。
  - 使用 `aria-pressed` 和 `data-slot-fast` 或等价状态属性。

声音和快速按钮不得用参考图那种紫色外框方块。它们应该视觉上更像状态开关：图标清晰、触控区域足够、关闭态可一眼看出。

### 3.3 底部 banner

底部必须有完整宽度的 `.slot-ui-bottom-banner`：

- 固定在 frame 底部。
- 使用 CSS 绘制背景、描边、阴影和高光。
- 不使用图片、SVG、canvas。
- 高度必须用设计分辨率中的固定像素或 CSS 变量表达，推荐初始值 `220px` 到 `280px`，并通过 viewer 验证。
- 在窄屏缩放后，banner 内文字不得重叠或溢出。

banner 内元素：

- 左侧：`balance` 显示区。
- 中间：下注区，结构为 `减注按钮 + bet 显示 + 加注按钮`。
- 中间偏上或中心：大圆形 spin 按钮。
- 右侧：圆形 auto 按钮。
- `win` 显示区需要放在 banner 上，推荐位于 balance 和 bet 之间或 balance 下方；最终以不拥挤、不重叠为准。

### 3.4 Spin 按钮

spin 按钮要求：

- 大于参考图中视觉尺寸。
- 圆形。
- 使用 CSS 绘制多层背景、内阴影、高光和按下态。
- 可显示 `SPIN` 文案，或用 CSS 绘制旋转箭头；不得用图片、SVG、canvas。
- 必须有状态：
  - `idle`
  - `connecting`
  - `spinning`
  - `collecting`
  - `error`
  - `disabled`
- 非 idle 状态下重复点击不得发送第二次 spin。
- 重复点击的处理必须明确：UI disabled 是正常行为；如果程序直接调用 `spin()` 触发并发 spin，必须抛错。

### 3.5 Bet、Balance、Win

下注区要求：

- bet options 由调用方显式传入，不能为空。
- 当前 bet index 必须在范围内，否则初始化失败。
- `-` 和 `+` 按钮位于 bet 显示区左右两侧。
- 到达最小/最大下注时，对应按钮 disabled；点击 disabled 控件不改变状态。
- 程序调用设置非法 bet index 必须抛错。

金额格式：

- 使用显式 `currency`、`locale` 或 `formatMoney` 回调。
- 默认格式可以使用 `Intl.NumberFormat`，但输入金额必须是 finite number。
- `balance` 在连接前可以显示占位状态；连接完成后如果既没有显式 initial balance，也无法从 `userInfo.balance` 读取到 finite number，必须失败，不能默默显示 `0`。
- `win` 在 spin 前显示 `0` 或配置的初始值；spin 返回后显示 `totalwin`。

### 3.6 Auto 按钮

本任务需要实现圆形 auto 按钮的 DOM、CSS、状态和事件：

- 使用圆形按钮。
- 支持 `aria-pressed`。
- 支持 active/off/disabled 三类视觉状态。
- 点击后触发 `onAutoToggle` 或更新框架状态。

本任务不默认执行真实自动连发 spin。自动连发涉及次数、余额、风控、监管和服务端字段契约，不能在基础库初始化任务里用隐式循环猜测。若调用方需要真实 auto spin，必须通过显式配置或后续任务定义。

### 3.7 Fast 模式

快速开关只维护 UI 状态和回调，不擅自把某个字段塞进 `SpinParams`。

如果调用方需要把 fast 状态传给服务器，必须提供显式的 `buildSpinParams(state)` 或等价 callback。没有 callback 时，fast 只影响 UI 状态和传给游戏 adapter 的状态，不改变网络请求参数。

## 4. `packages/uiframeworks` API 合同

新增公开入口：

```ts
import {
  createSlotUiFramework,
  type SlotUiFramework,
  type SlotUiFrameworkOptions,
  type SlotGameAdapter,
} from "@slotclientengine/uiframeworks";
import "@slotclientengine/uiframeworks/styles.css";
```

建议核心类型：

```ts
import type { GameLogic, GameLogicMeta } from "@slotclientengine/logiccore";
import type { SpinParams, UserInfo } from "@slotclientengine/netcore";

export interface SlotUiDesignSize {
  readonly width: number;
  readonly height: number;
}

export interface SlotUiBetOption {
  readonly bet: number;
  readonly lines: number;
  readonly times?: number;
  readonly label?: string;
}

export interface SlotUiLiveConfig {
  readonly serverUrl: string;
  readonly token?: string;
  readonly gamecode?: string;
  readonly businessid?: string;
  readonly clienttype?: string;
  readonly jurisdiction?: string;
  readonly language?: string;
  readonly requestTimeoutMs?: number;
}

export type SlotUiSpinState =
  | "idle"
  | "connecting"
  | "spinning"
  | "collecting"
  | "error"
  | "disabled";

export interface SlotUiStateSnapshot {
  readonly designSize: SlotUiDesignSize;
  readonly connected: boolean;
  readonly spinState: SlotUiSpinState;
  readonly balance: number | null;
  readonly win: number;
  readonly betIndex: number;
  readonly betOption: SlotUiBetOption;
  readonly muted: boolean;
  readonly fastMode: boolean;
  readonly autoMode: boolean;
  readonly error: string | null;
}

export interface SlotUiSpinResult {
  readonly rawResult: unknown;
  readonly gmi: unknown;
  readonly logic: GameLogic;
  readonly totalwin: number;
  readonly results: number;
  readonly userInfo: Readonly<UserInfo>;
}

export interface SlotInitialState {
  readonly userInfo: Readonly<UserInfo>;
  readonly balance: number;
  readonly defaultScene?: readonly (readonly number[])[];
}

export interface SlotGameMountContext {
  readonly designSize: SlotUiDesignSize;
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
  getState(): SlotUiStateSnapshot;
}

export interface SlotGameAdapter {
  mount(root: HTMLElement, context: SlotGameMountContext): void | Promise<void>;
  applyInitialState?(state: SlotInitialState): void | Promise<void>;
  applySpinResult(result: SlotUiSpinResult): void | Promise<void>;
  setUiState?(state: SlotUiStateSnapshot): void;
  destroy?(): void;
}

export interface SlotcraftClientLike {
  getUserInfo(): Readonly<UserInfo>;
  connect(token?: string): Promise<void>;
  enterGame(gamecode?: string): Promise<unknown>;
  spin(params: SpinParams): Promise<unknown>;
  collect(playIndex?: number): Promise<unknown>;
  disconnect(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off?(event: string, callback: (...args: unknown[]) => void): void;
}

export interface SlotUiFrameworkOptions {
  readonly root: HTMLElement;
  readonly gameAdapter: SlotGameAdapter;
  readonly designSize?: SlotUiDesignSize;
  readonly live: SlotUiLiveConfig;
  readonly betOptions: readonly SlotUiBetOption[];
  readonly initialBetIndex?: number;
  readonly initialBalance?: number;
  readonly initialWin?: number;
  readonly initialMuted?: boolean;
  readonly initialFastMode?: boolean;
  readonly initialAutoMode?: boolean;
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
  readonly buildSpinParams?: (
    state: SlotUiStateSnapshot,
    bet: SlotUiBetOption,
  ) => SpinParams;
  readonly clientFactory?: (live: SlotUiLiveConfig) => SlotcraftClientLike;
  readonly logicFactory?: (gmi: unknown, meta: GameLogicMeta) => GameLogic;
  readonly onStateChange?: (state: SlotUiStateSnapshot) => void;
  readonly onError?: (error: Error) => void;
}

export interface SlotUiFramework {
  connect(): Promise<void>;
  spin(): Promise<SlotUiSpinResult>;
  setBalance(balance: number): void;
  setBetIndex(index: number): void;
  setMuted(muted: boolean): void;
  setFastMode(enabled: boolean): void;
  setAutoMode(enabled: boolean): void;
  getState(): SlotUiStateSnapshot;
  destroy(): void;
}
```

实现时不要求类型名逐字完全一致，但必须满足同等能力：

- 调用方能挂载游戏层。
- 调用方能传入 live 连接配置。
- 调用方能传入 bet options。
- 调用方能接收 spin 返回的 `gmi` 和 `GameLogic`。
- 调用方能监听或读取 UI 状态。
- UI 可以独立更新 balance、bet、win、muted、fast、auto、spin 状态。
- `clientFactory` 和 `logicFactory` 只用于测试、viewer mock 或显式集成替换；生产 live 默认路径不得在失败后自动切换到 mock client 或替代 logic factory。

严格数据流：

1. `createSlotUiFramework(options)` 创建 DOM frame、game layer、overlay 和 UI 控件。
2. `connect()` 创建 `SlotcraftClient`，只接受 `ws://` 或 `wss://`。
3. `connect()` 调用 `client.connect(token)` 和 `client.enterGame(gamecode)`。
4. `connect()` 成功后读取 `client.getUserInfo()`，更新 balance，并调用 `gameAdapter.applyInitialState`。
5. spin 按钮或 `framework.spin()` 触发一次 `client.spin(buildSpinParams(state))`。
6. spin 返回后校验：
   - 结果是 object。
   - 包含 `gmi`。
   - 包含 finite number `totalwin`。
   - 包含 non-negative integer `results`。
   - `results` 必须等于 `gmi.replyPlay.results.length`，如果该路径缺失或不是数组，必须失败。
7. 使用 `createGameLogicFromGmi(gmi, meta)` 生成 `GameLogic`。
8. 如需 final collect，调用 `client.collect()` 并等待成功。
9. 更新 win、balance、spin 状态。
10. 调用 `gameAdapter.applySpinResult(result)`，把 raw result、gmi、logic、totalwin、results、userInfo 传给游戏层。

final collect 规则沿用当前 live demo 已验证的基础逻辑：

```ts
(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1)
```

如果后续业务需要不同 collect 策略，必须通过显式配置扩展，不能在本任务里做静默猜测。

fail-fast 事件策略：

- netcore `error` 事件必须让当前操作失败。
- 非预期 `disconnect` 必须让当前操作失败。
- `reconnecting` 必须让当前操作失败。
- logger `warn` 和 `error` 必须让当前操作失败。
- server `noticemsg2` 或明确错误消息必须让当前操作失败。
- 这些失败需要进入 UI error 状态，同时 reject 对应 Promise。

测试注入：

- 允许通过 `clientFactory`、`logicFactory`、`now`、`formatMoney` 等依赖注入进行单元测试。
- 这些注入必须是显式 options，不允许生产代码在 live 失败时自动切换 mock。

## 5. 文件与目录规划

新增 `packages/uiframeworks`：

```text
packages/uiframeworks/
  package.json
  README.md
  eslint.config.cjs
  tsconfig.json
  tsconfig.build.json
  tsconfig.eslint.json
  vite.config.ts
  src/
    index.ts
    types.ts
    errors.ts
    format.ts
    layout.ts
    state.ts
    dom.ts
    session.ts
    styles.css
  tests/
    setup.ts
    layout.test.ts
    format.test.ts
    state.test.ts
    dom.test.ts
    session.test.ts
    exports.test.ts
```

说明：

- 如果实现时需要再拆分 `dom/`、`runtime/` 等子目录可以拆，但不能牺牲清晰边界。
- `layout.ts` 放纯布局和缩放计算，不能读取 DOM。
- `state.ts` 放 UI 状态转换、bet index、按钮 enabled/disabled 逻辑。
- `dom.ts` 放 DOM 创建和事件绑定。
- `session.ts` 放 netcore + logiccore 的 live 会话编排。
- `format.ts` 放金额格式化和输入校验。
- `styles.css` 放所有 UI 样式和 CSS 图形。
- `errors.ts` 放 `SlotUiConfigError`、`SlotUiRuntimeError` 或等价错误类型。

`packages/uiframeworks/package.json` 要求：

- `name: "@slotclientengine/uiframeworks"`
- `private: true`
- `type: "module"`
- `dependencies` 至少包含：
  - `@slotclientengine/netcore: "workspace:*"`
  - `@slotclientengine/logiccore: "workspace:*"`
- `devDependencies` 使用现有根工具链版本风格，至少包含：
  - `@eslint/js`
  - `@typescript-eslint/eslint-plugin`
  - `@typescript-eslint/parser`
  - `@vitest/coverage-v8`
  - `eslint-config-prettier`
  - `globals`
  - `happy-dom`
- scripts 至少包含：
  - `prepare:deps`
  - `build`
  - `lint`
  - `test`
  - `typecheck`
  - `format`
  - `format:check`

推荐 scripts：

```json
{
  "prepare:deps": "pnpm --filter @slotclientengine/netcore build && pnpm --filter @slotclientengine/logiccore build",
  "build": "pnpm run prepare:deps && vite build && tsc -p tsconfig.build.json --emitDeclarationOnly",
  "lint": "eslint .",
  "test": "vitest run --coverage",
  "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

`packages/uiframeworks/vite.config.ts` 要求：

- 配置 library build。
- 配置 tests 使用 `happy-dom`。
- coverage：
  - provider: `v8`
  - include: `src/**`
  - exclude: `src/styles.css`
  - thresholds: statements/branches/functions/lines 全部为 `81`
- 如果 Vite library build 需要 alias 内部源码，显式 alias：
  - `@slotclientengine/netcore` -> `../../packages/netcore/src/index.ts`
  - `@slotclientengine/logiccore` -> `../../packages/logiccore/src/index.ts`

新增 `apps/uiframeworksviewer`：

```text
apps/uiframeworksviewer/
  package.json
  README.md
  eslint.config.cjs
  tsconfig.json
  tsconfig.eslint.json
  vite.config.ts
  index.html
  src/
    main.ts
    scenarios.ts
    mock-client.ts
    demo-game.ts
    styles.css
    vite-env.d.ts
  tests/
    setup.ts
    scenarios.test.ts
    mock-client.test.ts
    demo-game.test.ts
```

`apps/uiframeworksviewer/package.json` 要求：

- `name: "uiframeworksviewer"`
- `private: true`
- `type: "module"`
- dependencies 至少包含：
  - `@slotclientengine/uiframeworks: "workspace:*"`
- scripts 至少包含：
  - `prepare:deps`
  - `dev`
  - `build`
  - `lint`
  - `test`
  - `typecheck`
  - `format`
  - `format:check`

推荐 scripts：

```json
{
  "prepare:deps": "pnpm --filter @slotclientengine/uiframeworks build",
  "build": "pnpm run prepare:deps && vite build",
  "dev": "pnpm run prepare:deps && sh -c 'if [ \"$1\" = \"--\" ]; then shift; fi; exec vite \"$@\"' sh",
  "lint": "eslint .",
  "test": "vitest run --coverage",
  "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

`apps/uiframeworksviewer/vite.config.ts` 要求：

- 使用 Vite app 配置，不做 landing page。
- dev server 推荐端口 `5202`，并允许从 monorepo 根读取必要 workspace 文件。
- alias `@slotclientengine/uiframeworks` 到 `../../packages/uiframeworks/src/index.ts` 或使用已构建 workspace 包；二者择一即可，但测试、dev、build 必须一致。
- test environment 使用 `happy-dom`，因为 viewer 会测试 DOM adapter 和 mock UI。
- coverage include `src/**`，exclude `src/main.ts`、`src/styles.css`、`src/vite-env.d.ts`。
- 如果 viewer 测试需要导入 `@slotclientengine/uiframeworks/styles.css`，必须确保测试环境能解析该 CSS import，不能用空模块吞掉真实 CSS export 配置问题。

需要修改的现有文件：

- `pnpm-lock.yaml`：如新增 `happy-dom` 或其它依赖，需要更新。
- `agents.md`：默认不需要改。只有当实现引入新的仓库级协作规则、目录规范或基础脚本约定时才改。

不要提交以下生成目录：

- `packages/uiframeworks/dist`
- `packages/uiframeworks/coverage`
- `apps/uiframeworksviewer/dist`
- `apps/uiframeworksviewer/coverage`
- `.turbo`
- `node_modules`

## 6. 实施步骤

### 6.1 初始化 package

1. 创建 `packages/uiframeworks` 目录结构。
2. 添加 `package.json`、TS config、ESLint config、Vite config。
3. 配置 package exports：

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./styles.css": "./dist/uiframeworks.css",
  "./package.json": "./package.json"
}
```

4. 如果实际 Vite 输出 CSS 文件名不是 `uiframeworks.css`，必须显式配置或调整 exports，不能留下失效 export。
5. 构建后必须产出 `dist/uiframeworks.css` 或等价可导出的 CSS 文件；可以通过 library entry import `src/styles.css`、Vite 配置或显式 copy 实现，但 `@slotclientengine/uiframeworks/styles.css` 必须在 build 后可解析。
6. 添加 `src/index.ts`，只导出稳定 API；内部测试不要依赖未导出的私有函数，除非该函数确实应该成为公共或测试辅助 API。

### 6.2 实现布局与适配

1. 在 `layout.ts` 实现：
   - `calculateFrameScale(viewportWidth, viewportHeight, designSize)`
   - `validateDesignSize(designSize)`
   - `createDefaultSlotLayout(designSize)` 或同等布局计算。
2. 所有无效尺寸必须抛错。
3. 在 `dom.ts` 创建 page、frame、game layer、overlay。
4. 在 `dom.ts` 实现 resize 监听，并更新 CSS variable 或 inline style。
5. `destroy()` 必须移除 resize listener、UI event listener，并调用 `gameAdapter.destroy()`。

### 6.3 实现 DOM UI 控件

1. 使用 DOM 创建：
   - menu button
   - sound toggle
   - fast toggle
   - bottom banner
   - balance display
   - win display
   - bet stepper
   - minus button
   - plus button
   - spin button
   - auto button
   - error/status 区域
2. 每个交互控件必须有可访问名称：
   - `aria-label`
   - 或可见文字 + 合理 role。
3. toggle 控件必须同步：
   - `aria-pressed`
   - `data-*` 状态
   - CSS class 或 attribute selector。
4. disabled 控件必须同步：
   - `disabled`
   - `aria-disabled` 如不是原生 button。
5. DOM 中可以使用 `span`、`div`、`button` 等元素配合 CSS 绘制图标。
6. 不允许使用：
   - `<canvas>`
   - `document.createElement("canvas")`
   - `new OffscreenCanvas`
   - `<svg>`
   - 图片文件
   - icon font

### 6.4 实现 CSS

`styles.css` 要求：

- 使用 `.slot-ui-*` 前缀，避免污染游戏层和其它 app。
- 通过 CSS 绘制所有 UI 元素。
- 不引入外部字体、图片、SVG。
- 使用固定设计分辨率中的像素尺寸，同时通过 frame scale 统一缩放。
- 文本不得依赖 viewport width 动态缩放。
- 字母间距使用 `0`，不要使用负 letter-spacing。
- 底部 banner 和按钮可以使用渐变、阴影、border、pseudo-element、clip-path，但不能使用图片。
- 声音/快速关闭态通过灰度、opacity 和斜线表现。
- 长金额场景必须处理：
  - `min-width: 0`
  - `overflow: hidden`
  - 合理的 `max-width`
  - 必要时换行或缩小金额容器内部排布，不能互相覆盖。

推荐视觉方向：

- 底部 banner 使用深色半透明底、金色或青色细线高光，避免整页只有紫色。
- spin 使用更醒目的圆形主按钮。
- auto 使用圆形次级按钮。
- balance、bet、win 在 banner 内做紧凑信息块，不要做浮在页面上的大卡片。

### 6.5 实现状态管理

在 `state.ts` 实现纯状态转换：

- 初始化状态：
  - balance loading 或 initial balance
  - current bet index
  - win amount
  - muted
  - fast mode
  - auto mode
  - spin state
  - error message
- `setBetIndex(index)`
- `increaseBet()`
- `decreaseBet()`
- `setBalance(balance)`
- `setWinAmount(win)`
- `setMuted(muted)`
- `setFastMode(enabled)`
- `setAutoMode(enabled)`
- `setSpinState(state)`
- `setError(error)`

校验要求：

- bet options 不能为空。
- bet/lines/times 必须是 finite positive number 或 positive integer，按字段语义严格校验。
- current bet index 必须合法。
- balance/win 必须是 finite number。
- 状态转换不得修改调用方传入的原始数组或对象。

### 6.6 实现 netcore + logiccore session

在 `session.ts` 实现 live session：

1. 校验 `serverUrl` 只允许 `ws://` 或 `wss://`。
2. 创建 `SlotcraftClient`。
3. 设置 `maxReconnectAttempts: 0`。
4. 设置 `autoCollectIntermediateResults: true`，除非调用方显式提供其它策略。
5. 注入 fail-fast logger：
   - `warn` 触发失败。
   - `error` 触发失败。
6. 监听 netcore 事件：
   - `error`
   - `disconnect`
   - `reconnecting`
   - `message`
7. `connect()` 顺序：
   - `client.connect(token)`
   - `client.enterGame(gamecode)`
   - 读取 `client.getUserInfo()`
   - 校验 balance
8. `spin()` 顺序：
   - 禁止并发 spin。
   - 根据当前 bet option 和显式 callback 构造 `SpinParams`。
   - `client.spin(params)`
   - 校验 spin result。
   - `createGameLogicFromGmi(gmi, meta)`。
   - 必要时 `client.collect()`。
   - 读取最新 `client.getUserInfo()`。
   - 返回 `SlotUiSpinResult`。
9. `disconnect()` 或 `destroy()`：
   - 标记预期断线。
   - 调用 `client.disconnect()`。

不要在 `session.ts` 里做这些事：

- 不要读取本地 fixture。
- 不要把 `http(s)` URL 当 replay。
- 不要把无效 GMI 替换成空对象。
- 不要在 `createGameLogicFromGmi` 失败时吞错。
- 不要把缺失 balance 静默改成 `0`。

### 6.7 组合 createSlotUiFramework

`createSlotUiFramework(options)` 需要把 UI、state、session、game adapter 组合起来：

1. 校验 options。
2. 清空或挂载到目标 root。
3. 创建 frame、game layer、overlay。
4. 调用 `gameAdapter.mount(gameLayer, context)`。
5. 创建 UI 控件，并绑定事件。
6. 暴露 `connect()`、`spin()` 等 public methods。
7. spin 成功后：
   - UI 进入 `spinning/collecting/idle` 合理状态。
   - 更新 win 和 balance。
   - 调用 `gameAdapter.applySpinResult(result)`。
8. spin 失败后：
   - UI 进入 `error` 状态。
   - 显示错误摘要。
   - Promise reject 原始错误或包装后的明确错误。

注意：如果 `gameAdapter.applySpinResult()` 失败，也必须进入 error 状态并 reject，不能认为网络成功就算 spin 成功。

### 6.8 初始化 viewer

`apps/uiframeworksviewer` 第一屏就是可交互 UI viewer，不做 landing page。

viewer 需要提供显式场景切换，用来测试 UI 布局：

- `default-portrait`：`941 x 1672`，普通 balance、bet、win。
- `small-mobile`：模拟窄屏，长金额不重叠。
- `landscape-letterbox`：横屏视口，frame 居中并完整可见。
- `long-numbers`：超长 balance、bet、win。
- `loading-and-disabled`：连接中、spin disabled、bet 边界 disabled。
- `win-state`：显示中奖金额。
- `toggles-off`：声音关闭、快速关闭，图标灰掉并显示斜线。
- `error-state`：明确错误消息。
- `auto-active`：auto 圆形按钮 active。

viewer 运行模式：

- 默认 `mock` 模式，只使用 `apps/uiframeworksviewer/src/mock-client.ts`，不连接真实服务器。
- mock 模式仍然要给 `uiframeworks` 传入显式 `ws://` mock URL 和 `clientFactory`，不能通过缺少 live config 触发隐式 mock fallback。
- 可选 `live` 模式必须由显式 env 启用，例如：
  - `VITE_UIFRAMEWORKSVIEWER_MODE=live`
  - `VITE_UIFRAMEWORKSVIEWER_SERVER_URL`
  - `VITE_UIFRAMEWORKSVIEWER_TOKEN`
  - `VITE_UIFRAMEWORKSVIEWER_GAMECODE`
- 如果 mode 是 `live` 且必要 env 缺失，必须启动失败或进入明确错误状态。
- 如果 mode 是 `mock`，不得假装已经验证 live 服务器。

viewer 的 demo game layer：

- 使用 DOM 绘制一个简单的 game placeholder 或 slot reel placeholder。
- 不使用 canvas。
- 接收 `applySpinResult(result)` 并展示最近一次 `totalwin/results` 或 scene 摘要。
- 只作为 UI 布局测试工具，不承担真实游戏渲染。
- mock client 返回的 GMI 必须是 `createGameLogicFromGmi()` 能解析的最小合法数据；如果 mock 测试失败，应修正 mock fixture，不得放宽 `logiccore` 或 `uiframeworks` 的生产解析。

## 7. 测试计划

### 7.1 `packages/uiframeworks` 单元测试

必须覆盖以下测试文件或同等覆盖面：

`tests/layout.test.ts`：

- 固定设计分辨率 scale。
- 横屏、竖屏、窄屏、超高屏。
- invalid viewport/design size 抛错。

`tests/format.test.ts`：

- 默认金额格式。
- 自定义 formatter。
- invalid amount 抛错。
- 长金额不被截成错误数据，DOM 是否截断由 DOM/CSS 测试和 viewer 验收覆盖。

`tests/state.test.ts`：

- bet options 为空抛错。
- bet index 越界抛错。
- plus/minus 到边界 disabled。
- muted/fast/auto toggle 状态。
- spin state 转换。
- balance/win finite 校验。
- 状态转换不污染原始 options。

`tests/dom.test.ts`：

- 创建完整 DOM 结构。
- 控件存在且有 `aria-label` 或 `aria-pressed`。
- sound/fast off 状态有对应 data attribute/class。
- bet plus/minus 点击更新 DOM。
- spin 点击调用注入 handler。
- destroy 后事件不再触发。
- 源码路径不出现 canvas/svg/image 图标创建。

`tests/session.test.ts`：

- `http(s)` URL 明确失败。
- `ws(s)` URL 创建 client。
- connect 顺序正确。
- 缺失 balance 时失败。
- spin 并发失败。
- spin result 缺少 `gmi` 失败。
- spin result 缺少 `totalwin` 失败。
- spin result 缺少 `results` 失败。
- `results` 与 `gmi.replyPlay.results.length` 不一致失败。
- `createGameLogicFromGmi` 抛错时失败。
- 需要 final collect 时调用 collect。
- 不需要 final collect 时不调用 collect。
- netcore warn/error/event failure 会 reject 当前操作。
- unexpected disconnect 会 reject 当前操作。
- expected disconnect during destroy 不报错。

`tests/exports.test.ts`：

- 顶层 public API 可导入。
- CSS export 路径在 build 后可解析或 package exports 配置正确。

覆盖率要求：

- `packages/uiframeworks/vite.config.ts` 中 thresholds 设置为 `81`。
- `pnpm --filter @slotclientengine/uiframeworks test` 输出 statements、branches、functions、lines 均必须高于 80%。
- 如果为了测试通过出现奇怪生产写法，应优先修正测试或测试 fixture，不要削弱生产 fail-fast 行为。

### 7.2 `apps/uiframeworksviewer` 测试

viewer 至少覆盖：

- scenario 列表完整。
- mock client 可返回合法 spin result。
- mock client 可模拟 error。
- demo game adapter 会接收 `applySpinResult`。
- live mode 缺必要 env 明确失败。
- mock mode 不读取 live env。

viewer coverage 不需要强制超过 80%，但测试必须能稳定运行。

### 7.3 静态禁止项

执行以下命令应无输出：

```bash
rg -n "createElement\\(['\"]canvas|new OffscreenCanvas|<canvas" packages/uiframeworks/src apps/uiframeworksviewer/src
rg -n "<svg|createElementNS|\\.svg|\\.png|\\.jpg|\\.jpeg|icon-font|@font-face" packages/uiframeworks/src apps/uiframeworksviewer/src
```

如果 README 中为了说明“不允许 canvas”出现这些词，不要把 README 纳入上述 grep 路径。检查源码即可。

## 8. README 要求

### 8.1 `packages/uiframeworks/README.md`

必须包含：

- 包定位：通用 DOM slot UI 框架。
- 明确说明 UI 只使用 DOM/CSS，不创建 canvas。
- 安装/依赖说明：monorepo 内部包，依赖 `netcore` 和 `logiccore`。
- 基本用法：
  - import JS。
  - import CSS。
  - 创建 framework。
  - connect。
  - spin。
- game adapter 接口说明。
- live config 字段说明。
- bet options 说明。
- 设计分辨率与适配规则。
- 顶部按钮、底部 banner、spin、auto、balance、bet、win 的 DOM/CSS 约定。
- strict failure 策略。
- viewer 使用方式。
- 测试和构建命令。
- 依赖下载失败时的代理命令。

### 8.2 `apps/uiframeworksviewer/README.md`

必须包含：

- app 定位：UI 布局与状态 viewer。
- mock mode 和 live mode 的区别。
- 默认不连接真实服务器。
- 启动命令：

```bash
pnpm --filter uiframeworksviewer dev -- --host 0.0.0.0
```

- scenario 列表。
- 手动或浏览器验收视口列表。
- 如果使用 live mode，需要哪些 env。

## 9. 验收命令

如果依赖缺失或 lockfile 需要更新，先执行：

```bash
pnpm install
```

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

package-local 验收：

```bash
pnpm --filter @slotclientengine/uiframeworks lint
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter @slotclientengine/uiframeworks typecheck
pnpm --filter @slotclientengine/uiframeworks build
```

viewer 验收：

```bash
pnpm --filter uiframeworksviewer lint
pnpm --filter uiframeworksviewer test
pnpm --filter uiframeworksviewer typecheck
pnpm --filter uiframeworksviewer build
```

根级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

源码禁止项验收：

```bash
rg -n "createElement\\(['\"]canvas|new OffscreenCanvas|<canvas" packages/uiframeworks/src apps/uiframeworksviewer/src
rg -n "<svg|createElementNS|\\.svg|\\.png|\\.jpg|\\.jpeg|icon-font|@font-face" packages/uiframeworks/src apps/uiframeworksviewer/src
```

上述两个 `rg` 命令期望无输出。

viewer 视觉验收：

```bash
pnpm --filter uiframeworksviewer dev -- --host 0.0.0.0
```

打开 dev server 后至少检查以下视口：

- `375 x 667`
- `390 x 844`
- `941 x 1672`
- `1366 x 768`
- `1920 x 1080`

每个视口至少检查：

- frame 完整可见或按预期 letterbox。
- 顶部菜单、声音、快速按钮不重叠。
- 声音/快速关闭态灰掉并显示斜线。
- 底部 banner 可见。
- balance、bet、win 都在 banner 上。
- minus 和 plus 位于 bet 两侧。
- spin 按钮足够大且为圆形。
- auto 按钮为圆形。
- 长金额 scenario 不出现文字互相覆盖。
- error scenario 有明确错误，不吞错。
- 页面源码和运行 DOM 中没有 UI canvas。

如果无法进行浏览器/手动视觉验收，任务报告必须明确写“未执行浏览器视觉验收”，不能暗示已经验收。

## 10. agents.md 同步规则

默认情况下，本任务只是新增 package 和 app，不改变仓库级协作规则，因此不需要修改 `agents.md`。

只有出现以下情况之一，才需要同步更新 `agents.md`：

- 新增了仓库级 UI 框架目录规范。
- 新增了全仓库必须遵守的 DOM/CSS 规则。
- 新增或改变了基础脚本约定。
- 改变了依赖安装、测试、构建、格式化的仓库级规则。

如果没有修改 `agents.md`，任务报告必须写明：

```text
本任务未改变仓库协作规则、目录规范或基础脚本，因此未更新 agents.md。
```

## 11. 完成标准

完成时必须满足：

- `packages/uiframeworks` 存在且可通过 package-local lint/test/typecheck/build。
- `apps/uiframeworksviewer` 存在且可通过 app-local lint/test/typecheck/build。
- `@slotclientengine/uiframeworks` 依赖 `@slotclientengine/netcore` 和 `@slotclientengine/logiccore`。
- `uiframeworks` 生产路径只接受 live `ws(s)`，不使用 replay URL 或 fixture 兜底。
- GMI 校验严格，非法结果会失败。
- UI 使用 DOM/CSS，不使用 canvas、SVG、图片图标或 icon font。
- 底部 banner、balance、bet、plus/minus、win、spin、auto、顶部菜单、声音、快速都已实现。
- 声音/快速是 toggle 风格，关闭态灰掉并有斜线。
- spin 和 auto 都是圆形，spin 明显更大。
- 基础库 coverage 四项均高于 80%，配置阈值为 81。
- README 已完成。
- viewer 覆盖不同布局状态。
- 验收命令全部通过，或者任务报告明确记录未通过命令、错误原因和剩余风险。
- `tasks/26-uiframeworks-dom-slot-ui-bootstrap-[utctime].md` 中文任务报告已创建。

## 12. 任务报告要求

任务完成后新增报告文件：

```text
tasks/26-uiframeworks-dom-slot-ui-bootstrap-[utctime].md
```

`utctime` 使用 UTC 时间，可用命令生成：

```bash
date -u +"%y%m%d-%H%M%S"
```

报告必须包含：

- 任务摘要。
- 新增/修改文件列表。
- public API 摘要。
- UI 布局与 CSS 绘制说明。
- netcore/logiccore 数据流说明。
- fail-fast 行为说明。
- coverage 结果，必须列出 statements、branches、functions、lines。
- 执行过的命令和结果。
- viewer 视觉验收结果，列出检查过的视口。
- 是否更新 `agents.md`；若未更新，写明原因。
- 未完成项或风险；没有则写“无已知遗留问题”。

## 13. 非目标

本任务不做：

- 不实现真实自动连发 spin，除非另有显式配置和测试。
- 不实现 paytable、菜单弹窗、设置面板、历史记录、规则页。
- 不实现具体游戏 reel 渲染。
- 不把 `uiframeworksviewer` 当作真实游戏。
- 不改变 `logiccore` 的 GMI 语义。
- 不改变 `netcore` 的 replay 能力；只是在 `uiframeworks` 生产路径拒绝 `http(s)`。
- 不为了旧测试 fixture 放宽生产解析逻辑。
