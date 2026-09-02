# 283 gamelayouteditor-ui-radio-control-layer 任务计划

## 1. 目标与完成定义

### 目标

为 Game Layout Editor 与 RenderCore Scene Layout 增加可扩展的 `ui-control` 图层分类，并实现首个由 `off` / `on`
两张图片组成的 `radio` 单选框控件。编辑者可从已导入的 image root 明确选择两张图片、配置 UI 控件图层的名称、
order、mode/orientation scope 与 placement；production runtime 可按控件名取得 typed 控件、读取和修改当前状态，用户点击控件时切换状态并发布
全局唯一的 canonical Game Layout event。该 event 必须进入共享 catalog，使全局 Event 音乐音效对话框可直接选择。

### 完成定义

- [ ] Game Layout Editor 的“添加图层”流程可明确选择 `图形` 或 `UI 控件` 分类；`UI 控件` 下首个且当前唯一 kind 为
      `radio`，不得把它显示或保存为普通 image 图层。
- [ ] Editor 可原子创建 `ui-control/radio` 图层，必须分别选择一张 `off` 图片和一张 `on` 图片；二者是
      已提交的 image root、logical filename key 不同、实际尺寸相同，不从文件名猜状态。
- [ ] `ui-control/radio` 复用图层公共的唯一 id、全局 order、mode/orientation scope、landscape/portrait placement、
      normalized center、rotation、preview selection guide、资源替换与 exact export closure。
- [ ] 控件初始状态固定为 `off`；生产 preview/游戏中对可见控件执行一次有效 `pointertap` 后原子切换到另一张图片，
      同一次输入不得继续触发 Splash primary action、Popup 或宿主 canvas click 行为。
- [ ] runtime 通过 control 名或 owner-first `gamelayout:/ui-control/<control-id>` 取得 discriminated `radio` capability，
      并可 `getState()` / `setState("off" | "on")`；不把控件伪装为普通 RenderObject，也不公开 Sprite、Texture 或 display tree。
- [ ] 状态真正改变并已提交画面后发布 exact `off/entered` 或 `on/entered` event；初始化、same-state set、失败、
      destroy 和不可见控件点击不发布 occurrence。
- [ ] 每个控件的两个 event 地址只由 canonical control id 派生、在一个 package 内全局唯一，并带 previous/current/
      source detail；pointer 与 programmatic set 共用同一提交和派发路径。
- [ ] RenderCore shared event catalog 新增独立 family/facets；EditorCore 与 Game Layout Editor 的 Event dialog 可搜索、
      逐级选择、保存并复验该 exact event，不解析地址或维护 app-local event 表。
- [ ] 合法旧 v1–v7 package 行为不变；latest 仍为 Scene Layout v7，`eventAudio.version` 仍为 1，不增加 manifest 版本号。
- [ ] parser、资源 prepare/rollback/destroy、ZIP 往返、runtime API/event、Editor DOM 与真实两图点击完成自动和人工验收，
      并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- Scene Layout v7 的 `nodes` 增加 mutually-exclusive `图形 resource | uiControl` 图层分类；`uiControl` 使用可扩展
  discriminated union，首个 kind 为 `radio`。同步 data/core/editor public type、strict parser、引用收集、runtime allocation
  parity、production ZIP / delivery typed traversal。
- RenderCore 用一个稳定 UI control layer slot/Sprite 管理两张 texture、中心几何、pointer hit target、状态 capability、事件 observation、
  package runtime bridge、runtime address descriptor 与 shared event catalog。
- Game Layout Editor draft、resource reference graph、创建/重绑 command、双 image Resource Picker、Inspector、preview、
  import/export/reimport、selection guide、diagnostics 与 event-audio dialog 接入。
- EditorCore对新event family/facet的展示文案和共用dialog测试，以及三个package的定向测试、README、Scene Layout
  manifest文档和最小领域规则更新；不改变catalog ownership。
- 使用 `/Users/zerro/Downloads/crave/splash/splash_flag_off.png` 与 `splash_flag_on.png` 做真实浏览器人工验收。

### 不包含

- 不实现互斥 radio group、多个控件联动、disabled/hover/pressed 第三张图、键盘导航、表单提交或 DOM `<input>`。
- 不增加可配置初始状态；新建、导入和完整 runtime 重建后的确定初值均为 `off`，游戏需要其它初值时在 init 后显式
  `setState("on")`。
