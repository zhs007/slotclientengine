# 147 game002-freegame-flow 任务计划

## 1. 目标与完成定义

### 目标

在任务 135 的 BaseGame cascade、WL/WM/CM 转换、CO relocation、CN collect 和正式
Crave 资源基础上，完整接入服务器 FreeGame round。客户端必须在整轮画面 mutation 前
严格编译 BaseGame 尾段、FG 触发、每次选择性 spin、AF 加次数、CO 收集、最终一次 CN
赔付和双向 mode transition，并按以下顺序表现：

```text
BaseGame 无其它中奖的 settled step
-> bg-triggerfg 的 WL win once
-> BaseGame -> FreeGame transition
-> 保留同一 settled scene
-> [fg-spin -> AF（如有）-> CO（如有）] × N
-> 最后一次 fg-win CN collect
-> BigWin popup 完整结束
-> FreeGame -> BaseGame transition
-> BaseGame 保留 FG 最终 scene
```

同时从原始 Symbols/Layout 输入确定性生成任务 147 Symbols 与 Layout，给 AF 增加
`fg-rollaf.number` 的 ImgNumber 展示，优化 Layout production ZIP，并以优化结果完整
替换 `assets/crave`。

### 完成定义

- [x] `bg-triggerfg` 只在当前 settled step 没有实际 `bg-win/bg-win2` 中奖组时生效； 它的唯一 `usedResults` 索引必须指向 `type=5` 的 WL result，先播放 result 中 WL 的现有 win once，不 remove/drop。
- [x] WL win 完成后播放 manifest 中 exact `BaseGame -> FreeGame` transition；切换 background/mode 时不重建 reel，继续显示触发 step 的同一 scene、value 和 occurrence identity。
- [x] 每个 FG step 严格读取 `fg-start.lastRespinNum/curRespinNum`；当前次数逐次加一， 剩余次数按“上一步剩余 - 1 + 本步 AF number”连续，最后一步剩余为 `0`。
- [x] `fg-spin` 只对当前盘面中非 CN、非 WL 的格子播放 grid-cell spin；本地公开轮带 只提供视觉 phase，服务器 scene 只覆盖本步可见落点。
- [x] `fg-spin.pos` 作为本步 feature result position set 严格解析，位置上的输出只允许 `CN/WL/CO/AF`；它不被误当成视觉 spin mask。
- [x] spin 全部落定后立即处理 AF：`fg-triggeraf` result、`fg-pos-af`、 `fg-rollaf.number`、`fg-af2cn.scene` 和 `fg-genafcn.otherScene` 严格一致；AF 显示原始正整数，不带 `x`，完成 exact Feature/Change 后原子变 CN。
- [x] AF 的 number 与同 step 的加次数字段、下一步 `lastRespinNum` 连续性一致；缺字段、 非正安全整数、位置/scene/value 漂移显式失败。
- [x] AF 完成后才检查 CO。`fg-vortex.pos` 按 `-1` 分段编译 source/target relocation； source 只允许当前 post-AF scene 中不会 spin 的 WL/CN，target 必须位于对应 CO 八邻域，batch 内 source/target/CO 不重叠。
- [x] FG CO 复用任务 135 的真实 once 与 transfer transaction：CO Feature 和 source Feature1 并行，随后 source Feature2 与移动并行；原格变 BN、target 接收完整 source occurrence/value、CO 原子变为 `fg-cogencn` 给值的 CN。
- [x] 一个 FG step 严格执行 `spin -> AF -> CO`；无 AF/CO 时不制造空动画或固定延迟。
- [x] 只有最后一次 spin、AF、CO 全部完成后处理 `fg-win`；result 只接受 CN cluster， 复用 BaseGame CN 的 Win_Start/Win/Collect/End、金额分配和 WL companion，但不 remove、不留下 holes，结束后恢复并保留最终 scene。
- [x] `fg-win` 完成后播放现有 award-celebration BigWin；该次 FG 退出等待 popup 真正 complete，再播放 `FreeGame -> BaseGame` transition，最终 reel 不重建且仍显示 FG 最终 scene。
- [x] 普通 BaseGame、任务 135 CO、WL/WM/CM、anticipation、cascade、next-spin cleanup 和 destroy trace 无回归。
- [x] task147 Symbols/Layout 完成 export/reimport，优化 ZIP 与 asset-groups JSON 生成；优化包完整替换 `assets/crave`，generated imports、map/hash/path/orphan parity 全部同步。
- [x] 完成 L2 自动化并生成 UTC 执行报告；浏览器/live 视觉验收由用户执行，不由 fake runtime、编译或单测代替。

