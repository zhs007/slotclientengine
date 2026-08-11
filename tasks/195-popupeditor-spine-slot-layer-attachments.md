# 195 popupeditor-spine-slot-layer-attachments 任务计划

## 1. 目标与完成定义

### 目标

让 Popup Editor 中的 image、字体文字、ImgNumber、VNI 和 Spine 图层都能显式挂接到当前作用域内任意
official Spine 的 exact slot；普通 Spine Popup 的主 Spine 也可作为挂接目标。挂接后图层继续使用自身
transform/alpha/playback，坐标变为目标 slot 的局部坐标，`order` 表示该父节点下挂接完成后的兄弟图层顺序。

把挂接建模为 Popup manifest 的严格 versioned contract，并由 `packages/rendercore/popup` 统一完成 target/slot
校验、无环图校验、prepare、display tree 组装、播放、rollback 和 destroy。Popup Editor 只提供目标 Spine 与
slot 两级下拉框、事务性 draft 编辑和 production preview，不直接操作 Spine 私有 display tree。

### 完成定义

- [ ] award 五个档位中的任意 layer，以及普通 Spine Popup 的任意 overlay，都可以选择 Popup 根节点或合法的
      Spine slot 作为父节点；普通 Spine Popup 还可选择主 Spine，award 只能选择同档位 Spine layer。
- [ ] UI 先选择当前作用域内已存在的 Spine 目标，再从该目标 skeleton 的 exact slot 清单选择 slot；没有目标、
      slot 缺失或资源不能严格 introspect 时不猜首项、不保留伪合法选择。
- [ ] 同一 Spine slot 可同时挂多个不同 kind 的图层，例如先挂普通图片背景，再挂字体文字/ImgNumber；这些子层
      在一个稳定 slot group 内按自身 `order` 升序叠放。
- [ ] Spine layer 也可挂到另一 Spine 的 slot，但 self edge、A→B→A 和任意长度环都在 preview/export 或画面
      mutation 前显式失败；跨 award tier 引用、普通 Popup 与 award 作用域混用同样失败。
- [ ] 挂接层的 x/y/scale/rotation 是 slot 局部 transform，并继承 official Spine slot 的 bone transform、颜色和
      Spine draw-order；`order` 只比较同一 resolved parent 下的兄弟，不能越过不同 slot 或改变 skeleton slot 顺序。
- [ ] Popup v1/v2/v3 runtime 行为与 ZIP 继续可用；新建项目和合法旧 ZIP 导入在 Popup Editor 中形成 canonical v4，
      旧 ImgNumber `popup-root | vni-text-layer` parent 无损迁移为 v4 attachment。
- [ ] Spine resource 覆盖导致已选 slot 消失时，整次 import/overwrite transaction 回滚并列出受影响 target/layer；
      删除仍被其它 layer 作为 Spine target 的图层时阻止操作，不静默改挂 Popup root。
- [ ] award/player 与 Spine popup/player 都在全部资源和 layer runtime 初始化成功后一次性组装挂接图；任一失败清理
      已创建的 player、slot group、string node 和 display container，destroy 幂等且不销毁宿主 stage/resource。
- [ ] Popup Editor 自动 preview/export、Game Layout vendoring、CLI typed rewrite 和 gameframeworks public type surface
      支持 v4；正式文档、定向自动验收与浏览器人工验收完成，执行会话生成 UTC 中文报告。

## 2. 范围

### 包含

- Popup v4 的 common layer attachment union、作用域、per-parent order、target graph 与 strict parser。
- rendercore Popup package prepare 的 exact Spine slot 校验，以及 award/普通 Spine player 的多子层 slot group、嵌套
  Spine attachment、确定性组装和生命周期。
- Popup Editor v4 draft/create/import/export、Spine target/slot introspection、两级下拉框、引用保护、资源覆盖复验和
  production preview。
