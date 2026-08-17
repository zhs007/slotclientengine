# 222 rendercore-gamelayout-data-core-editor-refactor 任务计划

## 1. 目标与完成定义

### 目标

对 `packages/rendercore` 的 Game Layout（代码域名为 `scene-layout`）进行一轮重构级优化，
把当前混合的数据合同、游戏运行时、standalone package/editor 适配拆成单向依赖的三层：

```text
@slotclientengine/rendercore/scene-layout/data
  ↓
@slotclientengine/rendercore/scene-layout/core
  ↓
@slotclientengine/rendercore/scene-layout/editor
```

- `data` 拥有 Scene Layout v1/v2/v3 authored data、strict source parser、唯一 latest
  normalizer、runtime allocation、纯 geometry/reference/closure/rewrite 合同，不依赖 Pixi、DOM、
  runtime mutable state 或 editor workspace。
- `core` 专门服务 game runtime、gameframeworks 和 rendercore 内部 presentation，拥有一次编译的
  immutable runtime program、resolved-resource prepare、layout/package runtime、reel/Popup/transition
  组合和严格 lifecycle；不承担 assets-map integrity、ZIP materialize、authoring draft 或完整诊断快照。
- `editor` 组合 data 与同一个 core，为 Game Layout Editor 及直接操作 standalone Layout package 的
  editor/viewer 提供 mapped package adapter、authoring inspection 和 preview wrapper；不复制生产节点、
  reel、Popup、transition 或 render-object 状态机。

### 完成定义

- [ ] package 只公开 `./scene-layout/data`、`./scene-layout/core`、
      `./scene-layout/editor` 三个职责入口；旧混合 `./scene-layout` 与 rendercore root 的
      Scene Layout wildcard 在仓库 consumer 原子迁移后移除，不保留 alias 或双入口。
- [ ] Scene Layout v1/v2/v3 schema、v1/v2→canonical v3、`runtimeAllocation`、geometry、mode/
      variant、node/reel/Popup order、directed transition、runtime resource 与 legacy package 行为保持不变。
- [ ] data 不出现 Pixi、DOM、Blob/Object URL、Application、runtime player、editorresource、
      browserartifactio 或 core/editor 反向依赖；所有 consumer 复用同一个默认 latest loader。
- [ ] core public allowlist 只包含生产 resource/runtime factory、command、标量 query、必要 immutable
      geometry value、opaque layer/object/anchor capability 与 destroy；不公开 mapped ZIP/materializer、
      editor draft、完整 mode/node/player snapshot、Application/canvas/ticker/RAF 或 mutable display tree。
- [ ] manifest/latest/allocation 只编译一次为 immutable runtime program；mode、edge、node、binding、
      layer、runtime-resource 与 image-string node lookup 不在 steady update 或每次 query 重扫/重建。
- [ ] `update(deltaSeconds): void` 的稳定帧不生成未消费 snapshot、临时 Map/Set、排序或可避免数组；
      游戏读取 stable mode/phase 使用标量 query，完整诊断只由 editor inspector 按需物化。
- [ ] node、Texture/Object URL、Spine/VNI/ImgNumber、Symbols reel entry、Popup、transition、video、
      RenderObject、listener 和 waiter 的 owner/prepare/commit/rollback/destroy 明确；失败或 destroy
      during init 不留下 late commit、半挂载节点或可达资源，重复 destroy 幂等。
- [ ] Game Layout Editor 的 model/rewrite 使用 data，standalone package IO 与完整 preview/inspection
      使用 editor wrapper；Application/canvas/ticker、draft、UI、workspace 和通用 ZIP review 仍由 app 拥有。
- [ ] gamelayoutpkgcli 只使用 data；gameframeworks、game002v2、game003v2 的生产路径只使用 core
      或其 gameframeworks facade；Game Viewer 2 的配置/检查使用 editor，独立运行窗口使用 core。
- [ ] Popup/Symbols/ImgNumber Editor 当前无直接 Scene Layout consumer，不为形式统一新增依赖；未来只有
      author/import/vendor 完整 Layout package 或托管独立 Layout preview 时才使用 editor wrapper。
