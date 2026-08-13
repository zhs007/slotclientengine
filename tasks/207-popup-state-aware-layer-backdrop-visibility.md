# 207 popup-state-aware-layer-backdrop-visibility 任务计划

## 1. 目标与完成定义

### 目标

修正 Popup Editor 把所有图层可见性都固定建模为 `start / loop / end` 三阶段的错误，将
“项目当前状态”与 Spine/VNI 内部播放阶段分离：

- `award-celebration` 项目的可见状态固定为 `base / standard / bigwin / superwin / megawin`
  五档；
- `spine` 项目的可见状态为 `start / loop / end` 三阶段；
- 所有图层 kind 与全屏压暗底都使用当前项目类型的状态集合配置可见性，
  而动画自身的 start/loop/end playback 合同保持独立。

新建、预览和导出只使用最新 canonical 数据；合法旧 Popup 项目在导入边界先按原版本
strict parse/prepare，再原子升级到最新版。旧的三状态全选表示“全程可见”，转为 award
项目时必须扩展为五状态全选；旧数据只选部分状态时按稳定 index 迁移。

### 完成定义

- [ ] Award 项目的每个 image、文字、ImgNumber（包括 `win-amount`）、VNI 和 Spine 图层都显示五状态复选项；Spine Popup 的全部 overlay 显示三阶段复选项。
- [ ] 新增任意 kind 图层默认选中当前项目的全部状态，不再仅为 image/text/manual ImgNumber 写入三阶段可见性。
- [ ] 压暗底可选哪些项目状态压暗；runtime 只在 Popup active、backdrop enabled 且当前状态被选中时显示它。
- [ ] Award runtime 以 `AwardTierId`、Spine runtime 以 `start | loop | end` 评估图层/压暗；结果实际影响 production player。
- [ ] 图层隐藏只是 presentation gate；播放、award 计数、advance/dismiss、end drain、attachment 与 string node identity 保持现有合同。
- [ ] 引入 strict Popup v5；v1–v4 parser/player 继续按原版本运行，Editor 导入合法 v1–v4 ZIP 后统一得到 v5 draft，预览/导出只写 v5。
- [ ] 旧三状态数据由唯一 shared upgrader 迁移：三项全选扩展为目标全选，否则保留同 index 选中项；旧无字段但原本全程显示的 layer 按全选迁移。
- [ ] 旧 backdrop `enabled=true` 升级后所有项目状态都压暗；`enabled=false` 仍关闭且不改颜色/alpha。
- [ ] 旧 parser 不接受的状态数、未知状态或项目类型错配继续失败，不截断、猜测或反向 five→three 迁移。
- [ ] Popup Editor UI、production preview、ZIP round-trip、Game Layout vendoring/CLI typed rewrite 与
      gameframeworks public type export 支持 v5；README/长期 manifest 文档、定向验收和 UTC 中文报告完成。

## 2. 范围

### 包含

- Popup v5 的 type-aware state id、全图层 visibility 与 backdrop visibility strict schema。
- v1–v4 到 v5 的唯一、确定性、可单测升级边界。
- rendercore award/Spine player 的当前项目状态传递、图层可见性和 backdrop 提交。
- Popup Editor v5 draft/create/import/export、按项目类型生成的状态控件与 production preview。
- Popup 直接 consumer 对 v5 的最小 type/round-trip/rewrite 保护，以及相关文档。

### 不包含

- 不新增自定义状态、状态改名/排序 UI、条件表达式、game mode 或业务 component 绑定。
- 不改 award 五档 threshold、count duration、累计播放顺序、共享 win-amount 文本或
  Spine Popup start→loop→end 关闭状态机。
- 不把 award 项目的五个可见状态改成五套动画阶段；Spine/VNI 内部仍使用现有
  playback 设置。
- 不放宽旧 manifest strict parser，不直接改写仓库内 production Popup ZIP，不为非法旧数据
  增加 fallback/alias/index 截断。
- 不改 Popup attachment target/slot/order、focus 适配、资源路径、hash/closure、输入分派、
  canvas/ticker ownership 或游戏业务触发。
