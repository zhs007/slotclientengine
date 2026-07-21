# 任务 114：Game Layout Editor 视频场景转场执行报告

## 1. 结论与交接状态

任务 114 的代码、自动化测试、文档和 editor-only 验收 ZIP 已完成。`scene-layout` v1 现在以严格判别联合支持原有 Spine overlay 与新增 video-blackout 转场；Game Layout Editor 可以导入、管理、预加载、播放并严格 round-trip owned MP4 资源。

自动化验收全部通过。真实桌面浏览器与 iPhone/iPad Safari 验收由用户执行，当前状态为 **待用户验收**，本报告不将其记为通过。

**editor ZIP 已导出并 round-trip；game003 app 尚未消费，接入属于后续任务**。

## 2. 基线与范围保护

- 仓库：`/Users/zerro/github.com/minecart2`
- 分支：`main`
- HEAD：`6b9861c`
- 日期：`2026-07-21`（Asia/Shanghai）
- Node.js：`v24.14.0`
- pnpm：`11.9.0`
- 任务输入：用户提供的三个未跟踪素材与未跟踪任务计划
- 范围保护：最终 `git diff --name-only -- apps/game003` 无输出；未修改 `apps/game003/**`、game003 YAML/generated config/runtime/tests，也未让 game003 加载验收 ZIP。

输入素材从开始到结束未覆盖、移动、转码或替换：

| 文件                          |    字节数 | SHA-256                                                            | 已知尺寸/格式                                             |
| ----------------------------- | --------: | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `assets/game003-s1/bg2fg.mp4` | 4,133,208 | `501521557a5406af538bc4c67bf8847bb8d9fabc6e72b2d7c9d839b70bfdf70b` | ISO MP4；计划期 header 诊断约 3.625s、1280×720、AVC + AAC |
| `assets/game003-s1/fg1.jpg`   |   497,231 | `3ddacd7c2afb0552a7c4125750d213a9b77d6a8b5ac73d593ada67c48c435020` | 2000×1125 JPEG                                            |
| `assets/game003-s1/fg2.jpg`   |   432,844 | `a151c707c75a56d3df3554bcf277d49bee8cd5f6ae01d2e93a01d98b6217495b` | 1174×2000 JPEG                                            |

本机未提供 `ffprobe`。上述 MP4 metadata 不能替代真实浏览器 `loadedmetadata`、解码、音频和 GPU video texture 验收，相关项仍待用户验证。

## 3. 实施内容

### 3.1 `packages/rendercore/scene-layout`

- 把 Spine/video edge 建模为严格 discriminated union；拒绝 unknown、mixed、missing field、非法 MIME/path/fade、自环和重复边。
- video 只接受 content-addressed `assets/<sha256>.mp4` 与 `video/mp4`，纳入 package 精确资源闭包；支持 Vite URL 与 ZIP Blob URL owner，并在销毁时 revoke。
- 新增 Pixi video transition player：`playsInline=true`、带声音、非循环、viewport-space 全黑层、视频 `contain + center`，不使用 CSS/DOM video overlay。
- 新增 `prepareGameModeTransition()` / `cancelPreparedGameModeTransition()` 两阶段 API；真实点击调用栈内同步触发底层 `video.play()`，在此之前无 `await` 与 visible mutation。
- video 与黑层的最后一段淡出由实际 `currentTime` 驱动；fade 起点原子提交完整目标 scene，`ended` 后清理 video display object、media listener、texture 与 owner。
- 对 resize、慢加载、play reject、media error/abort、重复请求、目标改变、destroy 和切场前后失败保持显式错误与稳定来源/目标状态。
- 保留原有 Spine event 原子切场、稀疏有向图、popup lifecycle 和缺边 fail-fast 语义。

### 3.2 `apps/gamelayouteditor`

