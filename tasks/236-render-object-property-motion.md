# 236 render-object-property-motion 任务计划

## 1. 目标与完成定义

### 目标

把任务 234 只服务于 authored Scene Layout node 的位置 motion 下沉为 RenderCore presentation
通用能力，使所有受 RenderCore ownership/lease 保护的 `RenderObject` 都能复用同一套 host-update 手动时钟动画：

- 位置移动；
- 渐隐、渐显与任意透明度动画；
- x/y 缩放缓动；
- 顺时针角度旋转缓动；
- 单次命令内多属性并行动画。

新能力保持 opaque `RenderObject`、`RenderAnchor`、owner clock 和显式 cleanup 边界；游戏继续用普通
`await` / `Promise.all()` 编排阶段，不引入 keyframe、timeline、sequence plan 或业务动画 DSL。

### 完成定义

- [ ] presentation 层提供唯一通用 motion runtime/controller；generic `RenderObject`、owned clone、文字、
      ImgNumber、程序 image/Spine/VNI，以及任务 234 authored Scene Layout object 都委托该实现，不复制 sampler、
      active transaction 或 ticker。
- [ ] 单次 `animate` 命令可任选 position、opacity、scale、rotation 中的一项或多项；先完整校验和捕获起点，
      再在同一 duration/easing/progress 上并行采样，Promise 在所有目标属性精确提交后 resolve。
- [ ] `fadeIn` / `fadeOut` 分别缓动到 opacity `1` / `0`；任意 `opacity` 目标严格位于 `[0,1]`，且 fade
      不隐式调用 `setVisible()`、不改 authored mode/variant visibility。
- [ ] scale x/y 独立插值并保留负值镜像语义；rotation 使用顺时针度数，按捕获值到 exact target 的有符号数值差
      插值，不猜 shortest-path、不自动归一化，允许调用方显式表达多圈目标。
- [ ] position 保留 line/cubic path、opaque anchor resolver 与既有 easing；其它属性使用同一经过 easing 的时间进度。
- [ ] direct setter、同对象新 motion、abort、unmount/detach、scope interruption、spin、variant/geometry replacement、
      destroy 都有确定的 supersede/cancel 语义；pending Promise 不悬挂，listener/runtime registration 不泄漏。
- [ ] 任务 234 authored placement 仍是唯一 home owner；程序位置/透明度/缩放/旋转以 additive/multiplicative
      presentation transform 叠加，不覆盖 manifest placement、mode/variant visibility 或资源 player transform。
- [ ] borrowed settled Symbol/part 不因“全部 RenderObject”而获得绕过 reel/state owner 的任意 mutation；调用方使用
      owned clone，或使用 owner 明确授予且会在 spin/replacement 前收回的 presentation lease。
- [ ] 任务 234 的位置 motion、现有 `PresentationScope.move/transfer`、reel/cell transfer、playback 与资源生命周期
      行为保持兼容；新增 shared tests 与定向依赖链验收通过。

## 2. 范围

### 包含

- `packages/rendercore/src/presentation` 的通用属性 motion types、manual-clock runtime、对象 registration 和 public export。
- `RenderObject` opacity 原子 setter及通用 motion capability；所有现有 RenderObject factory/alias 保持同一 adapter identity。
- `RenderObjectLayer`、`PresentationScope`、Spine exact-slot attachment 与 owner clock/lease 的接入和 cleanup。
- standard ReelArea 与 legacy grid-cell PresentationScope 对通用 motion owner 的复用。
- 任务 234 `SceneLayoutRenderObject.motion` 到通用 engine 的适配，同时保留 anchor alignment、axis、home/reset 合同。
- pure easing/path primitive 从 reel 专属目录向 presentation 职责收敛；reel public type保留兼容 alias。
- rendercore/gameframeworks public export、README、最小 shared/scene-layout 领域规则与测试。

### 不包含

