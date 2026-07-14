# game002 otherScenes tiered CN symbol 任务计划

## 1. 任务目标

本任务在当前 `game002` 基础上接入服务端 GMI 的 `bg-gencoins.basicComponentData.usedOtherScenes`：目标 scene 中 symbol 为 `CN` 的格子读取同坐标 `otherScene[x][y]` 原始正整数金额，按 manifest 配置的任意数量 tier 选择对应 Spine 美术，并在该 symbol 上显示 `otherScene` 原始数字。当前 `game002-s3` 配置实例恰好使用 `CN_1.json`、`CN_2.json`、`CN_3.json`、`CN_4.json` 四个新资源，但“四档”和这些文件名都不是 rendercore、game002 app 或 symbolsviewer 的代码合同。

仓库根目录固定为：

```text
/Users/zerro/github.com/slotclientengine
```

本计划是完整执行合同，不能依赖聊天记录、附件、旧任务文档或口头说明。执行者只阅读本文件，即可完成数据接入、manifest schema、rendercore 通用播放器、game002 生命周期、symbolsviewer 预览、资源闭包、测试、文档、协作规则和最终中文任务报告。

最终行为固定如下：

- `logiccore` 已经通用解析 `clientData.otherScenes[]` 和 `basicComponentData.usedOtherScenes`；`gameframeworks` 已经提供 `getComponentOtherScenesByName(...)`。本任务复用现有能力，不从 raw GMI 临时取值，也不重复协议 parser。
- `bg-gencoins` 和 `CN` 是 `apps/game002` 的游戏语义，只能在 game002 app、测试和 README 中配置/识别；`packages/rendercore` 不得硬编码这些字符串，也不得 import GMI/logic component 语义。
- `packages/rendercore` 新增一个职责收敛的、manifest 驱动的“symbol value presentation”能力。调用方只传通用的 `symbol + symbolCode + (x,y) + positive integer value`，rendercore 负责严格解析档位、解析官方 Spine 资源、创建/复用播放器、显示原始整数文本、update、clear 和 destroy。
- 第一版只支持 manifest 明确声明的 Spine value presentation，不建立任意插件系统，不增加 VNI、静态图、首帧或 builtin fallback。
- value-presentation tier 资源不是 paytable symbol，也不加入主 display set；主 display set 仍精确为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`。当前四个新资源只作为 `CN.valuePresentation.tiers[]` 引用的附属 Spine skeleton。
- tier 数量、每档 `maxExclusive`、skeleton/atlas/texture 路径和文件名全部来自 manifest。通用实现必须支持至少 1 档、任意合法档数和任意合法资源名；不得出现 `if (tierCount === 4)`、`CN_${index}`、固定四元素 tuple 或按命名推导档位。
- 当前 `game002-s3` manifest 实例的边界是 `1..9 -> ./CN_1.json`、`10..99 -> ./CN_2.json`、`100..999 -> ./CN_3.json`、`>=1000 -> ./CN_4.json`。边界使用 `maxExclusive=10/100/1000`，不得写成 app `if/else` 或第二份阈值表；换成 1 档、3 档、5 档或完全不同文件名时，只改 manifest 和资源文件并重生成资源闭包，不改 production TypeScript。
- 数字显示为原始 `String(value)`，例如 `2 -> "2"`、`25 -> "25"`、`1000 -> "1000"`；不调用 `formatServerUsdAmount()`，不加 `$`，不做除以 100、千分位或本地化转换。
- 当前工作区中的新美术资源是本任务的权威输入：`assets/game002-s3/CN_1.json` 到 `CN_4.json`、更新后的 `Symbol.atlas` 和 `Symbol.png` 必须直接进入运行和发布闭包。不得回滚、重新导出、替换成 HEAD 旧字节、旧 CN、静态 PNG、默认 CN 或其它 fallback。
- 当前工作区还有 `AF.json`、`CM.json`、`CO.json`、`Nearwin1.json`、`WL.json`、`WM.json` 等用户更新的新 Spine 文件；本任务不得覆盖或回滚这些文件。除非实际实现发现资源自身违反 4.3/atlas/animation 硬合同，否则只读取和验证，不做任务外美术修复。
- 当前配置引用的 `CN_1..CN_4` 都声明 Spine `4.3.23`，并真实包含大小写精确的 `Idle` 动画；当前 manifest 实例均使用 `Idle loop=true`。通用 parser/resolver 不认识这些名字，只校验 manifest 实际引用的每个 tier。未知版本、缺 atlas page/region、缺 skeleton、缺 manifest 指定 animation 或资源错配必须在生成/启动/prepare 阶段显式失败。
- defaultScene 没有 otherScene 时，每个 `CN` 从 manifest 的 `valuePresentation.defaultValues` 候选数组随机取值展示；spin 本地临时轮带中的每个 CN occurrence 也从同一数组取值并随该 occurrence 固定，不能滚动时留空。第 0 step 触发 `bg-gencoins` 时必须刚好使用一个 `otherScene`，最终目标 scene 中每个 `CN` 必须使用服务器 positive safe integer，非 `CN` 必须为 `0`；随机值绝不能覆盖最终服务器值。
- 缺 `basicComponentData`、`usedOtherScenes` 数量不是 1、索引越界、矩阵尺寸不匹配、CN 值为 0/负数/小数/NaN/超过安全整数、非 CN 带非零值、档位缺失、几何 code 不匹配或资源初始化失败，都必须在转轮启动前或展示前显式失败；不能补 0、跳过、钳制或降级为旧 CN。
- value presentation 是实际 reel symbol occurrence 的视觉数据：defaultScene 与本地临时轮带在滚动前即有候选值，档位 Spine/数字跟随 reel slot；最终停轴窗口切到服务器 otherScene 值。它不参与服务器 scene、reel stop、renderPriority、中奖 result 顺序或金额计算，也不额外阻塞 `playSpin()`；服务器资源/data `prepare` 仍必须在 spin 启动前成功。
- 下一次 spin 开始前必须清理上一轮 tier 美术和数字；`applyInitialState()`、adapter destroy 和 mount rollback 也必须清理。viewport resize 后仍应和对应 cell 对齐。
- CN value presentation 属于实际 main-reel symbol slot；world z-order 固定为 background、main reels（含 CN value）、symbol win carousel、global win-amount。它不能盖住中奖金额 overlay 或全局 win-amount。
- 若后续要让 CN 档位响应 `win/appear/collect`，必须另立合同并在 manifest 显式配置对应动画；本任务只实现持续 `Idle`，不得猜测或偷偷切 `Win/Collect`。
- 如果是测试导致一些奇怪写法，应修改测试，不要削弱 production 合同、制造隐藏 fallback 或在 app 中复制 rendercore 私有实现。

任务完成后必须新增中文任务报告：

```text
tasks/94-game002-other-scenes-tiered-cn-symbol-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/94-game002-other-scenes-tiered-cn-symbol-260714-181300.md
```

## 2. 仓库、环境和工作区保护

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试：`vitest`
- lint：`eslint`
- format：`prettier`
- Pixi：v8
- game002 Spine runtime：官方 `@esotericsoftware/spine-pixi-v8` 4.3.x，由 rendercore 封装

执行前先确认环境与工作区：

```bash
cd /Users/zerro/github.com/slotclientengine
node --version
pnpm --version
git branch --show-current
git rev-parse --short HEAD
git status --short --untracked-files=all
git diff --stat
```

制定本计划时的现场快照：

```text
branch: main
HEAD: 882711e
```

制定计划时以下用户美术文件已有未提交修改：

```text
assets/game002-s3/AF.json
assets/game002-s3/CM.json
assets/game002-s3/CN_1.json
assets/game002-s3/CN_2.json
assets/game002-s3/CN_3.json
assets/game002-s3/CN_4.json
assets/game002-s3/CO.json
assets/game002-s3/Nearwin1.json
assets/game002-s3/Symbol.atlas
assets/game002-s3/Symbol.png
assets/game002-s3/WL.json
assets/game002-s3/WM.json
```

实施者必须把 live checkout 当作权威，不得执行 `git reset --hard`、`git checkout --`、自动 stash、清理 untracked 或批量覆盖资源。本任务不做资源 SHA/hash 校验；以工作区保护、manifest 引用、Spine version/configured animation/configured slot、atlas page/texture 和 build/dist 闭包作为资源验收合同。

本任务原则上不新增第三方依赖。若确实新增依赖，必须说明为什么现有 rendercore Spine/Pixi 能力不够，并执行 `pnpm install`；报告必须记录 `pnpm-lock.yaml` 是否变化。

若依赖下载真实失败，才使用：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

不要预先设置代理，不要修改 Go cache（本任务也不涉及 Go）。若非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，用同一命令加 `CI=true` 重试，不要因此改代码或减弱验收。

## 3. 已确认的当前实现事实

实施时仍须重新盘点；本节是制定计划时的实际 checkout 快照，不代替 live 验证。

### 3.1 已有 otherScenes 通用能力

现有实现已经完成：

```text
packages/logiccore/src/types.ts
packages/logiccore/src/parser.ts
packages/logiccore/src/component.ts
packages/logiccore/src/game-logic.ts
packages/gameframeworks/src/component-helpers.ts
packages/gameframeworks/src/index.ts
```

可直接通过：

```ts
getComponentOtherScenesByName(logic, componentName, { stepIndex: 0 });
```

读取组件 `usedOtherScenes` 指向的只读矩阵。`otherScene` 和 scene 一样保持 x 优先：

```ts
otherScene[x][y] === protocol.clientData.otherScenes[index].values[x].values[y];
```

本任务不修改 `logiccore` wire schema，不新增 `otherScenes` fallback，也不让 game002 直接依赖 `@slotclientengine/logiccore`。若实现中发现现有 parser/facade 的真实 bug，可做最小通用修复并补 shared 回归；报告必须单独说明，不能顺手扩展游戏语义。

### 3.2 game003 可参考但不能直接复制的实现

可参考：

```text
apps/game003/src/coin-overlay-sequence.ts
apps/game003/src/coin-overlay-runtime.ts
apps/game003/src/coin-overlay-config.ts
apps/game003/src/game-adapter.ts
apps/game003/tests/coin-overlay-sequence.test.ts
apps/game003/tests/coin-overlay-runtime.test.ts
apps/game003/tests/game-adapter.test.ts
```

可复用的合同思想：

- 第 0 step 的 `bg-gencoins` 必须刚好使用一个 otherScene；
- target scene 与 otherScene 维度必须一致；
- 目标 symbol 格必须为正整数，非目标格必须为 0；
- spin 前解析并准备资源，服务器值直接写入 target reel slot，逐格落地至停轴持续展示；下一 spin/initial/destroy 清理；
- shared 层不理解组件名和 symbol 名。

不能直接复制的部分：

- game003 的目标 symbol 是 `CO`，game002 是 `CN`；
- game003 只画 Pixi Text，game002 必须同时按 manifest tier 使用当前配置引用的新 Spine 完整视觉；
- game003 的文字样式来自 YAML app extension，game002 本任务要求档位与文字表现都进入 symbol manifest；
- 不得 import game003 app 文件或把两个 app 通过相对路径耦合。

### 3.3 当前 game002 symbol 与运行链路

主要文件：

```text
assets/game002-s3/symbol-state-textures.manifest.json
assets/game002-s3/CN.png
assets/game002-s3/CN.spinBlur.png
assets/game002-s3/CN.disabled.png
assets/game002-s3/CN_1.json
assets/game002-s3/CN_2.json
assets/game002-s3/CN_3.json
assets/game002-s3/CN_4.json
assets/game002-s3/Symbol.atlas
assets/game002-s3/Symbol.png
assets/gamecfg002/gameconfig.json

