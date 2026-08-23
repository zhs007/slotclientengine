# 242 gamelayouteditor-global-event-audio 任务计划

## 1. 目标与完成定义

### 目标

在 `apps/gamelayouteditor` 的“项目”分页提供“编辑音乐音效”入口，复用任务 241 已实现的 EditorCore Game Layout event dialog，为当前 Layout 的全局 runtime event 配置音频播放动作。音频文件必须先经 Game Layout Editor 现有 Assets 入口导入；event dialog 只显式选择已存在的 audio filename-key asset，不提供上传、替换或猜测绑定。

每条配置把一个 exact canonical event 映射为一次 audio 播放，并显式区分 `music` 与 `effect` 两个音量总线。分类只决定玩家独立开关/音量和 duck 目标，不根据业务名猜测排他、切歌或优先级。loop 播放必须配置 exact 结束 event；非 loop 播放可在自身真正播放期间独立降低 BGM，并二选一地降低同文件音效或全部其它音效，结束后精确恢复。

### 完成定义

- [ ] “项目”分页显示“编辑音乐音效”按钮，其旁边显示“忽略旧版音乐音效配置”checkbox；默认不忽略。
- [ ] 按钮打开 EditorCore event dialog，候选只来自当前 editor project 的 RenderCore typed event catalog，不要求先把当前项目导出再作为 `game-layout` asset root 导入。
- [ ] 每个 event row 拥有独立音频配置页：audio asset、`music | effect`、`once | loop`、loop 结束 event，以及 once 的 BGM/同 audio/全部音效影响。row cancel 与 group cancel 不修改 project，group confirm 一次原子提交。
- [ ] 新建 `mode-state` family event row 默认为 `music + loop`；其它 family 默认为 `effect + once`。这些只是初次创建默认，用户修改 category 后不反向覆盖已编辑的 playback。
- [ ] `loop` row 没有结束 event、结束 event 等于启动 event，或任一 event/audio asset 已失效时不能确认或导出。
- [ ] `once` row 的 BGM duck 与 effect duck 可同时开启；effect duck 只能为“同 audio”、“全部音效”或
      “不影响”之一。开启某项时默认降至原音量 50%，可设为 0%–100%，0% 表示暂时静音。
- [ ] duck 只在 owner audio backend instance 真正开始后获取 lease；自然结束、显式 stop、supersede、失败、destroy 都
      恰好释放一次。多个重叠 lease 取最低 target gain，释放一个不得覆盖其它仍活跃影响。
- [ ] loop 结束 event 只停止由该 row 启动的 instance；未启动时收到结束 event 是幂等 no-op，不停其它同文件
      或同 category audio。
- [ ] `ignoreLegacyAudio=false` 时新 event audio 与现有 per-mode BGM、Popup cue、Symbol cue 共同生效；为 `true` 时 runtime 只抑制这三类旧版自动播放，不删除数据、不剪枝 ZIP 资源，也不改变显式 `playEffect()/stopEffect()` 程序命令的现有合同。
- [ ] Scene Layout latest 由 v4 升为 v5；v1–v4 均可读并确定性补齐“不忽略 + 空 event audio”，Editor 新建/
      打开后只预览和导出 canonical v5，CLI 可读取、改写、优化和重验 v1–v5。
- [ ] 旧配置导入与 v5 round-trip、event catalog parity、定向单测、真实浏览器音频解锁/播放验收、文档
      与 UTC 中文执行报告完成。

## 2. 范围

### 包含

- AudioCore 通用 event-track data/core contract：music/effect bus、once/loop voice、BGM duck、same-asset/all-effect duck、
  owner-scoped handle/lease 与 host-clock update。
- RenderCore Scene Layout v5 schema/upgrader、event 到 audio track 的 strict binding、package resource resolve、runtime 内部订阅、
  解锁前 loop intent、legacy-auto-audio gate 与 destroy/rollback。
