# Task 119：四个 Editor 统一扁平文件名资源库任务计划

## 1. 任务目标

本任务统一以下四个纯前端 editor 的资源管理语义、规则、共享模型、导入事务和导出解析：

```text
apps/imgnumbereditor
apps/popupeditor
apps/symbolseditor
apps/gamelayouteditor
```

任务完成后，四个 editor 必须遵守同一条资源身份链：

```text
用户文件名（唯一 key）
  BG.jpg
    -> assets.map.json
      -> assets/<完整 64 位 lowercase SHA-256>.jpg
```

`BG.jpg` 是工作区内唯一、稳定、用户可见的资源 key。所有 editor draft、Picker、layer、state、node、dependency
配置和导出的格式配置都继续引用 `BG.jpg`；hash 只属于 owned payload 的物理存储与精确 bytes 去重，不得再成为用户看到的资源名，
也不得再增加独立的 editor-only logical resource id。

任务同时完成以下产品行为：

1. 每个 editor 只有一个工作区资源库，资源库完全扁平，不保存用户目录层级。
2. 每个 editor 只有一个统一的“导入资源”入口；允许一次选择多个文件，也允许把 ZIP 作为传输容器导入。
3. 删除“上传文件夹”和全部 `webkitdirectory` / directory-handle 路径；文件夹不再是产品资源单位。
4. 同名文件必须先展示覆盖影响；默认主操作是覆盖。覆盖只更新该文件名的 map entry，所有引用因继续使用同一个 key
   自动取得新 bytes，不生成副本、不追加 `-2/-3`、不要求逐引用重绑。
5. ZIP 内的目录只允许在导入解析阶段帮助 format adapter 找到精确闭包；提交工作区前必须抹平。配置内的结构化路径也必须改写为
   扁平文件名 key。
6. VNI ZIP 若声明多个尺寸/profile，必须让用户明确选择本次导入的尺寸；只提交被选 profile 的精确 JSON 与 asset closure。
7. 完整 SHA-256、bounded ZIP、严格 parser、精确传递闭包、deterministic export、原子事务和 runtime 表现全部保留。

本任务定向替代 Task 110 中“来源名称 -> logical resource id -> hash path”的三层身份模型。Task 110 已建立的安全、严格解析、
内容寻址和精确闭包能力继续复用；其 kebab-case logical id、目录上传、冲突禁止覆盖、nested dependency 独立资源目录和导出配置直接写
hash path 的规则不再适用于本任务完成后的四个 editor。

本文件是完整实施合同。执行者可以阅读历史任务了解基线，但不得依赖聊天记录或 Task 110 补齐新行为；发生冲突时以本文件为准。

任务完成后必须新增中文执行报告：

```text
tasks/119-editor-unified-flat-filename-resource-library-[utctime].md
```

UTC 时间戳使用：

```bash
date -u +%y%m%d-%H%M%S
```

## 2. 范围与明确排除

### 2.1 纳入范围

- 四个 editor 的 project/draft resource model、store transaction、引用图、资源列表、Picker 和 preview 输入。
- 把不符合仓库全小写 app 目录规范的 `apps/Imgnumbereditor` 重命名为
  `apps/imgnumbereditor`；package name 继续使用既有的 `imgnumbereditor`。
- 四个 editor 的 files/ZIP discovery、import review、冲突处理、覆盖、显式改名、删除、bytes 去重和 unused GC。
- ImgNumber、Popup、Symbols、Game Layout 的 ZIP import/export 与 CDN/package resource resolution。
- image、MP4、Spine、VNI、image-string 及 symbols/popup/layout dependency 的结构化文件引用改写。
- `packages/browserartifactio` 已有的 ZIP/path/hash 基础能力。
- 新增共享、无 UI renderer 的 `packages/editorresource`（package name 固定为
  `@slotclientengine/editorresource`），承载四个 editor 唯一的一套资源工作区语义和事务逻辑。
- 必须配合新 `assets.map.json` 的 `packages/rendercore` / `packages/vnicore` format owner 与 package loader 最小改动。
- 依赖四个 editor 导出物的 viewer、game app 和生成器回归，但不借机重写其业务逻辑。

### 2.2 明确排除

以下两个目录是 runtime/历史参考代码，不是本任务 editor，不迁移、不重构、不加入 UI 或 source-boundary 门禁：

```text
docs/anieditor5
docs/victory_editor_v2
```

`apps/anieditorv5viewer` 和 `apps/symbolsviewer` 是 consumer/viewer，不做资源管理 UI 统一；只在其消费路径被格式变更影响时做必要回归。

本任务还不实现：

- texture atlas packing、图片/视频转码、压缩质量调整、远端上传、CDN 发布或云端资源库；
- 文件夹、目录标签、虚拟目录、collection、namespace 或用 `/` 模拟目录；
- 根据文件名猜 symbol code、animation、slot、tier、mode、background 或其它业务绑定；
- 自动创建 layer/state/node/placement，或改变现有显式绑定产品语义；
- 修改 Pixi 几何、Spine/VNI 播放、scene transition、reel、popup tier、image-string layout 或游戏业务时序；
- 批量转换仓库 `assets/` 下所有现有 production 素材。旧生产包必须继续由 legacy 路径加载；只有 editor 新导出使用新 map 合同。

## 3. 制定计划时的仓库基线

制定本计划时现场为：

```text
repository: /Users/zerro/github.com/slotclientengine
branch:     main
HEAD:       c01884c
status:     clean
upstream:   main...origin/main [ahead 5]
date:       2026-07-22 (Asia/Shanghai)
```

Task 117、118 已有计划与报告；Task 119 在制定本计划时未被占用。

实施开始必须重新记录：

```bash
git status --short --branch
git rev-parse HEAD
node --version
pnpm --version
```

上述基线仅是计划制定现场，不能覆盖用户后续修改。工作区已有修改和 untracked 文件全部视为用户输入；禁止 reset、stash、clean、
checkout 覆盖或无关批量 format。仓库要求 Node.js `>=24.0.0` 且使用 pnpm。如果实施 shell 中没有 `node`，先执行：

```bash
nvm use 24
```

