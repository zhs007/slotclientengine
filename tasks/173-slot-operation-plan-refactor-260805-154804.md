# Task 173 Slot Operation Plan 重构执行报告

## 结论

本次完成了 `SlotOperationPlanV1` 核心 IR、strict compiler/finalizer、独立本地
authoring package、rendercore 实例级 registry/coordinator，以及 Game002、Game Viewer 2
的完整接入。旧 public fixed round coordinator 已删除，Game002 BaseGame 与同一响应的
FreeGame 已纳入同一个 operation coordinator。

代码重构已达到本任务计划的主要完成定义：configured adapter 与 Game002 直接编译 public
operation plan，旧 public plan/compiler/adapter 已删除；Game002 multiplier/CO 已拆成连续原子
operation，Game Viewer 2 finalized plan 也由通用 operation coordinator 实际执行。浏览器人工
验收按用户要求未执行，因此视觉与真实交互验收仍保持待办。

## 已实施

- `logiccore`
  - 新增 versioned operation/snapshot/source/evidence 类型、plain-data 与 cycle 校验、chain/final
    closure、deterministic deep freeze。
  - 新增 server component role selector，保留 scene/otherScene/result 权威索引与 occurrence identity。
  - 新增 spin、win、collect、remove、dropdown/refill、value update、replacement、relocation builders。
  - 新增正式 compiler 与 authored finalizer；未知 kind/version、非法 source/output、重复 definition
    在生成可信 plan 前失败。
- `slotoperationauthoring`
  - 新建 renderer-free workspace package，只依赖 logiccore。
  - 提供 exact/ambiguous/unresolved suggestion、relocation candidate 枚举、strict project parser、
    review gate 和 finalizer。
- `rendercore`
  - 新增实例级 exact kind/version registry 与 operation coordinator。
  - 完整 plan preflight 发生在 cleanup/首次 mutation 前；实现 prepare/start/update/commit、
    rollback/destroy/fatal cleanup 与 runtime snapshot assertion。
  - 新增逐格 choreography executor；删除旧 public `slot-round` coordinator/export。
- `game002`
  - BaseGame、multiplier/CO transform 与 FreeGame 使用同一 immutable plan/coordinator。
  - transform payload 直接携带 WL/WM/CN/CM/CO 业务事实，Target 不再按 stepIndex 查询
    presentation batch；FreeGame playback 新增显式 preflight。
- `gameviewer2`
  - 外层项目升级为 strict v3；v2 必须显式升级为待 review 草稿，未完成时禁用 preview/export。
  - launch payload 携带 finalized operation plan；runtime 在创建资源前核对 initial 与所有 edge
    checkpoint。
  - 新增 Operations 页签，可逐 draft 编辑本地注册 kind 与完整 payload JSON，显示
    exact/ambiguous/unresolved evidence、候选数和 diagnostics；每条 edge 只有在重新编译并与目标
    snapshot 精确闭合后才能接受。
- 同步 package metadata、最小 lockfile importer、README、设计文档与领域规则。

## 偏差与额外修复

- configured adapter 与 Game002 已直接使用 `compileSlotRoundOperationPlan()`；旧 public
  `SlotRoundExecutionPlan`、compiler、adapter、fixed coordinator 与 compatibility 命名已删除。
  配置 profile trace 仍是 logiccore 私有实现，不再作为 public contract 或 consumer 依赖。
- Game002 profile transform 现按实际 commit 展开为 `game002:wl-increment`、
  `game002:wild-multiplier`、`game002:wm-to-cn`、`game002:coin-multiplier`、
  `game002:cm-to-cn`、`game002:co-collect`；每项有连续 input/output 和 exact capability。
- Game Viewer 2 v3、review gate、checkpoint validation 与 coordinator execution 已完成；editor
  只列出本地注册的 built-in kind，但完整 payload 可显式编辑 positions、relocation pairing、
  result、order、amount 等字段。未知 custom kind/version 仍按设计精确失败。
