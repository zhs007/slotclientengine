# 246 gamelayouteditor-json-runtime-data 任务计划

## 1. 目标与完成定义

### 目标

为 Game Layout 增加通用 JSON 程序资产能力：`apps/gamelayouteditor` 可通过现有统一资源入口中的明确
“JSON data”动作导入 JSON 文件，再以显式稳定程序键绑定到 Scene Layout；production package resource 按 exact key 异步加载、
严格解析并返回深度只读的 JSON object/array。这些数据可承载本地公开轮带、数值权重表或其它
game-owned 扩展配置，不再为了复用 `gameconfig` 容器而强制塞入 Symbols package。现有
Symbols `gameConfig` 仍是正式可用数据源；游戏可显式选择继续使用它，或把 Game Layout JSON 解析结果
传给现有轮带 override/权重 resolver API。

RenderCore 只拥有通用 JSON 语法、package closure、lazy load/cache 与不可变边界；轮带列数、symbol code、权重总和等业务语义由 consumer 的 strict parser 验证。

### 完成定义

- [x] Game Layout Editor 可原子导入一个或多个合法 `.json` 文件，在 Assets 列表中显示为 program-only JSON data；
      JSON 不能建立 scene node、背景、preview 或 RenderObject，也不进入任何渲染资源选择器。
- [x] 用户只能通过现有显式“程序键”绑定使 JSON 进入 production closure；未绑定且无其它引用时不导出，取消绑定恢复为未使用资源。
- [x] Scene Layout latest 保持 v5，现有 `runtimeResources` tagged union 新增 `{kind:"json", path}`；
      v1–v5 继续按现有合同正常读取，不生成、搬运或伪造任何 JSON data，Editor 只导出 canonical latest v5。
- [x] `SceneLayoutPackageResource.loadJsonData(key)` 直接返回与文件等价的深度冻结 JSON object/array；
      既有 `loadRuntimeResource(key, "json")` 同样可用并返回 `{kind:"json", value}`。
- [x] 同 key 并发加载共用一个 Promise，成功后复用同一 frozen value；wrong kind、unknown key、缺 bytes、非 UTF-8、非法 JSON、顶层 primitive、非有限 number、超限和 destroy 竞态全部显式失败且不留部分 cache。
- [x] JSON data 不编译 `gamelayout:/resource/...` RenderObject factory address；`createRenderObject()` 对 JSON key 显式拒绝。
- [x] 同一游戏可用显式 app-owned 选择切换数据源：既有 Symbols `gameConfig` 路径保持不变；选择 Layout JSON 时，consumer strict parser 的输出传给现有 `localReels`/presentation-value resolver。共享层不设自动优先级或 fallback。
- [x] mapped ZIP 导出/重导、`assets.map.json`、CLI 引用改写与 `runtime-resource:<key>` 增量分组完整保留 JSON key/path/bytes；优化器不扫描或改写业务 JSON 内容。
- [x] 中性 fixture 覆盖“本地轮带 + 数值权重表”形状及 consumer strict parser 用法；既有 image/Spine/VNI/
      ImgNumber/video/audio、Symbols game config、公开轮带和 runtime address 行为保持不变。
- [ ] RenderCore、Gamelayout Editor、Gamelayout package CLI 定向测试，Gameframeworks 直接 consumer 类型验证、真实浏览器导入/导出验收、README/领域规则与 UTC 中文执行报告完成。

## 2. 范围

### 包含

- RenderCore Scene Layout data/core/editor 现有 latest v5 schema 的 JSON kind 扩展、JSON value/parser、exact closure、
  lazy resource 和 public load API。
- Gamelayout Editor 的 JSON resource model、统一入口中的显式 JSON data 导入、review/replace/delete、程序键绑定、
  Assets UI、mapped ZIP 导入/导出与重导。
- Gamelayout package CLI 的 JSON path 结构化改写、opaque payload 保留和 runtime-resource 分组。
- Gameframeworks 对 Scene Layout JSON public type/API 的最小 re-export 与直接编译验证。
- 包内中性测试数据、API 示例、README 和稳定领域职责规则。

### 不包含

