# 240 rendercore-gamelayout-runtime-events 任务计划

## 1. 目标与完成定义

### 目标

在任务 228 已落地的 `SceneLayoutPackageRuntime.addresses` 上继续建立统一、严格且适合高频路径的
Game Layout runtime event 合同。游戏应能用 canonical `gamelayout:/` 地址监听 Popup、game mode、
横竖屏 variant、authored/program Spine 动画与 visible symbol 状态的已提交变化；symbol instance 与
reel/area 的 `x`、`y` 精确或通配坐标都是 canonical event address 的组成部分。

“全局 event 管理器”由每个 `SceneLayoutPackageRuntime` 持有，统一管理该 package 的 catalog、listener、
waiter、sequence、address index 与 destroy，不建立跨游戏或跨 runtime 的 process-global singleton。
对没有 listener/waiter 的 event，producer 只做常数级 interest 判断，不创建 occurrence/detail、不格式化地址、
不扫描 listener。

### 完成定义

- [x] 任务 228 的 `addresses.bind()/wait()` 扩展为统一 event manager；现有 transition、BGM 与
      `gamelayout:/event/variant-changed` 地址、顺序和 cleanup 行为保持兼容。
- [x] 三类 Popup 发布 scheduler session state、player phase 与适用的 award tier/segment 进入/退出；
      `bigwin`、`megawin` 等 exact authored tier 的开始、结束及 Popup 正常关闭可独立监听。
- [x] mode 对每个 exact mode id 发布 displayed 与 stable 的 entered/exited；有向 transition 发布
      started/switched/ended 及非正常 outcome，且事件只来自对应 commit/failure boundary。
- [x] authored loop Spine node 与 program Spine runtime resource 发布 animation started/ended；ended detail
      区分 completed、stopped、superseded、aborted、failed、destroyed。program resource 本任务聚合相同
      logical key 的多个实例，不伪造尚未定义的稳定 instance id。
- [x] active symbol package 的 visible settled symbol 在 resolved visual state 改变时发布旧 state exited、
      新 state entered；detail 携带 package/symbol/code、reel、x/y 和 requested/resolved 前后值。
- [x] symbol event address 可对 `x`、`y` 分别使用非负整数或 `"*"`；exact/exact、exact/\*、\*/exact、\*/\*
      均正确且每次 dispatch 只查询至多四个预索引 bucket，不执行 glob/regex/全表扫描。
- [x] 没有订阅时 symbol/update 热路径不构造 event object/detail，不调用 formatter/parser；移除最后一个
      listener/waiter 后恢复同一 fast path，并有测试与 benchmark 证据。
- [x] listener 继续同步、按注册顺序且不 replay；waiter 支持 `AbortSignal`；callback error、runtime destroy、
      stale symbol occurrence 与非法 instance address 显式失败，不回滚已经提交的画面状态。
- [x] Gameframeworks 只 re-export 新 production contract；不新增 manifest/schema、业务 event 表、依赖或 lockfile。

## 2. 范围

### 包含

- Scene Layout data/core 的 event kind、address-native instance、typed occurrence detail 与 canonical address catalog。
- 从现有 address controller 抽出 package-owned event manager，提供 exact static 与 symbol address-indexed
  subscription/waiter、lazy dispatch、interest probe、sequence 和 destroy cleanup。
- Popup core 的 owner-neutral state transition hook，以及 Scene Layout 对三类 Popup/session 的地址映射。
- Scene Layout mode/transition、variant 与 authored/program Spine 的 event source 接入。
- main/registered reel visible settled symbol 的 resolved state transition hook；classic reel 与 grid-cell reel
  走同一 generic observer，不让 SymbolPlayer 知道 Gamelayout 地址。
- RenderCore/Gameframeworks public exports、定向测试、event hot-path benchmark、README/reference、最小领域规则
  与执行报告。

### 不包含

- 不修改 `apps/game002v2`、`apps/game003v2`、外部 pixicrave/piximinecart2 或 production assets。
- 不新增 Scene Layout/Popup/Symbol manifest 字段、版本、alias、`runtimeEvents` 表或生成物。
- `*` 只允许出现在 catalog 已编译的 symbol instance `x/y` address segment；其它 owner、state、animation 与
  event address 仍为 exact case，任意未知或越界地址继续显式失败。
