# 233 gamelayouteditor-programmatic-popup-imgnumber 任务计划

## 1. 目标与完成定义

### 目标

让 Game Layout Editor 中已导入但没有被 scene node、game mode 或 transition 直接引用的 ImgNumber 与 Popup package，
仍可由用户显式配置为程序资源并进入 production ZIP，游戏通过任务 228 已落地的 canonical
`gamelayout:/` 地址定位和使用它们。

同时把三类 Popup（`award-celebration`、`spine`、`single-state`）收敛到 Scene Layout package runtime 的统一
打开/关闭合同。每个导出的 Popup binding 在一个 package runtime 生命周期内只创建并缓存一个 player 实例；全局 Popup
协调器任一时刻只允许一个 active Popup，不允许程序 Popup、mode award 与 transition prelude 互相叠加。

### 完成定义

- [ ] standalone ImgNumber ZIP 继续按现有 strict importer 进入 `image-string` 资源库；即使没有 scene node，用户也可用唯一程序键
      绑定，导出后从 `gamelayout:/resource/image-string/<key>` 创建 caller-owned ImgNumber RenderObject。
- [ ] 三类 Popup package 都可在没有 mode/transition 直接引用时设为“程序 Popup”；导出、重导后保留 exact package、placement、
      order 与精确 closure，并从 `gamelayout:/popup/<id>` 打开。
- [ ] Editor 只对 production 中实际可达的 ImgNumber/Popup 显示并复制 canonical 地址；地址全部用共享 formatter 派生，
      不手拼、不手输、不写回 manifest、不维护 alias 表。
- [ ] Runtime 提供统一、type-safe 的 Popup 打开请求与统一关闭接口；输入类型必须与 exact Popup binding type 一致。
- [ ] 同一 runtime 中任何 Popup 开始前都先检查全局 active owner；已有 active Popup 时显式失败且不改变当前画面，不能创建第二层
      Popup 或静默替换。
- [ ] 同一个 Popup 完成关闭后可复用其唯一缓存 player 再次打开；不会因每次打开重建 resource/player，也不会让 caller destroy
      package-owned player。
- [ ] 现有 game-mode award、transition prelude、完整 canvas/keyboard 主交互、Popup string/layer 地址、音效与 mode transition 行为保持。
- [ ] public facade、测试、README、长期规则和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 的 ImgNumber 程序资源与 Popup 程序用途 UI、draft、导入导出、地址显示/复制和 production preview。
- RenderCore Scene Layout 的统一 Popup coordinator、typed open request、close/active query、单 active ownership、缓存复用及现有入口接入。
- 任务 228 `GameLayoutRuntimeAddresses` 的 exact Popup owner 地址作为打开定位合同；既有 Popup layer/string 与 ImgNumber factory 地址保持。
- `packages/gameframeworks` 对新增 production 类型/API 的 facade re-export。
- 直接保护上述合同的 RenderCore、Game Layout Editor 与 facade 测试、文档和领域规则。

### 不包含

- 不修改 Popup v8、image-string 或 Scene Layout v4 schema，不新增 manifest version、`programmaticPopups` 第二份表或地址字段。
- 不改变 Popup Editor 内部 layer/tier/animation/attachment authoring，不在 Game Layout Editor 编辑 Popup 内部内容。
- 不把 standalone ImgNumber 自动创建为 scene node，也不自动选择程序键、默认文字、挂载层或 placement。
- 不允许未导出 Popup/ImgNumber 通过 filename、physical hash path、首项或同名 owner fallback 被程序访问。
- 不支持 Popup stack、queue、modal priority、多个同时 active、自动替换当前 Popup或游戏专属 Popup 名称/金额规则。
- 不修改 production assets/YAML、游戏美术包、lockfile、根工具链或无关 editor。

## 3. 制定计划时的基线

```text
UTC: 2026-08-20T08:54:14Z
HEAD: babcb8643cc642af02968e6216a181f240dae4a0
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md`；目标目录没有补充 `AGENTS.md`。
- 用户写的 `packages/gamelayouteditor` 在仓库实际对应 `apps/gamelayouteditor`；统一 Popup production runtime 属于
  `packages/rendercore/src/scene-layout`，游戏 facade 属于 `packages/gameframeworks`。
- `EditorProject.runtimeResourceBindings`、`bindRuntimeResource()` 与 `editorResourceToRuntimeSpec()` 已支持未被 Scene 引用的
  `image-string` 以程序键进入 `runtimeResources`；`resources-workspace.ts` 已有“设为程序资源”，但没有显示/copy任务228地址。
