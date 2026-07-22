# Task 118：gameloading 控制层与 Loading UI 彻底解耦

## 1. 任务目标

本任务在最新 `main` 分支上完成 loading 模块的完整重构，把“加载流程”和“加载界面”拆成稳定、可复用、可独立测试的两层：

```text
@slotclientengine/gameloading
  - 资源加载
  - 进度计算
  - 99% / 100% 生命周期
  - prepare / enter / error / destroy
  - Loading UI interface

@slotclientengine/gameloading-ui-simple
  - 当前 gameloading 的简单 DOM UI

@slotclientengine/gameloading-ui-leo
  - Leo 品牌 Loading UI
  - 原生 DOM + CSS
  - 不使用 React
```

任务完成后：

1. `packages/gameloading` 只保留 loading controller、资源 loader、生命周期和 UI contract，不再包含任何具体 UI 实现。
2. 当前 `packages/gameloading/src/dom.ts` 的简单进度条 UI 被迁移为独立包 `packages/gameloading-ui-simple`。
3. 新增独立包 `packages/gameloading-ui-leo`，参考 `test` 分支中的 Leo Loading 视觉和时序，使用原生 DOM/CSS 重写，不引入 React、Zustand、eventcore 或游戏 framework。
4. `apps/game002` 在保持 `main` 现有 loading、live session、game framework 和 adapter 生命周期不变的前提下，注入 Leo Loading UI。
5. `apps/game003` 继续使用简单 Loading UI，用来验证 UI 可替换性和默认路径兼容性。
6. 不实现 Wildsheep Loading UI，也不为 Wildsheep 建立占位组件、alias 或隐式 fallback。

本任务是 loading 子系统重构，不是新 framework 集成任务。不得把 `test` 分支中的 `game-leo-frameworks`、`ui-leo-frameworks`、`netcore2`、全局 store、EventEmitter 或 `stateData` 集成到 `main`。

任务完成后必须新增中文执行报告：

```text
tasks/118-gameloading-ui-refactor-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

## 2. 分支和参考来源

### 2.1 实现基线

本任务必须在最新 `main` 基线上实施。开始执行时必须重新确认：

```bash
git status --short --branch
git log -1 --oneline main
git log -1 --oneline origin/main
```

如果本地 `main` 落后于已获取的 `origin/main`，实现分支应基于最新可见的 `origin/main`。不得在 `test` 分支的提交上继续开发后再合并回 main。

本计划编写时使用的实现分支为：

```text
codex/task-118-loading-ui
```

其基线为当时可见的：

```text
origin/main b26af2a499998a0ed003fde81aefca21f1243119
```

执行者仍需以执行时仓库真实状态为准。

### 2.2 `test` 分支只作为 Leo UI 参考

必须查看 `test` 分支以下内容：

```text
packages/ui-leo-frameworks/src/components/leo_loading/index.tsx
packages/ui-leo-frameworks/src/components/leo_loading/loading.css
packages/ui-leo-frameworks/src/assets/loadingimg/loading2.gif
packages/ui-leo-frameworks/src/assets/loadingimg/logo_1.webp
packages/ui-leo-frameworks/src/assets/loadingimg/a2.webp
packages/ui-leo-frameworks/src/assets/loadingimg/a3.webp
```

本计划编写时参考的 `test` 提交为：

```text
d6969f20ba5721914659dca52c0fd48955ca3edb
```

参考内容仅包括：

- 黑色全屏背景；
- 首帧 logo；
- `loading2.gif` intro；
- intro 完成后显示 `a2.webp` / `a3.webp`；
- progress 驱动的径向和横向 reveal；
- GIF 加载失败/超时后仍允许继续；
- GIF 可用后约 `3200ms` 的 intro 展示时间。

以下实现不得带入 main：

- React component；
- `useState` / `useEffect` / `useRef`；
- `useInitStore`；
- `GameContainer`；
- `isGifPlaying` 全局状态；
- `completeLoading()`；
- `GameBridgeService`；
- WebSocket 初始化；
- `__PLATFORM__` Vite 源码替换；
- timestamp cache busting；
- Wildsheep UI。

不得 merge 或 cherry-pick `test` 的 framework 集成提交。需要使用的 Leo 图片资产必须以精确文件形式迁移，并在执行报告中记录来源提交、文件大小和校验值。

## 3. 仓库和环境约束

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- 代码检查：`eslint`
- 格式化：`prettier`

本任务不应增加任何第三方运行时依赖。

三个 loading 包都必须保持：

- 无 Pixi；
- 无 React；
- 无 Zustand；
- 无 eventcore；
- 无 `gameframeworks`；
- 无 `netcore`；
- 无 `logiccore`；
- 无 `rendercore`；
- 无远程运行时资源依赖。

Loading UI 包可以通过 TypeScript 的 type-only contract 引用 `@slotclientengine/gameloading`；构建产物不得产生对 controller 包的运行时 import。若 workspace/package 发布合同要求声明依赖，应使用最窄的 workspace dev/peer 关系，并通过最终产物检查证明 runtime import 已被擦除。

不得回滚工作区中与 Task 118 无关的用户改动。执行前后都要检查：

```bash
git status --short --untracked-files=all
git diff --stat
```

## 4. 当前 main 实现事实

### 4.1 `packages/gameloading`

当前 main 中 `packages/gameloading` 同时拥有：

- `src/controller.ts`：资源并发、权重进度、99%/100%、prepare/enter/error/destroy；
- `src/default-loaders.ts`：image/json/text/binary/wasm/module/style loader；
- `src/dom.ts`：具体简单 DOM UI 和内联 CSS；
- `src/types.ts`：资源、options、context 和 handle 类型；
- `tests/controller.test.ts`：controller 测试依赖具体 DOM selector/text；
- `tests/default-loaders.test.ts`；
- `tests/exports.test.ts`。

`controller.ts` 直接调用：

```ts
createGameLoadingDom(options.root)
```

因此 controller 与某一个 UI 实现绑定，无法注入不同品牌 UI。

### 4.2 当前生命周期

当前 main 已建立正确的核心顺序：

```text
load resources -> 99%
  -> await onBeforeComplete()
  -> 100%
  -> await onEnterGame()
