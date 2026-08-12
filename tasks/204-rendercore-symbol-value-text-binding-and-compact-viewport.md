# 204 rendercore-symbol-value-text-binding-and-compact-viewport 任务计划

## 1. 目标与完成定义

### 目标

为 RenderCore 增加显式的 symbol presentation value → 命名 ImgNumber 文字绑定：游戏按
symbol 类型和 exact node name 配置同步 formatter，已有 `otherScene` 数值即可同时驱动滚动中的
`spinBlur` ImgNumber 和落停后的正常 ImgNumber，不再要求 Crave 对每个已落停 symbol 手工
`setText()`。同一 symbol 可配置多个命名 ImgNumber，RenderCore 不假设唯一 node。

同时修复 `maximized-focus` 在极窄或极小浏览器窗口中因浮点投影略小于 `focusRect` 而误报
`viewportSize.width cannot contain focusRect minMargin` 的问题；真正非法的 art/focus/margin 输入仍严格失败。

### 完成定义

- [ ] public typed 配置可按 exact symbol name 和 exact image-string node name 注册
      `(value: number) => string` formatter；一个 symbol 可有零到多个绑定。
- [ ] occurrence 获得 positive safe integer presentation value 时，所有已绑定 node 先完整格式化和校验，
      再与 value presentation 一次提交；任一 formatter、glyph、special image 或 node 失败均不留下部分更新。
- [ ] value 为 `null` 时不调用 formatter，并原子清空全部已绑定 node；pool release/destroy 不残留上一
      occurrence 的文字。
- [ ] 同一 occurrence 在滚动 strip、exact `spinBlur`、landing commit 和 settled state 间保持同一已格式化
      文字；profile/slot/overlay 切换不创建第二个 ImgNumber，也不在每帧重复调用 formatter。
- [ ] 未配置绑定的命名 node 继续由 `setText(name, text)` 独立控制；现有 `valuePresentation`、
      `setValue()`、`setText()`、standard/grid-cell spin 和旧 package 行为兼容。
- [ ] 极小、极窄、fractional page size 经 `calculateMaximizedFocusedArtViewport()`、Scene Layout viewport 和
      UI frame policy 调用时不因舍入误差抛错，结果有限、在 art bounds 内且完整容纳 focus。
- [ ] 直接传入确实小于 focus + margin 的 viewport、非法 focus/art/page size 仍显式失败，不引入任意像素
      tolerance 或静默降级。
- [ ] 不修改 Crave 源码；新增任务 204 人工迁移文档，说明 formatter 注册、rolling 默认值、服务器
      `otherScene` target value、后续 `setValue()` 和旧 `setText()` 清理方式。
- [ ] public exports、README、最小长期规则、定向测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- `packages/rendercore` 的 symbol value/text binding types、严格注册校验、occurrence 原子同步和缓存。
- Symbols package catalog/reel registry 与 Scene Layout runtime 的 additive 配置入口。
- standard/grid-cell 的既有 presentation value 数据流回归：本地公开轮带 occurrence、target endpoint、
  `spinBlur` 与 landing 后 settled symbol。
- `maximized-focus` 浮点边界修复及 viewport/Scene Layout 定向回归。
- RenderCore API 文档、Crave 任务 204 人工迁移文档和稳定职责规则。

### 不包含

- 不在 RenderCore 解析 `otherScene`、component 或 WL/WM/CM 业务；数值选择、矩阵严格校验和业务时序仍由
  Crave/LogicCore operation handler 负责。
- 不把 formatter 写进 Symbols/Layout manifest，不修改 Symbols Editor、ImgNumber v1 schema、ZIP、YAML、
  generated files 或正式 `assets/**`。
- 不自动选择唯一 image-string node，不按 symbol/node 名猜 formatter，不默认 `String(value)`、`x${value}`
  或首项 fallback。
- 不在 runtime 生成 blur 资源；normal/`spinBlur` profile 继续使用 Symbols package 已显式准备的资源。
- 不修改 `/Users/zerro/gitee.com/pixicrave` 或本仓库 game002v2/Crave app 源码，不替用户执行外部迁移。
- 不改变 focus 适配产品策略、manifest geometry 或 UI 最小可用尺寸；只修复可证明的浮点误判。

## 3. 制定计划时的基线

