# 169 symbolseditor-per-tier-imgnumber 任务计划

## 1. 目标与完成定义

### 目标

让 `apps/symbolseditor` 中开启 `valuePresentation` 的 symbol 按 Spine 档位独立配置
ImgNumber。每个档位可以选择不同的 ImgNumber dependency、exact slot、位移/缩放、
`followSlotColor` 和特殊数值图片；runtime 必须先按 value 解析 Spine 档位，再严格使用
该档 ImgNumber，不继承其它档位也不回退到共享配置。

底层 schema、strict parser、档位解析、精确资源闭包、加载、显示和生命周期归
`packages/rendercore`；Symbols Editor 只提供独立草稿表单、资源选择、引用图、预览和
ZIP 往返。任务同时兼容现有共享 ImgNumber 数据及用户提供的 task147 Crave
Layout ZIP 中的旧 Symbols dependency。

### 完成定义

- [ ] 有 N 个 `valuePresentation.tiers` 时，UI 稳定显示 N 个对齐的 ImgNumber
      配置卡；修改某档不改写其它档。
- [ ] 各档可选不同 standalone ImgNumber dependency 和该档 Spine skeleton 的 exact
      slot，可独立配置 x/y/scale、`followSlotColor` 及特殊数值图片；动态内容中心
      anchor 继续固定为 `(0.5, 0.5)`。
- [ ] rendercore 按阈值命中的 tier 选取同 index ImgNumber 配置；同一数值在不同
      tier 合同下可使用不同 glyph 闭包、slot、transform 和特殊图片。
- [ ] 任一档的 dependency、glyph、special image、slot 或 binding 不合法时在可见
      commit 前显式失败，不使用相邻档、首档、字体或 placeholder 补齐。
- [ ] 现有 `text.tiers[]` 中多档内容相同的包可原样导入，显示为已填充的独立
      配置；旧 `text.specialValueImages` 共享列表在 parser 边界复制为每档等价配置。
- [ ] 新导出只写 per-tier canonical 结构；导出后重导、rendercore package load 和
      consumer generator 保持档位对齐与 exact closure。
- [ ] 用 task147 Crave 的四档 CN 作为真实兼容基线，确认未编辑旧数据的行为
      不变，再把至少两档改为不同 ImgNumber 完成浏览器视觉验收。
- [ ] 完成 L2 定向自动化、人工验收，并生成任务 169 UTC 中文执行报告。

## 2. 范围

### 包含

- rendercore symbol manifest 的 per-tier ImgNumber canonical contract，以及旧共享特殊值
  配置的单向导入规范化。
- rendercore 的档位选择、default value/glyph/slot 交叉校验、resource pool、mapped
  display、prepare/commit/rollback/destroy 和 runtime snapshot。
- Symbol package 精确闭包、mapped materialization 和 Vite 资源 generator 对每档
  dependency/glyph/special image 的结构化收集。
- Symbols Editor 的 per-tier 表单、多 ImgNumber dependency 选择、exact tier slot 枚举、
  特殊值 Picker、诊断、引用改写、tier 增删/移动和 ZIP 往返。
- 使用已跟踪的 `assets/crave` 作自动化兼容 fixture，使用用户给定 ZIP 作
  人工端到端样本，不复制第二份业务 manifest。

### 不包含

- 不让 Symbols Editor 直接打开 Scene Layout ZIP；用户给定的 ZIP 仍由 Layout
  format owner 解析，Symbols Editor 只编辑其中的 Symbols package 同类输入。
- 不修改 Spine 档位阈值、Spine normal animation 仍需全档位统一的现有约束、
  `activeSpine` state 编排或 server value 解析。
- 不放开任意 anchor；Symbols Editor 继续使用基于 `visualBounds` 的动态中心对齐。
- 不改动命名 `imageStringNodes`、standalone ImgNumber manifest/glyph schema、font 或完整
  value-image 分支。
- 不把旧共享配置作为 runtime fallback，不自动把首档或前一档应用给新增档位。
- 不覆盖 `/Users/zerro/Downloads/crave/crave-layout-task147.zip`，不修改
  `assets/crave` 正式资源、game002/game003 业务逻辑、Layout Editor、根工具链或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T07:36:40Z
