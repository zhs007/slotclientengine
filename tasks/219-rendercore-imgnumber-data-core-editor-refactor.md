# 219 rendercore-imgnumber-data-core-editor-refactor 任务计划

## 1. 目标与完成定义

### 目标

对 `packages/rendercore` 的 ImgNumber（现名 `image-string`）进行一轮重构级优化，
将混合在单一 public entry 中的数据合同、游戏运行时和编辑器能力拆成单向依赖层：

```text
@slotclientengine/rendercore/image-string/data
  ↓
@slotclientengine/rendercore/image-string/core
  ↓
@slotclientengine/rendercore/image-string/editor
```

- `data` 拥有 image-string v1 authored data、strict parser、text/reference validation 和
  exact glyph closure，不依赖 Pixi、DOM 或 runtime mutable state。
- `core` 是专门给 game runtime 和 rendercore 内部 Popup/Symbol/Scene Layout 使用的轻量
  Pixi ImgNumber runtime，只接受已验证数据与显式准备的资源，不承担 editor workspace、ZIP、
  assets map materialization 或 diagnostics snapshot。
- `editor` 组合 data 与同一个 core，提供 standalone ImgNumber package 的 mapped file
  适配、编辑器预览 inspection 和 authoring validation；不复制 glyph layout、Sprite 状态或
  `setText()` 生命周期。

### 完成定义

- [ ] package 明确导出 `./image-string/data`、`./image-string/core`、
      `./image-string/editor`；旧混合 `./image-string` 与 root image-string wildcard export
      在仓库内原子迁移后移除，不保留静默 alias 或双入口。
- [ ] image-string v1 schema、Unicode code-point、NFC/control/surrogate、natural/fixed advance、
      dynamic visualBounds anchor、PNG/WebP exact closure 和 strict failure 行为保持不变。
- [ ] core 的 public API 只包含资源、Pixi renderer、`setText/setResource/setAnchor`、必要标量
      query 与 destroy；不导出 ZIP/map/materializer、editor draft、完整 occurrence snapshot、
      `Application`、canvas、DOM、RAF 或 raw mutable scratch。
- [ ] manifest/resource 创建时预编译 glyph/fixed-group lookup；稳定 renderer 的 `setText()`
      不再为每次更新重建 group Map、deep-freeze 完整 snapshot 或分配可避免的中间数组。
- [ ] `setText()` 和 `setResource()` 仍先完整验证/布局再一次性 commit；失败保持旧文字、纹理、
      pivot、children 与 resource identity，不留下半更新画面。
- [ ] Sprite 重用池有明确上限和回收策略；resource prepare 失败可 rollback，renderer/resource
      `destroy()` 幂等，owned Object URL/Texture/Sprite 全部释放，borrowed Texture 不误销毁。
- [ ] ImgNumber Editor 只通过 data + editor wrapper 完成 draft 校验、mapped ZIP、preview 与
      diagnostics；其现有 UI、静态/计数模板、filename-key workspace 和视觉行为保持不变。
- [ ] Popup Editor、Symbols Editor 与 Game Layout Editor 的 standalone ImgNumber 导入/校验
      使用 editor wrapper；它们的 production preview 继续分别通过 Popup/Symbol/Scene Layout
      owner，不直接建立第二个 ImgNumber core。
- [ ] `gamelayoutpkgcli` 等纯 schema/rewrite consumer 只使用 data；rendercore 的
      Popup/Symbol/Scene Layout/presentation runtime 只使用 data + core，不依赖 editor wrapper。
