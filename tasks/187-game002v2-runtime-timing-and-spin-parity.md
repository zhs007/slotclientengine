# 187 game002v2-runtime-timing-and-spin-parity 任务计划

## 1. 目标与完成定义

### 目标

为 `apps/game002v2` 建立可重复、分阶段的启动与 spin 性能数据，并修正其与 game002 已确认
表现合同的偏差：FreeGame 只转非 WL/CN 格；逐格 spin 期间所有尚未开始、已落地和已完成格的
normal 动画持续更新；Nearwin 使用 Crave 中真实 Nearwin1/2 资源并补齐 anticipation refill；中奖
remove 后不闪回 normal 图标。

rendercore 拥有通用的逐格 symbol update、terminal remove/release、保留 predicate、selective spin、started
edge 和 package Spine effect 合同；gameframeworks 拥有点击到 adapter 的通用性能阶段。Nearwin 激活、FG
held predicate、refill 阶段选择和 component 解释留在 game002v2，但 app 只做薄业务编排。所有美术 bytes
只来自 `assets/crave`，不增加 production fallback。

### 完成定义

- [ ] 控制台每次输出一条结构化 startup timing：`entering-game → framework create → adapter mount
    (Pixi init) → cached session connect → package runtime init/initial scene commit → first scene paint`
      的阶段耗时和总耗时；loading 退出前已至少完成一次含初始场景的浏览器 paint，不再出现 loading
      消失后长时间空场景。
- [ ] 每次用户点击 spin 输出唯一 round trace，至少区分 `click/command dispatch`、request build/send、
      server round-trip、logic parse/adapter entry、plan/start call、首个真实 cell start edge、首个转动画面
      paint；总耗时等于可核对的阶段之和，server RTT 不归因于客户端渲染。
- [ ] timing log 使用 `performance.now()` 单调时钟、稳定 label/字段和毫秒值，不输出 token、server
      payload、randomNumbers、presentation random 或任何轮带内容；失败/销毁的未完成 trace 有显式终止结果。
- [ ] console输出足以让用户在同环境采集 startup/spin多次样本并计算 median/最大阶段；执行报告说明已实施的
      确定性客户端优化和采样方法，不伪造浏览器样本。网络占主导时保持独立外部耗时。
- [ ] FreeGame 的每次 `fg-spin` 从当前输入盘面选择非 WL/CN cells；held WL/CN 的 occurrence、
      requested normal timeline 和 presentation value 保持，只有其余格按通用 selective spin 转动并落到
      server 完整 `fg-spin` scene。held code/value 被 server 改写时原位失败。
- [ ] 任一 grid-cell full/selective spin 活跃时，waiting、spinning、landed、completed 以及未选中的 occupied
      cell 都在每个时间 slice 恰好推进一次 symbol animation；不重复 update，也不推进已释放 hole。
- [ ] initial Nearwin 与 game002 一致：第 2 枚 WL 真实落地激活；第 2 枚自身不补播 effect；后续格在
      landing 前播放 Crave `nearwin1` 的 `Loop` 真实一次，并保持既有 `800ms/100ms` 节奏与 WL
      `Reel_NearWin` state 语义。
- [ ] anticipation 在本轮 cascade 中保留。存在 refill 时执行 existing-only dropdown → holes 上 Crave
      `nearwin2` sweep → holes selective refill spin/appear（Crave `nearwin1`）；survivor 不重新 spin/appear，
      最终 scene/value 与 server step 一致。
- [ ] 非 anticipation cascade 保持现有 unified fall；非期待 refill 新 WL 在真实完成顺序达到第 2 枚时
      激活 anticipation，影响后续 step，不倒放已完成的本次 refill。
- [ ] rendercore 提供通用 terminal remove transaction：先完整 preflight candidates，按可选
      `canRemoveOccurrence` predicate 区分 removed/retained；每个 removable occurrence 的 remove once 完成边界
      原子 release，不请求中间 normal。retained occurrence（game002v2 当前为 WL）保持 identity/value/动画。
- [ ] 从 remove 完成到 dropdown/refill 开始的所有帧 removed 位置保持 hole，不出现一帧旧/池化 symbol；
      predicate/target continuity 非法或播放失败立即 fail-stop，不部分误删 retained occurrence。
- [ ] `nearwin1/nearwin2` 只通过 `SceneLayoutPackageResource.loadRuntimeResource(key, "spine")` 从
      `assets/crave/layout.manifest.json`/`assets.map.json` exact 解析；不加载未使用的 `nearwin3`，缺 key、
      animation、atlas page、texture 或错误 Spine 版本显式失败。
