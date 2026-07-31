# 144 vnicore-playback-authored-seed-control 任务计划

## 1. 目标与完成定义

### 目标

为 `packages/vnicore` 的 `VNIPlayer.play()` 增加播放期参数，使 consumer 可选择继续使用
VNI 动画中编辑器导出的 `seed`，或在本次播放中忽略 authored seed、改用一次性 runtime
seed。默认行为必须保持与编辑器 Pixi preview 一致；选择忽略后，同一个 VNI player 的多次
新播放可得到不同的粒子/随机效果，同时单次播放内部仍稳定、可 seek、可暂停恢复且不逐帧闪变。

### 完成定义

- [ ] `play()` 的 timeline、range、segmented 三种 mode 都接受明确的可选
      `ignoreAuthoredSeed` boolean；省略或 `false` 时精确保持当前 authored seed 行为。
- [ ] `ignoreAuthoredSeed: true` 时，每次新播放建立独立 runtime seed session；其结果不依赖
      animation authored `seed`，不同新播放可得到不同分布。
- [ ] 同一次播放的每帧采样、loop 回绕、segmented hold、particle drain、pause/resume、
      `seek()` 和 `restart()` 使用同一组 effective seeds，不因重新采样产生抖动或跳变。
- [ ] runtime seed 只影响当前使用 `animation.seed` 的粒子、deterministic effect 和 render
      effect；不改写 project、export snapshot、schema、asset 或编辑器数据。
- [ ] 新播放回到默认模式时恢复 authored seed；clone、pool lease 归还和 player destroy
      不泄漏上一播放的 runtime seed state。
- [ ] 非 boolean 配置显式失败；不支持的 top-level `project.particles` 继续按现有 validation
      失败，不借本任务扩大兼容范围。
- [ ] public declaration、README/API/中英文 usage、L2 定向自动化和任务 144 UTC 中文执行报告完成。

## 2. 范围

### 包含

- `VNIPlayOptions` 三种判别分支共享的 authored-seed 控制字段及 runtime 校验。
- `VNIPlayer` 的 playback seed session、effective seed/layer cache 和 transport 生命周期。
- 当前实际读取 `animation.seed` 的 layer animation 路径：`particle-sampler` 的各类粒子、
  `effect-sampler` 的随机效果，以及 `render-effect-sampler` 的 shatter。
- player clone、pool reset/reuse 与 particle drain 中的 seed state 隔离。
- 直接保护默认兼容、runtime 随机、单次稳定和 lifecycle 的单元测试及 public 文档。

### 不包含

- 修改 VNI export schema、`V5GAnimationConfig.seed`、编辑器 reroll 按钮或编辑器 Pixi preview。
- 把 `Math.random()` 直接放进逐帧 sampler，或让同一播放中的粒子位置每帧重新随机。
- 给 consumer 暴露指定 numeric seed、seed generator、全局随机服务或可持久化 replay token；
  本任务只提供“使用 authored seed / 忽略 authored seed”两种选择。
- 修改 core sampler 的默认确定性合同；consumer 直接调用 sampler 时仍按传入
  `animation.seed` 采样。
- 扩展 manual playback session、Cocos runtime、viewer UI、rendercore 游戏配置或正式资源。
- 支持当前 validation 已拒绝的 `project.particles`，新增依赖、修改 lockfile 或根工具链。

## 3. 制定计划时的基线

```text
UTC: 2026-07-31T03:35:26Z
HEAD: d101058ad390a872edec347d47696937236e84c8
branch: detached HEAD
git status --short --untracked-files=all: clean
```

执行时重新核对基线，保留用户后续产生的无关修改，不 reset、checkout、stash 或顺手格式化。

实际读取的规则、模板和 package 文档：

```text
AGENTS.md
docs/agent-rules/vni-runtime.md
tasks/templates/task-plan.md
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-en.md
packages/vnicore/docs/usage-zh.md
```

当前实现结论：

- `V5GAnimationConfig.seed` 是必填导出字段；粒子和随机效果通过
  `particle-sampler.ts::seededRandom(seed,index,salt)` 确定性采样，因此 runtime 与编辑器
  使用同一导出时效果一致。
- `playback-sequence.ts::VNIPlayOptions` 是 timeline/range/segmented 判别联合，但当前没有
  播放期 seed 选项；`VNIPlayer.play()` 分发到三个 transport。
- `VNIPlayer` 的 affected samplers 都从 `layerInstances` 的 authored `layer.animations`
  读取 seed；`sampleProjectAtTime()` 负责时间轴/active flags，不拥有 runtime randomness。
