# gamelayouteditor

资源栏统一为“上传资源 / 上传文件夹”。导入按内容识别 image、完整 Spine、owned MP4 和
standalone image-string ZIP，成功只提交 logical resource；`BG_2.PNG` 建议 id 为
`bg-2`。image / Spine 导入直接使用规则生成的 id，不逐项弹窗命名；冲突依次追加
`-2`、`-3`。Owned payload 使用完整 SHA-256 扁平 `assets/` 路径，atlas page 与 manifest
同步改写；相同 bytes 可跨 logical resource 复用，GC 只清理无引用 blob。

浏览器内运行的 slot scene layout v1 编辑器，使用 Vite、TypeScript、Pixi.js v8 与 rendercore scene-layout。它是纯前端内存工作区：不连接业务服务器，不使用 WebSocket、账号、数据库、localStorage、IndexedDB 或 File System Access API。

Symbols 与获奖庆祝 popup 都作为可复用自包含 dependency library 导入。项目显式维护一个或
多个通用主状态，每个状态按 active variant 绑定独立稳定背景、零个或一个 symbols package，
以及零个或一个 popup。模式之间的 Spine overlay 或 video-blackout 转场以严格互斥分支在独立有向边中配置；导入不会自动绑定。
layout 为每个 popup、每个 active variant 只保存相对 viewport center 的 root `x/y/scale`；
内部 tier/layer/金额格式必须回 popupeditor 修改。

## 运行

```bash
pnpm --filter gamelayouteditor dev -- --host 0.0.0.0
pnpm --filter gamelayouteditor build
```

Vite `base` 固定为 `./`，`dist/` 可部署到任意静态 CDN 子路径。运行时只读取用户在浏览器明确选择的本地文件；导入和导出不会 POST 数据。

## 工作流

```text
新建项目 dialog / 导入
  -> 资源 Tab 上传 image / Spine / MP4 / standalone image-string logical resources
  -> 布局 Tab 为当前主状态绑定背景，通过 Resource Picker 创建图层
  -> 转场 Tab 显式创建有向边，选择 Spine event 或黑场 MP4 + fadeOutSeconds
  -> Symbols Tab 导入 library、选择 reelSet/renderMode 并绑定当前主状态
  -> BigWin Tab 导入 strict popup、绑定当前主状态并配置 per-variant root placement
  -> 右侧用独立预览状态 selector 调用 production mode runtime
  -> 以默认 bet=100、win=6000 预览当前 stable mode 的 BigWin
  -> 项目 Tab 检查 strict diagnostics 与 export closure
  -> 导出 production layout ZIP
```

左侧固定为六个互斥工作区：

- `资源`：上传、搜索、筛选、展开依赖/animation/引用、替换和删除 logical resource。
- `布局`：outline 按当前主状态背景、`main` reel、普通图层分组；Inspector 同时只编辑一个对象。
- `转场`：维护独立的有向 mode edge。Spine 分支选择已有 Spine resource、真实 once animation、唯一 event 与 per-variant art-space placement；video 分支选择已有 MP4、固定 `contain` 和正数 `fadeOutSeconds`，并提供预加载、取消与真实点击播放。
- `Symbols`：dependency library、当前主状态 binding、随机 local strip scene 与 session-only value mapping。
- `BigWin`：strict `award-celebration` library、当前主状态 binding、placement 与 production controls。
- `项目`：编辑 project id，查看逐状态 readiness、strict diagnostics、production closure 与只读 manifest preview。

右侧 preview、分辨率下拉、自定义宽高、独立预览状态、zoom 与 guides 始终保留。编辑状态与预览
状态只在“跟随编辑状态”开启时显式联动。preview page size 表示浏览器物理页面尺寸；rendercore
按 production frame policy 派生逻辑 frame、CSS canvas、黑边和 art viewport。Inspector 的
`details` 展开状态、scroll/focus 与 preview controls 都是 session state，不进入 ZIP。

## 资源优先合同

