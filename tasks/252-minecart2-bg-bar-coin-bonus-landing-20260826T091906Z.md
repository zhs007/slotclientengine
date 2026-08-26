# 252 minecart2 bg-bar Coin/Bonus 落停执行报告

## 结果

- UTC 完成时间：`2026-08-26T09:19:06Z`
- slotclientengine 基线：`1f55dee544486f6ad53e94f5bb62b7ec27184974`（detached HEAD）
- piximinecart2 基线：`212c35185ac7a3bb59c3cd99e7cba61c0cc8e9e1`（`rgs`）
- 已完成 Minecart2 `bg-bar` 的 Coin Searchlight/CO Topick 落停与 Bonus `bg-spin -> bg-addbo` BO handoff。
- 浏览器视觉验收按用户要求未代做，状态为待用户验收。

## 最终合同

- `coin` 当前玩法总是等待中央 `Feature` 完整结束，再从 canonical Searchlight 池播放一次 exact `Start`。
- exact `bg-coinwins2` 未触发时不创建 Topick；触发时从最终 landing scene 按 game config 的逻辑 `CO` 扫描全部目标，CN 只作为 authored skeleton/slot 名，不硬编码 symbol code。
- Coin 的全部 Topick 完成 Start/Loop 后才开始逐列落停；目标列 settle 后播放 End 并回池，不替换最终 scene 已有的 CO。
- `bonus` 仅在 exact `bg-addbo` 存在时进入特殊 landing：唯一 `bg-spin` scene 是 initial，顶层 `pos` 与唯一 `bg-addbo` scene 是 final output；每个目标必须变化为 game config 的 `BO`，非目标格不得变化。
- Bonus 复用任务 250 的池化 Topick/preview handoff：normal BO preview、目标列 settle、End、正式 BO replacement、preview 回池、official occurrence `appear -> normal`。
- Bonus final output 继续进入现有 wins、award 与 BO collection；`bg-botrigger` 未被扩张为 mode transition。

## 主要改动

- piximinecart2 新增 exact `game003:coin-landing`、`game003:bonus-landing` operation 编译与 registry 注册，并绑定 `bg-coinwins2` source evidence。
- Feature bar 完整动画 barrier 扩展到 Coin/Bonus special landing；controller 接入 Searchlight、CO cleanup-only 与 BO preview/replacement 策略。
- 新增真实 parser-shape Coin/Bonus GMI fixture、compiler/adapter/controller/barrier/resource/source-boundary 测试，并更新 Minecart2 README。
- 未修改 slotclientengine shared package，因任务 250 的 canonical pool、factory、stable cell anchor、ReelSpinSession 与 replacement API 已满足需求；无需跨仓同步。
- 未修改资源 manifest/YAML/production bytes、依赖、lockfile、根工具链或生成文件。

## 自动验收

1. Minecart2 指定 6 个测试文件：通过，`65` tests。
2. `minecart2 build`：通过，Vite production consumer 成功产出。
3. piximinecart2 `git diff --check`：通过；改动仅限计划中的 11 个 Minecart2 app/测试/README 文件。
4. `minecart2 typecheck`：命令已执行。首次发现并修复本任务新增的 `round-compiler.ts` 字面量类型收窄错误；复跑后输出不再包含任何本任务文件错误，仅被任务前已有的 `packages/bridgecore`、`packages/device-detector` NodeNext 相对 import 缺 `.js`（TS2834/TS2835）及 BridgeCore 两处 implicit-any（TS7006）阻断。
5. 构建保留仓库既有的 Vite native config `__dirname` 提示及 `post.svg` runtime resolution 提示，均未阻断产物。

## 浏览器验收（待用户）

- Coin 有 `bg-coinwins2`：完整 Feature 后中央 Searchlight 只播放一次；结束前没有 Topick/停轴，样例 `(0,0..3)` 同时 Start/Loop，第 0 列 settle 后逐个 End，CO 不闪跳、不替换。
- Coin 无 `bg-coinwins2`：Searchlight 后直接按既有 left-to-right cadence 落完整 scene，无 Topick。
- Bonus 有 `bg-addbo`：样例 `(3,0)` 先以 `bg-spin` 的 L1 落停，normal BO preview 位于 Topick 下方；End 后无闪跳切成正式 BO，并播放 `appear -> normal`，后续 BO collection 正常。
- Bonus 无 `bg-addbo`：不创建 Topick/BO preview，保持普通 feature 的 0.5 秒 landing gate。
- 回归：Up/Wild、normal、首次初始化、横竖屏、连续 spin、取消/退出，以及多轮触发后的池对象数量稳定。

## 计划偏差与剩余风险

- 实施未发现 shared capability 缺口，因此保持 L1 app-only 范围，没有升级 L2。
- 真实 Spine 尺寸、遮罩、层级、低 FPS 下 Searchlight/Topick/BO handoff 以及横竖屏视觉表现仍需浏览器确认。
- 未 commit、push 或创建 PR。
