# anieditorv5runtime-cc range events 任务计划

## 1. 任务目标

在现有 Cocos Creator 3.8.6 V5G runtime 包内补充播放控制和事件调度能力：

```text
packages/anieditorv5runtime-cc
```

本任务必须优先保证 standalone 版本可用：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone.zip
```

核心交付：

- 新增一个高级播放接口，可以指定播放时间段，例如 0 到 4 秒。
- 同一个高级播放接口也可以指定播放帧段，例如第 30 到第 60 帧。
- 时间段或帧段播放时，可以显式设置是否循环。
- 可以给某个时间点或某一帧插入事件。
- 可以监听当前播放任务结束。这里的“当前播放任务”指本次 `playRange(...)` 或全时长非循环播放，不是 V5G 导出 schema 里的 layer `keyframes`。
- 现有 `play()`、`pause()`、`restart()`、`seek()`、`update(deltaSeconds)` 行为继续兼容，已有调用方不需要迁移。
- 新增行为必须明确当前播放任务状态，不允许出现 range 播放结束后状态半保留、`play()` 语义不清或刚好到终点不触发完成的边界漏洞。

任务完成后新增中文任务报告：

```text
tasks/34-anieditorv5runtime-cc-range-events-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/34-anieditorv5runtime-cc-range-events-260618-123456.md
```

## 2. 当前仓库事实

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 根协作规则文件当前同时存在：
  - `AGENTS.md`
  - `agents.md`
- 新增空目录必须放 `.keepme`。
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

当前 package 事实：

- package 名：`@slotclientengine/anieditorv5runtime-cc`
- 模块化源码位于 `packages/anieditorv5runtime-cc/src`。
- Cocos player 当前位于 `packages/anieditorv5runtime-cc/src/cocos/player.ts`。
- Cocos player 类型当前位于 `packages/anieditorv5runtime-cc/src/cocos/types.ts`。
- standalone 单文件位于 `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`。
- README 明确说明普通 Cocos Creator 项目优先复制 standalone 单文件，而不是依赖 pnpm workspace package。
- 当前 `V5GCocosPlayer` 已有：
  - `init()`
  - `seek(time)`
  - `update(deltaSeconds)`
  - `play()`
  - `pause()`
  - `restart()`
  - `setLoop(loop)`
  - `destroy()`
  - `time`
  - `playing`
  - `onTimeChange`
  - `onPlayingChange`
- 当前 `update(deltaSeconds)` 只按 `project.stage.duration` 做全时长播放；超出时长时，`loop=true` 则取模，`loop=false` 则停在 duration。
- 当前没有分段播放、帧到时间的显式换算、事件 marker、播放完成事件。
- 当前 package 脚本包含：
  - `pnpm --filter @slotclientengine/anieditorv5runtime-cc build`
  - `pnpm --filter @slotclientengine/anieditorv5runtime-cc lint`
  - `pnpm --filter @slotclientengine/anieditorv5runtime-cc test`
  - `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck`
  - `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone`
  - `pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check`
  - `pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check`
- 当前根入口 `packages/anieditorv5runtime-cc/src/index.ts` 刻意不 runtime re-export `createV5GCocosPlayer`，避免普通 package 根入口运行时引入真实 `"cc"` 模块。新增类型可以从根入口导出；真实 Cocos factory 仍应留在 `./cocos` 子入口和 standalone 文件中。

## 3. 必须参考的现有文件

实现前先阅读这些文件，不要只按接口想象改：

```text
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

如发现 standalone 与模块化源码行为不一致，应优先修正差异并补 parity 测试，不允许只改其中一边。

## 4. 范围边界

本任务要做：

- 在 `V5GCocosPlayer` 上增加高级分段播放接口。
- 给分段播放增加时间单位和帧单位两种输入。
- 帧单位必须显式传入 `fps`，不要暗中默认 60fps。V5G project 目前没有全局 fps 字段，静默猜测会让问题更难查。
- 增加播放事件 marker：按时间或帧注册，播放推进跨过该点时触发。
- 增加播放完成监听：非循环播放到当前播放任务终点时触发。
- 保持所有事件由宿主的 `update(deltaSeconds)` 驱动，不使用 `setTimeout`、Cocos tween、浏览器全局对象或异步计时器。
- 更新模块化源码、standalone 单文件、standalone 检查脚本、README、示例和测试。
- 同步更新 `standalone.zip`，确保压缩包内包含最新 standalone 文件和示例。

本任务不要做：