## 2. 范围

### 包含

- `docs/crave/gameresults.json` 的 18-step round 作为协议样例和定向 parity 输入。
- logiccore 中性 immutable round plan 对同一 round 内重复 selective spin、非 remove terminal win、snapshot/occurrence continuity 和完整 preflight 的支持。
- rendercore coordinator 对显式后续 spin step 的调度，以及 grid-cell selective spin、 non-removing sequential collect 和 failure cleanup/destroy。
- scene-layout presentation surface 的 mode transition 能力；复用现有 directed transition player，不复制 package runtime 的 event/switch/settle 状态机。
- game002 的 `bg-triggerfg`、FG counter、spin、AF、CO、final win 业务编译和表现顺序。
- task147 Symbols authoring：完整重放任务 132/135 配置并给 AF 增加 exact state 与 ImgNumber node。
- task147 Layout authoring、production optimization、asset-groups、`assets/crave` 和 generated Vite imports。
- 直接相关测试、README、动画流程文档和最小领域规则。

### 不包含

- 不修改服务器 FreeGame 逻辑、RNG、真实轮带、bet/paytable、spin/collect 网络协议。
- 不用 `curGameMod/nextGameMod`、step 数量、金额或首个未知字段猜 mode；样例中 `curGameMod` 始终为 `basic`，业务只认严格 component contract。
- 不增加 FG 次数 UI；当前 Layout 没有对应 named node，本任务只编译和验证 counter。
- 不让 normal symbol 参与 FG 最终赔付，不把 `fg-triggerco` 的 type-5 trigger result 混入 `fg-win` 金额。
- 不把 `bg-*`、`fg-*`、CN/WL/CO/AF/BN、BaseGame/FreeGame 或动画名写进 shared package。
- 不复制 task135 transfer，不用 `applyScene()` 全盘重建、app-owned Pixi clone/timer、 CSS overlay 或静态延迟模拟 spin/transition/completion。
- 不覆盖 Downloads 原 ZIP，不手改 mapped payload、`assets.map.json`、generated TypeScript 或优化器输出。
- 不修改 game003、loading 99%/100%、root toolchain、workspace 配置或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-07-31T05:20:57Z
HEAD: 46ce3df970e58bbc6aa36008107e30956a994ea4
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 本规划会话读取了根 `AGENTS.md`、`tasks/templates/task-plan.md`、 `docs/agent-rules/game002.md`、`shared-game-runtime.md`、`loading-ui.md`、 `editor-artifacts.md`、`scene-layout.md`、任务 135 计划/报告及当前相关实现；范围内 没有更深层 `AGENTS.md`。
- 协议样例 `docs/crave/gameresults.json` 为 444,138 bytes，SHA-256 `4e3a891918445c7fd93cf74b586ac7caa404878a7083e7cf7adaca839003f835`。 当前样例事实：
  - 共 18 个 step；step 7 的 `bg-triggerfg.usedResults=[2]` 指向 type-5 WL；
  - step 8..17 为 10 次 FG spin，`curRespinNum=1..10`；
  - AF 在 step 8/15 分别 `number=1/2`；
  - CO 在 step 11/12/14/17 触发；
  - step 17 才有 `fg-win.usedResults=[1,2]`，两项均为 type-6 CN；
  - step 17 `lastRespinNum=0`、`nextStepFirstComponent=""` 且含 `ending`。