apps/game002/src/assets.ts
apps/game002/src/skin-config.ts
apps/game002/src/loading-resources.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-adapter.ts
apps/game002/src/win-symbol-carousel-config.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/tests/fixtures/game002-gmi.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/loading-resources.test.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/README.md
```

当前事实：

- game config 中 `CN` code 当前是 `8`，实现不得硬编码 `8`，必须通过 `runtime.gameConfig.getSymbolCode("CN")` 或同等 facade 查询。
- 主转轮是 `6 x 9` grid-cell reel，cell 为 `120 x 120`。
- `CN` 是主 display symbol，但不再使用顶层 `CN.png` normal，也没有同名 `CN.json`；其 normal 只由 value tier Spine 提供。
- `CN_1..CN_4` 当前被 loading、skin config、assets tests 和 static dist 明确排除；本任务要把当前 manifest 实际引用的资源改为“CN value presentation 附属资源”，但仍不得加入主 display set 或通过宽泛 glob 把同目录未引用 JSON 悄悄打包。
- `Symbol.atlas` / `Symbol.png` 已经是主 symbol Spine 的共享 atlas/texture；本任务继续复用更新后的同一组资源，不新增手写 adapter 或第二套 runtime。
- game002 adapter 当前 mount 顺序为 background、main reels、symbol win carousel、global win-amount；本任务在 main reels 与 carousel 之间插入 value presentation container。
- `VisibleSymbolPresentationTarget` 已提供停轴后 visible symbol geometry；通用 value presenter只能依赖最小几何能力，不能 import 或判断 `RenderGridCellReelSet` / `RenderReelSet`。

### 3.4 manifest parser、generator 和 viewer

相关文件：

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/src/index.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/README.md

apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/README.md
```

当前 parser 对 symbol entry 使用 allowed-key 白名单，未知字段会失败；新增 `valuePresentation` 时必须进入严格 parser，而不是在 game002 中读取 raw JSON。

generator 当前会重写 `symbol-state-textures.manifest.json`，只显式保留合法 `animations` 和 `renderPriority`。本任务必须增加 `valuePresentation` 的严格校验与保留，否则下一次生成状态贴图会静默丢档位配置。

symbolsviewer 当前只加载 game002 的 13 个主 symbol 和 12 个主 skeleton，并明确排除 `CN_1..CN_4`。本任务必须让 viewer 通过 rendercore public value-presentation API 预览 manifest tiers，但不能把 tier resource 当作新的 symbol 选项，也不能在 viewer 手写当前四个文件名。

## 4. 权威数据合同

### 4.1 附件样例的最小完整语义

本任务测试必须把下面数据嵌入 `apps/game002/tests/fixtures/game002-gmi.ts` 的合法完整 GMI wrapper 中，不依赖原附件：

```json
{
  "clientData": {
    "scenes": [
      {
        "values": [
          { "values": [4, 4, 2, 2, 4, 4, 2, 1, 6] },
          { "values": [2, 2, 6, 6, 5, 5, 6, 2, 2] },
          { "values": [4, 4, 3, 3, 2, 2, 8, 8, 2] },
          { "values": [1, 3, 2, 2, 6, 6, 5, 5, 4] },
          { "values": [2, 2, 6, 6, 2, 4, 3, 3, 5] },
          { "values": [5, 5, 4, 8, 8, 6, 4, 4, 3] }
        ]
      }
    ],
    "otherScenes": [
      {
        "values": [
          { "values": [0, 0, 0, 0, 0, 0, 0, 0, 0] },
          { "values": [0, 0, 0, 0, 0, 0, 0, 0, 0] },
          { "values": [0, 0, 0, 0, 0, 0, 2, 25, 0] },
          { "values": [0, 0, 0, 0, 0, 0, 0, 0, 0] },
          { "values": [0, 0, 0, 0, 0, 0, 0, 0, 0] },
          { "values": [0, 0, 0, 1, 1, 0, 0, 0, 0] }
        ]
      }
    ],
    "curGameModParam": {
      "historyComponents": ["bg-spin", "bg-gencoins"],
      "historyComponentsEx": ["bg-spin", "bg-gencoins", "bg-win"],
      "mapComponents": {
        "bg-spin": {
          "basicComponentData": {
            "usedScenes": [0],
            "usedOtherScenes": [],
            "usedResults": []
          }
        },
        "bg-gencoins": {
          "basicComponentData": {
            "usedScenes": [],
            "usedOtherScenes": [0],
            "usedResults": []
          }
        }
      }
    }
  }
}
```

