# 159 symbolseditor-vni-bundle-zip-import 任务计划

## 1. 目标与完成定义

### 目标

修复 Symbols Editor 把 VNI export bundle ZIP 当成普通资源 ZIP 展开而导致导入失败的
问题。用户先打开下载目录 `minecart2/minecart2-symbols.zip`，再从同目录的
`矿工低级图标/l1.zip` 导入 VNI 时，编辑器应识别 bundle manifest、选择运行 profile，
只把所选 runtime project 与其 exact asset closure 作为一组资源送入现有 filename-key
review/transaction，而不是导入 `manifest.json` 或 editing profile。

### 完成定义

- [x] `l1.zip` 被识别为 `vni_export_bundle`；其唯一 `purpose=runtime` profile
      `runtime_100` 自动选中，`purpose=editing` 的 `edit_full` 不作为候选，也不进入资源库。
- [x] 所选 runtime 的 `l1.json` 和 `a_asset_image_ms7b1vaz_8.png` 经过严格 manifest、
      project/profile、路径和 exact closure 校验后进入一次普通资源导入 review；VNI project
      内 asset path 在提交前结构化改写为扁平 filename key，`originalName` 等业务字段不变。
- [x] 导入成功后项目配置与已有 binding 保持不变，新 VNI 只入库、不按文件名自动绑定；
      Resource Picker 可将 `l1.json` 作为 VNI project 显式选用。
- [x] 同名冲突继续使用现有 overwrite/noop review；取消、非法 bundle、缺资源、profile
      歧义或 commit/导出复验失败时整批不修改当前 `minecart2` 项目。
- [x] 多个 runtime profile 时必须在 UI 明确选择；零 runtime、选择不存在、editing profile、
      manifest/project profile 不一致都显式失败，不回退首项或猜目录。
- [x] 普通 loose/generic ZIP、Symbols project ZIP、ImgNumber ZIP、Spine 和 standalone VNI
      JSON 的现有导入行为保持不变。
- [ ] 完成 L2 定向自动化、真实下载素材的浏览器验收，并生成任务 159 UTC 中文执行报告。

## 2. 范围

### 包含

- `apps/symbolseditor` 的 ZIP 路由、VNI runtime profile 选择、选定 closure 到
  `EditorImportSourceFile` 的适配、统一 review/commit、反馈与测试。
- `packages/rendercore/src/symbol` 的通用 VNI bundle introspection/selection helper：复用
  vnicore 的正式 parser/validator，验证 profile 与 exact asset closure，并结构化扁平化所选
  runtime project 的 asset refs。
- 用仓库内构造的最小 `l1.zip`-shaped fixture 做自动化；下载目录的两个真实 ZIP 只用于
  计划基线和人工验收，不复制进仓库。

### 不包含

- 修改 VNI `VNI_0.087` schema、播放器、动画效果、时间轴、渲染表现或 vnicore validation。
- 自动把 `l1.json` 绑定到 L1 symbol/state、从 `originalName`/ZIP 名猜 symbol，或替换现有
  `L1-wins.json`。
- 同时迁移 popupeditor、gamelayouteditor 或 anieditorv5viewer 已有的 VNI bundle workflow；
  本任务可复用其合同作为依据，但不做顺手重构。
- 导入 editing profile、同时合并多个 profile、恢复目录型 workspace、静默重命名、
  fallback、placeholder 或第二份 hash/collision 算法。
- 修改正式游戏资源、`minecart2-symbols.zip`、`l1.zip`、Symbols manifest schema、根工具链、
  依赖版本或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-04T06:45:06Z
HEAD: 3c00799201f9b7ab60cb5bf475bce0a5cf08e5e1
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和依据：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
tasks/templates/task-plan.md
tasks/140-symbolseditor-asset-replacement-and-zip-import.md
tasks/140-symbolseditor-asset-replacement-and-zip-import-260730-145451.md
apps/symbolseditor/README.md
```

真实素材基线：

```text
/Users/zerro/Downloads/minecart2/minecart2-symbols.zip
size: 6720285 bytes
SHA-256: 3dd2491612d053877c15d1662d6927010479c562b30c0f45f619c9e3f47882f8
root sentinels: symbols.package.json, assets.map.json

