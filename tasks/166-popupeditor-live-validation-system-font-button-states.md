# 166 popupeditor-live-validation-system-font-button-states 任务计划

## 1. 目标与完成定义

### 目标

改进 Popup Editor 的项目配置反馈、按钮交互状态与普通 Spine Popup 提示默认行为：用户编辑 `project id` 时立即看到 lowercase kebab-case 校验结果，不再等到 Build preview 或导出才发现；所有按钮具有清晰的悬停、按下、键盘焦点、禁用反馈，语义 tab 具有明确选中态；启用单行提示但未选择自定义字体时，由 `rendercore/popup` 使用系统字体正常渲染，且 Popup ZIP 不包含字体资源。

### 完成定义

- [ ] `project id` 为空或不符合 lowercase kebab-case 时，输入过程中立即显示红色边框、可访问的非法状态和就地错误文案；改回合法值后即时清除，不需要点击 Build preview。
- [ ] manifest parser、即时 UI 校验、preview 和 export 使用同一个 `project id` 合同；preview/export 继续拒绝非法 id。
- [ ] 普通操作按钮在 hover、pointer active、keyboard focus-visible、disabled 时有清晰且一致的视觉反馈；主 tab 与获奖档位 tab 的当前选中态明显区别于未选中态。
- [ ] 一次性操作按钮点击后不伪造持久 selected 状态；tab 继续以现有 `.active`/`aria-selected` 表达持久选择。
- [ ] 普通 Spine Popup 启用 prompt 且字体保持默认时，可生成 production preview、导出并重导；运行时使用 `rendercore` 定义的系统字体栈。
- [ ] 系统字体不表现为资源引用，不进入 `resources`、`assets.map.json`、content-addressed payload 或 ZIP exact closure。
- [ ] 显式选择 package-owned WOFF2/WOFF/TTF/OTF 时保持现有 FontFace、hash closure、复用与释放行为；旧的含 `prompt.font` Popup ZIP 继续兼容。
- [ ] 自动化验收通过；真实浏览器中的输入反馈、系统字体显示和 ZIP 内容由用户验收，执行报告保持“待用户验收”直至收到结果。

## 2. 范围

### 包含

- `apps/popupeditor` 的 project id 即时校验状态、提示字体默认选项、draft/manifest 转换、Popup ZIP round-trip 和相关样式/测试。
- `apps/popupeditor` 全局 button/file-action 的 hover、active、focus-visible、disabled 样式，以及主 tab/档位 tab 现有语义 selected 状态的视觉增强。
- `packages/rendercore/popup` 的 popup id 单一校验入口、optional `spine.prompt.font` strict schema、系统字体渲染默认值、typed reference rewrite 和 exact resource closure。
- Popup manifest、Popup Editor/rendercore README 与两份领域规则中稳定合同的最小同步。

### 不包含

