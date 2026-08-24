# 244 rendercore-symbol-state-batch-event 任务计划

## 1. 目标与完成定义

### 目标

在 Game Layout 统一 `gamelayout:/` event catalog 中增加“主转轮一组 Symbols 播放某个状态”的事件，并为 `SceneLayoutPackageRuntime.playMainReelSymbolStateBatch()`
的每个 request 增加可选 exact `symbol`。事件由 batch 成功启动边界派发，不携带 `x/y` position，核心 identity 是当前 Symbols binding、代表 symbol 与 manifest exact state。

主要使用场景是一组中奖图标同时进入 `win`，或 CN 一类图标进入包内实际声明的 `winStart`：调用方可显式传入 `symbol: "WL"` 等代表图标；省略时 runtime 从该 request
的 positions 中选择数值最小的 symbol code（最高级图标）并解析其 exact symbol。Game Layout v5 event audio 只需绑定这个 `symbol + state` event，即可为该组播放一次中奖音效。

### 完成定义

- [ ] `playMainReelSymbolStateBatch()` 的 request 使用 Scene Layout 专属 additive 类型并增加可选 `readonly symbol?: string`；现有不传字段的调用兼容，裸 reel batch contract 不承载 symbol name。
- [ ] 每个已导出的 Symbols binding、exact symbol 与 manifest exact state 都编译一个 canonical event：
      `gamelayout:/symbol-package/<binding-id>/symbolsstatebatch/<symbol-id>/<state-id>`。
- [ ] 一次合法 `playMainReelSymbolStateBatch()` 调用在完整 batch preflight 成功后、首个 symbol playback mutation 前，
      按 request 输入顺序为每项同步派发一次；一个 request 无论包含多少 positions 都只有一个 occurrence。两个独立
      request 即使解析到同一 address 也各自产生一次 occurrence，不跨组去重。
- [ ] request 显式 `symbol` 时必须是 active package 中大小写精确且真实出现在该 request positions 的 symbol；省略时对规范化 positions 读取 settled code，选择最小值并 strict 映射 exact symbol。
- [ ] event descriptor/facets/detail 只公开 `symbolPackageId`、exact `symbol` 与 exact `state`；不公开 positions、
      symbol code、请求数量或业务中奖语义。
- [ ] 空 batch、空 positions、unknown/unsupported state、非法坐标、spinning/empty cell、已 aborted signal 或其它
      preflight failure 不派发 batch event，也不留下部分 symbol playback。
- [ ] batch 已开始后的 completion、abort、supersede 或播放失败不撤销 occurrence，也不伪造 completion event；
      原 Promise、取消和 fail-stop 行为保持不变。
- [ ] 新 `symbols-state-batch` 与逐 occurrence `symbol-state` 是两个独立 event family；后者的 exact/wildcard `entered|exited`、dispatch/interest、legacy cue 与 request API 保持不变。
- [ ] RenderCore production resolver 与 editor inspector 继续共用唯一 catalog compiler；EditorCore dialog、Editordemo
      和 Gamelayout Editor 的 event audio dialog 都能看到并选择新的 batch family，且不各自维护地址表。
- [ ] Game Layout v5 `eventAudio` 可把一次性音效绑定到 `symbol + state` event；音频解锁后一个含多个 positions 的
      request 只创建一次对应 event track voice。现有 `ignoreLegacyAudio` 仍由用户显式控制是否禁用旧 Symbol cue。
- [ ] 定向自动化、真实浏览器人工验收、public 文档、稳定领域规则与 UTC 中文执行报告完成。

## 2. 范围

### 包含

- RenderCore 纯 Game Layout event catalog 的 batch family、canonical address、descriptor、facets 与 detail contract。
- Scene Layout main-reel batch request 的 additive optional `symbol`、explicit validation 与 omitted auto-resolution。
- standard `RenderReelSet` 和 legacy grid-cell `RenderGridCellReelSet` 共用的“完整 preflight 后、播放前”batch accepted
  边界；不为两种 reel 复制不同事件逻辑。
