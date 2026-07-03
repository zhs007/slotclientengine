# anieditorv5runtime-cc particle force stop 任务计划

## 1. 任务目标

更新 Cocos Creator 3.8.6 runtime：

```text
/Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
```

为当前动画补充粒子强制停止能力。需求分成三个 public API 层次：

1. 新增单独接口，用于立即彻底停止并移除该 `V5GCocosPlayer` 当前管理的所有粒子。
2. 如果实现中新增或已存在普通“停止播放”接口，则在停止接口中加入参数，允许停止播放时同步强制停止所有粒子；当前代码没有 public `stop()`，不得把 `pause()`、`restart()` 或 `destroy()` 偷偷改造成 stop。
3. `requestSegmentedPlaybackEnd` 加入参数，默认为 `false`；为 `true` 时不能在调用瞬间移除粒子，而是在 segmented 动画完成 ending 段之后，彻底停止并移除粒子，并跳过粒子 drain。

本任务必须保持现有 live particle / segmented hold 语义：

- `play({ mode: "segmented", loopStart, loopEnd, keepParticlesAlive: true })` 在 loop/hold 阶段继续让 emitter 配置停在 hold 点，但粒子按真实时间推进。
- `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 只改变 ending 完成后的粒子处理；调用之后到主时间线结束之前，不能提前清空当前可见粒子。
- `onPlaybackComplete(...)` 的触发仍由宿主持续调用 `update(deltaSeconds)` 同步驱动，不使用 `setTimeout`、Promise、Cocos tween 或异步计时器。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、standalone 交付、真实 Cocos 验收/交接、文档同步、协作规则同步判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/76-anieditorv5runtime-cc-particle-force-stop-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/76-anieditorv5runtime-cc-particle-force-stop-260703-123456.md
```

注意：当前仓库已经存在 `tasks/76-game003-win-loop-dismiss-and-minecart-scale.md`。本任务按用户指定继续使用 `76-` 前缀，但任务名必须是 `anieditorv5runtime-cc-particle-force-stop`，不得覆盖已有任务文件。

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml`
- 构建编排：`turbo`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。若确实新增或调整依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

如果 `pnpm --filter ...` 或 `pnpm exec ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
```

如果仍是 pnpm wrapper 在当前环境异常，可使用 package-local binary 做等价验证，例如：

```bash
cd packages/anieditorv5runtime-cc
../../node_modules/.bin/tsc -p tsconfig.json --noEmit
../../node_modules/.bin/vitest run --coverage
../../node_modules/.bin/eslint .
../../node_modules/.bin/prettier --check .
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。禁止通过吞掉非法参数、静默忽略未知状态、自动重开播放、自动猜测粒子状态、把 publish/runtime 错误降级成 no-op 的方式“跑通”。

## 3. 当前实现事实

执行本计划时必须重新盘点当前代码，以实际代码为准。本节是本计划创建时的快照。

当前关键文件：

```text
packages/anieditorv5runtime-cc/src/core/playback-sequence.ts
packages/anieditorv5runtime-cc/src/core/particle-runtime.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/tests/core/particle-runtime.test.ts
packages/anieditorv5runtime-cc/tests/core/playback-sequence.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/.prettierignore
packages/anieditorv5runtime-cc/package.json
agents.md
```

当前已观察到：

- `V5GCocosPlayer` 已有 `play(...)`、`playRange(...)`、`requestSegmentedPlaybackEnd()`、`getPlaybackState()`、`pause()`、`restart()`、`destroy()`；没有名为 `stop()` 的 public method。
- `pause()` 是可恢复暂停：`pause(); play();` 可继续未完成 range 或 particle drain，不能直接改造成“彻底停止”语义。
- `restart()` 会清空 range、segmented playback、pending complete、粒子 runtime，并渲染 0 秒确定性帧；它不是通用 stop API。
- `destroy()` 会销毁 runtime 创建节点并清空 listener、mounted node registry；它是销毁生命周期，不适合作为普通停止播放接口。
- `requestSegmentedPlaybackEnd()` 当前无参数，会调用 `segmentedPlayback.requestEnd()`，进入 ending 后继续由 `update(deltaSeconds)` 推进。
- segmented ending 到达 `project.stage.duration` 后，`startParticleDrain(...)` 会进入 `particle-draining`；可见粒子排空完成后，`finishParticleDrain()` 才清理粒子并触发 complete listener。
- `V5GParticleRuntime` 当前提供 `reset()`、`emit(...)`、`emitLive(...)`、`beginDrain()`、`advanceDrain(...)`、`isDraining()`、`getLiveParticleCount()`；没有专门的 `forceStopAllParticles()`。
- `clearParticles()` 在 `V5GCocosPlayer` 内部负责销毁当前粒子节点，但它是 private 且不会单独重置 particle runtime 状态。
- `renderPlaybackFrame(...)` 每次会根据当前 sample 重新 emit 粒子；如果只清节点但不抑制后续 emit，播放仍在粒子有效时间内时，下一次 `update(...)` 会重新生成粒子。
- standalone 单文件是主要交付面之一，不能只改 `src/`。
- `scripts/check-standalone.mjs` 会检查 standalone public API 和关键 snippet；新增 public API 后必须同步更新 checker。
- `standalone.zip` 被 `.gitignore` 忽略，必须直接用 `test -f` 和 `zipinfo -1` 验证，不能依赖 `git status`。
- 根级协作规则文件当前是 `agents.md`，不是 `AGENTS.md`。

