# 212 rendercore-layer-access-and-layout-coordinate-api 任务计划

## 1. 目标与完成定义

### 目标

把 `packages/rendercore` 第一层取层收敛为一个 canonical `getRenderLayer(ref)`，并补齐一套游戏常用、坐标空间明确的安全 API：

- 整个 reel 上方的稳定层：`getRenderLayer("reel")`；
- Popup 稳定层：`getRenderLayer("popup")`；
- symbol area 的上层：`getRenderLayer("main.top" | "main.win")`；
- 新版 Editor 普通场景 exact node 的子层：`getRenderLayer(actualNodeId)`；旧包歧义 ID 可用 `node:<legacyNodeId>`；
- 盘面能力：`getSymbolArea("main")`；
- 编辑器已放置的 scene node：`getRenderObject(actualNodeId)` 返回按kind区分的稳定 borrowed render-object capability或`null`；
- manifest `runtimeResources` 中的程序资源：`createRenderObject(exactResourceName)` 创建 detached owned `RenderObject`；
- Gamelayout authored 坐标系中的原点、art/当前屏幕可见区域对齐点、exact node 与任意 RenderAnchor 坐标；
- 单个symbol、symbol group按输入顺序的middle symbol、中心点与稳定cell bounding rect；
- 不同 parent/layer 之间的点映射。
- `docs/` 下提供一份可独立交付的完整游戏侧指南，统一讲清 layer、SymbolArea、RenderObject 与坐标转换。

游戏在 manifest 配置 `center` 原点后应继续使用中心坐标，不因 Pixi 内部使用 art 左上角本地坐标而复制偏移算法。
本任务不开放 raw Pixi display tree/world matrix，而是在现有 `RenderPoint + RenderAnchor + RenderObjectLayer` 上形成完整且有文档的合同。

### 完成定义

