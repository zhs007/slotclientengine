# 223 audiocore-data-core-editor-runtime 任务计划

## 1. 目标与完成定义

### 目标

新增独立 `@slotclientengine/audiocore` package，基于与当前 PixiJS 8 兼容的 `@pixi/sound` v6，建立数据、game runtime core 和 editor wrapper 三层单向依赖：

```text
@slotclientengine/audiocore/data
  ↓
@slotclientengine/audiocore/core
  ↓
@slotclientengine/audiocore/editor
```

- `data` 拥有 versioned music/effect asset、通用 effect binding、cue、BGM focus policy、strict parser、reference closure 和结构化 rewrite，不依赖 Pixi、DOM、timer 或 editor workspace。
- `core` 专供 game runtime，包装 `@pixi/sound` 的按需准备、命名/循环音效、逻辑名 stop、music/effect channel、BGM duck/pause focus、动画时钟 cue、取消、音量/静音和 destroy。
- `editor` 组合同一 data/core，提供音频导入、媒体元数据、mapped assets、共享 effect draft/controller、试听和 cue preview；不创建第二套播放引擎。

初始落地同时接入 Game Layout、Popup 和 Symbol 三个 owner：Game Layout 拥有按 game mode 配置的背景音乐及程序直接播放资源；Popup/Symbol 在各自 manifest 中绑定与动画
生命周期同步的延迟音效。

### 完成定义

- [ ] 新 package 只通过 `./data`、`./core`、`./editor` 显式子路径导出，没有混合 root
      wildcard、DOM/Application 或 editor 能力泄漏到 core。
- [ ] audio v1 严格区分 BGM 与 effect；共享 `AudioEffectBindingV1` 统一 local name、asset、`once | loop`、非负 `offsetSeconds`、voice policy 和 `keep | duck | pause` BGM policy，三个 editor 不维护分叉字段/默认值。
- [ ] `AudioRuntime` 提供 `prepare()`、`playEffect()`、`stopEffect()`、music/effect 音量、master mute、unlock、cue timeline 和幂等 `destroy()`；不暴露 `@pixi/sound` mutable instance 或全局 cache。
- [ ] 音频 bytes 不加入 splash/loading 进度与 `99%/100%` gate；只在对应 mode/audio owner 激活后按需或显式异步准备，不将“未预加”错写为“底层一定流式播放”。
- [ ] Scene Layout latest manifest 可为每个 game mode 显式选择 0 或 1 首 loop BGM；BGM 完全可选，splash 通常不配置但不被 schema 禁止。已配置的 binding 可设置正的 `fadeOutSeconds` / `fadeInSeconds`。目标 mode 成功
      commit 后才开始旧曲渐隐、新曲渐现的平滑交接；失败/rollback 保留旧曲，相同 BGM
      保持原 loop instance/position 而不重启。
- [ ] Game Layout Editor 可导入、命名、试听音乐/音效，为每个 mode 选择 BGM，并在用户触发的 mode preview 切换中听到与 production runtime 一致的切歌行为。
- [ ] Popup/Symbol 只 author local effect name（例如 `coin`），不存储、预览或猜测全局前缀。Game Layout 组合时才以 binding name 生成全局 route：Popup Editor 的 `coin` + Game Layout popup binding `award` → `award.coin`；binding rename 由 Game Layout 结构化重编译，不回写 nested manifest。
- [ ] Game Layout 未被 cue 引用但需代码播放的 effect 必须进入 `programmaticEffects`；组合后程序用 `playEffect(route)` / `stopEffect(route)`，`stopEffect("award.coin")` 同时取消 pending delay 并停止 matching active instance。
- [ ] `loop` effect 每个组合后 route 最多一个 active generation，重复 start 返回现有 handle 而不叠加；动画/阶段结束不自动停 manual loop，仅显式 stop、owner/package destroy 或 rollback 停止。Standalone editor preview 使用 local binding/handle 清理，不创造 route。
- [ ] effect 真正开始时才取得 BGM focus，end/stop/error/cancel/destroy 时释放；`pause` 优先于 `duck`，多个 duck 取最低 target gain，最后一个相关 effect 释放后才以 authored release/fade 恢复 BGM。
- [ ] Popup/Symbol cue 以动画/阶段开始为 0，跨过 `offsetSeconds` 时恰好触发一次；重播重置，切状态、skip、rollback 或 destroy 取消未触发 cue 和 late completion。
- [ ] 三个 editor 共用同一 effect 配置模型/校验/预览 controller，只有 target picker 属于 domain；BGM 配置仅出现在 Game Layout Editor。任一 editor 配置 effect 后，production preview 可听到 delay/loop/focus 行为。
- [ ] Symbols Editor 保持“所有 symbol 同时预览所选 state”视觉行为，增加 preview-only 单选 symbol 下拉框；只选中 symbol 的 cue 进入 audio sink，其余 symbol 无声，该选择不写 manifest。
- [ ] physical audio asset 继续通过 filename key 和 `assets.map.json` 路由；editor/export/ZIP
      严格验证 hash/size/orphan，runtime 只在实际消费时验证映射、可读取和 decoder/backend。