- EditorCore event dialog 的可复用扩展空间：固定当前 Layout source、generic typed row data/config page、可复用渐进式
  exact event picker、validation/destroy 合同；保持任务 241 无扩展用法兼容。
- Game Layout Editor project draft/commands/UI/preview/import/export/resource-reference 接入，只从当前 Assets 选取 audio。
- Gamelayout package CLI 对 v5 event audio 资源闭包、路径改写、music/effect 优化分类和各源版本支持。
- AudioCore、RenderCore、EditorCore、Gamelayout Editor、CLI 的直接测试、README/reference 与最小领域规则更新。

### 不包含

- 不在 event dialog 上传、替换、播放试听或编码 audio；现有 Assets 导入/替换和 production preview 继续拥有这些边界。
- 不删除、迁移或改写 per-mode BGM、root programmatic effect、Popup/Symbol owner audio cue；忽略选项只是 immutable
  runtime 行为开关。
- 不把 event audio 播放自身增加为新 task-240 lifecycle event family，避免未要求的 action→event 递归图；
  未来若需可观测性应单独设计 stable binding identity 与 cycle contract。
- 不增加业务音频优先级、自动切歌/恢复前一首、按 mode 名猜 BGM、音频波形编辑、混音总线 UI 或
  新的游戏设置面板。
- 不修改 production 美术资源、game002/game003 业务配置或外部 `pixicrave`/`piximinecart2` 仓库。
- 不引入第三方 UI/audio 依赖；Game Layout Editor 只新增对已有 workspace package
  `@slotclientengine/editorcore` 的直接依赖。

## 3. 制定计划时的基线

```text
UTC: 2026-08-23T08:53:22Z
HEAD: 76ca8f9e7854a82992ee243b96b0a713887cef35
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{editor-artifacts,scene-layout,shared-game-runtime}.md`、任务 240/241 计划与执行报告；
  目标目录没有补充 `AGENTS.md`。
- 用户提到的“任务 240 加了 EditorCore dialog”在当前代码中实际分为：任务 240 在 RenderCore 完成 runtime
  events/catalog，任务 241 在 `packages/editorcore/src/assets/ui/game-layout-event-dialog.ts`完成 dialog。任务 242
  同时复用两者，不重建 event 表。
- `mountEditorGameLayoutEventDialog()` 当前只能从 `EditorAssetsController` 中选择 committed `game-layout` root，
  输出只含 `{rootKey, events}`；它有 injected `inspectCatalog`，但 root select 仍从 controller snapshot 派生，也没有
  typed row config slot。
- `apps/gamelayouteditor/src/model/editor-project.ts#EditorProject` 当前保存 v4 `AudioCatalogManifestV1`、per-mode
  `bgm` 与 `programmaticEffects`；`canonicalEditorAudioCatalog()` 只导出被这两类引用的 root audio。
- `apps/gamelayouteditor/src/ui/app-shell.ts#appMarkup()/renderWorkspace()` 已有六个 tab，“项目”面板由
  `projectWorkspaceMarkup()` 重渲染；尚未依赖 EditorCore，也没有 event audio dialog lifecycle owner。
- `packages/audiocore/src/core/runtime.ts#DefaultAudioRuntime` 已有 master/music/effect volume、once/loop effect voice、
  exclusive legacy music request 和 BGM keep/duck/pause；没有 per-instance same-asset/all-effect gain lease，现有 effect gain 会统一
  应用到全部 active effect。
- `packages/rendercore/src/scene-layout/package-runtime.ts#DefaultSceneLayoutPackageRuntime` 已自动播放 mode BGM、
  Popup cue 和 Symbol cue，并在 `createGameLayoutRuntimeAddresses()` 上派发 exact event；初始 mode 当前只提交
  `displayed/stable` 值，不发布首次 entered occurrence。
- Scene Layout current latest 是 v4，`upgradeSceneLayoutManifestToLatest()` 为 v1–v3 补 allocation/audio；Editor 导出 v4。
  CLI 的 `reference-rewriter.ts` 和 `audio-assets.ts` 存在 `version === 4` 分支，v5 不能只靠改 type alias 完成。
