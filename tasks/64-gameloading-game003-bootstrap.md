# gameloading game003 bootstrap 任务计划

## 1. 任务目标

本任务新增一个独立、尽可能小的通用游戏 loading 包 `packages/gameloading`，并把 `apps/game003` 的启动流程改成：

1. 首屏只渲染轻量 loading 页面和进度条。
2. loading 根据游戏包体内配置的资源列表加载资源。
3. 资源加载阶段最多推进到 `99%`。
4. 到 `99%` 后执行一个必须成功的异步初始化回调，用于 `game003` 连接 live WebSocket 并完成 `enterGame`。
5. 只有资源加载和 `99%` 初始化都成功后，进度才能到 `100%`。
6. 到 `100%` 后调用进入游戏回调，才创建 `game003` framework、挂载 Pixi 画面并正式开始游戏渲染。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成包初始化、接口设计、`game003` 集成、测试、文档同步、协作规则同步和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/64-gameloading-game003-bootstrap-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/64-gameloading-game003-bootstrap-260630-123456.md
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

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方运行时依赖。`packages/gameloading` 必须保持无 Pixi、无 `gameframeworks`、无 `netcore`、无 UI 框架依赖。若确实新增依赖，必须执行：

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
CI=true pnpm --filter @slotclientengine/gameloading test
CI=true pnpm --filter game003 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。缺资源、未知扩展名、重复资源 id、`99%` 初始化失败、live 连接失败、`enterGame` 失败、旧链接继续携带 `serverUrl` 等问题都必须暴露为错误，不允许静默跳过或自动降级。

## 3. 当前仓库事实

执行本计划时必须重新盘点，不要只信任本节快照。

当前已存在：

```text
apps/game003
packages/gameframeworks
packages/rendercore
packages/uiframeworks
apps/buildgamestatic
```

当前不存在：

```text
packages/gameloading
```

`apps/game003/src/main.ts` 当前流程是：

1. 解析 URL query。
2. 读取 `GAME003_STATIC_CONFIG`。
3. 创建 `createSlotGameFramework(...)`。
4. framework 构造时挂载 UI / game adapter。
5. 立即调用 `framework.connect()`。

`packages/gameframeworks/src/framework.ts` 当前流程是：

- 构造 `SlotGameFrameworkImpl` 时创建 `SlotGameUiAdapter` 和 `SlotGameLiveSession`，并立即开始 `#mountGameAdapter()`。
- `connect()` 中等待 adapter mount，然后调用 `SlotGameLiveSession.connect()`。

`packages/gameframeworks/src/session.ts` 当前流程是：

- `SlotGameLiveSession.connect()` 依次调用 `client.connect(token)` 和 `client.enterGame(gamecode)`。
- session 内已有 fail-fast 监控：`error`、非预期 `disconnect`、`reconnecting`、服务端错误消息、`logger.warn`、`logger.error` 都会失败。

因此，本任务不能只在 `game003/main.ts` 外面包一层进度条。必须让 `99%` live 初始化和 `100%` 后正式渲染有清晰边界，否则会出现以下问题：

- framework 构造过早，loading 尚未到 `100%` 就已经挂载 Pixi 游戏画面。
- `99%` 手动连接 WebSocket 后，`framework.connect()` 又连接一次，造成双连接。
- 资源加载失败或 live 连接失败被 UI 继续流程掩盖。

## 4. 设计合同

### 4.1 `packages/gameloading` 职责

`packages/gameloading` 是独立小包，只负责通用 loading 页面和资源加载编排：

- 渲染一个极简 DOM loading 页面，至少包含进度条、百分比文本和错误文本。
- 接收资源列表、资源加载器和生命周期回调。
- 按资源权重推进进度，资源阶段最多推进到 `99%`。
- 在 `99%` 调用 `onBeforeComplete`，等待其 Promise 成功。
- `onBeforeComplete` 成功后推进到 `100%`。
- 到 `100%` 后调用 `onEnterGame`。
- 任一阶段失败时停止流程并显示错误，不调用后续回调。

`packages/gameloading` 禁止承担以下职责：

- 不依赖 Pixi。
- 不依赖 `@slotclientengine/gameframeworks`。
- 不依赖 `@slotclientengine/netcore`。
- 不知道 `game003`、skin、slot reel、服务器协议。
- 不在内部读取 token、cookie、localStorage 或远程配置。
- 不为缺资源、坏 URL、未知扩展名提供静默 fallback。

### 4.2 loading 生命周期

建议公开核心 API：

