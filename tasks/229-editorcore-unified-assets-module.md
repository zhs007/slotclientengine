# 229 editorcore-unified-assets-module 任务计划

## 1. 目标与完成定义

### 目标

在 `packages/editorcore` 建立四个 Editor 可复用的 Assets 模块，并以独立的 `apps/editordemo` 验证完整产品行为。模块统一管理图片、音频、视频、VNI、Spine 和下层 Editor package，向使用者提供同一套数据合同、单一导入事务、树状浏览、使用状态、程序使用状态、资源检查和 UI 布局。

Task 229 先证明共享模块本身成立，不在同一任务中重构 `imgnumbereditor`、`popupeditor`、`symbolseditor`、`gamelayouteditor`。后续迁移只能消费本任务已经由 demo 和自动化验证的 public contract，不再各自发明 Assets 状态机或 UI。

### 完成定义

- [x] `@slotclientengine/editorcore` 提供稳定的 `assets/data`、`assets/core`、`assets/adapters`、`assets/ui` public exports；headless 合同不依赖 DOM/Pixi，UI 可挂载到宿主 HTMLElement 并可完整 destroy。
- [x] 统一导入 API 和一个 UI 按钮可在同一批次混选普通文件与 ZIP，严格识别 PNG/JPEG/WebP、当前 AudioCore 支持的音频、MP4、VNI、Spine、ImgNumber、Popup、Symbols、Game Layout；尚无 loader 的文件保留为 opaque text/binary，已知格式错误、歧义、缺失、orphan 或不兼容输入使整个事务显式失败。
- [x] Assets 外层是可搜索、筛选、虚拟滚动的 root 列表；展开 root 后可逐层查看 typed closure，包括 Spine skeleton → atlas → page texture，以及 package → nested resource → payload。
- [x] Spine atlas/page 关系在导入 prepare 阶段由 strict parser 确定并随 root 原子提交；atlas page texture 只能作为所属 Spine closure 的内部节点，不能被 Picker、业务引用或程序 binding 单独使用。
- [x] 若确实要复用 Spine texture，用户必须另行导入一个独立顶层图片 key；相同 bytes 最终仍由 `assets.map.json` 的完整 SHA-256 payload 物理去重，两个 logical identity 不合并。
- [x] 每个 root 和内部节点都可查看 direct/transitive 使用位置；程序使用只来自宿主显式 typed binding。两种状态由引用图派生，不保存可能漂移的 `used/programmatic` 布尔副本。
- [x] ImgNumber、Popup、Symbols、Game Layout ZIP 可作为 typed dependency root；Popup/Symbols/Game Layout 的 nested owner、引用方向和 exact closure 在树中保留，leaf 不反向拥有或带入 sibling root。
- [x] `editordemo` 可完成导入、冲突 review、展开/折叠、搜索/筛选、选择/检查、程序 binding、删除、导出、重导和 rollback 验证，并提供大数据测试集验证布局不会一次创建全部 DOM rows。
- [x] 相同 bytes 的不同 logical keys/不同 owner 在导出物中共享同一个 content-addressed payload；重导后 root identity、树关系、引用/程序 binding 和 hash 去重结果一致。
- [ ] public API、README、领域规则、自动测试和构建完成；Editordemo 达到可由用户执行浏览器人工验收的状态，报告明确记录其结果待用户回填。

## 2. 范围

### 包含

- 新增 `packages/editorcore`，复用 `@slotclientengine/editorresource` 的 filename-key workspace、`assets.map.json`、SHA-256、冲突 review 和原子 commit，不复制这些底层算法。
- 新增 normalized asset catalog、typed dependency relation、root/leaf capability、usage projection、
  programmatic binding adapter、import/export materialization plan 和 lifecycle controller。
- 内置格式 adapter：
  - atomic image：PNG、JPEG、WebP；
  - atomic audio：复用 `audiocore/editor` 已支持的 MP3、OGG、WAV、M4A、AAC、WebM；
  - atomic video：MP4；
  - VNI：project JSON 或正式 runtime export ZIP；
  - Spine 4.3：一至多个 skeleton JSON、atlas 和 atlas 声明的全部 page textures；
  - package：ImgNumber、Popup、Symbols、Game Layout 的 mapped ZIP 与其 nested exact closure。