- 不在 Editor 内建轮带/权重表表格编辑器、JSON Schema 设计器、业务表单、随机抽样按钮或服务端接口。
- 不把 JSON data 自动解释为 `LogicGameConfig`，不硬编码 `reels`、`weight`、`bgcoinweight`、CN 或 FreeGame 字段。
- 不删除或改变 Symbols package 当前自包含 `gameconfig.json`、paytable/symbol code/公开 reel set 合同；未切换数据源的 consumer 继续正常使用。
- 不把 server scene、服务器真实轮带、`randomNumbers`、token、cookie、credential、玩家数据或本轮投注导入
  Game Layout。
- 不在本任务修改 `apps/game002v2`、`assets/crave`、`assets/gamecfg002`或外部
  `/Users/zerro/gitee.com/pixicrave`；Crave 若需改用 Layout JSON，应在这项基础能力完成后以独立 consumer 任务
  添加显式 source 选择，而非删除 `gameConfig` 兼容路径。
- 不为 JSON 生成 runtime address、RenderObject、display tree node、Object URL、ticker 或 destroyable player。
- 不引入第三方 JSON/schema 依赖，不修改 lockfile、根工具链或 workspace 配置。

## 3. 制定计划时的基线

```text
UTC: 2026-08-24T10:38:30Z
HEAD: 6225c846bdd0cc218e0b88bfd08b7cb62d06159f
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime,game002}.md`；目标目录没有补充 `AGENTS.md`。
- 用户写的 `packages/gamelayouteditor` 在当前仓库对应实际 app `apps/gamelayouteditor`；Scene Layout production data/core/editor 合同属于 `packages/rendercore/src/scene-layout`。
- `SceneLayoutRuntimeResourceSpec` 当前只有 image/Spine/image-string/VNI/video；`SceneLayoutPackageResource.loadRuntimeResource(key, kind)` 已有 exact key/kind、同 key Promise 复用、lazy cache、
  destroy 竞态和 `getLoadedRuntimeResource()` 合同，是 JSON 应扩展的唯一通道。
- `packages/rendercore/src/scene-layout/core/runtime-address.ts#createGameLayoutRuntimeAddresses()` 当前把每个 `runtimeResources` 项编译为 caller-owned `resource-factory`；JSON 不能沿用该假设。
- Scene Layout latest 当前为 v5；`upgradeSceneLayoutManifestToLatest()` 把 v1–v4 升级为 v5，Gamelayout Editor 固定导出 v5，CLI 的 audio/reference branch 也显式枚举 v4/v5。
- `apps/gamelayouteditor/src/ui/app-shell.ts#uploadResources()` 虽允许选择 `.json`，但单独 JSON 会落入 `uploadSpineResources()` 并因缺 atlas/texture 失败；`EditorLayoutResource` 也没有 JSON kind。
- `EditorProject.runtimeResourceBindings` 已经以稳定程序键导出 `runtimeResources`，Assets UI 已有绑定/
  取消、unused closure 和重导合同；本任务不新建第二套 data binding 表。
- `apps/gamelayoutpkgcli/src/asset-groups.ts` 已为每个 runtime resource 生成独立增量组；
  `reference-rewriter.ts` 会对 JSON payload 按内容尝试判断 image-string/Symbols/Popup/VNI，新增的业务 JSON
  必须先由 typed owner 标记为 opaque，避免同形字段被误改写。
- 当前仓库 `apps/game002v2/src/default-scene-values.ts` 从 active Symbols `gameConfig` 读取
  `bgcoinweight`；只读参考 `/Users/zerro/gitee.com/pixicrave/apps/crave/src/round-adapter.ts#FREE_GAME_LOCAL_REELS`
  还确认了大段 FreeGame 本地轮带目前硬编码在 app。两者只用于校准 API 使用场景，不是本任务的修改目标。
- 当前代码、测试、README 和领域规则已足以确认合同；本计划不审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “导入 JSON 数据”是把一个文件作为一个独立、opaque、program-only JSON root 加入 filename-key workspace，
   不是把 JSON object 的每个 field 展开成 Editor 或渲染资源。
2. “加载到 gamelayout”需要一个显式程序键。filename key 是 authoring asset identity，program key 是 runtime API
   identity，两者不按名字自动绑定。