- `SceneLayoutPackageRuntime.playMainReelSymbolStateBatch()` 到唯一 runtime event manager 的同步派发，以及现有
  event-audio controller 对该 occurrence 的消费。
- EditorCore event dialog 的 family label/facet 展示及 ZIP catalog 测试；Editordemo 继续通过 EditorCore dialog 自动
  获得候选。
- Gamelayout Editor current-project inspector、全局 event audio dialog 的候选与一次性音效配置测试。
- RenderCore/EditorCore/Gamelayout Editor 定向测试、README/address reference、最小领域规则与执行报告。

### 不包含

- 不修改 Symbols、Scene Layout、audio 或 event-audio manifest 版本、字段、assets map、ZIP closure 或生成物。
- 不把 positions、symbol code、payline/result/amount、CN、`win`、`winStart` 等业务值写进 shared address、catalog、fixture
  或 runtime 分支；symbol/state 候选只来自 exact Symbols manifest 与 active package game config。
- 不把 batch event 扩展到 `requestMainReelSymbolStates()`、单个 `SymbolHandle.playState()`、landing appear、cascade
  内部播放或绕过 Scene Layout package runtime 的裸 reel API。
- 不新增 batch id、调用序号 selector、坐标 wildcard、任意 address 输入、alias、默认 state 或完成事件；省略 symbol
  时唯一允许的默认解析规则就是 request positions 中最小 numeric symbol code。
- 不自动关闭或迁移 legacy Symbol cue；需要“只播新的一次音效”的项目继续在 Gamelayout Editor 显式启用
  `eventAudio.ignoreLegacyAudio`，旧数据默认行为不变。
- 不修改 game002/game003 业务编排、production assets、外部 `pixicrave`/`piximinecart2`、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-24T09:49:25Z
HEAD: 2a9ddb64560c900c17d2fd56f7423667632ca63d
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,editor-artifacts,scene-layout}.md`、任务 241/242/243 计划及相关报告、
  `docs/gamelayout-runtime-addresses.md`；目标目录没有补充 `AGENTS.md`。
- `packages/rendercore/src/scene-layout/core/runtime-address-catalog.ts#compileGameLayoutRuntimeEventCatalog()` 是 production
  runtime 与 editor inspection 共用的唯一纯 catalog compiler；当前 `GameLayoutRuntimeEventFamily` 有
  `symbol-state`，但没有 batch family。
- 同文件 `addSymbolAddresses()` 当前按 binding × symbol × state × `entered|exited` × `*/*|x/*|*/y|x/y`
  预编译 occurrence event。地址及 detail 都包含 symbol 和坐标，因此把 audio 绑定到它会按命中的 occurrence 分别触发。
- `packages/rendercore/src/scene-layout/package-runtime.ts#playMainReelSymbolStateBatch()` 是 public Scene Layout batch façade；
  它先按 position 处理 legacy Symbol cue，再委托 active standard/grid-cell reel 的
  `playVisibleSymbolStateBatch()`。当前 request 直接复用 `VisibleSymbolStatePlaybackRequest`，没有代表 symbol 字段或调用级
  group event。
- `packages/rendercore/src/reel/{render-reel-set,render-grid-cell-reel-set}.ts#playVisibleSymbolStateBatch()` 已先遍历全部
  request/position 做 capability、phase、empty cell 和坐标 preflight，再通过
  `symbol-state-playback.ts#startSymbolStatePlaybackBatch()` 同步启动全部 playback；这是新 event 必须复用的原子边界。
- `packages/rendercore/src/scene-layout/package-runtime.ts#createSymbolStateObserver()` 与
  `emitSymbolStateTransition()` 只观察实际 occurrence resolved-state 变化；它应继续专注逐格事件，不能被伪装成 batch
  事件或从多个 transition 反推一次调用。
