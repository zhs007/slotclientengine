# 197 rendercore-awaitable-symbol-transfer-motion 任务计划

## 1. 目标与完成定义

### 目标

在 `packages/rendercore` 增加可 `await` 的 transfer scope，以 `delay/move/handle/commit` 组合独立 occurrence effect；cell 与
occurrence effect 保持两套 ownership。rendercore 负责 ticker、租约、遮罩、原子提交与失败清理。

本任务只提供中性的 rendercore 能力，不实现或接入 `game002v2` 的 CO 业务流程。

### 完成定义

- [ ] `SceneLayoutPackageRuntime` 提供由 `runtime.update()` 推进、支持 AbortSignal/destroy rejection 的 delay Promise。
- [ ] grid-cell main reel 可沿 line/多段 cubic Bezier path 移动 source，并在 duration/easing 完成后提交 replacement 或
      `-1` hole 及 target occurrence，再 resolve Promise。
- [ ] 移动中的完整 occurrence 位于 rendercore-owned transfer overlay，始终覆盖全部静止 symbol；调用方用语义层和
      非负安全整数 order 控制移动 symbol 与 reel effect/其它 moving item 的相对顺序，不直接修改 Pixi display tree/zIndex。
- [ ] 可按 pos 取得 identity-bound handle；scope 内 moving/原 target 均可播放 state、附着 typed effect、并行或插入任意
      frame-driven delay；显式 commit 后 target pos 才指向 moving，旧 target handle/effect lease 按合同失效或释放。
- [ ] 失败、abort、reset 或 destroy 不留下 detached occurrence、mask、overlay child、pending Promise 或 replacement lease。
- [ ] 现有低层 `prepareVisibleOccurrenceTransferBatch()` 增加 `sourceReplacementCode: -1` 的 exact hole 分支；非负 symbol
      replacement 和已有 consumer 行为保持不变，standard reel、spin、cascade、symbol state 和 transition 不变。
- [ ] rendercore 定向测试、typecheck/build、直接 consumer 编译检查与 `git diff --check` 通过，并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- rendercore-owned、manual-update 的 presentation delay waiter。
- grid-cell occurrence handle、单次 transfer choreography scope、显式 commit 与 Scene Layout facade。
- 独立 occurrence-effect attachment：pos 只解析初始 occurrence identity，之后随 occurrence 移动；不改变既有 cell effect。
- 严格 typed motion contract：duration、path、easing、stacking、source/target 与 source replacement/hole presentation 数据。
- line、多段 cubic Bezier path 的弧长参数化位置采样，以及 linear/CSS-style cubic-bezier 时间缓动采样。
- source/target 几何快照、完整 occurrence ownership、board mask、transfer overlay、atomic commit、abort/destroy cleanup。
- 直接保护上述 public API、motion sampling、Promise/lifecycle 和 display order 的 rendercore tests 与 README 说明。

### 不包含

- 不修改 `apps/game002v2`，不解析 CO component/routes，不编写 CO 的 `for` 循环、间隔、symbol state 名或后续业务动画。
- 不修改 `apps/game002` 现有 CO handler/controller，也不强制其迁移离开低层 transfer batch API。
- 不把 CO、WL/CN/value、server scene、operation kind 或游戏 symbol code 写入 rendercore。
- 不提供跨 operation 的通用 timeline DSL，不在 rendercore 解释多条 CO route 或业务 state/effect 名。
- 不支持 standard reel transfer，不改变 spin/cascade/dropdown 的既有运动曲线。
- 不新增 GSAP 或其它 tween 依赖，不修改 `package.json`、`pnpm-lock.yaml`、manifest、YAML、assets 或生成物。
- 不暴露 borrowed Pixi `Container`/`RenderSymbol` 给 app，也不允许 app 直接设置内部 transfer layer 或 raw zIndex。

## 3. 制定计划时的基线

```text
UTC: 2026-08-11T10:10:52Z
HEAD: ff7b860443983d403c23b179ff77f688d8192a1a
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/shared-game-runtime.md
docs/agent-rules/game002.md
tasks/192-rendercore-trusted-operation-rendering.md
packages/rendercore/{package.json,README.md}
packages/rendercore/src/reel/{types,index,render-grid-cell-reel-set,render-reel-set}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/src/slot-operation/{types,coordinator}.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
apps/game002/src/game002-reel-controller.ts
apps/game002v2/src/round-adapter.ts
apps/{game002,game002v2}/package.json
packages/gameframeworks/package.json
```

