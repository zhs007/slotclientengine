# game001 gameframeworks integration 任务计划

## 1. 任务目标

将 `apps/game001` 重构为直接基于 `packages/gameframeworks` 的 slot 游戏 app。重构后，`game001` 必须把 live 连接、enter game、spin、GMI 基础校验、`GameLogic` 创建、HUD 状态、余额/下注/win 展示和最终 collect 交给 `@slotclientengine/gameframeworks`，自身只保留 game001 专属的 Pixi 渲染、资源加载、布局校准、主转轮动画和 `GameLogic -> scene -> reel` 适配。

本计划是完整可执行版本，不依赖其它上下文。执行者只需要阅读本文件，即可完成实现、测试、README、浏览器验收、协作规则审计和任务报告。

核心目标：

- `apps/game001` 运行态必须直接创建并使用 `createSlotGameFramework()`。
- `apps/game001` 的业务入口默认依赖 `@slotclientengine/gameframeworks`，不能继续自己维护 live client / collect / GMI 基础解析流程。
- `apps/game001` 可以继续直接依赖 `@slotclientengine/rendercore` 和 `pixi.js`，因为 gameframeworks 不负责游戏画面渲染。
- `apps/game001` 不应继续直接依赖 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`。如果需要 `logiccore` 的游戏配置能力，优先在 `packages/gameframeworks` 中做窄重导出并补测试，再由 `game001` 从 `@slotclientengine/gameframeworks` 导入。
- 移除或废弃 `apps/game001/src/game-client.ts` 中的 app 私有 live client、fail-fast monitor、`validateGame001SpinResult()` 和 `shouldCollectGame001FinalResult()`，对应职责应由 `gameframeworks` 承担。
- 移除 Pixi 内自定义 `Spin` 按钮的生产路径，使用 `gameframeworks` / `uiframeworks` HUD 提供的 spin 按钮和状态禁用逻辑，避免页面出现两套 spin 入口。
- 保留现有 game001 视觉合同：`941 x 1672` 竖屏舞台、`bk.jpg` / `logo.png` / `reels1bk.png` / `reels2bk.png`、主转轮内框校准、第 4 轴锁定显示、SC/RS/X 倍数图标缩放与动画规则。
- `adapter.playSpin(logic)` 必须在 game001 reel 动画真正完成后才 resolve；`gameframeworks` 随后才能根据协议执行最终 collect。不能再保持当前 README 所描述的“collect 后再启动 reel 动画”时序。
- 不增加静默 mock、fixture、replay、默认 GMI、默认 scene、默认贴图替代等生产兜底。资源、配置、协议、scene、停轴反查、动画一致性、网络状态错误都要 fail-fast。
- 如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

- 任务完成后，需要新增中文任务报告：`tasks/37-game001-gameframeworks-integration-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒，例如 `260401-181300`。
- 如果实现过程中改变仓库协作规则、目录规范或基础脚本，需要同步更新根目录 `agents.md`；如果没有改变，任务报告必须说明无需更新的理由。

## 2. 当前仓库事实

仓库事实：

- 仓库根目录：`/Users/zerro/github.com/slotclientengine`
- 技术栈：`pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求：`>=24.0.0`。
- pnpm 要求：`>=10.0.0`。
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
- 根目录协作文件实际路径：`agents.md`。当前 `AGENTS.md` 与 `agents.md` 是硬链接，更新任一文件会同步到另一个；如果任务改动协作规则，验收时仍要确认两者未分叉。
- 新增空目录必须放置 `.keepme`。
- 当前协作规则已经写明：后续游戏默认依赖 `@slotclientengine/gameframeworks`，不要直接依赖 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore`，除非是在框架内部或任务明确要求。

`packages/gameframeworks` 当前事实：

- 包路径：`packages/gameframeworks`
- 包名：`@slotclientengine/gameframeworks`
- 入口：`packages/gameframeworks/src/index.ts`
- 样式入口：`@slotclientengine/gameframeworks/styles.css`
- 当前已导出：
  - `createSlotGameFramework(options)`
  - `buildSpinParams(...)`
  - `SlotGameLiveSession`
  - `validateLiveServerUrl(...)`
  - `createSlotGameLogicResult(...)`
  - `shouldCollectFinalResult(totalwin, results)`
  - `findComponentSteps(...)`
  - `getComponentScenesByName(...)`
  - `getComponentResultsByName(...)`
  - 类型：`GameLogic`、`GameLogicMeta`、`GameLogicStep`、`LogicComponent`、`SceneMatrix`、`SlotGameAdapter`、`SlotGameFramework`、`SlotGameFrameworkOptions`、`SlotGameInitialState`、`SlotGameLiveConfig`、`SlotGameMountContext`、`SlotGameSpinRequest`、`SlotGameSpinState`、`SlotGameStateSnapshot`、`WinResult`
- `createSlotGameFramework()` 会创建 UI controller，向 game adapter 提供：
  - `context.frame`
  - `context.gameLayer`
  - `context.overlay`
  - `context.getState()`
- `gameframeworks` 当前 spin 时序：

```text
UI spinning
  -> netcore spin
  -> createSlotGameLogicResult(rawResult)
  -> UI presenting
  -> adapter.playSpin(logic)
  -> adapter.playSpin resolve
  -> optional collect
  -> UI idle
```

- `adapter.playSpin(logic)` reject 时，不 collect，框架进入 error。
- collect 失败时，框架进入 error，不静默回 idle。
- 最终 collect 规则已经在 `packages/gameframeworks/src/collect.ts` 中稳定为：

```ts
(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1)
```

- `SlotGameLiveSession` 创建 `SlotcraftClient` 时使用：
  - `maxReconnectAttempts: 0`
  - `autoCollectIntermediateResults: true`
  - logger warn/error fail-fast
  - server failure message fail-fast
