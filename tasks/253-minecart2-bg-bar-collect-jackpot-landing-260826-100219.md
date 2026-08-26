# 253 minecart2-bg-bar-collect-jackpot-landing 执行报告

## 1. 执行基线

```text
UTC: 2026-08-26T10:02:19Z
slotclientengine HEAD: cf001e9a9ea2b2c86d9f008b1a28fab873f0f6c2
slotclientengine branch: codex/task-253-collect-jackpot
piximinecart2 HEAD: 3581a01c7423a442a365ea5631322c2c74dd3050
piximinecart2 branch: rgs
```

执行前两仓均无已有修改；slotclientengine 只有本任务计划文件。按用户要求，浏览器验收未执行，
slotclientengine 改动在本地 `codex/task-253-collect-jackpot` 分支完成并提交。

## 2. 最终实现

> 2026-08-26 用户更正：Collect 的 exact symbol 是 `CL`，不是 `CO`；Jackpot 的 exact symbol 是 `CO`，
> 不存在逻辑 `CN` 图标。以下内容已按最终合同修订。

### RenderCore shared contract

- `GameLayoutRuntimeResourceEndpoint.create()` 增加 `presentationValue?: number | null`；exact symbol factory
  在永久创建或池化 checkout 返回前通过 canonical `SymbolHandle.setValue()` 应用数值。
- 池化 symbol 每次 checkout 都重新应用本次值；省略时重置为 `null`，不会泄漏上一次使用值。非法值使创建
  reject，失败句柄被销毁；普通 runtime resource 收到该选项显式失败。
- pool 测试覆盖 `10 -> 20 -> null` 复用、invalid value、非 symbol rejection、stale/runtime destroy。
- 更新 RenderCore README、runtime address 文档及 shared/scene-layout 稳定规则。

slotclientengine 实际修改：

```text
packages/rendercore/src/scene-layout/core/runtime-address.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/tests/scene-layout/runtime-address-pool.test.ts
packages/rendercore/README.md
docs/gamelayout-runtime-addresses.md
docs/agent-rules/shared-game-runtime.md
docs/agent-rules/scene-layout.md
tasks/253-minecart2-bg-bar-collect-jackpot-landing.md
tasks/253-minecart2-bg-bar-collect-jackpot-landing-260826-100219.md
```

### Minecart2 Collect / Jackpot

- compiler 注册 `game003:collect-landing` 与 `game003:jackpot-landing`，source/final scene 候选加入 exact
  `bg-addjk`；Collect按exact CL校验，Jackpot严格校验component、唯一scene、pos、non-target drift、目标CO和正整数value。
- Collect 总是生成专用 landing；完整 Feature 后按配置 `collectSweepStepSeconds=0.12` 对第一列
  `(0,0)..(0,4)` 串行播放五次 pooled `Topick_Loop`，扫完才允许停轴。只选择第一列最终 CL；无目标走普通
  landing，有目标使用CL preview和Topick Start/Loop/End，End后只清理临时对象，不做replacement或读取value。
- Jackpot 只有 exact `bg-addjk` 存在时进入特殊 landing：`bg-spin` 是 initial，`bg-addjk` 是 final；目标使用
  `bg-gencoins.otherScene` 同坐标 value。目标列落 initial 后 End，再原子替换正式 CO/value并播放
  `appear -> normal`。缺少 `bg-addjk` 时保持普通 landing。
- Feature barrier、operation registry、真实 parser-shape fixtures、资源能力/source boundary测试和 README 已同步。
- shared package 的 4 个同步文件与 slotclientengine 对应文件逐字节一致。

piximinecart2 实际修改：

