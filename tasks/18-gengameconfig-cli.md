# gengameconfig CLI 初始化任务计划

## 1. 任务目标

新增一个可运行 CLI 应用 `apps/gengameconfig`，用于从 `assets/gamecfg/` 下的 Excel 配置生成游戏运行时可直接读取的完整 JSON 配置。

本计划是可直接执行版本，不依赖额外上下文。执行者只需要阅读本文件，即可完成项目初始化、Excel 解析、JSON 生成、测试、README、验收和任务报告。

核心目标：

- 新增 workspace app：`apps/gengameconfig`。
- 包名使用 `gengameconfig`。
- 输入一个 paytable xlsx 文件和一组 reels xlsx 文件。
- 输出一个 JSON 文件，包含：
  - `paytable`：用 symbol code 作为 key 的 paytable 数据。
  - `symbolCodes`：用 symbol 字符串作为 key、symbol code 作为 value 的映射。
  - `reels`：用 reel 文件名去掉扩展名作为 key 的二维 symbol code 数组。
- 一个游戏只读取一个 paytable。当前实现读取 paytable 工作簿的第一个 worksheet，不做自动扫描兜底。
- 一个游戏可以读取多套 reels。每个 reels 文件独立生成一套二维数组。
- 所有解析逻辑保持 fail-fast：格式不符合、重复 code、重复 symbol、未知 symbol、非整数数字、非法表头、重复 reel key 等都必须抛错，不允许静默跳过、猜测修复或把非法值强转成默认值。
- 新增中文 `apps/gengameconfig/README.md`，说明命令参数、输入表格格式、输出 JSON 结构、错误策略和示例。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `18-gengameconfig-cli-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

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

- 根级基础工具链包含 `typescript`、`vite`、`vitest`、`eslint`、`prettier`、`ts-node`、`turbo`。
- 现有 CLI app `apps/gameclientcli` 使用手写参数解析、CommonJS 输出、`ts-node src/index.ts` 作为 dev 入口，可作为本任务 CLI 结构参考。
- 当前仓库没有现成的 Excel 解析依赖。需要为 `apps/gengameconfig` 新增运行时依赖，建议使用 `xlsx` 读取 `.xlsx`。
- 如果执行 `pnpm install` 或依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

- 当前已有示例输入文件：
  - `assets/gamecfg/paytables.xlsx`
  - `assets/gamecfg/bg-reel01.xlsx`
- `assets/gamecfg/paytables.xlsx` 当前包含 `Sheet1`、`Sheet2`、`Sheet3`。其中 `Sheet1` 是实际 paytable，`Sheet2` 和 `Sheet3` 看起来是空白样式表。本任务明确读取第一个 worksheet，也就是 `Sheet1`；如果第一个 worksheet 表头不符合 paytable 格式，应直接失败，不要自动扫描其它 sheet。
- `assets/gamecfg/bg-reel01.xlsx` 当前包含单个 `Sheet1`，表头是 `line, R1, R2, R3, R4, R5, R6`，数据维度约为 `A1:G321`。
- `bg-reel01.xlsx` 后段存在部分 R 列为空的单元格。这符合“每轴长度可能会不一样”的需求，不能把所有空单元格一概当成错误；但同一 reel 列一旦结束，后面又出现非空 symbol，应视为脏数据并失败。
- 根级协作文件实际路径是 `agents.md`。只有当本任务改变仓库级协作规则、目录规范或基础脚本时，才需要同步更新 `agents.md`。本任务预计只新增一个 app 和 app README，不需要修改 `agents.md`。

## 3. 输出 JSON 数据契约

输出 JSON 必须稳定、可测试、无时间戳字段，避免每次生成内容不同。

推荐输出结构如下：

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
    "bg-reel01": [
      [1, 2, 6, 3],
      [1, 9, 3, 9],
      [1, 11, 2, 6]
    ]
  }
}
```

字段要求：