## 4. API 合同

### 4.1 新增公共类型

在 `packages/anieditorv5runtime-cc/src/core/playback-sequence.ts` 或 `packages/anieditorv5runtime-cc/src/cocos/types.ts` 中新增并导出类型，standalone 中也必须有同名导出。

建议类型：

```ts
export interface V5GForceStopParticlesOptions {
  suppressUntilNextPlayback?: boolean;
}

export interface V5GSegmentedPlaybackEndOptions {
  forceStopParticles?: boolean;
}

export type V5GCocosForceStopParticlesOptions = V5GForceStopParticlesOptions;
export type V5GCocosSegmentedPlaybackEndOptions =
  V5GSegmentedPlaybackEndOptions;

// 仅当本任务明确新增 stop(...) 时再导出。
export interface V5GCocosStopOptions {
  forceStopParticles?: boolean;
}
```

推荐语义：

- `forceStopParticles` 默认 `false`。
- `suppressUntilNextPlayback` 默认 `true`，只用于单独 `forceStopAllParticles(...)`。
- Cocos public 类型需要保留现有 `V5GCocos*` 命名习惯，至少导出 `V5GCocosForceStopParticlesOptions` 和 `V5GCocosSegmentedPlaybackEndOptions`；如果本任务新增 `stop(...)`，再导出 `V5GCocosStopOptions`。
- 如果参数对象存在未知字段，不需要运行时校验未知字段；TypeScript 已能约束静态调用。但已知字段如果不是 boolean，运行时必须显式失败，不能 truthy/falsy 隐式转换。
- 如果选择不引入通用 `V5GForceStopParticlesOptions`，也必须在 Cocos 类型中提供等价类型，并确保 standalone export / import test 覆盖。

### 4.2 新增 `forceStopAllParticles(...)`

在 `V5GCocosPlayer` 上新增 public method：

```ts
forceStopAllParticles(options?: V5GForceStopParticlesOptions): void
```

合同：

- 可在初始化后任意播放阶段调用，包括 timeline、range、segmented start/loop/ending、particle-draining、暂停状态。
- 未初始化时调用必须显式失败，例如 `V5GCocosPlayer must be initialized before forceStopAllParticles.`。
- 调用后立即：
  - `V5GParticleRuntime` 清空 live particle 状态、drain 状态和 emitter elapsed 状态。
  - 所有 layer 的 particle nodes 被销毁并从对应 `<layer name> Particles` 容器移除。
  - `getRuntimeDiagnostics().particleSpriteCount === 0`。
  - `getRuntimeDiagnostics().liveParticleCount === 0`。
  - `getPlaybackState().liveParticleCount === 0`。
  - 如果此前处于 `particle-draining` 且存在 pending complete，应完成清理并触发 `onPlaybackComplete(...)`，避免永远卡在 draining。
- 默认 `suppressUntilNextPlayback: true`：如果主播放仍继续 tick，后续 `update(...)` 不应在同一段播放生命周期内重新生成粒子。
- 以下动作必须解除 suppression 并允许粒子按正常逻辑重新生成：
  - `play(...)`
  - `playRange(...)`
  - `seek(...)`
  - `restart()`
  - `init()`
  - `destroy()` 后再次 `init()`
- `forceStopAllParticles({ suppressUntilNextPlayback: false })` 只清当前粒子和 runtime state，不阻止后续 `update(...)` 根据当前播放时间再次采样粒子。这个选项是高级调试/宿主控制用途，不应作为默认。

### 4.3 停止播放接口边界

当前代码没有 public `stop()`。本任务的必做项是 `forceStopAllParticles(...)` 和 `requestSegmentedPlaybackEnd(...)` 参数，不要求为了满足“停止接口参数”而强行发明一个语义不清的 stop。

执行时必须先确认：