- `gameframeworks` live URL 只接受 `ws://` 或 `wss://`，不接受 `http(s)` replay。

`packages/gameframeworks` 当前缺口：

- 当前没有重导出 `createGameConfig`、`LogicGameConfig`、`LogicReels` 等 game config 能力。
- `apps/game001` 的转轮停轴反查需要 `createGameConfig(rawGameConfig)` 和 `gameConfig.getStopYCoordinates(...)`。
- 为符合 gameframeworks 规范，本任务应优先在 `packages/gameframeworks` 增加窄重导出，而不是让 `apps/game001` 继续直接导入 `@slotclientengine/logiccore`。

`apps/game001` 当前事实：

- app 路径：`apps/game001`
- 当前 `package.json` 业务依赖：
  - `@slotclientengine/logiccore`
  - `@slotclientengine/netcore`
  - `@slotclientengine/rendercore`
  - `pixi.js`
- 当前 `prepare:deps`：

```json
"pnpm --filter @slotclientengine/logiccore build && pnpm --filter @slotclientengine/rendercore build && pnpm --filter @slotclientengine/netcore build"
```

- 当前关键文件：

```text
apps/game001/src/main.ts
apps/game001/src/env.ts
apps/game001/src/game-client.ts
apps/game001/src/game-demo.ts
apps/game001/src/game-layout.ts
apps/game001/src/main-reels-view.ts
apps/game001/src/assets.ts
apps/game001/src/scene.ts
apps/game001/src/spin-button.ts
apps/game001/src/symbol-animation-config.ts
apps/game001/src/styles.css
apps/game001/tests/game-client.test.ts
apps/game001/tests/game-demo.test.ts
apps/game001/tests/main-reels-view.test.ts
apps/game001/tests/game-layout.test.ts
apps/game001/tests/scene.test.ts
apps/game001/tests/env.test.ts
apps/game001/README.md
```

- 当前 `main.ts` 自己创建 `.game001-page` / `.game001-frame`，自己初始化 Pixi canvas，自己创建 Pixi `Spin` 按钮，自己连接 `createGame001Client(config)`。
- 当前 `game-client.ts` 自己封装了 `SlotcraftClient`、`connect()`、`spin()`、GMI 校验、logicFactory、最终 collect 和 fail-fast monitor。
- 当前 `README.md` 写明 “Spin 点击后 ... 需要时先发送一次最终 collect，再启动 reel 动画”，这与 `gameframeworks` 的规范时序相反，必须修正。
- 当前 `apps/game001/vite.config.ts` 还存在 `@slotclientengine/logiccore` 和 `@slotclientengine/netcore` alias。重构后必须删除这些 alias，不能让构建配置继续绕开 `gameframeworks` facade。
- 当前 `apps/game001/vite.config.ts` 的 Vitest 环境是 `node`。重构后如果新增 `createSlotGameFramework()` 集成测试，会创建 DOM HUD，需要改为 `happy-dom` 或为相关测试显式指定 happy-dom 环境。
- 当前 `game-demo.ts` 负责：
  - `createGameConfig(rawGameConfig)`
  - `createReelSymbolRegistry(...)`
  - `createReelLayout(...)`
  - `createGame001MainReelsView(...)`
  - `applyScene(scene)`
  - `spinToScene(scene)`
  - `update(deltaSeconds)`
- 当前 `main-reels-view.ts` 已实现第 4 轴锁定显示：
  - 0-based `x = 3`
  - 中心行 `y = 2`
  - 锁定轴不 spin、不 bounce、不请求 `spinBlur`
  - spin 完成时硬切到目标 scene 的 `scene[3][2]`
- 当前 `scene.ts` 校验 game001 主 scene 必须为完整 `5 x 5`。

`apps/game001` 当前资源事实：

- `assets/game001/bk.jpg`：`941 x 1672`
- `assets/game001/logo.png`：`881 x 391`
- `assets/game001/reels1bk.png`：`1025 x 415`
- `assets/game001/reels2bk.png`：`751 x 641`
- `assets/gamecfg/game2.json`
- `assets/symbols/*.png`
- `assets/symbols/symbol-composites.json`
- `assets/symbols/symbol-state-textures.manifest.json`

`apps/game001` 当前 live 默认参数：

```text
serverUrl=wss://gameserv.rgstest.slammerstudios.com/
token=3a820433c341f7932d6654c4f16147a2
gamecode=CqbQ0Y7gtBpO5419j8h02
businessid=guest
clienttype=web
jurisdiction=MT
language=en
bet=10
lines=10
times=1
requestTimeoutMs=30000
```

注意：默认 token 可能随外部服务状态失效。实现不能因为 live 鉴权失败而切换 mock/replay/fixture；应 fail-fast，并在任务报告中区分外部服务失败和本地实现失败。

## 3. 设计边界

### 3.1 gameframeworks 与 game001 职责

`packages/gameframeworks` 负责：

- 创建通用 slot HUD。
- 管理 live 连接、enter game、spin、collect。
- 将 raw spin result 转为 `GameLogic`。
- 校验 `gmi`、`totalwin`、`results` 和 `logic.getTotalWin()` 一致性。
- 驱动 `balance`、`bet`、`win`、`spinState`。
- 在 `adapter.playSpin(logic)` resolve 后执行最终 collect。
- 对网络、协议、adapter reject、collect reject、logger warn/error、服务端错误消息 fail-fast。
- 向游戏重导出必要的 logic 类型和 helper。

`apps/game001` 负责：

