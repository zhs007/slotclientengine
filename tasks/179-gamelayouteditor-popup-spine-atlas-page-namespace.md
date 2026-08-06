# 179 gamelayouteditor-popup-spine-atlas-page-namespace 任务计划

## 1. 目标与完成定义

### 目标

修复 Game Layout Editor 导入 mapped Popup Editor ZIP 后对 Spine atlas page 逻辑名的错误命名空间改写。用
`/Users/zerro/Downloads/crave/layout3.zip` 打开布局、导入同目录
`fg-popup.zip` 并在 `BG -> FG` 转场中选择 Popup 时，多页 Spine Popup 应能通过预览的
strict package prepare，不再出现 `Spine atlas page contract changed` 报错。

### 完成定义

- [ ] Popup dependency namespace 转换只改写 skeleton/atlas/texture payload 的 filename key 及 manifest
      path value，不改写 atlas 文本中的逻辑 page name，也不改写 Spine `textures` 的 page key。
- [ ] `fg-popup.zip` 的 `BG.png` 至 `BG_8.png` 八个 atlas page 在导入后仍与 texture
      page key exact match；对应图片 bytes 则使用 `pkg-2-fg-*` 的独立 filename key。
- [ ] Popup 导入审查对比其 Spine atlas/PNG 原始 logical filename 与 Layout-owned Spine
      assets；同名但完整 SHA-256 不一致时列出冲突，用户可取消导入或显式继续按
      独立 Popup package 导入。
- [ ] 打开 `layout3.zip`、导入 `fg-popup.zip`、为 `BG -> FG` 选择 `fg` 后，组合预览
      prepare 成功，Popup 仍按 start→loop→end 合同完成后再继续原转场。
- [ ] 单页与多页 Spine Popup、award-celebration Popup、已有 layout 重导入/导出、严格缺资源与
      atlas/texture page mismatch 失败行为保持不变。
- [ ] 不复制两个大型 ZIP 到仓库；自动化回归使用最小合成 fixture，真实 ZIP 用于人工验收。

## 2. 范围

### 包含

- `packages/rendercore/popup` 的 Popup package flatten/filename-key namespace 转换合同。
- `apps/gamelayouteditor` 对 Popup Editor mapped ZIP 的导入回归，以及导入后被 Scene Layout preview
  实际消费的组合路径。
- Popup Spine atlas/PNG 与 Layout-owned Spine assets 的跨 owner 同名不同 hash 导入审查。
- 多页 Spine atlas 中“逻辑 page name”与“物理 filename key”的独立回归测试。
- 使用用户提供的 `layout3.zip` / `fg-popup.zip` 执行浏览器人工复验。

### 不包含

- 不改动 Popup Editor 的 manifest schema、导出格式或 Spine 动画编排。
- 不改动 Scene Layout transition schema、`preludePopup` 时序、BG/FG 业务命名或转场效果。
- 不放宽 `validateOfficialSpineResource()` 的 exact page closure，不增加 alias、路径猜测、首项
  fallback 或大小写容错。
- 不把 `pkg-2-fg-*` 当作 atlas page 的新格式，不为用户 ZIP 生成一次性修补版。
- 不从 Popup dependency 自动覆盖 Layout asset，不自动改名/keep-both，不根据同名或 hash
  猜测、生成或替换 `BG.json`。
- 不自动判断现有 `BG.json` 是否支持 Popup 中的 atlas revision；用户取消后是否先手动替换 Layout Spine 整组，由用户决定。
- 不引入新依赖，不修改 lockfile，不扩展到其它 editor 或不相关 RenderCore runtime。

## 3. 制定计划时的基线

