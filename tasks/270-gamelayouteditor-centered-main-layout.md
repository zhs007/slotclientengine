# 270 gamelayouteditor-centered-main-layout 任务计划

## 1. 目标与完成定义

### 目标

在任务269已统一普通图层横版/竖版placement的基础上，把Scene Layout收敛为唯一中心坐标与横竖屏几何合同：移除background特殊binding、`artSize`、坐标类型切换和game mode类型；只保留主转轮区域`main`，把`focusRect`放入每个mode的`main`横竖配置。背景改为可有零至多个的普通scene node。

同时移除本仓已弃用的game002/game003 app、专属Symbols Viewer、production/symbol资产及专属脚本和大型夹具；保留`assets/gamecfg002`、`assets/gamecfg003`与全部长期文档，并让仍有价值的Editor/RenderCore测试改用package-local最小数据。

Scene Layout latest升级为v7；新runtime/Editor读取合法v1–v7并经共享upgrader规范化，Editor只维护、预览和导出canonical v7。

### 完成定义

- [ ] v7不含`coordinateOrigin`、`artSize`、`adaptation`、`backgroundNodes`、mode类型、`reelPlacements`或`frameFocusRect`；原生v7出现旧字段时strict失败。
- [ ] v7图片/VNI以资源/舞台中心、main以矩形中心定位；Spine沿用skeleton authored origin `(0,0)`，image-string沿用显式anchor，不从bounds或当前帧猜中心。
- [ ] 每个mode拥有`main.variants.landscape/portrait`，每侧保存main center、`focusRect`和可选`minFocusMargin`；focus与main共用无界中心平面。
- [ ] 背景不再有专属schema/player/Inspector/readiness/order；普通图层通过L/P placement、mode/variant scope与order表达零至多个背景效果。
- [ ] `nodes: []`合法；没有背景或普通图层时，只要root main grid与各mode main/focus合法，runtime、Editor preview、mode切换和导出正常。
- [ ] 新runtime/Editor读取v1–v7：旧`default`深复制到L/P，旧双方向保持；background binding转普通图层scope，top-left/center按资源语义无损转换。
- [ ] canonical v7 snapshot/geometry/mask/anchor/frame policy不暴露或依赖Scene Layout `artSize`，不再提示必须填写artSize/背景。
- [ ] 新项目/mode无需类型，创建对象独立但数值相同的L/P main/focus，main center默认`(0,0)`；preview/ZIP恒写v7且重导幂等。
- [ ] Gamelayout package CLI、Gameframeworks与Game Viewer/Viewer2等直接consumer读取新合同；既有v1–v6 production package无需先经Editor重导。
- [ ] 本仓不再包含game002/game003 app、专属Symbols Viewer、资产、mapped fixture、构建入口或活动规则；lockfile、共享测试和文档无悬空引用。

## 2. 范围

### 包含

- Scene Layout v7 source/latest types、strict parser、v1–v6→v7 upgrader、runtime allocation、public exports。
- center-only authored coordinate、main/focus geometry、viewport/frame、snapshot、anchor、scene clip 与 variant event。
- former background node 的普通图层迁移、mode×orientation 可见 scope、runtime visibility 与资源闭包。
- Game Layout Editor 的 draft、新建/复制/导入/导出、mode 管理、Layout/Project/Resource Picker、preview/guide。
- Gamelayout package CLI的v7 version/reference/group识别；Gameframeworks template适配art-size-free frame policy。
- 删除game002/game003专属app/Symbols Viewer、production asset、asset-group、mapped fixture和builder；保留并更新规则/文档，更新lockfile、`.gitignore`、根规则和共享测试。
- RenderCore、Editor、CLI、Gameframeworks 和直接 consumer 的定向测试、README、领域规则与执行报告。

### 不包含

