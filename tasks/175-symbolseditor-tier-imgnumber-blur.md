# 175 symbolseditor-tier-imgnumber-blur 任务计划

## 1. 目标与完成定义

### 目标

调整 `apps/symbolseditor` 的 value-managed symbol 编辑流程，使每档 ImgNumber 的编辑与该档
Spine 资源位于同一档位卡内；同时让每个档位可以显式绑定 non-Spine `spinBlur` 状态，并在
浏览器本地从该档 normal ImgNumber 生成、安装和绑定对应的模糊 ImgNumber profile。

共享 Normal slot、anchor、transform、`followSlotColor` 和特殊数值配置继续只编辑一次，不因
UI 归位而恢复旧的 per-tier 重复配置。运行时按当前 value 先命中 tier，再让同一个稳定
ImgNumber container 在该档 Spine slot 与顶层 `spinBlur` overlay 间切换，并在状态边界原子切换
normal/blur assets；runtime 不生成像素，也不创建第二个 ImgNumber instance。

### 完成定义

- [ ] value 编辑页的每个 tier 卡同时包含该档 threshold、Spine 资源、normal ImgNumber JSON、
      `spinBlur` 绑定状态及“生成并绑定模糊 ImgNumber”操作；不再在独立 Number presentation
      tier 列表重复展示每档 JSON。
- [ ] presentation 类型选择和共享 Normal slot/transform/color/special map 仍只有一个权威编辑入口；
      修改共享字段作用于所有档位，UI 不伪装成某一档私有值。
- [ ] 每档可独立选择是否绑定 exact non-Spine `spinBlur`，并引用与该档 normal dependency
      layout 严格兼容的 blur profile；未绑定档位不显示模糊 ImgNumber，也不回退其它档位。
- [ ] 生成操作只处理目标 tier 当前 normal dependency 的 unique glyph source 和共享特殊值图片，
      使用 rendercore versioned `spinBlur` preset 生成 PNG，并在一次 project transaction 中安装
      dependency、assets 和该档 binding。
- [ ] 不同档位或命名 node 使用同一 normal dependency 时复用同一有效 blur dependency及相同
      source special 图片的派生结果；复用不再次执行像素生成，不合并 logical binding。
- [ ] 当前 value 命中 tier N 时，normal/Spine state 使用 tier N normal profile；exact `spinBlur`
      使用 tier N blur profile并挂到固定顶层 overlay。normal↔spinBlur 往返保持外层 container、
      renderer occurrence 和当前 text，late player init 不得抢回不可见 slot。
- [ ] blur profile 缺失、过期、layout/special 集合不一致、tier 数量错配、非法 state、缺资源、
      hash/size/path/orphan 或异步 revision race 均在可见提交前显式失败并回滚。
- [ ] 旧 shared `tierResources[]`、旧 per-tier 完整 `text.tiers[]`、无 value blur 的 package以及
      任务 171 的命名 node `spinBlurProfile` 均可无损导入、运行和重导；新数据只写 canonical 结构。
- [ ] 完成 L2 定向自动化和真实浏览器人工验收，并生成任务 175 UTC 中文执行报告。

## 2. 范围

### 包含

- Symbols value ImgNumber 的 per-tier `spinBlur` public manifest contract、strict parser、deep freeze
  和 legacy/canonical 边界。
- rendercore package exact closure、mapped materialization、Vite resource generator、资源池和
  value controller 对 tier blur profile 的 prepare/switch/rollback/destroy。
- Symbols Editor 的档位卡布局、draft transaction、生成 availability、派生 dependency 复用、
  引用图、replacement invalidation、diagnostics、preview 与 ZIP round-trip。
- 任务 171 生成器的通用化复用，但保持命名 `imageStringNodes[]` 的现有按钮、跨 node 自动绑定和
  legacy target-only 行为不变。
- 直接测试、README、Symbol Package 文档和最小领域规则同步。

### 不包含

