# 273 editor-legacy-audio-authoring-removal 执行报告

## 1. 执行基线

```text
UTC: 2026-08-31T04:52:37Z
HEAD: 1d01127b5cb678ab3159fc2f575d937686003217
branch: detached HEAD
```

执行开始时工作区仅有本任务计划文件，未覆盖用户的其它修改。

## 2. 最终实现

- Game Layout Editor 删除 per-mode BGM、root programmatic effect、legacy ignore 开关及对应命令和预览入口；全局 Event 音频、音频文件导入、声音解锁和 production preview 保留。
- Game Layout canonical v7 固定导出空 `audio.music/effects/programmaticEffects`、无 mode `bgm`、`eventAudio.ignoreLegacyAudio=true`，合法 Event bindings 与其共用音频资源保留。
- Symbols Editor 删除 loose audio 导入、state cue、发声 symbol、AudioRuntime 与 owner-local audio draft；canonical v3 固定导出空 root audio 且不 author `audioCues`。
- Popup Editor 删除 tier/segment cue、音频导入/试听、AudioRuntime 与 owner-local audio draft；canonical v9 固定导出空 audio。
- 三种旧 package 均先使用既有 strict parser、assets map/hash/closure 完整校验，再迁移旧配置、清理仅由旧音频拥有的 payload，并在导入成功提示中显示移除数量；迁移后的 candidate 再通过正式 manifest/export builder 校验。
- Symbols/Popup 删除 `@slotclientengine/audiocore` direct dependency；`pnpm-lock.yaml` 只删除对应两个 importer 的六行依赖记录。
- 保留 AudioCore/RenderCore 历史 parser/runtime compatibility；Game Layout 不改写 nested Symbols/Popup owner manifest。

主要修改范围：

```text
apps/gamelayouteditor/{src,tests,README.md}
apps/symbolseditor/{src,tests,README.md,package.json}
apps/popupeditor/{src,tests,README.md,package.json}
docs/agent-rules/{editor-artifacts,scene-layout}.md
packages/rendercore/tests/symbol/package.test.ts
pnpm-lock.yaml
```

## 3. 关键决策与计划偏差

- shared v7/v3/v9 schema 与 runtime 未修改；Editor 通过 latest schema 要求的空 legacy container 表达新 authoring policy。
- GC 按迁移后的 typed owner/reference 计算，不按扩展名猜测。Game Layout 中 legacy 与 Event 共用的 asset/bytes 会保留。
- 为匹配 Symbols latest v3，更新了 `packages/rendercore/tests/symbol/package.test.ts` 的 latest-normalization 断言（v2 → v3）。这是整仓测试发现的直接 consumer 测试适配；未修改 RenderCore production code。
- 计划列出的部分测试文件无需修改；实际测试集中在直接覆盖迁移、closure、UI 移除和 canonical export 的文件。

## 4. 自动验收

通过：

- `gamelayouteditor`、`symbolseditor`、`popupeditor` 定向 typecheck。
- 三个 app 定向 lint。
- 无 coverage 的 app 全量 Vitest：Game Layout 25 files / 142 tests，Symbols 11 / 89，Popup 4 / 38。
- 迁移测试复验：Game Layout audio 4/4、Popup project 16/16。
- RenderCore Symbols package 直接 consumer：14/14。
- 三个 app 的 production build 与 format check。
- 根 `pnpm build`：42/42 packages。
- `git diff --check`。
- 残留搜索确认旧 UI/command/preview owner 已移除；仅保留 Event focus 的 BGM 术语和历史 import migration 读取。

整仓 L3 已知阻断（均已最小化，未扩大本任务修复范围）：

- `pnpm typecheck`：既有 `packages/uiframeworks/tests/test-helpers.ts:36` test double 缺少四个 `GameLogic` 方法。
- `pnpm lint`：既有 `apps/underwater3ddemo/src/model-viewer.ts:1` 的 `AnimationClip` 仅作为类型使用。
- `pnpm format:check`：既有 `apps/fate-thread-demo/src/render/fate-thread-mesh.ts` 未通过 Prettier；本任务目标文件的 format check 已通过。
- `pnpm test`：沙箱外运行后 RenderCore 1086 个断言全部通过，但全局 branch coverage 76.92% 低于 80% 阈值，Turbo 因 coverage gate 停止。目标 app 的无 coverage 全量测试均通过；Game Layout 自身 coverage 命令也存在相同的既有全局阈值问题。

## 5. 人工验收

按用户要求，浏览器与听觉验收未由本执行会话运行，待用户完成：

1. Game Layout 新建/旧 v7 导入、Event 音频播放、导出重开和 legacy-empty manifest。
2. Symbols 旧 v3 cue 迁移摘要、无音频控件/播放、非音频 state/layer/value/ImgNumber 保持。
3. Popup award/Spine v9 cue 迁移摘要、无音频控件/播放、动画/overlay/文字/金额保持。
4. Game Layout 导入仍含旧 cue 的 Symbols/Popup dependency，确认 nested owner 未被改写且 legacy cue 不自动播放。

## 6. 剩余风险与未完成项

- 自动测试覆盖 strict-before-strip、canonical export 与 owner-only payload 清理；真实浏览器 AudioContext、实际旧包和听觉行为仍以用户人工验收为最终证据。
- 打开并重新保存旧 owner package 会有意删除 legacy audio authoring 和仅由其拥有的 bytes；UI 已提供数量摘要，但该数据迁移不可在新 Editor 中恢复编辑。
- 除上述人工验收和仓库既有 L3 gate 外，本任务没有已知未完成实现项。
