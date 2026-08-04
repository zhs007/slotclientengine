# 160 symbolseditor-imgnumber-special-values-and-all-state-targets 任务计划

## 1. 目标与完成定义

### 目标

为 `apps/symbolseditor` 的 ImgNumber 配置增加不限条数的“特殊值图片”稀疏映射。用户可在
一个 ImgNumber 节点内逐条添加“数字值 → 普通图片”映射；例如值 `200` 命中映射时只显示
一张 `mini` 图片，不再逐字符渲染 `200`，而未映射的 `150` 继续使用当前 image-string
glyph 排版显示 `150`。

特殊图片不是新的 symbol layer、state 或完整数值图片模式。它与普通 ImgNumber 共用当前
节点的 target、anchor、transform 和颜色规则，不要求用户重复配置 placement。命名
ImgNumber 节点可绑定所有 symbol state 视觉类型：official Spine/active Spine 目标选择 exact
slot，普通图片、layered image、state texture、VNI、composite、builtin、static 和 empty 目标
直接显示为 symbol 顶层 ImgNumber overlay。该能力同时适用于 Symbols Editor 的命名
`imageStringNodes` 和
`valuePresentation.text.type = "image-string"` 共享节点。

### 完成定义

- [ ] 用户可在每个 ImgNumber 节点中逐条新增、编辑、选择图片和删除特殊值映射；条目数量
      不设置产品上限，值在同一节点内不可重复。
- [ ] 命名 ImgNumber 节点可选择任意已配置 state；Spine-backed state 必须再选择真实 slot，
      其它 state 不显示 slot 表单并自动使用直接 overlay attachment。
- [ ] 输入文本精确等于已配置值的 canonical 十进制字符串时只显示对应整图；未命中时继续
      使用原 image-string glyph renderer，且两种显示可在同一节点中原子切换。
- [ ] 普通 glyph 与特殊图片沿用同一个 target attachment、anchor、transform、state 切换、
      pool reset 和 destroy 生命周期，不增加逐映射位置、缩放、动画或颜色配置。
- [ ] 新映射进入 symbol manifest 的 strict optional contract、精确资源闭包、filename-key
      review、Symbols ZIP 导出/重导和 production package loader；缺失、非法或 orphan 资源
      显式失败。
- [ ] 没有特殊映射的旧 manifest、普通 ImgNumber、完整数值图片、font、Spine state 和现有
      preview 行为保持不变。