```

Task 118 必须保持这个业务合同，不能采用 `test` 分支中“UI/GIF 自己触发 completeLoading，WebSocket 仍在后台等待”的实现。

需要在重构后进一步明确：

- UI 的视觉最短展示时间只能作为额外视觉 gate；
- UI 不能决定业务资源或 live session 是否完成；
- `onEnterGame` 成功前 Loading UI 应继续覆盖画面，避免正式游戏初始化期间出现白屏；
- `onEnterGame` 成功后才允许播放 Loading UI 退场并销毁；
- 任一阶段失败，Loading UI 保持可见并进入 error snapshot。

### 4.3 game002 / game003

当前 main 中：

- `apps/game002/src/main.ts` 使用 `createGameLoading()`；
- `apps/game003/src/main.ts` 使用同一个 API；
- 两个游戏都在资源到 99% 后调用各自 `prepareGameXXXAt99()`；
- live session 在 99% 准备；
- 100% 后才调用 `enterGameXXX()`；
- 当前 app 在 `onEnterGame` 成功后手工调用 `loading.destroy()` 和 `loadingHost.remove()`。

Task 118 完成后：

- controller 应统一拥有 UI exit/destroy 时序；
- app 不再在 `onEnterGame` 内反向调用 `loading.destroy()`；
- app 仍拥有自己的 `loadingHost` / `gameHost`；
- controller 成功退出时应让 loading root 不再参与布局或点击命中；
- error 时 loading root 必须保持可见；
- game002/game003 的 live session 和 framework destroy 逻辑保持原有合同。

## 5. 目标包结构

```text
packages/
  gameloading/
    src/
      controller.ts
      default-loaders.ts
      types.ts
      index.ts
    tests/
      controller.test.ts
      default-loaders.test.ts
      exports.test.ts

  gameloading-ui-simple/
    src/
      ui.ts
      index.ts
    tests/
      ui.test.ts
      exports.test.ts
    package.json
    README.md

  gameloading-ui-leo/
    src/
      ui.ts
      styles.ts
      progress.ts
      index.ts
    assets/
      loading2.gif
      logo_1.webp
      a2.webp
      a3.webp
    tests/
      ui.test.ts
      progress.test.ts
      exports.test.ts
      source-boundary.test.ts
    package.json
    README.md
