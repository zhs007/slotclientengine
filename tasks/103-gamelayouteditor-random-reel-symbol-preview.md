# gamelayouteditor random reel symbol preview 任务计划

## 1. 任务目标

本任务扩展现有纯前端应用：

```text
apps/gamelayouteditor
```

使用户可以把 `apps/symbolseditor` 导出的 symbol-package v1 ZIP 导入布局编辑器，并直接在当前 scene layout 的 `main` grid 中看到由 ZIP 内公开本地轮带随机抽取的 normal symbols。

目标工作流为：

```text
在 symbolseditor 导出 <package-id>-symbols.zip
  -> 在 gamelayouteditor 导入该 ZIP
  -> 严格解析 symbols.package.json、gameconfig.json、symbol manifest 和精确资源闭包
  -> 用 ZIP package.cellSize 原子覆盖 layout main grid 的 cellWidth/cellHeight
  -> 从 ZIP game config 选择与 main grid 列数匹配的公开 reel set
  -> 每列独立随机一个合法 stop
  -> 按公开轮带从 stop 开始连续读取当前 rows 个 symbol code
  -> 用 rendercore RenderSymbol 在 scene-layout runtime 给出的真实 cell geometry 中渲染 normal state
  -> 用户点击“重新随机”即可在不重新导入资源的情况下查看另一组结果
```

本文件是完整实施合同。执行者不得依赖聊天记录、任务 100、任务 101 或其报告来猜产品行为；这些文件只构成历史背景，不是落地本计划所需的前置上下文。

任务完成后必须新增中文任务报告：

```text
tasks/103-gamelayouteditor-random-reel-symbol-preview-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/103-gamelayouteditor-random-reel-symbol-preview-260401-181300.md
```

## 2. 已确定的产品与技术决定

### 2.1 ZIP 合同保持不变

只接受 symbolseditor 当前导出的 symbol-package v1 ZIP。根目录必须包含：

```text
symbols.package.json
```

包内文件必须继续精确等于：

```text
symbols.package.json
package.entrypoints.gameConfig
package.entrypoints.symbolManifest
package.resources[]
```

不得增加旧格式、目录 ZIP、散文件、layout ZIP 或按文件名猜测类型的兼容入口。缺 package manifest、缺 entrypoint、缺资源、多余资源、非法路径、资源版本错误或 manifest 引用错误都应立即失败。

本任务不修改 `SymbolPackageManifestV1` schema，不把随机结果、stop、scene 或 layout 数据写进 symbols ZIP，也不把 symbols ZIP/资源嵌入 layout ZIP。

### 2.2 “grid 大小覆盖”的精确定义

symbol-package v1 中与布局 grid 尺寸对应的权威字段只有：

```ts
packageManifest.cellSize.width;
packageManifest.cellSize.height;
```

导入成功时必须覆盖：

```ts
project.reel.cellWidth = packageManifest.cellSize.width;
project.reel.cellHeight = packageManifest.cellSize.height;
```

以下 layout-owned 字段必须保留：

- `columns`；
- `rows`；
- `gapX` / `gapY`；
- 各 variant 的 grid `placement.x/y`；
- art size、背景和其它 layout nodes。

ZIP 没有 row count，也不能从轮带长度猜 row count。reel set 的 reel 数只用于校验 `columns`，不得偷偷覆盖 columns。

覆盖 cell size 后必须沿用 `applySymbolPackageCellSize()` 和现有 focus offset 语义重新派生各 variant focus。若新 cell size 使 grid 越出 art 或 focus，整个 symbols import 失败；不得 auto-fit、移动 grid、缩放 symbol、回退旧尺寸或只提交 width/height 中的一项。

清除 symbols package 只清理 symbol preview 资源和随机 scene，不回滚已提交到 layout project 的 cell size。

### 2.3 随机的是公开轮带 stop，不是 display symbol 数组

ZIP 内 `gameconfig.json` 是 symbol code/paytable/公开本地轮带的唯一数据源。必须通过 package resource 已创建的 `LogicGameConfig` / `LogicReels` public API 读取，不在 app 中重新解析 raw JSON schema。

对选中的 reel set，设 layout grid 为 `columns x rows`。随机 scene 的生成规则固定为：

