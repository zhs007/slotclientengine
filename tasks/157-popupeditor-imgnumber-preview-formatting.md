# 157 popupeditor-imgnumber-preview-formatting 任务计划

## 1. 目标与完成定义

### 目标

为 Popup Editor 的 award-celebration 渲染预览增加 ImgNumber 数字格式设置：

1. 可配置固定小数位数，默认为 `0`；配置为 `2` 或 `3` 时，整数也必须分别显示 `.00` 或 `.000`。
2. 可选启用千位分隔，默认关闭；启用后整数部分每三位使用 `,` 分组。

两项设置只影响当前页面会话中的 production player 预览文本，不写入
Popup Editor project、`popup.manifest.json`、`assets.map.json` 或导出 ZIP，也不从导入
Popup ZIP 恢复。

### 完成定义

- [ ] 预览区提供“小数位数”和“千位分隔”设置，新开页面默认为 `0` 位小数且不分组。
- [ ] 预览数值 `1234567` 在 `0/2/3` 位小数下分别渲染为 `1234567`、`1234567.00`、`1234567.000`；启用分组后对应显示 `1,234,567`、`1,234,567.00`、`1,234,567.000`。
- [ ] 小数位数为正整数值时仍固定补齐 `0`；千位分隔只改变整数部分，小数点固定为 `.`、分组符固定为 `,`。
- [ ] 设置改变后下次 Play/Replay 使用新格式，不改变 bet/win raw 输入、档位判定、计数进度或动画生命周期。
- [ ] 小数位严格接受 `0..6` safe integer；非法设置、非安全整数金额或 ImgNumber 缺少启用的 `.`/`,` glyph 时显式失败，不 clamp、不回退为无符号文本。
- [ ] 现有 production `amountFormat`、项目页金额合同、manifest 预览、Popup ZIP bytes 和导入恢复行为保持不变。
- [ ] 完成 Popup Editor L1 定向验收、真实 ImgNumber 浏览器视觉验收和 UTC 中文执行报告。

## 2. 范围

### 包含

- `apps/popupeditor` 会话级预览格式状态、设置表单、严格校验和 diagnostics。
- 基于预览 raw 整数的固定小数补零、可选千位分组，以及 `formatAmount` 注入 production award player。
- UI、formatter 传递、Play/Replay 和不进入 ZIP/project 的直接测试。
- Popup Editor README 中的最小预览说明。

### 不包含

- 不修改 `PopupAmountFormat`、Popup manifest schema、parser、package materializer、`assets.map.json` 或 ZIP 结构。
- 不删除或重解释现有项目页 production `amountFormat`；该合同仍由 rendercore/popup 持有并正常导入导出。
- 不改变 preview bet/win 的 non-negative safe integer raw 合同，不接受带小数的 raw 输入，不引入货币、前后缀、负数、科学计数法或 locale 选择。
- 不修改 ImgNumber manifest/glyph layout、资源导入、缺 glyph fallback 或 Pixi sprite 实现。
- 不将预览设置保存到 localStorage、IndexedDB、URL、project draft 或任何旁路 metadata。
- 不修改其它 editor/game app、不新增依赖、不修改 lockfile 或根工具链。

## 3. 制定计划时的基线

```text
UTC: 2026-08-03T10:34:25Z
HEAD: abbe2fc962d270865a31b3f97106c1c757e2973b
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 本规划会话读取了根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/editor-artifacts.md`、`apps/popupeditor/README.md`；`apps/popupeditor` 范围内没有更深层 `AGENTS.md`。
- `PopupEditorApp` 当前只保存 `#previewBetRaw`；`shell()` 的预览控件有 bet/win raw、分辨率、zoom 和 guides，没有 ImgNumber 预览格式状态。精确路径为 `apps/popupeditor/src/ui/app-shell.ts` 的 `PopupEditorApp.bindGlobal()` 与 `shell()`。
- `PopupPreview.rebuild()` 通过 `exportPopupZip()` -> bounded extract -> `importPopupZip()` -> `createPopupPackageResource()` 构建真实 production resource，再调用 `createAwardCelebrationPlayer({ resource })`。因未传 `formatAmount`，现在预览文本完全使用 manifest `amountFormat`。精确路径为 `apps/popupeditor/src/preview/popup-preview.ts::PopupPreview.rebuild()`。
- `createAwardCelebrationPlayer()` 已有可选 `PopupAmountFormatter`，并在每次更新金额时调用；不需要改 rendercore public API。`formatPopupAmount()` 已正确实现固定小数补零和三位分组，可用 `rawScale=1`、`.`、`,` 组成本地预览格式。精确路径为 `packages/rendercore/src/popup/{award-player,amount-format}.ts`。
- `PopupEditorProject.amountFormat` 是正式 manifest 合同：`projectToManifest()` 写出它，`importPopupZip()` 恢复它，项目页可编辑 preset/custom 值。新预览设置不得放入 `PopupEditorProject` 或复用这些 import/export 字段。
- `createPopupPackageResource()` 依 production `amountFormat` 对 ImgNumber 必需字符做 prepare 校验；预览 override 输出了资源不含的 `.` 或 `,` 时，`RenderImageString.setText()` 会以 exact missing-glyph error 失败，不需要增加 fallback。
- `apps/popupeditor/tests/app-shell.test.ts` 使用 preview fake 覆盖表单与指令传递；`tests/preview.test.ts` 已验证 production player、raw input、snapshot 和 cleanup，是 formatter 注入的直接测试入口。
- 当前代码、类型、测试和领域规则已足以确认合同，不需要审计 Git 历史。

