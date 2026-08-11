# 198 symbol-remove-terminal-frame-boundary 任务计划

## 1. 目标与完成定义

### 目标

为 Symbols state 增加 versioned、显式的 once 完成行为，区分“播放一次后回默认状态”和
“播放一次后停在终态”。通过 v1→v2 严格加载迁移兼容旧 Symbols package，并让 Symbols Editor、
game002v2 及 rendercore 内直接 consumer 统一消费 v2 配置，消除 remove 完成后回 `normal` 或多绘制一帧的问题。

### 完成定义

- [ ] `symbol-state-textures.manifest.json` schema 升级为 v2；每个 once state 必须显式声明
      `afterComplete: "return-to-default" | "terminal"`，stable state 禁止该字段。
- [ ] v2 使用完整 `settings.stateDefinitions` 作为 state lifecycle/完成行为的唯一配置；runtime/editor 不再通过
      state id 推断新版行为。
- [ ] 合法 v1 在加载边界严格校验后自动迁移为 canonical v2：exact `remove` 填 `terminal`，其它 once state
      填 `return-to-default`；迁移后所有下游只处理 v2。
- [ ] v2 缺字段、非法组合、重复/缺 builtin state、旧新字段混写、未知或未来 version 显式失败；不猜默认值。
- [ ] Symbols Editor 打开 v1/v2 ZIP 后都得到 v2 project state definitions；可查看和编辑 once 完成行为，
      新导出只写 v2，不继续输出 v1。
- [ ] Symbols Editor 预览按 state 配置执行：`return-to-default` once 完成后回 default；`terminal` once 完成后
      保持终态，Replay 可重新播放，不按 `state === "remove"` 写 UI/runtime 分支。
- [ ] rendercore terminal remove 在 occurrence 自身 once completion 的同步 update 边界直接 release；
      `runtime.update()` 返回前 scene/display 已成为 hole，不能等 Promise microtask 再提交。
- [ ] game002v2 继续只提交上游决定的 remove positions；remove state 是否 terminal 来自 active Symbols v2 配置，
      app 不新增 normal、timer、counter、state-name判断或私有 release。
- [ ] rendercore symbol cascade 与 configured round 等直接 remove consumer 改用 shared terminal transaction，
      不再等待 terminal state 回 normal，且普通 win/appear/feature once 行为不回归。
- [ ] public exports、parser/migrator、tests、README、领域规则和 UTC 中文执行报告同步；不修改正式美术 bytes、
      外层 package schema、YAML、生成资源或 lockfile。

## 2. 范围

### 包含

- `packages/rendercore/symbol`：Symbols manifest v1/v2 parser、v1→v2 upgrader、canonical v2 raw/parsed 类型、
  `SymbolStateDefinition.afterComplete`、state machine/RenderSymbol completion 和生命周期。
- `packages/rendercore/symbol/package/materialize`：package load 后内存中的 `rawSymbolManifest` 规范为 v2；
  rematerialize/export 时自然写出 v2，资源闭包和路径改写保持不变。
- `packages/rendercore/reel`：terminal state strict preflight、同步 exact occurrence release、batch fail-stop。
- `packages/rendercore/symbol-cascade`、`scene-layout/configured-round-adapter`：迁移直接 remove 编排，删除
  “remove 回 normal 后再 release”的旧假设。
- `apps/symbolseditor`：v2 project model、state definition UI、v1 import、v2 export、配置驱动 preview/Replay。
- `apps/game002v2`：保护现有 terminal API 接入，验证 active Symbols 配置为权威来源。
- 相关 tests、README、领域规则和执行报告。

### 不包含

- 不升级 `symbols.package.json` v1：外层 container、entrypoints、cellSize 和 resources closure 未改变；
  version 2 只属于 `symbol-state-textures.manifest.json`。
- 不修改 animation resource 的 `playback.loop`、Spine/VNI schema 或动画名；`afterComplete` 是 semantic state
  完成行为，不替代底层资源 loop/once 校验。
- 不给 stable `static/loop` state 增加无意义的完成行为，不增加 hold duration、任意 next-state 跳转或 transition DSL。
- 不允许 v2 省略 `afterComplete` 后按 state 名 fallback；`remove` 特判只存在于 v1 upgrader。
- 不在 runtime 维护 v1/v2 两套状态机，不让 editor/game 各自实现 migration。
- 不恢复任务 192 已删除的 retained predicate、removed/retained result、code/value continuity 复核或 renderer
  业务判断；producer 仍先决定最终 remove positions。
