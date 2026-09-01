# 277 gamelayouteditor-audio-program-export 任务计划

## 1. 目标与完成定义

### 目标

让 Game Layout Editor 的 audio root 与 Assets 中其它一等资源一样，可以由用户显式设置稳定程序键并强制进入
production export。程序只按 exact key/kind 取得这份音频资源；该能力不恢复已经移除的 mode BGM、root
programmatic effect 或 Popup/Symbol cue authoring，也不把音频伪装成 scene node、RenderObject 或渲染 factory。

### 完成定义

- [x] Assets 中已导入的 MP3、OGG、WAV、M4A、AAC、WebM audio root 显示与 image、Spine、VNI、
      ImgNumber、video、JSON 相同的“程序键 / 设为程序资源 / 取消强制导出”操作。
- [x] audio 未被 Event 引用但已绑定程序键时进入 canonical v7 `runtimeResources` 与 mapped production ZIP；既无
      Event 引用也无程序键时仍只留在 authoring workspace，不进入 export closure。
- [x] Scene Layout `runtimeResources` 支持 strict
      `{ kind: "audio", path, mediaType }`；`SceneLayoutPackageResource.loadRuntimeResource(key, "audio")`
      返回 exact `{ kind: "audio", url, mediaType }`，eager/lazy、并发、wrong-kind、missing、destroy 行为与其它
      program resource 一致。
- [x] program audio 不生成 `gamelayout:/resource/audio/...` RenderObject factory address；
      `createRenderObject()`/ImgNumber factory 对 audio exact key 显式拒绝，UI 只显示 typed load API 提示。
- [x] 同一 audio root 可同时被 Event audio 与一个程序键引用；导出只写一份 logical payload，重导后恢复两种
      owner，取消其中一种不会误删另一种仍使用的 bytes。
- [x] optimized ZIP、asset groups 与 CDN delivery 能结构化保留 program audio path/media type/bytes；同一文件若也有
      Event music/effect 分类则沿用其既有 AAC 优化并同步改写两处引用，纯 program audio 不猜 music/effect 分类。
- [x] canonical legacy audio catalog 继续为空、mode 继续无 `bgm`、`eventAudio.ignoreLegacyAudio` 继续为 true；
      Event audio dialog、bus/focus/once/loop 行为及其它资源程序导出保持不变。
- [x] 完成 RenderCore、Game Layout Editor、Game Layout package CLI 与 Gameframeworks 直接依赖链的定向自动验收、
      文档/领域规则和 UTC 中文执行报告。
- [ ] 真实浏览器导出/重导验收（按用户要求由用户执行）。

## 2. 范围

### 包含

- RenderCore Scene Layout latest v7 现有 `runtimeResources` union 的 audio kind、strict parser、exact closure、
  eager/lazy resolved resource、public type/export 与 URL lifecycle。
- Game Layout Editor audio root 的程序键 bind/unbind、Assets 状态/详情、manifest round-trip、preview pruning、
  mapped ZIP exact closure 和 legacy audio migration 保留判定。
- Game Layout package CLI 对 program audio 的 typed reference rewrite、AAC 交叉引用、runtime-resource group、
  optimized ZIP 与 byte-preserving CDN delivery。
- Gameframeworks 对新增 public audio resource type的最小 facade/export 编译保护。
- 直接测试、README、三份领域规则与执行报告。

### 不包含

- 不恢复 mode BGM、root `audio.programmaticEffects`、Popup/Symbol audio cue 或 legacy ignore toggle；全局 Event
  dialog 仍是唯一配置“何时播放、music/effect bus、once/loop、focus”的 authoring 入口。
- 不给纯 program audio 猜测 music/effect 分类、播放模式、voice policy、focus 或默认名称；本任务只建立显式
  export/load identity，不新增第二套 audio playback state machine。
- 不让 audio 创建 scene node、背景、transition、Picker visual preview、RenderObject、Object URL address alias 或
  raw mutable `@pixi/sound` instance。
- 不让 leaf file 独立绑定程序键。这里的“所有 assets”指 Assets 列表中可独立操作的顶层
  `EditorLayoutResource` root；Popup/Symbol package 继续使用各自现有 typed program/dependency binding。