- [ ] game002v2 不新增通用 UI/session wrapper、player、remove/cascade transaction或复制的 timing表；新增 app
      代码限于业务 predicate/decision、shared API wiring和 console formatter，并由 source-boundary测试保护。
- [ ] 完成 L2 定向自动验收，向用户交付真实浏览器视觉/性能验收清单与 console 数据说明，并生成 UTC
      中文执行报告；浏览器验收结果由用户执行和确认，执行会话不得代签。

## 2. 范围

### 包含

- `packages/gameframeworks` optional、instance-scoped performance observer：framework mount/connect、UI spin
  request、network request/response、logic parse 和 adapter presentation 边界；默认 consumer 无日志、无行为变化。
- `packages/rendercore` grid-cell 全 occupied animation continuity、generic terminal remove/retained predicate、started
  drain、Scene Layout selective transaction，以及 loaded package Spine 到 grid-cell effect 的 typed adapter。
- `apps/game002v2` 只接 console formatter/first-paint marker、FG positions、Nearwin/anticipation/refill component 顺序
  与 WL remove predicate；通用 trace、player、transaction、排序和资源生命周期不复制进 app。
- 复用 `apps/game002/config/reel-presentation.manifest.json` 作为 game002 唯一 versioned Nearwin/timing
  合同；game002v2 不复制数值表，production 美术仍只取 Crave。

### 不包含

- 不改 server 协议、component 数据、logiccore plan/compiler、真实/公开轮带边界、bet/collect 或金额逻辑。
- 不实现“未收到 server scene 就无限预转”的 speculative spin；本任务先把 server RTT 与客户端阶段
  准确拆开，并只优化有 trace 证据的本地同步/准备/paint gate。若 RTT 是最大阶段，targetless rolling
  作为后续独立 public contract 设计，不在本任务暗中扩张。
- 不改变 game002 已有表现，不重写通用 cascade/reel 状态机，不把 WL/CN、`fg-spin`、Nearwin1/2 或
  game002 component 硬编码进 rendercore。
- 不修改 `assets/crave/**`、其它 assets、Gamelayout ZIP/YAML/生成物，不增加 app 打包资源、base64、
  CDN 旁路、placeholder 或缺资源降级。
- 不顺手补齐 game002v2 尚未提出的 WM/CM/CO/AF 金额、transform 或 popup parity；不新增依赖或 lockfile。
- 不为“代码少”把 game002 business name/时序塞进 shared package，也不在 v2 复制 shared state machine。

## 3. 制定计划时的基线

```text
UTC: 2026-08-09T06:03:57Z
HEAD: ebd77ebf5b5b2e07242e9abaa6a55e716fa3446e
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/{templates/task-plan,186-game002v2-spin-default-scene-presentation}.md
docs/agent-rules/{game002,shared-game-runtime,loading-ui}.md
apps/game002v2/{README.md,src/**,tests/**}
apps/game002/src/{game002-reel-controller,game-adapter,freegame-plan,freegame-operation-target,package-config}.ts
apps/game002/config/reel-presentation.manifest.json；assets/crave/{layout.manifest.json,assets.map.json}
packages/{gameloading,gameframeworks,rendercore}/src 的直接调用链与相关测试
```

`apps/game002v2`、`apps/game002`、`packages/rendercore` 无子目录 `AGENTS.md`。当前结论：

- `main.ts` 的 loading `onEnterGame` 创建 framework 并等待 `connect()` 后才 exit；prepared session 已在 99%
  connect/enter，但 100% 后仍有 adapter mount、cached connect、`applyInitialState()`，且没有 first-paint/timing。
- UI command、session `spin()`、adapter `playSpin()` 分别是 click、network、logic parse 后边界，适合由
  gameframeworks optional observer关联，v2无需 wrapper。
- `round-adapter.ts` 对 `bg-spin` 注入 initial spin plan，但 `fg-spin` 传 `spinCodes=null` 后执行 full spin；
  相比之下旧 game002 `nonHeldPositions()` 明确排除输入 scene 中 WL/CN 并验证 held cell 不变。
- `RenderGridCellReelSet.updateSpinTimeline()` 在 plan 活跃时只调用各 plan cell 的 `updateCell()`；waiting
  尚未到 start 的 cell 不调用 reel update，landed fade/appear 完成后的 completed cell也不再 update，selective
  plan 的未选 cell没有 planCell，解释了用户观察到的 normal animation freeze。