- [ ] active playback、pending load、cue timeline、listener、timer/clock subscription、Object URL 和
      owned `Sound` 都有唯一 owner；失败可 rollback，销毁后无晚到播放、全局 `removeAll()`
      或关闭其他 runtime 的 AudioContext。
- [ ] 完成 data/core/editor boundary、schema upgrade/closure、定时同步、资源生命周期、
      直接 consumer 编译与真实浏览器听觉/Network/Memory 验收，生成 UTC 中文执行报告。

## 2. 范围

### 包含

- 新增 `packages/audiocore` 的 v1 data/core/editor、tests、benchmark 和 README。
- 新增 `@pixi/sound` v6 依赖，同步 package manifest 与 `pnpm-lock.yaml`。
- 扩展 `editorresource` 的音频扩展名/MIME 严格映射，复用现有 ingestion、workspace、content-addressed path 和 assets-map transaction。
- Popup latest、Symbol latest 和 Scene Layout latest 的版本升级、audio reference closure/rewrite、runtime cue 接入和 production ZIP/resource group 同步。
- `gamelayouteditor`、`popupeditor`、`symbolseditor` 的导入、配置、试听、preview 和导出。
- `gamelayoutpkgcli` 的音频 typed dependency graph、结构化 rewrite 和 group closure。
- `gameframeworks` 对 audiocore game API/type 的 facade/re-export，以保持游戏 app 默认不直接依赖底层 package，并将现有 framework `muted` 状态传递到音频 runtime。

### 不包含

- 不强制任何 mode（包括 splash）配置 BGM，不把音频 bytes 纳入首屏进度或阻塞 `100%`；若 splash 明确配置 BGM，也走普通 mode 的按需播放/autoplay 规则。
- 不保证所有音频都使用 network streaming；`@pixi/sound` 默认 WebAudio 路径可能下载并 decode 整个资源，本任务保证的是“不进入初始 loading gate”和可控按需准备。
- 不新增 standalone Audio Editor app，不提供 waveform 剪辑、转码、混音、DSP filter、audio sprite 制作、可编辑渐变曲线或专用 transition music；v1 只提供 mode BGM 线性渐隐/渐现。
- v1 不从 Spine/VNI 文件自动推断 audio event，不绑定任意 display-tree node 或自由字符串 animation name；只绑定 Popup/Symbol owner 已验证的语义 state/segment lifecycle。
- 不添加占位音效、猜测路径、首项音乐默认、unsupported format 静默 fallback、无界播放/cache 或为规避浏览器 autoplay policy 而伪造用户手势。
- 不改动现有 production 美术资源；没有用户提供的真实音频时，只使用单测 fixture 和人工验收资源，不将 fixture 发布到游戏。
- 不在本任务把 Leo `sound/music` 数值设置升级为新全局平台合同；先接入现有 `muted` 主开关，分 channel volume API 留给明确 caller 设置。

## 3. 制定计划时的基线