- 不恢复任务 169 的每档 slot/transform/color/special map 重复编辑；旧 per-tier 完整 binding仅兼容。
- 不给 `font` 或完整数值图片 presentation 增加 blur profile，不修改 threshold、Spine animation
  统一选择或 state texture 本体的生成语义。
- 不为 `disabled`、自定义 state 或任意 filter/effect 增加通用 profile DSL；本任务只处理 exact
  non-Spine `spinBlur`。
- 不修改 standalone `apps/imgnumbereditor` 的 manifest/UI，不改变 ImgNumber v1 glyph/layout schema。
- 不在 runtime 解码、模糊或编码，不用 shader/font/placeholder/首档/相邻档作 fallback。
- 不修改 Popup、Scene Layout、game002/game003 业务 resolver、正式 `assets/**`、根工具链或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-06T06:18:20Z
HEAD: cd0063542060684a6d30992b4d3b804497555fa6
branch: (detached HEAD)
git status --short --untracked-files=all: <clean>
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/editor-artifacts.md`、`shared-game-runtime.md`、任务 169～171、174 的计划/执行
  结果以及当前 Symbols Editor/rendercore 相关实现；目标目录没有更深 `AGENTS.md`。
- `valueInspectorMarkup()` 当前先用 `valueTierMarkup()` 输出只含 threshold/Spine 的档位卡，再由
  `valueNumberPresentationMarkup()` 输出另一组 `Tier N ImgNumber JSON` 卡，因此同一档配置分散在
  两处。shared variant 的 slot/transform/color/special map 已是一张唯一 Normal 卡。
- `SymbolValuePresentationSharedImageStringTextSpec` 当前只有与 Spine tiers 等长的
  `tierResources[]` 和一份共享 Normal binding；legacy variant仍是完整 `text.tiers[]`。增删、移动
  tier 已同步操作对应 normal resource数组，适合继续使用相同 index作为唯一档位对齐。
- `SymbolImageStringNodeSpec.spinBlurProfile`、`image-string-spin-blur-generation.ts`、mapped display
  `setResource()` 和 symbol image-string controller已实现命名 node 的 normal/blur strict parity、
  unique-source生成、共享dependency复用和单container切换，但 availability/transaction只接受
  `imageStringNodes[nodeIndex]`。
- value presentation resource bundle当前每档只prepare normal `resource/specialValueImages`；
  `RenderSymbolValueControllerModel` 把 display挂到tier player slot。requested `spinBlur` 命中显式
  state texture 时active Spine不显示，value ImgNumber也没有exact direct overlay/profile切换合同。
- `packages/rendercore/src/symbol/{package,materialize-package}.ts`和
  `scripts/generate-symbol-value-vite-resources.mjs`已结构化收集/改写normal value ImgNumber与命名
  blur profile；本任务应扩展这些typed traversal，不扫描文件名或JSON字符串。

## 4. 需求解释与技术决策

### 需求解释

- “ImgNumber 的编辑放在档位编辑里”指档位私有的 normal JSON选择、blur绑定与生成操作和该档
  Spine资源共处一张tier卡；presentation类型和真正共享的Normal字段保留一个公共入口，不复制表单。
- “档位的 ImgNumber 绑定模糊状态”指当前 value 命中的档位可在requested `spinBlur`时显示该档
  ImgNumber；它是non-Spine顶层overlay，不尝试绑定到不可见的tier Spine slot。
- “生成模糊图”同时覆盖该档dependency中的全部unique glyph source及共享special map引用的图片；
  不是抓取Spine帧、模糊整symbol、运行时filter或只改变预览CSS。
- 每个tier的blur启用是显式选择。一个tier已配置不自动扩大其它tier的state覆盖；资源生成结果可以
  共享，但每个tier binding分别拥有引用。

### 关键决策

1. **档位卡组合 UI，不恢复重复配置**
   - `valueTierMarkup()`接收当前text/dependency/slot metadata并内嵌该index的normal JSON、blur状态和
     操作；`valueNumberPresentationMarkup()`只保留类型选择和共享Normal配置。
   - tier summary同时显示Spine、normal ImgNumber和blur三类ready状态；缺一项明确指出，不把整体
     “资源就绪”冒充blur可用。

2. **为value ImgNumber增加按tier对齐的显式blur profile**
   - shared canonical text增加可选、与`tierResources[]`等长的tier blur profile序列；每项只能是
     显式未绑定或`{ resource, specialValueImages? }`，profile存在即表示该tier绑定exact
     non-Spine `spinBlur`。
   - legacy完整tier binding增加同形可选`spinBlurProfile`，使旧结构无需先重写成shared variant也能
     无损补充能力；shared/legacy仍互斥，新导出保留导入variant，不静默改变共享语义。
   - parser要求state preset中存在`spinBlur`、profile序列长度与Spine tiers相等、normal/blur layout
     和special value集合一致；不增加generic targets或任意state effect DSL。

3. **按当前value/tier切换同一display**
   - resource bundle为每档准备normal binding和可选blur binding，使用现有image-string pool按
     canonical resource path共享texture owner，并在画面mutation前完成layout/glyph/special校验。
   - value controller在active Spine state把稳定`displayRoot`附着该档slot；exact `spinBlur`时先切换
     该档blur profile，再把同一root放到symbol overlay。离开blur先恢复normal profile，再按当前
     state资格reattach/隐藏。
   - 同tier value变化继续只`setText()`；跨tier允许替换内部renderer/profile，但外层displayRoot保持。
     prepare失败保留上一次已提交画面，clear/release/destroy只释放各owner一次。

4. **复用现有preset和派生identity，提交范围保持tier显式**
   - 把任务171生成实现拆成normal dependency→blur dependency/special outputs的无UI helper；命名node
     与value tier调用同一preset、source digest、codec、layout parity和content-addressed安装路径。
   - value操作只绑定用户点击的tier；其它同源tier可在各自显式操作时零生成复用。命名node原有
     “全部eligible node原子绑定”行为保持，不被value tier的新范围改变。
   - source dependency、共享special map或preset identity变化使关联profile stale；replacement/rename/
     delete事务性清理或拒绝提交，不继续使用旧blur bytes。

5. **所有blur资源通过typed closure进入交付物**
   - package collector、materializer、mapped rewrite、Vite generator和Editor引用图按tier profile字段
     收集root/glyph/special refs；相同bytes可物理去重，logical tier引用不合并。
   - 完整 Symbols ZIP单独打开、hash/size/path/orphan及legacy direct package规则保持，不新增路径猜测。

## 5. 职责与合同

- **rendercore manifest/package**：拥有value tier blur typed spec、strict state/layout/special/tier校验、
  exact closure、mapped rewrite和legacy兼容；Symbols Editor不复制正式parser。
- **rendercore runtime**：拥有tier解析、normal/blur resource pool、single-container profile切换、
  slot/direct/hidden attachment资格和prepare/rollback/destroy。
- **Symbols Editor**：拥有档位表单、显式生成动作、browser codec、project revision guard、dependency
  安装/复用、引用图、诊断、preview和ZIP IO；不实现glyph layout或Pixi状态机。
- **数据合同**：normal和blur profile使用同一tier index；blur glyph字符、metrics、size/offset、fixed
  groups与normal一致；blur special values与共享/legacy normal special集合精确一致。
- **资源生命周期**：decode/generate/install/bind先在clone project prepare，全部校验成功后一次commit；
  runtime先prepare当前档两套profile，切state只切borrowed资源和attachment，package owner最终destroy。
- **失败策略**：非法/未知字段、数组错位、无spinBlur state、空resource、stale派生物、缺glyph/special、
  layout不一致、revision race和closure错误显式失败，不留下半提交assets或改变active preview。
- **禁止行为**：不重复shared配置、不按tier名/filename/首项猜profile、不自动扩大state覆盖、不复制
  preset像素算法、不在runtime生成、不用normal asset静默冒充新blur binding。

## 6. 文件范围

### 预计新增

```text
tasks/175-symbolseditor-tier-imgnumber-blur-<utctime>.md
```

仅在执行和验收后新增报告；原则上不新建production module，除非拆分现有生成器是保持职责清晰所必需。

### 预计修改

```text
packages/rendercore/src/symbol/{manifest,package,materialize-package}.ts
packages/rendercore/src/symbol-value-presentation/{types,create-symbol-value-presenter,value-display,render-symbol-value-controller}.ts
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/tests/symbol/{manifest,package,materialize-package,symbol-value-vite-resource-generator}.test.ts
packages/rendercore/tests/symbol-value-presentation/{manifest-resources,render-symbol-value-controller,symbol-value-presenter}.test.ts
packages/rendercore/README.md
apps/symbolseditor/src/model/{editor-project,image-string-spin-blur-generation}.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{app-shell,editor-project,image-string-spin-blur-generation,resource-picker,zip-io}.test.ts
apps/symbolseditor/README.md
docs/symbol-package.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