- 不把 `pause()` 改成 stop；`pause()` 仍是可恢复暂停。
- 不把 `restart()` 改成 stop；`restart()` 仍是回到 0 秒并清空播放上下文。
- 不把 `destroy()` 改成 stop；`destroy()` 仍是生命周期销毁。
- 如果不新增 `stop(...)`，任务报告必须说明当前 runtime 没有普通停止接口，本任务用单独 `forceStopAllParticles(...)` 覆盖“彻底停止所有粒子”的需求。

如果执行者决定新增普通停止接口，建议签名为：

```ts
stop(options?: V5GCocosStopOptions): void
```

此时合同必须固定为：

- `stop()` 不是 `pause()`；它不可通过下一次无参 `play()` 继续旧 range 或旧 segmented 状态。
- 未初始化时调用必须显式失败，例如 `V5GCocosPlayer must be initialized before stop.`。
- 调用后：
  - `isPlaying` 为 `false`。
  - `activeRange`、`segmentedPlayback`、`pendingComplete` 清空。
  - `playbackMode` 回到 `"timeline"`。
  - `playbackPhase` 设置为 `"idle"` 或 `"complete"`，实现时选一个并在 README / tests 固定；推荐 `"idle"`，因为这是宿主主动停止，不是自然播放完成。
  - `loopIndex` 清零。
  - 当前非粒子画面可以停留在当前 `currentTime`，不强制 seek 到 0；如果需要从头开始，宿主已有 `restart()`。
- `stop({ forceStopParticles: true })` 必须立即调用同一套内部强制清粒子逻辑，并默认阻止同一段已停止播放的粒子重生。
- `stop()` 或 `stop({ forceStopParticles: false })` 不应销毁当前可见粒子节点；如果当前处于 `particle-draining`，必须明确取消或保留 pending complete 的合同，并用 tests 固定，避免“停了但下次 play 继续一个已取消的 drain”这类半状态。
- 如果 stop 语义无法在不破坏 `pause()`、`restart()`、`destroy()` 的前提下讲清楚，就不要新增 `stop(...)`；在报告中说明原因。

### 4.4 扩展 `requestSegmentedPlaybackEnd(...)`

把 public method 从：

```ts
requestSegmentedPlaybackEnd(): void
```

扩展为：

```ts
requestSegmentedPlaybackEnd(options?: V5GSegmentedPlaybackEndOptions): void
```

合同：

- `options` 省略或 `forceStopParticles: false` 时，完全保持现有行为：进入 ending，主时间线结束后进入 `particle-draining`，粒子排空后触发 complete listener。
- `forceStopParticles: true` 时：
  - 调用瞬间不能清粒子。
  - 如果 segmented 当前在 `start` 或 `loop`，仍按现有 `requestEnd()` 逻辑进入 ending。
  - ending 段播放期间，粒子仍按当前 frame 采样/渲染；不能因为已请求 force stop 就把 ending 中可见粒子隐藏。
  - 当 segmented 主时间线到达 `project.stage.duration` 时，不调用普通 `beginDrain()`；必须立即重置 particle runtime、销毁所有粒子节点、设置粒子计数为 0，然后完成播放并触发 complete listener。
  - complete listener 的 event context 仍为 `{ startTime: 0, endTime: duration, currentTime: duration, loopIndex }`。
  - `getPlaybackState().phase` 最终为 `"complete"`，不应停在 `"particle-draining"`。
- 若当前没有 active segmented playback，继续显式失败：`No active V5G segmented playback.`。
- 若当前 segmented phase 已不是可结束状态，保留 `V5GSegmentedPlaybackSequence.requestEnd()` 既有显式失败，不要吞错。
- 如果已处于 ending 后重复调用 `requestSegmentedPlaybackEnd(...)`，按当前 `requestEnd()` 的错误合同处理；不要为了兼容重复点击而静默 no-op。

## 5. 实现方案

### 5.1 类型和状态

修改：

```text
packages/anieditorv5runtime-cc/src/core/playback-sequence.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
```

建议新增内部状态：

```ts
private suppressParticleEmission = false;
private forceStopParticlesAfterSegmentEnd = false;
```

重置规则：