```text
UTC: 2026-08-06T09:18:01Z
HEAD: d89fcf33d4e1e07debfe187d0479c7ddb1f13ed3
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取的规则与模板：

- 根 `AGENTS.md`
- `docs/agent-rules/scene-layout.md`
- `docs/agent-rules/editor-artifacts.md`
- `tasks/templates/task-plan.md`

当前代码与数据流结论：

- `apps/gamelayouteditor/src/io/imported-popup-package.ts::importPopupPackageZip()` 先对原始 Popup ZIP 执行
  map/hash/size/orphan 检查、exact closure 检查和 `createPopupPackageResource()` 严格 prepare；之后才调用
  `flattenPopupPackageFiles()` 与 `namespaceMappedPopupPackageFiles()`。因此原包可以验证成功，
  但转换后的数据仍可能被转换本身破坏。
- `packages/rendercore/src/popup/package-resource.ts::namespaceMappedPopupPackageFiles()` 给所有实体
  filename key 加 `packageKeyPrefix()`，`rewritePopupResourceSpec()` 正确保留 `textures` 的 page key
  并只改写 path value；但同一流程又调用 `rewritePopupAtlas()`，把 atlas page 文本也改为
  prefixed filename key，导致两侧合同分裂。
- `rewritePopupAtlas()` 也被 `flattenPopupPackageFiles()` 使用。预期修复需要同时保护 legacy
  structured path flatten：atlas page 是结构化 logical name，不应因 payload 物理路径扁平化而变化。
- `apps/gamelayouteditor/src/model/game-mode-commands.ts::setGameModeTransitionPreludePopup()` 只设置 typed
  Popup id。Store revision 触发 `apps/gamelayouteditor/src/ui/app-shell.ts` 重建组合预览，随后
  `apps/gamelayouteditor/src/preview/layout-preview.ts::LayoutPreview.setLayout()` 调用 `validateLayoutAssets()`。
  转换后 Popup 在此处被 Scene Layout package resource 真正 prepare，所以错误表现为“选择转场
  Popup 时报错”，而不是“导入 ZIP 时报错”。
- `packages/rendercore/src/spine/runtime-player.ts::validateOfficialSpineResource()` 通过
  `assertExactTexturePageClosure()` 比较 atlas page 与 `textureUrls` key，当前报错是该 strict 合同正确
  捕获了上游转换错误，不应修改此 validator。
- `packages/rendercore/tests/popup/package-resource.test.ts` 已覆盖 Popup exact closure、各 resource prepare/
  destroy、legacy flatten 和 mapped resolve，但没有直接覆盖 `namespaceMappedPopupPackageFiles()`，也没有
  覆盖“多页 Spine + 物理 key 加前缀”后仍可被 production parser 准备的合同。
- `apps/gamelayouteditor/tests/popup-package.test.ts` 已覆盖 mapped Popup 导入与 binding round-trip，
  现有 fixture 主要是 award-celebration/image-string，没有捕获多页 Spine namespace 后的 page 漂移。
- Game Layout Editor 的 loose Spine 上传当前不是 shared `overwrite | keep-both` 逐文件选择：同
  JSON root id 走整个 resource replacement，不同 root 却复用同名 atlas/page 且 bytes 不同时
  报 path collision；不会静默自动改名。资源详情中的显式“替换”才是更新
  `BG.json + atlas + textures` 的正式入口。
- Popup 的 `pkg-<id-length>-<id>-*` 在 dependency id 之间提供稳定隔离，同 id 重导入
  是整包替换并保留 binding/placement/order。这种物理隔离会让 Popup 与 Layout 的
  `BG.atlas/BG*.png` 可以不同 bytes 并存，因而需要在 namespace 前向用户显示跨 owner
  同名不同 hash，不能依赖 Map key collision 偶然拦截。

用户复现资源基线：

```text
/Users/zerro/Downloads/crave/layout3.zip
size: 39393777 bytes
sha256: 0422914cf7651aba2288189778920ae33c602f6fd12114e2df2224acb9ee5aa5
entries: 167

