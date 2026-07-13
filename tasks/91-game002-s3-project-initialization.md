# game002 s3 project initialization 任务计划

## 1. 任务目标

本任务把长期作为多皮肤测试项目维护的 `apps/game002`，重新收口为只面向 `assets/game002-s3` 的可运行项目，并按仓库当前通用能力完成 symbol 派生图、最新 symbol manifest、Spine 4.3、loading、中奖金额动画、静态发布、测试和文档初始化。

仓库根目录固定为：

```text
/Users/zerro/github.com/slotclientengine
```

本计划是完整执行合同，不能依赖聊天记录、旧任务计划或口头背景。执行者只阅读本文件，即可完成 Git 基线同步、用户资源保护、实现、验收、协作规则更新和任务报告。

最终合同如下：

- `apps/game002` 只支持一套皮肤：URL `skin=1` 映射 `assets/game002-s3`；旧 `skin=2|3|4|5`（包括旧的 `skin=5 -> game002-s3`）全部显式失败，不保留 alias、默认值或兼容分支。
- `game002` 不再 import 或打包 `assets/symbols001`、`assets/symbols002`、`assets/symbols003`、`assets/game002-s1`、`assets/game002-s2`、`assets/game002/bgfull.jpg`、`assets/game003/bg.jpg` 等旧测试皮肤资源。
- 旧资源目录可能仍被其它 app、历史任务或工具使用，本任务只移除 `game002` 的支持和打包入口，不批量删除仓库共享资源目录。
- 背景固定为 `assets/game002-s3/bg.jpg`，尺寸合同仍为 `2000 x 2000`。
- 主转轮继续使用 `assets/gamecfg002/gameconfig.json` 的本地公开 `reels-001`，保持现有 `6 x 9` grid-cell reel 算法、服务器 scene 临时叠加和 live 协议边界。
- `game002-s3` 的可展示 symbol 固定为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`。新资源已经提供 `BN.png`，因此 `BN` 从旧的 empty symbol 改为显式贴图 symbol；`emptySymbols` 必须为空。
- 上述 13 个 symbol 都必须具有 normal、`spinBlur`、`disabled` 和显式 `scale: 1`；背景、Spine atlas texture、`CN_1` 到 `CN_4`、`Nearwin1` 到 `Nearwin3`、`WM_Fx` 不得误入主 symbol manifest。
- `assets/game002-s3/symbol-state-textures.manifest.json` 使用 `packages/rendercore` 当前 manifest schema；app 和 viewer 必须复用 rendercore parser/resolver，不在 `apps/game002` 内保留第二份 manifest schema 或专属 Spine 播放器。
- rendercore 的官方 Spine Pixi runtime 统一到 `4.3.x`，只接受 Spine `4.3.x` skeleton。旧 3.8 手写 adapter 和最新基线中的 4.2 runtime/版本分支都不作为兼容路径保留。
- `assets/game002-s3` 新增 skeleton 均为 `Spine 4.3.23`；manifest 只能声明 skeleton 中真实存在、大小写完全一致的 animation name。
- `assets/game003-s1` 当前仍是 Spine 4.2，且用户已经明确该版本暂不发布。本任务不迁移、不修改、不为其增加 4.2 兼容 runtime，也不把 `game003 release:check` 作为本任务完成门禁；相关现状必须在最终报告中明确记录，不能伪装成全仓 Spine 已经无例外可发布。
- `game002` 首屏接入 `packages/gameloading`：99% 回调完成 query 校验和 live session 准备，100% 后才创建 framework/Pixi 游戏画面，避免 loading 前挂载游戏或产生双 WebSocket。
- 为保证完整中奖金额流程，本任务把当前最新的 `assets/game003-s1/win-amount` 整目录复制到 `assets/game002-s3/win-amount`，作为明确标记的临时 big/super/mega 资源；接入 rendercore 通用 win-amount player，不复制其状态机。
- 临时 win-amount 资源仍以复制后的 `assets/game002-s3/win-amount/win-amount.manifest.json` 为 tier project、asset glob 和 segmented 时间唯一来源。以后美术按 game003 规范替换时，不需要改 app 内第二份时间表。
- fail-fast：缺资源、派生图漂移、未知 manifest 字段、非法 scale、Spine 版本不匹配、animation 不存在、atlas/texture 不匹配、旧 skin、旧资源引用、loading 缺项、win-amount 引用缺失或重复都必须显式失败。
- 如果是测试导致奇怪写法，修改测试，不削弱 production 合同；不增加 placeholder、跨 skin 借图、BN 空图兜底、Spine 4.2/3.8 隐式兼容或静默动画降级。

任务完成后必须新增中文任务报告：

```text
tasks/91-game002-s3-project-initialization-[utctime].md
```

`utctime` 必须使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/91-game002-s3-project-initialization-260713-181300.md
```

## 2. 已确认的当前工作区事实

以下是制定计划时对当前 checkout 的实际盘点。执行任务时仍必须重新运行第 5 节命令，不能只引用本节快照。

### 2.1 Git 基线和用户输入资源

制定计划时：

```text
branch: main
HEAD: c4435db68754f8b4057bb27f337e5889cf7cdde9
origin/main: ce14f60
status: 本地落后 origin/main 2 个提交
```