目标目录没有补充 `AGENTS.md`。当前结论：

- `RenderGridCellReelSet.prepareVisibleOccurrenceTransferBatch()` 已拥有完整 occurrence 租用、source replacement prepare、
  transfer overlay、board mask、commit/rollback/destroy；但它无条件按 `sourceReplacementCode` 创建并放回 occurrence，因而
  `-1` 会进入 symbol registry 而不能成为 hole；`setProgress()` 也固定 `easeOutCubic` 直线且由 consumer 手动逐帧调用。
- `SceneLayoutPackageRuntime.prepareMainReelVisibleOccurrenceTransferBatch()` 只透传低层 transaction，不提供 duration、path、
  easing、AbortSignal 或 awaitable completion。
- 现有 `GridCellEffectController` 是 cell-coordinate attachment；新 occurrence attachment 必须独立，复用 Scene Layout exact
  Spine/VNI runtime resource（VNI 可含粒子），不能改变 cell effect 的固定坐标语义。
- 当前 transfer layer 固定在 cell/effect layer 上方，moving symbol 只使用自身 `renderPriority`；调用方无法在不接触 display
  tree 的情况下表达移动表现的语义层级。
- `apps/game002/src/game002-reel-controller.ts::transferVisibleOccurrences()` 当前组合 `waitForFrame()`、barrier 和手动 progress；
  这是已有 consumer，任务 197 不迁移它。`game002v2` 目前没有 CO 接入。
- Scene Layout runtime 由宿主持续调用 `update(deltaSeconds)`；`game002v2` 已在 Pixi ticker 中对大 delta 分片，新的 delay 与
  movement 应复用这一个时间源，不能另建 RAF/ticker。
- slot-operation coordinator 已有 frame-driven `context.delay()`，但 `game002v2` 是不使用 coordinator 的 direct flow；
  新 delay 必须是中性的 Scene Layout runtime 能力，不能要求 app 引入 operation coordinator。
- `rendercore` 当前不依赖 GSAP；workspace 中 GSAP 只由 `pixiani` 和 demo 使用。现有 transfer 不需要通用 timeline 引擎，
  当前代码和合同足以确认方案，不需要扩大 Git 历史审计。

## 4. 需求解释与技术决策

### 需求解释

- 用户所说的 “symbol 移动” 是移动 source 格当前完整 render occurrence，而非复制 texture/sprite；target 完成边界获得
  同一 occurrence 及其 presentation value。source 使用调用方显式提供的 replacement code/value，或以 canonical
  `sourceReplacementCode: -1` 成为空格；hole 分支要求 `sourceReplacementPresentationValue: null`。
- “有间隔”由独立可等待 delay 表达；游戏决定循环顺序和每次间隔，rendercore 不接收 CO routes 或自动 stagger。
- “曲线、直线、时间的缓动”拆成两个正交合同：path 决定空间轨迹，easing 决定 raw elapsed progress 如何映射到 path
  progress。两者均由 strict discriminated union 表达，未知 kind 和非法数字原位失败。
- “覆盖不移动 symbol”是 rendercore 的硬保证；配置不是任意 Pixi zIndex，而是 semantic stacking layer + local order，
  从而不泄露内部 cell/renderPriority 计算。
- pos getter 返回当前 committed occurrence 的受控 handle，不返回 `RenderSymbol`；handle 可读 snapshot/geometry、await state、
  修改 presentation value，但不暴露 Container/zIndex/destroy，occurrence 被替换、release、回池或 runtime destroy 后显式失效。
- 飞行期间 source occurrence 只属于 overlay，target pos 仍映射原 target；scope 提供 `delay/move/moving/target/commit`。
  `handle.attachEffect()` 是可在 scope 外使用的独立能力，不是 move 参数或 CO timeline DSL。
- 本计划中的调用形态只用于定义 rendercore contract，不是 `game002v2` 实现：

  ```ts
  await runtime.runMainReelVisibleOccurrenceTransfer(input, async (tx) => {
    await tx.delay(beforeMs);
    const trail = await tx.moving.attachEffect({ key: "trail", kind: "vni" });
    await Promise.all([tx.move(motion), trail.play()]);
    await tx.delay(arrivalGapMs);
    await Promise.all([tx.moving.playState(arrival), tx.target.playState(hit)]);
    await tx.commit();
  });
  ```

### 关键决策