```text
UTC: 2026-08-17T04:32:46Z
HEAD: 99527cca96a5cb8735aa82a6a717f16a537389ac
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/shared-game-runtime.md`、`editor-artifacts.md`、`scene-layout.md` 和 `loading-ui.md`；目标 package/editor 目录无补充 `AGENTS.md`。
- `packages/audiocore` 尚不存在，根 package 与 lockfile 也没有 `@pixi/sound`。官方 `pixijs/sound` 兼容表指定 PixiJS v8 对应 Sound v6；upstream 声明 `pixi.js ^8.0.0` peer dependency，与仓库当前 PixiJS 8 主版本一致。
- 官方 API 同时提供 `preload`、非预加播放、WebAudio/legacy media context 和多 instance；因此“不等 splash loading”可实现，但“所有资源一定 stream”不是已确认事实。
- `gameframeworks` 已有 `SlotGameStateSnapshot.muted`、`setMuted()` 和 adapter `setFrameworkState()`，但当前只更新 UI/game adapter，没有音频 runtime。
- `platformbootstrap-leo` 能解析独立 `sound/music` 0..100，但当前 bootstrap snapshot 只在两者同为 0 时生成一个 `muted` boolean；本任务不虚构已存在的 channel setting 传递链。
- `editorresource` 的 workspace/assets-map 是通用 bytes + mediaType 机制，但 `assertMediaTypeMatchesExtension()` 尚未列出音频扩展名。
- Popup latest 是 v6，Symbol state manifest latest 是 v2，Scene Layout latest 是 v3；三者都无 audio asset/cue 合同。Popup 已有 state/segment，Symbol 已有 state playback，Scene Layout 已有 atomic mode prepare/commit/rollback，可作为绑定锚点而不新建重复状态机。
- `gamelayouteditor` 现有 generic resource import、mapped assets 和 production preview；`popupeditor`/`symbolseditor` 已用各自 production runtime preview。编辑器应在这些 owner 上增加 audio authoring，不另造 fake player。
- 当前代码、测试和官方 `@pixi/sound` 文档已足以确定边界，不需审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “音乐按 mode”是 Scene Layout 的独立、可选 BGM 合同，只在 Game Layout Editor author；每个 mode 均可为无 BGM 或不同 BGM。splash 通常留空，但若产品明确配置也使用同一合同，不写死禁止。
2. Popup/Symbols Editor 只 author 单一 package 内的 local effect/target，本地预览可听；导出 package 并被 Game Layout Editor 导入/绑定后才聚合为全局 route、进入 production closure 并在游戏生效。
3. “延迟多久播放”使用 `offsetSeconds` 表示相对 owner 语义动画起点的时间，与现有 animation duration 单位一致；不使用与动画脱节的永久 `setTimeout`。
4. 循环 effect 的 local name 是 package 数据，`award.coin` 是 Game Layout 组合后的路由；“程序播/停”只能使用组合后显式 allowlist/route，不传 URL 或让 nested editor 认识外部 binding name。
5. effect 对 BGM 的降音量/暂停是 effect lifecycle 持有的 audio focus；延迟期不取 focus，真正开始后才取得，完成或所有退出路径都必须释放。
6. “core 简洁、高性能、内存干净”落实为 compiled route/cue/focus lookup、非 ticker 热路径零全表扫描、bounded voices、最小 handle、可取消 prepare 和 owner-scoped destroy；不在未 profile 前承诺固定 FPS/heap 数字。
7. 音频不进入首屏 gate，但精确 cue 不假设首次 fetch/decode 零延迟；owner 激活后对 exact closure 做可取消 `prepare()`，是否等待由该 owner transaction 决定，不更改 splash/loading 进度。

### 关键决策

1. **effect 配置是一份通用 data/editor 合同，BGM 是另一份 Game Layout-only 合同。**
   - audiocore data 定义 local name/asset/once-or-loop/delay/voice/BGM-focus；audiocore editor 实现一个共享 draft/controller/preview section，Popup、Symbols、Game Layout 只注入各自 target picker。
   - Game Layout 另行拥有 mode BGM 与 `programmaticEffects`；Popup/Symbol 拥有 local target/cue。audiocore 不 import rendercore，core 不理解 mode/popup/symbol。
2. **nested package 只有 local name，Game Layout 是唯一全局 route owner。**
   - Popup/Symbols Editor 导出 local effect 和 physical filename key；Game Layout 在绑定 package 时用 binding path + local name 编译 route，例如 `award` + `coin` 为 `award.coin`，并 strict 拒绝 segment 或组合冲突。
   - 重命名 Game Layout binding 会重编译 route/allowlist 而不改 nested manifest；physical bytes 由根 assets map 按 hash 去重，不因 URL 猜业务 identity。
3. **BGM 是 loop，切换隶属 mode commit 并使用渐隐/渐现。**
   - mode BGM 只能引用声明 loop 的 music asset；prepare 验证/准备 target BGM，不改变旧曲。
   - 成功 commit 后，先确认新 loop instance 能以 0 音量启动，再由同一 presentation clock
     并行推进旧曲 `fadeOutSeconds` 和新曲 `fadeInSeconds`；渐隐结束才 stop 旧 instance。
   - 新曲启动/渐变创建失败时停止新曲并恢复旧曲音量；相同 qualified BGM 保持
     当前 loop/position，从静音进入只渐现，进入无 BGM mode 只渐隐。不存在音量硬切路径。
4. **BGM focus 是按 active effect instance 引用计数的可组合状态。**
   - `keep` 不取 focus；`duck` 将 BGM 乘以 0..1 target gain；`pause` 渐隐后 pause 并保留 position，释放后 resume/渐现。pause 优先，多 duck 取最低 gain；新增/释放时使用引发变化的 authored attack/release/fade。
   - focus 从 effect 实际 start 到 end/stop/error/cancel/destroy；manual loop 持有到 `stopEffect()`。mode BGM handoff 继承当前 aggregate focus，不因切 mode 提前恢复或丢失 pause position。