- v1/v2/v3 到 v4 的 typed migration；既有 award ImgNumber VNI text-layer parent 的等价迁移与 runtime 回归。
- Game Layout Editor、Scene Layout package runtime、Game Layout package CLI 和 Game Frameworks 的 v4 最小直接消费
  保护；README、Popup manifest 文档和最小领域规则更新。

### 不包含

- 不提供 bone、skin、attachment、Spine draw order、slot color、`followAttachmentTimeline` 或 `followSlotColor` 编辑器；
  只选择 skeleton 已声明的 exact slot，并使用 rendercore 固定的 official slot-follow 语义。
- 不允许跨 award tier 挂接，也不把 inactive tier 的 Spine 常驻为隐藏宿主；每档 attachment graph 独立。
- 不支持挂到 VNI 的任意节点、普通 Pixi Container、Spine bone 或 slot attachment 名；现有 ImgNumber→VNI 文字层
  合同只做 v4 等价迁移，不扩大到其它 layer kind。
- 不允许一个图层多父节点、slot 名通配、资源名/文件名猜 target、missing target 自动回根、循环边自动断开或
  order 冲突自动重排。
- 不改 Popup focus/backdrop、award threshold/金额格式、Spine/VNI start-loop-end 状态机、string node set/reset、
  Scene Layout popup root placement、游戏业务触发或输入分派。
- 不新增资源、依赖、YAML、生成物、游戏 app 分支或后端；不重写仓库内既有 production Popup ZIP。

## 3. 制定计划时的基线

```text
UTC: 2026-08-11T06:51:38Z
HEAD: 152c59e2f023a5b055eda98066ccfe0b8d87c2e7
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
tasks/{190-popupeditor-project-resource-responsive-layer-refactor,
       191-popupeditor-centered-adaptation-font-text-editing,
       193-popupeditor-focus-only-v3-input-preview-polish}.md
docs/popup-manifest.md
apps/popupeditor/{README.md,package.json}
apps/popupeditor/src/{model/project.ts,io/popup-zip.ts,io/resource-import.ts,
                     ui/app-shell.ts,preview/popup-preview.ts}
packages/rendercore/{README.md,package.json}
packages/rendercore/src/popup/{types,manifest,package-resource,award-player,
                               spine-player,spine-overlay-runtime,index}.ts
packages/rendercore/src/spine/runtime-player.ts
packages/gameframeworks/src/index.ts
apps/{gamelayouteditor,gamelayoutpkgcli}/package.json
```

目标目录没有补充 `AGENTS.md`。规划会话未运行构建或测试。当前结论：

- `PopupLayer` 只有 ImgNumber 使用 `PopupImageStringParent`，且只支持 `popup-root | vni-text-layer`；其它 award layer
  与全部 `PopupOverlayLayer` 都直接挂 tier/popup root。`parseTier()` 当前要求整个 tier 的 `order` 全局唯一，
  `parseSpinePopup()` 同样要求全部 overlay/prompt order 全局唯一。
- `DefaultAwardCelebrationPlayer.prepare()` 按 order 创建 layer runtime 并直接 `container.addChild()`；唯一例外是
  win-amount 在 init 后通过 VNI `mountNodeToTextLayer()` 重挂。普通 `DefaultSpinePopupPlayer` 则把主 Spine 设为
  `zIndex=-1`，所有 overlay 直接加入 `#popupRoot`。
- `createOfficialSpinePlayer()` 返回 `RendercoreSpineSlotPlayer`，已有 `ValidatedSpineResource.slotNames` 与
  `validateOfficialSpineResource({ requiredSlots })`。`attachSlotObject()` 会为 authored content 保留一层 wrapper，
  但同一 slot 当前只允许一个 owner，后挂对象会 detach 前一个；不能满足同 slot 图片背景加文字/ImgNumber。
- official adapter 一次向 Spine slot 挂一个稳定 group container 即可复用现有单-owner API；group 内再按 Popup layer
  order 挂多个 child，可避免改变 Symbols/value presentation 对 `attachSlotObject()` 的既有单-owner语义。
