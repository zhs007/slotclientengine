# 259 rendercore-award-popup-countup-curve 任务计划

## 1. 目标与完成定义

### 目标

调整 RenderCore `award-celebration` Popup 的金额起跳、滚动速度曲线、最终停表和点击跳档逻辑：小于等于下注的获奖不再滚动；大于下注的获奖直接从下注金额进入 standard；金额速度按每档完整跨度与配置时长统一标定，跨档持续加速，只在实际最终值前减速；bigwin 及之后的点击不再受当前动画 `start` 段阻塞。

### 完成定义

- [ ] `winAmountRaw <= betAmountRaw`（含 exact bet）时，`start()` 同步提交最终金额，不产生中间金额写入、不消耗 base `countDurationSeconds`，随后直接进入现有正式 end/dismissing drain。
- [ ] `winAmountRaw > betAmountRaw` 时不播放 base 计数，首个可见计数状态为 standard，金额从 exact `betAmountRaw` 开始；低于 bigwin 的最终值也遵守此起点。
- [ ] standard 的速度始终按 `bet → bigwin threshold` 完整跨度及 standard `countDurationSeconds` 标定；例如最终值只有 2 倍下注时，只执行完整 1–15 倍轨迹的前段，不把 1–2 倍重新拉满 standard 全时长。
- [ ] bigwin、superwin、megawin 同样使用预先生成的档位速度描述；金额在非最终阶段内和跨档整体越来越快，不在每次切档时退回低速。只有最终停止尾段允许减速。
- [ ] 自然播放与点击跳过在抵达实际最终值前都进入同一减速尾段，在可用数值跨度内可观察到最后若干次金额变化；最终金额只提交一次，随后立即进入最后实际档位的 end/dismissing 并自动关闭。
- [ ] 点击跳到非最终里程碑时仍同步提交 exact threshold、切换 amount binding 和 active tier，不错误触发减速；点击跳向最终值时跳到预计算的最终减速入口并完成收尾，不直接越过停表细节。
- [ ] active bigwin/superwin/megawin 仍在 `start` segment 时，第一次 `requestAdvance()` 就立即退出当前 start 并进入下一个实际可达档位或最终减速尾段；不需要第二次点击，也不等待 start/loop 边界。
- [ ] `requestDismiss()`、`dismissImmediately()`、输入绑定、共享 ImgNumber identity、formatter override、资源复用与 destroy 合同保持；Popup Editor、Scene Layout 和游戏继续复用同一 Core 状态机。
- [ ] 定向自动化、Popup Editor 与 Game Layout Editor 人工验收、README/Popup 文档、稳定领域规则和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- `packages/rendercore/src/popup` 内 award stage 起点选择、完整档位速度标定、连续加速轨迹、最终减速尾段和 advance 行为。
- 一个纯计算、无 Pixi/DOM 依赖的内部 amount motion plan，以及 Core runtime 对该 plan 的逐帧消费。
- Popup Core/player、Editor diagnostic wrapper 与 Scene Layout primary interaction 的直接回归测试。
- RenderCore Popup public 行为文档、Popup manifest 说明和 shared runtime 稳定规则的最小更新。

### 不包含

- 不修改 Popup v8 schema、manifest version、thresholdMultiplier、`countDurationSeconds` 字段形状或 Popup Editor 表单。
- 不把 easing、减速比例或速度表作为新的 authoring 配置；本任务使用 RenderCore 内部统一、具名、可测试的曲线参数。
- 不修改独立的 `packages/rendercore/src/win-amount` legacy player，也不在 app/gameframeworks 中复制 award 计数状态机。
- 不改变金额 formatter、raw scale、ImgNumber glyph/layout、VNI/Spine 资源 schema、audio cue 或 tier 美术内容。
- 不恢复最终 hold，不增加额外点击关闭；最终值仍按当前稳定合同自动进入 end/dismissing 并关闭。
- 不修改 production assets、游戏 YAML、生成物、依赖、lockfile、根工具链或无关 Popup 类型。

## 3. 制定计划时的基线

