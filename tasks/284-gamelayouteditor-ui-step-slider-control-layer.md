# 284 gamelayouteditor-ui-step-slider-control-layer 任务计划

## 1. 目标与完成定义

### 目标

在任务 283 已建立的 Scene Layout v7 `uiControl` 可扩展图层 union 上，新增多档选择框 `step-slider`。控件由一张
轨道背景图与一张可拖动滑块图组成，作者可配置档位数和吸附时长；本任务使用 3 档时，档位精确位于最左、中间、最右。
用户可点击轨道或拖动滑块，在松开后由 RenderCore 按最近档位完成吸附并提交状态。游戏可按图层唯一名称取得 typed
capability、读取或改变档位，并监听可由全局 Event 音乐音效 dialog 配置的唯一状态事件。

### 完成定义

- [ ] Game Layout Editor 可新增明确标为 `UI 控件 / 多档选择框` 的 `step-slider` 图层，并从已提交 Assets 分别选择
      `track` 背景图与 `thumb` 滑块图；不得按文件名自动绑定或拆成两个普通图形图层。
- [ ] Editor 可配置整数 `steps >= 2` 和正有限 `snapDurationSeconds`；新建控件默认 3 档，3 档位置精确为左、中、右，
      Inspector 可重绑两图并修改档位数和吸附时长。
- [ ] `step-slider` 复用 UI 控件图层公共唯一 id、order、mode/orientation scope、placement、rotation、预览选区、
      typed 资源引用、production closure 与 ZIP 往返；既有 graphic/radio 行为不变。
- [ ] runtime 用一个稳定 control Container 持有 track/thumb；初始已提交档位固定为 `0`。点击轨道选择最近档位，拖动时
      thumb 连续跟随并被有效行程夹紧，松开或取消后以 manual runtime clock 吸附到目标/原档位。
- [ ] 只有一次吸附成功到达目标后才原子提交新档位并发布 event；拖动过程、初始化、same-state、取消、失败、隐藏和
      destroy 不发布 occurrence。新输入、程序设值和 destroy 不得留下过期动画、listener 或半提交状态。
- [ ] runtime 通过 `getUiControl(exactId)` 或 `gamelayout:/ui-control/<id>` endpoint 返回 discriminated
      `step-slider` borrowed capability，可读取 `steps` / `getState()` 并 `await setState(index)`；不公开 Pixi 对象。
- [ ] 每个合法档位生成全局唯一 exact event
      `gamelayout:/ui-control/<id>/step-slider/state/<zero-based-index>/entered`，detail 含 previous/current/source；
      Event dialog 可搜索、逐级选择、保存并复验每个档位。
- [ ] Scene Layout latest 保持 v7，`eventAudio.version` 保持 1；合法旧 v1–v7、已有 radio package 和 runtime API 不需迁移。
- [ ] parser、资源生命周期、拖动/点击/吸附、runtime capability/event、Editor authoring、optimizer/ZIP、真实两图浏览器流程
      完成自动与人工验收，并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- Scene Layout v7 `SceneLayoutUiControlSpec` 新增 `step-slider` 分支，及 strict parser、deep-freeze、asset closure、
  runtime allocation、mapped package、delivery/optimizer typed traversal。
- RenderCore track/thumb prepare、稳定 display owner、水平档位几何、pointer gesture、manual-clock 吸附、typed capability、
  package runtime event bridge、owner endpoint 与 shared event catalog。
- Game Layout Editor draft/command、双 image picker、steps/吸附时长 Inspector、引用与替换保护、preview、导入导出、
  validation、Event dialog 接入。
- EditorCore 对 step-slider control/state facet 的展示与 dialog 测试；GameFrameworks public facade；Game Layout package CLI
  的结构化引用改写与资源分组。
- 使用 `/Users/zerro/Downloads/crave/splash/splash_fastplay_bar.png`（336×50）与
  `/Users/zerro/Downloads/crave/splash/splash_fastplay_tag.png`（46×46）做 3 档真实浏览器人工验收。

### 不包含

