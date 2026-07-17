# game layout editor bootstrap 任务计划

## 1. 任务目标

本任务新增一个纯前端 slot 游戏布局编辑器：

```text
apps/gamelayouteditor
```

编辑器使用 Vite + TypeScript + Pixi.js v8，最终 `dist/` 可直接部署到任意静态 CDN 子路径。应用不依赖业务服务器、上传接口、数据库、Node 文件系统、Electron、登录态或 WebSocket；导入、校验、预览、Blob URL 管理、manifest 生成和 zip 打包全部在浏览器内完成。

同时在 `packages/rendercore` 新增通用、严格、manifest-driven 的 scene layout 能力，使编辑器预览与游戏运行时使用同一套 parser、背景适配、节点布局、资源播放器和坐标计算。美术导出包固定为：

```text
<project-id>-layout.zip
  layout.manifest.json
  assets/**
```

游戏可将 zip 解压进静态资源目录后用 Vite 精确导入，也可把解压目录直接部署到 CDN、通过 manifest URL 在浏览器加载。编辑器可重新导入同一 zip 查看和继续编辑。zip 是传输容器，不要求 production game 每次运行时解压。

完成后必须具备：

1. 选择单背景 `maximized-focus`（当前 game002）或横竖双背景 `orientation-focus`（当前 game003）。
2. 配置主转轮列数、行数、cell width/height、x/y gap 和各 variant 的 art-space `x/y`，并画出外框与每个 cell。
3. 单背景有一套 reel/focus；双背景必须分别配置 landscape/portrait 背景、reel/focus，不能互相 fallback。
4. 上传静态图片或 Spine 图层，编辑 `x/y`、统一 scale、渲染顺序和方向可见性；预览区不允许拖动图层改配置。
5. 预览横屏、竖屏、方屏、近方屏或自定义可 resize 页面；preview zoom 仅改变编辑器显示比例，不参与游戏布局。
6. focus rect 和 reel grid 使用真实适配结果叠加显示。
7. 图层 node id 从主文件名去掉最后扩展名派生并统一小写；runtime 可按 id 获取节点，在其内部、前面或后面挂业务对象。
8. Spine 至少配置一个大小写精确的 default loop animation，复用 rendercore 官方 Spine 4.3 runtime。
9. 导出 manifest 和资源闭包严格校验；坏配置、缺资源、尺寸漂移、非法动画和路径显式失败，无 placeholder/fallback。
10. 用 game002/game003 等价 fixture 证明新 schema 能表达当前 `6x9/120x120/gap0` 和 `5x5/xGap15/yGap0` 并直接产出 reel 几何。

本文件是完整实施合同，不依赖聊天记录、旧任务或口头说明。

执行期间用户进一步收紧边界：本编辑器只验收游戏渲染部分，preview 尺寸直接作为 rendercore scene viewport；不得依赖或修改 `uiframeworks`。以下合同已按该决定修订。

完成后新增中文报告：

```text
tasks/98-game-layout-editor-bootstrap-[utctime].md
```

时间戳使用 UTC：

```bash
date -u +%y%m%d-%H%M%S
```

## 2. 范围

### 2.1 包含

- `packages/rendercore/src/scene-layout/`：manifest schema/parser、资源闭包、viewport/layout resolver、Pixi runtime、named-node API、Spine loop 生命周期。
- rendercore reel geometry 的真实 x/y gap 支持，不只在编辑器画 guide。
- `apps/gamelayouteditor` 脚手架、编辑状态、表单、预览、zip import/export、错误展示、测试、README、静态 build。
- scene layout v1 文档、game002/game003 等价 fixture、程序接入示例。
- 与新 ownership 一致的 `agents.md`、rendercore README、背景适配文档更新。

### 2.2 不包含

- 不做后端、在线素材库、账号、数据库、多人协作或云保存。
- 不做 live game、GMI、symbol/win 动画或业务组件编辑。
- 不把 token、cookie、服务器轮带或玩家输入写进 manifest。
- 不做 canvas 拖动图层、撤销历史、自动保存、IndexedDB、localStorage 或 service worker。
- v1 不做任意 Spine 状态机编辑，只编辑 default loop；不能猜 game002 FreeGame 业务。
- 不自动迁移或覆盖 game002/game003 生产配置。公共 API 和等价证明本任务完成，生产切换另行确认。
- 不猜测导入旧 YAML、旧 background manifest 或未知 zip；只接受本任务规定的包。

## 3. 当前实现和基线

仓库根目录：

```text
/Users/zerro/github.com/minecart2
```

工具链：Node >=24、pnpm >=10、turbo、Vite、Vitest、ESLint、Prettier、Pixi.js v8、official spine-pixi-v8 4.3.x。`pnpm-workspace.yaml` 已包含 `apps/*`。