- 统一 Assets UI：工具栏、单一导入入口、筛选/search、虚拟化 tree list、状态列、inspector、import review、错误/空/loading 状态和可插拔 preview surface。
- `apps/editordemo` 的最小 host project、程序 binding、导出/导入和规模化 fixture；它只用于验证 EditorCore，不承载真实游戏/Editor 业务。
- 必要的 package manifest、workspace lockfile、README、领域规则和 source-boundary 测试。

### 不包含

- 不迁移或修改四个正式 Editor 的 draft、UI、ZIP 或 preview；迁移应拆成后续独立任务。
- Game Layout ZIP 作为可检查、可展开的 package root 导入；EditorCore 只管理其 manifest 与 exact asset closure，不接管 Game Layout 的项目编辑、配置或业务预览。
- 不实现统一“项目、配置、业务预览”模块；只为 Assets 提供内容检查与 preview provider 接口。
- 不在 EditorCore 复制 Pixi、official Spine、VNI、Popup、Symbols 或 ImgNumber runtime player；Task 229 的默认检查器只显示图片、原生 audio/video 和 compound metadata。动画预览由未来 host 注入 owner preview provider。
- 不做 atlas packing、图片/音视频转码、压缩、云端资源库、上传/CDN、多人协作或自动业务绑定。
- 不把 ZIP 目录、虚拟文件夹或 hash path 变成资源身份，不改变现有 production manifest schema，不批量转换仓库 `assets/`。
- 不让 atlas 内页、VNI 内部图片或 package leaf 自动晋升为顶层可复用 asset。

## 3. 制定计划时的基线

```text
UTC: 2026-08-19T06:01:19Z
HEAD: d12a5c2f73954d69fcb9374050339bd1a69c9847
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/scene-layout.md
tasks/119-editor-unified-flat-filename-resource-library.md
tasks/227-gamelayouteditor-audio-asset-workflow.md
packages/editorresource/README.md
packages/editorresource/src/{index,ingestion,key,workspace}.ts
packages/editorresource/tests/{editorresource,source-boundary}.test.ts
apps/{imgnumbereditor,popupeditor,symbolseditor,gamelayouteditor}/README.md
上述四个 app 的 resource model、import 和 Assets UI 入口
相关 rendercore、vnicore、audiocore public editor/data exports
```

当前结论：

- `packages/editorcore` 与 `apps/editordemo` 尚不存在。
- `packages/editorresource/src/workspace.ts` 已以 `EditorAssetWorkspace`、`reviewEditorAssetImport()`、`commitEditorAssetImport()`、`exactEditorAssetClosure()` 和 `materializeEditorAssetPayloads()` 实现唯一的 flat filename-key → hash payload 底座。
- `packages/editorresource/src/ingestion.ts` 已拥有 bounded files/ZIP ingestion、Finder metadata 清理、
  adapter discovery 和 profile choice；它不拥有 compound tree、宿主业务 usage 或 UI。
- 四个 app 都依赖 `@slotclientengine/editorresource`，但 typed resource 与 UI 仍分别实现：`popupeditor/src/io/resource-import.ts`、`symbolseditor/src/model/resource-import.ts`、`gamelayouteditor/src/model/resource-commands.ts`、`imgnumbereditor/src/ui/app-shell.ts`。
- `gamelayouteditor/src/model/editor-resource.ts` 已分别表达 image、audio、video、Spine、VNI、
  image-string；`gamelayouteditor/src/ui/resources-workspace.ts` 已有 search、status、引用和程序资源 UI，
  但只属于该 app 且标题仍是“扁平资源库”。
- `symbolseditor/src/model/editor-project.ts` 的 `EditorAssetLibrary`、
  `popupeditor/src/model/project.ts` 的 `resources/assets`、ImgNumber 的 `glyphs/unmappedFiles` 仍是不同结构。
