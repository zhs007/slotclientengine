# symbolsviewer symbols001 gamecfg002 任务计划

## 1. 任务目标

更新 `apps/symbolsviewer`，在已有 `symbols`、`symbols002`、`symbols003` 的基础上新增一套可选择渲染的 symbol set：

```text
/Users/zerro/github.com/slotclientengine/assets/symbols001
```

这套 `symbols001` 是 `game002` 的另一套 symbols，美术配置直接使用现有 runtime game config：

```text
assets/gamecfg002/gameconfig.json
```

`assets/gamecfg002/gameconfig.json` 由下面两个 Excel 生成：

```text
assets/gamecfg002/paytables.xlsx
assets/gamecfg002/reels-001.xlsx
```

本任务不新增 `assets/gamecfg001`，也不复制 `gameconfig.json` 到 `assets/symbols001`。`symbolsviewer` 只能消费生成后的 `assets/gamecfg002/gameconfig.json`，不能在 viewer 侧解析 Excel 或其它编辑器中间文件。

核心交付：

- 为 `assets/symbols001` 生成完整派生状态图片：
  - `*.spinBlur.png`
  - `*.disabled.png`
- 为 `assets/symbols001` 生成完整状态贴图 manifest JSON：
  - `assets/symbols001/symbol-state-textures.manifest.json`
- 验证或重新生成 `assets/gamecfg002/gameconfig.json`，确保 `symbols001` 直接消费该 runtime config。
- `apps/symbolsviewer` 增加 `symbols001` 可选 symbol set：
  - 第一套：`symbols`，来自 `assets/symbols` + `assets/gamecfg/game2.json`
  - 新增套：`symbols001`，来自 `assets/symbols001` + `assets/gamecfg002/gameconfig.json`
  - 第二套：`symbols002`，来自 `assets/symbols002` + `assets/gamecfg002/gameconfig.json`
  - 第三套：`symbols003`，来自 `assets/symbols003` + `assets/gamecfg002/gameconfig.json`
- 顶部 `Set` selector 可以选择 `symbols001` 渲染；切换 set 时不能残留上一套 symbol、状态面板或 Pixi 对象。
- `symbols001` 的状态要求与 `symbols002`、`symbols003` 一致：
  - `normal`：稳定态，循环/静态，普通图，无特殊效果。
  - `appear`：单次，主普通图保持原始 scale，普通图后方额外出现一张半透明普通图副本，副本放大到约 `1.6` 后消退。
  - `win`：单次，默认单图闪光效果。
  - `spinBlur`：稳定态，纵向模糊派生图。
  - `disabled`：稳定态，灰度派生图。
- `BN.png` 是本套新增的空图标，纯透明图。它必须作为显式资产参与状态图和 manifest 生成；未来如服务器数据里出现“本套 symbols 未配置图标”的情况，可以在明确的服务器数据映射边界使用 `BN` 作为兜底入口。
- 本任务不能把 `BN` 做成隐藏的通用 fallback，不能在当前 `symbolsviewer` 或 `rendercore` catalog 中静默把缺图 symbol 自动映射到 `BN`。当前缺图项必须继续显式暴露，避免真实配置问题被遮住。
- 更新相关测试和 README；如果测试导致一些奇怪写法，修改测试，不要改不该改的 production 逻辑。
- 保持 fail-fast：不加隐藏 fallback，不自动借用 `symbols002` / `symbols003` 图片，不在 manifest 或状态图缺失时静默降级。
- 若实现新增长期协作规则、目录规范或基础脚本约定，必须同步更新根目录 `agents.md`；否则在任务报告中说明无需更新。
- 任务完成后新增中文任务报告：

```text
tasks/58-symbolsviewer-symbols001-gamecfg002-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/58-symbolsviewer-symbols001-gamecfg002-260627-123456.md
```

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、资源生成、代码实现、测试、文档、协作规则同步判断、验收和最终报告。

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

