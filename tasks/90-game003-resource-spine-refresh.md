# game003 resource and Spine refresh 任务计划

## 1. 任务目标

本任务初始化并完成 `game003-s1` 新一轮美术资源接入，覆盖三条互相关联但必须分别验收的资源链：

1. 主转轮 symbol 基础 PNG 与派生的 `spinBlur` / `disabled` PNG；
2. `bigwin` / `superwin` / `megawin` 中奖金额 VNI project JSON 及其 `assets/`；
3. 从 Spine 3.8.99 重新导出为 Spine 4.2.43 的 symbol skeleton、atlas 和 texture，以及 rendercore 的官方 Spine runtime 接入。

本计划是完整可执行版本，不能依赖聊天记录、旧任务计划或执行者的口头背景。执行者只阅读本文件即可完成现状盘点、实现、测试、生成物同步、发布验收、文档/协作规则同步和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/90-game003-resource-spine-refresh-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/90-game003-resource-spine-refresh-260711-181300.md
```

## 2. 已确认的当前输入和结论

以下内容是制定本计划时对当前工作区的实际盘点。执行任务时必须重新运行第 4 节命令确认，不能只引用本节快照。

### 2.1 当前 Git 资源变更

当前未提交变更包括：

- 16 个 Spine skeleton JSON：`BN,CL,CN,ES,H1,H2,H3,H4,H5,MP2,RS,Reel_NearWin,SC,UP,UPCN,WL`；
- `assets/game003-s1/Symbol.atlas`；
- `assets/game003-s1/Symbol.png`；
- `assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json`；
- 12 个新增的 win-amount PNG assets。

这些是用户提供的美术输入，实施时不得为了迁就 parser 或旧测试去手改 skeleton、atlas、texture、VNI JSON 或图片内容，也不得回滚用户改动。

### 2.2 symbol PNG 和派生图结论

当前 Git 工作区中基础 symbol PNG 不在未提交 diff 内。最近一次已提交资源更新已经：

- 更新 `WL,H1,H2,H3,H4,H5,CO,CL,SC.png`；
- 删除 `H1-H5.jpg`；
- 同步更新上述 symbol 的 `spinBlur` / `disabled`。

制定计划时使用当前 rendercore generator 在临时目录重新生成全部 14 个 display symbol 的 28 张派生图，并逐文件比较 SHA-256，结果全部一致：

```text
WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC
  *.spinBlur.png  MATCH
  *.disabled.png  MATCH