/Users/zerro/Downloads/crave/fg-popup.zip
size: 31680684 bytes
sha256: 5a58b6859070613a68874df95199e5187ab4a9593909c3cf22545a2c308bd42b
entries: 12
```

- `fg-popup.zip/popup.manifest.json` 的 id/type 为 `fg` / `spine`，Spine root 为 `FG.json`，atlas 为
  `BG.atlas`。Manifest `textures` 键与 atlas 内 page 都是 `BG.png`, `BG_2.png`, ...,
  `BG_8.png`；`assets.map.json` 的 value 再路由到 content-addressed payload。
- 用户报错显示转换后 atlas page 变为 `pkg-2-fg-BG*.png`，而 texture page key 仍为
  `BG*.png`，与上述代码路径完全对应。
- `layout3.zip` 已有 BaseGame→FreeGame 和 FreeGame→BaseGame 两条 Spine transition；用户所述
  `BG -> FG` 对应其 BaseGame→FreeGame 有向边。

## 4. 需求解释与技术决策

### 需求解释

- Popup Editor ZIP 中 atlas page name 是 Spine 资源合同的 logical identity；`assets.map.json` 和
  Game Layout Editor 的 `pkg-<id-length>-<id>-*` 只是 payload filename key 路由。两者不应合并。
- 导入操作必须继续保持原子性：原始包或转换后包非法时不得把部分 dependency bytes
  或 binding 提交到 project。
- 同名 atlas/PNG 但 hash 不同是导入审查信号，不是可自动推断的 owner identity 或
  覆盖授权；系统展示事实后由用户选择取消或继续。
- 本任务修复一个通用 Popup package transformation bug，不对 `fg`、`BG`、八页数量或报错
  中的具体前缀做业务特判。

### 关键决策

1. **保留 atlas logical page，只改写物理 key/path value**
   - `rewritePopupResourceSpec()` 继续把 Spine skeleton、atlas 和 texture path value 映射到新 filename
     key，`textures` 的 object key 原样保留。
   - atlas bytes 中的 page line 也原样保留；namespace/flatten 不应将其替换为 payload key。
   - 这与 `editor-artifacts.md` 的“atlas page 是 logical page name，texture map value 才是
     filename key”一致。
2. **修转换器，不改 strict runtime**
   - 保留 `assertExactTexturePageClosure()` 的 exact comparison，它仍要拒绝真实的缺 page、多 page、
     重复 page 和名称不等。
   - 不允许 runtime 在 `pkg-*` 与原 page 间建立 alias；这会掩盖损坏的交付物并扩大
     consumer 复杂度。
3. **用 shared contract test 与 editor consumer test 双层保护**
   - RenderCore 单测直接锁定 flatten/namespace 的输出不变式，并让转换后包再通过现有
     production Popup/Spine prepare，防止只比 JSON snapshot 却漏掉 runtime contract。
   - Game Layout Editor 测试覆盖 Popup Editor mapped ZIP→`importPopupPackageZip()`→namespaced files
     的消费者边界，并验证转场引用后的 preview manifest/package 可严格准备。
4. **不提交用户的大型交付物**
   - 自动测试构造最小的两页或多页 Spine fixture，要求加前缀前后的变化可观察；八页真实
     ZIP 仅用于最终浏览器验收。
5. **跨 owner 同名不同 hash 进入用户导入审查**
   - 用 Popup 未 namespace 的 Spine atlas/texture logical filename 与 Layout-owned Spine asset key
     做现有 filename collision token 匹配，使用 shared 完整 SHA-256 结果比较 bytes；不自建 hash
     算法，不对 skeleton JSON 做同源猜测。
   - 审查展示 Popup id、Layout Spine root、logical filename 和 old/new hash；默认建议取消，
     但提供“取消导入”与“继续独立导入”两个显式决定。
   - 取消时 project/preview 不变；继续时不覆盖或改名 Layout assets，Popup 仍通过
     package namespace 自包含。不运行 `BG.json` 对候选 atlas 的自动兼容性判断。

## 5. 职责与合同

- **RenderCore Popup package materializer**：拥有 Popup owner schema 的结构化引用改写，区分 Spine
  atlas logical page identity 与 workspace filename key；输出必须仍是 exact self-contained closure。
- **Game Layout Editor importer**：先验证 Popup Editor ZIP，再把其作为独立 dependency namespace 化并
  生成跨 owner 同名/hash 审查，根据用户决定取消或原子提交。审查元数据只在当前
  transaction 派生，不进入 layout manifest/ZIP。
- **Scene Layout preview/runtime**：继续消费 manifest page key→filename key value 和 exact bytes，不为
  editor 转换错误增加隐式容错。
- **数据不变式**：对每个 Spine resource，atlas 的有序唯一 page 集合必须与
  `Object.keys(resource.textures)` exact match；每个 texture value 必须指向存在的独立 payload key。
- **资源生命周期**：修复不改变当前 prepare/destroy 所有权。导入验证临时创建的 Popup
  resource 必须继续 destroy；preview rebuild 失败不能半提交新 runtime。
- **失败策略**：对真实 atlas/texture mismatch、缺 bytes、非法 map、orphan、未知 schema 仍尽早
  显式失败；本任务不改报错为 warning 或静默降级。

## 6. 文件范围

### 预计新增

```text
无生产文件。
tasks/179-gamelayouteditor-popup-spine-atlas-page-namespace-<utctime>.md
```

执行报告只在实施和验收完成后新增。

### 预计修改

```text
packages/rendercore/src/popup/package-resource.ts
packages/rendercore/tests/popup/package-resource.test.ts
apps/gamelayouteditor/tests/popup-package.test.ts
apps/gamelayouteditor/src/io/imported-popup-package.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/tests/app-shell.test.ts
apps/gamelayouteditor/README.md
docs/agent-rules/editor-artifacts.md
```

如 app-level 组合测试需复用现有 ZIP/Spine helper，可在不复制生产逻辑的前提下最小修改：

```text
apps/gamelayouteditor/tests/popup-fixture.ts
apps/gamelayouteditor/tests/zip-io.test.ts
```

### 原则上不应修改

```text
apps/popupeditor/**
packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/src/scene-layout/**
packages/editorresource/**
packages/browserartifactio/**
apps/gamelayouteditor/src/preview/**
pnpm-lock.yaml
AGENTS.md
docs/agent-rules/scene-layout.md
```

若实施时发现必须改动 public schema、strict Spine validator、Scene Layout runtime 或 Popup Editor exporter，
说明当前根因判断不足，应先停止并重新规划。

## 7. 实施步骤

1. **确认执行基线**
   - 重新核对 HEAD、工作区、用户 ZIP 的 SHA-256 与两份领域规则。
   - 用定向 fixture 或现有 importer 最小化复现 namespace 前后的两组 page，记录 atlas pages
     为 `pkg-2-fg-BG*.png`、texture keys 为 `BG*.png`，确认仍是本计划根因。
2. **修正 Popup package 转换合同**
   - 调整 `flattenPopupPackageFiles()` / `namespaceMappedPopupPackageFiles()` 的 Spine atlas 处理：
     payload map 和 manifest path value 按现有 allocator 改写，atlas logical page line 保持原值。
   - 移除或收窄错误的 `rewritePopupAtlas()`，不保留一个无调用或会把 page 当 path 的
     helper。
   - 保持转换后 root/resource/layer reference、exact closure、重复 key 检查和输入 bytes 不变性。
3. **增加 RenderCore 合同回归**
   - 在 `package-resource.test.ts` 构造最小多页 Spine Popup，page name 与实体 filename key 明确
     不同，直接调用 namespace 转换。
   - 断言 root/skeleton/atlas/texture value 均被加前缀，但 atlas page 文本和 `textures` key
     完全保持原值。
   - 将转换后 manifest/files 交给现有 production Popup resource prepare，证明不仅是 snapshot
     相等，而是 Spine exact page 合同真正可消费；同时保留一个真实 mismatch 仍失败的
     negative case。
   - 为 legacy structured flatten 增加同一 logical-page 不变式，防止修复只覆盖 mapped
     namespace 分支。
4. **增加 Game Layout Editor consumer 回归**
   - 在 `popup-package.test.ts` 使用 mapped Popup Editor 形式的多页 Spine fixture 调用
     `importPopupPackageZip()`，验证返回的 `rootKey` / files 已 namespace，但 page identity 未变。
   - 把 dependency 接入最小双 mode project 的 BaseGame→FreeGame `preludePopup`，通过预览
     manifest/package 的现有严格准备路径验证组合 consumer；不在测试中重写 runtime validator。
   - 验证失败用例不修改 project，既有 same-id replace、placement/order 和未引用 dependency
     不导出行为不变。
5. **将跨 owner 同名不同 hash 加入导入审查**
   - 从已验证、未 namespace 的 Popup manifest/files 派生 Spine atlas family 审查元数据；不从
     `pkg-*` key 反推原名，不持久化第二份资源表。
   - 在 Popup namespace/merge 之前对比 Layout-owned Spine atlas/PNG 的完整 SHA-256，将
     同名不同 hash 列入 review；相同 bytes 不产生冲突项。
   - UI 提供取消/继续两条显式路径。取消时不 commit；继续时原子提交 namespaced
     dependency，不改变 Layout resource/asset/binding。
   - 测试覆盖冲突清单、取消不变、继续隔离导入、同 hash 无警告与 same-id Popup
     replacement，并将该稳定 review 语义写入最小领域规则。
6. **定向验收与真实资源复验**
   - 执行 RenderCore 与 Game Layout Editor 的定向 typecheck/test 及 `git diff --check`。
   - 启动 Game Layout Editor，用指定的两个 ZIP 执行人工验收，检查导入后选择 Popup、
     Popup start/loop/end、转场继续与无资源泄漏/重复 player 异常。
   - 检查最终 diff，最小同步 Game Layout Editor README 与导入审查领域规则，生成简洁 UTC
     执行报告。

## 8. 测试与验收

### 测试原则

- 正向覆盖 mapped namespace 和 legacy flatten 两个转换入口。
- 使用至少两个 page，并让 payload key 确实发生前缀变化；单页且名称未变的
  fixture 不足以证明本合同。
- 至少一条测试使用 production `createPopupPackageResource*()` /
  `validateOfficialSpineResource()` 终态验证转换结果，而不是只断言文本。
- negative case 继续证明真实 atlas/texture mismatch 被 exact validator 拒绝，防止通过放宽
  runtime 来让测试变绿。
- 不为错误的旧输出 `pkg-*-<page>` 建立 golden fixture 或兼容分支。

### 验收级别

`L2`。生产修改位于 `@slotclientengine/rendercore/popup` 导出的 package transformation API，
`gamelayouteditor` 是直接 consumer；需同时编译共享包和直接 app，并验证真实 ZIP。不涉及根工具链、
lockfile 或无法界定的跨包重构，不升级到 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/package-resource.test.ts --coverage.enabled=false
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor exec vitest run tests/popup-package.test.ts tests/app-shell.test.ts tests/zip-io.test.ts --coverage.enabled=false
git diff --check
```

`gamelayouteditor typecheck` 的 `prepare:deps` 会构建 RenderCore，同时证明 app 实际消费新 dist；不再
重复增加一条 RenderCore build。若定向测试暴露直接关联的其它 test file，先最小化失败再说明
新增命令，不直接扩到整仓。

### 人工验收

1. 在浏览器打开 Game Layout Editor，导入
   `/Users/zerro/Downloads/crave/layout3.zip`，确认 BaseGame/FreeGame 及既有双向 transition 正常。
2. 首次导入 `/Users/zerro/Downloads/crave/fg-popup.zip`，确认 review 列出 Layout `BG`
   Spine 中与 Popup 同名但 hash 不同的 atlas/PNG；选择取消，项目与预览保持不变。
3. 重新导入并显式选择继续，确认 Layout assets 未被覆盖/改名，`fg` 使用
   `pkg-2-fg-*` 独立提交。在 BaseGame→FreeGame（UI 的 `BG -> FG`）选择 `fg`，
   strict diagnostics 及组合 preview 均 ready。
4. 在预览中触发 BG→FG，确认 source mode 在 Popup start→loop→end 完整结束前不切换，
   随后继续原 Spine transition 并进入 FG；再次选择/取消 Popup 不产生重复 player、半提交
   预览或持续报错。
5. 导出 layout ZIP 并重导入，确认 `fg` binding、placement/order、atlas page name 和八张
   texture mapping 保持，重导入预览仍可播放。

### 独立验收建议

**建议**。本任务修改共享 Popup package transformation public surface，并涉及 ZIP exact closure 与
resource prepare/destroy，但不涉及 credential、安全或服务器数据边界。独立复验重点是：

- namespace 后 atlas pages 与 texture keys exact match，而 texture values 已与其它 package 隔离；
- 上述 RenderCore 定向测试与 Game Layout Editor 定向测试；
- 用两个真实 ZIP 执行 BG→FG 预览和 layout export/reimport。

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24，pnpm 使用 workspace 版本。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 本任务不需要新依赖或 lockfile 变更。两个外部 ZIP 作为本地验收输入，不安装、
  不改写、不纳入版本控制。

## 10. 生成物、文档与规则

- 本任务不涉及 YAML 或生成文件。
- `packages/rendercore/README.md` 已覆盖 strict Popup package 与 exact closure，无需修改。新增的
  跨 owner 同名/hash 用户审查是 Game Layout Editor 公开 workflow，需最小同步
  `apps/gamelayouteditor/README.md` 与 `docs/agent-rules/editor-artifacts.md`。
- 只有实施发现稳定职责边界必须改变时才停止并重新规划，不将一次性 ZIP 资源清单或
  page 列表写入 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/179-gamelayouteditor-popup-spine-atlas-page-namespace-<utctime>.md
```

UTC 使用：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终转换合同、实际修改文件、自动化命令结果、两个真实 ZIP 的人工验收结果、
计划偏差和剩余风险。

## 12. 风险、假设与待确认

### 风险

- `rewritePopupAtlas()` 同时服务 legacy flatten 和 mapped namespace；若只修正当前复现分支，可能留下
  structured legacy Popup 的同类 page 漂移，因此必须双分支覆盖。
- 真实 `fg-popup.zip` 有 8 张大图，自动测试若直接纳入会增大仓库和测试内存/时间；
  必须用最小 fixture 保护结构合同，用真实资源补充人工 Pixi/Spine 验收。
- 修复后会改变新导入 dependency 中 atlas payload bytes（不再写入错误前缀）；已被错误版本导出的
  layout ZIP 若已固化损坏 atlas，仍应被 strict importer 拒绝，不推断原 page 做静默修复。
- 同名不能证明美术同源，因此 review 不得自动覆盖或强制阻断；继续导入可能保留
  两个不同美术版本，界面必须把该后果说清并由用户显式承担选择。

### 假设

- 以用户指定的 `/Users/zerro/Downloads/crave/fg-popup.zip` 为验收包，不使用
  `/Users/zerro/Downloads/crave/整合/fg-popup.zip` 替代。
- UI 中用户所述 `BG -> FG` 对应 layout manifest 的 BaseGame→FreeGame exact edge；本任务不重命名
  mode 或修改其 transition resource。
- Popup 的 `BG*.png` atlas page logical name 必须保留原始大小写；Game Layout Editor 的
  filename-key 命名空间隔离不要求 page name 小写化或加 package prefix。

### 待确认

- 无阻塞项。如执行时指定 ZIP 的 SHA-256 发生变化，先重新检查 manifest/map/atlas 基线，
  再判断本计划是否仍适用。