当前已观察到工作区有与本任务无关的 `packages/anieditorv5runtime-cc` 修改。这些修改应视为用户已有改动，执行本任务时不得回滚、重排或顺手修理。

当前已观察到 `assets/symbols001/*.png` 是用户新增输入资产，执行本任务时不得删除、重命名或覆盖普通原图。

当前实际协作规则文件是：

```text
agents.md
```

如果执行时又出现 `AGENTS.md`，且两个文件都存在，则必须检查两者是否需要同步，并记录判断：

```bash
cmp -s AGENTS.md agents.md
```

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

当前 `apps/symbolsviewer/src/symbol-set-config.ts` 已有三套 set：

```text
symbols
symbols002
symbols003
```

当前 `apps/symbolsviewer/src/main.ts` 已有顶部 `Set` selector，并且切换 set 时会重新创建 catalog、Pixi symbol、状态序列和状态面板。因此本任务应该沿用现有配置驱动结构，新增 `symbols001` 配置；不要为了新增一套 symbols 重写 viewer 交互或状态机。

当前 `apps/symbolsviewer/src/symbol-animation-config.ts` 已有 `singleSpriteUnderlayScale` 风格的 appear 配置，`symbols002` 和 `symbols003` 正在使用它：

```text
appear -> singleSpriteUnderlayScale(maxScale: 1.6, maxAlpha: 0.4)
```

`packages/rendercore` 已拥有 symbol 状态机、named animation resolver、状态贴图校验和 `singleSpriteUnderlayScale` 动画效果。`symbolsviewer` 只能配置和调用，不要在 app 内复制这些通用逻辑。

### 3.2 gamecfg002 当前合同

`symbols001` 直接使用：

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

生成结果必须能被 `logiccore.createGameConfig(...)` 消费，且 `symbols001` viewer 不得绕过 `gameconfig.json` 直接解析 Excel。

### 3.3 symbols001 当前资源盘点

当前新增目录：

```text
assets/symbols001
```

当前已观察到的普通 PNG：

```text
assets/symbols001/BN.png
assets/symbols001/CN.png
assets/symbols001/H1.png
assets/symbols001/H2.png
assets/symbols001/L1.png
assets/symbols001/L2.png
assets/symbols001/L3.png
assets/symbols001/L4.png
assets/symbols001/WL.png
```

当前这些 PNG 均为 `200 x 200`，RGBA。当前还没有观察到：

```text
assets/symbols001/*.spinBlur.png
assets/symbols001/*.disabled.png
assets/symbols001/symbol-state-textures.manifest.json
```

按 `gamecfg002` 的 paytable 顺序和当前 `symbols001` 普通图集合，当前 `symbols001` 可展示 symbol 预期为：

```text
WL, H1, H2, L1, L2, L3, L4, CN, BN
```

当前 `gamecfg002` paytable 中有但 `symbols001` 缺图的 symbol：

```text
WM, CM, CO, AF
```

这些缺图项不能在当前 viewer 中用 placeholder、其它 set 图片、空纹理或 `BN` 静默顶替。`BN` 是一个显式存在的透明 symbol，应参与生成、catalog 和 viewer 展示；由于它本身透明，视觉验收时看到 `BN` label 但图像不可见是预期行为，不应误判为渲染失败。

如果执行期间美术明确补齐了 `assets/symbols001/WM.png`、`CM.png`、`CO.png` 或 `AF.png`，则必须同步更新：

- 状态图生成命令里的 `--symbols` 列表。
- `apps/symbolsviewer/src/symbol-set-config.ts` 的 `symbols001` displayable/scale 配置。
- `apps/symbolsviewer/src/symbol-animation-config.ts` 的 `symbols001` animation profile。
- `apps/symbolsviewer/tests/*` 里的 expected displayable 和 missing 列表。
- `apps/symbolsviewer/README.md` 的 `symbols001` 说明。
- 本任务报告里的资产盘点和验收结果。

## 4. 非目标和边界

