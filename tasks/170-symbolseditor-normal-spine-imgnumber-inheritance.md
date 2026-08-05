# 170 symbolseditor-normal-spine-imgnumber-inheritance 任务计划

## 1. 目标与完成定义

### 目标

统一 `apps/symbolseditor` 中 ImgNumber 的 authoring 与 runtime：无论 symbol 是否有档位、当前
state 是否由 Spine 呈现，每个 logical ImgNumber 在每个 `RenderSymbol` occurrence 中始终只有
一个稳定 display/container instance。状态切换只改变该 instance 的 resource profile、attachment
与 `visible/renderable`，不按 state 或 tier 创建多份实例。

对于 Spine assets，只在 Normal 配置一次 exact slot、文字/数值来源、anchor、transform、颜色跟随
和特殊值图片。所有 Spine state 自动使用同名 slot，是否显示、如何移动、何时弹出完全由 Spine
animation 决定，不再逐 state 重复配置。带档位时，每个 tier 只选择自己的 ImgNumber JSON；其余
Normal 配置全部共享。

对于非 Spine state，保留当前 exact-state 逻辑：被 target 选中的 state 把同一 instance 显示在
固定顶层 ImgNumber overlay，未选中的 state 只将其设为不渲染。`spinBlur`、`disabled` 等状态仍可
单独决定是否显示，但不拥有第二份 ImgNumber 配置或 runtime instance。

### 完成定义

- [ ] 普通 Spine symbol 的 ImgNumber 只在 Normal 配置 dependency JSON、exact slot、initial text、
      anchor/transform、颜色跟随和特殊值；其它 Spine state 无重复 ImgNumber 表单。
- [ ] 有 N 个 Spine tier 时，UI 只显示 N 个 ImgNumber JSON selector，加一张共享 Normal 配置卡；
      slot、transform、颜色和特殊值不按 tier 重复。
- [ ] 每个 logical ImgNumber、每个实际 symbol occurrence 恰好一个稳定 runtime handle/container；
      normal/appear/win/feature、tier 切换、非 Spine overlay/hidden 切换均保持 object identity。
- [ ] Spine state 自动 attach 同一 exact slot name；同一 player 的动画切换不 detach/recreate，slot
      visibility、bone matrix 和 color 由 Spine timeline 控制。
- [ ] 非 Spine state 继续使用 exact target：命中时显示同一 instance，未命中时 `visible=false`、
      `renderable=false`，不销毁、不重建、不 fallback 到 normal。
- [ ] tier 变化时只在稳定 instance 内原子切换已 prepare 的 ImgNumber JSON resource profile；同 tier
      改字只执行原子 `setText()`，不创建每 tier renderer。
- [ ] 旧 `target`/`targets`、当前 per-tier value ImgNumber、旧 top-level `specialValueImages` 和正式
      Crave mapped package 均可无损导入、运行、编辑和导出；旧数据也运行在单实例 runtime 上。
- [ ] 新 shared 与 legacy wire variants 严格互斥；不能无歧义迁移的旧数据保留原配置语义，不取
      首档、不猜 slot、不扩大 exact non-Spine target。
- [ ] `assets/crave` 与 game002 作为旧数据回归，正式 assets 不修改。
- [ ] 完成 L2 定向自动化；浏览器验收由用户执行；生成 UTC 中文执行报告并明确浏览器待验收项。

## 2. 范围

### 包含

- rendercore Symbols manifest 的 shared Spine Normal contract、per-tier JSON-only binding、现有
  non-Spine exact target 和 legacy union。
- 一个可切换 resource profile 的稳定 mapped ImgNumber display，以及 Spine slot、top-level overlay、
  hidden 三种 attachment/render state。
- 命名 ImgNumber 与 value-presentation ImgNumber 的 prepare/commit/rollback/reset/release/destroy。
- Symbol package exact closure、mapped materialization、resource pool、Vite generator 对新旧 variant
  的结构化收集与路径重写。
- Symbols Editor draft、Normal 卡、tier JSON selector、legacy UI/迁移、引用图、Picker、preview 和
  ZIP 往返。
- game002 public consumer 与 `assets/crave` 旧 manifest 回归；相关 README、Symbol Package 文档和
  稳定领域规则更新。

### 不包含

- 不修改 standalone `apps/imgnumbereditor`、`ImageStringManifestV1` glyph/layout schema、font、完整数值
  图片、Popup ImgNumber、Scene Layout 内部编辑或游戏业务 resolver。
