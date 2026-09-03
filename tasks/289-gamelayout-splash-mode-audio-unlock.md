# 289 gamelayout-splash-mode-audio-unlock 任务计划

## 1. 目标与完成定义

### 目标

为 Scene Layout 增加独立、可选的 Splash GameMode 角色。`initialMode` 继续表示进入正式游戏后的初始
mode；新 `splashMode` 表示 loading 完成后首先展示的欢迎页。配置 Splash 时，欢迎页第一次有效点击必须在
同一个真实用户手势调用栈中发起音频解锁并请求 `Splash -> initial`；未配置 Splash 的项目由 RenderCore
显示纯黑默认 Splash，同样强制首次有效点击解锁音频后才揭示 `initialMode`。

### 完成定义

- [x] latest Scene Layout manifest 可选声明 `gameModes.splashMode`；它必须引用已有 mode，且不得与
      `initialMode` 相同。
- [x] 配置 Splash 时，runtime 初始化后稳定显示 Splash；未配置时以纯黑默认 Splash 遮罩已准备的
      `initialMode`，点击并成功解锁音频后才揭示它。
- [x] Splash 的第一次有效欢迎页点击发起 AudioCore unlock；显式 Splash 同步发起到 `initialMode` 的现有
      direct transition，默认黑 Splash 等 unlock 成功后揭示 initial。点击提交后只处理一次，UI control、
      active Popup 已消费或非 Splash 阶段的点击不误触发。
- [x] Splash 到 initial 仍走 RenderCore 已有 target prepare、delivery readiness、none/Spine/video、
      commit、event、rollback/destroy 合同，不新增瞬切 fallback 或 app 侧第二状态机。
- [x] Game Layout Editor 可把用户已创建的任一 mode 设为/取消 Splash，明确显示 initial/Splash 两种角色并
      阻止同一 mode 同时承担两者；Editor 不按 mode 名猜测，也不自动创建 Splash。
- [x] 合法 v1–v7 manifest/ZIP 由 RenderCore strict 读取并规范化为 latest，缺失 Splash 时默认“未配置”；
      Editor 只预览和导出 latest。旧包中名为 `Splash` 或 `initialMode=Splash` 不被自动改义。
- [x] asset groups 与 CDN delivery 的 initial owner/chunk 使用实际启动 mode
      `splashMode ?? initialMode`；配置 Splash 时，正式 initial mode 保留独立 mode readiness。
- [x] RenderCore、Game Layout Editor、Gamelayout package CLI 的定向自动测试通过。
- [ ] 真实浏览器点击/听觉验收通过（按用户要求由用户执行）。

## 2. 范围

### 包含

- Scene Layout latest schema、strict parser、v1–v7 upgrader、public data type 与启动 mode 解析 helper。
- RenderCore layout/package runtime 的启动 mode、首次 mode event、Splash primary action、audio unlock、
  direct transition prepare/request 和资源生命周期。
- Game Layout Editor 的 project draft、mode commands、管理 UI、preview、latest import/export 和 ZIP round-trip。
- Gamelayout package CLI 的 asset groups、CDN delivery physical owner/chunk 和 RenderCore delivery identity/readiness。
- 直接测试，以及 Game Layout Editor、RenderCore、package CLI README 和三份相关领域规则。

### 不包含

- 不自动创建名为 `Splash` 的 mode，不按 `Splash`/`Welcome` 等 id 推断角色，不为旧包自动拆分
  `initialMode`。
- 不要求所有项目配置 authored Splash；缺省时用无资源、无持久 mode id 的黑色 runtime Splash 门禁。
- 不把 Splash 建模为新的 mode kind，不强制 `main.enabled=false`、禁止 Symbols/Popup，或硬编码背景、
  animation、文案、按钮和 mode id。
- 不自动生成、反向复用或寻路 transition；Splash 到 initial 必须有显式 direct edge。
- 不改变 AudioCore schema、music/effect bus、Event audio、legacy audio compatibility、mute/volume 或浏览器
  visibility/page lifecycle。
