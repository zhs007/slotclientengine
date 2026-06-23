# 39-vnicore-bootstrap 执行报告

UTC 时间：260623-050636

## 1. 任务摘要

已新增 `packages/vnicore`，包名为 `@slotclientengine/vnicore`，定位为 Pixi.js v8 的 VNI 动画运行时核心库。`apps/anieditorv5viewer` 已迁移为依赖该包，只保留 viewer 外壳、内置资源导入、项目列表、UI 控件和页面装配。

本次迁移保留了现有 VNI/V5G export JSON 校验、采样、粒子、profile-scoped asset manifest、`runtime_50` 贴图尺寸补偿、Pixi 渲染和 diagnostics 行为，并新增 Pixi 版 `playRange`、marker、complete listener 等播放控制接口。

执行过程中发现并修正一个验收问题：初始 build 只生成 root JS，未生成 `dist/core/index.js` 和 `dist/pixi/index.js`。已改为 `tsc -p tsconfig.build.json` 输出目录结构，并将源码相对 import/export 改为 `.js` 后缀，当前 subpath exports 与 dist 输出一致。

## 2. 文件变更

新增：

- `packages/vnicore/package.json`
- `packages/vnicore/README.md`
- `packages/vnicore/docs/usage-zh.md`
- `packages/vnicore/docs/api-zh.md`
- `packages/vnicore/docs/migration-from-viewer-zh.md`
- `packages/vnicore/examples/README.md`
- `packages/vnicore/examples/basic-player.ts`
- `packages/vnicore/examples/playback-events.ts`
- `packages/vnicore/examples/validate-project.ts`
- `packages/vnicore/examples/vite-asset-manifest.ts`
- `packages/vnicore/src/index.ts`
- `packages/vnicore/src/core/*.ts`
- `packages/vnicore/src/pixi/*.ts`
- `packages/vnicore/tests/core/*.test.ts`
- `packages/vnicore/tests/pixi/vni-player.test.ts`
- `packages/vnicore/tests/fixtures/**`
- `packages/vnicore/tests/setup.ts`
- `packages/vnicore/tsconfig*.json`
- `packages/vnicore/eslint.config.cjs`
- `packages/vnicore/vite.config.ts`
- `packages/vnicore/.prettierignore`
- `apps/anieditorv5viewer/tests/bundled-projects.test.ts`
- `apps/anieditorv5viewer/tests/main.test.ts`
- 本报告文件

修改：

- `agents.md`
- `apps/anieditorv5viewer/README.md`
- `apps/anieditorv5viewer/package.json`
- `apps/anieditorv5viewer/vite.config.ts`
- `apps/anieditorv5viewer/src/main.ts`
- `apps/anieditorv5viewer/src/config/bundled-projects.ts`
- `apps/anieditorv5viewer/src/runtime/asset-manifest.ts`
- `apps/anieditorv5viewer/src/ui/controls.ts`
- `pnpm-lock.yaml`

删除 viewer 私有核心实现和对应 runtime 单测：

- `apps/anieditorv5viewer/src/runtime/animation-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/blend-mode.ts`
- `apps/anieditorv5viewer/src/runtime/coordinates.ts`
- `apps/anieditorv5viewer/src/runtime/layer-instance.ts`
- `apps/anieditorv5viewer/src/runtime/particle-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/project-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/v5g-player.ts`
- `apps/anieditorv5viewer/src/runtime/validation.ts`
- `apps/anieditorv5viewer/src/v5g/types.ts`
- `apps/anieditorv5viewer/tests/runtime/*.test.ts`

`pnpm-lock.yaml` 已变化：新增 workspace 依赖 `@slotclientengine/vnicore`，并记录 viewer 新的 `happy-dom` 测试依赖。

## 3. Public API 和 exports

`@slotclientengine/vnicore` 提供三个 public surface：

- `@slotclientengine/vnicore`
- `@slotclientengine/vnicore/core`
- `@slotclientengine/vnicore/pixi`