- [ ] 完成 L2 定向自动化、浏览器人工验收，并生成任务 160 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore` 的 symbol manifest 类型/parser、特殊值选择、整图/glyph 原子显示、
  全 state target attachment、package resource prepare/closure/ownership，以及 value-presentation
  和命名节点两个 consumer。
- `apps/symbolseditor` 的 editor draft、引用图、普通图片 Resource Picker、表单、preview、
  filename-key import review、Symbols ZIP 往返和测试。
- consumer Vite 精确 import 生成器对 value-presentation 特殊图片的结构化收集与 checker 测试。
- Symbols Editor、rendercore 和 Symbol Package 文档，以及最小范围稳定领域规则。

### 不包含

- 修改 `apps/imgnumbereditor` 或 `ImageStringManifestV1` 的 glyph、metrics、fixed advance、
  standalone ZIP schema；`mini` 等映射属于使用节点，不污染可复用数字字体 dependency。
- 修改 popup、scene-layout 普通 image-string node、游戏业务 resolver、server otherScene 或
  game config；本任务不根据 symbol code、component 名或服务器字段自动生成映射。
- 把特殊图片做成动画、Spine/VNI、独立业务 layer 或额外 slot object，或允许逐条配置
  x/y/scale/anchor；非 Spine direct overlay 是节点本身的固定 attachment，不是可编辑 layer。
- 从图片文件名猜数值或 label、批量扫描目录建表、CSV/YAML 导入、隐式覆盖/keep-both、
  placeholder、字体 fallback 或缺图时退回文字。
- 修改正式游戏资源、生成新的 Symbols 交付 ZIP、根工具链、依赖版本或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-04T08:18:43Z
HEAD: e5c7e11f0ffeb649159352f77e46365e77147937
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

已读取根 `AGENTS.md`、`editor-artifacts.md`、`shared-game-runtime.md`、计划模板，任务
102/106/109/157/159，以及 Symbols Editor、rendercore、Symbol Package 文档；目标目录无补充
`AGENTS.md`。当前代码基线：

- `SymbolImageStringNodeSpec` 只有 resource/targets/initialText/placement 字段，
  `SymbolValuePresentationImageStringTextSpec` 只有 per-tier binding，均无稀疏图片映射。
- `parseImageStringNodes()` 只接受 `animations[state].kind === "spine"` 的 `{state,slot}` target；
  image、state texture、VNI、composite、builtin/static/empty 和 active Spine 不能绑定命名节点。
- `createRenderImageString()` 只排版 glyph；未配置字符原子失败，没有整图显示分支。
- `SymbolImageStringController` 只由 `SpineSymbolAni` player hook 驱动；`RenderSymbol` 的现有
  animation overlay 会被 VNI/composite/builtin reset 清空，不能承载稳定 direct ImgNumber。
- value-presentation 已把 ImgNumber 挂入 tier player slot；package closure 只收集 image-string
  manifest/glyph，尚未收集节点级特殊图片。
- Symbols Editor 已有两个 ImgNumber 表单、普通 image Picker、clone/compile/import/export 和
  exact closure，但 target UI 只枚举 Spine，引用图也不知道特殊图片。
- `text.type="image"` 是全量完整图片模式；本需求是 image-string 内稀疏覆盖，不能互换。

当前代码与测试足以确认合同，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “200 显示 mini、150 显示 150”解释为 exact sparse override：先用当前输入的原始 string
  查找特殊值；命中时显示一张整图，未命中才进入现有 glyph validation/layout。
- 映射值使用 JSON number 表达，并严格要求 safe integer、同一节点内唯一；runtime 只在
  `text === String(value)` 时命中。因此 `"0200"` 不会被静默归一为 `200`，命名节点既有的
  string identity 和前导零行为不变。
- “不做限制”解释为 schema/UI 不设置映射条数上限，而不是放宽 ZIP 大小、文件数、内存或
  浏览器安全边界。用户仍需一条一条显式添加和绑定图片。
- “图片绑到同一个节点”表示特殊图片完全复用节点 target/slot/anchor/transform/color；图片
  使用自身自然尺寸，不按 glyph `lineHeight` 拉伸，也没有额外 placement 表单。
- “所有类型都能加”解释为命名节点 target 不再只接受 direct Spine state。能够定位唯一
  official Spine player 的 direct Spine 或 tiered active Spine state 走 exact slot；其它 top-level
  visual 一律走固定 direct overlay。Composite 即使含 Spine leaf 也作用于合成结果整体，不新增
  leaf selector 或猜测某个内部 slot。
- Symbols Editor 内两个 ImgNumber 入口使用同一 sparse mapping 语义；standalone ImgNumber
  dependency 仍只描述通用字符资源，不携带 `mini` 这类 symbol/game-owned 业务映射。

### 关键决策

1. **在 symbol-owned ImgNumber spec 增加 optional `specialValueImages`**
   - 公共元素统一为 strict `{ value: number, image: string }`；命名 node 各自持有一份，
     value-presentation 的 image-string text 持有一份由全部 tier 共用的列表。
   - 使用有序数组保证 UI/ZIP 顺序和重复诊断；缺省归一为空数组，非空才导出。保持 manifest
     `version: 1` 和旧 package 兼容，不新增 alias。

2. **特殊图片是 image-string 分支内的显示资源，不是第四种 text mode**
   - `font | image | image-string` union 不变；snapshot/public API 仍报告逻辑类型
     `image-string`，`setImageStringText()`/`getImageStringText()` 继续保存原始 string。
   - 映射命中时不要求该值的字符存在 glyph，因为不会进行文字渲染；未命中值仍严格要求完整
     glyph，不因存在其它映射而放宽验证。
   - 现有完整图片 `text.type = "image"` 继续要求配置集中的完整 value→image 表，不自动转换
     为 sparse mapping。

3. **复用一个稳定外层节点，原子切换 special Sprite 与 glyph renderer**
   - resource prepare 解析 mapping/path 并准备 texture；缺图、错误 media、decode failure 在
     catalog/presentation commit 前失败。
   - 外层 container 承担现有 position/scale 和 slot attachment；内部只激活 special Sprite 或
     `RenderImageString.container` 之一。special Sprite 使用相同 anchor，切换失败时旧 text、
     child、snapshot 和 attach 状态保持不变。
   - package/resource pool 拥有 texture/URL；display/controller 只销毁自己的 Sprite/container，
     不销毁共享 texture。reset 恢复 `initialText` 对应的 special/glyph 结果，destroy 幂等。

4. **特殊图片走统一 filename-key 与 exact closure**
   - `image` 必须是相对 symbol manifest 的 canonical local filename-key 引用，支持当前普通图片
     media 合同，不接受 URL、data URL、glob 或路径猜测。
   - closure collector、module loader、Vite generator、editor 引用图和 ZIP materializer 都从
     typed mapping 收集图片；配置了但当前 preview 未命中的图片仍是正式 closure 成员。
   - overwrite 保持 exact binding；keep-both 需用户确认并重新选择 resolved key。取消、stale
     picker 或 export revalidation 失败时项目不变。

5. **Symbols Editor 复用现有 Resource Picker，不增加第二套上传器**
   - 每个 ImgNumber 表单增加 “Special value images” 列表和逐条新增/删除；每行编辑 numeric
     value，并通过普通 image Picker 选择/更换/清除 filename key。
   - 上传继续走统一 review，不从文件名/顺序自动绑定。draft 可暂时不完整，但
     preview/export/status 明确标出空值、重复值、空图片或不兼容资源。

6. **Target 使用按 state visual 严格判定的 slot/direct union**
   - Spine target canonical 为 `{ state, slot }`；non-Spine target canonical 为 `{ state }`。UI 根据
     当前 state 类型自动显示 exact slot selector 或“直接 ImgNumber 图层”，不让用户为普通图片
     选择无意义 slot/placement。
   - direct Spine 校验该 skeleton 的 slot；value-presentation normal/activeSpine 校验所有 tier 的
     common exact slot。Composite、VNI、image、layered/state texture、builtin/static/empty 使用
     direct overlay，同一 state 的多个节点按 manifest node 顺序稳定叠放。
   - runtime 增加不被 animation reset 清空的顶层 ImgNumber overlay；resolved state 同步 direct
     target，Spine player ready 后以 owner/generation guard attach slot，旧异步 player不得夺回。
   - state 从 Spine 改为 non-Spine 时事务性移除已失效 slot 并报告；反向切换时清空 slot、标记
     target 未完成并要求用户显式选择，不猜首个或同名 slot。

## 5. 职责与合同

- **Image-string dependency**：继续只拥有 glyph/metrics/fixed group 和共享 texture resource；
  不保存 symbol-owned 特殊值语义。
- **rendercore symbol manifest/runtime**：拥有两个 ImgNumber consumer 的 strict mapping schema、
  target attachment union、exact matching、资源 prepare、显示切换和 lifecycle；不认识 `mini`
  或游戏 component。
- **Symbols Editor**：拥有 mapping draft/UI、普通图片选择、filename-key review、引用重写、
  preview 和 package IO；不复制 Pixi display tree 或 texture loader。
- **数据合同**：`specialValueImages` 缺省等于 `[]`；元素 exact keys 为 `value/image`，value 是
  safe integer且唯一，image 是 canonical local image ref。target 是 strict `{state,slot}` Spine
  或 `{state}` direct union；对象、元素和字段严格拒绝未知值。
- **资源生命周期**：全部 image-string dependency 与 special textures 先 prepare，再创建/提交
  catalog 或 presentation；任一失败 rollback 已准备的临时 display/resource，active package
  不半提交。共享 texture 只由 package/resource owner unload。
- **失败策略**：重复/非 safe integer value、非法路径、非图片、缺失 module、decode failure、
  target 类型与 slot 不匹配、tier slot 不一致、stale binding 和未映射值缺 glyph均尽早失败。
- **禁止行为**：不创建第二个业务 state/layer，不从文件名猜 value/slot，不静默数值归一化，
  不按条目顺序 fallback，不用 glyph/字体/placeholder 掩盖缺图或错误 attachment。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/symbol-image-string/mapped-display.ts
packages/rendercore/tests/symbol-image-string/mapped-display.test.ts
tasks/160-symbolseditor-imgnumber-special-values-and-all-state-targets-<utctime>.md
```

