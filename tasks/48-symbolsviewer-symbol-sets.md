# symbolsviewer symbol sets 任务计划

## 1. 任务目标

更新 `apps/symbolsviewer`，让它在保留现有第一套 `assets/symbols` 展示能力的基础上，支持选择并展示第二套图标资源：

```text
/Users/zerro/github.com/slotclientengine/assets/symbols002
```

第二套图标的 runtime game config 来源是：

```text
assets/gamecfg002/gameconfig.json
```

该文件由 `gengameconfig` 从下面两个 Excel 文件生成：

```text
assets/gamecfg002/paytables.xlsx
assets/gamecfg002/reels-001.xlsx
```

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、资源生成、代码实现、测试、文档、验收、协作规则同步判断和任务报告。

核心交付：

- 为 `assets/symbols002` 生成完整状态图片：
  - `*.spinBlur.png`
  - `*.disabled.png`
- 为 `assets/symbols002` 生成完整状态贴图 manifest：
  - `assets/symbols002/symbol-state-textures.manifest.json`
- 用 `gengameconfig` 生成第二套 runtime game config：
  - `assets/gamecfg002/gameconfig.json`
- `apps/symbolsviewer` 增加 symbol set 选择能力，可以选择：
  - 第一套：`assets/symbols` + `assets/gamecfg/game2.json`
  - 第二套：`assets/symbols002` + `assets/gamecfg002/gameconfig.json`
- 第二套图标状态表现：
  - `spinBlur`：稳定态，循环/静态，纵向模糊，和第一套一致。
  - `normal`：稳定态，循环/静态，原图，无特殊效果，和第一套一致。
  - `appear`：单次，在普通状态图后面额外叠一层普通状态图副本，副本半透明并放大后消退；主普通图不能被整体缩放代替。
  - `win`：单次，闪光，和第一套一致。
  - `disabled`：稳定态，循环/静态，灰度，和第一套一致。
- `symbolsviewer` 页面必须能稳定展示两套图标，并且切换时不会残留上一套 symbol、状态或 Pixi 对象。
- 若实现新增了长期协作规则、目录规范或基础脚本约定，必须同步更新根目录 `agents.md`；否则在任务报告中说明无需更新。
- 任务完成后新增中文任务报告：

