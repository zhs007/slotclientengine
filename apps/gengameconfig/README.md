# gengameconfig

`gengameconfig` 是从 `assets/gamecfg/` 下的 Excel 配置生成游戏运行时 JSON 配置的 CLI。命令默认从仓库根目录运行。使用 `pnpm --filter gengameconfig ...` 时，所有输入和输出路径按发起 pnpm 命令的目录解析。

## 安装依赖

```bash
pnpm install
```

如依赖下载失败，可先设置代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 运行

基本示例：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg/paytables.xlsx \
  --reel assets/gamecfg/bg-reel01.xlsx \
  --out /tmp/slotclientengine-gameconfig.json
```

多套 reels 时重复传入 `--reel`，输出中的 `reels` 会按参数顺序写入：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg/paytables.xlsx \
  --reel assets/gamecfg/bg-reel01.xlsx \
  --reel assets/gamecfg/fg-reel01.xlsx \
  --out /tmp/slotclientengine-gameconfig.json
```

参数：

- `--paytable <xlsx-file>`：必填，只能出现一次，只支持 `.xlsx`。
- `--reel <xlsx-file>`：必填，至少出现一次，可重复，只支持 `.xlsx`。
- `--number-weight <xlsx-file>`：可选、可重复，只支持 `.xlsx`；按参数顺序生成命名权重表。
- `--out <json-file>`：必填，只能出现一次，只支持 `.json`。

输出父目录不存在时会自动创建。输出文件已存在时会覆盖；写入时先写临时文件，再 `rename` 覆盖目标文件，避免留下半截 JSON。

命名数值权重表的 table name 来自 lowercase ASCII kebab-case 文件 stem，并写入可选顶层 `numberWeightTables`。没有 `--number-weight` 时不输出该字段：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --number-weight assets/gamecfg002/bgcoinweight.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

权重工作簿只读第一张 sheet，A1:B1 必须精确为 `val`、`weight`。数据行接受数值单元格或整数文本；value/weight 均须为正安全整数，value 不重复，weight 总和范围为 `1..2^32`。公式、日期、布尔、浮点、空白、中间断行、额外有内容列、非法/重复 stem 都显式失败。

## paytable 格式

只读取 paytable 工作簿的第一个 worksheet，不自动扫描其它 sheet。表头必须从 `A1` 开始：

```text
Code    Symbol    X1    X2    X3    ...    Xn
```

规则：

- `Code`、`Symbol`、`X1...Xn` 表头 trim 后精确匹配。
- `X` 列必须从 `X1` 开始连续递增，且至少有一个 `X` 列。
- `Code` 必须是非负安全整数，不要求连续，不允许重复；可接受数值单元格或内容为整数的文本单元格。
- `Symbol` trim 后必须非空，不允许重复；可接受文本单元格或数值单元格的可见内容。
- 每个 `X` 单元格必须是非负安全整数，不允许为空；可接受数值单元格或内容为整数的文本单元格。
- 公式、布尔值、日期、浮点数、非数字文本和空值都会失败。

## reels 格式

只读取每个 reels 工作簿的第一个 worksheet。表头必须从 `A1` 开始：

```text
line    R1    R2    R3    ...    Rn
```

规则：

- `line`、`R1...Rn` 表头 trim 后精确匹配。
- `R` 列必须从 `R1` 开始连续递增，且至少有一个 `R` 列。
- `line` 列只用于人工阅读；生成器会忽略第二行开始的 `line` 数据，不校验空值、类型或连续性。
- 每个非空 `R` 单元格 trim 后必须存在于 paytable 的 `Symbol` 中；可接受文本单元格或数值单元格的可见内容。
- reels 数据行范围只由 `R1...Rn` 列决定；整行 `R` 列为空会被忽略，不会补 symbol，也不会终止任何一轴。
- 每个 `R` 列独立生成一个数组，各轴长度允许不同，不会自动补齐。
- 某个 `R` 列进入尾部空白后，如果后续又出现 symbol，会失败。
- 未知 symbol、布尔值、日期、公式或说明文字都会失败，不会转成 `0`、`WL` 或其它默认值。

## 输出 JSON

输出稳定、无时间戳字段，使用两个空格缩进并以换行结尾：

```json
{
  "paytable": {
    "1": {
      "code": 1,
      "symbol": "H1",
      "pays": [0, 10, 15, 20, 25, 50]
    }
  },
  "symbolCodes": {
    "H1": 1
  },
  "reels": {
    "bg-reel01": [[1, 2, 6]]
  }
}
```

- `paytable` 逻辑上按整数 `code` 作为 key；JSON object key 会字符串化，所以文件中是 `"1"`。entry 内的 `code` 仍然是 number。
- `pays[0]` 对应 `X1`，调用方可用 `pays[count - 1]` 按中奖数量读取。
- `symbolCodes` 使用 symbol 字符串作为 key、整数 code 作为 value。
- `reels[name]` 的 key 来自 reels 文件名去掉扩展名，例如 `bg-reel01.xlsx` 生成 `bg-reel01`。
- `reels[name][0]` 对应 `R1`，`reels[name][1]` 对应 `R2`。

## 错误策略

本工具按内容严格解析并 fail-fast：非法表头、重复 code、重复 symbol、重复 reel key、非整数内容、未知 symbol、公式单元格、路径扩展名不符和缺少必填参数都会直接失败。工具允许 Excel 把整数或 symbol 内容存成文本/数值两种常见单元格类型，但不会猜测修复、不扫描备用 sheet、不静默跳过非法值，也不会自动补默认值。

## 验证命令

```bash
pnpm --filter gengameconfig lint
pnpm --filter gengameconfig test
pnpm --filter gengameconfig typecheck
pnpm --filter gengameconfig build
```
