# 任务 46 执行报告：vnicore safe glow node insertion

## 1. 任务摘要

已按 `tasks/46-vnicore-safe-glow-node-insertion.md` 执行：

- `packages/vnicore` 已支持 `VNI_0.017` 新动画类型 `safe_glow`。
- `safe_glow` 独立于旧 `render-effect-sampler`，使用 normal blend 同图副本 overlay 渲染。
- `apps/anieditorv5viewer` 已接入 `lock_01.json` 和 7 张新增图片。
- 组间插入 UI 保持通过 `VNIPlayer` public API 插入、移除、切换 project 重置。
- `export2/edit_full` 和 `export2/runtime_50` profile-scoped asset manifest、`assetScale`、`fileWidth/fileHeight/fileScale` 合同已验收。

执行前已有的 editor/source-of-truth 改动已保留，没有回滚：

- `docs/anieditor5/src/animation_presets.ts`
- `docs/anieditor5/src/constants.ts`
- `docs/anieditor5/src/pixi_stage.ts`
- `docs/anieditor5/src/types.ts`
- `docs/anieditor5/export/lock_01.json`
- `docs/anieditor5/export/assets/` 下 7 张新增图片

## 2. 实际修改文件清单

vnicore core/pixi：

- `packages/vnicore/src/core/types.ts`
- `packages/vnicore/src/core/animation-sampler.ts`
- `packages/vnicore/src/core/validation.ts`
- `packages/vnicore/src/core/project-sampler.ts`
- `packages/vnicore/src/core/safe-glow-sampler.ts`
- `packages/vnicore/src/core/index.ts`
- `packages/vnicore/src/pixi/layer-instance.ts`
- `packages/vnicore/src/pixi/vni-player.ts`

vnicore tests/fixture：

- `packages/vnicore/tests/fixtures/export/lock_01.json`
- `packages/vnicore/tests/core/animation-sampler.test.ts`
- `packages/vnicore/tests/core/validation.test.ts`
- `packages/vnicore/tests/core/project-sampler.test.ts`
- `packages/vnicore/tests/core/safe-glow-sampler.test.ts`
- `packages/vnicore/tests/core/render-effect-sampler.test.ts`
- `packages/vnicore/tests/pixi/vni-player.test.ts`

viewer：

- `apps/anieditorv5viewer/src/assets/projects/lock_01.json`
- `apps/anieditorv5viewer/src/assets/assets/2_asset_image_mqqlcjh9_h.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sep7_i.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sgo9_k.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sii7_m.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sjxy_o.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqs1j1mw_g.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqs1pl10_h.png`
- `apps/anieditorv5viewer/src/config/bundled-projects.ts`
- `apps/anieditorv5viewer/tests/bundled-projects.test.ts`
- `apps/anieditorv5viewer/tests/main.test.ts`

文档：

- `packages/vnicore/README.md`
- `packages/vnicore/docs/api-zh.md`
- `packages/vnicore/docs/usage-zh.md`
- `packages/vnicore/docs/migration-from-viewer-zh.md`
- `packages/vnicore/examples/README.md`

任务报告：

- `tasks/46-vnicore-safe-glow-node-insertion-260625-034429.md`

## 3. safe_glow 设计说明

`safe_glow` 不是旧 render effect：

- `VNIRenderEffectType` 仍然只有 `shatter | glow`。
- `isRenderEffectAnimationType("safe_glow")` 测试为 `false`。
- `data-vni-render-effect-sprites` 不统计 `safe_glow`。

`safe_glow` 的实现方式：

- 新增 `safe-glow-sampler.ts`，输出 `VNISafeGlowSpriteSample`。
- 参数为 `spread/minOpacity/maxOpacity/pulses/keepOriginal`。
- 采样公式与 editor `drawSafeGlow(...)` 对齐：同 texture、scale 乘 `1 + spread`、alpha 按 cosine wave 呼吸、固定 `blendMode: "normal"`。
- `alpha <= 0.002` 或 `spread <= 0.001` 时不输出 sprite。
- 缺失或错误类型参数显式抛错，不提供隐藏默认兜底。

`keepOriginal` 处理：

- `animation-sampler.ts` 让 `safe_glow` 复用 `glow` 的 source opacity 逻辑。
- `keepOriginal=false` 时 sampled source opacity 为 `0`。
- `project-sampler.ts` 增加 `hasActiveSafeGlowAnimation`，因此 `opacity=0` 时 layer 仍可保持 `visible=true`，但 `renderImageDisplay=false`。

起始帧处理：

- `getSafeGlowProgress(...)` 在 `time === startTime` 返回 `0`，不会沿用旧 render effect 的 `progress <= 0 ? null` 行为。
- core test 覆盖了起始帧可采样出 safe glow sprite。

diagnostics 区分：