- 不新增 `assets/gamecfg001`。
- 不把 `assets/gamecfg002/gameconfig.json` 复制到 `assets/symbols001`。
- 不修改 `assets/symbols002` 或 `assets/symbols003` 的原图、派生图和 manifest，除非只是抽取共享常量或共享 animation profile 名称。
- 不把 `symbols001` 缺失的 `WM`、`CM`、`CO`、`AF` 用任何隐藏 fallback 顶替。
- 不在 production 代码里增加“manifest 缺失就退回普通图”“`symbols001` 缺图就用 `symbols002` 图”“缺图就自动用 `BN`”等静默降级。
- `BN` 的未来兜底用途只能在明确的服务器数据到客户端 symbol 映射边界实现，并且必须有测试说明哪些未配置服务器 symbol 会被映射为 `BN`；本任务只负责让 `BN` 作为显式透明资产可用。
- 不因为测试导致一些奇怪写法而修改不该改的 production 逻辑；如果测试表达错了，修改测试。
- 不在 `apps/symbolsviewer` 里复制 `rendercore` 已拥有的 symbol 状态机、动画 resolver、underlay 动画或状态贴图校验逻辑。
- 不提交或依赖 `apps/symbolsviewer/dist`、`apps/symbolsviewer/coverage` 等生成物作为源代码合同；如果它们因本地命令变化，必须在报告中说明并确认是否需要清理或忽略。

## 5. 实施步骤

### 5.1 现状盘点

从仓库根目录执行：

```bash
git status --short --untracked-files=all
git diff --stat
find assets/symbols001 -maxdepth 1 -type f -name '*.png' -print | sort
file assets/symbols001/*.png
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes||{}).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels||{}).join(","));'
```

盘点目标：

- 确认 `assets/symbols001` 当前普通图集合。
- 确认普通图尺寸是否仍为 `200 x 200`。
- 确认 `BN.png` 存在，并是 RGBA PNG。
- 确认 `gamecfg002` symbol code 和 reel 名称。
- 确认当前缺图项是 `WM, CM, CO, AF`，除非执行时美术已经补图。
- 确认工作区已有用户改动，执行中不得回滚。

建议额外验证 `BN.png` 是否纯透明。可从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/rendercore exec node -e 'const sharp=require("sharp"); sharp("../../assets/symbols001/BN.png").ensureAlpha().raw().toBuffer({resolveWithObject:true}).then(({data})=>{for(let i=3;i<data.length;i+=4){if(data[i]!==0) throw new Error("BN alpha is not fully transparent");} console.log("BN alpha is fully transparent");})'
```

如果 `BN.png` 不是纯透明图，先停止并向资产提供方确认，不要用代码强行把它处理成透明。

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
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); const expected=["WL","H1","H2","L1","L2","L3","L4","WM","CN","CM","CO","AF","BN"]; console.log(expected.map((s)=>`${s}=${cfg.symbolCodes[s]}`).join(",")); console.log(Object.keys(cfg.reels||{}).join(","));'
```

硬性验收：

- `gameconfig.json` 可被 `createGameConfig(...)` 消费。
- symbol code 顺序符合当前 Excel 生成结果。
- reel 名称包含 `reels-001`。
- 不新增 `gamecfg001`。
- 不新增或依赖 `gamecfg003`。

### 5.3 生成 symbols001 派生图片和 manifest JSON