3. “读取成一个 obj”指 JSON 语法解析后的完整对象或数组，不是 raw text/bytes，也不是返回 mutable 共享对象。
4. 共享层无法从 generic JSON 猜测轮带或权重表 schema。consumer 必须紧接 load 调用自己的 strict parser；
   本任务的 README/test 使用中性 `parseSpinConfig(value)` 展示边界，不把该 parser 放进 RenderCore。
5. 本地轮带 JSON 只能是公开视觉轮带；server scene 仍只在本轮落停边界覆盖临时可见窗口，
   不因 consumer 切换数据源而改变。
6. 数据源切换是显式 consumer 选择：默认/既有路径可继续从 Symbols `gameConfig` 读取；只有 app 配置选择
   Layout data 时才加载 exact program key 并把 strict parsed value 传入现有 API。不以“Layout 有同名 key”作为隐式覆盖。

### 关键决策

1. **扩展现有 latest v5 `runtimeResources`，不新建平行配置目录**
   - 在现有 tagged union 新增 `SceneLayoutRuntimeJsonResourceSpec = {kind:"json", path:string}`，其 key 继续参与现有
     `runtimeAllocation.onDemand.runtimeResources`、exact closure 和 CLI incremental group。
   - 不使用 orphan allowlist、UI-only 保留标记或 filename convention；manifest 仍是唯一 production 合同。
2. **保持 Scene Layout latest v5，不做旧版数据迁移**
   - 本变更只增加 `runtimeResources` 的新 kind，不增加必填字段或改写旧字段，因此不升 manifest version。
   - v1–v5 源文档继续使用现有 parser/normalizer；无 JSON binding 的旧包不生成空目录、默认 key 或迁移数据。
     Editor 打开旧包后仍只导出 latest v5，只有用户显式绑定的 JSON 才出现在新导出物。
   - v1–v5 继续共用现有 `runtimeResources` parser/normalizer，并识别新增 `{kind:"json"}`；这不要求任何旧文档迁移，无 JSON binding 的旧包保持原数据，未知 kind 仍失败。
3. **通用 JSON 类型只保证数据安全，不保证业务 schema**
   - public data 类型为 recursive readonly JSON value；runtime root 只允许 object 或 array，内部允许 null/boolean/
     string/finite number/object/array。
   - Editor 用 fatal UTF-8 + JSON parser 预检并保存经校验的原始 bytes；runtime 从 package bytes 重新解析、迭代验证并深度冻结，不相信 Editor 会话对象。
   - 不提供无校验 generic `<T>` cast；consumer 取得 readonly JSON 后调用 app-owned parser 得到业务 typed object。
4. **API 优先满足渲染 runtime 初始化前读配置**
   - `SceneLayoutPackageResource.loadJsonData(key)` 是易用入口，内部复用
     `loadRuntimeResource(key, "json")`；`getLoadedRuntimeResource(key, "json")` 继续提供已加载查询。
   - 不在 `SceneLayoutPackageRuntime` 复制第二个 data owner；游戏可在创建 Pixi/runtime 前完成 JSON 加载和业务校验。
5. **JSON data 不是渲染对象或 address endpoint**
   - runtime address compiler 只为可创建 RenderObject/ImgNumber 的程序资源编译 `resource-factory`；
     JSON 只通过 exact data key API 读取。
   - `createRenderObject(jsonKey)`、`createImgNumberRenderObject(jsonKey, ...)` 和 JSON factory address 解析都显式失败，
     不 fallback 到同名 node/resource。
6. **Editor 以显式导入意图区分程序 JSON 与视觉 JSON**
   - 统一资源入口提供明确的 JSON data 动作；该动作只接收 `.json` program assets。Spine/VNI/ImgNumber/package manifest
     继续走各自已知入口，其中任一格式错误不得降级为 generic JSON。
   - JSON data 动作可原子 review/commit 多个 program assets；不与 Spine 视觉资源混合分组，不猜 atlas ownership。
7. **优化器把程序 JSON 视为 opaque payload**
   - path 只通过 Scene Layout typed spec 改写；JSON 内部的任意 string，即使形似 filename/hash/Popup/VNI 字段，
     也不扫描、改名或生成依赖。
   - 只有由 typed manifest graph 已证明的 image-string/Symbols/Popup/VNI root 继续走各自结构化 rewriter。
