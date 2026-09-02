# 290 vnicore-unified-particle-lifetime-and-orphan-clear 任务计划

## 1. 目标与完成定义

### 目标

统一 `packages/vnicore` 所有播放类型的粒子收尾语义：

- `keepParticlesAlive` 对 timeline、range、segmented 和 manual range 全部有效，缺省值统一为 `true`；
- 非循环播放自然结束、segmented 结束段完成或 manual operation cancel 时，先彻底关闭当前 emitter，不再产生新粒子；
- `keepParticlesAlive=true` 时，已发射粒子不被移除、不冻结，而是继续更新位置、旋转、缩放和透明度，按各自 authored lifetime 自然消失；
- 新增统一的无主粒子快速清理接口，调用后所有已脱离 emitter 的粒子在短时间内淡出，而不是当帧瞬间删除。

### 完成定义

- [x] `play()` 的 timeline/range/segmented options、`playRange()` 和 manual `playRange()` 都接受同一 `keepParticlesAlive?: boolean` 合同，省略时为 `true`。
- [x] 不新增 public `stop()`，不改变可恢复的 `pause()` 语义；只收敛现有 natural end、segmented end 和 manual cancel/destroy 边界。
- [x] `keepParticlesAlive=true` 时，播放终止边界后不再出现新粒子 identity；已有粒子继续运动并在各自剩余生命期到期时移除。
- [x] `keepParticlesAlive=false` 时，本次播放的当前粒子在终止边界不转为无主粒子。
- [x] public `clearOrphanParticles()` 仅影响已断开 emitter 的全部无主粒子，让它们在最多 `0.1s` 的 runtime update 时间内快速淡出；不关闭、不清除正在发射的粒子。
- [x] 自然结束仍在该次播放的无主粒子排空后触发 `onPlaybackComplete`；manual cancel/session destroy 不伪造 complete event。
- [x] 无主粒子由 `needsUpdate()` 和 Viewer ticker 持续驱动，直到自然排空或快速淡出完成；不引入新的 public stop transport。
- [x] `restart()`、`seek()`、pool reuse 和 `destroy()` 的硬重置/释放边界仍可立即释放 runtime 自有粒子资源，不将销毁伪装成淡出。
- [x] Pixi Core、Viewer wrapper、manual transport、pool reset、诊断、README/API 和直接 consumer typecheck 对新合同保持一致。

## 2. 范围

### 包含

- `packages/vnicore/src/core`：统一 playback options、现有终止边界、无主粒子 cohort、自然 drain、快速淡出和 completion ownership。
- `packages/vnicore/src/viewer`：转发新 public API，并确保 RAF/ticker 能驱动只剩无主粒子的 runtime。
- `packages/vnicore/tests`：覆盖粒子类型、播放模式、pause、natural/segmented/manual termination、completion、clear、pool/destroy 和 Viewer 驱动。
- `packages/vnicore` README/API/usage 和最小 VNI runtime 领域规则同步。
- 使用 VNICore public types 的 `packages/rendercore` 以及 Viewer app 的直接编译回归；只在新类型导致必要适配时修改 consumer。

### 不包含

- 不修改 VNI JSON schema、editor export、manifest、资源或 fixture 三处同步清单。
- 不同步改造 `packages/anieditorv5runtime-cc` 或 standalone Cocos runtime；它是独立实现，后续若需 parity 另立任务。
- 不为 Viewer app 新增播放面板或业务按钮；本任务交付 runtime API 与 wrapper 能力。
- 不改变粒子 authored 参数、随机 seed、上限、坐标系或正常发射期的 editor-preview parity。
- 不新增 `stop()`，不把 `pause()`、`restart()`、`seek()` 或 `destroy()` 静默 alias 为 stop。
- 不在 rendercore 或 app 复制 particle cohort/drain 状态机。

## 3. 制定计划时的基线

