# Game Layout Editor Video Scene Transition 任务计划

## 1. 任务目标

本任务在现有 Game Layout Editor 与 `packages/rendercore/scene-layout` 的“独立稳定场景 + 显式有向
Spine overlay 转场”基础上，增加第二种 production 转场：**全屏黑场 + 带声音 MP4 + 目标场景淡入**。

验收用例按未来 game003 ZIP 所需的显式有向边设计：

```text
BaseGame -> FreeGame
```

在编辑器中使用 game003 素材验证横竖双背景绑定：

```text
BaseGame.landscape -> bg1.jpg
BaseGame.portrait  -> bg2.jpg
FreeGame.landscape -> fg1.jpg
FreeGame.portrait  -> fg2.jpg
```

转场使用：

```text
assets/game003-s1/bg2fg.mp4
fadeOutSeconds = 0.5
```

production 播放语义固定为：

```text
预加载视频和完整目标场景
  -> 玩家点击确认
  -> Pixi 最顶层显示全不透明黑层，并在其上播放带声音 MP4
  -> 淡出区间开始时原子提交完整 FreeGame 下层场景
  -> 视频和黑层在最后 0.5s 同步线性淡出
  -> alpha 到 0 后销毁视频显示对象并完成模式切换
```

这里的“完整目标场景”继续包含 mode-aware 横竖背景、Symbols reel、displayed mode 和后续 BigWin
binding，不允许只切背景。现有 Spine overlay 转场继续保留；两种转场必须形成 strict discriminated union，
不得用可选字段拼出第三种混合状态。

本任务只修改 `apps/gamelayouteditor` 及其必须依赖的通用 `packages/rendercore/scene-layout` 能力，并验证编辑器能
导出、重新导入该 self-contained ZIP。**不得修改 `apps/game003`、game003 YAML/generated config、game003 runtime
或让当前 game003 消费 ZIP。**“新的 game003 改为由 layout ZIP 驱动”属于后续独立任务。

本文件是完整实施合同。执行者不得依赖聊天记录、任务 113、历史报告或口头说明补齐 schema、时间线、
iOS 手势边界、资源生命周期、测试和验收。

任务完成后必须新增中文任务报告：

```text
tasks/114-gamelayouteditor-video-scene-transition-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/114-gamelayouteditor-video-scene-transition-260401-181300.md
```

## 2. 制定计划时的仓库与素材基线

制定本计划时现场为：

```text
repository: /Users/zerro/github.com/minecart2
branch:     main
HEAD:       6b9861c
date:       2026-07-21 (Asia/Shanghai)
```

工作区有以下用户提供的未跟踪素材：

```text
?? assets/game003-s1/bg2fg.mp4
?? assets/game003-s1/fg1.jpg
?? assets/game003-s1/fg2.jpg
```

它们是本任务输入，不得覆盖、移动、重新编码、格式化、清理、stash 后遗忘或为了测试替换为 fixture。
实施开始和结束时都要记录完整 `git status --short --untracked-files=all`。

只读检查得到：

| 文件 | 当前事实 |
| --- | --- |
| `bg1.jpg` | JPEG 实际像素 `2000 x 1125` |
| `bg2.jpg` | JPEG 实际像素 `1174 x 2000` |
| `fg1.jpg` | JPEG 实际像素 `2000 x 1125` |
| `fg2.jpg` | JPEG 实际像素 `1174 x 2000` |
| `bg2fg.mp4` | 4,133,208 bytes；ISO MP4；header 显示约 `3.625s`、`1280 x 720`、AVC video、AAC audio |

实施时仍须在真实浏览器通过 `loadedmetadata` 复核视频的 `videoWidth/videoHeight/duration` 和可播放性；
上表不能替代浏览器解码验收。若本机有 `ffprobe`，可以把探测结果写入报告，但不能把系统 ffmpeg/ffprobe
变成编辑器或 production runtime 依赖。

### 2.1 game003 现状只作为输入风险记录，不属于本次修改面

