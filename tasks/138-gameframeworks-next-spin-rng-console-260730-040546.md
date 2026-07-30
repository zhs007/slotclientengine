# 138 gameframeworks-next-spin-rng-console 执行报告

## 1. 执行信息

- 完成 UTC：`2026-07-30T04:05:46Z`
- HEAD：`d1865892eda9c4a33dc44220f05d8eeeaaf1d037`
- 分支：detached HEAD
- Node.js：`v24.14.0`
- pnpm：`10.0.0`
- 未 commit、未 push、未创建 PR。

执行开始时只有用户要求创建的未跟踪计划：

```text
?? tasks/138-gameframeworks-next-spin-rng-console.md
```

依赖目录为空，因此按仓库约定运行
`CI=true pnpm install --frozen-lockfile`。沙箱内首次下载被本机
`127.0.0.1:1087` 代理的网络权限拒绝，批准后在沙箱外重跑成功；lockfile 未修改。

## 2. 实施结果

### gameframeworks 通用能力

- 新增 instance-scoped `rngConsole` public option 和
  `SlotGameRngConsoleOptions` type。
- 显式启用后在注入 target 上安装非枚举 `rng(...values)`：
  - 只接受非空的非负 safe integer 序列；
  - 非法输入不覆盖此前 pending；
  - 连续合法输入 last-write-wins；
  - target 已有 `rng` 时 fail-fast，不覆盖宿主。
- pending 序列只在 base spin request 成功构造后 take，并覆盖下一次交给 session
  的 `lstrand`；随后恢复 app 原 `buildSpinRequest`。
- 请求交给 session 后即使失败也不恢复 override，避免请求可能已到服时重复控制局面。
- GMI 成功解析后输出可直接复制的 `rng(11,22,33)`；logger 异常不改变 spin
  生命周期。
- destroy 清空 pending，只删除仍由本实例拥有的 command；constructor/mount/UI
  cleanup 路径复用同一幂等生命周期。

### game002 接入

- 正式 `game-entry` 显式注入 `window` 与 console logger，因此浏览器可直接执行：

  ```js
  rng(8, 61, 41, 33, 13, 729);
  ```

- adapter 不再私有输出 GMI RNG；原先兼作 multiplier diagnostic 的 `logRng`
  已准确重命名为 `logDiagnostic`，业务诊断行为保持不变。
- README 与 shared runtime 规则已记录测试服限定、one-shot 边界和禁止把
  `lstrand`/server RNG 用作客户端视觉随机源。

## 3. 实际文件

新增：

```text
packages/gameframeworks/src/rng-console.ts
packages/gameframeworks/tests/rng-console.test.ts
tasks/138-gameframeworks-next-spin-rng-console.md
tasks/138-gameframeworks-next-spin-rng-console-260730-040546.md
```

修改：

```text
packages/gameframeworks/src/framework.ts
packages/gameframeworks/src/index.ts
packages/gameframeworks/src/types.ts
packages/gameframeworks/tests/framework-flow.test.ts
packages/gameframeworks/tests/test-helpers.ts
packages/gameframeworks/README.md

apps/game002/src/game-entry.ts
apps/game002/src/game-adapter.ts
apps/game002/tests/loading-flow.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/README.md

docs/agent-rules/shared-game-runtime.md
```

计划预计修改 `packages/gameframeworks/tests/exports.test.ts`，实际新增的是 type-only
public export，没有新增 runtime symbol；declaration build 已验证 public type，因此没有为
不存在的 runtime export 修改该测试。

## 4. 自动化验收

| 命令                                                       | 结果                                        |
| ---------------------------------------------------------- | ------------------------------------------- |
| `pnpm --filter @slotclientengine/gameframeworks test`      | 通过，13 files / 87 tests                   |
| `pnpm --filter @slotclientengine/gameframeworks typecheck` | 通过                                        |
| `pnpm --filter @slotclientengine/gameframeworks build`     | 通过，public declaration 与 Vite build 正常 |
| `pnpm --filter game002 test`                               | 通过，25 files / 135 tests                  |
| `pnpm --filter game002 typecheck`                          | 通过                                        |
| 定向 `prettier --check`                                    | 通过                                        |
| `git diff --check`                                         | 通过                                        |

第一次 gameframeworks test 在新安装依赖但 workspace `dist` 尚未构建时失败于
`@slotclientengine/browserartifactio` 解析，没有进入本任务测试。运行计划内
gameframeworks build 建立直接依赖产物后，原命令重跑通过；这不是生产代码回归。

报告生成后一次重复的 Prettier 检查漏载 Node 24 环境，Codex runtime 的 pnpm
尝试重建 modules 并以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止；未改文件。
表中记录的是此前在正确 Node 24 环境下已经通过的定向 Prettier 检查。

game002 test/typecheck 按其 package script 重跑 resource generator，生成 132 项且
generated 文件无 diff。

## 5. 人工验收与剩余风险

没有可用的测试服 launcher credential，因此未执行真实 Chromium/WebSocket 人工验收。
仍需在 game002 测试服确认：

1. 控制台输出的 `rng(...)` 可直接执行；
2. 下一次 `gamectrl3.ctrlparam.lstrand` 精确匹配输入并返回预期局面；
3. 再下一轮不再携带该 override；
4. presentation 期间设置的新序列只作用于后续请求；
5. destroy/刷新后 command 与 pending 不残留。

自动化已验证交给 session 的 params、one-shot/last-write-wins、严格输入、base
`lstrand` precedence、日志、global collision/ownership 和失败 cleanup，但不能替代
服务器对隐藏参数的真实支持。
