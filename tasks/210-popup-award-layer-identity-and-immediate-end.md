# 210 popup-award-layer-identity-and-immediate-end 任务计划

## 1. 目标与完成定义

### 目标

修正 `award-celebration` Popup 的档位表现、点击结束与图层生命周期：

- 金额进入 `bigwin` 时才启动该档效果；`superwin`、`megawin` 同样只在各自金额档位进入时启动。
- 用户点击正在循环的分段 VNI 后立即从 end 起点继续播放，不等待 loop 再完成一轮；end 与粒子 drain 完成后隐藏，Popup player 保留为可重复使用实例。
- 档位切换时只提交新档画面，旧 `bigwin` 等效果不能继续显示在新档背后。
- Popup Editor 仍按五档分别编辑配置，但跨档相同逻辑图层使用稳定 `id`；rendercore 在核心资源源未变化时复用同一显示/runtime 实例，只应用新档配置。
- 引入最新 canonical Popup 版本；合法 v1–v5 项目先按源版本严格加载，再原子升级，Popup Editor 后续预览与导出统一写最新版。

### 完成定义

- [ ] `base`、`standard` 不会因为其它档位的 VNI 配置或旧全选 `visibleStates` 提前创建可见效果；金额到达每个 celebration threshold 时恰好启动对应档配置。
- [ ] `bigwin -> superwin -> megawin` 每次切换都原子隐藏上一档画面；上一档可在不可见状态完成必要 cleanup，但不能与当前档同时可见。
- [ ] 分段 VNI 在 start/loop 中收到本次 award 的结束请求后，下一次渲染推进直接从 `loopEndTime` 后的 end 范围继续；不等待当前 loop 边界，不重播 start，不跳过 end drain。
- [ ] end 播放期间重复点击不重复发起结束；end 完成后 Popup 隐藏并进入 complete，下一次 `start()` 复用已初始化 player。
- [ ] 新 award schema 以“同一 layer id 跨状态表示同一逻辑图层、每个状态保存独立配置、状态内不存在即不可见”为合同，不再为 award layer 保存跨档 `visibleStates`。
- [ ] 同 `id + kind + core resource` 的 image、text、ImgNumber、Spine、VNI 跨档切换不重建核心 runtime；transform、alpha、order、attachment、playback 与文本配置在状态边界更新。资源源变化时只切换该逻辑图层的已准备变体。
- [ ] `win-amount` 始终是一个稳定逻辑 ImgNumber/runtime 与 string handle；跨档只更新金额、资源绑定与状态配置。
- [ ] 任务 209 已依赖的 exact `PopupStringNodeHandle` identity、persistent `setText/resetText` 语义，以及 Scene Layout awaitable award facade 的完成/立即清理边界保持兼容。
- [ ] 合法 v1–v5 ZIP 导入后得到最新版 Editor project；迁移完整、确定、可复验，导出后再次导入不发生第二次变化。
- [ ] rendercore 与 Popup Editor 的自包含定向测试、类型检查、构建、最小文档和 UTC 执行报告完成。

## 2. 范围

### 包含

- `packages/rendercore/src/popup` 的 versioned award schema/parser/upgrader、状态编译、逻辑 layer slot、VNI immediate end、attachment/display commit、replay/destroy 生命周期。
- `apps/popupeditor` 的最新版 draft、旧版导入升级、五档 layer identity 编辑、预览与最新版 ZIP 导出。
- Popup manifest、RenderCore/Popup Editor README 与两份相关领域规则的最小更新。
- 只使用 package 内自包含 fixture 的 parser/player/UI/round-trip 验证。

### 不包含

- 不修改 Crave、其它游戏 app、Game Layout Editor、Scene Layout、gameframeworks、VNI core、assets、YAML、生产 ZIP 或生成物。
- 不负责把新 Popup 包绑定到最终游戏，不替别人重导 production assets，也不以 production 美术完整性作为本任务 gate。
- 不改变五档顺序、threshold BigInt 比较、金额 formatter、游戏触发时机、普通 Spine Popup 的 start/loop/end 合同、任务 209 的 prelude string scope 或 Scene Layout Popup ownership。
- 不增加通用对象池、并发多个 award Popup、后台预热服务、profiler 指标或基于资源名/路径/hash 猜测逻辑图层 identity。
- 不做整仓、所有游戏或所有资源包回归；Crave 如需参考只读现有调用行为，不纳入修改与验收。

## 3. 制定计划时的基线

