# 171 symbolseditor-imgnumber-spin-blur-assets 任务计划

## 1. 目标与完成定义

### 目标

为 `apps/symbolseditor` 的命名 ImgNumber node 增加 `spinBlur` 专用资源生成与运行时切换：当
node 已把非 Spine `spinBlur` 配为 exact target 时，ImgNumber 卡片提供“生成并使用模糊
ImgNumber”按钮。编辑器在浏览器本地把当前普通 ImgNumber 的 glyph 及特殊数值整图按 rendercore
versioned `spinBlur` preset 生成模糊 PNG，作为一份派生 ImgNumber dependency 加入
统一资源库，并原子绑定到该 node 的 `spinBlur` profile。

同一普通 ImgNumber dependency 在一个 Symbols project 内只生成一份可复用的模糊 dependency；
其它 symbol/node 使用同一普通 ImgNumber 且也配置 `spinBlur` target 时复用已有结果，不重复解码、
模糊或创建 dependency。runtime 继续维持任务 170 的每 occurrence、每 logical node 一个稳定
ImgNumber instance；进入或离开 `spinBlur` 只在同一 renderer/container 内切换已 prepare 的
resource/special-image profile，不创建第二个显示实例，也不在运行时生成像素。

### 完成定义

- [ ] 命名 ImgNumber node 只有在存在 non-Spine exact `spinBlur` target、普通 dependency 完整且
      glyph/special 图片均有效时，才启用“生成并使用模糊 ImgNumber”。
- [ ] 首次点击按 rendercore 当前 versioned `spinBlur` preset 逐 unique source image 生成 PNG，创建
      一份布局与普通 ImgNumber 严格一致的派生 dependency，并加入全局 asset/dependency library。
- [ ] 同一普通 dependency 已有有效派生 dependency 时，按钮只复用并绑定，不再次执行像素生成；
      同一提交可为项目内其它满足条件的 node 复用该 dependency。
- [ ] 普通 dependency 的多个 glyph 指向同一 source key、多个 node 复用同一特殊值图片时，每个
      unique source key 最多生成一次；相同生成 payload 继续由正式 content addressing 物理去重。
- [ ] 新 canonical node 显式保存 `spinBlurProfile`，包含派生 ImgNumber resource 和对应的特殊值图片；
      普通 profile 与模糊 profile 共用 initial text、anchor、transform、target 和颜色跟随配置。
- [ ] `spinBlurProfile` 的字符集、glyph size/offset、metrics、fixed-advance group 和特殊值集合必须与
      普通 profile 完全兼容；缺图、过期派生物、冲突 id/key 或非法 profile 均显式失败。
- [ ] normal/Spine/direct overlay/hidden/`spinBlur` 往返时，ImgNumber 外层 container、renderer handle
      和 glyph Sprite pool identity 保持；仅纹理/resource profile、可见性和 attachment 改变。
- [ ] 全部普通/模糊 ImgNumber manifest、glyph 和特殊图片进入 Symbols package exact closure、mapped
      rewrite、Vite generator 与 ZIP round-trip；未引用的派生 dependency 不进入导出。
- [ ] 任务 170 的 shared Normal、legacy exact targets、value-presentation ImgNumber 和旧 package 行为
      保持；旧 target-only node 可原样运行/往返，但 Editor 明确标为 legacy normal-assets behavior并
      提供生成升级，新建/新改的 `spinBlur` target 不输出该 legacy 形态。
- [ ] 完成 L2 定向自动化；浏览器视觉与 allocation/profile 验收由用户执行；生成 UTC 中文执行报告。

## 2. 范围

### 包含

- Symbols manifest 命名 `imageStringNodes[]` 的 canonical `spinBlurProfile`、legacy 缺省形态和 strict
  compatibility validation。
- rendercore ImgNumber resource pool、mapped display/controller 对 normal/blur profile 的预加载、
  原子切换、reset/release/destroy 和 stable identity。
- package closure、mapped materializer、Vite resource generator 对 blur dependency 与特殊图片的
  结构化收集和改写。