权威适配实现：

```text
docs/background-adaptation.md
packages/rendercore/src/viewport/focused-art-viewport.ts
packages/rendercore/src/viewport/responsive-art-viewport.ts
packages/uiframeworks/src/layout.ts
```

现有合同：

- 单背景：`createMaximizedFocusedArtViewportPolicy()` / `calculateMaximizedFocusedArtViewport()`。
- 双背景：`height > width` 选 portrait，否则（含 square）选 landscape。
- 两者最终使用 `calculateFocusedArtViewport()` 得到 `visibleRect/worldOffset/focusRectInViewport`。
- `focusRect` 是完整 art 坐标；`frameFocusRect` 只服务 DOM/canvas frame，不定位 Pixi node。
- editor 不得复制 contain、variant、clamp 或 rect mapping 公式。

game002 当前等价数据：

```text
art: 2000 x 2000
mode: maximized-focus
focus: 580,277,840,1200
reel: 640,337, columns=6, rows=9
cell: 120 x 120
gap: 0 x 0
background: Spine 4.3.23, BG loop
```

主要文件：`apps/game002/src/background-config.ts`、`apps/game002/src/game-layout.ts`、`assets/game002-s3/background.manifest.json`。scene layout 必须复用现有 rendercore official Spine parser/player 底层。

game003 当前配置使用 `orientation-focus`，横竖各自背景/focus/frame/mainreelbg/conveyor，主转轮 `5x5`、cell `165x130`、x gap `15`、y gap `0`。主要文件：

```text
apps/game003/config/game-static.yaml
apps/buildgamestatic
packages/gameframeworks/src/static-config
apps/game003/src/game-layout.ts
apps/game003/src/game-adapter.ts
```

制定计划时：

```text
branch: main
HEAD: f654ac0
M  assets/game003-s1/bg1.jpg
M  assets/game003-s1/mainreelbg.png
?? assets/game003-s1/bgco.png
?? assets/game003-s1/bgcobk.png
?? assets/game003-s1/major.png
?? assets/game003-s1/majorbk.png
?? assets/game003-s1/mega.png
?? assets/game003-s1/megabk.png
?? assets/game003-s1/mini.png
?? assets/game003-s1/minibk.png
?? assets/game003-s1/minor.png
?? assets/game003-s1/minorbk.png
```

执行时重记 branch/HEAD/status，保护全部用户输入；禁止 reset、checkout、stash 或清理 untracked。上述 jackpot 图片是新通用 layer 的典型输入，但本任务不得擅自接入 game003 业务。

当前 working tree 的 `bg1.jpg/mainreelbg.png` 真实尺寸与已生成配置有漂移风险。实施时必须用浏览器解码或可靠工具重新确认；不一致应由严格校验暴露并写报告，不能忽略尺寸、偷偷 scale、恢复旧图或为测试放宽 production parser。

制定计划时的只读文件检查报告：

```text
working-tree bg1.jpg: 2000 x 1125
working-tree mainreelbg.png: 1057 x 793
current YAML declaration bg1: 2000 x 2000
current YAML declaration mainreelbg: 1130 x 824
```

这组差异属于用户正在进行的美术刷新，不是本任务可以擅自裁决的最终值；它也是 editor/importer 必须通过真实 decode 尽早暴露尺寸漂移的直接用例。

## 4. Ownership 与依赖

```text
apps/gamelayouteditor
  UI、draft/store、浏览器 File/Blob、zip、lowercase canonicalization、preview shell

packages/rendercore/scene-layout
  schema/parser、asset closure、viewport、node/reel geometry、image/Spine runtime、named-node API

packages/rendercore/reel
  columnGap + rowGap 的真实普通/grid-cell reel 行为

game app
  选择 package、提交 frame policy、使用 reel geometry、通过 public node API 挂业务对象
```

editor 不是 live game，不依赖 uiframeworks/gameframeworks session facade。依赖固定为 workspace rendercore、Pixi 和仓库已有 `fflate ^0.8.3`，不得再加第二个 zip 库。

## 5. Scene layout manifest v1

zip 根目录只允许：

```text
layout.manifest.json
assets/**
```

顶层固定并执行递归 unknown-key rejection：

```ts
interface SceneLayoutManifestV1 {
  readonly version: 1;
  readonly kind: "scene-layout";
  readonly id: string;
  readonly adaptation: MaximizedFocusLayout | OrientationFocusLayout;
  readonly nodes: readonly SceneLayoutNode[];
  readonly reels: Readonly<Record<string, SceneLayoutReelGrid>>;
}
```

单背景 adaptation：

```json
{
  "mode": "maximized-focus",
  "artSize": { "width": 2000, "height": 2000 },
  "focusRect": { "x": 580, "y": 277, "width": 840, "height": 1200 },
  "backgroundNode": "bg"
}
```