- 不给每个 Spine state 配 visibility/position/animation；这些效果必须由 Spine animation 创作。
- 不把 composite 内部 Spine leaf 当自动 target，不从文件名、动画名或首项猜 attachment。
- 不为非 Spine state 新增另一套配置；继续使用现有 exact target + 顶层 overlay 语义。
- 不修改 `assets/crave`、用户 Downloads ZIP、正式 Symbols/Layout ZIP、依赖或 lockfile；实施会话
  不启动浏览器，也不把 fake player/单测冒充视觉验收。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T08:29:29Z
HEAD: 726c6e2a0305f8b7df231769ea12e07e340ac7f0
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

已读取根 `AGENTS.md`、计划模板，`editor-artifacts.md`、`shared-game-runtime.md`、
`game002.md`、`scene-layout.md`，任务 160/168/169，以及 Symbols Editor、rendercore、
Symbol Package 文档；目标目录没有补充 `AGENTS.md`。当前代码结论：

- HEAD 已合入任务 169。命名 `SymbolImageStringNodeSpec` 使用非空 `targets[]`，每个 Spine state
  重复 `{state,slot}`；Editor 逐 target 编辑。
- `SymbolImageStringController` 对每个 node 已只构造一个 mapped renderer，但 `syncState()` 会先
  detach/清空，再按 exact state 重挂；同 player 的纯语义 state 切换仍有无效 attachment churn。
- value ImgNumber canonical 为 `valuePresentation.text.tiers[]`，每档重复 dependency、slot、anchor、
  transform、颜色和 special map；`setValue()` 会清理 player/display 并异步重建。
- `RenderSymbol` 已有唯一 `imageStringOverlayLayer`；`SpineSymbolAni` 已按 root/resource cache player，
  并能以 continuity key 保持等价 Spine 时间轴。
- package collector/materializer/pool/generator 全部按 per-state target/per-tier full binding 收集。
- 正式 `assets/crave/assets/7549159a...7575.json`：CN 四档 ImgNumber JSON/slot/transform 当前相同；
  AF/WL/WM/CM 命名 node 使用多个 exact Spine targets，部分 state 有意省略。兼容层不能扩大这些
  旧 package 的可见 state。
- game002 production 只消费 rendercore resource map；直接旧字段断言位于
  `apps/game002/tests/{assets,crave-skin}.test.ts` 与 `value-resource-fixture.ts`，无需新增 app runtime。

## 4. 需求解释与技术决策

### 需求解释

- “一个 instance”指每个 logical ImgNumber、每个 `RenderSymbol` occurrence 一个稳定 runtime
  object/container；纹理与 parsed dependency 可跨 occurrence 共享，但可变 container/text 不共享。
- “每档只配置 ImgNumber JSON”表示 tier 仍可使用不同 glyph dependency；tier 只保存 resource ref，
  不重复 slot、anchor、transform、颜色、special map 或状态 target。
- 命名 node 的文字是 `initialText`/public `setImageStringText()`；value-presentation 的文字严格来自
  raw positive safe integer presentation value，不新增 initialText 或业务 fallback。
- Spine assets 保证全部 Spine state、全部 tier skeleton 有同名 slot。Editor 只配置一个 slot；
  package prepare 仍逐实际 skeleton 严格验证这个约定，缺失时显式失败而非跳过。
- 非 Spine state “保留当前逻辑”表示继续用 exact target 控制顶层显示；未 target 的 state 不渲染
  同一 instance，而不是销毁 instance或自动继承 normal。
- Composite 不提供唯一 top-level slot owner，因此按非 Spine top-level visual 处理，不选择 leaf。

### 关键决策

1. **新 wire contract 分离 shared Normal 与 tier JSON**
   - 新命名 node 保存一份 `spineSlot`，并继续用 `targets[]` 仅表达 non-Spine exact overlay states；
     resource、initialText、anchor、transform、颜色与 special map 仍在 node 顶层。
   - 新 value image-string text 保存 `tierResources[]`（与 Spine tiers 等长，每项只含 ImgNumber JSON
     ref）和一份 shared `slot/anchor/transform/followSlotColor/specialValueImages`。
   - legacy named exact Spine targets 与 legacy full `text.tiers[]` 保持 strict union；shared/legacy
     字段混写失败。manifest 保持 version 1，不增加静默 alias。

2. **所有新旧数据统一物化为单实例 runtime profile**
   - runtime 内部把 manifest 解析为“stable display + tier resource profiles + attachment policy”。
   - 新 shared profile 对全部 top-level Spine player使用一个 slot；legacy profile可按 exact state/tier
     切 slot、transform、special map，但只更新同一 stable display，不创建旧式多实例分支。
   - 对 legacy 行为的兼容是输出/可见性/资源选择一致，不要求保留旧的重建开销。

