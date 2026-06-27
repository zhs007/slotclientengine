# symbolsviewer symbol scale json 任务计划

## 1. 任务目标

更新 `apps/symbolsviewer` 及相关共享资源配置，让每套 symbols 的 JSON 明确承载每个 symbol 的显示缩放系数。

本任务的核心合同：

- 在每个 `symbol-state-textures.manifest.json` 的每个 symbol 配置里加入 `scale`。
- `scale` 的语义是该 symbol 的显示缩放系数，必须是有限正数。
- schema 默认值是 `1`；本次迁移后仓库内生成出来的 manifest 必须显式写出 `scale`，不能依赖遗漏字段。
- `assets/symbols001` 是 `game002` 的 `skin=1` symbol 资源，当前每个 symbol 的 `scale` 必须是 `0.8`。
- 其它已有 symbol set 默认 `scale` 为 `1`：
  - `assets/symbols`
  - `assets/symbols002`
  - `assets/symbols003`
- `apps/symbolsviewer` 读取 JSON 中的 scale，不再在 viewer 配置里手写 `symbols002` / `symbols003` 的 scale map 作为源数据。
- `apps/game002` 已经有 `skin=1`，也必须从对应 manifest JSON 读取 scale，避免 viewer 与真实 game runtime 漂移。
- 继续保持 fail-fast：非法 scale、缺 manifest、缺状态图、缺普通图、未知 state、缺皮肤贴图都要显式失败，不加隐藏 fallback。
- 如果测试导致一些奇怪写法，修改测试，不要改不该改的 production 逻辑。
- 任务完成后写中文任务报告。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、资源生成、测试、文档、协作规则同步和最终报告。

任务完成后必须新增中文任务报告：

```text
tasks/59-symbolsviewer-symbol-scale-json-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/59-symbolsviewer-symbol-scale-json-260627-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。`packages/rendercore` 已有生成状态图需要的脚本和 `sharp` devDependency。若确实需要新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果 `pnpm` 在非交互环境中出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用下面形式重跑同一命令，不要为了绕过安装问题改业务代码：

```bash
CI=true pnpm --filter symbolsviewer test
```

当前实际协作规则文件是：

```text
agents.md
```

本任务会把 symbol 显示缩放的数据源固定到 symbol manifest JSON，属于后续容易遗漏的协作规则。实现完成后应同步更新 `agents.md`，写明 game002 系列 symbols 的 `scale` 必须随 manifest 维护，`skin=1` 为 `0.8`，其它未特殊声明的 set 为 `1`，consumer 不应再手写独立 scale 源。

## 3. 当前已知事实

### 3.1 symbols JSON 现状

当前需要处理的 manifest：

```text
assets/symbols/symbol-state-textures.manifest.json
assets/symbols001/symbol-state-textures.manifest.json
assets/symbols002/symbol-state-textures.manifest.json
assets/symbols003/symbol-state-textures.manifest.json
```

当前这些 manifest 的每个 symbol 结构类似：

```json
{
  "normal": "./WL.png",
  "spinBlur": "./WL.spinBlur.png",
  "disabled": "./WL.disabled.png"
}
```

本任务完成后应变为：

```json
{
  "normal": "./WL.png",
  "spinBlur": "./WL.spinBlur.png",
  "disabled": "./WL.disabled.png",
  "scale": 1
}
```

`assets/symbols001` 中每个 symbol 应为：

```json
{
  "normal": "./WL.png",
  "spinBlur": "./WL.spinBlur.png",
  "disabled": "./WL.disabled.png",
  "scale": 0.8
}
```

### 3.2 当前 set 和 skin

`apps/game002` 已经有三套 skin：

```text
skin=1 -> assets/game002-s1/bg.jpg + assets/symbols001
skin=2 -> assets/game002/bgfull.jpg + assets/symbols002
skin=3 -> assets/game003/bg.jpg + assets/symbols003
```

`skin=1` 当前 display symbols：

```text
WL, H1, H2, L1, L2, L3, L4, CN, BN
```

`BN` 是显式透明图标，只能作为明确配置的空图标或明确服务器映射边界的兜底入口；不要在通用 catalog 中静默吞掉缺图、缺 manifest 或缺配置错误。

当前 `apps/symbolsviewer/src/symbol-set-config.ts` 已有：

```text
symbols
symbols002
symbols003
```

执行时若 `symbolsviewer` 仍未注册 `symbols001`，本任务必须顺手补上；如果执行前其它任务已经注册了 `symbols001`，则按本任务的 scale JSON 合同更新现有实现，不重复造一套配置系统。

### 3.3 当前 scale 源

当前 scale 主要在 TS consumer 中：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/game002/src/symbol-animation-config.ts
```