- 不允许一个 root 同时绑定多个程序键，不新增 filename/path/hash 推断、orphan allowlist 或 silent alias；现有
  exact one-root/one-key transaction 保持。
- 不修改 production 游戏、assets/YAML、外部仓库、依赖版本、workspace 配置或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-09-01T03:13:54Z
HEAD: d0d7eb8c606368b7f6b7d5b54a81ea6f4c3d97c7
branch: detached HEAD（HEAD 同时位于 main）
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `tasks/227-gamelayouteditor-audio-asset-workflow.md`
- `tasks/228-rendercore-gamelayout-runtime-addressing.md`
- `tasks/246-gamelayouteditor-json-runtime-data.md`
- `tasks/273-editor-legacy-audio-authoring-removal.md`
- `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md`

目标 app/package 下没有适用的补充 `AGENTS.md`。

当前结论：

- `apps/gamelayouteditor/src/ui/resources-workspace.ts#resourceRowMarkup()` 对 audio 只显示“在项目的全局 Event
  音频中绑定”，明确不渲染程序键输入和 bind button；详情也把无 Event 引用的 audio 判定为不会导出。
- `apps/gamelayouteditor/src/model/resource-commands.ts#bindRuntimeResource()` 对 `resource.kind === "audio"`
  显式抛错；`editor-project.ts#editorResourceToRuntimeSpec()` 有第二个相同 gate，因此不能靠只改 UI 绕过合同。
- `EditorProject.runtimeResourceBindings`、key normalize/uniqueness、delete cleanup、unused filter 与 manifest
  builder 已适用于普通 root，无需为 audio 建第二份 binding 表。
- `packages/rendercore/src/scene-layout/types.ts#SceneLayoutRuntimeResourceSpec` 当前支持 image、Spine、
  image-string、VNI、video、JSON，不含 audio；`manifest.ts#parseRuntimeResources()` 与
  `collectSceneLayoutAssetPaths()` 也显式枚举同一集合。
- `SceneLayoutPackageResource.loadRuntimeResource(key, kind)` 已拥有 exact key/kind、eager/lazy Promise 复用、
  successful cache 与 destroy transaction；JSON 证明非渲染 program root 可以复用该 owner而不进入 runtime address。
- `packages/rendercore/src/scene-layout/core/runtime-address.ts#createGameLayoutRuntimeAddresses()` 当前只排除 JSON，
  其它 `runtimeResources` 都被当成 RenderObject factory；新增 audio 后必须显式排除，不能让 factory 晚到失败。
- `manifestToEditorProject()` 先注册 runtime resources、后注册 Event audio，并按 signature 复用同一 root；但当前 legacy
  audio GC 只考虑 Event paths，执行时必须同时保护 runtime-bound audio，避免导入迁移误删 bytes。
- `editorProjectToPreviewManifest()` 当前只剔除 JSON program roots；纯 program audio 也应从画布 preview eager
  closure 排除，而同路径 Event binding 仍由 production Event audio owner独立准备。
- `apps/gamelayoutpkgcli` 已为每个 runtime resource 生成独立 deferred group，并让 CDN delivery 把 audio/video
  作为 byte-preserving external media；legacy optimized ZIP 的 AAC role 只来自 typed Event/历史 audio binding。
- 当前领域规则与 README 明确写着 audio 不得进入通用 `runtimeResources`。这正是本任务根据用户新要求需要
  更新的旧边界；“Event 是唯一音频行为 authoring 入口”和 AudioCore playback ownership 不随之取消。
- 当前 shell 中 `node` 不在 PATH，`pnpm` 来自 Codex fallback runtime；执行会话按仓库约定切换 Node 24。

## 4. 需求解释与技术决策

### 需求解释

1. “音乐音效文件不能选择程序导出”指 Assets 列表中 audio root 被唯一特判排除；期望动作是复用现有程序键
   workflow，而不是重新引入旧音效路由表。
2. “所有 assets”要求消除顶层 `EditorLayoutResource` 中 audio 的例外。image/Spine/VNI/ImgNumber/video/JSON
   已可程序绑定，Popup 有 program Popup，Symbols 有 mode binding；本任务不把 nested dependency leaf 提升为 root。