- 多行提示、字体 family 名手输、字体选择器、系统字体探测、按平台固定同一字形或把系统字体文件打包。
- 修改 prompt 文案、区域、颜色、order、start/loop/end 状态机或自定义 FontFace 生命周期的既有语义。
- Game Layout Editor 的新编辑控件、游戏 app 业务逻辑、资源转码、schema version 升级或旧字段静默迁移。
- 顺手重构通用表单框架、其它 editor 的 id 输入或完整仓库样式。
- 为 Build、Play、删除、确认等一次性命令增加持久业务状态、异步 loading 状态或成功动画；本任务只补交互状态反馈。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T06:24:19Z
HEAD: 4e9705610c2fe17a1987b3d490b15a27a71325dd
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`docs/agent-rules/editor-artifacts.md`、`docs/agent-rules/shared-game-runtime.md`、`tasks/templates/task-plan.md`；`apps/popupeditor` 与 `packages/rendercore` 下没有补充 `AGENTS.md`。
- 当前 `packages/rendercore/src/popup/manifest.ts` 的 `identifier()` 是 Popup id 权威校验，规则为 `^[a-z0-9]+(?:-[a-z0-9]+)*$`；它只在完整 `parsePopupManifest()` 时运行，没有可供表单单字段调用的入口。
- 当前 `apps/popupeditor/src/ui/app-shell.ts` 只在 `#project-id` 的 `change` 事件写 draft；`projectMarkup()` 没有 `aria-invalid`、字段错误文案或 invalid class，错误主要在全局 diagnostics、preview/export 时才可见。
- 当前 `apps/popupeditor/src/styles.css` 只为普通 `button`/`.file-action` 定义静态背景、边框和 cursor；主 tab/档位 tab 有 `.active`，但通用按钮没有 hover、pointer active、focus-visible、disabled 反馈，选中 tab 的背景差异也较弱。
- 当前 `PopupEditorProject.spine.prompt.font` 已用 `string | null` 表达未选字体，但 `projectToManifest()` 在 prompt enabled 且值为 `null` 时抛出“尚未绑定字体”；UI 首项也写为“请选择字体”。
- 当前 `PopupPromptSpec.font`、`parsePrompt()`、resource used-set、`rewriteSpineReferences()` 与 `createSpinePopupPlayer()` 都假定 font key 必填；`createPopupPromptText()` 则要求外部传入 family，并使用 `[customFamily, "sans-serif"]`。
- 当前 `apps/popupeditor/src/io/popup-zip.ts` 已按 manifest `resources` 计算 exact closure；导入 prompt 时直接恢复必填 `manifest.spine.prompt.font`。只要 manifest 不引用系统字体，现有 map/payload 机制无需创建虚拟字体 entry。
- 当前测试覆盖自定义字体 manifest/closure、FontFace 与 prompt fit、Popup Editor prompt authoring，但没有 fontless prompt、系统字体 runtime、无字体 ZIP round-trip 或 project id 就地反馈。
- 未审计 Git 历史；当前 schema、实现、测试、README 与已完成 task 163 已足够确定合同。

## 4. 需求解释与技术决策

### 需求解释

- “修改完如果不合法就直接提示”解释为：输入内容变化时立即验证并在字段附近反馈；用户离开字段、Build preview、Play 或 export 都不是触发反馈的前提。
- id 合法范围保持现有 lowercase kebab-case：一个或多个小写 ASCII 字母/数字段，以单个 `-` 分隔；空字符串、大写、空格、下划线、前后连字符和连续连字符均非法。
- 非法值仍可留在 editor draft 中供用户继续修正，但 production preview/export 保持 strict failure；不能自动小写、替换字符或静默恢复旧值。
- “默认不给字体”解释为 prompt 已启用但没有显式 `font` 字段；不是引用一个名为 system 的资源，也不是向 ZIP 写入操作系统字体。
- “button 没有选中和点击状态”解释为统一补齐可观察的 hover/按下/focus/disabled 状态，并增强已有 tab 的 selected 状态；普通命令按钮没有可持久化的选中语义，点击松开后恢复默认状态。
- 用户已确认系统字体是 `rendercore` 的默认功能，浏览器验收由用户执行。

### 关键决策

1. **由 rendercore 暴露 Popup id 单字段校验**
   - 在 `packages/rendercore/src/popup/manifest.ts` 提供可复用的 id validator，并让完整 parser 与 Popup Editor 都调用它，避免 UI 复制正则后与 production schema 漂移。
   - UI 在 `input` 事件更新红框、`aria-invalid` 与紧邻错误输出；`change` 继续写入 draft。重新渲染时根据当前 draft 再计算状态，避免 tab 切换后丢失反馈。

2. **用 `prompt.font` 缺省表达系统字体**
   - `PopupPromptSpec.font` 改为 optional；缺省是唯一 canonical 系统字体表达。显式 `null`、空字符串、未知 key 或非 font resource 继续严格失败。
   - 保持 manifest version 1：旧 package 的必填式 `font` 是新合同的合法子集，不需要 alias、migration 字段或 version bump。

