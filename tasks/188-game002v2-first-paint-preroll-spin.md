# 188 game002v2-first-paint-preroll-spin 任务计划

## 1. 目标与完成定义

### 目标

优化 `apps/game002v2` 的首场景可见时间，并为 slot 游戏提供“请求已发出后立即按本地公开轮带
预转、响应到达后使用服务器 scene/value 连续落停”的通用能力。

`packages/gameframeworks` 只拥有请求与表现 hook 的时序和失败通知；`packages/rendercore` 拥有
targetless continuous spin、响应后 settle、逐帧推进及资源清理；`apps/game002v2` 只提供业务
dimming/anticipation/target plan 并接入 shared API。不得在收到响应前推断服务器落点，也不得修改、
缓存或输出服务器真实轮带。

### 完成定义

- [ ] startup trace 在现有 `initial-state-start → first-scene-paint` 中增加 runtime init/scene commit/
    stage attach/paint 边界，能区分准备、提交和浏览器 paint；phase 仍只记录单调时钟与名称。
- [ ] Scene Layout initial runtime 将互不依赖的 layout node、active symbol catalog/reel/effect 与 popup
    准备并发启动，提交顺序仍由 manifest 决定；任一失败等待 pending prepare 安全 settle 后统一销毁，
    不留下半初始化 container、player、texture 或晚到异步写入。
- [ ] 在相同资源、浏览器和缓存条件下先后各采集 5 次 startup；优化后的 `runtime-init-start →
    runtime-init-complete` 与 `initial-state-start → first-scene-paint` median 低于实施前同条件 median，并在
    执行报告记录原始样本。没有稳定改善时保留诊断数据、撤回无收益的复杂并发改动并说明瓶颈，不伪造百分比。
- [ ] gameframeworks 的 opt-in adapter hook 严格发生在 `session.spin(params)` 已被调用并返回 Promise 之后、
    等待 response 之前；未实现 hook 的现有 consumer 顺序和行为不变。
- [ ] game002v2 点击 spin 后，在响应 pending 期间即出现首个真实 rolling started edge/paint；现有 timing
    可以显示 `first-cell-start/paint` 早于 `response-received`，而不是等 3.28s RTT 后才开始转动。
- [ ] rendercore continuous spin 只消费 active Symbols package 的本地公开轮带、独立本地 phase/random、
    方向和速度；开始阶段不接受 target scene/value、server randomNumbers、stop 或业务 symbol 规则。
- [ ] 响应到达后，game002v2 用第一个合法 landing component 的完整 scene/value 构建 settle plan；已经滚动
    的 cell 保持 position、方向、速度、player identity 和单帧 update 连续，不重新起转、不闪回旧 scene。
- [ ] target landing window 只在 settle 阶段临时注入；普通、FreeGame selective、dimming、第 2 枚 WL gate、
    Nearwin effect/landing cadence 和后续 cascade/win/collect 合同保持不变。
- [ ] response、logic parse、target validation、settle、playSpin 或 destroy 失败时，framework 只通知一次取消；
    rendercore 停止 pending continuous spin、拒绝 waiter并释放临时 occurrence/effect，不伪造落点、不允许下一轮
    继续，符合 game002v2 fail-stop。
- [ ] fake delayed session 自动证明 request → pre-roll → response → settle 顺序；rendercore 测试证明任意 response
    latency、同帧 response、长时间 pending、失败和 destroy 下的 continuity 与 cleanup。
- [ ] 完成 L2 定向验收，更新 public API/README 与最小领域规则，生成 UTC 中文执行报告；真实浏览器视觉和性能
    数据与自动化测试分开记录。

## 2. 范围

### 包含

- `packages/gameframeworks` 增加 optional、instance-scoped spin presentation start/cancel hook，并补充性能 phase；
  session request、response、logic parse、adapter final presentation 和 collect 的既有 ownership 不变。
- `packages/rendercore` 增加 grid-cell continuous start → settle/cancel transaction，以及 Scene Layout package
  runtime 的 main reel facade；复用现有 local reel、symbol registry、started/landing/activation queue和 ticker。
