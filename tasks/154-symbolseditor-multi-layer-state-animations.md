# 154 symbolseditor-multi-layer-state-animations 任务计划

## 1. 目标与完成定义

### 目标

为 Symbols Editor 和 rendercore Symbols runtime 增加 state 级多图层动画：某个 symbol
state 可明确选择一份基础图标，并在其下方或上方叠加一个或多个独立 Spine/VNI 动画层。
编辑器预览、Symbols ZIP 导出/重导和 production runtime 必须保持相同顺序、播放与清理
行为。

### 完成定义

- [x] 非 value-presentation symbol 的任意已添加 state 可显式启用多图层模式，并选择
      `normal` 基础图标或该 state 的独立静态图片作为 base；不从文件名或其它 state 猜测。
- [x] 每个多图层 state 可新增、删除、重排多个动画层；每层有稳定且不重复的 id、明确的
      `underlay | overlay` 位置以及一份 exact Spine 或 VNI binding。
- [x] underlay 始终渲染在 base 下，overlay 始终渲染在 base 上；同一位置按 manifest 数组
      顺序稳定叠放，不受异步资源初始化完成顺序影响。
- [x] Spine 层显式选择 skeleton/atlas/texture、大小写精确 animation 与 transform；VNI 层
      显式选择 project 与 range。所有层的 loop/once 必须与 state lifecycle 一致。
- [x] once state 只在全部附加动画层各自完成后上报完成；loop state 只在每层自上次边界后
      都完成至少一轮时上报共同 loop boundary，不能由最快的一层提前切 state。
- [x] 切 state、replay、pool release、资源替换、preview 重建和 destroy 会清理该 state 的
      全部 layer player/container/cache owner；失败不留下半初始化 display tree 或 Object URL。
- [x] 旧单动画 manifest、静态 state texture、layered normal、empty、builtin、activeSpine 和
      value-presentation 行为保持不变；旧 ZIP 重导再导出不被无关升级。
- [x] 新多图层 manifest 经过 strict parser、exact closure、content-addressed materializer、
      package loader、编辑器 ZIP 往返和正式 rendercore player 验证。
- [x] 完成 L2 定向自动化并生成任务 154 UTC 中文执行报告。
- [ ] 真实浏览器视觉/生命周期验收由用户执行。

## 2. 范围

### 包含

- `packages/rendercore/src/symbol` 的 versioned manifest union、strict validation、资源闭包、
  content-addressed reference rewrite、Spine/VNI 多实例播放、聚合生命周期与 cleanup。
- `apps/symbolseditor` 的多图层 draft、state inspector、Resource Picker binding、资源替换
  transaction、preview、ZIP import/export 和测试。
- `normal` base 与 state texture base 的显式选择；现有静态 `normal.kind:"layered"` 可作为
  一个完整 base 使用，但它自身的 texture/keyframe 定义不改变。

### 不包含

- value-presentation/`activeSpine` state、Spine slot 上的 image-string node 或 tier player 的
  多图层化；这些拥有独立 slot/controller continuity 合同。
- 把 builtin、static、empty、activeSpine 或另一个 composite 嵌套为附加层；任务 154 的
  附加层只支持 official Spine 4.3 和 VNI。
- layer 独立 start delay、速度、跨 state 持续、单独完成回调、交互事件、rotation、alpha、
  blend mode、mask 或裁剪编辑。
- 改变 reel cell mask、symbol `renderPriority`、跨 cell 溢出、中奖流程、cascade timeline
  或 server round 数据。
- VNI 内部 layer/timeline 编辑、Spine runtime 版本扩展、资源路径猜测、自动绑定、fallback
  或 placeholder。

## 3. 制定计划时的基线

```text
UTC: 2026-08-03T08:24:33Z
HEAD: df801ff54f240374b85b1a82c4c735fc13a3b5d7
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和依据：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
tasks/templates/task-plan.md
tasks/134-gamelayouteditor-vni-spine-animation-layers.md
tasks/140-symbolseditor-asset-replacement-and-zip-import.md
tasks/146-symbolseditor-clear-missing-spine-animation-on-replacement.md
tasks/148-symbolseditor-generated-state-textures-and-upload-ui-fixes.md
apps/symbolseditor/README.md
packages/rendercore/README.md
docs/symbol-package.md
```

