# Task 240 RenderCore Game Layout Runtime Events 执行报告

## 结果

任务 240 已完成。Task 228 的 runtime address dispatcher 已收敛为每个
`SceneLayoutPackageRuntime` 唯一持有的 event manager，并接入 Popup、game mode、transition、layout variant、
authored/program Spine 与 visible settled symbol 状态边界。

执行中按用户纠正调整了原计划：symbol instance 不再通过 `bind()/wait()/emit()` 的额外参数传递，`reel/x/y`
与 `*` 通配都直接属于 canonical address：

```text
gamelayout:/symbol-package/<binding-id>/symbol/<symbol-id>/instance/reel/<reel-id>/x/<x|*>/y/<y|*>/state/<state-id>/<entered|exited>
```

事件实际发生时 `occurrence.address` 始终是 exact instance address。exact symbol dispatch 只查询预编译的
exact/exact、exact/_、_/exact、_/_ 四个地址，不解析 glob、不扫描其它 symbol/state listener。

## 实现摘要

- 新增 package-owned event manager：统一 listener、waiter、sequence、AbortSignal、destroy cleanup、interest
  counter 与 lazy detail；零订阅时不创建 occurrence/detail。
- Popup scheduler 发布 queued/opening/active/closing/finished/cancelled/failed；三类 Popup core 使用 owner-neutral
  observer 发布 phase，award 另发布 exact tier 与 start/loop/end segment 的 entered/exited。
- mode 分别发布 displayed/stable entered/exited；transition 发布 started/switched/ended/failed，并保留原 configured
  Spine event、video lifecycle、BGM 与 variant 地址。
- authored loop Spine node 与 caller-owned program Spine resource 发布 started/ended；ended detail 携带
  completed/stopped/superseded/aborted/failed/destroyed outcome。program resource 不伪造 instance identity。
- classic 与 grid-cell reel 通过同一个 owner-neutral observer 只发布 visible settled occurrence 的 resolved state
  变化；旧 state exited 后再发布新 state entered。无对应 symbol interest 时不读取 event-only snapshot。
- Gameframeworks re-export wait options；补充 runtime address 文档、稳定领域规则和 event hot-path benchmark。

## 验收证据

- `@slotclientengine/rendercore` typecheck：通过。
- `@slotclientengine/gameframeworks` typecheck（含 RenderCore build 和直接依赖链）：通过。
- `@slotclientengine/rendercore` lint：通过。
- 定向 Vitest：11 个文件、164 个用例全部通过，覆盖 address wildcard/lazy factory、Popup observer、mode 与
  transition 顺序、authored/program Spine outcome、classic/grid-cell reel 回归。
- `git diff --check`：通过。
- `benchmark:scene-layout`（100,000 次，本机采样，不作为绝对阈值）：
  - zero subscriber：约 16.82M dispatch/s，`detailFactoryCalls = 0`；
  - `x/2/y/*` wildcard address：约 7.33M dispatch/s，100,000 occurrences；
  - 原 scene-layout update：约 35.96M update/s，采样 heap delta -14,176 bytes。

依赖安装首次因 sandbox 内 lifecycle script 找不到 Node 失败；使用工作区提供的 Node PATH 和 frozen lockfile
重新安装后成功。未修改 manifest/schema、业务配置、assets 或 lockfile。

UTC：2026-08-22T02:32:47Z
