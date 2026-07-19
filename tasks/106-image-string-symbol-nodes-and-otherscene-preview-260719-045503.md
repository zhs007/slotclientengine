# 任务 106 执行报告

## 1. 完成信息

- 完成时间（UTC）：2026-07-19 04:55:03
- 分支：`main`
- 起始 HEAD：`7e789e374c0b3639f09bd9a78c3b95e9e5372abb`
- 结束 HEAD：`7e789e374c0b3639f09bd9a78c3b95e9e5372abb`（本任务未创建 commit）
- Node：`v24.14.0`
- 可用 pnpm：`11.9.0`；仓库声明 `pnpm@10.0.0`
- 最终 worktree：任务实现、文档、测试、production xlsx/config 与本报告均未提交；没有覆盖或删除用户提供的 `assets/gamecfg002/bgcoinweight.xlsx` 和任务计划。

## 2. 完成范围

已完成以下整条工作流：

1. `gengameconfig` 支持重复 `--number-weight`，严格读取第一张 worksheet 并生成通用命名权重表。
2. `logiccore` 严格解析、递归冻结并通过窄 API 暴露命名权重表。
3. `rendercore` 支持 symbol manifest 命名 image-string 节点、nested exact closure、共享资源、RenderSymbol string API 和 official Spine slot attach/detach 生命周期。
4. `symbolseditor` 支持 standalone Imgnumber ZIP logical dependency 的导入、显式替换、删除保护、vendor、命名节点 Inspector、session-only 手输预览和严格 round-trip。
5. `gamelayouteditor` 支持 per-symbol target/source mapping、无 modulo bias 权重抽样、fixed positive integer、x-major otherScene、public setter 应用、稳定 stop 和原子视觉替换。
6. 更新全部指定 README、image-string manifest 文档和 `agents.md` 长期 ownership。

没有修改 game002 live otherScene 协议，也没有迁移或删除现有 `CN.valuePresentation`。

## 3. 最终 symbol manifest schema 与 API

每个 parsed symbol 固定包含稳定有序的 `imageStringNodes`；未声明时为冻结空数组：

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
```

实例：

```json
{
  "name": "coin-value",
  "resource": "./dependencies/image-strings/coin-digits/image-string.manifest.json",
  "target": { "state": "normal", "slot": "Num" },
  "initialText": "001",
  "anchor": { "x": 0.5, "y": 0.5 },
  "transform": { "x": 0, "y": 0, "scale": 1 },
  "followSlotColor": true
}
```

target 必须是该 symbol 的真实 manifest `kind: "spine"` state，slot 在 package prepare 时按 skeleton metadata 大小写精确校验。节点 resource、name、anchor、transform、boolean、未知字段和 legacy text slot 冲突均严格校验。

`RenderSymbol` 新增：

```ts
getImageStringNodeNames(): readonly string[];
setImageStringText(name: string, text: string): void;
getImageStringText(name: string): string;
```

string 不做 number round-trip，`"001"` 原样保留。setter 先完成 NFC、控制字符与 glyph closure 校验再原子提交；unknown name 错误包含 symbol/name。pool release 回到 manifest `initialText`。旧 `setPresentationValue()` / `getPresentationValue()` 保持独立。

## 4. ZIP vendoring 与资源 ownership

输入 standalone ZIP：

```text
coin-digits-image-string.zip
  image-string.manifest.json
  assets/
    0.png
    1.png
    ...
```

symbols ZIP 内部：

```text
symbols.package.json
gameconfig.json
symbol-state-textures.manifest.json
dependencies/
  image-strings/
    coin-digits/
      image-string.manifest.json
      assets/
        0.png
        1.png
        ...
```

`symbolseditor` 把 dependency 作为一个 logical resource 管理；glyph 不显示为普通 asset rows。同 id/同字节去重，同 id/不同内容拒绝普通导入并要求显式替换，被节点引用时禁止删除。导出 closure 由 rendercore 的 `collectSymbolManifestResourcePaths()` 派生，重新导入可恢复 dependency、节点顺序与配置。rendercore 按 manifest path 共享解码资源，由 symbol package 统一拥有 Object URL/texture 生命周期。

## 5. bgcoinweight 生成结果

执行命令：

```bash
node_modules/.bin/ts-node apps/gengameconfig/src/index.ts \
  --paytable assets/gamecfg002/paytables.xlsx \
  --reel assets/gamecfg002/reels-001.xlsx \
  --number-weight assets/gamecfg002/bgcoinweight.xlsx \
  --out assets/gamecfg002/gameconfig.json
```

实际解析结果：

| value | weight |
| ----: | -----: |
|     1 |    100 |
|     2 |     75 |
|     5 |     30 |
|    10 |      5 |
|    25 |      5 |
|    50 |      5 |
|   100 |      5 |
|   250 |      5 |
|   500 |      5 |
|  1000 |      5 |

- table name：`bgcoinweight`
- entries：10
- total weight：240
- `assets/gamecfg002/gameconfig.json` 只新增 `numberWeightTables.bgcoinweight`；生成 diff 中原 paytable、symbolCodes、reels 未变化。
- game003 未声明 `numberWeightTables`，production 定向测试确认仍返回空 names 并可随机公开 reel scene。

## 6. logiccore API

```ts
interface GameConfigNumberWeightEntry {
  readonly value: number;
  readonly weight: number;
}