按当前 `assets/symbols001` 9 张普通图，从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols001 --output-dir assets/symbols001 --symbols WL,H1,H2,L1,L2,L3,L4,CN,BN
```

如果执行前美术已经补齐更多普通图，先更新 `--symbols` 列表，使它精确等于 `gamecfg002` paytable 与 `assets/symbols001` 普通图的交集，并按 paytable 顺序排列。

生成器会清理 `output-dir` 中已有派生文件：

```text
*.spinBlur.png
*.disabled.png
symbol-state-textures.manifest.json
```

生成器不应覆盖普通原图 `WL.png`、`H1.png`、`BN.png` 等。如果执行时发现生成器会删除或覆盖普通图，立即停止并修正生成器或命令调用，不要继续。

生成后执行：

```bash
file assets/symbols001/*.png
node -e 'const fs=require("node:fs"); const expected=["WL","H1","H2","L1","L2","L3","L4","CN","BN"]; const m=require("./assets/symbols001/symbol-state-textures.manifest.json"); if (m.version!==1) throw new Error("manifest version must be 1"); if (m.states.join(",")!=="spinBlur,disabled") throw new Error(`bad states ${m.states.join(",")}`); if (Object.keys(m.symbols).join(",")!==expected.join(",")) throw new Error(`bad symbols ${Object.keys(m.symbols).join(",")}`); for (const s of expected) { for (const suffix of ["", ".spinBlur", ".disabled"]) { const p=`assets/symbols001/${s}${suffix}.png`; if (!fs.existsSync(p)) throw new Error(`missing ${p}`); } } console.log("symbols001 manifest and files ok");'
```

硬性验收：

- `assets/symbols001/symbol-state-textures.manifest.json` 存在。
- manifest `version` 是 `1`。
- manifest `states` 精确包含 `spinBlur,disabled`。
- manifest `symbols` 精确覆盖当前 `symbols001` 可展示 symbol；按当前资源应为：

```text
WL, H1, H2, L1, L2, L3, L4, CN, BN
```

- 每个展示 symbol 都有：
  - `SYMBOL.png`
  - `SYMBOL.spinBlur.png`
  - `SYMBOL.disabled.png`
- 派生图尺寸必须与对应普通图一致；当前应全部为 `200 x 200`。
- `BN.spinBlur.png` 和 `BN.disabled.png` 必须存在；因为源图透明，派生图视觉上也可能仍不可见，这是预期行为。
- 不生成 `appear` 或 `win` 专用 PNG；`appear` 和 `win` 是 runtime animation profile，不是派生状态图文件。

### 5.4 更新 symbolsviewer set 配置

修改：

```text
apps/symbolsviewer/src/symbol-set-config.ts
```

要求：

- 新增 import：

```ts
import symbols001StateTextureManifest from "../../../assets/symbols001/symbol-state-textures.manifest.json";
```

- `SymbolSetId` 扩展为：

```ts
export type SymbolSetId = "symbols" | "symbols001" | "symbols002" | "symbols003";
```

- 新增 `symbols001` PNG glob：

```ts
const symbols001Modules = import.meta.glob("../../../assets/symbols001/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;
```

- `symbols001.rawGameConfig` 使用现有 `rawSymbols002GameConfig`，即 `assets/gamecfg002/gameconfig.json`。
- `symbols001.requiredStates` 继续使用 `SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES`。
- `symbols001.animationResolver` 使用 named resolver，profile 来自新的 `SYMBOLS001_ANIMATION_PROFILES`，fallback 使用 `createDefaultSymbolAnimationResolver()`。
- `symbols001.symbolScales` 使用显式 `1` scale map，不依赖隐式默认值掩盖合同。
- `SYMBOL_SET_CONFIGS` 顺序应为：

```text
symbols, symbols001, symbols002, symbols003
```

建议新增或复用局部常量：

```ts
const SYMBOLS001_DISPLAYABLE_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "CN",
  "BN",
]);
```

如果抽取公共 helper，保持 helper 局部、简单、可测试，不引入新的全局配置系统。

### 5.5 更新 animation profile

修改：

```text
apps/symbolsviewer/src/symbol-animation-config.ts
```

要求：

- 为新增套导出：

```ts
export const SYMBOLS001_ANIMATION_PROFILES = ...
```

- 当前 `SYMBOLS001_ANIMATION_PROFILES` keys 应为：

```text
WL, H1, H2, L1, L2, L3, L4, CN, BN
```

- 每个 symbol 的 `appear` 使用现有 `createSingleImageUnderlayProfiles()` 结果：

```text
playback: once
durationSeconds: 0.48
effects:
  singleSpriteUnderlayScale(maxScale: 1.6, maxAlpha: 0.4)
```

- 不需要为 `normal`、`spinBlur`、`disabled` 写自定义 profile，它们是稳定贴图状态。
- 不需要为 `win` 写 `symbols001` 自定义 profile，除非执行中发现默认 resolver 不是闪光效果；正常应使用 default resolver 的单图闪光。
- 若发现默认 `win` 不满足“闪光”合同，应优先在 `rendercore` 的默认动画测试和实现中修正真实合同，而不是在 `symbolsviewer` 里堆叠临时 fallback。
- `BN` 也应包含在 profile keys 中；它是透明图，所以动画肉眼可能不可见，但配置合同应与其它单图 symbol 一致。

### 5.6 更新 tests

修改：

```text
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
```

最低测试要求：

- `SYMBOL_SET_CONFIGS.map((config) => config.id)` 断言：

```text
symbols, symbols001, symbols002, symbols003
```

- `getSymbolSetConfig("symbols001")` 返回 label `symbols001`，未知 id 仍抛错。
- `symbols001.symbolScales` 精确等于当前 displayable symbol 的 `1` map。
- `symbols001.rawGameConfig` 能通过 `createGameConfig(...)` 解析，并使用 `gamecfg002` 的 symbol code / `reels-001`。
- `symbols001` catalog 从自己的 PNG glob 和自己的 manifest 生成，不引用 `assets/symbols002` 或 `assets/symbols003`。
- 当前 `symbols001` catalog validation 应为：

```ts
{
  displayableSymbols: ["WL", "H1", "H2", "L1", "L2", "L3", "L4", "CN", "BN"],
  ignoredPaytableSymbolsWithoutAssets: ["WM", "CM", "CO", "AF"],
  ignoredAssetsWithoutPaytable: [],
}
```

- `getTextureSet("WL")` 或其它普通 symbol 断言：

```text
normal -> WL.png
spinBlur -> WL.spinBlur.png
disabled -> WL.disabled.png
```

- `getTextureSet("BN")` 断言：

```text
normal -> BN.png
spinBlur -> BN.spinBlur.png
disabled -> BN.disabled.png
```

- `assets` 中不包含当前缺图项 `WM`、`CM`、`CO`、`AF`，除非执行时美术已经补图并同步更新所有 expected。
- `SYMBOLS001_ANIMATION_PROFILES` keys 精确等于 `symbols001` displayable symbol。
- 每个 `symbols001` profile 的 `appear.effects` 精确等于：

```ts
[
  {
    name: "singleSpriteUnderlayScale",
    params: { maxScale: 1.6, maxAlpha: 0.4 },
  },
]
```

如果测试为了迁就错误实现而要求 production 逻辑做奇怪 fallback，修改测试，不要改不该改的 production 逻辑。

### 5.7 更新 README

修改：

```text
apps/symbolsviewer/README.md
```

要求补充：

- viewer 支持四套显式 symbol set。
- `symbols001` 使用：
  - `assets/gamecfg002/gameconfig.json`
  - `assets/symbols001/*.png`
  - `assets/symbols001/*.spinBlur.png`
  - `assets/symbols001/*.disabled.png`
  - `assets/symbols001/symbol-state-textures.manifest.json`
- `symbols001` 状态图生成命令。
- `symbols001` 当前 displayable symbols。
- `symbols001` 当前缺图项 `WM, CM, CO, AF`，并说明不显示、不占位、不 fallback。
- `BN` 是透明空图标，当前作为显式 symbol 展示；未来服务器未配置图标只能在明确映射边界显式转成 `BN`，不能把 catalog 做成静默 fallback。
- `symbols001.appear` 是主图后方半透明副本放大消退，`win` 是默认单图闪光。
- 顶部 `Set` selector 可在 `symbols`、`symbols001`、`symbols002`、`symbols003` 之间切换。
- 验收清单增加 `symbols001`：
  - 9 个当前可展示 symbol 全部进入展示列表。
  - `BN` label 可见但图像透明是预期。
  - 缺图项不显示。
  - `normal` 普通图。
  - `appear` 主图不缩放，后方半透明副本放大消退。
  - `win` 闪光。
  - `spinBlur` 纵向模糊图。
  - `disabled` 灰度图。
  - 连续切换四套 set 不残留旧对象和旧状态。

### 5.8 判断是否更新 agents.md

如果实现只是新增 `symbols001` 资源派生物、viewer 配置、测试和 README，通常不需要更新 `agents.md`。

如果实现中把 `BN` 兜底规则提升为长期协作规则，或新增了影响仓库协作的目录规范、生成脚本约定、基础运行规则，则必须同步更新：

```text
agents.md
```

可考虑新增的长期规则只应表达明确边界，例如：

```text
game002 系列 symbols 中的透明 BN 只能作为显式配置的空图标或明确服务器映射边界的兜底入口，不能在通用 symbol catalog 中静默吞掉缺图/缺配置错误。
```

是否更新 `agents.md` 必须在任务报告中记录。如果未更新，说明原因。

### 5.9 视觉和交互验收

启动本地 viewer：

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

在浏览器用 PC 横屏视口验证，建议 `1280 x 720` 或更大：

- 默认进入 `symbols`。
- 顶部 `Set` selector 包含：

```text
symbols
symbols001
symbols002
symbols003
```

- 切到 `symbols001` 后，展示列表包含：

```text
WL, H1, H2, L1, L2, L3, L4, CN, BN
```

- `WM`、`CM`、`CO`、`AF` 不显示，且不被任何 placeholder、`BN` 或其它 set 图片替代。
- `BN` label 可见；由于 `BN.png` 是透明图，图像本体不可见是预期行为。
- 图标和 label 不重叠，当前 `200 x 200` 资源以 `scale = 1` 展示。
- 默认序列自动播放：

```text
normal -> appear -> win -> spinBlur -> disabled
```

- `normal` 显示普通图；`BN.normal` 仍为透明。
- `appear` 中主图保持原始 scale，普通图后方额外出现半透明副本，副本放大后消退；`BN.appear` 可能肉眼不可见但状态应正常切换。
- `win` 显示默认单图闪光；`BN.win` 可能肉眼不可见但状态应正常切换。
- `spinBlur` 显示纵向模糊图，不是普通图。
- `disabled` 显示灰色图，不是普通图。
- 连续执行 `symbols -> symbols001 -> symbols002 -> symbols003 -> symbols` 至少 3 次，旧 symbol、旧状态面板和旧 Pixi 对象不残留，浏览器 console 无错误。

如果使用 Playwright 或浏览器自动化截图验证，需要在任务报告中记录：

- 启动 URL。
- 视口尺寸。
- 是否有 console error。
- 截图文件路径或关键观察结果。

## 6. 验证命令

从仓库根目录执行。

资源和 JSON 验证：

```bash
find assets/symbols001 -maxdepth 1 -type f -print | sort
file assets/symbols001/*.png
node -e 'const m=require("./assets/symbols001/symbol-state-textures.manifest.json"); console.log(m.version, m.states.join(","), Object.keys(m.symbols).join(","));'
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

- [ ] `assets/symbols001/*.spinBlur.png` 已生成。
- [ ] `assets/symbols001/*.disabled.png` 已生成。
- [ ] `assets/symbols001/symbol-state-textures.manifest.json` 已生成。
- [ ] `BN.spinBlur.png` 和 `BN.disabled.png` 已生成。
- [ ] `BN.png` 已确认是透明空图标；如果未确认，报告中说明原因和风险。
- [ ] `symbols001` 派生图尺寸与普通图一致；当前预期为 `200 x 200`。
- [ ] `assets/gamecfg002/gameconfig.json` 可被 `createGameConfig(...)` 解析。
- [ ] 没有新增 `assets/gamecfg001`。
- [ ] `apps/symbolsviewer/src/symbol-set-config.ts` 注册 `symbols001`。
- [ ] `SYMBOL_SET_CONFIGS` 顺序为 `symbols, symbols001, symbols002, symbols003`。
- [ ] `symbols001` 使用 `assets/gamecfg002/gameconfig.json`，不是新的 game config。
- [ ] `symbols001` 使用自己的 PNG glob 和自己的 manifest。
- [ ] `symbols001` 当前 displayable symbols 为 `WL, H1, H2, L1, L2, L3, L4, CN, BN`，除非美术已补图并同步更新所有 expected。
- [ ] `WM, CM, CO, AF` 当前作为缺图项显式记录，不显示、不占位、不 fallback。
- [ ] 没有把缺图项静默映射到 `BN`；如新增未来服务器映射边界，必须有显式测试和文档。
- [ ] `symbols001.appear` 使用 `singleSpriteUnderlayScale(maxScale: 1.6, maxAlpha: 0.4)`。
- [ ] `symbols001.win` 是单次闪光，使用默认单图闪光或经测试确认的等价实现。
- [ ] `normal`、`spinBlur`、`disabled` 状态显示正确。
- [ ] `apps/symbolsviewer/tests/symbol-set-config.test.ts` 已覆盖 `symbols001` set/config/catalog。
- [ ] `apps/symbolsviewer/tests/symbol-assets.test.ts` 已覆盖 `symbols001` animation profile。
- [ ] `apps/symbolsviewer/README.md` 已补 `symbols001` 资源、命令、BN 语义、动画和验收说明。
- [ ] `pnpm --filter symbolsviewer test` 通过。
- [ ] `pnpm --filter symbolsviewer lint` 通过。
- [ ] `pnpm --filter symbolsviewer typecheck` 通过。
- [ ] `pnpm --filter symbolsviewer build` 通过。
- [ ] 如触及 `rendercore` 或 `gengameconfig`，对应 package 的 test/lint/typecheck/build 已通过。
- [ ] 浏览器手工或自动化验收确认四套 set 连续切换无残留、console 无错误。
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
tasks/58-symbolsviewer-symbols001-gamecfg002-[utctime].md
```

报告必须包含：

- 本次实现摘要。
- `assets/symbols001` 资产盘点：
  - 普通图列表。
  - 派生图列表或生成摘要。
  - manifest symbol 列表。
  - 当前缺图项。
  - `BN` 透明性检查结果。
- `assets/gamecfg002/gameconfig.json` 是否重新生成，以及 symbol code / reel 验证结果。
- 代码改动清单：
  - `apps/symbolsviewer/src/symbol-set-config.ts`
  - `apps/symbolsviewer/src/symbol-animation-config.ts`
  - 相关 tests
  - `apps/symbolsviewer/README.md`
  - `agents.md`，如果实际更新
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

- 资源边界：`symbols001` 只读 `assets/symbols001` 原图和自身 manifest，不借用 `symbols002` 或 `symbols003` 图片。
- 配置边界：`symbols001` 复用 `assets/gamecfg002/gameconfig.json`，不创建 `gamecfg001`。
- 状态边界：只有 `spinBlur` / `disabled` 是派生图片，`appear` / `win` 是 runtime 动画。
- BN 边界：`BN` 是显式透明资产和未来明确映射边界的兜底入口，不是通用 catalog 的静默 fallback。
- 缺图边界：缺图项显式暴露在 validation / README / 报告里，不 silent fallback。
- 测试边界：测试表达真实合同；如果测试导致奇怪 production 写法，修测试。
- 生成物边界：不要误提交无关 `dist/`、`coverage/` 变化。
- 文档边界：README 和任务报告都写明 `symbols001` 当前 9 个可展示 symbol、4 个缺图项、`BN` 透明语义，以及补图后的同步规则。
- 协作规则边界：只有新增长期规则时才改 `agents.md`；否则报告中说明无需更新。