- `PopupEditorProject.formatVersion` 固定为 3，新建/导入最终导出 v3；`spineAnimationNames()` 已从当前主 Spine
  skeleton 读取动画，但没有通用 layer target/slot candidate helper。resource import 在 candidate discovery 时调用
  shared Spine validator，却未在 `popupProjectAdapter.validateProject` 中复验已有 slot attachment。
- `projectToManifest()` 是 Editor diagnostics/preview/export 的共同 strict 边界；`importPopupZip()` 会先 strict
  parse/map/closure/prepare，再把 v1/v2/v3 迁移成 Editor draft。v4 应沿用这个 transaction，不维护第二份 wire graph。
- Game Layout Editor、Scene Layout runtime 与 CLI 通过 rendercore parser/package API 消费 Popup；CLI 的 typed spread/
  resource rewrite 原则上不应改 attachment id/slot，但需要 v4 fixture 证明 round-trip。Game Frameworks 当前显式导出
  `PopupManifestV1/V2/V3` 与相应 Spine types。

## 4. 需求解释与技术决策

### 需求解释

- “任意图层”覆盖 image、system/package font text、manual/win-amount ImgNumber、VNI 和 Spine；图层本身的 kind、
  playback、visibleSegments、string identity、alpha 与 transform 编辑能力不因挂接改变。
- “项目的所有 Spine”解释为当前运行作用域内所有可同时存在的 Spine：award 是当前 tier 的 Spine layer；普通
  Spine Popup 是主 Spine加当前 overlays 中的 Spine layer。跨 tier target 在运行时不会与 source 同时 active，因此禁止。
- “先选 Spine 图层，再选 slot”落实为两个显式 select。第一项提供“Popup 根节点”用于取消挂接；普通 Spine Popup
  额外提供“主 Spine”。第二个 select 只在选中 Spine target 时出现，并列出该 exact skeleton 的全部 slot。
- “order 是挂接以后的图层的 order”解释为 resolved parent 内的 sibling order：root 子层在 root 内比较，同一个
  Spine slot 的多个子层在 slot group 内比较。不同 slot 之间的顺序由 skeleton draw order 决定，不能用 Popup order
  穿透调整。
- 图层 attachment 形成从 child layer 指向 Spine target 的有向图；只有 Spine layer 可成为 layer target，主 Spine 是
  无出边的固定 root。循环检测覆盖 self、二元和任意长度环，并输出包含 layer id 的 cycle path。

### 关键决策

1. **新增 strict Popup v4，不原地扩展 v3**
   - 新导出可能包含旧 v3 parser 不认识的 layer attachment；因此 v4 作为明确 capability 边界。v1/v2/v3 parser/player
     保持原样，Popup Editor create/import 后 canonical author v4。
   - v4 每个 award layer 与 Spine overlay 都必须有 `attachment`，不以 optional 字段产生两种 canonical v4。旧版缺失
     attachment 在 Editor migration 中明确补为 root；runtime parser 不替旧 manifest 猜 v4 字段。
2. **统一 attachment union，保留 VNI 特例语义**
   - v4 使用 `PopupLayerAttachment`：`{kind:"popup-root"}`、既有 ImgNumber 专用
     `{kind:"vni-text-layer", vniLayerId, textLayerId}`，以及
     `{kind:"spine-slot", target:{kind:"layer", layerId}|{kind:"main-spine"}, slot}`。
   - `main-spine` 仅允许普通 Spine Popup overlay；`layer` target 必须在同一 tier/overlay scope、kind=spine，且不能
     引用 prompt、resource id、数组 index 或 filename。v4 image-string 不再同时保存旧 `parent`，迁移后只有 attachment。