- 不新增依赖、不修改 lockfile、YAML、生成物、游戏 app 或 production assets。

## 3. 制定计划时的基线

```text
UTC: 2026-08-13T12:12:53Z
HEAD: c73059f849b1ddc3d0bb6dc25003becc2dc77daa
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
tasks/{190-popupeditor-project-resource-responsive-layer-refactor,
       195-popupeditor-spine-slot-layer-attachments}.md
docs/popup-manifest.md
apps/popupeditor/{README.md,package.json,src/{model/project.ts,io/popup-zip.ts,
                     preview/popup-preview.ts,ui/app-shell.ts}}
apps/popupeditor/tests/{project,app-shell,preview}.test.ts
packages/rendercore/{package.json,src/popup/{types,manifest,presentation,award-player,spine-player,
                               spine-overlay-runtime,layer-attachment,index}.ts
packages/rendercore/tests/popup/{manifest,presentation,award-player,spine-player,
                                 spine-overlay-runtime,package-resource}.test.ts}
packages/gameframeworks/src/index.ts
apps/{gamelayouteditor/{package.json,tests/popup-package.test.ts},
      gamelayoutpkgcli/{package.json,tests/reference-rewriter.test.ts}}
```

目标目录没有补充 `AGENTS.md`。规划会话未运行构建或测试。当前结论：

- `PopupSegment` 只有 `start | loop | end`；仅 image、text 和 manual ImgNumber 保存 `visibleSegments`，VNI/Spine 无字段，`win-amount` 硬编码为全程显示。
- Editor `segmentControls()`、新图层默认值和 change handler 写死三 segment；award 已有五个 tier tab，图层 inspector 仍显示 start/loop/end。
- Award player 以 tier 为 runtime/container scope，又在 tier 内以 start/loop/end 控制静态层，混合了 award 状态与动画阶段。
- `createPopupPresentation()` 只知道 Popup active 和 `backdrop.enabled`，不接收 award tier/Spine phase，因此压暗无法按状态切换。
- Popup v4 是当前 canonical authoring 版本；`importPopupZip()` 已先调用 shared strict parser/
  package prepare，再将 v1–v4 数据规范化到 Editor draft。该边界是升级 visibility 的唯一
  合法 owner。
- v1–v4 parser 只允许三个 exact segment 名并拒绝空集/未知值；因此合法旧数据不可能存在
  “五个选中值读入三状态项目”的情况，无需反向 five→three fallback。
- v4 已被 rendercore popup parser/player、Game Layout Popup package 导入、CLI typed rewrite 与
  gameframeworks public types 显式引用；增加 v5 属于跨 package public schema 变更，需要 L2 直接
  依赖链验收。

## 4. 需求解释与技术决策

### 需求解释

- “状态根据项目类型来”是 strict discriminated contract，不是一个允许任意 string 的公共数组。
  Award 项目只能写五个 exact tier id，Spine 项目只能写三个 exact phase。
- “所有图层”包括以前没有 `visibleSegments` 的 Spine、VNI 和 `win-amount`；attachment
  只改变父节点，不取消每层自己的状态可见性。
- Award 五档是可见性状态，图层内部的 Spine/VNI start/loop/end 仍是 playback lifecycle。
  两者同时存在时，最终 display visibility 是项目状态 gate 与 runtime lifecycle gate 的交集。
- “按 index 迁移”使用固定 source 顺序 `[start, loop, end]` 与 target 顺序：Award 为
  `[base, standard, bigwin, superwin, megawin]`，Spine 为 `[start, loop, end]`。例如旧数据
  `[start, end]` 迁移到 award 为 `[base, bigwin]`；只有 exact 三项全选才扩展为五项全选。
- 旧版中没有 visibility 字段的动画层与 amount 层原本就是全程显示，因此升级为
  target full set；不用空集或首项猜测。
- 压暗仍允许整体关闭；状态选择只决定启用时哪些状态显示，不负责把
  `enabled=false` 自动改为 true。

### 关键决策

