# Task 124：配置驱动的通用 Round / Cascade 编排与 Symbol Policy

## 1. 任务目标

Task 124 承接 Task 123 的运行时配置器与 GameViewer，在不改变 `game002` 现有生产表现的前提下，把已经具有跨游戏复用价值的 round / cascade 编排下沉到共享包。

本任务重点解决两类问题：

1. 将 win、emphasis、remove、dropdown、refill、value continuity、collect、win-amount 等通用阶段编译为严格、可验证、可执行的 round plan，并由共享 coordinator 驱动。
2. 将“哪些 symbol 不 remove、不 drop、需要携带 value、可作为 sequential companion”等差异声明为严格配置，而不是散落在游戏代码里的条件分支或共享包里的 symbol 名硬编码。

完成后：

- `game002` 与 GameViewer 必须走同一套共享 round compiler / coordinator。
- `game002` 现有结果、时序、动画完成边界和异常行为不得发生可观察退化。
- 对共享能力范围内的新游戏，接入方只需提供严格配置、资源包和少量业务 resolver，不再复制 cascade 状态机。
- GameViewer 不得通过“最终 scene 瞬间覆盖”冒充 cascade 完成。
- shared code 不得出现 `WL`、`CN`、`bg-win`、`bg-remove`、`Nearwin` 或具体游戏名等业务常量。

## 2. 基线与前置条件

### 2.1 代码基线

本任务应基于 Task 123 的最终提交或其已合并等价状态执行。

当前参考基线：

- Task 123 commit：`fa11da1`
- Task 123 计划：`tasks/123-gameviewer-runtime-configurator.md`
- Task 123 执行报告：`tasks/123-gameviewer-runtime-configurator-20260723T044915Z.md`

若执行时上述 commit 已进入其它分支或主分支，以包含同等功能的最新提交为准，并在 Task 124 报告中记录实际基线。

### 2.2 当前已知缺口

Task 123 已提供配置驱动的 runtime adapter，但当前 adapter 只覆盖了部分表现：

- 能按配置识别 round flow。
- 能请求部分 symbol win state。
- 能在末尾应用最终 scene。
- 尚未完整接入 remove → dropdown → refill movement。
- 尚未完整接入 occurrence value continuity / collect。
- 尚未完整接入 popup / win-amount trigger。
- 尚未达到 `game002` 当前生产路径的完整语义与视觉效果。

本任务不得通过增加 GameViewer 私有分支来补齐这些差异。差异应先抽象为共享能力，再由 `game002` 与 GameViewer 共同消费。

### 2.3 真实配置与资源基线

当前 `crave-v2.zip` 仅作为真实导入、资源闭包和人工验收样本，不得成为 shared code 的业务模板。

Task 123 报告中的参考记录：

- SHA-256：`3a96ebe392133765e5b33c96769277b9c8a6c499cce75bf5ceabc59aadecda9d`
- ZIP entries：`121`
- ZIP size：`13,324,796` bytes
- render mode：`grid-cell`

`docs/crave/crave.json` 当前可观察到的 component 仅可用于 fixture 和人工核对：

- `BasicReels2` → `bg-spin`
- `ClusterTrigger` → `bg-win`
- `GenSymbolVals2` → `bg-gencoins`
- `RemoveSymbols` → `bg-remove`
- `Respin` → `bg-respin`
- `DropDownSymbols2` → `bg-dropdown`
- `RefillSymbols2` → `bg-refill`

这些 component 名不得在 `logiccore`、`rendercore` 或 `gameframeworks` 中写死。

## 3. 核心设计原则

### 3.1 配置化的是 policy，不是任意脚本

本任务允许用结构化配置描述 symbol policy，但不允许配置任意 JavaScript、表达式字符串或动态回调代码。

配置必须：

- 有明确版本。
- 可在 session 创建前完整解析和校验。
- 只引用 active symbol package 中存在的大小写敏感 symbol code。
- 能被序列化、导出、再次导入并保持同一语义。
- 对未知字段、未知版本、重复项和非法组合显式失败。
- 不使用 symbol 名猜测、默认 wild、路径猜测或宽泛 fallback。

