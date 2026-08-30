# 269 gamelayouteditor-orientation-layer-placements 任务计划

## 1. 目标与完成定义

### 目标

解除 Game Layout Editor 中“普通图层是否有横版/竖版配置”与 game mode 的单背景
`maximized-focus` / 横竖双背景 `orientation-focus` 类型之间的错误耦合。无论当前 mode 使用单背景还是双背景，
普通 scene node 都统一按宿主页面方向拥有并执行独立的 `landscape`、`portrait` placement；Scene Layout manifest
升级为 v6，RenderCore 与 Editor 均可直接读取旧 v1–v5，并把旧配置确定性补齐为 canonical v6，Editor 后续只导出 v6。

### 完成定义

- [ ] Game Layout Editor 在单背景和双背景 mode 下都显示普通图层的横版、竖版可见性与
      `x/y/scale/rotation/center`；两侧独立编辑、隐藏与恢复，不再出现单背景专属 `default` 图层表单。
- [ ] 单背景 mode 在 production runtime 中也按宿主原始 page `width/height` 选择普通图层的横版或竖版
      placement；横竖 resize、mode 切换、preview 与正式 runtime 行为一致且不重建稳定 player。
- [ ] RenderCore 可 strict 读取 v1–v6。v1–v5 单背景普通图层的当前 `default` placement 深复制为
      `landscape`、`portrait`；旧双背景的两侧 placement 原样保留。迁移不共享可变对象、不猜资源或另一图层数据。
- [ ] 原生 v6 对普通图层只接受方向 placement 合同，非法 key、非法数值、缺失引用和未来版本继续显式失败；
      background node 仍遵守其单/双背景适配合同，不被误迁移为普通图层。
- [ ] v6 `runtimeAllocation` 与 runtime snapshot 能表达单背景 mode 下横竖方向不同的 active ordinary nodes；
      package-level variant change 只在成功提交后的有效页面方向变化时发布。
- [ ] Editor 打开 v1–v6 后只维护 canonical v6 draft，preview 与 ZIP export 均写 v6；导出后重导不发生二次迁移。
- [ ] Gamelayout package CLI 可读取、改写并重验 v1–v6；RenderCore public consumer 编译通过，相关 README 与领域规则同步。

## 2. 范围

### 包含

- Scene Layout v6 types、strict parser、v1–v5→v6 upgrader、latest alias、public data/core/editor exports。
- 普通 scene node 的方向 placement、direction visibility、runtime allocation 与 snapshot/variant event 合同。
- Gamelayout Editor 的 project draft、创建/导入/导出、图层 command、Inspector、preview/guide 与 ZIP round-trip。
- `apps/gamelayoutpkgcli` 的支持版本分支、typed reference rewrite 与 package flow。
- RenderCore、Gamelayout Editor、CLI 和直接 public consumer 的定向测试、文档与执行报告。

### 不包含

- 不取消 game mode 的单背景/横竖双背景选择，也不把两类背景资源绑定合并成同一种 authoring workflow。
- 不改变背景 node、main reel、Popup root 或 transition overlay 当前随适配类型使用 `default` 或
  `landscape/portrait` 的 schema；本任务中的“图层”特指 Layout 大纲里的普通 scene node。
- 不改变 focus/art viewport 数学、raw page 方向判定、正方形连续性、reelEnabled、Symbols/Popup owner schema、音频或 runtime address 语法。
- 不迁移或修改 `assets/**`、game002/game003 业务配置、外部 Crave/Minecart2 仓库和 production 美术。
- 不新增第三方依赖，不修改根工具链、workspace 配置或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-30T03:16:16Z
HEAD: 5a9eafc39f292d716dd0580913985776110bea73
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

- 已读取：根 `AGENTS.md`、`docs/agent-rules/scene-layout.md`、
  `docs/agent-rules/editor-artifacts.md`、`docs/agent-rules/shared-game-runtime.md`；目标目录没有额外 `AGENTS.md`。
- 当前 `apps/gamelayouteditor/src/model/editor-project.ts` 的 `EditorMode` 同时表达背景/适配类型；
  `activeVariantIds()` 对 `maximized-focus` 返回 `default`，对 `orientation-focus` 返回
  `landscape/portrait`。该 helper 被普通图层、背景、主转轮、Popup、转场、validation 与 preview 共同消费，
  是 authoring 数据被错误绑定到背景类型的核心入口。