- 不新增 keyframes、delay track、repeat/yoyo、sequence/timeline、callback event、CSS transition、GSAP、RAF 或 wall-clock timer。
- 不让 motion 解释 Win/Coin/Wild/Feature、animation name、symbol state、popup phase 或其它业务阶段。
- 不为各属性提供不同 duration/delay/easing；复杂节奏由多个显式 `await` 阶段表达，跨对象并行使用 `Promise.all()`。
- 不把 opacity `0` 等同 `visible=false`，不在 fade completion 后自动 hide/destroy/unmount。
- 不提供 color、tint、blur/filter、skew、pivot、zIndex、audio、Spine bone/slot transform动画。
- 不开放 raw Pixi `Container`、Matrix、world coordinate、ticker或 active transaction。
- 不允许 generic motion 提交盘面 occurrence position/code/value，不替换 Symbol state/player或 reel mutation API。
- 不修改 Scene Layout manifest/schema/version、Game Layout Editor、production assets、游戏业务 app、logiccore或lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-21T03:47:19Z
HEAD: aead46cafd6e6ca7c6acf76c9b9860aac3e83051
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout}.md`；`packages/rendercore` 无补充 `AGENTS.md`。
- 当前主工作树只到 task 233；task 234 尚未进入当前 refs，而位于只读核对的另一工作树
  `/Users/zerro/.codex/worktrees/b846/slotclientengine`，其 HEAD 同为 `aead46ca` 且有未提交修改。执行 task 236
  不得修改、清理或直接覆盖该工作树。
- task 234 的计划、报告与 diff 已证明其实际 shared contract：所有 authored `SceneLayoutRenderObject` 有
  `motion.getHomeAnchor/snap/move/reset`；`runtime.update(deltaSeconds)` 推进唯一 active position motion；
  abort、supersede、geometry/variant replacement、reset、destroy 会 reject并清理。
- task 234 当前实现把 `SceneLayoutRenderObjectMotion`、transaction与 update逻辑直接放在
  `packages/rendercore/src/scene-layout/{types,runtime}.ts`，并直接复用 reel
  `prepareVisibleOccurrenceMotion()`；尚未覆盖 generic `RenderObject`、opacity、scale、rotation或组合属性。
- 当前 generic `RenderObject` 位于 `packages/rendercore/src/presentation/render-object.ts`，已有 finite
  `setPosition/setRotation/setScale/setVisible`，没有 opacity setter、property reader或通用 motion owner。
- generic RenderObject实际来源包括 `text-render-object`、`imgnumber-render-object`、symbol/part clone、
  runtime image/Spine/VNI factory、popup对象和 SymbolHandle alias；adapter由 WeakMap保持 opaque identity。
- `PresentationScopeContext.move/transfer` 当前只移动已 scope-mounted `RenderObject`，standard与legacy grid-cell
  在各自 reel-set 内复制 scope bookkeeping，并用 owner `update(deltaSeconds)` 推进位置 motion。
- `visible-occurrence-transfer.ts` 已有 strict line/cubic spatial path、linear/cubic-bezier time easing与低 FPS完整
  progress sampler，但名称和目录仍耦合 reel occurrence。
- 当前没有可确认的 task 235 计划、实现或 ref。执行前必须核对 task 234/235 最终落地主线后的真实 public seam；
  小幅命名适配写入报告，若职责或 ownership 已改变则停止并重新规划。

## 4. 需求解释与技术决策

### 需求解释

1. “扩展到全部 RenderObject”指统一 capability 与实现覆盖，而不是取消 ownership：owned对象、owned clone、
   owner-controlled authored object和显式 presentation lease可动画；borrowed settled Symbol/part仍需clone或owner scope。
2. 渐显/渐隐是 opacity 从动画开始时当前有效值缓动到 `1/0`。如果对象已被 `setVisible(false)` 或 authored
   visibility隐藏，fade不会偷偷改变该状态。
3. 任意透明度动画接受 exact `[0,1]` target；非法 target、duration、easing、position、scale、rotation在开始前
   fail-fast，且不改变任一属性、不 supersede现有合法 motion。
4. 多属性并行是一个对象的一次原子命令共享 duration/easing/signal；不建立通用时间轴。命令至少包含一个目标属性，
   Promise只在最长边界之外不额外等待，因为所有属性共享同一边界。
5. 动画起点在命令成功 prepare 时从 owner adapter捕获；新命令接管时从当前已呈现值继续，而不是跳回旧起点。
6. position可由 generic local point或现有 owner-specific anchor resolver产生；opaque anchor到target-local point的解析仍由
   layer/Scene Layout owner完成，common sampler不取得world coordinate。
7. scale按x/y分量插值，允许穿过零产生调用方明确要求的镜像过渡；rotation按数值差插值，因此 `0→720` 是两圈，
   `350→10` 是反向 `-340°`，runtime不擅自选最短方向。
8. `setVisible()`继续是离散原子动作；play/stop与属性 motion可并行，destroy/scope interruption统一取消两者各自owner。

### 关键决策

1. **presentation层唯一 motion runtime**：新增 instance-owned `RenderObjectMotionRuntime`，只接收
   `update(deltaSeconds)`，持有active transaction与AbortSignal cleanup；Scene Layout和两种 reel presentation只装配、
   推进同一实现，不保留各自 sampler/state machine。
2. **RenderObject统一 capability + owner registration**：每个 generic `RenderObject` 暴露相同 opaque motion controller；
   synchronous snap/setter可在detached owned对象上使用，awaitable animate要求已绑定exactly one motion runtime。
   layer mount、Scene Layout authored owner和Spine slot attachment负责注册/转移；未绑定、重复绑定、跨runtime挂载显式失败。
3. **最小属性命令，不做DSL**：public `RenderObjectMotionAnimation`只包含 `durationSeconds/easing/signal` 与
   optional `position/opacity/scale/rotationDegrees` targets。位置可附已有 path；单命令只使用一个时间 easing。
4. **先preflight再commit**：完整校验所有字段、解析anchor/target、捕获全部source后才 supersede旧transaction并注册新transaction；
   prepare失败保持旧motion与当前画面不变。每帧先采样完整frame，再一次应用全部属性，避免半帧提交。
5. **通用值与owner transform分离**：generic owned object直接采样其local transform/alpha；authored Scene Layout adapter
   保存 program position offset、opacity multiplier、scale multiplier与rotation offset，再与最新 authored home组合。
   geometry/variant replacement取消并复位neutral program transform，不能把旧variant数值带入新home。
6. **兼容task 234与现有scope API**：`SceneLayoutRenderObjectMotion`组合common controller，并保留
   `getHomeAnchor/snap/move/reset`作为anchor/home façade；`PresentationScope.move/transfer`保留签名但内部翻译为common
   position command。新增通用 `animate(node, command)` 供已mount对象组合属性，不要求consumer立即迁移旧调用。
7. **easing职责下沉且保留alias**：把通用time easing类型/sampler移到presentation；reel的
   `VisibleOccurrenceTimeEasing`保留deprecated type alias，visible occurrence path继续委托同一sampler，避免破坏直接consumer。
8. **单对象单transaction**：新animation或direct transform/opacity setter会明确supersede active animation；cancel默认保留
   当前插值结果，Scene Layout `reset()`是显式例外并恢复neutral authored transform。不同对象并行由各自transaction或
   `Promise.all()`完成。

## 5. 职责与合同

- **RenderObject / adapter**：保存opaque view identity、ownership、当前effective property读写与destroy hook；不拥有ticker。
- **RenderObjectMotionRuntime**：拥有manual clock、transaction prepare/sample/commit、Promise、abort/supersede与registration；
  不解析业务对象种类。
- **RenderObjectLayer / PresentationScope**：拥有mount lease、runtime binding、anchor到target-local point解析和interruption cleanup。
- **Scene Layout runtime**：拥有authored home、variant/mode visibility与program transform adapter；每帧只推进一个shared motion runtime。
- **reel/cell owner**：拥有spin interruption和borrowed occurrence lease；不允许generic motion提交settled scene mutation。
- **gameframeworks**：只re-export稳定public types/functions，不复制实现或新增recipe。
- **失败策略**：unknown property、empty command、non-finite/out-of-range值、非法path/easing、无clock owner、重复/跨owner注册、
  stale/destroyed object全部显式失败；不得fallback到linear、alpha 1、scale 1、rotation 0或首个owner。
- **资源生命周期**：runtime destroy、layer detach、scope cleanup、object destroy先取消active motion并移除listener/registration，
  再按既有ownership remove/destroy；borrowed object不因animation获得destroy权限。
- **禁止行为**：不使用process-global registry/shared ticker，不缓存跨transform world point，不暴露Container/Matrix，
  不为standard/grid-cell/Scene Layout各写一套property tween。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/presentation/render-object-motion.ts
packages/rendercore/tests/presentation/render-object-motion.test.ts
tasks/236-render-object-property-motion-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/presentation/{index,render-object,render-object-layer,presentation-scope,spine-slot-attachment}.ts
packages/rendercore/src/reel/{types,visible-occurrence-transfer,render-reel-set,render-grid-cell-reel-set}.ts
packages/rendercore/src/scene-layout/{types,runtime,render-object-factory}.ts
packages/rendercore/tests/presentation/{render-object,render-object-layer}.test.ts
packages/rendercore/tests/reel/{render-reel-spin,render-grid-cell-reel-set}.test.ts
packages/rendercore/tests/scene-layout/{coordinate-space,render-object-factory}.test.ts
packages/rendercore/README.md
packages/gameframeworks/src/index.ts
packages/gameframeworks/README.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md
```