若实现中抽取纯生成helper，可新增同目录定向module/test并在报告说明；不新增package或依赖。

### 原则上不应修改

```text
apps/imgnumbereditor/**
apps/{popupeditor,gamelayouteditor,gamelayoutpkgcli,game002,game003,gameviewer,gameviewer2}/**
packages/rendercore/src/image-string/{manifest,types,layout}.ts
packages/rendercore/src/{popup,scene-layout}/**
packages/{logiccore,gameframeworks,uiframeworks,editorresource,browserartifactio}/**
assets/**
AGENTS.md
pnpm-lock.yaml
```

若需要修改ImgNumber v1 schema、state preset、正式assets、consumer业务代码或lockfile，属于明显范围扩张，
执行前必须停止并说明，不能通过修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线并固定现有兼容行为**
   - 重核HEAD/status、两份领域规则、任务170/171/174合同和本计划目标文件。
   - 先以定向fixture固定shared/legacy value ImgNumber、命名node blur、tier增删移动、normal slot预览和
     无blur旧package行为，仓库变化仅作小幅路径适配。

2. **增加per-tier blur manifest与资源合同**
   - 扩展shared/legacy typed spec、strict parse/deep freeze、tier对齐、state存在、layout/special parity和
     unknown-field rejection；为未绑定项保留显式无profile语义。
   - 扩展resource bundle输入，使每档normal/blur都通过共享pool prepare，并在default/runtime value上
     分别校验glyph或special exact命中。

