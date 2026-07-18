# 102 image-string editor bootstrap 任务报告

## 1. 完成信息

- 完成时间：2026-07-18 04:50:06 UTC
- 分支：`main`
- 起始 HEAD：`02ca3591845e6982e0c9487385ec913c8389a50a`
- 结束 HEAD：`02ca3591845e6982e0c9487385ec913c8389a50a`（本任务未提交）
- Node.js：`v24.14.0`
- pnpm runner：`11.9.0`；仓库合同仍为 pnpm `>=10` / packageManager `10.0.0`
- 实际执行范围：计划阶段 A、B、C 和对应文档/门禁。
- 明确排除：按用户补充要求，未修改 `apps/symbolseditor`、`apps/gamelayouteditor`（用户口述 `gamelayereditor`）及其 runtime/generator/README；因此原计划阶段 D/E 与 consumer 集成完成项本次不声明完成。
- 最终浏览器验收：按用户要求留给用户执行，本报告不写成已通过。

## 2. 实现摘要

### rendercore 公共 API

新增 `@slotclientengine/rendercore/image-string` 子路径与根出口：

- `parseImageStringManifest()`：递归拒绝未知字段，严格检查 version/kind/id、NFC 单 Unicode scalar、控制字符、canonical ASCII lowercase path、PNG/WebP、真实尺寸合同、offset、fixed group 和 recursive freeze。
- `collectImageStringAssetPaths()` / `validateImageStringPackageContents()`：稳定、精确的 standalone glyph 闭包，缺失与 orphan 都失败。
- `createImageStringResource()` / `createImageStringResourceFromFiles()` / `loadImageStringResourceFromUrl()`：Vite/files/http(s) CDN 装配、全量预解码和尺寸核对、Object URL/Texture 原子清理、共享 resource 生命周期。
- Pixi texture 加载显式选择 `loadTextures` parser，确保没有扩展名的 `blob:` Object URL 也能按 PNG/WebP 正常解析，不产生 parser warning。
- resource 区分 Pixi Assets 管理 URL 与直接 owned Texture：前者在异步 `destroy()` 中稳定排序后使用 `Assets.unload()`，后者才直接 destroy；Object URL 等待 unload 完成后再撤销，失败回滚也等待全部并行 load settle。
- `layoutImageString()`：按 `Array.from(text)` 布局，返回 logical/visual bounds 和每个 occurrence snapshot。
- `createRenderImageString()`：Pixi Container/Sprite、原子 `setText()`、anchor、sprite pool、稳定 child order、幂等 destroy；renderer 不创建 Application/canvas/DOM/RAF，也不拥有共享 resource。

主要新增目录：

```text
packages/rendercore/src/image-string/
  errors.ts
  index.ts
  layout.ts
  manifest.ts
  render-image-string.ts
  resource.ts
  types.ts
```

### Imgnumbereditor

新增纯前端 Vite + TypeScript + Pixi.js v8 应用 `apps/Imgnumbereditor`，package name 为 `imgnumbereditor`，`base` 为 `./`。已实现：

- 默认项目、transaction store、真实 PNG/WebP decode。
- `0-1.png` 式文件名只生成建议，必须显式确认字符后才进入 glyph map。
- ASCII code-point asset path、重复字符/path 冲突、offset、替换图片、取消映射、删除待映射图片。
- natural width 与 fixed advance group 新增/更新/删除、“使用成员最大宽度”。
- rendercore-backed Pixi preview、zoom、logical/visual bounds guide 与 snapshot。
- 六个默认静态模板、自由字符串和 `001 -> 100` RAF 计数模板；支持 inclusive endpoint、pause/reset/repeat。
- RAF driver 通过 `globalThis` 调用浏览器原生 request/cancel 方法，保留原生 receiver，避免播放时触发 `Illegal invocation`。
- browserartifactio bounded unzip、deterministic zip、严格闭包、production 等价导出前校验和原子导入。
- 中文错误 UI、README、测试、相对路径静态 build。
- 工具栏中的原生 button 与 file-input label button 统一字号、盒模型、flex 和垂直居中，避免导入按钮受全局 label 样式影响而错位。

## 3. Manifest 与布局合同

最终 v1 示例：

```json
{
  "version": 1,
  "kind": "image-string",
  "id": "neutral-glyphs",
  "metrics": { "lineHeight": 49, "letterSpacing": 1 },
  "glyphs": {
    "0": {
      "path": "assets/u0030.png",
      "size": { "width": 36, "height": 49 },
      "offset": { "x": 0, "y": 0 }
    },
    "1": {
      "path": "assets/u0031.png",
      "size": { "width": 26, "height": 48 },
      "offset": { "x": 0, "y": 1 }
    }
  },
  "fixedAdvanceGroups": [
    {
      "id": "digits",
      "characters": ["0", "1"],
      "advanceWidth": 36,
      "align": "center"
    }
  ]
}
```

ZIP：

```text
neutral-glyphs-image-string.zip
  image-string.manifest.json
  assets/u0030.png
  assets/u0031.png
```

布局公式：

```text
cellAdvance = fixedGroup.advanceWidth ?? glyph.size.width
alignOffset = start: 0
              center: (cellAdvance - glyph.size.width) / 2
              end: cellAdvance - glyph.size.width
spriteX = cursorX + alignOffset + glyph.offset.x
spriteY = glyph.offset.y
cursorX += cellAdvance + 非末尾 letterSpacing
```

固定组只统一逻辑单元宽度，sprite 仍使用图片真实宽高，不拉伸、不重采样。

## 4. 模板与样本结果