- 解析 `VITE_GAME001_*` 环境变量并组装 `SlotGameLiveConfig`、下注配置和 spin 请求配置。
- 实现 `SlotGameAdapter`，把 Pixi canvas 挂到 `SlotGameMountContext.gameLayer`。
- 加载 `assets/game001`、`assets/gamecfg/game2.json`、`assets/symbols`。
- 通过 `GameLogic` 读取当前局面主 scene。
- 校验 scene 为 `5 x 5`。
- 用 game config 反查停轴 y。
- 用 `rendercore` 播放 game001 主转轮动画。
- 在动画完成后 resolve `playSpin(logic)`。
- 在 `applyInitialState(state)` 中处理 live `defaultScene`：存在则严格校验并应用，不存在则保持主转轮隐藏直到第一次 spin 完成。
- 在 `destroy()` 中销毁 Pixi app、取消 ticker/listener。
- 启动时不能为了等待 live 网络而白屏。`main.ts` 应先创建 framework/UI shell，再用 `void framework.connect().catch(...)` 或等价异步流程连接 live；不得用等待网络成功的 top-level await 阻塞首屏渲染。

`apps/game001` 不负责：

- 自己创建或持有 `SlotcraftClient`。
- 自己调用 `client.collect()`。
- 自己解析 raw `gmi.replyPlay` 来判断 `results` 长度。
- 自己维护 `shouldCollectFinalResult()`。
- 自己实现 netcore fail-fast monitor。
- 自己渲染一套独立于 gameframeworks 的生产 spin 按钮。
- 在 live 失败时切换本地 fixture。
- 用默认 scene、旧画面、透明图、其它 symbol、空图标掩盖资源或协议错误。

### 3.2 允许保留的直接依赖

`apps/game001/package.json` 重构后建议：

```json
"dependencies": {
  "@slotclientengine/gameframeworks": "workspace:*",
  "@slotclientengine/rendercore": "workspace:*",
  "pixi.js": "^8.1.6"
}
```

说明：

- `@slotclientengine/gameframeworks` 是默认 facade，负责 UI、live、logic。
- `@slotclientengine/rendercore` 是游戏画面渲染核心，gameframeworks 当前不覆盖该职责，可以保留。
- `pixi.js` 是 game001 的渲染运行时，可以保留。
- 不应保留 `@slotclientengine/netcore` 和 `@slotclientengine/logiccore` 作为 game001 直接依赖。
- 不应新增 `@slotclientengine/uiframeworks` 作为 game001 直接依赖。
- 如果新增 framework flow / adapter DOM 测试，`devDependencies` 应增加 `happy-dom`，版本与仓库现有包保持一致，例如 `^20.0.10`。

如果执行中发现 `game001` 必须使用 `logiccore` 的 API：

1. 先判断是否属于游戏可消费的逻辑/配置 helper。
2. 如果是，将该 API 从 `packages/gameframeworks/src/index.ts` 窄重导出，并补 `packages/gameframeworks/tests/exports.test.ts`。
3. 更新 `packages/gameframeworks/README.md`，说明这是 game config / logic helper 的 facade 入口。
4. `apps/game001` 从 `@slotclientengine/gameframeworks` 导入该 API。
5. 只有在确实不适合进入 gameframeworks facade 时，才允许在 `apps/game001` 直接依赖 `logiccore`；必须在任务报告中写明原因、风险和替代方案。

本任务预期需要从 `gameframeworks` 重导出：

```ts
export { createGameConfig } from "@slotclientengine/logiccore";
export type { LogicGameConfig, LogicReels } from "@slotclientengine/logiccore";
```

如后续代码还需要 `GameConfigPaytableEntry`、`ReelStopYOptions` 等类型，同样优先通过 `gameframeworks` 窄重导出。

### 3.3 新运行时结构

建议新增或重构为以下结构。文件名可以按实现细节微调，但报告必须说明最终结构：

```text
apps/game001/src/framework-config.ts
apps/game001/src/game-adapter.ts
apps/game001/src/pixi-stage.ts
```

推荐职责：

- `framework-config.ts`
  - 保留并重构 `parseGame001Env(...)`。
  - 输出：
    - `live: SlotGameLiveConfig`
    - `betOptions: SlotGameBetOption[]`
    - `spinRequest: { bet, lines, times, autonums? }`
    - `formatMoney` 或 currency 配置（如需要）
  - 校验 env：空字符串、非法 URL、非正数必须失败。
  - `serverUrl` 仍只接受 `ws://` / `wss://`，可以直接复用 `validateLiveServerUrl()`。

- `game-adapter.ts`
  - 实现 `createGame001Adapter(options): SlotGameAdapter`。
  - `mount(context)`：
    - 使用 `context.gameLayer` 作为 Pixi canvas 容器。
    - 初始化 Pixi `Application`。
    - 加载静态资源和 symbol 资源。
    - 创建 `Game001ReelRuntime`。
    - 不创建独立生产 spin 按钮。
  - `applyInitialState(state)`：
    - 如果 `state.defaultScene` 存在，调用 `runtime.applyScene(validateGame001Scene(...))`。
    - 如果不存在，保持主转轮 hidden，不使用 fixture。
  - `playSpin(logic)`：
    - 从 `logic.getStep(0).getScene(0)` 或 `logic.getScene(0, 0)` 读取主 scene。
    - 调用 `validateGame001Scene(scene, "spin main scene")`。
    - 调用 `runtime.spinToScene(scene)`。
    - 返回一个 Promise，直到 ticker 检测 `runtime.update(...)` 完成后 resolve。
    - 如果动画过程中 scene 不一致、停轴反查失败或 runtime 抛错，reject，交给 gameframeworks 进入 error 且不 collect。
  - `setFrameworkState(state)`：
    - 可用于映射框架状态到 Pixi 层视觉状态。
    - 不要重新发起网络请求，不要调用 collect。
  - `destroy()`：
    - 停止 ticker。
    - 移除 DOM listener。
    - `app.destroy()`。