- 不修改游戏业务 app、server round、真实轮带、production 美术/YAML、workspace 依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-09-02T10:36:08Z
HEAD: c7db741bf92d6f7e78e688470b361a9b9b6b8f46
branch: detached HEAD（HEAD 同时包含于 main）
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md`
- `tasks/273-editor-legacy-audio-authoring-removal.md`
- `apps/gamelayouteditor/README.md`
- `packages/rendercore/README.md`
- `docs/scene-layout-manifest.md`

`apps/gamelayouteditor`、`packages/rendercore`、`apps/gamelayoutpkgcli` 下没有补充 `AGENTS.md`。

当前结论：

- `packages/rendercore/src/scene-layout/types.ts` 的 latest 是 v7；`SceneLayoutGameModesV7` 只有必填
  `initialMode`，v7 parser 对 `gameModes` 只接受 `initialMode/modes/transitions`。
- `upgradeSceneLayoutManifestToLatest()` 当前把合法 v1–v6 规范化为 v7；v7 直接 strict parse。新增持久字段若
  继续写入 v7 会破坏 strict version 合同，因此本任务应新增 v8，而不是原地放宽 v7。
- `SceneLayoutPackageRuntime.init()`、低层 layout runtime 与默认 geometry 当前都直接以 `initialMode`
  作为首个 displayed/stable mode，并在 init 成功后发出该 mode 的 displayed/stable entered event。
- `requestPrimaryGameModeAction()` 当前只读取当前 mode 的 optional `primaryAction` 并调用现有
  `requestGameMode()`；`unlockAudio()` 是独立 API。Game Layout Editor 的 preview host click 调用该 primary
  action，UI control runtime 会停止命中控件的 native click，避免冒泡触发欢迎页动作。
- `apps/gamelayouteditor/src/model/editor-project.ts#createSplashFirstEditorProject()` 当前自动创建 Splash 和
  BaseGame，把 Splash 直接写成 `initialMode`，再保存 Splash primary action 和显式 none edge；这与新需求的
  两个独立角色不一致。基础 `createNewEditorProject()` 已能只创建 BaseGame。
- Editor mode manager 当前只支持设置 initial；rename/delete、project summary、preview selection、manifest
  builder/importer 和测试都只维护一个角色。
- `apps/gamelayoutpkgcli/src/{asset-groups,delivery-builder}.ts` 与 RenderCore delivery loader 直接把
  `gameModes.initialMode` 当作 initial physical owner；配置独立 Splash 后必须统一改用实际启动 mode，否则会
  首包漏 Splash 或错误吞并正式 initial mode chunk。
- `getInitialSceneLayoutSymbolPackageResource()` 等 gameplay helper 当前按 `initialMode` 取得正式初始 Symbols；
  新合同下它应继续指向正式 initial，而不能随启动画面改成 Splash。

## 4. 需求解释与技术决策

### 需求解释

- `initialMode` 是欢迎页之后的正式游戏入口；`splashMode` 是可选欢迎页。两个字段是 project-level mode
  role，不是每个 mode 内的两个开关。
- “用户自己创建”表示 Editor 只允许从已有 mode 中选择 Splash，不自动新增、命名、复制或补资源。
- “第一次有效点击”是 authored Splash 当前 stable，或默认黑 Splash 门禁仍 active，且没有 active
  Popup/transition、事件未被 UI control 消费时的欢迎页 primary click；已离开 Splash、重复 click 或其它
  控件 click 不属于该边界。
- “解锁音频，然后跳转 initial”要求 AudioCore unlock 与 transition request 都在原始 click handler 同步
  调用，不能先 `await unlock` 再丢失 video trusted gesture，也不能等 prepare Promise 完成后自动伪造点击。
- 旧版本“默认填充”定义为 `splashMode` 缺失/`null`；不得把旧包的 `initialMode`、mode id 或既有
  `primaryAction` 猜成新角色。规范化后的旧包进入同一默认黑 Splash 点击解锁流程。

### 关键决策

1. **Scene Layout latest 升为 v8，增加 optional `gameModes.splashMode`。**
   - v8 strict 校验 Splash 引用 declared mode、与 initial 不同，并存在 exact `splash -> initial` direct edge。
   - configured Splash 的 `primaryAction` 可省略；若旧 draft 保留该字段，则 target 必须精确等于
     `initialMode`，不能形成冲突的第二目标。
   - v7 parser 保持原 strict 字段集合；v7→v8 只复制既有数据并省略 Splash，runtime allocation 结构若无
     新信息需求则继续使用 v3，不为版本号机械升级 allocation。
