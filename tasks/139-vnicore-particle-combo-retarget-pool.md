# 139 vnicore-particle-combo-retarget-pool 任务计划

## 1. 目标与完成定义

### 目标

为 `packages/vnicore` 增加运行时动画变体与实例池：宿主从已初始化模板借出 clone，修改
`particle_combo` 目标并取得播放时间。

- 默认保持导出动画的名义位移速度，根据新目标距离自动计算新时长；
- 宿主也可显式指定固定时长，此时允许速度随距离变化；
- 播放结束或提前取消后，clone 归还所属模板 player 的池，恢复导出参数后可再次借出；
- `apps/anieditorv5viewer` 新增独立“目标预览”Tab，使用同一 public API 配置并播放上述变体。

### 完成定义

- [x] public API 以 `layerId + animationId` 选择 `particle_combo`，返回 fresh variant、快照、目标、
      时长、速度和 playback range。
- [x] 默认满足 `authoredSpeed = hypot(authoredTargetX, authoredTargetY) / authoredDuration`，
      `effectiveDuration = hypot(newTargetX, newTargetY) / authoredSpeed`。
- [x] fixed-duration 配置精确采用宿主给定的正有限秒数，并返回变化后的 effective speed。
- [x] manager 为每个模板提供唯一 pool；并发 clone 不共享 mutable project、transport、particle 或 tree。
- [x] clone 不重复加载 asset；texture ref-count 在任意合法销毁顺序下不提前销毁或泄漏。
- [x] `playOnce()` 自动归还；release、失败、destroy 和迟到 completion 均安全。
- [x] 归还恢复 authored 参数和全部 lease state，后续借出无残留。
- [x] Viewer 有五个可访问 Tab；“目标预览”可选 animation/目标/timing，显示结果并播放。
- [x] 不使用新 API 的 `VNIPlayer`、其它动画类型和现有 consumer 行为保持不变。
- [x] 交付 `bamboonanza_lizi.zip` 浏览器验收步骤；用户负责执行，报告不以 mock 冒充。

## 2. 范围

### 包含

- `packages/vnicore`：
  - `particle_combo` target variant 的纯函数、类型、strict validation 和 timing result；
  - 已加载 player 资源共享、clone 初始化、lease reset/release 和 per-player pool；
  - 显式 `VNIPlayerPoolManager`，统一管理多个 player pool；
  - public exports、单测和 README/API 文档。
- `apps/anieditorv5viewer`：
  - 新“目标预览”Tab、严格表单、computed descriptor、pool preview 状态和 lifecycle；
  - Viewer 自动化测试、样式和 README。
- `docs/agent-rules/vni-runtime.md`：
  - 补充模板不可变、每 player 独立池、manager ownership 和归还重置的稳定 runtime 边界。
- 下载目录真实样本的浏览器验收步骤；实际操作由用户负责。

### 不包含

- 不修改 VNI editor、VNI JSON schema、bundle manifest、版本号或导出器。
- 不把动态目标写回 ZIP、JSON、asset manifest 或模板 `VNIProjectConfig`。
- 不支持其它动画的运行时改参；未知或不支持类型显式失败。
- 不修改游戏业务 consumer，不新增任意 animation params patch API 或静默按名称选首个动画。
- 不保证 curve、随机 spawn、stagger、easing 下每个粒子的实际弧长速度恒定；首版只保持名义速度。
- 不引入隐式 singleton、隐藏 renderer/canvas、DOM bridge、后台预热线程或无界空闲缓存。
- 不把下载样本复制成正式 fixture；未来若纳入，另按三处同步规则执行。

## 3. 制定计划时的基线

```text
UTC: 2026-07-30T10:10:59Z
HEAD: 272a9e94efd73c8c43bfdab5f098871a1d3cdffa
branch: detached HEAD
git status --short --untracked-files=all: clean
```

执行时保留用户后续产生的无关修改，不 reset、checkout、stash 或顺手格式化。

实际读取的规则与模板：

```text
AGENTS.md
docs/agent-rules/vni-runtime.md
tasks/templates/task-plan.md
```

