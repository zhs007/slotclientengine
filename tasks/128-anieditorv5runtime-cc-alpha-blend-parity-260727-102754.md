# 任务 128：Cocos alpha-correct screen 修复

## 结论

已修复 Cocos runtime 的 `screen` 混合算法。根因不是漏同步 vnicore 的 JPG/RGB PNG luminance matte 分支，而是 Cocos 原实现对 straight-alpha PNG 使用了 `SRC_ALPHA / ONE_MINUS_SRC_COLOR`：source RGB 未预乘 alpha，却直接参与 destination factor；因此 alpha 为 0 的隐藏 RGB 仍会染色或压暗背景。正式样本中 `旋涡1` 恰好是带有效 alpha 的 `screen` PNG，且透明区域保留高 Green 数据，能稳定触发该问题。

`旋涡2` 是 `normal` RGBA PNG；代码检查没有发现它的独立 normal 路径需要 JPG/PNG 分流。截图中它的异常观感可能由上层 `旋涡1` 的错误 screen 合成共同造成，最终单层与叠层视觉结果留给用户在真实项目中确认。

## 实现

- `screen` 改为 alpha-correct Cocos Effect：
  - fragment 在纹理色、顶点色和最终 alpha 结合后执行 `rgb *= alpha`；
  - color blend 使用 `ONE / ONE_MINUS_SRC_COLOR`；
  - alpha blend 使用 `ONE / ONE_MINUS_SRC_ALPHA`。
- runtime 按实际使用懒创建并复用每个 Sprite 的 screen Material；切换到其他模式时恢复 builtin material，节点销毁时释放 runtime-owned Material。
- Effect 缺失或把 screen 应用到不支持该策略的 Graphics 时显式失败，不静默降级。
- `normal`、`add`、`multiply`、`lighten` 的独立 alpha channel 修正为 source-over 的 `ONE / ONE_MINUS_SRC_ALPHA`，避免 source alpha 被重复相乘。
- 同步 fake `cc`、Cocos 3.8.6 类型 shim、公式/配置/生命周期回归、README、standalone checker、生成的单文件 runtime 和长期 Cocos runtime 规则。

正式新增资产：

```text
packages/anieditorv5runtime-cc/standalone/effects/vni-screen-alpha.effect
```

standalone 使用时必须一起复制 runtime、示例和该 Effect；screen 图片保持 Cocos 默认 straight-alpha 导入，不要另外启用 Premultiply Alpha。

## 自动化验收

以下定向 L2 验收均通过：

- package typecheck；
- standalone typecheck；
- package build；
- ESLint；
- Prettier check；
- standalone build/check；
- Vitest：19 个测试文件、215 项测试全部通过；
- `git diff --check`。

新增回归同时证明：

- alpha 为 0 且 RGB 非零时，新 screen 公式不改变 destination；
- 旧固定 blend 公式会错误改变 destination；
- screen Material 的 blend factor、复用、模式切换与 destroy 生命周期；
- standalone Effect 包含预乘和 alpha-correct blend 合同。

## standalone 交付物

`packages/anieditorv5runtime-cc/standalone.zip` 已重建，仅包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
standalone/effects/vni-screen-alpha.effect
```

SHA-256：

```text
8840c85dcfac74f8bbaba5b37dd81f2c72c525ef5455677cc6c1dc2b7e04bce4
```

## 计划偏差与剩余验收

- 用户在执行阶段明确要求“不要用 Cocos 验证”“修改代码，我来验证”，因此未启动 Cocos Creator，也未声称完成真实 GPU、关键帧截图或 Web/native 平台视觉验收。
- 未把完整外部 runtime JSON 复制为仓库 fixture；样本事实继续以原始 ZIP 的 SHA-256 和像素检查为证据，自动化回归直接锁定导致问题的合成公式及 Effect 合同，未向生产代码加入图层名或 asset id 特例。
- 用户需要在 Cocos Creator 3.8.6 中重点复验 `旋涡1 only`、`旋涡2 only` 和两层叠加，并观察连续循环后的 Material/内存是否稳定。
