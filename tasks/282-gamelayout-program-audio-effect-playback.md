# 282 gamelayout-program-audio-effect-playback 任务计划

## 1. 目标与完成定义

### 目标

修正 Game Layout 程序 audio 已由程序键进入 production ZIP、但没有成为
`SceneLayoutPackageResource.programmaticAudioEffects` 可播放 route 的断链；同时扩展统一音效播放接口，允许调用方按次选择
loop、为 loop 绑定一个可选的 canonical Game Layout 结束 Event，并继续通过返回的
`AudioPlaybackHandle` 精确停止本次播放。

### 完成定义

- [x] Game Layout Editor 中为 audio root 绑定程序键后，canonical v7 继续写唯一
      `runtimeResources.<key> = { kind: "audio", path, mediaType }`，production package-resource 从该绑定派生同名
      programmatic effect route；程序调用 `playEffect(<key>)` 不再报 unknown/not-programmatic。
- [x] `programmaticAudioEffects` 包含历史 `audio.programmaticEffects` route 与全部 audio runtime-resource key；
      event-only、未绑定 audio、非 audio runtime resource 不进入该集合。
- [x] `playEffect(route, options?)` 对程序 audio 默认单次播放，可用 `loop: true` 循环；既有历史 effect 在未传
      `loop` 时保持 manifest playback，显式 boolean 才覆盖本次播放方式。
- [x] loop 调用可传一个 exact `endEvent`；下一次该 Event occurrence 只停止对应 handle，不停止无关 route/voice。
      loop 也可以不传 Event，继续由 `handle.stop()` 或 `stopEffect(route)` 停止。
- [x] 所有成功受理的播放都立即返回 `AudioPlaybackHandle`。loop handle 在播放期间保持 pending/playing，Event、
      `handle.stop()`、route stop 或 runtime destroy 后以 `stopped` settle；lazy prepare/backend 失败以 `failed` settle。
- [x] 同 route loop 继续只有一个 active/pending instance；重复等价调用不累计 Event listener，冲突的 live
      `endEvent` 显式失败。once 继续使用有界 voice policy。
- [x] eager mapped ZIP、lazy runtime resource 与 CDN external media 都走同一 AudioCore owner；停止、失败、Event
      dispose、background suspend/resume 和 destroy 不补播 once、不泄漏声音、listener 或 Object URL。
- [x] canonical v7 legacy `audio.effects/music/programmaticEffects` 仍为空、`eventAudio.ignoreLegacyAudio` 仍为 true；
      现有 Event audio、历史 Popup/Symbol cue 与旧 package 读取兼容不变。
- [x] AudioCore、RenderCore、Gameframeworks、Game Layout Editor 与 package CLI 的直接合同、测试、README、领域规则及
      UTC 中文执行报告完成同步。

## 2. 范围

### 包含

- AudioCore effect 播放的按次 loop override、异步 source prepare、handle/route stop、voice/focus/activity/destroy 合同。
- RenderCore Scene Layout 对 audio runtime-resource key 的 programmatic route 派生、strict collision 检查、lazy source
  resolver、public play options、结束 Event subscription 与 runtime address endpoint。
- Gameframeworks 对新增播放 options/endpoint type 的最小 facade re-export 与编译保护。
- Game Layout Editor 对程序 audio 的说明、canonical effect address/调用示例、ZIP 往返回归；不新增第二份 authoring 表。
- package CLI 将 audio runtime resource 识别为 effect role，并继续结构化改写同一 path/mediaType；delivery 保持原 bytes。
- 定向测试、README、三份领域规则与执行报告。

### 不包含

