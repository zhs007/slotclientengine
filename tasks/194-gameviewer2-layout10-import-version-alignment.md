# 194 gameviewer2-layout10-import-version-alignment 任务计划

## 1. 目标与完成定义

### 目标

定位 `apps/gameviewer2` 导入
`/Users/zerro/Downloads/minecart2/layout10.zip` 时出现“版本不对”提示的真实边界，区分：

1. 已部署 Game Viewer 2 落后于当前仓库，需要用当前代码重新构建并发布；
2. 当前 HEAD 也不能消费该 ZIP，需要修正精确的 producer/runtime 合同；
3. 当前 HEAD 与部署代码都支持，但线上仍在提供旧 HTML/JS 混合版本或浏览器缓存。

最终让指定 ZIP 在与当前合同一致的 Game Viewer 2 中成功导入并生成本地流程草稿；若 ZIP 本身违反
strict contract，则给出第一处权威错误和正确的重新导出路径，不通过改版本号或兼容 fallback 掩盖问题。

### 完成定义

- [ ] 保存真实失败原文、触发步骤、页面 URL、已部署构建标识/commit（能取得时）、浏览器版本和缓存条件；
      “版本不对”必须解析到具体 schema/resource 与实际/期望版本。
- [ ] 在当前 HEAD、Node 24 环境中直接调用页面相同的
      `inspectSceneOtherSceneFlowPackage()` 对原始 `layout10.zip` 复现，不以手工浏览 JSON 代替端到端 parser。
- [ ] 若当前 HEAD 可导入，则不修改 production parser/schema；验证 `gameviewer2` production build，并由发布方
      用同一 commit 原子替换 HTML/JS/assets，随后在无缓存会话复验原始 ZIP。
- [ ] 若当前 HEAD 失败，则确认错误属于 ZIP producer 输出非法、当前 runtime 缺少已批准的显式版本能力，
      或错误信息丢失上下文；只修改拥有该合同的最小模块并补直接回归测试。
- [ ] 导入成功后页面显示 `new-layout`、正确的 initial mode、main reel geometry、`standard` render mode 和
      `minecart2` binding，并可建立默认 snapshot/operation 草稿；不要求在本任务中编写业务流程内容。
- [ ] 坏版本、坏 hash/size/path、未知字段、缺资源、错误 Spine/VNI 能力仍精确失败；不得接受任意未来版本。
- [ ] 原始 ZIP 保持 byte-for-byte 不变；不手改 `layout.manifest.json`、nested manifest、assets map 或物理资源。
- [ ] 完成定向自动化、真实 ZIP 浏览器验收和 UTC 中文执行报告；实际发布若缺少 URL/权限，明确交接而不宣称上线。

## 2. 范围

### 包含

- `apps/gameviewer2` 的 Layout ZIP import、错误呈现和 production build 验证。
- `packages/rendercore/scene-layout` 从 production ZIP 到 active Symbols package summary 的真实解析链。
- 仅当第一处失败证据指向 nested owner 时，检查对应的 Symbol、Popup、ImageString、VNI 或 Spine strict parser。
- 对已部署站点的 build identity、静态资源一致性和缓存复验；仓库内没有发布配置时只形成可执行发布交接。
- 外部只读 fixture、最小 synthetic 回归 fixture、相关 README（仅在行为/workflow 改变时）和任务报告。

### 不包含

- 不修改或重新打包 `/Users/zerro/Downloads/minecart2/layout10.zip`，不把 25 MB ZIP 提交到仓库。
- 不硬编码 `layout10`、`minecart2`、具体 hash、logical key 或 symbol code 到 shared runtime/app。
- 不通过接受未知 version、忽略 unknown key、首项 fallback、旧 parser alias 或跳过 map/closure 校验解决导入。
- 不修改 Game Viewer 2 外层 `gameviewer2-project@4`、`scene-other-scene-flow@2`、
  `slot-operation-authoring-project@2` 或 launch v4；本问题发生在 Layout ZIP 导入，不是项目 JSON 导入。
- 不改 Game Layout Editor、Symbols Editor、Popup Editor 的 authoring workflow，除非当前 HEAD 的第一处失败
  证明它们生成了违反已声明 schema 的正式 ZIP；即使如此也先报告 owner/range 扩大原因。
- 不改游戏 app、服务器流程、轮带、operation 业务语义、资源美术、workspace 依赖或 lockfile。
- 不猜测线上 URL、托管平台、credential 或 cache policy；未提供发布权限时不执行外部发布。