1. **使用 strict Popup v5 表达新语义**
   - v4 中 `visibleSegments` 的名称、适用 kind 和 award runtime 语义都与新合同不同，不能
     在不升版的情况下改变旧 v4 播放结果。
   - v5 为每个 layer kind 强制写入 type-aware `visibleStates`，backdrop 同样强制写入
     `visibleStates`。v1–v4 wire types/parser/player 保留原样，不把新字段做成旧版 optional key。
2. **分离 project state 与 playback segment**
   - rendercore 定义 award/spine 状态集和一个按 manifest type 解析/评估的 helper；UI、parser、
     upgrader、award player、Spine player 和 backdrop 全部消费同一顺序源，不再复制数组。
   - `PopupSegment` 仍用于 Spine/VNI 播放和 snapshot；不用它表示 award 五档可见性。
3. **升级只在 Editor import 边界发生**
   - 先用 source version strict parser/package prepare 证明旧包合法，再调用 shared pure upgrader 生成
     candidate v5 draft；升级、attachment/prompt migration 和 closure 检查全部成功后才替换当前项目。
   - runtime 直接读取 v1–v4 时不在内存中伪装成 v5；这保持旧 consumer 的 exact 行为，也避免
     Editor 和 runtime 各维护一份升级逻辑。
4. **迁移规则使用索引而非状态名别名**
   - pure helper 先把旧 `visibleSegments` 转成三位选中向量。向量全 true 则返回目标
     full set；否则只把同 index 的 true 写入存在的 target index。
   - source parser 已拒绝 duplicate/unknown/empty 旧数据；upgrader 不处理非法数组，也不提供
     five→three 截断路径。
5. **可见性由 player 在状态边界原子提交**
   - Award player 在激活/切换 `activeTierId` 时统一评估 v5 图层和 backdrop；必须调整现有
     tier-container 粗粒度 visibility，使图层的五状态选择真正有效，不能被其创建时所在 tier
     永久限制。
   - Spine player 在 start/loop/end 边界用同一 helper 更新所有 overlay 和 backdrop。
     hidden 动画 runtime 仍按现有 completion/end drain 合同 update，visibility 不得成为新的 timeline owner。
   - attachment child 的有效可见性不得越过隐藏的 Spine/VNI parent；parser/package prepare 对必要的
     visibility subset/host 关系做 strict preflight，不在 runtime 自动回根或强行点亮 parent。
6. **Backdrop 保持 viewport-space owner**
   - `createPopupPresentation()` 仍唯一持有 Graphics、viewport redraw 和 destroy，只增加显式
     `setState(state)`/等价 typed 输入；award/Spine player 不自建 backdrop 或复制 viewport 逻辑。
   - idle/complete 仍不显示 backdrop，状态切换不重建 Graphics，resize 不改变选择。
7. **Consumer 仅传递 strict v5**
   - Popup Editor 使用 shared 状态定义渲染 checkbox 和写 draft，自动 preview 仍只消费
     `projectToManifest()` 与 production player。
   - Game Layout/Scene Layout 不编辑、升级或重建 Popup 内部状态；CLI 只做 typed resource
     reference rewrite，必须 exact 保留 visibility 数组。gameframeworks 只补 v5 type export。

## 5. 职责与合同

- **模块职责**：Popup Editor 拥有 draft/UI/import transaction 和 preview canvas；rendercore popup 拥有
  versioned schema、状态集、升级 helper、visibility 评估、player/backdrop lifecycle；consumer 只挂载
  Popup Container 并逐帧 update。
- **数据/API**：v5 的 `visibleStates` 是 non-empty、无重复、按 canonical order 输出的 exact id
  数组；award/spine 使用互斥 typed union。backdrop 的 state 集可为空以表示“启用但当前
  无状态压暗”，layer 为避免永久不可见仍要求 non-empty。
- **升级合同**：upgrader 输入必须是 source parser 返回的 immutable manifest，输出为新 v5 value；
  不修改 source，不读 UI selection，不猜项目类型。导入 prepare/升级/资源闭包任一失败时不替换
  当前 project/preview。
