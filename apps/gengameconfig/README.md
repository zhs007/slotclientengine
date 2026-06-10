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
- `--out <json-file>`：必填，只能出现一次，只支持 `.json`。

输出父目录不存在时会自动创建。输出文件已存在时会覆盖；写入时先写临时文件，再 `rename` 覆盖目标文件，避免留下半截 JSON。

## paytable 格式

只读取 paytable 工作簿的第一个 worksheet，不自动扫描其它 sheet。表头必须从 `A1` 开始：

```text
Code    Symbol    X1    X2    X3    ...    Xn
```

规则：

- `Code`、`Symbol`、`X1...Xn` 表头 trim 后精确匹配。
- `X` 列必须从 `X1` 开始连续递增，且至少有一个 `X` 列。
- `Code` 必须是原始数值单元格中的非负安全整数，不要求连续，不允许重复。
- `Symbol` 必须是原始文本单元格，trim 后非空，不允许重复。
- 每个 `X` 单元格必须是原始数值单元格中的非负安全整数，不允许为空。
- 公式、布尔值、日期、字符串数字、浮点数和空值都会失败。

## reels 格式

只读取每个 reels 工作簿的第一个 worksheet。表头必须从 `A1` 开始：

```text
line    R1    R2    R3    ...    Rn
```

规则：

- `line`、`R1...Rn` 表头 trim 后精确匹配。
- `R` 列必须从 `R1` 开始连续递增，且至少有一个 `R` 列。
- `line` 必须是原始数值单元格中的非负安全整数，从 0 开始逐行递增。
- 每个非空 `R` 单元格必须是原始文本单元格，trim 后必须存在于 paytable 的 `Symbol` 中。
- 每个 `R` 列独立生成一个数组，各轴长度允许不同，不会自动补齐。
- 某个 `R` 列进入尾部空白后，如果后续又出现 symbol，会失败。
- 未知 symbol、数字、布尔值、日期、公式或说明文字都会失败，不会转成 `0`、`WL` 或其它默认值。

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

本工具严格解析并 fail-fast：非法表头、重复 code、重复 symbol、重复 reel key、非整数数值、未知 symbol、公式单元格、路径扩展名不符和缺少必填参数都会直接失败。工具不会猜测修复、不扫描备用 sheet、不静默跳过非法值、不把非法单元格强转为合法值，也不会自动补默认值。

## 验证命令

```bash
pnpm --filter gengameconfig lint
pnpm --filter gengameconfig test
pnpm --filter gengameconfig typecheck
pnpm --filter gengameconfig build
```
