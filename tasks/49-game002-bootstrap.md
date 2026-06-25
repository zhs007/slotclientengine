# game002 bootstrap 任务计划

## 1. 任务目标

初始化新的可运行游戏 app：

```text
apps/game002
```

`game002` 是第二个 slot 游戏，必须基于当前 `apps/game001` 的实现方式和仓库约束初始化，但使用第二套游戏资源：

```text
assets/game002/bg.jpg
assets/gamecfg002/gameconfig.json
assets/symbols002/*.png
assets/symbols002/symbol-state-textures.manifest.json
```

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成项目初始化、代码实现、测试、验收、协作规则同步判断和最终任务报告。

核心交付：

- 新增 Vite app `apps/game002`，包名 `game002`。
- 第一屏直接是游戏画面，不做 landing page。
- `game002` 只通过 `@slotclientengine/gameframeworks` 接入 live、HUD、spin、`GameLogic`、collect 和金额状态；游戏侧 adapter 只负责 Pixi 渲染与本游戏动画展示。
- `game002` 可以依赖 `@slotclientengine/rendercore` 和 `pixi.js` 做 reels / symbol 渲染，但不要直接依赖 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore`。
- 使用 `assets/game002/bg.jpg` 作为完整背景图。
- 背景图尺寸必须按真实资源锁定为 `1125 x 2000`，Pixi backing size 和 framework `designSize` 也使用该尺寸。
- 游戏区是背景图中间棋盘格，按 `6 x 9` scene 渲染。
- 每个棋盘格逻辑尺寸必须是 `150 x 150`。
- 棋盘区域初始锁定为：

```text
x = 200
y = 400
width = 900
height = 1350
columns = 6
rows = 9
cell = 150
```

若实现时通过截图或像素检查发现美术棋盘与该原点存在明显偏差，必须同步修改布局常量、测试期望和 README，不允许在 runtime 里用模糊自动猜测悄悄修正。

- 默认 live gamecode：

```text
065P8NOEgwdSXFTB6uDqX
```

- 默认 token：

```text
7a82f5ca45b5aa3246b2ad0123272295
```

- 默认 server URL 沿用现有 live 地址：

```text
wss://gameserv.rgstest.slammerstudios.com/
```

- 默认投注参数使用本计划样例 GMI：

```text
bet = 5
lines = 30
times = 1
autonums = -1
```

- `assets/gamecfg002/gameconfig.json` 的 reels 名是：

```text
reels-001
```

- `game002` 必须使用第二套 symbol code 映射：

```text
WL = 0
H1 = 1
H2 = 2
L1 = 3
L2 = 4
L3 = 5
L4 = 6
WM = 7
CN = 8
CM = 9
CO = 10
AF = 11
BN = 12
```

- `BN` 是 empty symbol，不要求存在图片。
- `WL`、`H1`、`H2`、`L1`、`L2`、`L3`、`L4`、`WM`、`CN`、`CM`、`CO`、`AF` 必须从 `assets/symbols002` 加载普通图、`spinBlur` 和 `disabled` 状态图。
- 第二套 PNG 保留原始 `500 x 500`；在 `150 x 150` 格子中显示时，symbol 视觉缩放必须稳定、居中，不允许撑破格子或挤压 HUD。
- 任务完成后新增中文任务报告：

```text
tasks/49-game002-bootstrap-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/49-game002-bootstrap-260625-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

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

本任务原则上不需要新增 npm 依赖。`apps/game002/package.json` 应复用 `apps/game001` 的依赖集合：

```json
{
  "@slotclientengine/gameframeworks": "workspace:*",
  "@slotclientengine/rendercore": "workspace:*",
  "pixi.js": "^8.1.6"
}
```

如确实需要新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

## 3. 当前实现参考

### 3.1 game001 参考边界

当前 `apps/game001` 已经是新游戏应参考的实现：

```text
apps/game001/package.json
apps/game001/vite.config.ts
apps/game001/src/main.ts
apps/game001/src/framework-config.ts
apps/game001/src/game-adapter.ts
apps/game001/src/game-demo.ts
apps/game001/src/game-layout.ts
apps/game001/src/assets.ts
apps/game001/src/scene.ts
apps/game001/src/styles.css
apps/game001/tests/source-boundary.test.ts
apps/game001/tests/env.test.ts
apps/game001/tests/framework-flow.test.ts
apps/game001/tests/game-adapter.test.ts
apps/game001/tests/game-demo.test.ts
apps/game001/tests/game-layout.test.ts
apps/game001/tests/assets.test.ts
apps/game001/README.md
```

`game001` 的重要边界：

- `createSlotGameFramework()` 负责通用 slot shell、HUD、live 连接、enter game、spin、`GameLogic` 转换、余额/下注/win 状态和最终 `collect()`。
- `game001` 提供 `SlotGameAdapter`，只负责把 Pixi canvas 挂到 `context.gameLayer`、加载游戏资源、应用 live `defaultScene`、读取 `GameLogic` 主 scene，并驱动 reels 展示。
- 游戏 app 不直接创建 live client，不直接调用 `collect()`，也不直接依赖底层 live、UI 或 logic 包。
- 需要读取 game config、reels 或 stop y 时，从 `@slotclientengine/gameframeworks` facade 导入 `createGameConfig`、`LogicGameConfig`、`LogicReels`、`SceneMatrix` 等 API / type。
- source-boundary 测试必须阻止 `@slotclientengine/netcore`、`@slotclientengine/uiframeworks`、`@slotclientengine/logiccore` 重新进入 game app 源码。

### 3.2 第二套资源现状

第二套 symbol 已由任务 48 接入 `symbolsviewer`，资源存在：

