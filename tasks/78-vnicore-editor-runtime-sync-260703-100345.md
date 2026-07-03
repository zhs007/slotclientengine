# 任务 78 执行报告：vnicore editor runtime sync

## 1. 任务目标和完成范围

本次按 `tasks/78-vnicore-editor-runtime-sync.md` 执行，目标是让 `packages/vnicore` 和 `apps/anieditorv5viewer` 对齐 `docs/anieditor5/src` / `docs/anieditor5/export` 的当前导出语义，重点修正 `chaser_light`：灯位固定在轨迹点上，只推进亮灭窗口，不让灯片沿轨迹整体旋转或移动。

已完成范围：

- 修正 `packages/vnicore/src/core/chaser-light-sampler.ts` 的轨迹采样、圆形弧长公式、亮灭节奏、alpha/scale 语义。
- 保持 Pixi runtime 继续使用 `VNIPlayer` sprite pool，不在 viewer 私有层复制走马灯算法。
- 同步 `docs/anieditor5/export/*.json` 到 `packages/vnicore/tests/fixtures/export/*.json` 和 viewer 内置项目 JSON。
- 恢复 viewer `roundreel` 与 `docs/anieditor5/export/roundreel.json` 字节一致，移除临时 `roundreel222` 数据漂移。
- 更新 vnicore / viewer 测试、文档、示例说明和协作规则。
- 执行包级、根级和二次遗漏检查；根级失败项已单独分类为非本任务引入。

本次未新增第三方依赖，未执行 `pnpm install`，`pnpm-lock.yaml` 无变化。

## 2. 编辑器更新确认

本地实际确认 `docs/anieditor5/src/constants.ts` 当前版本为 `VNI_0.042`。`docs/anieditor5/src/main.ts` 中的 segment 播放、暂停、时间轴拖动、selection outline 等属于编辑器 UI / 操作体验，不复制进 runtime。runtime 本次重点同步 `docs/anieditor5/src/pixi_stage.ts` 中 `drawChaserLight()` / `sampleChaserLightPoint()` 的走马灯视觉语义。

旧 runtime 问题根因：

- 圆形轨迹把 `elapsed * 2PI` 加进 angle，导致灯位整体旋转。
- 圆形分布使用 `index / totalCount * 2PI`，没有按编辑器 `spacing / radius` 的弧长语义排布。
- 亮灯错位使用 `index * interval`，而编辑器使用 `index * (lightDuration + interval)`，导致亮灭速度偏快。
- 亮灯/暗灯 alpha 和 scale 波形与编辑器不一致。

## 3. 修改文件清单

- `packages/vnicore/src/core/chaser-light-sampler.ts`
- `packages/vnicore/tests/core/chaser-light-sampler.test.ts`
- `packages/vnicore/tests/pixi/vni-player.test.ts`
- `packages/vnicore/tests/core/validation.test.ts`
- `packages/vnicore/tests/fixtures/export/*.json`
- `packages/vnicore/README.md`
- `packages/vnicore/docs/api-zh.md`
- `packages/vnicore/docs/usage-zh.md`
- `packages/vnicore/docs/migration-from-viewer-zh.md`
- `packages/vnicore/examples/README.md`
- `apps/anieditorv5viewer/src/assets/projects/roundreel.json`
- `apps/anieditorv5viewer/tests/bundled-projects.test.ts`
- `apps/anieditorv5viewer/README.md`
- `agents.md`

## 4. 导出样例同步结果

以 `docs/anieditor5/export` 为源重新同步后：

- `packages/vnicore/tests/fixtures/export/*.json` 与 `docs/anieditor5/export/*.json` 字节一致。
- `apps/anieditorv5viewer/src/assets/project.json` 与 `docs/anieditor5/export/project.json` 字节一致。
- `apps/anieditorv5viewer/src/assets/projects/*.json` 与对应 `docs/anieditor5/export/*.json` 字节一致。
- `docs/anieditor5/export/assets` 与 `apps/anieditorv5viewer/src/assets/assets` 字节一致。
- `roundreel` 判定为 docs/export 的正式导出源；viewer 中临时 `roundreel222` 已恢复为 `roundreel`，二次 grep 未发现 `roundreel222` 残留。
- 新增 viewer 测试校验 bundled project 的 `sourcePath` JSON 与注册数据一致，避免再次出现 sourcePath 指向 docs/export 但运行数据不同步的问题。

## 5. 验收结果

环境：

- `node -v`：`v24.14.0`
- `pnpm -v`：`11.7.0`

已通过的本任务范围验收：