- **资源生命周期**：visibility 切换只修改 player-owned Container/Graphics 的显示 gate，不 destroy/recreate
  package resource、Spine/VNI player、attachment group 或宿主 stage。Popup/player destroy 仍幂等释放自有对象。
- **失败策略**：unknown version/project type/state，错项目类型状态，duplicate/空 layer state，非 canonical
  迁移输入，以及 attachment visibility 不可满足都在画面 mutation 前显式失败。
- **禁止行为**：禁止在 UI/player 各写一份状态表，按 string 别名迁移，为 award 沿用
  `visibleSegments`，隐藏时销毁动画，自动改父节点，或为旧 runtime 静默注入 v5 默认。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/state-visibility.ts
packages/rendercore/tests/popup/state-visibility.test.ts
tasks/207-popup-state-aware-layer-backdrop-visibility-<utctime>.md
```

如果现有 popup 模块中能保持单一 owner，可不新增前两个文件；不得把状态顺序、升级
和评估逻辑复制到 Editor、award player 与 Spine player。

### 预计修改

```text
packages/rendercore/src/popup/{types,manifest,presentation,award-player,spine-player,
                               spine-overlay-runtime,layer-attachment,index}.ts
packages/rendercore/tests/popup/{manifest,presentation,award-player,spine-player,
                                 spine-overlay-runtime,layer-attachment,package-resource}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/popup-zip.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/tests/{project,app-shell,preview}.test.ts
apps/popupeditor/README.md

packages/gameframeworks/src/index.ts
apps/gamelayouteditor/tests/popup-package.test.ts
apps/gamelayoutpkgcli/tests/reference-rewriter.test.ts

docs/popup-manifest.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

`layer-attachment.ts` 只在需要保证 hidden parent/visible child 的 strict preflight 或保存 child display gate
时修改；不为本任务重写 attachment graph。`popup-preview.ts` 只在需要显示当前 typed state 或修正
自动 rebuild 时修改。

### 原则上不应修改

```text
apps/{game002,game002v2,game003,game003v2,gameviewer,gameviewer2}/**
apps/gamelayouteditor/src/**
apps/gamelayoutpkgcli/src/**
packages/{logiccore,uiframeworks,vnicore,editorresource,browserartifactio}/src/**
packages/rendercore/src/{symbol,reel,background,scene-layout,spine}/**
assets/**
package.json
pnpm-lock.yaml
AGENTS.md
```

Game Layout/CLI 现有 typed traversal 若无需改 production source，只增加 v5 fixture 保护。若 v5 暴露实际
source narrowing 缺口，只修改 exact 分支并在报告说明；不将 Popup 内部 visibility UI 复制到
Game Layout Editor。

## 7. 实施步骤

1. **确认执行基线并固定旧行为**
   - 重新核对 HEAD/status、v1–v4 parser、Editor import 和 award/Spine player 状态边界。
   - 先增加 v4 三 segment 可见性、无字段 animated/amount 全程显示、backdrop enabled/disabled
     的回归，防止为 v5 迁移修改旧 runtime 结果。
2. **建立 v5 typed state visibility 合同**
   - 在 rendercore 定义 project-type 到 ordered state ids 的唯一映射、v5 layer/backdrop union、
     strict parser 和 public exports。
   - 要求全部 v5 layer kind 具有 `visibleStates`，按项目 type 拒绝未知/混用/重复值；
     canonical parse/output 使用稳定顺序。补 award/spine 合法与 strict failure fixture。
3. **实现唯一 v1–v4→v5 upgrader**
   - 实现 full-selection expansion 与 partial-selection index mapping，用表驱动测试覆盖 7 种合法非空向量与空向量失败；
     明确 `[start,loop,end]`→award full five，`[start,end]`→`[base,bigwin]`，以及
     Spine 三位 identity mapping。
   - 对旧 Spine/VNI/win-amount 等无字段层注入 target full set；对 backdrop 保留 enabled/color/
     alpha 并注入 target full set。升级后立即用 v5 parser 复验，不产生半 canonical draft。
   - 将 upgrader 接入 `importPopupZip()` 的 source strict parse/prepare 之后、project commit 之前；保留
     prompt/attachment 迁移与 assets closure 的原子失败语义。