- 任务 186 已为第 2 枚 WL gate、dimming 和 `Reel_NearWin` state 提供 activation/landing edge；但
  game002v2 在 spin 完成即销毁 controller，没有跨 cascade anticipation 状态，也没有给 plan 注入真实
  grid-cell effect。
- Crave exact 声明 `nearwin1/2/3`；resource已有 typed lazy loader，runtime已有 effect controller/sweep/spin
  注入口。缺口是 loaded Spine→`GridCellEffectResource`适配与 v2薄业务编排。
- 旧 game002 anticipation refill 是 existing-only dropdown、Nearwin2 `y desc/x asc` 80ms sweep、
  Nearwin1 selective spin；selective order 为右上 wave、16ms start group、100ms landing cadence、最后 start
  后 800ms settle。当前 v2 对所有 cascade 只调用 unified `createGridCellCascadeDropPlan()`。
- v2 `removeWonSymbols()` 复用 `playState()`；该 helper once 完成后先请求 normal，调用方随后才 release。
  这是 remove 位置短暂重现 symbol 的明确中间状态，需以帧级测试固定而不是只调整 delay。

## 4. 需求解释与技术决策

### 需求解释

- “loading 结束”以 controller 发布 `entering-game/100%` 并进入 `onEnterGame` 为起点；“场景渲染出来”
  以 initial scene 已 commit 且随后浏览器 animation frame 完成为终点，不把 Promise resolve 当作 paint。
- “点击 spin”以 UI command 收到用户请求为起点；“开始 spin”同时记录 rendercore 的第一个 started cell
  edge 和其后的 paint，避免仅以函数调用冒充可见转动。
- FG held 规则以每次 `fg-spin` 的输入 scene 为准：exact WL/CN held，其它位置 selected。held value 跟随
  occurrence；不是按 target scene 重新找所有 WL/CN，也不把此规则做成共享默认配置。

### 关键决策

1. **shared performance observer，v2 只负责启用和格式化**
   - gameframeworks 增加 optional observer，用注入单调 clock和递增 id发送 mount/connect、UI command、request、
     response、logic parse、adapter entry/complete事件；observer缺失时无分支外副作用、无 console输出。
   - game002v2 只把 observer事件和 rendercore first-start/paint marker汇总为 startup/spin object；error/destroy
     输出 status，禁止 UI/session wrapper或散落的 `console.time()` 留在 app。
   - `onEnterGame` 在 connect/initial commit 后等待 first paint 再 resolve，让 loading UI 的既有 exit gate
     自然遮住空白期；不提前在 100% 前创建 Pixi。
2. **rendercore 统一推进 occupied cell animation**
   - spin timeline 每个 slice 先按边界推进 plan/effect，再保证 waiting/landed/completed/non-selected occupied
     reel 都获得该 slice 的恰好一次 update；spinning cell 已消费的 active delta 不重复推进。
   - started/landing/activation edge 仍按 stable boundary 顺序产生；package runtime新增 started queue，并在
     new spin/reset/mode switch/failure/destroy 清空，供首个可见 movement marker 消费。
3. **Scene Layout selective spin transaction**
   - `SceneLayoutMainReelSpinInput`/stage 增加 optional selected positions；runtime 用当前 scene/value 验证所有
     held cells与 target完全一致，prepare plan 后只 release selected occurrences，再原子 start。
   - validation/start 失败时恢复原 scene/value/phase；成功后 held occurrence identity、player timeline和 value
     不变。未传 positions 保持 full-spin 默认。
   - v2 根据 active Symbols package 的 exact WL/CN codes构造 FG positions；共享层不认识 symbol name。
4. **Crave effect typed adapter 与唯一配置**
   - rendercore用 loaded `SceneLayoutRuntimeResource(kind=spine)` 加显式 animation/loop/transform构建 effect，
     复用官方 Spine 4.3、atlas closure、duration/completion校验。
   - v2 在 99% `onBeforeComplete` exact load `nearwin1/nearwin2`，使用现有 game002 reel presentation manifest
     的 key/timing建立 resources/capacity，并通过 package runtime `createEffectController` 注入；Nearwin3 不请求。
5. **anticipation 作为 v2 round presentation state**
   - v2 用一个小型纯业务 phase reducer区分 initial WL state与跨 step active flag；只返回业务 decision，实际
     dropdown/effect/selective operation由 rendercore public API执行，不复制 reel/player loop。
   - gate后注入 Nearwin1；active refill选择 dropdown-only→Nearwin2→selective refill，非 active选择 unified，
     并在真实 refill completion检查是否形成第 2 枚 WL。
