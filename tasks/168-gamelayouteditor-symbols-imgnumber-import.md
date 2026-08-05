# 168 gamelayouteditor-symbols-imgnumber-import 任务计划

## 1. 目标与完成定义

### 目标

修复 Game Layout Editor 导入包含 symbol-owned ImgNumber（image-string node）的 SymbolsEditor ZIP 时，
package 扁平化已经给资源分配 owner 前缀、但 Symbols manifest 仍引用旧 filename key，最终报
`Image-string manifest is missing: new-image-string-2.image-string.manifest.json.` 的问题。

保持统一 filename-key workspace 的既有冲突合同：同一 logical key 且 bytes 相同可复用；同一
package id 的显式替换可覆盖该 owner 独占 key；独立 owner 同名但不同 bytes 必须用稳定 package 前缀
或 suffix 并结构化重写全部 typed 引用，不能静默覆盖或只改文件名。

### 完成定义

- [ ] `~/Downloads/minecart2/minecart2-symbols.zip` 可通过 Game Layout Editor 的正式 Symbols 导入链，
      ImgNumber manifest、glyph 和 symbol node exact closure 全部可解析。
- [ ] 导入后 `imageStringNodes[].resource` 指向 `pkg-9-minecart2-...` owner key，nested image-string
      glyph 引用同步指向相同 owner 下的已物化 key，不残留旧路径。
- [ ] value ImgNumber 的 `valuePresentation.text.tiers[].resource`、命名 ImgNumber 与两者的
      `specialValueImages[].image` 使用同一 typed rewrite 合同。
- [ ] 两个不同 Symbols package 使用相同 ImgNumber 文件名时可并存：相同 bytes 只在物理 payload
      层按 SHA-256 去重，不合并 package/image-string 业务 identity；不同 bytes 不互相覆盖。
- [ ] 同 package id 仍只能走显式替换；替换成功保留 mode binding，失败时 project 和旧 dependency
      不变，不因本任务新增静默 alias、首项 fallback 或猜测路径。
- [ ] 不含 ImgNumber 的 image、Spine、VNI、composite、full-value image Symbols package 物化行为不变。
- [ ] rendercore 定向测试、gamelayouteditor 导入/ZIP 回归、两 package typecheck/build 通过，并生成任务
      168 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/src/symbol/materialize-package.ts` 的 Symbols manifest typed filename-key rewrite
  完整性，重点覆盖命名 ImgNumber、value ImgNumber 和特殊值整图。
- `apps/gamelayouteditor/src/io/imported-symbol-package.ts` 的正式
  `standalone validate -> owner-prefix materialize -> revalidate -> dependency files` 导入链回归。
- 两个 Symbols dependency 的同名同内容、同名不同内容、同 id 替换和最终 mapped layout ZIP 去重验证。
- synthetic fixture 与用户提供 `minecart2-symbols.zip` 的真实浏览器人工验收。

### 不包含

- 不修改 SymbolsEditor 或 ImgNumber Editor 的 authoring UI、导出 schema、node target、glyph 排版或命名
  策略。
- 不把 `new-image-string-2` 自动改回 `new-image-string`，也不根据 `-2` 猜测两个 ImgNumber 是同一业务
  identity。
- 不允许 Layout Editor 编辑 Symbols package 内部 ImgNumber 名称、manifest id、glyph、targets、文本、
  transform 或 special values。
- 不用“相同 SHA-256”合并不同 logical owner；SHA-256 只决定最终 physical payload 去重和同 key bytes
  相等判断。
- 不修改 Scene Layout schema/runtime、Popup、game002/game003、production 美术、生成器、根工具链或
  lockfile。
- 不增加 legacy path fallback、orphan allowlist、filename glob、任意 JSON 字符串扫描或缺资源降级。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T07:38:33Z
HEAD: 8123712e22fdcbc4af68e115e9597564d5440366
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与计划输入：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
tasks/162-gamelayouteditor-multi-package-transition-popup.md
tasks/165-gamelayouteditor-popup-and-layer-order.md
apps/gamelayouteditor/README.md
packages/rendercore/README.md
```

真实 artifact 结论：

- `/Users/zerro/Downloads/minecart2/minecart2-symbols.zip` 是 mapped Symbols package，根包含
  `symbols.package.json`、`symbol-state-textures.manifest.json`、`gameconfig.json`、`assets.map.json`
  和 82 个 content-addressed payload；package id 为 `minecart2`。
