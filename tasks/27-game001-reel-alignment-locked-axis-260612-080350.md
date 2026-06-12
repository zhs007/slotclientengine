# game001 主转轮校准与第 4 轴锁定任务报告

## 实现摘要

- 在 `apps/game001` 内新增 game001 专用主转轮视图，普通轴继续使用 rendercore `RenderReel`，第 4 轴不创建普通 reel，只固定显示 `scene[3][2]` 的单个中心 symbol。
- 主转轮内容不再使用整张 `reels1bk.png` 宽度做 fit，改为使用底图内框与 5 个列中心计算 `mainReelsFitScale`、layer `x/y` 和调试坐标。
- spin 逻辑仍然严格校验完整 `5 x 5` scene，并使用完整 scene 反查完整 5 轴 `finalYs` 与创建完整 `ReelSpinPlan`；视觉完成校验改为普通轴列匹配、锁定轴中心 code 匹配。
- `SC`、`RS`、`X2`、`X5`、`X10` 特殊图标基础缩放由 `1.5` 调整为 `1.75`，比初版更大，同时避免 `2` 倍时贴边和被裁剪的问题。
- 主转轮普通轴 mask 保持以中心行为锚点，但高度改为按 `backgroundLocalFrame.height` 裁切，避免特殊图标上下超出背板内框。
- 普通轴启动下一次 spin 前会重置未完成的 `appear` once 状态，保证 `appear` 只在停轴落地时播放，不延续到旋转开始阶段。
- 新增测试覆盖校准常量、锁定轴 fail-fast、无 defaultScene 时不兜底、spin 期间不旋转不请求 `spinBlur`、完成时硬切目标中心 symbol。
- 更新 `apps/game001/README.md`，说明主转轮校准公式、第 4 轴语义和 game001 专用视觉验收规则。

## 新增和修改文件

- 新增：`apps/game001/src/main-reels-view.ts`
- 新增：`apps/game001/tests/main-reels-view.test.ts`
- 新增：`tasks/27-game001-reel-alignment-locked-axis-260612-080350.md`
- 修改：`apps/game001/src/game-layout.ts`
- 修改：`apps/game001/src/game-demo.ts`
- 修改：`apps/game001/src/scene.ts`
- 修改：`apps/game001/tests/game-layout.test.ts`
- 修改：`apps/game001/tests/game-demo.test.ts`
- 修改：`apps/game001/tests/scene.test.ts`
- 修改：`apps/game001/README.md`

## 协作规则与核心包

- 未修改 `agents.md`：本任务没有改变仓库协作规则、目录规范或基础脚本，因此无需更新。
- 未修改 `packages/rendercore`：第 4 轴锁定是 game001 特殊视觉规则，rendercore 现有 `RenderReel` 原语已足够组合。
- 未修改 `packages/logiccore`：完整 scene 解析和停轴反查语义保持不变。
- 未修改 `packages/netcore`：live client 与 collect 流程不受本任务影响。

## 最终主转轮校准常量

以 `assets/game001/reels1bk.png` 左上角为局部坐标：

- `backgroundLocalFrame`: `{ x: 25, y: 96, width: 975, height: 281 }`
- `columnCentersX`: `[125, 319, 514, 708, 902]`
- `stageColumnCentersX`: `[83, 277, 472, 666, 860]`
- `stageVisibleFrame`: `{ x: -17, y: 497, width: 975, height: 281 }`

使用真实 game001 symbol 尺寸时：

- `cellWidth = 449`
- `cellHeight = 402.5`
- `columnGap = 36`
- `mainReelsFitScale = 777 / 1940 = 0.4005154639175258`
- `rawReelsContentWidth = 2389`
- `rawReelsContentHeight = 2012.5`
- `cropY = 655.4520592020592`
- `cropHeight = 701.5958815958816`
- `visibleHeight = 281`
- 主转轮内容 layer `x = -6.915721649484539`
- 主转轮内容 layer `y = 234.48131443298965`

锁定轴：

- 0-based `x=3`
- center row `y=2`
- 目标 stage center: `{ x: 666, y: 637.5 }`
- raw local center: `{ x: 1679.5, y: 1006.25 }`
- raw local center 经 layer scale 映射后为 `{ x: 665.75, y: 637.5 }`，与第 4 列目标中心误差小于 `1px`。

## 第 4 轴规则实现说明

- 用户语义“第 4 轴”解释为从左到右第 4 列，即 0-based `x=3`。
- 锁定中心行固定为 `y=2`，只读取 `scene[3][2]`。
- `Game001MainReelsView` 只为普通轴 `[0, 1, 2, 4]` 创建 `RenderReel`；第 4 轴不创建普通 reel。
- 有 live `defaultScene` 或显式 `initialScene` 时，初始化显示 `scene[3][2]` 对应的 `normal` symbol。
- 没有 initial scene 时，root 保持 hidden，锁定轴 code 为 `null` 且 symbol 数为 `0`；第一次 spin 完成前不使用 `y=0`、fixture 或旧画面兜底。
- spin 期间只启动普通轴 plan，第 4 轴不调用 `RenderReel.start()`，不滚动、不 bounce、不旋转、不请求 `spinBlur`。
- 普通轴启动 spin 前会重置当前 slot symbol，避免上一轮未完成的 `appear` once 状态被带到旋转开始阶段；普通轴停下后仍由 `RenderReel.land()` 请求 `appear`。
- 普通轴全部停止后，锁定轴用 target scene 的 `scene[3][2]` 更新一次；code 未变时复用当前 symbol 并请求 `normal`。
- 如果 `scene[3][2]` 映射到 empty symbol（例如 `BN`）或 registry 无法创建可见 symbol，会明确抛错。

## 最终视觉校验逻辑

- 普通轴：`normalVisibleScene` 按 `[0, 1, 2, 4]` 顺序分别和 target scene 对应列完全比较。
- 锁定轴：校验当前显示 code 等于 target `scene[3][2]`。
- 锁定轴 symbol 数：必须恰好为 `1`。
- 完整 `5 x 5` scene 仍在 runtime 入口严格解析；停轴反查仍使用完整 scene 和完整 5 轴 `finalYs`。

## 执行命令和结果

- `pnpm --filter game001 test`：通过，`8` 个 test files、`47` 个 tests。
- `pnpm --filter game001 lint`：通过。
- `pnpm --filter game001 typecheck`：通过。
- `pnpm --filter game001 build`：通过。
- `pnpm lint`：通过，`16` 个任务成功。
- `pnpm test`：通过，`16` 个任务成功；`game001` 为 `8` 个 test files、`47` 个 tests。
- `pnpm typecheck`：通过，`16` 个任务成功。
- `pnpm build`：通过，`16` 个任务成功。
- `git diff --check`：通过。

## 浏览器与视觉验收结果

- 按本次用户明确指令“不需要处理浏览器验收”，未启动 dev server，未使用浏览器截图或视频验收。
- 未执行 live spin 浏览器验收，因此不能标记为完整 live 浏览器验收完成。
- 本次视觉规则通过自动化 snapshot 验收覆盖：列中心映射误差、普通轴 visible scene、锁定轴单 symbol、锁定轴 spin 期间位置/rotation/state 不变、完成后目标中心 code 更新。

## 未完成项与后续建议

- 浏览器静态截图验收和 live spin 浏览器验收按本次指令跳过，后续需要人工或浏览器工具补验实际像素对齐与 live 过程表现。
- 当前未抽象通用锁定轴 API；如果后续多个游戏需要相同规则，再另开任务评估 rendercore 层抽象。
