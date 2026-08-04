# 161 popupeditor-spine-popup 任务计划

## 1. 目标与完成定义

### 目标

在现有获奖庆祝 `award-celebration` popup 之外，增加 strict 普通 Spine popup。该类型由一套 official Spine 4.3 skeleton JSON、atlas 和全部 atlas page 图片构成，显式配置 `start -> loop -> end` 三个动画：进入时完整播放 start，随后持续 loop 并等待用户点击；点击只登记结束请求，当前 loop 必须播放到下一次真实循环完成边界后才开始 end，end 完成后 popup 才结束并隐藏。

能力由 `packages/rendercore/popup` 统一实现，Popup Editor 负责资源导入、配置和 production ZIP，Game Layout Editor 负责 layout 绑定、placement、预览和 vendoring，游戏通过 scene-layout/gameframeworks 的 typed runtime API 直接使用，不复制 Spine transport、点击状态机或 display tree 操作。

### 完成定义

- [ ] `popup.manifest.json` v1 成为 strict `award-celebration | spine` 判别联合；既有合法 BigWin ZIP 的 parse、播放、导入导出和游戏行为保持不变。
- [ ] Spine popup 只接受一个显式绑定的 official Spine 4.3 root 及其 exact atlas/texture closure，并显式保存 root transform 与大小写精确的 start/loop/end animation。
- [ ] start once 完成后进入 loop；未点击时持续循环。点击后不立即截断当前 loop，而是在下一次 `loopCompleted` 边界启动 end once；end 完成后 snapshot 为 complete 且容器隐藏。
- [ ] start 期间的点击被幂等登记，仍需完成 start 和至少一个完整 loop 周期后再播放 end；重复点击不重播、不跳帧、不叠加 listener。
- [ ] next-spin/宿主 cleanup 可调用幂等 immediate dismiss；prepare、init、update、replace 或 destroy 失败不留下半提交 player、Blob URL、texture 或 display object。
- [ ] Popup Editor 可新建/导入两类项目；Spine 类型可从资源库显式选择一个 skeleton root、三个动画和 transform，使用 production player 预览点击流程，并 ZIP 往返无损。
- [ ] 同批导入 `/Users/zerro/Downloads/minecart2/弹窗` 时识别三个独立 Spine root，并安全共享同一 atlas/PNG leaf；任一 root/atlas/page 失败时整批不修改 workspace。
- [ ] Game Layout Editor 可显式注册一个或多个 Spine popup、配置各 active variant 的 viewport-center `x/y/scale`、使用 production player 预览，并在 layout ZIP 导出/重导后保持 exact closure 与行为。
- [ ] production game 可从 scene-layout runtime 按 id 获取 strict Spine popup player，逐帧 update、转发点击并读取 snapshot；shared code 不硬编码 FreeGame、BonusGame、Compliment 或业务 component。
- [ ] 相关 manifest/README/领域规则、CLI typed graph 和直接 consumer 同步，完成 L2 验收并生成任务 161 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/popup` 的 manifest union、parser、exact closure、resource prepare、普通 Spine player、snapshot 和 lifecycle。
- Popup Editor 的项目类型、资源绑定、动画选择、预览、diagnostics、ZIP import/export，以及多 skeleton root 共享 atlas/texture 的原子导入。
- scene-layout 的 popup binding union、package prepare/runtime、统一 popup layer/update/placement/destroy 和按 id typed access。
- Game Layout Editor 的普通 Spine popup 显式 runtime 注册、placement、preview、layout ZIP vendoring/reimport；popup 内部动画和 transform 保持只读 owner 数据。
- `gamelayoutpkgcli` 对新 popup 类型的结构化图片重写、exact closure 和 asset-group 覆盖；无 mode ownership 的普通 popup 按现有规则归 shared/initial。
- `gameframeworks` 对 production scene-layout/Spine popup public type 的最小 re-export，使后续游戏不必直接依赖内部 package 路径。
- 下载目录三份真实 skeleton 的执行期回归和浏览器视觉验收；自动化测试使用仓库内最小 fixture，不提交约 4.6 MB 的用户 PNG。

### 不包含

- 不修改 Spine skeleton、atlas、贴图、动画内容、关键帧、mix、播放速度或事件；Popup Editor 只选择 exact animation。
- 不给普通 Spine popup 增加 ImgNumber、tier、threshold、金额格式、VNI、图片 layer 或任意脚本时间线。
- 不把普通 Spine popup伪装成只有一个 tier 的 `award-celebration`，也不复用金额点击/advance 状态机。
- 不自动从文件名 `FreeGames`、`BonusGame`、`Compliment` 推导 popup id、animation、game mode、业务用途或触发时机。
- 不在本任务解析 game003 server component、恢复 minecart feature 或新增自动 mode-switch 编排；游戏业务何时启动哪个 popup 由后续 app contract 显式决定。
- 不直接修改 `/Users/zerro/Downloads/**`，不手改 `assets/minecart2` mapped payload/map/generated imports，也不把真实资源复制成测试 fixture。
- 不新增依赖、不修改 lockfile、根工具链或无关 editor/runtime。

## 3. 制定计划时的基线

```text
UTC: 2026-08-04T09:13:58Z
HEAD: e5c7e11f0ffeb649159352f77e46365e77147937
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和计划输入：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
docs/agent-rules/scene-layout.md
docs/agent-rules/game003.md
tasks/templates/task-plan.md
tasks/108-popup-editor-award-celebration-bootstrap.md
tasks/111-gamelayouteditor-popup-game-modes.md
tasks/149-popupeditor-vni-once-playback.md
tasks/157-popupeditor-imgnumber-preview-formatting.md
```

当前实现结论：

- `packages/rendercore/src/popup/types.ts::PopupManifestV1` 固定 `type="award-celebration"`，顶层强制 `amountFormat/awardCelebration`；`manifest.ts::parsePopupManifest()` 无普通 popup 分支。
- `award-player.ts` 已有 award layer 内部的 Spine `Start/Loop/End` adapter，但其退出由 tier 状态机协调，且当前 loop 状态可立即切 end；它不能证明“点击后等待当前 loop 完成边界”，不应作为普通 popup player 直接复用。
- `spine/runtime-player.ts::RendercoreSpinePlayer.update()` 已公开一次性的 `loopCompleted`，足以实现真实 loop boundary，无需修改 spine-pixi 或增加 timer。
- Popup Editor draft 固定五个 tier；Spine importer 已能识别一个 skeleton/atlas closure，但缺真实“三个 JSON 共用一个 atlas/PNG”的保护测试，也没有普通 popup 项目、绑定和 preview。
- `PopupPackageResource`、flatten/mapped ZIP、scene-layout package loader 和 CLI 都假设 nested manifest 是 award；扩展 union 时所有访问 `amountFormat/awardCelebration` 的位置必须先按 `type` 窄化。
- scene-layout `SceneLayoutPopupBinding.type`、`getAwardCelebrationPopup()`、Game Layout Editor mode binding和 asset group kind 均只支持 award。普通 Spine popup 需要独立 typed access，不能塞进 `awardCelebrationPopup`。
- `gameframeworks` 已 re-export scene-layout runtime；只需补齐新增 public player/snapshot 类型，不增加 game-specific facade。

真实输入基线：

```text
/Users/zerro/Downloads/minecart2/弹窗/FreeGames.json    6,680 bytes
/Users/zerro/Downloads/minecart2/弹窗/BonusGame.json   6,061 bytes
/Users/zerro/Downloads/minecart2/弹窗/Compliment.json   9,302 bytes
/Users/zerro/Downloads/minecart2/弹窗/Pop_ups.atlas     2,307 bytes
/Users/zerro/Downloads/minecart2/弹窗/Pop_ups.png       4,588,132 bytes
```

- 三份 skeleton 都声明 Spine `4.3.23`、skin `default` 和 exact animations `End / Loop / Start`。
- atlas 只有 logical page `Pop_ups.png`，三份 skeleton 共享相同 atlas/page closure。
- SHA-256：`FreeGames.json=ea5d3b...546b462`、`BonusGame.json=933028...cd8a20`、`Compliment.json=82e977...8526`、`Pop_ups.atlas=1ab8d7...450ea`、`Pop_ups.png=86dccb...ce39`；执行时重算完整值并记录报告，不用截断值做合同或路径。
- 当前 `assets/minecart2/layout.manifest.json` 只有一个 award popup，FreeGame/BonusGame mode 尚无普通 popup 业务 binding；这与 game003 规则中的“无业务合同不新增 mode-switch 编排”一致。

不需要审计完整 Git 历史；当前 schema、player API、测试和真实资源已足以制定计划。

## 4. 需求解释与技术决策

### 需求解释

- “普通 Spine 弹窗”是独立 popup package 类型，不包含获奖金额或 tier。
- 一个 package 对应一个 skeleton root；共享 atlas 的三个 JSON 可在同一编辑器资源批次共存，但分别导出为独立 popup ZIP。
- “卡循环动画播放到结束的这个点”解释为点击后等待 official Spine player 报告下一次 `loopCompleted`，而不是立即 `setAnimation(end)`、按 duration 计时或 seek 到末尾。
- 游戏等待用户点击期间仍持续调用 `update(deltaSeconds)`，保证 loop 不冻结；点击只调用 player public contract。
- Game Layout Editor 中导入 dependency 不等于启用。award popup 继续由 mode 的 `awardCelebrationPopup` 显式引用；普通 Spine popup 通过独立“注册为程序 popup”动作进入 layout 根 `popups`，未注册 dependency 不导出。

### 关键决策

1. **保持 version 1，扩展 strict 顶层判别联合**

   ```ts
   type PopupManifestV1 =
     | AwardCelebrationPopupManifestV1
     | SpinePopupManifestV1;

   interface SpinePopupManifestV1 {
     readonly version: 1;
     readonly kind: "popup";
     readonly id: string;
     readonly type: "spine";
     readonly designViewport: PopupSize;
     readonly resources: Readonly<Record<string, PopupResourceSpec>>;
     readonly spine: {
       readonly resource: string;
       readonly transform: PopupTransform;
       readonly playback: {
         readonly mode: "segmented-animations";
         readonly startAnimation: string;
         readonly loopAnimation: string;
         readonly endAnimation: string;
       };
     };
   }
   ```

   `spine.resource` 必须引用 `kind="spine"`，三个动画必须非空、互异且存在。普通类型禁止 `amountFormat/awardCelebration`，award 类型禁止 `spine`；所有 resources 必须被引用，unknown key/类型/version 显式失败。既有 award canonical JSON 不改字段或默认值。

2. **新增独立 `SpinePopupPlayer`，只复用 official Spine leaf player**
   - public contract 提供 `container/init/start/update/requestDismiss/dismissImmediately/getSnapshot/isPlaying/destroy`。
   - snapshot 的 phase 为 `idle | start | loop | end | complete`，另带 `dismissRequested`；不把等待 loop boundary 伪造成新的 Spine animation。
   - start 期间点击先 latch；start 完成后必须启动 loop，第一次 `loopCompleted` 才进 end。loop 期间点击等待下一次 `loopCompleted`。未点击的 loop 永不自然完成。
   - `start()` 在 active 时显式失败；重复 dismiss 幂等；immediate dismiss 同步隐藏并 complete；restart 从 start 重置所有 flag。
   - award player 保持现有点击/tier 行为，不为统一接口而改变其时间线。

3. **Popup Editor 使用判别式 project，而不是给五档 UI 加条件补丁**
   - draft/import/clone/export 按 `type` 分支；新建项目必须明确选“获奖庆祝”或“普通 Spine”。不静默转换已打开项目。
   - 普通 Spine workspace 只显示 resource、start/loop/end dropdown、root `x/y/scale`、design viewport 和 production preview controls。
   - skeleton 上传只入资源库；用户显式绑定 root 和每个 animation。dropdown 候选来自 validated metadata，不猜首项、不因名字恰好是 Start/Loop/End 自动提交。
   - 多 root 共享 leaf 复用 editorresource 的 same-key/same-bytes 去重；每个 root 保持独立 owner reference，最后一个 owner 解除后 leaf 才 GC。

4. **Scene Layout 对两类 popup 做 typed union，不引入业务自动触发**
   - `SceneLayoutPopupBinding.type` 扩成 `award-celebration | spine`，nested manifest id/type 必须与 binding 精确一致，placement 合同仍只有 viewport-center `x/y/scale`。
   - package runtime 在统一 popup layer 中准备、update、placement 和 destroy 两类 player；保留 `getAwardCelebrationPopup(id)`，新增 `getSpinePopup(id)`，错误类型或未知 id 精确失败。
   - Game Layout Editor 用独立注册集合决定哪些 Spine popup 进入 root `popups`；不绑定 mode、不自动播放。游戏业务按 manifest id 选择并调用 typed player。
   - 普通 popup 没有 mode ownership，因此 optimizer 按既有规则归 shared/initial；不猜 FreeGame/BonusGame owner。未来若需 mode-owned lazy group，由独立 schema 任务定义。

5. **真实资源用于验收，不成为隐式 production 配置**
   - 自动测试以最小 official Spine fixture/fake leaf player锁定状态机、parser、rollback 和 round-trip。
   - 执行时用下载目录完整五文件验证三个 root 的 atomic review、共享 leaf、显式 animation binding、两级编辑器 ZIP 往返和真实 Pixi preview。
   - 本任务不生成或提交 minecart2 production layout；资源正式进入 `assets/minecart2` 需要后续明确的业务触发、Layout 编辑/优化和 generated parity 任务。

## 5. 职责与合同

- **rendercore popup parser/resource**：拥有 manifest union、strict validation、exact closure、animation introspection、prepare/rollback/destroy。
- **rendercore SpinePopupPlayer**：拥有 start/loop/end transport、click latch、loop boundary、snapshot、immediate cleanup 和 display lifecycle。
- **Popup Editor**：拥有 browser draft、资源 review、显式 binding、表单、preview 和 standalone ZIP；不直接操作 Spine state tracks。
- **scene-layout runtime**：拥有 nested package prepare、统一 popup presentation layer、variant placement、update 和 typed player lookup。
- **Game Layout Editor**：拥有 dependency library、显式 production 注册和 placement；nested popup manifest/资源/动画只读。
- **gamelayoutpkgcli**：拥有 typed nested reference rewrite、WebP 后处理、map/hash/path/orphan 复验和 asset-group coverage；不得扫描任意 JSON 字符串。
- **gameframeworks/game app**：facade 暴露通用类型；app 只决定业务触发 id、转发点击和阻塞边界，不复制 player。
- **资源生命周期**：导入与 package prepare 先完成全部 root/atlas/page/animation 校验再 commit；任一失败回滚。player/container 归 runtime，atlas texture/URL 归 package resource，borrowed scene layer 不由 app destroy。
- **失败策略**：未知 type/mode、错误字段、缺 root/atlas/page、Spine 非 4.3、动画缺失/重名、type mismatch、orphan、坏 hash/size/path、并发 start 和 destroyed-after-use 全部显式失败。
- **禁止行为**：不猜路径/动画/首项/mode，不加 wall-clock timer、seek、静态首帧或 immediate end 降级，不维护第二份资源表，不硬编码游戏名。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/spine-player.ts
packages/rendercore/tests/popup/spine-player.test.ts
tasks/161-popupeditor-spine-popup-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/{types,manifest,package-resource,index}.ts
packages/rendercore/tests/popup/{fixtures,manifest,package-resource}.test.ts
packages/rendercore/src/scene-layout/{types,manifest,package-resource,package-runtime,presentation-surface,template-presentation}.ts
packages/rendercore/tests/scene-layout/{manifest,package-resource,package-runtime,presentation-surface}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/{resource-import,popup-zip}.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/styles.css
apps/popupeditor/tests/{project,resource-import,preview,app-shell}.test.ts
apps/popupeditor/README.md

apps/gamelayouteditor/src/model/{editor-project,game-mode-commands,validation}.ts
apps/gamelayouteditor/src/io/{imported-popup-package,imported-layout-zip,exported-layout-zip}.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/{app-shell,project-workspace,bigwin-workspace}.ts
apps/gamelayouteditor/tests/{popup-package,zip-io,layout-preview,validation,app-shell}.test.ts
apps/gamelayouteditor/README.md

apps/gamelayoutpkgcli/src/{types,asset-groups,reference-rewriter}.ts
apps/gamelayoutpkgcli/tests/{asset-groups,reference-rewriter,package-flow}.test.ts
apps/gamelayoutpkgcli/README.md

packages/gameframeworks/src/index.ts
packages/gameframeworks/src/scene-layout-template/index.ts
packages/gameframeworks/tests/scene-layout-template.test.ts
docs/{popup-manifest,scene-layout-manifest}.md
docs/agent-rules/{editor-artifacts,shared-game-runtime,scene-layout}.md
```

文件名可按当前模块边界小幅调整；若 `bigwin-workspace.ts` 已不适合承载通用 popup，可新增最小 `popup-workspace.ts` 并在报告说明，而不是继续扩大 award 专属命名。

### 原则上不应修改

```text
packages/rendercore/src/spine/**
packages/vnicore/**
packages/logiccore/**
packages/editorresource/**
apps/game002/**
apps/game003/**
assets/**
apps/gamelayouteditor/scripts/build-task*.ts
pnpm-lock.yaml
AGENTS.md
```

若真实 `loopCompleted` 不能满足边界，先用最小复现说明 leaf API 缺口；不得在 popup player 读取 spine-pixi private state。若要写入 minecart2 production 或新增 game business trigger，必须先停止并说明范围扩张。

## 7. 实施步骤

1. **确认执行基线和真实资源**
   - 重核 HEAD/status、计划、三份领域规则、game003 规则和当前 public API。
   - 重算五文件完整 SHA-256，使用 importer 只读 discovery 验证三个 skeleton、共享 atlas/page、4.3.23 和 Start/Loop/End；此时不提交 editor project 或仓库资源。

2. **建立 Popup manifest union 与 package resource**
   - 拆出共享 manifest base 和两个 strict subtype；保留 `PopupManifestV1` public union及既有 award canonical output。
   - 让 direct/mapped closure、flatten/rewrite、files/CDN loader 和 animation validation 按 type 分支；Spine subtype只接受一个已引用 resource。
   - 覆盖 award parity、unknown/cross-type fields、type/resource mismatch、缺 animation/page、mapped round-trip、prepare failure rollback 和 idempotent destroy。

3. **实现普通 Spine player**
   - 基于 `createOfficialSpinePlayer()` 实现明确 phase、dismiss latch 和 `loopCompleted` boundary，不改 leaf runtime。
   - 覆盖自然 start->loop、无限等待、loop 点击、start 提前点击、重复点击、end completion、restart、concurrent start、immediate dismiss、update error 和 destroy。
   - 验证容器 transform、visible 和 listener/player ownership，不让 complete 后 display 残留。

4. **扩展 Popup Editor**
   - 把 project/store/manifest 转换改成 type union；保留 award project import/export 和现有 VNI/ImgNumber行为。
   - 为 Spine project 增加显式 root/animation/transform 编辑和 diagnostics，预览调用 production player。
   - 让 importer 对多 skeleton 共享 atlas/page 一次 prepare/review/commit，same bytes leaf 只存一份；删除/替换/GC 保持 root ownership。
   - ZIP import/export按 type 恢复完整 draft；未知类型或 type-specific 字段不自动迁移。

5. **接入 scene-layout 和 Game Layout Editor**
   - 扩展 binding union、nested type parity、runtime player map、统一 placement/update/destroy 和 `getSpinePopup(id)`。
   - Game Layout Editor 导入后不自动启用；提供显式注册/取消、variant placement、production preview 的 Play/Click/Immediate cleanup。
   - export 只 vendor mode 引用的 award popup与显式注册的 Spine popup；reimport 恢复两类 dependency、注册、placement 和 bytes，未启用 dependency 排除。

6. **同步 optimizer 和游戏 facade**
   - CLI 对 Spine popup nested manifest/atlas/texture 做 typed rewrite 和完整 map复验；asset groups 增加严格 `spine-popup` group并纳入 initial/shared coverage，既有 award group JSON 不改变。
   - gameframeworks re-export新增 player/snapshot类型；template inspection 把“只有 award popup”的提示改成按 union 分类，不增加自动触发。
   - 用最小 consumer test证明游戏可从 layout runtime 精确获取、start、update、click和读取 complete。

7. **文档、真实浏览器验收与收尾**
   - 更新两份 manifest 文档、三个 README 和三份最小领域规则；不改根规则或 game003 业务规则。
   - 在 Popup Editor 导入真实五文件，分别构建 FreeGames/BonusGame（Compliment 只需验证可独立绑定），目视确认点击等待 loop 边界后播放 End。
   - 在 Game Layout Editor 导入至少两个 ZIP，显式注册、placement、preview、导出/reimport；不写入 `assets/minecart2`。
   - 运行 L2 命令并生成 UTC 中文报告，记录未完成人工项和任何小幅文件范围偏差。

## 8. 测试与验收

### 测试原则

- parser 覆盖两类正常路径、cross-type unknown fields、strict resource/animation/closure failure 和 award byte-equivalent canonical parity。
- player 以 leaf fake 精确发出 completed/loopCompleted，证明点击发生在 loop 中段时不会立即 end，并证明 start 期间点击仍至少经过一个完整 loop。
- importer 覆盖三个 JSON 共享一个 atlas/PNG、相同 leaf 去重、不同 root identity、partial/malformed batch 全回滚，以及最后 owner 删除才 GC。
- layout/CLI 覆盖两类 popup 共存、错误 nested type、未注册排除、注册 Spine popup vendor一次、ZIP round-trip、WebP rewrite 和所有 optimized assets 被 group 覆盖。
- cleanup 覆盖 package prepare、preview rebuild、replace、reimport、runtime destroy 中的 texture、URL、player 和 borrowed container ownership。

### 验收级别

`L2`。任务修改 rendercore popup/scene-layout public API、versioned manifest union、正式 ZIP、optimizer asset-group schema，并影响 Popup Editor、Game Layout Editor 和 gameframeworks 直接 consumer；需要直接依赖链验收，但不涉及根工具链、lockfile或 release，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks format:check
git diff --check
```

若执行实际修改 `assets/minecart2`（计划默认禁止），必须先获准扩大范围，并追加 `pnpm --filter game003 check:resources`、game003 test/typecheck/release checker；不能事后仅在报告中补写。

### 人工验收

1. `pnpm --filter popupeditor dev`，一次选择下载目录五文件；review 显示 3 个 Spine root、共享 1 atlas/1 texture，无 orphan/重复冲突。
2. 新建 Spine popup，显式绑定 `FreeGames.json` 和 `Start/Loop/End`，播放后等待至少两个 loop；在循环中段点击，确认当前 loop 到边界才进入 End，完成后隐藏。start 尚未完成时点击也必须先完成 start + 一个 loop。
3. 导出/reimport FreeGames、BonusGame 两个 popup ZIP，重复播放并核对 animation/transform/design viewport。
4. `pnpm --filter gamelayouteditor dev`，导入两个 ZIP；确认未自动注册。显式注册、设置 landscape/portrait placement并在 production preview 点击完成。
5. 导出/reimport layout ZIP，确认两套共享来源已各自形成自包含 popup dependency、placement和行为无损；未注册的 Compliment 不进入 ZIP。

### 独立验收建议

`必须`。本任务涉及跨包 public contract、versioned Popup/Layout ZIP、resource ownership、异步 prepare/rollback/destroy 和 loop-boundary 交互。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor test
pnpm --filter gamelayoutpkgcli test
git diff --check
```

并由独立验收者至少目视一次真实 FreeGames 点击发生在 loop 中段时的边界行为。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm 10；shell 未加载 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只运行 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库约定代理重试原命令。
- 预计不新增依赖、不修改 lockfile。official Spine、Pixi、editorresource、browserartifactio 和 ZIP 能力均已存在。
- 下载目录只作为本机执行期真实输入；CI 自动测试不得依赖该绝对路径。

## 10. 生成物、文档与规则

- 本任务默认不修改 mapped production assets 或 generated TypeScript；所有测试 ZIP 在内存创建，不提交外部 PNG。
- 更新 `docs/popup-manifest.md` 的两类 canonical schema、播放状态机与兼容边界；更新 `docs/scene-layout-manifest.md` 的 binding union、显式注册和 typed game API。
- 更新 Popup Editor、Game Layout Editor、RenderCore、CLI README 的工作流和严格失败说明。
- 更新 `editor-artifacts.md`，移除“Popup Editor 只输出 award-celebration”的旧限制；更新 `shared-game-runtime.md` 和 `scene-layout.md` 的普通 Spine popup ownership、loop boundary、programmatic binding和禁止 app 复制状态机规则。
- 不把真实文件名、hash、动画时长或任务结论追加到根 `AGENTS.md`；精确执行证据只写任务报告。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/161-popupeditor-spine-popup-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录实际修改、manifest/API决定、真实输入完整 hash、自动化命令结果、浏览器验收、计划偏差和剩余风险，不收集无关全仓 coverage或历史矩阵。

## 12. 风险、假设与待确认

### 风险

- 用户点击可能与一个大 `deltaSeconds` 内的 loop completion 同帧；player 必须以 leaf 返回的 occurrence 决定边界，不能因帧步长直接跳过 End 启动条件。
- 多 skeleton root 共享 rewritten atlas key 时，replace/keep-both/GC 可能错误转移 leaf ownership；需要 transaction 和引用计数回归。
- 把 `PopupManifestV1` 从 interface 改为 union 会暴露大量未窄化访问；必须同步全部直接 consumer，不能用可选链掩盖类型错误。
- CLI asset-group v1 新增 union member必须保持旧 award JSON可 parse；不能把旧 kind 静默重命名。
- 真实视觉节奏、Spine texture load 和浏览器点击只能由真实 Pixi/GPU验收，单测 fake不能替代。

### 假设

- official Spine leaf player 的 `loopCompleted` 每完成一个 loop 产生一次，并在单次 update 后清空；当前实现和测试已有证据。
- 三份真实 skeleton 的 Start/Loop/End 是用户希望绑定的动画，但 editor仍要求显式选择，不把该命名写成 schema 默认。
- 普通 popup 的业务触发与 mode ownership尚未定义，因此任务只提供 programmatic id binding和 typed player，不自动切换模式或提交 minecart2 production。

### 待确认

无。若执行目标改为“同时把 FreeGames/BonusGame 接入 game003 真实服务器 round”，这属于新的业务 contract和 production资源发布范围，必须先补充协议样例、触发顺序和 mode transition决定后重新评估。

## 13. 完成清单

- [ ] `award-celebration` 与 `spine` 目标/非目标均满足，旧 award 行为无回归。
- [ ] manifest、public API、职责和 resource lifecycle 符合计划。
- [ ] 点击 latch、真实 loop boundary、End completion和 immediate cleanup受自动测试保护。
- [ ] 多 root 共享 atlas/texture 导入、GC、ZIP 和 layout vendoring受测试保护。
- [ ] Popup Editor、Game Layout Editor、CLI、gameframeworks、文档和规则已同步。
- [ ] 指定 L2 自动化、真实浏览器验收和独立验收已明确记录。
- [ ] 实际修改未超范围，或执行前已停止并获得新指示。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的四份领域规则和本计划；
2. 核对 Git 基线与下载目录真实输入，不修改外部资源；
3. 先保护 manifest/player合同，再接 editor/layout/CLI/game facade，不重写另一套方案；
4. 小幅适配当前文件结构时在报告记录，public schema、production资产或业务触发扩张时先停止说明；
5. 只运行计划规定的 L2 验收，真实浏览器项与自动化分开记录；
6. 完成后生成任务 161 UTC 中文报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
