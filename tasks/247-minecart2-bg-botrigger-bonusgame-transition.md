# 247 minecart2-bg-botrigger-bonusgame-transition 任务计划

## 1. 目标与完成定义

### 目标

在外部游戏项目 `/Users/zerro/gitee.com/piximinecart2` 中接入 `bg-botrigger`：当 step 0 的该组件被触发时，
Minecart2 在本轮主转轮落停、symbol 中奖展示和 award celebration 全部结束后，使用现有 Game Layout
`BaseGame -> BonusGame` directed transition 切换到 `BonusGame`。转场完整复用当前配置和 RenderCore runtime，
按 `prelude Popup -> 等待 BonusGame assets -> video -> BonusGame commit` 的正常流程执行。

### 完成定义

- [ ] 直接使用既有 `GameLogic.hasComponent(0, "bg-botrigger")` 判断触发；未触发时 operation plan 和现有回合行为不变。
- [ ] 触发时 immutable `SlotOperationPlanV2` 的顺序固定为 landing、可选 symbol wins、可选 award、
      BonusGame transition；transition 不得早于 win/award Promise 完成。
- [ ] award 存在时，必须等 `getActiveAwardCelebrationPhase()` 到达现有 complete 边界后才开始准备/请求
      `BonusGame`；无 win/award 时则在前序已有 operation 完成后直接转场。
- [ ] app 依次调用 `prepareGameModeTransition("BonusGame")` 与 `requestGameMode("BonusGame")`，不复制 Popup、
      chunk load、trusted gesture、video、mode commit 或 rollback 状态机。
- [ ] 当前 Game Layout 配置继续决定 Popup、目标 assets、video 和 mode identity；缺 direct edge、Popup、video、
      chunk、资源或错误 stable mode 时显式失败，不瞬切或 fallback。
- [ ] `bg-botrigger` 未触发、普通 win、CO value、feature bar、continuous spin、award amount 和下一 spin cleanup 保持不变。
- [ ] 定向单测、Minecart2 typecheck/build、真实浏览器时序验收、README 与 UTC 中文执行报告完成。

## 2. 范围

### 包含

- Minecart2 round compiler 对 step 0 `bg-botrigger` 的已有 trigger query 和 app-owned presentation operation。
- Minecart2 operation registry/handler 对 `BonusGame` mode transition 的顺序化调用。
- 触发与未触发 fixture、operation 顺序、award barrier、prepare/request 顺序、错误传播和 cleanup 测试。
- 只读核对当前 delivery 中 `BaseGame -> BonusGame` 的 prelude、video、target chunk 和同一 Symbols binding。
- 外部 app README、主仓 task 247 执行报告。

### 不包含

- 不新增或修改 logiccore component API；不解析 `bg-botrigger` 的 raw/basic data、scene、otherScene 或 result。
- 不修改 RenderCore Game Layout transition、delivery loader、Popup input、video player、mode schema 或 public API。
- 因 shared package 没有 capability 缺口，本任务不把 slotclientengine 的 `packages/logiccore`、
  `packages/rendercore` 同步到 piximinecart2；若执行时发现真实 shared 缺口，必须先在主仓修复和验证，再同步外部副本并升级 L2。
- 不修改 `apps/game003v2`；它是 Minecart2 的来源参考，不是本次交付 consumer。
- 不接入 FreeGame、BonusGame 返回 BaseGame、BonusGame 内部回合规则、免费次数或其它 trigger component。
- 不修改当前 production delivery manifest/chunk/media bytes，不重导或优化美术，不修改公开轮带或 server scene 边界。
- 不新增依赖，不修改 lockfile、workspace、根工具链或 UI。

## 3. 制定计划时的基线

