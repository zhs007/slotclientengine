# 216 rendercore-game-mode-resource-retention 任务计划

## 1. 目标与完成定义

### 目标

升级 Scene Layout manifest，由 Game Layout Editor 在导出时根据完整 mode、variant、node、Symbols、Popup、
runtime resource 和 directed transition 关系，生成显式的 runtime allocation/retention plan。package loading
完成后，RenderCore strict 校验并直接执行该 plan，不在每次 game mode 切换时重新推断资源归属。

package runtime 按 plan 一次准备 package-lifetime immutable assets/template，并在 100% 后一次建立稳定、有界的
authored node、main reel/Symbols binding、Popup 和 render-layer owner。mode 切换只改变 active/visible/placement、
提交显式 target scene并切换 owner；仍会再次使用的资源不得释放后重建。transition mutable player保持单次
edge request owner，获奖庆祝/普通 Popup按exact binding长期复用。以Minecart2多图层Gamelayout为完整基线，
减少atlas/skeleton parse、texture acquire、catalog、player、renderer和display tree churn。

### 完成定义

- [ ] Scene Layout latest升级为v3，新增strict `runtimeAllocation`；RenderCore runtime公开加载入口仍直接接受v1/v2，
      读取后在RenderCore内确定性补齐当前兼容默认allocation，再规范化为v3并进入与原生v3相同的执行流程。
- [ ] Game Layout Editor可打开合法v1/v2/v3；v1/v2先升级，draft始终持有latest语义，所有新建/重导/导出ZIP
      必须写v3和完整`runtimeAllocation`，不得继续导出v1/v2或缺字段v3。
- [ ] `runtimeAllocation`由Editor从typed manifest引用生成并在每次相关draft transaction后复验；它不列physical
      path/hash/bytes，不复制asset closure，只声明stable owner、mode/variant active refs和request-local owner。
- [ ] runtime对v3 plan做完整parity校验：owner kind/id、mode/variant active node、Symbols/Popup binding、transition/
      runtime-resource lifetime必须与manifest其它typed字段精确一致；不信任或静默修复坏v3。
- [ ] loading完成时已取得validated allocation plan并prepare全部`package` immutable roots；不创建Application/canvas/
      DOM display owner，不跨越99%/100% loading职责。
- [ ] 相同typed root/安全resolved URL的immutable image texture、Spine template、VNI assets、image-string resource、
      Symbols catalog input和Popup resource只prepare/acquire一次；不同logical owner不因SHA/path/bytes相似而合并。
- [ ] 不同authored node、Symbol occurrence和Popup保持独立mutableplayer/renderer/playhead；只共享可证明immutable模板。
- [ ] 同一exact Symbols binding跨mode使用一个reel entry/catalog/settled scene/Symbol player/area layer，不因mode、
      background、Popup、transition或variant变化重建/重新抽样。
- [ ] 多Symbols binding按v3 plan在runtime init并发prepare catalog、reel shell/effects并保持dormant；首次进入提交
      显式scene，后续返回恢复同一entry/scene或原子提交新scene。无reel mode只停用，不销毁entry。
- [ ] `recreateReel:true`保留为唯一显式opt-out；candidate成功commit后才替换旧entry，cancel/failure保留旧entry。
- [ ] authored background、global/mode-scoped image/Spine/VNI/image-string node、program visibility、attachment和text
      按exact node id保留；mode/variant只提交active/placement/state，隐藏owner不tick也不release。
- [ ] 同一exact Popup id跨mode返回同一award/spine player，request-scoped string/tier/phase按既有生命周期恢复；
      不同Popup id不共享mutable runtime。
- [ ] transition mutable player按exact directed edge request prepare/play/destroy，只复用package immutable resource；
      Spine event、video trusted gesture/prelude/fadeStart和post-switch failure语义不变。
- [ ] dormant reel不update/event drain/mutate；busy mutation安全中断或在可见切换前显式失败，旧occurrence/scope按
      activation epoch stale。main reel overlay和global/area layer保持正确order/ownership。
- [ ] allocation parity、old-version defaults、Editor latest-only export、parse/decode/factory/destroy counter测试证明：
      runtime init后warm mode往返只允许edge-local transition player新增/销毁。
- [ ] Crave/game002v2与assets不修改；若确需适配，只输出人工修改文档。Minecart2/game003v2只做latest兼容与人工基线，
      不修改production assets或启用游戏业务mode flow。

