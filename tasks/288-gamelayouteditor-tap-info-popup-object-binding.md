# 288 gamelayouteditor-tap-info-popup-object-binding 任务计划

## 1. 目标与完成定义

### 目标

在 Game Layout Editor 的项目配置中增加一个可选的全局 `tap info` Popup Object 绑定。用户先从“资源”入口导入任务 286 定义的
`<name>-popup-object.zip`，再在项目页显式选择其中一个对象；未选择时不写配置、不打包对象，也不改变任何 Popup 的现有表现。

Scene Layout runtime 打开普通 Spine Popup 时，同时检查该 Popup 是否具有任务 287 的 `spine.tapInfoObject.attachment`，以及当前 Game Layout
是否配置了 tap info Popup Object。两者都存在时，由 RenderCore 创建独立对象实例并挂到 exact 主 Spine slot 或 exact VNI text layer；任一条件不存在时保持
现有 Popup 流程，不猜对象、父节点或默认 root。

### 完成定义

- [ ] Game Layout Editor 可从资源上传入口严格导入、审查、替换和删除独立 Popup Object ZIP；项目页可从已导入对象中选择一个，或明确选择“未配置”。
- [ ] 新建项目和旧 Scene Layout v1–v7 导入默认未配置；配置后导出、重开和再次导出精确保留所选对象，清空后完全省略字段与对象 payload。
- [ ] Scene Layout latest v7 增加一个可选、单值、typed tap info object binding；mapped filename-key、production directory package、URL/delivery 和 ZIP
      都按 exact Popup Object transitive closure 解析，不扫描任意 JSON、不保留 orphan。
- [ ] Scene Layout package resource 只准备一份 package-owned immutable Popup Object definition；每个同时具备 mount metadata 的 Spine Popup player 创建独立
      mutable instance，多个 Popup 不共享 Container、动画状态或文字 override。
- [ ] 外部对象与同一 slot/VNI text layer 上的既有 Popup overlay 共用 RenderCore official attachment owner；对象以确定性的尾部 sibling 顺序挂载，不创建第二个
      slot owner、不绕过 VNI public mount seam，也不增加可配置 order/transform。
- [ ] 对象在 Spine Popup `start` 时启动，在 `start`/`loop` 期间随宿主每帧恰好 update 一次；进入 `end` 前停止并隐藏，complete、immediate dismiss、init failure
      和 destroy 都解除挂载并清理实例，不延长或接管 Popup completion/input。
- [ ] 仅配置对象但 Popup 没有 `tapInfoObject`、或 Popup 有 mount 但项目未配置对象，均是合法 no-op；非法对象 ZIP、悬空 layout binding、缺 payload、坏 exact target
      或实例 init/attach 失败必须显式失败且不留下半提交画面。
- [ ] 普通 Spine Popup 的 start→loop→end、点击规则、内嵌 object layers、三类 Popup 的既有 API、Popup v9/Object v1 schema 和未配置 Scene Layout v7 行为不回归。
- [ ] 完成 L2 定向自动化、真实浏览器人工验收、最小长期文档/领域规则更新，并在执行后生成任务 288 UTC 中文报告。

## 2. 范围

### 包含

- `packages/rendercore/popup/core` 的 resolved Popup Object prepare seam、Spine Popup 外部对象注入、official attachment 合并、activation/update/cleanup/destroy。
- `packages/rendercore/scene-layout/data` 的项目级可选 tap info object binding、strict v7 parsing、latest normalization、immutable structure 与 exact direct closure。
- Scene Layout package resource/runtime、production ZIP、URL loader和 delivery 对独立 Popup Object definition 的 prepare、共享与释放。
- `apps/gamelayouteditor` 的 Popup Object ZIP 导入/namespace/review、dependency draft、项目页选择、替换/删除、导出/重开、preview 接线与 diagnostics。
- Popup Object、Scene Layout、Game Layout Editor 的直接测试、README/manifest 文档和最小领域规则更新。

### 不包含