```text
UTC: 2026-08-12T10:02:34Z
HEAD: 8deb918ac3955ec1f31aa8dab4e23a653831b803
branch: (detached HEAD)
git status --short --untracked-files=all: <clean>
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,game002,scene-layout}.md`、任务 175/202/203 计划与任务 203
  Crave 人工迁移文档；目标目录无补充 `AGENTS.md`。
- `RenderSymbol.setPresentationValue()` 当前把 occurrence 数值交给可选 value controller；无
  `valuePresentation` 时只保存 number，不会更新命名 `imageStringNodes`。任务 203 因此只能指导 Crave 在
  landing 后逐格调用 `symbol.setText("multiplier", formattedValue)`，无法覆盖滚动 strip 的 blur occurrence。
- `RenderReel`/`TemporaryReelStrip` 已把 resolver 产生的本地值、current endpoint 和 target endpoint 值随
  occurrence 冻结，并在 `renderAtY()`/landing 调用 `setPresentationValue()`；本任务应复用该唯一数值通道，
  不新增 spin callback 或第二份 reel state。
- `SymbolImageStringController` 已支持多个 exact-name node、stable container、normal/`spinBlur` profile、
  Spine slot/顶层 overlay切换和 pool reset，但只有单 node `setText()`，缺少多 node 预检/原子提交 seam。
- `createSymbolPackageReelRegistryFromCatalog()` 是 package catalog 到 occurrence factory 的共同入口；
  `createSceneLayoutPackageRuntime()` 在 standard/grid-cell 间创建该 registry，是 Crave 可配置 formatter 的
  合适 additive facade。
- 截图堆栈落在 `calculateMaximizedFocusedArtViewport()` → `calculateFocusedArtViewport()`。当 page 很小或
  root/client size 为 fractional 值时，理论上等于 focus 边长的反投影可能成为 `focusWidth - ε`，当前
  无 tolerance 的 `< minimumWidth` 检查把它误判为非法；直接非法输入的 strict test 已存在。
- 本规划会话只新增本计划，不实施、不安装依赖、不运行构建或测试。当前 shell 未加载 Node；执行会话按
  第 9 节切换仓库要求的 Node 24。

## 4. 需求解释与技术决策

### 需求解释

- “一类 symbol 配置一个 string function(val)”解释为 runtime code 配置，不是可序列化 manifest 函数。
  为支持一个 symbol 多个 ImgNumber，配置粒度必须细化到 `symbol → exact node → formatter`。
- formatter 的输入是 RenderCore 已有的 positive safe integer presentation value。`null` 表示当前
  occurrence 无业务值，由 runtime 清空绑定 node，不把 null/0/空值传给 formatter猜语义。
- “spin 模糊同步”不增加特殊回调：rolling occurrence 先取得本地/默认 presentation value，再进入
  `spinBlur`；同一 node controller 将已格式化 text 切到 blur profile。target landing 则在原子落停时采用
  服务器 `otherScene` value，切回 normal 后保留相同文字。
- 截图 bug 是有效 page size 的数值稳定性问题；只有可按 machine epsilon 证明的误差可被吸收。

### 关键决策

1. **使用显式 per-symbol/per-node formatter map**
   - public 形态接近：

     ```ts
     const valueTextBindings = {
       WL: { multiplier: (value: number) => `x${value}` },
       WM: { multiplier: (value: number) => `x${value}` },
       CM: { multiplier: (value: number) => `x${value}` },
     } satisfies SymbolValueTextBindingMap;
     ```

   - `createSymbolPackageReelRegistry(FromCatalog)` 接受该配置；Scene Layout package runtime 提供同名
     additive option并下传。unknown symbol、非 display symbol、unknown node、重复/非函数 formatter 在
     reel 可见前失败。
   - 不把配置塞进 `presentationValueResolver`：resolver 决定“这个 occurrence 是哪个 number”，binding
     只决定“这个 number 如何显示”，两者职责独立。

2. **一个数值事务驱动 value tier 与多个命名 node**
   - `RenderSymbol.setPresentationValue(value)` 先计算全部 formatter 结果并验证 exact node/glyph/special、
     value tier与格式结果类型，再一次提交 value controller和全部 text。
   - formatter 必须同步、确定性地返回 non-empty string；抛错、返回非string或空string均显式失败。
     只有`null`清理路径可以写入空文字，不用formatter空值掩盖缺glyph。
   - 失败恢复旧 number、tier、每个 text/profile/attachment；不得出现一个 node 已更新、另一个仍旧值。
   - `null` 清空全部绑定 node并清除 value；无绑定 node和未绑定 node保持现状。