- 不新增 Scene Layout/Audio schema version，不把 playback、Event、voice 或 focus 写进 `runtimeResources`。
- 不恢复 Game Layout Editor 已移除的 root effect 表、mode BGM、legacy ignore 开关或 Popup/Symbol audio authoring。
- 不把 Event-only audio 自动提升为 programmatic route，不按 filename/path/hash 猜 route，不允许同一 audio root 多个隐式 alias。
- 不新增 program music API、crossfade、duck/pause authoring或 raw `@pixi/sound` instance；程序 audio 使用 effect bus。
- 不改变 Event audio 自身“authored loop 必须有 endEvent”的 Editor 合同；本任务的可选 Event 只属于显式程序调用。
- 不修改 production 游戏、正式 assets/YAML、workspace 工具链、依赖版本或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-09-01T06:44:30Z
HEAD: 2dd2c07125d7ab8d3e20b1d255ec2c6c69d1045b
branch: detached HEAD（HEAD 同时位于 main / codex/task-279-grid-cell-hole-spin-local-reels）
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `tasks/227-gamelayouteditor-audio-asset-workflow.md`
- `tasks/273-editor-legacy-audio-authoring-removal.md`
- `tasks/277-gamelayouteditor-audio-program-export.md` 及其执行报告
- `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md`

目标 app/package 下没有补充 `AGENTS.md`。

当前结论：

- Task 277 已让 audio 程序键写入 `runtimeResources`、ZIP、asset group 与 delivery，并可通过
  `loadRuntimeResource(key, "audio")` 取得 package-owned URL；它明确没有接入播放能力。
- `packages/rendercore/src/scene-layout/package-resource.ts#createSceneLayoutPackageResource()` 当前只从
  `manifest.audio.programmaticEffects` 建立 `programmaticAudioEffects`，并要求 route 已存在于聚合
  `audioEffects`；canonical Editor v7 又固定输出空 legacy audio，因此新程序 audio 永远不在 allowlist。
- `package-runtime.ts#playEffect()` 先调用 `assertProgrammaticAudioRoute()`，随后才进入 AudioCore，所以当前错误在播放前
  稳定复现；`core/runtime-address.ts` 也只为该 Set 中的 route 编译 `audio-effect` endpoint。
- `SceneLayoutRuntimeAudioResourceSpec` 只有 `kind/path/mediaType`；这是程序键、资源闭包和 lazy load 的唯一权威来源。
  Editor 的程序键允许 lowercase 字母、数字、点、下划线和连字符，不能为了播放缩窄已有合法 key。
- `AudioRuntime.playEffect(route, { delaySeconds? })` 当前只播放构造时静态注册的 `ResolvedAudioEffect`；loop/once 来自
  binding。`AudioPlaybackHandle` 已有 `state/error/finished/stop()`，AudioCore 也已有 loop route 去重、pending/active
  route stop、background suspend/resume、focus release 与 destroy cleanup。
- delivery/on-demand runtime audio 可能尚未生成 URL；直接把所有程序 audio 改为 package init eager load 会破坏
  `runtimeAllocation.onDemand.runtimeResources` 与 CDN lazy 边界，必须让 pending handle 等待共享 lazy loader。
- `bindEventAudio()` 已证明 canonical runtime Event 可由唯一 address manager bind，并在结束 Event 调用 AudioCore stop；
  程序播放需要复用同一 dispatcher，但 listener ownership 必须缩小到本次 handle。
- package CLI 当前故意不把纯 program audio 当作 music/effect 优化 role；本任务把程序 audio 明确赋予 effect 播放语义后，
  该结论需要同步为 effect role，delivery 的 byte-preserving policy不变。

## 4. 需求解释与技术决策

### 需求解释

1. “设置的程序用音效”解释为：Assets audio root 已绑定唯一程序键。该 key 既保留 Task 277 的 typed load identity，
   又是 `playEffect()` 使用的 exact route；未绑定 audio 不获得播放 identity。
2. “加入到 programmaticAudioEffects”指 package-resource 编译结果，不是要求 Editor 重新维护
   `audio.effects/programmaticEffects` 第二份表。canonical v7 legacy catalog继续为空。
3. “能 loop”是每次程序调用的播放选项，不是新的 manifest authoring 字段。程序 audio 默认 once；调用方显式
   `{ loop: true }` 才持续循环。
4. “loop 可以传结束 event”解释为可选自动停止条件。Event 不 replay 历史，只消费播放受理后的下一次 occurrence；
   不传 Event 时 handle/route stop 仍是完整停止方式。
