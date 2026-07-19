# image string symbol nodes and otherScene preview 任务计划

## 1. 任务目标

本任务完成一条可直接交付给美术、symbol 配置人员和 layout 配置人员的图片数字工作流：

```text
apps/Imgnumbereditor
  编辑 glyph 与排版
  -> 导出 standalone image-string ZIP

apps/symbolseditor
  导入 standalone image-string ZIP
  -> 为一个 symbol 新增一个或多个有唯一 name 的 image-string 节点
  -> 每个节点绑定到该 symbol 某个真实 Spine state 的真实 slot
  -> 为每个命名节点输入任意 string 并实时预览
  -> 导出自包含 symbols ZIP

apps/gamelayouteditor
  导入 symbols ZIP
  -> 从公开本地 reel 生成 scene
  -> 按 symbol 分别选择命名 image-string 节点
  -> 为每个 symbol 选择 game config 数值权重表，或输入固定正整数
  -> 生成与 scene 同尺寸、x 优先的 otherScene
  -> 把对应 otherScene 值写入对应 symbol 的命名节点并预览
```

同时扩展 `apps/gengameconfig` 和 `packages/logiccore` 的通用 game config 合同，把用户已提供的：

```text
assets/gamecfg002/bgcoinweight.xlsx
```

作为命名数值权重表写入：

```text
assets/gamecfg002/gameconfig.json
```

当前工作簿第一张表的实际内容为：

```text
val   weight
1     100
2     75
5     30
10    5
25    5
50    5
100   5
250   5
500   5
1000  5
```

本任务不把 `CN`、`coin`、`bgcoinweight` 或 `bg-gencoins` 写进 shared runtime。`bgcoinweight` 只是当前 game002 配置实例中的表名；命名权重表、命名 image-string 节点、按 symbol 生成 otherScene 和固定值预览都必须支持未来其它 symbol。

本文件是完整实施合同。执行者不得依赖聊天记录、任务 102、任务 103、其它历史任务或口头说明来补齐行为。历史代码可以阅读，但所有必须实现的产品决定、schema、API、错误策略、测试和交付物均以本文件为准。

任务完成后必须新增中文任务报告：

```text
tasks/106-image-string-symbol-nodes-and-otherscene-preview-[utctime].md
```