当前代码基线：

- `packages/rendercore/src/symbol/manifest.ts::SymbolManifestAnimationSpec` 与
  `ParsedSymbolManifestSymbol.animations` 当前每个 state 只接受一个
  `builtin | static | empty | vni | spine | activeSpine` spec。
- `SpineSymbolAni` 和 `VniSymbolAni` 都把唯一 view 挂到共享 `overlayLayer`；初始化时会隐藏
  `baseLayer/stateSprite` 并清空 overlay，因此不能同时保留图标或安全容纳 sibling player。
- `RenderSymbol` 已有 `underlayLayer → baseLayer/stateSprite → overlayLayer` 的固定 display
  顺序，但现有 underlay/overlay 是单 animation 的临时效果容器，不是 manifest 多层合同。
- `apps/symbolseditor/src/model/editor-project.ts::EditorStateVisual` 只保存一个 visual；仅
  normal Spine/VNI 可附带 `baseVisual`，而 runtime 播放该动画时仍会隐藏 base。
- `compileSymbolEditorManifest()`、`animationToVisual()`、`collectVisualPaths()`、
  `collectSymbolManifestResourcePaths()` 与 `rewriteAnimation()` 都只遍历单层 spec。
- `SymbolEditorPreview` 已使用正式 package/catalog/player，是新合同的直接 preview
  consumer，不需要 app 复制播放器。
- 现有资源导入 transaction 已处理 filename-key review、Spine animation replacement 的
  精确清空以及整批 rollback；新 layer binding 必须进入同一遍历和清理摘要。

## 4. 需求解释与技术决策

### 需求解释

- “单独的动画，叠加在图标上（或者图标下面）”解释为附加动画不替换 base，而是在同一
  symbol cell 内与 base 同时播放；上下位置必须由用户逐层明确选择。
- “某些状态”解释为 per-symbol、per-state 配置，不把一套 layer 自动复制到其它 state 或
  symbol。
- “多图层”解释为一个显式 base 加非空的有序动画层数组，不只增加一个布尔
  `keepBaseVisible`；同一 state 可同时拥有多个 underlay/overlay。
- 非 normal state 的 base 必须明确选择“沿用 normal”或“使用该 state 静态图片”；缺失
  state texture 时不能把“使用 state 图片”静默回退到 normal。
- state lifecycle 仍是唯一时间语义；每层不能另选与 state 冲突的 loop/once。

### 关键决策

1. **在 symbol manifest v1 增加严格 `composite` animation union**
   - 新 spec 形状为：

     ```ts
     {
       kind: "composite";
       base: { kind: "normal" } | { kind: "stateTexture" };
       layers: readonly {
         id: string;
         placement: "underlay" | "overlay";
         animation: SymbolManifestSpineAnimationSpec | SymbolManifestVniAnimationSpec;
       }[];
     }
     ```

   - `id` 使用非空、唯一的小写 ASCII kebab-case；layers 非空；禁止 nested composite 和
     未知字段。`normal` state 只允许 `base.kind="normal"`；`stateTexture` 必须引用当前
     state 已声明的 exact texture。
   - 旧 animation spec 的结构和语义不变；只有用户启用多图层的 state 才输出 composite，
     因此保持 manifest `version:1` 的向后兼容 union 扩展。

2. **base 选择是正式合同，不是渲染 fallback**
   - `normal` base 使用既有 single/layered/transparent normal source；`stateTexture` 使用
     当前 state 的正式 state texture。
   - composite 播放期间 base 始终可见。资源异步初始化未完成时也先显示 base；任一 layer
     init 失败会显式失败并清理整组，不以只显示 base 冒充成功。

3. **每个附加层拥有隔离 display container 和 player owner**
   - rendercore 按 manifest 顺序预建所有 layer slot，再异步 prepare player，避免完成顺序
     改变 z-order。
   - Spine/VNI adapter 增加内部 additive target contract：只管理自己的 slot，不清空共享
     underlay/overlay，也不隐藏 base；旧 replace 模式继续保持当前行为。
   - composite owner 负责一次 prepare/commit、stale guard、rollback、reset、pool release
     与幂等 destroy；app 不直接操作 Pixi display tree。

