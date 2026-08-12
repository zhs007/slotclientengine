# 205 rendercore-render-object-unification 任务计划

## 1. 目标与完成定义

### 目标

把 RenderCore 当前分散在 `RenderNode`、`SymbolRender`、命名 image-string 文字和 value presentation 上的可渲染对象能力收敛为统一的 `RenderObject` 公共合同。整个 symbol、symbol 内的命名文字和 value 数字表现都可作为受控 render object 取得，并复用同一套 clone、anchor、mount、motion、transfer 和 lifecycle API。

底层继续以 PixiJS `Container` 作为唯一 display owner；公共 `RenderObject` 不继承、不返回 raw `Container`，游戏不能绕过 RenderCore 直接修改 parent、children、transform 或 destroy 边界。

### 完成定义

- [ ] RenderCore public export 提供统一 `RenderObject`；`SymbolRender`、命名文字 part、value part 和普通文字对象都满足该合同。
- [ ] 可复制对象通过同一 `CloneableRenderObject.clone()` 产生 detached owned clone；symbol clone 保留 `SymbolRender` 的协变返回类型和现有 state 选项。
- [ ] 每个 render object 通过同一 `getAnchor()` 返回 opaque `RenderAnchor`；anchor 在 resolve 时读取当前有效 backing container，不向游戏暴露 Pixi 坐标或 matrix。
- [ ] `SymbolRender.getPart()` 使用严格 discriminated selector 取得 value 或 exact-name text part；两类 part 的飞行调用除 selector 外完全相同。
- [ ] `PresentationScope`、area/reel/cell/symbol attachment 和 typed object factory 统一接收 `RenderObject`，不再维护平行的 `RenderNode` 公共概念。
- [ ] `cloneValue/getValueAnchor/cloneText/getTextAnchor` 四个飞行专用方法由 `getPart()+clone/getAnchor` 取代；`setValue/getValue/setText/getText` 继续保留各自严格的业务内容语义。
- [ ] owned/borrowed、stale、mount、detach、destroy、repeat/interruption cleanup 行为保持严格；原始 borrowed symbol/part 不能被当作 owned clone 转移或销毁。
- [ ] symbol state/value/text 的视觉结果、value tier 切换、现有 motion path/easing/manual clock 和盘面 mutation 行为不变。
- [ ] game003v2、Crave 人工迁移文档、RenderCore README/合同/领域规则、public exports、定向测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- `RenderNode` 到 canonical `RenderObject` 的公共命名与 adapter 合同收敛。
- `RenderObject`、`CloneableRenderObject`、普通文字 render object、`SymbolRender` 的继承与协变 clone 合同。
- 严格 `SymbolRenderPartRef`：`{ kind: "value" } | { kind: "text"; name: string }`。
- value/text part 的 logical façade、resolve-time view/anchor、clone 和 exact occurrence lifecycle。
- presentation scope、area layer、reel/cell/symbol attachment 的公共参数迁移。
- 当前 RenderCore 内部使用 `RenderNode` 的机械迁移，以及 game003v2 `createTextRenderNode()` consumer 迁移。
- 任务 203 Crave 示例改为统一 render object 飞行形态。

### 不包含

- 不新增 collect/merge/coin-meter 等业务模板，不让 RenderCore 识别 CN、WL、WM、CM 或 component。
- 不把 `setValue()` 与 `setText()` 合并为 `setData()`、string/number union 或猜测型 generic property bag。
- 不把 Scene Layout named node、layer 或 raw Pixi display tree 全部包装成可任意 mutation 的 render object；只保留其现有 anchor/mount target 职责。
- 不让 public `RenderObject` extends Pixi `Container`，不公开 `parent/children/worldTransform/pivot/zIndex/destroy({children})`。
- 不新增 presentation plan、motion DSL、tween engine、RAF 或 wall-clock timer。
- 不改变 grid-cell occurrence transfer 的 lease/commit、symbol replacement、spin、cascade 或 server scene 边界。
- 不修改 LogicCore、manifest/YAML/assets、生成物、依赖、package version 或 lockfile。
- 不保留永久 `RenderNode`/`RenderObject` 双命名或静默 alias；本仓私有 `0.1.0` package 与直接 consumer 在同一任务原子迁移。

## 3. 制定计划时的基线

