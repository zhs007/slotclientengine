# game002 url skin selection 任务计划

## 1. 任务目标

为现有 `apps/game002` 增加 URL query 参数驱动的皮肤选择能力。最终同一个静态发布入口、同一套 live 服务器、同一个 `gamecode` 和同一份 `assets/gamecfg002/gameconfig.json`，可以根据 URL 参数选择第二套或第三套皮肤：

```text
skin=2 -> assets/game002/bgfull.jpg + assets/symbols002
skin=3 -> assets/game003/bg.jpg + assets/symbols003
```

本任务不是新建 `apps/game003`，也不是新增 `assets/gamecfg003`，更不是把 gamecode、服务器、下注、spin 或 collect 流程拆成两套。`apps/game002` 仍然是唯一运行 app，继续通过 `@slotclientengine/gameframeworks` 接入 live、HUD、spin、collect 和 viewport，通过 `@slotclientengine/rendercore` 接入 symbol、grid-cell reel 和裁切表现。

核心交付：

- URL query 新增必需参数 `skin`，只接受 `2` 或 `3`。
- `skin=2` 使用当前第二套皮肤：
  - 背景：`assets/game002/bgfull.jpg`
  - symbol：`assets/symbols002/*.png`
  - manifest：`assets/symbols002/symbol-state-textures.manifest.json`
  - runtime config：`assets/gamecfg002/gameconfig.json`
- `skin=3` 使用当前第三套皮肤：
  - 背景：`assets/game003/bg.jpg`
  - symbol：`assets/symbols003/*.png`
  - manifest：`assets/symbols003/symbol-state-textures.manifest.json`
  - runtime config：同样复用 `assets/gamecfg002/gameconfig.json`
- `skin` 只决定前端皮肤资源，不修改 `serverUrl`、`gamecode`、`token`、`businessid`、`clienttype`、`jurisdiction`、`language`、下注参数或 live 协议字段。
- 两套皮肤坐标、棋盘大小、cell 大小、viewport 适配、grid-cell reel 顺序和 spin 时序保持不变。
- `assets/game003/bg.jpg` 在运行时等价于第二套皮肤的 `assets/game002/bgfull.jpg`，都必须是 `2000 x 2000` runtime background。
- 不为第三套皮肤借用第二套 symbol，不生成 placeholder，不把缺图 symbol 静默渲染为空。若未来服务器开始下发第三套当前没有资源的 symbol，必须补齐资源和测试后再接入。
- 如果测试导致一些奇怪写法，修改测试合同，不改不该改的生产逻辑。
- 保持 fail-fast：参数非法、资源缺失、manifest 错误、背景尺寸错误、未知 skin、意外 scene code 缺皮肤贴图都要显式失败，不做隐藏兜底。
- 更新 `apps/game002/README.md` 和相关测试；若实现改变长期协作规则、目录规范或基础脚本，必须同步更新根目录 `agents.md`。
- 任务完成后新增中文任务报告：

```text
tasks/57-game002-url-skin-selection-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/57-game002-url-skin-selection-260626-123456.md
```

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、构建、文档同步、`agents.md` 判断和最终报告。

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
- 新增空目录必须放 `.keepme`

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。若确实需要新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前实际协作规则文件是：

```text
agents.md
```

如果执行时又出现 `AGENTS.md`，且两个文件都存在，则必须检查两者是否需要同步，并记录判断：

```bash
cmp -s AGENTS.md agents.md
```

若本任务只是新增 `game002` 的 URL 皮肤选择、资源配置、测试和 README，通常不需要更新 `agents.md`。如果实现中新增了长期协作规则、目录规范或基础脚本约定，必须同步更新 `agents.md`，并在任务报告中说明原因。

## 3. 当前已知事实

### 3.1 game002 当前结构

主要实现文件：

```text
apps/game002/src/main.ts
apps/game002/src/framework-config.ts
apps/game002/src/env.ts
apps/game002/src/game-adapter.ts
apps/game002/src/assets.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-layout.ts
apps/game002/src/symbol-animation-config.ts
apps/game002/src/scene.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/README.md
```

主要测试文件：