```text
assets/symbols002/AF.png
assets/symbols002/AF.spinBlur.png
assets/symbols002/AF.disabled.png
assets/symbols002/CM.png
assets/symbols002/CM.spinBlur.png
assets/symbols002/CM.disabled.png
assets/symbols002/CN.png
assets/symbols002/CN.spinBlur.png
assets/symbols002/CN.disabled.png
assets/symbols002/CO.png
assets/symbols002/CO.spinBlur.png
assets/symbols002/CO.disabled.png
assets/symbols002/H1.png
assets/symbols002/H1.spinBlur.png
assets/symbols002/H1.disabled.png
assets/symbols002/H2.png
assets/symbols002/H2.spinBlur.png
assets/symbols002/H2.disabled.png
assets/symbols002/L1.png
assets/symbols002/L1.spinBlur.png
assets/symbols002/L1.disabled.png
assets/symbols002/L2.png
assets/symbols002/L2.spinBlur.png
assets/symbols002/L2.disabled.png
assets/symbols002/L3.png
assets/symbols002/L3.spinBlur.png
assets/symbols002/L3.disabled.png
assets/symbols002/L4.png
assets/symbols002/L4.spinBlur.png
assets/symbols002/L4.disabled.png
assets/symbols002/WL.png
assets/symbols002/WL.spinBlur.png
assets/symbols002/WL.disabled.png
assets/symbols002/WM.png
assets/symbols002/WM.spinBlur.png
assets/symbols002/WM.disabled.png
assets/symbols002/symbol-state-textures.manifest.json
```

第二套 runtime config：

```text
assets/gamecfg002/gameconfig.json
```

生成源文件：

```text
assets/gamecfg002/paytables.xlsx
assets/gamecfg002/reels-001.xlsx
```

如果实现者怀疑 `gameconfig.json` 和 Excel 不一致，使用下面命令重新生成并记录 diff：

```bash
pnpm --filter gengameconfig dev -- --paytable assets/gamecfg002/paytables.xlsx --reel assets/gamecfg002/reels-001.xlsx --out assets/gamecfg002/gameconfig.json
```

只有在确实确认生成产物应更新时才提交 `assets/gamecfg002/gameconfig.json` 变化。不要因为测试写法奇怪而改动资源语义。

## 4. 样例 GMI 验收数据

实现必须把下面样例信息纳入测试 fixture，文件建议：

```text
apps/game002/tests/fixtures/game002-gmi.ts
```

或：

```text
apps/game002/tests/fixtures/game002-gmi.json
```

样例 `defaultScene`：

```json
[
  [2, 2, 3, 5, 5, 4, 4, 4, 3],
  [5, 5, 2, 2, 2, 5, 5, 5, 0],
  [6, 2, 5, 5, 5, 3, 8, 8, 8],
  [1, 4, 4, 4, 8, 8, 2, 2, 4],
  [6, 4, 2, 2, 4, 4, 8, 8, 8],
  [1, 8, 8, 6, 6, 6, 1, 1, 2]
]
```

fixture 中该数组命名为：

```ts
export const GAME002_SAMPLE_DEFAULT_SCENE = Object.freeze([
  Object.freeze([2, 2, 3, 5, 5, 4, 4, 4, 3]),
  Object.freeze([5, 5, 2, 2, 2, 5, 5, 5, 0]),
  Object.freeze([6, 2, 5, 5, 5, 3, 8, 8, 8]),
  Object.freeze([1, 4, 4, 4, 8, 8, 2, 2, 4]),
  Object.freeze([6, 4, 2, 2, 4, 4, 8, 8, 8]),
  Object.freeze([1, 8, 8, 6, 6, 6, 1, 1, 2]),
]);
```

用 `assets/gamecfg002/gameconfig.json` 的 `reels-001` 校验时，必须得到 stop y：

```json
[61, 26, 12, 4, 19, 2]
```

样例 spin 目标 scene：

```json
[
  [6, 2, 2, 3, 3, 2, 3, 3, 5],
  [8, 8, 6, 6, 6, 8, 4, 4, 4],
  [3, 3, 2, 2, 4, 4, 4, 8, 8],
  [3, 3, 3, 1, 4, 4, 4, 8, 8],
  [4, 6, 6, 6, 4, 4, 4, 8, 8],
  [6, 1, 1, 5, 5, 5, 4, 4, 4]
]
```

fixture 中该数组命名为：

```ts
export const GAME002_SAMPLE_SPIN_SCENE = Object.freeze([
  Object.freeze([6, 2, 2, 3, 3, 2, 3, 3, 5]),
  Object.freeze([8, 8, 6, 6, 6, 8, 4, 4, 4]),
  Object.freeze([3, 3, 2, 2, 4, 4, 4, 8, 8]),
  Object.freeze([3, 3, 3, 1, 4, 4, 4, 8, 8]),
  Object.freeze([4, 6, 6, 6, 4, 4, 4, 8, 8]),
  Object.freeze([6, 1, 1, 5, 5, 5, 4, 4, 4]),
]);
```

样例 `replyPlay.randomNumbers`：

```json
[51, 0, 28, 1, 70, 46]
```

用 `assets/gamecfg002/gameconfig.json` 的 `reels-001` 校验样例 spin 目标 scene 时，stop y 必须和 `replyPlay.randomNumbers` 完全一致：

```json
[51, 0, 28, 1, 70, 46]
```

样例金额和结果：

```text
bet = 5
lines = 30
replyPlay.results.length = 1
replyPlay.results[0].coinWin = 315
replyPlay.results[0].cashWin = 1575
totalwin = 1575
```

样例 win results：

```text
result 0: symbol = 4, type = 6, symbolNums = 15, coinWin = 300, cashWin = 1500
result 1: symbol = 3, type = 6, symbolNums = 5, coinWin = 15, cashWin = 75
```

fixture 中必须把这两个 win result 保存成完整对象，不能只保存摘要：

```ts
export const GAME002_SAMPLE_WIN_RESULTS = Object.freeze([
  Object.freeze({
    pos: Object.freeze([
      1, 6, 1, 7, 1, 8, 2, 6, 2, 5, 2, 4, 3, 4, 3, 5, 3, 6, 4, 6, 4, 5, 4, 4, 5,
      6, 5, 7, 5, 8,
    ]),
    type: 6,
    lineIndex: -1,
    symbol: 4,
    mul: 300,
    coinWin: 300,
    cashWin: 1500,
    otherMul: 1,
    wilds: 0,
    symbolNums: 15,
    value: 0,
  }),
  Object.freeze({
    pos: Object.freeze([2, 0, 2, 1, 3, 1, 3, 0, 3, 2]),
    type: 6,
    lineIndex: -1,
    symbol: 3,
    mul: 15,
    coinWin: 15,
    cashWin: 75,
    otherMul: 1,
    wilds: 0,
    symbolNums: 5,
    value: 0,
  }),
]);
```