当前 `apps/game003/config/game-static.yaml` 仍声明 landscape background/art 为 `2000 x 2000`，旧 landscape
focus 为 `x=288,y=588,width=1424,height=824`。当前 `bg1.jpg/fg1.jpg` 的浏览器实际高度是 `1125`，旧 focus
底边为 `1412`，不能装进当前图片。

这组差异说明后续正式制作 game003 layout ZIP 时必须重新校准，但本任务不得直接修它。当前任务只要求编辑器：

- 不得把 `2000 x 1125` 静默当成 `2000 x 2000`；
- 不得非等比拉伸背景、篡改图片 metadata 或放宽 parser；
- 不得只修改尺寸测试让错误配置通过；
- 导入图片时使用浏览器实际 decode 尺寸并显式显示 art/focus 不完整诊断；
- 不得读取 game003 YAML 后静默覆盖 editor project，也不得凭文件名猜 focus/reel placement；
- 能以一套独立、合法的 editor 验收配置完成四背景 + 视频转场 preview、ZIP 导出和 ZIP round-trip。

这次报告只评价编辑器能力和验收 ZIP，不评价当前 game003 app 的 production 布局是否校准。后续“game003 消费
layout ZIP”任务必须单独决定 landscape art/focus/reel 的权威数据。

## 3. 环境、用户改动与执行原则

实施开始时执行：

```bash
cd /Users/zerro/github.com/minecart2
git branch --show-current
git rev-parse --short HEAD
git status --short --untracked-files=all
git diff --stat
node --version
pnpm --version
```

仓库要求 Node.js `>=24.0.0`。如果 shell 中没有 `node`：

```bash
nvm use 24
```

之后统一使用这套环境自带的 `node`、`pnpm`，不要强制安装、升级、降级或改写版本约束。

若依赖下载失败，先在当前 shell 执行用户指定代理，再重试原命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

不要删除 lockfile、切换包管理器、放宽依赖版本或手工复制下载产物。工作区既有修改都属于用户；禁止
`git reset --hard`、`git checkout --`、自动 stash、`git clean` 和无关批量 format。

若测试迫使 production 写出奇怪分支，应修正测试和测试注入边界，不得给 production 增加静默 fallback、
magic timeout、自动静音、自动瞬切或假完成。

实施前至少重新阅读：

```text
agents.md
apps/gamelayouteditor/README.md
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/editor-resource.ts
apps/gamelayouteditor/src/model/game-mode-commands.ts
apps/gamelayouteditor/src/model/resource-commands.ts
apps/gamelayouteditor/src/model/validation.ts
apps/gamelayouteditor/src/io/imported-layout-zip.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/transitions-workspace.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/ui/ui-session.ts
apps/gamelayouteditor/tests/**
packages/rendercore/src/scene-layout/**
packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/tests/scene-layout/**
docs/scene-layout-manifest.md
```

## 4. 范围与非目标

### 4.1 必须完成

- scene-layout manifest 增加 video-blackout transition 严格 union 和精确 MP4 闭包。
- rendercore 增加浏览器 video resource prepare、Pixi video texture、viewport-space 全黑层、contain 布局、
  media-time 驱动淡出和完整生命周期。
- public runtime 增加可在等待玩家确认期间执行的 transition prepare/cancel API，并保证真实点击调用栈内第一时间
  调用带声音视频的 `play()`。
- 保持现有 Spine overlay 有向边、event 原子切场、稀疏有向图和 fail-fast 语义。
- Game Layout Editor 支持导入 MP4 logical resource、选择两种转场类型、配置视频和 fade duration、预加载、
  点击播放、viewport 切换、ZIP round-trip 与资源引用诊断。
- 使用 `bg1/bg2/fg1/fg2/bg2fg.mp4` 做 editor-only 双背景验收，导出并重新导入 self-contained ZIP；该 ZIP
  是后续 game003 接入的输入，不在本任务中接入 live app。
- 更新文档、测试；必要时更新 `agents.md`；生成任务报告。

### 4.2 明确非目标

- 不修改 `apps/game003/**`、`apps/game003/config/game-static.yaml`、game003 generated files、tests、README 或
  current runtime；mainreelbg、conveyor、bg-bar、minecart 和业务组件不在本任务范围。