`apps/symbolsviewer/src/main.ts` 通过 `config.symbolScales` 计算排版和 `renderSymbol.scale.set(scale)`。

`apps/game002/src/game-demo.ts` 通过 `config.symbolScales` 传给 `createReelSymbolRegistry(...)`，`rendercore` 已经会：

- 校验 scale 是正数。
- 用 `texture size * scale` 计算 cell size。
- 在创建 `RenderSymbol` 时应用 scale。

因此本任务不需要重写 `rendercore` 的 reel scale 算法，应该把 scale 数据从 manifest JSON 读出来并传入现有接口。

## 4. 非目标和边界

- 不新增 `assets/gamecfg001`、`assets/gamecfg003`。
- 不把 game config 复制到 symbols 目录。
- 不修改 live 协议、spin/collect 流程、URL query 解析或服务器数据。
- 不在 `apps/symbolsviewer` 或 `apps/game002` 内复制 `rendercore` 已有的 symbol 状态机、动画 resolver、reel registry、grid-cell reel 算法。
- 不把缺失 scale、非法 scale、缺图、缺 manifest 自动改成可运行状态；错误应尽早暴露。
- 不把 `BN` 当作通用缺图 fallback。
- 不用 “如果没有 scale 就任意沿用旧 TS 常量” 的方式掩盖迁移遗漏。
- 不依赖 `dist/`、`coverage/`、`.turbo/` 里的生成物作为源代码合同。

## 5. 实施步骤

### 5.1 现状盘点

从仓库根目录执行：

```bash
git status --short --untracked-files=all
git diff --stat
node -e 'const dirs=["symbols","symbols001","symbols002","symbols003"]; for (const dir of dirs) { const m=require(`./assets/${dir}/symbol-state-textures.manifest.json`); console.log(dir, m.version, m.states.join(","), Object.keys(m.symbols).join(",")); console.log(Object.entries(m.symbols).map(([symbol,value])=>`${symbol}:${Object.prototype.hasOwnProperty.call(value,"scale")?value.scale:"<missing>"}`).join(",")); }'
```

盘点目标：

- 确认四个 manifest 都存在。
- 确认当前是否已经有 `scale` 字段。
- 确认 `assets/symbols001` 的 symbols 是 `WL,H1,H2,L1,L2,L3,L4,CN,BN`，除非执行时美术已经补图并同步更新了相关测试。
- 确认工作区已有用户改动，执行中不得回滚。

### 5.2 更新 rendercore manifest 生成器

修改：

```text
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/tests/symbol/state-texture-generator.test.ts
```

要求：

- 为生成器新增 `--scale` 参数。
- `--scale` 缺省值为 `1`。
- `--scale` 必须解析为有限正数；`0`、负数、`NaN`、空字符串、非数字字符串都必须报错。
- `createManifest(...)` 为每个 selected symbol 写入 `scale`。
- 单图 normal 和 layered normal 都必须带同样的 `scale` 字段。
- 保留现有 `version: 1`、`states: ["spinBlur", "disabled"]` 合同；除非另有明确任务，不升级 manifest version。
- 不覆盖普通原图，只允许生成或更新：
  - `*.spinBlur.png`
  - `*.disabled.png`
  - `symbol-state-textures.manifest.json`

最低测试要求：

- 未传 `--scale` 时，生成 manifest 中每个 symbol 的 `scale` 为 `1`。
- 传 `--scale 0.8` 时，生成 manifest 中每个 symbol 的 `scale` 为 `0.8`。
- layered normal 的 symbol 也写入 `scale`。
- 非法 `--scale` 显式失败。

### 5.3 重新生成四套 symbol manifest