- 不为 program Spine resource 分配或暴露稳定 instance id；同 resource 的多个 caller-owned object 本任务
  共享 logical event address，未来需要对象级寻址时另行设计 ownership/identity。
- 不发布 player pool reset、offscreen rolling-strip、预加载、回收或 dormant reel 的内部 symbol 变化；只发布
  当前 public visible settled occurrence 的 visual state commit。
- 不发布每帧金额、媒体时间、动画 progress、loop tick 或 resize frame；只发布离散 state/lifecycle boundary。
- 不接入任意 Pixi `EventEmitter`、DOM media event、raw Spine event 或 VNI timeline event，不开放 Container/player。
- 不增加异步 listener、历史 replay、event persistence、跨 runtime bus、telemetry backend 或 Game Layout Editor UI。

## 3. 制定计划时的基线

```text
UTC: 2026-08-22T01:46:30Z
HEAD: c822db561104b59a9dee8298c5d81a2968c3329b
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、任务 228 计划/执行报告、任务 232 计划、
  `docs/gamelayout-runtime-addresses.md` 与当前 RenderCore public/runtime/test/benchmark 入口；目标目录没有补充
  `AGENTS.md`。本会话只创建 `tasks/` 计划，按根规则未加载实现领域规则；执行会话须按实际修改重读
  `docs/agent-rules/{shared-game-runtime,scene-layout}.md`。
- 任务 228 已提供 immutable catalog、`list/describe/resolve/bind/wait`、同步 listener、AbortSignal waiter、
  monotonic sequence 与 destroy cleanup；dispatcher 当前内嵌在
  `packages/rendercore/src/scene-layout/core/runtime-address.ts#createGameLayoutRuntimeAddresses()`。
- 当前 event catalog 已有 transition configured Spine event、video `started/ended`、music/BGM
  `started/stopped` 和任务 232 的 `gamelayout:/event/variant-changed`；`emit()` 在没有订阅时仍会创建
  occurrence/detail，且没有 address-native instance 或 hot-path interest probe。
- `DefaultSceneLayoutPackageRuntime.applyViewport()` 只在成功提交不同 `variantId` 后发布 variant event；首次
  apply、同 variant resize 与失败 apply 不发布，任务 240 必须保留该边界。
- Popup core 已有确定状态：award `idle/counting/dismissing/complete` + `activeTierId/activeSegment`，Spine
  `idle/start/loop/end/complete`，single-state `idle/active/complete`；Scene Layout scheduler 另有
  `queued/opening/active/closing/finished/cancelled/failed`，但目前都没有 production event hook。
- mode snapshot 已区分 `displayedMode`、`stableMode`、target 与 transition phase；Spine switch event 处先
  `commitActiveTransition()` 再发布 configured event，transition 完成后才提交 stable mode。
- authored loop Spine 的 `playAnimation()/stopAnimation()` 位于
  `scene-layout/runtime.ts`；program Spine `RenderObject.play()/stop()/destroy()` 位于
  `scene-layout/render-object-factory.ts`，都已有唯一 completion/supersede/abort/destroy 边界。
- `SymbolPlayer.update()` 返回 `stateChanged` 与 committed requested/resolved state；classic `RenderReel` 和
  grid-cell reel 已持有 public x/y/visible occurrence identity，但当前直接忽略 update result，且
  `SymbolPlayer` 因 pool 复用本身不拥有稳定坐标。
- RenderCore 已有 `benchmark:scene-layout`、`benchmark:symbol` 等 Node benchmark 脚本，可新增同风格的 event
  benchmark；不应使用机器相关的绝对 wall-time 阈值作为正确性测试。

## 4. 需求解释与技术决策

### 需求解释

1. “所有弹窗状态改变”分两层：Scene Layout scheduler occurrence state，以及 Popup player 内的 visible
   phase/tier/segment。两层都发布，避免把“排队/关闭”和“bigwin start/loop/end”压成含糊的单一状态。
2. award 的 `bigwin/megawin/...` 来自 Popup manifest exact tier id；shared code不硬编码具体档位。tier
   entered/exited 表示该档画面成为/不再是 active tier，segment entered/exited 表示该档 start/loop/end
   动画阶段变化。