- 不把验收 ZIP vendoring 到 game003、不新增 game003 loader、不切换 game003 启动链路；这些属于后续任务。
- 不增加视频编辑、裁剪、转码、码率调整、字幕、poster、seek UI、多音轨选择或音量配置。
- 第一版只接受 owned `.mp4` / `video/mp4`；不接受远程 URL、HLS、WebM、MOV、data URL 或文件名 fallback。
- 不为 portrait 自动寻找另一段视频，不旋转视频，不 `cover` 裁掉横版内容。横版视频在任意 viewport 中固定
  `contain + center`，剩余区域由纯黑层填满。
- 不自动生成 `FreeGame -> BaseGame`。反向边缺素材时保持缺边并显式失败，不倒放 `bg2fg.mp4`。
- 不把 muted autoplay 当作带声音 iOS 方案，不在失败时静音重播或瞬切目标场景。
- 不以 wall-clock `setTimeout(3500)` 驱动切换；时长和 fade 进度来自实际 media timeline。

## 5. 产品与 schema 决定

### 5.1 保持 scene-layout v1，按 resource.kind 区分两种转场

继续使用：

```json
{ "version": 1, "kind": "scene-layout" }
```

现有 Spine transition 的 JSON 继续合法。`gameModes.transitions[].overlay.resource.kind` 是 union discriminator：

```ts
type SceneLayoutGameModeTransition =
  | {
      readonly from: string;
      readonly to: string;
      readonly overlay: {
        readonly resource: {
          readonly kind: "spine";
          readonly skeleton: string;
          readonly atlas: string;
          readonly textures: Readonly<Record<string, string>>;
        };
        readonly animation: string;
        readonly switchEvent: string;
        readonly placements: Readonly<
          Partial<Record<SceneLayoutVariantId, SceneLayoutNodePlacement>>
        >;
      };
    }
  | {
      readonly from: string;
      readonly to: string;
      readonly overlay: {
        readonly resource: {
          readonly kind: "video";
          readonly path: string;
          readonly mimeType: "video/mp4";
        };
        readonly fit: "contain";
        readonly fadeOutSeconds: number;
      };
    };
```

game003 示例：

```json
{
  "from": "BaseGame",
  "to": "FreeGame",
  "overlay": {
    "resource": {
      "kind": "video",
      "path": "assets/<full-sha256>.mp4",
      "mimeType": "video/mp4"
    },
    "fit": "contain",
    "fadeOutSeconds": 0.5
  }
}
```

严格规则：

- 每条 `from -> to` 仍最多一项，禁止自环、反向复用和自动寻路。
- `resource.kind=spine` 时只允许现有 `animation/switchEvent/placements` 字段。
- `resource.kind=video` 时只允许 `path/mimeType/fit/fadeOutSeconds`；禁止残留 Spine 字段或额外 placement。
- MP4 path 必须是 package 内 lowercase、hash-flat、完整 SHA-256 owned path；ZIP 中只能有精确引用闭包。
- `fadeOutSeconds` 必须 finite、`> 0`；资源 prepare 后还必须 `< actual duration`。
- 不把约 `3.5s` 写进 manifest。实际 duration 必须来自 `loadedmetadata`，当前文件预期约 `3.625s`。
- `fit` 第一版只能显式写 `contain`，parser 不提供默认值。
- parser 所有层级继续拒绝 unknown key，返回 deep-frozen normalized manifest。

### 5.2 两种转场拥有同一完整场景提交语义

Spine transition 继续在唯一 `switchEvent` 边界提交目标场景。

Video transition 的提交边界固定为：

```text
fadeStart = duration - fadeOutSeconds
```

当实际 `currentTime` 第一次达到或跨过 `fadeStart` 时，同一 runtime update 内先原子提交目标完整场景，再按当前
media time 计算视频和黑层 alpha。较大 delta 或浏览器一次跳过多个 media time 区间时，也只能提交一次。

淡出公式固定为线性：

```text
progress = clamp((currentTime - fadeStart) / fadeOutSeconds, 0, 1)
videoAlpha = 1 - progress
blackAlpha = 1 - progress
```