3. **系统字体选择与渲染只属于 rendercore**
   - `createPopupPromptText()` 接受 optional custom family；存在时保持 `[customFamily, "sans-serif"]`，缺省时使用 rendercore 固定的系统字体栈 `[“system-ui”, “sans-serif”]`。
   - Spine Popup player 只有在 `prompt.font` 存在时才查询 prepared font resource；缺省直接创建系统字体 Text。系统字体不 acquire/release FontFace，也不引入额外 lifecycle owner。

4. **资源图只收集显式自定义字体**
   - manifest used-set、direct path collector、namespace/flatten rewrite、Popup Editor live-key closure 只在 `font` 存在时处理它。
   - 若作者导入了字体但 prompt 选择系统字体，该资源仍是编辑库中的未绑定资源，不进入 production ZIP；若 manifest `resources` 人为保留未引用字体，parser 继续以 orphan/unused 显式失败。

5. **Popup Editor 明确展示默认项**
   - 字体下拉首项改为“系统字体（默认，不打包）”；新 project 和导入 fontless prompt 均恢复 `font: null`。
   - 启用 prompt 不自动选择导入列表首项；用户选择自定义字体后才写 manifest key，取消选择则回到系统字体。

6. **用 CSS 状态统一按钮反馈，不增加伪业务状态**
   - 普通 `button` 与可点击 `.file-action` 使用一致的颜色变化：hover 提亮背景和边框，`:active` 使用更饱和颜色并给出轻微按压反馈，`:focus-visible` 提供不会只依赖颜色的 outline，`:disabled` 降低对比度并取消 pointer/按压反馈。
   - `[aria-selected="true"]`/现有 `.active` 的主 tab和档位 tab 使用稳定 selected 配色；selected 与 pressed 分开，避免一次性操作按钮点击后错误保留状态。
   - 尊重 `prefers-reduced-motion`：若使用短 transition，reduced-motion 下关闭非必要动画；不使用会导致布局跳动的边框宽度变化。

## 5. 职责与合同

- **rendercore manifest**：拥有 Popup id、optional prompt font、resource kind、unknown key、unused resource 与 canonical v1 输出合同。
- **rendercore runtime**：拥有系统字体栈、自定义 FontFace family chain、Text fit、单行校验和 prompt 生命周期；app/editor 不复制字体 fallback 或 Pixi Text 创建逻辑。
- **Popup Editor**：拥有 draft、表单即时错误表现、显式字体选择与 production preview/ZIP 调用；不读取本机字体文件，不伪造 system font resource。
- **Popup Editor presentation**：CSS 拥有按钮 hover/pressed/focus/disabled/selected 表现；DOM 的 `.active`/`aria-selected` 只由现有 tab state 驱动，普通命令不新增伪 selected state。
- **数据/API**：`PopupPromptSpec.font?: string`；缺字段表示系统字体，存在时必须引用当前 manifest 中 `kind="font"` 的 exact resource。`null` 不作为兼容值。
- **资源生命周期**：系统字体没有 prepare/rollback/destroy；显式 package font 继续由 Popup package resource 的 FontFace registry 管理，最后 owner 销毁时释放。
- **失败策略**：非法 id、非法显式 font、缺资源、wrong kind、unused resource、坏 ZIP/hash/path/size 和其它既有错误继续尽早显式失败。
- **禁止行为**：不自动改写 id，不通过 preview 成败猜字段错误，不打包系统字体，不添加 placeholder font，不把空字符串/null 当 alias，不因系统字体模式放宽自定义字体校验。
- **禁止行为**：不只靠 hover 表达可操作性，不移除键盘 focus ring，不让 disabled 控件响应按压样式，不用持久颜色冒充不存在的业务 selection。

## 6. 文件范围

### 预计新增