```ts
for x in 0..<columns:
  stopY[x] = uniformInteger(0, reels.getLength(x) - 1)
  for y in 0..<rows:
    code[x][y] = reels.get(x, stopY[x] + y)
```

因此：

- 每列独立抽取一个合法 stop；
- 同一列的可见 symbols 必须是公开轮带上连续的窗口；
- 越过轮带尾部时由 `LogicReels.get()` / `normalizeY()` 正确回绕；
- 不 shuffle symbol manifest 的 object keys；
- 不 shuffle `displaySymbols`；
- 不按 symbol code 顺序循环填满格子；
- 不按 paytable 权重臆造概率；
- 不读取服务器 scene、服务器真实轮带、GMI、randomNumbers、otherScene 或网络数据。

### 2.4 随机源

production 浏览器默认使用 Web Crypto：

```ts
globalThis.crypto.getRandomValues(...)
```

不得使用全局 `Math.random()`。随机整数实现必须避免明显 modulo bias；随机源应通过窄接口可注入，以便单测稳定覆盖边界 stop 和回绕，不允许测试反过来逼迫 production 写死结果。

Web Crypto 不可用时应显式报错并停止随机预览，不得静默退回 `Math.random()`、固定 stop 或 code-order 填充。

### 2.5 reel set 选择

一个 game config 可以声明多个 reel set，因此 UI 必须显示 package 中的 reel set 选择器，并标出每个 reel set 的 reel count。

选择规则：

1. 先筛选 `reels.getReelCount() === project.reel.columns` 的 reel set。
2. 恰好一个兼容项时自动选中并立即生成随机 scene。
3. 多于一个兼容项时不猜 object key 的第一项；要求用户从下拉框显式选择，选择后立即生成随机 scene。
4. 没有兼容项时显示明确错误，包含 layout columns、每个 reel set 名称及其 reel count，暂停 symbol overlay。
5. 用户修改 layout columns 后重新执行上述兼容性判断；原选择仍兼容时保留，否则清除选择并要求重新选择。

禁止使用诸如 `main`、`reels01`、`reels-001`、`bg-reel01` 的硬编码优先级，也不能因当前 production fixture 恰好只有一套轮带就省略多 reel set 合同。

### 2.6 reel code 必须可展示

game config 允许包含未进入 symbol manifest display set 的辅助 symbol，但被选中的 reel set 用到的每个 code 都必须能映射到 package 中可展示的 symbol。

准备 reel set 时必须遍历其完整公开轮带并严格验证：

- code 在 game config paytable/symbolCodes 中存在；
- code 对应的 symbol 在 `resource.displaySymbols` 中；
- symbol 的 normal/value presentation 资源已由 `createSymbolPackageResource()` 严格创建。

任一 code 不可展示时，整个 reel set 标记为不可用并给出 reel set、列、轮带位置、code 和 symbol 的错误。不得跳过该格、使用空 symbol、用 displaySymbols 首项替代、按 code 字符串猜 symbol，或只在随机抽到该 code 后才偶发失败。

### 2.7 渲染语义

预览只请求 manifest 的 `normal` state，不执行 spin、appear、win、remove、dropdown、cascade、Nearwin、sequence 或 timeline。

每个可见格必须：

- 从随机 scene 的 code 经 `LogicGameConfig.getPaytableEntry(code)` 映射到 exact symbol；
- 通过 imported `SymbolPackageResource.createCatalog()` 和 catalog 的 `createRenderSymbol()` 创建 `RenderSymbol`；
- 复用 `createSymbolPackageValueControllerFactory()`；
- 使用 manifest-derived scale 和 renderPriority；
- cell center、stride、gap、grid placement、variant/world offset 全部使用 scene-layout runtime 的 `SceneLayoutSnapshot.reels.main`，不在 app 复制 viewport/art 映射公式；
- valuePresentation symbol 继续使用 manifest `defaultValues[0]`，本任务不随机 CN/CO 等 presentation value；
- 持续由现有 Pixi ticker 调用 `RenderSymbol.update()`，保证 normal Spine/VNI/value loop 正常推进。