```text
apps/game002/tests/env.test.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/tests/symbol-animation-config.test.ts
apps/game002/tests/framework-flow.test.ts
apps/game002/tests/fixtures/game002-gmi.ts
```

当前 `apps/game002/src/framework-config.ts` 只解析 live 和 spin 参数：

```text
serverUrl, token, gamecode, businessid, clienttype, jurisdiction, language,
bet, lines, times, autonums, requestTimeoutMs
```

当前 `apps/game002/src/game-adapter.ts` 静态硬编码导入：

```text
../../../assets/gamecfg002/gameconfig.json
../../../assets/symbols002/symbol-state-textures.manifest.json
../../../assets/game002/bgfull.jpg?url
../../../assets/symbols002/*.png
```

本任务要把这些硬编码资源提取成显式 skin 配置，让 `main.ts` 根据 URL `skin` 选择后传入 adapter。不要用动态字符串拼路径，因为 Vite 对资源打包需要静态 import 或 `import.meta.glob`。

### 3.2 共享 runtime config

两套皮肤共用：

```text
assets/gamecfg002/gameconfig.json
```

当前 symbol code 顺序：

```text
WL=0, H1=1, H2=2, L1=3, L2=4, L3=5, L4=6, WM=7, CN=8, CM=9, CO=10, AF=11, BN=12
```

当前 reel 名称：

```text
reels-001
```

当前本地公开轮带 `reels-001` 中实际出现的 code 已观察为：

```text
0, 1, 2, 3, 4, 5, 6, 8
```

执行时必须重新确认，不要只信任本计划快照：

```bash
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels).join(",")); console.log([...new Set(cfg.reels["reels-001"].flat())].sort((a,b)=>a-b).join(","));'
```

如果执行时发现 `assets/gamecfg002/paytables.xlsx` 或 `assets/gamecfg002/reels-001.xlsx` 已变化，需要先确认是否要重新生成 `gameconfig.json`。重新生成命令：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

本任务不新增 `assets/gamecfg003`，不把 `gameconfig.json` 复制到第三套资源目录。

### 3.3 皮肤资源现状

第二套皮肤：

```text
assets/game002/bgfull.jpg
assets/symbols002
assets/symbols002/symbol-state-textures.manifest.json
```

第三套皮肤：

```text
assets/game003/bg.jpg
assets/symbols003
assets/symbols003/symbol-state-textures.manifest.json
```

当前背景尺寸已观察：

```text
assets/game002/bg.jpg      1125 x 2000，旧 portrait 参考图，不作为运行时背景
assets/game002/bgfull.jpg  2000 x 2000，skin=2 运行时背景
assets/game003/bg.jpg      2000 x 2000，skin=3 运行时背景
```

执行时必须重新确认：

```bash
sips -g pixelWidth -g pixelHeight assets/game002/bg.jpg assets/game002/bgfull.jpg assets/game003/bg.jpg
```

当前 `assets/symbols002/symbol-state-textures.manifest.json` 覆盖：

```text
WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
```

当前 `assets/symbols003/symbol-state-textures.manifest.json` 覆盖：

```text
WL,H1,H2,L1,L2,L3,L4,CN,CO
```

用户已确认：当前第三套皮肤暂时不会收到缺资源的 symbol 数据，这些数据服务端不会发。因此本任务不要求补齐 `WM`、`CM`、`AF`、`BN` 的第三套图片。但是必须保持显式边界：

- `skin=3` 不从 `symbols002` 借 `WM`、`CM`、`AF`、`BN` 图片。
- `skin=3` 不生成 placeholder。
- 若实际 live scene 或未来轮带开始出现第三套缺资源 code，运行时必须明确失败，并提示哪个 scene code / symbol 缺少当前 skin 贴图。
- 未来要支持这些 symbol 时，必须补齐 `assets/symbols003` 普通图、`spinBlur`、`disabled`、manifest、测试和 README 后再放开。

### 3.4 布局和缩放事实

两套皮肤除资源外，坐标和大小不变：

```text
art/background: 2000 x 2000
reference crop: 1125 x 2000 at art x=437.5,y=0
board frame: x=637.5,y=330,width=720,height=1080
cell: 120 x 120
scene: 6 x 9
reels: reels-001
grid-cell order: top-down-left-right
```