UTC 时间戳使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/106-image-string-symbol-nodes-and-otherscene-preview-260401-181300.md
```

## 2. 已确定的核心产品决定

### 2.1 `imgnumber` 是编辑器称呼，runtime 继续使用中性的 `image-string`

- `apps/Imgnumbereditor` 的产品名和 UI 可以继续称“图片数字”或 `imgnumber`。
- runtime manifest、TypeScript 类型、资源模块和公共 API 使用 `imageString` / `image-string`，因为输入是 JavaScript `string`，并且 glyph 可以包含小数点、正负号、乘号、货币符号或其它单 Unicode scalar。
- 不新增第二套 `image-number` glyph parser、排版器、Sprite renderer 或 ZIP schema。
- 必须复用现有：

```text
packages/rendercore/src/image-string/**
```

- `RenderSymbol` 的命名节点 setter/getter 输入输出都是 string；不得把 string 转成 number 后再转回来，前导零必须保留。

### 2.2 新能力与旧 game002 CN value presentation 分开

现有旧合同继续保留：

```ts
renderSymbol.setPresentationValue(value: number | null): void;
renderSymbol.getPresentationValue(): number | null;
```

它继续服务当前 game002 `CN.valuePresentation` 的分档 Spine、完整数值图片和 reel occurrence 生命周期。不得删除、改名、自动迁移或改变当前 game002 production 表现。

本任务新增独立、通用的命名 image-string 节点合同：

```ts
renderSymbol.getImageStringNodeNames(): readonly string[];
renderSymbol.setImageStringText(name: string, text: string): void;
renderSymbol.getImageStringText(name: string): string;
```

规则：

- 一个 symbol 可以配置零个、一个或多个 image-string 节点。
- 每个节点在该 symbol 内有唯一 `name`；API 始终通过 name 寻址，不提供“第一个节点”或无 name 的快捷入口。
- `setImageStringText()` 必须先完整验证 text，再原子提交；缺 glyph、控制字符、非 NFC 或节点不存在时显式失败，旧显示不变。
- `getImageStringText()` 返回最后一次成功提交的 string；节点尚未被业务设置时返回 manifest 的显式 `initialText`。
- name 不存在时 setter/getter 都抛出包含 symbol 和 name 的明确错误；不得返回空字符串、null 或静默忽略。
- `getImageStringNodeNames()` 使用 manifest 稳定顺序并返回只读数组。
- 旧 `valuePresentation` 不伪装成命名 image-string 节点，不占用 name，也不通过新的 string API 访问。
- 当前 game002 CN 只要求继续兼容旧 API；本任务不把 `assets/game002-s3/symbol-state-textures.manifest.json` 的 CN 自动迁移到新节点，也不让两个数字系统在同一 slot 重叠。

### 2.3 命名节点只绑定真实 Spine state 和真实 slot

每个新节点必须显式选择：

1. 当前 symbol 的一个 state；
2. 该 state manifest 中 `kind: "spine"` 的 skeleton；
3. 该 skeleton 真实存在、大小写精确的 slot。

第一版一个节点只绑定一个 target state 和一个 slot。示意：

```json
{
  "name": "coin-value",
  "resource": "./dependencies/image-strings/coin-digits/image-string.manifest.json",
  "target": {
    "state": "normal",
    "slot": "Num"
  },
  "initialText": "",
  "anchor": { "x": 0.5, "y": 0.5 },
  "transform": { "x": 0, "y": 0, "scale": 1 },
  "followSlotColor": true
}
```

严格行为：

- target state 必须在该 symbol 上存在且实际解析为 manifest `kind: "spine"`；image、layered image、VNI、builtin、static、empty 和 `activeSpine` 都不能作为新节点 target。
- target slot 必须存在于 target state 的 skeleton 中；symbol package 创建、symbolseditor preview/export 和 production resource prepare 都必须在显示前校验。
- 节点只在 target state 的 Spine player 当前可见时挂到 slot；切到其它 state 时从 player 移除或隐藏，但保存 text。
- 返回 target state 时使用保存的 text 重新挂载，不重建 glyph layout，不重播等价 Spine Loop。
- Spine player 异步 init 早到或晚到都不能把节点挂到已经失效的 state/player；使用 request generation 或等价竞态保护。
- 同一 skeleton/atlas/texture 的 normal/win 等价 playback 继续复用现有 player 与时间轴；节点 attach/detach 不得破坏 continuity key、reset player 或重播 Loop。
- `transform` 作用于 slot object 内部：先由 Spine slot/bone 驱动，再应用节点自身 x/y/scale；`anchor` 继续使用 image-string logical bounds。
- `scale` 必须是有限正数；x/y 是有限数；anchor x/y 必须沿用 image-string 公共 anchor 校验。
- `followSlotColor` 是显式 boolean，不设置隐式 fallback。
- target state 当前被显式 reel state texture 覆盖时，遵守现有 texture 优先级，命名节点不穿透显示。
- app/editor 不得拿到 official Spine player、Spine track、slot object 私有节点或 Pixi glyph children。

### 2.4 Manifest 使用可选 `imageStringNodes`

symbol manifest v1 的单 symbol entry 新增可选：

```ts
interface SymbolImageStringNodeSpec {
  readonly name: string;
  readonly resource: string;
  readonly target: {
    readonly state: string;
    readonly slot: string;
  };
  readonly initialText: string;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly transform: {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
  };
  readonly followSlotColor: boolean;
}

interface ParsedSymbolManifestSymbol {
  // 现有字段保持不变
  readonly imageStringNodes: readonly SymbolImageStringNodeSpec[];
}
```

JSON 字段固定为数组：

```json
"imageStringNodes": [
  {
    "name": "coin-value",
    "resource": "./dependencies/image-strings/coin-digits/image-string.manifest.json",
    "target": { "state": "normal", "slot": "Num" },
    "initialText": "001",
    "anchor": { "x": 0.5, "y": 0.5 },
    "transform": { "x": 0, "y": 0, "scale": 1 },
    "followSlotColor": true
  }
]
```

schema 规则：

- 字段缺省表示无节点；parser 归一为冻结空数组。
- 数组顺序是 API、UI 和 ZIP round-trip 的稳定顺序。
- name 必须是 lowercase ASCII kebab-case，symbol 内唯一。
- `resource` 是相对于 symbol manifest 的 canonical local path，必须指向 `image-string.manifest.json`；不得是 URL、data URL、目录或 glob。
- 同一 image-string resource 可被同一 symbol 的多个节点或多个 symbol 共享；runtime 共享解码纹理，不复制 glyph bytes。
- 所有对象严格拒绝未知字段；不要为了兼容拼写错误保留 alias。
- `initialText` 必须通过对应 image-string manifest 的完整 text 校验；空字符串有效。
- target state/slot、资源类型、glyph 闭包和真实图片尺寸需要读取资源后才能验证，必须在 package/resource prepare 阶段完成，不能只做浅层 JSON 校验。
- 保持 symbol manifest `version: 1`，因为是可选向后兼容字段；旧 manifest 解析结果不变，旧 symbol package 继续可用。

### 2.5 Standalone ZIP 原样 vendor 到 symbols ZIP

Imgnumbereditor 当前 standalone ZIP 根合同保持不变：

```text
<id>-image-string.zip
  image-string.manifest.json
  assets/**
```

symbolseditor 导入后 vendor 到：

```text
dependencies/image-strings/<id>/image-string.manifest.json
dependencies/image-strings/<id>/assets/**
```

规则：

- `<id>` 来自 standalone manifest，不从 ZIP 文件名猜。
- dependency manifest 与 glyph bytes 原样复制；不得改 glyph key、尺寸、offset、fixed group 或图片编码。
- symbol manifest 只引用 vendored manifest path，不复制 glyph map。
- symbols package `resources[]` 必须精确包含所有被已导出 symbol 引用的 dependency manifest 和 glyph 闭包，按 canonical path 排序。
- 未被任何 included symbol 节点引用的 editor dependency 不进入 production symbols ZIP。
- `symbols.package.json` schema 和 version 保持 v1；其现有 `resources[]` 已能声明这些精确文件。
- symbols ZIP 必须自包含；运行时不得再寻找用户电脑上的 standalone ZIP。
- package import 后必须能从 vendored 路径重建 logical image-string dependencies 和节点配置，再次导出字节/语义等价。
- 相同 id、相同内容可以去重；相同 id、不同 manifest 或 glyph bytes 必须显式冲突。替换必须是明确、原子的 dependency replace 操作。
- ZIP 缺 manifest、缺 glyph、多余文件、非法 path、case/NFC collision、尺寸漂移或 orphan 都立即失败，不增加 fallback。

### 2.6 game config 新增通用命名数值权重表

`apps/gengameconfig` 新增可重复 CLI 参数：

```text
--number-weight <xlsx-file>
```

输出新增可选顶层字段：

```ts
interface NumberWeightEntry {
  readonly value: number;
  readonly weight: number;
}

interface GameConfig {
  readonly paytable: ...;
  readonly symbolCodes: ...;
  readonly reels: ...;
  readonly numberWeightTables?: Readonly<
    Record<string, readonly NumberWeightEntry[]>
  >;
}
```

game002 当前输出实例：

```json
"numberWeightTables": {
  "bgcoinweight": [
    { "value": 1, "weight": 100 },
    { "value": 2, "weight": 75 },
    { "value": 5, "weight": 30 },
    { "value": 10, "weight": 5 },
    { "value": 25, "weight": 5 },
    { "value": 50, "weight": 5 },
    { "value": 100, "weight": 5 },
    { "value": 250, "weight": 5 },
    { "value": 500, "weight": 5 },
    { "value": 1000, "weight": 5 }
  ]
}
```

这不是单表专用字段。后续可同时生成：

```json
"numberWeightTables": {
  "bgcoinweight": [
    { "value": 1, "weight": 100 }
  ],
  "bonus-multiplier-weight": [
    { "value": 2, "weight": 80 },
    { "value": 3, "weight": 20 }
  ]
}
```

每张工作簿形成一个独立命名表；不同 symbol 在 gamelayouteditor 中可以选择不同表。不得增加单一 `coinWeightTable`、全局 active table 或把第一张表当默认表。

工作簿合同：

- 只读取第一个 worksheet，表头从 A1 开始并 trim 后大小写精确为 `val`、`weight`，不扫描备用 sheet。
- 从第 2 行开始，每一行两格都必须有值；完整空行只允许出现在数据尾部，尾部空行后再次出现数据要失败。
- `val` 接受数值单元格或整数文本，归一为 positive safe integer；0 被 otherScene 保留为“该格无值”，因此表内 value 不允许 0。
- `weight` 接受数值单元格或整数文本，归一为 positive safe integer；不允许 0 权重。
- value 不允许重复；行顺序保持工作簿顺序。
- 公式、日期、布尔值、浮点、负数、空格字符串、非数字文本、额外有内容的列和中间断行都失败。
- 每张表的 weight 总和必须是 `1..2^32` 的安全整数，以便使用现有 uint32 随机源做无 modulo bias 的精确采样；超界显式失败。
- table name 来自文件 stem，必须是 lowercase ASCII kebab-case；不同输入不能产生重复或大小写碰撞 name。
- 没有 `--number-weight` 时不输出空的 `numberWeightTables`，确保现有 game003 等生成结果保持不变。
- 多个参数按 CLI 顺序稳定写入 table object。

game002 必须使用生成器重建，不手改 JSON：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --number-weight assets/gamecfg002/bgcoinweight.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

### 2.7 logiccore 提供只读权重表 API

`packages/logiccore` 负责解析和冻结通用 config 数据，gamelayouteditor 不得直接读取：

```ts
(resource.rawGameConfig as any).numberWeightTables;
```

`LogicGameConfig` 新增窄 API：

```ts
interface GameConfigNumberWeightEntry {
  readonly value: number;
  readonly weight: number;
}

getNumberWeightTableNames(): readonly string[];
getNumberWeightTable(name: string): readonly GameConfigNumberWeightEntry[];
```

规则：

- 缺 `numberWeightTables` 解析为冻结空集合；旧 config 继续通过。
- parser 重复执行第 2.6 节的 runtime JSON 校验，不盲信生成器。
- names 保持 config object 插入顺序；entries 保持数组顺序并递归冻结。
- name 不存在时 `getNumberWeightTable()` 抛 `RangeError`，不返回空数组。
- `getRawConfig()` 继续返回完整 clone/freeze 数据。
- logiccore 只提供数据访问，不知道 symbol、otherScene、CN 或 UI，也不负责浏览器随机采样。

### 2.8 gamelayouteditor 按 symbol 配置 otherScene source

Symbols 预览 drawer 新增 session-only mapping：

```ts
interface SymbolOtherScenePreviewBinding {
  readonly symbol: string;
  readonly target:
    | { readonly kind: "image-string-node"; readonly name: string }
    | { readonly kind: "legacy-presentation-value" };
  readonly source:
    | { readonly kind: "number-weight-table"; readonly tableName: string }
    | { readonly kind: "fixed-number"; readonly value: number };
}
```

其中 `legacy-presentation-value` 只是当前旧 CN/valuePresentation 的最小兼容预览通道：

- 新配置默认只列出 `imageStringNodes` 的 name。
- 当 symbol 没有命名节点但仍声明旧 `valuePresentation` 时，UI 可以列出只读标识的 legacy target，并继续调用现有 `setPresentationValue(number)`。
- 不在 symbolseditor 新节点 schema 中把 legacy valuePresentation 转成命名节点。
- 不给 legacy target 增加 string、前导零或多节点语义。

mapping 规则：

- mapping key 是 symbol code 对应的 symbol 字符串，不是“coin”布尔开关，也不是全局唯一数字源。
- 同一 symbol v1 最多一个 otherScene mapping；未来若同一格需要多个独立服务端矩阵，应另立协议/组件任务，不能把多个值塞进一个矩阵单元。
- 不同 symbol 可以各自选择不同 target 和不同 table/fixed value。
- `image-string-node` target name 必须真实存在于该 symbol；legacy target 必须真实存在旧 valuePresentation。
- table 候选只来自导入 symbol package 的 `LogicGameConfig.getNumberWeightTableNames()`。
- fixed number 必须是 positive safe integer。
- mapping、drawer 展开状态、当前 otherScene 和随机结果只属于 editor session，不写入 scene-layout manifest/layout ZIP，也不写回 symbols ZIP。
- 清除 symbol package、导入新 package、project replace 或 app destroy 时清理不再有效的 mapping 和 otherScene。

### 2.9 otherScene 生成和采样规则

对当前 sampled scene：

```ts
scene.symbols[x][y];
```

生成：

```ts
otherScene[x][y];
```

规则固定为：

1. 矩阵宽高与当前 scene 完全一致，保持 x 优先。
2. 该格 symbol 没有 mapping 时值为 `0`。
3. source 为 fixed number 时写入该正整数。
4. source 为 weight table 时，每个匹配 occurrence 独立按表权重抽取一个 value。
5. 把数值写入视觉时，新节点调用 `setImageStringText(name, String(value))`；legacy target 调用 `setPresentationValue(value)`。
6. 新节点未 mapping 时保持自身 `initialText`；legacy valuePresentation 未 mapping 时保持当前既有 `defaultValues[0]` 预览行为，避免本任务破坏旧 package 预览。

随机要求：

- production 浏览器使用现有 Web Crypto `getRandomValues()` uint32 source，不使用 `Math.random()`。
- 使用 rejection sampling 先在 `[0,totalWeight)` 得到无 modulo bias 的整数，再按 row order cumulative weight 选值。
- random source 可注入，测试必须覆盖边界、拒绝区、不同 symbol 和每格独立采样。
- resize、variant 切换、zoom、guide 开关和普通 re-render 保持当前 sampled scene 与 otherScene，不重新抽取。
- 点击“重新随机”同时重采 reel stops 并为新 scene 重新生成 otherScene。
- 修改 mapping/source 时只针对当前 scene 重新生成 otherScene，不改变 stops。
- diagnostics 显示 package、reel、stops、mapping 摘要和 otherScene；大矩阵使用紧凑行/列格式，不能把 UI 撑爆。
- 权重表不存在、总权重非法、random source 非 uint32、mapped target 缺失、fixed value 非法或写入 text 缺 glyph 时整次 otherScene 更新失败；保留上一份有效 scene/otherScene/视觉，不提交半张矩阵。

## 3. 当前仓库基线与保护

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

制定本计划时：

```text
date: 2026-07-19
branch: main
HEAD: 7e789e374c0b3639f09bd9a78c3b95e9e5372abb
Node.js: v24.14.0（Codex bundled runtime）
pnpm runner: 11.9.0
repo packageManager: pnpm@10.0.0
repo engines: Node >=24.0.0, pnpm >=10.0.0
working tree:
?? assets/gamecfg002/bgcoinweight.xlsx
```

`assets/gamecfg002/bgcoinweight.xlsx` 是用户新增的权威输入，必须保留并纳入任务交付。不得删除、重命名、重写格式或用测试 fixture 覆盖。

执行开始和结束必须重新记录：

```bash
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --stat
node --version
pnpm --version
```

全部已有修改和未跟踪文件都属于用户。禁止：

- `git reset --hard`；
- `git checkout --`；
- `git clean`；
- 自动 stash；
- 覆盖任务外美术；
- 对全仓库做无关格式化；
- 手改 generated 文件来绕过生成器。

依赖下载真实失败时才设置代理并重试原命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

不要预先永久写入 shell 配置，不要把代理地址写进 package scripts 或源码。

如果测试因为旧断言、mock 私有实现、依赖调用次数或过度 snapshot 而逼迫 production 出现奇怪分支，应修改测试以匹配本计划的公开合同；不得为了通过测试加入 fallback、复制算法、暴露 Spine/Pixi 私有对象或放宽 parser。

## 4. 已确认的现有实现事实

### 4.1 image-string runtime 与 standalone editor 已存在

现有关键文件：

```text
packages/rendercore/src/image-string/types.ts
packages/rendercore/src/image-string/manifest.ts
packages/rendercore/src/image-string/resource.ts
packages/rendercore/src/image-string/layout.ts
packages/rendercore/src/image-string/render-image-string.ts
apps/Imgnumbereditor/src/**
docs/image-string-manifest.md
```

当前已具备：

- strict `image-string.manifest.json` parser；
- 精确 glyph asset closure；
- PNG/WebP 解码与尺寸校验；
- natural/fixed advance、Unicode code point layout；
- Pixi Sprite pool；
- 原子 `setText()`、anchor、snapshot、destroy；
- standalone ZIP 严格导入导出。

本任务在这些能力之上做 symbol attachment 和 consumer vendoring，不重复实现 glyph 排版。

### 4.2 symbol runtime 已有官方 Spine slot attach 基础

现有关键文件：

```text
packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/package.ts
packages/rendercore/src/symbol-value-presentation/**
```

`RendercoreSpineSlotPlayer` 已有：

```ts
attachSlotObject(...)
removeSlotObject(...)
```

现有 valuePresentation 已证明 slot object 可以继承 slot/bone 动画。新节点应抽象通用 attach 生命周期，但不能破坏旧 value controller。

### 4.3 symbolseditor 当前只有扁平资源库和旧 value editor

现有关键文件：

```text
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/model/editor-store.ts
apps/symbolseditor/src/io/symbol-package-zip.ts
apps/symbolseditor/src/preview/symbol-preview.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/ui/resource-picker.ts
apps/symbolseditor/src/ui/ui-session.ts
```

当前 generic upload 不会把 standalone image-string ZIP 建成 logical dependency；symbol draft 也没有命名节点。本任务必须增加 dedicated import/replace/remove 与节点 Inspector，而不是把 ZIP 当普通 JSON/PNG 批次让用户手工拼路径。

### 4.4 gamelayouteditor 已有严格 symbols ZIP 和随机公开轮带预览

现有关键文件：

```text
apps/gamelayouteditor/src/io/imported-symbol-package.ts
apps/gamelayouteditor/src/preview/random-reel-scene.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/app-shell.ts
```

当前已经：

- 严格导入 symbol-package v1；
- 读取公开 local reel；
- Web Crypto 随机 stop；
- 按真实 cell geometry 创建 `RenderSymbol`；
- 对旧 valuePresentation 使用 `defaultValues[0]`；
- symbols package 只用于 preview，不进入 layout ZIP。

本任务在 sampled scene 上增加 session-only otherScene 和 per-symbol values，不改 scene-layout production schema。

### 4.5 gengameconfig 与 logiccore 当前没有权重表 API

`apps/gengameconfig` 当前只接收 `--paytable`、重复 `--reel` 和 `--out`，输出 `paytable/symbolCodes/reels`。

`packages/logiccore` 当前会 clone/freeze raw config，但 public API 只暴露 paytable、symbol code 和 reels。gamelayouteditor 不应通过 raw object 自行发明第四套 parser，因此本任务需要同时扩展 generator 和 logiccore。

## 5. Ownership 与依赖边界

```text
packages/rendercore/image-string
  glyph manifest/parser/resource/layout/Pixi lifecycle

packages/rendercore/symbol
  symbol manifest imageStringNodes schema
  nested image-string exact resource closure
  named node controller
  RenderSymbol string API
  official Spine slot attach/detach integration
  symbol package resource prepare/destroy

apps/Imgnumbereditor
  standalone image-string ZIP authoring
  本任务原则上不改 schema，只做回归验证和必要文档澄清

apps/symbolseditor
  image-string logical dependency library
  standalone ZIP import/replace/remove
  node name/resource/state/slot/transform Inspector
  manual string preview
  symbols ZIP vendoring/round-trip

apps/gengameconfig
  number-weight xlsx parser
  CLI 参数和稳定 JSON 生成

packages/logiccore
  numberWeightTables runtime JSON parser/freeze/public query API

apps/gamelayouteditor
  per-symbol preview mapping UI/session
  weighted/fixed sampling
  otherScene matrix generation
  调用 RenderSymbol public setter
```

禁止边界：

- rendercore 不认识 CN、coin、bgcoinweight、bg-gencoins、otherScene component 名或 game002。
- logiccore 不绑定 table 到 symbol，不做 editor UI 或随机采样。
- gengameconfig 不读取 symbol manifest，不把表名和 CN 绑定。
- symbolseditor/gamelayouteditor 不复制 glyph layout、Pixi children、Spine player、atlas/skeleton parser。
- gamelayouteditor 不解析 raw `numberWeightTables`，只用 logiccore API。
- game002 app 不新增一份相同权重表或阈值表；本任务只更新生成的 config，不改变 live server otherScene 语义。

本任务原则上不新增第三方依赖；现有 `xlsx`、browserartifactio、rendercore、logiccore、Pixi 和 official Spine 能力足够。若执行者发现确实必须新增依赖，先证明现有能力不足，并在任务报告中记录原因、版本和 lockfile 变化。

## 6. 实施阶段

### 阶段 A：扩展 gengameconfig 与生成 game002 config

主要文件：

```text
apps/gengameconfig/src/types.ts
apps/gengameconfig/src/cli.ts
apps/gengameconfig/src/generator.ts
apps/gengameconfig/src/excel.ts
apps/gengameconfig/src/number-weight.ts              # 建议新增
apps/gengameconfig/tests/**
apps/gengameconfig/README.md
assets/gamecfg002/bgcoinweight.xlsx
assets/gamecfg002/gameconfig.json
```

实施项：

1. 增加 `NumberWeightEntry/NumberWeightTable` 类型和 `CliConfig.numberWeightPaths`。
2. `parseCliArgs()` 支持可重复 `--number-weight`，检查 `.xlsx`，保持参数顺序。
3. 新 parser 只读第一 worksheet，严格实现第 2.6 节表头、类型、断行、重复、权重总和和 table name 规则。
4. `buildGameConfig()` 接受表路径并在非空时输出 `numberWeightTables`。
5. `generateGameConfigFile()` 检查全部 table 输入文件存在。
6. 无 table 时现有 generator snapshot/JSON 顺序保持不变。
7. 用测试 fixture workbook 覆盖合法数字/文本整数、重复 value、0/负数/浮点、公式/日期/布尔、额外列、中间空行、总权重越界、重复 stem、非法 stem。
8. 增加至少两张合法 `--number-weight` 同时生成的测试，验证 CLI 顺序、两个 name/entries 都保留；再覆盖相同 stem 和大小写碰撞显式失败。
9. 测试 fixture 使用 tests 自己生成或持有的小型工作簿，不修改用户的 production xlsx。
10. 使用本计划命令生成 `assets/gamecfg002/gameconfig.json`；不得手工插 JSON。
11. 验证生成表恰好有 10 行，值/权重与本计划第 1 节一致，paytable/reels 与生成前一致。

### 阶段 B：扩展 logiccore game config

主要文件：

```text
packages/logiccore/src/types.ts
packages/logiccore/src/game-config.ts
packages/logiccore/src/index.ts
packages/logiccore/tests/game-config.test.ts
packages/logiccore/README.md
```

实施项：

1. 为 parsed data 增加冻结的 `numberWeightTables` 和 table names。
2. 缺字段时返回空 names；字段存在时严格拒绝 object/array/entry 漂移和未知 entry 字段。
3. 实现 `getNumberWeightTableNames()` / `getNumberWeightTable(name)`。
4. 复验 positive safe integer、value unique、weight sum `<= 2^32`、非空 table 和 name 格式。
5. 验证 raw config 深冻结仍包含新字段。
6. 增加旧 fixture 无字段兼容、新字段合法、多表顺序、bad name、bad entry、duplicate、sum overflow、missing table RangeError 测试。
7. 不改变 paytable/reels API 和 node loader 行为。

### 阶段 C：rendercore manifest、resource closure 与 named node runtime

建议新增目录：

```text
packages/rendercore/src/symbol-image-string/
  types.ts
  resources.ts
  controller.ts
  index.ts
```

也可按当前仓库风格放入 `src/symbol/`，但职责必须清晰。主要修改：

```text
packages/rendercore/src/image-string/resource.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/package.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/standalone-catalog.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/src/index.ts
packages/rendercore/tests/symbol/**
packages/rendercore/tests/image-string/**
```

实施项：

1. 增加 `SymbolImageStringNodeSpec` 与 strict parser，遵守第 2.4 节。
2. `collectSymbolManifestResourcePaths()` 读取每个 node 的 nested image-string manifest，并把 manifest 与相对 glyph 闭包解析到 symbol package canonical paths。
3. nested manifest 缺 files/modules 时显式说明无法派生闭包；不得只收 manifest 丢 glyph，也不得用宽泛 glob。
4. 增加可从已解析 manifest + 已加载 Texture map 创建非 owning/shared `ImageStringResource` 的窄能力，使 symbol package 统一拥有 Object URL/cache，node/resource 不重复 unload 同一 Texture。
5. package module classifier 明确区分 image-string manifest、Spine skeleton、VNI project 和普通 JSON，不能把 image-string JSON 当 skeleton。
6. symbol package prepare 时一次解析、解码、尺寸核对全部被引用 dependency；相同 manifest path 共享 resource。
7. 建立 per-RenderSymbol named node controller；初始化所有 node 的 renderer 与 initialText，但只在目标 state player ready/active 时 attach。
8. 通过 rendercore 内部 hook 把 official Spine slot player 生命周期通知 controller；hook 不导出给 app。
9. async init、state switch、equivalent timeline、destroy、pool release 都使用 generation/ownership 保护，不能产生 stale attach、重复 child、空格或泄漏。
10. `RenderSymbol` 实现三个 string API，并把 controller 纳入 reset/pool/destroy。
11. catalog/package factory 自动注入对应 symbol 的 named node resources；consumer 不需要手工拼 factory。
12. 旧不含节点的 catalog 路径必须零行为变化；旧 value controller 可与 named controller 共存于不同 slot，但同一 slot 的冲突必须在 prepare 时显式失败，不能用 z-order 猜结果。
13. 如果一个 symbol 同时配置 legacy valuePresentation text slot 和 named node 相同 target slot，parser/resource prepare 报冲突。当前 game002 CN 无新节点，因此不受影响。
14. root/subpath exports、README 和 manifest 文档补齐。

重点测试：

- parser：缺省、完整、多节点、重复 name、未知字段、非法 path/state/slot/transform/anchor/name。
- closure：共享 dependency、nested path、缺 manifest、缺 glyph、orphan、case collision、尺寸漂移。
- runtime：initialText、前导零、setter/getter、missing name、missing glyph 原子失败、多 name 隔离。
- Spine：目标 state attach、离开 state detach、返回恢复、真实 slot 缺失、异步晚到、destroy 前晚到、texture override、等价 Loop 不 replay。
- pool：release 后回 initialText 或按明确合同清空；本任务固定为回 manifest initialText，避免上一次 occurrence 的文本泄漏到新 occurrence。
- compatibility：旧 valuePresentation tests 全部继续通过。

### 阶段 D：symbolseditor dependency、节点配置、预览和 ZIP

主要文件：

```text
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/model/editor-store.ts
apps/symbolseditor/src/io/symbol-package-zip.ts
apps/symbolseditor/src/io/image-string-dependency.ts      # 建议新增
apps/symbolseditor/src/preview/symbol-preview.ts
apps/symbolseditor/src/ui/ui-session.ts
apps/symbolseditor/src/ui/resource-picker.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/**
apps/symbolseditor/README.md
```

Editor model 至少增加：

```ts
interface EditorImageStringDependency {
  readonly id: string;
  readonly manifest: ImageStringManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>; // standalone-relative
  readonly fingerprint: string;
}

interface EditorSymbolDraft {
  // 现有字段
  imageStringNodes: SymbolImageStringNodeSpec[];
}
```

实施项：

1. 在资源工作区增加“导入 Imgnumber ZIP”专用入口；使用 browserartifactio bounded ZIP 和 rendercore standalone validator。
2. dependency 是 logical resource，不把其每个 glyph 当成十几条需要用户手工绑定的普通 asset row。
3. dependency 行显示 id、glyph 数、lineHeight、fixed groups、引用 symbol/node、replace/remove；被引用时删除失败。
4. import/replace 原子化；相同 id/content 去重，相同 id/different content 冲突。
5. Symbols Inspector 新增 `ImgNumber` 或 `Image string` tab；旧 `Value presentation` tab 保留为兼容配置。
6. 新 tab 支持 add/remove/reorder node，编辑 name、dependency、target state、slot、initialText、anchor、x/y/scale、followSlotColor。
7. target state 候选只列当前 symbol 实际 `kind: spine` states；slot 候选从该 state skeleton metadata 读取真实 exact names。
8. 切换 target state 后若旧 slot 不存在，清空并要求显式重选，不自动选第一个 slot。
9. resource picker 只列 ready image-string logical dependencies，不列普通 JSON 或散 PNG。
10. 每个 node 提供独立 string 预览输入，session key 至少包含 symbol + node name；输入不写回 manifest `initialText`，除非用户明确编辑 initialText 字段。
11. preview 通过 `RenderSymbol.setImageStringText(name,text)`，不直接改 glyph sprite/slot。
12. preview 切 state/replay/resize 保留用户输入；切到非 target state时节点隐藏，返回后恢复。
13. 输入缺 glyph 时显示具体错误并保留上一次有效值。
14. compile manifest 输出 `imageStringNodes` 稳定数组，local resource path 指向固定 vendor 目录。
15. asset reference/deletion/resource status/diagnostics/export closure 全部包含 dependency。
16. export 只 vendor included symbols 实际引用的 dependencies；使用 rendercore `collectSymbolManifestResourcePaths()` 派生，不写第二份闭包算法。
17. import symbols ZIP 后恢复 dependency、节点顺序和配置；strict round-trip 再导出可被 rendercore package loader 创建并预览。
18. UI 可访问性、Picker cancel/focus、async import stale request 和 app destroy 清理延续现有工作区合同。

### 阶段 E：gamelayouteditor otherScene 配置与预览

建议新增：

```text
apps/gamelayouteditor/src/preview/number-weight-table.ts
apps/gamelayouteditor/src/preview/other-scene-preview.ts
```

主要修改：

```text
apps/gamelayouteditor/src/preview/random-reel-scene.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/ui-session.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/**
apps/gamelayouteditor/README.md
```

实施项：

1. SymbolPackagePreviewSnapshot 增加 available targets、table names、bindings 和 frozen otherScene snapshot；不要暴露 raw config。
2. drawer 中增加“数值/otherScene”区，按 package display symbol code 稳定列出可配置 symbol。
3. 每行明确选择 symbol、target node name、source kind、table 或 fixed value；不要用全局 coin checkbox。
4. 已有 mapping 的 symbol 不可重复添加；删除 mapping 后该 symbol 当前 preview 恢复 initialText/legacy default。
5. 新节点 target 候选来自 parsed manifest `imageStringNodes`；legacy 只在无新节点且有旧 valuePresentation 时作为兼容候选。
6. table 候选来自 logiccore public API；无 table 时 table source disabled 并说明 config 未声明表。
7. 实现无 modulo bias weighted sample，复用/扩展现有 injectable uint32 source。
8. 实现纯函数 `createOtherScenePreview(...)`，输入 scene、bindings、tables、random source，输出冻结 x-major matrix 和 per-cell assignment；先完整计算/验证再提交。
9. LayoutPreview 在创建所有 RenderSymbol 后应用 assignment；新节点调用 string API，legacy 调用旧 number API。
10. 如果任何 setter 失败，销毁本次临时 RenderSymbols 并保留上一份有效 overlay/snapshot；不得留下半板新值。必要时先在 detached container 构建完成再 swap。
11. “重新随机”同时重采 scene 和 otherScene；source 修改只重采 otherScene；普通 layout refresh 不重采。
12. layout cell size、reel compatibility、renderPriority、scene/stops 和 layout ZIP 行为保持不变。
13. diagnostics 显示 otherScene，例如按 y 行输出每格数值，同时标出每个 symbol -> target -> source。
14. package clear/import race/project replace/destroy 清理 mapping、matrix 和旧 RenderSymbol。

重点测试：

- weighted sampler 0、累计边界、最后一项、uint32 reject、非法 sum/source。
- fixed source、一个 table、多个 symbol 各自 table、同 symbol 重复 mapping、未映射格为 0。
- matrix x-major 尺寸和 sampled scene 对齐。
- new node `String(value)`、legacy number compatibility、缺 glyph 原子失败。
- resize/zoom/variant 不重采，randomize 重采，mapping change 不改 stops。
- stale async import 与 clear/destroy。
- production `gamecfg002` 能看到 `bgcoinweight`；`gamecfg003` 无表仍可正常随机 scene。

### 阶段 F：文档、agents.md 和兼容边界

必须更新：

```text
docs/image-string-manifest.md
packages/rendercore/README.md
packages/logiccore/README.md
apps/Imgnumbereditor/README.md              # 只澄清 consumer 工作流即可
apps/symbolseditor/README.md
apps/gamelayouteditor/README.md
apps/gengameconfig/README.md
agents.md
```

`agents.md` 需要补充长期 ownership，至少明确：

- rendercore 拥有命名 image-string symbol node、string API、nested closure、Spine slot attach 生命周期。
- symbolseditor 只拥有 dependency/UI/manifest draft/ZIP vendoring，不复制 runtime。
- gengameconfig/logiccore 拥有通用命名数值权重表，不硬编码游戏语义。
- gamelayouteditor 的 per-symbol otherScene mapping 只用于预览，不进入 layout manifest。
- 当前 game002 CN valuePresentation 是 legacy compatibility，不自动迁移或删除。
- 禁止缺 glyph、缺 slot、缺 table、missing node 和非法 value fallback。

如果实际实现选择了与本计划等价但字段名略有调整的公开合同，必须同时更新所有文档、测试和报告，并在报告中给出最终 schema；不能只让代码和计划悄悄分叉。

### 阶段 G：任务报告

报告必须写入：

```text
tasks/106-image-string-symbol-nodes-and-otherscene-preview-[utctime].md
```

报告至少包含：

- 完成时间、branch、起止 HEAD、Node/pnpm 版本和最终 worktree。
- 最终 symbol manifest `imageStringNodes` schema 和 RenderSymbol API。
- standalone ZIP -> vendored symbols ZIP 示例树。
- `bgcoinweight.xlsx` 实际解析摘要、最终 gameconfig 表内容和生成命令。
- logiccore API。
- symbolseditor 配置/手输 string 预览结果。
- gamelayouteditor per-symbol mapping、weighted/fixed otherScene 示例。
- legacy game002 CN compatibility 回归结果。
- 自动测试、build、lint、typecheck、format 和浏览器验收结果；未执行项明确写未执行。
- 是否修改 `agents.md`、是否新增依赖、lockfile 是否变化、是否使用代理。
- 根级门禁若被任务外既有问题阻断，记录首个真实错误和受影响 package；不得把定向通过伪装成根级通过。

## 7. 测试与验收矩阵

### 7.1 rendercore 自动测试

- 旧 image-string manifest/layout/resource tests 全通过。
- 新 symbol node schema 的正反例完整。
- standalone nested dependency 精确闭包。
- 多 symbol 共享 resource 不重复解码/销毁。
- string setter/getter、前导零、空字符串、多节点、缺 name、缺 glyph原子性。
- slot attach/state switch/late init/equivalent player/texture override/pool/destroy。
- 旧 valuePresentation controller、CN image/full-value 和 reel tests 全通过。

### 7.2 symbolseditor 自动测试

- standalone ZIP import/replace/conflict/remove。
- dependency logical model/reference/fingerprint。
- node add/edit/reorder/remove、name unique、target state/slot exact。
- compile/import/export round-trip。
- symbols package entries 精确等于声明 closure。
- preview manual string 只调用 public API并保持前导零。
- bad glyph/slot/dependency 不提交旧 preview。
- legacy value editor/import/export 回归。

### 7.3 gengameconfig/logiccore 自动测试

- workbook 表头、数字/文本整数、bad cells、断行、duplicate、overflow。
- CLI repeated option/path/extension/duplicate table name。
- 无 table 输出 byte-shape 兼容。
- logiccore missing/valid/invalid tables、freeze/order/RangeError。
- game002 production workbook 和 generated JSON 定向验证。

### 7.4 gamelayouteditor 自动测试

- existing random reel tests 保持通过。
- unbiased weighted sampling。
- fixed/table、多 symbol、多 target、legacy compatibility。
- otherScene x-major、未映射 0、matrix freeze。
- stable stops across source edit/resize，randomize 同时刷新。
- atomic visual swap 和 cleanup。
- layout ZIP 不含 symbols package、mapping 或 otherScene。

### 7.5 浏览器手工验收

#### symbolseditor

1. 启动 Imgnumbereditor，导入 `assets/game002-s3/0-1.png ... 9-1.png`，配置 digits fixed group，导出 standalone ZIP。
2. 启动 symbolseditor，导入一个含真实 Spine normal state 的 game config/symbol project。
3. 导入 standalone ZIP，新增 `coin-value` 节点，显式选 state 和 slot。
4. 分别输入 `1`、`001`、`25`、`1000`，确认前导零、宽度和 slot/bone 跟随正确。
5. 输入缺 glyph 字符，确认报错且旧值保留。
6. 增加第二个不同 name 节点，确认 getter/setter 和 UI 输入互不影响。
7. 切换 state/replay/resize，确认 target state 可见、其它 state 隐藏、返回后文本恢复且 Spine 不重播等价 Loop。
8. 导出 symbols ZIP，检查 vendor 目录与精确 closure；重新导入后预览一致。

#### gamelayouteditor

1. 导入上述 symbols ZIP。
2. 选择兼容 reel set并生成 scene。
3. 为一个带命名节点的 symbol 选择 `bgcoinweight`，确认各 occurrence 独立取值并生成 x-major otherScene。
4. 为另一个 symbol 选择 fixed number，确认只影响该 symbol。
5. 修改 source，确认 stops 不变、otherScene 更新。
6. resize、切横竖 variant、zoom，确认 scene/otherScene 不重采。
7. 点击重新随机，确认 stops 和 values 同时更新。
8. 如使用当前旧 game002 CN package，确认 legacy target 仍可用 `setPresentationValue()` 预览，且没有被伪装成命名 string node。
9. 导出 layout ZIP，确认不含 symbols assets、number mapping 或 otherScene。

## 8. 执行命令与门禁

### 8.1 定向生成与数据验证

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --number-weight assets/gamecfg002/bgcoinweight.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

用 Node/测试检查：

- `numberWeightTables.bgcoinweight` 恰好 10 项；
- values/weights 与第 1 节一致；
- weight 总和为 240；
- paytable、symbolCodes、reels 未发生非预期变化；
- `createGameConfig(gameconfig)` 成功并可通过 public API读取表。

### 8.2 package-local 门禁

```bash
pnpm --filter gengameconfig format:check
pnpm --filter gengameconfig lint
pnpm --filter gengameconfig test
pnpm --filter gengameconfig typecheck
pnpm --filter gengameconfig build

pnpm --filter @slotclientengine/logiccore format:check
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build

pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build

pnpm --filter imgnumbereditor format:check
pnpm --filter imgnumbereditor lint
pnpm --filter imgnumbereditor test
pnpm --filter imgnumbereditor typecheck
pnpm --filter imgnumbereditor build

pnpm --filter symbolseditor format:check
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor test
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor build

pnpm --filter gamelayouteditor format:check
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor build
```

### 8.3 根级回归

```bash
pnpm format:check
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

如果根级命令被任务外既有问题阻断，不能修改无关代码“顺便修好”，也不能删除产物掩盖；报告真实记录，并确保所有本任务 package-local 门禁通过。

### 8.4 开发预览

```bash
pnpm --filter imgnumbereditor dev -- --host 0.0.0.0
pnpm --filter symbolseditor dev -- --host 0.0.0.0
pnpm --filter gamelayouteditor dev -- --host 0.0.0.0
```

浏览器验收必须使用真实导出的 ZIP 完成跨应用 round-trip，不能只用 unit mock 宣称 UI/资源闭包已通过。

## 9. 不在本任务范围

- 不迁移或重做 game002 production CN visual/valuePresentation。
- 不修改 live GMI/otherScenes 协议，不建立 WebSocket mock server。
- 不把 preview 生成的 otherScene 发给服务器。
- 不把 weight table 当服务器 RNG 或真实轮带；它只服务本地 editor 预览。
- 不在 scene-layout manifest 增加 symbol、otherScene 或 weight mapping 字段。
- 不让 layout ZIP 嵌入 symbols ZIP。
- 不支持同一 symbol 同一格同时从一张 otherScene 生成多个独立值。
- 不支持 image-string target 到 VNI/image/builtin/static/empty/activeSpine。
- 不做多行、RTL、ligature、font fallback、缺字 placeholder、自动缩放或 atlas 合图。
- 不做 image-string 美术编辑算法的新实现；继续复用 Imgnumbereditor/rendercore。
- 不新增远程素材库、上传服务、账号、localStorage、IndexedDB 或 File System Access API。
- 不把 production fallback、文件名猜测、默认 slot、默认 table、默认 node name 或 `Math.random()` 写进代码。

## 10. 完成定义

只有以下全部满足，任务才可声明完成：

- [ ] `assets/gamecfg002/bgcoinweight.xlsx` 已纳入交付且未被改坏。
- [ ] gengameconfig 可用重复 `--number-weight` 严格生成命名权重表。
- [ ] 同一 gameconfig 可同时保存并查询多张命名权重表，且不同 symbol 可选择不同表。
- [ ] game002 config 由生成器重建并包含正确 `bgcoinweight`。
- [ ] logiccore 有冻结、严格、通用的表查询 API。
- [ ] symbol manifest 支持多个唯一命名 `imageStringNodes`。
- [ ] RenderSymbol 有按 name 的 string set/get/names API。
- [ ] 节点绑定真实 Spine state/slot并正确处理状态、异步、pool、destroy。
- [ ] standalone Imgnumber ZIP 能导入 symbolseditor 并作为 logical dependency 管理。
- [ ] symbols ZIP vendor 精确闭包并可 strict round-trip。
- [ ] symbolseditor 可为每个命名节点手输 string 实时预览。
- [ ] gamelayouteditor 可按 symbol 选择 target + weight table/fixed number。
- [ ] otherScene 与 sampled scene 同尺寸、x 优先、未映射为 0。
- [ ] 多 symbol 各自独立，resize 不重采，randomize 正确重采。
- [ ] 当前旧 game002 CN valuePresentation/runtime 保持兼容。
- [ ] 没有 CN/bgcoinweight/game002 硬编码进入 shared 包。
- [ ] 没有缺 glyph/slot/table/node/value fallback 或 `Math.random()`。
- [ ] affected package 定向门禁通过，根级门禁结果如实记录。
- [ ] 浏览器跨应用 ZIP 验收完成或报告明确写“未执行”，不得虚报。
- [ ] README、manifest 文档和 `agents.md` 与最终代码一致。
- [ ] 已新增符合命名和 UTC 时间要求的中文任务报告。