```

包名固定为：

```text
@slotclientengine/gameloading
@slotclientengine/gameloading-ui-simple
@slotclientengine/gameloading-ui-leo
```

如果执行时发现现有 package naming/build 约束要求微调目录名，必须保持以上职责和依赖方向，并在执行报告中说明原因；不得把两个 UI 重新塞回 `gameloading`。

## 6. Loading UI 公共合同

公共 contract 归 `@slotclientengine/gameloading` 所有。第一版建议接口如下，实际字段可根据 TypeScript 实现做小幅调整，但必须保留同等语义。

```ts
export type GameLoadingUiPhase =
  | "loading-resources"
  | "preparing"
  | "entering-game"
  | "error";

export interface GameLoadingUiSnapshot {
  readonly phase: GameLoadingUiPhase;
  readonly progress: number;
  readonly error: string | null;
}

export interface GameLoadingUiCreateContext {
  readonly root: HTMLElement;
}

export interface GameLoadingUi {
  /**
   * UI 创建时即开始计时的纯视觉 gate。
   * 例如 Leo intro GIF 的最短展示时间。
   * 它不能代表资源、配置或 live session 已准备完成。
   */
  readonly readyToComplete?: Promise<void>;

  update(snapshot: GameLoadingUiSnapshot): void;

  /** 正式游戏已经成功进入后，播放 UI 退场。 */
  playExit?(): Promise<void>;

  /** 必须幂等；释放 DOM、style、timer、image listener。 */
  destroy(): void;
}

export interface GameLoadingUiFactory {
  create(context: GameLoadingUiCreateContext): GameLoadingUi;
}
```

### 6.1 单向状态流

状态只能由 controller 推给 UI：

```text
GameLoadingController
  -> immutable GameLoadingUiSnapshot
  -> Loading UI
```

Loading UI 不得：

- 修改 controller 内部 progress；
- 直接调用 `onBeforeComplete` / `onEnterGame`；
- 创建或访问 live session；
- 读取 URL token、gamecode 或 server；
- import game app；
- 通过全局 store 宣布 loading 完成；
- 删除 app 不属于 UI 的 DOM；
- 吞掉 controller error。

### 6.2 Snapshot 规则

- `progress` 必须是 `0..100` 的有限数；
- controller 对外 snapshot 使用不可变对象；
- 第一帧同步发布 `{ phase: "loading-resources", progress: 0 }`；
- 资源阶段只能显示 `0..99`；
- 资源完成并进入 `onBeforeComplete` 时发布 `phase="preparing", progress=99`；
- `onBeforeComplete` 和 UI `readyToComplete` 都完成后才发布 `progress=100`；
- 调用 `onEnterGame` 期间发布 `phase="entering-game", progress=100`；
- 任一阶段失败发布 `phase="error"`，保留失败时 progress，并提供 error message；
- destroy 后禁止继续 update。

### 6.3 UI 视觉 gate 规则

业务准备与视觉准备必须分开：

```text
businessReady = resources + onBeforeComplete/live session
visualReady   = ui.readyToComplete

进入 100% 前：await Promise.all([businessReady, visualReady])
```

`readyToComplete` 必须在 UI `create()` 时开始，而不是业务到 99% 后才开始计时。简单 UI 可以不提供这个 Promise；Leo UI 用它表达 intro 的最短展示时间。

`readyToComplete` reject 必须被视为 Loading UI 错误并进入 error，不允许静默进入游戏。Leo 的非关键动画图片加载失败应在 UI 内转为可用的基础视觉并 resolve，不能因为装饰资源失败阻断游戏。

## 7. gameloading controller 目标生命周期

目标时序固定为：

```text
createGameLoading()
  -> 同步创建 UI
  -> 同步发布 0%