```text
packages/rendercore/src/scene-layout/core/runtime-address.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/tests/scene-layout/runtime-address-pool.test.ts
packages/rendercore/README.md
apps/minecart2/config/game-runtime.manifest.json
apps/minecart2/src/config.ts
apps/minecart2/src/feature-bar-conveyor.ts
apps/minecart2/src/feature-symbol-transform.ts
apps/minecart2/src/round-adapter.ts
apps/minecart2/src/round-compiler.ts
apps/minecart2/tests/feature-bar-conveyor.test.ts
apps/minecart2/tests/feature-bar-resource.test.ts
apps/minecart2/tests/feature-symbol-transform.test.ts
apps/minecart2/tests/fixtures/game003-gmi.ts
apps/minecart2/tests/round-compiler.test.ts
apps/minecart2/tests/source-boundary.test.ts
apps/minecart2/README.md
```

没有修改资源、schema、生成物、package.json 或 pnpm-lock.yaml。两仓均执行了 frozen install 以恢复缺失或
不一致的本地依赖，lockfile 未变化。

## 3. 关键决策与计划偏差

- Collect 用户样例第一列 `(0,0)=12` 是 exact CL，因此直接覆盖 presence 路径；第三列 code 11 与 values 2/20
  是 CO 数据，不会被 Collect 误选。absence 路径由把第一列 CL 改成 CO 的真实 parser fixture覆盖。
- `runtime-address-pool.test.ts` 已覆盖 bridge、checkout prepare、invalid value 和 destroy，未再修改计划中标为
  “仅需要时”的 `package-runtime.test.ts`。
- 没有新增独立 round-adapter 测试文件；现有 registry 循环最小扩展，Minecart2 全量 76 测试和生产 build 已覆盖
  operation 编译与 handler 消费。
- 浏览器验收按用户明确要求留给用户，不以单测或 build 冒充视觉验收。

## 4. 自动化验收

通过：

```text
slotclientengine: pnpm --filter @slotclientengine/rendercore typecheck
slotclientengine: pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address-pool.test.ts
  1 file / 1 test passed

piximinecart2: pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address-pool.test.ts
  1 file / 1 test passed
piximinecart2: pnpm --filter minecart2 test
  7 files / 76 tests passed
piximinecart2: pnpm --filter minecart2 lint
piximinecart2: pnpm --filter minecart2 build
piximinecart2: changed Minecart2 files targeted prettier --check
两仓: git diff --check
shared 4 files: cmp byte parity
```

`pnpm --filter minecart2 typecheck` 未通过，但最小化后确认阻断来自任务前已有的
`packages/bridgecore`/`packages/device-detector` NodeNext 相对 import extension 和 implicit-any 错误；本任务新增的
唯一 test 类型错误已修复，之后输出不含本任务修改文件。直接依赖链中的 RenderCore build、Minecart2 production
build和全量测试均通过。

`pnpm --filter minecart2 format:check` 仍被未修改的 `src/env.ts`、`src/launch.ts`、`src/readiness.ts`、
`src/styles.css`、`vite.config.ts` 阻断；本任务全部 Minecart2 修改文件的 targeted Prettier check 通过，未顺手
格式化这些无关文件。

## 5. 待用户浏览器验收

1. Collect 用户样例：完整 Feature 后第一列五格自上而下各约 120ms、无重叠；随后 `(0,0)` 使用Topick与CL
   preview，第一列settle + End后无闪跳露出正式CL。第三列CO 2/20不触发Collect特效。
2. 第一列无CL或含多个CL：无目标时扫描后普通落停；多目标全部使用CL preview且不显示ImgNumber。
3. Jackpot 无 `bg-addjk` 保持普通 gate；用户 Jackpot 样例在 `(4,2)` 先显示值 10 preview，End 后正式
   CO/value 10 执行 `appear -> normal`。
4. 横竖屏、连续局、低 FPS、取消/刷新/退出重进无残影、旧 value、重复对象或旧 round 提交。

## 6. 剩余风险

- 120ms 视觉节奏、Topick layer/尺寸和 CL preview 到正式 CL 的无闪跳连续性只能由真实浏览器确认。
- typecheck 与 package 级 format:check 的上述基线错误仍存在，但不属于任务 253 范围。
- piximinecart2 改动保留在当前 `rgs` 工作区，未提交；用户只要求 engine 修改提交本地分支。
