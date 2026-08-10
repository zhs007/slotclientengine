# 190 popupeditor-project-resource-responsive-layer-refactor 任务计划

## 1. 目标与完成定义

### 目标

重构 Popup Editor 的项目、资源、配置和预览工作流，并新增隔离的 Popup v2 合同。启动时不再预置
可导出的示例项目，用户必须创建项目或导入项目 ZIP；项目与资源使用独立入口。新项目只有“获奖庆祝”
和“Spine 弹窗”两套配置模板，两类都支持 focus 重点区域、独立响应式适配、全屏压暗底和任意附加图层。

schema、严格校验、focus 算法、图层 presentation、Popup 播放和资源生命周期属于
`packages/rendercore/popup`。rendercore Popup 无论用于游戏、Game Layout Editor 还是 Popup Editor，都只
提供可挂到宿主 PixiJS stage 的 Container/节点树，绝不创建 `Application`、Renderer、canvas、DOM overlay、
ticker 或 RAF。Popup Editor 自己创建并持有 preview Application/canvas，把 rendercore Popup 节点挂到
preview stage，并负责 viewport、逐帧 update 和输入转发；rendercore 不提供特殊“独立预览渲染模式”。

### 完成定义

- [ ] Popup Editor 初始为“未打开项目”，只显示“创建项目”和“导入项目”；创建 dialog 要求项目名和类型，
      创建后资源库为空，对应模板的必需槽位未绑定，不能直接 preview/export。
- [ ] 项目 ZIP 只从项目入口导入并原子替换当前项目；资源区误选 Popup ZIP 显式提示，不能隐式替换项目。
- [ ] 资源统一上传但严格识别：VNI、ImgNumber 只接收各自 ZIP；图片、字体为单文件；Spine 的 JSON、atlas、
      全部 atlas page 图片按组 prepare/commit，可支持多 JSON 共享 leaf。
- [ ] 同 filename key 不同 bytes 必须逐项选择“覆盖”或“保留两份”；keep-both 使用 shared stable suffix。
      取消、未决冲突、歧义、绑定失效或 prepare 失败均不修改项目，禁止静默覆盖/改名。
- [ ] 获奖模板要求一个共享 ImgNumber，以及分别绑定 `bigwin/superwin/megawin` 的三个 VNI；materialize 后
      每档仍恰好一个 `win-amount`。Spine 模板要求一个 root 和三个真实、非空、互异的 start/loop/end 动画。
- [ ] 两类 Popup 都能配置以 `(0,0)` 为中心的上/下/左/右 focus extent；runtime 复用 rendercore 中与
      Game Layout 相同的 focus 算法，预览显示 production 适配、design viewport 框和 focus 框。
- [ ] 两类都可添加任意 image、Spine、VNI、单行系统文字、ImgNumber 图层，并编辑唯一 order、x/y、scale、
      rotation、alpha；kind 专属 playback、anchor、segment、string/style 严格校验。
- [ ] 文字默认 `system-ui, sans-serif` 且不入资源闭包，也可选择 package-owned WOFF2/WOFF/TTF/OTF；
      第一版支持纯色、线性渐变、描边、投影和 grapheme 拱形排版。
- [ ] v2 全屏底默认启用 `#000000`、alpha `0.5`，可改色/透明度或关闭；它是宿主主 Pixi stage 内的
      viewport-space Graphics 节点，覆盖当前 canvas，且不跟随 content focus/placement/scale/rotation。
- [ ] 所有 consumer 中 Popup 都只是宿主 display tree 节点。游戏/Layout 复用主 renderer/ticker/canvas；
      Popup Editor 挂入其自建 preview stage。rendercore 不创建或销毁宿主 Application/Renderer/canvas/ticker。
- [ ] 普通 Spine Popup 的整个宿主 canvas 可点击；start 阶段点击立即锁存，start 完成且下一次完整 loop
      到边界后进入 end。keyboard、idle passthrough、一次输入一次操作保持。
- [ ] Preview 不再提供 `Build preview`：项目创建/导入、资源提交和合法配置变化后像 Game Layout Editor 一样
      自动重建 production preview；快速连续输入去抖，旧 generation 不得覆盖新结果，失败显示错误并保留
      最后一次成功预览，不留下半构建 player/resource。