```text
UTC: 2026-08-28T04:16:19Z
HEAD: 2f7d76dace3f7162559dec9d2642f8d6f519774b
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/editor-artifacts.md`、`docs/agent-rules/shared-game-runtime.md`；`packages/rendercore` 下没有补充 `AGENTS.md`。
- `createAwardCountStages()` 位于 `packages/rendercore/src/popup/award-sequence.ts`。当前非零获奖总是先生成 `base: 0 → min(win, bet)`；`win > bet` 再生成 `standard: bet → min(win, bigwin threshold)`，之后按 exact manifest threshold 生成 bigwin/superwin/megawin。
- `DefaultAwardCelebrationRuntime.start()/update()` 位于 `packages/rendercore/src/popup/award-player.ts`。当前从 stage 0 开始，并用 `from + floor((to-from) * elapsed/duration)` 做每档线性插值；因此 `<= bet` 仍滚动，而 2 倍获奖也会把 `bet → 2bet` 拉满 standard 的完整 duration。
- 当前每次 `startStage()` 都把 `#elapsed` 清零并重新执行相同线性曲线，没有跨档速度连续性或加速计划，也没有最终减速子阶段。
- 当前 `requestAdvance()` 在 base/standard 跳到首个可达庆祝档或 final，在庆祝档跳到下一 stage 或 final；`finishAtFinalAmount()` 会同步写 final 并立即 `beginDismissing()`。advance 没有显式等待 segment，但必须增加“动画 start 永不完成也能单击跳出”的直接证据，避免 consumer 或 runtime 回归为两次点击。
- VNI layer 的 `requestEnd()` 已使用 immediate range end；Spine layer 的 `applySegment("end")` 可直接启动 end animation。输入由 Popup Editor preview 和 Scene Layout `requestPrimaryPopupInteraction()` 转发到同一个 `requestAdvance()`，无需 app 私有分支。
- `AwardCelebrationPhase` 当前只有 `idle | counting | dismissing | complete`。最终减速可作为 `counting` 内部 motion mode 表达，不需要扩大 public phase union。
- `packages/rendercore/tests/popup/award-sequence.test.ts` 只验证 reached tier；`award-player.test.ts` 主要验证线性阶段、跳档同步和最终 auto-dismiss，尚未覆盖完整档位速度标定、单调加速、终点减速或 start-segment 单击跳出。
- 当前 `packages/rendercore/README.md`、`docs/popup-manifest.md` 与 shared runtime 规则约定最终值自动 end/dismiss；Popup 文档中仍有一处旧的“最终档继续 loop”示例，实施时一并统一为当前和本任务目标合同。
- 本规划会话只新增本计划；未修改运行时代码、安装依赖或运行测试/构建。

## 4. 需求解释与技术决策

### 需求解释

金额档位按以下业务区间解释：

1. **base（0–1 倍下注）**：不再做金额滚动。最终值不超过下注时直接显示 final 并结束；最终值超过下注时整个 base 被跳过。
2. **standard（1 倍下注–bigwin threshold）**：`win > bet` 的计数统一从下注金额开始。实际 final 若只到区间中部，只走同一完整 standard 曲线的对应前段。
3. **bigwin/superwin/megawin**：进入 threshold 时同步切换视觉档位，金额轨迹延续此前速度趋势；点击一次只跳一个实际可达里程碑，或进入最终停止尾段。
4. **最终停止**：是全场唯一减速区间。自然抵达和玩家 advance 到 final 都复用该区间；`<= bet` 的 direct-final 特例不制造滚动或减速。

“用完整时间算速度”解释为：每个封闭区间的 nominal rate 由 manifest 完整 threshold span 除以该档 `countDurationSeconds` 得到，不能用本轮较短的 actual final span 除以相同 duration。`countDurationSeconds` 因此是完整区间的速度标定输入；当跨档连续加速包络需要提高后续速度时，后续档位允许早于其 standalone nominal duration 抵达，不能为了守住每档固定墙钟时长而在档位边界减速。

### 关键决策

