# 150 gameviewer2-local-scene-flow-preview 任务计划

## 1. 目标与完成定义

### 目标

新建完全本地、与服务器 GMI/component 无关的 `apps/gameviewer2`。用户导入
`gamelayouteditor` 导出的 production scene-layout ZIP 后，在两条独立的编辑轴上：

1. 编辑有序 `scene/otherScene` snapshot 链；
2. 编辑有名的 symbol 状态编排，并为每个 snapshot 的每个格子选择编排。

新窗口使用 ZIP 中的实际 layout、公开本地轮带、symbol 资源和状态动画预览整条
本地流程。首个边固定为 snapshot `0 -> 1` 的真实 spin；后续 snapshot 以通用
settled commit 顺序推进，不伪造任何服务器 component 语义。

### 完成定义

- [ ] `apps/gameviewer2` 可独立开发、构建和打开，只导入一个 canonical production layout ZIP，不提供 server URL、credential、bet、GMI 或 component 配置。
- [ ] ZIP 导入后严格展示 initial mode 的 grid geometry、active Symbols package、display symbols、绑定的公开 reel set、number weight tables 和 symbol state 能力。
- [ ] 转轮类型不在 gameviewer2 重新配置；直接使用 Layout ZIP binding 的 `renderMode` 选择 rendercore 现有 `RenderReelSet | RenderGridCellReelSet`，不新建第三套 reel runtime。
- [ ] 默认生成两个 snapshot：首个全格选择默认 Spin 编排 `normal -> spinBlur`，第二个全格选择默认 Landing 编排 `appear -> normal`。
- [ ] 未满两个 snapshot、matrix 维度/值非法、symbol code 未知、编排引用或 state 能力不匹配时不得开始预览。
- [ ] Scene tab 可从当前 binding 的公开 reel set 按列本地 roll，也可逐格选择 exact display symbol。
- [ ] OtherScene tab 可选择 exact number weight table 对目标格独立加权 roll，或在不选权重表时用一个正安全整数设置目标格；目标可为全部格或当前 scene 中所选多个 symbol 的位置，且支持逐格填写/清空。
- [ ] 新建 snapshot 深拷贝当前链尾的 scene、otherScene 和每格编排引用，不共享可变 matrix。
- [ ] 状态编排列表一次只编辑一项；可新建、指定新名复制、重命名、添加/插入/移动/更换/删除 state step，两个默认编排也可编辑。
- [ ] 独立预览窗口先经过一次性 MessageChannel payload 和 hash/schema/capability 复验；自动播放后可 Replay，不发起 fetch、WebSocket、spin 或 collect 请求。
- [ ] 真实 spin 在源 snapshot 编排完成后启动，每个落地格从自己的目标编排第一项开始；`once` 状态等实际 completion，最后的 stable 状态保持。
- [ ] 第三个及后续 snapshot 在前一组编排完成后原子提交变化的 scene/value，复用未变 occurrence/player，然后并行播放本组每格编排；最终保留末 snapshot。
- [ ] 完成 L2 定向自动化、真实 ZIP 浏览器人工验收和 UTC 中文执行报告。

## 2. 范围

### 包含

- 新建 `apps/gameviewer2` 配置器和同 app 的独立 runtime window。
- versioned strict 本地 project schema、immutable store、readiness snapshot、ZIP summary 和 launch payload。
- 两条编辑轴：snapshot 链与有名 symbol state choreography 列表。
- 基于 imported game config 的 scene roll、number-weight/fixed-value otherScene roll、symbol filter 和逐格编辑。
- rendercore 中性 finite choreography runner、转轮逐格落地观察、snapshot prepare/commit/rollback 和本地 flow player。
- rendercore 的窄 `scene/otherScene` 本地流程层：headless inspect/readiness、本地抽样、播放计划和 one-call runtime factory。
- 直接测试、app README、新的领域规则路由和最小 shared runtime 规则更新。

### 不包含