在 `fadeStart` 前，黑层 alpha 为 `1`，视频 alpha 为 `1`；来源场景继续保持完整和可回滚，但被黑层完全遮住。
在 `ended` 边界，目标必须已经提交；随后清理 overlay、提交 stable mode、resolve 请求。

不得让 target scene 自己做第二套 CSS/Pixi fade；所谓“FG 慢慢渲染出来”就是 target scene 位于同步淡出的 video +
black 之下。这样不会出现视频先透明而背景仍是来源场景的中间帧。

### 5.3 viewport-space 顶层与双背景适配

video-blackout 与黑层必须位于 Pixi stage 的 viewport-space 顶层：

```text
scene-layout-package-root (viewport origin)
  scene-art-root                 # 现有 art transform / art mask / backgrounds / reel
  popup-root
  spine-transition-root         # 现有 art-space Spine overlay
  video-blackout-root           # 永远最高，viewport-space
    black Graphics              # rect(0, 0, viewport.width, viewport.height)
    video Sprite                # contain + center
```

不得把黑层放进 art mask 后只盖住背景的一部分，也不得用极大 zIndex 代替稳定子树顺序。现有
`SceneLayoutPackageRuntime.container` 的 public owner 必须保持稳定；如需引入 wrapper root，要补 attachment、popup、
reel、snapshot、destroy 和 consumer 回归测试。

orientation 变化时：

- stable mode 根据现有 orientation-focus 规则选择 `bg1/bg2` 或 `fg1/fg2`；
- 已播放视频保持同一个 `HTMLVideoElement`、Pixi texture、audio 和 media timeline；
- 只用新 viewport 重新计算 contain 尺寸与居中位置、重画黑层；不得 seek、pause、重播或换资源；
- square 继续走现有 landscape variant 规则。

### 5.4 iOS 声音与两阶段 API

Apple Safari 的媒体策略要求带声音播放由用户手势触发；`playsinline` 用于避免 iPhone 强制全屏。预加载本身不等于
取得稍后带声音 autoplay 权限。因此 runtime 必须有两阶段 API，而不是在一个 async 请求的多个 `await` 之后才
调用 `video.play()`。

建议 public 合同：

```ts
interface SceneLayoutPackageRuntime {
  prepareGameModeTransition(
    modeId: string,
    options?: SceneLayoutGameModeRequestOptions,
  ): Promise<void>;

  cancelPreparedGameModeTransition(): void;

  requestGameMode(
    modeId: string,
    options?: SceneLayoutGameModeRequestOptions,
  ): Promise<void>;
}
```

流程固定为：

1. 在“等待玩家点击”UI 出现时调用 `prepareGameModeTransition()`。
2. prepare 完成目标 reel/catalog/scene、MP4 blob/object URL、metadata、首帧/可播放状态和 Pixi texture；不显示黑层、
   不播放声音、不改变 stable/displayed mode。
3. UI 只有在 prepare 成功后才启用确认按钮。
4. 确认按钮的真实 `pointerup/click` listener 直接调用 `requestGameMode()`。
5. 若匹配的 prepared transition 是 video，`requestGameMode()` 必须在同步调用栈中、任何 `await` 之前调用
   `video.play()`，设置 `playsInline=true`、`muted=false`、`volume=1`、`loop=false`。
6. `play()` Promise 成功后进入可见黑场播放；拒绝时清理 prepared owner、保持来源 stable scene 并把原始错误显式
   交给 UI。禁止静音重试、瞬切或假成功。

对于现有 Spine edge，`requestGameMode()` 可继续无显式 prepare 地工作；Game Layout Editor 和新的 production
接入应统一先 prepare，避免调用者通过 transition kind 分叉。video edge 在没有匹配 prepared state 时必须直接失败，
并提示需要先在玩家确认前 prepare。

`getGameModeSnapshot()` 至少增加：

```ts
preparedTargetMode: string | null;
transitionKind: "spine" | "video" | null;
mediaTimeSeconds: number | null;
mediaDurationSeconds: number | null;
fadeProgress: number | null;
```

现有 `stableMode/displayedMode/targetMode/transitionPhase` 语义不能退化。video 播放中：

