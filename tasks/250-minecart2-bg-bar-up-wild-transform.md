# 250 minecart2-bg-bar-up-wild-transform 任务计划

## 1. 目标与完成定义

### 目标

在 `/Users/zerro/gitee.com/piximinecart2` 的 Minecart2 当前 `bg-bar` 流程中接入 `up` 与
`wild` 两种落点变化表现，并先在 slotclientengine 建立所需的通用 RenderObject 地址池能力：中央
`feature.json` 的 `Feature` 播放完成后，在服务器组件 `pos` 指定的仍在滚动的 cell 上播放
`topick.json` 的 `Topick_Start -> Topick_Loop -> Topick_End`。Up 等全部轮子停稳后继续 Loop 0.5 秒，
再播放 End，并在 End 完成后按服务器最终 scene 一次性提交目标 symbol；Wild 仍在对应列落停后结束，
额外在 topick 下、主转轮 symbol 上显示 WL，并在结束边界切换到正式盘面 WL 的
`appear -> normal`。

### 完成定义

- [ ] `bg-up` 使用其顶层 `pos` 与唯一 `usedScenes` 最终 scene；样例 `(0,1)、(0,3)、(1,4)`
      分别按最终 scene 从 `7` 变为 `4`，不硬编码这些数值或升级表。
- [ ] `bg-addwilds` 使用其顶层 `pos` 与唯一最终 scene；样例 `(2,0)` 按 game config 的 exact
      `WL` code 从 `10` 变为 WL，不硬编码 `0`。
- [ ] up/wild 都在中央 `Feature` 完成后，为全部目标 cell 同时启动 `Topick_Start`，完成后进入
      `Topick_Loop`。Up 等全部列真实落停并额外等待 0.5 秒后统一播放 `Topick_End`；Wild 在各自列
      真实落停后独立播放一次 `Topick_End`。
- [ ] up 等全部目标 `Topick_End` 完成后一次性原子替换为最终 scene symbol并清理 topick；wild 在
      `Topick_Start` 完成后显示 normal WL 预览，`Topick_End` 完成后以正式盘面 WL 替换被压住的
      source symbol，移除预览并播放一次 `appear`，随后明确回到 `normal`。
- [ ] normal 及其它 feature、首次初始化、0.5 秒普通 feature landing gate、中奖、BO collection、
      award 与 mode transition 既有行为保持；只有带 exact `bg-up`/`bg-addwilds` 的 up/wild 轮次改用
      Feature 完成边界与受控变化 landing。
- [ ] RenderCore canonical factory address 只保留 `create({ pooled?: boolean })`，默认创建永久对象；每个地址只有
      一个空池起步、`pooled: true` 时按并发峰值惰性增长；两者统一调用 `RenderObject.destroy()`，底层分别永久释放或自动复位回池，
      runtime destroy 永久释放池实例。
- [ ] WL 程序实例同样由 active Symbols package 的 canonical symbol factory address 创建，不由 app
      读取 manifest bytes、创建 SymbolPlayer 或维护第二份 symbol 资源表。
- [ ] slotclientengine 中实际变更的 shared 源码/测试先完成，再逐文件同步到 piximinecart2；不覆盖外部
      rendercore 已有的 `-1` rolling hole 修复。
- [ ] 自动测试与真实浏览器分别完成合同和视觉验收；执行结束生成 UTC 中文报告。

## 2. 范围

### 包含

- RenderCore presentation 层通用 RenderObject pool、复位、stale、detach、destroy 合同。
- Scene Layout canonical resource factory 的 `create({ pooled })`，以及 Symbols binding 下 exact symbol factory address。
- 地址创建的 topick/WL、全局 main reel top layer、stable cell anchor 与明确层内 order。
- Minecart2 up/wild server component 选择、最小位置/scene解析、immutable round operation、Feature gate、
  standard `ReelSpinSession` 逐列落停和 settled mutation。
- 主仓 shared package 定向测试、外部 app fixture/controller/handler/resource 测试、README 与执行报告。
- 对用户提供的 up/wild GMI 样例做精简 fixture，保护真实 parser -> compiler -> handler 链路。

### 不包含