- [ ] 完成 export boundary、功能 parity、热路径结构、rollback/destroy、直接 consumer 编译、
      真实浏览器 Performance/Memory/视觉验收，并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/src/image-string` 的 data/core/editor 分层、显式 barrels、public exports、
  compiled layout、renderer/resource lifecycle、测试和 benchmark。
- rendercore 内部 `popup`、`symbol-image-string`、`symbol-value-presentation`、`scene-layout`、
  `presentation`、rolling value 等所有直接 ImgNumber runtime consumer 的迁移。
- `apps/imgnumbereditor` 的 editor wrapper 接入与现有预览/ZIP parity。
- `apps/popupeditor`、`symbolseditor`、`gamelayouteditor` 的 standalone ImgNumber package
  import/validate/vendor 接入，以及 `apps/gamelayoutpkgcli` 的 data-only import 迁移。
- 更新相关 Vite alias、tests、README、image-string 文档和稳定领域规则。

### 不包含

- 不修改 image-string manifest version、字段、glyph metrics/layout 公式、filename-key/package
  wire format、ZIP 字节合同或现有 legacy direct-path 兼容语义。
- 不重做 Imgnumber Editor UI、模板产品需求、图片解码器、通用 workspace/ZIP/hash 算法。
- 不让 Popup/Layout Editor 编辑 nested ImgNumber 内部 glyph/metrics；不改变 Symbols Editor
  的 tier/node/slot/special-value 业务合同。
- 不修改 Popup、Symbols、Scene Layout schema 或游戏业务 formatter/value resolver。
- 不增加 Web Worker、OffscreenCanvas、atlas packing、字体/placeholder fallback、路径猜测、
  无界 cache 或为旧 import 保留 compatibility barrel。
- 不修改 production assets、生成配置、根工具链、workspace 配置或 `pnpm-lock.yaml`。

## 3. 制定计划时的基线

```text
UTC: 2026-08-16T13:35:14Z
HEAD: 019560a796cf689255f28cb3f5ab71df5e062bf8
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/editor-artifacts.md`；目标目录下
  无补充 `AGENTS.md`。
- `packages/rendercore/src/image-string/index.ts` 当前 wildcard 导出 errors/types/manifest/
  resource/layout/renderer/materialize；同一 `@slotclientengine/rendercore/image-string` 入口同时
  服务 game runtime、ImgNumber Editor、其它 editor 和 CLI，职责不可从 import path 判断。
- `manifest.ts` 直接依赖 `browserartifactio` 与 `editorresource` 的 path/key validator；
  `resource.ts` 同时包含 Pixi resource、Blob/Object URL、files/map/CDN resolution；
  `materialize.ts` 是 editor content-addressed package 能力，却与 runtime 一起进入同一 barrel。
- `layoutImageString()` 每次调用都重建 `groupByCharacter` Map、characters/occurrences 数组并
  freeze 完整 snapshot；`RenderImageString.setText()` 的每次文字变化都走该分配路径。
- renderer 当前保留一个随历史最大文字长度增长且不收缩的 Sprite pool；snapshot 同时承担
  runtime 的 text query、Scene Layout diagnostics 和 ImgNumber Editor guides，尚未区分热路径与 inspection。
- resource/renderer ownership 已有 Promise settle、atomic layout、sprite reuse 和幂等 destroy
  基础；本任务应保留并收紧这些合同，不新建第二套 renderer。
- 只有 `apps/imgnumbereditor` 直接使用 raw `createRenderImageString` 做独立预览；Popup、Symbols、
  Layout Editor 都已有各自 production runtime preview，不需要直接创建 image-string core。
- 当前仓库 consumer 已足以决定分层与迁移，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “数据、core、editor 的包装”是三层责任和单向依赖，不是三份 manifest parser、layout
   或 renderer。
2. “core 专门给 game runtime”表示 core 不处理 editor package/workspace/diagnostics，也不因
   editor 需要而在每次 `setText()` 生成完整 immutable snapshot。
3. “性能高、内存干净”落实为可观测的热路径分配、bounded Sprite reuse、资源 owner、
   rollback 和 repeated destroy；未取得 profiler 数据前不承诺固定 FPS 百分比。
4. 其它 editor 不因“也是 editor”而无条件使用 editor wrapper：纯 schema/rewrite 用 data，
   standalone ImgNumber package authoring/import 用 editor wrapper，画面预览优先使用其上层
   production owner；只有直接托管 raw ImgNumber 预览时才由 editor wrapper 包装 core。

### 关键决策

1. **使用三个显式子路径并移除旧混合入口。**
   - `data/core/editor` barrels 使用 allowlist，package export-boundary 测试锁定 symbol 归属。
   - rendercore 为 private workspace package，本任务原子迁移全部已知 consumer；保留旧
     `./image-string` 或 root wildcard 会继续允许 runtime 误引 editor materializer，因此不采用。
2. **data 是唯一 wire-format owner。**
   - types、strict parse、text validation、asset-reference 分类与 exact closure 只实现一次。
   - data 不 import Pixi、DOM 或 core/editor；filename-key 与 legacy direct-path 的现有严格语义
     保持，editor 的 map/hash/orphan transaction 不进入 data。
3. **core 使用编译后的 runtime resource。**
   - resource prepare 时把 glyph、advance、alignment 和 texture lookup 编译为 readonly runtime table；
     renderer 不在每次文字变化扫描 fixed groups 或重建 lookup。
   - core 先在 renderer-owned scratch 中完成 scalar validation/layout，再 commit Sprite/texture/pivot；
     mutable scratch 不公开，editor snapshot 按需从同一内部状态物化。
   - core 公开标量 `text`/bounds query 满足 runtime；完整 glyph occurrence inspection 只由 editor
     wrapper 提供，避免 game code形成 snapshot 依赖。
4. **package/editor 适配不进入 core。**
   - core 只接受显式 Texture/module 或已经解析为 exact glyph bytes 的资源；standalone
     `assets.map.json` resolve、mapped materialize、authoring package validation 放在 editor wrapper。
   - Scene Layout/Popup/Symbol package owner 继续在自己的 package boundary 解析全局 map/URL，
     再向 core 交付已解析资源；game runtime 不 import editor wrapper。
5. **editor wrapper 是 format adapter，不是第二个 app。**
   - wrapper 组合 core，提供 immutable inspection、preview resource rebuild 和 normalized file-map
     materialize/resolve；bounded ZIP、generic import review、draft/UI/canvas 仍由各 app 拥有。
   - wrapper 不创建 `PIXI.Application`、canvas、RAF 或 DOM controls；ImgNumber Editor 继续拥有宿主
     preview canvas，只挂载 wrapper 的 Pixi view。

## 5. 职责与合同

- **Data**：拥有 `ImageStringManifestV1`、glyph/metrics/fixed group types、strict parser、
  `validateImageStringText`、anchor/reference validation、closure/rewrite pure helper；输出 deep-readonly
  authored value，不含 Texture、Blob、workspace 或 runtime state。
- **Core**：拥有 compiled resource、Texture ownership、glyph layout hot path、stable Container/Sprite、
  atomic `setText/setResource/setAnchor`、标量 query、bounded reuse 和 destroy；不创建宿主 renderer。
- **Editor wrapper**：拥有 mapped standalone package resolve/materialize、authoring/decoded-size validation、
  core-backed preview inspection；调用 shared browserartifactio/editorresource，不复制其 hash/allocator。
- **Consumer**：ImgNumber Editor 用 data+editor；Popup/Symbols/Layout Editor 只在 standalone
  ImgNumber import 用 editor，production preview 用各自 owner；CLI 用 data；game/rendercore runtime
  用 data+core。
- **资源生命周期**：manifest/data 可共享；Texture resource 有唯一 owner；每个 occurrence renderer
  独占 mutable Sprite/scratch/container；prepare 全部收敛后 commit，失败释放本轮 acquired resources；
  renderer destroy 不销毁 borrowed shared resource，resource destroy 不遗留 Object URL/Texture。
- **失败策略**：未知字段、非法 code point/reference/anchor/metrics/group、缺 glyph/texture/bytes、
  decoded size 漂移、map/hash/size/orphan、destroy 后命令全部在责任边界显式失败。
- **禁止行为**：不复制 layout 状态机、不从 filename/hash 猜 identity、不保留首项/default resource
  fallback、不向 core 暴露 mutable buffer、不用丢更新或跳校验换性能。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/image-string/data/**
packages/rendercore/src/image-string/core/**
packages/rendercore/src/image-string/editor/**
packages/rendercore/tests/image-string/{data,core,editor}/**
packages/rendercore/benchmarks/image-string-hot-path.mts
tasks/219-rendercore-imgnumber-data-core-editor-refactor-<utctime>.md
```

