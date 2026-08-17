# 220 rendercore-popup-data-core-editor-refactor 任务计划

## 1. 目标与完成定义

### 目标

对 `packages/rendercore` 的 Popup 进行一轮重构级优化，把当前混合的数据合同、游戏运行时、
package/editor 适配拆成三个单向依赖层：

```text
@slotclientengine/rendercore/popup/data
  ↓
@slotclientengine/rendercore/popup/core
  ↓
@slotclientengine/rendercore/popup/editor
```

- `data` 拥有 Popup v1–v6 authored data、strict source parser、统一 latest normalizer、纯引用图与
  结构化 rewrite，不依赖 Pixi、DOM、runtime mutable state 或 editor workspace。
- `core` 是专门给 game runtime、gameframeworks 和 Scene Layout 使用的轻量 Popup runtime；
  只消费已验证数据与显式准备的资源，不承担 mapped ZIP、assets map materialization、
  filename-key namespace 或完整 editor snapshot。
- `editor` 组合同一份 data 与同一个 core，为 Popup Editor 和需要导入/封装 standalone Popup
  package 的 editor 提供 mapped package adapter、preview inspection 与 authoring validation；
  不复制 award/Spine 状态机、attachment、金额、文字或显示树生命周期。

### 完成定义

- [ ] package 明确导出 `./popup/data`、`./popup/core`、`./popup/editor`；旧混合
      `./popup` 与 rendercore root 的 Popup wildcard export 在仓库 consumer 原子迁移后移除，
      不保留静默 alias、双入口或 private-source import。
- [ ] data 提供唯一默认加载入口：任何合法 Popup 历史版本先按 source version strict validate，
      再确定性规范化并 strict revalidate 为 `LATEST_POPUP_MANIFEST_VERSION`；当前 latest 为 v6，
      game runtime、Popup Editor、Game Layout Editor、CLI 与未来 consumer 都不自行选择升级函数。
- [ ] Popup v1–v6 schema、历史版本→latest upgrader、award containing-tier/stable-id、普通 Spine
      start/loop/end、attachment、visibility、金额格式与 exact closure 行为保持不变；默认加载结果可记录
      `sourceVersion` 供迁移提示，但 runtime/editor 后续只消费 latest manifest。
- [ ] data 的 public surface 不出现 `pixi.js`、Container、Texture、FontFace、Blob、URL、
      EventTarget、runtime/player、editor workspace/map 或 mutable cache。
- [ ] core 只公开游戏需要的 resource prepare、Runtime factory、command、`update(): void`、
      scalar query/edge、string handle、viewport 与宿主 input binding；不公开完整 snapshot、
      mapped package rewrite、editor draft、`PIXI.Application`、canvas 创建、RAF 或 raw display-tree helper。
- [ ] award 与 Spine Popup 先把 manifest 编译为 immutable runtime program；初始化后 steady
      `update()` 不重复扫描/排序 manifest，不构造完整 snapshot，不创建可避免的 Map/Set/数组，
      amount string 只在数值变化时格式化并提交。
- [ ] logical layer/variant、attachment、string node 与 prepared resource cache 只覆盖当前
      manifest 明确声明的有限集合；complete/replay 复用，destroy 后不存在无界缓存、残留 listener、
      Object URL、FontFace、Texture、VNI/Spine player、ImgNumber renderer 或 detached Container。
- [ ] core 的 resource/player init 具有明确 prepare/commit/rollback；任一异步成员失败时等待已启动
      prepare 收敛并释放 candidate，旧宿主画面不半提交；destroy 幂等且不销毁 borrowed host/resource。
- [ ] Popup Editor 只通过 popup editor wrapper 完成 project ZIP、production preview 与 snapshot；
      现有 v6 authoring、v1–v5 原子迁移、资源 review、canvas/input/UI 和视觉行为保持不变。
- [ ] Game Layout Editor 的 standalone Popup ZIP 导入、校验、flatten/namespace/vendor 使用 editor
      wrapper；production 预览仍通过 Scene Layout owner，不直接创建第二个 Popup core。
- [ ] `gamelayoutpkgcli` 及只做 manifest/reference traversal/rewrite 的 consumer 只使用 data；
      gameframeworks、Scene Layout 与游戏 runtime 只使用 data + core，不依赖 editor wrapper。