若公共 mapped display 能在现有 `controller.ts`/`value-display.ts` 中保持职责清晰，可不新增
生产文件；执行报告只在实现与验收完成后创建。

### 预计修改

```text
packages/rendercore/src/symbol/{manifest,package,render-symbol,types}.ts
packages/rendercore/src/symbol-image-string/{types,resources,controller}.ts
packages/rendercore/src/symbol-value-presentation/{types,create-symbol-value-presenter,value-display,render-symbol-value-controller}.ts
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/tests/symbol/{manifest,package,render-symbol,symbol-value-vite-resource-generator}.test.ts
packages/rendercore/tests/symbol-image-string/controller.test.ts
packages/rendercore/tests/symbol-value-presentation/*.test.ts
packages/rendercore/README.md
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/ui/{resource-picker,workspace-app}.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{image-string-dependency,editor-project,resource-picker,app-shell,zip-io}.test.ts
apps/symbolseditor/README.md
docs/symbol-package.md; docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

### 原则上不应修改

```text
apps/imgnumbereditor/**
apps/{popupeditor,gamelayouteditor,gameviewer,gameviewer2,game002,game003}/**
packages/{logiccore,gameframeworks,editorresource,browserartifactio}/**
packages/rendercore/src/{popup,scene-layout}/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

若实现需要修改 standalone image-string schema、其它 package 的 public manifest、正式游戏资源、
依赖或 lockfile，属于明显范围扩张，执行前必须说明原因并重新评估计划。

## 7. 实施步骤

1. **确认执行基线并固定兼容行为**
   - 重核 HEAD/status、领域规则、现有 node/value-presentation parser、resource pool、closure、
     Picker 与 ZIP round-trip。
   - 先增加无 `specialValueImages` 的兼容断言，以及“200 当前按 glyph 显示”的失败前基线；
     仓库发生重大 schema/lifecycle 变化时停止说明。

2. **实现 strict manifest 与 exact closure**
   - 定义共享 mapping type和 target union；在命名 node 与 image-string value-presentation text
     中解析 optional ordered mappings，校验 exact keys、value、image、state visual 与 slot。
   - 扩展 `collectSymbolManifestResourcePaths()`、package modules/resource prepare 和 generator，
     把所有 special image 精确加入 resources/import/loading map；缺失和 orphan 继续由 package
     parity 阻断。

3. **实现共享 mapped ImgNumber display**
   - 建立一个复用 helper，先按 `text === String(value)` 选择 prepared special texture，否则
     调用现有 `RenderImageString`；对 special Sprite 应用同一 anchor，并保持稳定外层 container。
   - 接入命名 controller 的 set/get/reset/state attach/destroy，以及 value-presentation 的
     prepare/show/setText/clear/destroy；保证切换、失败和 late prepare 均为原子事务。

4. **把命名节点接入全部 state visual**
   - 在 `RenderSymbol` 建立固定顶层 ImgNumber overlay，并给 controller 增加 resolved-state sync；
     non-Spine target 直接按 node 顺序挂载，不被 builtin/VNI/composite reset 清空。
   - direct Spine 继续走现有 player hook；value-presentation active Spine 增加等价通知。切换
     direct↔slot、continuation、late init、state texture priority、pool release 和 destroy 时只保留
     当前 target attachment。

5. **扩展 Symbols Editor draft、引用图和 UI**
   - 在两个 ImgNumber 面板接入同一 mapping list UI；支持逐条 add/edit/remove、普通 image
     Picker、缩略图、错误状态和键盘可操作标签，不设置条数上限。
   - target state selector 枚举所有 configured state；Spine/activeSpine 显示 common exact slot，
     其它类型显示只读 direct overlay。扩展 clone/import/compile/reference/status/preview，并保留
     state rename/delete/type-change 的 transaction/rollback。

6. **补齐 package、transaction 和 preview 测试**
   - rendercore 覆盖 optional/default、稳定顺序、重复/非法值、unknown field、非法 ref、
     mapped↔glyph 切换、共享 texture、direct/slot target、all visual kinds、late init、reset/destroy、
     missing/decode/orphan 和两个 ImgNumber consumer。
   - Symbols Editor 覆盖多条逐项操作、重复提示、Picker 选择/清除、upload review 取消/stale、
     overwrite/keep-both、200 special/150 glyph preview、export→reimport parity 与 exact closure。
   - generator fixture 同时包含 mapped/unmapped default values，确认 special image import 一次且
     loading map 精确；不手改任何生成输出。

7. **文档、定向验收与报告**
   - 更新 Symbols Editor 使用说明、rendercore public behavior、Symbol Package closure，以及两份
     领域规则中长期稳定的 sparse mapping/strict failure 边界。
   - 运行 L2 命令和浏览器人工验收；通过后生成任务 160 UTC 中文执行报告，记录实际文件、
     偏差、命令结果和未完成人工项。

## 8. 测试与验收

### 测试原则

- 不为构造方便放宽 exact path、value uniqueness、glyph validation 或 package orphan 校验。
- 正常路径同时验证 `200 -> special image` 与 `150 -> glyphs`，并验证 special→glyph→special
  往返不会重复 attach、泄漏 Sprite 或丢失原始 text。
- target matrix 至少覆盖 image、layered/state texture、VNI、composite、builtin/static/empty 的
  direct overlay，以及 direct Spine、tiered active Spine 的 exact slot；混合 multi-target 复用同一
  renderer/text identity。
- strict failure 覆盖坏值、重复值、缺图、错误类型、decode failure、未命中缺 glyph、stale
  Picker 和 ZIP resources 漂移；失败后旧 draft/preview/runtime snapshot 不变。
- 没有 mappings 的现有 node/value-presentation 测试必须继续通过，不复制无关 popup 或
  scene-layout coverage。

### 验收级别

`L2`。本任务修改 rendercore 的公开 symbol manifest 类型、package exact closure、资源生命周期
和 Symbols Editor 直接 consumer，并影响 value-presentation Vite resource generator；必须验证
shared package 与直接 consumer，但不涉及根工具链、lockfile、release 或大规模跨包重构，不升级
到 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter symbolseditor typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolseditor test
pnpm --filter @slotclientengine/rendercore build
pnpm --filter symbolseditor build
git diff --check
```

rendercore 测试必须包含 generator fixture/checker；本任务不修改正式 YAML/生成输出，因此不另跑
无目标 manifest/out 的生成命令。失败时先运行对应 Vitest 文件最小化复现，不扩展到根级扫描。

### 人工验收

1. 在浏览器创建一个可预览的命名 ImgNumber 节点，依次添加 `200 -> mini`、另一个数值映射，
   通过 Picker 逐张选择普通图片；确认没有批量推导或条数上限。
2. 输入 `200` 只显示整张 special image，输入 `150` 显示 glyph `150`，再切回 `200`；切换
   symbol state 后仍使用同一 anchor/transform，且 preview 无重挂闪烁或旧 child。
3. 将同一命名节点分别绑定普通图片/VNI/composite state，确认 UI 不要求 slot且直接作为顶层
   overlay；绑定 official Spine 和 value-presentation active Spine state 时必须选择真实/common
   slot，错误 slot 阻断 preview/export。
4. 对 value-presentation 共享 ImgNumber 重复 mapped/unmapped 预览；导出并重新打开 Symbols ZIP，
   确认 mapping 顺序/引用保持、special 图片进入 exact closure、未引用图片不导出。
5. 覆盖一个被映射图片并检查 review/reference；取消和失败时 active draft/preview 不变，显式
   keep-both 后只有再次选择 resolved key 才更新映射。

### 独立验收建议

`建议`，因为涉及 public schema、exact ZIP closure、共享 texture ownership 和原子切换：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolseditor test
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 `pnpm`；不切换 npm/yarn，不升级现有版本。
- shell 没有 Node 时执行 `source /Users/zerro/.nvm/nvm.sh` 后 `nvm use 24`。
- 依赖缺失时执行 `CI=true pnpm install --frozen-lockfile`；下载失败后才设置本地代理重试。
- 预计不新增依赖或 lockfile；现有 Pixi、texture cache、workspace 和 Picker 已覆盖所需能力。

## 10. 生成物、文档与规则

- 通过 generator 单测验证 special image import/loading parity；无明确 manifest/out 时不生成临时
  正式文件，也不手改 generated TypeScript。
- 更新 Symbols Editor/rendercore README、`docs/symbol-package.md`，并最小更新两份领域规则，
  记录 mapping ownership、all-state attachment、exact selection 和 strict failure。
- 不修改 YAML、manifest 实例或正式 assets；未来实例采用字段时由正式 generator 更新并
  运行 `--check`。根 `AGENTS.md` 职责不变。

## 11. 执行报告

规划时不生成报告；完成后创建
`tasks/160-symbolseditor-imgnumber-special-values-and-all-state-targets-<utctime>.md`。

报告记录实现/文件、决策偏差、验收结果和剩余风险；不收集无关整仓数据。

## 12. 风险、假设与待确认

### 风险

- special 图片自然尺寸可能与 glyph 不同；美术需提供适配既有 anchor/scale 的图片并预览。
- direct overlay 必须独立于 animation overlay，z-order 固定且不改变现有视觉层顺序。
- tiered active Spine 只有全部 tier 共同存在的 exact slot 才可选择；资源替换导致交集消失时必须
  使 target 显式失效或事务回滚，不能沿用旧 slot。
- 同步 setter 要求 special texture 在 prepare 完成；同 key 覆盖影响全部引用，review 必须列出。
- mapping 数量无产品上限但会线性增加体积/预加载成本，仍受现有 ZIP/workspace limits 约束。

### 假设

- 特殊映射的输入域沿用 JavaScript safe integer；runtime 以 `String(value)` exact match，既不
  做 locale formatting，也不把带前导零的 string 当作同一值。
- special 图片用自然宽高和节点 anchor/transform；direct overlay 无 Spine color source，
  `followSlotColor` 仅在 slot attachment 时生效。
- 命名 ImgNumber 和 value-presentation 共享 ImgNumber 都属于本需求；popup/scene-layout 的普通
  image-string 不属于 `apps/symbolseditor` 范围。

### 待确认

无；当前入口、string/value contract 和用户要求足以确定以上解释。

## 13. 完成清单

- [ ] sparse mapping、all-state target、CRUD/Picker/preview 和 ZIP 往返满足目标。
- [ ] public schema、exact closure、prepare/rollback/destroy 与 strict failure 符合计划。
- [ ] 旧 manifest、无 mapping ImgNumber、font 和完整图片模式保持兼容。
- [ ] 指定 L2 自动化和人工验收通过。
- [ ] README/规则/Symbol Package 文档与 UTC 中文执行报告已完成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的两份领域规则和本计划；
2. 核对 HEAD、工作区和实际 runtime/editor 入口；
3. 先固定兼容/失败测试，再实现 shared contract 和 UI，不另建第二套 ImgNumber schema；
4. 小幅适配当前实现时在报告记录，明显扩大到 standalone/popup/scene-layout 时先停止说明；
5. 运行 L2 与人工验收并生成报告；除非用户明确要求，不 commit、push 或创建 PR。