用户说明：`symbols002` 存在一个 40% symbol 缩放系数，但该缩放系数属于 symbol JSON / symbol 配置表达，不需要在 URL 皮肤选择逻辑里特殊处理。因此本任务不能为了 `skin=2` 在 `main.ts`、`framework-config.ts` 或 adapter 的 skin 分支中硬编码坐标偏移或额外缩放。

执行时需要按当前真实实现核对 symbol 缩放来源：

- 如果现有 runtime 已经从 symbol 配置读取缩放，保持该路径。
- 如果测试要求在 URL skin 逻辑里写 `if skin=2 scale=0.4` 这类分支，应修改测试，不要把皮肤选择和 symbol 内部缩放耦合。
- 如果发现当前 `apps/game002/src/symbol-animation-config.ts` 与真实 symbol 配置冲突，要单独说明并按真实产品合同修正，不用隐藏 fallback 掩盖。

## 4. 设计方案

### 4.1 URL query 合同

新增必需参数：

| 参数 | 类型 | 必需 | 合法值 | 说明 |
| --- | --- | --- | --- | --- |
| `skin` | string | 是 | `2` 或 `3` | 只决定前端背景和 symbol 资源 |

完整 URL 示例：

```text
https://cdn.example.com/game002/?skin=2&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

第三套皮肤示例只改 `skin`：

```text
https://cdn.example.com/game002/?skin=3&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

`skin` 解析规则：

- 缺少 `skin`：失败。
- `skin` 为空：失败。
- `skin` 重复出现：失败。
- `skin=2`：通过。
- `skin=3`：通过。
- `skin=02`、`skin=game002`、`skin=game003`、`skin=1`、`skin=4`：失败。
- 错误消息可以包含非法参数名和支持值，但不要输出 token 实际值。

这里把 `skin` 设计为必需参数，是为了避免旧链接或漏参时悄悄使用 skin=2，符合“我不希望一些不必要的兜底，有些逻辑 bug，越早暴露出来越好”。如果产品明确要求兼容旧 URL，必须在执行前改写本计划和测试，把缺省规则写清楚；不得在实现里私自加默认皮肤。

### 4.2 皮肤配置层

建议新增文件：

```text
apps/game002/src/skin-config.ts
```

建议导出类型：

```ts
export type Game002SkinId = "2" | "3";

export interface Game002SkinConfig {
  readonly id: Game002SkinId;
  readonly label: string;
  readonly backgroundLabel: string;
  readonly backgroundUrl: string;
  readonly symbolModules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols: readonly string[];
  readonly emptySymbols: readonly string[];
}
```

建议静态导入：

```ts
import symbols002StateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import symbols003StateTextureManifest from "../../../assets/symbols003/symbol-state-textures.manifest.json";
import skin2BackgroundUrl from "../../../assets/game002/bgfull.jpg?url";
import skin3BackgroundUrl from "../../../assets/game003/bg.jpg?url";

const symbols002Modules = import.meta.glob("../../../assets/symbols002/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const symbols003Modules = import.meta.glob("../../../assets/symbols003/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;
```

建议 skin 配置：

```text
skin=2 displaySymbols: WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
skin=3 displaySymbols: WL,H1,H2,L1,L2,L3,L4,CN,CO
emptySymbols: BN
```

建议导出：

```ts
export const GAME002_SUPPORTED_SKINS = Object.freeze(["2", "3"] as const);
export function getGame002SkinConfig(id: Game002SkinId): Game002SkinConfig;
export function parseGame002SkinId(value: string): Game002SkinId;
```

`parseGame002SkinId` 只负责 `2` / `3` 值校验，不读取资源。`getGame002SkinConfig` 返回静态 skin 配置，未知 id 必须抛错。

### 4.3 framework config 分层

更新：

```text
apps/game002/src/framework-config.ts
apps/game002/src/env.ts
apps/game002/tests/env.test.ts
```

`Game002QueryConfig` 增加：

```ts
readonly skin: Game002SkinId;
```

`Game002FrameworkConfig` 增加：

