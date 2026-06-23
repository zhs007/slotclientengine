# anieditorv5runtime-cc special blend modes 执行报告

## 1. 实现摘要

已更新 `packages/anieditorv5runtime-cc` 的 Cocos Creator runtime，`normal`、`add`、`screen`、`multiply`、`lighten` 不再被统一按 `normal` 处理。

本次实现使用 Cocos Creator 3.8.6 原生 Sprite / material pass blend state：

- `normal`：`ADD` + `SRC_ALPHA / ONE_MINUS_SRC_ALPHA`
- `add`：`ADD` + `SRC_ALPHA / ONE`
- `screen`：`ADD` + `SRC_ALPHA / ONE_MINUS_SRC_COLOR`
- `multiply`：`ADD` + `DST_COLOR / ONE_MINUS_SRC_ALPHA`
- `lighten`：`MAX` + `SRC_ALPHA / ONE`

没有新增 shader / Effect 资产。standalone 交付仍只包含 runtime TS 和示例 Component TS。

## 2. Cocos Creator 3.8.6 blend 能力探测结论

当前机器未运行真实 Cocos Creator 3.8.6 编辑器视觉探针，原因是当前执行环境没有可直接打开的 Cocos Creator 3.8.6 GUI/项目运行条件。

已完成官方源码/API 探测：

- `cocos/2d/framework/ui-renderer.ts`：`UIRenderer` 暴露 `srcBlendFactor` / `dstBlendFactor`，`updateMaterial()` 会调用 `_updateBlendFunc()` 写入 material pass blend state。
- `cocos/gfx/base/define.ts`：`BlendFactor` 包含 `SRC_ALPHA`、`ONE`、`ONE_MINUS_SRC_ALPHA`、`DST_COLOR`、`ONE_MINUS_SRC_COLOR` 等；`BlendOp` 包含 `ADD` 和 `MAX`。
- `cocos/render-scene/core/pass.ts`：pass hash 包含 `blendEq`、`blendAlphaEq`、`blendSrc`、`blendDst`、`blendSrcAlpha`、`blendDstAlpha`，可通过 `blendState.setTarget(...)` 更新。

注意：`BlendFactor` / `BlendOp` 是 Cocos 3.8.6 官方源码里的内部 enum 语义，不假设它们可从 `"cc"` 命名导入。runtime 和 standalone 现在写入与官方 enum 对应的 number 值，避免依赖不存在的 `cc` 导出。

真实项目反馈补充：部分 Cocos 运行面上 `normal` Sprite 不暴露 public `srcBlendFactor/dstBlendFactor`。已修正为 `normal` 直接保持 Cocos 默认 Sprite 渲染，不要求任何 blend factor API；非 `normal` 模式兼容 public 字段和运行时可见的 protected `_srcBlendFactor/_dstBlendFactor`。

结论：代码路线选择 Cocos 原生 Sprite blend factor + material pass blend target，不新增 shader / Effect。真实编辑器截图级验收仍待用户在 Cocos Creator 3.8.6 环境换机执行。

## 3. 修改文件清单

- `packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts`
- `packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts`
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- `packages/anieditorv5runtime-cc/scripts/check-standalone.mjs`
- `packages/anieditorv5runtime-cc/tests/cocos/blend-mode.test.ts`
- `packages/anieditorv5runtime-cc/tests/cocos/player.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts`
- `packages/anieditorv5runtime-cc/tests/fakes/cc.ts`
- `packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts`
- `packages/anieditorv5runtime-cc/README.md`
- `packages/anieditorv5runtime-cc/standalone.zip`

## 4. 测试和验收结果

