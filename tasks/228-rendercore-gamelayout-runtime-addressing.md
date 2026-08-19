# 228 rendercore-gamelayout-runtime-addressing 任务计划

## 1. 目标与完成定义

### 目标

为 `packages/rendercore` 的 Game Layout production runtime 建立一套 owner-first、严格、可枚举的
runtime address 合同。第一优先级是定位编辑者已经在 Scene Layout、Popup 与音频配置中明确创建、
命名和绑定的对象；程序创建的 runtime resource factory 属于第二层能力。

统一地址前缀为 `gamelayout:/`。游戏通过一个 address resolver 定位 mode、transition、transition
effect event、popup、popup layer/string、scene node、render layer、reel、symbol-package binding、BGM、
audio effect 和 runtime resource，再按 endpoint kind 取得受限能力。地址不能退化为任意 manifest JSON
读取、filename/path 猜测或 raw Pixi display tree 访问。

Crave 的直接目标用例是精确定位 Gamelayout 已配置的两条 Spine transition 的 `Start`：

```text
gamelayout:/transition/BaseGame/FreeGame/effect/spine/event/Start
gamelayout:/transition/FreeGame/BaseGame/effect/spine/event/Start
```

### 完成定义

- [ ] canonical address formatter/parser 对 exact case、segment encoding、owner 层级和 endpoint kind
      提供单一合同；非法、未知、kind mismatch、inactive 或 destroyed target 显式失败。
- [ ] 同一份 immutable address catalog 从 canonical Scene Layout v4 与已解析的 nested Popup/audio
      owner metadata 编译；production runtime 和 Game Layout Editor 不维护第二份地址表。
- [ ] `SceneLayoutPackageRuntime` 公开单一 `addresses` resolver，可 `list/describe/resolve/bind/wait`；
      `resolve(address, expectedKind)` 返回严格 discriminated endpoint，不返回 `unknown` 或 raw config。
- [ ] authored mode、transition、transition effect、popup、popup layer/string、scene node、render layer、
      reel、symbol-package binding、BGM、audio effect 均有稳定地址和 typed descriptor。
- [ ] authored scene node/popup layer/render layer 只返回 opaque borrowed capability；inactive、replacement、
      popup complete、mode change 或 destroy 后不会保留可操作的 stale display object。
- [ ] runtime resource 使用 `gamelayout:/resource/<kind>/<key>` 定位并创建 caller-owned
      RenderObject/ImgNumber；不与 authored node、popup layer 或同名资源互相 fallback。
- [ ] transition Spine event 复用 package runtime 已 drain 的 configured `switchEvent` occurrence；
      内部 scene switch 原子提交后在同一 update 派发程序事件，不安装第二套 Spine listener。
- [ ] video transition、Popup 与 BGM 使用同一 event endpoint/lifecycle 机制；BGM `started/stopped`
      精确反映底层 loop instance start 与 fade-out 后 stop，同曲 mode 切换不重复发事件。
- [ ] Popup 临时 text/ImgNumber 输入可以用 canonical address 提交，并继续保持一次 transition request
      的 apply/restore transaction；不存在、kind 错误、非当前 prelude popup 或失败恢复都显式处理。
- [ ] Game Layout Editor 对选中的 authored object 显示/copy runtime address；未绑定 audio 显示无地址，
      每个 exported BGM/effect 显示 exact binding/route；地址不可手输且不写入 manifest。
- [ ] 现有 `getRenderObject/createRenderObject/createImgNumberRenderObject/playEffect/preludePopupStrings`
      保持行为兼容并委托同一 compiled catalog/owner；仓库游戏和 Crave 外部代码不在本任务修改。
- [ ] 新增通用使用文档和 Crave 手工接入文档，覆盖查找 RenderObject、创建 RenderObject、播放音效、
      transition `Start`、BGM lifecycle、Popup layer/string 与 ownership/cleanup。

## 2. 范围

### 包含

- Scene Layout data 层的 canonical address value、parser/formatter、descriptor 与纯 catalog key 合同。
- Scene Layout core 的 compiled address catalog、resolver、typed endpoint、event dispatcher、waiter、
  active owner bridge、destroy cleanup 与 compatibility delegate。