```text
UTC: 2026-09-02T09:37:09Z
HEAD: a652783b089b946cd2691d30203349607989a717
branch: detached HEAD
git status --short --untracked-files=all: clean
```

实际读取的规则与模板：

```text
AGENTS.md
docs/agent-rules/vni-runtime.md
tasks/templates/task-plan.md
```

`packages/vnicore` 下没有更深层 `AGENTS.md`。执行时保留用户后续产生的无关修改，不 reset、checkout、stash 或顺手格式化。

当前实现结论：

- `src/core/playback-sequence.ts` 只在 `VNISegmentedPlaybackOptions` 声明 `keepParticlesAlive`，默认 `true`；timeline/range 和 manual range 没有该 public option。
- `src/core/vni-runtime.ts` 没有 public `stop()`；`pause()` 会冻结并允许恢复，`restart()`/`seek()`/new range/new segmented/manual session 会 reset 单一 `particleRuntime`。
- timeline、range、segmented 和 manual range 的自然结束都收敛到 `VNIRuntime.startParticleDrain()`，直到 `finishParticleDrain()` 才触发 complete。
- `src/core/particle-runtime.ts` 只保存 `lastParticles` 快照和全 project `maxDrainDuration`；`advanceDrain()` 不重新采样位置/年龄，只按全局 ratio 给所有快照粒子乘线性 alpha。
- `src/core/particle-sampler.ts` 能根据 elapsed 确定性采样，但还没有“已停止发射的 spawn cutoff”或跨帧稳定 particle identity 合同，不能直接表达只推进已发射粒子。
- `VNIRuntime.getPlaybackState()` 对非 segmented 直接报告 `keepParticlesAlive: true`，并没有保存每次播放的 policy。
- `VNIViewer` 组合 core 并拥有 ticker；它需要转发 `clearOrphanParticles()`，并在 clear 快速淡出期保持 ticker。
- `VNIRuntime.resetForPoolReuse()` 和 `destroy()` 是硬释放边界；必须清空 active emitter、所有 orphan cohorts、pending completion 和 display sprites。
- `packages/rendercore` 有 timeline/range/segmented 直接 consumer；现有 explicit segmented `keepParticlesAlive` 配置必须保持，新增 optional API 不得要求业务层复制默认值。

## 4. 需求解释与技术决策

### 需求解释

- **active emitter particles**：仍属于当前播放且允许生成新 particle identity 的粒子。
- **orphan particles**：natural/segmented/manual termination 后 emitter 已关闭，但粒子还有剩余 authored lifetime 的 cohort。这里的 orphan 是 runtime ownership 术语，与 ZIP/resource orphan 校验无关。
- `keepParticlesAlive=true` 是每次播放捕获的 policy；对 segmented，它仍保留 loop/hold 期跨 authored duration 的 live emission 旧语义，并额外统一决定终止边界是否保留已发射粒子。
- `keepParticlesAlive=false` 只改变本次播放：segmented loop 不进入 live-extension，终止时不创建 orphan cohort。
- 自然结束保持既有 visual-complete 边界：本次 cohort 排空后才 complete。manual cancel/session destroy 是 cancel 而不是 complete，不伪造 playback completion。
- `pause()` 继续冻结主时间轴和粒子时钟；只有 `play()` 恢复。本任务不新增另一个 stop transport。
- 无主粒子必须不跟随后续 timeline state 改变的 layer/emitter transform；脱离时捕获 Pixi 世界中的 emitter 基准和粒子必需采样上下文。

### 关键决策

1. **共享 playback particle policy**
   - 新增一个公共基础 options 类型，由 timeline、range、segmented 和 manual range 继承，不在四处复制 normalize 默认值。
   - `VNIPlaybackState.keepParticlesAlive` 返回当前/最近 active playback 捕获的 policy；初始 idle 值为 `true`。