```text
UTC: 2026-08-25T10:23:33Z
slotclientengine HEAD: a37be200881bb6def754cb205ae5dda9d9e461f9
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean

piximinecart2 HEAD: 783f26aab63862d39fe79d392fd0c2b222e93676
piximinecart2 branch: master
piximinecart2 git status --short --untracked-files=all:
 D assets/minecart2/assets/42f97318d167ff0547d294659bdc47e70c01f8c775613c99c53970047448a664.webp
 D assets/minecart2/assets/567fda91e41916ac56846f258961ca3a4df062b6309f92016b68225d6f290394.webp
 D assets/minecart2/assets/71fcee679d1de4f8a3ad621e3bb58c0250672922a83a0acba6b0e33c268b0e4d.webp
 D assets/minecart2/assets/87065f759daaee4e6e717652fcc3f7ea6b66db7879f58ee806a0ab8a59f5bd7b.webp
 D assets/minecart2/assets/9bb6b8dcc4c486e4612bb1b2f58ad84b834af578de560b74c24a57294ff38cce.webp
 D assets/minecart2/assets/b3d7b02c252de27a7fcbe4502bf3b0f3f3a0947414a2295f5f93711967ab08ef.webp
 D assets/minecart2/assets/d8dbb239afe30beaa618bfbf7e0c81536ee59a3a3eeead31e7a75f9a483b6d58.webp
 D assets/minecart2/chunks/initial-ac1b5c09.ddb461e9f0eeca69c80c79afbbdb765fc5e7b5ff72a50e88554c4d105715eaf2.zip
 M assets/minecart2/delivery.manifest.json
?? assets/minecart2/assets/03de2b339f3193771e233d91c003ebbc6b6002a0082c28995ca39bcb6d1ce044.webp
?? assets/minecart2/assets/3a3ab27b47527f56d97f2c738c943d2088ed84b207a4c7b00761bba532aa5687.webp
?? assets/minecart2/assets/4cdd118755e792e4c1c1ff131c456699415dc0a7057f64beeb20eeed1433a2cc.webp
?? assets/minecart2/assets/b1da4a56e7f780b1dd29a5e35b0828e8be9841b42e0e609e9e7b4e87f80e38b2.webp
?? assets/minecart2/assets/b92db7aac399cd49f2c68316a7a609337743a9cd790f654bb1334d2237ebc44c.webp
?? assets/minecart2/assets/ca331f2a0d4405fe4846b6192f9613514af7596f8ff775d70e4e8bd0ff3dcaa9.webp
?? assets/minecart2/assets/d558889b1e54f775b4aefd6527fb0d8a7666dc29b7e23ab6dd34754faa1c4cf.webp
?? assets/minecart2/chunks/initial-ac1b5c09.e64b8f1752ff95f2ec3e714889b5b3d8df0a547ce4debc5799e976a6346a0844.zip
```

- 已读取主仓根 `AGENTS.md`、外部项目根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout,game003}.md`；目标目录没有补充 `AGENTS.md`。
- 上述 piximinecart2 assets 变更是用户现有工作，执行时必须原样保留；本任务只读其中当前
  `delivery.manifest.json` 与新 initial chunk，不清理、不重写、不纳入 app code diff。
- `packages/logiccore/src/game-logic.ts#GameLogic.hasComponent(stepIndex, name)` 已按 `historyComponents`
  判断 trigger；`types.ts` 已有 public interface，外部 `bridgecore` 也已向 app 暴露 `GameLogic`，没有 shared API 缺口。
- `apps/minecart2/src/round-compiler.ts#compileGame003v2Round()` 当前顺序为 `slot:spin -> game003:wins? ->
game003:award?`；它尚未读取 `bg-botrigger`。现有 presentation draft/finalizer 已足以表达 app-owned transition，
  无需把 mode id 或 component 名放入 logiccore。
- `apps/minecart2/src/round-adapter.ts#createRegistry()` 当前只注册 landing、wins、award；coordinator 严格串行 await
  handler。`playAward()` 已以 `getActiveAwardCelebrationPhase()` 的 complete/null 边界 resolve，是 transition 排在 award
  后即可复用的 barrier。
- 当前 delivery 的 canonical `layout.manifest.json` 已声明 `BaseGame -> BonusGame`：prelude 为
  `popup-125ec31d7fdc4a0bbcfe823240183f60`，overlay 为 `video3.mp4`，target chunk 为 `mode:BonusGame`；
  BaseGame/BonusGame 共用 `minecart2` Symbols package。
- RenderCore `prepareGameModeTransition()` 为 video 建立不可见 prepared transition；相同 Symbols binding 不在该阶段
  强制准备目标 reel。`requestGameMode()` 激活 prelude，`observeActivePreludeAssets()` 开始/复用 target chunk load，
  Popup 完成后仍未 ready 会等待，trusted Popup input unlock video，最后按 media switch/fade 边界 commit BonusGame。
- 当前代码、测试和 delivery 已足以确认合同；本计划不审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “组件触发”只表示 `historyComponents` 中存在 exact `bg-botrigger`，直接调用 `logic.hasComponent(0, ...)`；
   不要求该组件提供 scene/result，也不通过 `mapComponents` 猜业务 payload。
