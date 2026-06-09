# logiccore 初始化任务计划

## 1. 任务目标

新增一个内部核心库 `packages/logiccore`，用于把服务端 `gamemoduleinfo` 协议数据转换为前端可直接读取的游戏逻辑对象。

本计划是可直接执行版本，不依赖额外上下文。执行者只需要阅读本文件，即可完成项目初始化、核心 API、测试、README 和任务报告。

核心目标：

- 新增 workspace package：`packages/logiccore`。
- 包名使用 `@slotclientengine/logiccore`。
- 输入一次 spin 的完整 `gamemoduleinfo` 协议返回，生成一个 `GameLogic` 实例。
- 同时支持在调用方已经拆出 `gmi` 的场景下，用 `gmi + meta` 生成同等 `GameLogic` 实例，避免和“根据 gmi 数据生成逻辑对象”的需求脱节。
- `GameLogic` 必须能读取：
  - 默认转轴区 `defaultScene`。
  - 本次 spin 使用的全部 `randomNumbers`。
  - 每个 step 的 `coinWin`、`cashWin`。
  - 每个 step 内的 scene。
  - 每个 step 内的中奖结算 result。
  - 每个 step 内触发过的 component。
  - 每个 component 使用到的 scenes 和 results。
  - 本次 spin 的下注、线数、总中奖。
  - 原始 message、原始 `gmi`、原始 step 和原始 `clientData`，避免后续渲染需要的协议字段在标准化过程中丢失。
- 不做不必要的兜底。协议结构异常、关键字段缺失、索引越界、类型错误都要尽早抛错。
- 新增中文 `README.md`，说明数据模型、API、错误策略、测试和构建命令。
- 自动测试覆盖核心行为，覆盖率目标不低于 80%。
- 任务完成后，必须在 `tasks/` 下新增中文任务报告，文件名为 `16-logiccore-bootstrap-[utctime].md`。

## 2. 当前仓库事实

当前仓库可确认事实如下：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- `pnpm-workspace.yaml` 已匹配：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- 根级基础工具链包含：
  - `typescript`
  - `vite`
  - `vitest`
  - `eslint`
  - `prettier`
  - `ts-node`
  - `turbo`
- 现有内部包 `packages/netcore` 的正式包名是 `@slotclientengine/netcore`。
- `packages/netcore` 使用 CommonJS 输出：
  - `type: "commonjs"`
  - `main: "./dist/index.js"`
  - `types: "./dist/index.d.ts"`
  - `build: "tsc -p tsconfig.json"`
- `packages/netcore/src/utils.ts` 当前已有一个 `transformSceneData()`，会在输入无效时返回空数组。`logiccore` 不应直接复用这个宽松行为；本任务要求核心逻辑暴露异常，而不是把结构问题吞成空数据。
- 根级协作文件实际路径是 `agents.md`。只有当本任务改变仓库级协作规则、目录规范或基础脚本时，才需要同步更新 `agents.md`。

## 3. 协议术语定义

为避免实现时混淆，本任务固定以下术语。

### 3.1 gamemoduleinfo message

服务端一次 spin 的完整逻辑消息，外层字段包括：

- `msgid`：应为 `"gamemoduleinfo"`。
- `gamemodulename`：游戏模块名。
- `gameid`：游戏 id。
- `gmi`：最重要的游戏逻辑数据。
- `bet`：本次 spin 的下注。
- `lines`：本次 spin 的线数。
- `totalwin`：本次 spin 的总赢分，通常是 cash win。
- `playwin`：本次 play win，当前可保留。
- `maxWinLimit`：最大赢分限制，当前可保留。

### 3.2 gmi

`gmi` 是本任务的主要输入数据，至少包含：

- `defaultScene`
- `replyPlay`

### 3.3 scene

协议里的 scene 格式是 x 优先：

```json
{
  "values": [
    { "values": [0, 4, 0, 4, 0] },
    { "values": [0, 5, 0, 3, 0] }
  ],
  "indexes": [],
  "validRow": []
}
```

转换后必须保持 x 优先二维数组：

```ts
[
  [0, 4, 0, 4, 0],
  [0, 5, 0, 3, 0],
]
```

说明：

- 第一层 index 是 `x`。
- 第二层 index 是 `y`。
- 不能转置成 y 优先。
- 不能把无效 scene 静默转成空数组。

### 3.4 step

`gmi.replyPlay.results[index]` 表示一个 step。

有些游戏一次 spin 会触发多个 respin 或多段逻辑，因此一次 spin 可能有多个 step。每个 step 至少需要保留：

- `coinWin`
- `cashWin`
- `clientData`

### 3.5 step scene

`step.clientData.scenes[index]` 表示当前 step 中某个局面。一个 step 可能有多个 scene，用于表示图标变化或不同组件产出的局面。

### 3.6 win result

`step.clientData.results[index]` 表示当前 step 中某个中奖结算数据。

注意：

- `gmi.replyPlay.results` 是 step 数组。
- `step.clientData.results` 才是该 step 内的中奖结算数组。
- 不允许把这两种 `results` 混用。