`origin/main` 的两个提交包含 task 90 的 game003 Spine 4.2 接入、rendercore 版本校验、依赖锁文件和后续透明 texture 修复。执行本任务必须先安全 fast-forward 到最新 `origin/main`，再实施本计划；不能直接基于旧 HEAD 重写 task 90 已完成的通用实现。

当前用户输入资源全部位于 `assets/game002-s3`：

- 已修改的基础 PNG：`AF,CM,CO,H1,H2,L1,L2,L3,L4,WL,WM.png`；
- 新增 skeleton：`AF,BN,CM,CO,H1,H2,L1,L2,L3,L4,WL,WM.json`；
- 新增 CN 变体 skeleton/preview：`CN_1` 到 `CN_4` 的 JSON/PNG；
- 新增 effect skeleton：`Nearwin1` 到 `Nearwin3`、`WM_Fx.json`；
- 新增 `BN.png`、`Symbol.atlas`、`Symbol.png`。

这些文件是用户提供的美术输入。不得 stash 后遗忘、回滚、覆盖、格式化 skeleton JSON 或为了旧 parser/测试去手改资源内容。

### 2.2 基础 PNG 和旧派生图已经漂移

当前 normal PNG 尺寸为：

```text
WL,H1,H2,L1,L2,L3,L4,WM,BN,CN_1,CN_2,CN_3,CN_4 -> 130 x 130
AF,CM,CO                                             -> 170 x 170
CN                                                   -> 200 x 200
```

当前受跟踪的旧 `spinBlur` / `disabled` 仍全部为 `200 x 200`。使用当前 generator 在 `/tmp` 中对 13 个目标 symbol 试生成后，派生图尺寸会与各自 normal PNG 一致，因此至少以下 11 组派生图必须更新：

```text
AF,CM,CO,H1,H2,L1,L2,L3,L4,WL,WM
```

`BN` 需要新增两张派生图；`CN` normal 没有变化，仍应通过临时生成结果与工作区旧文件逐 SHA-256 比较，只有真实不一致时才提交二进制变更。

### 2.3 Spine 资源版本和动画清单

新增 skeleton 均声明：

```text
spine = 4.3.23
```

当前 animation names：

```text
WL: Change,End,Feature,Idle,NearWin,Reel_NearWin,Start,Win
H1: End,Feature1,Feature2,Idle,Start,Win
H2: End,Feature1,Feature2,Idle,Start,Win
L1-L4: End,Feature1,Feature2,Idle,Start,Win
WM: Change,End,Feature,Idle,Mult_End,Mult_Idle,Mult_Start,Start
CM: Change,End,Feature1,Feature2,Idle,Start
CO: Change,End,Feature,Idle,Loop,Start
AF: Change,End,Feature,Idle,Start
BN: Idle
CN_1-CN_4: Collect,End,Feature1,Feature2,Feature_Change,Idle,Loop,Start,Win,Win_Start
Nearwin1-Nearwin3: Loop
WM_Fx: Loop
```

只有与主 symbol code 同名、语义明确的 skeleton 才能接入第一版主 symbol manifest。`CN` 没有同名 `CN.json`，不能私自选择 `CN_1` 到 `CN_4` 中任意一个作为默认 CN 动画；`Nearwin*` 和 `WM_Fx` 也不能通过宽泛 glob 自动接入。

### 2.4 当前 game002 与最新项目规范的差距

当前 `apps/game002`：

- 同时 import 五套 skin 的背景、PNG 和 manifest；
- `skin=1|2|3|4|5` 都进入 query、测试、README 和 release check；
- 在 `apps/game002/src/assets.ts` 内复制了一份简化 manifest parser，无法承载最新 `animations` / `renderPriority` 合同；
- `symbol-animation-config.ts` 仍固定读取 `assets/symbols002`，与当前实际 skin 解耦；
- grid-cell reel registry 没有传 manifest animation resolver/render priority map；
- 第一屏直接创建 framework 并 connect，没有 gameloading 的 99%/100% 生命周期；
- 没有 Pixi win-amount player，只有 framework HUD 金额；
- release check 仍断言五套 skin 并依赖旧 symbol 尺寸/目录引用。

### 2.5 bigwin 是否必须的结论

`createSlotGameFramework()` 的连接、spin、collect 本身不强制依赖 bigwin 资源；但是本任务目标不是维持旧测试 demo，而是初始化可继续交付的单皮肤项目。为了让正中奖、big/super/mega 金额展示和点击推进流程完整，本任务把 win-amount 视为本次初始化交付面，并按用户授权复制 game003 当前资源。

复制的是资源和 manifest，不复制 game003 的 bg-bar、minecart、bg-wins、coin overlay 或其它游戏专属逻辑。金额递增、tier 切换、segmented 播放和点击推进继续由 `packages/rendercore/win-amount` 拥有。

## 3. 工具链和执行原则

- Node.js：`>=24.0.0`
- pnpm：`>=10.0.0`
- monorepo：pnpm workspace + turbo
- 构建：TypeScript + Vite
- 测试：Vitest
- lint：ESLint
- format：Prettier

如果依赖安装或下载真实失败，再执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

然后重试原命令。不要在没有下载失败时改 npm/pnpm 全局配置。

