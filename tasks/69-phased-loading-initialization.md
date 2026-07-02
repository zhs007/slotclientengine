# phased loading initialization 任务计划

## 1. 任务目标

本任务为 slot 游戏客户端建立“分阶段资源初始化”能力，并以 `apps/game003` 作为第一批接入对象。目标不是把所有资源在首屏一次性加载完，而是把资源按照用户可接受的等待节点分成多个明确 gate：

1. `welcome`：欢迎页和开始按钮所需资源，必须最快可见。
2. `base`：进入游戏开场、主背景、主转轮、基础 symbol、基础逻辑所需资源。
3. `spin-effects`：普通 spin 后可能立即用到的 symbol 动画资源和 win 动画资源；完成前不能让 `spin` 按钮可按。
4. `fg`：免费游戏 FG 玩法资源；触发 FG 后在用户确认/过场节点加载。
5. `bonus`：Bonus 玩法资源；触发 Bonus 后在用户确认/过场节点加载。
6. `media`：声音、音乐、视频等媒体资源；按用户手势和业务需要后台加载或进入对应节点前加载。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成 schema 设计、通用加载器扩展、`game003` 接入、测试验收、文档/协作规则同步和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/69-phased-loading-initialization-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/69-phased-loading-initialization-260702-123456.md
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