- 增加 video logical resource，上传/替换时校验扩展名、MIME、ISO MP4 `ftyp`、浏览器 metadata 和完整 SHA-256；相同 bytes 去重，失败保持事务性。
- video 不可作为普通 node/background/Spine transition 资源；被转场引用时禁止删除。
- transition draft、command、validation 与 UI 改成严格 Spine/video union；支持 video resource、`contain`、`fadeOutSeconds`、派生 fade start、prepare/cancel/play/snapshot。
- preview 只调用 rendercore production public API；点击处理器直接同步进入 runtime request。
- ZIP export/import/re-export 保留原始 MP4 bytes、严格 manifest、精确 owned dependencies 和稳定 entry；损坏或伪 MP4 显式失败。
- 新增 `acceptance:task114` 脚本，以 editor API 生成并 round-trip editor-only `game003-layout.zip`。

### 3.3 文档与规则

- 更新 `apps/gamelayouteditor/README.md`、`docs/scene-layout-manifest.md`、public JSDoc 与 `agents.md`。
- 文档明确 strict union、精确 MP4 closure、viewport 顶层、media-time fade、iOS trusted-click prepare/start 边界，以及缺边不得 fallback。

## 4. 自动化验收结果

所有命令均使用 Node.js 24 与 `CI=true` 执行。

### 4.1 Scoped 门禁

`@slotclientengine/rendercore`：

- `format:check`：通过
- `lint`：通过
- `typecheck`：通过
- `test`：通过，68 个测试文件、468 个测试
- `build`：通过

`gamelayouteditor`：

- `format:check`：通过
- `lint`：通过
- `typecheck`：通过
- `test`：通过，18 个测试文件、131 个测试
- `build`：通过
- `acceptance:task114`：通过，生成物与再次生成的 hash 一致

测试覆盖 strict union、exact MP4 closure、Blob URL revoke、prepare/cancel、trusted-click 同步 `play()`、media-time fade、目标 scene 原子提交、resize、失败与 drain、MP4 import/dedupe/replace/delete、workspace/UI、ZIP deterministic round-trip 和反向缺边。

### 4.2 根级门禁

- `pnpm format:check`：通过，27/27 tasks
- `pnpm lint`：通过，27/27 tasks
- `pnpm typecheck`：通过，27/27 tasks
- `pnpm test`：通过，27/27 tasks
- `pnpm build`：通过，27/27 tasks
- `git diff --check`：通过

非阻塞输出只有 Node ESM loader experimental/deprecation 提示和 Vite chunk 大于 500 kB 的既有类 warning；没有失败门禁。

## 5. Editor-only 验收产物

- 路径：`/Users/zerro/github.com/minecart2/game003-layout.zip`
- ZIP 文件大小：5,744,686 bytes
- ZIP SHA-256：`01579b29e869488eb79781308d2c2be8d140816cbd6c35113efbc7bf33aee632`
- `layout.manifest.json` SHA-256：`951b533d21be3db596e2742b73645f29a7f4b67019ab86d3deeb8b2ef4b832b7`
- ZIP entry：严格 6 项，即 manifest、4 张背景和 1 段 MP4；没有 orphan、宽泛 glob 或伪 dependency。
- MP4 entry 与原始 `bg2fg.mp4` 逐字节一致。
- 导出、重新导入、再次导出后 canonical manifest、entry 集、各 payload hash 和 ZIP bytes 一致。

验收项目使用独立、合法、由 editor 建立的 geometry，不读取或迁移当前 game003 YAML：

- `initialMode = BaseGame`
- BaseGame：landscape=`bg1.jpg`，portrait=`bg2.jpg`
- FreeGame：landscape=`fg1.jpg`，portrait=`fg2.jpg`
- 唯一转场：`BaseGame -> FreeGame`，video=`bg2fg.mp4`，fit=`contain`，fade=`0.5s`
- `FreeGame -> BaseGame` 未配置，preview 请求时显式报缺边

该 ZIP 位于仓库根目录且当前被 Git ignore；它是后续 consumer 集成输入，不是 game003 production 已接入的证据。

## 6. 待用户执行的浏览器与真机验收

状态：**待用户验收**。