- 只有 `default` variant，node/reel placements 只能有 `default`。
- 不新增 frameFocusRect，policy 由现有 maximized-focus helper 生成。
- backgroundNode 必须存在、default 可见，并为该 variant 最底层。

双背景 adaptation：

```json
{
  "mode": "orientation-focus",
  "variants": {
    "landscape": {
      "artSize": { "width": 2000, "height": 1125 },
      "focusRect": { "x": 288, "y": 200, "width": 1424, "height": 824 },
      "frameFocusRect": { "width": 1424, "height": 824 },
      "backgroundNode": "bg1"
    },
    "portrait": {
      "artSize": { "width": 1174, "height": 2000 },
      "focusRect": { "x": 22, "y": 469.5, "width": 1130, "height": 1061 },
      "frameFocusRect": { "width": 1130, "height": 1061 },
      "minFocusMargin": { "left": 22, "right": 22 },
      "backgroundNode": "bg2"
    }
  }
}
```

示例数值只说明 schema，不授权覆盖 game003；fixture 按执行时真实资源重核。两个 variant 都必填，不可互补 fallback。focusRect 用于 art viewport；frameFocusRect/minFocusMargin 作为 game app 后续接入 frame policy 的声明数据，不参与 editor preview 尺寸计算。

Node：

```ts
interface SceneLayoutNode {
  readonly id: string;
  readonly order: number;
  readonly resource: ImageResource | SpineResource;
  readonly placements: Partial<Record<"default" | "landscape" | "portrait", {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
  }>>;
}
```

- placement key 存在即该方向显示；单背景必须且只能 default，双背景至少一个方向。
- 默认上传双背景 layer 时同时建立 landscape/portrait，用户可显式关闭一侧。
- `x/y` 可为有限负数；scale 为有限正数。
- order 为全局唯一 safe integer；小值先画/位于下方，parser 稳定排序并冻结。
- 每 variant 的 background node 必须是该 variant 最低 order。

图片资源：

```json
{ "kind": "image", "path": "assets/minibk.png", "size": { "width": 218, "height": 66 } }
```

Spine 资源：

```json
{
  "kind": "spine",
  "skeleton": "assets/bg/bg.json",
  "atlas": "assets/bg/bg.atlas",
  "textures": { "bg.png": "assets/bg/bg.png" },
  "defaultAnimation": "BG",
  "loop": true
}
```

- loop 必须显式为 true；不选第一个 animation 兜底。
- Spine 必须为官方 4.3.x，animation 大小写精确，atlas pages/textures 一一闭合。
- placement 作用于 player view；不使用 skeleton bounds 推导 art/focus。
- scene root 统一 clip 到当前 art，不创建每层 renderer/canvas。

文件名/path 规则：

- path segment 只允许 ASCII `[A-Za-z0-9._-]`；禁止中文、空格、控制字符、反斜杠、绝对路径、URL、盘符、`..` 和空 segment。
- 上传只自动把 ASCII 大写转小写；不拼音化、不猜替换、不自动追加序号。
- lowercase 后 path/node collision 显式失败。
- 图片 id = 文件名去掉最后扩展名；Spine id = skeleton JSON 文件名去掉最后扩展名；最终匹配 `^[a-z0-9][a-z0-9._-]*$`。
- Spine canonicalization 同步精确重写 atlas page 名和 textures map；只能改 parser 确认的 page 行，随后重新走 official parser。

Reel grid：

```json
{
  "reels": {
    "main": {
      "columns": 6,
      "rows": 9,
      "cellSize": { "width": 120, "height": 120 },
      "gap": { "x": 0, "y": 0 },
      "placements": { "default": { "x": 640, "y": 337 } }
    }
  }
}
```

- v1 UI 只创建 `main`，schema 用命名 record 为未来保留兼容空间。
- 双背景 placements 必须同时有 landscape/portrait。
- columns/rows 为 positive safe integer；cell 正有限；gap 非负有限。
- 不保存重复 width/height，严格派生：

```text
width  = columns * cellWidth  + (columns - 1) * gap.x
height = rows    * cellHeight + (rows - 1) * gap.y
```

- 每套 reel rect 必须完整位于对应 art。
- geometry 不含 reel kind、spin timing、速度、strip、symbol、服务器 scene 或业务组件。

## 6. Rendercore scene-layout 实现

新增：

```text
packages/rendercore/src/scene-layout/
packages/rendercore/tests/scene-layout/
@slotclientengine/rendercore/scene-layout
```

公共 API 至少包括：