- `packages/rendercore/src/scene-layout/core/runtime-address.ts#createGameLayoutRuntimeAddresses()` 把唯一 compiler 的 entry
  注册到 package-owned event manager；`bindEventAudio()` 已能消费任一 catalog event，不需要新的 audio schema/runtime。
- `packages/rendercore/src/scene-layout/editor/runtime-event-catalog.ts#inspectSceneLayoutRuntimeEventCatalog()` 从 strict Layout
  与 nested Symbols package 读取 binding、symbols 和 state preset，并调用同一 compiler；新增 family 后 editor 候选会
  自动与 production parity。
- `packages/editorcore/src/assets/ui/game-layout-event-dialog.ts` 按 entry family/facets 渐进筛选，只有
  `FAMILY_LABELS` 需要新的人类可读名称；adapter 不解析地址。`apps/editordemo/src/main.ts#mount()` 直接复用该 dialog。
- `apps/gamelayouteditor/src/model/editor-runtime-event-catalog.ts#inspectEditorWorkspaceRuntimeEventCatalog()` 从当前项目 exact
  closure 调用 RenderCore inspector；`src/ui/event-audio-dialog.ts#mountProjectEventAudioDialog()` 也直接消费 entry，非
  `mode-state` family 默认创建 once/effect 配置，适合新的 batch event。
- 直接测试入口是 RenderCore `tests/scene-layout/{runtime-address,package-runtime}.test.ts` 与 reel batch tests、EditorCore `tests/adapters-and-ui.test.ts`、Gamelayout Editor `tests/event-audio-dialog.test.ts`。

## 4. 需求解释与技术决策

### 需求解释

1. “一组 symbols 的状态切换”解释为一次 public batch 调用的 presentation intent，不是从 N 个实际 symbol transition
   聚合推断。只有调用边界知道哪些 positions 属于同一组，因此事件必须由 `playMainReelSymbolStateBatch()` 发起。
2. “pos 不需要给，重点是 symbol + state”同时适用于 address、facets 和 detail：runtime contract 携带代表 symbol 和 state，但不携带 positions、scope 或坐标。
3. “传一个 symbol”解释为每个 request 的代表 symbol，不是把整组 positions 限制成只能包含这一种 symbol。显式值必须
   大小写精确、属于 active package，并至少命中该 request 的一个 settled position，避免任意标签制造误导 event。
4. “不传就找最高级图标”严格定义为：按 reel batch 相同规则规范化该 request positions，读取每格 settled code，选择数值
   最小的 code；相同最小 code 结果相同，不再按位置或资源顺序打破平手。code 无法映射 exact symbol 时显式失败。
5. “只需要一个 event”解释为一个 request 对应一个 occurrence，而不是一个 position 一个 event。batch 数组中的多个 request
   是多个显式组，按输入顺序各派发；即使两个组的 `symbol + state` 相同，也保留两个 occurrence 和独立 sequence。
6. `win` 与 CN 常用的 `winStart` 都只是 manifest-owned state 示例；catalog 只枚举当前 Symbols package 声明的 exact id，
   unknown case 或未声明 state 显式失败。

### Canonical event 合同

```text
gamelayout:/symbol-package/<binding-id>/symbolsstatebatch/<symbol-id>/<state-id>
```

- canonical marker segment 固定为用户指定的 exact `symbolsstatebatch`；它不是 alias，也不接受连字符或大小写变体。
- family：`symbols-state-batch`。
- facets：`symbol-package`、`symbol`、`state`；EditorCore 不显示 scope/x/y/edge/lifecycle 控件。
- owner：`gamelayout:/symbol-package/<binding-id>`。
- detail：`eventFamily=symbols-state-batch`、`symbolPackageId`、`symbol`、`state`；不含 positions 或 symbol code。
- catalog cardinality：binding × symbol × state；不随 columns、rows 或一次 request 的 position count 增长。