- [ ] 新游戏只通过一个 `getRenderLayer(ref)` 取得 stable、symbol-area 与 exact-node layer；ref 使用单一 strict grammar，无重载猜测或首项 fallback。
- [ ] `getRenderLayer("reel")` 是 main reel 整体上方的稳定程序层，reel replacement 后 façade identity 保持；无 reel 时显式失败。
- [ ] `getRenderLayer("main.top" | "main.win")` 路由到 area-local owner，保持显示顺序与 spin/presentation cleanup；未知 area/layer 失败。
- [ ] `getRenderLayer(actualNodeId)` 默认取得 exact authored node 的 `child` band，继承其 variant/mode visibility、position、scale 与 rotation；unknown id 失败。
- [ ] canonical ref 为stable、area `<areaId>.bottom|top|win`、裸node child或`<nodeId>.child|before|after`；`node:<legacyId>[:placement]`仅用于旧包消歧。
- [ ] parser 先匹配 exact stable，再匹配 `node:` legacy namespace，再匹配exact area suffix，最后匹配canonical exact node；未知/歧义/非法ref失败。
- [ ] 既有 `getSymbolArea(id).getLayer()`、`getNodeRenderLayer()` 与 raw `getLayer()` 只作增量兼容 seam 保留；文档不再把它们列为新游戏的并列取层入口。
- [ ] 第一层形成四个正交入口：`getSymbolArea()` 取盘面、`getRenderLayer()` 取挂载目标、`getRenderObject()` 取 authored instance、`createRenderObject()` 从 program resource 创建新 instance。
- [ ] `getRenderObject(actualNodeId)` 返回缓存且identity稳定的discriminated capability union；image、Spine、VNI、image-string按各自安全能力暴露，known但不可公开的kind返回`null`，unknown node仍显式失败。
- [ ] authored object的placement、mode visibility与destroy继续由Scene Layout拥有；返回类型不包含不适用的mutation/destroy方法，不靠“完整RenderObject但调用时抛错”表达能力。
- [ ] `createRenderObject(exactResourceName)` 保持任务206合同：exact `runtimeResources` lookup、异步materialize、detached caller-owned、dynamic update归package runtime，unknown/kind mismatch无fallback。
- [ ] get/create对象共享最小Anchor/visibility等capability；get以`kind`缩窄typed playback/state/text能力且borrowed，create继续返回owned完整`RenderObject`，ownership不靠猜测。
- [ ] Gamelayout Editor 新建、复制、重命名与导出只允许不含`.`且不占用stable ref的node id；production rendercore v1 parser继续接受旧id，避免旧包直接运行回归。
- [ ] 旧Layout ZIP导入时先按旧合同strict parse，再原子迁移node identity：`.`转`-`、reserved id转安全node id、确定性解决collision，并结构化重写全部node引用。
- [ ] migration优先保留已canonical且非reserved的原id；待迁移id按稳定排序分配`candidate`、`candidate-2`…，导入review/status明确列出old→new，不覆盖或合并节点。
- [ ] Scene Layout runtime 公开 authored coordinate capability：可取得 coordinate origin、art 与当前逻辑 viewport 的九宫格对齐点，并把 authored point 包装为 Anchor、把任意有效 Anchor 解析为 authored point。
- [ ] `top-left` 与 `center` 都由 runtime 使用当前 snapshot/art size 转换；center 模式下 authored `(0,0)` 精确表示 art 中心，不要求游戏先加半宽/半高。
- [ ] “屏幕”在合同中精确定义为 `applyViewport()` 后当前 logical viewport/`visibleRect`，不是 CSS page、device pixels 或浏览器 window；其 center 等对齐点返回 Gamelayout authored 坐标。
- [ ] exact node 的 Gamelayout 坐标可由 node origin Anchor 解析；单个 symbol 可同时取得 area-local point 与可跨 parent 解析的 Anchor。
- [ ] `SymbolGroup`提供`getMiddleSymbol()`、members/bounds center与`getCellBounds()`；middle按输入positions顺序，仅奇数成员有效，偶数显式失败。
- [ ] `getCellBounds()`只读取area稳定cell footprint，不读取动画帧、贴图、Spine/VNI或raw display bounds；非连续选择返回axis-aligned selection rect。
- [ ] 不同 parent/layer 的 point 使用 `target.resolveAnchor(source.getAnchor(point))` 映射；提供清晰文档与 transform 测试，不再要求游戏接触 world coordinate。
- [ ] viewport、variant、geometry 或 parent transform 更新后新调用使用当前状态；返回 point/rect 是调用时快照，长期跟随继续持有 Anchor。
- [ ] 非有限 point、空/重复 group、stale symbol/anchor、未 apply layout、unknown node/space/alignment 与 destroyed runtime 显式失败。
- [ ] rendercore/gameframeworks public exports、定向测试、README、坐标文档、最小领域规则与 UTC 中文执行报告同步。
- [ ] 新增 canonical 指南，包含API选择表、ref grammar、get/create ownership、生命周期/失败矩阵、所有坐标空间及可复制的单项与端到端示例；不依赖任务对话才能理解。

## 2. 范围

### 包含

- `SceneLayoutRuntime`、`SceneLayoutPackageRuntime`、`SceneLayoutPresentationSurface` 一致的 authored coordinate methods。
- 一个 `SceneLayoutRenderLayerRef` public contract、唯一 parser/router，以及 stable/area/node ref 到既有 layer owner 的委托。
- authored scene node → cached discriminated borrowed capability/registry及visibility override；任务206 owned factory原样纳入统一文档，不复制materializer。
- Gamelayout Editor canonical node-id validation、旧manifest纯migration、引用重写、collision allocation与导入报告。
- `SceneLayoutPoint`、九宫格 `RenderAlignment`、有限 `RenderRect` 等最小共享类型；已有等价类型时复用而不复制。
- Gamelayout origin/art/viewport aligned point、authored point ↔ Anchor、Anchor → authored point。
- exact node origin → authored point，以及任意 RenderObjectLayer source-local → target-local 映射的现有能力审计、文档和测试。
- `SymbolRender.getPosition/getAnchor`文档补全；`SymbolGroup` ordered middle、center point/anchor与stable cell bounds。
- standard reel、legacy grid-cell/CellSpin 的同一 symbol group 几何合同；不得只在一种 reel 上实现。
- 单一 layer getter 的路由/owner回归，GameFrameworks 最小 re-export，README/坐标文档/领域规则同步。
- `getSymbolArea/getRenderLayer/getRenderObject/createRenderObject` 的选择矩阵、ownership与能力测试。
- 一份完整docs指南及README/现有coordinate reference的入口链接；示例使用通用exact id，不硬编码具体游戏业务名。