```ts
export interface GameLoadingResource<T = unknown> {
  readonly id: string;
  readonly url?: string;
  readonly kind?: GameLoadingResourceKind;
  readonly weight?: number;
  readonly load?: (context: GameLoadingResourceContext) => Promise<T> | T;
}

export type GameLoadingResourceKind =
  | "image"
  | "json"
  | "text"
  | "binary"
  | "wasm"
  | "module"
  | "style";

export interface GameLoadingOptions<TPrepareResult = unknown> {
  readonly root: HTMLElement;
  readonly resources: readonly GameLoadingResource[];
  readonly onBeforeComplete: (
    context: GameLoadingCompleteContext,
  ) => Promise<TPrepareResult> | TPrepareResult;
  readonly onEnterGame: (
    context: GameLoadingEnterContext<TPrepareResult>,
  ) => Promise<void> | void;
  readonly onError?: (error: Error) => void;
}

export interface GameLoadingHandle {
  readonly loadedResources: ReadonlyMap<string, unknown>;
  start(): Promise<void>;
  destroy(): void;
}

export interface GameLoadingResourceContext {
  readonly resource: GameLoadingResource;
  readonly loadedResources: ReadonlyMap<string, unknown>;
}

export interface GameLoadingCompleteContext {
  readonly loadedResources: ReadonlyMap<string, unknown>;
}

export interface GameLoadingEnterContext<
  TPrepareResult = unknown,
> extends GameLoadingCompleteContext {
  readonly prepareResult: TPrepareResult;
}
```

进度规则必须明确：

- 所有资源总权重必须是有限正数。
- 单个资源 `weight` 缺省为 `1`，但显式传入时必须是有限正数。
- 资源阶段完成度映射到 `0..99`，不能提前显示 `100%`。
- 所有资源完成后，进度固定到 `99%`。
- `onBeforeComplete` 开始时必须已经显示 `99%`。
- 只有 `onBeforeComplete` resolve 后才设置 `100%`。
- `onEnterGame` 必须在 `100%` 之后调用。
- `destroy()` 后不能继续更新 DOM 或调用回调。

### 4.3 按扩展名处理资源类型

默认资源处理按 URL 去掉 query/hash 后的扩展名判断：

| 扩展名                                                          | kind     | 处理方式                                                                          |
| --------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` / `.svg` / `.avif` | `image`  | 创建 `Image`，设置 `src`，等待 `decode()` 或 `load` 完成                          |
| `.json`                                                         | `json`   | `fetch(url)`，校验 `response.ok`，返回 `response.json()`                          |
| `.txt` / `.csv` / `.xml` / `.yaml` / `.yml`                     | `text`   | `fetch(url)`，校验 `response.ok`，返回 `response.text()`                          |
| `.bin` / `.dat` / `.atlas`                                      | `binary` | `fetch(url)`，校验 `response.ok`，返回 `arrayBuffer()`                            |
| `.wasm`                                                         | `wasm`   | `fetch(url)`，校验 `response.ok`，读取 `arrayBuffer()` 并 `WebAssembly.compile()` |
| `.js` / `.mjs`                                                  | `module` | 使用动态 `import(/* @vite-ignore */ url)`，返回 module namespace                  |
| `.css`                                                          | `style`  | 创建 `<link rel="stylesheet">`，等待 load，失败 reject                            |

规则：

- 如果资源显式提供 `load`，优先使用该加载器，不再按扩展名推断。
- 如果没有 `load`，必须有 `url`。
- 如果没有 `kind`，必须能从扩展名推断。
- 未知扩展名必须失败，并提示资源 id 和 URL。
- `module` 加载会执行模块代码，只用于同源游戏包体内脚本；跨域脚本必须由调用方显式自定义 loader 并承担校验。
- `.wasm` 第一版只保证编译到内存，是否实例化由游戏进入回调决定。
- 默认 loader 的返回值必须写入 `loadedResources`，key 为资源 `id`。
- 自定义 `load` 返回 `undefined` 也要记录为已完成；不要把 falsy 返回值误判为加载失败。
- 所有资源默认并发加载；如果后续需要限流，只能新增显式 `concurrency` 配置，不能悄悄改变默认顺序语义。

### 4.4 `game003` 启动顺序

`apps/game003` 必须拆成轻入口和正式游戏入口：

```text
apps/game003/src/main.ts
apps/game003/src/loading-resources.ts
apps/game003/src/game-entry.ts
```

建议顺序：

1. `main.ts` 只导入 `@slotclientengine/gameloading` 和轻量 loading 资源定义，不静态导入 Pixi、`game-adapter.ts`、`game-demo.ts`、`@slotclientengine/rendercore`、`@slotclientengine/gameframeworks/styles.css`。
2. `main.ts` 调用 `createGameLoading(...)`，显示进度条。
3. 资源列表里包含一个 `game003-runtime-module` 自定义资源：

   ```ts
   {
     id: "game003-runtime-module",
     weight: 10,
     load: () => import("./game-entry.js"),
   }
   ```

   这个资源加载完成后，`game-entry` 模块及其依赖脚本已经进入浏览器 module cache。

4. 普通图片、JSON、Wasm、CSS 等资源通过 `packages/gameloading` 默认扩展名 loader 加载。
5. 所有资源完成后，loading 到 `99%`。
6. `onBeforeComplete` 从 `loadedResources` 取出 `game003-runtime-module`，调用：

   ```ts
   const prepared = await runtimeModule.prepareGame003At99({
     search: window.location.search,
   });
   ```

7. `prepareGame003At99` 解析 URL、校验 `serverUrl` 禁止项、创建或复用 gameframeworks live session，并完成真实 `client.connect(token)` + `client.enterGame(gamecode)`。
8. `prepareGame003At99` 成功后 loading 到 `100%`。
9. `onEnterGame` 调用：

   ```ts
   await runtimeModule.enterGame003({
     root,
     prepared,
   });
   ```

10. `enterGame003` 才创建 `createSlotGameFramework(...)`、创建 `game003` adapter、挂载 Pixi canvas，并调用 framework connect 将已连接 session 的 `userInfo/defaultScene` 应用到游戏。

DOM 交接必须明确：

- `#app` 是页面 shell，不直接交给 loading package 永久占用。
- `main.ts` 应创建 `loadingHost` 和 `gameHost` 两个子节点。
- loading package 只挂载到 `loadingHost`。
- `onEnterGame` 开始时创建并切换到 `gameHost`，再把 `gameHost` 传给 `enterGame003(...)`。
- 如果 `enterGame003(...)` 失败，必须销毁已创建的 framework/session，把错误显示回 loading 错误态，不能留下空白页或半挂载 canvas。
- loading package 的 `destroy()` 不能移除调用方传入的 root 节点本身，只能清理自己创建的子节点、style 和监听。

