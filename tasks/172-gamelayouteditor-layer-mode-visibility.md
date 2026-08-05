# 172 gamelayouteditor-layer-mode-visibility 任务计划

## 1. 目标与完成定义

### 目标

为 Game Layout Editor 的普通图层增加“全局或单一主状态”作用域，并把现有横/竖屏可见性放在该
作用域之下编辑。新图层默认对全部主状态有效；取消“所有状态有效”后必须选择且只能选择一个
绑定状态。编辑区切换主状态时，右侧画布也切到相同稳定状态，使大纲、Inspector 和实际预览使用
同一个状态上下文。

普通图层的 `order` 继续是跨状态、跨方向的全局值；状态或方向不可见只改变可见性，不删除节点、
不压缩 order，也不建立 per-mode 排序表。

### 完成定义

- [ ] 新建和旧数据中的普通图层默认显示为“所有状态有效”；取消后必须从现有主状态中绑定一个，
      不能同时绑定多个状态或保持空绑定。
- [ ] 全局图层在每个主状态都参与显示；单状态图层只在 exact 绑定状态显示。主状态名大小写精确，
      未知、空或非法引用在 parser/editor transaction 边界显式失败。
- [ ] `orientation-focus` 的 landscape/portrait 可见性继续用各 variant placement 表达，但 UI 嵌套在
      “所有状态”或具体绑定状态下面；最终可见性是“状态作用域匹配且当前 variant 有 placement”。
- [ ] 编辑区主状态变化后，右侧画布自动选择同一稳定状态；普通状态选择不播放转场，转场工作区仍可
      独立验证真实 directed transition、Popup prelude 和 video trusted-click 流程。
- [ ] 当前主状态或当前预览 variant 下不显示的普通图层在大纲中灰显，但仍可选择和修改；背景与 main
      reel 继续特殊展示，不套用普通图层作用域控件。
- [ ] mode 切换在既定 commit 边界原子更新背景、普通图层、reel/displayed mode；失败不留下半切换
      可见性。相同 Symbols binding 不重建 reel、不重新抽样，稳定节点 player 不因 authoring 状态选择重建。
- [ ] mode rename 事务性改写普通图层绑定；仍有普通图层绑定时禁止删除该 mode，并列出引用节点，
      不静默删除节点或改成全局。
- [ ] 普通图层 `order` 在状态/方向切换、隐藏/恢复、导出重导后保持不变，且仍与 node/main reel/Popup
      使用现有全局唯一安全整数合同。
- [ ] 旧 v1 manifest/ZIP 缺少节点状态作用域字段时按全局图层读取，画面与资源分组不变；新 scoped
      图层可稳定导出、导入、优化并再次 strict parse，不要求批量改写现有 `assets/**`。
- [ ] 自动化 L2 验收通过；浏览器人工验收场景由用户执行，执行报告不得把未完成的人工项写成已通过。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 的普通图层 draft、作用域命令、mode rename/delete 引用维护、Inspector 层级、
  大纲灰显、preview 状态联动、ZIP round-trip 和相应中文反馈。
- `packages/rendercore/scene-layout` 的可选 node `gameMode` public contract、strict normalization/引用校验、
  mode-aware visibility、原子 commit，以及只供 authoring preview 使用的稳定状态选择入口。
- `apps/gamelayoutpkgcli` 的 mode/shared 资源分组：全局普通节点归 shared，单状态普通节点只归绑定 mode；
  typed reference rewrite 必须保留 `gameMode`。
- 更新 Scene Layout manifest 文档、相关 README 和最小范围领域规则。

### 不包含

- 不支持一个图层绑定多个状态，不增加 per-mode placement、per-mode order 或 arbitrary visibility expression。
- 不改变背景的现有 per-mode/per-variant 独立 binding，不给 main reel、Popup 或 transition overlay 增加普通
  图层作用域控件。
- 不改变 `order` 唯一性、Popup 高于 art/reel、背景最低层或大纲特殊分组合同；不可见节点仍占用原 order。
- 不把编辑状态选择伪装成 production `requestGameMode()`，不为缺 transition 增加瞬切 fallback，也不
  改变 Spine event、Popup prelude、MP4 trusted-click、fadeStart 或 rollback 语义。