5. **cue 由播放时钟推进，不依赖全局壁钟。**
   - core 编译排序后的 cue table，timeline 接收 owner 的 monotonic local playback time，只对
     `(previousTime, currentTime]` 跨越的 cue 触发一次。
   - pause 不推进，skip 按 domain 规则显式跨越/取消，replay 创建新 generation，保证快速模式、
     preview seek 和 destroy 不会留下旧 timeout。
6. **使用 owner-scoped `Sound`/instance，不直接依赖全局 alias registry。**
   - core 通过窄 adapter 包装 `@pixi/sound`，生产实现与 fake 测试 backend 共用同一内部
     contract；public API 不泄漏 library object。
   - runtime 只 destroy 自己创建的 sound/instance/Object URL，不调用 global `removeAll()`、
     `close()` 或改变其它 runtime 的全局设置。
7. **autoplay 被建模为可观测状态。**
   - mode BGM 只在对应 mode owner 激活且 audio runtime 存在后请求；未配置时不请求，若浏览器尚未 unlock，
     core 保留唯一个显式 pending active-music request。
   - 合法用户手势调用 `unlock()` 后只播放仍属当前 mode 的 request；手势前切 mode
     会替换旧 request，destroy 会取消，不伪造成功或无界排队 effect。
8. **三个 domain manifest 正式升版，而不向旧版塞可选字段。**
   - 预计 Popup v7、Symbol state manifest v3、Scene Layout v4 成为 latest；旧版经唯一 normalizer
     升级为无 audio 的 latest，旧游戏视觉和无声行为保持。
   - CLI/editor/runtime 不各自猜版本；一个 typed traversal 同时用于 closure、rename 和 materialize。

## 5. 职责与合同

- **Data**：拥有 BGM 与 `AudioEffectBindingV1` asset/source/playback/delay/voice/focus types、strict parse、local reference/closure/rewrite、compiled cue/focus pure helper；不读 bytes、不创建 Sound。
- **Core**：拥有 `@pixi/sound` adapter、prepare dedupe、bounded voice、named manual loop、pending/active stop、BGM handoff、focus arbitration/gain/pause、unlock、handle、cue timeline 和 destroy；route lookup 预编译，播放热路径不 parse 字符串或扫描 manifest。
- **Editor wrapper**：拥有 audio file adapter/metadata/mapped materialize、共享 effect draft/field validation/controller/preview session；app 拥有 File input、host UI 和 domain target picker，BGM panel 只由 Game Layout 使用。
- **Game Layout**：拥有 mode→BGM、`programmaticEffects`、nested binding namespace、global route compiler/allowlist 和唯一 AudioRuntime；只导入并绑定的 Popup/Symbol package 才进 production closure/game runtime。
- **Popup/Symbol**：拥有 local effect name/asset/target 与 cue generation，不知道 Game Layout binding/global route；standalone preview 用 local binding/handle，导出 package 后由 Game Layout 聚合。
- **Game API**：`gameframeworks` 对 app 公开组合后 `playEffect(route)` / `stopEffect(route)` facade/type；仅 allowlist route 可用，stop 为幂等且同时清理 pending/active/focus。
- **资源生命周期**：authored data 可共享；resolved URL/bytes 是 borrowed input；由 bytes 创建的 Object URL、Sound、playback instance、pending promise 与 timeline 由 runtime/session 拥有。prepare 失败或 abort 不进 cache，commit 失败保留旧 music，destroy 终止并释放所有 owned 对象。
- **并发与性能**：相同 asset 并发 prepare 共用 operation；稳定时一个 BGM，handoff 最多两个；manual loop 每 route 一个 generation，once effect 按显式 voice limit 叠加；active/focus 在结束/错误立即摘除，ticker 不创 snapshot/Map。
- **失败策略**：缺逻辑 id/physical mapping/bytes、格式不支持、decode/play 失败、未 unlock、voice 溢出、非法 mode/cue target、stale generation 和 destroy 后调用都返回 typed result/error；editor 预览显示诊断，production 不静默改播其它文件。
- **禁止行为**：不复制 domain 状态机、不在 core 扫 assets map/orphan/hash、不维护第二份 audio 资源表、不从文件名猜 channel/binding、不用无界 cache 换首次播放延迟。

## 6. 文件范围

### 预计新增

```text
packages/audiocore/package.json
packages/audiocore/tsconfig*.json
packages/audiocore/src/{data,core,editor}/**
packages/audiocore/tests/**
packages/audiocore/benchmarks/audio-runtime-hot-path.mjs
packages/audiocore/README.md
docs/audio-manifest.md
tasks/223-audiocore-data-core-editor-runtime-<utctime>.md
```

