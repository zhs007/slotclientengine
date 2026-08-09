# 任务 186 执行报告

## 结论

任务 186 的代码和自动化验收已完成。rendercore 现在提供可选的 grid-cell spin plan 阶段
function、与 effect 解耦的 activation 时间线、真实 activation edge drain，以及通用的稳定
occurrence 加权 presentation value resolver。game002v2 通过这些接口补齐 initial spin 暗度、
第 2 枚 WL Nearwin 和 `defaultScene` CN 的 `bgcoinweight` 表现，没有在 app 内复制 reel 状态机。

浏览器视觉验收按用户要求未执行，交由用户完成。

## 实现

- `createGridCellReelSpinPlan()` 新增独立 `activation` 输入；无需 effect resource 也能在真实
  landing gate 后切换 dimming 并使用期待停轴 cadence。旧 effect gate 路径保持兼容。
- Scene Layout `spinMainReelToScene()` 新增可选 `buildGridCellSpinPlan(stage)`。stage 只暴露已验证
  target scene/order 和受控 `createPlan()`；不配置 function 的 consumer 保持默认全亮 plan。
- package runtime 收集并公开 `drainMainReelActivationPositions()`；new spin、reset、mode switch、
  destroy 与 landing queue 一并清理，standard reel 使用该 hook 会失败。
- game002v2 从 active Symbols package exact 解析 CN/WL/WM/CM/CO。普通 initial spin 仅其它
  symbol 使用 `0.5` 暗度；第 2 枚 WL 落地后只有 WL 保持全亮。
- game002v2 的 Nearwin controller 只跟踪真实 landing/activation edge：gate 打开时对已落地 WL
  直接请求 `Reel_NearWin`，后续 WL 落地后补请求，spin 完成/失败/destroy 时恢复 normal。
  WL 触发期待已经是业务事实，不在渲染 edge 反向查询 capability；资源/state 缺失由实际请求原位报错。
- 任务 185 的最后完整 scene 继续作为 landing scene。rendercore 既有 target-window 注入让不在
  本地公开轮带中的 WM/CM/CO 只进入对应临时 stop window；回归测试确认公开轮带不变。
- `createWeightedGridCellPresentationValueResolver()` 严格校验 caller table/uint32 source，使用
  rejection sampling 避免 modulo bias，并按 `(x,y,symbolY,code)` 稳定缓存。
- rendercore 新增 `getInitialSceneLayoutSymbolPackageResource()`，按 layout legacy binding 或
  `gameModes.initialMode` 返回同一解包 package 的 active Symbols resource；game002v2 不再自行
  遍历 manifest。`defaultScene` CN resolver 从该 resource 的 typed gameconfig 读取 exact
  `bgcoinweight`；缺 package、CN、表或非法权重/random 都直接失败。
- game002v2 主 adapter 只保留 hook 接入和 controller 生命周期；暗度分类、权重解析、Nearwin
  跟踪分别收敛在小型 helper 中。
- 后续浏览器验收发现固定 WL 的 `bg-incwl` value 会被 cascade builder 当成 occurrence 替换。
  rendercore 已移除 carried presentation value 的反向业务校验：只校验动画能否执行，保留 WL
  renderer identity，并在 fall 完成边界采用 plan 的 target value。
- 沿 game002v2 完整 round 调用链复核后，删除了 `playAvailableState()` 的 capability 预查询与
  静默跳过：win/remove/feature 现在按已知业务 state 直接请求，实际无法播放时原位失败。CN win
  使用 `winStart`，其它中奖 symbol 使用 `win`。
- landing/final scene 不再回退泛化 `step.getScenes()`；cascade target values 继承同 code carried
  occurrence，再由当前 step otherScene 覆盖，避免合法 CN/WL/WM/CM value 被清成 `null`。同 scene
  但 value 变化也会提交 final snapshot。feature 播放从 runtime 当前 scene 取位置，transform-only
  step 即使没有 landing component，也会先播放源 symbol state 再提交 final scene。