- 不实现 V5G 导出 schema 的非空 layer `keyframes` 支持；当前 README 里“不支持非空 keyframes”的 runtime 边界仍然保留。
- 不改 `sampleProjectAtTime(...)` 的基础采样语义来迎合播放器事件。
- 不把播放事件写入 V5G project JSON；事件是 runtime player API，不是导出数据格式。
- 不新增 `apps/anieditorv5viewer-cc`。
- 不引入新的 Cocos Component 装饰器到 runtime 文件。
- 不从 `packages/anieditorv5runtime-cc/src/index.ts` runtime re-export `createV5GCocosPlayer` 或 `createCocosNodeDriver`；根入口必须继续避免真实 `"cc"` 运行时依赖。
- 不让 standalone runtime 依赖相对 import、workspace package、`dist`、Node builtin、DOM global 或资源加载 API。
- 不吞掉事件 callback 抛出的错误；callback 抛错应从 `update(...)` 或触发该事件的 public method 继续抛出，尽早暴露问题。
- 不为了测试通过修改不该改的生产语义。如果测试导致一些奇怪写法，就修改测试，不要改不该改的东西，以免后续出现问题难查。

## 5. 推荐 API 合同

保留现有 `play(): void`，新增一个高级 play 接口，建议命名为：

```ts
player.playRange({
  range: { unit: "time", start: 0, end: 4 },
  loop: false,
});

player.playRange({
  range: { unit: "frame", start: 30, end: 60, fps: 60 },
  loop: true,
});
```

推荐新增类型：

```ts
export type V5GCocosPlaybackRange =
  | { unit: "time"; start: number; end: number }
  | { unit: "frame"; start: number; end: number; fps: number };

export interface V5GCocosPlayRangeOptions {
  range: V5GCocosPlaybackRange;
  loop?: boolean;
}
```

推荐事件 API：

```ts
export type V5GCocosPlaybackPoint =
  | { unit: "time"; at: number }
  | { unit: "frame"; at: number; fps: number };

export interface V5GCocosPlaybackEventContext {
  id: string;
  time: number;
  previousTime: number;
  currentTime: number;
  loopIndex: number;
}

export interface V5GCocosPlaybackEventOptions {
  id: string;
  at: V5GCocosPlaybackPoint;
  once?: boolean;
  listener: (event: V5GCocosPlaybackEventContext) => void;
}

export interface V5GCocosPlaybackCompleteContext {
  startTime: number;
  endTime: number;
  currentTime: number;
  loopIndex: number;
}
```

推荐新增方法：

```ts
playRange(options: V5GCocosPlayRangeOptions): void;
addPlaybackEvent(options: V5GCocosPlaybackEventOptions): () => void;
clearPlaybackEvent(id: string): void;
clearPlaybackEvents(): void;
onPlaybackComplete(
  listener: (event: V5GCocosPlaybackCompleteContext) => void,
): () => void;
```

接口语义必须写进 README，并在模块化版本和 standalone 版本中一致。

## 6. 行为规则

时间段播放：

- `range.unit === "time"` 时，`start` 和 `end` 的单位是秒。
- `start`、`end` 必须是 finite number。
- `0 <= start < end <= project.stage.duration`，否则直接抛错。
- `playRange(...)` 应立即 `seek(start)`，然后进入播放状态。
- `playRange(...)` 必须在 player 已 `init()` 后调用；未初始化时沿用 `seek(...)` 的显式失败，不做延迟排队。
- 当播放推进到或超过 `end`，即 `nextTime >= endTime`：
  - `loop=false`：先 seek 到 `end`，再触发跨过的 marker，然后停止播放并清空 active range，最后触发完成事件。
  - `loop=true`：先 seek 到 `end`，再处理到 `end` 的 marker，然后回到 `start` 继续播放；循环播放不触发完成事件。

帧段播放：

- `range.unit === "frame"` 时，`start` 和 `end` 是非负整数帧号。
- `fps` 必须显式传入，且必须是 finite positive number。
- 换算公式固定为 `time = frame / fps`。
- 换算后继续使用时间段规则校验：`0 <= startTime < endTime <= project.stage.duration`。
- 不要默认 60fps，不要从 Cocos update 频率猜测 fps。

事件 marker：