1. **不用 GSAP，复用 rendercore manual-update 时钟**
   - GSAP 不在 rendercore dependency contract 中；为一个 position tween 引入依赖和另一套默认 ticker 会扩大 lockfile、
     pause/destroy/测试时钟边界。
   - delay 与 movement 都由 `SceneLayoutPackageRuntime.update()` / `RenderGridCellReelSet.update()` 推进，低 FPS 分片、
     symbol player update、abort 和 destroy 使用同一生命周期。
   - 若未来出现多轨 timeline、标签、反向/重复等独立需求，再单独规划 tween engine，不在本任务预埋兼容层。

2. **新增 scoped awaitable API，保留低层 batch API**
   - 新增 `waitForPresentationDelay()` 与 `runMainReelVisibleOccurrenceTransfer(input, choreography): Promise<void>`；scope
     暴露受控 `delay/move/moving/target/commit` capabilities，callback 返回前必须显式 commit。
   - reel 层提供对应 awaitable transfer 方法；Scene Layout facade 只允许 grid-cell main reel，standard reel 精确失败。
   - 已有 `prepareMainReelVisibleOccurrenceTransferBatch()`、`start()/setProgress()/commit()` 不改签名或既有非负 code
     运动结果；为它补上 `sourceReplacementCode === -1` 的 additive hole 语义，避免任务 197 迫使 `game002` 迁移。

3. **path 与 easing 使用 strict data，不接受任意回调**
   - path 为 `line | cubic-bezier-path`；后者由至少一段 `{control1, control2, end}` 组成，首点取 immutable source geometry，
     最后一段必须精确结束于 immutable target geometry，全部点使用 main reel local authored pixel 坐标。
   - prepare 阶段为多段 path 建立确定性弧长 lookup table；update 先按累计距离定位 segment/local progress，再采样位置，
     不按 segment 数量平均分配时间，避免长短段交界处出现速度跳变。
   - easing 为 `linear | cubic-bezier`；cubic-bezier 使用显式 `x1/y1/x2/y2`，time-axis control `x1/x2` 限制在
     `[0,1]`，其它坐标要求 finite，并保证 progress `0/1` 精确命中 source/target。
   - 调用方需要按格几何计算 control point 时，复用现有 `getMainReelSymbolGeometrySnapshots()`，不读取 display tree。

4. **语义 stacking 代替 raw zIndex**
   - motion contract 要求 `stacking.layer` 为 `above-symbols | above-effects`，两者都高于所有静止 cell/symbol；
     `stacking.order` 为非负安全整数，用于同一语义层内的 moving item 稳定顺序。
   - rendercore 将语义层映射到内部 zIndex band，并以请求稳定序号打破同 order 平局；symbol manifest `renderPriority`
     继续只决定稳定盘面顺序，不被写回或篡改。

5. **occurrence effect 独立于 transfer，scope 只组合能力并控制 commit**
   - 方法开始先冻结 source/target geometry 与 occurrence identity；非负 replacement code 先 prepare occurrence，`-1`
     则记录 exact hole commit 且不创建假 occurrence，再做任何 display mutation。
   - `tx.move()` 用独立 path/time-easing 推进 moving；任意 `tx.delay()` 使用同一 update clock。到达前 source lookup 报
     leased、target pos 仍返回原 occurrence；moving/target handle 可各自 await state/effect，允许 `Promise.all` 并行。
   - `occurrenceHandle.attachEffect()` 接受 exact Spine/VNI resource、局部 transform、layer/order；attachment 按 occurrence
     identity 跟随移动，effect 自己定义拖尾/粒子/光环逻辑并提供 awaitable play/stop/detach。
   - `tx.commit()` 唯一一次原子提交 source replacement/hole 与 target moving occurrence，并使旧 target handle stale；callback
     无 commit/reject/abort 时回滚 transaction。attachment 独立 cleanup：detach、identity release/pool 或 runtime destroy。
   - 同一 reel 同时只允许一个 transfer transaction；游戏需要有间隔的顺序移动时逐次 await。rendercore 不依据已改写
     target 反查先前 route，也不对业务 route 合法性做 scene/code/value continuity 复核。