- [ ] 完成export/source boundary、行为parity、hot-path、rollback/destroy和直接consumer自动验收；真实浏览器Performance/Memory/视觉验收由用户执行，执行会话只记录待验收项，并生成UTC中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/src/scene-layout` 的 data/core/editor 目录、显式 barrels、authored/runtime 类型拆分、
  runtime program、resource/runtime 内部模块化、测试和 benchmark。
- 把 `configured-round-adapter`、template recipe 等玩法/框架组合移到 `packages/gameframeworks`；
  rendercore core 保留通用 Scene Layout 原子 runtime，不继续拥有宿主 Application。
- Game Layout Editor 的 package adapter、preview session、inspector、import/export/manifest consumer 迁移。
- gamelayoutpkgcli 的 data-only traversal/rewrite/closure 接入。
- Game Viewer 2 的 authoring/inspection 与 runtime host 分层；Game Viewer/gameframeworks ZIP template
  入口在 standalone artifact adapter 与 core runtime 间建立显式边界。
- gameframeworks以及仓库内game002v2、game003v2受Scene Layout public export、标量query或facade影响的代码迁移。
- 相关 Vite alias、mocks、tests、README、Scene Layout 文档、领域规则和 Crave 手工迁移说明。

### 不包含

- 不新增或修改 Scene Layout manifest/version/字段、runtime allocation wire、filename-key/map/ZIP 格式、
  geometry 公式、动画时序、reel motion、Popup/Symbols/ImgNumber/VNI schema 或游戏业务流程。
- 不重做 Game Layout Editor UI、draft 产品能力、资源导入 review、通用 workspace/hash/ZIP 算法。
- 不让其它 editor 因名称含 editor 就直接创建 Scene Layout core，或让 Layout Editor 编辑 nested
  Popup/Symbols/ImgNumber owner-owned 内部配置。
- 不增加 Worker、OffscreenCanvas、全局 runtime、启发式 LRU、无界 cache、placeholder、路径猜测、
  首项 fallback、静默 alias 或 compatibility barrel。
- 不修改 production assets、YAML、生成资源表、根工具链、workspace 配置或 `pnpm-lock.yaml`。
- 不修改外部Crave项目的任何代码、配置或资源；只提供按最终API编写的迁移文档，由用户手动修改和验收Crave。

## 3. 制定计划时的基线

```text
UTC: 2026-08-17T03:55:38Z
HEAD: dd28a55c897d7e112fd2c9ad9aa0359e1179e534
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts,gameviewer-round-flow,gameviewer2-local-flow}.md`；
  目标目录没有补充 `AGENTS.md`。
- tasks 219–221 已把 ImgNumber、Popup、Symbols 统一为 `data → core → editor`，并通过 public/source
  boundary、compiled program、void update、按需 inspection 与 lifecycle 测试建立可复用模式；task 222
  不恢复这些领域的混合入口或第二份 runtime。
- `packages/rendercore/src/scene-layout` 当前 20 个 TypeScript 文件、约 16,076 行；
  `package-runtime.ts` 约 3,514 行、`manifest.ts` 约 1,716 行、`package-resource.ts` 约 1,462 行、
  `types.ts` 约 960 行，职责集中且内部边界难以由 import path 证明。
- `src/scene-layout/index.ts` 同时导出 manifest/upgrader、geometry、package/resource/runtime、production ZIP、
  configured round、local authoring/flow 与 presentation；`package.json` 只有混合 `./scene-layout` 加一个
  仅含 award inspector 的 `./scene-layout/editor`。
- `types.ts` 同时 import Pixi `Container`、Symbol core、Popup core 与纯 authored schema；`manifest.ts`
  直接依赖 browserartifactio/editorresource；`production-zip.ts`、`package-resource.ts` 又混合 map integrity、
  closure、Blob/Object URL 和生产 resource prepare，data/core/editor 依赖方向尚未成立。
- `configured-round-adapter.ts` 与 `local-scene-flow.ts` 在 rendercore 内创建 Pixi `Application`；
  `local-scene-authoring.ts` 混合 project schema、随机 authoring、ZIP inspection 与 readiness，均不应扩大
  production core facade。
- task 216 已让 package runtime 使用 canonical v3 allocation并保留跨 mode node/Popup/reel owner；task 217 已让 production ticker 使用 void update并消除一批逐帧 snapshot。当前仍有 mode/edge `.find()`、
  query 时 `.map/.filter/Object.freeze` 及 `getGameModeSnapshot()` 完整对象构造，可由 compiled program/
  editor inspector 继续收口。
- Game Layout Editor 当前 model/IO/preview 均从混合入口导入，preview 另从 editor 入口取得单一 award inspector；
  app 自己组合 package validation/resource/runtime 与大量完整 mode/node snapshot。
- gamelayoutpkgcli 只做 manifest、reference、closure、map/ZIP 优化，却导入整个混合入口；Game Viewer 2
  的配置 UI 与独立运行窗口也从同一入口取得 authoring、inspection、ZIP、Application/runtime 能力。
- Popup Editor、Symbols Editor、ImgNumber Editor 当前没有直接 Scene Layout import；仓库事实不支持让它们
  强制依赖 Scene Layout editor wrapper。
- `docs/scene-layout-manifest.md` 仍有“Editor 恒写 v2”等过期文字，需随分层同步为当前 canonical v3。

## 4. 需求解释与技术决策

### 需求解释

1. “数据、core、editor 的包装”是三层责任与单向依赖，不是复制 parser、package loader、runtime
   或 display tree。
2. “core 专门给 game runtime”表示 core 可使用 Pixi/Spine/VNI/ImgNumber 并接受宿主 input/video factory，
   但不创建 Application/canvas/ticker/RAF，不理解 editor workspace/map integrity/diagnostic UI。
3. “简洁、性能高、内存干净”落实为小 public allowlist、一次编译的 runtime program、稳定 ticker
   无诊断分配、manifest-bounded cache、明确 ownership 和可证明 cleanup；没有 profiler 数据前不承诺固定 FPS。
4. editor wrapper 依据 consumer 实际责任使用：完整 standalone package/preview/inspection 用 editor；
   纯 schema/rewrite 用 data；production command/playback 用 core。并非所有 editor 都必须导入 wrapper。

### Consumer 分层决策

| Consumer                       | Scene Layout 入口                                                    | 原因                                                                               |
| ------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Game Layout Editor             | model/rewrite 用 `data`；package IO、preview、inspection 用 `editor` | 拥有完整 Layout authoring，但 production preview 必须复用同一 core                 |
| gamelayoutpkgcli               | `data`                                                               | 只做 typed traversal/rewrite/closure；map/hash/ZIP 由其现有 artifact boundary 负责 |
| gameframeworks / game runtime  | `core`，authored类型按需用 `data`                                    | 只准备并执行 production runtime，不接触 editor snapshot/workspace                  |
| Game Viewer                    | 配置/ZIP readiness 通过 gameframeworks tooling facade；运行用 core   | app 不绕过 framework，runtime 不拥有 editor UI                                     |
| Game Viewer 2                  | 配置/检查用 `editor`；独立窗口由 app-owned Application 驱动 `core`   | 同一产品内明确区分 authoring 与 runtime host                                       |
| Popup/Symbols/ImgNumber Editor | 当前不使用                                                           | 它们只拥有各自 standalone package，不应创建完整 Layout runtime                     |

### 关键决策

1. **三个显式子路径，删除混合入口。**
   - barrels 使用 allowlist；public/source-boundary tests 禁止 data→core/editor、core→editor 和
     core→editorresource/browserartifactio。
   - 仓库内已知 consumer 原子迁移，不保留 `./scene-layout` 或 root wildcard 来绕过职责边界。
2. **data 是唯一 authored/latest owner。**
   - 拆出 authored types、v1/v2/v3 strict parser、默认 latest loader、allocation、pure geometry、
     exact direct reference/closure/rewrite helper；nested package 只调用各自 data contract。
   - map/hash/size/orphan、ZIP extraction、Blob/Texture/player 不进入 data；unknown future version 显式失败。
3. **core 消费 immutable compiled layout program。**
   - resource prepare 后预计算 mode/variant active refs、node/binding/order、transition edge、layer ref、
     runtime-resource 与 stable name列表；runtime 不重复 parse/upgrade或按请求扫描 manifest。
   - core facade保留 game command、scalar mode/phase query、geometry snapshot、opaque layer/object/anchor和
     lifecycle；完整 mode/node/video/popup diagnostics由editor inspector从同一runtime按需生成。
4. **宿主与 recipe 不塞进 core。**
   - configured round/template composition归 gameframeworks；Game Viewer 2 app创建Application/canvas并接管ticker。
   - core只返回可挂载view/container能力并消费完整finite non-negative delta；不复制uiframeworks/app host。
5. **editor wrapper是adapter/inspection，不是第二个runtime。**
   - wrapper组合standalone mapped/legacy package resolve/materialize、authoring validation、core preview session
     和immutable inspection；generic bounded ZIP/review/draft/UI仍在app/shared editor packages。
   - preview session只借用或按合同拥有一个core runtime，不创建第二套node/reel/Popup/transition state。

## 5. 职责与合同

- **Data**：Scene Layout manifest/version types、strict load/latest normalize、runtime allocation、geometry、
  typed reference/closure/rewrite和错误；输出deep-readonly值。
- **Core**：compiled program、resolved resource transaction、layout/package runtime、mode/transition、stable
  node/reel/Popup owner、runtime resource factory、presentation surface与opaque capability。
- **Editor wrapper**：standalone mapped/legacy package adapter、materialize/namespace/authoring validation、
  core-backed preview与完整inspection；复用browserartifactio/editorresource，不复制hash/workspace算法。
- **Gameframeworks/app host**：Application/canvas/ticker/DOM frame、configured round recipe、错误呈现与业务resolver；
  不直接操作core内部Container层级。
- **资源生命周期**：authored/compiled program可共享；mutable node/player/reel/Popup/transition逐owner独占；
  runtime成功接管resource后负责逆序destroy，未接管candidate由创建边界rollback；caller-owned RenderObject
  和borrowed layer/node遵守现有ownership。
- **事务边界**：init与target mode prepare等待全部已启动工作收敛后一次commit；失败清理candidate并保持
  stable scene；destroy取消waiter/listener/transition/prelude/late completion并阻止后续命令。
- **失败策略**：unknown version/kind/mode/variant/node/edge/layer/resource/path、allocation parity、资源不兼容、
  非法delta和destroy后命令在责任边界显式失败，不fallback。
- **禁止行为**：不复制parser/runtime、不从filename/hash猜identity、不向core暴露完整mutable display tree/
  scratch、不把editor snapshot放回ticker、不以跳校验、丢delta或降级效果换性能。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/data/**
packages/rendercore/src/scene-layout/core/**
packages/rendercore/src/scene-layout/editor/**
packages/rendercore/tests/scene-layout/{data,core,editor}/**
packages/rendercore/benchmarks/scene-layout-runtime-hot-path.mjs
docs/crave-task222-scene-layout-layer-migration.md
tasks/222-rendercore-gamelayout-data-core-editor-refactor-<utctime>.md
```