### 派发边界

- standard/grid-cell 共用或等价复用现有全批 preflight；全部 request/position/capability/AbortSignal 通过后才进入一次
  package-owned同步 start hook。
- preflight 结果必须保留每个 request 规范化后的 settled code evidence。package runtime 对每项验证显式 symbol 或按最小 code
  解析自动 symbol，先完成全部 request 的 symbol/address validation，再按 request 输入顺序同步 emit，随后启动整个 symbol
  playback batch；不得为了事件把 mutation 拆成逐 request/逐 position 提交。
- event listener 的同步错误沿用现有 manager fail-stop，不开始 symbol playback；成功 emit 后发生的异步取消/失败不回滚
  已发布的离散 occurrence。
- 不从 `RenderReelSymbolStateTransition` 收集或 debounce，因为同 state 的无变化 occurrence、equivalent resolved state、
  completion timing 和并发 batch 都不能可靠还原调用 identity。
- 不引入 public prepare/commit plan、业务 group DSL 或第二个 event manager；如需抽取内部 preflight/start helper，只在 reel
  owner 内复用。public 变化仅限 Scene Layout request 的 additive optional `symbol`，bare reel method 与 Promise 语义不变。

### Editor 与音频决策

- EditorCore 只增加 `symbols-state-batch` 的显示名称，继续完全按 compiler facets 渲染；Editordemo 不维护 fixture address
  表或 app-local family switch。
- Gamelayout Editor 不增加专用“中奖音效”表单；现有“全局 Event 音乐音效”中选 batch family、binding、symbol 和 state，
  并使用默认 once/effect 即可。
- `SceneLayoutEventAudioV1` 已保存 canonical event address，现有 compile/resolve/bind 能直接接入新事件，所以不升级
  Scene Layout v5 或 event-audio v1。
- 新 event 不自动播放音频；只有 authored event-audio binding 才播放。旧 Symbol cue 保持默认兼容，项目若要保证只有新
  event track，显式设置 `ignoreLegacyAudio=true`，不在 runtime 猜用户意图。

## 5. 职责与合同

- **Reel owner**：继续拥有全 batch preflight、同批启动、AbortSignal 和 standard/grid-cell occurrence 一致性；只向 package
  façade 提供一次同步 accepted/start 边界，不理解 Game Layout address、binding 或 audio。
- **Scene Layout package runtime**：取得 active exact binding；显式 symbol 做 package membership + position presence 校验，省略
  时从 prepared position codes 选择最小值并通过 game config strict 映射 symbol，再生成 canonical event 交给唯一 controller。
- **Event catalog/controller**：唯一编译静态 descriptor/facets/detail，strict resolve/bind/emit，并与 editor inspector parity；
  不添加运行期动态 batch address或历史回放。
- **Event audio**：继续把 catalog occurrence 路由到 authored track；一次 batch event 对应一次 `playTrack()`，解锁前 once
  event 仍按既有合同丢弃，不增加补播。
- **EditorCore/Editordemo/Gamelayout Editor**：只消费 frozen catalog entry；不解析 address、复制 state 列表或硬编码业务
  symbol/state。
- **失败策略**：unknown binding/reel/symbol/state/address、显式 symbol 不在 positions、code 无法映射、非法 batch、preflight
  failure、destroyed runtime 显式失败；失败前不派发 occurrence，启动后异步失败按现有 Promise fail-stop。
- **禁止行为**：按坐标循环 emit batch event、从逐格事件反向聚合、自动首 state、CN/win 分支、静默关闭 legacy cue、
  editor 自建候选表或音频生命周期 event。

## 6. 文件范围

### 预计新增