- `apps/gamelayouteditor/package.json` 需增加已有 workspace EditorCore 直接依赖并同步 `pnpm-lock.yaml`
  importer；这是本计划升为 L3 的明确触发条件。
- 当前代码、测试、正式规则和任务 240/241 证据足以确认合同；本计划不审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “全局 event”指 task 240/241 catalog 中当前 Layout 真实可订阅的 exact event，不是手输字符串、DOM event
   或服务器 event。启动与 loop 结束都通过同一 typed catalog/picker 选择。
2. “音乐/音效”是播放总线分类。event music 不自动替换其它 music，event effect 不自动拒绝重叠；
   它们分别乘以玩家的 music/effect volume，两者都再受 master mute 影响。
3. “降低 50%”在 schema 中保存为 `targetGain=0.5`，UI 标签使用“降至原音量”避免歧义；输入 0
   表示暂时无声，1 表示不降低。本任务不新增 attack/release UI，event duck 在 backend start/end 边界立即生效/释放。
4. BGM duck 影响除 owner voice 外的所有 music-bus voice，包括 legacy mode BGM 与其它 event music；effect
   duck 只影响除 owner voice 外的 effect-bus voice。“同 audio”按 resolved exact source identity 匹配，不按 row id、route
   或文件名相似度匹配，且对 lease 期间新启动的匹配 voice 同样生效。
5. 同一 start event 在一个 group 中仍只允许一条 row，沿用任务 241 的 duplicate event 合同。同一 audio asset
   可被多个不同 event row 引用。
6. loop event 只维护“应播放”intent。音频未解锁时收到 start/end，runtime 只保留每 row 最新 loop intent；
   解锁后仅启动仍 active 的 loop。未解锁前的 once event 不延迟重放，避免过时音效在用户手势后集中爆发。
7. 为使初始 BaseGame/Splash 的 mode event BGM 可用，runtime 在完整初始 scene 成功 commit 后首次发布
   displayed entered，再发布 stable entered；无 exited、失败 init 不发布。消费者可在 `init()` 前通过 runtime
   address manager 绑定，event audio 内部绑定由 constructor 安装并用上述 loop intent 跨越解锁边界。
8. “忽略旧版配置”不能依靠 Editor 删数据或 CLI 剪资源实现；它是 v5 document 中的显式 false-by-default
   runtime policy。程序 API 调用是宿主命令，不属于 runtime 自动 legacy cue，因此保持现有显式行为。

### 关键决策

1. **Scene Layout v5 拥有 event 绑定，AudioCore 拥有通用 track 播放**
   - v5 在现有 `audio` legacy catalog 之外新增 `eventAudio`，建议 canonical 形状为
     `{version:1, ignoreLegacyAudio:boolean, bindings:[{event, audio, category, playback, endEvent?, focus}]}`。`audio`
     保持原字节，不伪装成 AudioCatalogManifestV2。
   - Scene Layout data strict 校验 canonical address/category/playback/focus 与引用一致性；AudioCore data/core 只看
     generic track/category/source/focus，不导入 Game Layout address 或 mode/popup/symbol 语义。
2. **EditorCore 增加 generic typed extension，不内置音频业务**
   - 保留当前 controller/root-select 模式，增加互斥的 fixed `EditorGameLayoutEventSource`，由 host 提供 stable key/label、
     catalog inspection 和 change subscription；Gamelayout Editor 用当前 draft manifest + exact assets 实现该 source。
   - 抽出可重用 progressive event picker，并为 dialog 增加 generic `EditorGameLayoutEventDialogExtension<TData>`：拥有
     create/clone/mount/validate/destroy，输出 typed row data。不接受未校验 `unknown` blob、innerHTML callback 或 app 私有 address parser。
   - Gamelayout Editor 扩展页使用同一 picker 选 end event，只消费 host 提供的 audio candidates；EditorCore 不依赖
     Gamelayout Editor project/audio schema。