```ts
parseSceneLayoutManifest(value)
collectSceneLayoutAssetPaths(manifest)
createSceneLayoutResource(options)
loadSceneLayoutResourceFromUrl(options)
createSceneLayoutFramePolicy(manifest)
resolveSceneLayoutViewport(options)
resolveSceneLayoutReelGrid(manifest, reelId, variantId)
createSceneLayoutRuntime(options)
```

### 6.1 Parser、资源和 CDN loader

- parser 只做纯数据解析与类型、范围、引用、variant、order 校验，返回 deep-frozen 数据。
- `collectSceneLayoutAssetPaths()` 返回唯一、稳定排序、精确闭合的资源列表，供 Vite modules、loading、CDN preload 和 export 共用。
- `createSceneLayoutResource()` 接收显式 manifest 及 image/json/atlas/texture module maps；rendercore 不使用宽泛 glob。
- `loadSceneLayoutResourceFromUrl()` 以 manifest URL 为根，用浏览器 fetch 加载精确闭包，允许注入 `fetchImpl` 测试。非 2xx、CORS、JSON、图片或 Spine 失败直接 reject，不尝试其它路径。
- URL 只用 `new URL(relativePath, manifestUrl)` 解析，并拒绝绝对 URL/origin 逃逸。
- 图片真实解码宽高必须等于 manifest size，不能按声明值静默拉伸错误资源。
- 初始化中途失败必须回滚 Blob URL、Texture、Spine player 和 Pixi node。

### 6.2 Frame policy 和 viewport

- 单背景 frame policy 直接复用 `createMaximizedFocusedArtViewportPolicy()`。
- 双背景生成结构兼容现有 `orientation-focus` policy，使用两套 artSize/frameFocusRect/minFocusMargin。
- viewport 只组合现有 focused/maximized/responsive art helpers 和 `mapArtRectToViewport()`，不复制公式。
- snapshot 至少包含：`variantId/artSize/viewportSize/visibleRect/worldOffset/focusRectInViewport` 和各 reel 的 art/viewport rect。

### 6.3 Runtime 合同

```ts
interface SceneLayoutRuntime {
  readonly container: Container;
  init(): Promise<void>;
  applyViewport(viewportSize: Size): SceneLayoutSnapshot;
  update(deltaSeconds: number): void;
  getSnapshot(): SceneLayoutSnapshot;
  getNode(id: string): Container;
  attachChild(options: AttachChildOptions): () => void;
  attachRelative(options: AttachRelativeOptions): () => void;
  getReelGrid(id: string): ResolvedSceneLayoutReelGrid;
  destroy(): void;
}
```

- `container` 是 art world 并应用 worldOffset；runtime 不负责 resize renderer。
- 每个 node 对应稳定、公开、带 label/id 的 Container，方向切换复用同一对象。
- 未知 id、destroy 后调用、重复 init、未 init update、非有限 delta 都显式失败。
- `attachChild({nodeId, object})` 挂在 node 内，继承 transform/visibility。
- `attachRelative({nodeId, placement:"before"|"after", object})` 挂同级 sibling；before 先画/在下方，after 后画/在上方。返回 disposer，runtime destroy 统一清理。
- 必须覆盖 `getNode("minibk")` 并在其前景（after）挂数字节点；app 不操作 runtime 私有 children array。
- 当前 variant 不可见的 Spine 暂停 update；重新显示时保留时间轴，不重新 init/player。
- scene root 使用一个 art rect mask，不给每层增加 mask。

### 6.4 Spine 复用

审查并最小抽取：

```text
packages/rendercore/src/background/manifest.ts
packages/rendercore/src/background/spine-background-player.ts
packages/rendercore/src/spine/runtime-player.ts
```

复用 official 4.3 version、skeleton/atlas/page、exact animation、manual update、init/destroy 和 attachment validation。若 private helper 阻碍复用，抽到通用 `src/spine/` 并保持 background/symbol 既有 API 与测试不变；禁止复制 parser/player 到 editor。

## 7. Reel x/y gap 必须真实落地

当前普通 ReelLayout 只有 columnGap，getCellY 固定 `y * cellHeight`；grid-cell x/y 也按纯 cell 尺寸。manifest 支持 y gap 时必须同步 runtime。

扩展普通类型：

```ts
readonly rowGap?: number;
readonly rowGap: number;
```

缺省仍为 0；统一使用：

```text
strideX = cellWidth + columnGap
strideY = cellHeight + rowGap
visibleWidth  = count * cellWidth + (count - 1) * columnGap
visibleHeight = rows  * cellHeight + (rows - 1) * rowGap
```

普通 reel 审计 strip slot、mask、symbol center、geometry snapshot、blur/dimming 和 stop position。

`RenderGridCellReelSetOptions` 增加 columnGap/rowGap（缺省 0），审计 cell root、full-grid mask、dim overlay、effect center、geometry snapshot、cascade source/target、selective spin、visible frame 和 anchor center。gap 区域保持透明，完整 mask 可覆盖包含 gap 的总矩形。