- `pixi-stage.ts`
  - 可承接当前 `main.ts` 中的 Pixi stage 初始化、静态 sprite 创建、texture size 校验等纯渲染逻辑。
  - 也可以不单独拆文件，只要 `main.ts` 不再承担大量渲染细节。

`main.ts` 重构后应尽量薄：

```ts
import {
  createSlotGameFramework,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import "./styles.css";
import { createGame001Adapter } from "./game-adapter.js";
import { parseGame001FrameworkConfig } from "./framework-config.js";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root.");
}

const config = parseGame001FrameworkConfig(import.meta.env);
const framework = createSlotGameFramework({
  root,
  gameAdapter: createGame001Adapter(),
  live: config.live,
  betOptions: config.betOptions,
  designSize: { width: 941, height: 1672 },
  brandLabel: "game001",
  buildSpinRequest: () => config.spinRequest,
  onError: (error) => {
    console.error(error);
  },
});

void framework.connect().catch((error) => {
  console.error(error);
});

window.addEventListener("beforeunload", () => framework.destroy());
```

实际实现可以保留更强的错误展示，但不能绕过 `gameframeworks` root / gameLayer / HUD 结构。

### 3.4 scene 与动画完成 Promise

`adapter.playSpin(logic)` 是 collect 时序的关键边界：

```text
gameframeworks 收到 raw spin result
  -> 创建 GameLogic
  -> 状态变为 presenting
  -> 调用 game001 adapter.playSpin(logic)
  -> game001 从 logic 提取 scene
  -> game001 播放 reel 动画
  -> 动画完成且最终视觉验收通过
  -> playSpin resolve
  -> gameframeworks 执行 optional collect
```

必须新增测试证明：

- `playSpin(logic)` 返回的 Promise 在动画未完成前不 resolve。
- 使用 fake client / fake adapter 时，`client.collect()` 不会早于 `playSpin` resolve。
- `playSpin(logic)` reject 时，`client.collect()` 不会发生，framework 状态进入 error。
- `totalwin=0 && results=2` 的多段零赢分仍然会在 `playSpin` resolve 后 collect。

如果测试实现需要 mock，请把 mock 放在测试内或测试 helper 内。生产代码不能暴露 mock/live 切换，也不能读取 fixture 作为运行态 fallback。

### 3.5 UI 与布局

重构后页面第一屏仍必须是游戏画面，不做 landing page。

`gameframeworks` 会创建：

```text
.slot-ui-page
  .slot-ui-frame
    .slot-ui-game-layer
    .slot-ui-overlay
```

`game001` 必须：

- 把 Pixi canvas append 到 `context.gameLayer`。
- 使用 `designSize: { width: 941, height: 1672 }`，保持与 `assets/game001/bk.jpg` 一致。
- 保持 `.slot-ui-page` 水平居中、垂直从顶部开始显示的布局。
- 保持 Pixi canvas backing size 为 `941 x 1672`。
- 保持 `bk.jpg`、`logo.png`、`reels1bk.png`、`reels2bk.png` 的实际尺寸校验。
- 保持主转轮相对于背景图坐标系的定位。
- 复用 `@slotclientengine/gameframeworks/styles.css`；`apps/game001/src/styles.css` 只补充 game001 canvas / 游戏层必要样式，不复制或覆盖整套 HUD。
- 确认 HUD 的 bottom controls 不会遮挡用户必须观察的主转轮区域；如需要只通过 CSS 对 game001 的 canvas/game layer 做兼容，不改 uiframeworks 通用布局。

建议移除或停用：

```text
apps/game001/src/spin-button.ts
```

如果保留该文件仅为历史或测试用途，生产 `main.ts` / adapter 不得导入它，README 必须说明生产 spin 入口来自 gameframeworks HUD。

### 3.6 fail-fast 规则

以下情况必须明确失败，不能兜底：

- `VITE_GAME001_SERVER_URL` 非 `ws://` / `wss://`。
- env 显式提供空字符串或非法数字。
- `root #app` 不存在。
- Pixi 初始化失败。
- 静态资源尺寸不等于预期尺寸。
- `symbol-composites.json` 与 `symbol-state-textures.manifest.json` 的 layered normal 或 SC keyframes 不一致。
- 缺少 required state texture。
- `GameLogic` 没有 step 0 / scene 0。
- 主 scene 不是完整 `5 x 5`。
- `gameConfig.getStopYCoordinates()` 无法反查完整 5 轴停轴。
- 第 4 轴锁定 symbol 是 empty symbol 或未知 symbol。
- 普通轴 spin 完成后 visible scene 与目标 scene 对应列不一致。
- 锁定轴最终显示 code 与 `scene[3][2]` 不一致。
- adapter 动画过程中抛错。
- `gameframeworks` 进入 error。
- live 鉴权失败、断线、服务端 notice/error、logger warn/error。

不允许：

- live 失败后切到 mock。
- `http(s)` replay URL。
- 用本地 `gamemoduleinfo-basic.json` 当运行态初始 scene。
- 用旧画面假装新 spin 成功。
- 在 collect 失败后仍让下一次 spin 静默继续。
- 为了等待 live connect 或 spin 网络 Promise，让首屏一直不渲染或主线程长时间卡住。
- 为了测试方便在生产逻辑中加入宽松分支。

## 4. 文件计划

### 4.1 预计修改 `packages/gameframeworks`

如 `game001` 需要 game config helper，修改：

```text
packages/gameframeworks/src/index.ts
packages/gameframeworks/README.md
packages/gameframeworks/tests/exports.test.ts
```

目标：