### 4.5 `gameframeworks` 预连接合同

为了避免 `99%` 连接和 `100%` 进入游戏时重复 WebSocket 连接，`packages/gameframeworks` 需要支持显式传入已连接 live session。

建议变更：

1. 在 `packages/gameframeworks/src/types.ts` 增加 session-like 类型：

   ```ts
   export interface SlotGameLiveSessionLike {
     getUserInfo(): Readonly<UserInfo>;
     connect(): Promise<Readonly<UserInfo>>;
     spin(params: SpinParams): Promise<unknown>;
     collect(playIndex?: number): Promise<Readonly<UserInfo>>;
     disconnect(): void;
   }
   ```

2. `SlotGameFrameworkOptions` 增加：

   ```ts
   readonly liveSession?: SlotGameLiveSessionLike;
   ```

3. `createSlotGameFramework` 构造时：
   - 如果没有 `liveSession`，保持当前行为：用 `live` 和 `clientFactory` 创建 `SlotGameLiveSession`。
   - 如果有 `liveSession`，直接使用该 session。
   - 如果同时传 `liveSession` 和 `clientFactory`，必须显式失败，避免调用者误以为自定义 clientFactory 还会生效。

4. `SlotGameLiveSession.connect()` 必须支持已连接后的显式幂等返回：
   - 未连接时：保持当前 `client.connect()` -> `client.enterGame()` -> validate userInfo。
   - 已连接时：先检查 fail-fast monitor 是否已有失败，再重新 validate 当前 `userInfo`，然后直接返回，不得再次调用 `client.connect()` 或 `client.enterGame()`。

5. 增加便捷函数，供 game loading 的 `99%` 初始化使用：

   ```ts
   export async function prepareSlotGameLiveSession(options: {
     readonly live: SlotGameLiveConfig;
     readonly clientFactory?: SlotGameClientFactory;
   }): Promise<SlotGameLiveSession>;
   ```

   该函数只创建 session 并 `await session.connect()`，不创建 UI，不 mount adapter，不渲染 Pixi。
   如果 `session.connect()` 失败，该 helper 必须调用 `session.disconnect()` 做预期清理，然后重新抛出原始错误。

6. `game003` 只能通过 `@slotclientengine/gameframeworks` 使用该能力，不直接依赖 `@slotclientengine/netcore`。

### 4.6 `game003` 资源列表打包方式

资源列表属于游戏包体配置，可以跟随 `game003` 打包。为了保持 loading 首包尽可能小，不要让 `main.ts` 为了拿资源列表而导入完整 `GAME003_STATIC_CONFIG`、逻辑 `gameconfig.json`、Pixi 或 rendercore。

建议扩展现有 `apps/buildgamestatic`：

1. 在 `apps/game003/config/game-static.yaml` 增加 `loading` 配置块，保留中文注释：

   ```yaml
   loading:
     resources:
       - id: game003-bg-landscape
         path: assets/game003-s1/bg1.jpg
         weight: 8
       - id: game003-bg-portrait
         path: assets/game003-s1/bg2.jpg
         weight: 8
       - id: game003-scene-parts
         glob: assets/game003-s1/{mainreelbg,conveyor1,conveyor2}.png
         weight: 6
       - id: game003-symbol-normal-pngs
         glob: assets/game003-s1/{WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC}.png
         weight: 10
       - id: game003-symbol-spin-blur-pngs
         glob: assets/game003-s1/{WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC}.spinBlur.png
         weight: 6
       - id: game003-symbol-disabled-pngs
         glob: assets/game003-s1/{WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC}.disabled.png
         weight: 6
   ```