- game002 显式 `0/0`；game003 `15/0`。
- 旧测试若只因新正确字段失败，更新 fixture/断言；不能保留第二套 production 公式。
- 增加 nonzero x/y gap 测试，证明 guide、geometry snapshot 与真实 Pixi node 一致。

## 8. UI 框架边界

本任务不修改 `packages/uiframeworks`。editor 自定义/预设尺寸就是游戏渲染 viewport，只调用 rendercore scene-layout；DOM frame、HUD、session 与黑边算法不进入编辑器依赖图。

## 9. `apps/gamelayouteditor` 初始化

建议结构：

```text
apps/gamelayouteditor/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  eslint.config.cjs
  README.md
  src/
    main.ts
    styles.css
    model/{editor-project,editor-store,validation}.ts
    io/{filename-policy,imported-layout-zip,exported-layout-zip,object-url-registry}.ts
    preview/{layout-preview,preview-guides,preview-size}.ts
    ui/{app-shell,project-panel,adaptation-panel,reel-panel,layers-panel,layer-editor,preview-toolbar,error-panel}.ts
  tests/
    setup.ts
    fixtures/
    *.test.ts
```

不新增空目录；确需空目录放 `.keepme`。

package scripts 至少有 prepare:deps/dev/build/lint/test/typecheck/format/format:check。prepare 只 build workspace rendercore。Vite 固定 `base:"./"`，确保 CDN 任意子路径工作。

Editor model 规则：

- UI 维护 mutable draft，不直接改 parsed manifest；导出前转换 immutable manifest 并再次调用 rendercore parser。
- 每次表单修改以 transaction 更新、验证、刷新 preview。非法中间输入显示字段错误并禁止 export；只要已有一个可用背景，就以严格的单 variant 临时 manifest 继续 preview，不偷偷恢复上次值。
- import 先完整验证，成功后原子替换当前 project；失败保留旧 project，并释放本次临时资源。
- New project 先选 mode 并上传必需背景，不生成透明/2000x2000 placeholder。
- project 仅内存保存。

## 10. UI 与 Preview

页面使用“配置面板 + 中央预览区”，至少包括 New、Import zip、Export zip、project/mode、background/adaptation、focus、reel、layer list/detail、preview toolbar 和 error summary。控件有 label、单位、坐标基准和键盘可访问性。UI 可中文，但 package/file/key/id 必须英文 ASCII。

### 10.1 背景和 focus

单背景：上传 image 或 Spine 后立即 preview；image artSize 从真实解码尺寸读取，Spine 优先读取 skeleton 内有限正数 bounds，缺失时才由用户填写；列出真实 animations 并显式选 default loop。

新项目的主转轮默认 `5x3`、cell `160x160`、gap `0`。背景尺寸可用后自动居中主转轮；编辑器以相对主转轮四边的 `left/top/right/bottom=-60/-60/60/60` 作为 focus 参数，并派生绝对 `focusRect`（接近 art 边界时封顶）。高级参数仍可展开手调。最终 parser 必须保证 focus 包含完整主转轮。

双背景：landscape/portrait 各自上传背景，独立 artSize/focusRect/frameFocusRect/可选 minFocusMargin；任一缺失禁止 export，但第一侧上传后立即以临时单 variant manifest preview；两侧完整后按正式规则选 variant。

### 10.2 Reel 面板

常用区只先展示默认 `5x3` 的 columns/rows；cell width/height、gap x/y 与 default 或 landscape+portrait x/y 收进高级区。实时显示派生 width/height；修改 reel 后 focus 继续按默认 60 外扩更新。guide 画外框、cell 边界和可选 label。guide 只属 editor，不进入导出资源或 production 默认画面。

### 10.3 Layer 面板

- 图片支持浏览器/Pixi 已支持的 png/jpg/jpeg/webp。
- Spine 一次选择 skeleton JSON、atlas 和全部 texture pages；不完整时失败。
- 编辑 order/x/y/scale/landscape visible/portrait visible。单背景固定 default visible。
- id 只读。删除 background 或被引用节点时阻止并列出引用，不改成别的节点。
- reorder 用按钮或数字，不允许 canvas 拖动；重编号稳定并保持背景最底层。

### 10.4 Preview

presets 至少：

```text
1920x1080 landscape
390x844 portrait
1200x1200 square
1430x1464 near-square
```

支持自定义 width/height、preview resize handle、zoom out/reset/in、focus/reel guide 开关，以及 variant/viewport/visibleRect/worldOffset 诊断。

