# 145 anieditorv5runtime-cc-playback-authored-seed-control 任务计划

## 1. 目标与完成定义

### 目标

把任务 144 已在 `packages/vnicore` 落地的 authored seed 播放控制，以独立 Cocos Creator
3.8.6 实现同步到 `packages/anieditorv5runtime-cc`。宿主通过 `V5GCocosPlayer.play()` 的可选
`ignoreAuthoredSeed` 参数选择继续使用 VNI 导出的 animation `seed`，或为本次新播放使用 runtime
seed。默认必须保持 authored/editor 效果；runtime 模式在不同新播放之间可变化，但同一次播放内
保持确定、连续且可 seek。

### 完成定义

- [ ] timeline、range、segmented 三种 `play()` mode 都接受
      `ignoreAuthoredSeed?: boolean`；省略或 `false` 精确保持现有 authored seed 行为。
- [ ] `ignoreAuthoredSeed: true` 时，每次新播放建立独立 runtime seed session，effective seed
      不依赖 authored seed；不同新播放可得到不同的粒子/随机效果。
- [ ] 同一次播放的 update、loop、segmented hold/ending、particle drain、pause/resume、
      `seek()` 和 `restart()` 使用同一组 effective seeds，不逐帧 reroll。
- [ ] 开关覆盖 Cocos 当前支持并实际读取 animation seed 的粒子与 deterministic effect 路径；
      Cocos 不支持的 render effect 继续在 validation/init 显式失败。
- [ ] authored project、snapshot、schema、fixture 和 core sampler 默认确定性合同不被修改。
- [ ] 新播放回到默认模式时恢复 authored seed；manual session、clone、pool reuse 和 destroy
      不泄漏 runtime seed state。
- [ ] 非 boolean 配置在 transport、particle 或画面状态变化前显式失败。
- [ ] modular public declaration、生成的 standalone、checker、README、测试和本地
      `standalone.zip` 保持一致，并生成任务 145 UTC 中文执行报告。

## 2. 范围

### 包含

- `V5GPlayOptions` 三个判别分支共享的 authored-seed 控制字段及 strict normalization。
- `V5GCocosPlayer` 的 playback seed session、只读 effective layer view 和生命周期清理。
- 当前 Cocos 实际 seed consumer：
  - `particle-sampler` 驱动的 layer particle / live particle / drain；
  - `effect-sampler` 驱动的十类 deterministic effect。
- pause/resume、loop、seek/restart、segmented playback、clone 和 pool reset 的 session 隔离。
- modular/standalone public 类型与行为、standalone checker、README 和本地 ignored ZIP。

### 不包含

- 修改任务 144 的 `packages/vnicore` 实现、Pixi player、Viewer UI 或编辑器 preview。
- 修改 VNI schema、`V5GAnimationConfig.seed`、exporter、reroll 功能或正式 fixture。
- 给宿主暴露 numeric seed、seed generator、replay token 或全局随机服务。
- 在逐帧 sampler 中调用 `Math.random()`，或修改 sampler 接受显式 seed 时的默认确定性合同。
- 扩展 legacy `playRange()`、manual playback session 或 pool lease `playOnce()`；这些入口继续使用
  authored seed。
- 为 Cocos 启用 `shatter` / `glow` render effect，或放宽 Cocos-compatible validation。
- 修改 Cocos driver、资源 ownership、asset resolver、Node/SpriteFrame 生命周期或隐藏 update 时钟。
- 新增依赖、修改 lockfile、package version、根工具链或其它 package。

## 3. 制定计划时的基线

```text
UTC: 2026-07-31T04:30:08Z
HEAD: effb9dfc64e90116077b1bedf973c9ec975e9b13
branch: detached HEAD
git status --short --untracked-files=all: clean
task 144 implementation commit: effb9df
```

执行时重新核对基线，保留用户后续产生的无关修改，不 reset、checkout、stash 或顺手格式化。

实际读取：根 `AGENTS.md`、`docs/agent-rules/cocos-runtime.md`、计划模板、任务 144
计划/报告，以及 `packages/anieditorv5runtime-cc/{README.md,package.json}`。目标 package 下没有
更深层 `AGENTS.md`。

