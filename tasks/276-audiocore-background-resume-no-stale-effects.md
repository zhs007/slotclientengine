# 276 audiocore-background-resume-no-stale-effects 任务计划

## 1. 目标与完成定义

### 目标

修复浏览器窗口或页面切到后台、再切回前台后，之前的瞬时音效被集中恢复并叠放的问题。由
AudioCore 统一拥有前后台音频生命周期：短促 `once` 音效在失焦时确定性取消，BGM 与仍有效的
`loop` intent 只暂停并在恢复后继续；RenderCore、Game Layout Editor 和游戏 app 不各自复制
`blur/focus` 处理或通过降低音量、限制并发来掩盖旧实例。

### 完成定义

- [ ] 已解锁音频后，在 Spin/Event 音效播放过程中切出窗口或标签页，再切回来，不会同时恢复此前
      已经过时的 `once` voice，也不会重复创建相同 loop/BGM。
- [ ] 进入后台时，pending 与 active `once` handle 均结算为 `stopped`，其 BGM/effect focus lease
      立即释放；后台期间发生的新 `once` event 直接丢弃，不进入恢复队列。
- [ ] BGM 与 event `loop` 在后台保持 exact owner/intent，前台恢复时只继续仍有效的一份；后台期间
      收到 end/stop/destroy 后，切回前台不得“复活”旧实例。
- [ ] 浏览器挂起与 audio focus `pause` 是两个独立 pause owner；切回前台不得越过仍有效的 focus
      lease，玩家 master/music/effect volume 也不被覆盖。
- [ ] 多个并存 AudioRuntime、异步 prepare/play、preview rebuild 与 destroy 都能幂等释放 listener、
      instance、handle 和全局 Pixi auto-pause ownership，不留下晚到播放。
- [ ] Spin lifecycle event 的地址、顺序、完整 elapsed-delta 消费和 manifest/schema 保持不变；完成定向
      自动化、真实浏览器切出/切回验收、文档与 UTC 中文执行报告。

## 2. 范围

### 包含

- AudioBackend 的中性 active/suspended lifecycle source，以及 AudioRuntime 对 transient/loop/music 的
  分层 suspension policy。
- `createPixiSoundBackend()` 对 `@pixi/sound` 6.0.1 全局 auto-pause 的单一协调与 owner-scoped
  `window blur/focus`、`document visibilitychange`、`pagehide/pageshow` 状态归一化。
- pending/active once、event loop、legacy loop effect、mode BGM、event music、focus lease、音量、异步
  start/stop/destroy 的竞争处理。
- RenderCore Scene Layout Event audio 的直接集成回归，以及 Game Layout Editor production preview 的
  真实浏览器验收。
- AudioCore 文档和最小 shared runtime 领域规则更新。

### 不包含

- 不改变 Game Layout Event catalog、Spin lifecycle producer、canonical address、event binding schema、
  voice authoring 默认值或音频资源格式。
- 不通过 clamp/discard RenderCore 的 `deltaSeconds`、暂停整个 Pixi ticker、延长 reel cadence 或重排
  spin event 来规避音频问题；画面仍消费完整受控 elapsed delta。
- 不把所有 `once` 改成互斥、不把 `maxConcurrent` 固定为 1，也不禁止前台正常发生的合法重叠音效。
- 不在 Gamelayout Editor/GameFramework/game app 各自监听浏览器事件，不使用 `sound.stopAll()`、
  `removeAll()` 或关闭共享 AudioContext。
- 不升级 `@pixi/sound`、Pixi、schema、依赖或 lockfile；不修改 production assets、YAML 或外部仓库。
- 不承诺绕过浏览器首次 autoplay/user-gesture policy；初次解锁仍使用现有 `unlockAudio()` trusted
  gesture。iOS 对系统级 `interrupted` 后拒绝自动恢复的情况只做显式失败/风险记录，不伪装成功。

## 3. 制定计划时的基线