### 预计修改

```text
pnpm-lock.yaml
packages/editorresource/src/{workspace,*.test}.ts
packages/rendercore/package.json
packages/rendercore/src/{popup,symbol,scene-layout}/**
packages/rendercore/tests/**
packages/gameframeworks/{package.json,src/**,tests/**,README.md}
apps/gamelayouteditor/{package.json,src/**,tests/**,README.md}
apps/popupeditor/{package.json,src/**,tests/**,README.md}
apps/symbolseditor/{package.json,src/**,tests/**,README.md}
apps/gamelayoutpkgcli/{package.json,src/**,tests/**,README.md}
docs/agent-rules/{shared-game-runtime,editor-artifacts,scene-layout,loading-ui}.md
```

### 原则上不应修改

```text
assets/**
packages/{logiccore,netcore,uiframeworks,platformbootstrap,platformbootstrap-leo,gameloading*}/**
packages/{pixiani,vnicore,anieditorv5runtime-cc}/**
apps/{game002v2,game003v2,gameviewer,gameviewer2}/**
package.json
pnpm-workspace.yaml
turbo.json
```

workspace 已用 `packages/*` 自动包含新 package，不应为此修改 workspace/root scripts。`game002v2`/`game003v2` 的必要直接适配可随任务更新；仓库外 Crave 游戏代码若需适配，只新增明确的人工更新文档。若执行时需改变 platform 数值音量合同、动画文件格式、现有 production assets、一个新 app、根工具链或其它仓库外 consumer，必须先说明范围扩张。

## 7. 实施步骤

1. **确认执行基线与依赖能力**
   - 重核 HEAD/status、PixiJS 实际 lock 版本、`@pixi/sound` v6 peer/API 与浏览器格式支持；用最小实验验证 preload=false、WebAudio decode、legacy backend、unlock、stop/destroy 的真实语义。
   - 固定 audio data/core/editor export allowlist、owner/consumer 矩阵、支持的扩展名/MIME 集合和测试 backend contract；若 upstream 实际能力与本计划的 owner-scoped lifecycle 冲突，先停止报告。
2. **建立 data 层与 audio v1 合同**
   - 实现 BGM 和 `AudioEffectBindingV1` 的 readonly types、strict parser、compiled lookup/cue table、
     local reference/rewrite 与 exact closure；effect 包含 local name、ordered source、`once | loop`、
     `offsetSeconds`、voice policy，以及 `keep`、`duck(targetGain, attack/release)` 或
     `pause(fadeOut/fadeIn)` policy，所有时间/增益均 strict 验证。
   - 增加 data source-boundary/export tests，锁定不 import Pixi、`@pixi/sound`、DOM、editorresource 或 core/editor；所有 normalized 结果 deep readonly。
3. **建立简洁 core runtime**
   - 以窄 media adapter 对接 `@pixi/sound`，实现 resolved source selection、并发 prepare dedupe、
     `playEffect()` / `stopEffect()`、每 route 唯一 manual loop、loop music handoff/线性 gain ramp、
     bounded once effects、channel volume/mute 和 unlock/pending music。
   - 实现 owner-driven cue timeline/generation；触发后保留最小 playback handle，end/error/stop 即时
     移除 active reference；stop 同时取消 delay/prepare late result，并在全部退出路径释放 focus。
   - 实现引用计数 focus arbiter：pause 优先、duck 取最低 gain、最后一个 holder 释放后恢复；mode
     handoff 继承当前 aggregate focus，重叠/停止/失败/destroy 不可提前恢复或永久压低 BGM。
   - 区分 borrowed URL/bytes 和 owned Object URL/Sound/instance，覆盖 prepare rollback、切歌失败、反复 destroy、销毁后调用和多 runtime 隔离；不销毁共享 AudioContext。
4. **建立 editor wrapper 与通用导入**
   - 在 `editorresource` 增加已验证音频扩展名/MIME 映射；audiocore editor adapter 处理 bytes signature/decoder metadata、format profile、mapped resolve/materialize 和结构化 rename。
   - 实现三个 app 共用的 effect draft、field descriptors、校验、controller 和可幂等销毁的
     preview session；宿主只提供 DOM、domain target picker、用户手势和 preview clock，不复制字段或默认值。