- `addPlaybackEvent(...)` 注册的是 project 时间轴上的绝对时间点。
- `unit: "frame"` 的事件同样通过 `frame / fps` 转成绝对时间点。
- 事件时间必须满足 `0 <= time <= project.stage.duration`，否则直接抛错。
- `id` 必须唯一；重复 id 应直接抛错，不要静默覆盖旧事件。
- 返回的函数是 disposer，调用后移除该事件。
- `clearPlaybackEvent(id)` 找不到 id 时应直接抛错，避免隐藏拼写错误。
- `clearPlaybackEvents()` 用于显式清空所有 marker。
- marker 只在播放推进跨过该时间点时触发；手动 `seek(...)`、`init()`、`restart()` 不应触发 marker。
- 单次 `update(deltaSeconds)` 即使 delta 很大，也要触发被跨过的 marker，不能因为跳帧漏事件。
- 只支持正向播放，因为当前 `update(deltaSeconds)` 合同只接受非负 delta。
- 同一个 `update(...)` 跨过多个 marker 时，按时间从小到大触发。
- marker 与播放终点相同一帧时，先触发 marker，再触发完成事件。
- `once=true` 的 marker 触发后自动移除；默认 `once=false`，循环播放时每次跨过都会触发。
- 新注册的 marker 不 retroactive：如果当前播放时间已经越过该时间点，必须等后续播放再次跨过它才触发。
- marker 不在当前播放边界内时不会触发。例如正在播放 0 到 4 秒的 range，8 秒 marker 只能等播放任务覆盖 8 秒时触发。
- `once=true` 的 marker 建议先从内部表移除再调用 listener；这样即使 listener 抛错，也不会因为下一次 `update(...)` 重复触发同一个一次性 marker。

完成事件：

- `onPlaybackComplete(...)` 监听当前非循环播放任务结束。
- 使用 `playRange({ range, loop: false })` 时，完成点是 range 的 `end`。
- 使用现有 `setLoop(false); play();` 做全时长播放时，完成点是 `project.stage.duration`。
- 循环播放不触发完成事件；如业务需要每圈末尾通知，应在 range end 或 duration 上注册 marker。
- 返回 disposer，调用后移除该完成监听。
- 完成 listener 抛错时不要吞掉，保持显式失败。

现有 API 兼容：

- `play()` 继续不要求传参；如果当前存在未完成的 active range，应恢复这个 range；如果没有 active range，则播放全时长时间轴。不要让 `pause(); play();` 意外丢失 range。
- `pause()` 只暂停播放，不清空 active range、marker 或完成监听。
- `restart()` 保持现有语义：清空 active range，seek 到 0；不要把它改成分段 restart。如果业务要重新播放同一段，应再次调用 `playRange(...)`。
- `setLoop(loop)` 继续设置默认全时长播放 loop。`playRange(...)` 传入的 `loop` 只影响本次 range 播放任务；未传 `options.loop` 时可以沿用当前 `setLoop(...)` 状态。
- 非循环 active range 完成后，应清空 active range；完成 listener 收到的 context 仍必须包含本次 range 的 `startTime` 和 `endTime`。
- `destroy()` 继续销毁 runtime 节点并停止播放；同时应清理当前 range 状态。是否清理已注册 marker 和完成监听必须在 README 中明确，建议 `destroy()` 清理所有事件和监听，避免宿主 Component 销毁后遗留 callback。

## 7. 实现步骤

### 7.1 模块化类型与状态

修改：

```text
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
```

建议在 `types.ts` 增加 range、point、event、complete context 类型，并从 `src/cocos/index.ts` 与 `src/index.ts` 正常导出。

在 `V5GCocosPlayer` 内新增最小状态：

```text
activeRange: { startTime: number; endTime: number; loop: boolean } | null
playbackEvents: Map<string, normalized event>
completeListeners: Set<listener>
loopIndex: number
```

如果需要 helper，优先放在 `player.ts` 附近的私有函数中；只有确实能降低复杂度、且会被测试或导出复用时，才新增 `src/cocos/playback.ts`。

### 7.2 时间推进改造

修改 `update(deltaSeconds)`，保持当前非负 finite 校验。

建议算法：

1. 如果未播放，直接返回。
2. 取当前播放边界：
   - 有 `activeRange` 时使用 range start/end/loop。
   - 无 `activeRange` 时使用 `0/project.stage.duration/this.loop`。
3. 计算 `nextTime = currentTime + deltaSeconds`。
4. 如果 `nextTime < endTime`：
   - `seek(nextTime)`。
   - 触发 `(previousTime, nextTime]` 内 marker。