3. **稳定外层 container，内部 profile 原子切换**
   - 扩展 mapped ImgNumber display，使 resource、anchor、special map 与 text 可先验证/prepare，再在
     同一外层 container 内 commit；对象 identity 和 parent handle 不变。
   - 同 resource/profile 只 `setText()`；tier/profile 真变化时替换内部 glyph/special children并复用
     prepared textures，不创建每 tier 外层 renderer。
   - profile 切换失败时旧 resource、children、text、transform、attachment 和 snapshot 全部不变。

4. **attachment 只有 Spine、direct overlay、hidden 三态**
   - Spine：attach stable container 到当前 player 的 exact slot；同 player/slot保持 attachment，让
     timeline控制 visibility/bone/color。
   - Direct：non-Spine exact target 命中时把同一 container 放入 `imageStringOverlayLayer` 并渲染。
   - Hidden：未命中时 container仍由 controller 持有，但 `visible/renderable=false`；不 destroy/recreate。
   - player/tier late init 使用 owner/generation guard；stale callback不能把 hidden/direct instance
     抢回 slot。

5. **兼容旧数据且不静默改语义**
   - parser/runtime/materializer/export 继续接受旧 single `target`、multi `targets`、per-tier full
     binding、旧 top-level special map。
   - 完全等价的 legacy full tier binding可无损显示为“tier JSON + shared Normal”；存在不同 slot/
     transform/special map 时保留 legacy 编辑卡和原语义，直到用户显式迁移。
   - legacy exact Spine targets 不自动扩大到未列 state；显式迁移到 shared Spine 时列出新增覆盖，
     不默认取 normal target、首档或首 slot。

6. **UI 只让新数据走简单路径**
   - 普通 Spine node：一张 Normal 卡；其它 Spine state 只显示 derived “由 Normal/Spine 控制”。
   - tiered Spine：每 tier 只一个 ImgNumber JSON selector，外加一张 shared Normal 卡。
   - non-Spine exact targets保留当前增删 UI，但没有独立 dependency/text/transform。
   - legacy divergent 数据带明确标签保留当前 full cards；新建配置不提供 legacy 入口。

## 5. 职责与合同

- **rendercore manifest/package**：shared/legacy union、tier 对齐、state kind/slot validation、exact closure
  和 mapped rewrite。
- **rendercore display/controller**：stable per-occurrence instance、profile switch、attachment/render state、
  stale async guard、pool release和 destroy。
- **Symbols Editor**：Normal/tier-resource/legacy draft UI、slot候选、显式迁移、filename-key transaction、
  preview 与 ZIP IO；不复制 Spine timeline 或 glyph layout。
- **数据合同**：`tierResources.length === valuePresentation.tiers.length`；shared slot 非空并存在于所有
  Spine skeleton；new `targets` 只含已配置 non-Spine state且唯一；special value仍为唯一 safe integer
  → contained image。
- **生命周期**：全部 dependency/glyph/special texture和候选 profile先 prepare，再 commit到稳定 instance；
  pool owner销毁共享 texture，controller只销毁一次自己的 display/container。
- **失败策略**：variant混写、tier错位、Spine state出现在new non-Spine targets、缺slot/resource/glyph/
  special image、orphan和stale commit显式失败。
- **禁止行为**：不按state/tier创建display，不猜首项，不因缺slot跳过某个Spine asset，不用placeholder/
  font/fallback掩盖错误。

## 6. 文件范围

### 预计新增

```text
tasks/170-symbolseditor-normal-spine-imgnumber-inheritance-<utctime>.md
```

仅在实现和自动化验收完成后创建执行报告。

### 预计修改