- `packages/rendercore` 优化 Scene Layout initial init 的独立 prepare 调度、in-flight resource 去重、确定性 commit
  与失败 cleanup；不减少 strict resource closure。
- `apps/game002v2` 接入 pre-roll、在 response 后复用现有 `buildGame002v2InitialSpinPlan`/
  `buildGame002v2FreeGameSpinPlan` 落停，并细化 startup/spin trace。
- 相关 package/app 测试、README、领域规则和任务 188 执行报告。

### 不包含

- 不改 server/WebSocket 协议、`netcore` 请求格式、logiccore parser、bet、collect 或服务器性能；给定
  `collect` 2624.2ms 不在本任务优化范围。
- 不预取、读取、推断或持久化服务器真实轮带；不使用 `lstrand`、server `randomNumbers`、response scene
  或 CN random 驱动 response 前的视觉。
- 不缩短 manifest-owned spin/Nearwin/cascade/win/popup 动画，不把任务样本中的 7702.8ms adapter 表现全部
  解释为网络问题；anticipation 等 response-dependent 时序仍在响应后执行。
- 不把 WL/CN/WM/CM/CO、component 名、Nearwin 或 game002 timing 硬编码到 shared package。
- 不提前到 loading 100% 之前创建 framework、Pixi Application 或 Scene Layout display runtime，不改变
  `99% prepared session → 100% framework/Pixi → first paint → loading exit` 生命周期。
- 不修改 `assets/crave/**`、reel manifest、YAML/生成物，不新增 dependency 或 lockfile 变化。
- 不接入 game002/game003；新 hook 默认关闭，只以 shared 单测和直接 consumer typecheck保护兼容。

## 3. 制定计划时的基线

```text
UTC: 2026-08-09T08:35:24Z
HEAD: 1462a6ffc7c7fc71460728f75b9fd39ac8216d83
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
tasks/{180-gameframeworks-api-ownership-boundary,187-game002v2-runtime-timing-and-spin-parity}.md
docs/agent-rules/{game002,shared-game-runtime,loading-ui}.md
apps/game002v2/{README.md,package.json,src/{main,readiness,crave,reel-presentation,
  round-adapter,performance-trace,spin-presentation}.ts,tests/**}
apps/game002/config/reel-presentation.manifest.json
assets/crave/layout.manifest.json
packages/gameframeworks/{package.json,README.md,src/{framework,session,types,index}.ts,
  tests/{framework-flow,test-helpers}.ts}
packages/rendercore/{package.json,README.md,src/{reel,scene-layout,symbol,popup}/**,tests/{reel,scene-layout}/**}
```

上述目标目录无子目录 `AGENTS.md`。当前结论：

- 用户 startup 样本总计 `365.1ms`；`initial-state-start → first-scene-paint=333.1ms`，占总时长约
  `91.2%`。`DirectRoundAdapter.applyInitialState()` 在此区间串行完成 symbol resolve、package runtime
  create/init、initial scene commit、stage attach、viewport和一个 animation frame，但 trace 尚未拆分。
- `DefaultSceneLayoutPackageRuntime.init()` 当前先等待 layout init，再依次 create active catalog、prepare
  reel effect、commit initial scene，随后对 Crave 的 4 个 popup逐个 `await init()`；
  `DefaultSceneLayoutRuntime.init()` 也逐 node串行等待。它们是有源码证据的独立准备串行点。
- Crave initial mode 是 `BaseGame`，2 个 layout node、同一 active Symbols package 和 4 个 popup；不得用
  删除/跳过资源换取首屏数字。是否主要受异步加载、decode还是主线程同步构造影响，需由新增 phase与同环境
  样本确认，单个 333.1ms 样本不能证明统计改善。
- 用户 spin 样本 `request-send → response-received=3280.6ms`，首格在 response 后约 `9ms` 才 started；
  `logic parse=1.9ms`。现有 framework 完整 await `session.spin()` 后才调用 `adapter.playSpin()`，所以网络 pending
  期间不可能出现 reel movement。