symbol overlay 必须保持 manifest renderPriority 语义。同优先级使用稳定 row-major order；高 priority 覆盖低 priority。不得写 symbol code 专属 zIndex 分支。

### 2.8 随机 scene 的生命周期

随机 scene 不进入 `EditorProject`、layout manifest 或导出 ZIP，只是 preview session state。

以下边界必须生成新 scene：

- 成功导入一个新的 symbols package；
- 用户首次选择 reel set；
- 用户切换到另一个 reel set；
- 用户点击“重新随机”；
- layout grid 的 rows 改变，导致现有 scene 高度不再匹配；
- layout columns 改变且重新得到一个有效 reel set 选择。

以下操作不得悄悄重新随机：

- page size / preview preset 改变；
- zoom 改变；
- focus/reel guide 显隐；
- 横竖 variant 切换；
- art/focus/grid placement 改变但 rows/columns 未变；
- scene-layout runtime 因普通配置提交而重建。

因此 `LayoutPreview.applySize()` / relayout 必须复用当前 sampled scene；随机生成不能藏在每次 layout pass 都会调用的循环中。

### 2.9 原子替换和异步竞态

导入新 symbols ZIP 时，以下步骤必须在提交前全部成功：

1. bounded ZIP extract；
2. strict package/resource 创建；
3. package cellSize 在 layout clone 上覆盖并通过 art/focus 校验；
4. reel set compatibility 和完整 code-display validation；
5. catalog 创建；
6. 唯一兼容 reel set 的首次随机 scene 创建，或进入“等待显式选择”状态。

失败时必须保留旧 layout project、旧 symbols package、旧 catalog、旧随机 scene 和旧画面。不得先清旧画面再报错。

快速连续导入、切换 reel set、重新随机、替换 layout 或 destroy 时必须继续使用 request/revision token。过期异步结果必须自行 destroy，不能覆盖最新 package/scene。旧 `RenderSymbol`、catalog owner、texture、Spine/VNI player 和 Blob URL 必须被完整释放，destroy 保持幂等。

## 3. 当前实现基线

仓库路径：

```text
/Users/zerro/github.com/slotclientengine
```

制定本计划时：

```text
branch: main
HEAD: 36ca1a8fa30a18d74be467db21a8f5786cbd7f0e
git status --short: clean
Node.js: v24.14.0（Codex bundled runtime）
repo packageManager: pnpm@10.0.0
repo engines: Node >=24.0.0, pnpm >=10.0.0
```

执行任务时必须重新记录 branch、HEAD、`git status --short`、Node 和 pnpm 版本。已有修改和未跟踪文件都属于用户；禁止 reset、checkout、stash、clean、覆盖或顺手格式化范围外文件。

### 3.1 已有 symbols import

主要文件：

```text
apps/gamelayouteditor/src/io/imported-symbol-package.ts
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/tests/imported-symbol-package.test.ts
apps/gamelayouteditor/tests/layout-preview.test.ts
apps/gamelayouteditor/README.md
```

当前已经具备：

- 使用 `@slotclientengine/browserartifactio.extractBoundedZip()` 读取受限 ZIP；
- 严格要求根目录 `symbols.package.json`；
- 使用 rendercore `parseSymbolPackageManifest()` / `createSymbolPackageResource()`；
- package `cellSize` 覆盖 `main` grid cell width/height；
- 越出 art/focus 时失败且不 auto-fit；
- 独立 symbols resource/catalog 生命周期；
- 使用 `RenderSymbol` 在真实 scene-layout reel geometry 中显示 normal；
- value symbol 使用 `defaultValues[0]`；
- layout ZIP 与 symbols package 保持独立。

这些能力必须保留，不得为了“重写得更简单”退回 app 自己解析 manifest、自己加载 Pixi/Spine/VNI 或使用图片 fallback。

### 3.2 当前必须替换的旧行为

`LayoutPreview.layoutSymbolOverlay()` 当前使用：

```ts
const symbol = displaySymbols[index % displaySymbols.length];
```

也就是按 numeric-code 排序后的 display symbols 做 row-major 循环。它完全没有读取 ZIP 内 game config reels，也没有随机 stop。