- 不实现纵向、连续数值、非等距档位、用户自定义档位名称/值、刻度文字、disabled/hover/pressed 图片或键盘/手柄输入。
- 不保存当前运行档位，不增加可配置 initial state；完整 runtime 重建仍固定从档位 `0` 开始。
- 不让拖动中的连续 thumb 坐标成为 public state/event，不增加 changed/progress/raw-pointer event 或 event detail predicate。
- 不把吸附交给 GSAP、RAF、wall clock、DOM range input 或 app-owned pointer handler；Editor preview 继续使用 production runtime。
- 不修改 radio 的 off/on、同尺寸、同步 `setState()` 或事件语义，不把 radio 静默转换成 step-slider。
- 不修改 Symbols、Popup、AudioCore schema/runtime、游戏业务流程、production assets、YAML、根工具链、依赖或 lockfile。
- 不复制或修改下载目录图片；它们只作为用户提供的人工验收输入。

## 3. 制定计划时的基线

```text
UTC: 2026-09-02T08:25:27Z
HEAD: 08a290cdfab93033be2035219baeab9fde54e13c
branch: main
git status --short --untracked-files=all: clean
```

已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、任务 283 计划/执行报告，以及
`docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md`。`apps/gamelayouteditor`、
`packages/{rendercore,editorcore,editorresource}` 下没有补充 `AGENTS.md`。

当前结论：

- `packages/rendercore/src/scene-layout/types.ts` 已有 v7 `resource | uiControl` 图层 union，但
  `SceneLayoutUiControlSpec`、`SceneLayoutUiControl`、state event 都只含 `radio`。
- `manifest-v7.ts#parseUiControlNode()`、`manifest.ts#collectSceneLayoutAssetPaths()`、`resource.ts`、
  `package-resource.ts` 当前直接枚举 radio `off/on`；新增 kind 必须先按 discriminator 分支，再由同一 typed traversal 提供
  exact 两图 closure，不能把 track/thumb 塞进普通 node 或通用 JSON 递归。
- `runtime.ts#initNode()` 当前为 radio 创建单 Sprite，并在 `pointertap` 同步切换；`RuntimeNode` 的 texture/state 字段也是
  radio-specific。`SceneLayoutRuntime.update(deltaSeconds)` 已是唯一宿主时钟，可承载吸附而无需新 ticker。
- `core/runtime-address.ts` 的 `ui-control` owner endpoint 已按 `node.uiControl.kind` 描述并可直接复用；
  `core/runtime-address-catalog.ts` 与 `package-runtime.ts#observeUiControlState()` 当前把 state/kind 固定为 radio。
- `apps/gamelayouteditor/src/model/editor-project.ts` 的 UI-control draft、manifest 转换与导入只支持 radio；
  `resource-commands.ts`、`ui-session.ts`、Resource Picker、Inspector、替换 preflight 和 ZIP rewrite 也直接引用 off/on。
- Game Layout Editor preview 已复用 production package runtime，并用 runtime node bounds 画选区；step-slider 不应另建 preview
  state machine，但选区/rotation pivot 必须使用 track 与 thumb 的确定性组合 bounds。
- shared catalog 已有 `ui-control-state` family 和 control/control-kind/state/edge facets；新增 kind 不需要新 family 或 dialog
  public API，只需 catalog 枚举档位并补充友好显示/真实 host 测试。
- 两张素材均为 8-bit RGBA non-interlaced PNG：bar 为 336×50、SHA-256
  `d382939a9ba1150b9877a8b219a6f52b279318cfed7167d74d41205cfe9e4e01`；tag 为 46×46、SHA-256
  `1f50c7ce4ca9484b4e6715be159020f3d771828c71c562e5828f14e58260d5c0`。

## 4. 需求解释与技术决策

### 需求解释

1. “多档位的选框控件”按水平离散滑块实现，canonical kind 为 `step-slider`，Editor 中文名为“多档选择框”。它是任务
   283 `ui-control` 分类的第二个 discriminator，不是新的顶层 layer category。
2. “配置 3”表示 `steps: 3`，内部/API/event 使用 `0 | 1 | 2`；Editor 显示“档位 1/2/3”。0-based 值可直接用于等距
   几何和 TypeScript API，避免另存一份未要求的业务状态名。
