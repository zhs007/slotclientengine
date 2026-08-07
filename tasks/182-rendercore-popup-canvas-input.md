# 182 rendercore-popup-canvas-input 任务计划

## 1. 目标与完成定义

### 目标

修复 Scene Layout 转场前 Popup 在 game002 与 Game Layout Editor 中点击经常无效的问题。Popup
处于可交互阶段时，整个可见 canvas 都应成为稳定的主操作区域：任意位置一次真实
`pointerdown`，或浏览器窗口聚焦时任意一次真实、非 repeat 的 `keydown`，都执行当前 Popup
阶段唯一合法的主操作。

输入路由由 `packages/rendercore` 统一拥有，不依赖具体 Popup 美术的透明区域、Pixi display tree
命中顺序或游戏业务判断。game002、Game Layout Editor 和 Popup Editor 只绑定 canvas/keyboard
宿主并报告错误，不复制 prelude、award、video 或 Popup start/loop/end 阶段状态机。

### 完成定义

- [ ] game002 使用当前 `assets/crave` package 时，BaseGame → FreeGame 的 `fg` 与 FreeGame →
      BaseGame 的 `congratulations` 转场前 Popup 可在 canvas 任意位置点击结束，也可按任意键结束。
- [ ] Game Layout Editor 的组合 preview 中，即使点击位置上方有 guides、selection、symbol 或其它
      Pixi overlay，canvas 任意位置仍能触发转场前 Popup；任意键具有相同行为。
- [ ] Popup Editor production preview 同样复用共享输入绑定：award Popup 执行 advance，普通 Spine
      Popup 锁存 dismiss，不再只能依赖 Inspector 按钮。
- [ ] Scene Layout 当前主操作严格按 runtime phase 分派：prelude `popup` 请求 dismiss，award
      celebration 请求 advance，`awaiting-video-start` 在原始 trusted pointer/key 调用栈中同步调用
      `play()`；idle 或其它 transition phase 不消费输入。
- [ ] 一次 native 输入最多执行一次主操作；不得因 canvas DOM listener 与 Pixi federated event 同时
      到达而双 advance、跳过 Popup 档位或重复启动视频。
- [ ] 输入绑定、异步错误处理、解绑和 destroy 闭合；runtime/preview 重建后不遗留 window/canvas
      listener，也不把旧 runtime 作为新输入目标。
- [ ] 现有 Inspector 显式按钮继续可用，但委托同一 rendercore 主操作合同；现有 Popup 动画、资源、
      manifest/schema、placement/order、转场顺序和 award 金额行为保持不变。
- [ ] 定向自动化验收通过，并完成 game002、Game Layout Editor、Popup Editor 的真实浏览器人工验收
      交接；执行会话生成 UTC 中文报告。

## 2. 范围

### 包含

- `packages/rendercore/popup` 的可复用 canvas pointer + keyboard 输入绑定、同步 handled 结果、异步
  completion/error 与 disposer 生命周期。
- `packages/rendercore/scene-layout` 的单一 Popup 主操作分派、DOM 输入绑定与 presentation surface
  转发；保留未接入新绑定 consumer 的现有 Pixi pointer 兼容路径。
- `apps/game002` 将 canvas/keyboard 绑定到 shared Scene Layout surface，并移除只认识 win-amount
  的重复 pointer listener。
- `apps/gamelayouteditor` 的组合 preview 输入接入，以及 Inspector 按钮改为调用统一主操作入口。
- `apps/popupeditor` production preview 接入相同基础绑定。
- 直接保护真实 DOM 事件、phase 分派、trusted gesture、双触发抑制和 destroy 的测试与最小文档/规则。

### 不包含

- 不修改 `assets/crave` 或其它美术、layout manifest、Popup ZIP、Symbols ZIP、YAML、生成物或 schema。
- 不改变普通 Spine Popup 的 start/loop/end animation、点击锁存边界、prompt、placement、order 或资源。
- 不改变 award celebration 的 tier、金额、advance/dismiss 语义；不把一次输入解释成连续跳过多档。
- 不新增鼠标手势、长按、双击、触屏滑动、手柄、全局快捷键配置或可重映射 key map。
- 不让键盘输入在 Popup idle 时控制游戏或编辑器，也不接管 Spin、reel、canvas selection/drag 等输入。
- 不迁移 game003 的现有 award listener，不修改 Game Viewer/local flow；共享 API 保持 additive，后续
  consumer 可独立接入。
- 不新增依赖、不修改根工具链、workspace、lockfile，也不顺手重构 Scene Layout/Popup 状态机。

## 3. 制定计划时的基线