## 4. 需求解释与技术决策

### 需求解释

- “小数点位数”解释为预览展示的 fixed fraction digits，不是将 raw 值按 `10^n` 缩放。因此 raw `100` 在两位小数下显示 `100.00`，不是 `1.00`。
- “就算整除”解释为 fraction digits 大于 0 时永远输出小数点和精确位数的尾零；不根据余数隐藏小数部分。
- “千位符号”解释为单个 boolean；启用时固定使用 ASCII comma，不增加可编辑 separator 或 locale 推断。
- 预览设置以 raw 金额作为整数单位，只改 formatter 输出；award stage 计算、threshold 和 player input 继续使用原 raw 整数。
- 导入 Popup ZIP 只替换 project/resource 状态；当前页面的预览小数位和分组开关不被 ZIP 覆盖，刷新页面则回到默认值。

### 关键决策

1. **预览配置只存在 Popup Editor app session**
   - 定义窄的 `PopupPreviewAmountFormat` （`fractionDigits` + `useGrouping`）和默认值，由 `PopupEditorApp`/预览 owner 持有。
   - 不将它添加到 `PopupEditorProject`、clone/store transaction、`projectToManifest()` 或 `popup-zip.ts`，从类型和数据流上保证导入导出不携带。

2. **复用 rendercore formatter，不在 app 复制分组算法**
   - Popup Editor 用 `rawScale=1`、指定 `fractionDigits`、`useGrouping`、`groupSeparator=","`、`decimalSeparator="."`、空 prefix/suffix 和 `rounding="floor"` 调用 `formatPopupAmount()`。
   - 位数与 rendercore 现有 strict contract 一致限制为 `0..6` safe integer；不使用 `Intl.NumberFormat` 引入平台/locale 差异。

3. **通过 player 已有 override 渲染，保持 production resource 路径**
   - `PopupPreview.rebuild()` 继续导出、解压、复验并 prepare 真实 Popup package，只在 `createAwardCelebrationPlayer()` 传入 `formatAmount` callback。
   - callback 读取 preview owner 的当前配置，因此改设置后的 Play/Replay 无需重建 resource/player；正在播放时不做隐式中途重启，后续 tick 使用新格式。
   - player 仍负责计数节奏、跨档、dismiss、snapshot 和 ImgNumber `setText()` 生命周期；app 不复制 runtime 状态机。

4. **区分会话预览格式与正式金额合同**
   - 新控件放在 preview controls 并明确标注“仅预览”；项目页的 production preset/custom 和 manifest preview 保持现状。
   - `tierBoundarySummary()` 仍按 project `amountFormat` 解释正式合同，不被预览 override 污染。

## 5. 职责与合同

- **Popup Editor UI**：拥有会话级设置、默认值、表单绑定和非法值 diagnostics；导入 project 不替换该状态。
- **Popup preview owner**：校验设置并向 production player 注入 formatter，继续拥有 player/resource 的 rebuild、clear 和 destroy。
- **rendercore/popup**：继续拥有通用金额格式算法、award player、ImgNumber layout/setText 与 missing-glyph failure；本任务不改其 public contract。
- **数据/API**：`PopupPreviewAmountFormat` 是 app-private runtime input，不是 versioned schema；输入只含 `fractionDigits: 0..6 safe integer` 与 `useGrouping: boolean`，输出为非空 ImgNumber 文本。
- **失败策略**：非法位数、非安全 raw 金额和缺失 glyph 使用具体 diagnostics 失败；不 clamp、不隐藏小数/分组、不改回 production formatter。
- **禁止行为**：不增加 app 自制 glyph layout/计数状态机，不在 ZIP 加私有字段，不用 localStorage 暗中持久化，不对缺 `.`/`,` 的 ImgNumber 做字体或无符号 fallback。

## 6. 文件范围

### 预计新增

```text
tasks/157-popupeditor-imgnumber-preview-formatting-<utctime>.md
```

### 预计修改