- `EditorNodeDraft.placements` 已支持三个 key，且 orientation 普通图层已有按方向隐藏和
  `hiddenPlacements` 恢复合同；单背景 UI 只展示 `default`，新建普通图层也只填充 `default`。
- `editorProjectToManifest()` 目前先构造 v2 再规范化到 v5；`manifestToEditorProject()` 先调用
  `upgradeSceneLayoutManifestToLatest()`，Editor ZIP import 已具备共享 upgrader 后原子 commit 的正确边界。
- `packages/rendercore/src/scene-layout/types.ts` 的 latest 是 `SceneLayoutManifestV5`；
  `manifest-v3.ts` 负责 v3/v4/v5 parser 与 latest upgrade，`manifest.ts`、`manifest-v2.ts` 和
  `package-runtime.ts` 存在明确的 v1–v5 exhaustive version 分支。
- `materializeSceneLayoutManifestForMode()` 当前用 mode adaptation 的 active variants 过滤 node、reel、Popup、
  transition placement；`runtime.ts#applySnapshot()` 又直接用 geometry snapshot 的 `variantId` 查 node placement。
  因此单背景 runtime 永远只读取 `default`，仅修改 Editor UI 不会让横竖配置生效。
- `createSceneLayoutRuntimeAllocation()` 同样把单背景 mode 只分配为 `default`；当前 allocation v1 无法表达
  单背景下 ordinary node 的横竖可见差异。
- `resolveOrientationSceneViewport()` 已实现权威页面方向规则：原始 page 高于宽为 portrait、宽于高为
  landscape、正方形保留上一方向且首次为 landscape。本任务应复用该规则，不另写 Editor/runtime 判断。
- `apps/gamelayoutpkgcli/src/{reference-rewriter,audio-assets}.ts`、RenderCore package runtime 和相关测试有
  `version === 5` / `version !== 5` 分支；manifest 升级必须同步审计这些直接 consumer。

## 4. 需求解释与技术决策

### 需求解释

1. “单背景/双背景”继续只描述当前 mode 的背景与几何适配能力，不再决定普通图层能否分别布局横版和竖版。
2. “图层的数据都应该一样”解释为普通 scene node 在两类 mode 下统一使用
   `landscape` / `portrait` placement；已有 orientation visibility toggle 保持，缺某侧 placement 仍表示该侧显式不可见。
3. “老版本正常读取、默认填充”解释为：读取 v1–v5 的 `maximized-focus` 时，以该 ordinary node 当前有效的
   `default` placement 为唯一权威，分别深复制到 landscape 与 portrait；读取旧 orientation mode 时保留原两侧数据和缺失可见性。
4. 若同一旧 node 被任一 mode 作为背景引用，它属于 background candidate，继续按旧背景合同迁移，不按普通图层规则复制；
   现有合同已禁止 background 同时声明普通 mode scope，不引入身份猜测。
5. “runtime 有效”包括生产 `SceneLayoutRuntime`、package runtime、Editor production preview、selection guide 和成功
   resize/mode commit 后的 variant event，不接受只保存但不消费的字段。
6. “导出最新版本”解释为 Editor 的 manifest preview、production ZIP 和重导均为 canonical v6；CLI 对旧包做 typed
   rewrite 时保持其既有 source-version 策略，但必须认识 v6。

### 关键决策

1. **升级 Scene Layout latest 到 v6，但不新增第二份普通图层表。**
   - v6 继续使用 `nodes[].placements`；版本变化负责修改 ordinary node 的 canonical key/执行语义。
   - 原生 v6 ordinary node 禁止 `default`，只允许 `landscape` / `portrait`；两侧可独立缺失以保留显式隐藏能力。
   - background node 仍由全部 mode 的 `backgroundNodes` 引用图确定，并按所在适配类型验证 placement，避免把背景资源数量
     与普通图层方向配置再次混在一起。