2. `apps/buildgamestatic` 增加 CLI 参数：

   ```text
   --loading-out apps/game003/src/generated/game-loading.generated.ts
   ```

3. 生成 `apps/game003/src/generated/game-loading.generated.ts`，只包含 loading 资源 URL / glob，不导入 `assets/gamecfg003/gameconfig.json`，不导入 `@slotclientengine/gameframeworks/static-config`，不做运行时大对象校验。

4. `apps/game003/src/generated/game-static.generated.ts` 继续作为正式游戏运行配置，仍由 `game-static.yaml` 生成，禁止手改。

5. `glob` 资源必须展开为确定性的单资源列表：
   - `import.meta.glob(...)` 的 key 必须按字典序排序。
   - 如果 glob 匹配为空，必须显式失败。
   - 每个展开资源的 id 使用 `${groupId}:${basename}` 或等价稳定规则。
   - 展开后所有 id 必须全局唯一；重复必须失败。
   - 展开后所有 URL 必须全局唯一；重复 URL 必须失败，避免同一图片被两个 loading 资源重复统计进度。
   - symbol 预加载不能使用 `assets/game003-s1/*.png` 这类宽泛 glob，因为它会把 `mainreelbg.png`、`conveyor1.png`、`conveyor2.png` 和 symbol/state 贴图混在一起。
   - `glob` 资源的 `weight` 是分组总权重，必须平均拆分到每个展开资源；如果未提供则每个展开资源权重为 `1`。
   - 生成文件不得在运行期读取目录或依赖 Node `fs`。

6. `apps/game003/src/loading-resources.ts` 合并生成资源和动态 game entry 模块资源，导出：

   ```ts
   export function createGame003LoadingResources(): readonly GameLoadingResource[];
   ```

7. `apps/game003/package.json` 的 `generate:static-config`、`check:static-config`、`build`、`dev`、`test`、`typecheck`、`release:check` 必须同步生成或校验两个生成文件。

8. `apps/game003/package.json` 的脚本参数必须显式包含两个输出：

   ```bash
   pnpm --dir ../.. --filter buildgamestatic dev -- \
     --input apps/game003/config/game-static.yaml \
     --out apps/game003/src/generated/game-static.generated.ts \
     --loading-out apps/game003/src/generated/game-loading.generated.ts \
     --game game003
   ```

   `check:static-config` 在同一命令基础上追加 `--check`。

如果执行者评估后认为 `loading` 资源列表暂不进入 YAML，也必须满足以下替代验收：

- `apps/game003/src/main.ts` 的静态 import 仍保持轻量，不导入 Pixi/framework/rendercore。
- 资源列表与 `game-static.yaml` 中 art / symbols 路径有测试校验，避免路径漂移。
- 替代方案和原因必须写入任务报告。

## 5. 目标文件结构

新增：

```text
packages/gameloading/
packages/gameloading/package.json
packages/gameloading/.prettierignore
packages/gameloading/tsconfig.json
packages/gameloading/tsconfig.build.json
packages/gameloading/tsconfig.eslint.json
packages/gameloading/vitest.config.ts
packages/gameloading/eslint.config.cjs
packages/gameloading/README.md
packages/gameloading/src/index.ts
packages/gameloading/src/types.ts
packages/gameloading/src/controller.ts
packages/gameloading/src/default-loaders.ts
packages/gameloading/src/dom.ts
packages/gameloading/tests/controller.test.ts
packages/gameloading/tests/default-loaders.test.ts
packages/gameloading/tests/exports.test.ts

apps/game003/src/generated/game-loading.generated.ts
apps/game003/src/loading-resources.ts
apps/game003/src/game-entry.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/loading-flow.test.ts
```

修改：

```text
packages/gameframeworks/src/types.ts
packages/gameframeworks/src/framework.ts
packages/gameframeworks/src/session.ts
packages/gameframeworks/src/index.ts
packages/gameframeworks/README.md
packages/gameframeworks/tests/session.test.ts
packages/gameframeworks/tests/framework-flow.test.ts
packages/gameframeworks/tests/exports.test.ts

apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/src/cli.ts
apps/buildgamestatic/tests/*.test.ts

apps/game003/package.json
apps/game003/README.md
apps/game003/config/game-static.yaml
apps/game003/src/main.ts
apps/game003/scripts/verify-static-dist.mjs
apps/game003/tests/source-boundary.test.ts
apps/game003/tests/static-config.test.ts

agents.md
```

如果执行时新增空目录，必须放置 `.keepme`。本任务通常会直接写入源码和测试文件，不应留下空目录。

## 6. 分阶段实施计划

### 6.1 初始化 `packages/gameloading`