### 不包含

- 不删除或改签任务 208 保留的 `getLayer/getNode/attachChild/attachRelative` raw host/editor seam，不强制旧 consumer 迁移。
- 不增加第二个正式 getter、任意层级 path DSL、模糊 node/resource 查找或静默 alias；`getRenderLayer(ref)` 只接受上述有限 grammar。
- 不合并 whole-reel stable layer 与 area `top/win`；不公开 symbols 主层、Container、Matrix、world x/y、parent、children 或 zIndex。
- 不修改rendercore v1 parser对旧node id的读取兼容；canonical限制属于Editor新draft/export与unified lookup，旧包仍可运行并用`node:`消歧。
- 不对整个manifest所有identifier全局禁`.`；只限制scene node id，runtime resource、popup、mode等identity保持现有合同。
- 不把 logical viewport 等同 CSS/page/device viewport，不新增 DOM/client-coordinate API。
- 不返回 symbol 当前动画/贴图/Spine/VNI visual bounds；group rect 只来自区域 owner 的稳定 cell footprint，非连续成员返回其 axis-aligned bounding rect。
- 不把authored node detach/remount/clone/destroy，不允许改写manifest placement或把hidden mode强制显示；program visibility只作AND override，临时对象从exact resource创建。
- 不让`getRenderObject(nodeId)`回退到同名runtime resource，也不让`createRenderObject(name)`回退到同名authored node；get/create命名空间和ownership严格分离。
- 不为偶数group猜左中/右中；需要特定成员时继续按exact position/getSymbol取得。
- 不提升Scene Layout manifest版本，不修改coordinateOrigin、resource closure、ZIP payload、YAML、assets或生成器；node-id canonical policy由Editor authoring/import/export承担。
- 不迁移游戏业务代码，不改变 spin、symbol state、presentation、mode transition、popup 或 resource lifecycle。
- 不新增依赖，不修改 lockfile、根工具链、logiccore 或 server 数据合同。

## 3. 制定计划时的基线