2. **拆分 geometry variant 与 orientation placement variant。**
   - snapshot 保留现有 `variantId` 表达几何/背景适配 key，并新增只读 `orientationVariantId` 表达原始 page 的
     landscape/portrait；orientation mode 下两者一致，maximized mode 下前者仍是 `default`。
   - ordinary node visibility/transform 使用 `orientationVariantId`；背景、reel、Popup、transition 和 viewport geometry
     继续使用 `variantId`。这样满足本任务而不暗改相邻 schema。
   - direction 由 RenderCore 单一 helper 计算；square 使用上次 `orientationVariantId`，首次 landscape。Editor 只消费 snapshot。
3. **runtime allocation 随 manifest 升为 v2。**
   - v6 allocation 的 mode ordinary-node active set 按 landscape/portrait 表达；单背景 node 在两侧复用同一 active background，
     ordinary nodes 则按各自 placement/scope 进入对应集合。
   - 原生 v3–v5 仍先按各自 allocation v1 strict 校验，再由 upgrader 重建 v6 allocation v2；不得接受漂移 allocation 后再“修复”。
4. **迁移是确定、幂等且按源版本执行。**
   - 旧 maximized ordinary node 的 `default` 深复制到两侧，源对象不修改；旧 inactive/stale L/P 数据不能覆盖当前 default。
   - 旧 orientation ordinary node 原样保留 L/P。生成 v6 后再经 v6 parser 与 allocation checker 完整复验；v6→v6 不再改变。
   - 未知 future version、缺 default 的合法性矛盾、background/ordinary 身份冲突与非法 placement 显式失败，不补零值或首项。

## 5. 职责与合同

- **RenderCore Scene Layout data**：拥有 v6 source/latest 类型、ordinary/background 分类、strict parser、v1–v5 upgrader、
  allocation v2、方向选择纯函数和 version routing。
- **RenderCore core/runtime**：拥有 geometry `variantId` 与 page `orientationVariantId` 的原子 snapshot；普通图层只按后者
  应用 transform/visibility，背景与其它 presentation 继续按前者；resize、mode commit、rollback、geometry-only update 和 destroy
  维持既有 ownership。
- **Package runtime/event**：以成功提交后的 `orientationVariantId` 差异发布 package variant change；首次 apply、同方向 resize、
  失败 apply 与 rollback 不发布。
- **Gamelayout Editor model/UI**：背景 helper 与 ordinary-layer helper 分离；mode 类型只控制背景/geometry 表单，普通图层 UI 永远枚举
  landscape/portrait，并沿用各侧 hidden placement cache。
- **Editor import/export**：import 只调用共享 v6 upgrader并原子建立 draft；export 从 typed draft 构建完整 v6、重算 allocation并 strict 复验，
  不在 ZIP 层复制迁移逻辑。
- **CLI**：认识 v6 union/exhaustive branch，只按 typed refs 改写路径和闭包，不解释或合成 placement。
- **失败策略**：非法版本、unknown placement key、非有限 transform、错误 background key、allocation 漂移、destroy 后调用和 preview
  prepare 失败继续显式失败；失败不修改 Editor project 或已提交 scene。
- **禁止行为**：不得按 mode 名、node id、资源名或 viewport CSS 猜方向；不得把 L/P 互相 fallback；不得在 Editor 与 runtime
  复制方向算法；不得用共享对象同时充当迁移后的两侧 placement。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/manifest-v6.ts
