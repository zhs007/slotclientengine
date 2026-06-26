# symbolsviewer symbols002 art refresh 任务计划

## 1. 任务目标

更新 `symbolsviewer` 当前第二套 symbol 资源：

```text
/Users/zerro/github.com/slotclientengine/assets/symbols002
```

美术这次是在 `assets/symbols002` 目录内更新原图，不是新增第三套资源。本任务必须重新生成第二套派生图片和 JSON，并让 `apps/symbolsviewer` 继续可以选择展示哪一套 symbols。

本任务不处理、不接入、不注册下面目录：

```text
assets/symbols003
```

`assets/symbols003` 是后续任务范围。执行本计划时如果发现该目录存在，只能忽略它，不能把它加入 `symbolsviewer` 的 set selector，也不能用它替代 `symbols002`。

核心交付：

- 重新生成 `assets/symbols002` 的完整状态图片：
  - `*.spinBlur.png`
  - `*.disabled.png`
- 重新生成 `assets/symbols002/symbol-state-textures.manifest.json`。
- 重新生成 `assets/gamecfg002/gameconfig.json`。
- 把 `apps/symbolsviewer` 中第二套 `symbols002` 的显示缩放系数从旧的 `0.4` 改为 `1`，即 100%。
- 保留并验收 `symbolsviewer` 的 symbol set 选择能力：
  - 第一套：`symbols`，来自 `assets/symbols` + `assets/gamecfg/game2.json`
  - 第二套：`symbols002`，来自 `assets/symbols002` + `assets/gamecfg002/gameconfig.json`
- 更新相关测试和 README，确保测试表达真实产品合同；如果测试导致一些奇怪写法，修改测试，不要改不该改的生产逻辑。
- 保持 fail-fast：不加隐藏 fallback，不自动用旧图、不自动用 `symbols003`、不在缺状态图或 manifest 错误时静默降级。
- 任务完成后写中文任务报告。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、资源生成、代码实现、测试、文档、协作规则同步判断和最终报告。

任务完成后必须新增中文任务报告：