- 新增 `data-vni-safe-glow-sprites`。
- `data-vni-render-effect-sprites` 继续只统计旧 `shatter/glow` render effect。
- `destroy()` / `clearDiagnostics()` 会清理 `data-vni-safe-glow-sprites`。

Pixi render order：

- 每层现在是 `display -> safeGlowDisplay -> effectDisplay -> particleDisplay`。
- safe glow sprite 使用原 texture、sampled anchor、editor-to-Pixi 位置、asset display compensation、radians rotation、normal blend。

## 4. lock_01 接入说明

JSON：

- `apps/anieditorv5viewer/src/assets/projects/lock_01.json`
- `packages/vnicore/tests/fixtures/export/lock_01.json`

7 张图片：

- `apps/anieditorv5viewer/src/assets/assets/2_asset_image_mqqlcjh9_h.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sep7_i.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sgo9_k.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sii7_m.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqp7sjxy_o.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqs1j1mw_g.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqs1pl10_h.png`

viewer project：

- id: `lock-01`
- filename: `lock_01.json`
- sourcePath: `docs/anieditor5/export/lock_01.json`
- bundleId/profileId/purpose/assetScale: `legacy` / `legacy_full` / `legacy` / `1`

浏览器验收摘要：

- `data-vni-project-id="lock-01"`
- `data-vni-time="0.56"`
- summary 包含 `schema VNI_0.017`、`4.00s duration`、`safe_glow`、`idle`、`particle_twinkle`
- `data-vni-safe-glow-sprites="5"`
- `data-vni-render-effect-sprites="0"`
- `data-vni-non-background-samples="1"`
- 无 `data-vni-pixel-sample-error`
- 组间插入状态：`无合法 slot`，插入按钮 disabled

## 5. 组间插入验收说明

使用 project：

- `3reel-multipay-01`

选择图片：

- `assets/2_asset_image_mqqlcjh9_h.png`

使用 slot：

- `下层光效 -> 上层光效`

diagnostics：

- 插入前：`data-vni-layer-groups="2"`，`data-vni-layer-group-slots="1"`
- 插入后：`data-vni-mounted-nodes="1"`，UI 状态 `已插入`
- 移除后：`data-vni-mounted-nodes="0"`，移除按钮 disabled
- 切换到 `lock-01` 后：状态重置为 `无合法 slot`，`data-vni-mounted-nodes="0"`

视觉证据：

- 截图：`/private/tmp/task46-3reel-inserted.png`
- 截图中 stage 中心可见插入图片，UI 显示 `已插入`。

viewer 没有直接操作 `VNIPlayer` 内部 Pixi tree；仍只调用：

- `getLayerGroupSlots()`
- `attachImageBetweenLayerGroups(...)`
- `attachExternalImageBetweenLayerGroups(...)`
- `clearMountedNodes()`

## 6. export2 非回归说明

资源合同检查：

- `docs/anieditor5/export2/manifest.json` 存在。
- `docs/anieditor5/export2/edit_full/project.json` 存在。
- `docs/anieditor5/export2/runtime_50/project.json` 存在。
- `runtime_50` 样例 asset：`width=730`、`height=735`、`fileWidth=365`、`fileHeight=368`、`fileScale=0.5`。

浏览器验收：

- `bigwin-edit-full`
  - summary 包含 `profile edit_full`、`purpose editing`、`assetScale 1`
  - `data-vni-bundle-id="export2"`
  - `data-vni-profile-id="edit_full"`
  - `data-vni-asset-scale="1"`
  - `data-vni-non-background-samples="1"`
  - 无 `data-vni-pixel-sample-error`
- `bigwin-runtime-50`
  - summary 包含 `profile runtime_50`、`purpose runtime`、`assetScale 0.5`
  - `data-vni-bundle-id="export2"`
  - `data-vni-profile-id="runtime_50"`
  - `data-vni-asset-scale="0.5"`
  - `data-vni-non-background-samples="1"`
  - 无 `data-vni-pixel-sample-error`

`runtime_50` 没有出现 texture size mismatch。

## 7. 测试命令和结果

环境：

- `pwd`: `/Users/zerro/github.com/slotclientengine`
- `node --version`: `v24.14.0`
- `pnpm --version`: `10.0.0`

vnicore：

- `pnpm --filter @slotclientengine/vnicore typecheck`: 通过
- `pnpm --filter @slotclientengine/vnicore test`: 通过，12 files / 134 tests，coverage 总体 statements 91.33 / branches 81.58 / functions 98.19 / lines 92.39
- `pnpm --filter @slotclientengine/vnicore lint`: 通过
- `pnpm --filter @slotclientengine/vnicore examples:typecheck`: 通过
- `pnpm --filter @slotclientengine/vnicore build`: 通过
- `pnpm --filter @slotclientengine/vnicore format:check`: 通过

