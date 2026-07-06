# game003 other scenes coin overlay 任务计划

## 1. 任务目标

本任务为 `logiccore` 增加通用 `otherScenes` 解析和按组件名查询能力，并在 `apps/game003` 中消费 `bg-gencoins.basicComponentData.usedOtherScenes`，把对应 `otherScene` 矩阵里的 coin 金额渲染到目标 scene 中每一个 `CO` symbol 上。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、文档同步、协作规则判断和最终任务报告。

核心合同：

- `clientData.scenes[]` 和 `clientData.otherScenes[]` 是同一个 step 内的两类矩阵数据。
- `otherScenes` 的协议形态和 `scenes` 一样，都是 x 优先的二维整数矩阵：第一层是列 `x`，第二层是列内行 `y`。
- `logiccore` 只负责严格解析和通用查询，不理解 `bg-gencoins`、`CO`、coin 金额或任意游戏专属语义。
- `packages/gameframeworks` 需要暴露 facade，使游戏 app 继续只依赖 `@slotclientengine/gameframeworks`，不直接 import `@slotclientengine/logiccore`。
- `apps/game003` 第一版只读取第 0 step 的 `bg-gencoins` 组件；该组件的 `usedOtherScenes` 必须指向当前 step 的一个 `otherScene`。
- `game003` 中 `CO` 表示 coin symbol。目标 scene 的每个 `CO` cell 都必须从 `otherScene[x][y]` 读取一个 positive integer coin amount，并在该 `CO` 图标上显示该原始数字。
- 非 `CO` cell 的 `otherScene[x][y]` 第一版必须为 `0`。如果服务端未来定义了其它语义，需要单独改合同、改测试，不能提前做隐藏兼容。
- CO 金额显示使用 raw coin amount，例如 `150` 显示为 `150`；不要复用 `formatServerUsdAmount(...)` 渲染成 `$1.50`，除非后续产品合同明确要求。
- 缺少 `clientData.otherScenes`、`basicComponentData.usedOtherScenes`、索引越界、矩阵维度不匹配、CO 缺金额、非 CO 带非零金额、文字样式配置缺失或坐标快照缺失，都必须显式失败。

任务完成后必须新增中文任务报告：

