# 任务 101：symbols editor workflow redesign 执行报告

## 1. 结论与状态

- UTC 报告时间：`2026-07-18 04:01:12`
- 分支：`main`
- 起始及当前 HEAD：`02ca3591845e6982e0c9487385ec913c8389a50a`
- 实现、自动化测试、全仓 lint/typecheck/test/build 已完成。
- 根级 `format:check` 被任务范围外的既有格式问题阻断，任务 101 涉及文件和包的格式检查均通过，详见第 10 节。
- 按用户要求，本报告不代替浏览器人工验收；用户首次验收发现 package Blob 图片缺少显式 Pixi parser，已修复并补自动化回归，仍待用户刷新后复验，因此在用户签收前不宣称任务 101 完整验收完成。
- 执行期间曾误删用户为下一任务新放入、未被 Git 跟踪的 `assets/game002-s3/0-2.png` 至 `9-2.png` 共 10 个文件。当前工作区、废纸篓、常用下载目录、Spotlight 索引和打开文件句柄均无法恢复，必须由用户从原始来源重新放回。本任务没有用替代图片或生成图片掩盖该问题。

## 2. 环境和起始状态

- 仓库：`/Users/zerro/github.com/slotclientengine`
- Node：`v24.14.0`，来自 Codex bundled runtime。
- pnpm：仓库要求的 `10.0.0` cached runtime。
- 初始 `git status --short` 只有未跟踪的计划文件：`tasks/101-symbols-editor-workflow-redesign.md`。
- 直接使用环境中另一 pnpm 版本的首次尝试因 package-manager 版本不匹配及 registry metadata 网络失败而终止；随后固定使用仓库要求的 pnpm 10，没有修改 lockfile 或改用 npm/yarn。

报告生成前的 `git status --short`：

```text
 M agents.md
 M apps/game003/tests/assets.test.ts
 M apps/gamelayouteditor/tests/imported-symbol-package.test.ts
 M apps/symbolseditor/README.md
 M apps/symbolseditor/src/model/editor-project.ts
 M apps/symbolseditor/src/preview/symbol-preview.ts
 M apps/symbolseditor/src/styles.css
 M apps/symbolseditor/src/ui/app-shell.ts
 M apps/symbolseditor/tests/editor-project.test.ts
 M apps/symbolseditor/tests/zip-io.test.ts
 M apps/symbolsviewer/tests/symbol-assets.test.ts
 M docs/symbol-package.md
 M packages/rendercore/src/symbol/ani.ts
 M packages/rendercore/src/symbol/index.ts
 M packages/rendercore/src/symbol/manifest.ts
 M packages/rendercore/src/symbol/package.ts
 M packages/rendercore/src/symbol/vni-animation.ts
 M packages/rendercore/tests/symbol/manifest.test.ts
 M packages/rendercore/tests/symbol/package.test.ts
?? apps/symbolseditor/tests/preview-layout.test.ts
?? packages/rendercore/src/symbol/introspection.ts
?? packages/rendercore/tests/symbol/introspection.test.ts
?? tasks/101-symbols-editor-workflow-redesign.md
```

本报告文件自身在上述快照之后新增。

## 3. 修改范围与 ownership

### `packages/rendercore`

- `symbol/package.ts`：允许 `resources: []`；保持 entrypoint/资源精确闭包；transparent-only package 可建立 catalog 和 `RenderSymbol`。
- `symbol/manifest.ts`：按 manifest exact path 解析 normal/state/layer/keyframe/VNI/Spine 资源；支持任意安全子目录和同 basename 不同目录；顶层 state 改为稀疏允许集；保留调用方显式 `requiredStates` 严格策略；新增正式 `empty` animation spec。
- `symbol/vni-animation.ts`、`symbol/ani.ts`：显式 empty state 隐藏 base/state/underlay/overlay，并按 once/loop 生命周期完成；离开 empty 后恢复可见性；它不作为资源错误 fallback。
- 新增 `symbol/introspection.ts`：browser-safe VNI/Spine/atlas introspection，输出 VNI schema/duration/stage/assets、Spine 4.3 exact animations/slots、atlas pages，并校验 single-page skeleton/atlas/texture bundle。
- `symbol/index.ts`：公开 introspection API。