fixture 不能只保存扁平 scene 数组。必须同时导出一个可被 `@slotclientengine/gameframeworks` 的 `createSlotGameLogicResult()` 解析的 raw spin result，建议结构：

```ts
export const GAME002_SAMPLE_SPIN_RESULT = Object.freeze({
  gmi: {
    defaultScene: toSgc7Scene(GAME002_SAMPLE_DEFAULT_SCENE),
    replyPlay: {
      randomNumbers: [51, 0, 28, 1, 70, 46],
      results: [
        {
          coinWin: 315,
          cashWin: 1575,
          clientData: {
            scenes: [toSgc7Scene(GAME002_SAMPLE_SPIN_SCENE)],
            otherScenes: [],
            results: GAME002_SAMPLE_WIN_RESULTS,
            curGameMod: "basic",
            curGameModParam: {
              historyComponents: ["bg-spin", "bg-win"],
              mapComponents: {
                "bg-spin": {
                  basicComponentData: {
                    usedScenes: [0],
                    usedOtherScenes: [],
                    usedResults: [],
                    usedPrizeScenes: [],
                    srcScenes: [],
                    pos: [],
                    mapUsedSPGrid: {},
                    coinWin: 0,
                    cashWin: 0,
                    targetScene: 0,
                    runIndex: 0,
                    output: 0,
                    strOutput: "",
                  },
                },
                "bg-win": {
                  basicComponentData: {
                    usedScenes: [],
                    usedOtherScenes: [],
                    usedResults: [0, 1],
                    usedPrizeScenes: [],
                    srcScenes: [],
                    pos: [
                      1, 6, 1, 7, 1, 8, 2, 6, 2, 5, 2, 4, 3, 4, 3, 5, 3, 6, 4,
                      6, 4, 5, 4, 4, 5, 6, 5, 7, 5, 8, 2, 0, 2, 1, 3, 1, 3, 0,
                      3, 2,
                    ],
                    mapUsedSPGrid: {},
                    coinWin: 315,
                    cashWin: 1575,
                    targetScene: 0,
                    runIndex: 0,
                    output: 0,
                    strOutput: "",
                  },
                },
              },
              mapVals: { "1": 6, "2": 9, "7": 0 },
              mapStrVals: {},
              firstComponent: "",
              nextStepFirstComponent: "",
            },
            nextGameMod: "basic",
            curIndex: 0,
            parentIndex: 0,
            modType: "",
            prizeCoinWin: 0,
            prizeCashWin: 0,
            jackpotCoinWin: 0,
            jackpotCashWin: 0,
            jackpotType: 0,
          },
        },
      ],
      finished: true,
      stake: null,
      playStartTime: 1782374745199,
    },
  },
  totalwin: 1575,
  results: 1,
});
```

`toSgc7Scene(scene)` 必须把 `SceneMatrix` 转成服务端 GMI 形态：

```ts
function toSgc7Scene(scene: readonly (readonly number[])[]) {
  return Object.freeze({
    values: scene.map((column) => Object.freeze({ values: [...column] })),
    indexes: [],
    validRow: [],
  });
}
```

本任务第一阶段可以只展示最终 target scene，不要求实现 win 连线、cluster 高亮或逐格消除动画。但测试必须保存样例 win result 数据，避免后续误解 `game002` 是 paylines 玩法。

## 5. 实现边界和非目标

必须实现：

- `apps/game002` 可独立 lint/test/typecheck/build。
- `pnpm dev` / root turbo 能发现新 app。
- `game002` 运行时用 `createSlotGameFramework()` 创建 framework。
- `game002` 默认 live 配置使用本计划第 1 节的 gamecode/token/bet/lines。
- `VITE_GAME002_SERVER_URL` 只接受 `ws://` 或 `wss://`，显式传入 `http://`、`https://`、空字符串或非法 URL 必须明确失败。
- 显式传入空 token、空 gamecode、非正数 bet/lines/times/request timeout 或非法 `autonums` 必须明确失败。
- 没有 live `defaultScene` 时，reels 层保持隐藏或空状态，不允许本地随便造一个默认画面。
- live 返回 `defaultScene` 时，adapter 应用该 scene。
- spin 返回 `GameLogic` 后，adapter 播放到 `logic.getStep(0).getScene(0)`。
- adapter 的 `playSpin(logic)` Promise resolve 之后，framework 才能执行 optional collect；adapter reject 时不 collect。
- 所有 scene 必须校验为完整 `6 x 9`，每个 code 必须是非负整数。
- 使用 `assets/game002/bg.jpg` 做背景，尺寸校验为 `1125 x 2000`。
- 使用 `assets/symbols002` 和 `assets/gamecfg002/gameconfig.json` 渲染 6 轴、9 行。
- 样例 default scene 和 spin scene 的 stop y 必须按第 4 节通过测试。
- 转轴结束后可见 scene 必须等于目标 scene；不一致必须抛错进入 error，不允许无声修正。

暂不实现：

- win 连线、cluster 高亮、消除、掉落、respin 或 bonus 表现。
- buy bonus、auto spin 的游戏侧特殊逻辑。
- 新增共享 game template package。
- 修改 `packages/gameframeworks` 的公共流程，除非 game002 初始化过程中发现 facade 缺少必要且通用的 API。若修改公共包，必须扩展公共包测试并在报告中说明原因。
- 修改 `packages/rendercore` 的核心 reels 语义，除非发现它无法表达 `6 x 9` 全轴 reels。若是测试造成奇怪写法，修改测试，不要改不该改的生产逻辑。
- runtime 自动 fallback 到 mock/replay/local scene。用户明确不希望不必要的兜底；逻辑 bug 应尽早暴露。

## 6. 目标文件结构

新增：

