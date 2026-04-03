# spine2victoryani-demo 相机拖拽与滚轮缩放任务报告

## 1. 目标

为 `apps/spine2victoryani-demo` 落地场景视口交互，满足以下要求：

- 鼠标左键拖拽时平移整个场景视角
- 鼠标滚轮缩放整个场景
- 只有先点击激活 Pixi 渲染区后，滚轮缩放才生效
- 滚轮缩放只在实际 Pixi canvas 渲染区内触发
- resize 后保留当前平移与缩放状态
- 补充自动化测试、README 说明和任务报告

## 2. 实际改动

### 2.1 视口与交互模块

- 新增 `src/runtime/viewport-interaction.ts`
- 在该模块中补充了：
  - 视口 transform 应用函数
  - 激活态与拖拽态状态模型
  - 拖拽开始、更新、结束逻辑
  - 滚轮缩放门禁与倍率换算

### 2.2 主入口接线

- 更新 `src/main.ts`
- 新增 `viewportRoot -> sceneRoot -> player.root` 三层 Pixi 容器关系
- 保留 `computeCanvasLayout()` 只处理 canvas DOM 显示尺寸
- 将拖拽与滚轮缩放绑定到 `.stage` 容器
- 使用 canvas 的 DOM rect 计算本地锚点，保证缩放围绕鼠标位置展开
- 通过以下事件收尾拖拽态：
  - `pointerup`
  - `pointercancel`
  - `lostpointercapture`
  - `window.blur`
- 点击渲染区外部时取消 active，避免滚轮误触

### 2.3 样式与文档

- 更新 `src/styles.css`
- 为 `.stage` 增加：
  - 激活态边框与高亮
  - 拖拽态 cursor 与状态文案
  - 默认提示文案 `Click Preview To Activate Zoom`
- 更新 `README.md`，补充：
  - 新交互说明
  - 激活态行为说明
  - 手工验收步骤
  - 对应测试覆盖说明

### 2.4 自动化测试

- 扩展 `tests/runtime/viewport-controller.test.ts`
  - 增加最小缩放边界钳制断言
- 新增 `tests/runtime/viewport-interaction.test.ts`
  - 覆盖视口 transform 应用
  - 覆盖激活态门禁
  - 覆盖拖拽移动与拖拽结束收尾

## 3. 测试结果

在仓库根目录执行以下命令：

```bash
pnpm --filter spine2victoryani-demo test
pnpm --filter spine2victoryani-demo typecheck
pnpm --filter spine2victoryani-demo build
```

结果：

- `test` 通过，`13` 个测试文件、`27` 个测试全部通过
- `typecheck` 通过
- `build` 通过

## 4. 遗留问题与说明

- 本次未通过浏览器做完整手工验收，已补齐 README 中的手工验收步骤，建议结合本地 `dev` 页面再走一遍交互确认。
- 视口初始位置保持为当前预览既有原点语义，没有额外引入默认居中偏移，目的是避免改变现有导出内容的首屏落点。

## 5. agents.md 是否更新

未更新根级 `agents.md`。

原因：

- 本次仅修改 demo 应用代码、样式、测试、README 和任务报告
- 未影响仓库协作规则、目录规范或基础脚本