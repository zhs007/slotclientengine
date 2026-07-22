# Task 122：Leo Launcher Bootstrap Provider 与 game002 接入

## 1. 任务目标

本任务基于已验收的 Task 121，实现平台初始化的下一层集成：建立通用、per-instance、可取消的 `PlatformBootstrapProvider` 合同；按照 `test` 分支已经存在且可视为最终版的 Leo launcher 参数，实现独立的 Leo provider；让 `game002` 的平台请求、setting/translation 和 live session 与 CDN 资源加载尽早并行，并在 loading 99% 到 100% 之间完成统一 readiness 验收。

目标流程：

```text
loading start（Leo Loading UI 已挂载）
  -> game002 strict query parser
  -> concurrently
       |-> CDN game resources: progress 0..99
       |-> LeoPlatformBootstrapProvider.prepare()
       |    launcher config -> translation + setting
       `-> prepare the only live session / WebSocket

loading reaches 99%
  -> readiness join barrier
       critical CDN resources loaded
       launcher/config/translation/setting ready
       WebSocket connected and entered game
       game002 skin/resource validation ready
       Leo Loading visual ready
  -> transfer ownership only after every check passes

loading enters 100%
  -> create current gameframeworks
  -> inject Leo SlotGameUiFactory
  -> apply initial UI preferences and platform presentation
```

任务完成后：

1. 新增协议无关 package `@slotclientengine/platformbootstrap`。
2. 新增独立 Leo 实现 package `@slotclientengine/platformbootstrap-leo`。
3. Leo launcher 参数以 `test` 分支现有参数为最终合同，不再等待另一套参数定义。
4. `game002` 在 Loading UI 挂载后尽早请求 launcher config、translation 和 setting，不等 CDN 到 99% 才开始。
5. `game002` 仍只创建现有 gameframeworks live session，不引入 netcore2 或第二套 round framework。
6. launcher/platform 数据通过只读 snapshot 注入，不恢复 `stateData`、Zustand singleton 或 `GameContainer`。
7. `gameframeworks` 接受显式 initial muted/fast/auto preference，之后继续拥有唯一 runtime UI state。
8. `game003` 不接入 Leo provider，作为默认路径稳定对照。
9. `gameloading` 把“并行启动 readiness”和“99% 完成检查”拆成明确合同，资源进度与平台/network readiness 互不伪装。

任务完成后必须新增中文执行报告：

```text
tasks/122-platform-bootstrap-provider-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

## 2. 基线与分支要求

Task 122 必须基于已验收的 Task 121 分支或其等价合入结果：

```text
codex/task-121-leo-slot-game-ui
b7e6096 feat(game002): add Leo slot game UI
```

开始实现前确认：

```bash
git status --short --branch
git log -1 --oneline
git merge-base --is-ancestor b7e6096 HEAD
```

如果 Task 121 已通过 merge、squash 或 cherry-pick 进入 `main`，以包含等价 frame host、Leo UI factory 和 game002 注入结果的最新 main 为准，不要求 commit id 相同。

建议实现分支：

```text
codex/task-122-platform-bootstrap-provider
```

如果当前工作树有其他同事的修改，不得清理、stash、覆盖或顺带提交；从干净基线建立独立 worktree/分支实施。

## 3. 已确认的 Leo 参数合同

### 3.1 权威代码来源

本任务明确采用 `test` 分支当前实现中的参数名与模式判断作为最终 launcher 参数合同。实现前必须审计但不得直接复制以下文件：

```text
packages/game-leo-frameworks/src/services/bridge/service.ts
packages/game-leo-frameworks/src/services/bridge/utils.ts
packages/game-leo-frameworks/src/stores/init/store.ts
packages/game-leo-frameworks/src/stores/init/types.ts
packages/game-leo-frameworks/src/stores/user/types.ts
packages/game-leo-frameworks/src/services/indexedDb/service.ts
```

可以复用其中已确认的业务事实和参数；不能复用其全局状态、round、socket 和依赖注入架构。

### 3.2 最终参数表

| 参数            | 语义                           | Task 122 规则                                             |
| --------------- | ------------------------------ | --------------------------------------------------------- |
| `configUrl`     | launcher config endpoint       | 可选；缺省为 test 分支当前 rgstest endpoint               |
| `jurisdiction`  | 司法辖区                       | 必填非空；同时进入 launcher config request 和 live config |
| `license`       | launcher license               | 可选；存在时进入 launcher config request                  |
| `gameCode`      | launcher canonical game code   | canonical 名称                                            |
| `gamecode`      | 当前游戏兼容 game code         | 兼容名称；与 `gameCode` 同时存在时必须相等                |
| `lang`          | launcher canonical language    | canonical 名称                                            |
| `language`      | 当前游戏兼容 language          | 兼容名称；与 `lang` 同时存在时必须相等                    |
| `platformToken` | launcher/platform credential   | canonical 名称；只在需要 credential 的调用栈内传递        |
| `token`         | 当前游戏兼容 credential        | 兼容名称；与 `platformToken` 同时存在时必须相等           |
| `businessCode`  | launcher business identity     | canonical 名称                                            |
| `businessid`    | 当前游戏兼容 business identity | 兼容名称；与 `businessCode` 同时存在时必须相等            |
| `moneymode`     | money mode                     | `businessCode=guest && moneymode=fun` 判定 fun mode       |
| `replayurl`     | replay data URL                | 与 `mode=REPLAY` 同时出现时判定 replay mode               |
| `mode`          | launcher mode flag             | replay 使用大小写精确的 `REPLAY`                          |
| `currency`      | presentation currency          | 可选；非空时必须通过 currency validation                  |