之后从基线、开发到最终验收必须统一使用这套环境自带、实际解析到的 `node` 和 `pnpm`，并记录它们的真实版本。不得因为计划制定环境、
Codex bundled runtime、根 `packageManager` 字段、lockfile 元数据或工具提示而强制安装、升级、降级、切换 Node/pnpm，也不得运行只为调整
版本而重建 `node_modules` 的命令。除非正常任务命令明确证明依赖缺失，否则不要执行 install；不得更换包管理器或降低 engines。
lockfile 只允许因 `apps/Imgnumbereditor` -> `apps/imgnumbereditor` 的真实 workspace importer 重命名及任务内必要依赖变更产生最小更新，
不得夹带 pnpm 版本转换或无关元数据漂移。

实施前至少重新阅读：

```text
AGENTS.md
tasks/110-editor-resource-management-unification.md
packages/browserartifactio/src/**
packages/browserartifactio/tests/**
packages/rendercore/src/image-string/**
packages/rendercore/src/popup/**
packages/rendercore/src/symbol/**
packages/rendercore/src/scene-layout/**
packages/vnicore/src/**

apps/imgnumbereditor/README.md
apps/imgnumbereditor/src/{model,io,ui}/**
apps/imgnumbereditor/tests/**

apps/popupeditor/README.md
apps/popupeditor/src/{model,io,ui}/**
apps/popupeditor/tests/**

apps/symbolseditor/README.md
apps/symbolseditor/src/{model,io,ui}/**
apps/symbolseditor/tests/**

apps/gamelayouteditor/README.md
apps/gamelayouteditor/src/{model,io,ui}/**
apps/gamelayouteditor/tests/**

docs/image-string-manifest.md
docs/symbol-package.md
docs/scene-layout-manifest.md
```

## 4. 已确认的当前问题

当前四个 editor 已经共享部分 `browserartifactio` 原语，但资源身份和产品行为仍各自实现：

- ImgNumber Editor 保存 image id、originalName、glyph path、hash path 和文件夹上传；glyph 语义与 image logical id 分离。
- Popup Editor 保存 `PopupEditorLogicalResource.id`、blob map、packageFiles 和 paths，并分别实现 file/folder import 与同类替换。
- Symbols Editor 以 package/source path 为 asset record key，保留 upload batch 与目录，并在 app 内组合 Spine/VNI/image-string dependency。
- Game Layout Editor 保存 typed logical resource id，lowercase 文件名、自动派生 id，历史代码仍存在 `-2/-3` 分配与多种上传入口。
- 四个 app 的 collision、overwrite、引用影响、ZIP 分类、review、commit 和 GC 不是同一个实现。
- 新导出的结构化配置普遍直接引用 hash-flat path；再次导入时用户只能看到 hash，原始文件名身份丢失。
- Game Layout 当前还把 symbols/popup dependency 作为自包含子目录 vendor；这与“一个工作区只有一个扁平资源区”冲突。

本任务不能在现有三层模型外再增加一层 alias。最终只有两层：

```text
filename key -> content-addressed payload
```

format descriptor/group、preview owner、node id、symbol code、state id、popup id、package id 都可以继续存在，但它们不是资源身份，不能成为
`BG.jpg` 之外的第二个资源 key。

## 5. 统一文件名 key 合同

### 5.1 key 的定义

共享类型语义至少为：

```ts
type EditorAssetKey = string;

interface EditorAssetEntry {
  readonly key: EditorAssetKey; // 例如 BG.jpg
  readonly sha256: string; // 64 位 lowercase hex
  readonly payloadPath: string; // assets/<sha256>.<canonical-extension>
  readonly mediaType: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}
```

文件名 key 必须：