- `symbols.package.json.resources` 明确声明
  `new-image-string-2.image-string.manifest.json` 和 15 个
  `new-image-string-2-coin_*.png`，不是 SymbolsEditor 漏导 ImgNumber。
- `assets.map.json.files["new-image-string-2.image-string.manifest.json"]` 指向
  `assets/1238a043...8aff9.json`，`sha256=1238a043...8aff9`、`byteLength=3096`；该 payload
  是合法 image-string v1，id 为 `new-image-string-2`，glyph 引用也全部存在于 map。
- symbol manifest 的命名 node `image-value` 引用
  `./new-image-string-2.image-string.manifest.json`，targets 包含
  `normal/spinBlur/disabled/appear/win`。当前错误路径正是该 owner 引用，而不是 ZIP 外的猜测路径。
- 下载目录中的 standalone `new-image-string-image-string (2).zip` id 为 `new-image-string`；它与
  embedded `new-image-string-2` 的 manifest SHA-256 分别为 `24f32f50...1d296` 和
  `1238a043...8aff9`，且逗号/小数点 glyph bytes 也不同，不能按“完全相同资源”直接合并。
  当前 artifact 无法证明 `-2` 的历史来源，但它已经是自洽的独立 logical identity。

当前代码与能力缺口：

- `importSymbolsZipWithFiles()` 先用原 mapped ZIP 创建 `sourceResource`，随后以
  `packageKeyPrefix(id)` 生成 `pkg-<id-length>-<id>`，调用
  `materializeMappedSymbolPackageContents()`，再从物化文件创建最终 resource。
- `flattenSymbolAssets()` 已把 ImgNumber manifest 和 glyph 物化为
  `pkg-9-minecart2-new-image-string-2...`，并能结构化重写 image-string manifest 内部 glyph path。
- `rewriteSymbolManifestPaths()` 目前只处理 normal/state、animation、Spine/VNI 和 full-value image；
  它没有处理 `imageStringNodes[].resource`、node/value `specialValueImages[].image`，也没有处理
  `valuePresentation.text.type="image-string"` 的 tier resource。
- 因此物化后的资源 Map 只有 prefixed manifest，symbol manifest 仍查找 unprefixed manifest；随后
  exact closure 或 resource pool 的严格校验在 dependency merge 前失败。该错误不是
  `mergeDependencyAssets()` 发现的 workspace 重名，也尚未进入覆盖/keep-both 决策。
- `mergeDependencyAssets()` 已对同 key + 同 bytes 复用，对非 replaceable 同 key + 不同 bytes 显式
  失败；不同 package id 由稳定 owner prefix 隔离，同 package id 由 `replaceSymbolDependency()` 显式
  替换并只 GC owner-exclusive keys。现有冲突算法不应为本 bug 重写。
- `packages/rendercore/tests/symbol/materialize-package.test.ts` 虽有“rewrites image-string internals”用例，
  但 fixture 的 symbol manifest 没有引用该 image-string，package resources 也排除了它，因此没有覆盖
  owner manifest 到 nested ImgNumber root 的路径重写。

当前代码、正式规则与真实 artifact 已足以确认根因，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- 用户看到的错误不表示 Symbols ZIP 缺少 ImgNumber；ZIP 的 exact closure 完整，故不应要求重新从
  SymbolsEditor 导出或手工补文件。
- `new-image-string-2` 的名字可能来自上游 keep-both 分配，但当前 artifact 只能确认它是合法独立 id，
  不能据名字推断可覆盖另一个 `new-image-string`。
- 本次“自动修改 symbols 包里的 ImgNumber 名字”应解释为导入事务对 filename key 做 owner-safe
  物化，并同步改写 schema 已知的 typed path；不得修改 image-string `id`、node `name` 或其它业务
  identity。
- 相同内容的处理分两层：logical key 相同且 bytes 相同是 no-op/reuse；不同 logical owner 即使 bytes
  相同也保留两份引用，只在 `assets/<sha256>.*` 层写一份物理 payload。
- 同名不同内容不允许直接覆盖独立 package；当前 Symbols dependency 使用 package id prefix 已能稳定
  避免冲突，缺口是所有 nested owner 引用必须同步跟随该 prefix。

### 关键决策