### `apps/symbolseditor`

- `model/editor-project.ts`：改为资源库、上传批次、项目 state catalog、per-symbol typed draft、typed state visual、value/cascade draft 和纯编译/反编译入口，不再以 raw manifest 为主要可变模型。
- `ui/app-shell.ts`：重做 resource-first 两栏 UI；资源字段、Spine animation/slot 均为受过滤下拉；实现 display set、per-symbol states、custom states、valuePresentation 和 cascadePresentation 结构化表单。
- `preview/symbol-preview.ts`：固定 all-symbol/single-state gallery；实现 code order、fit、25%..400% zoom、Replay、preview value，以及 configured/empty/missing/error cell。
- `styles.css`：配套两栏、资源库、状态卡和预览样式。
- ZIP IO 沿用 bounded/deterministic shared 实现，导入成功后才替换项目，导出前用真实 `SymbolPackageResource` 严格验证。

### 兼容性测试和文档

- `apps/gamelayouteditor/tests/imported-symbol-package.test.ts`：新增 `resources: []` transparent-only package 导入回归。
- `apps/symbolsviewer/tests/symbol-assets.test.ts`、`apps/game003/tests/assets.test.ts`：把旧 filename-guess 预期改为新 exact-manifest-path 合同；仍保留缺失 exact resource 的失败断言。
- 更新 `apps/symbolseditor/README.md`、`docs/symbol-package.md`。
- 更新根级 `agents.md`，明确 editor 资源库/typed draft/per-symbol/value/cascade ownership，rendercore arbitrary-path/sparse-state/introspection/empty ownership，以及 editor 不生成 state texture、preview 不执行编排。
- game002/game003 production manifest、game config、生成文件和美术均未按任务 101 修改；`apps/game003/tests/assets.test.ts` 只是回归测试变更。

## 4. 最终 typed model 与编译规则

核心模型分为：

1. `EditorAssetLibrary`：canonical path -> bytes/kind/metadata/batch/diagnostics。
2. `EditorStateDefinition`：基础 preset 加 custom `once/once` 或 `stable/loop`。
3. `EditorSymbolDraft`：code、included、scale、priority、stateOrder、states、value/cascade。
4. `EditorStateVisual`：`empty | image | layered-image | spine | vni | static | builtin | activeSpine | empty-state`。

编译时按 numeric code 稳定排序，只输出 included symbols；scale 显式输出，priority 为 0 时省略；顶层 `states[]` 从实际 image state 和 legacy metadata 稳定派生；资源闭包只收集最终 manifest 的 direct/indirect refs；UI selection、zoom、upload batch 和 unused assets 不进入 ZIP。

新项目的 normal typed visual 是 explicit empty，编译为：

```json
{
  "version": 1,
  "states": [],
  "symbols": {
    "A": {
      "normal": {
        "kind": "transparent",
        "width": 160,
        "height": 160
      },
      "scale": 1
    }
  }
}
```

对应 package：

```json
{
  "version": 1,
  "kind": "symbol-package",
  "id": "fixture",
  "cellSize": { "width": 160, "height": 160 },
  "entrypoints": {
    "gameConfig": "gameconfig.json",
    "symbolManifest": "symbol-state-textures.manifest.json"
  },
  "resources": []
}
```

ZIP 仍精确包含三个 JSON entrypoint，并可确定性导出、重新导入和创建 `RenderSymbol`。

## 5. rendercore 合同

- arbitrary path：manifest 引用是唯一绑定来源；不扫描或拆分 `${symbol}.${state}` 文件名，不做 basename fallback；未引用 module 被忽略。
- nested/same-basename：`art/a/icon.png` 与 `art/b/icon.png` 分别按 exact path 解析。
- sparse state：顶层 `states[]` 只表示允许的 texture state id；每个 symbol/value reel state 可缺省；已声明 path 缺资源仍立即失败。
- strict caller：确需全 symbol state 的生成器可显式传 `requiredStates`，而 package/editor 不再隐式要求全量。
- empty animation：`{ "kind": "empty", "durationSeconds": positive }` 不收集资源；隐藏既有 art；once 上报 completion，loop 上报 boundary；缺图片/VNI/Spine 时绝不自动切到 empty。
- Spine：只接受 official 4.3.x；single-page atlas 必须有且仅有一页并匹配所选 texture；animation/slot 保留 exact case。
- VNI：严格识别项目、duration/stage/asset refs；indirect assets 进入 exact closure。
- package image Blob URL：统一以 `{ src, loadParser: "loadTextures" }` 调用 Pixi Assets，不能依赖无扩展名 `blob:` URL 自动选择 parser；所有 package-local normal/state/layer/keyframe 纹理加载均复用该入口。

