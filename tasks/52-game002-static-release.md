# game002 static release 任务计划

## 1. 任务目标

为现有 `apps/game002` 增加一个可直接发布到 Caddy 或 CDN 的纯静态发布版本。发布产物应由 Vite 构建生成，部署时只需要复制 `apps/game002/dist/` 目录到静态站点根目录或子目录，浏览器访问后即可加载游戏。

本任务不是新建第二套 game002 运行时，也不是把 live 配置注入到构建环境里。`game002` 当前已经是基于 Pixi、`@slotclientengine/gameframeworks` 和 `@slotclientengine/rendercore` 的 live slot app，发布版必须继续复用这套入口、适配、HUD、spin、collect、viewport 和 grid-cell reels 逻辑，避免出现一个开发版和一个发布版分别维护游戏逻辑的情况。

核心交付：

- `apps/game002` 的生产构建产物 `apps/game002/dist/` 可以作为纯静态目录部署。
- 页面部署到 Caddy/CDN 后不需要后端模板、不需要运行时配置接口、不需要 `.env` 注入、不需要 Node 服务。
- `serverUrl`、`gamecode`、`token` 以及其它 live/spin 运行参数只能通过 URL query 参数提供。
- 源码、README、测试和构建产物中不再保留真实默认 `serverUrl`、`gamecode`、`token`。
- 缺少必需 URL 参数、参数为空、参数重复、数字非法、WebSocket URL 非法、HTTPS 页面使用 `ws://` 等情况必须显式失败，不做 mock/replay/local/default 兜底。
- 第一屏仍然是游戏画面；参数合法时直接进入当前 game002 live 连接流程，不新增 landing page 或配置表单。
- 完成后新增中文任务报告：

```text
tasks/52-game002-static-release-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/52-game002-static-release-260626-123456.md
```

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、文档同步、`agents.md` 同步判断和最终任务报告。

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

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。若确实需要新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

## 3. 当前实现事实

### 3.1 现有 game002 入口

关键文件：

```text
apps/game002/index.html
apps/game002/package.json
apps/game002/vite.config.ts
apps/game002/src/main.ts
apps/game002/src/env.ts
apps/game002/src/framework-config.ts
apps/game002/src/game-adapter.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-layout.ts
apps/game002/src/money.ts
apps/game002/src/assets.ts
apps/game002/src/scene.ts
apps/game002/src/styles.css
apps/game002/tests/env.test.ts
apps/game002/tests/framework-flow.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/eslint.config.cjs
apps/game002/README.md
```

当前 `apps/game002/src/main.ts`：

- 从 `@slotclientengine/gameframeworks` 导入 `createSlotGameFramework()`。
- 从 `./framework-config.js` 导入 `parseGame002FrameworkConfig()`。
- 当前调用 `parseGame002FrameworkConfig(import.meta.env)`。
- `framework.connect()` 在页面加载后立即执行。
- 捕获配置错误时会把错误文本写入 `#app` 并重新抛出。

当前 `apps/game002/src/framework-config.ts`：

- 暴露 `DEFAULT_GAME002_ENV_CONFIG`。
- 从 `VITE_GAME002_*` 环境变量读取 live/spin 配置。
- 缺省 env 会落到默认 live 配置。
- `VITE_GAME002_SERVER_URL` 只接受 `ws://` 或 `wss://`。
- 显式空字符串、非法 URL、非正数 bet/lines/times/request timeout、非法 `autonums` 会失败。

当前 `apps/game002/vite.config.ts`：

- 已设置 `base: "./"`，这对静态托管和 CDN 子目录发布是正确方向。
- `server.port` 当前为 `5206`。
- build 输出默认是 `apps/game002/dist/`。

当前 `apps/game002/dist/index.html` 已经使用相对资源路径：

```text
./assets/index-*.js
./assets/index-*.css
```

本任务必须保留这个静态发布友好的相对路径特性。

### 3.2 现有架构边界

`game002` 必须继续遵守这些边界：

