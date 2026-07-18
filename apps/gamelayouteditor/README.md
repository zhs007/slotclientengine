# gamelayouteditor

浏览器内运行的 slot scene layout 编辑器。它使用 Vite、TypeScript、Pixi.js v8 与 rendercore scene-layout。预览分辨率表示浏览器物理 `pageSize`，rendercore 会按 game002/game003 的 frame policy 派生逻辑 `frameDesignSize`、CSS canvas 尺寸和黑边，再计算 art viewport；编辑器不依赖 uiframeworks、gameframeworks、live session 或 netcore，也不连接业务服务器，不使用 WebSocket、数据库、登录态、localStorage、IndexedDB 或 File System Access API。

## 运行

```bash
pnpm --filter gamelayouteditor dev -- --host 0.0.0.0
pnpm --filter gamelayouteditor build
```

Vite `base` 固定为 `./`，因此 `dist/` 可放在任意静态 CDN 子路径。运行时只读取用户在浏览器选择的本地文件；导入和导出不会 POST 数据。

## 工作流

1. 新建 `maximized-focus` 单背景或 `orientation-focus` 横竖双背景项目。
2. 先上传图片/Spine 背景，右侧立即预览。图片 art size 来自真实解码；Spine 优先读取 skeleton bounds，资源未声明 bounds 时才在高级区填写。
3. 主转轮默认 `5x3`、cell `160x160`、gap `0`，背景上传后自动居中；focus 默认由转轮四边外扩 `60` 并保证包含完整转轮。cell/gap/position/art/focus 都收在高级区，可按需要再调。
4. 添加图片或 Spine 图层，通过表单编辑 order、位置、统一 scale 和方向可见性。预览画布不接受图层拖动。
5. 使用四个预设、自定义尺寸或右下角 resize handle 验证页面比例；单背景执行 `maximized-focus`，双背景执行 `orientation-focus` 并切换横竖 variant、显示真实黑边；zoom 只改变编辑器整体展示比例。
6. 双背景只上传一侧时仍可预览该侧，但所有严格校验通过后才能导出 `<project-id>-layout.zip`；zip 可重新导入继续编辑。

左侧配置区和右侧预览区各自滚动：字段提交后保持高级折叠区的展开状态；图层数量增加只延长左侧滚动内容，预览工具栏和画布区域始终固定在页面顶部工作区内。

Spine 上传必须一次选择一个 4.3.x skeleton JSON、一个 atlas 和 atlas 的全部 texture pages；default loop animation 必须由用户按大小写精确选择。

## Zip 安全限制

- 最多 256 个 entry。
- 压缩包最多 50 MiB。
- 单文件解压后最多 20 MiB。
- 总解压尺寸最多 100 MiB。
- zip 根目录只允许 `layout.manifest.json` 与 manifest 精确引用的 `assets/**`。
- 路径必须为 ASCII、小写、POSIX 相对路径；拒绝绝对路径、反斜杠、空 segment、`.`、`..`、lowercase collision 和额外文件。
- `__MACOSX`、`.DS_Store`、`._*` 不会被忽略，应重新导出干净包。

解压采用 fflate streaming `Unzip`，在 entry/chunk 到达时累计并中止超限输入，不先对未知 zip 使用无限制 `unzipSync`。

## Production 消费

构建期可将 zip 解压到 `assets/<layout-id>/`，用 `collectSceneLayoutAssetPaths()` 得到精确 Vite/loading closure，再传给 `createSceneLayoutResource()`。CDN 方式则上传解压目录并调用 `loadSceneLayoutResourceFromUrl({ manifestUrl })`；服务器只需标准静态 GET 与正确 CORS。

Production game 不应在每次 spin 解压 zip。zip 只是编辑器传输容器。

# Symbols 预览包

先在 `symbolseditor` 导出 `<package-id>-symbols.zip`，再通过底部“导入 symbols ZIP”选择该文件。编辑器只接受根目录包含 `symbols.package.json` 的 strict symbol-package v1，package entries 必须与 game config、symbol manifest 和 `resources[]` 声明的精确资源闭包完全一致；不猜文件类型，也不接受 layout ZIP、目录或散文件。

导入成功后，package `cellSize` 会原子覆盖 layout `main` grid 的 `cellWidth/cellHeight`，保留 layout 自己的 rows、columns、gap 和各 variant placement，并按既有 focus offset 重新派生 focus。新尺寸使 grid 越出 art/focus 时整个导入失败，不做 auto-fit、位移或缩放。

预览从 ZIP 的唯一公开 game config 读取 reel sets：只有 reel count 等于当前 main grid columns 且完整轮带中的每个 code 都可映射到 package display symbol 的项目可选。唯一兼容项会自动选中；多个兼容项必须在下拉框中显式选择；没有兼容项或轮带含辅助/缺失 display symbol 时明确失败。不会按 reel set 名称猜默认项。

每列使用 Web Crypto 独立、无明显 modulo bias 地抽取一个合法 stop，再通过 logiccore reel public API 从该 stop 连续读取当前 rows 个 code，越过尾部自动回绕。画面经 paytable code 映射创建 rendercore `RenderSymbol`，只请求 manifest `normal`，沿用 manifest scale/renderPriority，value symbol 使用 `defaultValues[0]`。不使用 `Math.random()`，也不读取服务器 scene、真实轮带、GMI、randomNumbers 或网络数据。

“重新随机”只替换当前 sampled scene 和 RenderSymbols，不重新导入 package/catalog。修改 rows 会按新高度重新抽取；columns 改变会重新判断兼容性。页面尺寸、zoom、guide 显隐、横竖 variant、art/focus/grid placement 和普通 scene-layout relayout 都复用当前 stop 和 scene，不会隐式重抽。

清除 symbols package 只释放预览/player/Blob URL，不回滚已经应用到 layout 的 cell size。导出的 layout ZIP 合同保持不变，不包含 game config 或 symbol assets。