```text
apps/game002/
  README.md
  eslint.config.cjs
  index.html
  package.json
  tsconfig.eslint.json
  tsconfig.json
  vite.config.ts
  src/
    assets.ts
    env.ts
    framework-config.ts
    game-adapter.ts
    game-demo.ts
    game-layout.ts
    main.ts
    money.ts
    scene.ts
    styles.css
    symbol-animation-config.ts
    vite-env.d.ts
  tests/
    assets.test.ts
    env.test.ts
    framework-flow.test.ts
    game-adapter.test.ts
    game-demo.test.ts
    game-layout.test.ts
    money.test.ts
    scene.test.ts
    source-boundary.test.ts
    setup.ts
    fixtures/
      game002-gmi.ts
```

如果某个目录先创建但暂时没有文件，必须放 `.keepme`。按本计划完整实现时上述目录都会有文件，不需要 `.keepme`。

可参考复制后改名：

```text
apps/game001/package.json -> apps/game002/package.json
apps/game001/vite.config.ts -> apps/game002/vite.config.ts
apps/game001/tsconfig.json -> apps/game002/tsconfig.json
apps/game001/tsconfig.eslint.json -> apps/game002/tsconfig.eslint.json
apps/game001/eslint.config.cjs -> apps/game002/eslint.config.cjs
apps/game001/index.html -> apps/game002/index.html
apps/game001/src/money.ts -> apps/game002/src/money.ts
apps/game001/tests/setup.ts -> apps/game002/tests/setup.ts
```

复制后必须把所有 `game001` / `GAME001` / `Game001` / `VITE_GAME001` / 页面 title / brand label 改成 `game002` / `GAME002` / `Game002` / `VITE_GAME002`，避免两个 app 的 env、测试和错误消息混淆。

## 7. 具体实施步骤

### 7.1 初始化 app 元数据和工具链

新增 `apps/game002/package.json`：

- `name`: `game002`
- `private`: `true`
- `type`: `module`
- `packageManager`: `pnpm@10.0.0`
- scripts 对齐 `game001`：

```json
{
  "prepare:deps": "pnpm --filter @slotclientengine/gameframeworks build && pnpm --filter @slotclientengine/rendercore build",
  "build": "pnpm run prepare:deps && vite build",
  "dev": "pnpm run prepare:deps && sh -c 'if [ \"$1\" = \"--\" ]; then shift; fi; exec vite \"$@\"' sh",
  "lint": "eslint .",
  "test": "pnpm run prepare:deps && vitest run --coverage",
  "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

依赖：

```json
{
  "@slotclientengine/gameframeworks": "workspace:*",
  "@slotclientengine/rendercore": "workspace:*",
  "pixi.js": "^8.1.6"
}
```

devDependencies 对齐 `game001`。不要新增底层包依赖。

新增 `apps/game002/index.html`，title 为 `game002`。

新增 `apps/game002/vite.config.ts`：

- `base: "./"`
- `server.host: "0.0.0.0"`
- 建议默认 `server.port: 5206`
- `server.fs.allow: [resolve(__dirname, "../..")]`
- test 环境使用 `happy-dom`
- coverage include/exclude 对齐 `game001`
- alias 对齐 `game001` 对 `@slotclientengine/rendercore`、`@slotclientengine/rendercore/reel`、`@slotclientengine/rendercore/symbol` 的源码 alias。

### 7.2 实现 env 和 framework config

新增：

```text
apps/game002/src/framework-config.ts
apps/game002/src/env.ts
```

`env.ts` 只从 `framework-config.ts` re-export，模式对齐 `game001`。

`DEFAULT_GAME002_ENV_CONFIG`：

```ts
export const DEFAULT_GAME002_ENV_CONFIG: Game002EnvConfig = Object.freeze({
  serverUrl: "wss://gameserv.rgstest.slammerstudios.com/",
  token: "7a82f5ca45b5aa3246b2ad0123272295",
  gamecode: "065P8NOEgwdSXFTB6uDqX",
  businessid: "guest",
  clienttype: "web",
  jurisdiction: "MT",
  language: "en",
  bet: 5,
  lines: 30,
  times: 1,
  autonums: -1,
  requestTimeoutMs: 30000,
});
```

支持 env：

```text
VITE_GAME002_SERVER_URL
VITE_GAME002_TOKEN
VITE_GAME002_GAMECODE
VITE_GAME002_BUSINESSID
VITE_GAME002_CLIENTTYPE
VITE_GAME002_JURISDICTION
VITE_GAME002_LANGUAGE
VITE_GAME002_BET
VITE_GAME002_LINES
VITE_GAME002_TIMES
VITE_GAME002_AUTONUMS
VITE_GAME002_REQUEST_TIMEOUT_MS
```

解析规则：

- 缺省值使用 `DEFAULT_GAME002_ENV_CONFIG`。
- 显式空字符串必须失败。
- `serverUrl` 必须经过 `validateLiveServerUrl()`，只允许 `ws://` 或 `wss://`。
- `bet`、`lines`、`times`、`requestTimeoutMs` 必须是有限正数。
- `autonums` 必须是整数。
- `parseGame002FrameworkConfig()` 输出：
  - `live`
  - `betOptions`
  - `initialBetIndex`
  - `spinRequest`

### 7.3 实现布局常量

新增：

```text
apps/game002/src/game-layout.ts
```

必须包含并测试：

```ts
export const GAME002_STAGE_SIZE = Object.freeze({
  width: 1125,
  height: 2000,
});

export const GAME002_ASSET_SIZE = Object.freeze({
  background: Object.freeze({ width: 1125, height: 2000 }),
});

export const GAME002_REELS_NAME = "reels-001";
export const GAME002_REEL_COUNT = 6;
export const GAME002_VISIBLE_ROWS = 9;
export const GAME002_CELL_SIZE = 150;

export const GAME002_BOARD_FRAME = Object.freeze({
  x: 200,
  y: 400,
  width: 900,
  height: 1350,
});
```

建议导出：

- `calculateGame002FrameScale(viewportWidth, viewportHeight)`
- `createGame002Layout()`
- `validateGame002BoardFrame()`
- `createGame002ReelLayerLayout(layout)`

`validateGame002BoardFrame()` 必须校验：

