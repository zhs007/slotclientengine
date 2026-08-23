# 241 editorcore-gamelayout-event-dialog 任务计划

## 1. 目标与完成定义

### 目标

在 `packages/editorcore` 提供可复用的 Game Layout event group 编辑 dialog，并在 `apps/editordemo`
完成隔离验收。使用者先通过现有统一 Assets 管理导入 Game Layout Editor 导出的 current mapped ZIP；dialog
显式绑定其中一个 Layout root，并以该 ZIP 编译出的唯一 event catalog 为准，编辑一组有序 event 条目。

dialog 采用轻量 master-detail：左侧是可新增、选择、修改、移除的 event 条目列表，一项可以用两行摘要而不强求
视觉上恰好一行；右侧是当前条目的渐进式编辑器。编辑器按 catalog facets 逐步缩小候选，但不堆叠过深的树状
dropdown。用户提到的动画 owner、symbol/state、指定行列都只是候选形态示例；shared code、fixture 和 UI 不固定
任何具体业务名，实际 event、owner、state、坐标和 lifecycle 完全由所选 ZIP 的 typed catalog 决定。

### 完成定义

- [ ] Editordemo 的现有 Assets dialog 能原子导入 current Gamelayout Editor mapped ZIP；导入结果是一个
      `game-layout` root，保留 normalized logical filename keys、nested Symbols/Popup owner identity 与 exact closure。
- [ ] 新共享 dialog 只列出所选 `game-layout` root 的正式 catalog event；没有 Layout、ZIP 无效、catalog 无法
      编译、存在未完成条目或条目已失效时，整组不能确认。
- [ ] dialog 可从空组新增多个 event，选择任一条目进入编辑，原子保存本条修改，移除任一条目；取消条目编辑不
      改组，取消整个 dialog 不回调 host，确认时一次提交完整有序组。
- [ ] 条目编辑是渐进式但浅层：先选 event family，再用 searchable owner/candidate 区和 family-specific 紧凑
      fieldset 选择剩余 facets；breadcrumb/摘要持续显示当前路径，不要求用户操作多层嵌套 tree dropdown。
- [ ] dialog 对 ZIP catalog 提供的所有 event entry 一视同仁；animation、Symbol state/coordinate、Popup、mode、
      transition、variant 等仅在该 ZIP 确实编译出对应 entry/facet 时出现，任何业务 identity 都不由 EditorCore 预置。
- [ ] task 240 的 Symbol `*/*`、`x/*`、`*/y`、`x/y` 可通过一个紧凑 scope control 表达；若 ZIP 没有相应
      binding/symbol/state/coordinate，UI 不显示或接受该组合。
- [ ] dialog 确认结果是 immutable `{ rootKey, events: readonly { address, descriptor }[] }` event group，保持列表
      顺序并由 callback 交给 host；本任务不把 group 写入 Demo project、Layout manifest 或 Assets catalog。
- [ ] Layout 替换后逐条复验 exact address：仍存在的条目保留，消失的条目标为失效并要求修改/移除；切换组的
      Layout root 时必须显式清空已有条目，禁止按相似名字迁移。
- [ ] 关闭/destroy 后无 controller subscription、pending inspection、row draft 或 stale DOM commit。
- [ ] EditorCore/Editordemo README、定向自动化、真实浏览器人工验收说明和 UTC 中文执行报告完成。

## 2. 范围

### 包含

- 对 EditorCore current Game Layout ZIP importer 的正式 owner-package integration fixture、strict failure 和
  round-trip 保护；不另建导入入口。
- 从 RenderCore 当前 runtime address controller 抽出 UI 可消费的纯 immutable event catalog/facet contract，
  并由 production runtime 与 editor inspection 共用同一 compiler。
- EditorCore 的 Layout-root-to-event-catalog adapter、event group data contract、native dialog、条目列表、渐进式
  条目编辑、canonical address 展示/copy、组级确认/cancel、focus 与 destroy。