```text
tasks/48-symbolsviewer-symbol-sets-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/48-symbolsviewer-symbol-sets-260625-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 新增空目录必须放 `.keepme`

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖，因为 `packages/rendercore` 已经有 `sharp@^0.34.4` 用于 Node 侧生成状态图片。若实现中确实需要新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前已知 `assets/symbols002/*.png`、`assets/gamecfg002/paytables.xlsx`、`assets/gamecfg002/reels-001.xlsx` 可能是用户新增的未跟踪文件；实现时必须把它们视为用户提供的输入资产，不要删除、重命名或用生成脚本覆盖原图。

## 3. 当前已知事实

### 3.1 第一套 symbols 当前实现

当前 `apps/symbolsviewer` 主要文件：

```text
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/symbol-animation-config.ts
apps/symbolsviewer/src/viewer-sequence.ts
apps/symbolsviewer/src/styles.css
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/README.md
```

当前第一套资源读取方式：

- `apps/symbolsviewer/src/main.ts` 静态导入：
  - `../../../assets/gamecfg/game2.json`
  - `../../../assets/symbols/symbol-state-textures.manifest.json`
- `apps/symbolsviewer/src/main.ts` 通过下面的 Vite glob 读取第一套 PNG：

```ts
import.meta.glob("../../../assets/symbols/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});
```

当前第一套已支持：

- 从 `assets/gamecfg/game2.json` 读取 runtime game config。
- 从 `assets/symbols/*.png` 读取普通图、状态图、layer 图和 keyframe 图。
- 从 `assets/symbols/symbol-state-textures.manifest.json` 读取状态贴图 manifest。
- 展示 paytable 与图片资源交集。
- 以 fail-fast 方式校验：
  - 未知状态贴图文件名。
  - 缺少必需 `spinBlur` / `disabled` 状态图。
  - manifest 引用不存在的图片。
  - layered normal 缺层、layer index 不连续、keyframes 不合法。

当前第一套可展示 symbol：

```text
S00, S0, S1, S5, S10, SC, RS, X2, X5, X10
```

第一套 paytable 中缺图的 symbol：

```text
BN
```

第一套孤儿图片：

```text
CO, SX
```

第一套特殊 layered symbol：

```text
SC, RS, X2, X5, X10
```

第一套已有状态图和 manifest：

```text
assets/symbols/*.spinBlur.png
assets/symbols/*.disabled.png
assets/symbols/symbol-state-textures.manifest.json
assets/symbols/symbol-composites.json
```

第一套状态图生成命令当前为：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json
```

### 3.2 第二套 symbols002 当前资源

当前第二套目录：

```text
assets/symbols002
```

当前第二套原始 PNG：

```text
assets/symbols002/AF.png
assets/symbols002/CM.png
assets/symbols002/CN.png
assets/symbols002/CO.png
assets/symbols002/H1.png
assets/symbols002/H2.png
assets/symbols002/L1.png
assets/symbols002/L2.png
assets/symbols002/L3.png
assets/symbols002/L4.png
assets/symbols002/WL.png
assets/symbols002/WM.png
```

当前第二套 PNG 尺寸均为 `500 x 500`，RGBA。

当前第二套 game config 源文件位于：

```text
assets/gamecfg002/paytables.xlsx
assets/gamecfg002/reels-001.xlsx
```

执行本任务时必须先生成 runtime game config：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

生成结果必须是 `logiccore.createGameConfig(...)` 可直接消费的结构：

```json
{
  "paytable": {},
  "symbolCodes": {},
  "reels": {}
}
```

第二套 paytable symbol 当前应为：

```text
WL, H1, H2, L1, L2, L3, L4, WM, CN, CM, CO, AF, BN
```

第二套 paytable 与图片资源交集，即应展示的 symbol，按 paytable 顺序为：

```text
WL, H1, H2, L1, L2, L3, L4, WM, CN, CM, CO, AF
```

第二套 paytable 中缺图的 symbol：

```text
BN
```

第二套当前没有孤儿图片。

第二套当前没有：

```text
assets/symbols002/*.spinBlur.png
assets/symbols002/*.disabled.png
assets/symbols002/symbol-state-textures.manifest.json
assets/symbols002/symbol-composites.json
assets/gamecfg002/gameconfig.json
```

第二套当前全部是单图 symbol，本任务不需要为第二套创建 layered normal 或 `symbol-composites.json`。如果未来第二套出现 layered symbol，应按第一套的 manifest/layer 规则另开任务或在报告中明确追加范围。

### 3.3 rendercore 当前能力

当前 `packages/rendercore` 已有：

```text
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/symbol/animation-resolver.ts
packages/rendercore/src/symbol/named-animations.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/tests/symbol/named-animations.test.ts
```

当前图片生成脚本支持：

- `--input-dir`
- `--output-dir`
- `--symbols`
- `--composites`
- 生成 `spinBlur` 纵向模糊图。
- 生成 `disabled` 灰度图。
- 写出 `symbol-state-textures.manifest.json`。
- 对 composite symbol 先合成完整图再生成状态图。

当前需要注意的脚本问题：

- 脚本默认 composite 配置路径是 `assets/symbols/symbol-composites.json`。
- 多套 symbol set 落地后，应改成默认查找当前 `inputDir` 下的 `symbol-composites.json`，避免第二套资源生成时意外读取第一套 composite 配置。
- 第一套生成命令可继续显式传 `--composites assets/symbols/symbol-composites.json`，保持兼容。

当前 `rendercore` 默认动画：

- `normal`：静态。
- `appear`：缩放主 `sprite`。
- `win`：扫光。

第二套 `appear` 不能直接复用当前默认 `appear`，因为需求是“普通状态图片后面再叠一层普通状态图片，半透明，然后缩放得更大”，主普通图应保持不被整体缩放。

## 4. 设计原则

### 4.1 多套 symbol set 是显式配置

不要把第二套资源硬塞进第一套逻辑里，也不要通过路径字符串猜测资源套装。新增明确的 symbol set 配置模型，例如：

```ts
interface SymbolSetConfig {
  readonly id: "symbols" | "symbols002";
  readonly label: string;
  readonly rawGameConfig: unknown;
  readonly modules: Record<string, string>;
  readonly manifest: unknown;
  readonly requiredStates: readonly string[];
  readonly animationResolver: SymbolAnimationResolver;
}
```

实际命名可以调整，但必须满足：

- 第一套和第二套都通过同一个加载流程创建 catalog。
- 每套资源的 JSON、PNG glob、manifest、动画 resolver 都显式绑定。
- 切换 symbol set 时重新创建 catalog、加载纹理、重建 `RenderSymbol` 列表。
- 切换后清空旧 Pixi display object、旧 label、旧状态面板和旧序列状态。
- 不允许“第二套缺 manifest 时临时退回第一套 manifest”。
- 不允许“第二套缺状态图时用普通图代替”。

### 4.2 第二套 gameconfig 必须由 gengameconfig 生成

第二套 viewer 不应解析 `assets/symbols002/game.json` 或其它编辑器原始导出结构。必须先通过 `gengameconfig` 生成标准 runtime game config：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

`apps/symbolsviewer` 只消费生成后的：

```text
assets/gamecfg002/gameconfig.json
```

生成规则由 `apps/gengameconfig` 负责：

- paytable 表头仍必须是 `Code, Symbol, X1...Xn`，且 `X` 列连续。
- reels 表头仍必须是 `line, R1...Rn`，且 `R` 列连续。
- `Code` 和 `X1...Xn` 按内容解析为非负安全整数；允许 Excel 把整数存成数值单元格或整数文本单元格。
- `Symbol` 和 `R1...Rn` 按可见内容 trim 后解析；允许 Excel 把 symbol 存成文本或数值内容。
- 公式、布尔、日期、空值、浮点、非数字 pay、重复 code、重复 symbol、重复 reel key、未知 reels symbol 都必须 fail-fast。
- 生成出的 `gameconfig.json` 必须继续能通过 `createGameConfig(...)`。

不要为通过测试而在 `symbolsviewer` 里构造只包含 paytable 的假 config。`logiccore` 当前要求 `reels` 非空，这是合同，不应绕开。

### 4.3 第二套 appear 用底层半透明副本

第二套 `appear` 需要新动画能力，不能用当前默认主图缩放代替。

推荐在 `packages/rendercore` 增加通用 underlay/echo 动画 primitive：

- 在 `RenderSymbol` 增加 `underlayLayer`，显示顺序为：

```text
underlayLayer -> baseLayer -> stateSprite -> overlayLayer
```

- 在 `SymbolAnimationContext` 增加：

```ts
readonly underlayLayer: Container;
```

- `resetBaseDisplay(...)` 必须同时清理 `underlayLayer` 和 `overlayLayer`。
- 新增 named animation，例如：

```text
singleSpriteUnderlayScale
```

语义：

- 只支持单图 symbol；如果 `context.layers.length !== 1`，必须 fail-fast。
- reset 时创建一张和普通状态相同 texture 的 `Sprite`，放入 `underlayLayer`。
- 副本 `anchor` 为 `0.5`。
- 主普通图保持可见，且主图 scale 不因该动画改变。
- 副本 alpha 在过程中半透明脉冲，建议峰值 `0.35` 到 `0.45`。
- 副本 scale 从 `1` 放大到建议 `1.55` 到 `1.7`，然后消退。
- complete 时移除副本，并恢复 `underlayLayer`。

第二套 resolver 应保证所有第二套 displayable symbol 的 `appear` 都使用这个效果。不要依赖 fallback 让某些 symbol 悄悄走默认主图缩放。

第一套现有特殊动画保持不回归：

- `SC`
- `RS`
- `X2`
- `X5`
- `X10`

### 4.4 资源生成是开发期动作

第二套状态图必须提交为静态 PNG，浏览器运行时不能依赖 `sharp` 或其它图片处理库。

生成结果必须直接放在：

```text
assets/symbols002
```

不要新建嵌套目录，例如：

```text
assets/symbols002/state-textures
```

第二套必须生成的 PNG：

```text
assets/symbols002/WL.spinBlur.png
assets/symbols002/WL.disabled.png
assets/symbols002/H1.spinBlur.png
assets/symbols002/H1.disabled.png
assets/symbols002/H2.spinBlur.png
assets/symbols002/H2.disabled.png
assets/symbols002/L1.spinBlur.png
assets/symbols002/L1.disabled.png
assets/symbols002/L2.spinBlur.png
assets/symbols002/L2.disabled.png
assets/symbols002/L3.spinBlur.png
assets/symbols002/L3.disabled.png
assets/symbols002/L4.spinBlur.png
assets/symbols002/L4.disabled.png
assets/symbols002/WM.spinBlur.png
assets/symbols002/WM.disabled.png
assets/symbols002/CN.spinBlur.png
assets/symbols002/CN.disabled.png
assets/symbols002/CM.spinBlur.png
assets/symbols002/CM.disabled.png
assets/symbols002/CO.spinBlur.png
assets/symbols002/CO.disabled.png
assets/symbols002/AF.spinBlur.png
assets/symbols002/AF.disabled.png
```

第二套必须生成的 manifest：

```text
assets/symbols002/symbol-state-textures.manifest.json
```

manifest 要求：

- `version` 为 `1`。
- `states` 精确包含 `spinBlur` 和 `disabled`。
- `settings.spinBlur.kind` 为 `verticalBoxBlur`。
- `settings.disabled.kind` 为 `grayscale`。
- `symbols` 精确包含第二套 displayable symbols：

```text
WL, H1, H2, L1, L2, L3, L4, WM, CN, CM, CO, AF
```

- 每个 symbol 必须包含：
  - `normal`
  - `spinBlur`
  - `disabled`
- `normal` 使用相对路径，例如 `./WL.png`。
- `spinBlur` 使用相对路径，例如 `./WL.spinBlur.png`。
- `disabled` 使用相对路径，例如 `./WL.disabled.png`。
- 不写入生成时间，避免每次运行产生无意义 diff。
- 不包含 `BN`，因为当前没有 `BN.png`。

第二套状态图生成命令：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
```

生成脚本只允许清理它自己可识别的生成物：

- `*.spinBlur.png`
- `*.disabled.png`
- `symbol-state-textures.manifest.json`

不允许清理原始 PNG、`assets/gamecfg002/gameconfig.json`、`.DS_Store` 或其它用户资产。

### 4.5 不做不必要兜底

本任务必须保持 fail-fast：

- 第二套缺少 `symbol-state-textures.manifest.json` 必须报错。
- 第二套 manifest 缺任意 displayable symbol 的 `spinBlur` / `disabled` 必须报错。
- 第二套 manifest 引用不存在的 PNG 必须报错。
- 第二套 `gameconfig.json` 源 Excel 缺表头、重复 Code / Symbol、重复 reel key 或 reels 引用未知 symbol 必须报错。
- viewer 选择不存在的 symbol set id 必须报错。
- 资源目录中出现未知状态后缀，例如 `H1.blurred.png`，必须报错。
- `BN` 缺图只能进入 `ignoredPaytableSymbolsWithoutAssets`，不能创建占位图、不能替换成其它图。
- 如果测试导致一些奇怪写法，修改测试，不要改不该改的生产逻辑。

## 5. 实施步骤

### 5.1 现状确认

先运行：

```bash
git status --short --untracked-files=all
git diff --stat
```

确认当前文件：

```bash
find assets/symbols002 -maxdepth 1 -type f | sort
find assets/gamecfg002 -maxdepth 1 -type f | sort
```

不要手工抄 paytable；第二套 paytable 以后续生成出的 `assets/gamecfg002/gameconfig.json` 为准。

### 5.2 调整状态图生成脚本

修改：

```text
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/tests/symbol/state-texture-generator.test.ts
```

要求：

- 默认 composite 文件从当前 `inputDir` 下查找：

```text
<inputDir>/symbol-composites.json
```

- 如果当前 `inputDir` 下没有 `symbol-composites.json` 且未显式传 `--composites`，不报错，按单图 symbol 生成。
- 如果显式传 `--composites`，该文件不存在或非法必须报错。
- 保持第一套显式 `--composites assets/symbols/symbol-composites.json` 行为可用。
- 增加测试覆盖：
  - 自定义 `inputDir` 没有 `symbol-composites.json` 时，不会读取仓库第一套 composites。
  - 显式 `--composites` 缺失时报错。
  - `--input-dir assets/symbols002` 风格参数能生成单图 manifest。

### 5.3 生成第二套 runtime game config

执行：

```bash
pnpm --filter gengameconfig dev -- \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

生成后检查：

```bash
jq -r '.paytable[] | [.code,.symbol] | @tsv' assets/gamecfg002/gameconfig.json
jq -r '.reels | keys[]' assets/gamecfg002/gameconfig.json
```

必须确认：

- `gameconfig.json` 存在且是稳定格式 JSON。
- `gameconfig.json` 保持 `gengameconfig` 原生输出，不再用 Prettier 或手工格式化改写。
- paytable symbol 为 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`。
- `symbolCodes.BN === 12`。
- reels key 包含 `reels-001`。
- 没有为了绕过 `logiccore` 手写或篡改输出 JSON。

### 5.4 生成第二套状态图和 manifest

执行：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
```

生成后检查：

```bash
find assets/symbols002 -maxdepth 1 -type f \( -name '*.spinBlur.png' -o -name '*.disabled.png' -o -name 'symbol-state-textures.manifest.json' \) | sort
jq '.symbols | keys' assets/symbols002/symbol-state-textures.manifest.json
```

必须确认：

- 生成 24 张状态 PNG。
- 生成 1 个 manifest。
- manifest 不包含 `BN`。
- manifest 不包含时间戳。

### 5.5 增加 symbol set 配置并消费第二套 gameconfig

建议新增：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
```

也可以放入现有 `symbol-assets.ts`，但若文件变得过大，优先拆出新文件。

实现内容：

- 定义第一套和第二套 symbol set 配置。
- 不新增 viewer 侧 editor JSON parser。
- 第一套继续使用：

```text
assets/gamecfg/game2.json
assets/symbols/*.png
assets/symbols/symbol-state-textures.manifest.json
```

- 第二套使用：

```text
assets/gamecfg002/gameconfig.json
assets/symbols002/*.png
assets/symbols002/symbol-state-textures.manifest.json
```

- 第二套 `gameconfig.json` 必须能通过 `createGameConfig(...)`。
- 增加测试覆盖：
  - 第二套 generated gameconfig 解析出 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN`。
  - 第二套 `symbolCodes.BN === 12`。
  - 第二套 `reels["reels-001"]` 存在且每一轴非空。
  - 第二套 displayable symbols 是 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`。
  - 第二套 ignored paytable symbols without assets 是 `BN`。
  - 第二套 ignored assets without paytable 为空。

### 5.6 增加第二套 appear 动画

修改：

```text
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/symbol/named-animations.ts
packages/rendercore/tests/symbol/ani.test.ts
packages/rendercore/tests/symbol/named-animations.test.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
```

要求：

- 新增 `underlayLayer`，显示在普通图后面。
- `resetBaseDisplay(...)` 清理 `underlayLayer`。
- 新增 named animation `singleSpriteUnderlayScale`。
- 参数建议：

```ts
{
  maxScale: 1.6,
  maxAlpha: 0.4
}
```

- 参数校验：
  - `maxScale` 必须是正数，且建议大于 `1`；小于等于 `1` 应报错。
  - `maxAlpha` 必须在 `[0, 1]`。
  - 未知参数必须报错。
- 效果验收：
  - reset 后 `underlayLayer.children.length === 1`。
  - 主 `sprite.scale` 保持 `1`。
  - 进度中副本 scale 大于 `1`，alpha 大于 `0` 且不超过 `maxAlpha`。
  - complete 后 `underlayLayer.children.length === 0`。
  - layered symbol 使用该动画时 fail-fast。

### 5.7 更新 symbolsviewer 主流程

修改：

```text
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/symbol-animation-config.ts
apps/symbolsviewer/src/styles.css
apps/symbolsviewer/tests/symbol-assets.test.ts
```

要求：

- 顶部 toolbar 增加 symbol set selector。
- selector 选项至少包含：

```text
symbols
symbols002
```

- 页面初始默认选择 `symbols`，保持当前第一套行为。
- 切换到 `symbols002` 后：
  - 加载第二套 PNG 和 manifest。
  - 使用 `assets/gamecfg002/gameconfig.json`。
  - 创建第二套 catalog。
  - 重建 Pixi symbol 列表和 label。
  - 重置状态序列为默认序列。
  - 状态面板显示第二套 symbol。
- 切回 `symbols` 后：
  - 第一套 10 个 symbol 恢复展示。
  - 第一套特殊 layered 动画仍按原样运行。
- `createStatefulSymbolAssetMapFromModules(...)` 必须继续排除 layer/keyframe/state PNG，避免把 `WL.spinBlur` 或 `SC-1-0` 当成 symbol。
- 第二套 displayable symbols 必须按 paytable 顺序：

```text
WL, H1, H2, L1, L2, L3, L4, WM, CN, CM, CO, AF
```

- 第二套 ignored paytable symbols 必须是：

```text
BN
```

- 第二套 ignored assets without paytable 必须为空。

### 5.8 调整布局，避免第二套 12 个 500x500 图标重叠

当前第一套是一行排布。第二套有 12 个 `500 x 500` PNG，如果沿用当前一行布局，容易超出 `1080` 宽舞台。

必须调整 `createRenderedSymbols(...)` 或相近布局逻辑：

- 支持按 symbol 数量自动换行，建议 PC 横屏下最多每行 6 个。
- 第二套 12 个 symbol 应显示为两行，每行 6 个。
- label 不得和图标或其它 label 重叠。
- 第一套 10 个 symbol 也必须仍然清晰可见；可以继续一行，也可以统一改为多行，但不能降低可读性。
- scale 应根据每套图标实际尺寸计算，不能写死只适合第一套的小图。
- canvas 非空，且所有图标都在可视区域内。

### 5.9 更新 README 和协作规则

必须更新：

```text
apps/symbolsviewer/README.md
```

README 至少说明：

- viewer 支持两套 symbol set。
- 每套资源对应的 JSON、PNG 和 manifest 路径。
- 第二套 runtime game config 由 `gengameconfig` 从 `assets/gamecfg002/paytables.xlsx` 和 `assets/gamecfg002/reels-001.xlsx` 生成。
- 第二套 `assets/gamecfg002/gameconfig.json` 由 viewer 直接消费，不在 viewer 侧解析编辑器原始导出。
- 第二套状态图生成命令。
- 第二套 `appear` 是 underlay 半透明副本放大，不是主图缩放。
- 第二套 displayable symbols 和缺图 `BN`。
- 手动验收步骤。

检查是否需要更新：

```text
agents.md
```

如果最终实现把多套 symbols 资产约定固化为长期规则，例如 `assets/symbolsNNN` 目录必须包含原始 PNG 和 `symbol-state-textures.manifest.json`，且 `assets/gamecfgNNN` 目录必须包含生成后的 `gameconfig.json`，则同步更新 `agents.md`。如果只是 `symbolsviewer` 局部约定，不新增仓库级协作规则，则不更新 `agents.md`，但必须在任务报告中写明判断理由。

## 6. 验收命令

执行前确认 Node 版本：

```bash
node --version
pnpm --version
```

资源生成验收：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
```

聚焦测试：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolsviewer test
```

聚焦类型检查：

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter symbolsviewer typecheck
```

聚焦 lint：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter symbolsviewer lint
```

聚焦 build：

```bash
pnpm --filter @slotclientengine/rendercore build
pnpm --filter symbolsviewer build
```

如果以上聚焦命令都通过，再执行根级回归：

```bash
pnpm typecheck
pnpm test
pnpm build
```

最后执行格式检查：

```bash
pnpm format:check
git diff --check
```

如果某个测试因为既有断言没有表达真实合同而失败，优先修改测试。不要为了测试通过而加入隐藏 fallback、自动替换图片、吞掉非法 manifest、构造假 paytable 或弱化生产校验。

## 7. 手动验收

启动 viewer：

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

浏览器建议视口：

```text
1280 x 720 或更大
```

验收第一套 `symbols`：

- 默认进入页面时选择第一套。
- Pixi canvas 非空。
- 展示 `S00,S0,S1,S5,S10,SC,RS,X2,X5,X10`。
- `SC,RS,X2,X5,X10` 仍使用 layered normal。
- 默认序列为 `normal -> appear -> win -> spinBlur -> disabled`。
- `spinBlur` 显示纵向模糊图。
- `disabled` 显示灰度图。
- 第一套已有特殊 `appear` / `win` 动画不回归。

验收第二套 `symbols002`：

- 切换 selector 到 `symbols002`。
- Pixi canvas 非空。
- 展示 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`。
- 不展示 `BN`，也不展示任何占位图。
- 12 个图标和 label 不重叠，全部在画布内。
- `normal` 显示原图。
- `appear` 时主图保持原始大小，图后出现半透明普通图副本，副本放大后消退。
- `win` 显示闪光效果，和第一套单图默认 win 一致。
- `spinBlur` 显示纵向模糊图，不是普通图。
- `disabled` 显示灰度图，不是普通图。
- 修改默认 stable 状态后，`appear` / `win` 结束回到新的默认状态。
- 移除、调整、增加状态后，播放顺序按当前序列执行。

切换验收：

- `symbols -> symbols002 -> symbols` 连续切换至少 3 次。
- 每次切换后旧 symbol 不残留。
- 状态面板只显示当前 symbol set。
- 控制按钮仍可用。
- 浏览器 console 没有错误。

## 8. 任务报告要求

任务完成后新增报告：

```text
tasks/48-symbolsviewer-symbol-sets-[utctime].md
```

报告必须包含：

- 任务摘要。
- 生成的第二套 PNG 和 manifest 清单。
- 主要修改文件清单。
- `symbolsviewer` 两套 symbol set 的最终 displayable / ignored 列表。
- 第二套 `appear` 动画实现说明。
- 执行过的命令和结果。
- 手动验收结果。
- `agents.md` 是否更新以及原因。
- 是否修改 `pnpm-lock.yaml` 以及原因。
- 已知风险或后续建议。

## 9. 第二遍遗漏检查清单

交付前必须逐项检查：

- 资源：
  - `assets/symbols002` 原始 PNG 未被覆盖。
  - 第二套 24 张状态 PNG 全部存在。
  - 第二套 manifest 存在、稳定、无时间戳。
  - manifest 不包含 `BN`。
  - 没有提交 `.DS_Store`。
- JSON / schema：
  - 第二套 `assets/gamecfg002/gameconfig.json` 由 `gengameconfig` 生成。
  - 第二套 `gameconfig.json` 继续走 `createGameConfig(...)`。
  - 没有构造假 reels 绕过 `logiccore`。
- viewer：
  - selector 可切换两套。
  - 切换时清理旧 Pixi 对象。
  - 第二套 12 个图标布局不重叠。
  - 状态面板和控制按钮仍正常。
- 动画：
  - 第二套 `appear` 是半透明副本放大，不是缩放主图。
  - 第二套 `win` 仍是闪光。
  - `spinBlur` / `disabled` 使用生成图。
  - 第一套特殊动画不回归。
- 测试：
  - rendercore 新 underlay/echo 动画有单测。
  - symbolsviewer 第二套资源、manifest、generated gameconfig 和 catalog 有单测。
  - 失败场景保持 fail-fast。
- 命令：
  - 聚焦 test/typecheck/lint/build 已执行。
  - 根级 typecheck/test/build 已执行或报告中说明无法执行的原因。
  - `pnpm format:check` 和 `git diff --check` 已执行。
- 文档和规则：
  - `apps/symbolsviewer/README.md` 已更新。
  - `agents.md` 已判断是否需要更新，结果写入报告。
- 报告：
  - 文件名使用 UTC。
  - 报告是中文。
  - 报告包含命令结果和手动验收结果。