- 不删除rendercore background、Popup或通用viewport自身的独立`artSize`；“彻底移除”限定为Scene Layout v7、Editor、runtime API和consumer数据流。
- 不删除v1–v6 strict parser读取旧包所需的legacy `artSize`/adaptation；字段仅供upgrader输入，不泄漏进v7/Editor/runtime。
- 不改变 Symbols、Popup、audio、runtime resource、transition 状态机、reel spin、server 数据或 loading ownership。
- 不把普通图层的视觉用途重新分类为 background，不按 order、资源名、尺寸或 node id 猜背景。
- 外部`/Users/zerro/gitee.com/{pixicrave,piximinecart2}`只允许同步受影响的共享代码与直接调用点；两仓各自的`assets/**`禁止删除或改写。
- 不删除通用standard/grid-cell、Popup、Symbols、VNI或editor能力；不能因旧游戏consumer消失而缩减共享public API。
- 不删除`tasks/**`历史计划、报告和证据，不删除`docs/**`或`assets/gamecfg002`、`assets/gamecfg003`，不清理game001/game004或无法证明属于game002/game003的资产。
- 不新增依赖，不修改根工具版本；`pnpm-lock.yaml`仅由pnpm移除三个workspace importer及其孤立snapshot并复验无额外漂移。

## 3. 制定计划时的基线