非 TTY 环境如果出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，使用相同命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game002 test
```

不要因为环境问题改生产代码或降低验收标准。

## 4. 范围和非目标

### 4.1 本任务必须修改的实现面

```text
assets/game002-s3/*
assets/game002-s3/win-amount/*
packages/rendercore/package.json
packages/rendercore/src/symbol/*spine*
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/tests/symbol/*spine*
pnpm-lock.yaml
apps/game002/package.json
apps/game002/src/*
apps/game002/tests/*
apps/game002/scripts/verify-static-dist.mjs
apps/game002/README.md
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/tests/*
apps/symbolsviewer/README.md
AGENTS.md
agents.md
tasks/91-game002-s3-project-initialization-[utctime].md
```

若实现发现文件名需要调整，以职责为准，但最终报告必须列出实际新增、删除和修改文件。

### 4.2 明确非目标

- 不修改 game002 的 live server、金额原始整数协议、collect 边界或 URL token 安全规则；`lines` 按后续验收修正为 game002 固定 `30`，URL 非 `30` 必须在 loading 99% 阶段显式失败，不能把 game003 的 `10` 透传进 spin request。
- 不读取、缓存或泄露服务器真实轮带；继续使用本地公开 `reels-001`。
- 不把 grid-cell 算法、art viewport、symbol manifest parser、Spine player、win-amount 状态机复制进 app。
- 不迁移 `assets/game003-s1` 的 Spine 4.2 资源，不运行/发布 game003，不为 4.2 保留隐式 runtime 兼容。
- 不猜测 `CN_1` 到 `CN_4`、`Nearwin*`、`WM_Fx` 的 feature 业务选择规则；这些资源保留在目录中但第一版不接入主 manifest/glob/loading。
- 不把 `Change`、`Feature*`、`Mult_*`、`NearWin` 等名字猜成通用 `appear` 或 `win`。只有语义明确的 `Idle`、`Start`、`Win` 进入本次 manifest。
- 不为了让旧五 skin 测试通过保留死分支；测试必须改成单 skin 合同。
- 不强行把 game003 专用的 `apps/buildgamestatic` schema 套到 game002。本任务保留 game002 当前 query gamecode 和 grid-cell 特性，用 typed app config + manifest 配置 loading/win-amount；不要为了“看起来一致”扩展共享 YAML schema、制造 query gamecode sentinel 或伪装成 normal reel。

## 5. 实施前盘点和 Git 基线同步

### 5.1 确认环境和保护用户改动

```bash
cd /Users/zerro/github.com/slotclientengine
node --version
pnpm --version
git status --short --untracked-files=all
git diff --stat
git diff --name-status -- assets/game002-s3
git branch --show-current
git log -1 --format='%H %ad %s' --date=iso
git log --oneline HEAD..origin/main
```

必须确认：

- 当前分支是 `main`；
- 用户提供的 `game002-s3` modified/untracked 文件仍存在；
- 没有与本任务无关但会被覆盖的工作区改动；
- 不执行 `git reset --hard`、`git checkout --`、清理 untracked 或自动 stash。

### 5.2 安全同步 origin/main

先刷新远端信息：

```bash
git fetch origin
git log --oneline HEAD..origin/main
git diff --name-status HEAD..origin/main
```

确认远端变更不覆盖用户的 `assets/game002-s3` 输入后：

```bash
git pull --ff-only origin main
```

如果 fast-forward 因本地改动冲突而失败，立即停止并在报告/沟通中列出冲突文件；不要自行 stash、force、reset 或丢弃美术资源。同步成功后重新执行：

```bash
git status --short --untracked-files=all
git log -3 --oneline
```

预期最新基线包含：

```text
tasks/90-game003-resource-spine-refresh.md
packages/rendercore/src/symbol/spine-version.ts
game003 Spine 4.2 runtime/manifest 校验更新
透明 texture 加载修复
```

本任务随后明确把共享 Spine 合同从 task 90 的 4.2 改成用户最新决定的 4.3。

### 5.3 重新盘点资源闭包

```bash
find assets/game002-s3 -maxdepth 1 -type f -print | sort
for f in assets/game002-s3/*.json; do printf '%s\t' "$f"; jq -r '[.skeleton.spine // "-", ((.animations // {})|keys|join(","))] | @tsv' "$f"; done
file assets/game002-s3/*.png
head -40 assets/game002-s3/Symbol.atlas
```

新增一个正式测试或只读脚本，验证：

- 目标 13 个 normal PNG 全部存在；
- skeleton version 全部为 `4.3.x`；
- 计划声明的 animation name 真实存在；
- atlas 只有一个 page，page 名与 `Symbol.png` 一致；
- manifest/glob 不会吸入背景、atlas texture、CN 变体和 effect skeleton。

## 6. 实施步骤

### 6.1 把 rendercore Spine runtime 统一到 4.3

基线同步后，`packages/rendercore/package.json` 预期仍被 task 90 锁在 `~4.2.0`。从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/rendercore add @esotericsoftware/spine-pixi-v8@~4.3.0
```

该命令必须同时更新：

```text
packages/rendercore/package.json
pnpm-lock.yaml
```

要求：

- package range 固定在 `4.3.x`，不能用 `^4.3.0` 自动跨到 4.4；
- lockfile 只能出现 rendercore 实际解析到的官方 4.3 runtime 闭包，不能同时保留无调用方的 4.2 runtime；
- `apps/game002`、`apps/symbolsviewer` 不直接依赖/import Spine 包；
- 下载失败时才使用第 3 节代理重试。

更新 `packages/rendercore/src/symbol/spine-version.ts`、`manifest.ts`、`spine-animation.ts`：

- `readSupportedSpineSkeletonVersion()` 只接受 `4.3.x`；
- `3.8.x`、`4.2.x`、`4.4.x`、缺版本、非法对象都显式失败，错误包含实际版本；
- 4.3 atlas/skeleton 预校验和播放统一走官方 `@esotericsoftware/spine-pixi-v8`；
- 删除 `spine38-runtime.ts`、对应 export/import、测试和 production 文档陈述，不保留无人维护的旧手写 parser；
- 不捕获版本错误后回落到另一套 player；
- atlas page/texture、region、animation name、loop contract 继续显式校验；
- 同一 `RenderSymbol` 共享 skeleton/atlas/texture 时继续复用 player，只切 animation。

测试至少覆盖：

- 4.3.23 skeleton + atlas 可以创建 resource/player；
- `Idle` loop、`Start` once、`Win` once；
- 4.2.43 和 3.8.99 被明确拒绝；
- animation 大小写错误、atlas page 错误、缺 texture、malformed skeleton 明确失败；
- player cache、destroy 和 once completion 没有回归。

### 6.2 重新生成 game002-s3 派生图和基础 manifest

目标 symbol 顺序固定为：

```text
WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN
```

先在 `/tmp` 生成并比对，避免未确认就污染工作区：

```bash
mkdir -p /tmp/game002-s3-state-audit
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game002-s3 --output-dir /tmp/game002-s3-state-audit --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN --scale 1
```

逐 symbol 比较 normal 与临时派生图尺寸，并比较临时结果与工作区现有文件 SHA-256。确认差异后在工作区生成：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game002-s3 --output-dir assets/game002-s3 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN --scale 1
```

生成器必须：

- 只生成 13 个目标 symbol 的 `spinBlur`、`disabled`；
- manifest 只包含这 13 个 key，顺序稳定；
- 每个 symbol 显式 `scale: 1`；
- 保持 `states=[spinBlur,disabled]`、vertical box blur `kernelHeight=21`、grayscale `brightness=0.72`；
- 不生成 `bg.*`、`Symbol.*`、`CN_1.*`、`Nearwin*.*`、`WM_Fx.*` 派生图；
- 不把 130/170 normal 放大回 200，不增加透明 padding 兜底。

预期派生图尺寸：

```text
WL,H1,H2,L1,L2,L3,L4,WM,BN -> 130 x 130
AF,CM,CO                    -> 170 x 170
CN                          -> 200 x 200
```

### 6.3 按最新规范补齐 manifest 动画元数据

在 generator 产出的 `assets/game002-s3/symbol-state-textures.manifest.json` 上增加 `animations`。所有 Spine spec 都使用：

```text
atlas: ./Symbol.atlas
texture: ./Symbol.png
playback.mode: animation
```

第一版明确映射：

| Symbol | normal                       | appear                         | win                               |
| ------ | ---------------------------- | ------------------------------ | --------------------------------- |
| WL     | `WL.json / Idle / loop=true` | `WL.json / Start / loop=false` | `WL.json / Win / loop=false`      |
| H1     | `H1.json / Idle / true`      | `H1.json / Start / false`      | `H1.json / Win / false`           |
| H2     | `H2.json / Idle / true`      | `H2.json / Start / false`      | `H2.json / Win / false`           |
| L1-L4  | 各自 JSON / `Idle` / true    | 各自 JSON / `Start` / false    | 各自 JSON / `Win` / false         |
| WM     | `WM.json / Idle / true`      | `WM.json / Start / false`      | 不声明，不能猜 `Feature`/`Mult_*` |
| CM     | `CM.json / Idle / true`      | `CM.json / Start / false`      | 不声明，不能猜 `Feature1/2`       |
| CO     | `CO.json / Idle / true`      | `CO.json / Start / false`      | 不声明，不能猜 `Feature`/`Loop`   |
| AF     | `AF.json / Idle / true`      | `AF.json / Start / false`      | 不声明，不能猜 `Feature`          |
| BN     | `BN.json / Idle / true`      | 不声明                         | 不声明                            |
| CN     | 保持 PNG normal              | 不声明                         | 不声明；不得私选 `CN_1-CN_4`      |

`renderPriority` 本次没有明确美术合同，全部使用缺省 `0`，不写 symbol 专属 `zIndex` 分支。

补完 metadata 后再次运行同一 generator，验证仍有效的 `animations` 被完整保留；如果 generator 丢失 metadata，应修 generator/测试，不允许每次靠手工补回。

新增 manifest 测试，至少验证：

- 13 个 display symbol、scale、state texture 路径和 animation spec；
- skeleton 版本为 4.3；
- animation exact name 存在；
- CN 变体/effect/background/atlas texture 不在 manifest；
- 非法/缺失资源显式失败。

### 6.4 把 game002 收口为单 skin=1

修改：

```text
apps/game002/src/skin-id.ts
apps/game002/src/skin-config.ts
apps/game002/src/framework-config.ts
apps/game002/src/assets.ts
apps/game002/src/symbol-animation-config.ts（删除或改为只做 manifest 派生，不保留重复入口）
apps/game002/src/game-layout.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-adapter.ts
```

要求：

- `Game002SkinId` 只有字面量 `"1"`，`GAME002_SUPPORTED_SKINS=["1"]`；
- query 仍要求显式 `skin=1`，缺失或传 `2|3|4|5|01|game002-s3` 都失败；
- 不把旧 `skin=5` 静默改写成 1；
- `skin=1` 资源固定为 `assets/game002-s3/bg.jpg` 和最新 manifest；
- display symbols 从 manifest 派生并校验恰好为 13 个，不维护第二份可漂移列表；game config symbol code 若不在 manifest 中必须失败；
- `emptySymbols=[]`，BN 使用真实 normal/state PNG；
- 删除所有旧 skin import/glob、label、layout 常量、focus 常量、测试 case 和 README 表格；
- 保留唯一 s3 布局：art `2000 x 2000`，board `x=637.5,y=330,width=720,height=1080`，cell `120 x 120`，6 列 x 9 行；唯一 focus 在 board 四边各扩 `60`，即 `x=577.5,y=270,width=840,height=1200`。单背景使用 rendercore `maximized-focus` policy：先完整且最大化 focus，再按页面宽高比反推背景 viewport，focus 外仍在 art 内的背景不得主动裁掉，只有超过完整 art 才封顶；app 不得增加第二个 `frameFocusRect`、按横竖屏强制锁 focus 宽高或复制算法，也不得套用 game003 双背景 `orientation-focus` 变体配置；
- 保留现有 grid-cell order/timing/dimming/row offset，不借资源更新顺便改变 reel 节奏。

`apps/game002/src/assets.ts` 改为调用 rendercore：

```text
getSymbolDisplaySymbolsFromManifest
createSymbolAssetMapFromManifestModules
createSymbolScaleMapFromManifest
createSymbolRenderPriorityMapFromManifest
createSymbolManifestAnimationResolver
```

app 只负责提供精确 Vite modules：

```text
PNG: WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN 的 normal/spinBlur/disabled
Spine JSON: WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN
Atlas raw: Symbol.atlas
Texture URL: Symbol.png
```

不能使用 `assets/game002-s3/*.png` / `*.json` 宽泛 glob；必须使用 brace glob 或显式 module map，排除背景、CN 变体和 effect。

把 manifest 派生的 `symbolScales`、`symbolRenderPriorities`、`animationResolver` 传给 `createReelSymbolRegistry()`。不要在 `game-demo.ts` 写 `if symbol === ...`。

当前 game002 grid-cell reel 流程只请求 `normal`、`spinBlur`、`disabled`，不会请求未定义的 `appear`/`win`。本任务不顺带改变 rendercore 已有的“normal Spine symbol 缺 once 状态时展示自身 normal Spine”共享合同，但 game002 runtime/viewer 不能依赖该行为掩盖资源语义缺口；以后要接 WM/CM/CO/AF/BN/CN 的 win/feature 表现时，必须先补明确 manifest 映射和测试。

### 6.5 接入 symbolsviewer 验证面

当前 symbolsviewer 只有 `game003-s1` 和 `game003-bg-bar`。新增唯一的：

```text
id: game002-s3
catalogKind: paytable
rawGameConfig: assets/gamecfg002/gameconfig.json
manifest: assets/game002-s3/symbol-state-textures.manifest.json
```

传入与 game runtime 相同的精确 PNG/Spine modules 和 rendercore animation resolver。要求：

- viewer 显示 13 个 symbol，包括真实 BN；
- normal/appear/win 状态只按 manifest 显示；
- 对未声明 `appear`/`win` 的 WM、CM、CO、AF、BN、CN，viewer 必须根据 manifest 标记该状态不可用或从当前 sequence 跳过，不能把 rendercore 的 normal fallback 冒充为该 symbol 已有自定义动画；
- CN 变体和 Nearwin/WM_Fx 不作为 orphan symbol 出现；
- viewer 不直接 import Spine runtime、不复制 animation name 表；
- 缺 animation/resource 时显示错误并使测试失败，不静默回普通 PNG。

更新 `apps/symbolsviewer/README.md` 和测试。

### 6.6 接入 gameloading 的 99%/100% 生命周期

`apps/game002/package.json` 新增：

```json
"@slotclientengine/gameloading": "workspace:*"
```

并把 `prepare:deps` 加入 gameloading build。参考 game003 的结构，但使用 game002 命名和资源：

```text
apps/game002/src/main.ts
apps/game002/src/loading-resources.ts
apps/game002/src/game-entry.ts
```

流程固定为：

```text
main 创建 loading host/game host
  -> gameloading 加载背景、13组 PNG、12个 skeleton、atlas/texture、win-amount、runtime module
  -> 99%: parse query + get skin + prepareSlotGameLiveSession
  -> 100%: 显示 game host + createSlotGameFramework + connect prepared session
  -> 成功后销毁 loading DOM
```

资源列表必须是精确闭包，不能宽泛扫描整个 `game002-s3`。测试确认：

- loading 开始前没有 framework/Pixi canvas/WebSocket；
- 99% 只创建一条 prepared live session；
- 100% 不新建第二条连接；
- enter 失败时断开 prepared session、清理 game host，并保留可读错误；
- beforeunload/destroy 只清理一次；
- 所有 manifest 引用的 PNG/Spine/win-amount 资源都在 loading 闭包中，且无 orphan loading 项。

### 6.7 复制并接入临时 win-amount 资源

必须在第 5.2 节同步最新 origin/main 后复制，避免拿当前旧 checkout 中已被 task 90 替换的 win-amount 资源：

```bash
mkdir -p assets/game002-s3/win-amount
cp -R assets/game003-s1/win-amount/. assets/game002-s3/win-amount/
diff -qr assets/game003-s1/win-amount assets/game002-s3/win-amount
```

复制后验证源/目标逐文件 SHA-256 相同，并验证三个 project 的资源引用闭包：

- `bigwin.json`、`superwin.json`、`megawin.json` 可解析；
- project 引用的每个 asset 存在；
- 目录中不存在未被三个 project 引用的 orphan；
- manifest tier 仍是 `bigwin=15x`、`superwin=30x`、`megawin=50x`；
- segmented 时间只来自复制后的 manifest，当前 `duration=2.9`、`loopStart=1`、`loopEnd=2.5`；
- VNI 按资源 100% 尺寸显示，不按 background/stage fit。

新增 `apps/game002/src/win-amount-config.ts`，只把 formatter、金额输入、layout anchor 和复制后的 manifest modules 传给 rendercore。金额仍是服务器整数，`100 -> $1.00`，HUD 和 Pixi 动画共用 `formatServerUsdAmount`。

把 player 接入 adapter：

- 每次 spin 开始先 `dismissImmediately()` 清理上轮 lingering；
- reel 完成且目标 scene 校验通过后，如 `totalwin > 0`，用 `betAmountRaw=logic.getBet()*logic.getLines()`、`winAmountRaw=logic.getTotalWin()` 启动；
- `minor-counting|major-counting|tier-counting` 阻塞 `playSpin()`；
- 进入最终 `awaiting-dismiss` 后不再阻塞 collect；
- canvas 点击只调用 `requestAdvance()`；
- destroy/resize 正确清理和重排 player；
- 0 win 不启动 player；非法 bet/win 显式失败。

不要复制 game003 的 bg-wins、bg-bar、minecart、coin overlay 或 Ways 结果循环。

### 6.8 更新 release check、测试和文档

重写 `apps/game002/scripts/verify-static-dist.mjs` 的五 skin 假设，只验证：

- dist 使用相对 `./assets/*`；
- bundle 中有且只有 game002-s3 的背景和目标资源引用；
- 13 个 normal/state texture 被打包，派生图尺寸与各自 normal 相同；
- `Symbol.atlas`、`Symbol.png`、12 个 skeleton 和 manifest 动画引用闭包完整；
- CN 变体/effect 没有因宽泛 glob进入主 runtime bundle（若未接入任何流程）；
- win-amount manifest/projects/referenced assets 完整且无 orphan；
- built JS 不包含旧 skin 目录字符串、旧 `skin=2|3|4|5` 分支、`serverUrl` query 支持、token 默认值或 secret；
- `base: "./"` 和静态子目录发布合同不变。

更新 game002 全部测试：

```text
assets.test.ts
env.test.ts
framework-flow.test.ts
game-adapter.test.ts
game-demo.test.ts
game-layout.test.ts
source-boundary.test.ts
symbol-animation-config.test.ts（删除或改成 manifest resolver 测试）
新增 loading-resources / game-entry / win-amount / Spine manifest 测试
```

测试必须验证 production 行为，不得保留五 skin fixture 迫使 production 出现兼容分支。

更新 `apps/game002/README.md`，删除 demo/五 skin 陈述，写清：单 `skin=1`、game002-s3 资源、BN 真实贴图、Spine 4.3、loading、win-amount 临时复制来源、固定 live server、query、grid-cell/local reel、构建和验收 URL。

### 6.9 同步协作规则

本任务会改变长期协作合同，必须同步更新：

```text
AGENTS.md
agents.md
```

两份文件最终必须字节一致：

```bash
cmp -s AGENTS.md agents.md
```

至少更新：

- game002 只支持 `skin=1 -> assets/game002-s3`；
- game002-s3 13 个 display symbol、BN 不再 empty、scale=1；
- manifest Spine animation 映射和 CN/effect 排除边界；
- rendercore 官方 Spine runtime 只支持 4.3；
- game003 4.2 是暂不发布、待后续迁移的已知例外，本任务不提供兼容；
- game002 首屏 loading 和临时 win-amount 资源路径/替换边界；
- 不保留旧 skin fallback 或跨目录借图。

## 7. 自动化验收命令

以下命令从仓库根目录执行。先跑目标包门禁，再做全仓审计。

### 7.1 资源和版本门禁

```bash
git status --short --untracked-files=all
git diff --stat
git diff --check
```

依赖安装完成后运行以下只读 Node 检查。它验证 manifest、PNG 尺寸、Spine 版本/animation 和 win-amount 引用闭包；不能用目测替代：

```bash
node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = "assets/game002-s3";
const expectedSymbols = [
  "WL", "H1", "H2", "L1", "L2", "L3", "L4",
  "WM", "CN", "CM", "CO", "AF", "BN",
];
const spineSymbols = [
  "WL", "H1", "H2", "L1", "L2", "L3", "L4",
  "WM", "CM", "CO", "AF", "BN",
];
const bannedManifestSymbols = [
  "bg", "Symbol", "CN_1", "CN_2", "CN_3", "CN_4",
  "Nearwin1", "Nearwin2", "Nearwin3", "WM_Fx",
];
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manifestPath = path.join(root, "symbol-state-textures.manifest.json");
const manifest = readJson(manifestPath);
assert(manifest.version === 1, "symbol manifest version must be 1");
assert(
  JSON.stringify(Object.keys(manifest.symbols ?? {})) ===
    JSON.stringify(expectedSymbols),
  `unexpected manifest symbols: ${Object.keys(manifest.symbols ?? {}).join(",")}`,
);
for (const banned of bannedManifestSymbols) {
  assert(!(banned in manifest.symbols), `banned manifest symbol ${banned}`);
}

for (const symbol of expectedSymbols) {
  const entry = manifest.symbols[symbol];
  assert(entry.scale === 1, `${symbol} scale must be 1`);
  for (const [state, suffix] of [
    ["normal", ""],
    ["spinBlur", ".spinBlur"],
    ["disabled", ".disabled"],
  ]) {
    assert(
      entry[state] === `./${symbol}${suffix}.png`,
      `${symbol} ${state} manifest path is invalid`,
    );
    assert(
      fs.existsSync(path.join(root, `${symbol}${suffix}.png`)),
      `missing ${symbol}${suffix}.png`,
    );
  }
  const sizes = await Promise.all(
    ["", ".spinBlur", ".disabled"].map(async (suffix) => {
      const metadata = await sharp(path.join(root, `${symbol}${suffix}.png`)).metadata();
      return `${metadata.width}x${metadata.height}`;
    }),
  );
  assert(new Set(sizes).size === 1, `${symbol} PNG sizes differ: ${sizes.join(",")}`);
}

for (const symbol of spineSymbols) {
  const skeletonPath = path.join(root, `${symbol}.json`);
  assert(fs.existsSync(skeletonPath), `missing ${symbol}.json`);
  const skeleton = readJson(skeletonPath);
  assert(
    /^4\.3(?:\.|$)/u.test(skeleton.skeleton?.spine ?? ""),
    `${symbol} must be Spine 4.3.x`,
  );
  for (const spec of Object.values(manifest.symbols[symbol].animations ?? {})) {
    if (spec.kind !== "spine") continue;
    assert(spec.skeleton === `./${symbol}.json`, `${symbol} skeleton path mismatch`);
    assert(spec.atlas === "./Symbol.atlas", `${symbol} atlas path mismatch`);
    assert(spec.texture === "./Symbol.png", `${symbol} texture path mismatch`);
    assert(
      spec.playback?.animationName in (skeleton.animations ?? {}),
      `${symbol} missing animation ${spec.playback?.animationName}`,
    );
  }
}
assert(
  fs.readFileSync(path.join(root, "Symbol.atlas"), "utf8").split(/\r?\n/u)[0] ===
    "Symbol.png",
  "Spine atlas page must be Symbol.png",
);

const winRoot = path.join(root, "win-amount");
const winManifest = readJson(path.join(winRoot, "win-amount.manifest.json"));
const referenced = new Set();
for (const tier of winManifest.tiers ?? []) {
  const projectPath = path.join(winRoot, tier.project.replace(/^\.\//u, ""));
  assert(fs.existsSync(projectPath), `missing win project ${tier.project}`);
  const project = readJson(projectPath);
  for (const asset of project.assets ?? []) {
    assert(typeof asset.path === "string", `${tier.id} contains invalid asset path`);
    const relative = asset.path.replace(/^assets\//u, "");
    referenced.add(relative);
    assert(fs.existsSync(path.join(winRoot, "assets", relative)), `missing ${asset.path}`);
  }
}
const onDisk = fs
  .readdirSync(path.join(winRoot, "assets"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/iu.test(entry.name))
  .map((entry) => entry.name)
  .sort();
assert(
  JSON.stringify([...referenced].sort()) === JSON.stringify(onDisk),
  `win-amount asset closure differs; referenced=${[...referenced].sort()} disk=${onDisk}`,
);
console.log("game002-s3 resource closure OK");
NODE
```

边界 grep：

```bash
rg -n 'symbols001|symbols002|symbols003|game002-s1|game002-s2|game002/bgfull|assets/game003/bg' apps/game002
rg -n 'skin[ =](2|3|4|5)|"2"|"3"|"4"|"5"' apps/game002/src apps/game002/tests apps/game002/scripts apps/game002/README.md
rg -n 'spine38|3\.8|~4\.2|\^4\.2|supported versions.*4\.2' packages/rendercore packages/rendercore/package.json pnpm-lock.yaml
rg -n '@esotericsoftware/spine-pixi-v8' apps/game002 apps/symbolsviewer
rg -n 'game002-s3/\*\.(png|json)|game002-s3/\*\*' apps/game002 apps/symbolsviewer
```

预期：前四类旧引用无命中；Spine 包只在 rendercore；不出现 game002-s3 宽泛资源 glob。对于 JSON 测试数据中的普通数字 `2/3/4/5`，第二条 grep 需人工判读，不能机械删除业务数据。

### 7.2 目标包检查

```bash
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build

CI=true pnpm --filter @slotclientengine/gameloading test
CI=true pnpm --filter @slotclientengine/gameframeworks test

CI=true pnpm --filter game002 format:check
CI=true pnpm --filter game002 lint
CI=true pnpm --filter game002 test
CI=true pnpm --filter game002 typecheck
CI=true pnpm --filter game002 build
CI=true pnpm --filter game002 release:check

CI=true pnpm --filter symbolsviewer format:check
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
```

若依赖下载失败，设置代理后重试完全相同的命令。

### 7.3 全仓审计

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm build
CI=true pnpm test
git diff --check
cmp -s AGENTS.md agents.md
```

`game003` 仍携带 Spine 4.2 输入，而共享 runtime 已按用户决定只支持 4.3。不得为了让全仓 `pnpm test` 或 game003 用例变绿而恢复 4.2 fallback。处理规则：

1. game002/rendercore/symbolsviewer 目标门禁必须全部通过；
2. 全仓命令仍必须实际运行；
3. 如果失败只来自 game003 4.2 版本门禁，报告必须列出精确命令、测试名和错误，并标记为用户已知的后续资源迁移项；
4. 如果还有其它失败，必须修复任务引入的回归，不能全部归因于 game003；
5. 本任务不运行 `pnpm --filter game003 release:check`，也不声明 game003 可发布。

## 8. 浏览器和流程验收

启动：

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206 --strictPort
```

使用真实可用的 URL 参数，唯一 skin 示例：

```text
http://127.0.0.1:5206/?skin=1&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

人工验收：

- 首屏先显示 loading；99% 前无 game canvas，100% 后才进入游戏；Network 中只有一条 live WebSocket。
- 背景只来自 game002-s3；旧 skin URL 2-5 均显示明确错误，不跳到 skin 1。
- 13 个 symbol（包括 BN）normal 清晰；spin 时 blur/disabled 与新 130/170 尺寸对齐，无旧 200 图边界跳变。
- WL/H1/H2/L1-L4 的 Idle/Start/Win 可在 symbolsviewer 中按 manifest 预览；WM/CM/CO/AF/BN/CN 未声明的状态不伪造动画。
- 6 x 9 grid-cell reel 的本地公开轮带滚动、最终服务器 scene、dimming 和 stop 时序不回归。
- 普通中奖金额、big/super/mega 临时 VNI 资源可显示；点击推进、awaiting-dismiss、下一 spin 清理和 collect 边界正确。
- portrait、square、ultra-wide 下 background/focus/board 保持现有 s3 对齐。
- 控制台无资源 404、Spine parser warning、重复连接或未处理 Promise。

若执行环境无法使用真实 token/live server，必须通过 fixture 驱动的 adapter/integration 测试完成自动化流程验收，并把真实 WebSocket/视觉验收明确交给用户；报告不得把未执行的人工验收写成已通过。

## 9. 完成标准

只有同时满足以下条件才能声明任务完成：

- 用户提供的 game002-s3 资源完整保留并纳入版本控制；
- 13 组派生图/manifest 与 normal PNG 同步，BN 成为真实 symbol；
- manifest 动画元数据、Spine 4.3 runtime、game runtime 和 symbolsviewer 形成同一闭包；
- game002 只支持 skin=1，旧 skin 资源不再被 app 打包；
- loading、single live session、spin、win-amount、collect 和 destroy 流程通过目标测试；
- game002 release check 通过；
- rendercore/game002/symbolsviewer 的 format/lint/test/typecheck/build 全通过；
- 全仓检查已实际运行，game003 4.2 的已知例外被精确记录且没有被 fallback 掩盖；
- README、AGENTS.md、agents.md 已同步，两个 agents 文件字节一致；
- `git diff --check` 通过；
- 中文报告已按 UTC 命名并包含证据。

## 10. 最终任务报告要求

创建：

```bash
utctime=$(date -u +%y%m%d-%H%M%S)
```

报告路径：

```text
tasks/91-game002-s3-project-initialization-${utctime}.md
```

报告必须用中文，至少包含：

1. Git 基线同步前后 commit、用户输入资源保护情况；
2. normal/派生图逐 symbol 尺寸和实际更新清单；
3. 最终 manifest symbol 集合、scale、Spine animation 映射和排除资源；
4. 实际安装的 `@esotericsoftware/spine-pixi-v8` 版本与 lockfile 变化；
5. 删除的 3.8/4.2 兼容代码和新增 4.3 fail-fast 测试；
6. 单 skin 收口、旧资源引用清理、BN 语义变化；
7. loading 99%/100%、单 WebSocket、win-amount 临时资源及交互流程；
8. symbolsviewer、README、AGENTS.md/agents.md 同步；
9. 每条验收命令、退出码和结果摘要；
10. 全仓检查中 game003 4.2 的精确已知失败（若有），不能只写“非本任务问题”；
11. 浏览器/真实 live 是否执行，未执行项的 handoff；
12. `git status --short`、`git diff --stat`、`git diff --check` 最终结果；
13. 遗留风险和后续 game003 4.3 资源迁移事项。

## 11. 二次遗漏审计

提交报告前按以下七类再次审计：

- **目标树**：game002 源码、测试、README、release check、package scripts 中无旧 skin import/分支；旧共享资产未被误删。
- **资源/协议**：13 个 manifest symbol、BN、Spine 4.3、atlas、win-amount、loading 闭包完整；live/query/local reel 合同未被改写。
- **状态/逻辑**：grid-cell reel、manifest resolver、win-amount blocking/awaiting-dismiss、single live session 和 destroy 时序有测试。
- **共享边界**：rendercore 拥有 manifest/Spine/win-amount；gameloading 拥有加载调度；app 不复制共享算法。
- **消费者**：game002 runtime、symbolsviewer、release check、README、AGENTS.md/agents.md 同步，没有只改一处。
- **验收**：目标包命令全通过；全仓命令已实际执行；game003 例外不被兜底，也不被冒充为全仓通过。
- **报告/清理**：UTC 文件名正确；无 `/tmp`、dist、coverage、`.turbo` 被误提交；`git diff --check` 和 agents 文件一致性通过。

任何一项不满足，都不能写“任务完成”。