```text
tasks/244-rendercore-symbol-state-batch-event-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/core/runtime-address-catalog.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/src/reel/{render-reel-set,render-grid-cell-reel-set,symbol-state-playback,types}.ts
packages/rendercore/tests/scene-layout/{runtime-address,package-runtime}.test.ts
packages/rendercore/tests/reel/{render-reel-set,render-grid-cell-reel-set}.test.ts
packages/rendercore/README.md
packages/editorcore/src/assets/ui/game-layout-event-dialog.ts
packages/editorcore/tests/adapters-and-ui.test.ts
apps/gamelayouteditor/tests/event-audio-dialog.test.ts
docs/gamelayout-runtime-addresses.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md
```

`apps/editordemo/src/main.ts` 与 `apps/gamelayouteditor/src/{model/editor-runtime-event-catalog,ui/event-audio-dialog}.ts` 已 generic 消费 shared catalog，原则上不修改；真实 integration 暴露缺口时才最小适配并记录。

### 原则上不应修改

```text
apps/{game002v2,game003v2,imgnumbereditor,popupeditor,symbolseditor}/**
assets/**
packages/{logiccore,gameframeworks,uiframeworks,audiocore,vnicore}/**
packages/rendercore/src/{symbol,popup}/**
packages/rendercore/src/scene-layout/{manifest,manifest-v3}.ts
pnpm-lock.yaml
AGENTS.md
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

若实现需要修改 Scene Layout/event-audio schema、bare reel batch 参数、game app 调用、production asset 或依赖，必须先停止
并说明范围扩张，不能用计划外兼容 alias 或 manifest bump 事后合理化。Scene Layout main-reel request 增加 optional
`symbol` 已属于本计划授权范围。

## 7. 实施步骤

1. **确认执行基线与事件矩阵**
   - 重核 HEAD/status、三份领域规则、本计划、task 240/241/242 的 catalog/editor/audio contract，以及 task 243 后的
     static/live address registry。
   - 用中性 binding/symbol/state fixture 固定显式 symbol、自动最小 code、同 address 多 request、不同 symbol/state、
     standard/grid-cell、preflight failure、abort、legacy cue 与 event-audio 组合，不使用游戏业务名。
2. **扩展唯一纯 event catalog**
   - 在 `runtime-address-catalog.ts` 增加独立于单图标 `symbol-state` 的 `symbols-state-batch` family，按
     binding × symbol × state 编译含 exact `symbolsstatebatch` marker 的 address、owner、facets 和最小 detail metadata。
   - 保护 runtime resolver 与 editor inspector entry/address 顺序及 parity，证明 cardinality 不依赖 columns、rows 或 request
     position count。
3. **建立全批 accepted/start 边界**
   - 收口 standard/grid-cell 现有“完整 preflight 后再批量启动”的内部流程，使 package runtime 能在 mutation 前收到一次
     同步 prepared batch start 通知，并取得每个 request 规范化 positions 的 settled code evidence。
   - 全部失败路径在通知前结束；通知或 listener 失败时不启动任何 symbol；通知成功后继续复用同一个
     `startSymbolStatePlaybackBatch()` 取消/settle owner。
4. **接入 Scene Layout runtime 与 event audio**
   - 增加 Scene Layout 专属 request type 的 optional `symbol`；显式值 strict 验证 exact package membership 与 position presence，
     省略时按 request 最小 symbol code 自动解析，完成全部 request validation 后按输入顺序各派发一次 event。
   - 验证 event-audio unlock 后多 positions 的单 request 只启动一条 once track；`ignoreLegacyAudio` false/true 只影响既有
     legacy cue，不影响新 batch event，单图标 exact/wildcard `symbol-state` event 继续按实际 transition 派发。
5. **同步 Editor consumers**
   - 给 EditorCore 的批量 family 增加与“单图标状态”明确区分的中文标签，用 inspector fixture 验证候选只需
     binding/symbol/state，且可在 dialog 中保存、复验和替换后判失效。
   - 验证 Editordemo 导入完整 Layout ZIP 后自动显示/选择新 family；Gamelayout Editor current project dialog 可为它配置
     once/effect 并 round-trip exact address，无 app-local catalog。
6. **文档、规则与收尾**
   - 更新 RenderCore README 与 runtime address reference，明确 batch event 与逐 occurrence event、legacy cue、失败/abort 的
     差异；只把稳定事件边界补入 shared runtime/scene-layout 规则。
   - 运行第 8 节 L2 定向验收与人工浏览器验证，检查 diff/旧地址残留，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- RenderCore catalog 测试覆盖 exact `symbolsstatebatch/<symbol>/<state>` address、独立 family/facets/detail、symbol/state 来源、
  runtime/editor parity，以及不随 coordinate 扩张；同时保护原 `symbol-state` entries 不变。
- standard/grid-cell + package runtime 覆盖：显式 symbol、自动选择最小 code、同 code tie、两个 request 同 address 仍两次、
  不同 symbol/state 按输入顺序；invalid/empty/spinning/unsupported/aborted、unknown symbol、symbol 不在 positions、unmapped code
  为零 batch event 且零部分 playback。
- package runtime 覆盖 batch event 相对单图标 occurrence event 的稳定顺序、Promise completion/abort/failure、不含 position/code
  detail、event listener error，以及 legacy cue compatibility。
- event audio 使用现有 fake backend 证明 unlock 后一个多-position request 的 batch occurrence只创建一个 once voice；不以
  方法调用计数冒充 audio runtime 验收。
- EditorCore/Gamelayout Editor 用完整中性 Layout + nested Symbols closure，验证 shared inspector 候选与 dialog 输出，不在
  测试中手写一个绕过 compiler 的假 entry。

### 验收级别

`L2`。原因是修改 RenderCore 对外可枚举 event contract，并由 EditorCore、Editordemo、Gamelayout Editor 和 Scene Layout
event audio 直接消费；不涉及根工具链、lockfile、大规模跨包重构或 release，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address.test.ts tests/scene-layout/package-runtime.test.ts tests/reel/render-reel-set.test.ts tests/reel/render-grid-cell-reel-set.test.ts
pnpm --filter @slotclientengine/editorcore --filter editordemo --filter gamelayouteditor typecheck
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/event-audio-dialog.test.ts
git diff --check
```