3. **Event audio 使用 runtime-owned subscription 与 owner handle**
   - package runtime 在用户 listener 之前按 manifest row 顺序安装内部 exact subscription；producer 仍先完成画面/状态 commit，
     再 dispatch，音频 async start 失败进入 runtime audio failure 边界，不回滚已提交画面。
   - 每个 row 拥有 pending/active handle 与 duck lease；loop start 幂等，once 沿用有界 voice +
     `restart-oldest` 的 AudioCore policy，保留 coin 类可重叠播放能力且不无界增长。固定 voice policy 作为版本合同
     测试，本任务 UI 不额外暴露未要求的高级并发参数。
4. **Gain 分层而不改写玩家音量**
   - backend instance 最终 gain = master × category volume × voice transition × 所有命中 focus lease 的最小 target。
     duck 不调用 `setMusicVolume()/setEffectVolume()`，因此释放时无需猜测“原音量”或覆盖玩家中途调整。
   - same-asset 基于 package resolve 后的 immutable source identity；all-effect 与 BGM 对未来 voice 动态命中，owner voice
     始终排除。
5. **版本与 consumer 策略沿用现有 latest upgrader**
   - 新建 parser `parseSceneLayoutManifestV5()`；v4→v5 只补空 `eventAudio` 且 `ignoreLegacyAudio=false`，不伪造
     event/BGM。unknown future version 继续显式失败。
   - Runtime 和 Editor 统一规范化到 v5；Editor 一律导出 v5。CLI 保持当前对源版本的读取/改写策略，但所有
     `version===4` capability branch 改为明确 v4/v5 处理，每个支持版本都有 fixture。

## 5. 职责与合同

- **AudioCore data**：通用 event-track/category/focus/voice schema、strict parser 与 asset reference rewrite；不知道 event address。
- **AudioCore core**：准备/instantiate/host-clock update、music/effect bus、per-voice gain、same/all/BGM lease、handle settle 和 destroy。
- **Scene Layout data**：v5 `eventAudio`、exact address 语法、start/end/category/playback/focus 绑定、v1–v5 upgrader 和 asset closure。
- **Scene Layout editor inspector**：从当前 canonical draft + nested exact files 编译唯一 event catalog；编辑失效 row 时仍可
  列出基础 catalog，不用旧 row 反向影响候选。
- **Scene Layout core/runtime**：在 package prepare 阶段解析 audio sources，在初始化前预编译 exact event token/action，在成功 event
  commit 后执行播放/停止，并持有所有 subscription/handle/lease 直到 destroy。
- **EditorCore UI**：拥有可复用 source/picker/dialog row/group transaction 和 extension lifecycle；不持久化 Scene Layout audio 业务。
- **Gamelayout Editor**：拥有 audio row draft、默认值、音频候选、项目交易、UI 文案、preview 重建和 v5 导入/导出。
- **CLI**：只根据 typed v1–v5 manifest 改写/优化/分组并重验 exact closure，不执行 event 或删除 ignored legacy asset。
- **资源生命周期**：package resource 拥有 prepared sound/URL，runtime row 拥有 playback handle/focus lease；destroy 顺序为
  event subscriptions → row handles/leases → AudioRuntime → package resource/Object URL，幂等且不留 stale callback。
- **失败策略**：未知 event/audio/category/playback，loop 缺 end，非 loop 携带 end，loop 携带 focus，非有限/越界 gain，
  same+all 并存，缺 bytes/backend，未来版本和 destroyed owner 全部显式失败；async start 失败不留 lease。
- **禁止行为**：第二份 event 表、raw address 输入、文件名/mode 名猜测、自动选首项、修改 player volume 作为 duck、
  process-global audio manager、无 owner no-op fallback、Editor 删旧数据伪装 ignore 或 CLI 按 ignore 剪枝。

## 6. 文件范围

### 预计新增