3. **同步closure、materializer与generator**
   - 在package collector、mapped materializer和Vite generator结构化遍历tier blur root/glyph/special；
     保持filename-key rewrite、完整SHA-256、byte length、media type和orphan验证。
   - 测试覆盖同resource去重、不同logical key、缺leaf、hash错、mapped round-trip和legacy输入。

4. **实现value controller的blur profile/attachment切换**
   - 为value image-string display提供原子normal/blur profile切换能力，复用现有mapped renderer资源切换；
     相同profile重复请求为no-op，失败保持旧profile/text。
   - 在controller按requested presentation state决定Spine slot、exact spinBlur overlay或hidden；处理init前后
     切state、快速往返、同tier setText、跨tier重建、pool release和幂等destroy。

5. **通用化浏览器生成与事务**
   - 抽取任务171的dependency digest、unique glyph/special generation、layout parity和安装/复用逻辑，
     给命名node和value tier提供各自binding adapter。
   - value tier availability精确报告无normal dependency、未启用blur、缺图、stale/layout冲突、已绑定
     和可复用；点击使用clone+request/revision guard，成功才replace project并切preview到spinBlur。
   - dependency/resource/special replacement、tier move/remove和text type切换同步重写/清理profile引用，
     引用图阻止删除仍被任一tier/node使用的派生dependency。