3. “点击或拖动来切换状态”表示点击 track/thumb 后按 release 位置选最近档位；拖动期间只更新 presentation candidate，
   release 后吸附。pointer cancel、控件隐藏或手势失效回吸到当前 committed state，不改变业务状态。
4. “松开变状态”以吸附完成为 commit 边界：`getState()` 在吸附完成前仍返回旧档位；完成时画面、state 和 exact event
   一次提交。程序设值因此返回 Promise，resolve 代表新档位已到位；radio 的既有同步 API 不变。
5. “通过名字取到”继续使用图层公共唯一 id，不新增 display name/alias。完整 canonical event address 因包含 control id、kind
   和档位，在一个 package runtime catalog 中全局唯一。
6. “不修改 manifest 版本号”作为明确合同：latest 仍为 v7，只给 v7 `uiControl` union 增加一个 strict branch；v1–v6 不接受
   `uiControl`，旧 v7 radio/graphic 形状原样有效，eventAudio 仍为 v1。

### 关键决策

1. **使用显式 `step-slider` schema，而不是从图片尺寸或文件名推断。**
   - manifest 形状为
     `{ kind: "step-slider", track: ImageSpec, thumb: ImageSpec, steps, snapDurationSeconds }`；字段均 required。
   - track/thumb 必须是不同 local filename key；声明和实际图片尺寸均为正且一致；`track.width > thumb.width`，形成正水平行程。
     thumb 可高于 track；控件 authored bounds 固定为 `track.width × max(track.height, thumb.height)`。
   - `steps` 必须是 `>= 2` 的 safe integer；`snapDurationSeconds` 必须正、有限。准确时长只保存在 manifest；runtime 使用固定
     ease-out cubic 算法，不维护第二份业务时序表。
2. **档位位置由一条唯一纯函数计算。**
   - 可用行程为 `track.width - thumb.width`，索引 `i` 的 x 为
     `-travel/2 + travel*i/(steps-1)`；因此 3 档必为左、中、右，thumb 不越出 track 横向 bounds。
   - 点击/拖动坐标先转为 control-local x、夹紧到行程，再用最近距离和确定性 tie-break 选择 index。parser/runtime/test 共用
     typed contract，Editor 不复制另一套档位坐标算法。
3. **gesture、snap 与 committed state 分层。**
   - Runtime 内部使用 stable Container + track Sprite + thumb Sprite；track/thumb 都在 init candidate 完整 prepare、尺寸复验后
     一次 attach。任一失败释放已取得 texture，不提交半个控件。
   - 单 active pointer 驱动 down/move/up/upoutside/cancel；move 只改 thumb candidate x。release 启动由
     `runtime.update(deltaSeconds)` 推进的吸附；到 exact target 后才改变 state、resolve program request 并派发 event。
   - 新 pointer/programmatic request 可 supersede 未完成吸附；旧外部 Promise 明确 reject。cancel/隐藏回到原 state，不发事件；
     destroy 移除全部 listener、拒绝 pending Promise、释放 texture owner 引用。same-state 只允许视觉归位，不发事件。
4. **新增 kind-specific borrowed capability，保留现有 owner endpoint。**
   - `SceneLayoutUiControl` 扩展为 `radio | step-slider` union；新 `SceneLayoutStepSliderControl` 暴露
     `kind: "step-slider"`、readonly `steps`、`getState(): number`、`setState(index): Promise<void>`。
   - state setter strict 拒绝非 safe integer、负数和越界值；capability 不暴露 position、drag progress、Container/Sprite/Texture，
     placement/visibility/destroy 继续由 Scene Layout owner 管理。
   - `getUiControl(id)` 与 `gamelayout:/ui-control/<id>` 返回同一稳定 capability；`getRenderObject(id)` 对它仍为 null。
