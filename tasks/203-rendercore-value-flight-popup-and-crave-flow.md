# 203 rendercore-value-flight-popup-and-crave-flow 任务计划

## 1. 目标与完成定义

### 目标

沿用 Crave 当前直接驱动 `round-adapter` 的实现，不引入 `operation[]`，补齐 RenderCore 的 symbol 数字表现与 Popup 原子能力，并让 Crave 按游戏决定的顺序执行获奖庆祝和免费游戏转场。

### 完成定义

- [ ] `SymbolRender.setValue()` 跨 value tier 时自动同步数字、档位 Spine、slot、颜色与 transform；游戏不接触 tier。
- [ ] symbol 可取得数字专用 anchor，并可 clone 当前数字表现为 owned `RenderNode`，供第二层 presentation motion 飞向场景位置或另一个 symbol。
- [ ] 普通 Spine Popup 在 `start` 点击时忽略且不锁存；在 `loop` 点击时立即切换 `end`，不等待 loop boundary；`end` 点击忽略。
- [ ] Scene Layout 提供可等待的当前模式获奖庆祝接口，完整结束后 resolve，失败/destroy 时显式 reject且不泄漏 waiter。
- [ ] Crave 不生成 operation；交付人工迁移文档，指导在入免费前和免费结束回 BaseGame 前依次 `await` 游戏决定的获奖庆祝与转场，不直接修改 Crave 源码。
- [ ] 命名 image-string node 的 `initialText` 明确为 authoring preview 默认；production 业务文字通过 `SymbolRender.setText(name, text)` 显式设置，不与 value tier 混用。
- [ ] 旧同步启动接口与 game002v2/game003v2 当前调用保持兼容。
- [ ] public exports、README、长期规则、定向测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- `packages/rendercore` 的 symbol value clone/anchor、value tier 回归、Spine Popup 状态机与 awaitable award celebration。
- Scene Layout runtime 的 additive facade。
- Crave `round-adapter.ts` 的完整人工修改说明，不写入外部仓库。
- RenderCore 定向单测与 Crave typecheck/现有测试。

### 不包含