6. **delay 与 transfer 都有明确中断语义**
   - 输入和资源 prepare 失败发生在 mutation 前并返回 rejected Promise；未知 path/easing/layer、非法 duration/order、
     replacement code 小于 `-1`、`-1` 携带非 null value、越界/空 cell、source=target、已有 active transfer均显式失败。
   - abort/reset/destroy 中断当前未完成 transfer，恢复当前租用 occurrence、释放 replacement、移除临时显示并 reject；
     已经完成并 resolve 的前序调用不倒放，符合 app-owned fail-stop await 链。
   - delay 允许并存多个 waiter，不占用 reel transaction；abort/destroy 拒绝对应 waiter。delay 完成的同一 update slice 不把
     剩余 delta 偷渡给随后在 microtask 中创建的 movement。

## 5. 职责与合同

- **游戏 app**：拥有 CO component/routes、循环顺序、间隔、source replacement 或 hole/output 业务事实、motion 参数、
  后续 symbol state 名和 fail-stop 调用链；任务 197 不提供 app 实现。
- **Scene Layout facade**：保留既有 cell effect，新增 pos→occurrence attachment、delay 与 scoped transfer；两类 effect 不 alias。
- **rendercore reel runtime**：拥有 geometry snapshot、occurrence/replacement/hole lease、sampling、overlay、commit 与 cleanup。
- **数据/API**：duration 使用 finite positive milliseconds；坐标、control point、Bezier 参数必须 finite；order 必须为非负
  safe integer；replacement code 只接受 `-1` 或可创建的非负 symbol code，`-1` 必须配 null value；所有 public input 在保存
  前复制并冻结，unknown union member 不 fallback。
- **资源生命周期**：scope 拥有 transfer occurrences；attachment handle 独立拥有 effect player。occurrence release/pool/destroy
  自动 detach，显式 detach 幂等；cell effect 继续由 cell controller pool/cancel/destroy 管理。
- **失败策略**：runtime/reel phase 冲突、非法几何/motion、缺失 occurrence/output symbol resource、abort/destroy 立即 reject；
  不猜 path/easing、不回退直线/默认 order、不吞错、不继续后续 await 链。
- **禁止行为**：shared code 识别 CO 或 symbol code、app 手写 Pixi tween/display reparent、GSAP/RAF 第二时钟、raw zIndex、
  placeholder/fallback、在 renderer 重算 server route 或 output continuity。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/reel/visible-occurrence-transfer.ts