- 不把两个状态建成普通 Spine state machine、两个重叠图形图层、runtime resource factory 或 app-owned Sprite。
- 不把文件名中的 `_off` / `_on` 当 binding 合同，不自动配对资源、不默认选择首项、不接受同一路径冒充两张图。
- 不新增event predicate/detail filter/raw address输入/app-local event family；Event audio仍只绑定exact catalog event。
- 不修改Symbols、Popup、AudioCore schema/runtime、游戏业务流程、production assets、YAML、根工具链、依赖或lockfile。
- 不复制下载目录图片进仓库；它们只作为用户提供的验收输入，正式 Crave package 的导入/导出由用户在 Editor 中完成。

## 3. 制定计划时的基线

```text
UTC: 2026-09-02T04:10:00Z
HEAD: e2f8bde9d7a2ee8aca8083ab0e35c2bbad81aa90
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取根`AGENTS.md`、`tasks/templates/task-plan.md`、tasks 278/222计划及
`docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md`。

`apps/gamelayouteditor`、`packages/rendercore`、`packages/editorcore` 下没有补充 `AGENTS.md`。

当前结论：

- `packages/rendercore/src/scene-layout/types.ts#SceneLayoutNode` 当前每项都要求一个
  `SceneLayoutNodeResourceSpec`（image、Spine、image-string、VNI），没有图层分类或 `uiControl` union；
  `SceneLayoutRenderObject` 同样只公开四类图形 borrowed capability。
- `manifest-v7.ts#parseSceneLayoutManifestV7()` 对 v7 root/node/scope 做 strict 校验，但当前借 v6 validation document 复用
  普通 node/resource 校验；新增 `uiControl` 分支必须建立 v7-only strict 路径，不能顺手让 v1–v6 接受该字段，也不能用
  synthetic image 把 UI 控件静默降级成图形。
- `manifest.ts#collectSceneLayoutAssetPaths()`、`resource.ts#createSceneLayoutResource()`、`runtime.ts#initNode()`分别拥有
  exact path、resolved resource与display owner；新增控件应沿这条唯一链扩展。
- `core/runtime-address.ts#createGameLayoutRuntimeAddresses()` 已为图形 node 发布
  `gamelayout:/node/<id>` 的 `render-object` endpoint；UI 控件需要同一 compiled manifest pass 发布独立
  `gamelayout:/ui-control/<id>` typed endpoint，不能混入 RenderObject 或在调用时扫描 manifest。
- `core/runtime-address-catalog.ts#compileGameLayoutRuntimeEventCatalog()` 是 runtime、editor inspector 与 Event dialog 共用的
  唯一 event family/facet/address 编译器；`package-runtime.ts` 的 address controller 是唯一 bind/wait/emit owner。
- `apps/gamelayouteditor/src/model/editor-project.ts#EditorNodeDraft` 当前只有单 `resourceId` 图形形状；
  `resolveEditorNodeResource()`、`editorProjectToManifest()` 与 `manifestToEditorProject()` 是 draft↔v7 的原子边界。
- `resource-commands.ts#addLayerFromResource()`、`getLayoutResourceReferences()`、delete/replace/rebind 和
  `ui/app-shell.ts` Resource Picker 都只理解单 root；第二张 image 必须进入同一 reference/transaction，而不是额外 UI map。
- `ui/layout-workspace.ts` 已统一普通图形 node 的 id/order/scope/placement Inspector；新 draft 应抽出图层公共字段，并在
  outline/Inspector 明确标注 `UI 控件 / 单选框`，复用公共几何同时提供两状态资源绑定摘要和分别重绑入口。
- `preview/layout-preview.ts` 使用同一个 production package runtime；但 `app-shell.ts#init()` 还在 preview host 的 DOM `click`
  上触发 primary game-mode action。控件消费 pointer 时必须阻止该 native event 继续冒泡，不能在 app 里猜点击坐标。
- `packages/editorcore/src/assets/ui/game-layout-event-dialog.ts` 直接消费 catalog，family/facet label 只负责展示；新增 family 后
  group dialog 与 single picker 可共用现有渐进选择/检索，不需要修改 dialog public API。