- [ ] 删除 `Advance`、`Click / Dismiss`、`Dismiss immediately` 等模拟点击按钮；award advance 与 Spine dismiss
      只由 preview canvas 点击或键盘触发。保留开始/重播所需的 `Play / Replay`，它不模拟用户关闭输入。
- [ ] 新项目导出 v2；旧 v1 ZIP 可打开并默认无损写回 v1，只有显式升级才写 v2。Popup Editor、Game Layout
      Editor、CLI、Scene Layout runtime、gameframeworks 都严格支持 v1/v2；现有 crave/minecart2 v1 行为不变。
- [ ] L2 自动验收通过并生成 UTC 中文报告；真实浏览器验收由用户完成，报告明确标为待用户验收。

## 2. 范围

### 包含

- Popup Editor 的 no-project landing、create/import/close/export、v1/v2 draft、资源冲突 review、两套模板、
  通用图层/focus/backdrop inspector，以及由 Editor 自己持有 Pixi Application/canvas 的 production preview。
- rendercore popup 的 v1/v2 parser、typed rewrite/closure、responsive Container、backdrop/content 分层、通用
  alpha/系统字体文字、player viewport API；直接复用 rendercore viewport 的 focus primitive。
- Game Layout Editor 的 v1/v2 dependency 导入、只读 owner 数据、preview、vendor/reimport；Scene Layout
  host placement 与 v2 adaptive content 的组合；CLI typed rewrite/WebP/asset-groups；gameframeworks 必要 re-export。
- v1 mapped ZIP、仓库能证明曾正式导出的 legacy v1、v2 ZIP、v1/v2 nested layout ZIP 的 round-trip、
  prepare/rollback/destroy 测试，以及 manifest/README/领域规则更新。

### 不包含

- 第一版不实现彩虹字、纹理填充、滤镜编辑器、任意 Bézier 路径或完整 360° 圆形文字；只做已确认的
  solid/linear-gradient、stroke、shadow 和 `-180..180` arc。
- 不做画布拖拽回写、时间轴/关键帧、Spine/VNI/ImgNumber 内容编辑、图集打包、图片转码、字体子集或资源生成。
- 不保留手动 Build、Advance、Dismiss、Immediate Dismiss 作为隐藏/高级入口，也不在自动构建失败后静默
  降级为手动 build；诊断与最后一次成功预览必须明确区分。
- 不做后端、账号、云素材库、自动保存或浏览器持久化；ZIP 是项目持久化边界。
- rendercore/production Popup 不得创建独立 Application/Renderer/canvas、离屏 canvas、DOM/CSS backdrop、
  iframe、私有 ticker/RAF 或第二渲染 surface。
- 不把 project ZIP 当资源，不从文件名猜项目类型、业务触发、Spine binding/animation、tier/layer/game mode。
- 不改金额、threshold、award advance、Spine loop boundary、transition 编排或游戏业务触发；不修改 assets、
  YAML、生成物、workspace 依赖、lockfile；不为无 fixture/样本的历史格式添加宽松猜测兼容。

## 3. 制定计划时的基线

```text
UTC: 2026-08-10T05:13:52Z
HEAD: 2edb004eb2b6a66addaf5e6f240269854f763fbe
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{editor-artifacts,shared-game-runtime,scene-layout}.md
tasks/{108-popup-editor-award-celebration-bootstrap,161-popupeditor-spine-popup,
       182-rendercore-popup-canvas-input}.md
docs/popup-manifest.md
```

目标目录无补充 `AGENTS.md`。未读 game002/game003 规则，因为计划不修改游戏 app/业务/资源；若执行发现
shared runtime 不足而必须改 app，应先说明范围并读取对应规则。当前结论：

- `createPopupEditorProject()` 启动即创建 award draft；项目是普通 tab，还能直接切 type，没有 no-project/
  create dialog。`app-shell.ts::reviewFiles()` 又在资源上传中识别 Popup ZIP 并替换项目。
