# 235 rendercore-award-popup-tier-skip-final-loop 任务计划

## 1. 目标与完成定义

### 目标

修正 RenderCore `award-celebration` Popup 的玩家点击跳档与最终展示行为：点击时金额 ImgNumber 和
`bigwin / superwin / megawin` 视觉档位必须同步跳转；不到 `bigwin` 的获奖一次跳到最终金额，达到
`bigwin` 及以上的获奖先跳到 `bigwin`，之后每次点击只跳一个实际可达的庆祝档位。最终金额到达后保留最后档
loop，不再要求玩家再点击一次关闭；下一次 spin 开始时由 runtime 立即清理遗留 Popup。

### 完成定义

- [ ] 最终获奖低于 `bigwin` 阈值时，任意 base/standard 计数阶段的一次玩家点击直接把 ImgNumber 提交为最终值，
      保留最终可见档位并进入非阻塞的最终展示状态。
- [ ] 最终获奖达到 `bigwin` 时，bigwin 出现前的点击把 ImgNumber 精确跳到 bigwin 阈值，并在同一次同步状态转换中
      启动 bigwin 效果；后续自动计数从该阈值继续增长。
- [ ] 最终获奖达到 superwin/megawin 时，bigwin 之前的首次点击仍只跳到 bigwin；之后每次点击依次跳到下一个实际
      可达庆祝档位，ImgNumber 同步变为该档阈值。若没有下一个可达档位，则直接跳最终金额。
- [ ] 自动播放不点击时仍按 `base → standard → bigwin → superwin → megawin` 的实际可达阶段和现有 duration 播放，
      exact threshold 继续由 manifest 和整数比较决定。
- [ ] 到达最终金额后，当前最后档及其 ImgNumber 保持可见并继续由宿主 ticker 更新 loop；后续玩家点击幂等无效，
      不进入 end/dismissing/complete，也不作为下一次 `playSpin()` 的业务阻塞条件。
- [ ] `requestDismiss()`、`closePopup({ behavior: "complete" })`、`dismissImmediately()` 和 destroy 仍保留调用方显式关闭、
      排空 end 或立即清理能力；下一次 configured spin 在 reel mutation 前立即清理上一轮 award Popup。
- [ ] Popup Editor 的 production preview wrapper、Game Layout Editor/Scene Layout inspector 和游戏 runtime 复用同一 Core
      状态机，无 app 私有跳档实现；README、Popup 文档、领域规则、定向测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- `packages/rendercore/src/popup` 内 award runtime 的点击目标选择、金额提交顺序、最终展示和显式关闭边界。
- Popup Core runtime、Editor snapshot wrapper、Scene Layout primary popup interaction 与 configured round `next-spin`
  cleanup 的直接回归测试。
- Popup public runtime 文档和 shared game runtime 稳定规则的最小更新。
- Popup Editor 与 Game Layout Editor 对同一 runtime 的人工预览验收。

### 不包含

- 不修改 Popup manifest version、threshold、count duration、tier 列表、资源 binding、VNI segment 或 ImgNumber schema。
- 不修改 `packages/rendercore/src/win-amount` 的独立 legacy Win Amount Animation player；本任务只处理编辑器和 Scene Layout
  实际复用的 `award-celebration` Popup runtime。
- 不把最终档自动播放 end 或自动隐藏；只有下一次 spin、显式 close/dismiss、失败 cleanup 或 destroy 才关闭。
- 不删除 `requestDismiss()` / `dismissImmediately()`，不改变 programmatic Popup session 的显式 close 与 Promise settle 合同。
- 不在 `apps/popupeditor`、`apps/gamelayouteditor`、游戏 app 或 gameframeworks 复制点击状态机，不修改生产美术、YAML、
  生成物、lockfile、依赖或根工具链。

## 3. 制定计划时的基线