- 两张用户素材均为 145×50、8-bit RGBA、non-interlaced PNG：off 为 4,159 bytes / SHA-256
  `bb6e1cc54ba96556ea6cdb1526a131c594d3ab2dba780c517c9e7ace7b191ba9`，on 为 1,605 bytes / SHA-256
  `b508af0d97aef3d8a2ad4be94acb483db25742900830b1a1887aa630affe10b1`。

## 4. 需求解释与技术决策

### 需求解释

1. “图层类型，属于 UI 控件分类”表示 manifest/editor/runtime 都必须先区分图形与 `ui-control`，再以可扩展 union 区分
   控件 kind；首个 kind 精确命名为 `radio`，不能只把它塞进图片 resource kind。
2. 用户同时明确“配置 2 张图片、点击切换状态”；本任务的 `radio` 是单个二态图片单选框，不推导多个 radio 的互斥
   group 语义。
3. “通过名字取到”使用图层公共唯一 id 作为 control id，并通过 `getUiControl(id)` / owner-first canonical address查找；
   不增加另一个可漂移的 display name/alias。
4. “能收到这个 event”解释为状态实际进入 `off` / `on` 后的离散 event；exact state event 比只有 detail 的通用 changed
   event 更适合 Event audio，因为 dialog 不应解析 detail 再做 predicate。
5. “event 全局唯一命名”表示 package event catalog 中完整 canonical address 唯一，不要求不同 Layout package 的裸 control id
   全局注册；package runtime 实例仍是 ownership 边界。
6. “不需要修改 manifest 版本号”作为明确合同：latest 保持 v7，新增的是 v7 node 的 additive `uiControl` union 分支；旧
   v7图形node行为不变，v1–v6继续strict拒绝该字段。执行时不得自行升级为v8或修改eventAudio version。

### 关键决策

1. **把图层建模为显式 union，`uiControl` 是可扩展控件分类。**
   - `SceneLayoutNode` 抽出 id/order/scope/placements 公共字段，并形成 strict mutually-exclusive union：图形分支保留现有
     `resource`，UI 控件分支保存 `uiControl: SceneLayoutUiControlSpec`；同一 node 不得同时或都不声明两者。
   - `SceneLayoutUiControlSpec` 是 discriminated union，当前只有
     `{ kind: "radio", off: { path, size }, on: { path, size } }`。后续其它 UI 控件扩展该 union，不增加平行 root、布尔
     feature flags 或文件名约定。
   - 两侧 path 必须不同，声明尺寸必须相等、有限且为正，并在 texture prepare 时与实际 logical texture size 精确复核。
     runtimeAllocation 继续把 UI 控件当一个 active layer；两图进入该 control 的 exact typed closure。
2. **Editor draft 同样使用 `graphic | ui-control` discriminated union。**
   - `EditorNodeDraft` 抽出公共图层字段；graphic分支保留resourceId/playback/imageString，UI分支保存
     `{ layerType: "ui-control", control: { kind: "radio", offResourceId, onResourceId } }`。现有新建/导入图形明确规范化为
     `layerType: "graphic"`，不按字段缺失猜分类。
   - 添加图层先选分类；选择UI控件后再选`radio`。创建picker一次选择off/on两槽并一次提交；Inspector分别重绑任一槽。
     覆盖、删除、引用计数、clone、rename、import/export都把两槽视为同一UI control layer的typed references。
3. **一个稳定 Sprite、两张预加载 Texture、固定 off 初值。**
   - init 在提交 node 前并发准备两张 texture，任一缺失/解码/尺寸失败则清理 candidate，node 不进入半可用状态；成功后用
     同一个 centered Sprite 切 texture，hit area 与 placement 不漂移。
   - state 跨 mode scope 隐藏、orientation resize、geometry-only manifest replacement 与普通 relayout 保留；完整 runtime
     rebuild 才恢复 off。destroy 移除 pointer listener、释放 texture owner 引用并使旧 capability 失败。
4. **UI control 有独立 typed capability，不伪装成 RenderObject。**
   - `SceneLayoutUiControl` 使用 discriminated union；首个 `SceneLayoutRadioControl` 公开 `kind: "radio"`、`getState()`、
     `setState(state)`。`SceneLayoutRuntime.getUiControl(id)` 按公共图层id取得它；图形 `getRenderObject(id)` 对UI控件不返回对象。
   - runtime address增加`ui-control` endpoint kind；`addresses.resolve("gamelayout:/ui-control/<id>", "ui-control")`返回同一
     稳定 capability。descriptor detail带`controlKind: "radio"`，不新增alias或runtime扫描。
   - `setState()` 先 strict 校验 state，再同步换图并派发；same-state 是无 mutation/no event 的幂等操作。caller 不能修改
     authored placement/visibility owner，也不能销毁控件。