- 不实现 `coin/nail/collect/jackpot/bonus/scatter/expand` 的落点玩法，也不改变传送带 queue 规则。
- 不修改服务器协议、protobuf、真实轮带、请求、下注、金额、win group 或 BO/BonusGame 业务。
- 不增加复杂服务器业务校验、升级映射表或 wild 数值表；只做执行所需的 component、pos、scene、shape、
  bounds、唯一性和 exact WL code 检查。
- 不把 `bg-up`、`bg-addwilds`、up/wild、WL、Topick 动画名或 Minecart2 component 写入 shared package。
- 不新增 RenderCore gameplay plan/DSL、callback predicate、raw Container/Spine/SymbolPlayer 或路径 fallback。
- 不修改 Scene Layout/Symbols manifest schema、delivery、production bytes、assets map、生成器或 lockfile。
- 不迁移现有 feature icon、Car 或其它程序资源到新池；新池的首个业务 consumer 仅为本任务的 topick/WL。
- 不修改仓库内 `apps/game003v2`；该 app 仍遵守当前“传送带暂停”合同。

## 3. 制定计划时的基线

```text
UTC: 2026-08-26T05:59:30Z
slotclientengine HEAD: 7530d40c31c1d8d3ddcaad2ea5a5f996c4198687
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean
piximinecart2 HEAD: 9e1501477f323d420956468e6476781b8e6e3db3
piximinecart2 branch: rgs
piximinecart2 git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、外部项目根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout,game003}.md`；目标源码目录没有补充 `AGENTS.md`。
- 仓库中没有 task 237 的计划/报告；task 239 与外部当前代码确认 task 237 的结果位于 commit
  `074de42` 及后续 `feature-bar-conveyor.ts`：Car 到达中心后把 feature image 挂入单例 program
  `feature` Spine 的 `Icon`，播放 exact `Feature`，普通轮当前以 0.5 秒 gate 放行落停。
- `FeatureBarConveyor` 当前拥有初始化/普通轮、上一 queue `features[0]`、variant、pickup、Car、中央
  Feature、cancel/destroy；`round-adapter.ts#land()` 在 gate 后用 `area.spin.land()` 一次落完整盘。
- `round-compiler.ts` 当前只把最后触发的 `bg-spin|bg-addbo` scene 编译为 `slot:spin`，因此用户样例的
  `scenes[1]` 尚未进入 final plan；win/BO 也仍基于变化前 scene。
- LogicCore 已有 `LogicComponent.raw`、`getComponentScenes()`、`parseExactPositionPairs()`、
  `createSlotOperationSnapshot()` 和 immutable v2 finalizer；本任务无需新增 ChgSymbols2 专属 parser。
- RenderCore 已有 `getReelSpinSessionController("main")`：`SpinningReel.land()` 可逐列 await 并在 resolve
  后返回 settled `SymbolGroup`；这比给 area spin factory加入业务 callback更符合现有 direct/session API。
- RenderCore 的 runtime resource address目前只有 caller-owned `create()`；没有通用 pool，也没有
  canonical Symbols program factory。`RenderObject.destroy()` 是永久销毁，不能被静默改义为回池。
- 当前 delivery 的 canonical 资源事实：
  - `gamelayout:/resource/spine/topick` 指向 `topick.json + specialfeature.atlas`；exact animations 为
    `Topick_Start/Topick_Loop/Topick_End/Topick_Line`，Spine `4.3.23`；
  - active binding id 为 `minecart2`，WL manifest含 `normal` 与 `appear`，其中 `appear` 播放 exact
    Spine `Start`；
  - main reel 为 5x5、cell `172x130`，已有 `gamelayout:/reel/main/layer/top` 与 stable cell anchor。
- 两份 `packages/logiccore` 源码当前一致；两份 rendercore 除外部 `render-reel.ts` 及其测试已有
  `-1` rolling hole修复外，相关 pool/address文件一致。同步必须只覆盖本任务变更文件或先合并该 drift，
  不能用整目录复制回退外部修复；`.DS_Store/.turbo/dist/node_modules/coverage` 不参与 parity。

## 4. 需求解释与技术决策

### 需求解释

1. 当前玩法仍由既有 `FeatureBarConveyor` 的初始化/上一 queue规则决定；server history中的 exact
   `bg-up`/`bg-addwilds` 是本轮落点变化证据。两者同时出现、与当前 up/wild玩法不匹配或缺最终 scene时失败。