HEAD: 8123712e22fdcbc4af68e115e9597564d5440366
branch: (detached HEAD)
git status --short --untracked-files=all: <clean>
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/editor-artifacts.md` 和 `shared-game-runtime.md`；目标目录无更深
  `AGENTS.md`。
- `SymbolValuePresentationImageStringTextSpec` 已有与 Spine tiers 等长的 `tiers[]`，
  每项已包含 `resource/slot/anchor/transform/followSlotColor`；
  `parseValuePresentation()` 和 `createSymbolValuePresentationResourcesFromManifest()` 也已按 tier
  index 校验 dependency 与 slot。因此 rendercore 现有的 per-tier 支持是部分能力，不需
  新建第二套档位阈值表。
- `specialValueImages` 当前位于 `valuePresentation.text` 下，resource bundle、
  package closure、generator 和 `value-display.ts` 全都把它当成全档共享列表，这是
  rendercore 尚未支持完整 per-tier ImgNumber 的底层缺口。
- `validateTieredSpineEditorContract()` 通过 `sameValueBinding()` 强制所有 ImgNumber
  tier 完全相同；`workspace-app.ts` 只渲染一张“共享 ImgNumber 节点”卡并把修改
  广播到全部 `text.tiers`。slot 候选也使用所有 skeleton 的交集，无法选取某档
  独有 slot。
- Editor 已有多 `EditorImageStringDependency` Map 和基于 dependency id 的稳定
  filename-key 冲突分配；本任务应在 per-tier Picker 中使用每个 dependency 的真实
  `rootKey`，不再把全部选项写成 `./image-string.manifest.json`。
- 用户样本 `/Users/zerro/Downloads/crave/crave-layout-task147.zip` 为 9,862,274
  bytes，SHA-256 `4ad3422fb2a3b308d81419ae4a945d78bd9aa7e43057cd5fdf9796427a7e2f6e`。
  它是 Scene Layout ZIP，`layout.manifest.json` 将 `game002-s3` 绑定到
  `symbols.package.json`；内嵌 symbol manifest mapped payload 为
  `87ac7717d0faab562bc66d86fbabb9628251b26adf8c332c630217316b0a34a8.json`。CN 有
  `<10 / <100 / <1000 / unbounded` 四档，旧 `text.tiers[]` 四项都是
  `image-string.manifest.json + slot coin + center anchor + identity transform`。
- 仓库 `assets/crave` 已有同一 task147 业务结构的 mapped fixture，相关测试已通过
  `readCraveFixtureJson()` 读取权威 manifest，无需把外部 9.8 MB ZIP 加入仓库。

## 4. 需求解释与技术决策

### 需求解释

- “有档位”指 `valuePresentation.tiers`；档位阈值仍只保存在 Spine tier 数组，
  ImgNumber 只用相同 index 绑定，不复制 `maxExclusive`。
- “每个档位单独配置”包含 dependency、slot、x/y/scale、颜色跟随和
  特殊数值图片。anchor 仍是 Editor 已确立的动态视觉边界中心，本任务不新增
  非中心对齐产品能力。
- 不同档位可引用相同 dependency，也可引用不同 dependency；相同 bytes 可由
  resource pool 去重，但 logical binding、special mapping 和 display instance 不合并。
- 新增档位创建一个空 ImgNumber binding，需用户显式选择；导入旧包则保留
  其已有的每档内容，不把“兼容”误解为继续广播修改。
- task147 Layout ZIP 是 consumer 端真实样本，不是 Symbols Editor 的直接输入类型。
  自动化使用仓库内同源 Symbols manifest；人工验收通过正式 Symbols dependency
  替换流程回到该 Layout，不破坏 format ownership。

### 关键决策

1. **以现有等长 `text.tiers[]` 作唯一 canonical 档位对齐**
   - 在 `SymbolValuePresentationImageStringTierBindingSpec` 内增加可选
     `specialValueImages`，其它现有 per-tier 字段保持。
   - 不新增 tier id 或第二份阈值；增删、移动 Spine tier 时同 transaction
     增删、移动 ImgNumber binding。

2. **旧共享特殊值只在 parser 边界单向迁移**
   - v1 输入继续接受旧 `text.specialValueImages`；parser 将其深拷贝到每个已解析
     binding，对外返回的 typed canonical spec 不再含顶层字段。
   - 旧顶层列表与新 per-tier 列表同时出现时因语义模糊而显式失败；不定义
     覆盖顺序、继承或 fallback。
   - 新 Editor 导出、materializer 和 generator 只写/消费 per-tier canonical 结构。

3. **rendercore 拥有完整 per-tier 解析和显示合同**
   - 先用 Spine `tiers[].maxExclusive` 解析 `tierIndex`，再一次性取该 index 的
     Spine resource 和 ImgNumber resource/special map。
   - defaultValues 和 runtime value 都只使用命中档位的 glyph/special map 校验；
     exact special 命中时不要求 glyph，未命中时严格校验该档 glyph。
   - 相同 dependency 只 prepare 一次；每档 special texture 进入精确 pool，只有 package
     owner destroy 共享 texture，display 只销毁自己的 Sprite/container。

4. **Symbols Editor 以档位卡编辑，不复制 runtime 逻辑**
   - Number presentation 在 Spine tier 卡顺序下显示等长 ImgNumber 卡，每卡用自己
     `tierIndex` 修改 draft。
   - dependency selector 使用 `EditorImageStringDependency.id/rootKey`；slot selector 只枚举
     当前 tier skeleton 的 exact slots，不用全档交集。
   - preview/export 仍调用 rendercore package/runtime；Editor 只根据 draft 显示“未完成”，
     不在 DOM 中自行排 glyph 或选 tier。

5. **真实 task147 用例保持资源 owner 边界**
   - 自动化对 `assets/crave` 的 CN 四档执行 parse -> Editor import -> compile ->
     rendercore parse/package-load parity，旧包未编辑时行为不变。
   - 人工流程在 Symbols Editor 导出新 Symbols ZIP，再在 Layout owner 中显式替换
     `game002-s3`；不新增 Layout ZIP 解包猜测或直接改写用户的 Downloads 文件。

## 5. 职责与合同

- **rendercore manifest**：拥有 per-tier typed spec、等长校验、legacy shared-to-tier
  normalization、unknown-field rejection 和 deep freeze。
- **rendercore package/runtime**：拥有档位选择、nested ImgNumber/special image exact
  closure、resource prepare/pool、slot attach、mapped display 和 snapshot/lifecycle。
- **Symbols Editor**：拥有 per-tier draft/UI、dependency/slot Picker、引用图、filename-key
  review、诊断、preview 和 ZIP IO；不保留第二份阈值或 Pixi/Spine 状态机。
- **数据合同**：`text.tiers.length === valuePresentation.tiers.length`；每个 binding
  strict 接受 `resource/slot/anchor/transform/followSlotColor/specialValueImages?`；每档
  special value 为唯一 safe integer，不同档可重复相同 value。
- **资源生命周期**：所有命中 tier Spine、ImgNumber manifest/glyph/special texture
  必须在 player/display 可见前 prepare；任一步失败销毁本次临时 player/display，
  不修改 active presentation。resource pool 按 canonical path 共享，package destroy 幂等。
- **失败策略**：长度错配、新旧字段并存、空/未知 dependency、非图片 special
  ref、重复 value、非本档 slot、缺 glyph、orphan 或 tier 越界都显式失败。
- **禁止行为**：不从档位名、文件名或首项猜 binding，不用共享字段当 fallback，
  不合并不同 logical dependency，不跳过 map/hash/size/path/orphan 验证。

## 6. 文件范围

### 预计新增

```text
tasks/169-symbolseditor-per-tier-imgnumber-<utctime>.md
```

仅在执行和验收完成后新增执行报告；原则上不新建 production module。

### 预计修改

```text
packages/rendercore/src/symbol/{manifest,package,materialize-package}.ts
packages/rendercore/src/symbol-value-presentation/{types,create-symbol-value-presenter,value-display}.ts
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/tests/symbol/{package,materialize-package,symbol-value-vite-resource-generator,state-texture-generator}.test.ts
packages/rendercore/tests/symbol-value-presentation/{manifest-resources,render-symbol-value-controller,symbol-value-presenter}.test.ts
packages/rendercore/README.md
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/ui/{workspace-app,resource-picker,ui-session}.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{editor-project,app-shell,resource-picker,image-string-dependency,zip-io}.test.ts
apps/symbolseditor/README.md
docs/symbol-package.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

