# 243 rendercore-addressed-render-object-mounting 任务计划

## 1. 目标与完成定义

### 目标

在现有 owner-first `gamelayout:/` 地址与 opaque `RenderObjectLayer` 之上，补齐统一的
RenderObject 父节点定位和挂载能力。游戏用同一个 address mount API，即可把 detached、caller-owned
`RenderObject` 挂到 Scene 顶层图层、ReelArea 的 `bottom/top/win`、某次程序 Popup 的 root/命名图层、
唯一 Spine 实例的 exact slot，或唯一 VNI 实例的 exact text layer；可选 `order` 只控制该父节点内部的稳定显示顺序。

程序 Spine/VNI RenderObject 与程序 Popup 使用调用者显式提供的 `instanceId` 形成 live runtime address。
RenderObject 自身同时能用 typed exact ref 取得它拥有的 Spine slot 或 VNI text-layer `RenderObjectLayer`，
不要求调用方拿 raw Container/player，也不按“唯一 slot/文字层”猜目标。

### 完成定义

- [ ] `SceneLayoutPackageRuntime.addresses` 能严格解析并枚举静态 parent address 与当前 live instance address；
      instance 创建成功后注册，destroy/Popup session 结束后注销，stale endpoint 显式失败。
- [ ] 提供一个统一 address mount API，把同一 `RenderObject` 合同挂到 Scene、ReelArea、Popup、Spine slot、
      VNI text layer；返回幂等 detach handle，不转移 child destroy ownership。
- [ ] `RenderObject` 可按 typed `{ kind: "spine-slot", slot }` 或
      `{ kind: "vni-text-layer", layerId }` 取得 opaque child `RenderObjectLayer`；不支持该 kind 或 unknown exact
      target 时显式失败。
- [ ] program resource 与 program Popup 可显式声明 `instanceId` 并得到 canonical instance address；并发重复 id、
      prepare 失败、queued cancel、active close、child/parent/runtime destroy 都不留下 registry、display child、clock
      或 VNI/Spine attachment 泄漏。
- [ ] `order` 缺省为 `0`，只接受 safe integer；同 order 保持 mount 顺序，不改变 authored global order、reel
      symbol order、Popup tier/state、Spine draw order或业务状态。
- [ ] 现有 `getRenderLayer()`、`RenderObjectLayer.add/remove/addAt/moveHere`、authored Spine
      `bindSlotObjects()`、`attachRenderObjectToSpineSlot()` 与未声明 instanceId 的兼容调用保持行为不变。
- [ ] RenderCore/Gameframeworks public exports、使用文档、稳定领域规则、定向自动测试、真实浏览器人工验收与
      UTC 中文执行报告完成；不新增 manifest/schema、依赖或生成物。

## 2. 范围

### 包含

- Presentation 第一层：把 exact Spine slot、VNI text layer 与 Popup logical layer 适配成同一个
  `RenderObjectLayer` 合同，统一 order、clock、detach、cleanup 和 destroy 边界。
- Scene Layout data/core：扩展 runtime address kind/descriptor/endpoint、live instance registry、address→parent
  resolver、`mount()`、RenderObject→instance address query。
- authored Scene node、program runtime resource 与 program Popup session 的 exact instance/child-parent 地址。
- Popup 三种 runtime 的 session-scoped root/命名 layer mount target；award 重复 layer id 沿用 manifest 已验证的
  stable logical identity，并随实际 active tier/segment 可见性切换。
- RenderCore/Gameframeworks exports、shared fixtures、README/address reference、最小领域规则和执行报告。

### 不包含

- 不修改 Scene Layout、Popup、Symbols 或 VNI manifest 版本/字段；`instanceId` 是 runtime 调用身份，不写入 ZIP、
  YAML、assets map 或 Editor draft。
- 不让地址访问 raw Pixi Container、Spine player/slot object、VNI runtime/layer instance、Matrix、world coordinate
  或 mutable Popup player。
- 不把 symbol occurrence、reel symbols 主层、transition 内部 player、mode award 或 transition prelude 伪装为
  caller-owned program instance；本任务只给显式 program resource 与 program Popup 增加 instance identity。
- 不提供 slot/text-layer 名称 fallback、首项/default target、filename/path/hash alias、模糊查找或跨 owner 同名匹配。
- 不用 mount API 移动 borrowed settled Symbol 或 authored node；这类临时换层继续使用现有 owner-controlled
  `moveHere()/restore()` 或专用 attachment。