中奖结算数据中的字段都要保留，尤其是：

- `pos`
- `type`
- `lineIndex`
- `symbol`
- `mul`
- `coinWin`
- `cashWin`
- `otherMul`
- `wilds`
- `symbolNums`
- `value`

`pos` 暂时按协议原样保留为 `number[]`，不在本任务里强行转换成坐标对象数组。后续如果需要坐标 helper，可以另开任务。

### 3.7 component

当前 step 的组件信息位于：

```text
step.clientData.curGameModParam
```

重要字段：

- `historyComponents`：当前逻辑实际触发的组件名数组。
- `historyComponentsEx`：候选或扩展组件名数组，当前只保留，不用来判断触发。
- `mapComponents`：组件名到组件数据的映射。

判断组件是否触发时，必须以 `historyComponents` 为准。

读取组件使用到的 scene/result 时，必须从该组件数据的：

```text
component.basicComponentData.usedScenes
component.basicComponentData.usedResults
```

读取索引，再映射到当前 step 的 `clientData.scenes` 和 `clientData.results`。

如果组件存在于 `historyComponents`，但 `mapComponents` 缺少同名 key，必须抛错。

如果组件数据存在，但没有 `basicComponentData`，例如协议中某些 protobuf Any 编码后的对象：

```json
{
  "type_url": "type.googleapis.com/sgc7pb.MoneyTriggerData",
  "value": {
    "type": "Buffer",
    "data": [10, 8, 26, 1, 1]
  }
}
```

本任务不做 protobuf 解码。此时：

- `hasComponent(name)` 仍应返回 `true`。
- `getComponent(name)` 应返回组件名、原始数据和 `hasBasicComponentData: false`。
- `getComponentScenes(name)` 和 `getComponentResults(name)` 返回空数组，因为明文数据里没有可验证的 `usedScenes` / `usedResults`。
- 不允许伪造索引，也不允许把原始组件数据丢掉。

## 4. 协议样例

测试 fixture 至少要覆盖下面这个精简但完整的样例。可以在执行时保存为：

```text
packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json
```

样例：

```json
{
  "msgid": "gamemoduleinfo",
  "gamemodulename": "CqbQ0Y7gtBpO5419j8h02",
  "gameid": 69002,
  "gmi": {
    "defaultScene": {
      "values": [
        { "values": [0, 4, 0, 4, 0] },
        { "values": [0, 5, 0, 3, 0] },
        { "values": [2, 0, 2, 0, 4] },
        { "values": [1, 1, 1, 1, 1] },
        { "values": [0, 8, 0, 6, 0] }
      ],
      "indexes": [],
      "validRow": []
    },
    "replyPlay": {
      "randomNumbers": [1, 1, 34, 0, 27],
      "results": [
        {
          "coinWin": 55,
          "cashWin": 275,
          "clientData": {
            "scenes": [
              {
                "values": [
                  { "values": [2, 0, 3, 0, 4] },
                  { "values": [2, 0, 3, 0, 4] },
                  { "values": [0, 4, 0, 5, 0] },
                  { "values": [1, 1, 1, 1, 1] },
                  { "values": [9, 0, 6, 0, 6] }
                ],
                "indexes": [],
                "validRow": []
              }
            ],
            "otherScenes": [],
            "results": [
              {
                "pos": [4, 0],
                "type": 5,
                "lineIndex": -1,
                "symbol": 9,
                "mul": 0,
                "coinWin": 0,
                "cashWin": 0,
                "otherMul": 0,
                "wilds": 0,
                "symbolNums": 1,
                "value": 0
              },
              {
                "pos": [0, 2, 1, 2],
                "type": 13,
                "lineIndex": -1,
                "symbol": -1,
                "mul": 0,
                "coinWin": 55,
                "cashWin": 275,
                "otherMul": 0,
                "wilds": 0,
                "symbolNums": 0,
                "value": 0
              }
            ],
            "curGameMod": "basic",
            "curGameModParam": {
              "historyComponents": ["bg-spin", "bg-trigger-x5", "bg-pay"],
              "respinComponents": [],
              "historyComponentsEx": [
                "bg-spin",
                "bg-trigger-sc",
                "bg-trigger-rs",
                "bg-trigger-x2",
                "bg-trigger-x5",
                "bg-trigger-x10",
                "bg-pay",
                "bg-branch-jk"
              ],
              "mapComponents": {
                "bg-spin": {
                  "basicComponentData": {
                    "usedScenes": [0],
                    "usedOtherScenes": [],
                    "usedResults": [],
                    "usedPrizeScenes": [],
                    "srcScenes": [],
                    "pos": [],
                    "mapUsedSPGrid": {},
                    "coinWin": 0,
                    "cashWin": 0,
                    "targetScene": 0,
                    "runIndex": 0,
                    "output": 0,
                    "strOutput": ""
                  },
                  "@type": "type.googleapis.com/sgc7pb.BasicComponentData"
                },
                "bg-trigger-x5": {
                  "basicComponentData": {
                    "usedScenes": [],
                    "usedOtherScenes": [],
                    "usedResults": [0],
                    "usedPrizeScenes": [],
                    "srcScenes": [],
                    "pos": [],
                    "mapUsedSPGrid": {},
                    "coinWin": 0,
                    "cashWin": 0,
                    "targetScene": 0,
                    "runIndex": 0,
                    "output": 0,
                    "strOutput": ""
                  },
                  "nextComponent": "",
                  "symbolNum": 1,
                  "wildNum": 0,
                  "respinNum": 0,
                  "wins": 0,
                  "winMulti": 1,
                  "@type": "type.googleapis.com/sgc7pb.ScatterTriggerData"
                },
                "bg-pay": {
                  "type_url": "type.googleapis.com/sgc7pb.MoneyTriggerData",
                  "value": {
                    "type": "Buffer",
                    "data": [10, 8, 26, 1, 1, 40, 55, 48, 147, 2]
                  }
                }
              },
              "mapVals": {
                "1": 5,
                "2": 5,
                "7": 0
              },
              "mapStrVals": {},
              "firstComponent": "",
              "nextStepFirstComponent": "",
              "@type": "type.googleapis.com/sgc7pb.GameParam"
            },
            "nextGameMod": "basic",
            "curIndex": 0,
            "parentIndex": 0,
            "modType": "",
            "prizeCoinWin": 0,
            "prizeCashWin": 0,
            "jackpotCoinWin": 0,
            "jackpotCashWin": 0,
            "jackpotType": 0
          }
        }
      ],
      "finished": true,
      "stake": null,
      "playStartTime": 1780995420064
    }
  },
  "playIndex": -1,
  "bet": 5,
  "lines": 10,
  "totalwin": 275,
  "playwin": 0,
  "maxWinLimit": 500000
}
```