- `editorProjectToManifest()` 只把 mode award、transition prelude 和 `registeredSpinePopupIds` 的并集写入 `popups`；
  `setSpinePopupRegistered()` 仅允许 `spine | single-state`，所以未直接引用的 `award-celebration` 不能作为程序 Popup 保留。
- `manifestToEditorProject()` 已能从无直接引用的普通 Spine/single-state binding 恢复独立注册；当前字段名、按钮和说明仍绑定旧类型语义。
- Scene Layout package init 为每个导出 Popup binding 各创建一个 player，并在 package destroy 时统一释放，已经具备“每 binding
  一个缓存实例”的资源基础；但三种 player 分散在三个 Map，production public getter 可直接 `start()`，没有单一 active 协调边界。
- mode award 使用 `startAwardCelebrationForCurrentMode()`，prelude 使用私有 Spine 流程，Game Layout preview 又分别调用
  `getAwardCelebrationPopup()`、`getSpinePopup()`、`getSingleStatePopup()`；不同入口可绕过统一排他检查。
- 任务 228 已提供 strict `addresses.list/describe/resolve/bind/wait`、Popup owner/layer/string address 与 ImgNumber
  `resource-factory` endpoint。当前 Popup UI 仍局部手拼地址，并会对尚未导出的 dependency 显示不存在于 production catalog 的地址。
- 本规划会话只新增本计划；未修改实现、安装依赖或运行构建/测试。

## 4. 需求解释与技术决策

### 需求解释

1. “没有直接配置”指资源/package 未被 scene node、mode award 或 transition prelude 引用；只有用户显式设置程序用途后才强制进入
   manifest 与 exact production closure。
2. ImgNumber 沿用仓库中的正式名称 `image-string` 和现有 `runtimeResources` 程序键；不新增 `imgnumberPackages` 平行 schema。
3. Popup 的 exact Scene Layout binding id 已是 task 228 Popup owner 地址 identity。程序用途只负责让无直接引用的 package 进入
   顶层 `popups`；已被 mode/transition 引用的 Popup 本来就已导出并可由相同地址定位，不需要重复注册。
4. “整个游戏缓存一个”解释为：每个导出的 Popup binding 在 package runtime 中最多一个 player 实例并跨多次 open 复用；
   全部 binding 共享一个 active slot。它不限制项目只能导入/导出一个 Popup package。
5. “不会重复叠加”是 strict runtime invariant：第二次 open、mode award、带 prelude transition 或其它 Popup 入口在已有 active owner 时
   先失败，不自动 dismiss、替换、排队或部分启动。

### 程序资源与地址决策

- ImgNumber 继续使用 `runtimeResourceBindings: Map<programKey, resourceId>`。绑定成功后 UI 通过
  `formatGameLayoutRuntimeAddress("resource", "image-string", key)` 显示/copy地址；未绑定时明确显示“不会作为程序工厂导出”。
- Popup draft 把 `registeredSpinePopupIds`/`setSpinePopupRegistered()` 改为类型中性的
  `programmaticPopupIds`/`setPopupProgrammatic()`，允许全部三种 type。manifest 仍只写现有 `popups` union，不增加用途字段。
- Popup 是否可从程序地址打开由“是否进入导出的 `popups`”唯一决定。直接引用已足够；`programmaticPopupIds` 只保存
  “没有直接引用时仍保留”的 authoring 意图。重导时由 `popups` 减去 mode/prelude direct refs 确定性恢复该集合。
- Popup/ImgNumber/transition 地址共用一个 UI address markup/copy helper；Popup root、layer、string 地址只从 shared formatter与
  typed nested manifest identity派生。禁止继续使用字符串模板加 `encodeURIComponent()` 维护第二套编码规则。

### 统一 Popup API 决策

- `SceneLayoutPackageRuntime` 新增统一请求合同，具体命名在实现时保持以下语义：

  ```ts
  type SceneLayoutPopupOpenRequest =
    | { address: GameLayoutRuntimeAddress; type: "award-celebration"; betAmountRaw: number; winAmountRaw: number }
    | { address: GameLayoutRuntimeAddress; type: "spine"; text?: string }
    | { address: GameLayoutRuntimeAddress; type: "single-state" };

  openPopup(request: SceneLayoutPopupOpenRequest): SceneLayoutPopupSession;
  closePopup(options?: { behavior?: "complete" | "immediate" }): Promise<void>;
  getActivePopupAddress(): GameLayoutRuntimeAddress | null;
  ```