```text
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/preview/popup-preview.ts
apps/popupeditor/tests/app-shell.test.ts
apps/popupeditor/tests/preview.test.ts
apps/popupeditor/README.md
```

若现有 preview controls 在新增标签后无法清晰排布，可最小修改
`apps/popupeditor/src/styles.css`。formatter helper 优先留在 `popup-preview.ts`；只在独立
helper 能明显改善测试边界时新增 `apps/popupeditor/src/preview/amount-format.ts`。

### 原则上不应修改

```text
apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/popup-zip.ts
apps/popupeditor/src/io/resource-import.ts
packages/rendercore/**
packages/editorresource/**
packages/browserartifactio/**
docs/popup-manifest.md
docs/agent-rules/**
AGENTS.md
pnpm-lock.yaml
```

若执行时发现必须改 Popup manifest/public API 才能渲染，应先停止并说明现有
`formatAmount` override 为何不足，不得通过扩大 schema 或在 ZIP 中添加私有字段规避“仅预览”合同。

## 7. 实施步骤

1. **确认执行基线**
   - 重新核对 HEAD/status、本计划、`editor-artifacts.md`、Popup Editor README 和当前 preview/player formatter API。
   - 确认工作区后续变化与本计划的文件/职责边界一致，保留用户无关修改。

2. **建立严格的预览格式合同**
   - 在 preview 模块定义 app-private format type/default/validator 和 formatter helper。
   - 将 raw 值以 `rawScale=1` 交给 `formatPopupAmount()`，固定 `.`/`,` 和空前后缀；非法位数立即抛出具体错误。
   - 测试默认、0/2/3 位、分组开/关、零、三位/四位边界、大整数及非法配置。

3. **注入 production preview player**
   - 为 `PopupPreview` 增加窄的设置更新入口，内部保留 validated immutable snapshot。
   - `rebuild()` 创建 award player 时传入读取当前 snapshot 的 `formatAmount`，不改变 export/extract/import/prepare 流程。
   - 证明设置更新前后 callback 输出、raw `start()` input、ticker snapshot、rebuild owner 替换和 destroy 行为。

4. **接入预览 UI 会话状态**
   - 在 preview controls 增加 `type=number` 的小数位输入（`min=0`、`max=6`、`step=1`、默认 `0`）和默认未勾选的千位分隔 checkbox，文案明确标注“仅预览”。
   - 初始化后将默认值同步给 `PopupPreview`；change 事件严格解析并更新预览 owner，错误进入现有 diagnostics。
   - 保持 preview controls 不进入 `PopupEditorStore` transaction；导入 project 不改值，页面新建/刷新恢复默认。

5. **保护非持久化与现有合同**
   - UI 测试覆盖默认值、0/2/3 位、grouping change 和 preview 调用，并断言 project tab 的 production amount fields 没有被改写。
   - 在导出 mock/manifest 投影中断言新设置不存在；导入另一 Popup project 后断言预览设置仍是当前会话值。
   - 保留 `tierBoundarySummary()` 对 production `amountFormat` 的既有测试期望，不为通过新测试改变正式合同。

6. **文档、视觉验收与收尾**
   - 更新 Popup Editor README，说明控件默认值、raw whole-unit 解释、固定符号、仅会话生效和缺 glyph 失败。
   - 运行第 8 节 L1 定向验收，并用含 `.`/`,` glyph 的真实 ImgNumber 执行浏览器视觉验收。
   - 检查目标 diff 和持久化路径，生成任务 157 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- formatter 测试直接断言完整字符串，包含尾零和千位符位置，不只断言文本包含 `.` 或 `,`。
- 分别覆盖 `999`、`1000`、`1000000`、`0` 和 2/3 位小数，防止分组污染小数部分或遗漏多组 comma。
- preview 测试必须观察传给 `createAwardCelebrationPlayer()` 的真实 formatter callback，不只验证 UI 调用了 setter。
- UI 测试必须证明设置留在 preview owner，导出仍只接收 `PopupEditorProject`，导入替换 project 不覆盖会话设置。
- missing-glyph 依既有 ImgNumber strict runtime 显式失败；不为测试新增 fallback glyph 或放宽 manifest validation。
- DOM/player fake 证明数据流，不冒充真实 Pixi/ImgNumber 视觉验收。

### 验收级别

`L1`。任务只修改 `apps/popupeditor` 的 app-private 预览状态和对现有
rendercore formatter/player API 的调用，不改跨 package public API、schema、生成器或正式交付物，
因此单 package 定向验收充分，不升级 L2/L3。

### 执行会话必须运行

```bash
pnpm --filter popupeditor typecheck
pnpm --filter popupeditor exec vitest run tests/app-shell.test.ts tests/preview.test.ts
pnpm --filter popupeditor lint
pnpm --filter popupeditor build
pnpm --filter popupeditor format:check
git diff --check
```