- 不增加状态继承、状态组、默认首项 fallback、未知 mode alias、隐藏时资源卸载或按状态销毁 player。
- 不修改 Symbols/Popup Editor、游戏业务 round flow、production 美术、根工具链、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T08:24:19Z
HEAD: 726c6e2a0305f8b7df231769ea12e07e340ac7f0
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与输入：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
tasks/165-gamelayouteditor-popup-and-layer-order.md
```

当前实现结论：

- `SceneLayoutNode`/`EditorNodeDraft` 只有全局 `order`、resource 和 per-variant `placements`，没有普通节点
  的 mode 作用域；parser 的 node known fields 也只接受 `id/order/resource/placements`。
- `setLayerVariantVisibility()` 已通过移除 placement 隐藏 orientation variant，并用 editor-only
  `hiddenPlacements` 恢复原值；该缓存不会导出，适合继续承担方向可见性，不需要复制 per-mode placement。
- `layout-workspace.ts` 已按全局 order 排普通图层，但 layer meta/row 没有当前 mode/variant 可见状态；
  Inspector 的 landscape/portrait 控件目前直接位于“方向与 Placement”下。
- `app-shell.ts` 已有 `#selectedGameMode`、`#selectedPreviewMode` 和默认勾选的“跟随编辑状态”，但编辑状态
  change 只同步 preview target selector 并 prepare transition，不把画布提交到目标稳定状态；真实切换仍需
  点击“切换到该状态”。
- `SceneLayoutPackageRuntime.commitBackgroundVisibility()` 只切换候选背景；普通节点在 runtime 内默认 active，
  最终可见性目前仅受当前 variant placement 影响。
- geometry compatibility 会把除 placements 外的 node 字段视为 immutable structure，因此新增/修改
  `gameMode` 应自然分类为 structural update；只改 landscape/portrait placement 继续是 geometry update。
- `gamelayoutpkgcli/asset-groups.ts` 目前把所有非背景 node 归 shared，再把 shared nodes 放入每个 mode group；
  scoped 普通节点若不调整该逻辑会被错误提前加载为 shared。
- task 165 已落实全局 node/main reel/Popup order；本任务不能恢复按状态重排或隐藏后 compact。

当前 schema、runtime、editor 和 CLI 已足以确定改动边界，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “是否全局有效”只作用于普通图层。勾选表示所有现有及未来新增 mode 都可显示；取消后该节点只属于
  一个 exact mode，默认选择当前编辑 mode，但用户必须能改选其它现有 mode。
- “每个状态下再单独配置”按已确认的单绑定约束解释为：一个普通图层只有一份资源、playback、order 和
  per-variant placement；它可以是全局，或整份配置仅在一个 mode 生效，不展开为每个 mode 一份 override。
- “横屏竖屏的不可见在大状态下面”是 Inspector 信息层级和组合可见性要求，不改变现有 placement schema：
  先显示全局/绑定状态，再在其下显示 active variants 的可见开关和 placement。
- “当前状态不显示则灰掉”是大纲表现，不是 disabled 或删除。用户仍可选中灰色节点，把它改为全局、
  换绑当前 mode 或编辑其它配置；灰显判断使用当前编辑 mode 和画布当前 variant。
- “预览一起切换”指 authoring 时直接查看目标稳定画面，不要求每次切状态都播放转场。真实转场预览仍由
  transition workspace 的显式 prepare/request 操作承担。
- 用户已明确旧数据必须兼容，浏览器验收由用户处理；自动化验收仍需覆盖 schema/runtime/editor/CLI。

### 关键决策

1. **在 node 上使用可选单值 `gameMode`，缺失即全局**
   - `SceneLayoutNode.gameMode?: string` 与 `EditorNodeDraft.gameMode?: string` 是唯一作用域来源；全局节点不写
     该字段，scoped 节点写 exact mode id。
   - 旧 v1 node 缺字段自然规范化为全局，版本继续为 `1`；新 canonical export 对全局仍省略字段，对
     scoped 显式写出，不增加第二份 mode-to-node 表。
   - parser 在 gameModes 解析完成后校验引用存在；声明 `gameMode` 却没有 `gameModes`、引用未知 mode、或
     background candidate 声明普通节点作用域都显式失败。