### 预计修改

```text
packages/rendercore/package.json
packages/rendercore/src/index.ts
packages/rendercore/src/scene-layout/**
packages/rendercore/tests/scene-layout/**
packages/rendercore/{README.md,vite.config.ts,tsconfig*.json}
packages/gameframeworks/{src/**,tests/**,README.md,vite.config.ts}
apps/gamelayouteditor/{src/**,tests/**,README.md,vite.config.ts}
apps/gamelayoutpkgcli/{src/**,tests/**}
apps/gameviewer/{src/**,tests/**,vite.config.ts}
apps/gameviewer2/{src/**,tests/**,README.md,vite.config.ts}
apps/{game002v2,game003v2}/{src/**,tests/**,vite.config.ts}
docs/scene-layout-manifest.md
docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts,gameviewer-round-flow,gameviewer2-local-flow}.md
```

### 原则上不应修改

```text
packages/rendercore/src/{image-string,popup,symbol}/**
packages/{logiccore,uiframeworks,vnicore,browserartifactio,editorresource}/**
apps/{imgnumbereditor,popupeditor,symbolseditor}/**
assets/**
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
AGENTS.md
```

若执行时发现必须改变 Scene Layout wire/schema、nested package public contract、通用 map/hash 算法、
production assets、根工具链、新增依赖或其它 editor 产品行为，先停止说明范围扩张，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认基线与 export/consumer allowlist**
   - 重核 HEAD/status，用 `rg` 固定 root/`./scene-layout` import、public symbol、Vite alias和consumer矩阵。
   - 先增加data/core/editor export与source-boundary测试，固定v1/v2/v3 latest、allocation、geometry、
     resource、mode/transition、preview与destroy parity基线。