6. **重组档位UI并接入preview**
   - 把normal JSON selector、blur binding/status/button放入对应`valueTierMarkup()`；tier增删移动时与Spine、
     normal和blur数组在同一transaction保持index对齐。
   - 公共Number presentation区域只保留模式选择与唯一共享Normal卡，并明确其作用域；legacy完整binding
     在各tier卡展示原有私有字段，不自动迁移或广播。
   - preview用session的单一value自动命中tier，normal显示该档normal资源，spinBlur只在该档已绑定时显示
     blur；生成失败保留上次有效preview和选择。

7. **测试、文档、验收与报告**
   - Editor覆盖DOM归位、tier对齐、首次生成、跨tier/node复用、special去重、stale/revision race、
     rollback、引用保护和ZIP重导；rendercore覆盖schema/closure/profile identity/late-init/destroy。
   - 更新三个文档和两份领域规则，运行第8节L2命令，完成真实浏览器验收并生成UTC报告。

## 8. 测试与验收

### 测试原则

- UI测试必须证明每档只有一处normal JSON/blur编辑入口，tier move后Spine与两套ImgNumber profile仍同index；
  不只断言按钮文案。
- 生成测试使用有区分度RGBA fixture，断言normal/blur bytes不同、尺寸相同、unique source调用次数和
  第二档/命名node复用零生成；不以文件名代替像素及layout验证。
- runtime覆盖normal→spinBlur→normal、init前/后切换、重复sync、同tier改值、跨tier、special↔glyph、
  clear/release/destroy；断言container identity、attachment和resource owner计数。
- strict failure覆盖profile/tier错位、无state、layout/special不一致、缺glyph/image、stale source、
  revision race、mapped orphan和shared/legacy混写。
- 旧package fixture必须证明“无blur仍无blur”且可往返；不得把命名node legacy normal-assets行为错误扩展
  成新value tier fallback。

### 验收级别

`L2`。任务修改rendercore public Symbols schema、package closure/generator和runtime lifecycle，并由
Symbols Editor直接消费；需验证修改package与直接consumer。不改根工具链、lockfile、正式发布物或
大规模无边界重构，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/manifest.test.ts tests/symbol/package.test.ts tests/symbol/materialize-package.test.ts tests/symbol/symbol-value-vite-resource-generator.test.ts tests/symbol-value-presentation/manifest-resources.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor exec vitest run tests/app-shell.test.ts tests/editor-project.test.ts tests/image-string-spin-blur-generation.test.ts tests/resource-picker.test.ts tests/zip-io.test.ts
pnpm --filter symbolseditor build
git diff --check
```

六条命令分别证明rendercore编译、public schema/closure/runtime、Editor编译、UI/transaction/ZIP、浏览器
bundle和diff卫生。失败先最小化到单文件/用例，不扩大到根级typecheck/lint/test/build/format。

### 人工验收

1. 启动Symbols Editor，导入至少两档且normal ImgNumber外观不同的value symbol；确认每张tier卡内直接
   编辑本档Spine、normal JSON和blur，不再到页面底部寻找第二组tier卡，共享Normal字段仍只有一处。
2. 只为第一档生成并绑定blur：用preview value分别命中第一/第二档并切normal/spinBlur，确认第一档显示
   对应模糊glyph/special，第二档明确未绑定且不借用第一档profile。
3. 为第二档选择与其它tier或命名node相同normal dependency再生成，确认直接复用且无再次像素生成；
   导出重导后各tier引用、共享Normal配置和视觉保持。
4. 用DevTools/debug snapshot反复切normal/spinBlur并跨threshold，确认同tier无第二个ImgNumber container、
   late Spine init不抢overlay、跨tier旧renderer/player被释放，销毁后无Object URL/texture owner残留。

### 独立验收建议

`必须`。本任务涉及跨包public manifest、浏览器异步生成transaction、exact resource closure及
slot/overlay资源ownership。独立复验高风险点：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/package.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts
pnpm --filter symbolseditor exec vitest run tests/app-shell.test.ts tests/image-string-spin-blur-generation.test.ts tests/zip-io.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的Node 24；shell没有Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用pnpm，不切换npm/yarn；依赖缺失时运行`CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才设置仓库约定`http_proxy/https_proxy`并重试原命令。
- browser codec、SHA-256/content addressing、rendercore blur preset和mapped image-string profile切换均已有；
  本任务不新增依赖或lockfile。若执行发现必须新增，先说明必要性和影响。

