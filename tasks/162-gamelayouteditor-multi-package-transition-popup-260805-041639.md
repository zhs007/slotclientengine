# 162 Game Layout Editor 多包库与转场前弹窗执行报告

## 结果

任务已完成代码与自动化 L2 验收。Game Layout Editor 的 Symbols/Popup dependency 现在可按不同 manifest id 真正并存：每个包在同一扁平 filename-key workspace 中拥有稳定 root/leaf keys，同 id 再上传走替换并保留既有 mode/transition binding 与 Popup placement，提交后只回收没有其它 owner 的旧 keys。

每个 game mode 继续可独立选择 Symbols package 和 award-celebration Popup。每条 Spine 有向转场新增可选 `preludePopup`：配置后先保持 source mode 播放普通 Spine Popup，用户点击只请求结束，等待 production player 完整越过 loop 边界并播放完 end，随后才启动原 Spine overlay；未配置时保持直接转场。video overlay 与 prelude 的组合被 strict parser 明确拒绝。

production export 仍以 manifest 可达图为权威：未被 mode、transition 或显式 programmatic binding 引用的 Symbols/Popup 不进入 ZIP；logical owner 保持独立，最终 `assets.map.json` 继续按完整 SHA-256 合并相同物理 payload。CLI transition group 包含 prelude closure，并记录 Spine Popup 的 `usedByTransitions`。

## 主要修改

- `packages/rendercore/symbol` 与 `packages/rendercore/popup`：新增 typed flat-key namespace materialization/rewrite，避免多个包的 sentinel、entrypoint、atlas、贴图或 nested JSON 相互覆盖。
- `apps/gamelayouteditor` dependency commands：同 id 替换复验并只覆盖 owner 独占 keys；删除/替换后按普通资源、Symbols 与 Popup 全 owner 图执行 GC。
- `packages/rendercore/scene-layout`：Spine transition 新增 strict `preludePopup`、`popup | before-switch | after-switch` snapshot phase、`activePreludePopup`、高层 dismiss API 和 popup → overlay 生命周期编排。
- Game Layout Editor transition inspector/preview：普通 Spine Popup 下拉、空选直接转场、运行阶段文案与“结束转场前弹窗”控制；ZIP 重导恢复 transition-only Popup，不误注册为 programmatic Popup。
- `apps/gamelayoutpkgcli`：transition group 合并 prelude exact closure；`spine-popup` group 新增 `usedByTransitions`，initial 只包含 initial source edge 或显式 programmatic Popup。
- Scene Layout/Editor/CLI/rendercore README 与三份领域规则已同步。

## 自动化验收

- 四个目标 package `typecheck`：通过。
- 四个目标 package `build`：通过；Vite 仅报告既有 dynamic-import 与大 chunk warning。
- rendercore：81 files、649 tests 通过。
- Game Layout Editor：22 files、173 tests 通过。
- Game Layout Package CLI：6 files、19 tests 通过。
- gameframeworks：13 files、87 tests 通过。
- 合计 122 test files、928 tests 通过。
- 四个目标 package `format:check`：通过。
- `git diff --check`：通过。

定向回归额外覆盖：多 Popup id 的独立 keys 与同 id 替换隔离、Symbols/Popup namespace rewrite、prelude id/type/video strict failure、重复 dismiss、popup complete 前 source/displayed mode 不变、complete 后才启动 overlay，以及 CLI group schema parity。

## 计划偏差与剩余验收

- 实现使用 manifest id 作为稳定扁平 key 前缀，没有创建 `dependencies/**` 目录；相同 bytes 在 physical SHA-256 payload 层去重。该方案比为每次 collision 分配顺序 suffix 更稳定，也保证同 id 替换能定位 owner；文档与领域规则已按此合同同步。
- 没有修改 Symbols Editor、Popup Editor 内部 authoring、game002/game003 业务触发、production assets、lockfile 或根工具链。
- 用户明确表示浏览器验收由用户执行，因此本报告不把 build、单测或 fake runtime 记作真实视觉验收。
- 待用户人工确认：连续导入多个同内部文件名的 Symbols/Popup ZIP；BaseGame/FreeGame 分别绑定不同 Symbols/BigWin；转场前弹窗循环中点击后完整 End 再播 overlay；清空 prelude 后直接转场；同 id 替换保持引用；导出/重导后未引用包消失且已引用包无串包。

基线 HEAD：`41279e7c78894b5d0f8d8866e8985e0e36ca2f26`（detached worktree）。未 commit、未 push。
