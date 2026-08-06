# 177 Game Layout Editor 可选转场效果与通用转场 Popup 任务计划

## 1. 目标与完成定义

### 目标

为 Scene Layout 的显式有向转场增加第三种“无效果”分支，并把普通 Spine Popup 从仅属于
Spine overlay 的配置提升为每条转场都可独立选择的可选配置。配置人员可以在“无效果 / Spine
顶层特效 / 黑场视频”之间切换，也可以为任一种效果选择“无 Popup”或一个普通 Spine Popup。

“无效果”不是缺边或 fallback：仍须存在 exact `from -> to` 有向边，runtime 仍先严格准备完整目标
scene，只是不创建或播放 presentation object，并在合法边界直接原子提交目标状态。

### 完成定义

- [ ] 转场 Inspector 提供“无效果”“Spine 顶层特效”“黑场视频”三种互斥选项；切到“无效果”后
      不要求资源、animation、event、placement 或视频参数，触发时直接切换到目标状态。
- [ ] 每种转场效果都显示同一份可选普通 Spine Popup 配置；选择“无”或不配置时不弹 Popup，且不
      自动选择资源库第一项、唯一项或其它边的 Popup。
- [ ] 每条边独立保存 Popup 引用；切换效果类型时保留仍合法的 Popup 引用、root order 和各 variant
      placement，只清理效果分支自身不兼容字段。
- [ ] 无效果且无 Popup 时，在目标 scene prepare 成功后原子切换 background、scoped nodes、reel、
      displayed/stable mode；prepare 失败时 source scene 完全不变。
- [ ] 配置 Popup 时继续保持 source mode，完整执行 Popup `start -> loop -> end`；完成后无效果分支
      直接提交，Spine 分支启动 overlay，视频分支进入明确的 trusted-click 等待阶段。
- [ ] 带 Popup 的视频不得自动播放、静音降级或与 Popup end 时间轴重叠；Popup 完成后由第二次真实
      用户点击同步启动已准备视频。无 Popup 视频保持现有一次 trusted click 启动行为。
- [ ] layout manifest、mapped ZIP 重导、production exact closure、CLI asset groups 和 reference rewrite
      无损支持新分支与三种效果的可选 Popup；无效果本身不引入资源。
- [ ] 现有 Spine/video 转场包和未配置 Popup 的行为保持兼容；缺显式边仍显式失败，不增加瞬切
      fallback、反向复用或自动寻路。
- [ ] 定向自动化验收通过，并完成人工浏览器验收交接；执行会话生成 UTC 中文报告。

## 2. 范围

### 包含

- `packages/rendercore/scene-layout` 的 transition public type、v1 strict parser、资源收集/准备、package
  runtime、snapshot、presentation surface 与生命周期。
- `apps/gamelayouteditor` 的 draft union、command、validation、资源引用、Inspector、preview 状态、
  mapped ZIP import/export 和相关测试。
- `apps/gamelayoutpkgcli` 对无资源 transition group、Popup closure 和结构化引用重写的支持。
- `docs/scene-layout-manifest.md`、相关 package/app README，以及被本任务改变的最小领域规则。
- `apps/game002` 作为 `SceneLayoutPresentationSurface` 的直接 consumer 做编译回归；只有 public API
  适配确有需要时才修改其代码。

### 不包含

- Popup package 内部 start/loop/end animation、layer、prompt、文字、ImgNumber、坐标或资源编辑。
- award-celebration Popup 作为转场 Popup；转场仍只接受普通 `type: "spine"` Popup。
- 新增 WebM、CSS overlay、VNI transition、音量/静音策略、视频 seek/autoplay fallback 或 popup/effect
  并行播放。
- 缺边时自动瞬切、反向边复用、多跳寻路，或把“无效果”解释成删除有向边。
- 修改 production 美术资源、现有业务 transition 配置、根工具链、依赖或 lockfile。
- 借机重构 scene-layout 之外的状态机或游戏业务触发流程。