当前仓库没有根级 `dev:gamelayouteditor` script，实际启动命令为：

```bash
pnpm --filter gamelayouteditor dev -- --host 0.0.0.0
```

请至少验证：

1. Desktop Chromium 与 Safari：prepare 完成后按钮可用，点击后画面与声音同步开始。
2. 真实 iPhone/iPad Safari：视频 inline 播放、不弹系统全屏；点击前无声，点击后有声。
3. landscape：1280×720 视频 contain 居中，外围纯黑；最后 0.5s video+black 线性淡出并显示 fg1。
4. portrait：不裁切、不旋转，letterbox 为纯黑；淡出后显示 fg2。
5. 播放中旋转：timeline/audio 连续，不重播、不重复提交 scene。
6. 慢网或 prepare 未完成：确认按钮禁用，不进入永久黑屏。
7. 人为拒绝 `play()`、404 或损坏资源：保留来源 scene，显示错误，不静音重播、不瞬切。
8. 转场期间重复点击、启动 BigWin 或请求第二个 mode：显式拒绝且状态不损坏。
9. 完成与连续多次播放后检查 console、Pixi tree、media element、Object URL、GPU texture 无残留，owner 数不增长。
10. 导入本报告记录的 ZIP 后在 landscape/portrait 重播，核对音频仍存在且全程未启动 game003 app。

验收记录应包含设备型号、iOS/Safari 版本、viewport/orientation、静音开关、声音结果、console error count、截图或录屏位置，并复核 ZIP SHA-256。

## 7. 未完成项与后续任务

- 真实 Desktop Chromium/Safari 与 iPhone/iPad Safari 验收尚未执行，由用户接手。
- 真实浏览器 `loadedmetadata` 得到的 duration/videoWidth/videoHeight、AAC 音频实际播放和 GPU texture 表现尚未签字。
- game003 consumer、loading/static closure、production mode 切换和正式 landscape focus/reel 校准均属于后续独立任务。

## 8. 后续修正：多状态背景独立绑定与同资源保活

用户复核编辑流程后发现：新增主状态曾复制当前状态的背景 node，后续重新选择资源时又以资源名派生 `bg1-2`、`bg1-3` 一类 node ID。这既让 BG/FG 看起来在修改同一个值，也会把资源命名偶然带入 node identity。

已修正为：

- 新增主状态的每个 active variant 初始均不绑定背景，必须在该状态/variant 下显式选择；不再复制当前状态的背景 node。
- 背景 node ID 只由 mode + variant 稳定派生，例如 `basegame-landscape-background` 与 `freegame-landscape-background`；正常 UI 流程不再允许手填背景 node ID，也不再生成 `bg1-2`、`bg1-3`。
- 资源选择器在打开时捕获目标 mode，切换主状态不会把确认结果写到另一个状态。
- 删除主状态只删除已无其它状态引用的背景 node，不误删共享资源。
- runtime 对相同图片 URL 只加载一份 Texture，各 node 保持独立 Sprite/placement；状态切换只改可见性，不释放 Texture。
- 相同 Spine resource 的不同 mode 仍保留独立 player/node/placement，以允许不同 animation 与时间轴；切换时不 destroy/recreate，仅在整个 runtime destroy 时释放。
- 当前 scene-layout 尚无 VNI 背景 kind；规则已明确未来增加后必须遵守相同的 exact-resource 保活合同。

修正后的专项验收：

- `@slotclientengine/rendercore`：68 个测试文件、472 个测试通过。
- `gamelayouteditor`：18 个测试文件、138 个测试通过。
- 根级 format、lint、typecheck、test、build 仍全部为 27/27 tasks 通过，`git diff --check` 通过。
- `apps/game003/**` 无改动。
- 重新生成并 round-trip 后 `game003-layout.zip` SHA-256 仍为 `01579b29e869488eb79781308d2c2be8d140816cbd6c35113efbc7bf33aee632`，证明既有 task 114 验收产物未被该修正破坏。