- 样例的 `fg-spin.pos` 只列本步 feature result positions，且落点均为 `CN/WL/CO/AF`；它不是所有实际播放 spin 的格子集合。视觉 spin mask 必须从当前 committed board 的非 CN/WL cells 派生。
- `fg-vortex.pos` 是 `sourceX,sourceY,targetX,targetY` 四元组并以 `-1` 分段； 样例 source 为 WL/CN，输出 source 为 BN、target 接收 source、CO 变 CN。
- 当前 `GAME002_ROUND_FLOW_PROFILE` 只支持一个 implicit initial `bg-spin` 加 cascade； `SlotRoundExecutionPlan`/coordinator 不能表达同轮后续 selective spin 或 terminal non-remove win。
- 当前 `Game002BackgroundPlayer` 只暴露 init/update/destroy； `SceneLayoutPresentationSurface` 不暴露双向 mode transition/overlay，但 `SceneLayoutPackageRuntime` 已有严格 prepare/request/event switch/settle/destroy 实现，应抽取复用而不是再写一份。
- 当前 grid-cell spin plan 已支持 `positions`；game002 runtime 只有 cascade refill selective 入口，尚无从完整 stopped scene 发起 FG selective spin 的 public surface。
- task135 已提供 generic relocation/release-only transaction 和 `CO.feature + WL/CN.feature1/feature2` 资源，FG CO 不需要复制底层能力。
- 当前 AF Spine 已有 exact `Feature`、`Change` 和 `Mult` slot，但 manifest 只配置 normal/dropdown/appear/remove，且没有 symbol-owned ImgNumber node。
- 当前 mapped roots：
  - `assets/crave/layout.manifest.json`： `74c429ef306f65ff3e2825e35aa0feb39e6ae420a4c90e2c7049c90b311fff09`
  - `assets/crave/assets.map.json`： `d35f62f82ed156ecd4d231577fc548552bb729674d569803c4c22d6e3958c7ec`
- 原始输入保持任务 135 的确定性来源：
  - `crave-symbols-fixed.zip`： `8e1d9655ff33b0827f41f671d021305d2211056e599368a93a2475a4bbe20835`
  - `crave-v2.zip`： `3a96ebe392133765e5b33c96769277b9c8a6c499cce75bf5ceabc59aadecda9d`
  - `crave-wl-num.zip`： `21f0aa5c1b720606e09c57640cad426b7ad32a1c90ce542a1fef3db81b8c6487`
- 任务 135 配对输出作为 parity 参照，不作为新的手工编辑源：
  - Symbols：6,223,098 bytes， `e59d9014e3ea802c647c1fd184b2d91c5b2817ed5c2bd2d0ee3bfa96b3c7d255`
  - Layout：9,862,244 bytes， `942262eaee15fe78796b9f8cff726be56b08d2932d30b7c8541eaa2081228d12`

## 4. 需求解释与技术决策

### 需求解释

- `bg-triggerfg` 是 BaseGame settled-step 的 terminal presentation，不是正金额 win 或 remove。它必须等该 step 的 refill/transform 完成且确认没有其它中奖组后播放 WL。
- 进入 FG 只切 Layout mode/background；同一 reel instance、scene、value 和 occurrence identity 跨 transition 保留。
- `fg-spin.pos` 表示 feature result set。所有当前非 CN/WL 格子播放 selective spin； 当前 CN/WL 保持 stopped presentation，不从服务器 scene 或 randomNumbers 推轮带。
- `fg-start.lastRespinNum` 是本步处理 AF 后的当前剩余次数； `curRespinNum` 是当前第几次 FG spin。若本步 AF number 为 `n`，则：

  ```text
  current.curRespinNum = previous.curRespinNum + 1
  current.lastRespinNum = previous.lastRespinNum - 1 + n
  ```