```text
UTC: 2026-08-07T08:09:49Z
HEAD: 228097c50cba00eca583065560488d85891b4252
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与输入：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{game002,shared-game-runtime,loading-ui,scene-layout,editor-artifacts}.md
```

目标目录不存在补充 `AGENTS.md`。当前实现结论：

- `assets/crave/layout.manifest.json::gameModes.transitions` 已为 BaseGame → FreeGame 配置 `fg`、为
  FreeGame → BaseGame 配置 `congratulations`；本任务不是补 manifest。
- `package-runtime.ts::#onPopupPointerDown()` 已包含 prelude/award/video 分派，但只由 Popup root 的
  Pixi `pointerdown` 触发；viewport `Rectangle` hit area 仍受 display-tree hit testing 约束，且没有键盘合同。
- runtime tests 只对 borrowed Popup container `.emit("pointerdown")`，没有让真实 canvas dispatch native
  event，未覆盖 overlay、reparent 或 DOM/Pixi 双分派。
- LayoutPreview 把 runtime 放在 stage index 0，后面叠加 symbol/guides/selection；只有 selection 明确
  `eventMode = "none"`。Inspector 还分别调用 dismiss/video API 并自己判断 `transitionPhase`。
- game002 canvas listener 只调用 win-amount advance，prelude 仍依赖 Pixi；presentation surface 未公开
  统一 interaction。PopupPreview 也只有按钮调用的 `advance()` / `dismiss()`。
- 规则与 README 当前写为 viewport hit area + Pixi pointer，需要同步为 canvas DOM + keyboard binding，
  同时明确 Pixi fallback。规划会话未安装依赖、构建或测试。

## 4. 需求解释与技术决策

### 需求解释

- canvas 指实际 Pixi canvas box，不要求命中 Popup 美术，也不受透明像素或任何 overlay hit-test 影响。
- 任意键指 Popup 可交互期间、窗口聚焦时任意一次 native `keydown`，不设 Enter/Space 白名单；repeat
  不连续推进。只有同步确认 `handled` 才拦截事件，idle 完全透传。
- rendercore 提供所有 editor 可复用的 binding；本任务接入实际有 Popup preview 的 Game Layout Editor
  与 Popup Editor。Inspector 按钮作为可访问性/诊断入口保留。

### 关键决策

1. **在 rendercore/popup 建立共享 native input binding**
   - 新增 browser-only helper（暂称 `bindPopupInteractionInput`），显式接收 canvas、keyboard target、同步
     dispatch 和 error callback；canvas 用 capture `pointerdown`，keyboard target 由宿主提供。
   - dispatch 同步返回 `handled`，可携带已启动 completion。只在 handled 时阻止后续路径并立即观察
     rejection；disposer 幂等移除 listener，不保存进程级 active player。

2. **Scene Layout runtime 是阶段分派的唯一 owner**
   - 增加单一 public 主操作入口，收敛 prelude dismiss、award advance、pending video start；明确返回
     handled。video 必须在同步调用内先执行 `play()`，再返回 completion。
   - unknown/idle 不猜动作；lifecycle error 与 play rejection 交给 binding error reporter。

3. **显式 DOM binding 取代已接入 consumer 的 Pixi hit-test 依赖，同时保持兼容**
   - runtime 最多拥有一个 binding；重复绑定失败，dispose/destroy 解绑。绑定时关闭 Popup-root Pixi
     fallback，解绑后恢复，避免双消费并兼容未迁移 consumer。
   - placement/order/container 不变，不用透明 Graphics、zIndex 或 overlay eventMode workaround。

4. **trusted video 与普通 Popup 共用输入入口**
   - prelude 首次输入只锁存 end；video complete 后仍等待下一次 pointer/key 同步开始有声媒体。
   - 不自动播放、预播、静音或跨 phase 缓存 gesture；keydown user activation 必须人工验收。

5. **consumer 只负责宿主绑定和错误呈现**
   - game002 surface 绑定 app canvas/window，并删除 win-amount 专用 pointer listener。
   - LayoutPreview 绑定当前 runtime，Inspector 按钮委托统一入口；PopupPreview 用 popup-level helper 适配
     当前 production player。rebuild/clear/destroy 均不得残留旧 target。

6. **不扩张数据和资源合同**
   - 只改变 runtime input transport/public API；不改 manifest、package、asset map/ZIP、资源 closure、
     placement/order、game002 operation 或依赖。

## 5. 职责与合同

- **popup input**：拥有 native listener、handled gating、单次同步 dispatch、rejection 转发和 disposer；不认识
  mode、Popup id 或游戏组件。