`./core` 导出类型、校验、采样和 asset manifest 纯函数，包括 `VNIProjectConfig`、`VNIBundleManifest`、`assertVNIProject`、`validateVNIProject`、`assertVNIBundleManifest`、`validateVNIBundleManifest`、`validateManifestProjectProfile`、`sampleProjectAtTime`、`sampleLayerAtTime`、`sampleParticleSpritesForLayer`、`createAssetUrlManifest`、`resolveProjectAssetUrls` 等。

`./pixi` 导出 `VNIPlayer`、`VNIPlayerOptions`、`VNIPlaybackRange`、`VNIPlayRangeOptions`、`VNIPlaybackEventOptions`、`VNIPlaybackEventContext`、`VNIPlaybackCompleteContext` 等。保留 `V5G*` legacy schema alias，并在 README 和测试中说明 alias 只用于历史数据兼容，新 app 代码使用 `VNIPlayer`。

exports 和 dist 已复核：

- `packages/vnicore/dist/index.js`
- `packages/vnicore/dist/core/index.js`
- `packages/vnicore/dist/pixi/index.js`
- `packages/vnicore/dist/index.d.ts`
- `packages/vnicore/dist/core/index.d.ts`
- `packages/vnicore/dist/pixi/index.d.ts`

补充在真实依赖方目录 `apps/anieditorv5viewer` 执行 Node ESM import：

```bash
node -e "const core = await import('@slotclientengine/vnicore/core'); const pixi = await import('@slotclientengine/vnicore/pixi'); if (typeof core.assertVNIProject !== 'function' || typeof pixi.VNIPlayer !== 'function') throw new Error('vnicore subpath export check failed'); console.log('vnicore subpath exports ok')"
```

结果：`vnicore subpath exports ok`。

## 4. 播放接口实现和测试

`VNIPlayer` 保留 `init`、`play`、`pause`、`restart`、`seek`、`setLoop`、`getLoop`、`getTime`、`isPlaying`、`destroy`，并新增：

- `update(deltaSeconds)`
- `playRange(options)`
- `addPlaybackEvent(options)`
- `clearPlaybackEvent(id)`
- `clearPlaybackEvents()`
- `onPlaybackComplete(listener)`

测试覆盖了 time/frame range、显式 fps、open-ended end、非法 range 失败、非循环 complete、循环跨 end 回到 start、大 delta 跨多个 marker、多圈循环 marker、marker 与 end 同时发生时 marker 先于 complete、`once` marker 自动移除、disposer 幂等、seek/init/restart 不触发 marker、pause 后 update 不触发 marker、listener 抛错向外传播、全时长播放 complete。

## 5. Cocos 边界

`vnicore` 是 Pixi.js v8 runtime core，不替代 `packages/anieditorv5runtime-cc`。本次没有让 `packages/anieditorv5runtime-cc` 依赖 `vnicore`，也没有让 `vnicore` import `cc`、Cocos adapter、standalone zip 或 Cocos Component 示例。

复核结果：`rg -n "\b(cc|Cocos|anieditorv5runtime-cc)\b" packages/vnicore/src packages/vnicore/examples` 无命中。

## 6. 文档和示例

已新增：

- `packages/vnicore/README.md`：包定位、public imports、legacy alias、fail-fast、命令入口。
- `packages/vnicore/docs/usage-zh.md`：安装、最小 player 用法、生命周期、playRange/marker/complete、diagnostics、`runtime_50`。
- `packages/vnicore/docs/api-zh.md`：root/core/pixi import surface、主要类型、函数、player 方法、stable surface。
- `packages/vnicore/docs/migration-from-viewer-zh.md`：viewer 私有 runtime 到 vnicore 的迁移对照、app/core 职责边界、Cocos 边界。
- `packages/vnicore/examples/basic-player.ts`：创建、init、play、seek、destroy。
- `packages/vnicore/examples/playback-events.ts`：playRange、marker、complete、disposer、显式 fps。
- `packages/vnicore/examples/validate-project.ts`：assert/validate 和显式失败。
- `packages/vnicore/examples/vite-asset-manifest.ts`：宿主 app 侧 `import.meta.glob` 到 `AssetUrlManifest` 的转换。

`pnpm --filter @slotclientengine/vnicore examples:typecheck` 已通过。

## 7. Viewer 迁移

`apps/anieditorv5viewer` 已改为：