- 不连接、模拟或嵌入正式/测试服务器；不解析 server authoring JSON、GMI、bet method、component、result、randomNumbers 或真实服务器轮带。
- 不复用 `SlotRoundFlowProfileV1`、`GameLogic`、configured-round coordinator 或 `createSlotGameFramework()` 来伪装本地 round。
- 不实现 win/remove/dropdown/refill/cascade、popup、金额、game mode transition 或业务 symbol 转换。
- 首版只预览 layout initial mode 的 active Symbols binding；不猜测或自动切换其它 mode/package。
- 不把本地 snapshot 链分组成服务器 step；多 step/多 scene 用多个顺序 snapshot 扁平表达。
- 不为 snapshot 增加删除/重排、分支、条件跳转或循环；任务 150 只要求链尾新建并 clone 前值。
- 不做 project JSON/ZIP 导入导出、localStorage/IndexedDB 持久化、协作或上传服务；首版配置仅属于当前页面 session。
- 不修改 gamelayouteditor 导出格式、production ZIP、Symbols package schema、root toolchain 或 lockfile。
- 不在 gameviewer2 复制 standard/grid-cell 选择器、reel factory、spin plan 或转动状态机。

## 3. 制定计划时的基线

```text
UTC: 2026-08-01T03:44:11Z
HEAD: 258562ed119061e5a128bc464b361011e04c3b11
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 本规划会话读取了根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/{gameviewer-round-flow,shared-game-runtime,scene-layout,editor-artifacts,game002}.md`；范围内没有更深层 `AGENTS.md`。
- `apps/gameviewer` 当前是 live server 配置器：`apps/gameviewer/src/runtime/create-game.ts` 调用 `createSceneLayoutSlotGameTemplate()`，而 `packages/gameframeworks/src/scene-layout-template/index.ts` 严格要求 `live/wager/round/presentation`。它不能成为 gameviewer2 的本地合同。
- `inspectSceneLayoutPackageZipBytes()` 已负责 canonical ZIP bounded extraction、manifest/map/hash/path/orphan 闭包验证；`loadSceneLayoutPackageFromZipBytes({loadSymbolTextures:false})` 可在不创建预览 texture 时取得 active `gameConfig`、symbol manifest/state preset 和 package capability。
- `LogicGameConfig` 已暴露 `getReels()`、`getReelNames()`、`getNumberWeightTableNames()` 和 `getNumberWeightTable()`；不需新建第二份 game config parser。
- `SceneLayoutPackageRuntime` 已能从公开本地轮带 `spinMainReelToScene()`、逐格请求 state、读取 once/loop completion counter 和提交 presentation value，但只暴露整体 `isMainReelSpinning()`，没有中性逐格 landing delta 或多 snapshot flow player。
- gamelayouteditor/production manifest 已在 Symbols binding 导出 exact `reelSet` 与 `renderMode: "standard" | "grid-cell"`；`SceneLayoutPackageRuntime.createReelPresentation()` 已分别复用 `RenderReelSet` 和 `RenderGridCellReelSet`。当前 Layout schema 不导出 `speedSymbolsPerSecond/startStepMs/stopStepMs/...` spin 时序。
- `SymbolStateSequenceController` 已有 step 增删移动、stable `holdSeconds` 和 once completion 驱动，但当前必然循环；本地 snapshot 链需要保留旧默认的可选 finite 模式。
- `SceneLayoutPackageRuntime.resetReelScene()` 是立即全盘 reset；不足以保证后续 snapshot 对未变 occurrence/player 的 continuity 和对变更格的 prepare/commit/rollback。
- game002 证明一次 round 可含多 step、多 scene/otherScene 与特殊 spin 阶段，但 component 解析、CN/WL/WM/CM/CO/AF 语义和 cascade/freegame 时序都是业务能力，不进入 gameviewer2 或 shared 本地 flow。

## 4. 需求解释与技术决策

### 需求解释

