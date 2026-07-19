# gamelayouteditor

浏览器内运行的 slot scene layout v1 编辑器，使用 Vite、TypeScript、Pixi.js v8 与 rendercore scene-layout。它是纯前端内存工作区：不连接业务服务器，不使用 WebSocket、账号、数据库、localStorage、IndexedDB 或 File System Access API。

## 运行

```bash
pnpm --filter gamelayouteditor dev -- --host 0.0.0.0
pnpm --filter gamelayouteditor build
```

Vite `base` 固定为 `./`，`dist/` 可部署到任意静态 CDN 子路径。运行时只读取用户在浏览器明确选择的本地文件；导入和导出不会 POST 数据。

## 工作流

```text
新建 / 导入
  -> 资源 Tab 上传 image / Spine logical resources
  -> 布局 Tab 通过 Resource Picker 创建背景和图层
  -> outline 选择一个对象，在单一 Inspector 编辑
  -> 右侧检查真实 scene / symbols preview
  -> 项目 Tab 检查 strict diagnostics 与 export closure
  -> 导出 production layout ZIP
```

左侧固定为三个互斥工作区：

- `资源`：上传、搜索、筛选、展开依赖/animation/引用、替换和删除 logical resource。
- `布局`：outline 按背景、`main` reel、普通图层分组；Inspector 同时只编辑当前一个背景、转轮或图层。
- `项目`：编辑 project id，查看 mode/count、strict diagnostics、production closure 与只读 manifest preview。

右侧 preview、page size、zoom、guides 和 `Symbols 预览` drawer 始终保留，不随左侧 Tab 重建。preview page size 表示浏览器物理页面尺寸；rendercore 按 production frame policy 派生逻辑 frame、CSS canvas、黑边和 art viewport。

## 资源优先合同

- 上传图片只创建一个 image logical resource 和对应 bytes；上传 Spine 文件组只创建一个由 skeleton、atlas 与全部 atlas pages 构成的 Spine logical resource。
- 上传不会自动创建 node、设置背景、写 placement、选择 animation，也不会因只有一个候选而自动绑定。
- Resource Picker 必须明确选择资源并确认。Spine node 必须大小写精确地明确选择 default animation。
- 同一 logical resource 可创建多个独立 node；每个 node 拥有自己的 id、order、animation 与 per-variant placement。
- 删除 layer 只删除 node，不删除 resource 或 bytes。
- 被背景或 layer 引用的 resource 不能删除；错误会列出精确引用。
- 替换 resource 保持 logical identity，并原子影响全部引用。缺少既有 animation 或背景尺寸不兼容时整体失败。
- 不同背景尺寸只有明确确认“使用新尺寸并重新初始化”后才会改变 art/reel/focus。无 bounds Spine 可绑定背景，但 art size 保持 incomplete，必须在背景 Inspector 明确填写有限正数。
- UI Tab、搜索/筛选、outline selection、Picker、展开状态、成功反馈和 Symbols drawer 都是 session state，不进入 project、manifest 或 ZIP。

新背景首次获得明确尺寸后，编辑器按当前 main reel 尺寸居中转轮，并由转轮四边默认外扩 `60` 派生 focus。主转轮默认 `5 × 3`、cell `160 × 160`、gap `0`；不会 auto-fit 或猜 2000 × 2000。

## Production ZIP 与未引用资源

资源库是当前编辑会话的工作集；`<project-id>-layout.zip` 仍是精确 production artifact：

1. typed project 解析成现有 `SceneLayoutManifestV1`；
2. `collectSceneLayoutAssetPaths()` 派生已引用闭包；
3. 只从 byte store 选择闭包文件并执行严格资源校验；
4. ZIP 只写 `layout.manifest.json` 和闭包内的 `assets/**`。

未引用资源不会阻止导出，也不会进入 production ZIP。它们在导出后继续留在当前会话，但重新导入该 ZIP 时不会恢复。Symbols package 同样仅用于 preview，不写入 layout ZIP。

安全限制保持不变：

- 最多 256 个 entry；压缩包最多 50 MiB；单文件解压后最多 20 MiB；总解压尺寸最多 100 MiB。
- 根目录只允许 `layout.manifest.json` 与 manifest 精确引用的 `assets/**`。
- 路径必须为 ASCII、小写、POSIX 相对路径；拒绝绝对路径、反斜杠、空 segment、`.`、`..`、lowercase collision 和额外文件。
- `__MACOSX`、`.DS_Store`、`._*` 不会被忽略，应重新导出干净包。
- bounded streaming import、deterministic export、图片真实尺寸、Spine 4.3.x、atlas pages 和 animation 校验不放宽。

导入 production ZIP 后，编辑器按完整素材签名重建 resource library：image 使用 kind/path/size；Spine 使用 kind/skeleton/atlas/textures。相同素材但不同 default animation 的 node 共享 resource record，animation 仍保留在各自 node。

## Symbols 预览

在右侧展开 `Symbols 预览`，导入 `symbolseditor` 生成的 strict symbol-package v1 ZIP。package `cellSize` 原子覆盖 layout `main` grid 的 cell size，保留 rows、columns、gap 和 variant placement；越出 art/focus 时整体失败，不做 auto-fit。

只有 reel count 等于当前 columns 且公开轮带全部 code 可映射到 display symbol 的 reel set 可选。唯一兼容项可由既有 symbols package runtime 选中；多个兼容项必须显式选择。每列 stop 继续使用 Web Crypto，从本地公开轮带读取并回绕；不使用 `Math.random()`，也不读取服务器 scene、真实轮带、GMI 或 randomNumbers。

“重新随机”只替换 sampled scene。page size、zoom、guides、左侧 Tab、Inspector、art/focus/placement 修改继续复用当前 stop；rows/columns 变化继续按原规则重新判断兼容性和抽样。清除 package 会释放 preview/player/Blob URL，但不回滚已应用到 layout 的 cell size。

drawer 可按 symbol 配置 session-only otherScene mapping：target 可选该 symbol 的命名 image-string node；若没有命名节点但存在旧 valuePresentation，也可选择 legacy target。source 来自 package game config 的命名 `numberWeightTables` 或 fixed positive integer。同一 symbol 最多一个 mapping，未映射格写 `0`；matrix 与 scene 同尺寸并使用 x-major 布局。权重抽样复用 Web Crypto uint32 rejection sampling，不使用 modulo bias。

randomize 会同时重采 stop、scene 与 otherScene；只改 mapping 会保留 stop 并重采 value；resize、zoom、guide、variant 和普通 relayout 不重采。缺 table/node/glyph 或 setter 失败时旧 preview 原子保留。mapping、sampled scene 与 otherScene 都不进入 layout manifest 或 ZIP，新建/导入项目及清除 symbol package 会清除 mapping。

## Production 消费

构建期可将 ZIP 解压到 `assets/<layout-id>/`，用 `collectSceneLayoutAssetPaths()` 得到精确 Vite/loading closure，再传给 `createSceneLayoutResource()`。CDN 方式可上传解压目录并调用 `loadSceneLayoutResourceFromUrl({ manifestUrl })`；服务器只需标准静态 GET 与正确 CORS。

Production game 不应在每次 spin 解压 ZIP；ZIP 只是编辑器传输容器。