```text
UTC: 2026-08-14T06:08:04Z
HEAD: 2bab01380f2129927dd196f26cf7781e35ebcf05
branch: (detached HEAD)
git status --short --untracked-files=all: ?? tasks/210-popup-award-layer-identity-and-immediate-end.md
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
tasks/207-popup-state-aware-layer-backdrop-visibility.md
tasks/207-popup-state-aware-layer-backdrop-visibility-260813-133315.md
tasks/209-rendercore-scene-layout-popup-string-inputs.md
tasks/209-rendercore-scene-layout-popup-string-inputs-260814-060239.md
docs/popup-manifest.md
packages/rendercore/src/popup/{types,award-player,award-sequence,vni-playback,
                               state-visibility}.ts
packages/rendercore/tests/popup/{award-player,vni-playback}.test.ts
apps/popupeditor/{README.md,package.json}
apps/popupeditor/src/{model/project,io/popup-zip,ui/app-shell}.ts
apps/popupeditor/tests/{project,app-shell,preview}.test.ts
packages/vnicore/src/{core/playback-sequence,pixi/vni-player}.ts
packages/vnicore/docs/{api-zh,usage-zh}.md
packages/rendercore/src/scene-layout/{types,package-runtime,presentation-surface}.ts
packages/rendercore/tests/scene-layout/package-runtime-mode.test.ts
docs/crave-scene-layout-popup-inputs.md
```

目标目录没有补充 `AGENTS.md`。当前 worktree 已从任务 208 的 `c99a445` fast-forward
到本机最新 `main` 的 `2bab013`；`origin/main` 在 fetch 后仍停在 `2477905`，本机 `main`
比远端多任务 208/209 两个提交。未跟踪的 210 计划在同步中保持。规划会话未运行构建或测试。
当前结论：

- v5 的 award tier 仍各自拥有 `layers[]`，但每个 layer 默认写入五档全选 `visibleStates`。`DefaultAwardCelebrationPlayer.switchVisibleTiers()` 会扫描所有 tier，只要其中一层声明当前状态可见就启动整个 tier；因此 celebration VNI 会在 `base/standard` 提前启动，也会让旧 tier 留在后续 tier 背后。
- 当前 `TierRuntime` 为五档各创建完整 layer runtime，仅 `win-amount` 有专门的单实例复用；普通 image/text/ImgNumber/Spine/VNI 即使 ID 与资源相同也按档重建。
- tier 切换把 outgoing runtime 放入 `#ending` 并继续显示到 `tierEnded()`；v5 的全状态 gate 又可能把它重新加入 `#showing`，无法保证画面互斥。
- rendercore 已调用 VNI 的 `requestSegmentedPlaybackEnd()`，VNI core 在 active loop 中会把 transport time 直接设为 `loopEndTime`；但 award player 仍有自己的 `isLoopReady()`/tier end 门控，且 start 阶段的 VNI 请求会锁存到 loop start，尚无 popup 级“立即从 end range 开始”的一致合同。
- `PopupEditorProject.tiers` 本来就适合保存五档独立配置；当前 `addLayer()` 却生成带 tier 名的 ID，并给每层默认五档可见，既阻断跨档 identity 复用，也制造两套互相冲突的状态来源。
- `importPopupZip()` 已先执行 source manifest strict parse、closure/prepare，再调用 shared upgrader并 commit Editor project；这是 v1–v5→最新版迁移的唯一合法入口。
- Popup player 本身已可多次 `start()`，没有必要增加池。应保留一个已初始化 player，并把内部 variant cache 限定在 manifest 声明的逻辑图层/资源组合内。
- 任务 209 没有改变 Popup manifest；它在 Scene Layout 上新增普通 Spine prelude 的 per-play
  string scope，并通过 `PopupStringNodeHandle.text/overridden/setText/resetText` 保存、应用和恢复
  exact-name 输入。210 若替换 string node runtime 或 registry target，必须保持 handle 对象与其
  persistent override 状态稳定，不能让跨档 slot 切换使 209 的 snapshot/restore 指向 stale target。
- Scene Layout 已公开 `start/playAwardCelebrationForCurrentMode()`、
  `requestAdvanceAwardCelebration()`、`dismissActiveAwardCelebrationImmediately()` 与 snapshot facade；
  210 只改变其委托 player 的内部表现，不能复制或修改这些 facade。awaitable play 仍应在可见 end
  与 drain 完成、player 进入 complete 后 resolve；immediate dismiss 仍直接清理。

## 4. 需求解释与技术决策

### 需求解释