2. **状态作用域与 variant placement 做逻辑 AND，不引入 per-mode placement**
   - runtime 可见条件为：节点是当前 mode 背景，或普通节点满足 `gameMode` 缺失/等于 displayed mode；并且
     当前 variant 存在 placement。
   - 全局/单状态切换只改 `gameMode`；landscape/portrait 开关继续调用现有 placement cache transaction。
   - 这样资源、playback、transform 和 order 仍只有一份，符合“一节点只绑定一个状态或全局”与全局排序要求。

3. **mode 生命周期严格维护 exact 引用**
   - rename mode 同步改写所有 node `gameMode`、transition、initialMode 等既有引用，并在一次 transaction
     中重新 strict parse。
   - 删除 mode 前若仍有 scoped ordinary node，命令明确拒绝并列出 node id；用户必须先改为全局、重绑或
     删除节点。禁止静默删除、首项重绑或自动 globalize。
   - background node 继续由 `backgroundNodes` 拥有；把 scoped ordinary node 绑定为背景时拒绝，不能暗中
     清除其作用域。

4. **rendercore 统一提交 mode-aware visibility**
   - 将当前 background-only helper 收敛为 mode visibility commit：初始化、transition exact switch event/
     video fadeStart 和 authoring preview 选择都调用同一 resolver/commit，不在 editor/app 重算 Pixi visibility。
   - transition switch 前保持 source 背景和 source-scoped nodes，commit 时一次切到 target；失败遵守现有
     before/after-switch settle 和 destroy 边界。
   - 不可见节点只设 inactive/renderable，不销毁 image/Spine/VNI player，不改变 container order。

5. **提供显式 authoring-preview 稳定状态选择，不削弱 production directed transition**
   - rendercore 增加受限的 authoring preview surface，复用 mode binding prepare、reel swap 和 visibility commit，
     直接选择稳定 mode；`LayoutPreview` 是唯一 consumer，gameframeworks/presentation surface 不接入。
   - 该入口不查找/播放 transition，不成为 `requestGameMode()` 的缺边 fallback；真实 transition preview 继续
     使用现有 prepare/request API，因此 video trusted-click 合同不变。
   - 相同 Symbols binding 复用当前 reel/catalog/已抽样 scene；binding 改变时使用 LayoutPreview 已缓存的目标
     package scene 完整 prepare 后原子 swap。active transition/prelude 期间拒绝 authoring jump，UI 显式反馈。
   - 默认“跟随编辑状态”开启时，编辑 mode change 调用该入口并镜像右侧 selector；关闭跟随仍保留现有高级
     转场调试用途，但大纲灰显始终以编辑 mode 为准，不能假装画布已同步。

6. **资源分组按作用域归 owner，reference rewrite 只结构化保留**
   - CLI shared group 只含非背景且无 `gameMode` 的普通节点；每个 mode group 含 shared nodes、该 mode 的
     backgrounds 和 `gameMode === mode.id` 的 ordinary nodes。
   - scoped node 不进入其它 mode 或 shared group；initial/incremental 仍由既有 group 算法计算，资源 bytes
     可按 exact content 去重。
   - WebP/reference rewrite 继续 spread typed node 并仅改 resource path；测试固定 `gameMode` 不丢失，不扫描
     任意 JSON 或另存 owner 表。

## 5. 职责与合同

- **Game Layout Editor**：拥有作用域表单、当前编辑 mode、方向 placement cache、大纲灰显、用户反馈和
  authoring preview control；不直接修改 Pixi display tree。
- **Scene Layout schema/parser**：拥有 `gameMode` optional contract、legacy 缺失字段语义、exact mode/background
  引用校验、deep-freeze 和 geometry/structural 分类边界。
- **Scene Layout runtime**：拥有 mode/variant 组合可见性、背景/普通节点/reel 的 prepare/atomic commit、player
  复用、transition rollback 与 authoring preview stable selection。