从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json --scale 1
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols001 --output-dir assets/symbols001 --symbols WL,H1,H2,L1,L2,L3,L4,CN,BN --scale 0.8
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF --scale 1
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols003 --output-dir assets/symbols003 --symbols WL,H1,H2,L1,L2,L3,L4,CN,CO --scale 1
```

如果执行时美术已经补齐 `assets/symbols001/WM.png`、`CM.png`、`CO.png` 或 `AF.png`，必须先更新 `symbols001` 的 `--symbols` 列表、viewer set 配置、game002 skin 配置、测试、README 和报告；不要只让 manifest 多出文件而 consumer 不知道。

生成后验证：

```bash
node -e 'const expected={symbols:{scale:1,symbols:["S00","S0","S1","S5","S10","SC","RS","X2","X5","X10"]},symbols001:{scale:0.8,symbols:["WL","H1","H2","L1","L2","L3","L4","CN","BN"]},symbols002:{scale:1,symbols:["WL","H1","H2","L1","L2","L3","L4","WM","CN","CM","CO","AF"]},symbols003:{scale:1,symbols:["WL","H1","H2","L1","L2","L3","L4","CN","CO"]}}; for (const [dir, rule] of Object.entries(expected)) { const m=require(`./assets/${dir}/symbol-state-textures.manifest.json`); if (m.version!==1) throw new Error(`${dir} version`); if (m.states.join(",")!=="spinBlur,disabled") throw new Error(`${dir} states`); const symbols=Object.keys(m.symbols); if (symbols.join(",")!==rule.symbols.join(",")) throw new Error(`${dir} symbols ${symbols.join(",")}`); for (const symbol of symbols) { const scale=m.symbols[symbol].scale; if (scale!==rule.scale) throw new Error(`${dir}/${symbol} scale ${scale}`); } } console.log("symbol manifest scales ok");'
```

再确认生成器没有覆盖普通原图：

```bash
git diff --stat -- assets/symbols assets/symbols001 assets/symbols002 assets/symbols003
```

如果 PNG 也发生变化，必须检查是否只是生成器重新生成 `spinBlur` / `disabled`。普通原图如 `WL.png`、`BN.png`、`SC-0.png` 等不应被覆盖。

### 5.4 抽取 manifest scale 解析能力

修改：

```text
apps/symbolsviewer/src/symbol-assets.ts
apps/game002/src/assets.ts
```

要求：

- manifest symbol 允许字段：
  - `normal`
  - `spinBlur`
  - `disabled`
  - `scale`
- `scale` 未提供时按 schema 默认值 `1` 解析；但本次迁移后的仓库 manifest 必须显式写出 `scale`，consumer 配置创建和验收脚本应以显式字段为通过条件。
- `scale` 非数字、非有限数、`<= 0` 时显式抛错，错误信息包含 symbol 名和 `scale`。
- 如果 manifest symbol 出现未知字段，显式抛错，不要静默忽略。
- 导出 helper，供 consumer 直接从 manifest 生成 `ReelSymbolScaleMap`：
  - `apps/symbolsviewer/src/symbol-assets.ts` 建议导出 `createSymbolScaleMapFromManifest(...)`。
  - `apps/game002/src/assets.ts` 建议导出 `createGame002SymbolScaleMapFromManifest(...)`。
- helper 应支持传入 display symbols，并能在 consumer 配置创建时要求目标 display symbols 每个都显式声明 scale。
- 对于 `symbolsviewer`，如果 catalog 最终 displayable symbol 没有 scale，应抛错，不要在 UI 层 `?? 1` 静默继续。
- 对于 `game002`，只为当前 skin 的 `displaySymbols` 生成 scale map；`emptySymbols` 不参与 reel texture scale，除非该 symbol 同时被当前 skin 显式 display。

注意：

- `rendercore/src/reel/symbol-registry.ts` 已经校验 `symbolScales` 中的 symbol 必须存在于 paytable 且 scale 为正数。本任务优先复用它，不要重写 reel registry。
- `symbolsviewer` 使用 URL 字符串资源，`game002` 使用加载后的 Pixi Texture，二者的 manifest parser 可以各自存在，但 scale 校验语义必须一致。

### 5.5 更新 symbolsviewer

修改：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/src/symbol-animation-config.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/README.md
```

要求：