- 是 Unicode NFC 后的单个 basename；不允许 `/`、`\`、NUL、control character、空字符串、`.` 或 `..`。
- 保留用户可见的大小写、空格、下划线和合法 Unicode；不自动 lowercase、不转 kebab-case、不删除扩展名。
- 必须有与真实内容类型兼容的扩展名。类型来自 bytes/parser/decode，不盲信 `File.type` 或扩展名。
- 在同一工作区内唯一。为避免 ZIP、Windows、macOS 和 CDN 大小写差异，NFC 相同或 ASCII case-fold 相同的两个 key 不得共存。
- case-only incoming collision 进入同名覆盖审查；覆盖时默认保留工作区现有 key 的拼写。用户可通过显式改名操作改变拼写。

以下行为全部禁止：

```text
BG.jpg -> bg
BG.jpg -> bg.jpg
BG.jpg -> bg-2
BG.jpg -> resource-17
BG.jpg -> assets/<hash>.jpg 作为配置引用
```

合法行为是：

```text
配置引用: BG.jpg
map key:  BG.jpg
payload:  assets/<hash>.jpg
```

### 5.2 文件名是唯一身份，不再保留 logical resource id

- image 和 MP4 直接以自身 filename key 绑定。
- Spine 绑定直接保存 skeleton、atlas 和各 page 的 filename key；可在 UI 显示为一组，但组是结构化引用的派生视图，没有独立 id。
- VNI 以 project JSON filename key 作为 root，asset closure 从 JSON 明确引用派生。
- image-string 以其 manifest filename key 作为 root，glyph keys 从 manifest 明确引用派生。
- Popup manifest 的 `resources` key、layer resource ref 必须等于对应资源 root filename key，不能另存任意 logical id。
- Symbols state/value/image-string binding 直接引用明确的 filename key 或 typed key 组合。
- Game Layout node/background/transition 直接引用明确 filename key/typed key 组合；稳定 node id 仍按 mode/variant 合同生成，与资源名无关。
- symbols/popup/package id 继续表达业务 package 身份，但不能代替或映射为资源 identity。

如果底层 production schema 仍需要一个 resource dictionary，dictionary key 必须是 root filename key；禁止保存
`resourceId -> filename -> hash` 三跳结构。

### 5.3 `assets.map.json`

四个 editor 新导出的 ZIP 必须在 package 根包含统一 sidecar：

```json
{
  "version": 1,
  "kind": "editor-assets",
  "files": {
    "BG.jpg": {
      "path": "assets/0123456789abcdef...64hex....jpg",
      "sha256": "0123456789abcdef...64hex...",
      "mediaType": "image/jpeg",
      "byteLength": 123456
    }
  }
}
```

具体 JSON key 顺序由 deterministic serializer 固定，但语义必须满足：

- `files` 以 filename key 索引，不能以 hash、logical id 或 source path 索引。
- `path` 必须与 `sha256 + canonical extension` 精确一致，且只允许根 `assets/` 下单层 hash 文件。
- map 中两个 filename key 可以在 bytes 完全相同时指向同一 payload，ZIP 只保存一份 bytes。
- map 声明的每个 payload 必须存在且 SHA-256、byteLength、mediaType 全部验证；orphan payload 和未解析 map entry 必须失败。
- `assets.map.json` 是 package control metadata，本身不加入自己的 map。
- root format manifest 仍是 package sentinel；其中所有资源引用写 filename key，通过同级 `assets.map.json` 解析。
- 新格式不得混用“部分 filename key 经 map、部分直接 package path”。有 map 时资源引用全部走 map；无 map时才是完整 legacy package。

inner image-string/popup/symbol/scene-layout manifest 默认保持现有 schema version，只扩展 package resolution 合同。若严格类型证明某 schema
无法表达 filename key，才允许做最小、向后兼容的 schema 扩展，并在报告中列出证据；不得建立平行的 app-only manifest。

### 5.4 exact closure、bytes 和 GC

- hash 基于最终 canonical bytes；使用 Web Crypto SHA-256，完整 64 位 lowercase hex，不截断。
- image/MP4 使用原始验证后 bytes；JSON/atlas 只有在结构化引用需要扁平化/改名时才通过 format owner serializer 生成 canonical bytes。
- 同 bytes + canonical extension 复用同 payload；同 path 不同 bytes 按 digest collision 显式失败。
- editor 工作区可保存未绑定文件，但 production export 只包含 root config 传递可达的 exact closure。
- 删除或覆盖后，对不再被任何 filename key 映射的 payload 做 GC；仍被其它 key 映射时保留。
- Object URL、Pixi Texture、Spine/VNI player、decoded metadata cache 不进入 map/hash/ZIP，并按原 owner 生命周期释放。

## 6. 一个共享资源工作区实现

### 6.1 新包 `@slotclientengine/editorresource`

新增：

```text
packages/editorresource
```

该包是 browser-safe、无 Pixi、无 DOM renderer、无 Node fs、无游戏业务的 headless 共享核心。它依赖
`@slotclientengine/browserartifactio`，拥有：

- `EditorAssetKey` 校验、NFC/case-fold collision 与显式改名规则；
- `assets.map.json` parser、validator、deterministic serializer 和 resolver；
- filename key -> immutable bytes/metadata/payload 的工作区 store；
- bounded multi-file 与 ZIP source session；
- import candidate/review/conflict/overwrite/rename/delete 的统一 command 与状态机；
- batch 内和现有 workspace 冲突分析；
- generic structured reference graph、受影响引用汇总、exact closure 和 payload GC；
- adapter composition contract、profile choice、原子 prepare/commit/rollback；
- export materialization 计划，不直接拥有具体 format parser。

四个 app 只能配置“允许哪些 adapter / 如何把已解析 root 绑定到自己的 draft”，不得各自复制 key validation、hash、map、冲突、
overwrite、review、commit、GC 或 ZIP source orchestration。

### 6.2 `browserartifactio` 边界

`@slotclientengine/browserartifactio` 继续拥有：

- bounded ZIP extract / deterministic ZIP create；
- package path 和 zip-slip 安全；
- Web Crypto SHA-256、bytes equality、content-addressed payload path；
- revocable Object URL registry 等通用底层原语。

现有 `suggestLogicalResourceId()`、`assertLogicalResourceId()`、directory source 身份等 Task 110 API 在四个 app 迁移后不得继续被生产代码调用。
若全仓无其它合法 caller，应删除；若为旧 consumer 暂留，必须标记 legacy 且 source-boundary 测试禁止四个 editor/new shared package 使用。

### 6.3 format adapter 边界

共享核心只定义 adapter interface；格式 owner 继续解释真实资源结构：

```text
packages/rendercore/image-string
  manifest、glyph closure、尺寸与 package validation

packages/rendercore/popup
  popup resource/layer closure、strict award-celebration package

packages/rendercore/symbol
  symbol package、Spine/VNI/image-string binding 与 exact closure

packages/rendercore/scene-layout
  layout、symbols/popup dependency、background/transition closure

packages/vnicore
  VNI schema、明确 asset refs、bundle profile/scale 元数据
```

adapter 必须返回 typed root、明确依赖边、可结构化改写字段、diagnostic 和 project validator。禁止 generic JSON 字符串替换、regex 猜未知字段、
basename fallback、宽泛 glob 或把 runtime display tree 暴露给 editor。

### 6.4 compound resource 不是第二层身份

UI 可以显示：

```text
BG.json (Spine)
  BG.atlas
  BG.png
```

但实际身份始终是三个 filename keys；“Spine”只是一份由 adapter 验证的 bindable descriptor。覆盖 `BG.png` 后所有引用该 key 的
Spine/VNI/image/image-string 配置都看到新 bytes，并由全项目 validator 决定能否提交。

同理，VNI root、image-string root、symbols dependency 和 popup dependency 可以在 UI 折叠显示 closure，但不能拥有隐藏 logical id、
独立 blob namespace 或子目录资源库。

## 7. 统一导入流程

### 7.1 唯一入口

四个 editor 都只提供：

```text
导入资源
```

文件 input 必须 `multiple`，可选择普通文件和一个或多个 ZIP。删除：

- “上传文件夹”；
- `webkitdirectory`、directory picker、directory drag/drop；
- image/Spine/VNI/ImgNumber 的平行上传实现；
- resource row 上拥有不同规则的“同类替换”；
- Game Layout 中绕过统一 importer 的 Symbols/Popup ZIP 安装逻辑。

上下文 Picker 可提供“导入并选择”的快捷入口，但必须调用同一个 shared controller、展示同一个 review，并在成功后仍要求用户明确确认绑定；
不能另写一套上传或直接 mutation。

### 7.2 discovery 与识别

一次导入 session 的顺序固定为：

```text
选择多个 files/ZIP
  -> 文件数/单文件/总 bytes 预检查
  -> bounded 解 ZIP
  -> adapter 识别 root 与 exact source closure
  -> 如有 VNI profile，等待用户选择
  -> 把全部引用结构化改写为 filename key
  -> 计算最终 canonical bytes 与完整 SHA-256
  -> 与 workspace 做全局冲突和引用影响分析
  -> 展示一次统一 review
  -> 对候选 workspace 跑完整项目 validator/preview prepare
  -> 单次 transaction commit 或完整 rollback