```text
tasks/166-popupeditor-live-validation-system-font-button-states-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/{types,manifest,prompt-text,spine-player,package-resource}.ts
packages/rendercore/tests/popup/{manifest,prompt-text,spine-player,package-resource}.test.ts
packages/rendercore/README.md

apps/popupeditor/src/model/project.ts
apps/popupeditor/src/io/popup-zip.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/styles.css
apps/popupeditor/tests/{project,app-shell}.test.ts
apps/popupeditor/README.md

docs/popup-manifest.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

若现有 `project.test.ts` 已能完整承载 ZIP round-trip，可不新增或修改其它 test 文件；执行报告记录实际文件差异。

### 原则上不应修改

```text
apps/gamelayouteditor/**
apps/gamelayoutpkgcli/**
packages/rendercore/src/popup/font-resource.ts
packages/rendercore/src/spine/**
packages/editorresource/**
packages/browserartifactio/**
packages/vnicore/**
packages/logiccore/**
apps/game002/**
apps/game003/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

若实现要求增加 schema version、改变 Layout ZIP rewriter API、修改 FontFace registry 或引入依赖，属于明显范围扩张，必须先说明原因。

## 7. 实施步骤

1. **确认执行基线**
   - 重读根规则、两份领域规则、本计划与当前 Popup manifest/editor 入口，核对 HEAD/status。
   - 先固定旧含自定义字体 prompt、无 prompt Spine Popup 与 award-celebration Popup 的 parser/ZIP/player 回归。

2. **建立 id 单一校验入口与 UI 即时反馈**
   - 从 rendercore popup manifest 暴露单字段 validator，完整 `parsePopupManifest()` 改用同一入口，错误文本保持明确。
   - `projectMarkup()` 根据当前 id 输出字段状态和就地错误容器；绑定 `input` 事件即时更新 border、错误文案和 `aria-invalid`，绑定 `change` 持久化 draft。
   - 测试合法/空值/大写/空格/下划线/连续或首尾连字符，以及修改为非法、再修正、切 tab 重渲染后的状态；证明过程中没有调用 preview。

3. **统一按钮交互和选中反馈**
   - 在 `styles.css` 为 button/file-action 增加 hover、active、focus-visible、disabled 状态，颜色、outline、cursor 与可选短 transition 保持一致；避免改变按钮尺寸。
   - 增强主 tab和档位 tab 的 `.active`/`aria-selected="true"` 配色，同时保持现有 tab semantics、tabindex 和切换逻辑。
   - 用 app-shell DOM 测试保护 selected/disabled 语义来源；具体颜色、按压观感、鼠标与键盘反馈交给用户浏览器验收，不写脆弱的 CSS 像素快照。

4. **把 fontless prompt 纳入 strict manifest/resource contract**
   - 更新 `PopupPromptSpec` 和 `parsePrompt()`：`font` 可缺省，存在时继续 exact font resource 校验，显式 null/空值/wrong kind 失败。
   - 更新 used resource、direct paths、namespace/flatten rewrite，只改写存在的 font key；覆盖带字体和无字体两条路径及未引用字体拒绝。
   - 保持旧 manifest canonical parse 结果、custom font closure 与 FontFace tests 不变。

5. **在 rendercore runtime 接入系统字体默认值**
   - `createPopupPromptText()` 缺省 family 时使用 `system-ui/sans-serif`，显式 family 继续保持 custom-first chain。
   - Spine player 对 custom font 执行 prepared resource kind 校验，对 fontless prompt 不查资源也不触发 FontFace；两种模式共享现有 default/translated text、fit、segment visibility 与 destroy 逻辑。
   - 测试系统字体 style、fontless start/replay、显式 text、自定义字体回归和非法显式资源失败。

6. **接入 Popup Editor draft、ZIP 与生产预览**
   - `projectToManifest()` 在 prompt enabled/font null 时省略 `font`，不再抛“尚未绑定字体”；资源列表只包含显式 custom font。
   - `importPopupZip()` 将缺省 font 恢复为 `null`；字体下拉提供清晰的系统默认项并允许从 custom 切回默认。
   - 覆盖 fontless prompt project-to-manifest、export/import/export、`assets.map.json`/payload 无字体 entry，以及 custom font round-trip 无回归；production preview 继续走真实 rendercore player。

7. **同步合同文档并执行验收**
   - 更新 Popup manifest 文档、Popup Editor/rendercore README 和最小领域规则，明确缺省/自定义字体、系统字体不打包、平台字形差异与即时 id 反馈。
   - 运行 L2 定向命令；生成 UTC 中文执行报告，列出用户浏览器验收步骤并保持待验收状态，不替用户宣称浏览器结果。

## 8. 测试与验收

### 测试原则

- id 测试必须证明输入时即时反馈、修正时即时恢复、production parser 仍拒绝非法值；不能只断言 CSS class 存在。
- fontless 测试必须检查 manifest 结构、used-resource/direct-path/rewrite、prepared player 与 ZIP entries，不能只断言 preview mock 被调用。
- custom font 路径继续覆盖 kind、FontFace family chain、closure 与 round-trip，避免 optional 分支绕过 strict failure。
- 按钮自动化测试保护 `aria-selected`、tabindex 和 disabled 的语义来源；hover/active/focus-visible 的真实视觉差异由用户在浏览器验证，不用 happy-dom 冒充渲染结果。
- 系统字体的具体字形与 metrics 依赖浏览器/操作系统；自动化只证明 rendercore 选择的 family stack、fit/lifecycle 和无字体 payload，不冒充视觉验收。

### 验收级别

`L2`。本任务修改 `@slotclientengine/rendercore/popup` public type/parser、正式 Popup v1 schema 与 ZIP exact closure，并由 Popup Editor 直接消费；不修改根工具链、lockfile或 release，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor test
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
pnpm --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter popupeditor build
pnpm --filter @slotclientengine/rendercore --filter popupeditor format:check
git diff --check
```

- 第三条只做 public type 直接 consumer 编译复验；不因此扩张这些 consumer 的实现或运行其全量测试。
- 失败时先运行单个相关 test file 或最小 typecheck 定位，不立即扩展到整仓命令。

### 用户人工验收

以下浏览器验收由用户执行；执行会话提供可复现步骤，并在报告中标为“待用户验收”。

1. 在“项目”页逐步输入空值、`Bad_Id`、`bad--id` 和合法 `bad-id`，确认非法时无需 Build preview 即出现红框/就地文案，合法后立即恢复。
2. 创建普通 Spine Popup，完成 Spine 资源和三段动画绑定，勾选“启用提示”但保留“系统字体（默认，不打包）”；Build preview 并播放默认/临时单行文案，确认可见、单行且区域 fit 正常。
3. 导出并查看 ZIP：`popup.manifest.json` 的 prompt 没有 `font`，`resources`、`assets.map.json` 和 `assets/` 没有系统字体；重导后仍显示系统字体选项并可 preview。
4. 选择一个自定义字体再导出/重导，确认 manifest/resource/payload 仍完整；切回系统字体后再次导出，确认该字体若无其它引用则不进入 production ZIP。
5. 依次用鼠标悬停、按住和松开 Build/Play/删除/确认按钮，再用 Tab 键聚焦并按 Space/Enter；确认颜色/按压/focus ring 清楚，disabled 的新增图层/overlay 按钮明显不可用且没有按压反馈。
6. 切换顶部“资源/动画/项目”和五个获奖档位，确认当前项保持明显 selected 配色，未选中项恢复；普通 Build/Play/导出按钮点击后不保持 selected 配色。

### 独立验收建议

`建议`。本任务涉及 public manifest type 和正式 ZIP closure，但不改变 credential、安全边界、异步 transaction 或自定义 FontFace ownership。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor test
pnpm --filter popupeditor typecheck
git diff --check
```

浏览器视觉结果仍以用户验收为准。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只运行 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改 lockfile；现有 Pixi Text、manifest parser、Popup resource/ZIP 和 DOM 表单能力足够。
- 自动化不下载或读取操作系统字体文件；系统字体由真实浏览器按 rendercore family stack解析。

## 10. 生成物、文档与规则

- 本任务不修改 YAML 或生成文件，不需要生成器命令。
- 更新 `docs/popup-manifest.md`：`prompt.font` 缺省表示 rendercore 系统字体，存在时必须引用 package font；两种模式的 closure 示例必须准确。
- 更新 `apps/popupeditor/README.md` 和 `packages/rendercore/README.md`，说明即时 id 校验、按钮交互反馈、系统字体默认值、自定义字体与 ZIP 边界。
- 最小更新 `editor-artifacts.md` 与 `shared-game-runtime.md`，把“prompt 只接受 package-owned font”修正为“可使用 rendercore 系统默认或显式 package-owned font”，并保留自定义 FontFace ownership 规则。
- 不把 UI 颜色、具体错误文案、任务证据或测试命令追加到根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/166-popupeditor-live-validation-system-font-button-states-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终 manifest/API、实际修改文件、id UI 反馈、button 状态、system/custom font closure、自动化命令结果、计划偏差与剩余风险；用户完成前，六项浏览器验收均记录为“待用户验收”。

## 12. 风险、假设与待确认

### 风险

- `PopupPromptSpec.font` 变为 optional 后，仓库内直接 consumer 若未经窄化读取 `.font` 会出现类型错误；以定向搜索与 consumer typecheck 处理，不用 non-null assertion 掩盖。
- `system-ui` 的实际 family、字形、fallback 与 metrics 随操作系统和浏览器变化；合同只保证使用系统字体栈和区域 fit，不保证跨平台像素一致。
- UI 工作区会在 store transaction 后整体重渲染；若 invalid 状态只保存在临时 DOM class 中，tab 切换或 `change` 后可能丢失，因此 markup 必须从 draft 重新推导。
- 主 tab、档位 tab 和普通 action button 共享基础样式但语义不同；选择器优先级若处理不当，hover/active 可能覆盖 selected 状态或 disabled 仍显得可点击。
- optional font 若在 used-set、typed rewrite 或 closure 任一处仍按必填处理，会导致 fontless ZIP 失败；反向错误则可能把未绑定 custom font 泄漏进 production ZIP。

### 假设

- 系统字体默认栈为 `system-ui` 后接 `sans-serif`，由 rendercore 固定；用户不要求选择某个操作系统字体名称。
- id 修改时保留用户输入供继续修正，不自动规范化或拒绝 draft transaction；严格阻断点仍是 production preview/export。
- 自定义字体资源可留在 Popup Editor 资源库中但未绑定；production ZIP 只导出当前 manifest exact closure。
- 按钮“选中”只适用于已有 tablist 中的主 tab与档位 tab；其它 button 仅有瞬时 pressed 和 focus 反馈。

### 待确认

无。用户已确认浏览器验收自行执行，系统字体不打包且由 rendercore 提供默认行为。

## 13. 完成清单

- [ ] project id parser 与即时 UI 使用单一 lowercase kebab-case 合同。
- [ ] 非法 id 红框、就地文案、`aria-invalid`、修正恢复与重渲染状态受测试保护。
- [ ] 普通按钮 hover/pressed/focus-visible/disabled 与 tab selected 状态清晰，语义未混用。
- [ ] fontless prompt strict schema、system font runtime、typed rewrite 与 exact closure 正确。
- [ ] 系统字体不进入 manifest resources、assets map 或 ZIP payload。
- [ ] 旧无 prompt、自定义字体 prompt 与 award-celebration Popup 无回归。
- [ ] public API、测试、README、manifest 文档和领域规则已同步。
- [ ] 指定 L2 自动化与独立复验完成，用户浏览器验收保持明确状态。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`editor-artifacts.md`、`shared-game-runtime.md` 和本计划；
2. 核对 Git 基线与工作区，保留用户无关修改；
3. 按 optional font + rendercore system font、id 单一校验入口与语义化 button 状态实现，不重新发明替代 schema或伪 selected 状态；
4. 小幅适配当前实现时在报告记录，重大 public API/ZIP/文件范围扩张时先停止说明；
5. 只运行计划规定的 L2 验收，失败先最小化复现；
6. 不把自动化的 family stack 断言当作用户浏览器视觉验收；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