```text
UTC: 2026-08-14T08:11:46Z
HEAD: f7383875fad3b3851484a647df6e7c1903039421
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md`；目标目录无补充 `AGENTS.md`。
- 已读取任务 199、200、208 计划/报告、`packages/rendercore/README.md`、`docs/rendercore-coordinate-and-anchor-api.md`，以及 presentation/reel/symbol/scene-layout 的相关源码与测试。
- `RenderObjectLayer` 已统一提供 `add/remove/getAnchor/resolveAnchor/addAt`；area、Scene顶层与 exact node attachment 已共享能力，当前缺口是统一 lookup/router，不是再造 layer 类型。
- `getRenderLayer("reel")` 当前使用跟随 main reel placement 的稳定 sibling root；`PresentableSymbolArea.getLayer()` 当前提供 `bottom | top | win`，显示顺序为 `bottom < symbols < top < win`。
- `getNodeRenderLayer(nodeId, "child")` 已复用 node `named` container；`getNodeAnchor(id)` 已能取得 exact node local origin Anchor，但没有直接解析为 Gamelayout authored point 的 runtime API。
- `RenderObject` 当前是完整position/visibility/play/stop/anchor/destroy合同，不适合作为所有authored kind的返回型；需要additive capability union而非大量runtime throw。
- 任务206已实现`SceneLayoutPackageRuntime.createRenderObject(name)`：从exact `runtimeResources`创建owned detached image/Spine/VNI对象，image-string走typed factory；本任务只统一对象模型和文档，不再造factory。
- manifest `IDENTIFIER` 允许`.`但不允许`:`；因此`node:`可安全承载legacy显式ref。新版Editor若禁止node`.`并保留stable names，普通actual node id即可作为canonical裸ref。
- Editor导入当前先调用rendercore parser，再由`manifestToEditorProject()`复制`nodes[].id`、adaptation backgroundNode、mode backgroundNodes与nodeStates；尚无node-id upgrader/rename map。
- 旧node引用至少存在于adaptation各variant`backgroundNode`、canonical mode`backgroundNodes`和`nodeStates`object keys；migration必须typed重写并在commit前复验。
- manifest 已严格支持 `coordinateOrigin: top-left | center`；内部 node/reel placement 会做 center → art-top-left 转换，游戏却没有同等 public authored coordinate capability。
- `SceneLayoutSnapshot` 已包含 current `artSize/visibleRect/worldOffset/variantId`。logical viewport center 在 art-top-left 中等于 `visibleRect` center，再按 configured origin 转回 authored point。
- `RenderAnchor` 内部已实现 owner→global→target local；跨 parent 映射实际可由 `target.resolveAnchor(source.getAnchor(point))` 完成，但当前文档缺少完整需求矩阵和 node/layout 示例。
- `SymbolRender.getPosition()` 返回 area-local occurrence center，`getAnchor()` 捕获 exact occurrence；stale 后失败。
- `SymbolGroup.symbols` 与 `getAnchor({align:"center"})` 已存在；当前 center 是成员中心算术平均，尚无数值 point、ordered-middle helper或稳定cell rect，文档明确“不建立 SymbolGeometry”。
- 新 rect 必须由 SymbolArea 的 cell layout owner提供，不能从 Pixi bounds反推；standard/grid-cell已有 cell size/gap/position事实可复用。
- `packages/gameframeworks/src/index.ts` 已 re-export Scene Layout/runtime/layer类型；新增 public coordinate/group类型需要按实际 consumer surface最小同步。
- 规划会话只创建本计划；未修改源码/assets/依赖，未运行构建或测试。一次 Markdown Prettier检查因workspace依赖缺失尝试下载并被沙箱网络拒绝，未产生tracked改动。

## 4. 需求解释与技术决策

### 需求解释

- 用户列出的坐标需求共同要求“先声明坐标空间，再取 point/rect 或 Anchor”；结构相同的 `{x,y}` 不能被文档默认为任意空间通用。
- 用户给出的 `reel/popup/main.top/main.win` 是一个runtime lookup namespace；统一的是入口和返回capability，不是底层parent/lifecycle owner。
- “屏幕中心”指 Scene Layout 当前 logical viewport 的中心在 authored space 中的坐标；浏览器CSS坐标转换不属于rendercore scene API。
- “Gamelayout 原点”固定为 authored `(0,0)`；art center 在 center origin 时也是 `(0,0)`，在 top-left origin 时是 `(width/2,height/2)`。
- “node 坐标”默认是 exact node child-local origin 映射到 authored space；需要 node 内其它 local point时通过node layer Anchor映射。
- group “middle”按输入顺序；“center”保留members算术平均与cell-bounds中心两种明确数值语义，二者不再推断成员identity。
- group rect是selected cell footprints的area-local axis-aligned bounding rect，不是visual bounds；非连续选择会包含中间空域。

### 关键决策

1. **一个 getter、一个 strict ref grammar、多个既有 owner。**
   - `getRenderLayer(ref)`接受stable、area suffix、canonical裸node/placement suffix与`node:<legacyId>[:placement]`。
   - stable、legacy namespace、exact area、canonical node依次strict解析；unknown/ambiguous/unavailable失败，whole reel/area/node仍委托已有唯一owner。
   - 新Editor node id禁止`.`和stable保留名，使裸id及`<node>.child|before|after`无歧义；普通裸node默认child。
   - 旧包导入先兼容parse，再以pure rename map执行`.`→`-`和reserved迁移；先保留canonical id，迁移项稳定排序并分配collision suffix，原子改写全部typed引用后复验和报告。

- 旧area/node getter保留源码兼容，但新文档只把`getRenderLayer(ref)`定义为canonical lookup。