- “到 bigwin 才播放”以金额阶段进入 `AwardTierId` 的同一原子边界为准。仅属于 `bigwin` 状态的 VNI 不因 package prepare、Popup start、base/standard 计数或别档 layer visibility 而 enter/update/显示。
- `superwin`、`megawin` 与 `bigwin` 使用同一规则：进入状态时启动该状态的 animated config；离开状态时立即撤销其可见提交。
- “点击立即跳 end”指 transport 不等待 start/loop 的剩余部分。end 动画和粒子 drain 仍真实播放；`dismissImmediately()` 继续只是宿主强制清理 API，不替代普通点击。
- “同样的图层”由 exact stable layer `id` 表达，不按 kind、resource key、文件名、order 或“唯一图层”猜测。相同 ID 可在多个状态各有一份配置；不同 ID 即使资源相同也仍是不同逻辑图层。
- “核心 assets 源不变”至少由 `kind + exact resource key` 判定；transform、alpha、order、attachment、VNI/Spine playback、anchor/style/default text 等是状态配置，不因这些字段变化创建第二个核心 player。
- Popup 完整播放结束后隐藏内容但保留已初始化 player/variant cache，下一次播放复用；只有 `destroy()` 释放。没有跨 Popup 或全局 pool。
- 任务 209 的普通 Spine prelude string input 不进入 award v6 schema。210 的 logical slot/variant
  只需保持共享 `PopupStringNodeHandle` 合同；不把 prelude scope、翻译或最终金额字符串搬进 Popup Editor。

### 关键决策

1. **新增 strict Popup v6，修正 award layer 状态模型**
   - v6 的 award 分支继续保存五个 tier 的计数/threshold 与 `layers[]`，但 layer 不再有 award `visibleStates`；所在 tier 就是该配置唯一状态。
   - 相同 layer ID 在不同 tier 重复出现表示同一逻辑 layer slot。parser 要求同 ID 的 `kind` 及稳定语义（例如 string node 的 `name/binding`）一致；resource、transform、style、playback、attachment/order 可按状态不同。
   - v6 Spine Popup 保持 v5 三阶段 `visibleStates`，只随顶层版本升到最新版，不把本次 award 修正扩展成 Spine 重构。
2. **v5 award 的 containing tier 成为迁移权威**
   - v5 的 tier ownership 与跨档 `visibleStates` 已被证明会互相冲突。升级 v5 award 时删除 layer `visibleStates`，只把该配置放在其原 containing tier；不把全选数组复制到其它状态。
   - v1–v4 同样按原 tier 归属迁移。backdrop 的五档 `visibleStates` 仍是合理的全局状态配置，原样保留或按既有规则补齐。
   - 五档 `win-amount` 依据显式 `binding="win-amount"/name="win-amount"` 统一为稳定 ID `win-amount`。其它不同 ID 不推断为同一层。
   - 旧包若在不同 tier 复用了同 ID 但 kind/稳定 string identity 冲突，upgrader 使用确定的 state-qualified 新 ID，并结构化重写该状态内 attachment target，同时向 Editor 显示迁移说明；不静默合并、不拒绝原本合法的旧包。
3. **先编译 state plan，再提交 display tree**
   - rendercore 把 versioned manifest 编译为 immutable `state -> ordered layer configs` 与 `id -> logical slot/variant` 计划；award player 不再以五个可见 Tier Container 作为 lifecycle owner。
   - 每次状态切换先完整解析目标 attachment/order/variant，再一次性隐藏 outgoing、挂载/reconfigure incoming、更新 backdrop/amount/string handles，避免半提交与旧效果露出。
4. **同源复用，换源使用 bounded variant cache**
   - 每个 logical slot 对相同 `kind + resource` 只创建一个核心 runtime；状态切换通过 typed `applyConfig/enter/end` 更新可变配置。
   - resource 变化时使用 `init()` 阶段已准备的 manifest-owned variant，切换时不异步加载、不污染当前画面。cache 只覆盖该 Popup manifest 的明确组合，complete 后保留、destroy 时全部释放。
   - `win-amount` 继续是一个 renderer/container；manual ImgNumber 和命名 text 也保持稳定 node handle，不因切档替换 registry identity。
   - registry handle 本身不得随 variant/state 替换；209 或其它 consumer 保存的 handle 始终委托当前
     slot target，`text/overridden/setText/resetText` 跨状态、complete/replay 维持既有 persistent 语义。