以下仍是 `game002` 自身参数，不属于 launcher config request：

- `skin`；
- `bet`；
- `lines`；
- `times`；
- `autonums`；
- `requestTimeoutMs`；
- `clienttype`。

test 分支 Leo bridge 没有消费 `clienttype`，因此 Task 122 不把它伪造成 launcher 参数。当前 live protocol 仍需要 client type，game002 URL 继续要求显式提供非空 `clienttype`；provider 不消费它，也不把它写入 launcher request。

test 分支 `creatUiFramework()` 还接收 `gameCode / platform / isWsBinary / gameType / gameVer / designSize / dispatchEvent`。这些是旧 UI/framework 的 app bootstrap options，不是 launcher URL 参数：Task 122 分别使用 normalized `gameCode`、固定 Leo UI factory、当前 gameframeworks/layout 配置处理；`isWsBinary` 和 `dispatchEvent` 不迁移，避免借参数兼容重新引入 netcore2/eventcore。

### 3.3 alias 和冲突规则

兼容名用于让当前 game002 URL 平滑迁移，但不允许 truthy fallback：

1. canonical 与兼容名只有一个存在时使用该值。
2. 两者都存在时，trim 后必须完全相等，否则 Loading 启动 readiness 时立即失败。
3. 空字符串不能退回另一名称或默认值。
4. 同一个 query key 重复出现必须显式失败。
5. normalized object 只保留一个 canonical 字段，不把两套命名传到后续层。

这条规则适用于：

```text
gameCode      <-> gamecode
lang          <-> language
platformToken <-> token
businessCode  <-> businessid
```

### 3.4 模式判定

使用 test 分支已经确定的语义，但改为 strict normalization：

```text
replay: replayurl 非空 && mode === "REPLAY"
fun:    businessCode === "guest" && moneymode === "fun"
real:   其它合法输入
```

约束：

- replay 与 fun 条件同时成立时显式失败；
- 只有 `replayurl` 或只有 `mode=REPLAY` 时显式失败；
- 未识别的 `mode` / `moneymode` 不得静默转换；
- Task 122 的 game002 production session 支持 real 和 fun；
- replay bootstrap 可以被 parser/provider 单元测试覆盖，但 game002 replay transport 尚未迁移，必须在创建 session 前以明确 unsupported error 失败，不能把 replay URL 交给 WebSocket client。

## 4. Node 与 pnpm 环境约束

仓库要求 Node.js `>=24.0.0`。开始前检查：

```bash
command -v node
command -v pnpm
```

如果当前 shell 没有 `node`，执行：

```bash
nvm use 24
```

然后确认：

```bash
node --version
pnpm --version
command -v node
command -v pnpm
```

后续 install、format、lint、typecheck、test、build 和 release check 必须统一使用这套 nvm Node 24 自带的 `node` 与 `pnpm`。

不得：

- 执行 `nvm install`，除非用户另行要求；
- 强制调整 Node 或 pnpm 版本；
- 修改 `.nvmrc`、`engines` 或 `packageManager`；
- 混用系统 Node、另一套 pnpm 或 Codex fallback pnpm；
- 因环境问题升级无关 lockfile dependency。

Task 122 原则上不增加第三方 runtime dependency；原生 `fetch`、`AbortSignal` 和 IndexedDB 足够完成 Leo provider。lockfile 只应增加 workspace importer/link。

## 5. package 与依赖边界

### 5.1 通用 contract package

```text
packages/platformbootstrap/
  package.json
  README.md
  tsconfig.json
  tsconfig.build.json
  eslint.config.cjs
  src/
    index.ts
    types.ts
    validation.ts
    direct.ts
  tests/
```

包名：

```text
@slotclientengine/platformbootstrap
```

要求：

- ESM，public entry 和声明完整；
- 零第三方 runtime dependency；
- 不依赖 React、DOM、Pixi、netcore、logiccore 或任何 game app；
- 提供 provider/handle/snapshot 基础合同和 Direct test provider；
- 只使用 platform-neutral type，例如 `AbortSignal`。

### 5.2 Leo implementation package

```text
packages/platformbootstrap-leo/
  package.json
  README.md
  tsconfig.json
  tsconfig.build.json
  eslint.config.cjs
  src/
    index.ts
    params.ts
    mode.ts
    launcher-config.ts
    translations.ts
    settings.ts
    indexed-db-settings.ts
    provider.ts
  tests/
    fixtures/
```

包名：

```text
@slotclientengine/platformbootstrap-leo
```

依赖方向：

```text
game002
  |-> platformbootstrap-leo -> platformbootstrap
  |-> gameframeworks
  `-> game-ui-leo

platformbootstrap      -X-> Leo/network/UI/framework/app
platformbootstrap-leo  -X-> netcore/netcore2/logiccore/UI/app
gameframeworks         -X-> platformbootstrap packages
game-ui-leo            -X-> platformbootstrap packages
```

Leo provider 可以使用浏览器 `fetch` 和 IndexedDB，但不能创建 socket、live session、framework、UI root 或 round state。

## 6. 通用 Provider 合同

名称可按现有仓库风格微调，职责不得扩大：

```ts
export type SlotPlatformMode = "real" | "fun" | "replay";

export interface SlotPlatformInitialPreferences {
  readonly muted: boolean;
  readonly fastMode: boolean;
  readonly autoMode: boolean;
}

export interface SlotPlatformPresentation {
  readonly brandLabel: string;
  readonly currency: string;
  readonly locale: string;
}

