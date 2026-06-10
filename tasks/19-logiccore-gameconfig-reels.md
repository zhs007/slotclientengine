# logiccore gameconfig reels 完善任务计划

## 1. 任务目标

完善 `packages/logiccore`，让它能消费任务 18 的 `gengameconfig` 输出 JSON，并提供 reel strip 查询、scene 反查停止坐标、以及根据停止坐标反推表现层起始坐标的能力。

本计划是可直接执行版本，不依赖额外上下文。执行者只需要阅读本文件，即可完成实现、测试、README、验收和任务报告。

核心目标：

- `logiccore` 能严格解析任务 18 输出的游戏配置 JSON。
- 提供通过 JSON 文件加载游戏配置的 Node 侧接口。
- 顶层入口 `@slotclientengine/logiccore` 必须保持 browser-safe，同时也能在 Node 环境使用；Node 文件系统能力只能通过独立子入口导出。
- package export 必须考虑 CommonJS `require`、现代 bundler/浏览器 ESM import、Node import/require 的消费方式，不能只满足当前测试调用方式。
- 能按 `reelsName` 取到一套 reels，并通过 `get(x, y)` 获取某一轴某个 y 坐标的图标；`y` 必须在接口内部按该轴长度 normalize。
- 能基于指定 scene 的数据和指定 reels 名称，反查每一轴最终停止时的顶部可见 y 坐标。
- 能在已知某一轴最终停止 y 坐标、表现层旋转时长和速度时，计算该轴开始旋转时的起始 y 坐标。
- 更新 `packages/logiccore/README.md`，说明 JSON 加载、reels 查询、停止坐标和起始坐标计算的用法。
- 补齐 Vitest 测试，覆盖正常路径、边界、错误路径和不允许静默兜底的场景。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `19-logiccore-gameconfig-reels-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

## 2. 当前仓库事实

当前仓库可确认事实如下：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- `packages/logiccore` 当前包名是 `@slotclientengine/logiccore`。
- `logiccore` 当前是 CommonJS 输出，构建产物位于 `packages/logiccore/dist/`。
- `logiccore` 当前运行时依赖为无。
- `logiccore` 当前 `package.json` 的 `exports["."]` 只有 `types` 和 `require`。本任务实现后必须重新确认这个导出形态是否足够支持浏览器 bundler 和 Node ESM import；如果不够，必须同步调整 package export 或构建产物。
- `logiccore` 已有入口：
  - `createGameLogic(message)`
  - `createGameLogicFromGmi(gmi, meta)`
- `logiccore` 当前 scene 结构是 x 优先：

```ts
[
  [0, 4, 0, 4, 0],
  [0, 5, 0, 3, 0],
];
```

第一层 index 是 `x`，第二层 index 是可见区域内的 `y`。

- `logiccore` 当前错误策略是 fail-fast：
  - 协议或数据结构非法抛 `LogicParseError`。
  - step、scene、result 这种调用方索引越界抛 `RangeError`。
  - 不允许把非法 scene 静默转成空数组。
- `logiccore` 当前测试使用 Vitest，并启用 coverage，覆盖率阈值为 lines/functions/branches/statements 均不低于 80%。
- 根目录协作文件实际存在路径是 `agents.md`。只有当本任务改变仓库级协作规则、目录规范或基础脚本时，才需要同步更新该文件。
- 本任务新增测试里的真实游戏配置数据必须来自：
  - `assets/gamecfg/paytable2.xlsx`
  - `assets/gamecfg/reels01.xlsx`
- 上面两个资产文件是本任务指定测试输入，不要在清理 ignored 产物时误删。
- 本任务新增测试里的 GMI 数据直接复用任务 16 已有 fixture：
  - `packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json`
  - 需要多 step 或组件场景时，才使用 `packages/logiccore/tests/fixtures/gamemoduleinfo-multistep.json`
- 二次审计已知预检结果：
  - 直接执行任务 18 当前 CLI 生成命令时，`reels01.xlsx` 会在 `Sheet1!A46` 报错：`line 必须是原始数值单元格，实际为 空单元格`。
  - 原因是 `reels01.xlsx` 的 `line` 列在后段为空，但 `R5` 仍有 symbol 数据。
  - 本任务明确 `line` 数据不参与游戏配置语义，应在生成器里彻底忽略 `line` 列的数据校验。
  - 按 `paytable2.xlsx` 映射并按行读取 `reels01.xlsx` 后，任务 16 的 `gamemoduleinfo-basic.json` 第一 step 第一 scene 的停止坐标候选为 `[[1], [1], [4, 34], [0], [27]]`。
  - 本任务明确轮子停留的实际 y 不重要，只要从该 y 读出的可见 scene 完全一致即可；因此多候选时允许取第一个候选。
- 如果执行 `pnpm install` 或依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

## 3. 任务 18 JSON 契约

任务 18 的 `apps/gengameconfig` 输出 JSON 顶层结构如下，本任务必须以这个结构为输入契约：

```json
{
  "paytable": {
    "0": {
      "code": 0,
      "symbol": "WL",
      "pays": [0, 0, 0, 0, 0, 0]
    },
    "1": {
      "code": 1,
      "symbol": "H1",
      "pays": [0, 10, 15, 20, 25, 50]
    }
  },
  "symbolCodes": {
    "WL": 0,
    "H1": 1
  },
  "reels": {
    "reels01": [
      [1, 2, 6, 3],
      [1, 9, 3, 9],
      [1, 11, 2, 6]
    ]
  }
}
```

字段语义：

- `paytable`：
  - JSON key 是字符串化 code，例如 `"1"`。
  - value 必须包含 `code: number`、`symbol: string`、`pays: number[]`。
- `symbolCodes`：
  - key 是 symbol 字符串。
  - value 是整数 code。
- `reels`：
  - key 是 reels 名称，例如 `reels01`。
  - value 是 `number[][]`。
  - 第一维是轴编号，对应 `R1...Rn`。
  - 第二维是该轴上的 symbol code 序列。
  - 各轴长度允许不同，但每一轴都必须至少有一个 symbol code。

注意：任务 18 输出没有 `scenes` 字段，也没有 scene 名称表。本任务不要臆造 `gameConfig.scenes`。scene 数据来自 `logiccore` 已解析的 `SceneMatrix`，或者调用方直接传入的 `SceneMatrix`。

## 4. 新增公开 API 设计

### 4.1 纯数据入口

新增纯数据入口，供浏览器和 Node 都可使用，不依赖 `node:fs`：

```ts
import { createGameConfig } from '@slotclientengine/logiccore';