- **Package CLI**：从 parsed typed node scope 推导 shared/mode exact closure；不按 node id、资源名或文件名猜 owner。
- **失败策略**：空/未知 mode、background 非法作用域、删除仍被引用 mode、preview busy、target reel prepare
  失败和 strict ZIP/parser 错误均显式失败；editor transaction/preview commit 不留下半写 draft 或半切画面。
- **禁止行为**：不建立 mode×node 布尔矩阵，不复制 visibility resolver，不用 CSS 隐藏 canvas node，不在
  scope/variant 切换时重排 order，不销毁隐藏 player，不用初始 mode 或首项作为非法引用 fallback。

## 6. 文件范围

### 预计新增

```text
tasks/172-gamelayouteditor-layer-mode-visibility-<utctime>.md
```

### 预计修改

```text
apps/gamelayouteditor/src/model/{editor-project,editor-store,game-mode-commands,resource-commands,validation}.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/{app-shell,layout-workspace,ui-session}.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/{app-shell,editor-store,game-mode-commands,layout-preview,validation,zip-io}.test.ts
apps/gamelayouteditor/README.md

packages/rendercore/src/scene-layout/{types,manifest,package-runtime,index}.ts
packages/rendercore/tests/scene-layout/{manifest,package-runtime-mode,presentation-surface}.test.ts
packages/rendercore/README.md

apps/gamelayoutpkgcli/src/asset-groups.ts
apps/gamelayoutpkgcli/tests/{asset-groups,reference-rewriter,package-flow}.test.ts
apps/gamelayoutpkgcli/README.md

docs/scene-layout-manifest.md
docs/agent-rules/{editor-artifacts,scene-layout,shared-game-runtime}.md
```

若 authoring preview surface 无法在 `package-runtime.ts` 内保持 production API 边界清晰，可新增一个最小的
`packages/rendercore/src/scene-layout/authoring-preview.ts` 及定向测试；不得把 mode visibility 复制到 editor。

### 原则上不应修改

```text
apps/popupeditor/**
apps/symbolseditor/**
packages/rendercore/src/popup/**
packages/rendercore/src/scene-layout/video-transition-player.ts
packages/gameframeworks/**
apps/game002/**
apps/game003/**
assets/**
packages/logiccore/**
pnpm-lock.yaml
AGENTS.md
```

执行时若需要多状态绑定、per-mode transform/order、production 无边瞬切、schema version 2 或批量重写现有
assets，属于明显范围扩张，必须先说明并重新确认，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线并固定 legacy/缺口用例**
   - 重读本计划、根规则和三份领域规则，核对 HEAD/status 及 task 165 order 合同仍成立。
   - 用 parser/editor 测试固定“旧 node 无 scope 全局可见”“新图层默认全局”“当前 mode change 只改右侧
     target、不改画布”和 CLI 把全部普通 node 当 shared 的现状。

2. **建立 node scope public contract 与严格校验**
   - 为 rendercore/editor node draft 增加 optional `gameMode`，扩展 node known fields、deep-freeze、manifest
     serialization/import 和 ZIP round-trip。
   - 在 `parseGameModes()` 已取得 exact mode/background 集合后校验 scope；覆盖无 gameModes、unknown mode、
     background scope、大小写不匹配和 global omission。
   - 把 `gameMode` 保留在 immutable structure 中，验证 scope edit 是 structural、placement visibility edit 仍是 geometry。

3. **实现 editor 作用域事务与 mode 引用维护**
   - 增加 `setLayerGlobal()`/`bindLayerToGameMode()` 或等价集中命令；取消全局时默认绑定当前编辑 mode，
     select 变更必须验证 exact existing mode。
   - mode rename 原子改写 scoped nodes；mode delete 在 scoped users 非空时拒绝并报告；node rename/remove、
     resource rebind 和 project clone/replace 保留 scope。
   - 保持现有 `hiddenPlacements` 恢复逻辑，确认 scope 往返不清空方向 placement、不改变 order。