3. **状态切换复用同一文本和 container**
   - formatter只在 presentation value 变化或绑定 node 被显式写入后需要重新同步时调用；普通
     `renderAtY()` 重绘和 stable state/profile切换不重复执行游戏函数。
   - `spinBlur` 仍由 `SymbolImageStringController.syncState()` 选择 explicit blur profile并移动同一
     container；landing只提交 target value/state，不另行 `setText()`、clone或创建 overlay。
   - 手工 `setText()` 保持兼容，作为该 node 的显式最后写入并使其自动同步缓存失效；下一次
     `setValue()`即使number相同也重新应用绑定一次。Crave迁移后同一业务路径不得同时维护自动binding和
     逐格手写第二套值。

4. **只在最大化投影边界规范化浮点误差**
   - `calculateMaximizedFocusedArtViewport()` 对 page/focus scale 反投影结果做 scale-aware epsilon
     normalization：理论下界是 focus width/height，理论上界是 art width/height。
   - 仅当差值位于由操作数 magnitude 和 `Number.EPSILON` 推导的容差内时 snap到精确边界；更大的不足
     继续交给 `calculateFocusedArtViewport()` 抛错。直接 API 的 minMargin strict contract不放宽。
   - 对 width/height、极小整数/fractional page、重复resize和 near-art-cap 同时回归，避免只修截图宽轴。

## 5. 职责与合同

- **Crave/游戏层**：从权威 component `otherScene` 选择 target values，决定 rolling occurrence 的本地公开
  默认值、WL/WM/CM formatter和变值时机；不得读取或推断服务器真实轮带。
- **RenderCore reel**：把 resolver/current/target presentation value随 occurrence冻结，在 blur和landing
  边界调用同一 symbol value事务；不理解数字业务含义。
- **RenderCore symbol**：拥有 formatter binding校验、多node原子文字更新、value tier组合、缓存、pool
  reset和stale/destroy失败。
- **Symbols package**：继续拥有 exact node、normal/blur ImgNumber resource、glyph/special closure、target/
  slot/transform；runtime binding不修改package内容。
- **Viewport**：maximized projection拥有数值规范化；focused viewport继续拥有严格geometry/margin验证。
- **失败策略**：unknown symbol/node、非法value、formatter抛错/非string、缺glyph/special/profile、transaction
  中途失败、stale/destroy和真实不可能viewport均显式失败；画面保留上次完整提交。
- **禁止行为**：不硬编码WL/WM/CM、`multiplier`、`x`前缀、otherScene索引、首node、路径或blur fallback；
  不复制image-string state machine，不让formatter接触Pixi/display tree。

## 6. 文件范围

### 预计新增

```text
docs/crave-task204-manual-migration.md
tasks/204-rendercore-symbol-value-text-binding-and-compact-viewport-<utctime>.md
```

执行时可在现有 symbol 目录新增一个窄化的 binding module/test；若无需独立 owner则留在现有模块。

### 预计修改

```text
packages/rendercore/src/symbol/{types,render-symbol,catalog,package}.ts
packages/rendercore/src/symbol-image-string/{types,controller,mapped-display}.ts
packages/rendercore/src/reel/{types,symbol-registry}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/src/viewport/focused-art-viewport.ts
packages/rendercore/tests/symbol/**
packages/rendercore/tests/symbol-image-string/**
packages/rendercore/tests/reel/**
packages/rendercore/tests/scene-layout/{package-runtime,geometry}.test.ts
packages/rendercore/tests/viewport/focused-art-viewport.test.ts
packages/rendercore/README.md
docs/rendercore-operation-first-layer-api.md
docs/agent-rules/shared-game-runtime.md
```

只修改实际需要的文件；glob表示候选测试目录，不授权顺手重构。

### 原则上不应修改

```text
apps/**
assets/**
packages/{logiccore,gameframeworks,uiframeworks}/**
packages/rendercore/src/image-string/{manifest,layout,resource}.ts
docs/agent-rules/game002.md
AGENTS.md
pnpm-lock.yaml
```

若实现需要修改manifest/schema、正式资源、Crave/app源码、uiframeworks public contract、依赖或lockfile，
属于明显范围扩张，必须先停止说明，不能修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线并固定回归**
   - 重核HEAD/status、本计划、shared/game002/scene-layout规则和任务203迁移合同。
   - 增加最小fixture，证明当前named node多实例、value presentation、rolling/target value、blur profile、
     pool reset及viewport严格失败基线。