### 预计修改

```text
packages/rendercore/package.json
packages/rendercore/src/index.ts
packages/rendercore/src/image-string/**
packages/rendercore/src/{popup,presentation,scene-layout,symbol,symbol-image-string,symbol-value-presentation,reel}/**
packages/rendercore/tests/**
packages/rendercore/{README.md,vite.config.ts,tsconfig*.json}
apps/imgnumbereditor/{src/**,tests/**,README.md,vite.config.ts}
apps/{popupeditor,symbolseditor,gamelayouteditor}/{src/**,tests/**,vite.config.ts}
apps/gamelayoutpkgcli/{src/**,tests/**}
docs/image-string-manifest.md
docs/agent-rules/{shared-game-runtime,editor-artifacts}.md
```

### 原则上不应修改

```text
packages/{logiccore,gameframeworks,uiframeworks,vnicore}/**
packages/{browserartifactio,editorresource}/**
assets/**
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
```

若执行时发现必须改变 image-string wire schema、通用 filename-key/hash 算法、Popup/Symbol/Layout
public schema、production assets、根工具链或新增依赖，先停止说明范围扩张，不能修改计划事后合理化。

## 7. 实施步骤

1. **确认基线与 consumer/export allowlist**
   - 重核 HEAD/status，生成旧 root/`./image-string` import 与 public symbol consumer 矩阵。
   - 为 data/core/editor 确定显式 export allowlist 和 consumer 分类测试；先固定现有 schema、布局、
     atomic failure、resource ownership 与 ImgNumber Editor parity 基线。