```text
packages/audiocore/tests/event-track-runtime.test.ts
packages/rendercore/src/scene-layout/manifest-v5.ts
packages/rendercore/src/scene-layout/core/event-audio-controller.ts
packages/rendercore/tests/scene-layout/{manifest-v5,event-audio-runtime}.test.ts
apps/gamelayouteditor/src/model/event-audio-commands.ts
apps/gamelayouteditor/src/ui/event-audio-dialog.ts
apps/gamelayouteditor/tests/event-audio-dialog.test.ts
tasks/242-gamelayouteditor-global-event-audio-<utctime>.md
```

### 预计修改

```text
packages/audiocore/src/{data,core,editor}/**
packages/audiocore/{README.md,tests/**}
packages/rendercore/src/scene-layout/{types,manifest,manifest-v2,manifest-v3,package-resource,package-runtime}.ts
packages/rendercore/src/scene-layout/{data,core,editor}/**
packages/rendercore/tests/scene-layout/{manifest-v3,package-resource,package-runtime-mode,runtime-address,runtime-event-catalog}.test.ts
packages/rendercore/README.md
packages/editorcore/src/assets/{adapters,ui}/**
packages/editorcore/{README.md,tests/adapters-and-ui.test.ts}
apps/gamelayouteditor/src/model/{editor-project,editor-resource,editor-store,resource-commands,validation}.ts
apps/gamelayouteditor/src/ui/{app-shell,project-workspace,ui-session}.ts
apps/gamelayouteditor/src/{styles.css}
apps/gamelayouteditor/tests/{app-shell,audio-assets,editor-store,source-boundary,zip-io}.test.ts
apps/gamelayouteditor/{README.md,package.json}
apps/gamelayoutpkgcli/src/{audio-assets,asset-groups,package-reader,reference-rewriter}.ts
apps/gamelayoutpkgcli/tests/{audio-optimizer,asset-groups,package-flow,reference-rewriter}.test.ts
apps/gamelayoutpkgcli/README.md
docs/gamelayout-runtime-addresses.md
docs/agent-rules/{editor-artifacts,scene-layout,shared-game-runtime}.md
pnpm-lock.yaml
```

### 原则上不应修改