1. 在 Popup Core 新增内部 immutable `AwardAmountMotionPlan`（具体命名执行时可小幅调整），由 `start()` 一次性根据 bet、final、manifest thresholds 和 durations 构造。plan 只保存常量数量的 stage/curve descriptor，不按 raw amount 枚举速度，避免大额获奖造成 O(amount) 内存或启动耗时。
2. 封闭区间的 canonical span 固定为 `bet→bigwin`、`bigwin→superwin`、`superwin→megawin`。megawin 没有下一 threshold，其 nominal span 使用最近一个封闭 celebration span（`superwin→megawin`）作为速度标定单位，并按 megawin duration 延续曲线；不得改用任意 final 值重新定义整档速度。
3. 先计算各档 `canonical span / duration` nominal rate，再构造不低于上一档终端速度的单调加速包络；每档内部用单调 ease-in/连续速度曲线推进，档位切换不重置低速。具名内部参数和公式写在纯 helper 中并用性质测试固定，不散落 magic number。
4. actual final 截断某档时，通过完整档位曲线的 amount 位置求对应 elapsed/trajectory point，不重新把 `[stage start, final]` 归一化为 `[0, duration]`。这直接保护“1 倍到 2 倍沿用 1 倍到 bigwin 的速度”合同。
5. 预计算唯一 terminal braking descriptor：从最终可达曲线上的一个确定入口开始，保证 amount 单调不回退、速度逐步下降并 exact 落到 final。减速窗口由具名 Core tuning 与当前可用跨度共同裁剪；数值跨度不足时允许减少可见中间写入，但不得 overshoot、重复 final 或人为制造负数。
6. `requestAdvance()` 跳到非最终 threshold 时继续同步 commit exact amount/tier；跳到 final 时进入 terminal braking：若当前值早于减速入口则同步跳到入口，若已在入口之后则从当前值减速，绝不倒退。减速期间重复 advance 幂等，不用第二次点击越过 stop effect；显式 host `requestDismiss()` 仍可直接提交 final 并开始 end。
7. 不增加 public phase。普通推进和 terminal braking 都属于 `counting`；snapshot 继续通过现有 amount/tier/segment 观察。若实现需要内部 discriminant，只留在 Core private state，不暴露 mutable motion plan。
8. 点击命令不等待动画 segment：即使当前庆祝档仍是 `start` 且 fake runtime 永不报告 loop-ready，也必须在本次同步调用中请求当前档 immediate end、提交目标 amount/tier 并开始目标档；不在 input binding、Scene Layout 或 Editor 增加第二次点击/latch。

## 5. 职责与合同