2. **建立独立 data 层**
   - 迁移 manifest/types/errors/text/reference/closure pure helpers，消除 Pixi、DOM、runtime/editor imports。
   - 保留 v1 输入、filename-key/legacy direct path、错误语义和 deep-readonly 输出；增加 data source/export
     boundary 测试，防止未来反向依赖 core/editor。
3. **建立精简 game runtime core**
   - 在 resource prepare 阶段编译 glyph/fixed group/texture lookup，renderer 仅消费 compiled table。
   - 将内部 layout 改为 renderer-owned reusable scratch + two-phase commit；相同 text/resource/anchor no-op，
     完整 occurrence snapshot 不在 mutation 热路径生成。
   - 实现 bounded spare Sprite 策略：保留足以吸收常见长度波动的小池，超出上限的 inactive Sprite
     立即 destroy；测试长串缩短、反复波动和 destroy 后无可达 Sprite/scratch。
   - 拆分 borrowed/owned Texture 和 Object URL owner，覆盖并发 load 失败收敛、setResource rollback、
     repeated destroy 与 resource/renderer 独立生命周期。
4. **建立 editor wrapper**
   - 迁移 standalone mapped package resolve/materialize、decoded-size/package closure validation 到 editor；
     API 接受 app 已做 bounded normalize 的 file map，不接管 ZIP/UI/workspace session。
   - 用 composition 包装同一 core，按需创建 immutable layout/occurrence inspection 和 preview guides 数据；
     wrapper destroy 先 detach/销毁 renderer，再释放自己 owned preview resource。