- Editordemo 的“Events”入口、当前 event group 只读展示，以及使用中性 identity 的 current Layout ZIP 自包含
  fixture 集成测试。
- RenderCore、EditorCore、Editordemo 的直接测试、README/reference 与最小领域规则同步。

### 不包含

- 不修改 Gamelayout Editor 的 authoring、ZIP exporter、manifest/schema/version、event producer/dispatch 顺序或
  task 240 runtime 性能合同。
- 不把 event group 持久化到任何正式 Editor project、Scene Layout manifest、Demo archive 或游戏配置；
  host 后续如何保存和执行 listener 另行规划。
- 不在 Editordemo 创建 Scene Layout production runtime、播放真实事件或模拟 listener dispatch；本任务验收的是
  ZIP import、catalog parity 与 event group 编辑。
- 不增加 arbitrary address 输入、glob/regex、业务 alias、首项默认、任何业务 event/name 硬编码、路径/hash 推断或
  malformed package fallback。
- 不增加 event group 命名、嵌套 group、drag reorder、批量复制/删除或 event 对应 action 配置；本任务只编辑一个
  有序 event 列表，host 可用同一 dialog 分别编辑多组。
- 不迁移 `apps/gamelayouteditor`、`imgnumbereditor`、`popupeditor`、`symbolseditor` 到 EditorCore UI。
- 不新增依赖、不修改 lockfile、production assets、game002/game003 或外部 pixicrave/piximinecart2。

## 3. 制定计划时的基线

```text
UTC: 2026-08-23T04:04:54Z
HEAD: 5116c5b4730836f0c7beb664978139636d16c0cf
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{editor-artifacts,scene-layout,shared-game-runtime}.md`、任务 229/231 的计划与报告、任务 240
  的计划与报告及 `docs/gamelayout-runtime-addresses.md`；目标目录没有补充 `AGENTS.md`。
- `packages/editorcore/src/assets/adapters/default-adapters.ts#discoverGameLayoutPackage()` 已识别根
  `layout.manifest.json` + `assets.map.json`，用 RenderCore parser/closure 生成 `game-layout` root；
  `default-export.ts#exportGameLayout()` 可重新导出 mapped ZIP。
- 当前 Game Layout adapter 测试位于 `packages/editorcore/tests/adapters-and-ui.test.ts`，fixture 只有一张背景图和
  一个 opaque extra；没有使用 nested Symbols/Popup、task 240 event owner 或 Editordemo public workflow 证明
  Gamelayout Editor current ZIP 可用。
- `apps/editordemo/src/main.ts` 当前只挂载 `mountEditorAssetsDialog()`；Demo 测试只覆盖单 PNG 的工程 archive，
  没有 Game Layout root 或 event UI。
- task 240 event descriptor 在
  `packages/rendercore/src/scene-layout/core/runtime-address.ts#createGameLayoutRuntimeAddresses()` 中随 runtime
  endpoint/bridge 一次编译。`addresses.list({kind:"event"})` 是唯一正式 catalog，但没有从 mapped package bytes
  进行 DOM/GPU-free inspection 的 public API。
- task 240 已固定 Symbol instance address 的 exact/wildcard `x/y` 组合；authored/program Spine address 只定位
  owner + lifecycle，实际 animation 和 ended outcome 位于 occurrence detail。计划不得为 UI 改写该合同。
- 本计划不审计 Git 历史；当前代码、测试、任务 240 报告和正式 address reference 足以确认合同与缺口。

## 4. 需求解释与技术决策

### 需求解释

1. “Editordemo 正确导入 Gamelayout Editor ZIP”不是增加第二个 file input，而是让 current unified Assets
   importer 对正式 mapped package 的 manifest、map、nested owner closure 和 logical keys 有集成证据；失败仍走
   `prepareImport()` blocking diagnostic，不能部分 commit。
2. “一组组的 event”在本任务解释为一次编辑一个 event group：group 绑定一个 Layout root，内部是保持顺序的
   event entry 列表。host 可以用同一组件编辑多个 group；dialog 本身不发明 group name 或嵌套结构。