- 当前 Gamelayout authored hierarchy 的地址覆盖：
  - `mode/<mode-id>`、`mode/<mode-id>/bgm`；
  - `transition/<from>/<to>`、`effect/<none|spine|video>`；
  - Spine configured event 与 video lifecycle；
  - `popup/<binding-id>`、exact logical layer、exact named text/image-string、popup lifecycle；
  - scene node 与 node `before/child/after` layer；
  - stable `layout/reel/transition/popup` layer、reel 与 `bottom/top/win` area layer；
  - symbol-package binding；
  - root audio music/effect route及 mode BGM binding；
  - typed runtime resource factory。
- Popup core 为 active logical layer/string 提供必要的 opaque borrowed lookup，不公开 Container/player。
- Audiocore core 提供 owner-scoped music lifecycle source；Scene Layout 负责把它映射到 Gamelayout address。
- Gameframeworks 只 re-export production address contract，不复制 resolver。
- Game Layout Editor 使用同一 catalog 显示/copy 地址，并在 preview 中验证关键 event/address。
- package/tests/docs/领域规则与执行报告。

### 不包含

- 不修改 `apps/game002v2`、`apps/game003v2`、其它游戏 app 或外部 Crave 项目；用户依据文档手动接入。
- 不新增 Scene Layout manifest version、`runtimeEvents`/alias 表、地址字段或第二份资源/event 表。
- 不把 Spine JSON 中所有未被 owner 合同选择的 raw event 自动提升为 Gamelayout public event；首期
  transition Spine event 只发布 Gamelayout 已配置并验证为 exact single occurrence 的 `switchEvent`。
- 不让程序通过地址任意修改 mode、transition、placement、order、attachment、audio binding 或 manifest。
- 不提供 JSON Pointer、wildcard/glob、相对地址、索引 fallback、basename、physical path/hash 地址。
- 不开放 raw Pixi Container、Spine/VNI player、audio backend instance、DOM media event 或 mutable manifest。
- 不编辑 Popup/Symbol owner-owned 内部配置；不为 Symbol 内部 state/layer 建立跨 owner 深层地址协议。
- 不修改 production assets、YAML、生成资源表、lockfile、workspace 工具链或新增依赖。

## 3. 制定计划时的基线

```text
UTC: 2026-08-19T05:11:56Z
HEAD: 1a905d5a04f0912aadf889328423d988405e0fd5
branch: detached HEAD
git status --short --untracked-files=all: ?? tasks/228-rendercore-gamelayout-runtime-addressing.md
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts,game002,loading-ui}.md`；目标目录没有
  补充 `AGENTS.md`。
- task 222/223 已建立 Scene Layout 与 Audiocore 的 `data → core → editor` 分层；task 226 已统一
  RenderObject/RenderObjectLayer/Anchor；task 227 已把 audio 变成 Gamelayout Editor 一等 filename-key asset。
- task 227 明确 audio asset 导入后不自动获得 runtime identity：只有 exact mode BGM binding 或 strict
  programmatic effect name 进入 canonical v4/production closure；audio 不能伪装成通用 runtime resource。
- 当前 package runtime 已分别公开 `getRenderObject(nodeId)`、`getRenderLayer(ref)`、
  `createRenderObject(name)`、`createImgNumberRenderObject(name, options)`、`playEffect(route)` 与
  `requestGameMode(..., { preludePopupStrings })`，但没有统一 address grammar/catalog/resolver。
- 当前 render layer 另有 `layout|reel|transition|popup`、`node:<id>:<placement>` 与
  `<area>.<bottom|top|win>` string ref；它只定位 layer，不能表达其它 authored owner，且 legacy/canonical
  语法不应直接扩张为全局地址协议。
- `package-runtime.ts#updateActiveTransition()` 已从唯一 official Spine player update result drain event，
  匹配 configured `switchEvent`、拒绝重复/缺失并在该点调用 `commitActiveTransition()`。
- `validateOfficialSpineResource()` 已要求 transition animation 的 configured `switchEvent` 恰好出现一次。
- `AudioRuntime` 已有 effect `AudioPlaybackHandle.finished/state` 和 loop BGM crossfade，但未公开 music
  started/stopped lifecycle subscription；Scene Layout 以 mode commit 后的 `requestMusic()` 驱动 BGM。