## 5. 对外 API 规格

### 5.1 导出入口

`packages/logiccore/src/index.ts` 至少导出：

```ts
export {
  createGameLogic,
  createGameLogicFromGmi,
  GameLogicModel,
  GameLogicStepModel
} from "./game-logic";
export { LogicCoreError, LogicParseError } from "./errors";
export * from "./types";
```

### 5.2 创建逻辑实例

建议 API：

```ts
const logic = createGameLogic(gameModuleInfoMessage);
```

要求：

- 入参必须是完整 `gamemoduleinfo` message。
- 必须同时提供 `createGameLogicFromGmi(gmi, meta)`：
  - `gmi` 是完整 `message.gmi`。
  - `meta` 必须提供 `bet`、`lines`、`totalwin`。
  - `meta` 可选提供 `msgid`、`gamemodulename`、`gameid`、`playIndex`、`playwin`、`maxWinLimit`。
  - `createGameLogic(message)` 应复用同一条解析路径，等价于从完整 message 拆出 `gmi + meta` 后创建实例。
- 创建时完成必要校验和标准化。
- 创建成功后的实例应只读，调用方不能通过返回对象修改内部状态。数组、win result、component、raw message、raw gmi、raw step、raw clientData 都必须通过冻结对象或深拷贝来保护内部状态。

### 5.3 GameLogic 接口

建议接口：

```ts
export interface GameLogic {
  getGameModuleName(): string | undefined;
  getGameId(): number | undefined;
  getBet(): number;
  getLines(): number;
  getTotalWin(): number;
  getPlayWin(): number | undefined;
  getRawMessage(): unknown;
  getRawGmi(): unknown;
  getDefaultScene(): readonly (readonly number[])[];
  getRandomNumbers(): readonly number[];
  getStepCount(): number;
  getStep(index: number): GameLogicStep;
  getSteps(): readonly GameLogicStep[];
  getScene(stepIndex: number, sceneIndex: number): readonly (readonly number[])[];
  getResult(stepIndex: number, resultIndex: number): WinResult;
  hasComponent(stepIndex: number, name: string): boolean;
  getComponent(stepIndex: number, name: string): LogicComponent | undefined;
  getComponentScenes(
    stepIndex: number,
    name: string
  ): readonly (readonly (readonly number[])[])[];
  getComponentResults(stepIndex: number, name: string): readonly WinResult[];
}
```

要求：

- `getDefaultScene()` 返回 x 优先二维数组。
- `getRandomNumbers()` 返回本次 spin 的 RNG 数组。
- `getBet()`、`getLines()`、`getTotalWin()` 是必需数据，缺失或非法时创建实例应失败。
- `getStep(index)` 越界时抛 `RangeError`，不要返回 `undefined`。
- `getScene(stepIndex, sceneIndex)`、`getResult(stepIndex, resultIndex)` 是顶层便捷接口，内部等价于 `getStep(stepIndex).getScene(sceneIndex)` 和 `getStep(stepIndex).getResult(resultIndex)`。
- `hasComponent(stepIndex, name)`、`getComponent(stepIndex, name)`、`getComponentScenes(stepIndex, name)`、`getComponentResults(stepIndex, name)` 是顶层便捷接口，内部等价于对应 step 接口。
- `getRawMessage()` 和 `getRawGmi()` 必须保留原始输入数据。通过 `createGameLogicFromGmi(gmi, meta)` 创建时，`getRawMessage()` 可以返回由 `gmi + meta` 组成的标准化 message，但不能丢失 meta 字段。raw 返回值也必须是只读快照，不能允许调用方修改实例内部状态。