本任务原则上不需要新增第三方运行时依赖。`packages/gameloading` 必须继续保持轻量：无 Pixi、无 `gameframeworks`、无 `netcore`、无 `rendercore` 依赖。若确实新增或调整 npm 依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果 `pnpm --filter ...` 或 `pnpm exec ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/gameloading test
CI=true pnpm --filter game003 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。缺资源、重复 id、非法 phase/gate、非法 priority、非法 size/weight、未知资源类型、FG/Bonus gate 缺配置、生成物不同步、资源加载失败、live 初始化失败，都必须明确失败并给出可定位错误。

## 3. 当前实现事实

执行本计划时必须重新盘点，以实际代码为准。当前已观察到的相关事实如下。

### 3.1 `packages/gameloading`

当前 `packages/gameloading` 是独立 DOM loading 包：

- 入口：`packages/gameloading/src/index.ts`
- 控制器：`packages/gameloading/src/controller.ts`
- 默认 loader：`packages/gameloading/src/default-loaders.ts`
- 类型：`packages/gameloading/src/types.ts`
- DOM：`packages/gameloading/src/dom.ts`
- 测试：`packages/gameloading/tests/*.test.ts`

当前 API 以一次性资源列表为核心：

```ts
createGameLoading({
  root,
  resources,
  onBeforeComplete,
  onEnterGame,
  onError,
});
```

资源阶段完成后停在 `99%`，`onBeforeComplete` 成功后进入 `100%` 并调用 `onEnterGame`。这适合当前“首屏全量资源 + 99% live 初始化 + 100% 进入游戏”的模型，但还不能表达欢迎页、开场、spin-ready、FG、Bonus、media 这些阶段 gate。

当前工作区可能已经存在 `maxConcurrentResources` 相关改动。执行本任务时应按实际代码处理：

- 如果已存在受控并发实现，必须复核测试和边界，不要重复实现另一套并发队列。
- 如果还不存在，按本任务设计补上显式并发配置。
- 无论是否已存在，都不能依赖浏览器或 CDN 暴露“真实下载队列数量”；浏览器没有稳定 API 提供这个值。

`loadedResources` 当前用于保存已加载资源返回值。分阶段加载后必须重新定义它的生命周期，避免 loading 完成后仍长期持有 `HTMLImageElement`、`ArrayBuffer`、JSON、module namespace 等对象。

### 3.2 `apps/buildgamestatic`

当前 `apps/buildgamestatic` 已负责把 `apps/game003/config/game-static.yaml` 编译成：

```text
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

当前 `GameStaticYamlLoadingResource` 只支持：

```ts
{
  id: string;
  path: string;
  kind?: string;
  weight?: number;
}
```

或：

```ts
{
  id: string;
  glob: string;
  kind?: string;
  weight?: number;
}
```

当前 YAML loader 已有这些约束：

- `loading.resources` 必须是非空数组。
- 每个 resource 必须且只能提供 `path` 或 `glob`。
- `id` 必须唯一。
- `weight` 如果提供必须是有限正数。
- 宽泛 `*.png` loading glob 会失败，必须使用显式 brace glob 或精确资源组。
- 修改 YAML 后必须重新生成，并用 `--check` 校验生成物同步。

本任务要在这个基础上扩展 phase/gate/priority/sizeBytes，而不是绕过 buildgamestatic 手写 app 内资源表。

### 3.3 `apps/game003`

当前 `apps/game003` 的 loading 启动顺序已经是 loading-first：

- `apps/game003/src/main.ts` 是轻入口，只静态导入 `@slotclientengine/gameloading` 和 `src/loading-resources.ts`。
- `apps/game003/src/loading-resources.ts` 合并 `game-loading.generated.ts` 的静态资源和 `game003-runtime-module` 动态模块资源。
- `apps/game003/src/game-entry.ts` 才导入 `gameframeworks`、Pixi adapter、game layout 和正式游戏配置。
- loading 资源完成后停在 `99%`，`prepareGame003At99()` 解析 query、拒绝旧 `serverUrl`、创建预连接 live session，并完成真实 `connect + enterGame`。
- `prepareGame003At99()` 成功后进度到 `100%`，再调用 `enterGame003()` 创建 framework 和 Pixi adapter。

当前 `apps/game003/config/game-static.yaml` 的 `loading.resources` 是扁平资源清单，包含：

- 横竖版背景：`bg1.jpg` / `bg2.jpg`
- 场景部件：`mainreelbg` / `conveyor1` / `conveyor2`
- 普通 symbol PNG
- `spinBlur` / `disabled` state PNG
- symbol VNI project 和 assets
- win amount VNI project 和 assets

这些资源现在都属于同一个首屏 loading 阶段。任务完成后必须拆成明确 phase，并保持中文注释说明资源属于哪个 gate、为什么阻塞或不阻塞。

### 3.4 `gameframeworks` spin 状态

当前 `packages/gameframeworks/src/framework.ts` 中：

- `connect()` 成功后会设置 `spinState: "idle"`。
- `spin()` 只允许在 `connected === true` 且 `spinState === "idle"` 时执行。
- `SlotGameSpinState` 已包含 `"disabled"`。
- `SlotGameUiAdapter` 会把 framework state 传给 `uiframeworks` 控制 spin 按钮状态。

本任务需要利用或增强这条状态链，让 `spin-effects` gate 完成前 `spin` 不可点击。不能只在 DOM 上私自禁用按钮，也不能绕过 framework 的状态流。

## 4. 目标行为合同

### 4.1 Gate 与 phase

第一版固定支持以下 phase：

| phase          | 阻塞节点                             | 说明                                                                                                     |
| -------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `welcome`      | 首次显示欢迎页                       | 欢迎页背景、按钮、轻量入口动画。若当前游戏没有欢迎页美术，可以显式配置为空阶段，但必须在 YAML 注释说明。 |
| `base`         | 用户点击开始后进入游戏开场           | 主背景、主转轮、基础 symbol、基础逻辑、正式 runtime module、live 初始化必要资源。                        |
| `spin-effects` | 开场后显示/启用 spin 前              | 普通 spin 后可能立即需要的 symbol 动画资源、普通 win 动画资源、big/super/mega 基础表现资源。             |
| `fg`           | 触发 FG 后、用户确认进入 FG 前       | FG 专属背景、UI、动画、规则演示、音效等。                                                                |
| `bonus`        | 触发 Bonus 后、用户确认进入 Bonus 前 | Bonus 专属背景、UI、动画、规则演示、音效等。                                                             |
| `media`        | 用户手势后后台或对应 gate 前         | 音乐、音效、视频等媒体资源。默认不阻塞普通 spin，除非某个 gate 明确依赖。                                |

第一版固定支持以下 gate：

| gate               | 必须完成的 phase        | 触发时机                                                             |
| ------------------ | ----------------------- | -------------------------------------------------------------------- |
| `welcome-ready`    | `welcome`               | app 启动后立刻加载；完成后显示欢迎/开始按钮。                        |
| `game-entry-ready` | `base`                  | 用户点击开始后加载；完成后允许创建正式 game runtime / framework。    |
| `spin-ready`       | `base` + `spin-effects` | 游戏开场期间后台加载；完成前 spin 保持 disabled，完成后才允许 spin。 |
| `fg-ready`         | `fg`                    | spin 结果确认将进入 FG 时加载；完成后用户确认进入 FG。               |
| `bonus-ready`      | `bonus`                 | spin 结果确认将进入 Bonus 时加载；完成后用户确认进入 Bonus。         |

`media` 不默认属于任何必需 gate。若某个媒体资源必须阻塞某个节点，必须显式声明依赖的 phase/gate，不允许靠运行时猜测。

### 4.2 YAML schema 目标

在 `apps/game003/config/game-static.yaml` 中扩展 `loading` 配置。建议形态如下，实际字段名可以按代码实现微调，但必须覆盖相同语义：

```yaml
loading:
  # 通用资源并发数。不是浏览器/CDN 队列数，只是 app 自己提交请求的上限。
  maxConcurrentResources: 4
  phases:
    - id: welcome
      allowEmpty: true
      description: 首屏欢迎页使用 DOM shell，当前无额外美术资源。
    - id: base
      allowEmpty: false
      description: 用户点击开始后进入游戏开场所需基础资源。
    - id: spin-effects
      allowEmpty: false
      description: spin 前必须准备好的 symbol/win 动画资源。
    - id: fg
      allowEmpty: true
      description: 当前 game003 第一版暂无 FG 资源；新增 FG 时必须补资源并改为非空。
    - id: bonus
      allowEmpty: true
      description: 当前 game003 第一版暂无 Bonus 资源；新增 Bonus 时必须补资源并改为非空。
    - id: media
      allowEmpty: true
      description: 当前 game003 第一版暂无独立声音/视频资源。
  gates:
    - id: welcome-ready
      phases: [welcome]
    - id: game-entry-ready
      phases: [base]
    - id: spin-ready
      phases: [base, spin-effects]
    - id: fg-ready
      phases: [fg]
    - id: bonus-ready
      phases: [bonus]
  resources:
    - id: game003-bg-landscape
      phase: base
      priority: 10
      path: assets/game003-s1/bg1.jpg
    - id: game003-symbol-vni-assets
      phase: spin-effects
      priority: 30
      glob: assets/game003-s1/assets/*.{png,jpg,jpeg,webp}
```

字段规则：

- `loading.maxConcurrentResources` 可选；提供时必须是正整数。默认值由 `packages/gameloading` 明确给出，不从浏览器/CDN 猜测。
- `phase.id` 必须属于固定枚举：`welcome | base | spin-effects | fg | bonus | media`。
- `phase.allowEmpty` 必须显式声明，避免空阶段被误认为漏配。
- `gate.id` 必须属于固定枚举：`welcome-ready | game-entry-ready | spin-ready | fg-ready | bonus-ready`。
- `gate.phases` 必须是非空数组，引用已声明 phase，不能重复。
- 每个 `resource.phase` 必须引用已声明 phase。
- 每个 `resource.priority` 必须是整数，数值越小越早进入队列；默认值只能在 schema 层显式定义，不能在 app 层隐藏兜底。
- 每个 resource 仍然必须且只能提供 `path` 或 `glob`。
- `path` 必须指向仓库内已存在文件。
- `glob` 必须指向仓库内可验证目录，不能递归 `**`，不能使用宽泛 `assets/game003-s1/*.png` 混入场景部件和 symbol。
- `weight` 第一版允许保留，但生成物应优先使用真实 `sizeBytes` 计算进度；没有真实 `sizeBytes` 的自定义 resource 才使用 `weight`。
- 如果一个 phase `allowEmpty: false` 但没有任何资源，必须构建期失败。
- 如果一个 phase `allowEmpty: true`，必须在 YAML 中文注释中说明原因；不能默默空着。

### 4.3 生成物目标

`apps/game003/src/generated/game-loading.generated.ts` 仍由 `apps/buildgamestatic` 生成，禁止手改。生成物需要包含：

- 每个展开后资源的 `id`
- `url`
- `kind`
- `phase`
- `priority`
- `sizeBytes`
- 可选 `weight`
- `sourcePath` 或等效诊断字段，用于错误信息和测试断言
- `loading.maxConcurrentResources`
- `phases`
- `gates`

`sizeBytes` 必须在 buildgamestatic 阶段从真实文件大小派生：

- `path` 资源直接 `stat` 文件。
- `glob` 展开后每个文件单独计算 `sizeBytes`。
- 如果 Vite URL 去重导致多个 id 指向同一 url，进度计算不能重复计算已去重 URL 的字节。
- 如果 `sizeBytes <= 0`，必须构建期失败。
- 对自定义 runtime module，例如 `game003-runtime-module`，没有静态文件 size 时必须显式提供 `weight` 或让 `loading-resources.ts` 明确声明 `estimatedBytes` / `weight`，不能让它随机变成 1。

### 4.4 调度和进度目标

`packages/gameloading` 需要从“一次性加载所有资源”升级为“可按 gate 加载”的通用调度能力。建议新增 API 或在现有 API 上扩展，但必须保持边界清晰：

```ts
export interface GameLoadingScheduler {
  loadGate(gateId: GameLoadingGateId): Promise<GameLoadingGateResult>;
  preloadPhase(phaseId: GameLoadingPhaseId): Promise<void>;
  getGateStatus(gateId: GameLoadingGateId): GameLoadingGateStatus;
  destroy(): void;
}
```

规则：

- 同一资源只加载一次；重复 gate 引用同一 phase/resource 时复用状态，不重复发起下载。
- 同一个 URL 只应算一次进度；重复 URL 应在生成物或运行时显式去重。
- 并发数使用 `maxConcurrentResources` 控制，只限制 app 提交给浏览器的资源数，不声称等于 CDN 或浏览器真实队列。
- 资源排序按 `phase` 的 gate 请求顺序、`priority` 升序、`sizeBytes` 升序、`id` 字典序稳定排序。关键大图必须通过更高优先级提前，而不是依赖 size 自动推断。
- 进度优先按 `sizeBytes` 计算；没有 `sizeBytes` 的资源必须有显式 `weight`。
- 可以做 UI 平滑，但底层完成条件必须以真实资源完成为准，不允许假进度到达完成状态。
- 任一 gate 失败必须让该 gate 失败，并保留可读错误；不能跳过资源继续进入下一阶段。
- `destroy()` 后不能继续调度新资源，不能继续更新 DOM 或调用后续回调。
- gate 完成、一次性 loading 完成或进入错误终态后，默认清理 `loadedResources` 中的强引用，避免长期持有 `HTMLImageElement`、`ArrayBuffer`、JSON、module namespace 等预加载对象。需要保留的资源必须由调用方显式声明 ownership 或 `retain: true`，并在测试中覆盖。

### 4.5 `loadedResources` 生命周期合同

`loadedResources` 只允许作为 loading / gate 回调期间的临时交接容器，不能成为长期缓存。

必须满足：

- `onBeforeComplete`、`onEnterGame`、`loadGate(...)` resolve 前可以读取 `loadedResources`。
- 一次性 `createGameLoading(...).start()` 成功完成后，必须清空 `loadedResources` 中保留的预加载对象。
- gate-based API 中，gate 成功完成并完成资源交接后，必须释放本 gate 不再需要的预加载对象强引用。
- loading 进入错误终态后，错误 UI 只保留错误信息，不保留已经加载成功的资源对象；`destroy()` 必须再次确保清空。
- 如果 game runtime 需要复用某个预加载对象，必须在回调中把对象显式转移到 `prepareResult`、runtime-owned cache 或显式 `retain` 资源集合中；不能依赖 `loading.loadedResources` 在完成后继续可读。
- 清空 `loadedResources` 只释放 JS 持有的对象引用，不等于清浏览器 HTTP cache；完整下载过的资源仍可由浏览器缓存命中。
- 测试必须断言 loading 完成后 `loadedResources.size === 0` 或等价空状态；如果配置了 `retain`，必须只保留显式 retain 的资源。

### 4.6 启动进度与欢迎页边界

现有 loading 的 `0..99%` 资源阶段和旧语义里的 `100%` 完成阶段，必须在进入欢迎页以前处理完。欢迎页不是旧 loading 完成后的“正式游戏画面”，而是新分阶段流程的第一个用户交互界面。

必须满足：

- app 启动后先显示启动 loading UI，用于加载 `welcome-ready` gate。
- 启动 loading 可以继续使用旧式 `0..99% -> 100%` 展示语义，但它只代表“欢迎页可显示”，不代表游戏基础资源、spin 动画、FG、Bonus 或 media 全部完成。
- `welcome-ready` 到达 `100%` 后才能显示欢迎页/开始按钮。
- 进入欢迎页后，不再显示旧式全量资源 loading 的 `99%/100%`；后续等待必须使用明确 gate 文案，例如“准备游戏”“准备旋转”“准备免费游戏”“准备 Bonus”。
- 当前 `prepareGame003At99()` 中的 live 初始化职责不能继续理解为“进入欢迎页前的 99%”。在新流程中，live 初始化应迁移到用户点击开始后的 `game-entry-ready` 阶段，除非后续任务明确要求欢迎页出现前就必须建立 live session。
- 欢迎页前的启动 loading 不允许静默预加载 `base`、`spin-effects`、`fg`、`bonus`、`media` 后再宣称欢迎页 ready；这些资源只能作为后续 gate 或显式后台预加载处理。

测试必须覆盖：

- `welcome-ready` 未完成前不显示欢迎页按钮。
- `welcome-ready` 完成到 `100%` 后才显示欢迎页按钮。
- 点击欢迎页开始按钮后才触发 `game-entry-ready` 和 live 初始化。
- 旧的 `prepareGame003At99()` 或等价 live 初始化不会在欢迎页出现前执行。

### 4.7 `game003` 初始化流程目标

`apps/game003` 第一版流程应改为：

1. `main.ts` 创建 loading/root hosts，不静态导入 Pixi 或 game runtime。
2. 启动 `welcome-ready` gate，并用启动 loading UI 显示进入欢迎页前的 `0..99% -> 100%` 进度。
3. `welcome-ready` 成功到 `100%` 后显示欢迎页/开始按钮。若当前没有欢迎页美术，使用现有 DOM loading shell + 明确按钮文案，不引入隐藏 fallback。
4. 用户点击开始后启动 `game-entry-ready` gate，并显示“准备游戏”临时进度；这个进度不能复用进入欢迎页前的旧全量 loading 文案。
5. `game-entry-ready` 成功后加载 runtime module，执行 `prepareGame003At99()` 或等价 live 初始化，保持固定 live server / `serverUrl` 显式失败合同；该 live 初始化必须发生在用户点击开始之后。
6. 创建 framework/Pixi 画面并播放游戏开场。开场动画可以是第一版轻量占位，但必须是显式实现，不能靠资源加载时间假装动画。
7. 开场期间或开场前并行启动 `spin-ready` gate。
8. `spin-ready` 未完成前，framework state 必须让 spin 按钮不可用；完成后才切到可 spin 状态。
9. 如果普通 spin 结果触发 FG，先显示 FG 确认/过场 UI，再加载 `fg-ready` gate，完成后才允许用户确认进入 FG。
10. 如果普通 spin 结果触发 Bonus，先显示 Bonus 确认/过场 UI，再加载 `bonus-ready` gate，完成后才允许用户确认进入 Bonus。
11. `media` 资源在用户点击开始后可以后台加载；如果浏览器音频策略需要用户手势，必须把加载/播放启动放在用户手势之后。

第一版如果 `game003` 当前没有 FG、Bonus、media 真实资源，不要求实现完整玩法；但必须把 schema、gate、loader API、测试夹具和 app 接入边界建好，并在 YAML 注释和 README 中说明当前为空阶段是显式选择。

### 4.8 音乐、音效和视频加载合同

`media` phase 不能按图片/JSON 的思路默认全量下载进主 loading。声音和视频需要按播放模型区分，避免一个 20MB 游戏包因为 BGM 或视频拖慢欢迎页、基础游戏和 spin-ready。

必须满足：

- `media` 不属于默认 `welcome-ready`、`game-entry-ready` 或 `spin-ready` gate。
- BGM、长音频、视频默认使用浏览器原生 `HTMLAudioElement` / `HTMLVideoElement` 渐进加载，到用户手势或播放节点再设置 `src` / `load()` / `play()`。
- 短音效如果要求低延迟，例如按钮、spin、普通中奖提示，可以在 `spin-ready` 或对应玩法 gate 中使用 `fetch + AudioContext.decodeAudioData(...)` 提前下载并解码；这类资源必须显式声明为短音效，不允许把 BGM 当短音效全量 decode。
- 视频如果只在 FG/Bonus/特殊过场播放，应归入对应 `fg` / `bonus` gate 或 `media` 后台预加载；不能阻塞欢迎页和普通 spin。
- 关键过场视频如果必须无黑屏播放，可以在对应 gate 中等待 `canplay` 或业务明确要求的 `canplaythrough`，并在文档中说明取舍。
- 浏览器音频播放通常需要用户手势；BGM 的加载/播放启动应挂在欢迎页“开始”按钮或后续用户确认动作之后。
- `packages/gameloading` 默认 loader 不应把 `.mp3`、`.ogg`、`.mp4`、`.webm` 等媒体资源强制 `fetch(arrayBuffer)` 全量下载。媒体资源应有独立 `kind`，例如 `audio-stream`、`video-stream`、`audio-buffer`，并明确加载语义。
- `audio-stream` / `video-stream` 的 loading 成功条件不能假装等于完整文件下载完成。它们可以只创建 element、设置 preload 策略、等待 metadata/canplay，或只登记 URL，具体由 gate 配置决定。
- `audio-buffer` 只用于短音效，加载完成条件是完整下载并 decode 成功。
- 清理 `loadedResources` 时，必须暂停并释放未移交的 `HTMLAudioElement` / `HTMLVideoElement` 引用；如果运行时要继续播放，必须显式转移 ownership。

服务器/CDN 和文件格式要求：

- 媒体文件必须返回正确 `Content-Type`，例如 `audio/mpeg`、`audio/ogg`、`video/mp4`、`video/webm`。
- 长音频和视频推荐支持 `Accept-Ranges: bytes`，Range 请求应返回 `206 Partial Content`，并提供正确 `Content-Length`。
- MP4 视频应使用 faststart，即 `moov atom` 在文件前部；否则浏览器可能需要读到文件尾部才能拿到 metadata，首播会慢。
- 大视频或需要自适应码率时，后续可单独规划 HLS/DASH；本任务第一版不实现自定义流媒体播放器。
- 如果本地静态服务器或 CDN 不支持 Range / 正确 MIME，任务报告必须记录为部署侧风险，不允许在前端用隐藏 fallback 全量下载来掩盖。

第一版 `game003` 当前没有真实声音/视频资源时：

- YAML 中 `media` 必须显式 `allowEmpty: true` 并说明原因。
- 仍要在 schema、README、测试 fixture 中保留 media phase/gate 边界。
- 不需要新增声音/视频素材，也不需要实现完整 audio manager；但后续新增媒体资源时必须遵守本节合同。

测试必须覆盖：

- `media` 资源不会被 `welcome-ready` 默认加载。
- `media` 资源不会被 `spin-ready` 默认阻塞，除非 gate 显式依赖。
- `audio-buffer` 缺少可解码数据时显式失败。
- `audio-stream` / `video-stream` 不走 `arrayBuffer` 全量下载路径。
- 移交 ownership 前，loading 完成/失败/destroy 会释放媒体 element 引用。

### 4.9 浏览器/CDN 队列诊断边界

不要把“探测到的队列数”作为正确性前提。浏览器没有稳定 API 暴露同源下载槽数量或 HTTP/2 stream 上限。

允许做诊断，不允许做强依赖：

- 可以读取 `PerformanceResourceTiming.nextHopProtocol` 记录 `http/1.1` / `h2` / `h3`。
- 可以记录 `fetchStart`、`requestStart`、`responseStart`、`responseEnd` 估算等待时间。
- 可以在开发日志或任务报告中汇总资源加载瀑布。
- 不允许因为探测失败就静默改并发数或跳过资源。
- 不允许在生产逻辑里依赖某个浏览器队列数量。

第一版并发建议：

- `maxConcurrentResources: 4` 用于 `game003`。
- 通用默认值可以保持 `6`，但必须在 `packages/gameloading/README.md` 中说明它是 app 自己的提交上限，不是 CDN 队列数。

## 5. 实施步骤

### 5.1 基线盘点

执行：

```bash
git status --short --untracked-files=all
git diff --stat
rg -n "maxConcurrentResources|loadedResources|loading.resources|game-loading.generated|spinState|disabled" packages/gameloading apps/buildgamestatic apps/game003 packages/gameframeworks
```

确认是否已有未提交改动。若已有改动与本任务相关，必须在执行报告中说明“沿用/调整/补测”的处理方式，不得回滚用户或前序工作。

### 5.2 扩展 buildgamestatic schema

涉及文件：

```text
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/buildgamestatic/tests/generator.test.ts
apps/buildgamestatic/README.md
```

工作内容：

1. 增加 phase/gate/priority/maxConcurrentResources/sizeBytes 类型。
2. 更新 YAML parser，拒绝未知字段、非法 phase/gate、非法 priority、非法并发、非法空 phase。
3. 生成 loading 模块时展开 glob，并计算每个文件的 `sizeBytes`。
4. 生成物保持 deterministic：资源按 path 排序，phase/gate 输出顺序稳定。
5. 保留当前 fail-fast 规则：重复 id、重复 URL 去重、空 glob、宽泛 `*.png`、路径不存在都要明确失败。
6. 测试覆盖：
   - 有效 phased loading YAML。
   - `allowEmpty: false` 空阶段失败。
   - resource phase 未声明失败。
   - gate 引用未知 phase 失败。
   - priority 非整数失败。
   - maxConcurrentResources 非正整数失败。
   - `sizeBytes` 出现在生成物中。
   - `--check` 能发现生成物不同步。

### 5.3 扩展 packages/gameloading

涉及文件：

```text
packages/gameloading/src/types.ts
packages/gameloading/src/controller.ts
packages/gameloading/src/default-loaders.ts
packages/gameloading/src/index.ts
packages/gameloading/tests/controller.test.ts
packages/gameloading/tests/default-loaders.test.ts
packages/gameloading/tests/exports.test.ts
packages/gameloading/README.md
```

工作内容：

1. 引入 phase/gate 相关类型。
2. 提供 gate 加载 API，或将现有 controller 扩展为支持 `loadGate(...)` / `preloadPhase(...)`。
3. 保持现有一次性 `createGameLoading(...)` 兼容或明确迁移；如果改 public API，必须更新所有调用点和测试。
4. 实现受控并发；若当前已有 `maxConcurrentResources`，只做复核和补测。
5. 资源状态必须包括：`pending | loading | loaded | failed`。
6. 同一资源重复请求必须复用同一个 Promise；同一 URL 进度不能重复计字节。
7. `loadedResources` 默认在 gate 资源交接、一次性 loading 完成、错误终态或 `destroy()` 后释放强引用；如果需要保留，必须显式配置并测试。
8. `destroy()` 后不能继续调度、更新 DOM 或调用回调。
9. 默认 loader 仍按扩展名 fail-fast，不新增隐藏 fallback。
10. 测试覆盖：
    - 按 gate 加载只加载该 gate 需要的 phase。
    - `spin-ready` 复用已完成的 `base` 资源。
    - 同资源并发请求只发起一次 load。
    - 失败 gate 不调用后续回调。
    - destroy 后不继续调度后续资源。
    - 进度按 `sizeBytes` 优先计算。
    - 无 `sizeBytes` 且无 `weight` 的自定义资源失败。
    - gate 完成后清理 `loadedResources` 默认引用。
    - 一次性 loading 完成后清理 `loadedResources` 默认引用。
    - loading 失败或 destroy 后清理已预加载成功的对象引用。

### 5.4 接入 game003 YAML 和生成物

涉及文件：

```text
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-loading.generated.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/README.md
```

资源初始分配建议：

- `welcome`：当前无专属欢迎页美术时显式 `allowEmpty: true`，欢迎页由 DOM shell 提供。
- `base`：
  - `assets/game003-s1/bg1.jpg`
  - `assets/game003-s1/bg2.jpg`
  - `assets/game003-s1/{mainreelbg,conveyor1,conveyor2}.png`
  - `assets/game003-s1/{WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC}.png`
  - `game003-runtime-module` 或其等价自定义 module 资源
- `spin-effects`：
  - `assets/game003-s1/{WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC}.spinBlur.png`
  - `assets/game003-s1/{WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC}.disabled.png`
  - `assets/game003-s1/*-wins.json`
  - `assets/game003-s1/assets/*.{png,jpg,jpeg,webp}`
  - `assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json`
  - `assets/game003-s1/win-amount/assets/*.{png,jpg,jpeg,webp}`
- `fg`：当前没有资源时显式 `allowEmpty: true`，并在注释说明新增 FG 时必须补资源。
- `bonus`：当前没有资源时显式 `allowEmpty: true`，并在注释说明新增 Bonus 时必须补资源。
- `media`：当前没有声音/视频资源时显式 `allowEmpty: true`；后续新增 BGM/视频时默认只登记流式播放资源，不进入首屏全量下载；短音效如需低延迟，显式声明为 `audio-buffer` 并放入对应 gate。

修改 YAML 后必须执行：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

禁止手改：

```text
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

### 5.5 接入 game003 初始化流程

涉及文件：

```text
apps/game003/src/main.ts
apps/game003/src/loading-resources.ts
apps/game003/src/game-entry.ts
apps/game003/src/game-adapter.ts
apps/game003/tests/main-loading-flow.test.ts
apps/game003/tests/loading-flow.test.ts
apps/game003/tests/source-boundary.test.ts
```

工作内容：

1. `main.ts` 保持轻入口，不静态导入 Pixi、rendercore、gameframeworks 或 game adapter。
2. `loading-resources.ts` 从生成物读取 phased resources，并追加 runtime module 的 phase/priority/weight。
3. 首次只加载 `welcome-ready`，并在进入欢迎页前完成启动 loading 的 `0..99% -> 100%`。
4. `welcome-ready` 完成前不显示欢迎页开始按钮；完成到 `100%` 后才显示欢迎页。
5. 欢迎页点击开始后加载 `game-entry-ready`，并执行 live 初始化；live 初始化不能在欢迎页出现前执行。
6. 创建 framework 后，游戏开场阶段启动 `spin-ready` gate。
7. `spin-ready` 未完成前，framework spin 状态必须是 `"disabled"` 或等价不可交互状态。
8. `spin-ready` 完成后才能进入 `"idle"` 并启用 spin。
9. 若 `spin-ready` 失败，保留错误态，不允许用户 spin。
10. FG/Bonus gate 第一版可只完成加载器和 app 钩子，不需要实现完整 FG/Bonus 玩法；但如果解析到 future trigger，需要有明确 gate 调用边界。
11. `loadedResources` 清理后，正式 Pixi/runtime 不应依赖 loading controller 持有的对象；如需复用必须显式转移 ownership，并在测试中证明转移后的 owner 可用、loading map 已清空。
12. 媒体资源接入时，`loading-resources.ts` 只能把媒体作为 `media` phase 或显式 gate 依赖传给调度器；不能在 `createGame003LoadingResources()` 中把 BGM/视频混进默认首屏资源数组。

### 5.6 必要时调整 gameframeworks 状态流

涉及文件：

```text
packages/gameframeworks/src/framework.ts
packages/gameframeworks/src/state.ts
packages/gameframeworks/src/types.ts
packages/gameframeworks/tests/framework-flow.test.ts
packages/gameframeworks/tests/state.test.ts
```

如果仅靠 `game003` 外层流程即可让 spin 在 `spin-ready` 前不可点击，可以不改 `gameframeworks`。如果需要 framework 级支持，必须满足：

1. 公开明确 API，例如 `setSpinEnabled(false)` 或初始化选项 `initialSpinState: "disabled"`。
2. `spin()` 在 `"disabled"` 状态下必须显式失败，错误信息说明资源 gate 未完成或 spin 不可用。
3. gate 完成后由 app 显式切回 `"idle"`，不能自动猜测。
4. 测试覆盖 disabled 状态下点击 spin 不会发网络请求。
5. 不能在 `uiframeworks` DOM 层私自绕过 framework state。

### 5.7 文档和协作规则同步

必须更新：

```text
packages/gameloading/README.md
apps/buildgamestatic/README.md
apps/game003/README.md
```

如果本任务新增或改变仓库长期协作规则，必须同步更新根目录：

```text
agents.md
```

建议在 `agents.md` 增加或更新的规则：

- 游戏资源 loading 使用 phase/gate 声明，不能把欢迎页、基础游戏、spin 动画、FG、Bonus、media 全塞进一个首屏全量队列。
- `game-static.generated.ts` 和 `game-loading.generated.ts` 仍由 `apps/buildgamestatic` 生成，禁止手改。
- 资源 phase/gate、priority、sizeBytes/weight 必须 fail-fast 校验，不允许隐藏 fallback。
- `spin` 按钮必须等 `spin-ready` gate 完成后才能启用；FG/Bonus 资源在用户确认/过场节点加载。
- 声音、音乐、视频默认属于 `media` phase：BGM/视频使用浏览器原生渐进加载，短音效需要低延迟时才作为显式 `audio-buffer` gate 资源预加载。
- loading 完成后默认清理 `loadedResources` 强引用，除非显式转移 ownership。

## 6. 验收命令

执行前：

```bash
git status --short --untracked-files=all
git diff --stat
```

格式化变更文件：

```bash
CI=true pnpm exec prettier --write \
  apps/buildgamestatic/src/types.ts \
  apps/buildgamestatic/src/yaml-loader.ts \
  apps/buildgamestatic/src/generator.ts \
  apps/buildgamestatic/README.md \
  packages/gameloading/src \
  packages/gameloading/tests \
  packages/gameloading/README.md \
  apps/game003/config/game-static.yaml \
  apps/game003/src \
  apps/game003/tests \
  apps/game003/README.md \
  agents.md
```

如果实际未改某些路径，可从格式化命令中移除；不要因为路径不存在而跳过真实改动文件的格式化。

生成和校验静态配置：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

`buildgamestatic` 验证：

```bash
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic build
```

`gameloading` 验证：

```bash
CI=true pnpm --filter @slotclientengine/gameloading lint
CI=true pnpm --filter @slotclientengine/gameloading test
CI=true pnpm --filter @slotclientengine/gameloading typecheck
CI=true pnpm --filter @slotclientengine/gameloading build
```

如果改了 `gameframeworks` 状态流，必须执行：

```bash
CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
```

`game003` 验证：

```bash
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
```

最终空白检查：

```bash
git diff --check
```

最终状态检查：

```bash
git status --short --untracked-files=all
git diff --stat
```

浏览器验收如果由用户执行，任务报告中只能写“浏览器验收待用户执行”，不能把未执行的浏览器检查写成已通过。

## 7. 必须新增或更新的测试点

### 7.1 buildgamestatic

- phased loading YAML 能解析并生成 deterministic TS。
- `sizeBytes` 来自真实文件大小。
- glob 展开后每个资源都有 phase/priority/sizeBytes。
- `allowEmpty: false` 阶段为空时报错。
- `allowEmpty: true` 阶段为空时通过，但生成物保留该 phase。
- 未知 phase、未知 gate、gate 引用未知 phase、重复 gate id、重复 phase id 都失败。
- 宽泛 `*.png` 仍失败。
- 生成物不同步时 `--check` 失败。

### 7.2 gameloading

- `loadGate("welcome-ready")` 只加载 welcome。
- `loadGate("spin-ready")` 自动复用已经加载的 base。
- 同资源并发 gate 请求只调用一次 loader。
- 同 URL 去重后进度不重复计字节。
- 资源失败时 gate 失败，后续 gate 不被误标完成。
- destroy 后不再调度资源。
- gate 完成后默认清理 loadedResources。
- 一次性 loading 完成、失败或 destroy 后默认清理 loadedResources。
- `retain` 或 ownership 转移必须显式测试。
- maxConcurrentResources 控制同时 active 的 loader 数量。
- `audio-stream` / `video-stream` 不走 `fetch(...).arrayBuffer()` 全量下载。
- `audio-buffer` 只用于短音效，并覆盖 decode 失败显式报错。

### 7.3 game003

- `main.ts` 仍是轻入口，不静态导入 Pixi/rendercore/gameframeworks。
- 初始只触发 `welcome-ready`。
- `welcome-ready` 完成前不显示欢迎页按钮，完成到 `100%` 后才显示。
- 点击开始后触发 `game-entry-ready`。
- live 初始化只在点击开始后触发，不在欢迎页出现前触发。
- `spin-ready` 完成前 spin 不可用。
- `spin-ready` 完成后 spin 才可用。
- `media` 不被欢迎页和 `spin-ready` 默认阻塞；如短音效需要阻塞，必须在 YAML/gate 中显式依赖。
- `serverUrl` query 仍显式失败。
- loading generated resources 不包含 token、cookie、服务器真实轮带或玩家本次下注。
- `game-loading.generated.ts` 不导入 `rawGameConfig`、Pixi、rendercore、gameframeworks。

## 8. 明确非目标

本任务不做以下事情：

- 不实现完整 FG 玩法。
- 不实现完整 Bonus 玩法。
- 不新增声音/视频资源制作流程。
- 不实现自定义流媒体播放器、HLS/DASH 或 CDN 配置；只定义前端资源分层和媒体播放加载合同。
- 不把 game003 的 mainreelbg、conveyor 或玩法语义上移到 `rendercore`。
- 不通过读取浏览器/CDN 队列数来决定正确性。
- 不把所有资源重新合并成一个首屏 100% loading。
- 不在 app 内手写第二份 symbol scale 表。
- 不手改 `game-static.generated.ts` 或 `game-loading.generated.ts`。
- 不用隐藏 fallback 掩盖缺资源、坏配置或测试 fixture 错误。

## 9. 第二遍遗漏检查清单

交付前必须按下面清单复查，并在任务报告中逐项说明：

1. 目标文件树是否覆盖 `apps/buildgamestatic`、`packages/gameloading`、`apps/game003`、必要时 `packages/gameframeworks`。
2. YAML schema、TypeScript 类型、生成物、README 是否一致。
3. `game-static.generated.ts` / `game-loading.generated.ts` 是否只由生成命令更新。
4. `game003` 轻入口是否仍然没有静态导入重 runtime。
5. 进入欢迎页前的启动 loading 是否只代表 `welcome-ready`，并已处理旧式 `0..99% -> 100%` 进度。
6. live 初始化是否只在用户点击开始后的 `game-entry-ready` 阶段执行。
7. `serverUrl` query 显式失败合同是否未被削弱。
8. `spin-ready` 前 spin 是否真的不可发起网络请求，而不是仅 UI 看起来灰掉。
9. FG/Bonus 空阶段是否是显式配置，并有中文注释。
10. media 资源是否没有默认阻塞欢迎页或普通 spin；短音效、BGM、视频是否按本计划媒体合同分类。
11. `loadedResources` 是否在 gate 完成、一次性 loading 完成、失败终态和 destroy 后释放强引用。
12. 并发配置是否是 app 提交请求上限，而不是伪装成 CDN 队列探测。
13. 所有新增 fail-fast 错误是否有测试覆盖。
14. 如果测试出现奇怪写法，是否修正测试而不是削弱生产逻辑。
15. 是否需要同步 `agents.md`；如果需要，是否已同步。
16. 是否运行了本计划第 6 节要求的验收命令。
17. 是否写了中文任务报告，并使用 UTC 文件名。

## 10. 任务报告要求

任务完成后新增：

```text
tasks/69-phased-loading-initialization-[utctime].md
```

报告必须使用中文，至少包含：

1. 任务目标回顾。
2. 实际修改文件列表。
3. phase/gate 最终 schema 摘要。
4. `game003` 资源最终分配表。
5. spin-ready、FG、Bonus、media 的实际落地状态。
6. 音乐、音效、视频资源的加载策略；如果没有媒体资源，说明 `media allowEmpty` 的当前状态。
7. `loadedResources` 清理策略。
8. 是否更新 `agents.md`；如果未更新，说明为什么不需要。
9. 执行过的命令和结果。
10. 未执行的验收项及原因。
11. 浏览器验收是否由用户执行；如果未执行，明确写“待用户执行”。
12. 第二遍遗漏检查结果。
13. `git status --short --untracked-files=all` 摘要。