2. **用 get/create 区分authored instance与program instance。**
   - 第一层固定为`getSymbolArea()`、`getRenderLayer()`、`getRenderObject(): SceneLayoutRenderObject | null`、`createRenderObject(): Promise<RenderObject>`。
   - `SceneLayoutRenderObject`以`kind: image|spine|vni|image-string`判别，共享`getAnchor/setVisible`；Spine按现有node profile提供typed play或state capability，VNI提供typed playback，image-string提供set/get text，image不伪造play。
   - authored visibility是与mode/variant visibility相AND的program override；不允许setPosition/destroy。known node无安全adapter时返回null，unknown id/未ready/destroy仍失败。
   - `getRenderObject()`缓存façade并复用现有node/player，不创建第二display；geometry/mode commit后identity与Anchor继续有效。
   - `createRenderObject()`继续复用任务206唯一factory与runtimeResources namespace；返回detached owned object，可position/visible/play/stop/mount/destroy。
   - get/create同名不互相fallback；新增authored动作必须扩展对应kind capability，不把全方法塞进base后运行时报unsupported。

3. **Scene Layout 直接公开 authored-space 方法，不把 Pixi local point推给游戏。**
   - 目标合同可按现有命名风格小幅调整，但语义固定：

     ```ts
     type RenderAlignment =
       | "top-left"
       | "top"
       | "top-right"
       | "left"
       | "center"
       | "right"
       | "bottom-left"
       | "bottom"
       | "bottom-right";

     interface SceneLayoutRuntime {
       getLayoutPoint(
         selector:
           | { readonly kind: "origin" }
           | { readonly kind: "art"; readonly align: RenderAlignment }
           | { readonly kind: "viewport"; readonly align: RenderAlignment },
       ): SceneLayoutPoint;
       getLayoutAnchor(point: SceneLayoutPoint): RenderAnchor;
       resolveLayoutAnchor(anchor: RenderAnchor): SceneLayoutPoint;
     }
     ```

   - `getLayoutAnchor()` 内部执行 authored→layout render-layer local；`resolveLayoutAnchor()`先解析到layout local再转回authored。
   - package runtime/surface委托同一lower runtime owner，不缓存offset或复制variant判断。

4. **well-known point只来自current snapshot。**
   - art九宫格按`artSize`；viewport九宫格按`visibleRect`；之后统一从art-top-left转为configured authored origin。
   - `top-left`转换为恒等；`center` forward/inverse精确加减当前`artSize/2`。worldOffset/CSS scale不参与authored值。
   - 未`applyViewport/applyArtSpace`时没有current viewport，所有selector/resolve显式失败。

5. **跨parent映射继续组合现有layer capability。**
   - source local point → `source.getAnchor(point)` → `target.resolveAnchor(anchor)`；返回target-local snapshot。
   - authored point使用`getLayoutAnchor()`作为source；任意symbol/node/object Anchor使用`resolveLayoutAnchor()`取得Gamelayout坐标。
   - 不再增加`mapPoint(from,to)`第二套adapter；文档给出node→layout、symbol→layout、layer→layer示例。

6. **SymbolGroup 增量提供窄几何，不开放display geometry。**
   - 保留`symbols`和既有`getAnchor({align:"center"})`的members-center语义以兼容现有调用。
   - 增加`getMiddleSymbol()`、area-local `getCenter({mode:"members"|"bounds"})`与`getCellBounds()`；只读、调用时快照。
   - group创建时由area owner注入每个成员的稳定cell rect解析器；先完整验证所有exact occurrence，再计算，任一stale则整次失败。
   - middle严格使用`symbols[(length-1)/2]`且偶数失败；cell bounds width/height必须finite且为正，不按空间closest选择成员。

7. **兼容保留不是fallback。**
   - 既有area/node getter、raw host/editor seam、layer identity、PresentationScope ownership与group center Anchor不改签名。
   - unified getter内部可以委托旧owner method，但不能保留另一套ref parser或让旧method反向猜ref。
   - 不批量迁移游戏app；测试fake只在结构类型编译确有需要时补exact method。

## 5. 职责与合同