export interface SlotPlatformBootstrapWarning {
  readonly code: string;
  readonly message: string;
}

export interface SlotPlatformBootstrapSnapshot {
  readonly platform: string;
  readonly mode: SlotPlatformMode;
  readonly gameCode: string;
  readonly businessCode: string;
  readonly language: string;
  readonly jurisdiction: string;
  readonly presentation: SlotPlatformPresentation;
  readonly initialPreferences: SlotPlatformInitialPreferences;
  readonly translations: Readonly<Record<string, string>>;
  readonly warnings: readonly SlotPlatformBootstrapWarning[];
}

export interface SlotPlatformBootstrapHandle {
  readonly snapshot: SlotPlatformBootstrapSnapshot;
  destroy(): void;
}

export interface SlotPlatformBootstrapProvider {
  prepare(signal: AbortSignal): Promise<SlotPlatformBootstrapHandle>;
}
```

snapshot 必须深度冻结，至少包含：

- snapshot root；
- presentation；
- initialPreferences；
- translations；
- warnings 及每一个 warning。

snapshot 禁止包含：

- `platformToken` / `token` 或其它 credential；
- `configUrl` 中的敏感 query；
- `serverUrl`；
- `lines/times/autonums/spinRequest`；
- live session/client/socket；
- launcher raw response；
- setting raw response；
- `stateData`；
- framework store、UI root 或 DOM node。

provider 必须 per-instance：同一个 provider 并发 prepare 多个 handle 时，snapshot、abort 和 destroy 互不影响。destroy 必须幂等。

## 7. Leo 参数 parser

`@slotclientengine/platformbootstrap-leo` 公开纯函数 parser，输入显式 `URLSearchParams` 或 query string；provider 内部不得读取 `window.location`。

建议结果：

```ts
export interface LeoLauncherParameters {
  readonly configUrl: string;
  readonly jurisdiction: string;
  readonly license?: string;
  readonly gameCode: string;
  readonly language: string;
  readonly credential: string;
  readonly businessCode: string;
  readonly moneyMode?: string;
  readonly replayUrl?: string;
  readonly mode: SlotPlatformMode;
  readonly currency?: string;
}
```

`credential` 只能存在于短生命周期 input/provider 实例，禁止复制到 snapshot、warning、error message、log、test snapshot 或 report。

Leo provider factory 同时接收显式 presentation policy 和可替换 I/O adapter：

```ts
interface LeoPlatformBootstrapOptions {
  readonly params: LeoLauncherParameters;
  readonly presentation: {
    readonly brandLabel: string;
    readonly defaultCurrency: string;
    readonly defaultLocale: string;
    readonly localeByLanguage?: Readonly<Record<string, string>>;
  };
  readonly fetch?: typeof globalThis.fetch;
  readonly settingsStore?: LeoSettingsStore;
}
```

game002 production policy 固定为：

```text
brandLabel     = game002
defaultCurrency = USD
defaultLocale   = en-US
```

currency query 存在时覆盖 `defaultCurrency`；language 先查 app 显式 `localeByLanguage`，未命中时只使用经过 `Intl.Locale` 验证的 language，不能靠字符串截取猜地区。这样当前 `lang=en` 可继续显式映射到 `en-US`，其它语言也不会意外沿用英文 locale。

默认 config endpoint 与 test 分支一致：

```text
https://launcher.rgstest.slammerstudios.com/bggs/v1/gameclient/config
```

`configUrl` validation：

- 必须是绝对 `https:` URL；
- username/password 禁止；
- fragment 禁止；
- 保留 endpoint 自己已有的安全 query，但追加字段必须使用 `URL` / `URLSearchParams`；
- 不允许字符串拼接产生 `?&`、漏编码或覆盖已有参数；
- Task 122 不增加任意 hostname allowlist，以免把 rgstest 写成 production policy；部署层可在后续任务提供显式 allowlist。

## 8. Launcher config 请求与校验

请求参数以 test 分支为最终合同：

```text
jurisdiction=<jurisdiction>
license=<license>          # 仅存在时
gameCode=<gameCode>
lang=<language>
```

使用 `GET` 和调用方 signal。不得把 `platformToken` 加到 launcher config URL。

launcher response 以 test 分支 `GameConfig` 为字段基线，但 Task 122 只输出当前集成真正使用的 validated projection，不能把宽松 raw object 放进全局状态。至少校验并提取：

```ts
interface LeoLauncherConfigProjection {
  readonly commonTranslationJsonUrl: string;
  readonly gameTranslationJsonUrl?: string;
  readonly quickStop: boolean;
  readonly disableSpacebar?: boolean;
  readonly gameServerConfig: {
    readonly gameServerApi: string;
    readonly settingApi: string;
  };
}
```

校验规则：

- HTTP 非 2xx 显式失败；
- body 必须是 JSON object；
- 所有被消费字段按准确类型校验；
- config、translation 和 setting URL 必须是允许 fetch 的绝对 `https:` URL；
- `gameServerApi` 必须是绝对 `wss:` URL，但本任务不使用它创建连接；
- 缺失的 optional `disableSpacebar` 归一化为 `false`；
- unknown 字段不进入 snapshot；
- error 不包含 response body、credential 或完整敏感 URL；
- abort 必须停止 fetch 并向 loading 传播 cancellation。

Task 122 仍遵守当前仓库的固定 live server 合同：`gameServerConfig.gameServerApi` 只做 schema/diagnostic 一致性检查，不覆盖 game002 的
`wss://gameserv.rgstest.slammerstudios.com/`。如果 launcher 返回不同地址，必须产生明确 warning；不能静默切 server，也不能因此引入 netcore2。后续若要让 launcher 拥有 server 选择权，应单独修改仓库合同和安全策略。

