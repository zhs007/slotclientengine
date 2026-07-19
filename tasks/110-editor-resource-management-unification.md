# Editor 资源管理统一与内容寻址任务计划

## 1. 任务目标

本任务统一以下三个纯前端编辑器的资源管理模型、导入入口、逻辑身份、物理路径、替换、去重和导出规则：

```text
apps/Imgnumbereditor
apps/symbolseditor
apps/gamelayouteditor
```

任务完成后，用户不再需要先判断“这是图片上传、Spine 上传还是 ImgNumber ZIP 上传”。三个编辑器在各自允许的资源类型范围内统一提供：

```text
上传资源
上传文件夹
```

导入器根据文件内容、严格 parser 和完整依赖关系识别 logical resource；上传只加入资源库，不自动创建 symbol、state、layout node、背景、placement 或 animation 绑定。任何歧义、缺依赖、多余依赖、非法内容或归一化冲突都必须在提交前明确失败。

用户上传的原文件名只用于提出 logical resource id 和显示来源信息。内部 logical resource id 使用小写 ASCII kebab-case；资源的 production 物理路径不再沿用原文件名或原目录，而是按完整 SHA-256 内容摘要映射到当前 package 自己的扁平 `assets/` 目录：

```text
原文件名: BG_2.PNG
logical resource id: bg-2
production path: assets/<64-char-lowercase-sha256>.png
```

manifest、atlas、VNI project 和其它受支持的结构化资源必须同步引用映射后的 canonical path。不得出现“文件已改名但内部引用仍指向旧名称”的半转换状态。

这套分离形成稳定的三层身份：

```text
用户来源名称
  -> 仅用于导入审查、诊断和 logical id 建议

logical resource id
  -> 编辑器内稳定身份、Picker 绑定、引用计数、替换和删除

content-addressed package path
  -> production manifest/ZIP/CDN 实际资源路径
```

本任务只为未来合图、CDN 去重和资源流水线建立稳定边界；不在本任务实现 texture atlas packing、图片转码、压缩质量调整或 CDN 上传。

本文件是完整实施合同。执行者不得依赖聊天记录、任务 100、101、102、104、105、107 或其它历史任务补齐行为。历史代码和报告可以用于了解基线，但 schema 兼容、路径算法、错误策略、实施顺序、测试和验收均以本文件为准。

任务完成后必须新增中文任务报告：

```text
tasks/110-editor-resource-management-unification-[utctime].md
```

UTC 时间戳必须使用 `date -u +%y%m%d-%H%M%S`。

## 2. 已确定的产品与架构决定

### 2.1 logical id 与物理路径彻底分离

- logical resource id 是编辑器身份，不是磁盘文件名，也不是资源绑定猜测。
- 新上传资源的 id 默认从其明确 primary source 名称的最后一个扩展名前 stem 派生。
- id 归一化算法固定为：
  1. source basename 做 Unicode NFC；
  2. 删除最后一个扩展名；
  3. ASCII 字母转小写；
  4. 连续的空格、点、下划线和连字符统一折叠为单个 `-`；
  5. 删除首尾 `-`；
  6. 最终必须匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`。
- 示例：

```text
BG_2.PNG          -> bg-2
Mini.BK.PNG       -> mini-bk
free  game.webp   -> free-game
A___B--C.json     -> a-b-c
```

- 不做拼音、语言相关 transliteration 或不可逆字符猜测。名称无法产生合法 ASCII id 时，导入审查必须要求用户显式填写 id。
- 批次内或现有资源库中 id 冲突时不得自动覆盖、自动合并或静默追加随机后缀。导入审查允许用户在提交前修改建议 id；确认时仍冲突则整个 transaction 失败。
- 替换资源始终保留现有 logical id，不因新文件名改变 identity。
- node id、symbol code、state id、image-string character 和 package id 是各自 schema 身份，不得混用 resource id 归一化函数偷偷改写。

### 2.2 物理资源使用完整 SHA-256 内容寻址

- owned payload 的 production filename 固定为：

```text
assets/<sha256>.<canonical-extension>
```

- 使用最终 canonical bytes 的完整 64 字符 lowercase SHA-256 hex，不得截断。
- 浏览器实现使用 Web Crypto `crypto.subtle.digest("SHA-256", bytes)` 或共享层等价封装；禁止 FNV、CRC、时间戳、随机数、文件名 hash 和 Node-only production 实现。
- extension 从已验证类型派生：PNG `.png`、JPEG `.jpg`、WebP `.webp`、Spine/VNI JSON `.json`、Spine atlas `.atlas`，不得盲信上传扩展名。
- 相同 canonical bytes 与 extension 得到同一路径并在同一 package 内只保存一次；logical resources 仍保持独立。
- 同 hash path 已存在但 bytes 不同必须作为 digest collision 显式失败，绝不覆盖。
- 替换 bytes 后 hash/path 随内容变化，logical id、editor 引用和 UI selection 不变。
- 删除或替换 logical resource 时，只清理不再被任何 logical resource/dependency 引用的 blob。
- Object URL、Pixi Texture、Spine/VNI player 是 preview lifecycle，不进入 hash、project 或 ZIP。

### 2.3 路径抹平以 package ownership 为边界

```text
layout package
  layout.manifest.json
  assets/<hash>.<ext>
  dependencies/image-strings/<id>/...
  dependencies/symbols/<id>/...