3. **order 按 resolved parent 分组校验**
   - v4 parser 对每个 `popup-root`、VNI text target 和 `(Spine target, slot)` sibling group 分别要求非负安全整数且唯一；
     v1/v2/v3 继续使用原有全列表唯一规则。
   - 更换父节点不静默改 order；若目标组已有相同 order，draft diagnostics 明确阻止 preview/export，用户显式修改。
4. **一 slot 一 group，多 layer child**
   - rendercore 不放宽全局 `RendercoreSpineSlotPlayer.attachSlotObject()` 的单-owner合同。Popup graph assembler 为每个
     `(target player, exact slot)` 创建一个 owner group，一次 attach 到 official player，内部 child container 设置
     `zIndex=layer.order` 并确定性排序。
   - layer authored transform 保留在 group child，不让 spine-pixi 每帧覆盖；slot group 自己不复制动画/ticker逻辑。
5. **两阶段 prepare/commit attachment graph**
   - parser 先证明 target 类型、作用域、per-parent order 和 DAG；package prepare 再按每个 target resource 汇总
     `requiredSlots`，用 shared Spine validator 校验 exact slot/animation/atlas/texture closure。
   - player 先创建并初始化全部 layer runtime，等待所有已启动 init 收敛；全部成功后按稳定拓扑/parent/order组装
     display tree并commit。失败销毁全部 candidate runtime/group，宿主仍保持旧 preview/player。
6. **Editor 只消费 shared Spine metadata**
   - model helper根据 project resource/spec/assets 调用 rendercore official Spine validator取得 `slotNames`；UI 不手写
     skeleton slot parser。候选按稳定 layer顺序显示，slot按 skeleton 声明顺序显示，不选择首项。
   - resource overwrite/keep-both transaction 的 `validateProject` 在 commit 前重建 v4 manifest并复验 attachment slot；
     缺 slot、target kind变化或cycle使整批回滚，不能只在下一次 preview 才发现。
7. **direct consumer 只传递 owner-owned graph**
   - Game Layout/Scene Layout 不提供 Popup 内部 attachment 编辑，也不重建 slot graph；只用 rendercore strict package/player。
   - CLI 只结构化改资源 filename-key/path，保持 attachment target layer id 和 slot exact；Game Frameworks 只补 v4 types。

## 5. 职责与合同

- **模块职责**：Popup Editor 拥有 draft/UI/transaction 与 preview canvas；rendercore popup 拥有 versioned schema、作用域
  graph、per-parent order、slot group、player lifecycle；shared Spine adapter拥有 official slot attach/detach；consumer只挂
  Popup root并逐帧 update。
- **数据/API**：v4 attachment 是 layer-owned immutable typed reference。target layer id、main-spine discriminator和slot
  大小写精确；导入/导出/CLI round-trip不得按数组位置或资源名重建。
- **资源生命周期**：package resource拥有decoded textures/font/VNI/Spine resource；player拥有每个layer runtime、slot group
  和 attachment disposer；slot target/player被销毁前先detach child group，child runtime再destroy，宿主stage/resource不被借用
  对象的destroy波及。
- **prepare/commit/rollback**：parse graph与resource slot validation均发生在display mutation前；并发init全部settle后才组装。
  preview rebuild失败保留最后一次成功实例，candidate完整cleanup。
- **失败策略**：unknown version/attachment kind/target、self/cycle、cross-scope、target非Spine、slot缺失、per-parent order冲突、
  resource overwrite失效、destroy后使用全部显式失败；错误包含source layer、target和slot。
- **禁止行为**：禁止 app直接调用 Spine `addSlotObject()`、复制cycle/slot parser、自动断边/回根/改order、slot首项fallback、
  用zIndex越过不同Spine slot、同一layer多实例或为nested Spine复制状态机。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/layer-attachment.ts