3. 程序导出是显式 production identity：稳定 key 写入 manifest、typed root 进入 exact closure、consumer 以 exact
   key/kind load。它不是“只把孤儿文件塞进 ZIP”，也不是按 filename 自动发现。
4. audio 文件本身只声明编码 media type，不能从文件名或内容判断其业务上是 music 还是 effect；因此 program-only
   export 不应生成 bus/playback/focus 默认值。

### 关键决策

1. **扩展现有 v7 `runtimeResources`，不新建平行 audio program catalog。**
   - 新增 `SceneLayoutRuntimeAudioResourceSpec = {kind:"audio", path, mediaType}`，key 继续参与现有
     `runtimeAllocation.onDemand.runtimeResources`、exact closure、mapped assets map 与 deferred group。
   - 这是与任务 246 JSON kind 相同的 additive tagged-union 扩展；latest 保持 v7，无新必填字段、空默认目录或旧包迁移。
2. **program audio 是 typed data/media resource，不是 RenderObject factory。**
   - `loadRuntimeResource(key, "audio")` 返回 frozen `{kind:"audio", url, mediaType}`；unknown/wrong kind 显式失败。
   - runtime address catalog 与 `createRenderObject` 明确排除 audio，Editor 详情显示 exact load 调用提示而不伪造
     `gamelayout:/resource/audio/...`。
3. **URL 由 package resource 拥有。**
   - mapped/standalone bytes 产生的 Blob URL 在 package destroy 时统一 revoke；CDN delivery resolver 返回的 external URL
     不由 runtime revoke。
   - 同 path/mediaType 同时被 Event audio 与 runtime audio 使用时复用 resolved URL/cache，但保留 Event binding 与
     program key 两个独立 typed identity；任一 owner取消不会修改另一个 owner。
4. **Editor 复用单一 binding transaction。**
   - 删除 command/model/UI 的 audio exclusion，仍使用 `runtimeResourceBindings` 的 normalize、uniqueness、bind/unbind、
     delete 与 clone 逻辑。
   - preview manifest 剔除 JSON 与 audio program roots；Event audio 自身继续保留并通过 production preview播放。
5. **optimizer 不猜 program-only audio role。**
   - 纯 program audio 在 legacy optimized ZIP 中保持原 bytes/key/mediaType，只做 typed closure与分组；CDN delivery 本就
     byte-preserving。
   - 若同一 path 同时由 Event music/effect引用，现有明确 category 决定 AAC policy；optimizer 改名为 M4A 时必须原子
     同步 Event source 与 runtime audio `path/mediaType`。冲突 media type 显式失败，不按任一方静默覆盖。
6. **不增加 AudioCore playback API。**
   - 本任务满足 export/load，不让 RenderCore 返回 mutable backend instance，也不复制 AudioCore 的解锁、bus、focus、
     suspend/resume 与 destroy 状态机。
   - 如果后续需要“按程序键直接播放并纳入 music/effect bus”，必须以独立 typed playback 合同规划，不能在本任务中
     把 raw URL 自动播放或恢复 legacy `programmaticEffects`。

## 5. 职责与合同

- **Scene Layout data**：拥有 audio runtime spec、strict key/path/mediaType parsing、v1–v7 compatible normalization、
  allocation 和 exact reference collection；未知 kind/media type 失败。
- **Scene Layout core/package resource**：拥有 eager/lazy bytes或external URL解析、typed resource cache、同 key Promise、
  Event/program URL 共享与 destroy cleanup；不解释 music/effect业务语义。
- **Runtime address/RenderObject factory**：只为真实可创建渲染对象的 kinds 建 factory；audio 与 JSON 从 factory catalog
  排除，并在错误 API调用点报告 actual kind。
- **Game Layout Editor**：拥有 filename-key audio root、程序键 transaction、Event audio binding 和 mapped ZIP；同一
  resource 的 typed reference 与 program binding 从 project实时派生，不保存第二份 used boolean。
- **Game Layout package CLI**：按 typed spec 改写 program audio path/mediaType、输出 runtime-resource group，且只在已有
  Event category 提供证据时做 AAC role 优化；不扫描 filename、bytes或 arbitrary JSON 猜用途。