2. **建立独立 data 层**
   - 拆分authored/runtime types，把manifest、版本升级、allocation、pure geometry、direct reference/
     closure/rewrite迁入data；消除Pixi、DOM、runtime、map/workspace依赖。
   - 将package闭包的纯typed graph与mapped assets-map integrity分开；CLI只组合data和自身artifact validator。
   - 覆盖完整版本表、latest幂等、bad v3 allocation、order/scope/edge/resource引用、unknown future failure。
3. **建立编译后的精简 core**
   - 从canonical v3构造immutable `SceneLayoutProgram`，缓存mode/edge/node/binding/layer/name lookup；
     layout/package runtime和presentation surface只消费program与resolved resources。
   - 把3,514行package runtime按node/layout owner、reel registry、Popup registry、transition session、
     render-object/layer façade和小public coordinator拆分；模块间只通过typed capability通信。
   - 用scalar `getStableGameMode/getGameModePhase`等game query替代生产consumer的完整mode snapshot；
     geometry snapshot保留immutable cached语义，steady update不构造diagnostics。
4. **收紧resource transaction与lifecycle**
   - 拆开runtime URL/resolved-resource prepare与editor mapped ZIP/map materialize；core不读取editor map元数据。
   - 明确resource→runtime ownership transfer、init failure、destroy during init、lazy runtime resource并发、
     retry/terminal failure、late completion和caller-owned RenderObject释放边界。
   - 用constructor/identity/owner counter覆盖node、Texture/Object URL、Spine/VNI/ImgNumber、reel、Popup、
     video/listener/waiter的有限cache、一次destroy与重复destroy。