- `openPopup()` 必须先用任务 228 resolver 验证 canonical address 存在且 kind 为 `popup`，再核对 request type 与 binding type；
  unknown/non-canonical address、kind/type mismatch、award非法金额和已 active 均在任何 player mutation 前失败。
- `SceneLayoutPopupSession` 是 immutable command/result handle，只公开 exact address/type 与 `finished` Promise，不公开 raw player/
  Container，不转移 ownership。正常 complete、immediate close、supersede禁止路径、destroy分别有确定性 settle/reject语义。
- `closePopup()` 是唯一新的 production close入口：默认走各类型正式 request-dismiss/end drain并在 complete 后 resolve；
  `behavior="immediate"` 用于明确取消/宿主 cleanup。没有 active Popup 时幂等 resolve。
- mode award、transition prelude、现有兼容 award方法和 presentation surface 都委托同一个 coordinator；程序 Popup active 时
  `requestGameMode()`/mode award在 prepare/mutation 前失败，反向同理。
- `requestPrimaryPopupInteraction()` 继续是完整 canvas/keyboard 唯一入口：award执行advance，Spine/single-state请求正常关闭，
  prelude保持既有结束锁存与video第二次trusted gesture语义。
- production public type不再给程序 caller 暴露可直接 `start()` 的三类 raw Popup runtime getter；需要 exact layer/string 的安全访问继续走
  task 228 borrowed endpoint，editor inspector通过内部只读/command bridge复用同一 coordinator。现有 award高层方法暂作兼容 wrapper，
  并迁移仓库内直接 consumer后标记deprecated，不在本任务无通知硬删。

## 5. 职责与合同

- **Game Layout Editor**：拥有 dependency library、程序用途 authoring、runtime key、derived address展示、preview控制和ZIP transaction；
  不复制 Popup/image-string player或地址parser。
- **Scene Layout data**：保留现有 v4 `popups`/`runtimeResources` typed schema、strict reference和allocation；本任务无schema变化。
- **Scene Layout core**：拥有 Popup player cache、唯一 active slot、open/close/session、input dispatch、mode/prelude排他和destroy cleanup。
- **Popup core**：继续拥有各类型内部状态机、string/layer与player lifecycle；不知道 game mode、task 228地址或Editor程序用途。
- **Gameframeworks**：只re-export统一production合同，不包装第二个Popup manager或缓存。
- **资源生命周期**：Popup package resource/player由package runtime prepare、commit、复用和destroy；session与borrowed handle不拥有player。
  ImgNumber factory输出仍由caller detach/destroy。init/open失败不得留下active标记、可见container、waiter或半应用string。
- **失败策略**：unknown address/key/type、未导出owner、坏input、已有active、destroyed runtime和stale session显式失败；不猜id、
  不从filename/hash回退、不自动排队/替换/叠加。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/popup-coordinator.ts
packages/rendercore/tests/scene-layout/popup-coordinator.test.ts
tasks/233-gamelayouteditor-programmatic-popup-imgnumber-<utctime>.md
```

若 coordinator 足够小，可并入 `package-runtime.ts`，但仍须保持单一 active账本，不能在三类 player分支各复制一份状态。

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,package-runtime,presentation-surface}.ts
packages/rendercore/src/scene-layout/core/{index,runtime-address}.ts
packages/rendercore/tests/scene-layout/{package-runtime,presentation-surface,runtime-address}.test.ts
packages/gameframeworks/src/index.ts
packages/gameframeworks/tests/exports.test.ts
apps/gamelayouteditor/src/model/{editor-project,game-mode-commands,resource-commands}.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/{app-shell,bigwin-workspace,project-workspace,resources-workspace,transitions-workspace,ui-markup}.ts
apps/gamelayouteditor/tests/{app-shell,game-mode-commands,popup-package,ui-markup,validation,zip-io}.test.ts
apps/gamelayouteditor/README.md
packages/rendercore/README.md
docs/{gamelayout-runtime-addresses,scene-layout-manifest}.md
docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md
```

### 原则上不应修改

```text
packages/rendercore/src/{popup,image-string}/**
apps/{popupeditor,imgnumbereditor,symbolseditor}/**
apps/{game002v2,game003v2}/**（仅在现有兼容wrapper无法保持typecheck时做最小调用迁移并先说明）
apps/gamelayoutpkgcli/**
packages/{logiccore,uiframeworks,editorcore,editorresource,browserartifactio}/**
assets/**
{package.json,pnpm-workspace.yaml,pnpm-lock.yaml,AGENTS.md}
tasks/228-*.md
```