2. **active emitter session 与 orphan cohorts 分离**
   - 终止边界关闭 active emitter，已发射粒子转为独立 orphan cohort；不再用一个全局快照 alpha 冒充它们的运行状态。
   - cohort 拥有独立 id、layer/animation 采样快照、emitter 基准、simulation elapsed、spawn cutoff、快速淡出状态和可选 completion token。一次播放可因多 layer/animation 产生多个 cohort，不因此引入 public stop 或隐式多 transport。

3. **重采样剩余生命期，不冻结最后一帧**
   - 扩展 particle sampler/runtime，用稳定 spawn identity 和 cutoff 只采样终止时已发射的粒子；每次 `update(deltaSeconds)` 继续推进它们的 age/motion/alpha。
   - `particles`、`particle_stream`、`particle_twinkle`、`particle_wall`、`particle_combo` 都要有明确的 spawn cutoff 和自然终止计算；不用 project-wide max duration 冒充每颗剩余 lifetime。
   - 普通播放期的现有 deterministic sampling 输出保持；如果为稳定 identity 必须调整 spawn-time 计算，需要用直接 parity tests 证明非 drain 帧未回归。

4. **只新增 orphan clear 合同**
   - 不新增 `VNIRuntime.stop()`。timeline/range 自然结束、segmented ending 完成和 manual operation `cancel()`/session `destroy()` 共用同一 emitter-detach 内核。
   - `clearOrphanParticles()` 无参且幂等；将调用时已存在的所有 orphan cohort 切换到 `0.1s` 强制淡出，不 suppress active emitter，不删除其它 display/effect。
   - 若某个自然结束的 complete 正在等待 orphan cohort，clear 使它在快速淡出完成后正常 complete，不丢 listener、不重复触发。

5. **playback phase 和 particle activity 解耦**
   - `phase="particle-draining"` 只表示自然结束正在等本次 visual completion；manual cancel/session destroy 后不伪造 `complete` phase。
   - `isDrainingParticles`/`liveParticleCount`/`needsUpdate()` 独立统计 active 与 orphan 活动，避免旧 orphan 覆盖新 playback phase。

6. **lifecycle 硬释放例外**
   - `destroy()`、pool eviction/reuse 和显式重建必须同步硬清 active/orphan state 和 Pixi nodes；这是 ownership cleanup，不调用快速淡出。
   - `restart()`/`seek()` 保持当前确定性重置语义；执行时用 tests 固定 active-session reset、orphan cleanup 与 runtime destroy 的资源边界，不留半重置状态。

## 5. 职责与合同

- **playback sequence/types**：拥有 `keepParticlesAlive` 的 public type/default normalization，不拥有 Pixi 粒子节点。
- **particle sampler**：拥有各 animation type 的 stable spawn identity、age、cutoff 和 authored lifetime 采样，保持纯数据。
- **particle runtime**：拥有 active emission 时钟、orphan cohort、natural/forced drain、completion token 和完成判定，不拥有 Pixi display tree。
- **VNIRuntime**：拥有现有 terminal transition 到 emitter detach 的原子转换、`clearOrphanParticles()` public API、completion listener、diagnostics 和 Pixi sprite pool/render。
- **manual session**：只把 natural complete/cancel/destroy 转发给同一 particle ownership 边界，不实现第二套 drain。
- **Viewer**：转发 runtime API 并拥有 RAF 调度；不读取 private cohort 或复制粒子算法。
- **失败策略**：未 init/destroy 后 clear、非法 boolean policy、重复 transport、失效 manual operation 和 cohort/completion 状态冲突显式失败；合法的“无 orphan 时 clear”是幂等 no-op。
- **禁止行为**：不冻结快照整体淡出冒充 lifetime，不继续 emitter 伪装旧粒子运动，不用 timer 绕过 host `update()`，不在 consumer 重建 cohort，不用静默 fallback 掩盖未支持粒子类型。

## 6. 文件范围

### 预计新增

