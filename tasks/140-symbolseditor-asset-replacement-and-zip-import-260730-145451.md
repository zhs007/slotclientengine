# 140 Symbols Editor 资源替换与 ZIP 导入执行报告

## 结果

任务 140 的代码、共享冲突合同、Symbols Editor UI、自动化测试、production build
和文档已完成。真实浏览器验收按用户要求由用户执行，当前状态为待用户验收。

最终行为：

- 单文件、多文件、generic resource ZIP 和 loose file + generic ZIP 混合批次统一走
  bounded ingestion、filename-key review 和原子提交。
- 同名同 bytes 为 noop；同名不同 bytes 显示现有引用并要求显式选择。review 支持
  逐项决定、“全部替换”和“全部保留两份”。
- keep-both 使用共享 allocator 在扩展名前分配最小可用 `-1`、`-2` suffix，同时
  避开 workspace、当前批次及 case/NFC alias。
- 覆盖保持已有 symbol/state/value/cascade/ImgNumber 和 filename-key 引用；candidate
  package 无法通过 owner validation 时不提交。
- 普通图片支持 keep-both。不能安全结构化改写的 Spine/VNI/ImgNumber candidate 在
  review 禁止 keep-both，仍可按原 key 覆盖；不做字符串替换或 silent fallback。
- 含 `symbols.package.json` 的 ZIP 只能单独打开，并在确认后原子替换当前项目；
  standalone ImgNumber ZIP 继续单独安装，generic ZIP 不再误入 ImgNumber importer。
- 导入显示读取、验证、提交和预览反馈；导入期间阻止重复请求。
- preview exception 不再被空 catch 吞掉。项目保留可编辑，错误区显示 exact error、
  fallback cleanup 结果和“重试预览”按钮。

## 共享合同

- `editorresource`
  - 新增 `allocateEditorAssetKeySuffix()`。
  - 新增 `createEditorAssetWorkspace()`。
  - 新增显式 `EditorImportResolution`、
    `resolveEditorAssetImportReview()` 与 `keep-both` action。
  - 既有 consumer 的初始 `add/noop/overwrite/rename-required` review 行为保持兼容；
    只有调用 resolution API 的 consumer 才要求显式冲突决定。
- `symbolseditor`
  - 新增 `resource-import.ts`，将现有 asset library 接入 shared workspace/review，
    收集已有 references，并在 clone 上 prepare/validate/commit。
  - 新增可测试的 import review dialog；UI 不自行分配 key 或计算 hash。

## task135 ZIP 诊断

输入：

```text
/Users/zerro/Downloads/game002-s3-symbols-task135.zip
bytes: 6,223,098
SHA-256: e59d9014e3ea802c647c1fd184b2d91c5b2817ed5c2bd2d0ee3bfa96b3c7d255
ZIP entries: 83
uncompressed bytes: 7,403,163
```

- `unzip -t` 全部通过，根 `symbols.package.json` 存在。
- 当前 importer headless prepare 成功：
  `game002-s3 / 13 symbols / 79 resources / 18 states`。
- headless export/reimport 后 bytes 完全一致，输出 SHA-256 与输入相同。
- 因此输入 ZIP 未损坏。当前确认的 UI 缺陷是 project import 缺少分阶段反馈，且
  `refreshPreview()` 会静默吞掉实际 preview error；两者均已修复。
- 真实 Pixi/Spine/VNI 视觉结果仍待用户浏览器验收。

## 实际修改

新增：

```text
apps/symbolseditor/src/model/resource-import.ts
apps/symbolseditor/src/ui/import-review-dialog.ts
apps/symbolseditor/tests/resource-import.test.ts
tasks/140-symbolseditor-asset-replacement-and-zip-import.md
tasks/140-symbolseditor-asset-replacement-and-zip-import-260730-145451.md
```

修改：

```text
packages/editorresource/src/{key,workspace}.ts
packages/editorresource/tests/editorresource.test.ts
packages/editorresource/README.md
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/app-shell.test.ts
apps/symbolseditor/README.md
docs/agent-rules/editor-artifacts.md
```

未修改 production schema、task135 ZIP、assets、游戏 app、`pnpm-lock.yaml` 或根
`AGENTS.md`。

## 测试与验收

最终通过：

- `editorresource` typecheck。
- `symbolseditor` typecheck。
- `editorresource`：2 files / 36 tests。
- `symbolseditor`：8 files / 49 tests。
- `editorresource` build。
- `symbolseditor` Vite production build。
- 两个 package 的 `format:check`。
- `git diff --check`。
- task135 实际 ZIP headless import/export/reimport byte parity。

Vite build 仍报告现有的主 chunk 超过 500 kB 警告，不影响 build 成功；本任务没有扩大
bundle owner 或引入依赖。

## 与计划的适配

- 没有单独新增 `import-review-dialog.test.ts`；逐项/batch dialog、generic ZIP、
  project ZIP 和 preview error 流程集中由 `app-shell.test.ts` 验证，model transaction
  由新增 `resource-import.test.ts` 验证。
- 没有修改 `editor-store.ts`、`ui-session.ts`、`symbol-package-zip.ts` 或
  `image-string-dependency.ts`；现有 API 已足够，改动集中在 import coordinator。
- structured keep-both 只在能够安全保持 incoming typed graph 时允许。当前实现明确
  支持普通图片；其它 typed candidate 在 review 禁用并要求覆盖或拆分导入，符合禁止
  路径猜测和字符串改写的边界。
- 安装了 lockfile 已锁定的本地依赖以执行验收；lockfile 未变化。
- 没有 commit、push 或创建 PR。

## 待用户浏览器验收

1. 在已有配置项目中替换单张同名图片，确认 references、配置不变和预览更新。
2. 导入含新增与冲突图片的 generic ZIP/mixed batch，验证逐项选择、两种“全部”动作、
   `-1/-2` suffix、取消回滚和 export/reimport。
3. 用不兼容 Spine/VNI/ImgNumber 覆盖已绑定 key，确认错误可见且旧项目不变。
4. 无项目和已有项目时分别打开 task135 ZIP，确认 project replace、loading/success、
   CO/WL/WM/CM/CN state/value/ImgNumber 和 all-symbol preview。
5. 验证 preview failure/retry、重复导入、resize/destroy 和 browser console。

## 剩余风险

- 自动化证明了 filename-key transaction、配置 parity、ZIP 路由和错误呈现；真实
  WebGL texture、official Spine/VNI/ImgNumber 观感仍只能由浏览器验收。
- task135 headless round-trip 完全一致，但其真实 preview 是否触发环境特定错误要由
  用户浏览器结果最终确认；发生错误时新 UI 会保留项目并显示 exact 原因。