- `SymbolSetConfig.symbolScales` 改为由 manifest helper 创建，不再手写 `createUnitScaleMap(...)` 作为数据源。
- `apps/symbolsviewer/src/main.ts` 的 `getSymbolScale(...)` 不应继续 `config.symbolScales?.[symbol] ?? 1`；最终 displayable symbol 缺 scale 应抛错。
- 如果当前还没有 `symbols001` set，新增它：
  - id：`symbols001`
  - raw game config：`assets/gamecfg002/gameconfig.json`
  - modules：`assets/symbols001/*.png`
  - manifest：`assets/symbols001/symbol-state-textures.manifest.json`
  - display symbols：`WL,H1,H2,L1,L2,L3,L4,CN,BN`
  - scale：从 manifest 读出，每个为 `0.8`
  - appear profile：与 `symbols002` / `symbols003` 一致，使用 `singleSpriteUnderlayScale(maxScale: 1.6, maxAlpha: 0.4)`
- `SYMBOL_SET_CONFIGS` 建议顺序：

```text
symbols, symbols001, symbols002, symbols003
```

- `symbols002`、`symbols003` scale 从各自 manifest 读出，值为 `1`。
- 第一套 `symbols` 也从 `assets/symbols/symbol-state-textures.manifest.json` 读出 scale，值为 `1`。
- README 说明 scale 已经写在 manifest JSON 中，不再由 viewer 私有 TS 表决定。

最低测试要求：

- 四套 set id 顺序正确。
- `symbols001` 可被 `getSymbolSetConfig("symbols001")` 取到。
- `symbols001.symbolScales` 精确等于 9 个 display symbol 的 `0.8` map。
- `symbols002.symbolScales`、`symbols003.symbolScales` 精确为 `1` map。
- 第一套 `symbols` 的 displayable symbol 也能得到 `1` scale。
- 构造 viewer set 配置和仓库 manifest 验收时，某个 display symbol 缺少显式 scale 或 scale 非法都应失败；低层 parser 的 schema 默认值只用于兼容旧输入，不作为本仓库迁移后的通过条件。
- `symbols001` catalog 使用自己的 PNG glob 和自己的 manifest，不借用 `symbols002` 或 `symbols003`。
- `BN` 在 `symbols001` 中是显式透明 display symbol；它不是通用 fallback。

### 5.6 更新 game002 scale 来源

修改：

```text
apps/game002/src/assets.ts
apps/game002/src/skin-config.ts
apps/game002/src/game-demo.ts
apps/game002/src/symbol-animation-config.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/symbol-animation-config.test.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/README.md
apps/game002/scripts/verify-static-dist.mjs
```

要求：

- `Game002SkinConfig` 增加 `symbolScales`，由当前 skin 的 manifest 解析而来。
- `skin=1` 的每个 display symbol scale 为 `0.8`。
- `skin=2` / `skin=3` 的每个 textured display symbol scale 为 `1`。
- `createGame002Adapter(...)` 创建 runtime 时传入 `skin.symbolScales`，不要继续无条件使用 `DEFAULT_GAME002_REEL_CONFIG.symbolScales`。
- `DEFAULT_GAME002_REEL_CONFIG` 如仍保留，应只代表默认 skin=2，并从 `assets/symbols002/symbol-state-textures.manifest.json` 派生 scale，不再手写固定 TS map。
- 若 `apps/game002/src/symbol-animation-config.ts` 只剩手写 scale map，应删除或改成薄封装，避免它继续作为第二份 source of truth。
- `release:check` 若已经审计三套 skin 资源，应增加 manifest scale 审计：
  - `symbols001` scale 全部为 `0.8`
  - `symbols002` scale 全部为 `1`
  - `symbols003` scale 全部为 `1`

最低测试要求：

- `getGame002SkinConfig("1").symbolScales` 精确等于 `WL,H1,H2,L1,L2,L3,L4,CN,BN -> 0.8`。
- `getGame002SkinConfig("2").symbolScales` 精确等于 `GAME002_DISPLAY_SYMBOLS -> 1`。
- `getGame002SkinConfig("3").symbolScales` 精确等于 `GAME002_SKIN3_DISPLAY_SYMBOLS -> 1`。
- 创建 `skin=1` runtime 时，registry/render symbol 使用 `0.8`，可通过 snapshot 或 test texture 的 `scale.x/scale.y` 断言。
- `skin=1` 对 `WM,CM,CO,AF` 继续显式失败，不因 `BN` 或 scale 默认值变成可渲染。
- 非法 scale manifest 在 game002 parser 中显式失败。

### 5.7 更新 docs 和 agents.md

更新：

```text
apps/symbolsviewer/README.md
apps/game002/README.md
packages/rendercore/README.md
agents.md
```

文档必须说明：