start()
  -> 并发加载 resources
  -> 逐步发布 0..99%
  -> 发布 preparing / 99%
  -> await onBeforeComplete()
  -> await UI readyToComplete
  -> 发布 entering-game / 100%
  -> await onEnterGame()
  -> await UI playExit()
  -> UI destroy()
  -> 隐藏 loading root
  -> start() resolve
```

错误时：

```text
任意 resource / prepare / UI gate / enter / exit 失败
  -> 发布 error snapshot
  -> 保持 loading root 可见
  -> 调用 onError(error) 恰好一次
  -> 不调用后续业务阶段
```

### 7.1 `start()` 错误语义

Task 118 必须明确并测试 `start()` 的 Promise 合同。推荐行为：

- 成功完成并退出 UI：resolve；
- 失败：UI 显示错误、调用 `onError` 后 reject 同一个规范化 Error；
- destroy 导致取消：resolve 或 reject 专用 abort error 均可，但必须固定、记录并测试，不能产生 unhandled rejection。

如果为了兼容现有 app 保留“错误后 resolve”，必须在任务报告中解释原因，并提供独立的可观察失败状态；不能只依赖 console。

### 7.2 destroy / abort

controller 应拥有一个实例级 `AbortController`：

- `destroy()` 必须幂等；
- destroy 时 abort signal；
- resource context、prepare context、enter context 应能读取同一个 signal；
- 默认 fetch loader 使用 signal；
- image/style loader 在 abort 时移除 listener 并停止等待；
- 自定义 loader 可以选择响应 signal；
- destroy 后不再启动新资源；
- destroy 后不更新 UI；
- destroy 后不调用 prepare/enter/onError；
- UI 的 timer、listener、style 和 DOM 必须释放。

不得使用忙循环或长时间同步等待。

### 7.3 root 所有权

- app 创建并传入 `loadingHost`；
- controller 管理 `loadingHost.hidden` 的成功/销毁状态；
- UI 只管理 `loadingHost` 的 children 和自己创建的 style；
- UI 不调用 `loadingHost.remove()`；
- 成功 exit 后 controller 隐藏 root，使其不参与布局和点击命中；
- error 时 root 保持可见；
- app 的 `gameHost` 仍由 app 控制。

## 8. 简单 Loading UI

`@slotclientengine/gameloading-ui-simple` 是当前 `gameloading/src/dom.ts` 的独立实现。

必须保留或等价实现：

- 深色背景；
- `Loading` label；
- 横向 progress bar；
- 百分比文字；
- Loading / Ready / Error 状态文字；
- `role="alert"` 和 `aria-live="polite"` error 区域；
- 多实例 style 隔离；
- 幂等 destroy。

必须移除：

- 对 controller 内部类的依赖；
- `console.log(progress)` 等调试输出；
- 任何游戏专属语义。

建议公开 API：

```ts
import { createSimpleGameLoadingUi } from
  "@slotclientengine/gameloading-ui-simple";

const loading = createGameLoading({
  root,
  ui: createSimpleGameLoadingUi(),
  // ...
});
```

简单 UI 不提供视觉最短展示 gate，不增加人工等待时间。

## 9. Leo Loading UI

### 9.1 技术边界

`@slotclientengine/gameloading-ui-leo` 必须：

- 使用原生 DOM API；
- 使用 CSS animation/transition；
- 运行时 dependencies 为空；
- 不使用 React 或 JSX；
- 不创建 store/container/event bus；
- 不知道 game002、game003、skin、gamecode、server 或 token；
- 不请求远程配置；
- 不持有 game session；
- 不通过时间戳强制绕过浏览器缓存。

### 9.2 视觉资源闭包

第一版只允许以下精确资产：

```text
loading2.gif
logo_1.webp
a2.webp
a3.webp
```

不得使用宽泛 glob。不得把 test 分支的字体、平台 HUD、Wildsheep 图片或其它 UI 资源带入本包。

本计划编写时 `test` 分支资产约为：

| 文件 | 约大小 |
| --- | ---: |
| `logo_1.webp` | 2.7 KB |
| `loading2.gif` | 425 KB |
| `a2.webp` | 9.4 KB |
| `a3.webp` | 5.5 KB |

执行时必须记录精确字节数和 SHA-256。若资产在 test 更新，应重新审查视觉和体积后再决定是否使用。

### 9.3 首帧和渐进增强

Leo UI 创建后必须立即显示黑色 shell 和 `logo_1.webp`，不能等待 GIF decode 后才产生首帧 DOM。

建议顺序：

```text
同步创建黑色全屏 DOM
  -> 立即显示 logo_1
  -> 后台 preload/decode loading2.gif
  -> GIF 成功：显示 GIF intro
  -> GIF error 或 5s timeout：跳过 GIF
  -> intro gate 完成后显示 a2/a3 progress art
  -> controller progress 驱动 reveal
