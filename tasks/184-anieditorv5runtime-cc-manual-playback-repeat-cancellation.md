# 184 anieditorv5runtime-cc-manual-playback-repeat-cancellation 任务计划

## 1. 目标与完成定义

### 目标

修复 `packages/anieditorv5runtime-cc` 的 manual cyclic playback 在游戏中反复开始、主动重置或
销毁时出现的取消异常与重入竞态。任务 125 首先在 `packages/vnicore` 实现连续周期选择，任务 126
把同类能力同步到 Cocos runtime；本任务只处理该 Cocos 能力进入真实游戏后的重复调用生命周期。

游戏开始新一轮时可以取消仍在 initial capture、intro、`advanceFor()` 慢速段、selection commit 或
ending 的旧一轮。旧一轮必须停止并完整回滚，不能产生浏览器 `Uncaught (in promise)
V5GCocosPlaybackCancelledError`，也不能在取消后继续修改新一轮的 session、flag、carrier 或宿主 Node。

### 完成定义

- [ ] 游戏连续重复开始 manual cyclic round 时，旧 round 的预期取消可被稳定识别和收口，不产生
      `unhandledrejection`；真正的 capture、状态、资源或参数错误仍向调用方失败。
- [ ] 旧 round 的任一异步 continuation 都不能覆盖或推进当前 round；新 round 只有在旧 round 已进入
      明确的取消/清理边界后才能发布为 current。
- [ ] session/operation/transaction/player 的 cancel、destroy 和 late callback 均幂等；pending capture、
      replacement、motion override、hold、listener 和 runtime-owned 资源完整回滚。
- [ ] 任务 126 的 public `completed` / `ready` / `committed` reject-on-cancel 合同继续保持，避免取消后
      旧业务流程被当作成功继续执行。
- [ ] modular、生成的 standalone、checker、README、示例和相关测试保持一致；本地
      `standalone.zip` 重建并验证。
- [ ] 使用提供的 `GambleRoll.ts` 调用顺序完成真实 Cocos Creator 3.8.6 重复轮次验收，并生成任务
      184 UTC 中文执行报告。

## 2. 范围

### 包含

- manual playback 取消错误的稳定 public 识别方式，以及 modular/standalone export parity。
- session 销毁对 active range、`advanceFor()`、initial binding、selection transaction 和异步 capture 的
  exactly-once settle、detach、rollback 与 late completion 隔离。
- Cocos player 当前 manual session ownership 在“取消旧 round → 创建新 round”边界的验证与必要修正。
- 一个与 `GambleRoll` 相同调用形状的 restart-safe consumer 编排：每轮独立 local context、单调代次、
  current 身份检查、只吞掉已被替代 round 的 cancellation，并在 `finally` 清理自己拥有的 session。
- 取消发生在 initial prepare、intro、slow `advanceFor()`、selection prepare、ending、Component destroy
  各阶段的定向测试与重复压力回归。
- README、standalone 示例、checker、生成物和本地 ZIP。

### 不包含

- 不修改任务 125 的 `packages/vnicore` / Pixi 实现，也不追求两边新增 consumer helper 的同步。
- 不修改 VNI schema、编辑器、导出 JSON、`card_carousel_3d` 数学、动画阶段、目标对齐或视觉参数。
- 不把取消改为普通完成，不吞掉未知异常，不用空 `catch`、timer、Tween、schedule 或 Promise 延时掩盖
  竞态。
- 不让 runtime 持有游戏的 `dotlv`、`freeNum`、prefab、`GambleItem`、业务 flag 或 round 状态机。
- 不把 `/Users/zerro/Downloads/GambleRoll.ts` 或截图复制进仓库；下载目录样本只作为调用与人工验收
  依据。
- 不新增依赖、不修改 lockfile、package version、根工具链或无关 package。

## 3. 制定计划时的基线

```text
UTC: 2026-08-07T10:21:50Z
HEAD: e6a1020a7a035e6a01b4e7c671a86c9427302a94
branch: detached HEAD
git status --short --untracked-files=all: clean
```

执行时重新核对 HEAD、工作区和 ignored `standalone.zip`；保留用户后续产生的无关修改，不 reset、
checkout、stash 或顺手格式化。

实际读取：根 `AGENTS.md`、`docs/agent-rules/cocos-runtime.md`、`tasks/templates/task-plan.md`、任务
125 计划、任务 126 计划/报告、目标 package 的 README/source/tests/standalone 生成链。目标 package
下没有更深层 `AGENTS.md`。

