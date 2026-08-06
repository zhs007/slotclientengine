# 176 gamelayouteditor-symbol-resource-order-roundtrip 任务计划

## 1. 目标与完成定义

### 目标

修复 Game Layout Editor 在导入 Layout ZIP、再导入 SymbolsEditor ZIP、导出新 Layout ZIP 后，新 ZIP
无法重新导入并报 `symbol package resources must be sorted by canonical path.` 的问题。

修复必须保留 Symbols package 的 strict canonical-order 合同：filename key 规范化或 owner 前缀改写完成后，
由 Layout ZIP 边界重新生成合法顺序并再次严格解析，而不是放宽 rendercore parser、忽略顺序或保留旧路径
alias。

### 完成定义

- [ ] 按真实流程导入 `/Users/zerro/Downloads/crave/layout2.zip`，再导入同目录
      `symbols.zip`，导出的 Layout ZIP 可立即重新导入。
- [ ] filename key 从 `new-image-string-4-+.png` 规范化为最终合法 key 后，nested
      `symbols.package.json.resources` 按最终 canonical path 排序；entrypoints、symbol manifest、ImgNumber
      glyph/special image 引用和实际 payload 使用同一组 key。
- [ ] `layout2.zip` 和修复后新导出 ZIP 的 `adaptation.artSize` 均保持 `2000 × 2000`，重导与重导入不把它
      清零、不从 Spine bounds/atlas texture 推导，也不要求用户重复填写。
- [ ] 重新导入成功后 workspace 被原子替换，错误面板不再同时显示空白项目的 art-size diagnostic 和
      Symbols 顺序错误；真正失败的导入仍保留原 workspace 并显示 exact external error。
- [ ] standalone Symbols ZIP 和已有 Layout ZIP 的 strict parser 行为不变：任意乱序、重复、alias、缺文件或
      orphan package 仍显式失败；本任务不兼容、修复或保留旧实现已经导出的 `layout3.zip`。
- [ ] 定向自动化、typecheck/build、真实 ZIP 人工往返和 diff 检查通过，并生成 Task 176 UTC 中文执行报告。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 的 Layout ZIP filename-key flatten 对 nested Symbols package manifest 的
  typed path rewrite、最终 canonical sort 和 strict reparse。
- synthetic punctuation/case/owner-prefix fixture、完整 export → import round-trip、art size 保留和 strict
  failure 回归。
- 使用现有 `layout3.zip` 只读确认根因；浏览器人工验收只使用 `layout2.zip`、`symbols.zip` 和修复后新导出
  ZIP，不修改或提交下载目录资源。

### 不包含

- 不修改 SymbolsEditor 的导出 schema、资源命名、ImgNumber 配置或 `symbols.zip` 本身。
- 不修复、迁移或继续验收现有 `/Users/zerro/Downloads/crave/layout3.zip`；用户会删除它并在实现完成后
  重新导出。
- 不改变 `parseSymbolPackageManifest()` 的 canonical order、path collision、entrypoint 或 exact closure 校验。
- 不把任意 standalone Symbols package 的乱序当成可接受输入；不增加自动 sort fallback 到 rendercore
  runtime、Symbols importer 或其他 consumer。
- 不修改 Scene Layout schema/version、art-size 规则、Spine bounds 推导、Resource Picker 或背景 placement。
- 不压制空白 draft 的合法 art-size diagnostic，也不在导入失败时清空当前 project errors；本任务通过修复
  ZIP 往返使真实导入成功，失败时仍同时保留本地 draft 校验与 external import error。