```text
UTC: 2026-08-31T09:49:31Z
HEAD: e6bfa51ac52954393fa9541991c15c14b5aa66da
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `tasks/227-gamelayouteditor-audio-asset-workflow.md`
- `tasks/242-gamelayouteditor-global-event-audio.md`
- `tasks/273-editor-legacy-audio-authoring-removal.md`
- `tasks/274-rendercore-spin-lifecycle-events.md`
- `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md`
- `docs/audiocore.md`
- `packages/audiocore/README.md`

目标目录下没有补充 `AGENTS.md`。

当前结论：

- `packages/audiocore/src/core/pixi-backend.ts#createPixiSoundBackend()` 使用 `@pixi/sound` 6.0.1
  的 singleton AudioContext，但没有自己的前后台生命周期；backend instance 只代理 `volume/paused/stop/end`。
- `@pixi/sound` 默认在 `window blur/focus` 上全局 suspend/resume WebAudio。官方
  [`SoundLibrary.disableAutoPause`](https://pixijs.io/sound/docs/SoundLibrary.html) 文档确认默认 auto-pause；
  上游 [issue #258](https://github.com/pixijs/sound/issues/258) 记录了 blur 后 stop 的声音会在 focus 时继续播放，
  workaround 是禁用 library auto-pause。当前锁定版本 6.0.1 没有仓库内可依赖的修复。
- `packages/audiocore/src/core/runtime.ts#DefaultAudioRuntime` 已持有全部 pending/active effect、event track、
  music voice、focus lease 和 destroy 边界，因而是决定“取消 transient、保留 loop”的唯一合适 owner；当前
  `AudioBackend` 不会上报浏览器 suspension。
- `DefaultAudioRuntime.startPlayback()` 对 loop 已按 playback key 去重，对 once 已按 route voice policy 有界；
  问题不是缺少普通前台并发限制，而是全局 backend 暂停后旧 voice 的 ownership 与恢复失配。
- `packages/rendercore/src/scene-layout/package-runtime.ts#bindEventAudio()` 会在已解锁后同步把每个 event 映射为
  `playTrack()`；loop 另有 `#eventAudioLoopIntents`，once 在解锁前本就丢弃。该层无需解析浏览器状态，也不应
  为 Spin event 建立特殊分支。
- `apps/gamelayouteditor/src/preview/layout-preview.ts` 复用 production package runtime，preview rebuild 会销毁
  旧 runtime 并把 session 的 unlocked 状态应用到新 runtime；因此修复 shared backend/runtime 后无需 app-local
  audio owner。
- Shared rules 要求 reel 低 FPS/长帧完整消费 elapsed delta，禁止用宿主 clamp 丢时间；本任务必须隔离在音频
  output lifecycle，不能改变任务 274 的真实 Spin edge。

## 4. 需求解释与技术决策

### 需求解释

1. “切出去”同时覆盖窗口失焦、标签页 hidden 和 pagehide；这些信号可能不同时发生，必须归一成单一
   suspended state，并对重复/乱序事件幂等。
2. “音效全部叠放”指切回时恢复已经过时的短促 voice，不代表前台同一时刻按配置允许的合法多 voice
   也必须互斥。
3. `once` 是瞬时表现，失去可听时间窗口后不补播；`loop`/BGM 表达持续状态，只要其 start intent 未被
   end/stop 覆盖就应恢复，不从头创建第二份。
4. 前后台 lifecycle 是 backend output capability，不属于 Scene Layout event 或 app UI；AudioRuntime 根据
   playback contract 解释它，Pixi adapter 只负责报告真实浏览器状态。

### 关键决策

1. **禁用 Pixi 全局 auto-pause，由 AudioCore 接管自己的实例。**
   - Pixi backend 首个 active owner 保存并关闭 `soundLibrary` 的 auto-pause，最后一个 owner 释放时恢复原值；
     多 runtime 使用模块级引用计数协调同一个第三方 singleton，不建立第二份 sound registry。
   - 只操作 AudioCore 创建的 instance；不调用 Pixi global pause/resume/stop/remove API，避免一个 runtime 影响另一个。
2. **Backend 只上报 interruption，Runtime 决定播放语义。**
   - 给 `AudioBackend` 增加明确的当前 activity snapshot 与订阅/dispose 合同；默认 Pixi backend 归一化 browser
     signal，自定义 backend 必须显式实现中性的 active/suspended capability。
   - AudioRuntime constructor 读取初始状态并订阅，destroy 先注销订阅再清理 voice，防止晚到 focus 回调。
3. **后台取消 transient，暂停 persistent。**
   - suspend 原子取消全部 pending/active once，并走既有 `finishActive(...,"stopped")` 清理 focus 与 handle；
     suspended 期间的新 once 返回已结算 `stopped` handle，不 prepare、不排队。
   - loop pending/active 与 music request 保留 exact intent；active instance 只切 paused，resume 后继续原 instance。
     suspended 期间的 loop/music prepare 可以完成，但 backend `play()` 必须延后到 active 且 generation 仍 current。
4. **pause 使用组合状态，不互相覆盖。**
   - instance 最终 paused = browser suspended OR 有效 audio-focus pause；resume 只释放 browser owner。
   - master/category volume、duck gain、music crossfade 与 pending delay 在 suspended 期间冻结，恢复后从原进度继续，
     不把后台 wall time计入 host-clock 音频时间。
5. **异步结果以 generation/owner 为准。**
   - prepare/play 返回前若发生 stop、end intent、supersede、suspend 或 destroy，晚到 instance 立即 stop，不能注册 active、
     获取 focus 或发布 music started。
   - loop/music 只有实际 backend instance 首次开始时发布既有 lifecycle；pause/resume 不伪造 stopped/started。
6. **不改 Spin 与画面时钟。**
   - RenderCore 继续完整处理长帧并发布真实 event；当窗口 blur 后 ticker 仍运行时，AudioRuntime 会丢弃期间的
     once event，因此 focus 时没有积压 voice。标签页完全停止 ticker 时，恢复后的画面/事件仍按既有切片合同推进。

## 5. 职责与合同

- **Audio backend**：拥有第三方 library/global context 的适配、浏览器 activity 归一化、owner subscription 和 raw
  instance；不知道 event address、route、music/effect category 或 focus policy。
- **Audio runtime**：拥有 playback handle、once/loop/music intent、voice bound、focus lease、pause owner 组合、
  host-clock update、async generation 与 destroy。
- **RenderCore Scene Layout**：继续把 canonical event 映射到 AudioRuntime，并保存 loop start/end intent；不监听 DOM、
  不检查 tab state、不重放 once。
- **Editor/game host**：继续只负责 trusted gesture unlock 与正常 ticker；不创建第二套 AudioContext 或恢复列表。
- **资源生命周期**：activity disposer、pending prepare、sound、instance、focus lease 和 handle 都必须由创建它们的
  runtime/backend 确定性释放；最后 owner 才可恢复 Pixi 原始 auto-pause 设置。
- **失败策略**：非法 activity transition、resume/backend error、destroy 后回调和 unsupported AudioContext 显式失败；
  不以静音成功、重新创建全部声音或无限重试作为 fallback。
- **禁止行为**：全局 `stopAll/removeAll`、app-local visibility listener、后台 once queue、focus 时 replay、降低
  maxConcurrent、clamp render delta、重复 event 状态机。

## 6. 文件范围

### 预计新增

```text
tasks/276-audiocore-background-resume-no-stale-effects-<utctime>.md
```

### 预计修改

```text
packages/audiocore/src/core/{backend,pixi-backend,runtime}.ts
packages/audiocore/tests/{audio-runtime,pixi-backend}.test.ts
packages/audiocore/README.md
packages/rendercore/tests/scene-layout/package-runtime.test.ts
docs/audiocore.md
docs/agent-rules/shared-game-runtime.md
```

若集成测试证明 Scene Layout 需要透传 generic activity diagnostics，可最小修改：

```text
packages/rendercore/src/scene-layout/{package-runtime,types}.ts
packages/rendercore/README.md
```

该扩张只允许暴露中性音频状态/失败，不得加入 browser DOM 或 Spin 专属分支。

### 原则上不应修改

```text
apps/gamelayouteditor/src/**
packages/rendercore/src/reel/**
packages/rendercore/src/scene-layout/core/runtime-address-*.ts
packages/gameframeworks/**
packages/uiframeworks/**
apps/game*/**
assets/**
pnpm-lock.yaml
package.json
```

若真实复现表明问题来自 event 重复派发而非 backend auto-pause，或必须改变 Spin elapsed/event 顺序，属于本计划的
根因假设失效；执行时应停止并提交最小复现证据，不能顺手扩大范围。

## 7. 实施步骤

1. **固定可重复基线**
   - 用 fake activity backend 复现：多个 once 已 active/pending，suspend 后 stop/end/destroy，resume 不得恢复；记录
     当前实现缺少 activity 输入的失败期望。
   - 用 Pixi backend mock 固定默认 auto-pause、blur/focus/visibility/pagehide 状态归一化和多 owner 行为。
2. **建立 backend activity 合同**
   - 在 `backend.ts` 增加 frozen activity state/event 与 snapshot/subscribe/dispose API；定义重复 state、listener throw、
     subscribe during suspended 和 dispose-after-destroy 语义。
   - 更新 fake backend 和 source-boundary 类型使用，不把 DOM 类型泄漏进 generic runtime。
3. **实现 AudioRuntime suspension state machine**
   - 增加当前 activity、subscription disposer和统一 `applyPausedState()`；suspend 时原子 stop once、释放 focus，冻结时钟。
   - 重构 effect/track/music async start，使 suspended defer、stop/supersede/destroy generation 和晚到 instance 收敛到唯一
     cleanup；resume 只启动仍 current 的 persistent intent。
4. **接管 Pixi 前后台行为**
   - 在 `pixi-backend.ts` 惰性取得 `soundLibrary`，以共享引用计数关闭/恢复第三方 auto-pause；安装并去重 browser
     signal，按 backend owner 分发 activity。
   - 保持每个 `PixiBackendSound/Instance` owner-scoped；验证 suspended stop 后 focus 不再触发第三方全局 resurrection。
5. **补齐 consumer 回归**
   - AudioCore 覆盖 pending/active once、loop、music、focus pause/duck、player volume、async races、multi-runtime 与 destroy。
   - RenderCore 使用自包含 Scene Layout fixture 绑定 Spin/普通 event audio，证明后台 once 丢弃、loop end 生效、resume
     不重复以及 audio failure 仍走既有显式边界；不读取 production assets。
6. **文档、人工验收与报告**
   - 更新 AudioCore 文档与 shared rule，明确 transient-drop/persistent-pause、第三方 auto-pause ownership 和 trusted unlock。
   - 在 Game Layout Editor production preview 做真实切出/切回矩阵；完成定向命令后生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 自动测试用可控 backend/activity source 验证精确 handle/instance/focus 状态，不用 timer 或真实音频文件冒充浏览器。
- 正常前台 voice overflow、loop dedupe、music crossfade、mute/volume 和 event order 保持原测试期望。
- 真实浏览器验收必须观察可听结果与实例诊断；单测不能证明 WebAudio focus/blur 行为。

### 验收级别

`L2`：修改 AudioCore public backend lifecycle contract，并影响直接 consumer RenderCore Scene Layout 的 Event audio；
不改 schema、生成器、依赖、lockfile 或根工具链，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/audiocore typecheck
pnpm --filter @slotclientengine/audiocore exec vitest run tests/audio-runtime.test.ts tests/pixi-backend.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime.test.ts
pnpm exec prettier --check packages/audiocore/src/core packages/audiocore/tests/audio-runtime.test.ts packages/audiocore/tests/pixi-backend.test.ts packages/audiocore/README.md docs/audiocore.md docs/agent-rules/shared-game-runtime.md
git diff --check
```

失败时先以单个 activity/voice case 最小化，不运行根级全仓 test/build/lint。

### 人工验收

1. 在 Game Layout Editor 导入含 Spin lifecycle Event once 音效和一条 loop/BGM 的自包含 layout，点击解锁并开始
   Spin；音效尚在播放时切到其它窗口，等待画面流程推进后切回：不得集中爆发旧 once，loop/BGM 只恢复一份。
2. 后台期间让 loop 对应 end event/preview rebuild/destroy 生效，再切回：旧 loop 不得复活；重复 5 次切换不增加
   voice、listener 或 focus lease。
3. 至少在一个 Chromium 桌面浏览器完成 blur/focus 与 tab hidden/visible 两组；Safari/iOS 若出现系统
   `interrupted`/resume rejection，记录为显式失败与是否需要再次 trusted unlock，不把无声当通过。

### 独立验收建议

`必须`。本任务涉及跨包 public contract、共享 singleton 适配、异步 instance ownership、focus lease 与 destroy。重点复验：

```bash
pnpm --filter @slotclientengine/audiocore exec vitest run tests/audio-runtime.test.ts tests/pixi-backend.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-runtime.test.ts
```

并独立完成一次真实浏览器切出/切回矩阵。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试。
- 不新增依赖、不升级 `@pixi/sound`、不修改 lockfile。若实现要求升级第三方库，先停止并以 upstream/version
  证据重新规划。

## 10. 生成物、文档与规则

- 本任务无 YAML、manifest schema 或生成 TypeScript 变更，不运行生成器。
- `docs/audiocore.md` 与 `packages/audiocore/README.md` 记录 background suspension、once drop、loop/music pause
  和 unlock 边界。
- `docs/agent-rules/shared-game-runtime.md` 只补稳定跨任务的 AudioCore owner/前后台规则；不把浏览器测试数据、
  upstream issue全文或任务执行证据写入规则。
- Game Layout Editor UI/workflow 未改变，原则上不更新其 README；若增加用户可见 re-unlock 状态才同步最小文档。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/276-audiocore-background-resume-no-stale-effects-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 activity API、Pixi auto-pause ownership、实际文件、
计划偏差、自动化与真实浏览器结果、未完成平台和剩余风险。

## 12. 风险、假设与待确认

### 风险

- `@pixi/sound` 使用进程级 singleton；若引用计数或原值恢复错误，一个 preview destroy 可能重新启用全局
  auto-pause并影响仍活跃 runtime。
- `IMediaInstance.paused`、AudioContext 的系统 `interrupted` 与 DOM visibility 并非同一状态；尤其 iOS 恢复可能
  需要新的 trusted gesture，不能以桌面浏览器结果推断全部平台。
- suspended 时发生 music supersede/loop end 与 async play resolve 容易产生晚到实例；只测同步 fake 会漏掉真正叠放来源。
- 多个合法前台 once 仍可按 manifest voice policy 重叠；验收必须区分“合法同时发生”与“后台旧 voice 集中复活”。

### 假设

- 用户所说“切出去再切回来”指浏览器窗口/标签页前后台，而不是 Gamelayout Editor 内部 workspace tab 或
  GameMode 切换。
- 当前最强证据是锁定的 `@pixi/sound` auto-pause 行为与上游 stop/resume 缺陷；执行仍先用最小 activity
  reproducer 固定本仓症状，再改 production code。
- 现有 Pixi ticker 的完整 elapsed-delta/内部切片合同正确，本任务不改变画面时间。

### 待确认

无。若最小复现证明用户指的是 Editor workspace/GameMode 切换，或没有发生 browser blur/hidden，则按文件范围条款停止
并报告证据，不把另一类问题强行塞入本任务。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、职责、pause owner 和资源生命周期符合计划。
- [ ] once/loop/music/focus/async/destroy 测试已通过。
- [ ] RenderCore 直接 consumer 与真实浏览器切出/切回已验收。
- [ ] 文档与最小领域规则已同步。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的三份领域规则和本计划；
2. 核对 HEAD/status，先建立本仓最小 blur/focus reproducer；
3. 按 backend activity → runtime policy → Pixi coordination → RenderCore consumer 顺序实现；
4. 小幅适配当前代码时在报告记录，根因或范围失效时停止说明；
5. 只运行计划规定的 L2 验收并完成真实浏览器矩阵；
6. 完成后生成 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
