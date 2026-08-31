# 273 editor-legacy-audio-authoring-removal 任务计划

## 1. 目标与完成定义

### 目标

音乐和音效统一由 Game Layout Event 驱动。从 Game Layout Editor、Symbols Editor 与 Popup Editor
移除 Event 方案之前的全部音乐音效 authoring；Game Layout Editor 保留任务 242 引入的全局 Event
音乐音效，并把它作为唯一可编辑音频路径；Symbols/Popup 不再上传、配置、预览或导出 owner-local
cue。RenderCore/AudioCore 继续严格读取历史 package，保证旧 production artifact 与 runtime consumer
不因本任务失效。

### 完成定义

- [ ] Game Layout Editor 不再显示或编辑 per-mode BGM、root programmatic effect 和“忽略老版本音乐
      音效配置”开关；项目页的全局 Event 音乐音效 dialog、audio asset 导入和 production preview
      继续可用。
- [ ] Game Layout Editor 新建或重导出的 canonical v7 中，`audio.music/effects/programmaticEffects`
      恒为空、mode 不含 `bgm`、`eventAudio.ignoreLegacyAudio` 恒为 `true`，已有合法
      `eventAudio.bindings` 无损保留。
- [ ] Symbols Editor 不再接受 loose audio、显示 state audio/preview sink、播放 cue 或保存用户可编辑的
      `audio`/`audioCues`；canonical v3 继续写 schema 要求的空 audio container 与空 cue。
- [ ] Popup Editor 不再显示 tier/segment 音效、导入或试听 Popup audio；canonical v9 继续写 schema
      要求的空 `audio.effects/cues`。
- [ ] 三个 Editor 打开含旧配置的合法 package 时，先按 source version 完整 strict 校验，再确定性移除
      旧绑定与仅由它们拥有的 audio bytes，并向用户报告移除数量；非法旧 package 仍失败，不能借迁移
      绕过 parser/map/hash/closure 校验。
- [ ] Game Layout Editor 中同时被 Event audio 使用的 audio asset 与 bytes 不被旧配置清理误删；导出、
      重导和 preview 只由 Event audio 引用和播放。
- [ ] Symbols/Popup direct `audiocore` 依赖、对应 lockfile importer、过时测试/文档与领域规则同步清理；
      三个真实浏览器流程完成验收。

## 2. 范围

### 包含

- 删除 Game Layout Editor 的 mode BGM、root programmatic effect、legacy ignore toggle 数据命令、UI
  与旧预览入口，固定 canonical legacy-empty policy。
- 保留并回归 Game Layout Editor 的 audio filename-key asset、Event audio dialog、once/loop/focus、
  exact event binding、声音解锁和 production runtime preview。
- 删除 Symbols Editor 的 audio asset classifier/uploader、state cue draft/UI、preview-only symbol sink、
  AudioRuntime owner 与旧资源引用派生。
- 删除 Popup Editor 的 tier/segment cue draft/UI/import、AudioRuntime owner 与旧资源闭包派生。
- 为三个导入边界增加“strict source validation → legacy audio migration → candidate revalidation → atomic
  commit”及用户可见迁移摘要。
- 更新直接测试、三个 app README、Scene Layout/Editor artifact 领域规则、package dependency 与 lockfile。

### 不包含

- 不删除或弱化 AudioCore 的 manifest/runtime，不移除 RenderCore Scene Layout v1–v7、Symbols v1–v3、
  Popup v1–v9 对历史音频字段的 parser、upgrader、播放器或 consumer API。
- 不升级 Scene Layout、Symbols 或 Popup schema 版本；required legacy container 继续以空值写入，不通过
  omission、unknown field 或新 alias 绕过 current strict schema。
- 不移除 Game Layout Event audio，不改变 event catalog/address、music/effect bus、once/loop/focus 或
  runtime lease/destroy 合同。
- 不由 Game Layout Editor 改写其只读 Symbols/Popup dependency 的 owner manifest；旧 dependency 可被
  strict 保留，但 `ignoreLegacyAudio=true` 后不再自动播放。需要永久删去 owner cue 时由对应 Editor
  打开并重导。
- 不修改 Gamelayout package CLI 的历史音频识别/优化能力，不清理 production 游戏资源，不修改
  game002/game003 或外部仓库。