1. 新增 package，命名为：

   ```json
   {
     "name": "@slotclientengine/gameloading",
     "private": true,
     "type": "module",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.js"
       },
       "./package.json": "./package.json"
     },
     "files": ["dist", "README.md"]
   }
   ```

2. 使用现有仓库风格配置脚本：

   ```json
   {
     "scripts": {
       "build": "tsc -p tsconfig.build.json",
       "lint": "eslint .",
       "test": "vitest run --coverage",
       "typecheck": "tsc -p tsconfig.json --noEmit",
       "format": "prettier --write .",
       "format:check": "prettier --check ."
     }
   }
   ```

3. 保持 runtime dependencies 为空。测试所需 devDependencies 使用根已有版本或与仓库一致版本。
4. `vitest.config.ts` 使用 `happy-dom` 环境；`devDependencies` 至少包含与仓库现有包一致版本的 `happy-dom`、`@vitest/coverage-v8`、`eslint` 相关包。
5. 新增 `.prettierignore`，至少包含：

   ```text
   dist
   coverage
   node_modules
   ```

   这是仓库协作规则要求，避免 package 内 `prettier --check .` 扫到生成物。

6. 实现资源校验：
   - 资源 id 必须非空、trim 后不变、唯一。
   - 权重必须是有限正数。
   - 没有自定义 loader 时必须有 URL。
   - 默认 loader 无法识别扩展名时必须失败。
7. 实现 DOM：
   - `root` 缺失或不是 `HTMLElement` 时失败。
   - DOM class 使用包内固定前缀，例如 `sce-game-loading-*`。
   - 样式尽量内联或由包注入 `<style>`，不要引入 CSS 框架。
   - 错误态显示简短错误消息，同时调用 `onError`。
8. 实现销毁：
   - `destroy()` 后不再更新 DOM。
   - 正在执行的 Promise 不强行取消，但 resolve/reject 后不能继续进入下一阶段。
   - 已注入的事件监听和 DOM 引用必须释放。
   - `destroy()` 不能移除调用方传入的 root 节点本身。

### 6.2 增强 `gameframeworks` 预连接能力

1. 新增 `SlotGameLiveSessionLike` 类型并导出。
2. `SlotGameFrameworkOptions` 增加 `liveSession?: SlotGameLiveSessionLike`。
3. framework 构造逻辑支持使用外部 session。
4. 明确禁止 `liveSession` 与 `clientFactory` 同时传入。
5. `SlotGameLiveSession.connect()` 增加已连接幂等返回，且必须继续检查 fail-fast monitor。
6. 新增并导出 `prepareSlotGameLiveSession(...)`。
7. 补充 README，说明：
   - 普通游戏仍可直接 `framework.connect()`。
   - 带独立 loading 的游戏可在 `99%` 调用 `prepareSlotGameLiveSession()`。
   - 进入游戏时把同一个 session 传给 framework，避免双连接。

### 6.3 扩展静态配置生成 loading 资源

1. 在 `apps/buildgamestatic` 类型中加入：

   ```ts
   export interface GameStaticYamlLoadingConfig {
     readonly resources: readonly GameStaticYamlLoadingResource[];
   }

   export type GameStaticYamlLoadingResource =
     | {
         readonly id: string;
         readonly path: string;
         readonly kind?: string;
         readonly weight?: number;
       }
     | {
         readonly id: string;
         readonly glob: string;
         readonly kind?: string;
         readonly weight?: number;
       };
   ```

2. YAML loader 校验：
   - `loading.resources` 必须非空。
   - `id` 唯一。
   - `path` 和 `glob` 二选一，不能同时存在。
   - `weight` 如果存在必须是有限正数。
   - 路径仍使用相对仓库根目录。
3. CLI 增加 `--loading-out`：
   - 非 `--check` 时同时写两个生成文件。
   - `--check` 时两个生成文件都必须同步。
   - 如果提供 `--loading-out`，必须要求 YAML 存在 `loading.resources`；如果没有提供 `--loading-out`，也不能因为 YAML 存在 loading 配置而静默忽略，必须在 README 和测试里说明当前命令模式。
4. 生成 `game-loading.generated.ts`：
   - 文件头写明由 buildgamestatic 生成，禁止手改。
   - 对单个 path 生成 `?url` import。
   - 对 glob 生成静态字面量 `import.meta.glob(..., { eager: true, import: "default", query: "?url" })`。
   - 导出 `GAME003_LOADING_RESOURCE_URLS` 或等价常量，值为可传给 `@slotclientengine/gameloading` 的轻量资源描述。
   - glob 展开必须排序、空匹配失败、稳定生成资源 id、分摊组权重。
   - 展开后的资源 id 和 URL 都必须去重校验，重复时显式失败。
   - 不允许用 `assets/game003-s1/*.png` 作为 game003 symbol loading 清单；必须用可展示 symbol 的显式 brace glob 或等价生成结果，避免 scene part 和 symbol 资源重复统计。
   - 不导入 `rawGameConfig`。
   - 不导入 Pixi / rendercore / gameframeworks。