### 原则上不应修改

```text
apps/**
assets/**
packages/{logiccore,uiframeworks,netcore,vnicore,audiocore,popupcore}/**
packages/rendercore/src/{logiccore,popup,symbol-data}/**
docs/agent-rules/{game002,game003,loading-ui}.md
{AGENTS.md,package.json,pnpm-workspace.yaml,pnpm-lock.yaml}
/Users/zerro/.codex/worktrees/b846/slotclientengine/**
```

执行时若需要修改manifest/schema、生产资源、游戏业务、root工具链，允许borrowed盘面对象脱离owner任意动画，或引入
新的renderer/ticker依赖，必须先停止说明范围扩张。

## 7. 实施步骤

1. **确认task 234落地基线**
   - 重核主线HEAD/status、task 234最终commit/report、task 235影响和现有RenderObject/Scene Layout motion public seam。
   - task 234未进入执行工作树时不从其dirty工作树复制文件；先等待其正式落地或由用户明确安排整合方式。
2. **抽取pure sampler与建立通用runtime**
   - 把time easing和scalar/vector interpolation放入`presentation/render-object-motion.ts`；position path复用现有
     line/cubic geometry sampler，reel type/行为用compat alias保持。
   - 实现instance-owned runtime、registration、atomic preflight、single active transaction、manual update、低FPS exact boundary、
     abort/supersede/cancel/destroy。
