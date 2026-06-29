# game002 skin focus region adaptation 执行报告

## 1. 执行结论

已按 `tasks/60-game002-skin-focus-region-adaptation.md` 完成实现和自动化验收。

- `rendercore` 新增通用 `mapArtRectToViewport(...)`，负责把完整 art 坐标矩形映射到当前 viewport。
- `game002` 新增 per-skin `focusRegion`，`gridLayout.boardFrame` 不再承担隐式适配 focus。
- `createGame002FramePolicy(...)`、adapter mount/resize、runtime 创建路径均使用选中 skin 的 `focusRegion`。
- `boardFrameInViewport` 由 `rendercore` helper 计算，不再复用 `focusRectInViewport`。
- 未改动 `gameframeworks` / `uiframeworks` 算法。
- 浏览器 live 验收未执行：当前没有有效测试服 `serverUrl`、token、gamecode，不能把示例 URL 的连接失败当作完整通过。

## 2. 修改文件

- `packages/rendercore/src/viewport/focused-art-viewport.ts`
- `packages/rendercore/tests/viewport/focused-art-viewport.test.ts`
- `packages/rendercore/README.md`
- `apps/game002/src/game-layout.ts`
- `apps/game002/src/skin-config.ts`
- `apps/game002/src/game-adapter.ts`
- `apps/game002/src/game-demo.ts`
- `apps/game002/src/main.ts`
- `apps/game002/tests/game-layout.test.ts`
- `apps/game002/tests/assets.test.ts`
- `apps/game002/tests/game-adapter.test.ts`
- `apps/game002/tests/game-demo.test.ts`
- `apps/game002/tests/source-boundary.test.ts`
- `apps/game002/scripts/verify-static-dist.mjs`
- `apps/game002/README.md`
- `agents.md`
- `tasks/60-game002-skin-focus-region-adaptation-260629-040351.md`

## 3. 最终 focusRegion

坐标均相对于完整 `2000 x 2000` art/background。

```text
skin=1 focusRegion:
  x=555, y=150, width=862, height=1537

skin=2 focusRegion:
  x=637.5, y=330, width=720, height=1080

skin=3 focusRegion:
  x=637.5, y=330, width=720, height=1080
```

当前三套 skin 继续共享：

- `GAME002_FOCUS_MARGIN = { left: 60, right: 60, top: 60, bottom: 60 }`
- `preferredPortraitSize = GAME002_REFERENCE_SIZE = 1125 x 2000`

原因：skin1 已按后续视觉验收意见扩大重点区域，把羊等背景主体纳入适配重点；skin2 / skin3 暂无新的美术验收坐标，继续使用原重点区域。三套 skin 的 DOM frame 发布边界仍是同一套 portrait 逻辑尺寸策略。已在 `apps/game002/README.md` 和测试中明确这是审查后的选择，不是遗漏。

## 4. API 和边界

`rendercore` 新增：

```ts
mapArtRectToViewport({
  artSize,
  visibleRect,
  rect,
});
```

用途：在 focus rect 与 board rect、调试框或其它 art rect 不同时，统一把完整 art 坐标映射到 viewport 坐标。`rect` 和 `visibleRect` 必须在 `artSize` 内，`rect` 可以部分落在当前可见区域外。

`game002` 变化：

- `Game002SkinConfig` 新增 `focusRegion`。
- `createGame002Layout({ gridLayout, focusRegion })` 使用 `focusRegion` 计算 `visibleRect/worldOffset/focusRegionInViewport`。
- `boardFrameInViewport` 使用 `mapArtRectToViewport(...)` 计算。
- `createGame002FramePolicy(focusRegion)` 从 focus 尺寸创建 `framePolicy.focusRect`。
- 无参 `createGame002Layout()` 和 `{ width, height }` 便利入口只指向显式 skin2 默认组合，不从 boardFrame 动态兜底。

未改 `gameframeworks` / `uiframeworks`：本任务只需要 `framePolicy.focusRect.width/height` 和已存在的 viewport snapshot 透传；完整 art 坐标仍属于 `rendercore` + `game002` 边界。

## 5. 文档同步

- 已更新 `apps/game002/README.md`：说明 per-skin `focusRegion`、完整 `2000 x 2000` 坐标、与 `gridLayout.boardFrame` 的区别、共享 margin/reference 的当前选择。
- 已更新 `packages/rendercore/README.md`：说明 `mapArtRectToViewport(...)` 用法和 app 不应复制通用映射算法。
- 已更新 `agents.md`：新增 game002 skin focus 协作规则。

## 6. 验收命令

执行前盘点：

```bash
git status --short --untracked-files=all
git diff --stat
```