执行时若需要新增manifest字段/version、Popup queue/stack、raw player公开、游戏业务输入、lockfile或大范围consumer迁移，必须先停止说明，
不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与兼容调用面**
   - 重核HEAD/status、ImgNumber importer/runtime binding、Popup直接引用/独立注册/closure、task228 catalog与三类Popup所有start/close入口。
   - 用现有fixture固定v4 manifest不变、旧award高层方法、prelude、input binding与地址list兼容。
2. **统一Editor程序用途与地址展示**
   - 将Popup独立注册draft/command/UI改为类型中性程序用途，允许未直接引用的三类Popup进入`popups`，删除/替换继续按owner graph原子校验。
   - 保持ImgNumber现有`runtimeResources`合同，补充绑定后canonical factory地址、copy与未绑定诊断。
   - 抽取共享address markup/copy，使用shared formatter生成Popup root/deep与ImgNumber地址；未导出owner不显示伪地址。
3. **实现单一Popup coordinator**
   - 在Scene Layout package runtime中以exact address记录唯一active session，复用每binding现有缓存player，统一open preflight、start、update、
     normal/immediate close、finished settle、failure rollback与destroy。
   - 三类输入做exhaustive type分派；所有验证在关闭/显示/改string前完成，start失败恢复idle且不影响其它package state。
4. **收敛现有Popup入口**
   - mode award、prelude、primary interaction、presentation surface和兼容award方法全部委托coordinator；移除production caller绕过active账本直接start的路径。
   - 保留task228 layer/string borrowed访问与现有prelude string transaction；mode/transition冲突在prepare/commit前失败。
5. **接入preview、ZIP重导与facade**
   - Game Layout preview改用统一open/close并显示active canonical address；三类Popup可重复open→close→open但不能并发。
   - 验证未直接引用的ImgNumber/Popup仅在程序用途启用时进入manifest、allocation、mapped ZIP与重导draft，取消后无其它owner即排除。
   - Gameframeworks re-export request/session/address类型；不增加game-specific wrapper。
6. **同步测试、文档与规则**
   - 增加single-active、三类型、cache reuse、strict conflict、rollback/destroy、地址与closure/round-trip测试。
   - 更新README、runtime address/manifest文档与最小稳定规则，运行L2定向验收并生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- RenderCore fixture必须包内自包含，不读取`assets/**`或真实游戏美术。
- ImgNumber覆盖import→未引用→程序键→地址/factory→取消→closure排除，以及坏key、重复key、missing glyph与caller-owned destroy。
- Popup覆盖三type程序保留、direct-ref无需重复注册、canonical地址/type mismatch、open/normal close/immediate close/reopen。
- 排他测试覆盖program↔program、program↔award、program↔prelude、重复open、transition prepare失败、start失败、destroy；失败前后active address、
  player phase、container visibility与waiter必须一致。
- 用factory spy证明同一Popup多次open只创建/init一个player；不同binding各自最多一个player，但任一时刻只有一个active。
- 保留task228地址list/descriptor、popup layer/string handle与ImgNumber resource-factory既有行为，不以UI字符串测试替代shared formatter测试。

### 验收级别