## 9. Translation 加载

按 test 分支顺序：

1. fetch `commonTranslationJsonUrl`；
2. common 成功后，如存在 `gameTranslationJsonUrl`，再 fetch game translation；
3. merge 顺序为 `{ ...common, ...game }`，game key 覆盖 common；
4. 输出复制并冻结后的 string map。

严格规则：

- common translation 失败是 fatal，loading 不进入 100%；
- game translation 失败时保留 common，并写入不含敏感数据的 typed warning；
- response 必须是普通 object；
- key 必须是非空 string，value 必须是 string；
- 不允许 nested object、array、HTML node、function 或原型污染 key；
- merge 不得修改 common 原对象；
- 不向 React 传任意可解析 HTML；
- provider destroy/abort 后不得再提交 translation callback。

Task 122 只完成 translation data bootstrap。Leo UI 当前已有 label 在本任务中可以通过 app-owned mapping 选择性消费，但不得为了“接上所有 key”重写 Task 121 UI，未知 key 也不能通过 dynamic property 执行业务逻辑。

## 10. Setting 加载与初始 preference

### 10.1 real/replay setting endpoint

test 分支规则：

```text
launcher settingApi 的 /v1/ path segment 替换为 /v2/
query:
  token=<platformToken>
  gameCode=<gameCode>
```

Task 122 必须使用 `URL` 精确替换 path segment，并用 `URLSearchParams` 编码 query；不能用任意字符串 replace，也不能记录最终含 token URL。

replay 的 provider 单测可以验证相同 setting bootstrap；但 game002 replay transport 仍在 session 创建前显式失败。

### 10.2 fun mode setting

fun mode 按 test 分支使用 IndexedDB，而不是 setting HTTP API：

```text
database: GameDB
store:    userSettings
key:      <gameCode>:<setting-key>
index:    gamecode
```

IndexedDB adapter 必须：

- 注入给 provider，测试使用 memory fake；
- 每次调用绑定当前 gameCode；
- 不使用模块级 DB/store singleton；
- transaction/error/abort 都能 settle；
- destroy 关闭本实例持有的 DB handle；
- 不清理或覆盖其它游戏 setting；
- 不把 credential 写入 IndexedDB。

### 10.3 defaults 和映射

保持 test 分支的 setting 字段语义：

```text
sliderCurStep
fastplays
sound
music
spacebar
```

但必须归一化成 framework 现有合同：

```text
muted   = sound <= 0 && music <= 0
fastMode = launcher quickStop === true && setting.fastplays === true
autoMode = false
```

`autoMode` 固定 false，因为 `sliderCurStep` 是 autoplay 档位/配置，不等于一个已经启动的自动游戏；Task 122 不能因加载 setting 自动发起 spin。

默认 setting：

```text
sliderCurStep = 0
fastplays     = false
sound         = 100
music         = 100
spacebar      = true
```

规则：

- remote/IndexedDB setting 与 defaults 做显式字段级 merge；
- sound/music 只接受 finite `0..100`；
- fastplays/spacebar 只接受 boolean；
- sliderCurStep 只接受非负安全整数；
- `quickStop=false` 时 fastMode 强制 false；
- `disableSpacebar=true` 时 provider projection 中 spacebar 强制 false；
- setting 请求失败可使用 defaults，但必须产生 typed warning；
- 不恢复 test 分支的 180 秒 polling；
- 不在本任务实现 UI 修改后的 setting persistence sink。

## 11. gameframeworks 初始状态

`SlotGameFrameworkOptions` 增加：

```ts
readonly initialMuted?: boolean;
readonly initialFastMode?: boolean;
readonly initialAutoMode?: boolean;
```

要求：

- 缺省全部为 false，game003 行为不变；
- 非 boolean 显式失败；
- 第一份 framework snapshot、default UI、Leo UI 和 `onStateChange` 看到一致值；
- 玩家后续操作仍只调用 framework commands；
- framework store 是 runtime preference 的唯一 owner；
- provider 不订阅 framework state；
- 不增加全局 preference store。

`SlotGameUiCreateContext` 不接收整个 platform snapshot。game002 只把 UI 真正需要的 presentation、translation mapping 和 initial state 通过现有 factory options/initial framework options 显式注入。

## 12. game002 接入

### 12.1 单一 strict launch parser

重构为一个 app-owned `parseGame002LaunchQuery()`，一次读取 query 并输出：

```ts
interface Game002LaunchConfig {
  readonly platform: LeoLauncherParameters;
  readonly live: SlotGameLiveConfig;
  readonly spinRequest: SlotGameSpinRequest;
  readonly skin: 1;
}
```

映射规则：

- live token 使用 normalized credential；
- live gamecode 使用 normalized gameCode；
- live businessid 使用 normalized businessCode；
- live language 使用 normalized language；
- live jurisdiction 使用同一 normalized jurisdiction；
- live clienttype 使用显式必填的 `clienttype`；
- live server 保持仓库固定地址；
- `lines` 必须显式为 `30`；
- spin request 只由 app 参数生成；
- `serverUrl` query 继续显式失败；
- query 只解析一次，provider 不读取 global location。

### 12.2 Loading 启动时开始 readiness

不能等 `onBeforeComplete` 才发起平台和 session 请求。Leo Loading UI 挂载、`loading.start()` 执行后，应立即开始：

