# anieditorv5viewer scaled assets 任务报告

## 任务摘要

本次按 `tasks/33-anieditorv5viewer-scaled-assets.md` 更新 `apps/anieditorv5viewer`，让 viewer 同时支持旧 `docs/anieditor5/export` 原图导出，以及新 `docs/anieditor5/export2` 的 VNI bundle：

- `edit_full`：100% 原图 profile。
- `runtime_50`：50% 文件像素 profile，但按原始逻辑尺寸播放。

核心合同已升级为：

```text
asset.width / asset.height = 原始设计逻辑尺寸
asset.fileWidth / asset.fileHeight = 当前 profile 实际文件像素尺寸
PIXI.Texture.width / PIXI.Texture.height = 当前 profile 实际文件像素尺寸
显示尺寸 = 原始设计逻辑尺寸
```

## 实际改动文件

本任务修改：

- `apps/anieditorv5viewer/README.md`
- `apps/anieditorv5viewer/src/config/bundled-projects.ts`
- `apps/anieditorv5viewer/src/main.ts`
- `apps/anieditorv5viewer/src/runtime/asset-manifest.ts`
- `apps/anieditorv5viewer/src/runtime/layer-instance.ts`
- `apps/anieditorv5viewer/src/runtime/v5g-player.ts`
- `apps/anieditorv5viewer/src/runtime/validation.ts`
- `apps/anieditorv5viewer/src/ui/controls.ts`
- `apps/anieditorv5viewer/src/v5g/types.ts`
- `apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts`
- `apps/anieditorv5viewer/tests/runtime/asset-scale.test.ts`
- `apps/anieditorv5viewer/tests/runtime/particle-sampler.test.ts`
- `apps/anieditorv5viewer/tests/runtime/validation.test.ts`
- `apps/anieditorv5viewer/src/assets/export2/**`

未新增 npm 依赖，未执行 `pnpm install`，`pnpm-lock.yaml` 未变化。

## 输入改动说明

执行前已有以下输入改动，本任务未回滚、未继续修改：

- `docs/anieditor5/src/constants.ts`
- `docs/anieditor5/src/export_project.ts`
- `docs/anieditor5/src/main.ts`
- `docs/anieditor5/src/pixi_stage.ts`
- `docs/anieditor5/src/project_state.ts`
- `docs/anieditor5/src/types.ts`
- `docs/anieditor5/export2/**`

本任务未更新 `AGENTS.md` / `agents.md`，因为没有改变仓库协作规则、目录规范或基础执行约定。

## 资源同步结果

- 旧 `docs/anieditor5/export`：4 个项目仍保留并同步到 viewer。
- 新 `docs/anieditor5/export2`：1 个 `vni_export_bundle` manifest，2 个 profile。
- `edit_full`：9 个 asset。
- `runtime_50`：9 个 asset。
- `.DS_Store`：未复制进 `apps/anieditorv5viewer/src/assets`。
- 资源存在性检查：`all bundled assets exist`。
- PNG 尺寸校验：`export2 png dimensions match JSON fileWidth/fileHeight`。

`file docs/anieditor5/export2/edit_full/assets/*.png docs/anieditor5/export2/runtime_50/assets/*.png` 已确认：

- `edit_full` 图片为原始尺寸。
- `runtime_50` 图片为 JSON `fileWidth/fileHeight`，例如 `730x735` 逻辑图对应 `365x368` 文件图。

## 核心实现说明

- 类型增加 `fileWidth`、`fileHeight`、`fileScale`、`exportProfile`、`V5GBundleManifest`。
- 校验明确支持 `V5G_0.x` 与 `VNI_0.x`；`editor.name` 只接受 `victory_editor_v5_g` / `VNI`。
- asset 缩放字段必须三者同时缺失或同时存在；部分缺失、非正数、`fileScale > 1`、四舍五入尺寸不一致都会显式失败。
- legacy 和 VNI 单文件 100% 导出缺失 `exportProfile` 时按原图 profile 处理。
- `export2` manifest 在启动时校验 entry 唯一、路径已注册，并校验 entry 与 project `exportProfile.id/purpose/assetScale` 一致。
- asset manifest 改为 profile 分域：legacy、`edit_full`、`runtime_50` 独立解析，避免同名 `asset.path` 覆盖。
- `V5GPlayer.loadTexture()` 改为按 `fileWidth/fileHeight` 校验贴图文件尺寸。
- image layer child sprite 使用 `asset.width / texture.width` 和 `asset.height / texture.height` 做显示补偿；layer container 继续承载动画 transform。
- UI 摘要显示 `schemaVersion`、`profileId`、`purpose`、`assetScale`。
- player dataset 新增 `data-vni-bundle-id`、`data-vni-profile-id`、`data-vni-asset-scale`、`data-vni-profile-purpose`，`destroy()` 会清理旧诊断值。
- `.prettierignore` 仍排除 `src/assets`，coverage exclude 仍覆盖 `src/assets/**`，`tsconfig.json` 仍 include `src/**/*.json`。