3. “一行一个 event”描述信息架构而不是像素高度。列表 item 用一到两行显示 family、owner/facet 摘要与 canonical
   address，可选择编辑或移除；复杂字段放在右侧 detail editor，不把全部 controls 塞进表格行。
4. “渐进式选择”是受 catalog facets 驱动的逐步收窄，不是字符串拼接器。family 后显示 searchable owner/candidate，
   剩余字段在一个 context panel 内编辑；breadcrumb 显示进度。只有 catalog 中真实存在的 exact descriptor 才能
   保存为条目。
5. 具体 event 只能来自 ZIP。动画、Symbol、Popup、mode 等 family 是 runtime typed facet；具体 node/resource、
   binding、symbol、state、tier、edge 和 coordinate 均由所选 package catalog 提供，测试使用中性 identity。
6. Symbol 坐标直接属于 canonical address。若 catalog 提供相应候选，scope control 可表达“全部、指定列、指定行、
   指定格”，分别映射 `*/*`、`x/*`、`*/y`、`x/y`；不把 selector 放到 `bind()/wait()` 的额外参数。
7. event group 只是 EditorCore 与 host 的 UI 输入/输出。Editordemo 展示完整 group 用于测试，但不假设未来 consumer
   的配置 schema，也不自动注册 listener。

### 关键决策

1. **RenderCore 抽出唯一纯 catalog compiler**
   - 将 descriptor/facet 编译从 runtime endpoint bridge 中分离；production controller 和 editor package inspector
     必须调用同一 compiler，并有同 fixture parity test。
   - `scene-layout/editor` 增加从 current mapped manifest + logical files strict inspection event catalog 的入口；
     只解析 schema/nested owner metadata，不创建 Pixi Application、texture/player、Object URL、ticker 或 runtime。
   - catalog entry 提供 discriminated event family 与 exact owner/state/coordinate/lifecycle facets，EditorCore 不解析
     address segment 来重建语义。
2. **Event group UI 留在 EditorCore Assets public surface**
   - 新 dialog 接收现有 `EditorAssetsController<TProject>`，显式选择 `kind="game-layout"` root，通过 injected/default
     provider 得到 catalog；headless Assets core 继续不依赖 RenderCore adapter。
   - public mount API 采用现有 DOM facade 风格，接受 initial group，提供 `setValue/open/close/destroy` 和
     `onConfirm(group)`；open 时 clone host value，只有组级确认才回调，不引入第三方 data-grid/wizard/dialog 库。
3. **采用 master-detail，而不是深层树下拉**
   - dialog 顶部固定 Layout root；左侧为可滚动 event list 与“添加 Event”，右侧为当前 row draft editor。窄屏改为
     上下布局；列表项只显示摘要、状态与 edit/remove，不内嵌全部 facet controls。
   - detail editor 最多同时展示 family selector、searchable candidate 区和一个 family-specific fieldset；通过
     breadcrumb/summary 告知完整层级。候选很多时先搜索/分组再选择，不创建多层 hover tree menu。
   - 新增/修改先在 isolated row draft 完整验证，再原子写入 dialog group draft；row cancel 丢弃修改，group cancel
     丢弃本次全部 add/edit/remove。
4. **不默认选择首项或迁移 identity**
   - 即使只有一个 Layout/family/owner，也显示候选但要求用户显式选择；每一步只在前一步完成后启用。
   - 对 catalog 中尚未支持的 typed family 显示 blocking diagnostic，不能静默隐藏后仍宣称“全部 event”。
   - Layout root 改变且 group 非空时要求用户显式清空；替换同 root 时只按 exact address 复验，不按 label/相邻项
     猜测迁移。
5. **Import 与 inspection 分层**
   - ZIP 导入只提交 normalized workspace/catalog；event inspection 从已提交 root exact closure 读取 snapshot，失败不
     修改 workspace/project。
   - 把 `default-export.ts` 已有的 Game Layout root materialization/closure 检查提取为共享 adapter helper，避免 export
     与 event inspector 各自猜 root manifest/control path。