- `@slotclientengine/gameframeworks` 负责通用 slot shell、HUD、live 连接、enter game、spin、`GameLogic` 转换、余额/下注/win 状态和最终 `collect()`。
- `apps/game002` 只提供 `SlotGameAdapter`，负责 Pixi canvas、game002 资源、live `defaultScene`、spin 主 scene、`54` 个 grid cell reels 展示。
- `apps/game002` 不直接依赖 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`。
- `apps/game002` 不直接创建 live client，不直接调用 `collect()`。
- `packages/rendercore` 拥有 symbol 状态、grid-cell reel 调度、裁切、状态机和 art viewport 适配。
- `packages/uiframeworks` 拥有页面 DOM frame、canvas 逻辑尺寸上限、黑边居中和 viewport resize 适配。
- live slot 前端不能拿服务器真实轮带；spin 仍使用本地公开轮带滚动，只把服务器本轮最终 scene 叠加进临时轮带窗口。

这些边界不因静态发布而改变。

### 3.3 当前发布风险

当前实现不能直接作为正式静态发布面，原因：

- 运行配置来自 `import.meta.env`，这在纯静态 CDN/Caddy 发布后无法按每次访问动态改变。
- 源码和 README 中包含真实默认 live URL、gamecode、token。
- 缺省 env 会自动连接默认测试服，这对发布页是隐藏兜底，不符合“URL 参数提供配置”和“逻辑 bug 尽早暴露”的要求。
- 当前 `env.test.ts` 锁定了缺省 env 等于默认配置，任务实现时必须修改测试合同，而不是为了旧测试保留不该保留的默认凭据。

## 4. 静态发布配置合同

### 4.1 URL query 参数

发布版统一从 `window.location.search` 读取配置。只支持 query 参数，不从 hash、`localStorage`、cookie、构建 env、远程 `config.json` 或隐藏默认值读取 live 配置。

必需 query 参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `serverUrl` | string | live WebSocket 地址，只接受 `ws://` 或 `wss://` |
| `gamecode` | string | live game code，非空 |
| `token` | string | 登录 token，非空 |
| `businessid` | string | business id，非空 |
| `clienttype` | string | client type，非空 |
| `jurisdiction` | string | jurisdiction，非空 |
| `language` | string | language，非空 |
| `bet` | number | 正数，按服务端整数单位发送 |
| `lines` | number | 正数 |
| `times` | number | 正数 |
| `autonums` | integer | 整数，允许 `-1` |
| `requestTimeoutMs` | number | 正数，传给 live request timeout |

示例 URL：

```text
https://cdn.example.com/game002/?serverUrl=wss%3A%2F%2Fgameserv.example.com%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

参数值必须 URL encode。特别是 `serverUrl` 中的 `:`、`/`，以及 token 中可能出现的 `+`、`&`、`=`，必须用 `encodeURIComponent()` 处理后再拼接到 URL。

### 4.2 失败规则

以下情况必须在初始化阶段显式失败：

- 缺少任一必需 query 参数。
- 任一必需 query 参数为空字符串或 trim 后为空。
- 同一个受支持参数在 URL 中出现多次，例如 `?token=a&token=b`。
- `serverUrl` 不是合法 URL。
- `serverUrl` 协议不是 `ws:` 或 `wss:`。
- 页面自身是 `https:`，但 `serverUrl` 使用 `ws://`。这种场景会被浏览器混合内容策略拦截，必须提前给出明确错误。
- `bet`、`lines`、`times`、`requestTimeoutMs` 不是有限正数。
- `autonums` 不是整数。

失败时允许使用当前 `main.ts` 的 fatal error 展示方式：把错误消息写入 `#app` 并抛出。错误消息应指出哪个参数非法，但不要输出 token 的实际值。

不允许的兜底：

- 不允许缺参数时使用旧 `DEFAULT_GAME002_ENV_CONFIG`。
- 不允许连接默认测试服。
- 不允许改成 mock/replay/local scene。
- 不允许弹出配置表单让用户手输参数。
- 不允许把 query 参数写入 `localStorage` 后下次自动复用。
- 不允许为了测试方便让 `serverUrl` 接受 `http://` 或 `https://`。