- board frame `x/y/width/height` 是正数或非负数。
- `width === GAME002_REEL_COUNT * GAME002_CELL_SIZE`
- `height === GAME002_VISIBLE_ROWS * GAME002_CELL_SIZE`
- board frame 完全落在 `1125 x 2000` stage 内。

对于 `createReelLayout()`：

- `reelCount = 6`
- `visibleRows = 9`
- `cellWidth = 150`
- `cellHeight = 150`
- `columnGap = 0`
- `bufferRowsBefore` / `bufferRowsAfter` 可沿用默认 `1`。

不要把 symbol 原图尺寸 `500 x 500` 当作 cell size；cell size 必须由棋盘格 `150 x 150` 决定。

### 7.4 实现 scene 校验

新增：

```text
apps/game002/src/scene.ts
```

导出：

- `GAME002_SCENE_WIDTH = 6`
- `GAME002_SCENE_HEIGHT = 9`
- `validateGame002Scene(scene, label)`
- `sceneEquals(left, right)`
- `assertScenesEqual(actual, expected, label)`
- `getReplyPlayResultsLength(gmi)`

`validateGame002Scene()` 必须：

- 校验 `scene` 是 array。
- 校验宽度为 `6`。
- 校验每列是 array。
- 校验每列高度为 `9`。
- 校验每个 code 是非负整数。
- 返回冻结的 `SceneMatrix`。

测试必须覆盖：

- 非数组失败。
- 宽度不是 `6` 失败。
- 某列高度不是 `9` 失败。
- 非整数或负数 code 失败。
- 第 4 节样例 default scene 和 target scene 能通过。

### 7.5 实现 symbol asset loader

新增：

```text
apps/game002/src/assets.ts
```

可参考 `apps/game001/src/assets.ts`，但 `game002` 不需要 `symbol-composites.json`：

- 不要导入 `assets/symbols/symbol-composites.json`。
- 不要要求 layered composite symbols。
- 必须导入并校验 `assets/symbols002/symbol-state-textures.manifest.json`。
- 必须通过 Vite glob 加载：

```ts
import.meta.glob("../../../assets/symbols002/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});
```

导出：

- `GAME002_REQUIRED_STATE_TEXTURES = ["spinBlur", "disabled"] as const`
- `GAME002_DISPLAY_SYMBOLS = ["WL", "H1", "H2", "L1", "L2", "L3", "L4", "WM", "CN", "CM", "CO", "AF"]`
- `GAME002_EMPTY_SYMBOLS = ["BN"]`
- `createGame002SymbolAssetMapFromModules(options)`
- `loadGame002SymbolTextures(assetUrls)`

校验规则：

- manifest version 必须是 `1`。
- manifest states 必须包含 `spinBlur` 和 `disabled`。
- manifest 里每个 display symbol 都必须有普通图、`spinBlur` 图和 `disabled` 图。
- PNG glob 中出现未知 state 文件名必须失败，例如 `WL.blurred.png`。
- manifest 引用不存在的图片必须失败。
- `BN` 不要求图片，且不应出现在 display symbol 里。
- `disabled` 首版可以暂不被 reels 主流程请求，但必须作为资源合同被加载和测试，避免第二套状态图在 game002 里漂移。

### 7.6 实现 symbol 动画配置

新增：

```text
apps/game002/src/symbol-animation-config.ts
```

第二套 symbol 首版可使用 rendercore 默认动画 resolver：

- `spinBlur` 用于转动中。
- `normal` 用于静止展示。
- 可不实现特殊 `appear` / `win` profile。

如果实现者复用 `symbolsviewer` 的 `SYMBOLS002_ANIMATION_PROFILES`，必须复制必要逻辑到 `game002` 或抽出共享代码；不要从 `apps/symbolsviewer/src/*` 直接 import，避免 app 之间互相依赖。

建议 symbol 缩放：

```ts
export const GAME002_SYMBOL_SCALES = Object.freeze(
  Object.fromEntries(
    GAME002_DISPLAY_SYMBOLS.map((symbol) => [symbol, 0.3] as const),
  ),
) satisfies ReelSymbolScaleMap;
```

说明：

- 第二套原图 `500 x 500`。
- `0.3` 缩放后约 `150 x 150`，正好落在棋盘格内。
- 如果实际图标有透明边距导致偏小，可微调到 `0.32` 或 `0.34`，但必须通过截图验收和布局测试固定。

### 7.7 实现 reels runtime

新增：

```text
apps/game002/src/game-demo.ts
```

推荐用 `RenderReelSet` 实现 `6 x 9` 全轴 reels，不要复制 `game001` 的第 4 轴锁定逻辑：

```ts
import {
  RenderReelSet,
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry,
} from "@slotclientengine/rendercore/reel";
```

runtime config：

```ts
export const DEFAULT_GAME002_REEL_CONFIG = Object.freeze({
  reelsName: "reels-001",
  visibleRows: 9,
  emptySymbols: Object.freeze(["BN"]),
  symbolScales: GAME002_SYMBOL_SCALES,
  direction: "forward",
  minimumSpinCycles: 8,
  baseDurationMs: 1700,
  speedSymbolsPerSecond: 56,
  startDelayMs: 80,
  stopDelayMs: 120,
});
```

`createGame002ReelRuntime()` 必须：

- 用 `createGameConfig(rawGameConfig)` 创建 config。
- `gameConfig.getReels("reels-001")`。
- 校验 reels count 是 `6`。
- 创建 `ReelSymbolRegistry`：
  - `emptySymbols: ["BN"]`
  - `symbolScales: GAME002_SYMBOL_SCALES`
  - `texturePolicy.requiredStateTextures: GAME002_REQUIRED_STATE_TEXTURES`
- 创建 `createReelLayout({ reelCount: 6, visibleRows: 9, cellWidth: 150, cellHeight: 150, columnGap: 0 })`。
- 创建 `RenderReelSet`。
- 将 reelSet root 放到 `GAME002_BOARD_FRAME.x/y`。
- `mainReelsLayer.visible` 初始为 `false`。
- `applyScene(scene)`：
  - `validateGame002Scene(scene)`
  - `gameConfig.getStopYCoordinates({ reelsName: "reels-001", sceneName, scene })`
  - `reelSet.resetToFinalYs(finalYs)`
  - 显示 reels 层
  - 返回 finalYs