- 不改变 VNI schema/时间线、Spine animation/state machine、Popup scheduler、reel state machine 或 gameplay DSL。
- 不修改游戏 app、Gamelayout Editor UI、production assets、外部 pixicrave/piximinecart2、lockfile 或根工具链。

## 3. 制定计划时的基线

```text
UTC: 2026-08-24T08:57:28Z
HEAD: 007dd813be5f0e2e9cb724d04a2d67f993b0b2d7
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts,vni-runtime}.md`、任务 228/240 的计划与报告、
  `docs/gamelayout-runtime-addresses.md`；`packages/rendercore` 下没有补充 `AGENTS.md`。
- `packages/rendercore/src/scene-layout/core/runtime-address.ts#createGameLayoutRuntimeAddresses()` 已从 canonical
  manifest 编译静态 `layer/render-object/reel/popup-layer/resource-factory/event` catalog，并为
  `layout/reel/transition/popup`、node `before/child/after`、reel `bottom/top/win` 返回
  `RenderObjectLayer`；当前 catalog 不接受运行期实例注册。
- 现有地址 `gamelayout:/node/<id>` 能定位 authored Spine façade，
  `gamelayout:/resource/spine/<key>` 能定位创建 program Spine 的 factory，animation lifecycle event 也能定位到
  authored node 或 resource owner；没有任何 address endpoint 能定位 exact Spine slot。
- `packages/rendercore/src/presentation/spine-slot-attachment.ts#attachRenderObjectToSpineSlot()` 可把一个 owned
  detached child 绑定到 program Spine exact slot；
  `SceneLayoutSpineLoopRenderObject.bindSlotObjects()` 可批量绑定 authored loop Spine。两者都依赖对象引用，
  不形成 address，且 official player 当前每个 slot 只保留一个直接 child。
- `packages/rendercore/src/presentation/render-object-layer.ts#RenderObjectLayer` 已有 `add/remove/addAt/moveHere`、
  safe-integer order、anchor 与 owner clock；这是本任务应复用的统一 parent 能力，不另建平行 display-tree API。
- `packages/rendercore/src/scene-layout/render-object-factory.ts#createVni()` 只给 program VNI RenderObject 暴露
  playback；底层 `VNIRuntime.attachNodeToTextLayer()` 已有 exact layer、duplicate mounted id、hide-original 与 dispose
  能力，但 RenderObject adapter/public API 尚未透出。
- `gamelayout:/popup/<id>/layer/<layer-id>` 当前是 `popup-layer` endpoint，且
  `package-runtime.ts#getPopupLayer()` 只对 single-state Popup 返回 borrowed RenderObject；它不是 child mount parent，
  也没有区分同一 binding 的多次 program session。
- program resource factory 返回 caller-owned RenderObject，但没有 `instanceId`/instance address；program Popup 只有
  runtime 内部递增 `sessionId`，event detail 可见但不属于 canonical address，不能作为调用者稳定 identity。
- 直接保护当前合同的测试入口包括
  `tests/{presentation/render-object-layer,presentation/render-object-motion,scene-layout/runtime-address,scene-layout/render-object-factory,scene-layout/package-runtime,popup/*-player}.test.ts`。

## 4. 需求解释与技术决策

### 需求解释

1. “现在有能定位到 Spine 动画的 slot 能力么”的结论是：已有对象级 exact-slot attachment，但没有
   address→slot parent。现有 animation event/resource address 只定位 animation owner/lifecycle，不等于 slot 地址。
2. “统一加到父节点”解释为一个 address-native 原子 mount 操作，不把不同 owner 的 raw addChild 暴露给游戏。
   所有可挂载 parent 最终返回同一 opaque `RenderObjectLayer`，因此 order、owner clock和cleanup只有一套语义。
3. “唯一 Spine/VNI/程序 Popup”使用调用者显式 `instanceId`。identity 是 owner address 下的一个 exact segment；
   不使用内部对象地址、递增数字、资源名复用、当前 active 首项或自动 UUID。
4. “RenderObject 能取到它下面的 slot/文字图层”是 typed child-layer lookup。Spine 只接受 exact slot；VNI 只接受
   project 中 `type=text` 的 exact layer；普通 image/image-string 与不支持 attachment 的 fake player显式失败。