3. “切换到 BaseGame/FreeGame”至少有两个真实边界：target scene 已显示，以及整个 transition 已完成并成为
   stable mode。分别发布 displayed/stable entered/exited，不用一个提前或延迟的伪 `mode-changed` 代替。
4. 横竖屏继续使用 task 232 已有 `variant-changed`；不监听 raw resize，也不为首次 apply 或同 variant resize
   制造事件。
5. nearwin 类 Spine 以 authored node 或 program resource logical owner发布 animation lifecycle。program resource
   的多个 object 暂时聚合；event detail 含 animation/loop/outcome，但不暴露 player/object reference。
6. symbol 地址同时标识 exact symbol/state 与 visible occurrence 的 reel+x/y；listener 直接绑定 exact 或带
   `*` 的 canonical address，不传额外 instance selector。
   resolved state 才代表画面真正进入/离开；pending requested state 只放入 detail，不单独发布 visual entered。

### Canonical event 地址

```text
gamelayout:/event/variant-changed
gamelayout:/popup/<popup-id>/session/<queued|opening|active|closing|finished|cancelled|failed>
gamelayout:/popup/<popup-id>/phase/<exact-phase>/<entered|exited>
gamelayout:/popup/<popup-id>/tier/<exact-tier-id>/<entered|exited>
gamelayout:/popup/<popup-id>/tier/<exact-tier-id>/segment/<start|loop|end>/<entered|exited>
gamelayout:/mode/<mode-id>/state/displayed/<entered|exited>
gamelayout:/mode/<mode-id>/state/stable/<entered|exited>
gamelayout:/transition/<from>/<to>/lifecycle/<started|switched|ended|failed>
gamelayout:/node/<node-id>/animation/lifecycle/<started|ended>
gamelayout:/resource/spine/<resource-key>/animation/lifecycle/<started|ended>
gamelayout:/symbol-package/<binding-id>/symbol/<symbol-id>/instance/reel/<reel-id>/x/<x|*>/y/<y|*>/state/<state-id>/<entered|exited>
```

- 地址含 authored/logical identity，并将 symbol occurrence 坐标直接纳入 canonical path；animation name
  仍放在 detail 中，避免 lazy runtime resource 必须预加载 skeleton 才能编译 catalog。
- Popup phase/tier/segment 地址只按该 Popup type 与 manifest 可达 identity 编译；single-state 不生成 tier，
  非 award Popup 不生成 award tier，unknown address 继续显式失败。
- transition `switched` 与已有 configured Spine event 可在同一 commit boundary依次发布：先完成内部 scene/mode
  mutation，再发布 `switched`，再发布 exact configured event；两者不互相替代。

### Event manager 与 instance address

`bind(address, listener)` 与 `wait(address, { signal? })` 不接受额外 instance selector。symbol 的 `reelId`、
`x`、`y` 都在 address 中；`reelId` 必须是 catalog 中 exact reel id，`x/y` 必须是 catalog 已编译的非负坐标
或 `"*"`。监听该 reel 全部坐标时显式绑定 `x/*/y/*` address；越界或任意未知组合在 bind/wait 时失败。

- manager 为每个 exact symbol occurrence address 预编译四个匹配 address；dispatch 不解析 glob，不遍历其它
  symbol/state/坐标 listener。相同 listener 对多个匹配 address 的重复注册是多个订阅，按 registration sequence
  各调用一次。
- manager 维护 global 与按 event family/address 的 interest count。producer 先读无分配 probe；无兴趣时只推进
  sequence/状态，不调用 lazy detail factory。sequence 保持 runtime 内单调，是否存在 subscriber 不改变现有
  已发生 event 的计数语义。
- occurrence/detail 均冻结；occurrence.address 始终是实际 exact instance address。listener 快照按注册
  sequence调用，dispatch 中新增订阅从下一 occurrence
  生效，dispose幂等。waiter先 resolve，listener随后同步调用，沿用任务 228 顺序。

### 状态顺序与 outcome

1. 同一 state change 先发布旧 state `exited`，再发布新 state `entered`；内部 mutation 在两者之前完成。
2. Popup session 正常关闭依次为 `closing → finished`；queued cancel只发布 `cancelled`；失败发布 `failed`。
   event detail携带 runtime-scoped occurrence sequence，使同 owner 的多次 enqueue可关联，但不进入地址。