当前实现结论：

- 任务 144 已为 vnicore 的三种 `play()` mode 增加 `ignoreAuthoredSeed`，并以一次 playback seed
  session 和稳定 `layerId + animationId` 派生 effective seeds；默认和直接 sampler 合同未变。
- Cocos `src/core/playback-sequence.ts::V5GPlayOptions` 具有相同三种 mode，但尚无 seed control 或
  normalization；`src/cocos/types.ts` 只提供现有 playback 类型别名。
- `V5GCocosPlayer` 的 particle runtime 和 deterministic effect sampler 都直接接收
  `ManagedLayer.layer`，因此当前只能读取 authored animation seed。
- Cocos validation 明确拒绝 enabled `shatter` / `glow` render effect；虽然 core
  `render-effect-sampler.ts` 仍可独立确定性采样，player 不存在该渲染路径。
- `sampleProjectAtTime()` 负责时间轴 transform、active flags 和可见性，不拥有 runtime randomness；
  seed override 不需要修改 project sampling。
- player 的 `seek()`、`restart()`、segmented transport、particle drain、manual session、
  `resetForPoolReuse()` 和 `destroy()` 已有明确状态边界，但没有 seed session state。
- pool clone 拥有独立 project/player/particle/transport，归还时调用 `resetForPoolReuse()`；
  runtime seed cache 必须遵循相同隔离边界。
- standalone runtime 由 `scripts/build-standalone.mjs` 从 modular source 生成，禁止手改；
  `scripts/check-standalone.mjs` 当前未检查 seed control public API。
- `standalone.zip` 是 ignored 本地正式交付物，必须包含 runtime、示例和 screen Effect；普通
  `git status` 不能证明它已更新。

当前代码、测试、任务 144 计划/报告和 package 文档足以确认合同与缺口，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “任务 144 需要同步”指同步 public option、seed session 语义、strict failure 和测试，不让 Cocos
  runtime 依赖 vnicore 或复制 Pixi renderer/ticker。
- “authored seed”指每个 layer animation 导出的 `seed`，不是新增 schema 字段。
- 默认兼容合同是：不传或传 `false` 时继续与编辑器导出一致。
- “忽略”指新播放开始时建立 runtime effective seeds，而不是每帧使用 ambient randomness。
- 一次 session 覆盖该次播放、loop、segmented ending/drain 及其中的 pause/resume、seek/restart；
  播放完成后清除，下一个新 `play()` 再按其 option 建立 session。
- range/segmented 每次 `play()` 都是新 session；timeline 从 idle/complete 开始时是新 session，
  pause/drain 后恢复则继续当前 session。
- Cocos 不支持的 render effect 不属于“同步后可播放”的能力；本任务不能以 seed control 为由
  绕过原有 fail-fast。

### 关键决策

1. **在 Cocos package 内提供 additive public contract**

   ```ts
   interface V5GPlaybackSeedOptions {
     readonly ignoreAuthoredSeed?: boolean;
   }
   ```

   timeline、range、segmented option 继承该字段，并提供对应 Cocos type alias。省略和 `false`
   向后兼容；非 boolean 不做 truthy coercion。

2. **每次新播放只生成一次 seed session**
   - session 建立时生成一个 runtime base seed，再用稳定 `layerId + animationId` 派生每个
     animation 的 effective seed；派生不读取 authored seed。
   - 一次性构建只读 layer view map；逐帧 update 只查缓存，不创建新 Map/数组或调用随机源。
   - 测试注入或 spy runtime 随机源，避免用“两次大概率不同”作为断言。

3. **不修改 authored project 和 core sampler**
   - `getProjectSnapshot()`、pool authored variant 和 JSON 始终保留原 seed。
   - player 只在 particle/deterministic effect 调用边界选择 authored layer 或 playback layer view。
   - `particle-sampler`、`effect-sampler` 和 `render-effect-sampler` 继续只按收到的
     `animation.seed` 确定性采样，不感知 playback mode。