- 不修改 Popup Editor 的 Popup Object authoring，也不修改任务 287 的 mount 候选或 Popup manifest字段。
- 不把对象复制进每个 Popup ZIP，不新增普通 Popup overlay，不以内联 JSON、特殊 layer id/name 或 filename 约定表达 tap info。
- 不允许为不同 Popup、mode、transition 或 variant 选择不同对象；本任务只有一个 project-wide optional binding。
- 不给外部对象增加 transform、alpha、order、visibleStates、translation、金额、点击命中或独立 completion 配置；这些视觉内容由 Popup Object 工件和父节点持有。
- 不向 runtime address catalog 暴露 tap info 对象或其内部 child，不把它合入 Popup `objects/getObject(id)` registry。
- 不扩展到 award-celebration、single-state Popup 或普通 Scene node，不修改游戏业务触发、GameFrameworks facade、游戏 assets、根工具链、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-09-02T09:40:27Z
HEAD: 5c9b6356a4c5fe0c918e1a151b607a5ad1019790
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `docs/agent-rules/scene-layout.md`
- `docs/agent-rules/editor-artifacts.md`
- `docs/agent-rules/shared-game-runtime.md`
- `tasks/286-popupeditor-reusable-popup-objects.md` 及执行报告
- `tasks/287-popupeditor-spine-tap-info-object-parent.md` 及执行报告
- `docs/popup-manifest.md`、`docs/popup-object-manifest.md`、`docs/scene-layout-manifest.md`
- `apps/gamelayouteditor/README.md`、`packages/rendercore/README.md`
- Game Layout Editor project/import/export/project-workspace/preview，以及 RenderCore Popup Object、Spine Popup、Scene Layout manifest/package resource/runtime 当前实现与定向测试

`apps/gamelayouteditor` 与 `packages/rendercore` 下没有补充 `AGENTS.md`。执行时先重核状态，并保留届时出现的用户无关修改。

当前结论：

- `packages/rendercore/src/popup/data/types.ts#SpinePopupManifestV9.spine.tapInfoObject` 已能 strict 描述主 Spine slot 或当前 VNI overlay exact text layer，
  `package-resource.ts` 也会在 display mutation 前验证 target；它刻意不包含对象来源、transform、order或生命周期。
- `packages/rendercore/src/popup/object-runtime.ts#createPopupObjectInstanceRuntime()` 已把 prepared object 转成 per-instance mutable runtime；任务 286 的 Popup layer runtimes
  已证明 init/activation/update/destroy 语义，但当前只接受 Popup package 内部 resource。
- `packages/rendercore/src/popup/spine-player.ts#createSpinePopupRuntime()` 当前只从 Popup package 创建主 Spine和overlays，不读取 `tapInfoObject` metadata，也没有外部
  prepared object输入；`objects/getObject()`只注册manifest中具备exact layer id的内嵌对象。
- `packages/rendercore/src/popup/layer-attachment.ts#attachPopupLayerRuntimes()` 已按exact parent把同slot/VNI children合并成单一owner group。外部tap info必须进入同一
  group；再次直接调用`attachSlotObject()`会违反一slot一owner并破坏同父顺序。
- `packages/rendercore/src/scene-layout/types.ts#SceneLayoutManifestV7` 和 `SceneLayoutPopupBinding` 当前只有顶层 Popup packages，没有 project-wide Popup Object
  binding；`collectSceneLayoutAssetPaths()`、package closure、URL loader、production ZIP和delivery也不会收集独立`popup-object.manifest.json`。
- `SceneLayoutPackageResource` 当前拥有 Symbols、Popup packages与runtime resources；`DefaultSceneLayoutPackageRuntime.preparePopup()`缓存每个Popup player，并是把
  project-owned prepared object传给普通Spine Popup runtime的正确组合边界。
- `apps/gamelayouteditor/src/model/editor-project.ts#EditorProject` 只有普通资源、Symbols dependencies和Popup dependencies；项目页没有tap info配置，资源ZIP识别
  sentinel也不含`popup-object.manifest.json`。
- `apps/gamelayouteditor/src/io/exported-layout-zip.ts`与`manifestToEditorProject()`已按manifest正向重建exact dependencies；新增对象必须走RenderCore typed collector/
  namespace helper，不能把未选对象作为ZIP extra保留下来。
- 现有代码、任务286/287合同与测试已足以制定计划，不需要审计完整Git历史。