- `package.json` 依赖 `@slotclientengine/vnicore: workspace:*`，移除直接 `pixi.js` dependency。
- `build`、`dev`、`typecheck` 先执行 `prepare:deps` 构建 vnicore。
- `vite.config.ts` 增加 `@slotclientengine/vnicore`、`/core`、`/pixi` alias，并允许跨 workspace 读源码。
- `src/main.ts` 从 `@slotclientengine/vnicore/pixi` 导入 `VNIPlayer`。
- `src/config/bundled-projects.ts`、`src/ui/controls.ts` 从 `@slotclientengine/vnicore/core` 导入类型和校验。
- `src/runtime/asset-manifest.ts` 只保留 Vite `import.meta.glob` 和调用 vnicore core 纯函数。

`import.meta.glob` 复核结果：只存在于 `packages/vnicore/examples/vite-asset-manifest.ts`、示例说明、viewer asset glue 中；`packages/vnicore/src` 不包含。

## 8. 协作规则

已更新 `agents.md`，新增 `packages/vnicore` 目录定位，并明确它是 Pixi.js v8 VNI 动画核心库，不要与 Cocos Creator runtime 混用。

执行 `find . -maxdepth 1 -iname 'agents.md' -print` 仅发现 `./agents.md`，仓库根不存在单独的 `AGENTS.md`，无需双文件同步。

## 9. 验收命令

环境：

- `node -v`：`v24.14.0`
- `pnpm -v`：`10.0.0`
- `pnpm install`：通过
- `pnpm list --filter @slotclientengine/vnicore --depth -1`：识别 `@slotclientengine/vnicore@0.1.0`

vnicore 单包：

- `pnpm --filter @slotclientengine/vnicore typecheck`：通过
- `pnpm --filter @slotclientengine/vnicore lint`：通过
- `pnpm --filter @slotclientengine/vnicore examples:typecheck`：通过
- `pnpm --filter @slotclientengine/vnicore test`：通过，8 files，93 tests
- `pnpm --filter @slotclientengine/vnicore build`：通过
- `pnpm --filter @slotclientengine/vnicore format:check`：通过

vnicore coverage：

- statements：91.35
- branches：80.93
- functions：97.43
- lines：92.46

coverage 配置包含 thresholds：lines/functions/branches/statements 均为 80。排除项为 `src/**/types.ts` 和 `src/**/index.ts`；`types.ts` 为纯类型文件，`index.ts` 为纯 barrel export，核心实现文件未排除。

viewer：

- `pnpm --filter anieditorv5viewer typecheck`：通过
- `pnpm --filter anieditorv5viewer lint`：通过
- `pnpm --filter anieditorv5viewer test`：通过，2 files，5 tests
- `pnpm --filter anieditorv5viewer build`：通过
- `pnpm --filter anieditorv5viewer format:check`：通过

根级回归：

- `pnpm typecheck`：通过，21/21
- `pnpm lint`：通过，21/21
- `pnpm test`：通过，21/21
- `pnpm build`：通过，21/21
- `git diff --check`：通过
- `git status --short`：仅显示本任务预期变更，以及任务计划文件 `tasks/39-vnicore-bootstrap.md` 本身仍为 untracked

根级 `pnpm format:check`：未通过。最后一次失败点为未改动的 `@slotclientengine/pixiani`：

- `packages/pixiani/src/ani/index.ts`
- `packages/pixiani/src/core/index.ts`
- `packages/pixiani/src/index.ts`
- `packages/pixiani/src/layout.ts`
- `packages/pixiani/tests/layout.test.ts`
- `packages/pixiani/tsconfig.build.json`
- `packages/pixiani/tsconfig.eslint.json`

同一轮还报告了未改动包的 ignored coverage 输出，例如 `packages/rendercore/coverage/base.css`、`apps/uiframeworksviewer/coverage/base.css`。早一轮根级格式检查也命中过未改动的 `apps/gameclientcli` 三个文件。上述路径与本任务 diff 无关，且本任务触碰的 `@slotclientengine/vnicore` 和 `anieditorv5viewer` 已单独 `format:check` 通过。

## 10. 浏览器验收