- resource importer 当前允许 loose VNI、ImgNumber directory/ZIP 和普通混合文件。Spine 已能按 atlas/pages
  建 root；新入口需限制 VNI/ImgNumber 为 ZIP，但保留 Spine 分组事务和共享 leaf。
- shared `resolveEditorAssetImportReview()` 已有 `overwrite | keep-both` 和 stable suffix；Popup UI 未收集选择，
  目前同名不同 bytes 实际默认覆盖，批内冲突阻塞。
- rendercore 只有 `PopupManifestV1`。现有 layer 已覆盖 image/text/ImgNumber/VNI/Spine、rotation，以及文字
  solid/gradient/stroke/shadow/arc；缺通用 alpha、focus、backdrop，award text 仍强制 font resource。
- Popup preview 当前自己创建 `Application`/canvas并挂 player Container，这是正确 ownership；它只做简单
  design-viewport fit。Scene Layout 也把 player Container 挂到 `#popupRoot`。重构不得把 Editor preview 的
  Application/canvas 下沉到 rendercore，也不得新增 rendercore preview renderer。
- `app-shell.ts` 当前要求用户点击 `preview-build`，并提供 `preview-advance`、`preview-dismiss`、
  `preview-clear` 三个模拟交互按钮；这些与 Game Layout Editor 的响应式预览及整块 canvas 输入合同不一致。
- `maximizeFocusedArtViewport()` 已是 Game Layout 通用算法。任务 182 已完成主 canvas native input；
  `SpinePopupPlayer.requestDismiss()` 在 start/loop 都锁存，任务 190 只保护和修实际接入回归。
- Game Layout、CLI、scene-layout、gameframeworks 多处直接使用 `PopupManifestV1`，所以是 L2 public schema 变化。
  `assets/crave`、`assets/minecart2` 含可回归的 content-addressed v1；规划时未运行构建/测试。

## 4. 需求解释与技术决策

### 需求解释

- “默认空项目”指启动时没有已加载项目；创建后只有模板结构和未绑定 slot，没有 placeholder 资源。
- dialog 输入 name/type。v2 `name` 与稳定 `id` 分开：transaction 内用 Web Crypto 生成一次合法 id并存入 ZIP，
  不从显示名/文件名反推；测试注入 id factory。v1 不伪造 name。
- 资源仍只有一个 shared review/upload workflow，不为每个 kind 复制 workspace/hash/importer；Popup ZIP 永远
  走项目入口。award 的一个 amount ImgNumber materialize 到五档唯一 win-amount，三个 VNI 分别属于三档。
- focus extent 均为非负并形成 design viewport 内正面积 rect；rendercore结构化换算后调用共享算法。
- v2 package focus先决定 responsive content transform，Scene Layout现有x/y/scale再作为host显式微调；
  backdrop不参与二者，v1继续原placement行为。

### 关键决策

1. **strict v2 与 v1 隔离**
   - `PopupManifest = PopupManifestV1 | PopupManifestV2`，各版独立拒绝 unknown key/version、无关字段、缺资源/
     orphan；不把 v1 改成大量 optional。新项目输出 v2；v1 import 默认仍输出 v1。
   - 显式“升级到 v2”在 candidate draft 加入 name/focus/backdrop/alpha/system-font合同，完整prepare后commit；
     取消/失败不改原项目。v1 runtime、无 backdrop、layout placement 保持 exact。
2. **项目与资源分层**
   - store 使用 `project | null`；create/import/close 是 project transaction，replace/close/destroy释放旧 preview、
     Object URL 和 generation。type 创建后不可原地转换；project ZIP完整校验/prepare后一次replace。
   - preview订阅已提交project snapshot，合法变化自动调度重建；去抖只合并中间请求，不改变draft，generation
     token隔离late success/error。invalid draft显示diagnostics且不销毁最后一次成功player。
3. **shared conflict resolution**
   - review逐项收集overwrite/keep-both；批内同名不同bytes只能keep-both。compound Spine/VNI/ImgNumber refs
     随shared resolution原子改写，candidate提交前重验全部binding、animation、atlas、closure和preview prepare。
