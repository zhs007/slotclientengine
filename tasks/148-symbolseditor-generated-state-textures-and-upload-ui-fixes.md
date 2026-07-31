# 148 symbolseditor-generated-state-textures-and-upload-ui-fixes 任务计划

## 1. 目标与完成定义

### 目标

为无服务器纯前端 Symbols Editor 增加浏览器内状态贴图生成：当前 symbol 的 `normal`
是已绑定且有效的单张图片时，在该 symbol 的 normal 页面提供“生成模糊图”和
“生成 disable 图”两个独立按钮；每次只生成、绑定对应的 `spinBlur` 或 `disabled`，
并随正式 Symbols ZIP 导出。

用户也可在两个 state 上传并使用自制图片；生成与手传按最后一次成功操作生效。同时修复
state 横向导航选中项不可见，以及 Resource Picker 上传间歇性失败/流程不一致。

### 完成定义

- [ ] 每个 symbol 的 direct normal image 状态页显示两个独立按钮：“生成模糊图”和
      “生成 disable 图”；layered、Spine/VNI、tiered、空引用或坏图片禁用并显示原因。
- [ ] 每次点击只从当前 symbol 的 normal bytes 生成一张同尺寸、正确 alpha 的 PNG：
      blur 使用 `3 × 21` vertical box blur，disable 使用 grayscale + `0.72`
      brightness；不连带生成另一个 state，也不处理其它 symbols。
- [ ] 候选 key 稳定为 `<normal-stem>.spinBlur.png` 和
      `<normal-stem>.disabled.png`；同名不同 bytes 统一 review，用户明确选择
      overwrite 或 keep-both suffix，取消时零修改。
- [ ] 生成资源、添加缺失 builtin state、绑定 resolved key、preview/export validation
      和 store replace 是一次事务；decode/encode、review、校验、stale 或 destroy 失败
      不留下半提交。
- [ ] `spinBlur`/`disabled` Picker 可“上传并使用”单张图片；同样经过统一 review 后
      原子绑定 resolved key。其它 toolbar/picker 普通上传仍只入库/刷新候选，不猜绑定。
- [ ] last-operation-wins 按 state 独立成立：后一次成功生成或手传只更新目标 state。
      取消/失败不覆盖旧结果，较早请求晚完成也不能反向覆盖。
- [ ] 旧资源不危险删除；无引用 bytes 由 exact-closure export 排除。ZIP 导出/重导后
      state refs、PNG、`assets.map.json`、hash/path/closure 均有效。
- [ ] 所有普通资源来源共用 prepare/review/commit coordinator；Symbols project ZIP
      与 standalone ImgNumber ZIP 保持专用 owner import。
- [ ] 每次打开 file input 前清空旧 value；取消、同文件重选、新文件、overwrite、
      keep-both、失败与重试均稳定。
- [ ] Picker import 保持 context/query/selection/focus；review 期间安全 suspend，
      success/cancel/failure 后按合同恢复。
- [ ] state 导航重渲染保留 `scrollLeft`/`scrollTop`；选择、新增、删除或切换 symbol
      后 selected state 用 nearest visibility 保持可见，无关刷新不跳回开头。
- [ ] production build 仍是纯静态页面；断网时本地生成、上传、preview 和 ZIP 导出
      可用，不新增 backend、远程处理、credential、telemetry 或资源网络上传。