4. **按 Cocos transport 边界维护 session**
   - pause/resume、already-active playback、seek/restart、loop、segmented end 和 drain 不 reroll。
   - range/segmented 新 `play()` 和已完成后的 timeline 新 `play()` 建立新 session。
   - 进入 manual session、pool reset、destroy 和播放完整结束时清理 session。
   - `forceStopAllParticles()` 只清粒子，不隐式切 seed mode；下次明确的新播放按新 option 重建。

5. **legacy/manual/pool convenience API 保持 authored**
   - 与任务 144 一致，首版只扩展 `V5GCocosPlayer.play()`。
   - `playRange()`、manual `playRange()` 和 lease `playOnce()` 不增加参数，避免同一 player 出现
     多套未定义的 session 生命周期。

6. **standalone 由 modular source 生成**
   - production 逻辑只写在 `src/`；生成器同步单文件 public surface 和实现。
   - checker 固定 seed option/normalizer/type alias，并继续验证 standalone 只依赖 `"cc"`。
   - ZIP 重建但不改示例业务流程；README 提供 opt-in 用法即可。

## 5. 职责与合同

- **core playback types**：定义共享 seed option 和 strict normalization，不修改 range/segmented
  时间语义。
- **Cocos player**：判定 fresh/resume、创建/缓存/清除 effective layer view，并将其传给实际
  seed consumer。
- **core samplers**：保持纯确定性函数，只消费参数中的 animation seed。
- **particle runtime**：继续拥有 live elapsed、emission 和 drain；不得独立 reroll。
- **deterministic effect renderer**：使用当前 playback layer view；节点池、坐标和 blend 行为不变。
- **pool/clone/manual**：保持 mutable state 隔离；reset/manual 边界只留下 authored mode。
- **standalone**：与 modular 共享同一生成来源、public 类型、失败语义和播放行为。
- **失败策略**：非法 option 在 transport/particle/display mutation 前抛错；session prepare 失败
  不得留下半切换 seed mode或半重置画面。
- **禁止行为**：不写回 project、不逐帧随机、不静默忽略非法值、不启用 unsupported effect、
  不引入 vnicore/Pixi/DOM/URL loader 或另一套 standalone 私有实现。

## 6. 文件范围

### 预计新增

```text
tasks/145-anieditorv5runtime-cc-playback-authored-seed-control-<utctime>.md
```

seed view helper 优先保留在现有 player；若职责明显膨胀，可拆分同目录 helper/test，并在报告说明。

### 预计修改

```text
packages/anieditorv5runtime-cc/src/core/playback-sequence.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/tests/core/playback-sequence.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/README.md
```

生成的 `standalone/anieditorv5runtime-cc.ts` 只能由 `standalone:build` 更新。

正式本地生成物 `packages/anieditorv5runtime-cc/standalone.zip` 虽被 Git ignore，仍必须重建、
检查内容并记录 SHA-256。

### 原则上不应修改

```text
packages/vnicore/**
apps/anieditorv5viewer/**
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/*-sampler.ts
packages/anieditorv5runtime-cc/src/cocos/manual-playback.ts
packages/anieditorv5runtime-cc/src/cocos/player-pool.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/standalone/effects/**
packages/anieditorv5runtime-cc/tests/fixtures/**
docs/agent-rules/**
AGENTS.md
pnpm-lock.yaml
```

若必须扩展 legacy/manual/pool API、启用 render effect、修改 schema/validation、资源 ownership 或
lockfile，先停止说明范围扩张。

## 7. 实施步骤

1. **确认执行基线**
   - 重核 HEAD/status、任务 144 最终实现、Cocos runtime 规则、player transport、pool reset 和
     standalone 生成链。
   - 定向搜索 Cocos package 内所有 `seededRandom(animation.seed, ...)` 与 player sampler 调用，
     以当前实际 seed consumer 形成闭包。
2. **扩展并规范化 public option**
   - 在 `playback-sequence.ts` 增加共享 option 和 strict normalizer，接入三种 `V5GPlayOptions`。
   - 在 Cocos types 增加明确 alias，保持现有 object literal 和无参数 `play()` 可编译。
   - 确保 invalid boolean 在调用任何 start transport 前失败。
3. **实现 Cocos playback seed session**
   - 在 player 区分新 session、pause/drain resume 和已有 session。
   - runtime 模式一次性生成 base seed，并按稳定 animation identity 建只读 layer view。
   - authored 模式不创建 override；任何模式都不修改 `options.project` 或 managed authored layer。
