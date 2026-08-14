# 208 rendercore-non-area-render-layer-api 任务计划

## 1. 目标与完成定义

### 目标

在任务 206 已提供“按 Gamelayout `runtimeResources` exact name 创建 detached `RenderObject`”的基础上，为游戏补齐 area 之外的第一层安全挂载与定位 API：游戏可以把 `RenderObject` 加到 Scene Layout 稳定顶层、某个 exact named node 的 child/before/after attachment layer，或现有 area layer；也可以用一个 layer/node 的当前坐标对齐另一个 layer 中的对象，而不取得 raw Pixi `Container`、world position 或 matrix。

本任务以增量兼容为硬约束。现有游戏已经使用的 area `getLayer().add/remove`、`area.present()`、Scene Layout `getLayer/getNode/attachChild/attachRelative` 与 host presentation container 继续保持当前签名和行为；新调用点使用新增 façade，不强制已有 consumer 迁移。

### 完成定义

- [ ] RenderCore 公开一个通用 opaque `RenderObjectLayer` 第一层合同；现有 `SymbolAreaLayer` 保持原 `add(node, order?)/remove(node)` 可用，并可作为该通用 layer 使用。
- [ ] `SceneLayoutPackageRuntime` 可增量取得 `layout | reel | transition | popup` 的安全 render layer；presentation-only runtime 请求 `reel` 继续显式失败。
- [ ] runtime 可按 exact Scene Layout node id 取得 `child | before | after` render layer；attachment 精确复用现有 named-node 层级、variant transform、mode visibility 和 authored order，不复制 display tree。
- [ ] 任意有效 render layer 可为 layer-local point 创建 opaque `RenderAnchor`，并把任意有效 anchor 解析为该 layer 的本地 `RenderPoint`；不返回 world coordinate。
- [ ] layer 提供增量的原子对齐挂载能力：把 detached `RenderObject` 按另一 layer/node/symbol/object anchor 的调用时坐标挂入目标 layer，并支持目标 layer-local offset 与现有 order 语义。
- [ ] 对齐挂载在 unknown layer/node/placement、invalid order/offset、伪造或 stale anchor、对象已有 parent、runtime/object destroyed 等情况下显式失败；失败不改变对象 position、parent 或 layer 账本。
- [ ] 直接第一层 add/remove/add-at 只建立或解除 attachment，caller 继续拥有对象；第二层 `PresentationScope` 仍负责声明式 detach/destroy、打断和跨 await cleanup，并能消费新增 scene/node layer。
- [ ] 任务 206 的 named image/Spine/VNI/ImgNumber object 均可通过新 layer API 接入；dynamic object 仍只由创建它的 package runtime update/destroy。
- [ ] `docs/crave-render-layer-integration.md` 形成一份可独立交给 Crave 执行者的接入文档，覆盖新旧 API 兼容选择、area/scene/node layer、跨层对齐、ownership、错误处理和 Crave 侧验收；本任务不修改 Crave 仓库。
- [ ] 现有 API 回归、public exports、RenderCore/GameFrameworks 类型出口、长期文档、定向测试和 UTC 中文执行报告完成。
- [ ] 浏览器中的真实 Crave/Gamelayout 视觉验收明确由用户执行；实现会话不启动浏览器、不声称已代验，并在执行报告记录用户侧待验清单。

## 2. 范围

### 包含

- 通用 `RenderObjectLayer`、layer-local anchor/resolve 与原子 aligned add 的 public contract、内部 adapter/registry 和 strict validation。
- 现有 area layer 对通用合同的兼容扩展；不改变 area layer id、显示顺序或 presentation 生命周期。
- Scene Layout package runtime 的顶层安全 render layer 与 exact named-node `child/before/after` render layer façade。
- `SceneLayoutPresentationSurface` 的同类增量安全 façade；既有 borrowed Container host seam 保留。
- `PresentationScope` 对通用 layer 的复用，证明 area scope 可把对象安全挂到 scene/node layer，并按原 ownership 清理。
- task 206 factory object 的 mount/alignment/lifecycle 联合测试，以及一份新的 canonical Crave render-layer 接入文档；任务 206 旧文档只增加入口链接，不复制全文。
- gameframeworks 对新增通用类型的最小 re-export，以及直接 consumer 的编译兼容验证。

### 不包含