4. **必需 slot 与通用 layer**
   - authoring slot 与 layer arrays 分层，由一个 deterministic materializer生成manifest，import adapter恢复，
     不维护第二份production表。上传只入库，不因唯一候选自动绑定。
   - common layer是strict kind union和`order/x/y/scale/rotation/alpha`；order在scope内唯一，alpha为`0..1`。
5. **系统文字**
   - v2 text font为`system | exact font resource`；system不建资源。复用`createPopupStyledText()`，不另写prompt/
     preview renderer；legacy v1无损。
6. **宿主 stage 内 backdrop/content 分层**
   - v2 player只创建普通Pixi Container节点树：viewport-space presentation root内有backdrop Graphics和
     contentRoot；`applyViewport(size, hostPlacement?)`更新backdrop和focus matrix，状态机只挂contentRoot。
   - player不持有Application/Renderer/canvas/ticker/RAF。Popup Editor自行创建preview Application/canvas、
     `addChild(player.container)`、逐帧`update()`并转发input；游戏/Layout同样挂入主stage。rendercore无consumer
     特判或独立preview模式。Popup destroy只销毁自有children，不触碰宿主。
7. **输入只做回归**
   - native canvas event覆盖边缘/透明区、start latch、重复点击、loop boundary、idle、destroy解绑；失败只修
     shared binding/lifecycle，禁止editor/game增加hit area、DOM overlay或第二套phase/click状态机。
   - Popup Editor移除advance/dismiss/immediate按钮及其handler；canvas/key是唯一主交互入口，Play/Replay只负责
     start/restart。测试断言不存在能绕过production input dispatcher的DOM操作入口。
8. **nested consumer 共用 typed graph**
   - Game Layout对v1/v2 nested数据只读，round-trip不升级；CLI通过rendercore typed traversal改写两版，
     不扫描JSON string；gameframeworks只re-export，游戏不写version switch。

## 5. 职责与合同

- Popup Editor拥有session/draft/UI/resource review和preview宿主Application/canvas；不拥有parser/focus数学/
  player display tree内部。rendercore popup拥有v1/v2 schema、rewrite/closure、resource prepare、自有Container
  节点、layer/input/player lifecycle，但不拥有Application/Renderer/canvas/ticker。
- rendercore viewport拥有focus几何；Scene Layout/Game Layout拥有dependency、root order、host placement和主
  stage挂载；CLI拥有ZIP rewrite/rehash/map/groups；gameframeworks/game只负责facade、业务触发和数据。
- import/upgrade/preview全部prepare成功才commit；失败等待已启动prepare收敛并rollback。workspace拥有bytes，
  package resource拥有texture/FontFace/Object URL，player拥有自有display children，宿主拥有stage/renderer。
- unknown version/type/kind/effect、非法focus/backdrop/alpha/order、缺slot/resource/animation、atlas错误、冲突
  未决、hash/size/path/orphan、字体错误、destroy后使用显式失败。禁止猜测、静默alias/rename/upgrade/fallback、
  第二资源表、focus算法、Spine/click状态机或游戏规则副本。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/presentation.ts
packages/rendercore/tests/popup/presentation.test.ts
apps/popupeditor/src/model/project-session.ts
tasks/190-popupeditor-project-resource-responsive-layer-refactor-<utctime>.md
```

可按现有边界合并文件，但 backdrop/focus 必须单一 owner；无需 session 文件时留在 `project.ts`。

### 预计修改

```text
packages/rendercore/src/popup/{types,manifest,package-resource,award-player,spine-player,
  spine-overlay-runtime,styled-text,index}.ts