6. **remove 是 rendercore 通用 terminal transaction**
   - 在 reel/Scene Layout runtime 增加 async remove API；输入 candidates和可选中性 predicate，先 snapshot/preflight
     全部位置，再对 removable occurrence逐个在 once completion边界 release，retained不请求 remove/normal。
   - API返回 immutable removed/retained positions供 app核对 server target；failure/abort/destroy拒绝 pending并
     fail-stop，已完成 release不倒放。game002v2只注入 `code !== WL`，不维护 terminal helper。

## 5. 职责与合同

- **gameframeworks observer**：拥有 click、session request/response、logic parse、adapter边界和 trace id；不保存
  payload/random/reel数据，observer错误不得替换游戏错误。
- **rendercore reel**：拥有每帧 player update、terminal remove/retained partition、selective transaction、effect pool、
  edge queue和 cleanup；不解释 WL/CN/Nearwin。
- **game002v2**：从 active package解析 codes，提供 FG/retained predicate、维护最小 anticipation decision并解释
  component scene/value；只调用 shared API，不创建第二套 player/trace/remove/cascade实现。
- **失败策略**：非法 stage、重复 edge、held/remove target mismatch、缺 resource/state/value、transaction失败均
  fail-stop；observer日志失败不得替换游戏错误，不静默全盘 spin或退回无 effect。

## 6. 文件范围

### 预计新增

```text
apps/game002v2/src/performance-trace.ts
apps/game002v2/src/round-presentation.ts
apps/game002v2/tests/{performance-trace,round-presentation}.test.ts
tasks/187-game002v2-runtime-timing-and-spin-parity-<utctime>.md
```

### 预计修改

```text
apps/game002v2/src/{main,crave,readiness,round-adapter,nearwin,spin-presentation}.ts
apps/game002v2/tests/{nearwin,spin-presentation,source-boundary}.test.ts
apps/game002v2/README.md
packages/rendercore/src/reel/{grid-cell-effect-resource,render-grid-cell-reel-set,types}.ts
packages/rendercore/src/scene-layout/{package-runtime,types}.ts
packages/rendercore/tests/reel/{grid-cell-effect,render-grid-cell-reel-set,symbol-state-playback}.test.ts
packages/rendercore/tests/scene-layout/{package-resource,package-runtime}.test.ts
packages/rendercore/README.md
packages/gameframeworks/src/{framework,types}.ts
packages/gameframeworks/tests/framework-flow.test.ts
packages/gameframeworks/README.md
docs/agent-rules/{game002,shared-game-runtime}.md
```

### 原则上不应修改