- 不修改现有游戏业务调用点来强制采用新 API，不把 Crave/game002v2/game003v2 的玩法时序迁入 RenderCore。
- 不读取、修改、提交或代管仓外 Crave 源码；Crave 具体文件名、class、resource/node name 和业务时序只能由其执行者结合真实仓库确认，文档不得编造。
- 不删除、改名或改变 area `getLayer/add/remove/present`，不删除 Scene Layout `getLayer/getNode/attachChild/attachRelative`、`container` 或 presentation surface host container。
- 不把 raw Container seam 包装成静默 alias；旧 seam 明确保留给既有 host/editor 集成，新 façade 是 additive game-facing capability。
- 不开放 `toGlobal/toLocal`、world x/y、Matrix、bounds、children、parent、zIndex 或 mutable display tree。
- 不增加 `PresentationPlan`、自动业务 layer 选择、Nearwin/Win/Coin/Wild 语义、默认 node/layer、名字猜测或首项 fallback。
- 不修改 Scene Layout manifest/schema、node order、runtimeResources、assets map、Gamelayout ZIP、YAML、资源或生成器。
- 不改变 task 206 object factory 的 kind dispatch、playback、ticker、clone 或 resource ownership。
- 不新增依赖，不修改 lockfile、根工具链、LogicCore、server 数据边界或游戏 operation plan。

## 3. 制定计划时的基线

```text
UTC: 2026-08-14T04:49:55Z
HEAD: 2477905cfcfc5962a054ff9adcb2137720044521
branch: detached HEAD (HEAD 与 main/origin/main 同点)
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/scene-layout.md`；`packages/rendercore` 下没有补充 `AGENTS.md`。
- 已读取任务 205/206 的计划与执行报告、`docs/rendercore-{three-layer-api-architecture,operation-first-layer-api,coordinate-and-anchor-api}.md`、`docs/crave-named-render-object-migration.md`。
- `packages/rendercore/src/presentation/presentation-scope.ts#PresentationMountTarget` 已抽象 `add/remove`，但只登记 target Container，尚无第一层 layer anchor、local resolve 或 aligned add。
- `packages/rendercore/src/reel/reel-area.ts#SymbolAreaLayer` 已由 standard 与 legacy grid-cell 实现 `add/remove`；`area.present()` 的 scope 已支持 anchor+offset mount、move、transfer和ownership cleanup，现有游戏调用必须保持兼容。
- `packages/rendercore/src/presentation/render-anchor.ts#createContainerRenderAnchor/resolveRenderAnchor` 内部已执行 owner→global→target local 的调用时转换；能力当前只能由 RenderCore 内部指定 raw target Container。
- `packages/rendercore/src/scene-layout/runtime.ts` 为每个 authored node 建立稳定 `before/named/after` Container，并以 `attachChild/attachRelative` 接受 raw Container；这是新 node render layer 应复用的唯一层级 owner。
- `SceneLayoutPackageRuntime.getLayer/getNode` 与 `SceneLayoutPresentationSurface.getLayer/getNode` 当前返回 borrowed Container；共享规则允许既有 consumer 使用但禁止 destroy/改写内部层级。本任务不破坏该兼容合同。
- `SceneLayoutPackageRuntime.getNodeAnchor(id)` 已提供 exact node origin anchor；任务 206 已新增 `createRenderObject/createImgNumberRenderObject`，但 factory 文档仍要求借用 area scope 挂载，无法直接表达 scene/node layer 接入。
- 仓内生产 app 没有直接调用 package runtime 的 raw `getLayer/getNode/attach*`；Gamelayout Editor 的 `getNode().getBounds()` 使用低层 `SceneLayoutRuntime` preview seam，不应被本任务改写。
- 本规划会话只创建任务计划；未修改源码/assets、未安装依赖、未运行构建或测试。

## 4. 需求解释与技术决策

### 需求解释

- “加到 area 上面的层”沿用 `area.getLayer("top" | "win")`；本任务不另造 area layer 体系，而是让它与新增通用 layer 共享最小合同。
- “加到某个具体图层”解释为两类 strict target：package 的稳定顶层 id，或 exact authored node 的 `child/before/after` attachment layer；不是任意 Container/path 查询。
- “取某个图层的全局位置”不解释为返回 world point。调用方取得该 layer 某个 local point 的 opaque anchor，再由目标 layer 在挂载或显式 resolve 时完成内部 world bridge。
- “加到另外一个图层下面（子节点）”解释为挂到 exact node 的 `child` layer；需要与 authored node 前后叠放时显式选择 `before/after`，不按当前 child index 或资源名猜测。
- 用户确认已有接口已被游戏使用，因此兼容是完成条件而非可选迁移策略：旧 API 不改签名、不改语义、不要求批量替换；新能力使用不会与旧名字冲突的 additive 方法。
- 这些能力归第一层：layer 是可直接取得的渲染目标，add/remove/aligned add 都是单次原子动作。跨 await ownership、repeat、motion、abort 仍属于第二层 PresentationScope。

