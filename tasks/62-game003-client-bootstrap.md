# game003 client bootstrap 任务计划

## 1. 任务目标

本任务初始化 `apps/game003` 基本游戏客户端，接入 `assets/gamecfg003` 的 Excel 配置、`assets/game003-s1` 的背景/转轮框/传送带/symbol 资源，并能通过 live URL 参数完成基本 enter game、spin、展示和 collect 流程。

最终交付目标：

- 生成并提交 `assets/gamecfg003/gameconfig.json`。
- 为 `assets/game003-s1` 生成 `symbol-state-textures.manifest.json`、`*.spinBlur.png`、`*.disabled.png`，每个可展示 symbol 的 `scale` 必须显式为 `1`。
- 新增 `apps/game003` Vite app，第一屏就是游戏画面，不做 landing page。
- `game003` 使用 `@slotclientengine/gameframeworks` 作为 UI / live / logic facade，不直接依赖 `netcore`、`uiframeworks`、`logiccore`。
- `game003` 使用 `@slotclientengine/rendercore` 的普通 reel 能力实现 5 x 5 主转轮；可参考 `apps/game001` 的普通 reel 时序，但不要复制 `game001` 的 locked-axis 特殊表现。
- live spin 只使用本地公开轮带 `assets/gamecfg003/gameconfig.json` 内的 `bg-reel01` 滚动，服务器返回的目标 scene 只作为本轮临时落点窗口，不读取、缓存或泄露服务器真实轮带。
- 横版时使用 `assets/game003-s1/bg1.jpg`，竖版时使用 `assets/game003-s1/bg2.jpg`；判断规则是当前游戏 canvas 逻辑尺寸 `height > width` 时切到竖版。
- 横版和竖版有两套不同的重点区域。这个“横竖屏两套背景 + 两套重点区域选择/映射”的通用适配能力应放在 `packages/rendercore`。
- `mainreelbg`、`conveyor1`、`conveyor2` 的组合和摆放是 `game003` 的游戏特殊实现，必须放在 `apps/game003` 自己的 layout / adapter 中，不放进 `rendercore`。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成资源生成、实现、测试、文档同步、协作规则同步和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/62-game003-client-bootstrap-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/62-game003-client-bootstrap-260629-123456.md
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

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。`packages/rendercore` 已有 `sharp`，可用于 symbol 状态图生成和图片尺寸测试。若确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前 `assets/game003-s1/*` 和 `assets/gamecfg003/*.xlsx` 可能是未跟踪文件，执行时必须把它们当作用户输入资产，不要删除或重命名，除非任务实施需要且报告中明确记录原因。

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter gengameconfig dev -- --paytable assets/gamecfg003/paytable.xlsx --reel assets/gamecfg003/bg-reel01.xlsx --out assets/gamecfg003/gameconfig.json
CI=true pnpm --filter game003 test
```

## 3. 当前输入资产和已验证事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 gamecfg003

输入文件：

```text
assets/gamecfg003/paytable.xlsx
assets/gamecfg003/bg-reel01.xlsx
```

当前已用临时输出验证过现有 `gengameconfig` 能解析这两份 Excel：

```bash
CI=true pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg003/paytable.xlsx \
  --reel assets/gamecfg003/bg-reel01.xlsx \
  --out /tmp/slotclientengine-gamecfg003.json
```

当前临时生成结果观察到：

```text
paytable symbols: 27
reels: bg-reel01
reelCount: 5
reel lengths: 320,270,270,270,270
symbolCodes:
WL=0,H1=1,H2=2,H3=3,H4=4,H5=5,L1=6,L2=7,L3=8,L4=9,L5=10,CO=11,CL=12,BN=13,MT=14,JP1=15,JP2=16,JP3=17,JP4=18,CO1=19,CO2=20,CO3=21,SC=22,MT2=23,MT3=24,MT5=25,BO=26
bg-reel01 当前实际出现:
WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC
```

正式输出路径使用现有仓库约定：

```text
assets/gamecfg003/gameconfig.json
```

不要同时生成 `gamecfg.json` 和 `gameconfig.json` 两份同义文件。若产品后续强制要求文件名为 `gamecfg.json`，必须统一修改 app import、README、release check 和测试，不能保留两份漂移源。

### 3.2 game003-s1 视觉资源

当前观察到的资源：

```text
assets/game003-s1/bg1.jpg        2000 x 2000
assets/game003-s1/bg2.jpg        1174 x 2000
assets/game003-s1/mainreelbg.png 1130 x 824
assets/game003-s1/conveyor1.png  284 x 775
assets/game003-s1/conveyor2.png  934 x 227