本任务必须删除这一填充规则，并用第 2.3 节的 sampled public reel window 替代。README 和 `agents.md` 中当前“按 game config numeric code、row-major 显示”的旧合同也必须同步更新，不能让文档继续要求与代码相反的行为。

### 3.3 可复用公共 API

rendercore symbol package：

```ts
SymbolPackageResource.packageManifest;
SymbolPackageResource.gameConfig;
SymbolPackageResource.displaySymbols;
SymbolPackageResource.symbolManifest;
SymbolPackageResource.symbolScales;
SymbolPackageResource.symbolRenderPriorities;
SymbolPackageResource.createCatalog();
createSymbolPackageValueControllerFactory();
```

logiccore：

```ts
LogicGameConfig.getReelNames();
LogicGameConfig.getReels(name);
LogicGameConfig.getPaytableEntry(code);
LogicGameConfig.getSymbolCode(symbol);
LogicReels.getName();
LogicReels.getReelCount();
LogicReels.getLength(x);
LogicReels.get(x, y);
LogicReels.normalizeY(x, y);
```

scene layout：

```ts
SceneLayoutSnapshot.reels.main.columns;
SceneLayoutSnapshot.reels.main.rows;
SceneLayoutSnapshot.reels.main.cellSize;
SceneLayoutSnapshot.reels.main.stride;
SceneLayoutSnapshot.reels.main.viewportRect;
```

上述能力足以完成本任务。不得在 app 重新读取 `rawGameConfig.reels`，也不得复制 logiccore 的 reel index/range/wrap 校验。

## 4. 范围

### 4.1 包含

- gamelayouteditor 导入 symbolseditor ZIP 后，从 ZIP 的公开 local reels 生成静态随机 scene。
- reel set 兼容性验证和显式选择 UI。
- Web Crypto 随机 stop 与可注入测试随机源。
- “重新随机”按钮、当前 package/reel/stop/scene 诊断信息。
- ZIP cellSize 原子覆盖与现有 layout/focus 严格校验回归。
- code -> symbol -> RenderSymbol normal preview。
- resize/variant/zoom 时保持同一随机 scene。
- 资源、异步竞态和 destroy 生命周期。
- 单元测试、集成测试、浏览器人工验收。
- README 与 `agents.md` 合同更新。
- 中文任务报告。

### 4.2 不包含

- 不修改 symbolseditor ZIP schema 或导出 UI。
- 不把 rows/columns 写进 symbol package。
- 不做真实 reel spin 动画、blur、bounce、landing、appear 或 stop timing。
- 不接服务器、不请求 GMI、不建立 WebSocket。
- 不使用或模拟服务器真实轮带。
- 不做 win/cascade/nearwin/value collect/global win amount。
- 不随机 valuePresentation value；继续用 `defaultValues[0]`。
- 不修改 game002/game003 production reel manifest、symbol manifest、game config 或资源闭包。
- 不把 sampled scene 保存到 layout project、localStorage、IndexedDB 或 ZIP。
- 不做 layout + symbols 合并发布包。
- 不添加缺资源 placeholder、透明 PNG、默认 symbol、错误吞掉或旧格式 fallback。

## 5. 建议代码结构

具体文件名可按现有风格微调，但职责必须清楚，避免把随机、选择、渲染、DOM 和 ZIP IO 堆进一个方法。

```text
apps/gamelayouteditor/src/preview/random-reel-scene.ts
  - RandomUint32Source 窄接口
  - Web Crypto production source
  - unbiased bounded integer
  - inspect/validate reel set compatibility
  - sampleRandomReelScene() 纯函数

apps/gamelayouteditor/src/preview/layout-preview.ts
  - imported package/catalog owner
  - selected reel set 和 sampled scene/stopYs preview state
  - randomizeSymbols() public method
  - setSelectedReelSet() public method
  - 用 scene-layout snapshot relayout RenderSymbols
  - ticker/update/destroy

apps/gamelayouteditor/src/ui/app-shell.ts
  - ZIP 选择
  - package metadata
  - reel set dropdown
  - 重新随机按钮
  - 用户错误展示和 request token

apps/gamelayouteditor/tests/random-reel-scene.test.ts
  - 纯随机窗口和 strict validation

apps/gamelayouteditor/tests/layout-preview.test.ts
  - preview session、scene persistence、render/lifecycle

apps/gamelayouteditor/tests/app-shell.test.ts
  - reel selector、按钮状态、导入原子性
```