- 不顺带移除 audio 文件格式支持、`@pixi/sound`、AudioCore 或 RenderCore 中仍被 Event audio/历史
  runtime 使用的能力。

## 3. 制定计划时的基线

```text
UTC: 2026-08-31T04:08:46Z
HEAD: 1d01127b5cb678ab3159fc2f575d937686003217
branch: detached HEAD（该提交同时为 main / origin/main）
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `tasks/227-gamelayouteditor-audio-asset-workflow.md`
- `tasks/242-gamelayouteditor-global-event-audio.md`
- `tasks/271-gamelayouteditor-mode-scoped-layers.md`
- `docs/agent-rules/editor-artifacts.md`
- `docs/agent-rules/scene-layout.md`

三个目标 app 下没有补充 `AGENTS.md`。

当前结论：

- 任务 242 已把 `mode BGM`、`Popup cue`、`Symbol cue` 明确定义为三类 legacy automatic audio；
  `apps/gamelayouteditor/src/ui/project-workspace.ts` 当前同时提供全局 Event 音频 dialog 和
  `ignoreLegacyAudio` checkbox。
- `apps/gamelayouteditor/src/ui/layout-workspace.ts#modeBgmEditor()` 仍编辑 exact mode BGM；
  `resources-workspace.ts` 仍提供 root programmatic effect 登记/试听；`editor-project.ts` 同时维护
  `audio`、mode `bgm` 与 `eventAudio` 两条 authoring 路径。
- Scene Layout latest v7 仍 strict 要求 root `audio`、`eventAudio`，mode 仍允许 `bgm`；因此 app 可在
  不改 shared schema 的前提下输出空 legacy catalog、无 `bgm` 和 `ignoreLegacyAudio=true`。
- Symbols latest v3 strict 要求 root `audio`，每个 symbol 允许 `audioCues`。Symbols Editor 当前在
  `editor-project.ts` 保存两者，在 `workspace-app.ts` 导入/编辑 state effect，在 `symbol-preview.ts`
  建立独立 AudioRuntime，并在 `ui-session.ts` 保存 preview-only 发声 symbol。
- Popup latest v9 继承 v7 audio contract。Popup Editor 当前在 `project.ts` 保存 audio，在
  `app-shell.ts` 为 award tier/Spine segment 导入和编辑 cue，在 `popup-preview.ts` 建立独立
  AudioRuntime；single-state 已禁止 cue。
- Symbols/Popup `package.json` 和 `prepare:deps` 直接依赖 `@slotclientengine/audiocore`；移除 app 端
  audio import 后该 direct dependency 可删除，但 RenderCore 自身仍依赖 AudioCore。同步
  `pnpm-lock.yaml` 是本任务升级为 L3 的明确触发条件。
- 三种 shared parser 都已有历史版本 strict validation 与 latest normalizer；本任务缺口在 owner editor
  migration/draft/UI/export，不需要删除 production compatibility。

## 4. 需求解释与技术决策

### 需求解释

- 用户已明确确认音乐音效统一由 Event 驱动；Game Layout 全局 Event 音频是唯一保留的新配置入口。
- “gamelayouteditor 里老版本的音乐音效配置”包括任务 242 所指 per-mode BGM、root programmatic
  effect，以及控制 legacy auto playback 的 checkbox；不包含新的全局 Event 音频。
- Symbols/Popup 的 owner-local state/tier/segment cue 也属于 Event 方案之前的旧路径，Editor 中完整
  移除其上传、配置、预览和新导出能力。
- “移除”不仅隐藏 DOM。Editor draft、commands、resource reference、ZIP closure、preview owner、direct
  dependency 和测试都必须收敛，否则仍会形成不可见但可漂移的第二份配置。
- 历史 package compatibility 是 reader/runtime 职责，不等于 Editor 必须继续 author。旧包打开后允许
  迁移为无 legacy audio 的 latest draft，但必须明确提示数据被移除。

### 关键决策

1. **保留 shared schema/runtime，只让 Editor latest authoring 恒为空。**
   - Scene Layout v7、Symbols v3、Popup v9 的版本与字段集合不变；避免为了 UI 删除破坏 production
     consumer 与历史包。
   - export 前使用正式 parser 复验空 legacy container，而不是跳过字段或手写宽松 validator。