- 一个 snapshot 是一对同维度的 x-first matrix：`scene` 保存 exact display symbol code，`otherScene` 保存 `null | positive safe integer`，另有同维度 choreography-id matrix。
- snapshot `0` 是 initial/source，snapshot `1` 是固定 spin target。这是任务 150 唯一的 spin 边，符合“spin 一定绑定第一和第二场景”。
- snapshot `2..N` 是简化通用后续阶段：先原子提交 target matrix，再播放 target 格子编排。这一明示行为不冒充 remove/dropdown/refill 或业务 transform。
- 状态编排 step 只引用 imported Symbols manifest 的 exact state id。`once` 根据真实 animation completion 前进；非末尾 stable step 用显式非负 `holdSeconds` 前进；末尾必须是 stable 并保持，不循环。
- 默认 Spin 编排的 `normal` 是源阶段起点，`spinBlur` 是真实转动期保持状态；默认 Landing 编排在每格真实落地边界请求 `appear`，由 once completion 进入末尾 `normal`。
- Scene roll 只使用 layout initial binding 指定的公开 reel set，每列均匀选本地 stop 并连续读取 rows；不从 target scene 反查 stop，不涉及服务器轮带。
- OtherScene 的 symbol filter 为空时表示全部格；非空时仅匹配当前 snapshot `scene[x][y]` 对应的所选 symbol。未命中格保留原值。
- Scene roll、逐格 symbol 修改和 otherScene roll 都不静默改写已选 choreography；改动导致新 symbol/state 不兼容时 readiness 精确报告 snapshot/坐标/symbol/state。

### 关键决策

1. **新建 rendercore scene/otherScene flow 层。** `gameviewer2` 只依赖 `@slotclientengine/rendercore/scene-layout` 的窄 public API；不经过 gameframeworks，不为现有 live template 增加 fake session，也不让 app 直接依赖 logiccore/Pixi 或 rendercore 内部 display object。
2. **使用 strict V1 project 而不是 GMI fixture。** project 只包含 layout hash 外的本地表现数据：版本、明示 reel spin profile、choreographies 和 snapshots；未知字段/版本立即失败。
3. **两层验证。** 纯 schema parser 先检查 shape/id/name/reference/matrix/value；package-aware readiness 再检查 geometry、renderMode/spin profile、symbol code、state preset/equivalence 和每格真实 capability。
4. **扩展而不改变现有 sequence 默认。** rendercore sequence controller 增加显式 finite 模式/completed snapshot，旧 consumer 未传新 option 时仍循环；编辑 mutation API 继续单一 owner。
5. **精确落地而不用整体 spin complete 猜测。** reel/runtime 暴露每次 update 新落地的 exact visible positions，local flow player 只在该边界启动目标格编排。
6. **后续 snapshot 是 transaction。** 所有 changed code/value/state request 先 prepare，任一格失败全批 rollback；未变 symbol/code 复用 occurrence/player，值改动只更新原 controller。
7. **本地随机只用 Web Crypto。** production 不使用 `Math.random()`；测试注入 deterministic bounded integer source。加权采样遵守 game config 已校验的正权重和上界，不用浮点估算总权重。
8. **转轮类型直接复用，spin timing 仍显式。** `renderMode` 只读取 Layout binding，直接走现有 `SceneLayoutPackageRuntime` 的 standard/grid-cell factory，UI 不提供类型切换。因 Layout ZIP 当前不包含 spin 时序，project 复用 rendercore 现有 `SlotReelPresentationProfileV1` 的对应 union 分支，并在折叠的“Spin 参数”表单编辑该分支的 speed/start/stop/bounce 数值；不新建 reel config kind，不把时序硬编码在 player 中。

## 5. 职责与合同