如定向 Vitest 失败，先缩小到 formatter、preview callback 或 app-shell 事件对应 case，
不立即运行根级 `pnpm test/typecheck/build`。

### 人工验收

1. 使用 Node 24 启动 `pnpm --filter popupeditor dev`，在真实浏览器导入一份同时包含 `0..9`、`.` 和 `,` glyph 的 ImgNumber，完成五档金额绑定并 Build preview。
2. 设 win raw 为 `1234567`，小数位依次设 `0`、`2`、`3`，分组保持关闭；每次 Play/Replay 确认画面和 status 依次到达 `1234567`、`1234567.00`、`1234567.000`。
3. 保持两位小数并启用千位分隔，确认计数过程与终值使用 comma，终值为 `1,234,567.00`，没有分组小数部分或丢失尾零。
4. 切换 bet/win 并触发跨档、Advance、Dismiss 和 Replay，确认只有金额文本改变，档位、计数时长、VNI/Spine 播放与 cleanup 保持。
5. 导出 Popup ZIP，改变预览设置后重新导入该 ZIP；确认 ZIP 不恢复/覆盖预览设置，刷新整个页面后回到 `0` 位小数和关闭分组。
6. 用缺少 `.` 或 `,` glyph 的 ImgNumber 启用对应格式，确认 preview 报出 exact missing glyph，不用空白、字体或无符号文本继续。

### 独立验收建议

`不需要`。本任务不涉及跨包 public contract、credential/服务器数据边界、新的异步 transaction/resource ownership、正式 schema、生成物或 release；真实 Pixi/ImgNumber 视觉效果按上述人工清单验收即可。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；若 shell 没有 Node：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`，不切换 npm/yarn，不主动改版本。
- 只有下载实际失败后，才设置 `http_proxy`/`https_proxy=http://127.0.0.1:1087` 并重试原命令。
- 任务不需要新依赖或 lockfile 变化；如执行时出现，先说明为何现有 rendercore API 和 app toolchain 不足。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、生成器或生成文件，不需要 parity checker。
- 更新 `apps/popupeditor/README.md` 的预览工作流，不修改 `docs/popup-manifest.md`，因为正式 manifest 行为没有改变。
- 新能力不改稳定跨任务职责边界；不更新根 `AGENTS.md` 或 `docs/agent-rules/editor-artifacts.md`。
- 执行证据只写入任务 157 执行报告，不加入 runtime contract 或根规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/157-popupeditor-imgnumber-preview-formatting-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终预览格式行为与实际修改文件；
2. formatter 注入、会话状态和非持久化的关键决策；
3. 计划偏差与实际验收命令/结果；
4. 真实 ImgNumber 人工验收是否完成；
5. 剩余风险与未完成项。

不收集无关 coverage、完整历史矩阵、全仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 预览 override 可能比 production `amountFormat` 需要更多 glyph；这种差异必须以 missing-glyph error 暴露，否则会造成编辑器显示与真实资源能力不一致。
- 格式 callback 在播放 tick 中读取当前设置；播放中改动控件可使下一帧宽度突变，但不应重启计数或注入过时文本。
- 实际 `.`/`,` glyph 的 advance、offset 和 fixed group 由导入 ImgNumber manifest 决定；单测只能证明格式文本和数据流，视觉间距必须用真实资源验收。

### 假设

- preview win/bet 继续使用非负 safe integer raw，新小数位只表示展示补零，不表示 raw scale。
- `0..6` 位限制复用现有 Popup formatter 与 manifest 能力，已覆盖需求中的 `0`、`2`、`3` 位用例。
- 小数点与千位分隔分别固定为 `.` 和 `,`，用户不需要编辑 locale 符号。

### 待确认

无。

## 13. 完成清单

- [ ] 预览小数位和千位分隔行为满足需求与默认值。
- [ ] 预览配置未进入 project、manifest、asset map、ZIP、导入恢复或隐式持久化。
- [ ] production `amountFormat`、raw input、threshold、计数与 player lifecycle 保持。
- [ ] 非法配置与缺 glyph 严格失败，没有 clamp、fallback 或 placeholder。
- [ ] 自动化验收已通过，真实浏览器验收与未完成项已分开记录。
- [ ] README、实际文件范围和 UTC 中文执行报告已按计划收尾。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md`、本计划和 Popup Editor README；
2. 核对 Git 基线和工作区，保留用户后续产生的无关修改；
3. 按计划在 Popup Editor app-private preview 边界实现，不重新扩展 manifest/schema；
4. 小幅适配当前实现时在报告记录，需要修改 public API/ZIP 时先停止说明；
5. 只运行本计划规定的 L1 验收，失败时先最小化复现；
6. 区分自动化与真实 Pixi/ImgNumber 视觉验收，完成后生成 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