## 4. 需求解释与技术决策

### 需求解释

1. “项目配置里单独配置一个 Popup 子物体”解释为一个 Game Layout 全局、可选、单值的 tap info object binding；对象不是第四种 Scene Layout Popup，
   也不是某个 Popup dependency 的内容。
2. “ZIP 需要自己在 assets 里导入然后选择”表示导入只加入 dependency library，不自动绑定；项目页必须显式选择。未选对象可留在当前 authoring session，
   但不会进入 exact production ZIP，重新打开导出物时也不会恢复 orphan dependency。
3. “弹窗弹出时判断”只适用于普通 Spine Popup，因为只有它拥有任务287的metadata。对象实例在player init阶段prepare/attach，在每次Popup start时重启，
   从而兼容Scene Layout缓存player而不在每次打开重复解码资源。
4. tap info只应在可继续交互前的表现阶段存在：随`start`启动、跨`loop`保持，在正式`end`开始前立即停用；父slot/VNI节点仍可进一步控制实际可见性。
5. 两项可选配置必须相交才产生画面；单边存在不是配置错误，也不得fallback到root、首项、同名对象或唯一导入对象。

### 关键决策

1. **Scene Layout v7新增独立、窄的项目级binding。**
   - canonical形状为`tapInfoObject?: { manifest: string }`；不保存name副本、Popup id、transform、order或target。业务identity来自nested Object manifest的exact`name`。
   - mapped编辑工件使用安全filename key；production directory固定走typed `dependencies/popup-objects/<name>/popup-object.manifest.json`，并在closure边界核对目录name。
   - 沿用任务286/287的workspace lockstep前提，latest保持v7；v1–v6升级和未配置v7不生成字段。若执行发现必须让旧独立v7 strict reader无升级读取新工件，
     则需改为v8并先说明范围，不能放宽unknown-field校验。
2. **Editor分离“已导入对象库”和“当前选择”。**
   - draft增加按object exact name索引的dependencies，以及nullable selected name；导入同名走显式replace并保持选择，different name形成新候选。
   - 导入器以`popup-object.manifest.json` sentinel区分对象ZIP，复用RenderCore parse/resolve/closure/namespace/prepare，collision review后才原子合并bytes。
   - 删除已选对象先显式拒绝或要求用户清空绑定；替换失败保留旧bytes、selection、manifest preview和preview runtime。
3. **Scene Layout package拥有definition，Popup runtime拥有instance。**
   - Popup core提供“already-resolved exact object closure → `PopupPreparedObject`”能力；Scene Layout package resource准备并拥有一份definition，destroy负责最终释放。
   - 每个eligible `SpinePopupRuntime`调用`createPopupObjectInstanceRuntime()`创建自己的mutable instance；Scene Layout不操作Container内部child，也不把实例存进共享definition。
4. **挂载合并到official attachment transaction。**
   - `createSpinePopupRuntime()`接收可选external prepared object；仅当manifest mount与option都存在时创建supplemental child。
   - attachment helper把supplemental child与已有overlays一次性按parent建组、一次性attach；tap info放在同父authored children之后，确保确定性且无需伪造layer/order。
   - init或attach任一步失败都逆序detach并destroy instance/overlays/player；成功前不发布可播放runtime。
5. **生命周期服从Spine Popup，不新增状态机。**
   - `start()`重启对象；`update()`只在对象active时随宿主调用一次；`requestDismiss()`在切换到end前停用；complete、dismissImmediately和destroy幂等清理。
   - object playback、文字和粒子不影响start/loop/end完成判断，也不接受独立input/ticker/RAF。
6. **不扩张programmatic/public identity。**
   - tap info实例不进入`objects/getObject()`、string registry、runtime address或event catalog；它没有layout-side instance id，避免与任务286的宿主layer identity混淆。
   - Game Layout Editor preview继续构造正式Scene Layout package resource/runtime，直接验证真实导出合同，不创建placeholder或app私有绑定逻辑。

## 5. 职责与合同