```text
UTC: 2026-08-12T14:20:33Z
HEAD: 8deb918ac3955ec1f31aa8dab4e23a653831b803
branch: detached HEAD (commit同时由main、origin/main等ref指向)
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/shared-game-runtime.md`、任务 199/201/203 计划与任务 199 执行报告；`packages/rendercore` 下没有补充 `AGENTS.md`。
- `packages/rendercore/src/symbol/symbol-render.ts` 当前声明 `SymbolRender extends RenderNode`，所以 whole-symbol clone 已能交给 generic presentation motion。
- `packages/rendercore/src/symbol-image-string/controller.ts` 与 `packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts` 当前都把 display clone 包成 owned `RenderNode`。
- `packages/rendercore/src/presentation/presentation-scope.ts` 的 `mount/withNode/move/transfer` 已统一接收 `RenderNode`；任务 205 不重做 motion engine。
- `packages/rendercore/src/symbol/render-node.ts` 的 public façade 由 `WeakMap` adapter 持有 Pixi `Container` view；实现层已经是 Container-backed，能力缺口是公共对象身份、通用 anchor/clone 和 symbol part 选择，不是缺少 Container 基类。
- `SymbolRender` 当前公开 `cloneValue/getValueAnchor` 与 `cloneText/getTextAnchor` 两组重复 flight API；`docs/crave-task203-manual-migration.md` 因此需要按 value/text 分别写调用。
- value tier 切换可能替换实际 display container；logical part 不能把旧 physical container 泄露或静默继续使用，必须在 resolve 时取得当前有效 view，并继续受 source occurrence stale 校验约束。
- game003v2 是仓内唯一直接使用 `createTextRenderNode()` 的 app consumer；game002v2 当前不直接引用 `RenderNode`/`TextRenderNode`，但 legacy rendercore 内部实现仍需同步类型迁移。
- 本规划会话只创建本任务文档；不修改源码、不安装依赖、不运行构建或测试。

## 4. 需求解释与技术决策

### 需求解释

- 用户所说的“文字和 symbol 都是 renderobj”解释为：它们共享受控的 public render capability，而不是游戏取得任意 Pixi display object。
- 现有代码已经能用同一个 `transfer()` 移动 symbol clone、text clone 和 value clone；任务 205 解决的是取得、复制、定位接口重复和命名不一致。
- whole symbol 本身就是 render object；value 和 named text 是 symbol 内可严格选择的 presentation part。选择 part 不改变其业务写入 API，也不让 RenderCore 推断 part kind。
- `Container` 是内部实现基座，不是公共继承合同。这样既复用 Pixi parent/transform/toGlobal/toLocal，又保留 exact identity、ownership 和 stale guard。

### 关键决策

1. **以 capability interface 统一，不以 raw Pixi class 统一。**
   - `RenderObject` 承载现有 position/visibility/play/stop/destroy 与统一 `getAnchor()`。
   - `CloneableRenderObject extends RenderObject` 增加 `clone()`；不要求所有未来粒子/流式播放器都假装可复制。
   - `SymbolRender extends CloneableRenderObject`，`clone(options?)` 继续返回 `SymbolRender`。
   - adapter 内部持有或解析 Pixi `Container`；public object 不 `extends Container`，也不提供 `view` getter。

2. **value/text 使用严格 part selector，不使用字符串猜测。**
   - 目标形态：

     ```ts
     type SymbolRenderPartRef =
       | { readonly kind: "value" }
       | { readonly kind: "text"; readonly name: string };

     interface SymbolRender extends CloneableRenderObject {
       getPart(ref: SymbolRenderPartRef): CloneableRenderObject;
     }
     ```

   - `kind: "value"` 只允许声明并已准备 `valuePresentation` 的 occurrence；`kind: "text"` 必须大小写精确命中 named image-string node。
   - 不提供 `getPart("multiplier")`、唯一 node 推断、value/text fallback 或 unknown kind 默认。

3. **part 是 logical façade，不是泄露的当前 Container。**
   - part 绑定 exact `SymbolRender` occurrence 和 exact part ref；source replacement/release/pool/destroy 后显式 stale。
   - value 跨 tier 重建 physical display 后，同一 logical part 在下一次 clone/anchor resolve 时使用新 display；不会保留已销毁 container，也不要求游戏重新取得 part。
   - value 尚未 ready、值为 null而无可见 display、text node 未准备或当前 backing view 不可用时，clone/anchor 在画面 mutation 前显式失败。