浏览器复核时进一步发现，视频本身正常播放，但 editor 的转场 Inspector 在播放期间停留在 prepare 前的静态 snapshot，直到结束才刷新，因此会误判为“没有播放”。现已修正为：

- `requestGameMode()` 进入后按动画帧读取 production runtime snapshot，实时显示 `phase / boundary / currentTime / duration / fade`。
- 请求开始即锁定转场新增、选择、资源、animation/event、placement/fade、预加载、播放与删除操作；完成或失败后停止监视并完整重绘解锁。
- preview 被配置更新、重新导入或销毁时同步取消监视，避免旧 request 更新新 runtime。
- 使用同一验收 ZIP 实测播放中状态为 `phase=transitioning`、`target=FreeGame`、`kind=video`，媒体时间持续推进；结束后为 `stable=FreeGame`，浏览器 console 无 error/warn。

用户随后以真实视觉复核指出：画布能看到视频首帧，媒体时间也会推进并按时结束，但视频纹理没有逐帧变化。进一步检查 Pixi 8.17.1 `VideoSource` 生命周期后确认根因：presentation 使用 `autoLoad: false` 接管既有 `HTMLVideoElement`，却没有显式调用 `VideoSource.load()`；因此 Pixi 没有安装驱动纹理自动更新的 `play/pause` 监听器。HTML media 在后台正常播放，Pixi Sprite 则停留在首次上传的画面。

本轮修正为：

- 创建 Pixi presentation 后显式调用并等待 `VideoSource.load()`；只有视频纹理 source 就绪后，prepare 才算完成。
- 继续由同一个 audible `HTMLVideoElement` 输出 AAC 音频；Pixi 仅上传画面帧，没有引入 DOM/CSS video overlay。
- gamelayouteditor preview 输出 `[scene-transition-video]` 前缀的一行式 JSON 日志，覆盖 prepare、`play()` resolve/reject、媒体事件、paused/ended/seeking、ready/network state、muted/volume/playbackRate，以及 `requestVideoFrameCallback` 观察到的真实 presented frame 数和 mediaTime。
- 新增回归测试，确保 prepare 等待 presentation source readiness，并证明真实 presented-frame 诊断会递增，而不再把 `currentTime` 推进误当成画面已经刷新。

用户继续配置时触发 `backgroundNode "basegame-landscape-background" must have the lowest order in landscape.`。根因是旧的背景排序只区分“任意 mode 背景”和普通层；若先配置 FreeGame、后配置 initial BaseGame，FreeGame 背景仍可能占据该 variant 的最低 order。现已改为稳定分组：initial mode 背景 → 其它 mode 背景 → 普通层。背景重新绑定、清除、删除 mode 或切换 initial mode 时都会同步归一化 order。回归覆盖先配置 fg1/fg2 再配置 bg1/bg2，以及切换 initial mode 后重新提升新 initial 背景；最终 strict manifest 可正常生成。

为兼容修复前已经打开的旧 draft，EditorStore 现在会在首次载入、import replace 和每次 transaction 后统一执行上述 canonical order，再运行 strict validation；不再要求用户手动重新绑定背景。导出被拦截时也会把真实 strict diagnostic 追加到“禁止导出”提示中，避免通用提示遮蔽根因。

导入用户提供的 `/Users/zerro/Downloads/game003-s1-symbols.zip` 时曾报 `V5G asset path is missing from manifest`。ZIP 顶层 package manifest 与 entry 均完整；问题是 hash-flat VNI project 位于 `assets/<hash>.json`，其 project 内以同目录 basename 引用图片，而旧 resolver 把 image module 强制压成 `assets/<filename>` key，造成键名错配。现改为基于实际 project module 路径精确解析每个 `asset.path`，不使用 basename fallback，并新增 hash-flat/同名 decoy 回归。真实 ZIP 已在 `loadTextures=false` 的完整 package resource 路径中导入成功：id=`game003-s1`、14 个 display symbols、57 个 exact resources、`L1.win=vni`。
