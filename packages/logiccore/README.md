# logiccore

`@slotclientengine/logiccore` 是 slotclientengine monorepo 内部的游戏逻辑解析库，用于把服务端一次 spin 返回的 `gamemoduleinfo` 转换成前端渲染和业务逻辑可以直接查询的 `GameLogic` 对象。

本包只负责协议数据的严格解析和查询，不连接服务器，不依赖 `@slotclientengine/netcore`，也不做 protobuf Any 解码。

## 基本信息

- 包名：`@slotclientengine/logiccore`
- 位置：`packages/logiccore`
- 发布方式：monorepo 内部包，不单独发布
- 输出格式：CommonJS，构建产物位于 `dist/`
- 运行时依赖：无
- 顶层入口 `@slotclientengine/logiccore` 只导出 browser-safe 纯逻辑；Node 文件系统加载能力位于 `@slotclientengine/logiccore/node`

## 基本用法

```ts
import {
  createGameLogic,
  createGameLogicFromGmi,
} from "@slotclientengine/logiccore";

const logic = createGameLogic(gameModuleInfoMessage);

const defaultScene = logic.getDefaultScene();
const randomNumbers = logic.getRandomNumbers();
const firstStep = logic.getStep(0);
const firstScene = firstStep.getScene(0);
const firstWinResult = firstStep.getResult(0);
const sameScene = logic.getScene(0, 0);
const sameWinResult = logic.getResult(0, 0);

if (firstStep.hasComponent("bg-spin")) {
  const scenes = firstStep.getComponentScenes("bg-spin");
}

const logicFromGmi = createGameLogicFromGmi(gameModuleInfoMessage.gmi, {
  bet: gameModuleInfoMessage.bet,
  lines: gameModuleInfoMessage.lines,
  totalwin: gameModuleInfoMessage.totalwin,
  gameid: gameModuleInfoMessage.gameid,
});
```

推荐入口是 `createGameLogic(message)`，入参是完整 `gamemoduleinfo` message。`createGameLogicFromGmi(gmi, meta)` 用于调用方已经拆出 `gmi` 的场景，`meta` 必须提供 `bet`、`lines`、`totalwin`，可选提供 `gamemodulename`、`gameid`、`playIndex`、`playwin`、`maxWinLimit`。

## 游戏配置 JSON

`createGameConfig(rawJson)` 用于消费 `apps/gengameconfig` 从 Excel 生成的游戏配置 JSON。浏览器、Vite app、Node 中已经持有 JSON object 的场景都使用顶层入口：

```ts
import { createGameConfig } from "@slotclientengine/logiccore";

const gameConfig = createGameConfig(rawJson);
const reels = gameConfig.getReels("reels01");
const symbol = reels.get(0, -1);
```

Node 中需要从 JSON 文件加载时，使用 Node-only 子入口：

```ts
import { loadGameConfigFromJsonFile } from "@slotclientengine/logiccore/node";

const gameConfig = await loadGameConfigFromJsonFile(
  "assets/gamecfg/output.json",
);
```

不要从顶层入口读取文件。`@slotclientengine/logiccore` 不 import `node:fs`、`node:path` 等 Node-only API，供浏览器 bundler 安全使用；`@slotclientengine/logiccore/node` 才包含文件系统能力。

游戏配置结构包含 `paytable`、`symbolCodes` 和 `reels`。`logiccore` 会严格校验 paytable code、symbol 双向一致，以及 reels 中的 symbol code 必须存在于 paytable；未知 code、空 reels、空轴或不匹配的 symbol 映射都会抛 `LogicParseError`，不会兜底成 `0` 或其它默认图标。

### reels 查询

`gameConfig.getReels(name)` 返回一套 `LogicReels`；不存在的 `name` 会抛 `RangeError`。`reels.get(x, y)` 要求 `x` 是合法轴索引、`y` 是整数；`y` 可以越界，内部按该轴长度 normalize：

```ts
normalized = ((y % length) + length) % length;
```

例如长度为 `10` 时，`reels.get(0, -1)` 读取 `9`，`reels.get(0, 10)` 读取 `0`，`reels.get(0, 11)` 读取 `1`。`normalizeY(x, y)` 支持表现层连续坐标，要求 `y` 是 finite number，不会四舍五入。

### 停止坐标

调用方从 `GameLogic` 取到 x 优先 scene 后，可以反查每轴停止后顶部可见行对应的 reel strip y 坐标：

```ts
const scene = logic.getStep(0).getScene(0);
const stopYCoordinates = gameConfig.getStopYCoordinates({
  reelsName: "reels01",
  sceneName: "step0.scene0",
  scene,
});
```

坐标定义为：

```ts
scene[x][visibleY] === reels.get(x, stopYCoordinates[x] + visibleY);
```