- `init()` / `resetPlaybackRuntime()` / `destroy()`：清空 suppression 和 pending force flag。
- `seek(...)`：清空 suppression，因为 seek 是宿主主动重采样确定性帧。
- `restart()`：清空 suppression。
- `startTimelinePlayback()` / `startRangePlayback(...)` / `startSegmentedPlayback(...)`：清空 suppression 和旧 pending force flag。
- `forceStopAllParticles({ suppressUntilNextPlayback: true })`：设置 suppression。
- `forceStopAllParticles({ suppressUntilNextPlayback: false })`：不设置 suppression。
- `requestSegmentedPlaybackEnd({ forceStopParticles: true })`：只设置 `forceStopParticlesAfterSegmentEnd`，不设置 suppression，不立即清节点。
- segmented force flag 必须在自然 complete、force complete、`seek(...)`、`restart()`、新 `play(...)`、`init()` 和 `destroy()` 时清空，避免下一次 segmented 播放继承旧请求。

### 5.2 `V5GParticleRuntime` 增加强制清空能力

修改：

```text
packages/anieditorv5runtime-cc/src/core/particle-runtime.ts
```

新增 public method：

```ts
forceStopAll(): V5GParticleRuntimeFrame
```

合同：

- 立即调用现有 `reset()`。
- 返回：

```ts
{
  particles: [],
  isDraining: false,
  isComplete: true,
}
```

这样 Cocos player 可以复用统一 frame 处理，不需要直接操作 runtime private state。

不要把 `forceStopAll()` 写成 `beginDrain()` 的特殊参数；强制停止是“现在清空”，drain 是“保留已发射粒子并自然排空”，两个语义必须分开。

### 5.3 Cocos player 内部渲染路径

修改：

```text
packages/anieditorv5runtime-cc/src/cocos/player.ts
```

建议新增 private helper：

```ts
private forceStopAllParticlesInternal(options: {
  suppressUntilNextPlayback: boolean;
  finishPendingDrain: boolean;
}): void
```

职责：

- 调用 `this.particleRuntime.forceStopAll()`。
- 调用 `this.clearParticles()`。
- 如果 `suppressUntilNextPlayback` 为 true，设置 `this.suppressParticleEmission = true`。
- 如果当前处于 particle draining 且 `finishPendingDrain` 为 true：
  - 设置 phase 为 complete。
  - 标记 segmented drain complete。
  - 清空 pending complete 并同步触发 listener。
- 不销毁 safe glow、chaser light、mask、text binding、mounted nodes。
- 不修改非粒子图层当前 transform / opacity / active 状态。

`renderPlaybackFrame(...)` 和 `renderDeterministicFrame(...)` 应统一检查 suppression：

- suppression 为 false：保持当前 `particleRuntime.emit(...)` / `emitLive(...)`。
- suppression 为 true：不采样新粒子，渲染空粒子列表，并保持 runtime live count 为 0。

注意：`renderDeterministicFrame(...)` 当前由 `seek(...)` 调用；因为 `seek(...)` 会解除 suppression，所以 seek 到有粒子的时间仍应显示确定性粒子。

### 5.4 可选 `stop(...)` public method

当前代码没有 `stop(...)`。只有在执行者确认本任务需要新增普通停止接口时，才在 `V5GCocosPlayer` 中新增：

```ts
stop(options?: V5GCocosStopOptions): void
```

实现步骤：

1. `assertInitialized("stop")`。
2. 校验 `options?.forceStopParticles` 是 boolean 或 undefined。
3. `setPlaying(false)`。
4. 清空 `activeRange`、`segmentedPlayback`、`pendingComplete`。
5. `playbackMode = "timeline"`。
6. `playbackPhase = "idle"`。
7. `drainPaused = false`。
8. `loopIndex = 0`。
9. 如果 `forceStopParticles === true`，调用强制清粒子 helper。
10. 如果 `forceStopParticles !== true`，不重置 particle runtime，避免改变现有可见粒子/drain 行为；但必须通过测试固定 stop 后不会继续自动 advance。

如果不新增 `stop(...)`，不得删除本计划其它必做项；需要把“不新增 stop 的原因”写入 README 或任务报告中的 API 合同小节。

如果实现者认为 `stop()` 应该默认清空普通 live particle runtime 但不销毁粒子节点，必须放弃这个方案：这会制造“diagnostics 和画面不一致”的隐藏状态。

### 5.5 `requestSegmentedPlaybackEnd(...)` 延迟强制清粒子

在 `requestSegmentedPlaybackEnd(...)` 中：

1. 校验参数。
2. 保留当前 `segmentedPlayback.requestEnd()` 显式失败语义。
3. `forceStopParticles === true` 时设置 `forceStopParticlesAfterSegmentEnd = true`。
4. 不清粒子，不修改当前 particle nodes。
5. 如果当前不 playing，仍保留现有 `setPlaying(true)`，让 ending 可以继续由 `update(...)` 推进。

在 `advanceSegmentedPlayback(...)` 的 `result.timelineEnded` 分支：