packages/rendercore/tests/reel/visible-occurrence-transfer.test.ts
tasks/197-rendercore-awaitable-symbol-transfer-motion-<utctime>.md
```

新文件保存 scope/handle/occurrence-effect 与 sampler；实现可拆文件，但 cell/occurrence effect contract 不得合并。

### 预计修改

```text
packages/rendercore/README.md
packages/rendercore/src/reel/{types,index,render-grid-cell-reel-set}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
```

如 facade interface 实际由相邻 scene-layout export 文件声明，可在 `packages/rendercore/src/scene-layout/` 内做最小同义
调整并在执行报告记录。无需修改已有领域规则：`shared-game-runtime.md` 已明确 relocation 快照、租约、单一异步调用和
cleanup owner，`game002.md` 已明确 CO 业务调用链属于 app。

### 原则上不应修改

```text
apps/game002/**
apps/game002v2/**
packages/{logiccore,gameframeworks,uiframeworks,pixiani,vnicore}/**
assets/**
pnpm-lock.yaml
package.json
docs/agent-rules/**
```

执行时若必须修改 consumer、依赖/lockfile、manifest/schema、standard reel 或通用 operation coordinator，属于明显扩大
范围，必须先停止说明，不能通过改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线**
   - 重新读取根/领域规则、本计划、HEAD 和完整工作区状态；保留执行时出现的用户无关修改。
   - 复核 transfer batch、package runtime update/destroy 和 tests 的当前签名；若 public contract 已变化，判断是否只需
     小幅同义适配，否则停止重新确认范围。

2. **建立纯 motion 合同与 sampler**
   - 在 reel public types 声明 delay/transfer/motion/path/easing/stacking options，所有 nested input 使用 readonly 类型。
   - 实现严格 normalization、CSS cubic-bezier time sampling、line/多段 cubic path 与弧长 lookup；确保端点精确、输入
     不可变且 unknown/NaN/Infinity/非法 duration/order/空 segment 显式失败。
   - 用纯单测固定 line/单段/多段 path、不同段长的等距离采样、easing 映射、端点和 strict failures。

3. **实现 awaitable reel transfer scope**
   - 复用现有 transfer ownership/commit primitives，开始前一次性捕获 source/target geometry 与 occurrence identity，
     非负 code prepare source replacement；改造低层 batch 使 exact `-1` 不分配 occurrence，并在 commit 将 source 标为 hole，
     再进入 active state。
   - `RenderGridCellReelSet.update()` 推进 scope delay、motion、occurrence/effect players；move 完成只进入 arrived，不自动
     commit。callback 必须调用一次 `tx.commit()`，外层才 resolve；已有 manual batch 的 fixed straight/ease-out 不变。
   - 把 active transfer 纳入互斥 mutation、reset 和 destroy；abort/error 路径统一 rollback/reject，cleanup 保持幂等。

4. **接入独立 occurrence attachment、Scene Layout facade 与 clock**
   - 增加按 pos 获取受控 occurrence handle 与 grid-cell-only transfer facade；handle 复用既有 snapshot/state/value 能力，
     但按 identity/generation 校验 stale，ready、standard-reel、destroyed 与 active conflict 原位失败。
   - 增加由 package runtime `update()` 推进的 delay waiter 集合，支持 AbortSignal、多 waiter、完成移除和 destroy 全量
     reject；不创建 RAF、ticker 或 wall-clock timer。
   - 用 exact Spine/VNI resource 创建 occurrence-owned attachment，按 identity 同步 geometry；effect 决定拖尾/粒子表现，
     play/stop/detach/drain 可等待且幂等。保持 `GridCellEffectController` 固定 cell 行为不变。
   - 确认 host-owned main reel 分支仍由唯一 owner 推进 movement；不得让 package runtime 与 host 对同一 reel double-update。

5. **补齐 lifecycle、顺序和 facade 测试**
   - 验证 moving 期间 source leased、target pos 仍为原 occurrence；scope 可交错 delay/move、并行操作 moving/target 和附着
     Spine/VNI 粒子 effect；显式 commit 后 pos/scene/value/identity 一致，覆盖 replacement 与 `-1/null` hole。
   - 验证 line/单段及多段 cubic path 与 easing 的 runtime 中间位置、跨 segment 速度连续性、moving overlay 覆盖静止
     symbol、两种 semantic layer 和 local order 的稳定关系。
   - 验证 code 小于 `-1`、`-1` + 非 null value 及其它 invalid input/preflight 不 mutation；abort、reset、destroy、update
     throw、重复 active transaction 均 reject 且无 mask/child/lease/waiter 泄漏；已有低层 batch tests 保持通过。
   - 验证 cell effect 不跟 symbol、occurrence effect 跟 identity 跨 move/commit、resource/order/drain cleanup 与 stale failure。

6. **文档与收尾**
   - 更新 rendercore README 的 Scene Layout API，说明单一宿主 update、path/easing/stacking 坐标语义、await completion 与
     简短 app-owned loop 示例，并明确不含业务 sequence runner。
   - 运行 L2 定向验收；失败先最小化到 motion/reel/facade，不扩张为全仓测试。
   - 检查 diff、旧 manual API parity、无 app/lockfile 变化，生成任务 197 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 纯 sampler 测试使用固定数值，不依赖 RAF、真实时间、GSAP 或浏览器计时误差。
- runtime 测试只通过显式 `update(deltaSeconds)` 推进，分别覆盖正常路径、低 FPS 分片、strict failure、abort/reset/destroy。
- 直接检查 scene/presentation value、Promise settle、mask/overlay/ownership 与相对 display order；编译成功不能替代这些
  lifecycle/视觉结构断言。
- 不读取 game002 assets，不把 CO 业务 fixture 放进 rendercore shared tests。

### 验收级别

`L2`。原因是任务新增 rendercore/Scene Layout public API，并由 `game002`、`game002v2`、`gameframeworks` 直接依赖；虽不
修改 consumer，仍需验证声明产物和现有调用编译兼容。无需 L3：不修改根工具链、workspace、lockfile、正式资源或 release。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/visible-occurrence-transfer.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks --filter game002 --filter game002v2 typecheck
git diff --check
```

定向 vitest 不默认收集 coverage；rendercore build 用于验证 public declaration/export。consumer typecheck 只证明既有直接
依赖兼容，不授权修改 consumer。失败时先运行单个 test file/case 定位，不立即运行根级命令。

### 人工验收

本任务不要求在 `game002v2` 看到 CO 效果，因为 app 接入明确不在范围。若执行者提供最小 rendercore harness，可人工确认
直线/Bezier、moving 粒子附着和双 occurrence 落地效果，但该观察不能替代自动化 transaction/lifecycle tests。

### 独立验收建议

`建议`。涉及跨包 public contract、manual-update Promise、occurrence ownership、异步 cleanup 和 destroy。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/visible-occurrence-transfer.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter game002v2 typecheck
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；当前 shell 若没有 Node：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只运行 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试原命令。
- 本任务不新增 GSAP 或其它 dependency，不应修改 package manifest/lockfile。若实现必须引入 tween engine，先停止并说明
  manual-update/lifecycle 无法满足的具体证据，不能直接安装。

## 10. 生成物、文档与规则

- 没有 YAML、manifest、资源或生成 TypeScript 变化，不运行 generator/parity checker，也不产生新生成物。
- 更新 `packages/rendercore/README.md` 的 public workflow、时钟与 lifecycle 说明。
- 不更新根 `AGENTS.md` 或领域规则：现有 relocation、ownership、app/shared 职责已经覆盖本任务；只有执行发现稳定职责
  合同确有冲突时先说明，不以任务细节扩写规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/197-rendercore-awaitable-symbol-transfer-motion-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 API/文件、path/easing/stacking 与 cleanup 决策、计划偏差、实际
命令结果、未做的 app 视觉接入和剩余风险；不收集无关 coverage、完整历史、全仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- Bezier point 必须固定为 main-reel local authored pixel；弧长 lookup 精度固定并测试，不能随帧率改变采样结果。
- moving occurrence 的 Spine/VNI/image-string 必须在 transfer 期间继续 update；漏更或 double-update 会造成动画停顿或
  加速，需用计数型 fake player 和 runtime owner 分支测试。
- semantic layer 映射若与 effect/cascade 内部 band 冲突会破坏遮挡；实现不能让 caller order 越过层边界。
- abort/reset 发生在完成临界点时可能竞争 commit；active transaction 必须只有一次 settle，先确定状态再 resolve/reject。
- scope 必须 await 原 target 工作再 commit；旧 target release 会自动结束其 occurrence attachment。期间拒绝结构性 mutation。
- sequential app 调用是多个独立 transaction；rendercore 不替 app 验证跨调用 CO route 的业务冲突。调用方必须在业务
  边界提供已决定且适合顺序执行的 routes。

### 假设

- 目标是 grid-cell main reel；现有 CO 场景不要求 standard reel transfer。
- 每次 public movement 调用处理一个 source/target，游戏用 `for` + `await` 实现有间隔顺序；并行 batch 继续使用已有低层
  API，任务 197 不设计业务 batch timeline。
- source 到 target 的 presentation 语义沿用现有 transfer：target 获得完整 source occurrence，source replacement 由调用
  方显式提供；exact `-1/null` 表示 source 成为 unoccupied hole，overwritten target 在成功 commit 后释放。
- 路径保持现有 board mask；曲线超出 board 的部分被裁切，本任务不新增 unmasked/out-of-reel 飞行动画。

### 待确认

无。接口的游戏侧参数值、CO route 顺序、间隔、具体曲线和后续 animation state 由用户之后实现 `game002v2` 时决定，不是
任务 197 的阻塞项。

## 13. 完成清单

- [ ] rendercore delay 与 grid-cell awaitable transfer public API 已完成，game002/game002v2 未修改。
- [ ] line/Bezier path、time easing、semantic stacking 和 immutable geometry snapshot 合同已满足。
- [ ] cell/occurrence effect 两套 ownership、scope delay/move/handles 与 atomic commit/stale 语义已实现。
- [ ] invalid/preflight、abort/reset/destroy、互斥 transaction 和资源 cleanup 已测试。
- [ ] 现有 manual transfer batch 增加 exact `-1` hole 分支，非负 replacement 与 spin/cascade/scene-layout 行为保持兼容。
- [ ] README、public exports/declarations 已同步，无依赖、lockfile、manifest、YAML 或生成物变化。
- [ ] 指定 L2 自动化验收通过；可选人工观察与自动化验收已区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/{shared-game-runtime,game002}.md` 和本计划；
2. 核对 HEAD、完整工作区与现有 transfer/runtime update contract；
3. 只实现 rendercore 中性 API，不修改 `game002v2` 或代写 CO；
4. 小幅文件/命名适配在报告记录，重大 scope/API/依赖变化先停止说明；
5. 只运行计划规定的 L2 定向验收，不升级到整仓；
6. 完成后生成任务 197 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