- [ ] 完成 L2 定向自动化、真实浏览器验收和 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore` 的 versioned generation preset、浏览器安全的纯 RGBA transform
  API，以及现有 Node/Sharp generator 对同一 preset 的消费。
- `apps/symbolseditor` 的本地 image decode/PNG encode、生成/手传 state transaction、
  last-operation-wins、preview/export/reimport。
- toolbar、generic ZIP、Picker 与 generated sources 对现有普通资源 import flow 的复用。
- Picker modal/input lifecycle、双轴 scroll snapshot、selected-state visibility。
- 直接相关 model、UI、ZIP、rollback/lifecycle 测试、README 和领域规则。

### 不包含

- 不合成 layered normal，不抓 Spine/VNI 帧，不推断 value tier，不批量生成全部 symbols，
  也不提供一次同时生成 blur/disable 的合并操作。
- 不加 blur/brightness/格式参数面板，不创建第二份 preset。
- 不改变 symbol/package/assets-map schema，不加 fallback、alias、placeholder 或路径猜测。
- 不让 toolbar 或非目标 Picker 自动绑定；只有“生成”和精确 state 的“上传并使用”
  是显式绑定授权。
- 不放宽 Spine/VNI/ImgNumber/project ZIP 的 closure、version、hash、slot 或 animation。
- 不扩展其它 editor/game/Cocos，不改 assets，不新增依赖或 lockfile，不增加 server/API/
  云存储/登录/credential，不做 undo/redo 或无关 UI 重构。

## 3. 制定计划时的基线

```text
UTC: 2026-07-31T07:39:58Z
HEAD: 9e31d6f1e803d8393ba3873060f5a760ba82a44d
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