- **Gameframeworks/game consumer**：只经 Scene Layout core/facade 使用 exact `loadRuntimeResource(key,"audio")`；不从
  assets map、physical hash path 或 manifest bytes重建资源表。
- **资源生命周期**：authoring bytes 属于 Editor project；resolved URL/cache 属于 package resource；lazy load期间 destroy
  必须拒绝 pending Promise、不 commit cache并释放新建 URL。
- **失败策略**：bad schema/version/key/path/mediaType、missing/mismatched bytes/map entry、duplicate binding、wrong kind、
  unsupported factory、optimizer reference冲突与 destroyed owner 均显式失败，不 fallback。
- **禁止行为**：UI-only keep flag、orphan allowlist、filename guess、audio→RenderObject、隐式 effect/music默认、第二份
  playback runtime、raw mutable sound instance或静默丢弃 shared Event/program owner。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/tests/scene-layout/manifest-runtime-audio.test.ts
packages/rendercore/tests/scene-layout/package-resource-audio.test.ts
tasks/277-gamelayouteditor-audio-program-export-<utctime>.md
```

若现有测试文件能清晰容纳相同合同，可不新增两个测试文件，改为扩展对应定向 suite。

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,manifest,resource,package-resource,render-object-factory}.ts
packages/rendercore/src/scene-layout/{data,core}/**
packages/rendercore/tests/scene-layout/{manifest,resource,runtime-address,render-object-factory,delivery-loader}.test.ts
packages/rendercore/README.md

apps/gamelayouteditor/src/model/{editor-project,resource-commands}.ts
apps/gamelayouteditor/src/ui/{app-shell,resources-workspace,preview-asset-paths}.ts
apps/gamelayouteditor/tests/{audio-assets,app-shell,zip-io}.test.ts
apps/gamelayouteditor/README.md

apps/gamelayoutpkgcli/src/{audio-assets,audio-optimizer,reference-rewriter,asset-groups}.ts
apps/gamelayoutpkgcli/tests/{audio-assets,audio-optimizer,reference-rewriter,asset-groups,package-flow}.test.ts
apps/gamelayoutpkgcli/README.md

packages/gameframeworks/{src/index.ts,tests/exports.test.ts,README.md}
docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md
```

执行时按实际 symbol 缩小文件集；`delivery-loader.ts` 仅在现有 generic loader 不能解析 audio runtime kind 时修改。

### 原则上不应修改