- fade 前为 `before-switch`；
- fadeStart 提交后到 ended 为 `after-switch`；
- stable 时 media 字段回到 `null`。

参考的官方边界：

- Apple Safari：<https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari>
- PixiJS v8 Assets / video texture：<https://pixijs.com/8.x/guides/components/assets>
- PixiJS v8 `Texture.from(HTMLVideoElement)` 迁移说明：<https://pixijs.com/8.x/guides/migrations/v8>

## 6. 资源、播放器与生命周期合同

### 6.1 rendercore resource

- `collectSceneLayoutAssetPaths()` 必须收集 video path，排序、去重并参与 path/case/NFC alias 校验。
- `SceneLayoutResource` 增加严格 video URL/resource map；URL loader 对 MP4 使用 Blob URL，不把 bytes 转 base64。
- package loader/importer 保持现有 bounded unzip 限制；MP4 仍受单 entry、总 uncompressed、compression ratio 和文件数
  限制，不为视频单独放宽。
- prepare 使用注入式 media factory，production 创建真实 `HTMLVideoElement`，测试使用 deterministic fake。
- metadata 必须满足 finite positive duration、positive integer width/height、`canPlayType("video/mp4")` 可用；
  `fadeOutSeconds >= duration` 显式失败。
- 创建 Pixi video texture 时复用 Pixi v8 的 `HTMLVideoElement` / `VideoSource` 支持，不复制解码器，不创建第二个
  canvas renderer，不逐帧 `drawImage`。

### 6.2 失败与清理

- prepare 失败：来源画面零 mutation；销毁目标 reel/catalog、video element、texture/source、listeners 和临时 URL。
- play 拒绝：不进入 transitioning；来源 mode 保持 stable；UI 显示可操作错误。
- fadeStart 前 media `error/abort`：移除黑层/video，回滚到完整来源场景，reject。
- fadeStart 后目标已原子提交，不能伪回滚。若 media 随后 fatal error，立即移除残余 overlay、把目标整理为 coherent
  stable mode，并 reject 以便业务记录错误；不得卡在半透明或 `transitioning`。
- `stalled/waiting` 不是立即 fatal；保持当前黑层与 media timeline，收到恢复事件后继续。不得用 3.5 秒 wall-clock
  timeout 强制完成。真实 `error`、`abort`、destroy 才走明确失败。
- cancel 只允许 prepared、未 started 状态；started 后调用必须失败，不能假装取消正在播放的带声音转场。
- import/project replace、资源替换/删除、重新 preview、快速切 mode 和 app destroy 必须撤销全部 Object URL、event
  listener、Pixi texture/source、Graphics、Sprite 和 prepared target owner。
- 页面进入后台导致 Safari 暂停时，Promise 继续等待真实 media 恢复/结束；不得以 ticker delta 越过视频时间线。

## 7. Game Layout Editor 改造

### 7.1 logical resource 与导入

`EditorLayoutResource` 增加 `kind: "video"`：

```ts
interface EditorVideoLayoutResource {
  readonly id: string;
  readonly kind: "video";
  readonly path: string;
  readonly mimeType: "video/mp4";
  readonly size: { readonly width: number; readonly height: number };
  readonly durationSeconds: number;
  readonly hasAudio: boolean | "unknown";
  readonly provenance?: EditorResourceProvenance;
}
```

`hasAudio` 仅为导入诊断，不进入 production manifest，也不能据此自动静音或拒绝无声通用 MP4。对当前 game003
验收必须确认真实播放有声音。

导入要求：

- file picker 只接受 `.mp4`，同时校验扩展名、Blob MIME（浏览器未提供 MIME 时允许进入实际解码校验）、MP4
  可加载 metadata；不能只信文件名。
- metadata/readiness 全部成功后再以完整 SHA-256 content-addressed owned path 原子提交 resource + bytes。
- 相同 bytes 去重；不同 bytes 不按 basename 合并。
- 视频 resource 只能被 video transition 引用，不能创建普通 layout node、background 或 Spine transition。
- replace/delete/rename 复用现有引用诊断和事务语义；被转场引用时删除必须列出 `from -> to`。

### 7.2 转场 workspace