外部诊断输入：

```text
/Users/zerro/Downloads/GambleRoll.ts
SHA-256: 2e7aa8168cf1ef81077a34d75cc47914a3b48c987177f9a95f20907270252aa8

/var/folders/cd/n3582jj17nv6fx4zw7r3qyw00000gn/T/
  codex-clipboard-1617ad5b-b412-417f-84b5-60990b718cf5.png
SHA-256: 8d6464824380e9a3e3ff276973465c1591bbfee5ec2aa8c8d06c20ebce2704d5
```

当前实现与故障结论：

- `src/cocos/manual-playback.ts::V5GCocosManualPlaybackSessionImpl.destroy()` 会 cancel active range 和
  active advance；`createDeferredOperation().cancel()` 按任务 126 合同以
  `V5GCocosPlaybackCancelledError` reject `completed`。
- `setInitialItems()` 和 `prepareSelection()` 也有可取消 Promise；controller destroy 会取消 pending
  binding/transaction 并释放未提交 capture。
- `src/cocos/player.ts::createManualPlaybackSession()` 强制一个 player 同时只有一个 manual session；
  session destroy 通过 `detachManualSession()` 解除 ownership。
- 提供的 `GambleRoll.resetManualState()` 先 release hold，再直接 destroy current session；当
  `playSlowLoop()` 正在 `await session.advanceFor(...).completed` 时，该 await 会按设计 reject。
- `playSlowLoop()` 等公开 async 方法的上层若未 await/catch，其返回 Promise 变成截图中的
  `Uncaught (in promise)`。这不是可以通过重复调用次数阈值复现的计数错误，而是旧 round 被新 round
  取消时缺少终端 cancellation 收口。
- `GambleRoll` 把 session/controller/descriptor 和 `introPlayed` / `slowLoopPlayed` 放在共享字段，且
  `prepareRandomBindings()` 在 async initial capture 完成后才发布 session；并发 round 还存在旧 await
  回来覆盖新字段、未发布 local session 无法被 reset 找到等竞态。
- `RollDestroy()` 中 session 与 player 连续 destroy 本应幂等；“两者一起报错”实际是 pending Promise
  的取消拒绝未被业务入口收口，不能靠少调用一次 destroy 解决。
- README 基础示例没有展示取消分支；standalone 示例用 `try/finally` destroy，但 Component 在其 async
  flow 未完成时销毁，仍需要对预期 cancellation 做终端处理。
- 现有测试验证单次 cancel/reject 和 20 轮 replacement pool 有界，但没有覆盖真实 consumer 的
  “新 round 抢占旧 round”及浏览器 unhandled rejection。

## 4. 需求解释与技术决策

### 需求解释

- “重复调用很多次最后报错”按现有证据解释为允许新 round 抢占旧 round，而不是要求多个 manual
  session 并行共享同一 player。
- 新 round 是当前 owner；旧 round 的 cancellation 属于预期控制流，仅当它确实由更新代次或
  Component/player destroy 触发时才可收口。
- capture 失败、非法 prefab/Node/尺寸、错误 phase、unknown animation、非 cancellation rejection
  必须保留原错误和 stack，不得伪装成一次正常重置。
- `GambleRoll.ts` 位于仓库外，实施会用其调用形状建立 package 内回归与文档示例；真实游戏源码的
  同步修改由游戏工程应用，不能把 Downloads 文件当正式 consumer 或生成物。

### 关键决策

1. **保留 reject-on-cancel，增加稳定取消识别合同**
   - 保留 `V5GCocosPlaybackCancelledError` 与现有 Promise 语义。
   - 增加最小 public type guard（预期命名
     `isV5GCocosPlaybackCancelledError(error: unknown)`），由 runtime 自己定义识别规则；consumer 不
     依赖 message 文本，也不以所有 `Error` 都可忽略。
   - 不把 `completed` 改为 `{ reason: "cancelled" }` resolve；否则当前 `await` 后的旧 round 会继续把
     `slowLoopPlayed` 等共享状态写成成功，形成更隐蔽的跨轮污染。

