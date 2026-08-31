# 276 audiocore-background-resume-no-stale-effects 执行报告

## 执行基线

```text
UTC: 2026-08-31 10:21:18
HEAD: e6bfa51ac52954393fa9541991c15c14b5aa66da
branch: detached HEAD
```

执行保留了已有任务计划 `tasks/276-audiocore-background-resume-no-stale-effects.md`，未 commit、push 或创建 PR。

## 最终实现

- `AudioBackend` 新增唯一的 `active | suspended` activity snapshot/observer 合同。
- Pixi backend 将 window focus、document visibility 与 page lifecycle 合成为 activity；prepared sound 以引用计数关闭
  `@pixi/sound` 全局 auto-pause，最后一个 owner destroy 后恢复进入前的值。
- AudioRuntime 在 suspended 时取消 pending、active 和异步晚到的 once，后台新 once 直接以 `stopped` 完成；loop/BGM
  暂停并保留仍有效的 instance/request，owner 在后台 stop、supersede 或 destroy 后不会复活。
- suspended 期间冻结 delay、focus 与 crossfade；activity pause 和 BGM focus pause 组合生效，避免任一 owner 被错误覆盖。
- RenderCore Scene Layout package-runtime 回归覆盖 event once 丢弃和初始 loop 原实例暂停/恢复。

实际修改：

```text
packages/audiocore/src/core/backend.ts
packages/audiocore/src/core/pixi-backend.ts
packages/audiocore/src/core/runtime.ts
packages/audiocore/tests/audio-runtime.test.ts
packages/audiocore/tests/pixi-backend.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/audiocore/README.md
docs/audiocore.md
docs/agent-rules/shared-game-runtime.md
```

## 关键决策与计划偏差

- 前后台恢复只由 AudioCore 管理；未修改 app、Spin event 或 renderer delta，也未增加补播队列。
- 计划中的真实浏览器最小复现和人工矩阵未由本次执行代跑，按用户要求交由用户验收。
- `CI=true pnpm install --frozen-lockfile` 因仓库现有 `pnpm-lock.yaml` 缺少依赖项而失败。为避免修改 lockfile，使用
  Node 24 bundled runtime 和 `--lockfile=false` 安装依赖，并以直接调用同一 TypeScript/Vitest/Prettier 入口执行等价
  L2 命令；`pnpm-lock.yaml` 未变化。

## 自动化验收

```text
PASS  audiocore tsc --noEmit
PASS  audiocore audio-runtime.test.ts + pixi-backend.test.ts: 2 files, 14 tests
PASS  rendercore tsc --noEmit
PASS  rendercore package-runtime.test.ts: 1 file, 25 tests
PASS  targeted Prettier check
PASS  git diff --check
```

为解析 workspace package exports，按 RenderCore 的 `prepare:deps` 声明构建了 browserartifactio、editorresource、
audiocore、logiccore、pixiani 与 vnicore；生成的 `dist` 均为 ignored build output，没有正式生成物 diff。

## 未完成人工验收

- 待用户在真实 Chromium 中分别验证 window blur/focus 与 tab hidden/visible，重复切换后无旧 once 集中播放、
  loop/BGM 始终只有一份。
- 待用户验证后台期间 loop end/preview rebuild/destroy 后回前台不复活。
- Safari/iOS 的系统 `interrupted` 与 trusted re-unlock 行为未验证；若恢复失败，应记录显式错误和是否需要再次用户手势，
  不把静音视为通过。

## 剩余风险

- `@pixi/sound` 是进程级 singleton；自动化已覆盖两个 backend 的引用计数和原值恢复，仍建议浏览器独立复验多个 preview
  runtime 并存场景。
- 仓库现有 lockfile 缺项会阻止标准 frozen install；本任务没有修复 lockfile，避免把根工具链变更扩大进任务 276。