- AF 的 number 在 spin 落定边界写入 AF 的 symbol-owned ImgNumber；随后播放 `Feature` once、`Change` once，Change completion 才提交 AF -> CN。
- FG CO 输入是 post-AF snapshot，因此同一步新转出的 CN 可按服务器 `fg-vortex` 映射参与后续 CO；只有映射明确且 source 当时为 WL/CN 才接受。
- `fg-win` 是 terminal non-remove win；播放语义与现有 CN collect 相同，但结束后 occurrence 回 normal 而非 release，确保反向 transition 后仍显示完整最终 board。

### 关键决策

1. **扩展中性 execution plan，而不是写第二套 reel 状态机。** logiccore 增加显式 subsequent/selective spin step 与 non-remove win 合同；rendercore coordinator 调度这些 step。component 名和业务排序仍由 game002 immutable companion plan 注入。
2. **整轮先编译再播放。** game002 在 coordinator cleanup 或首个 spin 前编译全部 BaseGame + FG snapshots、counter、AF、CO、win 和 mode 边界；任一后续 step 非法时 整轮在画面 mutation 前失败。
3. **mode transition 复用 scene-layout 单一实现。** 抽取/复用 package runtime 的 directed transition controller，使 presentation surface 暴露 prepare/request/ snapshot 与顶层 overlay；共享层不认识 BaseGame/FreeGame。
4. **同 binding 不重建 reel。** skin prepare 严格确认两个 mode 绑定同一 Symbols、 reelSet/renderMode/geometry；transition switch 只提交 mode/background，业务 reel 保持 owner 和当前 scene。
5. **AF 复用唯一 digits dependency。** 从原始输入重放 task132/135 后，AF 增加 `feature/change` 与一个 raw-number ImgNumber node，绑定 exact `Mult` slot；WL/WM/CM 继续格式化 `x${value}`，AF 使用 `${number}`，不再引入第二套 glyph 表。
6. **FG CO 复用 generic relocation transaction。** 只新增 game002 compiler 差异： source 可混合 WL/CN，CO 固定输出 CN，输入 snapshot 为 post-AF；mask、move、 commit/rollback/destroy 继续属于 rendercore。
7. **FG 退出等待 popup 完整结束。** 仅 terminal FG completion 把 popup `complete` 作为反向 transition gate；普通 BaseGame win 的既有 awaiting-dismiss/next-spin 行为保持不变。

## 5. 职责与合同

- **logiccore**：拥有重复 spin step 的 immutable snapshot/occurrence continuity、 selected/held positions、terminal non-remove win、plan freeze 和完整 structural validation；不解析 game002 component 或动画。
- **rendercore slot-round/reel**：拥有 explicit spin step 调度、selective grid-cell spin、local phase、non-remove collect reset、update/cleanup/destroy。
- **rendercore scene-layout**：拥有 transition resource prepare、overlay、switch event、 background visibility、settle、rollback/destroy；presentation surface 只复用该能力。
- **gameframeworks**：只 re-export 中性 plan/target types；不新增 game002 分支。
- **game002 compiler**：拥有 component/result/counter/AF/CO/final-win 语义、模式 id resolver、严格顺序和 immutable presentation metadata。
- **game002 target**：把 plan step 映射到现有 runtime state/animation/transfer/popup/ mode API，不直接操作内部 display tree。
- **Editors/CLI**：Symbols Editor 拥有 AF state/ImgNumber closure；Layout Editor 拥有 dependency binding；gamelayoutpkgcli 拥有 WebP、map 重写和 asset-groups。
- **资源生命周期**：全轮 preflight；AF replacement 与 CO batch prepare 后才 start； Change/transfer completion 才 commit；transition、popup、next-spin、fatal、destroy rollback/release 未提交对象且 late completion 不得提交。
- **失败策略**：坏 result type/index、counter 跳变、partial AF/CO components、非法 position/symbol/value、scene continuity、缺 animation/slot/glyph/transition/binding、 map/hash/orphan 均显式失败。
- **禁止行为**：不猜 component/index/path/number/mode，不保留第二份资源表，不用 placeholder、首项默认、静默 alias、效果降级或服务器 randomNumbers。

