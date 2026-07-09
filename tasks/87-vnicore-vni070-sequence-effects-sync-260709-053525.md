# 87 vnicore VNI_0.070 sequence effects sync 任务报告

## 执行结论

已按 `tasks/87-vnicore-vni070-sequence-effects-sync.md` 执行非浏览器部分。

- `packages/vnicore` 已支持 VNI_0.070 `sequence` layer、闭区间 timeline progress、10 个新增 deterministic effects、Pixi runtime texture 切帧和 effect display 池化。
- `apps/anieditorv5viewer` 仍保持上传 zip shell；没有恢复 `src/assets` 内置资源入口。
- 未修改 `packages/anieditorv5runtime-cc`、`standalone/` 或 `scripts/check-standalone.mjs`。
- 未修改 `docs/anieditor5/export`、`packages/vnicore/tests/fixtures/export` 或 `apps/anieditorv5viewer/src/assets`。
- 最终浏览器视觉验收按用户要求交由用户执行，本报告不声明浏览器验收已完成。

## 主要改动

- 新增 core helper：
  - `packages/vnicore/src/core/timeline-progress.ts`
  - `packages/vnicore/src/core/sequence-layer.ts`
  - `packages/vnicore/src/core/effect-sampler.ts`
- 扩展 VNI/V5G 类型和校验：
  - `V5GLayerType` 支持 `sequence`。
  - `V5GAnimationType` 支持 `gather_particles`、`smoke_mist`、`energy_ring`、`slash_light`、`flame_flicker`、`wave_band`、`wave_distort`、`speed_lines`、`drift_fall`、`path_particles`。
  - `sequence` 必须显式声明非空 `frameAssetIds`、正数 `cycleDuration` 和 boolean `loop`；frame asset 必须存在且为 image。
  - 只按编辑器合同兼容 `flame_flicker.speed`、`wave_distort.speed`、`drift_fall.fallSpeed` 三个旧字段。
- 调整采样边界：
  - `time === startTime` 返回 progress `0`。
  - `time === startTime + duration` 返回 progress `1`。
  - 只有 `time > end` 才 inactive。
- Pixi runtime：
  - image/sequence 都作为 texture-backed layer 处理。
  - sequence layer 在同一个 Pixi sprite 上切换当前帧 texture。
  - mask、粒子、render effects、safe glow、chaser light 和新增 deterministic effects 使用当前显示帧 texture/尺寸。
  - 新增 deterministic effects 分为 sprite、`wave_distort` texture slice、`speed_lines` Graphics line 三类渲染；运行时复用 display 对象并清理覆盖区外对象。
  - diagnostics 新增 `data-vni-deterministic-effect-sprites`。
- 测试：
  - 新增 `effect-sampler` 和 `sequence-layer` core 覆盖。
  - 扩展 validation sequence/effect 校验。
  - 扩展 Pixi player sequence 切帧与 deterministic effect display 复用/清理测试。
  - 更新旧边界测试，统一闭区间 progress 合同。
- 文档/协作规则：
  - 更新 `packages/vnicore/README.md`、`packages/vnicore/docs/api-zh.md`、`packages/vnicore/docs/usage-zh.md`、`packages/vnicore/docs/migration-from-viewer-zh.md`、`apps/anieditorv5viewer/README.md`。
  - 更新 `agents.md`，并确认 `AGENTS.md` 与 `agents.md` 内容一致。

## 验收命令

以下命令均已通过：

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

覆盖率结果摘要：

- `@slotclientengine/vnicore`: 15 test files passed, 187 tests passed, overall lines 92.27%, branches 81.87%。
- `anieditorv5viewer`: 2 test files passed, 25 tests passed, overall lines 94.44%, branches 77.86%。

曾经直接执行未带 `CI=true` 的 `pnpm --filter ... lint/format:check` 时，pnpm 在非 TTY 且网络受限环境中尝试依赖状态检查/安装，失败于 `ERR_PNPM_META_FETCH_FAIL` 和 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`；随后按任务计划要求使用 `CI=true` 重跑并通过。

## 二次审计

已执行并确认：

```bash
test ! -e apps/anieditorv5viewer/src/assets
git diff --name-only -- packages/anieditorv5runtime-cc standalone scripts/check-standalone.mjs
git diff --name-only -- docs/anieditor5/export packages/vnicore/tests/fixtures/export apps/anieditorv5viewer/src/assets
cmp -s AGENTS.md agents.md
```

结果：

- `apps/anieditorv5viewer/src/assets` 不存在。
- Cocos runtime / standalone / standalone check 脚本没有 diff。
- 导出 fixture、vnicore fixture、viewer 内置 assets 路径没有 diff。
- `AGENTS.md` 和 `agents.md` 内容一致。

注意：`docs/anieditor5/src/*` 在本任务开始前已经是用户提供的编辑器侧修改，本次实现没有回滚这些改动；vnicore 同步以这些编辑器 diff 为输入依据。

## 浏览器验收交接

最终浏览器验收由用户执行。建议手工路径：

```bash
CI=true pnpm --filter anieditorv5viewer build
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

在浏览器上传包含 VNI_0.070 `sequence` layer 和 10 个新增 effects 的 zip，重点检查：

- sequence layer 按 `cycleDuration` / `loop` 切帧。
- 新增 effects 与 `docs/anieditor5/src/pixi_stage.ts` Pixi 预览视觉一致。
- `time === startTime` 和 `time === end` 的首尾帧状态一致。
- `data-vni-deterministic-effect-sprites` 有合理统计，且不会与 render effect / safe glow 统计混淆。
- 上传缺 sequence frame、缺资源或非法参数的 zip 时显式失败。