assets/game003-s1/WL.png         172 x 158
assets/game003-s1/H1.jpg         172 x 130  当前输入格式不符合 symbol PNG 合同
assets/game003-s1/H2.jpg         172 x 130  当前输入格式不符合 symbol PNG 合同
assets/game003-s1/H3.jpg         172 x 130  当前输入格式不符合 symbol PNG 合同
assets/game003-s1/H4.jpg         172 x 130  当前输入格式不符合 symbol PNG 合同
assets/game003-s1/H5.jpg         172 x 130  当前输入格式不符合 symbol PNG 合同
assets/game003-s1/L1.png         172 x 130
assets/game003-s1/L2.png         172 x 130
assets/game003-s1/L3.png         172 x 130
assets/game003-s1/L4.png         172 x 130
assets/game003-s1/L5.png         172 x 130
assets/game003-s1/SC.png         192 x 142
assets/game003-s1/CL.png         172 x 142
assets/game003-s1/CO.png         172 x 130
```

重要资源事实：

- `H1` 到 `H5` 当前给的是 `.jpg`，这是美术输入格式问题，不应为此扩展共享 symbol 生成器或运行时。
- 执行时先把 `H1.jpg` 到 `H5.jpg` 一次性转成同名 `.png`，后续生成器、manifest、viewer/app asset map 仍沿用现有 PNG symbol 合同。
- 派生状态图仍输出为 PNG：`H1.spinBlur.png`、`H1.disabled.png` 等。
- manifest 的 `normal` 必须引用规范化后的 `./H1.png`，不要引用 `./H1.jpg`。
- `bg1.jpg`、`bg2.jpg`、`mainreelbg.png`、`conveyor1.png`、`conveyor2.png` 都不是 symbol，状态图生成命令必须显式传 `--symbols`，避免把背景或场景部件当成 symbol。

### 3.3 GMI fixture

任务实现时必须新增可解析的 fixture，例如：

```text
apps/game003/tests/fixtures/game003-gmi.ts
```

fixture 必须保留完整 raw GMI 形态，至少包含：

- `defaultScene.values`
- `replyPlay.randomNumbers`
- `replyPlay.results[]`
- 每个 result 的 `clientData.scenes`
- `curGameModParam.mapComponents`
- `bet=5`
- `lines=10`
- `totalwin=0`

附件给出的 5 x 5 scene 必须进入 fixture 测试：

```ts
export const GAME003_DEFAULT_SCENE = [
  [5, 8, 9, 12, 1],
  [3, 1, 8, 4, 10],
  [9, 10, 3, 11, 6],
  [22, 5, 7, 5, 1],
  [6, 5, 7, 2, 8],
] as const;

export const GAME003_SPIN_SCENE = [
  [8, 9, 12, 1, 1],
  [10, 11, 11, 11, 6],
  [1, 1, 10, 10, 5],
  [8, 6, 3, 5, 6],
  [2, 6, 4, 8, 5],
] as const;
```

注意：`GAME003_DEFAULT_SCENE` 中有 `22`，对应当前 paytable 的 `SC`。因此 `SC` 是第一版必需可渲染 symbol。

## 4. 设计合同和边界

### 4.1 app 边界

新增 app：

```text
apps/game003
```

`game003` 应参考 `apps/game002` 的 live URL 参数、framework 接入、Pixi adapter 生命周期、money 格式、static build 和 release check 结构；参考 `apps/game001` 的普通 reel runtime 和 `RenderReelSet` 用法。

必须避免：

- 不新增 `skin=6` 到 `game002`。
- 不把 `game003-s1` 当成 `game002` 的新皮肤。
- 不新增 `apps/game004` 或其它 app。
- 不复制 `rendercore` 的 reel 调度、状态机、裁切或 viewport 映射算法到 app。
- 不复制 `game001` 的 locked-axis 特殊逻辑；`game003` 是 5 列 x 5 行普通主转轮。
- 不直接解析 `gmi.replyPlay` 或直接调用 `collect()`；交给 `gameframeworks`。

### 4.2 rendercore 边界

需要放入 `rendercore` 的是通用适配能力：

- 根据当前 viewport / canvas 逻辑尺寸选择 art variant。
- `height > width` 选择 portrait variant，否则选择 landscape variant。
- 每个 variant 显式声明自己的 `artSize`、`focusRect`、可选 `minMargin`。
- 复用或封装 `calculateFocusedArtViewport(...)` 和 `mapArtRectToViewport(...)`，返回选中的 variant、`visibleRect`、`worldOffset`、`focusRectInViewport`。
- 对 variant 缺失、重复 id、非法 focusRect、focus 加 margin 无法放入当前 viewport、viewport 超出 art 等情况显式失败。

建议新增文件：

```text
packages/rendercore/src/viewport/responsive-art-viewport.ts
packages/rendercore/tests/viewport/responsive-art-viewport.test.ts
```

建议导出 API：

```ts
type ResponsiveArtVariantId = "landscape" | "portrait";

