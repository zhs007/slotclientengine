# 141 popupeditor-vni-jpeg-import 任务计划

## 1. 目标与完成定义

### 目标

修复 Popup Editor 导入包含 JPEG asset 的合法 VNI export bundle 时，二进制图片头被
`TextDecoder("utf-8", { fatal: true })` 当作文本解码并抛出
`Failed to execute 'decode' on 'TextDecoder': The encoded data was not valid.`
的问题。以用户提供的 `crave_superwin.zip` 为真实回归输入，确保唯一 runtime profile
可以进入正常资源审查，同时继续严格拒绝非法 JSON、atlas 文本和未知二进制。

### 完成定义

- [ ] `crave_superwin.zip` 可在 Popup Editor 中被识别为单一 runtime VNI bundle，
      自动选择 `runtime_100`，资源审查显示 `crave_superwin.json` 及其完整 15 个图片
      asset，不再抛出原始 `TextDecoder` DOMException。
- [ ] VNI closure 内的 `.jpg` 以 `image/jpeg` 和原 filename key 进入 import review；
      PNG、WebP、JPEG 的既有支持集合与 content-addressed workspace 合同保持不变。
- [ ] 图片类型识别只比较二进制 magic bytes，不使用文本解码；JSON 与 Spine atlas
      继续使用严格 UTF-8 解码，非法文本仍带 source path 显式失败。
- [ ] 未支持或损坏的二进制仍走 Popup Editor 的领域诊断，不以放宽 UTF-8、忽略文件或
      图片 fallback 掩盖错误。
- [ ] 导入仍遵守 bounded ZIP、唯一 runtime 自动选择、完整 closure 校验和
      review-before-commit；失败不修改当前 project。
- [ ] `popupeditor` 定向自动化、真实 ZIP 人工验收及任务 141 UTC 中文执行报告完成。

## 2. 范围

### 包含

- `apps/popupeditor/src/io/resource-import.ts` 的 PNG/WebP/JPEG binary signature 识别。
- Popup VNI bundle 导入含 JPEG asset 的回归测试。
- 非 UTF-8 JSON 与未知二进制的 strict failure 回归，防止通过全局放宽 decoder
  “修复”问题。
- 使用用户下载目录中的真实 `crave_superwin.zip` 做浏览器人工验收。

### 不包含

- 修改 VNI bundle/project schema、profile 选择规则、asset path 或 export profile。
- 修改 `browserartifactio` ZIP 解压、`editorresource` filename-key/content-addressing
  或 `vnicore` validator；现有证据表明故障发生在 app 私有图片类型识别。
- 为 standalone JPEG/WebP 新增浏览器尺寸探测；当前 standalone 非 PNG 图片仍按
  `imageSize()` 的现有显式限制处理，本任务只修复 VNI/Spine closure 中已带尺寸语义的
  JPEG。