### 原则上不应修改

```text
apps/{imgnumbereditor,gamelayouteditor,game002,game003,gameviewer,gameviewer2}/**
packages/rendercore/src/{image-string,symbol-image-string,scene-layout,popup}/**
packages/{logiccore,gameframeworks,editorresource,browserartifactio}/**
assets/**
tasks/artifacts/147/**
AGENTS.md
pnpm-lock.yaml
/Users/zerro/Downloads/crave/crave-layout-task147.zip
```

## 7. 实施步骤

1. **确认执行基线与兼容 fixture**
   - 重核 HEAD/status、两份领域规则、rendercore typed schema、Editor draft 和
     `assets/crave` CN 四档结构。
   - 先为旧相同 `text.tiers[]`、旧顶层 `specialValueImages`、无 special 字段
     和 font/image 分支建立兼容断言，防止为新 UI 扭曲旧行为。

2. **实现 rendercore canonical manifest 与迁移边界**
   - 把 special mapping 加入 tier binding typed spec，在 `parseValuePresentation()` 中严格
     解析每档列表，并把旧顶层列表复制为等价 per-tier spec。
   - 拒绝新旧混用、unknown keys、档位数不对齐、每档重复/非 safe integer
     value 和非 contained image path；对外返回 deep-frozen canonical 对象。