### 5.4 GameLogicStep 接口

建议接口：

```ts
export interface GameLogicStep {
  getIndex(): number;
  getCoinWin(): number;
  getCashWin(): number;
  getRawStep(): unknown;
  getRawClientData(): unknown;
  getCurGameMod(): string | undefined;
  getCurGameModParam(): unknown;
  getSceneCount(): number;
  getScene(index: number): readonly (readonly number[])[];
  getScenes(): readonly (readonly (readonly number[])[])[];
  getResultCount(): number;
  getResult(index: number): WinResult;
  getResults(): readonly WinResult[];
  hasComponent(name: string): boolean;
  getComponent(name: string): LogicComponent | undefined;
  getComponentScenes(name: string): readonly (readonly (readonly number[])[])[];
  getComponentResults(name: string): readonly WinResult[];
}
```

要求：

- `getScene(index)` 读取当前 step 的 `clientData.scenes[index]`。
- `getResult(index)` 读取当前 step 的 `clientData.results[index]`。
- `getRawStep()`、`getRawClientData()`、`getCurGameMod()`、`getCurGameModParam()` 用于保留和读取当前 step 的完整协议上下文，不允许标准化时丢弃 `otherScenes`、`mulPos`、`prizeScenes`、`spGrid`、`nextGameMod`、`jackpot*` 等暂未建模字段。这些 raw 返回值也必须是只读快照，不能允许调用方修改实例内部状态。
- `hasComponent(name)` 根据 `historyComponents` 判断。
- `getComponent(name)`：
  - 未触发时返回 `undefined`。
  - 已触发时返回组件摘要和原始数据。
  - 已触发但 `mapComponents` 缺 key 时抛错。
- `getComponentScenes(name)`：
  - 未触发时返回空数组。
  - 已触发且有明文 `basicComponentData.usedScenes` 时，按索引返回 scene 数组。
  - 已触发但无 `basicComponentData` 时返回空数组，并在 `getComponent(name).hasBasicComponentData` 中体现。
  - `usedScenes` 指向越界 scene 时抛错。
- `getComponentResults(name)` 同上，使用 `usedResults` 映射到 win result。

### 5.5 LogicComponent 接口

建议接口：

```ts
export interface LogicComponent {
  name: string;
  raw: unknown;
  hasBasicComponentData: boolean;
  basicComponentData?: BasicComponentData;
  usedSceneIndexes: readonly number[];
  usedResultIndexes: readonly number[];
}
```

要求：

- 保留 `raw`，避免丢失协议字段。`raw` 必须是只读快照，不能允许调用方修改实例内部状态。
- `basicComponentData` 存在时必须校验 `usedScenes` 和 `usedResults` 都是非负整数数组。
- 如果不存在 `basicComponentData`，不得伪造。

## 6. 包结构要求

建议新增：

```text
packages/logiccore/
  README.md
  eslint.config.cjs
  package.json
  tsconfig.json
  tsconfig.eslint.json
  vitest.config.ts
  src/
    component.ts
    errors.ts
    game-logic.ts
    index.ts
    parser.ts
    scene.ts
    types.ts
  tests/
    component.test.ts
    errors.test.ts
    game-logic.test.ts
    parser.test.ts
    scene.test.ts
    fixtures/
      gamemoduleinfo-basic.json
      gamemoduleinfo-multistep.json
```

说明：

- 如新增空目录，必须放置 `.keepme`。
- `scene.ts` 只负责 scene 标准化和校验。
- `parser.ts` 负责把 raw protocol message 标准化为内部模型。
- `component.ts` 负责 component 触发判断、使用索引提取和索引映射。
- `game-logic.ts` 负责对外只读实例和查询接口。
- `types.ts` 负责 raw 类型、标准化类型和对外接口类型。
- `errors.ts` 负责自定义错误类型。

## 7. package.json 要求

`packages/logiccore/package.json` 建议方向：

```json
{
  "name": "@slotclientengine/logiccore",
  "version": "0.1.0",
  "private": true,
  "description": "Internal game logic parser and query library for slotclientengine.",
  "type": "commonjs",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run --coverage",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --ext .ts,.cjs",
    "lint:fix": "eslint . --ext .ts,.cjs --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "pnpm lint && pnpm test && pnpm typecheck && pnpm build"
  },
  "repository": {
    "type": "git",
    "url": "git+ssh://git@github.com/zhs007/slotclientengine.git",
    "directory": "packages/logiccore"
  },
  "keywords": ["slot", "game-logic", "typescript"],
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/zhs007/slotclientengine/issues"
  },
  "homepage": "https://github.com/zhs007/slotclientengine/tree/main/packages/logiccore",
  "devDependencies": {
    "@eslint/js": "^9.34.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^4.0.0",
    "eslint-config-prettier": "^9.1.0",
    "globals": "^15.15.0"
  }
}
```