2. **建立 typed binding 与注册期验证**
   - 定义/export formatter、per-node binding和per-symbol map；规范化为冻结结构。
   - 在package registry/catalog seam校验display symbol、node name和function；Scene Layout runtime additive option
     原样下传，不复制校验。

3. **实现多node原子value/text事务**
   - 给image-string controller增加无画面mutation的batch preflight与一次commit能力；formatter结果先全量
     求值/验证。
   - 组合现有value controller与named nodes；完成rollback、same-value缓存、manual `setText()` invalidation、
     null clear、pool release、clone/stale/destroy合同。

4. **接入rolling、blur和landing既有数值通道**
   - 不改spin状态机，只验证local resolver、current endpoint和target presentation values进入同一事务。
   - 覆盖一个symbol两个node、多个symbol不同formatter、normal→spinBlur→landing→normal、target变值、
     selective/full spin和未配置node不受影响。

5. **修复compact viewport浮点边界**
   - 在maximized projection helper实现epsilon normalization，保持direct focused viewport strict validation。
   - 增加极小/fractional page、宽/高两轴、near cap、重复调用和真实非法输入测试；Scene Layout package
     runtime使用Crave同类`2000×2000` art/`840×1200` focus做一条集成回归。

6. **编写Crave人工迁移文档**
   - 以任务203现有`setText("multiplier", ...)`为迁移起点，给出runtime formatter注册、WL/WM/CM exact
     node配置和旧逐格setText残留搜索。
   - 说明rolling/default value只能来自本地公开轮带/游戏显式resolver，landing target采用已严格编译的
     `otherScene` presentation matrix；后续倍率变化统一`symbol.setValue(nextValue)`。
   - 明确文档不代表Crave已修改或已通过浏览器验收。

7. **文档、验收与报告**
   - 更新RenderCore README、第一层API文档和最小shared规则；不把WL/WM/CM资源清单写入长期规则。
   - 运行第8节L2命令，记录失败归因；生成UTC中文执行报告并列出Crave人工迁移/浏览器验收状态。

## 8. 测试与验收

### 测试原则

- formatter测试断言调用次数、exact value、两个node原子结果和错误后的完整旧快照，不只断言最终一个文本。
- spin测试必须观察实际rolling occurrence进入`spinBlur`和landing后的同一target值；settled后补一次
  `setText()`不能冒充spin全程同步。
- viewport测试使用能产生浮点边界的极小/fractional尺寸，并保留明显不足、非法margin和art bounds失败。
- 不为兼容错误fixture增加symbol名、首node、空string、normal资源或viewport fallback。

### 验收级别

采用 `L2`：修改RenderCore跨symbol/reel/Scene Layout的public additive contract，并为外部Crave consumer
交付迁移文档；viewport helper也被UI frame policy直接消费。无需L3，因为不改根工具链、lockfile、正式
schema/资源或大规模跨包实现。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test -- tests/symbol tests/symbol-image-string tests/reel/spin-strip.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/geometry.test.ts tests/viewport/focused-art-viewport.test.ts
pnpm --filter @slotclientengine/rendercore build
pnpm exec prettier --check packages/rendercore/README.md docs/rendercore-operation-first-layer-api.md docs/crave-task204-manual-migration.md docs/agent-rules/shared-game-runtime.md tasks/204-rendercore-symbol-value-text-binding-and-compact-viewport.md
git diff --check
```

测试命令按目录运行symbol核心用例，是因为事务跨 `RenderSymbol`、controller、registry和reel occurrence；
不升级为RenderCore或整仓全量test。

### 人工验收

由用户在人工应用迁移文档后的Crave完成：

1. WL/WM/CM在实际spin滚动中显示对应blur multiplier，落停当帧切normal且值与该格`otherScene`一致；
   后续倍率变化和normal/feature/win状态保持。
2. 临时把同一symbol绑定两个ImgNumber node，确认两者同步、资源外观/slot各自正确且无第二container。
3. 将浏览器缩到截图同类极窄宽度并反复resize，确认无控制台异常、frame/reel/popup继续对齐；恢复普通尺寸
   后无stale crop。

自动化结果不得写成Crave已迁移或真实浏览器已通过。

### 独立验收建议

`建议`。涉及跨模块public contract、多node原子mutation、pool/blur occurrence连续性和UI viewport边界；不涉及
credential、服务器真实轮带、正式ZIP或release。独立复验聚焦：formatter失败零部分提交、rolling→landing
连续性、epsilon只吸收舍入误差。最多复跑：

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test -- tests/symbol tests/reel/spin-strip.test.ts tests/viewport/focused-art-viewport.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的Node 24和pnpm。当前shell没有Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不新增依赖、不修改lockfile。依赖确实缺失时才运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置现有HTTP/HTTPS代理并重试原命令。

## 10. 生成物、文档与规则

- 本任务不应产生YAML/manifest/generated/assets变更；若意外触发，停止确认范围。
- `packages/rendercore/README.md`与`docs/rendercore-operation-first-layer-api.md`记录formatter注册、null、
  atomicity、manual override、rolling/landing和多node示例。
- `docs/crave-task204-manual-migration.md`是唯一Crave改法交付，明确基线、逐文件入口、示例、残留搜索、
  typecheck/test和人工验收；不复制外部整文件，不宣称已应用。
- `docs/agent-rules/shared-game-runtime.md`只补“presentation value到命名node必须显式binding，不能猜唯一node”
  的稳定边界；game002具体formatter/节点名只留在迁移文档，不修改根`AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/204-rendercore-symbol-value-text-binding-and-compact-viewport-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终API/文件、atomic/viewport决策、实际命令与结果、