### 3.2 先编译，后改变画面

一个 server round 在产生视觉 mutation 前，必须先被编译为不可变 execution plan。

编译阶段至少完成：

- component/result/otherScene 索引校验。
- scene 尺寸与 occurrence 身份校验。
- remove/drop/refill 目标位置校验。
- symbol policy 校验。
- value 来源与 continuity 校验。
- group 顺序和并发关系校验。
- 所需 renderer capability 校验。

若任一阶段无法严格确定，必须在开始本轮视觉 mutation 前失败，不能播放到一半才依靠 fallback 修复。

### 3.3 业务名留在 app/config，算法进入 shared

共享包拥有：

- round plan schema 与严格 parser。
- 通用 GMI 数据到 execution plan 的编译。
- emphasis / win / remove / dropdown / refill / collect 的阶段编排。
- occurrence 与 value 的连续性。
- renderer capability 调度与真实 completion drain。
- fatal cleanup、next-spin cleanup 与 destroy。

游戏 app 或配置拥有：

- component name 到通用 role 的显式映射。
- symbol policy 中的具体 symbol code。
- cash、coin、symbol value、companion 等业务字段 resolver。
- formatter、样式、layout anchor。
- anticipation、Nearwin、矿车、传送带等游戏专属 extension。

### 3.4 不以 grid-cell 实现代替所有 renderer

shared coordinator 必须依赖 capability contract，而不是依赖具体 ReelSet class。

以下组合均要有真实测试：

- standard reel + base round
- standard reel + cascade round
- grid-cell reel + base round
- grid-cell reel + cascade round

禁止为了通过测试：

- 在 standard reel 路径构造隐藏的 grid-cell renderer。
- 在 base round 路径调用 cascade-only API。
- 用 `instanceof RenderGridCellReelSet` 决定业务编排。

## 4. 范围

### 4.1 本任务包含

- 审计并锁定 Task 123 已引入的 round-flow 配置语义。
- 将 symbol remove/drop/value/companion 规则落实为端到端严格 policy。
- 建立共享 immutable round execution plan。
- 建立共享 compiler 与 runtime coordinator。
- 复用 `rendercore` 已有 symbol state、dimming、release、dropdown、refill、collect、win-amount primitives。
- 将 `game002` 的通用 cascade 编排迁移到 shared coordinator。
- 保留 `game002` 的业务 resolver 和专属 extension。
- 将 GameViewer configured adapter 改为使用同一 coordinator。
- 补齐 standard / grid-cell 的 capability adapter。
- 用 characterization trace 保证迁移前后 `game002` 等价。
- 更新相关文档、测试和 `AGENTS.md` 稳定约束。

### 4.2 本任务不包含

- 在浏览器里模拟或执行完整服务端 graph。
- 修改 `crave-v2.zip` 的资源内容。
- 新增另一套 ZIP schema 或 editor resource 算法。
- 把 GameViewer 变成业务代码编辑器。
- 将 server authoring JSON 直接交给 renderer。
- 泛化 game003 的 `bg-bar`、矿车或其它 app extension。
- 自动推断 free-game / bonus-game mode transition。
- 在 shared code 中硬编码 `game002` 的 Nearwin 名、WL/CN 名或 component 名。
- 用 wall-clock timer 伪造 Spine/VNI completion。
- 为不支持的业务组合增加静默降级。

## 5. 包职责

### 5.1 `packages/logiccore`

新增或完善：

- 严格版本化的 round-flow 配置 schema。
- symbol policy parser 与 active catalog 校验。
- server round snapshot 到 immutable execution plan 的纯函数 compiler。
- component、result、scene、otherScene、position 和 value 的严格一致性检查。
- 只包含数据与语义，不依赖 Pixi、DOM、VNI 或 Spine。

建议导出：

