# Task 124 执行报告：配置驱动的通用 Round / Cascade 编排与 Symbol Policy

- 执行时间（UTC）：`2026-07-23T09:23:10Z`
- 实际基线：`9b532ba1dc7101bcaf0ac63f4d31bf184a49781a`
- Task 123 参考提交：`fa11da1`
- 工作区状态：基于用户指定的最新主线内容直接修改；未创建任务分支，未提交
- 自动化/代码验收：通过
- 最终浏览器验收：未代用户执行，按用户要求由用户完成

## 1. 交付结论

Task 124 的代码侧范围已落地：

- round-flow / symbol policy 在 `logiccore` 中严格解析，server round 在任何画面 mutation 前编译为深度冻结的 execution plan。
- `rendercore` 新增 capability 驱动的共享 coordinator；standard 与 grid-cell 均提供真实 cascade operation，不通过隐藏 grid-cell 或最终 scene reset 冒充 cascade。
- GameViewer configured runtime 与 game002 均调用同一 `compileSlotRoundExecutionPlan` 和 `createSlotRoundCoordinator`。
- GameViewer 增加可导入/导出的完整 strict runtime config 编辑面，包含 component roles、symbol policy 和 sequential collect presentation；导出内容不包含 credential、raw server graph 或 repository。
- 真实 `crave-v2.zip` 已完成非渲染严格 readiness smoke。
- 全仓 test、lint、typecheck、build、format check 与 `git diff --check` 均通过。

最终浏览器效果、live server 场景覆盖和 console 人工检查留给用户验收，因此本报告不宣称已经完成主观视觉验收。

## 2. Schema 与版本决策

### 2.1 Round-flow / symbol policy

保持 Task 123 已提交的 `slot-round-flow` V1 语义，不静默改写：

- `components` 显式映射 initial win/remove/dropdown/refill/value component role。
- `cascade.symbols` 显式包含：
  - `emptyCode`
  - `removeExcludedSymbols`
  - `dropHeldSymbols`
  - `valueSymbols`
  - `sequentialWinCompanionSymbols`
- 所有数组必须显式存在，内部重复、未知 code、empty code 冲突、未知字段和未知版本均失败。
- 所有 code 都与 active symbol catalog 做大小写敏感校验。
- policy 字段彼此独立，不根据 symbol 名推断 wild、coin、hold 或 companion 语义。

仓库既有 V1 中 `emptyCode` 是数字 code；本任务沿用已提交类型，未按计划草案中的示意 `string` 破坏兼容性。

### 2.2 Presentation flow

scene-layout presentation 原 V1 行为保持兼容；新增 V2 表达 configured sequential collect：

- collect item 状态、结束状态、cadence、release 和 companion 都来自严格配置/manifest 能力。
- 未配置 V2 时不改变原 V1 行为。
- collect、value、popup 等能力在 session/runtime readiness 阶段预检，缺失时显式失败。

### 2.3 Execution plan

新增 immutable `SlotRoundExecutionPlan`，记录：

- initial/final scene 与 value snapshot；
- 稳定 occurrence identity；
- win group、remove decision、dropdown movement、refill creation；
- 每 step 输入/输出 snapshot；
- sequential item/companion metadata；
- renderer required capabilities；
- completion 数据。

compiler 对 component/result/otherScene、位置、scene 尺寸、hole、movement 一一映射、value continuity、新 value authority 和 companion 批准关系做完整校验，然后递归冻结输出。

## 3. Package ownership