2. “放在 symbols 中奖以后，也就是获奖庆祝结束以后”落实为 plan 中最后一个 presentation operation。
   coordinator 只有在 wins handler 和 award handler Promise 依次 resolve 后才调用 transition handler。
3. award 只在 `totalWin > 0` 时存在；没有 award 时不制造空 Popup或延迟，transition 紧接实际存在的前序 operation。
4. “按正常流程走”是调用 Scene Layout public transition API，不是 app 手工 open Popup、load chunk、播放 MP4 或切 node。
5. 当前配置决定精确的 Popup、video、target assets 和 mode；app 只拥有 `bg-botrigger -> BonusGame` 业务映射。

### 关键决策

1. **不修改 logiccore**
   - 直接使用 `GameLogic.hasComponent(0, "bg-botrigger")`；该 API 已有 trigger-only 语义。
   - compiler 只在 true 时追加 app-owned `game003:bonus-transition` presentation draft，payload 显式记录 exact
     target mode；false 时不追加空 operation。
   - 不新增 `genModeTransitionOperation`、component schema、profile role或 shared mode enum。
2. **transition 是 plan 的最后一个 operation**
   - 追加位置在 `game003:award` 之后；保留 `wins -> award` 原顺序。
   - coordinator 的串行 Promise 合同就是 happens-after 边界，不再建第二个 queue、event bus 或 deferred barrier。
3. **复用 RenderCore video prelude transaction**
   - handler 先 await `prepareGameModeTransition(modeId)`，再 await `requestGameMode(modeId)`；video 的 prepare要求、
     Popup input和完整完成边界都由 runtime证明。
   - 不提前直接调用 delivery loader；当前相同 Symbols binding让 target assets在 prelude active后加载/复用，
     Popup 完成后由 runtime gate到 ready，再启动 video并最终 commit。
4. **strict failure，不做状态猜测**
   - payload kind/mode不符、runtime不在允许 direct edge、prepare/request失败都 reject operation，coordinator fail-stop。
   - 不把 already BonusGame 当成功 fallback，不从 mode名字寻找反向边，不吞掉 resource/video错误。

## 5. 职责与合同

- **logiccore/bridgecore**：继续只提供 frozen GameLogic、`hasComponent()` 和通用 immutable operation finalizer；
  不认识 `bg-botrigger`、BonusGame或 Game Layout。
- **rendercore**：继续拥有 directed edge、target prepare、delivery chunk、prelude Popup、trusted gesture、video、
  atomic mode commit、failure cleanup和 destroy；不认识触发组件。
- **Minecart2 compiler**：拥有 exact component name、trigger-to-target业务映射和 operation顺序，在画面 mutation前生成
  deep-frozen完整 plan。
- **Minecart2 adapter**：拥有 app operation kind的 strict payload校验，并把它映射为两个 public runtime调用；
  不操作 raw player/container/media/chunk。
- **失败策略**：unknown operation/payload、错误 mode、缺 direct edge、prepare/load/Popup/video/commit失败都原位 reject；
  coordinator停止后续执行，runtime按既有 transaction清理。
- **禁止行为**：不重复 mode状态机，不在 app维护 Popup/video/path/chunk表，不用 setTimeout/DOM video，不静默瞬切，
  不把业务 component/mode写进 shared package。

## 6. 文件范围

### 预计新增

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-adapter.test.ts
tasks/247-minecart2-bg-botrigger-bonusgame-transition-<utctime>.md
```

### 预计修改

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-compiler.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-adapter.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-compiler.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/fixtures/game003-gmi.ts（若增加共享 trigger fixture）
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/source-boundary.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
```

`round-adapter.test.ts` 可通过最小 app-internal test seam 注入 fake runtime/coordinator；若无需新增文件即可在现有测试
完整证明调用顺序，则并入现有测试并在报告记录小幅文件范围适配。

### 原则上不应修改

```text
packages/{logiccore,rendercore,gameframeworks,bridgecore}/**
apps/game003v2/**
docs/agent-rules/**
/Users/zerro/gitee.com/piximinecart2/packages/**
/Users/zerro/gitee.com/piximinecart2/assets/**
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json
{AGENTS.md,package.json,pnpm-lock.yaml,pnpm-workspace.yaml}
```

执行时若需要 shared API、Game Layout schema、production assets、依赖或 lockfile变化，必须先停止说明；shared修复必须先在
slotclientengine实现并定向验证，再同步外部对应 package，不能只给 piximinecart2副本打补丁。