```

`loading2.gif` 是独立 asset chunk/request，不得以内联 base64 塞进初始 JS。`logo_1.webp` 是否内联由最终体积与首屏测试决定；若 Vite 默认阈值内联，必须在执行报告中记录最终行为。

### 9.4 Intro gate

参考 test 行为：

- GIF preload 最长等待 `5000ms`；
- GIF load/error/timeout 后启动约 `3200ms` 的 intro 展示 gate；
- gate 完成前即使业务已准备好，也不进入 100%；
- 业务较慢时 gate 可提前完成，不额外增加 3200ms；
- destroy 会清理 preload image、timeout 和 intro timer；
- GIF 装饰资源失败不能阻塞业务进入游戏。

测试中应允许通过 options 注入较短 duration 或 fake timers，不能让测试真实等待 3.2 秒。

建议允许构造参数：

```ts
createLeoGameLoadingUi({
  introDurationMs: 3200,
  gifLoadTimeoutMs: 5000,
  exitDurationMs: 100,
});
```

生产默认值固定为上述值；非法负数、NaN、Infinity 必须显式失败。

### 9.5 Progress reveal

参考 test 中的两层效果，但算法必须从 React component 抽成纯函数并测试：

- `a2.webp`：progress `0..100` 映射为 `0..360deg` 的径向 reveal；
- `a3.webp`：progress `0..100` 映射为横向 clip reveal；
- 输入先 clamp 到 `0..100`；
- 不允许 NaN/Infinity 生成非法 CSS；
- 同一 progress 产生确定性 CSS；
- UI update 不重建 img，不重新请求 GIF；
- 尽量避免每次 update 产生大量临时 DOM 或 listener。

不要求逐字复制 test 中可能不合理的 polygon 步进、`+30%` clip 偏移或调试日志；需要保持视觉意图，并用截图/浏览器检查确认最终效果。

### 9.6 Error 和退出

- error snapshot 时保留 Leo 背景和当前 logo/progress art；
- 显示可读 error message；
- 使用 `role="alert"` / `aria-live="polite"`；
- error 时不自动退场；
- `playExit()` 默认保留约 100ms 的最终 100% 帧，可使用 opacity transition；
- exit 完成后 controller 再 destroy UI；
- destroy 必须移除 style、DOM、image handlers 和 timer。

## 10. game002 接入

`apps/game002` 增加：

```json
"@slotclientengine/gameloading-ui-leo": "workspace:*"
```

启动入口变为：

```ts
import { createGameLoading } from "@slotclientengine/gameloading";
import { createLeoGameLoadingUi } from
  "@slotclientengine/gameloading-ui-leo";