未知 query 参数可以忽略，避免 CDN cache busting 或外部追踪参数破坏启动；但已知参数重复必须失败。

### 4.3 安全与日志

由于本任务明确要求 token 通过 URL 参数提供，执行时必须记录以下发布风险：

- URL query 会出现在浏览器地址栏、历史记录、Caddy/CDN 访问日志、监控日志和可能的 Referer 中。
- 发布环境应使用短期 token 或一次性启动 token。
- 静态站点建议通过 HTTPS 访问，并使用 `wss://` live server。
- 源码、README、测试快照、构建产物和任务报告不得写入真实生产 token。
- `console.error`、页面错误文本和任务报告不得输出 token 实值。

本任务只实现前端静态发布读取方式，不负责设计新的服务端 token 签发机制。

## 5. 建议实现方案

### 5.1 运行配置代码

建议保留 `apps/game002/src/framework-config.ts` 作为配置转换入口，但把 env 合同改为 URL query 合同。

需要调整：

```text
apps/game002/src/framework-config.ts
apps/game002/src/env.ts
apps/game002/src/main.ts
apps/game002/tests/env.test.ts
apps/game002/tests/framework-flow.test.ts
apps/game002/tests/source-boundary.test.ts
```

建议 API：

```ts
export interface Game002QueryConfig {
  readonly serverUrl: string;
  readonly token: string;
  readonly gamecode: string;
  readonly businessid: string;
  readonly clienttype: string;
  readonly jurisdiction: string;
  readonly language: string;
  readonly bet: number;
  readonly lines: number;
  readonly times: number;
  readonly autonums: number;
  readonly requestTimeoutMs: number;
}

export function parseGame002QueryConfig(
  search: string | URLSearchParams,
  options?: { readonly pageProtocol?: string },
): Game002QueryConfig;

export function parseGame002FrameworkConfigFromQuery(
  search: string | URLSearchParams,
  options?: { readonly pageProtocol?: string },
): Game002FrameworkConfig;
```

`Game002FrameworkConfig` 可以沿用现有结构：

```ts
export interface Game002FrameworkConfig {
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex: number;
  readonly spinRequest: SlotGameSpinRequest;
}
```

转换规则：

- `live.serverUrl = query.serverUrl`
- `live.token = query.token`
- `live.gamecode = query.gamecode`
- `live.businessid = query.businessid`
- `live.clienttype = query.clienttype`
- `live.jurisdiction = query.jurisdiction`
- `live.language = query.language`
- `live.requestTimeoutMs = query.requestTimeoutMs`
- `betOptions = [{ bet, lines, times }]`
- `initialBetIndex = 0`
- `spinRequest = { bet, lines, times, autonums }`

实现注意：

- 使用 `new URLSearchParams(search)` 解析。
- 如果入参是完整 `location.search`，允许包含开头的 `?`。
- 每个已知参数先用 `params.getAll(name)` 检查数量；数量不是 `1` 时失败。
- 字符串参数统一 trim；trim 后为空失败。
- 数字参数用 `Number(raw)`，必须 `Number.isFinite()`。
- 整数参数用 `Number.isInteger()`。
- `serverUrl` 继续调用 `validateLiveServerUrl()`，不要复制 gameframeworks 的 URL 协议校验。
- HTTPS 页面禁止 `ws://` 应在 `framework-config.ts` 内额外校验，便于测试。
- 删除 `DEFAULT_GAME002_ENV_CONFIG` 中的真实 URL/gamecode/token，或彻底删除该默认配置对象。
- 如果为了测试需要样例配置，应放在测试 helper 中，并使用 `wss://example.test/`、`TOKEN`、`GAME_CODE` 这类占位值。

`apps/game002/src/main.ts` 改为：

```ts
const config = parseGame002FrameworkConfigFromQuery(window.location.search, {
  pageProtocol: window.location.protocol,
});
```