5. Popup 的 parent 分为 session root 与 exact authored logical layer。不同 queued/active session 即使引用同一个
   cached Popup player，也必须有隔离 group；只有当前 session group 可见，结束时自动 detach，不能污染下次复用。

### Canonical parent 与 instance 地址

```text
gamelayout:/layer/<layout|reel|transition|popup>
gamelayout:/reel/<reel-id>/layer/<bottom|top|win>
gamelayout:/node/<node-id>/layer/<before|child|after>
gamelayout:/node/<node-id>/slot/<slot-name>
gamelayout:/node/<node-id>/text-layer/<text-layer-id>

gamelayout:/resource/<kind>/<resource-key>/instance/<instance-id>
gamelayout:/resource/spine/<resource-key>/instance/<instance-id>/slot/<slot-name>
gamelayout:/resource/vni/<resource-key>/instance/<instance-id>/text-layer/<text-layer-id>

gamelayout:/popup/<popup-id>/instance/<instance-id>
gamelayout:/popup/<popup-id>/instance/<instance-id>/layer/root
gamelayout:/popup/<popup-id>/instance/<instance-id>/layer/<layer-id>
gamelayout:/popup/<popup-id>/instance/<instance-id>/layer/<layer-id>/slot/<slot-name>
gamelayout:/popup/<popup-id>/instance/<instance-id>/layer/<layer-id>/text-layer/<text-layer-id>
```

- normal Spine Popup 的 package-owned main Spine 不是普通 overlay layer；若其 strict metadata 有 slots，另编译
  `.../instance/<instance-id>/spine/main/slot/<slot-name>`，不把它猜成某个 layer。
- authored node 的 slot/text-layer 子地址来自已解析的 exact resource metadata；program resource 和 Popup session
  子地址只在实例 prepare/validation 成功后注册。unsupported kind 不生成不可用 descriptor。
- 现有 Popup owner/layer/string/event 与 resource-owner animation lifecycle 地址保持；instance 地址是 exact live
  occurrence，不是旧 owner 地址 alias。需要对象级 animation event 时可在后续任务扩展，本任务不改变 task 240
  已有 resource aggregate event。

### Public API 决策

- 在 `RenderObject` 增加 typed `getChildLayer(ref)`，返回 `RenderObjectLayer`；Scene Layout authored Spine/VNI façade
  暴露同名能力。相同 parent/ref 在 owner 存活期间返回同一稳定 façade。
- 在 `GameLayoutRuntimeAddresses` 增加：
  - `mount(parentAddress, child, { order? })`，返回幂等 `detach()` handle；
  - `addressOf(child)`，只接受当前 runtime 已注册的 live program RenderObject，unaddressed/foreign/destroyed object失败。
- program resource creation options 可带显式 `instanceId`；带 id 的对象完成 prepare 后注册 live address，不带 id 的
  旧调用保持 detached caller-owned、但 `addressOf()` 明确失败且不能按 instance address定位。不存在自动 id fallback。
- `SceneLayoutPopupOpenRequest` 增加可选显式 `instanceId`，`SceneLayoutPopupSession` 增加
  `instanceAddress: GameLayoutRuntimeAddress | null`；只有带 id 的 program session 可作为 address parent。旧无 id session
  继续用于兼容打开/关闭，不被悄悄分配可观察 identity。
- `addresses.list()` 仍返回 frozen snapshot：静态 manifest descriptors 加当前 committed live descriptors，并按 address
  确定性排序；`describe/resolve/mount` 同时查询静态 catalog 与 live registry。旧保存的 list snapshot不随 registry变化。

### Mount 与 order 语义

- mount 先完整验证 canonical address、endpoint 是 parent、order、child 由当前 RenderCore 创建且 caller-owned、
  child detached、parent/instance/session live，再一次性提交；任何失败保持 child 的 parent/position/order/clock不变。
- `order` 缺省 `0`，只接受 safe integer，作用于 exact parent 内的 child z-order；同 order 按成功 mount sequence稳定。
  Spine slot 的 parent 是跟随 skeleton slot draw order 的单一 stable group，order只排 group 内 children，不跨 slot改 draw order。
- VNI text-layer parent 通过一个 stable mounted group接入现有 `attachNodeToTextLayer()`；沿用 replacement语义隐藏原文字，
  最后一个 child离开或parent destroy后恢复，并用内部不可冲突 mounted id，不向游戏暴露 VNI id registry。