4. **重排 Inspector 层级并实现大纲灰显**
   - 在普通 layer Inspector 增加默认勾选的“所有状态有效”；未勾选时显示单一“绑定状态”select。
   - 将 default 或 landscape/portrait visibility/placement fieldset 放入当前 scope 分组下面；背景 Inspector、
     main reel Inspector 不显示该控件。
   - 向 layout workspace 传入当前编辑 mode 和画布 variant，按组合可见性给 row 增加灰色样式、状态文案和
     可访问标记；灰行保留 selection/keyboard navigation，order 排序不做过滤。

5. **实现 runtime mode visibility 与 authoring preview 联动**
   - 提取唯一 mode visibility resolver，init 和真实 transition commit 同时切换背景与 scoped ordinary nodes；
     variant placement 继续由 layout runtime 统一叠加。
   - 增加受限 authoring preview stable-mode prepare/commit，复用相同 binding 的 reel/player/sample；不同 binding
     使用 cached target scene prepare，失败 rollback，active transition/prelude 时拒绝。
   - `LayoutPreview`/`app-shell` 在默认 follow 状态下随编辑 mode 自动调用该入口、同步状态文案与右侧 selector；
     transition workspace 仍调用 production prepare/request，不混用两个状态机。

6. **同步 CLI owner graph、文档与自动化验收**
   - 调整 asset groups 的 shared/mode node 集合，验证 scoped node closure 只进入 exact mode，global/legacy 结果
     与现状一致；reference rewrite/optimized reparse 保留 scope。
   - 更新 manifest/README 和三份最小领域规则，说明 global omission、单 mode、variant AND、authoring preview
     与 production transition 的边界、全局 order 和旧数据兼容。
   - 运行 L2 定向命令，记录用户待执行的浏览器项并生成 UTC 中文任务报告。

## 8. 测试与验收

### 测试原则

- parser 测试覆盖 legacy 缺字段 -> global、canonical scoped、unknown/empty/case mismatch、无 gameModes、
  background scope 和 deep-freeze；不接受 silent alias 或首项 fallback。
- editor command/UI 测试覆盖默认勾选、取消后默认当前 mode、改绑、重新全局、mode rename/delete、
  orientation fieldset 嵌套、灰行可选择，以及所有操作保持 order/hidden placement。
- runtime 测试检查真实 node container `visible/renderable`：initial mode、source transition 阶段、exact switch
  commit、target stable、rollback、variant placement AND、相同 binding player/reel identity 与 destroy。
- authoring preview 测试覆盖无 transition 也可选择稳定编辑状态、与 production `requestGameMode()` 相互隔离、
  active transition 拒绝、不同 Symbols binding prepare failure 不改 displayed mode。
- ZIP/CLI 测试覆盖旧 ZIP 导入导出不增业务差异、scoped round-trip、typed rewrite、shared/mode requiredAssets
  和 incrementalAssets；scope 不改变物理 hash 去重或 asset map integrity。
- 与新合同冲突的“全部普通 node 永远 shared”或“编辑 mode 只改 target selector”旧期望应更新，不能为旧测试
  保留错误行为。

### 验收级别