## 10. 生成物、文档与规则

- 派生glyph/special PNG只能通过Editor浏览器生成器进入asset library；正式ZIP继续由mapped exporter
  计算完整SHA-256、size、media type和physical path，不手改`assets.map.json`或payload。
- Vite generator仅更新脚本/fixture；若触及正式生成物必须使用对应生成器和`--check`，本计划预计无
  YAML、正式asset或generated TypeScript diff。
- 更新`apps/symbolseditor/README.md`、`packages/rendercore/README.md`和`docs/symbol-package.md`，说明
  tier内authoring、shared Normal边界、per-tier blur schema、exact closure和single-container切换。
- 最小更新`docs/agent-rules/editor-artifacts.md`、`shared-game-runtime.md`，把“每tier只声明normal JSON”
  扩展为“每tier normal JSON及可选explicit spinBlur profile，显示配置仍共享”；不修改根`AGENTS.md`。

## 11. 执行报告

规划时不生成报告。实现和验收完成后创建：

```text
tasks/175-symbolseditor-tier-imgnumber-blur-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录实际文件、schema/legacy边界、生成复用、runtime
ownership、计划偏差、六条命令结果、人工/独立验收状态和剩余风险；不收集无关coverage或整仓统计。

## 12. 风险、假设与待确认

### 风险

- tier增删/移动同时影响Spine、normal resource和blur profile三组对齐；任一遗漏会把合法资源绑定到错误阈值。
- 同normal dependency可跨tier/node复用blur bytes，但shared/legacy special map不同；只能复用dependency，
  special派生引用仍必须按exact source/value集合验证。
- value player异步init与non-Spine state交错；若attachment资格检查不看requested state，晚到player会造成
  blur短暂消失或被normal profile覆盖。
- 自动化可证明bytes、identity和调用计数，不能替代真实Spine slot、模糊视觉和快速切换闪帧验收。

### 假设

- 用户所说“模糊状态”是仓库preset中的exact `spinBlur`，不是`disabled`或自定义state。
- 每档是否显示blur需要显式配置；未配置表示该档在spinBlur不显示ImgNumber，不沿用normal assets。
- shared Normal slot/transform/color/special是任务170已确立的owner合同，本任务只移动档位私有编辑并新增
  tier blur profile，不恢复任务169的重复字段。

### 待确认

无。以上解释可由当前schema、任务170/171合同和用户本次明确需求共同确定。

## 13. 完成清单

- [ ] 每档Spine、normal ImgNumber JSON和blur authoring位于同一tier卡，共享Normal无重复入口。
- [ ] per-tier blur schema、legacy边界、strict failure和exact closure满足计划。
- [ ] normal/spinBlur使用同一value ImgNumber container，late init、rollback和destroy正确。
- [ ] 生成器按tier显式绑定、跨tier/node复用、stale invalidation和revision guard正确。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] README、Symbol Package文档和两份领域规则已同步，未修改根规则/lockfile/正式assets。
- [ ] 指定L2自动化、真实浏览器验收和独立验收状态已记录。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划、`editor-artifacts.md`和`shared-game-runtime.md`；
2. 核对Git基线、工作区及任务170/171/174当前实现；
3. 先用定向测试固定UI分散和value tier无blur两个缺口，再按计划实施，不另建第二套schema；
4. 小幅文件适配写入报告；触发ImgNumber v1、state preset、正式assets、consumer或lockfile扩张时停止说明；
5. 只运行第8节L2命令，并明确区分自动化、真实浏览器和独立验收；
6. 完成后生成UTC中文执行报告；
7. 除非用户明确要求，不commit、不push、不创建PR。