## 6. 资源库与 UI 行为

- 多文件和目录上传均保留 canonical package path，每次上传形成 editor-only batch。
- 批次先整体分类/校验；任一 path 冲突时整批失败，不留下半批数据。
- 同 path 不静默覆盖；只有显式 Replace 更新 bytes/metadata，并保留引用。
- 删除 referenced asset 会失败并列出引用；unused asset 可删除且不会进入 export。
- 图片解析 PNG/JPEG/WebP mime 与尺寸；JSON 严格分类 VNI/Spine，无法识别时显示错误；atlas 显示 pages。
- 文件名永不自动绑定 symbol/state；所有 image/layer/keyframe/VNI/Spine skeleton/atlas/texture/animation/value refs 使用下拉。
- 合法的 font family、custom state id 等非资源字段仍使用文本输入。
- editor 不生成 blur/disabled，不 canvas filter，不复制 normal，不调用 state texture generator。

## 7. states、value 和 cascade

- game config symbols 按 code 排序；新项目默认全 included、仅 explicit empty normal、scale 1、priority 0；支持全选/全不选/反选。
- normal 固定且不可删除；其它 state 可从项目目录添加、上下移动、删除；被 cascade 引用时阻止删除。
- custom state 只允许 validated id 和固定 lifecycle 组合，不可覆盖基础 state。
- normal Spine/VNI 可同时保留 explicit base visual（empty/image/layered）。
- stable/once 的 Spine loop 由 state definition 派生；不提供自由 loop checkbox。
- `activeSpine` 只用于 value symbol；builtin 只在 rendercore 有明确实现的 state 暴露。
- valuePresentation 可编辑 defaults、reel normal/reel sparse states、tiers/thresholds、Spine transform、font/image text、slot/prefix 和 preview value；tier animations/slots 取 skeleton 交集。
- cascade 支持 group 和 sequentialCollect；summary mode 由 playback mode 派生；state 下拉按当前 symbol capability 和 once/loop 生命周期过滤；order 为非负安全整数。
- preview 只播放当前单一 state，不执行 cascade/sequence/reel/Nearwin/timing。

## 8. production 与旧格式 fixture

- game002 manifest -> typed draft -> compiled manifest 通过 strict parser，保留 additional states、CN 四档 valuePresentation、activeSpine、image value、Num slot、group/sequential cascade 和 legacy settings。
- game003 manifest -> typed draft -> compiled manifest 通过 strict parser，保留图片/Spine/VNI 混合、renderPriority，以及 H2-H5 缺 appear 的合法差异。
- rendercore production fixture 对 game002/game003 package closure、catalog/runtime 初始化回归通过。
- 任务 100 格式依据起始 HEAD 的旧 schema 构造确定性 ZIP：`states/settings/A.png/A.spinBlur.png/A.disabled.png`；导入后 state order、legacy metadata 和三份 manifest exact refs 均保留，没有 filename-driven rebinding。
- gamelayouteditor 同时通过普通图片 package 与 transparent-only empty-resource package 导入测试。

## 9. all-symbol preview

- 移除 single/gallery toggle；固定 code-ordered all display symbols。
- 默认 state 为 normal；统一 Replay 同边界重播具有该 once state 的 cells。
- 自适应 columns、Fit all、缩放按钮和 slider；zoom clamp 为 25%..400%；手动 zoom 不改 manifest scale，state rebuild 不强制重置，viewport resize 重新 fit。
- missing state 显示“未配置”，explicit empty 显示“空”，校验失败显示 error；三者不以 normal 冒充。
- 有效 cell 继续通过临时 strict package、catalog、`RenderSymbol`、animation resolver 和 value controller 运行。
- revision token 阻止 stale rebuild 覆盖新状态；替换项目和 destroy 时释放 RenderSymbol/resource/player/texture/Object URL owner。