```text
startGame002Readiness({ search, signal })
  -> strict parse once
  -> concurrently
       Leo provider.prepare(signal)
       prepareSlotGameLiveSession({ live })
```

同时由 `gameloading` 正常加载 CDN game resources。两组任务互相并行：平台/session 不参与资源进度权重，资源下载也不等待平台请求。

game002 使用 Section 13 的通用 readiness hook。hook 内通过 dynamic import 加载轻量 `game002-bootstrap` module，不能让 `platformbootstrap-leo`、gameframeworks 或 React 回流到 initial Leo Loading chunk。完整 `game-entry` runtime module 仍作为 game resource 加载；bootstrap module 不得反向 import 完整 game entry，bundler 应把双方真实共享的依赖抽成可缓存 shared chunk。

early readiness 必须使用 failure-safe coordinator，而不是裸 `Promise.all()` 后忽略晚完成对象：

1. provider/session 任一路失败立即 abort 另一侧；
2. destroy 已完成 platform handle；
3. disconnect 已完成 live session；
4. 等待两侧 settle，避免 unhandled rejection；
5. 抛回原始首个失败；
6. `gameloading` 同时 abort 尚未完成的资源下载并进入 error。

### 12.3 99% readiness join barrier

资源进度到 99% 只表示 CDN resource loader 已完成。`onBeforeComplete` 此时接收 early readiness result，并完成最终组合：

```text
required CDN resources exist and passed loader validation
+ platform snapshot ready
+ live session connected and enterGame completed
+ prepareGame002SkinConfig() succeeds
+ Leo Loading visual ready
= allowed to publish 100%
```

如果平台/session 已提前完成，99% 检查可立即通过；如果尚未完成，UI 停在 preparing/99 等待。不得在 99% 才创建这些请求，也不得为了进度好看把未完成 readiness 当成已完成。

skin/resource bundle 的构造和校验放在资源完成后的 `onBeforeComplete`，避免它与同一批 CDN resource 重复竞争；资源应已由浏览器 cache 命中。skin finalization 失败时必须 destroy platform handle、disconnect live session，并清理任何部分创建的 value-presentation bundle。

建议职责拆分：

```ts
startGame002Readiness({ search, signal });
finalizeGame002At99({ loadedResources, readinessResult, signal });
enterGame002({ root, prepared });
```

不能继续用 `prepareGame002At99()` 同时承担“开始网络请求”和“99% 最终验收”，否则接口名称会掩盖真实时序。

### 12.4 ownership transfer

```text
gameloading readiness phase
  owns platform handle + live session

finalizeGame002At99 success
  prepared state owns platform handle + skin bundle + live session

enterGame002 success
  entered game owns all three

enterGame002 failure
  destroys framework + platform handle + skin bundle + live session

entered game destroy
  destroys all owned resources exactly once
```

在 `onBeforeComplete` 成功返回前，readiness disposer 仍负责失败清理；成功返回就是明确的 ownership transfer。handle 可以幂等 destroy，但 owner 仍必须唯一明确。不得让 loading root、readiness task、prepared state 和 framework 同时暗中拥有同一对象。

### 12.5 UI/presentation mapping

game002 从 platform snapshot 显式提取：

- `brandLabel`；
- `currency`；
- `locale`；
- `initialMuted`；
- `initialFastMode`；
- `initialAutoMode`；
- Task 121 Leo UI 已有 label 对应的 translation 子集。

translation 到 Leo UI 文案的 key mapping 属于 game002/Leo adapter；未知或缺失 key 使用 Task 121 当前静态文案，不能显示空白、`undefined` 或 raw key。fallback 必须逐字段明确，不允许整份远程对象直接扩散进 UI props。

### 12.6 session 不迁移

仍使用：

```ts
prepareSlotGameLiveSession({ live: config.live });
```

禁止：

- provider 创建 netcore client；
- launcher config 创建第二条 WebSocket；
- 使用 `gameServerApi` 偷换 fixed server；
- 引入 netcore2/binary socket；
- 复制 connect/enter/spin/collect 状态机；
- WebSocket error 后仍 resolve success。

Task 122 证明：接入 launcher 并不要求 netcore2。

## 13. gameloading readiness 合同

### 13.1 公共接口

当前 `gameloading` 只有资源完成后调用的 `onBeforeComplete`，无法表达 early readiness。Task 122 增加可选、通用且与平台无关的 readiness hook，名称可按仓库风格微调：

```ts
export interface GameLoadingReadinessContext {
  readonly signal: AbortSignal;
}

export interface GameLoadingReadiness<TResult> {
  start(context: GameLoadingReadinessContext): Promise<TResult> | TResult;
  dispose(result: TResult): Promise<void> | void;
}

export interface GameLoadingCompleteContext<TReadinessResult = void> {
  readonly loadedResources: ReadonlyMap<string, unknown>;
  readonly readinessResult: TReadinessResult;
  readonly signal: AbortSignal;
}
```

`GameLoadingOptions` 增加 optional `readiness`。不提供时，game003 和现有 consumer 行为、类型和时序保持不变。

### 13.2 controller 时序

`loading.start()` 的顺序固定为：

1. Loading UI 已在 controller 构造阶段挂载并显示 0%。
2. 同一个 start turn 启动 `readiness.start({ signal })` 和 resource runner。
3. 两个 promise 立即安装 rejection handler，禁止浮空 Promise。
4. resource runner 独立推动 0..99；readiness 不伪造资源进度。
5. 最后一个资源完成时立即发布 `preparing / 99`，即使 readiness 仍在等待网络。
6. controller join resource result、readiness result 和 `ui.readyToComplete`。
7. join 全部成功后调用 `onBeforeComplete({ loadedResources, readinessResult, signal })` 做最终检查和组合。
8. `onBeforeComplete` 成功返回后才发布 `entering-game / 100` 并调用 `onEnterGame`。