- Popup core 已有 stable text/image-string handle；layer runtime 与 Container 仍是内部实现，尚无安全的
  exact logical layer borrowed capability。
- Crave `assets/crave/layout.manifest.json` 的 `BaseGame→FreeGame` 和 `FreeGame→BaseGame` 均为 Spine
  transition，animation 分别为 `BG_FG`/`FG_BG`，configured `switchEvent` 均为 `Start`；`bg.json`
  中两动画各有唯一 `Start`，time 为 `1s`。该事实只作为规划证据，不进入 shared package fixture。
- 仓库不存在 `gamelayout:/`、address catalog 或等价通用 resolver。

## 4. 需求解释与技术决策

### 需求解释

1. “第一优先处理编辑者编辑好的东西”表示地址 identity 先来自 manifest 与 nested owner 的 stable id；
   runtime 当前是否实例化只影响 capability availability，不影响地址能否 list/describe。
2. “非常深的层级”通过 owner-first path 精确定位 nested entity，而不是公开任意 object property。
3. “通用接口”是一个 `runtime.addresses` resolver 和一套 endpoint kind；不是把不同操作压成
   `any invoke(string, any)`。
4. transition `Start` 的 owner 是 `from→to` edge 下的 effect。edge 已唯一拥有 kind、resource、animation
   与 configured `switchEvent`，所以 public 地址不重复 filename、animation 或 occurrence index。
5. BGM 是 mode-owned loop music。runtime 地址使用 exported music name 与 `mode/<id>/bgm` binding，
   program effect 使用 exported strict route；未绑定的 editor audio asset 没有 runtime 地址，且 mode
   endpoint 不允许绕过 mode 状态机直接换曲。
6. Popup/layer 地址持久存在；只有 active popup 的 layer/string 才有 mutable borrowed capability。

### Canonical address 决策

```text
gamelayout:/layer/layout
gamelayout:/node/basegame-background
gamelayout:/node/basegame-background/layer/child
gamelayout:/reel/main/layer/win
gamelayout:/mode/BaseGame
gamelayout:/mode/BaseGame/bgm
gamelayout:/transition/BaseGame/FreeGame
gamelayout:/transition/BaseGame/FreeGame/effect/spine/event/Start
gamelayout:/transition/BaseGame/FreeGame/effect/video/lifecycle/started
gamelayout:/popup/fg
gamelayout:/popup/fg/layer/<exact-layer-id>
gamelayout:/popup/fg/string/image-string/imgnumber-0
gamelayout:/audio/music/<exact-music-name>
gamelayout:/audio/effect/award.coin
gamelayout:/resource/spine/Nearwin1
```

- scheme、domain 和结构 segment 固定小写；manifest identity/event/name 保持 exact case。
- 每个动态 segment 使用唯一 canonical percent-encoding；`.` 只是 segment 内容，不是层级分隔符。
- 禁止 query、fragment、空 segment、`.`/`..`、non-canonical encoding、relative ref 和 trailing slash。
- popup string 只接受 exact name，不把现有 zero-based inspector index 纳入稳定地址。
- award popup 同 exact layer id 跨 tier 表示一个 logical layer endpoint；descriptor 列出 presence/variant，
  active capability只作用于当前 runtime tier，不按首个 tier fallback。

### Runtime API 决策

`SceneLayoutPackageRuntime` 新增 readonly `addresses: GameLayoutRuntimeAddresses`；该 resolver 只公开
`list(options?)`、`describe(address)`、`resolve(address, expectedKind)`、`bind(address, listener)` 和
支持 `AbortSignal` 的 `wait(address, options?)`。

- descriptor 是 frozen authored metadata/owner/capability/lifetime summary，不返回整个 manifest。
- endpoint 使用 discriminated union；render-object、render-layer、popup-layer、string、audio-effect、
  runtime-resource-factory、event 等 kind 各自只公开合法动作。
- `resolve()` 同步验证 catalog identity/kind；异步资源 prepare 发生在 factory endpoint 的 `create()`。
- audio effect endpoint 只有 route 位于现有 `programmaticEffects` allowlist 时才拥有 `play/stop`；
  cue-only route 可 list/describe，但尝试以 playable kind resolve 时失败。