5. “返回 handle，并能用 handle 停止”沿用现有 `AudioPlaybackHandle`，不再引入第二种 session/token；停止的是 exact id，
   `stopEffect(route)` 才停止该 route 的全部 pending/active voice。

### 关键决策

1. **从唯一 runtime-resource binding 派生 route。**
   - `programmaticAudioEffects = legacy allowlist ∪ audio runtime-resource keys`，并保留 exact key。
   - 若 audio program key 与任何聚合历史 effect route 冲突，package prepare 在创建 runtime 前显式失败；不按来源顺序覆盖、
     合并或猜同一资源。
   - `gamelayout:/audio/effect/<encoded-key>` 因同一 compiled Set 自动成为可枚举 endpoint；Editor 只用 shared formatter显示。
2. **保持 schema v7，不回填 legacy audio。**
   - 不给 `SceneLayoutRuntimeAudioResourceSpec` 增加 playback 字段；程序键本身已经是显式 effect identity。
   - 默认程序 effect policy 固定复用仓库原程序音效基线：once、offset 0、effect bus、BGM keep、
     `maxConcurrent=4`、`restart-oldest`；loop 强制单 instance。该 policy 是 runtime 合同，不是隐藏 authoring state。
3. **公开一个统一的按次 options。**
   - `SceneLayoutAudioEffectPlayOptions` 至少包含 `loop?: boolean` 与
     `endEvent?: GameLayoutRuntimeAddress`；`SceneLayoutPackageRuntime.playEffect()` 与
     `GameLayoutAudioEffectEndpoint.play()` 接受同一 options。
   - options 省略时，程序 audio 为 once，历史 effect保持 authored playback；显式 `loop` 覆盖本次播放。
   - `endEvent` 只允许 effective loop；unknown/non-event address、once + endEvent、destroy 后调用在创建 voice 前失败。
4. **lazy source 由 AudioCore pending handle 承接。**
   - RenderCore 先完成 route/options/Event strict preflight，再把
     `loadRuntimeResource(key, "audio")` 的共享 Promise作为受控 source prepare交给 AudioCore。
   - AudioCore 立即返回既有 handle；资源加载成功才创建 backend sound/instance。期间 handle/route stop 或 destroy 标记取消，
     后续 resolve 不得起播；load/backend错误写入同一 handle `failed/error`。
   - 不为实现 sync handle而 eager 全部 program audio，也不把 URL/backend暴露给游戏。
5. **结束 Event 是 handle-owned subscription。**
   - listener 在播放受理时注册，Event 到达调用 exact `handle.stop()`；`finished` settle 后立即 dispose。
   - route stop、manual stop、prepare failure、runtime destroy 都走同一 dispose；重复同 route loop不累计 listener，live handle 的
     不同 `endEvent` 视为冲突。
6. **CLI 使用新明确的 effect role。**
   - legacy optimized ZIP 把 audio runtime resource当 effect做现有 AAC策略；若同 path同时被 Event music使用，现有 music优先规则
     继续成立，path/mediaType 在所有 typed reference原子改写。
   - CDN delivery仍保持 input bytes/container，不因播放语义改码。

## 5. 职责与合同

- **AudioCore data**：现有 versioned effect/event schema不变；不理解 Scene Layout program key或 Game Layout Event地址。
- **AudioCore core**：拥有静态/异步 source prepare、effective once/loop、voice bound、backend instance、handle state、
  activity/focus与stop/destroy；异步 source入口不向gameframeworks直接暴露。
- **Scene Layout data**：继续拥有 audio runtime-resource key/path/mediaType和canonical Event address类型，不新增持久字段。
- **Scene Layout package resource**：从 canonical manifest编译 route union与collision，保留 lazy runtime-resource owner。
- **Scene Layout package runtime/address manager**：验证 allowlist/options/endEvent，桥接 async source，拥有 handle→Event
  subscription与public endpoint；不复制 AudioCore voice/player状态机。
- **Game Layout Editor**：仍只保存 audio root + 程序键，实时派生 effect用途/地址/UI提示；不保存 programmatic boolean、
  loop或endEvent草稿。