4. **让 production player 消费项目状态**
   - 在 award 档位激活/切换和 Spine start/loop/end 边界调用统一 visibility commit；修正
     award tier container/layer ownership，确保五状态选择不受图层创建时所在 tab 的偶然结构限制。
   - 对所有 static/ImgNumber/text/Spine/VNI layer 统一叠加 state gate，同时保留动画
     enter/update/requestEnd/completion、amount rebind、string registry 和 attachment parent 生命周期。
   - 给 presentation 传入当前 typed state，验证 backdrop 在 active/enable/state/resize/complete 组合下的
     exact 可见性，不重建 Graphics 或触碰 content focus transform。
5. **升级 Popup Editor draft 与 UI**
   - 将 `formatVersion`/`projectToManifest()` 收敛到 v5；新建项目和新增任意 kind 图层由
     shared ordered state ids 建立 full selection，不在 `app-shell.ts` 写死三状态。
   - 用一个通用 state visibility control 替换 award layer/Spine overlay 的 segment 特判，并在压暗
     inspector 添加同源状态复选项。变更走现有 draft transaction/diagnostics/auto-preview，不直接操作 Pixi。
   - 测试 award 显示五项、Spine 显示三项、新增每种 layer 全选、取消/重选、项目
     导入后 v5 稳定重建与 export/reimport parity。
6. **保护 direct consumer 并更新文档**
   - 在 Game Layout 增加 v5 Popup ZIP import/vendor/reimport fixture，在 CLI 增加 v5 resource rewrite fixture，
     断言 type-aware `visibleStates` 和 backdrop 选择 exact 保留。补 gameframeworks v5 public type export。
   - 更新 Popup Editor/Rendercore README、`docs/popup-manifest.md` 与两份领域规则，把 canonical
     authoring 版本改为 v5，记录两种状态集、迁移策略和 runtime 仍支持 v1–v4。
7. **定向验收与报告**
   - 按第 8 节运行 L2 命令；失败先最小化到 parser/upgrader/player/UI/direct consumer 责任边界，
     不扩大到整仓。
   - 人工验收两种项目的图层和压暗切换，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- parser 覆盖 v1–v4 exact 回归、v5 两种 discriminated state set、unknown/duplicate/empty/wrong-type
  state 和 unknown version/key。
- upgrader 使用表驱动穷举三位旧选择向量；空数组不是合法旧 layer fixture，不为了测试
  放宽 source parser。
- player 覆盖所有 layer kind、award 五档逐档进入、Spine 三阶段、backdrop enabled/disabled/
  partial/full selection、隐藏动画仍完成 end drain，以及 replay/destroy 无泄漏。
- attachment 测试覆盖 child/parent visibility 组合，确保不回根、不修改 order，不因隐藏重建
  Spine slot group。
- Editor DOM 断言 checkbox 来自项目 type，不只检查 JSON；preview 用 production player 验证实际
  display/backdrop 切换。
- direct consumer 只验证 v5 typed pass-through/rewrite，不在 Layout/CLI 重复升级或 visibility 评估。

### 验收级别

`L2`。原因是 Popup v5 是 rendercore public versioned schema，并直接影响 Popup Editor、
gameframeworks type surface、Game Layout package vendoring 和 CLI typed rewrite。不修改根工具链、lockfile、
游戏 app 或 production assets，不需要 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter @slotclientengine/gameframeworks --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup
pnpm --filter popupeditor test
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts
git diff --check
```

第一条是公共 schema 变更的直接依赖链编译验收；后两条 consumer 测试只跑 Popup package
直接 fixture，不扩大到整个 editor/CLI 测试集。

### 人工验收

- 在真实浏览器新建 award 项目，逐种添加 image、文字、ImgNumber、VNI、Spine，确认每层
  均有五状态且默认全选；分别取消若干状态后播放跨档 award，画面与压暗按选择切换。
- 新建 Spine Popup，确认同样的全 layer kind 只显示 start/loop/end 三项，图层和压暗
  在点击触发 loop/end 时精确切换，动画播放和关闭边界未改变。
- 导入一个旧 award ZIP（三项全选和部分选中各一）与旧 Spine ZIP，确认 UI 中的
  v5 选中结果符合 index 规则，导出后再导入不再发生第二次扩展。

### 独立验收建议

`建议`。本任务改变正式 Popup schema 与旧数据升级，但不改 credential、服务器数据、
外部资源格式或宿主 ownership。独立复验重点是：

1. 三项全选与部分选中的 v1–v4→award v5 迁移结果；
2. award 五档与 Spine 三阶段的所有 layer/backdrop production 可见性；
3. v5 ZIP 经 Game Layout/CLI round-trip 后的 visibility exact parity。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 未切换时先执行
  `source /Users/zerro/.nvm/nvm.sh && nvm use 24`，不切换 npm/yarn。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置
  `http_proxy`/`https_proxy=http://127.0.0.1:1087` 重试原命令。