packages/rendercore/tests/popup/layer-attachment.test.ts
tasks/195-popupeditor-spine-slot-layer-attachments-<utctime>.md
```

若 graph/assembler 可在不重复 award/Spine player 逻辑的前提下放入现有文件，可不新增前两个文件；不能在两个 player
各写一套循环检测或 slot grouping。

### 预计修改

```text
packages/rendercore/src/popup/{types,manifest,package-resource,award-player,
                               spine-player,spine-overlay-runtime,index}.ts
packages/rendercore/tests/popup/{manifest,package-resource,award-player,
                                 spine-player,spine-overlay-runtime}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/{popup-zip,resource-import}.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/tests/{project,resource-import,app-shell,preview}.test.ts
apps/popupeditor/README.md

packages/gameframeworks/src/index.ts
apps/gamelayouteditor/tests/{popup-package,zip-io}.test.ts
apps/gamelayoutpkgcli/tests/{reference-rewriter,asset-groups}.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts

docs/popup-manifest.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

只有测试证明现有 `RendercoreSpineSlotPlayer` 单-owner API 无法承载“每slot一个Popup group”时，才修改
`packages/rendercore/src/spine/runtime-player.ts` 及其定向测试；不得为 Popup 需求破坏 Symbols/value presentation调用方。

### 原则上不应修改

```text
apps/{game002,game002v2,game003,gameviewer,gameviewer2}/**
apps/gamelayouteditor/src/**
apps/gamelayoutpkgcli/src/**
packages/{logiccore,uiframeworks,vnicore,editorresource,browserartifactio}/src/**
packages/rendercore/src/{symbol,symbol-image-string,symbol-value-presentation,reel,background}/**
assets/**
package.json
pnpm-lock.yaml
AGENTS.md
```

若 v4 narrowing 暴露 direct consumer production source 的实际编译缺口，可只修改精确分支并说明原因；不得把 Popup 内部
attachment 控件加入 Game Layout Editor。

## 7. 实施步骤

1. **确认基线并先固定失败用例**
   - 重新核对 HEAD/status、v3 canonical contract和现有 VNI parent回归。
   - 先添加 v4 root/Spine slot合法fixture，以及self、A↔B、长环、cross-tier、target非Spine、slot缺失和同parent
     order冲突的失败测试；保留v1/v2/v3 parse/play结果。
2. **实现 v4 typed graph 与迁移**
   - 在rendercore定义v4 manifest/layer/attachment types和strict parser分支；按scope建立layer id map，验证target、DAG与
     per-parent order，并导出稳定graph helper供package/player复用。
   - Popup Editor project收敛到formatVersion 4；create写root attachment，import先按source version完整校验/prepare，再把
     v1/v2/v3 `parent`/缺失parent转换为v4 attachment，失败不替换当前project。
3. **在package prepare校验exact Spine slot**
   - 为每个main/layer target解析同一个prepared Spine resource元数据，汇总required animation/slot并一次验证；覆盖shared
     resource、多target同slot、大小写错误、overwrite后缺slot与已启动prepare失败cleanup。
   - 把同一校验接入Popup Editor resource import adapter的candidate transaction，确保覆盖失败原子回滚。
4. **实现通用slot graph assembler**
   - 扩展Popup layer runtime内部合同，让Spine runtime暴露其`RendercoreSpineSlotPlayer` host；主Spine也作为typed host注册。
   - 全部runtime init成功后按graph创建每slot唯一group、按order挂child并保存detach disposer；award金额的跨tier单实例
     rebind必须先从旧parent安全detach再进入新tier root/VNI/Spine slot，保持text identity。
   - 让award与普通Spine player共用assembler；验证nested Spine update仍每帧恰好一次、segment lifecycle不重复、complete/
     replay attachment稳定，以及init/error/destroy逆序cleanup。
