# 221 rendercore-symbol-data-core-editor-refactor 任务计划

## 1. 目标与完成定义

### 目标

对 `packages/rendercore` 中与 Symbols package、Symbols Editor 和游戏 symbol occurrence 直接相关的能力进行一轮重构级优化，把当前混合入口拆成单向依赖的三层：

```text
@slotclientengine/rendercore/symbol/data
  ↓
@slotclientengine/rendercore/symbol/core
  ↓
@slotclientengine/rendercore/symbol/editor
```

- `data` 拥有外层 Symbols package v1、内层 symbol-state-textures v1/v2、strict parser、默认 latest normalizer、纯引用/闭包/重写合同，不依赖 Pixi、DOM 或 mutable runtime。
- `core` 专门服务 game runtime 和 rendercore 内部 reel/Scene Layout，拥有编译后的 symbol program、resolved-resource prepare、Pixi/Spine/VNI/ImgNumber player、opaque game handle、pool 与严格 lifecycle；不承担 editor workspace、assets map materialize 或完整诊断快照。
- `editor` 组合同一个 data 与 core，提供 standalone Symbols package 的 mapped file 适配、
  authoring introspection、生成 preset 和 preview/inspection；不复制状态机、动画播放器或资源 owner。

同时彻底消除 `RenderSymbol` 与 `SymbolRender` 的倒装歧义：

- core 内部可变 Pixi occurrence player 统一命名为 `SymbolPlayer`，不作为 game public API 导出；
- `SymbolArea.getSymbol()`、replace/land/clone 返回的 opaque capability 统一命名为 `SymbolHandle`；它可以是 borrowed board occurrence 或 owned clone，并继续严格区分 `kind: "symbol" | "empty"`。

### 完成定义

- [ ] package 明确导出 `./symbol/data`、`./symbol/core`、`./symbol/editor`；旧混合 `./symbol` 与 root symbol wildcard 在仓库 consumer 原子迁移后移除，不保留 alias。
- [ ] 仓库生产源码、测试、文档、规则和错误文本中不再存在作为类型/类/API 名的 `RenderSymbol`、`SymbolRender`、`createSymbolRender` 或 `RenderSymbolPool`；`symbolRenderPriority` 这类明确表示“symbol 的 render priority”的业务字段不改名。
- [ ] 外层 package v1、内层合法 v1/v2 输入、v1→canonical v2 规则、state/equivalence/composite/value/ImgNumber/cascade、Spine/VNI 和 exact closure 语义保持不变；新导出仍写 v2。
- [ ] data 的默认 loader 对所有支持版本先按源版本 strict 校验，再确定性规范化为 latest；unknown future version 显式失败，consumer 不自行选择 upgrader。
- [ ] core public allowlist 不导出 editor map/materializer、VNI bundle importer、像素生成器、
      authoring introspection、完整 preview snapshot、raw `Container` 或内部 `SymbolPlayer`。
- [ ] manifest/package 只编译一次 immutable runtime program；每个 occurrence 只持有独立
      mutable player/state/controller，稳定 update 不重复 parse、建 lookup、生成未消费 snapshot。
- [ ] value/text/state mutation 继续先完整 preflight 再 commit；失败保持原显示、状态、value、attachment 和 resource identity，不留下半提交 occurrence。
- [ ] player/pool/Spine/VNI/ImgNumber/Object URL/Texture ownership 明确；prepare 失败 rollback，
      pool release 清空 occurrence-local 状态，destroy 幂等且不误销毁 borrowed object。
- [ ] Symbols Editor 通过 data + editor wrapper 完成 draft、mapped ZIP、资源检查、生成和 preview；app 仍拥有 Application/canvas/ticker/UI，不直接取得内部 `SymbolPlayer`。
- [ ] Game Layout Editor 的 standalone Symbols dependency IO/inspection 使用 editor wrapper，
      纯 manifest rewrite 使用 data，production reel preview 继续使用 Scene Layout owner；
      gamelayoutpkgcli 只使用 data。
- [ ] gameframeworks、Scene Layout、reel 和游戏 runtime 只依赖 data + core；symbolsviewer 作为
      tooling preview 使用 editor wrapper，不再成为内部 player 的 public API 例外。