## 2. 范围

### 包含

- Scene Layout v3 schema、RenderCore runtime入口的v1/v2→v3 upgrader、旧版默认allocation、latest materializer和parity checker。
- Game Layout Editor内allocation compiler、read-only plan preview/diagnostics、draft mutation复验、import/filename rewrite/
  export/stable JSON/latest-only ZIP链路。
- Game Layout package CLI结构化读取、reference rewrite、asset-group分析和回写链路保留v3 allocation；Game Frameworks
  scene-layout template消费latest v3，不以`version === 2`误走legacy分支。
- `runtimeAllocation`五类owner：authored node、Symbols binding/reel、Popup binding、directed transition、programmatic
  runtime resource，以及mode/variant active refs。
- package resource loading后的package-local immutable prepare/lease registry；official Spine exact template的一次parse，
  以及image/VNI/image-string/Symbols/Popup现有cache的接入或验证。
- package runtime按plan创建全部stable owner、active/dormant reel entry、staged target scene、atomic switch、forced
  replacement、cancel/failure/destroy。
- authoring selection和production transition共享allocation/activation，前者仍不播放edge。
- 自包含fixture复现Minecart2复杂拓扑；Minecart2文件只读，不作为shared package单测输入。

### 不包含

- 不修改`apps/game002v2/**`、`assets/crave/**`、`assets/gamecfg002/**`、`apps/game003v2/**`、
  `assets/minecart2/**`或`assets/gamecfg003/**`。
- 不恢复game003v2传送带、feature bar、矿车互动或业务mode-switch编排。
- 不在allocation中保存physical asset列表、hash、byteLength、content-addressed filename、服务器scene/reel或Popup内部层。
- 不增加人工cache alias、按bytes猜identity、silent fallback、LRU或runtime扫描orphan。
- 不让两个mutable node/player/occurrence/Popup共用display state；Spine shared template必须先证明immutable安全。
- 不永久缓存transition player/video element/trusted gesture状态，不预播、静音或降级。
- 不扩大为asset-groups网络下载策略、CDN、generator或loading UI协议任务；只保证现有ZIP工具不丢失/破坏v3字段。
- loading 100%前不创建Pixi Application/canvas/DOM player；manifest/DOM-free prepare可留在99%资源边界。
- 不新增依赖，不修改lockfile、YAML、仓库现有production ZIP或生成的游戏资源表。

## 3. 制定计划时的基线

```text
UTC: 2026-08-16T07:12:10Z
HEAD: 759d990d599ccdebad21ffe4b88ca519f7085cae
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根`AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts,game002,game003,loading-ui}.md`；目标目录无补充规则。
- latest当前为`SceneLayoutManifestV2`；`upgradeSceneLayoutManifestToLatest()`只做v1→v2。v2将adaptation/reel placement
  下沉到mode，但没有resource allocation字段。
- Game Layout Editor的`editorProjectToManifest()`固定输出version 2；import、filename normalization、owned-assets materialize、
  stable JSON均调用latest upgrader，适合统一迁移到v3入口。
- Game Layout package CLI通过共享parser做package read/rewrite；Game Frameworks scene-layout template仍有
  `manifest.version === 2`分支，两者都是latest schema升级的直接consumer。
- package resource当前解析完整layout/Symbols/Popup resource，但没有Editor-authored allocation plan；runtime仍从mode字段
  临时解析active refs。
- layout runtime已一次创建全部authored node；mode/variant只改active/renderable/placement，隐藏Spine/VNI不update。
  image URL load和image-string resource已有局部共享，Popup也是一id一player直到package destroy。
- package runtime只保存一个`#reel/#catalog`；不同Symbols binding在transition prepare创建target并在switch后销毁source；
  返回旧binding会再次构造。同一binding已复用，Crave和Minecart2当前路径不得回归。
- official Spine validation和每个player `init()`都会构造atlas并解析skeleton；Pixi texture可缓存，但exact immutable
  template尚无package owner。Symbol内部cache不跨occurrence共享mutable player，这是正确边界。
- transition prepared/active player已有request-local cancel/complete/failure/destroy owner，应继续保留。
- runtime resource已按exact key复用并发prepare Promise；由其创建的RenderObject仍caller-owned。
- Minecart2当前有42个authored node：32 image、6 Spine、4 image-string；35 global，BaseGame 3 scoped、FreeGame 2、
  BonusGame 2。六个mode/variant background均为独立stable node。