5. **升级 domain data schema 与 artifact graph**
   - 将 Popup v7、Symbol v3、Scene Layout v4 作为各自 latest，使用 audiocore data types 定义
     owner-local effects/cues、mode music 和 `programmaticEffects`；为旧版添加唯一确定性升级。
   - 在各 data 层验证 cue target、channel、引用闭包和 programmatic allowlist；同步 assets map rewrite、production ZIP 和 CLI group graph。
   - Popup/Symbol schema 只保存 package-local name，不接受含 Game Layout prefix 的字段；Scene Layout
     根据已导入且已绑定 package 的 binding path 编译全局 route，严格拒绝 segment、route 和 allowlist 冲突。
6. **接入 production runtimes**
   - Scene Layout package resource 编译 global effect route catalog 并拥有唯一 `AudioRuntime`；mode prepare
     只准备 target loop BGM，mode commit 启动有界渐隐/渐现 handoff，rollback/destroy 保留或清理
     正确 instance/ramp。
   - Popup runtime 以 state/segment playback clock 推进 cue；Symbol player 以 state generation/playback clock
     推进 cue。组合时 sink 由 Game Layout 注入并映射 local name→global route；standalone preview
     显式注入 local sink，无 sink 且 manifest 有 cue 时显式失败。
   - `gameframeworks` 只 facade/re-export `playEffect(route)` / `stopEffect(route)` 与 master mute，不复制 audio catalog、route compiler、cue scheduler 或底层 sound state。
7. **接入三个 editor**
   - 三个 editor 复用同一 effect section/校验/preview controller。Game Layout Editor 另增
     `programmaticEffects`、mode BGM selector、nested binding route 预览与冲突诊断；导入、覆盖、
     keep-both/rename 经现有 workspace transaction，结构化重编译 route/allowlist。
   - mode preview 的用户操作触发 unlock，使用同一 Scene Layout runtime 试听初始/切换/无 BGM mode；preview rebuild 与关闭会停止音乐并释放 session。
   - Popup/Symbols Editor 只编辑并试听 package-local effect/target，不显示或持久化全局 prefix；
     快速切 target/重建 preview 不留下旧声音、loop、focus 或 pending cue。
   - Symbols Editor 增加不持久化的单选 audio-preview symbol：画面仍播放全部 symbol 的所选 state，
     audio sink 只接收当前选择；切换选择立即取消上一 symbol 的 pending/active preview。
8. **性能、文档与收尾**
   - 增加 warm benchmark 和 deterministic counters，记录大量 cue advance、effect burst、mode switch、prepare dedupe 的 throughput/allocation/retained owners；wall-clock/heap 只进报告，不做 flaky gate。
   - 按第 8 节执行 L3 验收，在真实浏览器验证 autoplay、mode BGM、Popup/Symbol 延迟、Network 按需加载和销毁后 Memory；更新文档/规则并生成报告。

## 8. 测试与验收

### 测试原则

- data 覆盖合法/非法 schema、local name、focus 数值、channel/reference/closure/rewrite、immutability、
  旧版本升级，以及 local name + binding path 的 route 编译/rename/collision；nested schema 不接受全局 prefix。
- core 用 fake media adapter/clock 覆盖按需 prepare、并发 dedupe、unlock/pending music、BGM loop、
  同曲 no-op、新旧 gain ramp/最大两个 handoff instance、切歌 rollback、cue 跨越/重播/skip/cancel、
  pending/active 幂等 stop、manual loop 去重、voice bound、mute/volume、late completion 和 destroy；
  focus 覆盖 once/loop、pause-over-duck、最低 duck、重叠释放、切 mode、错误与取消。
- editor 覆盖扩展名/MIME/signature/decoder 失配、import review/rename、assets map、三 app 共用字段/默认值、preview unlock、local/global 显示边界、Symbols 单选 audio sink 和 session cleanup；DOM fake 不冒充真实 decoder/autoplay 验收。
- domain parity 覆盖旧 manifest 无声行为、mode prepare/commit/rollback、Popup 各 state/segment、
  Symbol state immediate/boundary/replay、未绑定 nested package 不进游戏、绑定后 route/allowlist，
  以及 CLI/export 的 exact audio closure。
- 性能自动化使用 constructor/decode/active owner/timeline allocation 计数与上限；真实播放延迟、network 行为和 heap 以浏览器 profile 为准。

### 验收级别

`L3`：新增 workspace package 及外部 runtime dependency 会修改 `pnpm-lock.yaml`，同时升级三个
正式 schema、改动跨 package public API、资源图、异步 owner 和多个直接 consumer。

### 执行会话必须运行

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

共 6 条：lockfile/新 workspace package 与三个 schema 的直接依赖面已超过可靠的单 package
边界，按根规则使用 L3；不另加无关 coverage/profiler 命令。失败时先用目标 package
filter 最小化复现，确认是本任务引入后再修复，不立即扩大扫描。

### 人工验收