- `paytable`：
  - 逻辑上使用整数 `code` 作为 key。
  - 由于 JSON object 的 key 最终会序列化为字符串，所以文件中表现为 `"0"`、`"1"`。每个 entry 内仍必须保留数值型 `code` 字段，确保 code 的 int 语义不丢失。
  - 每个 value 包含：
    - `code: number`
    - `symbol: string`
    - `pays: number[]`
  - `pays[0]` 对应表格 `X1`，`pays[1]` 对应 `X2`，以此类推。调用方如果按中奖数量读取，使用 `pays[count - 1]`。
- `symbolCodes`：
  - key 是 paytable 的 `Symbol` 字符串。
  - value 是 paytable 的整数 `Code`。
  - 用于快速把 reels 表中的 symbol 转成 symbol code。
- `reels`：
  - key 是 reels 文件名去掉扩展名，例如 `assets/gamecfg/bg-reel01.xlsx` 对应 `bg-reel01`。
  - value 是 `number[][]`。
  - 第一维是轴编号，也就是表头 `R1...Rn` 的列顺序。
  - 第二维是该轴上的 symbol code 序列。
  - `reels["bg-reel01"][0]` 对应 `R1` 的所有 symbol code。
  - `reels["bg-reel01"][1]` 对应 `R2` 的所有 symbol code。
  - 各轴长度允许不同，不要求规整矩阵。

排序要求：

- `paytable` 按 code 数值升序写入。
- `symbolCodes` 按 paytable 行顺序写入。
- `reels` 按 CLI 参数中 reels 文件出现顺序写入。
- JSON 使用两个空格缩进，并以换行结尾。

## 4. 输入 Excel 格式要求

### 4.1 Paytable 表

只读取工作簿第一个 worksheet。

表头必须从第一行第一列开始，格式如下：

```text
Code    Symbol    X1    X2    X3    ...    Xn
```

解析规则：

- `Code`、`Symbol`、`X1...Xn` 表头需要 trim 后精确匹配。
- `X` 列必须从 `X1` 开始连续递增，不允许 `X1, X3` 这种跳号。
- 必须至少有一个 `X` 列。
- `Code` 必须是非负安全整数，且建议从 0 开始；不强制连续，但不允许重复。
- `Symbol` 必须是非空字符串，不允许重复。
- 每个 `X` 单元格必须是非负安全整数，且不允许为空。
- `Code` 和 `X` 单元格必须来自 Excel 原始数值单元格，且值是非负安全整数；不要使用 Excel 的格式化展示文本作为判定依据。
- 不允许把 `Code` 或 `X` 中的浮点数、小数字符串、布尔值、日期、公式、空字符串自动转换成整数。
- `Symbol` 单元格必须来自 Excel 原始文本单元格，trim 后不能为空；不允许把数字、布尔值、日期、公式自动转换成 symbol。
- 不要把空 pay 值自动补成 0。表里真的是 0 时必须显式写 0。
- 遇到多余的非空尾列、非法表头、非法数据，必须报错并包含文件路径、sheet 名、行列位置。

当前示例 paytable 的关键验收点：

- code `0` 是 `WL`，`pays` 为 `[0, 0, 0, 0, 0, 0]`。
- code `1` 是 `H1`，`pays` 为 `[0, 10, 15, 20, 25, 50]`。
- code `12` 是 `SC`，`pays` 为 `[0, 0, 10, 20, 30, 50]`。
- code `19` 是 `JK`，`pays` 为 `[0, 0, 0, 0, 0, 0]`。
- `symbolCodes.H1 === 1`。
- `symbolCodes.WL === 0`。
- `symbolCodes.JK === 19`。

### 4.2 Reels 表

只读取每个 reels 工作簿第一个 worksheet。

表头必须从第一行第一列开始，格式如下：

```text
line    R1    R2    R3    ...    Rn
```

解析规则：