- 从 `@slotclientengine/gameframeworks` 重导出 `createGameConfig`。
- 重导出必要类型：`LogicGameConfig`、`LogicReels`。
- README 增加“游戏配置 helper”说明：游戏可以通过 facade 读取 game config / stop y，不直接依赖 `logiccore`。
- exports test 证明这些 API 存在。

不要把 `logiccore/node` 或文件系统 loader 重导出给浏览器 app。

### 4.2 预计修改 `apps/game001`

需要修改：

```text
apps/game001/package.json
apps/game001/src/main.ts
apps/game001/src/env.ts
apps/game001/src/game-demo.ts
apps/game001/src/main-reels-view.ts
apps/game001/src/scene.ts
apps/game001/src/styles.css
apps/game001/vite.config.ts
apps/game001/tests/env.test.ts
apps/game001/tests/game-demo.test.ts
apps/game001/tests/main-reels-view.test.ts
apps/game001/tests/scene.test.ts
apps/game001/README.md
```

建议新增：

```text
apps/game001/src/game-adapter.ts
apps/game001/src/framework-config.ts
apps/game001/tests/game-adapter.test.ts
apps/game001/tests/framework-flow.test.ts
apps/game001/tests/source-boundary.test.ts
```

建议删除或停用：

```text
apps/game001/src/game-client.ts
apps/game001/src/spin-button.ts
apps/game001/tests/game-client.test.ts
apps/game001/tests/spin-button.test.ts
```

如果没有物理删除，必须保证：

- 生产入口不导入它们。
- source-boundary test 能覆盖生产入口。
- README 不再将它们描述为运行态核心。
- 任务报告说明保留原因。

### 4.3 预计修改锁文件

如果 `apps/game001/package.json` 依赖有变化，需要执行：

```bash
pnpm install
```

并提交相应 `pnpm-lock.yaml` 更新。若依赖下载失败，先执行代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 5. 实现步骤

### 5.1 扩展 gameframeworks facade 的必要导出

1. 在 `packages/gameframeworks/src/index.ts` 增加窄重导出：

```ts
export { createGameConfig } from "@slotclientengine/logiccore";
export type { LogicGameConfig, LogicReels } from "@slotclientengine/logiccore";
```

2. 更新 `packages/gameframeworks/tests/exports.test.ts`：
   - 断言 `createGameConfig` 可从 `@slotclientengine/gameframeworks` 导入。
   - 断言 public type 导出不破坏现有导出。
3. 更新 `packages/gameframeworks/README.md`：
   - 增加“游戏配置 helper”小节。
   - 明确游戏仍通过 facade 使用这些 helper，不直接依赖 `logiccore`。
4. 运行：

```bash
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
```

### 5.2 重构 game001 package 边界

1. 修改 `apps/game001/package.json`：
   - 增加 `@slotclientengine/gameframeworks`。
   - 删除 `@slotclientengine/netcore`。
   - 删除 `@slotclientengine/logiccore`，除非第 3.2 节的例外被明确触发。
   - 保留 `@slotclientengine/rendercore`。
   - 保留 `pixi.js`。
   - 如新增 DOM 测试，在 `devDependencies` 增加 `happy-dom`，与 `packages/gameframeworks` / `apps/gameframeworksviewer` 当前版本保持一致。
   - 将 `prepare:deps` 改为：

```json
"pnpm --filter @slotclientengine/gameframeworks build && pnpm --filter @slotclientengine/rendercore build"
```

2. 执行 `pnpm install`，同步 `pnpm-lock.yaml`。
3. 新增 `apps/game001/tests/source-boundary.test.ts`：
   - 扫描 `apps/game001/src/**/*.ts`、`apps/game001/vite.config.ts` 和主要测试文件。
   - 不要扫描 `apps/game001/tests/source-boundary.test.ts` 自身，因为该文件需要包含被禁止 import 的字符串作为断言目标。
   - 断言不包含：
     - `@slotclientengine/netcore`
     - `@slotclientengine/uiframeworks`
     - `@slotclientengine/logiccore`
   - 允许：
     - `@slotclientengine/gameframeworks`
     - `@slotclientengine/rendercore`
   - 断言 `package.json` dependencies 至少符合：

```ts
["@slotclientengine/gameframeworks", "@slotclientengine/rendercore", "pixi.js"]
```

如果测试 helper 因类型需要临时导入底层包，优先改为从 `gameframeworks` 重导出。不要为了测试绕开生产边界。

4. 修改 `apps/game001/vite.config.ts`：
   - 删除 `@slotclientengine/logiccore` alias。
   - 删除 `@slotclientengine/netcore` alias。
   - 不新增 `@slotclientengine/uiframeworks` alias。
   - 保留 `@slotclientengine/rendercore` / `@slotclientengine/rendercore/reel` alias。
   - 如确实需要源码 alias，最多增加 `@slotclientengine/gameframeworks` 指向 `../../packages/gameframeworks/src/index.ts`；如果沿用 `gameframeworksviewer` 的方式直接依赖已构建 workspace 包，也可以不加该 alias。
   - 更新 source-boundary test，覆盖 `vite.config.ts`，防止 alias 层面继续绕过 facade。
   - 如果新增 framework flow 测试，`test.environment` 改为 `"happy-dom"`，或只给对应测试文件加 Vitest 环境注释；优先使用统一 `"happy-dom"`，因为 game001 是浏览器 app。
   - 如果保留统一 `"node"` 环境，必须在任务报告中说明 framework flow 测试如何获得 DOM，以及为什么不会掩盖浏览器行为。

### 5.3 重构 env / config

1. 将 `apps/game001/src/env.ts` 重构为 facade 配置解析，或新增 `framework-config.ts` 并逐步迁移。
2. 输出类型建议：