- Popup layer parent只添加 program child band，不改 authored layer自己的manifest order/transform/attachment；award相同 logical
  layer id 的具体 runtime occurrence由Popup owner切换，program group跟随其可见性，不复制tier状态机。
- child通过layer/Spine/VNI/Popup parent继承唯一owner clock；detach暂停object-owned playback update，重新挂载后继续。
  parent/child/runtime destroy与Popup session结束先detach/cancel旧motion/playback关系，再释放owner，不destroy caller child。

## 5. 职责与合同

- **Presentation**：`RenderObjectLayer`继续拥有add/remove/order/clock；child-layer adapter把Spine/VNI owner转换为该能力，
  不理解Gamelayout地址、resource key、Popup id或instance id。
- **Spine/VNI adapter**：Spine exact slot只挂一个RenderCore-owned stable group并在组内排序；VNI exact text layer只挂一个
  stable group并维护original visibility。它们不开放player/container，不取得child destroy ownership。
- **Scene Layout data/core**：定义纯address/descriptor/instance类型、静态+live resolver和统一mount transaction；
  不把runtime identity写入manifest，也不解析文件名/资源路径猜owner。
- **Scene Layout package runtime/factory**：验证和保留caller instanceId、并发reserve、prepare后commit registry、destroy时
  unregister；把authored node/program object/Popup owner-neutral child layer映射到canonical地址。
- **Popup core**：拥有每个program session的root/layer attachment scope、active visibility、cached-player复用隔离和结束清理；
  不导入Game Layout address formatter，package runtime注入session identity并做地址映射。
- **Gameframeworks/game app**：facade只re-export contract；游戏保存returned RenderObject/session和detach handle，使用exact
  address，不读取manifest重建slot/text-layer表，也不手动update或destroyborrowed parent。
- **失败策略**：非法/重复instanceId、unknown/stale/wrong-kind address、unknown slot/text/layer、unsupported object kind、
  duplicate mounted child、invalid order、borrowed/foreign/already-mounted child、destroyed parent/runtime全部显式失败。
- **禁止行为**：自动instance id、当前active Popup fallback、首slot/text layer、raw addChild/zIndex、跨runtime mount、
  address alias、隐藏clock、半注册instance、失败后残留VNI original-hidden或Popup session child。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/presentation/render-object-child-layer.ts