getNumberWeightTableNames(): readonly string[];
getNumberWeightTable(
  name: string,
): readonly GameConfigNumberWeightEntry[];
```

缺字段返回冻结空 names；names 与 entries 保持 JSON 插入顺序并递归冻结。parser 复验 kebab-case、非空表、entry exact keys、positive safe integer、value unique 与总权重 `<= 2^32`。unknown name 抛 `RangeError`。

## 7. 编辑器预览行为

### symbolseditor

- 新增独立“导入 Imgnumber ZIP”入口和 logical dependency cards。
- 新增 ImgNumber Inspector：add/remove/reorder；name/dependency/state/slot/initialText/anchor/transform/followSlotColor；state 和 slot 必须显式选择，切换 state 会清空旧 slot。
- slot 候选只来自所选 Spine skeleton 的真实 metadata。
- 手输预览按 `symbol + node name` 存在 UI session，仅调用 `RenderSymbol.setImageStringText()`，不写回 initialText。
- 预览先在 detached Pixi tree 完整构建；任何 glyph/node setter 失败会销毁临时树并保留上一份有效 resource、显示与 session 文本。
- 自动测试验证 `"001"`、空字符串、missing glyph 原子失败、unknown name、pool reset、dependency import/replace/conflict/remove 和 self-contained export/import/export closure round-trip。

### gamelayouteditor

mapping 最终合同：

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

示例 sampled scene（x-major）为 `[[A, B], [C, A]]`，A 选择权重表、B 选择 fixed 25 时，一个确定性测试样本输出：

```text
otherScene = [[1, 25], [0, 2]]
```

未映射格为 0。source 修改只重采 otherScene 并保持 scene/stop 对象；resize、zoom、guides、variant 和普通 relayout 不重采；randomize 同时重采 stop/scene/otherScene。新节点调用 string API，legacy target 调用 number API。临时 RenderSymbols 全部成功后才 swap，失败保留旧 overlay/snapshot。mapping、scene、otherScene 都不进入 layout manifest/ZIP，新建/导入项目或清除 symbol package 会清空。

## 8. legacy game002 CN 兼容

- 未修改 `assets/game002-s3/symbol-state-textures.manifest.json` 的 CN schema 或 production 资源。
- 未把旧 `valuePresentation` 伪装为命名节点。
- 旧 value controller、完整数值图片、tier Spine、reel occurrence 和 texture precedence 回归包含在 rendercore 全量 366 项测试中并全部通过。
- gamelayouteditor 只在 symbol 没有命名节点但存在 valuePresentation 时提供 `legacy-presentation-value`，仍调用 `setPresentationValue(number)`。

## 9. 自动验收结果

六个受影响 package 的 package-local format、lint、test（含 coverage）、typecheck 和 build 均通过。最终测试数：

| package          | tests | 结果                         |
| ---------------- | ----: | ---------------------------- |
| gengameconfig    |    84 | 通过，coverage gate 通过     |
| logiccore        |    71 | 通过，coverage gate 通过     |
| rendercore       |   366 | 通过，branch coverage 80.02% |
| Imgnumbereditor  |    16 | 通过                         |
| symbolseditor    |    34 | 通过                         |
| gamelayouteditor |    84 | 通过，branch coverage 71.08% |
| 合计             |   655 | 全部通过                     |

此外：

- production `bgcoinweight` 10 entries / total 240 定向验证通过。
- game002/game003 production public reel config 定向测试通过。
- 三个浏览器 app 的 Vite production build 通过；仅出现既有的大 chunk warning，无 build error。
- `git diff --check` 通过。
- 所有指定文档和 `agents.md` 已更新。

### 根级门禁

以下根级 Turbo 命令均已实际尝试：`format:check`、`lint`、`test`、`typecheck`、`build`。它们均被同一个执行环境问题阻断：Codex workspace 提供 pnpm `11.9.0`，仓库声明 `pnpm@10.0.0`；fallback pnpm 在执行 package script 前自动调用 `pnpm install`，随后先报：

```text
ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/pnpm: fetch failed
```

并因非 TTY 尝试清理 modules 时继续报：

```text
ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
```

因此不能把根级 Turbo 记录为通过。受影响 package 已绕过 pnpm runner，直接使用同一 workspace `eslint`、`vitest --coverage`、`tsc`、`vite`、`prettier` 二进制完成等价 package-local 门禁；这些定向门禁全部通过。没有为绕过环境问题修改 package manager 配置或依赖。

## 10. 浏览器验收与其它说明

- 浏览器手工验收：**未执行，按用户要求由用户完成**。本报告不以 unit mock 代替浏览器跨应用 ZIP 验收。
- `agents.md`：已修改。
- 新增第三方依赖：无。
- `pnpm-lock.yaml`：无变化。
- 代理：未使用。
- 网络：未请求成功；根级 fallback pnpm 的 registry 请求因受限环境失败。
- commit/push：未执行。