- `VNIParticleRuntime` 缓存 live elapsed 和 drain frame；range/segmented start 会 reset，
  pool 的 `resetForPoolReuse()` 还会 reconfigure、清 display 和恢复 authored project。
- `createLoadedClone()` 共享只读 texture handle，但 player/project/transport/particle state
  独立；runtime seed state也必须维持这一边界。
- `project.particles` 当前被 `validation.ts` 明确拒绝，任务只覆盖 layer animations。
- `playRange()` 是独立 legacy convenience API，manual session 与 pool `playOnce()` 也有各自
  transport；本需求可由 `play({ mode: ... })` 完整表达，不在本任务扩张这些合同。

不需要审计完整 Git 历史；当前 public types、player、sampler、pool、测试和文档足以确认合同与缺口。

## 4. 需求解释与技术决策

### 需求解释

- “vni 里有给定随机数”解释为 layer animation 导出的 `seed`，不是新增另一种 schema 字段。
- “保证动画效果和编辑器一致”是默认兼容合同：未传参数时继续使用 authored seed。
- “play 时有参数控制”解释为扩展 `VNIPlayer.play(options)`；开关对该调用建立的新播放
  session 生效，而不是 player 构造期或全局配置。
- “忽略这个随机数”解释为 effective seeds 不使用 authored seed；并非在每次
  `seededRandom()` 调用时使用非确定随机数。
- 一次 playback seed session 包含 timeline/range/segmented 的播放、循环、排空及其间的
  pause/resume/seek/restart；只有新的播放 session 才重新选择 seeds。

### 关键决策

1. **使用 additive boolean public contract**

   ```ts
   interface VNIPlaybackSeedOptions {
     readonly ignoreAuthoredSeed?: boolean;
   }
   ```

   timeline、range、segmented play option 都继承该字段。省略和 `false` 是当前行为；
   `true` 才启用 runtime seed。字段存在但不是 boolean 时显式抛错，不做 truthy coercion。

2. **每次新播放生成一次 seed session，不逐帧随机**
   - runtime 为本次播放生成一个 base seed，再根据稳定 `layerId + animationId` 派生各
     animation 的 effective seed；派生不得读取 authored seed。
   - effective seed cache 在开始播放、发布画面前一次性 prepare；hot path 只查缓存，不在
     每帧 clone layer、遍历生成随机数或修改 Pixi display tree。
   - 同一次 session 的同一 animation 在任意时间点得到相同随机序列；loop、seek 和 drain
     因此连续且可复验。

3. **不修改 authored project 或 core sampler 默认合同**
   - `getProjectSnapshot()`、pool authored snapshot 和 export JSON 始终保留原 seed。
   - player 为 affected sampler 提供只读 playback layer view，view 仅替换 effective seed；
     project sampling、validation 和所有非随机动画仍读取 authoritative project。
   - 不在 sampler 中引入 ambient/global mode；core 单测和其它直接调用者继续完全确定。

4. **明确 session 与 transport 生命周期**
   - timeline 首次启动、从 complete 重新开始，以及每个 range/segmented `play()` 都是新
     session；`ignoreAuthoredSeed: true` 在这里生成新 seeds。
   - pause 后的 `play()` 是恢复当前 session，不重新 seed；`seek()`、`restart()` 和
     segmented end request 也保留当前 effective seeds。
   - 新 session 省略参数时切回 authored 模式；已在播放中的 no-op `play()` 不改变当前模式。
   - `resetForPoolReuse()`、clone 初始化和 destroy 清除 runtime seed cache，避免 lease 间污染。

5. **首版只扩展 `VNIPlayer.play()`**
   - `play({mode:"range", ...})` 已覆盖 legacy `playRange()` 的能力，因此本任务不同时扩展
     `playRange()`、manual session 或 pool lease `playOnce()`。
   - 这样可满足明确需求且避免三个相邻 public API 形成不同的隐式随机生命周期；若 consumer
     后续确实需要这些入口，再以同一 seed-session contract 单独扩展。

## 5. 职责与合同

- **playback-sequence types**：定义三种 `play()` mode 共用的可选 seed control，不修改 range/
  segmented 时间语义。
- **VNIPlayer**：校验开关、判定新 session 或 resume、创建/缓存/清除 effective seeds，并把
  playback layer view 传给 affected samplers。
- **core samplers**：继续只按收到的 `animation.seed` 做纯确定性采样；不感知“authored/runtime”
  模式，也不读取 ambient randomness。
- **particle runtime**：继续拥有 live elapsed 和 drain；接收 player 已准备的 sampling layer，
  不独立 reroll。
- **pool/clone**：保持 mutable state 隔离；reset 后只剩 authored 模式，不共享或缓存前一
  lease 的 runtime seeds。