/Users/zerro/Downloads/minecart2/矿工低级图标/l1.zip
size: 48845 bytes
SHA-256: 74d09fad79689f41fa171132d49f2d5e58b8ee11b8d721e58b145226933af49c
entries: 9
bundle: manifest.json, version VNI_0.087
profiles: edit_full/editing, runtime_100/runtime
selected runtime closure: runtime_100/l1.json,
  runtime_100/assets/a_asset_image_ms7b1vaz_8.png
```

当前代码基线与缺口：

- `workspace-app.ts::uploadResources()` 只把 `symbols.package.json` 和
  `image-string.manifest.json` 识别为特殊 ZIP sentinel；`manifest.json` VNI bundle 会落入
  `ingestEditorResourceSources()` 的 generic ZIP 路径。
- `ingestEditorResourceSources()` 会展开整个 ZIP 并把每个 entry 直接转成 basename key；
  因而 `l1.zip` 同时产生两份 `l1.json`、两份同名图片以及 `manifest.json`。
- `createEditorAssetRecord()` 能识别 standalone VNI project JSON，但 bundle manifest 不是
  project，当前首先报出 `manifest.json: JSON 既不是有效 image-string、VNI project，也不是
official Spine 4.3 skeleton`；即使跳过 manifest，两套 profile 的扁平同名 key 仍有歧义。
- `validateSymbolResourceDiscovery()` 只验证已形成的 VNI project record 及其 asset basename，
  不负责选择 export profile；`materializeMappedSymbolPackageContents()` 要求 VNI asset refs
  可结构化解析到 workspace key，因此不能只丢弃目录而保留 `assets/...` 原引用。
- vnicore 已提供 `assertVNIBundleManifest()`、`validateVNIBundleManifest()`、
  `assertVNIProject()`、`validateManifestProjectProfile()` 与
  `rewriteVNIProjectAssetPaths()`；任务不应复制 schema validation。
- popupeditor 和 gamelayouteditor 已确立相同合同：只接受 runtime，唯一 runtime 自动选，
  多 runtime 显式选择，editing 不导入；Symbols Editor 尚未接入该 workflow。

当前代码、规则和真实 ZIP 结构足以确认故障边界，不需要审计完整 Git 历史或修改 VNI
runtime。

## 4. 需求解释与技术决策

### 需求解释

- 用户描述的“VNI 的 ZIP 识别失败”已确认是导入边界缺少 `vni_export_bundle` adapter，
  不是 `VNI_0.087` project parser 或播放器失败。
- `minecart2-symbols.zip` 是先打开的完整 Symbols project；`l1.zip` 是随后合并到当前项目的
  普通资源 dependency，两者不能互换路由，也不能让后者替换整个项目。
- “导入 l1.zip 这一组 ZIP 文件”解释为支持这类相同格式的 VNI export bundle，而不是只
  对文件名 `l1.zip` 写特例；同目录后续 L2–L5 ZIP 应走同一 manifest 驱动逻辑。
- 导入成功只表示资源进入库并可被选择，不表示自动改变 L1 state binding；绑定继续由用户
  在 Resource Picker 中明确完成。

### 关键决策

1. **按根 manifest 识别 VNI export bundle，不按 ZIP 名或目录猜测**
   - Symbols project 与 ImgNumber sentinel 继续优先维持当前专用流程；其余 ZIP 经 metadata
     清理和恰好一层 wrapper normalization 后，只有合法 `manifest.json.type =