- `SlotGameAdapter` 当前只有 `mount/applyInitialState/playSpin/destroy`；`SlotGameLiveSession.spin()` 调用
  `client.spin(params)` 后才 await，因此 framework 可以在获得该 request Promise 后同步启动 opt-in pre-roll。
- `RenderGridCellReelSet.spin()` 当前只接受含 target/stop 的完整 plan，`spinMainReelToScene()` 也在一次调用中
  校验 target、创建 plan并开始；尚无 targetless rolling、后续 settle 或 pending transaction cleanup合同。
- 任务 187 已提供 full/selective spin、all occupied cell update、started/landing/activation edge、Nearwin effect、
  terminal remove和 timing trace。本任务应扩展这些 shared primitive，不在 app 复制 reel update loop。

## 4. 需求解释与技术决策

### 需求解释

- “请求发出后”定义为 `session.spin(params)` 已同步执行到取得 Promise 的边界；framework 不把 hook 放在
  request build 前，也不等待 server response 才触发。
- “先预转”是没有 target 的视觉 rolling：画面只展示本地公开轮带，允许使用 app 注入的本地随机 phase和
  中性 dimming policy，不得提前决定 landing、activation或 response-dependent effect。
- “响应回来后落停”是将已在运动的同一次 transaction切换到 target-aware settle；不是停止预转后重新调用
  现有 full spin，也不是把响应 scene 写进公开轮带。
- loading 优化先消除源码中确定的独立串行等待，并用 phase/median验证；不以单帧截图、Promise resolve或
  缩短动画冒充 first paint 改善。

### 关键决策

1. **framework 使用同步 optional hook，不拥有 reel handle**
   - `SlotGameAdapter` 增加语义明确的 request-dispatched start hook与 failure cancel hook；二者成对声明并在
     options validation严格检查。start hook在 request Promise取得后同步调用，`playSpin(logic)`继续承担 response
     后表现，避免把 rendercore类型泄漏进 framework。
   - framework catch只在 start成功后调用一次 cancel；原始 request/parse/play error保持 authoritative，cancel
     error只上报为附属 cleanup error，不替换主错误。无 hook adapter保持当前调用链。
2. **rendercore 使用显式 continuous transaction**
   - reel/Scene Layout public API分为 `start`、`settle`、`cancel`，每个 runtime最多一个 active transaction；
     start输入只有 local phase/random、方向/速度/start cadence和可选中性 rolling dimming，不含 target。
   - settle复用 active transaction的 elapsed position和 player，才接受 exact target scene/value/landing state及
     app-owned grid-cell plan builder；stop/effect schedule以 response边界和已滚动距离规范化，保证不会倒退时间、
     瞬移或少于 minimum cycles。
   - 不恢复 pre-spin snapshot。cancel终止 timeline、effect和 waiter并使本轮 fail-stop；下一次 spin前必须显式
     重新初始化/同步，符合 v2 已有错误模型。
3. **game002v2 只做薄接线**
   - framework start hook调用 package runtime continuous start；production phase继续使用 `secureRandom`，不消费
     server数据。首个 started edge沿用 ticker queue驱动 timing paint marker。
   - `playSpin()`遇到本轮第一个 landing scene时必须 settle同一 transaction；BaseGame/FreeGame target builder、
     held WL/CN continuity、dimming、activation和Nearwin仍由现有 app函数表达。后续 step继续现有 async flow。
   - 没有合法 landing、重复 settle、response target改写 selective held或 play失败都显式失败并取消。
4. **initial init并发 prepare、确定性 commit**
   - rendercore先构造 manifest顺序稳定的 prepare records，再并发启动 layout node资源、active catalog/reel effect和
     popup player init；共享 texture URL用 instance-scoped in-flight Promise去重。
   - 所有 initial-scene必需 prepare成功后，按 manifest order一次提交 visibility、reel、scene和 popup layers。
     不允许 worker/timeout延迟提交改变首帧，也不 lazy-skip正式 closure。
   - failure/destroy使用 `allSettled`式 drain保证晚到任务不能写入已销毁对象；只释放本 runtime拥有的资源，
     borrowed package resource/container规则不变。