随机 scene sampler 是 gamelayouteditor 的 preview-session 需求，可先放 app 内纯模块；它只能调用 `LogicReels` public API，不能复制 reel parser 或 spin runtime。如果实施中发现另一个 production consumer 已需要完全相同的 API，再把纯 sampler 下沉到合适的 shared package并补公共测试；不要为了“可能复用”提前扩大 shared API。

## 6. 数据模型与 public preview API

建议为 preview 引入只读 session snapshot：

```ts
interface RandomReelSceneSnapshot {
  readonly reelSetName: string;
  readonly columns: number;
  readonly rows: number;
  readonly stopYs: readonly number[];
  readonly codes: readonly (readonly number[])[]; // [x][y]
  readonly symbols: readonly (readonly string[])[]; // [x][y]
}
```

`LayoutPreview` 至少需要表达以下动作，实际命名可调整：

```ts
setSymbolPackage(resource: SymbolPackageResource | null): Promise<SymbolPackagePreviewInfo>;
setSelectedReelSet(name: string): void;
randomizeSymbols(): void;
getSymbolPreviewSnapshot(): SymbolPackagePreviewSnapshot | null;
```

UI 不得直接访问 preview 私有 Pixi tree、catalog、RenderSymbol 数组或 raw game config。preview 返回的 metadata 应只包含 UI 需要的 package id、cellSize、reel set compatibility、selection、stop 和诊断。

`EditorProject` 不增加 reel set 或 sampled scene 字段；这些值不是 layout artifact 的一部分。

## 7. UI 交互

现有 “Symbols 预览包” panel 扩展为：

- “导入 symbols ZIP”按钮；
- “清除 symbols package”按钮；
- package id、cell width/height、display symbol count；
- reel set 下拉框；
- 每项显示 `name · N reels`，不兼容项禁用并注明原因；
- “重新随机”按钮；
- 当前 stopYs；
- 当前 scene 的简短 symbol matrix 或 code matrix；
- 明确错误/等待选择状态。

按钮规则：

- 未导入 package：选择器和重新随机禁用；
- 正在导入/切换：避免重复提交或用 request token 丢弃旧结果；
- 只有有效 reel set、有效 main grid 和已创建 catalog 时允许重新随机；
- 多个兼容 reel set 尚未选择时显示“请选择 reel set”，不是全局 fatal error；
- 选择非法/不兼容项必须拒绝，不能保留一个 UI 看似选中但 preview 使用其它 reel set 的分裂状态。

随机结果不要求持久化，刷新页面或重新导入后可产生新 scene。

## 8. 原子导入实施顺序

推荐把当前 `importSymbolsPackage()` 改造成 prepare/commit 两阶段：

### 8.1 Prepare

1. 读取 file bytes。
2. `importSymbolsZip()` 创建临时 `SymbolPackageResource`。
3. clone 当前 `EditorProject`。
4. 在 clone 上调用 `applySymbolPackageCellSize()`。
5. 从临时 resource 的 `gameConfig` 获取 reel names/models。
6. 依据 clone 的 columns/rows 构建 compatibility metadata。
7. 对所有准备提供选择的 reel set 执行完整 code-display validation。
8. 临时创建 catalog。
9. 若唯一兼容项，创建首次 sampled scene；若多个兼容项，创建明确的 pending-selection snapshot。

### 8.2 Commit

1. 确认 import request 仍是最新请求。
2. preview 原子接管新 resource/catalog/session state。
3. store replace 新 layout clone。
4. 更新 UI metadata。
5. 最后 destroy 旧 preview owner。

任何 prepare 失败或请求过期时只 destroy 临时 owner，不改现有可用状态。

如果当前 rendercore catalog API 只能由 preview 内部创建，可让 `LayoutPreview.prepareSymbolPackage()` 返回可提交 owner；不要为凑步骤把同一个 catalog/texture 加载两次。

## 9. 随机 scene 与 RenderSymbol 布局算法