`packages/vnicore` 下没有更深层 `AGENTS.md`。

当前实现结论：

- `core/types.ts` 直接保存 duration/target；当前没有 runtime variant/clone contract。
- `particle-sampler.ts` 把 target 当 emitter 局部偏移，Pixi 才反转 Y；curve/spawn/stagger 无统一弧速。
- `validation.ts` 已有“校验、structured clone、改声明字段、复验”的模式。
- `vni-player.ts` 逐 player 加载 texture/tree；mutable transport/listener/particle state 必须整体 reset。
- `particle-runtime.ts` constructor 缓存 `maxDrainDuration`，variant 改时长后必须 reconfigure。
- rendercore 有私有 player cache，但不支持改 target，也不是 vnicore public pool；本任务不改它。
- Viewer 当前四个 ARIA Tab，`cyclicPanel` 在“播放”内；profile switch 统一销毁 player/app/Blob URLs。

真实样本基线：

```text
path: /Users/zerro/Downloads/bamboonanza_lizi.zip
SHA-256: bbbaf520f08306bcbafe11ea54e8d345f3f5a23ea6a29676455a362876246172
size: 85,313 bytes
bundle version: VNI_0.042
runtime profile: runtime_100
runtime project: runtime_100/bamboonanza_lizi.json
stage: 2000 x 2000, duration 2s
layerId: layer_image_mr0hscjx_a
animationId: anim_module_mr0ht7ml_b
animation type: particle_combo
startTime: 0
authored duration: 1.5s
authored target: (600, 0)
authored nominal speed: 400 VNI units/s
```

执行前核对 hash/manifest/runtime JSON；不一致时 synthetic 测试可继续，浏览器验收标为阻塞。

## 4. 需求解释与技术决策

### 需求解释

- “目标位置”是 `targetX/targetY` 的 layer-local VNI offset；不接收 Pixi 坐标或暗中翻转 Y。
- “从动画配置的位置算速度”定义为导出 target offset 欧氏距离除以 `animation.duration`。
- 默认 timing mode 是 `preserve-authored-speed`；新距离变短/变长时，返回时长同比缩短/增长。
- “强制连时间一起改掉”用 `fixed-duration` 判别配置表达；返回 effective speed 反映速度变化。
- timing result 返回 `startTime/endTime/durationSeconds`，可直接播放。
- 已加载 player 不被 retarget；clone 持有 mutable runtime project，归还时从 authored snapshot 恢复。
- Viewer 的“目标预览”只显示 public capability 返回的 animation；无支持项时显示“不支持”并禁用预览。

### 关键决策

1. **纯 variant contract 与 Pixi pool 分层**
   - core 提供 `createVNIParticleComboTargetVariant()`，输出 fresh validated project 与 timing。
   - Pixi pool 复用该函数；不需要 pool 的 consumer 也可构造一次性 variant。

2. **首版 timing 类型采用判别联合**

   ```ts
   type VNIParticleComboTimingMode =
     | { readonly mode: "preserve-authored-speed" }
     | { readonly mode: "fixed-duration"; readonly durationSeconds: number };
   ```

   `timing` 省略时等价于 preserve mode。坐标和计算结果必须 finite，duration 必须大于 0；不接受
   coercion、负数、`NaN`、Infinity 或 silent clamp。

3. **自动模式只使用 authored baseline**
   - 每次自动计算都用模板 authored values，不能用上一次 lease 的 modified values。
   - authored distance 或新 distance 为 0 时无法得到正有限自动时长，显式失败；零距离需求必须使用
     `fixed-duration`。
   - 新 animation end 超过 stage 时只扩展 stage；缩短时不裁 stage。播放使用返回 range。

4. **显式 manager，不创建隐藏全局 singleton**
   - `VNIPlayerPoolManager` 由 app/runtime owner 创建和 destroy。
   - manager 按模板 identity 唯一分池；同一模板不能同时登记到第二个未销毁 manager。
   - `maxIdleInstancesPerPlayer` 有限；并发可临时超限，归还时超额实例 destroy。

