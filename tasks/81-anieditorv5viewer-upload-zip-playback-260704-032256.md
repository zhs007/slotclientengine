# 81 anieditorv5viewer upload zip playback 任务报告

## 1. 改动摘要

- `apps/anieditorv5viewer` 已从启动自动加载内置项目，改为浏览器上传 `.zip` 后解析并播放。
- 新增 `apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts`，集中处理 zip 解压、路径安全、manifest / single-project 识别、profile 选择、vnicore 校验、profile-scoped Blob URL 和 dispose。
- `apps/anieditorv5viewer/src/main.ts` 改为上传 bundle -> 选择 profile -> 创建 Pixi `Application` / `VNIPlayer`；上传失败、重复上传和 profile 切换都会销毁旧 player / Pixi app 并释放 Blob URL。
- `apps/anieditorv5viewer/src/ui/controls.ts` 改为 file input + profile select；未加载项目时播放、timeline、advanced、组间插入和文字替换控件禁用。
- 移除 viewer 内置动画资源和旧注册 glue：`src/assets/**`、`src/config/bundled-projects.ts`、`src/runtime/asset-manifest.ts`。
- 更新 README、测试、`.prettierignore`、`vite.config.ts`、`tsconfig.json`，清理旧 `src/assets` / JSON import 假设。

## 2. 最终支持的 zip 格式

### 2.1 manifest bundle

支持 `docs/anieditor5/roundreel.zip` 这类结构：

```text
manifest.json
edit_full/roundreel.json
edit_full/assets/*
runtime_100/roundreel.json
runtime_100/assets/*
```

- 使用 `assertVNIBundleManifest` / `validateVNIBundleManifest` 校验 manifest。
- 使用 `validateManifestProjectProfile` 校验 manifest entry 与项目 JSON `exportProfile` 一致。
- 如果恰好一个 profile 的 `purpose === "runtime"`，自动加载该 profile；`roundreel.zip` 默认加载 `runtime_100`。
- 仍保留 profile select，可切换到 `edit_full`。
- `asset.path` 按当前 profile 项目 JSON 所在目录解析，例如 `runtime_100/assets/*`，不会跨 profile 复用 Blob URL。

### 2.2 single-project zip

支持 `docs/anieditor5/megawin.zip` 这类结构：

```text
project.json
assets/*
__MACOSX/*
```

- 无 `manifest.json` 时，只接受根目录唯一 `project.json`。
- profile 身份只来自 `project.exportProfile`；缺失时显式失败，不补 `legacy_full`。
- 忽略 `__MACOSX/**`、`.DS_Store`、`._*`。
- `megawin.zip` 加载为 `profileId=runtime_50`、`profilePurpose=runtime`、`assetScale=0.5`、`bundleId=uploaded:megawin`。

## 3. 关键文件变化

新增：

- `apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts`
- `apps/anieditorv5viewer/tests/uploaded-zip-project.test.ts`
- `tasks/81-anieditorv5viewer-upload-zip-playback-260704-032256.md`

重写或更新：

- `apps/anieditorv5viewer/src/main.ts`
- `apps/anieditorv5viewer/src/ui/controls.ts`
- `apps/anieditorv5viewer/src/styles.css`
- `apps/anieditorv5viewer/tests/main.test.ts`
- `apps/anieditorv5viewer/tests/setup.ts`
- `apps/anieditorv5viewer/README.md`
- `apps/anieditorv5viewer/.prettierignore`
- `apps/anieditorv5viewer/vite.config.ts`
- `apps/anieditorv5viewer/tsconfig.json`

删除：

- `apps/anieditorv5viewer/src/config/bundled-projects.ts`
- `apps/anieditorv5viewer/src/runtime/asset-manifest.ts`
- `apps/anieditorv5viewer/src/assets/project.json`
- `apps/anieditorv5viewer/src/assets/projects/*.json`
- `apps/anieditorv5viewer/src/assets/assets/*`
- `apps/anieditorv5viewer/tests/bundled-projects.test.ts`

## 4. 依赖和 lockfile

- 新增浏览器运行时依赖：`apps/anieditorv5viewer/package.json` 的 `dependencies.fflate = ^0.8.3`。
- `pnpm-lock.yaml` 已同步新增 `fflate@0.8.3`。
- 首次执行 `pnpm --filter anieditorv5viewer add fflate` 失败，原因包括 registry fetch failure 和 pnpm store mismatch；随后按计划使用本地代理重试同一 add 命令成功。

## 5. agents.md 判定

- 未更新 `agents.md`。
- 原因：本任务只改变 `apps/anieditorv5viewer` 的上传播放工作流、测试和 README，不新增仓库级协作规则、目录规范、基础脚本或长期跨包约束。

## 6. 验收命令结果

