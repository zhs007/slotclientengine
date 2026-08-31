# 271 gamelayouteditor-mode-scoped-layers 任务计划

## 1. 目标与完成定义

### 目标

修复 Game Layout Editor 在导入 Task 270 之后的 Scene Layout v7 ZIP 时，把已有普通节点 `scope`
误显示、误编辑为“所有状态有效”的问题。背景继续作为普通 scene node，不恢复背景专属角色；
BaseGame 背景、FreeGame 背景分别通过普通节点的 exact mode × orientation scope 生效。

### 完成定义

- [ ] 导入包含 BaseGame、FreeGame 两个 scoped 普通背景节点的 v7 ZIP 后，Editor 大纲和 Inspector
      显示各节点的真实 mode/orientation scope，不把已有 `scope` 当成全局。
- [ ] 编辑状态或预览状态为 BaseGame 时只显示 BaseGame scope 匹配的背景，切到 FreeGame 时只显示
      FreeGame scope 匹配的背景；最终可见性仍为“scope 匹配且当前 orientation 有 placement”。
- [ ] 普通图层可在 Inspector 中明确切换“所有状态有效”与 exact mode × orientation scope；只有用户
      明确选择全局时才删除 `scope`。
- [ ] 导入、编辑、导出、重导保持 exact `nodes[*].scope`，不扩大成全局、不缩成旧单值
      `gameMode`，也不改变 node id、order、resource、placement 或 bytes。
- [ ] legacy v1–v6 背景仍由 RenderCore 共享 upgrader 转成普通 scoped node；本任务不改变 Scene
      Layout v7 schema、upgrader或 production runtime。
- [ ] 使用用户所述 `new-layout-layout17.5.zip` 完成浏览器人工回归；该 ZIP 不复制进仓库。

## 2. 范围

### 包含

- 收敛 `EditorNodeDraft` 的 mode 可见性表示，使 v7 `scope` 成为唯一 authoring 权威。
- 增加普通图层 scope 查询与事务命令，支持 global 与 exact mode × orientation 可见性。
- 修正布局大纲、图层 Inspector、事件绑定和当前上下文灰显逻辑。
- 保持 mode rename/delete、orientation placement 开关和 scope 的一致性。
- 增加 v7/legacy 导入、Editor round-trip、UI markup/interaction 和状态切换回归测试。
- 更新 Game Layout Editor README 与直接冲突的 Editor 领域规则。

### 不包含

- 不恢复背景 selector、`backgroundNodes`、背景 readiness 或按 node/resource 名称猜测背景。
- 不修改 RenderCore v7 schema、legacy upgrader、runtime visibility 算法或 allocation contract。
- 不改变 main、Symbols、Popup、transition、audio、资源闭包或 ZIP content-addressing。
- 不自动按 `basegame`、`freegame`、文件名、图层顺序或图片尺寸推断 scope。
- 不把用户下载目录中的生产 ZIP 或美术资源提交为测试 fixture。
- 不顺带重写所有 Task 270 之前遗留的 Scene Layout 文档；只修正本任务直接触及的 Editor scope
  说明，完整历史文档迁移另行处理。

## 3. 制定计划时的基线