### 关键决策

1. **新增通用 layer capability，不替换既有 target。**
   - 目标形态：

     ```ts
     interface RenderObjectLayer extends PresentationMountTarget {
       add(node: RenderObject, order?: number): void;
       remove(node: RenderObject): void;
       getAnchor(point?: RenderPoint): RenderAnchor;
       resolveAnchor(anchor: RenderAnchor): RenderPoint;
       addAt(
         node: RenderObject,
         options: {
           readonly anchor: RenderAnchor;
           readonly offset?: RenderPoint;
           readonly order?: number;
         },
       ): void;
     }
     ```

   - `SymbolAreaLayer extends RenderObjectLayer`，现有 `add/remove` 调用保持源码兼容；`PresentationMountTarget` 继续作为第二层所需的最小结构，不一次性强制所有既有 fake/consumer 实现新能力。
   - 最终命名可按当前 export 风格小幅调整，但只能有一个 canonical layer adapter/registry，不保留两套新正式概念。

2. **Scene Layout 使用新名字增量暴露安全 façade。**
   - 目标入口为 `getRenderLayer(id)` 与 `getNodeRenderLayer(nodeId, placement = "child")`；不改变当前返回 Container 的 `getLayer/getNode`。
   - `placement` 只允许 exact `child | before | after`；unknown node/placement 失败。
   - package runtime 与 presentation surface 公开同一安全能力；presentation-only 对 `reel` 保持现有 strict failure。

3. **Anchor 表达坐标关系，不暴露 global 数值。**
   - `layer.getAnchor(point?)` 默认取 layer local origin；传入 point 必须 finite。
   - `layer.resolveAnchor(anchor)` 返回目标 layer local snapshot，语义与 `ReelArea.resolveAnchor()` 一致；viewport/mode/parent transform 变化后需要重新解析。
   - `addAt()` 在调用时解析 anchor，并在目标 layer local space 加 offset；调用方不分两步缓存 world 坐标。

4. **aligned add 是原子画面 mutation。**
   - 实现先完整验证 runtime/layer/object alive、object detached、order、offset和anchor可解析，再一次提交 position、order、parent和mounted账本。
   - 任一步失败时 object 的 position/parent、layer children与账本保持原值；不先移动后发现重复parent。
   - `order` 只沿用目标 attachment layer 内的既有安全整数排序语义；不修改 manifest-owned node/main reel/Popup 全局 order，也不跨 attachment band 猜 z-order。

5. **直接 layer 与 PresentationScope 保持不同 ownership。**
   - `add/remove/addAt` 不接受 destroy ownership；caller 拥有 owned object，remove 只detach，layer/runtime destroy只按现有合同清理attachment。
   - `PresentationScope.mount/withNode/transfer` 继续声明 `detach | destroy` 并消费 `PresentationMountTarget`；新增 `RenderObjectLayer` 可直接作为 target，因此无需复制第二套 scope。
   - task 206 factory object若仍存活到package runtime destroy，由factory registry兜底销毁；layer本身不重复成为owner。

6. **兼容保留不是 fallback。**
   - 旧 raw接口继续执行原精确行为并保留回归测试；新游戏文档推荐安全render layer，但不把旧调用自动重定向、猜placement或静默改变parent。
   - 不标记立即移除期限，不在本任务批量迁移app；未来是否收敛旧host seam另立任务并以真实consumer为依据。

## 5. 职责与合同