```

因此按当前输入，本任务不应该产生 `spinBlur` / `disabled` 二进制变更。实施时仍须重新验证；只有基础 PNG 在执行期间又发生变化且 generator 结果确实不同，才提交对应派生图。禁止为了“看起来做过更新”制造无意义二进制 churn。

### 2.3 Spine 资源结论

当前 16 个新 skeleton JSON 均声明：

```text
spine = 4.2.43
```

当前 game003-s1 主转轮真正接入 Spine 的 display symbols 仍只允许：

```text
WL,H1,H2,H3,H4,H5,CL,SC
```

它们的当前 animation names 为：

```text
WL: Feature,Feature_Change,Feature_End,Feature_Idle,Idle,Loop,start,Win
H1: Feature,Feature_Change,Feature_End,Feature_Idle,Idle,Loop,Start,Win
H2: Idle,Win
H3: Idle,Win
H4: Idle,Win
H5: Idle,Win
CL: Collect_End,Collect_Loop,Collect_Start,Idle,Loop,Start,Win
SC: Idle,Loop,Nearwin,Start,Win
```

现有 manifest 合同继续保持：

- `WL,H1,H2,H3,H4,H5,CL,SC.normal` 使用 exact `Idle`；
- `WL,H1,H2,H3,H4,H5,CL,SC.win` 使用 exact `Win`；
- `WL.appear` 使用 lowercase `start`；
- `H1,CL,SC.appear` 使用 uppercase `Start`；
- `H2-H5` 没有 `Start/start`，manifest 不新增伪 `static` / `builtin` appear，仍走已有的“该 symbol 自身 normal Spine once 完成”合同；
- `BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN` 仍不加入 display set、manifest、YAML Spine glob、loading 主转轮 Spine 组或 symbolsviewer game003-s1 展示集合。

新 atlas 使用 Spine 4.2 格式，例如 `bounds:` 和 `rotate:90`。当前 `packages/rendercore/src/symbol/manifest.ts` 在所有版本上无条件调用旧的 `parseSpineAtlasText()` / `validateSpine38SkeletonContract()`，因此现有测试会在 `BN.xy` 上显式失败。

当前依赖是：

```text
@esotericsoftware/spine-pixi-v8 = 4.3.9
```

官方 Spine 版本规则要求 Editor/export 与 runtime 的 major.minor 一致。4.2.43 export 必须使用 4.2.x runtime，不能因为两者都叫“4.x”就视为兼容。官方依据：

```text
https://en.esotericsoftware.com/spine-versioning
https://esotericsoftware.com/spine-pixi
```

因此本任务的硬前置是：把 rendercore 的官方 runtime 锁定到 4.2.x，并让 manifest 预校验按 skeleton 版本选择正确 parser。不能扩展 3.8 手写 parser 去模拟 4.2 全部特性，也不能用 builtin/static/default fallback 吞掉错误。

### 2.4 win-amount 资源结论

当前三个 VNI project 均保持：

```text
stage = 900 x 1600
duration = 2.9
```

当前 `win-amount.manifest.json` 仍保持唯一时间合同：

```text
durationSeconds = 2.9
loopStartTime = 1
loopEndTime = 2.5
```

三个 project 当前共引用 30 个唯一 asset basename，引用文件全部存在，且不同 tier 间没有 basename 冲突。当前 rendercore win-amount 专属测试为 17/17 通过，说明本轮 VNI JSON 暂未要求新增 vnicore/runtime 语义。

但是 `assets/game003-s1/win-amount/assets/` 里还有 8 个已不被任何 project 引用的旧文件：

```text
1_asset_image_mr8vgcru_1i.png
1_asset_image_mr8whgiu_1r.png
2_asset_image_mr8vt3bd_1l.png
a1_asset_image_mrae2ges_2h.png
big_asset_image_mr4s4la3_w.png
mega_asset_image_mrae66wt_37.png
win2_asset_image_mr4s4o3o_y.png
win3_asset_image_mrae4kox_2n.png
```

YAML 的 asset glob 会打包目录下所有匹配文件，所以这些 orphan 不能继续保留。实施时应在重新盘点确认后删除，并增加“磁盘文件集合等于三个 project 引用集合”的显式校验，避免后续旧资源再次混入 loading/dist。

## 3. 仓库、工具链和执行原则

仓库根目录：

```text
/Users/zerro/github.com/minecart2
```

工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm >=10`
- monorepo：pnpm workspace + turbo
- 构建：Vite / TypeScript
- 测试：Vitest
- lint：ESLint
- format：Prettier

开始执行：

```bash
cd /Users/zerro/github.com/minecart2
node --version
pnpm --version
git status --short --untracked-files=all
git diff --stat
git diff --name-status -- assets/game003-s1 packages/rendercore apps/game003 apps/symbolsviewer apps/buildgamestatic packages/gameframeworks AGENTS.md
```

不要回滚或覆盖用户已有改动，不要清理与本任务无关的脏工作区。

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

然后重试原命令。不要在没有真实下载失败时改全局 pnpm/npm 配置。

非 TTY 环境若出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，用同一命令加 `CI=true` 重试，不要因此修改生产逻辑或降低验收标准。

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。尤其不得为了保留“Spine 3.8 当前美术资源”这类旧断言而篡改 4.2 资源或增加隐式兼容分支。

本任务要求显式失败，不做不必要兜底。有些逻辑 bug 越早暴露越好。未知 Spine 版本、runtime major.minor 不匹配、atlas page/region 错误、animation name 不存在、VNI asset 缺失/重复/orphan、生成物漂移都必须报错。

## 4. 实施前必须重新盘点

### 4.1 Git 和文件集合

```bash
git status --short --untracked-files=all
git diff --name-status -- assets/game003-s1
git diff -- assets/game003-s1/Symbol.atlas
git diff -- packages/rendercore/package.json pnpm-lock.yaml
find assets/game003-s1 -maxdepth 1 -type f \( -name '*.jpg' -o -name '*.jpeg' \) -print | sort
```

验收：

- `H1-H5.jpg` / `.jpeg` 不存在；
- `bg1.jpg` / `bg2.jpg` 是背景，不属于 symbol JPG 删除范围；
- 用户提供的资源变更没有被回滚、格式化或手工修补。