3. **接通 per-tier resource closure 与 runtime**
   - 让 package collector、materializer、resource bundle 和 Vite generator 从每个 binding
     收集 dependency root、glyph 和 special image，相同 physical resource 去重但不合并绑定。
   - 把 special map 收入 `SymbolValuePresentationImageStringTierResource`，
     `createSymbolValueDisplay()` 只向 mapped display 传当前 `tierIndex` 的 map。
   - 覆盖 default/runtime value、tier 切换、相同 dependency 不同 special map、slot
     wrapper、prepare 取消、clear 和幂等 destroy，确保无半提交展示。

4. **移除 Editor 共享限制并保持 tier 对齐**
   - 从 `validateTieredSpineEditorContract()` 移除 `sameValueBinding()` 全等限制，
     保留全档 normal animation 和中心 anchor 等未改需求。
   - add-tier 追加空 binding，remove/move-tier 与 Spine tier 原子对齐；导入旧包
     保留 parser 已规范化的每档值。
   - 诊断、引用图、clone/compile 和 export 使用 exact tier location；state/dependency
     替换失败时候选 project 整体回滚。

5. **实现 per-tier ImgNumber 表单与 Picker**
   - 渲染与 Spine tier 数量/顺序一致的 ImgNumber 卡，每卡独立显示 ready/missing
     状态、dependency、当档 slot、transform、颜色跟随与 special mappings。
   - Picker context 增加 `tierIndex`，dependency 选项写真实 rootKey，special image
     继续使用统一 filename-key review/transaction；取消和 stale dialog 不改 draft。
   - 保持键盘 label、展开状态、tier index 移动后的 focus/session 与响应式布局。

6. **补齐往返、真实 fixture 和失败测试**
   - rendercore 覆盖两档不同 dependency/slot/transform/special map，以及旧顶层
     mapping 迁移、新旧并存拒绝、每档 glyph 差异、exact closure/orphan 和 generator
     parity。
   - Editor 覆盖独立修改不串档、两份 ImgNumber ZIP 的稳定 rootKey、tier-only
     slots、add/remove/move、special Picker、preview 和 export -> reimport。
   - 用 `assets/crave` CN 确认旧四档导入即可导出，未改内容的档位语义和
     resource closure 不变；不把外部 ZIP 复制成新 fixture。

7. **文档、定向验收与报告**
   - 更新 Symbols Editor UI/导入说明、rendercore per-tier public contract、Symbol
     Package canonical/legacy 格式和两份领域规则；删除“全 tier 共享 ImgNumber”旧表述。
   - 按用户 ZIP 所属正式流程做浏览器验收，不覆盖原件、不把 fake runtime
     作为视觉证据。

## 8. 测试与验收

### 测试原则

- 正常路径覆盖单档、多档相同配置、多档不同 dependency 和相同 dependency
  但不同 special map。
- 兼容路径覆盖 task147 无 special 旧数据、task160 顶层 shared special
  数据、font/image 分支和新 canonical 往返。
- 边界覆盖 threshold exact edge、tier 增删/移动、每档独有 slot、一档缺 glyph 但
  另一档有 glyph，以及同 value 在每档各自 special mapping。
- strict failure 覆盖新旧字段并存、长度错配、非本档 slot、空 dependency、
  非图片/缺失 special resource、orphan、stale Picker 和 prepare/destroy 中断。

### 验收级别