```text
UTC: 2026-08-21T03:45:41Z
HEAD: aead46cafd6e6ca7c6acf76c9b9860aac3e83051
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{editor-artifacts,shared-game-runtime}.md`；`packages/rendercore` 下没有补充 `AGENTS.md`。
- `createAwardCountStages()` 位于 `packages/rendercore/src/popup/award-sequence.ts`，已按 manifest 阈值构造
  base、standard 和实际达到的 bigwin/superwin/megawin stages；threshold 比较使用 `BigInt`，无需改 schema 或重算规则。
- `DefaultAwardCelebrationRuntime.requestAdvance()` 位于
  `packages/rendercore/src/popup/award-player.ts`：base/standard 有可达庆祝档时会定位到首个庆祝 stage；庆祝档点击会完成
  当前 stage；但无庆祝档时只完成当前 base/standard stage，可能仍进入 standard，而不是一次跳最终值。
- 同文件 `startNextStage()` 会先把 `#displayed` 设为新 stage 的 `fromAmountRaw`，但切 tier、rebind ImgNumber 和调用
  effect `enter()` 前没有同步调用 `updateAmount()`；因此 snapshot 数值可已到新阈值，而 formatted ImgNumber/新档动画仍收到旧文本。
- 当前 `requestAdvance()` 在 `awaiting-dismiss` 会转调 `requestDismiss()`，使最终档的最后一次玩家点击触发
  `dismissing → complete`；`requestDismiss()` 与 `dismissImmediately()` 同时还承担显式 host close 和 cleanup，不能一并删除。
- `packages/rendercore/src/scene-layout/package-runtime.ts` 的 canvas/keyboard primary interaction 对 active award 只调用
  `requestAdvance()`；Popup Editor 的 `AwardCelebrationEditorPlayer` 和 `apps/popupeditor/src/preview/popup-preview.ts` 也委托
  同一 Core runtime，因此修正 Core 后不需要 app 私有分支。
- `packages/rendercore/src/slot-operation/coordinator.ts` 在每次 `start(plan)` 画面 mutation 前调用
  `cleanup("next-spin")`；`ConfiguredRoundTarget.cleanup()` 已调用
  `dismissActiveAwardCelebrationImmediately()`，主链路已具备下一次 spin 清理能力，但缺少本需求对应的直接 round 回归证据。
- `packages/rendercore/tests/popup/award-player.test.ts` 目前只断言点击后的 active tier，未同时断言 threshold 金额与 formatter/
  ImgNumber write，并明确期望最终点击进入 dismiss；这些旧期望需要按本任务合同更新。
- 本规划会话只新增本计划；未修改实现、安装依赖或运行构建/重型测试。

## 4. 需求解释与技术决策

### 需求解释

点击规则按“下一个可见里程碑”定义：

1. 当前还未进入 bigwin，且最终值达不到 bigwin：直接提交最终金额。
2. 当前还未进入 bigwin，且最终值达到 bigwin 或更高：只跳到 bigwin 起点，同时进入 bigwin。
3. 当前已经处于 bigwin/superwin：若最终值达到下一个庆祝档，跳到该档起点并切换该档；否则跳最终金额。
4. 当前处于最终展示：玩家点击不再是 dismiss 命令；Popup 保持最后实际到达的档位 loop，直到 host cleanup。

“ImgNumber 和大状态一起跳档”要求一次同步 command 的可观察结果一致：`displayedAmountRaw`、formatted amount、
共享 ImgNumber renderer、active tier 和新 tier `enter(amountText)` 必须全部对应同一个目标 threshold，不能先发布新 tier 再在后续
tick 修金额。

### 关键决策

1. 保留现有 stage 数据模型，由 runtime 基于 `#stages/#stageIndex` 选择首个庆祝档、下一个庆祝档或 final target；不在
   app、manifest 或测试维护第二份 big/super/mega threshold 表。
2. 在进入目标 stage 的同步边界先提交 `stage.fromAmountRaw` 的 automatic formatted amount，再使用该 exact text 完成 tier
   visibility、ImgNumber resource rebind 和 effect enter；formatter/renderer 失败应在本次 command 中显式抛出，不能留下
   “新 tier + 旧金额”的半提交状态。执行时若现有调用顺序无法保证失败原子性，应先 prepare target text，再 commit tier。