- Minecart2三个mode共用一个Symbols binding；BaseGame/BonusGame共用一个award Popup；两个directed edge使用不同MP4。
  四个image-string node共用同一manifest；conveyor/car Spine各共享atlas/texture但使用不同skeleton，只能共享相应immutable层。
- Minecart2 assets map有207个路由entry；allocation只覆盖typed owner/ref，不扫描或gate未引用entry/file。
- borrowed reel/area capability和`#mainReelOverlays`围绕唯一active reel；保留多entry不能只detach，否则hidden mutation和
  layer order无明确合同。

## 4. 需求解释与技术决策

### 需求解释

- “流程移到Gamelayout Editor”解释为Editor给原生v3生成显式allocation；RenderCore仍负责旧版默认生成、统一校验和执行，
  不是把runtime player/Pixi生命周期或兼容责任搬进Editor。
- “旧版本正常支持”表示生产runtime可直接加载合法v1/v2，不以Editor重导为前置；Editor import和ZIP工具也继续接受。
- “旧版本缺值有默认操作”表示RenderCore parser读取v1/v2后由统一upgrader确定性生成allocation，再走同一latest runtime
  流程；不是在runtime各调用点散落`?? default`，也不是由Editor替runtime兜底。
- “Editor一定导出新版本”表示任何Editor出口只写canonical v3；v1/v2输入一旦进入Editor即升级，不再保留source version。
- loading时已知owner/ref/closure但不知道业务target scene；可prepare immutable template、catalog和reel shell，不能伪造scene/value。

### v3 `runtimeAllocation` 合同

选择一个紧凑、无physical asset清单的generated结构：

```ts
interface SceneLayoutRuntimeAllocationV1 {
  readonly version: 1;
  readonly package: {
    readonly nodes: readonly string[];
    readonly symbolPackages: readonly string[];
    readonly popups: readonly string[];
  };
  readonly onDemand: {
    readonly transitions: readonly string[];
    readonly runtimeResources: readonly string[];
  };
  readonly modes: Readonly<
    Record<
      string,
      {
        readonly variants: Readonly<
          Record<
            string,
            {
              readonly activeNodes: readonly string[];
            }
          >
        >;
        readonly symbolPackage: string | null;
        readonly awardCelebrationPopup: string | null;
      }
    >
  >;
}
```

- owner id使用现有exact node/binding/popup/runtime-resource id；transition id由唯一canonical helper从`from/to`生成，
  Editor、parser、optimizer/runtime不得各自拼另一种key。
- legacy singular`symbolPackage`在upgrader中使用保留的typed owner id，不从目录名或nested bytes猜package id；Editor在拥有
  dependency信息后导出canonical plural binding。
- 数组按manifest declaration/canonical顺序输出并冻结；duplicate、unknown、missing、foreign-mode node、variant mismatch、
  wrong Popup kind和edge mismatch显式失败。
- `package`表示loading prepare + package-runtime retain；`onDemand`表示资源binding已知但mutable实例按request/caller创建。

### 关键决策

1. **RenderCore直接升级v1/v2，不要求Editor预迁移。**
   - `parseSceneLayoutManifestV1/V2`继续验证原版本；`upgrade...ToLatest()`输出v3并生成默认allocation。
   - runtime公开load/package入口无条件先走RenderCore version dispatch；package resource/runtime、Editor和CLI随后统一消费v3。
   - v3缺`runtimeAllocation`、字段不全或parity不符直接失败；默认只适用于source version 1/2。

2. **Editor负责原生v3 authoring，RenderCore负责兼容与strict execution。**
   - compiler复用node scope、mode background、variant、Symbols/Popup/transition typed refs，不复制asset path closure算法。
   - 每次mode/node/binding/transition/runtime-resource mutation先构造candidate plan并全量validate，再原子提交draft。
   - UI只读展示package owners、on-demand owners和各mode/variant active refs；不让用户手输id或制造alias。

3. **package-local immutable registry执行`package` owners。**
   - image按validated safe URL共享texture lease；logical node仍独立。
   - Spine按exact skeleton+atlas+page mapping准备immutable template；不同skeleton只共享page texture，不共享SkeletonData。
   - VNI按project root、image-string按manifest root共享immutable data；mutableplayer/renderer逐exact owner创建。
   - mode隐藏不release；package destroy按refcount/依赖逆序恰好一次释放。