```ts
import type {
  SlotGameBetOption,
  SlotGameLiveConfig,
  SlotGameSpinRequest,
} from "@slotclientengine/gameframeworks";

export interface Game001FrameworkConfig {
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex: number;
  readonly spinRequest: SlotGameSpinRequest;
}
```

3. 保留现有默认 env 值。
4. 可新增 `VITE_GAME001_AUTONUMS`，默认 `-1`，用于与 `gameframeworksviewer` / live smoke 参数一致；如果不新增，报告要说明 game001 仍只发送 `bet/lines/times` 的原因。
5. `serverUrl` 校验可调用 `validateLiveServerUrl(serverUrl)`，或保留现有等价校验。
6. 空字符串、非法数字、非正数继续 fail-fast。
7. 更新 `apps/game001/tests/env.test.ts`：
   - 默认配置输出 `live.serverUrl`、`live.token`、`live.gamecode` 等。
   - 默认 bet option 为 `{ bet: 10, lines: 10, times: 1 }`。
   - `buildSpinRequest` 使用的 `spinRequest` 与 env 一致。
   - `http://` / `https://` server URL 抛错。
   - 显式空 token/gamecode/businessid/clienttype/jurisdiction/language 抛错。
   - 非正数 bet/lines/times/requestTimeout 抛错。

### 5.4 新增 game001 SlotGameAdapter

1. 新增 `apps/game001/src/game-adapter.ts`。
2. 实现 `createGame001Adapter()`，返回 `SlotGameAdapter`。
3. `mount(context)`：
   - 清空或接管 `context.gameLayer` 内自己的内容，但不要替换 `context.frame` 或 `root`。
   - 创建 Pixi `Application`，尺寸 `941 x 1672`。
   - 将 canvas append 到 `context.gameLayer`。
   - 加载并尺寸校验：
     - `bk.jpg`
     - `logo.png`
     - `reels1bk.png`
     - `reels2bk.png`
   - 加载 symbol textures。
   - 创建 `Game001ReelRuntime`。
   - 添加背景、logo、主转轮背景、主转轮 layer、副转轮背景。
   - 不添加 Pixi Spin button。
4. `applyInitialState(state)`：
   - 若 `state.defaultScene` 存在，严格校验后 `runtime.applyScene(...)`。
   - 若不存在，不应用 fixture，不强造 scene。
5. `playSpin(logic)`：
   - 从 `logic` 获取主 scene：

```ts
const scene = validateGame001Scene(
  logic.getStep(0).getScene(0),
  "spin main scene",
);
```

   - 调用 `runtime.spinToScene(scene)`。
   - 将当前 Promise 保存为 pending animation。
   - ticker 每帧调用 `runtime.update(deltaSeconds)`。
   - 当 `result.completed === true` 时 resolve pending Promise。
   - 如果 ticker 捕获错误，reject pending Promise 并停止继续 resolve。
   - 如果 `playSpin` 被并发调用，抛错；理论上 framework 已防并发，但 app 仍要 fail-fast。
6. `setFrameworkState(state)`：
   - 可以更新内部只读状态缓存。
   - 不要改变 collect/spin 逻辑。
7. `destroy()`：
   - reject 尚未完成的 pending animation。
   - 停止 ticker。
   - 销毁 Pixi app。
   - 移除 canvas 和 listener。

### 5.5 简化 main.ts

1. `apps/game001/src/main.ts` 不再导入：
   - `createGame001Client`
   - `createGame001SpinButton`
   - `Application` / `Assets` / `Sprite` / `Text` 等大量 Pixi 细节，除非最终没有拆 adapter。
2. `main.ts` 应导入：
   - `createSlotGameFramework`
   - `@slotclientengine/gameframeworks/styles.css`
   - `createGame001Adapter`
   - `parseGame001FrameworkConfig`
   - `./styles.css`
3. 创建 framework：

```ts
const framework = createSlotGameFramework({
  root,
  gameAdapter: createGame001Adapter(),
  live: config.live,
  betOptions: config.betOptions,
  initialBetIndex: config.initialBetIndex,
  designSize: GAME_STAGE_SIZE,
  brandLabel: "game001",
  buildSpinRequest: () => config.spinRequest,
});
```

4. 调用：

```ts
void framework.connect().catch((error) => {
  console.error(error);
});
```

5. 不要 `await framework.connect()` 后才让页面出现 framework shell；网络连接失败应进入 framework error / HUD 状态或明确 fatal error，而不是让页面长时间空白。
6. 页面 fatal error 可以写入 root，但正常运行状态由 gameframeworks HUD 管理。
7. `beforeunload` 调用 `framework.destroy()`。

### 5.6 调整 game-demo / main-reels-view 导入

1. 将 `apps/game001/src/game-demo.ts` 中来自 `@slotclientengine/logiccore` 的导入改为 `@slotclientengine/gameframeworks` facade：

```ts
import {
  createGameConfig,
  type LogicGameConfig,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
```

2. 将 `apps/game001/src/scene.ts` 中 `SceneMatrix` 类型改为从 `@slotclientengine/gameframeworks` 导入。
3. 将 `apps/game001/src/main-reels-view.ts` 中 `LogicReels`、`SceneMatrix` 类型改为从 `@slotclientengine/gameframeworks` 导入。
4. 保留 `@slotclientengine/rendercore` / `@slotclientengine/rendercore/reel` 导入。
5. 不改变 `rendercore` 的通用实现，除非发现真正通用的 bug；若修改 rendercore，必须补 rendercore 测试并在报告中说明。

### 5.7 删除重复 client 与 collect 逻辑