- 真实 Chrome 与 Safari/iOS 可用环境：无手势时 initial BGM 显示 blocked/pending，第一次合法
  交互后当前 mode BGM 渐现并 loop；不同曲交接旧曲渐隐/新曲渐现而无硬切，同曲
  mode 不重启，无曲 mode 只渐隐，静音/恢复不破坏 loop/transition 状态。
- Game Layout Editor 导入两首 BGM 与含 local `coin` 的 Popup package，以 binding `award` 聚合后
  只有 `award.coin` 可由 `playEffect()` 播放；loop effect 可用同一路由 `stopEffect()` 停止，
  binding rename 后旧 route 失效、新 route 生效，preview 关闭后无声音/网络/对象残留。
- Popup 与 Symbol 各编辑并试听一组 0s/延迟/loop cue，不出现全局 prefix；导出但未在 Game Layout
  绑定时不进游戏。快速切状态、skip、preview rebuild 和 destroy 不播 stale cue。
- Symbols Editor 视觉上仍同时播放全部 symbol，反复切单选下拉框时只有所选 symbol 发声且选择不进导出物。
- effect 分别验证 keep/duck/pause；重叠 once 与 manual loop 结束/显式停止前 BGM 不提前恢复，
  最后 holder 释放后按配置渐回或从保留 position 恢复。
- DevTools Network/Performance/Memory：未配置 BGM 的 splash 不请求 audio payload；明确配置时只在 owner 激活后按需请求且不计入 loading gate；
  重复 mode/effect 不重复 decode 已准备资源，destroy/GC 后无持续增长的 Sound/instance/
  Object URL/timeline/listener。

### 独立验收建议

**必须**。涉及新外部音频 backend、三个正式 schema、跨 package public contract、浏览器 autoplay、
异步 prepare/commit/rollback、active playback 和 destroy。独立复验重点是 data/core/editor boundary、
mode 切歌原子性、cue generation 取消、assets closure 和真实浏览器释放；最多重跑
`pnpm --filter @slotclientengine/audiocore test`、rendercore/editor 直接 consumer typecheck 与一组浏览器验收。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；shell 没有 Node 时通过 nvm 切换到 24。
- 依赖缺失时执行 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库代理并重试原命令。
- 使用 pnpm 添加与 PixiJS 8 兼容的 `@pixi/sound` v6，保持 package manifest 与 lockfile 一致；不手改 lockfile，不切换 npm/yarn。
- 除 `@pixi/sound` 外不预计新增 runtime 依赖；复用现有 browserartifactio、editorresource、Pixi ticker/domain playback clock 和 Vitest。

## 10. 生成物、文档与规则

- 修改 Popup/Symbol/Scene Layout schema 后同步其 parser/normalizer/fixtures/production ZIP/CLI checker；
  YAML 或现有 generated TypeScript 若未受影响不手改。
- 新增 `docs/audio-manifest.md` 说明 audio v1、共享 effect 配置、local name→Game Layout global route、
  mode BGM、programmatic allowlist、loop stop、focus、unlock、按需准备、错误与 lifecycle。
- 更新 audiocore/rendercore/gameframeworks 与三个 editor/CLI README，给出 data/core/editor
  import 边界、子 package→Game Layout 聚合流程、`playEffect()` / `stopEffect()` 和 preview 手势要求。
- 音频 owner、loading 非 gate、mode BGM 和 cue lifecycle 是稳定责任边界，最小更新
  `docs/agent-rules/shared-game-runtime.md`、`editor-artifacts.md`、`scene-layout.md` 和
  `loading-ui.md`；不修改根 `AGENTS.md`，不把具体音频清单/版本锁定/测试数值写进规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/223-audiocore-data-core-editor-runtime-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终 schema/export/owner、实际修改文件、`@pixi/sound` 实测结论、
自动验收结果、真实浏览器听觉/Network/Memory 结果、计划偏差、未完成项和独立验收结论；
不收集无关历史、coverage 矩阵或 release 证据。

## 12. 风险、假设与待确认

### 风险