4. **接入受影响渲染路径与生命周期**
   - particle runtime layer 和 deterministic effect sampler 从统一 playback layer view 取配置。
   - loop、seek/restart、segmented live/ending/drain 继续使用同一 view。
   - completion、manual session、resetForPoolReuse 和 destroy 清 cache；clone 初始帧保持 authored。
5. **补齐 modular 与 standalone 测试**
   - core 覆盖 omitted/false/true 和非 boolean strict failure。
   - player 覆盖默认 parity、runtime seed 不依赖 authored、fresh play 变化、同 session 稳定、
     project snapshot 不变及 particle/deterministic effect 全部接入。
   - 覆盖 pause/resume、seek/restart、loop、segmented drain、manual reset、clone/pool reuse 无污染。
   - standalone import/checker 固定 public surface，player/parity 对相同随机源和 delta 验证 modular
     与 standalone 结果一致。
6. **生成交付物与文档**
   - README 记录字段默认值、fresh-session 边界、Cocos 显式 update、支持效果和非目标。
   - 运行 `standalone:build` 更新生成文件，再执行第 8 节验收。
   - 重建 ZIP，仅纳入 runtime、示例和 Effect；记录内容、大小和 SHA-256。
7. **收尾**
   - 检查 diff、旧 public surface/checker 遗漏和无关文件变化。
   - 生成任务 145 UTC 中文执行报告，自动化与真实 Creator 结果分开记录。

## 8. 测试与验收

### 测试原则

- 使用 synthetic project 和 fake Cocos driver 观察粒子/确定性效果输出，不修改正式 fixture seed。
- runtime 随机测试必须 stub/spy 随机源，禁止依赖概率性不相等。
- 相同 session、animation 和时间的样本必须精确一致；不同 fresh session 只要求受 seed 控制的
  分布变化。
- project snapshot、authored layer identity 和 pool reuse 测试保护输入不变与 lease 隔离。
- standalone 测试既验证直接语义，也验证 modular parity；不能只搜索生成文件字符串。
- fake `cc` 不能冒充 Creator 3.8.6 的真实粒子/Effect/帧视觉。

### 验收级别

`L2`。本任务增加 package public playback contract，改变 player 跨 particle/effect 的 session state，
并更新 standalone 与本地正式 ZIP。它不改 schema、资源 ownership、workspace 工具链、lockfile 或
release，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --dir packages/anieditorv5runtime-cc standalone:build
pnpm --dir packages/anieditorv5runtime-cc test
pnpm --dir packages/anieditorv5runtime-cc typecheck
pnpm --dir packages/anieditorv5runtime-cc build
pnpm --dir packages/anieditorv5runtime-cc standalone:check
pnpm --dir packages/anieditorv5runtime-cc typecheck:standalone
git diff --check
```

共 7 条：package test/typecheck/build 分别保护行为、测试源码和 declaration；standalone 的生成、
边界 checker 与 ES2015 typecheck 是三个独立交付面；最后检查 diff。失败先最小化到
playback-sequence、player seed session、pool reset 或 standalone parity，不运行根级全仓门禁。

### 人工验收

`建议但不阻塞自动化完成`。在 Cocos Creator 3.8.6 项目使用含明显粒子或 deterministic effect 的
Cocos-compatible VNI：

1. 连续两次默认/`false` 播放，确认与编辑器导出及两次之间的效果一致。
2. 连续两次 `ignoreAuthoredSeed: true` 新播放，确认分布变化，但单次 update、pause/resume、
   loop、seek 和 segmented drain 无跳变。
3. 从 runtime 模式切回默认播放，并通过 pool 借出/归还 clone，确认 authored 分布恢复且 lease
   之间无污染。

执行报告必须把 Creator 视觉结果和 fake 自动化分开；未执行时明确记录“待复验”。

### 独立验收建议

`建议`。涉及 additive public API 和 standalone 正式生成物，但不改变资源 ownership、destroy、
credential、schema 或外部服务。独立复验：

```bash
pnpm --dir packages/anieditorv5runtime-cc test
pnpm --dir packages/anieditorv5runtime-cc standalone:check
pnpm --dir packages/anieditorv5runtime-cc typecheck:standalone
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 使用同一环境的 pnpm，不切换 npm/yarn，不强制修改版本。
- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`。
- 下载实际失败后才设置 `http_proxy` / `https_proxy` 为 `http://127.0.0.1:1087` 并重试原命令。
- 本任务不新增依赖、不修改 package version 或 `pnpm-lock.yaml`；如实现需要，先停止说明原因。