5. **state-specific canonical event 由 shared catalog 生成。**
   - 地址固定为 `gamelayout:/ui-control/<id>/radio/state/off/entered` 与
     `gamelayout:/ui-control/<id>/radio/state/on/entered`，family 为 `ui-control-state`，facets 为
     `control/control-kind/state/edge`。
   - occurrence detail 固定携带 `controlId`、`previousState`、`state`、`source: "pointer" | "programmatic"`；descriptor/address
     不写回 manifest。初始化不发 entered，避免打开 package 自动触发控件音效。
   - base runtime 只通过窄 observer 报告 committed state edge；package runtime 把它映射到 address controller。editor preview、
     游戏 bind/wait 与 Event audio 因而共用一条派发路径。
6. **控件先消费输入，再允许宿主处理其它主操作。**
   - Sprite 使用 Pixi `eventMode="static"` / `pointertap`；成功 toggle 时停止 federated propagation，并停止对应 native pointer/
     click 冒泡，避免 preview host 或游戏 canvas 的 primary action 同次触发。
   - scoped/program hidden、未初始化、destroyed 控件不命中；拖动不等同 tap。app 不增加 hit-test、坐标判断或第二个 click handler。

## 5. 职责与合同

- **Scene Layout data**：拥有 v7 `graphic resource | uiControl` layer union、可扩展 `SceneLayoutUiControlSpec`、当前
  `radio` schema/state、strict parser、deep-freeze、typed references、latest normalization与allocation parity；v1–v6
  source parser不接受`uiControl`。
- **RenderCore core**：拥有UI control registry、两texture prepare、稳定Sprite/hit area、state mutation、pointer consumption、
  typed borrowed control capability、observer、event catalog/dispatch与destroy；不创建canvas/ticker/RAF。
- **Editor wrapper / Game Layout Editor**：拥有两个 image root 的显式选择、draft transaction、Inspector、preview host、
  mapped ZIP import/export 与用户错误呈现；preview 委托同一个 production runtime。
- **EditorCore**：继续只消费 shared catalog，给新 family/facet 提供展示和检索；不编译、解析或派发 event。
- **数据/API**：图层分类为`graphic | ui-control`，当前control kind只有`radio`，其state为`off | on`；状态不保存回
  manifest/ZIP，不因preview点击修改authoring draft。
- **资源生命周期**：两 texture 必须全部 prepare 后一次 commit；失败逆序释放已取得资源。runtime 拥有 pointer listener 与
  Sprite，SceneLayoutResource/texture loader 继续拥有 URL/cache 引用；重复 destroy 幂等，late prepare 不得提交。
- **失败策略**：unknown kind/state/node/address、同 path、尺寸不等、缺 bytes/URL/texture、坏 placement、重复 event/address、
  destroy 后调用全部显式失败；Editor transaction 失败保持原 project/preview。
- **禁止行为**：文件名配对、placeholder、首项默认、两 node 叠图、raw Pixi exposure、app-local event table、silent alias、
  same-state 假 event、点击同时触发 primary action、v6 compatibility 偷渡或 manifest 版本升级。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/tests/scene-layout/ui-radio-control-runtime.test.ts
apps/gamelayouteditor/tests/ui-radio-control-layer.test.ts
tasks/283-gamelayouteditor-ui-radio-control-layer-<utctime>.md
```

若现有 manifest/runtime-address/app-shell 测试更适合承载窄断言，可不新增对应测试文件，但不得把完整功能塞进无关 fixture。

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,manifest,manifest-v7,runtime,resource,package-resource,package-runtime,production-zip}.ts
packages/rendercore/src/scene-layout/{data/index,core/runtime-address,core/runtime-address-catalog}.ts
packages/rendercore/tests/scene-layout/{manifest-v7,runtime-address,package-resource,package-runtime}.test.ts
packages/rendercore/README.md
packages/editorcore/src/assets/ui/game-layout-event-dialog.ts
packages/editorcore/tests/adapters-and-ui.test.ts
packages/editorcore/README.md
apps/gamelayouteditor/src/model/{editor-project,resource-commands,validation}.ts
apps/gamelayouteditor/src/ui/{ui-session,resource-picker,layout-workspace,app-shell}.ts
apps/gamelayouteditor/src/preview/{layout-preview,preview-guides}.ts
apps/gamelayouteditor/src/io/{imported-layout-zip,exported-layout-zip}.ts
apps/gamelayouteditor/tests/{resource-commands,layout-workspace,app-shell,event-audio-dialog,exported-layout-zip}.test.ts
apps/gamelayouteditor/README.md
docs/scene-layout-manifest.md
docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md
```