不要继续把 `import.meta.env` 传入 game002 runtime config。

`apps/game002/src/env.ts` 如果保留 barrel export，需要同步导出新函数和类型；如果命名已经不合适，可以让它继续兼容导出，但不要保留 `VITE_GAME002_*` 语义。

`URLSearchParams` 会把未编码的 `+` 当成空格处理；测试中必须覆盖 token 包含 `%2B` 的场景，并在 README 中提醒发布方用 `encodeURIComponent()` 生成 query。

### 5.2 静态构建检查脚本

建议新增：

```text
apps/game002/scripts/verify-static-dist.mjs
```

并同步调整：

```text
apps/game002/package.json
apps/game002/eslint.config.cjs
```

在 `apps/game002/package.json` 增加：

```json
{
  "scripts": {
    "release:check": "pnpm run build && node scripts/verify-static-dist.mjs"
  }
}
```

因为当前 `apps/game002/eslint.config.cjs` 只给 `*.cjs` 和 `*.ts` 配了 globals，新增 `.mjs` 脚本后，必须给 `scripts/**/*.mjs` 或 `**/*.mjs` 增加 Node globals / module 规则，避免为了脚本绕过 lint 或把 `console`、`process` 写成奇怪形式。如果不想扩展 ESLint 配置，也可以把检查脚本写成 `.cjs`，但命名、package script 和计划要保持一致。

脚本检查内容：

- `apps/game002/dist/index.html` 存在。
- `dist/index.html` 中没有 `/src/main.ts`。
- `dist/index.html` 中的 script/link 资源使用 `./assets/` 相对路径，不使用 `/assets/` 绝对路径。
- `dist/assets/` 存在且包含 `index-*.js`、`index-*.css`、`bgfull-*.jpg` 和第二套 symbol PNG。
- `dist/` 中不包含旧真实默认 token、旧真实默认 gamecode、旧真实默认 live URL。
- `dist/` 中不包含 `VITE_GAME002_` 字符串。

脚本只读构建产物，不修改文件。它用于证明 `dist/` 是纯静态发布目录，并且没有把旧默认凭据打进 bundle。

### 5.3 README 和发布说明

更新：

```text
apps/game002/README.md
```

必须同步说明：

- `game002` 发布产物为 `apps/game002/dist/`。
- 构建命令：

```bash
pnpm --filter game002 build
pnpm --filter game002 release:check
```

- 本地静态预览命令：

```bash
pnpm --filter game002 exec vite preview --host 127.0.0.1 --port 5207 --strictPort
```

- 访问示例：