- 上传图片只创建一个 image logical resource 和对应 bytes；上传 Spine 文件组只创建一个由 skeleton、atlas 与全部 atlas pages 构成的 Spine logical resource。atlas 与 manifest 的 page key 保留原始可读文件名，owned payload path 继续使用完整 SHA-256 hash-flat 名；若多个 page 的 texture bytes 完全相同，payload 只存一份，例如 `BG.png` 与 `BG_2.png` 可以同时映射到同一个 hash path。上传 MP4 会先校验扩展名、MIME、ISO MP4 header 和浏览器 metadata/readiness，再原子提交完整 SHA-256 `.mp4` path 与原始 bytes；video resource 只能用于 video transition。上传 standalone image-string ZIP 会保留 validated manifest 与完整 glyph bytes。
- 上传不会自动创建 node、设置背景、写 placement、选择 animation，也不会因只有一个候选而自动绑定。
- Resource Picker 必须明确选择资源并确认。稳定 Spine node 只允许一个大小写精确的 loop animation，不提供 state-machine 或 mode node-state 入口。
- 新建主状态的每个 active variant 背景默认未绑定，必须在该主状态下分别选择；不能继承或共享前一状态的可编辑 background node。背景 node id 按 `mode + variant` 稳定生成，不从资源名追加 `-2/-3`。
- 不同主状态的背景 node 与 placement 始终独立。选择同一个 logical resource 时，runtime 复用精确 payload；图片 node 共享同一个已加载 Pixi texture，Spine 稳定 player 按 node 独立但在 mode 切换时保留、只切可见性，直到整个 runtime destroy 才释放。`BG -> FG` 与 `FG -> BG` 必须在“转场”Tab 分别创建，不能猜名称、自动补反向边或用 once completion 代替 switch event。
- switch event 只能从所选 animation 的真实 event timeline 下拉选择，名称大小写精确且必须恰好出现一次。转场 overlay 固定在普通 scene/reel 顶层；event 前保留来源完整场景，event 边界原子提交背景、reel 与 displayed mode，overlay 到 once completion 才移除。
- video transition 固定使用 viewport-space 全黑层和其上的 Pixi video texture；视频 `contain + center`，剩余区域保持纯黑。`fadeStart = actualDuration - fadeOutSeconds`，到达该 media-time 边界时原子提交完整目标场景，随后 video 与 black 同步线性淡出；不使用 wall-clock、CSS `<video>`、自动静音或瞬切 fallback。
- 带声音 video 使用两阶段调用：等待确认期间先“预加载当前转场”，确认按钮的真实 click listener 再直接调用 `requestGameMode()`。runtime 在任何 `await` 前同步调用 `video.play()`；`play()` 拒绝时清理 prepared owner、保持来源 stable scene 并显示错误。
- 同一 logical resource 可创建多个独立 node；每个 node 拥有自己的 id、order、playback/text/anchor 与 per-variant placement。image-string text 始终是 string，`"001"`、`"+12.50"` 不经过 number 转换。
- 删除 layer 只删除 node，不删除 resource 或 bytes。
- 被背景或 layer 引用的 resource 不能删除；错误会列出精确引用。
- 替换 resource 保持 logical identity，并原子影响全部引用。缺少既有 animation 或背景尺寸不兼容时整体失败。
- 不同图片背景尺寸只有明确确认“使用新尺寸并重新初始化”后才会改变 art/reel/focus。Spine skeleton header 的 bounds 是导出内容包围盒，不是 art 画布合同，无论是否存在都不能驱动 art size；Spine 可绑定背景，但 incomplete art size 必须在背景 Inspector 明确填写有限正数。首次补全尺寸会初始化居中的 reel/focus，并把仍处于默认原点的 Spine 背景置于 art 中心；背景 placement 的 x/y/scale 始终可显式编辑。
- UI Tab、主状态 selection、搜索/筛选、outline selection、Picker、展开状态、成功反馈、preview 状态/尺寸/zoom/guides 都是 session state，不进入 project、manifest 或 ZIP。

新背景首次获得明确尺寸后，编辑器按当前 main reel 尺寸居中转轮，并由转轮四边默认外扩 `60` 派生 focus。主转轮默认 `5 × 3`、cell `160 × 160`、gap `0`；不会 auto-fit 或猜 2000 × 2000。

## Production ZIP 与未引用资源

资源库是当前编辑会话的工作集；`<project-id>-layout.zip` 仍是精确 production artifact：

1. typed project 解析成向后兼容的 `SceneLayoutManifestV1`；
2. package closure 派生已引用 layout、nested image-string、mode symbols 与 popup dependencies；
3. 只从 validated byte store 选择传递闭包文件并执行严格资源校验；
4. ZIP 只写 `layout.manifest.json` 与闭包内的 `assets/**`、`dependencies/**`。

未引用资源不会阻止导出，也不会进入 production ZIP。它们在导出后继续留在当前会话，但重新
导入该 ZIP 时不会恢复。只有被 node 引用的 image-string，以及被任一主状态引用的 symbols / popup
会 vendor；多个状态共享同一 dependency 时只写一份。不存在 `includeInExport` 双重开关：绑定即
导出，未绑定即只留在 editor library。

Popup dependency 普通导入遇到同 id 会失败；使用“替换 Popup”时 nested id 必须相同，
完整 prepare 成功后才原子替换 bytes，既有模式引用与 placement 保持。被模式引用的 popup
不能删除。导出 ZIP 重新导入后，mode、popup 引用、placement 与 nested bytes 无损恢复。

安全限制保持不变：

- 最多 4096 个 entry；压缩包最多 200 MiB；单文件解压后最多 50 MiB；总解压尺寸最多 500 MiB。
- 根目录只允许 `layout.manifest.json` 与 manifest 精确引用的 `assets/**`。
- 路径必须为 ASCII、小写、POSIX 相对路径；拒绝绝对路径、反斜杠、空 segment、`.`、`..`、lowercase collision 和额外文件。
- `__MACOSX`、`.DS_Store`、`._*` 不会被忽略，应重新导出干净包。
- bounded streaming import、deterministic export、图片真实尺寸、Spine 4.3.x、atlas pages 和 animation 校验不放宽。

