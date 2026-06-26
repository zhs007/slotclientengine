# 53 vnicore runtime bundle profiles 执行报告

## 1. 结论

已按用户修正后的合同完成实现：

- `roundreel` 不再作为未来 `export2` 长期合同接入；已按 `docs/anieditor5/export` 的单项目 JSON + 共享 `assets/` 资源池方式接入。
- `runtime_100`、`assetScale`、`purpose` 等运行包语义来自 JSON 的 `exportProfile`，不从目录名或文件名推断。
- `safe_glow` 在 `packages/vnicore` 中仍是同图副本、缩放和透明度呼吸，不使用滤镜或模糊；副本现在继承图层 `blendMode`，不再固定为 `normal`。
- 旧 `docs/anieditor5/export2` 的 `bigwin edit_full/runtime_50` 保留为非回归 fixture；未继续扩展为新 `roundreel` bundle。
- 未修改 `packages/anieditorv5runtime-cc`、standalone runtime 或 zip。

浏览器验收由用户接手。dev server 已启动：

```text
http://127.0.0.1:5175/
```

## 2. 实际修改文件

核心实现：

- `packages/vnicore/src/core/safe-glow-sampler.ts`
- `packages/vnicore/src/core/validation.ts`
- `apps/anieditorv5viewer/src/config/bundled-projects.ts`

测试：

- `packages/vnicore/tests/core/safe-glow-sampler.test.ts`
- `packages/vnicore/tests/pixi/vni-player.test.ts`
- `packages/vnicore/tests/core/validation.test.ts`
- `packages/vnicore/tests/core/asset-manifest.test.ts`
- `packages/vnicore/tests/fixtures/export/roundreel.json`
- `apps/anieditorv5viewer/tests/bundled-projects.test.ts`
- `apps/anieditorv5viewer/tests/main.test.ts`

资源：

- `docs/anieditor5/export/roundreel.json`
- `docs/anieditor5/export/assets/gx_6_asset_image_mqthi919_1e.png`
- `docs/anieditor5/export/assets/image_asset_image_mqtjdi3v_3.jpg`
- `apps/anieditorv5viewer/src/assets/projects/roundreel.json`
- `apps/anieditorv5viewer/src/assets/assets/gx_6_asset_image_mqthi919_1e.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqtjdi3v_3.jpg`

文档：

- `packages/vnicore/README.md`
- `packages/vnicore/docs/api-zh.md`
- `packages/vnicore/docs/usage-zh.md`
- `packages/vnicore/examples/README.md`
- `apps/anieditorv5viewer/README.md`

本任务输入侧已有 editor diff，已保留并按影响分类记录：

- `docs/anieditor5/src/animation_presets.ts`
- `docs/anieditor5/src/constants.ts`
- `docs/anieditor5/src/export_project.ts`
- `docs/anieditor5/src/main.ts`
- `docs/anieditor5/src/pixi_stage.ts`
- `docs/anieditor5/src/project_state.ts`
- `docs/anieditor5/src/types.ts`

## 3. export / export2 数据整理

最终数据来源：

- `roundreel` 运行包来源为原 `docs/anieditor5/export2/runtime_100/roundreel.json` 和两张图片。
- 已迁移到 `docs/anieditor5/export/roundreel.json` 与 `docs/anieditor5/export/assets/*`。
- viewer 复制到 `apps/anieditorv5viewer/src/assets/projects/roundreel.json` 与 `src/assets/assets/*`。
- vnicore fixture 复制到 `packages/vnicore/tests/fixtures/export/roundreel.json`。

最终结论：

- `docs/anieditor5/export2/runtime_100/` 已删除，避免同时存在两套来源。
- `docs/anieditor5/export2/manifest.json` 仍只描述旧 `bigwin` 的 `edit_full/project.json` 和 `runtime_50/project.json`。
- 旧 `export2` 仅作为 `runtime_50` 尺寸补偿、manifest/profile 一致性和 profile-scoped asset URL 的非回归 fixture。

## 4. editor diff 分类

- `animation_presets.ts`：需要实现。`safe_glow` 文案从固定 normal 改为副本继承图层显示模式；已同步 vnicore sampler、Pixi 测试和文档。
- `constants.ts`：已支持但需测试锁定。`VNI_VERSION` 升到 `VNI_0.020`；vnicore 已接受 `VNI_0.x`，新增 `roundreel` fixture 锁定 `VNI_0.020`。
- `export_project.ts`：部分需要实现，部分非本任务目标。运行包会写 `exportProfile` 并按 runtime 目的裁剪；vnicore 只消费导出 JSON，不搬运 editor 的裁剪逻辑。
- `main.ts`：非本任务目标。导出 UI 文案变化不需要 viewer/runtime 复制。
- `pixi_stage.ts`：需要实现。editor 预览 safe glow 继承 layer blendMode；vnicore Pixi runtime 已同步。
- `project_state.ts`：已支持但需说明边界。runtime export 会过滤隐藏组/隐藏层并保留 `project.particles` 引用 asset；vnicore 仍显式拒绝非空 top-level `project.particles`，未静默忽略。
- `types.ts`：非本任务目标。隐藏 group 的 runtime/editing 差异由 editor 导出决定，viewer/vnicore 不做二次裁剪。

## 5. vnicore 语义