- **失败策略**：非法 boolean 在修改 transport/seed/display state 前失败；seed session prepare
  失败不得留下半切换模式或半清空 particle state。
- **禁止行为**：不改 project seed、不写回 manifest、不每帧 `Math.random()`、不复用同一 seed
  给所有 animation、不静默忽略非法配置、不为 Cocos/Viewer 复制实现。

## 6. 文件范围

### 预计新增

```text
tasks/144-vnicore-playback-authored-seed-control-<utctime>.md
```

如 seed session helper 拆分能显著保持 player 职责清晰，可新增：

```text
packages/vnicore/src/pixi/playback-seed-session.ts
packages/vnicore/tests/pixi/playback-seed-session.test.ts
```

也可将小型 helper 和测试并入现有 player 文件；报告记录实际选择。

### 预计修改

```text
packages/vnicore/src/core/playback-sequence.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/core/playback-sequence.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-en.md
packages/vnicore/docs/usage-zh.md
```

若只读 playback layer view 需要显式穿过 particle runtime，可最小修改：

```text
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/tests/core/particle-runtime.test.ts
```

### 原则上不应修改

```text
docs/anieditor5/**
packages/anieditorv5runtime-cc/**
apps/anieditorv5viewer/**
packages/rendercore/**
packages/vnicore/src/core/*-sampler.ts
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/pixi/manual-playback.ts
packages/vnicore/src/pixi/vni-player-pool.ts
packages/vnicore/tests/fixtures/**
assets/**
docs/agent-rules/**
AGENTS.md
pnpm-lock.yaml
```

若执行时必须扩展 legacy/manual/pool API、修改 schema 或让 sampler 感知 ambient random mode，
先停止说明，不得用修改计划事后合理化范围。

## 7. 实施步骤

1. **确认执行基线**
   - 重查 HEAD/status、计划、VNI runtime 规则、play types、player transport 与 pool reset。
   - 定向确认当前所有 `seededRandom(animation.seed,...)` 调用；新增效果若已进入基线，纳入
     affected sampler 清单但不扩大到无关动画。

2. **扩展并规范化 play seed 合同**
   - 在 `playback-sequence.ts` 增加共享 option type，并接入 timeline/range/segmented union。
   - 增加 strict boolean normalization/helper，保证异常在 transport state mutation 前发生。
   - 保持 `play()` 无参数、现有 object literal 和 public exports 向后兼容。

3. **实现 playback seed session**
   - 在 `VNIPlayer` 区分 fresh session、pause resume 和 already-playing no-op。
   - fresh runtime-random session 生成 base seed，以稳定 identity 派生每个 animation seed；
     fresh authored session 清除 override。
   - 一次性创建只读 sampling layer cache；不修改 `this.project`、layer instance authored
     config 或 loaded clone shared resources。

4. **接入所有 affected render path**
   - particle runtime、deterministic effects 和 shatter 从统一 playback layer view 采样。
   - range/segmented 首帧、普通 timeline、loop、live particle、end drain、deterministic
     seek/restart 使用同一 session。
   - resetForPoolReuse、clone init 和 destroy 清 cache；默认初始化帧始终 authored。

5. **补齐自动化测试**
   - core type/normalization 覆盖省略、false、true 和非 boolean failure。
   - player 覆盖默认结果与现有 authored sample 一致；runtime 模式不依赖 authored seed；
     两次 fresh play 使用不同 effective seeds。
   - 覆盖同 session 多帧/同时间重采样、loop、seek、restart、pause/resume、segmented live
     particle 与 drain 不 reroll。
   - 覆盖 project snapshot 未变、不同 animation seed 独立、fresh default session 恢复
     authored，以及 clone/pool reset 无污染；测试通过 stub seed source 避免概率性断言。

6. **文档与收尾**
   - README/API/usage 记录字段、默认值、fresh-session 边界、单次稳定性、适用效果和非目标。
   - 运行第 8 节 L2 定向命令，检查目标 diff与旧字段残留后生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 测试观察 sampler/Pixi 输出与 project snapshot，不以 private cache 形状作为合同。
- runtime 随机测试使用可控随机源或 spy，禁止依赖“两次 Math.random 大概率不同”。
- 对同一 effective seed 的相同时间采样必须精确相等；不同 fresh session 只断言受 seed
  控制的分布变化，不要求所有动画类型都产生视觉差异。
- 默认路径复用现有 editor parity fixtures，不能为了新模式改写 fixture seed 或放宽 validation。
- mock 可证明 seed/session 编排；本任务不宣称 mock 等于人工视觉验收。

### 验收级别