要求：

- 本包默认不需要运行时依赖。
- 不依赖 `@slotclientengine/netcore`。`netcore` 负责拿到协议消息，`logiccore` 负责解析协议消息，两者边界保持清晰。
- 如执行中确实需要新增依赖，必须在报告中说明用途、版本、是否与根级工具链保持一致。

## 8. TypeScript、ESLint、Vitest 配置要求

### 8.1 TypeScript

`tsconfig.json` 必须继承根级 `tsconfig.base.json`。

建议：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": false,
    "target": "ES2023",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2023"],
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

`tsconfig.eslint.json` 应覆盖：

- `src`
- `tests`
- `vitest.config.ts`
- `eslint.config.cjs`

### 8.2 ESLint

`eslint.config.cjs` 可参考 `packages/netcore/eslint.config.cjs`，但不要为了测试放开过多生产代码规则。

要求：

- `dist/**`、`coverage/**`、`node_modules/**` 必须忽略。
- TypeScript parser 使用 `tsconfig.eslint.json`。
- 如果测试中需要使用 fixture 的宽泛类型，可只在 `tests/**/*.test.ts` 范围内放宽规则。

### 8.3 Vitest

`vitest.config.ts` 必须启用 coverage。

建议：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
});
```

如果首次实现因为非常小的分支数量导致 branch coverage 有异常波动，可以先检查测试是否覆盖了错误路径，而不是降低生产代码质量。确需调整阈值时，必须在任务报告中说明原因。

## 9. 解析和校验规则

### 9.1 顶层 message

创建 `GameLogic` 时必须校验：

- 入参是对象。
- `msgid === "gamemoduleinfo"`。
- `gmi` 是对象。
- `gmi.defaultScene` 存在且是合法 scene。
- `gmi.replyPlay` 是对象。
- `gmi.replyPlay.randomNumbers` 是整数数组。
- `gmi.replyPlay.results` 是数组。
- `bet` 是有限数字。
- `lines` 是有限数字。
- `totalwin` 是有限数字。

如果上述关键字段缺失或非法，必须抛 `LogicParseError`。

### 9.1.1 gmi + meta 输入

`createGameLogicFromGmi(gmi, meta)` 必须校验：

- `gmi` 是对象。
- `meta` 是对象。
- `meta.bet` 是有限数字。
- `meta.lines` 是有限数字。
- `meta.totalwin` 是有限数字。
- `meta.msgid` 如果存在，必须为 `"gamemoduleinfo"`。
- `meta.gameid` 如果存在，必须是有限数字。
- `meta.playwin` 如果存在，必须是有限数字。
- `meta.maxWinLimit` 如果存在，必须是有限数字。

`createGameLogic(message)` 和 `createGameLogicFromGmi(message.gmi, meta)` 对同一份协议数据必须生成等价的查询结果。

### 9.2 scene

scene 校验规则：

- scene 必须是对象。
- `scene.values` 必须是数组。
- `scene.values[index]` 必须是对象。
- `scene.values[index].values` 必须是数组。
- 每个 symbol id 必须是整数。
- 转换结果保持 x 优先。
- 不要求每一列高度完全一致，除非后续协议文档明确要求。高度不一致时仍保留真实数据。

非法 scene 必须抛错，不能返回 `[]`。

### 9.3 step

每个 `gmi.replyPlay.results[index]` 必须校验：

- step 是对象。
- `coinWin` 是有限数字。
- `cashWin` 是有限数字。
- `clientData` 是对象。
- `clientData.scenes` 是数组。
- `clientData.results` 是数组。
- `clientData.curGameModParam` 是对象。
- `curGameModParam.historyComponents` 是字符串数组。
- `curGameModParam.mapComponents` 是对象。

如果未来发现某些真实游戏没有 `curGameModParam`，不要在本任务里静默兜底，应先记录真实样例和影响，再决定是否调整 API 语义。

### 9.4 win result

每个 `clientData.results[index]` 至少校验：

- result 是对象。
- `pos` 是数字数组。
- 如果存在 `coinWin` / `cashWin`，必须是有限数字。

其余字段应原样保留，不要只挑几个字段复制，避免后续前端需要时数据丢失。

### 9.5 component

component 校验规则：

- `historyComponents` 中的每个 name 必须是非空字符串。
- `hasComponent(name)` 只看 `historyComponents`。
- 如果 name 已触发但 `mapComponents[name]` 缺失，调用 `getComponent(name)` 或组件映射接口时必须抛错。
- 如果 `basicComponentData` 存在：
  - `usedScenes` 必须是非负整数数组。
  - `usedResults` 必须是非负整数数组。
  - `usedScenes` 每个索引必须指向当前 step 的 scene。
  - `usedResults` 每个索引必须指向当前 step 的 win result。
- 如果 `basicComponentData` 不存在：
  - `getComponent(name)` 返回 `hasBasicComponentData: false`。
  - `getComponentScenes(name)` 返回 `[]`。
  - `getComponentResults(name)` 返回 `[]`。
  - 原始 component 数据必须保留在 `raw`。

## 10. 自动测试要求

自动测试不连接真实服务器，只使用 fixture 和内存对象。

至少覆盖以下用例：

- 可以从 `gamemoduleinfo-basic.json` 创建 `GameLogic`。
- 可以从 `createGameLogicFromGmi(gmi, meta)` 创建同等 `GameLogic`，且核心查询结果与完整 message 输入一致。
- `getDefaultScene()` 返回 x 优先二维数组：
  - `logic.getDefaultScene()[0]` 等于 `[0, 4, 0, 4, 0]`。
  - `logic.getDefaultScene()[4]` 等于 `[0, 8, 0, 6, 0]`。
- `getRandomNumbers()` 返回 `[1, 1, 34, 0, 27]`。
- `getBet()` 返回 `5`。
- `getLines()` 返回 `10`。
- `getTotalWin()` 返回 `275`。
- `getStepCount()` 返回 `1`。
- `getStep(0).getCoinWin()` 返回 `55`。
- `getStep(0).getCashWin()` 返回 `275`。
- `getStep(0).getScene(0)` 返回转换后的 scene。
- `logic.getScene(0, 0)` 返回同一个 step scene 的只读数据。
- `getStep(0).getResult(0).pos` 等于 `[4, 0]`。
- `getStep(0).getResult(1).cashWin` 等于 `275`。
- `logic.getResult(0, 1).cashWin` 等于 `275`。
- `getStep(0).hasComponent("bg-spin")` 返回 `true`。
- `getStep(0).hasComponent("bg-trigger-x5")` 返回 `true`。
- `getStep(0).hasComponent("not-exists")` 返回 `false`。
- `logic.hasComponent(0, "bg-spin")` 返回 `true`。
- `getStep(0).getComponent("bg-spin")` 返回 `usedSceneIndexes: [0]`。
- `getStep(0).getComponentScenes("bg-spin")` 返回第 0 个 scene。
- `logic.getComponentScenes(0, "bg-spin")` 返回第 0 个 scene。
- `getStep(0).getComponent("bg-trigger-x5")` 返回 `usedResultIndexes: [0]`。
- `getStep(0).getComponentResults("bg-trigger-x5")` 返回第 0 个 win result。
- `logic.getComponentResults(0, "bg-trigger-x5")` 返回第 0 个 win result。
- `getStep(0).getComponent("bg-pay")` 返回 `hasBasicComponentData: false`，且保留 `raw.type_url`。
- `getStep(0).getComponentScenes("bg-pay")` 返回空数组，但不丢失原始组件。
- `getRawMessage()`、`getRawGmi()`、`getRawStep()`、`getRawClientData()` 能取回原始上下文。
- `getCurGameMod()` 返回 `"basic"`，`getCurGameModParam()` 保留原始组件参数。
- 修改 `getRawMessage()`、`getRawGmi()`、`getRawStep()`、`getRawClientData()`、`getComponent("bg-pay")?.raw` 的返回值，不会污染实例内部状态。
- 多 step fixture 可正确读取 `getStep(1)`，并且组件索引只映射当前 step 的 scene/results。
- `getStep(-1)`、`getStep(999)` 抛 `RangeError`。
- `getStep(0).getScene(999)` 抛 `RangeError`。
- `getStep(0).getResult(999)` 抛 `RangeError`。
- 缺失 `gmi` 抛 `LogicParseError`。
- `msgid` 不是 `gamemoduleinfo` 抛 `LogicParseError`。
- `createGameLogicFromGmi(gmi, meta)` 缺失 `meta.bet`、`meta.lines` 或 `meta.totalwin` 时抛 `LogicParseError`。
- 缺失 `defaultScene` 抛 `LogicParseError`。
- `defaultScene.values` 不是数组时抛 `LogicParseError`，不能返回空数组。
- scene symbol 非整数时抛 `LogicParseError`。
- `randomNumbers` 缺失或不是整数数组时抛 `LogicParseError`。
- `replyPlay.results` 不是数组时抛 `LogicParseError`。
- step 缺失 `clientData` 抛 `LogicParseError`。
- step 缺失 `curGameModParam` 抛 `LogicParseError`。
- `historyComponents` 不是字符串数组时抛 `LogicParseError`。
- 组件已触发但 `mapComponents` 缺同名 key 时，组件读取接口抛错。
- `usedScenes` 指向越界 scene 时抛错。
- `usedResults` 指向越界 result 时抛错。
- 返回数组不能被调用方修改后影响内部状态。可用冻结对象或返回拷贝实现，但行为必须有测试。
- raw 返回值不能被调用方修改后影响内部状态。可用冻结对象或返回深拷贝实现，但行为必须有测试。

如果测试写法迫使生产代码出现奇怪分支或不必要兜底，应优先修改测试，不要为了测试改坏生产语义。

## 11. README 要求

新增 `packages/logiccore/README.md`，中文说明至少包含：

- 项目目的：把 `gamemoduleinfo` 转成前端渲染可查询的 `GameLogic`。
- 包名：`@slotclientengine/logiccore`。
- 安装位置：monorepo 内部包，不单独发布。
- 基本用法：

```ts
import { createGameLogic, createGameLogicFromGmi } from "@slotclientengine/logiccore";

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
  gameid: gameModuleInfoMessage.gameid
});
```

- 术语说明：
  - `gmi.replyPlay.results` 是 step。
  - `step.clientData.results` 是中奖结算 result。
  - `step.clientData.scenes` 是 step 内 scene。
  - `historyComponents` 决定组件是否触发。
  - `mapComponents[name].basicComponentData.usedScenes` 和 `usedResults` 决定组件使用的数据。
- x 优先 scene 结构说明。
- 完整 message 输入和 `gmi + meta` 输入的区别：完整 message 是推荐入口，`gmi + meta` 用于调用方已经拆出 `gmi` 的场景。
- 原始数据保留策略：`getRawMessage()`、`getRawGmi()`、`getRawStep()`、`getRawClientData()` 用于避免后续渲染字段丢失。
- 错误策略：关键字段异常直接抛错，不静默兜底。
- protobuf Any 编码组件暂不解码，但保留 raw。
- 构建、测试、覆盖率命令。
- 如果依赖下载失败，使用代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 12. 执行步骤

### 任务 1：创建 package 骨架

执行内容：

- 新增 `packages/logiccore`。
- 新增 `package.json`、`tsconfig.json`、`tsconfig.eslint.json`、`eslint.config.cjs`、`vitest.config.ts`。
- 新增 `src/index.ts` 和基础目录。
- 新增 `tests/fixtures`。

验收标准：

- `pnpm --filter @slotclientengine/logiccore typecheck` 能识别项目。
- `pnpm --filter @slotclientengine/logiccore build` 能输出 `dist`。

### 任务 2：定义类型和错误

执行内容：

- 新增 `src/types.ts`。
- 新增 `src/errors.ts`。
- 定义 raw protocol 类型、标准化模型类型、对外接口类型。
- 定义 `LogicCoreError`、`LogicParseError`。

验收标准：

- 外部使用者可以从包入口导入类型。
- 错误测试能区分解析错误和索引错误。

### 任务 3：实现严格 scene parser

执行内容：

- 新增 `src/scene.ts`。
- 实现 strict scene 转换函数。
- 保持 x 优先。
- 不复用 `netcore` 中无效输入返回空数组的宽松逻辑。

验收标准：

- 合法 scene 转换正确。
- 非法 scene 立即抛错。
- 测试覆盖 x 优先和错误输入。

### 任务 4：实现 component 解析和映射

执行内容：

- 新增 `src/component.ts`。
- 基于 `historyComponents` 实现触发判断。
- 基于 `mapComponents` 获取组件数据。
- 提取 `basicComponentData.usedScenes` 和 `usedResults`。
- 映射到当前 step 的 scene/results。

验收标准：

- `bg-spin` 可映射到第 0 个 scene。
- `bg-trigger-x5` 可映射到第 0 个 win result。
- `bg-pay` 这类无明文 `basicComponentData` 的组件保留 raw，不伪造使用索引。
- 缺失组件数据和越界索引会抛错。

### 任务 5：实现 GameLogic 和 GameLogicStep

执行内容：

- 新增 `src/game-logic.ts`。
- 实现 `createGameLogic()`。
- 实现 `createGameLogicFromGmi(gmi, meta)`。
- 构造只读标准化数据。
- 实现 `GameLogicModel` 和 `GameLogicStepModel` 查询接口。
- 实现顶层便捷接口：`getScene(stepIndex, sceneIndex)`、`getResult(stepIndex, resultIndex)`、`hasComponent(stepIndex, name)`、`getComponent(stepIndex, name)`、`getComponentScenes(stepIndex, name)`、`getComponentResults(stepIndex, name)`。
- 实现原始上下文接口：`getRawMessage()`、`getRawGmi()`、`getRawStep()`、`getRawClientData()`。

验收标准：

- 所有核心读取 API 可用。
- 返回数据不会被外部修改污染内部状态。
- step、scene、result 索引越界抛 `RangeError`。
- 完整 message 输入与 `gmi + meta` 输入结果一致。
- 标准化查询不会丢弃原始协议上下文。

### 任务 6：编写 fixture 和完整测试

执行内容：

- 新增 `gamemoduleinfo-basic.json`。
- 新增 `gamemoduleinfo-multistep.json`。
- 编写 scene、parser、component、game-logic 测试。
- 覆盖正常路径、异常路径、索引越界、组件映射、多 step。

验收标准：

- `pnpm --filter @slotclientengine/logiccore test` 通过。
- coverage 总体不低于 80%。

### 任务 7：编写 README

执行内容：

- 新增中文 `packages/logiccore/README.md`。
- 写明 API、术语、错误策略、命令和代理说明。

验收标准：

- README 不依赖本任务计划也能指导开发者使用 `logiccore`。

### 任务 8：验证和二次审计

执行命令：

```bash
pnpm install
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

