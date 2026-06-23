# anieditorv5viewer particle effects 任务报告

## 1. 任务目标回顾

本次按 `tasks/38-anieditorv5viewer-particle-effects.md` 执行，目标是更新 `apps/anieditorv5viewer`，让 Vite + TypeScript + Pixi.js viewer 支持 `docs/anieditor5/export` 当前导出的 VNI/V5G 单文件项目、新版粒子动画和 `squash_stretch` 弹性动画，并保留 `export2/runtime_50` 缩小资源按逻辑尺寸播放的能力。

重点合同：

- 新增 bundled project：`2x`、`5x`、`10x`、`respin`、`scatter1`、`scatter2`、`multipay`。
- 新增 animation type：`particle_wall`、`particle_combo`、`squash_stretch`。
- `particle_combo.sourceOpacity` 只控制源图层本身透明度，不能误杀 combo 粒子。
- 粒子必须按图层顺序渲染，不能全部放到全局最顶层。
- 未知 type/easing/blend mode、缺失资源、缺失必须 numeric param、numeric string、贴图尺寸不匹配都显式失败。

## 2. 实际修改文件清单

本次 viewer 侧修改：

- `apps/anieditorv5viewer/README.md`
- `apps/anieditorv5viewer/src/config/bundled-projects.ts`
- `apps/anieditorv5viewer/src/runtime/animation-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/layer-instance.ts`
- `apps/anieditorv5viewer/src/runtime/particle-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/project-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/v5g-player.ts`
- `apps/anieditorv5viewer/src/runtime/validation.ts`
- `apps/anieditorv5viewer/src/v5g/types.ts`
- `apps/anieditorv5viewer/tests/runtime/animation-sampler.test.ts`
- `apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts`
- `apps/anieditorv5viewer/tests/runtime/particle-sampler.test.ts`
- `apps/anieditorv5viewer/tests/runtime/project-sampler.test.ts`
- `apps/anieditorv5viewer/tests/runtime/validation.test.ts`
- `apps/anieditorv5viewer/tests/runtime/v5g-player.test.ts`

资源同步新增/更新：

- `apps/anieditorv5viewer/src/assets/project.json`
- `apps/anieditorv5viewer/src/assets/projects/{bigwin,megawin,superwin,2x,5x,10x,respin,scatter1,scatter2,multipay}.json`
- `apps/anieditorv5viewer/src/assets/assets/*`
- `apps/anieditorv5viewer/src/assets/export2/*`

保留但未修改的输入侧已有改动：

- `docs/anieditor5/src/animation_presets.ts`
- `docs/anieditor5/src/constants.ts`
- `docs/anieditor5/src/main.ts`
- `docs/anieditor5/src/pixi_stage.ts`
- `docs/anieditor5/src/types.ts`
- `docs/anieditor5/src/workspace_storage.ts`
- `docs/anieditor5/export/*`

## 3. 资源同步结果

已执行资源同步：

- `docs/anieditor5/export/project.json` 同步到 `apps/anieditorv5viewer/src/assets/project.json`。
- `docs/anieditor5/export/{bigwin,megawin,superwin,2x,5x,10x,respin,scatter1,scatter2,multipay}.json` 同步到 `apps/anieditorv5viewer/src/assets/projects/`。
- `docs/anieditor5/export/assets/` 同步到 `apps/anieditorv5viewer/src/assets/assets/`。
- `docs/anieditor5/export2/` 同步到 `apps/anieditorv5viewer/src/assets/export2/`。

资源审计结果：

- `find apps/anieditorv5viewer/src/assets -name .DS_Store -print` 无输出。
- 资源引用审计输出：`all referenced assets exist 60`。
- 当前 `docs/anieditor5/export/*.json` 合计唯一 `asset.path` 数量：`60`。

导出摘要：