## 6. 文件范围

### 预计新增

```text
apps/symbolseditor/scripts/build-task147-symbols.ts
apps/gamelayouteditor/scripts/build-task147-layout.ts
apps/game002/src/freegame-plan.ts
apps/game002/tests/freegame-plan.test.ts
apps/game002/tests/fixtures/game002-freegame-gmi.ts
tasks/artifacts/147/game002-s3-symbols-task147.zip
tasks/artifacts/147/crave-layout-task147.zip
tasks/artifacts/147/crave-layout-task147.optimized.zip
tasks/artifacts/147/crave-layout-task147.assets-groups.json
tasks/147-game002-freegame-flow-<utctime>.md
```

### 预计修改

```text
assets/crave/**
apps/{symbolseditor,gamelayouteditor}/package.json
apps/symbolseditor/scripts/build-task132-symbols.ts
apps/gamelayouteditor/scripts/build-task132-layout.ts
packages/logiccore/src/{slot-round-plan,index}.ts
packages/logiccore/tests/slot-round-plan.test.ts
packages/rendercore/src/reel/{render-grid-cell-reel-set,types,index}.ts
packages/rendercore/src/slot-round/{coordinator,index}.ts
packages/rendercore/src/scene-layout/{package-runtime,presentation-surface,types,index}.ts
packages/rendercore/src/symbol-cascade/**
packages/rendercore/tests/{reel,slot-round,scene-layout,symbol-cascade}/**
packages/gameframeworks/src/index.ts
apps/game002/src/generated/crave-layout-resources.generated.ts
apps/game002/src/{cascade-config,cascade-sequence,game-demo,game-adapter}.ts
apps/game002/src/{scene-layout-skin,skin-config}.ts
apps/game002/tests/{game-adapter,game002-round-transform,scene-layout-skin}.test.ts
apps/game002/{README.md,docs/animation-flow-and-timing.md}
docs/agent-rules/{game002,shared-game-runtime,scene-layout}.md
```

### 原则上不应修改

```text
docs/crave/gameresults.json
assets/game002-s3/**
apps/gamelayoutpkgcli/**
apps/game003/**
packages/{netcore,uiframeworks,gameloading*}/**
pnpm-lock.yaml
```

若执行需要修改 server parser 通用 raw schema、Layout manifest schema、optimizer、
lockfile 或更多 consumer，必须先说明实际缺口和直接影响，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认基线与建立协议 fixture**
   - 重核 Git、输入 ZIP/hash、mapped roots 和任务 135 parity。
   - 从 `docs/crave/gameresults.json` 建立 focused immutable GMI fixture，保留 18-step component/index/scene/otherScene/result/counter 关系，不复制为 production 配置。
   - 加 mutation helpers 覆盖 bad type/index、counter、scene continuity、partial AF/CO、 illegal source/target/value 和 premature/missing final win。

2. **扩展 logiccore 中性 round plan**
   - 为 implicit initial 后的 explicit spin 定义 input/output snapshot、visual positions、 held occurrence ids、replacement/continuity 与 required capability。
   - 允许 win step 显式声明 non-remove terminal policy；groups/amount/companion 保持既有 编译，output snapshot 与 input identity/value 相同。
   - 暴露受校验的 neutral builder/compile hook，使 game002 能追加 FG steps，但 shared plan 不出现 `fg-*` 或 symbol code 分支。
   - 保证旧 V1 base/cascade consumer byte-equivalent trace；非法 step index、重复位置、 snapshot 漂移、unknown capability 和非冻结 plan 失败。