2. **统一用纯 helper 区分 startup 与 gameplay initial。**
   - `resolveSceneLayoutStartupMode(gameModes)` 返回 `splashMode ?? initialMode`，供 authored mode visibility、
     geometry、delivery 和 CLI physical ownership 使用；无配置时额外由 package runtime 叠加纯黑门禁。
   - `initialMode` 相关 gameplay API、初始 server scene/Symbols binding 语义仍指正式 initial；禁止把所有
     `initialMode` 文本机械替换为 startup。
3. **复用现有 primary-action API 承担 Splash 点击。**
   - 当 stable mode 等于 configured Splash 时，`requestPrimaryGameModeAction(options)` 忽略名字推断，直接以
     manifest `initialMode` 为 target；在任何 `await` 前分别调用 `unlockAudio()` 和现有
     `requestGameMode(initialMode, options)`，再收敛两个 Promise。
   - 缺少 configured Splash 时，第一次 primary action 只解锁音频并关闭黑色门禁，不执行 initial mode 自身的
     `primaryAction`；之后才恢复既有 explicit primary action。直接 mode request 在门禁期间显式失败。
   - existing direct edge、prepare signature、target `reels.main`、video synchronous `play()`、Popup prelude
     和 delivery gate 不复制。非法/未准备 video、重复 request、unlock/play failure 继续显式失败并由原 owner
     cleanup，不静音重试或瞬切。
4. **Editor 只管理角色，不隐式改 transition。**
   - mode manager 增加“设为 Splash/取消 Splash”和 badge；set initial/set Splash、rename、delete 都结构化维护
     两个引用并阻止相同角色。
   - 设置角色不会自动新建 edge、primary action 或资源。缺 `Splash -> initial` edge 时 draft diagnostics 明确
     阻止导出，用户在转场工作区显式配置。
   - 新项目恢复为只创建 BaseGame/initial；用户需要欢迎页时先创建 mode，再设 Splash并配置 direct edge。
5. **delivery 的 `initialMode` 保持“首个 authored mode”语义。**
   - 现有 delivery v2/asset-groups 字段继续保存 startup mode，因此不因 Layout v8 自动升级 delivery 版本；
     loader identity 改为与 normalized layout 的 startup mode 比较。
   - configured Splash 资源与 source-owned `Splash -> initial` transition 进入 initial owner；正式 initial mode
     获得普通 `mode:<initial>` chunk/readiness。默认黑 Splash 无资源，因此无 Splash 时 bytes 分组保持当前结果。

## 5. 职责与合同

- **RenderCore scene-layout data**：拥有 v1–v8 strict parser、v8 latest normalizer、role validation、startup helper、
  allocation/reference 和 delivery manifest identity。
- **RenderCore scene-layout core**：拥有 startup mode commit/event、Splash first-action latch、AudioCore unlock、
  transition prepare/request、target reel input、rollback/cleanup/destroy；不创建 DOM canvas/ticker/RAF。
- **Game Layout Editor**：拥有 nullable Splash draft、角色 commands/UI、existing-mode selection、preview host click、
  source import migration、latest export；不复制 audio/transition runtime。
- **Gamelayout package CLI**：消费 normalized latest manifest，以 startup mode 派生 initial asset group/CDN owner；
  不按 mode id 或资源文件名猜 Splash。
- **数据/API**：v8 `splashMode?: string` omission 是唯一“未配置”；unknown future version、unknown role target、
  `splashMode===initialMode`、缺 direct edge和冲突 primary target 尽早失败。
- **生命周期**：first-action 只接受一个有效 in-flight request；unlock、prepared transition、video/Popup、target reel
  和 delivery Promise 仍由各自现有 owner 释放。失败或 destroy 不留下 listener、audio intent、半提交 mode 或
  stale prepared target。
