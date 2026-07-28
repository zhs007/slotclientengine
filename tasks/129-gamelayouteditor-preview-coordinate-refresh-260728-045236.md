# 任务 129 执行报告

## 结论

任务 129 的 schema、RenderCore runtime、Game Layout Editor 模型/UI/preview、ZIP 回归、文档与 L2 自动化验收均已完成并通过。

按用户要求，本次未执行真实浏览器人工验收：

- 自动化、类型检查与 production build：通过。
- 浏览器视觉与交互验收：待用户执行。

执行基线：

```text
HEAD: 78cda7ec1c4e874a9933ea1ba26f9dbc9890640f
task branch: codex/task-129-gamelayouteditor
initial implementation commit: 621a696
Node: v24.14.0
repository packageManager: pnpm@10.0.0
```

执行开始时只有任务计划 `tasks/129-gamelayouteditor-preview-coordinate-refresh.md` 为未跟踪文件；该文件已保留。初版提交后，根据用户反馈移除了 main reel 整体 scale，并为选中图层增加了可见区斜线。

## 实现内容

### ZIP 名称与旧包兼容

- ZIP 中 physical payload 继续使用 `assets/<完整 SHA-256>.*`。
- `SceneLayoutNode.id` 始终作为图层 identity，资源列表使用 logical filename key；export → import 后不再允许 physical hash 充当图层或资源标签。
- 回归测试覆盖共享资源、可读 node id、logical key 与 physical hash 同时存在的往返。
- 旧 manifest 缺少 `coordinateOrigin` 时按 `top-left` 读取；Editor 再导出时写入 canonical 显式值。

### 坐标

- scene-layout v1 增加可选 `coordinateOrigin: "top-left" | "center"`。
- Game Layout Editor 项目页增加全局坐标切换按钮；单次 transaction 可逆转换 image、Spine/image-string、main reel 与 art-space Spine transition placement。
- focus/frame/min-margin 继续使用 art 左上角矩形；popup 与 video 坐标不转换。
- 根据后续产品决策，移除 main reel 整体 scale；横竖屏适配由美术调整背景素材宽度、art size 和 reel `x/y` 完成。

### 红框与刷新分级

- Layout preview 新增独立、非交互的红色 selection overlay；红框内增加裁切到可见渲染区的半透明斜线，边界在画布外时仍能识别选中范围。普通图层选择、variant/resize、geometry change 和 Spine 每帧 bounds 变化都会更新。
- UI selection 不写 store，也不触发 preview prepare。
- Store 把变更分为 geometry/structural；geometry fast path 先校验 immutable signature，再复用现有 texture、Spine player、mode、reel 和 scene。
- legacy symbol overlay 改为父容器 position；相同 sampled scene 的几何更新只调整父容器，不销毁或重建 symbol 实例，也不重新随机。
- 资源、node/reel topology、binding、mode/transition 结构变化继续走原有完整 prepare/commit。

### L2 验收发现

完整 Game Layout Editor 测试暴露 mapped Popup import 在 decode 前没有执行 editor-side hash/size/orphan 校验，导致 orphan 用例先落到图片解码错误。已在 `imported-popup-package.ts` 的编辑器导入边界补上 `validateEditorAssetsMapPackage()`；RenderCore runtime 的“不重复计算 hash”职责未改变。

## 自动化验收

```text
rendercore typecheck
PASS

rendercore test
PASS · 73 files / 554 tests

gamelayouteditor typecheck
PASS

gamelayouteditor test
PASS · 21 files / 156 tests

gamelayouteditor production build
PASS

Prettier targeted check
PASS

git diff --check
PASS
```

Vite build 保留现有大 chunk 警告，产物成功生成；本任务未修改 bundling 策略。

依赖首次不可用时按仓库约定执行了 `CI=true pnpm install --frozen-lockfile`。后续验证因当前 shell 的 pnpm 11 与仓库 `pnpm@10.0.0` 不一致，直接复用已安装的本地 TypeScript、Vitest、Prettier 和 Vite 二进制；没有修改 `package.json` 或 `pnpm-lock.yaml`。

## 待用户浏览器验收

1. 创建双背景项目，导入 image/Spine 普通图层与 Symbols，导出 ZIP 后重新导入；确认大纲与资源名可读，ZIP payload 仍是 hash。
2. 选中不同普通图层并切横竖屏、缩放 preview；确认红框和斜线跟随实际可见范围，边界在画布外仍有斜线提示，黄/绿 guide 不变，隐藏图层不画假框。
3. 连续只改 node/reel x、y；确认 symbols 排列、当前 mode 和 Spine 动画不重置。
4. 确认 main reel Inspector 只有横竖屏 `x/y`，没有整体 scale。
5. 往返切换左上角/中心坐标；确认背景、普通图层、Spine transition 与 main reel 视觉位置不跳。
6. 导入缺少坐标字段的旧包；确认按左上角渲染，并可重新导出。

浏览器验收结果由用户补充；自动化部分已经完成。