```text
packages/rendercore/src/symbol/{manifest,materialize-package,package,render-symbol,types}.ts
packages/rendercore/src/symbol-image-string/{controller,mapped-display,resources,types}.ts
packages/rendercore/src/symbol-value-presentation/{create-symbol-value-presenter,render-symbol-value-controller,types,value-display}.ts
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/tests/symbol/{manifest,materialize-package,package,render-symbol,symbol-value-vite-resource-generator}.test.ts
packages/rendercore/tests/symbol-image-string/{controller,mapped-display,resources}.test.ts
packages/rendercore/tests/symbol-value-presentation/{manifest-resources,render-symbol-value-controller,symbol-value-presenter}.test.ts
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/ui/{workspace-app,resource-picker,ui-session}.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{editor-project,app-shell,resource-picker,image-string-dependency,zip-io}.test.ts
apps/game002/tests/{assets,crave-skin}.test.ts
apps/game002/tests/value-resource-fixture.ts
apps/symbolseditor/README.md
packages/rendercore/README.md
docs/symbol-package.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

### 原则上不应修改

```text
apps/imgnumbereditor/**
apps/{popupeditor,gamelayouteditor,gamelayoutpkgcli,game003,gameviewer,gameviewer2}/**
apps/game002/src/**
packages/{logiccore,gameframeworks,editorresource,browserartifactio}/**
packages/rendercore/src/{image-string,popup,scene-layout}/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

若必须修改 manifest version、其它 package schema、正式 assets、game business resolver、依赖或
lockfile，属于明显范围扩张，执行前必须说明新证据并重新评估。

## 7. 实施步骤

1. **固定基线和 legacy 行为**
   - 重核 HEAD/status、规则、本计划、task169 public shape和 `assets/crave` manifest。
   - 先覆盖 single/multi exact target、per-tier same/divergent binding、旧 shared special map、CN 四档
     与 AF/WL/WM/CM state coverage，记录旧可见性/resource/text结果。

2. **实现 shared/legacy strict schema**
   - 增加 named `spineSlot + non-Spine targets` 与 value `tierResources + shared Normal` 类型/parser。
   - 校验 union互斥、tier长度、state kind、slot、special map、unknown field和 deep freeze；保留全部
     legacy typed信息，不在 parser 中扩大 coverage。

3. **实现 stable profile-switchable display**
   - 在 `mapped-display.ts` 建立稳定外层 container与原子 `setProfile()/setText()`；profile包含 prepared
     image-string resource、anchor、special map和 transform输入。
   - resource/profile切换复用 texture与可复用 sprite，失败不改变旧children/text/snapshot；destroy
     一次释放 occurrence-owned对象，不销毁 pool texture。

4. **统一命名 node attachment 状态机**
   - shared Spine state只在 player/slot真正改变时 reattach；相同 player的动画/state变化为 no-op。
   - non-Spine exact target使用同一 instance direct/hidden切换；legacy exact Spine targets映射到相同
     stable controller，不再创建每state display。
   - 覆盖 normal fallback、state texture priority、late init、continuation、reset/release/destroy。

5. **统一 value tier resource 与 Normal 配置**
   - resource pool prepare每档 JSON，但 controller只拥有一个 display；同档改value只setText，跨档先
     prepare目标profile/player，再原子切profile和attachment。
   - shared slot/transform/special map跨全部tier；legacy full binding在profile切换时应用该档旧字段，
     保持兼容且仍复用稳定instance。
   - presenter与reel controller共用同一display factory和transaction语义。

6. **接通 closure、materializer和 generator**
   - package collector、mapped rewrite、pool和Vite generator结构化遍历tierResources/shared special，
     同时保留legacy per-tier/top-level special输入。
   - shared slot逐全部实际Spine state/tier skeleton验证；resource/glyph/special image进入exact closure，
     不扫描任意JSON字符串、不手改生成物。

7. **重构 Symbols Editor UI 与 transaction**
   - 新配置渲染tier JSON selectors + 一张Normal卡；Spine state移除重复fields，non-Spine target UI保留。
   - legacy等价数据可无损呈现简单UI；divergent数据保留标记卡和显式migration，不自动选来源。
   - tier增删/移动只对齐resource ref；state rename/delete/type change、resource replacement、Picker stale/
     cancel、compile/export均用单一draft transaction，失败整体回滚。

8. **回归、文档和收尾**
   - rendercore断言stable container identity跨state/tier/direct/hidden不变，并覆盖strict failure/cleanup。
   - Editor覆盖无档位/多档位简单UI、legacy导入迁移、ZIP round-trip；game002读取 `assets/crave`
     验证旧行为，不修改正式asset。
   - 更新README、Symbol Package和两份领域规则；运行L2命令并生成报告，浏览器项留给用户。

## 8. 测试与验收

### 测试原则

- object identity断言至少覆盖 normal→appear→win、同档改字、跨tier JSON、non-Spine direct→hidden→
  direct；不能只比较最终文字。
- Spine测试覆盖同player continuity、不同player reattach、全部tier同名slot、任一asset缺slot、late init
  和state texture优先级。
- legacy覆盖single target、缺部分Spine states、不同state slot、per-tier相同/不同resource/transform/
  special map与旧top-level special；parse→runtime→export结果保持。
- strict failure覆盖variant混写、tier错位、new targets引用Spine state、缺resource/glyph/special image、
  orphan、profile commit失败和stale player。
- `assets/crave` 只读 tracked fixture，不复制payload、不重写map；fake player不作为视觉证据。

### 验收级别

`L2`。任务修改 rendercore public Symbols schema/resource shape、display ownership、generator和直接
consumer Symbols Editor/game002 测试；需验证直接依赖链。不改根工具链、lockfile或release，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter symbolseditor --filter game002 typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolseditor test
pnpm --filter game002 test
pnpm --filter symbolseditor build
git diff --check
```

`symbolseditor typecheck/build` 的 `prepare:deps` 会构建 rendercore；generator parity由rendercore测试内
fixture保护。失败时先最小化，不扩大为整仓扫描。

### 人工验收

由用户执行，实施会话不启动浏览器：

1. 普通 Spine symbol只配置Normal ImgNumber，切appear/win/feature，确认无重复表单且显示/移动服从
   Spine animation；用调试信息确认instance identity不变。
2. 多tier symbol为每档选择不同ImgNumber JSON，只配置一次Normal slot/样式；跨threshold/state确认
   资源和文字正确、无重复instance或闪断。
3. 对 `spinBlur`/`disabled` 等非Spine state增删exact target，确认同一instance只在目标state渲染；
   导出重导并打开旧Crave package复验legacy行为。

执行报告必须把以上列为“待用户浏览器验收”，不能写成自动化已证明视觉通过。

### 独立验收建议

`建议`。涉及public manifest dual variant、旧数据round-trip、stable display ownership与异步transaction。
建议独立复跑：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolseditor test
git diff --check
```

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24。shell无Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用pnpm，不切换npm/yarn。依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才设置仓库约定代理并重试原命令。
- 本任务不需新增依赖或lockfile；若执行发现必须新增，先说明必要性和影响。

## 10. 生成物、文档与规则

- 不修改正式YAML、mapped assets或generated game resource；禁止手改generated TS。
- generator变化通过临时shared/legacy fixture与check逻辑测试，不制造第二份业务manifest。
- 更新 `apps/symbolseditor/README.md`、`packages/rendercore/README.md`、`docs/symbol-package.md`，记录
  tier JSON-only、shared Normal、non-Spine exact target、stable single instance与legacy union。
- 最小更新 `docs/agent-rules/editor-artifacts.md`、`shared-game-runtime.md`；不修改根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。实现与自动化验收后创建：

```text
tasks/170-symbolseditor-normal-spine-imgnumber-inheritance-<utctime>.md
```

UTC使用 `date -u +%y%m%d-%H%M%S`。报告记录实现、实际文件、兼容/ownership决策、偏差、命令结果、
用户待执行浏览器验收和剩余风险；不收集无关整仓统计。

## 12. 风险、假设与待确认

### 风险

- shared Spine slot把显隐/运动交给animation；若美术未正确key slot，runtime不会用state白名单补救。
- tier JSON不同会要求stable display原子换profile；children复用、失败rollback和stale async是高风险点。
- legacy与shared增加parser矩阵，但runtime必须收敛到同一stable display状态机，不能分叉lifecycle。

### 假设

- 一个instance指每logical node、每RenderSymbol occurrence一个稳定display/container；shared texture
  resource不计作可变instance。
- Spine assets按用户合同保证全部相关state/tier存在同名slot，runtime仍以strict validation验证。
- 非Spine state保留现有exact target，只改变同一instance是否渲染，不新增逐state样式。

### 待确认

无。用户已明确tier只重复ImgNumber JSON、Spine共用Normal配置、所有runtime状态共用一个instance，
并由用户负责浏览器验收。

## 13. 完成清单

- [ ] 新tier JSON-only + shared Normal和non-Spine exact target均满足。
- [ ] 新旧数据都收敛到stable single-instance runtime并有identity测试。
- [ ] legacy package无损兼容，正式assets未修改。
- [ ] public API/schema、generator、README和规则已同步。
- [ ] 指定L2自动化通过，浏览器验收明确交给用户。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的规则和本计划，核对Git基线与 `assets/crave` 旧manifest；
2. 先固定legacy行为测试，再实现shared schema和stable display，不另起兼容方案；
3. 小幅适配在报告说明；重大schema/version/文件范围扩张时先停止说明；
4. 只运行计划规定L2验收，不启动浏览器；完成后生成报告，把浏览器项留给用户；
5. 除非用户明确要求，不commit、不push、不创建PR。