执行时按实际 symbol 落点删去未改文件；若 typed traversal 位于其它现有 Scene Layout 文件，可做同职责小幅适配并在报告说明。

### 原则上不应修改

```text
packages/{audiocore,gameframeworks,logiccore,uiframeworks,vnicore}/**
packages/rendercore/src/{popup,symbol,image-string,reel}/**
apps/{popupeditor,symbolseditor,imgnumbereditor,gameviewer,gameviewer2}/**
assets/**
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
AGENTS.md
/Users/zerro/Downloads/crave/splash/**
```

若执行时发现需要 v8、eventAudio v2、新依赖、radio group、游戏 app API 迁移、修改下载/production assets 或 root 配置，
属于明显范围扩张，必须先停止说明，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认基线并固定 layer/category/schema/API/event 用例**
   - 重核HEAD/status、v7 parser tunnel、layer union traversal、runtime address/event compiler、Editor双槽入口与两张素材。
   - 先写失败测试固定v7 UI-control形状、v1–v6 reject、off初值、typed endpoint、两个exact event address和同点击不触发
     primary action；不读取外部素材作为 shared 自动测试 fixture。
2. **扩展 v7 layer union、UI control data 与 typed closure**
   - 抽出图层公共字段，建立`resource | uiControl`互斥分支及可扩展control union；增加`radio`和`off|on`。调整v7 node
     validation复用共享field helper但不经v6 allowlist偷渡，保持旧version strict表。
   - 更新 asset path/reference、allocation parity、package/delivery/optimizer rewrite，把两 path 作为同一 UI control layer 的正向 exact closure；
     缺一侧、同 path、尺寸不等或 unknown field 失败。
3. **实现 RenderCore UI control registry 与 public capability**
   - resource prepare 两张 URL/texture并验证 logical size；runtime 创建一个 centered stable Sprite、显式 hit area、off 初值和
     owner-managed pointertap。
   - 增加typed `getUiControl()`/radio get-set；复用图层公共visibility/placement，保持与RenderObject registry/API互斥；
     geometry update不重建或重置control。
   - 覆盖 init partial failure、same state、hidden click、pointer/program source、texture identity、destroy listener/late completion。
4. **接入独立 UI control runtime address 与唯一 event manager**
   - 图形继续使用`gamelayout:/node/<id>`；每个UI控件发布`gamelayout:/ui-control/<id>` typed endpoint，catalog为每个
     radio编译两个`ui-control-state` entries并在完整catalog执行duplicate check。
   - base runtime commit observer接入 package address controller；bind/wait/Event audio 都只收到 committed edge，无 listener 时不
     生成 detail。验证初始化/no-op/failure/destroy零事件、每次真实改变恰好一次。
5. **实现 Editor layer category 与 radio 双 image authoring transaction**
   - draft/outline/添加流程明确`graphic | ui-control`，control selector当前只列`radio`；扩展clone/validation/reference graph
     与command，Picker为add-radio同时维护off/on exact image selection，Inspector
     分别重绑，全部 candidate 完整校验后一次 commit。
   - 复用图层id/order/scope/placement与selection guide；outline和Inspector明确显示`UI控件 · 单选框`，资源覆盖/删除/引用计数
     能定位off/on role，不自动交换或配对。
   - manifest export写`uiControl.radio`，import还原两个root binding；mapped ZIP、content addressing、重导和preview closure含两图。
6. **接入 production preview 与 Event dialog**
   - preview继续只构建一个 package runtime；证明 canvas 点击可切换图像，state不写回 draft，native event被控件消费后不执行
     Splash primary action或其它 host click。
   - EditorCore增加 family/facet中文 label和DOM用例；Game Layout event inspector/dialog从 shared catalog显示/搜索 off/on entered，
     Event audio binding导出与重导保持 exact address。
