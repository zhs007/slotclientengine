# symbolsviewer symbols003 gamecfg002 任务计划

## 1. 任务目标

更新 `apps/symbolsviewer`，在已有两套 symbol set 的基础上新增第三套图标展示能力：

```text
/Users/zerro/github.com/slotclientengine/assets/symbols003
```

第三套图标的 runtime game config 直接复用第二套配置：

```text
assets/gamecfg002/gameconfig.json
```

`assets/gamecfg002/gameconfig.json` 由下面两个 Excel 生成：

```text
assets/gamecfg002/paytables.xlsx
assets/gamecfg002/reels-001.xlsx
```

本任务不新增 `assets/gamecfg003`，也不复制一份 `gameconfig.json` 到 `assets/symbols003`。本任务需要生成第三套图标自己的派生图片和状态贴图 JSON：

```text
assets/symbols003/*.spinBlur.png
assets/symbols003/*.disabled.png
assets/symbols003/symbol-state-textures.manifest.json
```

用户需求里写了“第二套图标状态要求如下”，结合上下文“我新加了一个 symbols003，是第三套游戏图标”理解为本任务新增的第三套 `symbols003` 的状态要求；现有 `symbols002` 不是本任务的资产刷新目标。

第三套 `symbols003` 状态合同：

- `spinBlur`：稳定态，循环/静态，纵向模糊，和前面一套一致。
- `normal`：稳定态，循环/静态，普通图，无特殊效果，和前面一套一致。
- `appear`：单次，普通状态图片后方额外叠一层普通状态图片副本，副本半透明并放大后消退；主普通图不能被整体缩放代替。
- `win`：单次，闪光，和前面一套一致。
- `disabled`：稳定态，循环/静态，灰度，和前面一套一致。

核心交付：

- 为 `assets/symbols003` 生成完整派生状态图片：
  - `*.spinBlur.png`
  - `*.disabled.png`
- 为 `assets/symbols003` 生成完整状态贴图 manifest：
  - `assets/symbols003/symbol-state-textures.manifest.json`
- 验证或重新生成 `assets/gamecfg002/gameconfig.json`，确保第三套直接消费该 runtime config。
- `apps/symbolsviewer` 增加第三套可选 symbol set：
  - 第一套：`symbols`，来自 `assets/symbols` + `assets/gamecfg/game2.json`
  - 第二套：`symbols002`，来自 `assets/symbols002` + `assets/gamecfg002/gameconfig.json`
  - 第三套：`symbols003`，来自 `assets/symbols003` + `assets/gamecfg002/gameconfig.json`
- `symbolsviewer` 顶部 `Set` selector 可以选择 `symbols003` 渲染；切换时不能残留上一套 symbol、状态面板或 Pixi 对象。
- 更新测试和 README，确保第三套资源、缺图项、动画合同和生成命令都有可验收记录。
- 保持 fail-fast：不加隐藏 fallback，不自动用 `symbols002` 的图补 `symbols003`，不生成 placeholder，不在 manifest 或状态图缺失时静默降级。
- 若实现新增长期协作规则、目录规范或基础脚本约定，必须同步更新根目录 `agents.md`；否则在任务报告中说明无需更新。
- 任务完成后新增中文任务报告：

```text
tasks/56-symbolsviewer-symbols003-gamecfg002-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/56-symbolsviewer-symbols003-gamecfg002-260626-123456.md
```

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、资源生成、代码实现、测试、文档、协作规则同步判断和最终报告。

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

本任务原则上不需要新增 npm 依赖。`packages/rendercore` 已有状态图生成脚本和 `sharp` devDependency。若确实需要新增依赖，必须执行：

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

若本任务只是新增 `symbols003` 资源派生物、viewer 配置、测试和 README，通常不需要更新 `agents.md`。如果实现中新增了长期协作规则、目录规范或基础脚本约定，必须同步更新 `agents.md`，并在任务报告中说明原因。

## 3. 当前已知事实

### 3.1 symbolsviewer 当前结构

主要实现文件：

```text
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/symbol-animation-config.ts
apps/symbolsviewer/src/viewer-sequence.ts
apps/symbolsviewer/src/styles.css
apps/symbolsviewer/README.md
```

主要测试文件：

```text
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
```

当前 `apps/symbolsviewer/src/symbol-set-config.ts` 已有两套 set：

```text
symbols
symbols002
```