5. **复用 `ui-control-state` family，按每档生成 exact event。**
   - catalog 为每个 index 生成
     `gamelayout:/ui-control/<id>/step-slider/state/<index>/entered`；facets 仍为
     control/control-kind/state/edge，numeric index 在 facet/address 中使用无前导零 decimal string。
   - occurrence detail 中 `previousState/state` 为 number，`source` 继续为 `pointer | programmatic`。只有吸附成功 commit 后由
     package runtime 唯一 manager 同步 emit；superseded/cancel/failure/destroy 不伪造 entered。
   - EditorCore 根据 control-kind 把 numeric state 显示为“档位 N（state i）”，但保存 exact catalog address，不解析地址或维护
     app-local 状态候选表。
6. **Editor draft/资源操作按 control kind 做窄 typed transaction。**
   - UI-control draft union 新增 `{ kind: "step-slider", trackResourceId, thumbResourceId, steps, snapDurationSeconds }`；创建默认
     `steps=3`，但仍要求用户明确选择两张图片并确认。
   - 引用 role 新增 `ui-control-track/thumb`；创建、分别重绑、image replacement preflight、删除、导入、导出、preview、CLI
     rewrite/group 都用同一 kind switch。未知 kind/role 显式失败，不用首项或 radio fallback。
   - 修改 steps 前从候选 manifest 编译 shared catalog 并复验既有 Event audio address；若缩档会移除仍被绑定的 exact event，
     整次修改失败且原 draft 不变，不在 app 中手写/解析地址。

## 5. 职责与合同

- **Scene Layout data**：拥有 v7 `step-slider` schema、safe integer/duration/image strict validation、档位纯几何、typed references、
  allocation parity 与 latest deep-freeze；旧 version/parser 不接受新字段。
- **RenderCore core**：拥有两 texture prepare、stable display owner、gesture、manual-clock snap、state commit、typed capability、
  observer、event catalog/dispatch 和 destroy；不创建 Application/canvas/ticker/RAF。
- **Editor wrapper / Game Layout Editor**：拥有两 image root、steps/duration authoring transaction、Inspector、production preview、
  mapped ZIP 和用户错误呈现；不复制 snap/事件状态机。
- **EditorCore**：只消费 catalog 并展示 step-slider facets；不编译候选、解析地址或派发 event。
- **GameFrameworks**：只 re-export production capability/state types；游戏不直接依赖 RenderCore 内部 Pixi 实现。
- **数据/API**：public committed state 是 `[0, steps)` safe integer；drag position 和 target 是 runtime-private。state 不写回
  manifest/ZIP，完整 runtime rebuild 固定恢复 0。
- **资源生命周期**：track/thumb 全部 prepare 后一次 commit；失败等待已启动 prepare 收敛并释放 owner 引用。gesture/snap/listener/
  pending Promise 在 supersede、visibility loss、geometry replacement、failure 和 destroy 上必须确定性收敛。
- **失败策略**：unknown kind/state、无效 steps/duration、同 path、track 无有效行程、缺 bytes/URL/texture、声明/实际尺寸漂移、
  stale pointer、重复 address、destroy 后调用均显式失败；Editor 失败保持原 project/preview。
- **禁止行为**：文件名/alpha bounds 猜测、placeholder、首项默认、两普通图层叠加、DOM input、wall-clock animation、raw Pixi
  exposure、app-local event table、silent clamp API state、same-state 假 event、radio fallback 或 manifest version bump。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/tests/scene-layout/ui-step-slider-control-runtime.test.ts