预览分辨率表示真实页面物理尺寸，不能直接作为 Pixi art-space viewport。编辑器必须先通过 rendercore 的纯 frame policy 几何得到与游戏一致的 `frameDesignSize/cssSize/offset`：单背景复用 game002 `maximized-focus`，双背景复用 game003 `orientation-focus`（含横竖 variant、frameFocusRect、minFocusMargin 和黑边）；再以 `frameDesignSize` resize renderer 并计算 scene viewport。编辑器不得依赖或复制 uiframeworks DOM/runtime。

严格链路：

```text
preview size -> rendercore scene viewport
preview zoom -> 仅 CSS 显示比例
```

zoom 不改 Pixi 坐标；不使用 CSS cover/contain 替代 rendercore。resize 复用同一 Pixi Application/runtime/textures/Spine players，只更新 renderer/frame/viewport，不重载或泄漏。

## 11. Zip import/export

### 11.1 Import

使用 fflate 在浏览器读取：

- 只收 zip，根目录恰好一个 layout.manifest.json。
- 拒绝 zip-slip、绝对/反斜杠路径、重复 normalized path、lowercase collision。
- 拒绝 manifest 未引用的额外文件；目录 entry 可忽略，文件必须属于闭包。
- 设置 entry 数、单文件解压尺寸和总解压尺寸上限并写 README；使用可在解压过程中累计并中止的 API，不能先无限 `unzipSync` 再检查 zip bomb。
- JSON 必须 UTF-8；image decode、official Spine parse、animation、atlas closure 和 manifest 全通过后才能换 project。
- Blob URL 全部登记 owner，在切项目、失败、destroy 时 revoke。
- macOS `__MACOSX/.DS_Store/._*` 不静默忽略；提示重新导出干净包。

### 11.2 Export

固定流程：

```text
draft -> canonical manifest -> rendercore parse -> resource closure
-> decode/Spine validate -> lowercase paths -> stable JSON -> zip Blob -> download
```

- zip 名 `<project-id>-layout.zip` 全小写。
- manifest 2-space、LF、末尾 newline，nodes 按 order、maps/path 稳定排序；相同 project 重导 manifest bytes 一致。
- 图片 bytes 原样；仅 atlas page 因 lowercase 进行结构化重写。
- 不嵌 base64、不生成未引用缩略图、不复制资源、不 POST 服务器。
- 任一失败禁止下载，并把错误定位到字段/path。

### 11.3 游戏/CDN 消费

README 写清：

1. 构建期：解压到 `assets/<layout-id>/`，用精确 imports/import.meta.glob 构造 resource；loading closure 由 collector 给出。
2. CDN runtime：上传解压目录，用 manifest URL loader；只需标准静态 GET/CORS。

production game 不在每次 spin 解压 zip。zip adapter 属于 editor，rendercore 核心不依赖 fflate。

## 12. Game002/Game003 等价证明

### 12.1 Game002 fixture

表达 `maximized-focus`、art `2000x2000`、focus `580,277,840,1200`、main reel `640,337`、`6x9`、cell `120x120`、gap `0/0`、Spine `BG` loop。

断言：

- 派生 reel width=720,height=1080，focus 包含 reel。
- portrait/near-square/square/landscape 与现有 helper 结果一致。
- official parser 找到 BG；ticker 推进且 resize 不重播。
- `getNode("bg")` 始终返回同一对象。

fixture 可用小 stub；不要复制整套大美术。真实集成测试可只读现有 assets，不写回。

### 12.2 Game003 fixture

表达两套背景/focus、mainreelbg、conveyor1/2、新 jackpot layers，主 reel `5x5`、cell `165x130`、gap `15/0`、两套 art-space position。

断言：

- width=885,height=650。
- portrait/landscape/square 选择与 `calculateResponsiveArtViewport()` 一致。
- conveyor1 仅 landscape、conveyor2 仅 portrait；新 layer 默认两侧可见，关闭一侧不复制另一侧。
- `getNode("minibk")`、attachChild 和 attachRelative(after) 的 draw order/transform 正确。

创建真实 fixture 前重新核对 working tree 图片尺寸。如果 bg1/mainreelbg 与 YAML 不一致，测试应明确失败或使用独立 synthetic bytes；不得放宽 parser。

### 12.3 程序接入示例

在 rendercore README 或 `docs/scene-layout-manifest.md` 给完整代码：

```ts
const resource = createSceneLayoutResource(...);
const runtime = createSceneLayoutRuntime({ resource });
await runtime.init();
app.stage.addChild(runtime.container);

const framePolicy = createSceneLayoutFramePolicy(resource.manifest);
const reel = runtime.getReelGrid("main");
const minibk = runtime.getNode("minibk");
const disposeAmount = runtime.attachRelative({
  nodeId: "minibk",
  placement: "after",
  object: amountContainer,
});
```

还要展示 resize、ticker、destroy，以及将 columnGap/rowGap 传给普通/grid-cell reel。

