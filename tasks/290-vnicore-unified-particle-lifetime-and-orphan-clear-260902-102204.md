# 任务 290 执行报告

UTC：2026-09-02T10:22:04Z
HEAD：`a652783b089b946cd2691d30203349607989a717`（detached）

## 最终实现

- timeline、range、segmented 和 manual range 共用
  `keepParticlesAlive?: boolean`，严格校验 boolean，默认 `true`；未新增
  public `stop()`。
- 播放自然结束或 manual cancel/session destroy 时，emitter 截止在当前 elapsed；
  已发射粒子继续按确定性 sampler 推进位置、旋转、缩放和 authored alpha/lifetime，
  不再冻结最后一帧后统一线性淡出。
- 五种粒子类型都增加稳定 `particleId` 和 emission cutoff；移除了按全 project
  最大生命周期等待的旧模型。结束点没有实际活动粒子时立即完成，不再空等。
- Core 与 Viewer 新增 `clearOrphanParticles()`。它只对已经进入 drain 的粒子启动
  `0.1s` 快速淡出，不影响 active emitter；等待视觉收尾的 natural complete 会在
  淡出完成后正常触发，manual cancel 不伪造 complete。
- `needsUpdate()`、Viewer ticker、manual policy、pool/reset/destroy 和 playback state
  已接入新语义；README、中英文 usage、中文 API 与 VNI 领域规则已同步。

主要实现位于：

```text
packages/vnicore/src/core/playback-sequence.ts
packages/vnicore/src/core/manual-playback.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/src/core/vni-runtime.ts
packages/vnicore/src/viewer/vni-viewer.ts
```

## 决策与计划偏差

- 保留当前 VNICore 的单 transport ownership：一个 runtime 同时只有一个 active
  playback/drain。没有为当前并不存在的并行 transport 引入多 cohort/token 状态机；
  `clearOrphanParticles()` 会清理该 runtime 当前持有的全部 drain 粒子。
- 旧测试曾要求动画结束点已无粒子时仍按 project-wide 最大值空等；该断言与新合同
  冲突，已改为立即 complete，并用结束点确实仍有 wall 粒子的工程单独验证 drain。
- 未修改 schema、fixture、Cocos runtime、consumer 业务代码或 lockfile。

## 自动化验收

通过：

```text
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore test
  19 files / 256 tests passed
pnpm --filter @slotclientengine/vnicore build
pnpm --filter anieditorv5viewer typecheck
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/vnicore exec vitest run tests/pixi/vni-player.test.ts
  1 file / 73 tests passed（最后新增 segmented/manual/Viewer ticker lifecycle 断言后）
git diff --check
```

定向粒子/transport 回归另通过 4 files / 98 tests，覆盖五种粒子、timeline、range、
segmented、manual、默认 true、显式 false、active clear no-op、快速淡出中间帧与
completion。

环境说明：worktree 起初没有依赖。`CI=true pnpm install --frozen-lockfile` 因现有
`pnpm-lock.yaml` 缺少 `@typescript-eslint/eslint-plugin` 条目而失败；随后只复用主
checkout 已安装的 pnpm 依赖完成验收，没有改写 lockfile。rendercore 首次 typecheck
也因同一 worktree 缺少 package-local 依赖失败，补齐只读依赖链接后重跑通过。

## 人工验收与剩余风险

- 真实浏览器 Viewer 视觉验收按用户要求由用户执行，当前未标记为已通过。
- 建议重点观察：终止后不再新生、旧粒子仍继续运动、自然 lifetime 离场，以及
  `clearOrphanParticles()` 为短促淡出而非同帧删除。
- 自动化使用 Pixi mock 和确定性 sampler，不能替代真实 GPU/浏览器观感。