calculateResponsiveArtViewport({
  viewportSize,
  variants: {
    landscape: { artSize, focusRect, minMargin },
    portrait: { artSize, focusRect, minMargin },
  },
});
```

具体命名可以按实现调整，但测试必须覆盖横竖屏选择和两套 focus rect。

不能放入 `rendercore` 的是 game003 场景特化：

- `mainreelbg` 图片。
- `conveyor1` / `conveyor2` 图片。
- `mainreelbg` 和 conveyor 的 10px 间隔。
- 横版 conveyor 在 main reel 左侧且底部对齐。
- 竖版 conveyor 在 main reel 上方且水平居中。
- game003 的 reel frame 校准、symbol 尺寸、conveyor 位置、静态 sprite 层级。

这些都应在：

```text
apps/game003/src/game-layout.ts
apps/game003/src/game-adapter.ts
```

### 4.3 横竖屏 layout 合同

第一版使用 `skin=1`，但 `skin` 仍是 URL query 参数，只接受 `"1"`。

横版：

- 背景：`assets/game003-s1/bg1.jpg`
- art size：`2000 x 2000`
- 主转轴框：`mainreelbg.png`
- 传送带：`conveyor1.png`
- 传送带位于主转轴框左边。
- 传送带和主转轴框之间间隔 `10px`。
- 两张图高度不同，先底部对齐。

竖版：

- 背景：`assets/game003-s1/bg2.jpg`
- art size：`1174 x 2000`
- 主转轴框：`mainreelbg.png`
- 传送带：`conveyor2.png`
- 传送带位于主转轴框上方。
- 传送带和主转轴框之间间隔 `10px`。
- 两张图宽度不同，先水平居中。

重点区域：

- 横版重点区域是横版 `mainreelbg + conveyor1 + 10px gap` 的 union rect。
- 竖版重点区域是竖版 `mainreelbg + conveyor2 + 10px gap` 的 union rect。
- 这两个 focus rect 必须显式配置或由 game003 layout 的纯函数按资源尺寸计算后传给 `rendercore`，不能从某个单一 board frame 推导成默认值。
- 如果后续页面配置改变，必须能分别调整横版和竖版的 focus rect；不要把两套配置绑死成同一个值。

建议第一版的 group 摆放策略：

- 横版 group 尺寸：`284 + 10 + 1130 = 1424` 宽，`max(775,824) = 824` 高。
- 横版 group 初始居中到 `2000 x 2000` art。
- 横版 `conveyor1.y = mainreelbg.y + mainreelbg.height - conveyor1.height`。
- 竖版 group 尺寸：`1130` 宽，`227 + 10 + 824 = 1061` 高。
- 竖版 group 初始居中到 `1174 x 2000` art。
- 竖版 `conveyor2.x = group.x + (group.width - conveyor2.width) / 2`。
- 竖版 `mainreelbg.x = group.x + (group.width - mainreelbg.width) / 2`。

如果视觉验收认为居中不对，执行者应调整 `apps/game003/src/game-layout.ts` 中的 game003 专属坐标，并同步测试、README 和任务报告；不要把这种美术微调上移到 `rendercore`。

### 4.4 主转轮合同

`game003` 是 5 x 5：

```text
columns = 5
visibleRows = 5
reelsName = "bg-reel01"
```

实现要求：

- 使用 `createGameConfig(...)` 读取 `assets/gamecfg003/gameconfig.json`。
- 使用 `gameConfig.getReels("bg-reel01")`。
- 使用 `createReelSymbolRegistry(...)`、`createReelLayout(...)`、`createReelSpinPlan(...)`、`RenderReelSet` 或等价 rendercore 普通 reel API。
- `RenderReelSet` 外层可以由 `game003` 添加 mask / scale / position 以适配 `mainreelbg` 内部转轮窗口，但通用 reel 滚动逻辑不能复制到 app。
- 需要测量 `mainreelbg.png` 内真正的 5 x 5 symbol 可视窗口，写成 `GAME003_REEL_WINDOW_IN_MAIN_REEL_BG` 这类显式配置，并用测试保证它在 `mainreelbg` 内且能整除 5 列/5 行或明确记录非等宽处理。
- 若第一版未能精确测量，可先用一组明确的人工校准常量，但必须在任务报告中记录“需美术验收”的风险，不能让代码用隐式猜测。

stop y 规则：

- 初始化如果 live `defaultScene` 存在，展示该 scene。
- 如果 `defaultScene` 不存在，reel 层保持 hidden，不用本地假数据顶替。
- spin 过程中使用本地公开轮带滚动。
- 如果服务器目标 scene 无法在本地公开轮带反查出连续 stop y，不失败；使用当前列已有 y 或 `0` 作为物理落点，并通过临时 reel strip 注入目标可见窗口。
- 未知 symbol code 或当前 skin 缺资源的 symbol 必须显式失败。

### 4.5 symbol 资源合同

第一版可渲染 symbol 必须至少包括当前公开轮带和 GMI fixture 实际出现的：

```text
WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC
```

生成命令目标：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- \
  --input-dir assets/game003-s1 \
  --output-dir assets/game003-s1 \
  --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC \
  --scale 1
```

执行前必须先完成 `H1.png` 到 `H5.png` 的一次性资产规范化。生成后必须确认：

```text
assets/game003-s1/WL.spinBlur.png
assets/game003-s1/WL.disabled.png
...
assets/game003-s1/H1.spinBlur.png
assets/game003-s1/H1.disabled.png
...
assets/game003-s1/symbol-state-textures.manifest.json
```

manifest 要求：