## 验收命令

环境：

```text
node -v => v24.14.0
pnpm -v => 10.0.0
```

资源验收：

```text
find apps/anieditorv5viewer/src/assets -name .DS_Store -print
=> 无输出

node -e "...资源存在性检查..."
=> all bundled assets exist

node -e "...export2 PNG 尺寸对比 JSON..."
=> export2 png dimensions match JSON fileWidth/fileHeight
```

app-local 验收：

```text
pnpm --filter anieditorv5viewer typecheck
=> 通过

pnpm --filter anieditorv5viewer lint
=> 通过

pnpm --filter anieditorv5viewer test
=> 7 files passed, 63 tests passed

pnpm --filter anieditorv5viewer build
=> 通过

pnpm --filter anieditorv5viewer format:check
=> All matched files use Prettier code style!
```

最终差异检查：

```text
git diff --check
=> 通过，无输出
```

## 浏览器验收

dev server：

```text
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
=> http://localhost:5175/
```

沙箱内首次监听 `0.0.0.0:5175` 返回 `EPERM`，随后经用户批准在沙箱外启动成功。验收完成后 dev server 已停止。

Codex 自动浏览器检查完成了默认页 DOM 取证：

- 默认选中 `胜利测试 (legacy/project.json, 100%)`。
- 页面 select 中存在 6 个选项：
  - `project`
  - `bigwin`
  - `megawin`
  - `superwin`
  - `bigwin (export2/edit_full, 100% 原图)`
  - `bigwin (export2/runtime_50, 50% 运行资源)`
- 默认摘要包含 `schema V5G_0.0014`、`profile legacy_full`、`assetScale 1`。

随后用户接手浏览器验收，并反馈：

```text
看起来 50%也是对的
```

因此本报告记录为用户人工确认 `runtime_50` 视觉尺寸正确，没有显示成半尺寸。Codex 未继续采集 `bigwin-runtime-50` 的具体 `data-vni-profile-id` / `data-vni-asset-scale` / `data-v5g-non-background-samples` 数值，避免声称未实际执行的自动浏览器取证。

## 已知问题或未做事项

- 未执行根级 `pnpm format:check`；本任务边界使用 app-local `format:check` 覆盖。
- 浏览器最终 profile 视觉验收由用户人工完成，报告只记录用户反馈，不伪造自动 dataset 数值。
- `docs/anieditor5/src/**` 和 `docs/anieditor5/export2/**` 为执行前已有输入改动，仍处于未提交状态。

## 追加修正：0 秒起始帧漏渲染

用户在浏览器验收后反馈：动画还没播放时，0 秒画面仍有部分元素渲染出来。排查结果：

- 这不是 `runtime_50` 缩放补偿问题。
- `export2` 数据中部分 layer 在 0 秒有 `opacity=1`，并使用 `scale_up.fromScaleX/fromScaleY=0.01` 入场；因此不是浮点误差，而是 1% 尺寸本身仍可见。
- `particle_twinkle` / `particles` 在 start 帧也可能进入 active 状态，应隐藏源贴图，但不应在 progress=0 时生成粒子。

修正：

- `apps/anieditorv5viewer/src/runtime/project-sampler.ts`
  - 对 `scale_up` / `scale_in` / `bounce_in` 中 fromScale 接近 0 的视觉入场动画，在 `time <= startTime` 时将 opacity 置 0。
  - 这样即使同一 layer 同时有 `rotate` / `pulse` 等动画，起始帧也不会漏出 1% 图像。
- `apps/anieditorv5viewer/src/runtime/particle-sampler.ts`
  - `progress <= 0` 时不生成粒子。
  - 保留 active particle layer 隐藏源贴图的语义。