## 3. 制定计划时的基线

```text
UTC: 2026-08-11T06:39:31Z
HEAD: 152c59e2f023a5b055eda98066ccfe0b8d87c2e7
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{gameviewer2-local-flow,shared-game-runtime,scene-layout}.md
tasks/{150-gameviewer2-local-scene-flow-preview,178-slot-operation-effect-composition-refactor}.md
apps/gameviewer2/{README.md,package.json,src/model/{project,operation-project}.ts,
  src/runtime/{launch-channel,entry}.ts,src/ui/app-shell.ts,tests/**}
packages/rendercore/src/scene-layout/{local-scene-authoring,production-zip,manifest,package-resource}.ts
packages/rendercore/src/{symbol,popup,image-string,spine}/**
packages/vnicore/src/core/validation.ts
packages/rendercore/tests/scene-layout/{production-zip,local-scene-readiness}.test.ts
/Users/zerro/Downloads/minecart2/layout10.zip（只读）
```

范围内没有补充 `AGENTS.md`，仓库内也没有 `.openai/hosting.json` 或已确认的 Game Viewer 2 发布配置。

真实输入基线：

```text
path: /Users/zerro/Downloads/minecart2/layout10.zip
bytes: 25527802
sha256: 5ab872fb5ea12404c6aba7b550023dbc530d6adf367a31023db803ca8965335a
ZIP entries: 189
assets.map logical files: 207（物理 payload 可因 content dedupe 少于 logical key）
```

当前源码与静态输入结论：

- `app-shell.ts` 的 Layout input 直接把 bytes 交给
  `inspectSceneOtherSceneFlowPackage()`；异常经 `perform()` 原样显示。此路径不调用
  `parseGameViewer2ProjectFile()`，所以外层项目 v4 和 launch v4 不是本次 Layout 导入错误来源。
- `inspectSceneOtherSceneFlowPackage()` 调用
  `loadSceneLayoutPackageFromZipBytes({loadSymbolTextures:false})`，依次执行 bounded canonical unzip、
  `layout.manifest.json` strict parse、`assets.map.json` integrity、typed dependency closure、active Symbols package
  创建与 summary 提取，最后始终 destroy 临时 package resource。
- `layout10.zip` 根为 canonical `layout.manifest.json` + `assets.map.json`，声明
  `scene-layout@1`、`editor-assets@1`、initial mode `BaseGame`、`minecart2` Symbols binding、
  `standard` render mode 和 `award-celebration` Popup。
- nested 显式版本为 `symbol-package@1`、symbol state texture manifest v1、Popup v1、两个 ImageString v1；
  Spine skeleton 都是 `4.3.23`，VNI project/bundle 是 `VNI_0.087`。当前 HEAD 的对应 parser 明确接受这些值。
- 因此规划时没有证据支持“手改 ZIP 版本”或“放宽当前 parser”。高概率分支是已部署构建落后、HTML/JS
  混合缓存，或页面实际错误不是这些显式版本门；必须用原始错误和当前 HEAD 端到端复现定案。
- 规划会话的首次 runtime 复现因 shell 没有 `node` 而未完成；误触发的 `pnpm exec` 进入依赖 bootstrap 后因
  沙箱网络权限失败。没有 tracked diff，后续不继续安装或运行重型测试。执行会话按第 9 节先启用 Node 24。

## 4. 需求解释与技术决策

### 需求解释

- “导入 layout10.zip”专指页面顶部“导入 Layout ZIP”，不是“导入项目”JSON，也不是点击新窗口预览后的
  MessageChannel 协议。
- “版本不对”只是一条用户观察，不能直接推出 ZIP 老、代码老或需要兼容；必须记录完整 error message 和
  first failing owner。
- “更新代码重新发布”解释为：当前仓库已经包含所需能力，但线上 build identity 落后时，用已验证的当前 commit
  重建并原子发布；不是为了制造 diff 而修改源码。
- “修改代码”只在当前 HEAD 对正式、应支持的输入仍失败时成立。若 ZIP producer 输出违反 schema，正确动作是
  修 producer 后重新导出，而不是让 runtime 接受非法包。

### 关键决策

1. **以三方版本对齐定案**
   - 同时记录 input contract、current HEAD、deployed build；任意两方一致都不能替代第三方证据。
   - 页面无 build metadata 时优先从发布 artifact/HTTP headers/commit 记录取得；本任务不默认增加业务 build-info API。