## 7. 实施步骤

1. **确认双仓执行基线和当前 transition closure**
   - 重核两仓 HEAD/status和本计划所列规则；保留 piximinecart2现有 assets修改。
   - 从当时 active delivery的 initial chunk复核 BaseGame/BonusGame、direct edge、prelude、video、mode chunk和共享 Symbols
     binding；任一合同缺失时报告资源/config阻塞，不猜别名或手改 content-addressed文件。
2. **编译 trigger presentation operation**
   - 在 `compileGame003v2Round()` 完成 wins/award drafts后调用
     `logic.hasComponent(0, "bg-botrigger")`；true时追加 exact `game003:bonus-transition` v2 presentation draft，
     payload只保存 `modeId: "BonusGame"`，复用本轮 server source与现有 finalizer。
   - 在 definitions注册对应 app kind和 `requiresEstablishedScene`；不触发时保持 plan byte-shape意义上的既有
     operation序列，不加入 no-op。
3. **接入最后一个 coordinator handler**
   - 在 app registry注册 exact kind/version，严格检查 effect和 payload只有预期 mode。
   - handler先 await runtime `prepareGameModeTransition(modeId)`，成功后 await `requestGameMode(modeId)`；第二个 Promise
     只有 Popup、assets、video和 stable commit全部完成才 resolve。
   - 复用 coordinator/runtime现有 failure、next-spin和 destroy cleanup，不新增 media或Popup ownership。
4. **保护 operation与异步顺序**
   - 扩展 round fixture覆盖仅 trigger、win+trigger、win+award+trigger和未触发；断言顺序、deep freeze、exact payload及
     原有 landing/wins/award输出。
   - 增加 adapter定向测试，用 controllable award completion和 fake runtime证明 award未resolve前 prepare/request均为零，
     resolve后调用严格为 prepare再request且各一次；覆盖 prepare reject时不request、request reject向 coordinator传播、
     destroy/cancel不留下 continuation。
   - source boundary确认 app只调用 public Game Layout API，不读取 delivery/private player/DOM video或实现 mode状态机。
5. **文档、人工验收与收尾**
   - 更新 Minecart2 README，记录 `bg-botrigger`、最后 operation顺序和配置驱动的 BonusGame转场；不复制资源路径表。
   - 运行 L1定向验收，在真实浏览器完成正常、慢 assets和错误路径检查；主仓写 UTC中文执行报告并明确
     “logiccore/rendercore无需修改或同步”。

## 8. 测试与验收

### 测试原则

- trigger fixture必须通过 `historyComponents` 驱动 `hasComponent()`，不依赖伪造 trigger scene/result。
- compiler测试同时覆盖无 win、symbol wins、award和 trigger的组合，精确证明 transition始终是最后一个 operation。
- adapter测试使用可控 Promise/host frame，不用 wall-clock sleep；断言 award complete前没有 transition调用。
- transition helper测试只 fake public `prepareGameModeTransition/requestGameMode`，不复制 RenderCore内部 Popup/video状态机。
- app测试不得读取服务器真实轮带，也不把当前 delivery的 content hash/path固化为第二份业务表。

### 验收级别

`L1`：只修改外部 Minecart2 app内部编译/handler、测试和README；复用既有 shared public API，不改 schema、
生成物、assets、lockfile或 package合同。若执行暴露真实 shared capability缺口，按用户指定顺序升级 `L2`：先主仓
logiccore/rendercore、定向测试，再同步外部 package，最后改 app。

### 执行会话必须运行

```bash
pnpm --filter minecart2 exec vitest run tests/round-compiler.test.ts tests/round-adapter.test.ts tests/source-boundary.test.ts
pnpm --filter minecart2 typecheck
pnpm --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
git diff --check
```

前三条在 `/Users/zerro/gitee.com/piximinecart2` 执行；最后一条在 slotclientengine执行。若 adapter测试并入现有文件，
第一条删除不存在的文件参数并保持同一测试范围，不扩大到整仓。

### 人工验收

1. 无 `bg-botrigger` 的普通/中奖 spin：确认转轮、symbol wins、award和下一轮行为与当前一致，不出现 BonusGame Popup/video。
2. `bg-botrigger` + win/award：确认先完成 symbol win首轮和完整 award celebration；之后才出现 BonusGame prelude Popup。
3. 在 BonusGame chunk尚未 ready时完成 Popup确认：Popup正常退场，画面保持 BaseGame并等待；assets ready后自动播放
   `video3.mp4`，无需再次点击，最终稳定提交 BonusGame。