失败时先缩小到单个 catalog/reel/runtime/dialog case，判断是否由本任务引入；不自动运行根级 typecheck、lint、test、build
或 format check。

### 人工验收

必须在真实 Chromium 完成：

1. Editordemo 导入包含一个 Symbols binding、多个 symbols 和至少两个 state 的完整 Gamelayout Editor ZIP，打开 Event 组，
   确认“批量图标状态”与“单个图标状态”是两个独立 family；批量项只选择 binding/symbol/state，不出现 scope、列、行、
   entered/exited 控件，保存后显示含 `symbolsstatebatch/<symbol>/<state>` 的 canonical address。
2. Gamelayout Editor 打开同一项目的“全局 Event 音乐音效”，为 batch state 配置一个已导入音效、`once/effect`，启用
   “忽略老版本音乐音效配置”，导出/重导后 entry 保留且无 stale warning。
3. 用 production preview 或最小真实 runtime 在可信手势解锁 audio 后分别触发显式 `symbol: "WL"` 与省略 symbol 的 batch；
   确认省略时选择 positions 中最小 symbol code 的 exact symbol、每个 request 只听到一次音效，单图标状态事件仍正常，
   symbol 动画完成与 Promise 行为正常，控制台无 address/audio/runtime error。

### 独立验收建议

`建议`。涉及跨包 public event contract 与同步派发/音频副作用边界，但不涉及 credential、服务器数据、正式 schema/ZIP 版本、
资源 ownership 或 release。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/event-audio-dialog.test.ts
```

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24；当前 shell 无 `node`，执行前运行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 Node 和 pnpm，不切换 npm/yarn，不强制调整版本。
- 依赖缺失时运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置 `http_proxy`/`https_proxy=http://127.0.0.1:1087` 并重试原命令。
- 本任务不新增依赖、不修改 `pnpm-lock.yaml`。