```ts
readonly skin: Game002SkinId;
```

`parseGame002QueryConfig(...)` 从 URL 读取 `skin`，并继续解析已有 live/spin 参数。`parseGame002FrameworkConfigFromQuery(...)` 只把 `skin` 作为配置值透传，不在这里导入图片、manifest 或 glob，避免 URL 解析层承担资源加载职责。

`env.ts` 继续 re-export 新增类型和解析函数。

### 4.4 main 和 adapter 分工

更新：

```text
apps/game002/src/main.ts
apps/game002/src/game-adapter.ts
```

`main.ts` 负责：

1. 调用 `parseGame002FrameworkConfigFromQuery(window.location.search, ...)`。
2. 通过 `getGame002SkinConfig(config.skin)` 取得 skin 配置。
3. 调用 `createGame002Adapter({ skin: skinConfig })`。
4. `brandLabel` 可以继续是 `game002`；如需显示皮肤，可用 `game002 skin 2/3`，但不能影响协议字段。

`game-adapter.ts` 负责：

- 不再硬编码 `symbols002` 和 `game002/bgfull.jpg` 作为唯一资源。
- 继续静态导入共享 `assets/gamecfg002/gameconfig.json`。
- 从 `options.skin` 读取背景 URL、symbol modules、manifest、displaySymbols、emptySymbols。
- `loadStaticTextures()` 使用 skin 背景 URL，尺寸仍校验 `GAME002_ASSET_SIZE.background = 2000 x 2000`。
- `loadSymbolTextures()` 调用现有 `createGame002SymbolAssetMapFromModules(...)`，但传入当前 skin 的 `modules`、`stateTextureManifest`、`displaySymbols`、`emptySymbols`。
- `createRuntime` 仍使用同一份 `rawGameConfig`。

生产入口必须显式传入 `skin`。不要让 `main.ts` 在缺少 skin 时偷偷走默认 skin。

单元测试可以通过 fake `loadStaticTextures` / `loadSymbolTextures` / `createRuntime` 注入来隔离 Pixi；如果测试因为 adapter 必须显式 skin 而变得不适配，应更新测试 helper，不能为了测试方便给生产初始化加隐藏默认。

### 4.5 scene code 和缺资源边界

当前 `packages/rendercore` 的 reel symbol registry 会把 paytable 中缺 asset 的 symbol 记录为 `missingAssetEmptySymbols`。这对调试 viewer 合理，但对 live 游戏皮肤切换不能变成静默兜底。

本任务需要在 `apps/game002/src/game-demo.ts` 的 scene 校验或 runtime 创建逻辑中补齐 game002 侧的 fail-fast 边界：

- paytable 中不存在的 code：继续失败。
- code 对应 `BN` 这种明确 empty symbol：允许为空。
- code 对应当前 skin 有贴图的 symbol：允许渲染。
- code 对应当前 skin 没有贴图、也不是明确 empty symbol：失败。

建议把当前 skin 可渲染 symbol 集合传入 runtime config，例如扩展 `Game002ReelConfig`：

```ts
readonly texturedSymbols: readonly string[];
```

或在 `createGame002ReelRuntime(...)` 中根据 `options.symbolAssets` 和 `config.emptySymbols` 构造闭包校验。错误消息必须包含 scene label、坐标、code 和 symbol，例如：

```text
spin main scene[2][4] symbol code 7 (WM) is missing assets for skin 3.
```

当前用户确认第三套暂时不会收到这些数据，因此这条校验正常情况下不会触发；它是为了防止未来服务端或配置变化时 UI 静默丢 symbol。

### 4.6 静态发布检查

更新：

```text
apps/game002/scripts/verify-static-dist.mjs
```

`release:check` 需要确认构建产物同时包含两套皮肤资源：

- `index-*.js`
- `index-*.css`
- `bgfull-*.jpg`，来自 `assets/game002/bgfull.jpg`
- `bg-*.jpg`，来自 `assets/game003/bg.jpg`
- skin=2 required symbol PNG：
  - `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`
  - normal、`spinBlur`、`disabled`
- skin=3 required symbol PNG：
  - `WL,H1,H2,L1,L2,L3,L4,CN,CO`
  - normal、`spinBlur`、`disabled`

