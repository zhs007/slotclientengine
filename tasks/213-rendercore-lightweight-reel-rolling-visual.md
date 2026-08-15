# 213 rendercore-lightweight-reel-rolling-visual 任务计划

状态：已执行。执行报告见
[`213-rendercore-lightweight-reel-rolling-visual-20260815T040041Z.md`](./213-rendercore-lightweight-reel-rolling-visual-20260815T040041Z.md)。

## 1. 目标与完成定义

### 目标

把 `RenderReel` 的滚动显示与落停 occurrence 分成两种生命周期：spin/continuous spin
期间只使用 manifest 已准备的 exact `spinBlur` 贴图和固定轻量 Pixi view；只有最终可见、可被
`SymbolArea` 操作的落停 occurrence 才拥有完整 `RenderSymbol`、Spine/VNI player、value
controller 和 image-string。目标是消除高速滚动中的完整 symbol 构造/销毁风暴、避免隐藏
buffer symbol 持续更新，并让 CN 等 value symbol 在落停前完成目标实例准备、在落停边界原子
显示完整图标和数字。

### 完成定义

- [x] `RenderReel` 非 stopped 阶段的每个非空 slot 只显示稳定复用的 lightweight rolling
      view；跨 symbol code 只切换 exact state texture、scale、render priority、位置和 tint，
      不创建、初始化、更新或销毁完整 `RenderSymbol`。
- [x] lightweight rolling view 的资源和 metadata 只从 `ReelSymbolRegistry` 已解析的 manifest
      事实取得；优先使用 exact `spinBlur`，legacy 单层 package 按既有 RenderSymbol 语义使用 normal
      texture；无法解析 texture、非法 metadata 或 unknown code 显式失败。
- [x] target-aware spin/continuous settle 只为最终可见非空 occurrence 准备完整
      `RenderSymbol`；同一 target 不按帧重复准备，未选 cell 和滚动 buffer 不准备完整 symbol。
- [x] 最终 symbol 的 code、presentation value、目标 state 和异步 player/display readiness 在
      commit 前完成验证；landing 时从 rolling view 原子切换到 prepared settled symbol，不出现
      normal 空白帧或“CN 有底图但数字未挂载”的半提交状态。
- [x] rolling CN 不初始化 `CN_1..CN_4` tier Spine、value display 或 glyph Sprite；最终 CN 同档
      value 继续复用 image-string renderer，跨档只在 settled/prepared occurrence 合同内重建。
- [x] rolling CN 与目标 CN 即使 code 相同，也必须按 `rolling -> settled` 模式转换，不能被现有
      `slot.code === code` fast path误判为已经落停。
- [x] stopped 阶段只 update 实际可见、已落停的完整 symbol；上下 buffer slot 不持有或更新
      完整 symbol。现有 6×9、每 cell 3 slot 的布局应从最多 162 个稳定动画 update 降为最多
      54 个可见 occurrence update。
- [x] grid-cell dimming、mask、方向、local phase、临时 server landing window、start/landing
      cadence、bounce、renderPriority、appear、cascade、transfer 和 exact occurrence stale 语义
      保持不变。
- [x] standard `RenderReelSet` 和 legacy `RenderGridCellReelSet` 复用同一个 `RenderReel`
      rolling owner；不新增 grid-cell 专属高级 public API，也不复制第二套 motion 状态机。
- [x] cancel、target replacement、prepare rejection、release、runtime destroy 和低 FPS 多 slice
      update 都会恰好一次清理 rolling/prepared/settled owner，不泄漏 player、Promise callback、
      display child 或 pool entry。
- [x] 增加结构化计数测试证明创建量不再随滚动距离、帧数或服务器等待时间增长；不以单机
      wall-clock 微基准作为正确性 gate。
- [x] 只修改 `packages/**`、共享文档、规则和任务文件；不修改 `apps/game002v2/**`、
      `assets/crave/**` 或任何 Crave ZIP/manifest。
