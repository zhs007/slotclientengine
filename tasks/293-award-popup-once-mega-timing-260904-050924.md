# 293 获奖 Popup Mega once 计时执行报告

- UTC：2026-09-04 05:09:24。
- 基线：`b74f179c140c6810bc3c4d2f4e27d4a5dd10f5c7`，detached HEAD；开始时仅有本任务未跟踪的计划文件。
- 实现与定向自动化完成。用户明确负责浏览器验收，本次未启动浏览器，不将自动化结果当作视觉验收。

## 实现结果

1. manifest 保持 v9，在 `awardCelebration` 增加可选 `onceMegaCountDurationSeconds` 和 `finalAmountHoldDurationSeconds`，均保存秒数。
2. 新增共享 `award-timing.ts`：资源加载后补齐默认值，once 使用 Mega 总时长的 0.66/0.33，segmented 使用 Mega end 时长；显式值优先，包括 0 秒停留。输入 manifest 不被修改。
3. 仅 Mega 全部 VNI 为 once 且最终超过 Mega 阈值时拟合末段金额；继承入档速度、非负加速，速度约束无法容纳目标时间时提前完成，不再进入旧减速尾段。
4. 最终金额展示使用既有 `dismissing` 阶段；最低停留与 end/once 动画并行，等待较长者。动画先结束也保留最终金额；长帧按边界消费时间，队列与 round completion 不提前结束。
5. Popup Editor 开放 award VNI 的 once/segmented 选择，项目页新增秒数配置和恢复默认。导出/重导保留秒数，缺字段的已有包自动补齐。
6. 历史 normalization、namespace rewrite 和 CLI typed rewrite 保留新增字段；未升级 schema 版本、修改 lockfile 或生产美术。

## 文件范围与决策

- RenderCore：Popup data types/parser/normalizer、资源 loader、金额 motion、award player、公共 helper 导出及对应测试。
- Popup Editor：项目 model、模式与项目 UI、ZIP IO、项目及 DOM 测试；preview 直接复用原 runtime，无独立状态机。
- Game Layout CLI：`reference-rewriter.ts` 仅增加 award 项目字段展开保留，并增加定向断言；未修复无关 Popup Object 分支。
- 文档：rendercore/Popup Editor README、`editor-artifacts.md` 和 `shared-game-runtime.md` 的冲突条款。
- 多 Mega VNI 按计划聚合，混合模式不启用 once 拟合；无 Mega VNI 的项目缺省最低停留为 0，仍遵循实际末档动画 drain。
- once 切回 segmented 时初始化为整个 VNI timeline 的循环范围，用户再编辑分段边界；不猜测资源中不存在的 start/end 标记。
- 更新了依赖“下一帧才处理 end”的旧测试断言：同一长帧已覆盖计数、停留和动画完成时允许当帧关闭；动画 update 的时间片总和仍等于宿主 delta。

## 自动化验收

环境为 Node 24.14.0 / pnpm 10。初次沙箱下载遭 EPERM，停止后通过自动审批在锁定依赖和仓库约定代理下完成 `CI=true pnpm install --frozen-lockfile`；lockfile 未变化。

| 命令                                                                                                                                                                    | 结果                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli typecheck`                                         | CLI 触发下述既有错误；RenderCore、Popup Editor 完成                                |
| `pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor exec tsc -p tsconfig.json --noEmit`                                          | 三个包通过；已复用此前完成的依赖构建，补齐被 CLI 失败中断的直接消费者验收          |
| `pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup tests/scene-layout/package-runtime.test.ts tests/scene-layout/configured-round-adapter.test.ts` | 23 文件、277 项通过                                                                |
| `pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup/package-resource.test.ts tests/scene-layout/package-runtime.test.ts`                            | 最后补充资源默认值和 FIFO 停留验证后，2 文件、43 项通过；与上一行有重叠，新增 2 项 |
| `pnpm --filter @slotclientengine/rendercore exec tsc -p tsconfig.json --noEmit`                                                                                         | 最后新增测试后通过                                                                 |
| `pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/app-shell.test.ts tests/preview.test.ts`                                                         | 3 文件、36 项通过                                                                  |
| `pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts`                                                                                       | 14 项通过；因实际修改 typed rewrite 而追加                                         |
| `pnpm --filter popupeditor build`                                                                                                                                       | 通过，含直接依赖构建；Vite 提示部分 chunk 大于 500 kB                              |
| 本任务文件 Prettier 检查、`git diff --check`                                                                                                                            | 通过                                                                               |

### 既有 CLI 类型错误

`apps/gamelayoutpkgcli/src/asset-groups.ts:566` 附近与 `src/reference-rewriter.ts:176` 附近共有 7 项类型错误：
代码将可能为 `SceneLayoutPopupObjectResourceSpec` 的值当作 Spine 读取 `skeleton/atlas/textures`。

将 HEAD 的 CLI 源码和根 tsconfig 导出到 `/tmp/task293-cli-baseline`，在同一已构建依赖环境执行
`pnpm --filter gamelayoutpkgcli exec tsc -p /tmp/task293-cli-baseline/apps/gamelayoutpkgcli/tsconfig.eslint.json --noEmit`，
复现相同位置和内容的 7 项错误。日志为 `/tmp/task293-cli-baseline.log`，未将该无关修复扩大进任务 293。

## 交给用户的浏览器验收

1. Popup Editor 的 Mega VNI 在 once/segmented 之间切换，项目页检查默认秒数、手工修改和导出重开。
2. 使用较大与刚超过 Mega 阈值的中奖额：前者尽量拟合有效时长，后者保持速度提前完成；数字不可降速或倒退。
3. 分别令最终停留短于/长于 Mega 剩余动画，确认始终等待较长者；检查点击提前完成、重播和恰好 Mega 阈值。
4. 在 Scene Layout 中确认最终金额、backdrop 和队列交接正确，分段动画及 Big/Super 计数观感保持原流程。

浏览器视觉验收由用户负责；CLI 原有 typecheck 错误保留。未 commit、push 或创建 PR。