读取的规则和依据：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
tasks/templates/task-plan.md
tasks/140-symbolseditor-asset-replacement-and-zip-import.md
tasks/146-symbolseditor-clear-missing-spine-animation-on-replacement.md
apps/symbolseditor/README.md
packages/rendercore/README.md
```

当前代码基线：

- `workspace-app.ts::statesInspectorMarkup()` 的 `.state-nav` 使用 `overflow:auto`，但
  `captureViewState()`/`restoreViewState()` 只保存 `scrollTop`，nav 也没有
  `data-scroll-key`；重渲染会丢横向位置。
- `SymbolsEditorUiSession` 保存 selected/preview state，却没有 selection-change 后一次性
  保证 DOM 可见的 intent。
- toolbar、inline import 和 Picker 共用 `[data-upload-input]` 并直接 `.click()`；
  value 只在 `change` 后清空，无 cancel/origin contract，同文件重选可能不再触发事件。
- Picker 的“上传新资源”回到 `uploadResources()`，但 resource dialog、conflict dialog、
  query/selection/focus 与 busy/stale 没有显式 suspend/resume transaction。
- ordinary files/generic ZIP 已走 `ingestEditorResourceSources()` →
  `prepareSymbolResourceImport()` → review → `commitSymbolResourceImport()`；shared
  `editorresource` 已拥有 add/noop/overwrite/keep-both、suffix 和 collision，无需复制。
- import commit 已返回 candidate project 与 resolved review；生成/手传 binding 可在
  candidate 上复验后一次 replace，不需提前修改 active store。
- `EditorAssetRecord` 已严格识别 PNG/JPEG/WebP；`exportSymbolPackageZip()` 已执行
  rendercore materialize、content addressing 和 exact closure validation。
- 页面目前不能生成。唯一实现是
  `rendercore/scripts/generate-symbol-state-textures.mjs` 的 Sharp `3 × 21` blur 和
  grayscale/`0.72` brightness。
- `editor-artifacts.md` 现行规则明确禁止 app 生成 state texture；本任务需更新该职责，
  但通用 preset/像素算法仍归 rendercore，app 只做 browser codec/UI/transaction。
- 现有测试未覆盖 Picker 内上传、同文件重选、state `scrollLeft`、页面生成或生成 ZIP
  round-trip。

## 4. 需求解释与技术决策

### 需求解释

- “normal 的图片”仅指 `states.get("normal").kind === "image"` 且 exact `imagePath`
  指向 ready image record；不是截图、layer/animation/tier 推导。
- “每个 symbol 的 normal 状态里加 2 个按钮”是两个独立 action：blur 只生成并绑定
  `spinBlur`，disable 只生成并绑定 `disabled`；不遍历其它 symbols。
- “用户自己传”是目标 state 的单图“上传并使用”；多图片/structured ZIP 不猜目标。
- “后面的结果”按最后一次成功提交定义。mutation 串行；失败/取消不算，stale completion
  不能覆盖后发 action。
- “ZIP 能用”要求图片成为正式 workspace asset/canonical state ref，而非临时 canvas、
  object URL 或单独下载。
- “所有上传同一流程”指 ordinary sources 共用 coordinator；project/ImgNumber ZIP 保留
  owner transaction。
- “纯前端”指用户 bytes 只进入浏览器内存、Blob/Object URL 和下载 ZIP；Vite/static
  hosting 只分发前端，不承担处理。

### 关键决策

1. **rendercore 拥有唯一 preset/transform**
   - 新增 strict versioned config，作为 state id、kernel、brightness 的唯一来源。
   - 导出 DOM/Pixi-free RGBA transform；Node/Sharp script 读同一 config，保持现有
     CLI、命名和 manifest 输出。

2. **browser codec 与算法分层**
   - app 用 `createImageBitmap`/canvas 本地 decode/encode，rendercore 只处理 RGBA。
   - decode 后先检查安全 width × height/pixel budget；bitmap、URL、canvas 在
     success/failure/stale/destroy cleanup。

3. **生成和手传都走标准资源事务**
   - generated/manual sources 进入既有 prepare/review/commit，最终 key 只取 resolved
     review，不复制 suffix 或预判 overwrite。
   - candidate 上添加/更新 state binding 并做 authoring/export validation；全部成功才
     replace。overwrite 更新 bytes 保持 key，add/keep-both 改绑 resolved key。

4. **明确 per-state last-operation-wins**
   - 每次 generation 或手传只更新当前目标 state，另一个 state 与其它 symbols 不变。
   - state mutation 串行并校验 action sequence/project revision；旧 key 不自动删除，
     防止破坏其它 refs。

5. **统一 coordinator，保留 owner 特例**
   - 从 `uploadResources()` 抽 sources-based ordinary coordinator，toolbar、picker、
     generated sources 只提供 origin 与可选 post-commit binding。
   - project/ImgNumber ZIP 继续先严格识别，禁止混选或进入普通 callback。

6. **Picker 显式 suspend/resume**
   - 打开 native picker 前保存 origin/context、清 input；处理 change/cancel/request id。
   - review 时暂时关闭 resource dialog但保留 session；结束后恢复 query/selection/focus。
   - 目标 state“上传并使用”要求唯一 ready image；其它 Picker 上传只刷新 candidates。

7. **scroll snapshot 与 selection intent 分离**
   - scroll registry 保存 `{left,top}`，state nav key 包含 symbol identity。
   - 普通 refresh 只恢复位置；selection 真正变化时消费一次 intent，对精确 selected item
     调 `scrollIntoView({block:"nearest",inline:"nearest"})`。

## 5. 职责与合同

- **rendercore config/transform**：严格 preset 与纯 RGBA 输入输出；不读 DOM、project、
  symbol code、filename 或 workspace。
- **Symbols browser codec**：local bytes ↔ RGBA/PNG、pixel budget、临时资源 cleanup；
  不决定 state/key/conflict。
- **generation model**：解析 exact normal、派生 candidate keys、解释 resolved review、
  添加/绑定生成或手传 state、复验 candidate。
- **import coordinator**：ordinary prepare/review/commit、post-commit mutation、
  cancel/stale/error 和一次 store replace。
- **UI session**：picker origin/context/busy/restore、action sequence、selected visibility
  与 scroll；transient state 不进入 ZIP。
- **原子/顺序**：active project 在资源和 binding 全部验证前不变；state mutation 不并发
  提交，last-operation-wins 不依赖 promise 完成时机。
- **隐私/失败**：无 fetch/upload/backend；坏图片、超预算、codec failure、未知 preset、
  unresolved collision、typed incompatibility、stale request 均显式失败。
- **禁止**：不自动选首项、不猜 normal、不静默 suffix、不生成 placeholder、不在 app
  复制 preset/卷积、不绕过 exact closure/hash。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/symbol/state-texture-generation-preset.v1.json
packages/rendercore/src/symbol/state-texture-generation.ts
packages/rendercore/tests/symbol/state-texture-generation.test.ts
apps/symbolseditor/src/io/browser-image-codec.ts
apps/symbolseditor/src/model/state-texture-generation.ts
apps/symbolseditor/tests/state-texture-generation.test.ts
tasks/148-symbolseditor-generated-state-textures-and-upload-ui-fixes-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/symbol/index.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/README.md
apps/symbolseditor/src/model/{editor-project,resource-import}.ts
apps/symbolseditor/src/ui/{workspace-app,ui-session}.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/{app-shell,resource-import,ui-session,zip-io}.test.ts
apps/symbolseditor/README.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

### 原则上不应修改

```text
packages/{editorresource,browserartifactio,vnicore}/**
packages/rendercore/src/{manifest,package,materialize-package}.ts
apps/{imgnumbereditor,popupeditor,gamelayouteditor,game002,game003}/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

若需改 schema、shared workspace API、依赖、lockfile 或其它 consumer，先说明证据与影响，
不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认基线/复现**
   - 重核 HEAD/工作区/规则；真实浏览器复现 upload 与 scroll，判断是否符合计划原因。

2. **共享 generation contract**
   - 新增 v1 preset/parser/export 与纯 RGBA transforms；迁移 Node generator 参数。
   - 测非法 buffer/dimension/state/version、kernel/alpha/brightness 和 CLI parity。

3. **浏览器生成 prepare**
   - 实现受 pixel budget 约束的 decode/encode/cleanup。
   - 按所点按钮从 direct normal 只产出一张目标 PNG source；非支持 normal 返回原因。

4. **统一 import/state transaction**
   - 抽 ordinary sources coordinator，复用 review/commit。
   - 生成/“上传并使用”均按 resolved key 只更新目标 state；复验后一次 replace。
   - 加 input clear/cancel/origin、picker suspend/resume、serialization/stale protection。

5. **接入 UI/scroll**
   - 每个 symbol 的 normal 页增加两个独立生成按钮；目标 states 增加“上传并使用”及
     独立 busy/result feedback。
   - state nav 加稳定 key、双轴 restore 和一次性 selected nearest visibility。

6. **测试 ZIP/交错顺序**
   - 覆盖 add/noop/overwrite/keep-both/cancel、partial failure rollback、same-file、
     picker context、stale/destroy、scroll。
   - 分别覆盖 blur/disabled 的“生成→手传→再生成”和反向顺序，并断言 sibling/其它
     symbols 不变；export/reimport 校验 refs、PNG、map/hash/closure。

7. **文档/验收/报告**
   - 更新两份 README 与两份领域规则；运行 L2、真实浏览器/离线验收，生成 UTC 报告。

## 8. 测试与验收

### 测试原则

- 纯 RGBA 用小矩阵精确验证；Sharp/browser PNG 压缩 bytes 不要求一致，但 preset、尺寸、
  alpha 和像素语义必须一致。
- transaction 比较失败前后完整 project，不只看 toast；last-operation 测 revision、
  binding 与 fingerprint，不以 promise 完成时间代替合同。
- resolved key 必须来自 typed review；不在测试/生产复制 suffix。
- DOM 可 stub codec、file lifecycle、`scrollIntoView`；真实 codec/视觉只由真实浏览器证明。
- ZIP 必须走正式 exporter/importer/rendercore validation，不拼假 manifest。

### 验收级别

`L2`：新增 rendercore public transform contract，Symbols Editor 是直接 consumer，并改变
正式 ZIP 的资源来源/closure；范围可界定，无需整仓 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/state-texture-generation.test.ts tests/symbol/state-texture-generator.test.ts
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor exec vitest run tests/state-texture-generation.test.ts tests/resource-import.test.ts tests/ui-session.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
pnpm --filter symbolseditor build
git diff --check
```

### 人工验收

- Chromium 用 PNG/JPEG/WebP direct normal 生成，确认纵向模糊、降亮灰度、透明边缘、
  preview state 与 ZIP 重导。
- 验证目标 key overwrite/keep-both/cancel；Picker 内 cancel 后重选同一/新/同名文件，
  再按生成→手传→生成确认最后成功结果生效。
- 长 state 列表滚到末尾，选择、上传、生成、改字段、切 symbol，确认 selected 可见且
  无关 refresh 不跳头。
- 页面加载后 DevTools Offline，完成本地生成、“上传并使用”、preview/ZIP；Network
  不出现用户资源上传/远程处理。

### 独立验收建议

`必须`：涉及跨包 public contract、browser pixels、异步 transaction、正式 ZIP。独立复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/state-texture-generation.test.ts tests/symbol/state-texture-generator.test.ts
pnpm --filter symbolseditor exec vitest run tests/state-texture-generation.test.ts tests/resource-import.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
pnpm --filter symbolseditor build
```

并独立完成一次真实浏览器生成/手传/冲突/离线 ZIP round-trip。

## 9. 环境与依赖

- 使用 Node 24/pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不新增依赖；browser codec 用平台 API，算法由 rendercore 提供，Node 继续已有 Sharp。
- 依赖缺失：`CI=true pnpm install --frozen-lockfile`。
- 只有下载失败才设置 `http_proxy`/`https_proxy=http://127.0.0.1:1087` 后重试原命令。
- 不需要 server、数据库、存储、credential 或环境变量。若 native codec 不足并需新依赖，
  先停止并给出最小复现、bundle 影响与替代方案。

## 10. 生成物、文档与规则

- preset v1 是 Node/browser 唯一参数来源；测试校验 parity，禁止复制。
- 页面 PNG 经现有 exporter 计算 SHA-256、size、media type 和
  `assets/<hash>.png`；不手改 map/ZIP。
- 更新 rendercore README（preset/transform/Node/browser 分工）与 Symbols Editor
  README（支持条件、手传、last-operation、冲突、离线/导出）。
- `editor-artifacts.md` 改为 editor 可从 explicit direct normal 调 rendercore 生成；
  `shared-game-runtime.md` 最小记录 rendercore ownership；不改根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行后创建：

```text
tasks/148-symbolseditor-generated-state-textures-and-upload-ui-fixes-<utctime>.md
```

UTC：`date -u +%y%m%d-%H%M%S`。

报告简记最终行为、关键决策、验收、偏差与剩余风险；不收集无关整仓统计。

## 12. 风险、假设与待确认

### 风险

- Canvas 与 Sharp 的颜色管理/压缩可能略有差异；锁定 preset、尺寸、alpha/视觉语义，
  不锁跨 codec 压缩 bytes。
- decoded pixels 远大于文件 bytes；必须在分配多份 buffers/canvas 前检查安全预算。
- modal top-layer 差异需显式 suspend/resume，不能依赖多个 dialog 偶然共存。
- keep-both 改变 key；review 前绑定会悬空，必须只用 resolved result。
- async generation/import 若重叠会反向覆盖；必须 serialization + sequence/revision。
- 每次 render 都 scrollIntoView 会抢用户滚动；只在 selection change 消费一次 intent。

### 假设

- direct normal 支持格式维持 PNG/JPEG/WebP，输出统一 PNG。
- 当前 `3 × 21` blur 与 `0.72` brightness 是权威默认效果。
- 每个 normal 页面固定两个单项按钮；每次只生成当前 symbol 的一个目标 state，不加
  参数面板、合并生成或全 symbols 批处理。
- toolbar/非目标 Picker 只入库；目标 state“上传并使用”和生成是显式绑定。
- last-operation 以成功提交为准，失败/取消不替换此前结果。

### 待确认

无。若真实复现证明 upload 失败另有 typed import/codec 根因，先判断是否仍属统一
coordinator；需改 shared schema/API 时停止说明。

## 13. 完成清单

- [ ] 生成、手传 last-operation、上传统一与 state scroll 均满足，非目标未混入。
- [ ] preset 单一来源，Node/browser parity、pixel budget/cleanup 已验证。
- [ ] overwrite/keep-both/cancel/resolved binding、rollback/stale 无旁路/fallback。
- [ ] preview、ZIP 重导、hash/map/closure 与离线静态页面已验收。
- [ ] README/领域规则、L2 自动化、真实浏览器与 UTC 报告完成。

## 14. 执行会话交接

1. 读取根 `AGENTS.md`、两份领域规则和本计划；
2. 核对 Git/工作区并保留无关修改；
3. 先真实复现 upload/scroll，再按计划实现；
4. 小幅适配在报告记录；schema/shared API/dependency/其它 consumer 扩大先停止说明；
5. 只运行计划的 L2，失败先最小化，不扩大全仓；
6. 完成后生成 UTC 中文报告；
7. 除非用户明确要求，不 commit/push/创建 PR。