7. **文档、规则与收尾**
   - 更新三份README/manifest文档，说明v7 additive layer branch、fixed off initial、API/address/event、双图与点击传播边界。
   - 在三份领域规则写入最小稳定 ownership/authoring/event 合同；不把素材 hash/大小或任务执行证据写进长期规则。
   - 完成 L2 定向验收、真实两图浏览器验收并生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- RenderCore fixture 使用包内自包含的两个最小 raster/texture stub，不读取 Crave/Downloads/production assets；真实素材仅人工验收。
- parser覆盖旧v7图形parity、新v7 control round-trip、unknown field/kind、同path、尺寸不等、v1–v6 reject与allocation parity。
- runtime覆盖双资源 all-or-nothing prepare、off初值、pointer/program mutation、same-state no-op、visibility/scope/variant/geometry保留、
  endpoint identity、bind/wait detail、无订阅惰性、event顺序、destroy和重复destroy。
- Editor覆盖双槽 picker原子性、image-only、创建/重绑/删除引用、project clone、manifest/ZIP round-trip、preview点击、guide、
  host click隔离、event catalog/dialog/audio binding和错误后draft/preview不变。
- 不以只检查 JSON snapshot 代替真实 production runtime interaction，也不为测试方便暴露 Sprite/Texture。

### 验收级别