1. sampler 生成 `[x][y]` code matrix 和 stopYs。
2. 一次性把所有 code 解析为 exact symbol，并冻结 snapshot。
3. preview 创建 `columns * rows` 个 `RenderSymbol`。
4. row-major 稳定顺序定义为 `orderIndex = y * columns + x`。
5. position 使用：

```ts
x = reel.viewportRect.x + column * reel.stride.width + reel.cellSize.width / 2;
y = reel.viewportRect.y + row * reel.stride.height + reel.cellSize.height / 2;
```

6. scale 使用 package manifest-derived scale。
7. z-order 使用 manifest-derived renderPriority 加稳定 orderIndex，不硬编码 symbol。
8. value presentation 使用 `defaultValues[0]`。
9. 调用 `init()`，加入 overlay，并由 ticker update。

当只是 viewport/variant/placement 改变时，应使用同一 snapshot 重新定位或重建同一组 symbol code；不得重新 sample。实现可以安全重建 RenderSymbols，但必须保留 code matrix，并正确 destroy 旧 player。

## 10. 严格错误合同

至少覆盖以下错误并提供可定位信息：

- ZIP 缺 `symbols.package.json`；
- invalid JSON / invalid symbol-package v1；
- package cellSize 非有限正数；
- cellSize 覆盖后 grid 越出 art/focus；
- game config 没有 reel set；
- 没有 reel count 与 grid columns 匹配的 reel set；
- 多个兼容 reel set 尚未选择；
- reel length 为 0 或 API 返回非法长度；
- reel 中 code 不在 paytable/symbolCodes；
- reel code 对应 symbol 不在 display set；
- Web Crypto 不可用；
- random source 返回非法值；
- catalog/texture/Spine/VNI/value resource 初始化失败；
- sampled scene shape 与当前 grid 不一致；
- 过期 import/randomize 结果试图提交。

不得捕获后继续画上一半新、一半旧的 symbol grid。错误恢复只能保留上一个完整可用状态，或在没有旧状态时明确清空 overlay。

## 11. 测试计划

测试的职责是验证正确设计，不得为了迁就旧断言而在 production 保留 code-order fallback、固定 stop 或其它奇怪分支。若旧测试要求旧行为，应修改测试以表达本任务新合同。

### 11.1 random reel scene 单元测试

新增纯函数测试，至少覆盖：

1. 注入确定性随机源后，每列 stop 落在 `[0, length)`。
2. 每格 code 等于 `reels.get(x, stopY + y)`。
3. rows 跨轮带尾部时正确回绕。
4. 不同列长度分别采样。
5. stop 边界 `0` 与 `length - 1`。
6. unbiased bounded integer 的 rejection 分支。
7. invalid random source 显式失败。
8. Web Crypto 缺失时不退回 `Math.random()`。
9. reel count/columns mismatch 显式失败。
10. reel 中不可展示 code 在 sampling 前完整失败。
11. sampled scene/symbol matrix 冻结或不被外部修改。

### 11.2 import 与 model 回归

在现有测试上补：

- package cellSize 同时覆盖 width/height；
- 保留 rows/columns/gap/placement；
- focus 重新派生；
- 越界时原 project 完全不变；
- ZIP 资源和 layout ZIP 仍独立；
- transparent-only package 仍可导入，但 reel code 必须映射到 explicit empty normal，而不是资源错误 fallback。

### 11.3 LayoutPreview 测试

至少覆盖：

- unique compatible reel set 自动生成 scene；
- multiple compatible reel sets 等待选择；
- setSelectedReelSet 后生成 scene；
- randomize 只替换 scene/RenderSymbols，不重建 package catalog；
- resize、zoom、guide、variant 和普通 relayout 保持 stopYs/codes；
- rows 变化重新生成匹配高度的 scene；
- columns mismatch 暂停 overlay并报告错误；
- code -> symbol 映射来自 paytable，不来自 display order；
- position 使用 runtime snapshot 的 viewportRect/stride/cellSize；
- value symbol 使用 `defaultValues[0]`；
- scale/renderPriority 来自 manifest；
- stale async package 被丢弃并 destroy；
- clear/destroy 幂等释放 package 和 RenderSymbols。

### 11.4 App shell 测试

补充 DOM 行为：