5. 如果 `nextTime >= endTime`：
   - `seek(endTime)`。
   - 触发 `(previousTime, endTime]` 内 marker。
   - 如果 loop=false：停止播放并清空 active range，再触发完成监听。
   - 如果 loop=true：按 range 长度计算 overflow，增加 `loopIndex`，再 seek 到 `startTime + overflow`，并处理从 `startTime` 到该落点之间跨过的 marker。

如果一次 `update(...)` 跨过多圈循环，marker 应按每一圈的时间顺序触发，不要只触发最后一圈。

注意：不要用 `seek(...)` 自己触发 marker，否则手动 seek 会产生意外事件。

### 7.3 事件触发实现

新增私有方法建议：

```text
normalizePlaybackRange(...)
normalizePlaybackPoint(...)
emitPlaybackEventsBetween(previousTime, nextTime, boundary)
emitPlaybackComplete(...)
```

实现要求：

- 输入校验失败直接抛 `Error`，错误信息包含 API 名和非法字段，例如 `V5GCocosPlayer.playRange range.start must be ...`。
- 事件 callback 按注册数据触发，不 catch。
- disposer 重复调用应该是幂等的；显式 `clearPlaybackEvent(id)` 找不到 id 则抛错。
- 完成 listener 与 marker listener 都是同步调用；不要放到 Promise、microtask、`setTimeout` 或 Cocos schedule 里延后执行。

### 7.4 standalone 同步

必须把模块化新增类型、方法、私有状态和行为同步到：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

并更新：

```text
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
```

`check-standalone.mjs` 的 `requiredExports` 至少应新增：

```text
export type V5GCocosPlaybackRange
export type V5GCocosPlaybackPoint
export interface V5GCocosPlayRangeOptions
export interface V5GCocosPlaybackEventOptions
export interface V5GCocosPlaybackEventContext
export interface V5GCocosPlaybackCompleteContext
```

继续确保 standalone runtime 只 import `"cc"`，不引入相对 import、workspace import、Node builtin、DOM global、`JsonAsset`、`resources.load()` 或 decorated Component。

### 7.5 文档与示例

更新：

```text
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

README 必须新增：

- `playRange` 的时间段示例。
- `playRange` 的帧段示例，并说明 `fps` 必须显式传入。
- `addPlaybackEvent` 的时间点示例。
- `addPlaybackEvent` 的帧点示例。
- `onPlaybackComplete` 示例。
- 事件由 `update(deltaTime)` 驱动，不使用异步计时器。
- `destroy()` 对事件和监听的清理规则。

示例 Component 可以使用 Cocos 装饰器，因为它是宿主侧示例；但 `standalone/anieditorv5runtime-cc.ts` 这个 runtime 文件本身不得包含 decorated Component。

### 7.6 standalone.zip 同步

当前仓库存在：

```text
packages/anieditorv5runtime-cc/standalone.zip
```

实现完成后必须重新生成，确保压缩包内容同步到最新 standalone 文件和示例。建议在 package 目录执行：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
```

验收时确认 `zipinfo -1 standalone.zip` 只出现期望文件，不应包含：

```text
__MACOSX
._*
```

## 8. 测试计划

必须补充或更新模块化测试：

```text
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
```

覆盖点：

- `playRange({ range: { unit: "time", start: 0, end: 0.4 }, loop: false })` 到 end 后停止并触发完成事件。
- `playRange({ range: { unit: "time", start: 0.2, end: 0.6 }, loop: true })` 超过 end 后回到 start 区间。
- `playRange({ range: { unit: "frame", start: 30, end: 60, fps: 60 } })` 等价于 0.5 到 1 秒。
- 未传或非法 `fps`、非法 frame、`start >= end`、超出 duration 都直接抛错。
- 时间 marker 在大 delta 跨过时不会漏触发。
- 帧 marker 会按 `frame / fps` 转换并触发。
- 同一 delta 跨过多个 marker 时顺序正确。
- marker 与 end 同时发生时，marker 先于 complete。
- `once=true` 只触发一次。
- disposer 能移除 marker 和 complete listener。
- 手动 `seek(...)` 不触发 marker。
- `pause()` 后 `update(...)` 不触发 marker。
- callback 抛错时 `update(...)` 抛错，不吞异常。
- 旧的全时长 `play()`、`setLoop(false)` 行为仍然通过。

必须补充或更新 standalone 测试：

```text
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
```

standalone 测试不需要复制所有模块化用例，但至少要覆盖：