保留现有独立“转场”Tab。每条边增加明确的 presentation type：

```text
Spine 顶层特效
黑场视频
```

切换类型必须原子清理不兼容字段并要求用户重新选择，不保留隐藏 Spine event 或旧 video fade 值参与导出。

video inspector 至少包含：

- video logical resource 下拉，只列 `kind=video`；无“第一项”默认选择；
- 只读 metadata：尺寸、时长、是否检测到 audio、owned path；
- `fit=contain` 只读合同；
- `fadeOutSeconds` number input，当前 game003 明确填 `0.5`；
- 只读推导 `fadeStart=duration-fadeOutSeconds`；
- “预加载当前转场”“取消预加载”“播放当前转场”按钮和 runtime snapshot。

播放按钮只有在 prepare 成功、preview stable mode 等于 edge.from、无 popup/其它 transition 时启用。按钮 listener
必须直接触发 production `requestGameMode()`，不能先 `await`、setTimeout 或经异步 modal 再调用。

preview 完整复用 rendercore production video player；不得用 CSS `<video>` 盖在 canvas 上、editor-only alpha 模拟或
静态第一帧 placeholder。横屏、竖屏、square、自定义 viewport 都必须能播放和旋转预览。

### 7.3 ZIP import/export

- export vendoring 只包含被 transition 引用的 MP4；未引用 video 留在当前 session，不进入 production ZIP。
- import 必须从 manifest 和 exact closure 重建 video logical resource/metadata/transition draft。
- 重导出保持 manifest 语义、MP4 bytes 和确定性 entry 顺序；不得重新编码或改变 audio。
- malformed MP4、额外文件、missing video、hash path 漂移、fade 非法、kind 字段混用都应在 import/export 边界失败。

## 8. editor-only 验收项目与 ZIP 交接

### 8.1 必须建立的 editor 验收项目

项目 id 使用 `game003`，mode 为 `orientation-focus`，至少包含：

```text
initialMode = BaseGame

BaseGame:
  landscape background = bg1.jpg
  portrait background  = bg2.jpg

FreeGame:
  landscape background = fg1.jpg
  portrait background  = fg2.jpg

transition:
  BaseGame -> FreeGame
  kind = video
  resource = bg2fg.mp4
  fit = contain
  fadeOutSeconds = 0.5
```

`FreeGame -> BaseGame` 保持未配置并在 preview 请求时显式报缺边。验收项目不得猜 BG/FG animation、复制视频或
倒放。art/focus/reel 使用编辑器内一套自洽且严格合法的验收配置；不得从当前 game003 YAML 静默迁移，也不得以此
配置宣称新的 game003 production placement 已确定。

### 8.2 ZIP 输出合同

从编辑器导出：

```text
game003-layout.zip
```

要求：

- 自包含 `layout.manifest.json + exact owned dependencies`；
- 两套 mode 的四张背景和一段 MP4 均由完整 hash path 引用；
- current symbols/popup 只有在实际已绑定时才 vendor，不为满足 parser 塞空 dependency；
- 导出后重新导入，在 landscape/portrait 分别完整播放一次并再次导出；
- 比较 manifest canonical JSON、ZIP entry、每个 payload SHA-256 和 MP4 bytes；
- 报告记录验收 artifact 保存位置、文件大小和 SHA-256；
- ZIP 只证明 Game Layout Editor 输出合同可供后续 consumer 使用，本任务不得把它复制到 game003 loading/static
  closure，也不得修改 game003 使其加载该 ZIP。

报告必须明确写“editor ZIP 已导出并 round-trip；game003 app 尚未消费，接入属于后续任务”，不能模糊成已完成
live 状态切换。

## 9. 实施阶段

### 阶段 A：基线与失败样本

1. 记录 Git、Node、pnpm、素材 metadata 和现有 scoped tests。
2. 保存用户未跟踪输入清单；确认实现不会覆盖它们。
3. 为两种 transition union、video closure、非法 mixed fields、非法 fade 写先失败测试。
4. 为图片实际尺寸与 editor 验收配置写诊断，不读取或修改 game003 YAML 来绕过。