- `line`、`R1...Rn` 表头需要 trim 后精确匹配。
- `R` 列必须从 `R1` 开始连续递增，不允许 `R1, R3` 这种跳号。
- 必须至少有一个 `R` 列。
- `line` 列必须是从 0 开始的非负安全整数，按行递增。
- `line` 单元格必须来自 Excel 原始数值单元格，且值是非负安全整数；不要使用 Excel 的格式化展示文本作为判定依据。
- 不允许把 `line` 中的浮点数、小数字符串、布尔值、日期、公式、空字符串自动转换成整数。
- 每个非空 `R` 单元格必须来自 Excel 原始文本单元格，trim 后必须是 paytable 中存在的 symbol。
- `R` 单元格中任何非空但不在 paytable `Symbol` 集合里的数据都必须报错，包括拼写错误、数字、布尔值、日期、公式或多余说明文字。
- 生成时要把 symbol 转成 symbol code。
- 每个 `R` 列单独形成一个数组。按行从上到下 push 到对应 reel。
- 允许某个 `R` 列在尾部为空，用于表示该轴比其它轴短。
- 同一个 `R` 列一旦出现尾部空白，后续如果再次出现非空 symbol，必须报错。
- 不允许把未知 symbol 记为 `0` 或其它默认值。
- 不允许把空白 symbol 转成 `WL`、`0` 或其它默认值。
- 不允许自动补齐不同长度的轴。
- reels 文件名去掉扩展名后作为 key；如果多个文件去掉扩展名后 key 相同，必须报错。

当前示例 `bg-reel01.xlsx` 的前 12 行数据转码验收点：

```text
line    R1    R2    R3    R4    R5    R6
0       H1    H1    H1    H2    H1    H1
1       H2    L4    L6    L2    L3    L3
2       L1    H3    H2    L3    L1    L1
3       H3    L4    L1    L2    L6    L6
4       H1    WL    H1    H1    H1    H1
5       H2    L5    H3    L1    L2    L2
6       L2    L1    H5    H2    H5    H5
7       L3    L5    L5    H4    L2    L2
8       H1    H1    H1    H1    H1    H1
9       L3    L3    L5    H2    L3    L3
10      L2    H4    H4    L4    L3    L3
11      L2    H5    H5    H4    L1    L1
```

按 paytable 转码后至少应满足：

- `reels.bg-reel01[0].slice(0, 12)` 等于 `[1, 2, 6, 3, 1, 2, 7, 8, 1, 8, 7, 7]`。
- `reels.bg-reel01[1].slice(0, 12)` 等于 `[1, 9, 3, 9, 0, 10, 6, 10, 1, 8, 4, 5]`。
- `reels.bg-reel01[2].slice(0, 12)` 等于 `[1, 11, 2, 6, 1, 3, 5, 10, 1, 10, 4, 5]`。
- `reels.bg-reel01[3].slice(0, 12)` 等于 `[2, 7, 8, 7, 1, 6, 2, 4, 1, 2, 9, 4]`。
- `reels.bg-reel01[4].slice(0, 12)` 等于 `[1, 8, 6, 11, 1, 7, 5, 7, 1, 8, 8, 6]`。
- `reels.bg-reel01[5].slice(0, 12)` 等于 `[1, 8, 6, 11, 1, 7, 5, 7, 1, 8, 8, 6]`。

## 5. CLI 行为要求

### 5.1 参数设计

采用显式参数，避免 positional 参数在多 reels 场景下歧义：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg/paytables.xlsx \
  --reel assets/gamecfg/bg-reel01.xlsx \
  --out /tmp/slotclientengine-gameconfig.json
```

多 reels 文件时重复传 `--reel`：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg/paytables.xlsx \
  --reel assets/gamecfg/bg-reel01.xlsx \
  --reel assets/gamecfg/fg-reel01.xlsx \
  --out /tmp/slotclientengine-gameconfig.json
```

参数规则：