## 3. 制定计划时的基线

```text
UTC: 2026-08-06T08:40:00Z
HEAD: 351bc96a4226fc0d47f47f9051ef7a2413a81442
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 实际读取：根 `AGENTS.md`、`docs/agent-rules/scene-layout.md`、
  `docs/agent-rules/editor-artifacts.md`；目标目录不存在额外 `AGENTS.md`。
- `packages/rendercore/src/scene-layout/types.ts` 的 `SceneLayoutGameModeTransition` 当前只有 Spine 与
  video 两个 overlay union；`preludePopup` 只在 `SceneLayoutSpineGameModeTransition` 上。
- `packages/rendercore/src/scene-layout/manifest.ts::parseGameModeTransitions()` 当前要求每条边都有
  `overlay.resource`，并显式拒绝 video 的 `preludePopup`；资源收集也假设每条边都有 effect resource。
- `packages/rendercore/src/scene-layout/package-runtime.ts` 当前只准备 Spine player 或 video player；
  video `requestGameMode()` 必须在 trusted click 内同步 `play()`，Popup complete 后只会继续 Spine。
- `apps/gamelayouteditor/src/model/editor-project.ts` 把 `preludePopupId` 放在 Spine draft 内，导出、重导
  和 Popup 引用图也只检查 Spine；`setGameModeTransitionKind()` 会随效果类型切换清空 Popup。
- `apps/gamelayouteditor/src/ui/transitions-workspace.ts` 只有两个 presentation 选项，并把 Popup Inspector
  嵌在 Spine Inspector 内；video 分支无法配置 Popup。
- `apps/gamelayouteditor/src/io/imported-layout-zip.ts`、`exported-layout-zip.ts`、rendercore resource/package
  resource、CLI `asset-groups.ts` 与 `reference-rewriter.ts` 都直接解引用 `transition.overlay.resource`。
- `docs/scene-layout-manifest.md`、`apps/gamelayouteditor/README.md`、`packages/rendercore/README.md` 和两份
  领域规则明确记录了“只支持 Spine/video、video 禁止 prelude”的当前合同。
- 当前工作区无已有修改。规划会话未安装依赖、未构建、未测试；执行会话按第 9 节切换 Node 24。

## 4. 需求解释与技术决策

### 需求解释

- “无效果”表示用户显式配置的一种 effect，不表示 transition 不存在；从 source 到 target 仍必须有
  唯一直接边并遵守 target prepare/atomic commit 合同。
- “Popup 可以配置成无”表示 transition 根级 Popup 引用可省略，Editor 用明确的“无”选项写入
  `null` draft / 省略 production 字段；省略时 runtime 不启动 Popup。
- “不管怎样的转场效果”包含无效果、Spine 和视频。Popup 的类型及生命周期沿用现有普通 Spine
  Popup，不扩大到 award celebration。
- 当前 Popup 是 prelude，继续保持 source mode 直到 Popup complete；不改变为转场后 Popup。

### 关键决策

1. **在现有 v1 union 中增加显式 none overlay**
   - canonical 形状使用 `overlay: { "kind": "none" }`，而不是省略 `overlay`、写 `null` 或伪造空资源。
   - 现有 Spine/video 形状不迁移、不改版本；parser 对 none 只允许 `kind`，任何 resource、animation、
     placement、fit 或 fade 字段都 strict failure。
   - public union 增加 `SceneLayoutNoneGameModeTransition`；三种分支共享根级可选 `preludePopup`。

   ```ts
   type SceneLayoutGameModeTransition =
     | {
         readonly from: string;
         readonly to: string;
         readonly preludePopup?: string;
         readonly overlay: { readonly kind: "none" };
       }
     | SceneLayoutSpineGameModeTransition
     | SceneLayoutVideoGameModeTransition;
   ```

2. **Popup 是 edge-owned common contract**
   - Editor draft base 持有 `preludePopupId: string | null`，三种效果共用同一 command、UI 和引用图。
   - 效果切换保留 Popup binding，只重建具体 effect payload；Popup 的 order/placement 仍属于 shared
     Popup binding，修改一个 binding 会影响所有引用它的边，这是既有明确 ownership。
   - parser 对三种效果统一校验 Popup 存在且 type 为 `spine`；未知、award 类型或 orphan 引用显式失败。

3. **无效果复用完整 target transaction，不建立第二套瞬切入口**
   - `prepareGameModeTransition()` 仍准备目标 mode、可选 reel/catalog 和 visibility commit 所需状态；none
     分支不创建 player，也不占用 transition presentation layer。
   - 无 Popup 时 `requestGameMode()` 直接使用已准备 target 原子 commit 并完成；有 Popup 时 complete 后
     调用同一 commit helper。失败、取消、destroy 必须释放已准备 reel/catalog 并恢复 source snapshot。

4. **视频 Popup 通过显式第二次 trusted gesture 保持浏览器合同**
   - 第一次 `requestGameMode()` 启动 Popup，但不调用 video `play()`；Popup complete 后 snapshot 使用新
     `transitionPhase: "awaiting-video-start"`，保留 prepared player 与 target transaction。
   - package runtime 与 presentation surface 新增单一用途的 `startPendingGameModeVideo()`；它只在该
     phase 合法，必须由真实 click/pointer handler 直接调用，并在首次 `await` 前同步执行 `play()`。
   - 初次 `requestGameMode()` 的 Promise 覆盖完整 Popup + 等待手势 + video + commit 生命周期；第二个
     API 只恢复该 pending request，不创建另一条转场。重复、错误 phase、已取消或 target 不匹配失败。
   - 不采用预先播放后暂停、静音 autoplay、Popup end 与视频并行、wall-clock 或 play rejection fallback，
     因为这些方案会破坏现有媒体和 Popup 生命周期合同。

5. **保持有向边和资源闭包严格性**
   - none transition group 的 effect closure 为空，但仍可包含其 Popup exact closure，并继续归 source
     mode；无 Popup 时允许该 transition group 的 `requiredAssets` 为空。
   - reference rewriter、mapped export/import、resource loader 都显式分支 none，不扫描或猜测路径。

## 5. 职责与合同

- **模块职责**：rendercore 拥有 manifest union、target prepare、Popup/effect sequencing、原子 commit、
  rollback/destroy 和 snapshot；Editor 只拥有 draft/UI/preview/IO；CLI 只推导 typed closure 与重写引用。
- **数据/API**：v1 transition 保持 unique exact `from/to`；`overlay.kind = "none"` 是显式无效果；
  `preludePopup` 缺失为无 Popup，存在时必须精确引用普通 Spine Popup。
- **runtime phase**：snapshot 的 `transitionKind` 扩展为 `"none" | "spine" | "video" | null`；
  `transitionPhase` 扩展 `"awaiting-video-start"`。none 无 Popup 可在一次调用内从 stable 原子到 stable，
  不制造假动画 phase。
- **资源生命周期**：Popup/player/target reel/catalog 由 package runtime prepare；commit 后转移目标 ownership，
  失败、cancel、immediate dismiss 和 destroy 都只释放本次拥有对象，不销毁共享 Popup package/resource。
- **失败策略**：unknown overlay kind、none 携带多余字段、错误 Popup 类型、未准备视频、错误 trusted-start
  phase、重复请求、缺边、target input 不闭合均尽早显式失败；source/displayed mode 不半提交。
- **禁止行为**：不得把 none 当缺边 fallback，不得默认选 Popup，不得从 filename 猜依赖，不得为 Editor
  复制 production transition state machine，不得用自动静音或效果降级掩盖 `play()` 失败。

## 6. 文件范围

### 预计新增

```text
tasks/177-gamelayouteditor-optional-transition-effect-popup-<utctime>.md
```

不预计新增 production module；优先在现有 transition/runtime/Inspector 模块中扩展 strict union。

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,manifest,resource,package-resource,package-runtime,presentation-surface}.ts
packages/rendercore/tests/scene-layout/{manifest,resource,package-runtime,package-runtime-mode,presentation-surface}.test.ts
apps/gamelayouteditor/src/model/{editor-project,game-mode-commands,resource-commands,coordinate-origin}.ts
apps/gamelayouteditor/src/io/{imported-layout-zip,exported-layout-zip}.ts
apps/gamelayouteditor/src/ui/{transitions-workspace,ui-session,app-shell}.ts
apps/gamelayouteditor/tests/{game-mode-commands,transitions-workspace,validation,zip-io,coordinate-origin}.test.ts
apps/gamelayoutpkgcli/src/{asset-groups,reference-rewriter}.ts
apps/gamelayoutpkgcli/tests/{asset-groups,reference-rewriter}.test.ts
docs/scene-layout-manifest.md
apps/gamelayouteditor/README.md
packages/rendercore/README.md
apps/gamelayoutpkgcli/README.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
```