### 阶段 B：schema、resource 与精确闭包

1. 扩展 scene-layout types/parser/collector/package resource。
2. 增加 video URL/metadata prepare 和可注入 media factory。
3. 保证现有 Spine packages 无迁移继续通过，video 新包严格 fail-fast。
4. 覆盖 URL loader、Blob URL owner、destroy 和 exact-key tests。

### 阶段 C：production runtime

1. 梳理 package root / art root / popup / Spine overlay / video blackout 的稳定层级。
2. 实现 prepare/cancel 和匹配 prepared transition 的状态机。
3. 实现 trusted-click 同步 `play()` 调用、黑层、Pixi video sprite、contain、media-time fade。
4. 在 fadeStart 原子复用 task 113 的完整 target commit 路径。
5. 实现 orientation resize、snapshot、fatal error、stall、cancel 和 destroy。
6. 跑所有 task 113 Spine transition 回归，确保 event 路径无退化。

### 阶段 D：Game Layout Editor

1. 增加 video logical resource upload/replace/delete/diagnostics/Object URL 生命周期。
2. 把 transition draft 改为严格 union，补 command、validation、import/export migration-free round-trip。
3. 更新转场 inspector、preload/play/cancel、snapshot 和 disabled/error 状态。
4. preview 只调用 production runtime public API。

### 阶段 E：editor-only 双背景 ZIP 验收

1. 导入四张背景和 MP4，建立 BaseGame/FreeGame 及单向 video edge。
2. 用实际 landscape/portrait viewport 验证 mode 背景绑定、contain 黑边、声音和 0.5s reveal。
3. 仅在 editor 内完成一套合法 art/focus/reel 验收配置，不触碰 game003 YAML/runtime。
4. 导出、重新导入、重导出 `game003-layout.zip` 并记录 hashes；不把 ZIP 接进 game003。

### 阶段 F：文档、规则与报告

1. 更新 `apps/gamelayouteditor/README.md` 和 `docs/scene-layout-manifest.md` 的 schema、API、时间线、iOS 接入示例。
2. 更新 public JSDoc，明确 prepare 与真实点击同步 `play()` 边界。
3. `agents.md` 当前只声明 Spine transition；本任务完成后必须同步为“Spine overlay 或 video-blackout strict union、
   viewport 顶层黑层、media-time fade、iOS gesture-safe prepare/start”，并保留无缺边 fallback 规则。
4. 使用 UTC 时间生成中文任务报告，列出实际文件、测试、浏览器/设备、artifact、hash、已知阻塞和未完成项。

## 10. 自动化测试合同

### 10.1 rendercore

至少覆盖：

- Spine/video 两个 union 分支；unknown/mixed/missing field、非法 MIME/path/fade、自环/重复边。
- video path 进入精确闭包，orphan/extra/missing/case alias/NFC alias 显式失败。
- metadata duration/size、fade 小于 duration、unsupported/failed media。
- prepare 零 visible mutation；重复 prepare、cancel、target 改变、prepare 中 destroy。
- `requestGameMode()` 在 fake video `play()` 调用前没有 await/mutation；play reject 保留来源 stable。
- fade 前全黑且 source displayed；跨 fadeStart 的同一 update 原子 target commit；fade alpha 公式；ended stable。
- 大 media-time jump 只提交一次；同 symbols 保留、不同 symbols event 边界替换、无 symbols 移除。
- landscape/portrait/square resize 只重排，不 reset media。
- stalled/waiting、error before/after switch、abort、destroy、listener/texture/Object URL drain。
- video root 永远高于 popup/Spine/scene；黑层覆盖完整 viewport 而非 art mask。
- task 113 的 Spine event、time=0、大 delta、稀疏 directed edge、popup 排斥全部保持通过。

### 10.2 gamelayouteditor

至少覆盖：