- [ ] 完成 export boundary、行为 parity、热路径结构、rollback/destroy、直接 consumer 编译、
      真实浏览器 Performance/Memory/视觉验收，并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/src/popup` 的 data/core/editor 分层、显式 barrels、package exports、
  manifest compile、resource ownership、runtime hot path、测试与 benchmark。
- rendercore 内部 Scene Layout Popup resource/runtime/presentation consumer 的迁移。
- `packages/gameframeworks` 的 Popup data/core facade、`apps/popupeditor` 的 editor wrapper 接入。
- `apps/gamelayouteditor` 的 standalone Popup package adapter 接入；production preview继续走
  Scene Layout owner，并增加 source-boundary保护。
- `apps/gamelayoutpkgcli` 的 data-only traversal/rewrite 迁移。
- 相关 Vite alias、tests、README、Popup manifest 文档和稳定领域规则。

### 不包含

- 不新增 Popup manifest version或字段，不改变 v1–v6 strict/迁移语义、金额公式、动画时间、视觉公式、
  filename-key/package wire format或已有 legacy direct-path 数据兼容。
- 不重做 Popup Editor UI、项目模型、资源导入 review、通用 ZIP/hash/workspace 算法。
- 不修改 Scene Layout schema、game mode/prelude string、游戏 formatter/amount resolver、Popup
  binding/order，或 VNI/official Spine/image-string public schema及内部状态机。
- 不增加 Web Worker、OffscreenCanvas、隐藏 renderer、全局 player pool、启发式 LRU、placeholder、
  路径猜测、首项 fallback 或为旧 import 保留 compatibility barrel。
- 不修改 production assets、YAML、生成配置、根工具链、workspace 配置或 `pnpm-lock.yaml`。

## 3. 制定计划时的基线

```text
UTC: 2026-08-16T14:13:49Z
HEAD: b612e524a9f4bcbc838069ce25e3c1c7fb28a23c
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/editor-artifacts.md`；目标目录下
  无补充 `AGENTS.md`。
- task 217 已建立 `Runtime.update(): void` + scalar query与同Runtime的editor snapshot wrapper；
  本任务不能恢复game snapshot或复制editor状态机。
- 当前 `packages/rendercore/src/popup/index.ts` 仍从一个入口混合导出 data、resource loader、Pixi
  presentation、input binding 与 runtime；`packages/rendercore/src/index.ts` 又把它 wildcard 到根入口。
- `types.ts` 约 668 行，同时定义 v1–v6 authored schema、Pixi prepared resource、Runtime 与完整
  snapshot；data/runtime 类型无法从 import path 区分。
- `manifest.ts` 约 1331 行，strict parser 同时依赖 `browserartifactio`、`editorresource` 及含 Pixi
  runtime 的 attachment 模块；纯 schema 层尚未成立。
- 当前 `parsePopupManifest()` 返回 source-version union，`upgradePopupManifestToV6()` 是另一个显式 API；
  Popup Editor 会升级，runtime/其它 consumer 未被统一约束为默认 latest，未来容易形成版本分支漂移。
- `package-resource.ts` 约 991 行，同时承担 strict closure、mapped assets map resolve、flatten、
  namespace/rewrite、URL fetch、Blob/Object URL、Texture/Font/VNI/Spine/ImgNumber prepare 与 destroy。
- `award-player.ts` 约 1191 行、`spine-player.ts` 约 428 行；Runtime 和 editor wrapper 已共享状态，
  但 compile/prepare/display commit、layer implementation 与 inspection 仍集中在大文件中。
- award update已复用scratch且不逐帧生成snapshot；仍需正式分开immutable program、resource owner与runtime state。
- Popup Editor 同时从 `popup` 与 `popup/editor` 取 package/runtime 能力；Game Layout Editor 从
  `popup` 直接取 standalone ZIP resolve/flatten/namespace 和 runtime prepare；gamelayoutpkgcli 也从同一
  混合入口取纯 reference helper。
- Game Layout Editor 的画面预览已经由 `scene-layout` package runtime/inspector 拥有，不需要也不应
  直接创建 Popup player。当前仓库 consumer 足以决定分层，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

1. “数据、core、editor 的包装”是三层职责和单向依赖，不是三份 parser、版本升级、resource prepare 或 player。
2. “core 专门给 game runtime”表示 core 可以接受宿主提供的 canvas/keyboard target、FontFace loader
   和 Pixi parent，但自己不创建 Application/canvas/Renderer/ticker/RAF，也不理解 editor package session。
3. “简洁、性能高、内存干净”落实为小 public allowlist、预编译 runtime program、steady update
   结构性零 snapshot/重复扫描、有界 manifest-owned cache、原子 init 与可证明 destroy；没有 profiler
   数据前不承诺固定 FPS 或百分比。
4. editor wrapper 不是所有 editor 的强制总入口；consumer 按它实际承担的数据、package 或画面责任选层。
5. “任何版本都能加载”表示所有入口接受 data 层声明支持的完整历史版本集合，并默认得到 latest；
   未知未来版本仍显式失败，不能按最接近版本猜测或跳过 strict validation。

### Consumer 分层决策

| Consumer | Popup 入口 | 原因 |
| --- | --- | --- |
| Popup Editor | `data + editor` | 独立 authoring/mapped ZIP 与 snapshot preview；wrapper 内部复用 core |
| Game Layout Editor | standalone dependency IO 用 `data + editor`；预览用 Scene Layout runtime/inspector | 需要 vendor Popup package，但不拥有 Popup 内部状态机 |
| gamelayoutpkgcli | `data` | 只做 typed closure/reference traversal/rewrite，不加载 Pixi runtime |
| gameframeworks / Scene Layout / game runtime | `data + core` | 拥有 production prepare、播放、input 与 destroy，不接触 editor snapshot/map |

其它editor仅在导入/封装standalone Popup package时使用`editor`；只读写manifest用`data`；通过上层
production owner预览时不直接创建Popup core。

### 关键决策

1. **使用三个显式子路径并移除旧混合入口。**
   - data/core/editor barrels 使用 allowlist，package export/source-boundary 测试锁定 symbol 归属。
   - rendercore 是 private workspace package，本任务原子迁移已知 consumer；保留 `./popup` 或 root
     wildcard 会继续允许 game import editor materializer，因此不采用。
2. **data 是唯一 authored contract与默认版本规范化 owner。**
   - v1–v6 types、source-version strict parser、`LATEST_POPUP_MANIFEST_VERSION`、默认 latest normalizer、
     amount/visibility/attachment 的纯验证、direct reference collection 与 typed rewrite只实现一次。
   - normalizer先验证源版本，再逐版本确定性升级并以latest parser复验；返回latest manifest与
     `sourceVersion`，不让consumer在默认工作流挑选`upgradeToVn`。
   - transitive traversal 通过 caller-provided readonly file/JSON reader 组合 VNI 与 image-string data，
     不把 assets map、Blob、Texture 或 runtime object 引入 data。
3. **core 消费 compiled Popup program 与显式 resolved resources。**
   - parse 后预编译 ordered layers、state visibility、attachment DAG、logical slot/variant、string node、
     threshold stage 与 resource requirement；steady playback 不回扫 authored manifest。
   - resource loader 和 scene-layout package owner先解析 exact bytes/module，再在一次 prepare transaction
     中建立有限 runtime handles；core 不解析 editor workspace 或 content-addressed map。
   - runtime command/query 与 display commit 保持一份 canonical mutable state；editor inspection 从该状态
     按需物化，不向 core 增加第二套 snapshot cache或 mutable diagnostic buffer。
4. **editor wrapper 同时包装 package adapter 与 inspection。**
   - mapped `assets.map.json` resolve/validate、legacy flatten、namespace、materialize、standalone package
     authoring validation 和完整 snapshot 放在 editor；bounded ZIP、generic review、draft/UI/canvas 仍由 app 拥有。
   - wrapper 组合而非继承 core；preview destroy 顺序明确为 input/listener → player/container → owned
     preview resource，不能销毁 app 的 Application/canvas。
5. **不借重构改变 wire 或视觉合同。**
   - 当前 v6 仍是 latest canonical authoring版本；standalone/package loader统一先验证源manifest与exact
     source closure，再调用默认 normalizer，之后只用 latest manifest prepare core并原子commit。
   - amount、Spine/VNI/image-string、slot attachment、backdrop/focus/input click 边界以现有 tests/docs 为
     parity oracle；发现不一致先判断真实 bug，不以新分层为由改期望。

## 5. 职责与合同

- **Data**：拥有 Popup manifest/version union、latest version常量、source strict parser、默认 latest
  normalizer、ID/state/order/attachment/reference纯验证、amount format value、closure/traversal/rewrite
  helper；输出 `{sourceVersion, manifest: latest}` deep-readonly value。
- **Core**：拥有 compiled program、prepared Pixi/VNI/Spine/ImgNumber/font resource、presentation、logical
  layer runtime、award/Spine transport、string registry、viewport/input binding、command/query 和 lifecycle。
- **Editor wrapper**：拥有 mapped standalone package resolve/flatten/namespace/materialize、authoring package
  prepare validation、core-backed snapshot/inspection；复用 browserartifactio/editorresource，不复制其 hash/allocator。
- **Consumer**：Popup Editor 用 editor；Game Layout Editor 的 dependency IO 用 editor、production preview
  用 Scene Layout；CLI 用 data；gameframeworks/Scene Layout/game 用 core。
- **资源生命周期**：authored/compiled data 可共享；每个 player 独占 mutable display/runtime；package resource
  明确 owned/borrowed Texture、Object URL、font handle、nested core resource；prepare 全收敛后 commit，失败释放
  本轮 candidate；player destroy 不隐式销毁 caller-owned package resource。
- **失败策略**：unknown version/kind/state/id/resource/path、非法 order/attachment、closure/map/hash/size/orphan、
  animation/slot/glyph 不兼容、非法 delta 与 destroy 后命令在所属边界显式失败，不 fallback。
- **禁止行为**：不复制状态机、不从 filename/hash 猜 identity、不把完整 snapshot 放回 ticker、不暴露 raw
  mutable scratch、不过度缓存历史项目、不用丢帧/delta、跳校验或降级效果换性能。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/data/**
packages/rendercore/src/popup/core/**
packages/rendercore/src/popup/editor/**
packages/rendercore/tests/popup/{data,core,editor}/**
packages/rendercore/benchmarks/popup-runtime-hot-path.mjs
tasks/220-rendercore-popup-data-core-editor-refactor-<utctime>.md
```