```ts
export interface SlotRoundFlowProfileV1 {
  readonly kind: "slot-round-flow";
  readonly version: 1;
  readonly components: SlotRoundComponentRolesV1;
  readonly cascade?: SlotCascadeFlowProfileV1;
}

export interface SlotCascadeSymbolPolicyV1 {
  readonly emptyCode: string;
  readonly removeExcludedSymbols: readonly string[];
  readonly dropHeldSymbols: readonly string[];
  readonly valueSymbols: readonly string[];
  readonly sequentialWinCompanionSymbols: readonly string[];
}

export function parseSlotRoundFlowProfile(
  input: unknown,
  context: SlotRoundFlowProfileParseContext,
): SlotRoundFlowProfileV1;

export function compileSlotRoundExecutionPlan(
  profile: SlotRoundFlowProfileV1,
  round: SlotRoundSnapshot,
  context: SlotRoundCompileContext,
): SlotRoundExecutionPlan;
```

具体名字可按仓库现有命名调整，但职责边界不得改变。

### 5.2 `packages/rendercore`

新增或完善：

- 通用 presentation capability contract。
- plan step 到真实 renderer operation 的 coordinator。
- 标准 ReelSet 与 GridCell ReelSet 的 capability adapter。
- 对已有 `SymbolCascadePlayer`、symbol carousel、counter、win-amount player 的组合。
- 每帧 update、真实 once/loop completion、并发 active-item drain。
- rollback / cleanup / destroy。

`rendercore` 不解析 server graph，不拥有 component 名，也不判断某 symbol 是否 wild 或 coin。

### 5.3 `packages/gameframeworks`

负责：

- 将 live session、logic compiler 与 render coordinator 组合成模板级生命周期。
- session prepare 完成后创建一次 runtime。
- 每轮将规范化 round snapshot 交给 compiler。
- 将 plan 交给 coordinator 并等待规定的阻塞边界。
- 对 app extension 提供严格、类型化的生命周期 hook。
- 不复制具体 renderer 算法。

### 5.4 `apps/game002`

迁移后只保留：

- component role 映射。
- symbol policy 的具体 code 配置。
- cash / coin / value / result resolver。
- CN collect 分配与业务一致性校验所需 resolver。
- formatter、样式、layout。
- anticipation / Nearwin 业务 extension。
- 游戏 URL、skin、lines 与 live server 约束。

以下通用状态机应从 app 中移除或收敛为薄 adapter：

- 通用 win → emphasis → remove 编排。
- 通用 hole / dropdown / refill plan 编排。
- 通用 occurrence value 搬运。
- 通用 active animation drain。
- 通用 next-spin/fatal cleanup。

### 5.5 `apps/gameviewer`

只负责：

- 编辑、导入、导出并校验 round-flow profile。
- 展示 server authoring suggestion 与用户确认后的 runtime config。
- 展示 readiness 和缺失能力。
- 通过 `gameframeworks` facade 启动 runtime。

禁止：

- 导入 Pixi/rendercore implementation。
- 私自执行 remove/drop/refill。
- 写一套只服务于 GameViewer 的 cascade 状态机。
- 把 server raw repository/graph 放入 runtime config。

## 6. Symbol Policy 配置语义

Task 123 已存在以下字段，本任务优先锁定并实现其 V1 语义：

```ts
interface SlotCascadeSymbolPolicyV1 {
  emptyCode: string;
  removeExcludedSymbols: string[];
  dropHeldSymbols: string[];
  valueSymbols: string[];
  sequentialWinCompanionSymbols: string[];
}
```

若现有字段无法无歧义表达所需语义，应新增 `version: 2`，不得静默改变已提交 V1 的含义。

### 6.1 `emptyCode`

- 表示 scene 中的显式空格 code。
- 必须与 symbol catalog 的展示 symbol 区分。
- remove 后形成的 hole 必须严格对应此 code。
- 不允许同时被列入其它 symbol policy 数组。

### 6.2 `removeExcludedSymbols`

语义：