2. **Game Layout Event audio 是唯一可编辑音频路径。**
   - audio loose import、typed resource、Event dialog、asset replace/delete reference protection、声音解锁与
     preview 均保留。
   - legacy `audio` 恒为空，mode 不写 `bgm`；`eventAudio.bindings` 原样保留且
     `ignoreLegacyAudio=true` 固定派生，不再存为用户可切换 draft。
3. **旧包先验证，后迁移，最后原子提交。**
   - source parser/map/hash/exact closure 全部通过后，candidate 中删除 legacy bindings/cues；只 GC 在迁移后
     无 Event 或其它 typed owner 引用的 audio resource/bytes。
   - migration summary 至少列出移除的 music/effect/cue 与 asset 数量；失败时旧项目和当前 preview
     保持不变，不做半提交或静默保留隐藏配置。
4. **Game Layout 不越权重写 dependency。**
   - imported Symbols/Popup 继续作为只读 self-contained package；Layout export 不剖开删除 nested cue。
   - 固定 `ignoreLegacyAudio=true` 关闭这些 dependency 的 legacy auto producer；用户若要缩减 owner package
     与 bytes，必须在 Symbols/Popup Editor 中重导。
5. **删除不再需要的 app dependency。**
   - Symbols/Popup 删除 AudioCore source import、direct dependency 与显式 `prepare:deps` 项；RenderCore 的
     transitive build/runtime dependency不变。
   - 用 pnpm 只更新两个 workspace importer；若 lockfile 出现其它 resolution 漂移，停止查因。

## 5. 职责与合同

- **AudioCore/RenderCore data/runtime**：继续拥有历史 schema strict parser、latest normalizer、legacy playback
  compatibility、Event audio runtime 和 exact closure；本任务不改变 public contract。
- **Game Layout Editor**：拥有 Event audio draft/UI 和 root audio asset workspace；legacy fields 只作为旧
  source import 输入，迁移后不进入 authoring state。
- **Symbols/Popup Editor**：拥有各自非音频 manifest draft/UI；导出时只物化 shared latest schema 要求的空
  audio container，不建立可编辑 audio state。
- **导入事务**：完整 source package strict validate 后创建 candidate，执行 legacy audio strip/GC，再以 latest
  parser 和 owner project validation 复验，一次提交 project/assets/preview。
- **资源生命周期**：Symbols/Popup preview 不再创建 AudioRuntime、sound backend 或 audio Object URL；已有
  owner 在 rebuild/import/project switch/destroy 时仍必须幂等释放。Game Layout preview 继续由 Scene Layout
  production runtime 持有 Event audio owner。
- **失败策略**：坏版本、坏 schema/hash/path、缺旧 audio bytes、迁移后悬空 Event reference、unknown media
  或 dependency failure 均显式失败；不得因旧配置最终会被删除而跳过 source validation。
- **禁止行为**：只隐藏 UI、保留 invisible mutable draft、静默丢弃旧数据、不验证就剪 ZIP、由 Layout
  改写 owner dependency、删除 shared runtime compatibility，或把 Event audio 再实现到 Symbols/Popup。

## 6. 文件范围

### 预计新增

```text
tasks/273-editor-legacy-audio-authoring-removal-<utctime>.md
```

### 预计修改

```text
apps/gamelayouteditor/src/model/{editor-project,editor-resource,resource-commands,validation}.ts
apps/gamelayouteditor/src/ui/{app-shell,layout-workspace,project-workspace,resources-workspace,ui-session}.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/{app-shell,audio-assets,event-audio-dialog,layout-preview,validation,zip-io}.test.ts
apps/gamelayouteditor/README.md

apps/symbolseditor/src/model/{editor-project,resource-import}.ts
apps/symbolseditor/src/preview/symbol-preview.ts
apps/symbolseditor/src/ui/{ui-session,workspace-app}.ts
apps/symbolseditor/tests/{app-shell,editor-project,resource-import,ui-session,zip-io}.test.ts
apps/symbolseditor/{README.md,package.json}

apps/popupeditor/src/{io/popup-zip,model/project,preview/popup-preview,ui/app-shell}.ts
apps/popupeditor/tests/{app-shell,preview,project,resource-import}.test.ts
apps/popupeditor/{README.md,package.json}

docs/agent-rules/{editor-artifacts,scene-layout}.md
pnpm-lock.yaml
```