这意味着 99% 是 readiness barrier，不是请求 trigger。

### 13.3 failure 与 dispose

- readiness 提前失败：立即 abort resource runner、显示 error；
- resource 提前失败：立即 abort readiness；
- Loading UI visual readiness 失败：清理 resource/readiness result；
- readiness 已 fulfilled、但其它分支或 `onBeforeComplete` 失败：调用 `dispose(result)` 恰好一次；
- resource 失败后，不服从 abort 的 readiness 晚到 fulfilled：仍调用 disposer，不能泄漏；
- cleanup failure 不替换原始 loading error；
- `loading.destroy()` abort 两组任务并清理已完成 readiness result；
- `onBeforeComplete` 成功后 ownership 转移给 prepare result，controller 不再自动 dispose；
- `onEnterGame` 失败后的清理由 prepare result/game app 合同负责。

### 13.4 bundle 边界

- 不加 polling、固定 sleep 或 timeout 后继续；
- 不修改 Leo Loading intro/exit timing；
- React、gameframeworks、platformbootstrap-leo 不能被打进 initial loading chunk；
- readiness callback 使用 dynamic import，在 Loading UI 首帧可见后启动 bootstrap chunk；
- provider module import 本身不能创建 fetch、DB、socket 或 DOM side effect；
- game002 bootstrap 和 runtime module 各自只请求一次，共享 dependency 使用同一 chunk URL，不能打包两份等价代码；
- release check 记录 initial loading chunk 与 bootstrap/runtime chunks 的前后 gzip size。

## 14. 为什么不能恢复 stateData

test 分支的 `stateData`/global store 把以下不同生命周期的数据放进同一个可变全局对象：

- launcher config；
- translation；
- user info/balance；
- setting；
- round/spin result；
- UI callbacks；
- socket/bridge state。

这会把原本线性的游戏流程变成可被多个异步来源覆盖的全局状态，产生：

- loading、socket、setting、UI 同时写入的竞态；
- 前一局 callback 晚到污染后一局；
- destroy 后异步任务继续写全局对象；
- 多实例或热重载互相覆盖；
- 测试依赖执行顺序；
- 无法判断字段是 launcher 初值还是当前 round truth。

Task 122 的替代方案：

```text
immutable bootstrap snapshot
  -> 只描述初始化结果

gameframeworks instance store
  -> 只描述当前 UI/round runtime state

game adapter/rendercore
  -> 只拥有玩法与表现生命周期
```

必须通过 source-boundary test 禁止：

- `stateData`；
- module-level mutable bootstrap snapshot；
- Zustand/Redux global store；
- Inversify `GameContainer`；
- eventcore bridge；
- `spinEnd` callback payload 作为全局 round truth。

## 15. 错误、取消与安全

### 15.1 fatal error

以下为 fatal：

- query/alias 冲突；
- launcher config 请求或 schema 失败；
- common translation 失败；
- invalid credential/game identity；
- unsupported replay session；
- live session/skin preparation 失败。

fatal error 阻止 loading 100%。

### 15.2 degraded warning

以下允许带 warning 继续：

- optional game translation 失败；
- setting API/IndexedDB 失败并回到严格 defaults；
- launcher gameServerApi 与当前 fixed server 不同。

warning 必须 typed、冻结、无 credential，不允许只 `console.warn` 后丢失可观测状态。

### 15.3 abort/destroy

- signal 已 aborted 时 prepare 立即拒绝；
- prepare 中 abort 必须停止 fetch/DB continuation；
- abort/resolve race 最多产生一个结果；
- handle 移交后，旧 signal 不越权自动 destroy；
- destroy 幂等且只清理本实例；
- cleanup 多项失败时仍尽最大努力清理全部对象，并保留原始 prepare error。

### 15.4 credential

credential 不得进入：

- snapshot；
- error/warning/log；
- translation；
- IndexedDB；
- framework state；
- UI props/DOM；
- task report/test fixture snapshot。

测试使用明显的 fake token，并检查 source/log/error serialization 不泄漏。

## 16. game003 稳定对照

Task 122 不修改 game003 接线：

- 不依赖 platformbootstrap package；
- 不创建 Leo provider；
- query/live config 不变；
- initial preference 缺省 false；
- default UI 和 simple Loading UI 不变；
- orientation-focus、bg-bar、minecart、Ways、win amount 不变。

game003 全量回归用于证明 gameframeworks optional initial state 和新增 workspace package 没有改变默认路径。

## 17. 测试要求

### 17.1 platformbootstrap

至少覆盖：

1. Direct provider valid prepare；
2. snapshot 深度冻结；
3. caller 原对象变化不影响 snapshot；
4. already-aborted signal；
5. abort/resolve race；
6. destroy 幂等；
7. 多实例隔离；
8. snapshot 禁止字段；
9. package source boundary。

### 17.2 platformbootstrap-leo params

至少覆盖：

1. canonical 参数；
2. 每一组兼容 alias；
3. canonical/alias 相同；
4. canonical/alias 冲突；
5. duplicate query key；
6. 空字段；
7. default/custom configUrl；
8. license 有/无；
9. real/fun/replay mode；
10. ambiguous/partial mode；
11. credential 不出现在 error；
12. clienttype 不进入 launcher request。