`CN` code 通过 game config 查询后当前为 `8`。样例应解析出稳定 x/y 顺序的四项：

```ts
[
  { x: 2, y: 6, symbol: "CN", symbolCode: 8, value: 2 },
  { x: 2, y: 7, symbol: "CN", symbolCode: 8, value: 25 },
  { x: 5, y: 3, symbol: "CN", symbolCode: 8, value: 1 },
  { x: 5, y: 4, symbol: "CN", symbolCode: 8, value: 1 },
];
```

对应视觉档位：

```text
(2,6) value=2  -> CN_1
(2,7) value=25 -> CN_2
(5,3) value=1  -> CN_1
(5,4) value=1  -> CN_1
```

样例没有覆盖当前 manifest 的第 3/4 档，game002 配置回归必须另造合法矩阵覆盖 `9/10/99/100/999/1000` 精确边界；rendercore 通用测试还必须使用与 `CN_*` 完全无关的资源名和不同 tier 数量，证明代码不依赖当前实例。

### 4.2 game002 app 数据规则

新增 `apps/game002/src/cn-value-sequence.ts`，建议公开：

```ts
export const GAME002_CN_VALUE_COMPONENT_NAME = "bg-gencoins";
export const GAME002_CN_VALUE_SYMBOL = "CN";

export interface Game002CnValueItem {
  readonly x: number;
  readonly y: number;
  readonly symbol: "CN";
  readonly symbolCode: number;
  readonly value: number;
}

export function createGame002CnValueItems(options: {
  readonly logic: GameLogic;
  readonly targetScene: SceneMatrix;
  readonly cnSymbolCode: number;
  readonly componentName: "bg-gencoins";
}): readonly Game002CnValueItem[];
```

实现规则：

- 只查第 0 step；target scene 先走 `validateGame002Scene(...)`。
- 只通过 `@slotclientengine/gameframeworks` 导出的 `getComponentOtherScenesByName(...)` 读取数据，app 不直接 import logiccore。
- step 未触发 `bg-gencoins` 时返回冻结空数组，不读取未映射的 otherScene，也不把全部 otherScenes 当候选。
- 触发组件必须有 `basicComponentData`，并且必须刚好映射一个 otherScene。
- otherScene 必须与 `6 x 9` target scene 每列、每行完全同尺寸。
- `cnSymbolCode` 必须是 non-negative safe integer，并从 game config 查询，不能硬编码 `8`。
- target scene 是 CN 的格子，value 必须是 positive safe integer；非 CN 格 value 必须精确为 `0`。
- 若 target scene 没有 CN，触发组件且 otherScene 全 0 时返回空；若有任意非零值则失败。
- 输出按 `x` 再 `y` 升序，冻结数组和 item。
- 不在 app 中选择 tier，不读取任何具体 tier 文件名，不创建 Spine/Text，不复制阈值。

## 5. manifest schema 合同

### 5.1 CN entry 的当前配置实例

修改 `assets/game002-s3/symbol-state-textures.manifest.json` 的 `symbols.CN`：顶层彻底移除 `normal/spinBlur/disabled`，只保留 `scale + valuePresentation`。无值 reel normal 用 `valuePresentation.reelStates.normal` 显式透明占位，blur/disabled 也只放在 `reelStates`；实际 normal art 只来自命中 tier 的 Spine：

```json
{
  "scale": 1,
  "valuePresentation": {
    "defaultValues": [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000],
    "reelStates": {
      "normal": { "kind": "transparent", "width": 200, "height": 200 },
      "spinBlur": "./CN.spinBlur.png",
      "disabled": "./CN.disabled.png"
    },
    "tiers": [
      {
        "maxExclusive": 10,
        "animation": {
          "kind": "spine",
          "skeleton": "./CN_1.json",
          "atlas": "./Symbol.atlas",
          "texture": "./Symbol.png",
          "playback": {
            "mode": "animation",
            "animationName": "Idle",
            "loop": true
          }
        }
      },
      {
        "maxExclusive": 100,
        "animation": {
          "kind": "spine",
          "skeleton": "./CN_2.json",
          "atlas": "./Symbol.atlas",
          "texture": "./Symbol.png",
          "playback": {
            "mode": "animation",
            "animationName": "Idle",
            "loop": true
          }
        }
      },
      {
        "maxExclusive": 1000,
        "animation": {
          "kind": "spine",
          "skeleton": "./CN_3.json",
          "atlas": "./Symbol.atlas",
          "texture": "./Symbol.png",
          "playback": {
            "mode": "animation",
            "animationName": "Idle",
            "loop": true
          }
        }
      },
      {
        "animation": {
          "kind": "spine",
          "skeleton": "./CN_4.json",
          "atlas": "./Symbol.atlas",
          "texture": "./Symbol.png",
          "playback": {
            "mode": "animation",
            "animationName": "Idle",
            "loop": true
          }
        }
      }
    ],
    "text": {
      "slot": "Num",
      "x": 0,
      "y": 0,
      "fontFamily": "Arial",
      "fontSize": 32,
      "fontWeight": "900",
      "fill": "#fff7d6",
      "stroke": "#5a2500",
      "strokeWidth": 4
    }
  }
}
```

上面是当前新美术对应的配置实例，不是 schema 对四档或 `CN_1..CN_4` 命名的限制。合法配置也可以只有一个无上限 tier，或使用例如 `coin-low.json`、`gold.json`、`jackpot-ultra.json` 等任意不冲突文件名；增删 tier、改阈值或改资源路径后，只需重新生成第 5.4 节的精确资源闭包。

每个当前 tier skeleton 都必须真实包含大小写精确的 `Num` slot。数字必须通过 official Spine slot-object API 绑定在该 slot 下，继承 slot/bone 的位移、旋转、缩放、可见性和颜色动画，不能作为 Spine 同级 Pixi overlay。颜色/字号和 slot-local `x/y` 只来自 CN manifest；app 不维护第二份文字表。若人工视觉验收发现文字仅需微调，必须只改 manifest 并同步 parser/test/报告，不得在 app runtime 写覆盖值。

### 5.2 parser 硬规则

扩展 `packages/rendercore/src/symbol/manifest.ts`：