- `version` 为 `1`。
- `states` 至少包含 `spinBlur` 和 `disabled`。
- 每个可展示 symbol 显式声明 `scale: 1`。
- 普通态的 `normal` 全部引用 `.png`，例如 `./WL.png`、`./H1.png`。
- `bg1`、`bg2`、`mainreelbg`、`conveyor1`、`conveyor2` 不得出现在 manifest 的 `symbols` 中。

symbol 状态合同：

- 复用 `rendercore` 默认 symbol state preset：`normal`、`spinBlur`、`disabled`、`appear`、`win`。
- `spinBlur` 和 `disabled` 是 `game003` 的必需状态贴图，缺任意一个都必须失败。
- `spinBlur -> normal`、`disabled -> normal` 的状态等价语义沿用 `rendercore` / `game002`，但画面仍要按 requested state 使用对应状态图。
- `appear` / `win` 可先使用 `rendercore` 默认单图动画，或复用 `symbols002/game002` 的“主图后方半透明副本放大消退 + 默认扫光”表现；无论选择哪种，都要写入 `apps/game003/src/symbol-animation-config.ts` 或明确说明使用默认 resolver。
- `apps/game003/src/symbol-animation-config.ts` 不维护第二份手写 scale 表；scale 只能从 `assets/game003-s1/symbol-state-textures.manifest.json` 读取。

`paytable` 中当前还有 `BN`、`MT`、`JP1`、`JP2`、`JP3`、`JP4`、`CO1`、`CO2`、`CO3`、`MT2`、`MT3`、`MT5`、`BO` 等没有当前普通 symbol 图片的 code。第一版不要把它们静默映射成 `BN`、透明图、`CO` 或其它 symbol。scene 中出现这些 code 时应显式失败。若后续产品确认某些 code 是空图标或 special overlay，需要另行补齐透明图/特殊渲染配置、测试和 README。

### 4.6 live URL 合同

`game003` 使用 URL query 配置 live 参数，参考 `game002` 的静态配置方式，不从 `import.meta.env`、cookie、localStorage 或远程配置文件读运行参数。

必需参数：

```text
skin=1
serverUrl=<ws/wss url>
gamecode=EfedJuHEaydXNghnmO9KI
token=<token>
businessid=<business id>
clienttype=<client type>
jurisdiction=<jurisdiction>
language=<language>
bet=5
lines=10
times=1
autonums=-1
requestTimeoutMs=30000
```

建议 `parseGame003QueryConfig(...)`：

- `skin` 必须存在且只能是 `"1"`。
- `gamecode` 必须存在且第一版必须等于 `EfedJuHEaydXNghnmO9KI`。
- `serverUrl` 只接受 `ws://` 或 `wss://`；HTTPS 页面下必须使用 `wss://`。
- 所有参数不允许重复、不允许空字符串、不允许未编码空白。
- token 中可能出现 `+`、`&`、`=`，README 示例必须提示用 `encodeURIComponent()`。

示例：

```text
http://127.0.0.1:5208/?skin=1&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=EfedJuHEaydXNghnmO9KI&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
```

## 5. 实施步骤

### 5.1 前置盘点

从仓库根目录执行：

```bash
git status --short --untracked-files=all
git diff --stat
find assets/gamecfg003 assets/game003-s1 -maxdepth 1 -type f -print | sort
file assets/game003-s1/bg1.jpg assets/game003-s1/bg2.jpg assets/game003-s1/mainreelbg.png assets/game003-s1/conveyor1.png assets/game003-s1/conveyor2.png
file assets/game003-s1/WL.png assets/game003-s1/H1.jpg assets/game003-s1/H2.jpg assets/game003-s1/H3.jpg assets/game003-s1/H4.jpg assets/game003-s1/H5.jpg assets/game003-s1/L1.png assets/game003-s1/L2.png assets/game003-s1/L3.png assets/game003-s1/L4.png assets/game003-s1/L5.png assets/game003-s1/SC.png assets/game003-s1/CL.png assets/game003-s1/CO.png
```

确认：

- `bg1.jpg` 是 `2000 x 2000`。
- `bg2.jpg` 是 `1174 x 2000`。
- `mainreelbg.png`、`conveyor1.png`、`conveyor2.png` 尺寸与本计划一致，若不一致，先更新本计划中的实现常量和测试期望。
- `H1.jpg` 到 `H5.jpg` 只是待规范化输入，后续必须生成 `H1.png` 到 `H5.png` 作为 symbol 普通态。
- 没有 `.DS_Store`、coverage、dist、node_modules 等生成物被误纳入源码变更。

### 5.2 生成 gameconfig

执行：

```bash
CI=true pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg003/paytable.xlsx \
  --reel assets/gamecfg003/bg-reel01.xlsx \
  --out assets/gamecfg003/gameconfig.json
```

然后用 Node 快速审计：

```bash
node -e 'const cfg=require("./assets/gamecfg003/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes).map(([k,v])=>`${k}=${v}`).join(",")); const reels=cfg.reels["bg-reel01"]; console.log(reels.length, reels.map(r=>r.length).join(",")); console.log([...new Set(reels.flat())].sort((a,b)=>a-b).join(","));'
```

必须确认：

