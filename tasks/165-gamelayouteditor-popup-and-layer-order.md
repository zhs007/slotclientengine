# 165 gamelayouteditor-popup-and-layer-order 任务计划

## 1. 目标与完成定义

### 目标

修正 task 162 后 Game Layout Editor 的普通 Spine Popup 配置入口与场景层级 `order` 合同：一条
Spine 有向转场可以直接配置零个或一个普通 Spine Popup，配置后在 source mode 当前画面上先显示
Popup，等待用户点击并完整播放 Popup end，再启动原转场并在既定 switch event 切换状态；未配置时
继续直接转场。

同时让普通图层的 `order` 可直接编辑，使用户能把图层放到默认 `order=999` 的 main reel 之上。
背景和 main 在布局大纲中继续作为特殊分组展示，普通图层按数值 `order` 排序；node、main reel 与
Popup order 必须使用互不重复的安全整数。Popup 新建默认从 `2000` 起分配，并可显式修改。

### 完成定义

- [ ] 每条 `from -> to` Spine transition 独立选择普通 Spine Popup 或“无”；不同转场可绑定不同
      package，且不要求先注册成独立 programmatic Popup。
- [ ] 带前置 Popup 的转场保持 source stable/displayed mode；完整
      `start -> loop -> end -> complete` 后才启动已准备的 overlay，并在 exact event 切换目标状态。
- [ ] 无前置 Popup、重复点击、准备/播放失败、清理与 destroy 行为不退化；video 仍禁止前置 Popup。
- [ ] 普通图层可输入安全整数 order，无关事务不再压缩该值；`order>999` 的图层实际位于 reel 上方。
- [ ] node、main reel 和被引用 Popup 的 order 不重复；冲突编辑原子失败并指出对象，不自动重排。
- [ ] 背景/main 继续单独展示；普通图层按 `order` 排序，不用 tie-break 合法化重复值。
- [ ] Popup 显式配置 order；新 Popup 从 `2000` 起找可用值，BigWin/transition 编辑同一 root 配置。
- [ ] Popup order 高于 node/main 最大 order；提高普通图层后，校验要求同步提高 Popup order。
- [ ] manifest、ZIP、重导、preview、runtime、CLI、文档与直接 consumer parity 通过 L2 验收。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 的 node/reel/Popup order draft、编辑命令、冲突诊断、outline、Popup inspector、
  preview 与 ZIP round-trip。
- 收窄 `normalizeGameModeNodeOrders()`：保留背景 topology 分配/迁移，停止每次事务压缩普通 order。
- `packages/rendercore/scene-layout` 的 Popup order、strict normalization/校验和 production layering。
- 保留 task 162 的 prelude schema、runtime 编排和 public snapshot/API，只调整配置与显示层级。
- `apps/gamelayoutpkgcli` 的结构化 rewrite/parity及必要的 `gameframeworks` type/fixture 同步。

### 不包含