### 预计修改

```text
packages/rendercore/package.json
packages/rendercore/src/index.ts
packages/rendercore/src/popup/**
packages/rendercore/src/scene-layout/**
packages/rendercore/tests/{popup,scene-layout}/**
packages/rendercore/{README.md,vite.config.ts,tsconfig*.json}
packages/gameframeworks/{src/**,tests/**,README.md}
apps/popupeditor/{src/**,tests/**,README.md,vite.config.ts}
apps/gamelayouteditor/{src/**,tests/**,README.md,vite.config.ts}
apps/gamelayoutpkgcli/{src/**,tests/**}
docs/popup-manifest.md
docs/agent-rules/{shared-game-runtime,editor-artifacts}.md
```

### 原则上不应修改

```text
packages/{logiccore,uiframeworks,vnicore,pixiani}/**
packages/rendercore/src/image-string/**
packages/{browserartifactio,editorresource}/**
assets/**
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
AGENTS.md
```

若执行时发现必须改变 Popup schema/wire、VNI/Spine/image-string public contract、通用 map/hash 算法、
production assets、根工具链或新增依赖，先停止说明范围扩张，不能修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线与 public/consumer allowlist**
   - 重核 HEAD/status，用 `rg` 生成旧 root/`./popup`/`./popup/editor` import 与 public symbol consumer 矩阵。
   - 先用 export-boundary 和 source-boundary tests 固定 data/core/editor allowlist，并固定 v1–v6 default load/latest、
     award/Spine phase、snapshot、input、attachment、resource/destroy 与 Scene Layout parity 基线。