3. **接入 rendercore explicit/selective spin 与 terminal collect**
   - coordinator 调度后续 spin step，target capability 缺失时 preflight 失败。
   - grid-cell runtime 从当前 stopped full board 对指定 cells 建 local-reel spin plan， 保留其它 occurrence/player/value，落点只用 plan output scene。
   - symbol cascade 对 `removePositions=[]` 的 sequential CN group 播放完整 win/collect/end 后回 normal，不 release occurrence、不制造 holes。
   - 覆盖 concurrent start、update failure、next-spin、fatal、rollback 和 destroy。

4. **复用 scene-layout mode transition**
   - 从 package runtime 抽取共享 directed transition driver，或让 presentation surface 委托同一实现；禁止复制 event drain、player 和 switch timing。
   - presentation surface 暴露 transition overlay、prepare/request/snapshot；同 symbols binding 时只切 mode/background，不接收或重建 reel。
   - game002 world layer 把 transition overlay 放在 reel/cascade 之上、popup 之下， update 同一 surface；skin prepare 严格验证 exact 双向边和共享 binding。

5. **编译完整 game002 FG plan**
   - 复用现有 BaseGame compiler直到 terminal no-win settled step；严格编译 `bg-triggerfg.usedResults -> type-5 WL`，保存 trigger presentation。
   - 逐 step 编译 `fg-start` continuity、`fg-spin` source/target/value、feature result positions，并从当前 board 派生非 CN/WL visual spin positions。
   - 编译 AF batch：trigger/result/position/number、AF presentation value、 `fg-af2cn` replacement、`fg-genafcn` CN value 和 counter parity。
   - 以 post-AF snapshot 编译 CO batch：`fg-triggerco/fg-vortex/fg-cogencn`、 mixed WL/CN relocation、BN replacement、CO->CN 和 value continuity。
   - terminal step 编译 `fg-win` type-6 CN groups与 `ending`；拒绝中途 win、final remove/dropdown/refill、normal-symbol payout 或 trailing step。
   - 完整冻结 plan 和 presentation metadata，并在任何动画前验证全部 scene/value/ occurrence/capability/resource/mode。

6. **接入 game002 presentation 顺序**
   - trigger step 等现有 BaseGame transform 完成；无普通 win 后播放 WL win once， 再 await enter transition，期间 reel 保持同一 scene。
   - 每次 explicit spin 落定后依次运行 AF Feature/Change/replacement，再运行 CO Feature/Feature1/Feature2/transfer；无 batch 时立即前进。
   - 最后运行 non-remove CN collect，保持 final scene；启动 BigWin 并等待 complete， 再 await exit transition，完成 `playSpin()`。
   - cleanup/destroy 统一清除 pending animation、prepared replacement/transfer、 transition、popup 和 Promise，已提交 final scene 不因 mode 切换丢失。

7. **生成 task147 Symbols、Layout 与优化交付物**
   - 从原始 Symbols + ImgNumber 重放 task132/135；新增 AF `feature -> Feature`、 `change -> Change`，并给 normal/appear/feature/change 配置 raw-number ImgNumber target，exact slot `Mult`。
   - export/reimport task147 Symbols，验证 WL/WM/CM/CN/CO 既有 states、唯一 dependency、 AF glyph/slot/state closure 和 edit round-trip。
   - 从原始 `crave-v2.zip` 替换两个 mode 共用的 task147 Symbols dependency， export/reimport task147 Layout，保持 geometry/background/popup/双向 transition。
   - 用 gamelayoutpkgcli quality 80 生成 optimized ZIP 和 asset-groups；从优化 ZIP 完整 替换 `assets/crave`，清理旧 orphan，并运行正式 generated import checker。