```text
UTC: 2026-08-31T03:28:24Z
HEAD: e93d66e6bf4c9cba6eb8378350a4082e958f3190
branch: detached HEAD（该提交同时为 main / origin/main / gitee/main）
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `docs/agent-rules/scene-layout.md`
- `docs/agent-rules/editor-artifacts.md`
- `tasks/templates/task-plan.md`
- `tasks/270-gamelayouteditor-centered-main-layout.md`
- `tasks/270-gamelayouteditor-centered-main-layout-260830-084211.md`

`apps/gamelayouteditor` 与 `packages/rendercore` 下没有补充 `AGENTS.md`。

当前结论：

- `packages/rendercore/src/scene-layout/manifest-v7.ts` 的 `parseScope()` 已 strict 校验
  `Record<modeId, orientation[]>`；字段缺失才表示全局。`collectLegacyBackgroundScopes()` 已把旧
  per-mode background binding 转成普通节点 scope。
- `apps/gamelayouteditor/src/model/editor-project.ts` 的 `manifestToEditorProject()` 会把 latest node
  `scope` 原样放进 `EditorNodeDraft`，`editorProjectToManifest()` 也优先导出它，所以导入和导出
  数据链本身能保留 scope。
- 同一个 draft 仍同时声明旧 `gameMode?: string` 与 v7 `scope?`；`legacyEditorNodeScope()` 继续把
  `gameMode` 补成双 orientation scope，形成两套可漂移的 authoring 数据源。
- `apps/gamelayouteditor/src/ui/layout-workspace.ts` 的 `layerMeta()`、`layerVisibleInContext()` 和
  `layerInspector()` 只读取 `node.gameMode`。因此从 v7 ZIP 导入、只有 `scope` 的 BaseGame/FreeGame
  背景会在 UI 被标为“所有状态”，当前上下文灰显也错误。
- `apps/gamelayouteditor/src/model/resource-commands.ts#setLayerGameMode()` 与
  `apps/gamelayouteditor/src/ui/app-shell.ts` 的旧 checkbox/select handler 会删除已有 `scope` 并写入
  单值 `gameMode`，用户操作可能把合法的多 mode/orientation scope 降格。
- mode rename/delete 已同时检查 `gameMode` 和 `scope`；收敛后可只处理 `scope`。
- `docs/agent-rules/scene-layout.md` 已是 v7 generic scope 合同；
  `docs/agent-rules/editor-artifacts.md` 和 `apps/gamelayouteditor/README.md` 仍有 v6、单
  `gameMode`、背景专属描述，与当前代码和 Task 270 合同冲突。
- 规划会话尝试只读访问 `/Users/zerro/Downloads/crave/new-layout-layout17.5.zip`，受 macOS Downloads
  隐私权限阻止，未能确认该文件的实际 manifest。当前代码与测试已足以定位双轨问题；真实 ZIP
  保留为执行阶段浏览器人工验收输入，不据文件名编造内容。

## 4. 需求解释与技术决策

### 需求解释

- “两个普通图层是背景”符合 Task 270：背景不再是特殊类型，本任务不改变这一点。
- “不应该全部 gamemode 都有效”解释为：两个节点必须按 manifest 中的 exact scope 分别生效，
  Editor 不得因没有旧 `gameMode` 字段就把它们展示或编辑为全局。
- BaseGame/FreeGame 只是用户样例，不在代码中硬编码；任意合法 mode id 使用同一通用能力。
- 如果实际 ZIP 的两个 node 根本没有 `scope`，Editor 必须忠实显示为全局，不能凭背景名称自动修复；
  需由用户在 Inspector 显式设置后再导出。

### 关键决策

1. **Editor draft 只保留 v7 `scope`。**
   - 删除 `EditorNodeDraft.gameMode` 与 `legacyEditorNodeScope()`；legacy manifest 的单 `gameMode` 已在
     RenderCore shared upgrader 边界转成 v7 scope，Editor 内不需要第二条兼容路径。
   - public Scene Layout contract 不变，只收敛 app 内部 authoring model。
2. **Inspector 使用通用 mode × orientation scope，不增加背景特判。**
   - `scope` 缺失表示当前有 placement 的方向对全部 mode 生效。
   - `scope` 存在时按 mode 声明顺序、`landscape`/`portrait` 固定顺序显示精确矩阵；同一普通节点可
     选择一个或多个 mode，也可在不同 mode 选择不同 orientation。
   - 从 global 切为 scoped 时，确定性选中“当前编辑 mode × 当前已有 placements”；从 scoped 切回
     global 只有显式勾选“所有状态有效”才能发生。