测试若已集中在其它同领域文件，可在报告记录小幅调整，不新建重复套件。

### 原则上不应修改

```text
apps/popupeditor/**
packages/rendercore/src/popup/**
packages/logiccore/**
packages/vnicore/**
apps/game002/src/**
apps/game003/**
assets/**
pnpm-lock.yaml
package.json
AGENTS.md
```

若 `SceneLayoutPresentationSurface` 的 public API 变化迫使 game002 做机械转发适配，先确认无法通过向后
兼容的新增方法解决，再说明扩大文件范围；不得修改业务状态编排来使用本任务的新组合。

## 7. 实施步骤

1. **确认执行基线**
   - 重新记录 UTC、HEAD、branch、完整工作区状态，并重读本计划和两份领域规则。
   - 核对当前 transition type/parser/runtime 是否仍与本计划基线一致；保留所有用户无关修改。

2. **扩展 rendercore manifest 与 exact closure**
   - 在 `types.ts` 抽出 common transition 字段，增加 explicit none 分支，并扩展 snapshot phase/kind。
   - 在 `manifest.ts` 先统一解析 from/to/Popup，再严格区分 none/Spine/video；移除 video Popup 禁令，
     保持普通 Spine Popup 类型检查、pair uniqueness、deep freeze 和 orphan 规则。
   - 更新 asset path 收集、resource/package-resource loader 与 transition reference rewrite 使用显式 union
     narrowing；none 不读取不存在的 resource，也不产生伪路径或 placeholder。