### 4.2 symbol 基础图和派生图

先确认 14 个 display symbol 的 normal/spinBlur/disabled 均存在：

```bash
node -e 'const fs=require("fs"); const root="assets/game003-s1"; const symbols="WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC".split(","); for (const s of symbols) for (const suffix of [".png",".spinBlur.png",".disabled.png"]) if (!fs.existsSync(`${root}/${s}${suffix}`)) throw new Error(`missing ${s}${suffix}`);'
```

在 `/tmp` 复制 normal PNG、现有派生图和 manifest，运行当前 generator，再逐文件比较 SHA-256。不要用工作区输出完成“是否需要更新”的判断，以免还没确认就污染用户资源。

如果 28 张派生图全部匹配：

- 不提交任何 `spinBlur` / `disabled` 变更；
- 报告写明当前派生图已同步，无需更新。

如果有差异：

- 先确认对应 normal PNG 本轮确实变化；
- 再在工作区执行第 6.1 节生成命令；
- 只保留有真实输入变化的派生图；
- generator 必须保留 manifest 的 `animations`、`renderPriority`、`scale`、`states`、`settings`。

### 4.3 Spine 版本、动画和 atlas

```bash
node - <<'NODE'
const fs = require('fs');
const symbols = ['BN','CL','CN','ES','H1','H2','H3','H4','H5','MP2','RS','Reel_NearWin','SC','UP','UPCN','WL'];
for (const symbol of symbols) {
  const json = JSON.parse(fs.readFileSync(`assets/game003-s1/${symbol}.json`, 'utf8'));
  console.log(symbol, json.skeleton?.spine, Object.keys(json.animations ?? {}).join(','));
  if (json.skeleton?.spine !== '4.2.43') throw new Error(`${symbol} must be Spine 4.2.43`);
}
NODE

rg -n '^(Symbol\.png|size:|bounds:|rotate:)' assets/game003-s1/Symbol.atlas
rg -n '"spine"\s*:\s*"3\.8\.99"|current.*3\.8|当前.*3\.8' packages/rendercore apps/game003 apps/symbolsviewer AGENTS.md --glob '!**/dist/**'
```

旧任务报告可以描述历史 3.8 输入；当前生产文档、当前测试名和当前资源断言不能继续把 game003-s1 写成 3.8。

### 4.4 win-amount 引用闭包

写一个只读 Node 检查或补成正式测试，必须验证：

- `bigwin/superwin/megawin.json` 可解析；
- `stage.width=900`、`stage.height=1600`、`stage.duration=2.9`；
- 每个 `assets[].path` 以 `assets/` 开头并且目标存在；
- project 内、跨 project 都没有重复 basename；
- `assets/` 目录内所有 `png/jpg/jpeg/webp` 都至少被一个 project 引用；
- 磁盘资源集合与引用资源集合完全相等。

当前预期是 30 个唯一引用、8 个 orphan。若执行时集合变化，以重新盘点结果为准，在报告中列出最终删除的 orphan，不能照抄旧名单误删新输入。

## 5. 必须阅读和维护的实现面

至少阅读：

```text
AGENTS.md
assets/game003-s1/symbol-state-textures.manifest.json
assets/game003-s1/win-amount/win-amount.manifest.json
assets/game003-s1/{WL,H1,H2,H3,H4,H5,CL,SC}.json
assets/game003-s1/Symbol.atlas
packages/rendercore/package.json
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol/spine38-runtime.ts
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/spine-animation.test.ts
packages/rendercore/tests/symbol/spine38-runtime.test.ts
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/tests/symbol/texture-variants.test.ts
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/tests/win-amount/*.test.ts
packages/rendercore/README.md
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
apps/game003/src/skin-config.ts
apps/game003/src/loading-resources.ts
apps/game003/tests/assets.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/scripts/verify-static-dist.mjs
apps/game003/README.md
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/README.md
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/src/yaml-loader.ts
```

`apps/game003/src/generated/game-static.generated.ts` 和 `game-loading.generated.ts` 由 buildgamestatic 生成，禁止手改。

## 6. 实现计划

### 6.1 symbol 派生图：只在真实不一致时更新