由于 Vite 会按 basename 生成 hashed asset，`assets/game003/bg.jpg` 很可能输出为 `bg-[hash].jpg`。不要要求输出路径保留源目录名。

继续保留敏感字符串检查：

```text
VITE_GAME002
旧默认 token
旧默认 gamecode
旧默认 live server host
```

如果构建产物中没有第三套资源，说明 skin 配置没有被 Vite 静态收集，必须修复 import / glob，不允许运行时字符串拼路径后期待 CDN 上有文件。

## 5. 实施步骤

### 5.1 现状盘点

从仓库根目录执行：

```bash
git status --short --untracked-files=all
git diff --stat
find assets/game002 assets/game003 assets/symbols002 assets/symbols003 -maxdepth 1 -type f -print | sort
sips -g pixelWidth -g pixelHeight assets/game002/bg.jpg assets/game002/bgfull.jpg assets/game003/bg.jpg
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels).join(",")); console.log([...new Set(cfg.reels["reels-001"].flat())].sort((a,b)=>a-b).join(","));'
node -e 'for (const dir of ["symbols002","symbols003"]) { const m=require(`./assets/${dir}/symbol-state-textures.manifest.json`); console.log(dir, m.version, m.states.join(","), Object.keys(m.symbols).join(",")); }'
```

盘点目标：

- 确认工作区已有改动，执行中不得回滚。
- 确认 `assets/game003/bg.jpg` 存在且为 `2000 x 2000`。
- 确认 `symbols002` / `symbols003` manifest 与本计划一致。
- 确认 `gamecfg002` 仍是两套皮肤共享 config。
- 确认当前本地轮带不会出现第三套缺资源 code；如果出现，必须先补资源或重新确认需求。

### 5.2 新增 skin 配置文件

新增：

```text
apps/game002/src/skin-config.ts
```

实现内容：

- `Game002SkinId`
- `Game002SkinConfig`
- `GAME002_SUPPORTED_SKINS`
- `getGame002SkinConfig(id)`
- `parseGame002SkinId(value)`
- skin=2 和 skin=3 的静态资源配置

注意：

- 使用静态 import 和 `import.meta.glob`。
- 不要动态拼 `../../../assets/symbols${skin}`。
- 不要让 skin=3 复用 skin=2 的 modules 或 manifest。
- 不要在这里解析 server/gamecode/token。

### 5.3 更新 URL 解析

更新：

```text
apps/game002/src/framework-config.ts
apps/game002/src/env.ts
apps/game002/tests/env.test.ts
```

实现要求：

- `skin` 进入 `Game002QueryConfig` 和 `Game002FrameworkConfig`。
- `parseGame002QueryConfig(validQuery({ skin: "2" }))` 返回 `skin: "2"`。
- `parseGame002QueryConfig(validQuery({ skin: "3" }))` 返回 `skin: "3"`。
- `REQUIRED_PARAMS` 增加 `skin`。
- 缺失、重复、空值、非法值都必须失败。
- 未知 query 参数仍可忽略，保持 CDN cache busting / tracking 参数不破坏启动。

### 5.4 更新 adapter 资源加载

更新：

```text
apps/game002/src/game-adapter.ts
apps/game002/src/assets.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/game-adapter.test.ts
```

实现要求：

- `createGame002Adapter({ skin })` 从 skin 配置加载背景和 symbol。
- `loadStaticTextures` 校验当前 skin 背景尺寸，错误 label 可包含 `skin 2 bgfull.jpg` 或 `skin 3 bg.jpg`。
- `loadSymbolTextures` 对当前 skin 的 manifest、normal、`spinBlur`、`disabled` 做完整校验。
- `assets.test.ts` 增加 skin=3 asset map 测试，确认：
  - 使用 `assets/symbols003` 自己的 PNG。
  - 不要求 `WM`、`CM`、`AF`、`BN`。
  - 缺 `spinBlur` / `disabled` 仍失败。
  - manifest 指向错误文件仍失败。
