# 任务 184 执行报告

## 结论

`packages/anieditorv5runtime-cc` 的 manual cyclic playback 重复轮次取消合同、standalone 交付物、
restart-safe 示例和回归测试已完成。自动化验收全部通过；本地没有 Cocos Creator，真实 Creator 3.8.6
/ Web Desktop 验收按用户要求留待用户执行。

用户首次真实更新后又暴露 `notifyDestroyListeners()` 在 Cocos System.register 产物中调用 iterator
`.value()` 的异常。本报告已同步后续修复：destroy listener registry 改为数组快照与索引调用，生成
代码不再使用 `Set + spread + for...of`。

故障根因不是累计到固定次数后的 runtime 计数错误。新一轮调用
`GambleRoll.resetManualState()` 时，旧轮若仍在等待 `completed` / `ready` / `committed`，session destroy
会按任务 126 合同 reject `V5GCocosPlaybackCancelledError`。旧 async wrapper 没有终端分类该预期取消，
同时共享 session/flag 允许旧 continuation 回写新轮，因此浏览器显示 `Uncaught (in promise)`。

## 实现

- `V5GCocosPlaybackCancelledError` 新增稳定 code，新增 public
  `isV5GCocosPlaybackCancelledError(error)`；分类不依赖 message，并可在 modular/standalone 两份
  runtime 之间识别同一 cancellation error。
- 保留 `completed` / `ready` / `committed` 的 reject-on-cancel 兼容合同。没有把取消改成成功完成，避免
  旧流程在 await 后继续写入新轮状态。
- standalone `V5GPreview.example.ts` 增加：
  - 单调 manual generation；
  - local session 与每个 await 后的 generation/session identity 检查；
  - 旧轮 cancellation 的精确收口；
  - `finally` 只清理自己的 session/hold；
  - Component destroy 先使 generation 失效再销毁；
  - fire-and-forget `start()` 的非取消错误保存为可查询 `manualPreviewError`。
- README 增加重复 restart、Component destroy、错误分类和多公开 async 阶段的集成合同。
- standalone checker、generated runtime、import/parity/player tests 已同步。
- `V5GCocosPlayer` 的 destroy listener 从 `Set` 改为保持原去重语义的数组；dispose 使用索引删除，
  notify 先 `splice(0)` 取得一次性快照，再以 numeric index 校验并调用 listener。
- standalone checker 禁止回退到 `for (const listener of listeners)`，并要求生成物包含数组快照与索引
  读取。

## 测试与资源结果

新增 modular 压力回归连续启动 20 轮：

- 前 19 轮均被精确分类为 superseded cancellation；
- 第 20 轮完整完成；
- capture `60` 次、release `60` 次；
- host Node 全部保持有效；
- card/slice pool 保持 `3 / 12`，无跨轮增长。

standalone 额外验证 pending `advanceFor()` 被 destroy 后，旧 Promise 按合同 reject，且同一 player
可立即创建新 session。分类测试覆盖普通同文案 `Error`、伪造 name/code plain object、null 和
modular/standalone 交叉实例；只有 runtime cancellation Error 被识别。

destroy listener 回归覆盖 disposer、同 listener 重复注册去重、exactly-once 通知、非法 listener
fail-fast，以及 generated standalone 的 indexed notification；不再生成截图中的 iterator
`r.value()` 调用形态。

最终自动化命令：

```text
pnpm --dir packages/anieditorv5runtime-cc standalone:build       PASS
pnpm --dir packages/anieditorv5runtime-cc test                   PASS (21 files / 240 tests)
pnpm --dir packages/anieditorv5runtime-cc typecheck              PASS
pnpm --dir packages/anieditorv5runtime-cc build                  PASS
pnpm --dir packages/anieditorv5runtime-cc standalone:check       PASS
pnpm --dir packages/anieditorv5runtime-cc typecheck:standalone   PASS
pnpm --dir packages/anieditorv5runtime-cc format:check           PASS
git diff --check                                                  PASS
```

运行环境：Node.js `v24.14.0`、pnpm `10.0.0`。依赖按 frozen lockfile 恢复；未修改 package manifest、
lockfile 或依赖版本。

## Standalone ZIP

`packages/anieditorv5runtime-cc/standalone.zip` 已重建，只包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
standalone/effects/vni-screen-alpha.effect
```

```text
size: 91709 bytes
SHA-256: 185c5d7985d8039fcc9630f1d4fa06ecf299e14c95a0525a9c58cf1775070dc8
```

该 ZIP 受仓库 `*.zip` ignore 规则管理，不出现在普通 tracked diff 中。

## 游戏接入与人工验收

`/Users/zerro/Downloads/GambleRoll.ts` 是仓库外诊断样本，未被修改。游戏工程应用本次 runtime 后仍需
按 README 的 restart-safe 模式调整调用方：

1. `resetManualState()` 在 destroy 旧 session 前递增 generation；Component destroy 同时设置
   destroying 状态。
2. `prepareRandomBindings()`、`playAppear()`、`playSlowLoop()`、`playFastAndStop()` 在入口捕获 local
   generation/session，并在每个 await 后检查仍属于当前轮。
3. 仅当 error 是 `isV5GCocosPlaybackCancelledError(error)` 且该轮已经被新 generation 或 host destroy
   替代时收口；其它错误继续抛出。
4. 旧轮 `finally` 只销毁自己的 local session/Node；identity 不一致时不得清空或销毁当前共享字段。
5. 所有 fire-and-forget 游戏入口必须注册终端 rejection handler；不能只调用 async 方法而忽略返回
   Promise。

用户真实验收应覆盖 initial capture、appear、slow loop、selection commit、ending 中途重启，至少
100 轮混合正常完成/重启，Component pending destroy，以及一个真实非法输入。检查控制台无
`Uncaught (in promise)`、画面只响应最新轮、capture/RenderTexture/SpriteFrame/listener/内存不持续
增长，并确认非法输入仍报告原错误。

## 计划偏差与剩余项

- 原计划仅在测试证明 player lifecycle 缺口时修改 `player.ts`。真实 Cocos 更新后的新堆栈证明 destroy
  listener 的 `Set + spread + for...of` 生成形态存在兼容缺口，因此按证据扩大到该最小实现；manual
  session detach/capture rollback 逻辑本身未改。
- 测试合并到既有 modular/standalone player test，没有新增独立 test 文件。
- 没有 Cocos Creator 环境，因此真实视觉、浏览器事件循环和 GPU 资源验收待用户执行；fake Cocos
  结果未冒充该验收。
- 未修改外部游戏源码；若游戏侧不应用 generation/session identity/terminal handler，单独替换 runtime
  无法消费由游戏 async wrapper 重新抛出的 Promise。
