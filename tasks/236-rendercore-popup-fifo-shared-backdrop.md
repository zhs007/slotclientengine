# 236 rendercore-popup-fifo-shared-backdrop 执行报告

## 结果

Scene Layout Popup 已改为 runtime 统一串行调度：程序 Popup、mode award 和 transition prelude 进入同一个 FIFO，
任一时刻只激活一个 Popup，当前项完整关闭后自动启动下一项。全部默认 Popup player 共用一个 runtime-owned
压暗 `Graphics`，不再为每个 Popup 创建独立压暗 display object。

执行基线：

```text
UTC report: 2026-08-21T05:14:53Z
HEAD: 60cbd0854a7934c904e094aa3bf767416f1cc8ca
branch: detached HEAD
```

## 已实现

- 新增普通 production 入口 `enqueuePopup()`；程序 Popup、mode award、transition prelude 使用同一 FIFO 和唯一 active slot。
- 保留 `openPopup()` 作为明确的 fail-fast 立即入口；已有 active、pending 或 mode transition 时在 player mutation 前失败。
- `SceneLayoutPopupSession` 新增动态 `state`、`presented`、`close()` 和 `cancel()`；操作绑定 exact session identity，
  queued cancel 与 stale close 不会影响后来 Popup。
- `finished` 只表示 exact session 已关闭或取消；调用方可先等待 `presented`，再按业务时长调用 `session.close()`，
  避免把“等待结束”误当成“等待打开动画完成”。
- mode award 的 `start/play` 进入队列；transition prelude 在已有 Popup 后排队，关闭当前 Popup 后继续原 transition。
- Scene Layout runtime 创建唯一共享 backdrop controller，并注入 award、Spine、single-state 三类默认 player。
  controller 使用 owner token，旧 Popup 的 inactive/destroy 不会误隐藏新 active Popup 的压暗层；颜色、透明度和
  `visibleStates` 仍由当前 Popup manifest 决定。
- presentation surface、gameframeworks 类型出口、README、runtime address 示例和稳定领域规则已同步。

## 自动验收

```text
PASS  rendercore 定向测试：6 files, 58 tests
      popup presentation、package runtime、mode/prelude、video、presentation surface、runtime address

PASS  gameframeworks exports：1 file, 1 test
PASS  gamelayouteditor：2 files, 44 tests

PASS  typecheck：@slotclientengine/rendercore、@slotclientengine/gameframeworks、
      gamelayouteditor、game002v2、game003v2

PASS  build：@slotclientengine/rendercore、@slotclientengine/gameframeworks
PASS  git diff --check
```

测试覆盖 FIFO 顺序、queued cancel、stale session、active/queued destroy、program Popup 后继续固定 transition prelude、
连续 mode award，以及多个 presentation 共享同一 backdrop、旧 owner 不能隐藏新 owner。依赖使用
`CI=true pnpm install --frozen-lockfile` 恢复，lockfile 与 package manifest 未修改。

## 使用方式

```ts
const session = runtime.enqueuePopup(request);
await session.presented;
await delayTime(2);
await session.close();
await session.finished;
```

`session.finished` 是完整生命周期结束边界，本身不会触发关闭。宿主不持有 session 时仍可用全局 `closePopup()` 做 cleanup。