- Symbols Editor 的派生 ImgNumber identity、生成 availability、unique-source 去重、浏览器 codec、
  dependency 安装/复用、引用图、replacement invalidation、统一 transaction、UI 和 preview。
- 直接测试、README、Symbol Package 文档与最小领域规则更新。

### 不包含

- 不修改 `apps/imgnumbereditor` 的 authoring UI、`ImageStringManifestV1` glyph/layout schema或独立
  ImgNumber ZIP 格式；派生结果仍是一份合法 v1 ImgNumber dependency。
- 不给 `valuePresentation.text.type="image-string"` 新增 non-Spine target；本任务中的“模糊状态配置了
  ImgNumber”特指任务 170 的命名 node exact `targets[]`。value ImgNumber 保持现有 Spine tier语义。
- 不为 `disabled` 或任意 custom state批量生成 ImgNumber variant，不增加 generic state-effect DSL。
- 不修改 symbol 本体模糊图生成按钮/算法语义，不把 symbol state texture 与 ImgNumber glyph合成成
  一张图片。
- 不在 runtime 解码、模糊、编码或按 occurrence复制纹理；不新增 shader/filter、字体 fallback、
  placeholder 或 filename guess。
- 不修改正式 `assets/**`、lockfile、游戏业务 resolver 或 Scene Layout/Popup 内部 ImgNumber 编辑。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T13:44:00Z
HEAD: ba7f8eabc8db2fc5bee2822b3230af319f4a890b
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/editor-artifacts.md`、
`docs/agent-rules/shared-game-runtime.md`、任务 170 计划/执行报告，以及 Symbols Editor、rendercore
ImgNumber/Symbol package 代码和文档；目标目录没有补充 `AGENTS.md`。当前结论：

- 任务 170 已让命名 node 用一个 `spineSlot` 加 non-Spine exact `targets[]`，每 occurrence只构造一个
  mapped renderer；`spinBlur` target 当前仍使用普通 ImgNumber resource。
- `RenderImageString.setResource()` 已在同一 container内重排/换纹理并复用 active/pool Sprite；
  `RenderMappedImageString` 尚未公开 normal/blur profile原子切换，controller也只准备一个 resource。
- `createSymbolImageStringResourcePool()` 已按 canonical manifest path共享 ImgNumber resource；新增 blur
  resource可在 package prepare期加载一次并被所有 node/occurrence复用。
- `apps/symbolseditor/src/model/state-texture-generation.ts` 已在浏览器调用 rendercore versioned preset，
  并通过统一 filename-key review/transaction生成 symbol本体 `spinBlur|disabled` 图；ImgNumber尚无对应
  generation transaction。
- ImgNumber dependency 只在 `imageStringDependencies` 保存 root/manifest/closure描述，真实bytes仍只在
  `assetLibrary`；`exportSnapshot()`只导出 manifest结构化引用的exact closure，适合保留可复用但当前
  未引用的派生 dependency而不污染正式ZIP。
- 当前 tracked assets/tests未发现已绑定 `spinBlur` 的正式 ImgNumber node fixture；兼容仍按 public
  legacy contract保留，不以该现状删除旧输入能力。

## 4. 需求解释与技术决策

### 需求解释

- “放在 ImgNumber 里”解释为按钮与状态放在命名 ImgNumber node卡片，而不是普通 state图片卡片；
  点击结果是完整派生 ImgNumber dependency，不是散落且由 filename猜测的一组图片。
- “自动附加”表示生成 transaction成功后写入 node的 explicit `spinBlurProfile`；只生成资源但不绑定
  不算完成。其它同源且已有 `spinBlur` target的node在同一transaction内可自动复用绑定。
- “可以复用/不重复构建”以普通 dependency的manifest identity为边界；多个logical dependency即使
  bytes相同也不合并身份，同一个dependency的多次使用只拥有一个派生dependency。
- 模糊 profile只改变glyph/special图片bytes；文字、layout、anchor、transform、slot/overlay、颜色跟随
  与target coverage不允许分叉。
- 特殊数值整图也是ImgNumber可见输出；若普通node配置了它们，生成按钮必须同步生成并绑定模糊版本，
  不能在exact value时悄悄显示未模糊图片。

### 关键决策

1. **派生为第二份合法 v1 ImgNumber dependency，不扩展 standalone schema**
   - 以普通 manifest为模板，保留metrics、字符、size/offset和fixed groups，只改派生manifest id、glyph
     filename-key与PNG bytes。
   - 生成id使用由source manifest id与官方preset版本组成的保留派生identity；runtime不从id猜行为，
     node仍通过typed `spinBlurProfile.resource`显式引用。
   - 已存在同identity dependency时先校验layout/closure和现有binding；合法则复用，冲突或不兼容直接
     报错，不静默覆盖用户dependency或另分配第二个派生id。

2. **Symbol node增加显式且窄化的 `spinBlurProfile`**
   - profile只含`resource`和可选`specialValueImages`；其它字段继续由node顶层唯一拥有。
   - profile仅允许在node有non-Spine exact `spinBlur` target时出现，并要求普通/blur dependency layout
     完全同构、special value集合一致、所有引用进入exact closure。
   - 不采用任意`stateProfiles` map，避免本任务无意支持disabled/custom effect或引入第二套状态机。

3. **生成/复用是一次project-wide typed transaction**
   - availability先解析source dependency closure，按unique source key去重，并识别已有有效派生dependency
     和已生成special图片；只有缺项才进入decode/transform/encode prepare。
   - prepare阶段不修改project；commit阶段在clone上安装/复用dependency、写asset records、更新所有
     同source且有spinBlur target的eligible node profile，再跑完整diagnostics/export validation。
   - revision/request guard、冲突review、失败rollback和stale callback沿用现有import transaction；任一
     glyph/special失败时dependency、asset library和全部node binding保持原状。

4. **source变化显式使派生binding失效**
   - 普通dependency替换、glyph覆盖、特殊图覆盖/映射变更时，reconciliation按typed reference找到受影响
     `spinBlurProfile`，事务性清空/标记需重建；不继续使用与source不匹配的旧模糊资源。
   - 仍被其它有效node引用的派生dependency/图片不删除；无人引用的资源可留在Editor library供后续
     复用，但正式export按exact closure排除。显式删除dependency继续受引用图保护。

5. **runtime只在稳定instance上切profile**
   - package prepare阶段把normal和blur resources/special textures全部装入同一shared pool并验证文本闭包。
   - `RenderMappedImageString`增加原子profile切换：先验证目标resource、当前text和special map，再调用
     底层`setResource()`/换special texture；container、special Sprite与glyph Sprite pool不替换。
   - controller的`syncState("spinBlur")`只在profile实际变化时切换；回到其它state恢复normal profile，
     attachment/direct/hidden仍由任务170现有单实例状态机控制。reset/release固定恢复normal。

6. **legacy输入明确保留但新authoring不再产生**
   - 旧node有`spinBlur` target但无profile时按既有normal-assets行为运行和往返，并在Editor显示legacy提示。
   - 新增/重新配置spinBlur target后，UI将其列为“待生成”；生成成功才形成canonical profile。不得在parser
     中把normal resource静默复制成blur profile，也不得把legacy package导入时擅自改bytes。

## 5. 职责与合同

- **rendercore symbol manifest/package**：`spinBlurProfile` strict parse、normal/blur layout parity、target
  约束、resource/special exact closure、mapped rewrite和legacy variant。
- **rendercore image-string/symbol-image-string**：共享resource prepare、稳定mapped display profile switch、
  current text校验、attachment/visibility、reset/release/destroy；不拥有编辑器生成identity。
- **Symbols Editor**：生成availability、派生identity、unique-source像素prepare、library install/reuse、
  project-wide binding、source invalidation、UI/preview与ZIP IO。
- **像素算法**：继续唯一来自`@slotclientengine/rendercore/symbol`的versioned preset；Editor只提供browser
  decode/PNG encode，不复制kernel参数。
- **数据合同**：blur glyph字符集合及全部layout字段等于normal；special values集合相等；profile resource
  是contained canonical ImgNumber manifest ref；`spinBlur`必须是已配置non-Spine target。
- **资源生命周期**：runtime pool拥有normal/blur texture；occurrence renderer只借用texture并销毁自己的
  container/Sprite一次。生成prepare的临时bytes/Object URL无论成功失败都释放。
- **失败策略**：缺source/glyph/special、codec失败、revision变化、派生id/key冲突、layout不一致、stale
  profile、orphan、unknown field/state和profile commit失败全部显式失败并rollback。
- **禁止行为**：不按state创建renderer、不在frame/update中换resource、不重复decode同一source key、
  不以文件名扫描替代manifest引用、不用普通glyph作为canonical blur fallback。

## 6. 文件范围

### 预计新增

```text
apps/symbolseditor/src/model/image-string-spin-blur-generation.ts
apps/symbolseditor/tests/image-string-spin-blur-generation.test.ts
tasks/171-symbolseditor-imgnumber-spin-blur-assets-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/symbol/{manifest,materialize-package,package}.ts
packages/rendercore/src/symbol-image-string/{controller,mapped-display,resources,types}.ts
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/tests/symbol/{manifest,materialize-package,package,symbol-value-vite-resource-generator}.test.ts
packages/rendercore/tests/symbol-image-string/{controller,mapped-display,resources}.test.ts
apps/symbolseditor/src/model/{editor-project,resource-import}.ts
apps/symbolseditor/src/ui/{workspace-app,resource-picker,ui-session}.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{app-shell,editor-project,image-string-dependency,resource-import,resource-picker,zip-io}.test.ts
apps/symbolseditor/README.md
packages/rendercore/README.md
docs/symbol-package.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