- **manifest/editor**：拥有coordinateOrigin、variant art/focus/placement；不改变schema。
- **Scene Layout runtime**：拥有唯一layer-ref parser/router、authored node borrowed-object registry、current snapshot和authored coordinate转换；不复制display/player owner。
- **RenderObjectLayer/RenderAnchor**：拥有parent-local point包装、调用时跨transform解析与原子attachment；不公开world数值。
- **Render object capabilities**：get返回kind-discriminated borrowed authored能力或null并复用player；create返回owned完整对象。共同Anchor/visibility语义，不共享position/destroy ownership。
- **SymbolArea**：拥有cell footprint、exact occurrence、area-local layer及spin cleanup；为group提供稳定cell rect事实。
- **SymbolRender/Group**：单体返回area-local center/Anchor；group返回ordered middle、members/bounds center与stable cell bounds，不读取visual bounds。
- **游戏**：按area/layer/authored-object/program-object选择四个入口；只传exact id/ref，缓存数值时承担snapshot过期，长期定位优先持有Anchor。
- **失败/事务**：known但无安全object adapter返回null；unknown/invalid/stale仍失败。所有mutation先preflight，失败不部分修改，direct layer add保持caller-owned。
- **禁止行为**：不复制ref parser/origin/geometry表，不猜裸node或偶数middle，不返回world/visual bounds，不改变Pixi内部原点。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/tests/scene-layout/coordinate-space.test.ts
packages/rendercore/tests/scene-layout/render-layer-ref.test.ts
packages/rendercore/tests/symbol/symbol-group-geometry.test.ts
apps/gamelayouteditor/src/model/node-id.ts
apps/gamelayouteditor/tests/node-id-migration.test.ts
docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md
tasks/212-rendercore-layer-access-and-layout-coordinate-api-<utctime>.md
```

cases职责清晰时可放入现有对应test文件；不得复制production转换/geometry实现。

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,runtime,package-runtime,presentation-surface}.ts
packages/rendercore/src/symbol/{symbol-group,index}.ts
packages/rendercore/src/reel/{symbol-area,render-reel-set,render-grid-cell-reel-set,render-cell-spin}.ts
packages/rendercore/tests/scene-layout/{runtime,package-runtime,presentation-surface,render-object-layer}.test.ts
packages/rendercore/tests/{symbol,reel}/**/*group*.test.ts
packages/rendercore/README.md
packages/gameframeworks/src/index.ts
apps/gamelayouteditor/src/{model/editor-project,io/imported-layout-zip,ui/app-shell}.ts
apps/gamelayouteditor/tests/{validation,editor-store}.test.ts
apps/gamelayouteditor/README.md
docs/rendercore-coordinate-and-anchor-api.md
docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md
```

可在现有`scene-layout/geometry.ts`或presentation types中放唯一pure helper/type；只在barrel未自动覆盖时修改index。实际不需要的文件不为凑范围修改。

### 原则上不应修改

```text
apps/{game002,game002v2,game003,game003v2,gameviewer,gameviewer2,gamelayoutpkgcli}/**
assets/**
packages/{logiccore,uiframeworks,netcore,vnicore}/**
packages/rendercore/src/{popup,viewport}/**
packages/rendercore/src/scene-layout/{manifest,package-resource,production-zip}.ts
docs/agent-rules/{game002,game003,loading-ui}.md
AGENTS.md
package.json
pnpm-lock.yaml
tasks/{199,200,208}-*.md
```

若需提升schema版本、暴露world/display bounds、改变既有getter/group center语义、迁移游戏app或新增依赖，属于重大扩张，先停止说明。

## 7. 实施步骤

1. **确认基线与需求矩阵**
   - 重核HEAD/status、现有stable/area/node layer owner、identifier grammar、snapshot/origin、SymbolGroup与三种cell geometry。
   - 建表确认每项需求的source space、result space、现有入口、缺口与strict failure；搜索直接consumer/fake，保护旧合同。

2. **规范Editor node identity并迁移旧包**
   - 建立canonical validator与pure old→new allocator；新draft/复制/重命名/export禁止`.`和stable保留名。
   - import在legacy-compatible parse后重写nodes、adaptation/mode backgrounds与nodeStates；collision稳定分配suffix，复验后原子commit并向UI列出rename map。