5. 修改 `apps/game003/package.json` 的生成和校验命令，保证两个 generated 文件同步。

### 6.4 集成 `game003`

1. `apps/game003/package.json` 增加依赖：

   ```json
   "@slotclientengine/gameloading": "workspace:*"
   ```

   同时更新 `prepare:deps`，必须先构建 `@slotclientengine/gameloading`，再进入 Vite build/dev/test/typecheck 相关流程。示例：

   ```json
   "prepare:deps": "pnpm --filter @slotclientengine/gameloading build && pnpm --filter @slotclientengine/gameframeworks build && pnpm --filter @slotclientengine/rendercore build"
   ```

2. 将当前 `main.ts` 的正式游戏创建逻辑移入 `game-entry.ts`。
3. `game-entry.ts` 导出：

   ```ts
   export interface Game003PreparedLoadingState {
     readonly config: Game003FrameworkConfig;
     readonly skin: Game003SkinConfig;
     readonly liveSession: SlotGameLiveSessionLike;
   }

   export async function prepareGame003At99(options: {
     readonly search: string;
   }): Promise<Game003PreparedLoadingState>;

   export async function enterGame003(options: {
     readonly root: HTMLElement;
     readonly prepared: Game003PreparedLoadingState;
   }): Promise<Game003EnteredGame>;

   export interface Game003EnteredGame {
     readonly framework: SlotGameFramework;
     destroy(): void;
   }
   ```

4. `prepareGame003At99` 必须：
   - 调用 `parseGame003FrameworkConfigFromQuery(search)`。
   - 继续拒绝旧 `serverUrl` query。
   - 继续固定 `GAME003_LIVE_SERVER_URL` 和 `GAME003_GAMECODE`。
   - 调用 `prepareSlotGameLiveSession({ live: config.live })`。
   - 不创建 `createSlotGameFramework(...)`。
   - 不挂载 Pixi canvas。
   - 连接失败时必须依赖 `prepareSlotGameLiveSession(...)` 的失败清理；如果实现中拆开创建 session 和 `connect()`，则同样必须在失败路径调用 `session.disconnect()` 再抛出原始错误。
5. `enterGame003` 必须：
   - 使用 `prepared.skin` 创建 `createGame003Adapter({ skin })`。
   - 使用 `prepared.config` 创建 framework。
   - 把 `prepared.liveSession` 传给 framework。
   - `await framework.connect()`，该调用不得产生第二次 WebSocket connect / enterGame。
   - 成功后注册 `beforeunload` 销毁，并在返回的 `destroy()` 中移除该监听。
   - 如果创建 framework 后任一步失败，必须调用 `framework.destroy()`，避免留下已连接 session 或 Pixi ticker。
6. 新 `main.ts` 必须：
   - 查找 `#app`，缺失则失败。
   - 在 `#app` 下创建独立 `loadingHost`。
   - 创建 loading 页面。
   - 加载资源。
   - 在 `99%` 调用 `prepareGame003At99`。
   - 在 `100%` 调用 `enterGame003`。
   - 进入游戏时切换到独立 `gameHost`，不要让 loading DOM 与 framework DOM 共享同一个 host。
   - 失败时保留 loading 错误态并 `console.error(error)`。
   - 如果 `prepareGame003At99` 已返回 prepared 但 `enterGame003` 失败，必须断开 `prepared.liveSession`。
7. `main.ts` 禁止静态导入以下模块：
   - `pixi.js`
   - `@slotclientengine/rendercore`
   - `@slotclientengine/gameframeworks`
   - `@slotclientengine/gameframeworks/styles.css`
   - `./game-adapter`
   - `./game-demo`
   - `./game-entry`

### 6.5 文档和协作规则

1. 更新 `packages/gameloading/README.md`：
   - 说明资源类型、扩展名推断、`99%` 回调、`100%` 回调。
   - 说明默认 loader 不做隐藏 fallback。
   - 给出最小示例。
2. 更新 `apps/game003/README.md`：
   - 说明首屏 loading。
   - 说明资源列表来自游戏包体。
   - 说明 live 连接在 `99%`。
   - 说明 framework/Pixi 只在 `100%` 后创建。
   - 保留 live URL、skin、gamecode、serverUrl 禁止规则。
3. 更新 `packages/gameframeworks/README.md`：
   - 说明预连接 session 用法。
4. 更新 `agents.md`，至少补充：
   - `packages/gameloading` 拥有通用轻量 loading 页面、资源加载和 `99%/100%` 生命周期。
   - 游戏 app 只配置资源列表和回调，不在 app 内复制通用 loading 调度。
   - `game003` live 初始化必须在 loading `99%` 回调完成，`100%` 后才创建 framework / Pixi 游戏画面。
   - `game-static.generated.ts` 和新的 `game-loading.generated.ts` 都由 `apps/buildgamestatic` 生成，禁止手改。

## 7. 测试计划