- import/clear/randomize 控件可访问；
- metadata 显示 package/reel count/cellSize；
- 唯一兼容项自动选中；
- 多兼容项必须由用户选；
- 不兼容项 disabled 且原因可见；
- randomize 按钮状态正确；
- 点击 randomize 调用 preview public API；
- 导入失败保留旧 metadata 和旧画面；
- 快速连续导入只提交最新请求。

### 11.5 production fixture / integration

至少使用两类 fixture：

1. 小型内存 ZIP：轮带长度短、可精确断言 stop/window/wrap。
2. 真实项目兼容性：
   - game002 `reels-001` 为 6 reels，配 6-column layout；
   - game003 `bg-reel01` 为 5 reels，配 5-column layout。

真实 fixture 只读取仓库已有公开 game config/symbol manifest/资源，不修改 production 资源，不生成或缓存服务器轮带。

## 12. 文档与 agents.md

更新：

```text
apps/gamelayouteditor/README.md
agents.md
```

README 必须说明：

- 如何从 symbolseditor 导出并导入 ZIP；
- package cellSize 覆盖 main grid cell size；
- rows/columns/gap/placement 仍由 layout 拥有；
- reel set 选择规则；
- 随机 stop/连续窗口算法；
- 重新随机按钮；
- resize/variant 不重抽；
- normal-only 和 value `defaultValues[0]`；
- layout ZIP 不包含 symbol resources。

`agents.md` 当前明确要求 gamelayouteditor 按 code-order、row-major 填充，这与本任务目标冲突，因此本任务有必要同步更新。新规则应固化：

- symbols ZIP `cellSize` 继续原子覆盖；
- preview 从 ZIP 唯一公开 game config 的显式 reel set 按列随机 stop 并连续取 rows；
- production 使用 Web Crypto，测试随机源可注入，不使用 `Math.random()`；
- 多 reel set 不猜默认，不匹配 columns 显式失败；
- reel code 必须属于 package display set；
- resize/variant 不重新抽样；
- value symbol 仍用 `defaultValues[0]`；
- layout ZIP 不嵌入 symbols 数据。

不要把实现细节、临时类名或测试 fixture 名写成长期仓库规则。

## 13. 实施阶段

### 阶段 A：基线与合同锁定

1. 记录 branch、HEAD、status、Node、pnpm。
2. 运行 gamelayouteditor 当前 lint/typecheck/test/build，记录基线失败。
3. 阅读本计划列出的现有 import/project/preview/UI 和 shared public API。
4. 先补 random sampler 和新 preview contract 的失败测试。

### 阶段 B：纯随机场景模块

1. 定义 injectable random source。
2. 实现 Web Crypto unbiased integer。
3. 实现 reel set compatibility inspection。
4. 实现完整 code-display validation。
5. 实现 sampled stop/code/symbol snapshot。
6. 完成纯单测。

### 阶段 C：Preview session 重构

1. 将 package/catalog、selection、sampled scene 分层管理。
2. 用 sampled scene 替换 `displaySymbols[index % length]`。
3. 实现 randomize 和 reel selection public API。
4. 保证 relayout 保留 scene，rows/columns 变化按合同处理。
5. 补 scale/priority/value/ticker/lifecycle 测试。

### 阶段 D：UI 与原子导入

1. 增加 reel selector、重新随机和诊断。
2. 把 import 改为 prepare/commit，保留旧状态直到新状态完整可用。
3. 完成 button states、错误和 race handling。
4. 补 app-shell 测试。

### 阶段 E：文档、规则与集成验收

1. 更新 gamelayouteditor README。
2. 更新 `agents.md` 的旧 code-order 合同。
3. 使用小 fixture、game002、game003 验证。
4. 运行专项与根级门禁。
5. 执行浏览器人工验收。
6. 写 UTC 中文任务报告。

## 14. 自动化验收命令

执行时使用仓库要求的 Node.js `>=24.0.0` 和 pnpm。至少运行：

```bash
pnpm --filter gamelayouteditor format:check
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build
```

若修改 shared package，还必须运行对应包，例如：

```bash
pnpm --filter @slotclientengine/logiccore format:check
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore build

pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build
```

最终运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