4. **clone 与 anchor 成为对象自身能力。**
   - text/value part 的 `clone()` 精确复制当前可见内容、profile/tier、transform、anchor 和必要 renderer 状态，返回 detached owned object；不与来源后续变化联动。
   - `getAnchor()` 返回 resolve-time opaque capability；whole symbol、text/value part 和独立文字对象使用同一类型。
   - detached clone 在未挂载时若没有有效坐标 owner，anchor resolve 必须失败；不能假设 world origin。

5. **飞行 API 只保留一个对象形态。**
   - 目标调用：

     ```ts
     const source = area.getSymbol(sourcePosition);
     const origin = source.getPart({
       kind: "text",
       name: "multiplier",
     }); // CN: { kind: "value" }
     const flying = origin.clone();

     await area.present(async (context) => {
       await context.transfer(area.getLayer("win"), flying, {
         ownership: "destroy",
         from: origin.getAnchor(),
         to: runtime.getNodeAnchor("coin-meter"),
         durationSeconds: 0.5,
       });
     });
     ```

   - whole-symbol flight 使用 `origin = source`，后续代码相同。
   - transfer 仍只移动 owned/detached object，不提交目标 value/text，不移动 borrowed reel occurrence。

6. **语义 mutation 不做无类型泛化。**
   - `SymbolRender.setValue/getValue` 继续负责 number/null、tier 和 value presentation 严格校验。
   - `SymbolRender.setText/getText` 继续负责 exact node name 与 string 内容。
   - 本任务只删除四个“clone+anchor”重复入口，不把 state/value/text 合并为一个万能属性接口。

7. **一次性完成命名迁移。**
   - public `RenderNode/RenderNodeAdapter/createRenderNode/TextRenderNode/createTextRenderNode` 迁移为对应 `RenderObject` 命名。
   - package 是 private `0.1.0`，新 API 尚处连续架构收敛阶段；仓内 consumer、长期文档和 Crave 手工说明同一任务更新，不留下两套正式合同。
   - 历史任务计划和执行报告不回写；它们保留当时事实。

## 5. 职责与合同