5. **clone 共享只读加载资源，不共享 mutable runtime**
   - 从 `VNIPlayer.init()` 的 texture load 结果提取内部 ref-counted loaded resource handle。
   - template/clones 共享 source/派生 textures；各 clone 单独创建全部 mutable runtime/display state。
   - source texture 仍由 Pixi Assets/宿主拥有；vnicore 派生 texture 只在最后一个 handle ref 释放时
     destroy。clone 不重新调用 URL load/decode。

6. **lease 是唯一归还凭证**
   - `acquire()` 返回 `{ player, timing, playOnce, release }`；`playOnce()` 完成后自动归还，手工
     transport 必须在 `finally` 中 release。
   - 每次 borrow 使用 generation token；迟到的 completion/cancel 只能结束自己的 lease，不能操作
     已经重新借出的同一实例。
   - release 幂等，清除全部 lease state、恢复 authored fields、seek 初始帧并 detach 后才进入 idle。

7. **Viewer 新 Tab 只负责编排**
   - 五个 Tab 保持现有 ARIA、方向键、Home/End 和切 Tab不中断播放的合同；项目加载后仍默认进入“播放”。
   - Tab 输入 animation、target X/Y 和 timing；fixed 才启用 duration，并显示 timing/pool descriptor。
   - 预览停止其它 transport、隐藏模板并 `playOnce()`；结束恢复模板。切项目先释放 lease、销毁旧 pool。

## 5. 职责与合同

- **core variant builder**：精确定位、校验、保存 authored snapshot、计算 timing、扩展 stage、复验 project。
- **VNIPlayer loaded resources**：拥有 ref-counted texture handle 和 clone 入口，不引入 renderer/DOM ownership。
- **per-player pool**：拥有 entries、idle 上限、generation、reset/recycle 和 template destroy subscription。
- **manager**：拥有 registry、重复登记检测、stats/`destroyPool()`/`destroy()`，不拥有模板 player。
- **lease/consumer**：可设置 clone display 或手动 update；不能改模板/texture。`playOnce()` 自动归还，
  手工 transport 必须 release。
- **Viewer**：拥有 manager、当前 preview lease、表单和状态；只调用 public capability/pool contract。
- **失败策略**：
  - 非法 template/ref/type/manager/timing/target 和 clone/init 失败均显式报错；
  - acquire 失败不占 pool slot、不挂 display、不增加悬空 texture ref；
  - manager/template destroy 使 lease 失效并 cleanup；迟到 release 只做幂等收尾。
- **禁止行为**：修改输入、猜动画、JSON round-trip、重载图片、共享 mutable runtime、无界 cache、
  隐藏 singleton、placeholder 或降级到原目标。

## 6. 文件范围

### 预计新增

```text
packages/vnicore/src/core/particle-combo-variant.ts
packages/vnicore/src/pixi/vni-player-loaded-resources.ts
packages/vnicore/src/pixi/vni-player-pool.ts
packages/vnicore/tests/core/particle-combo-variant.test.ts
packages/vnicore/tests/pixi/vni-player-pool.test.ts
```

### 预计修改

```text
packages/vnicore/src/core/index.ts
packages/vnicore/src/pixi/index.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-en.md
packages/vnicore/docs/usage-zh.md
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/styles.css
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/README.md
docs/agent-rules/vni-runtime.md
```

helper/测试可按职责并入现有文件；报告记录小幅偏差。

### 原则上不应修改

```text
docs/anieditor5
packages/anieditorv5runtime-cc
packages/rendercore
apps/game001
apps/game002
apps/game003
assets
pnpm-lock.yaml
packages/vnicore/tests/fixtures/export
```

若必须修改 schema、编辑器、其它 sampler 或 consumer，应先停止说明。

## 7. 实施步骤

1. **确认执行基线与真实样本**
   - 核对 HEAD、工作区、规则、player lifecycle 和 particle drain cache。
   - 复验 ZIP hash、manifest、runtime project 和指定 `layerId/animationId`；不解包进仓库。

2. **实现纯 particle_combo variant 合同**
   - 新增 public types、`createVNIParticleComboTargetVariant()` 和 capability descriptor/list query。
   - 从 fresh validated clone 定位 animation，按 authored baseline 计算 timing，只改声明字段并复验。
   - timing descriptor 固定包含 authored/effective distance、duration、speed 和 playback range。