```text
apps/{game002v2,game003v2,imgnumbereditor,popupeditor,symbolseditor,editordemo}/**
assets/**
packages/{logiccore,netcore,uiframeworks,vnicore}/**
packages/rendercore/src/{popup,symbol,reel}/**
{AGENTS.md,pnpm-workspace.yaml}
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

`packages/gameframeworks` 作为 Scene Layout public type/API 直接 consumer 参与验收，原则上只需重新编译；若 latest v5
类型更改必须调整 re-export 才能编译，允许最小修改并在执行报告说明。若需修改业务 game app、production asset、
server 合同、event address 格式、Popup/Symbol owner manifest 或引入第三方依赖，必须先停止并说明扩大原因。

## 7. 实施步骤

1. **确认执行基线与行为矩阵**
   - 重核 HEAD/status、本计划三份领域规则、task 240 catalog/dispatch 顺序、task 241 dialog transaction、现有三类
     legacy auto audio 与 v4/CLI 版本分支。
   - 先用中性 fixture 固定 start/end、category/playback、focus 组合、pre-unlock intent、legacy-ignore 和 initial mode event
     顺序，不使用 Crave/Minecart2 业务名。
2. **扩展 AudioCore generic track 与 gain lease**
   - 增加 strict event-track binding/focus 类型与 parser，复用 AudioAsset/source/voice primitives；保持旧 AudioCatalogV1 parser 不变。
   - 在 AudioRuntime 增加按 category 播放的 owner handle，把 effect/music backend voice 统一为可分层计算 gain 的 internal voice；
     legacy requestMusic/crossfade 仍使用同一 music volume/focus 结果。
   - 实现 BGM/same-asset/all-effect lease 索引、owner 排除、minimum gain 合并、新 voice 动态命中与全部 settle/destroy
     释放边界；保持 master/category volume 中途修改可立即叠加。
3. **建立 Scene Layout v5 event-audio data contract**
   - 新增 V5/latest 类型、parser 与 v4→v5 upgrader，更新 document/initial parser 版本路由、modern union、data exports、allocation
     compatibility 与 unknown version failure。
   - strict 编译 `eventAudio.bindings`：验证 start/end 属于当前 catalog、audio source 属于 exact closure、唯一 start
     event 及 playback/focus 互斥条件；Editor inspector 提供可忽略已失效 binding 的 catalog-only 路径供修复 UI 使用。
   - 扩展 asset path collect/rewrite/package resolve，为每个 row 生成 immutable resolved track/source identity；ignore flag 不影响
     closure 或 resource prepare。
4. **接入 RenderCore event runtime 与 legacy gate**
   - 新建 package-owned event audio controller，在现有唯一 manager 上预绑定 exact token；实现 once play、loop intent/start/end、
     unlock sync、row-owned stop 和 async failure/destroy cleanup。
   - 初始 scene 完整 commit 后发布 initial displayed/stable entered，用于常规 listener 和 event audio；保持转场时旧
     exited→新 entered 与 transition switched/ended 顺序。
   - 在 `syncStableModeMusic()`、Popup cue 和 Symbol cue 三个唯一 producer 处应用 ignore flag；programmatic endpoint/API、
     catalog/address 与 audio bytes 保持。测试 false 时新旧共存、true 时只关闭 legacy auto producer。
5. **为 EditorCore dialog 提供 typed extension**
   - 把渐进式 family/facet 选择抽为可 mount/destroy picker，dialog 与 audio extension 共用；保持 exact descriptor、
     Symbol wildcard scope、search、breadcrumb 和 no-first-default 行为。
   - 增加 controller source/fixed source discriminated options，以及 generic row data extension 的 create/clone/mount/validate/destroy；row save 前验证
     event + extension data，group confirm 在最新 catalog 上全组复验。
   - 覆盖 source revision 快速变更、扩展页异步/stale commit、row/group cancel、focus return、close 与幂等 destroy；任务 241
     Editordemo-style 普通 group 用法和输出保持。
6. **接入 Game Layout Editor project 与 UI**
   - 在 `EditorProject` 增加 canonical event-audio draft，更新 create/clone/import/export/change classification/validation；旧 manifest 打开后
     立即扩展为 v5 draft，导出只写 v5。
   - 增加 commands 原子提交 group 与 ignore flag，将 event-audio asset 加入 `getLayoutResourceReferences()`、删除阻断、
     unused/closure 派生和 replace preservation。
   - 在 Project tab 挂载按钮/checkbox；AppShell 在 panel 重渲染前 destroy 旧 dialog extension/source subscription，重渲染后按
     当前 project revision 挂载，App destroy 再统一释放，不留重复 trigger。
   - audio config page 只列 `resource.kind==="audio"` 的 exact asset 且默认不选首项；实现 family defaults、category/
     playback 手动修改、loop end picker、once focus controls 与隐藏字段清理。
   - 让 production preview 重建后消费 v5 runtime；解锁前 once 不重放，loop 按 intent 同步。不在 Editor UI 复制播放器。
7. **更新 CLI、consumer、文档与收尾**
   - CLI 收集/重写 event audio source，按 category 选 AAC 优化 profile，同 asset 同时被 music/effect 引用时沿用已有
     music-priority 规则；ignore=true 仍保留 legacy sources。
   - 补 v1–v5 reader/rewrite/optimized ZIP/asset-group fixtures，重新编译 Gameframeworks 与其它 latest-type consumer，只修正直接的
     v5 exhaustive/version branch。
   - 用 pnpm 同步 Gamelayout Editor 的 EditorCore workspace dependency 与 lockfile importer，更新 README/reference/三份领域
     规则，执行 L3 验收并生成 UTC 中文报告。

## 8. 测试与验收

### 测试原则

- AudioCore 用 deterministic fake backend 验证 music/effect/master 乘法、owner 排除、same source 与名字不同、all-effect 动态
  命中、重叠 lease 最低值、玩家中途调音量，以及 ended/stopped/failed/destroyed 精确恢复。
- RenderCore 覆盖 v1–v4 空升级、v5 strict 正常/非法组合、catalog-only repair inspection、start/end 实例所有权、
  initial entered 顺序、unlock 前 loop start/end、once drop、false/true legacy matrix、async failure 和 destroy。
- EditorCore 测试既覆盖旧 controller/plain-group API，也覆盖 fixed source + typed extension；不用音频业务硬编码来证明
  generic contract。picker 测试复用真实 RenderCore catalog 的至少一条集成路径。
- Gamelayout Editor DOM/model/ZIP 测试覆盖无 audio asset、显式 asset 选择、mode/non-mode defaults、用户修改不被
  重置、loop/end 阻断、focus 互斥/gain 边界、cancel/confirm、asset 删除阻断、项目替换与失效 address 修复。
- CLI 对 v1–v5 各至少一个完整包，验证 event audio logical key/mediaType 改写、music/effect 优化角色、
  exact closure 与 ignore 不剪枝。不把实际 ffmpeg 机器时间当正确性阈值。
- 保留任务 223/227/240/241 旧 AudioRuntime、BGM/programmatic effect、runtime event hot path、dialog transaction 回归；
  不为过时 fixture 保留 v4 latest 假设。

### 验收级别

`L3`：任务修改 AudioCore→RenderCore→EditorCore/Gamelayout Editor/CLI 跨包 public contract、Scene Layout latest schema、正式
ZIP 与 async audio resource lifecycle；同时 Gamelayout Editor 新增 EditorCore 直接依赖并同步 lockfile。根规则将 lockfile
修改列为 L3 明确触发条件，因此需整仓验收；失败时先缩小到上述五个直接 package，不顺手修无关问题。

### 执行会话必须运行

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

执行中先用定向 Vitest 快速定位，但它们不替代上述 L3 命令。若根命令受已有无关改动或环境故障影响，报告必须
列出最小复现、是否由本任务引入及已通过的直接链证据，不得改称整仓已通过。

### 人工验收

1. 在真实浏览器中先通过 Assets 导入一个真实 audio，打开 Project tab 的音乐音效 dialog；确认无上传
   控件、未自动选首项，start/end 候选与当前 Layout 的 node/mode/Symbol/Popup 内容一致。
2. 新建 mode-state 与非 mode event row，确认默认分别为 music+loop 和 effect+once；修改 category/playback 后
   开关分页、取消 row/dialog、关闭重开和 project 重渲染都不丢失或半提交。
3. 给 loop 选 exact end event，解锁 Preview 声音后触发 start/end，确认只停止该 row；在解锁前触发一次
   start/end 再解锁，确认 loop intent 正确且无 once 补播。初始 mode entered 绑定能在解锁后播放 loop BGM。
4. 用可分辨的多个真实 audio 先播放 BGM/同文件音效/其它音效，再触发 once row；分别验证 BGM 50%、
   same 0%、all 50%、BGM+same 同时开启和自然/stop 恢复，触发音频本身不被自己 duck。
5. 在 false/true 之间分别重建 Preview，验证 mode BGM、Popup cue、Symbol cue 的共存/抑制，event audio 两种
   情况都生效；导出并重开 ZIP 后旧配置/bytes、ignore flag 和 event rows 无损。
6. 用 CLI 处理 v4 和 v5 各一份实际 ZIP，确认输出可重开，event music/effect 使用正确编码 profile，
   ignore=true 未删除任何 legacy audio payload。

### 独立验收建议

`必须`：涉及跨包 public contract、Scene Layout latest schema/ZIP、异步 backend instance/duck lease/destroy 和 task-240 event 顺序。
独立复验重点为 v1–v5 兼容、gain 叠加/释放、event row ownership 和 ignore matrix，最多运行：

```bash
pnpm --filter @slotclientengine/audiocore exec vitest run tests/event-track-runtime.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-v5.test.ts tests/scene-layout/event-audio-runtime.test.ts
pnpm --filter gamelayouteditor --filter gamelayoutpkgcli test
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试。
- 使用 pnpm 将 `@slotclientengine/editorcore: workspace:*` 加入 Gamelayout Editor direct dependencies，只更新对应 lockfile
  importer；不升级 pnpm、Pixi、Audio 后端或其它依赖。