- **gameviewer2 UI/store**：拥有当前 session draft、snapshot/choreography 选择、tab 表单、事务操作、readiness revision、runtime 页面容器/resize 和新窗口 handshake；不创建 Pixi object 或解析 package internal files。
- **rendercore scene/otherScene flow**：拥有 `SceneOtherSceneFlowProjectV1` parser、package authoring summary、scene/weight sampling API、package-aware immutable plan/readiness、finite state runner、landing delta、公开本地轮带 spin、原子 snapshot commit、Pixi ticker 和 resource/player lifecycle。
- **logiccore**：继续是 game config/reels/number weight 的唯一 parser/model owner；rendercore 只复用现有 `LogicGameConfig`/`LogicReels` 能力，不引入 `GameLogic`、component 或 netcore，本任务原则上不修改 logiccore。
- **数据合同**：ID 为非空唯一 stable id，名称 trim 后非空且大小写敏感唯一；matrix 必须 exact `columns x rows`；scene code 必须属于 active display set；otherScene 只允许 `null | positive safe integer`；每格 choreography id 必须存在。
- **state 合同**：编排至少一项且末尾为 stable；once step 不使用人工 duration；非末尾 stable step 必须有非负 finite `holdSeconds`；manifest 显式 equivalence 可作为能力解析，不得用未声明 fallback。
- **资源生命周期**：headless inspection 在提取 immutable summary 后 destroy 临时 package resource；runtime 独占 ZIP resource、Object URL、Pixi Application、ticker、frame host 和 player；启动失败、窗口卸载、Replay 替换和 destroy 只释放一次。
- **失败策略**：坏 ZIP/hash/version/renderMode/geometry/reel/state/reference/value 在创建 Pixi 或画面 mutation 前失败；播放中 prepare/update/commit 异常取消活动 flow，rollback 未提交批次并进入可见 error state。
- **禁止行为**：不复制 scene-layout/symbol/reel 状态机，不扫描路径/首项默认，不静默 alias/占位/效果降级，不缓存或推断服务器轮带。

## 6. 文件范围

### 预计新增

```text
apps/gameviewer2/{index.html,package.json,tsconfig.json,tsconfig.eslint.json,vite.config.ts,eslint.config.cjs,README.md}
apps/gameviewer2/src/{main.ts,styles.css}
apps/gameviewer2/src/model/{project.ts,store.ts}
apps/gameviewer2/src/io/imports.ts
apps/gameviewer2/src/ui/app-shell.ts
apps/gameviewer2/src/runtime/{launch-payload.ts,launch-channel.ts,entry.ts,create-preview.ts}
apps/gameviewer2/tests/{setup,project,store,imports,app-shell,launch-payload,launch-channel,create-preview,source-boundary}.test.ts
packages/rendercore/src/scene-layout/{local-scene-authoring.ts,local-scene-flow.ts}
packages/rendercore/tests/scene-layout/{local-scene-authoring,local-scene-flow}.test.ts
docs/agent-rules/gameviewer2-local-flow.md
tasks/150-gameviewer2-local-scene-flow-preview-<utctime>.md
```

### 预计修改

```text
AGENTS.md
packages/rendercore/src/symbol/{sequence.ts,types.ts}
packages/rendercore/src/reel/{types.ts,render-reel-set.ts,render-grid-cell-reel-set.ts,index.ts}
packages/rendercore/src/scene-layout/{types.ts,package-runtime.ts,index.ts}
packages/rendercore/tests/{symbol/sequence,reel/render-reel-set,reel/render-grid-cell-reel-set,scene-layout/package-runtime}.test.ts
packages/rendercore/README.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md
```

### 原则上不应修改

```text
apps/{gameviewer,game002,game003,gamelayouteditor}/**
packages/{logiccore,netcore,gameframeworks,uiframeworks}/**
assets/**
pnpm-lock.yaml
```

若执行时发现必须修改 production layout/Symbols schema、logiccore public API、gameframeworks/现有 Game Viewer 合同、lockfile 或更多 app consumer，必须先说明精确缺口和直接影响，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与固定产品边界**
   - 重新核对 HEAD、工作区、production ZIP parser、initial mode binding、symbol state preset、reel runtime 和 sequence controller。
   - 新增 gameviewer2 领域规则并更新根路由，明确无 server/component、initial-mode-only、首边 spin 和后续 settled commit。