- 现行 `docs/agent-rules/editor-artifacts.md` 禁止目录/虚拟目录并要求扁平 filename-key workspace；Task 229 需要把它精确演进为“底层 identity/payload 继续扁平，UI/typed closure 使用树状投影”，不能恢复 nested physical path 或第二份资源表。

## 4. 需求解释与技术决策

### 需求解释

1. “树状结构”指 typed ownership/dependency 的可展开 forest，不指磁盘目录。最外层只列可被 host
   选择的 asset roots；内部 JSON、atlas、texture、nested package payload 通过关系向下查看。
2. 图片、音频、视频是单节点 root；VNI 和 Spine 是 compound root；ImgNumber、Popup、Symbols、Game Layout 是
   package root。不同 host 通过 capability allowlist 决定允许导入/程序绑定哪些 root kind，但调用同一
   `importAssets()` 和同一个按钮。
3. “是否被使用”包含 direct host reference 和由已使用 root 传递到 leaf 的 transitive usage；
   “程序使用”必须对应稳定 program binding id/name，取消 binding 后若无其它引用即恢复 unused。
4. Game Layout 的 hash 优化沿用 `assets.map.json`：logical key、owner、业务 package id 和树节点不因
   bytes 相同而合并，只有最终 physical payload 合并。
5. Popup/Symbols 内嵌 ImgNumber 仍属于 package owner。树允许查看，但不能从 package 内部抽出后绕过
   owner manifest 绑定；未来正式 Editor 迁移时继续由 format owner 解释和重写 manifest。

### 关键决策

1. **EditorCore 建在 EditorResource 之上。** `editorresource` 继续拥有 bytes/key/hash/map/ZIP 安全；
   `editorcore` 拥有 typed root、关系、controller 和 UI。这样不会出现第二套 hash 或冲突算法。
2. **normalized graph 作为权威，forest 作为 UI 投影。** 多个 Spine skeleton 可共享 atlas/texture；严格
   单 parent 数据树无法无损表示。权威 catalog 保存唯一 node 与有向 typed edge，UI 为每个 root 生成
   tree occurrence/link。共享 leaf 可在多个 root 下出现，但只有一份 logical entry/bytes。
3. **UI node id 不是资源 identity。** occurrence id 仅由 `(owner, root, relation path, key)` 确定性生成，
   不写入 manifest/ZIP，也不能被业务 Picker 引用。持久身份仍是 owner schema 的业务 id 与 exact
   filename key。
4. **状态只派生，不复制。** host adapter 提供 typed references 与 programmatic bindings；EditorCore
   计算 direct/transitive counts、位置和 export reachability。UI 不直接修改 `used`，程序标记通过 host
   transaction 写回其正式 binding。
5. **一个 importer，多种 adapter。** 每个 source 必须被恰好一个 adapter claim；一个 batch 完成全部
   discover/profile/rewrite/hash/review/host validate 后一次 commit。adapter 不能按 stem、首项或上传顺序猜。
6. **内部 leaf 默认不可操作。** rename/delete/bind 作用于 root transaction；leaf 只能查看。单独复用必须
   新导入 top-level root，最终 hash dedupe 消除 bytes 重复。
7. **UI framework-neutral。** 仓库现有四个 Editor 都是原生 TypeScript/DOM；EditorCore 提供 mount/destroy
   控件和 CSS export，不引入 React/Vue 或第三方组件库。
8. **先以 demo 固化 contract。** demo 使用真实 shared public exports，不复制内部 API，不引用四个 app
   的源码；后续 app 迁移若需要扩大 contract，应先扩展 EditorCore 测试，而不是在 app 内加分叉。

## 5. 职责与合同