2. 组件顶层 `pos` 是扁平 x/y pair；`basicComponentData.usedScenes` 必须选择唯一最终 scene。compiler只在
   pos处取得目标 code/value，并确保非 pos cell没有未表现的变化；这属于最小执行完整性，不建立升级表。
3. app定义两个 exact scene-landing operation kind；operation保存 render-ready landing snapshot、pos和最终
   output，单一 handler在 Promise 完成前拥有 Topick、逐列 settle与最终 scene commit。Wild 的变化与逐列
   landing交叠；Up 明确拆成全部列落停、0.5 秒观察、统一 End、End 完成后一次性 replacement 四个阶段。
4. 无 up/wild变化继续编译现有 `slot:spin`。带变化时后续 win、award、BO collection与transition都以
   operation final output为输入，不再读取变化前 scene。
5. up/wild 不再在中央 Feature 播放 0.5 秒后提前落停：先完整等待 exact `Feature`，再准备全部 cell effect并
   等全部 `Topick_Start` 进入 Loop，之后才按既有 left-to-right/stagger开始逐列 land。Up 的额外 0.5 秒从
   全部 `land()` resolve后开始计算；其它 feature保留既有 gate。
6. Wild 同一列多个目标 cell在该列 `SpinningReel.land()` resolve后并行结束，不同列按真实落停先后结束；
   Up 的全部目标 End 与 replacement不按列拆分。

### 关键决策

1. **池与永久对象统一使用 `RenderObject.destroy()`。**
   - `resource-factory.create()` 保持永久 caller-owned语义，`destroy()` 真正销毁。
   - `create({ pooled: true })` 仍直接返回普通 `RenderObject`；其 `destroy()` 幂等且句柄随后 stale，底层实例经 stop/cancel、mount
     cleanup、transform/visibility基线复位后回到该 factory address唯一 idle bucket。调用方不接触第二个归还接口。
   - 复位失败的实例永久 destroy并从池移除；runtime destroy销毁 idle/acquired/in-flight并使已取句柄 stale。
2. **池由 canonical factory address定桶。** 不接受业务 pool id、预热数量或 max；空池惰性创建并保留
   高水位数量。带 `instanceId` 的 live addressed object不进入池，避免一个 identity跨池化句柄复用。
3. **新增 exact symbol factory address。** 形态为
   `gamelayout:/symbol-package/<binding-id>/symbol/<exact-symbol>`，typed endpoint从 package catalog创建 normal
   program RenderObject并统一通过create选择永久/池化；app只解析 `.../minecart2/symbol/WL`，不读取 code/texture/animation表。
4. **池模型在 presentation层，地址层只做 owner适配。** pool不了解 Scene Layout、WL或Topick；resource/symbol
   factory注入 create/reset/destroy，address controller以 descriptor.address拥有池和runtime cleanup。
5. **改用现有 ReelSpinSession。** start时保存一次 active session；landing handler用普通 for/await、host
   `context.delay()` 与每列 `land()`保持 left-to-right cadence。无需扩展 RenderCore area spin factory或复制 reel状态机。
6. **层与坐标仍使用 global address。** top layer从
   `gamelayout:/reel/main/layer/top` resolve，cell位置用 stable `getCellAnchor(pos)`；WL order低于topick，二者都
   高于 symbols。exact order保存在 Minecart2常量/测试，不写进shared或manifest第二份业务表。
7. **wild使用预览 WL 到正式 occurrence的明确 handoff。** preview只负责滚动阶段遮盖；End完成后先原子
   `replaceSymbols()`取得新的 exact settled WL，再移除/回池 preview并在正式 WL上 await `appear`、set normal。

## 5. 职责与合同

- **LogicCore**：继续提供通用 component/scene/position/snapshot/finalizer能力；不新增 Minecart2 parser，预计不修改。
- **RenderCore presentation**：拥有 pool底层实例、池化句柄stale、baseline reset、mount/playback/motion cleanup和destroy。
- **Scene Layout address runtime**：从 canonical manifest/catalog发布 resource/symbol factory，按address拥有唯一pool；
  不认识业务 component、动画编排或 symbol含义。