2. **在 rendercore 定义 local project、summary 和 readiness**
   - 在 `rendercore/scene-layout` 新建 strict `SceneOtherSceneFlowProjectV1`、choreography/snapshot/spin-profile 类型与 parser，拒绝 unknown key/version。
   - 从 ZIP headless 解析 initial binding，输出仅供编辑的 immutable summary：geometry、renderMode、bound reelSet、symbol `{code,name,value-capable,states}`、state phase/playback/equivalence 和 weight tables。
   - 编译 package-aware readiness，产生 normalized project/layout hash 和精确错误；不向 app 泄漏 package resource 或 raw files。

3. **实现本地配置操作**
   - 使用 Web Crypto bounded source 实现按列均匀 stop 的 scene roll 和 exact integer-weight otherScene roll，保留 deterministic test seam。
   - 实现 app project bootstrap：独立 roll 两个 scene、otherScene 默认全 `null`、创建两个 exact-name 默认编排并填满每格引用。
   - 实现 immutable deep clone/add snapshot、scene 逐格修改、otherScene 全部/按 symbol 过滤批处理和逐格编辑，任一非法输入不部分提交。

4. **完成 finite choreography 与转轮观察合同**
   - 给 `SymbolStateSequenceController` 增加 opt-in finite/completed 语义，保持旧循环行为和编辑 API 兼容。
   - 在 standard/grid-cell reel 统一输出 exact newly-landed visible positions；同一 update 的顺序稳定且不重复，reset/cancel/destroy 清空未消费 delta。
   - 扩展 package runtime 的窄 public surface，只暴露 local player 需要的 landing/state/value/snapshot transaction，不让 app 直接操作 display tree。

5. **实现 rendercore 本地 flow player**
   - 直接把 Layout binding 与现有 `SlotReelPresentationProfileV1` 交给 `createSceneLayoutPackageRuntime()`，由它选择 standard/grid-cell implementation；local player 不复制 reel construction/spin-plan 分支。
   - 在所有画面 mutation 前 preflight 完整 plan；初始化 snapshot `0` 后并行运行其每格 source choreography，全部达到末尾状态才启动 spin。
   - spin 过程仅用 package 公开轮带生成 local phase，target scene/value 覆盖可见落点；每个 landing delta 独立启动 snapshot `1` 对应格编排。
   - spin 与目标编排全部完成后，逐个 prepare/commit snapshot `2..N`，然后等本阶段所有编排终止。
   - 提供 `play()`/`replay()`/snapshot/error/destroy，拒绝并发 play；Replay 完整取消前一 run 后回到 snapshot `0`。

6. **收口 rendercore one-call runtime**
   - `gameviewer2` runtime 页面拥有普通 DOM 容器与 `ResizeObserver`，把 exact viewport size 传给 rendercore；rendercore factory 加载/拥有 package resource、Pixi Application 和 local flow player，不依赖 uiframeworks/gameframeworks DOM 或 session。
   - factory 先重做 hash/schema/readiness，成功后才 mount canvas。其 public API 只暴露 `applyViewport()`、play/replay/snapshot/destroy，不暴露 Pixi/display tree 或 package resource。
   - 从 `@slotclientengine/rendercore/scene-layout` 导出窄合同并更新 rendercore README；保持 gameframeworks 与现有 `scene-layout-template` 完全不变。

7. **实现 gameviewer2 编辑器**
   - 搭建 app shell：ZIP 导入/summary、snapshot 列表、Scene/OtherScene tabs、编排列表与单项编辑器、Spin 参数、readiness 和预览按钮。
   - 编排新建以 `normal` 作为唯一末尾 stable step；复制必须输入新的唯一名称并新建 id；编辑被引用编排时不改写格子引用。
   - 所有 edit 提升 revision 并失效 readiness/launch；异步 ZIP/readiness 结果只在 revision 仍匹配时 commit。