选择 `L2`。任务修改 rendercore public typed manifest、Symbol package exact closure、
generator 和直接 consumer Symbols Editor，必须验证底层包与编辑器这条直接依赖链；
不改根工具链、lockfile 或大范围 game consumer，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build
git diff --check
```

`symbolseditor typecheck` 的 `prepare:deps` 同时 build rendercore，无需重复列出 build。

### 人工验收

1. 打开 task147 同源 Symbols package，选 CN；确认四个 Spine tier 各有一张
   ImgNumber 卡，旧四档均已填充且 preview 与修改前一致。
2. 导入第二份具有不同 glyph 外观的 ImgNumber ZIP，只将 CN 的第 2/3 档
   改为不同 dependency、slot/transform 或 special image；逐档输入命中值，确认
   未编辑档不变且阈值边界正确切换。
3. 导出并重导 Symbols ZIP，再在 Layout owner 中替换用户的
   `crave-layout-task147.zip` 内 `game002-s3` dependency 后导出新文件；启动真实
   preview/game 验证四档视觉、resize、tier 切换和 destroy/reopen。保留原 Downloads
   ZIP 不变。

### 独立验收建议

`建议`。因涉及跨包 public manifest、旧 schema 迁移、精确闭包和正式 ZIP
流程，建议独立重跑两个 package 测试与 `git diff --check`，并复验 task147 四档
旧包 parity、新旧 special 互斥和两档不同 ImgNumber 的真实浏览器效果。

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24。shell 无 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 pnpm，不切换 npm/yarn，不强制调整已正确的 Node/pnpm。
- 依赖缺失时：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置代理并重试原命令。本任务不需新依赖或 lockfile
  变更；如执行时发现必须新增依赖，先说明原因与影响。

## 10. 生成物、文档与规则

- 本任务预计无正式资源生成物和 YAML 变更；不手改 generated TypeScript，也不
  重生成 `assets/crave`。
- 若修改 `generate-symbol-value-vite-resources.mjs`，通过其测试内临时 fixture
  验证 canonical 输出与 check parity；不为本任务制造新游戏业务表。
- 更新 `apps/symbolseditor/README.md`、`packages/rendercore/README.md` 和
  `docs/symbol-package.md`，记录 per-tier canonical 格式、legacy normalization 和实际
  UI 流程。
- 最小更新 `editor-artifacts.md` 中已过时的“一个共享 dependency/共同 slot”
  稳定规则，并在 `shared-game-runtime.md` 明确 per-tier exact ImgNumber 选择归
  rendercore。不修改根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/169-symbolseditor-per-tier-imgnumber-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终 canonical/legacy 合同、UI 行为和实际修改文件；
2. task147 四档旧包 parity 与两档不同 ImgNumber 结果；
3. 实际验收命令及结果；
4. 未完成的浏览器/Layout/game 人工验收；
5. 计划偏差、剩余风险和未完成项。

不收集无关 coverage、整仓历史矩阵或 profiler 证据。

## 12. 风险、假设与待确认

### 风险

- 旧顶层 special list 迁移到每档会在重新导出时改变 JSON 形状并复制列表，
  但语义必须保持一致；需用 round-trip 和 exact closure 测试防止遗漏图片。
- 不同 tier skeleton 的 slot 集合可完全不同；UI 若沿用交集会伪报缺失，runtime
  若校验错 skeleton 会到可见阶段才失败，必须用 tier index 贯穿诊断与加载。
- 相同 dependency 配不同 special map 时，若 resource 模型仍保留全 symbol 共享 map，
  会串档；必须将 map 与 tier binding 绑定，texture 才按 path 共享。
- 用户给定的是 Layout ZIP 而非 Symbols ZIP；若人工流程绕过 Layout owner 直接
  改 mapped payload，会破坏 map/hash/orphan 合同，因此只能通过显式 dependency 替换验收。

### 假设

- 用户所说的 ImgNumber 是 `valuePresentation.text.type = "image-string"`，不是
  命名 `imageStringNodes`、font 或完整数值图片。
- 每档“不同 ImgNumber”要求涵盖 dependency、slot、transform、颜色跟随和
  special mapping；动态中心 anchor 及全档 normal animation 统一约束保持。
- 任务 169 交付通用 Editor/rendercore 能力和测试，不代替用户的 task147
  Layout ZIP 或生成新正式 Crave 资源。