### 17.3 launcher/translation/setting

使用本地 fake fetch/IndexedDB fixture，至少覆盖：

- exact config request URL/encoding；
- config HTTP/schema/abort failure；
- consumed projection，不保留 raw object；
- common + game translation merge；
- common fatal / game optional failure；
- translation prototype pollution key rejection；
- `/v1/` 到 `/v2/` setting path；
- setting URL token 编码但 error 不泄漏；
- real setting merge/default；
- fun IndexedDB lookup/isolation/close；
- invalid setting fields；
- initial muted/fast/auto mapping；
- warning freeze；
- provider destroy and multi-instance isolation。

测试禁止访问真实 rgstest endpoint。

### 17.4 gameframeworks

- initialMuted/initialFastMode/initialAutoMode 缺省 false；
- 显式值进入第一份 snapshot；
- 非 boolean fail-fast；
- default UI 和 Leo UI 初始 pressed state 正确；
- command 更新后 framework 仍是唯一 owner；
- Task 120/121 lifecycle、round、destroy、error 测试全部通过。

### 17.5 gameloading

至少覆盖：

1. UI 挂载后，readiness 与第一个 resource 在同一 start turn 启动；
2. readiness pending 时 resource progress 正常推进；
3. resources 先完成时发布 preparing/99，但不进入 100；
4. readiness 先完成时继续等待 resources；
5. visual readiness、resource、readiness 三者全部完成后才调用 `onBeforeComplete`；
6. readiness early reject 立即 abort resources；
7. resource early reject 立即 abort readiness；
8. readiness fulfilled 后其它分支失败时 dispose 恰好一次；
9. abort 后仍晚到 fulfilled 的 readiness result 被 dispose；
10. `onBeforeComplete` failure dispose readiness result；
11. `onBeforeComplete` success 后 ownership transfer，不被 controller 提前 dispose；
12. destroy、cleanup error 和多实例隔离；
13. 不配置 readiness 的既有 consumer 时序完全不变。

### 17.6 game002

至少覆盖：

1. query 只解析一次；
2. canonical 与兼容 URL 都能生成同一 normalized config；
3. `lines=30` 和 fixed server 不变；
4. provider/session readiness 在 CDN resources 完成前已经启动；
5. provider/session 任一 early failure 的清理；
6. CDN resource failure abort 并清理已完成 readiness；
7. 资源到 99 后等待 pending provider/session；
8. provider/session 提前完成后仍等待 resources；
9. skin finalization 只在资源完成后的 barrier 执行；
10. skin finalization failure 清理 platform/session/bundle；
11. loading abort 传播；
12. barrier success ownership transfer；
13. enter failure cleanup；
14. entered destroy cleanup；
15. session 只创建一次；
16. launcher `gameServerApi` 不覆盖 live server；
17. credential 不进 platform snapshot/framework/UI；
18. initial preference 注入；
19. translation label mapping/fallback；
20. fun mode setting path；
21. replay 明确 unsupported；
22. spin payload 不变；
23. initial loading chunk 不含 React/framework/provider runtime；
24. bootstrap/runtime 各请求一次，shared chunk URL 去重；
25. release closure 正确。

### 17.7 game003

- 现有测试全部通过；
- 无 platformbootstrap dependency/import；
- default initial preference false；
- release dist 不含 Leo provider marker；
- static dist check 通过。

## 18. Source-boundary 验收

增加静态测试证明：

1. platformbootstrap 不依赖 Leo/network/storage/UI/framework/app；
2. platformbootstrap-leo 不依赖 netcore/netcore2/logiccore/eventcore/React/Pixi/app；
3. provider 不读取 `window.location`；
4. 不出现 stateData、RoundService、GameContainer、Zustand、Inversify；
5. 不创建 WebSocket/live session；
6. credential 不进入 snapshot type；
7. 没有模块级可变 provider/handle registry；
8. game002 只从 public package entry 导入；
9. app 不复制 launcher response/parser/setting 算法；
10. gameframeworks/game-ui-leo 不反向依赖 platform package；
11. game003/gameloading 不依赖 Leo provider；
12. 未引入 test 分支旧 package 或 path alias；
13. 未引入 netcore2、eventcore、crypto-js、device-detector、Zustand、Inversify。

## 19. 自动化验收命令

所有命令使用第 4 节固定的同一套 Node 24 / pnpm 环境。

新增 workspace package 后先生成并审查预期 lockfile：

```bash
pnpm install
git diff -- pnpm-lock.yaml
```

提交前验证 frozen install，并串行执行受共享 dist 影响的 app 检查：

```bash
pnpm install --frozen-lockfile

pnpm --filter @slotclientengine/platformbootstrap format:check
pnpm --filter @slotclientengine/platformbootstrap lint
pnpm --filter @slotclientengine/platformbootstrap typecheck
pnpm --filter @slotclientengine/platformbootstrap test
pnpm --filter @slotclientengine/platformbootstrap build

pnpm --filter @slotclientengine/platformbootstrap-leo format:check
pnpm --filter @slotclientengine/platformbootstrap-leo lint
pnpm --filter @slotclientengine/platformbootstrap-leo typecheck
pnpm --filter @slotclientengine/platformbootstrap-leo test
pnpm --filter @slotclientengine/platformbootstrap-leo build

pnpm --filter @slotclientengine/gameframeworks format:check
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks build

pnpm --filter @slotclientengine/game-ui-leo format:check
pnpm --filter @slotclientengine/game-ui-leo lint
pnpm --filter @slotclientengine/game-ui-leo typecheck
pnpm --filter @slotclientengine/game-ui-leo test
pnpm --filter @slotclientengine/game-ui-leo build

pnpm --filter @slotclientengine/gameloading format:check
pnpm --filter @slotclientengine/gameloading lint
pnpm --filter @slotclientengine/gameloading typecheck
pnpm --filter @slotclientengine/gameloading test
pnpm --filter @slotclientengine/gameloading build

pnpm --filter game002 format:check
pnpm --filter game002 lint
pnpm --filter game002 typecheck
pnpm --filter game002 test
pnpm --filter game002 release:check

pnpm --filter game003 format:check
pnpm --filter game003 lint
pnpm --filter game003 typecheck
pnpm --filter game003 test
pnpm --filter game003 release:check

git diff --check
git status --short
```