5. **建立editor wrapper并迁移Game Layout Editor**
   - 迁移standalone mapped/legacy package resolve/materialize、authoring validation与完整inspector；API接受app
     已bounded-normalize的file map，不接管draft/UI/session。
   - 用composition建立core-backed preview session；Game Layout Editor model/rewrite改用data，IO/preview改用editor，
     app继续拥有Application/canvas/ticker/input target和workspace。
   - source-boundary测试禁止Game Layout Editor直接创建第二个Popup/Symbol/ImgNumber或从core读取完整diagnostics。
6. **按职责迁移其它consumer**
   - gamelayoutpkgcli改用data；configured-round/template recipe迁入gameframeworks并只调用core capability。
   - Game Viewer 2配置/inspection改用editor，独立窗口创建Application并驱动core；保持MessageChannel hash/readiness、
     local public reel、operation plan和Replay/destroy合同。
   - gameframeworks、game002v2、game003v2迁移到core/facade与scalar query；更新aliases/mocks/tests，搜索确认
     无旧入口、root scene-layout symbol、game→editor、data/core反向依赖残留。
7. **性能、文档与收尾**
   - 增加固定self-contained layout、node/reel/Popup数量与mode序列的warm benchmark，记录prepare、stable update、
     viewport、mode往返、destroy/recreate的吞吐、构造计数与`--expose-gc` heap slope；wall-clock只进报告。
   - 更新README、canonical v3文档、五份领域规则与Crave手工迁移文档；不把benchmark数值写入长期规则。
   - 完成L2自动验收，整理并交付用户浏览器验收清单，检查最终diff并生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- data覆盖v1/v2/v3 source→latest、allocation、geometry、reference/closure/rewrite与deep-readonly；core覆盖
  program compile一次、runtime parity、mode/transition/reel/Popup、scalar query、atomic prepare和destroy；
  editor覆盖mapped/legacy package、map/hash/orphan、materialize、preview与inspection。