const loading = createGameLoading({
  root: loadingHost,
  ui: createLeoGameLoadingUi(),
  resources: createGame002LoadingResources(),
  onBeforeComplete: /* 保持 main 逻辑 */,
  onEnterGame: /* 保持 main 逻辑 */,
});
```

必须保持：

- `createGame002LoadingResources()` 资源闭包；
- 资源进度最多到 99%；
- `prepareGame002At99()` 校验 query；
- 99% 阶段准备 skin resources 和 live session；
- 100% 后才创建 framework/Pixi；
- 同一个 prepared session 复用，不能双 WebSocket；
- game002 固定 server、`lines=30`、skin=1 合同；
- `Game002EnteredGame.destroy()` 和 beforeunload 清理。

不得引入：

- `ui-leo-frameworks`；
- `game-leo-frameworks`；
- `netcore2`；
- `eventcore`；
- `stateData.ts`；
- `PLATFORM`/`__PLATFORM__` 替换；
- React。

game002 的 `prepareGame002At99()`、`game-entry.ts`、adapter 和 round 状态机原则上不因 Task 118 改变。除非为配合 controller 公共 context 增加兼容字段，否则不得调整业务行为。

## 11. game003 接入

`apps/game003` 增加：

```json
"@slotclientengine/gameloading-ui-simple": "workspace:*"
```

并显式注入：

```ts
ui: createSimpleGameLoadingUi()
```

game003 用来证明：

- controller 与 Leo 无耦合；
- 简单 UI 是独立可用实现；
- 相同生命周期可使用不同 UI；
- game003 的 loading resources、live session、orientation/layout、bg-bar、minecart 等正式游戏行为不受影响。

不实现 Wildsheep，不增加 platform switch。

## 12. 初始包体和白屏性能合同

独立 UI 包本身不足以保证首屏小；必须检查 app 入口的静态 import graph。

game002 首屏同步执行路径只能包含：

- `@slotclientengine/gameloading`；
- `@slotclientengine/gameloading-ui-leo`；
- loading resource URL/module 描述；
- game002 基础 CSS。

正式游戏 runtime 必须继续通过 loading resource 中的动态 import 加载。不得让以下模块进入 initial entry chunk：

- React；
- Pixi runtime；
- Spine/VNI runtime；
- rendercore；
- gameframeworks；
- game adapter；
- logiccore/netcore 实现。

需要新增自动检查：

1. 两个 UI package 的 `dependencies` 为空。
2. source/build output 不含 `react`、`zustand`、`eventcore`、`game-leo-frameworks`、`netcore2`。
3. Leo asset closure 只有 4 个精确文件。
4. 构建后的 game002 initial entry chunk 不包含 React/Zustand 标识。
5. 记录 gameloading、simple UI、Leo UI 的 dist JS/CSS/assets 大小。

建议初始目标，不作为未经验证的绝对上限：

- `gameloading` controller JS gzip 不超过 12 KB；
- simple UI JS gzip 不超过 6 KB；
- Leo UI JS gzip 不超过 12 KB；
- Leo critical CSS gzip 不超过 5 KB；
- GIF 保持独立请求，不计入 JS；
- 三个包无第三方 runtime dependency。

若现有工具链难以稳定计算 gzip，至少记录 raw/minified size 并增加依赖边界检查；执行报告必须说明未实现哪一项和原因。

## 13. 测试要求

### 13.1 gameloading controller tests

controller 测试必须使用 fake Loading UI，不再查询简单 UI 的具体 DOM。

至少覆盖：

1. create 时同步发布 0%。
2. 权重进度只进入 0..99。
3. 并发资源上限保持有效。
4. 资源完成后以 preparing/99 调用 `onBeforeComplete`。
5. 业务先完成、视觉 gate 后完成时，等待视觉 gate。
6. 视觉 gate 先完成、业务后完成时，不提前进入 100%。
7. 两者完成后发布 entering-game/100。
8. `onEnterGame` 完成前不调用 `playExit`。
9. enter 成功后按 `playExit -> destroy -> root hidden` 排序。
10. resource、prepare、visual gate、enter、exit 各阶段错误都进入 error。
11. `onError` 恰好一次。
12. error 时 root 保持可见。
13. destroy 幂等并停止新 resource/callback/UI update。
14. `start()` 多次调用复用同一 Promise。
15. 多实例互不共享 progress/UI/timer。
16. options、resource id、weight、concurrency 和 UI factory 非法时显式失败。

### 13.2 simple UI tests

至少覆盖：

- 初始 DOM；
- progress clamp/rounding；
- phase/status 文案；
- error aria；
- update after destroy 无副作用；
- destroy 幂等；
- 两实例 style/DOM 互不影响；
- public exports。

### 13.3 Leo UI tests

至少覆盖：

- create 后同步出现黑色 shell 和 logo；
- 不依赖 React；
- GIF load 后显示 intro；
- GIF error 后仍 resolve visual gate；
- GIF timeout 后仍 resolve visual gate；
- intro duration 使用 fake timer；
- progress 更新 a2/a3 clip；
- progress 纯函数对 0、50、99、100 和越界输入稳定；
- error snapshot 可见且不退出；
- playExit 完成时序；
- destroy 清理 timer/image listener/style/DOM；
- destroy 前后的 Promise 不产生 unhandled rejection；
- 多实例互不共享状态；
- 精确 asset closure；
- package/source boundary；
- public exports。

### 13.4 app tests

更新 game002/game003 的 main loading flow tests，至少验证：

- game002 注入 Leo factory；
- game003 注入 simple factory；
- 99% prepare 和 100% enter 顺序不变；
- app 不在 `onEnterGame` 内提前 destroy UI；
- enter error 时 gameHost 恢复隐藏；
- beforeunload 仍 destroy entered game；
- game002 source boundary 不包含新 framework/test 分支依赖；
- game003 source boundary 不包含 Leo/Wildsheep 语义。

## 14. 文档和协作规则

必须更新：

- `packages/gameloading/README.md`
- `packages/gameloading-ui-simple/README.md`
- `packages/gameloading-ui-leo/README.md`
- `apps/game002/README.md`
- `apps/game003/README.md`
- 根 `AGENTS.md`

`AGENTS.md` 至少明确：

- `gameloading` 只拥有 controller/资源/99%-100% 生命周期/UI contract；
- Loading UI 必须是可注入独立实现；
- simple UI 和 Leo UI 不得依赖 React/Pixi/framework/network；
- game002 使用 Leo UI；
- game003 当前使用 simple UI；
- Loading UI 不得决定 live session 是否完成；
- Wildsheep 不在 Task 118 范围。

## 15. 实施步骤

### 阶段 0：基线确认

1. 确认实现分支基于最新 main。
2. 运行当前 gameloading、game002、game003 相关测试。
3. 记录当前 build 产物和入口 chunk 大小。
4. 从 test 精确审查 Leo component/CSS/assets。
5. 记录 4 个资产的 SHA-256 和字节数。

### 阶段 1：定义 UI contract

1. 在 `gameloading/types.ts` 增加 UI phase/snapshot/factory/handle。
2. `GameLoadingOptions` 增加必填 `ui`。
3. 使用 fake UI 重写 controller tests。
4. 暂不接 app，先让 controller 合同测试通过。

### 阶段 2：重构 controller

1. 删除对 `dom.ts` 的直接依赖。
2. 实现 UI snapshot 单向发布。
3. 实现 business/visual 双 gate。
4. 实现 enter 后 exit/destroy。
5. 实现 root visibility。
6. 实现 destroy/abort。
7. 明确 start error 合同。

### 阶段 3：拆出 simple UI

1. 新建 package。
2. 迁移当前 DOM/CSS。
3. 增加独立测试和 README。
4. 从 gameloading 删除 `dom.ts`。
5. 验证 gameloading dist 不包含具体 UI class/CSS。

### 阶段 4：实现 Leo UI

1. 新建零依赖 package。
2. 迁移 4 个精确资产。
3. 原生 DOM/CSS 重写 intro 和 progress reveal。
4. 实现 readyToComplete / playExit / destroy。
5. 增加纯 progress 算法和 fake timer 测试。
6. 增加依赖、资源闭包和 bundle boundary 检查。

### 阶段 5：接入 game002/game003

1. game002 注入 Leo UI。
2. game003 注入 simple UI。
3. 移除 app callback 中的反向 `loading.destroy()`。
4. 保持 99% prepare 和 live session 逻辑不变。
5. 更新 main flow/source boundary tests。

### 阶段 6：文档、全量验证和报告

1. 更新 package/app README 和 AGENTS.md。
2. 执行 format/lint/typecheck/test/build。
3. 执行 game002/game003 release 相关静态检查。
4. 检查产物依赖和初始 chunk。
5. 浏览器手工验证 Leo 视觉、错误态、横竖屏和慢网络。
6. 写 Task 118 中文报告。

## 16. 验证命令

执行时根据 package scripts 的真实情况调整，但至少包括：

```bash
pnpm --filter @slotclientengine/gameloading format:check
pnpm --filter @slotclientengine/gameloading lint
pnpm --filter @slotclientengine/gameloading typecheck
pnpm --filter @slotclientengine/gameloading test
pnpm --filter @slotclientengine/gameloading build