- BGM/music endpoint只提供描述、当前状态和 lifecycle event，不提供绕过 mode owner 的 `play()`。

### Event 决策

1. transition Spine configured event 只从已有 update result 派发：recognize → validate single occurrence →
   commit scene/mode switch → enqueue public event → 同一 `update()` drain listener/waiter → 继续 transition。
2. `bind()` listener 是同步 `void` 合同；返回 thenable 显式失败。需要异步编排时程序先调用 `wait()`，
   再并行启动/等待 `requestGameMode()`，不让 renderer 在 ticker 内 await 任意游戏 Promise。
3. listener/waiter 按注册顺序、事件 sequence FIFO；不 replay 历史。dispatch 中新增 listener 从下一事件生效。
4. callback error 在 event boundary 完成后作为 program error 显式 fail-stop 当前调用链，不回滚已提交 scene；
   不能被吞掉或变成 diagnostic-only warning。
5. BGM `started` 在 backend loop instance 成功创建并被 runtime 接管时产生；`stopped` 在 fade-out 到零且
   instance stop 后产生。相同 music 复用不产生伪 start/stop，mute/pause/duck 不冒充 stopped。
6. runtime destroy 取消 waiter、清空 listener、停止后续 dispatch；destroy 本身不向已经拆除的订阅补发事件。

## 5. 职责与合同

- **Scene Layout data**：地址字符串语法、canonical formatter/parser、descriptor/endpoint kind 的纯类型；
  不依赖 Pixi、runtime instance、Popup core、Audiocore core 或 Editor。
- **Scene Layout core**：从 canonical layout、resolved Popup package/audio routes 编译唯一 catalog；拥有
  resolver、active endpoint bridge、event queue、waiter 和 destroy。
- **Popup core**：继续拥有 popup/layer/player/container；只向 Scene Layout core 提供 exact id 的 opaque
  borrowed layer/string capability，不交出 placement、tier/segment 状态机或 destroy ownership。
- **Audiocore core**：拥有 backend voice/music lifecycle，公开 instance-scoped typed lifecycle observer；
  Scene Layout 决定 Gamelayout address 与 mode binding，不让 Audiocore理解 mode/popup/transition。
- **Game Layout Editor**：使用 shared catalog 显示/copy 派生地址；不保存地址、不复制 parser/formatter。
- **Gameframeworks/game app**：从 facade 使用 production endpoint；app 不解析 manifest、Popup package 或
  physical asset path 来重建地址。
- **资源生命周期**：authored endpoint/descriptor由 package runtime拥有；borrowed active capability 不可
  destroy；factory output由caller destroy；subscription dispose幂等；runtime destroy逆序清理。
- **失败策略**：unknown address/kind/owner、inactive capability、stale handle、未 allowlist action、invalid text、
  callback failure、resource prepare failure、destroy 后调用全部显式失败，不 fallback。
- **禁止行为**：不建立 process-global registry、不缓存 raw Container/player、不扫描 filename、不把 catalog
  序列化进 manifest、不让 address action 绕过 mode/Popup/audio owner 状态机。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/{data/runtime-address,core/runtime-address,core/runtime-event-dispatcher}.ts