- **Popup data**：继续只拥有Object v1和Spine mount metadata；本任务不改schema。
- **Popup core**：拥有resolved object prepare、per-player instance、supplemental attachment、start/update/stop/detach/destroy；不决定对象来源。
- **Scene Layout data**：拥有project-wide optional binding、safe path、strict version/unknown-field、direct reference和immutable structure。
- **Scene Layout package resource**：拥有exact nested closure、prepared definition及rollback/destroy；mapped/direct/URL/delivery必须得到同一canonical对象。
- **Scene Layout package runtime**：在创建Spine Popup player时传入package-owned definition；普通Popup FIFO、input、placement和completion保持唯一owner。
- **Game Layout Editor**：拥有imported dependency library、selection、replace/delete transaction、project UI、ZIP vendoring和preview；不解析对象内部layer或操作display tree。
- **资源生命周期**：definition由package resource拥有，instance由对应Spine Popup runtime拥有；runtime先销毁全部instances，package resource再释放共享纹理/字体/VNI/Spine资源。
- **失败策略**：unknown field/version、unsafe path、name/path不一致、缺root/payload、extra/orphan、collision、坏nested resource、stale selection、attach target或init失败均显式失败。
- **禁止行为**：不扫描名字`tap-info`、不按唯一候选自动选择、不复制对象到Popup resources、不用raw Pixi parent、不吞掉失败后当作“未配置”。

## 6. 文件范围

### 预计新增

```text
apps/gamelayouteditor/src/io/imported-popup-object-package.ts
apps/gamelayouteditor/tests/popup-object-package.test.ts
tasks/288-gamelayouteditor-tap-info-popup-object-binding-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/core/{index,package-resource}.ts
packages/rendercore/src/popup/{spine-player,layer-attachment}.ts
packages/rendercore/tests/popup/{popup-object,layer-attachment,spine-player}.test.ts

packages/rendercore/src/scene-layout/{types,manifest,manifest-v7,package-resource,package-runtime,production-zip}.ts
packages/rendercore/src/scene-layout/data/index.ts
packages/rendercore/tests/scene-layout/{manifest-v7,manifest-upgrade,package-resource,package-runtime,production-zip,delivery-manifest}.test.ts

apps/gamelayouteditor/src/model/{editor-project,game-mode-commands}.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/ui/{app-shell,project-workspace}.ts
apps/gamelayouteditor/tests/{app-shell,layout-preview,zip-io}.test.ts

docs/{scene-layout-manifest,popup-manifest,popup-object-manifest}.md
apps/gamelayouteditor/README.md
packages/rendercore/README.md
docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md
```

若delivery实现需要在现有owner graph中显式加入该global dependency，可最小修改`packages/rendercore/src/scene-layout/data/delivery.ts`及其直接测试；若导出
namespace需要公共Popup Object rewrite helper，可在`packages/rendercore/src/popup/package-resource.ts`补typed adapter。执行时以实际调用链为准，不为文件列表机械造改动。

### 原则上不应修改