```text
原则上无；如 particle cohort 状态使 particle-runtime.ts 职责过重，可拆出 packages/vnicore/src/core/particle-cohort.ts 及对应单测。
```

### 预计修改

```text
packages/vnicore/src/core/playback-sequence.ts
packages/vnicore/src/core/manual-playback.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/src/core/vni-runtime.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/viewer/vni-viewer.ts
packages/vnicore/src/viewer/index.ts
packages/vnicore/tests/core/playback-sequence.test.ts
packages/vnicore/tests/core/particle-sampler.test.ts
packages/vnicore/tests/core/particle-runtime.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/usage-en.md
docs/agent-rules/vni-runtime.md
```

如直接 consumer 因 public type 适配必须修改，只限精确受影响的 declaration/test，例如：

```text
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/tests/win-amount/win-amount-player.test.ts
apps/anieditorv5viewer/tests/main.test.ts
```

### 原则上不应修改

```text
packages/anieditorv5runtime-cc
docs/anieditor5
packages/vnicore/tests/fixtures/export
packages/rendercore 中与 VNI transport declaration 无关的模块
apps/game*
assets
pnpm-lock.yaml
AGENTS.md
```

执行时若需修改 schema、editor、Cocos runtime、lockfile 或广泛业务 consumer，必须先停止并说明重大范围扩张。

## 7. 实施步骤

1. **确认执行基线**
   - 重新核对 HEAD、工作区、规则、public exports、直接 consumer declarations 和相关旧测试。
   - 以当前 particle animation 类型清单为准，不从文件名或首个 animation 猜测 emitter。

2. **统一 playback options 和终止边界**
   - 在 `playback-sequence.ts` 提取 particle policy 基础类型与 normalize helper，扩展 timeline/range/segmented；在 `manual-playback.ts` 扩展 manual range options。
   - 在 `VNIRuntime` 保存每次 playback policy，将 timeline/range/segmented/manual 现有的 end/cancel 收敛到统一 terminal transition，不新增 stop API。
   - 保持 pause/resume、marker、loop index、authored seed session 和 transport conflict 旧合同。

3. **建立稳定粒子 identity 和 cutoff sampler**
   - 为每种 particle animation 定义可重复采样的 spawn identity/time/lifetime，输出不依赖 Pixi object identity。
   - 增加“emission 已截止”采样输入：时钟继续前进，但不得采样 cutoff 之后的 spawn；已存粒子按 authored 运动/淡出/lifetime 计算。
   - 用旧正常帧 golden assertions 保护 active emission parity，用新时序 assertions 保护 emitter 终止后不新生、不冻结和逐颗到期。

4. **实现 orphan cohort runtime**
   - 用 active session + orphan cohort collection 替换 `lastParticles + maxDrainDuration + global alpha ratio` 模型。
   - terminal transition 先捕获快照/截止发射，再发布 cohort；出错时不留半转换 emitter、pending completion 或 display nodes。
   - 合并渲染同一播放内多 layer/animation 形成的 cohorts，稳定 key 包含 cohort id，防止 sprite reuse 在 cohort 间错绑。

5. **实现快速清理、completion 和诊断**
   - 新增 `clearOrphanParticles()`，把现有 orphan cohort 切到最多 `0.1s` forced fade；连续调用幂等，清空后再调用 no-op。
   - 拆分 active phase、orphan activity 和 pending visual completion；确保 natural completion 不丢失，manual cancel/session destroy 不触发，runtime destroy/reset 不触发过期 callback。
   - 更新 `needsUpdate()`、`isParticleDraining()`、`getLiveParticleCount()`、`getPlaybackState()` 和 inspection 计数。