| JSON | name | schema/editor | layers | assets | particles | 重点动画 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `project.json` | `胜利测试` | `V5G_0.0014` / `victory_editor_v5_g` | 5 | 4 | 0 | `scale_up`, `fade`, `rotate`, `move`, `scale_down` |
| `bigwin.json` | `bigwin` | `V5G_0.0043` / `victory_editor_v5_g` | 9 | 9 | 0 | `particles`, `particle_twinkle`, `pulse`, `shake`, `slide_in` |
| `megawin.json` | `megawin` | `V5G_0.0014` / `victory_editor_v5_g` | 10 | 9 | 0 | `particles`, `particle_twinkle`, `move`, `shake`, `pulse` |
| `superwin.json` | `superwin` | `V5G_0.0051` / `victory_editor_v5_g` | 9 | 9 | 0 | `particles`, `particle_twinkle`, `scale_up`, `move` |
| `2x.json` | `2x` | `VNI_0.003` / `VNI` | 5 | 5 | 0 | `pop`, `blink`, `scale_out`, `particle_twinkle` |
| `5x.json` | `5x` | `VNI_0.003` / `VNI` | 5 | 5 | 0 | `pop`, `blink`, `scale_out`, `particle_twinkle` |
| `10x.json` | `10x` | `VNI_0.003` / `VNI` | 5 | 5 | 0 | `pop`, `blink`, `scale_out`, `particle_twinkle` |
| `respin.json` | `respin` | `VNI_0.003` / `VNI` | 8 | 7 | 0 | `pop`, `blink`, `scale_out`, `particle_twinkle` |
| `scatter1.json` | `SCATTER1` | `VNI_0.010` / `VNI` | 8 | 8 | 0 | `squash_stretch`, `particles`, `pop`, `blink`, `scale_out` |
| `scatter2.json` | `SCATTER2` | `VNI_0.010` / `VNI` | 8 | 8 | 0 | `squash_stretch`, `particles`, `pop`, `blink`, `scale_out` |
| `multipay.json` | `MultiPay` | `VNI_0.010` / `VNI` | 8 | 8 | 0 | `particle_wall`, `particle_combo`, `blink`, `scale_up` |

## 4. 新增 animation type 支持

`particle_wall`：

- 已加入 `V5GAnimationType`、`SUPPORTED_ANIMATION_TYPES`、`PARTICLE_ANIMATION_TYPES`。
- 校验必需 numeric params：`emitterWidth`、`direction`、`spreadAngle`、`speed`、`lifetimeMin`、`lifetimeMax`、`spawnRate`、`size`、`gravity`、`startScaleMin`、`startScaleMax`、`endScaleMin`、`endScaleMax`。
- `fadeOut` 作为可选 boolean，缺省为 `true`。
- 粒子采样保持编辑器预览的 deterministic salt `101..105`。

`particle_combo`：

- 已加入 `V5GAnimationType`、`SUPPORTED_ANIMATION_TYPES`、`PARTICLE_ANIMATION_TYPES`。
- `sourceOpacity` 在 `animation-sampler.ts` 中只改变源图层 opacity。
- `particle-sampler.ts` 中 combo 粒子使用 layer base opacity，不被 `sourceOpacity=0` 或源图层显示 opacity 误杀。
- 轨迹、拖尾、vanish、`targetY` 方向、salt `301..305` 已按编辑器预览逻辑移植。

`squash_stretch`：

- 已加入 `V5GAnimationType`、`SUPPORTED_ANIMATION_TYPES`。
- 默认 easing 为 `easeOutQuad`。
- 支持 `fromX/fromY -> toX/toY` 位移叠加、`squashAngle`、`squashAmount`、单次 overshoot 和衰减震荡。

## 5. fail-fast 行为

继续显式失败：

- 缺失资源：`resolveProjectAssetUrls` 和 `V5GPlayer.loadTexture` 抛错。
- 缺失必须 numeric param：`validateV5GProject` 抛错。
- numeric param 为字符串：不解析为数字，校验失败。
- unknown animation type：`validateV5GProject` 抛错。
- unknown easing：`validateV5GProject` / sampler 抛错。
- unknown blend mode：`validateV5GProject` 抛错。
- 贴图尺寸不匹配：`V5GPlayer.loadTexture` 按 `fileWidth/fileHeight` 或原图尺寸抛错。
- top-level `project.particles`、group layer、non-null `parentId`、non-empty keyframes、profile mismatch 继续失败。

## 6. 测试命令和结果

已执行：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

结果：

- `typecheck`：通过。
- `lint`：通过。
- `test`：通过，`8 passed`，`75 passed`。
- `build`：通过，Vite build 成功。
- `format:check`：通过。

说明：

- `pnpm --filter anieditorv5viewer test` 生成了 app-local coverage 目录，这是测试产物。
- `pnpm --filter anieditorv5viewer build` 生成了 app-local dist 目录，这是构建产物。

## 7. 浏览器验收

启动命令：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

实际端口：`5175`。

浏览器自动化覆盖 selector 全部项目：

```text
project
bigwin
megawin
superwin
2x
5x
10x
respin
scatter1
scatter2
multipay
bigwin-edit-full
bigwin-runtime-50
```

通用浏览器断言：