- `ParsedSymbolManifestSymbol` 增加可选只读 `valuePresentation`。
- symbol allowed keys 增加 `valuePresentation`；未配置的普通 symbol 行为不变。
- value-managed symbol 顶层禁止 `normal` 和所有 state；`valuePresentation` 只允许 `defaultValues`、`reelStates`、`tiers`、`text` 四个 key，未知 key 失败。`defaultValues` 必须是非空、无重复的 positive safe integer 数组。`reelStates.normal` 必须是显式 transparent normal，所有 manifest state texture（当前 blur/disabled）必须完整放在 `reelStates`。
- `tiers` 必须是非空数组；通用 parser 允许“只有一个无上限 tier”，也允许任意大于 1 的合法档数。当前 game002-s3 实例是四项，但 app/runtime 不校验必须为四项。第一版每个 `animation.kind` 必须精确为 `spine`。
- 除最后一项外，每项必须有 positive safe integer `maxExclusive`；最后一项必须没有 `maxExclusive`，表示无上限。
- 有界阈值必须严格递增，不允许重复、倒序、空洞补丁或 `Infinity`。
- 第一档自然覆盖正整数 `1..maxExclusive-1`；runtime 的输入值和 `defaultValues` 均必须是 positive safe integer，因此不需要 `minInclusive`。
- tier animation 使用现有 Spine spec 严格 parser，但本任务只允许 `mode=animation`、`loop=true` 和真实非空 animation name；不接受 range/static/builtin/VNI。skeleton/atlas/texture 只要求合法的 manifest 相对路径和正确资源类型，不允许依靠 `CN_数字` 命名识别 tier。
- `text` 必须字段齐全且无未知 key。`slot` 为 non-empty string，slot-local `x/y` 为 finite number；`fontSize/strokeWidth` 为 positive finite number；family/weight/fill/stroke 为 non-empty string。
- parser 返回对象和嵌套数组全部冻结；不能泄露 raw manifest 可变引用。

### 5.3 generator 保留规则

修改 `packages/rendercore/scripts/generate-symbol-state-textures.mjs`：

- 在读取现有 manifest metadata 时严格识别并验证 `valuePresentation`。
- 生成时原样、深冻结语义地保留合法配置；value-managed symbol 重生成后仍不得恢复顶层 normal/state。
- 不允许简单 spread 任意 raw JSON；非法 tier、阈值、text 或 animation 必须失败，不能静默丢弃或照抄未知字段。
- 现有 `animations`、`renderPriority` 保留逻辑不得回归。

更新 `packages/rendercore/tests/symbol/state-texture-generator.test.ts`，证明重新生成后完整 `valuePresentation` 字节语义仍在，并覆盖 1/3/5 档、任意 skeleton 名、非法 threshold、unknown key、非 Spine animation 显式失败。测试 fixture 使用中性 symbol/resource 名，不能用 `CN_1..CN_4` 让实现误通过。

### 5.4 manifest 驱动的精确 Vite/loading 资源闭包

“资源名可配置”不能通过宽泛 eager glob 实现，否则 `Nearwin*`、`WM_Fx` 或未来未发布 JSON 会被悄悄打包。新增通用生成脚本：

```text
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/tests/symbol/symbol-value-vite-resource-generator.test.ts
```

CLI 至少接受：

```text
--manifest <symbol-state-textures.manifest.json>
--out <consumer generated ts>
--check
```

脚本行为：

- 严格读取 manifest 中所有 symbol 的 `valuePresentation.reelStates + tiers[]`，不认识 CN、四档或任何文件名模式。
- 从 `reelStates` state textures 及每个 tier 的 `animation.skeleton/atlas/texture` 收集并去重精确路径；顺序按 manifest symbol/tier 首次出现顺序稳定输出。
- 路径必须是 manifest 所在资源根内的 `./` 相对路径，normalize 后不得越过根目录；skeleton/atlas/texture 扩展名和实际文件类型必须匹配。
- 输出静态、可被 Vite 分析的精确 imports：skeleton JSON object + `?url`、atlas `?raw` + `?url`、Spine/reel-state texture `?url`，以及按规范化 manifest path 建立的只读 module maps/loading URL 列表。
- 生成文件头写明“禁止手改”；`--check` 比较期望内容和磁盘内容，不写文件，漂移时失败。
- 0 个 valuePresentation 时生成合法空 maps，不扫描目录。
- 1/3/5 档、资源跨 tier 复用、完全不同文件名和多 symbol valuePresentation 均能生成；重复资源只 import 一次。
- 缺文件、未知字段、路径逃逸、错误扩展名、重复但类型冲突都显式失败。

两个 consumer 各自生成本 app 的相对 import 路径，不能跨 app import 对方源码：

```text
apps/game002/src/generated/symbol-value-resources.generated.ts
apps/symbolsviewer/src/generated/game002-symbol-value-resources.generated.ts
```

两份文件都由同一 manifest 和同一通用脚本生成；允许生成内容中出现当前资源名，但任何手写 production TS、测试分支或 runtime parser 都不得枚举 `CN_1..CN_4`。

## 6. rendercore 通用实现

### 6.1 文件与导出

新增目录：

```text
packages/rendercore/src/symbol-value-presentation/
  types.ts
  create-symbol-value-presenter.ts
  index.ts

packages/rendercore/tests/symbol-value-presentation/
  manifest-resources.test.ts
  symbol-value-presenter.test.ts
```

并更新：

```text
packages/rendercore/src/index.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/README.md
```

根导出建议为：

```ts
createSymbolValuePresenter(...)
createSymbolValuePresentationResourcesFromManifest(...)
SymbolValuePresentationItem
PreparedSymbolValuePresentation
SymbolValuePresenter
SymbolValuePresentationSnapshot
```

不要新增 package subpath，除非现有导出结构确实要求；避免为了一个能力修改多套 bundler alias。

### 6.2 资源 resolver

`createSymbolValuePresentationResourcesFromManifest(...)` 输入：

```ts
{
  manifest: unknown;
  spineSkeletonModules: Readonly<Record<string, unknown>>;
  spineAtlasModules: Readonly<Record<string, string>>;
  spineTextureModules: Readonly<Record<string, string>>;
}
```

要求：

- 复用 `parseSymbolStateTextureManifest(...)` 和现有 module-path 解析策略。
- 每个 tier 必须在 modules 中精确找到 skeleton/atlas/texture。
- 复用 rendercore 官方 Spine version、atlas/skeleton、animation name 和 configured text slot 校验，不在新目录复制 parser 或手写 adapter；任一 tier 缺 `text.slot` 都要在启动/prepare 前失败。
- 返回以 symbol 为 key 的只读资源与有序 tiers；档位顺序就是 manifest 顺序。
- 同一 atlas/texture 可复用解析/cache，但每个同时可见 CN 必须有独立 Spine 实例；不能把一个 display object 同时挂到多个格子。
- 资源缺失立即失败；不回退到 symbol normal、默认 tier 或最后一个“能加载”的 tier。

### 6.3 presenter API 与生命周期

建议接口：

```ts
export interface SymbolValuePresentationItem {
  readonly x: number;
  readonly y: number;
  readonly symbol: string;
  readonly symbolCode: number;
  readonly value: number;
}

export interface SymbolValuePresenter {
  readonly container: Container;
  prepare(
    items: readonly SymbolValuePresentationItem[],
  ): Promise<PreparedSymbolValuePresentation>;
  discard(prepared: PreparedSymbolValuePresentation): void;
  show(prepared: PreparedSymbolValuePresentation): void;
  update(deltaSeconds: number): void;
  clear(): void;
  getSnapshot(): SymbolValuePresentationSnapshot;
  destroy(): void;
}
```

创建 options 只依赖：

- 一个能按 positions 返回 `RenderVisibleSymbolGeometrySnapshot[]` 的最小 target；可复用 `Pick<VisibleSymbolPresentationTarget, "getVisibleSymbolGeometrySnapshots">` 或定义更小中性接口；
- parsed manifest resources；
- 可注入的官方 Spine player factory，仅供单测。

禁止依赖：

- `GameLogic`、component name、otherScenes、game002/game003；
- `RenderGridCellReelSet` / `RenderReelSet` 具体类、`instanceof` 或私有 children；
- app 的 formatter、CSS/DOM 或第二个 renderer/canvas。

`prepare(items)`：