- `reels.bg-reel01` 存在。
- reel count 为 `5`。
- 所有 reel symbol code 都存在于 paytable。
- 生成文件稳定格式为两个空格缩进并以换行结尾。

### 5.3 规范化 H1-H5 普通 symbol PNG

不要为了 `H1.jpg` 到 `H5.jpg` 扩展 `rendercore` 的通用 symbol 生成器。先把错误格式的输入图一次性转成 PNG：

```bash
CI=true pnpm --dir packages/rendercore exec node --input-type=module -e '
import { resolve } from "node:path";
import sharp from "sharp";
const repoRoot = resolve(process.cwd(), "../..");
const symbols = ["H1", "H2", "H3", "H4", "H5"];
await Promise.all(
  symbols.map((symbol) =>
    sharp(resolve(repoRoot, `assets/game003-s1/${symbol}.jpg`))
      .png()
      .toFile(resolve(repoRoot, `assets/game003-s1/${symbol}.png`)),
  ),
);
'
```

要求：

- 生成 `assets/game003-s1/H1.png` 到 `assets/game003-s1/H5.png`。
- `H1.jpg` 到 `H5.jpg` 可以保留为原始输入，但 app、manifest、测试和 README 都只把 `.png` 当作 symbol 普通态。
- 不修改 `packages/rendercore/scripts/generate-symbol-state-textures.mjs` 的普通态扩展名规则。
- 不在 app asset map 里支持 JPG symbol 普通态。
- 不把转换命令做成运行时逻辑；这是一次性资产规范化步骤。
- 如果 `pnpm --dir packages/rendercore exec ...` 仍因 workspace wrapper 触发 no-TTY 问题，使用 `packages/rendercore` 下已有的 package-local Node / pnpm 等价执行方式，不要改生产代码或放宽资源合同。

### 5.4 生成 game003-s1 symbol manifest

完成 5.3 并确认 `H1.png` 到 `H5.png` 存在后执行：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- \
  --input-dir assets/game003-s1 \
  --output-dir assets/game003-s1 \
  --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC \
  --scale 1