- `env CI=true pnpm --filter @slotclientengine/vnicore typecheck`
- `env CI=true pnpm --filter @slotclientengine/vnicore lint`
- `env CI=true pnpm --filter @slotclientengine/vnicore examples:typecheck`
- `env CI=true pnpm --filter @slotclientengine/vnicore format:check`
- `env CI=true pnpm --filter @slotclientengine/vnicore test`：13 个文件，157 个测试通过。
- `env CI=true pnpm --filter @slotclientengine/vnicore build`
- `env CI=true pnpm --filter anieditorv5viewer typecheck`
- `env CI=true pnpm --filter anieditorv5viewer lint`
- `env CI=true pnpm --filter anieditorv5viewer format:check`
- `env CI=true pnpm --filter anieditorv5viewer test`：2 个文件，20 个测试通过。
- `env CI=true pnpm --filter anieditorv5viewer build`：通过，仅有 Vite chunk size warning。
- `env CI=true pnpm --filter @slotclientengine/vnicore exec vitest run tests/core/chaser-light-sampler.test.ts tests/pixi/vni-player.test.ts tests/core/validation.test.ts`：3 个文件，74 个测试通过。
- `env CI=true pnpm --filter anieditorv5viewer exec vitest run tests/bundled-projects.test.ts`：1 个文件，10 个测试通过。
- `git diff --check`
- 导出 JSON 字节一致性检查。
- `diff -qr docs/anieditor5/export/assets apps/anieditorv5viewer/src/assets/assets`
- `rg roundreel222 ...`：无残留。
- 浏览器 smoke 验收：通过，见第 6 节。

根级命令结果：

- `env CI=true pnpm build`：通过，23/23 package 成功，仅有 Vite chunk size warning。
- `env CI=true pnpm lint`：通过，23/23 package 成功。
- `env CI=true pnpm typecheck`：失败于既有无关问题 `apps/uiframeworksviewer/tests/demo-game.test.ts(38,3)`，mock `SlotGameMountContext` 缺少 `getViewport` / `onViewportChange`。本任务修改范围不涉及 `apps/uiframeworksviewer`，且 `vnicore` / `anieditorv5viewer` 包级 typecheck 已通过。
- `env CI=true pnpm test`：失败于既有无关问题 `apps/symbolsviewer/tests/symbol-set-config.test.ts:200`，`builtinContext.sprite.scale.x` 期望大于 1，实际为 1。复跑 `env CI=true pnpm --filter symbolsviewer test` 复现同一失败；本任务修改范围不涉及 `apps/symbolsviewer`。
- `env CI=true pnpm format:check`：失败于仓库既有格式化问题，首个失败包为 `apps/gengameconfig`，并有其它未触及包 warning。本任务相关包 `@slotclientengine/vnicore` 与 `anieditorv5viewer` 的 format:check 均已单独通过。

## 6. 浏览器/可视化验收

浏览器 smoke 验收已执行。首次在沙箱内启动 dev server 因本地监听权限失败：

```text
Error: listen EPERM: operation not permitted 127.0.0.1:5173
```

随后按权限流程在沙箱外启动：

```bash
env CI=true pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1
```

实际验收 URL：

```text
http://127.0.0.1:5173/
```

已确认：

- 默认 `roundreel` 加载成功，页面摘要显示 `docs/anieditor5/export/roundreel.json`、`schema VNI_0.042`、`profile runtime_100`、`safe_glow, blink, scale_out, chaser_light`。
- `roundreel` 在 `t=0.00` 和 `t=0.12` 截图检查中保持同一组固定灯位，timeline seek 后 diagnostics 仍为 `vniChaserLightSprites=12`。
- 点击 `Play` 后 `roundreel` 正常播放，diagnostics 显示 `vniPlaybackPhase=start`、`vniChaserLightSprites=12`、`vniSafeGlowSprites=1`，无持续增长迹象。
- 切换 `number2` 成功，文字层下拉出现 `layer_text_mqz6k97v_z`；点击文字层替换“应用”后 diagnostics 显示 `vniTextLayerBindings=1`、`vniMountedNodes=1`，状态为“已替换”。
- 切换 `number3` 成功，diagnostics 显示 `vniMaskSprites=1`、`vniSafeGlowSprites=1`。
- 切换 `bigwin`、`megawin`、`superwin` 均成功，三者均显示 `profile runtime_50`、`assetScale 0.5`，canvas 保持 1 个。
- 浏览器页面错误日志为空。

保留给人工复核的视觉点：

- 在真实屏幕上连续播放 `roundreel`，肉眼确认走马灯只有亮灭窗口推进，灯位没有整体旋转。
- 长时间循环播放时观察 diagnostics 计数是否持续稳定。

## 7. AGENTS 更新

已更新 `agents.md`。原因是本任务沉淀出长期协作规则：`chaser_light` 灯位必须固定，动画只推进亮灭窗口；圆形 `spacing` 按弧长换算角度；每盏灯周期为 `lightDuration + interval`；不要把 `elapsed` 加进轨迹点采样，也不要在 viewer 私有逻辑中修正或复制 runtime 算法。

## 8. 已知未解决问题和后续建议

- 根级 `typecheck`、`test`、`format:check` 仍有非本任务范围的历史失败，见第 5 节；本任务相关包级验收已通过。
- 建议后续单独处理 `apps/uiframeworksviewer` 的 mock contract、`apps/symbolsviewer` scale 断言，以及根级历史格式化问题。
- 建议人工长时间视觉复核第 6 节保留项，尤其观察 `roundreel` 连续循环时的固定灯位和 diagnostics 稳定性。