- `createSpinPlan(scene)`：
  - 校验 scene
  - 通过 `getStopYCoordinates` 得到 finalYs
  - 创建 `createReelSpinPlan()`
- `spinToScene(scene)`：
  - 禁止并发 spin
  - 校验 scene
  - 计算 finalYs
  - 创建 plan
  - 调用 `reelSet.spin(plan)`
  - 记录 target scene / finalYs
- `update(deltaSeconds)`：
  - 调用 `reelSet.update(deltaSeconds)`
  - completed 时必须比较 `reelSet.getVisibleScene()` 和 target scene
  - 不一致时抛错
- `getCurrentScene()`、`getTargetScene()`、`getFinalYs()`、`getVisualSnapshot()` 供测试使用。

注意：

- 样例 scenes 当前可以在 `reels-001` 找到 exact stop，不需要临时轮带注入。
- 但测试必须覆盖第 4 节的 stop y，确保该事实被锁定。
- 如果后续 live 返回无法在本地轮带找到 stop 的 scene，首版应明确失败并进入 error，不要使用本地替代 scene。只有有明确需求时，才参考 `game001` 的 target scene 注入策略做 game002 专用实现。

### 7.8 实现 Pixi adapter

新增：

```text
apps/game002/src/game-adapter.ts
```

可参考 `game001` adapter，但静态资源只有背景图和 reels 层：

- 导入：

```ts
import rawGameConfig from "../../../assets/gamecfg002/gameconfig.json";
import stateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import backgroundUrl from "../../../assets/game002/bg.jpg?url";
```

- glob:

```ts
const rawSymbolAssetModules = import.meta.glob(
  "../../../assets/symbols002/*.png",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;
```

`createGame002Adapter()` 返回 `SlotGameAdapter`。

`mount(context)`：

- 创建 Pixi `Application`。
- `init({ width: 1125, height: 2000, antialias: true, autoDensity: false, resolution: 1 })`。
- `context.gameLayer.replaceChildren(app.canvas)`。
- 并行加载：
  - `bg.jpg` texture，尺寸必须是 `1125 x 2000`
  - symbols002 textures
- 创建 runtime。
- stage 顺序：
  1. 背景图 sprite at `0,0`
  2. reels layer at board frame
- 加入 ticker。

`applyInitialState(state)`：

- 没有 `state.defaultScene` 时直接返回，reels 层保持隐藏。
- 有 `defaultScene` 时校验并 apply。

`playSpin(logic)`：

- 禁止并发动画。
- 读取：

```ts
logic.getStep(0).getScene(0);
```

- 校验为 `6 x 9`。
- runtime spin 到 target scene。
- 返回 Promise，只有 ticker update 完成并通过视觉 scene 校验后 resolve。
- runtime 抛错或视觉校验失败时 reject，停止 ticker，让 framework 进入 error。

`destroy()`：

- reject pending animation。
- remove ticker。
- stop ticker。
- 移除 canvas。
- destroy app。

### 7.9 实现入口和样式

新增：

```text
apps/game002/src/main.ts
apps/game002/src/styles.css
```

`main.ts`：

- 导入 `createSlotGameFramework` 和 `@slotclientengine/gameframeworks/styles.css`。
- 导入 `createGame002Adapter()`。
- 导入 `GAME002_STAGE_SIZE`。
- 导入 `parseGame002FrameworkConfig()`。
- 导入 `formatServerUsdAmount()`。
- `brandLabel: "game002"`。
- `currency: "USD"`。
- `locale: "en-US"`。
- `designSize: GAME002_STAGE_SIZE`。
- `buildSpinRequest: () => config.spinRequest`。
- `onError` 只 `console.error(error)`，不要本地 fallback。

`styles.css`：

- 可对齐 `game001`：