5. **迁移 runtime 与 editor consumers**
   - rendercore Popup/Symbol/Scene Layout/presentation/rolling value 改用 data+core；以 `getText()` 等标量
     query 替换只为读取文字而生成 snapshot 的调用。
   - ImgNumber Editor 改用 data+editor，保留 Application/canvas/draft/UI/ZIP transaction ownership。
   - Popup/Symbols/Layout Editor 的 standalone ImgNumber import 改用 editor wrapper；production preview
     继续走各自 shared runtime。CLI/reference rewriter 改用 data。
   - 更新 Vite aliases/mocks/tests，搜索确认无旧 `./image-string`、root image-string symbol、editor-from-core
     或 runtime-from-editor 残留。
6. **性能、文档与收尾**
   - 增加固定 manifest/文字序列的 warm benchmark，记录重构前后 `setText` 吞吐、构造计数、heap slope；
     wall-clock 只进报告，不作易抖动单测 gate。
   - 用 identity/constructor spy/retained-resource 测试锁定 lookup 只编译一次、snapshot lazy、pool bound、
     rollback 与 cleanup；按第 8 节执行 L2 验收和真实浏览器 Performance/Memory/视觉验收。
   - 更新 README、schema 文档和两份领域规则，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- data 测正常/非法 schema、Unicode、reference kind、closure、immutability；core 测布局 parity、
  compiled lookup、atomic mutation、Sprite reuse bound、owned/borrowed resource、rollback/destroy；editor
  测 mapped/legacy package、hash/map/orphan、decoded size、inspection 与 core parity。
- 相同 manifest、text/anchor/resource 操作序列下，重构前 fixture 与新 core 的 logical/visual bounds、
  glyph order/position、pivot、texture、错误与最终画面保持一致。
- 热路径自动化使用构造次数、stable identity、snapshot materialization 次数和 pool 上限；不以本机
  毫秒阈值制造 flaky test。真实 GC/heap/FPS 由浏览器 profiler 验收。
- 不为旧混合 import 增加 alias；测试迁移到新职责入口。

### 验收级别

`L2`：修改 rendercore public subpaths、runtime resource/lifecycle，并迁移四个 editor 与 CLI 直接
consumer；不修改正式 schema、assets、根工具链或 lockfile。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build
pnpm --filter imgnumbereditor test
pnpm --filter imgnumbereditor --filter popupeditor --filter symbolseditor --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter imgnumbereditor --filter popupeditor --filter symbolseditor --filter gamelayouteditor build
git diff --check
```

共 7 条：rendercore 的 source/test/declaration export、ImgNumber Editor 行为、全部直接 editor/CLI
consumer 编译、Vite 子路径解析和最终 diff 分别需要独立证据；不默认运行根级验收。

### 人工验收

1. Node 24 下启动 ImgNumber Editor，导入 mapped 与合法 legacy ImgNumber ZIP，验证 glyph mapping、
   fixed group、offset/lineHeight/letterSpacing、静态与计数模板、zoom/guides、导出重导完全一致。
2. 用真实不同宽高 glyph 连续切换空串、短金额、长金额和缺 glyph 文本，确认动态 visualBounds 中心、
   strict error 后旧画面不变、resource 切换无闪烁或半提交。
3. Popup/Symbols/Layout Editor 各导入真实 standalone ImgNumber，确认 package/map/closure 正常；
   production preview 分别通过 Popup/Symbol/Scene Layout runtime 显示，不创建重复 renderer owner。
4. 在同一浏览器/资源/操作序列下记录重构前后 Performance allocation timeline、minor GC、frame time
   与 Memory heap snapshot；循环至少 50 次长短文字切换、resource rebuild、preview destroy/recreate，
   确认 Sprite/Object URL/Texture/Container/handler 数量无持续增长。

### 独立验收建议

**必须**。涉及跨包 public contract、runtime hot path、Texture/Object URL/Sprite ownership 和 editor
mapped package 边界。独立复验重点为 export/旧 import 零残留、布局/原子 mutation parity、prepare
rollback/repeated destroy/pool bound；最多重跑 rendercore test、全部 consumer typecheck 和
ImgNumber Editor test 三组命令。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；shell 无 Node 时通过 nvm 切换到 24。
- 依赖缺失时执行 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库代理并重试。
- 预计不新增依赖、不修改 lockfile。compiled table、scratch、benchmark 和 wrapper 使用现有
  TypeScript/Pixi/browserartifactio/editorresource 能力即可。

## 10. 生成物、文档与规则

- 本任务不修改 YAML 或现有生成物；若 consumer import 变化触发生成器输出，必须使用对应生成器并
  运行 `--check`，禁止手改。
- 更新 `packages/rendercore/README.md` 与 `docs/image-string-manifest.md`，记录三层入口、core 最小
  usage、editor wrapper、ownership 和 migration。
- 更新 `docs/agent-rules/shared-game-runtime.md`，固定 data/core/editor 单向依赖、core hot-path 与
  lifecycle；更新 `editor-artifacts.md`，固定各 editor 的 consumer 选择矩阵。
- 精确 benchmark 数字、修改文件和执行证据只写任务报告，不写入长期规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/219-rendercore-imgnumber-data-core-editor-refactor-<utctime>.md
```