- 必须在 `runtime.spinToScene(...)` 前调用。
- 校验 position 为 non-negative safe integer、position 不重复、symbol 非空、symbolCode non-negative safe integer、value positive safe integer。
- 按 manifest 阈值选择 tier，并冻结 `tierIndex/maxExclusive/resource/text` 结果。
- 为本轮需要的每个实例完成官方 Spine 初始化；加载失败时 promise reject，且不得启动 reel。
- 可以复用 presenter 自己的 idle player pool；pool key 至少包含 symbol、tier skeleton、atlas、texture、animation，不能跨不兼容资源复用。
- 空 items 返回合法 prepared empty，不显示任何内容。
- prepared object 必须由当前 presenter 所有；另一个 presenter 或伪造 object 传给 `show()` / `discard()` 要失败。

`discard(prepared)`：

- 单次消费并释放已 prepare 的 players，不挂 Pixi view；game002 用它完成 spin 前资源预检的收尾，因为实际显示已由 target reel slot controller 承担。

`show(prepared)`：

- 只允许 presenter 未 destroyed 且当前没有 active presentation；停轴后同步调用。
- 读取所有 position 的 geometry，数量和顺序必须一致。
- geometry 的 `code` 必须与 item `symbolCode` 一致，`kind` 必须是 textured；不一致说明 scene/target 漂移，显式失败。
- 每个 Spine view 以对应 cell center 为原点，使用 manifest animation 自带 transform（若无则 `x=0,y=0,scale=1`）。
- Text anchor 固定 `(0.5,0.5)`，内容精确为 `String(value)`；通过 official Spine `addSlotObject()` 绑定到 manifest `text.slot`，位置只使用 slot-local `text.x/y`，必须继承 slot/bone transform、visibility 和 color，不能作为 Spine 同级 overlay。
- presenter container 使用 reel-local art 坐标，不做 viewport fit/cover/contain，不读 skeleton width/height 来缩放。
- 新 tier Spine 是当前 CN 的完整覆盖视觉；基础 CN 仍在 reel 内，但 presentation container 位于其上方。不得另外画旧 CN 或静态底图。

`update(deltaSeconds)`：

- 只推进 active official Spine players 的 `Idle`；delta 必须 finite non-negative。
- 即使 symbol win carousel 为 idle/cycle-pause，也必须持续推进，不把 value animation tick 寄托在 carousel 的 target update 上。

`clear()`：

- 移除 active views/text，重置展示，播放器可回到 presenter-owned pool。
- 多次 clear 幂等；不能销毁共享 atlas/texture，也不能影响 reel symbol state 或 win carousel。

`destroy()`：

- 释放 active/idle players、Text、container 和引用；多次 destroy 幂等。
- destroyed 后 prepare/discard/show/update/clear 的行为要与 rendercore 现有风格一致并有测试；除幂等 destroy 外建议显式失败。

snapshot 至少包含：

```ts
{
  phase: "idle" | "preparing" | "visible" | "destroyed";
  activeCount: number;
  items: readonly {
    x: number;
    y: number;
    symbol: string;
    symbolCode: number;
    value: number;
    tierIndex: number;
    skeleton: string;
    text: string;
  }[];
}
```

### 6.4 rendercore 测试矩阵

必须覆盖：

- manifest 合法解析、深冻结和任意档数资源解析；
- 一个无上限 tier、3 档和 5 档中性 fixture 都能解析与选择；资源名使用 `bronze.json`、`ruby.json` 等，不出现 `CN_数字` 命名推导；
- 当前 game002 配置单独回归 `1/9 -> tier 0`、`10/99 -> tier 1`、`100/999 -> tier 2`、`1000/Number.MAX_SAFE_INTEGER -> tier 3`；
- `0`、负数、小数、NaN、Infinity、超过安全整数失败；
- tiers 空、last 仍有 max、非 last 缺 max、阈值重复/倒序/非整数失败；单个无上限 tier 作为通用合法边界要有回归；
- unknown key、非 Spine kind、missing module、4.2/未知 version、缺 Idle、错 atlas page/region 失败；
- 多个 item 创建独立 player/view，不能只显示最后一个；
- player prepare 完成前不能 show，伪造/跨 presenter prepared 失败；
- geometry count/order/code/kind 漂移失败；
- 文本位置、内容、style 和 tier snapshot 正确；
- update 只推进 active players，invalid delta 失败；
- clear 后不残留 view/text，下一批复用不串 tier/value；
- destroy 完整释放且不双重销毁；
- fake future geometry target 证明不依赖具体 ReelSet。

## 7. game002 接入

### 7.1 skin、资源和 loading 闭包

修改 `apps/game002/src/skin-config.ts`：

- 主 `game002S3SpineSkeletonModules` 继续保持 12 个主 skeleton 的精确 glob。
- 从 `apps/game002/src/generated/symbol-value-resources.generated.ts` 读取 manifest 派生的 skeleton/atlas/texture module maps；不得新增 `{CN_1,CN_2,CN_3,CN_4}` 手写 glob，也不得按 tier index 拼文件名。
- `Game002SkinConfig` 增加 rendercore parsed value-presentation resources 或创建 presenter 所需的 generated module maps。
- 调用 rendercore resolver；app 不解析 tiers，不写阈值，不直接依赖 Spine runtime。

修改 `apps/game002/src/loading-resources.ts`：

- 从 generated closure 枚举 manifest 实际引用的 skeleton/atlas/texture URL；resource id 由规范化 manifest path 稳定派生，不能假设 `CN_数字`。
- 与主 symbol 已加载的 `Symbol.atlas` / `Symbol.png` 路径相同则按规范化资源 path 去重，只加载一次；未来 tier 使用独立 atlas/texture 时自动进入闭包。
- 不用 `*.json` 宽泛 glob；未被 manifest 引用的 `Nearwin1..3`、`WM_Fx`、BG skeleton 和其它 JSON 仍不能混入。
- loading 99%/100% 和 prepared session 合同不变。

修改 `apps/game002/package.json`，新增并接入：

```text
generate:symbol-value-resources
check:symbol-value-resources
```

`build/dev/test/typecheck` 在读取 generated TS 前执行 generate；`release:check` 先执行 check 再 build/static-dist。命令调用第 5.4 节通用脚本并固定当前 manifest/out 路径，不固定 tier 数量或资源名。

修改：

```text
apps/game002/src/assets.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/loading-resources.test.ts
apps/game002/scripts/verify-static-dist.mjs
```

当前 manifest 实例的验收必须区分：

```text
main display symbols: 13
main same-name Spine skeletons: 12
manifest-referenced value-presentation skeletons: 当前为 4，断言值从 manifest 去重结果派生
```

static dist 原固定 `EXCLUDED_RESOURCE_PREFIXES` 不能简单把 `CN_1..CN_4` 永久改成允许列表；应改为：manifest 实际引用的资源必须存在，未引用的 `Nearwin1..3`、`WM_Fx` 等仍禁止。新增 source/dist 检查：

- 遍历 manifest 实际 tiers，逐项校验 skeleton 4.3.x 和 exact configured animation；不能枚举四个固定文件名；
- source 与 dist/bundle 资源闭包精确等于 manifest 去重后的资源集，并包含当前实例的四个新 JSON 和更新后的 `Symbol.atlas/png` 字节；
- 不能只验证文件名而漏掉 atlas/png、configured slot 与 source/dist 闭包；不计算或记录资源 SHA/hash；
- 任意 tier resource basename 都不出现在 paytable/display symbol 数组中。
- 测试临时把 manifest 改成 1 档、3 档和不同文件名时，generated/check/static closure 期望随 manifest 变化，不要求改 production TS。

### 7.2 app sequence 与测试

新增：

```text
apps/game002/src/cn-value-sequence.ts
apps/game002/tests/cn-value-sequence.test.ts
```