执行报告记录：

- Node/pnpm 版本与真实路径；
- 基线、分支和 commit；
- test 分支参数审计结果；
- 两个 package 的测试数量；
- launcher/translation/setting fixture 覆盖；
- resource/readiness 并行时序和 failure/dispose 矩阵；
- session/WebSocket 创建次数；
- credential 泄漏检查；
- game002/game003 release check；
- initial loading chunk 前后 gzip size；
- lockfile 变化；
- 浏览器人工验收结果或未执行项。

## 20. 浏览器验收

自动化通过后，使用合法 Leo canonical URL 验证 game002：

1. Leo Loading 与 Task 121 一致；
2. Network waterfall 显示 CDN resources 与 launcher/session 请求发生重叠，而不是 99% 后才开始；
3. CDN resources、launcher/config/translation/setting、WebSocket 和 visual readiness 全部完成后才从 99 进入 100；
4. setting request 不在 console/error 泄漏 token；
5. 只有一条 WebSocket；
6. WebSocket 仍连接固定 game002 server；
7. Leo HUD brand/currency/translation 正确；
8. sound/fast 初值与 setting 一致，auto 不自动启动；
9. spin payload 中 lines 仍为 30；
10. resize、Pixi focus 和 Leo HUD 对齐不变；
11. refresh/destroy 不残留 fetch、DB handle、provider handle 或 socket；
12. invalid alias/config/common translation 阻止进入游戏；
13. optional game translation/setting failure 使用明确 fallback 并可观测 warning；
14. Console 无 unhandled Promise、重复 cleanup 或 credential。

再用当前 legacy game002 URL 验证 alias 兼容，并抽查 game003 默认 loading/UI/round/resize 无变化。

## 21. 非目标

Task 122 不处理：

- 修改已确认的 Leo launcher 参数名；
- launcher 驱动 live server 切换；
- netcore2/binary transport；
- replay round transport；
- 第二套 round framework；
- Wildsheep provider/UI；
- setting 写回/persistence sink；
- 完整 translation 覆盖所有未来 UI；
- autoplay scheduler；
- buy feature；
- modal/paytable/history；
- runtime platform switch；
- game003 platform 接入；
- Leo Loading/HUD 视觉重做；
- game002 玩法或 rendercore 改动。

## 22. 完成标准

只有同时满足以下条件，Task 122 才能标记完成：

1. 基于已验收 Task 121 实施；
2. test 分支当前 launcher 参数被写成 strict、可测试合同；
3. canonical/compatibility alias 冲突显式失败；
4. `platformbootstrap` 是协议无关、零第三方 runtime dependency package；
5. `platformbootstrap-leo` 独立实现 fetch/translation/setting/IndexedDB；
6. provider snapshot 深度冻结、per-instance、可取消且可幂等销毁；
7. credential 不进入 snapshot/error/warning/log/storage/UI/framework；
8. 未引入 netcore2、stateData、event bridge、global store/container；
9. gameframeworks 支持 optional initial muted/fast/auto，默认行为不变；
10. game002 在 Loading UI 可见后并行启动 CDN resources 与 provider/session，99% 仅做 readiness join；
11. launcher config/common translation fatal，game translation/setting fallback 明确可观测；
12. live session 仍由当前 gameframeworks helper 创建且只有一次；
13. fixed server、lines=30 和 spin request 不变；
14. gameloading readiness dispose 与 prepared/entered/destroy ownership 明确，无资源泄漏；
15. game002 Leo UI 初始状态和 translation mapping 正确；
16. replay 在 transport 迁移前明确 unsupported；
17. game003 不接入 provider 且完整回归通过；
18. gameloading generic readiness 时序、early failure 和 late fulfillment cleanup 均有测试；
19. initial loading closure 无 React/framework/provider runtime 污染；
20. 所有 format/lint/typecheck/test/build/release checks 通过；
21. lockfile 只有预期 workspace 变化；
22. 中文执行报告完整记录环境、设计、测试、bundle 和剩余风险；
23. 浏览器验收完成，或报告明确列出需用户完成的人工项目。

## 23. 后续接入点

Task 122 完成后再按独立任务推进：

1. setting persistence sink：从 framework state 订阅显式 preference event，写回 Leo API/IndexedDB；
2. replay session adapter：复用 `SlotGameLiveSessionLike` 建立独立 transport，不改 provider；
3. launcher server policy：决定何时允许 validated launcher server 替代 app fixed server；
4. translation key catalog：把 Leo UI 可消费文案形成严格 typed mapping；
5. Wildsheep provider/UI：作为另一组独立 package 实现。

这些后续能力都继续复用当前 `gameframeworks` facade；不能以平台差异为理由恢复全局 `stateData` 或第二套 round framework。