```css
:root {
  background: #08090c;
}

html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  background: #08090c;
}

#app {
  width: 100%;
  height: 100%;
}

.slot-ui-game-layer canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

不要把 HUD 复制到 game002 CSS；HUD 属于 `gameframeworks`。

### 7.10 写 README

新增：

```text
apps/game002/README.md
```

必须包含：

- `game002` 的运行结构。
- 数据来源：
  - `assets/game002/bg.jpg`
  - `assets/gamecfg002/gameconfig.json`
  - `assets/symbols002/*.png`
  - `assets/symbols002/symbol-state-textures.manifest.json`
- 布局：
  - stage `1125 x 2000`
  - board frame `x=200, y=400, width=900, height=1350`
  - cell `150 x 150`
  - scene `6 x 9`
- live env 表，包含所有 `VITE_GAME002_*` 变量和默认值。
- spin 时序：

```text
点击 framework HUD Spin
  -> gameframeworks live spin
  -> gameframeworks 创建 GameLogic
  -> game002 adapter.playSpin(logic) 播放 6x9 reels
  -> reels 展示完成并校验目标 scene
  -> adapter.playSpin resolve
  -> gameframeworks optional collect
  -> HUD 回 idle
```

- 命令：

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
pnpm --filter game002 lint
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
```

- 常见失败：
  - 非 WebSocket URL。
  - 空 env。
  - `bg.jpg` 尺寸不匹配。
  - symbols002 manifest 缺图或未知 state。
  - scene 不是 `6 x 9`。
  - target scene 在 `reels-001` 找不到 stop y。
  - spin 完成后可见 scene 不等于目标 scene。

## 8. 测试计划

### 8.1 env 测试

新增：

```text
apps/game002/tests/env.test.ts
```

覆盖：

- 缺省 env 等于 `DEFAULT_GAME002_ENV_CONFIG`。
- explicit env 覆盖默认值。
- `ws://` 和 `wss://` 可用。
- `http://`、`https://`、非法 URL 失败。
- 显式空 token / gamecode / serverUrl 失败。
- 非正数 bet / lines / times / request timeout 失败。
- 非整数 autonums 失败。

### 8.2 source boundary 测试

新增：

```text
apps/game002/tests/source-boundary.test.ts
```

覆盖：

- 扫描 `src/**/*.ts`、除自身外的 `tests/**/*.ts`、`package.json`、`vite.config.ts`。
- 禁止包含：

```text
@slotclientengine/netcore
@slotclientengine/uiframeworks
@slotclientengine/logiccore
```

- `package.json.dependencies` 必须严格等于：

```json
{
  "@slotclientengine/gameframeworks": "workspace:*",
  "@slotclientengine/rendercore": "workspace:*",
  "pixi.js": "^8.1.6"
}
```

### 8.3 layout 测试

新增：

```text
apps/game002/tests/game-layout.test.ts
```

覆盖：

- stage size 是 `1125 x 2000`。
- background size 是 `1125 x 2000`。
- board frame 是 `{ x: 200, y: 400, width: 900, height: 1350 }`。
- `width === 6 * 150`。
- `height === 9 * 150`。
- board 完全落在 stage 内。
- `createReelLayout` 结果：
  - `reelCount = 6`
  - `visibleRows = 9`
  - `cellWidth = 150`
  - `cellHeight = 150`
  - `columnGap = 0`
- frame scale 函数拒绝非法 viewport。

### 8.4 scene 测试

新增：

```text
apps/game002/tests/scene.test.ts
```

覆盖第 7.4 节所有校验。

### 8.5 fixture / game config 测试

新增或并入：

```text
apps/game002/tests/game-demo.test.ts
apps/game002/tests/fixtures/game002-gmi.ts
```

覆盖：

- `createGameConfig(rawGameConfig).getReelNames()` 包含且只需要使用 `reels-001`。
- `getReels("reels-001").getReelCount()` 是 `6`。
- `gameConfig.getSymbolCode("WL") === 0`。
- `gameConfig.getSymbolCode("BN") === 12`。
- 样例 default scene stop y 是 `[61, 26, 12, 4, 19, 2]`。
- 样例 spin scene stop y 是 `[51, 0, 28, 1, 70, 46]`。
- 样例 spin scene stop y 等于 fixture 的 `randomNumbers`。
- `createSlotGameLogicResult(GAME002_SAMPLE_SPIN_RESULT, { bet: { bet: 5, lines: 30, times: 1 }, userInfo: { gameid: 0 } })` 能解析成功。
- 解析后的 `logic.getDefaultScene()` 等于样例 default scene。
- 解析后的 `logic.getStep(0).getScene(0)` 等于样例 spin scene。
- 解析后的 `logic.getRandomNumbers()` 等于 `[51, 0, 28, 1, 70, 46]`。
- 解析后的 `logic.getTotalWin()` 等于 `1575`。

### 8.6 assets 测试

新增：

```text
apps/game002/tests/assets.test.ts
```

覆盖：

- `createGame002SymbolAssetMapFromModules()` 能用 `assets/symbols002` manifest 建出 12 个 display symbols。
- asset keys 包含 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`。
- asset keys 不包含 `BN`。
- 每个 display symbol 都有 `normal`、`spinBlur` 和 `disabled`。
- 缺少 `spinBlur` 或 `disabled` 文件时报错。
- manifest 引用不存在文件时报错。
- glob 中出现未知 state 文件时报错。
- `loadGame002SymbolTextures()` 能加载 string URL 和已加载 texture。

### 8.7 runtime 测试

新增：

```text
apps/game002/tests/game-demo.test.ts
```

覆盖：

- runtime 初始 reels layer hidden。
- `applyScene(sampleDefaultScene)` 后 layer visible，`finalYs` 是 `[61,26,12,4,19,2]`，可见 scene 等于 sample default scene。
- `spinToScene(sampleSpinScene)` 创建 6 个 axes 的 plan。
- `update()` 到完成后 `getCurrentScene()` 等于 sample spin scene。
- 并发 `spinToScene()` 失败。
- 非 `6 x 9` scene 在动画开始前失败，且不进入 spinning。
- 如果 target scene 找不到 stop y，明确失败，不使用本地替代 scene。

### 8.8 adapter 测试

新增：

```text
apps/game002/tests/game-adapter.test.ts
```

覆盖：

- `mount()` 将 Pixi canvas 放入 framework game layer。
- stage 添加背景和 reels layer。
- `applyInitialState()` 没有 defaultScene 时不应用 scene。
- `applyInitialState()` 有 defaultScene 时调用 runtime apply。
- `playSpin()` 只在 runtime update completed 且视觉校验通过后 resolve。
- `playSpin()` runtime 抛错时 reject 并 stop ticker。
- 并发 `playSpin()` 失败。
- `destroy()` reject pending animation 并清理 canvas/ticker。

### 8.9 framework flow 测试

新增：

```text
apps/game002/tests/framework-flow.test.ts
```

可参考 `game001`：

- 用 fake client 和 fake adapter 创建 `createSlotGameFramework()`。
- 确认 spin request 使用 game002 默认或 explicit 配置：

```json
{ "bet": 5, "lines": 30, "times": 1, "autonums": -1 }
```

- 确认 adapter `playSpin()` resolve 前不 collect。
- resolve 后按 `gameframeworks` collect 规则 collect。
- adapter reject 时不 collect，framework 状态进入 error。
- live `defaultScene` 原样传给 adapter，不发明本地默认 scene。

### 8.10 money 测试

复制或复用 `game001` 的 `money.ts` / `money.test.ts`：

- 服务端金额单位仍按整数传输，`100` 对应 `1` 美元。
- `1575` 展示为 `$15.75`。
- 不改变 spin request 的原始整数协议值。

## 9. 命令验收

实现完成后至少执行：

```bash
pnpm --filter game002 lint
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
```

再执行受影响共享包和相关 app 的快速回归：

```bash
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/rendercore test
pnpm --filter game001 test
pnpm --filter symbolsviewer test
```

最后执行根级质量检查：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

如果根级命令耗时过长或因环境问题失败，必须在任务报告中记录：

- 命令。
- 失败阶段。
- 完整错误摘要。
- 是否已重试。
- 为什么不是代码问题，或后续需要怎么修。

格式化：

```bash
pnpm --filter game002 format
```

或直接：

```bash
pnpm exec prettier --write apps/game002
```

提交前检查：

```bash
git diff --check
git status --short --untracked-files=all
```

## 10. 浏览器验收