```text
tasks/84-game003-other-scenes-coin-overlay-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/84-game003-other-scenes-coin-overlay-260706-181300.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/minecart2
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。若确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game003 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。不要把缺失的 `otherScenes` 当空数组，不要把缺失的 CO 金额当 `0`，不要把非 CO 的非零金额静默忽略。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 相关文件

`logiccore` 解析和查询：

```text
packages/logiccore/src/types.ts
packages/logiccore/src/parser.ts
packages/logiccore/src/scene.ts
packages/logiccore/src/component.ts
packages/logiccore/src/game-logic.ts
packages/logiccore/src/index.ts
packages/logiccore/README.md
packages/logiccore/tests/component.test.ts
packages/logiccore/tests/game-logic.test.ts
packages/logiccore/tests/parser.test.ts
packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json
```

`gameframeworks` facade：

```text
packages/gameframeworks/src/component-helpers.ts
packages/gameframeworks/src/index.ts
packages/gameframeworks/src/types.ts
packages/gameframeworks/tests/component-helpers.test.ts
packages/gameframeworks/tests/test-helpers.ts
```

`game003` app：

```text
apps/game003/src/game-adapter.ts
apps/game003/src/game-demo.ts
apps/game003/src/skin-config.ts
apps/game003/src/win-symbol-loop.ts
apps/game003/src/win-symbol-loop-config.ts
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
apps/game003/config/game-static.yaml
apps/game003/tests/fixtures/game003-gmi.ts
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/tests/win-symbol-loop-config.test.ts
apps/game003/tests/win-symbol-loop.test.ts
apps/game003/README.md
```

game003 逻辑配置和 CO symbol：

```text
assets/gamecfg003/gameconfig.json
assets/game003-s1/symbol-state-textures.manifest.json
```

当前 `assets/gamecfg003/gameconfig.json` 中 `CO` 的 code 是 `11`，但实现中不要硬编码 `11`。应通过 `runtime.gameConfig.getSymbolCode("CO")` 或同等 game config 查询获得，并在缺失时显式失败。

协作规则文件：

```bash
find . -name AGENTS.md -print
find . -name agents.md -print
```

当前这次任务上下文提供了 `AGENTS.md` 规则，但仓库内未必已有同名文件。实现结束时必须检查实际文件；若需要新增或更新协作规则，要在报告中说明原因和路径。

### 3.2 现有接口基线

`logiccore` 当前已经支持：

- `step.clientData.scenes[]`
- `step.clientData.results[]`
- `curGameModParam.historyComponents`
- `curGameModParam.mapComponents`
- `basicComponentData.usedScenes`
- `basicComponentData.usedResults`
- `step.getComponentScenes(name)`
- `step.getComponentResults(name)`
- `logic.getComponentScenes(stepIndex, name)`
- `logic.getComponentResults(stepIndex, name)`

缺口：

- `clientData.otherScenes[]` 尚未进入 parsed step。
- `basicComponentData.usedOtherScenes` 尚未进入 component mapping。
- 没有 `getOtherScene(...)`、`getOtherScenes()`、`getComponentOtherScenes(...)` 等 scene-like API。
- `gameframeworks` 没有 `getComponentOtherScenesByName(...)` facade。
- `game003` 尚未把 `bg-gencoins` 的 `otherScene` 金额显示到 `CO` symbol 上。
- 仓库里还有一些不属于 game003 的 GMI fixture/mock 和 fake `GameLogic`，例如 `packages/uiframeworks/tests/test-helpers.ts`、`apps/gameframeworksviewer/src/mock-client.ts`、`apps/uiframeworksviewer/src/mock-client.ts`、`packages/gameframeworks/tests/test-helpers.ts`、`packages/logiccore/tests/win-results.test.ts`。`clientData.otherScenes` 变成必填后，这些旁路输入也必须同步补齐，否则 root `test/typecheck` 会在非目标包失败。

## 4. 数据合同

### 4.1 协议输入

目标 GMI 片段形态如下：

```json
{
  "clientData": {
    "scenes": [
      {
        "values": [
          { "values": [1, 7, 3, 6, 22] },
          { "values": [11, 11, 11, 11, 5] }
        ]
      }
    ],
    "otherScenes": [
      {
        "values": [
          { "values": [0, 0, 0, 0, 0] },
          { "values": [2, 1, 1, 150, 0] }
        ]
      }
    ],
    "curGameModParam": {
      "historyComponents": ["bg-bar", "bg-spin", "bg-gencoins"],
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

`logiccore` 需要保留 x 优先结构：

```ts
otherScene[x][y] === protocol.clientData.otherScenes[index].values[x].values[y];
```

### 4.2 logiccore 通用语义

`otherScenes` 只是通用整数矩阵，不等于中奖 result，也不等于 prize scene。

建议新增类型：

```ts
export type OtherSceneMatrix = SceneMatrix;
```

保留独立类型名是为了让调用方在 API 上区分普通 symbol scene 和附加矩阵语义；底层结构仍可复用 `SceneMatrix`。

必须新增或扩展：

```ts
interface BasicComponentData {
  readonly usedScenes: readonly number[];
  readonly usedOtherScenes: readonly number[];
  readonly usedResults: readonly number[];
}

interface LogicComponent {
  readonly usedSceneIndexes: readonly number[];
  readonly usedOtherSceneIndexes: readonly number[];
  readonly usedResultIndexes: readonly number[];
}

interface GameLogic {
  getOtherScene(stepIndex: number, otherSceneIndex: number): OtherSceneMatrix;
  getComponentOtherScenes(
    stepIndex: number,
    name: string,
  ): readonly OtherSceneMatrix[];
}

interface GameLogicStep {
  getOtherSceneCount(): number;
  getOtherScene(index: number): OtherSceneMatrix;
  getOtherScenes(): readonly OtherSceneMatrix[];
  getComponentOtherScenes(name: string): readonly OtherSceneMatrix[];
}
```

`ParsedGameLogicStepData` 需要新增：

```ts
readonly otherScenes: readonly OtherSceneMatrix[];
```

解析规则：

- `clientData.otherScenes` 必须存在且必须是数组。
- 每一项使用和 `parseScene(...)` 同等严格的 x 优先整数矩阵解析，可复用 `parseScene(value, "...otherScenes[i]")`。
- `basicComponentData.usedOtherScenes` 必须存在且必须是 non-negative integer array。
- `usedOtherScenes` 每个索引必须 `< step.otherScenes.length`。
- 未触发组件返回 `undefined` / 空数组的行为与现有 scene/result mapping 保持一致。
- 已触发组件缺少 `mapComponents[name]`、缺少 `basicComponentData` 时的行为与现有组件合同保持一致：没有 basic data 的 protobuf Any 组件不伪造索引，返回空数组；有 basic data 但字段非法则抛 `LogicParseError`。

### 4.3 game003 专属语义

新增 app 层常量或配置：

```ts
const GAME003_COIN_OVERLAY_COMPONENT_NAME = "bg-gencoins";
const GAME003_COIN_SYMBOL = "CO";
```

这些名字只能出现在 `apps/game003` app 层、app 测试或 README 中，不允许进入 `packages/logiccore`、`packages/gameframeworks`、`packages/rendercore`。

game003 的 CO overlay 解析规则：

- 从 `logic.getStep(0).getScene(0)` 得到 target scene。
- 从 `getComponentOtherScenesByName(logic, "bg-gencoins", { stepIndex: 0 })` 得到 otherScenes。
- 如果本轮未触发 `bg-gencoins`，返回空 overlay 列表。
- 如果触发 `bg-gencoins` 但缺少 `basicComponentData`，显式失败。
- 第一版 `bg-gencoins` 必须刚好使用一个 otherScene；0 个或多个都显式失败，除非后续合同扩展。
- otherScene 尺寸必须和 target scene 完全一致，并且通过 `validateGame003Scene(...)` 的 5 x 5 尺寸基准校验。
- 通过 game config 查询 `CO` code；缺失时显式失败。
- target scene 中每个 `CO` cell 必须有 positive integer amount。
- target scene 中每个非 `CO` cell 的 amount 必须是 `0`。
- 如果 target scene 没有 `CO`，但 `bg-gencoins` 触发且 otherScene 全 0，可以返回空 overlay；若 otherScene 有非零金额，显式失败。
- 显示文本是 `String(amount)`，不带货币符号，不做 USD 缩放。

## 5. 实施步骤

### 5.1 logiccore：解析 otherScenes 和组件映射

修改 `packages/logiccore/src/types.ts`：

- 新增 `OtherSceneMatrix` 类型。
- `BasicComponentData` 增加 `usedOtherScenes`。
- `LogicComponent` 增加 `usedOtherSceneIndexes`。
- `GameLogic` / `GameLogicStep` 增加 otherScene 查询方法。
- `ParsedGameLogicStepData` 增加 `otherScenes`。

修改 `packages/logiccore/src/parser.ts`：

- 在 `parseStep(...)` 中解析 `clientData.otherScenes`。
- 错误路径必须包含 `gmi.replyPlay.results[index].clientData.otherScenes[otherSceneIndex]`，便于定位服务器数据问题。
- 不允许缺失时补空数组。

修改 `packages/logiccore/src/component.ts`：

- 在 `buildLogicComponent(...)` 里读取并校验 `basicComponentData.usedOtherScenes`。
- 增加 `getComponentOtherScenesForStep(...)`。
- `assertIndexesInRange(...)` 的 target 扩展为 `"scene" | "otherScene" | "result"`，错误信息要明确是哪一类索引越界。
- `freezeComponent(...)` 必须冻结 `usedOtherSceneIndexes`。

修改 `packages/logiccore/src/game-logic.ts`：

- `GameLogicModel` 增加 `getOtherScene(...)` 和 `getComponentOtherScenes(...)`。
- `GameLogicStepModel` 增加 `getOtherSceneCount()`、`getOtherScene(...)`、`getOtherScenes()`、`getComponentOtherScenes(...)`。
- 索引越界使用 `RangeError`，和 scene/result 现有调用一致。

修改 `packages/logiccore/src/index.ts`：

- 导出新增类型和 helper。

更新 `packages/logiccore/README.md`：

- 核心术语中加入 `step.clientData.otherScenes`。
- scene 结构后增加 otherScene 说明：结构相同、语义由游戏 app 决定。
- 组件 mapping 说明加入 `usedOtherScenes`。
- 错误策略加入缺失/非法 `otherScenes` 和 `usedOtherScenes` 的 fail-fast 行为。

### 5.2 logiccore：测试

更新或新增测试：

```text
packages/logiccore/tests/component.test.ts
packages/logiccore/tests/game-logic.test.ts
packages/logiccore/tests/parser.test.ts
packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json
```

必须覆盖：

- `step.getOtherScene(0)` 能读到 `clientData.otherScenes[0]`。
- `logic.getOtherScene(0, 0)` 与 step API 一致。
- `step.getOtherSceneCount()` / `step.getOtherScenes()` 返回只读矩阵。
- `step.getComponent("bg-gencoins")?.usedOtherSceneIndexes` 保留 `usedOtherScenes` 顺序。
- `step.getComponentOtherScenes("bg-gencoins")[0]` 指向正确 otherScene。
- 未触发组件返回空 otherScenes。
- 触发组件缺失 `mapComponents` 仍抛 `LogicParseError`。
- `clientData.otherScenes` 缺失、非数组、矩阵结构非法都抛 `LogicParseError`。
- `basicComponentData.usedOtherScenes` 缺失、非数组、负数、小数、越界都抛 `LogicParseError`。
- 调用方尝试修改 otherScene 或 component indexes 不会污染实例内部状态。

### 5.3 gameframeworks：facade

修改 `packages/gameframeworks/src/component-helpers.ts`：

- 新增 `getComponentOtherScenesByName(logic, name, { stepIndex })`。
- 行为与 `getComponentScenesByName(...)` 对齐：不传 `stepIndex` 时遍历所有触发 step，传入时只查目标 step。
- component name 校验复用现有 `validateComponentName(...)`。
- stepIndex 越界错误复用现有 `assertStepIndex(...)`。

修改 `packages/gameframeworks/src/index.ts` 和 `packages/gameframeworks/src/types.ts`：

- 重新导出 `getComponentOtherScenesByName`。
- 重新导出 `OtherSceneMatrix` 类型。

更新测试：

```text
packages/gameframeworks/tests/component-helpers.test.ts
packages/gameframeworks/tests/test-helpers.ts
```

必须覆盖：

- facade 只通过 `GameLogic` API 读取 otherScenes。
- `getComponentOtherScenesByName(logic, "bg-gencoins")` 能跨 step 汇总。
- `stepIndex` 过滤正确。
- 未触发组件返回空数组。
- 空 component name、非法 stepIndex 显式失败。

### 5.4 game003：静态配置和解析

修改 `apps/game003/config/game-static.yaml`，在 `skins."1".appExtensions` 下新增：

```yaml
game003CoinOverlay:
  # bg-gencoins 是服务端当前用于提供 CO 金额矩阵的组件名。
  componentName: bg-gencoins
  # coinSymbol 必须能在 assets/gamecfg003/gameconfig.json 的 symbolCodes 中找到。
  coinSymbol: CO
  text:
    # 金额文本锚到 CO symbol cell 中心，按 cellHeight 做 y 偏移。
    yOffsetRatioFromCellCenter: 0.08
    fontSize: 32
    fill: "#fff7d6"
    stroke: "#5a2500"
    strokeWidth: 4
```

新增 `apps/game003/src/coin-overlay-config.ts`：

- 从 `GAME003_STATIC_SKIN.appExtensions.game003CoinOverlay` 严格解析配置。
- 校验 allowed keys，不允许未知字段。
- `componentName` 第一版必须是 `bg-gencoins`。
- `coinSymbol` 第一版必须是 `CO`。
- `yOffsetRatioFromCellCenter` 建议限制在 `[-0.5, 0.5]`。
- `fontSize`、`strokeWidth` 必须是 positive number。
- `fill`、`stroke` 必须是 non-empty string。

新增测试：

```text
apps/game003/tests/coin-overlay-config.test.ts
```

必须覆盖：

- 正常配置能解析出 `componentName=bg-gencoins`、`coinSymbol=CO` 和文本样式。
- 缺少 `game003CoinOverlay` 显式失败。
- 未知字段显式失败。
- `componentName` 不是 `bg-gencoins` 显式失败。
- `coinSymbol` 不是 `CO` 显式失败。
- `text` 缺字段、`fontSize <= 0`、`strokeWidth <= 0`、空 `fill/stroke`、`yOffsetRatioFromCellCenter` 越界都显式失败。

修改 `apps/game003/src/skin-config.ts`：

- `Game003SkinConfig` 增加 `coinOverlay`。
- 在 skin 1 config 中调用 `getGame003CoinOverlayConfig(game003StaticSkin1.appExtensions)`。

更新 `apps/game003/tests/static-config.test.ts`：

- 断言 `GAME003_STATIC_CONFIG.skins["1"].appExtensions.game003CoinOverlay` 存在。
- 断言该配置仍只位于 `appExtensions`，不进入 shared `featureBars`、`winAmount` 或 symbol manifest。

修改 YAML 后必须重新生成：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

禁止手改：

```text
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

### 5.5 game003：CO overlay 数据解析

新增 `apps/game003/src/coin-overlay-sequence.ts`：

建议类型：

```ts
export interface Game003CoinOverlayItem {
  readonly x: number;
  readonly y: number;
  readonly amount: number;
  readonly text: string;
}
```

建议函数：

```ts
export function createGame003CoinOverlayItems(options: {
  readonly logic: GameLogic;
  readonly targetScene: SceneMatrix;
  readonly coinSymbolCode: number;
  readonly componentName: "bg-gencoins";
}): readonly Game003CoinOverlayItem[];
```

实现要求：

- 通过 `getComponentOtherScenesByName` 从 `@slotclientengine/gameframeworks` 获取数据。
- 不直接 import `@slotclientengine/logiccore`。
- `targetScene` 先走 `validateGame003Scene(targetScene, "game003 coin overlay target scene")`。
- otherScene 需要新增本地校验函数，确保列数和每列行数与 target scene 一致，且每个 value 是 non-negative integer。
- 使用 `coinSymbolCode` 判断 CO cell，不在解析函数里硬编码 `11`。
- CO cell 的 amount 必须是 positive integer。
- 非 CO cell 的 amount 必须是 `0`。
- 返回项按 scene 扫描顺序稳定排序：`x` 从小到大，`y` 从小到大。
- 如果本轮未触发 `bg-gencoins`，返回空数组。
- 如果触发但 otherScene 数量不等于 1，抛错。

新增测试：

```text
apps/game003/tests/coin-overlay-sequence.test.ts
```

必须覆盖：

- 示例 scene + otherScene 能解析出 `{ x: 1, y: 0, amount: 2 }`、`{ x: 1, y: 1, amount: 1 }`、`{ x: 1, y: 2, amount: 1 }`、`{ x: 1, y: 3, amount: 150 }`。
- 未触发 `bg-gencoins` 返回空数组。
- 触发但无 `basicComponentData` 失败。
- `usedOtherScenes` 为空、多个、越界失败。
- otherScene 尺寸和 target scene 不一致失败。
- CO amount 为 `0` 失败。
- 非 CO amount 非 `0` 失败。
- amount 为小数、负数、`NaN` 失败。
- CO symbol code 缺失或非法失败。

### 5.6 game003：Pixi overlay runtime

新增 `apps/game003/src/coin-overlay-runtime.ts`。

建议接口：

```ts
export interface Game003CoinOverlayRuntime {
  readonly container: Container;
  show(items: readonly Game003CoinOverlayItem[]): void;
  clear(): void;
  refresh(): void;
  getSnapshot(): Game003CoinOverlaySnapshot;
  destroy(): void;
}
```

实现要求：

- 使用 Pixi `Text` 渲染每个 CO 金额。
- `container` 加到 `worldLayer` 中，层级位于 `runtime.mainReelsLayer` 之后、`winSymbolLoopRuntime.container` 之前。
- 通过 `reelRuntime.getVisibleSymbolGeometrySnapshots([{ x, y }])` 获取每个 CO cell 的中心和 `cellHeight`。
- 文本位置为 `centerX, centerY + cellHeight * yOffsetRatioFromCellCenter`。
- `show(...)` 前先清理旧文本，避免两轮叠加。
- `clear()` 在每次新 spin 开始前调用。
- `refresh()` 用于 viewport/layout 变化后按当前 items 重算文字位置。
- 如果 geometry 数量和 item 数量不一致，显式失败。
- 如果 formatter 得到空字符串，显式失败。第一版 formatter 就是 `String(amount)`。
- `destroy()` 销毁 container children。

新增测试：

```text
apps/game003/tests/coin-overlay-runtime.test.ts
```

必须覆盖：

- `show(...)` 创建对应数量文本，文本内容是 raw amount。
- 位置按 geometry center 和 y offset 计算。
- `clear()` 隐藏并移除旧文本。
- 连续 `show(...)` 不累积旧文本。
- `refresh()` 在 fake geometry 改变后更新位置。
- `destroy()` 后再次使用显式失败。
- geometry 缺失或数量不匹配显式失败。

### 5.7 game003：接入 adapter

修改 `apps/game003/src/game-adapter.ts`：

- mount 时创建 `coinOverlayRuntime`。
- `worldLayer.addChild(...)` 顺序调整为：
  1. background
  2. conveyor
  3. bgBarRuntime.container
  4. mainReelBackground
  5. runtime.mainReelsLayer
  6. coinOverlayRuntime.container
  7. winSymbolLoopRuntime.container
  8. minecartRuntime.container
  9. winAmountPlayer.container
- `playSpin(logic)` 开始时调用 `coinOverlayRuntime.clear()`。
- 在启动 spin 前解析：
  - `targetScene`
  - `coinSymbolCode`
  - `coinOverlayItems`
  - `winQueue`
  - `bgBarPlan`
- 解析 CO overlay 时如果服务端数据非法，应在 `runtime.spinToScene(...)` 之前失败，避免已启动动画后才发现协议错误。
- 在主转轮完成且 `assertGame003ReelVisualMatchesTarget(...)` 通过后，调用 `coinOverlayRuntime.show(pending.coinOverlayItems)`。
- `PendingAnimation` 保存 `coinOverlayItems`。
- viewport 变化 `#applyViewport(...)` 后调用 `coinOverlayRuntime.refresh()`。
- `applyInitialState(...)` 重新应用 default scene 时清理 CO overlay，避免重连或重新初始化后保留上一轮文本。
- `destroy()` 中销毁 runtime 并清空引用。
- 不让 CO overlay 阻塞 `playSpin()`，它是落停后的静态展示；真正阻塞条件仍是主转轮、bg-bar、矿车、bg-wins 首轮和中奖金额主要播放。

修改 `apps/game003/tests/game-adapter.test.ts`：

- fake runtime 增加 geometry snapshot 或注入 fake `coinOverlayRuntime`。
- 验证下一轮 spin 开始会 clear 旧 CO 金额。
- 验证 spin 落停并完成 target scene 校验后才 show CO 金额。
- 验证 CO overlay 非法数据会让 `playSpin()` reject，并且不会启动 spin。
- 验证 CO overlay 不阻塞无 win 的 spin resolve。
- 验证 `applyInitialState(...)` 会清理已有 CO overlay。
- 验证与 `bg-wins`、win amount、bg-bar、minecart 并存时完成条件不被破坏。

### 5.8 全仓 fixture / fake API 同步

因为 `logiccore` 本轮会把 `clientData.otherScenes` 和 `basicComponentData.usedOtherScenes` 纳入正式合同，不能只改目标包 fixture。实现时必须执行：

```bash
rg -l "clientData" apps packages -g '*.ts' -g '*.json'
rg -n "createMockGameLogic|createFakeLogic|as GameLogic|getComponentScenes\\s*:|getScenes\\s*:" apps packages -g '*.ts'
```

逐项确认：

- 所有会被 `createGameLogic(...)` 或 `createGameLogicFromGmi(...)` 解析的自造 GMI 都包含 `clientData.otherScenes`。没有 otherScene 语义的 fixture 显式写 `otherScenes: []`。
- 所有带 `basicComponentData` 的 fixture 都包含 `usedOtherScenes`。没有使用时显式写 `usedOtherScenes: []`。
- 所有直接返回 `GameLogic` / `GameLogicStep` 的 test helper 或 fake object 补齐新增 API：`getOtherScene(...)`、`getComponentOtherScenes(...)`、`getOtherSceneCount()`、`getOtherScenes()`。
- 对只用 `as GameLogic` 做极窄 fake 的测试，如果新增 API 没有运行时意义，可以保留窄 fake，但必须确认 typecheck 不依赖完整结构，并在报告中说明没有补方法的原因。

重点检查文件：

```text
packages/logiccore/tests/win-results.test.ts
packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json
packages/logiccore/tests/fixtures/gamemoduleinfo-multistep.json
packages/gameframeworks/tests/test-helpers.ts
packages/uiframeworks/tests/test-helpers.ts
apps/gameframeworksviewer/src/mock-client.ts
apps/uiframeworksviewer/src/mock-client.ts
apps/gameclientcli/tests/fixtures/logic-gmi.ts
apps/game002/tests/fixtures/game002-gmi.ts
apps/game003/tests/fixtures/game003-gmi.ts
```

通用消费面也要同步：

- `apps/gameframeworksviewer/src/message-format.ts` 当前展示 step 的 `scenes/results` 和 component 的 `scenes/results` 数量。新增 `otherScenes` 后，应同步展示 step `otherScenes=${step.getOtherSceneCount()}` 和 component `otherScenes=${getComponentOtherScenesByName(...).length}`，并更新 `apps/gameframeworksviewer/tests/message-format.test.ts`。
- `apps/gameclientcli/src/gameplay-stats.ts` 当前统计 component 的 `usedSceneCount` / `usedResultCount`。新增 `usedOtherSceneIndexes` 后，应新增 `usedOtherSceneCount`，在表头、snapshot 类型、状态累计、测试断言中同步；若明确不展示，必须在报告中说明为什么不把通用 otherScene 使用量纳入 CLI 统计。默认要求是同步展示。

若本节文件被修改，需要在任务报告中按“旁路 fixture/fake 同步”单独列出。

### 5.9 文档和协作规则同步

更新 `apps/game003/README.md`：

- 在资源/静态配置章节说明 `appExtensions.game003CoinOverlay`。
- 新增 `bg-gencoins / CO 金额显示` 小节，写清：
  - 数据来自 `bg-gencoins.basicComponentData.usedOtherScenes`。
  - `otherScene[x][y]` 对应 target scene 同位置。
  - CO 显示 raw coin amount。
  - 非 CO 必须为 `0`。
  - shared 包不理解 `bg-gencoins` 或 `CO`。

更新 `packages/logiccore/README.md`：

- 说明 `otherScenes` 是通用矩阵数据，不承载游戏专属语义。
- 说明 component 可通过 `usedOtherScenes` 映射到当前 step 的 `otherScenes[]`。

更新 `apps/game003/tests/source-boundary.test.ts`：

- 保持 app 不直接 import `@slotclientengine/logiccore`。
- 新增断言：`packages/logiccore/src`、`packages/gameframeworks/src`、`packages/rendercore/src` 不包含 `bg-gencoins`、`game003CoinOverlay`、`COIN_OVERLAY`、`GAME003_COIN` 等 game003 专属词。
- 不要禁止 shared 包出现通用 `otherScenes`、`usedOtherScenes`、`getComponentOtherScenes`。

协作规则文件：

- 执行 `find . -name AGENTS.md -print` 和 `find . -name agents.md -print`。
- 如果仓库内存在相关规则文件，并且本任务新增了稳定协作边界，应同步加入：
  - `logiccore` 拥有通用 `otherScenes` 解析和按组件名查询。
  - `game003` 的 `bg-gencoins` / CO amount overlay 属于 app 层。
  - shared 包不能硬编码 `bg-gencoins`、`CO` 或 coin overlay 语义。
- 如果仓库内没有规则文件，任务报告中说明“本轮未同步仓库内 AGENTS.md，因为当前 checkout 未找到该文件；规则已写入 README/测试边界”。

## 6. 验收命令

所有命令在仓库根目录 `/Users/zerro/github.com/minecart2` 执行，除非命令本身指定 `--filter`。

### 6.1 任务范围检查

```bash
git status --short --untracked-files=all
git diff --stat
git diff --check
```

### 6.2 logiccore

```bash
CI=true pnpm --filter @slotclientengine/logiccore lint
CI=true pnpm --filter @slotclientengine/logiccore test
CI=true pnpm --filter @slotclientengine/logiccore typecheck
CI=true pnpm --filter @slotclientengine/logiccore build
CI=true pnpm --filter @slotclientengine/logiccore test:exports
CI=true pnpm --filter @slotclientengine/logiccore format:check
```

### 6.3 gameframeworks

```bash
CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
CI=true pnpm --filter @slotclientengine/gameframeworks format:check
```

### 6.4 game003

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 format:check
```

### 6.5 side-effect packages

如果 5.8 中的旁路 fixture/fake 被修改，至少执行对应包的 test/typecheck。建议默认执行：

```bash
CI=true pnpm --filter @slotclientengine/uiframeworks test
CI=true pnpm --filter @slotclientengine/uiframeworks typecheck
CI=true pnpm --filter gameframeworksviewer test
CI=true pnpm --filter gameframeworksviewer typecheck
CI=true pnpm --filter uiframeworksviewer test
CI=true pnpm --filter uiframeworksviewer typecheck
CI=true pnpm --filter gameclientcli test
CI=true pnpm --filter gameclientcli typecheck
```

如果确认某个包未被修改且 root checks 已覆盖，也可以不单独跑，但任务报告必须写清楚取舍。

### 6.6 root checks

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
CI=true pnpm format:check
```

如果 root checks 遇到与本任务无关的既有失败，不要为了通过 root check 改无关生产逻辑。必须在任务报告中记录：

- 失败命令
- 失败包/文件
- 为什么判定为本任务无关
- 本任务范围内哪些命令已经通过

### 6.7 boundary grep

以下命令用于确认边界：

```bash
rg -n "@slotclientengine/logiccore" apps/game003/src
rg -n "bg-gencoins|game003CoinOverlay|COIN_OVERLAY|GAME003_COIN" packages/logiccore/src packages/gameframeworks/src packages/rendercore/src
rg -n "getComponentOtherScenes|OtherScene|usedOtherScenes" packages/logiccore/src packages/gameframeworks/src apps/game003/src
```

预期：

- 第一条无输出，`rg` exit code 为 `1` 时表示没找到匹配，属于通过。
- 第二条无输出，`rg` exit code 为 `1` 时表示没找到匹配，属于通过。
- 第三条能看到通用 API 和 app 消费点。

### 6.8 浏览器/视觉验收

启动本地 dev server：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

手动验收 URL 示例仍参考 `apps/game003/README.md` 的 live query。需要找一局服务端返回 `bg-gencoins.usedOtherScenes` 且 target scene 包含 `CO` 的 spin。

视觉验收项目：

- loading 仍先到 `99%`，live 初始化成功后再进入游戏画面。
- spin 落停前不显示本轮 CO 金额。
- spin 落停并 target scene 校验后，每个 `CO` 图标上显示对应 raw coin amount。
- 非 `CO` 图标不显示数字。
- 下一次 spin 开始时上一轮 CO 数字立即清理。
- 横屏和竖屏 resize 后 CO 数字仍贴在对应 CO symbol 上。
- `bg-wins` result amount overlay、big/super/mega win amount、minecart 和 bg-bar 层级不被 CO 数字遮挡成错误视觉。

如果执行者无法完成浏览器验收，任务报告必须明确写“浏览器验收未执行”，并把上述项目作为交给用户的手动验收清单，不能把它写成已通过。

## 7. 任务报告要求

实现完成后新增：

```text
tasks/84-game003-other-scenes-coin-overlay-[utctime].md
```

报告必须包含：

- 本轮目标和实际完成项。
- 修改文件清单，按 `logiccore`、`gameframeworks`、`game003`、文档/规则分类。
- 如果修改了旁路 fixture/fake，按“旁路 fixture/fake 同步”单独列出文件和验证命令。
- 数据合同说明：`otherScenes` 通用解析、`bg-gencoins` app 层语义、CO amount raw 数字显示。
- 失败策略说明：哪些情况会显式失败，哪些没有做隐藏兜底。
- 验收命令和结果，逐条列出。
- 如果 root checks 有无关失败，附失败摘要和排除理由。
- 浏览器/视觉验收结果；未执行则明确交给用户验收。
- 是否更新了 `AGENTS.md` / `agents.md`；若未更新，说明检查结果和原因。
- `git status --short --untracked-files=all` 的最终状态摘要。

报告命名示例：

```bash
date -u +%y%m%d-%H%M%S
```

```text
tasks/84-game003-other-scenes-coin-overlay-260706-181300.md
```

## 8. 二次遗漏检查清单

实现者提交前必须逐项复查：

- `logiccore` 是否解析了 `clientData.otherScenes`，而不是只从 rawClientData 临时读。
- `usedOtherScenes` 是否进入 `LogicComponent`，并做了类型和越界校验。
- `GameLogic` 和 `GameLogicStep` 是否都有 scene-like direct getter 和 component getter。
- `gameframeworks` 是否提供 facade，`apps/game003/src` 是否仍无直接 `@slotclientengine/logiccore` import。
- `game003` 是否通过 game config 查询 `CO` code，而不是硬编码 `11`。
- `game003` 是否只在 app 层识别 `bg-gencoins` 和 `CO`。
- CO amount 是否显示 raw number，而不是 USD formatter。
- 非 CO 的非零 `otherScene` 是否显式失败。
- 下一轮 spin 开始时 CO overlay 是否清理。
- viewport resize 后 CO overlay 是否重新定位。
- `bg-wins` result amount、全局 win amount、bg-bar 和 minecart 的层级/完成条件是否未被破坏。
- 修改 YAML 后是否只通过 `generate:static-config` 更新 generated files。
- 全仓自造 GMI 是否都补齐 `clientData.otherScenes`，fake `GameLogic` / `GameLogicStep` 是否处理新增 API。
- `gameframeworksviewer` 和 `gameclientcli` 是否同步展示/统计通用 `otherScenes` 使用量，或在报告中解释未同步原因。
- `coin-overlay-config.test.ts` 和 `static-config.test.ts` 是否覆盖 appExtensions 解析和生成配置。
- README、source-boundary test、协作规则文件检查是否完成。
- 任务报告是否使用第 84 号文件名和 UTC 时间。