3. **实现统一 Popup/effect runtime 编排**
   - 将 prepared target 与 effect player 解耦，使 none 只准备 target transaction；抽取公共 Popup activation、
     completion、commit、failure、release 路径，避免复制三套状态机。
   - none 无 Popup 直接 commit；none/Spine 有 Popup 在 complete 后继续；video 有 Popup 转入
     `awaiting-video-start`，由 `startPendingGameModeVideo()` 在 trusted gesture 内同步 `play()`。
   - 补齐 cancel、immediate dismiss、重复请求、video play rejection、update error 和 destroy 的回滚/释放，
     保证 source stable/displayed scene 与共享 Popup owner 一致。
   - presentation surface 只转发正式 runtime snapshot 和 pending video start API，不复制 phase 判断。

4. **扩展 Editor draft、commands 与 Inspector**
   - 把 `preludePopupId` 移到 transition base；增加 `kind: "none"` draft，创建新边仍默认 Spine 以保持
     既有 authoring 行为，效果切换只替换 effect-specific 字段并保留 Popup。
   - 更新 validation、资源引用/替换/删除、coordinate origin、manifest materialization 和 layout ZIP
     rehydration：none 无 `resourceId`/placement；三种分支均参与 Popup reachability。
   - 把 Popup selector/order/placement 提升到 Inspector common section；“无”为空值。none 显示无资源
     提示并直接 ready；Spine/video 保留原专属表单和严格错误。
   - preview UI 为 none 展示直接切换状态；为 video+Popup 展示“Popup 完成，等待点击开始视频”，并把
     用户按钮直接绑定正式 pending-start API。不得让定时器或 Promise continuation代替真实点击。

