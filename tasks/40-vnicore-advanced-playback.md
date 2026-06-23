# vnicore advanced playback 任务计划

## 1. 任务目标

持续完善 Pixi.js v8 VNI 动画核心库：

```text
/Users/zerro/github.com/slotclientengine/packages/vnicore
```

以及基于它播放导出动画的 viewer：

```text
/Users/zerro/github.com/slotclientengine/apps/anieditorv5viewer
```

本任务要让 `@slotclientengine/vnicore` 的播放接口支持三段式高级动画编排，并让 `apps/anieditorv5viewer` 提供独立的高级播放配置 UI。

典型目标场景：

- 动画从 `0s` 播放到 `3s`。
- 进入中间阶段后，非粒子动画停在 `3s` 这一帧。
- 中间阶段持续等待，粒子发射器仍按当前动画规则持续发射，已经发射出去的粒子继续按生命周期运动、淡出或消失。
- 用户点击“结束”后，非粒子动画从 `3s` 播到整个动画结尾。
- 动画真正结束后，粒子发射器停止发射，但已经发射出去的粒子不能瞬间消失，必须继续走完生命周期。

后续还要支持中间阶段不是单帧停住，而是整体循环，例如 `2.5s -> 3s` 反复循环；此时仍要维持粒子活动语义，不允许因为非粒子循环或停帧而把粒子全部清空。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成接口设计、核心实现、viewer UI、测试、浏览器验收、文档同步和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/40-vnicore-advanced-playback-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/40-vnicore-advanced-playback-260623-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 新增空目录必须放 `.keepme`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。如果确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short
git diff --stat
```

根协作规则文件当前实际路径是：

```text
agents.md
```

如果本任务实现后新增长期协作规则，例如“高级播放状态机和粒子排空语义必须属于 `packages/vnicore`，viewer 只能做 UI 配置和调用”，则需要同步更新 `agents.md`。如果执行时发现仓库同时存在 `AGENTS.md`，必须保持两者内容同步；如果仍只有 `agents.md`，只更新 `agents.md`。是否更新以及原因必须写入任务报告。

## 3. 当前实现事实

执行时必须重新阅读当前实现，以实际代码为准。当前已经观察到的相关事实如下。

`packages/vnicore` 已存在，包名：

```text
@slotclientengine/vnicore
```

当前公开入口：

```text
packages/vnicore/src/index.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/pixi/index.ts
```

当前核心播放类：

```text
packages/vnicore/src/pixi/vni-player.ts
```

当前 `VNIPlayer` 已支持：

- `init()`
- `play()`
- `pause()`
- `restart()`
- `seek(time)`
- `setLoop(loop)` / `getLoop()`
- `getTime()`
- `isPlaying()`
- `update(deltaSeconds)`
- `playRange(options)`
- `addPlaybackEvent(options)`
- `clearPlaybackEvent(id)` / `clearPlaybackEvents()`
- `onPlaybackComplete(listener)`
- `destroy()`

当前播放模型主要是完整时间轴播放或 range 播放。`playRange` 可以播放一个区间并选择 loop，但还没有“一次开始播放、进入中间循环、等待用户触发结束、再播放结束段”的高阶状态机。

当前核心采样路径：

```text
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
```

当前粒子绘制路径：

```text
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/layer-instance.ts
```

当前 `VNIPlayer.seek()` 会调用 `sampleProjectAtTime(...)`，然后 `drawParticles(...)`。`drawParticles(...)` 目前每次会先 `clearParticles()`，再按当前时间重新采样粒子 sprite。这适合确定性 seek 预览，但不足以表达“发射器停止后，已经发射的粒子继续走完生命周期”，因为一旦跳到动画结束时间，按当前时间重采样可能直接返回空粒子。

当前粒子类型：

- `particles`
- `particle_twinkle`
- `particle_wall`
- `particle_combo`

当前关键粒子契约必须保留：

- `particle_combo.sourceOpacity` 只控制原图层透明度，不能杀掉 combo 粒子。
- 粒子容器必须保持 per-layer 顺序：每个 image layer 的粒子容器紧跟该 layer 原图层之后。
- `progress <= 0` 的粒子不能渲染，避免 0 秒首帧漏出。
- 缺失必须 numeric param、未知 animation/easing/blend mode、贴图尺寸不匹配、缺失资源都必须显式失败。

当前 viewer UI：

```text
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/styles.css
```

当前 viewer 控件只有基础播放能力：

- Project 选择
- Play / Pause
- Restart
- Loop
- 时间轴 seek

本任务需要新增高级播放配置区域，且必须与基础播放功能分开。

## 4. 必须实现的行为契约

### 4.1 三段式高级播放

高级播放由两个时间点把动画拆成三段：

```text
start 段：0 -> loopStart
loop 段：loopStart -> loopEnd
end 段：loopEnd -> project.stage.duration
```

输入约束：

- `loopStart` 和 `loopEnd` 单位为秒。
- 两者都必须是 finite number。
- 必须满足 `0 <= loopStart <= loopEnd <= project.stage.duration`。
- `loopStart === loopEnd` 合法，表示 loop 段是单帧停留。
- `loopStart < loopEnd` 合法，表示 loop 段按该区间循环。
- `loopEnd === project.stage.duration` 合法，表示没有额外 end 段；用户触发结束后只停止发射器并等待粒子排空。
- 不允许对非法输入静默 clamp、替换默认值或继续播放；viewer 可以展示错误并禁止开始，但不能把错误吞掉。

运行语义：

- 用户点击高级播放“开始”后，从 `0s` 播放到 `loopStart`。
- 到达 `loopStart` 后进入 loop 段。
- 如果 `loopStart === loopEnd`，非粒子动画保持在该帧。
- 如果 `loopStart < loopEnd`，非粒子动画在 `[loopStart, loopEnd)` 区间循环。
- 在 loop 段中，除非用户点击高级播放“结束”，否则不会进入 end 段。
- 用户点击“结束”后，切换到 end 段，从 `loopEnd` 播放到 `project.stage.duration`。
- 切换到 end 段时不能清空已经存在的粒子。
- end 段播放完后，发射器停止发射；已经发射出去的粒子继续走完生命周期。
- 粒子排空后才算视觉上完全结束。

### 4.2 维持粒子活动

高级播放必须支持一个显式选项，viewer UI 文案使用：

```text
维持粒子活动
```

内部推荐命名：

```text
keepParticlesAlive
```

默认值应为 `true`。

当 `keepParticlesAlive === true`：

- loop 段中，非粒子动画可以停在某一帧或循环某一区间。
- 粒子发射器必须继续按当前动画规则发射。
- 已发射粒子必须继续按自己的生命周期更新。
- 非粒子采样时间和粒子运行时间不能再简单共用一个被冻结的 `currentTime`。

当 `keepParticlesAlive === false`：

- 高级播放可以退化为“非粒子和粒子都跟随同一个 loop 时间采样”的调试模式。
- 该模式也不能瞬间清空已经发射的粒子，除非用户执行 `destroy()` 或项目切换这类资源 teardown。

### 4.3 停止、暂停、销毁的边界

必须区分这些概念：

- `pause()`：暂停用户播放，时间不推进；不应让已发射粒子继续老化，也不应清空粒子。
- 逻辑播放完成：完整时间轴、range 或高级播放 end 段已经到达终点；此时发射器停止，但已发射粒子继续排空。
- 粒子排空完成：没有活跃粒子，视觉上完全停止。
- `destroy()`：项目切换或页面销毁；允许立即清空所有 Pixi 对象和粒子，因为这是资源 teardown，不是播放完成。
- `seek(time)`：手动定位；应清空 live 粒子状态并按定位时间做确定性预览，不能把 seek 当作播放完成后的排空。
- `restart()`：重新开始；应清空 active range、高级播放状态和 live 粒子状态，回到 `0s`。

无论基础播放、range 播放还是高级播放，只要是自然播放到终点或显式 stop，发射器都只能停止发射，已经发射出去的粒子必须继续完成生命周期，不能瞬间消失。

### 4.4 播放完成事件和 RAF 边界

必须明确区分“时间轴已经到终点”和“视觉已经完全结束”：

- 时间轴到终点：非粒子动画已经采样到目标终点，发射器停止发射，进入 `particle-draining`。
- 视觉完全结束：所有已发射粒子走完生命周期，进入 `complete`。

推荐语义：

- `onPlaybackComplete(...)` 在视觉完全结束后触发，也就是粒子排空后触发。
- 如果实现仍需要暴露“时间轴到终点”事件，应新增独立事件或状态，例如 `phase === "particle-draining"`，不要复用 `complete` 文案制造歧义。
- `onPlayingChange(false)` 可以在时间轴停止推进时触发，但内部 RAF 或 ticker 仍必须继续驱动 particle-draining，直到 live particles 为 `0`。
- `isPlaying()` 不能作为判断内部 RAF 是否仍在运行的唯一依据；需要在状态里暴露 `isDrainingParticles` 或等价字段。
- particle-draining 期间，`getTime()` 应保持在对应播放段终点，不能为了驱动粒子把主时间轴继续推到超过 `project.stage.duration`。

这些语义必须写入文档、测试和任务报告，避免后续宿主误以为 `pause()`、`complete`、`particle-draining` 是同一件事。

### 4.5 fail-fast 契约

不允许：

- 为了测试通过在生产逻辑里写隐藏 fallback。
- 遇到非法 loop 时间后自动替换成 `0`、`duration` 或旧值继续播放。
- 缺少粒子参数时用默认值继续播放。
- 贴图缺失时用占位纹理继续播放。
- 未知 animation/easing/blend mode 静默跳过。
- 粒子过多时静默丢弃一部分但不暴露诊断。
- 高级播放状态异常时静默回到普通播放。

允许：

- 对已经在现有运行时契约中允许 clamp 的粒子数值继续 clamp，例如当前 `particle-sampler` 对极端 count、size、spawnRate 等做范围保护。
- viewer 对用户输入做 UI 层错误提示，并禁止调用 runtime。
- 测试如果因为旧 mock、旧断言或旧 UI 查询导致奇怪写法，应修改测试，不要改不该改的生产逻辑。

### 4.6 不做的事

本任务不要做：

- 不要修改 `packages/anieditorv5runtime-cc`，高级播放和粒子排空先只落在 Pixi.js v8 的 `packages/vnicore`。
- 不要让 `apps/anieditorv5viewer` 自己维护三段式播放状态机；viewer 只做 UI 输入、状态展示和调用。
- 不要改 `docs/anieditor5/src/**` 的编辑器导出逻辑，除非发现明确导出 bug 阻塞验收；如果修改，必须在任务报告说明原因和验证。
- 不要改 `packages/gameframeworks`、`packages/rendercore`、`packages/pixiani` 等无关包。
- 不要为了高级播放新增第二套资源导入或第二套 VNI schema。

## 5. 建议 public API

必须保留现有无参 `play()` 行为，避免破坏当前调用方。

推荐把 `play()` 扩展为可选参数接口：

```ts
export type VNIPlayOptions =
  | { mode?: "timeline" }
  | { mode: "range"; range: VNIPlaybackRange; loop?: boolean }
  | VNISegmentedPlaybackOptions;

export interface VNISegmentedPlaybackOptions {
  mode: "segmented";
  loopStart: VNIPlaybackPoint;
  loopEnd: VNIPlaybackPoint;
  keepParticlesAlive?: boolean;
}
```

约定：

- `player.play()` 等价于现有完整时间轴播放。
- `player.play({ mode: "timeline" })` 等价于完整时间轴播放。
- `player.play({ mode: "range", range, loop })` 等价于当前 `playRange({ range, loop })`。
- `player.playRange(...)` 保留，内部可委托到新的 `play({ mode: "range", ... })`，以兼容已有代码和文档。
- `player.play({ mode: "segmented", loopStart, loopEnd, keepParticlesAlive })` 启动三段式高级播放。

需要新增结束触发接口：

```ts
requestSegmentedPlaybackEnd(): void
```

约定：

- 只有当前处于 segmented playback 时才能调用。
- 调用后进入 end 段。
- 如果没有 active segmented playback，必须显式抛错。
- UI 应在不合法状态禁用“结束”按钮，不要依靠 runtime 吞错。

需要新增状态查询或回调，推荐二选一，但必须满足 viewer 和测试可稳定判断高级播放阶段：

```ts
type VNISegmentedPlaybackPhase =
  | "idle"
  | "start"
  | "loop"
  | "ending"
  | "particle-draining"
  | "complete";

getPlaybackState(): VNIPlaybackState;
```

或：

```ts
onPlaybackStateChange?: (state: VNIPlaybackState) => void;
```

`VNIPlaybackState` 至少需要包含：

- 当前 mode：`timeline` / `range` / `segmented`
- 当前 phase
- 当前非粒子采样时间
- 当前是否正在播放
- 当前是否正在粒子排空
- 当前粒子数量

是否新增 public `stop()` 由实现者决定，但若新增，推荐语义：

```ts
stop(options?: { drainParticles?: boolean }): void
```

- 默认 `drainParticles: true`。
- `drainParticles: true` 表示停止发射器并保留已发射粒子直到生命周期结束。
- 只有 `destroy()` 或明确资源 teardown 才允许立即清空所有粒子。

## 6. 核心实现范围

必须修改或新增：

```text
packages/vnicore/src/index.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/index.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/types.ts
```

建议新增纯逻辑模块，降低 `VNIPlayer` 复杂度：

```text
packages/vnicore/src/core/playback-sequence.ts
packages/vnicore/src/core/particle-runtime.ts
```

`playback-sequence.ts` 建议负责：

- normalize `VNIPlaybackPoint` 到秒。
- 校验 `loopStart` / `loopEnd`。
- 管理 `start` / `loop` / `ending` / `particle-draining` / `complete` phase。
- 在 `loopStart === loopEnd` 时输出非粒子 hold 时间。
- 在 `loopStart < loopEnd` 时输出非粒子 loop 时间。
- 收到 `requestSegmentedPlaybackEnd()` 后输出 end 段时间。
- 保持 marker / complete 事件顺序不倒退。
- 定义 `setLoop(...)` 与 segmented playback 的关系：基础 Loop 开关不应覆盖 segmented 的“等待用户点击结束”语义。
- 定义手动 `seek(...)` 的关系：用户拖动基础时间轴时应退出 segmented/range live playback，清理 live 粒子状态，并进入确定性预览。

`particle-runtime.ts` 建议负责：

- 从粒子动画中生成 emission。
- 保存 active particles 的 birth time、lifetime、seed/index、layer/animation id 和必要初始参数。
- 每帧根据粒子年龄采样 sprite 状态。
- 当发射器停止后，只更新已有粒子，不再创建新粒子。
- 粒子生命周期结束后移除 Pixi sprite。
- 支持 deterministic unit test，不依赖真实 Pixi。

不要把全部高级播放逻辑塞进 viewer。viewer 只负责收集用户输入、调用 `VNIPlayer` 和显示状态；核心播放状态机和粒子排空语义必须在 `packages/vnicore` 内。

## 7. 粒子实现细节要求

现有 `sampleParticleSpritesForLayer(...)` 是按单个时间点重建 sprite 的 deterministic sampler。它可以保留用于 `seek()` 预览和单元测试，但 live playback 需要额外支持持续发射和排空。

实现时至少要满足：

- 不破坏 `seek()` 的确定性预览能力。
- live playback 不再每帧无条件 `clearParticles()` 后完全重建所有粒子。
- 正常播放过程中，active particles 可以用 sprite pool 或 map 更新，避免每帧销毁重建造成不必要抖动。
- `particles` / `particle_twinkle` / `particle_wall` / `particle_combo` 都要覆盖发射器停止后的排空。
- `particle_combo.sourceOpacity = 0` 时原图层可隐藏，但 combo 粒子继续显示。
- `particle_wall` 这类持续发射器在 hold loop 中仍能继续发射。
- `loopStart === loopEnd` 时，非粒子采样时间固定，但粒子 runtime 时间仍继续推进。
- `loopStart < loopEnd` 时，非粒子按 loop range 循环；粒子不能在每次 loop wrap 时被清空。
- 高级 loop 中粒子发射器必须有独立 emitter clock：非粒子采样时间可以停住或循环，粒子发射不能因为主采样时间停住而停止，也不能因为 loop wrap 被当作新项目重置。
- project 切换、`destroy()`、`restart()`、`seek()` 必须清理 live particle runtime，避免旧项目粒子泄漏到新项目。

粒子 lifetime 来源：

- 对已有 burst / twinkle / wall / combo 参数，尽量沿用当前 sampler 的生命周期定义。
- 如果某类粒子当前没有显式 lifetime，需要从现有 duration / localProgress / vanish 语义中抽出等价生命周期，不允许随便设一个默认值掩盖问题。
- 如果参数不足以表达 live lifetime，应在 validation 或 runtime 中显式失败，并在任务报告说明原因。

性能和诊断：

- 当前参数 clamp 可以保留。
- 如果新增上限保护，必须在 diagnostics 或错误中可见，不能静默丢粒子。
- `container.dataset` 建议新增：
  - `data-vni-playback-mode`
  - `data-vni-playback-phase`
  - `data-vni-particle-draining`
  - `data-vni-live-particles`
- 旧的 `data-vni-particle-sprites` 和 `data-v5g-particle-sprites` 仍要保留。

## 8. viewer 高级播放 UI 范围

必须修改：

```text
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/styles.css
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/README.md
```

UI 布局要求：

- 高级播放区域必须和基础播放控件分开。
- 基础播放继续保留 Project、Play/Pause、Restart、Loop、时间轴。
- 高级播放区域至少包含：
  - `loopStart` 数字输入，单位秒。
  - `loopEnd` 数字输入，单位秒。
  - “开始”按钮。
  - “结束”按钮。
  - “维持粒子活动” checkbox，默认勾选。
  - 当前高级播放阶段显示，例如 `start` / `loop` / `ending` / `particle-draining` / `complete`。
- 不要用大段说明文字占页面；控件标签和状态文本即可。
- 移动端不能让输入框、按钮、时间轴文字互相挤压或溢出。
- 高级播放开始后，基础 Play/Pause/Restart 的行为必须明确：
  - `Restart` 应停止当前高级播放并回到 `0s`，同时清理 live 粒子。
  - 基础 `Play/Pause` 可以继续控制暂停/恢复，但不能把高级播放状态偷偷退回普通播放。
  - Project 切换必须销毁旧 player 并清理所有高级播放状态。

默认值建议：

- 选中 `multipay` 项目时，可以默认 `loopStart = 3`、`loopEnd = 3`，方便验收。
- 其它项目默认 `loopStart = min(3, duration)`、`loopEnd = min(3, duration)`。
- 默认值只是 UI 初始化，不代表 runtime 对非法输入做 fallback；用户修改为非法值时必须显示错误并禁止开始。

按钮行为：

- “开始”调用 `player.play({ mode: "segmented", ... })`。
- “结束”调用 `player.requestSegmentedPlaybackEnd()`。
- “结束”按钮只在 segmented playback 已开始且未进入 ending/complete 时可用。
- 用户在 start 段尚未到达 loop 段时点击“结束”，必须有明确语义：推荐先播放到 `loopStart` 后立即进入 end 段；如果实现选择直接切到 `loopEnd`，必须在测试和 README 中写明。不能静默忽略点击。

## 9. 文档和示例同步

必须更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
packages/vnicore/examples/playback-events.ts
```

建议新增示例：

```text
packages/vnicore/examples/segmented-playback.ts
```

示例必须能被当前命令 typecheck：

```bash
pnpm --filter @slotclientengine/vnicore examples:typecheck
```

文档必须说明：

- 无参 `play()` 仍是普通播放。
- `play({ mode: "segmented", ... })` 的两段时间如何切成 start / loop / end。
- `loopStart === loopEnd` 是 hold-frame loop。
- `loopStart < loopEnd` 是 range loop。
- `keepParticlesAlive` 的默认值和语义。
- `pause()`、播放完成排空、`seek()`、`restart()`、`destroy()` 的差异。
- `onPlaybackComplete(...)` 与 `particle-draining` 的触发时机。
- `isPlaying()`、内部 RAF、粒子排空状态之间的差异。
- 粒子排空完成前，视觉上可能仍有粒子，这是预期行为。
- viewer 的高级播放 UI 只是调用示例，不拥有核心状态机。

## 10. 测试计划

### 10.1 vnicore 单元测试

新增或更新：

```text
packages/vnicore/tests/core/playback-sequence.test.ts
packages/vnicore/tests/core/particle-runtime.test.ts
packages/vnicore/tests/core/particle-sampler.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
```

必须覆盖：

- `loopStart === loopEnd` 的 hold-frame loop。
- `loopStart < loopEnd` 的 range loop。
- 非法时间：NaN、Infinity、负数、倒序、超过 duration。
- 基础 `setLoop(false)` 不会让 segmented loop 自动结束；segmented 只由用户结束请求切到 end 段。
- `requestSegmentedPlaybackEnd()` 在合法状态进入 end 段。
- `requestSegmentedPlaybackEnd()` 在非法状态显式失败。
- end 段完成后进入 particle-draining，而不是立即清空粒子。
- 粒子排空后进入 complete。
- `onPlaybackComplete(...)` 在粒子排空后触发；如果实现新增 timeline-end 事件，也必须单独测试。
- particle-draining 期间内部 RAF/ticker 继续运行，但主时间轴不超过播放终点。
- `pause()` 不推进粒子年龄。
- `seek()` 清理 live 粒子状态并执行确定性预览。
- `seek()` 会退出 segmented/range live playback，不保留旧的高级播放 phase。
- `restart()` 清理高级播放和 live 粒子。
- `destroy()` 清理所有 diagnostics 和 Pixi 粒子对象。
- `particle_combo.sourceOpacity = 0` 时，非粒子图层隐藏但粒子仍存在。
- `particle_wall` 在 hold-frame loop 中持续产生新粒子。
- range loop wrap 不清空已有粒子。
- 普通非循环 timeline 播放到终点时也执行粒子排空。
- `playRange(... loop:false)` 播放到区间终点时也执行粒子排空。
- marker 和 complete listener 顺序不被高级播放破坏。

### 10.2 viewer 单元测试

更新：

```text
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/tests/bundled-projects.test.ts
```

必须覆盖：

- 页面初始化仍创建 `VNIPlayer`。
- Project 切换仍 destroy 旧 player。
- 高级播放区域存在且与基础控件分开。
- 两个时间输入会传给 `play({ mode: "segmented", ... })`。
- “维持粒子活动”默认勾选，取消后传 `keepParticlesAlive: false`。
- 非法时间输入不会调用 runtime，并显示错误状态。
- 点击“结束”会调用 `requestSegmentedPlaybackEnd()`。
- Restart 会清理或重启高级播放状态。
- 拖动基础时间轴会退出高级播放 live 状态，并回到确定性预览。
- Project 切换后，高级播放输入的默认值、最大值、错误状态和 phase 都重置到新项目。

如果测试 mock 因为新增 API 导致旧断言不适配，修改测试 mock 和断言，不要为了旧测试保留错误生产逻辑。

## 11. 浏览器验收

实现完成后启动 viewer：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

如果端口被占用，使用 5176 或下一个空闲端口，并在任务报告中记录实际端口。

必须在浏览器验收：

- 选择 `multipay`。
- 高级播放输入 `loopStart = 3`、`loopEnd = 3`。
- 勾选“维持粒子活动”。
- 点击“开始”。
- 确认非粒子动画进入 3 秒附近后停住。
- 确认停住时粒子仍持续发射，粒子数量或视觉效果仍在变化。
- 点击“结束”。
- 确认 end 段播放到结尾。
- 确认结尾后不再发射新粒子，但已经存在的粒子继续淡出/移动直到生命周期结束。
- 确认粒子排空后 diagnostics 显示 complete 或 live particle 数为 0。

还必须验收 range loop：

- 同一项目或合适项目输入 `loopStart = 2.5`、`loopEnd = 3`。
- 点击“开始”。
- 确认非粒子动画在 2.5 到 3 秒之间循环。
- 确认 loop wrap 时粒子不被瞬间清空。
- 点击“结束”后能进入 end 段并排空粒子。

布局验收：

- 至少检查一个桌面宽度和一个移动宽度。
- 高级播放区域、基础播放区域、两个时间输入、按钮、checkbox、phase 文案和时间轴不能互相遮挡或溢出。
- `multipay`、`runtime_50`、普通 legacy project 切换后，高级播放默认时间和 max 值仍正确。

浏览器验收时至少记录以下 diagnostics：

- `data-vni-project-id`
- `data-vni-time`
- `data-vni-playback-mode`
- `data-vni-playback-phase`
- `data-vni-particle-draining`
- `data-vni-live-particles`
- `data-vni-particle-sprites`
- `data-vni-non-background-samples`
- `data-vni-max-pixel-delta`

如果使用自动浏览器工具或 Playwright，任务报告必须写明检查脚本、端口、截图或 dataset 证据。若只能手工验收，也必须记录操作步骤和观察结果。

## 12. 必跑命令

实现完成后，从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

如果某条命令失败：

- 先确认失败是否来自本任务改动。
- 如果是测试过时或 mock 不匹配，修改测试。
- 如果是真实逻辑 bug，修生产逻辑。
- 不允许用隐藏 fallback 或放宽运行时契约来换绿色测试。
- 任务报告必须记录失败命令、失败原因、修复方式和最终重跑结果。

## 13. 任务报告要求

任务完成后新增：

```text
tasks/40-vnicore-advanced-playback-[utctime].md
```

报告必须包含：

- UTC 时间戳和执行者。
- 修改文件清单。
- public API 变更摘要。
- 粒子排空实现方案摘要。
- viewer 高级播放 UI 行为摘要。
- 是否更新 `agents.md`，以及原因。
- 是否执行 `pnpm install`，以及 `pnpm-lock.yaml` 是否变化。
- 所有必跑命令和结果。
- 浏览器验收步骤、端口、项目、输入时间、diagnostics 或截图证据。
- 对 `multipay` 的 `3s/3s` hold-frame 验收结论。
- 对 `2.5s/3s` range-loop 验收结论。
- `onPlaybackComplete(...)`、`isPlaying()`、particle-draining 的最终语义。
- 桌面和移动布局验收结论。
- 第二遍遗漏检查结果。
- 已知限制；如果存在限制，必须说明为什么不影响本任务验收。

报告命名必须用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/40-vnicore-advanced-playback-260623-123456.md
```

## 14. 第二遍遗漏检查

提交前必须逐项检查：

- `packages/vnicore` public export 是否包含新增类型和方法。
- `play()` 无参旧行为是否保持。
- `playRange(...)` 旧行为是否保持。
- `setLoop(...)` 是否不会破坏 segmented 的用户点击结束语义。
- 高级播放非法时间是否显式失败。
- `loopStart === loopEnd` 是否真的是非粒子 hold frame。
- `loopStart < loopEnd` 是否真的是非粒子 range loop。
- `keepParticlesAlive` 默认是否为 `true`。
- `keepParticlesAlive` 是否影响粒子运行时，而不是只影响 UI 文案。
- 播放完成后发射器是否停止。
- 播放完成后已发射粒子是否继续生命周期。
- 粒子排空后是否进入 complete。
- `onPlaybackComplete(...)` 是否只在视觉完全结束后触发，或是否有清晰的独立 timeline-end 事件。
- particle-draining 期间 RAF/ticker 是否继续驱动粒子，但主时间轴不超过终点。
- `pause()` 是否冻结粒子年龄。
- `seek()` / `restart()` / project switch / `destroy()` 是否清理 live 粒子状态。
- 手动 `seek()` 是否退出高级播放 live 状态并进入确定性预览。
- `particle_combo.sourceOpacity = 0` 是否仍显示 combo 粒子。
- per-layer 粒子层级是否保持。
- 0 秒首帧粒子漏出是否没有回归。
- viewer 高级播放 UI 是否与基础播放分开。
- 移动端布局是否不溢出。
- README、中文 API、中文使用文档、示例是否同步。
- migration 文档和现有 playback 示例是否同步。
- `apps/anieditorv5viewer/README.md` 是否同步。
- `agents.md` 是否需要更新；如果需要，是否已更新并写入报告。
- `tasks/40-vnicore-advanced-playback-[utctime].md` 是否已生成。
- `git status --short` 是否只包含本任务相关改动和用户已有改动。

只有上述检查全部完成，才算本任务验收通过。