packages/rendercore/tests/scene-layout/runtime-address.test.ts
apps/gamelayouteditor/{src/ui/runtime-address-inspector.ts,tests/runtime-address-inspector.test.ts}
docs/{gamelayout-runtime-addresses,crave-task228-gamelayout-runtime-address-migration}.md
tasks/228-rendercore-gamelayout-runtime-addressing-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/{{data,core}/index,{types,package-resource,package-runtime,presentation-surface}.ts}
packages/rendercore/src/popup/core/{types,award-player,spine-player}.ts
packages/audiocore/src/core/{runtime,backend}.ts
packages/{rendercore,audiocore}/tests/**
packages/{rendercore,audiocore,gameframeworks}/README.md
packages/gameframeworks/src/index.ts
apps/gamelayouteditor/{src/{model,preview,ui},tests}/**
docs/{scene-layout-manifest,rendercore-game-runtime-composition-api}.md
docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md
```

### 原则上不应修改

```text
apps/{game002v2,game003v2,gameviewer,gameviewer2}/**
packages/{logiccore,uiframeworks,vnicore}/**
packages/rendercore/src/{symbol,reel}/**
assets/**
{package.json,pnpm-workspace.yaml,pnpm-lock.yaml,AGENTS.md}
```

执行时若需要新增 manifest 字段/version、修改 Popup/Symbol schema、暴露 raw display/audio object、修改游戏
consumer、生产资源或根工具链，必须先停止说明范围扩张，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认基线与地址覆盖矩阵**
   - 重核 HEAD/status、Scene Layout v4、Popup latest、audio catalog、core exports 与 consumer。
   - 用最小 fixtures 固定每类 authored identity、nested owner、capability 与生命周期，不读取游戏 assets。
2. **建立 data address 合同**
   - 实现 canonical parser/formatter、segment codec、kind/descriptor/types 和非法输入测试。
   - 固定 owner-first 地址矩阵；证明地址完全由 typed manifest identity 派生且不进入 manifest closure。
3. **编译 core catalog 与 endpoint resolver**
   - package resource prepare 后一次编译 immutable catalog；runtime 持有 stable resolver。
   - 接入 node/layer/reel/symbol-binding/mode/transition/popup/audio/runtime-resource endpoint；兼容 API 委托同一 owner。
4. **接入 active Popup 与字符串 transaction**
   - Popup core 增加 exact logical layer/string 的 opaque lookup和active/stale断言。
   - 新 runtime address input 复用 prelude Popup apply/restore transaction；失败和 destroy 覆盖恢复。
5. **接入 event 与音频 lifecycle**
   - transition Spine configured `switchEvent` 从现有 drain 点派发；video 使用受限 lifecycle，不透传 DOM event。
   - Audiocore 暴露 typed music instance start/stop observer；Scene Layout 映射 music与mode BGM地址。
   - 实现 bind/wait/FIFO/error/abort/destroy 测试，证明没有第二 listener 和重复事件。
6. **接入 Editor 与 facade**
   - Game Layout Editor 在 mode/transition/node/layer/reel/popup/audio/runtime-resource workspace显示/copy地址。
   - preview 使用同一 catalog 验证 Crave 等价 fixture 的 transition Start、Popup string 与 BGM lifecycle。
   - gameframeworks 只 re-export production types，不复制实现。
7. **文档、规则与收尾**
   - 写通用 reference、ownership/lifecycle/error 表和完整示例；写 Crave 手工迁移步骤但不改其代码。
   - 更新最小领域规则，运行 L2 验收，检查 diff 并生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- shared package fixture 自包含，不读取 `assets/crave` 或其它正式美术；Crave 只用于文档人工核对。
- 覆盖 canonical round-trip、exact case/encoding、unknown/kind mismatch、inactive/stale/destroy 和 no fallback。
- catalog 测试核对 authored manifest/nested Popup/audio identity 与 descriptor/capability 一一对应。
- transition 测试证明 `Start` 所在 update 先 commit target scene、后派发一次，缺失/重复仍沿用现有失败。
- video、Popup、music lifecycle 覆盖正常、cancel/failure、same-BGM reuse、fade stop、abort/destroy。
- ownership 测试区分 borrowed authored object 与 caller-owned factory output。

### 验收级别

`L2`。原因是新增 RenderCore/Gameframeworks public contract、修改 Audiocore lifecycle API，并接入
Game Layout Editor 直接 consumer；不涉及 schema、lockfile、根工具链、production asset 或 release。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/audiocore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gamelayouteditor typecheck
pnpm --filter @slotclientengine/audiocore exec vitest run tests/audio-runtime.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address.test.ts tests/scene-layout/package-runtime-mode.test.ts tests/scene-layout/package-runtime-video.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/runtime-address-inspector.test.ts tests/transitions-workspace.test.ts tests/popup-package.test.ts tests/audio-assets.test.ts tests/layout-preview.test.ts
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks build
git diff --check
```

### 人工验收

- Game Layout Editor 逐类选择 mode、transition、node/layer、reel、popup/layer/string、BGM/effect、runtime
  resource，确认地址与 exported identity 一致；未绑定 audio 明确显示无 runtime address，ZIP重导不变化。
- 按 Crave 文档在真实 package 中观察两条 transition 的 `Start`：callback 只触发一次，看到 target
  displayed scene，转场继续并最终 settle。
- 在目标浏览器真实解锁音频后切换不同/相同 BGM mode，确认 started/stopped 与 crossfade 听感边界一致。

### 独立验收建议

`建议`。涉及跨包 public address/event contract、Popup borrowed lifecycle、异步 music voice 与 runtime destroy。
重点复验：地址 catalog 无第二份 identity、transition event 顺序、inactive/stale/cleanup。复验命令：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address.test.ts tests/scene-layout/package-runtime-mode.test.ts
pnpm --filter @slotclientengine/audiocore exec vitest run tests/audio-runtime.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；shell 无 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才设置现有 HTTP/HTTPS proxy 并重试原命令。
- 本任务不新增依赖、不修改 lockfile；address parser/formatter 使用平台与仓库现有能力实现。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、production asset 或生成 TypeScript；若执行时出现生成物需求，先说明范围变化。
- `docs/gamelayout-runtime-addresses.md` 是通用 game runtime 使用合同，至少包含完整地址表、endpoint kind、
  list/describe/resolve/bind/wait、ownership、inactive/stale、callback/error 和 cleanup。
- Crave 文档给出 `BaseGame→FreeGame`/`FreeGame→BaseGame` Start、Popup string、RenderObject、audio示例，
  明确哪些修改由用户在外部项目完成。
- 更新 RenderCore/Audiocore/Gameframeworks README 与现有 composition API，避免并存冲突示例。
- 只把稳定的 owner-first address、event dispatch 和 editor派生地址职责写入对应领域规则；不在根
  `AGENTS.md` 保存地址实例或任务证据。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/228-rendercore-gamelayout-runtime-addressing-<utctime>.md
```

报告简要记录最终地址矩阵/API、实际修改文件、兼容 delegate、event顺序、自动验收、未完成人工验收、
计划偏差与剩余风险，不收集无关 coverage、历史矩阵或全仓 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 地址覆盖过宽会变成 mutable manifest/内部 display tree 后门；必须以 endpoint kind/capability allowlist收口。
- Popup layer 在 award tier/segment 之间更换具体 runtime；logical address 必须稳定而 borrowed capability
  必须按 active occurrence 失效，不能误操作新 layer。
- program callback 在 transition commit 后失败时无法回滚已提交 scene；合同必须明确 fail-stop。
- BGM start 是异步 backend boundary，stop 是 host-clock fade boundary；错误映射会产生重复或提前事件。
- legacy exact id 可能含 URI特殊字符；canonical codec必须保证唯一round-trip且不改identity。

### 假设

- Gamelayout configured transition `switchEvent` 是编辑者选择的程序/scene switch event 合同，并由当前
  resource validation 保证对应 animation 中 exact single occurrence。
- “所有编辑者编辑好的东西”指有 stable owner identity 的对象、binding、layer、string和受支持 lifecycle，
  不等于每个 manifest scalar 都可由游戏修改。
- manifest v4、Popup v7/audio v1 与 task 227 的 asset→binding projection 已含所需 identity；不升级 schema。

### 待确认

无。讨论已确认 authored object 第一优先、transition owner-first定位，以及 Crave `Start` 用例。

## 13. 完成清单

- [ ] authored address 覆盖、目标行为与非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] resolver、endpoint、event、ownership 和 destroy 符合计划。
- [ ] 没有新增第二份 manifest/resource/event identity 或 fallback。
- [ ] compatibility API、Editor、文档和领域规则已同步。
- [ ] 指定 L2 自动化验收已通过。
- [ ] 自动化与人工验收已明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`shared-game-runtime.md`、`scene-layout.md`、
   `editor-artifacts.md`；若核对 Crave 用例再读取 `game002.md` 与 `loading-ui.md`；
2. 核对 Git 基线与工作区，保留用户已有和无关修改；
3. 按 authored identity 第一优先与 owner-first 地址矩阵实现，不重新设计 alias/JSON Pointer 方案；
4. 小幅适配当前实现时在报告记录，manifest/schema/game app 等重大范围扩张先停止说明；
5. 只运行计划规定的 L2 验收，不默认执行整仓命令；
6. 完成后生成执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