- **Popup data**：继续拥有 exact thresholds、每档 `countDurationSeconds`、层和资源；不新增曲线 schema，不改变旧版本 normalizer。
- **Popup Core sequence/motion**：拥有 reached stage、canonical span、nominal rate、连续加速包络、partial-stage 截断和 terminal braking 的纯计算合同。
- **Popup Core player**：只消费 immutable plan，负责 amount/formatter/共享 ImgNumber、tier visibility、start/loop/end 与 dismiss 生命周期的同步提交。
- **Scene Layout/runtime host**：继续只转发 primary interaction、逐帧 update 和显式 close/cleanup；不判断 bet 倍率、速度或动画 segment。
- **Editor**：Popup Editor wrapper 和 Scene Layout inspector 读取同一 runtime/snapshot；不保存 preview-only 速度表或复制状态机。
- **数据/API**：不改 Popup manifest、`AwardCelebrationInput`、runtime 方法签名或 public phase union；只改变既有 public command 的时间行为和注释。
- **时间合同**：任意有限非负 delta 都必须完整消费；跨 curve/stage/end 边界可在一次 update 内连续推进，不能 clamp 丢时间。相同累计 delta 的结果应与合理分片基本一致，金额必须单调且不超过 final。
- **金额提交**：automatic raw amount、formatted text、共享 ImgNumber 和 active tier 在 milestone/terminal commit 同步一致；相同 floored amount 不重复 formatter/renderer write，final 只自动提交一次。
- **资源生命周期**：沿用唯一 ImgNumber runtime、tier runtime cache、immediate abandoned-start end、正式 final end drain、immediate cleanup 和 destroy；motion plan 不拥有 Pixi/VNI/Spine 资源。
- **失败策略**：非法输入、unsafe threshold、non-finite 曲线值、非单调/不可求解 descriptor 或 formatter/resource 错误显式失败；不 fallback 到当前线性算法、固定帧率、首项资源或 final-derived nominal speed。
- **禁止行为**：不预生成逐 raw-unit 数组，不用 `setTimeout`/RAF，不在 app 猜 tier，不为点击创建并行 ticker，不因减速新建第二个 ImgNumber。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/award-amount-motion.ts
packages/rendercore/tests/popup/award-amount-motion.test.ts
tasks/259-rendercore-award-popup-countup-curve-<utctime>.md
```

纯 helper 的最终文件名可按现有命名小幅调整，但保持 Popup Core 内部且不从 public barrel 导出。

### 预计修改

```text
packages/rendercore/src/popup/award-player.ts
packages/rendercore/src/popup/award-sequence.ts
packages/rendercore/src/popup/core/types.ts
packages/rendercore/tests/popup/award-sequence.test.ts
packages/rendercore/tests/popup/award-player.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/README.md
docs/popup-manifest.md
docs/agent-rules/shared-game-runtime.md
```

若 `award-sequence.ts` 无需改变 stage 数据，只更新其测试/调用方即可，不为凑文件范围强改。Scene Layout 测试只在现有 primary interaction fixture 足以表达 start-segment click 时修改。

### 原则上不应修改

```text
apps/{popupeditor,gamelayouteditor,game002v2,game003v2,gameviewer,gameviewer2}/**
packages/rendercore/src/{popup/data,win-amount,image-string,vni-playback,scene-layout/data,symbol,reel}/**
packages/{gameframeworks,logiccore,uiframeworks,vnicore}/**
assets/**
{package.json,pnpm-workspace.yaml,pnpm-lock.yaml,AGENTS.md}
```

执行时若必须修改 manifest/public type shape、Popup Editor 表单、VNI/Spine runtime、游戏 app 或 standalone win-amount player，应先说明现有 Core 合同为何无法满足，不能扩大范围后修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与行为矩阵**
   - 重核 HEAD/status、manifest thresholds/durations、stage construction、Core input dispatch 和 final auto-dismiss。
   - 固定 `win=0`、`win<bet`、`win=bet`、`bet<win<big`、exact big/super/mega、档位中部、`win>mega` 的 expected start amount/tier、motion path、click target 和 end 行为。
2. **建立纯 amount motion plan**
   - 在内部 helper 中从完整 threshold spans/durations 计算 nominal rates、跨档单调加速 descriptor、actual-stage cutoff 和唯一 terminal braking descriptor。
   - 提供按 elapsed/delta 求 amount、milestone、terminal 状态的纯接口；保证 O(tier count) prepare、O(1) 每帧求值、safe integer 边界和大 delta 跨段消费。
   - 用纯测试固定 1→15 的完整标定与 1→2 的早停关系、跨档速度趋势、终点减速、frame slicing parity、exact threshold 和 huge safe integer。
3. **接入 Core 起跳和自动播放**
   - `win<=bet` 直接挂载 base/final amount 后走正式 dismiss，不启动 amount motion。
   - `win>bet` 直接从 standard/bet 启动，共享 ImgNumber 先同步显示 bet，再由 motion plan 推进；删除对每档 `elapsed/duration * actual range` 的依赖。
   - 在自然 milestone 边界保持 amount、formatter、tier、resource rebind、segment enter 同步；在 final braking 完成后只提交一次 final 并 `beginDismissing()`。
4. **接入点击跳档与 start bypass**
   - 将 advance target 统一解释为 next reachable celebration threshold 或 terminal braking，不为 base/standard/celebration 分支维护多份速度计算。
   - 非最终 click 同步跳 exact threshold 并继续预计算加速轨迹；final click 从合法 braking entry 收尾。
   - 用 never-loop-ready animated layer 验证 bigwin/superwin/megawin 的第一次 click 在 start segment 就生效，旧档 immediate end，重复 click 不产生 double transition/final write。
5. **保护 consumer 与生命周期**
   - 更新 player 测试覆盖自然播放、点击播放、explicit dismiss、immediate cleanup、重复 start、formatter override、unchanged amount write suppression 和 destroy。
   - 通过 Scene Layout primary pointer/keyboard interaction 测试证明一击转发，不在 consumer 判断 segment；保留 FIFO/session 和 final completion 语义。
6. **文档、规则与收尾**
   - 更新 Core public 注释、RenderCore README、Popup manifest 示例和 shared presentation 规则，明确 base skip、full-span calibration、continuous acceleration、terminal-only braking 与 start-segment single-click bypass。
   - 删除 Popup 文档中与当前 auto-dismiss 冲突的 final-loop 残留示例；不更新 Editor 规则或根 `AGENTS.md`。
   - 运行 L1 定向验收、完成人工 preview 记录、生成 UTC 中文执行报告并检查最终 diff。

## 8. 测试与验收

### 测试原则

- 纯 motion 测试比较具体时间点的 amount/delta 与速度趋势，不依赖真实 Pixi/VNI；player 测试验证 amount/tier/segment/formatter/resource 的集成边界。
- 不只断言最终值：必须证明 `<=bet` 零中间写入、`>bet` 首值为 bet、2 倍 final 早于完整 standard duration、非终点采样增量逐步变大、最终采样增量逐步变小。
- 覆盖自然跨档与 click 跨档、click final braking、click during start、重复 click、zero duration、large delta、exact thresholds、floor/format write 去重和 final exact-once。
- “越来越快/慢下来”按受控采样窗口的非递减/非递增 amount delta 或等价解析速度断言，避免只看总时长造成假阳性；仅 terminal window 允许打破加速趋势。
- 不为过时的线性插值或 base 计数测试扭曲新生产合同；明确冲突的旧期望应更新。

### 验收级别

`L1`。改动限定在 `@slotclientengine/rendercore` 内部 Popup 算法和既有 public command 行为，不改 schema、方法签名、跨包 source API、生成器、资源、依赖或 lockfile；Scene Layout 也是同 package 的直接 consumer。目标 package typecheck、纯算法/Popup/Scene Layout 定向测试和两个 Editor 的人工预览足以证明本次变化。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/award-amount-motion.test.ts tests/popup/award-sequence.test.ts tests/popup/award-player.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm exec prettier --check packages/rendercore/src/popup/award-amount-motion.ts packages/rendercore/src/popup/award-player.ts packages/rendercore/src/popup/award-sequence.ts packages/rendercore/src/popup/core/types.ts packages/rendercore/tests/popup/award-amount-motion.test.ts packages/rendercore/tests/popup/award-sequence.test.ts packages/rendercore/tests/popup/award-player.test.ts packages/rendercore/tests/scene-layout/package-runtime.test.ts packages/rendercore/README.md docs/popup-manifest.md docs/agent-rules/shared-game-runtime.md tasks/259-rendercore-award-popup-countup-curve*.md
git diff --check
```

若纯 helper 最终采用不同文件名，同步替换上述两条路径；若 Scene Layout 文件未变化仍保留其目标测试，证明 public interaction 转发未回归。失败时先缩小到单一 motion/click case，不扩为 rendercore coverage 或根级 test/build。

### 人工验收

- Popup Editor：分别输入 `<bet`、`=bet`、`2×bet`；前两者金额直接 final 并结束，2 倍从 bet 起跳且明显早于完整 standard 时间停表，末尾能看到减速后的最后数字变化。
- Popup Editor：输入达到 megawin 的金额，自然播放观察 base 被跳过、standard 起点为 bet、各档数字整体越来越快，只有最终值前减速；档位视觉与金额 threshold 同步。
- Popup Editor：bigwin/superwin 的 start 动画刚出现时立即单击一次，确认该次点击已进入下一可达档或最终减速，不需要再点一次；点击 final 仍保留减速停表。
- Game Layout Editor：用 canvas 与 keyboard 重复上述 start-segment 单击和 final stop，确认行为与 Popup Editor 一致，最终 end 完整播放、FIFO 后项正常继续且无残留。

### 独立验收建议

`建议`。不涉及 credential、服务器真实轮带、schema、ZIP、资源 ownership 或 release，但金额节奏、点击状态机和最终关闭是直接用户可见的共享行为。重点复验算法性质和 start 单击：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/award-amount-motion.test.ts tests/popup/award-player.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell 未加载 Node 时执行 `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试原命令。
- 本任务不新增依赖、不修改 package manifest 或 lockfile；曲线计算只使用 TypeScript/JavaScript 数学能力。

## 10. 生成物、文档与规则

- 本任务不修改 YAML/schema、不产生生成文件，不运行 generator，也不手改 `dist/`。
- 更新 `packages/rendercore/README.md` 与 `docs/popup-manifest.md` 的 award timing/interaction 示例，明确 `countDurationSeconds` 是完整 canonical span 的速度标定、partial final 不拉满时间、base direct/skip、terminal braking 与 auto-dismiss。
- 更新 `docs/agent-rules/shared-game-runtime.md` 的稳定 presentation 规则：Core 唯一拥有 full-span motion plan、非最终连续加速、最终单次减速和 start-segment advance；amount/tier 继续同步提交。
- `docs/agent-rules/editor-artifacts.md` 已规定 Editor 复用 Popup Core；职责未变化，不重复加入具体曲线参数或测试矩阵。
- 不修改根 `AGENTS.md`。精确曲线公式和具名参数保存在 Core helper/测试，执行证据只进入任务报告。

## 11. 执行报告

执行完成后创建：

```text
tasks/259-rendercore-award-popup-countup-curve-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终公式/参数、实际修改文件、关键决策或偏差、自动验收结果、未完成人工验收和剩余风险；不收集无关 coverage、完整历史矩阵、整仓统计或 profiler。

## 12. 风险、假设与待确认

### 风险

- “跨档一直加速”与现有每档固定 duration/threshold span 的平均速度可能互相冲突；本计划明确让 duration 作为 nominal 标定，并由单调包络提高过慢的后续档位，而不是在边界减速。文档和人工节奏验收必须验证该语义符合产品感受。
- terminal braking 既要可见又不能让小跨度获奖拖沓；减速窗口必须按可用 amount span 裁剪，并用 2 倍、threshold exact 和超大 final 三类输入验证。
- amount 使用 safe integer、显示使用 formatter/floor；低 rawScale 或极小尾段可能没有足够 distinct 文本显示多次变化。此时保证单调、exact final 和不额外延时，不伪造小数或重复写相同文本。
- start-segment 跳档会立即结束/替换当前 VNI/Spine；必须继续排空官方 end/particle lifecycle，不能只隐藏后停止 update 而泄漏 runtime/audio。
- `docs/popup-manifest.md` 当前残留旧 final-loop 示例；若只改实现不统一文档，consumer 可能误判 auto-dismiss 合同。

### 假设

- 用户所说第一档、第二档、第三档分别对应 base、standard、bigwin；bigwin/superwin/megawin exact id 和 manifest 顺序保持不变。
- “第一档已经跳过”表示 `win>bet` 时 base presentation/count 都不进入；`win<=bet` 只用 base 最终画面执行正式 end，不滚动。
- “点击跳过也保留停止效果”适用于 `requestAdvance()` 跳向 actual final；显式 host `requestDismiss()` / immediate cleanup 仍以尽快关闭为优先。
- megawin 作为开放区间没有 next threshold，使用最近封闭 celebration span 作为 nominal 速度单位比用本轮 final 重算更符合“完整档位速度不由最终值决定”。

### 待确认

无。上述解释可由现有五档 manifest、Core lifecycle 和用户给出的 1–15 倍示例形成可执行合同；若实施时发现 production manifest 对 megawin 另有权威上界，先以该权威字段替代“最近封闭 span”假设并在报告说明，不新增第二份阈值。

## 13. 完成清单

- [ ] base direct/skip、standard bet 起跳、full-span 标定、跨档加速和 terminal braking 均满足。
- [ ] natural playback、click milestone、click final、start-segment first click 和 auto-dismiss 矩阵通过。
- [ ] amount、formatter、共享 ImgNumber、active tier/segment 和 final exact-once 保持同步。
- [ ] public API/schema 未无故扩大，Core/Scene Layout/Editor 职责与资源生命周期保持单一。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] 指定自动化通过，两个 Editor 人工验收结果与未完成项明确记录。
- [ ] README、Popup 文档、领域规则和 UTC 中文执行报告已同步。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的两份领域规则和本计划；
2. 核对 Git 基线与工作区，保留用户已有和无关修改；
3. 先用纯失败测试固定 full-span/partial、acceleration/braking 性质，再修改 player；
4. 用集成失败测试固定 base/standard 起点和 start-segment first click，再接入 Core；
5. 按计划实现，不为 Editor/game 增加私有逻辑；小幅适配当前实现时在报告记录；
6. 明显扩大 schema、public API、VNI/Spine 或 app 范围时先停止说明；
7. 只运行计划规定的 L1 验收，完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