使用第 4 节样例覆盖四个实际 item；另构造边界矩阵覆盖当前配置的四档。数据 sequence 只产出 value，不感知 tier 数量。失败测试至少覆盖：

- 未触发 component 返回空；
- 触发但缺 basic data；
- usedOtherScenes 为 0 个、2 个、越界；
- otherScene 缓存/全部 otherScenes 不能绕过组件 mapping；
- 宽/高不匹配；
- CN value 0/负数/小数/NaN/Infinity/unsafe；
- 非 CN 带非零 value；
- cnSymbolCode 非法；
- component name 不是 `bg-gencoins`；
- 返回顺序、冻结和 raw String 语义。

### 7.3 adapter 生命周期

修改 `apps/game002/src/game-adapter.ts` 和相应测试。

`mount()`：

- 创建 rendercore `SymbolValuePresenter`，target 使用 `Game002ReelRuntime` 的通用 visible geometry facade。
- world z-order 精确为 background -> main reels（含 CN slot value）-> symbol win carousel -> win amount；game002 不再挂第二个 CN presenter view。
- mount 任一步失败时销毁 presenter，不能泄漏已初始化 Spine player。

`applyInitialState()`：

- 在应用 default scene 前清理 CN value presentation。
- defaultScene 本身不含 otherScene，因此每个 CN 必须从 manifest `defaultValues` 重新取候选值，不能留空或延用上一轮。

`playSpin(logic)`：

1. 确认没有 pending/preparing spin。
2. 读取并校验第 0 step target scene。
3. 从 `runtime.gameConfig.getSymbolCode("CN")` 查询 code。
4. 调用 `createGame002CnValueItems(...)`。
5. 调用 presenter `prepare(items)`，等待本轮实际命中 tiers 所需的 players 完成初始化；任何失败都不能启动 reel。
6. 继续执行现有 win carousel prepare、bet/win 校验。
7. 清理上一轮 CN presentation、win carousel 和 global win amount。
8. 为本地公开临时轮带中的 CN occurrence 从 manifest 候选数组固定取值，并把本轮服务器 otherScene 矩阵作为 target presentation values 传给 `runtime.spinToScene(...)`；未触发组件时 target CN 继续由本地候选 resolver 提供。
9. 停轴并通过 `assertGame002ReelVisualMatchesTarget(...)` 后 `discard(preparedCnValues)`；不得再叠加第二套 Spine，实际 target slot 已持续显示服务器值。
10. 再进入现有 bg-win carousel/global win-amount 流程。

异步 prepare 期间必须有明确 phase/token，防止第二个 spin、destroy 或迟到 promise 在错误 adapter 上消费。destroy 发生后，迟到 prepare 必须被安全释放并 reject 当前 spin，不能复活 Pixi 节点。

`#onTick`：

- 每 tick 独立调用 presenter `update(deltaSeconds)`；不能依赖 win carousel 是否 active。
- 不重复推进主 reel runtime；保持现有 carousel 对 symbol state animation 的 update 所有权，避免 double tick。
- presenter update 抛错时沿用现有 pending reject / idle fatal error 策略。

`viewport`：

- CN value 在实际 reel slot 内，直接复用 reel 的 art-world/viewport mapping；不要为 CN 写第二套 container 定位或 viewport mapping。
- viewport resize 前后 snapshot/item cell center 关系不变。

`destroy()`：

- reject preparing/pending，销毁 presenter，再销毁其它 Pixi runtime；多次 destroy 不泄漏。

adapter 测试必须覆盖：

- prepare 在 `spinToScene` 前完成；非法 otherScene/资源时 reels 从未启动；
- 当前 manifest 样例停轴后四个 CN 展示 3 个第 1 档 + 1 个第 2 档，snapshot 解析到的 skeleton 当前分别为 `CN_1.json/CN_2.json`，数字为 `2/25/1/1`；
- 合成边界按当前 manifest 展示四档，同时另用任意档数/任意文件名 fixture 证明 adapter/presenter 不写死四档；
- defaultScene 与 spin 临时轮带 CN 均持续显示候选档位；停轴后显示服务器档位且不额外阻塞无 win spin；
- 有 `bg-win` 时 main-reel CN value 保持在 carousel 下方，首轮等待合同不变；
- 下一 spin 开始前清理旧展示；new prepare 不复用旧 value/text；
- `applyInitialState`、mount rollback、viewport、destroy、idle update、fatal/reject 路径；
- 未触发 `bg-gencoins` 时 presenter 得到 empty prepared，target CN 仍从 manifest 候选取值，旧展示仍会在下一 spin 清理；
- async prepare 与 destroy/并发 spin 的竞态。

### 7.4 Game002ReelRuntime 最小 facade

- 为 grid-cell reel 的 current、temporary public-strip occurrence 与 target endpoint 携带通用 presentation value；本地 occurrence 值一旦生成即随临时轮带固定，不能每帧重抽或使用服务器真实轮带。
- defaultScene CN 自动从 manifest 候选数组取值；spin target CN 使用服务器 otherScene，不能被候选随机值覆盖。

若 `Game002ReelRuntime` 当前的 `getVisibleSymbolGeometrySnapshots(...)` 已满足 presenter target，直接复用，不新增 app 私有 cell 遍历。若类型需要收窄，只在：

```text
apps/game002/src/game-demo.ts
apps/game002/tests/game-demo.test.ts
```

增加中性 facade/类型断言。不得暴露 grid-cell 私有 slot、RenderSymbol、children 或 Spine player。

## 8. symbolsviewer 预览

修改：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/tests/main.test.ts
apps/symbolsviewer/README.md
```

要求：

- `game002-s3` 主 symbol selector 仍只有 13 项；任何 tier resource 都不成为独立 symbol 选项。
- `apps/symbolsviewer/package.json` 新增 generate/check scripts，使用第 5.4 节同一通用 generator 产出 `apps/symbolsviewer/src/generated/game002-symbol-value-resources.generated.ts`；build/dev/test/typecheck 前生成，严格验收先 check。
- viewer 从 generated closure 加载 manifest 实际引用的任意 skeleton/atlas/texture；不得写 `{CN_1,CN_2,CN_3,CN_4}` glob、固定数组或文件名 switch。
- 当选择的 symbol manifest 含 `valuePresentation`（当前只有 CN）时显示一个 positive integer `Value` 输入和 Apply/Clear；默认示例值用 `25`，便于看到 CN_2。
- viewer 只调用 rendercore public presenter/resolver，不能复制 tiers、阈值、Spine player、geometry mapping 或 text style。
- 输入 `9/10/99/100/999/1000` 时 viewer snapshot 按当前 manifest 显示正确 tier；另用测试 manifest 验证 1/3/5 档与任意资源名。非法值直接显示错误，不钳制。
- 切 set、切 symbol、reset、destroy 时清理 value presentation；普通 symbol 不显示/不启用 Value 控件。
- viewer 的 value presentation 与普通 state controls 分开；本任务只支持 manifest 配置的 tier loop animation，不把 appear/win 按钮映射到资源中未配置的其它动画。
- build/test 证明 manifest 引用资源精确进入 symbolsviewer 闭包，同时 `Nearwin*`/`WM_Fx` 等未引用资源仍排除。

## 9. 文档、协作规则和边界检查

更新：

```text
packages/rendercore/README.md
apps/game002/README.md
apps/symbolsviewer/README.md
agents.md
```

`packages/rendercore/README.md` 写清：

- `valuePresentation` schema、阈值和 text 规则；
- presenter prepare/discard/show/update/clear/destroy；
- 只依赖 geometry target，不理解 otherScenes/component/game；
- 第一版只支持 official Spine，不做 fallback；
- generator 会保留并验证 metadata。

`apps/game002/README.md` 写清：

- `bg-gencoins -> otherScene -> CN` 数据路径；
- raw value、tier 数量/阈值/资源路径完全由 manifest 配置，以及当前四档实例；
- 新美术资源闭包、z-order、生命周期和显式失败；
- manifest tier resources 是 CN 附属资源，不是主 display symbols；
- live query、lines=30、loading、本地公开轮带等原合同不变。

更新根 `agents.md`（仓库实际文件名为小写），把旧规则“CN_1..CN_4 暂不属于主 display set，不能接入”细化为：

- 它们仍不属于主 display set，也不能被宽泛 glob 当 symbol 接入；
- 它们现在只是当前 `CN.valuePresentation` manifest 实例精确引用的新 Spine 资源；实现不得固定四档或依赖 `CN_数字` 命名；
- rendercore 拥有通用 manifest tier/player/text 生命周期；
- game002 app 只拥有 `bg-gencoins` / `CN` otherScene 映射；
- tier 数量、阈值、资源路径/命名和文字样式不得在 app 建第二份表；
- manifest 改动后必须重生成 game002/symbolsviewer 的精确 Vite/loading closure，禁止用宽泛 glob 代替；
- 当前工作区新美术不得被旧资源覆盖。

source-boundary 增加断言：

```bash
rg -n 'bg-gencoins|GAME002_CN|CN_[0-9]|tierCount === 4' \
  packages/rendercore/src packages/rendercore/tests/symbol-value-presentation