5. **完成Editor两级选择与引用保护**
   - 在model提供按当前tier/overlay scope解析的Spine target和slot候选；每张layer card显示“Popup根/主Spine/Spine图层”
     target select，选择Spine后显示exact slot select。
   - transaction保留显式空选择为invalid诊断，不自动选slot；切父节点保留order并提示冲突。删除被引用target时显示dependents并
     阻止，删除source正常；资源替换/keep-both后的target identity和slot复验通过才commit。
   - 自动preview继续只消费`projectToManifest()`和production player，不直接重挂Pixi节点；补表单键盘透传回归。
6. **保护direct consumer与文档**
   - 增加v4 Popup ZIP经Layout import/vendor/reimport、Scene Layoutprepare/player和CLI rewrite/grouping的最小fixture，断言
     target layer id/slot/order保持exact且只改资源path。
   - 同步Game Frameworks v4 type export、Popup/Rendercore README、manifest文档与两份领域规则；把“新建固定v3”更新为
     v4 canonical，并明确旧runtime、DAG、per-parent order和slot生命周期。
7. **定向验收与报告**
   - 按第8节运行L2命令，失败先最小化并判断是否由本任务引入；不扩大到整仓测试。
   - 完成或列明浏览器人工验收，生成UTC中文执行报告；不把一次性证据写入规则。

## 8. 测试与验收

### 测试原则

- parser/graph使用纯数据fixture覆盖两种Popup scope、全部五种layer kind、main Spine、嵌套Spine、同slot多child、
  per-parent order、self/two-node/long cycle和cross-tier strict failure。
- package测试使用包内自包含最小official Spine 4.3 skeleton/atlas/texture，证明required slot大小写精确、资源共享、缺slot在
  mutation前失败；不读取游戏assets。
- player测试记录container parent/zIndex、slot attach/remove次数和update次数，证明每slot只有一个official owner group、group
  内order稳定、不同slot不互相比较、nested player只update一次。
- 生命周期测试覆盖并发init部分失败、graph组装失败、跨tier amount rebind、replay、dismiss、destroy两次和late async settle；
  不用fakeplayer“编译通过”替代真实official adapter最小测试。
- Editor测试覆盖两级select候选、没有首项默认、主Spine、同tier限制、循环即时diagnostic、target删除阻止、overwrite缺slot回滚、
  v1/v2/v3 migration与v4 ZIP round-trip。

### 验收级别