- 必填：`--paytable <xlsx-file>`。
- 必填：至少一个 `--reel <xlsx-file>`。
- 必填：`--out <json-file>`。
- 支持 pnpm 参数分隔符 `--`。
- `--paytable` 只能出现一次，重复传入必须报错。
- `--out` 只能出现一次，重复传入必须报错。
- 未知参数必须报错。
- 参数缺值必须报错。
- 输入文件不存在必须报错。
- 输入文件扩展名必须是 `.xlsx`，不支持 `.xls` 或 `.csv`。
- 输出文件扩展名必须是 `.json`。
- 所有输入和输出路径按当前执行目录解析；README 中必须说明示例命令默认从仓库根目录运行。
- 输出路径的父目录不存在时可以创建，因为这是明确的输出行为，不属于解析兜底。
- 输出文件已存在时允许覆盖，README 必须说明。

### 5.2 退出和日志

- 成功时写入 JSON，并输出一行摘要，例如：

```text
gengameconfig 生成成功：/tmp/slotclientengine-gameconfig.json
paytable symbols: 20
reels: bg-reel01
```

- 失败时输出明确错误，并设置 `process.exitCode = 1`。
- 错误信息前缀建议为：

```text
gengameconfig 执行失败：
```

- 不要在失败时生成半截 JSON。如果写文件过程中出错，应让命令失败。
- 写输出文件时建议先写入同目录临时文件，再 rename 覆盖目标文件，避免目标 JSON 留下半截内容。

## 6. 建议实现结构

新增以下文件：

```text
apps/gengameconfig/
  package.json
  tsconfig.json
  tsconfig.eslint.json
  vitest.config.ts
  eslint.config.cjs
  README.md
  src/
    index.ts
    cli.ts
    excel.ts
    paytable.ts
    reels.ts
    generator.ts
    types.ts
    errors.ts
  tests/
    cli.test.ts
    paytable.test.ts
    reels.test.ts
    generator.test.ts
```

职责划分：

- `src/index.ts`
  - CLI 入口。
  - 调用 `parseCliArgs(process.argv.slice(2))`。
  - 调用生成函数并写入文件。
  - 捕获错误，输出 `gengameconfig 执行失败：...`。
- `src/cli.ts`
  - 手写参数解析，参考 `apps/gameclientcli/src/cli.ts`。
  - 不引入额外命令行框架。
  - 支持 `--paytable`、重复 `--reel`、`--out`。
- `src/excel.ts`
  - 封装 `xlsx` 读取逻辑。
  - 读取第一个 worksheet。
  - 转成二维 raw cell matrix，保留 Excel 原始单元格类型、原始值和单元格地址。
  - 校验时使用 raw cell value 和 cell type，不使用格式化展示文本。
  - 检测到公式单元格必须报错，即使公式缓存值看起来是合法整数或合法文本。
  - 保留空 cell，用于 reels 尾部空白判断。
  - 对错误补充文件路径、sheet 名、行列信息。
- `src/paytable.ts`
  - 校验 paytable 表头和数据。
  - 生成 `paytable` 与 `symbolCodes`。
- `src/reels.ts`
  - 校验 reels 表头和数据。
  - 按列转成 `number[][]`。
  - 处理各列尾部空白和未知 symbol。
- `src/generator.ts`
  - 组合 paytable 与多 reels。
  - 处理 duplicate reel key。
  - 生成最终 JSON model。
- `src/types.ts`
  - 定义 `PaytableEntry`、`GameConfig`、`CliConfig` 等类型。
- `src/errors.ts`
  - 可选：定义 `ConfigParseError`，用于携带文件、sheet、行、列上下文。
  - 不需要复杂错误层级，重点是报错信息清楚。

`package.json` 建议：

```json
{
  "name": "gengameconfig",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "packageManager": "pnpm@10.0.0",
  "bin": {
    "gengameconfig": "dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "lint": "eslint . --ext .ts,.cjs",
    "test": "vitest run --coverage",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "xlsx": "^0.18.5"
  }
}
```