```text
packages/audiocore/src/core/**
packages/rendercore/src/{popup,symbol,reel,image-string}/**
packages/{logiccore,uiframeworks,editorcore,editorresource,browserartifactio,vnicore}/**
apps/{popupeditor,symbolseditor,imgnumbereditor,editordemo,game002v2,game003v2}/**
assets/**
AGENTS.md
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

若执行发现必须新增 audio playback API、schema version、依赖或修改正式游戏 consumer，属于范围扩张，先报告证据并
重新确认，不修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与行为矩阵**
   - 重核 HEAD/status、三份领域规则、v1–v7 parser/upgrader、program resource eager/lazy/address 分支和 CLI 两种输出。
   - 用自包含 fixture 固定 audio 的 unbound、program-only、Event-only、Event+program、eager、lazy、optimized ZIP、
     CDN delivery、destroy 与 wrong-kind 期望。
2. **扩展 Scene Layout audio runtime resource合同**
   - 在 data types/strict parser增加 audio spec，复用 AudioCore `AudioMediaType` 值域；同步 asset path collection、latest
     normalization/materialization、allocation一致性和 public exports，保持 latest v7。
   - 覆盖 v1–v7无 audio runtime root 的兼容读取、合法 audio root、unknown media type/extra key/path、duplicate key和
     future version failure。
3. **实现 package resource prepare 与生命周期**
   - eager与lazy两条路径把 exact bytes/external route解析为 frozen audio runtime resource；共享 Event/program URL resolver，
     保持 cache identity、Promise复用、retry与destroy cleanup。
   - runtime address compiler过滤 audio；RenderObject/ImgNumber factory为 audio 输出清晰 wrong-capability错误，不 fallback。
4. **接入 Game Layout Editor 程序键**
   - 移除 `bindRuntimeResource()`、`editorResourceToRuntimeSpec()` 和 Assets markup 的 audio特判，输出/读取
     `{kind:"audio",path,mediaType}`；详情显示 `loadRuntimeResource(key,"audio")`。
   - 重导时按 exact signature合并 runtime/Event共享 root；legacy audio migration GC把 program-bound path也视为存活 owner。
   - preview只剔除非视觉 program audio declaration，不剔除 Event binding；unused filter、删除、取消绑定和 feedback按双 owner
     实时计算。
5. **同步 mapped ZIP、optimizer 与 delivery**
   - 证明 export closure只包含 program/Event可达 audio，assets map保持 exact media type，重导恢复key与bytes且不重复root。
   - CLI reference rewriter支持 audio spec；Event证据触发 AAC时同步 `.m4a` path/`audio/mp4`，纯 program audio保持原样；
     media type冲突在写出前失败。
   - `runtime-resource:<key>` group只含 exact audio path；CDN delivery保持外置byte-preserving media route，lazy load按key工作。
6. **保护既有行为与 public facade**
   - 回归其它六类 program root、JSON无地址、video/ImgNumber factory、Event audio preview、legacy-empty audio policy与
     one-root/one-key限制。
   - 同步 Gameframeworks public type re-export和直接consumer编译；不为游戏引入raw audio backend。
7. **文档、规则、人工验收与报告**
   - 更新 Editor、RenderCore、CLI README与三份领域规则，把旧“audio禁止runtimeResources”改为“可显式program
     export，但音频行为仍只由Event authoring/AudioCore owner负责”。
   - 运行 L2定向命令，完成真实浏览器和production ZIP/重导检查，生成 UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- RenderCore fixture使用最小 WAV/OGG header或内存 URL，不读取任何游戏 `assets/` 美术。
- parser/resource覆盖全部 `AudioMediaType`、unknown MIME、extra field、unsafe path、missing bytes、wrong kind、
  eager/lazy concurrent cache、failed retry、destroy-before/during/after load和URL revoke。
- address/factory测试确认 audio与JSON都没有 resource-factory descriptor；同名 node/resource和wrong kind不 fallback。
- Editor覆盖 program-only、Event-only、Event+program、bind/unbind/delete、legacy migration、preview pruning、mapped ZIP
  round-trip和Assets中文UI；其它 root的程序键行为不变。
- CLI覆盖纯program audio byte-equal、Event共享audio AAC改写两份typed reference、mediaType冲突、runtime-resource group、
  external CDN media与delivery lazy resolution。
- 测试不通过改宽 parser、猜默认 effect/music或保留 orphan payload来迁就 fixture。

### 验收级别

`L2`：修改 RenderCore Scene Layout 跨包 public schema/type/resource API、正式 mapped ZIP、CLI reference/group 与
Gameframeworks直接consumer；不修改根工具链、lockfile、production asset或release配置，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-runtime-audio.test.ts tests/scene-layout/package-resource-audio.test.ts tests/scene-layout/runtime-address.test.ts tests/scene-layout/render-object-factory.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/audio-assets.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/audio-assets.test.ts tests/audio-optimizer.test.ts tests/reference-rewriter.test.ts tests/asset-groups.test.ts tests/package-flow.test.ts
pnpm --filter gamelayouteditor build
git diff --check
```

- 如果实现选择扩展现有 RenderCore test file而未新增两个建议文件，第二条命令替换为实际 exact test paths，不扩大到
  package全量 coverage。
- 多 filter typecheck若当前 pnpm不会为全部目标执行script，则拆成四条同名package命令；这是命令适配，不升级范围。
- 失败时先最小化到 exact audio case并判断是否由本任务引入，不自动运行根级 typecheck/lint/test/build/format。

### 人工验收

1. 在真实浏览器中分别导入 WAV/OGG/M4A audio；只给其中一个设置程序键 `bonus-music`，确认它进入“程序资源”
   filter，详情显示 typed load提示且不显示 RenderObject地址，未绑定文件仍显示“不会导出”。
2. 将同一 audio再配置为一个 Event track，导出并重导 mapped ZIP；确认 Assets中仍只有一个root，Event与程序键都恢复，
   payload只写一份。先取消Event、再取消程序键，分别确认另一owner仍保留、最后才从下次export closure排除。