启动：

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

浏览器打开：

```text
http://127.0.0.1:5206/
```

必须确认：

- 第一屏是游戏画面，不是 landing page。
- 背景图 `assets/game002/bg.jpg` 完整铺满 framework game layer。
- 画面按 `1125 x 2000` 等比缩放，不变形。
- HUD 来自 `gameframeworks`，没有 game002 自己复制 HUD。
- 6x9 棋盘落在背景图中间棋盘区域。
- 每个 symbol 在 `150 x 150` 格内居中。
- 默认初始连接成功后，如果服务端返回 `defaultScene`，棋盘显示 live default scene。
- 点击 Spin 后进入 spin/presenting，完成后显示服务端 target scene。
- spin 完成前不会 collect；完成后由 framework 执行 optional collect。
- console 没有资源加载错误、尺寸错误、scene 校验错误、未捕获 Promise 错误。

如果 live 服务不可用，不能切到本地 fallback。可以用测试 fake client 验证流程，但浏览器验收报告必须如实写明 live 不可用和错误原因。

## 11. agents.md 同步规则

根目录协作规则文件实际路径是：

```text
agents.md
```

当前已有规则覆盖：

- `apps/` 是可运行项目。
- 后续游戏默认依赖 `@slotclientengine/gameframeworks`。
- 不要直接依赖 `uiframeworks`、`netcore`、`logiccore`，除非在框架内部或任务明确要求。

本任务只是新增 `apps/game002`，原则上不需要更新 `agents.md`。

只有当实现过程中新增了长期仓库协作规则、目录规范、基础脚本或 game002 资源同步规则时，才更新 `agents.md`。如果不更新，任务报告必须写明：

```text
未更新 agents.md：现有规则已覆盖 apps/game002 的 gameframeworks facade 边界和 apps 目录约定，本任务未新增长期协作规则。
```

## 12. 验收标准

代码验收：

- `apps/game002` 文件结构完整。
- `package.json` 依赖边界符合第 6 节和第 8.2 节。
- `main.ts` 使用 `createSlotGameFramework()`。
- `game002` 不直接 import `netcore`、`uiframeworks`、`logiccore`。
- `framework-config.ts` 默认 gamecode/token/bet/lines 与本计划一致。
- `bg.jpg` 尺寸校验为 `1125 x 2000`。
- board frame 固定为 `200,400,900,1350`，或实现者有截图证据和测试说明为什么调整。
- scene 校验固定为 `6 x 9`。
- `reels-001` stop y 测试覆盖第 4 节样例。
- 转轴完成后可见 scene 与目标 scene 不一致会失败。
- 没有本地 mock/replay fallback。

测试验收：

- `pnpm --filter game002 lint` 通过。
- `pnpm --filter game002 test` 通过。
- `pnpm --filter game002 typecheck` 通过。
- `pnpm --filter game002 build` 通过。
- 共享包和相关 app 回归按第 9 节执行并记录。
- 根级 `pnpm lint/test/typecheck/build` 执行并记录。

浏览器验收：

- `http://127.0.0.1:5206/` 可打开。
- 背景、棋盘、symbols、HUD 均可见。
- 6x9 棋盘对齐背景棋盘区域。
- 点击 Spin 可完成至少一局 live spin，或报告中记录 live 服务不可用的明确错误。

文档验收：

- `apps/game002/README.md` 包含运行结构、数据来源、布局、env、命令、失败场景。
- 若更新了 `agents.md`，报告说明原因。
- 若未更新 `agents.md`，报告说明无需更新的原因。
- 新增任务报告 `tasks/49-game002-bootstrap-[utctime].md`。

## 13. 任务报告要求

任务完成后新增：

```text
tasks/49-game002-bootstrap-[utctime].md
```

报告必须用中文，包含：

- 任务摘要。
- 新增/修改文件列表。
- 关键实现说明：
  - gameframeworks facade 边界。
  - game002 live 默认配置。
  - 6x9 scene 和 stop y 校验。
  - 背景和棋盘布局。
  - symbols002 加载策略。
  - collect 边界。
- 测试结果：
  - 每条命令。
  - 是否通过。
  - 失败时的错误摘要和处理。
- 浏览器验收结果：
  - 启动命令。
  - URL。
  - 截图或文字描述。
  - live spin 是否完成。
- `agents.md` 是否更新及理由。
- 未完成事项或后续建议。
- 最终 `git status --short --untracked-files=all` 摘要。

报告命名示例：

```bash
UTC_TS=$(date -u +%y%m%d-%H%M%S)
touch "tasks/49-game002-bootstrap-${UTC_TS}.md"
```

## 14. 二次检查清单

执行者交付前必须逐项检查：

- 目标 tree：`apps/game002` 是否完整，是否有意外空目录。
- 命名替换：是否还残留 `game001`、`GAME001`、`Game001`、`VITE_GAME001`。
- 资源路径：是否全部指向 `assets/game002`、`assets/gamecfg002`、`assets/symbols002`。
- live 配置：gamecode/token/bet/lines 是否为本计划要求。
- facade 边界：source-boundary test 是否阻止底层包 import。
- scene 合同：是否严格 `6 x 9`，没有静默补齐/裁剪。
- stop y：第 4 节样例 default/spin stop y 是否被测试锁定。
- 布局：stage、board、cell 是否被常量和测试锁定。
- 渲染：symbol 是否居中且不撑破格子。
- collect：adapter resolve 前是否不会 collect。
- 错误：资源缺失、scene 错误、stop y 缺失是否明确失败。
- fallback：是否没有 mock/replay/local scene 自动兜底。
- 测试：是否因奇怪测试改了不该改的生产语义；如是，回退并改测试。
- 文档：README 和任务报告是否足够让下一位执行者不看聊天也能理解。
- `agents.md`：是否有必要更新；如果没有，报告是否说明原因。
- 清理：是否没有提交 `dist/`、`coverage/`、临时截图、dev server 输出等生成物，除非仓库明确要求。
- 忽略文件：不要使用 `git add -f` 强行加入 `.DS_Store`、`dist/`、`coverage/`、`.turbo/` 或其它 `.gitignore` 已忽略文件。