3. award tier变化先旧 segment/tier exited，再新 tier/segment entered；同 tier `start→loop→end` 只发布 segment
   边界。一个大 delta跨过多个边界时不得只比较最终 snapshot而遗漏中间状态。
4. mode scene commit先 old displayed exited、new displayed entered；transition完成再 old stable exited、new stable
   entered。失败只发布 transition failed，不伪造 target mode entered。
5. Spine `started` 只在底层 `play()` 成功接管后发布；`ended` 恰好一次并携带 outcome。loop 的首圈 Promise
   resolve不等于 animation ended；只有 stop/supersede/abort/failure/destroy 才结束仍在运行的 loop。
6. symbol event只在可见 settled occurrence 的 resolved state实际变化时发布；换 symbol、pool reset、offscreen
   spinBlur准备和 dormant entry不冒充同一 occurrence 的 state change。

## 5. 职责与合同

- **Scene Layout data**：event address/occurrence的纯类型与 strict validation；不依赖 Pixi、Popup player、
  reel instance或业务 tier 名。
- **Scene Layout core event manager**：catalog entry、interest counter、exact/coordinate index、bind/wait、lazy emit、
  ordering、abort/dispose/destroy；不知道 mode/Popup/symbol业务何时变化。
- **Scene Layout package runtime**：把 mode/transition/variant、Popup occurrence、authored/program Spine 与 active
  symbol package/reel identity映射到 canonical event token；只在成功 commit后发事件。
- **Popup core**：在实际 phase/tier/segment mutation处发 owner-neutral primitive transition hook，保证中间边界不丢；
  不导入 Scene Layout address或全局 manager。
- **Reel/Symbol**：SymbolPlayer继续拥有状态机；reel拥有 visible occurrence与坐标，并把 committed resolved state
  change交给可选 observer。observer缺失/无兴趣时不增加对象分配，pool不获得Gamelayout职责。
- **RenderObject factory**：继续拥有 caller-owned program object/player lifecycle；只通过注入的 owner-neutral hook
  报告 play/end outcome，不把 instance/player泄露给 event detail。
- **Gameframeworks/game app**：facade只 re-export types；游戏 bind/wait exact address并负责 dispose/AbortSignal，
  不轮询 snapshot、不读取manifest重建event表。
- **失败策略**：unknown address/type/state/reel、非法或越界instance address、non-event bind、async listener、callback error、
  destroyed manager全部显式失败；callback failure发生在 commit后，不回滚画面。
- **禁止行为**：process-global singleton、EventEmitter通配扫描、每帧 event、raw object detail、静默 address
  归一化、首项/default mode fallback、重复状态机或第二份业务event表。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/core/runtime-event-manager.ts