当前 `apps/symbolsviewer/src/main.ts` 已有顶部 `Set` selector，并且切换 set 时会重新创建 catalog、Pixi symbol、状态序列和状态面板。因此本任务应该沿用现有配置驱动结构，新增第三套配置；不要为了新增 `symbols003` 重写 viewer 交互。

当前 `apps/symbolsviewer/src/symbol-animation-config.ts` 已有 `singleSpriteUnderlayScale` 风格的 appear 配置，`symbols002` 正在使用它：

```text
appear -> singleSpriteUnderlayScale(maxScale: 1.6, maxAlpha: 0.4)
```

`packages/rendercore/src/symbol/named-animations.ts` 已有 `singleSpriteUnderlayScale` 实现。该效果会：

- 要求 symbol 是单图 symbol。
- 保持主普通图 scale 为 `1`。
- 在 underlay layer 中创建同一张普通图的半透明副本。
- 副本随进度放大到 `maxScale` 并按 `maxAlpha` 淡入淡出。
- 播放结束后清空 underlay，避免残留。

这正好匹配本任务的 `appear` 合同，因此优先复用该 effect；不要在 `apps/symbolsviewer` 里手写 Pixi 动画状态机或直接操作 runtime 私有对象。

### 3.2 gamecfg002 当前合同

第三套 `symbols003` 直接使用：

```text
assets/gamecfg002/gameconfig.json
```

当前 `assets/gamecfg002/gameconfig.json` 的 symbol code 顺序为：

```text
WL=0, H1=1, H2=2, L1=3, L2=4, L3=5, L4=6, WM=7, CN=8, CM=9, CO=10, AF=11, BN=12
```

当前 reel 名称：

```text
reels-001
```

如果执行时发现 `assets/gamecfg002/paytables.xlsx` 或 `assets/gamecfg002/reels-001.xlsx` 已变化，必须重新生成并验证 `assets/gamecfg002/gameconfig.json`：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

生成结果必须能被 `logiccore.createGameConfig(...)` 消费，且第三套 viewer 不得绕过 `gameconfig.json` 直接解析 Excel。

### 3.3 symbols003 当前资源盘点

当前第三套目录：

```text
assets/symbols003
```

当前已观察到的普通 PNG：

```text
assets/symbols003/CN.png
assets/symbols003/CO.png
assets/symbols003/H1.png
assets/symbols003/H2.png
assets/symbols003/L1.png
assets/symbols003/L2.png
assets/symbols003/L3.png
assets/symbols003/L4.png
assets/symbols003/WL.png
```

当前这些 PNG 均为 `180 x 180`，RGBA。

按 `gamecfg002` 的 paytable 顺序，当前 `symbols003` 可展示 symbol 预期为：

```text
WL, H1, H2, L1, L2, L3, L4, CN, CO
```

当前 `gamecfg002` paytable 中有但 `symbols003` 缺图的 symbol：

```text
WM, CM, AF, BN
```

这些缺图项不能用 placeholder、第二套图片、空纹理或普通 fallback 替代。`symbolsviewer` 的 catalog validation 应显式把它们记录为 `ignoredPaytableSymbolsWithoutAssets`，并且不进入展示列表。

如果执行期间美术明确补齐了 `assets/symbols003/WM.png`、`CM.png`、`AF.png` 或 `BN.png`，则必须同步更新：

- 状态图生成命令里的 `--symbols` 列表。
- `apps/symbolsviewer/src/symbol-set-config.ts` 的第三套 displayable/scale 配置。
- `apps/symbolsviewer/src/symbol-animation-config.ts` 的第三套 animation profile。
- `apps/symbolsviewer/tests/*` 里的 expected displayable 和 missing 列表。
- `apps/symbolsviewer/README.md` 的第三套说明。
- 本任务报告里的资产盘点和验收结果。

## 4. 非目标和边界

- 不新增 `assets/gamecfg003`。
- 不把 `assets/gamecfg002/gameconfig.json` 复制到 `assets/symbols003`。
- 不修改 `assets/symbols002` 的原图或派生图，除非实现中只是抽取共享常量或共享 animation profile 名称。
- 不把 `symbols003` 缺失的 `WM`、`CM`、`AF`、`BN` 用任何 fallback 顶替。
- 不在 production 代码里增加“manifest 缺失就退回普通图”“第三套缺图就用第二套图”等兜底。
- 不因为测试导致一些奇怪写法而修改不该改的 production 逻辑；如果测试表达错了，修改测试。
- 不在 `apps/symbolsviewer` 里复制 `rendercore` 已拥有的 symbol 状态机、动画 resolver、underlay 动画或状态贴图校验逻辑。
- 不提交或依赖 `apps/symbolsviewer/dist`、`apps/symbolsviewer/coverage` 等生成物作为源代码合同；如果它们因本地命令变化，必须在报告中说明并确认是否需要清理或忽略。