- **Minecart2 compiler**：拥有 component名、up/wild kind、最小数据解析、initial/final snapshot、WL exact symbol名
  与 operation顺序；不保存数值升级映射。
- **Minecart2 handler/controller**：拥有 Feature完成、Topick状态机、preview WL、逐列cadence、replace/appear/normal、
  variant/abort/next-spin/destroy cleanup；不接触raw display/player。
- **资源生命周期**：pool owner是 package runtime；池化句柄owner是当前 operation。全部对象先create/preflight，
  mount失败回滚已挂载对象；成功/失败/abort/cancel/destroy都调用一次destroy。盘面 borrowed symbol不destroy，
  replacement由 mutation area拥有。
- **失败策略**：unknown/wrong-kind address、非法/重复/越界pos、非唯一scene、unexpected target、pool stale/double-use、
  playback/settle/replacement失败均让当前operation fail-stop；已完成列不倒放，未完成列cancel并清理池化对象。
- **禁止行为**：不自动instance id、不共享一个active object给多个池化句柄、不在destroy后继续使用旧object、不按文件名/
  首项/default state猜资源，不隐藏pool exhaustion或播放错误，不从服务器scene推断真实轮带。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/presentation/render-object-pool.ts
packages/rendercore/tests/presentation/render-object-pool.test.ts
packages/rendercore/tests/scene-layout/runtime-address-pool.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/feature-symbol-transform.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/feature-symbol-transform.test.ts
tasks/250-minecart2-bg-bar-up-wild-transform-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/presentation/{index,render-object}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/src/scene-layout/{data/runtime-address,core/runtime-address,core/index}.ts
packages/rendercore/src/symbol/symbol-handle.ts（仅内部symbol program factory适配需要时）
packages/rendercore/README.md
docs/{gamelayout-runtime-addresses,rendercore-operation-first-layer-api}.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md