`L2`：新增Scene Layout v7 public layer/UI-control union、RenderCore typed control capability与event catalog，并修改直接consumer
EditorCore/Game Layout Editor。影响可由这三个 package 与其定向 Scene Layout/UI 测试界定；不修改根工具链、lockfile、
production assets或游戏业务。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-v7.test.ts tests/scene-layout/ui-radio-control-runtime.test.ts tests/scene-layout/runtime-address.test.ts tests/scene-layout/package-resource.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/editorcore typecheck && pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor exec vitest run tests/ui-radio-control-layer.test.ts tests/event-audio-dialog.test.ts tests/exported-layout-zip.test.ts tests/app-shell.test.ts
pnpm --filter @slotclientengine/rendercore build && pnpm --filter @slotclientengine/editorcore build && pnpm --filter gamelayouteditor build && git diff --check
```

若新增测试最终并入现有文件，命令同步删去不存在的专用文件；若实际修改的测试文件名不同，只允许替换为直接相关文件，
不升级为根级 typecheck/test/build/format。

### 人工验收

1. 启动Game Layout Editor，导入Downloads中两张PNG；在“添加图层”选择`UI控件`→`单选框 (radio)`，建立
   `splash-flag` control，off/on分别显式绑定对应root，
   scope 到 Splash 的 landscape/portrait并配置 placement；确认预览初始显示 off，点击后在两图间切换，outline/Inspector/guide
   仍按一个UI control layer工作，且outline/Inspector不把它显示成普通图片。
2. 给 Splash 配置 primary action；直接点击控件只切换状态，不切换 mode。点击控件外的 primary 区域仍按原合同进入目标 mode；
   返回/resize/切方向/隐藏再显示时控件状态保持，完整重建后回到 off。
3. 在全局 Event 音乐音效 dialog 搜索新 family/node，分别选择 on/off entered 并绑定现有 audio；预览解锁声音后确认每次
   真正进入对应状态只触发一次，same-state program set不触发。
4. 导出mapped ZIP、重新导入，确认v7不变、两logical image key/size、control id/order/scope/placements和event audio exact address
   无损；缺任一图或篡改尺寸的 candidate显式失败且原项目不变。

### 独立验收建议

`必须`。本任务改变跨包 public schema union、runtime state/event、pointer ownership与双资源 transaction。独立验收重点为：

- old v7 parity 与 v1–v6 strict reject，新 manifest仍写 `version: 7`；
- pointer toggle、program set、event occurrence一一对应且不穿透 primary action；
- 双 texture partial failure/destroy无半提交或listener/资源泄漏。

最多复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-v7.test.ts tests/scene-layout/ui-radio-control-runtime.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/ui-radio-control-layer.test.ts tests/event-audio-dialog.test.ts tests/app-shell.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 复用现有 Pixi `Sprite`/federated event、Editor filename-key workspace、RenderCore runtime address/event manager和Vitest；
  不新增依赖、不升级包、不修改 lockfile。
- 自动测试不需要网络或复制外部图片；浏览器人工验收读取用户现有 Downloads 文件，但不得修改它们。

## 10. 生成物、文档与规则

- 本任务不修改 YAML 或生成 TypeScript；manifest/ZIP 由现有 typed serializer/exporter生成，禁止手改任何生成物。
- build只验证三个package的正式exports/dist，不提交`dist`或缓存。
- `docs/scene-layout-manifest.md`、RenderCore README与Game Layout Editor README记录layer分类、可扩展`uiControl` union、
  `radio` schema、runtime capability、
  state/event/input语义；EditorCore README只补新 family展示由 shared catalog驱动。
- `docs/agent-rules/scene-layout.md` 固定 node/control/runtime event owner；`editor-artifacts.md` 固定双 image authoring/closure与
  dialog只消费catalog；`shared-game-runtime.md`固定opaque capability、state commit/event和pointer ownership。
- 不修改根 `AGENTS.md`；素材精确文件名、hash、大小与执行结果只留在本计划/报告，不进入长期规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/283-gamelayouteditor-ui-radio-control-layer-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 schema/API/address、实际修改文件、两图人工结果、自动验收、
计划偏差和剩余风险；不收集无关 coverage、全仓统计、完整历史或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- v7 parser当前借v6 validation document校验node；必须为`uiControl`建立版本显式allowlist并测试version matrix，不能通过扩展
  v6 resource parser偷渡。
- 两 texture若分步挂载或失败时未释放，可能出现只显示一态的半提交与cache引用泄漏；prepare/commit/rollback必须作为一组。
- Pixi `pointertap`只停止 federated bubbling而未停止 native canvas click时，Splash primary action会同次触发；需真实 DOM/Pixi
  集成测试和浏览器人工验证。
- Event audio只有exact address、没有detail predicate；必须发布state-specific地址；双image reference还必须覆盖manifest、
  optimizer、mapped ZIP和reimport，否则preview可工作但交付会缺图。
- 旧版本已发布的 v7 consumer不会识别新 union；用户明确要求不提升manifest版本，本任务只保证更新后的仓库parser与consumer。

### 假设

- 图层先分为`graphic | ui-control`；control union为后续kind保留扩展点，本任务的`radio`是单个二态图片控件，
  不是互斥控件组，state精确为`off | on`。
- 控件默认off且不配置持久初值；两态图片尺寸相同，用户提供素材均为145×50；游戏可在runtime ready后按名显式set。
- UI control复用图层id；该id已满足当前Layout内唯一、canonical kebab-case约束，因此足以派生全局唯一runtime/event地址。

### 待确认

无。若执行时用户实际需要互斥radio group、可配置默认on、disabled/hover图或键盘可访问性，应作为后续独立合同，不能在本任务
中通过隐式字段或fallback加入。

## 13. 完成清单

- [ ] v7 additive `resource | uiControl` layer union、可扩展control分类、`radio` schema、旧版本边界和无版本升级合同成立。
- [ ] 双 image Editor transaction、引用图、scope/placement、ZIP round-trip与真实素材完成。
- [ ] 稳定 Sprite、off初值、get/set、pointer消费、visibility/geometry保留与destroy完成。
- [ ] `getUiControl`/owner-first UI-control lookup、state-specific globally unique event、catalog/dialog/Event audio完成。
- [ ] 指定L2自动验收、浏览器人工/独立验收完成，README、manifest文档与最小领域规则已同步。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划和三份已列领域规则，重核HEAD/status及v7 parser当前实现；
2. 先固定version matrix、schema/API/event/pointer失败用例，再改production code；
3. 按“v7 data/closure → core texture/state/capability → address/event → Editor双槽transaction → dialog/preview”实施；
4. 复用一个UI control layer、一个Sprite、一个runtime event manager和现有Resource Picker/production preview，不复制状态机/资源表/catalog；
5. 小幅文件粒度适配在报告说明；需要v8、eventAudio v2、新依赖、游戏app迁移或production asset修改时先停止说明；
6. 只运行计划规定的L2验收，区分自包含自动测试与Downloads真实素材人工验收；
7. 完成后生成UTC中文执行报告；除非用户明确要求，不commit、不push、不创建PR。