- 如果 `forceStopParticlesAfterSegmentEnd === true`：
  1. `setPlaying(false)`。
  2. `currentTime = duration`。
  3. 写入完整 complete context。
  4. 应用 `duration` 时刻的非粒子 sample，确保非粒子画面落在末帧。
  5. 调用强制清粒子 helper，清空粒子 runtime 和节点。
  6. 设置 `playbackPhase = "complete"`，`segmentedPlayback.markParticleDrainComplete()`。
  7. 同步触发 pending complete listener。
  8. 清空 `forceStopParticlesAfterSegmentEnd`。
- 否则保持现有 `startParticleDrain(...)`。

关键点：不要在 `requestSegmentedPlaybackEnd(...)` 调用处直接清粒子。测试必须证明请求结束后、ending 到达尾帧前，粒子节点仍存在或仍可随 update 更新。

### 5.6 standalone 单文件同步

修改：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

要求：

- standalone 中的类型、`V5GParticleRuntime`、`V5GCocosPlayer` public methods、内部状态和错误信息必须与模块化源码保持一致。
- standalone 只能 import `cc`，不能 import workspace 包、相对源码、Node builtin、DOM 或 `dist/`。
- standalone 目标是 ES2015，禁止使用 `Array.prototype.includes(...)` 等 checker 已拦截的较新写法；新增逻辑优先使用 `indexOf(...)`、普通 `for` 循环和已在单文件里验证过的写法。
- 不要把 `completeListeners` 或其它 publish 敏感路径改回 `Set` + spread；此前 Cocos 发布包已经暴露过这类运行时红错，listener 迭代应保持数组、`slice()` 和 indexed loop 的安全形态。
- 不要把 standalone 改成从 `src/` 生成时临时 import；最终交付仍是可复制单文件。

如果执行者有可靠的本地脚本可从 modular source 生成 standalone，可以使用脚本；如果没有，则手工同步并用 parity tests / checker 兜住。不要只改 modular source 后忘记 standalone。

### 5.7 README 和示例

修改：

```text
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

README 需要在“播放控制和事件”章节补充：

- `forceStopAllParticles(...)` 用于立即清空所有 runtime-managed 粒子。
- 如果新增 `stop(...)`，写清 `stop({ forceStopParticles: true })` 与 `pause()` / `restart()` / `destroy()` 的区别；如果不新增，写清当前没有普通 stop，不能把 `pause()` / `restart()` / `destroy()` 当 stop 使用。
- `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 是“请求 ending 完成后清粒子”，不是“现在清粒子”。
- 默认 `requestSegmentedPlaybackEnd()` 仍保留 drain 行为。
- callback 抛错继续同步抛出，不被 runtime 吞掉。
- 真实 Cocos 验收仍需要宿主项目验证；本仓库内 fake `cc` 测试不能替代真实编辑器导入。

`V5GPreview.example.ts` 只在有实际宿主示例价值时更新，例如在 `onDestroy()` 或业务按钮注释附近演示 `stop({ forceStopParticles: true })` / `forceStopAllParticles()`。不要为了展示 API 把示例 Component 变复杂，也不要新增 loader、URL、bundle manifest 或资源自动发现逻辑。

当前 `V5GPreview.example.ts` 已有 public `requestSegmentedPlaybackEnd(): void` 示例入口。执行时必须审查是否需要补一个不改变默认行为的示例入口，例如 `requestSegmentedPlaybackEndAndForceStopParticles()` 或 `forceStopAllParticles()`，用于宿主在 Cocos Inspector/Button 里手动验证新 API；如果不加，报告中说明 README 示例已足够覆盖。

### 5.8 standalone checker 和导出面

修改：

```text
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
```

必须检查：

- standalone 包含新 public 类型名。
- standalone `V5GCocosPlayer.prototype.forceStopAllParticles` 是 function。
- 如果新增 `stop(...)`，standalone `V5GCocosPlayer.prototype.stop` 是 function；如果不新增，checker 和 import test 不应强行要求它存在。
- standalone `V5GCocosPlayer.prototype.requestSegmentedPlaybackEnd` 仍是 function，且相关 type export 存在。
- checker required snippets 覆盖 `forceStopAllParticles`、`forceStopParticles`、`suppressParticleEmission` 或等价核心实现关键字。
- checker 继续保留 standalone 禁止项，包括非 `cc` import、workspace import、Node/DOM API、`.js` 内部 import、`JsonAsset`、`resources.load`、`dist/`、`src/` 和 `.includes(...)`。

不要只靠 `tsc` 证明 standalone 同步；checker 是这个包的长期防漂移防线。

### 5.9 agents.md 同步判断

当前 `agents.md` 已有规则：