2. **代次与 session identity 属于 consumer orchestration**
   - 每次 restart 先递增 generation，使旧流程失去发布资格，再 cancel 旧 session。
   - 每轮所有异步步骤只捕获 local `session/cyclic/descriptor/nodes`；每次 await 后验证 generation 与
     current identity，不能重新读取可能已指向新 round 的共享字段。
   - cancellation 只有在 round 已被替代或 host 正在 destroy 时收口；current round 自发出现的同类
     错误继续抛出，以免隐藏 runtime 缺陷。
   - `finally` 只清理由该 flow 创建且仍属于自己的 session/nodes；不得让旧 `finally` destroy 新
     session。

3. **runtime 继续拥有取消、回滚和资源边界**
   - operation/transaction cancel 最多 settle 一次；late capture 或 range-completion callback 只能
     release 自己的未提交资源，不能再次 reject、commit 或重连已销毁 session。
   - player detach 后立即允许建立下一 session，但新 session 不复用旧 controller、capture lease、
     motion override、hold 或 completion callback。
   - 宿主 Node/Prefab 仍由 consumer 拥有；runtime 只清理 capture、RenderTexture、SpriteFrame view、
     slice view 和内部节点。

4. **用 package 内 harness 固化真实调用形状**
   - 测试构造与 `GambleRoll` 等价的 intro → hold/continuous → `advanceFor(1.5)` → selection → ending，
     并在每个 await 阶段启动下一 round。
   - 捕获测试进程的 `unhandledRejection` 只能作为补充；主断言必须直接 await 每轮 flow，验证旧轮为
     已识别 cancellation、最新轮正常完成、资源计数归零且非 cancellation 错误不被吞。

5. **standalone 由 modular source 生成**
   - production 逻辑只修改 `src/`，再运行正式生成器。
   - checker、import/parity/player test 和 README/example 同步 public guard 与 restart-safe pattern；禁止
     手改生成的 `standalone/anieditorv5runtime-cc.ts`。

## 5. 职责与合同

- **manual playback core**：创建明确 cancellation error、提供稳定 type guard、保证 operation/binding/
  transaction exactly-once settle 和 destroy rollback。
- **Cocos player**：拥有唯一 active manual session、manual clock/range completion 和 detach 边界；不拥有
  游戏 round generation。
- **consumer**：拥有最新 round、入口串行/抢占策略、业务 Node 和业务 flag；只收口已确认过期 round
  的 cancellation。
- **standalone**：与 modular 使用同一错误分类、destroy 和 export 合同，不建立 private fallback。
- **失败策略**：unknown error、current-round cancellation、非法状态、capture/commit failure 显式失败；
  rollback 失败不得被原 cancellation 覆盖，应保留可诊断错误。
- **禁止行为**：按 error message 字符串吞异常、全局 `unhandledrejection` handler、空 catch、静默重试、
  多 session 并行写同一 player、销毁宿主 Node、逐帧 capture 或通过延时规避竞态。

## 6. 文件范围

### 预计新增

```text
tasks/184-anieditorv5runtime-cc-manual-playback-repeat-cancellation-<utctime>.md
```

测试优先放入现有 player/standalone player test；只有测试职责明显膨胀时才新增专门的
`tests/cocos/manual-playback-repeat.test.ts`，并在报告说明。

### 预计修改

```text
packages/anieditorv5runtime-cc/src/cocos/manual-playback.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/README.md
```

`player.ts` 仅在新增重复/late-callback 测试证明 session detach 或 completion cleanup 存在缺口时修改；
不得为了制造 diff 改写已正确的 ownership 代码。

本地正式生成物：

```text
packages/anieditorv5runtime-cc/standalone.zip
```

### 原则上不应修改

```text
/Users/zerro/Downloads/GambleRoll.ts
packages/vnicore/**
docs/anieditor5/**
packages/anieditorv5runtime-cc/src/core/**
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player-pool.ts
packages/anieditorv5runtime-cc/tests/fixtures/**
docs/agent-rules/**
AGENTS.md
pnpm-lock.yaml
```

若实现需要改变 cancellation resolution、允许并行 session、修改 capture ownership、schema、lockfile
或游戏业务代码，先停止说明范围扩张。

## 7. 实施步骤

1. **确认执行基线与最小复现**
   - 重核 HEAD/status、任务 126 合同、manual session/player teardown、standalone 生成链和外部样本 hash。
   - 先在 fake Cocos 中复现 slow `advanceFor()` 被下一 round destroy，并确认 rejection 来源、session
     detach、capture release 和 late callback 行为；不先改生产代码。