2. **复用真实 import chain**
   - 自动复现直接调用 `inspectSceneOtherSceneFlowPackage()`，浏览器复现走 `#layout-file`；禁止只解析根 JSON
     就宣称 ZIP 可导入，因为 nested closure/capability 仍可能失败。
3. **部署落后时不改 production code**
   - current HEAD 成功、部署失败即归为 release alignment；运行定向测试/build，发布同一 immutable artifact，
     原子切换 HTML 和 hashed JS。清缓存只能验证，不能用来掩盖非原子部署。
4. **当前 HEAD 失败时修第一责任 owner**
   - parser 不认识一个已批准的新 schema：新增显式 version union/parser 分支与直接 consumer test；不改旧 version 语义。
   - producer 写出非法结构：修 exporter 并重导 fixture，runtime 保持失败；不得手工把 version 改成旧值。
   - error 丢失上下文：在边界保留原 error/cause，并补 `layout root / asset key / nested owner`，不把所有异常改写成
     泛化“版本不对”。
5. **真实 ZIP 外置，回归 fixture 最小化**
   - 25 MB 用户文件只用于只读复现与人工验收；自动测试构造能触发同一 parser branch 的最小 canonical ZIP，
     不复制整包资源、不读取 `assets/**` 美术交付。

## 5. 职责与合同

- **Game Viewer 2 UI**：拥有 File bytes、一次 import transaction、status/error 呈现和成功后的 flow bootstrap；
  不解析 ZIP 内 manifest，不根据 filename/version猜兼容路径。
- **rendercore scene-layout**：拥有 canonical ZIP、assets map、layout/nested typed closure、active mode/binding 解析和
  headless summary 生命周期；失败前不得向 UI commit 半份 summary/resource。
- **nested owner**：Symbol/Popup/ImageString/VNI/Spine 各自维护显式 version/capability；Scene Layout 只附加路径上下文，
  不复制或放宽它们的 parser。
- **部署边界**：同一 commit 产出的 HTML 与 hashed JS/assets 必须作为一套 artifact 发布；旧 HTML/新 chunk 或反向混用
  都视为发布失败，不归因于 Layout ZIP。
- **失败策略**：first failure authoritative；错误必须包含 actual value、expected contract 和 logical owner。cleanup error
  不覆盖 parse error，失败不替换当前已成功导入的 state。
- **禁止行为**：不改输入 version 伪装兼容，不跳过 map/hash/closure，不添加 `layout10` special case，不静默重导资源，
  不把外层 project/launch version 与 Layout package version 混为一谈。

## 6. 文件范围

### 预计新增

```text
tasks/194-gameviewer2-layout10-import-version-alignment-<utctime>.md
```

仅当 current HEAD 真实复现失败且需要自动回归时，新增：

```text
apps/gameviewer2/tests/layout-import.test.ts
# 或第一责任 owner 下的一个最小定向 test/fixture；二者择一，不重复造 fixture
```

### 预计修改

证据分支 A（current HEAD 已支持）原则上没有 production source 修改；只验证 build、形成报告和发布交接。

证据分支 B（current HEAD 失败）只允许从以下位置选择第一责任 owner 的最小集合：

```text
apps/gameviewer2/src/ui/app-shell.ts
apps/gameviewer2/tests/app-shell.test.ts

packages/rendercore/src/scene-layout/{production-zip,package-resource,local-scene-authoring}.ts
packages/rendercore/tests/scene-layout/{production-zip,local-scene-readiness}.test.ts

# 仅在错误确实来自 nested contract 时
packages/rendercore/src/{symbol,popup,image-string,spine}/<exact-owner>.ts
packages/rendercore/tests/<exact-owner>.test.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/tests/core/validation.test.ts

apps/gameviewer2/README.md
packages/rendercore/README.md
```

不允许同时修改多套 parser 来“试到能过”。若需要修改 Game Layout/Symbols/Popup exporter、正式 schema 或更多
consumer，必须在实施前说明 first failure、public contract 和 L2 扩围原因。

### 原则上不应修改

```text
/Users/zerro/Downloads/minecart2/layout10.zip
assets/**
apps/{gameviewer,gamelayouteditor,symbolseditor,popupeditor,game002,game002v2,game003}/**
packages/{logiccore,gameframeworks,uiframeworks,netcore,slotoperationauthoring}/**
AGENTS.md
pnpm-lock.yaml
apps/gameviewer2/src/model/{project,operation-project}.ts
apps/gameviewer2/src/runtime/launch-channel.ts
```