"vni_export_bundle"` 才进入 VNI adapter。
   - malformed manifest 显示原始 strict validation error；未知 generic ZIP 继续走现有资源
     ingestion，不把任意 `manifest.json` 静默当 VNI。

2. **只 materialize 一个明确的 runtime profile**
   - 完整验证 manifest 声明、各 project 的 `exportProfile` parity 和引用路径；候选只保留
     `purpose=runtime`。
   - 唯一 runtime 自动选中。多个 runtime 通过受控 select dialog 选择，取消不修改项目；
     不允许自由输入 profile id，也不使用 exports 第一项作为 fallback。
   - `purpose=editing` 可用于 bundle 完整性验证，但其 project/asset bytes 不进入 workspace，
     从源头消除 `l1.json` 与图片的 profile 间 basename 冲突。

3. **在 typed adapter 中结构化扁平化所选 VNI closure**
   - project key 与每个 asset key 由现有 filename-key/path helper 从 exact source path 取得；
     先检查 case/NFC/basename alias，再用正式 `rewriteVNIProjectAssetPaths()` 把 project 内
     asset path 改成 resolved flat key并稳定序列化。
   - `originalName`、asset id、layer id、stage、动画、`exportProfile` 和其它业务字段保持不变；
     `manifest.json`、editing bytes、未引用文件与目录名不成为资源 identity。
   - selected project + assets 作为一个 typed closure 产生 `EditorImportSourceFile[]`，保留
     ZIP/source provenance，之后复用现有 `prepareSymbolResourceImport()` 与一次 review/commit。

4. **VNI bundle 可参与现有普通资源批次，但不改变特殊 package 约束**
   - 一个或多个 VNI bundle 可与 ordinary loose/generic resources 一起 prepare；所有解析、
     profile 选择和 closure 校验成功后才显示统一 filename-key review。
   - Symbols project ZIP 仍必须单独打开；ImgNumber ZIP 继续遵守当前单独安装约束。
   - bundle 内部 collision、缺失、orphan、非法路径先失败；与当前 workspace 或同批其它资源
     的同名冲突进入现有 review，不另写 overwrite/keep-both 算法。

5. **rendercore 只提供格式/introspection 合同，app 保留浏览器事务与 UI**
   - rendercore symbol helper 负责调用 vnicore、选择/验证 runtime closure 和 typed path
     rewrite；不读取 `File`、不弹 dialog、不修改 editor project。
   - Symbols Editor 负责 ZIP 解包上限、profile UI、source provenance、stale request guard 和
     transaction。这样不复制 VNI schema/player，同时不把 UI 责任推入 shared runtime。

## 5. 职责与合同

- **browserartifactio/editorresource**：继续拥有 bounded ZIP/path、metadata 清理、flat key、
  source index、workspace review/hash/collision；本任务消费现有 API，不新增 VNI schema。
- **rendercore symbol**：拥有 Symbols 所需 VNI bundle/project introspection、runtime profile
  validation、exact closure 与结构化 asset ref rewrite；不播放或编辑 bundle manifest。
- **Symbols Editor IO/UI**：拥有特殊 ZIP routing、profile 选择、候选 source 合并、busy/stale
  feedback 和统一 transaction；不复制 parser、hash、allocator 或 VNI runtime。
- **数据合同**：输入是 normalized ZIP entry map；输出是一个选定 runtime profile、一个 VNI
  project filename key 与其 exact asset filename keys。输出不得包含 manifest/editing/orphan。
- **资源生命周期**：读取和选择属于 prepare；所有 sources 完成 discovery/review 后一次
  commit。取消、stale request 或任一 validation/export failure 丢弃 candidate，保留 active
  project；不产生 Object URL 或额外 player owner。
- **失败策略**：未知 manifest type/version、零/多且未选 runtime、profile mismatch、路径逃逸、
  缺失/额外 asset、case/NFC/basename collision、非法 VNI project 均显式失败。
- **禁止行为**：不按 `l1.zip`/文件夹名猜 profile 或 symbol，不导入 editing 作为 fallback，
  不保留嵌套目录 identity，不静默 suffix，不自动绑定，不放宽 VNI validation。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/symbol/vni-export-bundle.ts
packages/rendercore/tests/symbol/vni-export-bundle.test.ts
apps/symbolseditor/src/io/vni-bundle-import.ts
apps/symbolseditor/tests/vni-bundle-import.test.ts
tasks/159-symbolseditor-vni-bundle-zip-import-<utctime>.md
```

若 helper 能在现有 `introspection.ts` 中保持职责清晰，可不新增 rendercore 碎片文件；执行
报告仅在任务完成后创建。

### 预计修改

```text
packages/rendercore/src/symbol/index.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{app-shell,resource-import,zip-io}.test.ts
apps/symbolseditor/README.md
```

### 原则上不应修改