- [ ] `game002v2`、`game003v2` 的源码、Vite 接线、tests 与 build 由本任务直接迁移；不得只写说明文档或留给游戏维护者。
- [ ] 交付 `docs/crave-task221-symbol-layer-migration.md`，按最终 API 列出 Crave vendored shared packages、app/bridgecore import 与 alias 修改、禁止覆盖项和验收；本任务不写外部 Crave 仓库。
- [ ] 完成 export boundary、parity、hot-path、rollback/destroy、直接 consumer 编译、真实浏览器 Performance/Memory/视觉验收，并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/src/symbol` 的 data/core/editor 分层、显式 barrels、类型拆分、版本加载、
  package resource、catalog/factory、state/animation player、公开 handle 与命名迁移。
- 与 symbol player 直接耦合的 `reel`、`scene-layout`、`presentation`、`symbol-image-string`、
  `symbol-value-presentation`、`symbol-cascade`、`symbol-win-carousel` 的 import/type/lifecycle 接入。
- Symbols Editor 的 mapped project、resource introspection、state texture generation、VNI bundle、
  preview 与测试迁移。
- Game Layout Editor 的 standalone dependency IO/inspection 与直接 tooling preview 收口；
  gamelayoutpkgcli 的 data-only 迁移；symbolsviewer 的 editor preview wrapper 迁移。
- gameframeworks 及 game002v2/game003v2 受 public symbol 类型、resource 或 root export 影响的
  直接 consumer 迁移。
- Crave task 221 精确手工迁移文档、定向 benchmark、README、`docs/symbol-package.md` 与稳定领域规则更新。

### 不包含

- 不修改 Symbols package 或 symbol-state-textures 的 wire version、字段、filename-key/map/ZIP
  合同、state lifecycle、动画时序、value tier、ImgNumber target 或 cascade 业务语义。
- 不重做 Symbols Editor UI、通用 import review/workspace/hash/ZIP 算法或图片 codec。
- 不让 Game Layout Editor 编辑 Symbols 内部 state/resource/value/cascade 配置；不让游戏 app
  接触内部 Pixi display tree、player cache 或 editor snapshot。
- 不把 `symbol-cascade`/`symbol-win-carousel` 改造成新的 gameplay DSL，不改变 reel motion、
  Scene Layout schema、logic operation plan 或业务 formatter。
- 不增加 Worker、OffscreenCanvas、atlas repack、placeholder/fallback、路径猜测、无界 cache、
  compatibility barrel 或 deprecated alias。
- 不修改 production assets、YAML、生成配置、根工具链、workspace 配置或 `pnpm-lock.yaml`。
- 不直接修改 `/Users/zerro/gitee.com/pixicrave/**`，不整目录覆盖其 `packages/bridgecore` 或其它 Crave-owned package。

## 3. 制定计划时的基线

```text
UTC: 2026-08-17T02:49:40Z
HEAD: 68a6cf6db8e999f1140991535738ebfae4596f96
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/{shared-game-runtime,editor-artifacts,game002,game003,loading-ui}.md`；目标目录下无补充 `AGENTS.md`。
- `packages/rendercore/src/symbol/index.ts` 当前以一个 `./symbol` barrel 同时导出 data、Pixi runtime、
  editor materializer/introspection/generator，并由 `src/index.ts` 再次 root wildcard 导出。
- `symbol/manifest.ts` 当前约 3191 行：同文件既有 v1/v2 strict parser/upgrade，也有 VNI URL
  resolution、official Spine `TextureAtlas/SkeletonJson` resource 构造和 runtime module binding。
- `symbol/package.ts` 当前约 1182 行：同时拥有 package/game config/closure、mapped assets map resolve、
  Blob/Object URL/Pixi Assets prepare、catalog、value controller 和 reel registry。
- `materialize-package.ts`、`introspection.ts`、`vni-export-bundle.ts`、
  `state-texture-generation.ts` 是 editor/tooling 能力，却与 production runtime 处在同一入口。
- `RenderSymbol` 是约 1257 行的 Pixi `VisualEntity`，由 reel、pool、catalog 和 value/ImgNumber
  controller 直接持有；`SymbolRender` 是约 487 行的 opaque borrowed/owned facade。两者只靠词序
  区分，且都从 public symbol/root barrel 可见。
- 当前 `SymbolCatalogModel.createRenderSymbol()` 会经 `getTextureSet()` clone texture descriptors，
  每个 player 的 `SymbolStateMachine` 再验证并建立 state/equivalence Map；
  `SymbolPackageResource.createCatalog()` 每次调用建立新 catalog，存在可静态消除的重复编译。
- task 217 已缓存稳定 state snapshot/update result，并移除一批 ticker 分配；本任务必须保持该成果，
  以 compiled program、void production update 和按需 editor inspection 继续收口，不重新引入 snapshot ticker。
- Symbols Editor 与 Game Layout Editor preview 当前直接保存/推进 `RenderSymbol[]`；两者还从混合入口
  取得 mapped package、introspection 与 runtime resource。gamelayoutpkgcli 也为纯 rewrite/atlas page
  traversal 导入整个混合 symbol surface。
- 当前仓库 consumer 已足以决定分层和命名，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “数据、core、editor 的包装”是三层责任与单向依赖，不是三份 parser、状态机、动画播放器或 package resource。
2. “core 专门给 game runtime”表示 core 可接收宿主准备的 exact bytes/module/Texture 并创建 Pixi player，
   但不理解 editor workspace、assets map review、materialize、preview guides 或完整 diagnostic snapshot。
3. “简洁、性能高、内存干净”落实为显式 export allowlist、package-level compiled program、
   occurrence-local compact mutable state、稳定 update 不构造未消费结果、有界 pool/cache 和可证明 destroy；
   未取得 profiler 数据前不承诺固定 FPS 或百分比。
4. “彻底解决命名”要求原子改名并删除旧类型，而不是保留两组 alias；内部 player 与公开 handle
   的职责从名称、export 和 source boundary 三处同时区分。
5. 其它 editor 按实际责任选层，不因名称中含 editor 就一律建立 raw symbol core。

### Consumer 分层决策

| Consumer                             | Symbols 入口                                                                                            | 原因                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Symbols Editor                       | `data + editor`                                                                                         | 拥有 authoring、mapped ZIP、资源 introspection/生成与 standalone preview；wrapper 复用 core |
| Game Layout Editor                   | dependency IO/readonly inspection 用 `editor`；纯 rewrite 用 `data`；production preview 用 Scene Layout | Layout 不拥有 Symbols 内部状态机或第二套 player                                             |
| symbolsviewer                        | `editor` preview wrapper                                                                                | 是诊断工具，需要直接 preview/inspection，不是 game runtime                                  |
| gamelayoutpkgcli                     | `data`                                                                                                  | 只做 typed closure、atlas page/reference traversal 与 rewrite，不加载 Pixi runtime          |
| reel / Scene Layout / gameframeworks | `data + core`                                                                                           | 拥有 production prepare、occurrence、pool、播放与 destroy，不接触 editor package            |
| game002v2 / game003v2                | gameframeworks/Scene Layout facade + core `SymbolHandle`                                                | 本任务直接迁移，只操作 exact occurrence capability，不创建内部 player                       |

未来 editor 只有在直接 author/import/vendor standalone Symbols package 或托管独立 Symbols preview
时使用 `editor`；只读写 manifest 用 `data`；通过 Scene Layout 等上层 production owner 预览时不直接
创建 symbol core。

### 关键决策

1. **使用三个显式子路径并移除旧混合入口。**
   - data/core/editor barrels 使用 allowlist，package export 与 source-boundary tests 锁定依赖方向。
   - rendercore 是 private workspace package，可原子迁移全部已知 consumer；保留旧 `./symbol` 或 root
     wildcard 会继续允许 game import editor 能力，因此不采用。
2. **data 是唯一 authored contract 与默认版本规范化 owner。**
   - package v1、inner v1/v2 types、source strict parser、latest 常量、默认 normalizer、state/reference/
     closure/rewrite pure helper 只实现一次；nested VNI/image-string 仅调用各自 data contract。
   - official Spine skeleton/atlas compatibility、Texture 或 URL module resolution不进入 data；data 只验证
     authored 结构和 exact typed reference，resource compatibility 在 core/editor 消费边界严格失败。
3. **core 消费一次编译的 immutable symbol program。**
   - package prepare 预计算 symbol/code/state/equivalence、animation/resource、value tier、ImgNumber node、
     scale/priority/capability lookup；reel/player creation 不重复 parse、clone descriptor 或建立相同 Map。
   - `SymbolPlayer.update(deltaSeconds): void` 为 production ticker 入口；状态/完成诊断使用标量 query 或
     按需 cached inspection，editor 完整 snapshot 不进入 steady update。
   - player/state/controller/scratch 每 occurrence 独占；manifest/program/decoded immutable resource 可共享，
     Spine/VNI/ImgNumber mutable timeline 不跨同时可见 occurrence 共享。
4. **用 `SymbolPlayer` 与 `SymbolHandle` 取代倒装命名。**
   - `SymbolPlayer` 只在 core internal/reel owner 内出现；catalog/factory、pool、slot field 和相关测试同步改名。
   - `SymbolHandle` 继承现有 opaque `CloneableRenderObject` capability，保留 exact occurrence、stale、empty、
     borrowed/owned、state/value/text/part/add/remove/clone 语义；不暴露其 player、Container 或 pool identity。
5. **editor wrapper 是 adapter/inspection，不是第二个 runtime。**
   - mapped map resolve/materialize/namespace、Spine/VNI introspection、VNI bundle、state texture preset 和
     authoring validation 属于 editor；generic bounded ZIP/UI/workspace 仍由 app/shared editor packages 拥有。
   - preview wrapper 组合同一 core player，提供稳定 view、update/replay 与按需 immutable snapshot；
     不创建 Application/canvas/ticker/RAF，destroy 不销毁 app 宿主。

## 5. 职责与合同

- **Data**：拥有 package/inner manifest types、版本 strict load/latest normalize、state preset/equivalence、
  typed resource/reference、game config linkage、exact closure/traversal/rewrite；输出 deep-readonly data。
- **Core**：拥有 compiled program、resolved resource transaction、Texture/Object URL owner、state/animation/
  value/ImgNumber player、catalog/factory、reel registry、pool 和 opaque `SymbolHandle`。
- **Editor wrapper**：拥有 mapped standalone package resolve/materialize、authoring introspection、VNI bundle、
  state texture generation、core-backed preview/inspection；复用 browserartifactio/editorresource。
- **Consumer**：game/runtime 不导入 editor；data 不导入 Pixi/core/editor；editor 组合 core但不复制其 player。
- **资源生命周期**：authored/compiled data 可共享；每个 `SymbolPlayer` 独占 mutable display/timeline；
  package resource拥有其创建的 Object URL/Texture/nested resource，pool只拥有idle player；borrowed handle
  不可 destroy，owned clone由caller destroy。
- **事务边界**：package/resource prepare 全部完成后发布；state/value/text/group batch先完整验证后commit；
  failure或abort释放本轮 owned candidate，已提交画面不回退也不半更新。
- **失败策略**：unknown version/kind/state/resource/path/animation/slot/value、closure/map/hash/orphan、
  stale handle、非法 delta和destroy后命令在责任边界显式失败，不 fallback。
- **禁止行为**：不复制状态机、不从 filename/hash 猜 identity、不保留首项/default resource fallback、
  不暴露 raw player/display tree/scratch、不以丢帧、跳校验或资源降级换性能。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/symbol/data/**
packages/rendercore/src/symbol/core/**
packages/rendercore/src/symbol/editor/**
packages/rendercore/tests/symbol/{data,core,editor}/**
packages/rendercore/benchmarks/symbol-runtime-hot-path.mjs
docs/crave-task221-symbol-layer-migration.md
tasks/221-rendercore-symbol-data-core-editor-refactor-<utctime>.md
```

### 预计修改

```text
packages/rendercore/package.json
packages/rendercore/src/index.ts
packages/rendercore/src/symbol/**
packages/rendercore/src/{reel,scene-layout,presentation,symbol-image-string,symbol-value-presentation,symbol-cascade,symbol-win-carousel}/**
packages/rendercore/tests/**
packages/rendercore/{README.md,vite.config.ts,tsconfig*.json}
packages/gameframeworks/{src/**,tests/**,README.md}
apps/symbolseditor/{src/**,tests/**,README.md,vite.config.ts}
apps/gamelayouteditor/{src/**,tests/**,README.md,vite.config.ts}
apps/gamelayoutpkgcli/{src/**,tests/**}
apps/symbolsviewer/{src/**,tests/**,README.md,vite.config.ts}
apps/{game002v2,game003v2}/{src/**,tests/**}
docs/symbol-package.md
docs/agent-rules/{shared-game-runtime,editor-artifacts}.md
```

### 原则上不应修改

```text
packages/{logiccore,uiframeworks,vnicore,pixiani}/**
packages/rendercore/src/{image-string,popup}/**
packages/{browserartifactio,editorresource}/**
assets/**
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
AGENTS.md
```

若执行时发现必须改变 Symbols wire schema、VNI/Spine/image-string public contract、Scene Layout schema、
通用 filename-key/hash 算法、production assets、根工具链或新增依赖，先停止说明范围扩张，不能修改计划
来事后合理化。

## 7. 实施步骤

1. **确认执行基线、命名表与 export/consumer allowlist**
   - 重核 HEAD/status，用 `rg` 固定旧 root/`./symbol` import、`RenderSymbol`/`SymbolRender` 和 public symbol
     consumer 矩阵；区分真正类型名与 `symbolRenderPriority` 等合法业务词组。
   - 先增加 data/core/editor export/source-boundary tests，并固定 package v1、inner v1/v2、state/value/
     composite/closure、empty/stale/clone、pool、preview 和 destroy parity 基线。
2. **建立独立 data 层**
   - 从 `manifest.ts`、`package.ts`、`types.ts` 拆出 authored/package types、source parser、默认 latest
     normalizer、pure state validation、game config linkage、reference/closure/rewrite helper。
   - 把 runtime module/resource creation移出 data；把 atlas page等CLI所需纯 traversal设计为无Pixi data helper，
     official Spine组合校验留在core/editor prepare；覆盖全版本矩阵、latest幂等和unknown future failure。
3. **建立编译后的精简 core**
   - 将latest manifest编译为immutable package/symbol program，预构建state/equivalence、resource、tier、node、
     scale/priority/capability lookup；catalog/reel registry/player共用同一program。
   - package runtime只接受resolved files/modules或明确URL loader结果；并发prepare全部settle后原子发布，失败
     rollback Object URL/Texture/VNI/Spine/ImgNumber candidate，destroy按owner顺序释放。
   - 将production player update改为void并保留按需标量query；value-text batch使用occurrence-local bounded scratch，
     不为稳定帧或未消费diagnostics创建对象。用constructor/identity测试证明parser/program/map只建立一次。
4. **原子迁移 `SymbolPlayer` / `SymbolHandle` 命名与生命周期**
   - 内部class、factory、pool、catalog、reel slot/occurrence和controller root统一使用`SymbolPlayer`；
     删除public concrete player export。
   - `SymbolArea`、spin session、replace/drop/transfer、`SymbolGroup`、presentation和gameframeworks统一返回/
     接受`SymbolHandle`；迁移part/options/source/adapter/error names，保留borrowed/owned/empty/stale语义。
   - pool release完整清理active Promise/Abort listener、attachments、filters/mask、state/value/text、Spine/VNI/
     ImgNumber timeline；cache/pool保持有界，double destroy与borrowed误销毁有定向测试。
5. **建立 editor wrapper 并迁移 tooling**
   - 迁移mapped assets map resolve/materialize、standalone package validation、Spine/VNI introspection、VNI bundle、
     state texture generation；API接受app已bounded normalize的file map，不接管ZIP extraction/UI/session。
   - 用composition包装同一个core player形成preview session，按需提供state/resource/layout snapshot；Symbols Editor
     保留Application/canvas/ticker/draft/review ownership，只挂载wrapper view并展示分层错误。
   - symbolsviewer迁移到同一editor preview能力，不再要求core导出内部player/catalog诊断面。
6. **按职责迁移其它 consumers**
   - Game Layout Editor dependency import/materialize/readonly inspection改用editor，typed nested rewrite改用data，
     production preview只走Scene Layout runtime/inspector；移除direct player数组和第二套symbol preview owner。
   - gamelayoutpkgcli改用data pure traversal/rewrite；Scene Layout/reel/gameframeworks使用core；直接修改game002v2/game003v2的source、tests和Vite接线，保持各自grid-cell/standard业务时序、loading和资源合同。
   - 更新Vite aliases、mocks与tests；搜索确认无旧入口、旧倒装类型、game→editor、data→core/editor、
     core→editorresource或editor内第二份状态机残留。
7. **性能、文档与收尾**
   - 增加固定package、可见occurrence数量、state/value/update序列的warm benchmark，记录重构前后prepare、
     player创建、steady update、pool循环的吞吐、构造计数和heap slope；wall-clock只进报告，不作flaky gate。
   - 更新README、Symbols package文档与领域规则；按最终diff编写Crave文档，要求原子同步共有shared packages、保留bridgecore，并精确迁移app/bridgecore aliases与root symbol imports，不提供旧入口alias。
   - 按第8节完成L2自动/人工验收，生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- data覆盖package v1、inner v1/v2 load→latest、latest幂等、invalid source、state/reference/closure/rewrite；
  core覆盖compiled program parity、state/Spine/VNI/value/ImgNumber、atomic mutation、empty/stale/clone、pool、
  prepare rollback与destroy；editor覆盖mapped/legacy package、map/hash/orphan、introspection/generation和preview。
- 相同manifest/resource、delta/state/value/text操作序列下，重构前fixture与新core的状态边界、动画完成、
  display order/visibility/transform、value tier、part/anchor、错误和最终画面保持一致。
- 热路径自动化使用parser/constructor/snapshot次数、stable identity、pool/cache上限与retained owner断言；
  不以本机毫秒阈值代替浏览器profiler。
- 不为旧混合入口或倒装名称增加alias；测试与fixture迁移到新职责入口。

### 验收级别

`L2`：修改rendercore symbol public subpaths、game-facing handle、runtime resource/lifecycle，并迁移
gameframeworks、Scene Layout、两个editor/tooling、CLI和直接游戏consumer；不修改正式schema、assets、
根工具链或lockfile。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks --filter symbolseditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter symbolsviewer --filter game002v2 --filter game003v2 typecheck
pnpm --filter symbolseditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter symbolsviewer --filter game002v2 --filter game003v2 test
pnpm --filter symbolseditor --filter gamelayouteditor --filter symbolsviewer --filter game002v2 --filter game003v2 build
git diff --check
```

共7条：rendercore完整行为/declaration/export、全部直接consumer编译、editor/CLI行为、Vite子路径解析和
最终diff分别需要证据；不默认运行根级typecheck/lint/test/build。新增直接consumer只加入现有L2定向命令。

### 人工验收

1. Node 24下在Symbols Editor新建项目，并分别打开合法inner v1、canonical v2、mapped与legacy direct
   Symbols ZIP；复验state lifecycle、composite、Spine/VNI、value tier、ImgNumber、生成、导出重导和错误分层。
2. 连续至少50次project切换、preview rebuild、全state replay、value/text更新、resource替换和destroy/recreate；
   用浏览器Performance/Memory记录frame time、allocation timeline与heap snapshot，确认listener、Object URL、
   Texture、Spine/VNI/ImgNumber、Container、player、handle和pool entry不持续增长。
3. 在Game Layout Editor导入/替换Symbols dependency，复验hash review、vendor、layout导出重导和Scene Layout
   production reel preview；确认没有direct editor player或第二套Symbols状态机。symbolsviewer复验同资源全状态序列。
4. 用相同真实package和操作序列对比重构前后static/image、official Spine、VNI、composite、tiered value、
   named ImgNumber、empty/stale/clone和pool reuse视觉；自动测试不能冒充视觉验收。
5. 分别启动game002v2与game003v2：复验Crave legacy grid-cell spin/refill/cascade/Nearwin/value和Minecart2 standard spin/win/CO ImgNumber；loading 99%/100%、公开轮带、场景资源和业务时序不得因import迁移改变。

### 独立验收建议

**必须**。涉及跨包public contract、核心命名、symbol production hot path、异步resource transaction、
Texture/Object URL/Spine/VNI/ImgNumber/player/pool ownership和editor mapped package边界。独立复验重点为
export/旧名零残留、状态/视觉parity、prepare rollback、pool reset/repeated destroy和consumer分层；最多重跑
rendercore test、全部直接consumer typecheck与Symbols Editor test三组命令。

## 9. 环境与依赖

- 使用仓库要求的Node 24与pnpm；shell没有Node时通过nvm切换到24。
- 依赖缺失时执行`CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库代理并重试。
- 预计不新增依赖、不修改lockfile；使用现有TypeScript/Pixi/official Spine/VNI、browserartifactio和
  editorresource能力。

## 10. 生成物、文档与规则

- 本任务不修改YAML、production ZIP或现有生成文件，不手改`dist/`；若意外触发生成物变化，先说明
  权威输入与正式generator/checker，不能手工同步。
- 更新`packages/rendercore/README.md`、`apps/symbolseditor/README.md`、`docs/symbol-package.md`，给出
  data/core/editor入口、`SymbolHandle`用法、editor preview host ownership和旧入口迁移说明。
- 新增`docs/crave-task221-symbol-layer-migration.md`：记录最终slotclientengine基线、Crave只读基线、共有package原子同步清单、bridgecore保留策略、app/bridgecore import与Vite alias diff、验证命令和浏览器场景。
- 稳定职责和命名发生变化，最小更新`docs/agent-rules/shared-game-runtime.md`与
  `docs/agent-rules/editor-artifacts.md`；不修改根`AGENTS.md`，不把benchmark数值或任务证据写进规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/221-rendercore-symbol-data-core-editor-refactor-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终allowlist/consumer/命名表、compiled program与lifecycle、实际修改文件、自动及浏览器验收、
game002v2/game003v2迁移、Crave文档基线、未完成项、计划偏差和独立验收结论；不收集无关release证据。

## 12. 风险、假设与待确认

### 风险

- `manifest.ts`当前把pure parse、runtime module binding和official Spine组合校验交织在一起；若只移动文件
  而不拆责任，会形成data对Pixi/core的反向依赖，必须由source-boundary test阻止。
- `RenderSymbol`当前同时是Container、state owner、controller root和cache key；改为内部`SymbolPlayer`时，
  Spine/VNI WeakMap cache、pool generation和handle stale判断必须同步迁移，不能只做文本替换。
- compiled program共享immutablelookup，但official Spine/VNI/ImgNumber player包含mutable timeline；错误共享会让
  两个可见occurrence串状态，必须用双occurrence并发测试证明隔离。
- current mapped/legacy loader与Scene Layout resolved-files bridge共用`createSymbolPackageResource`；拆分editor adapter
  时必须保留合法runtime resolved路径，不能用删除兼容输入来换core简洁。
- Game Layout Editor当前有direct tooling symbol preview；迁移必须确认每处是dependency inspection还是production
  preview，避免创建第二个Scene Layout/symbol owner或误删必要readonly诊断。
- 全量改名跨越reel、Scene Layout、gameframeworks和tests；旧名零残留搜索必须排除合法业务字段，同时不能漏掉
  error message、README、Vite mock与declaration export。
- Crave vendored完整RenderCore且保留独立bridgecore；文档若只要求复制symbol目录会造成exports/dependency漂移，必须以最终task 221 diff给出共有package原子同步范围，并明确后续task 219/220入口前提。

### 假设

- 外层Symbols package v1和内层symbol-state-textures v2仍是canonical authoring版本；未来提升latest时扩展同一
  data normalizer与全版本矩阵，consumer入口和三层职责不变。
- 同时可见occurrence不共享mutableplayer；package compiled program与decodedimmutable资源可共享，pool仍按现有
  bounded策略服务settledoccurrence。
- 仓库内private package允许本任务原子删除旧`./symbol`/root导出和倒装类型；没有仓库外未知consumer兼容承诺。
- Symbols Editor、Game Layout Editor和symbolsviewer继续由app拥有Application/canvas/ticker；wrapper只提供可挂载
  view/session并管理自身resource/player。

### 待确认

无。执行时若发现仓库外public contract、合法runtime输入必须依赖editor assets-map API，或命名迁移要求改变
wire/schema，先报告精确consumer与最小证据，不自行扩大兼容层、依赖或lockfile范围。