- 每次切换后 `canvasCount = 1`，旧 canvas 未残留。
- `data-v5g-project-id` 与当前项目一致。
- `data-vni-bundle-id`、`data-vni-profile-id`、`data-vni-asset-scale` 与 bundled 配置一致。
- 每个项目执行了 play、pause、Restart、Loop toggle、timeline seek。
- 每个项目在采样时间 `data-v5g-non-background-samples > 0`。
- 非粒子项目 `data-v5g-particle-sprites = 0`。
- 粒子项目中段 `data-v5g-particle-sprites > 0`。
- 0 秒首帧 `data-v5g-particle-sprites = 0`，没有 progress <= 0 粒子泄漏。
- 页面 console error：`0`。

关键浏览器证据：

| project | 采样时间 | particle sprites | non-background samples | bundle/profile/scale |
| --- | ---: | ---: | ---: | --- |
| `project` | 0.65 | 0 | 7 | `legacy/legacy_full/1` |
| `bigwin` | 0.70 | 30 | 3 | `legacy/legacy_full/1` |
| `megawin` | 2.10 | 6 | 7 | `legacy/legacy_full/1` |
| `superwin` | 0.90 | 29 | 3 | `legacy/legacy_full/1` |
| `2x` | 9.50 | 4 | 1 | `legacy/legacy_full/1` |
| `5x` | 9.50 | 4 | 1 | `legacy/legacy_full/1` |
| `10x` | 9.50 | 4 | 1 | `legacy/legacy_full/1` |
| `respin` | 9.50 | 4 | 1 | `legacy/legacy_full/1` |
| `scatter1` | 0.50 | 50 | 1 | `legacy/legacy_full/1` |
| `scatter2` | 0.50 | 50 | 1 | `legacy/legacy_full/1` |
| `multipay` | 3.15 | 220 | 3 | `legacy/legacy_full/1` |
| `bigwin-edit-full` | 0.70 | 30 | 3 | `export2/edit_full/1` |
| `bigwin-runtime-50` | 0.70 | 30 | 3 | `export2/runtime_50/0.5` |

专项证据：

- `multipay`：
  - `0.00s` 粒子数 `0`。
  - `0.50s` combo 粒子数 `137`，non-background samples `3`。
  - `3.00s` wall 粒子数 `216`。
- `scatter1`：
  - `0.50s` 粒子数 `50`，non-background samples `1`，maxDelta `715`。
- `export2` 对比：
  - `bigwin-edit-full @ 2.10s`：profile `edit_full`，assetScale `1`，non-background samples `3`，particles `6`。
  - `bigwin-runtime-50 @ 2.10s`：profile `runtime_50`，assetScale `0.5`，non-background samples `3`，particles `6`。
  - 说明 50% 文件像素未导致构图缩小一半。

浏览器工具侧出现过一次 Statsig 统计请求超时日志，页面 app 自身 `errors: []`，不属于 viewer 错误。

## 8. 协作规则、依赖和 lockfile

- 未更新 `AGENTS.md` / `agents.md`：本任务未改变仓库协作规则、目录规范、基础脚本或通用执行约定。
- 未新增 npm 依赖。
- 未执行 `pnpm install`。
- `pnpm-lock.yaml` 未变化。

## 9. 二次遗漏检查

已检查：

- `tasks/38-anieditorv5viewer-particle-effects.md` 存在。
- 本报告 `tasks/38-anieditorv5viewer-particle-effects-260623-040554.md` 已新增。
- 新增 JSON 已进入 viewer 资源目录。
- 新增图片资源已同步到 viewer 资源目录。
- `find apps/anieditorv5viewer/src/assets -name .DS_Store -print` 无输出。
- `apps/anieditorv5viewer/src/config/bundled-projects.ts` 的 import、`BundledProjectId` 和项目定义一致。
- `apps/anieditorv5viewer/src/runtime/asset-manifest.ts` 仍保留 export2 profile-scoped manifests。
- `apps/anieditorv5viewer/src/runtime/project-sampler.ts` 不再用 active particle 自动隐藏源图层。
- `apps/anieditorv5viewer/src/runtime/particle-sampler.ts` 覆盖 `particle_wall` / `particle_combo` 确定性输出和 0 秒边界。
- `apps/anieditorv5viewer/src/runtime/v5g-player.ts` 覆盖 per-layer particle container、粒子数量诊断和 destroy 清理。
- `apps/anieditorv5viewer/README.md` 已同步支持范围。
- 没有新增 Cocos Creator app。
- 没有把 viewer runtime 抽到 `packages/anieditorv5runtime-cc`。
- 没有修改 `packages/gameframeworks`、`packages/rendercore` 等无关包。

遗留问题：无。
