# 244 rendercore-symbol-state-batch-event 执行报告

## 结果

任务 244 已完成代码、共享 event catalog、EditorCore/Editordemo/Gamelayout Editor 接入、定向测试、文档与领域规则。
真实浏览器验收按用户约定未由本执行会话运行，留给用户处理。

执行基线：

```text
UTC report: 2026-08-24T10:27:57Z
HEAD: 2a9ddb64560c900c17d2fd56f7423667632ca63d
branch: detached HEAD
initial status: only tasks/244-rendercore-symbol-state-batch-event.md was untracked
```

## 已实现

- `playMainReelSymbolStateBatch()` 的每个 request 新增 additive optional `symbol`。显式 symbol 必须属于当前 Symbols package
  且实际出现在该 request 的 positions 中；省略时从预检后的 positions 选择最小 symbol code 对应的 symbol。
- 新 event family 为 `symbols-state-batch`，canonical address 为
  `gamelayout:/symbol-package/<binding-id>/symbolsstatebatch/<symbol>/<state>`。每个 request 派发一次，detail 只含
  binding、symbol、state，不含 position；同一调用先解析全部 request/address，再按 request 顺序派发，最后启动 symbol mutation。
- 既有逐 occurrence `symbol-state` 的 exact/wildcard `entered|exited` event 保持独立。standard 与 grid-cell reel
  共用 batch accepted observer；空/非法 request、代表 symbol 失败或预先 abort 不派发 batch event，也不部分启动。
- production runtime 与 editor inspector 继续共用唯一 catalog compiler；同时补齐 legacy singular `symbolPackage`
  resource 的 runtime event catalog，使旧 manifest 与 plural bindings 都能枚举新旧 symbol event。
- EditorCore 增加“批量图标状态”family 标签。Editordemo 的共享 event dialog 与 Gamelayout Editor 的 event-audio dialog
  都能同时看到“Symbol 状态”和“批量图标状态”；后者测试使用完整 mapped Layout + Symbols closure。
- event-audio 可对一个 batch event 播放一次 voice。既有 per-position legacy Symbol cue 保持兼容；未启用
  `ignoreLegacyAudio` 且同时配置 event audio 与 legacy cue 时仍会听到两套有意保留的音频。
- README、runtime address 文档与最小领域规则已同步；无 schema、生成器或 lockfile 变化。

## 与计划的实现差异

- 为保证 bare standard/grid-cell reel 都在完整预检后提供同一 accepted 边界，在已有
  `RenderReelSymbolStateObserver` 上增加 optional `observeBatch`，没有建立第二套 Scene Layout reel wrapper。
- Editordemo 没有 app-local event family 表，因此生产代码无需修改；新增 app 级共享 dialog 测试证明两个 family 可见。
- 用户明确承担浏览器验收，因此报告不把未运行的 Chromium 步骤记为通过。

## 自动验收

```text
PASS  pnpm --filter @slotclientengine/rendercore typecheck
PASS  pnpm --filter @slotclientengine/rendercore build
PASS  pnpm --filter @slotclientengine/rendercore exec vitest run \
        tests/scene-layout/runtime-address.test.ts \
        tests/scene-layout/package-runtime.test.ts \
        tests/reel/render-reel-set.test.ts \
        tests/reel/render-grid-cell-reel-set.test.ts
      4 files, 90 tests passed
PASS  pnpm --filter @slotclientengine/editorcore --filter editordemo --filter gamelayouteditor typecheck
PASS  pnpm --filter @slotclientengine/editorcore exec vitest run tests/adapters-and-ui.test.ts
      1 file, 16 tests passed
PASS  pnpm --filter gamelayouteditor exec vitest run tests/event-audio-dialog.test.ts
      1 file, 1 test passed
PASS  pnpm --filter editordemo exec vitest run tests/demo-project.test.ts
      1 file, 5 tests passed
PASS  git diff --check
```

工作树起初没有 `node_modules`；按 frozen lockfile 安装已有依赖后执行验收，未修改 `pnpm-lock.yaml`。

## 待用户完成

在真实浏览器中分别打开 Editordemo 与 Gamelayout Editor，导入包含 Symbols state 的完整 Game Layout 项目并确认：

- event family 同时出现“Symbol 状态”和“批量图标状态”；
- 批量 family 只选择 Symbols binding、symbol、state，不出现 scope、x/y、entered/exited；
- 保存后的地址为 `.../symbolsstatebatch/<symbol>/<state>`；
- 给该 batch event 绑定 once effect 后，一组 positions 只播放一次 event 音效。