- `VNISafeGlowSpriteSample.blendMode` 改为 `V5GBlendMode`。
- `sampleSafeGlowSpritesForLayer(...)` 从 sampled layer 读取 `blendMode`。
- `VNIPlayer` 仍通过 `toPixiBlendMode(...)` 设置 safe glow sprite。
- `data-vni-safe-glow-sprites` 只统计 safe glow 副本。
- `data-vni-render-effect-sprites` 仍只统计旧 `glow` / `shatter` render effect。
- `validateVNIBundleManifest(...)` 只校验 manifest path 是安全相对 JSON 路径，不从目录名推断 profile id。
- `validateManifestProjectProfile(...)` 继续用 manifest entry 和 JSON `exportProfile` 做一致性校验。

## 6. viewer 语义

- `roundreel` 注册为普通 `docs/anieditor5/export` 风格项目，id 为 `roundreel`。
- `bundleId` 为 `export`，不是 `export2`，也不是旧 full-size `legacy`。
- `profileId`、`purpose`、`assetScale` 来自 `roundreel.json` 的 `exportProfile`。
- `asset.path` 继续通过当前资源池 manifest 解析，缺 asset 显式失败。
- 旧 `bigwin-edit-full` 和 `bigwin-runtime-50` 保留原有 `export2` 非回归注册。

## 7. 验收命令

说明：直接执行 `pnpm --filter ...` 时，当前环境的 pnpm 会先重建 `node_modules` 并触发联网/`approve-builds` policy；第一次 install 因 `esbuild`、`sharp` build scripts 未批准退出。随后使用仓库提示代理并以 `pnpm install --ignore-scripts` 恢复依赖。正式检查使用等价本地二进制执行，结果如下。

通过：

```bash
node_modules/.bin/tsc -p packages/vnicore/tsconfig.json --noEmit
../../node_modules/.bin/eslint .                         # packages/vnicore
../../node_modules/.bin/tsc -p tsconfig.examples.json --noEmit
../../node_modules/.bin/tsc -p tsconfig.build.json
../../node_modules/.bin/vitest run --coverage             # packages/vnicore, 12 files / 137 tests
../../node_modules/.bin/prettier --check .                # packages/vnicore
../../node_modules/.bin/tsc -p tsconfig.json --noEmit      # apps/anieditorv5viewer
../../node_modules/.bin/eslint .                          # apps/anieditorv5viewer
../../node_modules/.bin/vitest run --coverage             # apps/anieditorv5viewer, 2 files / 14 tests
../../node_modules/.bin/vite build                        # apps/anieditorv5viewer
../../node_modules/.bin/prettier --check .                # apps/anieditorv5viewer
git diff --check
find . -name .DS_Store -print                             # 无输出
```

`apps/anieditorv5viewer` build 通过，仅保留 Vite 大 chunk 警告。

## 8. 浏览器验收

用户明确接手浏览器验收。当前 dev server：

```text
http://127.0.0.1:5175/
```

建议用户验收点：

- selector 包含 `roundreel`。
- 选择 `roundreel` 后 summary 包含 `schema VNI_0.020`、`profile runtime_100`、`safe_glow`。
- diagnostics 应看到：
  - `data-vni-project-id="roundreel"`
  - `data-vni-bundle-id="export"`
  - `data-vni-profile-id="runtime_100"`
  - `data-vni-profile-purpose="runtime"`
  - `data-vni-asset-scale="1"`
- 播放到 safe glow 时间段时，`data-vni-safe-glow-sprites` 大于 `0`。
- 抽查旧 `bigwin-runtime-50` 与 `3reel-multipay-01` 不回归。

## 9. agents.md 判断

未更新 `agents.md`。

原因：

- 本任务未新增长期仓库协作规则。
- 现有规则已经规定 `packages/vnicore` 拥有 VNI 播放状态机、safe runtime 语义和 viewer 只能做配置/输入/展示/调用。
- 用户修正后的 `roundreel` 接入方式是本次数据组织合同，不需要升级为全仓库协作规则。

## 10. 最终工作区摘要

`git status --short --untracked-files=all` 仍包含本任务外已有未跟踪内容：

- `assets/game003/*`
- `assets/symbols003/*`
- `tasks/52-game002-static-release.md`
- `tasks/53-vnicore-runtime-bundle-profiles.md`

本任务新增/修改的核心未跟踪资源：

- `docs/anieditor5/export/roundreel.json`
- `docs/anieditor5/export/assets/gx_6_asset_image_mqthi919_1e.png`
- `docs/anieditor5/export/assets/image_asset_image_mqtjdi3v_3.jpg`
- `apps/anieditorv5viewer/src/assets/projects/roundreel.json`
- `apps/anieditorv5viewer/src/assets/assets/gx_6_asset_image_mqthi919_1e.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqtjdi3v_3.jpg`
- `packages/vnicore/tests/fixtures/export/roundreel.json`
- `tasks/53-vnicore-runtime-bundle-profiles-260626-081442.md`

## 11. 二次遗漏检查

- `roundreel` 已从 `export2/runtime_100` 迁移到 `export` 风格资源池。
- 未保留 `roundreel-runtime-100` 或 `export2/runtime_100` 长期接入代码。
- runtime profile 不从目录名推断，测试已覆盖安全 path 与 JSON `exportProfile` 一致性。
- `safe_glow` 固定 normal 的代码、测试和文档断言已清理。
- `safe_glow` 未混入旧 render effect 统计。
- `top-level project.particles` 仍显式失败，未静默忽略。
- `packages/anieditorv5runtime-cc`、standalone runtime、standalone zip 未触碰。
- `.DS_Store` 已清理。
- `git diff --check` 通过。