`L2`。原因是修改RenderCore Scene Layout与Gameframeworks public production API、Popup lifecycle/ownership，并接入Game Layout Editor
正式ZIP consumer；不修改schema、根工具链、lockfile、production assets或release，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/popup-coordinator.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/package-runtime-mode.test.ts tests/scene-layout/presentation-surface.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/game-mode-commands.test.ts tests/popup-package.test.ts tests/validation.test.ts tests/zip-io.test.ts tests/ui-markup.test.ts tests/app-shell.test.ts
pnpm --filter @slotclientengine/gameframeworks exec vitest run tests/exports.test.ts
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gamelayouteditor --filter game002v2 --filter game003v2 typecheck
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gamelayouteditor build
git diff --check
```

若新增测试文件最终并入`package-runtime.test.ts`，第一条删除不存在路径并在报告说明；不因此扩为整包coverage或根级test/build。

### 人工验收

- 导入一个未建scene node的ImgNumber ZIP，设程序键后确认显示/copy canonical地址、导出可创建并改字；取消后重新导出不含该closure。
- 分别导入未绑定mode/transition的award、Spine、single-state Popup，设为程序用途后确认地址可复制、三类均可open/close并重导保持。
- 连续执行同Popup open→close→open确认复用且画面干净；Popup active时尝试打开另一Popup、播放mode award和启动带prelude转场，确认显式失败且无叠加。
- 正常关闭award/Spine/single-state，确认各自正式end/complete；immediate cleanup、runtime destroy后无残留画面、ticker、listener或pending Promise。

### 独立验收建议

`必须`。涉及跨包public contract、全局Popup排他状态、Promise settle、player cache与destroy ownership。重点复验：第二次open不得部分启动、
现有award/prelude无回归、未引用program dependency的ZIP closure。复验命令：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/popup-coordinator.test.ts tests/scene-layout/package-runtime-mode.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts tests/zip-io.test.ts tests/app-shell.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的Node.js 24与pnpm；当前planning shell没有`node`命令，执行会话先加载
  `/Users/zerro/.nvm/nvm.sh`并`nvm use 24`，不改变仓库版本。
- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置现有HTTP/HTTPS proxy并重试。
- 复用现有RenderCore Popup/image-string、Scene Layout地址与Editor workspace，不新增依赖、不修改lockfile。

## 10. 生成物、文档与规则

- 本任务不修改YAML、production asset或生成TypeScript；若public declaration由build生成，只运行正式build，不手改`dist`。
- 更新`docs/gamelayout-runtime-addresses.md`：ImgNumber程序绑定、Popup统一open/close、single-active、session/ownership与strict error示例。
- 更新`docs/scene-layout-manifest.md`：无直接引用的程序Popup仍通过现有`popups` binding导出，明确没有新增allowlist/schema。
- 更新RenderCore和Game Layout Editor README；只把canonical地址、程序保留、单active/cache/destroy等稳定边界写入三份领域规则。
- 不修改根`AGENTS.md`，不回写任务228历史报告。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/233-gamelayouteditor-programmatic-popup-imgnumber-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终API、实际文件、地址/closure、Popup排他与cache证据、自动化结果、
未完成人工验收、偏差和剩余风险。

## 12. 风险、假设与待确认

### 风险

- 现有Popup入口分散在mode award、prelude、presentation surface、preview与public getter；漏接一个入口会破坏“全局单active”保证，
  必须用入口矩阵和source-boundary测试保护。
- normal close依赖宿主继续`update(deltaSeconds)`推进end；session/close Promise不能用wall clock或隐藏RAF完成。
- strict第二次open若在player mutation后才判断，会留下半显示/半改string；coordinator必须先完成address/type/input/active全量preflight。
- 旧direct getter是潜在绕过点；兼容迁移必须收窄start能力，同时保持task228 borrowed layer/string和editor inspector可用。

### 假设

- “缓存一个”指每个Popup binding一个可复用player、全游戏一个active slot，而不是项目只能配置一个Popup package。
- 已直接引用并进入`popups`的Popup天然可从程序地址打开；“设为程序Popup”只用于无直接引用时强制保留，不建立第二份权限表。
- Popup打开输入只复用现有三类runtime语义；国际化、金额formatter和业务何时open/close仍由游戏负责。

### 待确认

无。若执行时要求第二次open自动替换/排队、允许Popup叠加、只缓存全项目唯一player并在不同package间销毁重建，或要求新增manifest
programmatic allowlist，均属于与本计划single-active/现有schema决策冲突的范围扩张，应先停止讨论。

## 13. 完成清单

- [ ] ImgNumber与三类Popup的无直接引用程序用途、地址和exact closure已实现。
- [ ] 地址只由task228共享formatter/catalog派生，未导出owner不显示伪地址。
- [ ] 统一Popup open/close/session与全局单active invariant成立，缓存player可安全复用。
- [ ] mode award、prelude、input、layer/string和旧consumer兼容已验证。
- [ ] public API、ownership、Promise settle、rollback与destroy符合计划。
- [ ] 自动化和人工验收已明确区分，指定L2命令已通过。
- [ ] README、长期文档/规则与UTC中文执行报告已同步。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的三份领域规则与本计划；
2. 核对Git基线、Node 24环境与工作区，保留用户无关修改；
3. 先盘点所有Popup start/close入口，再建立coordinator，不能只修Editor UI；
4. 按计划实现；小幅适配当前代码时在报告记录，重大范围扩张先停止说明；
5. 只运行计划规定的L2验收，不扩为根级全仓命令；
6. 完成后生成UTC中文执行报告；
7. 除非用户明确要求，不commit、不push、不创建PR。