### 原则上不应修改

```text
apps/imgnumbereditor/**
packages/rendercore/src/image-string/{manifest,types,layout}.ts
packages/rendercore/src/{popup,scene-layout}/**
apps/{popupeditor,gamelayouteditor,gamelayoutpkgcli,game002,game003,gameviewer,gameviewer2}/src/**
packages/{logiccore,gameframeworks,uiframeworks,editorresource,browserartifactio}/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

底层`render-image-string.ts`已有所需`setResource()`；只有identity/rollback测试证明其合同不足时才
修改。若需改ImageString manifest版本、value-presentation schema、正式assets、依赖或lockfile，属于
范围扩张，执行前必须说明证据并重新规划。

## 7. 实施步骤

1. **确认执行基线与legacy fixture**
   - 重核HEAD/status、规则、任务170实现和本计划；固定normal→spinBlur→normal、legacy target-only、
     multi-target、shared dependency与special exact-value的当前输出/identity测试。
   - 记录当前tracked package中是否新增spinBlur ImgNumber输入；仓库有变化时只做小幅适配或停止重规划。

2. **增加manifest与closure合同**
   - 为命名node加入`spinBlurProfile` typed parse/clone/export，校验exact target、layout parity、special集合、
     unknown fields和legacy/canonical边界。
   - 更新collector、materializer和Vite generator，结构化收集/改写blur root、glyph和special refs；不扫描
     JSON字符串或派生id寻找资源。

3. **实现稳定runtime profile switch**
   - resource pool一次prepare normal/blur dependency与特殊图片，并在画面mutation前验证当前/initial text。
   - 扩展mapped display以原子切resource/special map且保持container/Sprite pool；失败保留旧profile/text。
   - controller在requested exact spinBlur target命中时切blur，其它state恢复normal；覆盖重复sync no-op、
     direct/hidden、Spine reattach、late init、reset/release/destroy。

4. **实现Editor派生dependency生成器**
   - 根据source dependency和preset版本计算保留派生identity/稳定输出keys；按manifest引用收集unique glyph
     source，调用现有browser codec与rendercore `spinBlur` RGBA transform生成PNG。
   - 克隆v1 manifest并只改id/path；复验bytes类型、尺寸、layout parity、完整closure和dependency冲突。
   - 对special source做同样unique-key生成，产出node profile所需value→image映射。

5. **接入统一transaction、复用与失效处理**
   - 首次生成在clone project内安装派生dependency/assets并绑定当前及其它eligible nodes；已有有效派生物
     直接复用，缺失special只prepare缺项，已绑定相同profile为no-op。
   - revision/request guard覆盖decode期间项目变化；dependency/resource replacement和node source/special
     修改事务性清理stale binding，引用图保护仍在使用的派生root/glyph/special。
   - commit后跑项目diagnostics和headless export validation；失败整体rollback，不留下半个batch或orphan。

6. **接入ImgNumber UI与preview**
   - 在每张命名ImgNumber卡显示normal dependency、spinBlur target/profile状态、生成/复用按钮和明确原因；
     无target、legacy、待生成、generating、ready/stale/error状态互斥。
   - 点击期间锁定相关操作并沿用request guard；成功后preview切到spinBlur并显示派生资源，取消/失败不改变
     selection。其它同源node显示“已复用”，不再提供重复构建动作。
   - source、target或special编辑后即时刷新availability/diagnostics；移除spinBlur target同时移除该node
     profile引用，但不删除仍可复用的library dependency。

7. **回归、文档和收尾**
   - Editor覆盖首次生成、shared reuse、unique-source去重、special、conflict、stale source、revision race、
     rollback、删除保护和ZIP round-trip；rendercore覆盖profile identity/closure/legacy/cleanup。
   - 更新三个用户/开发文档与两份领域规则，运行L2命令并生成UTC报告；浏览器视觉和allocation项留给用户。

## 8. 测试与验收

### 测试原则

- 生成测试使用有区分度RGBA fixture，断言normal与blur bytes不同、尺寸相同且preset调用按unique source
  key计数；不能只断言文件名或button文字。
- 复用测试至少覆盖两个symbol、多个node、共享glyph path和共享special image；第二次操作必须零像素
  generation且只增加/确认binding。
- runtime identity测试覆盖normal→spinBlur→normal、spinBlur重复sync、direct→hidden→direct、setText在
  profile两侧及special↔glyph切换；container、renderer和可复用Sprite identity不能只比较snapshot。
- strict failure覆盖无target、缺dependency/glyph/special、layout不一致、special集合不一致、派生id/key
  冲突、source替换、revision race、mapped orphan和destroy后调用。
- legacy fixture证明无profile package仍按原normal-assets语义运行/往返，Editor生成后才升级canonical；
  不用legacy行为作为新authoring fallback。

### 验收级别

`L2`。任务修改rendercore public Symbols schema、resource closure/generator及display profile lifecycle，
直接consumer是Symbols Editor和game002生成/加载链；需要验证直接依赖。不改根工具链、lockfile或release，
不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter symbolseditor --filter game002 typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolseditor test
pnpm --filter game002 test
pnpm --filter symbolseditor build
git diff --check
```