2. **建立独立 data 层**
   - 拆分 authored types 与 runtime types，建立 source strict parser + version-step upgrader + default latest
     normalizer，迁移 amount/reference/state/attachment 的纯验证和 rewrite/traversal helper；消除
     Pixi、DOM、core/editor imports。
   - source parser/upgrader可作为data内部或明确migration工具存在，但默认入口只返回latest；用全历史
     版本表驱动测试防止新增latest后遗漏consumer。
   - 把 attachment graph 的纯 DAG/order/identity 校验与 Pixi mount 分开；保留 exact error、deep-readonly
     输出、legacy version 与 canonical v6 语义。
   - 迁移 gamelayoutpkgcli 及 editor 内只做 schema/reference 操作的代码到 `popup/data`。
3. **建立精简 game runtime core**
   - 将 manifest 编译为 immutable Popup program，预计算 state/layer/resource/string/attachment/order/threshold
     lookup；runtime 只持播放需要的 compact mutable state与稳定 scratch。
   - 将 award、Spine、overlay、presentation、input、font与nested runtime 按唯一 owner 拆分，由一个小 Runtime
     facade 暴露 command、void update、scalar query、handles、viewport和destroy。
   - 保留 task 217 无 snapshot ticker；缓存最后 displayed amount/formatted string，避免相同值重复格式化与
     node commit；用 constructor/identity spy 证明 stable frame 不创建 layer/player/snapshot/lookup。