symbol package
  symbols.package.json
  gameconfig.json
  symbol-state-textures.manifest.json
  assets/<hash>.<ext>
  dependencies/image-strings/<id>/...

image-string package
  image-string.manifest.json
  assets/<hash>.<png|webp>
```

- control manifest 和明确的 package entrypoint 不是普通 payload，不改成 hash 文件名。
- dependency 保持自包含根目录，禁止把 nested glyph/symbol assets 提升到父包 `assets/`。
- consumer vendor 已验证 dependency 时只增加 dependency 根前缀，不重新 hash、不改写 bytes。
- package owner 创建或显式重新导出 package 时负责生成自己的 hash-flat payload。
- production path 全部是 ASCII lowercase NFC canonical POSIX 相对路径。

### 2.4 允许安全的相同内容复用

旧 scene-layout 会拒绝不同 resource signature 使用同一个 lowercase path。内容寻址后，相同 exact path 表示相同 canonical bytes，跨 logical resource 复用是预期行为。本任务必须调整为：

- exact canonical path 可以被多个 resource/node/state 引用；
- package byte store 对该 path 只有一份 bytes；
- case-fold/NFC 后相同但原始拼写不同的 path 仍拒绝；
- 同一 path 声明为不兼容媒体类型时在对应 prepare 阶段失败；
- 同一 image path 声明不同尺寸时通过真实 decode 校验失败；
- 不因路径复用合并 logical resource、node playback 或 placement。

必须同步修改受影响的 rendercore manifest/path closure 测试，不能只在 editor 绕过校验。

### 2.5 source path 与 production path

- 文件/目录选择先建立只用于本次导入的 source file index。
- `File.webkitRelativePath` 只用于解析同批依赖，不直接进入 production manifest。
- source path 拒绝绝对路径、drive prefix、反斜杠、空 segment、`.`、`..`、NUL、URL、query/hash、percent escape 和 NFC collision。
- 同时存在 `BG.PNG` 与 `bg.png` 等 ASCII case-fold collision 时整批失败。
- 内部引用先 exact source match；找不到时允许唯一 ASCII case-fold match；仍找不到或有歧义则失败。
- 成功识别后全部 production 引用改写到 hash-flat path，因此大写文件不会导致最终读取失败。
- original basename/relative path/upload batch 只作为 provenance 诊断，不进入 production runtime contract。

### 2.6 统一入口不等于模糊识别

三个编辑器按自身能力展示“上传资源 / 上传文件夹”：

| Editor             | Image       | Spine | VNI | image-string ZIP/package | symbols/layout package                  |
| ------------------ | ----------- | ----- | --- | ------------------------ | --------------------------------------- |
| ImgNumber Editor   | glyph image | 否    | 否  | 顶层项目导入             | 否                                      |
| Symbols Editor     | 是          | 是    | 是  | 是                       | 顶层 symbols project import             |
| Game Layout Editor | 是          | 是    | 否  | 是                       | symbols dependency / 顶层 layout import |

识别依赖内容、严格 schema 和精确 closure，而不是只看扩展名：

- raster image 必须真实 decode，并核对格式与 canonical extension；
- Spine 必须是一个受支持的 4.3.x skeleton、一个 atlas 和 atlas 精确引用的全部 pages；
- VNI 必须通过 vnicore 支持版本 parser，并解析其精确 asset closure；
- image-string ZIP/目录必须在根有 `image-string.manifest.json`，通过 rendercore parser 和完整 glyph closure；
- symbols ZIP 根必须有 `symbols.package.json`；layout ZIP 根必须有 `layout.manifest.json`。

同一 JSON 匹配多个 parser、一个 atlas 可能属于多个 skeleton、一个 dependency 有多种 closure，或批次存在未消费文件时，必须列出歧义/多余文件并拒绝。禁止按 basename、上传顺序、“只有一个候选”、symbol code 或目录名猜绑定。

### 2.7 ZIP 自动解包，但只接受已知 package

- “上传资源”选择 `.zip` 时 bounded 解压并检查 root sentinel manifest。
- `image-string.manifest.json` ZIP 在 Symbols Editor 和 Game Layout Editor 中自动识别、解包、校验并安装为一个 logical dependency；用户不需要手工拆 ZIP。
- ImgNumber Editor 顶层导入自身 ZIP 后原子重建 project。
- `symbols.package.json` 和 `layout.manifest.json` 继续进入明确的 package/project 导入流程，不作为散文件上传。
- 缺少已知 root manifest 的 ZIP 明确失败；不递归解压 ZIP 内 ZIP，不猜类型，不把未知 entry 暴露成普通素材。
- bounded ZIP 限额沿用现有最严格 production 合同；文件/目录上传也在 `arrayBuffer()` 前应用等价数量、单文件和总大小上限。

### 2.8 draft 绑定 logical resource，导出才物化 path

- typed project 中的用户绑定指向 logical resource id 和明确 subresource role，不把用户可编辑 raw path 当 identity。
- hash、byte store、metadata 与引用关系分离。
- manifest preview/export materializer 根据 logical graph 生成 path mapping，再生成或结构化改写资源和精确 closure。
- UI 不提供 raw production path 文本框；高级详情可只读显示 hash、byte size、provenance 和 materialized path。
- 导入 production package 时从 manifest 显式关系重建 logical resources，禁止仅按 basename 猜类型或共享关系。
- Game Layout Editor resource id 继续是 editor-only identity，不要求进入 scene-layout schema；同一 manifest 重复导入必须稳定地产生相同 id。
- Symbols Editor 的 symbol code/state id 与 logical resource id 分离。
- ImgNumber Editor 的 Unicode scalar 是 glyph 语义，logical image id 只是编辑身份；glyph path 来自 content mapping。

### 2.9 格式内引用必须结构化改写

允许改写：

- editor 生成的 scene-layout image/Spine paths；
- Spine atlas page 与 manifest texture mapping；
- image-string glyph `path`；
- symbol manifest 的 image、Spine、VNI、value presentation 和 dependency refs；
- VNI project 中由 vnicore parser/introspection 明确声明的 asset refs；
- package entrypoints/resources 与 nested package 前缀。

禁止：

- 对 JSON 文本做全局字符串替换；
- 用正则扫描未知字段猜路径；
- 改写 Spine animation、slot、skin、attachment 等非路径名称；
- 改写 VNI layer/effect/track 业务字段；
- 依赖 object insertion order 或上传顺序；
- 路径找不到时回退 basename、宽泛 glob、占位图、空 texture 或第一个候选。

结构化文本使用已有 deterministic JSON/atlas serializer；hash 针对最终 package canonical bytes。依赖图自叶子向根物化，禁止用临时旧路径计算最终 hash。

### 2.10 不改变 production 表现和业务边界

- 只改变 editor resource graph 和 package path materialization，不改变 Pixi 几何、Spine/VNI 播放、symbol state、image-string layout、reel、background adaptation 或游戏业务语义。
- rendercore/vnicore 继续拥有 parser/runtime/资源引用解释；editor 不复制 runtime 算法。
- 不读取、缓存或导出服务器真实轮带、token、cookie、玩家输入、randomNumbers 或 live scene。
- 不新增 fallback，不降低 unknown-key、版本、尺寸、closure、animation 或 slot 校验。
- `apps/anieditorv5viewer` 是 viewer，不纳入本任务 UI 统一；只需验证它能消费新 hash-flat VNI package。

### 2.11 与任务 107 的覆盖边界

- 任务 107 已完成的 scene-layout image-string node、Spine 状态机、symbols dependency、package runtime、精确 closure 和 production reel 组合能力全部作为本任务基线保留。
- 本任务只覆盖旧合同中与上传文件名、editor logical resource identity、owned asset path、相同内容复用和上传入口直接冲突的规则。
- nested dependency 的自包含 vendoring、manifest 驱动资源闭包、严格 parser/runtime 和“未引用资源不导出”规则继续有效。
- 不借资源管理统一重写 task 107 runtime API、状态切换时序、reel scene 输入或 browser preview 业务交互。
- 如果实施中发现必须改变 task 107 production schema/API，先用测试和格式约束证明必要性，在任务报告中单独列出兼容影响；不得顺手扩大改动。

## 3. 当前基线与实施前盘点

制定本计划时仓库为：

```text
root:   /Users/zerro/github.com/slotclientengine
branch: main
HEAD:   9b4a1c8
status: 包含任务 107 的用户工作区修改和未跟踪任务文件
```

制定计划的非交互 shell 中裸 `node` 不在 PATH，Codex bundled `pnpm` 为 `11.9.0`。实施者必须使用正常 Node 24+ 环境，不得降低 engines、改脚本或跳过校验。

实施开始重新记录：

```bash
git branch --show-current
git rev-parse --short HEAD
git status --short
node --version
pnpm --version
```

工作区若不 clean，已有修改和 untracked 文件全部视为用户输入。禁止 reset、checkout、自动 stash、清理 untracked 或覆盖无关修改。

至少重新阅读：

```text
packages/browserartifactio/src/**
packages/rendercore/src/image-string/**
packages/rendercore/src/scene-layout/**
packages/rendercore/src/symbol/**
packages/vnicore/src/**
apps/Imgnumbereditor/src/{model,io,ui}/**
apps/symbolseditor/src/{model,io,ui}/**
apps/gamelayouteditor/src/{model,io,ui}/**
docs/image-string-manifest.md
docs/symbol-package.md
docs/scene-layout-manifest.md
AGENTS.md
```

当前不一致至少包括：

- Game Layout Editor lowercases image/Spine filename，但 `BG_2.PNG` 派生非法 id `bg_2`；owned path 仍使用 basename。
- Symbols Editor 以 canonical source path 为主要 identity，保留目录/大小写；Spine/VNI 经多个 raw records 在 Picker 组合。
- ImgNumber Editor 用 Unicode code point 派生 glyph path，而不是内容 hash。
- Symbols Editor 与 Game Layout Editor 有独立的 image-string ZIP 安装逻辑和 UI 文案。
- 三个 app 的 collision、replace、dedup、provenance、folder upload 和 ZIP 分类抽象不同。

## 4. Ownership 与共享能力

### 4.1 `packages/browserartifactio`

拥有无 Pixi、无业务语义的浏览器共享基础能力：

- resource id 建议/规范化；
- Web Crypto SHA-256 与 lowercase hex；
- canonical extension/media type 辅助；
- bounded `File[]` / directory source index；
- exact + unique ASCII case-fold source ref 解析；
- source path collision/safety校验；
- flat content path 分配与同 hash bytes 核对；
- 已有 bounded/deterministic ZIP。

不得在该包硬编码 Spine、VNI、symbol、layout、glyph、游戏或 editor UI 语义。

### 4.2 format owner

```text
packages/rendercore/image-string
  image-string parser/closure 与 glyph path materialization 校验

packages/rendercore/scene-layout
  scene-layout parser/path closure 与 content path 复用

packages/rendercore/symbol
  symbol manifest/package 资源关系和 materialized closure

packages/vnicore
  VNI project 明确 asset refs 的读取/改写
```

共享包必须提供 editor 可调用的结构化 API；不得迫使 app 读取私有 runtime display tree 或复制 schema parser。

### 4.3 editor app

各 editor 只拥有 typed logical draft、允许类型、import review/Picker transaction、provenance 展示、format API 接线、preview lifecycle 和 package orchestration。三个 app 不得各自复制 SHA-256、id normalization、case-fold resolution、File 限额或 flat allocator。

## 5. 统一内部模型最低合同

具体类型名可按仓库风格调整，但语义至少需要：

```ts
interface EditorAssetBlob {
  readonly digest: string; // 64 lowercase SHA-256 hex
  readonly extension: string; // canonical extension
  readonly mediaType: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

interface EditorResourceProvenance {
  readonly sourceNames: readonly string[];
  readonly sourceKind: "files" | "directory" | "zip" | "package-import";
  readonly batchLabel: string;
}

interface EditorLogicalResourceBase {
  readonly id: string;
  readonly kind: string;
  readonly provenance: EditorResourceProvenance;
}
```

- blob store 以 `digest + extension` 为 key；bytes clone/freeze 边界与现有 store 一致。
- logical resource 保存明确 blob refs、metadata 和依赖，不依赖 Map iteration order。
- provenance 不进入 production manifest/ZIP；production ZIP 重导可生成 `package-import` provenance。
- clone、transaction、project replace 和 async preview 不共享可变 `Uint8Array`。
- hash、decode、Spine/VNI metadata prepare 全部完成后才一次提交。
- 任一步失败，原 project、selection、preview 和 Blob URLs 原子保留。

## 6. 各 Editor 的具体行为

### 6.1 ImgNumber Editor

- 批量图片和目录上传进入待映射 logical image library。
- 默认 image id 由原文件名 stem 归一化；字符建议仍只是建议，不自动成为 glyph mapping。
- 用户显式把 logical image 绑定到一个 Unicode scalar。
- 导出时 glyph path 为 `assets/<sha256>.<ext>`，manifest 同步引用。
- 相同图片绑定多个字符可以复用 blob/path，但 offset、fixed advance 和 character identity 独立。
- 替换 logical image 保持 glyph 绑定，真实 decode 新尺寸并重新验证 metrics/fixed groups。
- legacy `assets/u0030.png` 等 package 可导入；再次导出升级为 hash-flat path，视觉和字符串语义不变。

### 6.2 Symbols Editor

- 普通图片成为 image logical resource；Spine/VNI 作为完整 logical resource 管理，不再由用户把互相依赖的 raw records 拼装。
- 目录上传一次可识别多个 image/Spine/VNI，但必须消费全部文件；共享 blob 可去重。
- symbol/state/value/cascade Picker 绑定 logical resource + typed role，不保存可编辑 raw path。
- 导出 symbol manifest 时 materialize hash-flat paths。
- Spine atlas pages、symbol texture mapping 和 VNI asset refs 同步改写。
- package `resources` 由 manifest/entrypoint 传递闭包精确派生，不列 unused blobs。
- standalone image-string ZIP 通过统一入口自动解包；同 dependency id 同内容复用，不同内容必须显式替换。
- legacy symbols package 重建 logical graph；重导可 canonicalize owned payload，但不能改变 symbol code、state、animation、slot、scale、priority、value 或 cascade 语义。

### 6.3 Game Layout Editor

- 资源栏与 Resource Picker 统一为“上传资源 / 上传文件夹”，使用同一 importer。
- 多张图片一次形成多个 logical resources；一次批次可包含一个或多个完整 Spine group。
- `BG_2.PNG` 建议 id `bg-2`，物理路径为 hash-flat lowercase path。
- image-string ZIP 自动识别、解包、校验成可复用 dependency；glyph 不暴露为普通 image rows。
- layout node 继续绑定 logical resource id；image/Spine manifest path 在 export materialization 生成。
- Spine atlas refs 与 scene-layout texture mapping 共同指向 canonical materialization；preview 与 production 使用同一结果。
- legacy layout ZIP 按 manifest 显式关系重建 library；相同 exact content path 可被多个 signatures 引用。
- vendored symbols package 保持 dependency 自包含，不由 Layout Editor 重写内部 hash/目录。
- unused logical resources/blobs 不进入 layout production ZIP。

## 7. Import review 与 UI 合同

读取和解析完成后、project commit 前，必须展示或等价呈现 import review：

```text
识别到的 logical resources
  proposed id / 可编辑 id
  kind
  primary source
  dependency count
  decoded size 或 animation/resource 摘要
  collision/error 状态

未消费文件
歧义
总文件数 / 总 bytes
```

- 无 error 才能确认；取消不改变 project。
- 确认执行一次 transaction，禁止逐文件提交成半批次状态。
- 上传成功后仍不自动绑定。
- resource list 主要显示 logical id、kind、引用数和状态，来源名作为 provenance。
- hash/path 只放高级详情，不作为主要操作对象。
- 替换走同一 importer，强制候选 kind 与当前一致并保留 logical id。
- 替换影响全部引用；缺 animation/slot、尺寸不兼容或 glyph 不完整时整体失败。
- 仍被引用的 resource 不能删除，错误列出精确引用。
- unused resource 可保留工作区，但 production closure 不包含。

## 8. 兼容与迁移

### 8.1 schema 版本

- image-string v1、symbol-package v1、scene-layout v1 已能表达 canonical path，本任务默认不升级 production schema。
- 不新增 path alias、legacy spelling、fallback 字段或 editor-only resource id 到 production manifest。
- parser 继续接受当前合法 legacy paths；updated editor 新导出使用 hash-flat lowercase owned payload。
- 若盘点证明某 schema 无法无损 remap，必须在报告中给出证据并做最小向后兼容扩展，不得另建平行 manifest。

### 8.2 legacy import

- 现有合法 ZIP 继续导入。
- legacy path 只在 package 解析阶段使用；进入 logical graph 后绑定不依赖它。
- 未经用户导出，不修改用户 ZIP 或本地文件。
- import -> export 的 bytes/path 可以变化，但重导后的 runtime manifest 语义、表现、dimensions、animations 和 closure 必须等价。

### 8.3 old editor draft

三个 editor 以浏览器内存工作区为主，没有长期 localStorage/IndexedDB migration。不得为迁移假设不存在的持久化数据。旧 path-keyed fixtures/helper 应明确迁移，不在 production model 保留两套可编辑真相。

## 9. 安全、资源上限与确定性

- ZIP bounded extraction 继续拒绝 zip bomb、目录穿越、重复 entry、NFC/case-fold collision。
- files/folder 至少限制 4096 entries、50 MiB 单文件、500 MiB 总读取；已有更严格限额时用更严格值。
- 在 `File.arrayBuffer()` 前检查 `File.size` 和累计大小。
- 不上传网络，不用 cookie/session，不请求远端 URL 解析本地依赖。
- 同一 typed graph/bytes 的 deterministic export 必须逐 byte 相等。
- JSON key order/newline、atlas newline、ZIP entry order/mtime/level 使用共享 deterministic 规则。
- hash 输入是最终 canonical bytes，跨 Chrome/Node 测试/构建一致。
- 不通过降低限额、忽略 macOS metadata、跳过未知文件或自动删除 entry 让坏批次通过。

## 10. 实施顺序

### 阶段 A：共享原语

1. 在 `browserartifactio` 增加 id normalization、SHA-256、source index、case-fold resolution、bounded File ingestion 和 flat allocator。
2. 用 known SHA-256 vectors 与 source collision 覆盖共享单测。
3. 保持现有 ZIP API 向后兼容。

### 阶段 B：格式 materializer

1. image-string glyph path materializer。
2. Spine atlas/page + texture mapping materializer。
3. VNI explicit asset ref materializer。
4. symbol package/manifest materializer。
5. scene-layout path reuse 与 materializer。
6. 验证 canonical bytes -> hash -> parent manifest 的依赖顺序。

### 阶段 C：ImgNumber Editor

1. 引入 logical image/blob store。
2. 更新 glyph binding、replace/delete/preview。
3. 更新 import/export、legacy round-trip 和 UI。

### 阶段 D：Symbols Editor

1. raw path library 迁移为 typed logical graph。
2. 实现多资源 files/directory discovery 和 review。
3. 更新全部 Picker、Spine/VNI metadata、image-string dependency。
4. 更新 materialized import/export 与 preview lifecycle。

### 阶段 E：Game Layout Editor

1. 统一上传入口和 import review。
2. logical resources 改用 shared blob/hash store。
3. 更新 image/Spine/image-string prepare、replace/delete/GC。
4. 更新 layout import/export、preview 和 dependency vendoring。

### 阶段 F：文档与边界

至少同步：

```text
apps/Imgnumbereditor/README.md
apps/symbolseditor/README.md
apps/gamelayouteditor/README.md
packages/browserartifactio/README.md
packages/rendercore/README.md
docs/image-string-manifest.md
docs/symbol-package.md
docs/scene-layout-manifest.md
AGENTS.md
```

说明 logical id、content path、package boundary、自动 ZIP 解包、legacy import 和未来 atlas packing 边界。

## 11. 自动化测试最低矩阵

### 11.1 shared primitives

- `BG_2.PNG -> bg-2`、点/空格/重复 separator、首尾 separator。
- 非 ASCII 且无可用 stem 时要求显式 id。
- id 冲突不自动 suffix/覆盖。
- SHA-256 empty、ASCII、binary known vectors。
- full 64 lowercase hex，不截断。
- 相同 bytes/ext 同 path，不同 bytes 不同 path。
- exact match、唯一 case-fold match、case-fold/NFC collision。
- traversal、absolute、backslash、URL/query/hash/percent escape。
- File count、单文件、总大小在读取前失败。

### 11.2 ImgNumber Editor

- 大写/下划线文件名得到 kebab logical id。
- glyph manifest 使用 hash-flat path，真实 bytes 存在。
- 相同图片多 glyph blob 去重但 glyph 语义独立。
- replace 保留 id/binding 并更新 hash/尺寸。
- legacy code-point path ZIP 导入并确定性新格式导出。
- 无 orphan；坏 glyph/尺寸/path 原子失败。

### 11.3 Symbols Editor

- 一批识别多个 image/Spine/VNI，未消费文件失败。
- Spine 大小写 source pages 解析后 atlas/manifest/hash path 一致。
- 多 atlas/skeleton、同 basename 子目录、case-fold collision。
- VNI nested source directory 被抹平，显式 refs 同步改写。
- Picker 只绑定 logical resource，不保存可编辑 raw path。
- identical blobs 去重；replace/delete 引用计数正确。
- image-string ZIP 经“上传资源”自动解开。
- legacy game002/game003 symbol package import -> export -> production prepare 等价。
- deterministic ZIP、exact closure、unused 不导出。

### 11.4 Game Layout Editor

- `BG_2.PNG` 得到 id `bg-2` 和 hash-flat manifest path。
- image/Spine 在真实 Pixi preview 与 package runtime 都能加载。
- Spine 多 page 大小写引用同步改写，无旧 basename 泄漏。
- 一个目录导入多 image/Spine，transaction 原子。
- image-string ZIP 自动解包且 glyph 不暴露为普通资源。
- 同 blob 被多个 logical resources/nodes 使用可导出；删除一个不破坏另一个。
- replace 保留 id/node bindings，旧 unreferenced blob 清理。
- 不同 signatures 可复用 exact content path；case-fold alias 仍失败。
- legacy layout ZIP 与 nested dependencies 精确 round-trip。
- unused/source directory/original basename/provenance 不进入 production ZIP。

### 11.5 source boundary

- 三个 app 不各自实现 SHA-256、id normalization、case-fold resolution 或 flat allocator。
- editor 不复制 image-string layout、Spine atlas parser、VNI asset semantics 或 scene-layout parser。
- 不新增 `Math.random()`、网络上传、localStorage/IndexedDB、Node-only browser runtime dependency。
- 不出现 filename/symbol-code fallback 或宽泛 glob production closure。

## 12. 严格验收命令

使用 Node 24+，先跑受影响包，再跑 root 门禁：

```bash
pnpm --filter @slotclientengine/browserartifactio test
pnpm --filter @slotclientengine/browserartifactio typecheck
pnpm --filter @slotclientengine/browserartifactio lint
pnpm --filter @slotclientengine/browserartifactio build
pnpm --filter @slotclientengine/browserartifactio format:check

pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/rendercore format:check

pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check

pnpm --filter imgnumbereditor test
pnpm --filter imgnumbereditor typecheck
pnpm --filter imgnumbereditor lint
pnpm --filter imgnumbereditor build
pnpm --filter imgnumbereditor format:check

pnpm --filter symbolseditor test
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor build
pnpm --filter symbolseditor format:check

pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor build
pnpm --filter gamelayouteditor format:check

pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm format:check
git diff --check
```

- 不降低 coverage threshold；新增共享核心 branch coverage 不低于 80%。
- 失败记录 exact command、exit code、首个根因和是否为既有基线。
- root test 的无关已知失败也要隔离复现，不能写“全部通过”。
- 禁止更新 snapshot、删除断言、加 timeout、skip 或 ignore error 伪造绿色。

## 13. 浏览器验收清单

最终浏览器验收由用户执行。实施者不得把自动化测试冒充浏览器验收；交付时提供三个本地 URL、素材说明和 checklist。

### ImgNumber Editor

1. 上传大写/下划线 glyph 文件，确认 kebab id 和 provenance。
2. 映射字符、预览、导出并重导。
3. 检查 ZIP glyph path 为 hash-flat，字符串表现不变。

### Symbols Editor

1. 用“上传资源”选择图片、完整 Spine、VNI 和 ImgNumber ZIP。
2. 用“上传文件夹”导入多组资源。
3. 检查 review、歧义/冲突和未消费文件提示。
4. 显式绑定 states，预览后导出/重导。
5. 检查 ZIP 不泄漏原目录，Spine/VNI/image-string 可播放。

### Game Layout Editor

1. 上传 `BG_2.PNG`，确认 id `bg-2`。
2. 上传多 page Spine 文件组/目录并创建 node。
3. 直接上传 ImgNumber ZIP，确认自动解包为一个 resource。
4. 替换被多个 node 使用的 resource，确认引用不变、画面原子更新。
5. 导出 ZIP，检查 owned assets 扁平 hash 命名、dependency 自包含。
6. 重导后检查 preview、状态机、image-string 与 symbols package 行为。

## 14. 明确禁止项

- 只放宽 resource id 正则支持 `_`，继续维护多套规则。
- 只 lowercase 文件名而不改内部引用。
- hash 截断、弱 hash、随机/时间戳 filename 或依赖上传顺序。
- 把 original filename/path 当 production identity。
- 把 dependency 文件抹到父 package 同一个 `assets/`。
- 为 hash-flat 路径复制 Spine/VNI/image-string parser 到 app。
- generic JSON 替换、正则猜路径或宽泛 glob。
- 自动绑定唯一候选、按 symbol code/目录名猜资源语义。
- 静默忽略未知文件、`.DS_Store`、`__MACOSX` 或多余 ZIP entry。
- replacement 只换部分 Spine/VNI 文件或破坏共享 blob。
- 保留 raw path 与 logical graph 两套可编辑真相。
- 修改原始文件、上传网络或把 Blob URL 写入 manifest。
- 实现 texture atlas packing；本任务只建立未来合图的映射边界。

## 15. 完成定义

- 三个 editor 采用同一 id/hash/source path 基础规则。
- `BG_2.PNG` 无需放宽 schema 即可得到合法 `bg-2` logical id。
- owned payload 使用完整 SHA-256 hash-flat path，结构化引用同步改写。
- files、folder、已知 ZIP 有统一、严格、原子的 discovery/review。
- ImgNumber ZIP 在允许 consumer 中自动 bounded 解包。
- duplicate bytes 去重、logical identity 独立、replace/delete 引用计数正确。
- legacy packages 可导入并无损升级导出。
- nested dependency 自包含，exact closure 无 orphan。
- production 表现和 Spine/VNI/image-string/游戏边界不变。
- 受影响包与 root 门禁按真实结果记录。
- README、格式文档、AGENTS 长期规则和中文任务报告更新。
- 浏览器 checklist 已交给用户，未虚假声称由实施者完成。
