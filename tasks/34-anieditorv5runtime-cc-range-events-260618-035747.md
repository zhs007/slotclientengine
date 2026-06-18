# anieditorv5runtime-cc range events 执行报告

## 1. 任务结论

已按 `tasks/34-anieditorv5runtime-cc-range-events.md` 执行完成。

本次在 `packages/anieditorv5runtime-cc` 内新增 `V5GCocosPlayer` 高级播放能力：

- 支持 `playRange(...)` 按时间段播放。
- 支持 `playRange(...)` 按帧段播放，`fps` 必须显式传入。
- 支持 range 本次任务级 `loop`。
- 支持 runtime marker：`addPlaybackEvent(...)`、`clearPlaybackEvent(...)`、`clearPlaybackEvents()`。
- 支持当前非循环播放任务完成监听：`onPlaybackComplete(...)`。
- 保持 `play()`、`pause()`、`restart()`、`seek()`、`update(deltaSeconds)` 兼容。
- standalone 单文件与模块化版本同步。
- `standalone.zip` 已重新生成并清理旧包内的 `__MACOSX` / `._*` 条目。

## 2. 实际修改文件

- `packages/anieditorv5runtime-cc/src/cocos/types.ts`
- `packages/anieditorv5runtime-cc/src/cocos/player.ts`
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/scripts/check-standalone.mjs`
- `packages/anieditorv5runtime-cc/README.md`
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- `packages/anieditorv5runtime-cc/standalone.zip`
- `packages/anieditorv5runtime-cc/tests/cocos/player.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts`
- `tasks/34-anieditorv5runtime-cc-range-events-260618-035747.md`

## 3. 新增 API 摘要

时间段播放：

```ts
player.playRange({
  range: { unit: "time", start: 0, end: 4 },
  loop: false,
});
```

帧段播放：

```ts
player.playRange({
  range: { unit: "frame", start: 30, end: 60, fps: 60 },
  loop: true,
});
```

时间 marker：

```ts
const disposeMarker = player.addPlaybackEvent({
  id: "intro-pop",
  at: { unit: "time", at: 1.25 },
  once: true,
  listener(event) {
    // event.id / event.time / event.previousTime / event.currentTime / event.loopIndex
  },
});
```

帧 marker：

```ts
player.addPlaybackEvent({
  id: "frame-45",
  at: { unit: "frame", at: 45, fps: 60 },
  listener(event) {
    // fps 必须显式传入，不默认 60fps。
  },
});
```

当前非循环播放任务完成：

```ts
const disposeComplete = player.onPlaybackComplete((event) => {
  // event.startTime / event.endTime / event.currentTime / event.loopIndex
});
```

## 4. 关键行为说明

- `playRange(...)` 必须在 `init()` 后调用；未初始化沿用 `seek(...)` 的显式失败语义。
- `range.unit === "time"` 时校验 `0 <= start < end <= project.stage.duration`。
- `range.unit === "frame"` 时校验 `start/end` 为非负整数，`fps` 为 positive finite number，再按 `frame / fps` 转换为秒。
- `playRange(...)` 会立即 `seek(start)` 并进入播放。
- 非循环 range 到达 `end` 时，先 `seek(end)`，再触发跨过的 marker，随后停止播放、清空 active range，最后触发 complete。
- 循环 range 到达 `end` 时会触发到终点的 marker，并按每一圈继续派发 marker；循环播放不触发 complete。
- marker 注册的是 project 时间轴绝对点，只由 `update(deltaSeconds)` 推进跨过时触发。
- 手动 `seek(...)`、`init()`、`restart()` 不触发 marker。
- 单次大 `deltaSeconds` 跨过多个 marker 时按时间从小到大触发；跨过多圈循环时逐圈触发。
- `once=true` 的 marker 在调用 listener 前从内部表移除；listener 抛错也不会在下一次 `update(...)` 重复触发同一个 once marker。
- callback 抛错不吞掉，会从当前 public method 继续抛出。
- `pause()` 只暂停，不清空 active range；`pause(); play();` 会恢复 active range。
- `restart()` 清空 active range，回到全时长播放语义。
- `destroy()` 会清空 active range、marker 和 complete listener。

## 5. standalone 同步说明

`packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 已同步新增：