- 该 symbol 可以参与 result、emphasis 和 win presentation。
- 该 occurrence 不因通用 remove step 被 release。
- remove 后的权威 scene 必须仍能与该 occurrence 对应。
- 该字段只决定 remove 行为，不隐式决定 dropdown 行为。

示例：`game002` 可配置 `["WL"]`，但 shared code 不知道 `WL` 的业务含义。

### 6.3 `dropHeldSymbols`

语义：

- dropdown 时该 occurrence 保持在原 cell。
- 其它 occurrence 是否能越过该 cell，必须由通用 drop plan 的精确规则决定，不得由视觉碰撞或 z-index 推断。
- 被 hold 的 occurrence 保留其 renderer identity、animation continuity 和 value。
- 该字段不自动代表 remove-excluded；若两种语义都需要，必须同时出现在两个数组中。

### 6.4 `valueSymbols`

语义：

- occurrence 具有业务 value，value 必须随 occurrence identity 在 dropdown 中搬运。
- 已存在 occurrence 的 value 不允许通过最终 scene 猜测或重新随机生成。
- refill 新建的 value occurrence 必须从该 step 的显式权威数据获得。
- 无法确定新 value 时显式失败。
- 非 value symbol 对应的 value payload 必须符合游戏 resolver 定义的空值约束。

具体 value 字段、单位和 formatter 仍由 app resolver 提供。

### 6.5 `sequentialWinCompanionSymbols`

语义：

- 允许该 symbol 作为某个 sequential value group 的 companion。
- companion 可与 value items 同边界启动自身 win。
- companion 不自动贡献 item value。
- companion 不自动进入 collect / end 生命周期。
- companion 是否 remove/drop 仍分别由前两个 policy 字段决定。
- 未明确允许的 presentation 混用必须失败。

### 6.6 校验规则

parser 至少校验：

- 所有数组均显式存在；允许空数组。
- 数组内部不允许重复 symbol。
- symbol code 大小写敏感。
- 所有 code 必须存在于 active symbol package 或等价 catalog 中。
- `emptyCode` 不允许出现在任一 policy 数组。
- 数组之间允许有业务上合理的交集。
- 交集不会产生隐式语义；每个字段只负责自己的行为。
- 不允许根据 `WL`、`wild`、`coin` 等名称自动补配置。

### 6.7 配置作用域

V1 policy 至少绑定：

- 一个 round-flow profile。
- 一个明确的 active symbol package。
- 一个明确的 layout variant。

若不同 mode / variant 的 symbol package 或规则不同，必须分别配置，不能从另一个 mode 继承可编辑 policy。

## 7. Immutable Execution Plan

compiler 输出的 plan 必须是 renderer 无关、不可变且可测试的数据结构。

建议结构：

```ts
interface SlotRoundExecutionPlan {
  readonly version: 1;
  readonly initial: SlotInitialPresentationPlan;
  readonly steps: readonly SlotRoundExecutionStep[];
  readonly finalScene: SlotSceneSnapshot;
  readonly finalValues: SlotValueSnapshot;
  readonly completion: SlotRoundCompletionPlan;
}

type SlotRoundExecutionStep =
  | SlotWinGroupStep
  | SlotRemoveStep
  | SlotDropdownStep
  | SlotRefillStep
  | SlotSequentialCollectStep
  | SlotWinAmountStep;
```

每个 step 应包含稳定 occurrence id 或稳定 cell identity，而不是仅包含 symbol code。

至少记录：

- step index。
- 输入 scene / value snapshot。
- 输出 scene / value snapshot。
- 受影响的位置。
- symbol code。
- occurrence movement。
- 新建、保留、释放的 occurrence。
- state request 与 completion 要求。
- group 顺序、并发边界和 cadence。
- policy 决策的已解析结果。
- 所需 renderer capability。

renderer 不应再次解释 component result 来决定业务语义。

## 8. Renderer Capability Contract

### 8.1 基础能力

所有 reel presentation target 至少支持：