4. **由聚合 ani 唯一驱动 state machine**
   - 所有 leaf 的 playback 必须与 state definition 匹配；once state 全为非循环，stable
     state 全为循环。
   - once completion 等待每个 leaf 各完成一次；loop boundary 使用“每个 leaf 自上次共同
     boundary 后至少 loop 一次”的 barrier，然后清零 barrier。
   - 任一 leaf 的 update/init 错误使 composite 显式失败；不能跳过坏层或提前完成。
   - composite continuity key 包含有序 layer id/placement/resource/playback/base；只有完整
     key 相同才延续，任一层重绑、重排或 base 改变都重建整组。

5. **编辑器使用 typed composition draft，不维护第二份 manifest 算法**
   - 为 state draft 增加显式 base source 与有序 layer 列表；启用时保留可证明的当前 base，
     无法无损转换的 Spine/VNI replace visual 要求用户先明确选择 base，不自动猜。
   - Inspector 支持启用/停用、base 选择、layer add/remove/move、placement、kind 和现有
     Picker/animation/range/transform 表单；每次 mutation 经过 project validation 后提交。
   - 停用多图层只有在可无损保留 base 且用户明确确认时执行；不会静默丢弃 layer binding。

6. **资源 replacement、closure 与 materialize 递归遍历 leaf**
   - Spine skeleton 被覆盖且缺少已选 animation 时，只清空对应 layer 的 exact
     `animationName` 并报告 layer location；其它 closure/atlas/VNI 错误仍整批 rollback。
   - collector、package loader 和 materializer 逐 layer 结构化收集/改写 Spine/VNI refs 及
     VNI nested assets；禁止 JSON 字符串替换、glob 或 basename 猜测。

7. **value-presentation 和 image-string 保持严格边界**
   - parser/editor 拒绝把 composite 用于 value-presentation 的 activeSpine state。
   - image-string target 继续要求 state 直接解析为单个 official Spine animation；composite
     state 不作为 slot host，避免多个 skeleton 下猜 slot owner。

## 5. 职责与合同

- **Symbols Editor model/UI**：拥有 composition draft、显式用户选择、Picker context、
  transaction 和 diagnostics；不拥有 player 或 lifecycle 算法。
- **rendercore manifest/package**：拥有正式 composite schema、strict cross-validation、
  exact closure、mapped reference rewrite 和 animation capability 计算。
- **rendercore runtime**：拥有 layer slot、Spine/VNI additive player、共同 completion barrier、
  continuity、pool/reset/rollback/destroy。
- **资源生命周期**：composite prepare 全部 leaf 后一次 commit；部分 init 或 stale 时销毁
  已创建 player/container/cache owner并保留原 active symbol/project。
- **失败策略**：未知 kind/placement/id、空/重复 layer、非法 base、loop mismatch、缺资源、
  Spine 版本/animation、VNI range/asset、hash/path/orphan 全部尽早显式失败。
- **禁止行为**：不猜 base、animation、layer 顺序或 slot host；不跳过失败 layer、不复制
  player、不保留半提交画面、不把静态 layered normal 当成新 animation composite。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/symbol/composite-animation.ts
packages/rendercore/tests/symbol/composite-animation.test.ts
tasks/154-symbolseditor-multi-layer-state-animations-<utctime>.md
```

如聚合 ani 能保持在现有 resolver 内清晰实现，可不新增碎片模块；执行报告只在完成后创建。

### 预计修改

```text
packages/rendercore/src/symbol/{manifest,types,ani,render-symbol,spine-animation,vni-animation,package,materialize-package,index}.ts
packages/rendercore/tests/symbol/{manifest,animation-resolver,spine-animation,vni-animation,render-symbol,package,materialize-package}.test.ts
packages/rendercore/README.md
apps/symbolseditor/src/model/{editor-project,resource-import}.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{editor-project,resource-import,app-shell,zip-io}.test.ts
apps/symbolseditor/README.md
docs/symbol-package.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

### 原则上不应修改