```

识别必须依赖 bytes、strict schema、root sentinel 和精确引用，不按上传顺序或 filename stem 猜格式。普通 raster/MP4 仍核对 magic、decode、
尺寸/metadata；Spine 必须严格配齐 skeleton/atlas/pages；VNI/image-string/Popup/Symbols/Layout 必须通过各自 owner parser。

ZIP 是传输和原子校验容器，不是工作区目录。ZIP 中的内部目录只在 source resolution 阶段存在；commit 后资源 key 全是 basename，
结构化 JSON/atlas ref 全部改写为对应 basename key，source directory 和 provenance 不进入 config/map/export。

### 7.3 VNI 尺寸/profile 选择

- 直接导入单个 VNI JSON + assets 且只有一份明确 closure 时，无需伪造 profile。
- VNI ZIP 声明多个合法尺寸/profile 时，review 必须列出声明名称、scale/size、root JSON 和预计 bytes，让用户明确选择一个。
- 不能默认选 100%、第一个、最小、最大或上次选择；未选择时确认按钮 disabled。
- 只物化所选 profile 的 root JSON 与精确 asset closure；其它尺寸不进入 workspace，也不能变成同名冲突。
- 若 ZIP 含多个独立 VNI project，每个 project 都必须有明确 root/profile 选择；不能用目录名或唯一 JSON 猜业务绑定。
- VNI JSON 中 `assets/foo.png` 等引用由 vnicore adapter 精确改写为 `foo.png`，不保留 `assets/` 前缀。

### 7.4 flatten collision

同一导入批次/ZIP 内如果多个 source path 抹平后得到同一个 filename key：

- bytes、类型和 canonical result 完全相同：合并为一个 key，并在 review 显示多个来源；
- bytes 不同：不得按遍历顺序选 winner，不得生成 suffix；review 必须要求用户选择 profile/source 或显式给其中一个改名；
- case-only/NFC collision：按同名冲突处理，不允许共存；
- 改名后 adapter 必须结构化重写所有指向该文件的引用并重新计算受影响 JSON/atlas 的 hash。

未知 ZIP、递归 ZIP、缺 root、缺 dependency、orphan、ambiguous parser、无法安全扁平化的相对引用均显式失败；不得静默忽略
`.DS_Store`、`__MACOSX` 或多余文件来伪造精确闭包。

## 8. 同名覆盖、改名与删除

### 8.1 同名覆盖是默认主操作

当 incoming key 已存在且 bytes 不同，统一 review 至少显示：

```text
文件名
旧/新类型、尺寸或媒体 metadata
旧/新 SHA-256（可折叠显示）
旧/新 byteLength
全部直接和传递引用位置
候选项目 validation 结果
```

按钮语义统一为：

```text
主操作：覆盖同名文件
次操作：修改导入文件名
取消：不修改工作区
```

覆盖提交时：

- filename key 和所有 config ref 保持不变；
- 只更新 key -> payload 的 map entry 与 metadata；
- 所有绑定该 key 的 layer/state/node/dependency 自动使用新 bytes；
- 旧 payload 无其它 key 引用时 GC；
- 不复制引用、不生成新 resource、不逐 node 重绑、不静默改变 node/state/package id。

“默认覆盖”不等于跳过严格校验。共享核心必须先在候选 workspace 上执行所有 format/project validator。若新图片尺寸、Spine
animation/slot、VNI closure、image-string glyph 或 MP4 metadata 令现有配置非法，review 显示精确阻断原因且不能提交。允许的尺寸变化继续遵守
各 editor 已有 art/focus/placement 明确确认合同，但不能通过复制资源绕过全局同名语义。

若同一批次有多个已确认覆盖，必须一起提交或一起 rollback。

### 8.2 显式改名

资源管理区提供共享“改名” command，或在 import review 中编辑 target filename。改名是 key mutation，必须：

- 校验新 key 唯一、类型扩展名兼容；
- 原子改写所有 typed config refs；
- 通过 format adapter 精确改写 VNI JSON、Spine atlas、image-string/popup/symbol/layout manifest 中的路径字段；
- 自叶子向 root 重算所有被改写 structured bytes 的 hash/map；
- 候选项目完整 validation 通过后一次提交；
- 不改 animation、slot、skin、layer、tier、symbol、mode、node 或其它非路径字段。

禁止自动改名、自动 lowercase、自动 suffix、随机/时间戳名称或 generic 文本替换。

### 8.3 删除

- 有直接或传递引用的 filename key 默认不能删除，错误列出精确引用位置。
- 用户先显式解除业务绑定后才能删除；不得自动删 layer/state/node/dependency。
- 删除无引用 key 后清理 map entry，并仅在没有其它 filename key 指向时清理 payload。
- 删除 compound root 不得顺手删除仍被其它 root 引用的共享 leaf；可提示本次产生的 unused keys，由用户确认单独删除。

## 9. 四个 Editor 的具体迁移

### 9.1 ImgNumber Editor

- 删除 `UploadedImageDraft.id` 作为资源身份；pending image/glyph image 以实际 filename key 索引。
- Unicode character、glyph offset、fixed advance 继续是 image-string 业务配置，不与资源 key 混用。
- 字符建议仍可从 basename 推导，但只是 UI 建议，不改文件名、不自动绑定。
- glyph manifest 的 `path` 写 filename key；ZIP 由 `assets.map.json` 解析到 hash payload。
- 同名 glyph 图片覆盖后，所有使用该 key 的 glyph 自动取得新 bytes；字符、offset、fixed group 保持，完整尺寸/manifest 校验后提交。
- 一个 filename key 可被多个字符引用；多个不同 filename keys 若 bytes 相同可指向同一 payload。
- 导入自身 ZIP、批量图片和替换全部走统一 importer；移除文件夹入口和独立 logical image id prompt。

### 9.2 Popup Editor

- 移除 `PopupEditorLogicalResource.id` 和独立 blob/packageFiles 三套可编辑真相，改用 shared asset workspace。
- `PopupManifestV1.resources` 的 key 必须是 image filename、Spine skeleton filename、VNI project filename或 image-string manifest filename。
- layer `resource` 直接引用该 root filename key；tier/layer/amount format/placement 等业务语义不变。
- image/Spine/VNI/image-string/known popup ZIP 都由统一 import session 识别；普通导入只入库，不自动加 layer。
- win-amount VNI descriptor 的 tier 建议仍可展示，但用户仍明确绑定；profile/尺寸先明确选择。
- 同名 leaf 覆盖影响全部 tier/layer/compound closure，统一 review 列出影响。
- popup export 根保留 strict award-celebration sentinel，资源 refs 使用 filename key，owned bytes 只经统一 map 解析。

### 9.3 Symbols Editor

- `EditorAssetRecord.path`、upload batch path 和独立 `imageStringDependencies` byte namespace 迁移到一个 shared asset workspace。
- symbol code、state id、state lifecycle、scale、renderPriority、value/cascade 配置保持独立业务身份。
- image state 直接保存 image filename key；Spine 保存 skeleton/atlas/page keys；VNI 保存 project filename key；image-string 保存 manifest key。
- Resource Picker 可展示 derived typed candidates，但不能把 candidate 再写成任意 resource id。
- 多文件、VNI ZIP、standalone ImgNumber ZIP、known symbols ZIP 都走统一 importer/review/commit。
- package import 的 nested image-string/VNI/Spine 资源全部抹平到同一 filename key namespace；冲突由统一覆盖/改名流程处理。
- export 的 symbol manifest、VNI project、Spine atlas、image-string refs 全部为 filename keys，最终由一个 `assets.map.json` 解析。
- 保留当前 strict display set、state、animation、slot、value presentation、cascade、exact closure 与 preview owner 行为。

### 9.4 Game Layout Editor

- 移除 `EditorLayoutResource.id` 作为 editor-only identity；node/background/transition 直接保存 typed filename keys。
- 资源 Tab、Picker、background、layer、transition、Symbols 和 BigWin dependency 的所有导入统一走 shared controller。
- 单个 image/MP4 直接以 filename key 绑定；Spine/image-string 绑定使用 typed filename key 组合。
- symbols/popup dependency ZIP 导入后不再拥有独立 `dependencies/**` 资源区；dependency root config 和全部 owned leaf 进入同一全局扁平 map。
- layout manifest 的 dependency ref 使用其 root config filename key。若多个 package 带来同名 root/leaf，不自动按 package id 建目录或加 suffix，必须在 review
  中覆盖、取消或显式改名并结构化重写。
- 最终 layout ZIP 只保留根 layout sentinel、统一 `assets.map.json` 和一个扁平 `assets/<hash>.<ext>` payload 区；不得输出
  `dependencies/image-strings/**`、`dependencies/symbols/**`、`dependencies/popups/**` 等资源目录。
- 相同 `BG.jpg` 被多个 mode/variant/background node 使用时，覆盖一次即可全部更新；每个 mode/variant 独立 node/placement 仍保持。
- Task 116 的自动 direct-edge prepare、Spine/MP4 单一状态动作、trusted-click 同步 audible `play()`、media-time fade 和 strict rollback
  不得退化。

## 10. Package、runtime 与 legacy 兼容

### 10.1 新包解析

format owner 的 in-memory 和 URL loader 都必须接受统一 resolver：

```text
config filename key
  -> assets.map.json entry
    -> exact package bytes / contained CDN URL
```

ZIP resource creator、closure collector、Blob URL preview 和 CDN loader 必须使用同一 map parser/validator，不能由四个 app 各自展开 map。
CDN package 的 root manifest URL 仍是入口；loader 读取同目录 `assets.map.json`，之后只请求 map 声明的 hash payload。

不得提供 basename fallback、目录猜测、宽泛 glob、404 后尝试旧路径、占位资源或混合 map/direct path fallback。

### 10.2 legacy package

- 没有 `assets.map.json` 的现有合法 image-string/popup/symbol/layout package 继续按现有 direct path 合同加载，确保 game002/game003 和已有资产不被迫迁移。
- editor 导入 legacy package 后必须在内存中迁移为 filename-key workspace；再次导出只写新 map 格式。
- legacy 包若仍保留可验证 original filename/atlas/VNI reference，使用该明确名称作为 proposed key。
- 如果 package 只剩 `assets/<hash>.<ext>` 且没有任何可证明的原文件名，不能把 hash 静默当作用户资源名，也不能猜 `BG`。import review
  必须要求用户给该 payload 指定 filename key 后才能 commit。
- 同一 legacy hash 被多个结构化引用复用时，迁移后可共用一个用户确认的 key；不同业务资源若用户要求不同名称，可用多个 key 指向同一 payload。
- legacy migration 不修改用户原 ZIP；只有新导出产生新 package。

### 10.3 schema 和版本原则

- `assets.map.json` 是显式的新 package container 能力，不使用隐式 heuristics。
- inner manifest 能无损保存 basename string 时不升版本；确需扩展时只做 owner-owned、向后兼容的最小变更。
- 新 package 有 map 时必须全量 filename-key 化；不允许长期双写 hash path + filename ref 两套真相。
- parser unknown-key、version、dimensions、Spine/VNI version、animation、slot、glyph 和 exact closure 严格性不得降低。

## 11. Import Review 与 UI 合同

四个 editor 使用同一 review view-model，UI 风格可随 app，但字段、动作和结果必须一致。review 至少展示：

```text
本批文件与 ZIP 数 / 解压文件数 / 总 bytes
识别到的 filename keys
kind / root / exact dependency keys
VNI profile 选择
新增 / 相同 bytes no-op / 同名覆盖 / 需要改名 / blocking error
旧新 metadata 与 hash
每个覆盖/改名影响的引用位置
unused / orphan / ambiguous / missing diagnostics
候选项目 validation 结果
```

规则：

- review 完成前不 mutation project、selection、preview、Blob URL owner 或 IndexedDB/localStorage。
- 无 blocking error 且所有 profile/collision 已明确处理后才能确认。
- 一次确认只产生一次 store transaction；异步 decode/metadata/player prepare 失败时完整 rollback。
- 成功导入资源不自动绑定业务配置；上下文 shortcut 仍须明确选择/确认。
- resource list 主要显示 filename key、kind、尺寸/摘要、引用数和状态；hash/payload path 放高级详情。
- 不再显示或要求填写 logical id，不把 source directory 当身份。

## 12. 安全、确定性与性能

- 沿用每个格式现有更严格的 ZIP 上限；共享 files/ZIP session 至少拒绝超数量、单文件、压缩总量和解压总量，并在
  `arrayBuffer()` 前检查 `File.size`。
- 继续拒绝 zip-slip、absolute/drive path、反斜杠、`.`/`..`、duplicate entry、NFC/case-fold entry collision、NUL、URL/query/hash。
- 不递归解压 ZIP，不访问网络解析本地资源，不读取 cookie/token/player data/server scene/randomNumbers。
- deterministic JSON、atlas、asset map、ZIP entry order、mtime/newline/level 固定；同一 project/bytes 两次导出逐 byte 相等。
- `Uint8Array` 在 store/transaction 边界 clone/freeze；失败事务不泄漏可变 bytes、Object URL、Texture 或 player。
- import review 对大批资源使用一次引用图和 hash cache；不得为每个 row 重复解压、decode 或启动 runtime player。
- preview 继续共享精确 bytes/texture/player owner；filename key 覆盖提交后一次性失效受影响 cache，不全量重建无关资源。

## 13. 实施顺序

### 阶段 A：失败测试与共享合同

1. 先用版本控制可识别的安全 rename 把 `apps/Imgnumbereditor` 改为 `apps/imgnumbereditor`；同步 live source/docs、
   workspace importer、lockfile importer key、脚本/配置和测试路径。历史 task 计划/报告只作历史记录，不批量重写。
2. 先为 filename key、map、同名覆盖、flatten collision、profile choice 和原子 transaction 写失败测试。
3. 新增 `packages/editorresource`、workspace package 配置、README、tsconfig/eslint/test。
4. 复用 browserartifactio hash/ZIP 原语，建立 immutable asset workspace、reference graph、review 和 command。
5. 加 source-boundary 测试，禁止四个 editor 再调用 Task 110 logical id/directory/import transaction 实现。

### 阶段 B：format resolver/adapter

1. image 与 MP4 bytes/metadata adapter。
2. image-string manifest/glyph adapter。
3. Spine skeleton/atlas/page adapter。
4. VNI project/profile/asset adapter。
5. popup/symbol/scene-layout package adapter、map-aware closure/resource/CDN loader。
6. legacy direct-path -> filename-key review materializer。

每个 adapter 先通过 owner 单测再接 UI；禁止先在 app 写临时 parser 后下沉。

### 阶段 C：ImgNumber Editor

迁移 project、store、import/export、preview input、resource UI 和 tests；删除 folder/logical-id UI。

### 阶段 D：Popup Editor

迁移 logical resources/blob/packageFiles、VNI/Spine/image-string import、layer refs、ZIP IO、preview 和 tests。

### 阶段 E：Symbols Editor

迁移 path-keyed library、upload batches、typed Picker、standalone dependencies、ZIP IO、preview 和 tests。

### 阶段 F：Game Layout Editor

最后迁移最广的 resource/node/dependency/transition graph、统一导入、扁平 dependency vendor、ZIP/CDN preview/runtime tests。
必须使用 Task 116 自动转场基线做 before/after regression。

### 阶段 G：删除旧路径、文档与报告

1. 删除不再使用的 logical id、folder input、directory provenance 和 app-local collision/overwrite/materializer。
2. 更新 README、format docs 与 `AGENTS.md` 长期规则。
3. 运行全部 scoped/root gate，记录真实结果。
4. 写 Task 119 中文报告，并把最终浏览器验收清单交给用户。

## 14. 自动化测试最低矩阵

### 14.1 `@slotclientengine/editorresource`

- `BG.jpg` 保持原样；空格、下划线、Unicode NFC 合法；slash/backslash/control/dot segment 失败。
- `BG.jpg` / `bg.jpg` case collision 不共存，覆盖保留现有拼写；显式改名可安全改变 key。
- known SHA-256 vectors、完整 64 位 hex、same bytes payload dedupe、digest collision。
- map parse/serialize、path/hash/size/media mismatch、missing payload、orphan payload、mixed direct/map ref。
- batch 中同 basename same bytes 合并；different bytes 阻断直到 profile/source/rename 已选择。
- existing same key same bytes no-op；different bytes 默认 overwrite plan。
- overwrite 影响图准确，所有 config refs 不变，payload entry 更新，unused payload GC。
- referenced delete 失败；unreferenced delete；shared payload 不误删。
- rename 结构化 refs、自叶子向 root 重 hash、transaction rollback。
- ZIP/多文件 bounded ingestion、未知/递归/orphan/ambiguous package 失败。
- async decode/adapter/project validation 任一失败均零 mutation、零 leaked owner。

### 14.2 format owner

- image-string glyph refs 是 filename keys，map resolver 精确加载；legacy direct path 仍加载。
- Spine atlas page 扁平化/改名只改 page refs，不改 animation/slot/skin；同名不同 page bytes 阻断。
- VNI 单 profile、multiple profile explicit choice、只提交所选 closure；asset refs 扁平且 runtime 可播放。
- Popup resource/layer refs 使用 root filename key，strict award-celebration closure 无 orphan。
- Symbols image/Spine/VNI/image-string refs 使用 keys，state/value/cascade 语义不变。
- Scene Layout image/Spine/MP4/symbols/popup dependency 使用同一个 map，无 `dependencies/**` 资源目录。
- ZIP resource creator、Blob preview 与 URL loader 对相同 map 得到 exact same bytes。
- map package拒绝 direct path fallback；legacy 无 map package按旧合同通过。

### 14.3 ImgNumber Editor

- 一次导入多张 glyph image，只显示原 filename keys，无 logical id prompt/folder input。
- 字符建议不改名、不自动绑定；显式 glyph mapping 正确。
- 同名覆盖保持字符/offset/fixed group并更新全部引用，尺寸非法时原子失败。
- export ZIP 含 root manifest、`assets.map.json`、hash payload；manifest glyph path 是 filename key。
- export -> import -> export deterministic；legacy hash-only package 要求用户命名。

### 14.4 Popup Editor

- 一批 image/Spine/VNI/image-string 形成一个 flat workspace；compound group 无独立 id。
- VNI ZIP 多尺寸必须选择；未选不能提交。
- layer resource ref 等于 filename key；同 key 多 tier 共享。
- 覆盖共享 leaf 列出所有 tier/layer，合法则全更新，非法 closure 零 mutation。
- popup ZIP 新格式 round-trip、legacy import、runtime preview 完全通过。

### 14.5 Symbols Editor

- 一批 image/Spine/VNI/ImgNumber ZIP 通过同一 importer；无 folder input、upload batch path identity。
- typed Picker 直接提交 filename key/组合，不生成 resource id。
- 同名覆盖影响所有 symbol/state/value refs；缺 animation/slot/glyph 时阻断。
- flattened VNI/Spine/image-string refs 和 map exact closure；无 nested dependency 资源目录。
- game002/game003 legacy symbols package import -> 用户命名（如必要）-> new export -> production prepare 等价。
- symbolsviewer 和真实 Pixi/VNI/official Spine preview regression 通过。

### 14.6 Game Layout Editor

- 一批 image/Spine/MP4/ImgNumber/Symbols/Popup ZIP 都走同一 importer/review。
- mode/variant 多个 node 直接引用同一 `BG.jpg`；覆盖一次全部使用新 bytes，独立 placement/node id 不变。
- Spine/MP4 transition filename refs 与 Task 116 automatic prepare/trusted-click/play rejection rollback 全部通过。
- imported symbols/popup dependency 完全抹平；同名不同 bytes 明确 review，不建 dependency 目录、不加 suffix。
- layout export 只有 root control files、`assets.map.json`、flat hash payload；exact closure 无 orphan。
- new layout ZIP reimport、Blob preview、package runtime、CDN URL loader 完全通过。
- legacy layout/nested dependency 仍能导入，重新导出升级；game002/game003 runtime 不受 legacy loader回归影响。

### 14.7 四个 editor 交叉一致性

- 相同 `BG.jpg` bytes 在四个 editor 得到完全相同 key、SHA-256、payload path、collision classification 和 review action。
- 相同同名新 bytes 在四个 editor 都以覆盖为主操作，引用图不同但 transaction 语义一致。
- ImgNumber export 可由 Popup/Symbols/Game Layout 的同一 importer 识别。
- Popup/Symbols export 可由 Game Layout 同一 importer 识别并进入同一 flat workspace。
- 任一 editor 导出的 map 用同一 parser 通过；不得存在 app-specific map variant。

### 14.8 source-boundary

至少增加静态门禁，证明四个 app 不再出现：

```text
webkitdirectory
data-upload-directory / upload-folder
suggestLogicalResourceId / assertLogicalResourceId
sourceKind: "directory"
自动 -2/-3 资源 identity 分配
app-local SHA-256 / assets.map parser / overwrite transaction
generic JSON path replace / basename fallback / wide glob
```

允许业务 node id 的稳定去重规则继续存在，但测试必须区分 node identity 与资源 filename key，不能误删 Task 116 等合法 node 逻辑。

## 15. 严格验收命令

实施前先记录四个 editor、browserartifactio、rendercore、vnicore 的基线测试结果。最终至少运行：

```bash
pnpm --filter @slotclientengine/editorresource format:check
pnpm --filter @slotclientengine/editorresource lint
pnpm --filter @slotclientengine/editorresource typecheck
pnpm --filter @slotclientengine/editorresource test
pnpm --filter @slotclientengine/editorresource build

pnpm --filter @slotclientengine/browserartifactio format:check
pnpm --filter @slotclientengine/browserartifactio lint
pnpm --filter @slotclientengine/browserartifactio typecheck
pnpm --filter @slotclientengine/browserartifactio test
pnpm --filter @slotclientengine/browserartifactio build

pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build

pnpm --filter @slotclientengine/vnicore format:check
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build

pnpm --filter imgnumbereditor format:check
pnpm --filter imgnumbereditor lint
pnpm --filter imgnumbereditor typecheck
pnpm --filter imgnumbereditor test
pnpm --filter imgnumbereditor build

pnpm --filter popupeditor format:check
pnpm --filter popupeditor lint
pnpm --filter popupeditor typecheck
pnpm --filter popupeditor test
pnpm --filter popupeditor build

pnpm --filter symbolseditor format:check
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build

pnpm --filter gamelayouteditor format:check
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build

pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer build
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
pnpm --filter game003 test
pnpm --filter game003 typecheck
pnpm --filter game003 build

pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

若某 consumer 没有列出的 script，报告必须记录 package.json 证据并运行其实际存在的最接近门禁，不能虚构通过。新增共享核心 branch
coverage 不低于 80%，不得降低既有 threshold、skip test、放宽 parser、更新断言为错误行为或增加 magic timeout 伪造绿色。

任何失败都记录 exact command、exit code、首个根因、修复与复跑结果；root 无关既有失败也要隔离复现，不能用“基本通过”代替。

## 16. 最终浏览器验收（由用户执行）

按用户要求，实施者完成自动化、静态、构建和 package/runtime 验收后停止，不代替用户做最终浏览器验收，也不能在报告中声称浏览器已通过。
交付时必须提供四个实际 dev URL、使用的 fixture/ZIP 和以下简洁 checklist。

### 16.1 ImgNumber Editor

1. 一次选择多张保留大小写的 glyph 图片，确认资源列表显示原文件名且没有 logical id/文件夹入口。
2. 映射字符并导出；检查 manifest 引用原 filename key，ZIP payload 是 hash，重导预览一致。
3. 再导入同名不同图片，确认 review 默认“覆盖同名文件”，字符绑定不变。

### 16.2 Popup Editor

1. 一次选择 image、完整 Spine、VNI ZIP 和 ImgNumber ZIP，确认统一 review 和扁平 keys。
2. 对多尺寸 VNI 明确选择一个尺寸，确认其它尺寸不入库。
3. 把同一资源绑定多个 tier 后同名覆盖，确认所有 layer 更新且非法 replacement 会完整 rollback。
4. 导出/重导并播放完整 award-celebration。

### 16.3 Symbols Editor

1. 用唯一“导入资源”入口选择 image/Spine/VNI/ImgNumber，检查 derived group 和 filename-key Picker。
2. 绑定 normal/appear/win/value 后覆盖共享 leaf，确认全部引用影响可见。
3. 导出/重导并检查 Pixi/VNI/official Spine/image-string 表现、state lifecycle 和资源名。

### 16.4 Game Layout Editor

1. 导入 `BG.jpg` 并让多个 mode/variant 使用；同名覆盖后确认全部背景 bytes 更新、placement/node identity 不变。
2. 导入 Symbols/Popup ZIP，确认没有 dependency 目录，冲突只通过覆盖或显式改名处理。
3. 检查 Spine 与有声 MP4 direct transition 的 automatic prepare、单一状态动作、fade 和 play rejection。
4. 导出/重导 layout，检查 preview、symbols、popup、image-string 与 transition 完整。

报告必须把以上项目标记为“待用户浏览器验收”，不得把 happy-dom、Vitest、fake media 或 ZIP 单测当成真实浏览器结果。

## 17. 文档与长期规则

至少更新：

```text
packages/editorresource/README.md
packages/browserartifactio/README.md
packages/rendercore/README.md
apps/imgnumbereditor/README.md
apps/popupeditor/README.md
apps/symbolseditor/README.md
apps/gamelayouteditor/README.md
docs/image-string-manifest.md
docs/symbol-package.md
docs/scene-layout-manifest.md
AGENTS.md
```

`AGENTS.md` 必须把四个 editor 的长期规则统一为：单一 flat filename-key resource workspace、single multi-file/ZIP importer、same-name
default overwrite、shared `assets.map.json`、full SHA-256 payload、format-owner structured refs、无 folder/logical id/app-local importer。应替换与之冲突的
Popup/Game Layout logical resource、nested dependency directory 等旧表述，同时保留 Task 116 和各 runtime owner 合同。

Task 119 报告至少记录：

- 起止 branch/HEAD/status、Node/pnpm；
- shared package/API、map schema 和各 app model 的最终形态；
- 删除的旧 logical id/folder/importer 路径；
- legacy migration 和 inner schema 是否扩展；
- 四个 editor 交叉 fixture 与 ZIP entry/map 样例；
- 所有 scoped/root 命令的真实结果；
- 未执行且交给用户的浏览器 checklist；
- 已知限制，不得写模糊的“后续优化”。

## 18. 明确禁止项

- 在 filename key 外保留、恢复或新增 editor logical resource id / alias id。
- 配置继续引用 hash path，同时在 UI 伪装显示原文件名。
- 每个 app 各写一份 asset map、overwrite、ZIP discovery 或 reference impact 逻辑。
- 上传文件夹、虚拟目录、dependency 资源目录、package namespace 或自动 prefix。
- 同名冲突自动 `-2/-3`、lowercase、kebab-case、随机串或时间戳。
- 同名覆盖只更新部分引用、逐资源提交或失败后保留半批次。
- 为方便 flatten 进行 JSON 全局替换、正则猜路径、basename fallback 或宽泛 glob。
- 默认选择 VNI 尺寸/profile 或同时导入多个尺寸后悄悄覆盖。
- 忽略 orphan/unknown/`.DS_Store`/`__MACOSX` 来让坏 ZIP 通过。
- 破坏 Spine/VNI/image-string/popup/symbol/layout strict parser、exact closure 或 runtime lifecycle。
- 把 `docs/anieditor5`、`docs/victory_editor_v2` 纳入迁移，或据其参考实现复制第二套 editor 逻辑。
- 修改原始文件、向网络上传素材、把 Object URL 写入配置、实现 atlas packing/转码/CDN。

## 19. 完成定义

以下条件全部满足才算完成：

- 四个 editor 真实依赖同一个 `@slotclientengine/editorresource` 核心，而不是仅统一文案。
- app 目录已规范为 `apps/imgnumbereditor`，live 配置、lockfile importer 和文档不再引用旧大小写路径；历史任务记录保持原样。
- 工作区资源只有 filename key -> payload 两层，无任意 logical resource id。
- 配置引用 `BG.jpg` 等 filename key；`assets.map.json` 精确解析到完整 SHA-256 flat payload。
- 四个 editor 都只有 single multi-file/ZIP importer，文件夹入口与代码彻底移除。
- VNI 多尺寸/profile 必须明确选择，选中 closure 才进入工作区。
- 同名不同 bytes 的默认主操作是覆盖，受影响引用完整可见，所有配置引用不变且事务原子。
- flatten collision 不自动 suffix；改名结构化、原子、可验证。
- Popup/Symbols/Layout dependency 共享一个 flat workspace 和一个 map，不再 vendor 资源子目录。
- legacy package 继续加载；editor legacy import 可迁移，新 export 只写新格式；无法恢复的名字要求用户输入，不泄漏 hash 名。
- exact closure、SHA-256、deterministic ZIP、bounded IO、preview/runtime owner 和 Task 116 转场合同无退化。
- scoped package、viewer/game consumer 和 root 严格门禁按真实结果通过并记录。
- README、格式文档、`AGENTS.md` 与中文 Task 119 报告完成。
- 最终浏览器验收清单已交给用户，报告明确标记待用户执行，没有虚假宣称通过。
