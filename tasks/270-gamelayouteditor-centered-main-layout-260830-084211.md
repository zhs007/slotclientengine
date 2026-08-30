# 270 gamelayouteditor-centered-main-layout 执行报告

## 结果

- Scene Layout latest 已升级为 v7。v7 只使用中心坐标系，root 保存 `main` grid，每个 mode 保存横竖 `main` center、`focusRect`、可选 margin 和 `enabled`；不再保存 `coordinateOrigin`、`artSize`、adaptation type、`backgroundNodes` 或 `reelPlacements`。
- 背景已归一为普通 scene node；零背景、一个背景或多个背景都走普通 node placement/scope。`nodes: []` 可正常解析、预览和导出。
- RenderCore 与 Editor 继续 strict 读取 v1–v6，并通过共享 upgrader 生成 v7 默认横竖数据；Editor manifest preview 和 ZIP 恒导出 v7。
- image 使用图片中心、VNI 使用项目 authored `(0,0)`、Spine 使用 skeleton authored origin、image-string 使用显式 anchor。未修改 VNI JSON、VNI 版本、VNI schema、`packages/vnicore` 或 VNI Editor。
- Game Layout Editor 已移除坐标类型、art size、背景专属配置和 game mode 类型 UI；main/focus 横竖配置成为唯一特殊几何。
- CLI 已支持 v7 图片、音频、event audio、引用重写、资源分组和优化后复验。

## 删除清单

完整删除：

- `apps/game002v2/**`
- `apps/game003v2/**`
- `apps/symbolsviewer/**`
- `assets/game002/**`
- `assets/game002-s2/**`
- `assets/game003/**`
- `assets/crave/**`
- `assets/minecart2/**`
- `assets/symbols002/**`
- `assets/symbols003/**`
- `assets/fixtures/crave-mapped/**`
- `assets/fixtures/minecart2-mapped/**`
- `assets/crave.assets-groups.json`
- `assets/minecart2.assets-groups.json`
- `test-utils/minecart2-fixtures.ts`

同时删除了绑定上述交付物的 task 131/132/135/147 Editor builder 脚本、旧坐标换算模块及过时的 production-specific 测试。工作区共删除 641 个 tracked path，其中 assets 559 个、apps 80 个。

明确保留：

- `assets/gamecfg002/**`
- `assets/gamecfg003/**`
- `docs/**`（仅更新 `docs/agent-rules/scene-layout.md` 的 v7 长期合同）
- `/Users/zerro/gitee.com/pixicrave/assets/**`
- `/Users/zerro/gitee.com/piximinecart2/assets/**`

## 测试资产调整

- Symbols Editor、Popup Editor 与 RenderCore 高价值 import/runtime 测试保留。
- 原先依赖两套 production mapped fixtures 的测试已改为各 package 自有的内联 JSON、atlas 文本和 1×1 PNG bytes；没有提交视频或整套游戏美术。
- `gamecfg002`、`gamecfg003` 继续用于真实 game config 解析/round-trip 测试。

## 外部项目判断

`pixicrave` 与 `piximinecart2` 是各自独立、较早版本的完整共享栈，不直接引用本工作区。只复制 RenderCore 会与它们现有 Gameframeworks/BridgeCore public API 失配；因此本任务不做不完整的半同步，两个外部仓库保持 clean，assets 未改。若后续升级，应作为整套共享 runtime 版本迁移单独执行。

## 自动验收

- RenderCore typecheck 通过；38 files / 305 tests 通过。
- Game Layout Editor typecheck 通过；25 files / 136 tests 通过。
- Game Layout Package CLI typecheck 通过；9 files / 42 tests 通过。
- Symbols Editor typecheck 通过；11 files / 88 tests 通过。
- Popup Editor typecheck 通过；4 files / 37 tests 通过。
- Gameframeworks typecheck 通过；13 files / 92 tests 通过。
- Game UI Leo source-boundary：5 files / 15 tests 通过。
- Game Layout Editor、Package CLI、Symbols Editor、Popup Editor、Gameframeworks 定向 lint 通过。
- pnpm 10 frozen lockfile 校验通过。
- 整仓 build 通过：41/41 tasks。
- 整仓 test 在 sandbox 内仅因 NetCore 测试监听 `127.0.0.1` 被系统拒绝；NetCore 在允许本地监听后定向复验通过：7 files / 95 passed / 1 skipped。
- Prettier 定向格式化通过；`git diff --check` 通过。

整仓非任务基线问题（未越权修改）：

- `pnpm typecheck` 停在 `packages/uiframeworks/tests/test-helpers.ts`：旧 `GameLogic` 测试桩缺少 4 个现有接口方法；任务相关 package 的 typecheck 均通过。
- `pnpm lint` 仅报 `apps/underwater3ddemo/src/model-viewer.ts` 的既有 type-only import。
- RenderCore 定向 lint 仅剩 `src/presentation/render-object-pool.ts` 的既有 TypeScript overload `no-redeclare` 误报；本任务修改文件的 lint 错误已清零。
- Game Layout Editor 全量 136 tests 通过，但 package 的既有全局 coverage 阈值使带 coverage 的脚本退出 1；无 coverage 的正式定向测试命令通过。
- RenderCore 全量 1085/1086 tests 通过；唯一失败是保留的 gamecfg fixture 已为 symbol manifest v3，而旧 `tests/symbol/package.test.ts` 仍断言 v2。任务相关 38 files / 305 tests 全部通过。
- `pnpm format:check` 停在 `apps/slot3ddemo001/src/scene.ts`；另提示 RenderCore 中两个本任务未修改文件。任务改动文件的定向 Prettier 检查通过。

## 待人工验收

按用户约定，浏览器验收由用户执行。建议重点检查：新建空布局、零背景预览、横竖切换、main/focus 编辑、旧 ZIP 导入后导出 v7。