2. **补充取消识别与 exactly-once 生命周期保护**
   - 在 `manual-playback.ts` 增加稳定 public cancellation type guard，并覆盖正例、普通 Error、伪造
     message 和非 Error 输入。
   - 为 operation/binding/transaction 的 cancel → destroy → late resolve/reject 组合补断言；仅修复测试
     实证的重复 settle、残留 callback 或资源回滚缺口。
   - 验证 player session detach 后可立即创建新 session，旧 callback 不影响新 session/manual clock。
3. **建立 restart-safe consumer 示例**
   - 在 standalone 示例中把 manual flow 收敛为每轮 local context；加入 generation/current identity 和
     terminal cancellation handling，所有 await 后禁止旧轮发布状态。
   - README 给出最小 repeat/restart、Component `onDestroy()` 和异常分类模式，并说明 Downloads 中
     `GambleRoll.resetManualState()` / 各 async 入口应如何迁移。
4. **补齐重复与阶段矩阵测试**
   - modular 测试分别在 initial capture、intro、advance、selection、ending 时抢占，验证旧轮取消、
     最新轮完成、host Node 未销毁、runtime-owned capture/view 释放且 diagnostics 回到基线。
   - 加入多轮顺序和快速重入压力测试；使用确定帧 delta，不依赖 wall-clock timer 或随机等待。
   - 注入普通 capture/validation 错误，证明 guard/pattern 不会吞掉真正失败；player destroy 重复调用幂等。
5. **同步 standalone 与交付物**
   - 更新 checker 和 standalone import/parity/player tests，再运行 `standalone:build` 生成单文件 runtime。
   - 重建 `standalone.zip`，核对 runtime、示例和 screen Effect 内容、大小及 SHA-256。
6. **定向验收与报告**
   - 运行第 8 节 L2 命令并检查 diff/旧 message-based catch 残留。
   - 在 Creator 3.8.6 以真实 `GambleRoll` 集成做重复轮次验证；未能修改游戏工程时明确标为待用户
     复验，不用 fake 测试冒充。
   - 生成任务 184 UTC 中文执行报告，记录实际修改、计划偏差、命令结果、ZIP hash 和人工验收状态。

## 8. 测试与验收

### 测试原则

- cancellation 是预期但显式的终止结果；测试必须消费并分类它，不能靠测试框架全局吞 rejection。
- 每个重入阶段同时验证状态、Promise settle 次数、session ownership、host Node validity 和 runtime-owned
  资源计数。
- 只完成最新 generation；旧 generation 即使收到 late capture/commit callback 也不得改变结果。
- 真实失败必须保持原类型/stack；测试不得为通过而把所有 rejection 都转成 success。
- fake Cocos 验证合同与资源计数，真实 Creator/browser 验证实际事件循环的 `unhandledrejection`、视觉和
  GPU 资源释放，两者不可互相替代。

### 验收级别

`L2`。任务增加 package public cancellation 识别合同，触及异步 transaction/destroy/resource ownership，
并更新 standalone 正式生成物和 ZIP；不改 schema、跨 package runtime、根工具链或 lockfile，因此不
升级 L3。

### 执行会话必须运行

```bash
pnpm --dir packages/anieditorv5runtime-cc standalone:build
pnpm --dir packages/anieditorv5runtime-cc test
pnpm --dir packages/anieditorv5runtime-cc typecheck
pnpm --dir packages/anieditorv5runtime-cc build
pnpm --dir packages/anieditorv5runtime-cc standalone:check
pnpm --dir packages/anieditorv5runtime-cc typecheck:standalone
git diff --check
```

共 7 条：package test/typecheck/build 分别证明行为、测试源码和 declaration；standalone 生成、边界
checker 与 ES2015 typecheck 是三个独立交付面；最后检查 diff。失败先最小化到具体取消阶段、player
detach 或 standalone parity，不运行根级整仓门禁。

### 人工验收

在 Cocos Creator 3.8.6 / Web Desktop 构建中应用 README 的 restart-safe 模式到真实游戏
`GambleRoll`：

1. 分别在 initial prepare、appear、1.5 秒 slow loop、result capture/commit、fast/stop/ending 中快速
   开始下一轮；控制台不得出现 `Uncaught (in promise)`，画面只响应最新一轮。
2. 连续执行至少 100 轮正常完成与中途重启混合流程，检查 carrier 数量、capture root/camera、
   RenderTexture/SpriteFrame、listener 和内存不持续增长，宿主 prefab Node 不被 runtime 销毁。