- **package CLI**：按 typed audio runtime spec确认 effect role和结构化引用；不扫描 filename/bytes猜用途。
- **Gameframeworks/game**：只通过 facade `playEffect(route, options)`、handle和route stop；不得调用 raw sound或自行订阅后
  批量管理 backend voice。
- **失败策略**：route collision、unknown route、wrong runtime kind、bad Event address/kind、once + endEvent、lazy load、
  decoder/backend与destroy后调用全部显式失败，不 fallback到 Event track、filename或legacy effect。
- **资源生命周期**：package resource拥有 URL/cache，AudioCore拥有 sound/voice/handle，Scene Layout拥有 Event subscription；
  handle stop不 revoke共享 URL，package destroy统一释放。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/tests/scene-layout/program-audio-playback.test.ts
tasks/282-gamelayout-program-audio-effect-playback-<utctime>.md
```

若现有 suite 能清晰承载同一合同，可扩展现有测试文件而不新增测试文件。

### 预计修改

```text
packages/audiocore/src/core/{runtime,backend}.ts
packages/audiocore/tests/audio-runtime.test.ts
packages/audiocore/README.md

packages/rendercore/src/scene-layout/{types,package-resource,package-runtime}.ts
packages/rendercore/src/scene-layout/core/{index,runtime-address}.ts
packages/rendercore/tests/scene-layout/{package-resource-audio,runtime-address}.test.ts
packages/rendercore/README.md

packages/gameframeworks/{src/index.ts,tests/exports.test.ts,README.md}

apps/gamelayouteditor/src/ui/resources-workspace.ts
apps/gamelayouteditor/tests/audio-assets.test.ts
apps/gamelayouteditor/README.md

apps/gamelayoutpkgcli/src/audio-assets.ts
apps/gamelayoutpkgcli/tests/{audio-assets,audio-optimizer,reference-rewriter}.test.ts
apps/gamelayoutpkgcli/README.md