```text
packages/rendercore/src/popup/data/{types,manifest,object-manifest}.ts
apps/popupeditor/**
packages/vnicore/**
packages/gameframeworks/**
apps/gamelayoutpkgcli/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若执行需要Scene Layout v8、Popup v10/Object v2、per-Popup选择、public runtime address、游戏facade、依赖或lockfile，必须先说明需求证据和兼容影响，不能修改计划
来事后合理化。

## 7. 实施步骤

1. **重核基线并固定schema失败矩阵**
   - 重核HEAD/status、任务286/287最终合同和三份领域规则。
   - 先增加v7字段省略/合法binding、unknown key、unsafe path、旧version夹带和nested name/path不一致测试；证明旧v1–v7规范化无隐式对象。
2. **建立Scene Layout tap info object data与closure合同**
   - 在types/manifest/v7 normalization中加入窄binding，并把它纳入immutable structure、direct asset collection和strict canonical validation。
   - 扩展mapped/direct package closure、production ZIP、URL fetch与delivery owner routing，递归使用Popup Object typed collector；selected object是global package dependency，
     不伪装成Popup binding或runtime resource。
3. **提供production object prepare与ownership**
   - 从任务286已有逻辑抽取resolved exact closure prepare seam，确保object manifest转single-state definition时仍由同一parser/validator负责。
   - Scene Layout package prepare中创建单一`PopupPreparedObject`，失败回滚已启动资源；成功后由package resource公开只读definition并在destroy释放。
4. **接入Spine Popup supplemental instance**
   - 扩展Spine runtime factory option，条件性创建per-player object instance；未同时满足layout option和Popup mount时不创建。
   - 扩展attachment transaction，把对象放进exact main slot或VNI text owner group的尾部；覆盖已有同父overlays、attach失败rollback和destroy detach。
   - 接入start→loop→end生命周期、update once、immediate cleanup与player reuse，且不加入object/string/address registry。
5. **接入Scene Layout runtime组合边界**
   - `preparePopup()`只向普通Spine factory传project definition；award/single-state factory和普通Popup package资源保持不变。
   - 覆盖FIFO多次打开、多个Spine Popup各自实例、单边配置no-op、init失败不缓存player及runtime/resource destroy顺序。
6. **实现Game Layout Editor对象导入库**
   - 新增standalone Object ZIP导入器，加入sentinel识别、exact closure、namespace/collision review、atomic import/replace/delete和asset GC。
   - Editor draft增加dependencies与nullable selection，补clone/new/import/export/diagnostics；只把selected dependency写入manifest与production closure。
7. **实现项目页选择和正式preview**
   - 项目页展示已导入Popup Object数量、exact name select、“未配置”选项及删除/替换状态提示；导入不自动选第一项。
   - DOM测试经真实upload/select/change transaction操作；preview使用正式Layout package/runtime显示eligible Popup中的对象，清空配置后重建并移除。
8. **文档、人工验收与收尾**
   - 更新Scene Layout manifest、Popup/Object文档、两份README与最小领域规则，明确双条件、global binding、尾部顺序和ownership。
   - 按第8节运行L2定向验收，检查diff与旧字段/旁路残留，生成任务288 UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- 用self-contained Popup Object、main-Spine slot和VNI text fixtures；不读取游戏`assets/`，不以fake placeholder冒充正式实例。
- 正常路径覆盖main slot、VNI text、同父已有overlay、多个Popup各自实例、player复用和ZIP round-trip。
- 边界覆盖两种单边配置no-op、未选对象不导出、同名replace、删除selected拒绝、bad closure/path/name、prepare/attach failure rollback与destroy。
- 生命周期测试明确断言start启动、loop继续、end前停止、update恰好一次以及object completion不改变Popup phase。
- mapped Editor ZIP、direct production ZIP、URL/delivery至少各有一个typed closure用例；不得只验证manifest JSON而遗漏nested image-string/VNI/Spine payload。

### 验收级别

`L2`：新增Scene Layout v7 public schema字段和跨包resource ownership，直接影响Popup core、Scene Layout package/runtime、Game Layout Editor、production ZIP与delivery。
范围可由直接依赖链界定，不修改根工具链、lockfile或release，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/popup-object.test.ts tests/popup/layer-attachment.test.ts tests/popup/spine-player.test.ts tests/scene-layout/manifest-v7.test.ts tests/scene-layout/manifest-upgrade.test.ts tests/scene-layout/package-resource.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/production-zip.test.ts tests/scene-layout/delivery-manifest.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/popup-object-package.test.ts tests/zip-io.test.ts tests/app-shell.test.ts tests/layout-preview.test.ts
pnpm --filter gamelayouteditor build
pnpm exec prettier --check packages/rendercore/src/popup packages/rendercore/src/scene-layout packages/rendercore/tests/popup packages/rendercore/tests/scene-layout apps/gamelayouteditor/src apps/gamelayouteditor/tests docs/scene-layout-manifest.md docs/popup-manifest.md docs/popup-object-manifest.md apps/gamelayouteditor/README.md packages/rendercore/README.md docs/agent-rules tasks/288-gamelayouteditor-tap-info-popup-object-binding.md
git diff --check
```

- 第一条保护Popup core、Scene Layout data/core/editor与Game Layout Editor直接consumer的public type。
- 第二、三条分别使用正式package Vitest config；第四条验证browser production bundle与preview入口。
- Prettier只检查计划改动面，执行时按实际文件收窄；失败先最小化到schema、closure、attachment或Editor transaction，不运行根级全量任务。