- 自动测试验证了静态混合字符串 natural/fixed 布局、emoji 单 code point、空字符串、缺字原子失败。
- `001 -> 003` 测试验证 `001/002/003` inclusive endpoint；repeat 测试验证完整显示终点后下一 tick 才回到 start。
- 默认 UI 模板为 `0123456789`、`9876543210`、`001234567890`、`+123.45`、`-678.90`、`12×34`；缺 glyph 会显示具体错误，不 fallback。
- 只读检查用户十张 `assets/game002-s3/{0..9}-1.png`：宽度为 26–37px，高度为 48–49px；源文件未移动、改名、覆盖或删除。浏览器中的实际导入、digits group 和动态观感验收待用户执行。

## 5. 自动验收

### 基线

- `@slotclientengine/browserartifactio test`：15/15 通过。
- `@slotclientengine/rendercore test`：修改前 312/312 通过。

### 定向门禁

以下三个 package 的 `format:check / lint / typecheck / test / build` 均通过：

```text
@slotclientengine/browserartifactio
@slotclientengine/rendercore
imgnumbereditor
```

最终测试：

- rendercore：54 files、338 tests 全通过；总覆盖率 statements 87.72%、branches 80.05%、functions 93.33%、lines 88.12%。
- Imgnumbereditor：7 files、16 tests 全通过；总覆盖率 statements 82.29%、branches 72.90%、functions 73.94%、lines 84.02%。
- `imgnumbereditor build`：通过，723 modules；主 JS 328.34 kB / gzip 98.66 kB。
- build `dist/index.html` 的 JS/CSS/modulepreload 均为 `./assets/**`，未发现根绝对 asset URL。
- `git diff --check`：通过。

最后一次 resource cleanup 补强后，因 pnpm 11 会根据手工去除的 lockfile 平台噪声强制重装，使用已安装的同版本二进制等价复验：

```bash
./node_modules/.bin/prettier --write <changed rendercore files>
(cd packages/rendercore && ../../node_modules/.bin/eslint .)
./node_modules/.bin/tsc -p packages/rendercore/tsconfig.json --noEmit
(cd packages/rendercore && ../../node_modules/.bin/vitest run --coverage)
./node_modules/.bin/tsc -p packages/rendercore/tsconfig.build.json
```

全部通过。

### 根级门禁

- `pnpm lint`：27/27 packages 通过。
- `pnpm test`：27/27 packages 通过。
- `pnpm build`：27/27 packages 通过。
- `pnpm format:check`：未通过；首个失败是任务外既有 `packages/pixiani` 7 个未格式化文件，另见旧 demo 文件。未修改这些范围外文件。
- `pnpm typecheck`：两次均未通过；稳定失败点为任务外既有 `apps/gameframeworksviewer` 在 turbo 并发构建中读取不到 `@slotclientengine/gameframeworks/dist/index.d.ts`，继而出现 implicit-any/unknown 派生错误。根 build 可成功生成该声明文件，但 typecheck 并发仍会删除/重建 dist 并复现竞争。本任务三个定向 typecheck 均通过，未修改该范围外应用。

### Generator

本次未修改 symbol、layout、game YAML 或 generated closure；按用户排除范围，没有需要运行或新增的 symbol/gamelayout generator check。未手改任何 generated 文件。

## 6. 依赖与代理

- 首次安装通过授权的联网 `pnpm install` 恢复被 pnpm runner 重建的 `node_modules`；日志显示下载 0，依赖全部命中本地 pnpm store。
- 新增 workspace 后再次运行 install，仍下载 0。
- 未配置或使用用户计划中的 HTTP/HTTPS 代理。
- pnpm 11 自动给旧 lockfile 写入的 26 行平台 `libc` 元数据已移除，只保留 `apps/Imgnumbereditor` importer，避免无关锁文件漂移。

## 7. 文档与 ownership

- 新增 `docs/image-string-manifest.md`。
- 更新 `packages/rendercore/README.md` 和 `apps/Imgnumbereditor/README.md`。
- 更新根 `agents.md`，明确 image-string parser/closure/layout/Pixi 生命周期归 rendercore，Imgnumbereditor 只拥有 draft/UI/模板/ZIP IO，并禁止 fallback/glob/复制布局。
- 按用户排除范围，未更新 symbolseditor/gamelayouteditor README。

## 8. 最终工作区与用户文件

最终 tracked 修改：

```text
M agents.md
M packages/rendercore/README.md
M packages/rendercore/package.json
M packages/rendercore/src/index.ts
M pnpm-lock.yaml
```

本任务新增：

```text
apps/Imgnumbereditor/**
docs/image-string-manifest.md
packages/rendercore/src/image-string/**
packages/rendercore/tests/image-string/**
tasks/102-image-string-editor-bootstrap-260718-045006.md
```

保留的用户未跟踪文件：

```text
assets/game002-s3/0-1.png ... 9-1.png
tasks/102-image-string-editor-bootstrap.md
```

未修改 `apps/symbolseditor/**`、`apps/gamelayouteditor/**`、game002/game003 production manifest/YAML/generated closure。

## 9. 未完成项与后续

1. 用户执行最终浏览器验收：导入十张数字图，比较 natural/fixed advance，验证 `001 -> 100`、pause/reset/repeat、ZIP round-trip 和坏包错误 UI。
2. symbolseditor 的 `valuePresentation.text.type=image-string`、dependency vendoring、preview/generator/round-trip 本次按用户要求未实施。
3. gamelayouteditor 的 image-string node、runtime `setImageStringText()`、dependency vendoring/round-trip 本次按用户要求未实施。
4. production game002 迁移不在本任务范围；后续应单独立项，继续保留旧 `text.type=image` 兼容合同。