3. **提取可共享的 loaded player resources**
   - 将 texture/派生 matte ownership 收敛为 ref-count handle，clone 不重新加载 asset。
   - clone 使用独立 runtime/display state；init 失败 rollback display、handle ref 和 pool entry。
   - 为 `VNIParticleRuntime` 增加明确 reconfigure/reset 边界，duration 变化后重新计算 drain duration。

4. **实现 per-player pool、lease 与 manager**
   - manager 按 template identity 唯一分池，拒绝跨活跃 manager 重复 ownership。
   - acquire 优先复用 idle clone，否则从 loaded template 创建；publish 前完成 prepare/reconfigure。
   - 实现 generation-safe `playOnce()`、release、idle 上限、destroy/stats 和 authored reset。

5. **接入 Viewer 目标预览 Tab**
   - controls 增加第五个 Tab、animation/target/timing 表单、computed descriptor、状态和错误展示。
   - main 创建 manager，使用 pool public capability 枚举/预览；normal/manual/target transports 互斥。
   - preview completion、重新预览、upload/profile switch 和 unload 都按 lease → pool → template 顺序清理。

6. **补齐自动化测试**
   - core 覆盖 600/1.5 到 300/0.75、900/2.25、fixed、stage expansion、输入不变和 strict failure。
   - Pixi mock 覆盖共享 load、隔离/复用、stale completion、idle 上限、rollback、destroy/ref cleanup。
   - Viewer 覆盖五 Tab、表单、descriptor、pool 调用、重复预览、失败和 project cleanup。

7. **文档与真实验收**
   - README/API/usage 记录坐标、公式、fixed mode、lease 生命周期和限制。
   - Viewer README 记录新 Tab、transport exclusivity、unsupported/validation 和 pool cleanup。
   - 更新最小 VNI runtime 规则；整理真实 ZIP 的浏览器验收步骤交给用户，不由执行会话启动浏览器。

8. **定向验收与报告**
   - 运行第 8 节 L2 命令；失败先最小化到 core math、pool lifecycle 或直接 consumer declaration。
   - 报告区分自动化结果与“浏览器验收由用户负责”；不 commit、不 push、不创建 PR。

## 8. 测试与验收

### 测试原则

- core math 使用 synthetic minimal project，可重复保护公式，不依赖开发机 Downloads。
- pool 测试观察 load 次数、identity、state 隔离、resource ref 和 destroy。
- Viewer 测试 mock public manager/pool，不解析 `params` 或访问 private Pixi tree。
- 真实 ZIP 只用于人工 Pixi 验收，不能让 CI 测试依赖绝对路径，也不能用 Pixi mock 冒充视觉结果。
- 不为 pool 放宽现有 project/animation validation；unsupported type 必须在创建 variant/acquire 前失败。

### 验收级别