- 获取当前可见 scene snapshot。
- 获取稳定可见 occurrence snapshot。
- 请求 symbol state 并返回 completion handle。
- 设置或清理非中奖 occurrence dimming。
- 持续 update。
- next-spin cleanup。
- fatal cleanup。
- destroy。

### 8.2 Cascade 能力

支持 cascade 的 target 额外提供：

- 按 occurrence 释放指定 symbol。
- 校验 release 后的 hole snapshot。
- 根据已编译 movement 启动 dropdown。
- 保持 occurrence identity 与 value。
- 根据已编译 refill plan 创建新 occurrence。
- 等待真实 movement / appear completion。
- 在每个阶段提供稳定 scene/value snapshot。

接口可以复用或适配现有：

- `releaseVisibleSymbols`
- `setVisibleSymbolDimming`
- `setVisibleSymbolValues`
- `startCascadeDrop`
- grid-cell refill / selective spin primitives

不得为了统一接口而复制已有 Pixi 或 Spine 算法。

### 8.3 可选能力

以下能力通过显式 capability 或 injected player 暴露：

- sequential value collect。
- symbol win carousel。
- temporary summary counter。
- global win-amount。
- popup award celebration。
- anticipation / effect sweep extension。

plan 要求某能力而 runtime 未提供时，应在 round 开始前失败。

## 9. 通用编排语义

### 9.1 Initial

- 下一次合法 initial spin 开始时统一清理上一轮 lingering presentation。
- 应用本轮 initial scene / value。
- 等待 renderer 的真实 initial spin completion。
- initial spin 专属 expectation / anticipation 由 typed extension 接管。

### 9.2 Win 与 emphasis

- 根据 profile 中的稳定 group order 编排。
- dimming 开始边界与 opening win 请求边界应能声明为同一原子阶段。
- 所有中奖 occurrence 的 opening win 可并行启动。
- emphasis hold / restore 时序从 manifest/profile 获取。
- 后续 remove 等待已经启动的真实 win completion，不得重播 opening win。
- shared coordinator 不知道哪个 component 叫 `bg-win`。

### 9.3 Remove

- remove target 从权威 result 与 scene 编译。
- `removeExcludedSymbols` occurrence 不释放。
- 其它目标 occurrence 按稳定 group 顺序释放。
- release 后 scene 必须与编译期预期 hole snapshot 一致。
- 不允许把最终 scene 直接覆盖到当前 renderer 以跳过 remove。

### 9.4 Dropdown

- movement 由 remove 后 occurrence snapshot 与权威 dropdown scene 编译。
- `dropHeldSymbols` 保持原 cell。
- 其它 occurrence 的 movement 必须一一对应，不能只比较 symbol 多重集合。
- occurrence value 与 renderer identity 随 movement 保留。
- 同资源、同 animation 的 continuous playback 不得因 movement reset/replay。
- 提供 server otherScene 时严格比对；可确定性推导时允许按业务规则省略。

### 9.5 Refill

- 新 occurrence 只能进入真实 hole。
- refill 前后 scene 必须严格闭合。
- 新 value occurrence 必须得到显式 value。
- 非新建 occurrence 不允许被 refill 数据覆盖 value。
- appear / selective spin 的实际调度由 renderer capability 或 typed extension 执行。
- 所有 appear once completion 后才能进入依赖该边界的后续阶段。

### 9.6 Sequential value / collect

共享层负责：

- stable item order。
- state preset。
- cadence 启动。
- 并发 active item drain。
- loop boundary 与 pending state 推进。
- release 边界。
- companion lifecycle。

app resolver 负责：

- 哪个 component/result 提供 cash / coin。
- raw value 的正整数与安全范围校验。
- item value 与 group value 的精确一致性。
- cents 分配。
- formatter。

### 9.7 Win amount / popup

- coordinator 在所有 cascade step 与 active collect drain 完成后触发。
- raw bet/win、formatter、anchor、threshold/player config 由 app 注入。
- `awaiting-dismiss` 是否阻塞下一 spin，遵守对应通用 player contract。
- 下一 spin 统一清理残留 presentation。
- popup 或 win-amount 能力缺失但 profile 要求时显式失败。