## 13. 测试计划

### 13.1 Rendercore scene-layout

覆盖：

- 两种合法 mode、deep freeze、递归 unknown field。
- 缺 default/landscape/portrait placement；非有限数、负尺寸、focus/reel 越界。
- grid 派生尺寸与非零 x/y gap。
- node id/order/path/variant/background 引用和 lowercase collision。
- asset missing/extra/duplicate、image size mismatch。
- CDN relative URL、origin/path escape。
- Spine 4.3 exact animation、多页 atlas、错误 page/animation/version。
- runtime init/update/applyViewport/getNode/attach/destroy、direction identity/visibility。
- init failure rollback 和资源释放。

### 13.2 Reel gap 回归

- 默认 gap=0 与旧坐标一致。
- nonzero x/y gap 的 node position、mask、center、geometry snapshot。
- spin 前中后、grid-cell effect/cascade/selective refill 使用 stride。
- game002/game003 目标包回归通过。

### 13.3 Uiframeworks

- public export 可用。
- fixed/focus/orientation/maximized 旧行为不变。
- square 双背景选 landscape。
- editor 只从 public entry import。

### 13.4 Editor IO/model/UI

- new single/dual、image/Spine upload。
- ASCII/lowercase/collision。
- form -> manifest -> preview，非法输入禁止 export。
- reorder/visibility/delete 引用保护。
- page presets/custom resize/zoom 独立性。
- guides 来自 runtime snapshot。
- zip round-trip 后 manifest、资源 bytes、order、geometry 等价。
- malformed zip、zip-slip、duplicate、extra、oversize、missing asset。
- repeated import/export 和失败路径 Blob URL revoke。
- destroy 清理 ticker/Pixi/runtime/listener。

fixture zip 用 fflate 在内存确定性创建，不提交大型二进制 zip。

### 13.5 浏览器人工验收

```bash
pnpm --filter gamelayouteditor dev -- --host 0.0.0.0
```

在报告逐项记录：

1. 新建 game002 等价单背景，上传 Spine、选择 BG，四类页面比例持续 loop。
2. 新建 game003 等价双背景，横/竖/方切换不串背景、conveyor、reel。
3. 上传 minibk 等 layer，表单 order/x/y/scale 生效，canvas 拖动不改数据。
4. 关闭 conveyor1 portrait、conveyor2 landscape，切换正确。
5. zoom 改变时布局诊断不变；preview size 改变时 viewport/visibleRect 变化。
6. 导出、刷新、重导入后画面和数据一致。
7. 在 minibk after 挂数字，resize/方向切换后仍对齐。
8. 将 dist 放静态 HTTP server 非根路径；资源加载成功，Network 无 API/WS。

## 14. 实施步骤

### 阶段 0：基线审计

1. 记录 branch/HEAD/status，保护 game003 美术。
2. 跑当前 rendercore/game002/game003 目标测试，记录既有失败。
3. 重读 viewport/reel/background public API。
4. 用真实 decoder 核对背景和 scene 图片尺寸，只记录，不擅自改 game003。
5. 确认 fflate/Pixi 版本，避免重复依赖。

### 阶段 1：Schema 与纯 parser

1. 新增 types/errors/parser。
2. 实现 filename/path、variant/node/order/reel validation。
3. 实现 asset collector、纯 geometry 和 frame policy resolver。
4. 写 parser/geometry tests 和 manifest 文档初稿。

先冻结纯数据合同，再写 UI；UI draft 不能反向成为 runtime schema。

### 阶段 2：Reel gap

1. 增加 rowGap 和 grid-cell columnGap/rowGap。
2. 替换 stride/visible-size 计算并补回归。
3. 跑共享包和 game002/game003 门禁，确认 gap=0 兼容。

### 阶段 3：Scene resource/runtime

1. 实现 module/CDN resolver。
2. 复用/抽取 official Spine 底层。
3. 实现 image/Spine nodes、visibility、mask、viewport。
4. 实现 getNode/attachChild/attachRelative/getReelGrid。
5. 覆盖 lifecycle、rollback、方向切换和释放。

### 阶段 4：Editor app/UI

1. 初始化 Vite app、scripts/config/styles/README。
2. 建 draft/store/validation transaction。
3. 实现 project/mode/background/focus/reel/layers forms。
4. 实现 reorder/visibility/Spine animation selector 和字段错误。

### 阶段 5：Preview

1. 用 preview size 直接更新 scene runtime viewport。
2. 用 scene runtime 建 Pixi preview 和 guide layer。
3. 实现 presets/custom resize/zoom/diagnostics。
4. 验证 resize/switch 不重复 init、不泄漏。

### 阶段 6：Zip