- [x] 浏览器视觉、长时间 FPS、温升和内存验收由用户执行；执行报告不得把自动化测试写成
      浏览器已通过。

## 2. 范围

### 包含

- `packages/rendercore/src/reel` 内部 rolling visual descriptor/view、slot mode、target
  preparation、landing commit、cancel/destroy ownership 和 stopped update 策略。
- `ReelSymbolRegistry` 对 exact state texture、scale、renderPriority 和 empty kind 的单一只读
  路由；不在 reel 中维护第二份 symbol 表。
- `RenderSymbol`、Spine/VNI/value controller 所需的最小 readiness seam，使 detached target
  occurrence 可在 landing commit 前报告 ready 或失败。
- standard reel、legacy grid-cell 的相同底层行为，以及 dimming/render order/snapshot/
  occurrence API 的兼容适配。
- RenderCore 自包含 fake texture/player 测试、生命周期计数测试、README 和最小长期规则。
- 一份用户执行的 Crave 手动性能/视觉验收清单；若实现确实需要 Crave opt-in，则只在该文档
  写出 exact 手动修改，不由执行会话修改 app/assets。

### 不包含

- 不修改 `apps/**`、`assets/**`、下载目录、production ZIP、YAML、生成物或 lockfile。
- 不在 RenderCore 硬编码 Crave、CN、6×9、54 symbols/s、具体 symbol code、tier 或业务 value。
- 不改变服务器 scene、公开本地轮带、local phase random、RNG 或 target strip 合同。
- 不把 rolling view 暴露为 `SymbolRender`，不允许 win/appear/cascade/transfer/clone/value API
  操作轻量 Sprite。
- 不让缺少 exact spin state texture 的 symbol 猜 normal、抓 Spine 帧或生成运行时模糊图。
- 不把现有 `RenderSymbolPool` 当成本任务主要方案；当前 pool release 会销毁 animation/value
  player，不能消除滚动阶段不必要的完整 symbol 构造。standard reel 既有 pool public 行为必须
  保持兼容。
- 不顺手重写 CellSpin、ReelSpin、grid-cell plan、state machine、Spine runtime 或 image-string
  renderer。
- 不设未经真机数据支持的固定 FPS、heap MB 或单次构造毫秒门槛。

## 3. 制定计划时的基线

```text
UTC: 2026-08-15T03:29:32Z
HEAD: add512b0a304b167196529da8e29e1b5020eb422
branch: detached HEAD（HEAD、main、origin/main 指向同一提交）
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/game002.md`、
  `docs/agent-rules/loading-ui.md`；`packages/rendercore` 下没有补充 `AGENTS.md`。
- `RenderGridCellReelSet.createRuntimeCell()` 当前为每个 cell 创建一个 `visibleRows=1` 的
  `RenderReel`，默认含 `windowY=-1,0,1` 三个 slot；Crave layout 当前是 6×9，因此共有
  162 个 slot，其中 stopped 时只有 54 个 `windowY=0` 可见。
- `RenderReel.renderAtY()` 当前每次更新都对三个 slot 调用 `syncSlot()`；code 改变时完整
  `RenderSymbol` 被 destroy/create/init，code 相同则只更新 presentation value。
- grid-cell package runtime 当前没有给每个微型 reel 传 `RenderSymbolPool`；standard reel set
  的 pool 属于已有可选能力。
- `RenderReel.updateVisibleSymbols()` 当前无条件 update 全部 slot symbol，包括 stopped 时不可见
  的上下 buffer。
- `RenderSymbol` 构造会创建完整 Pixi layer/state machine/value controller，并立即解析当前
  animation；official Spine player init 会加载缓存 texture，但仍为 occurrence 构造 atlas、解析
  skeleton data 和创建 Spine instance。
- CN `setPresentationValue()` 当前在进入静态 `spinBlur` 前即可启动 tier Spine 和
  image-string 的异步构造；进入 spinBlur 只隐藏 active player，不清除该 target value owner。