4. chunk已由后台预取完成时重复触发：仍按 Popup、video、commit顺序完成，不出现重复请求、瞬切或双 Popup。
5. 模拟 target chunk或video加载失败：当前 round显式失败并显示既有错误处理；不提交半切BonusGame，销毁/刷新后无残留。

### 独立验收建议

`建议`：不改跨包 public contract，但涉及 award barrier、Popup trusted gesture、lazy assets和video mode transaction。独立复验：

```bash
pnpm --filter minecart2 exec vitest run tests/round-compiler.test.ts tests/round-adapter.test.ts
pnpm --filter minecart2 build
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
```

## 9. 环境与依赖

- 两仓使用 Node 24与pnpm；当前规划shell中 `node` 不在 PATH，执行会话先加载 nvm并 `nvm use 24`。
- 依赖缺失时在对应仓库运行 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后设置约定代理重试。
- 不新增依赖，不修改 package.json/lockfile，不使用 npm/yarn，不引入 timer、media或状态机库。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、delivery manifest、chunk、assets map或生成物，不运行资源生成器，也不手改 content-addressed文件。
- 更新外部 `apps/minecart2/README.md`；精确 component/mode和操作顺序留在 app代码、测试和README。
- 不改变 shared稳定职责，因此不更新主仓根规则或 shared/scene-layout规则；主仓 `game003.md` 继续描述
  `apps/game003v2`，不把外部 Minecart2项目行为误写进去。
- 执行结束前重新核对 piximinecart2 assets状态，确保用户原有删除/新增/manifest修改没有被覆盖或格式化。

## 11. 执行报告

规划时不生成报告。执行完成后在主仓创建：

```text
tasks/247-minecart2-bg-botrigger-bonusgame-transition-<utctime>.md
```

报告简要记录两仓实际基线、最终 operation顺序、实际修改文件、自动化与浏览器结果、用户 assets保留状态、计划偏差和
剩余风险；若未发现 shared缺口，明确记录 logiccore/rendercore没有修改或同步。

## 12. 风险、假设与待确认

### 风险

- 当前 piximinecart2 delivery处于未提交替换状态；执行时必须以当时 manifest指向的新 initial chunk为一组核对，
  不能混用已删除旧 chunk或旧 hash。
- `prepareGameModeTransition()` 必须先完成 video不可见准备；若 media背景预取尚未完成，Popup出现前可能有 prepare等待。
  当前正常用户可观察顺序仍是 Popup后等待 target mode assets再播放video，真实网络时序需浏览器确认。
- Popup确认、award completion、target chunk和coordinator cleanup可能交错；必须只依赖 runtime/coordinator现有 Promise与
  transaction，避免旧 round continuation在下一 spin提交mode。
- 切到 BonusGame后的后续 round规则不在本任务；若服务器立即要求BonusGame专属 compiler/return flow，应另立任务，
  不能在本任务猜测。

### 假设

- `bg-botrigger` 出现在 step 0 `historyComponents` 即表示本轮需要从当前 stable BaseGame进入 BonusGame，且不需要读取其 raw data。
- 当前 delivery中的 `BaseGame -> BonusGame` edge、prelude、video、target chunk和同一 `minecart2` Symbols binding是本任务执行时的权威配置。
- “获奖庆祝结束以后”指现有 `game003:award` handler Promise完成；没有 positive total win时没有 award operation，也无需制造空等待。

### 待确认

无。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] `bg-botrigger` 直接使用已有 trigger query，shared package未硬编码业务名。
- [ ] transition严格位于 wins/award之后，并完整等待 Game Layout request完成。
- [ ] 实际修改未覆盖用户现有 assets工作；shared同步决策已在报告说明。
- [ ] 指定自动化验收、真实浏览器验收、README和UTC中文报告已完成。
- [ ] 自动化与人工验收已明确区分。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根 `AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对两仓Git基线及piximinecart2用户已有assets修改；
3. 先确认 existing API足够，不修改/同步shared package，再按计划修改Minecart2 app；
4. 小幅适配当前实现时在报告记录，重大shared/schema/assets范围扩张时先停止说明；
5. 只运行计划规定级别的验收并完成真实浏览器检查；
6. 完成后在主仓生成UTC中文执行报告；
7. 除非用户明确要求，不commit、不push、不创建PR。