3. 用 production package resource执行 `loadRuntimeResource("bonus-music", "audio")`，确认 URL可加载且media type一致；
   wrong key/kind显式失败，package destroy后owned URL失效。验证 preview不因纯program audio自动播放或创建声音。
4. 对该 ZIP分别运行 legacy optimized output和 CDN delivery check：纯program audio保持bytes；Event共享audio若被转为M4A，
   runtime/Event两处引用与assets map一致；delivery保持external content-addressed media且可lazy load。

### 独立验收建议

`必须`：涉及跨包 public contract、正式 ZIP/optimizer/delivery、lazy resource URL ownership与destroy；不涉及credential或
server数据。独立复验重点命令：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-runtime-audio.test.ts tests/scene-layout/package-resource-audio.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/audio-assets.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/audio-optimizer.test.ts tests/reference-rewriter.test.ts tests/asset-groups.test.ts tests/package-flow.test.ts
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24。当前 shell没有 `node`，执行会话先运行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 pnpm，不切换 npm/yarn。依赖缺失时：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置仓库约定代理并重试。本任务复用现有 AudioCore media type、RenderCore resource loader、
  editorresource map和CLI，不新增依赖、不修改lockfile。
- CLI真实 AAC人工验收需要系统 `ffmpeg`/`ffprobe`；自动化继续使用可注入fake runner。

## 10. 生成物、文档与规则

- 本任务不修改 YAML或生成 TypeScript，不运行生成器；mapped ZIP/asset-groups/delivery属于测试临时产物，不提交。
- `apps/gamelayouteditor/README.md` 记录 audio程序键workflow、Event/program双owner与无factory地址边界。
- `packages/rendercore/README.md` 记录 audio spec、typed load、URL ownership和wrong-capability行为；
  `apps/gamelayoutpkgcli/README.md` 记录program-only保真及Event共享AAC改写规则。
- 最小更新 `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md` 的稳定职责：audio可作为typed
  runtime resource强制导出，但Event仍是唯一音频行为authoring入口，AudioCore仍是播放生命周期owner。
- 不把具体audio文件清单、码率样例、执行证据或一次性测试结果追加到根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/277-gamelayouteditor-audio-program-export-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终schema/API、实际修改文件、Event/program双owner与CLI策略、计划偏差、自动/人工验收、剩余风险；
不收集无关coverage、完整历史矩阵或profiler数据。

## 12. 风险、假设与待确认

### 风险

- program audio与Event audio可共享同一logical path；如果URL cache、reference rewrite或GC只按单一owner实现，可能重复
  Object URL、漏改mediaType或提前删除bytes。
- lazy audio加载完成与package destroy竞态若没有复用现有generation/cleanup边界，会泄漏Blob URL或把已destroyed
  resource写入cache。
- legacy optimized ZIP需要music/effect role选择码率；纯program audio没有该语义，若实现偷偷默认effect会改变bytes并形成
  不可见业务决策。
- 旧consumer不会识别新增audio runtime kind；本仓库直接依赖链必须同步typecheck，外部consumer升级RenderCore后才能消费
  含该kind的新导出物。
- 浏览器仅凭单测不能证明全部codec可加载；尤其AAC/WebM/Safari差异需要真实浏览器验收，但不得以unsupported codec静默
  fallback到另一source。

### 假设

- 用户要求的是给Assets顶层audio root补齐现有“程序资源”导出能力，不是恢复root programmatic effect authoring或要求
  新增直接播放API。
- 一个audio root继续最多绑定一个程序键；如需多个业务alias，应新增显式多binding合同，不能复制同一路径或静默alias。
- Scene Layout latest在执行时仍为v7；若期间版本升级，按新latest小幅适配，不创建竞争version或倒退schema。
- program-only audio在legacy optimized ZIP中保持输入bytes；只有同路径已有Event category时才沿用其明确AAC优化role。

### 待确认

无阻塞项。若执行前用户进一步要求“程序键直接播放并自动接入music/effect音量总线”，应拆出AudioCore/Scene Layout typed
playback API任务，不在本计划中隐式扩大。