- 转码、修复或重新打包 `crave_superwin.zip`，也不把该用户文件提交为仓库 fixture。
- 增加图片格式、MIME sniff fallback、按扩展名猜内容、忽略 unknown/orphan asset。
- 修改 Popup manifest、rendercore runtime、其它 editor、游戏 app、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-07-30T14:22:46Z
HEAD: 272a9e94efd73c8c43bfdab5f098871a1d3cdffa
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和计划依据：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
tasks/templates/task-plan.md
apps/popupeditor/README.md
```

真实输入基线：

- `/Users/zerro/Downloads/crave_superwin.zip` 存在，大小 `8,165,631` bytes，
  SHA-256 为
  `b92bb85cc69b8c9e7a8e27f5a861d63b4597f9ac22c592ae70266301002f85a4`。
- ZIP 有 37 个 entry；根 `manifest.json` 是 `vni_export_bundle` /
  `VNI_0.103`，声明一个 `purpose=editing` 的 `edit_full` 和唯一
  `purpose=runtime` 的 `runtime_100`。
- `runtime_100/crave_superwin.json` 的 profile 与 manifest 一致，声明 15 个 image
  asset；其中 `assets/image_asset_image_ms4gxgzv_1i.jpg` 的开头为
  `ff d8 ff e1`，是 JPEG，project 同时明确保存 `1360×1402` 尺寸。
- ZIP 结构、entry 数量、压缩/解压尺寸和文件大小均在现有 `POPUP_ZIP_LIMITS` 内；
  现阶段没有证据需要调整 bounded input 合同。

当前代码基线：

- UI 调用链是
  `PopupEditorAppShell.reviewFiles()` →
  `inspectVniBundleProfiles()` →
  `discoverPopupResources()` →
  `discoverVniBundleZip()` →
  `discoverVni()` →
  `imageType()`。
- `discoverVni()` 对 project 声明的每个 asset 调用 `imageType()`，再通过
  `createEditorAssetEntry()` 保留 filename key、MIME、bytes 和完整 SHA-256；VNI
  asset 不调用 standalone `imageSize()`。
- `imageType()` 当前先用严格 UTF-8 `decode()` 比较 PNG/RIFF/WEBP 字符串，最后才比较
  JPEG 的 `0xff 0xd8`。JPEG 的首字节在到达 JPEG 分支前已触发 fatal decoder 异常，
  与用户报错一致。
- 同一个 `decode()` 还被 `parseJson()` 和 Spine atlas 解析使用；这些是文本边界，
  strict UTF-8 是正确合同，不能全局改为 non-fatal decoder。
- `apps/popupeditor/tests/resource-import.test.ts` 已覆盖 PNG VNI closure、单/多 runtime
  profile、Spine、unknown input 和 alias，但 VNI bundle fixture 的图片全为 PNG，
  unknown fixture 也是 UTF-8 可解码字节，未覆盖当前失败。

不需要审计完整 Git 历史；真实 ZIP、当前 importer 调用链和已有测试足以确定根因与合同。

## 4. 需求解释与技术决策

### 需求解释

- “导入时报错”解释为 Popup Editor 的“导入资源”入口应接受这个结构合法、唯一 runtime
  的 VNI export bundle，并进入现有 import review，而不是导入后自动绑定档位或替换
  project。
- 报错不是 ZIP 编码、文件名编码或 JSON 编码问题；已确认是 JPEG 二进制 magic 被当作
  UTF-8 文本读取。
- 修复只改变图片内容类型探测的实现方式，不改变资源接受集合、VNI strict validation、
  profile selection、closure 或 transaction。

### 关键决策

1. **使用数值 byte comparison 识别图片 magic**
   - PNG 比较既有 signature bytes，WebP 比较 `RIFF` 和 `WEBP` 对应的固定字节，
     JPEG 比较 `ff d8`。
   - 可以使用 app 私有的小型 byte-prefix helper 消除重复，但不导出新 public API，也
     不把 format-specific importer 逻辑下沉到共享 package。
   - 任意二进制均可安全返回“匹配/不匹配”，不会因 UTF-8 合法性中断 discovery。

2. **保留文本边界的 fatal UTF-8**
   - `parseJson()` 与 Spine atlas 继续调用严格 `decode()`；不捕获后替换字符、不静默
     跳过，也不以扩展名代替内容校验。
   - JSON discovery 继续在外层补充 source path 诊断；未知二进制最终进入现有
     “无法识别、未引用或不完整”错误。

3. **用合成确定性 ZIP做自动化，真实包做人工回归**
   - 测试复用仓库已有合法 VNI project/图片资源，用
     `createDeterministicZip()` 生成含 JPEG asset 的 runtime bundle，直接保护正式
     `discoverPopupResources()` 路径。
   - 不提交 8 MB 用户 ZIP，避免把一次性外部输入变成仓库长期资源；其 SHA-256 用于人工
     验收时确认仍是同一文件。
   - 测试同时断言 JPEG entry 的 key/MIME 和 candidate 成功，不能只断言 Promise
     不抛错。

## 5. 职责与合同

- **Popup Editor importer**：拥有 image/VNI/Spine/image-string discovery、图片 magic
  分类、VNI closure flatten 和 import review candidate。
- **browserartifactio**：继续拥有 bounded ZIP 解压和安全 path；本任务不复制或绕过。
- **editorresource**：继续拥有 filename-key、MIME/extension parity、SHA-256、review
  和 commit transaction。
- **vnicore**：继续拥有 bundle/project/profile strict validation；唯一 runtime 自动
  选择，多 runtime 必须显式选择。
- **数据合同**：输入 bytes 不先假定是文本；仅 JSON/atlas 进入严格 UTF-8 decoder，
  图片只按已支持 magic 分类。
- **失败策略**：非法 UTF-8、非法 JSON、错误 profile、缺 asset、未知图片和
  unknown/orphan 文件显式失败；prepare 失败不得 commit。
- **禁止行为**：不使用 non-fatal decoder、扩展名猜 MIME、placeholder image、忽略
  JPEG、静默移除 asset 或重打包用户 ZIP。

## 6. 文件范围

### 预计新增

```text
tasks/141-popupeditor-vni-jpeg-import-<utctime>.md
```

### 预计修改

```text
apps/popupeditor/src/io/resource-import.ts
apps/popupeditor/tests/resource-import.test.ts
```

### 原则上不应修改

```text
apps/popupeditor/src/io/popup-zip.ts
apps/popupeditor/src/model/**
apps/popupeditor/src/ui/**
apps/popupeditor/README.md
packages/browserartifactio/**
packages/editorresource/**
packages/rendercore/**
packages/vnicore/**
apps/gamelayouteditor/**
apps/game002/**
apps/game003/**
assets/**
docs/agent-rules/**
AGENTS.md
pnpm-lock.yaml
```

若执行时发现数值 magic 修复后真实包仍被共享 parser/schema 拒绝，需先记录新的最小复现和
职责证据；不得直接扩大跨包 public API 或放宽 validator。

## 7. 实施步骤

1. **确认执行基线与真实输入**
   - 重查 HEAD/status、任务计划、`editor-artifacts` 规则以及真实 ZIP 的路径、SHA-256
     和 manifest/runtime project。
   - 若 ZIP 已移动，可按记录的 SHA-256 请用户重新提供；不得用相似文件替代真实验收。

2. **先建立失败回归**
   - 在 `resource-import.test.ts` 构造包含唯一 runtime 和 JPEG asset 的确定性 VNI
     bundle，确认修复前复现 fatal `TextDecoder` 错误。
   - 增加非法 UTF-8 JSON 和高位 unknown binary 用例，分别固定“文本仍严格失败”和
     “二进制 discovery 不泄漏 decoder 异常”。

3. **改为 binary-safe 图片 signature 检查**
   - 在 `resource-import.ts::imageType()` 中以 byte comparison 实现 PNG、WebP 和 JPEG
     判断，移除图片 magic 对 `decode()` 的调用。
   - 保持返回 extension/MIME、caller 顺序、VNI/Spine flatten 和 standalone
     `imageSize()` 合同不变。

4. **验证 import review 与失败边界**
   - 断言 JPEG VNI bundle 自动选择唯一 runtime，candidate root、dependency count、
     JPEG filename key 与 `image/jpeg` 正确。
   - 断言非法 JSON 仍带 source path 失败，unknown binary 进入领域错误，且现有
     PNG/WebP/JPEG、profile 和 closure 测试继续通过。

5. **定向验收与收尾**
   - 运行 L1 命令并在真实浏览器导入指定 SHA-256 的 `crave_superwin.zip`。
   - 检查 diff 无无关修改，不更新 README/规则/schema，生成任务 141 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 回归必须经过公开的 `discoverPopupResources()` VNI bundle 路径，不通过导出或单测
  app 私有 `imageType()` 来绕过真实调用链。
- JPEG fixture 必须保留 `.jpg` filename key 且 bytes 具有真实 JPEG signature；
  candidate asset 必须断言 `mediaType === "image/jpeg"`。
- 至少覆盖 PNG 既有成功路径、JPEG 新成功路径、unknown 高位二进制和非法 UTF-8 JSON；
  WebP 由现有 signature 逻辑保留，若调整 helper 时应补等价断言。
- 不用 mock decoder、按扩展名伪造 MIME 或跳过 VNI validator 使测试通过。
- 真实 ZIP 只用于人工端到端验收；自动化 fixture 必须自包含于仓库现有测试资源。

### 验收级别

`L1`。改动限定在 `popupeditor` 私有 importer 和直接测试，不改变跨包 public API、schema、
生成物、依赖或 lockfile。运行 app 的定向 test/typecheck/lint/build/format 足以覆盖风险，
不升级到整仓验收。

### 执行会话必须运行

```bash
pnpm --filter popupeditor typecheck
pnpm --filter popupeditor test
pnpm --filter popupeditor lint
pnpm --filter popupeditor build
pnpm --filter popupeditor format:check
git diff --check
```

失败时先只运行 `apps/popupeditor/tests/resource-import.test.ts` 最小化复现；不得直接扩大到
根级 `pnpm test/typecheck/build`。

### 人工验收

1. 使用 Node 24 运行 `pnpm --filter popupeditor dev`，在真实浏览器打开 Popup Editor。
2. 从“导入资源”选择 SHA-256 为
   `b92bb85cc69b8c9e7a8e27f5a861d63b4597f9ac22c592ae70266301002f85a4`
   的 `/Users/zerro/Downloads/crave_superwin.zip`。
3. 确认不弹 profile 选择（只有一个 runtime），审查显示 VNI root
   `crave_superwin.json`、15 个 dependencies，并可看到 JPEG key；取消审查时 project
   不变，确认后资源原子进入资源库。
4. 检查页面错误区和浏览器 console 均无原始 `TextDecoder` 异常。

### 独立验收建议

`建议`。虽然不改 public contract，但真实外部 VNI ZIP 是本次唯一已知生产回归输入。
独立复验重点：

```bash
pnpm --filter popupeditor test
git diff --check
```

另按上述 SHA-256 对真实 ZIP执行一次浏览器导入，不需要重复全套自动化。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；不切换 npm/yarn。
- shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有依赖下载实际失败后才设置代理并重试原命令。
- 本任务不新增依赖、不修改 package manifest 或 lockfile；byte comparison 使用平台原生
  `Uint8Array` 即可。

## 10. 生成物、文档与规则

- 本任务没有 YAML、schema 或代码生成物。
- README 已声明 Popup Editor 可导入 VNI 和 JPEG，不新增用户操作或 public workflow，
  因此原则上不修改。
- 本次修复不改变稳定职责边界，不更新 `AGENTS.md` 或领域规则。
- `crave_superwin.zip` 是人工回归输入，不复制到 `assets/`、tests fixture 或任务附件。
- 执行证据只写任务 141 UTC 中文报告，不写入 runtime manifest 或长期规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/141-popupeditor-vni-jpeg-import-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终实现与实际修改文件；
2. JPEG binary signature 决策及任何计划偏差；
3. 实际验收命令和结果；
4. `crave_superwin.zip` SHA-256 与人工导入结果；
5. 未完成人工验收、剩余风险或未完成项。

不收集无关 coverage 历史、整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- magic bytes 只能分类已支持格式，不证明完整 JPEG 文件可被浏览器/runtime 解码；本任务
  保持现有 importer 分层，真实文件可解码性由实际 preview/runtime prepare 继续显式验证。
- 外部 ZIP 可能被移动或覆盖；人工验收必须以记录的 SHA-256 确认输入，不能只比较文件名。
- 若真实包在修复 magic 后暴露另一个独立 schema/closure 错误，应作为新证据报告，不能
  通过放宽 VNI validator 或忽略 asset 合并处理。

### 假设

- 用户要求修复 Popup Editor 对该 VNI bundle 的导入，不要求把它自动绑定到
  `superwin` tier 或写入 production Popup ZIP。
- 真实 ZIP 中 JPEG 的 project metadata 和 asset path 是 VNI bundle 的正式输入；
  importer 应保留 bytes/key/MIME，不负责转码。

### 待确认

无。根因、真实输入结构和预期导入入口均可从当前仓库与用户文件确认。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] 图片 binary signature、文本 strict UTF-8 和 VNI closure 合同符合计划。
- [ ] JPEG/PNG/unknown/invalid-text 回归测试已覆盖。
- [ ] 指定 L1 自动化验收已通过。
- [ ] 指定 SHA-256 的真实 ZIP 人工验收已完成或明确记录未完成。
- [ ] README、规则、schema、依赖和 lockfile 未被无故修改。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md` 和本计划；
2. 核对 Git 基线、工作区及真实 ZIP 的 SHA-256；
3. 先固定 JPEG VNI 失败测试，再按计划实现，不重新制定另一套方案；
4. 小幅适配当前实现时在报告记录；
5. 出现跨包/schema/依赖或文件范围扩张时先停止说明；
6. 只运行计划规定的 L1 验收和真实浏览器人工验收；
7. 完成后生成任务 141 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