| 层                        | 本任务后的职责                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/logiccore`      | 严格 profile/catalog parser、GMI snapshot 语义解析、immutable round plan compiler；无 DOM/Pixi/Spine/VNI                             |
| `packages/rendercore`     | capability coordinator、standard/grid-cell cascade primitives、真实 completion/update/cleanup、configured presentation/collect/popup |
| `packages/gameframeworks` | 导出模板 facade、把 package/runtime/compiler/coordinator 生命周期组合起来                                                            |
| `apps/game002`            | component/symbol policy、cash/coin/value resolver、CN 分配、anticipation/Nearwin extension、样式/layout；共享 coordinator 驱动阶段   |
| `apps/gameviewer`         | strict config 编辑/导入/导出、readiness 展示和 framework facade 调用；不依赖 Pixi/rendercore implementation                          |

## 4. Game002 迁移与 characterization

game002 默认路径现在先编译共享 plan，再由共享 coordinator 驱动 `Game002RoundTarget`。app 仍保留现有生产专属 resolver/extension 和 `Game002CascadeSequence` 作为业务数据适配及迁移 characterization oracle；它不再拥有 round phase advancement，阶段推进、capability preflight、blocking boundary、failure cleanup 和 destroy rejection 由共享 coordinator 统一负责。

每轮在视觉 mutation 前执行 plan/sequence 精确对照，覆盖：

- initial/final scene 与 value matrix；
- win/remove group 的顺序、金额、position 和 release position；
- 每个 dropdown 的输入/输出 scene、value 和 movement；
- 每个 refill 的输入/输出 scene、value、hole 与新增 occurrence 数量。

characterization/回归矩阵：

| 计划场景                                     | 自动化证据与结果                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| 1. 无中奖普通 spin                           | terminal zero-win adapter/sequence tests，通过                              |
| 2. 单组 win/remove/drop/refill               | complete fixture adapter + cascade sequence tests，通过                     |
| 3. 多组、多 cascade                          | two-step fixture 与稳定 group order tests，通过                             |
| 4. WL win 但不 remove                        | protected occurrence test + plan parity assertion，通过                     |
| 5. WL dropdown hold                          | unified/selective drop tests + movement parity，通过                        |
| 6. 既有 CN value continuity                  | existing-value carry tests，通过                                            |
| 7. refill 新增 CN authority                  | server value endpoint / malformed authority tests，通过                     |
| 8. CN collect + WL companion                 | shared SymbolCascadePlayer、configured collect/companion tests，通过        |
| 9. 普通 refill 达到 expectation gate         | second exact-symbol refill activation test，通过                            |
| 10. expected dropdown/sweep/selective refill | anticipation persistence adapter/demo tests，通过                           |
| 11. summary + global win amount cleanup      | summary config、coordinator completion/update/cleanup tests，通过           |
| 12. fatal/destroy cleanup                    | concurrent/destroy rejection 与 coordinator cleanup idempotency tests，通过 |

最终 game002 package：`20` 个 test files、`102` 个 tests 全部通过；覆盖率 statements `86.58%`、branches `81.13%`、functions `92.40%`、lines `86.94%`。

## 5. Renderer / flow 组合

共享 coordinator fake capability matrix 与真实 adapter/integration 测试共同覆盖：

| Renderer       | Base                          | Cascade                                                            |
| -------------- | ----------------------------- | ------------------------------------------------------------------ |
| standard reel  | 不调用 cascade-only API，通过 | 调用 standard release/drop/refill，保持 occurrence identity，通过  |
| grid-cell reel | 不调用 cascade-only API，通过 | configured adapter 真实 remove/drop/refill/appear completion，通过 |

额外断言：

- capability 缺失在 `startInitialSpin`/任何 mutation 前失败；
- opening win 不重复启动，completion handle 被等待；
- remove-excluded 不 release，drop-held 不 movement；
- movement 后 identity/value 保持；
- normal/loop 等价 playback 不 reset/replay；
- win-amount/collect 等待期间持续 update；
- next-spin、execution-failure、fatal、destroy cleanup 幂等。

## 6. GameViewer 与 readiness

GameViewer 新增：

- component role mapping 与完整 symbol policy 编辑；
- V2 sequential collect presentation 配置；
- strict runtime config JSON 导入/导出；
- 导入后 round-trip 语义保持；
- suggestion 与已确认 runtime config 分离；
- 不可表示/未知/非法输入显式报错；
- readiness 对 active symbol package、renderer/flow、collect/value/popup 闭包做精确检查。

configured adapter 的 cascade 路径现在严格按共享 plan 执行 remove → dropdown → refill；已删除末尾 reset final scene 的伪 cascade。

## 7. 真实 ZIP smoke

样本：`/Users/zerro/Downloads/crave-v2.zip`

| 项目                  | 结果                                                               |
| --------------------- | ------------------------------------------------------------------ |
| SHA-256               | `3a96ebe392133765e5b33c96769277b9c8a6c499cce75bf5ceabc59aadecda9d` |
| ZIP entries           | `121`                                                              |
| ZIP bytes             | `13,324,796`                                                       |
| layout id             | `new-layout`                                                       |
| modes                 | `BaseGame`, `FreeGame`                                             |
| symbol package        | `game002-s3`                                                       |
| popup package         | `bigwin2`                                                          |
| reel                  | `grid-cell`, `6 x 9`                                               |
| cascade               | enabled                                                            |
| required capabilities | spin/state/remove/dropdown/refill/sequential collect 均满足        |
| popup readiness       | available                                                          |
| strict readiness      | passed                                                             |

本任务同时修正 production ZIP inspection：非渲染 readiness 使用经过 filename-key/map/hash 解析后的文件视图校验 symbol package 与 manifest，不借助 Pixi image decode、Worker 或浏览器环境；完整 runtime 仍在实际启动时加载真实 texture。

## 8. 验证命令与结果

最终源码状态上执行：

```text
pnpm test
  34/34 packages successful
  game002 20 files / 102 tests passed