## 10. 生成物、文档与规则

- 无 YAML、manifest schema 或正式生成物变化，不运行生成器，不手改 `dist/`。
- `packages/rendercore/README.md` 与 `docs/gamelayout-runtime-addresses.md` 记录 canonical `symbolsstatebatch` address、optional
  symbol/最小 code 解析、每 request 单次派发、preflight/abort、单图标 `symbol-state` event 和 legacy cue 差异。
- 在 `docs/agent-rules/shared-game-runtime.md` 与 `scene-layout.md` 最小补充稳定 batch event owner/边界；不修改根
  `AGENTS.md`，不把测试 fixture、业务 state 或执行证据写入规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/244-rendercore-symbol-state-batch-event-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/文件、事件地址与派发边界、计划偏差、实际验收命令/result、人工浏览器结果、剩余风险；不收集
无关 coverage、完整历史矩阵、整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- batch accepted hook 若放在全批 preflight 与代表 symbol 解析前，会让非法调用播放音效；若放在首个 playback mutation 后，
  listener 失败会留下部分状态。因此实现必须保留明确的 preflight→resolve all symbols→events→mutation 顺序。
- 当前 legacy Symbol cue 在 package façade 内按 position 播放。新 event 不自动取代旧 cue；项目未启用
  `ignoreLegacyAudio` 且同时配置两者时会有意地听到两套音频，文档和 UI 验收需说明该兼容行为。
- 一个调用包含多个 request 时会产生多个 batch event；这是多个显式图标组的真实语义，即使 address 相同也不得跨 request
  去重或丢弃后续 occurrence。
- editor fixture 只伪造 catalog entry 会掩盖 nested Symbols parser parity；测试必须走完整 closure inspector。

### 假设

- 用户示例和当前仓库唯一 production consumer 都通过 `playMainReelSymbolStateBatch()` 的每个 request 表达一组状态播放；
  本任务不需要给更底层裸 reel consumer 建立 Game Layout event。
- “只需要一个 event”指一个 request 的一批 positions 只派发一次；batch 数组中多个 request 仍各自派发。
- 音效在 batch 成功启动边界播放即可，不需要在所有 symbol once-complete 后另一个 completion event。

### 待确认

无。

## 13. 完成清单

- [ ] optional symbol、最小 symbol code 自动解析、`symbolsstatebatch/<symbol>/<state>` 地址与每 request 单次派发满足计划。
- [ ] “批量图标状态”与单图标 `symbol-state` 是两个独立 event family，原地址与派发语义不变。
- [ ] standard/grid-cell 共用完整 preflight→resolve all symbols→events→mutation 边界，无部分启动。
- [ ] 原逐 occurrence event、legacy cue、public API、Promise/abort 行为保持兼容。
- [ ] runtime/editor 唯一 catalog parity、EditorCore/Editordemo/Gamelayout Editor 接入完成。
- [ ] event-audio 一次 voice 与显式 `ignoreLegacyAudio` 行为通过验证。
- [ ] README、address reference 与最小领域规则已同步，无 schema/生成物/lockfile 变化。
- [ ] 指定 L2 自动化与真实 Chromium 人工验收通过。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的三份领域规则和本计划；
2. 核对 Git 基线、task 240–243 当前实现和工作区，判断变化是小幅适配还是需要重新规划；
3. 按 `preflight → explicit/lowest-code symbol resolution → one event per request → symbol playback` 实现，不从逐格 transition
   反推调用；
4. 只给 Scene Layout batch request 增加 additive optional `symbol`，保持 schema、bare reel contract、旧单图标 event/legacy cue
   与 editor shared-catalog 边界；
5. 小幅适配记录到执行报告，重大范围扩张先停止说明；
6. 只运行本计划规定的 L2 验收和真实 Chromium 人工步骤；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