3. **scope 与 placement 保持 strict 一致。**
   - scope 不能引用不存在的 placement；关闭某 orientation placement 时同步移除所有 mode 对该
     orientation 的 scope 引用。
   - 任何操作若会产生空 scope、空 placement 或其它 v7 非法状态，必须在事务内显式失败并保持原
     project，不得删除 scope 后静默变成全局。
   - canonical scope 只保存非空 mode entry，并按项目 mode 与 orientation 稳定顺序构造，避免 UI
     操作制造非确定性导出。
4. **scope 变化按结构变化刷新 preview。**
   - 继续由 `EditorStore`/RenderCore geometry compatibility 判定走完整 prepare/commit；不把 visibility
     topology 伪装为单纯 placement geometry update。
   - 复用现有 production runtime 的 scoped visibility，不在 app 复制第二套渲染状态机。

## 5. 职责与合同

- **RenderCore data/runtime**：继续拥有 v1–v7 parser/upgrader、v7 scope strict validation、runtime
  visibility 与 atomic mode commit；本任务只作为既有 public contract consumer。
- **Editor model**：只保存 `EditorNodeDraft.scope`；提供纯查询和事务命令，维护 scope、mode rename/delete
  与 placement 的一致性。
- **Editor UI**：忠实投影 global 或 exact mode × orientation scope；大纲灰显、Inspector checked 状态和
  feedback 均来自同一 model helper。
- **Import/export**：import 先由共享 upgrader 得到 canonical v7，再建立 Editor draft；export 从 draft
  原样构造 v7 scope、重建 allocation 并 strict 复验。
- **失败策略**：unknown mode/orientation、scope 引用缺 placement、清空最后一个有效上下文或非法 imported
  scope 显式失败；失败不修改项目、不把节点扩大为全局。
- **禁止行为**：不得硬编码 BaseGame/FreeGame、猜背景、保留 `gameMode`/`scope` 双写、增加 fallback、按
  filename/order 推导 owner，或在 UI session 另存 scope。

## 6. 文件范围

### 预计新增

```text
tasks/271-gamelayouteditor-mode-scoped-layers-<utctime>.md
```

### 预计修改

```text
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/resource-commands.ts
apps/gamelayouteditor/src/model/game-mode-commands.ts
apps/gamelayouteditor/src/ui/layout-workspace.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/validation.test.ts
apps/gamelayouteditor/tests/game-mode-commands.test.ts
apps/gamelayouteditor/tests/ui-session.test.ts
apps/gamelayouteditor/tests/editor-store.test.ts
apps/gamelayouteditor/tests/app-shell.test.ts
apps/gamelayouteditor/tests/zip-io.test.ts
apps/gamelayouteditor/README.md
docs/agent-rules/editor-artifacts.md
```

测试文件以实际已有覆盖点缩小；不为凑清单创建重复测试。

### 原则上不应修改

```text
packages/rendercore/**
apps/gamelayoutpkgcli/**
packages/gameframeworks/**
assets/**
pnpm-lock.yaml
package.json
pnpm-workspace.yaml
docs/agent-rules/scene-layout.md
/Users/zerro/Downloads/crave/**
```

若执行发现真实 ZIP 的 manifest 已缺少 scope，或必须改变 RenderCore v7 schema/upgrader/runtime 才能修复，
属于明显范围扩张，先停止并报告证据。

## 7. 实施步骤

1. **确认执行基线与真实 artifact 合同**
   - 重核 HEAD、工作区、本计划与两份领域规则。
   - 用 synthetic fixture 确认 v7 singleton/multi-mode/orientation scope 的当前 import/export 行为；若执行环境
     可读真实 ZIP，只读取 `layout.manifest.json` 并记录两个背景 node 的 id、placements、scope，不复制 bytes。