pnpm lint
  34/34 packages successful

pnpm typecheck
  34/34 packages successful

pnpm build
  34/34 packages successful

pnpm format:check
  34/34 packages successful

git diff --check
  passed
```

重点 package 的独立结果：

- `logiccore`：`11` files / `85` tests，通过；branches `80.84%`
- `rendercore`：`72` files / `547` tests，通过；branches `80.10%`
- `gameframeworks`：`12` files / `81` tests，通过；branches `81.75%`
- `gameviewer`：`7` files / `29` tests，通过
- `game002`：`20` files / `102` tests，通过；branches `81.13%`

说明：最终复跑第一次使用默认终端 PATH 时，Turbo 报 `node: not found`，未进入测试。改用 Codex 工作区提供的 Node 24/pnpm 运行路径后，以上原命令全部成功；该事件是执行环境 PATH 问题，不是代码或测试失败。

## 9. Hardcode / boundary audit

执行：

```text
rg -n "WL|CN|bg-win|bg-remove|bg-dropdown|bg-refill|Nearwin|game002" \
  packages/logiccore packages/rendercore packages/gameframeworks
```

结果：

- shared production TypeScript 新增路径无上述业务常量。
- 命中位于既有文档示例、README、测试 fixture、真实资源测试与 source-boundary 测试。
- 唯一 logiccore 文档示例命中为 `docs/usage-en.md` 中演示 `getSymbolCode("WL")`，不参与 production round/cascade 逻辑。
- GameViewer runtime 未新增 Pixi/rendercore/VNI/Spine 直接依赖。

## 10. 主要变更文件

### Logic/compiler

- `packages/logiccore/src/slot-round-flow.ts`
- `packages/logiccore/src/slot-round-plan.ts`
- `packages/logiccore/src/index.ts`
- `packages/logiccore/tests/slot-round-flow.test.ts`

### Coordinator/renderer/presentation

- `packages/rendercore/src/slot-round/*`
- `packages/rendercore/src/reel/render-reel-set.ts`
- `packages/rendercore/src/reel/render-grid-cell-reel-set.ts`
- `packages/rendercore/src/scene-layout/configured-round-adapter.ts`
- `packages/rendercore/src/scene-layout/template-presentation.ts`
- `packages/rendercore/src/scene-layout/package-runtime.ts`
- `packages/rendercore/src/scene-layout/production-zip.ts`
- 对应 `packages/rendercore/tests/**`

### Framework/app/configurator

- `packages/gameframeworks/src/index.ts`
- `packages/gameframeworks/src/scene-layout-template/index.ts`
- `apps/game002/src/cascade-config.ts`
- `apps/game002/src/game-adapter.ts`
- `apps/gameviewer/src/io/imports.ts`
- `apps/gameviewer/src/ui/app-shell.ts`
- 对应 GameViewer tests

### 文档

- `agents.md`
- `packages/logiccore/README.md`
- `packages/rendercore/README.md`
- `packages/gameframeworks/README.md`
- `apps/gameviewer/README.md`
- `tasks/123-gameviewer-runtime-configurator-20260723T044915Z.md`

## 11. 浏览器/live 验收状态

未执行浏览器操作或 live WebSocket smoke，原因是用户明确要求最后浏览器验收由用户完成。代码侧未获得、保存或输出任何 live credential。

已启动本地 GameViewer 开发服务：`http://127.0.0.1:5174/`。默认端口 `5173` 已被本机其它进程占用，因此 Vite 自动选择 `5174`；交付时 `5174` 服务处于运行状态，HTTP HEAD 检查返回 `200 OK`。

用户人工验收仍需覆盖：

1. 导入真实 `crave-v2.zip`。
2. 填写真实 server/session 参数。
3. 核对 component roles、symbol policy、renderer readiness。
4. 覆盖无中奖、普通 cascade、多 cascade、held occurrence、value continuity、sequential collect、win amount。
5. 检查 scene/落点/动画/压暗/value/collect/cleanup 与 game002 生产表现。
6. 确认浏览器 console 无未处理异常。

## 12. 未完成项与风险

- 唯一明确未完成项是用户负责的最终浏览器/live 视觉验收。
- 真实 server 随机结果是否能在一次人工 session 中覆盖全部 12 种场景不由前端控制；未命中的场景仍有自动化 characterization 保护。
- 生产 bundle 仍有仓库既有的 Vite 大 chunk warning；构建成功，本任务未扩大范围处理 code splitting。
- 本任务未自动推断 mode transition，也未泛化 game003 的 bg-bar/矿车 extension，符合计划排除项。