- 不修改 server 协议、game002 业务规则、assets/YAML、Scene Layout package schema、根工具链、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-11T10:17:11Z
HEAD: ff7b860443983d403c23b179ff77f688d8192a1a
branch: (detached HEAD)
git status --short --untracked-files=all: clean（创建本计划前）
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{editor-artifacts,shared-game-runtime,game002}.md`；目标目录无补充 `AGENTS.md`。
- 已核对 `apps/symbolseditor/README.md`、`packages/rendercore/README.md`、`apps/game002v2/README.md`，
  以及任务 181、187、192 的计划/执行结论。
- `packages/rendercore/src/symbol/manifest.ts::parseSymbolStateTextureManifest()` 当前只接受 `version: 1`；
  builtin preset 由 `createDefaultSymbolStatePreset()` 隐式创建，manifest 仅以
  `settings.additionalStateDefinitions` 保存 custom `id/phase/playback`。
- `SymbolStateDefinition` 当前只有 `id/phase/playback/frameDurationSeconds`；
  `SymbolStateMachine.notifyOnceComplete()` 对全部 once 无条件切回 `defaultState`。
- `RenderSymbol.update()` 在 once edge 先执行上述回 default，再 resolve playback；因此 standalone preview 中
  remove 完成后会持续显示 normal。
- `RenderGridCellReelSet.removeVisibleSymbols()` 已 preflight exact position/state/playback，但通过
  `playVisibleSymbolState(...).then(releaseCell)` 提交 release；Promise continuation 可能晚于同一 Pixi ticker render，
  形成 game002v2 观察到的额外 normal 帧。
- `apps/symbolseditor/src/model/editor-project.ts::compileSymbolEditorManifest()` 固定输出 manifest v1；
  `EditorStateDefinition` 不保存完成行为，UI 只显示/编辑 `phase/playback`。
- `SymbolEditorPreview` 对所有非 normal state 都调用 `requestState(..., "immediate")`；只要 RenderSymbol 改为
  配置驱动 terminal，它无需再按 remove 名称判断。
- `apps/game002v2/src/round-adapter.ts::removeWonSymbols()` 已调用 `removeMainReelSymbols()`，没有 app 侧 normal；
  shared terminal boundary 才是生产修复位置。
- `symbol-cascade/create-symbol-cascade-player.ts` 和 configured round v1 flow 当前请求 remove 后轮询 snapshot
  回到 normal再 release；v2 terminal 不会回 normal，必须同步迁移这些 direct consumers。
- 当前测试只在 `await removal` 后断言最终 hole，没有在 completion `update()` 返回后、microtask flush 前检查
  scene/display；manifest tests 也只有 v1 strict parser，没有 migration/canonical v2 覆盖。

## 4. 需求解释与技术决策

### 需求解释

- 缺少的是与 `playback` 正交的完成行为，不是第三种 animation playback：`loop/static/once` 决定资源如何播放，
  `afterComplete` 只决定 once semantic state 完成后是否回 default。
- 使用 `return-to-default` 而不是 `return-to-normal`，因为 `SymbolDefinition.defaultState` 已是通用合同；当前通常为
  `normal`，但 schema 不重复硬编码该名字。
- `terminal` 表示 once 完成后不切回 default；standalone RenderSymbol 保持 terminal presentation，拥有 occurrence
  生命周期的 reel remove transaction 则在同一 edge release。
- v1 的 name-based rule 只是一条确定性迁移规则，不是永久 runtime fallback：exact `remove` terminal，其它 once
  return-to-default。合法 v1 custom state 不能覆盖 builtin remove，因此迁移无歧义。

### 关键决策

1. **Symbols manifest v2 保存完整 state definitions。**
   - canonical 结构为 `settings.stateDefinitions[]`，每项保存 `id/phase/playback`，once 额外必需
     `afterComplete`；v2 不再写 `additionalStateDefinitions`。
   - v2 必须恰好包含全部 builtin state，builtin 的 `phase/playback` 仍与 rendercore 固定能力一致，另可包含 custom
     once/once 或 stable/loop；这样配置能显式覆盖 builtin remove 的完成行为，又不放开破坏基础状态能力。
   - `defaultState` 与 equivalence 继续由 preset 固定合同提供，本任务不扩大成任意状态图 schema。

2. **单一 upgrader 先 strict parse v1，再产出 canonical v2。**
   - 新增 `upgradeSymbolStateTextureManifest()`（最终命名可按现有 style 微调）：v1 先按原 v1 known-key、类型、
     state/animation/resource规则完整验证，再结构化复制为 v2；不能先宽松读取后补字段。
   - v1 builtin/custom once 按 exact id 填 `afterComplete`；stable state不写该字段；删除旧
     `additionalStateDefinitions`，保留其它 typed settings、symbol业务字段和资源引用。
   - v2 直接 strict parse，不运行 name判断；unknown/future version失败。upgrader幂等，输入 v2输出等价 canonical v2。

3. **package load 后只暴露 canonical v2。**
   - `createSymbolPackageResource()` 在 resource prepare前升级一次；其 parser、asset map、resolver、catalog、state preset、
     closure collector都消费同一 v2对象。
   - `SymbolPackageResource.rawSymbolManifest` 改为 canonical v2 raw manifest；materialize/editor import因此会在下一次
     写出时自动升级，不保留 runtime v1分支。
   - 外层 `SymbolPackageManifestV1` 不变，资源 bytes/path/closure 不因只增加 lifecycle metadata而变化。

4. **state machine 直接执行 `afterComplete`。**
   - `return-to-default` 保持当前 notify once行为；`terminal` 完成后 requested/resolved state保持 terminal，不创建或
     恢复 default ani。
   - RenderSymbol在同一个 update中产生一次可消费的 terminal completion edge；Replay/reset/supersede可显式重新激活。
   - AbortSignal、pool release、destroy和 terminal edge同帧时使用generation/lifecycle guard，Promise只 settle一次，
     不对已回池实例继续 sync ani。

5. **拥有 occurrence 的 remove API 同步提交 release。**
   - `removeVisibleSymbols()` 要求目标 state 为 once + `afterComplete=terminal`，全批 preflight后启动 exact symbol。
   - 每个 occurrence在自己的 terminal edge同步 release，batch Promise只汇总完成/失败，不通过 `.then()`调度 commit。
   - 已完成 release不回滚；兄弟失败/abort按 fail-stop取消未完成项，pool/destroy幂等收敛。

6. **所有 consumer 只读配置，不判断 remove 名字。**
   - Symbols Editor project/UI 保存每个 once definition的 `afterComplete`；打开 v1即显示迁移值，新建 remove默认值来自
     canonical preset，导出恒为v2。preview只 request选中state，terminal/return行为由RenderSymbol决定。
   - game002v2继续调用 terminal remove facade；rendercore用 active Symbols state definition校验 terminal，app不读取
     manifest或比较state字符串。
   - symbol cascade/configured round把 remove路径迁移到 shared terminal transaction；win/collect等
     return-to-default状态可继续await或使用现有普通完成合同，不再以“所有 once最终都是normal”为通用判断。

## 5. 职责与合同

- **rendercore manifest/migrator**：拥有v1/v2识别、strict validation、v1 name-based一次性迁移和canonical v2输出。
- **rendercore state machine/RenderSymbol**：拥有 `afterComplete` 执行、terminal edge、Replay/reset/pool/destroy生命周期；
  不认识游戏component或symbol code。
- **rendercore reel/cascade/Scene Layout**：拥有 exact occurrence preflight、同步 terminal release、batch fail-stop和
  consumer编排；不推导业务remove positions。
- **Symbols Editor**：拥有authoring/UI/ZIP import-export；编辑显式完成行为并预览，不复制migration或player状态机。
- **game002v2**：拥有server component到remove positions的解释；只调用shared API。
- **数据/API**：v2 once缺 `afterComplete`、stable携带该字段、非法enum、缺/重复builtin、v1/v2字段混写均失败。
- **禁止行为**：v2 state-name fallback、第二份迁移器、timer/RAF隐藏、Promise microtask commit、counter polling、
  placeholder、normal alias、renderer业务predicate。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/symbol/upgrade-manifest.ts（若独立模块比 manifest.ts 内函数更清晰）
tasks/198-symbol-remove-terminal-frame-boundary-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/symbol/{types,state-machine,render-symbol,manifest,package,materialize-package,index}.ts
packages/rendercore/src/reel/{types,render-reel,render-grid-cell-reel-set}.ts
packages/rendercore/src/symbol-cascade/{types,create-symbol-cascade-player}.ts
packages/rendercore/src/scene-layout/{types,package-runtime,configured-round-adapter}.ts
packages/rendercore/tests/symbol/{manifest,state-machine,render-symbol,package,materialize-package}.test.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/tests/symbol-cascade/create-symbol-cascade-player.test.ts
packages/rendercore/tests/scene-layout/configured-round-adapter.test.ts
packages/rendercore/README.md
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/tests/{editor-project,app-shell,zip-io,preview-layout}.test.ts
apps/symbolseditor/README.md
apps/game002v2/tests/source-boundary.test.ts
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

测试fixture中内联的 symbol manifest应按测试意图选择：兼容测试保留v1；现代canonical fixture升级v2。正式
`assets/**`继续保留v1并由加载迁移验证，不为本任务批量重写美术交付。

### 原则上不应修改

```text
packages/logiccore/**
packages/{gameframeworks,uiframeworks}/**
apps/{game002,game003,gameviewer,gameviewer2}/**
assets/**
symbols.package.json schema / SymbolPackageManifestV1
AGENTS.md
pnpm-lock.yaml
```

若实现必须修改外层package version、资源/YAML、server协议或logiccore operation schema，属于重大范围扩大，先停止说明。

## 7. 实施步骤

1. **固定v1基线与失败复现**
   - 重新核对HEAD/status、v1 parser、package materialize、editor import/export及全部 remove consumer。
   - 先补测试证明当前remove回normal、terminal release晚于completion update，以及v1无完成行为字段。

2. **定义并实现v2 schema/upgrader**
   - 增加 `SymbolStateAfterComplete`、v1 raw/v2 canonical类型与strict parser；定义完整
     `settings.stateDefinitions`规则。
   - v1严格验证后迁移：remove→terminal，其它once→return-to-default；v2只读显式值。
   - 覆盖builtin/custom、mixed fields、missing/duplicate、invalid enum/combinations、future version、deep freeze/idempotence。

3. **统一package canonical load/materialize**
   - resource load只升级一次，下游全部使用同一canonical v2 raw/parsed manifest。
   - 验证v1 package可加载、catalog/resource closure不变；materialize后manifest为v2且assets map/hash/path改写仍正确。

4. **接入state machine与同步terminal edge**
   - return-to-default保持旧行为；terminal once完成后保持state/最后presentation，不建立normal帧。
   - 实现受控同步completion owner/generation，覆盖普通once、terminal、Replay、supersede、abort、reset、pool、destroy。

5. **修复reel和rendercore直接consumer**
   - terminal remove完整preflight后在每个edge同步release，删除 `.then(releaseCell)` commit。
   - symbol cascade和configured round remove改用shared transaction，删除等待normal的remove分支；验证group、sequential
     collect、不同duration、部分失败和cleanup。

6. **升级Symbols Editor authoring/preview**
   - project state definition增加 `afterComplete`；v1 import显示迁移值，v2 import原样读取，新建custom once要求显式选择。
   - 项目状态定义UI为once显示完成行为select，stable不显示；transaction、clone、delete、round-trip同步。
   - export恒写v2完整definitions；preview不判断remove，Replay/reset按shared state machine执行。

7. **保护game002v2与文档边界**
   - 测试确认app只提交positions和state，不解析manifest、不判断remove名字、不请求normal/release。
   - 更新README和两份领域规则，记录v2、迁移唯一边界、terminal同步release及editor authoring职责。

8. **L2验收与报告**
   - 按第8节运行定向命令；失败先最小化，不扩到整仓。
   - 完成浏览器逐帧验收并生成UTC中文报告；无法稳定取得live round时明确人工项未完成。

## 8. 测试与验收

### 测试原则

- migration测试使用真实v1结构并先证明old strict错误仍失败；不能让upgrader宽松吞unknown key。
- v2测试证明runtime不含 `state === "remove"` fallback；更换一个custom once为terminal也应按配置执行。
- 同帧release断言必须放在触发completion的 `update()` 后、任何 `await`/microtask flush前。
- 普通win/appear return-to-default、terminal Replay、不同duration、abort/pool/destroy都要覆盖。
- editor round-trip验证v1输入→v2输出且完成行为不丢失；不以UI字符串测试替代parser/state-machine测试。

### 验收级别

采用 `L2`：修改rendercore public Symbols schema、parser、state lifecycle和Scene Layout直接consumer，并升级
symbolseditor authoring；涉及异步terminal release/pool/destroy。外层package、资源、lockfile和根工具链不变，无需L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/manifest.test.ts tests/symbol/state-machine.test.ts tests/symbol/render-symbol.test.ts tests/symbol/package.test.ts tests/symbol/materialize-package.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/symbol-cascade/create-symbol-cascade-player.test.ts tests/scene-layout/configured-round-adapter.test.ts
pnpm --filter symbolseditor --filter game002v2 typecheck
pnpm --filter symbolseditor exec vitest run tests/editor-project.test.ts tests/app-shell.test.ts tests/zip-io.test.ts tests/preview-layout.test.ts
pnpm --filter game002v2 test
git diff --check
```

### 人工验收

- Symbols Editor打开一个旧v1 Symbols ZIP：状态定义显示remove=terminal、其它once=return-to-default；不手工保存也能预览。
- 修改一个once完成行为并导出/重开：ZIP内symbol manifest为v2，值原样保留；terminal预览不回normal，Replay正常；
  return-to-default仍回normal。
- game002v2使用包含remove/dropdown/refill的live round逐帧确认removed symbol不闪normal，WL retained不受影响，
  后续fall无卡住/重复release/console rejection。

### 独立验收建议

`必须`。涉及versioned schema migration、public state contract和completion edge内pool release。独立复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/manifest.test.ts tests/symbol/state-machine.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/symbol-cascade/create-symbol-cascade-player.test.ts
pnpm --filter symbolseditor exec vitest run tests/editor-project.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用Node 24和pnpm；shell无Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；仅下载实际失败后才设置本地代理重试。
- 不新增依赖、不修改lockfile，不切换npm/yarn。

## 10. 生成物、文档与规则

- 不修改正式assets/YAML/生成物；v1 production package由加载迁移。测试fixture按canonical/legacy意图定向更新。
- 更新rendercore README：v2结构、v1迁移、afterComplete、terminal同步edge和外层package仍v1。
- 更新Symbols Editor README：v1打开即升级、v2-only export、完成行为UI和配置驱动preview。
- 更新 `editor-artifacts.md` 与 `shared-game-runtime.md` 的稳定schema/owner合同；不把任务清单写入根AGENTS。

## 11. 执行报告

执行完成后创建：

```text
tasks/198-symbol-remove-terminal-frame-boundary-<utctime>.md
```

用 `date -u +%y%m%d-%H%M%S` 取UTC。报告记录最终v2结构、migration、实际文件、consumer迁移、自动化结果、
人工视觉状态和偏差；不收集无关coverage、整仓统计或完整历史。

## 12. 风险、假设与待确认

### 风险

- v1→v2若在strict校验前重写，会把unknown/坏字段伪装成合法输入；必须先按source version验证。
- resource/raw/materialize若混用原v1和canonical v2，会形成第二份manifest事实或重新导出v1；加载后需单一对象。
- terminal edge内release触发pool reset/destroy；stale update继续执行可能重建normal ani或二次settle。
- legacy cascade/configured adapter若遗漏，terminal remove永不回normal会卡住round；需搜索全部normal-poll remove路径。
- editor state UI若只更新custom definition而漏builtin，会让remove仍依赖代码默认；v2完整definitions必须同源编辑/导出。

### 假设

- v1 builtin exact `remove` 是唯一需要迁移为terminal的state；所有其它v1 once保持历史return-to-default。
- builtin id/phase/playback、defaultState和equivalence仍是稳定preset能力；v2只显式完成行为和custom定义，不开放重写这些基础合同。
- 外层Symbol package v1可承载symbol manifest v2，无需改变closure或entrypoint格式。

### 待确认

无。用户已确认采用versioned schema、加载自动升级和v1 remove迁移规则。

## 13. 完成清单

- [ ] v2 schema、v1 strict migration和v2-only export满足计划。
- [ ] runtime/editor/game002v2及rendercore直接consumer只读canonical配置。
- [ ] terminal无normal帧且同步release；普通once行为不回归。
- [ ] 修改未超范围；public API、migration、pool/destroy生命周期符合计划。
- [ ] tests、README、规则已同步；正式assets、外层package、lockfile未改。
- [ ] L2自动化与人工验收已明确记录，UTC中文报告已生成。

## 14. 执行会话交接

1. 读取根AGENTS、本计划及列出的三份领域规则，核对HEAD/status并保留无关修改。
2. 先建立v1 migration、v2 strict和microtask前release失败测试，再改生产代码。
3. v1 name判断只能出现在唯一upgrader；v2/runtime/editor/game不得恢复remove fallback。
4. 搜索并迁移全部“remove后等normal”的direct consumer，不能只修game002v2。
5. 小幅文件/API命名适配写入报告；外层package/schema或assets范围扩大时先停止说明。
6. 只运行计划L2验收，完成后生成UTC报告；除非用户明确要求，不commit/push/建PR。