- `symbol-state-textures.manifest.json` 的每个 symbol 可包含且生成后必须包含 `scale`。
- `scale` 默认语义是 `1`，但仓库生成物应显式写出。
- `assets/symbols001` / `skin=1` 的 scale 是 `0.8`。
- `assets/symbols`、`assets/symbols002`、`assets/symbols003` 当前 scale 是 `1`。
- 新增或重新生成 symbol set 时，要用生成器 `--scale` 参数，而不是在 consumer 中手写另一份 scale。
- `BN` 仍然不是通用缺图 fallback。

`agents.md` 建议新增一条类似规则：

```text
game002 系列 symbol manifest 的每个 symbol 必须声明显示 scale；当前 skin=1/symbols001 为 0.8，其它已有 set 为 1。symbolsviewer 和 game002 应从 manifest 读取 scale，不要在 app 内维护第二份手写 scale 表。
```

## 6. 验收命令

从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer build
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 lint
pnpm --filter game002 release:check
git diff --check
```

如果 `pnpm --filter ...` 触发依赖安装或下载失败，先设置代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

如果某个测试因为旧 expected 仍认为 scale 在 TS 中维护，修改测试表达新的 JSON 数据合同，不要为了通过测试保留旧 TS 手写表。

## 7. 浏览器验收

本任务主要由自动化测试验收，但如果时间允许，建议做一次 viewer 浏览器验收。

启动：

```bash
pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 5205
```

在 PC 横屏视口中检查：

- 默认 `symbols` 正常显示。
- `Set` selector 包含 `symbols`、`symbols001`、`symbols002`、`symbols003`。
- 切到 `symbols001` 后显示 `WL,H1,H2,L1,L2,L3,L4,CN,BN`；`BN` 图像透明但 label 和状态应存在。
- `symbols001` 图标按 `0.8` scale 排布，label 不重叠。
- `symbols002` 和 `symbols003` 仍按 `1` scale 排布。
- `normal -> appear -> win -> spinBlur -> disabled` 状态序列仍正常。
- 连续执行 `symbols -> symbols001 -> symbols002 -> symbols003 -> symbols` 至少 3 次，旧 symbol、旧状态面板和旧 Pixi 对象不残留，浏览器 console 无错误。

如果无法做浏览器验收，必须在任务报告中说明未执行原因和剩余风险。

## 8. 任务报告要求

任务完成后新增：

```text
tasks/59-symbolsviewer-symbol-scale-json-[utctime].md
```

报告必须包含：

- 实际修改文件清单。
- 四套 manifest 的最终 symbol 列表和 scale：
  - `assets/symbols`：全部 `1`
  - `assets/symbols001`：全部 `0.8`
  - `assets/symbols002`：全部 `1`
  - `assets/symbols003`：全部 `1`
- 是否新增或更新了 `symbols001` viewer set。
- `game002` 是否已经从 skin manifest 读取 scale。
- 是否更新了 `agents.md`；若未更新，必须说明为什么不需要。
- 执行过的命令和结果。
- 浏览器验收是否执行；若未执行，写明原因。
- 未完成项、风险或后续建议。
- 工作区中与本任务无关的已有改动，说明没有回滚或处理。

## 9. 二次检查清单

交付前必须逐项检查：

- [ ] `tasks/59-symbolsviewer-symbol-scale-json.md` 是当前计划文件。
- [ ] 所有 symbol manifest 中每个 symbol 都有 `scale`。
- [ ] `assets/symbols001` 每个 symbol 的 `scale` 是 `0.8`。
- [ ] 其它三套 manifest 的 `scale` 是 `1`。
- [ ] 生成器支持 `--scale`，默认值为 `1`，非法值 fail-fast。
- [ ] `symbolsviewer` scale 来源是 manifest JSON，不是手写 TS 表。
- [ ] `symbolsviewer` 若注册 `symbols001`，scale 是 `0.8`。
- [ ] `game002` `skin=1` runtime 使用 manifest scale `0.8`。
- [ ] `skin=2` / `skin=3` 没有被错误改成 `0.8`。
- [ ] `BN` 没有变成通用 fallback。
- [ ] 缺图、缺 manifest、非法 scale 都会显式失败。
- [ ] README 和 `agents.md` 已同步新的 scale 数据源规则。
- [ ] 所有验收命令已执行并记录。
- [ ] 已写中文任务报告，文件名符合 UTC 格式。