4. **收紧 resource transaction 与内存边界**
   - 把 runtime resolved-resource prepare 与 mapped/editor package resolve 分开；Scene Layout 只向 core 交付
     strict resolved closure，standalone mapped package 由 editor adapter 解析。
   - 独立资源可并发prepare；失败时等待已启动Promise settle并rollback全部owned candidate，
     只有全成功才建立可播放package resource。
   - 覆盖 complete→replay、resource variant 切换、init failure、destroy during/after init、double destroy、
     owned/borrowed texture/font/Object URL/VNI/Spine/ImgNumber释放和 manifest-owned cache bound。
5. **建立完整 editor wrapper**
   - 迁移 assets map resolve、mapped/legacy package closure、flatten、namespace、materialize 与 authoring prepare
     validation；API 接受 app 已 bounded-normalize 的 file map，不接管 ZIP extraction、UI 或 workspace session。
   - 保留 Award/Spine snapshot player wrapper，按需从同一 core 物化 immutable inspection；不让 snapshot
     生成进入 core update 或 production Scene Layout。
   - Popup Editor改为通过editor adapter默认加载任意支持版本并取得latest，再构建resource/player；app只用
     `sourceVersion`显示迁移提示，继续拥有Application/canvas/ticker/keyboard eligibility、generation cancel、
     project draft和错误展示。
6. **按责任迁移其他 consumers**
   - Game Layout Editor 的 Popup ZIP import/validate/flatten/namespace/vendor 改用 editor；embedded manifest
     rewrite 用 data；LayoutPreview 继续只创建 Scene Layout runtime/inspector，并加 source-boundary 测试禁止
     direct Popup player/core factory。
   - Scene Layout与game runtime的package loader同样调用data默认latest normalizer，再把latest program交给
     core；gameframeworks只按facade需要重导latest data types与core Runtime，不导出editor player/snapshot/
     package adapter。
   - 搜索确认无旧 `./popup`、root Popup wildcard、game→editor、data→core/editor、core→editorresource 或
     editor 内第二份 Popup 状态机残留。
7. **性能、文档与收尾**
   - 增加固定 award/Spine program 与 delta/interaction 序列的 warm benchmark，记录重构前后 update吞吐、
     snapshot/constructor count、rebuild/destroy heap slope；wall-clock 只进报告，不作 flaky 单测 gate。
   - 更新 README、Popup manifest文档与两份领域规则，说明三层入口、consumer选择、host ownership和lifecycle。
   - 按第 8 节完成 L2 自动/人工验收，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- data 覆盖每个支持版本的default load→latest、latest idempotence、invalid source/upgrade result、
  reference/attachment/order、pure closure/rewrite和
  import boundary；core 覆盖 award/Spine parity、large delta、input、atomic state/resource commit、cache bound、
  rollback/destroy；editor 覆盖 mapped/legacy package、map/hash/orphan、namespace、snapshot和core parity。
- 相同 manifest/resource、delta与interaction序列下，重构前 fixture与新 core 的 phase、tier/segment、amount、
  visible/order/attachment、completion edge、string handle、snapshot和最终 display tree保持一致。
- 热路径自动化使用 stable identity、constructor/formatter/snapshot materialization次数和有限 cache size；
  不以本机毫秒阈值替代浏览器 profiler。
- 不为旧混合 import 增加 alias；测试迁移到新职责入口。

### 验收级别