- 若 lockfile 出现与该 importer 无关的 version/resolution 漂移，停止并查因，不接受顺带更新。

## 10. 生成物、文档与规则

- 本任务不修改 YAML 或 production asset；`dist`/coverage/cache 由命令生成但不手改、不作为 source 提交。
- 更新 AudioCore/RenderCore README，记录 category/gain/lease 和 v5 runtime；更新 EditorCore README，记录 fixed source/
  typed extension/picker lifecycle；更新 Gamelayout Editor/CLI README，记录 UI、版本和优化流程。
- `docs/gamelayout-runtime-addresses.md` 补充 initial mode entered 顺序和“event audio 消费既有 event，但暂不反向生成新
  lifecycle event”边界。
- 最小更新 `scene-layout.md` 的 latest v5/event audio/legacy gate、`shared-game-runtime.md` 的 AudioCore focus lease 和
  `editor-artifacts.md` 的 Gamelayout Editor→EditorCore fixed-source extension/只选现有 asset 稳定边界。
- 不把精确 row 数据、默认数值、测试证据或任务结论追加到根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/242-gamelayouteditor-global-event-audio-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 v5/audio/dialog API、实际修改文件、计划偏差、lockfile
importer、自动/L3/真实浏览器/独立验收结果、未完成人工验收与剩余风险；不收集无关 coverage、历史矩阵
或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 初始 mode 现在不发 entered；若只绑转场 event，忽略 legacy BGM 后初始音乐无法起播。本计划因此将“成功
  init 的首次 entered”纳入 public event 顺序，它必须有单独回归和文档证据。