5. **Popup 层实现 VNI immediate end，不修改 vnicore**
   - 为 award runtime 区分 `requestImmediateEnd()` 与普通 completion 查询。分段 VNI 使用 vnicore 已公开的 transport 能力从 exact `loopEndTime` 开始非循环 end range；移除 rendercore 自己等待 `isLoopReady()` 的边界。
   - end range 仍等待 VNI completion/particle drain。once 模式保持现有完整单次语义；static/ImgNumber 无伪 end，Spine 使用自己的 exact end animation。
6. **状态切换与整场 dismiss 使用不同可见策略**
   - tier→tier：outgoing 立即隐藏；能独立 drain 的旧 variant 可在不可见状态 cleanup，同 logical slot 被复用时直接重置并进入新状态，不并行保留旧画面。
   - 最终 dismiss：当前状态保持可见并播放 immediate end；全部 active animated slot 完成后隐藏并 complete。
7. **Editor 显式管理 identity，不按资源猜测**
   - award layer inspector 移除五档 visibility checkbox。活动 tier 只编辑该状态配置。
   - 新建 layer 使用 state-neutral ID；UI 提供“在当前档复用已有逻辑图层”显式选择，复制其稳定 identity 后允许编辑当前档配置。删除只删除当前档配置，最后一个状态配置删除后 slot 才消失。
   - 新建/导入后的 `win-amount` 五档配置共享固定 identity；其它层不因资源相同自动合并。

## 5. 职责与合同

- **模块职责**：Popup Editor 拥有 draft、identity 操作、迁移提示、ZIP IO 与 preview canvas；rendercore 拥有 v6 schema/upgrader、state plan、layer slot/variant、VNI end transport、attachment transaction 与 player lifecycle。
- **数据/API**：v6 award 每个 tier 内 layer ID 唯一；跨 tier 同 ID 的 kind/name/binding 必须一致。presence 表示该状态可见，absence 表示不可见。普通 Spine 的 v5 visibility 合同在 v6 原样延续。
- **现有 consumer API**：`AwardCelebrationPlayer`、`PopupStringNodeHandle` 与 Scene Layout 的 task 209
  request/prelude/award facade 签名不变；v6 是 package data 与内部 player 编译变化，不要求 Scene Layout
  consumer 传新参数或了解 layer slot。
- **资源生命周期**：package resource 继续准备 exact closure；player `init()` 准备 manifest-owned variants，状态切换只 commit 已准备对象；complete 隐藏并保留，replay reset，destroy 幂等释放所有 player/container/attachment/disposer。
- **迁移**：source version strict parse/prepare 成功后才运行 pure v6 upgrader；升级后的 v6 再 strict parse，之后才替换 Editor project。失败不修改当前项目、workspace 或 preview。
- **失败策略**：v6 unknown state/kind/id、同 ID identity 冲突、目标状态 attachment 缺失、资源 kind 不符、variant prepare/commit 失败均显式失败；切换失败保持原状态画面或 fail-stop cleanup，不留下两档同时可见。
- **禁止行为**：禁止继续扫描其它 tier 的 `visibleStates`、按 resource/path/hash 猜 layer identity、为五档复制五个相同 ImgNumber、在 app 复制 popup 状态机、隐藏即 destroy共享 player，或增加全局 pool/fallback。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/award-layer-plan.ts
packages/rendercore/tests/popup/award-layer-plan.test.ts
tasks/210-popup-award-layer-identity-and-immediate-end-<utctime>.md
```

如果 `award-player.ts` 内可保持清晰的单一 owner，可不新增 plan 文件；不得把编译/identity 规则复制到 Popup Editor。

### 预计修改

```text
packages/rendercore/src/popup/{types,manifest,state-visibility,award-player,
                               vni-playback,layer-attachment,index}.ts
packages/rendercore/tests/popup/{manifest,state-visibility,award-player,
                                 vni-playback,layer-attachment,package-resource}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/popup-zip.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/tests/{project,app-shell,preview}.test.ts
apps/popupeditor/README.md

docs/popup-manifest.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

`layer-attachment.ts` 仅在 stable slot 的状态化 remount/原子 commit 需要时修改；`popup-preview.ts` 仅调整最新版 project/status/replay。实际不需要时不为凑范围改文件。

### 原则上不应修改

```text
apps/{game002,game002v2,game003,game003v2,gameviewer,gameviewer2,
      gamelayouteditor,gamelayoutpkgcli}/**
packages/{vnicore,gameframeworks,uiframeworks,logiccore,editorresource,
          browserartifactio}/**
packages/rendercore/src/scene-layout/**
packages/rendercore/tests/scene-layout/**
assets/**
package.json
pnpm-lock.yaml
AGENTS.md
```