1. **修复共享 typed rewrite，不在 Layout Editor 做 ImgNumber 特判**
   - 扩充 rendercore 私有 `rewriteSymbolManifestPaths()`，让它遍历 strict Symbols schema 中全部资源
     引用字段；gamelayouteditor 继续只调用公开 package materializer。
   - 这样 SymbolsEditor、Layout Editor 或未来合法 consumer 使用相同物化 API 时不会产生不同规则，
     app 也不需要解析 symbol 私有配置。

2. **identity 与 filename key 分离**
   - package id、image-string manifest `id`、image-string node `name`、targets 和 tier 语义原样保留。
   - 只重写 `resource/image/skeleton/atlas/texture/project` 等 schema 声明的 filename reference；不能对
     全部 JSON string 做替换，也不能从 basename 猜未知字段。

3. **所有 ImgNumber 形态一次补齐**
   - 命名 node：重写 `imageStringNodes[].resource` 与其 `specialValueImages[].image`。
   - value ImgNumber：当 `valuePresentation.text.type === "image-string"` 时，逐 tier 重写
     `resource`，并重写 text-level `specialValueImages[].image`。
   - 保留 full-value image 的 `images`/legacy `prefix`、tier Spine、reel state 和 composite 现有逻辑，
     防止只修真实样本后留下同类第二个缺口。

4. **prepare 完整、reparse 后才 commit**
   - materializer 先建立 source path -> owner key 的完整 mapping，再结构化生成 rewritten manifest、
     nested manifests、assets map 和 package manifest。
   - 用 `collectSymbolManifestResourcePaths()` 和 `createSymbolPackageResource(loadTextures:false)` 复验
     exact closure；Layout Editor 只有在最终 imported resource 成功后才允许 dependency merge。
   - 任一缺 mapping、collision、manifest/schema、hash/size 或 closure 错误显式失败，不返回半成品。

5. **保留现有 collision/替换合同并用测试证明**
   - 不改变 `mergeDependencyAssets()` 的“same key/same bytes 可复用、same key/different bytes 拒绝”行为。
   - 不同 package id 的稳定 prefix 是独立 owner 自动改名；同 id 上传仍提示走 replace，而不是自动覆盖。
   - export 使用现有完整 SHA-256 content addressing 去重相同 physical bytes，不因去重改写 logical id。

## 5. 职责与合同

- **rendercore Symbols materializer**：拥有 Symbols package schema-aware path rewrite、mapped package
  物化、exact closure 推导和物化后 strict revalidation。
- **Game Layout Editor importer**：拥有 bounded ZIP、standalone package 校验、package-id owner prefix、
  imported resource 生命周期与 dependency transaction；不读取或编辑 ImgNumber 内部字段。
- **editorresource/browserartifactio**：继续拥有 SHA-256、filename-key review/workspace、assets map integrity
  和 physical payload；本任务不复制 hash 或 allocator。
- **Symbols package owner**：继续拥有 image-string id、node name/targets、tier、glyph、special values 与
  display semantics；导入只迁移引用，不改变业务配置。
- **失败策略**：未知字段、缺 root/glyph、缺 mapping、same-owner 不同 bytes collision、非法 package id、
  map/hash/size/orphan 和 reparse failure 都在 project commit 前显式失败。
- **禁止行为**：不静默覆盖不同 owner，不以 hash 合并 logical identity，不猜 `-2`、不扫描任意 JSON，
  不保留旧 key alias，不用 missing ImgNumber fallback 绕过 preview/runtime。

## 6. 文件范围

### 预计新增

```text
tasks/168-gamelayouteditor-symbols-imgnumber-import-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/symbol/materialize-package.ts
packages/rendercore/tests/symbol/materialize-package.test.ts
apps/gamelayouteditor/tests/imported-symbol-package.test.ts
apps/gamelayouteditor/tests/game-mode-commands.test.ts
apps/gamelayouteditor/tests/zip-io.test.ts
```

只有在正式 importer 需要补充 prepare 失败时的 resource cleanup 或错误上下文时，才修改：

```text
apps/gamelayouteditor/src/io/imported-symbol-package.ts
```

现有 README 和领域规则已经明确“Symbols dependency 只读、owner-prefix、typed rewrite、SHA-256
physical dedup”合同；本任务只是修复实现偏差，默认不重复更新文档或规则。若执行发现文字仍声称错误
行为，只更新最小相关段落。

