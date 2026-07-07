# 86 vnicore editor effect parity 任务报告

生成时间：2026-07-07 08:33:41 UTC

## 1. 实际更新内容

- `packages/vnicore` 增加 `project.maskCompositeMode` schema 字段解析；字段缺失保持 `undefined`，不从 layer mask 推断。
- `packages/vnicore` 明确 Pixi runtime 合同：`legacy_alpha` / Cocos-compatible 导出不是 vnicore 目标输入，项目级 `maskCompositeMode: "legacy_alpha"` 或启用的 `legacy_alpha` layer mask 均显式失败。
- 新增 `packages/vnicore/src/pixi/precomposed-light-mask.ts`，把编辑器 Pixi 预览里的 `precompose_light_alpha` 光效遮罩公式抽成可测试 runtime helper。
- `VNIPlayer` 对 image source/target 且 target blendMode 为 `add` / `screen` / `lighten` 的 `precompose_light_alpha` mask 使用 stage-sized 预合成 sprite；非 light blendMode 仍走普通 Pixi alpha mask。
- `apps/anieditorv5viewer` 继续只做上传 zip / profile / 控件 / summary，不复制 mask 算法；summary 增加 mask 与 Pixi light-mask 统计。
- 同步 `packages/vnicore`、`apps/anieditorv5viewer` 文档和 `agents.md` 的长期边界。

## 2. 关键文件

- `packages/vnicore/src/pixi/precomposed-light-mask.ts`
- `packages/vnicore/src/pixi/vni-player.ts`
- `packages/vnicore/src/core/types.ts`
- `packages/vnicore/src/core/validation.ts`
- `apps/anieditorv5viewer/src/ui/controls.ts`
- `packages/vnicore/tests/pixi/vni-player.test.ts`
- `packages/vnicore/tests/core/validation.test.ts`
- `apps/anieditorv5viewer/tests/main.test.ts`
- `apps/anieditorv5viewer/tests/uploaded-zip-project.test.ts`
- `agents.md`

## 3. vnicore 最终合同

`packages/vnicore` 是 Pixi.js v8 VNI runtime，目标是性能和编辑器 Pixi 预览效果一致；vnicore 使用的 VNI 导出不是 Cocos Creator 兼容版本，不为 `legacy_alpha` 增加隐藏适配。Cocos-compatible 路径继续属于 `packages/anieditorv5runtime-cc`。

## 4. precompose_light_alpha 实现

实现与编辑器公式对齐：

```text
sourceAlpha = targetAlpha / 255
lightAlpha = max(targetR, targetG, targetB) / 255 * sourceAlpha
maskAlpha = maskSourceAlpha / 255 * maskOpacity
outputAlpha = clamp(lightAlpha * maskAlpha, 0, 1)
targetAlpha = round(outputAlpha * 255)
```

runtime 使用 stage 尺寸 canvas，按 editor 坐标、layer transform、asset logical size 绘制 target/source，再生成 Pixi texture。预合成 sprite 使用 target blendMode 和 target opacity；原 target display alpha 置 0，避免普通图像和预合成结果双重叠加。

## 5. cache 和生命周期证据

- cache key 覆盖 mode、stage width/height、target/source layer、asset path/尺寸/file metadata、texture label/尺寸、target/source transform、target/source opacity、target blendMode。
- `packages/vnicore/tests/pixi/vni-player.test.ts` 覆盖同输入重复 `seek()` 不重建 canvas/texture，target transform 变化才重建，并验证旧 texture destroy。
- `clearMasks()` / mask 关闭 / `destroy()` 会清理 native mask sprite 与 precomposed texture。

## 6. fixture / zip 同步

- `git diff --name-only -- docs/anieditor5/export docs/anieditor5/*.zip` 无输出。
- 本任务没有真实导出 JSON 或 zip 变更，因此没有同步 `docs/anieditor5/export` 到 `packages/vnicore/tests/fixtures/export`。
- 没有手工改 `docs/anieditor5/export/*.json` 的版本号。

## 7. agents.md

已更新 `agents.md`，补充 vnicore 是 Pixi.js runtime、不能隐藏适配 Cocos-compatible `legacy_alpha`、效果以 `docs/anieditor5/src` Pixi 预览语义为准并保持缓存/池化性能边界。

## 8. 验收命令

首次未带 `CI=true` 的 pnpm scoped 命令触发依赖状态检查和非 TTY 提示；已按计划使用 `CI=true` 重跑。

全部通过：

```bash
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer format:check
git diff --check
```

二次检查已执行：

```bash
rg -n "maskCompositeMode|legacy_alpha|precompose_light_alpha|precompose|lightweightUi" docs/anieditor5 packages/vnicore apps/anieditorv5viewer packages/anieditorv5runtime-cc -g '!**/dist/**' -g '!**/coverage/**'
rg -n "VNI_0\\.042|VNI_0\\.045" docs/anieditor5 packages/vnicore apps/anieditorv5viewer packages/anieditorv5runtime-cc -g '!**/dist/**' -g '!**/coverage/**'
git diff --name-only -- docs/anieditor5/export docs/anieditor5/*.zip packages/anieditorv5runtime-cc
```

结论：`docs/anieditor5/export`、zip、`packages/anieditorv5runtime-cc` 均无 diff。

## 9. 浏览器验收 handoff

未执行浏览器验收。按用户要求，最终浏览器验收由用户执行：

```bash
pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1
```

建议手动上传：

```text
docs/anieditor5/roundreel.zip
docs/anieditor5/megawin.zip
```

重点确认 summary mask 信息、播放/暂停/seek/segmented playback、`precompose_light_alpha` 与编辑器 Pixi 预览视觉一致、重复 seek/play 无明显卡顿或 texture 泄漏。

## 10. 依赖和范围说明

- 未新增依赖。
- `pnpm-lock.yaml` 无变化。
- 未修改 `packages/anieditorv5runtime-cc`。
- 未恢复 `apps/anieditorv5viewer/src/assets`。
- 未处理无关的 `tasks/85-anieditorv5runtime-cc-playback-event-release-fix.md`。

## 11. 已知风险和后续建议

- 非浏览器测试已经覆盖像素公式、cache key、texture destroy 和 viewer 上传错误；真实视觉 parity 仍需浏览器对照编辑器 Pixi 预览确认。
- 当前 precompose helper 使用 canvas 读写像素，仅在 cache miss 或输入变化时运行；若后续 VNI 大量使用 stage-sized 光效遮罩，可再评估 RenderTexture/shader 优化，但必须保留像素等价测试。
