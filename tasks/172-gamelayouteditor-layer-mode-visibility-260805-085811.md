# 任务 172 执行报告

## 结果

已完成普通图层“全局或单一主状态”作用域，并保持旧 Scene Layout v1 数据兼容。缺少 node `gameMode` 的旧数据继续按全局图层读取；新 scoped 图层只在 exact 绑定状态且当前 variant 有 placement 时显示。图层 `order` 始终是全局值，隐藏、状态切换和方向切换都不重排。

## 实现摘要

- rendercore 为普通 node 增加 optional `gameMode`，严格拒绝未知状态、无 `gameModes` 的 scope 和 background scope；stateful Spine 的 `nodeStates` 只覆盖该 mode 实际活跃的 scoped 节点。
- package runtime 在初始化和真实转场 switch commit 中统一更新背景与普通图层可见性；新增独立 `selectAuthoringGameMode()`，用于编辑器直接选择稳定预览状态，不播放或伪造 production transition。
- Game Layout Editor 增加默认勾选的“所有状态有效”和单一绑定状态选择；mode rename 改写引用，仍有 scoped 图层引用时禁止删除。当前编辑状态/预览方向下不可见的节点在大纲灰显但仍可选。
- 编辑状态默认联动右侧稳定预览；真实转场工作区仍使用 production prepare/request 流程。结构性重建后会恢复当前 authoring 状态，不覆盖用户选择的转场目标。
- gamelayoutpkgcli 将全局/legacy 普通节点归入 shared，将 scoped 普通节点仅归入 exact mode；背景归属和全局 order 合同不变。
- 已同步 editor、rendercore、CLI README、manifest 文档和三份领域规则。

## 兼容与计划偏差

- 旧 manifest/ZIP 不需要迁移或批量重写：省略 `gameMode` 即是 canonical 全局语义。
- 安装缺失 workspace 依赖时执行了 `CI=true pnpm install --frozen-lockfile`；未修改 lockfile，也未新增依赖。
- 计划中的 browser 人工验收未执行，按用户要求保留为“待用户验收”。其余实现范围无实质偏差。

## 自动化验收

- `pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- rendercore 定向 Vitest：3 个文件、33 项通过。
- `pnpm --filter gamelayouteditor typecheck`：通过。
- gamelayouteditor 定向 Vitest：7 个文件、117 项通过。
- `pnpm --filter gamelayoutpkgcli typecheck`：通过。
- gamelayoutpkgcli 定向 Vitest：3 个文件、11 项通过。
- 修改文件定向 ESLint：通过。
- 修改文件 Prettier check：通过。
- `git diff --check`：通过。

## 待用户浏览器验收

1. 导入旧 Layout ZIP，确认旧普通图层默认“所有状态有效”，状态切换画面与旧行为一致，导出重导后 order/placement 不丢失。
2. 新建普通图层，取消全局并绑定一个状态；切换编辑状态时右侧画布同步，不显示状态下节点灰显但可选择，order 不变。
3. orientation-focus 下分别关闭 landscape/portrait，确认方向开关位于状态作用域内部，并验证 scope AND variant 的灰显和画布结果。
4. 在转场工作区播放 Spine/Popup 或 video transition，确认 authoring 状态选择没有替代真实转场流程。

## 剩余风险

自动化覆盖了 strict parser、初始化/转场/authoring 可见性、编辑器命令与 UI、ZIP 路径和 CLI owner graph。真实 Pixi 画布观感、浏览器媒体 trusted-click 及完整旧项目交互仍以以上人工验收为准。
