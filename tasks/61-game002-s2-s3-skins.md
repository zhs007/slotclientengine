# game002 s2 s3 skins 任务计划

## 1. 任务目标

本任务为 `apps/game002` 新增两套皮肤资源接入，并让 `apps/symbolsviewer` 能直接查看这两套新 symbol。

新增资源目录：

```text
assets/game002-s2
assets/game002-s3
```

最终运行合同：

- `symbolsviewer` 新增两套可选 symbol set：
  - `game002-s2`：读取 `assets/game002-s2` 的 symbol PNG、生成状态图和 manifest。
  - `game002-s3`：读取 `assets/game002-s3` 的 symbol PNG、生成状态图和 manifest。
- 这两套新 symbol manifest 中每个 symbol 的 `scale` 必须显式声明为 `1`。
- `apps/game002` 新增两套 URL skin：
  - `skin=4 -> assets/game002-s2/bg.png + assets/game002-s2` symbols。
  - `skin=5 -> assets/game002-s3/bg.jpg + assets/game002-s3` symbols。
- `skin=4` / `skin=5` 继续复用：
  - `assets/gamecfg002/gameconfig.json`
  - 同一套 live 参数
  - 同一个 URL 传入的 `gamecode`
  - 同一条 spin / collect / grid-cell reel runtime 流程
- `skin` 只决定前端资源路由，不改变服务器、下注、gamecode、token、业务参数、live 协议或本地公开轮带。
- 继续保持 fail-fast：缺 symbol、缺 manifest、缺状态图、非法 scale、非法 skin、背景尺寸错误、scene 里出现当前 skin 没有贴图且不是显式 empty 的 symbol，都必须显式失败。
- 不增加不必要的兜底；不要用 `BN`、其它 skin 的同名图、placeholder、空纹理或自动映射掩盖资源/逻辑错误。
- 如果测试导致一些奇怪写法，修改测试，不要改不该改的 production 逻辑。
- 因为本任务会新增长期 skin / symbol 规则，需要同步更新 `agents.md`；当前仓库也存在 `AGENTS.md`，执行时必须保持两个文件一致，或在报告中说明为什么只更新其中一个。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成资源盘点、实现、测试、文档同步、协作规则同步和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/61-game002-s2-s3-skins-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/61-game002-s2-s3-skins-260629-123456.md
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

本任务原则上不需要新增 npm 依赖。`packages/rendercore` 已有状态图生成脚本和 `sharp`。若确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前新增资产可能是未跟踪文件，执行时必须把它们当作用户输入资产，不要删除或重命名，除非任务实施需要且报告中明确记录原因。

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game002 test
CI=true pnpm --filter symbolsviewer test
```

## 3. 当前实现事实

### 3.1 现有 skin 和 symbol set

当前 `apps/game002` 已支持：

```text
skin=1 -> assets/game002-s1/bg.jpg + assets/symbols001
skin=2 -> assets/game002/bgfull.jpg + assets/symbols002
skin=3 -> assets/game003/bg.jpg + assets/symbols003
```

当前 `apps/symbolsviewer` 已支持：

```text
symbols
symbols001
symbols002
symbols003
```

当前 scale 数据源是各自的 `symbol-state-textures.manifest.json`，consumer 应从 manifest 读取：

```text
assets/symbols001 -> scale 0.8
assets/symbols, assets/symbols002, assets/symbols003 -> scale 1
```

本任务新增的 `assets/game002-s2` 和 `assets/game002-s3` 也必须显式写 `scale: 1`，不能在 `symbolsviewer` 或 `game002` 内维护第二份手写 scale 表。

### 3.2 当前新增资源盘点

执行本计划时必须重新盘点，不要只信任本节快照。当前观察到的新目录文件如下：

```text
assets/game002-s2/CO.png
assets/game002-s2/H1.png
assets/game002-s2/H2.png
assets/game002-s2/L1.png
assets/game002-s2/L2.png
assets/game002-s2/L3.png
assets/game002-s2/L4.png
assets/game002-s2/WL.png
assets/game002-s2/bg.png