pnpm --filter @slotclientengine/gameloading-ui-simple format:check
pnpm --filter @slotclientengine/gameloading-ui-simple lint
pnpm --filter @slotclientengine/gameloading-ui-simple typecheck
pnpm --filter @slotclientengine/gameloading-ui-simple test
pnpm --filter @slotclientengine/gameloading-ui-simple build

pnpm --filter @slotclientengine/gameloading-ui-leo format:check
pnpm --filter @slotclientengine/gameloading-ui-leo lint
pnpm --filter @slotclientengine/gameloading-ui-leo typecheck
pnpm --filter @slotclientengine/gameloading-ui-leo test
pnpm --filter @slotclientengine/gameloading-ui-leo build

pnpm --filter game002 format:check
pnpm --filter game002 lint
pnpm --filter game002 typecheck
pnpm --filter game002 test
pnpm --filter game002 build

pnpm --filter game003 format:check
pnpm --filter game003 lint
pnpm --filter game003 typecheck
pnpm --filter game003 test
pnpm --filter game003 build
```

如命令因非 TTY 下 pnpm 需要重建 `node_modules` 而失败，使用 `CI=true` 重试。不得为了通过测试改变生产时序或增加 fallback。

## 17. 最终验收标准

以下条件必须全部满足，Task 118 才能完成：

1. 实现基于 main，不包含 test framework 集成提交。
2. `gameloading` 不再含具体 UI DOM/CSS。
3. Loading UI contract 由 gameloading 导出并有 controller contract tests。
4. 当前简单 UI 已成为独立 package。
5. Leo UI 已成为独立 package。
6. 两个 UI package 无第三方 runtime dependency。
7. Leo UI 不含 React/JSX/Zustand/eventcore/framework/network。
8. 只迁移 4 个精确 Leo loading asset。
9. game002 使用 Leo UI。
10. game003 使用 simple UI。
11. 不存在 Wildsheep 实现、alias 或隐藏 fallback。
12. 资源阶段不超过 99%。
13. live session/prepare 成功前不能进入 100%。
14. Leo intro gate 不能绕过业务准备。
15. 正式游戏 enter 成功前 loading 不退场。
16. 任一错误都保持 loading 可见并显示 error。
17. destroy 后无 timer、listener、DOM、style 或 UI update 残留。
18. game002 不产生双 WebSocket，不改变 spin/round/framework 行为。
19. game003 正式游戏行为不受影响。
20. package/app build、typecheck、lint、test 全部通过。
21. initial bundle/source boundary 检查通过。
22. README、AGENTS.md 和 Task 118 执行报告完整。

## 18. 非目标

Task 118 不包含：

- Wildsheep Loading UI；
- 平台运行时切换；
- React HUD/Platform UI 集成；
- `game-leo-frameworks`；
- `netcore2`；
- game002/game003 round 状态机迁移；
- `stateData` bridge；
- 修改 game002/game003 玩法；
- 修改 rendercore/Pixi/Spine/VNI；
- 多阶段 welcome/base/spin-effects/FG/bonus loading gate；
- service worker/offline cache；
- CDN/远程平台配置；
- 新的资源压缩或美术重制。

如实施过程中发现上述内容是阻塞条件，应暂停并记录，不得悄悄扩大 Task 118 范围。

## 19. 关键设计结论

Task 118 的最终原则是：

> `gameloading` 决定“什么时候完成”，Loading UI 只决定“加载过程如何显示”。

并且：

> Leo Loading 必须在 React、Pixi 和游戏 framework 之前以最小成本出现；因此它是独立、原生 DOM、零运行时依赖的 UI package，而不是平台 React framework 的一个 component。