标准生成命令：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
```

执行后检查：

```bash
git diff --name-status -- assets/game003-s1
git diff -- assets/game003-s1/symbol-state-textures.manifest.json
```

边界：

- 不恢复任何 symbol JPG；
- 不扩展 generator/runtime 支持 JPG normal symbol；
- 不把 `bg1/bg2/mainreelbg/conveyor/minecart/wild/up/Symbol.png` 或 win-amount assets 纳入 display symbol catalog；
- 不因 generator 的旧测试期望而丢掉手写 manifest metadata。

### 6.2 将官方 Spine runtime 对齐到 4.2.x

`packages/rendercore` 是唯一允许直接依赖官方 Spine runtime 的包。`apps/game003` 和 `apps/symbolsviewer` 继续只使用 rendercore public API。

在仓库根目录执行：

```bash
CI=true pnpm --filter @slotclientengine/rendercore add @esotericsoftware/spine-pixi-v8@~4.2.0
```

要求：

- `packages/rendercore/package.json` 使用不会跨到 4.3 的 4.2 semver 范围；禁止 `^4.2.0`；
- `pnpm-lock.yaml` 解析出的 `spine-pixi-v8`、`spine-core`、`spine-canvas` 必须同属 4.2.x；
- 报告记录最终解析的精确 patch 版本；
- 若下载失败，按第 3 节代理重试；
- 不在 app/viewer 增加第二份 runtime 依赖。

### 6.3 按 skeleton 版本分派 parser/player，并显式拒绝错配

修改 `packages/rendercore/src/symbol/manifest.ts`、`spine-animation.ts`，必要时新增 rendercore 内部版本分类/helper：

1. 先严格读取并分类 `skeleton.spine`，不能用 `try/catch -> false -> official runtime` 把 malformed/unknown skeleton 当作 4.x。
2. 现有 3.8 adapter 和其独立测试保留，避免破坏仍可能使用 3.8 fixture 的共享能力；3.8 资源继续走 `Spine38SymbolPlayer`。
3. 4.2 skeleton 必须走 4.2 official `TextureAtlas`、`SkeletonJson`、`AtlasAttachmentLoader` 和 `Spine`，预校验与实际播放使用同一格式语义。
4. 4.2 atlas 必须支持官方 `bounds:`、`rotate:90`、mesh、clipping、blend 等资源实际使用的特性，不要把 3.8 atlas parser 扩成另一套不完整 4.2 runtime。
5. manifest 创建阶段继续 fail-fast 校验：atlas 只有预期 page、page name 与 `Symbol.png` 一致、skeleton attachment region 在 atlas 中存在、exact animation name 存在。
6. runtime 初始化阶段的错误必须保留 symbol/state/version 上下文；禁止退回 builtin/static/normal 来隐藏资源或版本错误。
7. official player 仍挂在现有 Pixi display tree，保持 cache/reuse、once complete、reset、destroy 生命周期；app/viewer 不直接操作 Spine 私有对象。
8. 若未来遇到非 3.8、非 4.2 skeleton，默认显式报“unsupported Spine version”，不猜测兼容。

不要删除 `spine38-runtime.ts` 只是为了让新测试变简单；也不要继续让名为 `Spine 3.8` 的测试直接读取当前 4.2 game003 美术资源。正确做法是：

- 3.8 adapter 测试使用稳定、最小、测试本地的 3.8 fixture；
- 4.2 官方路径测试读取当前 game003-s1 资源或使用字节一致的测试 fixture；
- 测试需要旧输入时修改 fixture/断言，不修改用户提交的 4.2 美术资源。

### 6.4 同步 manifest、game003、symbolsviewer 和发布校验

`symbol-state-textures.manifest.json` 的 display set 和状态合同原则上不变。只有实际 animation duration 或资源合同变化才调整字段；animation name 必须来自当前 JSON，不凭旧计划猜测。

更新测试和文档：

- `packages/rendercore/tests/symbol/manifest.test.ts`：覆盖真实 4.2 atlas/skeleton 预校验、exact animation names、缺 animation、错 page/texture、unsupported version；
- `packages/rendercore/tests/symbol/spine-animation.test.ts`：覆盖 official 4.2 player init/play/update/reset/destroy 和 once completion；
- `packages/rendercore/tests/symbol/spine38-runtime.test.ts`：改名/fixture 语义，使其只验证 3.8 adapter，不再声称当前 game003 是 3.8；
- `apps/game003/tests/assets.test.ts`、`static-config.test.ts`：继续验证 8 个 display Spine symbols 和 manifest 状态；
- `apps/symbolsviewer/tests/symbol-set-config.test.ts`：继续验证同一 8 个 skeleton、一个 atlas、一个 texture，不复制 parser；
- `apps/game003/scripts/verify-static-dist.mjs`：验证 source skeleton version 为 4.2.43、source atlas 为可解析的 4.2 格式、8 个 skeleton/atlas/texture 均按 source hash 进入 dist；
- `apps/game003/README.md`、`apps/symbolsviewer/README.md`、`packages/rendercore/README.md`：把“当前 game003 3.8”改成“当前 game003 4.2.43，官方 runtime major.minor 必须匹配”；保留 3.8 adapter 仅作为共享历史能力说明时，要明确它不是当前 game003 路径。

YAML 继续保持窄 glob：

```text
assets/game003-s1/{WL,H1,H2,H3,H4,H5,CL,SC}.json
```

禁止改成 `*.json` 或把 8 个非 display skeleton 静默接入。

### 6.5 清理并封闭 win-amount asset 集合

重新运行第 4.4 节盘点后：

1. 删除所有不被三个 project 引用的 orphan assets；当前预期删除第 2.4 节列出的 8 个文件。
2. 保留并提交三个 project 实际引用的新增 assets；不能仅因为文件名看起来临时就重命名，VNI JSON path 是合同。
3. `win-amount.manifest.json` 继续是 tier 和 segmented 时间的唯一来源。当前 project duration 未变，所以不要新建第二份时间表，也不要无依据修改 `2.9/1/2.5`。
4. 在 `packages/rendercore/tests/win-amount/*` 或 `apps/game003/tests/loading-resources.test.ts` 增加 exact closure 校验：磁盘 asset basename 集合必须等于三个 project 的引用集合，而不只是“所有引用都存在”。
5. `apps/game003/scripts/verify-static-dist.mjs` 同步校验：每个 referenced asset 以 source hash 进入 dist，并且 source 目录不存在 orphan；dist/loading 不应包含已删除旧文件。
6. 若新版 VNI JSON 触发 vnicore 的未知合法 schema，先对照当前 VNI export/runtime 合同定位；只有确实是新版合法导出能力才改 vnicore。当前专属测试已通过，不能借资源刷新顺便重构 VNI runtime。

### 6.6 生成静态配置

资源 glob 和 manifest path 理论上不变，但必须重新生成并检查，以保证新资源集合、依赖和测试没有造成漂移：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
git diff -- apps/game003/src/generated/game-static.generated.ts apps/game003/src/generated/game-loading.generated.ts
```

若 generated TS 变化，必须确认来自 generator 和当前 YAML，禁止手改。若只删除/新增 glob 匹配文件但生成源码保持不变，这是合理结果，报告说明运行时 glob 展开集合已由测试覆盖。

### 6.7 更新 AGENTS.md

本任务需要更新根 `AGENTS.md`，因为当前资源版本和运行时硬约束已成为后续协作规则。至少补充：

- game003-s1 当前 display Spine skeleton 为 4.2.43；
- `packages/rendercore` 官方 Spine runtime major.minor 必须与资源一致并锁在 4.2.x，不能用可跨 minor 的 semver；
- 4.2 走官方 runtime，3.8 内部 adapter 不得被 app/viewer 直接使用；
- 未支持/错配版本、atlas/skeleton/animation 错误显式失败；
- 8 个非 display skeleton 不因共用 atlas 或宽泛 glob 自动接入。

不要把本次临时文件名清单或一次性测试结果写成长期规则。

## 7. 验收命令

### 7.1 资源和边界检查

```bash
git status --short --untracked-files=all
git diff --name-status -- assets/game003-s1 packages/rendercore apps/game003 apps/symbolsviewer AGENTS.md pnpm-lock.yaml
test ! -e assets/game003-s1/H1.jpg
test ! -e assets/game003-s1/H2.jpg
test ! -e assets/game003-s1/H3.jpg
test ! -e assets/game003-s1/H4.jpg
test ! -e assets/game003-s1/H5.jpg
rg -n '"spine"\s*:\s*"4\.2\.43"' assets/game003-s1/{WL,H1,H2,H3,H4,H5,CL,SC}.json
rg -n '@esotericsoftware/spine-pixi-v8' packages/rendercore/package.json pnpm-lock.yaml
rg -n 'spineSkeletonGlob: assets/game003-s1/\{WL,H1,H2,H3,H4,H5,CL,SC\}\.json' apps/game003/config/game-static.yaml
```

对 win-amount 运行第 4.4 节 exact closure 检查，最终必须是：

```text
missing = 0
duplicate basename = 0
orphan = 0
disk asset count = referenced unique asset count
```

### 7.2 包级测试

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter game003 test
```

当前基线失败必须消失：

```text
Invalid Spine atlas: missing BN.xy
```

不能通过跳过测试、删除 Spine manifest entries 或 mock 掉资源解析来消除失败。

### 7.3 lint、类型、构建和发布

```bash
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 release:check
```

### 7.4 格式和 root 回归

```bash
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter buildgamestatic format:check
CI=true pnpm --filter symbolsviewer format:check
CI=true pnpm --filter game003 format:check
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
git diff --check
```

先保证全部任务范围命令通过，再判断 root 失败。若 root 命令被明确无关的既有问题阻塞，报告必须写出失败命令、首个错误、与本任务无关的证据；不能用“root 有问题”掩盖任何任务范围失败。

### 7.5 最终搜索

```bash
rg -n 'current.*3\.8|当前.*3\.8|spine=3\.8\.99|Spine 3\.8\.99' packages/rendercore apps/game003 apps/symbolsviewer AGENTS.md --glob '!**/dist/**'
rg -n "H[1-5]\\.jpe?g|normal:\\s*['\"]\\./H[1-5]\\.jpe?g" apps packages assets/game003-s1 AGENTS.md --glob '!**/dist/**'
rg -n 'assets/game003-s1/\*\.json|spineSkeletonGlob:.*\*\.json' apps/game003 apps/buildgamestatic
rg -n '\b(BN|CN|ES|MP2|RS|Reel_NearWin|UP|UPCN)\b' apps/game003 apps/symbolsviewer assets/game003-s1/symbol-state-textures.manifest.json --glob '!**/dist/**'
```

说明：历史任务文档可保留当时事实，不要求篡改历史；生产代码、当前 README、当前测试和 AGENTS.md 不得继续宣称 game003 当前走 3.8。第四条允许在 source-boundary 测试的“禁止集合”中命中，不能在 display set、YAML、generated 配置或 resolver 专属接入中命中。

## 8. 验收标准

任务完成必须同时满足：

- 14 个 display symbol 的 normal/spinBlur/disabled 完整；派生图只在 generator 确认不一致时更新，当前预期零变更。
- `H1-H5.jpg/jpeg` 不存在，runtime、测试、README、generated 和 dist 不引用 symbol JPG。
- 16 个新 skeleton、atlas、texture 保持用户输入不被手改；当前版本统一为 4.2.43。
- rendercore 官方 Spine runtime 锁定在 4.2.x，所有 transitive Spine packages major.minor 对齐，`pnpm-lock.yaml` 同步。
- manifest 预校验不再无条件使用 3.8 parser；3.8 与 4.2 有明确、可测试、fail-fast 的版本分派。
- 4.2 atlas 的 `bounds/rotate:90`、mesh、clipping 和 exact animation names 能由 official runtime 解析播放。
- `WL,H1,H2,H3,H4,H5,CL,SC` 继续是唯一 display Spine 集合；`H2-H5` 缺 appear 时只走自身 normal Spine 合同，不新增伪状态。
- `BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN` 不被宽泛 glob、manifest、viewer 或 app 静默接入。
- win-amount 三个 project 仍满足 `900x1600`、`duration=2.9`；manifest 仍是 `2.9/1/2.5` 唯一时间来源。
- win-amount 30 个引用资源全部存在、无重复，source assets 目录没有 orphan；loading/dist 只包含实际引用集合。
- `game-static.generated.ts` / `game-loading.generated.ts` 由命令生成并通过 `check:static-config`。
- symbolsviewer 和 game003 使用同一个 rendercore Spine resolver，不复制 parser/runtime。
- `release:check` 校验当前 Spine 资源和 win-amount 引用闭包的 source/dist 一致性。
- 第 7 节任务范围命令全部通过，root 回归结果有完整记录。
- `AGENTS.md` 和三个当前 README 已同步真实合同。

## 9. 第二遍遗漏审计

交付前必须逐项复查，不得只以测试变绿作为完成依据。

### 9.1 资源

- 重新查看完整 `git status`，确认没有覆盖用户资源或夹带无关文件。
- 检查派生图 SHA-256；当前输入一致时确认没有二进制 churn。
- 检查 16 个 skeleton 版本、8 个 display skeleton exact animation names、atlas page 和 texture 尺寸。
- 检查 win-amount asset exact closure，确认删除的是 orphan，不是仍被引用的文件。
- 检查新增 12 个 PNG 是否全部至少被一个 project 引用。

### 9.2 代码和依赖边界

- `@esotericsoftware/spine-pixi-v8` 只在 rendercore 直接依赖。
- package semver 不允许自动跨到 4.3；lockfile 里不存在因本任务遗留的 4.3 Spine core/canvas。
- 版本分类遇到 malformed/unknown 时显式失败，不通过 catch 误分到 official player。
- 3.8 adapter 的 fixture 和 4.2 game003 fixture 已分开，测试名称不再混淆当前合同。
- app/viewer 没有 symbol code 专属 parser、atlas 分支或 Spine 私有 display tree 操作。
- H2-H5 normal fallback 没有扩大成缺资源/错 animation 的通用兜底。

### 9.3 配置、生成物和 side consumers

- YAML Spine glob 仍只含 8 个 display skeleton。
- symbol manifest 保留 `scale`、`renderPriority`、`animations`；`WL/CL/SC.renderPriority=1` 未丢失。
- `CO`、`L1-L5`、bg-bar、minecart、reel、本地公开轮带和 live 协议均未误改。
- generated TS 没有手改，`check:static-config` 通过。
- symbolsviewer、game003 tests、loading tests、source-boundary 和 `verify-static-dist.mjs` 都覆盖新合同。
- README 与 AGENTS.md 不再描述当前 game003 为 3.8。

### 9.4 验收和报告

- 保存第 7 节每条命令的结果，失败项必须分类为任务内失败或有证据的无关既有失败。
- 不把浏览器视觉检查冒充自动化证据；如需要人工视觉验收，在报告中列为待执行 handoff。
- 执行 `git diff --check`。
- 报告文件名使用实际 UTC，不使用本地时间或示例时间。

## 10. 任务报告要求

报告必须包含：

- 执行开始和结束时的 Git 状态摘要；
- symbol 基础图/JPG/派生图结论，列出是否生成及 SHA-256 比较结果；
- Spine 资源版本、8 个 display 集合、8 个明确不接入集合、exact animation name 结论；
- official Spine runtime 最终精确版本、package semver、lockfile 变化和版本分派实现；
- win-amount 三个 project 的 stage/duration/asset 数量、最终唯一引用数、删除 orphan 列表；
- 修改文件清单，按资源、rendercore、game003、symbolsviewer、tests、docs、AGENTS 分类；
- static config/generated/dist 同步结果；
- 第 7 节每条命令的通过/失败结果；
- 是否使用 `CI=true`、是否使用代理、依赖下载是否重试；
- root 回归若失败，写明首个错误和范围判断证据；
- 人工浏览器视觉验收是否待用户执行；
- 第二遍遗漏审计结论和残留风险。

## 11. 非目标

- 不把 8 个非 display Spine skeleton 接入主转轮或 symbolsviewer display set。
- 不修改 gameconfig、服务器 scene、本地公开轮带、live server、`gamecode`、URL query 或协议。
- 不修改 `bg-bar`、minecart、中奖结果循环、中奖金额点击语义或 reel 节奏。
- 不恢复 symbol JPG，不扩展通用 generator/runtime 支持 JPG normal symbol。
- 不把 4.2 能力复制进 3.8 手写 adapter，不在 app/viewer 新建 Spine parser/runtime。
- 不通过 builtin/static/default/normal 隐式兜底掩盖 Spine 版本、资源或 animation 错误。
- 不修改 VNI `2.9/1/2.5` 时间合同，除非执行时新 project 的实际 stage duration 已再次变化且有明确输入证据。
- 不借资源刷新重构无关 rendercore/vnicore/game003 逻辑。