8. **文档与收尾**
   - 更新 game002 README/动画时序与最小 game002/shared/scene-layout 规则；不改根规则。
   - 记录输入/输出 ZIP、mapped roots 的 bytes/SHA-256、asset group/map/orphan parity。
   - 运行规定 L2 验收，生成 UTC 中文执行报告，人工/browser/live 项保持未完成状态。

## 8. 测试与验收

### 测试原则

- 覆盖 trigger 有/无普通 win、wrong result type/index、同 scene 跨 transition、FG counter 无 AF/加 1/加 2、selective mask、only allowed feature outputs、terminal condition。
- 覆盖 AF number text、Feature/Change completion、scene/value mismatch、prepare/update/ commit failure和 destroy。
- 覆盖单/多 CO、mixed WL/CN、1..N transfers、八邻域、collision、post-AF CN source、 value identity、atomic rollback。
- 覆盖 terminal CN+WL companion、non-remove、popup complete gate、双向 transition、 final scene 保留和普通 BaseGame awaiting-dismiss parity。
- 资源覆盖 AF exact animation/slot/glyph/state、task135 states、两 mode binding、双向边、 optimized map/hash/path/orphan 和 generated imports。

### 验收级别

`L2`。任务修改 logiccore/rendercore public execution contract、scene-layout presentation
surface、正式 Symbols/Layout/optimized ZIP、mapped assets 和直接 game002 consumer；
范围可由相关 shared packages、两个 editor、CLI 运行和 game002 界定，不改根工具链或
lockfile，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter symbolseditor build:task147 && pnpm --filter gamelayouteditor build:task147 && pnpm --filter gamelayoutpkgcli build && pnpm --filter gamelayoutpkgcli start -- --input tasks/artifacts/147/crave-layout-task147.zip --output tasks/artifacts/147/crave-layout-task147.optimized.zip --assets-json tasks/artifacts/147/crave-layout-task147.assets-groups.json --quality 80
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter symbolseditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter game002 typecheck
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter symbolseditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter game002 test
pnpm --filter symbolseditor --filter gamelayouteditor build
pnpm --filter game002 check:crave-layout-resources && pnpm --filter game002 release:check
git diff --check
```

### 用户浏览器/live 验收（由用户执行）

- Symbols Editor：导入 task147 Symbols，确认 AF raw number 在 normal/appear/Feature/ Change 的 exact `Mult` slot，数字不带 `x`；复验 task135 CO/WL/CN states 和 edit/export/reimport。
- Game Layout Editor：导入 task147 Layout，确认 BaseGame/FreeGame 共用新 Symbols， 背景、reel、popup、双向 transition、geometry 和 reimport 不变。
- game002 `skin=2`：用真实 payload 验证 WL trigger -> BG_FG -> 同 scene、10 次 selective spin、AF +1/+2、AF before CO、mixed WL/CN vortex、最后一次才 CN collect。
- 验证 BigWin 完整结束后 FG_BG，BaseGame 仍显示 FG final scene；复验 resize、 next-spin、failure cleanup、destroy、console 无 error/warn。

### 独立验收建议

`必须`。涉及跨包 public contract、正式 optimized ZIP/mapped assets、mode transition、
跨 display owner transaction 和 destroy。独立复验重点：

```bash
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter game002 test
pnpm --filter game002 release:check
git diff --check
```

## 9. 环境与依赖

- 使用 Node 24 和 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失才运行 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败才设置模板中的本地代理并重试原命令。
- gamelayoutpkgcli 需要现有 `cwebp`；缺失时显式报告，不伪造优化结果。
- 本任务预期不新增依赖、不改 lockfile。

## 10. 生成物、文档与规则

- task147 authoring 脚本生成 Symbols/Layout ZIP；optimizer 生成 optimized ZIP 与外置 asset-groups JSON。`assets/crave` 只从 verified optimized ZIP 完整更新。
- `game002-s3-symbols-task147.zip`、`crave-layout-task147.zip`、 `crave-layout-task147.optimized.zip`、asset-groups 和 mapped roots 均记录 bytes 与 SHA-256；ZIP 若受 ignore 规则不入 Git，报告仍记录绝对/仓库路径与 hash。
- 运行 `generate:crave-layout-resources` 更新 generated TypeScript并用 `--check` 复验；禁止手改 control file、payload 和 generated import。
- 更新 game002 README/animation flow；重复 spin/non-remove plan 更新 `shared-game-runtime.md`，FG 业务更新 `game002.md`，transition surface 边界更新 `scene-layout.md`；不改根 `AGENTS.md`。

## 11. 执行报告

执行完成后创建：

```text
tasks/147-game002-freegame-flow-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终行为、public contract、实际文件、
计划偏差、资源 hash/parity、验收结果、未完成 browser/live 项和剩余风险。