选择 `L2`：新增rendercore Popup public manifest version与attachment/lifecycle合同，影响正式Popup ZIP、Game Frameworks type
surface及Layout/CLI直接consumer；不修改根工具链、lockfile或游戏业务，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/layer-attachment.test.ts tests/popup/manifest.test.ts tests/popup/package-resource.test.ts tests/popup/award-player.test.ts tests/popup/spine-player.test.ts tests/popup/spine-overlay-runtime.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/resource-import.test.ts tests/app-shell.test.ts tests/preview.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/asset-groups.test.ts
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter popupeditor build
git diff --check
```

共7条是因为正式v4同时改变shared parser/player、Editor ZIP和两个独立consumer；前四条分别证明owner runtime、authoring/
transaction、Layout vendoring和CLI rewrite，第五条保护public type chain，第六条验证浏览器bundle，最后一条检查文本差错。
不替换为根级test/build/lint/format。

### 人工验收

- 在award同一档导入一个有多个slot的Spine，分别新增图片、字体文字、ImgNumber、VNI和第二个Spine；逐层选择目标Spine
  与slot，确认slot下拉只显示该skeleton的exact slot，动画中所有层跟随slot移动。
- 把普通图片背景和ImgNumber挂到同一slot，设置背景order较小、数字order较大，确认背景位于数字下方；交换order后顺序
  反转。把两层挂到不同slot，确认order不会越过skeleton draw order。
- 在普通Spine Popup中分别挂到主Spine和overlay Spine，再构造A→B后尝试B→A，确认UI显示cycle path、preview/export被阻止且
  最后一次成功preview仍在。
- 覆盖target Spine为缺少已选slot的合法新资源，确认review不能commit、当前资源/attachment/preview保持不变；删除被引用
  Spine layer时确认列出依赖层并阻止。
- 导出v4 ZIP并重新导入Popup Editor，再导入Game Layout Editor预览；验证attachment、slot、local transform/order和播放阶段
  保持一致。另导入一个v3 ZIP确认迁移到v4且原root/VNI文字层位置不变。

### 独立验收建议

`必须`。本任务涉及正式versioned schema、跨包public contract、嵌套resource ownership、异步prepare/rollback/destroy和
display tree父子关系。独立复验重点：

1. v4 graph在任何player/display mutation前拒绝self/长环/cross-scope/missing slot；
2. 同slot多child只有一个official slot owner，order正确且destroy不重复detach或销毁宿主；
3. v4 ZIP经Editor/Layout/CLI round-trip保持attachment target/slot exact，v1/v2/v3 runtime不变。

独立复验最多运行第8节中的rendercore、popupeditor和gamelayouteditor三条定向test命令。

## 9. 环境与依赖

- 使用仓库要求的Node 24和pnpm；shell没有Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试原命令。
- 本任务不需要新增依赖或修改lockfile。graph/topological validation使用TypeScript，slot metadata与attachment复用现有
  rendercore official Spine adapter和Pixi Container。

## 10. 生成物、文档与规则

- 本任务无YAML或生成文件；不得手改`dist/`、coverage或production assets。
- `docs/popup-manifest.md`更新为v1/v2/v3/v4，给出attachment union、award/普通Popup scope、per-parent order、坐标与
  cycle/slot failure示例；旧版本runtime合同继续保留。
- Popup Editor README说明两级下拉、主Spine、同slot多层、引用删除/覆盖失败和v4导入导出；Rendercore README说明
  one-slot-one-group、prepare/commit/destroy owner边界。
- `docs/agent-rules/editor-artifacts.md`把Popup Editor canonical版本更新为v4并记录通用layer attachment职责；
  `shared-game-runtime.md`只增加稳定的Popup slot graph/owner不变量，不写具体fixture、slot名或执行证据。
- Game Frameworks只同步type export；Game Layout/CLI不复制Popup内部schema文档。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/195-popupeditor-spine-slot-layer-attachments-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、关键决策与偏差、实际验收结果、人工验收、
剩余风险；不收集无关coverage、整仓统计或历史矩阵。

## 12. 风险、假设与待确认

### 风险

- official Spine runtime控制slot group在skeleton draw order中的位置；Popup `order`只能控制group内部children，若美术希望
  跨slot调层，必须修改Spine skeleton slot draw order，不应由本任务伪造全局zIndex。
- nested Spine与VNI仍各自逐帧update；层数较多会线性增加CPU/显存成本。本任务保护一次update/一个runtime ownership，但不引入
  自动降质、实例合并或资源预算fallback。
- win-amount是跨award tier复用的单一renderer；它在root、VNI text layer与Spine slot之间切换时最容易出现late parent/
  disposer泄漏，必须用专门生命周期测试和真实preview复验。
- Popup v4需要更新正式consumer；旧runtime仍可播放v1/v2/v3，但不能声称支持含attachment的v4 ZIP。

### 假设

- “所有Spine”按当前runtime可同时存在的scope解释；不支持跨award tier挂接。
- 一个layer只有一个parent；同slot的背景、文字和数字通过多个sibling layer及其order表达，不在一个layer内再嵌套children数组。
- 挂接使用official slot-follow默认颜色/骨骼语义；本任务不新增follow color或attachment timeline开关。
- 旧v1/v2/v3没有Spine slot attachment，迁移时除既有ImgNumber VNI parent外都明确成为`popup-root`，坐标与视觉顺序保持原样。

### 待确认

无。若执行时发现美术实际需要跨award tier target、跨slot全局order或可编辑follow-slot-color，这会改变runtime同时存在性、
schema和渲染语义，必须作为新需求先确认，不能在任务195中自行扩大。