开发依赖参考 `apps/gameclientcli/package.json` 与根级工具链版本，保持版本一致，不要引入不必要的新工具。

## 7. README 要求

新增 `apps/gengameconfig/README.md`，至少包含：

- 工具用途。
- 安装依赖命令。
- 基本运行示例。
- 多 reels 运行示例。
- paytable xlsx 格式说明。
- reels xlsx 格式说明。
- 输出 JSON 结构说明。
- 输入和输出路径解析规则。
- `paytable` JSON key 是字符串化的 code，但 entry 内 `code` 是 number。
- `pays[0]` 对应 `X1`。
- `reels[name][0]` 对应 `R1`。
- 各轴长度允许不同。
- 错误策略：严格解析、非整数数值失败、未知 symbol 失败、重复 code/symbol 失败、不自动补默认值、不把非法单元格强转成合法值。
- 验证命令。

README 中的示例命令：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg/paytables.xlsx \
  --reel assets/gamecfg/bg-reel01.xlsx \
  --out /tmp/slotclientengine-gameconfig.json
```

## 8. 测试计划

新增 Vitest 测试，覆盖正常路径和 fail-fast 场景。不要为了让测试通过而放宽生产逻辑；如果测试 fixture 与真实需求冲突，应修改测试 fixture。

### 8.1 CLI 参数测试

覆盖：

- 缺少 `--paytable` 报错。
- 缺少 `--reel` 报错。
- 缺少 `--out` 报错。
- `--reel` 可重复传入并按顺序保留。
- 支持 pnpm 参数分隔符 `--`。
- 重复 `--paytable` 报错。
- 重复 `--out` 报错。
- 未知参数报错。
- 参数缺值报错。
- 非 `.xlsx` 输入报错。
- 非 `.json` 输出报错。

### 8.2 Paytable 解析测试

覆盖：

- 使用 `assets/gamecfg/paytables.xlsx` 解析成功。
- code `1` 的 symbol 是 `H1`。
- code `1` 的 `pays` 是 `[0, 10, 15, 20, 25, 50]`。
- `symbolCodes.H1 === 1`。
- `symbolCodes.WL === 0`。
- `paytable` 共 20 个 symbol。
- 重复 code 报错。
- 重复 symbol 报错。
- 缺少 `Code` 或 `Symbol` 表头报错。
- `X` 列不连续报错。
- `Code` 为空、负数、浮点数、小数字符串、布尔值、日期或公式时报错。
- pay 值为空、负数、浮点数、小数字符串、布尔值、日期、公式或非数字时报错。
- `Symbol` 为空、数字、布尔值、日期或公式时报错。
- 数值单元格不能通过格式化文本伪装成整数；例如原始值是 `1.2` 但展示为 `1` 时必须报错。

### 8.3 Reels 解析测试

覆盖：

- 使用 `assets/gamecfg/bg-reel01.xlsx` 解析成功。
- 输出 key 是 `bg-reel01`。
- 输出数组第一维长度是 6，对应 `R1...R6`。
- 前 12 行转码结果符合第 4.2 节验收点。
- 至少覆盖一次不同轴长度场景，证明不会补齐规整矩阵。
- 未知 symbol 报错。
- `R` 单元格中出现任何 paytable 不存在的非空数据时报错。
- `R` 单元格为数字、布尔值、日期或公式时报错。
- `line` 为空、负数、浮点数、小数字符串、布尔值、日期或公式时报错。
- `line` 原始值不是整数但展示文本像整数时必须报错。
- `R` 表头不连续报错。
- 同一列中间空白后又出现 symbol 报错。
- 重复 reel key 报错。

### 8.4 生成器和文件输出测试

覆盖：

- 组合 paytable 和 reels 得到完整 `GameConfig`。
- JSON.stringify 后结构稳定。
- 输出文件写入成功，内容能重新 `JSON.parse`。
- 输出父目录不存在时能创建。
- 覆盖已有输出文件时使用临时文件再 rename 的策略，失败时不留下半截目标 JSON。

覆盖率目标：

- 新 app 测试覆盖率不低于 80%。
- `src/index.ts` 可从 coverage 中排除，因为它只是进程入口。

## 9. 验收命令

执行前如依赖未安装，先执行：

```bash
pnpm install
```

如果依赖下载失败，执行代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

package-local 验收：

```bash
pnpm --filter gengameconfig lint
pnpm --filter gengameconfig test
pnpm --filter gengameconfig typecheck
pnpm --filter gengameconfig build
```

CLI 实跑验收：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg/paytables.xlsx \
  --reel assets/gamecfg/bg-reel01.xlsx \
  --out /tmp/slotclientengine-gameconfig.json
```