### 7.1 `packages/gameloading` 测试

新增或覆盖：

- `controller.test.ts`
  - 资源按权重推进进度。
  - 资源阶段最高只到 `99%`。
  - `onBeforeComplete` 在 `99%` 调用。
  - `onBeforeComplete` 成功后才到 `100%`。
  - `onEnterGame` 在 `100%` 后调用。
  - 资源失败时不调用 `onBeforeComplete` / `onEnterGame`。
  - `onBeforeComplete` 失败时不调用 `onEnterGame`。
  - `destroy()` 后不继续更新 DOM。
- `default-loaders.test.ts`
  - 扩展名去除 query/hash 后识别。
  - 图片、JSON、text、binary、wasm、module、style 的 loader 分派正确。
  - 未知扩展名失败。
  - 缺 URL 失败。
- `exports.test.ts`
  - public API 从 package root 正确导出。

### 7.2 `gameframeworks` 测试

新增或覆盖：

- `SlotGameLiveSession.connect()` 首次调用仍是 `connect -> enterGame`。
- 已连接后再次 `connect()` 返回当前 userInfo，不重复调用 client。
- 已连接后如果 fail-fast monitor 已记录失败，再次 `connect()` 必须 reject。
- `prepareSlotGameLiveSession()` 会完成 `connect -> enterGame` 并返回 session。
- `createSlotGameFramework({ liveSession })` 使用外部 session。
- `liveSession` 与 `clientFactory` 同时传入时显式失败。

### 7.3 `game003` 测试

新增或覆盖：

- `loading-resources.test.ts`
  - `createGame003LoadingResources()` 包含生成的 loading 图片资源。
  - 包含 `game003-runtime-module` 自定义资源。
  - 资源 id 唯一。
  - glob 展开资源 id 稳定、URL 唯一、排序稳定、权重分摊正确。
  - 空 glob、重复 id 或重复 URL fixture 必须失败。
  - game003 symbol loading 清单不能把 `mainreelbg.png` / `conveyor1.png` / `conveyor2.png` 当成 symbol 资源。
  - 不包含 token、cookie、serverUrl query 示例。
- `loading-flow.test.ts`
  - `prepareGame003At99()` 会解析 query 并准备 live session。
  - `prepareGame003At99()` 不创建 framework、不 mount Pixi。
  - `enterGame003()` 使用 prepared live session，framework connect 不产生第二次 live connect。
  - `enterGame003()` 失败会 destroy framework，并断开 prepared session。
  - `main.ts` 的 loadingHost / gameHost 交接不会让 loading DOM 和 game DOM 重叠。
  - `serverUrl` query 继续显式失败。
  - `onBeforeComplete` 失败时不进入游戏。
- `source-boundary.test.ts`
  - `main.ts` 不静态导入 Pixi、rendercore、gameframeworks、game-entry、game-adapter、game-demo。
  - `game003` 仍不直接依赖 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`。
- `static-config.test.ts`
  - `game-loading.generated.ts` 与 YAML 同步。
  - `game-static.generated.ts` 与 YAML 同步。

### 7.4 静态发布检查

更新 `apps/game003/scripts/verify-static-dist.mjs`：

- 继续校验 `dist/index.html` 使用相对 `./assets/...`。
- 继续校验 `serverUrl=`、`VITE_GAME003_`、`import.meta.env` 等敏感或旧入口字符串不出现在 dist。
- 新增校验 `game-loading.generated.ts` 同步。
- 新增校验构建产物中存在多个 JS chunk，避免所有游戏 runtime 被静态塞进首屏入口。
- 如采用 Vite manifest 或其他稳定方式识别入口 chunk，校验入口 chunk 不包含 `game-adapter`、`RenderReelSet`、`pixi.js` 等明显游戏 runtime 字符串；不要用过度脆弱的 minified 字符串做唯一验收依据，必要时以 source-boundary 测试作为主要约束。

## 8. 必跑命令

实施前：

```bash
git status --short --untracked-files=all
git diff --stat
```

生成和校验静态配置：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

单包验证：

```bash
CI=true pnpm --filter @slotclientengine/gameloading lint
CI=true pnpm --filter @slotclientengine/gameloading test
CI=true pnpm --filter @slotclientengine/gameloading typecheck
CI=true pnpm --filter @slotclientengine/gameloading build

CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build

CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic build

CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
```

根级回归：

```bash
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm typecheck
CI=true pnpm build
CI=true pnpm format:check
```

如根级命令耗时过长或因无关包失败，必须在任务报告中写清楚失败包、失败原因、已完成的窄范围验证，以及为什么判断本任务相关范围已覆盖。

本地浏览器手动验收：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

访问示例：

```text
http://127.0.0.1:5208/?skin=1&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
```

手动验收要点：

- 首屏先出现 loading 进度条。
- 资源加载完成后停在 `99%` 或短暂停留于 `99%`，此时正在执行 live 初始化。
- live 连接成功后显示 `100%`。
- `100%` 后才出现 game003 游戏画面。
- 如果 token 无效或网络失败，停在 loading 错误态，不进入游戏。
- URL 加 `serverUrl=wss%3A%2F%2Fexample.test%2F` 必须显式失败。
- resize 后不重建 framework，不重复 live connect。

## 9. 验收标准

任务完成必须同时满足：

- 新增 `@slotclientengine/gameloading` 独立 package。
- `@slotclientengine/gameloading` 没有 Pixi / gameframeworks / netcore / rendercore 运行时依赖。
- loading 默认按扩展名处理不同资源类型。
- `.js` / `.mjs` 资源通过 module loader 进入 module cache。
- `.wasm` 资源编译为 `WebAssembly.Module`。
- glob 资源展开排序稳定、空匹配失败、id 唯一、URL 唯一、权重分摊明确。
- game003 symbol loading 清单不会用宽泛 `*.png` 把 scene part 混进 symbol 资源。
- 资源阶段最多到 `99%`。
- `99%` 回调失败不会进入 `100%`。
- `100%` 回调只在资源和 `99%` 初始化都成功后调用。
- `game003` 的 live WebSocket connect + enterGame 在 `99%` 回调里完成。
- `game003` 只有到 `100%` 后才创建 framework / Pixi 游戏画面。
- `game003` 的 loading DOM 和 game DOM 有明确 host 交接，不会重叠或留下空白页。
- `game003` 不产生双 WebSocket 连接。
- `prepareGame003At99` / `enterGame003` 失败路径会断开 session、destroy framework，不泄漏 live 连接或 Pixi ticker。
- `game003` 不直接依赖 netcore / uiframeworks / logiccore。
- 旧 `serverUrl` query 继续显式失败。
- `game003` 的 `prepare:deps` 已纳入 `@slotclientengine/gameloading build`。
- `packages/gameloading` 有 `exports` / `files` / `.prettierignore` / happy-dom 测试配置。
- `game-static.generated.ts` 和 `game-loading.generated.ts` 都由 `apps/buildgamestatic` 生成并校验同步。
- README 和 `agents.md` 已同步新边界。
- 必跑命令已执行，结果写入任务报告。
- `git diff --check` 通过。
- `git status --short --untracked-files=all` 中只有本任务预期文件变化。

## 10. 任务报告要求

完成后新增：

```text
tasks/64-gameloading-game003-bootstrap-[utctime].md
```

报告必须包含：

- 实施摘要。
- 变更文件清单。
- `packages/gameloading` public API 摘要。
- `game003` 新启动顺序说明。
- `99%` live 初始化如何避免双连接。
- 资源类型和扩展名处理说明。
- 是否更新 `agents.md`，如未更新必须说明原因。
- 执行过的命令和结果。
- 手动浏览器验收结果。
- 如有失败命令，记录完整失败原因、是否重试代理、是否与本任务相关。
- 如有替代方案，例如没有把 loading 资源列表放入 YAML，必须说明原因和防漂移测试。
- 最终 `git status --short --untracked-files=all` 摘要。

## 11. 二次复核清单

提交前必须再检查一遍，确保没有遗漏：

- `packages/gameloading` 是否真的是独立小包，首屏是否没有引入 Pixi / framework。
- 资源 loader 是否按扩展名 fail-fast，未知类型是否会报错。
- `99%` 和 `100%` 的回调顺序是否有测试覆盖。
- `onBeforeComplete` 失败是否绝不会调用 `onEnterGame`。
- `game003/main.ts` 是否仍有重型静态 import。
- glob loading 资源是否稳定展开、空匹配失败、id / URL 去重、权重分摊明确。
- game003 symbol loading 清单是否避免宽泛 `*.png` 把 scene part 混进 symbol 资源。
- `game003` 是否在 `99%` 之前创建了 framework 或 Pixi canvas。
- loadingHost / gameHost 是否清晰分离，进入游戏失败时是否能回到 loading 错误态。
- 预连接 session 是否会被 framework 重复 connect。
- 预连接或进入游戏失败是否会断开 session、destroy framework，避免连接和 ticker 泄漏。
- `beforeunload` / destroy 是否仍会断开 live session。
- `serverUrl` query 禁止规则是否仍存在。
- static YAML、generated TS、package scripts、release check 是否同步。
- `game003 prepare:deps` 是否构建了 `@slotclientengine/gameloading`。
- `packages/gameloading` 是否补了 package exports、`.prettierignore`、happy-dom 测试环境和 public exports 测试。
- README、`agents.md` 是否同步。
- 是否不小心手改了 generated 文件但没有更新生成器。
- 是否不小心把 token、cookie、真实服务器轮带或运行期下注放进 YAML / loading 资源。
- 是否只因为测试难写就改变了生产逻辑；若是，必须回退生产改动并修正测试。
- 是否执行 `git diff --check`。
- 是否写了最终中文任务报告。
