# 150 gameviewer2-local-scene-flow-preview 执行报告

## 结果

已新增 `apps/gameviewer2`：可导入 Game Layout Editor production ZIP，在本地编辑至少两组 scene / otherScene snapshot、逐格 Symbol/value/状态编排，配置编排步骤，并通过一次性 `MessageChannel` 在独立窗口播放。生产依赖仅为 `@slotclientengine/rendercore`，没有接入 netcore、gameframeworks、server round 或 component 配置。

`rendercore` 新增 strict `scene-other-scene-flow` v1 authoring/readiness/runtime facade，直接复用 layout binding 中的 `reelSet + renderMode` 选择既有 standard / grid-cell 转轮。第一条 snapshot 边执行真实 Spin 和落点编排；后续 snapshot 原位替换 occurrence/value 后执行编排；Replay 清空 controller、landing queue 与 spin 状态后从头播放。

## 主要实现

- `apps/gameviewer2`：ZIP/项目导入导出、场景链 Clone/Roll/逐格编辑、otherScene 固定值/权重表/Symbol 筛选、状态编排新建/复制/改名/插入/排序/删除、新窗口预览。
- `packages/rendercore/src/scene-layout/local-scene-authoring.ts`：package 摘要、公开轮带 Roll、number weight Roll、strict project parser、hash/capability readiness 和默认项目。
- `packages/rendercore/src/scene-layout/local-scene-flow.ts`：本地流程 owner、有限逐格状态编排、真实 landing delta、后续 settled commit、Replay/destroy。
- standard/grid-cell reel 保留原有“spin 中禁止普通 state request”合同，新增只允许已落点 occurrence 的窄请求路径；旧测试未被改写。
- `SceneLayoutPackageRuntime` 新增 landing drain 和 snapshot commit；prepare/commit 失败会恢复原 scene/value，避免半提交画面。
- 新增 `docs/agent-rules/gameviewer2-local-flow.md`、根规则路由以及 app/rendercore README 说明。

## 计划偏差

- 新增 workspace app 必须在 `pnpm-lock.yaml` 增加 importer，因此实际修改 lockfile；没有新增仓库中不存在的第三方版本，app devDependencies 与现有工具链一致。
- 首轮实现曾放宽已有 reel state request；完整测试暴露兼容性后改为新增 landed-only API，保留既有调用语义。
- Vite 生产包主 chunk 约 1.18 MB（gzip 约 322 KB）并产生 chunk-size warning；首版保持单入口，未在本任务引入代码拆分。

## 自动验收

- `pnpm --filter @slotclientengine/rendercore --filter gameviewer2 typecheck`：通过。
- `pnpm --filter @slotclientengine/rendercore test`：通过，78 files / 607 tests，覆盖率门槛通过。
- `pnpm --filter gameviewer2 test`：通过，4 files / 7 tests；lines 76.31%、branches 76.96%、functions 81.35%。
- `pnpm --filter @slotclientengine/rendercore --filter gameviewer2 lint`：通过。
- `pnpm --filter @slotclientengine/rendercore --filter gameviewer2 build`：通过。
- `pnpm --filter @slotclientengine/rendercore --filter gameviewer2 format:check`：通过。
- `git diff --check`：通过。

## 未执行的人工验收

未在本会话使用真实 Game Layout Editor production ZIP 做浏览器视觉验收。仍建议分别使用一个 standard ZIP 和一个 grid-cell ZIP，确认：逐列/逐格落点时序、appear 完成后 normal、otherScene value 展示、第三组 snapshot 的 occurrence 连续性以及 Replay 后资源无残留。

未 commit、未 push、未创建 PR。