构建产物实跑验收：

```bash
pnpm --filter gengameconfig build
node apps/gengameconfig/dist/index.js \
  --paytable assets/gamecfg/paytables.xlsx \
  --reel assets/gamecfg/bg-reel01.xlsx \
  --out /tmp/slotclientengine-gameconfig-build.json
```

输出 JSON 抽查：

```bash
node -e 'const cfg=require("/tmp/slotclientengine-gameconfig.json"); console.log(cfg.paytable["1"].symbol, cfg.paytable["1"].pays.join(","), cfg.symbolCodes.H1, cfg.reels["bg-reel01"].length, cfg.reels["bg-reel01"][0].slice(0,12).join(","));'
```

预期输出包含：

```text
H1 0,10,15,20,25,50 1 6 1,2,6,3,1,2,7,8,1,8,7,7
```

根级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

如测试导致一些奇怪写法，不要改不该改的生产逻辑；应先检查测试 fixture 和断言是否偏离本计划的数据契约。

## 10. 完成报告要求

任务完成后新增中文报告：

```text
tasks/18-gengameconfig-cli-[utctime].md
```

`utctime` 使用 UTC 时间：

```bash
date -u +%y%m%d-%H%M%S
```

报告至少包含：

- 实现摘要。
- 新增和修改的文件列表。
- 最终 JSON 数据结构摘要。
- 实跑命令和输出文件路径。
- package-local 验收结果。
- root 验收结果。
- 是否更新 `agents.md`，以及原因。
- 若某项验收未执行，必须明确说明原因。

## 11. 验收标准

任务可交付必须同时满足：

- `apps/gengameconfig` 已加入 workspace。
- `pnpm install` 后 lockfile 正确更新。
- CLI 可从 `assets/gamecfg/paytables.xlsx` 和 `assets/gamecfg/bg-reel01.xlsx` 生成 JSON。
- 输出 JSON 包含 `paytable`、`symbolCodes`、`reels` 三个顶层字段。
- `paytable["1"].symbol === "H1"`。
- `paytable["1"].pays` 等于 `[0, 10, 15, 20, 25, 50]`。
- `symbolCodes.H1 === 1`。
- `reels["bg-reel01"]` 是 `number[][]`。
- `reels["bg-reel01"].length === 6`。
- `reels["bg-reel01"][0].slice(0, 12)` 等于 `[1, 2, 6, 3, 1, 2, 7, 8, 1, 8, 7, 7]`。
- 不同 reel 轴可以不同长度，输出不补齐。
- 未知 symbol、reels 中 paytable 不存在的非空数据、重复 code、重复 symbol、非法表头、非整数 code、非整数 line、非法 pay 值都能失败并给出明确错误。
- `apps/gengameconfig/README.md` 已说明输入、输出、命令和错误策略。
- 已新增任务报告 `tasks/18-gengameconfig-cli-[utctime].md`。
- 已检查 `agents.md` 是否需要更新；本任务若没有改变仓库协作规则，应在报告中说明无需更新。
- 所有第 9 节验收命令通过，或报告中明确记录未执行原因。