```

预期：

- `packages/rendercore/src` 对 `bg-gencoins|GAME002_CN` 无输出；
- rendercore 测试可使用中性 fixture 名，不需要写 CN 专属分支；
- 当前 `CN_1..CN_4` 名字只允许出现在资源文件、manifest、generated closure 和当前配置测试/docs；手写 game002/symbolsviewer/rendercore runtime source 不得硬编码它们。
- source-boundary 还要扫描固定四档 tuple、`CN_${index}`、固定阈值数组和按 basename 解析 tier 的逻辑；generated 文件允许包含 manifest 派生文字，但必须由 `--check` 保证无手改。

另检查 app 不越过 facade：

```bash
rg -n '@slotclientengine/logiccore|@esotericsoftware/spine-pixi-v8' apps/game002/src
```

预期无输出。Vite config 中现有 logiccore source alias 是 rendercore 源码联调的传递解析例外，不等于 app source 直接 import，保留现有 source-boundary 规则。

## 10. 实施顺序

按以下顺序执行，避免在 app 中先写临时分档逻辑：

1. 记录 git 状态，遍历当前 manifest 引用验证 Spine version、configured animation、configured slot 和 atlas page；不做资源 SHA/hash 校验。
2. 在 manifest 定义 `CN.valuePresentation` 当前配置实例，同时用中性 fixture 固定“档数/命名可配置”合同。
3. 扩展 rendercore strict parser、资源 resolver、manifest metadata preservation 和 Vite resource-closure generator，并先完成 1/3/5 档任意命名单测。
4. 完成通用 presenter、text、lifecycle 和 fake target 测试；idle player pool 仅在确有性能证据时作为可选优化，未启用时必须逐实例可靠释放。
5. 生成并接入 game002/symbolsviewer 精确资源模块，完成 loading/static-dist 闭包；不得新增固定名字 glob。
6. 完成 game002 `bg-gencoins/CN` sequence 与附件样例 fixture。
7. 接入 adapter prepare/discard/clear/destroy、target presentation matrix 和 z-order。
8. 完成 symbolsviewer public API 预览，不新增 tier symbol 选项，不手写当前资源名。
9. 更新 README、`agents.md`、source-boundary 和 release check。
10. 执行单包验收、根级验收以及资源结构/版本/slot/build-dist 闭包检查；不做资源 hash 校验，人工浏览器验收明确交接给用户。
11. 做第 13 节二次遗漏审计。
12. 生成 UTC 中文执行报告。

## 11. 自动验收命令

所有命令从仓库根目录执行，并按顺序串行运行，避免共享生成物/缓存并发互相影响。

### 11.1 资源预检

```bash
for file in \
  assets/game002-s3/CN_1.json \
  assets/game002-s3/CN_2.json \
  assets/game002-s3/CN_3.json \
  assets/game002-s3/CN_4.json; do
  jq -e '.skeleton.spine | test("^4\\.3(\\.|$)")' "$file"
  jq -e '.animations.Idle != null' "$file"
  jq -e '[.slots[].name] | index("Num") != null' "$file"
done

# 不执行 shasum/hash。
```

### 11.2 定向包验收

```bash
CI=true pnpm --filter @slotclientengine/logiccore test
CI=true pnpm --filter @slotclientengine/gameframeworks test

CI=true pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/symbol-value-vite-resource-generator.test.ts
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build

CI=true pnpm --filter game002 generate:symbol-value-resources
CI=true pnpm --filter game002 check:symbol-value-resources
CI=true pnpm --filter game002 format:check
CI=true pnpm --filter game002 lint
CI=true pnpm --filter game002 test
CI=true pnpm --filter game002 typecheck
CI=true pnpm --filter game002 build
CI=true pnpm --filter game002 release:check

CI=true pnpm --filter symbolsviewer generate:symbol-value-resources
CI=true pnpm --filter symbolsviewer check:symbol-value-resources
CI=true pnpm --filter symbolsviewer format:check
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
```

若 rendercore generator 有可重复的 test fixture 命令，必须通过现有 test 执行，不能直接对 `assets/game002-s3` 运行 generator 后把所有用户美术/manifest 改动混在一起。只有确实需要重生成状态贴图时才运行真实 generator；运行后只检查 manifest `valuePresentation` 未丢失且顶层 normal/state 未恢复，不做资源 SHA/hash 校验。

### 11.3 根级验收

```bash
CI=true pnpm format:check
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
git diff --check
git status --short --untracked-files=all
```

根级命令失败时：

- 先记录首个真实失败，不把 turbo 后续 SIGTERM 当根因；
- 若失败属于任务触达文件，必须修复；
- 若属于任务外既有问题，仍要完成相关包的严格独立验收，并在报告记录命令、首错、路径和为什么不应改任务外 production 合同；
- 不能通过删测试、改阈值、放宽 parser、加 fallback 或批量格式化用户文件伪造通过。

### 11.4 边界与 manifest 检查

```bash
jq '.symbols.CN.valuePresentation' \
  assets/game002-s3/symbol-state-textures.manifest.json

rg -n 'bg-gencoins|GAME002_CN|CN_[0-9]|tierCount === 4' packages/rendercore/src
rg -n '@slotclientengine/logiccore|@esotericsoftware/spine-pixi-v8' apps/game002/src
rg -n 'CN_1|CN_2|CN_3|CN_4|CN_\$\{.*\}' \
  assets/game002-s3/symbol-state-textures.manifest.json \
  apps/game002/src apps/game002/tests apps/game002/scripts \
  apps/symbolsviewer/src apps/symbolsviewer/tests

CI=true pnpm --filter game002 check:symbol-value-resources
CI=true pnpm --filter symbolsviewer check:symbol-value-resources

git diff -- \
  apps/game003 \
  assets/game003-s1 \
  apps/game003/config \
  apps/game003/src/generated