```text
更新 packages/anieditorv5runtime-cc 的 public runtime 行为时，必须同步模块化源码、standalone/anieditorv5runtime-cc.ts、scripts/check-standalone.mjs、standalone 测试和 standalone.zip
```

本任务会新增 public runtime 行为。执行时必须：

1. 阅读 `agents.md` 中 `packages/anieditorv5runtime-cc` 相关规则。
2. 判断是否需要新增长期规则。
3. 如果只是在本任务计划和 README 中固定 `forceStopAllParticles` / `requestSegmentedPlaybackEnd({ forceStopParticles })`，且现有 `agents.md` 已覆盖同步面，可以不更新 `agents.md`。
4. 如果实现中新增长期协作边界，例如“segmented force stop 必须延迟到 ending 完成后清粒子”被认为未来任务也容易误改，则在 `agents.md` 补充一条简短规则，并在报告中说明。
5. 如果执行时出现根级 `AGENTS.md`，需要检查是否与 `agents.md` 同步：

```bash
test ! -f AGENTS.md || cmp -s AGENTS.md agents.md
```

## 6. 测试计划

### 6.1 core 粒子 runtime 测试

修改：

```text
packages/anieditorv5runtime-cc/tests/core/particle-runtime.test.ts
```

新增覆盖：

- `forceStopAll()` 在正常 live particles 后返回空 frame，`getLiveParticleCount() === 0`。
- `forceStopAll()` 在 draining 中调用会清空 drain 状态，后续 `advanceDrain(...)` 不再保留旧粒子。
- `forceStopAll()` 可重复调用，结果稳定为空，不抛错。

不要为了测试访问 private fields；通过 public frame、`isDraining()`、`getLiveParticleCount()` 验证。

### 6.2 playback sequence / type 测试

优先不要让 `V5GSegmentedPlaybackSequence` 承担 `forceStopParticlesAfterEnd` 标记；这个标记属于 Cocos player 的粒子渲染/清理策略，不是 core sequence 的时间推进语义。

只有在实现确实修改了 sequence 行为时，才更新：

```text
packages/anieditorv5runtime-cc/tests/core/playback-sequence.test.ts
```

覆盖：

- `requestEnd({ forceStopParticles: true })` 或等价 API 能记录 ending 完成后的清粒子意图。
- phase 非 start/loop 时重复 requestEnd 继续显式失败。

如果 force flag 只放在 `V5GCocosPlayer`，则不需要为了测试制造 core 层奇怪 API；不要改不该改的东西。

### 6.3 Cocos player 测试

修改：

```text
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
```

必须新增/调整覆盖：

- `forceStopAllParticles()` 在 segmented loop 中立即销毁粒子节点，diagnostics 粒子计数和 live count 都变 0。
- `forceStopAllParticles()` 重复调用不会创建/泄露节点，计数保持 0，不触发 complete listener 重复调用。
- `forceStopAllParticles()` 默认 suppression：调用后继续 `update(...)`，同一 playback lifecycle 不重新生成粒子。
- `forceStopAllParticles({ suppressUntilNextPlayback: false })`：调用后继续 `update(...)`，若当前播放时间仍有 active particle animation，可重新生成粒子。
- `seek(...)` 后 suppression 解除，seek 到粒子 active 时间会重新显示确定性粒子。
- `play(...)` / `playRange(...)` / segmented 新播放会解除 suppression。
- 如果新增 `stop(...)`：`stop()` 停止播放并清空旧 range / segmented context；下一次无参 `play()` 不应继续旧 segmented ending。
- 如果新增 `stop(...)`：`stop({ forceStopParticles: true })` 会立即清空粒子节点和 runtime count。
- 如果不新增 `stop(...)`：需要有测试或 README 证明 `pause()`、`restart()`、`destroy()` 的既有语义未被伪装成 stop。
- `requestSegmentedPlaybackEnd()` 不传参数保持旧 drain 行为。
- `requestSegmentedPlaybackEnd({ forceStopParticles: false })` 与不传参数一致。
- `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 调用瞬间不清粒子；在 ending 完成前粒子仍存在或仍可更新。
- `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 在 segmented `start` phase 调用时也延迟到 ending 完成后清粒子。
- `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 到达尾帧后不进入 `particle-draining`，而是清空粒子并触发 complete listener。
- `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 的 complete event context 与旧 segmented complete 一致。
- 上一次 `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 的 flag 不会污染下一次 segmented 播放；下一轮默认 request end 仍进入 drain。
- 未初始化时调用 `forceStopAllParticles()` 显式失败；如果新增 `stop(...)`，未初始化时调用 `stop()` 也必须显式失败。
- 非 boolean 参数运行时显式失败，例如 `requestSegmentedPlaybackEnd({ forceStopParticles: "yes" as never })`。

不要新增为了通过测试而绕开生产合同的特殊 fake-driver 分支。fake `cc` 只应模拟真实 Cocos Node / SpriteFrame 能力。

### 6.4 standalone 测试

修改：

```text
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
```

必须覆盖：

- standalone import 暴露新类型和 prototype methods。
- standalone player 行为与 modular player 一致：
  - force stop all particles。
  - 如果新增 `stop(...)`，覆盖 stop with force particles。
  - segmented request end with delayed force stop。
- parity test 需要同时跑 modular 和 standalone，比较 `getPlaybackState()`、diagnostics、complete events 和粒子节点数量。

不要只给 modular player 加测试；standalone 是主要交付面。

### 6.5 README 文档验证

README 修改后必须确认：

- 新 API 示例是 Cocos runtime 宿主能真实调用的 TypeScript。
- 没有引入 `resources.load()`、URL loader、JsonAsset 绑定或 bundle manifest 自动读取。
- 没有说“浏览器/DOM/Pixi”行为适用于 Cocos runtime。
- 明确写出 `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 的延迟清理时机。

