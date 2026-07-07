# 任务 85 执行报告：anieditorv5runtime-cc playback event release 修复

## 1. 任务结论

本次修复 `packages/anieditorv5runtime-cc` 中 `V5GCocosPlayer.addPlaybackEvent(...)` 在 Cocos Creator 打包发布后不触发的问题。开发版正常，`onPlaybackComplete(...)` 正常，问题只出现在 release 包里的 marker 回调。

最终结论：

- 根因定位到 Cocos Creator release 环境中，`Map<string, record>` 保存的 playback event record 在读取时退化为 `{}`，导致 `id`、`time`、`once`、`listener` 等字段丢失。
- `onPlaybackComplete(...)` 不使用这张 event record map，因此一直正常。
- 已把 playback event 内部存储从 `Map<string, NormalizedPlaybackEvent>` 改为多组并行数组，只保存 primitive / function 字段，派发前再临时组装 tuple snapshot。
- 用户已在真实打包环境确认修复有效。
- 修复确认后已移除本次所有临时定位日志。

## 2. 问题表现

外部调用形态：

```ts
await this.m_v5gView.PlayRange(0, 1, false, "BigWinAni_PlayStartAni");
```

内部逻辑在非循环、`endTime > 0` 时会：

```ts
this.player.playRange({
  range: { unit: "time", start: startTime, end: endTime },
  loop: false,
});

this.player.clearPlaybackEvents();
this.player.addPlaybackEvent({
  id: key,
  at: { unit: "time", at: endTime },
  once: true,
  listener: () => {
    resolve(null);
  },
});
```

开发版中 marker 能按预期 resolve；Cocos Creator 打包发布后，动画播放能到尾，`onPlaybackComplete(...)` 也能触发，但 `addPlaybackEvent(...)` 注册的 listener 不触发。

## 3. 定位过程

临时日志分三轮定位：

1. 初始日志确认 `addPlaybackEvent(...)` 已注册，但没有看到对应的 dispatch 日志。
2. JSON 化日志确认候选事件进入判断路径时只有 `reason: "emit"`，但 event 本身的 `id`、`time`、`once` 等字段缺失。
3. tuple 诊断版本输出 `debugBuild: "playback-event-tuple-v2"` 时，release 包里读到的 event record 形态为 `storageKind: "object"`、`raw: {}`。

因此问题不是调用顺序、时间精度、`playRange(...)` 或 complete listener，而是 release 包里 `Map` value 中的 object record 字段不可用。

## 4. 修复内容

修复前，runtime 内部用一张 `Map<string, NormalizedPlaybackEvent>` 保存事件记录。

修复后，改为并行数组：

```ts
private readonly playbackEventIds: string[] = [];
private readonly playbackEventTimes: number[] = [];
private readonly playbackEventOnceFlags: boolean[] = [];
private readonly playbackEventOrders: number[] = [];
private readonly playbackEventListeners: PlaybackEventListener[] = [];
```

关键行为：

- `addPlaybackEvent(...)` 校验 id 唯一、listener 类型和时间点后，把字段分别 push 到数组。
- `removePlaybackEvent(...)` / `clearPlaybackEventRecords(...)` 同步清理所有数组。
- `getPlaybackEventSnapshots()` 在派发前临时组装 `NormalizedPlaybackEvent[]`，并对数组内容做显式完整性校验。
- `emitPlaybackEventsBetween(...)`、`emitPlaybackEventsAtBoundary(...)` 继续按时间和注册顺序排序。
- `dispatchPlaybackEvents(...)` 对 `once` 事件先移除，再调用 listener，保持原有 public 语义。
- 不新增 release fallback，不吞异常，不改变 `playRange(...)`、`onPlaybackComplete(...)` 的对外合同。

## 5. 同步文件

本任务涉及的 runtime 交付面：

- `packages/anieditorv5runtime-cc/src/cocos/player.ts`
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/standalone.zip`
- `tasks/85-anieditorv5runtime-cc-playback-event-release-fix.md`

`standalone/anieditorv5runtime-cc.ts` 已与模块化源码同步，`standalone.zip` 已重建并复验。

`standalone.zip` 内容：

```text
standalone/V5GPreview.example.ts
standalone/anieditorv5runtime-cc.ts
```

## 6. 日志清理

真实打包环境确认修复后，已删除本次临时定位代码，包括：

- `debugPlayback(...)`
- `debugPlaybackEventCandidates(...)`
- `getPlaybackEventCandidateReason(...)`
- `PLAYBACK_DEBUG_BUILD`
- standalone 临时 `console` 声明
- 临时日志字段：`storageKind`、`storedRecord`、`raw`、`playback-event-*`

最终扫描确认 runtime-cc 中没有残留调试日志关键字：

```bash
rg -n "debugPlayback|PLAYBACK_DEBUG_BUILD|\\[V5GCocosPlayer\\]|console|storageKind|storedRecord|raw: event|playback-event-" \
  packages/anieditorv5runtime-cc/src/cocos/player.ts \
  packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

结果：无输出。

## 7. 验收结果

已通过：

```bash
CI=true pnpm --dir packages/anieditorv5runtime-cc typecheck
CI=true pnpm --dir packages/anieditorv5runtime-cc typecheck:standalone
CI=true pnpm --dir packages/anieditorv5runtime-cc standalone:check
CI=true pnpm --dir packages/anieditorv5runtime-cc test
CI=true pnpm --dir packages/anieditorv5runtime-cc lint
CI=true pnpm --dir packages/anieditorv5runtime-cc format:check
CI=true pnpm --dir packages/anieditorv5runtime-cc build
git diff --check
```

测试结果摘要：

- `test`：16 个测试文件、185 个测试通过。
- `standalone:check`：通过。
- `standalone.zip`：已重建，内容只包含 standalone 交付所需两个文件。

真实 Cocos Creator 打包验收：

- Codex 未在本机直接运行 Cocos Creator。
- 用户已用 Cocos Creator 打包发布版本验证，确认 `addPlaybackEvent(...)` 回调恢复触发。

## 8. AGENTS / 长期规则判断

本次未更新 `AGENTS.md`。

原因：

- 仓库已有 `packages/anieditorv5runtime-cc` public runtime 行为必须同步模块化源码、standalone、checker、standalone 测试和 `standalone.zip` 的长期规则。
- 本次修复没有新增目录规范、基础脚本或跨包协作边界。
- Cocos release 下 `Map<string, object-record>` 退化为 `{}` 是本次问题的根因，已记录在任务报告中；若后续发现同类问题影响更多 runtime 状态存储，再抽象成协作规则。

## 9. 二次遗漏检查

- [x] 模块化源码和 standalone 单文件均使用并行数组存储 playback event 字段。
- [x] 没有继续使用 `Map<string, record>` 存储 playback event record。
- [x] `once=true` 事件仍在 listener 调用前移除。
- [x] marker 排序仍按触发时间、注册顺序稳定执行。
- [x] callback 抛错语义未被吞掉。
- [x] `clearPlaybackEvent(...)` 未知 id 仍显式失败。
- [x] `clearPlaybackEvents()` 会清空所有并行数组。
- [x] `onPlaybackComplete(...)` 语义未被改动。
- [x] 临时日志已删除。
- [x] `standalone.zip` 已重建并验证内容。