6. **接入 Viewer、manual 和 pool lifecycle**
   - `VNIViewer` 转发 `clearOrphanParticles()`，调用后同步 diagnostics 并按 `needsUpdate()` 决定 ticker。
   - manual range natural completion、operation cancel 和 session destroy 使用同一 terminal transition；manual controller runtime override 按原 ownership 清理，不泄漏到 orphan sampler。
   - pool release/reuse/template destroy 硬清所有 cohort、listener token、ticker state 和 Pixi sprites，后续 lease 从 `keepParticlesAlive=true` idle 基线开始。

7. **补齐自动化测试**
   - core sampler/runtime 覆盖所有已支持 particle animation type、不同 lifetime、fadeOut true/false、spawn cutoff、emitter transform 冻结和同次播放多 cohort。
   - Pixi runtime 覆盖 timeline/range/segmented/manual 默认 true、显式 false、pause/resume、natural completion、manual cancel、clear 快速淡出、seek/restart/destroy/pool reset。
   - Viewer 覆盖只剩 orphan 时 ticker 不早停，clear 完成后 ticker 停止，不通过 app 读 private runtime state。

8. **文档、规则与收尾**
   - README/API/usage 记录所有 playback type 的默认值、pause 保持不变、natural complete 时机、clear 作用域和 host ticker 责任。
   - 在 `docs/agent-rules/vni-runtime.md` 最小补充“emitter termination 与 orphan lifetime/forced fade 归 core 拥有”的稳定边界；不改根 `AGENTS.md`。
   - 运行第 8 节 L2 验收，失败先最小化到 sampler、cohort lifecycle、Pixi render 或 direct consumer type declaration，然后生成 UTC 报告。

## 8. 测试与验收

### 测试原则

- 不为保留旧“冻结快照整体淡出”测试而扭曲新生命期合同；相冲突的旧测试应改为验证真实 age/motion/expiry。
- 自然 drain 测试必须同时证明“无新 identity”、“已有粒子采样变化”和“按各自寿命消失”，不只检查 alpha 变小。
- clear 测试必须观察至少一个中间淡出帧和 `<=0.1s` 完成帧，确认不是同步删节点。
- 使用 synthetic projects 稳定控制 seed/lifetime/spawn rate；不修改导出 fixture 来专门服务测试。
- Pixi mock 可验证 display identity/count/transform/alpha 和 lifecycle，但不声称它完成了人工视觉验收。

### 验收级别

`L2`：修改 `@slotclientengine/vnicore/core` 和 `./viewer` public API，重写粒子 resource ownership/completion lifecycle，并有 rendercore 等直接 consumer。定向验收 VNICore 全包、Viewer app 和最主要直接 consumer，不扩展为整仓 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter anieditorv5viewer typecheck
pnpm --filter @slotclientengine/rendercore typecheck
git diff --check
```

如定向测试暴露 direct consumer 行为回归，再运行对应 package 的最小 test file/filter，并在报告说明升级原因；不直接跑整仓 test/build。

### 人工验收

建议用一个包含 `particle_wall`/`particle_stream` 且生命期明显长于停止点的现有 VNI 工程，在 Viewer 中确认：

1. timeline/range/segmented 自然结束后 emitter 立即不再生成新粒子，画面中旧粒子仍继续运动而不是定格。
2. 不调用 clear 时粒子按原生命期离场；调用 clear 时现存 orphan 有短促淡出，不出现同帧瞬间删除。
3. manual range 自然完成与 operation cancel 都会关闭 emitter；前者在粒子排空后 complete，后者不伪造 complete event。

### 独立验收建议

`建议`：涉及跨包 public contract、粒子 resource ownership、多 animation cohort、pending completion、manual cancel 和 destroy/pool reset。独立复验重点是不新生、不冻结、不重复 complete 以及无 sprite/listener 泄漏。

最多复验：

```bash
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/rendercore typecheck
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；当前 shell 无 `node` 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不切换 npm/yarn，不为本任务升级已锁定版本。
- 依赖缺失时：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置代理并重试原命令：

  ```bash
  export http_proxy=http://127.0.0.1:1087
  export https_proxy=http://127.0.0.1:1087
  ```