3. 保留 public `AwardCelebrationPhase` 的 `awaiting-dismiss` 名称，避免无必要的跨 consumer type 破坏；其语义更新为“最终档
   持续展示，等待 host cleanup 或显式 dismiss”，而不是“必须等待玩家点击”。`requestAdvance()` 在此阶段幂等 no-op。
4. `requestDismiss()` 继续是 host/programmatic graceful close，`dismissImmediately()` 继续是 next-spin/failure/destroy cleanup；
   不把所有关闭能力误删为只能等下一次 spin。
5. Scene Layout 和两个 Editor 不新增 source 分支。通过 Core player、Scene Layout primary interaction 与 configured round 测试
   证明 consumer 自动获得新行为；只有发现 consumer 绕过 public runtime 时才停止并说明范围扩张。

## 5. 职责与合同

- **Popup data**：继续拥有五档、threshold multiplier、duration 与 strict manifest；本任务不改变 data/schema。
- **Popup core**：唯一拥有 amount stage、点击跳档、tier visibility、ImgNumber rebind、VNI start/loop/end 和最终展示状态机。
- **Scene Layout/runtime host**：只把 pointer/keyboard 转发为 `requestAdvance()`，在显式 close 或下一次 spin 调用 cleanup；不判断
  big/super/mega。
- **Editor**：Popup Editor wrapper 和 Scene Layout inspector 只读取同一 runtime snapshot，不复制 production transition。
- **数据/API**：不改方法签名或 phase union；只收紧 `requestAdvance()` 的行为合同和 `awaiting-dismiss` 的语义。
- **资源生命周期**：跳档复用现有唯一 ImgNumber runtime；旧 tier end 与新 tier start 的 ownership、ending drain 和 destroy
  保持现有边界。next-spin immediate cleanup 同步隐藏全部 tier/amount，并 settle Scene Layout waiter/session。
- **失败策略**：formatter、ImgNumber glyph/rebind 或 tier runtime 错误继续显式失败；不得用旧文本、首项资源或静默降级掩盖错误。
- **禁止行为**：不新增 app 级 threshold 分支、第二个 ImgNumber instance、额外 click listener、自动 dismiss timer 或 final-tier
  animation fallback。

## 6. 文件范围

### 预计新增

```text
tasks/235-rendercore-award-popup-tier-skip-final-loop-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/award-player.ts
packages/rendercore/src/popup/core/types.ts
packages/rendercore/tests/popup/award-player.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/tests/scene-layout/configured-round-adapter.test.ts
packages/rendercore/README.md
docs/popup-manifest.md
docs/agent-rules/shared-game-runtime.md
```

若测试证明 stage target 选择需要纯 helper，可最小修改
`packages/rendercore/src/popup/award-sequence.ts` 及其现有测试；不得借机改变 threshold/schema。

### 原则上不应修改

```text
apps/{popupeditor,gamelayouteditor,game002v2,game003v2,gameviewer,gameviewer2}/**
packages/rendercore/src/{win-amount,scene-layout/data,symbol,reel,image-string}/**
packages/{logiccore,gameframeworks,uiframeworks,vnicore}/**
assets/**
{package.json,pnpm-workspace.yaml,pnpm-lock.yaml,AGENTS.md}
```

执行时若需要改 manifest/public type shape、Editor 私有状态机、游戏 app 或 standalone win-amount player，必须先说明为何现有
Core 委托链不能满足需求，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与点击矩阵**
   - 重核 HEAD/status、award stages、runtime command 顺序、Scene Layout input dispatch 和 `next-spin` cleanup。
   - 用 fixture 的 exact 阈值固定 `< big`、`= big`、`big < final < super`、`= super`、`= mega`、`> mega` 六类输入，
     明确每次点击后的 amount/tier/phase。
