# 178 slot-operation-effect-composition-refactor 执行报告

## 实现结果

- LogicCore 新增 effect discriminated V2 IR、strict server view、无状态 generator、mutation derivation/reducer 与统一 finalizer；finalizer 验证 definition/effect、scene establishment、source evidence、mutation closure、plain data 与 deep freeze。
- RenderCore registry/coordinator/scene-layout local flow 全部切换到 V2；registration 强制声明 effect，只有 landing/mutation commit 后断言 snapshot，presentation 不再伪造 output。
- game002 切换到 `compileGame002OperationPlanV2()`，settled transform 被拆为 WL/WM/CM/CN/CO 原子 operation，纯 WM 动画使用 presentation，FreeGame 在最终 V2 plan 中组合；补充组合失败分支测试。
- `slotoperationauthoring` 升级 V2 schema/finalizer，并提供显式 V1 upgrade，旧 draft 全部进入 `review: required`；Game Viewer 2 外层升为 v4，旧 v2/v3 项目必须审阅后才能 preview/export，相同 snapshot 不再生成 placeholder。
- 删除 V1 slot-operation compiler、builtin runtime、validator/public exports 与对应测试；同步 LogicCore、RenderCore、GameFrameworks、game002、authoring、Game Viewer 2 README 和三份领域规则。

主要新增实现位于：

```text
packages/logiccore/src/slot-operation/{v2-types,server-view,effect-generators,mutation-derivation,v2-finalizer}.ts
apps/game002/tests/operation-plan-composition.test.ts
```

## 关键决策与计划偏差

- no-op settled/dropdown/refill 被建模为显式 presentation kind；只有产生真实 snapshot 变化的步骤才进入 state-mutation。
- game002 compiler 与专属 transform/FreeGame 排列已归 game002，但当前仍消费 `compileConfiguredSlotRoundOperationPlanV2()` 生成的严格 V2 base trace。该配置型 bridge 仍位于 LogicCore，是计划中“彻底删除 fixed profile compiler”的未收口项；不得继续扩展其业务职责。
- Game Viewer 2 已具备 v4/review gate 和 V2 draft 编辑，但本次没有新增完整的结构化 mutation/target 表单，复杂 payload 仍通过现有 JSON 编辑面完成。
- 未新增依赖、未修改 lockfile、manifest、YAML 或生产资源；构建过程中正式生成器重建的 game002/game003 generated 文件与基线一致。

## 自动化验收

以下命令均通过：

```text
pnpm typecheck                  37/37 tasks
pnpm lint                       37/37 tasks
pnpm test                       37/37 tasks
pnpm build                      37/37 tasks
pnpm format:check               37/37 tasks
git diff --check                passed
```

game002 新增组合失败分支测试后为 27 files / 199 tests，branch coverage 80.10%。V1 runtime 残留搜索在 production source 中没有命中：

```text
SlotOperationPlanV1
SlotOperationBase
compileSlotOperationPlan
validateSlotOperationPlan
freezeSlotOperationPlan
compileSlotRoundOperationPlan
slot:settled-transform
```

## 浏览器验收

- Game Viewer 2：`http://127.0.0.1:4174/` 可加载，无 console error；页面正确要求先导入 production ZIP。仓库没有可用 ZIP/旧项目 fixture，因此未完成旧项目升级、逐项 review、preview/export 与 replay 的人工端到端操作。
- game002：`http://127.0.0.1:4175/visual-fixture.html?skin=2` 显示 `ready skin=2 1125x2000`，真实 skin/resource/geometry/Pixi 装配 smoke 通过。该 fixture 按正式说明不覆盖 live Spin、cascade、FreeGame 与失败恢复；这些路径由完整自动化 fixture 验证，不能记作浏览器视觉通过。

## 剩余风险与未完成项

- 把 `compileConfiguredSlotRoundOperationPlanV2()` 的固定 profile 排列分别下沉到 configured scene-layout consumer 与 game002 strict selector/generator compiler，随后删除 LogicCore bridge，才能完全满足“shared package 不拥有最终业务顺序”的目标。
- 需要携带真实 production ZIP/旧 viewer project 完成 Game Viewer 2 人工验收，并在可控 live/视觉 fixture 中复验 game002 普通 Spin、cascade、WL/WM/CM/CN/CO、FreeGame、下一轮 cleanup 与中途失败恢复。
- 按计划，本次跨包 public contract、schema 与事务生命周期改动仍建议独立复验。

## 2026-08-06 Game002 编排收口

- LogicCore 新增 `genSpinOperation`、`genWinOperation`、`genRemoveOperation`、
  `genDropdownOperation`、`genRefillOperation` 及 snapshot change/value helpers；这些 API
  只生成原子 draft，不决定游戏调用顺序。
- Game002 新增自主 round compiler，直接遍历 server steps 并排列 Spin、Win、Remove、
  Dropdown、Refill、WL/WM/CM/CN/CO、WinAmount operations；生产 `playSpin()` 只在 `try/catch`
  中调用一次 compiler 后启动 coordinator，不再做 bet/symbol/component 基础检查。
- 删除 Game002 的 profile plan → `settled-transform` flatMap → 二次 finalizer 流程；handler
  只读取 operation 自带的 snapshot/groups/fall/transform payload，不再读取 `payload.step` 或
  按 stepIndex 回查 cascade sequence。
- FreeGame 不再是单个 opaque operation，权威 18-step 样例会生成 trigger、enter、10 次 spin、
  AF、CO、final win、popup、exit 等显式 operations，由 coordinator 逐项播放；旧的独立
  FreeGame playback 状态机及其测试已经删除，不再保留第二条播放路径。
- 自动化结果：LogicCore 定向 typecheck 与 generator tests 通过；game002 typecheck 通过；
  game002 全量 `25 files / 191 tests` 通过；`git diff --check` 在提交前再次执行。

仍保留的兼容范围：`createGame002CascadeSequence()` 仅供旧定向测试与资源校验 helper 使用，
不再参与生产 plan 编译或播放；configured scene-layout consumer 仍使用 shared configured compiler，
其下沉不属于本次针对 Game002 反馈的收口。