在仓库根目录执行并通过：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
git diff --check
```

Vitest 结果：`13` 个测试文件通过，`101` 条测试通过。

`standalone.zip` 已重建，`zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` 输出：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

未发现 `__MACOSX`、`._*`、旧文件或无关文件。

## 5. 真实 Cocos Creator 换机探针说明

真实 Cocos Creator 编辑器验收尚未运行。请在有 Cocos Creator 3.8.6 的机器上执行以下探针。

需要复制的文件：

- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- 一份 V5G/VNI project JSON，例如 `docs/anieditor5/export2/runtime_50/project.json`
- 同 profile 的图片资源，例如 `docs/anieditor5/export2/runtime_50/assets/*`

执行步骤：

1. 用 Cocos Creator 3.8.6 创建或打开 2D 项目。
2. 把 `anieditorv5runtime-cc.ts` 复制到 `assets/scripts/vendor/`。
3. 把 `V5GPreview.example.ts` 复制到 `assets/scripts/`，按实际路径修正 import。
4. 把选定的 `project.json` 作为 `JsonAsset` 导入项目。
5. 导入同 profile 下的图片资源，生成 SpriteFrame。
6. 在场景中创建一个 root 节点，挂载 `V5GPreview` Component。
7. 绑定 `root`、`projectJson`、`assetIds` 和 `spriteFrames`。`assetIds` 必须与 JSON 的 `asset.id` 一一对应，`spriteFrames` 必须来自同 profile 资源。
8. 为覆盖五种模式，可复制同一份 JSON 五份，分别把一个位于上层的 image layer 的 `blendMode` 改成 `normal`、`add`、`screen`、`multiply`、`lighten` 后逐个运行。

判定表：

| blend mode | 预期现象 |
| --- | --- |
| `normal` | 保持默认透明混合 |
| `add` | 源图叠加后亮部明显增亮，不能与 `normal` 截图一致 |
| `screen` | 画面增亮，但应与 `add` 不完全一致 |
| `multiply` | 叠加区域压暗，不能与 `normal` 截图一致 |
| `lighten` | 取亮部效果，不能与 `screen` / `add` 完全一致 |

需要回传的证据：

- Cocos Creator 版本号。
- 五种模式截图。
- 控制台是否出现 Sprite / Material / Pass / shader / blend state 报错。
- 五种模式的最终判定表。

如果某个非 `normal` 模式与 `normal` 视觉一致，或控制台出现 Material / Pass / blend state 错误，则判定当前路线失败，需要回到实现阶段修正。

## 6. 协作规则和依赖变化

- 未更新 `agents.md` / `AGENTS.md`。本任务只更新 runtime、测试、README、standalone 交付和任务报告，没有改变仓库协作规则、目录规范或根级脚本。
- 未新增 npm 依赖。
- `pnpm-lock.yaml` 无变化。

## 7. 已知限制和风险

- monorepo 自动化验收已通过，但真实 Cocos Creator 3.8.6 编辑器视觉验收未在当前机器运行。
- `lighten` 依赖 Cocos pass blend op `MAX` 对应的官方 enum 数值。runtime 不从 `"cc"` 导入 `BlendOp`；仍需真实编辑器截图确认目标平台渲染结果。
- 当前实现不依赖 shader / Effect 资产，因此不存在 shader 资产缺失场景；`normal` 不要求 Sprite blend API，非 `normal` 若宿主 Cocos 运行环境缺少 Sprite blend factor 或 material pass API，会显式失败而不是 normal fallback。

## 8. 二次遗漏检查

- 已检查 `src/cocos/blend-mode.ts` 与 standalone 同名逻辑保持一致。
- 已检查真实 `"cc"` runtime import 仍只在 `src/cocos/cocos-node-driver.ts` 和 standalone runtime 中出现；`src/cocos/types.ts` 仅保留 type-only import。
- 已检查 `src/core/*` 没有引入 Cocos、DOM、Pixi、Node 或 shader 细节。
- 已检查 `src/index.ts` 没有 runtime re-export 真实 Cocos driver。
- 已检查 standalone runtime 没有相对 import、workspace import、Node、DOM、Pixi、`JsonAsset`、`resources.load()`、`.includes(...)`。
- 已检查 `standalone.zip` 只包含两个预期文件。
- 已检查 README 已移除旧 normal fallback 说明。
- 已检查工作区改动范围只包含本任务相关文件；任务计划文件 `tasks/42-anieditorv5runtime-cc-special-blend-modes.md` 是执行前已存在的未跟踪文件。
