# 71 anieditorv5runtime-cc / vnicore runtime sync 执行报告

## 结论

任务 71 的 package 范围已完成并通过严格验收：`packages/anieditorv5runtime-cc` 已同步 task 70 涉及的 VNI runtime 能力，模块化源码、standalone 单文件、standalone 示例、README、测试 fixture、`standalone.zip` 和仓库协作规则均已同步。

真实 Cocos Creator 编辑器导入未执行：当前 shell 中 `CocosCreator` 不在 `PATH`，且 `/Applications/Cocos` 下未找到 `CocosCreator` 可执行文件。本报告不把真实编辑器验收计为已完成。

## 已完成实现

- 同步 VNI 导出能力到 Cocos runtime：
  - `text` layer：创建 Cocos `Label` 原始文本节点，新增 `attachNodeToTextLayer`、`attachTextToTextLayer`、`attachProjectAssetToTextLayer`、`attachSpriteFrameToTextLayer`。
  - `legacy_alpha` mask：新增 Cocos mask driver hook；`showSourceLayer=false` 会隐藏 source layer。
  - `precompose_light_alpha`：Cocos runtime 显式失败，不做隐藏 fallback。
  - `chaser_light`：新增 sampler、player 容器和 Sprite 节点渲染。
  - `particle_stream`：纳入粒子类型、校验、runtime drain duration。
  - `bounce_in`：使用 eased progress。
  - `getRuntimeDiagnostics()`：暴露 particle/chaser/safeGlow/mask/text/mounted/liveParticle 计数。
- 同步交付面：
  - `standalone/anieditorv5runtime-cc.ts`
  - `standalone/V5GPreview.example.ts`
  - `standalone.zip`
  - `README.md`
  - `.prettierignore`
  - `agents.md`
- 同步 fixture：
  - `docs/anieditor5/export/number2.json` -> `packages/anieditorv5runtime-cc/tests/fixtures/number2.json`
  - `docs/anieditor5/export/number3.json` -> `packages/anieditorv5runtime-cc/tests/fixtures/number3.json`
  - `docs/anieditor5/export/roundreel.json` -> `packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json`

## 测试覆盖

新增/更新覆盖点：

- `text` layer public API 绑定、替换文本、dispose 恢复原始文本节点、diagnostics。
- `chaser_light` 节点渲染、源图隐藏、容器清理、diagnostics。
- `legacy_alpha` mask 创建、source layer 隐藏、seek update、destroy 清理。
- `number3` 通用校验通过，但 Cocos `precompose_light_alpha` 显式失败。
- standalone public API 暴露、fixture parity、player parity。
- `roundreel` 更新为 `VNI_0.022` 并覆盖 safe glow / chaser 相关导出。

## 验收命令

已通过：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc build
cmp docs/anieditor5/export/number2.json packages/anieditorv5runtime-cc/tests/fixtures/number2.json
cmp docs/anieditor5/export/number3.json packages/anieditorv5runtime-cc/tests/fixtures/number3.json
cmp docs/anieditor5/export/roundreel.json packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
git diff --check
CI=true pnpm build
```

关键结果：

- Vitest：`15 passed (15)`，`156 passed (156)`。
- Coverage 总览：All files statements `76.48%`，branches `69.58%`，functions `89.73%`，lines `77.68%`。
- `standalone.zip` 内容仅包含：
  - `standalone/anieditorv5runtime-cc.ts`
  - `standalone/V5GPreview.example.ts`
- 根级 `CI=true pnpm build`：`25 successful, 25 total`；仅保留既有 Vite chunk size warning。

## 未通过 / 外部阻塞

```bash
CI=true pnpm typecheck
```

未通过原因不在任务 71 修改范围内：

- 失败包：`apps/uiframeworksviewer`
- 失败位置：`apps/uiframeworksviewer/tests/demo-game.test.ts:38`
- 错误摘要：测试 fake 的 `SlotGameMountContext` 缺少 `getViewport`、`onViewportChange`。
- 本次任务包 `@slotclientengine/anieditorv5runtime-cc` 在该根级 typecheck 中已完成自身 `tsc -p tsconfig.json --noEmit`。

## 真实 Cocos 验收状态

已检查：

```bash
command -v CocosCreator
find /Applications/Cocos -maxdepth 3 -type f -name CocosCreator
```

结果：当前环境没有可直接执行的 `CocosCreator` 命令或可执行文件路径，因此未启动 Cocos Creator 3.8.6 做真实项目导入验收。后续需要在宿主 Cocos 项目中人工确认 `.meta`、atlas 绑定、Mask.Type.IMAGE_STENCIL 行为和场景生命周期。