8. **`gameConfig` 与 Layout JSON 是并列可选数据源**
   - 共享层不删除、弱化或转发 `SymbolPackageResource.gameConfig`；既有 Symbols 展示、paytable、symbol code 和 reel set
     仍按原合同工作。
   - app 按自己的 explicit source discriminator 选择数据源。Layout JSON 轮带通过现有 `localReels` override，权重表
     通过现有 resolver/table input 传入；不为这两个业务例子新建 RenderCore 全局开关。

## 5. 职责与合同

- **Scene Layout data**：拥有 latest v5 JSON spec 扩展、recursive readonly JSON type、path collection/rewrite、allocation 一致性
  和既有 v1–v5 normalization；不迁移旧配置到 JSON。
- **Scene Layout core/package resource**：拥有 bytes resolve、fatal decode/parse、generic value validation、deep freeze、lazy Promise/cache、
  `loadJsonData()` 和 destroy/failure cleanup；不解释业务字段。
- **Scene Layout runtime address/RenderObject factory**：明确排除 program JSON，只为真实 caller-owned render factory 编译地址。
- **Gamelayout Editor**：拥有 browser File 分流、JSON draft/bytes、review/replace/delete、显式程序键 UI 与 latest v5 导入/导出；
  JSON 不进入可视 Resource Picker 或 preview runtime eager closure。
- **Gamelayout package CLI**：按 typed owner 改写 JSON resource path、保留 opaque bytes、计算单文件 exact closure 和独立
  runtime-resource group，不猜业务内容。
- **Gameframeworks/game app**：Gameframeworks 只 re-export public data/resource type；game app 拥有数据源选择、轮带、权重、
  symbol 和其它扩展 schema parser。选择 `gameConfig` 时行为不变；选择 Layout JSON 时只把 strict parsed 公开本地
  轮带/权重传给现有 typed API。
- **资源生命周期**：package resource 拥有 JSON bytes 与 cached frozen value；正在加载时 destroy 使 Promise 拒绝且
  不 commit，已加载 plain value 无独立 dispose/Object URL，只随 owner 失效。
- **失败策略**：unknown/future version、unknown kind、非 canonical key/path、duplicate key binding、wrong kind、
  缺 bytes、非 UTF-8、语法错、primitive root、非有限 number、超限、业务 parser 错误和 destroyed owner 全部原位失败。
- **禁止行为**：filename/path/hash 猜键、首项/default JSON、mutable shared object、无校验 `<T>` cast、内容字符串扫描、
  JSON→RenderObject fallback、app 补资源表、服务器真实轮带或秘密进 ZIP。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/scene-layout/data/json-data.ts