测试文件按实际覆盖点缩小；若某项只含同名 VNI `effect` 而与 audio 无关，不应误删或机械改写。

### 原则上不应修改

```text
packages/audiocore/**
packages/rendercore/**
packages/editorcore/**
apps/gamelayoutpkgcli/**
apps/{game002v2,game003v2,imgnumbereditor,editordemo}/**
assets/**
package.json
pnpm-workspace.yaml
docs/agent-rules/shared-game-runtime.md
```

若执行发现不修改 shared schema/runtime 就无法输出合法空 legacy contract，或必须改写 Layout 内 nested owner
dependency 才能关闭 auto playback，属于 public contract 扩张，先停止并报告证据。

## 7. 实施步骤

1. **确认执行基线与行为矩阵**
   - 重核 HEAD/status、本计划、两份领域规则和任务 242 的 legacy/Event 分界。
   - 用最小 v7/v3/v9 fixture 固定“空旧配置合法”“含旧配置 source strict 可读”“Event audio 独立保留”基线；
     确认所有 source import 都在迁移前完成 map/hash/closure 校验。
2. **收敛 Game Layout Editor 到 Event audio**
   - 从 draft/commands/validation 中删除 mode BGM、root programmatic effect 和可编辑
     `ignoreLegacyAudio`；manifest builder 固定输出空 legacy catalog、无 mode `bgm`、legacy ignore true。
   - 删除 Layout inspector BGM、Assets programmatic effect 登记/试听、Project checkbox 和对应 handlers/styles；
     保留 Project Event dialog、audio asset rows、Event references、replace/delete protection与 unlock UI。
   - 导入旧 Layout 时迁移 root legacy audio 与 mode BGM；若 source path 同时被 Event binding 引用则保留
     resource/bytes，否则从 candidate workspace exact GC，并显示摘要。
3. **移除 Symbols Editor owner audio**
   - 删除 `SymbolEditorProject.audio`、symbol `audioCues` authoring、audio resource kind/import detection、
     state controls、preview sink/session 和 AudioRuntime/Object URL 生命周期。
   - import 合法 v3 old-audio package 后清空 cue/effect 并 GC owner audio；v1/v2 仍先走 RenderCore upgrader。
     export v3 时统一物化空 audio/empty cue，并用正式 parser 和 package checker 复验。
   - 从 package scripts/dependencies 删除 direct AudioCore，更新测试证明 loose audio 不再成为支持资源。
4. **移除 Popup Editor owner audio**
   - 删除 project audio authoring、award tier/Spine segment controls、dedicated audio file input、cue helpers、
     preview AudioRuntime 与相关 URL/destroy 状态；single-state 行为保持。
   - import 合法 v7–v9 old-audio package 时在 source strict validate 后清空 audio/GC payload；v1–v6 继续
     先按原版本升级。export v9 固定写空 audio container并 strict 复验。
   - 删除 Popup direct AudioCore dependency 与 prepare 项，保留 RenderCore Popup preview/player。
5. **保护迁移、closure 与非音频行为**
   - 三个 app 增加 import→migration→export→reimport 测试，断言旧字段为空、无悬空 map entry/orphan、
     user-visible summary 正确且失败零提交。
   - Game Layout 增加同一 audio path 被 legacy BGM/effect 与 Event binding 共用的 fixture，证明只删旧 owner、
     Event row/path/bytes/preview 保留；nested Popup/Symbol manifest保持字节与 owner 字段不被改写。
   - Symbols/Popup 回归非音频 state/layer/value/ImgNumber/Spine/VNI、project switch 与 preview destroy，防止
     删除 audio owner 时破坏正式 player。
6. **同步依赖、文档与收尾**
   - 用 pnpm 更新 Symbols/Popup package importer 和 lockfile，检查没有无关 resolution 漂移。
   - 更新三个 README、`editor-artifacts.md` 与 `scene-layout.md`：Event audio 为唯一新 authoring；shared
     parser/runtime 仍兼容 legacy；owner editor 重导会迁移删除旧 cue。
   - 执行 L3 自动验收、三个真实浏览器人工流程，并生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- Game Layout model/ZIP 覆盖空项目、仅 legacy、仅 Event、legacy 与 Event 共用 asset、nested owner cue、
  source invalid 与 migration failure；断言 `ignoreLegacyAudio=true` 不是 UI session 值。