2. **修正 Core 跳档与金额同步提交**
   - 在 `award-player.ts` 收敛“首个庆祝档 / 下一个实际可达庆祝档 / final”选择，避免 base 与 standard 分支分散推进。
   - 进入庆祝 stage 时先格式化并提交 `fromAmountRaw`，再让新 tier rebind/enter 读取同一个 amount text；保持旧 tier end drain、
     shared ImgNumber identity 和自动计数连续性。
   - 无可达庆祝档或当前庆祝档后无下一档时，一次跳 final 并进入最终展示。
3. **取消玩家最终点击关闭**
   - `requestAdvance()` 在 `awaiting-dismiss` 直接返回，不请求 end、不隐藏 presentation、不完成 runtime。
   - 保留显式 `requestDismiss()` 的 graceful end 和 `dismissImmediately()` 的同步 cleanup，更新 public method/phase 注释。
4. **保护 Scene Layout 与 next-spin consumer**
   - 在 Popup runtime/editor wrapper 测试中同时断言点击后的 active tier、raw/formatted amount、ImgNumber write/enter text、
     最终 loop 和重复点击 no-op。
   - 在 Scene Layout package runtime 测试中经 primary interaction 验证最终点击不关闭；显式 close/immediate cleanup 仍 settle。
   - 在 configured round adapter 测试中启动下一次 spin，断言 coordinator 先调用 immediate award cleanup，再开始 reel round；不在
     gameframeworks 或 app 增加清理分支。
5. **文档、规则与收尾**
   - 更新 RenderCore Popup API、Popup runtime 示例/说明和 shared runtime 稳定规则，明确最终档不依赖用户点击、显式 close 与
     next-spin cleanup 的区别。
   - 运行 L1 定向验收和两个 Editor 的人工 preview smoke；生成 UTC 中文执行报告并检查最终 diff。

## 8. 测试与验收

### 测试原则

- 每个 click case 必须同时断言 `activeTierId`、`displayedAmountRaw`、`formattedAmount` 和 ImgNumber/effect 收到的文本，避免只测
  动画状态再次漏掉金额。
- 覆盖点击发生在 base 与 standard、庆祝 tier 的 start/loop/counting、exact threshold、最终展示重复点击和不点击自然完成。
- 继续覆盖显式 graceful dismiss 的 end drain、immediate cleanup、重复 play、destroy、formatter failure 和唯一 ImgNumber复用。
- Scene Layout 测试只验证转发、Popup completion/interaction ownership 和 next-spin ordering，不复制 Core threshold 矩阵。

### 验收级别

`L1`。生产修改限定在 `@slotclientengine/rendercore` 内部 Popup 行为，不改跨包 public API、schema、生成器、正式资源、依赖或
lockfile；Scene Layout、configured round 和 Editor wrapper 均在同 package 内复用该 runtime。用目标 package typecheck、定向
Popup/Scene Layout 测试和人工 Editor preview 足以证明行为，不升级整仓验收。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/award-sequence.test.ts tests/popup/award-player.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/configured-round-adapter.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm exec prettier --check packages/rendercore/src/popup/award-player.ts packages/rendercore/src/popup/core/types.ts packages/rendercore/tests/popup/award-player.test.ts packages/rendercore/tests/scene-layout/package-runtime.test.ts packages/rendercore/tests/scene-layout/configured-round-adapter.test.ts packages/rendercore/README.md docs/popup-manifest.md docs/agent-rules/shared-game-runtime.md tasks/235-rendercore-award-popup-tier-skip-final-loop*.md
git diff --check
```

若纯 helper 未修改，第一条仍保留 `award-sequence.test.ts` 作为 threshold/stage 基线；失败时先缩小到单个 click case，不扩为
rendercore 全量 coverage 或根级 test/build。

### 人工验收

- Popup Editor：用最终值低于 bigwin 的预览在 base/standard 计数中点击一次，金额直接到 final；再点击不消失，Replay 可立即
  清理并重新开始。
- Popup Editor：用达到 megawin 的预览连续点击，观察 `bigwin threshold + bigwin`、`superwin threshold + superwin`、
  `megawin threshold + megawin` 同步跳转，最后 loop 持续显示。
- Game Layout Editor：播放当前 mode award，确认 canvas/keyboard 跳档与 Popup Editor一致；最后档不因点击关闭，点“立即关闭”
  或开始下一次真实 configured spin 后无残留画面。

### 独立验收建议

`建议`。不涉及 credential、服务器真实轮带、schema、ZIP 或新 resource ownership，但点击状态机直接影响金额展示和下一轮清理。
重点复验金额/大状态同步与最终 loop，不重复全套验收：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/award-player.test.ts tests/scene-layout/configured-round-adapter.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell 未加载 Node 时执行
  `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试原命令。