- 预期不新增依赖、不修改 `pnpm-lock.yaml`。如实现必须新增依赖，先停止说明必要性和影响。

## 10. 生成物、文档与规则

- `packages/vnicore/dist` 只由 package build 生成，禁止手改；若当前仓库不跟踪 dist，不把它加入任务 diff。
- 本任务不改 YAML/manifest，无生成器或 parity checker 交付物。
- 更新 `packages/vnicore/README.md`、`docs/api-zh.md`、中英文 usage，使 public API、默认值、completion 时机、host ticker 和 lifecycle 可独立于对话理解。
- 最小更新 `docs/agent-rules/vni-runtime.md` 的稳定 core ownership；不把精确 `0.1s` 常量或任务证据写入根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/290-vnicore-unified-particle-lifetime-and-orphan-clear-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终 public API、particle cohort 实现和实际修改文件；
2. stable identity/spawn cutoff/forced fade/completion 的关键决策和计划偏差；
3. 实际验收命令及结果；
4. 未完成的真实 Viewer 人工验收；
5. 剩余风险和未完成项。

不收集无关 coverage 分析、完整历史矩阵、整仓统计或 profiler 证据。

## 12. 风险、假设与待确认

### 风险

- 当前某些 sampler 的 spawn time 依赖当帧 total count/elapsed；引入稳定 identity 时如处理不当，会改变正常播放外观或 seed parity。
- 同一播放中多 layer/animation orphan cohorts 会增加 sprite 数和采样开销；必须保留现有每类型上限，并确保 cohort 自然或 forced fade 后立即释放。
- pending natural completion、clear 加速、manual cancel 和 runtime destroy 交叉时容易出现重复/过期 callback；需要 generation/token 级别的测试。
- `isDrainingParticles` 与 `phase` 解耦可能影响依赖旧“有粒子就是 particle-draining phase”假设的 consumer；必须定向搜索并编译直接 consumer。

### 假设

- “所有播放类型”包含 VNICore public timeline、range、segmented 以及 manual range，不包含独立 Cocos runtime。
- `keepParticlesAlive=false` 代表不保留本次 playback 的终止粒子；默认 `true` 代表自然生命期收尾。
- “很快淡出”在本任务中定义为最多 `0.1s` runtime update 时间，并且至少存在一个可观察中间淡出帧。
- 自然结束继续遵守当前“视觉排空后 complete”合同，本任务不把 completion 提前到 timeline 终点。

### 待确认

无。如执行时发现现有 public consumer 对 completion 时机有与上述合同相反的显式要求，属重大 public behavior 冲突，必须停止并请用户决策。

## 13. 完成清单

- [x] timeline/range/segmented/manual range 的 `keepParticlesAlive` 都默认 `true` 且语义一致。
- [x] 不新增 `stop()`，`pause()` 可恢复语义不变，现有播放终止边界会确实关闭 emitter。
- [x] orphan 粒子无新 spawn、继续运动并按各自 lifetime 消失，不再冻结整体淡出。
- [x] `clearOrphanParticles()` 仅快速淡出 orphan，不误伤 active emitter，不丢失 pending natural completion。
- [x] phase、particle activity、completion、manual cancel、pool reuse 和 destroy ownership 符合计划。
- [x] public exports、Viewer wrapper、diagnostics、README、usage 和 VNI 领域规则已同步。
- [x] 指定 L2 自动化验收已通过，真实 Viewer 人工验收与 mock 证据已区分。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/vni-runtime.md` 和本计划；
2. 核对 Git 基线与工作区；
3. 按计划实现，不新增 stop transport，不重新制定另一套 particle completion 方案；
4. 小幅适配当前实现时在报告记录；
5. 重大范围扩张或 public completion 冲突时先停止说明；
6. 只运行本计划规定的 L2 验收；
7. 完成后生成 UTC 执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