rendercore generator parity由其定向fixture测试保护；没有正式YAML/generated asset变化，不另跑游戏资源生成。
失败先最小化到对应package/test file，不扩大为整仓命令。

### 人工验收

由用户在浏览器执行，实施会话不把fake runtime/单测当作视觉或性能证据：

1. 为普通图片symbol配置命名ImgNumber与spinBlur target，点击生成；确认library出现派生ImgNumber、preview
   在normal显示清晰glyph、spinBlur显示模糊glyph，特殊值整图也正确模糊。
2. 让第二个symbol/node复用同一普通ImgNumber并配置spinBlur；确认直接复用、无再次生成提示，导出重导后
   两者仍指向同一派生dependency且视觉一致。
3. 用debug snapshot/DevTools allocation检查连续normal↔spinBlur与spin期间没有第二个ImgNumber container、
   renderer churn或逐帧texture load；切换只发生在state边界，销毁后无残留texture owner/Object URL。

### 独立验收建议

`建议`。涉及public manifest、browser generation transaction、共享资源ownership与运行时instance身份。
独立复验：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolseditor test
git diff --check
```

## 9. 环境与依赖

- Node.js使用仓库要求的Node 24；shell无Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用pnpm，不切换npm/yarn；依赖缺失时运行`CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才设置仓库约定代理并重试原命令。
- 浏览器decode/PNG encode、SHA-256/content addressing和blur RGBA算法均已有能力；本任务不新增依赖或
  lockfile。若执行发现必须新增，先说明必要性和影响。