viewer：

- `pnpm --filter anieditorv5viewer typecheck`: 通过
- `pnpm --filter anieditorv5viewer test`: 通过，2 files / 12 tests
- `pnpm --filter anieditorv5viewer lint`: 通过
- `pnpm --filter anieditorv5viewer build`: 通过，有 Vite chunk size warning，非失败
- `pnpm --filter anieditorv5viewer format:check`: 通过

仓库级：

- `git diff --check`: 通过
- `cmp -s AGENTS.md agents.md`: 通过
- `find apps/anieditorv5viewer/src/assets -name .DS_Store -print`: 无输出

## 8. 浏览器验收结果

dev server：

- 首次沙箱内启动 `127.0.0.1:5173` 被 `listen EPERM` 拦截。
- 使用提升权限重启成功。
- 实际 URL：`http://127.0.0.1:5173/`

关键 dataset：

```json
{
  "lock": {
    "project": "lock-01",
    "time": "0.56",
    "safeGlowSprites": "5",
    "renderEffectSprites": "0",
    "nonBackgroundSamples": "1",
    "insertionStatus": "无合法 slot",
    "insertDisabled": true
  },
  "insertion": {
    "project": "3reel-multipay-01",
    "selectedAsset": "assets/2_asset_image_mqqlcjh9_h.png",
    "slot": "下层光效 -> 上层光效",
    "mountedAfterInsert": "1",
    "mountedAfterRemove": "0",
    "switchResetProject": "lock-01",
    "switchResetStatus": "无合法 slot",
    "screenshot": "/private/tmp/task46-3reel-inserted.png"
  },
  "editFull": {
    "project": "bigwin-edit-full",
    "bundle": "export2",
    "profile": "edit_full",
    "assetScale": "1",
    "nonBackgroundSamples": "1"
  },
  "runtime50": {
    "project": "bigwin-runtime-50",
    "bundle": "export2",
    "profile": "runtime_50",
    "assetScale": "0.5",
    "nonBackgroundSamples": "1"
  }
}
```

## 9. AGENTS / agents 同步判断

未修改 `AGENTS.md` / `agents.md`。

原因：现有规则已经明确 `packages/vnicore` 拥有播放状态机、layer group render order 和 group slot 挂接语义，viewer 只能做 UI 配置、输入校验、状态展示和调用。本任务未新增必须长期写入仓库协作规则的约束。

`cmp -s AGENTS.md agents.md` 通过。

## 10. Cocos runtime 边界

`packages/anieditorv5runtime-cc` 未修改。

本任务没有改 Cocos runtime、standalone 单文件、standalone 测试或 `standalone.zip`。

## 11. pnpm-lock 状态

未新增 npm 依赖。

`pnpm-lock.yaml` 未变化。

## 12. 二次遗漏检查

- `docs/anieditor5/export/lock_01.json` 已复制到 viewer project 和 vnicore fixture。
- 7 张新增图片已全部复制到 `apps/anieditorv5viewer/src/assets/assets/`。
- `apps/anieditorv5viewer/src/assets` 下无新增 `.DS_Store`。
- `apps/anieditorv5viewer/src/config/bundled-projects.ts` 已注册 `lock-01`。
- `bigwin-edit-full` / `bigwin-runtime-50` 仍从 `export2/manifest.json` 注册并通过 profile 校验。
- `runtime_50` 保持 `assetScale 0.5`、`fileWidth/fileHeight/fileScale` 校验和显示补偿。
- `packages/vnicore/src/core/types.ts` / `animation-sampler.ts` / `validation.ts` 均包含 `safe_glow`。
- `safe_glow` 未进入 `render-effect-sampler` 的 effect type。
- `keepOriginal=false` 已有 core test 和 Pixi test。
- 起始帧 safe glow 已有 test。
- `data-vni-safe-glow-sprites` 已设置，并在 destroy/clear diagnostics 清理。
- 旧 `glow` / `shatter` / particle tests 通过。
- 组间插入 UI 在无 slot project 上 disabled，在双 group project 上可用。
- viewer 仍只调用 public `VNIPlayer` attach/clear API。
- `packages/vnicore/README.md`、`packages/vnicore/docs` 和 examples README 已同步。
- `packages/anieditorv5runtime-cc` 没有被任务 46 修改。
- `AGENTS.md` 和 `agents.md` 一致。
- `git diff --check` 通过。

## 13. 已知风险和未完成事项

- viewer build 保留 Vite chunk size warning，构建成功；本任务未调整打包拆包策略。
- 浏览器自动化期间出现一次 Codex/Statsig 外部网络日志，与本地 viewer 功能无关；本地验收数据来自 `127.0.0.1:5173` DOM dataset 和截图。
- 无未完成事项。