启动命令：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

首次在 sandbox 内启动失败，错误为 `listen EPERM`；随后按权限要求使用 escalated dev server 重跑，通过。验收完成后已停止 dev server。

打开：

```text
http://127.0.0.1:5175/
```

默认项目点击播放后：

- canvas 数量：1
- `data-vni-project-id` / `data-v5g-project-id`：`project`
- `data-vni-time`：约 `0.93`
- visible layers：5
- non-background samples：10
- max pixel delta：686
- 页面 console errors：无

项目切换覆盖：

- `project`
- `bigwin`
- `megawin`
- `superwin`
- `2x`
- `5x`
- `10x`
- `respin`
- `scatter1`
- `scatter2`
- `multipay`
- `bigwin-edit-full`
- `bigwin-runtime-50`

每次切换后 selector 与 diagnostics project/profile 匹配，canvas 数量保持 1，页面 console errors 为空。

关键 profile：

- `bigwin-edit-full`：`data-vni-bundle-id=export2`，`data-vni-profile-id=edit_full`，`data-vni-asset-scale=1`，`data-vni-profile-purpose=editing`，non-background samples 为 1，max pixel delta 为 723。
- `bigwin-runtime-50`：`data-vni-bundle-id=export2`，`data-vni-profile-id=runtime_50`，`data-vni-asset-scale=0.5`，`data-vni-profile-purpose=runtime`，non-background samples 为 1，max pixel delta 为 719。

`multipay` 粒子验收：

- 播放约 1.4 秒后 `data-vni-time` 约 `1.63`
- visible layers：6
- `data-vni-particle-sprites` / `data-v5g-particle-sprites`：50
- non-background samples：3
- max pixel delta：538
- 页面 console errors：无

浏览器工具自身曾打印一次 Statsig 网络 timeout，但页面 console error 列表为空，未作为 app 异常。

## 11. 第二遍遗漏检查

- `packages/vnicore` 已被 pnpm workspace 识别。
- `@slotclientengine/vnicore` exports 与 dist 输出一致，已补齐 `dist/core/index.js` 和 `dist/pixi/index.js`。
- `dist` 由 build 生成，未手写；根 `.gitignore` 已忽略 `dist`。
- coverage threshold 已写在 `packages/vnicore/vite.config.ts`，不是只写 README。
- `packages/vnicore/docs/*.md` 覆盖 usage、API、viewer 迁移。
- `packages/vnicore/examples/*.ts` 已通过 `examples:typecheck`，未依赖 viewer 私有路径。
- viewer 不再 import `./runtime/v5g-player`、`./runtime/animation-sampler` 等已迁移核心模块。
- viewer 不再保留双份 `src/v5g/types.ts`。
- `apps/anieditorv5viewer/src/runtime` 仅剩 Vite asset manifest glue。
- `export2` `edit_full` / `runtime_50` asset URL manifest 仍保持 profile-scoped。
- `runtime_50` texture file size 校验仍使用 `fileWidth` / `fileHeight`。
- `particle_combo.sourceOpacity = 0` 已在 vnicore 测试中覆盖，保持原图层隐藏但粒子仍出现。
- `progress <= 0` 粒子不渲染已在 vnicore 测试中覆盖。
- `destroy()` 清理 RAF、ResizeObserver、particles、diagnostics 已在 vnicore 测试中覆盖。
- 浏览器验收已切换 `multipay`、`bigwin-edit-full`、`bigwin-runtime-50`。
- `agents.md` 已记录 `packages/vnicore` 边界。
- 报告已按 UTC 命名写入 `tasks/`。
- `git diff --check` 通过。
- `git status --short` 中除报告和本任务预期改动外，还显示任务计划文件 `tasks/39-vnicore-bootstrap.md` 为 untracked；该文件是本次执行输入计划，未作为实现改动处理。

## 12. 后续建议

根级 `pnpm format:check` 的失败不是本任务改动造成，但会持续影响全仓格式验收。建议后续单独开任务处理 `packages/pixiani`、`apps/gameclientcli` 以及各包 coverage 输出进入 Prettier 检查范围的问题，避免以后每个严格验收任务都重复撞到同一个基线噪音。