## 5. 职责与合同

- **RenderCore Scene Layout data/core**：canonical address、descriptor、event family facet 与唯一 catalog compiler；
  runtime controller 继续拥有 endpoint、listener/waiter、interest index、emit 和 destroy。
- **RenderCore Scene Layout editor**：从 mapped package logical files strict 解析 Layout、nested Symbols/Popup 和
  Spine owner metadata，返回 immutable catalog；不加载展示资源或复制 runtime state machine。
- **EditorCore default adapter**：确认 selected root 是 `game-layout`，从 snapshot exact closure 物化 inspector 输入，
  调用 RenderCore editor API；不读取 physical hash path、不扫描 filename 猜 owner。
- **EditorCore UI**：拥有 dialog DOM、group/row draft、event list、渐进式 detail editor、copy、row save/cancel、
  group confirm/cancel、focus return、catalog request generation 和 destroy；不保存业务 project/schema。
- **Editordemo**：只用 EditorCore public API 演示导入与 group 编辑，显示最后一次 confirmed group；不导入 Gamelayout Editor app
  source，也不复制 catalog/UI。
- **失败策略**：unknown root/family/owner/state/lifecycle、越界坐标、缺 nested manifest/bytes、坏 map/schema、stale
  async result 和 destroyed dialog 全部显式失败；任何 inspection/UI failure 不修改 controller snapshot。
- **禁止行为**：第二份 event 表、raw address 文本框、业务名 alias、首项 fallback、从 manifest 字符串随意遍历、
  orphan 宽松吞掉、未完成 row 保存、partial group 确认或 dialog destroy 后 commit。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/core/runtime-address-catalog.ts