- 不预期新依赖或 lockfile 变更；若实际需要，必须先说明范围扩大。

## 10. 生成物、文档与规则

- 本任务不预期修改 YAML 或生成文件，不手改 `dist/`。
- 更新 `docs/popup-manifest.md`，记录 v5 discriminated visibility、backdrop state set、v1–v4 runtime
  支持与 Editor upgrade 规则；更新 Popup Editor/Rendercore README 的操作和 public workflow。
- 本任务会稳定改变 Popup canonical authoring/version 职责，因此最小更新
  `docs/agent-rules/{editor-artifacts,shared-game-runtime}.md`；不把具体状态数组或任务证据复制到
  根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行后以 `date -u +%y%m%d-%H%M%S` 创建
`tasks/207-popup-state-aware-layer-backdrop-visibility-<utctime>.md`，简要记录：

1. 最终 v5 数据形状、迁移结果和实际文件；
2. award tier runtime 可见性实现、关键决策与计划偏差；
3. 验收结果、未完成人工验收和剩余风险。

不收集无关 coverage、完整历史矩阵、整仓统计或 profiler 证据。

## 12. 风险、假设与待确认

### 风险

- Award 图层按 tier 存储并粗粒度隐藏；只改 schema/UI 会产生无效复选项，必须用 player 测试证明跨 tier 选择生效。
- child 选中某状态但 attachment parent 隐藏时仍无法显示，需 strict subset validation 和清晰诊断。
- Award 切档时旧 tier end drain 与新 tier start 并存；visibility gate 必须与 playback completion 分离，避免 hidden 动画卡住或泄漏。
- 部分选中迁移到 award 只对应前三状态，`superwin/megawin` 默认不选；必须呈现该 index 规则，不自作主张按名称转换。

### 假设

- “五档”指现有 exact `AwardTierId` 顺序：`base`、`standard`、`bigwin`、`superwin`、
  `megawin`；“Spine 三阶段”指 `start`、`loop`、`end`。
- 压暗的颜色、alpha 和整体 enabled 交互保持现状，本任务只在其上增加状态可见集。
- 合法旧包的五项选中数据不可能进入三状态项目，因为现有 strict parser 已在升级前
  限定 `visibleSegments` 为三个 exact 值。

### 待确认

无。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 修改未超范围，或偏差已报告；v1–v4 行为保持，v5 全链合同一致。
- [ ] 所有 layer kind 和 backdrop 均使用项目类型状态集，播放阶段未被误当可见状态。
- [ ] 三项全选扩展、部分选中按 index、旧无字段全选和非法数据 strict failure 已覆盖。
- [ ] 测试、文档和领域规则已同步；自动化与人工验收已分开记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的两份领域规则和本计划；
2. 核对 Git 基线与工作区，先固定 v1–v4 exact 回归；
3. 按计划实现 v5 schema、唯一 upgrader、runtime、Editor 和 direct consumer 保护，不另建一套方案；
4. 小幅偏差写报告；ownership、schema、lockfile 或范围明显扩大时先停止说明；
5. 只运行规定 L2 验收，完成后生成 UTC 报告；未经要求不 commit/push/创建 PR。