packages/rendercore/src/viewport/{focused-art-viewport,index}.ts
packages/rendercore/src/scene-layout/{types,manifest,package-resource,package-runtime,presentation-surface}.ts
packages/rendercore/tests/{popup,viewport,scene-layout}/**
packages/rendercore/README.md
apps/popupeditor/src/{model,io,preview,ui}/**
apps/popupeditor/src/{main.ts,styles.css}
apps/popupeditor/tests/**
apps/popupeditor/README.md
apps/gamelayouteditor/src/{model,io,preview,ui}/**
apps/gamelayouteditor/tests/**
apps/gamelayouteditor/README.md
apps/gamelayoutpkgcli/src/{asset-groups,reference-rewriter}.ts
apps/gamelayoutpkgcli/tests/**
apps/gamelayoutpkgcli/README.md
packages/gameframeworks/src/index.ts
packages/gameframeworks/tests/scene-layout-template.test.ts
docs/{popup-manifest,scene-layout-manifest}.md
docs/agent-rules/{editor-artifacts,shared-game-runtime,scene-layout}.md
```

### 原则上不应修改

```text
apps/{game002,game002v2,game003,gameviewer,gameviewer2}/**
assets/**
packages/{logiccore,uiframeworks,vnicore}/**
packages/rendercore/src/spine/**
apps/gamelayouteditor/scripts/build-task*.ts
package.json
pnpm-lock.yaml
AGENTS.md
```

若必须改 scene-layout manifest version、游戏 app、production asset 或 workspace 依赖，先说明兼容缺口和范围。

## 7. 实施步骤

1. **冻结 v1 基线**：重查HEAD/status，从正式fixture/crave/minecart2提取只读最小v1回归，锁定
   parse→prepare→play→rewrite→layout vendor/reimport、旧placement和start点击锁存；只兼容有证据的旧格式。
2. **建立 v2 typed graph**：定义v2 name/adaptation/backdrop/common alpha/system-font和两种互斥模板；parser
   覆盖strict failure。collect/rewrite/flatten/namespace/prepare统一支持两版，补closure/rollback/destroy测试。
3. **实现 presentation 节点**：在宿主stage内建立backdrop/contentRoot，extent转focus并调用共享viewport算法；
   award/Spine挂contentRoot并暴露viewport API。测试v1 exact、v2多宽高比/host placement/backdrop，以及绝不创建
   Application/Renderer/canvas/ticker、destroy不触碰宿主。
4. **重构项目 session**：实现null landing、create/import/close/export、稳定id和generation cleanup；两种v2模板
   只建必需slot不建placeholder；v1显示legacy状态并默认v1写回，显式upgrade成功才replace。
5. **收紧资源与冲突**：移走资源入口中的project import；限制VNI/ImgNumber ZIP，按组导入Spine，接入逐项
   overwrite/keep-both；测试取消、批内冲突、共享leaf、替换失效、rollback/GC/Object URL cleanup。
6. **完成编辑 UI**：award各档与Spine overlay使用一致add/remove/reorder inspector；按kind编辑common transform、
   playback、anchor/segment、string/style；focus显示derived rect，backdrop默认黑50%，所有变化走typed transaction。
7. **接入自动 preview**：`PopupPreview`继续唯一拥有preview Application/canvas/ticker；app-shell在合法draft变化后
   去抖自动rebuild，按generation原子替换resource/player，失败保留最后成功画面。移除Build和三个模拟点击按钮；
   Play/Replay只启动，advance/dismiss只走canvas/key。resolution调用production viewport API，guide读同一snapshot。
8. **接入 Layout/CLI/facade**：Layout把两版Container挂既有`popupRoot`并由主ticker update；v2组合adaptation与
   placement，v1不变。CLI覆盖typed refs/groups，gameframeworks同步re-export，用v1/v2 nested fixtures验收。
9. **文档与收尾**：更新manifest/README/三份领域规则，搜索第二parser/focus/click/renderer和手改assets/generated，
   运行L2命令并生成报告，列出用户浏览器矩阵。

## 8. 测试与验收

### 测试原则

- v1/v2分别用canonical fixture，显式upgrade单测；覆盖unknown version/key、slot、focus/alpha/order、resource/
  animation/font、map/hash/path/orphan、typed rewrite和round-trip。
- transaction覆盖prepare/commit/rollback/GC/destroy；失败后比较完整draft/workspace/selection/player generation。
- 自动preview覆盖初次合法化、普通字段/资源变化、连续输入合并、out-of-order completion、invalid→valid、
  rebuild失败保留旧player，以及close/destroy取消pending work；DOM断言Build/Advance/Dismiss按钮不存在。
- viewport结果与shared focus snapshot比较；runtime/Editor测试证明rendercore只增加display nodes：Editor只有其
  自建preview canvas，游戏/Layout复用主canvas，rebuild/resize不新增canvas，destroy后宿主仍可渲染。
- input用真实`HTMLCanvasElement.dispatchEvent()`，验证start latch和loop boundary，不只调用方法/Pixi emit。
- production assets只读验证，不改`assets/**`，自动测试不冒充浏览器视觉验收。

### 验收级别

`L2`：新增正式Popup schema版本和跨包player/presentation API，直接影响rendercore、两个editor、CLI和facade；
范围可界定，不需整仓L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks build
git diff --check
```

多filter coverage runner不稳定时可机械拆分package test，不升级验收；失败先最小化到目标test file。

### 人工验收

由用户在真实浏览器执行，报告标为待用户验收：

1. 创建/取消两种项目，导入/关闭v1/v2，资源区误选Popup ZIP，冲突覆盖/保留两份；确认没有Build按钮，
   合法配置变化会自动更新预览，错误配置显示diagnostics且最后一次成功画面不闪退。
2. award/Spine在横屏、竖屏、方形、自定义分辨率查看focus/适配、layer transform/alpha、字体效果和全屏底。
3. 确认没有Advance/Dismiss/Immediate按钮；用canvas透明区/边缘及start阶段点击、键盘操作award/Spine。
   Game Layout和实际游戏加载v1/v2；开发者工具确认Editor只有自建preview canvas，游戏无新增canvas/renderer/RAF。

### 独立验收建议

`必须`，因为涉及public contract、正式schema/ZIP、resource ownership和旧游戏兼容。复验：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter popupeditor --filter gamelayouteditor test
pnpm --filter gamelayoutpkgcli test
```

## 9. 环境与依赖

- 使用Node 24和pnpm；无Node时执行`source /Users/zerro/.nvm/nvm.sh`后`nvm use 24`。
- 缺依赖时使用`CI=true pnpm install --frozen-lockfile`；只有下载失败后设置仓库约定代理重试。
- 预计不新增依赖/lockfile；Web Crypto、Pixi Graphics、dialog、editorresource和viewport能力已存在。

## 10. 生成物、文档与规则

- 预计无YAML/生成TS；不得手改generated或`assets/**`。`docs/popup-manifest.md`记录v1 legacy+v2 canonical；
  Scene Layout文档只记录host组合。同步相关README和三份领域规则，不修改根`AGENTS.md`。
- 精确字段/默认值在manifest文档和测试，执行证据在任务报告，不复制到长期规则。

## 11. 执行报告

执行后创建`tasks/190-popupeditor-project-resource-responsive-layer-refactor-<utctime>.md`，UTC用
`date -u +%y%m%d-%H%M%S`。记录最终文件/API/v1 fixture、偏差、命令结果、用户待验收和剩余风险。

## 12. 风险、假设与待确认

### 风险

- Container拆为viewport presentation会影响placement/z-order/visible/destroy；必须覆盖v1/v2 nested runtime。
  backdrop必须是宿主stage Graphics，DOM或独立renderer会破坏层级、输入和ownership。
- v1显式升级v2无法保证所有宽高比视觉不变，因此默认保持v1并要求配置/确认focus。
- Spine/shared atlas keep-both同时改root/atlas/texture refs；必须结构化改写并完整prepare。
- 多active Popup可能叠加backdrop；只允许playing Popup显示底。系统字体跨OS不保证像素完全相同。

### 假设

- 旧包至少包括当前mapped v1及仓库fixture/assets能证明的格式；更早ZIP需要用户提供样本。
- 一个ImgNumber资源供五档各自唯一win-amount，三VNI分别属于big/super/mega；base/standard不要求VNI。
- Scene Layout placement保留为host微调，v2 focus是基础适配；不自动升级layout manifest。
- 浏览器验收由用户完成，执行者不自动控制浏览器或把未验收写成通过。

### 待确认

- 用户浏览器验收后再决定第二版是否加入彩虹字、完整圆形或其它路径排版。
- 若用户旧ZIP不属于已证明格式，取得样本后补精确migration fixture，不添加宽松fallback。