计划偏差、Crave未应用状态、人工验收和剩余风险，不收集无关coverage或全仓统计。

## 12. 风险、假设与待确认

### 风险

- formatter是游戏函数；若依赖外部可变状态会让相同value得到不同文字。合同需要求同步确定性，并通过缓存
  避免每帧调用，但无法替游戏证明纯函数。
- 多node与value tier组合失败需要真正transaction；只依赖每个renderer单独原子的`setText()`仍会产生跨node
  半提交，测试必须以故意让第二node失败来保护。
- rolling中间occurrence没有服务器`otherScene`；Crave若不提供本地公开默认value resolver，对应node按null
  正确隐藏，RenderCore不能伪造倍率。
- epsilon过大可能掩盖真实geometry错误，过小则仍会在某些fractional resize复现；实现必须从操作数规模推导
  并用两侧边界fixture锁定。

### 假设

- Crave当前WL/WM/CM使用exact node `multiplier`和`x${value}`，依据任务203迁移文档与game002规则；这只用于
  迁移示例，不成为RenderCore硬编码。
- rolling与target presentation value已经沿现有`TemporaryReelStrip`/landing transaction传递；任务只把同一
  value桥接到named nodes，不新增业务数据源。
- 截图中的有效manifest使用`maximized-focus`，当前`assets/crave/layout.manifest.json`为`2000×2000` art和
  `840×1200` focus，可作为只读同类fixture但不修改资源。

### 待确认

无。formatter命名可在实施时按当前public type风格小幅调整，语义、配置粒度和strict边界不得改变。

## 13. 完成清单

- [ ] value→named node binding支持多symbol/多node，且无业务硬编码或唯一node猜测。
- [ ] formatter/value tier/text/profile更新先完整preflight，失败无部分mutation。
- [ ] rolling、spinBlur、landing、settled、manual setText、null/pool/destroy合同均有回归。
- [ ] compact/fractional maximized-focus不误报，真实非法viewport仍失败。
- [ ] Crave源码与正式assets未修改，任务204人工迁移文档完整且未冒充已应用。
- [ ] public exports、README、API文档和最小shared规则已同步。
- [ ] 指定L2自动化通过，人工/独立验收状态明确。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的三份领域规则和本计划；
2. 核对Git基线与工作区，保留用户无关修改；
3. 按“explicit per-symbol/per-node binding + existing presentation value channel + epsilon-only viewport fix”实施，
   不重新设计为manifest函数、spin callback或唯一node约定；
4. 小幅路径/type命名适配写入报告；触发manifest、assets、app/Crave源码、uiframeworks contract、依赖或lockfile
   扩张时先停止说明；
5. 只运行第8节L2验收，不升级整仓；
6. 完成后生成UTC报告，明确Crave人工迁移与浏览器验收是否仍待用户执行；
7. 除非用户另行明确要求，不commit、不push、不创建PR。