## 7. 实施步骤

1. **确认执行基线与部署证据**
   - 重核 HEAD/status、原 ZIP bytes/hash 和本计划列出的合同；原文件变更时记录新 hash，不沿用旧结论。
   - 在实际页面记录完整错误、URL、浏览器、是否 hard reload/无缓存、network 中 HTML/JS artifact 名；从发布记录或
     artifact 确认 deployed commit。无法取得时明确为未知，不能假定等于当前 HEAD。

2. **在当前 HEAD 运行真实 headless import**
   - 启用 Node 24，只在依赖缺失时按第 9 节执行 frozen install。
   - 用原始 bytes 调用 `inspectSceneOtherSceneFlowPackage()`，记录成功 summary 或完整 error stack/cause；同时验证
     temporary package resource 在 success/failure 都 cleanup。
   - 在 current dev/build 页面通过 file input 再导入同一 ZIP，区分 core parser 与 UI/bundle 问题。

3. **执行版本对齐决策**
   - current HEAD headless/browser 均成功、部署失败：进入发布分支，不改 parser/app 兼容逻辑。
   - current HEAD 与部署都成功：检查浏览器旧缓存、service worker/CDN、HTML/chunk 混用；原子重发或失效旧 artifact。
   - current HEAD 失败：冻结第一处错误与 logical key，确认它是 input 非法、runtime 能力缺口还是错误包装缺陷，再进入
     第 4 步；不得先改 version 条件试错。

4. **仅在有源码缺口时实现最小修复**
   - 为失败 owner 添加最小 synthetic fixture，先证明旧代码失败和期望 contract。
   - 若是已批准的新 version，添加独立 strict parser 分支并保持旧 version exact 语义；同步直接 consumer 类型/测试。
   - 若是 exporter 非法，停止 runtime 修改，扩围到 producer 修复并重新正式导出；原 `layout10.zip` 仍作为失败证据。
   - 若只是信息不完整，在 import/closure 边界添加 owner/logical key/cause；UI 保留原始消息，不泛化为“版本不对”。

5. **构建、发布交接与真实复验**
   - 运行第 8 节定向验收并生成 `gameviewer2` production artifact；dist 不提交。
   - 有已确认发布工具和权限时，用同一 artifact 原子发布；否则记录 artifact/commit/checksum 和发布方操作，不越权发布。
   - 用无缓存浏览器导入原始 ZIP，核对 summary、默认 flow/operations、console/network；再用一个 intentional bad-version
     最小包确认 strict failure 未被削弱。

6. **文档与收尾**
   - 只有 import workflow/error contract 改变时更新 app/rendercore README；不把具体 `layout10` 版本清单写入领域规则。
   - 生成 UTC 执行报告，明确最终结论是“只需重新发布”“需要精确代码修复”“需要 producer 重新导出”或“仍缺发布权限”，
     附 actual/deployed/current 三方证据和未完成人工项。

## 8. 测试与验收

### 测试原则

- 真实 ZIP 证明集成行为，最小 synthetic ZIP 保护具体合同；二者不能互相替代。
- 覆盖当前合法版本、intentional bad version、nested error context、success/failure cleanup，以及 UI 不半提交。
- 若 current HEAD 已支持，不为制造测试 diff 把外部 25 MB 文件复制进 repo；现有测试 + headless/browser 实证足够。
- 不为过时部署修改当前 strict code；发布版本差异由 build identity 证明。

### 验收级别