2. **收敛 Editor scope model**
   - 从 `EditorNodeDraft` 删除旧 `gameMode`，删除 export-time legacy fallback。
   - 在 model command 层增加 global/scoped 切换、exact mode/orientation toggle、当前上下文可见性与稳定
     scope 描述 helper；所有调用共享同一语义。
   - 调整 placement visibility、mode rename/delete，保证 scope 不悬空、不静默扩大。
3. **接入大纲、Inspector 与事件**
   - 大纲 meta 显示“所有状态”或 exact mode/orientation 摘要，并按当前 mode+orientation 正确灰显。
   - Inspector 用全局开关和 mode×orientation checkbox matrix 编辑 scope；placement 编辑仍负责几何存在性，
     scope checkbox 只允许引用已有 placement。
   - 替换旧 `data-layer-game-mode` handler，事务成功后给出 exact scope feedback；失败沿用 store 的原子错误路径。
4. **保护 import/export 与 preview 行为**
   - 增加 legacy per-mode background→v7 scope→Editor draft 与原生 v7 scoped node 的 round-trip 测试。
   - 验证 global、singleton、multi-mode、orientation-subset 四种情况，且 export/reimport 不改变 scope。
   - 验证 scope 编辑被判为 structural change，当前 mode preview 只呈现匹配节点，切 mode 后可见背景互换。
5. **同步文档与收尾**
   - 把 README 的普通图层 scope 说明更新为 v7 generic mode×orientation 合同，删除本段旧单 `gameMode` 与
     背景特殊描述。
   - 最小更新 `editor-artifacts.md` 中直接冲突的 Layout Editor version/scope 规则；不复制 manifest 全文。
   - 执行 L1 验收、完成真实 ZIP 浏览器人工验收，并生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- model 测试覆盖 global→scoped、scoped→global、增加/移除 mode-orientation、unknown mode、缺 placement、
  拒绝清空最后上下文和事务不变性。
- mode command 测试覆盖 rename 精确改写所有 scope key、仍被任一 scope 引用时禁止 delete。
- UI 测试覆盖导入 `{BaseGame:[landscape,portrait]}` 与 `{FreeGame:[landscape,portrait]}` 后的 label、checked
  matrix、当前上下文灰显和事件 payload，不只断言 DOM 元素存在。
- ZIP 测试使用最小 synthetic v6/v7 manifest 与 1×1 自有图片 bytes，覆盖 import→draft→export→reimport
  exact scope；不提交用户 ZIP。
- preview 测试验证两个普通背景 node 随 authoring mode commit 互斥可见，并证明没有背景专属分支。
- global node 缺 scope 的兼容行为必须保持；已有 node identity/order/resource/placement 与 runtime allocation
  不因 scope UI 修复而漂移。

### 验收级别

`L1`。修改限定在 `apps/gamelayouteditor` 的内部 authoring model/UI 与文档；不改变跨 package public API、
Scene Layout schema、生成器或 lockfile。RenderCore 已有 v7 scope parser/upgrader/runtime 测试不重复全量运行。

### 执行会话必须运行

```bash
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor exec vitest run tests/validation.test.ts tests/game-mode-commands.test.ts tests/ui-session.test.ts tests/editor-store.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor build
pnpm --filter gamelayouteditor format:check
git diff --check
```

测试失败时先最小化到 scope fixture；只有证据表明 shared parser/runtime 回归才升级到对应 RenderCore 定向测试，
不直接运行整仓命令。

### 人工验收

在浏览器打开 Game Layout Editor，导入下载目录 `crave/new-layout-layout17.5.zip`：

1. 选择 BaseGame，确认 BaseGame 背景节点显示 exact BaseGame scope，FreeGame 背景在当前上下文灰显且画布
   不显示；切到 FreeGame 后结果互换。
2. 检查 landscape/portrait，两方向均按各自 scope 与 placement 生效；Inspector 不把两个节点的“所有状态
   有效”误勾选。
3. 不改 scope 直接导出并重导，确认 exact scope 不变；再显式修改一个 mode/orientation checkbox，确认只影响
   该上下文且 preview、manifest preview、重导结果一致。