- Crave reel timing 当前为 `speedSymbolsPerSecond=54`，但该精确值只作为问题基线和用户人工
  验收输入，不进入共享实现或 shared fixture。
- `apps/game002v2/src/performance-trace.ts` 的 completed spin records 当前保留在 `spins` Map；
  这是 app 范围内的独立小型累积点，本任务不修改，只在 Crave 手动文档中列为可选清理项，
  不把它混同为主要 rolling churn 根因。

## 4. 需求解释与关键决策

### 需求解释

- “spin 时只需要模糊状态”表示 rolling occurrence 不是完整业务 symbol。它只需要当前 code 的
  exact spin texture、几何、层级和 dimming；normal/win/value/attachment 等能力直到目标落停才
  有意义。
- “构造一个特定状态的”不能只给现有 `RenderSymbol` constructor 增加初始 `spinBlur` 参数；
  那仍会分配完整 layer/controller/state machine，并允许后续代码误把 rolling object 当成 settled
  occurrence。
- target preparation 与 landing commit 必须分离：服务器目标已知后可以在滚动期间准备最终
  occurrence，landing 只做经过验证的显示树交换；targetless continuous spin 不提前猜目标。
- 若慢设备上 target 尚未 ready，cell 保持最后的 rolling blur/clip 并进入明确
  `landing-pending` 内部状态；ready 后再原子 commit。不得先显示透明 normal 或无数字 CN。

### 关键决策

1. **每个 ReelSlot 持有稳定 lightweight rolling view，不持有 rolling RenderSymbol。**
   - rolling view 由一个稳定 root/Sprite 组成，创建 slot 时一次分配。
   - 每帧只更新 exact texture、anchor/scale、位置、visible/renderable、tint 和 z-order。
   - rolling view 不实现 state/value/playback/clone/transfer API，也不进入 symbol pool。

2. **registry 提供内部 immutable rolling descriptor。**
   - descriptor 至少包含 `kind/code/texture/scale/renderPriority`，只接受 exact `spinBlur`。
   - descriptor 从现有 texture set/manifest validation结果产生，不重新解析路径或复制资源表。
   - empty code 不创建 Sprite 内容；unknown/missing texture 在 plan start 前失败。

3. **slot identity 同时包含 mode，而不只包含 code。**
   - 内部模式至少区分 `empty | rolling | settled | landing-pending`。
   - 只有 `settled + same code + compatible value/state` 才能走现有完整 symbol 复用逻辑。
   - `rolling CN -> settled CN` 必须提交 prepared完整实例，即使 code 与前一帧相同。

4. **最终 occurrence 使用 detached prepare/atomic commit。**
   - target-aware start/settle 对选中 cell 的最终 visible code/value/state完整预检，然后创建或安全
     复用一个 detached target symbol。
   - readiness 覆盖 active normal Spine/VNI、CN tier player、image-string display 和 exact slot
     attachment；manual/static texture立即 ready。
   - update 不 await Promise；它记录单个可取消 preparation，并在后续 tick 观察 settled result。
     rejection 在同一 owner 上转为显式 reel error并触发既有 fail-stop。
   - commit 前旧 settled occurrence 已按 spin stale 合同失效；commit 后才对外暴露新 exact
     occurrence并请求 landing state/appear。

5. **stopped 只保留 visible settled symbol。**
   - buffer slot 可保留 code 和 lightweight Sprite 供下一次滚动，但 stopped 时隐藏且不 update。
   - `getVisibleSymbol*`、SymbolArea、cascade、transfer 和 presentation只读取 settled visible slot。
   - rolling snapshot 继续公开 code/geometry/phase等安全诊断；不得用 fake `RenderSymbol` 填充
     `snapshot.symbol` 来维持旧测试形状。

6. **pool 与 lightweight path 正交。**
   - 既有 standard pool仍可用于 settled symbol的 acquire/release。
   - grid-cell 是否给 settled symbol启用受限 pool不是本任务必要条件；除非计数测试证明需要，
     不扩大 public pool配置或让 app opt-in。
   - 不改变 `resetForPoolRelease()` 现有彻底清理合同来偷偷保留 CN/Spine player。