- 新 public types。
- `playRange(...)`、marker、complete public methods。
- active range、marker map、complete listener set、loopIndex 状态。
- 与模块化版本一致的 range 校验、帧换算、循环和完成事件语义。

`scripts/check-standalone.mjs` 已新增 public API 导出检查，继续确保 standalone runtime 只 import `"cc"`，不引入相对 import、workspace import、Node builtin、DOM global、`JsonAsset`、`resources.load()`、decorated Component 或 `dist`/`src` 依赖。

## 6. standalone.zip

已在 package 目录重新生成：

```bash
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
```

最终 `zipinfo -1 standalone.zip` 结果：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

压缩包不包含 `__MACOSX` 或 `._*`。

注意：根级 `pnpm build` 后发现 `standalone.zip` 在工作区被清掉，因此已在所有 build 命令完成后重新生成一次，并再次确认清单正确。

## 7. 验收命令与结果

均从仓库根目录执行。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
```

结果：通过。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
```

结果：通过。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
```

结果：通过，输出 `standalone runtime check passed`。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
```

结果：通过，`Test Files 10 passed (10)`，`Tests 67 passed (67)`。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
```

结果：通过。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
```

结果：通过。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

结果：通过。

```bash
pnpm typecheck
```

结果：通过，`Tasks: 18 successful, 18 total`。

```bash
pnpm build
```

结果：通过，`Tasks: 18 successful, 18 total`。构建中存在既有 Vite chunk size warning，但命令退出码为 0。

```bash
git diff --check
```

结果：通过。

## 8. 测试问题处理

- 首次 `format:check` 发现本任务修改的 `src/cocos/player.ts`、`standalone/anieditorv5runtime-cc.ts`、`tests/cocos/player.test.ts` 格式不符合 Prettier，已按任务约定运行 package `format`，随后 `format:check` 通过。
- standalone 测试初次 typecheck 时 helper 返回类型缺少 `V5GCocosPlayer` type import，导致回调参数推断为 `any`；已修正测试类型导入。
- 没有为了测试通过修改不该改的生产语义；测试补充围绕任务合同覆盖 range、帧换算、marker、complete、pause/play、restart、callback 抛错和 standalone parity。

## 9. 真实 Cocos Creator 3.8.6 验收

未执行真实 Cocos Creator 3.8.6 编辑器导入验收。

原因：当前执行环境没有打开真实 Cocos Creator 编辑器和宿主项目场景绑定能力。本次已完成 monorepo 内 TypeScript、Vitest fake `cc`、standalone 边界扫描、standalone zip 和构建验收。

## 10. AGENTS 同步

未更新 `AGENTS.md` / `agents.md`。

原因：本任务只新增 package 内 player API、测试、README、示例和 standalone artifact，没有新增或改变仓库协作规则、目录规范或基础脚本约定。

## 11. 二次检查

- `src/cocos/types.ts`、`src/cocos/player.ts`、`src/cocos/index.ts`、`src/index.ts` 导出路径已检查；根入口没有新增真实 `"cc"` 运行时依赖。
- `src/index.ts` 没有 runtime re-export `createV5GCocosPlayer` 或 `createCocosNodeDriver`。
- `standalone/anieditorv5runtime-cc.ts` 与模块化实现同步。
- `scripts/check-standalone.mjs` 已覆盖新增 public API。
- `standalone-import.test.ts` 已断言新增 runtime methods 可被导入。
- `tests/cocos/player.test.ts` 覆盖时间段、帧段、marker、complete、`nextTime === endTime`、pause/play、restart、callback 抛错和旧全时长非循环播放。
- `tests/standalone/standalone-player.test.ts` 覆盖 standalone 时间段、帧段、marker、complete 和 disposer。
- `tests/standalone/standalone-parity.test.ts` 覆盖模块化与 standalone 对同一 tiny project 的关键播放状态一致。
- README 已写明 frame API 必须显式传 `fps`，事件由 `update(deltaTime)` 驱动，`destroy()` 会清理 marker 和 complete listener。
- `standalone/V5GPreview.example.ts` 是宿主侧示例；`standalone/anieditorv5runtime-cc.ts` 没有 decorated Component。
- `standalone.zip` 已更新且清单正确。
- 未新增空目录。
- 未引入不必要兜底、占位、静默降级或吞异常。
- 未实现或混入非空 layer `keyframes` 支持。