```text
assets/**
apps/game002/src/**
apps/game002/config/reel-presentation.manifest.json
packages/{logiccore,netcore,gameloading,uiframeworks}/**
apps/{game003,gameviewer,gameviewer2,gamelayouteditor,gamelayoutpkgcli}/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若 selective spin需要 targetless rolling/schema变化，或 remove必须引入业务 symbol配置，应先停止说明并重新
界定范围，不能在执行中顺手扩张。

## 7. 实施步骤

1. **确认执行基线与 trace schema**
   - 先接最小无行为变化 trace并固定 console schema；用 fake clock自动测试证明计算，真实样本留给用户验收。
2. **实现 startup/spin trace 与 first-paint gate**
   - gameframeworks observer发出 UI command、request/response、logic parse、adapter marker；v2只注册 logger并补
     Pixi/runtime init、scene commit和 paint marker。所有 marker验证顺序/单次性。
   - package runtime透传 started cell edge；首 edge后的 animation frame标为 spin-painted。
   - `onEnterGame` 只在 initial scene first paint后 resolve；确认 abort/destroy/error会终止 waiter且不泄漏 listener。
3. **修复通用 symbol animation continuity**
   - 重构 rendercore spin timeline slice，使所有 occupied cell每 slice恰好 update一次；保留 effect/landing精确
     boundary、dimming fade和 appear completion。
   - 用带 loop completion counter的 fake RenderSymbol覆盖 waiting、early landed+completed、selective held、
     spinning和 released hole；断言前四类继续、spinning不双倍、hole不推进。
4. **补 Scene Layout selective spin 并接入 FG**
   - 扩展 package runtime positions contract、held scene/value continuity、release/start rollback及 started queue cleanup。
   - v2 在每个 `fg-spin` 前从当前 snapshot计算 non-WL/CN positions；target values以当前 held occurrence为
     fallback并严格比对，再调用 selective spin。BaseGame full spin行为不变。
5. **准备并注入 Crave Nearwin resources**
   - 在 rendercore实现 package Spine→grid effect helper与 strict测试；v2 99%阶段并行 load exact nearwin1/2，
     使用权威 manifest生成 effect spec/capacity并交给 runtime。
   - 验证同 key并发复用、nearwin3未加载、resource/controller failure/destroy无 object URL/player泄漏。
6. **实现 initial Nearwin 与 anticipation refill parity**
   - initial spin plan在第 2 枚 WL gate 后给后续 cells排 Nearwin1一次，保留 WL `Reel_NearWin` request；验证
     effect真实 completion先于 landing且同帧多 edge不乱序。
   - 提取 v2 anticipation state machine：active cascade走 dropdown-only、Nearwin2 ordered sweep、holes selective
     Nearwin1 refill；non-active走 unified，并在 refill完成边界按真实 completion更新 gate。
7. **消除 remove 闪帧并完成有证据的本地优化**
   - rendercore实现 terminal remove transaction及 retained predicate，逐 occurrence完成即 release；v2删除旧链，
     从本 step win results传 candidates和 WL predicate，以 `bg-remove` scene核对 removed/retained target。
   - 逐帧断言 removed hole连续到下一阶段、retained identity/value/normal loop持续；feature/win仍回 normal。
   - 根据基线只处理本任务范围内最大本地阶段：复用99%已准备的 Nearwin/package数据、消除重复解析/创建，
     并保持 first-paint gate。不得为降低数字缩短 manifest动画或 server等待。
   - 报告列出确定性优化点和用户复测方法；没有用户实测数据时不得填写虚构 median或改善比例。
8. **文档、验收与报告**
   - README记录 console字段、selective/effect/remove contract；规则只补稳定职责合同。
   - 运行 L2定向命令，交付用户浏览器 checklist并生成 UTC报告；视觉结果保留为待用户确认。

## 8. 测试与验收

### 测试原则

- gameframeworks observer使用 fake monotonic clock断言阶段、round id、error/destroy和默认无 observer路径；
  v2只测试 formatter/paint marker，不使用真实耗时阈值制造 flaky test。
- rendercore fixture只用中性 code/effect id，不出现 WL/CN/`fg-spin`/Nearwin；app测试承担全部业务名称。
- animation continuity既断言 update count也断言 loop completion/requested state，覆盖一次 update跨多个 timeline
  boundary；不能只看最终 scene。
- selective spin断言 held RenderSymbol identity/value/completion count不变、selected替换正确和 rollback恢复；full spin
  characterization必须继续通过。
- remove覆盖 all/partial/none retained、不同 once时长、preflight失败、abort/destroy和已完成 fail-stop；逐帧
  证明每格 completion→release无 normal flash。

### 验收级别

`L2`。修改 rendercore和 gameframeworks optional public contract并接入 game002v2；game002是直接 grid-cell
consumer，需编译回归。不改根工具链、lockfile、正式 schema/生成物或 release，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/grid-cell-effect.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/package-resource.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/gameframeworks exec vitest run tests/framework-flow.test.ts
pnpm --filter game002v2 test
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter game002v2 --filter game002 typecheck
git diff --check
```

`game002 typecheck`只证明已有 effect/selective/grid-cell consumer继续编译；不扩为 game002全量测试。失败先最小化
复现并判断是否由本任务引入，不立即运行整仓命令。

### 用户浏览器验收

`必须，由用户执行`。执行会话只准备真实 `assets/crave` 启动方式、console字段说明和以下 checklist，在报告中
标为“待用户确认”，不得自行宣称浏览器验收通过：

1. 冷/热 cache分别启动，确认 loading退场时初始 scene已经可见；控制台 startup各阶段可相加为total，记录
   优化前后同条件5次样本与 median。
2. 点击 spin，确认单个 trace明确分离 server RTT与客户端 parse/plan/first-edge/paint；快速点击、server失败、
   destroy不串 trace。正常 symbols逐格开停时，尚未转和已停格的 normal loop肉眼持续。
3. 进入 FG，确认每 spin仅非 WL/CN格转，held图标/value/动画连续；取得2+ WL且有 cascade/refill的 round，
   对照 game002确认 Nearwin1、Nearwin2 sweep、selective refill顺序和最终 scene/value。