1. 删除或停用 `apps/game001/src/game-client.ts`。
2. 删除或替换 `apps/game001/tests/game-client.test.ts`。
3. 原测试中以下内容不再属于 game001：
   - `SlotcraftClient` options 组装。
   - `autoCollectIntermediateResults` 验证。
   - final collect 触发。
   - netcore logger/event fail-fast monitor。
   - raw GMI `results` 长度校验。
4. 这些行为应由 `packages/gameframeworks` 测试覆盖。若发现 gameframeworks 缺测试，则补到 `packages/gameframeworks/tests/*`，不要在 game001 里复制生产逻辑。
5. game001 需要保留的测试：
   - env 到 framework config。
   - `GameLogic` scene 提取和 `5 x 5` 校验。
   - defaultScene 存在/缺失时 adapter 行为。
   - Pixi runtime / main reels view 行为。
   - adapter animation Promise 时序。

### 5.8 新增 framework flow 集成测试

新增 `apps/game001/tests/framework-flow.test.ts`，使用 fake client 和轻量 adapter 或可注入 adapter dependency 验证 game001 与 gameframeworks 的关键合同。

该测试会创建 `HTMLElement` 和 framework HUD，测试环境需要 DOM。推荐将 `apps/game001/vite.config.ts` 的 `test.environment` 改为 `"happy-dom"`，并在 `apps/game001/package.json` devDependencies 增加 `happy-dom`。

至少覆盖：

- `createSlotGameFramework` 使用 game001 config 发出 `spin` 请求，参数包含 `bet/lines/times`，如启用 `autonums` 也要包含。
- `applyInitialState` 收到 live `defaultScene` 后调用 game001 runtime apply。
- `playSpin` 未完成前 fake client 的 `collectCalls` 仍为空。
- 完成动画 Promise 后，中奖结果触发 collect。
- `totalwin=0 && results=1` 不触发 collect。
- `totalwin=0 && results=2` 在动画完成后触发 collect。
- adapter reject 时不 collect，framework 状态为 `error`。
- 并发调用 `framework.spin()` fail-fast。

测试可复用 `gameframeworks` 的 public types，但不要从 `packages/gameframeworks/tests/test-helpers.ts` 直接导入测试内部 helper，避免测试跨包耦合。可以在 `apps/game001/tests/helpers` 内创建本 app 的 fake client。

### 5.9 更新 README

更新 `apps/game001/README.md`：

- 首段改为：`game001` 是基于 Pixi、`@slotclientengine/gameframeworks` 和 `@slotclientengine/rendercore` 的 live slot demo。
- 说明生产入口：
  - `createSlotGameFramework()`
  - `SlotGameAdapter`
  - Pixi canvas 挂载到 `context.gameLayer`
- 删除或修正“先 collect 再启动 reel 动画”的旧描述。
- 新时序必须写成：

```text
点击 framework HUD Spin
  -> gameframeworks live spin
  -> gameframeworks 创建 GameLogic
  -> game001 adapter.playSpin(logic) 播放 reel
  -> reel 动画完成
  -> adapter.playSpin resolve
  -> gameframeworks optional collect
  -> HUD 回 idle
```

- 说明 game001 不直接调用 `collect()`。
- 说明 game001 不直接依赖 `netcore` / `logiccore` / `uiframeworks`。
- 保留 live env 表，并补充 `VITE_GAME001_AUTONUMS`（如果实现中新增）。
- 保留 fail-fast 常见失败说明。
- 更新命令：

```bash
pnpm --filter game001 dev -- --host 127.0.0.1 --port 5205
pnpm --filter game001 lint
pnpm --filter game001 test
pnpm --filter game001 typecheck
pnpm --filter game001 build
```

### 5.10 更新样式

1. `apps/game001/src/styles.css` 不再定义完整 `.game001-page` / `.game001-frame` 作为生产根布局。
2. 保留或新增针对 gameframeworks game layer 的样式，例如：

```css
.slot-ui-game-layer canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

3. 不要复制 `@slotclientengine/uiframeworks/styles.css` 内容。
4. 确认页面不是单一深色空白：背景、logo、主转轮、副转轮和 HUD 都应可见。
5. 确认 HUD 按钮文字/数值不溢出，不遮挡主转轮核心验收区域。

## 6. 验收命令

如果修改了 `package.json` 或 lockfile，先运行：

```bash
pnpm install
```

如果依赖下载失败，使用：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

`gameframeworks` 验收：

```bash
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/gameframeworks format:check
```

`game001` 验收：

```bash
pnpm --filter game001 lint
pnpm --filter game001 test
pnpm --filter game001 typecheck
pnpm --filter game001 build
pnpm --filter game001 format:check
```

根级回归：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
pnpm format:check
git diff --check
```

如果根级 `pnpm format:check` 因任务外既有 `coverage/`、`dist/` 或其它包失败：

- 不要为了通过本任务随意格式化/删除任务外产物。
- 记录失败包和失败文件。
- 确认本任务相关包的 `format:check` 已通过。
- 在任务报告中写明根级失败是否为既有问题。

## 7. 浏览器验收

启动本地 dev server：

```bash
pnpm --filter game001 dev -- --host 127.0.0.1 --port 5205
```

如果端口占用，换一个空闲端口，例如 `5206`。不要假设浏览器里看到的就是新进程，先确认终端输出的实际 URL。

浏览器至少验收：