```

审计 manifest：

```bash
node -e 'const m=require("./assets/game003-s1/symbol-state-textures.manifest.json"); const names=Object.keys(m.symbols).sort(); console.log(names.join(",")); console.log(names.map(n=>`${n}:${m.symbols[n].normal}:${m.symbols[n].scale}`).join("\\n"));'
```

必须确认：

- manifest 只包含 14 个可展示 symbol。
- `H1` 到 `H5` 的 normal 是 `.png`。
- 所有 scale 都是 `1`。
- `bg1`、`bg2`、`mainreelbg`、`conveyor1`、`conveyor2` 不在 symbol 列表。

### 5.5 增加 rendercore responsive art viewport

新增或扩展：

```text
packages/rendercore/src/viewport/responsive-art-viewport.ts
packages/rendercore/src/viewport/index.ts
packages/rendercore/src/index.ts
packages/rendercore/tests/viewport/responsive-art-viewport.test.ts
packages/rendercore/README.md
```

测试必须覆盖：

- `height > width` 选择 portrait。
- `height <= width` 选择 landscape，包括正方形走 landscape。
- 横竖 variant 分别使用自己的 `artSize` 和 `focusRect`。
- 缺失 landscape / portrait variant 失败。
- focusRect 越界失败。
- focus 加 margin 无法放入 viewport 失败。
- 返回的 `visibleRect`、`worldOffset`、`focusRectInViewport` 与现有 `calculateFocusedArtViewport(...)` 语义一致。

如果发现现有 `uiframeworks` 单一 `focusRect` frame policy 无法同时保证横竖两套 focus 区域的 frameDesignSize，优先设计一个通用 orientation-aware frame policy 透过 `uiframeworks` / `gameframeworks` 暴露；该扩展只能处理 DOM frame 尺寸提交，不得承载 game003 的资源名、传送带摆放或美术坐标。禁止在 `apps/game003` 里直接用 CSS/DOM 私有逻辑绕过 framework frame policy。

### 5.6 新增 apps/game003

建议复制并裁剪 `apps/game002` 的 app 骨架，再替换为 game003 专属常量。新增：

```text
apps/game003/package.json
apps/game003/index.html
apps/game003/vite.config.ts
apps/game003/tsconfig.json
apps/game003/tsconfig.eslint.json
apps/game003/eslint.config.cjs
apps/game003/.prettierignore
apps/game003/README.md
apps/game003/src/vite-env.d.ts
apps/game003/src/styles.css
apps/game003/src/main.ts
apps/game003/src/framework-config.ts
apps/game003/src/money.ts
apps/game003/src/skin-id.ts
apps/game003/src/skin-config.ts
apps/game003/src/game-layout.ts
apps/game003/src/assets.ts
apps/game003/src/scene.ts
apps/game003/src/game-demo.ts
apps/game003/src/game-adapter.ts
apps/game003/tests/setup.ts
apps/game003/tests/fixtures/game003-gmi.ts
apps/game003/tests/*.test.ts
apps/game003/scripts/verify-static-dist.mjs
```

`package.json` 应包含：

```json
{
  "name": "game003",
  "type": "module",
  "scripts": {
    "prepare:deps": "pnpm --filter @slotclientengine/gameframeworks build && pnpm --filter @slotclientengine/rendercore build",
    "build": "pnpm run prepare:deps && vite build",
    "dev": "pnpm run prepare:deps && sh -c 'if [ \"$1\" = \"--\" ]; then shift; fi; exec vite \"$@\"' sh",
    "lint": "eslint .",
    "release:check": "pnpm run build && node scripts/verify-static-dist.mjs",
    "test": "pnpm run prepare:deps && vitest run --coverage",
    "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

`.prettierignore` 必须排除：

```text
dist
coverage
```

`vite.config.ts` 建议使用：

- `base: "./"`，方便静态发布。
- dev server 默认端口 `5208`。
- 与 `game001` / `game002` 一样，把 `@slotclientengine/rendercore` alias 到源码，方便测试和本地调试。

`apps/game003/scripts/verify-static-dist.mjs` 不能只是空壳。至少检查：

- `apps/game003/dist/index.html` 存在，且不再引用 `/src/main.ts`。
- `dist/index.html` 的 JS / CSS 资源使用 `./assets/...` 相对路径，不能使用根路径 `/assets/...`。
- `dist/assets` 中能找到 `bg1`、`bg2`、`mainreelbg`、`conveyor1`、`conveyor2` 的构建产物，尺寸与源文件一致。
- `dist/assets` 中能找到 14 个普通 symbol PNG、14 个 `spinBlur` PNG、14 个 `disabled` PNG 的构建产物。
- 源 manifest 中 14 个可展示 symbol 都有显式 `scale=1`，且 `H1..H5` 的 `normal` 引用 `.png`。
- 构建产物或 bundle 中不应出现 `H1.jpg` 到 `H5.jpg` 作为运行时 symbol 引用；JPG 只允许作为源输入留在 `assets/game003-s1`。
- 构建产物不包含真实 token、测试 server URL 或其它示例密钥。因为 `dist/` 常被 `.gitignore` 忽略，secret / URL 扫描必须使用 `rg --no-ignore`。
- `release:check` 失败信息要指出缺失资源或非法配置的具体路径，不能只抛泛化错误。

### 5.7 game003 layout 和 adapter

`apps/game003/src/game-layout.ts` 必须包含：

- `GAME003_SKIN1_LANDSCAPE_ART_SIZE = { width: 2000, height: 2000 }`
- `GAME003_SKIN1_PORTRAIT_ART_SIZE = { width: 1174, height: 2000 }`
- 静态资源尺寸常量。
- 横版/竖版 scene parts 的计算函数。
- 横版/竖版 focus region 的显式计算或配置。
- 主 reel window 的显式校准常量。
- `createGame003FramePolicy(...)` 或等价 framework frame policy helper。
- `createGame003Layout({ viewportSize })`，内部调用 rendercore 的 responsive art viewport API。

`apps/game003/src/game-adapter.ts` 必须：

- 加载当前 orientation 所需背景，但可以预加载 `bg1` 和 `bg2` 以避免切换闪烁。
- 加载 `mainreelbg`、`conveyor1`、`conveyor2` 并校验尺寸。
- 加载 symbol normal/state textures 并校验 manifest。
- mount 时创建 Pixi app，把 canvas 放到 `context.gameLayer`。
- resize / orientation change 时，只更新 renderer size、world offset、背景 texture、scene part 位置和 reel layer 位置，不重建 live/framework。
- destroy 时移除 ticker、canvas、viewport listener。
- ticker delta 做上限保护，避免调试暂停后一帧跳完整局动画。

### 5.8 game003 普通 reel runtime

`apps/game003/src/game-demo.ts` 应建立 `Game003ReelRuntime`，职责类似 `game002` 的 `createGame002ReelRuntime`，但使用普通 `RenderReelSet`：

- 读取 `assets/gamecfg003/gameconfig.json`。
- 校验 `bg-reel01` 有 5 reels。
- 校验 scene 为 5 x 5。
- 校验 scene code 存在于 paytable。
- 校验 scene symbol 是当前 `skin=1` 可渲染 symbol。
- 创建 `ReelSymbolRegistry`，required state textures 至少为 `["spinBlur", "disabled"]`。
- 使用 manifest scale map，全部 scale 为 `1`。
- `applyScene(scene)` 显示初始 scene。
- `spinToScene(scene)` 生成普通 reel spin plan，注入目标可见窗口。
- spin 完成后 snapshot 可见 scene 必须等于目标 scene。

如果当前 `RenderReelSet` / `RenderReel` 还不支持普通 reel 在目标窗口无法反查 stop y 时注入目标 visible symbols，应在 `packages/rendercore` 为普通 reel 补齐通用能力，不能在 `game003` 里复制临时轮带逻辑。grid-cell 已有类似思路，普通 reel 也应保持同样的本地公开轮带边界。

若需要补 `rendercore` 普通 reel 能力，至少同步修改并测试：

```text
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/reel/render-reel-set.ts
packages/rendercore/src/reel/spin-strip.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/tests/reel/render-reel.test.ts
packages/rendercore/tests/reel/render-reel-set.test.ts
packages/rendercore/tests/reel/spin-strip.test.ts
packages/rendercore/README.md
```

验收点：

- 普通 reel spin plan 可接收每列目标可见窗口或等价配置。
- 运动阶段仍从本地公开轮带读取滚动内容。
- 当前可见窗口和目标可见窗口只融合到本次临时 strip。
- 完成后 `RenderReelSet.getVisibleScene()` 等于目标 scene。
- `getStopYCoordinates()` / `findStopYCandidates()` 找不到完整候选时不成为 live spin fatal gate。
- 未知 code、缺资源、缺状态贴图仍由 registry / runtime 显式失败。

### 5.9 symbolsviewer 可选接入

本任务主要目标是 `game003` app，但为了验收 symbol manifest，建议同步让 `apps/symbolsviewer` 支持 `game003-s1`：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/symbol-animation-config.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/README.md
```

如果接入 viewer：

- `game003-s1` 使用 `assets/gamecfg003/gameconfig.json`。
- 普通态都使用规范化后的 PNG 进入 asset map。
- 可展示 symbol 是 `WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC`。
- scale 全部为 `1`。
- 背景和 scene part 不显示为 symbol。

如果本任务不接入 viewer，必须至少用 `game003` 自身测试覆盖 manifest normal/state/scale 和规范化 PNG 普通态加载。

### 5.10 README、agents 和报告同步

必须新增：

```text
apps/game003/README.md
```

README 至少包含：

- 资源来源和路径。
- `gameconfig.json` 生成命令。
- symbol 状态图生成命令。
- 横竖屏背景切换规则。
- 横竖屏 focus region 与 mainreel/conveyor 的职责边界。
- live URL 参数表和示例。
- 本地公开轮带边界。
- 运行、测试、构建、release check 命令。

因为本任务会新增长期协作规则，必须同步更新：

```text
agents.md
```

需要新增的规则要点：

- `game003` 使用 `assets/gamecfg003/gameconfig.json` 和 `assets/game003-s1`。
- `game003-s1` 的横竖屏背景和重点区域选择属于 `rendercore` 的通用适配能力。
- `game003` 的 `mainreelbg` / `conveyor1` / `conveyor2` 组合是游戏特殊实现，不放入 `rendercore`。
- `game003-s1` symbol manifest scale 必须显式为 `1`；如果美术给到 JPG symbol 普通态，先一次性转成 PNG，不为此扩展共享生成器或运行时。
- `game003` 继续遵守本地公开轮带边界。

## 6. 测试和验收

### 6.1 单元测试

必须新增或更新测试：

```text
packages/rendercore/tests/viewport/responsive-art-viewport.test.ts
apps/game003/tests/framework-config.test.ts
apps/game003/tests/skin-id.test.ts
apps/game003/tests/assets.test.ts
apps/game003/tests/symbol-animation-config.test.ts
apps/game003/tests/game-layout.test.ts
apps/game003/tests/scene.test.ts
apps/game003/tests/game-demo.test.ts
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/framework-flow.test.ts
apps/game003/tests/source-boundary.test.ts
```

关键断言：

- `game003` scene 必须是 5 x 5。
- fixture 可被 `createSlotGameLogicResult(...)` 解析。
- `defaultScene` 和 spin scene 的值与附件示例一致。
- `skin=1` 解析成功，其它 skin 显式失败。
- `gamecode` 缺失、重复、空值、非 `EfedJuHEaydXNghnmO9KI` 显式失败。
- token 中 `%2B` 能保留为 `+`，裸 `+` 导致空白检查失败或被测试覆盖。
- manifest 中每个可展示 symbol 都有显式 `scale=1`。
- `H1..H5` 已规范化为 `.png`，manifest normal 引用 `.png`。
- 缺少 `spinBlur` / `disabled` 会失败。
- `symbol-animation-config` 从 manifest 派生 scale，且不包含第二份手写 scale 表。
- `spinBlur` / `disabled` 请求使用状态贴图，`appear` / `win` 行为与选定的默认或 game002-style profile 一致。
- 背景和 scene part 不进入 symbol asset map。
- 横版选择 `bg1` 和横版 focus region；竖版选择 `bg2` 和竖版 focus region。
- 横版 conveyor 在 main reel 左侧且底部对齐，间隔 10px。
- 竖版 conveyor 在 main reel 上方且水平居中，间隔 10px。
- 普通 reel spin 完成后的 visible scene 等于目标 scene。
- 目标 scene 无法在本地轮带反查 stop y 时不失败，但未知 symbol / 缺资源 symbol 仍失败。
- adapter resize 不重建 framework，不重复注册 ticker/listener。

### 6.2 命令验收

从仓库根目录执行：

```bash
CI=true pnpm --filter gengameconfig lint
CI=true pnpm --filter gengameconfig test
CI=true pnpm --filter gengameconfig typecheck
CI=true pnpm --filter gengameconfig build

CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build

CI=true pnpm --filter @slotclientengine/uiframeworks lint
CI=true pnpm --filter @slotclientengine/uiframeworks test
CI=true pnpm --filter @slotclientengine/uiframeworks typecheck
CI=true pnpm --filter @slotclientengine/uiframeworks build

CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build

CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
```

如果接入 `symbolsviewer`，还必须执行：

```bash
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
```

最终清理检查：

```bash
CI=true pnpm format:check
git diff --check
git status --short --untracked-files=all
```

如果全量 `pnpm format:check` 因已有无关生成物失败，报告中必须列出失败路径，并补跑受影响 package 的 `format:check` 或说明为什么不能补跑。不要修改无关生成物来掩盖问题。

如果任何 `pnpm --filter ...` 验收命令再次触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 且 `CI=true` 仍不能解决，允许改用 package-local `node_modules/.bin/eslint`、`vitest`、`tsc`、`vite`、`prettier` 等等价命令；报告必须写明替代命令和原因。

### 6.3 本地浏览器验收

启动：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

访问示例：

```text
http://127.0.0.1:5208/?skin=1&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=EfedJuHEaydXNghnmO9KI&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
```

需要确认：

- 页面第一屏是游戏画面。
- 参数缺失或非法时页面显式报错。
- 横版 viewport 使用 `bg1`，显示 `mainreelbg + conveyor1`，conveyor 在左侧且底部对齐。
- 竖版 viewport 使用 `bg2`，显示 `mainreelbg + conveyor2`，conveyor 在上方且水平居中。
- 横竖切换时不会重连 live，不会重建 framework，只更新 Pixi 布局。
- defaultScene 存在时初始化展示 5 x 5 scene。
- 点击 Spin 后主转轮使用普通 reel 滚动并落到服务器目标 scene。
- 浏览器 console 无未处理错误。

如当前没有可用真实 token，至少用单元测试的 mock client 覆盖 framework flow，并在报告中标明真实 live 浏览器验收未执行。

## 7. 非目标

- 不实现 game003 bonus、传送带玩法逻辑、奖池 UI 或特殊 overlay。
- 不把 paytable 中没有当前 symbol 图片的 code 静默渲染出来。
- 不把服务器真实轮带带到前端。
- 不把 `mainreelbg` / conveyor layout 放入 `rendercore`。
- 不新增 mock / replay 默认运行模式给生产入口。
- 不为了通过测试放宽生产 fail-fast 合同；如果测试写法奇怪，改测试。
- 不把 `dist/`、`coverage/`、`.turbo/`、`node_modules/` 当成源码合同。

## 8. 最终任务报告要求

完成实现后新增：

```text
tasks/62-game003-client-bootstrap-[utctime].md
```

报告必须包含：

- 实际变更文件列表。
- `assets/gamecfg003/gameconfig.json` 生成命令和输出摘要。
- `H1.jpg` 到 `H5.jpg` 一次性规范化为 `H1.png` 到 `H5.png` 的命令和尺寸摘要。
- `assets/game003-s1/symbol-state-textures.manifest.json` 生成命令和 symbol/scale 摘要。
- 横竖屏 focus region 最终数值。
- 主 reel window 校准数值。
- rendercore 新增 API 名称和职责边界。
- 是否修改了 `uiframeworks` / `gameframeworks` frame policy，若修改说明原因；若未修改说明如何满足两套 focus region。
- URL 参数示例。
- 报告中的 URL 示例必须使用 `TOKEN` / `REDACTED` 占位，不能写入真实 token、真实一次性启动链接或可用密钥。
- 执行过的所有验收命令和结果。
- 浏览器验收结果；若未执行真实 live，说明原因。
- 未解决风险或需要产品/美术确认的点。
- `git status --short --untracked-files=all` 的最终摘要。

## 9. 二次遗漏检查清单

交付前按以下清单复查：

- `apps/game003` 已进入 workspace，`pnpm --filter game003 ...` 可识别。
- `assets/gamecfg003/gameconfig.json` 已提交，不只存在 `/tmp`。
- `assets/game003-s1` 的 generated state textures 和 manifest 已提交。
- `H1..H5.png` 已由输入 JPG 一次性规范化生成，并在 manifest、asset map、build bundle 和测试中使用。
- `bg1/bg2/mainreelbg/conveyor1/conveyor2` 未被当成 symbol。
- `scale=1` 没有被写成 app 内第二份手写表。
- `skin=1` 是唯一 game003 skin。
- `gamecode=EfedJuHEaydXNghnmO9KI` 的约束和示例已进入 README 和测试。
- live 参数不从环境变量或默认值读取。
- 普通 reel 目标窗口无法反查 stop y 时不会破坏本地公开轮带边界。
- 未知 symbol / 缺资源 symbol 仍显式失败。
- 横版和竖版分别有独立 background、focus region、scene part layout。
- `rendercore` 只包含通用 responsive art viewport，不包含 game003 图片名或 conveyor 规则。
- `game003` 没有直接依赖 `uiframeworks`、`netcore`、`logiccore`。
- `apps/game003/.prettierignore` 排除 `dist` 和 `coverage`。
- `apps/game003/README.md` 和 `agents.md` 已同步。
- 任务报告已按 UTC 命名并写入 `tasks/`。