- **RenderObject façade**：拥有统一对象能力、alive guard、当前 backing view 解析、anchor 和受控 destroy；不拥有业务语义。
- **RenderObject adapter**：内部持有 Pixi `Container`、play/stop/clone/destroy hook、borrowed/owned metadata 和 exact usability validation；不得公开到游戏 display tree。
- **SymbolRender**：拥有 exact occurrence、symbol state、value/text mutation、part selection 和 whole-symbol clone。
- **value/text controller**：拥有当前可见 display、tier/profile/state连续性、logical part backing resolver 和视觉 clone；不拥有 motion。
- **PresentationScope**：继续拥有 mount、coordinate conversion、manual motion、abort/interruption和cleanup；只消费 `RenderObject`。
- **游戏/operation handler**：选择 whole symbol 或 exact part、目标 anchor、时序与最终 value/text commit；不直接接触 Container。
- **资源生命周期**：盘面 symbol/part 为 borrowed，禁止 destroy；clone 与 factory object 为 owned，由 caller 或 scope 按 `ownership: "destroy"` 释放。cleanup 正常、失败、abort、repeat和destroy路径都恰好一次。
- **失败策略**：unknown part kind/name、没有 value presentation、未准备 display、stale occurrence、borrowed destroy/transfer、cross-runtime anchor、重复 mount、无效 duration/order 和 destroyed object 均显式失败；不 fallback。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/presentation/render-object.ts
packages/rendercore/src/presentation/text-render-object.ts
packages/rendercore/tests/presentation/render-object.test.ts
tasks/205-rendercore-render-object-unification-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/index.ts
packages/rendercore/src/presentation/{index,presentation-scope,render-anchor}.ts
packages/rendercore/src/symbol/{index,types,render-symbol,symbol-render,symbol-group}.ts
packages/rendercore/src/symbol-image-string/controller.ts
packages/rendercore/src/symbol-value-presentation/{render-symbol-value-controller,value-display}.ts
packages/rendercore/src/reel/{reel-area,reel-spin,render-cell-spin,render-reel-set,render-grid-cell-reel-set}.ts
packages/rendercore/tests/{presentation,reel,symbol,symbol-image-string,symbol-value-presentation}/**
apps/game003v2/src/round-adapter.ts
packages/rendercore/README.md
docs/rendercore-operation-first-layer-api.md
docs/crave-task203-manual-migration.md
docs/agent-rules/shared-game-runtime.md
```

### 预计删除

```text
packages/rendercore/src/symbol/render-node.ts
packages/rendercore/src/symbol/text-render-node.ts
```

具体文件移动可按 import cycle 最小化调整，但最终只能有一个 canonical render object adapter/registry。

### 原则上不应修改

```text
packages/logiccore/**
packages/{gameframeworks,uiframeworks,netcore}/**
apps/game002v2/**
assets/**
tasks/199-*.md
tasks/201-*.md
tasks/203-*.md
AGENTS.md
package.json
pnpm-lock.yaml
```

执行时若需要公开 Pixi Container、增加第三方依赖、修改资源 schema/manifest、保留两套 public API 或迁移业务流程，属于明显范围扩大，必须先说明，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线和 public surface**
   - 重新核对 HEAD/status、`RenderNode` 全仓引用、任务 201/203 合同和当前 public declaration 输出。
   - 固定 whole symbol、text/value clone、anchor、transfer、ownership 与 game003 amount text 的现有行为测试。

2. **建立 canonical RenderObject 核心**
   - 把现有 render-node adapter/WeakMap 移到 presentation-owned `RenderObject` 模块，增加统一 `getAnchor()` 和可选 clone capability。
   - adapter 支持 resolve-time backing view 与 `assertUsable`，但不公开 raw Container；factory object 继续由 RenderCore/typed adapter 创建。
   - 增加 borrowed/owned、unsupported clone、detached anchor、destroy幂等和外部伪造对象严格失败测试。

3. **把 SymbolRender 与 presentation part 接入共同合同**
   - 让 `SymbolRender` 实现 `CloneableRenderObject`，保留 state/value/text 行为和 symbol clone options。
   - 实现 strict `getPart()`；value/text controller 提供 logical backing resolver、clone和anchor，不再向 façade 分别暴露 clone/anchor 对。
   - 覆盖 exact name、missing part、未 ready/null display、跨 tier view replacement、state profile切换、empty symbol和source stale。

4. **迁移 presentation 与 attachment API**
   - 将 scope、mount target、area layer、reel/cell/symbol attachment 和 group API 参数统一为 `RenderObject`。
   - 更新 motion/mount内部 adapter lookup；确保 whole-symbol clone、text part clone、value part clone走同一个transfer实现和cleanup账本。
   - 保持 borrowed盘面对象拒绝转移、owned clone正常销毁、spin interruption/repeat/destroy无残留。

5. **完成命名与 consumer 原子迁移**
   - 更新 public exports、内部 imports、测试 helper和普通文字 factory为RenderObject命名，删除RenderNode正式导出与旧源码文件。
   - game003v2 amount文字迁移到新 factory，不改变样式、位置、win state时序或cleanup。
   - 更新Crave文档为`getPart()+clone/getAnchor`统一示例；不修改外部Crave仓库。

6. **同步长期合同并执行 L2 验收**
   - 更新RenderCore README、第一/第二层合同和shared runtime最小稳定规则，明确“Container-backed但非Container public subclass”。
   - 搜索生产代码/长期文档中的残留旧API；历史任务文件不作为残留处理。
   - 运行第8节定向命令，生成UTC中文执行报告并记录浏览器验收待办。

## 8. 测试与验收

### 测试原则

- 用同一组contract test分别喂whole symbol、text part、value part和普通文字对象，证明共享的是实际能力而非只改类型名。
- part测试必须覆盖logical identity与physical Container更换：value跨tier后clone/anchor解析新view，旧view不残留parent或资源。
- ownership测试区分borrowed source/part与owned clone；success/error/abort/interruption/destroy均验证detach/destroy恰好一次。
- anchor测试只通过opaque resolve结果验证坐标，不读取或断言public raw Pixi matrix。
- motion测试沿用manual update推进，不用`setTimeout()`、RAF或fake wall clock替代runtime ticker。
- 不为新合同扭曲现有value tier、symbol state或empty symbol严格失败行为。

### 验收级别

采用 `L2`：修改 RenderCore 跨模块 public contract、对象 ownership/anchor resolver，并迁移直接 consumer game003v2。无需 L3，因为不修改根工具链、lockfile、schema、manifest、assets或正式生成物。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/symbol/symbol-render.test.ts tests/symbol-image-string/controller.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts tests/reel/render-reel-spin.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game003v2 test
pnpm --filter game003v2 typecheck
git diff --check
```

旧API残留另外使用定向 `rg` 检查；若只命中历史任务计划/报告，应保留历史事实，不修改这些文件。

### 人工验收

- game003v2中奖金额文字的样式、中心位置、播放期间层级、首轮resolve、repeat和spin interruption与任务前一致。
- Crave人工接入后分别验证whole symbol、WL/WM/CM multiplier和CN value使用同一transfer形态；value跨tier后飞行外观与source当前显示一致。
- 浏览器devtools中确认飞行完成/打断后win layer无残留clone，source symbol/text/value未被错误detach或destroy。

### 独立验收建议

`建议`。本任务涉及跨模块public contract、动态backing view、opaque anchor和异步ownership。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/symbol/symbol-render.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter game003v2 typecheck
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell没有Node时按根规则加载工作区Node runtime。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置代理并重试原命令。
- 本任务复用既有 PixiJS、WeakMap adapter、manual motion和resource/player，不新增依赖、不修改lockfile。

## 10. 生成物、文档与规则

- 本任务无YAML、manifest、assets或生成器输入变化，不运行无关generator。
- `packages/rendercore` build生成`dist`，只由正式build更新；仓库若不跟踪dist则不纳入提交。
- 更新`packages/rendercore/README.md`和`docs/rendercore-operation-first-layer-api.md`，用统一render object示例取代两组clone/anchor说明。
- 更新`docs/crave-task203-manual-migration.md`作为当前外部接入说明；历史task 203计划/报告不回写。
- `docs/agent-rules/shared-game-runtime.md`只记录稳定边界：render object为Container-backed opaque façade、part strict selector、borrowed/owned与cleanup；不修改根`AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/205-rendercore-render-object-unification-<utctime>.md
```

报告简要记录最终API命名、实际文件、旧API移除情况、dynamic backing resolver、consumer迁移、验收结果、未完成人工验收和剩余风险。

## 12. 风险、假设与待确认

### 风险

- value跨tier会替换physical display；adapter若缓存旧Container，会造成anchor错误、clone旧外观或资源泄漏，必须以resolve-time测试保护。
- 把所有对象强制声明cloneable会让粒子/流式播放器产生伪实现，因此保留`RenderObject`与`CloneableRenderObject`能力分层。
- public对象若继承Container，consumer可绕过scope直接reparent/destroy，破坏borrowed symbol和repeat cleanup；本任务明确禁止。
- 一次性移除RenderNode命名会影响仓外未记录consumer；当前已知Crave只使用推导返回值和人工说明。若执行时发现真实仓外显式import合同，需先报告并决定是否安排有期限的迁移版本，不能默认保留永久alias。

### 假设

- value/text part只需要clone、anchor和通用render操作；业务写入继续通过SymbolRender现有typed方法即可。
- Scene Layout named node当前只需作为目标anchor，不需要升级为可clone/destroy的RenderObject。
- `RenderObject`首版不暴露bounds、size、world position或children；出现真实布局需求时另行设计opaque capability。

### 待确认

无。计划选择“内部基于Pixi Container，公共不继承Container”的安全facade，并把通用性集中在`RenderObject + getPart + clone/getAnchor + transfer`。

## 13. 完成清单

- [ ] whole symbol、text part、value part和普通文字对象统一满足RenderObject合同。
- [ ] 不再存在生产public RenderNode双命名或四个专用flight方法。
- [ ] strict part selector、dynamic backing、stale和ownership测试完整。
- [ ] presentation/attachment只消费统一对象且motion行为无回归。
- [ ] game003v2与Crave当前接入文档已迁移。
- [ ] RenderCore定向测试/typecheck/build、game003v2 test/typecheck和diff check通过。
- [ ] README、长期合同、领域规则和UTC中文执行报告同步。
- [ ] 浏览器人工验收明确记录为待用户完成。

## 14. 执行会话交接

执行会话应读取根`AGENTS.md`、本计划、`docs/agent-rules/shared-game-runtime.md`、任务199/201/203相关合同与报告，再核对Git基线和全仓`RenderNode`引用。允许按import cycle对新文件位置做不改变合同的小幅调整并记录；若需要公开Container、新增依赖、修改schema/assets、保留永久双API或扩大到业务流程，必须停止说明。除非用户明确要求，不commit、不push、不创建PR。