## 7. 交付和验收命令

### 7.1 package-local 验收

在仓库根目录执行：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc build
```

如果环境不允许执行 `format` 写入，可先运行：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

如果失败是格式问题，应执行 format 或用 Prettier 修复源文件，不要跳过 format:check。

### 7.2 standalone.zip 重建和验证

源码、standalone、README 和 checker 同步完成后，重建 zip：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
```

预期 zip 只包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

回到仓库根目录后继续验证：

```bash
test -f packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
```

`standalone.zip` 被 `.gitignore` 忽略也必须重建和直接验证。不要用 `git status` 证明 zip 已交付。

### 7.3 边界和漂移检查

在仓库根目录执行：

```bash
rg -n "forceStopAllParticles|forceStopParticles|suppressParticleEmission|requestSegmentedPlaybackEnd|stop\\(" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/standalone packages/anieditorv5runtime-cc/tests packages/anieditorv5runtime-cc/README.md packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
rg -n "resources\\.load|JsonAsset|from \\\"@slotclientengine|from '../|from \\\"\\.\\./|document|window" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
rg -n "\\.includes\\(" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
git diff --check
git status --short --untracked-files=all
git diff --stat
```

第二条和第三条 `rg` 预期不应命中 standalone runtime 的禁止项；如果命中，需要修 standalone 边界，不要修改 checker 放行错误。

生成物/忽略文件边界也要检查：

```bash
git check-ignore -v packages/anieditorv5runtime-cc/standalone.zip packages/anieditorv5runtime-cc/coverage/index.html packages/anieditorv5runtime-cc/.turbo/turbo-build.log packages/anieditorv5runtime-cc/.DS_Store
git ls-files packages/anieditorv5runtime-cc/dist
```

如果 `dist/` 不是 tracked 文件，不要为了 build 产物手工提交 `dist/`；如果执行时发现 `dist/` 已变成 tracked 交付面，则报告必须写明并把 build 产物纳入同步验收。`.DS_Store`、`.turbo`、`coverage` 和 ignored `standalone.zip` 不能被误当作源码改动。

如果 `git diff --check` 报 trailing whitespace 或 conflict marker，必须修复后重新执行。

### 7.4 真实 Cocos 验收/交接

本仓库内的 fake `cc`、Vitest、typecheck、build、standalone checker 只能证明 TypeScript 和单文件边界。真实 Cocos Creator 3.8.6 编辑器/发布包仍是单独验收面。

如果本机没有真实 Cocos 环境，任务报告必须明确交接以下手工验收步骤：

1. 将 `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 和 `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts` 放入宿主 Cocos 项目脚本目录。
2. 使用已有可播放粒子 fixture，例如 `packages/anieditorv5runtime-cc/tests/fixtures/superwin.json` 或宿主项目内带粒子的 VNI 导出。
3. 绑定对应 `SpriteAtlas`，运行 `V5GPreview.example.ts` 或宿主自有组件。
4. 验证：
   - 正常 segmented `requestSegmentedPlaybackEnd()` 会进入 particle drain。
   - `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 请求瞬间不清粒子，ending 到尾帧后清空粒子，不出现 publish 红错。
   - `forceStopAllParticles()` 立即清空粒子，不影响 safe glow / chaser light / text binding / mounted nodes。
   - 如果本任务新增 `stop(...)`，再验证 `stop({ forceStopParticles: true })` 停止播放并清空粒子，下一次 `play(...)` 可以重新开始；如果未新增，则验证 `pause()`、`restart()`、`destroy()` 仍保持原语义。