- MP4 upload metadata 成功后原子提交；失败不污染 project/assets。
- content-addressed path、相同 bytes 去重、basename 不去重。
- video 不能创建普通 node/background，引用中的视频不能删除。
- transition type 切换清理不兼容字段；video 下拉不列 image/Spine。
- fade validation、derived fadeStart、prepare/play/cancel enabled state 和错误展示。
- 点击 handler 直接调用 runtime request；无 editor-only `<video>` DOM overlay。
- preview rebuild/import/destroy 的 stale async completion 不回写新 session。
- ZIP export/import/re-export 保留 MP4 bytes、audio、manifest union 和 deterministic entries。
- editor 验收项目的 BaseGame/FreeGame 四背景绑定、单向 video edge 和反向缺边。

### 10.3 命令

先跑 scoped：

```bash
pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build

pnpm --filter gamelayouteditor format:check
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build
```

最后跑根级门禁：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

若根级命令存在与本任务无关的基线失败，报告必须给 scoped 通过证据、原始根级失败和责任文件；不得改无关
production 代码“顺便修绿”。

## 11. 真实浏览器与 iOS 验收

自动化 fake media 不能证明 Safari 声音权限和真实 GPU video texture。本任务 Definition of Done 必须包含人工验收；
若用户明确要求自行验收，可以交接，但报告必须标为待验收，不能写通过。

启动：

```bash
pnpm dev:gamelayouteditor
```

至少验证：

1. Desktop Chromium/Safari：在 Game Layout Editor 导入验收素材，prepare 后按钮可用，点击后声音和画面同步开始。
2. 真实 iPhone/iPad Safari（不是仅桌面 UA 模拟）：视频保持 inline，不弹系统全屏；点击前不发声，点击后有声。
3. landscape：1280×720 视频 contain 居中，外部区域纯黑；最后 0.5s video+black 线性淡出并显示 fg1。
4. portrait：横版视频不裁切、不旋转，letterbox 区域纯黑；淡出后显示 fg2。
5. 播放中旋转设备：timeline/audio 连续，不重播、不重复切 scene。
6. 网络慢/prepare 未完成：确认按钮禁用；不能点击后进入永久黑屏。
7. `play()` 人为拒绝、资源 404/损坏：来源 scene 保持，错误可见，无静音/瞬切 fallback。
8. 转场中重复点击、启动 BigWin、请求第二个 mode：显式拒绝且不破坏状态。
9. 完成后检查 console、Pixi tree、media element、Object URL 和 GPU texture 无残留；连续播放多次 owner 数不增长。
10. 导出/导入 `game003-layout.zip` 后重复以上 landscape/portrait 播放并核对声音仍存在；确认全程没有启动或
    修改 game003 app。

报告记录设备型号、iOS/Safari 版本、viewport/orientation、是否静音开关开启、声音结果、console error count、截图/
录屏位置和 artifact SHA-256。

## 12. Definition of Done

仅当以下全部满足，任务才可标记完成：

1. scene-layout v1 可严格表达 Spine overlay 和 video-blackout 两种转场，现有 Spine edge 无回归。
2. video 转场使用 viewport-space Pixi 黑层与 Pixi video texture，fade 由实际 media time 驱动。
3. fadeStart 原子提交完整 target scene，最后 0.5s video+black 同步线性淡出，无中间来源背景泄露。
4. iOS 接入具备 prepare + trusted-click 同步 `play()` 合同；带声音失败不静音降级。
5. Game Layout Editor 可导入/管理 MP4、配置/预加载/播放 video edge、严格 ZIP round-trip。
6. editor-only 验收项目明确绑定 `bg1/bg2` 与 `fg1/fg2`，只配置 `BaseGame -> FreeGame` 的 `bg2fg.mp4` edge，
   能导出、重新导入并再次导出 ZIP。
7. `apps/game003/**`、game003 YAML/generated config/runtime/tests 均未因本任务修改，验收 ZIP 也未接入 game003；
   报告明确把 ZIP consumer 集成留给后续任务。
8. scoped 与根级自动化门禁有完整记录，真实浏览器/iOS 验收有结果或明确交接状态。
9. README、scene-layout 文档、public JSDoc 与实现一致；`agents.md` 在 ownership 变化时已同步。
10. 中文任务报告按 `tasks/114-gamelayouteditor-video-scene-transition-[utctime].md` 命名，列出基线、修改、测试、
    浏览器、artifact/hash、资源保护、阻塞和未完成项。