### 原则上不应修改

```text
apps/symbolseditor/**
apps/imgnumbereditor/**
packages/rendercore/src/symbol/{manifest,package}.ts
packages/rendercore/src/image-string/**
packages/editorresource/**
packages/browserartifactio/**
packages/rendercore/src/scene-layout/**
apps/gamelayoutpkgcli/**
apps/game002/**
apps/game003/**
assets/**
pnpm-lock.yaml
AGENTS.md
docs/agent-rules/**
```

若执行时发现必须修改 Symbols schema/public API、通用 workspace collision policy 或 production ZIP
schema，属于明显扩大范围，必须先说明新证据并重新规划，不能用 fallback 掩盖。

## 7. 实施步骤

1. **确认执行基线并固定真实失败形状**
   - 重读根规则、两份领域规则、本计划和当前 materializer/importer，核对 HEAD/status 与目标 ZIP 是否仍
     可读。
   - 先建立最小 synthetic package：一个 symbol 的 `imageStringNodes` 引用 nested image-string root、
     glyph 与特殊值整图；确认旧实现因 prefix 后 owner ref 未改写而失败。
   - 测试 fixture 复制 schema 形状而不提交用户下载 ZIP 或美术 bytes 到仓库。

2. **补齐 Symbols manifest typed rewrite**
   - 在 `rewriteSymbolManifestPaths()` 中按 strict union 处理命名 ImgNumber resource/special images 和
     value image-string tier/special images。
   - 每个必需 path 使用 mapping 的严格版本；缺 mapping 立即指出 exact typed field/path，不保留旧值。
   - 保留 id、name、targets、initialText、anchor、transform、followSlotColor、tier thresholds 与 atlas
     page logical name。

3. **复验完整 materialization transaction**
   - 断言 owner prefix 同时出现在 symbol manifest root ref、image-string glyph ref、特殊值整图、
     package resources 和 assets map logical key 中。
   - 对 rewritten 结果再次调用正式 package parser/resource creator，证明 required resources 与 declared
     resources 完全一致且没有 orphan。
   - 核对失败路径释放 source/final resource 和 Object URL owner，不向 EditorProject merge 部分 files。

4. **补 Layout Editor consumer 与 collision 回归**
   - `imported-symbol-package.test.ts` 通过正式 ZIP API 导入含命名/value ImgNumber 的 package，断言
     `pkg-<length>-<id>` key 和 raw manifest 引用一致。
   - 用两个不同 package id + 相同 nested filename 测试同 bytes 和不同 bytes：两者都能安全导入，
     dependency keys 不串 owner；相同 id 仍必须显式 replace。
   - `zip-io.test.ts` 绑定两个 package 后导出/重导，检查 typed refs、exact closure、assets map 和相同
     physical bytes SHA-256 去重，不只断言 Promise 成功。

5. **兼容回归与收尾**
   - 保留现有 normal/state、Spine/VNI/composite、value full-image materialization 测试，增加断言防止新
     traversal 改写非 path 业务 string。
   - 使用真实 `minecart2-symbols.zip` 在浏览器导入、绑定、预览和 layout export/reimport；不修改原 ZIP。
   - 运行 L2 定向验收，检查 diff/残留旧引用，按模板生成任务 168 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- synthetic fixture 同时覆盖命名 ImgNumber、value ImgNumber、tier 重复引用、special value image 和
  mixed image/Spine/VNI resource，避免测试只对真实文件名硬编码。
- 正常路径检查 source -> owner-key mapping 的每一层；strict failure 覆盖缺 manifest、缺 glyph、缺
  special image、mapping collision 和 rewritten closure orphan。
- collision 测试区分 logical 与 physical：不同 owner identity 始终保留，相同 bytes 只检查 payload
  去重；不同 bytes 检查 owner 隔离和正确引用，不期待覆盖。
- import/replace failure 必须断言 project assets、dependency Map、mode binding 和旧 preview owner 不变。
- 不为旧错误期望保留未重写 path；与正式 typed closure 合同冲突的 fixture 应改正。

### 验收级别