4. **runtime init创建稳定mutable owner，mode switch只activation。**
   - authored node/Popup沿用一次创建；所有Symbols bindings并发preparecatalog/reel shell，未提交scene时不可见且API失败。
   - same binding保留scene/player；different binding选dormant entry；committed target可恢复旧scene或接收完整preflight后的
     staged新scene；uncommitted target必须有input。
   - dormant通过activation epoch拒绝mutation/update并清transient scope；global reel layer/overlay跟随active entry重挂。

5. **request-local owner保持临时。**
   - transition player、video element和programmatic RenderObject不因allocation存在而自动永久缓存。
   - 它们复用已验证resource/URL/template；prelude Popup仍引用package-owned player，request string完成后恢复。
   - `recreateReel:true`是显式replacement transaction，不修改manifest policy。

## 5. 职责与合同

- **Editor/CLI**：Editor负责authoring compiler、preview、latest-only export和旧版升级；CLI结构化保留、改写和回写v3。
- **RenderCore parser/upgrader**：runtime直接加载的version dispatch、old defaults、v3 parity、canonical owner key和deep freeze。
- **Package resource**：加载typed closure、持有v3 allocation与immutable prepare/lease registry，不创建canvas/display owner。
- **SceneLayoutRuntime**：按plan拥有全部authored node mutable instance、attachment和active commit。
- **SceneLayoutPackageRuntime**：reel entries、Popup maps、transition transaction、activation epoch和atomic mode switch。
- **Reel entry**：exact Symbols binding、catalog、reel、committed render scene和area layer；不拥有业务mode或server reel。
- **失败/清理**：prepare失败等待已启动工作收敛；candidate、nodes、Popup、active/dormant reel、template/texture leases按owner
  恰好一次destroy。unknown owner、busy/stale、double release显式失败。