- 不引入或修改 LogicCore `SlotOperationPlanV2`，不新增 award operation kind。
- 不在 RenderCore 判断免费触发、免费结束、庆祝金额或转场目标。
- 不新增 CN/WM/CM/WL 专属 API；数字飞行保持通用 RenderNode/RenderAnchor/motion，WL/WM/CM 命名 multiplier 通过通用 `setText()`。
- 不修改 game002v2/game003v2 调用链，不修改正式 assets、manifest、YAML、生成物、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-12
slotclientengine HEAD: c55e3548c89c0636f4fc01dfc6d37d3b8d7fc6af
slotclientengine branch: codex/task-199-rendercore-first-layer-api
slotclientengine status: clean
pixicrave HEAD: 49c19087b825c4bbebce00f2286c9d60080e9ebb
pixicrave branch: master
pixicrave status: clean
```

- 已读取根 `AGENTS.md`、`docs/agent-rules/shared-game-runtime.md`、Popup 所需 `docs/agent-rules/editor-artifacts.md`、game002 consumer 规则及任务 201/202 合同。
- `RenderSymbolValueControllerModel.setValue()` 已按 `maxExclusive` 重选 tier，但需固定真实跨档和 active state 连续性，修复测试暴露的问题。
- 第二层已有 `PresentationScope.transfer()` 和 opaque `RenderAnchor`；本任务只补数字表现 clone/anchor，不另建 motion API。
- `SpinePopupPlayer` 当前锁存 start 点击并等待 loop boundary，与确认需求相反。
- Scene Layout 当前只有 fire-and-forget `startAwardCelebrationForCurrentMode()`；Crave 当前先转场、整轮末尾再启动庆祝，且没有 operation 数组。

## 4. 需求解释与技术决策

1. **value tier 是 `setValue()` 的内部一致性合同。** 同档只更新数字；跨档由 RenderCore 原子重建 tier 资源并维持当前 symbol 语义状态。游戏只提交最终 value。
2. **飞的是数字表现，不是 symbol。** `cloneValue()` 返回当前数字外观的 owned `RenderNode`，`getValueAnchor()` 返回数字挂点；飞到场景位置和飞到目标 symbol 仅终点 anchor 不同，目标 value 是否变化由游戏显式调用 `setValue()`。
3. **Popup 点击不锁存。** `requestDismiss()` 只有 loop 生效并同步启动 end；start/end/idle/complete 均为 no-op。
4. **等待属于 RenderCore 原子播放。** 新 `playAwardCelebrationForCurrentMode()` 启动并返回 Promise；由 runtime update 在完整结束时 resolve。旧 `start...()` 保持。
5. **庆祝顺序属于 Crave。** 人工迁移文档指导当前 adapter 直接 `await` 新接口，然后 prepare/request mode；RenderCore 不从 mode/component 推断庆祝。
6. **authoring 默认不等于 production value。** `imageStringNodes.initialText` 保留资源闭包与编辑器预览用途；正式游戏必须按 exact node name 设置文字。`setValue()` 只服务声明了 `valuePresentation` 的 symbol。

## 5. 职责与合同

- **Crave**：决定是否庆祝、金额、次数和 `庆祝 → 转场` 顺序。
- **RenderCore symbol**：拥有 value tier 选择、数字资源 clone、anchor、ownership和stale validation。
- **PresentationScope**：拥有飞行时坐标转换、manual clock、abort与临时节点 cleanup；不提交业务 value。
- **Popup player/runtime**：拥有点击阶段语义、播放完成 Promise和destroy cleanup；不识别免费游戏。
- **失败策略**：无 value 时 clone、stale symbol、缺 tier/resource、并发 popup、destroy中的 waiter均显式失败；不 fallback。

## 6. 文件范围

### 预计新增

```text
tasks/203-rendercore-value-flight-popup-and-crave-flow-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/symbol/{types,render-symbol,symbol-render}.ts
packages/rendercore/src/symbol-value-presentation/**
packages/rendercore/src/popup/{types,spine-player}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/tests/{symbol-value-presentation,popup,scene-layout}/**
packages/rendercore/README.md
docs/rendercore-operation-first-layer-api.md
docs/agent-rules/shared-game-runtime.md
docs/crave-task203-manual-migration.md
```

## 7. 实施步骤

1. 固定 value tier 跨档、当前 state 连续性和失败原值保留测试，修复 controller 原子切换。
2. 为 value controller 建立数字 display clone/anchor seam，并在 `SymbolRender` 暴露简单接口；复用现有 RenderNode、RenderAnchor和PresentationScope。
3. 修改 Spine Popup 点击状态机和测试，删除旧 early-latch/loop-boundary期望。
4. 添加 awaitable award celebration facade、完成/destroy/concurrency测试并保留旧同步入口。
5. 编写 Crave adapter 人工迁移说明：入免费前庆祝后转场，免费结束时庆祝后回 BaseGame，移除整轮末尾 fire-and-forget庆祝；补充 WL/WM/CM exact multiplier node 设置示例。
6. 同步文档、执行 L2 定向验收并生成报告。

## 8. 测试与验收

### 验收级别

采用 `L2`：修改 RenderCore 跨模块 public API，并直接更新外部 Crave consumer。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test -- tests/popup/spine-player.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore build
git diff --check
```

### 人工验收

- Crave 中验证 CN 跨 10/100/1000 档位、数字飞向场景/目标 symbol 的实际资源效果。
- 验证 start/loop/end 点击边界，以及入免费和出免费均为庆祝完成后再转场。

## 9. 环境与依赖

- 使用仓库既有 Node 24、pnpm和依赖；不修改 lockfile。
- Crave 保持自己的 Git 分支和工作区，不修改、不提交、不推送。

## 10. 执行报告

完成后创建 `tasks/203-rendercore-value-flight-popup-and-crave-flow-<utctime>.md`，记录实现、验证、Crave修改和待用户浏览器验收项。

## 11. 风险与假设

- 数字表现异步资源初始化期间 clone 必须显式失败或等待已准备状态，不能复制半初始化 display。
- 入免费庆祝金额和免费结束庆祝金额必须从 Crave 当前 round 数据语义中确定；若现有 API 不能区分，应保持游戏侧显式计算而非由 RenderCore猜测。
- Popup completion 依赖宿主持续调用 `runtime.update(deltaSeconds)`。
