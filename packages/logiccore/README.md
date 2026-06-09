# logiccore

`@slotclientengine/logiccore` 是 slotclientengine monorepo 内部的游戏逻辑解析库，用于把服务端一次 spin 返回的 `gamemoduleinfo` 转换成前端渲染和业务逻辑可以直接查询的 `GameLogic` 对象。

本包只负责协议数据的严格解析和查询，不连接服务器，不依赖 `@slotclientengine/netcore`，也不做 protobuf Any 解码。

## 基本信息

- 包名：`@slotclientengine/logiccore`
- 位置：`packages/logiccore`
- 发布方式：monorepo 内部包，不单独发布
- 输出格式：CommonJS，构建产物位于 `dist/`
- 运行时依赖：无

## 基本用法

```ts
import { createGameLogic, createGameLogicFromGmi } from '@slotclientengine/logiccore';

const logic = createGameLogic(gameModuleInfoMessage);

const defaultScene = logic.getDefaultScene();
const randomNumbers = logic.getRandomNumbers();
const firstStep = logic.getStep(0);
const firstScene = firstStep.getScene(0);
const firstWinResult = firstStep.getResult(0);
const sameScene = logic.getScene(0, 0);
const sameWinResult = logic.getResult(0, 0);

if (firstStep.hasComponent('bg-spin')) {
  const scenes = firstStep.getComponentScenes('bg-spin');
}

const logicFromGmi = createGameLogicFromGmi(gameModuleInfoMessage.gmi, {
  bet: gameModuleInfoMessage.bet,
  lines: gameModuleInfoMessage.lines,
  totalwin: gameModuleInfoMessage.totalwin,
  gameid: gameModuleInfoMessage.gameid,
});
```

推荐入口是 `createGameLogic(message)`，入参是完整 `gamemoduleinfo` message。`createGameLogicFromGmi(gmi, meta)` 用于调用方已经拆出 `gmi` 的场景，`meta` 必须提供 `bet`、`lines`、`totalwin`，可选提供 `gamemodulename`、`gameid`、`playIndex`、`playwin`、`maxWinLimit`。

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
  "values": [
    { "values": [0, 4, 0, 4, 0] },
    { "values": [0, 5, 0, 3, 0] }
  ]
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
```

测试使用 Vitest，并启用 coverage，覆盖率阈值为 lines/functions/branches/statements 均不低于 80%。

如果依赖下载失败，可先配置本地代理后重新安装：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```