- 本任务不新增依赖、不修改 package manifest 或 lockfile。

## 10. 生成物、文档与规则

- 本任务不修改 YAML/schema、不产生生成文件，不运行 generator。
- 更新 `packages/rendercore/README.md` 和 `docs/popup-manifest.md` 的 award interaction 示例/合同，区分玩家 advance、显式
  graceful close 与 next-spin immediate cleanup。
- 更新 `docs/agent-rules/shared-game-runtime.md` 的稳定 presentation 规则：amount 与 tier 同步跳档，最终档持续 loop，
  `awaiting-dismiss` 不要求玩家点击且不阻塞下一次 spin。
- `docs/agent-rules/editor-artifacts.md` 已规定 Editor 复用同一 Popup Core 状态机；职责未变化，不重复追加一次性点击矩阵。
- 不修改根 `AGENTS.md`；精确阈值和执行证据继续留在 manifest、测试和任务报告。

## 11. 执行报告

执行完成后创建：

```text
tasks/235-rendercore-award-popup-tier-skip-final-loop-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、关键决策或偏差、实际验收结果、未完成人工验收和剩余风险；
不收集无关 coverage、整仓统计、历史矩阵或 profiler。

## 12. 风险、假设与待确认

### 风险

- 跳档时 formatter/ImgNumber rebind 与 tier visibility 的提交顺序若仍分离，可能修复 snapshot 数值却继续让画面显示旧文本；测试
  必须观察 renderer/effect 输入而不只看内部 raw amount。
- `awaiting-dismiss` 名称保留但语义从“等待玩家关闭”收窄为“等待 host cleanup/显式 close”，调用方若私下把 phase 当点击提示
  可能显示过时 UI；仓库内 consumer 搜索和人工 Editor状态栏需要复验。
- next-spin cleanup 当前依赖 configured round coordinator；绕过该 adapter 的 programmatic Popup 仍必须由 owner 使用
  `closePopup()`/`dismissImmediately()`，本任务不为任意 caller 猜测 spin 生命周期。

### 假设

- 用户所说 `megawin` 对应 manifest exact tier id `megawin`；“superwin”同理，不新增 `megaWin` 等 alias。
- “最后一档循环”表示保留本轮最后实际可达 tier 的 loop 和最终 ImgNumber，允许显式 host close；不表示删除 VNI end segment。
- “下一次 spin”指 configured Scene Layout round 的 coordinator start 边界，必须在 reel mutation 前同步清理。

### 待确认

无。需求可由现有 manifest、runtime、consumer 和测试合同确定。

## 13. 完成清单

- [ ] 点击矩阵、金额与视觉档位同步、最终 loop 和 next-spin cleanup 均满足。
- [ ] 自动播放、显式 close/end drain、immediate cleanup、重复播放和 destroy 无回归。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API/schema 未无故扩大，Core/Scene Layout/Editor职责保持单一。
- [ ] 指定自动化验收通过，两个 Editor 人工验收结果单独记录。
- [ ] README、Popup文档、领域规则和 UTC 中文执行报告已同步。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对 Git 基线与工作区，保留用户已有和无关修改；
3. 先用失败测试固定 amount/tier 同步和 final click no-op，再修改 Core runtime；
4. 按计划实现，小幅适配当前代码时在报告记录，明显扩大范围时先停止说明；
5. 只运行计划规定的 L1 验收并区分自动化与人工 preview；
6. 完成后生成 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