`L2`。新增 vnicore public API 并重构 resource ownership，需 typecheck 直接 consumer；不涉及 schema、
工具链、lockfile 或 release。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore build
pnpm --filter anieditorv5viewer test
pnpm --filter @slotclientengine/rendercore --filter anieditorv5viewer typecheck
git diff --check
```

build 保护 declaration/export；Viewer test 保护新 Tab；组合 filter 覆盖两个直接 consumer。

### 用户负责的浏览器验收

用户在 anieditorv5viewer 上传 `/Users/zerro/Downloads/bamboonanza_lizi.zip`，进入“目标预览”Tab：

1. 选择唯一 `particle_combo`，依次输入目标 `(300,0)`、`(900,0)`，确认 duration 分别为 `0.75s`、
   `2.25s`，终点分别落在 layer-local 目标，模板仍为 `(600,0)/1.5s`。
2. 切 fixed `1s` + `(900,0)`，确认 effective speed `900 units/s` 且播放 `1s`，不是 `2.25s`。
3. 连续预览不同目标，确认 pool stats 显示复用且参数回到 authored baseline 后再应用。
4. 播放中重新预览、切 profile、重传 ZIP，确认旧 lease/pool/app/Blob URL 清理且无异常。

### 独立验收建议

`必须`。自动化复验由执行/独立验收会话完成；真实 ZIP 浏览器验收由用户完成：

```bash
pnpm --filter @slotclientengine/vnicore test
pnpm --filter anieditorv5viewer test
pnpm --filter @slotclientengine/vnicore --filter @slotclientengine/rendercore --filter anieditorv5viewer typecheck
```

执行会话把上述浏览器 checklist 交给用户，并在报告标记“待用户验收”或记录用户反馈；mock 不能替代。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell 未激活 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才设置 `http_proxy`/`https_proxy` 为 `http://127.0.0.1:1087` 并重试原命令。
- 本任务不新增依赖、不修改 package version 或 `pnpm-lock.yaml`。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、VNI schema、manifest 或生成 TypeScript，不应产生生成物 diff。
- 下载 ZIP 不是正式 fixture，不复制进仓库；只在报告记录实际 hash 和人工结果。
- 更新 `packages/vnicore/README.md`、`docs/api-zh.md` 和中英文 usage，明确：
  - target 坐标是 VNI layer-local offset；
  - preserve/fixed timing 的公式和 strict failure；
  - template、clone、source texture、lease、pool、manager 的 ownership；
  - 首版只支持 `particle_combo`。
- 更新最小 VNI pooling 规则；不把样本细节写入规则，不修改根 `AGENTS.md`。
- 更新 Viewer README 的第五 Tab、表单、preview lifecycle 和用户浏览器验收步骤。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/139-vnicore-particle-combo-retarget-pool-<utctime>.md
```

UTC 通过 `date -u +%y%m%d-%H%M%S` 取得。报告记录实现、偏差、命令、真实 ZIP 人工状态及风险，不
收集无关 coverage、历史或整仓统计。

## 12. 风险、假设与待确认

### 风险

- 随机 spawn、curve、stagger 和 easing 使目标欧氏距离只能定义名义速度。
- ref-count 或 rollback 错误可能提前销毁 texture、重复 load 或泄漏 async init。
- consumer 绕过 `playOnce()` 后忘记 release 会形成活跃 lease；manager 只能在 destroy 时最终清理。
- 扩展 stage 会影响按 stage duration 查询的宿主；文档必须要求使用返回 range。
- 仓库外 ZIP 可能被替换；CI 不能替代 hash 一致样本的视觉验收。

### 假设

- 修改的是 `particle_combo.params.targetX/targetY` 的 layer-local VNI 坐标。
- “速度保持”指从 `(0,0)` 到 target offset 的欧氏名义速度。
- 同一 pool 的 clones 使用同一套 asset/player options，不跨 renderer/app。
- `maxIdleInstancesPerPlayer` 由 runtime owner 显式配置，避免 vnicore 猜测业务并发量。

### 待确认

无。若需 global Pixi 坐标、真实曲线匀速或其它动画类型，属于新范围。

## 13. 完成清单

- [x] 目标和非目标已满足。
- [x] 实际修改未超范围，或偏差已在报告说明。
- [x] public API、schema、职责和资源生命周期符合计划。
- [x] 自动 timing、fixed timing、template immutability 和 pool reuse 均有直接测试。
- [x] source texture ref-count、rollback、stale completion、release/destroy 顺序均有直接测试。
- [x] vnicore/Viewer 文档和 VNI runtime 规则已按需同步。
- [x] 指定 L2 自动化已完成，真实 ZIP 浏览器 checklist 已交付用户并与自动化明确区分。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/vni-runtime.md` 和本计划；
2. 核对 Git 基线、工作区和真实 ZIP hash；
3. 按 core variant → loaded resources → pool/manager → Viewer → tests/docs 的顺序实现；
4. 小幅适配当前 symbol/文件拆分时在报告记录，公式、坐标或 ownership 变化则先停止确认；
5. 只运行计划规定的 L2 验收，不扩到整仓；
6. 向用户交付真实 ZIP 浏览器验收步骤并生成 UTC 报告，不代替用户执行；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