- Event dialog 回归仍覆盖 audio asset 显式选择、once/loop/end event/focus、cancel/confirm、asset 删除阻断
  与 export/reimport，不因删除 legacy 测试而降低新路径证据。
- Symbols 覆盖 v1/v2 无 audio 升级、v3 empty、v3 old audio strip、loose audio rejected、audio payload GC、
  非音频 asset 保留和 preview destroy；Popup 对 v1–v6、v7–v9 做对应版本矩阵。
- 旧 package 必须先 strict validate：缺 audio bytes、坏 media type/hash/path 即使最终将被删除也要失败。
- DOM 测试断言旧控件/accept extension/preview sink 不存在，新 Event audio 控件存在；不能只删快照字符串。
- 不修改 production code 去满足与新合同冲突的旧测试；同名 `effect.json` 等 VNI fixture 不属于音频，必须保留。

### 验收级别

`L3`。行为修改横跨三个正式 Editor 的 draft/UI/preview/ZIP，且删除 Symbols/Popup direct workspace
dependency并同步 `pnpm-lock.yaml`；根规则明确把 lockfile 变化列为 L3 触发条件。shared public schema/runtime
不变，但正式 artifact migration 和 closure 剪枝仍需整仓证明 consumer 未回归。

### 执行会话必须运行

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

实现中先运行三个 app 的定向 typecheck/Vitest 快速定位；它们不替代上述 L3。根命令失败时先缩小到
目标 app 和直接 RenderCore consumer，记录最小复现、是否由本任务引入，不立即扩大修改范围。

### 人工验收

1. Game Layout Editor 新建项目并打开旧 v7 ZIP：确认 Layout/Assets/Project 不再出现 BGM、程序音效、
   legacy ignore 控件；Event 音乐音效仍可选择已导入 audio、解锁并在 production preview 播放。导出重开
   后 Event row/bytes 保留，manifest legacy fields 为空且 ignore true。
2. Symbols Editor 打开含多 state cue 的真实 v3 ZIP：确认先显示明确迁移摘要，Editor 内无 audio 上传、
   state audio 或发声 symbol 控件，preview 不播放 cue；导出重开后 cue/owner audio bytes 不存在，非音频
   symbol state、layer、value 与 ImgNumber 保持。
3. Popup Editor 分别打开含 tier cue 的 award v9 和含 segment cue 的 Spine v9 ZIP：确认迁移摘要、无音效
   控件/播放、导出 closure 删除仅由 cue 拥有的 bytes；tier/segment 动画、overlay、文字与金额行为不变。
4. 在 Game Layout 中导入仍含旧 cue 的 Symbols/Popup dependency，确认 dependency strict 通过且 owner
   manifest 未被 Layout 改写；Event audio 正常播放，legacy cue 因 fixed ignore policy 不自动播放。

没有可用真实旧包时可用 synthetic fixture完成自动测试，但执行报告必须把上述听觉/浏览器项目标为未完成，
不能用 happy-dom 或 fake backend 冒充。

### 独立验收建议

`必须`。虽然不改 shared public schema，但会有意删除旧 package authoring 数据、修改正式 ZIP closure 和 lockfile。
独立复验重点是 strict-before-strip、Event audio 无损与 Symbols/Popup orphan-free migration，最多运行：

```bash
pnpm --filter gamelayouteditor exec vitest run tests/audio-assets.test.ts tests/event-audio-dialog.test.ts tests/zip-io.test.ts
pnpm --filter symbolseditor exec vitest run tests/editor-project.test.ts tests/resource-import.test.ts tests/zip-io.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/resource-import.test.ts tests/preview.test.ts
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；不切换 npm/yarn。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置既有本地代理
  并重试原命令。
- 用 pnpm 删除 Symbols/Popup 的 `@slotclientengine/audiocore` direct dependency并更新 lockfile importer；
  不升级 pnpm、Pixi、`@pixi/sound`、AudioCore 或其它版本。
- 若 lockfile 出现两个目标 importer 之外的无关 resolution/version 漂移，停止并查因。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、production asset 或生成源码；`dist`、coverage、cache 不手改、不提交。
- 更新三个 app README，明确 Game Layout 只 author Event audio、Symbols/Popup 重导会移除旧 cue，并记录
  old package migration summary 与 closure 行为。
- 最小更新 `editor-artifacts.md` 中 Symbols/Popup per-state effect 和 Layout BGM/programmatic effect 旧合同；
  更新 `scene-layout.md` 中 legacy authoring/ignore policy，同时保留 shared runtime compatibility说明。
- `shared-game-runtime.md`、AudioCore/RenderCore README 和根 `AGENTS.md` 的稳定 runtime 职责不变，不追加
  本任务一次性迁移细节。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/273-editor-legacy-audio-authoring-removal-<utctime>.md
```