- 相同manifest/resource、viewport、delta、mode/scene/state/input序列下，重构前fixture与新core的snapshot geometry、
  layer identity/order、node visibility/transform、reel occurrence、Popup/transition阶段、错误和最终画面保持一致。
- 热路径自动化使用parser/program/constructor/snapshot次数、stable identity、cache上限、listener/waiter和
  retained-owner断言；不以本机毫秒阈值制造flaky test。
- 不为旧混合入口增加alias；测试、fixture、mocks和Vite alias全部迁移到职责入口。

### 验收级别

`L2`：修改rendercore Scene Layout public subpath、runtime resource/lifecycle与直接consumer；影响范围可由
rendercore、gameframeworks、两个viewer、Layout Editor/CLI和两个游戏界定，不修改schema、assets、根工具链或lockfile。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build && pnpm --filter @slotclientengine/rendercore benchmark:scene-layout
pnpm --filter @slotclientengine/gameframeworks --filter gamelayouteditor --filter gamelayoutpkgcli --filter gameviewer --filter gameviewer2 --filter game002v2 --filter game003v2 typecheck
pnpm --filter @slotclientengine/gameframeworks --filter gamelayouteditor --filter gamelayoutpkgcli --filter gameviewer2 --filter game002v2 --filter game003v2 test
pnpm --filter gamelayouteditor --filter gamelayoutpkgcli --filter gameviewer --filter gameviewer2 --filter game002v2 --filter game003v2 build
git diff --check
```

共7条：rendercore的source/行为/declaration/benchmark、直接consumer编译/行为/Vite解析和最终diff分别需要
独立证据；这是public入口与runtime owner重构，无法由单一package测试替代，但不升级为根级L3验收。

### 人工验收

以下浏览器、Performance、Memory与视觉验收全部由用户执行；执行会话不得以自动化结果标记为已通过：

1. Game Layout Editor分别新建项目、导入合法v1/v2/v3 legacy与mapped ZIP，复验canonical v3导出重导、
   background/node/reel/Popup/runtime resource、横竖屏、geometry-only更新、stable-mode selection与真实转场。
2. 连续至少50次package打开、preview rebuild、mode往返、Popup/transition播放、viewport切换和destroy/recreate；
   用浏览器Performance/Memory记录frame time、allocation timeline与heap snapshot，确认listener、Object URL、
   Texture、Spine/VNI/ImgNumber、Symbol player/reel、Popup/video、Container和waiter无持续增长。
3. Game Viewer用真实Layout ZIP完成readiness与configured round；Game Viewer 2完成项目检查、独立窗口播放、Replay、
   关闭重开，确认app-owned Application与core runtime各自只销毁一次。
4. 启动game002v2与game003v2，复验loading、Base/Free或对应mode往返、grid-cell/standard reel、Popup、Nearwin/
   transition、resize和退出清理；import迁移不得改变业务时序或公开轮带边界。
5. 在相同真实package和操作序列下对比重构前后Performance/Memory；记录p95/p99帧耗时、minor GC、heap slope，
   自动benchmark与单测不能冒充真实浏览器视觉/内存验收。

### 独立验收建议

**必须**。涉及跨包public contract、production runtime hot path、Application/resource ownership、异步transaction、
mode/reel/Popup/transition destroy和standalone mapped package边界。独立复验重点为旧入口零残留、data/core/editor
依赖方向、runtime视觉parity、init rollback/late completion/repeated destroy；最多重跑rendercore test、全部直接
consumer typecheck和Game Layout Editor/Game Viewer 2测试三组命令。

## 9. 环境与依赖

- 使用仓库要求的Node 24与pnpm；shell没有Node时通过nvm切换到24。
- 依赖缺失时执行`CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库代理并重试。
- 预计不新增依赖、不修改lockfile；使用现有TypeScript/Pixi/Spine/VNI、browserartifactio和editorresource能力。