3. **建立统一runtime对象与layer入口**
   - `getRenderLayer(ref)`按stable、legacy node、exact area、canonical node解析并委托唯一owner；old ambiguous package可用`node:`，unavailable不fallback。
   - `getRenderObject(nodeId)`按kind返回缓存capability/null，visibility override与mode commit取AND，typed playback/state/text委托现有owner；owned factory保持并同步出口。

4. **建立Scene Layout authored coordinate capability**
   - 新增唯一point/alignment selector与layout point/Anchor/resolve API；lower runtime是唯一origin/active snapshot owner。
   - 覆盖origin、art/viewport九宫格、top-left/center、maximized/orientation、variant/geometry更新、round-trip与非法输入。

5. **补齐SymbolGroup窄几何**
   - 由三种area owner提供cell rect resolver，group统一preflight并计算ordered middle、members/bounds center与cell bounds。
   - 覆盖单个/奇数有序组/非连续/偶数middle failure/duplicate/stale/hole；standard与grid-cell结果同合同。
   - 保留现有`getAnchor(center)`算术平均与批量state/play原子行为。

6. **验证跨parent与layer路由**
   - 用position/scale/rotation不同的layout/reel/area/node层验证source Anchor→target local映射和layout authored resolve。
   - 通过`reel`、`popup`、`main.top`、`main.win`、canonical node id refs固定不同parent/transform/cleanup owner，禁止alias实现。

7. **文档、规则与收尾**
   - 新建完整canonical指南，至少示例：stable/area/node layer，symbol middle/center/cell bounds，nullable typed get与owned create，origin/viewport center，跨parent与cleanup/error。
   - README与现有坐标reference链接该指南，避免复制冲突合同；指南示例与public types/tests保持一致。
   - 最小更新三份领域规则，运行L2验收并生成UTC中文执行报告；记录rename map策略、实际命名适配和未迁移consumer。

## 8. 测试与验收

### 测试原则

- 每个point/rect断言其空间；不以world值作为public expected。
- logical viewport使用visibleRect验证，不能拿page/window center冒充。
- group bounds来自cell footprint；测试动画scale/visual变化不影响结果，gap与非连续选择正确进入bounding rect。
- odd middle按输入顺序，even middle必须失败；cell bounds测试证明不随visual scale/animation变化。
- migration覆盖dot、reserved、dot-collapse、canonical collision、多个legacy collision及全部typed reference重写；失败保持当前Editor project/workspace不变。
- authored object覆盖四kind缩窄、visibility AND、state/play/text委托、identity复用、known unsupported null与unknown failure；不靠unsupported throw过关。
- viewport/variant/geometry/parent transform后重新调用更新，旧point保持snapshot；Anchor在使用时解析。
- strict failure不修改node position、parent、layer账本、group成员或current snapshot。

### 验收级别

`L2`：修改rendercore跨包public合同、gameframeworks re-export及Gamelayout Editor canonical authoring/import migration；production v1 schema、生成物、依赖和lockfile不变，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/render-layer-ref.test.ts tests/scene-layout/coordinate-space.test.ts tests/scene-layout/render-object-layer.test.ts tests/scene-layout/package-runtime.test.ts tests/symbol/symbol-group-geometry.test.ts tests/reel/render-reel-spin.test.ts tests/reel/render-grid-cell-reel-set.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/node-id-migration.test.ts tests/validation.test.ts tests/editor-store.test.ts
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gamelayouteditor typecheck
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor build
pnpm exec prettier --check packages/rendercore/README.md apps/gamelayouteditor/README.md docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md docs/rendercore-coordinate-and-anchor-api.md docs/agent-rules/shared-game-runtime.md docs/agent-rules/scene-layout.md docs/agent-rules/editor-artifacts.md tasks/212-rendercore-layer-access-and-layout-coordinate-api.md
git diff --check
```

若cases落入现有文件，第一条替换为实际exact tests；不得扩大到rendercore全量coverage或整仓命令。

### 人工验收

不要求浏览器视觉验收：本任务是数值与facade合同，定向transform测试可充分证明。若执行时迁移真实app则已超范围，应另行规划视觉验收。

### 独立验收建议

建议。跨包public contract且ref parsing、center/top-left、members-center/bounds-center易混淆。复验重点为strict ref冲突、logical viewport center、group歧义失败与layer owner无串线；最多复跑：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/render-layer-ref.test.ts tests/scene-layout/coordinate-space.test.ts tests/symbol/symbol-group-geometry.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/node-id-migration.test.ts tests/validation.test.ts
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gamelayouteditor typecheck
```