报告中不要把“未运行真实 Cocos”写成“真实 Cocos 已通过”。如果只能完成仓库内验收，就明确写“真实 Cocos Creator 3.8.6 手工验收待宿主项目执行”。

## 8. 任务报告要求

完成后新增：

```text
tasks/76-anieditorv5runtime-cc-particle-force-stop-[utctime].md
```

报告必须包含：

- 任务摘要：新增了哪些 public API，默认行为是什么。
- API 合同：`forceStopAllParticles`、是否新增 `stop({ forceStopParticles })`、`requestSegmentedPlaybackEnd({ forceStopParticles })` 的最终语义。
- 关键实现文件列表。
- standalone 同步摘要：单文件、checker、standalone tests、zip。
- README / 示例同步摘要。
- `agents.md` 是否更新；如果未更新，说明现有规则已覆盖的原因。
- 测试证据：逐条列出第 7 节命令结果。
- `standalone.zip` 的 `zipinfo -1` 输出。
- standalone ES2015 / checker 边界检查结果，尤其是 `.includes(...)`、非 `cc` import、Node/DOM API 是否为 0 命中。
- 生成物和忽略文件判断：`dist/` 是否 tracked、`.DS_Store` / `.turbo` / `coverage` / `standalone.zip` 是否只是忽略文件。
- 真实 Cocos Creator 3.8.6 是否已验收；若未验收，写明手工验收步骤和待验证项。
- 风险和后续建议：例如 publish 包里是否需要用户重点观察红色 runtime error。
- 工作区最终状态摘要：`git status --short --untracked-files=all`、`git diff --stat`。

报告禁止只写“已完成”。必须能让后来者从报告复盘改了什么、怎么验收、还有什么不是本机已证实。

## 9. 二次遗漏检查清单

执行结束前按以下清单逐项检查：

- [ ] 是否确认当前没有覆盖已有 `tasks/76-game003-win-loop-dismiss-and-minecart-scale.md`。
- [ ] 是否新增并导出了 public 类型。
- [ ] 是否新增 `V5GCocosPlayer.forceStopAllParticles(...)`。
- [ ] 是否明确“不新增 stop”或新增 `V5GCocosPlayer.stop(...)`；如果新增，是否同步 stop 参数、README、checker 和 tests。
- [ ] 是否扩展 `requestSegmentedPlaybackEnd(...)`，且默认行为完全兼容旧调用。
- [ ] `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 是否延迟到 ending 完成后才清粒子，而不是调用瞬间清。
- [ ] start phase 调用 `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 是否也覆盖。
- [ ] force stop 是否同时清 runtime state 和 Cocos particle nodes，避免 diagnostics 与画面不一致。
- [ ] 重复 force stop 是否不会重复触发 complete listener 或泄露节点。
- [ ] suppression 是否防止同一播放生命周期里粒子被下一帧重新 emit。
- [ ] force flag 是否不会污染下一次 segmented 播放。
- [ ] `seek` / `restart` / 新 `play` 是否解除 suppression。
- [ ] `particle-draining` 中 force stop 是否能触发 pending complete，避免卡死。
- [ ] `pause()` 可恢复语义是否未被破坏。
- [ ] `restart()` 回到 0 秒语义是否未被破坏。
- [ ] safe glow、chaser light、mask、text binding、mounted node 是否没有被粒子清理误删。
- [ ] callback 错误是否仍同步抛出，没有被 try/catch 吞掉。
- [ ] modular source、standalone 单文件、checker、standalone tests、README、standalone.zip 是否全部同步。
- [ ] standalone 是否仍只 import `cc`，没有引入 workspace / Node / DOM / dist 依赖。
- [ ] standalone 是否保持 ES2015 安全写法，没有新增 `.includes(...)` 等 checker 禁止项。
- [ ] `.prettierignore` 是否继续排除 `coverage`、`dist`、`node_modules`、`standalone.zip` 和 fixture JSON。
- [ ] `V5GPreview.example.ts` 是否审查了 force-stop 示例入口，不论最终是否新增。
- [ ] 是否运行 `typecheck:standalone`、`standalone:check`、standalone parity/import/player tests。
- [ ] 是否重建并直接验证 `standalone.zip`。
- [ ] 是否检查 `agents.md` 是否需要同步。
- [ ] 是否写了 UTC 中文任务报告。
- [ ] 是否运行 `git diff --check`。
- [ ] 是否记录真实 Cocos 验收状态，没有把 fake `cc` 结果冒充为真实编辑器通过。