3. **扩展generic RenderObject合同**
   - 增加strict opacity setter与common motion capability；adapter内部提供capture/apply hooks，不公开property getter或Container。
   - 更新create/clone/alias/cleanup，使文字、ImgNumber、symbol/value/text clone、program image/Spine/VNI共享同一adapter transaction。
   - direct setter与motion冲突按计划supersede；play/stop、visible和destroy语义保持。
4. **接入layer、scope与attachment owners**
   - RenderObjectLayer mount/remove和Spine slot attach/detach建立/释放exact runtime registration，跨owner迁移先完整预检。
   - `PresentationScope.animate`翻译anchor/local target后调用common runtime；旧move/transfer委托它。
   - standard与legacy grid-cell删除本地property motion复制，只在既有update/interruption边界推进/取消shared runtime。
5. **适配task 234 Scene Layout motion**
   - authored node使用program transform adapter组合home + position offset、base visibility × opacity、home scale × factor、
     home rotation + offset；保持anchor alignment、axis、snap/move/reset/getHomeAnchor兼容。
   - variant/geometry commit先cancel/reset program transform，再应用新home；runtime destroy清理Promise/registration。
   - runtime-created detached program objects在挂入registered layer/slot后可使用相同motion；未挂载awaitable motion严格失败。
6. **补齐测试、facade与文档**
   - 自包含tests覆盖每个property、fade、多属性原子并行、invalid preflight、低FPS、abort/supersede、setter conflict、
     clone/alias、mount/slot registration、borrowed拒绝、scope/spin/variant/destroy cleanup。
   - 更新rendercore/gameframeworks export与README；只把稳定ownership/manual-clock/additive transform边界写入领域规则。
7. **定向验收与报告**
   - 运行L2命令；失败先最小化判断是否由task 236引入，不扩大到整仓。
   - 核对diff/旧API残留与重复motion state，生成UTC中文执行报告，记录task 234/235基线适配。

## 8. 测试与验收

### 测试原则

- pure sampler测试使用手动`update()`，不使用`setTimeout()`、RAF、fake wall clock或Pixi shared ticker。
- 用至少一种plain Container、一种clone/alias、一种program object和一种authored object证明合同覆盖；不为每种资源复制
  同一组数值测试。
- 覆盖position only、opacity/fade、negative scale、literal multi-turn rotation及四属性同帧并行；中间帧和最终帧都校验。
- invalid multi-property command必须证明零mutation且不打断已有motion；abort/supersede/destroy必须证明Promise和listener收敛。
- borrowed Symbol/part测试证明直接generic motion失败，owned clone成功；spin/replace前owner cleanup无stale view。
- 现有position path、task 234 home/reset、PresentationScope move/transfer和visible occurrence transfer测试保持通过。

### 验收级别