## 10. 生成物、文档与规则

- 派生glyph/special PNG只通过浏览器生成器进入Editor asset library；正式ZIP继续由mapped materializer
  计算完整SHA-256、size、media type与physical path，不手写`assets.map.json`或生成TS。
- Vite generator变化只改脚本和fixture，任何正式生成物必须由对应命令更新并运行`--check`；本计划预计
  无正式生成物diff。
- 更新`apps/symbolseditor/README.md`、`packages/rendercore/README.md`和`docs/symbol-package.md`，记录
  button/reuse、profile schema、legacy边界、exact closure与single-instance切换。
- 最小更新`docs/agent-rules/editor-artifacts.md`、`shared-game-runtime.md`，固化派生资源ownership、去重和
  runtime禁止生成；不修改根`AGENTS.md`。

## 11. 执行报告

规划时不生成报告。实现和自动化验收完成后创建：

```text
tasks/171-symbolseditor-imgnumber-spin-blur-assets-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告记录实际实现/文件、派生identity和复用、profile ownership、
计划偏差、命令结果、待用户浏览器验收及剩余风险；不收集无关整仓统计。

## 12. 风险、假设与待确认

### 风险

- 派生dependency属于共享项目资源；source替换若未正确invalidate，会让多个node继续使用过期blur，
  因此reference reconciliation和rollback是主要authoring风险。
- blur profile可增加一套glyph/special纹理内存；必须按dependency在pool中只加载一次，并在最后owner
  destroy时释放，不能按occurrence复制resource。
- profile切换同时涉及glyph与special Sprite；若先commit一半可能出现一帧混合资源，必须先完整验证再
  同步commit。
- legacy normal-assets与canonical blur profile并存会增加测试矩阵；UI必须明确标识，不能把legacy静默
  当作已生成。

### 假设

- 本任务只处理命名ImgNumber的non-Spine exact `spinBlur` target，不改变value-presentation语义。
- 同一ImgNumber指manifest `id`相同且项目中唯一的logical dependency；不同id不因bytes相同自动合并。
- 普通和模糊ImgNumber共享全部layout/transform，只替换纹理assets；这与用户要求的单instance一致。
- 生成使用当前rendercore `spinBlur` versioned preset，preset版本变化视为需要重新生成的派生identity。

### 待确认

无。上述范围由任务170的named target模型、用户对“配置模糊状态后在ImgNumber里生成”的描述及当前
仓库职责边界确定；若未来要求value-presentation在静态spinBlur上额外显示，需要单独定义其attachment
与profile合同，不能在本任务中隐式扩张。

## 13. 完成清单

- [ ] Editor按钮、availability、首次生成、shared reuse和source invalidation满足。
- [ ] glyph/special unique-source生成及project-wide transaction有测试，失败无半提交。
- [ ] canonical `spinBlurProfile`、legacy输入、closure/materializer/generator和ZIP round-trip满足。
- [ ] runtime normal/blur只切stable instance profile，identity/cleanup测试通过。
- [ ] standalone ImgNumber schema、value-presentation、正式assets和lockfile未被无关修改。
- [ ] 指定L2自动化通过，浏览器视觉/performance验收明确留给用户。
- [ ] 文档、领域规则和UTC中文执行报告已完成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的两份规则和本计划，核对Git基线及任务170合同；
2. 先固定legacy/single-instance测试，再实现manifest/profile和生成transaction，不另起第二套像素算法；
3. 小幅文件适配写入报告；若需ImgNumber schema/version、value-presentation或正式assets变化，先停止说明；
4. 只运行计划规定L2自动化，不启动浏览器；完成后生成报告并列出用户人工验收项；
5. 除非用户明确要求，不commit、不push、不创建PR。