4. 取得中奖消除 round并慢放/录屏逐帧检查：remove完成后位置保持空，直到 dropdown/refill内容从正确边界进入，
   不闪现旧或随机图标。

### 独立验收建议

`必须`。自动复验聚焦跨包 contract、每帧 player、terminal remove和 selective rollback；真实视觉/性能由用户
按上一节验收，不由独立 agent/browser代替：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/gameframeworks exec vitest run tests/framework-flow.test.ts
pnpm --filter game002v2 test
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24和 pnpm；shell没有 Node时执行 `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时执行 `CI=true pnpm install --frozen-lockfile`，不切换 npm/yarn。
- 只有下载实际失败后才设置 `http_proxy`/`https_proxy=http://127.0.0.1:1087`重试原命令。

## 10. 生成物、文档与规则

- 不修改 YAML/manifest/Crave文件，无生成器或 parity checker；现有 reel presentation manifest只读复用。
- `packages/rendercore/README.md`记录 selective positions transaction、all-occupied animation update、started drain和
  package Spine effect helper；示例使用中性名称。
- `apps/game002v2/README.md`记录 timing console schema/采样条件、FG held、Nearwin/refill/remove流程。
- `docs/agent-rules/shared-game-runtime.md`补充通用 terminal remove/retained predicate和 occupied animation owner；
  `game002.md`只补 v2 FG held、WL predicate及 anticipation/refill业务选择。具体耗时样本不写入规则，
  `loading-ui.md`无需修改。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/187-game002v2-runtime-timing-and-spin-parity-<utctime>.md
```

UTC使用 `date -u +%y%m%d-%H%M%S`。报告记录 shared/app职责、最终 API/文件、性能采样方法、
FG/Nearwin/refill/remove自动结果、命令和用户浏览器验收 checklist；实测/视觉项标“待用户确认”，不收集无关
coverage、整仓统计、历史矩阵或 server payload。

## 12. 风险、假设与待确认

### 风险

- live server RTT可能是 click→spin最大阶段；本任务能准确归因但不会通过客户端代码缩短外部响应，也不实现
  无 target预转。报告必须避免把网络波动写成渲染回归/优化。
- `runtime.update()`单帧可跨多个 start/landing/effect edge；全 cell update重构必须切 slice且恰好一次，否则
  normal动画会快进或 effect completion顺序改变。
- FG转场可能切换 active Symbol package；business code/effect/controller必须从 runtime当前 exact binding取得，
  不能永久缓存 initial package假设。若当前 public API不足，只补中性 active-resource getter，不自行遍历 manifest。
- Nearwin/refill live round不易稳定复现；自动测试保护确定合同，但录屏视觉验收仍可能受 server样本阻塞。
- terminal remove若只在 app await batch后 release，仍可能让较早完成的 once恢复 normal；实现必须由 rendercore
  在每个 occurrence自身 completion edge提交 release，并在整批开始前完成 preflight。

### 假设

- `fg-spin` scene是完整 target scene，输入 scene中 WL/CN必须原位 held；若 server协议允许转换，应由明确
  component阶段表达，而不是 selective spin静默覆盖。
- `apps/game002/config/reel-presentation.manifest.json`继续是 game002 Nearwin/timing唯一权威配置；v2只消费，
  不复制或修改。美术资源唯一来自当前 Crave manifest/map。
- 浏览器 first scene/spin paint用 scene commit/first started edge后的 animation frame作为稳定可测边界；GPU最终
  扫描输出不在 Web API可观察范围。

### 待确认

- 无。性能最大阶段需要执行时采样而不是用户预先选择；其余行为均可由现有代码、Crave manifest和旧 game002
  合同确认。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、职责、resource/trace/player生命周期符合计划。
- [ ] 通用 performance/remove/animation/selective能力均位于 shared owner，game002v2只保留业务薄编排。
- [ ] startup/spin timing可关联、可相加且不泄露敏感/server/reel数据。
- [ ] FG held、animation continuity、Nearwin/refill和remove中间帧测试已通过。
- [ ] 指定自动化已通过，用户浏览器验收材料已交付且未被执行会话误报为通过。
- [ ] README、最小领域规则和 UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对 Git基线、任务186实际 API和工作区，先保留无关修改；
3. 先接无行为变化 timing并采优化前样本，再实施修复与优化；
4. 小幅适配当前实现时在报告记录，重大 public API/targetless spin/schema扩张先停止说明；
5. 只运行计划规定的 L2自动验收；准备浏览器 checklist交给用户，不自行操作或代签视觉结果；
6. 完成后生成 UTC报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