3. Component 销毁时同时存在 pending round，确认 session/player 可按 ownership 顺序幂等销毁；再注入
   一个真实非法输入，确认它仍显示为错误而不是被 cancellation handler 吞掉。

### 独立验收建议

`必须`。本任务直接处理异步 transaction、destroy、resource rollback 与外部游戏重入，且浏览器
`unhandledrejection` 不能由 fake runtime 完全证明。独立复验最多运行：

```bash
pnpm --dir packages/anieditorv5runtime-cc test
pnpm --dir packages/anieditorv5runtime-cc standalone:check
pnpm --dir packages/anieditorv5runtime-cc typecheck:standalone
```

并独立执行上述 Creator 快速重入场景。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 使用同一环境的 pnpm，不切换 npm/yarn，不强制修改版本。
- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`。
- 下载实际失败后才设置 `http_proxy` / `https_proxy` 为 `http://127.0.0.1:1087` 并重试原命令。
- 本任务不新增依赖、不修改 package version 或 `pnpm-lock.yaml`；如实现需要，先停止说明原因。

## 10. 生成物、文档与规则

- 先修改 modular source，再运行 `standalone:build`；禁止手改
  `standalone/anieditorv5runtime-cc.ts`。
- `standalone:check` 必须继续验证只依赖 `"cc"`、无 vnicore/Pixi/DOM/Node/相对 import，并检查新增
  cancellation guard public export。
- 自动化通过后重建 `standalone.zip`，只含 standalone runtime、`V5GPreview.example.ts` 和
  `effects/vni-screen-alpha.effect`；用 `zipinfo` 和 `shasum -a 256` 记录内容/hash。
- README 更新 cancel/restart、generation、current identity、`finally` ownership 与异常分类；不能把
  `GambleRoll` 业务表复制进 package 文档。
- 现有 `docs/agent-rules/cocos-runtime.md` 已规定失败/取消/destroy rollback、host Node ownership 和
  modular/standalone parity；本任务不改变长期职责，不修改领域规则或根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/184-anieditorv5runtime-cc-manual-playback-repeat-cancellation-<utctime>.md
```

时间戳使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现与文件、关键决策/偏差、每个取消阶段
的测试结果、standalone ZIP 内容/hash、Creator 重入验收状态和剩余风险；不收集无关 coverage、完整
历史、整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 只消除控制台 rejection 而不阻止旧 continuation，会让旧轮 flag/session 覆盖新轮，风险高于当前
  显式报错；generation 与 identity 测试是完成条件。
- initial Node capture 和 replacement capture 是异步资源 transaction；late callback 若未按 lease
  ownership 释放，会在多轮后形成 RenderTexture/SpriteFrame 泄漏。
- `GambleRoll` 的外层调用点不在样本内；如果调用者 fire-and-forget 且未应用终端 handler，package
  不能替它消费由 async wrapper 重新抛出的 Promise。
- 真实 Creator 的 Camera/RenderTexture 回调时序与 fake driver 不完全相同，必须保留人工重入验收。

### 假设

- 新 round 抢占旧 round 是允许的业务语义；同一 player 不要求两轮并行显示。
- 提供的 `GambleRoll.ts` hash 对应截图发生时的主要调用结构；执行时若游戏源码已变化，以最新源码
  重新核对 generation、session owner 和所有 async 入口。
- 任务 126 的 reject-on-cancel 是兼容合同，现有消费者可能依赖该错误区分完成与取消。

### 待确认

无。游戏工程不在当前仓库导致的人工集成状态应记录为验收结果，不阻塞 package 内计划执行。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、异步 transaction、资源 ownership 和 destroy 合同符合计划。
- [ ] 最新 round 正常完成，所有旧 round cancellation 已被精确收口且无 stale mutation。
- [ ] 非 cancellation 错误仍显式失败。
- [ ] modular、standalone、checker、README、示例和 ZIP 已同步。
- [ ] 指定自动化验收已通过，Creator 人工验收状态已明确记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/cocos-runtime.md` 和本计划；
2. 核对 Git 基线、工作区、外部样本 hash 与 standalone ZIP 状态；
3. 先建立阶段化最小复现，再按计划实现，不重新制定另一套取消语义；
4. 小幅适配当前实现时在报告记录；
5. 重大范围扩张时先停止说明；
6. 只运行计划规定的 L2 验收；
7. 完成后生成执行报告并区分自动化与 Creator 结果；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