packages/rendercore/tests/scene-layout/manifest-runtime-json.test.ts
packages/rendercore/tests/scene-layout/package-resource-json.test.ts
apps/gamelayouteditor/tests/json-runtime-data.test.ts
tasks/246-gamelayouteditor-json-runtime-data-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/{types,manifest,manifest-v2,manifest-v3,runtime-allocation,resource,package-resource,render-object-factory}.ts
packages/rendercore/src/scene-layout/{data,core}/**
packages/rendercore/tests/scene-layout/{manifest-v3,package-resource,runtime-address}.test.ts
packages/rendercore/README.md

apps/gamelayouteditor/src/model/{editor-resource,editor-project,resource-commands,validation}.ts
apps/gamelayouteditor/src/ui/{app-shell,resources-workspace,ui-session,preview-asset-paths}.ts
apps/gamelayouteditor/src/io/{exported-layout-zip,imported-layout-zip}.ts
apps/gamelayouteditor/tests/{app-shell,validation,zip-io}.test.ts
apps/gamelayouteditor/README.md

apps/gamelayoutpkgcli/src/{reference-rewriter,asset-groups}.ts
apps/gamelayoutpkgcli/tests/{reference-rewriter,asset-groups,package-flow}.test.ts
apps/gamelayoutpkgcli/README.md

packages/gameframeworks/{src/index.ts,README.md,tests/exports.test.ts}
docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md
```

latest 继续是 v5，因此 audio/version capability branch 原则上不应修改；JSON program asset 也不得进入 audio optimizer。

### 原则上不应修改

```text
apps/{game002v2,game003v2,symbolseditor,popupeditor,imgnumbereditor,editordemo}/**
assets/**
packages/{logiccore,editorcore,editorresource,browserartifactio,netcore,uiframeworks,vnicore}/**
packages/rendercore/src/{symbol,reel,popup,image-string}/**
docs/agent-rules/game002.md
{AGENTS.md,pnpm-workspace.yaml,pnpm-lock.yaml}
/Users/zerro/gitee.com/{pixicrave,piximinecart2}/**
```

执行时若必须改 Symbols game config schema、增加内嵌 JSON 依赖闭包、暴露 mutable object、改游戏 production assets、
修外部仓库、引入依赖或修改 lockfile，必须先停止并说明范围扩张，不能改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线与 capability matrix**
   - 重核 HEAD/status、三份主领域规则、v1–v5 parser/upgrader、runtime resource kind 分支、Editor 导入原子边界、
     CLI JSON rewriter 和 asset-group 计算。
   - 先用表格 fixture 固定 source version、resource kind、eager/lazy、addressable、closure/group、destroy owner 和 failure 期望。
2. **扩展 latest v5 JSON program-asset 合同**
   - 新增 readonly JSON value/container、`kind:"json"` spec/runtime resource 和 public exports；实现 fatal UTF-8、syntax、
     root/value/finite-number 验证与无递归栈风险的 deep freeze。
   - 扩展既有 strict parser 和 tagged union；保持 v1–v5 读取/normalization 路径不变，同步 materialized initial view、
     runtime allocation、path closure 和 future-version failure，不创建任何旧数据迁移步骤。
3. **接入 package resource lazy load 与易用 API**
   - eager 和 lazy 两条 resource prepare 分支都按 exact path 读 JSON bytes，共用同一 parser/value 合同；增加
     `loadJsonData(key)` 并复用现有 pending/cache/kind/destroy transaction。
   - runtime address catalog 过滤 JSON，RenderObject/ImgNumber factory 增加 explicit rejection；验证其它程序资源的地址和实例
     lifecycle 不变。
4. **扩展 Gamelayout Editor JSON resource transaction**
   - 新增 JSON editor resource/prepare/replace/signature/path/description，以显式 JSON data 动作与现有视觉 JSON 入口分流；
     全批先解码/解析/冲突 review，再一次 commit。
   - Assets filter/row 显示 JSON，隐藏图层/背景/视觉 Picker 动作，保留程序键绑定/取消/删除和 unused
     状态；绑定详情显示 data API key，不显示伪 runtime address。
5. **同步 latest v5 mapped ZIP 导入/导出**
   - `editorProjectToManifest()` 导出 v5 JSON spec，materializer 只改写 spec.path；导出 exact closure 包含绑定 JSON bytes，
     重导后恢复 resource value、program key 和 stable filename key。
   - 覆盖同名同 kind replace、同名异 kind rollback、非法 JSON 零 mutation、取消绑定后 closure 剪枝；旧 v1–v5 ZIP
     继续按既有路径读取，不生成或搬运 JSON 数据。
6. **接入 CLI opaque JSON 与 runtime-resource group**
   - reference rewriter 先从 Scene Layout typed graph 收集 JSON data roots，只改写它们的 spec path，跳过 payload 内容 adapter；
     已知 nested manifest 继续按 exact owner 结构化改写。
   - 为 JSON key 输出只含该文件的 `runtime-resource:<key>` required/incremental closure，确认未请求数据不进
     initial/shared；保持 audio/event-audio 版本分支不变，并执行 package strict revalidation。
7. **Public facade、文档与收尾**
   - 同步 RenderCore data/core 与 Gameframeworks re-export；README 给出
     `parseSpinConfig(await resource.loadJsonData("spin-config"))` 示例，并明确轮带/权重业务校验和秘密数据禁止边界。
   - 最小更新 scene-layout/editor-artifacts/shared-game-runtime 稳定规则，运行 L2 定向验收，完成真实浏览器
     导入/导出验收并生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- RenderCore fixture 只使用包内中性 JSON，不读 `assets/crave`、`assets/minecart2`或外部游戏美术。
- parser 覆盖 object/array/nested/null/boolean/string/decimal/integer，以及 primitive root、non-finite number、bad UTF-8、bad JSON、missing bytes/path、wrong kind、future version 和 v1–v5 legacy compatibility。
- resource 覆盖 eager/lazy、concurrent same-key Promise、stable frozen identity、nested mutation 失败、failed-load retry policy、
  destroy-before/during/after load 和不创建 Object URL。
- address/factory 测试确认 JSON 不在 `resource-factory` catalog，同名 unknown/wrong-kind 不 fallback，原有五类程序资源
  descriptor 与 factory 保持。
- Editor 覆盖单/多 JSON、显式导入意图、视觉 JSON 不降级、review cancel、replace/delete、绑定/取消、
  latest v5 round-trip、unused pruning 和 Assets UI 不出现图层/背景/address 动作。
- CLI fixture 中 JSON 故意含 `kind:"popup"`、`assets`、`path`和 hash-like string，确认只改 spec path、payload byte-equal，分组不进 initial/shared。
- “本地轮带 + 权重表”测试只证明 consumer 可从一个 loaded object 分别取数据并 strict parse；
  不使用 `Math.random()`，不把 server scene 或真实轮带写入 fixture。

### 验收级别

`L2`：修改 Scene Layout 跨包 public schema/API、正式 mapped ZIP、CLI reference rewrite/group 和
Gameframeworks 直接 consumer。不修改根工具链、lockfile、production asset 或 release 配置，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-runtime-json.test.ts tests/scene-layout/package-resource-json.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/json-runtime-data.test.ts tests/validation.test.ts tests/zip-io.test.ts tests/app-shell.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/asset-groups.test.ts tests/package-flow.test.ts
pnpm --filter gamelayouteditor build
git diff --check
```

- 多 filter typecheck 同时证明 schema owner、Editor、CLI 和 facade 的直接依赖链，不扩展到整仓。
- Editor build 证明 browser-only UI 与分层 exports 可交付；其 `prepare:deps` 会同步构建 RenderCore 直接依赖。
- 若某包当前的 pnpm 多 filter 命令不会对全部目标执行 script，将它拆成四条同名 package typecheck；
  这是命令适配，不升级验收范围。

### 人工验收

在 Node 24 启动的 Game Layout Editor 真实浏览器中：

1. 分别导入一个含公开 `localReels` 的 JSON 和一个含 `numberWeights` 的 JSON，确认它们只出现在 Assets，
   不能建图层/背景；非法 JSON 的同批导入不留任何资源。
2. 只给其中一个绑定 `spin-config` 程序键，导出并重导 ZIP；确认已绑定 JSON/value/key 保留，
   未绑定 JSON 不进 ZIP，详情不伪造 runtime address。
3. 用 production package resource 加载该 ZIP，调用 `loadJsonData("spin-config")`；确认 consumer parser 能得到轮带/
   权重 typed config，尝试修改 nested array/object 失败，wrong key/kind 显式报错。

### 独立验收建议

`必须`：涉及跨包 public contract、正式 ZIP/optimizer、lazy resource transaction 和 destroy；不涉及
credential 或 server 数据上线，但需独立确认这些数据没有进 fixture/package。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest-runtime-json.test.ts tests/scene-layout/package-resource-json.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/json-runtime-data.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/asset-groups.test.ts tests/package-flow.test.ts
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；当前规划 shell 中 `node` 不在 PATH，执行会话先运行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后设置仓库约定代理并重试。
- 本任务使用平台 JSON/TextDecoder、现有 editorresource/browserartifactio 和 Scene Layout package loader，不新增依赖，
  不修改 `package.json`/`pnpm-lock.yaml`。

## 10. 生成物、文档与规则

- 本任务不修改 YAML 或手改 generated TypeScript；`assets.map.json` 和 content-addressed payload 只在 Editor/CLI
  真实导出测试中由正式 materializer 生成。
- 更新 `apps/gamelayouteditor/README.md`：JSON data 显式导入、程序键、unused pruning、latest v5 round-trip 和人工验收。
- 更新 `packages/rendercore/README.md`：v1–v5 兼容读取、无数据迁移、`loadJsonData()`、readonly/consumer parser、lazy/destroy 与
  无 resource-factory address。
- 更新 `apps/gamelayoutpkgcli/README.md`：JSON runtime-resource 独立分组、opaque bytes 和 typed-only path rewrite。
- 更新 `packages/gameframeworks/README.md`：只展示通过 facade type/API 读取并交给 game-owned parser，不把业务 schema
  放入 facade。
- 最小更新 `docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md`，记录 JSON data 的稳定 owner/
  strict/opaque/public-local-reel 边界；本任务不改 game002 行为，因此不修 `game002.md` 或根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/246-gamelayouteditor-json-runtime-data-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录：

1. 最终 v5 JSON kind/API/UI/CLI 实现与实际修改文件；
2. JSON/Spine 分流、opaque optimizer、readonly value 和 address 排除决策；
3. 实际验收命令及结果；
4. 真实浏览器导入/导出/API 验收是否完成；
5. 尚未执行的 Crave/game002 显式数据源接入与剩余风险。

L2 报告不收集整仓 coverage、完整历史矩阵、profiler 或无关 package 证据。

## 12. 风险、假设与待确认

### 风险

- `.json` 同时是 Spine skeleton、VNI/ImgNumber/package manifest 常用扩展名；分流若使用“某 parser 失败就换 generic”
  会吞掉已知格式错误，必须保持批次结构和 known-format fail-fast。
- 大或极深 JSON 可能阻塞 browser/main thread 或导致递归栈溢出；需复用 bounded source/package limits，并以迭代验证/
  freeze 避免额外递归风险。
- generic parser 只能证明 JSON 安全性，不能证明轮带列数、symbol code 或权重总和；consumer 遗漏 parser
  会把错误延迟到使用点，README 和 example test 必须保护这一分层。
- CLI 现有基于 JSON 内容的 adapter 选择可能误伤业务 data；typed opaque-root 集合必须在任何 content heuristic 之前生效。
- 同一 v5 tagged union 会被 parser/runtime/Editor/CLI 多处分支消费；漏掉 JSON 排除或 opaque 处理时，可能误进
  Spine、render factory 或内容 rewriter，需用跨层 kind matrix 定向覆盖。

### 假设

- 本任务只需要导入已由开发者准备的 JSON，不需要在 Editor 内编辑表格字段或生成随机数据。
- 每个程序键对应一个独立 JSON root；多张轮带/权重表可放在同一 root object 的不同字段，也可分开绑定。
- 实际 Crave/game002 若选择 Layout 数据，需要届时确认 JSON schema、program key、production ZIP 来源和 consumer parser；
  既有 `gameConfig` 仍是支持路径，本任务不预造或强制切换。

### 待确认

无。

## 13. 完成清单

- [x] JSON 导入、显式绑定、unused pruning 和非视觉 UI 行为符合计划。
- [x] Scene Layout latest v5 JSON spec/value/API、既有 v1–v5 兼容读取与无迁移原则符合计划。
- [x] lazy Promise/cache、deep readonly、failure/destroy 和无 Object URL/player 生命周期通过测试。
- [x] JSON 没有 RenderObject factory address，其它 runtime resource/address 行为不变。
- [x] mapped ZIP、assets map、CLI typed rewrite、opaque bytes 和 runtime-resource group 通过。
- [x] consumer strict parser/public-local-reel/security 边界在 API 示例、测试和文档中明确。
- [x] RenderCore/Editor/CLI/Gameframeworks 指定验收通过，自动化与真实浏览器验收已区分。
- [x] README 和最小领域规则已同步，UTC 中文执行报告已生成。
- [x] 实际修改未扩张到游戏 app、production assets、Symbols schema、外部仓库、lockfile 或根工具链。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划与 `docs/agent-rules/{scene-layout,editor-artifacts,shared-game-runtime}.md`；
   只有实际扩张到 game002 consumer 时才重读 `game002.md` 并先停止说明超范围原因。
2. 核对 Git 基线、工作区和 latest version branches；保留用户无关修改。
3. 按“data/schema → package resource/API → Editor → ZIP/CLI → docs”顺序实现，不重新制定平行方案。
4. 小幅文件命名或 parser 拆分适配记入报告；出现业务 schema、production asset、dependency/lockfile 或外部仓库
   修改时先停止说明。
5. 只运行本计划 L2 定向验收，失败时先最小化复现并判断是否由本任务引入。
6. 完成后生成 UTC 中文执行报告；除非用户明确要求，不 commit、不 push、不创建 PR。