- `apps/anieditorv5viewer/tests/runtime/project-sampler.test.ts`
  - 增加 `runtime_50` 实际导出在 0 秒无 `renderImageDisplay` 的回归测试。
  - 增加 near-zero scale entry start frame 回归测试。
- `apps/anieditorv5viewer/tests/runtime/particle-sampler.test.ts`
  - 增加粒子 start frame 不生成 sprite 的回归测试。

追加验收：

```text
pnpm --filter anieditorv5viewer typecheck
=> 通过

pnpm --filter anieditorv5viewer lint
=> 通过

pnpm --filter anieditorv5viewer test
=> 7 files passed, 65 tests passed

pnpm --filter anieditorv5viewer build
=> 通过

pnpm --filter anieditorv5viewer format:check
=> All matched files use Prettier code style!

git diff --check
=> 通过，无输出
```

## 最终 git status 摘要

```text
 M apps/anieditorv5viewer/README.md
 M apps/anieditorv5viewer/src/config/bundled-projects.ts
 M apps/anieditorv5viewer/src/main.ts
 M apps/anieditorv5viewer/src/runtime/asset-manifest.ts
 M apps/anieditorv5viewer/src/runtime/layer-instance.ts
 M apps/anieditorv5viewer/src/runtime/v5g-player.ts
 M apps/anieditorv5viewer/src/runtime/validation.ts
 M apps/anieditorv5viewer/src/ui/controls.ts
 M apps/anieditorv5viewer/src/v5g/types.ts
 M apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts
 M apps/anieditorv5viewer/tests/runtime/particle-sampler.test.ts
 M apps/anieditorv5viewer/tests/runtime/validation.test.ts
 M docs/anieditor5/src/constants.ts
 M docs/anieditor5/src/export_project.ts
 M docs/anieditor5/src/main.ts
 M docs/anieditor5/src/pixi_stage.ts
 M docs/anieditor5/src/project_state.ts
 M docs/anieditor5/src/types.ts
?? apps/anieditorv5viewer/src/assets/export2/
?? apps/anieditorv5viewer/tests/runtime/asset-scale.test.ts
?? docs/anieditor5/export2/
?? tasks/33-anieditorv5viewer-scaled-assets.md
?? tasks/33-anieditorv5viewer-scaled-assets-260617-131132.md
```

## 二次检查清单

- [x] 计划中的目标 viewer 文件已检查或更新。
- [x] 没有回滚用户在 `docs/anieditor5/src/**` 的已有改动。
- [x] `docs/anieditor5/export2/.DS_Store` 没有复制进 app。
- [x] 旧 4 个 V5G 项目仍在 selector 中。
- [x] 新 `edit_full` 已作为 selector profile。
- [x] 新 `runtime_50` 已作为 selector profile。
- [x] 旧导出缺失 `fileScale` 时默认原图。
- [x] VNI 单文件 100% 导出缺失 `exportProfile` 时默认原图。
- [x] `fileWidth/fileHeight/fileScale` 部分缺失会显式失败。
- [x] `runtime_50` 的 texture 尺寸按 `fileWidth/fileHeight` 校验。
- [x] `runtime_50` 的显示尺寸按 `asset.width/height` 补偿。
- [x] manifest entry 与 project `exportProfile` 的 `id/purpose/assetScale` 已互相校验。
- [x] `edit_full` 和 `runtime_50` 同名 `asset.path` 没有 manifest 覆盖。
- [x] `.prettierignore`、coverage exclude、JSON import 配置仍覆盖新增资源目录。
- [x] `schemaVersion` 没有硬编码成单一 `VNI_0.003` 或单一 `V5G_0.0051`。
- [x] 未知 schema/editor/资源/动画/easing/blend mode 仍显式失败。
- [x] 没有新增隐藏 fallback，也没有运行时偷偷替换资源 profile。
- [x] 测试表达真实合同，没有为了测试通过改坏生产逻辑。
- [x] README 已同步新资源 profile 语义。
- [x] 协作规则未变，未更新 `AGENTS.md` / `agents.md`。
- [x] 任务报告已按 UTC 命名写入 `tasks/`。
- [x] 验收命令、浏览器证据和最终 `git status --short` 已写入报告。