const gameConfig = createGameConfig(rawJson);
```

建议公开类型和接口：

```ts
export interface GameConfigPaytableEntry {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
}

export interface GameConfig {
  readonly paytable: Readonly<Record<string, GameConfigPaytableEntry>>;
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly reels: Readonly<Record<string, readonly (readonly number[])[]>>;
}

export interface LogicGameConfig {
  getRawConfig(): unknown;
  getPaytableEntry(code: number): GameConfigPaytableEntry | undefined;
  getSymbolCode(symbol: string): number | undefined;
  getReelNames(): readonly string[];
  getReels(name: string): LogicReels;
  getStopYCoordinates(options: ReelStopYOptions): readonly number[];
  getSpinStartYCoordinates(options: ReelSpinStartYsOptions): readonly number[];
}

export function createGameConfig(config: unknown): LogicGameConfig;
```

要求：

- `createGameConfig` 必须严格验证输入结构。
- 返回的数据和数组必须冻结或拷贝，不能被调用方修改后污染内部状态。
- `getReels(name)` 对不存在的 `name` 抛 `RangeError`，不能返回空 reels。
- `getPaytableEntry(code)` 和 `getSymbolCode(symbol)` 可以返回 `undefined`，这是查询语义，不是解析兜底。

### 4.2 浏览器与 Node 环境边界

`logiccore` 最终需要同时服务浏览器渲染层和 Node 工具链，因此导出边界必须明确：

- 顶层入口 `@slotclientengine/logiccore`：
  - 只导出纯数据解析、查询和计算能力。
  - 必须可以被浏览器 bundler 使用，例如 Vite app 中的 `import { createGameConfig } from '@slotclientengine/logiccore'`。
  - 必须可以被 Node 使用，例如 CommonJS `require('@slotclientengine/logiccore')`。
  - 不得 import `node:fs`、`node:path`、`node:crypto`、`process`、`Buffer` 或其它 Node-only API。
  - 不得依赖 `window`、`document` 或其它 DOM-only API；纯逻辑在 Node 和浏览器中应得到一致结果。
- Node 子入口 `@slotclientengine/logiccore/node`：
  - 只导出 Node-only 辅助能力，例如从 JSON 文件读取游戏配置。
  - 可以使用 `node:fs/promises` 和 `node:path`。
  - 不得从顶层入口 re-export 到浏览器可见 API。
- 如果继续保持单一 CommonJS 构建，`package.json` 的 `exports` 至少要让 CommonJS、Node ESM 动态 import、Vite/browser bundler 都能消费顶层纯逻辑入口。
- 如果单一 CommonJS 构建无法稳定通过 ESM/bundler smoke test，应改为双产物构建或其它明确方案，例如：
  - `dist/cjs/*` 供 `require` 使用。
  - `dist/esm/*` 供 `import` 和浏览器 bundler 使用。
  - `dist/*.d.ts` 或 `dist/types/*` 供 TypeScript 使用。
- 不要为了文件加载方便把 `loadGameConfigFromJsonFile` 放进顶层入口；这会让浏览器端打包边界变脏。

建议最小导出形态如下。执行者可以按实际构建方案调整路径，但语义必须保持：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./node": {
      "types": "./dist/node.d.ts",
      "require": "./dist/node.js",
      "default": "./dist/node.js"
    }
  }
}
```

如果改为 ESM + CJS 双产物，建议显式增加 `import` 条件：

```json
{
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs"
    },
    "./node": {
      "types": "./dist/types/node.d.ts",
      "import": "./dist/esm/node.js",
      "require": "./dist/cjs/node.cjs"
    }
  }
}
```

选择哪种方案以 smoke test 结果为准。不要只因为 TypeScript 单测通过就认为浏览器导出也可用。

### 4.3 Node JSON 文件加载入口

新增 Node 侧 JSON 文件加载接口：

```ts
import { loadGameConfigFromJsonFile } from '@slotclientengine/logiccore/node';

const gameConfig = await loadGameConfigFromJsonFile('assets/gamecfg/output.json');
```

实现要求：

- 新增 `packages/logiccore/src/node.ts` 或 `packages/logiccore/src/game-config-node.ts`。
- 使用 `node:fs/promises` 读取 UTF-8 JSON 文件。
- JSON 解析失败、文件不是合法任务 18 配置、文件不存在或路径不是文件时，必须抛出清晰错误，错误信息包含路径。
- 不要在顶层 `packages/logiccore/src/index.ts` 里直接 import `node:fs/promises`。
- 在 `packages/logiccore/package.json` 增加 subpath export，且不要破坏顶层 browser-safe export，例如：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./node": {
      "types": "./dist/node.d.ts",
      "require": "./dist/node.js",
      "default": "./dist/node.js"
    }
  }
}
```

这样浏览器侧使用 `@slotclientengine/logiccore` 时不会被 Node 文件系统 API 绑住。

### 4.4 Reels 查询接口

新增 `LogicReels`：

```ts
export interface LogicReels {
  getName(): string;
  getReelCount(): number;
  getLength(x: number): number;
  get(x: number, y: number): number;
  normalizeY(x: number, y: number): number;
  findStopYCandidates(x: number, visibleSymbols: readonly number[]): readonly number[];
  getStopY(x: number, visibleSymbols: readonly number[]): number;
  calculateSpinStartY(options: ReelSpinStartYOptions): number;
}
```

语义要求：

- `get(x, y)`：
  - `x` 必须是合法轴索引。
  - `y` 必须是整数。
  - `y` 可以小于 0，也可以大于等于该轴长度。
  - 内部使用该轴长度 normalize：

```ts
normalized = ((y % length) + length) % length;
```

  - 返回 `reels[x][normalized]`。
  - 不允许因为 y 越界返回 `undefined`、`0` 或其它默认值。
- `normalizeY(x, y)`：
  - `x` 必须合法。
  - `y` 必须是 finite number，可以是小数，用于表现层连续坐标。
  - 返回范围必须是 `[0, getLength(x))`。
  - 不要四舍五入，不要自动取整。
- `findStopYCandidates(x, visibleSymbols)`：
  - `visibleSymbols` 是某一轴 scene 中从上到下的可见 symbol code。
  - 在该轴 reel strip 上查找所有满足下面条件的 y：

```ts
for every visibleY:
  reels.get(x, y + visibleY) === visibleSymbols[visibleY]
```

  - 返回所有候选 y，按 y 从小到大排序。
- `getStopY(x, visibleSymbols)`：
  - 调用 `findStopYCandidates`。
  - 如果候选数量是 0，抛 `LogicParseError`，信息包含 reels 名、x、visibleSymbols。
  - 如果候选数量大于等于 1，返回第一个候选，也就是最小 y。
  - 多候选不算错误，因为本任务只要求可见 scene 完全一致，不要求还原服务端实际停止 y。

### 4.5 Scene 停止坐标接口

新增 scene + reels 反查接口：

```ts
export interface ReelStopYOptions {
  readonly reelsName: string;
  readonly sceneName: string;
  readonly scene: SceneMatrix;
}
```

语义要求：

- `sceneName` 是调用方传入的诊断名，用于错误信息和日志；实际计算仍使用 `scene` 矩阵。
- `reelsName` 必须对应 `gameConfig.reels` 中的一套 reels。
- `scene` 仍是 x 优先结构。
- `scene.length` 必须等于 `reels.getReelCount()`。
- 每个 `scene[x]` 必须至少有一个可见 symbol。
- `getStopYCoordinates(options)` 对每个 x 调用 `reels.getStopY(x, scene[x])`。
- 返回值是 `readonly number[]`，第 x 项代表该轴停止后顶部可见行对应的 reel strip y 坐标。
- 明确坐标定义：

```ts
scene[x][visibleY] === reels.get(x, stopYCoordinates[x] + visibleY)
```

- 如果 scene 宽度和 reels 轴数量不一致、某列为空、某列找不到匹配，都必须抛错。
- 如果某列有多个匹配，取第一个候选，也就是最小 y；不要用 `logic.getRandomNumbers()` 或其它隐藏数据消歧。

不新增按字符串 sceneName 自动从 `gamemoduleinfo` 找 scene 的能力，因为当前协议解析结果里的 scene 没有稳定 name 字段。调用方可以用现有接口拿到 scene 后再传入：

```ts
const scene = logic.getStep(0).getScene(0);
const stops = gameConfig.getStopYCoordinates({
  sceneName: 'step0.scene0',
  reelsName: 'reels01',
  scene,
});
```

如果调用方想按组件名取 scene，应显式使用现有组件接口，并自行保证只取到目标 scene：

```ts
const scenes = logic.getStep(0).getComponentScenes('bg-spin');
if (scenes.length !== 1) {
  throw new Error('bg-spin must use exactly one scene');
}

const stops = gameConfig.getStopYCoordinates({
  sceneName: 'bg-spin',
  reelsName: 'reels01',
  scene: scenes[0],
});
```

不要在 `logiccore` 里为 `scenes.length !== 1` 随便挑第一个。

### 4.6 反推旋转起始坐标接口

新增表现层起始 y 计算：

```ts
export type ReelSpinDirection = 'forward' | 'backward';

export interface ReelSpinStartYOptions {
  readonly x: number;
  readonly finalY: number;
  readonly durationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly direction?: ReelSpinDirection;
}

export interface ReelSpinStartYsOptions {
  readonly reelsName: string;
  readonly finalYs: readonly number[];
  readonly durationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly direction?: ReelSpinDirection;
}
```

坐标定义：

- `finalY` 是该轴最终停止时的顶部可见 y 坐标。
- `speedSymbolsPerSecond` 的单位是每秒移动多少个 symbol 高度。
- `durationMs` 是表现层旋转时长，单位毫秒。
- `direction` 默认使用 `'forward'`。
- 当表现层坐标随时间按 `'forward'` 增加时：

```ts
travel = speedSymbolsPerSecond * durationMs / 1000;
startY = normalizeY(x, finalY - travel);
```

- 当表现层坐标随时间按 `'backward'` 减少时：

```ts
travel = speedSymbolsPerSecond * durationMs / 1000;
startY = normalizeY(x, finalY + travel);
```

要求：

- `durationMs` 必须是非负 finite number。
- `speedSymbolsPerSecond` 必须是非负 finite number。
- `finalY` 必须是 finite number。
- `travel` 不要求是整数，不要四舍五入；如果表现层需要整 symbol 运动，应由调用方选择匹配的速度和时长。
- `getSpinStartYCoordinates` 要求 `finalYs.length === reels.getReelCount()`，逐轴调用 `calculateSpinStartY`。

## 5. 实现步骤

### 5.0 生成真实测试 fixture 的前置处理

本任务的主测试 fixture 必须由 `assets/gamecfg/paytable2.xlsx` 和 `assets/gamecfg/reels01.xlsx` 生成。执行实现前先运行：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg/paytable2.xlsx \
  --reel assets/gamecfg/reels01.xlsx \
  --out /tmp/slotclientengine-task19-gameconfig-reels01.json
```

如果命令已经成功：

- 继续用同一命令把输出写到 `packages/logiccore/tests/fixtures/gameconfig-reels01.json`。
- 检查输出 JSON 顶层 `reels` key 是否为 `reels01`。

如果命令失败，且错误是 `reels01.xlsx / Sheet1!A46: line 必须是原始数值单元格，实际为 空单元格`：

- 不要手写 `gameconfig-reels01.json` 绕过生成器。
- 不要改用 `paytables.xlsx` 或 `bg-reel01.xlsx`。
- 对 `apps/gengameconfig` 做最小兼容修复，使它彻底忽略 reels 表中的 `line` 数据。
- 建议规则：
  - 表头第一列仍可以是 `line`，用于兼容当前 Excel 结构，但该列从第二行开始的数据不参与解析、不校验类型、不校验连续性。
  - reels 数据行范围只根据 `R1...Rn` 列中的非空 symbol 决定，不要因为 `line` 列有值或为空影响解析。
  - 如果某一行所有 R 列都是空，可以视为无数据行；不要因此补 symbol。
  - 每个 R 列尾部空白后又出现 symbol 仍必须失败。
- 同步补 `apps/gengameconfig/tests/reels.test.ts` 或等价测试，覆盖 `line` 列为空、非数字或不连续但 R 列合法时仍可生成 reels。
- 如果 `apps/gengameconfig` 的输入契约变化影响 README，更新 `apps/gengameconfig/README.md`，说明 `line` 列只作人工阅读用，生成器会忽略其数据。
- 完成后重新生成 `packages/logiccore/tests/fixtures/gameconfig-reels01.json`。

如果失败原因不是上面的已知错误：

- 不要编造 fixture。
- 先定位失败原因；如果是输入文件损坏或契约冲突，任务报告必须明确写出，并停止后续依赖该 fixture 的实现验收。

### 5.1 新增类型和纯解析

修改或新增：

- `packages/logiccore/src/types.ts`
- `packages/logiccore/src/game-config.ts`
- `packages/logiccore/src/index.ts`

实现内容：

- 增加任务 18 JSON 结构相关类型。
- 增加内部 `ParsedGameConfigData`。
- 使用现有 `validation.ts` 的 `assertRecord`、`assertArray`、`assertInteger`、`assertFiniteNumber`、`cloneAndFreeze` 等工具。
- 如现有 validation 工具不够，只补小而明确的工具函数，例如 `assertNonEmptyString`、`assertSafeNonNegativeInteger`，不要做宽松转换。
- 校验 `paytable`：
  - 顶层必须是 object。
  - 每个 key 必须是整数 code 的字符串形式。
  - entry.code 必须等于 key 的数值。
  - entry.symbol 必须是非空字符串。
  - entry.pays 必须是非空整数数组。
  - code 不能重复，symbol 不能重复。
- 校验 `symbolCodes`：
  - 必须是 object。
  - 每个 key 必须是非空字符串。
  - value 必须是非负安全整数。
  - 必须和 `paytable` 双向一致：`symbolCodes[entry.symbol] === entry.code`。
  - 不允许存在 paytable 里没有的 symbol，也不允许 paytable symbol 缺失。
- 校验 `reels`：
  - 必须是 object。
  - reels name 必须是非空字符串。
  - 每套 reels 必须至少有一轴。
  - 每一轴必须是非空整数数组。
  - 每个 symbol code 必须能在 `paytable` 找到。
  - 不允许把未知 symbol code 当成 0 或其它默认图标。

### 5.2 新增 Reels 模型

新增：

- `packages/logiccore/src/reels.ts`

实现内容：

- `LogicReelsModel` 保存单套 reels 的冻结数据。
- 实现 `getName()`、`getReelCount()`、`getLength(x)`、`get(x, y)`、`normalizeY(x, y)`。
- 实现 `findStopYCandidates` 和 `getStopY`。
- 实现 `calculateSpinStartY`。
- 对非法 `x`、非法 `y`、非法 speed/duration/finalY 给出清晰错误。

### 5.3 新增 GameConfig 模型

新增或完善：

- `packages/logiccore/src/game-config.ts`

实现内容：

- `createGameConfig(config)` 返回 `LogicGameConfigModel`。
- `LogicGameConfigModel` 持有所有 `LogicReelsModel`。
- 实现 `getRawConfig()`、`getPaytableEntry(code)`、`getSymbolCode(symbol)`、`getReelNames()`、`getReels(name)`。
- 实现 `getStopYCoordinates(options)`。
- 实现 `getSpinStartYCoordinates(options)`。
- `getStopYCoordinates(options)` 多候选时取第一个候选；不读取 GMI random numbers。

### 5.4 梳理浏览器和 Node 导出

修改：

- `packages/logiccore/package.json`
- `packages/logiccore/tsconfig.json`
- 如需要双产物构建，可新增 `packages/logiccore/tsconfig.cjs.json`、`packages/logiccore/tsconfig.esm.json` 或等价配置。

实现内容：

- 保证 `@slotclientengine/logiccore` 顶层入口只包含 browser-safe 纯逻辑。
- 保证 `@slotclientengine/logiccore/node` 是唯一 Node-only 子入口。
- 检查并更新 `package.json` 的 `main`、`types`、`exports`，让下面用法都能被明确支持：
  - Browser/Vite：`import { createGameConfig } from '@slotclientengine/logiccore'`
  - Node CommonJS：`const { createGameConfig } = require('@slotclientengine/logiccore')`
  - Node import：`const core = await import('@slotclientengine/logiccore')`
  - Node 文件加载：`require('@slotclientengine/logiccore/node')` 或 `await import('@slotclientengine/logiccore/node')`
- 如果保持单一 CommonJS 构建：
  - 至少补齐 `default` export condition，并用 smoke test 证明 Vite/浏览器 bundler 可以做 named import。
  - 如果 named import smoke test 失败，不要用测试绕过；改成双产物构建或其它可解释的导出方案。
- 如果改成双产物构建：
  - CommonJS 和 ESM 产物必须都来自同一份 TypeScript 源码。
  - 顶层和 `./node` 两个 subpath 都要有对应 `types`。
  - README 和 package scripts 要同步更新。
- 新增 package script `test:exports`，专门跑导出边界 smoke：
  - Node CommonJS require 顶层入口。
  - Node import 顶层入口。
  - Node CommonJS require 或 Node import `./node` 子入口。
  - Vite/browser bundler named import 顶层入口。
- browser smoke 必须通过 package-level import 验证 `@slotclientengine/logiccore`，不要只从源码相对路径 import。若使用临时 Vite fixture，需要在 fixture 中明确模拟真实 app 的包名 import。
- 不要引入新的运行时依赖来做纯逻辑导出，除非确有必要并在任务报告中解释。

### 5.5 新增 Node JSON 文件加载

新增：

- `packages/logiccore/src/node.ts`

修改：

- `packages/logiccore/package.json`

实现内容：

- `loadGameConfigFromJsonFile(filePath: string): Promise<LogicGameConfig>`。
- 读取前用 `stat` 确认路径存在且是文件。
- 使用 `JSON.parse` 后调用 `createGameConfig`。
- 错误信息要包含 `filePath`。
- 更新 `exports`，增加 `./node` subpath，且确认顶层 export 没有导出 Node-only API。

### 5.6 README 更新

修改：

- `packages/logiccore/README.md`

必须补充：

- 游戏配置 JSON 来自 `apps/gengameconfig`。
- 浏览器或已持有 JSON object 时使用顶层入口 `createGameConfig(rawJson)`。
- Node 中已持有 JSON object 时也使用顶层入口 `createGameConfig(rawJson)`。
- Node 文件加载才使用 `@slotclientengine/logiccore/node` 的 `loadGameConfigFromJsonFile`。
- 明确 `@slotclientengine/logiccore` 是 browser-safe，`@slotclientengine/logiccore/node` 是 Node-only。
- `reels.get(x, y)` 的 y normalize 行为，包含 `-1` 和 `length` 示例。
- 停止坐标定义：

```ts
scene[x][visibleY] === reels.get(x, stopYCoordinates[x] + visibleY)
```

- `getStopYCoordinates` 遇到无匹配会失败；遇到多匹配时取第一个候选，因为实际停留 y 不重要，可见 scene 完全一致即可。
- `calculateSpinStartY` 的速度、时长、方向和不取整行为。
- 常用验证命令。

### 5.7 测试补齐

新增测试和 fixture：

- `packages/logiccore/tests/fixtures/gameconfig-reels01.json`
- `packages/logiccore/tests/game-config.test.ts`
- `packages/logiccore/tests/reels.test.ts`
- 如需要 Node 文件加载独立测试，可新增 `packages/logiccore/tests/node.test.ts`。
- 如 package export 行为无法用普通 Vitest 覆盖，新增脚本或测试文件覆盖 export smoke。

真实 fixture 生成要求：

- `packages/logiccore/tests/fixtures/gameconfig-reels01.json` 必须由任务 18 的 `gengameconfig` 从下面两个文件生成，不要手写一个看起来类似的 JSON 代替：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg/paytable2.xlsx \
  --reel assets/gamecfg/reels01.xlsx \
  --out packages/logiccore/tests/fixtures/gameconfig-reels01.json
```

- 生成后的 JSON 可以作为测试 fixture 提交，`logiccore` 测试只读取 JSON，不要给 `logiccore` 增加 Excel 解析依赖。
- 如果生成结果和旧示例 `paytables.xlsx` / `bg-reel01.xlsx` 不一致，以 `paytable2.xlsx` / `reels01.xlsx` 为准。
- 任务报告必须记录这条生成命令是否执行，以及生成 fixture 的 reels key 是否为 `reels01`。
- GMI 测试数据直接使用任务 16 已有的 `packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json`。只有确实需要多 step 场景时，才使用 `packages/logiccore/tests/fixtures/gamemoduleinfo-multistep.json`。

测试要求：

- `createGameConfig` 能解析 `packages/logiccore/tests/fixtures/gameconfig-reels01.json`。
- 返回的 raw config、paytable、reels、数组不能被外部 mutation 污染内部状态。
- `getReels('reels01')` 能返回指定 reels。
- 不存在的 reels name 抛错。
- `reels.get(x, y)` 覆盖：
  - `get(0, 0)`
  - `get(0, length)`
  - `get(0, length + 1)`
  - `get(0, -1)`
  - `get(0, -length - 1)`
  - 非法 x
  - 非整数 y
- 停止坐标覆盖：
  - 使用 `gamemoduleinfo-basic.json` 中的 `logic.getStep(0).getScene(0)` 和 `gameconfig-reels01.json` 中的 `reels01` 做真实匹配测试。
  - `reels.findStopYCandidates(2, scene[2])` 可以返回 `[4, 34]`，用于证明真实数据存在多候选。
  - `getStopYCoordinates({ reelsName: 'reels01', sceneName: 'step0.scene0', scene })` 必须返回 `[1, 1, 4, 0, 27]`，即每轴第一个候选。
  - 对返回的 stop y 逐格验证：`scene[x][visibleY] === reels.get(x, stopYCoordinates[x] + visibleY)`。
  - scene 宽度和 reels 轴数不一致。
  - 某列 visible symbols 找不到匹配。
  - 某列 visible symbols 有多个候选时不能抛错，必须返回第一个候选。
- 起始坐标覆盖：
  - forward：`length=10, finalY=3, speed=8, durationMs=250`，`travel=2`，`startY=1`。
  - backward：同条件 `startY=5`。
  - travel 大于 reel 长度时仍正确 normalize。
  - 非整数 travel 不取整。
  - 非法 duration、speed、finalY 抛错。
- Node 文件加载覆盖：
  - 成功读取 fixture JSON。
  - 文件不存在。
  - 路径不是文件。
  - JSON 语法非法。
  - JSON 语法合法但不符合任务 18 契约。
- 导出边界覆盖：
  - 顶层入口可以在 Node CommonJS 中 require。
  - 顶层入口可以在 Node import 中加载。
  - 顶层入口可以被 Vite/browser bundler 以 named import 使用。
  - `@slotclientengine/logiccore/node` 可以在 Node 中加载。
  - 构建后的顶层入口不包含 `node:fs`、`node:path`、`node:crypto` 等 Node-only import。
  - `loadGameConfigFromJsonFile` 不应从顶层入口导出。

边界错误测试可以额外构造最小内联数据，但这些内联数据只用于制造异常路径，不能替代主 fixture。多匹配测试可使用：

```ts
const reels = [[1, 2, 1, 2]];
const sceneColumn = [1, 2];

// candidates === [0, 2]
// getStopY 必须返回 0
```

## 6. 不允许做的事

- 不要把非法 JSON、非法 symbol code、空 reels、空 reel column 静默转成默认值。
- 不要因为 scene 反查不到坐标就返回 0。
- 不要把 scene 多候选当成错误；本任务明确允许取第一个候选。
- 不要把 `get(x, y)` 的越界 y 当错误；y 越界是该接口要支持的正常输入，但 y 必须是整数。
- 不要在 `get(x, y)` 里把非整数 y 自动 round、floor 或 ceil。
- 不要在旋转起点计算里把非整数 travel 自动 round、floor 或 ceil。
- 不要把 Node 文件系统加载能力直接绑到顶层 browser-safe 入口。
- 不要从 `packages/logiccore/src/index.ts` re-export `loadGameConfigFromJsonFile`。
- 不要让 browser smoke 只验证相对源码路径；必须验证包级导入路径 `@slotclientengine/logiccore`。
- 不要在顶层纯逻辑里引入 `process.env`、`Buffer`、`node:*` 或 DOM 全局对象。
- 不要在 `getStopYCoordinates` 里自动读取或假设 GMI random numbers；实际停留 y 不重要，多候选直接取第一个。
- 不要为了通过真实 fixture 测试而手写 `gameconfig-reels01.json`；必须由 `paytable2.xlsx` 和 `reels01.xlsx` 生成。
- 如果测试暴露出接口设计或测试夹具不合理，先修改测试或夹具，不要为了迎合测试改出不该有的生产语义。

## 7. 验收命令

实现完成后，至少执行以下命令：

```bash
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
pnpm --filter @slotclientengine/logiccore test:exports
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

`test:exports` 至少需要等价覆盖以下检查。具体实现可以写成脚本，避免在命令行里塞太多转义：

```bash
cd packages/logiccore

node -e "const core = require('@slotclientengine/logiccore'); if (typeof core.createGameConfig !== 'function') throw new Error('missing createGameConfig'); if ('loadGameConfigFromJsonFile' in core) throw new Error('node loader leaked from top-level export');"

node --input-type=module -e "const core = await import('@slotclientengine/logiccore'); const api = core.createGameConfig ? core : core.default; if (!api || typeof api.createGameConfig !== 'function') throw new Error('missing createGameConfig from node import');"

node -e "const nodeApi = require('@slotclientengine/logiccore/node'); if (typeof nodeApi.loadGameConfigFromJsonFile !== 'function') throw new Error('missing loadGameConfigFromJsonFile');"
```

browser/Vite smoke 至少需要验证类似下面的真实包名导入可以完成构建：

```ts
import { createGameConfig } from '@slotclientengine/logiccore';

if (typeof createGameConfig !== 'function') {
  throw new Error('missing createGameConfig');
}
```

如果依赖下载或安装失败，先配置代理后再重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

验收后检查是否留下 ignored 构建产物：

```bash
git status --short
git clean -ndX packages/logiccore
```

如果 `packages/logiccore/dist/`、`packages/logiccore/coverage/`、`packages/logiccore/.turbo/` 是本次验收生成的 ignored 产物，任务报告中说明并清理；不要误删用户未确认的非 ignored 文件。

## 8. 任务报告要求

任务完成后新增：

```text
tasks/19-logiccore-gameconfig-reels-[utctime].md
```

`utctime` 用 UTC 时间生成：

```bash
date -u +%y%m%d-%H%M%S
```

报告必须包含：

- 实现摘要。
- 新增和修改文件列表。
- 公开 API 摘要。
- 任务 18 JSON 加载方式。
- 测试数据来源：必须说明 `gameconfig-reels01.json` 是否由 `assets/gamecfg/paytable2.xlsx` 和 `assets/gamecfg/reels01.xlsx` 生成，以及 GMI 是否使用任务 16 的 `gamemoduleinfo-basic.json`。
- 如果修改了 `apps/gengameconfig` 以支持 `reels01.xlsx`，必须说明修改点、测试覆盖和是否更新 `apps/gengameconfig/README.md`。
- 浏览器和 Node 导出方案，包括是否保持单一 CommonJS 构建、是否改成双产物、`package.json exports` 的最终形态。
- `test:exports` 或等价导出 smoke 的执行结果，必须分别说明 browser/Vite、Node require、Node import、Node-only 子入口是否通过。
- reels `get(x, y)` normalize 规则。
- scene 停止坐标定义、多匹配取第一个的规则，以及 `gamemoduleinfo-basic.json` 真实 fixture 的候选列表和最终结果。
- 旋转起始坐标公式。
- 测试用例摘要。
- 实际执行过的验收命令和结果。
- 是否更新 `agents.md`。若未更新，说明原因。
- 是否留下或清理了 ignored 产物。
- 如果某项验收未执行，必须明确写出原因。

## 9. agents.md 更新判断

本任务预计只完善 `packages/logiccore` 的库能力、README、测试和 package export，不改变仓库级协作规则、目录规范或基础脚本，因此预计不需要更新 `agents.md`。

如果实现过程中出现以下情况，必须同步更新 `agents.md`：

- 改变 monorepo 目录规范。
- 改变基础脚本或统一验收命令。
- 引入新的仓库级执行约定。
- 改变新增空目录的处理规则。