若执行环境仍无 Downloads 权限，由用户完成这三项；执行报告必须把它列为未完成人工验收，不能用 synthetic
fixture 冒充真实 ZIP 验收。

### 独立验收建议

`建议`。不涉及 credential、服务器数据或新 public schema，但涉及正式 Layout ZIP 的 import/export 语义。
独立复验重点是 exact scope round-trip、BaseGame/FreeGame 互斥可见和显式 global 操作不会误触发。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；不切换 npm/yarn。
- shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置既有本地代理并重试原命令。
- 本任务不新增依赖、不修改 lockfile、不要求网络访问。

## 10. 生成物、文档与规则

- 本任务无 schema/YAML 生成物；v7 `runtimeAllocation` 继续由正式 API 重建，禁止手改。
- 更新 `apps/gamelayouteditor/README.md` 中普通图层 scope、v7 import/export 与人工操作说明。
- 最小更新 `docs/agent-rules/editor-artifacts.md` 的直接冲突条目，使其与
  `docs/agent-rules/scene-layout.md` 的 v7 generic scope 合同一致。
- 根 `AGENTS.md` 和 `docs/agent-rules/scene-layout.md` 已包含稳定职责，不重复追加任务细节。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/271-gamelayouteditor-mode-scoped-layers-<utctime>.md
```

UTC 文件名通过 `date -u +%y%m%d-%H%M%S` 生成。报告简要记录最终实现、实际修改文件、计划偏差、
自动验收、真实 ZIP 人工验收状态与剩余风险；不收集无关 coverage 或整仓统计。

## 12. 风险、假设与待确认

### 风险

- 用户 ZIP 的两个背景 node 若实际缺少 scope，忠实导入后仍应显示全局；本任务禁止按名称猜测，需用户显式
  选择 scope 或另查 ZIP 生成端为何丢失字段。
- scope 与 orientation placement 是两个相关合同；UI 若只改其中一处可能产生 scope 引用不存在 placement，
  必须由 model 命令统一维护并由 v7 parser 复验。
- scope 变化属于结构变化，preview 可能完整 prepare；必须保持既有失败零提交和已选编辑/预览 mode 语义。
- README/Editor 领域规则存在 Task 270 前的其它过时段落；本任务只修直接冲突内容，避免文档清理扩大实现范围。

### 假设

- `new-layout-layout17.5.zip` 是受支持的 Scene Layout ZIP，且用户观察到的两个背景来自普通 node；实际
  scope 是否存在以执行时 manifest 为准。
- RenderCore v7 `scope` parser/upgrader/runtime 行为正确，当前缺口位于 Game Layout Editor 的 authoring
  draft/UI 双轨。
- “全部 gamemode 有效”只允许由 `scope` 缺失表达，不新增 `all: true` 或其它 alias。

### 待确认

无。真实 ZIP 内容在规划环境不可读的限制已转为显式人工验收，不影响根据当前仓库证据制定实现计划。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] `EditorNodeDraft` 不再保留 `gameMode`/`scope` 双轨。
- [ ] 导入、UI、preview、导出和重导使用同一 exact scope。
- [ ] BaseGame/FreeGame 背景作为普通节点按各自 mode/orientation 生效。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] 测试、README 和领域规则已按需同步。
- [ ] 指定自动化验收已通过。
- [ ] 自动化与真实 ZIP 人工验收已明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`scene-layout.md` 与 `editor-artifacts.md`；
2. 核对 Git 基线、工作区和当前 v7 scope contract；
3. 先证明 imported scope 与 UI 旧 `gameMode` 双轨的最小复现，再按计划收敛；
4. 不把真实 ZIP/美术复制进仓库，不按背景名称猜 scope；
5. 小幅适配当前实现时在报告记录，若需改 RenderCore/schema 则先停止说明；
6. 只运行计划规定的 L1 验收；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