- **禁止行为**：magic `Splash` id、自动建 mode/edge、先 await 再播放有声视频、无 edge fallback、重复 mode
  状态机、把 startup 当 gameplay initial、或让 Editor/CLI 直接操作 AudioCore/Pixi 内部对象。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/manifest-v8.ts
packages/rendercore/tests/scene-layout/manifest-v8.test.ts
tasks/289-gamelayout-splash-mode-audio-unlock-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,manifest,manifest-v3,manifest-v7,geometry,runtime,package-runtime,package-resource,delivery-loader}.ts
packages/rendercore/src/scene-layout/{data,core}/**
packages/rendercore/tests/scene-layout/{manifest-upgrade,manifest,runtime,package-runtime,package-runtime-mode,package-runtime-video,delivery-manifest,delivery-loader,package-resource}.test.ts
packages/rendercore/README.md

apps/gamelayouteditor/src/model/{editor-project,game-mode-commands,validation}.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/{app-shell,state-manager-dialog,project-workspace}.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/{app-shell,game-mode-commands,state-manager-dialog,layout-preview,validation,zip-io}.test.ts
apps/gamelayouteditor/README.md

apps/gamelayoutpkgcli/src/{asset-groups,delivery-builder,package-reader,types}.ts
apps/gamelayoutpkgcli/tests/{asset-groups,delivery-builder,package-flow}.test.ts
apps/gamelayoutpkgcli/README.md

docs/scene-layout-manifest.md
docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md
```

测试文件按最终 helper/API 落点缩小；若 delivery/CLI type 无结构变化，不为保持清单机械修改。

### 原则上不应修改

```text
packages/{audiocore,logiccore,gameframeworks,uiframeworks}/**
apps/{game002v2,game003v2,gameviewer,gameviewer2}/**
assets/**
pnpm-lock.yaml
package.json
pnpm-workspace.yaml
```

若执行发现必须修改游戏 app 的 first-spin handler、升级 delivery schema、改变 allocation version 或扩展
AudioCore public API，属于明显范围扩张，先说明证据与兼容影响，不能事后改计划掩盖。

## 7. 实施步骤

1. **确认执行基线与角色矩阵**
   - 重核 HEAD/status、本计划和三份领域规则；固定 v1–v7 no-Splash、v8 no-Splash、v8 Splash 三条路径。
   - 审计所有语义性 `initialMode` consumer，逐项标为 startup 或 gameplay initial，禁止机械替换。
2. **建立 v8 schema 与升级链**
   - 新增 v8 types/parser，复用 v7 center-layout/node/UI/audio/allocation合同，仅扩展
     `gameModes.splashMode` 和对应 role/edge/primary target strict validation。
   - 更新 document parser、latest upgrader、data exports、asset/reference collector和 geometry structural identity；
     v1–v7 全部先按原版本 strict parse，再确定性升级为不含 Splash 的 v8。
3. **调整 RenderCore startup 与 Splash first action**
   - 用唯一 startup helper驱动低层 runtime/package runtime init、首个 visibility/geometry和 mode entered events；
     no-Splash 时在最上层显示全 viewport 黑色门禁，成功 unlock 后才揭示已准备的 initial。
   - 扩展 `requestPrimaryGameModeAction()`：仅 configured Splash stable 时同步启动 unlock 与到 initial 的 direct
     request；复用 options 中 target `reels.main`、existing prepare signature和 video trusted gesture。
   - 覆盖重复 click、Popup/UI control consumption、active transition、unlock/play rejection、rollback与destroy，
     确保只有成功 mode commit 后进入原 initial 后续流程。
4. **接入 Game Layout Editor**
   - draft 增加 `splashMode: string | null`；new project 只建 BaseGame；mode command/UI 支持 set/clear、角色互斥、
     rename/delete protection与可见 badge/summary。
   - preview 初始选择 startup mode；Splash click准备/请求 initial并复用 production runtime的同步 unlock；其它
     mode 的 explicit primary action和手动“启用声音”保留。
   - import v1–v7 填 null，import v8无损恢复，export只写 strict v8；不从旧 `initialMode=Splash` 或 id 推断。
5. **同步 asset groups 与 delivery**
   - CLI initial group、transition source ownership、chunk省略规则和 manifest `initialMode` 改用 startup helper；
     configured initial mode成为可加载 target chunk。
   - RenderCore delivery loader以 startup mode复验 identity，并证明 background prefetch、in-flight reuse、target
     commit readiness 与无 Splash旧 delivery不回归。
6. **测试、文档与收尾**
   - 增加 parser/upgrade/runtime/editor/ZIP/CLI 测试，更新 README、manifest文档和稳定领域规则。
   - 执行 L2 定向验收与真实浏览器点击/听觉流程，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- parser 覆盖 omission、合法 exact refs、same role、unknown mode、缺 edge、反向 edge、冲突 primary target、
  unknown future version；v7 parser仍拒绝 v8 字段。
- upgrade 覆盖 v1–v7 各 source version，重点证明旧 `initialMode=Splash + primaryAction=BaseGame` 升级后仍
  `splashMode` absent且行为不被重新解释；upgrade(latest) 幂等。
- runtime 覆盖 no-Splash黑屏门禁、Splash首显/事件、一次有效 click、重复 click、UI control click、active
  Popup、none/Spine/video、target reel input、audio/video rejection和destroy。
- trusted gesture测试必须证明 `unlockAudio()` 与 video/request 在原 click调用栈、任何 await之前被调用；fake
  autoplay或延时回调不能替代该断言。
- Editor 覆盖只建 BaseGame、用户创建/设定/取消 Splash、互斥、rename/delete、缺 edge diagnostics、preview
  click、v7 import和v8 export/reimport。
- CLI/delivery 对有无 Splash比较 initial owner、正式 initial chunk、source-owned transition、shared/program
  resource、prefetch/readiness和 manifest identity；不能仅更新快照字符串。

### 验收级别

`L2`。本任务修改 RenderCore 跨包 public schema/latest type、production runtime与正式 delivery/asset-group
consumer，并需要 Game Layout Editor只导出新版本；直接依赖链可以明确限定为 RenderCore、
gamelayouteditor和gamelayoutpkgcli，不触发根工具链、lockfile或整仓 release，故不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-v8.test.ts tests/scene-layout/manifest-upgrade.test.ts tests/scene-layout/package-runtime-mode.test.ts tests/scene-layout/package-runtime-video.test.ts tests/scene-layout/delivery-loader.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/game-mode-commands.test.ts tests/state-manager-dialog.test.ts tests/layout-preview.test.ts tests/validation.test.ts tests/zip-io.test.ts tests/app-shell.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/asset-groups.test.ts tests/delivery-builder.test.ts tests/package-flow.test.ts
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli build
git diff --check
```

失败先最小化复现并判断是否由本任务引入，不得因此退化为根级全量测试。

### 人工验收

1. 新建项目应只有 BaseGame，preview 初始为纯黑且点击后才显示 BaseGame；用户新增 Welcome mode、设为
   Splash并配置 Welcome→BaseGame direct edge后，
   导出/重开仍显示两个不同 badge，manifest为latest且保存 exact role。
2. 在真实浏览器 preview 中，Splash空白区域第一次点击应启用 Event音乐音效并只转场一次；radio/slider、
   active Popup点击不应触发，进入 BaseGame后的普通点击不应再次执行 Splash流程。
3. 分别验证 none、Spine和有声 MP4 edge；MP4在同一点击同步开始，未准备/播放拒绝明确报错，无静音或瞬切。
4. 打开旧 v7 ZIP（含旧式 `initialMode=Splash`）应保持旧首显与primary action语义；Editor不显示其已配置新
   Splash，导出v8后仍可由new runtime读取。
5. 对 CDN delivery样例确认 initial chunk显示Splash、BaseGame资源作为target chunk加载；点击早于target ready
   时沿现有readiness gate继续，资源ready后不要求额外音频解锁点击（video仍遵守现有prepare手势合同）。

自动 fake backend、happy-dom 和单元测试不能冒充真实音频/autoplay/浏览器手势验收；未完成项写入执行报告。

### 独立验收建议

`必须`。涉及 versioned production schema、跨包 public runtime、trusted gesture/audio和CDN首包归属。独立复验
聚焦旧版兼容、一次点击同步边界和startup/initial资源分离，最多运行：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-v8.test.ts tests/scene-layout/manifest-upgrade.test.ts tests/scene-layout/package-runtime-mode.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/layout-preview.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/asset-groups.test.ts tests/package-flow.test.ts
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；不切换 npm/yarn。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置既有本地代理并重试。
- 本任务不新增依赖、不修改 package manifest 或 lockfile。若实现产生 lockfile diff，先停止查因。

## 10. 生成物、文档与规则

- 本任务无 YAML、production asset或生成源码；禁止手改 `dist`、coverage和cache。
- 更新 `docs/scene-layout-manifest.md`、RenderCore/Game Layout Editor/package CLI README，明确 v8字段、startup与
  initial差异、旧版默认、点击同步顺序和delivery owner。
- 更新 `scene-layout.md` 的latest/role/first-click/delivery合同，更新 `editor-artifacts.md` 的user-created Splash
  authoring，更新 `shared-game-runtime.md` 的startup/initial与audio trusted gesture职责；不把一次性文件清单写入
  根 `AGENTS.md`。
- 如果新增 parser文件同时需要 public barrel export，必须由源码维护；本任务没有独立生成器或 parity产物。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/289-gamelayout-splash-mode-audio-unlock-<utctime>.md
```

UTC文件名通过 `date -u +%y%m%d-%H%M%S` 生成。报告简要记录最终schema/API、实际文件、旧版升级结果、
startup/initial delivery分组、自动命令、浏览器/听觉验收、计划偏差与剩余风险。

## 12. 风险、假设与待确认

### 风险

- `initialMode` 当前同时承担首显、初始Symbols和delivery owner；若未逐consumer分类，会把Splash错误绑定主转轮，
  或让BaseGame资源永远留在initial chunk。
- audio unlock与video play都受trusted gesture约束；任何先await后request、后台auto-transition或重试都可能在iOS
  失效。
- 旧项目常用 `initialMode=Splash + primaryAction=BaseGame`；按名字自动迁移会改变兼容行为，本计划明确不推断，
  采用新角色需要用户显式重设initial与Splash。
- Splash点击时target delivery可能尚未ready；none/Spine可沿现有gate等待，video必须继续满足预先prepare，不能把
  早期点击缓存成失去手势的自动播放intent。
- unlock或transition一方异步失败时必须显式报告并清理in-flight owner；不能让UI误以为已完成，也不能重复发出
  stable entered或残留audio loop intent。

### 假设

- 现有 `primaryAction` 和 direct transition仍是欢迎页进入正式initial的表现入口；本任务只让configured Splash
  自动派生target并增加audio unlock，不新增独立transition类型。
- UI control native click suppression与Popup优先分派继续作为“有效点击”过滤边界；不另建透明全屏Pixi按钮。
- delivery v2的 `initialMode` 可继续解释为首个实际显示mode，因此Layout v8不必连带升级delivery版本。

### 待确认

无。若执行证据推翻上述delivery字段语义或现有primary-action同步调用边界，按重大public contract扩张先停止说明。

## 13. 完成清单

- [x] 目标和非目标已满足（真实浏览器验收除外）。
- [x] 实际修改未超范围，或偏差已在报告说明。
- [x] v8 schema、旧版默认、startup/initial职责和delivery owner符合计划。
- [x] Splash第一次有效点击、audio/video trusted gesture、失败cleanup和无Splash回归已由自动测试证明。
- [x] Editor只选择用户创建的mode，未推断/自动创建Splash。
- [x] 测试、README和三份领域规则已同步。
- [x] 指定L2自动化验收已通过，真实浏览器/听觉结果已单列。
- [x] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的三份领域规则和本计划；
2. 核对Git基线与工作区，保留用户已有和无关修改；
3. 先分类所有 `initialMode` consumer，再实现v8，不机械全局替换；
4. 按计划实现，小幅适配当前代码时在报告记录；
5. schema/delivery/AudioCore或游戏app范围明显扩大时先停止说明；
6. 只运行计划规定的L2验收，失败先最小化；
7. 完成后生成执行报告；
8. 除非用户明确要求，不commit、不push、不创建PR。