根级 `format:check` 若被任务范围外既有文件阻断，应记录首个错误及相关文件，不得顺手格式化范围外代码。任务涉及文件和涉及 package 的 format check 必须通过。

如果依赖安装或下载失败，使用：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

不得改用 npm/yarn，不得删除 lockfile，也不得用不受控升级掩盖下载问题。

## 15. 浏览器人工验收

至少在 Chromium 系浏览器执行：

### 15.1 game002

1. 在 symbolseditor 导出包含 game002-s3 display symbols 和公开 `gameconfig.json` 的 ZIP。
2. 新建/导入一个 6-column layout。
3. 导入 symbols ZIP。
4. 确认 `cellWidth/cellHeight` 被 ZIP 值覆盖，rows/gap/placement 不变。
5. 确认唯一兼容 `reels-001` 自动选中。
6. 确认画面 symbols 与显示的 stopYs 对应公开轮带连续窗口。
7. 多次点击“重新随机”，确认 scene 改变且资源不重复加载/泄漏。
8. 调整 zoom、页面尺寸、variant、focus/placement，确认当前 scene 不变。
9. 确认 CN normal/value player 使用 `defaultValues[0]` 并持续更新。

### 15.2 game003

1. 导出 game003-s1 symbols ZIP。
2. 使用 5-column layout 导入。
3. 确认 `bg-reel01` 自动选中。
4. 确认 WL/H/L/CO/CL/SC 等按轮带窗口出现，且 manifest scale/renderPriority 生效。
5. 调整 rows 后确认重新抽取正确高度的连续窗口。

### 15.3 失败路径

1. 5-column layout 导入仅有 6-reel set 的 package，确认明确不兼容且旧 package/scene 保留。
2. 多个兼容 reel set 时确认必须显式选择。
3. 构造 reel 含非 display symbol 的合法 game config/package，确认在选择/抽样前失败。
4. 构造坏 ZIP、缺资源、错误 Spine/VNI，确认无 fallback。
5. 快速连续导入两个 ZIP，确认最后一次请求获胜且无旧画面闪回。
6. 清除 package，确认 symbols/player/URL 被释放，但 cell size 不回滚。
7. 导出 layout ZIP，确认其中没有 game config、symbols manifest、sampled scene 或 symbol resources。

人工验收必须在报告中记录浏览器版本、使用的 package/layout、通过项、失败项和截图/控制台关键信息（若有）。不能用 jsdom 单测代替真实 Pixi/Spine/VNI 浏览器播放验收。

## 16. 完成定义

仅当以下条件全部满足，任务才算完成：

- symbolseditor 导出的 strict ZIP 可被 gamelayouteditor 导入；
- ZIP cellSize 原子覆盖 main grid cell width/height；
- rows/columns/gap/placement 保持 layout-owned；
- preview 使用 ZIP 内公开 reel set 的随机 stop/连续窗口，不再 code-order 循环；
- 多 reel set、列数不匹配、不可展示 code 都按严格合同处理；
- production 默认 Web Crypto，测试可注入，不使用 `Math.random()` fallback；
- 重新随机可用，resize/variant/zoom 不隐式重抽；
- normal RenderSymbol、value default、scale、priority、ticker update 正确；
- import/race/destroy 生命周期无旧状态覆盖和资源泄漏；
- layout ZIP schema/closure 未改变；
- 测试、lint、typecheck、build 和 diff check 通过，或仅有明确记录的范围外基线问题；
- README 与 `agents.md` 已更新；
- 浏览器人工验收结果已记录；
- 已生成符合命名规则的 UTC 中文任务报告。

## 17. 任务报告内容要求

任务报告至少包含：

- UTC 完成时间、branch、起始/最终 HEAD、Node、pnpm；
- 起始和最终 `git status --short`；
- 实际修改文件；
- 最终 random stop/window/reel selection 合同；
- cellSize 原子覆盖结果；
- 新旧 preview 行为对比；
- 关键测试及 coverage；
- 专项和根级门禁结果；
- 代理是否使用；
- game002/game003 浏览器验收结果；
- 已知限制、未完成项和范围外问题；
- `agents.md` 是否更新及原因。

报告不得把“计划完成”“自动化通过”或“代码写完”冒充浏览器人工验收通过。