## 10. 自动化验收

专项结果：

| 范围              | format/lint/typecheck/test/build | 测试与 coverage                                                                          |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| browserartifactio | 全通过                           | 1 file / 15 tests                                                                        |
| rendercore        | 全通过                           | 52 files / 317 tests；87.90% statements、80.29% branches、93.74% functions、88.23% lines |
| symbolseditor     | 全通过                           | 3 files / 11 tests；27.32% statements、23.84% branches、27.05% functions、28.14% lines   |
| symbolsviewer     | lint/typecheck/test/build 通过   | 2 files / 17 tests；86.51% statements                                                    |
| gamelayouteditor  | lint/typecheck/test/build 通过   | 9 files / 37 tests；82.92% statements                                                    |
| game002           | typecheck/test/build 通过        | 18 files / 95 tests；86.57% statements                                                   |
| game003           | typecheck/test/build 通过        | 27 files / 135 tests；92.52% statements                                                  |

根级结果：

| 命令                | 结果                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git diff --check`  | 通过                                                                                                                                                                                                               |
| `pnpm lint`         | 26/26 packages 通过                                                                                                                                                                                                |
| `pnpm typecheck`    | 26/26 packages 通过                                                                                                                                                                                                |
| `pnpm test`         | 26/26 packages 通过                                                                                                                                                                                                |
| `pnpm build`        | 26/26 packages 通过；仅既有 Vite chunk-size warning                                                                                                                                                                |
| `pnpm format:check` | 未通过：首个失败为 `apps/reelsviewer/eslint.config.cjs`，该包共报告 16 个既有文件；同时 `apps/uiframeworksviewer` 报告 6 个既有文件。它们均不在本任务 diff 中，未擅自格式化。任务 101 涉及包的 format check 通过。 |

构建/类型检查只产生既有 ts-node experimental/deprecation 和 Vite chunk-size warning，没有 production file diff。

## 11. 浏览器人工验收（用户执行，当前待签收）

以下项目没有用 jsdom 单测冒充人工实播，均待用户按计划第 13 节执行并填写结果：

- [ ] 首次反馈复验：刷新开发页，重新给 WL 选择上传图片；确认不再出现 `Assets ... blob:... could not be loaded as we don't know how to parse it`，且 WL 正常显示。修复后 rendercore 317 项、symbolseditor 11 项及双方 format/lint/typecheck/build 已通过。
- [ ] 空项目：game003 config -> all empty -> 无资源导出 -> 重导入 -> fit/zoom。
- [ ] 任意命名图片：unused、不自动绑定、下拉绑定、exact manifest/ZIP closure。
- [ ] Spine：metadata、exact animation 下拉、normal/appear/win 实播、错版本/错 page/错 texture 显式失败。
- [ ] VNI：L1 project + assets、range、真实 win、缺 indirect asset 精确报错。
- [ ] per-symbol/custom/cascade：缺 state 占位、生命周期过滤、引用删除保护、preview 不执行编排。
- [ ] valuePresentation：game002 CN 四档、Num slot、preview value、缺 image 不回退 font。
- [ ] 生命周期：快速 rebuild 无旧结果闪回，replace/delete/import/destroy 无 stale canvas/player/texture/Blob URL。

在上述项目由用户确认前，最终验收状态为：**自动化通过，浏览器待用户签收**。

## 12. 已知限制与后续事项

- 用户必须从原始来源恢复下一任务的 `assets/game002-s3/0-2.png` 至 `9-2.png`；这些文件不属于任务 101，恢复后应保持未纳入本任务 diff。
- symbolseditor 当前 bundle 超过 500 kB，构建仅警告；本任务没有为此改变加载边界。
- symbolseditor coverage 因大型 DOM/Pixi shell 未全量单测而较低；关键 model/ZIP/preview geometry、shared runtime 和 production fixture 已覆盖，真实 Pixi/Spine/VNI UI 操作由浏览器验收补齐。
- 当前 Spine manifest/resource contract仍是 single-page atlas；multi-page 会显式失败，没有静默取第一页。
- 根级格式基线问题建议单独任务修复，避免把 22 个无关文件混入任务 101。