### 9.8 Cleanup

以下边界必须有统一且可重复调用的 cleanup：

- next legal initial spin。
- round compile failure。
- runtime execution failure。
- live session fatal。
- adapter destroy。

cleanup 不得释放仍属于长期 runtime 的共享 texture/resource pool。

## 10. `game002` 迁移要求

### 10.1 先建立 characterization

在迁移 app 编排前，记录当前生产路径的事件 trace 与 scene/value snapshot。

至少覆盖：

1. 无中奖普通 spin。
2. 单个普通 symbol win + remove + dropdown + refill。
3. 多组、多个 cascade step。
4. WL 参与 win 但不 remove。
5. WL dropdown 时保持原 cell。
6. 既有 CN dropdown 后 value 连续。
7. refill 新增 CN，必须读取权威 value。
8. CN sequential collect 与 WL companion。
9. 非期待 refill 中达到 expectation gate。
10. 期待 existing-only dropdown → sweep → selective refill。
11. global win-amount 与临时 summary 清理。
12. fatal / destroy 中途清理。

trace 至少包含：

- state request 顺序。
- dimming 边界。
- completion wait 边界。
- release occurrence。
- movement start/end。
- scene snapshot。
- value snapshot。
- collect start/release。
- win-amount start/awaiting-dismiss/cleanup。

### 10.2 迁移顺序

1. 为现有 `game002` 路径增加 characterization，不改变实现。
2. 引入纯 compiler，用旧 runtime 消费 plan 做对照。
3. 引入 shared coordinator 与 capability adapter。
4. 让 `game002` 在测试开关下走新路径，比较完整 trace。
5. 处理所有可观察差异。
6. 默认切换到共享路径。
7. 删除或收敛旧的重复通用编排。
8. 保留业务 resolver 与专属 extension。

### 10.3 预期代码收敛

重点审计：

- `apps/game002/src/cascade-sequence.ts`
- `apps/game002/src/game-adapter.ts`
- `packages/rendercore/src/scene-layout/configured-round-adapter.ts`
- `packages/rendercore/src/reel/render-grid-cell-reel-set.ts`

最终：

- `cascade-sequence.ts` 不再拥有可跨游戏复用的完整状态机。
- `game-adapter.ts` 不再手工串联通用 win/remove/drop/refill。
- `configured-round-adapter.ts` 不再用 final-scene reset 代替真实 cascade。
- `RenderGridCellReelSet` 继续拥有底层 grid-cell 算法，但不拥有 component/symbol 业务语义。

## 11. GameViewer 与 framework 接入

### 11.1 配置界面

GameViewer 应展示并允许用户确认：

- component role mapping。
- `emptyCode`。
- remove excluded symbols。
- drop held symbols。
- value symbols。
- sequential companion symbols。
- 本 profile 所要求的 optional capabilities。

server authoring suggestion 只用于预填候选值：

- 用户必须显式确认。
- suggestion 不等于 runtime config。
- suggestion 变化不得静默改变已保存配置。

### 11.2 Readiness

启动按钮启用前至少校验：

- profile schema 合法。
- active symbol package 与 policy code 完整匹配。
- component role 无歧义。
- renderer 提供 plan 所需能力。
- value resolver / collect resolver 已提供。
- win-amount / popup 配置闭包完整。
- ZIP/runtime resource closure 已通过 Task 123 的严格检查。

### 11.3 Runtime

GameViewer 通过 framework facade 创建 runtime：

```ts
const game = await createConfiguredSlotGame({
  session,
  layoutPackage,
  roundFlowProfile,
  appResolvers,
  appExtensions,
});
```

名称仅为示意。GameViewer 不应获得 coordinator 的 Pixi target，也不应逐 step 手工调用 renderer。

## 12. 测试要求

### 12.1 `logiccore` 单元测试

覆盖：