8. **实现一次性新窗口预览**
   - 在 trusted click 中同步 `window.open()`，用 hash nonce + same-origin MessageChannel 一次传递 ZIP bytes、layout SHA-256 和 normalized project，URL 不包含 project/bytes。
   - runtime 严格拒绝重复/超时/错 origin/nonce/version payload，接收后断开 opener/port 并清理 nonce。
   - runtime 只调用 rendercore scene/otherScene flow public factory，显示当前 snapshot/phase、Replay 和 fatal error；页面卸载幂等 destroy。

9. **测试、文档与收尾**
   - 覆盖 strict schema、roll 边界、clone 隔离、参照完整性、state capability、finite once/stable、逐格 landing、snapshot transaction、Replay/destroy 和 launch 安全。
   - source-boundary test 只允许 gameviewer2 从 `@slotclientengine/rendercore/scene-layout` 消费公开合同，禁止引入 logiccore、Pixi、netcore、gameframeworks 或 rendercore 其它/internal 路径，禁止 runtime/server/component 字段和网络 API。
   - 更新 app/rendercore README 与最小领域规则，运行 L2 验收，再生成 UTC 执行报告。

## 8. 测试与验收

### 测试原则

- parser/readiness 覆盖正常路径和 unknown key/version、少于两个 snapshot、坏维度/code/value/id/name/ref/state/renderMode/reelSet。
- 随机测试使用 deterministic bounded source 覆盖区间上下界、每列 stop、多 symbol filter、权重边界和未命中格保留；不用统计概率测试替代确定性映射。
- sequence/reel/player 覆盖 standard 与 grid-cell、同 tick 多 landing、once completion counter、stable hold、末尾保持、不兼容 state preflight、多 snapshot 原子提交和未变 player continuity。
- lifecycle 覆盖 concurrent play、prepare/update/commit 失败、Replay 取消、late completion、重复 destroy、ZIP/resource/Object URL/Pixi/ticker/frame cleanup。
- app 测试覆盖两 tab、逐格编辑、过滤 roll、snapshot clone、编排创建/复制/重命名/step 排序、revision 失效、readiness gating 和一次性 payload。

### 验收级别

`L2`：任务新增 rendercore public scene/otherScene authoring/playback contract，再由新 app 直接消费；需验证修改 package 和直接 consumer，但不涉及 root toolchain/lockfile/release，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 typecheck
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 test
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 lint
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 build
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 format:check
git diff --check
```

失败时先以单 test file/package 最小化复现；只有定位到新 public API 的其它直接 consumer 回归才扩大范围。

### 人工验收

1. 用 gamelayouteditor 导出的真实 production ZIP 打开 gameviewer2，确认 summary 与 initial mode/reel geometry/symbols/weight table 相符，页面无任何 server/component 字段。
2. 在 Scene/OtherScene tab 分别执行 roll、多 symbol 过滤、fixed all、逐格改 symbol/value，新建第三 snapshot 并确认是深 clone；编辑默认编排，新建与改名复制编排，为不同格选择不同编排。
3. 新窗口中观察 initial -> spinBlur -> 真实 spin -> 逐格 appear -> normal -> 后续 snapshot 提交，运行 Replay 并 resize 横/竖屏；DevTools Network 无外部请求，关闭窗口后无持续 ticker/media/Object URL。

### 独立验收建议

`must`：涉及 rendercore public resource/player transaction 和一次性窗口 payload。独立复验重点为：

```bash
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 test
pnpm --filter @slotclientengine/rendercore --filter gameviewer2 typecheck
pnpm --filter gameviewer2 build
```

另需独立执行上述第 3 条真实浏览器验收；单测/fake runtime 不能替代逐格动画、resize 和资源释放。

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用 pnpm，不切换 npm/yarn；依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`。
- `apps/gameviewer2` production dependency 只有 workspace `@slotclientengine/rendercore`；`@slotclientengine/logiccore` 仅作为 rendercore 已有的内部 workspace dependency，任务不需要新的外部依赖或 lockfile 变更。
- 本地随机依赖浏览器 Web Crypto；不支持时显式失败，不 fallback 到 `Math.random()`。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、mapped assets 或生成 TypeScript，因此没有新的资源生成器/parity output。
- `apps/gameviewer2/README.md` 记录纯本地边界、ZIP 来源、snapshot/choreography 语义、首边 spin、后续 settled commit、开发命令和不支持能力。
- `packages/rendercore/README.md` 增加 scene/otherScene flow 层的窄 public API、logiccore 复用边界与 lifecycle。
- 新建 `docs/agent-rules/gameviewer2-local-flow.md` 保存稳定产品边界；根 `AGENTS.md` 新增 `apps/gameviewer2` 规则路由，shared/scene-layout 只增加本任务形成的通用 landing/transaction/local-flow 责任。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/150-gameviewer2-local-scene-flow-preview-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、关键决策与偏差、实际验收结果、未完成人工验收和剩余风险；不收集无关全仓统计。