- 不修改 Popup/VNI semantics、game002/game003、production 美术、gamelayoutpkgcli、根工具链、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-06T07:39:21Z
HEAD: cd0063542060684a6d30992b4d3b804497555fa6
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与计划输入：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
apps/gamelayouteditor/README.md
docs/scene-layout-manifest.md
tasks/168-gamelayouteditor-symbols-imgnumber-import.md
tasks/172-gamelayouteditor-layer-mode-visibility.md
```

`apps/gamelayouteditor` 下没有额外 `AGENTS.md`。

真实 artifact 结论：

- `/Users/zerro/Downloads/crave/layout2.zip` 是 mapped Layout ZIP，根只有
  `layout.manifest.json`、`assets.map.json` 和 content-addressed payload；layout id 为 `new-layout`。
- `layout2.zip` 的 `adaptation.mode=maximized-focus`，`artSize={width:2000,height:2000}`；BaseGame 与
  FreeGame 的 Spine 背景节点、placement 和 game-mode binding 均存在。
- `/Users/zerro/Downloads/crave/symbols.zip` 是 SymbolsEditor mapped export，package id 为
  `game002-s3`，声明 111 个 canonical resources；其中包含
  `new-image-string-4-+.png`、`new-image-string-4-1.png`、`new-image-string-4-2.png` 及对应
  image-string manifest。
- `/Users/zerro/Downloads/crave/layout3.zip` 仍保存合法 `2000 × 2000` art size，说明
  `背景 art size 尚未完成` 不是 ZIP 内尺寸丢失。
- `layout3.zip` 的 nested Symbols manifest 已使用 `pkg-10-game002-s3-*` 扁平 key，并把
  `new-image-string-4-+.png` 规范化为 `pkg-10-game002-s3-new-image-string-4.png`；但 resources 数组
  仍保留改写前的位置，因此不再满足最终 key 的 `localeCompare(..., "en")` canonical order，严格 parser
  抛出用户看到的第二条错误。

当前代码与能力缺口：

- `exportLayoutZip()` 先通过 `parseSymbolPackageManifest()` 和 `collectSymbolPackageEntryPaths()` 验证
  dependency，再由 `flattenLayoutClosure()` 为完整 closure 分配 canonical filename keys；源 Symbols package
  在 flatten 前合法。
- `createCanonicalFilenameMapping()` 会做 NFKC、ASCII 小写、标点转 `-`、冲突 suffix 和相同 bytes 复用。
  这种映射不是 order-preserving，尤其 `+` 被规范化并清理后会改变相邻 path 的 canonical 相对顺序。
- `flattenLayoutClosure()` 对 `kind="symbol-package"` JSON 走通用 `rewriteExactJsonReferences()`：数组元素被
  改写但数组顺序不变；随后只写 stable JSON，没有用 rewritten package parser 复验。
- 重新导入 `layout3.zip` 时，`collectSceneLayoutPackagePaths()` 在 nested package strict parse 处发现导出
  artifact 已不合法并失败；按用户确认，本任务不为该旧 artifact 增加 import migration。
- `rewriteExactJsonReferences()` 会递归访问全部 string，无法表达 Symbol package 只有
  `entrypoints.gameConfig`、`entrypoints.symbolManifest` 和 `resources[]` 是 filename paths 的 typed contract；
  本任务应为该 package kind 建立专用 rewrite/canonicalization 分支。
- `GameLayoutEditorApp.importZip()` 只有在 `importLayoutZip()` 完整成功后才 `store.replace(project)`。失败时
  初始空白项目仍有 width=0 的本地 diagnostic，再追加 external Symbols error，所以用户同时看到两条消息；
  这不是 layout3 art size 的第二个数据缺陷。
- `zip-io.test.ts` 已覆盖普通 Symbols closure round-trip，也覆盖 uppercase dependency key 的导出规范化，
  但后者没有重新导入，fixtures 也没有包含会在 mapping 后改变 canonical relative order 的 punctuation key。
- `app-shell.test.ts` 已固定失败导入不替换 workspace；该原子性合同不需要为本问题改写。

当前代码、规则和三个真实 ZIP 已足以确认根因，不需要审计完整 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- 用户要求的是一个可重复的 Layout → Symbols merge → Layout export → Layout import 工作流；不能要求用户
  手改新导出 ZIP、删除 `+` glyph 或回 SymbolsEditor 重命名合法资源。
- `symbol package resources must be sorted by canonical path.` 是生产导出自相矛盾：同一 app 接受合法
  Symbols dependency，却在全局 filename-key 规范化后写出不再满足 strict package contract 的 nested manifest。
- art-size 文案来自当前未被替换的空白 draft；真实两个 Layout ZIP 均为 `2000 × 2000`。本任务不应通过
  隐藏校验或推导 Spine 尺寸处理它，而应保证导入 transaction 成功并保留 manifest 中的显式尺寸。
- 用户已明确现有 `layout3.zip` 可以删除并重新导出；完成定义只要求修复后的 exporter 不再生成同类非法
  nested package，不为旧输出扩大兼容边界。

### 关键决策

1. **在最终 filename mapping 之后排序**
   - canonical order 由最终导出的 logical filename keys 决定，不能沿用导入前、owner-prefix 前或
     punctuation normalization 前的顺序。
   - helper 先取得完整 source → target mapping，再逐项改写 typed entrypoints/resources、按 rendercore 同等
     `localeCompare(..., "en")` 语义排序，最后调用 `parseSymbolPackageManifest()`。

2. **为 Symbols package manifest 使用 typed rewrite**
   - 只改 `entrypoints.gameConfig`、`entrypoints.symbolManifest` 和 `resources[]`；package `id`、kind/version、
     cell size 和其它业务 string 原样保留。
   - image-string/symbol state/VNI 等 nested owner 继续使用各自现有结构化 rewrite；不通过扫描任意 string
     猜 path，也不从 physical hash path 重建 identity。

3. **只在 production export flatten 修复 canonicalization**
   - `flattenLayoutClosure()` 用 helper 生成新导出的合法 nested manifest，并在写入 workspace 前 strict reparse。
   - `normalizeMappedLayoutFilenameKeys()`、rendercore 和 standalone `importSymbolsZipWithFiles()` 保持不变；
     旧 artifact 继续按 strict contract 失败，避免扩大兼容面。

4. **保持导入原子性和错误分层**
   - 新 exporter 输出必须通过现有、未放宽的 `importLayoutZip()` map validation、nested package closure 和
     resource prepare；`app-shell` 仍只在成功后 replace project。
   - 不为了减少两条 UI 消息而清除合法 project diagnostics；新 ZIP 成功导入后由正常 project replace 自然
     移除空白 draft diagnostic。

5. **用最终 parser 证明输出，不复制第二套排序合同**
   - helper 可以集中实现 comparator，但成功条件仍以 `parseSymbolPackageManifest()` 和
     `collectSceneLayoutPackagePaths()` 为准。
   - 测试必须读取实际导出 ZIP 中 mapped nested manifest 并再调用正式 import，不能只断言数组经过 `.sort()`。

## 5. 职责与合同

- **Game Layout export**：拥有全局 filename-key mapping、known nested manifest typed rewrite、最终 logical key
  canonicalization、mapped workspace 和 production ZIP 自洽性。
- **rendercore Symbols parser**：继续拥有 Symbol package schema、canonical path order、collision、entrypoint、
  exact resources/closure 和 runtime resource 生命周期；本任务不改变其 public API。
- **editorresource/browserartifactio**：继续拥有 assets-map hash/size/path/orphan integrity、bounded ZIP、
  filename-key workspace 和 content-addressed payload；排序修复不得绕过这些边界。
- **Editor store/app shell**：继续拥有 project replace transaction、本地 validation 与 external error 分层；
  import prepare 失败不 commit。
- **失败策略**：非 string resources、非法 package field、重复/alias、mapping collision、missing bytes、map
  integrity、orphan 和 final strict parse 失败均指出 exact error，不保留旧 key fallback。
- **禁止行为**：不对 runtime 自动 sort，不 catch 后忽略 parser 错误，不手改 ZIP JSON，不按 basename/hash 猜
  owner，不从 Spine/atlas 猜 art size，不把用户 artifact 提交为 fixture。

## 6. 文件范围

### 预计新增

```text
tasks/176-gamelayouteditor-symbol-resource-order-roundtrip-<utctime>.md
```

### 预计修改

```text
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/tests/zip-io.test.ts
```

只有在 direct IO test 无法证明 app 成功替换后错误面板清空时，才最小补充：

```text
apps/gamelayouteditor/tests/app-shell.test.ts
```

现有 README、manifest 文档和领域规则已经声明“known manifest typed rewrite、严格 ZIP、确定性导出和
round-trip”正确合同；本任务默认不重复更新。若执行发现文字仍声称旧数组顺序可直接保留，只修改最小相关
段落。

### 原则上不应修改

```text
packages/rendercore/src/symbol/**
packages/rendercore/src/scene-layout/**
packages/editorresource/**
packages/browserartifactio/**
apps/symbolseditor/**
apps/gamelayoutpkgcli/**
apps/game002/**
apps/game003/**
assets/**
docs/agent-rules/**
AGENTS.md
pnpm-lock.yaml
```

若执行需要放宽 rendercore parser、修改 package schema/public API、允许 standalone 乱序 package 或改变
assets-map 格式，属于明显扩大范围，必须先说明新证据并重新规划。

## 7. 实施步骤

1. **确认执行基线并固定失败形状**
   - 重读本计划、根规则和两份领域规则，核对 HEAD/status、`layout2.zip`、`symbols.zip` 和相关 IO symbols
     未漂移；`layout3.zip` 只保留为规划时根因证据。
   - 用 synthetic Symbols fixture 加入在 source 中合法、但经 punctuation/case/prefix 规范化后相对顺序改变的
     resources；先固定旧实现导出成功但重新导入在 nested parser 失败的回归。
   - 测试内构造最小 bytes/manifest，不复制真实美术、hash 或 111 项资源清单。

2. **建立 export-only nested Symbols package typed canonicalizer**
   - 在 `exported-layout-zip.ts` 增加私有 helper，严格读取 package shape，只重写两个 entrypoint 和 resources。
   - source package 已在 `exportLayoutZip()` 收集 dependency 时通过正式 parser；对 target resources 使用完整
     mapping 并按 canonical comparator 重排，再调用 `parseSymbolPackageManifest()` 返回 immutable canonical
     manifest。
   - mapping 缺失、rewrite 后 collision 或 entrypoint/resource 冲突显式失败，不返回部分结果。

3. **接入 export flatten**
   - `flattenLayoutClosure()` 遇到 `kind="symbol-package"` 时使用专用 helper，不再让该 kind 走通用递归 string
     rewrite。
   - 将 canonical manifest stable serialize 到最终 mapped key，随后继续用 workspace SHA-256 materialization；
     不改变其它 nested kind、layout manifest、atlas page 或 payload dedup。
   - 在导出结束前由既有 `validateLayoutAssets()` / package collector 复验 rewritten exact closure。

4. **补 round-trip、strict failure 和原子性测试**
   - 扩充 `zip-io.test.ts`：导出含 `+`/大小写/prefix 的 Symbols dependency，解析 `assets.map.json` 找到 nested
     manifest，断言所有 refs 使用最终 key 且 resources 等于 canonical sorted copy。
   - 对同一导出 bytes 调用 `importLayoutZip()` 和 `manifestToEditorProject()`，断言 package id/binding、完整
     resource closure、art size 和 background placement 保留。
   - 分别构造 rewrite 后 duplicate/path collision、missing payload 和 orphan，确认 export/final validation 失败，
     canonical sort 不能掩盖其它 package 缺陷。
   - 保留既有失败导入不 replace workspace 测试；若补 app-shell 断言，只验证成功 import 后旧 blank-project
     diagnostic 被新 project validation 自然替换，不新增清错特判。

5. **真实 artifact 验收与收尾**
   - 删除或忽略现有 `layout3.zip`，按 `layout2.zip → symbols.zip → export → reimport` 完成真实浏览器往返。
   - 检查导出 ZIP 中 nested manifest、root assets map、art size 和 dependency binding；不覆盖原三个 ZIP，
     新临时输出在验收后不纳入仓库。
   - 运行 L2 定向命令、检查 diff/旧通用分支残留并按模板生成 Task 176 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- fixture 必须让 source resources 先满足正式 comparator，再证明 mapping 后必须重排，避免用一开始就非法的
  package 测试错误兼容。
- 同时检查 manifest 数组、entrypoint/path rewrite、实际 map payload 和正式 reimport；单独 `.sort()` 断言
  不能证明 closure 正确。
- strict failure 至少覆盖 duplicate/path alias、rewrite collision、missing payload 和 orphan；最终排序不得把
  这些失败变成成功。
- round-trip 比较 `adaptation.artSize`、background placement、package id、mode binding 和 logical filename key，
  不比较 content-addressed physical path 作为业务 identity。
- 失败路径断言旧 project/dependency/preview owner 不变，prepared resource 被 destroy；已有测试若已直接证明则
  不重复扩大。

### 验收级别

`L2`。代码改动集中在单 app，但影响正式 production Layout ZIP、nested Symbols package 和重新导入 consumer，
属于正式交付物/直接依赖链边界；不改变 shared schema、rendercore public API、根工具链或 lockfile，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter gamelayouteditor exec vitest run tests/zip-io.test.ts
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor build
pnpm --filter gamelayouteditor format:check
git diff --check
```

若执行补充了 app-shell 断言，则额外定向运行 `tests/app-shell.test.ts`；若定向 ZIP test 暴露同 app 其它 IO
回归，再升级到 gamelayouteditor package 全量 test，不默认运行根级 test/typecheck/build。

### 人工验收

1. 启动 Game Layout Editor 并导入 `/Users/zerro/Downloads/crave/layout2.zip`，确认 project art size 显示
   `2000 × 2000`，BaseGame/FreeGame 和背景均存在。
2. 从 Symbols 工作区导入
   `/Users/zerro/Downloads/crave/symbols.zip`；同 id 时按现有显式替换流程确认，不增加静默覆盖。
3. 导出为新的临时 Layout ZIP，检查 error panel 无 validation error，随后立即重新导入该 ZIP；确认不再出现
   art-size 或 resource-order 错误，Symbols preview 可准备。
4. 解包只读检查新 ZIP：`adaptation.artSize=2000×2000`；nested package resources 使用最终
   `pkg-10-game002-s3-*` key、canonical sorted，`new-image-string-4` glyph 及 manifest closure 全部可达。
5. 用一个 synthetic 缺 payload/乱 path dependency 验证 export/strict validation 失败且仍保留当前 workspace，
   不把 canonical sort 变成 fallback。

### 独立验收建议

`建议`。任务不改 public schema，但影响正式 Layout ZIP 与 nested Symbols exact closure。独立复验重点：

```bash
pnpm --filter gamelayouteditor exec vitest run tests/zip-io.test.ts
pnpm --filter gamelayouteditor typecheck
git diff --check
```

并独立目视一次真实 `layout2.zip → symbols.zip → export → reimport`。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；shell 找不到 Node 时按模板加载 nvm 并 `nvm use 24`。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试。
- 本任务不需要新增依赖或修改 lockfile；ZIP、assets map、stable JSON、parser 和测试工具均已存在。
- `layout2.zip` 和 `symbols.zip` 只用于只读复现和人工验收，不修改、不覆盖、不提交；现有 `layout3.zip` 不在
  验收范围，自动化使用最小 synthetic fixture。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、schema 或生成文件，不运行 Symbols state texture generator。
- Layout ZIP 必须由正式 exporter 生成，禁止手改 nested manifest、`assets.map.json` 或 hash payload。
- 当前 README、`docs/scene-layout-manifest.md` 与领域规则已经声明 deterministic export、known typed rewrite、
  strict closure 和显式 art size；实现对齐后默认不追加一次性 artifact 细节。
- 只有执行发现稳定职责边界确实改变时才更新最小文档/领域规则；不得把 crave 文件名、111 项清单或 hash
  写入根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/176-gamelayouteditor-symbol-resource-order-roundtrip-<utctime>.md
```

报告简要记录最终 typed canonicalization、实际修改文件、定向命令结果、两个真实导入流程、art-size/closure
核验、计划偏差和剩余风险；不收集无关 coverage、完整历史矩阵或整仓统计。

## 12. 风险、假设与待确认

### 风险

- filename mapping 可因 punctuation 清理、大小写归一、Unicode token、suffix allocation 或 same-bytes dedup 改变
  path 相对顺序；测试不能只覆盖 `+` 一个字符，helper 必须对任意最终 mapping 排序。
- 若继续让 symbol package 走通用递归 rewrite，可能误改 package id 等业务 string；必须先识别 exact package
  kind 并只处理 typed fields。
- 现有 `layout3.zip` 仍会被 strict importer 拒绝；这是用户明确接受的非目标，执行和报告不能把它写成已修复。
- sorting 可能掩盖 duplicate 或 alias；final parser 和 exact closure 必须在 commit 前重跑，且 source 除顺序外
  必须可严格证明合法。
- `loadSymbolTextures:false` 可证明 manifest/hash/closure，却不能替代真实浏览器的 PNG/Spine/ImgNumber decode
  和 preview 生命周期，真实 ZIP 仍需人工验收。

### 假设

- `layout2.zip` 和 `symbols.zip` 在执行会话仍位于 `/Users/zerro/Downloads/crave/`；若缺失，自动化继续
  使用等价 synthetic fixture，真实人工项在报告中标记未完成，不复制外部 artifact 到仓库。
- canonical comparator 继续以 rendercore 当前 `localeCompare(..., "en")` 合同为权威；实现不得另用 Unicode
  code-unit、filesystem order 或平台默认 sort 建立第二套顺序。
- 用户看到的 art-size 消息来自 import 失败后仍显示的空白 draft diagnostic；若真实浏览器证明成功 import 后
  仍出现该消息，才把它作为独立 store/UI bug重新定位，而不预先更改 art-size 合同。