```text
tasks/55-symbolsviewer-symbols002-art-refresh-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/55-symbolsviewer-symbols002-art-refresh-260626-123456.md
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
- 新增空目录必须放 `.keepme`

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。`packages/rendercore` 已有生成状态图需要的 Node 脚本和 `sharp` 依赖。若确实需要新增依赖，必须执行：

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

若本任务只是更新 `symbols002` 资源、viewer 配置、测试和 README，通常不需要更新 `agents.md`。如果实现中新增了长期协作规则、目录规范或基础脚本约定，必须同步更新 `agents.md`，并在任务报告中说明原因。

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

当前 `apps/symbolsviewer/src/main.ts` 已有顶部 `Set` selector，并在切换时重建 catalog、Pixi symbol 和状态序列。实现本任务时要保留这个选择能力；如果代码已满足，只需要更新测试和验收，不要为了“重做选择器”引入额外状态或 fallback。

### 3.2 symbols002 当前资源和配置

第二套资源目录：

```text
assets/symbols002
```

第二套 runtime game config 由 `gengameconfig` 从 Excel 生成：

```text
assets/gamecfg002/paytables.xlsx
assets/gamecfg002/reels-001.xlsx
assets/gamecfg002/gameconfig.json
```

当前 `assets/gamecfg002/gameconfig.json` 已知 symbol code 顺序为：

```text
WL=0, H1=1, H2=2, L1=3, L2=4, L3=5, L4=6, WM=7, CN=8, CM=9, CO=10, AF=11, BN=12
```

当前第二套可展示 symbol 预期为：

```text
WL, H1, H2, L1, L2, L3, L4, WM, CN, CM, CO, AF
```

`BN` 当前在 paytable 中存在但没有图片，所以不进入展示列表。执行时如果美术或 Excel 已明确新增 `BN.png` 并希望展示 `BN`，必须同步更新生成命令、测试、README 和验收；否则保持 `BN` 为 paytable 中缺图项，不要用 placeholder 或其它 symbol 顶替。

本任务开始时需要重新确认 `assets/symbols002` 中普通图和派生图尺寸。当前已观察到的风险是：

- 普通图 `assets/symbols002/*.png` 已被更新为 `200 x 200`。
- 旧派生图 `assets/symbols002/*.spinBlur.png` / `assets/symbols002/*.disabled.png` 可能仍是旧的 `500 x 500`。

因此不能信任已有派生状态图，必须重新生成。

### 3.3 symbols002 缩放合同

旧版本 `symbols002` 使用逐 symbol `0.4` 缩放，即 40%。本任务要求第二套 `symbols002` 改为 100%：

```text
scale = 1
```

执行时优先把 `apps/symbolsviewer/src/symbol-set-config.ts` 中 `symbols002` 的显式 scale map 全部改成 `1`，并让测试断言 `1`。不要依赖隐式默认值来掩盖合同变化。

## 4. 实施步骤

### 4.1 现状盘点

从仓库根目录执行：

```bash
git status --short --untracked-files=all
git diff --stat
find assets/symbols002 -maxdepth 1 -type f -print | sort
file assets/symbols002/*.png
```

盘点目标：

- 确认 `assets/symbols002` 普通图是否完整。
- 确认旧派生图是否存在且是否尺寸陈旧。
- 确认没有误把 `assets/symbols003` 作为本任务输入。
- 确认工作区已有用户改动，执行中不得回滚。

建议用下面命令快速查看 game config 当前 symbol 集合：

```bash
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels).join(","));'
```

### 4.2 重新生成 symbols002 状态图片和 manifest

从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
```

生成器会清理 `output-dir` 中已有派生文件：

```text
*.spinBlur.png
*.disabled.png
symbol-state-textures.manifest.json
```

生成器不应覆盖普通原图 `WL.png`、`H1.png` 等。如果执行时发现生成器会删除或覆盖普通图，立即停止并修正生成器或命令调用，不要继续。

生成后检查：

```bash
file assets/symbols002/*.png
node -e 'const m=require("./assets/symbols002/symbol-state-textures.manifest.json"); console.log(m.version); console.log(m.states.join(",")); console.log(Object.keys(m.symbols).join(","));'
```

硬性验收：

- manifest `version` 是 `1`。
- manifest `states` 精确包含 `spinBlur,disabled`。
- manifest `symbols` 精确覆盖 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`，除非本任务中明确扩展 symbol 集合并同步所有测试和文档。
- 每个展示 symbol 都有：
  - `SYMBOL.png`
  - `SYMBOL.spinBlur.png`
  - `SYMBOL.disabled.png`
- 派生图尺寸必须与对应普通图一致。当前更新后的普通图若是 `200 x 200`，派生图也必须是 `200 x 200`。

### 4.3 重新生成 runtime gameconfig JSON

从仓库根目录执行：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

生成后检查：

```bash
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels).join(","));'
```

硬性验收：

- `assets/gamecfg002/gameconfig.json` 是稳定格式 JSON，无时间戳字段。
- `symbolCodes` 与 Excel 内容一致。
- `reels` 至少包含 `reels-001`。
- 不能为了通过测试修改生产解析逻辑去吞掉无效 Excel。若 Excel 单元格格式导致测试奇怪，优先修正测试或 fixture；真正非法数据应 fail-fast。

### 4.4 更新 symbolsviewer 配置

至少检查并按需修改：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/symbol-animation-config.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/README.md
```

`apps/symbolsviewer/src/symbol-set-config.ts` 要求：

- `SymbolSetId` 仍为当前本任务范围内的 set：

```text
"symbols" | "symbols002"
```

- 不新增 `"symbols003"`。
- `symbols002` 仍导入：

```text
../../../assets/gamecfg002/gameconfig.json
../../../assets/symbols002/symbol-state-textures.manifest.json
../../../assets/symbols002/*.png
```

- `symbols002` 的 symbol scale 从 `0.4` 改为 `1`。
- 继续使用 `SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES`，不能把 `spinBlur` 或 `disabled` 改成可选。

`apps/symbolsviewer/src/symbol-animation-config.ts` 要求：

- 如果 displayable symbol 仍是 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`，只需保持现有 `SYMBOLS002_ANIMATION_PROFILES`。
- 如果 symbol 集合发生真实变化，必须同步 profiles，不能让新 displayable symbol 静默失去 `appear` 合同。

`apps/symbolsviewer/README.md` 要求：

- 把第二套描述中的旧 `500 x 500` / `0.4` / 40% 文案改成当前真实尺寸和 100% 缩放。
- 保留状态图生成命令和 gameconfig 生成命令。
- 明确 `Set` selector 能在 `symbols` 与 `symbols002` 间切换。
- 不加入 `symbols003` 的使用说明。

### 4.5 更新测试

`apps/symbolsviewer/tests/symbol-set-config.test.ts` 至少覆盖：

- `SYMBOL_SET_CONFIGS.map((config) => config.id)` 等于：

```text
symbols, symbols002
```

- `getSymbolSetConfig("symbols002").symbolScales` 对 displayable symbols 的值全部为 `1`。
- `symbols002` 的 `gameconfig.json` 可被 `logiccore.createGameConfig(...)` 解析。
- `symbols002` 的 catalog validation 为：
  - `displayableSymbols`: `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`
  - `ignoredPaytableSymbolsWithoutAssets`: `BN`
  - `ignoredAssetsWithoutPaytable`: `[]`

`apps/symbolsviewer/tests/symbol-assets.test.ts` 至少保持：

- 缺 `spinBlur` 或 `disabled` 会失败。
- manifest 声明未知状态会失败。
- manifest 引用不存在的 PNG 会失败。
- `SYMBOLS002_ANIMATION_PROFILES` 覆盖每个 displayable symbol。

如果测试失败是因为测试仍断言旧的 40% 缩放或旧尺寸，修测试，不要把生产代码改回旧合同。

### 4.6 浏览器验收

启动 viewer：

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

在 PC 横屏视口，比如 `1280x720` 或更大，检查：

- 默认可展示第一套 `symbols`。
- 顶部 `Set` selector 包含 `symbols` 和 `symbols002`。
- 切换到 `symbols002` 后，`WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF` 全部可见。
- `BN` 不显示，除非本任务明确加入了 `BN.png` 并同步测试和文档。
- `symbols002` 使用 100% 缩放，不再按 40% 显示。
- `symbols002.appear` 中主图不缩放，图后半透明副本放大消退。
- `symbols002.spinBlur` 显示新生成的纵向模糊图，不是旧尺寸派生图或普通图。
- `symbols002.disabled` 显示新生成的灰色图，不是旧尺寸派生图或普通图。
- 连续执行 `symbols -> symbols002 -> symbols` 至少 3 次，旧 symbol、旧状态面板和旧 Pixi 对象不残留，浏览器 console 无错误。
- 图标和 label 不重叠；若 100% 后布局拥挤，应调整 viewer 的布局参数或行列计算，不要把 `symbols002` scale 改回 0.4。

## 5. 验证命令

至少执行：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
pnpm --filter gengameconfig dev -- --paytable assets/gamecfg002/paytables.xlsx --reel assets/gamecfg002/reels-001.xlsx --out assets/gamecfg002/gameconfig.json
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer build
```

如果修改了 `apps/gengameconfig` 源码，还必须执行：

```bash
pnpm --filter gengameconfig lint
pnpm --filter gengameconfig test
pnpm --filter gengameconfig typecheck
pnpm --filter gengameconfig build
```

如果修改了 `packages/rendercore` 生成器或 symbol runtime 源码，还必须执行：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

最终清理检查：

```bash
git status --short --untracked-files=all
git diff --check
```

验收不要只看命令通过。还必须打开实际页面完成第 4.6 节浏览器验收，或在报告中明确说明浏览器验收为何未执行。

## 6. 非目标和禁止事项

- 不处理 `assets/symbols003`。
- 不新增 `symbols003` set。
- 不把 `symbols003` 当成 `symbols002` 的替代输入。
- 不把 `symbols002` 缩放保留为 `0.4`。
- 不用 CSS 或布局 hack 掩盖 100% 缩放后的显示问题。
- 不删除用户提供的普通原图。
- 不用 placeholder、旧派生图、旧 manifest 或默认图兜底。
- 不让 manifest 缺状态仍继续运行。
- 不因为服务器或其它游戏 scene 查不到 symbol 就改变 `symbolsviewer` 的资源合同。
- 不在 app 内复制 `rendercore` 已有的 symbol 状态图、动画状态机或 Pixi symbol runtime 逻辑。

## 7. 任务报告要求

完成后新增：

```text
tasks/55-symbolsviewer-symbols002-art-refresh-[utctime].md
```

报告必须包含：

- 实际 UTC 时间和报告文件名。
- 本次修改的文件清单。
- `assets/symbols002` 普通图、`spinBlur`、`disabled` 的最终尺寸结论。
- `assets/symbols002/symbol-state-textures.manifest.json` 的 symbol 列表。
- `assets/gamecfg002/gameconfig.json` 的 `symbolCodes` 和 `reels` 摘要。
- `symbols002` 缩放从 `0.4` 改成 `1` 的说明。
- `Set` selector 验收结果。
- 执行过的命令及结果。
- 浏览器验收结果；若未执行，必须明确写“未执行”及原因。
- 是否更新 `agents.md`；若未更新，说明未新增长期协作规则。
- 仍存在的风险或后续任务，例如 `assets/symbols003` 后续接入应另开任务处理。

## 8. 二次检查清单

交付前必须再检查一遍，确保没有遗漏：

- `symbols002` 普通图和派生状态图尺寸一致。
- `symbol-state-textures.manifest.json` 没有引用不存在的 PNG。
- `gameconfig.json` 是从 `assets/gamecfg002/*.xlsx` 重新生成，不是手写拼接。
- `apps/symbolsviewer/src/symbol-set-config.ts` 没有出现 `"symbols003"`。
- `symbols002` scale 测试断言是 `1`，不是 `0.4`。
- README 没有留下 40% 或旧尺寸描述。
- 测试没有为了迁就旧派生图而放松 `spinBlur` / `disabled` 必需状态。
- 浏览器切换 set 后旧 Pixi 对象和状态面板不残留。
- `agents.md` 是否需要更新已经判断并写入报告。
- `git diff --check` 通过。