assets/game002-s3/AF.png
assets/game002-s3/CM.png
assets/game002-s3/CN.png
assets/game002-s3/CO.png
assets/game002-s3/H1.png
assets/game002-s3/H2.png
assets/game002-s3/L1.png
assets/game002-s3/L2.png
assets/game002-s3/L3.png
assets/game002-s3/L4.png
assets/game002-s3/WL.png
assets/game002-s3/WM.png
assets/game002-s3/bg.jpg
```

当前已确认尺寸：

```text
assets/game002-s2/bg.png -> 2000 x 2000
assets/game002-s3/bg.jpg -> 2000 x 2000
assets/game002-s2/WL.png -> 200 x 200
assets/game002-s3/WL.png -> 200 x 200
```

### 3.3 必须处理的资源缺口

当前 `assets/gamecfg002/gameconfig.json` 的 symbol code 为：

```text
WL=0,H1=1,H2=2,L1=3,L2=4,L3=5,L4=6,WM=7,CN=8,CM=9,CO=10,AF=11,BN=12
```

当前 `reels-001` 公开轮带实际出现：

```text
0,1,2,3,4,5,6,8
```

也就是：

```text
WL,H1,H2,L1,L2,L3,L4,CN
```

因此 `skin=4` 如果继续复用 `assets/gamecfg002/gameconfig.json` 和 `reels-001`，`CN` 是运行时必需贴图。当前 `assets/game002-s2` 没有 `CN.png`，这是前置门禁，不是可忽略的小缺口。

执行规则：

- 如果执行时 `assets/game002-s2/CN.png` 仍不存在，不能声明 `skin=4` 完成。
- 不允许复制 `assets/symbols002/CN.png`、`assets/symbols003/CN.png` 或其它 skin 的 `CN.png` 冒充新资源，除非用户明确提供这个资源决策。
- 不允许用 `BN`、`CO`、空纹理、透明图或 fallback 映射替代 `CN`。
- 正确路径是补齐 `assets/game002-s2/CN.png`，再生成 `CN.spinBlur.png`、`CN.disabled.png` 并写入 manifest。
- 如果产品明确决定 `game002-s2` 不支持 `CN`，则必须另起任务重新设计公开轮带/gameconfig/服务端 scene 合同；本任务不能在 shared `gamecfg002` 下偷偷绕过。

### 3.4 资源目录中的背景图

`assets/game002-s2` 同时包含 `bg.png` 和 symbol PNG。状态图生成命令必须显式传 `--symbols`，避免把 `bg.png` 当作普通 symbol 生成 `bg.spinBlur.png` / `bg.disabled.png`。

`symbolsviewer` 也不能把 `bg.png` 当成 orphan symbol 加进 catalog。实现时必须明确过滤或隔离背景图，并用测试确认 `bg` 不出现在 `displayableSymbols`、`ignoredAssetsWithoutPaytable` 或右侧状态面板里。

## 4. 非目标和边界

- 不新增 `apps/game004`、`apps/game005` 或其它运行 app。
- 不新增 `assets/gamecfg004`、`assets/gamecfg005`。
- 不修改 live 协议、server URL、token、gamecode、下注参数、collect 流程或金额单位。
- 不接触服务器真实轮带；前端 spin 仍只使用本地公开轮带滚动，再叠加服务器目标可见窗口。
- 不把 `skin=4` / `skin=5` 传给服务器；它们只影响前端资源选择。
- 不在 `apps/game002` 内复制 `rendercore` 的 grid-cell reel、symbol 状态机、裁切或 art viewport 算法。
- 不把缺失 symbol 静默渲染为 `BN`。
- 不为了让测试通过而放宽 production fail-fast 合同；如果测试写法奇怪，改测试。
- 不把 `dist/`、`coverage/`、`.turbo/` 里的生成物当作源码合同。

## 5. 实施步骤

### 5.1 前置盘点和门禁

从仓库根目录执行：

```bash
git status --short --untracked-files=all
git diff --stat
find assets/game002-s2 assets/game002-s3 -maxdepth 1 -type f -print | sort
file assets/game002-s2/bg.png assets/game002-s3/bg.jpg assets/game002-s2/WL.png assets/game002-s3/WL.png
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes).map(([k,v])=>`${k}=${v}`).join(",")); console.log([...new Set(cfg.reels["reels-001"].flat())].sort((a,b)=>a-b).join(","));'
```

确认：

- `assets/game002-s2/bg.png` 和 `assets/game002-s3/bg.jpg` 都是 `2000 x 2000`。
- 新 symbol 普通图尺寸符合预期；若不是 `200 x 200`，必须同步调整 release check、README 和报告。
- `assets/game002-s2/CN.png` 是否已经补齐。
- 没有误把 `bg.png` 当 symbol 处理。
- 工作区已有用户改动不会被回滚。

如果 `assets/game002-s2/CN.png` 仍缺失，先停在资产门禁处，在任务报告中写明阻塞；不要继续把 `skin=4` 接入为“运行时支持”。

### 5.2 生成新 symbol 状态图和 manifest

补齐 `assets/game002-s2/CN.png` 后，执行：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game002-s2 --output-dir assets/game002-s2 --symbols WL,H1,H2,L1,L2,L3,L4,CN,CO --scale 1
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game002-s3 --output-dir assets/game002-s3 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF --scale 1
```