- V1 profile 正常解析。
- 未知版本/字段失败。
- policy 重复项失败。
- 未知 symbol 失败。
- empty code 冲突失败。
- 数组交集按字段独立语义处理。
- component role 缺失/重复/歧义失败。
- remove 后 hole 不一致失败。
- dropdown occurrence 无法一一映射失败。
- refill 非 hole 写入失败。
- value continuity 丢失失败。
- 新 value occurrence 无权威 value 失败。
- companion 未批准混用失败。
- plan 编译输出稳定、不可变。

### 12.2 `rendercore` 单元与集成测试

使用 fake capability target 验证：

- 精确调用顺序。
- 并发 opening win 只启动一次。
- completion handle 被正确等待。
- removeExcluded 不 release。
- dropHeld 不 movement。
- value 随 occurrence movement。
- refill 新 occurrence 获得正确 value。
- sequential cadence 与 active drain。
- next-spin/fatal/destroy cleanup 幂等。
- capability 缺失在 mutation 前失败。

使用真实 renderer adapter 验证：

- standard reel + base。
- standard reel + cascade。
- grid-cell reel + base。
- grid-cell reel + cascade。
- normal/loop 同资源时 player continuity。
- appear once 真实完成。
- 每帧 update 在 win-amount 期间不冻结。

### 12.3 `game002` 回归测试

新路径 trace 必须与迁移前 characterization 对齐。

允许差异仅限：

- 内部类名。
- 不影响行为的日志文字。
- 测试中明确批准的非语义字段。

以下不得改变：

- scene。
- value。
- occurrence identity。
- state request 次数与稳定顺序。
- animation completion 边界。
- dimming、release、movement、collect、summary 和 win-amount 行为。

### 12.4 GameViewer 测试

覆盖：

- 真实 `crave-v2.zip` 导入。
- 配置 suggestion 与确认分离。
- symbol policy 编辑、保存、导出、重新导入。
- readiness 缺项精确提示。
- 四种 renderer/flow 组合。
- 不再存在只 reset final scene 的 cascade 路径。
- runtime config 不包含 raw server graph/repository。
- 浏览器异常可见且不被 silent fallback 吞掉。

### 12.5 硬编码审计

至少执行：

```bash
rg -n "WL|CN|bg-win|bg-remove|bg-dropdown|bg-refill|Nearwin|game002" \
  packages/logiccore packages/rendercore packages/gameframeworks
```

命中必须逐项解释：

- fixture/test 名允许位于明确测试资源中。
- shared production code 中不得出现这些业务常量。

## 13. 严格验收矩阵

| 场景 | 必须观察到的结果 |
| --- | --- |
| 普通 win cascade | win、emphasis、remove、dropdown、refill 均真实发生，不瞬切 final scene |
| remove-excluded symbol | 可以 win，但 occurrence 不 release |
| drop-held symbol | dropdown 前后保持原 cell、identity、playback 与 value |
| 普通 dropdown symbol | 按 plan 移动，允许按通用规则穿过 held occurrence |
| 既有 value symbol | dropdown 后 value 与原 occurrence 精确一致 |
| 新 value symbol | 仅从该 step 权威数据取得 value，缺失即失败 |
| sequential companion | 同边界启动自身 win，但不贡献 item value，不进入 collect |
| standard + cascade | 使用 standard capability 真实完成，不构造 grid-cell |
| grid-cell + base | 不调用 cascade-only API |
| animation continuity | 同 resource/playback 不 reset/replay |
| win-amount | cascade/collect drain 后播放，期间 reel runtime 持续 update |
| next spin | 清理 lingering presentation，保留长期资源池 |
| invalid profile | 创建 session 或 round mutation 前失败 |

## 14. 执行阶段

### Phase A：基线与 characterization

- 固定 Task 123 基线。
- 记录 `game002` 当前 trace。
- 固定 `crave-v2.zip` hash、size、entries。
- 汇总当前 configured adapter 与 production path 差异。

### Phase B：schema 与 compiler