执行时若发现现有 vnicore public transport 无法表达 exact immediate end，先报告阻塞与最小证据，不静默扩大到 `packages/vnicore`。

## 7. 实施步骤

1. **确认执行基线并固定缺陷回归**
   - 重新核对 HEAD/status 与 v5 parser/editor/player。
   - 先增加 v5 fixture，证明仅 bigwin tier 配置的 VNI 不得在 base/standard enter，进入 mega 后 bigwin container 不可见，以及点击 loop 后不等待完整 loop。
   - 固定 task 209 后的 public seam：保存 exact string handle 后跨档/complete/replay 仍可读写与 reset，
     award complete 时点仍可供 Scene Layout waiter 消费；不修改 Scene Layout source/test。
2. **建立 Popup v6 与纯升级合同**
   - 在 rendercore types/manifest 定义 v6 union：award layer 用 containing tier + stable ID；Spine 分支延续 v5。
   - 实现 v1–v5→v6 upgrader，删除 award layer visibility、统一 win-amount ID、处理兼容 ID 合并与冲突 ID 的确定性改名/attachment rewrite；用升级后的 strict parser复验。
   - 覆盖 v6 合法跨档配置、同状态重复 ID、跨状态 kind/name/binding 冲突、state-local attachment 和 unknown key/version。
3. **编译 logical slot 与资源 variant**
   - 从五档配置建立稳定 slot/variant/state plan，预计算每状态 order、attachment 与 active set。
   - 将现有 layer runtime 改为可接收当前 typed config；同源应用配置并复用，换源选择 manifest-owned prepared variant。
   - 把 `win-amount`、manual ImgNumber、text handle 纳入相同 identity 规则，保护跨档 text override/reset 与金额连续更新。
4. **重写 award 状态 commit 与结束路径**
   - 用 state plan 替换 `#showing/#ending` 对 tier container 的跨状态扫描。进入 threshold 时才 enter 当前 animated config。
   - tier 切换先隐藏 outgoing，再切换/重配 incoming；hidden cleanup 不再影响 display gate。
   - 最终 dismiss 保持 active end 可见，等待全部 end/drain 后 complete；replay 重置 slot 而不重新 init。
5. **实现 popup VNI immediate end**
   - 让 segmented VNI 从 exact `loopEndTime` 直接启动非循环 end range，覆盖 start/loop 两种点击时点、零长度 loop、粒子 drain 与重复请求幂等。
   - once VNI、Spine、static/ImgNumber 保持各自合同；不修改 vnicore source或普通 Spine Popup状态机。
6. **升级 Popup Editor identity authoring**
   - 将 draft/export 收敛为 v6；award UI 删除 layer `visibleStates`，新增 state-neutral ID 与显式复用已有 logical layer 的操作。
   - 添加/复制/删除/换资源/改 attachment 全部走 clone→validate→commit；当前 tier 配置变化不改其它 tier。
   - `importPopupZip()` 保持 source strict prepare→v6 upgrade→draft commit 顺序，展示必要的 ID 迁移说明；export/reimport 只写稳定 v6。
7. **文档、定向验收与报告**
   - 更新三份 Popup 文档/规则，记录 v6 identity、owner-state visibility、immediate end、reuse/destroy 与旧版升级边界。
   - 按第 8 节运行两个 package 的定向验收，生成简洁 UTC 中文执行报告；不接入游戏或 assets。

## 8. 测试与验收

### 测试原则

- parser/upgrader 只覆盖 version、layer identity、state ownership、attachment 与 canonical round-trip，不重复测试现有 asset hash/ZIP 安全实现。
- player 使用 package 内 fake/self-contained resources，记录 runtime create/init/enter/reconfigure/end/destroy 次数与 container visibility，不读取 Crave 或任一 production asset。
- 阈值测试覆盖 base→standard→bigwin→superwin→megawin、点击跳档和最终 dismiss；断言 VNI enter 的时点与 amount stage 一致。
- reuse 测试覆盖同 ID 同源不重建、同 ID 换源只切 variant、不同 ID 同源不合并、complete→replay 复用、destroy 恰好一次。
- handle 测试保留同一对象引用，覆盖跨档 `setText/resetText`、persistent override、当前 target 切换与
  complete→replay；这直接保护任务 209 的 snapshot/restore 前提，不重复测试 Scene Layout prelude transaction。