- **RenderObjectLayer**：拥有一个受控 attachment target、local coordinate owner、mounted identity与原子add/remove/addAt；不拥有业务语义、object resource或异步播放。
- **RenderAnchor**：保存延迟坐标解析 capability；不公开 source Container/world point，source stale或destroy时失败。
- **Scene Layout runtime**：拥有顶层与 exact node `before/named/after` 真实 Container、variant/mode transform和销毁；安全 façade 只委托这些唯一 owner。
- **Area layer**：继续拥有 `bottom < symbols < top < win` 结构与spin/presentation cleanup，并增量实现通用 layer 坐标能力；symbols主层仍不公开。
- **PresentationScope**：继续拥有跨await mounted账本、ownership、motion、abort/interruption和cleanup；不复制Scene Layout层级。
- **游戏**：选择 exact target layer/node/placement、anchor、offset、order和业务时序；直接add时负责最终remove/destroy。
- **资源生命周期**：layer不destroy caller-owned object；factory/runtime、caller或scope三者中必须只有一个最终destroy owner。runtime destroy期间pending playback按task 206合同settle/reject。
- **失败策略**：unknown id/placement、非法point/order/offset、伪造/stale anchor、重复mount、borrowed destroy、destroyed runtime/object和presentation-only reel全部显式失败，不fallback。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/presentation/render-object-layer.ts
packages/rendercore/tests/presentation/render-object-layer.test.ts
packages/rendercore/tests/scene-layout/render-object-layer.test.ts
docs/crave-render-layer-integration.md
tasks/208-rendercore-non-area-render-layer-api-<utctime>.md
```

若通用 layer registry 放入现有 `presentation-scope.ts` 更能避免循环依赖，可不新增对应源码文件；最终只能有一个 adapter/validation owner。

### 预计修改

```text
packages/rendercore/src/presentation/{index,presentation-scope,render-anchor}.ts
packages/rendercore/src/reel/{reel-area,render-reel-set,render-grid-cell-reel-set}.ts
packages/rendercore/src/scene-layout/{types,runtime,package-runtime,presentation-surface,index}.ts
packages/rendercore/src/index.ts
packages/rendercore/tests/{presentation,reel,scene-layout}/**
packages/rendercore/README.md
packages/gameframeworks/src/index.ts
docs/rendercore-{three-layer-api-architecture,operation-first-layer-api,coordinate-and-anchor-api}.md
docs/crave-named-render-object-migration.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md
```

`runtime.ts` 只增加对既有 node attachment containers 的内部安全 façade；不得重建节点层级。`packages/gameframeworks` 只做类型 re-export，不新增实现。

### 原则上不应修改

```text
apps/**/src/**
assets/**
packages/{logiccore,uiframeworks,netcore,vnicore}/**
packages/rendercore/src/{popup,symbol-cascade,symbol-win-carousel,slot-operation}/**
packages/rendercore/src/scene-layout/{manifest,package-resource,production-zip}.ts
pnpm-lock.yaml
package.json
AGENTS.md
tasks/{205,206}-*.md
```

已有 app test fake 若因新增 runtime method 的结构类型需要最小补桩，可只改 exact fixture并在报告说明；不得迁移生产调用点。若实现需要删除/改签旧API、修改manifest/order语义或强制consumer迁移，必须停止并先说明，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与兼容矩阵**
   - 重新核对HEAD/status、现有area layer、PresentationMountTarget、Scene Layout node containers、package/presentation surface raw seams与task 206 factory。
   - 先固定旧 `add/remove/present/getLayer/getNode/attachChild/attachRelative` 的类型与行为回归，列出仓内直接consumer/fake；若当前基线已改变接口则先评估是否需要重新规划。

2. **建立通用 RenderObjectLayer 合同**
   - 新增interface、adapter/registry、anchor/local resolve和atomic `addAt()`；复用现有RenderObject/RenderAnchor校验。
   - 覆盖finite point/offset、safe integer order、detached requirement、重复mount、伪造/stale anchor、destroy和失败不mutation。

3. **兼容扩展 area layer**
   - standard与legacy grid-cell的 `SymbolAreaLayer` 增量实现通用能力，原 `add/remove`签名、layer id、order、spin interruption和cleanup不变。
   - 用现有area测试证明旧调用无需修改，并增加area layer↔symbol/node/object anchor对齐测试。

4. **接入 Scene Layout 顶层与 named-node layer**
   - 在既有 `layout/reel/transition/popup` roots 和每个 node 的 `before/named/after` containers 上建立安全 façade并由package runtime/surface增量公开。
   - 覆盖variant/viewport/mode transform后的调用时对齐、inactive node继承visibility、unknown id/placement、presentation-only reel和runtime destroy。
   - 证明task 206 image/Spine/VNI/ImgNumber object可直接add/addAt/remove，且播放update与destroy账本没有双owner。

5. **复用第二层并验证兼容consumer**
   - 让现有PresentationScope接受新增scene/node layer，覆盖callback success/error、spin interruption和runtime destroy下的detach/destroy。
   - 不复制package级presentation state machine；area scope挂scene layer时仍由原area interruption owner清理。
   - 同步gameframeworks类型出口；只在编译确有必要时调整测试fake，不修改game002v2/game003v2/Gamelayout Editor生产调用。

6. **同步文档、规则并收尾**
   - 更新README、三层架构、第一层与坐标文档，明确layer原子能力属于第一层，PresentationScope ownership/motion仍属于第二层。
   - 新建`docs/crave-render-layer-integration.md`作为可独立执行的Crave说明：从task 206 named factory开始，分别给出area layer、scene root、exact node `child/before/after`、layer-local point anchor、`addAt()`跨层对齐、direct remove/destroy、scope ownership和strict failure示例。
   - 文档明确已有Crave调用不需要强制迁移；旧area/Scene Layout接口可以继续使用，新调用点才选择安全render layer。resource/node/animation name一律使用manifest exact name或consumer config占位，不虚构Crave源码位置。
   - `docs/crave-named-render-object-migration.md`只增加新文档入口与职责分界，保留task 206原有示例和历史可执行性，不复制task 208全文。
   - 更新最小稳定领域规则，运行第8节L2定向验收，生成UTC中文执行报告并记录任何兼容fixture调整。

## 8. 测试与验收

### 测试原则

- 先保护旧API：现有area与Scene Layout raw/attach行为测试不能为新façade改写期望。
- 新layer contract使用共同测试覆盖area、Scene root、node child/before/after，证明不是只改类型名。
- 坐标测试至少覆盖source/target具有不同position/scale/rotation、viewport重算后重新解析，以及anchor stale/destroy；只断言目标local结果，不把world coordinate作为public结果。
- `addAt()` strict failure必须断言position、parent、children、mounted registry均未变化。
- ownership测试区分direct caller-owned与scope-owned；success/error/interruption/destroy均验证detach/destroy恰好一次，无双重destroy。
- task 206动态object只通过package runtime `update(deltaSeconds)`推进，不增加RAF/shared ticker或测试wall clock。
- shared package fixture自包含，不读取`assets/crave`或任一游戏美术。

### 验收级别

采用 `L2`：任务以兼容方式新增RenderCore跨presentation/reel/scene-layout的public contract，并通过gameframeworks向游戏暴露；需要验证直接consumer类型兼容。无需L3，因为不修改schema、manifest、assets、生成器、根工具链、lockfile或release配置。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/reel/render-reel-spin.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/render-object-layer.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/presentation-surface.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter game002v2 typecheck
pnpm --filter game003v2 typecheck
git diff --check
```

命令超过默认6条的原因：两个游戏是当前package runtime直接consumer，分别typecheck用于证明新增API不强迫旧调用迁移；`git diff --check`独立保护文档与源码格式。若第一条定向vitest参数与最终拆分不符，只替换为同范围的exact测试路径，不扩大到整仓test。

另用定向`rg`确认生产app未被迁移、旧public方法仍存在、文档没有引导游戏读取world/raw Container；搜索不计重型验收命令。

Crave文档另做L0内容检查：示例必须覆盖`createRenderObject/createImgNumberRenderObject`、area/scene/node三类target、anchor对齐、direct与scope两种cleanup、旧API兼容和strict failure；不得包含仓外源码的臆测路径、raw Container操作或“浏览器已通过”的表述。

### 人工验收

浏览器验收由用户在真实Crave/Gamelayout环境执行；RenderCore实现会话只交付自动化与可执行文档，不启动浏览器、不使用fixture冒充真实视觉验收。用户侧清单：

- 使用正式Gamelayout package创建task 206 named Spine/ImgNumber object，分别挂到area win、Scene顶层和exact node child/before/after，确认层级、位置与显隐正确。
- viewport横竖切换或父级transform变化后重新addAt/mount，对齐当前named node/area anchor；不出现旧world position缓存漂移。
- 播放中remove、area spin interruption、mode切换和runtime destroy后无残留node/player，既有Crave旧挂载路径无回归。
- 对照`docs/crave-render-layer-integration.md`确认示例能映射到Crave真实调用点；任何与真实源码不符之处由用户反馈后再更新本仓文档，不由实现会话猜测修改Crave。

### 独立验收建议

`必须`。本任务涉及跨模块public contract、坐标转换、attachment ownership和兼容边界。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/scene-layout/render-object-layer.test.ts tests/reel/render-reel-spin.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter game002v2 typecheck && pnpm --filter game003v2 typecheck
```

## 9. 环境与依赖

- 使用仓库要求的Node.js 24和pnpm；shell没有Node时加载`/Users/zerro/.nvm/nvm.sh`后`nvm use 24`。
- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 复用现有Pixi Container内部实现、WeakMap adapter、RenderObject、RenderAnchor、PresentationScope和Scene Layout node containers；不新增依赖、不修改lockfile。

## 10. 生成物、文档与规则

- 本任务不修改YAML、manifest、assets、ZIP、assets map或生成器输入，不运行无关generator。
- `packages/rendercore` build只生成本地dist验证；若dist不跟踪则不纳入提交，禁止手改生成声明。
- 更新`packages/rendercore/README.md`与三份RenderCore架构/API文档，保存canonical接口、分层、兼容与ownership说明。
- 新增`docs/crave-render-layer-integration.md`作为task 208 canonical Crave使用说明；更新`docs/crave-named-render-object-migration.md`的入口链接，让task 206 object不再只能借area scope接入。新文档必须区分direct caller cleanup与scope ownership，并明确浏览器验收由用户执行。
- `docs/agent-rules/shared-game-runtime.md`只更新稳定边界：通用opaque render layer、first/second layer分工与旧raw host seam兼容；`scene-layout.md`只在named-node attachment职责确有稳定变化时最小更新。
- 不修改根`AGENTS.md`，不回写任务205/206历史计划和报告。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/208-rendercore-non-area-render-layer-api-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终API命名、实际文件、兼容保留、layer/anchor/ownership决策、consumer是否零生产改动、Crave文档路径、自动验收结果，以及明确标记“浏览器验收由用户执行、当前未代验”的待办和剩余风险。

## 12. 风险、假设与待确认

### 风险

- Scene root、node attachment band与area layer的排序来源不同；若把local `order`误当manifest global order，会破坏authored node/main reel/Popup层级，必须以target-local合同和测试隔离。
- `addAt()`若先setPosition再校验parent/order，失败会留下半mutation；实现必须完整preflight或显式rollback。
- direct layer、PresentationScope和task 206 factory runtime可能都认为自己拥有object；合同必须固定“layer只attach，最终destroy由caller/scope/factory runtime兜底中的唯一owner完成”。
- 保留raw Container兼容seam意味着旧consumer仍可误改display tree；本任务通过新增安全推荐路径降低风险，但不在没有迁移授权时破坏旧代码。
- area scope把对象挂到scene layer时仍受area spin打断；这是scope owner的既有语义，文档必须避免把它误写成跨场景永久attachment。

### 假设

- 任务206交付的factory与当前Scene Layout `before/named/after`容器结构保持为执行基线；本任务无需manifest新增动态layer声明。
- 已有游戏要求源码兼容，不要求新旧API返回同一object identity；但两套入口必须操作同一底层Container/lifecycle，不能复制层级。
- Gamelayout exact node id、runtime resource name、animation和glyph仍由manifest/正式包拥有；RenderCore不推断业务名字。
- Crave仓库不在本任务工作区和修改范围内；本仓已有task 203/205/206人工迁移文档可作为写作与接口上下文，但真实调用点和视觉结果由用户在Crave侧确认。

### 待确认

- 无。新API最终英文命名允许在执行时按现有export风格小幅收口，但必须保持本计划的additive兼容、通用layer、opaque anchor与严格ownership合同。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 旧area与Scene Layout接口签名/行为保持兼容，生产app未被强制迁移。
- [ ] area、Scene root、named-node child/before/after复用一个canonical RenderObjectLayer合同。
- [ ] layer anchor/local resolve/addAt不公开world/raw Container且失败原子。
- [ ] task 206 named RenderObject/ImgNumber可挂接到游戏所需layer并保持唯一ticker/owner。
- [ ] 独立Crave接入文档已新增并由task 206旧文档链接，未修改或臆测Crave源码。
- [ ] direct attachment与PresentationScope ownership边界通过success/failure/interruption/destroy测试。
- [ ] public export、gameframeworks类型、文档和最小领域规则同步。
- [ ] L2自动验收与独立验收完成；浏览器验收已明确交给用户并在报告记录待验清单。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的领域规则和本计划；
2. 重新核对HEAD/status与旧APIconsumer，先保护兼容回归再新增能力；
3. 只做additive安全façade，不迁移游戏生产调用、不修改manifest/assets/raw host seam；
4. 小幅文件拆分或命名调整写入报告，任何旧API破坏、排序语义变化或consumer强迁移先停止说明；
5. 运行计划规定的L2验收并完成独立复核；
6. 完成后生成UTC中文执行报告，不在实现会话回写本计划的历史基线。