- 首屏不是 landing page，是 game001 游戏画面。
- DOM 中存在 `.slot-ui-page`、`.slot-ui-frame`、`.slot-ui-game-layer`、`.slot-ui-overlay`。
- Pixi canvas 位于 `.slot-ui-game-layer` 内。
- 背景、logo、主转轮背景、副转轮背景可见。
- 生产页面只有 gameframeworks HUD spin 入口，不再出现 Pixi 自绘 Spin 按钮作为第二入口。
- 初始连接中 HUD 状态从 `connecting` 进入 `idle` 或外部 live 错误进入 `error`。
- live 连接 pending 期间页面不能白屏；至少应可见 framework shell、HUD 或 game layer 的加载状态。
- 如果 live `defaultScene` 存在，主转轮显示对应 scene。
- 如果 live `defaultScene` 不存在，主转轮在第一次 spin 结算前保持隐藏，不用 fixture 顶替。
- 点击 HUD Spin 后按钮禁用，状态进入 `spinning` / `presenting`。
- reel 动画播放期间不 collect；动画完成后才允许框架 collect 并回 `idle`。
- 断网、鉴权失败、server notice/error 时页面进入明确 error，不切换 mock/replay。
- 窄屏和桌面视口下，canvas/HUD 文本不互相重叠，不出现关键按钮文字溢出。

如果外部 live token 已失效：

- 浏览器 live 失败可以作为外部依赖失败记录。
- 仍必须通过单元/集成测试证明本地 `gameframeworks` 接入、动画 Promise 和 collect 时序正确。
- 不允许添加 mock fallback 让生产页面“看起来通过”。

## 8. 验收标准

实现完成必须同时满足：

- `apps/game001` 生产代码使用 `createSlotGameFramework()`。
- `apps/game001` 生产代码实现 `SlotGameAdapter`，并把 Pixi canvas 挂到 `context.gameLayer`。
- `apps/game001/package.json` 不再直接依赖 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`，除非报告明确说明第 3.2 节例外。
- `apps/game001/src` 不再直接导入 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`。
- `apps/game001` 仍可直接依赖 `@slotclientengine/rendercore` 和 `pixi.js`。
- `game001` 不再自己调用 `collect()`。
- `game001` 不再自己维护 `shouldCollectGame001FinalResult()`。
- `game001` 不再自己创建 `SlotcraftClient`。
- live connect / spin 等网络 Promise 不阻塞首屏渲染，不使用等待网络成功的 top-level await。
- `adapter.playSpin(logic)` 在 reel 动画完成后 resolve。
- `gameframeworks` collect 发生在 `adapter.playSpin(logic)` resolve 之后。
- adapter reject 时不 collect。
- `totalwin=0 && results=2` 的最终 collect 规则仍保留。
- live URL 继续只接受 `ws://` / `wss://`。
- 没有 replay/mock/fixture 生产 fallback。
- 主转轮完整保留第 4 轴锁定规则。
- 主转轮动画完成后 visual snapshot 与目标 scene 的 game001 验收口径一致。
- 资源尺寸和 symbol manifest/composite 校验仍 fail-fast。
- README 与实现时序一致。
- 如果改了 `gameframeworks` public API，README 和 exports test 同步。
- 如果改了协作规则，`agents.md` 同步；如果没改，报告说明无需更新。
- 所有第 6 节相关命令完成并在报告中记录结果。

## 9. 任务报告要求

完成后新增报告：

```text
tasks/37-game001-gameframeworks-integration-[utctime].md
```

其中 `[utctime]` 使用 UTC 年月日时分秒，例如：

```text
tasks/37-game001-gameframeworks-integration-260622-083000.md
```

报告必须包含：

- 实现摘要。
- 最终文件变更清单。
- `apps/game001` 新架构说明。
- `gameframeworks` public API 是否有新增重导出。
- `game001` 最终直接依赖清单。
- 删除/停用 `game-client.ts` 和 `spin-button.ts` 的说明。
- spin / animation / collect 时序说明。
- fail-fast 边界说明。
- README 更新说明。
- `agents.md` 是否更新；如未更新，写明“本任务没有改变仓库协作规则、目录规范或基础脚本，因此无需更新”。
- 所有验收命令及结果。
- 浏览器验收 URL、步骤和结果。
- 如果 live token 或外部服务器失败，写明失败消息、复现命令和为什么不是本地代码 fallback 的理由。
- 未完成项或风险；没有则写“无”。

生成 UTC 时间命令：

```bash
date -u +%y%m%d-%H%M%S
```

## 10. 二次遗漏检查

提交任务报告前，执行以下检查：

- `rg -n "@slotclientengine/(netcore|logiccore|uiframeworks)" apps/game001/src apps/game001/tests apps/game001/package.json apps/game001/vite.config.ts --glob '!source-boundary.test.ts'`，确认没有不该存在的直接依赖或 alias；`source-boundary.test.ts` 自身允许包含这些字符串作为禁止项断言。
- `rg -n "collect\\(|shouldCollectGame001FinalResult|SlotcraftClient|createGame001Client" apps/game001/src apps/game001/tests`，确认 app 不再维护网络/collect 职责。
- `rg -n "spin-button|createGame001SpinButton|game001 spin" apps/game001/src apps/game001/README.md`，确认没有生产第二 spin 入口。
- `rg -n "collect.*动画|动画.*collect|replay|fixture|mock" apps/game001/README.md apps/game001/src`，确认文档和生产代码没有旧时序或兜底描述。
- 检查 `apps/game001/package.json` 和 `pnpm-lock.yaml` 是否一致。
- 检查 `packages/gameframeworks/README.md` 与新增 public API 是否一致。
- 检查 `apps/game001/README.md` 中命令、env、时序、依赖说明是否与代码一致。
- 检查 `agents.md` 是否需要同步；如无需同步，报告必须写明理由。若改动协作规则，执行 `ls -li AGENTS.md agents.md` 或 `diff -u AGENTS.md agents.md`，确认硬链接/内容没有分叉。
- 检查 `git diff --check`。
- 检查没有为了通过测试而加入生产宽松 fallback。
- 检查没有误改任务外包、生成物或无关格式化内容。