- 背景尺寸测试增加 `assets/game003/bg.jpg = 2000 x 2000`。
- 旧 `assets/game002/bg.jpg = 1125 x 2000` 仍可作为历史参考尺寸测试，但不能作为运行时背景。

### 5.5 更新 reel runtime 缺资源校验

更新：

```text
apps/game002/src/game-demo.ts
apps/game002/tests/game-demo.test.ts
```

实现要求：

- runtime 仍只消费一份 `rawGameConfig`。
- skin=2 使用完整 `symbols002` 可渲染集合。
- skin=3 使用 `symbols003` 当前可渲染集合。
- 当前 fixtures 保持对共享 gameconfig、scene 解析、grid-cell spin 逻辑的覆盖。
- 新增 skin=3 runtime 测试：
  - 用包含 `WL,H1,H2,L1,L2,L3,L4,CN,CO` 的 fake texture map 创建 runtime 成功。
  - 本地 `reels-001` 中实际出现的 code 都能被 skin=3 渲染或明确允许为空。
  - 包含 `WM` / `CM` / `AF` 的 scene 在 skin=3 下显式失败，错误包含 code 或 symbol。
  - 不因为 `rendercore` registry 的 missing asset empty 语义而把这些 code 静默显示为空。
- 如果现有测试为了通过而要求给 skin=3 补空贴图、借 skin=2 贴图或放宽 scene 校验，应修改测试，不要修改生产合同。

### 5.6 更新 main 和 framework flow 测试

更新：

```text
apps/game002/src/main.ts
apps/game002/tests/framework-flow.test.ts
apps/game002/tests/source-boundary.test.ts
```

实现要求：

- `main.ts` 明确根据 `config.skin` 获取 skin 配置并传给 `createGame002Adapter`。
- `framework-flow.test.ts` 的 `validQuery()` 增加 `skin`，并至少覆盖 skin 值透传不影响 spin request：
  - `spinParams` 仍是 `{ bet, lines, times, autonums }`。
  - `live.gamecode` 仍来自 URL `gamecode`，不由 skin 推导。
- `source-boundary.test.ts` 更新运行时背景断言：
  - 不再要求 adapter 源码只包含 `assets/game002/bgfull.jpg?url`。
  - 必须确认旧 portrait `assets/game002/bg.jpg?url` 不作为运行时资源。
  - 必须确认 `assets/game003/bg.jpg?url` 进入 skin 配置。
  - 继续禁止 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore` 作为 app runtime 直接依赖。

### 5.7 更新静态发布检查

更新：

```text
apps/game002/scripts/verify-static-dist.mjs
```

实现要求：

- dist 同时包含 skin=2 和 skin=3 背景。
- dist 同时包含 skin=2 和 skin=3 必需 symbol normal / `spinBlur` / `disabled`。
- skin=3 不要求 `WM`、`CM`、`AF`、`BN`。
- 继续检查相对资源路径和敏感字符串。

### 5.8 更新 README

更新：

```text
apps/game002/README.md
```

必须写清楚：

- `game002` 仍是单 app，多皮肤通过 URL `skin` 选择。
- `skin` 是必需参数，合法值 `2` / `3`。
- 两套皮肤共用 `serverUrl`、`gamecode` 和 `assets/gamecfg002/gameconfig.json`。
- `skin=2` 和 `skin=3` 各自的背景、symbol、manifest 路径。
- `assets/game003/bg.jpg` 对应原 `game002/bgfull.jpg` 的 runtime background，尺寸 `2000 x 2000`。
- `assets/game002/bg.jpg` 仍是旧 `1125 x 2000` portrait 参考图，不作为运行时背景。
- 第三套当前支持的 symbol 集合，以及用户确认当前服务端暂时不会下发第三套缺资源 symbol。
- 未来若服务端开始下发 `WM`、`CM`、`AF`、`BN`，必须先补齐 `assets/symbols003` 资源、manifest、测试和 README。
- 缺 skin、非法 skin、缺资源、manifest 错误、背景尺寸错误必须显式失败。
- 不从 skin 推导 gamecode；发布 URL 仍由外部传入真实 `gamecode`。

### 5.9 agents.md 同步判断

执行后检查本任务是否改变长期协作规则：

- 如果只是 `game002` 内部新增 URL skin 参数、资源配置、测试和 README，通常无需更新 `agents.md`。
- 如果新增了跨 app 的“皮肤目录规范”、基础脚本约定或 game app 协作规则，必须更新 `agents.md`。

报告中必须写明：

```text
本任务是否更新 agents.md：是/否
原因：...
```

## 6. 验收命令

从仓库根目录执行。

### 6.1 快速资源验收

```bash
sips -g pixelWidth -g pixelHeight assets/game002/bgfull.jpg assets/game003/bg.jpg
node -e 'for (const dir of ["symbols002","symbols003"]) { const m=require(`./assets/${dir}/symbol-state-textures.manifest.json`); console.log(dir, m.version, m.states.join(","), Object.keys(m.symbols).join(",")); }'
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels).join(",")); console.log([...new Set(cfg.reels["reels-001"].flat())].sort((a,b)=>a-b).join(","));'
```

期望：

- `assets/game002/bgfull.jpg` 为 `2000 x 2000`。
- `assets/game003/bg.jpg` 为 `2000 x 2000`。
- `symbols002` manifest 包含 `spinBlur,disabled` 和 12 个展示 symbol。
- `symbols003` manifest 包含 `spinBlur,disabled` 和 9 个当前展示 symbol。
- `gamecfg002` symbol code 顺序仍与本计划一致。

### 6.2 game002 模块验收

```bash
pnpm --filter game002 test
pnpm --filter game002 lint
pnpm --filter game002 typecheck
pnpm --filter game002 build
pnpm --filter game002 release:check
```

如果依赖下载或安装失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

然后重试同一命令。

### 6.3 根级回归验收

如果只改 `apps/game002`，至少执行：

```bash
pnpm --filter game002 test
pnpm --filter game002 build
git diff --check
```

如果实现触碰 `packages/rendercore`、`packages/gameframeworks`、`packages/uiframeworks` 或共享配置生成逻辑，必须额外执行相关包测试，并在报告中记录原因。例如：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/uiframeworks test
pnpm test
```

