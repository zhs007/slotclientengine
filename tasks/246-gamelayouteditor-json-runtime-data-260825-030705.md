# 246 gamelayouteditor-json-runtime-data 执行报告

## 结果

任务 246 的自动化实现与 L2 验收已完成。Game Layout Editor 现在可显式导入、替换和以程序键绑定 opaque JSON data；RenderCore 可通过 `SceneLayoutPackageResource.loadJsonData(key)` 按 exact key 读取深度冻结的 object/array；CLI 与 mapped production ZIP 只改写 typed path，不改写数据内容。Scene Layout latest 保持 v5，既有 v1–v5 与 Symbols `gameConfig` 路径保持可用，不做数据迁移或自动 source fallback。

真实浏览器验收按用户要求未由本执行会话运行，见“人工验收”。

## 实现范围

- RenderCore：新增 JSON value/parser、`runtimeResources` 的 `json` kind、exact closure、eager/lazy load、成功 cache、失败重试、destroy 竞态处理与 `loadJsonData()`；JSON 不创建 Object URL、RenderObject 或 runtime address。
- Game Layout Editor：新增 program-only JSON resource、独立批量导入、同 filename key 替换、程序键绑定/解绑、非视觉 Assets UI、latest v5 导出与重导。
- production ZIP / CLI：JSON data payload 保持原始 bytes；filename key/path 可按 typed owner 映射；每个 JSON program key 进入独立 `runtime-resource:<key>` deferred group。
- Gameframeworks：重导出 JSON public types，并用中性本地轮带/权重 fixture 演示 app-owned strict parser 边界。
- 文档：同步 RenderCore、Editor、CLI、Gameframeworks README 及 scene-layout/editor-artifacts/shared-game-runtime 稳定规则。

未修改游戏 app、production assets、Symbols schema、外部 pixicrave/piximinecart2 仓库、package manifest、lockfile 或根工具链。

## 关键决策与计划适配

- 不升级 Scene Layout version；共享 `runtimeResources` parser 对 v1–v5 识别新增 kind，旧文档无 binding 时不生成或迁移数据。计划中曾写成“v1–v4 维持既有 kind capability”，执行时按用户的无迁移原则修正为共享 additive parser。
- JSON 只保证语法、UTF-8、object/array root、有限 JSON value 与 deep freeze；轮带列数、symbol code、权重规则由 app-owned parser 负责。
- `gameConfig` 与 Game Layout JSON 是并行、显式选择的数据源。共享层不根据文件存在、同名或失败结果自动覆盖/fallback。
- 测试发现首次 lazy load 非法 JSON 后 raw bytes 仍会留在 cache；实现已改为 JSON 完整解析成功后才提交 bytes/value cache。
- 旧 Editor ZIP 的非法 filename 迁移不能在 canonical rewrite 前 strict parse；opaque JSON owner 收集改为只读 typed shallow inspection，旧迁移测试恢复通过。

## 自动化验收

- Node 24 环境下执行 frozen install；首次受 sandbox 网络限制，授权后 `CI=true pnpm install --frozen-lockfile` 成功，lockfile 未变化。
- RenderCore 定向 Vitest：8 files、76 tests 全部通过，覆盖 manifest、旧版升级、JSON parser/lazy cache/destroy、package resource、runtime address 与 RenderObject 拒绝。
- Game Layout Editor 定向 Vitest：JSON/ZIP 最终 25 tests 通过；同轮运行的 validation、app-shell、resource-picker 测试也通过。期间发现的旧 filename migration 回归已修复并定向复验。
- Gamelayout package CLI 定向 Vitest：3 files、22 tests 全部通过，覆盖 opaque bytes、path rewrite、asset group 与端到端 package flow。
- Gameframeworks facade Vitest：1 file、2 tests 全部通过；直接 `tsc --noEmit` 通过。
- 四个目标 package 的顺序 L2 typecheck 通过：RenderCore、Gamelayout Editor、Gamelayout package CLI、Gameframeworks。
- `pnpm --filter gamelayouteditor build` 通过。Vite 仍报告既有 dynamic/static import 与大 chunk warning，不影响构建成功，本任务未扩大到拆包优化。
- Prettier 已作用于本任务修改文件；最终 `git diff --check` 在报告生成后执行。

未运行根级 lint/test/build/coverage，符合 L2 最小直接依赖链策略。

## 人工验收（用户执行，尚未完成）

1. 在真实浏览器分别导入含公开 `localReels` 与 `numberWeights` 的 JSON，确认只出现在 Assets，不能建图层/背景；非法 JSON 同批导入不留下资源。
2. 只绑定其中一个为 `spin-config`，导出并重导 ZIP；确认 key/value 保留、未绑定 JSON 不进 ZIP、详情没有伪造 runtime address。
3. 从 production package resource 调用 `loadJsonData("spin-config")`，经游戏 strict parser 得到 typed 配置；确认 nested 值不可修改，wrong key/kind 显式失败。

## 剩余风险与后续项

- 本任务没有把 game002 或 pixicrave 切换到 Layout JSON。实际游戏接入仍需单独确定 JSON schema、program key 与 app source 配置，并保留现有 `gameConfig` 分支。
- generic JSON parser 不验证轮带或权重业务语义；任何 consumer 都必须紧接 `loadJsonData()` 调用自己的 strict parser。
- 最终人工浏览器结果尚待用户确认；除此之外没有已知未完成实现项。