如果 `pnpm install` 下载依赖失败，执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

二次审计必须检查：

- 是否存在把缺失关键字段静默转为空数组、0、空对象的兜底。
- 是否误把 `gmi.replyPlay.results` 当成中奖结算 result。
- 是否误把 `clientData.results` 当成 step。
- scene 是否被错误转置。
- component 是否以 `historyComponents` 判断触发。
- `usedScenes` 和 `usedResults` 是否只映射当前 step。
- 是否保留了 win result 的全部字段。
- 是否保留了无法解码组件的 raw 数据。
- 是否保留了原始 message、`gmi`、step 和 `clientData`，没有把暂未建模字段裁掉。
- 覆盖率是否达到 80%。
- README 是否和实际 API 一致。
- 是否真的需要更新根级 `agents.md`。

### 任务 9：输出任务报告

任务完成后必须新增中文任务报告：

```text
tasks/16-logiccore-bootstrap-[utctime].md
```

`utctime` 使用 UTC 时间短格式，例如：

```text
260609-181300
```

报告至少包含：

- 任务背景。
- 实际完成项。
- 最终 API 说明。
- 解析和错误策略说明。
- component 使用索引映射说明。
- 覆盖率结果。
- 执行过的验证命令与结果。
- 遇到的问题和处理方式。
- 二次审计结论。
- 是否更新了根级 `agents.md`，若未更新也要说明原因。