不要为了省事修改生产逻辑绕过失败测试。若测试表达的是旧合同，应修改测试；若测试暴露真实问题，应修生产逻辑。

### 6.4 浏览器验收

启动本地 dev server：

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

使用同一套服务器参数分别访问：

```text
http://127.0.0.1:5206/?skin=2&serverUrl=...&gamecode=...&token=...&businessid=...&clienttype=...&jurisdiction=...&language=...&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
http://127.0.0.1:5206/?skin=3&serverUrl=...&gamecode=...&token=...&businessid=...&clienttype=...&jurisdiction=...&language=...&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

浏览器验收目标：

- 两个 URL 都进入同一个 `apps/game002` 页面。
- `skin=2` 显示 `assets/game002/bgfull.jpg` 对应背景和 `symbols002` 图标。
- `skin=3` 显示 `assets/game003/bg.jpg` 对应背景和 `symbols003` 图标。
- 两个 URL 使用同一个 `gamecode`，请求参数不因 skin 改变。
- spin 后目标 scene 正确落地，grid-cell reel 表现和 skin 切换无关。
- 浏览器 console 没有资源 404、manifest 错误或 Pixi runtime error。

非法参数验收：

```text
http://127.0.0.1:5206/?serverUrl=...         -> 缺 skin，初始化失败
http://127.0.0.1:5206/?skin=4&serverUrl=...  -> 非法 skin，初始化失败
http://127.0.0.1:5206/?skin=2&skin=3&...     -> 重复 skin，初始化失败
```

如果执行时没有可用 live server/token，仍必须完成自动化测试、构建和非法参数浏览器验收；同时在任务报告中明确写明“真实 live spin 浏览器验收未执行，原因是缺少可用 live 参数”。不要用 mock/replay/local scene 伪装真实 live 验收通过。

## 7. 验收清单

完成前逐项确认：

- [ ] `apps/game002` URL query 支持必需 `skin=2` / `skin=3`。
- [ ] 缺失、重复、空值、非法 `skin` 都显式失败。
- [ ] `skin` 不影响 live `gamecode`、服务器、token 或 spin request。
- [ ] `skin=2` 使用 `assets/game002/bgfull.jpg` 和 `assets/symbols002`。
- [ ] `skin=3` 使用 `assets/game003/bg.jpg` 和 `assets/symbols003`。
- [ ] 两套皮肤继续共用 `assets/gamecfg002/gameconfig.json`。
- [ ] 没有新增 `apps/game003`。
- [ ] 没有新增 `assets/gamecfg003`。
- [ ] 没有用动态字符串拼 Vite 资源路径。
- [ ] 没有从 `symbols002` 借图给 `symbols003`。
- [ ] 没有 placeholder、空纹理或隐藏 fallback。
- [ ] 第三套当前不会收到缺资源 symbol 的假设写入 README 和报告。
- [ ] 意外 scene code 缺当前 skin 贴图时显式失败。
- [ ] 背景尺寸 `2000 x 2000` 有测试或脚本覆盖。
- [ ] `assets/game002/bg.jpg` 仍不作为运行时背景。
- [ ] `release:check` 验证 dist 包含两套皮肤资源。
- [ ] `apps/game002/README.md` 已更新 URL 示例、资源路径、失败规则和未来补资源条件。
- [ ] `agents.md` 是否需要更新已有明确判断。
- [ ] `pnpm --filter game002 test` 通过。
- [ ] `pnpm --filter game002 lint` 通过。
- [ ] `pnpm --filter game002 typecheck` 通过。
- [ ] `pnpm --filter game002 build` 通过。
- [ ] `pnpm --filter game002 release:check` 通过。
- [ ] `git diff --check` 通过。
- [ ] 已写中文任务报告 `tasks/57-game002-url-skin-selection-[utctime].md`。

## 8. 任务报告要求

任务完成后创建：

```bash
UTC_TIME="$(date -u +%y%m%d-%H%M%S)"
REPORT="tasks/57-game002-url-skin-selection-${UTC_TIME}.md"
```

报告必须用中文，至少包含：

1. 实现摘要。
2. 改动文件清单。
3. URL query 合同，特别是 `skin` 的合法值和失败规则。
4. skin=2 / skin=3 资源映射表。
5. 第三套当前不会收到缺资源 symbol 的假设，以及未来补资源触发条件。
6. 是否更新 `agents.md`，以及原因。
7. 执行过的命令和结果。
8. 浏览器验收结果；如果没有真实 live 参数，必须明确说明未执行真实 live spin 验收，不能写成已通过。
9. 最终工作区摘要：

```bash
git status --short --untracked-files=all
git diff --stat
```

报告中不要粘贴 token、真实长效凭据或完整敏感 URL。需要记录 URL 时，用脱敏形式：

```text
serverUrl=wss://example.test/...&gamecode=GAME_CODE&token=<redacted>
```

## 9. 二次检查清单

交付前做一次遗漏检查：

- `target tree`：是否只改了 `apps/game002`、必要资源检查脚本、README、任务报告；是否误建 `apps/game003` 或 `assets/gamecfg003`。
- `URL contract`：`skin` 是否必需、是否重复失败、是否不参与 live 协议字段推导。
- `asset contract`：两套背景和两套 symbol 是否由 Vite 静态收集；dist 是否包含两套资源。
- `runtime contract`：第三套缺资源 code 是否不会被 registry 静默当 empty；未来服务端发新 code 时是否能早失败。
- `layout contract`：是否没有为 skin 分支复制坐标、裁切、viewport、grid-cell reel 算法。
- `scale contract`：是否没有在 URL skin 分支硬编码 `symbols002` 的 40% 缩放；缩放仍由 symbol 配置 / 既有 symbol pipeline 表达。
- `test contract`：是否修改了表达旧合同的测试，而不是为了测试改歪生产逻辑。
- `docs contract`：README 是否足够让发布方知道 `skin` 是必需参数，以及两套皮肤共用服务器和 gamecode。
- `agents contract`：是否判断并记录 `agents.md` 同步情况。
- `cleanup`：是否没有提交 `dist/`、`coverage/`、`.turbo/`、临时截图或 `.DS_Store`，除非任务明确要求。