5. **同步 CLI、测试与文档**
   - CLI transition group 对 none 使用空 effect closure并合并可选 Popup closure；结构化 rewriter 原样
     保留 none，不访问 resource。
   - rendercore 测试覆盖 strict none schema、三种 effect 的 Popup、target transaction、phase/snapshot、
     trusted video second gesture、rollback/destroy 和旧 Spine/video compatibility。
   - Editor 测试覆盖三选一 UI、common Popup 的“无”与 exact edge、类型切换保留 Popup、none readiness、
     mapped ZIP round-trip、资源引用隔离和 preview 文案/按钮；CLI 测试覆盖空与 Popup-only group。
   - 更新 manifest 文档、三个 README 与两份领域规则，删除“video 禁止 prelude/只支持两种效果”的旧说法。

6. **定向验收与报告**
   - 使用第 8 节 L2 命令验收；失败先最小化到目标 package/测试，不扩大整仓扫描。
   - 完成浏览器人工验收交接，生成 UTC 中文执行报告，记录实际文件、命令结果、偏差与未完成项。

## 8. 测试与验收

### 测试原则

- parser 测试同时覆盖 canonical none、unknown/mixed fields、wrong Popup type 和 deep-freeze，不以宽松兼容
  接受非法结构。
- runtime 使用可观察 fake player 验证调用时序和 ownership，但不把 fake `play()` 当作真实浏览器 autoplay
  验收；真实 trusted-click 行为保留人工测试。
- 以 effect × Popup 的关键矩阵覆盖 none/Spine/video 的有无 Popup，不重复扩张与任务无关的 layout 测试。
- 验证 prepare/play/Popup/update 失败均不改变 source stable/displayed mode，且 destroy 不泄漏 prepared
  player、target reel/catalog 或 popup active state。

### 验收级别

选择 `L2`：本任务修改 rendercore scene-layout public union、snapshot/API、正式 v1 schema、mapped ZIP 与
CLI production asset groups，并影响 Editor 和 game002 直接 consumer。无需 L3，因为不修改根工具链、
workspace、lockfile，也不是整仓重构或 release。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter game002 typecheck
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli test
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli build
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli lint
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli format:check
git diff --check
```

三 package build 用于验证 rendercore public declarations、Editor bundle 和 CLI 交付物；game002 只需
typecheck 证明直接 consumer API 未破坏，不运行其全量行为测试，因为本任务不修改 game002 业务代码。

### 人工验收

1. 在浏览器创建三条不同有向边，分别选无效果、Spine、视频；每条先选“无 Popup”，确认导出/重导后
   类型和值不漂移。
2. 触发无效果且无 Popup：目标已准备后立即切换，无 overlay/blackout；再配置普通 Spine Popup，确认
   source 保持到完整 end，随后一次原子切换。
3. 对 Spine/video 分别配置和清空 Popup，确认只影响 exact edge；Spine 在 Popup complete 后启动，视频
   在 complete 后明确等待第二次点击，点击时有声 `play()` 成功并按 media-time fade/switch。
4. 切换三种效果类型，确认已选 Popup/order/placement 保留，旧 effect resource 字段不串入新分支；选择
   “无”后完全不弹，也不自动选择资源库中的 Popup。
5. 模拟视频 `play()` 拒绝或在错误 phase 点击，确认 source 状态不半切换、错误可见、可取消/重试且无
   残留 Popup/video presentation。

### 独立验收建议

`建议`。本任务涉及跨 package public contract、正式 schema/ZIP、异步 target transaction、Popup/player
ownership 和浏览器 trusted gesture。独立验收聚焦：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter gamelayouteditor test
pnpm --filter gamelayoutpkgcli test
```