```text
packages/{vnicore,editorresource,browserartifactio}/**
packages/rendercore/src/symbol/{vni-animation,manifest,package,materialize-package}.ts
apps/{popupeditor,gamelayouteditor,anieditorv5viewer,game002,game003}/**
assets/**
pnpm-lock.yaml
AGENTS.md
docs/agent-rules/*.md
```

若实现必须修改 VNI schema/player、Symbols package schema、shared workspace contract、其它
consumer、依赖或 lockfile，属于明显范围扩张，执行前必须说明并重新评估验收级别。

## 7. 实施步骤

1. **确认执行基线并固定真实失败形状**
   - 重核 HEAD/status、规则以及两个下载 ZIP 的 SHA-256、sentinel、profile 和 closure。
   - 用最小 `l1.zip`-shaped fixture 添加失败测试，证明当前路径把 manifest/editing/runtime
     一起摊平，并固定项目导入后再导入 bundle 的无 mutation 失败基线。

2. **实现 rendercore VNI bundle helper**
   - 解析并严格验证 bundle manifest、project/profile parity、runtime profile 列表、路径和
     exact referenced assets。
   - 为所选 runtime 生成无 alias 的 flat project/asset keys，结构化改写 asset refs并输出
     稳定 bytes；保证 editing 和 bundle manifest 不进入结果。

3. **接入 Symbols Editor source coordinator**
   - 在专用 IO adapter 中识别 normalized `vni_export_bundle`，为唯一 runtime 自动选择，按
     selected id 产出带 container/source provenance 的 `EditorImportSourceFile[]`。
   - 将 VNI closure 与其它 ordinary sources 合并后只调用一次现有 prepare/review/commit；
     保留 Symbols project/ImgNumber 的既有路由优先级和单独导入限制。

4. **接入多 runtime 选择与反馈**
   - 增加受控 dialog，显示 profile label/id/assetScale/closure bytes；确认后继续 prepare，取消
     显示取消结果且不改 project。
   - 继续使用 import request revision/stale guard；错误区显示 profile/path/closure 的 exact
     error，不把 bundle parse failure归为 preview failure。

5. **补齐 transaction、Picker 和 ZIP 往返测试**
   - 覆盖唯一 runtime、多 runtime 选择/取消、零 runtime、profile mismatch、缺 asset、orphan、
     path escape、wrapper/Finder metadata、basename alias 和 malformed manifest。
   - 导入后确认只有 selected project/assets 入库、配置不变、Picker 识别 VNI；显式绑定到
     fixture state 后执行 export→reimport，验证 rewritten refs、exact closure 和 `originalName`
     parity。

6. **文档、定向验收与报告**
   - 更新 Symbols Editor README 的 VNI bundle/profile/import workflow；现有领域规则已表达
     runtime candidate 与 filename-key 边界，无新稳定职责时不修改规则。
   - 运行 L2 命令，用真实 `minecart2-symbols.zip` + `l1.zip` 完成人工浏览器验收，检查 diff
     后生成任务 159 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 自动化 ZIP 由 `createDeterministicZip()` 构造，保留 `manifest.json`、editing/runtime 同名
  project/asset 的关键结构；CI 不依赖 `/Users/zerro/Downloads`。
- helper 测试验证正式 vnicore parser/validator 和 exact path resolution，不用只检查
  `schemaVersion` 的假 adapter。
- 事务测试比较导入前后完整 semantic project snapshot；所有 bundle/profile/closure 错误和
  cancel 都必须证明 revision/assets/bindings 不变。
- export/reimport 必须经过正式 Symbols exporter/package resource，不能以 Picker 出现一项
  冒充 production closure 正确。
- 不为本任务重复测试 VNI 动画像素效果；真实视觉只验证选择后的 VNI 能由现有 preview
  初始化和播放。

### 验收级别