## 10. 生成物、文档与规则

- 先修改 modular source，再运行 `standalone:build`；禁止手改 generated standalone。
- `standalone:check` 必须继续验证仅依赖 `"cc"`、无 vnicore/Pixi/DOM/Node/相对 import，并检查
  seed option、normalizer 和 Cocos public alias。
- 自动化通过后重建 `standalone.zip`，只含 standalone runtime、`V5GPreview.example.ts` 和
  `effects/vni-screen-alpha.effect`。

- 使用 `test -f`、`zipinfo -1` 和 `shasum -a 256` 验证 ZIP；普通 Git status 不能替代。
- README 同步 modular/standalone `play()` 示例、默认 authored 行为、单次稳定、新 session 边界、
  supported/unsupported effects 和显式 update 要求。
- 现有 `cocos-runtime.md` 已覆盖 modular/standalone parity、strict failure 和 pool reset；本任务
  不改变长期架构职责，不修改领域规则或根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/145-anieditorv5runtime-cc-playback-authored-seed-control-<utctime>.md
```

时间戳使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现与文件、关键决策/偏差、实际验收
结果、standalone ZIP 内容/hash、Creator 验收状态和剩余风险；不收集无关 coverage、完整历史、
整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 在 loop/seek/restart/segmented drain 边界错误重建 seed 会造成可见跳变，必须用 session 生命周期
  测试直接保护。
- 只接入 particle 或只接入 deterministic effect 会形成同一开关下混合 authored/runtime 语义；
  执行时以实际 seed consumer 搜索结果闭包。
- shallow layer view 若被误写会污染后续帧；必须保持只读，并以 project snapshot 测试确认 authored
  seed 不变。
- pool reset 或 manual session 若未清 cache，会跨 lease/transport 泄漏上次随机分布。
- ignored ZIP 容易残留旧 runtime；必须重建并核对目录/hash。
- fake Cocos 无法证明真实 Creator 视觉连续性，人工项必须单独标记。

### 假设

- 任务 144 的 additive option、effective seed 派生和 session 稳定性是任务 145 的语义来源；
  Cocos 差异只在显式 update、支持效果和 lifecycle 接入点。
- 用户要求同步的是 `play()` capability；legacy/manual/pool convenience API 不自动扩大。
- 当前 Cocos render effect fail-fast 是既有正确合同，不因同步 seed control 而改变。

### 待确认

无。

## 13. 完成清单

- [ ] 任务 144 的 `play()` seed control 已以 Cocos 独立实现同步。
- [ ] 默认/false 保持 authored/editor 效果，runtime 模式 fresh play 可变化且单次稳定。
- [ ] particle 与 supported deterministic effect 全覆盖，unsupported render effect 仍 fail-fast。
- [ ] project/schema/fixture/core sampler 未改写。
- [ ] pause/resume、loop、seek/restart、segmented drain、manual、clone/pool lifecycle 已覆盖。
- [ ] modular declaration、generated standalone、checker、README 和测试已同步。
- [ ] `standalone.zip` 已重建，仅含三个预期文件并记录 SHA-256。
- [ ] 指定 L2 自动化通过，人工结果单独记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/cocos-runtime.md` 和本计划；
2. 核对 Git/ignored ZIP、任务 144 当前合同和 Cocos 实际 seed consumer；
3. 按计划实现，不引入逐帧 randomness、vnicore 依赖或新的 fallback；
4. 小幅适配当前源码组织时在报告记录；
5. public API、schema、资源 ownership、lockfile 或文件范围明显扩大时先停止说明；
6. 只运行本计划规定的 L2 验收，失败先最小化；
7. 重建并核对 standalone ZIP，生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