UTC 文件名通过 `date -u +%y%m%d-%H%M%S` 生成。报告简要记录最终实现、实际文件、迁移数据策略、依赖/
lockfile 变化、自动验收、三套浏览器/听觉验收状态、计划偏差与剩余风险，不收集无关 coverage 历史矩阵。

## 12. 风险、假设与待确认

### 风险

- 打开并保存旧 package 会有意删除 legacy authoring；如果没有明确 migration summary，用户可能误以为
  round-trip 无损，因此提示必须属于成功 import transaction 的可观察结果。
- Game Layout 同一 audio path 可同时被 legacy 和 Event 引用；按 binding 类型而非扩展名/文件名计算 GC，
  否则会误删仍由 Event audio 使用的 bytes。
- Symbols/Popup audio payload 位于 content-addressed map；只删 manifest 字段不重建 exact closure 会留下
  orphan，直接扫扩展名删除又可能误伤共享 bytes，必须从迁移后的 typed graph 派生。
- Game Layout 只读 nested dependency 仍可能含旧 cue/bytes；fixed ignore 解决自动播放，不代表 Layout 有权
  改写 owner artifact。文档和迁移提示必须区分“运行时忽略”与“owner 重导后物理移除”。
- 删除 preview AudioRuntime 时若遗漏 ticker、unlock callback 或 Object URL，可能留下 late playback/泄漏；
  destroy 与快速 project switch 需直接测试。

### 假设

- shared latest schema 本任务保持 v7/v3/v9，空 legacy container 是合法 canonical 输出；生产 runtime 仍需
  读取尚未重导的历史 package。
- `ignoreLegacyAudio=true` 应成为 Game Layout Editor 固定导出策略，不再保留 false 的 authoring入口；
  显式 programmatic effect 也因 root legacy catalog 恒空而不再由新 Editor 产出。

### 待确认

无。用户已确认统一 Event 音频为唯一新配置路径；shared runtime 的历史读取兼容边界由当前架构规则确定。

## 13. 完成清单

- [ ] 目标与非目标已满足，Event audio 保留且 legacy authoring 不可见、不可编辑、不可新导出。
- [ ] 三个 Editor 的旧 package 均 strict-before-strip、原子迁移并显示摘要。
- [ ] Scene v7/Symbols v3/Popup v9 输出合法空 legacy container，版本未变化。
- [ ] Event 共用 audio asset 未误删，Symbols/Popup owner-only audio closure 无 orphan。
- [ ] Layout 未改写只读 nested dependency，fixed ignore policy 阻止旧 cue 自动播放。
- [ ] Symbols/Popup AudioCore direct dependency 与 lockfile importer 已精确更新，无无关漂移。
- [ ] 三个 app 的非音频 authoring、preview、ZIP round-trip 未回归。
- [ ] README、两份领域规则、自动验收与独立/人工验收状态已同步。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`editor-artifacts.md`、`scene-layout.md` 与任务 242；
2. 重核 Git 基线、工作区和 v7/v3/v9 strict empty-audio 合法性；
3. 先固定 legacy/Event 行为矩阵与 strict-before-strip 测试，再删除 draft/UI/preview 代码；
4. 不修改 shared parser/runtime，不由 Layout 改写 Symbols/Popup owner package；
5. 用 typed reference graph 做 GC，不按文件扩展名、名称或 map orphan 猜 owner；
6. 只用 pnpm 精确更新两个 importer，lockfile 无关漂移时停止；
7. 运行计划规定的 L3 验收并区分自动、浏览器和听觉证据；
8. 完成后生成 UTC 中文执行报告；除非用户明确要求，不 commit、不 push、不创建 PR。