另需独立执行上面的第 2、3 条人工流程；自动化不能替代真实有声视频手势验收。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；当前 shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不新增依赖、不修改 lockfile、不切换 npm/yarn。
- 依赖缺失时仅执行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有实际下载失败后才设置 `http_proxy` / `https_proxy` 为 `http://127.0.0.1:1087` 并重试原命令。

## 10. 生成物、文档与规则

- 本任务没有 YAML 或专用生成文件；`dist/` 只由 package build 生成，不手改、不提交无关构建输出。
- `docs/scene-layout-manifest.md` 必须给出三种 canonical transition 形状、Popup 可选语义、none commit
  和 video+Popup 二次 trusted gesture phase/API。
- `apps/gamelayouteditor/README.md`、`packages/rendercore/README.md`、`apps/gamelayoutpkgcli/README.md`
  分别同步 authoring UI、runtime contract 与 closure/group 行为。
- 更新 `docs/agent-rules/scene-layout.md` 的 directed transition/runtime 媒体合同，并更新
  `docs/agent-rules/editor-artifacts.md` 中仅 Spine edge 可引用 Popup 的旧限制。
- 不修改根 `AGENTS.md`：职责边界未改变，只扩展 scene-layout 领域内稳定合同。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/177-gamelayouteditor-optional-transition-effect-popup-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/实际文件、关键决策和偏差、自动化命令与结果、人工验收状态、剩余风险；除本
计划 L2 证据外不收集整仓 coverage、历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 带 Popup 的有声视频需要第二次用户手势，这是浏览器媒体策略与“Popup 完整 end 后再开始效果”共同
  导致的可见交互；若隐藏该阶段，真实设备可能稳定拒绝播放。
- none 没有 player，若 runtime 把 effect player 与 target transaction 绑定过紧，容易在 cancel/destroy
  或同 symbols binding 路径漏释放；必须用 ownership/failure 测试保护。
- transition union 被 Editor、resource loader、ZIP rewrite 和 CLI 多处结构化访问；任何遗漏都可能造成
  none 导入成功但导出/优化失败，需要 round-trip 与 CLI parity 同时覆盖。

### 假设

- “转场 Popup”沿用当前普通 Spine prelude Popup 的完整 lifecycle，而不是新增转场后 Popup。
- 新建边继续默认 Spine，仅新增可选“无效果”；本任务不改变既有作者工作流默认值。
- 当前 manifest version 1 允许以 strict additive union 扩展；现有合法 Spine/video v1 数据无需迁移。

### 待确认

无。视频二次点击已作为保持现有 strict Popup 与 trusted-click 合同的实现要求，不留给执行会话临时猜测。

## 13. 完成清单

- [ ] 三种效果与可选 Popup 的目标、非目标均满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public union、snapshot/API、strict schema、exact closure 和 ownership 符合计划。
- [ ] none 不含伪资源，video 不使用 autoplay/静音 fallback，缺边不瞬切。
- [ ] Editor/ZIP/CLI 测试、README 和领域规则已同步。
- [ ] 指定 L2 自动化验收已通过，真实浏览器手势验收与自动化明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`docs/agent-rules/scene-layout.md` 和
   `docs/agent-rules/editor-artifacts.md`；
2. 核对 Git 基线、工作区和 Node 24/pnpm 环境；
3. 按计划实现，不重新引入缺边 fallback、video autoplay 或 Popup 并行方案；
4. 当前代码若仅有小幅变化，在报告记录适配；若需变更 schema 形状、Popup 时序、public API、lockfile
   或明显扩大 package/文件范围，先停止并说明；
5. 只运行本计划规定的 L2 验收，失败先定向最小化；
6. 完成后生成 UTC 中文报告，明确未完成的真实浏览器验收；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