- `@pixi/sound` 的 WebAudio/legacy 选择与 context 可能带有全局性；若直接暴露 singleton 或调用 global close/removeAll，多 preview/runtime 会相互破坏，必须用 adapter 与多 owner 测试锁定。
- 不进 splash gate 意味着首次精确 cue 可能遇到 network/decode 延迟；必须用 owner exact-closure prepare 和明确 readiness/error 处理，不能在 cue 过时后无条件晚播。
- 浏览器 autoplay 策略、iOS 切后台/恢复与 decoder 支持不能用 happy-dom 证明；必须保留可观测 blocked/pending/error 状态并做真机验收。
- 三个 domain schema 同时升版会影响 parser、normalizer、editor draft、ZIP、CLI 和 runtime；任一 consumer 自行补默认都会分叉，必须使用唯一 latest normalization 和 typed traversal。
- Popup/Symbol 动画可 pause、skip、快速、切状态或 rebuild；使用壁钟 timeout 会产生 stale cue，必须以 owner playback time + generation 测试覆盖。
- BGM prepare 与 Scene Layout mode transaction 若分属两个 coordinator，会出现画面 commit 但音乐 rollback 或反之；音乐必须成为现有 mode transaction 的子资源，渐变也必须受 generation 取消，不新建第二个 mode 状态机。
- effect 可高频重叠；无 voice 上限会使 instance/listener 无界增长，过度单 instance 又会破坏正常重叠听感，v1 必须使用显式的有界策略而不隐式二选一。
- local name 若被 nested editor 提前拼接外部 prefix，会使 binding rename、复用和冲突检测失真；
  global route 只能在 Game Layout typed composition 生成，不能回写或泄漏到 nested manifest。
- duck/pause effect 可重叠、失败或被 stop；focus 引用泄漏会永久压低/暂停 BGM，过早释放则会在庆祝音效中途恢复，必须让每个 active generation 拥有且仅释放一次 token。

### 假设

- Popup v6、Symbol v2、Scene Layout v3 在执行开始时仍是 latest；如果已有新 schema 合并，将 audio 作为下一 latest 版本小幅适配，不并行创造冲突版本。
- 凡配置的 mode BGM 都是 loop，在成功 mode commit 后使用各 binding 的正数 fade 时长做线性渐隐/渐现；两个 mode 引用同一 qualified asset 时音乐保持连续且不重置 loop position。
- Popup cue 绑定现有可见 state/segment，Symbol cue 绑定现有 state playback 的每次进入；每个无限 loop 周期内重复触发和 arbitrary Spine/VNI marker 留待后续明确需求。
- Popup/Symbol effect name 在各 package 内唯一；只有 standalone preview 可在聚合前本地播放，production game 只消费已由 Game Layout 导入、绑定并编译的 route。
- `loop` effect 是 manual loop：动画结束不隐式停止，持有 BGM focus 直到 `stopEffect(route)`、owner rollback 或 destroy；once effect 自然结束时自动释放。
- 多个 BGM focus 同时存在时 pause 优先、duck 取最低 target gain；最后相关 token 释放才恢复，mode 切换不清空 aggregate focus。
- Game Layout Editor 的 mode preview 操作本身是合法用户手势；自动恢复工程不自动播放，等用户首次 preview/play 操作再 unlock。
- 当前 framework `muted` 映射到 master mute；音乐/音效独立数字音量由 core API 支持，但 Leo 等平台的持久化/远程数值传递需求不在本任务暗中扩张。

### 待确认

无。执行时对 upstream backend 做的最小实验只确认已规划的 lifecycle/streaming 边界；
如果它证明 owner isolation、精确 cue 准备或浏览器兼容性无法按本计划实现，应带实验证据
停止说明，不静默替换库、降级同步或扩大范围。

## 13. 完成清单

- [ ] audiocore data/core/editor 三层边界、public exports 和 consumer 分层完成。
- [ ] 每个 mode 的可选 loop BGM（splash 通常为空）、渐隐/渐现、programmatic `playEffect()` / `stopEffect()` 和延迟 cue 落地。
- [ ] 三个 schema、normalizer、reference closure/rewrite、assets map、ZIP 和 CLI group 一致。
- [ ] local→global route 只在 Game Layout 聚合，binding rename/collision、未绑定排除与 allowlist 通过。
- [ ] 按需准备、autoplay unlock、manual loop、voice bound、focus、mode transaction、cue generation、rollback 和 destroy 通过。
- [ ] 三 editor 共用 effect 配置；BGM 仅 Game Layout；Popup/Symbol local preview 与 Symbols 单选 audio preview 通过。
- [ ] 指定 L3 自动验收与真实浏览器听觉/Network/Memory 验收已完成并区分记录。
- [ ] README、audio manifest 文档、领域规则、lockfile 和 UTC 中文执行报告已同步。

## 14. 执行会话交接

执行会话应先重读根 `AGENTS.md`、四份领域规则与本计划，核对 HEAD/status、latest schema 和 `@pixi/sound` 实际能力；再按 data→core→editor→domain schema/runtime→editor/CLI/game facade 实施。需更换 backend、改平台设置合同、修 production assets 或扩大 app 范围时先停止说明。完成后按第 8 节验收并生成报告；除非用户明确要求，不 commit、不 push、不创建 PR。