`L2`：修改 rendercore Popup public subpaths、resource/lifecycle，并迁移 gameframeworks、Scene Layout、
两个 editor 与 CLI 直接 consumer；不修改正式 schema、assets、根工具链或 lockfile。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup tests/scene-layout/package-resource.test.ts tests/scene-layout/package-runtime-mode.test.ts
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli test
pnpm --filter popupeditor --filter gamelayouteditor build
git diff --check
```

共7条：declaration/export、Popup/Scene Layout行为、consumer编译、editor/CLI行为、Vite build与diff
需独立证据；不默认运行根级验收。新直接consumer只加入同一L2定向命令。

### 人工验收

1. Node 24 下在 Popup Editor新建latest award与Spine项目，并逐一导入合法v1–v5/mapped v6 ZIP；确认均由
   默认入口变成latest且仅显示source version迁移提示，再复验资源
   review、五档 stable-id/amount、start/loop/end、attachment、文字/ImgNumber、viewport、点击、导出重导。
2. 连续至少 50 次 rebuild→play/advance/dismiss→project switch→destroy/recreate；用浏览器 Performance/
   Memory记录 frame time、allocation timeline、minor GC与heap snapshot，确认 listener、Object URL、FontFace、
   Texture、VNI/Spine、ImgNumber、Container和snapshot数量不持续增长。
3. 在 Game Layout Editor 导入/替换同一 Popup dependency，复验hash冲突review、flatten/namespace/vendor、
   layout导出重导及 Scene Layout production preview；确认没有第二个 standalone Popup core/display tree。
4. 用相同真实资源和操作序列对比重构前后 award五档切换、旧档隐藏、VNI immediate end/drain、普通Spine
   loop点击边界和全 viewport backdrop；记录差异，自动测试不能冒充视觉验收。

### 独立验收建议

**必须**。涉及跨包 public contract、Popup production hot path、异步 resource transaction、Texture/Font/
Object URL/VNI/Spine/ImgNumber ownership和editor mapped package边界。独立复验重点为 export/旧 import零残留、
phase/视觉/snapshot parity、prepare rollback、replay与repeated destroy；最多重跑 rendercore Popup tests、全部
直接 consumer typecheck和Popup Editor tests三组命令。

## 9. 环境与依赖

- 使用仓库要求的 Node 24与pnpm；shell没有Node时通过nvm切换到24。
- 依赖缺失时执行 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库代理并重试。
- 预计不新增依赖、不修改lockfile；使用现有TypeScript/Pixi及shared package能力。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、production ZIP或生成文件，不手改 `dist/`；若意外触发生成物变化，必须先说明
  权威输入与正式 generator/checker，不能手工同步。
- 更新 `packages/rendercore/README.md`、`apps/popupeditor/README.md`、`docs/popup-manifest.md`，给出
  data/core/editor入口、game runtime与editor wrapper最小示例及旧入口迁移说明。
- 稳定职责发生变化，最小更新 `docs/agent-rules/shared-game-runtime.md` 与
  `docs/agent-rules/editor-artifacts.md`；不修改根 `AGENTS.md`，不把 benchmark数值或任务证据写进规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/220-rendercore-popup-data-core-editor-refactor-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```
报告简要记录最终allowlist/consumer/文件、compiled program与lifecycle、自动及浏览器验收、
未完成项、计划偏差和独立验收结论；不收集整仓coverage、历史矩阵或无关发布证据。

## 12. 风险、假设与待确认

### 风险

- 当前 authored/runtime types与attachment validation互相引用；拆分时若仅移动文件而不拆纯graph与Pixi mount，
  会形成data反向依赖core，必须由source-boundary测试阻止。
- current package loader同时支持mapped与legacy direct-path URL；重构必须保持实际受支持的数据语义，同时把
  editor assets-map materialization移出core，不能用删除合法package支持来换“简洁”。
- award logical slot跨档换resource/attachment需要原子切换；prepare或remount失败不能留下两档同时可见、
  stale string handle或泄漏旧variant。
- FontFace、Object URL、nested VNI/Spine/ImgNumber的ownership不同；统一调用 `destroy({children:true})`
  可能误销毁borrowed对象，必须逐类证明owner与释放顺序。

### 假设

- 当前 Popup v6是`LATEST_POPUP_MANIFEST_VERSION`；未来提升latest时扩展同一normalizer与全版本矩阵，
  consumer入口不改名、不自行增加版本分支。
- 同一Runtime同一时刻最多一场播放，并发`start()`显式失败；Scene Layout继续拥有production package、
  placement、ticker、input和最终destroy，game app不直接操作Popup内部display tree。
- repo内private package允许本任务原子移除旧TypeScript入口；没有仓库外未知consumer兼容承诺。

### 待确认

无。执行时若发现仓库外发布合同、合法mapped/runtime加载必须依赖未计划的shared API变更，先报告精确
consumer与最小证据，不自行扩大schema、依赖或lockfile范围。