报告简要记录最终分层/API、实际修改与偏差、自动验收、benchmark 原始数据、人工 profiler/视觉状态、
剩余风险和未完成项。

## 12. 风险、假设与待确认

### 风险

- Scene Layout/Popup/Symbol 当前复用 files/map/CDN loader 的路径不同；迁移时若把 package resolution
  错放进 core 或 editor，可能形成 runtime→editor 反向依赖或重复 map 校验。
- 延迟 snapshot 与 reusable scratch 若逃逸 public API，会被后续 mutation 改写；必须只公开独立
  immutable editor snapshot，core 内部 view 不跨 mutation 保存。
- 过小 Sprite pool 会增加波动场景构造，过大会保留历史长串内存；以 bounded policy、benchmark 和
  heap snapshot共同确定，不使用无界 high-water mark。
- resource switch 涉及旧/new Texture owner；commit 顺序错误可能提前销毁旧资源或泄漏失败资源。

### 假设

- 仓库内全部 direct consumer 可在同一任务原子迁移；rendercore 是 private package，无需为仓库外
  未知 consumer 保留旧 `./image-string` public alias。
- image-string v1 schema 和现有视觉公式是兼容基线，本轮优化不需要 version bump 或资源重导。

### 待确认

无。其它 editor 的入口选择已由当前代码职责确定；执行时新发现的未知外部 consumer 或 schema 需求
属于范围扩张，应停止说明。

## 13. 完成清单

- [ ] data/core/editor 单向分层、consumer 矩阵和非目标已满足。
- [ ] 旧入口/import 已清除，public exports 与 source boundaries 已锁定。
- [ ] schema、布局、资源闭包、原子 mutation 和视觉行为保持 parity。
- [ ] core 热路径、bounded pool、rollback、owned/borrowed destroy 合同通过测试与 profiler。
- [ ] ImgNumber/Popup/Symbols/Layout Editor 和 CLI 已使用正确层级。
- [ ] README、schema 文档和领域规则已同步。
- [ ] 指定 L2 自动化与人工验收状态已记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`shared-game-runtime.md` 和 `editor-artifacts.md`；
2. 核对 Git 基线并重新生成 image-string public/import consumer 矩阵；
3. 按 data → core → editor → consumer 顺序实施，不另建并行 renderer/parser；
4. 小幅适配当前 HEAD 时记录到报告，public/schema/依赖范围扩大时先停止说明；
5. 只运行本计划的 L2 定向验收，人工 profiler 未执行时如实标记；
6. 完成后生成 UTC 中文报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