apps/gamelayouteditor/tests/ui-step-slider-control-layer.test.ts
tasks/284-gamelayouteditor-ui-step-slider-control-layer-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,manifest,manifest-v7,resource,package-resource,runtime,package-runtime,presentation-surface}.ts
packages/rendercore/src/scene-layout/{data/index,core/runtime-address-catalog}.ts
packages/rendercore/tests/scene-layout/{runtime-address,package-resource-json,ui-radio-control-runtime}.test.ts
packages/rendercore/README.md
packages/editorcore/src/assets/ui/game-layout-event-dialog.ts
packages/editorcore/tests/adapters-and-ui.test.ts
packages/editorcore/README.md
packages/gameframeworks/src/index.ts
packages/gameframeworks/README.md
apps/gamelayouteditor/src/model/{editor-project,editor-resource,resource-commands}.ts
apps/gamelayouteditor/src/ui/{ui-session,resource-picker,layout-workspace,app-shell}.ts
apps/gamelayouteditor/src/io/{imported-layout-zip,exported-layout-zip}.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/{event-audio-dialog,zip-io,ui-radio-control-layer}.test.ts
apps/gamelayouteditor/README.md
apps/gamelayoutpkgcli/src/{reference-rewriter,asset-groups}.ts
apps/gamelayoutpkgcli/tests/{reference-rewriter,asset-groups}.test.ts
apps/gamelayoutpkgcli/README.md
docs/{scene-layout-manifest,gamelayout-runtime-addresses}.md
docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md
```

执行时按实际 symbol 落点删除未改文件；若新纯档位几何/gesture helper 使 `runtime.ts` 继续膨胀，可在
`packages/rendercore/src/scene-layout/` 新增单职责文件并在报告说明，不得复制 runtime owner。

### 原则上不应修改

```text
packages/{audiocore,logiccore,uiframeworks,vnicore}/**
packages/rendercore/src/{popup,symbol,image-string,reel}/**
apps/{popupeditor,symbolseditor,imgnumbereditor,gameviewer,gameviewer2}/**
assets/**
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
AGENTS.md
/Users/zerro/Downloads/crave/splash/**
```

若执行时发现需要 Scene Layout v8、Event audio v2、新依赖、连续/纵向 slider、业务命名档位、生产 Crave asset/config、
app-owned输入或根配置，属于明显范围扩张，必须先停止说明，不能修改计划来事后合理化。

## 7. 实施步骤

1. **重核基线并先固定失败用例**
   - 核对 HEAD/status、任务 283 当前合同、两图实况及所有 direct off/on traversal。
   - 先写 parser/closure/runtime/editor 测试固定 schema、3 档几何、async commit、event address 与旧 radio parity；自动测试使用
     小型内存 fixture，不读取下载目录。
2. **扩展 v7 UI-control data union 与 typed traversal**
   - 在 types/parser 中加入 step-slider spec、state/capability/event discriminated types和纯档位几何 helper；保持 v1–v6 和旧
     v7 strict 路径不变。
   - 把 manifest path collection、resource/package materialization、allocation、image decode、pivot/bounds 与 immutable geometry
     compatibility 改为 exhaustive control-kind switch；两图缺一、未知字段、坏尺寸/steps/duration显式失败。
3. **实现 RenderCore display、gesture 与 manual snap transaction**
   - 将 RuntimeNode 的 radio-specific字段收敛为内部control union；分别实现radio单Sprite与step-slider双Sprite prepare/commit。
   - 加入local-coordinate hit/drag、单pointer ownership、nearest-step、manual-clock ease-out、supersede/cancel/visibility/destroy
     收敛；消费对应 federated/native 输入，避免同一点击继续触发 Splash primary action。
   - 增加 stable step-slider capability 与 Promise setter；geometry-only placement 变化保持 committed state/display owner，不允许
     偷改 immutable control resources/steps/timing。
4. **接通 endpoint、event catalog 与 public facade**
   - 泛化 UI-control state observer为按 kind 的 discriminated event；catalog按 steps 枚举exact address，package manager只在成功
     commit 后 emit。owner endpoint kind 仍为 `ui-control`，descriptor detail 标明 `step-slider`。
   - 在 Scene Layout data/core、presentation surface 和 GameFrameworks facade 导出必要类型；不扩大为raw display API。
5. **实现 Game Layout Editor authoring transaction**
   - 扩展 draft/manifest conversion、resource roles、双图创建与分别重绑command；add flow 收集track/thumb、默认3档与可编辑
     snap duration，并一次commit。
   - Inspector、大纲和Picker明确区分radio与step-slider；steps/duration/rebind/image replacement失败保持draft和assets不变；
     缩档前借shared catalog复验Event audio引用。
   - preview继续重建/更新production runtime；选择框交互不写回authoring state，选区使用完整control bounds。
6. **同步 ZIP、optimizer、Event dialog 与文档**
   - 更新Editor mapped ZIP和package CLI rewrite/group，保证track/thumb都进入exact closure且WebP改写不漏任一role；完成
     export→import→re-export parity。
   - EditorCore补充step-slider/档位显示，Game Layout真实Event audio dialog选择并保存某档entered地址。
   - 更新相关README、manifest/runtime-address文档和三份最小领域规则；不把素材hash、默认3档等一次性细节写入根规则。
7. **定向验收与报告**
   - 按第8节执行L2命令和真实浏览器3档流程；失败先最小化，不扩成整仓扫描。
   - 检查diff/旧值残留/版本号，生成UTC中文执行报告；除非用户另行要求，不commit、不push、不建PR。

## 8. 测试与验收

### 测试原则

- RenderCore覆盖：v7 parse/deep-freeze、legacy reject、非法两图/steps/duration、exact closure、partial prepare rollback、3档
  位置、click/drag/clamp/tie-break、manual update中间帧/终点、same-state、supersede/cancel/hidden/destroy、输入隔离、
  stable capability、invalid API state、endpoint、catalog和occurrence detail。
- Editor覆盖：add/rebind/edit transaction、typed references、整体image replacement、缩档与既有Event binding冲突、preview
  manifest、双图ZIP round-trip、CLI rewrite/group、radio parity和真实Event dialog保存numeric state地址。
- fake DOM/Pixi单测只证明合同，不冒充真实 pointer capture、视觉吸附、图片透明边距与浏览器合成验收。

### 验收级别

`L2`：修改 RenderCore Scene Layout v7 public schema/runtime capability/event catalog，并由 EditorCore、GameFrameworks、
Game Layout Editor 与 package CLI 直接消费，需要验证完整直接依赖链；不触及根工具链、lockfile或release，不升级L3。

### 执行会话必须运行

以下 7 条超过默认 6 条：第 1 条覆盖五个直接 package 的 compile contract，第 6 条单独证明 public build/export；四组测试的
Vitest配置和fixture分别归属各package，不能可靠合并为一个根命令，第7条是必需diff卫生检查。

```bash
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/editorcore --filter @slotclientengine/gameframeworks --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/ui-step-slider-control-runtime.test.ts tests/scene-layout/ui-radio-control-runtime.test.ts tests/scene-layout/runtime-address.test.ts tests/scene-layout/package-resource-json.test.ts
pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/ui-step-slider-control-layer.test.ts tests/ui-radio-control-layer.test.ts tests/event-audio-dialog.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/asset-groups.test.ts
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/editorcore --filter @slotclientengine/gameframeworks --filter gamelayouteditor --filter gamelayoutpkgcli build
git diff --check
```

若实现新增/修改其它直接测试文件，把它加入同 package 的现有 Vitest 命令，不新增整仓 test。对实际变更 TypeScript 运行定向
ESLint、对实际变更文件运行 Prettier；它们是执行时按 diff 生成的文件列表，不用 root 全仓命令替代。

### 人工验收

1. 在 Game Layout Editor 导入 bar/tag 两图，新建“UI 控件 / 多档选择框”，明确绑定track/thumb，配置3档并放入Splash；
   确认大纲、Inspector、选区、横竖placement和资源引用均正确。
2. 在真实preview分别点击左/中/右、慢拖/快拖/越界拖动并松开；确认thumb跟手、夹紧、吸附平滑、最终只落三点，交互不会
   同时触发Splash primary action。切mode/方向、隐藏、吸附中再次操作后无跳变、僵死或过期event。
3. 用 runtime `getUiControl(id)` 和 owner endpoint验证初始0、`steps===3`、await set 0/1/2、same-state和越界失败；在Event
   音乐音效dialog逐级选择“多档选择框 / 档位2 / entered”并保存，确认每次真实commit只收到一个exact event。
4. 导出ZIP、重新导入并再次preview，确认两图、3档、吸附时长、id/order/scope/placement和Event audio binding保持；下载目录
   原图未被修改。

### 独立验收建议

`建议`。本任务跨 RenderCore public schema/capability/event、异步 gesture/snap 生命周期与多个直接consumer；建议独立复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/ui-step-slider-control-runtime.test.ts tests/scene-layout/ui-radio-control-runtime.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/ui-step-slider-control-layer.test.ts tests/event-audio-dialog.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/asset-groups.test.ts
```

并人工重点检查 pointer cancel/supersede/destroy 不发假事件、radio parity，以及真实3档视觉吸附。

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24。当前 shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 Node 和 pnpm，不强制调版本，不切换 npm/yarn。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改 lockfile；Pixi pointer/runtime clock 和现有测试工具足够实现。

## 10. 生成物、文档与规则

- 本任务不修改 YAML 或手写生成物，无 generator/parity 产物预期。
- 更新 RenderCore、EditorCore、GameFrameworks、Game Layout Editor、package CLI README，以及 Scene Layout manifest/runtime
  address文档，说明step-slider schema、0-based API、manual snap commit和exact event。
- 最小更新 `scene-layout.md`、`editor-artifacts.md`、`shared-game-runtime.md`，只记录稳定职责/失败/事件边界；具体素材、hash、
  3档验收值和执行证据只留在任务计划/报告。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/284-gamelayouteditor-ui-step-slider-control-layer-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、关键决策和偏差、自动命令结果、人工验收状态及剩余风险；
不收集无关coverage、完整历史矩阵或整仓统计。

## 12. 风险、假设与待确认

### 风险

- Pixi federated pointer 的upoutside/cancel与浏览器synthetic click顺序需要真实canvas复验；fake event只能保护状态机，不足以证明
  宿主primary action完全隔离。
- 异步吸附期间的re-entry、programmatic supersede、mode隐藏和destroy容易产生stale completion；必须用identity token和单owner
  manual clock收敛，不能只清理画面不settle Promise。
- 档位数线性增加catalog entries；本任务只要求safe integer下界，不臆造业务上限。执行时若现有package-limit要求统一上限，
  应复用该权威限制并记录，不能在Editor/runtime分别硬编码。
- v7 schema新增kind按用户要求不升版；仍使用旧代码读取含step-slider的新v7包会strict拒绝，这是显式能力边界，不增加fallback。

### 假设

- “多档选择框”是水平、等间距、离散step slider；用户提供的336×50 track与46×46 thumb支持正水平行程。
- 当前档位不持久化；默认3档是Editor新建值，通用manifest仍允许任意`steps >= 2` safe integer。
- 吸附时长需进入manifest以满足时序单一来源；ease-out曲线是RenderCore通用算法，不作为业务可编辑字段。
- public/API/event使用0-based index，Editor同时显示1-based人类标签并保留technical state值，避免配置歧义。

### 待确认

无。上述未明确细节均已选择不扩大业务schema且可自动验收的确定方案；若执行会话需要业务命名档位、纵向/不等距位置或不同
commit时机，应先视为需求变更重新确认。

## 13. 完成清单

- [ ] 目标与非目标满足，Scene Layout/eventAudio版本未改变，旧graphic/radio行为保持。
- [ ] step-slider schema、两图closure、档位几何与Editor transaction完整且strict。
- [ ] click/drag/manual snap、async capability、state commit/event和lifecycle边界符合计划。
- [ ] owner endpoint、shared catalog、Event dialog、GameFrameworks facade与直接consumer同步。
- [ ] ZIP/optimizer、README、manifest/API文档和最小领域规则按需同步。
- [ ] 指定L2自动验收通过，真实浏览器人工验收与自动测试明确区分。
- [ ] 实际修改未超范围，或偏差已在UTC中文执行报告说明。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划和三份列出的领域规则；
2. 核对Git基线、任务283现状和两张下载素材，不假设计划基线仍未变化；
3. 按计划先固定schema/geometry/lifecycle/event测试，再实现唯一data→core→editor链路；
4. 小幅文件落点适配在报告记录，明显schema/API/版本/业务范围扩张先停止说明；
5. 只运行计划规定的L2直接依赖链验收，完成后生成UTC中文执行报告；
6. 除非用户明确要求，不commit、不push、不创建PR，也不修改或复制下载目录素材。