7. **性能验收使用确定性计数，真机体验由用户验收。**
   - 测试注入 registry/player factory counters，证明 rolling 距离从 N 增长到 10N 时完整 symbol/
     player创建数不增长。
   - stopped update只命中 visible settled symbols；cancel/destroy后 active/pending owner归零。
   - 真机记录帧时间、heap走势、GC pause和温升；不把 desktop fake runtime耗时外推到手机。

## 5. 职责与生命周期合同

- **ReelSymbolRegistry**：唯一拥有 code 到 prepared texture/scale/priority/full-symbol factory 的映射；
  提供 strict rolling descriptor，不解释业务 symbol。
- **RenderReel**：拥有 slot mode、rolling view、target preparation和显示树 commit；spin strip仍只决定
  code/value序列，不拥有 server reel。
- **RenderSymbol**：只代表 settled/可操作 occurrence；提供最小可等待 readiness，不知道 reel phase
  或 Crave。
- **Spine/VNI/value controller**：报告本 occurrence 的 init ready/error；destroy/abort 后的旧异步结果
  不能重新挂载 display。
- **RenderReelSet/RenderGridCellReelSet**：继续拥有运动、cell cadence、mask、dimming、landing edge和
  area occurrence；通过统一 slot visual root应用 tint/order，不直接操作 rolling Sprite私有字段。
- **资源所有权**：slot拥有 rolling view；preparation owner拥有 detached target；commit 后 slot拥有
  settled symbol；cancel/replacement/destroy按当前 owner恰好一次释放。
- **失败策略**：prepare前完整校验；异步失败 fail-stop；不显示 placeholder、不回退 normal texture、
  不复用上轮数字、不静默延后整轮完成。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/reel/render-reel-rolling-view.ts