packages/rendercore/src/scene-layout/core/runtime-instance-registry.ts
packages/rendercore/tests/presentation/render-object-child-layer.test.ts
packages/rendercore/tests/scene-layout/runtime-address-mount.test.ts
packages/rendercore/tests/popup/programmatic-instance-layer.test.ts
tasks/243-rendercore-addressed-render-object-mounting-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/presentation/{index,render-object,render-object-layer,spine-slot-attachment}.ts
packages/rendercore/src/scene-layout/{types,runtime,package-runtime,render-object-factory,presentation-surface}.ts
packages/rendercore/src/scene-layout/{data/runtime-address,core/runtime-address,core/index}.ts
packages/rendercore/src/popup/{award-player,spine-player,single-state-player,spine-overlay-runtime,layer-attachment}.ts
packages/rendercore/src/popup/core/types.ts
packages/rendercore/tests/{presentation,scene-layout,popup}/**
packages/rendercore/README.md
packages/gameframeworks/{src/index.ts,README.md}
docs/{gamelayout-runtime-addresses,rendercore-game-runtime-composition-api}.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md
```

### 原则上不应修改

```text
apps/**
assets/**
packages/{logiccore,uiframeworks,netcore,audiocore,vnicore}/**
packages/rendercore/src/{symbol,reel}/**
docs/agent-rules/{editor-artifacts,vni-runtime}.md
{AGENTS.md,pnpm-workspace.yaml,pnpm-lock.yaml}
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

执行时若必须新增manifest/version、修改VNI public core、改变Popup scheduler并发模型、让borrowed Symbol通过此API换层、
或修改游戏app/production资源，必须先说明原因并重新确认范围，不能用修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线与地址矩阵**
   - 重核HEAD/status、任务228/240兼容合同、四份领域规则、resource prepare metadata、三类Popup layer identity、
     official Spine slot与VNI text-layer生命周期。
   - 先用table fixture固定每个parent address、owner、静态/live、可用阶段、order域、cleanup owner及strict failure。
2. **把Spine/VNI child parent适配为RenderObjectLayer**
   - 在presentation层实现typed child-layer adapter、stable group、order和clock继承；RenderObject增加`getChildLayer()`。
   - 让现有`attachRenderObjectToSpineSlot()`复用同一底层attachment/cleanup规则，保留其public行为；给program VNI adapter
     接入已有`attachNodeToTextLayer()`，不修改vnicore私有display tree。
3. **建立live instance registry与address mount**
   - 在address controller旁建立package-owned registry，支持reserve/commit/unregister、frozen deterministic list snapshot、
     strict describe/resolve、RenderObject反查和runtime destroy。
   - 扩展factory/create options与typed endpoints；并发duplicate在prepare前阻断，失败释放reservation，成功对象destroy
     自动注销。实现`addresses.mount()`的完整preflight、atomic commit和幂等detach。
4. **接入authored Scene node与Reel/Scene layer**
   - 从prepared exact Spine/VNI metadata编译authored node slot/text-layer地址，返回与对象`getChildLayer()`相同façade。
   - 复用现有Scene/node/reel area `RenderObjectLayer`处理顶层与`bottom/top/win`；测试新mount不改变旧ref parser、
     anchor/addAt/moveHere及presentation-only失败边界。
5. **接入program Popup instance scope**
   - 给program request/session增加显式instance identity与live address；为root、stable logical layer及适用的Spine/VNI child
     target建立session-scoped layer。
   - 覆盖open/enqueue、两个同binding queued session、presented前mount、active切换、complete/immediate/cancel/fail/destroy，
     确保cached player复用时只有当前instance group可见且结束后无残留。
6. **Public facade、文档与收尾**
   - 同步RenderCore/Gameframeworks exports与类型，更新README和address/composition示例；最小更新shared runtime与
     scene-layout稳定职责，不改manifest/editor规则。
   - 运行L2定向验收、真实浏览器人工验证并生成UTC中文执行报告；若文件名与当前实现小幅不同，在报告记录。

## 8. 测试与验收

### 测试原则

- shared测试只使用包内最小Spine/VNI/Popup fixture，不读取Crave/Minecart2美术；slot、layer、instance名称保持中性exact identity。
- 每类parent覆盖正常mount/order/detach、duplicate order稳定性、unsupported/unknown/stale/foreign failure、parent/child/runtime
  destroy，以及preflight失败零mutation。
- live registry覆盖并发同id reserve、prepare失败rollback、成功commit、list snapshot、addressOf、destroy unregister和旧无id兼容。
- Popup必须分别覆盖award/spine/single-state，且两个同binding session的child不可串场；测试不能用单例fake绕过真实scope切换。
- clock测试证明layer、Spine、VNI、Popup都只由exact owner update一次，detach后暂停，禁止游戏补update。

### 验收级别

`L2`：修改RenderCore跨模块public address/RenderObject/Popup contract并由Gameframeworks直接re-export，涉及动态identity、
异步prepare、attachment ownership与destroy；不修改schema、生成器、production asset、lockfile或根工具链，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation/render-object-child-layer.test.ts tests/presentation/render-object-layer.test.ts tests/scene-layout/runtime-address.test.ts tests/scene-layout/runtime-address-mount.test.ts tests/scene-layout/render-object-factory.test.ts tests/popup/programmatic-instance-layer.test.ts
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks typecheck
git diff --check
```

### 人工验收

在真实浏览器与一个包含official Spine、runtime VNI、standard reel和三类program Popup的实际Gamelayout package中验证：

1. 同一program Spine/VNI各创建两个显式instance，按各自地址挂不同child；slot/text layer、动画update与destroy互不串实例。
2. 同一child分别挂到Scene layer、`reel/main/layer/top`、Spine slot、VNI text layer，order与局部transform正确；detach后
   display/clock恢复，无raw Container操作。
3. 同一Popup binding排队两个instance并预先mount不同child；只显示active instance内容，normal close、immediate cancel与
   runtime destroy后下次打开无残留。

### 独立验收建议

`必须`：涉及跨包public contract、live identity registry、Popup异步session复用、Spine/VNI attachment、owner clock和destroy。
重点复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation/render-object-child-layer.test.ts tests/scene-layout/runtime-address-mount.test.ts tests/popup/programmatic-instance-layer.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/gameframeworks typecheck
```

## 9. 环境与依赖

- 使用仓库要求的Node 24与pnpm；shell没有Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有实际下载失败后设置仓库约定代理并重试。
- 本任务复用Pixi、official Spine、vnicore与现有runtime，不新增依赖、不修改lockfile。

## 10. 生成物、文档与规则

- 本任务无YAML、manifest schema或production生成物；`dist`只由build验证，不提交手改产物。
- `docs/gamelayout-runtime-addresses.md`记录static/live catalog、instance id、parent地址矩阵、mount/order/stale/cleanup与示例；
  `rendercore-game-runtime-composition-api.md`迁移到统一mount，同时保留旧direct layer/slot API兼容说明。
- RenderCore/Gameframeworks README只保留入口摘要与ownership警告，不复制完整地址表。
- 若实现确认“显式runtime instance identity、所有安全parent统一为RenderObjectLayer、Popup session attachment隔离”为稳定职责，
  最小更新`shared-game-runtime.md`与`scene-layout.md`；不修改根`AGENTS.md`、editor-artifacts或vni-runtime规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/243-rendercore-addressed-render-object-mounting-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终地址/API、实际文件、instance registry与lifecycle决策、
自动验收结果、真实浏览器未完成项、计划偏差和剩余风险；不收集无关coverage、完整历史矩阵或整仓profiler数据。

## 12. 风险、假设与待确认

### 风险

- factory prepare是异步的；若instance id只在成功后检查，会并发创建同地址，必须先reserve并在全部失败路径释放。
- official Spine底层每slot当前只允许一个object；统一layer必须只挂一个owner group，再在组内排序，不能让后一个child
  静默替换前一个。
- VNI mounted id是player-global且默认隐藏原文字；group id冲突或detach遗漏会导致下次实例失败/原文字永久隐藏。
- Popup player按binding缓存复用；若把child直接挂到package layer而非session scope，queued或后续session会看到错误内容。
- live地址改变现有“纯静态catalog”理解；必须明确list是immutable snapshot而registry可变，并保证stale endpoint每次使用都复核owner。
- authored award layer可能跨tier有多个concrete runtime；只能依赖manifest已验证的stable logical identity做owner路由，
  不能按当前首个可见layer缓存raw对象。

### 假设

- `instanceId`由调用方在单个package runtime的对应resource或Popup owner下保证业务稳定；runtime只做exact string、live
  uniqueness和canonical encoding，不解释其业务格式。
- “Popup的图层”包含session root与Popup manifest中的exact logical layer；program child继承该layer transform/visibility，
  不修改其authoring order或attachment。
- “order”只表示同一个resolved parent内的program child顺序；不同Spine slot仍由skeleton draw order决定，不提供跨parent全局zIndex。
- 现有无instanceId的resource/Popup调用需要兼容，但它们明确不可通过live instance address定位；新统一address流程必须显式传id。

### 待确认

无。上述解释由当前RenderObjectLayer、task228/240地址合同、Popup单active复用和vnicore exact text-layer能力共同约束；
执行中若用户希望无id旧调用也自动获得地址，必须停止确认，因为这会改变“禁止自动identity”的关键决策。

## 13. 完成清单

- [ ] Scene/ReelArea/Popup/Spine/VNI全部由同一address mount与RenderObjectLayer语义覆盖。
- [ ] program object/Popup显式instance id、dynamic address、list/resolve/addressOf/stale边界正确。
- [ ] RenderObject typed child-layer lookup不猜slot/text layer且不开放raw display tree。
- [ ] order、stable tie、clock、detach、rollback、destroy与Popup session隔离正确。
- [ ] task228/240地址/event及旧layer/slot/无id兼容路径无回归。
- [ ] facade、文档、规则、L2自动验收、人工验收与UTC中文执行报告完成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划和本计划列出的四份领域规则；
2. 核对Git基线、live address现状与工作区，保留用户无关修改；
3. 先固定address/ownership/lifecycle测试矩阵，再按计划实现，不重新制定平行parent API；
4. 小幅适配当前实现时在报告记录；涉及schema、app、vnicore public API或borrowed Symbol范围时先停止说明；
5. 只运行计划规定的L2验收，失败先最小化复现；
6. 完成真实浏览器验收或明确记录未完成项；
7. 生成UTC中文执行报告；
8. 除非用户明确要求，不commit、不push、不创建PR。
