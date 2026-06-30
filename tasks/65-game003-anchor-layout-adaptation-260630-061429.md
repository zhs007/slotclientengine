# game003 anchor layout adaptation 执行报告

## 1. 执行结论

已按 `tasks/65-game003-anchor-layout-adaptation.md` 完成实现与自动化验收。

本次把 `game003` 主转轴背景和传送带定位从运行时 `placement + scenePartGap + 尺寸公式` 迁移为 YAML 中相对横竖屏 `focusRect` 的显式坐标：

- 横版 `mainReelBackgroundPositionInFocusRect = { x: 294, y: -10 }`，映射后 `mainReelBackground = { x: 582, y: 578, width: 1130, height: 824 }`。
- 横版 `conveyor.positionInFocusRect = { x: 0, y: 14.5 }`，映射后 `conveyor = { x: 288, y: 602.5, width: 284, height: 775 }`，与主转轮垂直中心对齐。
- 横版 `reelAreaInMainReelBackground = { x: 124, y: 130, reelCount: 5, reelGap: 15, cellWidth: 165, cellHeight: 130 }`，派生 `width=885`、`height=650`，映射后 `reelArea = { x: 706, y: 708, width: 885, height: 650 }`。
- 竖版 `mainReelBackgroundPositionInFocusRect = { x: 0, y: 147 }`，映射后 `mainReelBackground = { x: 22, y: 616.5, width: 1130, height: 824 }`。
- 竖版 `conveyor.positionInFocusRect = { x: 98, y: -80 }`，映射后 `conveyor = { x: 120, y: 389.5, width: 934, height: 227 }`，与主转轮之间为 0px 间距，并作为整体继续上移 50px。
- 竖版 `reelAreaInMainReelBackground = { x: 124, y: 130, reelCount: 5, reelGap: 15, cellWidth: 165, cellHeight: 130 }`，派生 `width=885`、`height=650`，映射后 `reelArea = { x: 146, y: 746.5, width: 885, height: 650 }`。

## 2. 主要改动

- `packages/rendercore` 新增通用 `mapAnchorRectToArt(...)`，只负责 anchor rect + child rect 到完整 art 坐标的映射和 fail-fast 校验，不包含 game003 专属语义。
- `packages/rendercore` 的普通转轮仍只在转动中裁切单轴，停止后彻底取消裁切；game003 不再请求 `appear` 状态，落地后直接回到 `normal`。
- `apps/buildgamestatic` / `packages/gameframeworks/static-config` 新增 `Point` 类型、`mainReelBackgroundPositionInFocusRect` / `positionInFocusRect` 校验和独立 `reelAreaInMainReelBackground` 校验；focus-relative point 允许负偏移，但映射后的矩形必须位于完整背景 art 内；`conveyor` 在通用类型中可选，game003 自己要求必填。
- 删除运行时 `scenePartGap` 字段，旧 `placement` 字段会按 unknown field 显式失败。
- `apps/game003/src/game-layout.ts` 改为调用 `rendercore` anchor helper，停止用 conveyor 尺寸、gap 或 placement 枚举推导位置；转轮内容区使用 `reelAreaInMainReelBackground` 单独控制位置、轴数、轴间距和单格宽高。
- 同步 `apps/game003/config/game-static.yaml`、`game-static.generated.ts`、README 和 `agents.md` 协作规则。

## 3. 自动验收

通过：

- `CI=true pnpm --filter game003 generate:static-config`
- `CI=true pnpm --filter game003 check:static-config`
- `CI=true pnpm --filter @slotclientengine/rendercore lint`
- `CI=true pnpm --filter @slotclientengine/rendercore test`
- `CI=true pnpm --filter @slotclientengine/rendercore typecheck`
- `CI=true pnpm --filter @slotclientengine/rendercore build`
- `CI=true pnpm --filter @slotclientengine/rendercore format:check`
- `CI=true pnpm --filter @slotclientengine/gameframeworks lint`
- `CI=true pnpm --filter @slotclientengine/gameframeworks test`
- `CI=true pnpm --filter @slotclientengine/gameframeworks typecheck`
- `CI=true pnpm --filter @slotclientengine/gameframeworks build`
- `CI=true pnpm --filter @slotclientengine/gameframeworks format:check`
- `CI=true pnpm --filter buildgamestatic lint`
- `CI=true pnpm --filter buildgamestatic test`
- `CI=true pnpm --filter buildgamestatic typecheck`
- `CI=true pnpm --filter buildgamestatic build`
- `CI=true pnpm --filter buildgamestatic format:check`
- `CI=true pnpm --filter game003 lint`
- `CI=true pnpm --filter game003 test`
- `CI=true pnpm --filter game003 typecheck`
- `CI=true pnpm --filter game003 build`
- `CI=true pnpm --filter game003 release:check`
- `CI=true pnpm --filter game003 format:check`
- `CI=true pnpm lint`
- `CI=true pnpm build`
- `git diff --check`

补充静态审计均无匹配：

- `rg -n "left-bottom-of-main-reel|top-center-of-main-reel" apps/game003 apps/buildgamestatic packages/gameframeworks`
- `rg -n "mainReelBackgroundInFocusRect|rectInFocusRect" apps/game003 apps/buildgamestatic packages/gameframeworks`
- `rg -n "scenePartGap" apps/game003 apps/buildgamestatic packages/gameframeworks`
- `rg -n "focusRect\\s*\\?\\?|focusRect\\s*\\|\\|" apps/game003 packages/rendercore packages/gameframeworks apps/buildgamestatic`
- `rg -n "rect\\.x - visibleRect\\.x|rect\\.y - visibleRect\\.y" apps/game003/src apps/game003/tests`

## 4. 根级残留问题

以下根级命令未作为本任务通过项：

- `CI=true pnpm test`：`@slotclientengine/netcore` 的 `tests/main-adv.test.ts` 7 个用例均 10s 超时；命令随后长时间未自然退出，已中断。该包不是本任务触达范围。
- `CI=true pnpm typecheck`：失败在 `apps/uiframeworksviewer/tests/demo-game.test.ts`，错误为测试 mount context 缺少 `getViewport` / `onViewportChange`；与本任务改动无关，触达包 typecheck 已全部通过。
- `CI=true pnpm format:check`：根级已有格式债，首个失败包为 `apps/uiframeworksviewer`，同时输出 `apps/reelsviewer` 等历史格式问题；本任务触达包已单独通过 format check。

## 5. 浏览器验收

未启动浏览器验收。用户已明确“浏览器验收我来做”。

自动化已覆盖：

- 横竖屏 scene parts 最终坐标和转轮区轴间距。
- 显式 `mainReelBackgroundPositionInFocusRect` 驱动布局而非旧尺寸公式。
- 缺失 game003 conveyor 显式失败。
- anchor 映射越界显式失败。
- loading `99%/100%` 相关测试仍通过 `game003 test` / `release:check`。

## 6. 工作区说明

- 未新增第三方依赖，未执行 `pnpm install`，`pnpm-lock.yaml` 无变化。
- `tasks/65-game003-anchor-layout-adaptation.md` 是本任务执行前已有未跟踪任务计划文件，未改动其内容。