- 用户要求一并消除整仓基线问题：修复 EditorResource 未使用变量 lint、RenderCore TypeScript
  overload lint、SymbolsEditor ESLint project 漏含 scripts；NetCore mock server 改为仅绑定
  `127.0.0.1` 且启动错误立即 reject，不再把本地监听失败伪装成 hook timeout。
- 根 build 改为 `--concurrency=1`，避免多个 workspace app 的 `prepare:deps` 并发覆盖共享 package
  `dist` 造成瞬时 missing export；该策略与现有根 typecheck 的单并发一致。
- 浏览器人工验收由用户执行；本报告不以单测代替视觉、真实 ZIP 或动画时序验收。

## 2026-08-06 续作检查点

- configured scene-layout 与 Game002 已直接从 profile 编译 `SlotOperationPlanV1`，不再先构造或
  适配旧 execution plan；framework facade 不再导出旧 compiler/plan。
- profile presentation handler 已去除 compatibility/legacy API 命名，源文件与测试也改为
  `profile-round-handlers`。
- 新增 direct profile compiler 覆盖和 handler/choreography failure branch；logiccore 113 tests、
  rendercore 699 tests、Game002 190 tests、Game Viewer 2 9 tests、authoring 4 tests 通过。
- 后续续作完成 Game002 transform 原子拆分与 Game Viewer 2 coordinator execution；对应测试见下节。

## 2026-08-06 原子化与本地执行续作

- Game002 transform 从 profile trace 展开为最多六个 ordered operation；WM→CN intermediate、
  CM 后 CN value、CM→CN 和 CO final relocation 均形成独立 snapshot closure。
- Game002 Target 在真实动画/visual commit 边界暂停，由下一个 exact handler 续播；乱序、payload
  session 不一致、空 decomposition、错误 CM input 和 final 不闭合均显式失败。
- Game Viewer 2 finalized plan 为每个 exact kind/version 建立实例 handler registry，并通过共享
  coordinator 执行 spin、multi-draft settled edge 与 replay；不再仅验证后直通 settled snapshot。
- 续作验证：Game002 193 tests（branch 80.03%）、RenderCore local-flow 10 tests、Game Viewer 2
  最终 10 tests 均通过。

## 自动验收

通过：

- `pnpm typecheck`：37/37 workspace 成功。
- `pnpm build`：37/37 workspace 成功。
- `pnpm format:check`：37/37 workspace 成功（为新 authoring package 补充了
  `coverage/`、`dist/` ignore）。
- `pnpm lint`：37/37 workspace 成功。
- `pnpm test`：37/37 workspace 成功。
- `git diff --check`：通过。
- `pnpm --filter @slotclientengine/logiccore test`：113 tests 通过，branch 80.62%。
- `pnpm --filter @slotclientengine/rendercore test`：701 tests 通过，branch 80.00%。
- `pnpm --filter game002 test`：193 tests 通过，branch 80.03%。
- `pnpm --filter gameviewer2 test`：10 tests 通过。
- `pnpm --filter @slotclientengine/slotoperationauthoring test`：4 tests 通过。
- `pnpm --filter @slotclientengine/netcore test`：79 passed、1 skipped；使用本地 loopback mock，
  不依赖外部服务器。

## 浏览器人工验收（待用户执行）

- Game002：BaseGame cascade、WM/CM/CO、FreeGame enter/spin/AF/CO/exit、anticipation、summary、
  global win amount、next-spin cleanup 与重构前顺序一致。
- Game Viewer 2：真实 layout ZIP、v2 显式升级、未完成 review 禁用 preview/export、finalized playback、
  replay generation。
- fault injection：资源/handler preflight 在 mutation 前失败；active operation 失败后无半提交和残留
  controller。

## 基线

- HEAD：`7ab552549d559c607d3aeff2f52ba18afb69eee9`
- UTC：`2026-08-05T15:48:04Z`
- 未执行 commit、push 或浏览器操作。