生成后必须确认：

```text
assets/game002-s2/symbol-state-textures.manifest.json
assets/game002-s3/symbol-state-textures.manifest.json
```

要求：

- manifest `version` 仍为 `1`。
- `states` 仍只包含 `spinBlur` 和 `disabled`。
- 每个 symbol 都有：
  - `normal`
  - `spinBlur`
  - `disabled`
  - `scale: 1`
- `bg.png` / `bg.jpg` 不进入 manifest。
- 不删除普通 symbol 原图和背景图。

建议用下面命令复核 scale：

```bash
node -e 'for (const dir of ["game002-s2","game002-s3"]) { const m=require(`./assets/${dir}/symbol-state-textures.manifest.json`); console.log(dir, Object.entries(m.symbols).map(([s,v])=>`${s}:${v.scale}`).join(",")); }'
```

### 5.3 更新 symbolsviewer

主要文件：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/symbol-animation-config.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/README.md
```

实现要求：

- `SymbolSetId` 新增：
  - `game002-s2`
  - `game002-s3`
- 新增静态 import：
  - `assets/game002-s2/symbol-state-textures.manifest.json`
  - `assets/game002-s3/symbol-state-textures.manifest.json`
- 新增 Vite glob：
  - `../../../assets/game002-s2/*.png`
  - `../../../assets/game002-s3/*.png`
- `game002-s2` / `game002-s3` 都复用 `assets/gamecfg002/gameconfig.json`。
- `game002-s2` 最终可展示 symbols：

```text
WL,H1,H2,L1,L2,L3,L4,CN,CO
```

- `game002-s3` 可展示 symbols：

```text
WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
```

- 两套新 set 的 `symbolScales` 都从 manifest 读取，且 `requireExplicitScale: true`。
- 两套新 set 的所有 scale 都必须等于 `1`。
- 两套新 set 使用当前单图 underlay 的 appear 动画和默认 win 动画，可复用现有 `createSingleImageUnderlayProfiles()` 模式。
- `game002-s2` 的 `bg.png` 必须被明确排除在 symbol catalog 外。

测试要求：

- `SYMBOL_SET_CONFIGS.map(config => config.id)` 包含新增两套 id。
- `getSymbolSetConfig("game002-s2").symbolScales` 和 `getSymbolSetConfig("game002-s3").symbolScales` 全部为 `1`。
- 两套新 set 的 `createStatefulSymbolAssetMapFromModules(...)` 能创建 normal / `spinBlur` / `disabled`。
- `createSymbolsViewerCatalog(...)` 的 validation 符合预期：
  - `game002-s2` displayable symbols 为 `WL,H1,H2,L1,L2,L3,L4,CN,CO`，缺图 paytable symbol 为 `WM,CM,AF,BN`。
  - `game002-s3` displayable symbols 为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`，缺图 paytable symbol 为 `BN`。
  - `ignoredAssetsWithoutPaytable` 不包含 `bg`。
- 缺 manifest scale、缺状态图、未知 state、背景图误入 symbol catalog 时测试应失败。

### 5.4 更新 game002 skin 配置

主要文件：

```text
apps/game002/src/skin-id.ts
apps/game002/src/skin-config.ts
apps/game002/src/game-layout.ts
apps/game002/src/framework-config.ts
apps/game002/src/game-adapter.ts
apps/game002/src/game-demo.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/tests/env.test.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/README.md
```

实现要求：

- `GAME002_SUPPORTED_SKINS` 从 `["1", "2", "3"]` 扩展为 `["1", "2", "3", "4", "5"]`。
- `parseGame002SkinId(...)` 的错误消息同步更新为只接受 `"1"`、`"2"`、`"3"`、`"4"` 或 `"5"`。
- `Game002SkinConfig` 新增两项：

```text
skin=4:
  id: "4"
  label: "skin 4"
  backgroundLabel: "skin 4 bg.png"
  backgroundUrl: assets/game002-s2/bg.png?url
  symbolModules: assets/game002-s2/*.png
  stateTextureManifest: assets/game002-s2/symbol-state-textures.manifest.json
  displaySymbols: WL,H1,H2,L1,L2,L3,L4,CN,CO
  emptySymbols: BN
  symbolScales: 从 game002-s2 manifest 读取，全部为 1

skin=5:
  id: "5"
  label: "skin 5"
  backgroundLabel: "skin 5 bg.jpg"
  backgroundUrl: assets/game002-s3/bg.jpg?url
  symbolModules: assets/game002-s3/*.png
  stateTextureManifest: assets/game002-s3/symbol-state-textures.manifest.json
  displaySymbols: WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
  emptySymbols: BN
  symbolScales: 从 game002-s3 manifest 读取，全部为 1
```

注意：

- `BN` 是 empty symbol，不要求新目录有 `BN.png`。
- `skin=4` 不支持 `WM`、`CM`、`AF`，scene 里出现这些 code 必须显式失败。
- `skin=5` 不支持 `BN` 贴图，但可把 `BN` 作为显式 empty symbol。
- 不允许 skin 4/5 借用 `symbols002`、`symbols003` 或旧目录里的 symbol。

### 5.5 明确 skin 4/5 布局和 focus

`game002` 的响应式重点区域必须由每套 skin 显式配置。新增 skin 不能隐式复用 `GAME002_DEFAULT_FOCUS_REGION` 或从 `gridLayout.boardFrame` 推导。

执行步骤：

1. 用新背景图确认棋盘位置和 cell 尺寸。
2. 如果 `game002-s2/bg.png` / `game002-s3/bg.jpg` 的棋盘与现有 skin 2/3 完全一致，可以显式新增：

```text
GAME002_SKIN4_GRID_LAYOUT = 当前 120 x 120 默认棋盘
GAME002_SKIN5_GRID_LAYOUT = 当前 120 x 120 默认棋盘
GAME002_SKIN4_FOCUS_REGION = x=637.5, y=330, width=720, height=1080
GAME002_SKIN5_FOCUS_REGION = x=637.5, y=330, width=720, height=1080
```

3. 如果任一新背景的棋盘或视觉重点不同，必须测量并写入独立常量：

```text
GAME002_SKIN4_GRID_LAYOUT
GAME002_SKIN4_FOCUS_REGION
GAME002_SKIN5_GRID_LAYOUT
GAME002_SKIN5_FOCUS_REGION
```

4. 无论数值是否相同，都要在 `skin-config.ts` 中逐 skin 显式引用，不要靠默认值或 fallback。

测试要求：

- `validateGame002BoardFrame(...)` 覆盖 skin 4/5。
- `validateGame002FocusRegion(...)` 覆盖 skin 4/5。
- `createGame002FramePolicy(skin.focusRegion)` 对 skin 4/5 生效。
- `source-boundary.test.ts` 确认 skin 4/5 的 focus region 是显式配置。

### 5.6 更新静态发布检查

更新：

```text
apps/game002/scripts/verify-static-dist.mjs
```

要求：

- `REQUIRED_SKIN_ASSETS` 新增 skin 4/5。
- skin 4 背景检查支持 `bg-*.png`，尺寸 `2000 x 2000`。
- skin 5 背景检查支持 `bg-*.jpg`，尺寸 `2000 x 2000`。
- skin 4/5 的 manifest scale 均检查为 `1`。
- skin 4 symbol 尺寸按实际资源检查；如果全部为 `200 x 200`，写入 `symbolWidth: 200`、`symbolHeight: 200`。
- skin 5 同上。
- 因多个 skin 可能有相同 symbol 文件名和尺寸，release check 不能只靠 `WL-*.png` 这种名字粗略证明资源存在；至少要保留源 manifest scale 审计，并增加对 bundle/source path 的检查，确认构建确实引用了 `assets/game002-s2` 和 `assets/game002-s3` 的资源。
- `bg.png` 不能被当成 symbol 状态图检查。

### 5.7 更新 README 和协作规则

必须更新：

```text
apps/symbolsviewer/README.md
apps/game002/README.md
agents.md
```

当前仓库同时存在：

```text
AGENTS.md
agents.md
```

执行时先确认两者是否一致：

```bash
cmp -s AGENTS.md agents.md
```

如果两者一致，本任务必须同步更新两者。需要写入的长期规则至少包括：

- `game002` 当前支持 `skin=1|2|3|4|5`。
- `skin=4` 映射 `assets/game002-s2/bg.png` 和 `assets/game002-s2` symbols。
- `skin=5` 映射 `assets/game002-s3/bg.jpg` 和 `assets/game002-s3` symbols。
- `assets/game002-s2` / `assets/game002-s3` 的 symbol manifest scale 全部为 `1`。
- `assets/game002-s2/bg.png` 是背景，不是 symbol；viewer / game runtime 不能把它当成 symbol catalog fallback。
- 新 skin 仍复用 `gamecfg002`，不要改 live 参数或泄露服务器真实轮带。

README 更新要求：

- `apps/symbolsviewer/README.md` 增加 `game002-s2` / `game002-s3` 两套 set 的资源、display symbols、scale、缺图 paytable symbol、状态图生成命令和验收点。
- `apps/game002/README.md` 更新 skin 参数表、示例 URL、数据来源、布局/focus、release check 说明和常见失败。
- 所有文档都要明确：缺图时显式失败，不借用其它 skin。

## 6. 验收命令

完成实现后，从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer build
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 lint
pnpm --filter game002 build
pnpm --filter game002 release:check
pnpm format:check
git diff --check
git status --short --untracked-files=all
```

如果 `pnpm` 因非交互环境失败，使用 `CI=true` 重跑同一条命令。如果是依赖下载失败，先设置代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

验收通过标准：

- 新生成的 `assets/game002-s2/*.spinBlur.png`、`*.disabled.png` 和 manifest 存在。
- 新生成的 `assets/game002-s3/*.spinBlur.png`、`*.disabled.png` 和 manifest 存在。
- 两个新 manifest 每个 symbol 都显式 `scale: 1`。
- `symbolsviewer` 可选择 `game002-s2` 和 `game002-s3`，并展示正确 symbol。
- `symbolsviewer` 不展示 `bg`，也不把 `bg` 记为 orphan symbol。
- `game002` URL `skin=4` / `skin=5` 能解析并选中正确资源。
- `skin=4` / `skin=5` 的背景和 symbols 都进入构建产物。
- `skin=4` / `skin=5` 的 `symbolScales` 从 manifest 读取，实际 `RenderSymbol.scale.x/y` 为 `1`。
- `skin=4` 可渲染当前 `reels-001` 和样例 scene 中出现的 `CN`。
- `skin=4` 遇到 `WM`、`CM`、`AF` 时显式失败。
- `skin=5` 遇到 `BN` 时按 empty symbol 处理，不要求 `BN.png`。
- `release:check` 覆盖五套 skin，并能检查 PNG/JPEG 背景尺寸。
- README 和 `agents.md` / `AGENTS.md` 已同步。

## 7. 浏览器验收建议

如果有可用 live 参数，启动：

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

用完整 query 分别打开：

```text
http://127.0.0.1:5206/?skin=4&serverUrl=...&gamecode=...&token=...&businessid=...&clienttype=...&jurisdiction=...&language=...&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
http://127.0.0.1:5206/?skin=5&serverUrl=...&gamecode=...&token=...&businessid=...&clienttype=...&jurisdiction=...&language=...&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

验收：

- 第一屏背景为对应新 skin。
- 棋盘和 symbol 对齐，没有裁切错位。
- 初始 defaultScene 如果存在，能正常显示。
- spin 后最终可见 scene 等于服务器目标 scene。
- 浏览器 console 无缺图、manifest、scale、focus region、scene code 相关错误。

`symbolsviewer` 浏览器验收：

```bash
pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 5205
```

检查：

- Set selector 包含 `game002-s2` / `game002-s3`。
- 切换后画面非空。
- `game002-s2` 显示 `WL,H1,H2,L1,L2,L3,L4,CN,CO`。
- `game002-s3` 显示 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`。
- 两套新 set 的 `normal -> appear -> win -> spinBlur -> disabled` 状态都可见。
- 图标和 label 不重叠，scale 视觉上为 100%。
- 连续切换旧 set 和新 set 多次，旧 Pixi 对象和状态面板不残留。

如果没有 live 参数，报告中明确写“浏览器 live 验收未执行，原因是缺少 live 参数”；不能把单元测试通过写成 live 验收通过。

## 8. 任务报告要求

完成后新增：

```text
tasks/61-game002-s2-s3-skins-[utctime].md
```

报告必须包含：

- UTC 时间戳和执行人。
- 资源盘点结果，特别是 `assets/game002-s2/CN.png` 是否补齐。
- 新增/修改文件清单。
- 新生成的状态图和 manifest 清单。
- skin 4/5 的最终资源映射、display symbols、empty symbols、scale、背景尺寸、布局/focus 数值。
- 是否更新 `agents.md` 和 `AGENTS.md`，以及是否保持一致。
- 执行过的每条验收命令和结果。
- 如果有命令失败，写明失败原因、修复方式和重跑结果。
- 浏览器验收状态；如果未执行，说明原因。
- `pnpm-lock.yaml` 是否变化。
- 最终 `git status --short --untracked-files=all` 摘要。

## 9. 二次遗漏检查清单

提交前必须再检查一遍：

- `assets/game002-s2` 和 `assets/game002-s3` 没有把 `bg` 写入 symbol manifest。
- `assets/game002-s2` 已包含 `CN.png`、`CN.spinBlur.png`、`CN.disabled.png` 和 manifest 条目。
- `game002-s2` / `game002-s3` manifest 每个 symbol 都显式 `scale: 1`。
- `symbolsviewer` 的 set selector、tests、README 都包含新 set。
- `symbolsviewer` catalog validation 不把 `bg` 当 orphan asset。
- `game002` 的 `skin-id.ts`、query parse tests、README URL 示例都接受 `4` / `5`。
- `game002` 的 `skin-config.ts` 没有动态字符串拼资源路径；Vite 资源必须是静态 import 或静态 glob。
- `game002` 的 skin 4/5 没有借用旧 symbol 目录。
- `game002` 的 skin 4/5 都显式配置 `gridLayout` 和 `focusRegion`。
- `source-boundary.test.ts` 仍禁止 app 直接依赖 `netcore`、`uiframeworks`、`logiccore`。
- `verify-static-dist.mjs` 覆盖五套 skin，并能检查 `bg.png`。
- `apps/game002/README.md` 没有仍写 skin 只接受 `1|2|3`。
- `agents.md` 和 `AGENTS.md` 已同步新增长期规则。
- 没有为了测试通过而放宽 production fail-fast。
- 没有修改 live/server/gamecode/bet/collect 合同。
- 没有提交 `dist/`、`coverage/`、`.turbo/` 等生成物，除非任务明确要求。