默认 `L2`：Game Viewer 2 直接消费 rendercore production ZIP/schema/resource closure；若需要 parser/public type 改动，
必须验证 shared owner 与直接 consumer。若最终只重新发布且用户要求正式 release，则发布会话按仓库规则升级 `L3`，
但升级前先说明实际发布范围和新增命令，不在本实现计划中默认运行整仓测试。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/production-zip.test.ts tests/scene-layout/local-scene-readiness.test.ts --coverage.enabled=false
pnpm --filter gameviewer2 exec vitest run tests/app-shell.test.ts tests/layout-import.test.ts --coverage.enabled=false
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter gameviewer2 typecheck
pnpm --filter gameviewer2 build
git diff --check
```

`tests/layout-import.test.ts` 未新增时，第二条去掉该路径。若第一责任 owner 是 Symbol/Popup/ImageString/VNI/Spine，
把第一条的测试文件替换或追加为该 owner 的精确定向测试，但总命令仍保持不超过 6 条。

### 人工验收

1. 当前 HEAD dev/build 页面导入原始 `layout10.zip`；记录页面 summary、完整 console 和 network，无 error/rejection。
2. 已部署无缓存页面导入同一原始文件；确认 HTML 与 JS 来自同一 build，行为与 current artifact 一致。
3. 导入 intentional bad-version 最小 ZIP；错误指出 exact owner、actual/expected version，旧 flow/state 不被部分覆盖。

### 独立验收建议

`建议`。涉及正式 ZIP、nested resource closure 和可能的发布 artifact；不涉及 credential、服务器数据或新的资源 ownership。
独立复验最多运行：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/production-zip.test.ts tests/scene-layout/local-scene-readiness.test.ts --coverage.enabled=false
pnpm --filter gameviewer2 exec vitest run tests/app-shell.test.ts --coverage.enabled=false
pnpm --filter gameviewer2 build
```

并由复验者在无缓存已部署页面导入原始 ZIP 一次。

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24。当前非交互 shell 没有 `node` 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 Node 和 pnpm，不强制调版本、不切换 npm/yarn。
- 依赖缺失时才运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置代理并重试同一命令；不得因网络失败改 lockfile 或切换 registry/package manager。
- 本任务不新增依赖、不修改 lockfile。用户 ZIP 只读，不复制到临时“修正版”作为验收输入。
- 发布 URL、平台、credential 和 cache invalidation 工具当前未知；取得前只构建和记录交接，不推断外部权限。

## 10. 生成物、文档与规则

- `apps/gameviewer2/dist/**` 是 Vite build artifact，不纳入源码提交；发布必须使用同一 build 目录的完整原子集合。
- 本任务不修改 YAML 或现有生成 TypeScript，不运行无关生成器。
- 行为/error workflow 改变时只更新 `apps/gameviewer2/README.md` 或 `packages/rendercore/README.md` 的对应段落。
- 当前职责边界已经由三份领域规则覆盖；具体 ZIP、版本清单、部署 build 和执行证据只进入任务计划/报告，
  不更新根 `AGENTS.md` 或领域规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/194-gameviewer2-layout10-import-version-alignment-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 原始 ZIP path/bytes/SHA-256、真实错误与 first failing owner；
2. current HEAD、deployed build 和 input contract 的对齐结论；
3. 最终是零 production diff + 重发、代码修复、producer 修复还是发布交接；
4. 实际修改文件、验收命令、build artifact/commit/checksum 与部署状态；
5. 无缓存真实浏览器结果、未完成发布/人工项和剩余风险。

## 12. 风险、假设与待确认

### 风险

- 当前没有线上 URL/build metadata；若只凭本地 HEAD，无法证明用户看到的页面实际运行哪个 commit。
- 非原子静态发布或 CDN/browser 缓存可造成 HTML/JS 版本混用，表现为协议/schema 错误；单纯 hard reload 不能修发布流程。
- 根 manifest 的版本都合法不代表 nested closure 一定可消费；必须保留完整 headless import，不能停在静态 JSON 核对。
- 若真正失败来自 producer 生成的非法 package，原 `layout10.zip` 不会被 runtime 修复；需要重新导出一个新 ZIP 并由用户替换。
- planning 环境的依赖 bootstrap 未完成；执行时 frozen install 可能需要网络和额外时间，但不构成放宽验收的理由。

### 假设

- 用户所称“这个项目”是 `apps/gameviewer2`，操作是“导入 Layout ZIP”。
- `/Users/zerro/Downloads/minecart2/layout10.zip` 在执行会话仍存在且 hash 未变化；变化时按新文件重新取证。
- 当前 HEAD 声明的版本合同是目标 runtime 合同，不为未知线上旧 build 保留额外 compatibility branch。
- 用户希望先形成可执行计划，本会话不实施源码修复、不发布站点、不生成执行报告。

### 待确认

- 实际页面 URL、完整错误原文/截图、浏览器版本，以及错误发生在选择文件后还是点击预览后。
- 已部署 Game Viewer 2 的 commit/build artifact 与托管发布方式。
- 若确认只需重新发布，发布由谁执行、是否有原子 artifact 切换与缓存失效权限。