## 12. 风险、假设与待确认

### 风险

- 真实 Symbols package 中不是所有 symbol 都具有 `spinBlur/appear` 的显式资源或 manifest equivalence；默认全格引用仍会创建，但 readiness 必须报出精确不兼容格并要求用户修改 scene 或编排，不降级成 normal。
- standard reel 通常按列落地，grid-cell 按格落地；统一 landing API 必须忠实报告同一边界内的多个格，不为 standard 伪造行间延迟。
- Layout ZIP 只能直接决定 standard/grid-cell implementation 与 reel set，不能提供尚未进入 schema 的 spin 时序；时序仍必须存在 versioned local project 中，不能因“复用转轮”而引入隐式常量。
- 后续 snapshot 原子替换需同时保护 standard/grid-cell occurrence、value controller 和 player continuity；这是人工视觉验收和独立验收的最高风险点。
- 大型 production ZIP 在配置器 readiness 和新窗口 runtime 各解析一次；首版优先保证无共享可变 resource 和完整复验，人工记录可感知启动耗时，不未经证明引入 worker/cache。

### 假设

- “多 step、每 step 多 scene/otherScene”在首版作为扁平有序 snapshot 链表达；因为任务明确排除 component 配置，不保留 server step/index 语义。
- 只有第一与第二 snapshot 之间是 spin；额外 snapshot 通过显式 settled commit + choreography 连接，这是不引入 component/action 第三配置轴的最小通用流程。
- imported layout initial mode 有 `reels.main` 与 active Symbols binding；缺失时作为不支持输入显式失败。

### 待确认

无。

## 13. 完成清单

- [ ] gameviewer2 完全本地、无 server/component 边界受 source test 保护。
- [ ] 两个默认 snapshot、两个可编辑默认编排与每格默认引用正确。
- [ ] Scene/OtherScene tabs、roll/filter/fixed/per-cell 修改和 snapshot deep clone 正确。
- [ ] 编排新建/复制/重命名/插入/排序/删除 step 与 strict reference/capability 正确。
- [ ] 首边真实 spin、逐格 landing choreography、后续 snapshot transaction 和 Replay 正确。
- [ ] public API、resource ownership、rollback/cleanup/destroy 符合计划，现有 Game Viewer/game002 不回归。
- [ ] README、领域规则和根路由已按需同步，未修改生成资源或 lockfile。
- [ ] 指定 L2 自动化与真实浏览器人工验收已分开记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划和 `docs/agent-rules/{gameviewer2-local-flow,shared-game-runtime,scene-layout,editor-artifacts}.md`；若新规则文件尚未存在，以本计划第 4/5/10 节为创建合同。
2. 核对 Git 基线、工作区和当前 public API，保留用户无关修改。
3. 按计划先在 rendercore 建立 strict schema/readiness，再建 scene/otherScene player，最后接 app；不接入 gameframeworks，不重新制定另一套 server-like 方案。
4. 小幅适配当前实现时在报告记录；需要扩大 schema/public API/consumer/lockfile 时先停止说明。
5. 只运行计划指定的 L2 验收，真实浏览器项不用 fake runtime 冒充。
6. 完成后生成 UTC 中文执行报告。
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