- 不修改 Popup package 内部 layer/prompt/animation/tier order；仍由 Popup Editor/rendercore 拥有。
- 不把普通 Spine Popup 伪装成 `award-celebration`，不让 BigWin binding 接受普通 Spine 类型。
- 不支持 video transition + prelude，不改变有声 MP4 trusted-click、fadeStart 或 blackout 合同。
- 不给 transition overlay 增加 order；Popup complete 后才出现 overlay，继续使用固定特殊层。
- 不开放背景作为普通图层随意跨组拖动，不取消背景必须为 active variant 最低可见 node 的现有合同。
- 不根据数组位置、上传顺序、文件名或首项猜 order，不允许重复 order 后依赖稳定排序掩盖冲突。
- 不修改 Popup/Symbols Editor、game002/game003 业务触发、production 美术、根工具链或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T06:18:14Z
HEAD: 4e9705610c2fe17a1987b3d490b15a27a71325dd
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与输入：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/scene-layout.md
docs/agent-rules/shared-game-runtime.md
tasks/161-popupeditor-spine-popup-260804-095621.md
tasks/162-gamelayouteditor-multi-package-transition-popup.md
tasks/162-gamelayouteditor-multi-package-transition-popup-260805-041639.md
```

当前实现结论：

- `layout-workspace.ts` 按 order 排普通图层，但 inspector 只显示 order；“上移/下移”只在普通图层间
  交换，不能跨过单独的 main reel。
- `EditorStore` 的 constructor/`transact()`/`replace()` 都调用 `normalizeGameModeNodeOrders()`，围绕
  reel 重新编号全部 node，稀疏 authored order 会在无关编辑后丢失。
- parser 拒绝重复 node order，但仅在存在 Symbols binding 时把 main order 加入唯一性校验。
- `SceneLayoutPopupBinding`/`EditorPopupDependency` 没有 order；BigWin 只编辑 dependency placement，
  transition inspector 只有 `preludePopupId` 下拉。
- runtime 固定添加 `layout -> popup -> transition -> video blackout`，manifest 无法表达 Popup order。
- transition 引用本身已使普通 Popup 进入 manifest/ZIP，不依赖独立 `registeredSpinePopupIds`。
- crave/minecart2 现有 Popup binding 无 order；需文档化 v1 读取迁移，新 export 写 canonical order。

当前代码、schema、测试和 task 162 报告已足以确认合同，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “在转场配置 Popup”指 inspector 承载 package 选择和 Scene Layout root placement/order；不要求
  先注册独立 Popup，也不复制 package 内部 authoring。
- “也可以不配置”是 canonical optional binding；空值直接走 task 162 以前的 overlay 流程，不创建
  placeholder、默认首项或空 Popup player。
- “不是独立的”表示 prelude 属于 exact `from -> to` request，由 package runtime 统一拥有生命周期与
  prepare；配置保存在该 edge，不继承 source/target mode 或其它转场的选择。
- “Popup order 2000”指 Scene Layout popup root，不是 package 内部 layer；同一 Popup 的多个引用共享
  package binding 级 placement/order。
- “order 不重复”覆盖 node、显式 main reel 与被引用 Popup；未导出 dependency 不进 production 校验。
- 背景/main“特殊出来”只指大纲分组和背景最低层不变量；普通图层内部显示顺序仍完全由 order 决定。

### 关键决策

1. **Popup order 放在 `SceneLayoutPopupBinding`，不复制到 mode/transition 引用**
   - binding canonical 形状变为 `{ type, manifest, order, placements }`；mode 的
     `awardCelebrationPopup` 和 Spine edge 的 `preludePopup` 继续引用 popup id。
   - 每条 edge 保存自己的 `preludePopup` id；多个 edge 可分别引用不同 Popup binding，导出/重导不得
     合并、广播或沿用上一条 transition 的选择。
   - 这与当前 placement ownership 一致，同一 package 不会因多个 consumer 产生互相矛盾的 root
     transform/order。BigWin 与 transition inspector 编辑的是同一个 binding，并明确提示共享影响。
   - 不把引用改成嵌套对象，避免重复 manifest path/type/placement、扩大 transition schema 和 CLI
     asset ownership。

2. **新建显式写 order，旧 v1 缺失只在 parser/import 边界规范化**
   - 新 dependency 从 `2000` 向上选择首个未占用安全整数；用户修改时不自动找替代值。
   - 旧合法 v1 Popup binding 缺少 order 时规范化为 `2000`，并立即参与唯一/最高层校验；该兼容只
     接受“字段缺失”，非法值、重复值和 unknown key 继续失败。
   - Game Layout Editor 重导后写出显式 order；不在 app、测试或 assets 维护第二份 per-popup 默认表。

3. **统一 order validator 是唯一排序合同**
   - rendercore 集中校验 safe integer、node/main/popup 唯一性和每个 Popup 高于所有 node/main 的
     顶层约束；editor command 复用同一语义提供即时中文冲突诊断，最终仍以 parser 为权威。
   - 重复值直接拒绝并回滚当前事务，不交换两个对象、不整体 renumber、不使用数组 index 解冲突。
   - main reel 是否绑定 Symbols 不改变它显式 order 的冲突语义；字段存在就参与校验。

4. **停止全局自动压缩，只保留背景专属分配**
   - 普通 layer order 用显式 command 修改并长期保存；outline 每次按 order 排序。
   - 新普通 layer 使用现有 order 空间中的可用值，跳过 reel/Popup；用户可随后设为 `>999`。
   - 新增/切换/删除 mode background 时使用背景专属 allocator 维持 initial background 最低层，尽量
     保留全部既有 authored order；constructor/无关 transaction 不再重排普通 layer。
   - 旧内存 draft 如重复或不满足背景约束，在 import/replace 边界显式迁移或失败，并记录测试；不把
     repair 藏在每次 store update 中。

5. **runtime 让数值合同与真实 display order 一致**
   - node 与 reel 继续在 art-space layout runtime 内按 order 插入；Popup 保持 viewport-center 坐标且
     不进入 art mask。
   - package runtime 按 parsed Popup order 稳定排序 popup children，并依靠“Popup order 必须高于所有
     art node/reel”的 manifest 不变量保持 popup root 顶层；不能仅在 inspector 显示一个不影响
     production 合成的数字。
   - transition/video presentation 仍是特殊时序层；prelude complete/隐藏后才启动 transition，
     所以不需要为两个不会并发的阶段伪造 order 冲突。

6. **现有 programmatic Popup 能力与 transition 主流程分离**
   - 保留 rendercore `getSpinePopup(id)` 和现有显式 registration 兼容合同，不借本任务删除 public API。
   - BigWin 页面聚焦 mode award binding；transition 页面直接配置普通 Spine prelude。若保留独立注册
     控件，必须标为高级 programmatic 能力，不能暗示 transition 需要先注册。

## 5. 职责与合同

- **Game Layout Editor**：拥有 draft/UI、order 编辑事务、冲突反馈、背景特殊 allocator、Popup
  dependency selection/placement/order 与 preview 操作。
- **Scene Layout schema/parser**：拥有 Popup root order、全局唯一性、Popup 顶层约束、legacy 缺失字段
  规范化和 canonical typed manifest。
- **Scene Layout runtime**：拥有 node/reel/Popup production display order、art-space 与 viewport-center
  坐标隔离、prelude prepare/commit/cleanup/destroy。
- **Popup package/runtime**：继续拥有 Popup 内部 layer order 与 `start/loop/end` 状态机；本任务不读取
  private track 或直接改 Popup display tree。
- **Package CLI/exporter**：结构化保留 order 并复验 optimized manifest/ZIP；不扫描任意 JSON 字符串。
- **失败策略**：非安全整数、重复 order、Popup 不在顶层、错误 popup type/id、video+prelude、缺 placement、
  runtime prepare/complete 失败都显式失败；editor transaction 和 runtime owner 按原边界回滚/清理。
- **禁止行为**：不自动 compact/swap order，不用 DOM/CSS 层模拟 Pixi order，不把 Popup 放进 art mask，
  不复制 Popup 状态机，不猜默认 package/路径/animation，不保留第二份业务排序表。

## 6. 文件范围

### 预计新增

```text
tasks/165-gamelayouteditor-popup-and-layer-order-<utctime>.md
```

如统一 order 分配/诊断无法清晰放入现有 command 模块，可新增一个小型
`apps/gamelayouteditor/src/model/layer-order.ts` 及对应测试；不把排序规则散落到 UI handlers。

### 预计修改

```text
apps/gamelayouteditor/src/model/{editor-project,editor-store,game-mode-commands,resource-commands}.ts
apps/gamelayouteditor/src/ui/{app-shell,bigwin-workspace,layout-workspace,transitions-workspace,project-workspace}.ts
apps/gamelayouteditor/tests/{app-shell,editor-store,game-mode-commands,validation,zip-io,transitions-workspace}.test.ts
apps/gamelayouteditor/README.md
packages/rendercore/src/scene-layout/{types,manifest,package-runtime}.ts
packages/rendercore/tests/scene-layout/{manifest,package-resource,package-runtime,package-runtime-mode}.test.ts
packages/rendercore/README.md
apps/gamelayoutpkgcli/src/reference-rewriter.ts
apps/gamelayoutpkgcli/tests/{package-flow,asset-groups}.test.ts
apps/gamelayoutpkgcli/README.md
packages/gameframeworks/tests/scene-layout-template.test.ts
docs/scene-layout-manifest.md
docs/agent-rules/{editor-artifacts,scene-layout,shared-game-runtime}.md
```

仅当正式 asset checker/直接 consumer 因 canonical order 要求暴露缺口时，才定向更新其源 manifest 或
fixture；优先使用已定义的 v1 缺失字段规范化保留现有 production assets，不批量重写 `assets/**`。

### 原则上不应修改

```text
apps/popupeditor/**
packages/rendercore/src/popup/**
packages/rendercore/src/scene-layout/video-transition-player.ts
apps/game002/**
apps/game003/**
assets/**
packages/logiccore/**
pnpm-lock.yaml
AGENTS.md
```

若执行时需要 per-mode/per-transition 各自不同的同 Popup order/placement、允许 Popup 低于普通图层、
或改变 transition/video 层级，属于 public schema 与渲染架构扩张，必须先停止说明，不能通过修改
计划事后合理化。

## 7. 实施步骤

1. **确认执行基线并固定失败用例**
   - 重读根规则、三份领域规则、本计划和当前 schema/runtime，核对 HEAD/status。
   - 用 editor 测试固定“普通 layer 无 order 输入”“每次事务自动 renumber”“普通 layer 不能跨 reel”
     和 Popup binding 无 order 的当前缺口。
   - 固定 task 162 的无 prelude/有 prelude source 保持、点击、complete 后 overlay、event switch 时序。

2. **建立统一 order 合同与迁移**
   - 在 Scene Layout types/parser 为 Popup binding 增加 normalized order，集中检查 node/main/popup 安全整数、
     唯一性和 Popup 高于 art layers。
   - 缺失 Popup order 的旧 v1 输入规范化为 2000；非法、重复或不在顶层的输入增加 strict failure 测试。
   - 同步 geometry compatibility/deep-freeze/canonical fixture，确认纯 order 改动按实际 topology 影响分类，
     不误当成 placement-only geometry hot update。

3. **修复 editor order ownership**
   - 用显式 allocator/validator 替代每次事务后的全量 `normalizeGameModeNodeOrders()`；背景 topology 变化
     走专属安全分配，普通 order 保持 authored 值。
   - 增加普通 layer order command 和 inspector number input；main reel 继续可编辑，二者冲突时原子失败。
   - 新普通 layer、background 和 Popup 默认分配跳过已占用值；普通 layer outline 只按 order 排，背景/main
     保持单独分组；移除或重定义无法跨 reel 的旧上移/下移控件。

4. **把 Popup root 配置接入 BigWin 与 transition**
   - `EditorPopupDependency` 增加 order，导入首项默认 2000、后续从 2000 向上找空位；替换同 id 保留
     order/placements，layout 重导恢复 parsed order。
   - BigWin 只允许编辑当前 award binding 的 root order/placements；Spine transition inspector 在选择
     prelude 后显示同一 dependency 的 order 与各 active variant placement，空选则不显示/不导出配置。
   - UI 明确共享 binding 影响和 programmatic registration 区别；transition preview 继续调用 package
     runtime 的整条 mode request，不独立串联两个 player。

5. **落实 production display order 与生命周期**
   - runtime 根据 manifest order 创建/排列 Popup player container，保持 viewport-center placement、top root、
     update/dismiss/cleanup/destroy ownership。
   - 验证普通 layer `order>999` 实际插到 reel 后，Popup 仍按高于所有 node/reel 的 order 显示；改变 Popup
     order 后 rebuild/round-trip 不丢值。
   - 覆盖多个 edge 分别绑定不同 Popup、相同 Popup 被显式复用、programmatic Popup、active prelude
     切换、重复 click、prepare failure 和 destroy，不出现串用、半提交或 child 泄漏。

6. **同步 ZIP、CLI、文档与验收**
   - export/import/export 与 CLI rewrite 保留 Popup order，optimized manifest 重新 strict parse；未引用
     Popup 仍不导出，order 不改变 exact asset closure/group ownership。
   - 更新 README、Scene Layout 文档与三份最小领域规则，说明 999/2000 默认、唯一性、背景/main 特殊分组、
     transition 内配置和 Popup 顶层约束。
   - 运行 L2 定向验收，完成人工浏览器项后生成 UTC 中文任务报告。

## 8. 测试与验收

### 测试原则

- editor 测试覆盖：普通 layer 输入 1000 后跨过 reel 999、无关 placement 编辑不 renumber、重复 order
  回滚、负数/小数/超安全整数失败、背景仍最低、新 layer/Popup allocator 跳过占用值。
- schema 测试覆盖：旧 Popup 缺 order -> 2000、新 canonical 显式 order、node/reel/popup 任意两者重复失败、
  Popup 不高于最大 art order 失败、多个 Popup 顺序稳定。
- transition 测试覆盖：多条 edge 各自选择不同 Popup、无 Popup 直接 overlay、source 保持、早/重复点击、
  完整 end 后才 overlay、exact event 才切 mode；video+Popup 继续失败。
- runtime 测试必须检查真实 Pixi child ordering/container visibility，而不只断言 manifest 数字或 UI 文案。
- ZIP/CLI 测试检查 canonical JSON、重导 draft、optimized rewrite 与 strict reparse；order 不应改变 package
  closure、hash payload 或 asset-group owner。
- 不为现有自动 renumber 测试扭曲新合同；与用户显式 order 冲突的旧 fixture/期望应更新。

### 验收级别

`L2`。任务修改 rendercore Scene Layout public binding/schema、production display ordering、正式 Layout ZIP
与 CLI typed rewrite，并影响 gamelayouteditor 和 gameframeworks 直接 consumer；不改根工具链、lockfile、
发布流程或大规模无界重构，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks format:check
git diff --check
```

### 人工验收

1. 新建/导入一个 main reel order 为 999 的项目，添加两个普通图层，将 order 分别设为 1000/1001；
   确认大纲按数值排序、画面位于 reel 上方，修改 placement/切 mode 后 order 不变。
2. 尝试把普通图层、main 或 Popup 设为已占用 order；确认当前编辑不提交、冲突对象可读，不发生其它
   layer 自动改号。
3. 为两条 Spine transition 分别选择不同普通 Popup 并修改各自绑定的 order/placement；来回切换 inspector，
   确认选择不继承、不串用，dependency root 配置正确且未误注册为独立 Popup。
4. 发起带 prelude 的转场，至少经过两个 loop 后点击；确认 source mode 保持到完整 end 结束，之后才出现
   transition overlay，并在 event 边界切换。清空 prelude 后确认直接转场。
5. 导出、重导并再次导出；确认 layer/reel/Popup order、binding/placement 和 bytes 无损，未引用 Popup 不进入
   ZIP，Popup 始终显示在最高 art order 之上。

### 独立验收建议

`必须`。本任务涉及跨包 public schema、正式 ZIP、异步 transition transaction 和真实 Pixi display order。
独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor test
pnpm --filter gamelayoutpkgcli test
git diff --check
```

并至少用真实普通 Spine Popup 目视一次“点击后完整 End，再开始转场”，以及一个 `order>999` 的普通
layer 确实位于 reel 上方。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；shell 没有 Node 时运行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只运行 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库约定代理并重试。
- 预计不新增依赖、不修改 lockfile；现有 editor store、rendercore parser/runtime 与 CLI rewrite 已足够。

## 10. 生成物、文档与规则

- 本任务修改正式 Scene Layout schema/ZIP typed field；同步 parser、writer、reference rewriter、fixtures 和
  strict reparse，不手改任何生成器拥有的 TypeScript 文件。
- 更新 `docs/scene-layout-manifest.md`，记录 Popup binding order、v1 缺失迁移、唯一/顶层约束、transition
  prelude 时序与 main/background 特殊展示。
- 更新 Game Layout Editor、RenderCore、CLI README；不把精确项目资源名或任务执行证据写入根规则。
- 最小更新 `editor-artifacts.md`、`scene-layout.md`、`shared-game-runtime.md` 的稳定 order ownership、
  editor 不自动 renumber、runtime 不复制 Popup 状态机边界。
- 默认不修改 `assets/**`；若 checker 要求把 canonical order 回写正式源 manifest，执行前说明直接 consumer
  原因并使用其正式生成/校验流程，禁止只改派生文件。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/165-gamelayouteditor-popup-and-layer-order-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 order/schema 合同、实际修改、迁移与兼容、
自动化命令、人工验收、计划偏差和剩余风险；不收集无关整仓 coverage、历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 去除全局 normalize 后，background 最低层分配必须独立正确，否则可能生成非法 manifest。
- Popup 是 viewport-center root，node/reel 是 art-space/masked；把 Popup 移入 layout container 会破坏
  坐标和裁切，必须用顶层约束保持空间边界。
- 旧 v1 多 Popup 缺 order 会因都规范化为 2000 而显式失败，必须由 Editor 分配后重导，不能静默改号。
- order 改动会改变真实 presentation topology，不能错误走 geometry-only hot update 并复用旧 child order。
- fake player 可证明时序但不能代替真实 Pixi/Spine 视觉层级，必须保留浏览器验收。

### 假设

- Popup root order 是 binding 级配置；同一 Popup 的多个引用不需要各自 order/placement。
- “Popup order 应该最高”是 strict production 约束，而不仅是默认 UI 建议；用户可提高 Popup order 以
  容纳更多 `>999` 图层，但不允许把 Popup 主动放到普通图层下面。
- task 162 prelude API/lifecycle 已满足本任务，不改 Popup package schema 或动画语义。

### 待确认

无。若产品实际需要“同一个 Popup package 在不同 mode/transition 使用不同 placement/order”或允许
Popup 低于某个普通 art layer，应先升级为 usage-level schema 讨论，不能在执行时猜测。

## 13. 完成清单

- [ ] 每条 Spine transition 独立选择不同 Popup，并按 complete -> overlay -> event switch 执行。
- [ ] transition 配置不依赖独立 programmatic registration；BigWin 与 transition 类型边界清楚。
- [ ] 普通 layer order 可编辑、可跨 main reel、无关编辑不自动 renumber。
- [ ] node/main/Popup order 唯一，Popup 顶层约束、默认 2000 与 legacy 迁移明确。
- [ ] 背景/main 特殊分组和背景最低层行为保持，普通列表按 order 排序。
- [ ] preview、production Pixi order、ZIP round-trip 与 CLI rewrite 和 manifest 数值一致。
- [ ] public schema/API、测试、README、领域规则和必要生成物已同步。
- [ ] 指定 L2 自动化、真实浏览器与独立验收已分开记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、三份领域规则、本计划和 task 162 当前报告；
2. 核对 HEAD/status，保留用户已有和无关修改；
3. 先用失败测试固定自动 renumber、跨 reel 和 Popup order 缺口，再改 schema/runtime/editor/CLI；
4. 复用 task 162 的 popup prelude 状态机，不在 app/editor 串联或复制 player；
5. 小幅适配当前文件结构时在报告记录；若需要 usage-level Popup 配置、Popup 低层或 video+prelude，
   先停止说明；
6. 只运行计划规定的 L2 验收，真实视觉项与自动化分开记录；
7. 完成后生成任务 165 UTC 中文报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