/Users/zerro/gitee.com/piximinecart2/packages/rendercore/**（仅同步上述实际变更文件及测试）
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/{feature-bar-conveyor,round-compiler,round-adapter}.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/{feature-bar-conveyor,feature-bar-resource,round-compiler,round-adapter,source-boundary}.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/fixtures/game003-gmi.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
```

若 RenderCore public types需要经 gameframeworks facade显式重导，可最小修改主仓及外部
`packages/gameframeworks/src/index.ts` 与 exports test；不得因此把实现复制到facade。

### 原则上不应修改

```text
packages/logiccore/**
apps/game003v2/**
assets/**
/Users/zerro/gitee.com/piximinecart2/assets/**
/Users/zerro/gitee.com/piximinecart2/packages/logiccore/**
/Users/zerro/gitee.com/piximinecart2/packages/rendercore/src/reel/render-reel.ts（保留既有hole drift）
apps/gamelayouteditor/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
AGENTS.md
```

执行时若需要新增manifest/schema、修改logiccore公共合同、改变普通area spin API、覆盖外部既有drift或修改生产资源，
属于明显范围扩张，必须先说明原因，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认双仓基线与资源事实**
   - 重核两仓HEAD/status、本计划、三份领域规则、task 239/current feature flow及rendercore drift。
   - 通过delivery manifest/map/metadata ZIP复核topick animations、WL normal/appear、binding id、top layer与5x5；
     若资源变更则使用新的exact合同或显式停止，不猜alias。
2. **在主仓实现通用 RenderObject 地址池**
   - 在presentation层建立generic pool、池化RenderObject façade、stale与reset；覆盖空池、并发增长、复用、mount/play/motion
     cleanup、reset失败、active/idle/in-flight destroy。
   - 扩展resource factory endpoint的`create({ pooled?: boolean })`，保持默认`create()`/instanceId兼容；按canonical address持有pool。
   - 从Symbols binding/catalog发布exact symbol factory，创建默认normal的program RenderObject；unknown binding/symbol、
     inactive/destroyed package或不支持状态显式失败。
3. **同步 shared package到外部项目**
   - 只同步主仓本任务实际修改的rendercore源码/测试/必要package文档；同步前后对这些文件做精确parity。
   - 保留外部`render-reel.ts`与测试的`-1`hole差异及忽略产物；若本任务最终也触及同文件，先把通用hole修复
     合并到主仓并通过原测试，再同步合并结果，绝不覆盖。
4. **编译 up/wild combined landing operation**
   - 从当前step最后landing component取得初始scene/value；exact选择零或一个`bg-up|bg-addwilds`，用
     `parseExactPositionPairs()`读取顶层pos、`getComponentScenes()`取得唯一final scene。
   - 生成up/wild exact scene-landing kind：payload只保存render-ready initial snapshot/positions/feature kind，output为
     最终snapshot；检查非pos无隐式变化、wild目标均为game config WL code，并让wins/BO/final closure消费output。
   - 把用户提供的up/wild样例压缩为真实GMI fixture，覆盖parser、source、operation kind、pos、initial/final output。
5. **接入 Feature gate、SpinSession 与 per-cell动画**
   - `FeatureBarConveyor`为当前round公开identity-safe Feature-complete barrier；up/wild注册operation host clock后
     等完整Feature，其他feature继续0.5秒，初始化/cancel/variant/destroy仍只结算一次。
   - adapter预转改由active ReelSpinSession拥有；普通landing复用同一left-to-right/stagger helper，up/wild handler先
     create pooled/mount并行播放Start->Loop，再逐列land。
   - 新controller处理目标：up等全轮停稳、再等配置的0.5秒、并行播放全部End，End全部完成后单批次replace；
     wild按列在Start完成显示normal preview，End完成后preview到settled WL handoff、appear once、normal；
     每个finally都detach/destroy。
6. **测试、文档与收尾**
   - shared测试保护pool与address public合同；app测试保护Feature/Topick/column/mutation顺序、normal回归、abort、
     partial failure、next-spin和destroy。
   - resource测试读取真实delivery证明topick与WL exact能力；source-boundary确保业务字面量未进入shared。
   - 更新RenderCore地址/第一层文档、最小领域规则和Minecart2 README；运行L2验收并生成UTC报告。

## 8. 测试与验收

### 测试原则

- shared测试只用自包含image/Spine/symbol fixture，不读取Minecart2 assets，也不出现bg-up/WL/Topick业务字面量。
- pool覆盖同address复用、不同address隔离、并发高水位、destroy后旧handle stale、默认create永久语义、instanceId拒绝池化、
  child/mount/play/motion复位、失败销毁和runtime destroy。
- app测试用可控Feature/Topick/SpinningReel Promise与host delay，不用真实wall-clock；明确断言各列land前后调用次数。
- up覆盖同列多pos和跨列pos；wild覆盖preview层级、Start后出现、End后replace、appear完成再normal。
- 失败测试覆盖Start/End/settle/replace/appear、abort、next-spin和destroy；已经commit的列不伪rollback，未commit列无池对象泄漏。

### 验收级别

`L2`：新增RenderCore public pool/symbol factory/address合同并由外部Minecart2直接消费，涉及跨仓同步、异步池化对象、
playback、mount、partial commit与destroy；不改schema、生成器、production asset、lockfile或根工具链，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation/render-object-pool.test.ts tests/scene-layout/runtime-address-pool.test.ts tests/scene-layout/runtime-address-mount.test.ts tests/scene-layout/render-object-factory.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/feature-bar-conveyor.test.ts tests/feature-symbol-transform.test.ts tests/feature-bar-resource.test.ts tests/round-compiler.test.ts tests/round-adapter.test.ts tests/source-boundary.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git diff --check && git -C /Users/zerro/gitee.com/piximinecart2 diff --check
```

第5条必须保留，因为它验证同步后的RenderCore distribution/export能被真实Vite consumer打包；第6条同时检查两仓，
不运行无关根级format/lint/test/build。

### 人工验收

1. up样例：中央Feature完整结束后，三个目标cell的Topick Start->Loop均在滚动盘面上；全部轮子停稳后
   保持Loop 0.5秒，再让三个目标同时播放End；End完整结束后三个symbol一次性变成最终目标，之后才进入wins。
2. wild样例：`(2,0)` Topick Start完成后normal WL显示在滚动symbol上方、topick下方；第2列落停并完成End后，
   source消失，WL无闪跳地播放appear并回normal。
3. normal、非up/wild feature、首次初始化、横竖屏切换、连续spin、网络取消与退出重进无时序回退、重复对象、
   stale句柄、永久滚动或视觉残留。
4. 慢帧/低FPS下Start、Loop、列land、End、replace和appear顺序不越界；多次触发后实例数量稳定在观察到的并发高水位，
   不逐轮增长。

### 独立验收建议

`必须`：涉及跨包public contract、地址identity、pool resource ownership、异步partial commit与destroy。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation/render-object-pool.test.ts tests/scene-layout/runtime-address-pool.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/feature-symbol-transform.test.ts tests/round-compiler.test.ts tests/round-adapter.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
```

## 9. 环境与依赖

- 两仓统一使用Node 24与pnpm；shell没有Node时按模板加载nvm并`nvm use 24`。
- 依赖缺失时只在对应仓执行`CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置约定代理重试。
- 不新增依赖、不修改lockfile、不切换npm/yarn；测试使用已有Vitest/Pixi/Spine fixture能力。

## 10. 生成物、文档与规则

- 不修改YAML、manifest、delivery或正式生成物，无generator/parity命令；`dist`仅由build生成验证，不手改、不提交。
- `docs/gamelayout-runtime-addresses.md`记录resource/symbol factory、`create({ pooled })`、pool identity、stale/destroy。
- 第一层文档与RenderCore README记录通用pool只管理RenderObject lifecycle，不拥有gameplay或盘面commit。
- 最小更新`shared-game-runtime.md`与`scene-layout.md`，固定canonical-address pool与symbol factory职责；精确
  Minecart2 component/动画/order留在app/tests/README，不写入根`AGENTS.md`。
- 外部README记录up/wild数据来源、Feature->Topick->column land->mutation流程和真实资源要求。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/250-minecart2-bg-bar-up-wild-transform-<utctime>.md
```

报告简要记录两仓基线、最终API/operation、实际文件、同步parity、六条自动验收、浏览器结果、计划偏差、
外部hole drift处理和剩余风险；不收集无关coverage、整仓矩阵或profiler统计。

## 12. 风险、假设与待确认

### 风险

- program WL与正式reel WL是两个player identity；handoff必须同anchor/scale/order并在同一提交边界切换，否则可能闪帧。
- Topick skeleton高于单cell，跨cell/转轮mask与不同方向布局的视觉覆盖只能在真实浏览器确认。
- Feature completion、variant change、响应、Start、逐列settle、End和next-spin可能同帧交错；epoch/AbortSignal/池化句柄
  必须共同阻止旧continuation影响新轮。
- Wild逐列commit后若后续列失败，遵循fail-stop不倒放；Up在End全部完成后才单批次commit，replacement前失败不留下部分升级。
- 外部rendercore已有主仓未含的hole修复；同步命令或格式化若误做整目录覆盖会产生回归，必须按计划做变更文件parity。

### 假设

- current feature与history component一致：up对应exact `bg-up`，wild对应exact `bg-addwilds`；其它feature不触发这两者。
- `pos`继续使用x/y pair且scene为x-first 5x5；WL exact symbol名与active binding id `minecart2`保持。
- `topick`继续是root runtime Spine resource，exact animations保持大小写；WL继续声明normal与appear。
- 用户所说“WL压住的symbol移除”表示在End完成边界由mutation area用final WL occurrence替换source，而不是提交hole。

### 待确认

无。资源、接口与样例语义均可从当前仓库和用户提供数据确定；若执行基线美术或协议改变，按strict contract停止说明。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、地址、operation、pool与资源生命周期符合计划。
- [ ] shared先修改、外部后同步，且外部既有hole修复未回退。
- [ ] 测试、README、长期文档和规则已按需同步。
- [ ] 指定自动化验收已通过。
- [ ] 自动化与真实浏览器验收已明确区分。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根`AGENTS.md`、本计划列出的三份领域规则和本计划；
2. 核对两仓Git基线、外部rendercore drift与delivery exact资源；
3. 严格按“主仓shared实现 -> 定向验证 -> 外部逐文件同步 -> app接入”顺序执行；
4. 小幅文件名/API适配在报告记录，重大schema/public范围扩张先停止说明；
5. 只运行本计划L2验收，浏览器结果不能由fake runtime或单测代替；
6. 完成后生成UTC中文报告；
7. 除非用户明确要求，不commit、不push、不创建PR。