```text
packages/{logiccore,vnicore,editorresource,browserartifactio}/**
packages/rendercore/src/{reel,symbol-value-presentation,symbol-image-string}/**
apps/{game002,game003,gamelayouteditor,gamelayoutpkgcli,popupeditor,imgnumbereditor}/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

若实现需要改变 VNI/official Spine public API、value/slot controller、其它 editor/game、
lockfile 或根工具链，属于明显范围扩张，执行前必须停止说明，不能修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线并建立失败测试**
   - 重核 HEAD、status、规则和当前 manifest/player/editor 行为。
   - 先添加 composite parser、z-order、completion barrier、cleanup、ZIP round-trip 的失败
     测试，固定旧单动画 parity。

2. **扩展 rendercore composite 合同**
   - 在 manifest types/parser 中加入 composite leaf/base/placement/id 校验及与 state texture、
     lifecycle、value/image-string 的交叉验证。
   - 扩展 capability map、Spine/VNI resource maps、exact closure 和 materializer 递归遍历，
     保持旧 spec 输出不变。

3. **实现隔离 layer runtime 与聚合生命周期**
   - 为 underlay/overlay 预建稳定 slot，并让 Spine/VNI 内部 player 支持 additive target。
   - 实现 all-leaf prepare/commit/rollback、once/loop barrier、continuity、reset、pool release 和
     destroy；验证慢/快初始化不会改顺序或留下旧 view。

4. **扩展 Symbols Editor draft 与 import/export**
   - 加入 typed composition/base/layer model、clone/compile/import/status/reference traversal。
   - 把 layer Spine replacement 清理接入现有资源导入 transaction；候选 project 全量复验后
     一次 replace，失败保持 active project 不变。

5. **接入 state Inspector 与正式 preview**
   - 增加多图层开关、明确 base selector、layer card、上下层、排序、删除和 Spine/VNI
     binding 表单，复用现有 Resource Picker 与 animation metadata。
   - 继续由 `SymbolEditorPreview` 构造正式 package/catalog/player；replay 和 state 切换不走
     editor 私有动画路径。

6. **补齐 package/ZIP/回归矩阵**
   - 覆盖 normal/stateTexture base、多 underlay/overlay、Spine+VNI 混合、loop/once barrier、
     resource replacement、async failure rollback、pool reuse 和重复 destroy。
   - 导出→重导→再导出验证 manifest 顺序、filename keys、assets map、nested VNI closure、
     hash/path/orphan 以及旧 ZIP parity。

7. **文档、验收与报告**
   - 更新 rendercore/Symbols Editor README、Symbols package 文档和最小领域规则。
   - 运行 L2 定向验收与真实浏览器清单；检查 diff 后生成任务 154 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- parser 使用最小合法 official Spine 4.3 与 VNI fixture，覆盖 unknown field、duplicate id、
  empty layers、nested composite、base/stateTexture mismatch 和 playback mismatch。
- runtime player factory 精确记录 init/play/update/destroy；用不同初始化时序和动画周期证明
  display order 与 barrier 不依赖 Promise 完成顺序。
- transaction 失败前后比较完整 project semantic snapshot；missing-animation 清理只允许影响
  摘要列出的 exact layer selection。
- ZIP 必须走正式 exporter、materializer、package resource 和 importer，不手拼绕过 hash、
  closure 或 runtime validation 的假成功路径。
- 旧 single animation、layered normal、state texture、value-presentation 和 image-string 的已有
  期望继续通过，不为新功能放宽合同。

### 验收级别

`L2`。本任务扩展 rendercore public manifest/runtime contract 和正式 Symbols ZIP，
Symbols Editor 是直接 authoring/preview consumer；范围可由两个 package 及 package loader 测试
界定，不修改依赖、lockfile、根工具链或 release 配置，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/manifest.test.ts tests/symbol/composite-animation.test.ts tests/symbol/spine-animation.test.ts tests/symbol/vni-animation.test.ts tests/symbol/package.test.ts tests/symbol/materialize-package.test.ts
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor exec vitest run tests/editor-project.test.ts tests/resource-import.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
pnpm --filter symbolseditor build
git diff --check
```