1. 实现受限流式 unzip、安全/path/closure 校验。
2. 实现 object URL registry 和失败回滚。
3. 实现 lowercase export、atlas page 精确重写、stable JSON/zip。
4. 完成 round-trip 和资源上限测试。

### 阶段 7：Fixture、文档、验收

1. 完成 game002/game003 fixture 和接入示例。
2. 更新 rendercore README、背景适配文档。
3. 按真实 ownership 更新 agents.md。
4. 完成目标/根级门禁和人工验收。
5. build dist 并验证 CDN 子路径。

### 阶段 8：报告

生成 UTC 时间戳，写中文报告，真实列出 schema/API/files/tests/browser/CDN/已知限制/用户输入保护/后续生产迁移建议；未执行的人工项不得写通过。

## 15. 命令与依赖下载

依赖先正常安装；只有网络下载失败时按用户指定代理重试：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
pnpm install
```

不得将代理写入仓库配置、npmrc、源码或产物。

目标门禁：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build

pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build

pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game003 test
pnpm --filter game003 typecheck
```

根级再跑：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

若根级被任务外既有问题阻塞，报告精确 command/package/error/目标包可复现性。不得 skip、降 coverage、catch ignore 或加 production fallback。若旧测试与正确新合同冲突，修改测试；不为测试保留重复字段或测试专用 production 分支。

## 16. Agents.md 更新

公共边界真实落地后同步规则：

```text
packages/rendercore owns generic scene-layout manifest parsing, asset closure,
image/Spine node runtime, named-node lookup/relative attachment, focus/reel
geometry and variant application. Game apps only load the package, attach
business objects through public APIs, and pass reel geometry to rendercore.

apps/gamelayouteditor owns browser-only editing UI, preview controls, zip IO,
filename canonicalization and Blob URL lifecycle. It is static-CDN deployable
and must not require a server.
```

同时记录 ASCII lowercase path、rowGap/columnGap 为真实 runtime geometry、app 不复制 scene parser/适配/Pixi assembly、缺 variant/resource/animation 不 fallback。若最终实现没有建立这些 API，不得提前写虚假规则。

## 17. 禁止事项

- 禁止后端、BFF、上传 API、数据库或 Node server。
- 禁止依赖本机绝对路径或 File System Access API；标准 file input + Blob 即可。
- 禁止 preview 与 production 两套适配/布局公式。
- 禁止 app import rendercore private source。
- 禁止 focus 默认成 reel、整图或另一 variant。
- 禁止缺方向 fallback、自动镜像/复制。
- 禁止自动 clamp 坏 focus/reel/layer。
- 禁止缺图透明/棋盘格/placeholder、Spine 首动画/setup pose/模糊大小写 fallback。
- 禁止宽泛 glob 引入 manifest 外资源。
- 禁止 node collision 自动加数字。
- 禁止 preview zoom 写入 manifest。
- 禁止把 spin timing/server scene/symbol/业务组件写入 layout manifest。
- 禁止 y gap 只改 guide 不改 runtime。
- 禁止 editor 建第二个 Spine runtime/renderer/隐藏 canvas。
- 禁止覆盖或删除未提交 game003 美术。

## 18. 完成定义

- gamelayouteditor 是 `base:./` 纯静态 app，运行无 API/WS。
- 单/双背景可新建、编辑、预览、导出和重新导入。
- guides 与 rendercore snapshot 一致，无 canvas 图层拖动写配置。
- x/y gap 在 editor、manifest、geometry、普通/grid-cell reel 一致。
- image/Spine layer 的 visibility/order/x/y/scale 生效。
- Spine official 4.3 loop，resize 不重播，destroy 不泄漏。
- filenames/paths ASCII 且导出小写，collision/zip-slip/extra/missing 显式失败。
- `getNode("minibk")` 和 child/before/after 有测试及示例。
- game002/game003 等价 fixture 通过且未改生产业务语义。
- 共享包/editor 门禁通过，游戏回归执行并记录。
- 文档和必要 agents.md 已更新。
- 中文 UTC 报告生成，真实记录自动/人工/CDN 结果。

## 19. 报告内容

报告至少包含：

1. branch/HEAD、执行前后 status、用户输入保护。
2. app/package/dependencies/CDN 发布方式。
3. manifest v1 和 zip 目录。
4. lowercase/ASCII、zip 安全、资源上限。
5. rendercore APIs、node attachment 和 lifecycle。
6. reel rowGap/columnGap 修改与兼容。
7. UI/preview/import/export 实现。
8. game002/game003 fixture 最终数值及美术尺寸漂移。
9. 自动测试 command/result/coverage/根级阻塞。
10. 浏览器/CDN 验收，未执行项标未验证。
11. 新增/修改/删除文件。
12. agents.md/docs 更新。
13. 已知限制和 production game 迁移建议。