## 5. 实施步骤

### 5.1 现状盘点

从仓库根目录执行：

```bash
git status --short --untracked-files=all
git diff --stat
find assets/symbols003 -maxdepth 1 -type f -name '*.png' -print | sort
file assets/symbols003/*.png
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes||{}).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels||{}).join(","));'
```

盘点目标：

- 确认 `assets/symbols003` 当前普通图集合。
- 确认普通图尺寸是否仍为 `180 x 180`。
- 确认 `gamecfg002` symbol code 和 reel 名称。
- 确认缺图项是 `WM, CM, AF, BN`，除非执行时美术已经补图。
- 确认工作区已有用户改动，执行中不得回滚。

### 5.2 验证或重新生成 gamecfg002 runtime JSON

如果 Excel 或 `assets/gamecfg002/gameconfig.json` 已变化，或无法确认 JSON 是否最新，从仓库根目录执行：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

生成后验证：

```bash
node -e 'const {createGameConfig}=require("./packages/logiccore/dist/index.js"); const cfg=createGameConfig(require("./assets/gamecfg002/gameconfig.json")); console.log(["WL","H1","H2","L1","L2","L3","L4","WM","CN","CM","CO","AF","BN"].map((s)=>`${s}=${cfg.getSymbolCode(s)}`).join(",")); console.log(cfg.getReelNames().join(","));'
```

如果上面命令因 `packages/logiccore/dist` 不存在失败，先构建依赖：

```bash
pnpm --filter @slotclientengine/logiccore build
```

硬性验收：

- `gameconfig.json` 可被 `createGameConfig(...)` 消费。
- symbol code 顺序符合当前 Excel 生成结果。
- reel 名称包含 `reels-001`。
- 不新增 `gamecfg003`。

### 5.3 生成 symbols003 派生图片和 manifest JSON