- standalone 暴露新增类型对应的 runtime 方法。
- standalone `playRange` 时间段和帧段行为。
- standalone marker 和 complete 行为。
- standalone 与模块化版本对同一 tiny project 的关键播放状态一致。

## 9. 验收命令

从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
pnpm typecheck
pnpm build
git diff --check
```

如果 `format:check` 失败且差异只来自本任务修改文件，应运行：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc format
```

然后重新执行 `format:check` 和 `git diff --check`。

如果依赖下载或 package 解析失败，先执行代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

然后重新执行失败命令。

如果真实 Cocos Creator 3.8.6 环境可用，额外人工验收：

1. 把 `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 复制到宿主 Cocos 项目 `assets/scripts/vendor/anieditorv5runtime-cc.ts`。
2. 用宿主 Component 调用 `playRange({ range: { unit: "time", start: 0, end: 4 }, loop: false })`。
3. 注册一个时间 marker 和一个 `onPlaybackComplete`。
4. 在 Cocos `update(deltaTime)` 中驱动 `player.update(deltaTime)`。
5. 确认画面从 0 秒播放到 4 秒后停止，marker 和 complete 都按预期触发。
6. 再用 `playRange({ range: { unit: "frame", start: 30, end: 60, fps: 60 }, loop: true })` 验收循环。

真实 Cocos 编辑器验收如果无法执行，不要伪造结果；在任务报告中明确写“未执行真实 Cocos Creator 3.8.6 编辑器导入验收”。

## 10. AGENTS 同步规则

本任务仅新增 package 内 player API、测试、README、示例和 standalone artifact，通常不需要更新 `AGENTS.md` 或 `agents.md`。

如果实施过程中新增或改变了仓库协作规则、目录规范、基础脚本约定，必须同步更新：

```text
AGENTS.md
agents.md
```

如果没有更新，也要在任务报告中写明原因。

## 11. 完成报告要求

任务完成后新增：

```text
tasks/34-anieditorv5runtime-cc-range-events-[utctime].md
```

报告必须包含：

- 实际修改文件列表。
- 新增 API 摘要和调用示例。
- 时间段、帧段、marker、complete 的关键行为说明。
- standalone 单文件与模块化版本同步说明。
- `standalone.zip` 是否已重新生成，以及 `zipinfo -1 standalone.zip` 的结果摘要。
- 验收命令与结果。
- 是否执行真实 Cocos Creator 3.8.6 编辑器验收；未执行时写明原因。
- 是否更新 `AGENTS.md` / `agents.md`；未更新时写明原因。
- 遇到的测试问题如何处理，尤其要说明没有为了测试通过而修改不该改的生产语义。

## 12. 二次检查清单

提交前按以下清单再检查一遍，确保没有遗漏：

- `src/cocos/types.ts`、`src/cocos/player.ts`、`src/cocos/index.ts`、`src/index.ts` 的导出一致。
- `src/index.ts` 没有新增真实 `"cc"` 运行时依赖，没有 runtime re-export `createV5GCocosPlayer` 或 `createCocosNodeDriver`。
- `standalone/anieditorv5runtime-cc.ts` 与模块化实现行为一致。
- `scripts/check-standalone.mjs` 已覆盖新增 public API。
- `standalone-import.test.ts` 已断言新增 API 可被导入。
- `tests/cocos/player.test.ts` 和 `tests/standalone/standalone-player.test.ts` 覆盖时间段、帧段、事件和完成监听。
- 测试覆盖 `nextTime === endTime` 时也会触发 marker 和 complete，不只覆盖 `nextTime > endTime`。
- 测试覆盖 `pause(); play();` 会恢复 active range，`restart()` 会清空 active range 并回到全时长播放语义。
- README 写清楚 frame API 必须显式传 `fps`，没有默认 60fps。
- README 写清楚事件由 `update(deltaTime)` 驱动，不是异步计时器。
- `standalone/V5GPreview.example.ts` 只是宿主侧示例；`standalone/anieditorv5runtime-cc.ts` 没有 decorated Component。
- `standalone.zip` 已更新，且不含 `__MACOSX` 或 `._*`。
- 未新增空目录；如新增空目录，已放 `.keepme`。
- 没有引入不必要兜底、占位、静默降级或吞异常。
- 没有把非空 layer `keyframes` 支持混入本任务。
- 如果发现奇怪测试预期，已优先修正测试而不是扭曲生产逻辑。
- 已生成中文任务报告，文件名符合 `tasks/34-anieditorv5runtime-cc-range-events-[utctime].md`。