- **`assets/data`**：asset/root/relation kind、immutable catalog snapshot、import diagnostics、usage snapshot、host capability 和 preview descriptor 的 strict 类型/parser；不包含 DOM/bytes mutation。
- **`assets/core`**：catalog index、forest projection、search/filter/flatten、usage propagation、exact closure、import review orchestration、rename/delete/program-binding transaction、export materialization plan 和 rollback。
- **`assets/adapters`**：只组合现有 owner parser/introspection；输出 root、exact keys、typed edges、metadata、required profile 和结构化 rewrite。不得复制 Popup/Symbol/ImgNumber/VNI/Spine schema parser。
- **`assets/ui`**：`mountEditorAssetsView()`（最终名称执行时固定并记录）、event delegation、virtual rows、inspector、review dialog、preview provider slot、Object URL/revoke 和 destroy；不得持有业务 project 真相。
- **host adapter**：clone project、collect typed references、collect/set program binding、rename references、
  validate candidate 和可选 preview provider。EditorCore 不猜 node/state/layer/mode 的业务语义。
- **基础数据**：payload 继续使用 `EditorAssetEntry`/`EditorAssetWorkspace`；compound descriptor 至少声明 `kind`、root identity、owner、exact keys 和 typed relations。root kind 固定为 `image | audio | video | spine | vni | image-string | popup | symbols | game-layout | text | binary`，未知值 strict fail。
- **关系方向**：只允许 root/manifest/skeleton 指向 dependency；atlas/page、glyph、VNI image、nested
  package leaf 不反向拥有 root。shared leaf 不会使未使用 sibling root 进入 closure。
- **使用状态**：root 的 direct reference、program binding、transitive exportability 分开呈现；leaf 显示
  “由哪些 root/owner 带入”。program binding 必须有 exact typed name/id，不接受匿名 boolean。
- **导入生命周期**：source index/extract/discover/profile/hash/review 均属 prepare；host candidate validation 和可选 preview prepare 成功后才 commit。失败/取消需释放临时 bytes view、Object URL、media element 和 provider handle，保留旧 catalog/project/UI selection。
- **导出合同**：EditorCore 只产出 host manifest 所需的 roots/typed closure 与 EditorResource map/payload plan；
  owner adapter 物化正式 manifest。相同 canonical bytes/path 只写一次，logical key 不合并。
- **失败策略**：未知 kind/version、同 source 多 adapter claim、未 claim 文件、profile 未选、关系环、越权 leaf
  binding、大小写 alias、同名不同 bytes 未 review、缺 closure、orphan、bad hash、失效 host reference 全部阻止 commit。
- **禁止行为**：不得增加 nested physical asset directory、hash/path identity、silent alias/suffix、首项默认、
  generic JSON/atlas 字符串替换、内部 leaf Picker、重复 owner parser 或部分提交。

## 6. 文件范围

### 预计新增

```text
packages/editorcore/package.json
packages/editorcore/README.md
packages/editorcore/{tsconfig.json,tsconfig.build.json,tsconfig.eslint.json,eslint.config.cjs,.prettierignore}
packages/editorcore/src/assets/data/**
packages/editorcore/src/assets/core/**
packages/editorcore/src/assets/adapters/**
packages/editorcore/src/assets/ui/**
packages/editorcore/src/assets/index.ts
packages/editorcore/tests/**
apps/editordemo/package.json
apps/editordemo/README.md
apps/editordemo/index.html
apps/editordemo/{vite.config.ts,tsconfig.json,tsconfig.eslint.json,eslint.config.cjs,.prettierignore}
apps/editordemo/src/**
apps/editordemo/tests/**
```

### 预计修改

```text
pnpm-lock.yaml
AGENTS.md
docs/agent-rules/editor-artifacts.md
packages/editorresource/README.md
```

若 owner 的现有 data/editor export 无法让 adapter 调用已存在的纯 parser/introspection，可最小修改其 `index.ts` 导出；禁止因此修改 parser 行为或把 app 私有 parser 搬入 EditorCore。发生该情况必须在执行报告逐项说明。

### 原则上不应修改

```text
apps/imgnumbereditor
apps/popupeditor
apps/symbolseditor
apps/gamelayouteditor
apps/gamelayoutpkgcli
packages/rendercore 的 runtime/core 实现
packages/vnicore 的 runtime/core 实现
assets/**
```