失败时先缩小到单个 manifest/composite/editor 测试，不立即扩大为根级扫描。

### 人工验收

1. 在真实 Chromium 导入一组 official Spine 4.3 和一个 VNI runtime project，为同一 symbol
   的 normal/once state 分别配置 underlay、base、overlay，确认列表顺序与画面顺序一致。
2. 使用 normal base 和 stateTexture base 切换 state/replay，确认 base 始终可见、once 等待
   最慢层、loop pending transition 等待共同 boundary，失败 layer 不被静默省略。
3. 重排/删除/替换 layer 资源，覆盖缺 animation、取消 conflict 与 init 失败；确认旧预览或
   project 保持、错误定位到精确 layer，重试后无重复 view/ticker。
4. 导出 ZIP、重新打开并预览，再重复 replay/state 切换；确认 order、binding、mapped assets、
   VNI nested closure 与 destroy/reopen 行为保持。

### 独立验收建议

`必须`。涉及跨包 public schema、正式 ZIP、多个异步 Spine/VNI owner、聚合 completion 和
destroy。独立复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/manifest.test.ts tests/symbol/composite-animation.test.ts tests/symbol/package.test.ts
pnpm --filter symbolseditor exec vitest run tests/editor-project.test.ts tests/resource-import.test.ts tests/zip-io.test.ts
pnpm --filter symbolseditor build
```

并独立完成一次真实浏览器的 underlay/base/overlay、replay 和 ZIP 重导检查。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 未加载 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不新增依赖或修改 lockfile；复用 rendercore 已有 Pixi、official Spine 与 VNI runtime。
- 依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才设置现有本地代理并重试原命令。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、静态资源或生成 TypeScript；若执行发现生成物受影响，必须使用正式
  generator/checker，禁止手改。
- 更新 `packages/rendercore/README.md`，说明 composite schema、base/placement、barrier、
  additive player 和 legacy single animation 兼容边界。
- 更新 `apps/symbolseditor/README.md`，说明 state 多图层操作、Picker、替换清理、preview 与
  ZIP round-trip。
- 更新 `docs/symbol-package.md`，记录 exact leaf closure/content addressing；只在职责边界
  确实稳定变化时最小更新 `docs/agent-rules/editor-artifacts.md` 与
  `shared-game-runtime.md`，不修改根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/154-symbolseditor-multi-layer-state-animations-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/文件、关键决策和计划偏差、实际验收结果、未完成人工验收及剩余
风险；不收集无关 coverage、历史矩阵、整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 当前 Spine/VNI ani 会清共享 overlay 并隐藏 base；改成 additive target 时必须同时证明旧
  replace 模式不回归，不能用全局行为切换实现。
- 多个异步 player 共享 symbol root/cache 时，owner 计数、stale completion 与 destroy 顺序
  容易泄漏或删掉 sibling view；必须用交错时序覆盖。
- 不同周期 loop 的“共同 boundary”不等于同一帧同时归零；本任务合同是每层自上次 barrier
  后至少完成一轮，避免数学最小公倍数造成不可达切换。
- state texture base 与 normal layered base 的尺寸/anchor 可能不同；沿用现有 cell/texture
  中心坐标，不新增自动 fit，真实资源需视觉验收。
- mapped package 对 nested composite 递归漏改任一 leaf 会产生 hash-flat 路径或 orphan 错误；
  必须以正式 materialize + package parser 往返证明。

### 假设

- 用户所说的“图标”是当前 symbol state 的 base，而不是另一个 symbol、scene-layout node
  或跨 reel 特效。
- 首期附加动画资源只需要现有 Symbols Editor 已支持的 official Spine 4.3 与 VNI；静态
  图片通过 base/state texture 表达，不作为 animation leaf。
- underlay/overlay 和同组数组顺序已足够表达所需层次，不需要任意 zIndex、blend 或 mask。
- value-presentation/activeSpine 与 image-string slot 的多图层需求未包含在任务 154。

### 待确认

无。以上按最小、严格、可往返的 state 级多图层合同制定；若执行前确认需要 tiered
activeSpine、slot attachment 或 layer 独立时序，应先扩展讨论并重新界定范围。