`L2`：修改rendercore public `RenderObject`/presentation API、task 234 Scene Layout public motion与gameframeworks facade，
并重构standard/grid-cell直接consumer的manual-clock owner。无需L3，因为不改schema、生成物、lockfile、workspace配置或release。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation/render-object-motion.test.ts tests/presentation/render-object.test.ts tests/presentation/render-object-layer.test.ts tests/scene-layout/coordinate-space.test.ts tests/scene-layout/render-object-factory.test.ts tests/reel/render-reel-spin.test.ts tests/reel/render-grid-cell-reel-set.test.ts
pnpm --filter @slotclientengine/gameframeworks typecheck
git diff --check
```

### 人工验收

建议在最小RenderCore浏览器host用真实ticker验证：

1. 同一program image执行move + fadeOut + scale + `0→720°`，低FPS帧后最终位置/opacity/scale/angle精确；
2. fadeOut到0后对象仍mounted/visible flag不变，显式fadeIn可恢复；
3. authored Scene Layout node在动画中切variant时旧Promise取消，四项program transform归neutral并对齐新home；
4. spin interruption、slot detach和destroy后无继续更新、闪回、stale attachment或unhandled rejection。

### 独立验收建议

`必须`：涉及跨包public contract、manual-clock异步transaction、borrowed/owned registration、variant/spin cleanup和多属性
原子提交。独立复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation/render-object-motion.test.ts tests/scene-layout/coordinate-space.test.ts tests/reel/render-reel-spin.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/gameframeworks typecheck
```

## 9. 环境与依赖

- 使用仓库要求的Node 24与pnpm；shell没有Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试。
- 本任务复用Pixi Container、现有RenderAnchor、path/easing sampler和host update，不新增依赖、不修改lockfile。

## 10. 生成物、文档与规则

- 本任务不改YAML/manifest/正式资源，无generator/parity输出。
- 更新`packages/rendercore/README.md`与`packages/gameframeworks/README.md`，给出single-property、fade、multi-property、
  scope-mounted与Scene Layout authored object示例，并明确opacity/visibility差异。
- `shared-game-runtime.md`记录通用manual-clock property motion、ownership/lease和无业务DSL边界；`scene-layout.md`记录
  authored program transform对home的additive/multiplicative组合及variant reset。
- 不把精确duration/easing、业务动画组合或资源名写入根`AGENTS.md`或领域规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/236-render-object-property-motion-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终API/文件、task 234/235适配、自动验收结果、未完成人工验收、
剩余ownership/视觉风险；不收集全仓coverage、完整历史矩阵或profiler数据。

## 12. 风险、假设与待确认

### 风险

- task 234尚未合并，最终API或transform层级可能变化；从dirty工作树直接开发会造成丢修改或错误基线。
- authored object叠加scale/rotation会改变visual bounds；position anchor必须在prepare时按明确时点解析，不能每帧反馈重算导致漂移。
- opacity若直接覆盖player/layer自身alpha会破坏资源动画；必须使用程序乘数或独立wrapper transform。
- object在layer与Spine slot间迁移时若registration顺序错误，会出现双owner更新或pending Promise泄漏。
- 负scale穿零和多圈rotation虽为明确合同，真实素材的pivot观感仍需浏览器验证。
- 两套reel presentation当前有重复scope实现；收敛时需保持各自spin interruption和error propagation，不做无关reel重构。

### 假设

- task 234将以报告描述的`SceneLayoutRenderObject.motion`和host `update(deltaSeconds)`语义进入task 236执行基线。
- 单次多属性动画共享duration/easing已覆盖本任务；不同节奏可由显式await阶段或跨对象`Promise.all()`组合。
- opacity采用`[0,1]`，scale/rotation/position采用任意finite值，符合现有RenderObject strict setter风格。

### 待确认

无。执行基线中的task 234/235状态由执行会话从仓库查明；若不满足假设则按范围扩张规则停止，而不是猜测整合。

## 13. 完成清单

- [ ] 目标中的四类属性动画、fade与单命令并行均已实现。
- [ ] “全部 RenderObject”覆盖未破坏borrowed/owned/lease边界。
- [ ] shared runtime唯一，Scene Layout和两种reel scope无复制ticker/transaction。
- [ ] task 234、旧PresentationScope和visible occurrence transfer兼容行为通过定向回归。
- [ ] abort/supersede/setter/unmount/spin/variant/destroy cleanup均有测试。
- [ ] public export、README和最小领域规则已同步，无schema/依赖/lockfile变化。
- [ ] L2自动验收与`git diff --check`通过，人工验收状态明确。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划、`shared-game-runtime.md`与`scene-layout.md`；
2. 核对task 234已正式落地、task 235是否影响相关public seam，以及当前Git状态；
3. 保留用户已有/无关修改，不读取后直接改写task 234的dirty工作树；
4. 按“common runtime → generic RenderObject → owner adapters”的顺序实现，不另建property tween系统；
5. 小幅命名/文件适配写入报告，ownership/职责/public API明显变化时先停止说明；
6. 只运行本计划L2定向验收，不默认运行根级typecheck/lint/test/build/format；
7. 完成后生成UTC报告；
8. 除非用户明确要求，不commit、不push、不创建PR。