`L2`。实现改动位于 rendercore 的共享 Symbols package materializer，直接 consumer 是
gamelayouteditor，并影响正式 Symbols ZIP -> Layout ZIP 交付边界与 nested exact closure；不修改 schema、
根工具链、lockfile 或 release，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/materialize-package.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/imported-symbol-package.test.ts tests/game-mode-commands.test.ts tests/zip-io.test.ts
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor typecheck
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor build
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor format:check
git diff --check
```

若定向测试暴露 package materializer 的直接既有测试回归，再升级到两 package 全量 test；不默认运行根级
test/typecheck/build。

### 人工验收

1. 在空白 Game Layout Editor project 导入
   `/Users/zerro/Downloads/minecart2/minecart2-symbols.zip`，确认不再出现缺少
   `new-image-string-2.image-string.manifest.json`，library 显示 package `minecart2`。
2. 绑定 `minecart2` 的合法 reelSet/renderMode，打开 reel preview，确认带 `image-value` 的 symbol 可准备
   且 ImgNumber glyph 正常显示；切 mode/variant 不丢 dependency。
3. 再导入一个不同 package id、但内部也使用同名 image-string/glyph 的 synthetic ZIP，分别使用相同与
   不同 glyph bytes 验证两 package preview 不串资源。
4. 导出 Layout ZIP 并重导，确认两个 package 的 manifest id/node name 保持不变、logical owner keys
   可达、同 bytes physical payload 只存一次、不同 bytes 各自保留。
5. 对同 id 新 ZIP 使用替换入口，确认 mode binding 保留；取消替换或导入失败时旧 package 仍可预览。

### 独立验收建议

`建议`。任务涉及共享 materializer、正式 Symbols/Layout ZIP 和 nested dependency closure，但不改变 public
schema。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/materialize-package.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/imported-symbol-package.test.ts tests/zip-io.test.ts
git diff --check
```

并目视一次真实 `minecart2-symbols.zip` 的导入与 reel preview。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只运行 `CI=true pnpm install --frozen-lockfile`；实际下载失败后才设置仓库约定代理重试。
- 本任务不需要新增依赖或修改 lockfile；SHA-256、ZIP、assets map、typed parser 和测试工具均已存在。
- 下载目录 artifact 只用于定向复现和人工验收，不复制进仓库，不作为自动化测试的长期依赖。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、schema 或生成文件，不运行 Symbols state texture generator。
- mapped Symbols/Layout ZIP 仅由正式 materializer/exporter 在测试或人工验收中生成，不手改
  `assets.map.json`、content-addressed payload 或 nested manifest。
- 当前 README 与 `editor-artifacts.md` 已声明正确 owner-prefix、typed rewrite、exact closure 和 physical
  dedup 合同；实现对齐后不重复追加任务细节。
- 只有执行发现稳定职责边界确实需要改变时才更新最小领域规则；不得把 minecart2 文件清单或 hash
  追加到根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/168-gamelayouteditor-symbols-imgnumber-import-<utctime>.md
```

报告简要记录最终 rewrite 字段、实际修改文件、定向测试/构建结果、真实 ZIP 人工验收、计划偏差和剩余
风险；不收集无关 coverage、完整历史矩阵或整仓统计。

## 12. 风险、假设与待确认

### 风险

- 当前缺口可能同时影响 `valuePresentation.text.type="image-string"` 和 special value image；若只修
  `imageStringNodes[].resource`，其它合法 Symbols package 仍会在同一物化边界失败。
- rewritten manifest 若使用可选 lookup 并保留旧值，会把 prepare error 延后到 preview/runtime；必须对
  schema 声明的 required path 使用 strict mapping。
- 相同 bytes 的 manifest 可能因 owner filename key 改写而产生不同 canonical JSON bytes；physical 去重
  只对最终实际 bytes 生效，不能承诺语义相同 JSON 一定共用一个 payload。
- 真实浏览器 texture load 会校验 PNG/WebP 解码与 glyph size，`loadTextures:false` 单测不能替代真实
  minecart2 preview。

### 假设

- `minecart2-symbols.zip` 在执行会话仍位于当前下载路径；若不存在，自动化使用等价 synthetic fixture，
  人工验收标记未完成而不把外部文件提交到仓库。
- package id prefix `pkg-<length>-<id>`、same-id 显式 replace 和现有 SHA-256 assets map 是已确认合同，
  本任务只补 typed reference parity。
- `new-image-string-2` 是当前 Symbols package 的正式 logical identity；除非用户提供上游 authoring 证据，
  执行不对其 id 或 node name 做业务级合并。