若 demo 无法证明合同而必须改正式 Editor、production schema/runtime 或新增第三方 UI/virtualization 依赖，属于明显范围扩张，执行时先停止说明，不能通过修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线与 public owner API**
   - 重新核对 HEAD、工作区、Node 24/pnpm 和计划引用文件。
   - 列出每种 format 使用的现有 strict parser、closure collector、rewrite/materialize API；缺少 narrow export
     时只开放现有纯函数，不在 EditorCore 重写 schema。

2. **建立 EditorCore 分层和 immutable 数据合同**
   - 创建 package exports、data types/parser、catalog/node/edge index 和 root forest projection。
   - 用 ephemeral occurrence id 支持共享 leaf 的多 root 展开；检测 cycle、dangling edge、重复 root 和越权
     top-level leaf，保持 filename key/hash 两层身份不变。

3. **实现 host usage/programmatic 和资源命令**
   - 定义 host adapter/capabilities，计算 direct/transitive usage、program binding 与 export reachability。
   - 在统一 candidate transaction 内实现 root rename/delete、显式 keep-both、program bind/unbind 和引用重写；
     被引用 root、内部 leaf 或失效 binding 不得绕过 validator。

4. **实现统一 adapter 与导入事务**
   - 复用 bounded ingestion 和 EditorResource review/commit；实现 atomic、Spine、VNI、ImgNumber、Popup、Symbols、Game Layout
     adapters 与明确 claim priority。
   - Spine 在 prepare 解析 skeleton/atlas/pages，多 skeleton 共享 leaf；VNI 多 runtime profile 要求显式选择；
     nested package 只提交 exact mapped closure。
   - 一次 review 展示 add/noop/overwrite/keep-both、受影响 roots/host refs、hash/bytes 和 blocking diagnostics；
     所有 adapter 与 host validation 成功后单次 commit。

5. **实现 Assets UI 与大数据布局**
   - 提供顶部 sticky toolbar、唯一导入按钮、root kind/usage/programmatic/error filters、search 和计数。
   - 主区使用固定行高 virtual tree/treegrid，仅渲染 viewport + overscan；展开状态、选择和 scroll anchor 以
     root/occurrence key 保持，不把完整递归 DOM 缓存在 session。
   - inspector 显示 metadata、typed dependency、direct/transitive refs、hash/size、program action 和安全删除；
     image/audio/video 使用按需 Object URL，compound 默认显示结构化 metadata，provider destroy 时完整释放。
   - 窄屏改为 list → inspector 顺序布局；补齐键盘展开/选择、focus、ARIA label、loading/error/empty 状态。

6. **建立 Editordemo 端到端验证宿主**
   - demo 只依赖 EditorCore public API，拥有最小 project/reference/program-binding adapter 和明确 export/import。
   - 提供小型全格式 fixture 入口与确定性规模 fixture（至少 10,000 roots、包含共享 leaf 和深层 package）；
     fixtures 使用测试生成/仓库可提交的小资源，不复制 production 美术表。
   - demo 导出使用自身 versioned manifest + `assets.map.json` + content-addressed payload；重导严格复原树和
     host binding。该 manifest 只是 demo host 合同，不成为四个正式 Editor 的第二份资源表。

7. **补测试、文档和长期规则**
   - 单测保护 catalog/forest、adapter claim、Spine/VNI/package closure、usage、program binding、hash dedupe、
     conflict/rollback/delete/destroy 和 strict failure。
   - UI 测试保护唯一按钮、tree keyboard、filter/search、virtual row 上限、selection、review、Object URL cleanup；
     demo 集成测试覆盖导出/重导和相同 bytes 多 owner 去重。
   - README 说明 package layering、host 接入、capability、生命周期和后续迁移步骤；更新根规则路由与
     editor-artifacts 的“flat identity + tree projection”长期合同。