```text
http://127.0.0.1:5207/?serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

- Caddy 示例：

```caddyfile
game002.example.com {
  root * /srv/game002
  file_server
}
```

- 子目录部署示例：

```text
/srv/www/game002/index.html
/srv/www/game002/assets/*
https://cdn.example.com/game002/?serverUrl=...
```

- CDN/Caddy 不需要向 HTML 注入 env；只要不删除 query 参数即可。
- 不要在 README 中继续列真实默认 token、gamecode、server URL。
- 如果页面通过 HTTPS 发布，`serverUrl` 应使用 `wss://`。
- token 放在 URL 中会进入日志，发布方应使用短期 token。
- 子目录部署的访问地址必须带尾斜杠，例如 `https://cdn.example.com/game002/?serverUrl=...`；不要使用 `https://cdn.example.com/game002?serverUrl=...`。因为 Vite `base: "./"` 下，缺少尾斜杠会让浏览器把 `./assets/*` 解析到上一级路径。Caddy/CDN 如需兼容无尾斜杠访问，必须配置保留 query 的重定向。

README 中保留现有 game002 架构、资源、布局、spin 时序、金额显示说明，但把“Live 配置”章节从 `VITE_GAME002_*` 改为 URL query 参数。

### 5.4 测试调整

更新或替换：

```text
apps/game002/tests/env.test.ts
```

建议测试名可以继续叫 `env.test.ts`，也可以重命名为：

```text
apps/game002/tests/runtime-config.test.ts
```

测试必须覆盖：

- 完整 query 可以解析为 `Game002QueryConfig`。
- 完整 query 可以转换为 `Game002FrameworkConfig`。
- 缺少 `serverUrl`、`gamecode`、`token`、`bet`、`lines` 等任一必需参数会失败。
- 空字符串或 trim 后为空会失败。
- 重复参数会失败。
- `serverUrl=http://...`、`serverUrl=https://...`、非法 URL 会失败。
- `pageProtocol: "https:"` 且 `serverUrl=ws://...` 会失败。
- `pageProtocol: "http:"` 且 `serverUrl=ws://...` 可以通过，用于本地开发。
- token 中包含 `+`、`&`、`=` 等字符时，必须通过 URL encode 后解析回原值；未编码导致的错误不应被静默修复。
- 非正数 `bet`、`lines`、`times`、`requestTimeoutMs` 会失败。
- 非整数 `autonums` 会失败。
- token 值不应出现在错误消息中。

更新：

```text
apps/game002/tests/framework-flow.test.ts
```

当前测试使用 `parseGame002FrameworkConfig({})` 取得默认配置。实现后必须改成显式 query helper，例如：

```ts
const config = parseGame002FrameworkConfigFromQuery(validQuery());
```

不要为了旧测试继续保留缺省 live 配置。如果测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑。

更新：

```text
apps/game002/tests/source-boundary.test.ts
```

新增或调整断言：

- `apps/game002/src` 不包含旧真实 token、旧真实 gamecode、旧真实 server URL。
- `apps/game002/src/main.ts` 不再把 `import.meta.env` 传入 game002 runtime 配置。
- `apps/game002` 仍不直接引用 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`。
- `apps/game002/package.json` runtime dependencies 仍只有：

```json
{
  "@slotclientengine/gameframeworks": "workspace:*",
  "@slotclientengine/rendercore": "workspace:*",
  "pixi.js": "^8.1.6"
}
```

新增静态构建检查脚本后，可以为脚本本身增加轻量测试；如果不加单测，必须通过 `release:check` 作为验收覆盖。

## 6. 不应修改的内容

本任务不应修改：

- `packages/gameframeworks` 的 live/spin/collect 状态机。
- `packages/netcore` 的 WebSocket 登录协议。
- `packages/rendercore` 的 grid-cell reels 算法。
- `packages/uiframeworks` 的 DOM frame/viewport policy。
- `apps/game002` 的棋盘布局、symbol 资源、金额格式化、临时融合轮带合同。

除非实现过程中发现当前 public API 无法支持静态 query 配置，否则不要改共享包。若必须改共享包，需要同步补充对应包测试和 README，并在任务报告中解释为什么 `apps/game002` 层无法解决。

## 7. 执行步骤

### 7.1 预检查

```bash
git status --short --untracked-files=all
git diff --stat
pnpm --filter game002 test
```

预检查失败时先判断是否是当前任务必须修的失败。不要回滚用户已有改动。

### 7.2 改运行配置

1. 修改 `apps/game002/src/framework-config.ts`，把 env parser 改为 query parser。
2. 删除或废弃 `DEFAULT_GAME002_ENV_CONFIG` 的真实默认值。
3. 增加必需参数、重复参数、数字、WebSocket URL、HTTPS+ws 校验。
4. 修改 `apps/game002/src/main.ts`，从 `window.location.search` 和 `window.location.protocol` 构建 config。
5. 同步 `apps/game002/src/env.ts` barrel export。

### 7.3 改测试

1. 更新 `apps/game002/tests/env.test.ts` 或改名为 `runtime-config.test.ts`。
2. 更新 `apps/game002/tests/framework-flow.test.ts`，用显式 query 测试 helper。
3. 更新 `apps/game002/tests/source-boundary.test.ts`，锁定无真实默认凭据、无底层包直接依赖、无旧 env 合同。
4. 如果测试为了旧默认值失败，修改测试合同，不要在生产代码中重新引入默认 live 配置。

### 7.4 加静态产物检查

1. 新增 `apps/game002/scripts/verify-static-dist.mjs`。
2. 在 `apps/game002/package.json` 增加 `release:check`。
3. 同步 `apps/game002/eslint.config.cjs`，确保新增 `.mjs` 脚本能通过 `pnpm --filter game002 lint`。
4. 确保脚本只读 `dist/`，不写文件。
5. 确保脚本失败信息明确指出是路径、资源、相对 URL、旧凭据还是 env 字符串问题。

### 7.5 更新文档

1. 更新 `apps/game002/README.md` 的 Live 配置章节。
2. 增加静态构建、Caddy/CDN 部署、URL query 示例、token 风险说明。
3. 删除 README 中真实默认 token、gamecode、server URL。
4. 保留现有布局、资源、spin、金额显示说明。

### 7.6 agents.md 同步判断

检查本任务是否需要把静态发布规则提升为仓库协作规则。

如果实现后只改变 `apps/game002` 的 README 和测试，不改变通用协作约束，可以不更新 `agents.md`，但任务报告必须写明“未更新 agents.md，原因是本次仅为 game002 app 发布面合同”。

如果执行者认为这是后续 live app 的通用发布规则，或用户要求把该约束持久化，则更新：

```text
agents.md
```

建议新增到“执行约定”：

```text
- `apps/game002` 静态发布版只能从 URL query 读取 live/server/spin 运行参数；不要在源码、README、测试或构建产物中保留真实 serverUrl、gamecode、token 默认值，也不要用 mock/replay/local/default 配置隐藏缺参错误。
```

更新后在任务报告中记录。

## 8. 验收命令

基础验收：

```bash
pnpm --filter game002 format:check
pnpm --filter game002 lint
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
pnpm --filter game002 release:check
```

构建产物敏感信息检查：

```bash
rg --no-ignore -n "VITE_GAME002|7a82f5ca45b5aa3246b2ad0123272295|065P8NOEgwdSXFTB6uDqX|gameserv\\.rgstest\\.slammerstudios\\.com" apps/game002/src apps/game002/tests apps/game002/scripts apps/game002/dist apps/game002/package.json apps/game002/vite.config.ts apps/game002/README.md
```

上面命令必须无输出。这里必须使用 `--no-ignore`，因为仓库根 `.gitignore` 会忽略 `dist/`；不用 `--no-ignore` 可能漏扫构建产物。如果 README 需要提到“不要使用旧默认值”，也不要写出完整真实 token。

静态预览：

```bash
pnpm --filter game002 exec vite preview --host 127.0.0.1 --port 5207 --strictPort
```

如果端口被占用，改用：

```bash
pnpm --filter game002 exec vite preview --host 127.0.0.1 --port 5208 --strictPort
```

浏览器访问：

```text
http://127.0.0.1:5207/?serverUrl=ws%3A%2F%2F127.0.0.1%3A9%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

这个本地 smoke 使用不可连接的 `ws://127.0.0.1:9/` 时，允许最终进入 live 连接错误；但必须能证明：

- `dist/index.html` 成功加载。
- JS/CSS/assets 没有 404。
- 错误来自 live 连接失败，而不是缺 query、资源路径、配置解析或 bundle 启动失败。
- 记录 smoke URL 时，`token` 必须写成 `<redacted>` 或占位符，不要把真实 token 写入任务报告。

如果有可用 live 参数，再访问真实 URL：

```text
http://127.0.0.1:5207/?serverUrl=<encoded-wss-url>&gamecode=<encoded-gamecode>&token=<encoded-token>&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

真实 live smoke 验收：

- 第一屏是 `game002` 游戏画面，不是 landing page。
- HUD 从 connecting 进入 Ready/idle。
- 点击 Spin 后进入 presenting，再回到 Ready/idle。
- console 不出现配置解析错误、资源 404、unknown symbol、缺贴图或静态路径错误。
- 如果 live 服务拒绝 token、gamecode 或 serverUrl，记录为外部 live 配置失败，不添加本地兜底。

最终通用检查：

```bash
git diff --check
git status --short --untracked-files=all
```

## 9. 发布目录验收

构建完成后，发布方只需要复制：

```text
apps/game002/dist/index.html
apps/game002/dist/assets/*
```

到 Caddy/CDN 目录。不要复制源码、`node_modules`、coverage、`.turbo` 或测试文件。

发布后访问格式：

```text
https://game002.example.com/?serverUrl=...&gamecode=...&token=...&businessid=...&clienttype=...&jurisdiction=...&language=...&bet=...&lines=...&times=...&autonums=...&requestTimeoutMs=...
```

如果部署到子目录：

```text
https://cdn.example.com/slots/game002/?serverUrl=...&gamecode=...&token=...
```

由于 `vite.config.ts` 保持 `base: "./"`，HTML 中的静态资源应继续从当前目录下的 `./assets/` 加载。子目录 URL 必须保留尾斜杠；如果发布入口是 `/slots/game002`，需要重定向到 `/slots/game002/` 并保留原 query 参数。

CDN/Caddy 注意事项：

- 不要把 query 参数重定向丢失。
- 不需要对 `index.html` 做服务端模板替换。
- assets 可以长缓存；`index.html` 是否缓存由发布策略决定。
- access log 中可能包含 token，发布环境需按安全策略处理。
- 不要用 `git add -f` 强行提交 `apps/game002/dist/`。如果本任务需要给发布方交付文件，任务报告记录本机可复制目录 `apps/game002/dist/` 和构建命令；由发布流程复制或打包该目录。

## 10. 最终任务报告要求

完成实现后，新建：

```text
tasks/52-game002-static-release-[utctime].md
```

报告必须包含：

- 报告时间，使用 UTC `date -u +%y%m%d-%H%M%S`。
- 计划文件路径：`tasks/52-game002-static-release.md`。
- 变更文件清单。
- URL query 参数合同最终版本。
- 是否删除旧真实默认 live URL/gamecode/token，以及检查证据。
- `apps/game002/dist/` 静态产物检查结果。
- 执行过的命令和结果。
- 静态预览 URL 和 smoke 结果。
- smoke URL 中的 token 必须脱敏。
- 如果真实 live smoke 没有执行，说明原因；不要用 mock 成功冒充 live 成功。
- 是否更新 `agents.md`；如果未更新，说明原因。
- `pnpm-lock.yaml` 是否变化。
- 已知风险和后续事项。

## 11. 二次遗漏检查清单

交付前逐项检查：

- 入口：`main.ts` 是否彻底停止依赖 `import.meta.env` 作为 game002 runtime config。
- 参数：所有原 `VITE_GAME002_*` 运行参数是否都有明确 query 合同。
- 凭据：源码、README、测试、dist 是否不再包含真实默认 token/gamecode/server URL。
- 失败：缺参、空参、重复参、非法数字、非法 URL、HTTPS+ws 是否显式失败。
- 安全：错误消息和报告是否没有输出 token 实值。
- 静态：`base: "./"` 是否保留，dist HTML 是否使用相对 assets。
- 子目录：README/报告是否提醒子目录访问必须带尾斜杠或配置保留 query 的重定向。
- 架构：`game002` 是否仍只依赖 `gameframeworks` facade 和 `rendercore`，没有直接引入底层 live/UI/logic 包。
- 兜底：是否没有新增 mock/replay/local/default scene/config 兜底。
- 文档：README 是否提供 Caddy/CDN 和 URL encode 示例。
- 测试：旧 env 默认值测试是否已改为 URL query 合同测试。
- 脚本：新增静态检查脚本是否被 lint 覆盖，且没有为了 lint 写出奇怪绕法。
- 产物：`dist/`、`coverage/`、`.turbo/` 是否没有被误加入 git。
- 报告：是否按 `tasks/52-game002-static-release-[utctime].md` 写中文报告。