结果：发现 `tasks/60-game002-skin-focus-region-adaptation.md` 为未跟踪计划文件；未回滚或覆盖用户改动。

自动化验收：

```bash
env CI=true pnpm --filter @slotclientengine/rendercore lint
env CI=true pnpm --filter @slotclientengine/rendercore test
env CI=true pnpm --filter @slotclientengine/rendercore typecheck
env CI=true pnpm --filter @slotclientengine/rendercore build
env CI=true pnpm --filter @slotclientengine/rendercore format:check
```

结果：全部通过。`rendercore test` 为 `20` 个文件、`112` 个测试通过。

```bash
env CI=true pnpm --filter game002 lint
env CI=true pnpm --filter game002 test
env CI=true pnpm --filter game002 typecheck
env CI=true pnpm --filter game002 build
env CI=true pnpm --filter game002 release:check
env CI=true pnpm --filter game002 format:check
```

结果：全部通过。`game002 test` 为 `10` 个文件、`73` 个测试通过。

`release:check` 首次失败于 `BN.spinBlur` 内联资源识别：Vite 将透明 PNG 绑定为 `$m`，旧正则 `\b([A-Za-z_$][\w$]*)=...` 无法识别 `$` 开头变量。已修正为 `([A-Za-z_$][\w$]*)=...`，重跑后通过；运行时资源未缺失。

边界审计：

```bash
rg -n "focusRegion\s*\?\?|focusRegion\s*\|\|" apps/game002/src apps/game002/tests
rg -n "rect\.x - visibleRect\.x|rect\.y - visibleRect\.y" apps/game002/src apps/game002/tests
rg -n "@slotclientengine/uiframeworks|@slotclientengine/netcore|@slotclientengine/logiccore" apps/game002/src
git diff --check
```

结果：三条 `rg` 均无输出；`git diff --check` 通过。

根级格式检查：

```bash
env CI=true pnpm format:check
```

结果：失败，失败点在未改动 package 的既有格式问题，包括 `apps/gameclientcli/src/gameplay-stats.ts`、`apps/gameclientcli/tests/fixtures/logic-gmi.ts`、`apps/gameclientcli/tests/gameplay-stats.test.ts`，以及 `gengameconfig` / `reelsviewer` / `spine2victoryani-demo` 的 coverage 生成物扫描。已单独确认本任务触及的 `rendercore` 和 `game002` package-local `format:check` 通过。

## 7. 浏览器验收

未执行完整浏览器 live 验收。

原因：计划要求实际浏览器验收必须使用有效测试服 `serverUrl`、token 和 gamecode；当前执行环境没有这些参数。示例 `example.test` 只能验证 query 形态，不能证明 live 连接和真实 scene 渲染通过。

当前覆盖方式：

- 单元测试覆盖 portrait、square、landscape 的 `visibleRect/worldOffset/boardFrameInViewport`。
- adapter 测试覆盖 resize 使用 selected skin `focusRegion`，并用 focus 与 board 不同的配置证明不会退回 boardFrame。
- release check 覆盖三套 skin 资源、背景、manifest scale 和 dist 敏感信息扫描。

剩余风险：真实浏览器 viewport `375 x 812`、`1125 x 2000`、`1200 x 1200`、`1920 x 1080`、`3000 x 1200` 下的视觉对齐、控制台和 live 连接仍需在拿到有效测试服参数后补验。

## 8. 二次检查结论

- `focusRegion` 已每套 skin 显式配置。
- `GAME002_FOCUS_MARGIN` / `preferredPortraitSize` 已审查，当前继续共享，并已写入 README/报告。
- `focusRegion` 使用完整 `2000 x 2000` art 坐标。
- `gridLayout.boardFrame` 仍只负责 reel/cell 布局。
- 未发现 `focusRegion ?? gridLayout.boardFrame` 或 `focusRegion || ...`。
- `createGame002FramePolicy(...)` 已从 focus region 尺寸创建。
- `createGame002Layout(...)` 已从 focus region 计算 visible viewport。
- `game-demo.ts` 已随 layout API 同步，runtime 创建路径带 `focusRegion`。
- `boardFrameInViewport` 已与 `focusRegionInViewport` 分开。
- app 内未复制 `rect.x - visibleRect.x` / `rect.y - visibleRect.y` 通用映射。
- 三套 skin 配置和非法 focus region 都有测试覆盖。
- `release:check` 已评估并修正透明 BN 内联资源识别。
- README 和 `agents.md` 已同步。

## 9. 未完成项和建议

- 未完成完整浏览器 live 验收；需要有效测试服 URL、token、gamecode 后补跑。
- 根级 `pnpm format:check` 被 unrelated package 既有格式/coverage 扫描问题阻断；本任务影响的 package-local format checks 已通过。