## 9. 环境与依赖

- 使用Node 24与pnpm；shell无Node时：`source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时才执行`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试。
- 不新增依赖，不修改package/lockfile，不切换npm/yarn。

## 10. 生成物、文档与规则

- 不修改YAML/schema/生成物，无generator/parity命令。
- 新canonical指南须独立回答layer/SymbolArea/RenderObject/坐标转换全部常用路径；RenderCore/Editor README与坐标reference提供入口。
- 将稳定space/layer/geometry边界写入shared/scene-layout规则，将canonical node-id/import migration写入editor-artifacts；不改根规则。
- 精确测试结果与偏差只进入执行报告。

## 11. 执行报告

执行后创建`tasks/212-rendercore-layer-access-and-layout-coordinate-api-<utctime>.md`，UTC用`date -u +%y%m%d-%H%M%S`。
简记最终实现、实际文件、关键偏差、验收结果与剩余风险；不收集无关coverage、整仓统计、历史矩阵或profiler。

## 12. 风险、假设与待确认

### 风险

- 多种point结构相同，consumer可能混用空间；类型名、TSDoc、selector和示例必须明确source/result space。
- logical viewport不是CSS屏幕；命名不清会造成二次误解。
- group cell bounds与visual bounds不同；若文档只写rect，游戏可能误用于动画像素碰撞。
- ordered middle依赖调用方传入positions的业务顺序；文档必须明确不会按空间位置重排，偶数group须显式选择position。
- dot→hyphen可能与canonical id碰撞；allocator必须优先保留canonical identity、稳定分配suffix并完整重写引用，不能依赖Map遍历偶然顺序。
- template literal ref无法静态排除所有坏identifier，runtime parser必须保持strict；新method还可能暴露fake编译缺口，只允许最小补桩。

### 假设

- `getRenderLayer(ref)`为唯一canonical lookup；旧area/node getter仅因兼容保留，`before/after`纳入node ref grammar。
- 新Editor node id禁`.`和stable保留名；旧包自动迁移并显示rename map，生产v1 parser仍向后兼容。
- “屏幕”指当前Scene Layout logical viewport/visibleRect；CSS/device坐标不属于本任务。
- group rect需要稳定cell footprint而非动画/贴图visual bounds；ordered middle仅接受奇数成员，不做空间closest或偶数左右猜测。
- center Anchor的既有members算术平均语义保持，新增bounds center使用不同明确入口。

### 待确认

无；以上歧义已按现有架构的strict、opaque、no-fallback原则固定为可执行合同。

## 13. 完成清单

- [ ] 单一`getRenderLayer(ref)`覆盖stable/area/node且无歧义、alias或owner串线。
- [ ] canonical node-id限制、legacy rename/collision/reference migration与导入报告完成。
- [ ] 完整canonical docs指南、README/reference入口与示例一致性检查完成。
- [ ] origin/art/viewport、node、symbol/group/rect和cross-parent需求均有public API与文档答案。
- [ ] center/top-left、snapshot、Anchor与strict failure合同成立。
- [ ] 旧getter/raw seam、既有members-center语义和生命周期兼容；ordered middle与cell bounds为显式新增能力。
- [ ] public exports、tests、README、规则与L2验收完成。
- [ ] UTC中文执行报告已生成，范围偏差已说明。

## 14. 执行会话交接

1. 读取根`AGENTS.md`、本计划、三份领域规则和当前坐标文档。
2. 核对Git基线、identifier与任务208后的API；先固定唯一ref grammar和需求矩阵，不重新设计world/任意path API。
3. 按计划实现；最终命名可按现有style小幅适配并在报告记录，语义不得弱化。
4. 重大扩张先停止说明，不修改计划事后合理化。
5. 只运行L2验收并生成报告；除非用户明确要求，不commit/push/建PR。