按当前 `assets/symbols003` 9 张普通图，从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols003 --output-dir assets/symbols003 --symbols WL,H1,H2,L1,L2,L3,L4,CN,CO
```

如果执行前美术已经补齐更多普通图，先更新 `--symbols` 列表，使它精确等于 `gamecfg002` paytable 与 `assets/symbols003` 普通图的交集，并按 paytable 顺序排列。

生成器会清理 output dir 中已有派生文件：

```text
*.spinBlur.png
*.disabled.png
symbol-state-textures.manifest.json
```

生成器不应覆盖普通原图 `WL.png`、`H1.png` 等。如果执行时发现生成器会删除或覆盖普通图，立即停止并修正生成器或命令调用，不要继续。

生成后执行：

```bash
file assets/symbols003/*.png
node -e 'const fs=require("node:fs"); const m=require("./assets/symbols003/symbol-state-textures.manifest.json"); console.log(m.version); console.log(m.states.join(",")); console.log(Object.keys(m.symbols).join(",")); for (const s of Object.keys(m.symbols)) { for (const suffix of ["", ".spinBlur", ".disabled"]) { const p=`assets/symbols003/${s}${suffix}.png`; if (!fs.existsSync(p)) throw new Error(`missing ${p}`); } }'
```

硬性验收：

- `assets/symbols003/symbol-state-textures.manifest.json` 存在。
- manifest `version` 是 `1`。
- manifest `states` 精确包含 `spinBlur,disabled`。
- manifest `symbols` 精确覆盖当前第三套可展示 symbol；按当前资源应为：

```text
WL, H1, H2, L1, L2, L3, L4, CN, CO
```

- 每个展示 symbol 都有：
  - `SYMBOL.png`
  - `SYMBOL.spinBlur.png`
  - `SYMBOL.disabled.png`
- 派生图尺寸必须与对应普通图一致；当前应全部为 `180 x 180`。
- 不生成 `appear` 或 `win` 专用 PNG；`appear` 和 `win` 是 runtime animation profile，不是派生状态图文件。

### 5.4 更新 symbolsviewer set 配置

修改：

```text
apps/symbolsviewer/src/symbol-set-config.ts
```

要求：

- 新增 import：

```ts
import symbols003StateTextureManifest from "../../../assets/symbols003/symbol-state-textures.manifest.json";
```

- `SymbolSetId` 扩展为：

```ts
export type SymbolSetId = "symbols" | "symbols002" | "symbols003";
```

- 新增第三套 PNG glob：

```ts
const symbols003Modules = import.meta.glob("../../../assets/symbols003/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;
```

- 第三套 `rawGameConfig` 使用 `assets/gamecfg002/gameconfig.json` 的同一个导入，不新增 gamecfg003。
- 第三套 `requiredStates` 继续使用 `SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES`。
- 第三套 `animationResolver` 使用 named resolver，profile 来自新的第三套 animation profile，fallback 使用 `createDefaultSymbolAnimationResolver()`。
- 第三套可展示 symbol 使用显式 `symbolScales`，每个当前可展示 symbol 都配置为 `1`，不要依赖隐式默认值掩盖合同。
- `SYMBOL_SET_CONFIGS` 顺序应为：

```text
symbols, symbols002, symbols003
```

建议抽取共享常量，避免 `symbols002` 和 `symbols003` 的 symbol 列表散落：

```ts
const SYMBOLS002_DISPLAYABLE_SYMBOLS = [...]
const SYMBOLS003_DISPLAYABLE_SYMBOLS = [...]
const createUnitScaleMap = (symbols: readonly string[]) => ...
```

如果抽取公共 helper，保持 helper 局部、简单、可测试，不引入新的全局配置系统。

### 5.5 更新 animation profile

修改：

```text
apps/symbolsviewer/src/symbol-animation-config.ts
```

要求：

- 为第三套新增：

```ts
export const SYMBOLS003_ANIMATION_PROFILES = ...
```

- 当前第三套 profile keys 应为：

```text
WL, H1, H2, L1, L2, L3, L4, CN, CO
```

- 每个 symbol 的 `appear` 使用现有 `createSingleImageUnderlayProfiles()` 结果：

```text
playback: once
durationSeconds: 0.48
effects:
  singleSpriteUnderlayScale(maxScale: 1.6, maxAlpha: 0.4)
```

- 不需要为 `normal`、`spinBlur`、`disabled` 写自定义 profile，它们是稳定贴图状态。
- 不需要为 `win` 写第三套自定义 profile，除非执行中发现默认 resolver 不是闪光效果；正常应使用 default resolver 的单图闪光。
- 若发现默认 `win` 不满足“闪光”合同，应优先在 `rendercore` 的默认动画测试和实现中修正真实合同，而不是在 `symbolsviewer` 里堆叠临时 fallback。

### 5.6 更新 tests

修改：

```text
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
```

最低测试要求：

- `SYMBOL_SET_CONFIGS.map((config) => config.id)` 断言：

```text
symbols, symbols002, symbols003
```

- `getSymbolSetConfig("symbols003")` 返回 label `symbols003`，未知 id 仍抛错。
- 第三套 `symbolScales` 精确等于当前 displayable symbol 的 `1` map。
- 第三套 raw game config 能通过 `createGameConfig(...)` 解析，并使用 `gamecfg002` 的 symbol code / `reels-001`。
- 第三套 catalog 从自己的 PNG glob 和自己的 manifest 生成，不引用 `assets/symbols002`。
- 当前第三套 catalog validation 应为：

```ts
{
  displayableSymbols: ["WL", "H1", "H2", "L1", "L2", "L3", "L4", "CN", "CO"],
  ignoredPaytableSymbolsWithoutAssets: ["WM", "CM", "AF", "BN"],
  ignoredAssetsWithoutPaytable: [],
}
```

- `getTextureSet("WL")` 或其它第三套 symbol 断言：

```text
normal -> WL.png
spinBlur -> WL.spinBlur.png
disabled -> WL.disabled.png
```

- `assets` 中不包含当前缺图项 `WM`、`CM`、`AF`、`BN`，除非执行时美术已经补图并同步更新所有 expected。
- `SYMBOLS003_ANIMATION_PROFILES` keys 精确等于第三套 displayable symbol。
- 每个第三套 profile 的 `appear.effects` 精确等于：

```ts
[
  {
    name: "singleSpriteUnderlayScale",
    params: { maxScale: 1.6, maxAlpha: 0.4 },
  },
]
```

如果测试为了迁就错误实现而要求生产逻辑做奇怪 fallback，修改测试，不要改不该改的 production 逻辑。

### 5.7 更新 README

修改：

```text
apps/symbolsviewer/README.md
```

要求补充：

- viewer 支持三套显式 symbol set。
- 第三套 `symbols003` 使用：
  - `assets/gamecfg002/gameconfig.json`
  - `assets/symbols003/*.png`
  - `assets/symbols003/*.spinBlur.png`
  - `assets/symbols003/*.disabled.png`
  - `assets/symbols003/symbol-state-textures.manifest.json`
- 第三套状态图生成命令。
- 第三套当前 displayable symbols。
- 第三套当前缺图项 `WM, CM, AF, BN`，并说明不显示、不占位。
- 第三套 `appear` 是主图后方半透明副本放大消退，`win` 是默认单图闪光。
- 顶部 `Set` selector 可在 `symbols`、`symbols002`、`symbols003` 之间切换。
- 验收清单增加第三套：
  - 9 个当前可展示 symbol 全部可见。
  - 缺图项不显示。
  - `normal` 普通图。
  - `appear` 主图不缩放，后方半透明副本放大消退。
  - `win` 闪光。
  - `spinBlur` 纵向模糊图。
  - `disabled` 灰度图。
  - 连续切换三套 set 不残留旧对象和旧状态。

### 5.8 视觉和交互验收

启动本地 viewer：

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

在浏览器用 PC 横屏视口验证，建议 `1280 x 720` 或更大：

- 默认进入 `symbols`。
- 顶部 `Set` selector 包含：

```text
symbols
symbols002
symbols003
```

- 切到 `symbols003` 后，可见：

```text
WL, H1, H2, L1, L2, L3, L4, CN, CO
```

- `WM`、`CM`、`AF`、`BN` 不显示，且不被任何 placeholder 或其它 set 图片替代。
- 图标和 label 不重叠，当前 `180 x 180` 资源以 `scale = 1` 展示。
- 默认序列自动播放：

```text
normal -> appear -> win -> spinBlur -> disabled
```

- `normal` 显示普通图。
- `appear` 中主图保持原始 scale，普通图后方额外出现半透明副本，副本放大后消退。
- `win` 显示默认单图闪光。
- `spinBlur` 显示纵向模糊图，不是普通图。
- `disabled` 显示灰色图，不是普通图。
- 连续执行 `symbols -> symbols002 -> symbols003 -> symbols` 至少 3 次，旧 symbol、旧状态面板和旧 Pixi 对象不残留，浏览器 console 无错误。

如果使用 Playwright 或浏览器自动化截图验证，需要在任务报告中记录：

- 启动 URL。
- 视口尺寸。
- 是否有 console error。
- 截图文件路径或关键观察结果。

## 6. 验证命令

从仓库根目录执行。

资源和 JSON 验证：

```bash
find assets/symbols003 -maxdepth 1 -type f -print | sort
file assets/symbols003/*.png
node -e 'const m=require("./assets/symbols003/symbol-state-textures.manifest.json"); console.log(m.version, m.states.join(","), Object.keys(m.symbols).join(","));'
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes||{}).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels||{}).join(","));'
```

模块测试：

```bash
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
```

如果修改了 `packages/rendercore` 的 generator、动画 effect 或相关测试，必须额外执行：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

如果重新生成或修改了 `apps/gengameconfig` 逻辑，必须额外执行：

```bash
pnpm --filter gengameconfig test
pnpm --filter gengameconfig lint
pnpm --filter gengameconfig typecheck
pnpm --filter gengameconfig build
```

最终检查：

```bash
git diff --check
git status --short --untracked-files=all
```

如果执行 `format:check` 时 package-local `prettier --check .` 扫到 `dist/`、`coverage/` 等生成物并失败，应按仓库规则给对应 package 补 `.prettierignore`，不要格式化生成物来掩盖脚本范围问题。

## 7. 验收清单

完成任务前逐项确认：

- [ ] `assets/symbols003/*.spinBlur.png` 已生成。
- [ ] `assets/symbols003/*.disabled.png` 已生成。
- [ ] `assets/symbols003/symbol-state-textures.manifest.json` 已生成。
- [ ] 第三套派生图尺寸与普通图一致；当前预期为 `180 x 180`。
- [ ] `assets/gamecfg002/gameconfig.json` 可被 `createGameConfig(...)` 解析。
- [ ] 没有新增 `assets/gamecfg003`。
- [ ] `apps/symbolsviewer/src/symbol-set-config.ts` 注册 `symbols003`。
- [ ] `SYMBOL_SET_CONFIGS` 顺序为 `symbols, symbols002, symbols003`。
- [ ] `symbols003` 使用 `assets/gamecfg002/gameconfig.json`，不是新的 game config。
- [ ] `symbols003` 使用自己的 PNG glob 和自己的 manifest。
- [ ] `symbols003` 当前 displayable symbols 为 `WL, H1, H2, L1, L2, L3, L4, CN, CO`，除非美术已补图并同步更新所有 expected。
- [ ] `WM, CM, AF, BN` 当前作为缺图项显式记录，不显示、不占位、不 fallback。
- [ ] `symbols003.appear` 使用 `singleSpriteUnderlayScale(maxScale: 1.6, maxAlpha: 0.4)`。
- [ ] `symbols003.win` 是单次闪光，使用默认单图闪光或经测试确认的等价实现。
- [ ] `normal`、`spinBlur`、`disabled` 状态显示正确。
- [ ] `apps/symbolsviewer/tests/symbol-set-config.test.ts` 已覆盖第三套 set/config/catalog。
- [ ] `apps/symbolsviewer/tests/symbol-assets.test.ts` 已覆盖第三套 animation profile。
- [ ] `apps/symbolsviewer/README.md` 已补第三套资源、命令、动画和验收说明。
- [ ] `pnpm --filter symbolsviewer test` 通过。
- [ ] `pnpm --filter symbolsviewer lint` 通过。
- [ ] `pnpm --filter symbolsviewer typecheck` 通过。
- [ ] `pnpm --filter symbolsviewer build` 通过。
- [ ] 如触及 `rendercore` 或 `gengameconfig`，对应 package 的 test/lint/typecheck/build 已通过。
- [ ] 浏览器手工或自动化验收确认三套 set 连续切换无残留、console 无错误。
- [ ] `git diff --check` 通过。
- [ ] 已判断是否需要更新 `agents.md`，并在任务报告中记录结论。
- [ ] 已写中文任务报告。

## 8. 任务报告要求

任务完成后，使用 UTC 时间生成报告名：

```bash
date -u +%y%m%d-%H%M%S
```

报告路径格式：

```text
tasks/56-symbolsviewer-symbols003-gamecfg002-[utctime].md
```

报告必须包含：

- 本次实现摘要。
- `assets/symbols003` 资产盘点：
  - 普通图列表。
  - 派生图列表或生成摘要。
  - manifest symbol 列表。
  - 当前缺图项。
- `assets/gamecfg002/gameconfig.json` 是否重新生成，以及 symbol code / reel 验证结果。
- 代码改动清单：
  - `apps/symbolsviewer/src/symbol-set-config.ts`
  - `apps/symbolsviewer/src/symbol-animation-config.ts`
  - 相关 tests
  - `apps/symbolsviewer/README.md`
  - 其它实际改动
- 测试和验收命令的实际结果。
- 浏览器视觉验收结果，包含视口、URL、关键观察和 console 状态。
- 是否更新 `agents.md`；如果未更新，说明原因。
- 工作区最终状态摘要：

```bash
git status --short --untracked-files=all
```

## 9. 二次遗漏检查

提交或交付前再检查一遍：

- 资源边界：第三套只读 `assets/symbols003` 原图和自身 manifest，不借用 `symbols002` 图片。
- 配置边界：第三套复用 `assets/gamecfg002/gameconfig.json`，不创建 `gamecfg003`。
- 状态边界：只有 `spinBlur` / `disabled` 是派生图片，`appear` / `win` 是 runtime 动画。
- 缺图边界：缺图项显式暴露在 validation / README / 报告里，不 silent fallback。
- 测试边界：测试表达真实合同；如果测试导致奇怪 production 写法，修测试。
- 生成物边界：不要误提交无关 `dist/`、`coverage/` 变化。
- 文档边界：README 和任务报告都写明第三套当前只有 9 个可展示 symbol，以及补图后的同步规则。
- 协作规则边界：只有新增长期规则时才改 `agents.md`；否则报告中说明无需更新。