```

最后一条应为空；本任务不修改 game003 现有 CO overlay、YAML、generated config 或 4.2 资源。

## 12. 浏览器 / live 验收

自动测试通过后启动：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

使用 `apps/game002/README.md` 当前 live query，参数必须包含 `skin=1`、真实凭证、`lines=30`，不得增加 `serverUrl`。找到一局包含 `bg-gencoins.usedOtherScenes=[0]` 且 scene 有 CN 的结果，重点检查：

- 首屏仍先走 gameloading，100% 后才出现游戏 canvas；
- spin 过程中不残留上一局 CN tier/数字；
- 停轴后每个 CN 使用当前 manifest 实际命中的新 tier 美术，而不是旧 CN/旧 atlas/首帧 fallback；当前配置应命中 `CN_1..CN_4`，但验收逻辑从 snapshot/resource path 读取，不靠 tier 序号拼名；
- 当前实例的 `1..9`、`10..99`、`100..999`、`>=1000` 分档符合 manifest；若 live 数据未覆盖全部边界，用 symbolsviewer 的 Value 输入补齐视觉验证；
- 附件样例语义中 `2/1/1` 使用 CN_1，`25` 使用 CN_2，文本显示 raw 数字；
- 数字居中可读，不带 `$`，绑定在当前 tier Spine 的 `Num` slot 下并明显跟随该 slot/bone 动画，不是独立同级 overlay；
- CN value 位于实际 reel slot 内、bg-win result 金额下，global win-amount 仍在最上层；
- bg-win 首轮/lingering、win-amount 点击、下一 spin clear 都没有回归；
- 横窄、横宽、竖屏 resize 后 CN art/text 仍跟随对应 cell；
- 非 CN 不显示数字；非法服务端数据显式失败，不静默显示基础 CN。

再启动 symbolsviewer：

```bash
CI=true pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 5209
```

选择 `game002-s3 -> CN`，依次输入 `9,10,99,100,999,1000`，确认当前 manifest 的档位切换和新美术；普通 symbol 不出现 Value 控件，tier resources 不出现在 symbol selector。再用测试或临时 manifest fixture 验证改为不同档数/文件名时只需重生成 closure，手写 app source 无需修改；不要为人工测试改写正式资源后忘记恢复。

浏览器验收截图如需保存，只放本地临时目录，不加入 git；报告记录是否由 Codex 或用户执行、URL（隐去 token）和结论。没有完成 live/视觉验收时必须明确写“待人工验收”，不能宣称完整发布验收完成。

## 13. 二次遗漏审计

实现完成后逐项复核，不允许只写“已检查”：

### 13.1 数据与失败边界

- [ ] 只消费第 0 step、`bg-gencoins`、一个 `usedOtherScenes`。
- [ ] scene/otherScene 均是 x 优先 `6 x 9`，无转置。
- [ ] CN code 来自 game config，不硬编码 `8`。
- [ ] CN positive safe integer；非 CN 精确为 0。
- [ ] defaultScene 与本地临时轮带 CN 只从 manifest `defaultValues` 取值，occurrence 内稳定；最终 target 精确使用服务器 otherScene。
- [ ] 未触发组件为空；触发但数据缺失显式失败。
- [ ] app 不选择 tier、不格式化货币、不维护阈值第二份表。

### 13.2 manifest 与新美术

- [ ] CN 顶层无 normal/state；`CN.valuePresentation` 是 defaultValues、reelStates、tier 数量、阈值、Spine 路径/命名、文字 slot/local offset 和样式唯一来源。
- [ ] 通用实现支持任意非空档数；当前实例边界精确为 `<10/<100/<1000/unbounded`。
- [ ] 当前 CN_1..4 以及未来任意 tier resources 都不是主 display symbols。
- [ ] 不做资源 SHA/hash 校验；工作区保护确认没有触发资源覆盖流程。
- [ ] 遍历 manifest 实际资源校验 4.3.x、configured animation、configured `Num` slot、atlas/texture；没有固定四文件循环。
- [ ] generator rerun 不丢 valuePresentation、animations、renderPriority。
- [ ] game002/symbolsviewer generated closure 均通过 `--check`，loading/build/dist 精确包含 manifest 引用资源，不只是 source 文件存在。
- [ ] 1/3/5 档和任意资源名 fixture 不需要修改 production TypeScript；未引用 JSON 没有因宽泛 glob 入包。

### 13.3 rendercore 边界

- [ ] 通用 source 无 `bg-gencoins`、CN、game002/game003 分支。
- [ ] 只依赖最小 geometry target，不依赖具体 ReelSet。
- [ ] 官方 Spine player/parser/cache 被复用，无第二 renderer/canvas。
- [ ] 多 CN 独立实例、持续 update、clear/pool/destroy 无串值泄漏。
- [ ] 无静态/首帧/normal/default tier fallback。

### 13.4 adapter 与交互

- [ ] data/resource prepare 在 spin 前，错误不会启动 reel。
- [ ] target endpoint 在 spin 前写入服务器值，停轴校验后释放 prepared 预检资源；presentation 不额外阻塞 collect。
- [ ] z-order 与 bg-win/global win-amount 正确。
- [ ] 下一 spin、initial、destroy、mount rollback 都清理。
- [ ] async prepare/destroy/concurrent spin 无迟到复活。
- [ ] viewport resize 无 app 私有映射。

### 13.5 邻接消费者与交付

- [ ] symbolsviewer 通过 public API 预览任意档数，不把 tier 当 symbol，不手写当前 tier 名。
- [ ] game003 CO overlay、YAML/generated 和 Spine 4.2 资源零 diff。
- [ ] README、`agents.md`、source-boundary、static dist 同步。
- [ ] rendercore/game002/symbolsviewer 单包严格验收通过。
- [ ] 根级首错如实记录，没有为了测试改坏 production。
- [ ] 最终报告路径、UTC 命名、无 hash 验收决策、自动/视觉验收齐全。

## 14. 任务报告要求

完成后用：

```bash
utctime=$(date -u +%y%m%d-%H%M%S)
```

创建：

```text
tasks/94-game002-other-scenes-tiered-cn-symbol-${utctime}.md
```

报告必须是中文并包含：

1. UTC 完成时间、分支、HEAD、初始/最终工作区状态；
2. 工作区资源保护措施及“不做 SHA/hash 验收”的明确结论；
3. manifest 最终 schema、顶层 normal/state 移除、reelStates、可配置档数/阈值/资源命名、当前四档实例、raw text、configured `Num` slot 和 Spine configured animation；
4. rendercore parser/resolver/presenter/pool/lifecycle 实际实现；
5. game002 otherScene mapping、fixture、adapter z-order/prepare/discard/target-slot/clear；
6. game002/symbolsviewer generated Vite/loading closure、`--check` 和任意命名/档数测试；
7. 修改/新增文件清单，`pnpm-lock.yaml` 是否变化；
8. 每条自动验收命令及结果；
9. root 失败时的首个真实错误和任务边界判断；
10. 浏览器/live 是否执行、隐去凭证的入口、manifest tiers 与新美术结论；
11. 第 13 节二次遗漏审计逐项结论；
12. 未完成项、风险和明确交接，不得写模糊“基本完成”。

## 15. 明确非目标

- 不修改 game002 live server、query、`lines=30`、loading 99%/100% 或 prepared session。
- 不读取、缓存或泄露服务器真实轮带；target scene 仍只叠加本轮本地临时轮带。
- 不修改 game003 的 `bg-gencoins/CO` overlay，不把 game002 CN runtime反向塞进 game003。
- 不把当前 `CN_1..CN_4` 或未来任何 tier resource 加入 paytable、game config symbolCodes、主 display set 或 reels。
- 不把 tier 数量、阈值或资源 basename 固定在 rendercore/game002/symbolsviewer 手写 production source；当前四档只是一份 manifest 配置。
- 不接入 `Nearwin1..3`、`WM_Fx` 或其它当前非主资源。
- 不为 CN tier 猜测 `Win/Start/Collect/Feature` 业务语义。
- 不支持 Spine 4.2/3.8，不手写 adapter，不增加静态或首帧 fallback。
- 不改金额 formatter、bg-win result carousel 或 global win-amount 合同。
- 不重新导出、压缩、格式化或替换用户提供的新美术资源。