## 10. 生成物、文档与规则

- 本任务不修改YAML、production ZIP或现有generated TypeScript，不手改`dist/`。
- 更新`packages/rendercore/README.md`、`packages/gameframeworks/README.md`、
  `apps/gamelayouteditor/README.md`、`apps/gameviewer2/README.md`与`docs/scene-layout-manifest.md`，说明
  三层入口、host ownership、canonical v3、preview/inspection和迁移方式。
- 新增`docs/crave-task222-scene-layout-layer-migration.md`，按最终API记录shared package同步、Crave-owned
  package保留、root/旧subpath import与Vite alias修改、验证命令和浏览器场景；外部Crave只由用户手动修改。
- 稳定职责改变时最小更新 `docs/agent-rules/` 下的 shared runtime、scene layout、editor artifacts 与
  两份 Game Viewer 规则；不修改根 `AGENTS.md`，不写任务数值或证据。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/222-rendercore-gamelayout-data-core-editor-refactor-<utctime>.md
```

报告简要记录最终export/consumer allowlist、program与owner结构、实际修改文件、benchmark观测、自动验收结果、交付用户的浏览器/Crave手工验收项、计划偏差和独立验收结论，不收集无关release/coverage证据。

## 12. 风险、假设与待确认

### 风险

- `package-runtime.ts`同时拥有layout、reel、Popup、transition、input、render-object和diagnostics；拆模块时若产生
  两个coordinator或双重resource owner，会造成重复update/destroy或半提交mode，必须以identity/owner计数锁定。
- production ZIP当前混合artifact integrity与runtime prepare；若只移动文件，core仍会反向依赖editorresource，
  必须拆成editor artifact adapter→validated/resolved input→core prepare三个显式边界。
- full mode snapshot当前被Game Layout Editor大量读取、game002v2只读取`stableMode`；迁移时应给游戏标量query，
  inspector继续从同一runtime按需物化，不能删除编辑器所需诊断或把snapshot放回ticker。
- app-owned Application迁移会改变init/destroy顺序；Game Viewer 2和configured template必须覆盖init失败、窗口关闭、
  ResizeObserver/ticker/listener解除和resource恰好一次释放。
- v1-compatible `resource.manifest`与canonical `runtimeManifest`是现有兼容合同；分层不能让游戏、Editor、CLI
  各自选择不同版本视图或重复upgrade。

### 假设

- 当前仓库内所有直接consumer可原子迁移；rendercore是private workspace package，无需保留旧入口兼容期。
- tasks 216–221已建立的v3 allocation、resource retention、void ticker及nested data/core/editor合同继续作为基线。
- benchmark只提供同机前后证据；最终性能和内存结论以真实浏览器profile为准。

### 待确认

无。当前代码、规则与直接consumer已足以确定分层；执行中若出现schema、assets、外部仓库写入或新增依赖需求，
按范围扩张处理并先向用户说明。

## 13. 完成清单

- [ ] data/core/editor目标与consumer分层全部落地，旧入口零残留。
- [ ] Scene Layout schema、runtime行为、游戏与editor视觉parity保持。
- [ ] compiled program、steady update和scalar query满足性能合同。
- [ ] resource transaction、rollback、late completion、destroy与内存owner测试通过。
- [ ] tests、benchmark、README、规则、Vite alias和Crave迁移文档已同步。
- [ ] 指定L2自动验收已通过，用户负责的浏览器与Crave手工验收项已明确记录但未冒充完成。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应先重新读取本计划与列出的领域规则，核对HEAD/status和旧入口consumer矩阵；随后按data→core→editor→
consumer顺序原子迁移，不在中间状态保留compatibility barrel。若基线已出现新的Scene Layout schema、public API、
production asset或相关任务改动，先判断是否需要重规划；完成后按第8节验收并生成报告。