```text
UTC: 2026-08-30T05:40:18Z
HEAD: f851396d9f45fb0ff0aaae0fbab3f9de3c864d02
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

- 已读取根`AGENTS.md`、`docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime,game002,game003,loading-ui}.md`及两个外部仓库根规则；game/loading规则用于删除审计，目标app/package无额外规则。
- 任务269已将latest升为v6：普通node使用可独立缺失的L/P placement；snapshot仍分geometry/orientation variant，旧`default`复制到两侧。
- `types.ts`仍以`SceneLayoutModeAdaptation`保存artSize/focus，以`backgroundNodes`/`reelPlacements`保存背景/main；v2 materialization强制image/Spine背景，v6/allocation v2仍分类background。
- `geometry.ts`的frame已只依赖focus/margin/page aspect，但snapshot、main/node换算、art mask、art selector与`applyArtSpace()`仍依赖artSize。
- Editor draft仍保存EditorMode、三类variant、artSize、background与coordinateOrigin；UI还有背景Inspector、mode/坐标类型和“必须填写背景art size”错误。
- `coordinate-origin.ts`证明top-left数据需先平移到art中心，image/VNI再加资源半尺寸、main再加grid半尺寸；Spine/image-string不猜bounds。
- Gameframeworks仍读取`adaptation.*.artSize`；CLI和RenderCore package/delivery/runtime仍有`version===6`枚举。
- 外部piximinecart2仍读adaptation/artSize，pixicrave仍调用art selector；两仓用各自workspace RenderCore，只在直接依赖确有需要时同步共享代码和调用点，且不修改各自assets。其center-origin v5 delivery验证legacy upgrader要求。
- app/assets主体待删约51MB/635个tracked文件：两个v2 app、专属Symbols Viewer、九个game asset roots、两套mapped fixtures及asset-group JSON。
- task131/132/135/147 builders及`test-utils/minecart2-fixtures.ts`也绑定旧游戏，必须删除或中性替换，不能删目录后skip测试。

## 4. 需求解释与技术决策

### 需求解释

1. 用户所说 `forcerect` 按仓库现有正式名称解释为 `focusRect`，不新增拼写不同的第二个字段。
2. “全部中心坐标系”表示 v7 只有一个无界 authored 坐标平面：新项目 main center 是 `(0,0)`；图片/VNI
   的几何中心、main 矩形中心、Spine authored origin 和 image-string authored anchor 分别落在 placement `x/y`。VNI project
   自身继续使用既有中心原点并保持只读；VNI JSON版本、schema、字段和文件内容不在任务范围内。
3. “game mode 不需要类型”表示 v7 mode 不再声明 adaptation mode；所有 mode 都有 L/P 两侧配置，方向仍只由
   宿主原始 page width/height 决定，正方形保持当前方向、首次为 landscape。
4. `main.enabled=false` 只关闭主转轮 presentation、Symbols binding 和业务 API，不删除 main/focus 几何；Splash
   等无转轮 mode 仍使用必填 main/focus 计算 viewport，因此不需要 background 或 art bounds 才能显示。
5. 背景成为普通 node 后，一个 node 有双侧 placement 可表现同一背景，两 个 node 各保留一侧 placement 可表现
   横竖两张背景；两侧都缺失仍非法，但整个 `nodes` 数组可以为空。
6. “旧版本正常读取”指新 runtime/Editor 对每个合法 v1–v6 先按源版本 strict parse，再原子升级为 v7；
   不承诺旧版二进制读取未来 v7，也不通过宽松 parser、字段 alias 或 runtime fallback 兼容。
7. “导出最新版本”指 Game Layout Editor 的 manifest preview 和 production ZIP 恒写 v7。CLI 可读取/优化旧包并
   保持既有发布物版本策略，不强制重发外部或保留旧包；从Editor输入的新包自然保持v7。
8. “移除game002/game003相关项目和assets”包含两个game app及已确认删除的专属Symbols Viewer，并清理production资产、fixtures、脚本与引用；`assets/gamecfg002`、`assets/gamecfg003`、全部`docs/**`和历史`tasks/**`保留，外部两仓assets不删除。测试先按价值裁剪，再用所属package的最小数据证明行为，不允许skip或复制旧美术换名。

### v7 canonical 数据决策

1. **root 只保留一个 typed `main` grid definition。**
   - 把现有 `reels.main` 收敛为 root `main`，保留 `order/columns/rows/cellSize/gap`；v7 不接受其它 reel id。
   - 每个 `gameModes.modes[*].main` 保存 `enabled` 与 exact `variants.landscape/portrait`。每侧包含
     main center `x/y`、同坐标平面的 `focusRect` 与可选 `minFocusMargin`。
   - 删除 mode `adaptation`、`reelEnabled`、`reelPlacements`、`backgroundNodes` 和 `frameFocusRect`。
2. **focus 与 main 相邻但不伪造包含关系。**
   - Editor 继续用四边 offset 编辑并派生 canonical absolute `focusRect`；移动/改变 grid 后同步重算。
   - 为兼容现有合法输入，不新增“focus 必须包含 main” gate；负坐标、越界与向内 offset 按实际几何显示。
3. **普通 node 拥有全部图层可见性。**
   - v7 用 generic mode×orientation scope 取代 singular `gameMode` 和 background binding：字段缺失表示在所有 mode
     中按现有 L/P placement 生效，显式 scope 精确表达哪些 mode/方向可见。
   - 该矩阵使任意合法旧 background 复用关系都能无损迁移，不需要复制 node、改 id、建立 runtime alias 或丢失地址 identity。
   - runtime allocation 升为 v3，只从 node placement/scope、main enabled、Symbols/Popup/transition/resource 引用生成。
4. **runtime 直接消费 v7，不再物化带 adaptation 的 v1 view。**
   - package resource 在发布给 runtime 前统一规范化为 v7；legacy source 信息只用于错误标签和 upgrader。
   - geometry variant 与 orientation variant 合并为单一 L/P `variantId`；snapshot 移除 `artSize` 和重复
     `orientationVariantId`，`ResolvedSceneLayoutReelGrid.artRect` 改为 `layoutRect`。
   - 删除有限 art mask、`applyArtSpace()` 与 `getLayoutPoint({kind:"art"})`；保留 origin/viewport point，并增加
     `kind:"main"` 九宫格 selector。canvas/viewport 自身仍负责最终可见裁切。
5. **frame consumer 只读 focus/main policy。**
   - `createSceneLayoutFramePolicy()` 与 frame viewport helper 直接从 v7 mode/main L/P 解析，不再返回 adaptation union。
   - Gameframeworks 的 Scene Layout template 不再要求从 manifest 提供 art design size；有 frame policy 时由当前页面与
     selected focus 派生逻辑 frame。
6. **弃用游戏清理不改变共享能力。**
   - 删除两个game app和只提供game002/game003硬编码catalog、无通用导入能力的Symbols Viewer；pnpm生成lockfile。
   - 保留strict parser/upgrader、package closure/path rewrite、atomic import/export、Spine/VNI/atlas introspection等高价值行为测试；删除具体symbol数量/名称、动画名、reel/paytable和production路径等内容断言。
   - fixture归属消费它的app/package `tests/fixtures`或同测试TS helper，不建全仓共享美术库；跨包只有public contract，不共享业务fixture helper。
   - 默认仅用JSON/atlas文本与内联字节；不提交视频。图片解码确需真实格式时最多保留一个极小、明确自有的package-local图片，否则用header bytes/ImageData/fake texture。
   - committed测试媒体预算：MP4/WebP为0；确需真实raster时每package最多1张且不超过4KB、总计不超过16KB，超出先说明测试边界为何无法合成。

### legacy→v7 坐标与字段迁移

1. 旧 `coordinateOrigin` 缺失严格按 top-left；源为 top-left 时只在upgrader内使用对应legacy `artSize`：
   - image/VNI placement先减art半尺寸、再加缩放后资源/stage半尺寸，变为资源中心定位；
   - main top-left placement先减art半尺寸、再加grid半尺寸，变为main center；
   - Spine、image-string与Spine transition的authored origin减art半尺寸，不从bounds猜中心。
2. 源为center时，image/VNI、Spine、image-string、main与transition placement数值保持。无论源坐标类型为何，旧
   focusRect都按art左上角表达，必须减art半尺寸进入v7中心平面，随后丢弃artSize。
3. 旧 maximized `default` 的 main/focus、Popup placement 与 source-edge transition placement分别深复制到 L/P；
   旧 orientation L/P 保持。迁移后的对象不得共享可变引用，v7→v7 不再变化。
4. 旧 `backgroundNodes[mode][variant]` 编译为对应 node 的 generic mode×orientation scope；旧普通 `gameMode`
   编译为 singleton mode scope，普通 global node 保持 global。资源、node id/order/state、runtime address 与 bytes 引用不变。
5. 旧 `reelEnabled=false` 没有 placement 时，以该 variant 的 legacy focusRect 和 root grid 尺寸生成确定 main center，
   使迁移视觉与现有 validation-only materialization 一致；不能补零、首项或另一 mode 猜测值。
6. 每个源版本先执行自己的 strict allocation/audio/event contract，再生成 allocation v3 并用 v7 parser 完整复验；
   future version、unknown field、非有限中心、非正 focus、scope 漂移和 allocation 漂移显式失败且不提交。

## 5. 职责与合同

- **RenderCore data**：拥有 v1–v7 strict source parser、唯一 v7 normalizer、center/main/focus 纯几何、generic node scope、
  allocation v3、reference closure 与 public latest types。
- **RenderCore core/runtime**：只消费 v7，按 page orientation 原子应用 node/main/Popup/transition geometry 与 mode scope；
  没有 node/background 也可 init。resize/mode commit 不重建稳定 texture、Spine/VNI player、reel 或 Popup。
- **Editor model/UI**：只维护 center-only v7 draft；main Inspector 编辑 L/P center 与 focus offsets；普通图层统一编辑
  mode×orientation visibility。没有 background selector、art size、mode type或坐标切换 session state。
- **Import/export**：import 只调用共享 upgrader后建立 candidate project并原子提交；export 从 typed draft直接构造 v7、
  重建 allocation并 strict复验，不在 ZIP 层复制 legacy迁移。
- **CLI/consumer**：CLI 只做 typed reference/group/bytes变换，不重新解释坐标或背景；Gameframeworks使用共享
  frame/main helper，不从 manifest 重建公式。
- **仓库清理**：pnpm拥有lockfile；各app/package测试拥有自己的最小fixture，不从production目录或跨package test-utils借资源。
- **失败策略**：非法源版本/字段、缺 main侧、非法 focus/scope、unknown ref、allocation drift、资源缺失、preview prepare
  失败继续显式失败；失败不修改 Editor project 或已提交 runtime scene。
- **禁止行为**：不得保留隐藏 artSize、透明 1×1 背景、默认背景、首个图层即背景、路径/尺寸猜测、top-left alias、
  mode 名推断、L/P fallback 或 app-local viewport 公式。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/manifest-v7.ts
packages/rendercore/tests/scene-layout/manifest-v7.test.ts
{packages/rendercore,apps/gamelayouteditor,apps/symbolseditor,apps/popupeditor}/tests/fixtures/artifact-fixtures.ts
tasks/270-gamelayouteditor-centered-main-layout-<utctime>.md
```

### 预计删除

```text
apps/gamelayouteditor/src/model/coordinate-origin.ts
apps/gamelayouteditor/tests/coordinate-origin.test.ts
apps/{game002v2,game003v2,symbolsviewer}/**
assets/{game002,game002-s2,game003,crave,minecart2,symbols002,symbols003}/**
assets/fixtures/{crave-mapped,minecart2-mapped}/**
assets/{crave,minecart2}.assets-groups.json
test-utils/minecart2-fixtures.ts
apps/{gamelayouteditor,symbolseditor}/scripts/build-task{131,132,135,147}-*.ts
```

若现有文件仍需承载纯 legacy import helper，则改为重命名并收窄到 IO/upgrader，不得保留 Editor 坐标切换 API。

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,manifest,manifest-v2,manifest-v3,manifest-v6,runtime-allocation,geometry,runtime,package-resource,package-runtime,presentation-surface,production-zip}.ts
packages/rendercore/src/scene-layout/{data,core,editor}/**
packages/rendercore/tests/scene-layout/{fixtures,manifest,manifest-upgrade,manifest-v6,runtime-allocation,geometry,coordinate-space,runtime,package-resource,package-runtime,package-runtime-mode,presentation-surface,production-zip}.test.ts
packages/rendercore/README.md
apps/gamelayouteditor/src/model/{editor-project,editor-store,game-mode-commands,resource-commands,validation,layer-order,node-id}.ts
apps/gamelayouteditor/src/ui/{app-shell,layout-workspace,project-workspace,resource-picker,state-manager-dialog}.ts
apps/gamelayouteditor/src/preview/{layout-preview,preview-guides}.ts
apps/gamelayouteditor/src/io/{imported-layout-zip,exported-layout-zip}.ts
apps/gamelayouteditor/tests/{fixtures,editor-store,validation,game-mode-commands,layer-order,node-id-migration,app-shell,ui-markup,layout-preview,preview,zip-io}.test.ts
apps/gamelayouteditor/README.md
apps/gamelayoutpkgcli/src/{package-reader,reference-rewriter,asset-groups,audio-assets}.ts
apps/gamelayoutpkgcli/tests/{fixtures,reference-rewriter,asset-groups,package-flow}.test.ts
apps/gamelayoutpkgcli/README.md
packages/gameframeworks/src/scene-layout-template/index.ts
packages/gameframeworks/tests/scene-layout-template.test.ts
docs/{scene-layout-manifest,background-adaptation}.md
docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime,loading-ui}.md
{AGENTS.md,.gitignore,pnpm-lock.yaml}
apps/{gamelayouteditor,symbolseditor}/package.json
apps/{buildgamestatic,gengameconfig}/README.md
apps/{buildgamestatic,gamelayouteditor,popupeditor,symbolseditor}/tests/**
packages/{game-ui-leo,gameframeworks,rendercore}/tests/**
packages/{logiccore,rendercore}/**/*.md
docs/{rendercore-operation-first-layer-api,rendercore-three-layer-api-architecture,slot-operation-effect-composition-refactor,slot-operation-plan,popup-manifest}.md
```

实际执行以 `rg` 审计缩小文件；`scene-layout/{data,core,editor}/**` 只调整 v7 exports/types，不借机修改无关
Popup、Symbols、audio 或 runtime-address 实现。

### 原则上不应修改

```text
assets/{game001,gamecfg,gamecfg004,spine2pixiani,symbols}/**
apps/{popupeditor,imgnumbereditor}/src/**
packages/{logiccore,netcore,uiframeworks,vnicore,audiocore,popupcore,gameloading,gameloading-ui-simple}/src/**
packages/rendercore/src/{background,popup,symbol,reel,image-string,viewport}/**
{package.json,pnpm-workspace.yaml,turbo.json}
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

Game Viewer/Viewer2作为direct consumer参加编译；只有v7 public type导致真实错误时才最小修改。若必须改通用
viewport/background API、未列出的production assets或业务round，属于明显扩项，先停止说明。

## 7. 实施步骤

1. **确认基线、删除清单与v7 migration fixtures**
   - 重核 HEAD/status、计划与六份领域规则，审计 v1–v6 parser/upgrader、materialization、allocation、runtime snapshot、
     background lifecycle、Editor draft/UI/ZIP、CLI version branches和 direct consumers。
   - 建立 v1–v6 × top-left/center × single/orientation × reel enabled/disabled × zero/one/shared background 的中性
     fixture 矩阵，固定 v7 main/focus、node scope、resource position、source immutability和 round-trip 预期。
2. **移除弃用游戏并中性化共享fixtures**
   - 删除清单内app/assets/scripts，保留并清理docs中的悬空活动引用，清理`.gitignore`例外、根规则路由、package脚本和source-boundary断言；用pnpm
     重建lockfile并确认只移除三个importer及孤立snapshot，不删除共享package。
   - 逐项记录依赖mapped assets的测试保留/重写/删除理由；保留者迁入消费package的TS helper或`tests/fixtures`，移除
     production内容断言、跨仓`test-utils`、真实MP4和批量WebP。残留搜索不得再把旧游戏当consumer或资源源。
3. **建立 strict Scene Layout v7 data contract**
   - 增加 v7 root main、mode main variants、generic node scope、allocation v3 与 latest exports；原生 v7 exact keys
     拒绝全部旧字段/default variant/future version，允许空 nodes。
   - 实现唯一 v1–v6→v7 upgrader和中心坐标转换；保留 mode id/initial/edge、node identity/order/state、Symbols/Popup、
     runtime resources、audio/eventAudio和引用 bytes，生成后经 v7 parser/allocation checker 复验。
   - 更新 reference/path collectors，确保 legacy artSize只在 source parser/upgrader局部可见。
4. **让 runtime 原生消费无界 center/main geometry**
   - 删除 modern→v1 adaptation materialization；geometry/frame 直接按 active mode main L/P focus计算 snapshot。
   - 合并双 variant字段，main center派生 layoutRect；去掉 art mask/art point/applyArtSpace，新增 main selector并同步
     anchors、camera、Popup、transition、reel placement、geometry-only prepare/commit/rollback。
   - visibility只由 node placement、generic scope与当前 mode/variant决定；删除 background candidate/player/order分支。
   - 验证空 node、无背景、main disabled、mode switch、square continuity、variant event和 destroy/rollback。
5. **收敛 Editor draft 与 UI**
   - draft 删除 EditorMode、artSize/background/coordinateOrigin/frameFocusRect；新项目/新 mode自动建立独立 L/P main/focus。
   - 删除背景 outline/Inspector/选择/清除/readiness、坐标切换和 mode 类型表单；资源一律走“添加普通图层”，
     main Inspector集中编辑 enabled、中心 placement、focus offsets、margin与grid。
   - 普通图层 visibility UI 接入 generic mode×orientation scope；图片/VNI新建 placement默认中心 `(0,0)`，Spine与
     image-string保持 authored origin/anchor，不再要求 Spine background art size。
6. **接入 preview、ZIP、CLI 与 consumer**
   - preview/guide/resize直接消费 v7 snapshot；没有背景/节点也显示 main/focus guide和 reel（若 enabled）。
   - import v1–v7只走 shared upgrader，失败零 mutation；manifest preview/ZIP恒 v7，mapped exact closure允许零 node资源。
   - CLI认识 v7 typed refs/scope/group，并继续读取旧包；删除 background owner推导，普通 scoped node按 exact modes归组。
   - Gameframeworks template改用共享frame/main helper，不读取artSize或判断adaptation类型。
7. **同步测试、文档与收尾**
   - 补 parser/upgrader/allocation/runtime、Editor model/UI/preview/ZIP、CLI group/round-trip及 consumer回归。
   - 更新README、长期文档、保留规则与根`AGENTS.md`；不删除game规则、迁移文档或历史tasks。
   - 执行L3整仓验收、浏览器人工验收并生成UTC执行报告。

## 8. 测试与验收

### 测试原则

- upgrader覆盖top-left的art-center平移及image/VNI/main半尺寸补偿、所有legacy focus rebase、center placement保持、
  maximized default双侧深复制、orientation保持、background exact scope、reel-disabled main生成与v7幂等。
- v7 strict failure覆盖旧字段、default variant、缺任一 main侧、非有限中心、非正focus、unknown mode scope、
  scope/allocation漂移；证明 source与两侧对象不共享。
- runtime真实验证零node/零背景、一个/两个普通背景层、main enabled/disabled、L/P/正方形、mode switch、
  geometry update、center anchors、main selector、无 art mask、player identity与失败rollback。
- Editor覆盖新建即无背景可预览、添加一/两普通背景、mode无需类型、main/focus编辑、旧ZIP迁移、v7 export/reimport、
  无 artSize提示、invalid import零mutation。
- CLI与 consumer测试不能只断言字段存在；需验证 exact closure/group、frame结果和旧v6 package可直接启动。
- RenderCore win-amount、popup package、symbol introspection测试价值高：改用内联最小VNI JSON、Spine skeleton/atlas和fake texture，不读媒体文件。
- Popup/Symbols Editor的profile选择、closure rewrite、atomic import/export测试保留；改用各自TS fixture中的synthetic config/signature/ImageData。
- Gamelayout Editor production reel preview保留通用parse/sample边界但删除游戏内容断言；Symbols Viewer catalog及其测试随app删除。
- 删除验收覆盖workspace importer、lockfile、`.gitignore`、source-boundary与文档残留；保留fixture真实经过对应parser，
  但只有被测边界是图片解码时才使用极小真实图片，video只用内联signature/bytes，不保留媒体文件。

### 验收级别

`L3`。除跨包schema/runtime/ZIP外，还删除三个workspace、约51MB/635个tracked asset/app文件并重建lockfile；
影响无法只用直接依赖链界定，按根规则执行整仓验收。

### 执行会话必须运行

```bash
CI=true pnpm install --lockfile-only --no-frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

这里保留7条命令：第一条是workspace删除后的lockfile生成，后五条是L3整仓编译/行为/构建/格式边界，最后一条检查diff；
它们互不替代。执行前后必须人工确认lockfile只移除三个app importer及其孤立snapshot。

### 人工验收

1. 新建项目不添加背景，确认 main L/P均以 `(0,0)` 为中心、focus guide正确，横屏/竖屏/正方形可预览和导出；
   main disabled的Splash也能显示普通图层并切换 mode。
2. 添加一个图片/VNI图层同时覆盖L/P，再用两个普通图层分别只显示横版/竖版；确认中心拖放、order、mode scope、
   resize和动画连续性正确，没有任何“背景/artSize必填”提示。
3. 分别导入旧 top-left单背景v1/v6、旧center双背景v6和无转轮Splash包；对比迁移前后 main/focus、图片/VNI、
   Spine与转场视觉位置，导出均为v7且重导无变化。
4. 审查删除与fixture diff：无Symbols Viewer、game002/game003/Crave/Minecart活动引用；package-local fixture无MP4/WebP批量资产，
   仅在真实解码测试必要时存在单个极小自有图片，所有受影响Editor仍可启动。

### 独立验收建议

`必须`。涉及v1–v7 manifest、坐标迁移、正式ZIP、workspace删除、真实fixtures和lockfile。独立复验重点：

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 9. 环境与依赖

- 使用仓库要求的Node.js 24与pnpm；shell无Node时先`source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时仅运行 `CI=true pnpm install --frozen-lockfile`；只有真实下载失败后才设置仓库约定代理重试。
- 本任务不新增依赖；用pnpm更新`pnpm-lock.yaml`移除三个app importer，出现其它workspace/版本漂移时先停止说明。

## 10. 生成物、文档与规则

- 删除清单内中心仓production assets；保留`assets/gamecfg002`、`assets/gamecfg003`、全部`docs/**`和两个外部仓库的全部assets。新中性manifest/ZIP fixture经正式parser/export helper复验。
- 更新RenderCore/Editor/CLI README与`docs/scene-layout-manifest.md`：v7、v1–v7读取、center-only、main/focus、scope、零背景/node和v7-only export。
- 更新`docs/background-adaptation.md`的Scene Layout章节；通用background/viewport仍保留自身artSize，不误写成全仓删除。
- 最小更新`docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime,loading-ui}.md`；精确fixture/证据不写进规则。
- 根`AGENTS.md`把game002/game003路由收窄到保留的gamecfg目录；专属规则、迁移文档和通用文档全部保留，只更新已弃用consumer表述。

## 11. 执行报告

规划时不生成报告。执行后以`date -u +%y%m%d-%H%M%S`创建`tasks/270-gamelayouteditor-centered-main-layout-<utctime>.md`，简记schema/迁移、删除项、实际文件、偏差、验收与剩余风险，不收集无关coverage/历史/profiler。

## 12. 风险、假设与待确认

### 风险

- 旧top-left image/VNI/main不是简单减`artSize/2`；迁移须按kind覆盖scale、负坐标和hidden placement。
- 旧center source的focusRect仍是art-left坐标，而node/main已是center坐标；若漏做focus rebase，frame和图层会整体错位。
- special background曾承担mode×variant visibility与动态order；generic scope/allocation须覆盖非笛卡尔组合并保持node identity/address。
- 移除art mask会让原本被art边界裁掉的区域按真实viewport可见；需人工确认旧包不依赖隐式裁切，不能补透明背景/new mask伪装。
- `applyArtSpace`、art selector、snapshot字段与frame policy是public API变化；遗漏consumer可能只在build或真实host resize暴露。
- 外部两仓维护workspace-local引擎；同步v7时piximinecart2须移除adaptation/artSize直读，pixicrave须明确art锚点迁到main或origin。
- 删除mapped fixtures会降低多包真实解码覆盖；替代fixture须保留image/Spine/VNI/atlas/package边界并用中性自有内容，不能改成mock/skip。
- workspace删除会更新lockfile；生成结果若改变其它importer、依赖版本或snapshot，视为异常而不是顺带升级。
- Editor背景workflow删除后，旧背景Spine不再享有固定限制；迁移保留原playback，后续按普通Spine显式配置，不猜animation。

### 假设

- `focusRect` 是用户所说 `forcerect`；仍保存正尺寸absolute rect，Editor四边offset只是authoring表达。
- “main为唯一特殊区”不表示每个mode必须显示reel；main几何始终存在，`main.enabled`控制presentation和Symbols能力。
- 新项目main center固定初始化为 `(0,0)`；导入旧top-left项目为保持画面可以得到非零main center，不强制二次平移全项目。
- Popup继续使用viewport-center offset；video blackout继续使用viewport-space，不纳入 authored center迁移。
- legacy parser中的artSize是必要兼容证据，不算v7/runtime/editor继续保留artSize概念。
- `symbols002/symbols003`及task131/132/135/147 builders按内容和引用判定为game002/game003专属；`tasks/**`只作历史证据保留。

### 待确认

无。若要求继续删除通用background/viewport、Popup或其它production美术的独立artSize，属于实质扩项，另行规划。

## 13. 完成检查表

- [x] v7 strict parser/latest、v1–v6无损迁移、allocation v3和public exports完成。
- [x] center-only image/VNI/main、Spine origin、image-string anchor和focus/main几何在runtime真实生效。
- [x] background特殊合同、artSize/mode type/coordinate switch/art mask/art API已从v7与Editor移除。
- [x] 零背景/零node、main enabled/disabled、L/P/square、mode switch、rollback和lifecycle回归通过。
- [x] Editor v1–v7导入、v7-only导出、ZIP重导、CLI flow与direct consumer通过。
- [x] 中心仓两个旧game app、Symbols Viewer及专属production assets/scripts已删除；gamecfg、docs、外部两仓assets保留；中性fixtures、lockfile和残留引用检查通过。
- [x] L3 build及任务相关自动验收、文档规则与UTC报告完成；整仓既有失败已记录且未越权修复。
- [ ] 四项浏览器人工验收（按用户约定由用户执行）。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的六份领域规则和本计划；
2. 核对Git基线与工作区，保留用户已有和无关修改；
3. 按计划实现，不重新引入background/artSize/type/top-left兼容字段；
4. 小幅适配当前实现时在报告记录，重大schema/API/asset范围扩张时先停止说明；
5. 只运行计划规定的L3验收，浏览器人工验收不能由单测替代；
6. 完成后生成UTC中文执行报告；
7. 除非用户明确要求，不commit、不push、不创建PR。