- **禁止行为**：不信任坏v3、不运行时重算替代plan、不写第二份asset表、不hash/path alias mutable player、不placeholder/fallback。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/manifest-v3.ts
packages/rendercore/src/scene-layout/runtime-allocation.ts
packages/rendercore/tests/scene-layout/manifest-v3.test.ts
packages/rendercore/tests/scene-layout/runtime-allocation.test.ts
tasks/216-rendercore-game-mode-resource-retention-<utctime>.md
```

若Crave确需人工适配，额外只新增`docs/crave-task216-manual-migration.md`。

### 预计修改

```text
packages/rendercore/src/scene-layout/types.ts
packages/rendercore/src/scene-layout/manifest.ts
packages/rendercore/src/scene-layout/manifest-v2.ts
packages/rendercore/src/scene-layout/package-resource.ts
packages/rendercore/src/scene-layout/resource.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/src/scene-layout/runtime.ts
packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/src/symbol/package.ts
packages/rendercore/src/reel/render-reel-set.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/tests/scene-layout/manifest-upgrade.test.ts
packages/rendercore/tests/scene-layout/package-resource.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/tests/scene-layout/package-runtime-mode.test.ts
packages/rendercore/tests/scene-layout/runtime.test.ts
packages/rendercore/tests/spine/runtime-player.test.ts
apps/gamelayouteditor/src/{model/editor-project,io/exported-layout-zip,io/imported-layout-zip,ui/project-workspace}.ts
apps/gamelayouteditor/tests/{editor-project,zip-io}.test.ts
apps/gamelayoutpkgcli/src/{package-reader,package-writer,reference-rewriter,asset-groups}.ts
apps/gamelayoutpkgcli/tests/{reference-rewriter,asset-groups}.test.ts
packages/gameframeworks/src/scene-layout-template/index.ts
packages/gameframeworks/tests/scene-layout-template.test.ts
packages/rendercore/README.md
docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md
```

Popup/VNI/image-string生产文件只在counter证明重复prepare/unload时纳入；否则只补跨owner测试。

### 原则上不应修改

```text
apps/game002v2/**
assets/crave/**
assets/gamecfg002/**
apps/game003v2/**
assets/minecart2/**
assets/gamecfg003/**
packages/logiccore/**
packages/vnicore/**
package.json
pnpm-lock.yaml
```

若必须修改游戏/assets、loading协议、asset groups、root工具链或跨exact id共享mutable player，执行会话先停止说明。

## 7. 实施步骤

1. **冻结Minecart2资源账本与旧行为默认值**
   - 从typed manifest统计node kind/scope、variant active sets、shared roots、Symbols/Popup bindings、edges和runtime resources。
   - 用counter记录当前parse/load/create/destroy；账本只进fixture/报告，不进shared业务代码。

2. **实现v3与统一升级链**
   - 增加types/parser/canonical transition key/allocation compiler/parity checker。
   - runtime load入口让v1/v2先各自strict parse，再在RenderCore生成等价v3 default；原生v3必须完整显式。
   - 更新materialize、Game Frameworks latest消费及CLI collect/rewrite/package parser，保持旧production package可运行。

3. **接入Game Layout Editor latest-only authoring**
   - draft构造、mode/node/dependency/transition transaction统一重算allocation并strict validate。
   - import合法v1/v2时显示已升级v3；只读UI展示owner/mode分配；export/ZIP/stable JSON永远写v3。
   - Editor/CLI filename rewrite与optimization只结构化保留owner ids，不把physical path写入allocation。

4. **loading prepare与runtime稳定owner**
   - package resource消费v3 plan，preparepackage immutable roots和Spine template/refcount registry。
   - 100%后runtime按plan一次创建node/Popup/全部reel shells，initial scene只提交initial binding。
   - mode switch使用activation transaction，完成dormant、staged scene、forced replacement、layer/overlay和destroy合同。

5. **测试、文档与收尾**
   - 覆盖old defaults、bad v3 parity、Editor latest export、immutable/mutable边界、warm mode counter和async cleanup。
   - 更新README和三份长期规则；确认Crave/game003/assets零diff，非必要不生成Crave文档。
   - 运行L2验收并生成UTC中文报告。

## 8. 测试与验收

### 测试原则

- shared测试使用自包含fixture，不读取Crave/Minecart2生产美术。
- runtime直接加载v1/v2 fixture可运行，升级结果稳定/幂等且与等价原生v3同流程；坏v3 allocation显式失败。
- Editor新建、导入v1/v2、编辑mode/node/binding、filename rewrite、ZIP往返都只产出canonical v3。
- CLI rewrite/asset-group/package round-trip保留v3 allocation；Game Frameworks对v1/v2/v3得到等价latest mode语义。
- plan/counter证明每typed root一次prepare、每mutable owner独立、warm Base→Free→Base/Bonus→Base只新建transition player。
- reel覆盖same/multi binding、no-reel、uncommitted/committed target、staged scene、forced recreate、busy/stale/destroy。
- Spine shared template多个player的track/event/slot/destroy独立；不同skeleton即使共享atlas也不合并。
- async失败覆盖partial plan/registry cleanup、refcount、late settle和double release。

### 验收级别

`L2`。修改RenderCore schema/public behavior和Editor/CLI正式导出物，必须验证Game Frameworks等直接consumer及ZIP往返；
不改root工具链、lockfile或production assets，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test -- tests/scene-layout/manifest-v3.test.ts tests/scene-layout/runtime-allocation.test.ts tests/scene-layout/manifest-upgrade.test.ts tests/scene-layout/package-resource.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/package-runtime-mode.test.ts tests/spine/runtime-player.test.ts
pnpm --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks --filter game002v2 --filter game003v2 typecheck
pnpm --filter gamelayouteditor test -- tests/editor-project.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli test -- tests/reference-rewriter.test.ts tests/asset-groups.test.ts
git diff --check
```

六条命令分别证明RenderCore行为、Editor/CLI交付、Frameworks与两个游戏consumer兼容和diff卫生；不运行整仓验收。

### 人工验收

- Game Layout Editor导入当前Minecart2 v1，确认只读allocation显示42 node、一个Symbols owner、一个Popup owner和两个
  on-demand transition；不修改资源内容导出后manifest为v3，重导结果一致。
- 使用导出的临时v3包预览BaseGame→FreeGame→BaseGame、BaseGame→BonusGame→BaseGame：background、scoped/global node、
  6 Spine、4 image-string、reel、Popup无闪白/重复挂载/状态串扰/层级错误。
- performance/memory在首次runtime init后重复往返；stable template/node/Popup/reel/catalog create/destroy不增长，仅edge player
  变化。记录heap/GC趋势，不设硬阈值。
- Crave只做现有BaseGame↔FreeGame视觉回归，确认旧manifest默认allocation、trigger/final scene和Popup顺序不变；用户执行。

### 独立验收建议

`必须`。本任务涉及正式schema、Editor ZIP、resource ownership和异步destroy。重点复验：

1. `pnpm --filter @slotclientengine/rendercore test -- tests/scene-layout/manifest-v3.test.ts tests/scene-layout/manifest-upgrade.test.ts tests/scene-layout/runtime-allocation.test.ts`
2. `pnpm --filter gamelayouteditor test -- tests/editor-project.test.ts tests/zip-io.test.ts`
3. 人工完成Minecart2 v1→v3→重导与warm mode profile。

## 9. 环境与依赖

- 使用Node 24和pnpm；shell缺Node时执行`source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时用`CI=true pnpm install --frozen-lockfile`；仅下载实际失败后设置约定代理重试。
- 不新增依赖/lockfile；若需外部cache库或process-global manager，视为方案偏离。

## 10. 生成物、文档与规则

- 本任务不直接重导Minecart2/Crave production package，不修改assets map/YAML/生成物。
- README记录v3 schema、old defaults、allocation lifecycle、cached scene和transition例外。
- `scene-layout.md`记录latest v3、Editor-authored plan、package retain/dormant/exact identity。
- `editor-artifacts.md`记录v1/v2 import upgrade、draft transaction parity和latest-only v3 export。
- `shared-game-runtime.md`记录immutable template可共享、mutableplayer不可共享及统一release；不写游戏精确清单。

## 11. 执行报告

规划时不生成报告。执行后创建`tasks/216-rendercore-game-mode-resource-retention-<utctime>.md`，用
`date -u +%y%m%d-%H%M%S`取UTC。报告记录schema/default矩阵、Minecart2账本、counter差异、修改/验收和人工状态。

## 12. 风险、假设与待确认

### 风险

- explicit allocation重复表达部分mode refs；必须用Editor compiler + runtime parity确保不是漂移的第二份业务表。
- package retain以bounded内存换切换稳定；大型多binding包需profile，不能擅加LRU破坏scene恢复。
- shared Spine SkeletonData/atlas前必须证明immutable；否则只共享texture/validated bytes。
- 99% prepare过多CPU可能延长loading；DOM-free工作应计入真实进度且不提前创建display owner。
- old default若与历史runtime语义不一致会回归production旧包；v1/v2兼容fixture是发布gate。
- dormant仅detach会允许hidden mutation；activation epoch/stale gate不可省略。
- nested owner对同URL重复unload可能提前释放；package lease必须统一或证明底层refcount安全。
- staged scene提前apply、forced replacement别名和late Promise都可能破坏atomic/destroy，需要专门测试。

### 假设

- loading结束时strict package已具备完整typed refs，可决定allocation但不决定业务scene。
- Editor能从现有mode/node/binding/transition字段确定性生成plan，无需用户手工选择reuse group。
- Crave与Minecart2当前跨mode共享单一Symbols binding，v1 default可保持零迁移。

### 待确认

无。若Crave必须改变调用，停止直接修改并输出`docs/crave-task216-manual-migration.md`。

## 13. 完成清单

- [ ] v3 allocation schema、v1/v2 defaults和strict parity完成。
- [ ] Editor import升级、draft验证、只读预览与latest-only export完成。
- [ ] loading prepare、stable owner、dormant/activation和transition例外完成。
- [ ] Minecart2代表拓扑按正确immutable/mutable层复用。
- [ ] 游戏app/assets零修改；必要Crave适配仅人工文档。
- [ ] 自动化、独立/人工验收、README/规则和UTC报告完成。

## 14. 执行会话交接

1. 读取根`AGENTS.md`、本计划及六份领域规则，核对HEAD/status。
2. 先冻结v1/v2兼容默认和Minecart2账本，再实现v3；不得先改runtime后补schema。
3. Editor生成allocation，RenderCore strict执行；不在runtime维护第二套推断。
4. loading只prepareDOM-free immutable资源，100%后才创建display owner。
5. exact typed identity共享immutable层，mutableplayer始终独立；保留transition/Popup原子语义。
6. 不修改Crave/game002v2/game003v2或production assets；必要Crave适配只写人工文档。
7. 运行L2与独立验收并生成UTC报告；除非用户明确要求，不commit/push/创建PR。