`L2`。任务修改 rendercore Scene Layout public node schema、mode-aware production visibility 和正式 Layout ZIP，
并影响 gamelayouteditor 与 gamelayoutpkgcli 直接 consumer；不改根工具链、lockfile、release 或无界跨包架构，
因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest.test.ts tests/scene-layout/package-runtime-mode.test.ts tests/scene-layout/presentation-surface.test.ts
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor exec vitest run tests/editor-store.test.ts tests/game-mode-commands.test.ts tests/validation.test.ts tests/layout-preview.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/asset-groups.test.ts tests/reference-rewriter.test.ts tests/package-flow.test.ts
git diff --check
```

rendercore/gamelayouteditor typecheck 证明 public schema 与直接 editor consumer 编译一致；三个定向 Vitest 命令
分别保护 schema/runtime、编辑交互/ZIP 和 CLI owner graph。CLI 没有独立 `typecheck` script，其定向测试通过
workspace TypeScript 执行路径加载实际 source，因此不增加根级 typecheck。

### 人工验收

由用户在浏览器执行，执行者在任务报告中逐项记录实际结果：

1. 导入一个旧 Layout ZIP，确认普通图层均默认勾选“所有状态有效”，切换 BaseGame/FreeGame 画面保持旧行为，
   再导出重导无 scope/order/placement 丢失。
2. 新增普通图层，取消全局并绑定 FreeGame；切换 BaseGame/FreeGame 时右侧画布同步，节点在不显示状态灰显但
   可选，在显示状态恢复正常，order 始终不变。
3. orientation-focus 下分别关闭 landscape/portrait，确认开关位于全局/绑定状态分组内；调整预览横竖尺寸后，
   大纲灰显与画布都满足 scope AND variant placement。
4. 在转场工作区单独播放 Spine/Popup 或 video transition，确认 authoring 状态选择没有替代真实转场预览，
   trusted-click 与 exact switch 时序无回归。

### 独立验收建议

`建议`。涉及跨包 public schema、mode commit 与正式 ZIP/asset groups，但不涉及 credential、服务器数据或新资源
ownership/destroy 类型。独立复验重点：legacy 全局语义、transition exact switch 前后 scoped node 可见性、CLI
mode group closure；最多复跑 rendercore、gamelayouteditor、gamelayoutpkgcli 三条定向 Vitest 命令。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不新增依赖、不修改 `pnpm-lock.yaml`。依赖缺失时才运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置现有本地代理并重试原命令，不预先切换 registry 或包管理器。

## 10. 生成物、文档与规则

- 本任务不修改 YAML，也不应产生手改生成文件；若执行中发现 generator/parity consumer，必须使用正式
  generator 并补对应 `--check`，不能手改生成物。
- `docs/scene-layout-manifest.md` 记录 v1 optional `gameMode`、legacy global、组合可见性与 canonical 示例。
- editor/rendercore/CLI README 分别记录 UI、runtime 和 asset group 行为。
- 领域规则只增加稳定合同：普通 node 单 mode/global、authoring preview 与 production transition 隔离、
  global order 和 mode-owned asset closure；不把 task 172 的执行证据复制进规则。
- 不更新根 `AGENTS.md`，不批量改写 production asset manifest。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/172-gamelayouteditor-layer-mode-visibility-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/文件、legacy 决策、计划偏差、自动化命令结果、用户浏览器验收状态、剩余风险。用户尚未
反馈的浏览器项必须写“待用户验收”，不能以单测或 fake runtime 代替。

## 12. 风险、假设与待确认

### 风险

- authoring stable-mode selection 与 production transition 共用 runtime；若 active/prepared 状态清理边界未隔离，
  可能留下旧 target 或误绕过 trusted-click，必须由 API 分层和重入测试保护。
- scoped node 会改变 optimized package 的 mode closure；错误归 shared 会提前加载，错误漏归会导致目标 mode
  缺资源，必须用完整 typed dependency closure 测试而非只检查 root 图片。
- 当前 outline 需要新增画布 variant 输入；preview 尚未 ready 或 resize 中时必须使用最后一次有效 snapshot 并
  显式标记未知，不能猜 landscape/portrait 后错误灰显。
- legacy v1 没有 scope 字段；任何把缺失解释为 initial mode 的实现都会破坏旧画面，必须固定为 global。

### 假设

- “一个图层只能绑定一个状态，或者全局”是最终数据合同，不需要多个状态集合或 per-mode override。
- 状态作用域只针对普通 node；背景继续使用 `gameModes.modes[*].backgroundNodes`，main reel 继续由 Symbols
  binding 和全局 placement/order 管理。
- 默认开启的“跟随编辑状态”继续保留给用户关闭，以便高级转场调试；开启时必须同步真实画布，不再只同步
  selector。若产品要求彻底移除解耦能力，应在执行前确认，因为会改变现有 transition preview 工作流。
- 浏览器人工验收由用户执行；实现会提供可复现步骤和自动化证据，但不会代替用户宣称人工项通过。

### 待确认

无阻塞待确认项。若执行时发现 production consumer 需要在同一普通 node 上表达多个 mode，或 editor 状态切换
必须强制播放真实 transition，则与本计划的单绑定/authoring stable selection 合同冲突，应停止并重新确认。