- immediate end 测试验证点击后 transport 直接从 `loopEndTime` 进入 end、end/drain 完整结束、重复点击幂等；不以等待 wall-clock 或真实美术肉眼判断代替。
- Editor DOM 测试验证 award 不再显示跨档 visibility checkbox，用户能显式复用 stable ID；Spine Popup 仍显示 start/loop/end visibility。

### 验收级别

`L2`。原因是 rendercore public Popup schema 升为 v6，并由直接 consumer Popup Editor 负责迁移与导出；同时改变 player resource lifecycle。范围只含两个 package 与文档，不升级到整仓或游戏/asset 验收。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/app-shell.test.ts tests/preview.test.ts
pnpm --filter @slotclientengine/rendercore --filter popupeditor build
git diff --check
```

Popup Editor 不运行已知依赖 production Minecart fixture 的无关资源导入测试；若本任务实际修改 `resource-import.ts`，再加入其最小相关用例，不默认扩大全量测试。

### 人工验收

- 在 Popup Editor 新建 award 项目，配置 base/standard 只有 `win-amount`，后三档各有 VNI；预览慢速计数，确认三种效果只在金额进入各自档位时出现，旧档不残留。
- 在 bigwin/megawin loop 中点击，确认画面立即进入 end，end 播完隐藏；Replay 后不重新导入资源且表现一致。
- 导入一个自包含旧 v5 fixture，确认五档层按原 containing tier 显示、stable ID/迁移说明可见，导出 v6 后重导结果不变。

不要求 Crave、production ZIP、assets 或最终游戏人工验收。

### 独立验收建议

`不需要`。本任务虽涉及 public schema 与 lifecycle，但范围被限制为两个本地 package，且没有 credential、服务器数据、production assets 或外部发布；上述定向自动化与一次 Popup Editor 预览足以覆盖本次合同。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 未切换时执行 `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理重试原命令。
- 不预期新增依赖或修改 lockfile；不修改/安装 vnicore。需要扩大依赖或 package 范围时先说明原因。

## 10. 生成物、文档与规则

- 不修改 YAML、assets、production ZIP 或生成文件，不手改 `dist/`。
- 更新 `docs/popup-manifest.md`、两个 package README，明确 v6 award layer identity、state-local config、VNI immediate end、runtime reuse 与 v1–v5 Editor migration。
- 本任务改变稳定 Popup schema/lifecycle，因此最小更新 `docs/agent-rules/{editor-artifacts,shared-game-runtime}.md`；不修改根 `AGENTS.md`，不写游戏专属资源名或任务证据。
- 更新 `shared-game-runtime.md` 时保留任务 209 已加入的 consumer-final string、per-play scope 与
  Scene Layout prelude ownership规则；210 只补 award slot/reuse/immediate-end 合同。

## 11. 执行报告

规划时不生成报告。执行完成后用 `date -u +%y%m%d-%H%M%S` 创建：

```text
tasks/210-popup-award-layer-identity-and-immediate-end-<utctime>.md
```

报告简要记录：

1. v6 最终数据形状、旧版迁移与实际文件；
2. state plan、runtime reuse、immediate end 和生命周期结果；
3. 定向验收结果、未完成人工预览与剩余风险；
4. 任何经说明的计划偏差。

不收集 Crave/其它游戏、production assets、整仓 coverage、历史矩阵或 profiler 证据。

## 12. 风险、假设与待确认

### 风险

- v5 award 的跨档 `visibleStates` 与 containing tier 语义冲突；v6 迁移明确选择 containing tier，会有意修正而非保留 v5 的错误跨档显示结果。
- 同一逻辑层跨状态改变 attachment/order 时必须原子 remount；若先隐藏后新 attachment commit 失败，需保持上一状态或统一 fail-stop，不能留下半挂接节点。
- VNI end range 必须继续遵守 completion/particle drain；仅把采样时间跳到 end 起点，不能把“立即响应”实现成直接 hide/destroy。

### 假设

- 同一时刻每个 `AwardCelebrationPlayer` 最多播放一次 award；现有并发 start 显式失败合同保持。
- Popup package resources 在 player `init()` 时已经本地可用/可准备；状态切换不需要网络 IO。
- 最终游戏接入和 production Popup 重导由其它任务负责，本任务交付共享能力与 Editor authoring。

### 待确认

无。执行时若 vnicore 现有 public transport 无法在不修改 vnicore 的前提下保持 exact end/drain，按文件范围约定报告阻塞，不自行扩大范围。
