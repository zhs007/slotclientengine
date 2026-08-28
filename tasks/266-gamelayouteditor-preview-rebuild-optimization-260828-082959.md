# 266 gamelayouteditor-preview-rebuild-optimization 执行报告

UTC：2026-08-28T08:29:59Z

## 最终实现

- RenderCore 的唯一 geometry compatibility 合同现在只把 Popup root `placements` 视为可变 geometry；Popup id、package
  manifest、order 和目录结构仍保持 immutable，新增、删除或重排 Popup 继续要求完整重建。
- Game Layout Editor 修改 Popup `x/y/scale` 时经 `EditorStore` 分类为 geometry，并调用现有
  `applyGeometryManifest()` 原位更新。数字字段仍只在 `change` 提交，输入中的中间态不更新项目或预览。
- 预览 preset、自定义宽高和右下角拖拽不再调用 `setLayout()`；它们只更新现有 viewport。拖拽 pointer move 使用单个
  animation frame 消费最新尺寸，pointer up 会 flush 最终尺寸，取消、下一次拖拽及销毁时清理 frame 和 window listener。
- zoom 与 guide 保持既有局部更新；结构变化仍自动执行完整 prepare/commit，没有新增手动刷新按钮。
- 新增 shared manifest、package runtime、EditorStore 和 AppShell 回归测试，并更新 RenderCore、Game Layout Editor README
  及 Scene Layout 领域规则。未新增依赖、schema、manifest、生成物或 lockfile 变化。

## 计划偏差

- 不需要修改 `package-runtime.ts`：现有 `applyGeometryManifest()` 与 viewport snapshot 已能更新 Popup transform，新增测试证明
  award Popup 的同一 cached player、mode 和 scene 被复用。
- 不需要修改 `layout-preview.test.ts`：package runtime identity 测试和 AppShell 的 `setLayout()` /
  `applyGeometryManifest()` 调用边界已覆盖本次缺口，没有增加重复断言。
- 未加入刷新按钮；自动 geometry/structure 分类足以保持预览同步，也不会新增“导出前是否刷新”的隐式状态。

## 自动验收

- Game Layout Editor 定向测试：`editor-store`、`layout-preview`、`app-shell` 共 62 项通过。
- RenderCore manifest 测试：25 项通过；新增 Popup placement geometry/immutable identity 边界测试通过。
- RenderCore 新增 package runtime 定向用例通过，证明 geometry commit 后 cached Popup player identity 不变且位置、scale
  使用新值。
- RenderCore 与 Game Layout Editor typecheck 通过。
- RenderCore 与 Game Layout Editor build 通过；Vite 保留现有 mixed dynamic import 和大 chunk 警告。
- 目标文件 Prettier check 与 `git diff --check` 通过。

## 已确认的基线问题

- 计划中的 RenderCore `package-runtime.test.ts` 全文件仍有两条与本任务无关的 reel parent identity 断言失败：standard
  reel 与 grid-cell reel 均在原有 `expect(reel.parent).toBe(runtime.container.children[0])` 处失败。
- 失败点不经过本次修改的 Popup geometry projection；新增 Popup runtime 用例与 manifest 全文件均通过。本任务没有扩围修改
  reel ownership 或既有测试预期。

## 未完成人工验收

按用户要求未执行浏览器验收。建议人工覆盖：

1. 连续编辑转场前置 Popup 的 `scale`、`x/y`，确认输入过程不闪、提交后下一次播放生效，轮带图标和当前 mode 不变。
2. 连续拖拽预览尺寸并跨横竖屏，再试 preset、自定义宽高和 zoom，确认无黑帧、runtime 重启或 Popup/轮带重置。
3. 修改 transition resource 等明确结构字段，确认提交后仍会自动重建且新资源生效。

## 剩余风险

- 自动测试证明了分类、调用边界、player identity、viewport 合并、typecheck 和 build；真实 Pixi/Spine 画面是否完全消除闪烁及
  连续拖拽的主观流畅度，仍依赖上述浏览器验收。