- 锁定 V1 symbol policy。
- 增加 strict parser/catalog validation。
- 定义 immutable execution plan。
- 实现纯 round compiler。
- 完成 logiccore 测试。

### Phase C：capability 与 coordinator

- 定义基础/cascade capability。
- 适配 standard 与 grid-cell renderer。
- 组合现有 win/remove/drop/refill/collect/win-amount primitives。
- 完成 fake target 与真实 renderer 测试。

### Phase D：迁移 `game002`

- 将 app resolver/extension 接入 compiler/coordinator。
- 双路径 trace 对照。
- 修复所有 parity 差异。
- 默认启用共享路径。
- 删除重复通用状态机。

### Phase E：迁移 GameViewer

- 配置 UI 支持完整 symbol policy。
- readiness 接入 capability validation。
- configured runtime 使用共享 coordinator。
- 删除 final-scene reset 伪 cascade。

### Phase F：全量验收与文档

- 执行 package 与 root checks。
- 执行真实 ZIP smoke。
- 记录未执行 live smoke 的客观原因。
- 更新 `AGENTS.md` 稳定约束。
- 生成带 UTC 时间戳的 Task 124 报告。

## 15. 建议验证命令

执行时按实际 package script 调整，但至少覆盖：

```bash
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/game002 test
pnpm --filter @slotclientengine/gameviewer test

pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/game002 typecheck
pnpm --filter @slotclientengine/gameviewer typecheck

pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

若存在仓库现有专用脚本，应优先复用，不能以临时脚本替代正式测试。

## 16. 人工浏览器验收

自动化与代码验收通过后，启动 GameViewer 供用户进行最终浏览器验收。

人工验收至少包含：

1. 导入真实 `crave-v2.zip`。
2. 加载或填写真实服务器参数。
3. 检查 round-flow 配置与 symbol policy。
4. 启动 session。
5. 覆盖无中奖、普通 cascade、多 cascade、WL hold、CN value/collect、win-amount。
6. 对照 `game002` 的阶段、落点、动画、压暗、value、collect 和清理效果。
7. 确认浏览器 console 无未处理异常。

用户负责最终浏览器效果判定；执行者负责在交付前完成除主观视觉判定以外的严格自动化验收，并提供可复现 URL 与参数说明。

## 17. 文档与执行报告

实现完成后：

- 更新 `AGENTS.md`，明确 shared coordinator、symbol policy 与 app extension 的稳定边界。
- 若新增公开 schema/API，更新对应 package 文档。
- 若 Task 123 文档中的“已知缺口”已消除，补充交叉引用，不篡改原始执行事实。
- 生成执行报告：

```text
tasks/124-configured-round-cascade-orchestration-[utctime].md
```

UTC 时间戳使用：

```bash
date -u +%Y%m%dT%H%M%SZ
```

报告至少记录：

- 实际基线 commit。
- 变更文件。
- 配置 schema 与版本决策。
- package ownership 决策。
- `game002` 迁移前后 trace 对照。
- 四种 renderer/flow 组合结果。
- 真实 ZIP hash、size、entries 与 readiness。
- 全部验证命令及结果。
- live/browser smoke 是否执行。
- 未完成项与风险。

## 18. 完成定义

只有同时满足以下条件，Task 124 才可标记完成：

- symbol remove/drop/value/companion policy 已严格配置化并端到端生效。
- shared production code 无游戏 symbol/component 名硬编码。
- round 在视觉 mutation 前完整编译并校验。
- GameViewer 不再用 final-scene reset 代替 cascade。
- `game002` 与 GameViewer 使用同一 shared compiler/coordinator。
- `game002` characterization 与新路径无未批准的可观察差异。
- standard/grid-cell × base/cascade 四种组合均通过测试。
- occurrence identity、animation continuity 与 value continuity 均有测试。
- collect、win-amount、cleanup 的阻塞边界有测试。
- package 与 root checks 全部通过。
- `AGENTS.md` 与公开文档已同步。
- Task 124 执行报告已生成并如实记录浏览器验收状态。