## 12. 风险、假设与待确认

### 风险

- `fg-spin.pos` 是 result set 而不是 visual mask；若误用会只转少量 feature cells。 实现必须用当前 board 派生非 CN/WL mask，并用 sample 做两者分离的回归断言。
- 同一 reel 跨 transition 的 overlay z-order、event switch、resize 和 destroy 只有真实 Pixi/browser 能证明视觉正确，fake player 只能证明状态边界。
- terminal CN collect 过去总与 remove/cascade 相连；non-remove 分支若错误 release occurrence，会导致 FG_BG 后 final scene 出现 holes。
- popup 可能等待用户 dismiss；FG_BG 必须在真实 complete 后开始，同时不能改变普通 BaseGame 的 next-spin cleanup 合同。
- optimizer 使用有损 WebP，AF 新数字、透明边缘和 transition 贴图需要人工画质抽查。

### 假设

- `fg-spin.pos` 是本步落定后的 feature result positions；未列出的普通底图仍参与视觉 spin，但允许服务器 target scene 保持同 code。
- 一个 `fg-rollaf.number` 应用于同 step 的全部 AF positions，并等于该 step 实际新增 免费次数；当前样例每步只有一枚 AF。
- AF 使用已有 `Feature -> Change`，Change completion 提交 AF -> CN；raw digits 复用 task132/135 唯一 ImgNumber dependency 和 AF exact `Mult` slot。
- `fg-vortex.pos` 每段对应一个 CO，段内至少一个 source/target 四元组；source 可混合 WL/CN，多个 segment 必须 disjoint。
- BaseGame/FreeGame 继续共用同一 Symbols binding，反向 transition 后无需 reel recreation。

### 待确认

无。若 live payload 推翻以上 sample-derived 合同，执行会话应以 strict fixture 失败并
报告，不添加 fallback、alias 或猜测兼容。

## 13. 完成清单

- [x] 目标和非目标已满足，完整 round 在 mutation 前通过 strict compile/preflight。
- [x] trigger WL、enter transition、同 scene continuity 和 selective spin 正确。
- [x] counter、AF number/add/AF->CN、AF before CO 已覆盖。
- [x] FG CO mixed WL/CN relocation、atomic transaction 和 task135 parity 已覆盖。
- [x] final CN non-remove collect、BigWin complete、exit transition 和 final scene 保留。
- [x] task147 Symbols/Layout/optimized ZIP/asset-groups、`assets/crave` 和 generated imports 已同步。
- [x] public API、resource ownership、rollback/cleanup/destroy 和旧 consumer trace 符合计划。
- [x] 指定 L2 自动化已通过，人工验收状态单独记录。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的五份领域规则和本计划；
2. 核对 Git、协议样例、输入 ZIP/hash、task135 parity 和 `assets/crave` 基线；
3. 按计划实现，不重新制定另一套方案；
4. 小幅适配当前实现时在报告记录；
5. public API、manifest schema、optimizer、依赖或协议假设发生重大变化时先停止说明；
6. 只运行计划规定的 L2 验收；
7. 完成后生成执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