packages/rendercore/src/scene-layout/editor/runtime-event-catalog.ts
packages/rendercore/tests/scene-layout/runtime-event-catalog.test.ts
packages/editorcore/src/assets/adapters/game-layout-events.ts
packages/editorcore/src/assets/ui/game-layout-event-dialog.ts
packages/editorcore/tests/game-layout-event-dialog.test.ts
apps/editordemo/tests/game-layout-event-dialog.test.ts
tasks/241-editorcore-gamelayout-event-dialog-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/{data/runtime-address,core/runtime-address}.ts
packages/rendercore/src/scene-layout/{data,core,editor}/index.ts
packages/rendercore/tests/scene-layout/runtime-address.test.ts
packages/editorcore/src/assets/adapters/{default-adapters,default-export,index}.ts
packages/editorcore/src/assets/{index,data/types}.ts
packages/editorcore/src/assets/ui/index.ts
packages/editorcore/src/assets/ui/assets-view.css
packages/editorcore/{README.md,package.json}
packages/editorcore/tests/{adapters-and-ui,source-boundary}.test.ts
apps/editordemo/src/{main,styles}.css
apps/editordemo/{README.md,index.html}
docs/gamelayout-runtime-addresses.md
docs/agent-rules/{editor-artifacts,scene-layout}.md
```

`package.json` 只在新增既有 `./assets` 子路径所需 export/build copy 配置时修改；不得新增 dependency 或改
`pnpm-lock.yaml`。执行时可按现有模块粒度小幅调整文件名，但不得合并 RenderCore catalog owner 与 EditorCore UI。

### 原则上不应修改

```text
apps/{gamelayouteditor,imgnumbereditor,popupeditor,symbolseditor,game002v2,game003v2}/**
packages/{editorresource,browserartifactio,gameframeworks,logiccore,uiframeworks}/**
packages/rendercore 的 event producer/manager、Popup/Symbol runtime 状态机和 manifest schema
assets/**
{AGENTS.md,pnpm-lock.yaml,pnpm-workspace.yaml}
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

若纯 catalog 无法在不扩张 schema、加载 GPU resource 或改变 task 240 address 的前提下提供，执行会话必须先说明
具体缺口；不得以 EditorCore 私有 parser/event table 绕过。

## 7. 实施步骤

1. **确认执行基线和 catalog facet matrix**
   - 重核 HEAD/status、current Gamelayout ZIP output、EditorCore root materialization、task 240 catalog 与两份领域规则。
   - 用完全中性的 package identity 构造 fixture，按 compiler 实际输出确认 family/facet coverage；不把用户举例的
     event/name 写入 shared fixture、branch、默认值或专用 UI 文案。
2. **抽出 RenderCore 纯 event catalog**
   - 把 address descriptor/facet 编译与 endpoint/event manager 分开；`createGameLayoutRuntimeAddresses()` 委托新
     compiler 后再装配 endpoint 和 dispatch metadata，保持 list/describe/bind/wait 行为及顺序不变。
   - 在 editor layer 实现 mapped package inspection，strict 读取 nested Symbols state、Popup phase/tier 与 Spine owner
     metadata；返回 frozen entries，不创建 runtime/display resource。
   - 添加 runtime/editor catalog parity、unknown/duplicate owner、missing nested bytes 和 zero DOM/GPU side-effect 测试。
3. **加固 Game Layout Assets import 合同**
   - 提取 Game Layout root 的 manifest + logical closure materializer，供 import reopen、single-root export 和 event
     inspection 共用；保留 current filename-key namespace 与 unified conflict review。
   - 用 current Gamelayout mapped ZIP 形状覆盖 nested Symbols、Popup、authored Spine 和 opaque extra；验证原子导入、
     exact root closure、single-root re-export/reopen，以及坏 map/hash/missing reference 不 commit。
4. **实现 EditorCore event group contract/provider**
   - 定义 immutable `{rootKey, events}` group、event entry 与 catalog view types；default provider 只接受 committed
     `game-layout` root 并调用 RenderCore inspector，provider 可注入以便 DOM 单测。
   - 提供 group/entry exact validation；open、row save 和 group confirm 都按当前 snapshot 复验 address，输出深冻结并
     保持列表顺序。
5. **实现 master-detail event group dialog**
   - 顶部显式选择 Layout；左侧 event list 支持 add/select/edit/remove、empty state、invalid badge 与一到两行摘要；
     右侧 detail editor 使用 isolated row draft，row save/cancel 与 group confirm/cancel 分层。
   - detail editor 先选 family，再显示 searchable/grouped owner candidate 与一个 context fieldset；用 breadcrumb 和
     canonical address preview 表达完整路径，避免深层 tree dropdown 和一行塞满 controls。
   - family-specific fieldset 完全按 catalog facets 生成；Symbol coordinate 若存在则用单个 scope control 收口四种
     exact/wildcard 组合，animation 只读展示 catalog metadata，不写业务特例。
   - 加入 address copy、Escape/focus return、unsaved row/group cancel、loading/error、controller subscription、Layout
     replacement revalidation、stale request guard、responsive master-detail 和幂等 destroy。
6. **接入 Editordemo**
   - 在现有 Assets 管理入口旁挂载 Events dialog trigger；无 Layout 时给出明确状态，导入后可编辑 group，确认后
     只读显示 `{rootKey,events}` 与每个 canonical address。
   - reset/remount 时按 `dialog → controller` 顺序 destroy；Demo archive 不保存 event group。
7. **测试、文档与收尾**
   - EditorCore DOM 测试覆盖 empty/add/edit/remove、多条顺序、row/group cancel、progressive facet、深候选搜索、
     coordinate scope、invalid replacement、copy、responsive/focus/destroy；Editordemo 集成测试覆盖 public workflow。
   - 更新 README/address reference 和最小领域规则，运行 L2 定向验收，完成真实浏览器人工验收记录并生成 UTC 报告。

## 8. 测试与验收

### 测试原则

- fixture 必须是包内自包含 current v4 mapped ZIP，并以中性 identity 包含足够的 nested owner/facet 组合；不读取
  Crave/Minecart2 production assets，也不把用户举例的业务 event/name 固定为能力合同。
- catalog parity 测试比较同一 typed package 的 runtime `addresses.list({kind:"event"})` 与 editor inspection 地址/facet，
  防止 UI catalog 漂移；不复制一份 expected business address table掩盖 compiler 分叉。
- import 覆盖正常 current ZIP、包裹目录、map logical key、nested closure、opaque extra、missing reference、坏 hash/path、
  future schema 和 conflict review；失败前后 snapshot identity/bytes 不变。
- UI 覆盖空组、新增多条、编辑中 cancel、保存修改、移除、组级 cancel/confirm、顺序保持、上游 reset、空候选、
  单候选仍需显式选择、候选搜索、0/last/越界 coordinate、rapid root switch、replacement、close 与 destroy；测试
  不以 fake provider 代替至少一条 RenderCore inspector 集成路径。
- 保留任务 229/231 的 Assets dialog、preview/export、10,000-root 和 Demo archive 回归，不为旧测试扭曲新合同。

### 验收级别

`L2`：新增 RenderCore→EditorCore public catalog contract，并由 Editordemo 直接消费正式 Game Layout ZIP；不修改
schema、production asset、依赖、lockfile、根工具链或 release，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/editorcore --filter editordemo typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address.test.ts tests/scene-layout/runtime-event-catalog.test.ts
pnpm --filter @slotclientengine/editorcore test
pnpm --filter editordemo test
pnpm --filter editordemo build
git diff --check
```

### 人工验收

1. 在浏览器打开 Editordemo，通过 Assets 管理导入一份 current Gamelayout Editor ZIP，确认显示一个
   `game-layout` root，关闭/reopen Assets dialog 后仍可被 Events dialog 枚举；候选 identity 与该 ZIP 内容一致。
2. 从空组连续新增多个该 ZIP 实际提供的不同 event；确认左侧每项摘要可辨识、选择 item 后右侧只显示相关 facets，
   breadcrumb/address 与 catalog 一致，候选较多时能搜索而无需展开深层树菜单。
3. 修改中 cancel 后原 item 不变，再次修改并保存后只更新该 item；移除任一 item 后其它 item 与顺序不变；取消
   整个 dialog 后 host group 不变，确认后一次收到完整 immutable group。
4. 若实际 ZIP 提供 Symbol coordinate event，分别选择全部、指定列、指定行和指定 cell，确认 canonical `x/y` 与
   0-based UI 一致；若 ZIP 不提供该 family，则 UI 不出现虚构候选。其它 family 同样只抽查 ZIP 实际具备的 entry。
5. 替换 Layout 使已有 address 消失时 item 明确标为 invalid；切换 Layout 时要求显式清空。快速切换、关闭/reopen、
   reset 和 destroy 后无 stale option、未保存 row、重复 trigger、焦点丢失或控制台异步错误。

### 独立验收建议

`必须`：涉及跨包 public catalog、正式 Gamelayout ZIP 与未来 consumer 会保存的 event identity。重点复验唯一
compiler parity、nested Symbols coordinate address 和 invalid ZIP 原子性，最多运行：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime-address.test.ts tests/scene-layout/runtime-event-catalog.test.ts
pnpm --filter @slotclientengine/editorcore test
pnpm --filter editordemo test
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后设置仓库约定代理并重试。
- 本任务复用现有 RenderCore、EditorResource、BrowserArtifactIO、Pixi 和 DOM 能力，不新增依赖、不修改 lockfile。
- 若 package export/build copy 需要更新，只修改 EditorCore importer metadata；出现 lockfile 漂移时停止查因，不接受顺带升级。

## 10. 生成物、文档与规则

- 本任务没有 YAML、production manifest 或生成 TypeScript；`dist` 只由 build 产生，禁止手改或提交缓存。
- `packages/editorcore/README.md` 记录 event group dialog mount API、controlled value/confirm callback、master-detail
  row editing、渐进式 facet、Assets root 要求和 lifecycle；`apps/editordemo/README.md` 记录 current Gamelayout
  ZIP→event group 编辑验收流程。
- `docs/gamelayout-runtime-addresses.md` 只补充纯 catalog/editor inspection 与 selector 不改变 runtime address 的说明，
  不复制完整 UI 步骤。
- 最小更新 `editor-artifacts.md` 的“EditorCore event UI 消费唯一 typed catalog”边界和 `scene-layout.md` 的
  runtime/editor 共用 compiler 边界；不修改根 `AGENTS.md` 或回写任务 240 历史文件。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/241-editorcore-gamelayout-event-dialog-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 catalog/event-group API、实际文件、current ZIP fixture、
runtime/editor parity、master-detail UI 流程、自动验收、浏览器/独立验收、计划偏差和剩余风险；不收集无关 coverage、整仓统计、
完整历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 当前 runtime catalog 与 endpoint/bridge 同文件编译；若只在 EditorCore 复刻 address grouping，新增 task 240 event
  时会静默漂移，因此必须先抽唯一 compiler 并做 parity test。
- current Game Layout root 在 workspace 中把 control manifest 改为 `<id>-layout.manifest.json`；event inspector 若把它
  当正式 ZIP root path，会找不到 manifest，必须复用 export 的结构化 materializer。
- Symbol event 候选数按 binding×symbol×state×coordinate 增长；dialog 应按 facets 级联过滤，不一次渲染全部 exact
  address。若把每层都做成嵌套 dropdown 会难以操作，应使用 searchable candidate + context fieldset；任何 UI
  优化都不能引入 glob scan 到 runtime hot path。
- Layout replacement 与 catalog inspection 都可能异步完成；缺 generation guard 会让旧 package options 覆盖新 snapshot。
- animation name 不属于 task 240 lifecycle address；UI 若为“更精确”擅自加 segment，会生成 runtime 不认识的地址。
- row draft 与 group draft 是两层 transaction；若直接双向绑定 host value，row cancel/group cancel 会失去意义并留下
  半编辑列表。

### 假设

- “特定列/特定行”沿用 task 240 的 visible settled reel `x/y`，分别表示从 0 开始的 column/row；不是服务器 reel
  strip index、Pixi 坐标或 cascade 中间位置。
- 用户列出的动画、Symbol、state 和行列均只是交互示例；shared UI 与自动 fixture 不假定这些 exact identity 存在，
  每个候选都从所选 ZIP catalog 实时派生。
- current Gamelayout Editor export 继续以根 `layout.manifest.json`、`assets.map.json` 和 content-addressed payload 为正式
  consumer 输入；legacy ZIP 兼容保持现状，但不是本任务新增能力。
- 一个 event group 绑定一个 Layout root且只包含有序 event entries；多 group 的命名、持久化和 action 绑定由 host
  拥有，不属于本组件。

### 待确认

无。

## 13. 完成清单

- [ ] current Gamelayout Editor ZIP 经统一 Assets importer 原子导入并可 round-trip。
- [ ] runtime/editor 共用唯一 event catalog compiler，地址与 facet parity 有测试。
- [ ] EditorCore event group dialog public API、add/edit/remove、row/group transaction、focus/destroy 完成。
- [ ] 渐进式 master-detail 易操作，深候选使用搜索/context fieldset，不堆叠过深 dropdown。
- [ ] 具体 event 完全由 ZIP catalog 决定，所有实际 catalog family 无静默遗漏或 raw-address fallback。
- [ ] Editordemo public workflow、README、领域规则和指定 L2 验收完成。
- [ ] 自动化、浏览器人工与独立验收结论明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划与本计划列出的三份领域规则；
2. 核对 Git 基线、任务 240 current API 和工作区，保留所有用户已有/无关修改；
3. 按“RenderCore 唯一 catalog → current ZIP materializer/import → EditorCore provider → dialog → Editordemo”实施；
4. 不用 EditorCore 私有 parser、业务 event 表或 raw address 输入规避 shared compiler；
5. 小幅文件粒度适配在报告说明，schema/event semantics/dependency/lockfile 等重大扩张先停止说明；
6. 只运行计划规定的 L2 验收并明确记录浏览器与独立验收状态；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