8. **验收与报告**
   - 按用户在执行会话中的明确决定执行定向 L2：验证 EditorCore、Editordemo 和 lockfile parity，不扩大到四个正式 Editor 或整仓行为验收。
   - 浏览器人工验收由用户执行；本执行会话提供可运行 demo、清单并在报告中记录为待用户验收，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- adapter 测试使用真实 strict owner manifest/atlas 结构和最小 bytes，不用只返回成功的 fake parser 代替。
- 覆盖图片/音频/视频、VNI profile、单/多 skeleton、shared atlas、多 page、四类 package 和 nested ImgNumber。
- 覆盖同 key 同 bytes noop、同 key 不同 bytes review、keep-both 结构化 rewrite、跨 owner 同 bytes hash dedupe。
- 覆盖 direct/transitive/programmatic/unused 四种状态、leaf 越权操作、引用中删除、取消 binding 后 closure 变化。
- 覆盖 unknown/ambiguous/orphan/missing/cycle/bad hash/bad media/profile 未选、prepare failure 与完整 rollback。
- 覆盖 virtual list 大规模展开/filter 后 DOM row 数受 viewport + overscan 限制；不以 JSDOM 时间断言冒充真实
  浏览器流畅度。

### 验收级别

`定向 L2`。规划稿原按新增 workspace importer/lockfile 采用 L3；执行前用户明确指出本任务不会接入正式 Editor，并要求浏览器验收由用户执行。因此自动验收只覆盖新 package、新 demo、直接 owner 依赖构建和 frozen lockfile parity，不以尚未发生的正式 Editor 迁移为由扩大到整仓。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/editorcore typecheck
pnpm --filter @slotclientengine/editorcore lint
pnpm --filter @slotclientengine/editorcore test
pnpm --filter @slotclientengine/editorcore build
pnpm --filter @slotclientengine/editorcore format:check
pnpm --filter editordemo typecheck
pnpm --filter editordemo lint
pnpm --filter editordemo test
pnpm --filter editordemo build
pnpm --filter editordemo format:check
CI=true pnpm install --frozen-lockfile
git diff --check
```

### 人工验收

- 在真实浏览器打开 Editordemo，一次混选 loose image/audio/video/Spine 与 VNI/ImgNumber/Popup/Symbols/Game Layout ZIP，
  确认只有一个入口和一份 review，commit 后 root/child 层级正确。
- 展开 Spine 和 nested package，确认 atlas texture/internal ImgNumber leaf 不能被单独 bind；另行导入同 bytes
  图片后出现独立 top-level root，导出 ZIP 只有一份相同 hash payload。
- 创建 host reference 与 program binding，确认状态、filter、删除阻止、取消 binding 和 exact closure 实时一致；
  导出后重导结果不变。
- 加载 10,000-root fixture，连续搜索、筛选、展开、滚动和打开 inspector，确认 DOM 未全量膨胀、选择不跳动、
  页面可交互；记录浏览器和观察结果，不用单测冒充人工性能验收。
- 触发同名冲突、缺 atlas page 和取消导入，确认旧 project/tree/preview 保持且临时 Object URL/media 被释放。

### 独立验收建议

正式 Editor 开始迁移前再做独立复验。本任务当前隔离在 EditorCore/Editordemo，用户浏览器验收重点为共享 leaf tree projection、atomic rollback、logical identity 与 physical hash dedupe 分离。最多运行：

```bash
pnpm --filter @slotclientengine/editorcore test
pnpm --filter editordemo test
pnpm --filter editordemo build
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`；创建新 workspace importer 后使用当前 pnpm 按正常
  流程更新 lockfile，不切换 npm/yarn、不升级工具链。
- Task 229 不新增第三方 runtime/UI/virtualization 依赖。EditorCore 只依赖现有 workspace 的
  `browserartifactio`、`editorresource`、必要 format-owner data/editor exports；Editordemo 依赖 EditorCore。
- 只有实际下载失败后才设置仓库模板中的本地代理并重试原命令。

## 10. 生成物、文档与规则

- 本任务预计没有 YAML 或生成 TypeScript；若执行中引入生成物，必须使用正式生成器并运行 checker，不能手改。
- `packages/editorcore/README.md` 记录分层、public API、root/leaf 权限、adapter、host、事务和 destroy 示例；
  `apps/editordemo/README.md` 记录运行、fixture 和人工验收步骤。
- 更新 `docs/agent-rules/editor-artifacts.md`：filename key 与 payload 仍扁平；typed asset tree 是由 owner relation
  派生的唯一共享视图；内部 leaf 不得独立使用；physical payload 按 hash 去重。
- 更新根 `AGENTS.md` 的领域规则路由，使 `packages/editorcore` 与 `apps/editordemo` 后续任务必须读取
  `editor-artifacts.md`；不把具体 UI 行数、fixture 数量或本任务证据写入根规则。
- `packages/editorresource/README.md` 只补充其作为 EditorCore 底层 primitive 的边界，不把 UI/compound contract
  反向塞入该包。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/229-editorcore-unified-assets-module-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终 public exports、root/relation/usage/programmatic 合同、实际文件、owner API 复用或最小导出、
lockfile 变化、自动化结果、浏览器/大数据验收、计划偏差和独立验收结论。

## 12. 风险、假设与待确认

### 风险

- typed ownership 本质是可共享叶子的 DAG；若强行存成单 parent tree，会复制 identity 或错误导出 sibling root。
  本计划以 normalized graph + tree occurrence 解决，并用 shared-atlas 测试锁定。
- 现有四个 app 的 importer 含有不同的 image decode、Spine/VNI/package 细节；Task 229 必须复用 owner API，不能以
  “先做 demo”为由复制一套第五实现。
- ZIP 中 nested package 可能很大；bounded extract、异步 hash、virtual UI 和显式 cleanup 必须同时成立，单纯
  virtualize DOM 不能解决 bytes 内存峰值。
- package replacement、keep-both 与 filename namespace 需要结构化 rewrite；如果 owner 没有公开安全 rewrite，
  只能补 narrow owner API，不能 regex 替换。
- 新 workspace importer 会更新 lockfile；执行用户指定的定向 L2 与 frozen lockfile parity，必须保留用户后续无关修改并区分既有失败。

### 假设

- Task 229 支持的媒体格式以当前正式 owner 能力为准；“图片/音频/视频”不表示接受浏览器能解码的任意扩展名。
- 正式 Editor 迁移将在 demo 通过后另行规划；本任务的 capability/host adapter 已为不同 Editor 的允许类型和
  binding 行为留出扩展点。
- hash 去重发生在 package materialization，不能替代 authoring logical identity 或 owner closure。

### 待确认

无。若实施发现某种 package 没有可复用的 strict parser/rewrite public API，应按文件范围中的规则先报告具体缺口，
不自行扩大到 production schema 重构。

## 13. 完成清单

- [x] EditorCore Assets 数据、core、adapter、UI 分层和唯一导入入口完成。
- [x] 十一类 root、Spine/VNI/package tree、nested dependency、opaque fallback 和 leaf 权限符合计划。
- [x] usage/programmatic、rename/delete/conflict、rollback/destroy 和 exact closure 有测试。
- [x] logical identity 与 hash payload 去重严格分离，demo 导出/重导一致。
- [ ] 大数据 virtual tree 自动化与真实浏览器验收完成。
- [x] 四个正式 Editor 未被提前迁移或夹带修改。
- [x] lockfile、README、规则和 public exports 同步。
- [x] 定向 L2 与 frozen lockfile parity 通过，用户浏览器验收状态明确。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md`、本计划和涉及 owner 的 public API；
2. 核对 Git 基线与工作区，保留所有用户已有和无关修改；
3. 按“EditorResource primitives → EditorCore contract/UI → Editordemo”的顺序实现，不另定一套身份模型；
4. owner 缺少 narrow public export 时先证明缺口并只做最小开放；重大 schema/runtime/app 扩张先停止说明；
5. 只在全部 adapter prepare、host validation 和 preview prepare 成功后 commit；
6. 运行本计划定向 L2；浏览器人工验收留给用户并提供清单；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