packages/rendercore/tests/scene-layout/manifest-v6.test.ts
tasks/269-gamelayouteditor-orientation-layer-placements-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,manifest,manifest-v2,manifest-v3,runtime-allocation,geometry,runtime,package-runtime}.ts
packages/rendercore/src/scene-layout/{data,core,editor}/**
packages/rendercore/tests/scene-layout/{manifest,manifest-upgrade,runtime-allocation,geometry,runtime,package-runtime,package-runtime-mode}.test.ts
packages/rendercore/README.md
apps/gamelayouteditor/src/model/{editor-project,game-mode-commands,resource-commands,validation}.ts
apps/gamelayouteditor/src/ui/{app-shell,layout-workspace,resources-workspace,project-workspace,state-manager-dialog}.ts
apps/gamelayouteditor/src/preview/{layout-preview,preview-guides}.ts
apps/gamelayouteditor/src/io/{imported-layout-zip,exported-layout-zip}.ts
apps/gamelayouteditor/tests/{fixtures,validation,game-mode-commands,app-shell,ui-markup,layout-preview,preview,editor-store,zip-io}.test.ts
apps/gamelayouteditor/README.md
apps/gamelayoutpkgcli/src/{reference-rewriter,audio-assets,package-reader}.ts
apps/gamelayoutpkgcli/tests/{reference-rewriter,package-flow}.test.ts
apps/gamelayoutpkgcli/README.md
docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md
```

`packages/rendercore/src/scene-layout/{data,core,editor}/**` 只允许调整 v6 public re-export 或受 snapshot 类型直接影响的入口，
不得借机改写无关 runtime address、Popup 或 Symbols 实现。执行时以 `rg` 结果缩小实际文件，不为命中范围而机械修改全部路径。

### 原则上不应修改

```text
apps/{game002v2,game003v2,gameviewer,gameviewer2,popupeditor,symbolseditor,imgnumbereditor}/**
assets/**
packages/{logiccore,netcore,uiframeworks,vnicore,audiocore,popupcore}/**
packages/rendercore/src/{popup,symbol,reel,image-string}/**
{AGENTS.md,pnpm-lock.yaml,pnpm-workspace.yaml}
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

`packages/gameframeworks`、Game Viewer/Viewer2 作为 direct consumer 参与编译验收，原则上不修改；只有 v6 latest/snapshot public type
导致真实编译错误时才允许最小适配并在执行报告说明。若需要改变 Popup/reel/transition placement schema、业务 game app 或 production assets，
必须先停止并说明范围扩大原因。

## 7. 实施步骤

1. **确认执行基线与迁移矩阵**
   - 重核 HEAD/status、三份领域规则、v1–v5 parser/upgrader、allocation、materialization、runtime snapshot、Editor add/import/export 与
     CLI exhaustive branches；确认计划基线未被其它任务改变。
   - 先建立中性 fixture 矩阵：v1/v2/v3/v4/v5 × maximized/orientation × global/scoped ordinary node × background candidate ×
     one-side-hidden，并固定每种输入的 v6 输出与 source immutability。
2. **建立 Scene Layout v6 data contract**
   - 增加 `SceneLayoutManifestV6`、`SceneLayoutManifestLatest=v6`、allocation v2 与 public exports；更新 document/initial/latest parser 路由，
     unknown future version继续失败。
   - v6 strict 分类全部 background candidate；背景按适配 active key 校验，ordinary node 只允许 L/P placement 与既有 transform 校验，
     scope/order/resource/reference 合同保持。
   - 实现 v1–v5→v6 upgrader：先按源版本 strict parse（v3–v5 包括 allocation/audio/eventAudio），再迁移 ordinary placements、重建
     allocation v2并用 v6 parser复验。保留 audio/eventAudio、mode id/initial/edge、dependency、resource、order 和 bytes refs。
3. **让 runtime 原子消费普通图层方向 placement**
   - 抽取 raw page orientation resolver并供 geometry/runtime共用；扩展 snapshot 为 geometry `variantId` + `orientationVariantId`，明确 square 连续性。
   - 调整 modern-mode materialization与 SceneLayoutRuntime，使 v6 ordinary node 的两侧 placement 在单背景 runtime 中都保留；
     `applyViewport()`、late `prepareNodes()`、geometry commit、mode commit 和 transform refresh 均选择正确 key。
   - 背景继续使用 geometry key；reel/Popup/transition不改 schema。方向切换只更新 placement/visibility并保留 texture、Spine/VNI player、playhead、
     node identity、motion/destroy owner；失败保留上次 committed snapshot。
   - package runtime 按 committed `orientationVariantId` 发布 variant change，并让 allocation v2、runtime event catalog/descriptor 与 initial scene一致。
4. **拆分 Editor background 与 ordinary-layer variants**
   - 将 `activeVariantIds()` 拆为命名明确的 background/geometry variant helper 与固定 ordinary layer orientation helper；逐个 consumer 改用正确 helper，
     禁止用全局替换把 Popup/reel/transition误改为 L/P。
   - 新建/添加/重绑普通图层在单、双背景 mode 下都建立独立 L/P placement；两侧默认值相同但对象独立，orientation 既有隐藏/恢复语义保持。
   - Layout Inspector 永远显示横版、竖版 ordinary-layer 控件；背景 outline、资源“设为背景”、Art/Focus 与 mode 类型选择仍按单/双背景显示。
   - import 只消费 shared v6 latest，clone/rename/remove/reference/validation保持 exact；export 直接生成 v6并拒绝残留 ordinary `default`。
5. **接入 production preview 与 ZIP**
   - preview、selection overlay、guide、resize和 current visibility 读取 runtime `orientationVariantId`；单背景横竖 resize 必须展示对应 placement，
     正方形保持上次方向，首次为 landscape。
   - 删除或收窄当前 incomplete preview 的 v1/default fallback：若仍需临时预览，必须从当前 page direction 显式选择 ordinary placement，
     不把 portrait fallback 为 landscape，也不把 authoring fallback 写入 draft/export。
   - ZIP import 覆盖 v1–v6 source strict validation、迁移后 node-id transaction 和 bytes closure；export manifest preview、mapped ZIP 与重导固定 v6。
6. **同步 CLI、consumer、测试与文档**
   - 扩展 CLI v6 capability/version branch和fixtures；无新增资源字段，因此 reference rewrite 只需保持 v6 typed结构与 exact closure，不复制 upgrader。
   - 补 RenderCore parser/upgrader/allocation/runtime、Editor model/UI/preview/ZIP 和 CLI round-trip 回归；重新编译 Gameframeworks、Viewer/Viewer2
     等 direct public consumer，只修正真实 v6 exhaustive/type break。
   - 更新三个 README/领域规则中的 latest 版本、兼容范围、ordinary/background variant 解耦和 runtime direction contract；不改根 `AGENTS.md`。
   - 执行 L2 定向验收并创建 UTC 执行报告。

## 8. 测试与验收

### 测试原则

- RenderCore 使用 package 内中性 fixtures 覆盖 v1–v5 maximized default→双向深复制、orientation 保留、v6 幂等、source 不变、
  background 不误迁移、native v6 unknown/default ordinary key 与 allocation drift strict failure。
- runtime 用明显不同的 L/P placement 验证单背景 portrait/landscape/square、late prepare、mode switch、geometry update、scope visibility、
  variant event 和 destroy；断言 player identity/playhead不因 resize重建。
- Editor 覆盖单/双背景 add/rebind、两侧独立编辑、隐藏恢复、另一侧不被覆盖、导入旧 default、v6 export/reimport 和 invalid import零 mutation。
- ZIP/CLI 覆盖 v1–v6读取、mapped rewrite、exact closure 与 latest Editor export；不得把只检查 JSON 字段存在当作 runtime 生效证明。

### 验收级别

`L2`。任务升级跨包 public versioned schema、runtime snapshot/allocation、Editor 正式 ZIP 与 CLI 直接 consumer；需要验证共享 package、
Editor、CLI 和直接编译消费者，但没有根工具链/lockfile变更，也不需要整仓 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-v6.test.ts tests/scene-layout/manifest-upgrade.test.ts tests/scene-layout/runtime-allocation.test.ts tests/scene-layout/runtime.test.ts tests/scene-layout/package-runtime-mode.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/game-mode-commands.test.ts tests/validation.test.ts tests/layout-preview.test.ts tests/editor-store.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/package-flow.test.ts
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks --filter gameviewer --filter gameviewer2 typecheck
pnpm --filter @slotclientengine/rendercore build
git diff --check
```

若 package 的实际名称与上述 filter 不一致，执行时先从对应 `package.json#name` 确认后只修正命令，不扩大验收范围。

### 人工验收

1. 新建单背景项目，绑定背景和普通 Spine/VNI/图片图层；给普通图层横版、竖版填写明显不同 placement，连续切换
   `1920×1080`、`1080×1920`、正方形，确认背景仍为单背景而普通图层按方向切换且动画不重播。
2. 在两侧分别隐藏/恢复普通图层并切换 game mode，确认恢复 exact 原值、另一方向不变；双背景项目保持原有背景选择和 L/P 行为。
3. 分别导入一个旧单背景 v1/v5 ZIP 和旧双背景 ZIP；确认单背景 default 被复制到两侧、双背景数据保留，导出均为 v6且重导无变化。

### 独立验收建议

`必须`。涉及 Scene Layout v1–v6 public contract、allocation、production runtime方向提交与 Editor 正式 ZIP。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-v6.test.ts tests/scene-layout/runtime.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/layout-preview.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/package-flow.test.ts
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；当前 shell 若没有 Node：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时仅运行 `CI=true pnpm install --frozen-lockfile`；只有真实下载失败后才设置仓库约定代理并重试原命令。
- 本任务不新增依赖、不修改 `pnpm-lock.yaml`。若实现发现必须新增依赖或改变 workspace importer，先停止并说明原因。

## 10. 生成物、文档与规则

- 本任务没有 YAML 或现有代码生成物；manifest/ZIP fixture 必须通过正式 parser/export helper产生或 strict 复验，不手改派生代码。
- 更新 `packages/rendercore/README.md`：Scene Layout latest v6、v1–v6读取、ordinary placement方向语义、snapshot双 variant 与 allocation v2。
- 更新 `apps/gamelayouteditor/README.md`：单/双背景均编辑普通图层 L/P、旧包补齐、v6 only export 和人工操作说明。
- 更新 `apps/gamelayoutpkgcli/README.md`：v1–v6读取/改写支持。
- 最小更新 `docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md` 的稳定合同；把旧 latest v5/v1–v5 表述改为
  v6/v1–v6，并明确 ordinary orientation 与 background adaptation 分离。具体 fixture、迁移例值和执行证据不写入规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/269-gamelayouteditor-orientation-layer-placements-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现、实际文件、迁移/public contract 决策、计划偏差、验收命令结果、
人工验收状态和剩余风险，不收集无关 coverage、整仓历史或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 现有 `activeVariantIds()` 被背景、普通图层、reel、Popup、transition共同使用；误做全局替换会静默改变相邻 schema或让 strict parser
  接受错误 key。实施必须按 owner 分拆 helper并逐个审计 call site。
- v6 modern manifest若在 materialization阶段再次被压成 v1/maximized `default`，L/P ordinary placement会在进入 runtime前丢失；测试必须从
  source v6一路验证到真实 SceneLayoutRuntime transform，而不是只测 upgrader输出。
- `variantId` 现被 geometry、reel、Popup、transition和 package event复用；新增 `orientationVariantId` 后若 consumer选错字段，可能造成
  普通图层已切换但 Popup/reel错误读取L/P，或 variant event不发布。类型命名和测试应显式区分两者。
- 旧 maximized source可能携带未生效的 stale L/P key；迁移必须以当前有效 `default` 为权威复制，不能让历史隐藏数据改变打开后的画面。
- latest type升级会触发 CLI/package runtime中遗漏的 `version===5` 分支；执行时需以 `rg` 完整审计，而不是只修编译报错。

### 假设

- 用户所说“图层”指 Gamelayout Editor Layout 大纲中的普通 scene node，不包含背景、main reel、Popup root 与 transition overlay；
  后四者在本任务保持现有单/双背景 variant合同。
- 旧单背景普通图层当前有效数据是 `placements.default`；升级时 landscape/portrait都使用其完整
  `x/y/scale/rotation/center`，不是只复制 x/y，也不重新按 art size计算。
- 单背景下页面方向变化应触发普通图层切换及 package variant event，但不改变 maximized focus/art viewport geometry。
- 现有 orientation “缺 placement即该方向不可见”与 hidden placement Editor缓存仍是有效需求，因此 v6不强制 ordinary node两侧都可见；
  “都有配置”指两侧都有独立 authoring能力，旧单背景默认迁移为两侧均可见。

### 待确认

- 无。若执行前用户把“图层”扩展为 background/reel/Popup/transition全部 placement-bearing对象，属于 schema 与 runtime范围的实质扩大，
  应先更新需求合同和计划，不能在执行中顺带修改。

## 13. 完成检查表

- [ ] v6 strict parser/latest alias、v1–v5确定性迁移和 allocation v2完成。
- [ ] geometry `variantId` 与 `orientationVariantId`职责分离，单背景 ordinary L/P在 production runtime真实生效。
- [ ] 单/双背景 Editor ordinary图层 UI一致，L/P独立编辑、隐藏、恢复与 preview正确。
- [ ] Editor v1–v6导入、v6 only导出、ZIP重导与 CLI v1–v6 flow通过。
- [ ] 背景、reel、Popup、transition、focus、square、player lifecycle和失败原子性无回归。
- [ ] L2自动验收、三项人工验收、独立复验、文档规则与 UTC报告完成。