## 13. 完成定义

当以下条件全部满足时，可认为本任务完成：

- `packages/logiccore` 已创建并被 pnpm workspace 识别。
- 包名为 `@slotclientengine/logiccore`。
- `createGameLogic()` 可从完整 `gamemoduleinfo` message 创建 `GameLogic` 实例。
- `createGameLogicFromGmi(gmi, meta)` 可从 `gmi + meta` 创建同等 `GameLogic` 实例。
- `getDefaultScene()` 返回 x 优先二维数组。
- `getRandomNumbers()` 返回本次 spin 的 RNG 数组。
- 可读取本次 spin 的 `bet`、`lines`、`totalwin`。
- 可按 index 读取 step。
- 可按 index 读取某个 step 的 scene。
- 可按 index 读取某个 step 的中奖结算 result。
- 可通过顶层便捷接口按 `stepIndex + sceneIndex` 读取 scene。
- 可通过顶层便捷接口按 `stepIndex + resultIndex` 读取中奖结算 result。
- 可判断某个 component 是否触发。
- 可获取某个 component 的原始数据。
- 可获取某个 component 使用到的 scenes。
- 可获取某个 component 使用到的 results。
- 可读取原始 message、原始 `gmi`、原始 step 和原始 `clientData`。
- 多 step 数据不会互相串用 scene/result/component 索引。
- 关键协议字段非法时会抛错，不静默兜底。
- 越界索引会抛 `RangeError`。
- 无法解码的 protobuf Any 组件会保留 raw，并明确没有 `basicComponentData`。
- 自动测试覆盖核心正常路径和错误路径。
- 覆盖率不低于 80%。
- `packages/logiccore/README.md` 已完成。
- 以下验证命令通过：
  - `pnpm --filter @slotclientengine/logiccore lint`
  - `pnpm --filter @slotclientengine/logiccore test`
  - `pnpm --filter @slotclientengine/logiccore typecheck`
  - `pnpm --filter @slotclientengine/logiccore build`
  - `git diff --check`