`L2`。任务增加 rendercore symbol 的 VNI bundle introspection public helper，Symbols Editor
是直接 consumer，并影响正式 Symbols ZIP 中 nested VNI closure 的生成前验证；范围可由这
两个 package 的定向测试和 build 界定。不修改依赖、lockfile、根工具链或 release，因此不
升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/introspection.test.ts tests/symbol/vni-export-bundle.test.ts tests/symbol/materialize-package.test.ts
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor exec vitest run tests/vni-bundle-import.test.ts tests/resource-import.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
pnpm --filter symbolseditor build
git diff --check
```

若最终未新增 `vni-export-bundle.test.ts` 而把测试并入 `introspection.test.ts`，第二条命令同步
移除不存在的路径；不追加根级 typecheck/lint/test/build。

### 人工验收

1. Node 24 下启动 `pnpm --filter symbolseditor dev`，先导入
   `/Users/zerro/Downloads/minecart2/minecart2-symbols.zip` 并确认项目加载完成。
2. 再导入 `/Users/zerro/Downloads/minecart2/矿工低级图标/l1.zip`；确认不再出现
   `manifest.json` unknown JSON 错误，自动选择 `runtime_100`，review/结果只列
   `l1.json` 与 `a_asset_image_ms7b1vaz_8.png`，没有 `edit_full` 或 bundle manifest。
3. 在 Resource Picker 中将 `l1.json` 显式绑定到一个测试 state，确认 VNI preview/replay
   正常；导出再重导 ZIP，确认 binding、`originalName` 和 exact closure 保持。
4. 取消一次导入并用一个同目录同格式 ZIP 重试，确认取消不修改项目、后续导入不受 stale
   状态影响；浏览器 console 无未处理异常。

### 独立验收建议

`建议`。本任务涉及 shared public helper、正式 ZIP、nested VNI reference rewrite 和原子资源
事务。独立验收重点复查：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/vni-export-bundle.test.ts tests/symbol/materialize-package.test.ts
pnpm --filter symbolseditor exec vitest run tests/vni-bundle-import.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
git diff --check
```

并用上述两个真实下载 ZIP 复验一次，不重复全量仓库测试。

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 pnpm，不切换 npm/yarn。
- 依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`；仅在实际下载失败后设置仓库模板
  约定的代理并重试原命令。
- 复用 rendercore 已有 vnicore/browserartifactio/editorresource 依赖，不新增 dependency，
  不修改 `pnpm-lock.yaml`。
- 下载目录素材只读使用；不重打包、不覆盖，也不把绝对路径写入 production code/test。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、manifest schema 或业务生成物，不需要生成器/parity checker。
- `apps/symbolseditor/README.md` 记录 VNI export bundle 的 runtime-only、profile 选择、flat
  key、no-auto-bind 和 failure 行为。
- `docs/agent-rules/editor-artifacts.md` 已规定 filename-key、VNI refs 结构化改写、strict
  failure 和 Popup runtime profile 合同；除非执行中形成新的跨 editor 稳定职责，否则不改。
- 不把 `l1.zip` 资源清单、hash 或本任务证据追加到根 `AGENTS.md` 或领域规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/159-symbolseditor-vni-bundle-zip-import-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现、实际修改文件、计划偏差、
自动化命令结果、两个真实 ZIP 的浏览器验收结果、剩余风险和未完成人工项；不收集无关
coverage、完整历史矩阵、全仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- VNI bundle 的 editing/runtime 常包含相同 basename；若在 profile 选择前进入 flat workspace，
  会重现 collision 或错误覆盖，必须保持“先选 profile、再 materialize closure”的顺序。
- 仅让 `l1.zip` 停止报 manifest 错误但不改写 project asset refs，会在绑定后的导出/preview
  阶段延迟失败，因此 ZIP round-trip 是必要验收，不以入库成功收尾。
- 多个 VNI bundle 或同批 loose files 可能产生跨 candidate filename collision；必须交给统一
  review 或以 alias 明确失败，不能由 adapter 自行 suffix。
- 真实 `minecart2-symbols.zip` 较大，浏览器读取期间需要维持 busy/stale guard；慢导入晚到
  不得覆盖用户已经打开的新项目。

### 假设

- 用户希望导入的是 `l1.zip` 的运行发布包 `runtime_100`，而不是完整 editing backup；这与
  manifest 的 `purpose`、现有 Popup/Layout workflow 和 production runtime 边界一致。
- 同目录 L2–L5 ZIP 若遵循相同 `vni_export_bundle` 合同，应自动受益；不为它们硬编码名称。
- 用户会在资源入库后自行选择目标 symbol/state，本任务不改变现有 binding。

### 待确认

无。需求、现有合同、代码路径和真实 ZIP 结构已足以制定与执行计划。