### 人工验收

1. 在Popup Editor准备一个含明显动画/文字的Popup Object ZIP；在Game Layout Editor资源页导入，确认项目页出现候选但不会自动选中，未选择时导出ZIP不含对象。
2. 导入一个配置main-Spine slot mount的普通Spine Popup，选择对象并在preview打开；确认对象随start出现、loop持续、点击进入end时消失，重复打开会从头启动。
3. 用VNI text mount Popup复验exact父节点；再加一个同父普通overlay，确认两者都存在且tap info稳定位于同父尾部，没有slot owner冲突。
4. 清空项目配置后重开相同Popup，确认无对象且原start→loop→end不变；替换对象为坏ZIP/缺资源版本时确认失败并保留旧preview。
5. 导出Scene Layout ZIP并重开，确认selection保持、nested closure完整；删除已选对象被拒绝，先清空后可删除且bytes被正确GC。

### 独立验收建议

`建议`：涉及跨包public schema、nested正式ZIP、共享definition/per-player instance ownership和异步attach rollback。独立验收重点复查：

1. object只准备一份、每个Popup instance独立且destroy顺序正确；
2. 同slot/VNI既有children与supplemental object只有一个official owner group；
3. mapped/direct/delivery exact closure没有orphan或raw JSON旁路。

最多复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/spine-player.test.ts tests/popup/layer-attachment.test.ts tests/scene-layout/package-resource.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/popup-object-package.test.ts tests/zip-io.test.ts tests/layout-preview.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的Node 24与pnpm；shell无Node时执行`source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改package manifest或lockfile；Popup Object parse/ZIP/namespace/prepare均复用现有workspace能力。

## 10. 生成物、文档与规则

- 本任务没有YAML或手工生成TypeScript；如执行发现production/delivery生成物，必须用正式generator并运行对应`--check`，禁止手改。
- 更新`docs/scene-layout-manifest.md`记录optional binding、path/closure和旧版本边界；更新Popup/Object文档记录外部consumer的双条件与生命周期。
- 更新Game Layout Editor/RenderCore README说明导入选择、preview和runtime ownership。
- 只把稳定职责边界加入`scene-layout.md`、`editor-artifacts.md`、`shared-game-runtime.md`；不把对象文件清单或任务证据复制进根`AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/288-gamelayouteditor-tap-info-popup-object-binding-<utctime>.md
```

UTC用`date -u +%y%m%d-%H%M%S`取得。报告简要记录最终实现/文件、关键决策与偏差、实际命令结果、未完成人工验收和剩余风险；不收集无关coverage、
整仓历史矩阵或profiler数据。

## 12. 风险、假设与待确认

### 风险

- Popup Object可能含纹理、字体、VNI或Spine；共享prepared definition与多个mutable instance的边界错误会造成状态串扰、重复释放或Object URL/纹理泄漏。
- main slot已被普通overlay使用时若不合并owner group，会直接触发一slot一owner冲突；VNI text层的多child清理也必须保持逆序和identity-safe。
- Editor mapped ZIP、production directory ZIP和CDN delivery有三条物理路径；任何一条只收object root不收nested closure都会产生线上缺资源。
- v7新增optional字段沿用lockstep策略；旧的独立strict v7 reader会把新字段视为unknown，需要与本任务reader同步发布。

### 假设

- 一个Game Layout只需要一个全局tap info对象；若未来需要per-Popup/per-mode/per-locale选择，应另行扩展typed binding，不在本任务预埋map或fallback。
- tap info表现与既有continue提示一致，在Spine Popup start/loop活跃、进入end前停止；对象自身不处理点击，点击仍由Popup唯一input owner驱动。
- Popup Object authored原点就是mount-local原点，因此layout不需要额外transform；同父尾部顺序足以表达第一版需求。
- 未选择的imported object只是当前authoring workspace素材，不属于production closure；导出再打开后丢弃它与现有未引用dependency策略一致。

### 待确认

- 无阻塞待确认项。若用户期望tap info只在`loop`才启动、需要per-Popup对象或需要layout侧transform/order，属于可观察合同变化，执行前应先更新需求决策而不是自行推断。