## 5. 职责与合同

- **gameframeworks**：拥有 request dispatch → adapter start → response/parse → adapter play 的顺序、每轮 hook
  exactly-once和 error/destroy通知；不认识 scene、reel、target或 Pixi。
- **rendercore reel**：拥有 local rolling、elapsed motion、target landing window、start/settle/cancel state machine、
  per-slice player update和临时 occurrence/effect资源；shared代码不认识 game002 symbol/component。
- **Scene Layout package runtime**：验证 active binding/render mode、转发 transaction、清空 edge queue，并保持
  public local strip与server visible target边界。
- **game002v2**：选择是否启用 pre-roll、提供 secure local random/dimming和 response 后业务 plan；不自行操作
  `RenderReel`、display tree或维护第二个 ticker/state machine。
- **初始化 transaction**：prepare可并发，commit必须确定且原子；失败前完成的内部对象由 owner销毁，未提交对象
  不可暴露，destroy幂等。
- **strict failure**：非法 hook配对、重复 start/settle、无 active transaction、target提前出现、非法 timing/random、
  held mismatch、missing resource/state和 destroy均显式失败；禁止退回“响应后重新 full spin”。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/reel/grid-cell-continuous-spin.ts
packages/rendercore/tests/reel/grid-cell-continuous-spin.test.ts
tasks/188-game002v2-first-paint-preroll-spin-<utctime>.md
```

### 预计修改

```text
packages/gameframeworks/src/{framework,types,index}.ts
packages/gameframeworks/tests/{framework-flow,test-helpers}.ts
packages/gameframeworks/README.md
packages/rendercore/src/reel/{index,render-grid-cell-reel-set,types}.ts
packages/rendercore/src/scene-layout/{runtime,package-runtime,types}.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/tests/scene-layout/{runtime,package-runtime}.test.ts
packages/rendercore/README.md
apps/game002v2/src/{main,round-adapter,performance-trace,spin-presentation}.ts
apps/game002v2/tests/{performance-trace,source-boundary,spin-presentation}.test.ts
apps/game002v2/README.md
docs/agent-rules/{game002,shared-game-runtime}.md
```

若实现证明无需独立 `grid-cell-continuous-spin.ts`，可将纯 plan helper留在现有
`grid-cell-spin-plan.ts` 并在报告说明。原则上不新增 app-owned pre-roll文件或类。

### 原则上不应修改

```text
assets/**
apps/game002/config/reel-presentation.manifest.json
apps/{game002,game003,gameviewer,gameviewer2}/src/**
packages/{logiccore,netcore,gameloading,uiframeworks}/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若需要 server协议、schema/manifest、跨 renderer持续转动或 loading 100% 前创建 Pixi，必须先停止说明，不能
在执行中扩大范围。

## 7. 实施步骤

1. **确认基线并细化 trace**
   - 重新核对 HEAD、工作区、任务 187 API和用户样本；新增 startup runtime init/scene commit/attach phase，调整
     active spin trace使 pre-roll started edge在 `adapter-play-start` 前也归属正确 trace id。
   - fake clock固定 phase exactly-once、排序、失败/destroy和无敏感数据；不设置 flaky毫秒阈值。
2. **优化 Scene Layout initial prepare**
   - 将 node、active reel chain和各 popup建成独立 prepare record并尽早并发；对重复 texture/resource请求做
     in-flight去重，保持现有 exact parser/decoder。
   - 准备完成后按 manifest顺序提交 container/map/visibility和 initial scene；失败注入测试用 deferred promise证明
     pending任务已 drain、所有 owner只 destroy一次、无 late commit。
3. **增加 framework request-dispatched presentation hook**
   - 扩展 adapter types/validation/README；framework先取得 session request Promise，再同步调用 start hook，然后
     await response。记录明确 performance phase。
   - 覆盖 delayed、immediate resolve、request reject、start throw、logic parse throw、play throw和 destroy；断言
     cancel exactly-once、原始错误权威、未 opt-in adapter完全不变。
4. **实现 rendercore continuous spin transaction**
   - 建立 targetless plan/runtime state：各 selected cell按 local strip和start cadence进入持续匀速滚动，统一 ticker
     更新 waiting/rolling/held occupied cell；start contract从类型上禁止 target。
   - settle时验证 exact target/value/held continuity，基于当前轴位置和已滚动距离生成剩余 landing plan，临时注入
     target window并延续速度；保留既有 bounce/dimming/effect/activation和 edge队列。
   - 实现 cancel/destroy cleanup与非法状态失败；测试跨 response boundary位置连续、minimum cycles、长 pending、
     selective、同帧 settle、effect晚于response和无server数据输入。
5. **透传 Scene Layout API并接入 game002v2**
   - package runtime只对 active grid-cell main reel暴露start/settle/cancel；mode switch、drop、effect sweep或另一个
     spin active时显式失败，reset/mode failure/destroy清空 transaction和 pending edges。
   - v2 start hook使用本地 phase/secure random启动；`playSpin`把第一个合法 landing交给 settle，后续流程不变；
     cancel hook终止 waiter/Nearwin/continuous spin并维持 fatal状态。
   - source-boundary测试禁止 app出现 `RenderReel`、复制 update loop、server random或response前 target解析。
6. **回归表现与性能验收**
   - 自动证明 BaseGame target、FG WL/CN held、Nearwin gate/effect、cascade和terminal remove顺序不回归；旧 adapter与
     non-continuous Scene Layout spin保持原行为。
   - 在真实 game002v2采集同条件 5 次 startup和至少一轮 RTT 足够覆盖一帧的 spin；核对预转在 response前 paint、
     response后连续落停、无跳帧/二次起转。anticipation与非anticipation分开记录，不把 collect算入预转收益。
7. **文档、规则与报告**
   - README记录 hook时序、continuous transaction、timing phase和复测方法；领域规则只加入稳定 ownership、
     server数据边界和prepare/commit/cleanup合同。
   - 运行 L2定向验收，检查 diff/残留旧调用，生成 UTC中文报告并列出未完成的真实浏览器验收。

## 8. 测试与验收

### 测试原则

- framework用 deferred fake session断言调用顺序，不以 timer/sleep近似网络；hook缺失路径保留现有 call trace。
- rendercore fixture只使用中性 code/position，不出现 WL/CN/component；检查每 slice一次update、位置/速度连续、
  target只在settle出现、cancel/destroy资源归零。
- init并发测试用可控 Promise证明 overlap与deterministic commit，不用墙钟阈值；共享 texture只load/unload一次。
- app测试承担 secure random wiring、第一 landing、FG held、Nearwin与失败策略；真实浏览器paint和median不能由
  jsdom/fake ticker代签。

### 验收级别

`L2`。任务修改 gameframeworks/rendercore跨包 public contract、异步 transaction/resource cleanup并接入直接
consumer game002v2；需要 shared packages、直接 consumer与现有 game002 typecheck，但不涉及根工具链、lockfile、
正式生成物或 release，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/grid-cell-continuous-spin.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/runtime.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/gameframeworks exec vitest run tests/framework-flow.test.ts
pnpm --filter game002v2 test
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter game002v2 --filter game002 typecheck
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks build
git diff --check
```

前两 package build用于验证新增 public export/declaration；不运行根级 typecheck/lint/test/build/format。

### 人工验收

- 使用同一浏览器、viewport、网络环境和明确的 cold/warm cache条件，分别采集 5 次 startup；报告每次
  `runtime-init`、`initial-state → first-paint`和 median，不与不同缓存条件混算。
- 使用真实 server点击 spin，确认 first-cell paint在 response pending期间出现；响应到达后方向/速度连续并开始
  合法落停，不闪回、停住或二次起转。至少观察一轮普通 spin；遇到 anticipation时单独记录。
- DevTools/console确认 pre-roll期间没有 response scene/randomNumbers/reel payload日志或额外请求，destroy/error后
  ticker不再持续预转。

### 独立验收建议

`必须`。涉及 gameframeworks/rendercore public contract、response前无target的异步 transaction、服务器数据边界和
destroy cleanup。独立复验重点是 request先于pre-roll、target不提前进入rendercore和cancel无泄漏；命令最多为：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/grid-cell-continuous-spin.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/gameframeworks exec vitest run tests/framework-flow.test.ts
pnpm --filter game002v2 test
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；当前 shell无 Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载失败后才设置仓库约定代理重试原命令。
- 本任务不新增依赖、不修改 `package.json`/`pnpm-lock.yaml`。若实现需要新依赖，先停止说明必要性和影响。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、manifest或生成输入，不应产生生成物；若意外出现生成 diff，先查明来源，不手改。
- 更新 gameframeworks/rendercore README public contract，以及 game002v2 README 的 phase与采样说明。
- `docs/agent-rules/shared-game-runtime.md` 记录 request-dispatched pre-roll ownership、local公开轮带边界、
  start/settle/cancel生命周期和initial prepare原子提交；`game002.md` 只记录 v2业务接线与fail-stop。
- `loading-ui.md` 现有 99%/100%规则已足够，原则上不修改；不把具体样本或任务时长写入领域规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/188-game002v2-first-paint-preroll-spin-<utctime>.md
```

UTC用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终文件、public contract、计划偏差、自动命令结果、
startup 5次原始数据/median、真实 spin时序、未完成人工验收和剩余风险；不收集整仓coverage或历史矩阵。

## 12. 风险、假设与待确认

### 风险

- 333.1ms可能主要是主线程 Spine/Pixi同步构造，Promise并发只能重叠异步load/decode；因此以同条件median验收，
  无稳定收益时不保留复杂度，后续优化需另行分析长任务/profiler。
- RTT可能短于首个 animation frame；这种合法情况下只能证明调用顺序，不能强制日志中paint早于response。
- anticipation stop/effect依赖response target；预转能隐藏等待但不能把这些业务动画提前到response前。
- request已发出后start hook失败无法撤回服务器请求；framework必须drain request并进入fatal error，不能collect或
  自动重试，也不能把下个response错配给新一轮。
- 并发资源准备容易出现重复load、failure后late resolve和double destroy，必须以in-flight去重与deferred failure
  测试保护。

### 假设

- `SlotGameLiveSession.spin()` 调用 `client.spin(params)` 即为本仓可证明的request-dispatched边界；不声称远端已经
  收到数据包。
- game002v2 每个合法 live round至少有一个现有 `LANDING_COMPONENTS` scene；缺失继续按strict failure处理。
- 给定 startup/spin数据是单次基线，用于定位，不作为跨设备硬性能预算。

### 待确认

无。实际性能改善由执行会话的同条件浏览器样本确认；若无法运行真实server，报告必须明确留给用户复验。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] request先于pre-roll，response前无target/server random输入。
- [ ] continuous start/settle/cancel和init prepare/commit/cleanup合同通过测试。
- [ ] game002v2既有spin、Nearwin、FG held、cascade/win/collect行为未回归。
- [ ] public API、README和最小领域规则已同步。
- [ ] 指定 L2自动验收已通过，真实浏览器结果与未完成项已注明。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`game002.md`、`shared-game-runtime.md`、`loading-ui.md`；
2. 核对 Git baseline并保留用户无关修改；
3. 先用trace/fake deferred test固定边界，再实现并发init和continuous transaction；
4. 小幅文件适配写入报告，涉及server/schema/loading生命周期或跨renderer扩张时先停止说明；
5. 只运行本计划规定的 L2命令，不以fake runtime代替真实浏览器性能/视觉验收；
6. 完成后生成 UTC报告；除非用户明确要求，不 commit、不 push、不创建 PR。