docs/{audiocore,rendercore-game-runtime-composition-api}.md
docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md
```

按实际 symbol 缩小文件集；`backend.ts` 仅在现有 interface 无法表达异步 source prepare时修改。

### 原则上不应修改

```text
packages/rendercore/src/{popup,symbol,reel,image-string}/**
packages/{logiccore,uiframeworks,editorcore,editorresource,browserartifactio,vnicore}/**
apps/{popupeditor,symbolseditor,imgnumbereditor,game002,game003,gameviewer,gameviewer2}/**
assets/**
AGENTS.md
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
```

若执行发现必须升级 manifest version、恢复 legacy Editor audio表、修改正式游戏consumer、新增依赖或改变 Event catalog identity，
属于明显范围扩张，先停止说明，不修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与行为矩阵**
   - 重核 HEAD/status、本计划、三份领域规则、Task 277实际 public exports与 package CLI当前策略。
   - 用自包含 fixture固定：legacy allowlist、program-only、Event-only、Event+program、route collision、eager/lazy/CDN、
     once/loop、manual/Event/route stop、suspend/resume与destroy。
2. **扩展 AudioCore按次播放合同**
   - 在不修改 data schema的前提下，让 core effect启动接受 effective playback和受控异步 source；复用现有 pending/active map、
     voice bound、prepare cache、focus、activity与handle，不建立第二 player。
   - 保证 loop单实例、once并发、stop-before-load、load/backend failure、自然 ended、manual/route/destroy stopped状态准确。
3. **编译 program audio route与lazy resolver**
   - package-resource 从 `runtimeResources` 的 audio项派生 Set，并与历史聚合 route做strict collision检查；非 audio不进入。
   - package-runtime按 route区分历史 resolved effect与program audio lazy source，统一进入 AudioCore；保留 typed
     `loadRuntimeResource()` 能力和共享 URL/cache。
4. **接入 loop options、结束 Event与runtime address**
   - 新增共享 play options并接入 package runtime、audio-effect endpoint和Gameframeworks exports。
   - 在 voice创建前 resolve exact Event endpoint；建立handle-owned one-shot lifecycle，覆盖重复loop、conflicting Event、
     stop/failure/destroy清理及no replay。
5. **同步 Editor与production artifact语义**
   - Assets中程序 audio继续只写runtime-resource binding，但提示其同时是effect route，显示shared formatter生成的canonical
     address、once/loop/endEvent与handle stop示例；移除“只可load、不可播放”的过时说明。
   - 增加导出/重导测试，证明legacy audio仍空、payload只写一次、event-only不被提升、program key exact保留。
6. **同步 package CLI与直接consumer**
   - 将program audio纳入effect role；覆盖纯program AAC、Event music共享优先、typed reference原子改写和CDN不转码。
   - 回归Gameframeworks public type/export与既有无options调用，确保外部consumer可渐进采用。
7. **文档、规则、验收与报告**
   - 更新AudioCore/RenderCore/Gameframeworks/Editor/CLI README与两个长期文档，给出once、loop + Event、handle stop和route stop示例。
   - 最小更新三份领域规则中Task 277的旧边界，运行L2定向验收，检查diff并生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- AudioCore使用fake backend/deferred source，覆盖loop override、同route去重、once voice bound、stop-before-resolve、
  failed handle、suspended loop保留与once不补播。
- RenderCore fixture只使用最小WAV/OGG bytes或内存/external URL，不读取游戏`assets/`。
- route编译覆盖legacy-only、program-only、Event-only、两类union、非audio排除、dot/underscore key和collision fail-fast。
- Event测试使用真实shared address manager emit，断言下一occurrence停止exact handle、其它route继续、listener在全部terminal
  path清理、非法Event在声音prepare前失败。
- lazy/CDN测试断言API同步返回pending handle、共享load只触发一次、manual stop后late resolve不起播、destroy不泄漏。
- Editor/CLI断言canonical v7 legacy catalog不被回填，ZIP round-trip无第二份表，AAC/reference rewrite与delivery policy一致。

### 验收级别

`L2`。原因是修改 AudioCore/RenderCore/Gameframeworks 跨包 public playback contract、Scene Layout package-resource派生、
正式ZIP优化role与直接Editor consumer；不改schema version、根工具链、lockfile、production asset或release配置，故不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/audiocore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter @slotclientengine/audiocore exec vitest run tests/audio-runtime.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-resource-audio.test.ts tests/scene-layout/program-audio-playback.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/audio-assets.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/audio-assets.test.ts tests/audio-optimizer.test.ts tests/reference-rewriter.test.ts
pnpm --filter @slotclientengine/audiocore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks build
git diff --check
```

- 若实现扩展现有 `package-runtime.test.ts` 而未新增建议文件，第三条替换为实际 exact test path，不运行整个 monorepo。
- 本任务列出 7 条命令：跨包 typecheck、AudioCore/RenderCore/Editor/CLI 四组职责不同的定向测试、public package build 与
  whitespace 检查均不可由另一项替代；仍不运行根级 typecheck/test/build。
- 失败时先最小化到 exact route/source/Event case并判断是否由本任务引入，不自动扩大为根级测试。

### 人工验收

1. 在真实 Game Layout Editor导入 OGG/M4A/WAV并为其中一个绑定程序键；导出、重导后确认同一root/bytes/key保留，
   UI显示effect route与play/handle提示，event-only和unused audio无programmatic route。
2. 在目标浏览器解锁音频后调用默认once、`{loop:true}`、`{loop:true,endEvent}`；确认音量走effect控制，loop连续播放，
   exact Event/manual handle/route stop分别在预期边界停声。
3. 使用delivery lazy资源在尚未加载时播放并立即stop，再正常播放一次；确认前者late load不出声、后者只加载一次且destroy后无声。
4. 对production ZIP运行legacy optimizer和delivery check；确认program audio在legacy输出按effect处理，Event music共享时music优先，
   delivery仍保持原codec/container并可播放。

### 独立验收建议

`必须`。涉及跨包public API、异步source/voice ownership、Event subscription、lazy URL与正式ZIP优化语义。重点复验：
route唯一派生、stop-before-load、Event listener cleanup。最多运行：

```bash
pnpm --filter @slotclientengine/audiocore exec vitest run tests/audio-runtime.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-resource-audio.test.ts tests/scene-layout/program-audio-playback.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/audio-assets.test.ts tests/audio-optimizer.test.ts tests/reference-rewriter.test.ts
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24；shell没有Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的pnpm，不切换npm/yarn。依赖缺失时使用
  `CI=true pnpm install --frozen-lockfile`；只有下载失败后才设置仓库约定代理并重试。
- 本任务复用现有 AudioCore、Scene Layout address manager、runtime-resource loader与CLI转码器，不新增依赖、不修改lockfile。
- CLI真实AAC人工验收需要系统`ffmpeg`/`ffprobe`；fake runner自动测试不能替代真实浏览器听觉验收。

## 10. 生成物、文档与规则

- 本任务不修改YAML或生成TypeScript，不运行生成器；测试ZIP、asset group与delivery目录不提交。
- `docs/audiocore.md` 与 `docs/rendercore-game-runtime-composition-api.md` 记录route来源、options、handle/route stop、
  endEvent no-replay、lazy failure和destroy状态。
- README同步程序audio既可typed load也可作为effect播放、legacy兼容、CLI effect role与delivery保真。
- 最小更新 `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md`：程序键audio派生effect route，AudioCore仍是
  唯一voice owner，Editor仍不恢复legacy audio表。
- 不把具体route清单、音频文件、码率样例或执行证据追加到根`AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/282-gamelayout-program-audio-effect-playback-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终API、route派生、实际修改文件、异步/事件生命周期、CLI策略、计划偏差、自动/人工验收与剩余风险；
不收集无关coverage、历史矩阵或profiler数据。

## 12. 风险、假设与待确认

### 风险

- sync handle与lazy source之间存在stop/destroy竞态；若AudioCore未拥有取消状态，late resolve会产生幽灵声音。
- 同route loop去重与per-call Event若分别维护，重复调用可能累计listener或由错误Event提前停止共享handle。
- program key语法宽于旧local effect name；若实现错误复用legacy parser，会破坏已合法导出的点/下划线key。
- program audio与Event audio可共享path；URL cache、AAC rewrite或GC按单owner实现会重复URL、漏改引用或提前释放。
- 浏览器codec/autoplay、后台恢复和真实Event时序不能由happy-dom/fake backend完整证明，必须保留人工验收。

### 假设

- 用户本轮新要求覆盖Task 277“program audio只load、不播放”的旧边界：绑定程序键的audio现在明确同时是effect route。
- 一个audio root仍最多绑定一个程序键；该key是exact route，不另设显示名或alias。
- 程序audio默认使用已有程序音效的once/offset 0/4 voices/restart-oldest/keep BGM基线；本任务不增加这些策略的Editor配置。
- loop结束Event是可选自动stop条件；未配置时调用方负责handle或route stop。

### 待确认

无。上述语义均可由用户本轮要求与当前仓库合同确定；执行时若要把程序audio继续区分为非effect generic media，需要新的显式
authoring discriminator，属于另一个需求。

## 13. 完成清单

- [x] 目标和非目标已满足。
- [x] 实际修改未超范围，或偏差已在报告说明。
- [x] public API、route派生、schema、职责和资源生命周期符合计划。
- [x] once/loop、Event/manual/route stop、lazy/destroy与兼容测试已通过。
- [x] ZIP/CLI、README和领域规则已按需同步。
- [x] 自动化与真实浏览器/听觉验收已明确区分。
- [x] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的三份领域规则和本计划；
2. 核对Git基线与工作区，保留用户无关修改；
3. 按计划实现，不重新建立legacy audio表或第二播放状态机；
4. 小幅适配当前实现时在报告记录；
5. manifest version、依赖、lockfile、正式游戏consumer或Event identity需要变化时先停止说明；
6. 只运行计划规定的L2验收；
7. 完成后生成UTC中文执行报告；
8. 除非用户明确要求，不commit、不push、不创建PR。