- 根级验证尽量完成：
  - `pnpm lint`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm build`
- 已完成二次审计。
- 已新增中文任务报告：

```text
tasks/16-logiccore-bootstrap-[utctime].md
```

## 14. agents.md 更新规则

本任务默认不需要更新根级 `agents.md`，因为只是新增一个 `packages/` 下的内部库，不改变仓库级协作规则、目录规范或基础脚本。

如果执行中出现以下任一情况，则必须同步更新根级 `agents.md`：

- 新增或修改仓库级脚本约定。
- 新增所有 package 都必须遵守的统一规则。
- 改变 `apps/`、`packages/`、`tasks/`、`docs/` 的目录规范。
- 改变依赖安装、验证命令或代理规则。
- 改变基础工具链选择。

如仅新增 `packages/logiccore`、其 README、测试和任务报告，则无需更新根级 `agents.md`。

## 15. 本任务不做的事项

以下事项不作为本次初始化任务的完成前置：

- 不连接真实线上服务器。
- 不修改 `packages/netcore`。
- 不把 `logiccore` 接入 `apps/gameclientcli`。
- 不实现 protobuf Any 解码。
- 不设计动画播放时间轴。
- 不推导坐标对象格式。
- 不改变 win result 的协议字段含义。
- 不新增游戏模板或渲染层。

如果执行过程中发现这些事项确实必要，应记录在任务报告的后续建议中，不要夹带到本次初始化范围里。