导入 production ZIP 后，编辑器按完整素材签名重建 resource library：image 使用 kind/path/size；Spine 使用 kind/skeleton/atlas/textures；video 使用 kind/path、浏览器实际 size/duration 与 audio 诊断。相同素材但不同 default animation 的 node 共享 resource record，animation 仍保留在各自 node。只有被 transition 引用的 MP4 进入 ZIP；导入/重导出保持 MP4 原始 bytes，不转码、不改变 audio。

## Symbols 工作区

在 `Symbols` Tab 导入 `symbolseditor` 生成的 strict symbol-package v1 ZIP。普通导入遇到同 id
失败；显式替换要求 nested id 相同并在完整 prepare 后原子提交。dependency 只拥有 validated
files；当前主状态 binding 拥有 package id、reel set 与 `standard | grid-cell` render mode。
绑定时 package `cellSize` 必须等于共享 main reel cell size，reel count 必须等于 columns，完整
公开轮带只能包含 display symbols；不兼容时失败，不修改 grid、不做 auto-fit。

Game Layout Editor 只消费 Symbols Editor 导出的全小写 strict package。历史 ZIP 若仍使用 `AF.disabled.png` 等含大写字符的 owned resource path，导入和导出都会明确提示先到 Symbols Editor 执行“导入旧包 → 导出新包”，不会在 layout dependency 边界静默改写。新包由格式 owner 结构化生成完整 SHA-256 hash-flat path，并同步改写 symbol manifest、VNI project 与 Spine atlas 引用；nested dependency 保持自包含。

只有兼容 reel set 可选，所有选择都显式保存到当前 mode。每列 stop 继续使用 Web Crypto，从本地
公开轮带读取并回绕；不使用 `Math.random()`，也不读取服务器 scene、真实轮带、GMI 或
randomNumbers。

“重新随机”只替换当前 dependency 的 sampled scene。相同 binding 的 mode 切换保留 reel；不同
binding 会在任何可见 mutation 前生成并验证目标 scene，在 Spine switch event 的提交边界替换。目标无 symbols
时移除 presentation，但保留 reel guide。production 只有显式传 `recreateReel: true` 与目标
`reels.main` 才会强制重建相同 binding；编辑器的普通状态切换不使用该开关。删除被 mode 引用的
dependency 会明确失败。

工作区可按 symbol 配置 session-only otherScene mapping：target 可选该 symbol 的命名 image-string
node；若没有命名节点但存在旧 valuePresentation，也可选择 legacy target。source 来自 package
game config 的命名 `numberWeightTables` 或 fixed positive integer。同一 symbol 最多一个 mapping，
未映射格写 `0`；matrix 与 scene 同尺寸并使用 x-major 布局。权重抽样复用 Web Crypto uint32
rejection sampling，不使用 modulo bias。

randomize 会同时重采 stop、scene 与 otherScene；只改 mapping 会保留 stop 并重采 value；resize、zoom、
guide、variant 和普通 relayout 不重采。缺 table/node/glyph 或 setter 失败时旧 preview 原子保留。
mapping、sampled scene 与 otherScene 都不进入 layout manifest 或 ZIP；导出的只有被引用的 validated
symbols packages、mode binding 与 reel order。服务器 scene、真实轮带、随机数与玩家输入永不写入。

## Production 消费

构建期可将 ZIP 解压到 `assets/<layout-id>/`，用 package-level closure/loader 一次准备 layout、image-string、symbols 与 reel runtime。CDN 方式可上传解压目录并调用 `loadSceneLayoutPackageFromUrl({ manifestUrl })`；服务器只需标准静态 GET 与正确 CORS。未配置 symbols binding 的旧 layout 仍可使用低层 layout-only runtime，但组合 reel API 会显式不可用。

Production game 不应在每次 spin 解压 ZIP；ZIP 只是编辑器传输容器。运行时通过
`prepareGameModeTransition(modeId, options)` 可在等待玩家确认时预备完整目标场景；`cancelPreparedGameModeTransition()` 只取消尚未开始的 owner。确认 click listener 必须同步调用
`requestGameMode(modeId, { reels: { main: targetInput } })` 切换到不同 symbols binding 的模式；
相同 binding 不传 target input，目标无 symbols 也不传。调用要求当前 stable mode 到目标存在显式有向边；
Spine Promise 在 switch event 原子提交且 overlay once 完成后 resolve；video Promise 在 media-time fadeStart 原子提交且 `ended` 清理后 resolve。期间可通过
`getGameModeSnapshot()` 查看 prepared target、transition kind、media time/duration、fade progress，并区分 `before-switch` 与 `after-switch`。完成后再调用
`startAwardCelebrationForCurrentMode({ betAmountRaw, winAmountRaw })`；游戏不解析 popup 路径，
也不传 popup id。