已执行并通过：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
git diff --check
```

补充记录：

- `pnpm --filter anieditorv5viewer test` 结果：2 个测试文件，21 个测试通过。
- 测试覆盖真实 `docs/anieditor5/roundreel.zip`、`docs/anieditor5/megawin.zip`、manifest 多 profile、single-project `exportProfile`、缺资源、非法路径、重复 normalized path、多 runtime 不猜测、Blob URL dispose、上传主流程、profile 切换、重复上传清理、解析失败清理、play/seek/segmented/zoom、组间插入和文字层替换 public API。
- `pnpm --filter anieditorv5viewer build` 通过，生产 bundle 可生成。

## 7. 上传 blob URL 修复补充

用户补充上传 `/Users/zerro/Downloads/roundreel (1).zip` 后报错：

```text
Cannot read properties of null (reading 'width')
```

排查结论：

- 该 zip 的 `manifest.json`、`edit_full/roundreel.json`、`runtime_100/roundreel.json` 和 profile 资产结构有效。
- 这不是 zip 检查过严，而是上传 zip 解析后传给 Pixi 的资源 URL 是 `blob:` URL，URL 本身没有 `.png` / `.jpg` 扩展名。
- Pixi v8 默认 `Assets.load(url)` 无法从这种 `blob:` URL 推断 image texture parser，返回 `null`，随后 `VNIPlayer.loadTexture()` 读取 `texture.width` 触发报错。

修复：

- `packages/vnicore/src/pixi/vni-player.ts` 新增 `loadPixiTextureFromUrl()`，所有 VNI runtime 图片 URL 统一通过 `PIXI.Assets.load({ src, loadParser: "loadTextures" })` 加载。
- 保留原有 `assertLoadedTexture()`、尺寸校验和显式失败语义，不放宽 project / asset / profile 校验。
- 同步覆盖 project asset、外部挂载图片、文字层图片替换三类 URL 入口。
- `packages/vnicore/tests/pixi/vni-player.test.ts` 新增断言，确保即使 URL 无扩展名也显式指定 Pixi texture parser。

补充执行并通过：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
git diff --check
```

补充记录：

- `pnpm --filter @slotclientengine/vnicore test` 结果：13 个测试文件，158 个测试通过。
- `pnpm --filter anieditorv5viewer test` 结果：2 个测试文件，21 个测试通过。

## 8. 二次遗漏检查

已执行：

```bash
git status --short --untracked-files=all
rg -n "bundledProjects|getBundledProject|DEFAULT_PROJECT_ID|import.meta.glob\\(\\\"../assets/assets|game003S1AssetUrlManifest|docs/anieditor5/export/|project selector|bundled projects|V5G project" apps/anieditorv5viewer
find apps/anieditorv5viewer/src/assets -maxdepth 3 -type f | sort
rg -n "src/assets|src/\\*\\*/\\*.json" apps/anieditorv5viewer/.prettierignore apps/anieditorv5viewer/vite.config.ts apps/anieditorv5viewer/tsconfig.json apps/anieditorv5viewer/tests
rg -n "roundreel|megawin|runtime_100|runtime_50|manifest.json|project.json" apps/anieditorv5viewer/tests apps/anieditorv5viewer/README.md
rg -n "TODO|FIXME|fallback|silent|placeholder" apps/anieditorv5viewer/src apps/anieditorv5viewer/tests
git diff --name-only -- docs/anieditor5/roundreel.zip docs/anieditor5/megawin.zip
find apps/anieditorv5viewer -path '*/__MACOSX/*' -o -name 'roundreel' -o -name 'megawin'
```

检查结论：

- 旧 bundled runtime 概念搜索无命中。
- `apps/anieditorv5viewer/src/assets` 已不存在；没有保留 `.keepme`。
- `.prettierignore`、`vite.config.ts`、`tsconfig.json` 不再保留旧 `src/assets` / `src/**/*.json` 配置假设。
- `src/assets` 只在 `tests/uploaded-zip-project.test.ts` 的旧资源防回流断言中出现，属于刻意保留的合同测试。
- README 和测试已覆盖 `roundreel`、`megawin`、`runtime_100`、`runtime_50`、`manifest.json`、`project.json`。
- `TODO|FIXME|fallback|silent|placeholder` 扫描无命中。
- `docs/anieditor5/roundreel.zip` 和 `docs/anieditor5/megawin.zip` 未修改。
- 未发现上传 zip 解压产物写入仓库。

## 9. 浏览器验收

浏览器验收按用户要求待手工确认；本报告不把浏览器结果写成已完成。

建议手工验收项：

- 打开 `http://127.0.0.1:5175/` 后没有默认内置项目自动播放。
- 上传 `docs/anieditor5/megawin.zip` 后能播放 megawin 动画。
- 上传 `docs/anieditor5/roundreel.zip` 后默认播放 `runtime_100`。
- `roundreel.zip` profile select 能切换到 `edit_full` 并播放。
- 反复上传 `megawin.zip` / `roundreel.zip` 后没有旧画面残留，控制台没有 Blob URL 或 Pixi 销毁相关错误。
- seek、restart、loop、segmented start/end、canvas zoom 仍可用。
- 有合法 layer group slot 的上传项目，组间插入仍走 public API；无合法 slot 时按钮禁用并显示无合法 slot。
- 有 text layer 的上传项目，文字层替换仍走 public API；无 text layer 时按钮禁用。
- 上传非法 zip 时显示明确错误，并且旧 player 不继续播放。

启动命令：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

启动记录：

- 沙箱内启动失败：`listen EPERM: operation not permitted 0.0.0.0:5175`。
- 已按验收交接需要在沙箱外重试并启动成功。
- 本地地址：`http://localhost:5175/`
- 局域网地址：`http://192.168.31.237:5175/`

## 10. 已知限制和非目标

- 本任务不支持缺 `exportProfile` 的上传 single-project zip。
- 本任务不支持除 `.png`、`.jpg`、`.jpeg`、`.webp` 之外的项目 image asset 扩展。
- 本任务不扩展 `@slotclientengine/vnicore` 的 runtime 能力，不吞掉 vnicore 校验错误。
- 本任务不保留 viewer 内置动画资源，也不支持旧 project selector / bundled projects 工作流。
- 本任务不执行真实浏览器验收；浏览器部分由用户手工完成。