packages/rendercore/tests/reel/render-reel-rolling-view.test.ts
packages/rendercore/tests/reel/render-reel-landing-preparation.test.ts
docs/crave-task213-manual-performance-verification.md
tasks/213-rendercore-lightweight-reel-rolling-visual-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/src/reel/render-reel-set.ts
packages/rendercore/src/reel/symbol-registry.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts
packages/rendercore/tests/reel/render-reel.test.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/tests/reel/render-reel-set.test.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
packages/rendercore/tests/symbol-value-presentation/render-symbol-value-controller.test.ts
packages/rendercore/README.md
docs/agent-rules/shared-game-runtime.md
```

最终实现若能以更小文件集满足合同，应缩小而不是机械修改全部预计文件。新增 public export 只有在
readiness确实需要跨内部模块暴露时才同步 `src/reel/index.ts`、`src/symbol/index.ts` 和根 index。

### 原则上不应修改

```text
apps/**
assets/**
packages/logiccore/**
packages/gameframeworks/**
packages/vnicore/**
pnpm-lock.yaml
根工具链配置
```

若 readiness 无法通过 rendercore现有 player合同实现而必须修改 `packages/vnicore`，执行会话先停止
说明，不得自行扩大范围。若 Crave 需要 opt-in/config/API接线，只写入手动文档，不修改 app。

## 7. 实施步骤

1. **建立计数基线和 slot contract测试**
   - 用自包含 registry/fake player记录 full symbol create/destroy/init/update、rolling descriptor lookup、
     settled commit和pending owner数量。
   - 固化当前 visible scene、方向、local phase、target injection、dimming和render order预期。

2. **实现 registry rolling descriptor与稳定 view**
   - 增加 exact spinBlur descriptor读取和一次分配的 rolling root/Sprite。
   - 覆盖 empty、composite state texture、scale、priority、缺资源和destroy。

3. **重构 RenderReel slot mode**
   - 将 moving render path改为 rolling descriptor commit，不调用 full-symbol `syncSlot()`。
   - stopped只保留 visible完整 symbol；buffer隐藏且不进入 animation update。
   - 调整 snapshot/internal visual-root seam，使grid dimming/order不依赖 `slot.symbol` 必然存在。

4. **实现 target preparation与readiness**
   - 为 manual/Spine/VNI/value display建立统一最小 ready/error观察点。
   - start/settle时准备每个最终 visible occurrence；同一请求幂等，替换/cancel/destroy使旧结果 stale。
   - landing尚未ready时保持rolling视觉；ready后一次性挂载、设置value/state并发布 occurrence。

5. **接回 grid-cell/standard行为**
   - 保持 start/stop cadence、low-FPS slicing、clip、dimming、priority和landing appear。
   - 验证selective spin未选cell identity不变，连续预转不猜target，cascade/transfer只见settled symbol。
   - 验证同code、相邻多CN、同档/跨档value均不会绕过 rolling→settled commit。

6. **补齐cleanup和性能不变量**
   - 覆盖prepare pending时cancel、连续settle替换、async reject、destroy、pool enabled/disabled和empty。
   - 断言rolling持续时full symbol/player创建数为0；每轮最终新建上限与selected visible target数相关，
     与滚动帧数/距离/服务器等待时长无关。
   - 断言stopped每tick只update visible settled symbols，隐藏buffer update为0。

7. **文档与Crave人工交接**
   - 更新RenderCore README和最小shared runtime规则，说明rolling不是SymbolRender及prepare/commit边界。
   - 新增Crave人工文档：默认应无需接线；列出长时间真机验收、CN数字复验和可选
     `performance-trace.ts` completed record清理建议。若发现必须opt-in，文档给出exact手改路径/
     API/验证，仓库内app仍保持未修改。

8. **定向验收和报告**
   - 执行第8节L2命令，检查diff只落在允许范围，生成UTC中文执行报告。
   - 报告单列用户尚未执行的浏览器验收，不声称性能已在手机确认。

## 8. 测试与验收

### 自动化覆盖

- rolling跨不同/相同code、长距离、连续等待均复用固定Sprite且完整symbol创建为0；target
  initial/continuous/selective只准备selected final occurrence，未选identity不变。
- rolling→settled同code仍commit；相邻CN分别拥有独立settled symbol和正确数字；覆盖同档、跨档、
  prepare乱序、cancel/destroy后的late async结果。
- stopped只update `windowY=0`；moving不更新隐藏full symbol；缺texture、unknown code、非法metadata、
  prepare失败均无半提交。
- dimming、mask、priority、appear、snapshot、stale occurrence、cascade/transfer与pool开关回归；
  destroy后active/idle/pending owner均为0。

### 验收级别

使用 `L2`：核心改动集中在 `@slotclientengine/rendercore`，但会改变 standard/grid-cell reel的共享
内部生命周期并影响 Scene Layout/GameFrameworks直接消费者；不修改public业务输入、schema、生成物或
lockfile，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter game002v2 typecheck
git diff --check
```

`game002v2 typecheck`只验证未修改consumer仍兼容，不授权修改 `apps/game002v2`。失败先最小化；只有
public type确实变化才检查直接consumer，不运行根级全仓命令。

### 用户浏览器验收

执行会话不启动或代替真实浏览器验收。用户按手动文档至少完成：

1. 手机连续运行 BaseGame spin/cascade/FreeGame 30分钟以上，记录开始、10/20/30分钟的FPS、长帧、
   JS heap（浏览器支持时）、GC pause和机身温升。
2. 使用可重复服务器输入复验最终盘面，重点覆盖水平/垂直相邻CN、同tier/跨tier数值、多次相同RNG；
   每格数字必须稳定存在且正确。
3. 检查spinBlur、dimming、anticipation、landing cadence、appear、win、remove、dropdown/refill、
   transfer和mode transition无视觉回归。
4. 区分两种结果：heap单调增长表示retention仍需查；heap锯齿回落但随温升掉帧更符合持续CPU/
   allocation造成的GC与thermal throttling。

### 独立验收建议

`建议`。风险集中在异步prepare/destroy、exact occurrence identity和共享standard/grid-cell生命周期。
独立复验只需重跑rendercore test/typecheck，并审阅三个不变量：rolling不创建full symbol、landing无
半提交、cancel/destroy无late async污染；不代替用户浏览器验收。

## 9. 环境与依赖

- 使用Node 24和pnpm；不新增依赖或修改lockfile。缺依赖时执行
  `CI=true pnpm install --frozen-lockfile`，实际下载失败后才按仓库约定设置代理。
- shared fixture不得读取 `assets/crave`；Crave资源只用于用户人工验收。

## 10. 文档、规则与Crave边界

- `packages/rendercore/README.md`记录rolling/settled对象模型、readiness、snapshot和pool关系。
- `docs/agent-rules/shared-game-runtime.md`只增加稳定跨任务不变量：exact spin texture lightweight
  rolling、final occurrence prepare/commit和隐藏buffer不更新；不写Crave精确尺寸/速度。
- 不修改 `docs/agent-rules/game002.md`中的资源事实，除非实现发现原合同表述必须澄清；即使更新规则，
  也不得修改Crave app/assets。
- `docs/crave-task213-manual-performance-verification.md`明确“RenderCore改动默认透明，无Crave接线”；
  若确需手动接线，给用户最小diff说明但不代改。可选trace Map清理与renderer改动分开标注。

## 11. 执行报告

完成实现后创建：

```text
tasks/213-rendercore-lightweight-reel-rolling-visual-<utctime>.md
```

报告简要记录最终对象模型、实际文件、full symbol/player计数前后、自动化命令、计划偏差、Crave文件
零修改检查、用户浏览器验收待办和剩余风险；不收集无关全仓coverage或伪造真机性能结论。

## 12. 风险、假设与待确认

### 风险

- target player在极慢设备上未能在计划落停时刻ready；内部`landing-pending`必须保持正确rolling
  视觉且不能让整轮提前complete。
- 现有测试或内部diagnostics可能把moving slot的`RenderSymbol`当成可操作对象；应迁移到code/
  phase/visual snapshot，而不是用fake full symbol兼容。
- Spine/VNI readiness若没有足够窄的现有seam，可能诱发跨`packages/vnicore`扩张；发生时必须停下说明。
- GPU driver对大量player destroy的释放可能延迟；对象计数正确仍不能替代手机heap/GPU/温升验收。

### 假设

- production symbol package已为rolling可出现的全部非空display symbol准备exact `spinBlur` texture；
  缺失按现有strict合同失败。
- spin期间不需要通过public SymbolArea取得rolling occurrence；对外可操作identity只在settled存在。
- Crave不需要新增配置即可消费RenderReel内部优化；若不成立，按手动文档交接而不修改app。

### 待确认

无。浏览器性能结果是执行后的用户验收项，不是实施前的设计阻塞。

## 13. 完成清单

- [x] rolling不构造完整symbol/player/value，landing原子commit，stopped隐藏buffer update为0。
- [x] standard/grid-cell及dimming/order/cascade/transfer/appear兼容，异步ownership测试通过。
- [x] diff只含packages/docs/tasks且Crave app/assets零修改；L2计数证据写入UTC报告。
- [x] Crave手动文档已交付，浏览器验收明确待用户执行。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、shared/game002规则、本计划和任务79的既有pool合同；
2. 重新核对HEAD与工作区，保留用户已有修改；
3. 先写计数/生命周期回归，再实现rolling descriptor、slot mode和prepare/commit；
4. 不修改任何 `apps/**` 或 `assets/**`；需要Crave接线时只更新手动文档；
5. 重大public API、vnicore依赖或schema扩张时停止说明；运行L2并生成报告；
6. 不执行用户保留的浏览器验收；除非明确要求，不commit、不push、不创建PR。
