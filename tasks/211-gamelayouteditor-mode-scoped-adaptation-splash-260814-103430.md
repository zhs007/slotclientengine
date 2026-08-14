# 211 Game Layout Editor mode 级适配与 Splash 执行报告

## 结果

已完成 Scene Layout v2、v1 自动升级、Splash-first 编辑流程和 mode 级主转轮开关的本地实现。真实浏览器视觉与 trusted-click 验收按用户安排保留给用户执行。

## 最终合同

- v1 runtime/ZIP 继续兼容；共享 `upgradeSceneLayoutManifestToLatest()` 将旧根 adaptation、main reel placement 复制到每个旧 mode，保留 initial/mode/background/node/symbol/popup/transition，不生成 Splash。
- v2 将 adaptation、background、main reel placement 下移到 mode；每个 mode 可独立使用单背景或横竖双背景。
- mode required `reelEnabled`：`false` 时不显示 reel、不导出 mode placement、禁止 Symbols，focus 四边相对 art；`true` 时要求 main placement，focus 按 reel 区域外扩。v1 升级均为 `true`。
- 新项目要求分别选择 Splash/BaseGame 适配类型，创建 `initialMode=Splash`、Splash primary action 与显式 Splash → BaseGame none edge；Splash 默认无 reel，BaseGame 默认有 reel。
- preview 在真实 click listener 同步调用 primary action request；none/Spine/MP4 继续复用现有 prepare/commit/rollback。
- 正方形 viewport 保持当前 landscape/portrait；首次正方形确定为 landscape。
- Editor 导入 v1 后按“共享版本升级 → node-id migration → latest 复验”创建 v2 draft，preview/ZIP 导出恒为 v2。

## 主要修改

- rendercore：新增 `scene-layout/manifest-v2.ts`，扩展 schema/types/parser/upgrader、package resource/runtime、geometry、production ZIP 与稳定方向选择。
- gamelayouteditor：mode 独立 geometry draft、Splash-first 新建、两个适配类型下拉框、后续 mode 类型下拉框、reel 开关、art/reel 两种 focus 基准、primary-click preview、v1 导入/v2 导出。
- gamelayoutpkgcli/gameframeworks：适配 v1/v2 union、latest package rewrite/asset groups 与初始 design size。
- 文档：更新 Editor README、Scene Layout manifest 文档及 scene-layout/editor/shared-runtime 规则。

## 自动验收

通过：

- rendercore Scene Layout：22 files / 192 tests；typecheck；定向 lint。
- gamelayouteditor：9 files / 123 directed tests；定向 lint；production build。
- gamelayoutpkgcli：6 files / 24 tests；typecheck、lint、build。
- uiframeworks：10 files / 56 tests。
- gameframeworks typecheck；game002v2 带完整依赖链 typecheck。
- rendercore、gamelayouteditor、gamelayoutpkgcli 联合 build。
- `git diff --check`。

已确认的 main/环境基线，不由本任务引入：

- gamelayouteditor 全量 typecheck 仍只有 `tests/popup-package.test.ts` 的 3 处 Popup v1-v6 union narrowing 错误，与任务计划记录一致。
- gamelayouteditor 全量测试另受 production fixture 缺失和 Popup fixture animation `start` 缺失阻断；本任务相关 123 个定向测试全部通过。
- uiframeworks typecheck 的 test helper 缺少新 `GameLogic` 方法；gameframeworks 全量测试引用已不存在的 `apps/game002` 路径。两者均不在本任务改动范围。

## 人工验收待办

- 新建 Splash 双背景/BaseGame 单背景项目，配置背景与 focus，确认 Splash 无 reel guide、BaseGame focus 按 reel 外扩。
- 分别测试 none、Spine、带声音 MP4 的 Splash 点击转场及失败回滚。
- landscape → square → portrait 及反向 resize，确认 square 保持当前方向。
- 导入 v1 单/双背景包，确认 Editor 自动升级且导出 ZIP 为 v2，再重导检查 parity。

## 剩余风险

- 真实浏览器的手势策略、MP4/audio 和视觉 commit 时点尚未由本次自动化替代；需完成上述人工验收。
- 未批量迁移仓内 production v1 assets；它们继续由兼容路径运行，只有经 Editor 重导才成为 v2。