`L2`。任务增加 vnicore public `VNIPlayOptions` 合同，并改变 player 内跨 sampler 的播放状态；
需构建 declaration 并 typecheck 直接消费者。它不改 schema、资源、生成器、lockfile 或 release，
因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/rendercore --filter anieditorv5viewer typecheck
pnpm --filter @slotclientengine/vnicore lint
git diff --check
```

失败时先缩小到 `playback-sequence`、`vni-player`、particle runtime 或对应 sampler 的现有测试，
不立即运行根级全仓命令。

### 人工验收

`建议但不阻塞自动化完成`：

1. 使用含明显粒子或 shatter 的现有 VNI export，先连续两次
   `play({ ignoreAuthoredSeed: false })`，确认与编辑器预览及两次播放一致。
2. 连续两次 `play({ ignoreAuthoredSeed: true })`，确认两次分布不同，但单次播放、暂停恢复、
   loop 和 drain 内没有粒子跳位或闪烁。
3. 从 runtime 模式切回默认播放，确认重新匹配 authored/editor 分布。

报告必须把自动化通过与人工视觉结果分开；未执行人工项时明确记录“待复验”。

### 独立验收建议

`建议`。涉及 additive public API 和 playback session state，但不涉及 schema、credential、
外部服务、资源 ownership 或正式生成物。独立复验：

```bash
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore --filter @slotclientengine/rendercore --filter anieditorv5viewer typecheck
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell 未激活 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`。
- 下载失败后才设置 `http_proxy`/`https_proxy` 为 `http://127.0.0.1:1087` 并重试原命令。
- 本任务不新增依赖、不修改 package version 或 `pnpm-lock.yaml`。

## 10. 生成物、文档与规则

- 不修改 YAML、VNI schema、fixture 或生成 TypeScript，不应产生生成物 diff。
- `packages/vnicore/README.md` 概述默认 editor parity 与 opt-in runtime seed。
- `docs/api-zh.md` 记录精确字段、三种 play mode、validation 和 session 生命周期。
- 中英文 usage 各提供 authored/runtime 示例，并说明 runtime 模式仍在单次播放内确定。
- 现有 `vni-runtime.md` 已要求 deterministic/editor parity 和 runtime hot-path cache；本任务
  不改变稳定职责边界，不修改领域规则或根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后以 UTC 创建：

```text
tasks/144-vnicore-playback-authored-seed-control-<utctime>.md
```

时间戳：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现、实际文件、关键决策/偏差、验收命令结果、人工验收状态和剩余风险；
除非验收升级为 L3，不收集无关 coverage、全仓统计、完整历史或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 若 runtime seed 在 restart/seek/loop/drain 边界被错误重建，会出现肉眼可见跳变；必须用
  session 生命周期测试保护。
- 若只接入 particle sampler 而遗漏 effect/shatter，同一个开关会产生部分随机、部分 authored
  的混合语义；执行时以实际 `seededRandom(animation.seed,...)` 搜索结果为闭包。
- shallow playback layer view 若被 sampler 或 consumer 修改，会污染后续帧；cache 必须只读，
  project snapshot 测试必须确认 authored seed 未变化。
- 播放期随机无法复现某次线上视觉；本任务不承诺 replay token，需复现的 consumer 应继续使用
  默认 authored seed，未来如需 numeric override 应另立合同。

### 假设

- 用户所说的随机数是当前 layer animation 的 `seed`；仓库代码和编辑器 reroll 流程支持此解释。
- “忽略”要求每次新播放可变化，但单次播放内部仍确定；逐帧随机会破坏动画连续性和 editor/runtime
  sampler 架构，因此不采用。
- 当前需求只要求 `VNIPlayer.play()`；legacy/manual/pool 入口不自动扩大。

### 待确认

无。

## 13. 完成清单

- [ ] `play()` 默认和 `ignoreAuthoredSeed: false` 保持 editor/authored seed 行为。
- [ ] runtime seed 模式覆盖全部实际 seed consumer，单次稳定、fresh play 可变化。
- [ ] project/schema/fixtures 未改写，core sampler 默认合同保持确定。
- [ ] pause/resume、seek/restart、loop/segmented/drain 与 clone/pool lifecycle 已覆盖。
- [ ] public declaration、README/API/usage 已同步。
- [ ] 指定 L2 自动化验收通过，人工结果单独记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/vni-runtime.md` 和本计划；
2. 核对 Git 基线与工作区，保留无关修改；
3. 按计划实现，不另建 ambient random 或逐帧随机方案；
4. 小幅适配当前实现时在报告记录，重大 public API/范围扩张时先停止说明；
5. 只运行本计划规定的 L2 验收；
6. 完成后生成 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