- 同一 symbol（尤其 WL）可参与多个 win result；game002v2 在构建 win presentation request 时按
  坐标稳定去重，同一格只请求一次 win state，rendercore 继续拒绝无法执行的 duplicate batch。

## 实际文件

新增：

```text
apps/game002v2/src/{default-scene-values,spin-presentation}.ts
apps/game002v2/tests/{default-scene-values,spin-presentation}.test.ts
packages/rendercore/src/reel/weighted-presentation-value.ts
packages/rendercore/tests/reel/weighted-presentation-value.test.ts
tasks/186-game002v2-spin-default-scene-presentation.md
tasks/186-game002v2-spin-default-scene-presentation-260809-045059.md
```

修改：

```text
apps/game002v2/src/{nearwin,round-adapter}.ts
apps/game002v2/tests/nearwin.test.ts
packages/rendercore/src/reel/{types,index,grid-cell-spin-plan}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/src/scene-layout/{package-resource,configured-round-adapter}.ts
packages/rendercore/tests/reel/{grid-cell-spin-plan,spin-strip}.test.ts
packages/rendercore/tests/scene-layout/{package-resource,package-runtime}.test.ts
packages/rendercore/README.md
docs/agent-rules/game002.md
```

## 计划偏差

- 基线工作区没有可直接调用的 Node/pnpm，使用 Codex bundled Node 24 和 pnpm 11.16.0 执行
  `CI=true pnpm install --frozen-lockfile` 恢复锁定依赖；`pnpm-lock.yaml` 未修改。
- 用户澄清资源边界后，在 rendercore 增加 initial active Symbol package resource 获取接口；接口
  返回 crave layout 解包时已加载的 typed resource，而不是增加 raw gameconfig/assets 入口。
- Nearwin 不再生成预设 landing state matrix，而是在真实 edge 上由独立 controller 请求 state；
  这样恰好两枚 WL 也能在第 2 枚 landing 时进入期待状态。
- 按用户要求不运行浏览器验收，因此完成定义中的人工视觉项保留为交接项。

## 自动验收

- `pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/grid-cell-spin-plan.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/reel/spin-strip.test.ts tests/reel/weighted-presentation-value.test.ts tests/scene-layout/package-runtime.test.ts`：通过，5 files / 46 tests。
- `pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- `pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/grid-cell-cascade-plan.test.ts tests/reel/render-grid-cell-reel-set.test.ts`：通过，2 files / 27 tests，覆盖 carried target value 与固定 WL identity。
- `pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-resource.test.ts tests/scene-layout/configured-round-adapter.test.ts`：通过，2 files / 26 tests，覆盖 initial active Symbols resource 接口及既有 consumer。
- `pnpm --filter game002v2 test`：通过，7 files / 11 tests。
- `pnpm --filter game002v2 typecheck`：通过，含直接依赖构建。
- `pnpm --filter game002 typecheck`：通过，证明 rendercore public API 变更未破坏直接 consumer。
- 修改文件 Prettier write/check：通过。
- `git diff --check`：通过。

## 浏览器验收交接

建议在 live game002v2 至少观察以下四类局面：

1. 无 Nearwin initial spin：CN/WL/WM/CM/CO 全亮，其它滚动 symbol 为 0.5 黑色叠加效果。
2. 恰好或至少两枚 WL：第 2 枚真实落地后只有 WL 全亮，CN/WM/CM/CO 也随滚动 strip 压暗，
   WL 播放 `Reel_NearWin`，本轮停止后恢复 normal。
3. 最后触发组件为 `bg-genwm/bg-gencm/bg-genco`：对应特殊 symbol 在正确 cell 转入并精确停住，
   非期待阶段不压暗，期待阶段压暗。
4. 首次 `defaultScene` 含 CN：每个 CN 显示 `bgcoinweight` 范围内的值；同一 occurrence 在本次
   reel 重建前保持稳定。

若浏览器发现素材/state 缺失或权重表不可用，当前实现会在实际使用处显式报错，不做表现降级。