如果 scene 宽度和 reels 轴数不一致、某列为空、某列找不到匹配，接口会失败。某列存在多个匹配时会取第一个候选，也就是最小 y；实际服务端停留 y 不参与消歧，只要求可见 scene 完全一致。

### Live 前端临时轮带

真实服务器轮带不下发到前端，前端也不应通过其它配置或缓存暴露真实轮带。live spin 渲染时应使用本地公开轮带生成滚动过程；拿到服务器返回的最终 scene 后，只把本轮目标可见窗口叠加到渲染用的临时轮带落点窗口中。

因此，`getStopYCoordinates()` 适合做本地配置校验、fixture 校验或存在本地 exact stop 时的定位；但 live spin 的目标 scene 在本地轮带里找不到连续 stop y 时，不应直接判定服务端结果非法。此时调用方应保留本地轮带作为滚动内容，并在渲染层构造“本地轮带 + 服务器本轮落点窗口”的临时融合数据。

### 旋转起始坐标

`calculateSpinStartY` 和 `getSpinStartYCoordinates` 用于根据最终停止 y、表现层旋转时长和速度反推出开始旋转时的 y：

```ts
const startY = reels.calculateSpinStartY({
  x: 0,
  finalY: 3,
  durationMs: 250,
  speedSymbolsPerSecond: 8,
});
```

`direction` 默认是 `'forward'`。当表现层坐标随时间增加时，`startY = normalizeY(x, finalY - travel)`；当 `direction: 'backward'` 时，`startY = normalizeY(x, finalY + travel)`。`travel = speedSymbolsPerSecond * durationMs / 1000`，不要求整数，也不会自动取整。

## 核心术语

- `gmi.replyPlay.results` 是 step 数组，一次 spin 可能包含多个 step。
- `step.clientData.scenes` 是当前 step 内的 scene 数组。
- `step.clientData.results` 是当前 step 内的中奖结算 result 数组。
- `historyComponents` 决定当前 step 中哪些 component 实际触发。
- `mapComponents[name].basicComponentData.usedScenes` 和 `usedResults` 决定 component 使用当前 step 中哪些 scene/result。

## scene 结构

协议 scene 是 x 优先结构：

```json
{
  "values": [{ "values": [0, 4, 0, 4, 0] }, { "values": [0, 5, 0, 3, 0] }]
}
```

解析后仍保持 x 优先：

```ts
[
  [0, 4, 0, 4, 0],
  [0, 5, 0, 3, 0],
];
```

第一层 index 是 `x`，第二层 index 是 `y`。`logiccore` 不会把 scene 转置成 y 优先，也不会把无效 scene 静默转换成空数组。

## 原始数据保留

标准化查询不会裁掉当前未建模的协议字段。以下接口会返回只读快照，避免后续渲染或调试需要时找不到原始上下文：

- `logic.getRawMessage()`
- `logic.getRawGmi()`
- `step.getRawStep()`
- `step.getRawClientData()`
- `step.getCurGameModParam()`
- `step.getComponent(name)?.raw`

返回的 scene、result、component 和 raw 数据都不会被调用方修改后污染实例内部状态。

## 错误策略

本包采用 fail-fast 策略。关键字段缺失、类型错误、scene 结构非法、RNG 非整数、step/clientData 结构非法、组件 usedScenes/usedResults 越界等情况会抛 `LogicParseError`。

索引读取接口使用 `RangeError` 表示调用方传入的 step、scene 或 result index 越界：

```ts
logic.getStep(999); // RangeError
logic.getStep(0).getScene(999); // RangeError
logic.getStep(0).getResult(999); // RangeError
```

`hasComponent(name)` 只根据 `historyComponents` 判断。若某个 name 已触发但 `mapComponents` 缺少同名数据，读取 `getComponent(name)`、`getComponentScenes(name)` 或 `getComponentResults(name)` 时会抛 `LogicParseError`。

## protobuf Any 组件

如果触发组件存在于 `mapComponents`，但没有明文 `basicComponentData`，例如：

```json
{
  "type_url": "type.googleapis.com/sgc7pb.MoneyTriggerData",
  "value": {
    "type": "Buffer",
    "data": [10, 8, 26, 1, 1]
  }
}
```

`logiccore` 不会尝试解码 protobuf Any，也不会伪造使用索引。此时：

- `hasComponent(name)` 返回 `true`
- `getComponent(name)` 返回 `hasBasicComponentData: false`
- `getComponentScenes(name)` 返回空数组
- `getComponentResults(name)` 返回空数组
- 原始 component 数据保留在 `raw`

## 常用命令

```bash
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
pnpm --filter @slotclientengine/logiccore test:exports
```

测试使用 Vitest，并启用 coverage，覆盖率阈值为 lines/functions/branches/statements 均不低于 80%。

如果依赖下载失败，可先配置本地代理后重新安装：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```