- **Scene Layout runtime/surface**：runtime 拥有 phase/action、Pixi fallback 与 binding，surface 只转发。
- **host**：只提供 canvas、keyboard target 与 error reporter，不选择 dismiss/advance/video phase。
- **输入/lifecycle**：每个 event 至多一个 handled action；idle 透传。rebuild、mount failure、destroy 清理
  disposer，completion 立即接 catch，旧 generation 不回写新 preview。
- **失败/禁止**：duplicate bind、destroyed runtime、play rejection、handler throw 显式报告；禁止 app/editor
  状态分派、全局 active runtime、永久 listener、hitArea workaround、重复 advance 或 autoplay fallback。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/input-binding.ts
packages/rendercore/tests/popup/input-binding.test.ts
tasks/182-rendercore-popup-canvas-input-<utctime>.md
```

若共享 helper 与现有 popup types/tests 合并更清晰，可不单独新增测试文件，但必须保持职责与覆盖等价。

### 预计修改

```text
packages/rendercore/src/popup/{types,index}.ts
packages/rendercore/src/scene-layout/{types,package-runtime,presentation-surface}.ts
packages/rendercore/tests/scene-layout/{package-runtime-mode,package-runtime-video,package-runtime,presentation-surface}.test.ts
packages/rendercore/README.md
apps/game002/src/{game-adapter,scene-layout-presentation}.ts
apps/game002/tests/{game-adapter,scene-layout-presentation}.test.ts
apps/game002/README.md
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/tests/{layout-preview,app-shell}.test.ts
apps/gamelayouteditor/README.md
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/tests/preview.test.ts
apps/popupeditor/README.md
docs/scene-layout-manifest.md
docs/agent-rules/{scene-layout,shared-game-runtime,editor-artifacts}.md
```

若 public export 由既有 barrel 自动覆盖，则不为机械对称修改无关 `src/index.ts`。README 只更新实际改变的
输入 workflow；game002 README 若现有金额点击说明无需改文案，可在报告说明未修改。

### 原则上不应修改

```text
assets/**
apps/game003/**
apps/{gameviewer,gameviewer2,imgnumbereditor,symbolseditor}/**
apps/popupeditor/src/model/**
packages/rendercore/src/popup/{award-player,spine-player}.ts
packages/{logiccore,gameframeworks,uiframeworks,vnicore}/**
pnpm-lock.yaml
package.json
AGENTS.md
```

如果实现发现必须改变 Popup player lifecycle、manifest/schema、gameframeworks public facade 或 game003
consumer，属于明显范围扩大，必须先说明原因，不能只为接 listener 顺手修改。

## 7. 实施步骤

1. **确认执行基线并冻结复现**
   - 重新记录 HEAD/status，核对 crave 两条 prelude 边、package runtime pointer handler、Editor stage
     layering 与 game002 独立 award listener仍与计划一致。
   - 先补失败测试：native canvas pointer 在 display-tree hit-test 无法到达时仍应处理；native keydown 应
     处理；同一 pointer 不能同时走 DOM binding 与 Pixi fallback。

2. **实现共享 Popup native input binding**
   - 在 rendercore/popup 定义 dispatch result、binding options 和 disposer，注册 canvas capture
     `pointerdown` 与显式 keyboard target `keydown`。
   - 仅 handled 时 prevent/stop；过滤 repeat 造成的重复推进，保留真实 key 值无白名单；同步捕获 throw，
     立即观察 completion rejection。
   - 测试 pointer/key、idle passthrough、repeat、handler throw、async rejection、dispose 幂等和 dispose
     后无回调。

3. **收敛 Scene Layout 主操作与兼容路径**
   - 把 `#onPopupPointerDown` 改为调用统一主操作，新增 package runtime bind API；prelude、award、
     awaiting-video-start 使用相同 dispatcher。
   - binding active 时禁用 Pixi pointer fallback，解绑时恢复；确保 applyViewport/applyArtSpace、Popup
     visibility 与 hit area 不再决定 bound canvas 是否可操作。
   - 覆盖错误 phase、重复输入、Popup complete 边界、第二次 video gesture、play rejection、unbind 与
     runtime destroy。

4. **转发 presentation surface 并接入 game002**
   - surface additive 暴露 bind/primary-action，不改变 container 或 player ownership。
   - game002 mount 成功后绑定 exact app canvas/window；mount failure 与 destroy 统一 dispose。
   - 删除 `requestWinAmountAdvance` 专用 listener/字段，验证 shared dispatcher 同时驱动 award advance 与
     FreeGame 双向 prelude，不改变 round operation 顺序。

5. **接入 Game Layout Editor**
   - LayoutPreview 建立一次 shared binding，动态路由到当前 package runtime；plain layout/idle 返回
     unhandled，setLayout/clearRuntime/destroy 不泄漏旧引用。
   - Inspector 显式动作委托 unified primary action；保留当前 label、disabled 状态、transition monitor 与
     external error UI，不再直接选择 dismiss/video API。
   - 测试 canvas 上方存在 editor overlay 的场景、window keydown、runtime rebuild、idle passthrough、
     Inspector button parity 和 destroy cleanup。

6. **接入 Popup Editor**
   - PopupPreview 使用同一 helper；playing award 调用 `requestAdvance()`，playing Spine 调用
     `requestDismiss()`，无 player/idle 返回 unhandled。
   - 保留原显式 advance/dismiss controls；验证 rebuild 后输入指向新 player，clear/destroy 后无 listener
     或 late action。

7. **同步文档与稳定职责边界**
   - 更新 RenderCore、Game Layout Editor、Popup Editor README 与 Scene Layout manifest 文档，说明完整
     canvas + 任意 key、idle passthrough、trusted video 和 host binding 生命周期。
   - 将 `scene-layout.md` 的 Pixi-only hit-area 规则改为共享 DOM binding 为正式入口、Pixi 为兼容路径；
     在 shared runtime/editor artifacts 只记录稳定 ownership，不写本任务文件清单。
   - 搜索 production source，确认 game002/Editor 不再复制 Scene Layout Popup phase dispatch，且 assets、
     schema、game003 和排除目录无 diff。

8. **定向验收并生成报告**
   - 按 L2 命令验证 rendercore public API、三个直接 consumer 和 build；失败先最小化到具体 test file。
   - 完成三处浏览器人工矩阵，记录真实 pointer/key、视频 user activation、idle 输入和 listener cleanup；
     未完成项目必须明确标注，不能用 unit fake 冒充。
   - 创建 UTC 中文执行报告，记录实际 API 命名、文件偏差、命令结果和剩余风险。

## 8. 测试与验收

### 测试原则

- rendercore helper 测试必须对真实 `HTMLCanvasElement`/window dispatch native events，不再只对 Pixi
  container `.emit()`；Pixi fallback 可保留独立兼容测试。
- runtime 测试覆盖 `popup`、award counting/awaiting-dismiss、`awaiting-video-start` 与 idle；一次事件断言
  exact 一次 action。
- video fake 只证明 `play()` 在 event handler 返回前被调用及 rejection 被观察；浏览器 user activation
  仍由人工验收。
- consumer 测试覆盖绑定/解绑 owner，不通过 app-specific phase switch 恢复行为。
- 不为通过测试修改 Popup 动画时长、manifest、crave 资源或添加 fallback。

### 验收级别

采用 `L2`：本任务新增 rendercore popup/scene-layout public input contract，并修改 game002、Game Layout
Editor 与 Popup Editor 三个直接 consumer；同时涉及 trusted media 调用栈和 listener/destroy ownership。
无需 L3，因为不修改 schema、资源、生成物、根工具链、workspace、lockfile，也不是 release 或整仓重构。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter game002 --filter gamelayouteditor --filter popupeditor typecheck
pnpm --filter @slotclientengine/rendercore --filter game002 --filter gamelayouteditor --filter popupeditor test
pnpm --filter @slotclientengine/rendercore --filter game002 --filter gamelayouteditor --filter popupeditor build
git diff --check
```

失败时先以对应 Vitest 文件最小化复现；不因此自动升级到根级 typecheck/lint/test/build。

### 人工验收

1. 使用真实 `assets/crave` 启动 game002，分别触发 BaseGame → FreeGame 与 FreeGame → BaseGame；在
   canvas 四角、中心、reel/透明区域各点击一次均能锁存 Popup end，重新触发后用字母键、方向键、
   Space/Enter 各抽样一次均能结束，长按不连续跳阶段。
2. 在 Game Layout Editor 打开 crave layout，启用 guides/selection/symbol preview 后测试同一 canvas
   点击矩阵与任意 key；确认 Popup idle 后点击仍可做原 preview 操作、按键仍可操作 Editor，重导/重建
   preview 不会一键触发旧 runtime 与新 runtime 两次。
3. 在 Popup Editor 分别 preview award-celebration 与普通 Spine package，验证 canvas 任意点与任意 key
   分别执行一次 advance/dismiss；如测试带 prelude 的 video edge，确认第二次 pointer 和第二次 keydown
   都在真实 trusted gesture 中启动有声视频，play rejection 在 UI 明确显示。

### 独立验收建议

`建议`。原因是修改跨包 public input contract，并涉及 native event capture、浏览器 user activation、异步
Promise error 与 destroy listener ownership。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter game002 --filter gamelayouteditor --filter popupeditor test
git diff --check
```

另需人工复验一次 pointer/key 双分派不会导致 award 跳两档，以及 video keydown 的真实浏览器 user
activation；不要求重复全部视觉矩阵。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm。shell 未加载 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后，才设置现有本地代理并重试原命令。
- 本任务不新增依赖、不修改 package manifest 或 `pnpm-lock.yaml`；DOM/EventTarget 与 Pixi 能力已存在。

## 10. 生成物、文档与规则

- 本任务没有 YAML、manifest、asset map、ZIP 或其它生成物变化，不运行资源生成器，也不手改生成物。
- 更新 `packages/rendercore/README.md`、`apps/gamelayouteditor/README.md`、
  `apps/popupeditor/README.md` 与 `docs/scene-layout-manifest.md` 的输入 workflow。
- 更新最小稳定规则：
  - `docs/agent-rules/scene-layout.md`：完整 canvas/keyboard binding、trusted gesture、idle passthrough；
  - `docs/agent-rules/shared-game-runtime.md`：rendercore 拥有 Popup input dispatch/binding；
  - `docs/agent-rules/editor-artifacts.md`：editor 只绑定宿主，不复制 player/transition phase。
- 不修改根 `AGENTS.md`；精确 API 名、listener 选项和测试证据留在源码、README 与执行报告。

## 11. 执行报告

规划时不生成报告。执行完成后以 `date -u +%y%m%d-%H%M%S` 取得 UTC，并创建
`tasks/182-rendercore-popup-canvas-input-<utctime>.md`。

报告简要记录最终输入 API/ownership、实际修改文件、计划偏差、自动化命令结果、三处人工浏览器结果、
video user activation 结论、listener cleanup 与剩余风险；不收集无关 coverage、整仓统计或 profiler。

## 12. 风险、假设与待确认

### 风险

- DOM capture 与 Pixi EventSystem 的 native listener 组合若未严格切换，可能一次 pointer 执行两次；必须
  用 exact action count 测试和真实浏览器复验。
- 任意 key 是模态行为：Popup active 时会消费原本属于 Editor control 的键；必须保证 only-if-handled，
  Popup idle 立即恢复，不留下 stale active snapshot。
- 浏览器对 keydown 的 media user activation 可能存在平台差异；必须保持同步 `play()` 并人工覆盖目标
  浏览器，不能添加 autoplay/静音 fallback。
- runtime rebuild、mount failure 或 destroy 漏解绑会形成多 handler 和旧对象 mutation；binding owner 与
  disposer 必须单一、幂等、可测试。

### 假设

- 用户期望 Popup active 时任意键都作为主操作，不要求仅 Enter/Space，也不要求编辑器输入框优先。
- “所有编辑器”指通过 rendercore shared helper 获得一致能力；当前实际有 Popup production preview 的
  Game Layout Editor 与 Popup Editor 是本任务接入范围。
- current crave package 的 Popup animation/end 配置有效；本任务只修输入到达与分派，不调整美术时间轴。
- 现有 Pixi pointer fallback 对未迁移 consumer 继续兼容；正式接入本任务 binding 的 consumer 不再依赖
  display-tree hit testing。

### 待确认

无。上述行为可由当前需求与仓库合同确定；执行中若真实浏览器证明某目标平台不把 keydown 视为 video
user activation，应停止并报告平台限制，不得自行改成静音或自动播放。

## 13. 完成清单

- [ ] canvas 任意 pointer/key、idle 透传、exact-once 与 trusted video 调用栈正确。
- [ ] 三个 consumer 接入 shared binding，无 app-specific phase dispatcher 或 stale listener/rejection。
- [ ] lifecycle 闭合，manifest、资源、Popup animation、game003 与排除目录未被修改。
- [ ] public API、README 与三份领域规则已同步。
- [ ] 指定 L2 自动化验收已通过，人工浏览器结果已与自动化明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的五份领域规则和本计划；
2. 核对 Git 基线、crave manifest 与工作区，保留用户无关修改；
3. 先建立 native canvas/key 与 exact-once 失败测试，再实现 shared binding；
4. 按 rendercore → scene-layout → game002 → 两个 Editor 接入；API 命名小幅适配进报告，范围扩张先说明；
5. 只运行 L2 验收，真实浏览器人工结果不得由 fake runtime 替代，并生成 UTC 中文报告；
6. 除非用户明确要求，不 commit、不 push、不创建 PR。