packages/rendercore/tests/scene-layout/{runtime-event-manager,runtime-event-lifecycle}.test.ts
packages/rendercore/tests/reel/symbol-state-event.test.ts
packages/rendercore/benchmarks/runtime-event-hot-path.mjs
tasks/240-rendercore-gamelayout-runtime-events-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,runtime,package-runtime,render-object-factory}.ts
packages/rendercore/src/scene-layout/{data/runtime-address,core/runtime-address,core/index}.ts
packages/rendercore/src/popup/{award-player,spine-player,single-state-player}.ts
packages/rendercore/src/popup/core/types.ts
packages/rendercore/src/reel/{types,render-reel,render-grid-cell-reel-set}.ts
packages/rendercore/tests/{scene-layout,popup,reel}/**
packages/rendercore/{package.json,README.md}
packages/gameframeworks/src/index.ts
packages/gameframeworks/README.md
docs/gamelayout-runtime-addresses.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md
```

### 原则上不应修改

```text
apps/**
assets/**
packages/{logiccore,uiframeworks,netcore,audiocore,vnicore}/**
packages/rendercore/src/symbol/{manifest,state-machine,catalog}.ts
{AGENTS.md,pnpm-workspace.yaml,pnpm-lock.yaml}
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

执行时若需新增 schema/version、修改生产资源、引入 process-global registry、给 program object增加 public
instance identity、修改游戏 app或扩大到VNI/raw Spine event，必须先说明并重新确认范围。

## 7. 实施步骤

1. **确认执行基线与事件矩阵**
   - 重核 HEAD/status、任务228/232 API、两份领域规则、Popup三类状态机、mode commit顺序、Spine playback
     outcome及classic/grid-cell visible symbol mutation入口。
   - 先用表格fixture固定每个地址、source boundary、detail、顺序、instance address能力与不应发布的内部变化。
2. **抽出高性能 event manager**
   - 从`runtime-address.ts`抽出manager，保留public `addresses`形状；实现interned event token、interest count、
     lazy detail、exact map、四bucket coordinate index、wait/abort/dispose/destroy。
   - 测试现有event兼容、无订阅detail factory零调用、registration顺序、dispatch期间变更、async/error、
     instance address strictness与至多四bucket lookup。
3. **扩充 catalog 与 typed contract**
   - 从canonical Scene Layout、Popup package与Symbol package identity编译上述有限地址；不预加载lazy resource、
     不写manifest。
   - 扩展occurrence detail/outcome类型与address-native instance catalog，并由gameframeworks re-export。
4. **接入 Popup 与 mode/transition**
   - Popup core集中所有phase/tier/segment assignment并发primitive transition；package runtime集中session state写入，
     映射owner address与occurrence sequence。
   - 在displayed/stable commit、transition start/switch/end/failure发布mode/edge事件，保留configured Spine event
     先commit后dispatch合同；variant事件只改为lazy manager source。
5. **接入 Spine animation lifecycle**
   - authored node和program resource在底层play成功后发started，在complete/stop/supersede/abort/fail/destroy
     单点终结并发ended；loop首圈完成不误报ended。
   - 多个program instance聚合到resource owner，测试并发实例可分别产生occurrence但不暴露对象identity。
6. **接入 symbol visible state event**
   - 给reel创建链注入可选observer；在public state request与`SymbolPlayer.update().stateChanged`后读取已存在的
     before/after，结合当前active package、reel、visible x/y发布resolved exited/entered。
   - 覆盖exact及三种坐标通配、classic/grid-cell、once自动返回、替换/滚动/pool/dormant不发布、mode binding
     切换后使用正确package identity。
7. **性能、文档与收尾**
   - 新增event benchmark，分别记录零订阅、exact、四种coordinate address的ops/s、detail factory调用与heap；
     正确性不依赖机器wall-time阈值，报告保留对比数据。
   - 更新README/address reference与最小领域规则，运行L2定向验收并生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- 使用shared最小fixtures，不读取Crave/Minecart2生产资源，不硬编码Nearwin1、WL、bigwin或megawin为通用规则；
  示例名只可出现在文档示例，测试用中性exact identity。
- 每类事件覆盖正常边界、重复/无变化不发布、failure/cancel/destroy、顺序、detail immutability与no replay。
- 高频测试以“lazy factory未调用、无formatter/parser、固定bucket lookup数”证明结构性fast path；benchmark只提供
  实测证据，不用不稳定的绝对时间阈值扭曲实现。
- Popup测试必须覆盖一个delta内的连续phase/segment变化，symbol测试覆盖request时立即变化和update时自动变化。
- 现有task228 transition/BGM/variant测试继续通过，证明resolver与event兼容，而非复制一套manager。

### 验收级别

`L2`：修改RenderCore public event contract并由Gameframeworks facade直接消费，同时接入Popup、reel、symbol、
Spine多个内部owner及高频生命周期；不涉及schema、production asset、lockfile、根工具链或release，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address.test.ts tests/scene-layout/runtime-event-manager.test.ts tests/scene-layout/runtime-event-lifecycle.test.ts tests/popup/award-player.test.ts tests/reel/symbol-state-event.test.ts
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/rendercore benchmark:events
pnpm --filter @slotclientengine/gameframeworks typecheck
git diff --check
```

### 人工验收

在真实浏览器与实际Gamelayout package中验证：

1. 同一award Popup依次进入两个实际tier时，各tier start/loop/end与entered/exited只发一次；关闭后session
   `closing/finished`顺序正确，立即关闭/取消/失败不会伪造正常完成。
2. BaseGame→FreeGame及反向切换时，displayed与stable边界符合画面；transition popup、Spine switch event、
   transition lifecycle顺序与真实视觉一致。
3. 横竖屏切换只收到一次`variant-changed`；同方向resize与失败apply无事件。
4. 同一program Spine resource创建两个对象并播放不同animation，started/ended outcome正确且无错误instance承诺。
5. 多个相同symbol处于不同坐标时，exact、`x/*`、`*/y`、`*/*` listener命中正确；连续spin、appear/win/normal、
   pool复用、mode切换和destroy无stale坐标或重复event。

### 独立验收建议

`必须`：涉及跨包public contract、高频symbol热路径、Popup/Spine异步lifecycle与runtime destroy。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-event-manager.test.ts tests/scene-layout/runtime-event-lifecycle.test.ts tests/reel/symbol-state-event.test.ts
pnpm --filter @slotclientengine/rendercore benchmark:events
pnpm --filter @slotclientengine/gameframeworks typecheck
```

## 9. 环境与依赖

- 使用仓库要求的Node 24与pnpm；shell没有Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有实际下载失败后设置仓库约定代理并重试。
- 本任务不新增依赖、不修改lockfile；benchmark使用Node内置`perf_hooks/process.memoryUsage`与现有dist。

## 10. 生成物、文档与规则

- 本任务无YAML/schema/production生成物；`dist`只由build验证，不提交手改产物。
- `docs/gamelayout-runtime-addresses.md`补充完整event地址、symbol instance address、typed detail、顺序、outcome、
  zero-listener fast path与cleanup示例；RenderCore/Gameframeworks README只保留入口摘要。
- 若实现确认“package-owned统一manager、commit后dispatch、symbol坐标address、无订阅fast path”为稳定职责，
  最小更新`shared-game-runtime.md`与`scene-layout.md`；不修改根`AGENTS.md`，不回写任务228/232历史文件。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/240-rendercore-gamelayout-runtime-events-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终地址、实际文件、event顺序与outcome、
零订阅结构证据、benchmark数据、自动验收、未完成人工验收、计划偏差和剩余风险；不收集无关coverage、
完整历史矩阵或整仓profiler数据。

## 12. 风险、假设与待确认

### 风险

- award一次update可能跨多个内部边界；若只轮询最终snapshot会漏event，必须从集中mutation点发布。
- SymbolPlayer被pool复用且不拥有坐标；把observer放入player会产生stale x/y，必须由当前visible reel occurrence
  在commit时选择 exact instance address。
- symbol event数量可远高于Popup/mode；任何每帧对象创建、地址format、glob扫描或全listener遍历都会成为性能回归。
- listener抛错发生在画面commit后，无法回滚已发生的Popup/mode/symbol状态；合同继续fail-stop并要求listener轻量同步。
- program Spine相同resource的多个instance聚合后，consumer只能区分occurrence sequence/animation/outcome，不能
  精确命令某个对象；这是本任务明确保留的能力边界。

### 假设

- 用户所说symbol `x/y`是当前public reel/area的零基visible坐标，不是server reel strip index、Pixi像素坐标或
  moving cascade中间位置。
- `WL`等symbol identity来自active Symbol package exact symbol id；`win/appear`来自该package state preset，
  shared runtime不维护业务别名。
- “Popup关闭”以Scene Layout scheduler occurrence进入`finished`为正常关闭边界；player `complete`是内部画面阶段，
  两者可相邻但不是同一个event。
- task228同步listener、waiter ordering、no replay和callback error策略继续作为兼容合同。

### 待确认

无。program Spine instance identity按用户意见暂不特别处理；symbol instance先以exact/wildcard x/y完成本任务。

## 13. 完成清单

- [x] Popup session/phase/tier/segment event覆盖全部实际mutation且顺序稳定。
- [x] mode/transition/variant只在正确commit/failure边界发布。
- [x] authored/program Spine started/ended与outcome恰好一次。
- [x] symbol resolved state与四种坐标address正确，无internal/pool伪event。
- [x] zero-listener fast path、fixed bucket dispatch与benchmark满足性能目标。
- [x] task228现有地址、bind/wait、BGM/transition/variant兼容。
- [x] facade、文档、领域规则、L2验收与UTC执行报告完成。