- event catalog 依赖 nested Symbols/Popup bytes，而当前 project 可因旧 row 失效而处于 validation error。catalog-only inspection
  必须将“编译候选”与“验证已保存 action”分层，否则用户无法打开 dialog 修复。
- same-asset/all-effect duck 若通过直接改全局 effectVolume 实现，会覆盖玩家设置并在重叠播放后错误恢复；
  必须使用独立 per-voice lease 并覆盖中途 player-volume change。
- 忽略开关横跨 mode/Popup/Symbol 三个自动 producer；只 gate 其中一个会形成半忽略，而按 ignore 剪资源又违反
  “数据不特殊处理”要求。
- latest v5 会影响所有 exhaustive version checks、fixture 和 CLI rewrite branch；只让 Editor 写 v5 而 runtime/CLI 未同步会产生
  只能导出、不能消费的包。
- Project panel 现在每次 transaction 重写 DOM；若不在重渲染前销毁 EditorCore dialog/source/extension，会泄漏
  controller subscription、stale catalog request 或重复按钮事件。

### 假设

- “gamemode 的 event”指 task 241 catalog 的 exact `mode-state` family；`transition-lifecycle`、`mode-bgm` 和
  `audio-music` 不作为该默认判断的 alias，用户仍可手动把它们设为 music。
- “同 audio”指 exact resolved source asset，不是相同 event row、binding name、route 或二进制 hash猜测；相同 filename-key
  asset 被多 row 引用时属于同 audio。
- 非 loop 才提供三类 duck；切换到 loop 时清除 focus，切换到 once 时清除 end event，不在导出中保留
  不可见 stale 字段。
- 现有 Assets 导入的 audio resource 已有 strict media type/bytes；event dialog 不建立第二份 asset catalog。

### 待确认

无。
