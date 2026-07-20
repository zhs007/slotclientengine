# Scene Layout Manifest v1

Editor-owned image/Spine 导出为完整 SHA-256 hash-flat path；atlas page key、texture
mapping 与 atlas text 必须同步。exact path 可由多个 resource/node 复用而不合并
playback/placement；case/NFC alias、媒体冲突和真实尺寸不一致仍失败。所有 nested
dependency 保持自包含根，Layout Editor 不重新 hash 其 bytes。

## 游戏模式与 Popup dependencies

新建和经 Game Layout Editor 导出的 v1 package 显式声明 `gameModes`。模式 id
匹配 `^[A-Za-z][A-Za-z0-9_-]*$`、大小写敏感，shared runtime 不硬编码
BaseGame、FreeGame、BG 或 FG。每个模式必须完整覆盖全部 stateful Spine node；
initial mode 的状态必须逐项等于 node `initialState`。

```json
{
  "popups": {
    "base-celebration": {
      "type": "award-celebration",
      "manifest": "dependencies/popups/base-celebration/popup.manifest.json",
      "placements": {
        "landscape": { "x": 0, "y": 0, "scale": 1 },
        "portrait": { "x": 0, "y": 20, "scale": 0.9 }
      }
    }
  },
  "gameModes": {
    "initialMode": "BaseGame",
    "modes": [
      {
        "id": "BaseGame",
        "nodeStates": { "bg": "BG" },
        "awardCelebrationPopup": "base-celebration"
      },
      {
        "id": "FreeGame",
        "nodeStates": { "bg": "FG" }
      }
    ]
  }
}
```

`awardCelebrationPopup` 省略明确表示“无庆祝效果”，不会回退到第一项或 BaseGame。
binding id、dependency 目录和 nested popup id 必须相等；一个或多个模式可复用同一
binding。未被任何模式引用的 popup 是 orphan，strict parser 拒绝。placements 必须与
active variants 完全匹配，坐标相对最终 Pixi viewport center。nested popup bytes 只增加
`dependencies/popups/<id>/` 前缀，内部路径和 bytes 不重写。

没有 `gameModes` 的既有合法 v1 仍可 parse，并可使用 node/reel/popup 低层 API；调用任何
新 game-mode API 会明确失败。production loader 不猜业务模式。只有 Game Layout Editor
导入旧 ZIP 时迁移为显式 `BaseGame`，stateful node 值逐项复制 manifest `initialState`。

Scene layout 是 rendercore 的通用场景布局合同，入口为：

```ts
import {
  collectSceneLayoutAssetPaths,
  createSceneLayoutFramePolicy,
  createSceneLayoutPackageResource,
  createSceneLayoutPackageRuntime,
  createSceneLayoutResource,
  createSceneLayoutRuntime,
  loadSceneLayoutPackageFromUrl,
  loadSceneLayoutResourceFromUrl,
  parseSceneLayoutManifest,
  resolveSceneLayoutReelGrid,
} from "@slotclientengine/rendercore/scene-layout";
```

## 包结构与 schema

```text
<project-id>-layout.zip
  layout.manifest.json
  assets/**
  dependencies/image-strings/<image-string-id>/image-string.manifest.json
  dependencies/image-strings/<image-string-id>/assets/**
  dependencies/symbols/<symbol-package-id>/symbols.package.json
  dependencies/symbols/<symbol-package-id>/**
  dependencies/popups/<popup-id>/popup.manifest.json
  dependencies/popups/<popup-id>/**
```

顶层固定为 `version: 1`、`kind: "scene-layout"`、小写 ASCII `id`、`adaptation`、`nodes` 和命名 `reels`。parser 对所有层级拒绝 unknown key，校验引用、variant、order、path、focus/reel 边界，强制每个 variant 的 focusRect 包含完整 reel，并返回 deep-frozen 数据。

单背景：

```json
{
  "version": 1,
  "kind": "scene-layout",
  "id": "game002",
  "adaptation": {
    "mode": "maximized-focus",
    "artSize": { "width": 2000, "height": 2000 },
    "focusRect": { "x": 580, "y": 277, "width": 840, "height": 1200 },
    "backgroundNode": "bg"
  },
  "nodes": [],
  "reels": {}
}
```

横竖双背景的 `adaptation.mode` 为 `orientation-focus`，必须同时提供 `landscape` 和 `portrait`。每套 variant 独立声明 `artSize/focusRect/frameFocusRect/backgroundNode` 及可选 `minFocusMargin`，不互相 fallback；方屏选择 landscape。

Image node 显式声明真实尺寸：

```json
{
  "id": "minibk",
  "order": 4,
  "resource": {
    "kind": "image",
    "path": "assets/minibk.png",
    "size": { "width": 218, "height": 66 }
  },
  "placements": {
    "landscape": { "x": 100, "y": 80, "scale": 1 },
    "portrait": { "x": 40, "y": 180, "scale": 1 }
  }
}
```

Image-string node 引用 vendored standalone manifest，text 保持原始 JavaScript string，anchor 与 placement 独立：

```json
{
  "id": "total-win",
  "order": 20,
  "resource": {
    "kind": "image-string",
    "manifest": "dependencies/image-strings/usd-amount/image-string.manifest.json",
    "text": "$001.25",
    "anchor": { "x": 0.5, "y": 0.5 }
  },
  "placements": {
    "default": { "x": 1000, "y": 1500, "scale": 1 }
  }
}
```

nested manifest id 必须等于 dependency 目录 id。prepare 与 `setImageStringText()` 都复用 image-string 的 Unicode、控制字符、缺 glyph 与布局校验；setter 原子提交，失败时旧 text 和显示不变。

Spine node 必须为官方 4.3.x、atlas page 精确闭合。旧单 loop 形式继续合法：

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

也可使用通用稳定状态机；状态只播放真实 loop，直接有向 transition 只播放真实 once：

```json
{
  "kind": "spine",
  "skeleton": "assets/bg/bg.json",
  "atlas": "assets/bg/bg.atlas",
  "textures": { "bg.png": "assets/bg/bg.png" },
  "stateMachine": {
    "initialState": "BG",
    "states": {
      "BG": { "animation": "BG" },
      "FG": { "animation": "FG" }
    },
    "transitions": [
      { "from": "BG", "to": "FG", "animation": "BG_FG" },
      { "from": "FG", "to": "BG", "animation": "FG_BG" }
    ]
  }
}
```

`defaultAnimation/loop` 与 `stateMachine` 严格互斥。未知状态、自循环、重复边、animation 复用、缺少直接 transition 和 transition 期间并发请求都会显式失败；请求当前状态立即完成且不 replay。Promise 只在 once 完成并已进入目标 loop 的边界 resolve。`getNodeStateSnapshot()` 提供 `stableState/targetState/phase`，业务只调用 `requestNodeState(nodeId, state)`，runtime 不猜服务器字段。

Main reel grid 示例：

```json
{
  "order": 10,
  "columns": 5,
  "rows": 5,
  "cellSize": { "width": 165, "height": 130 },
  "gap": { "x": 15, "y": 0 },
  "placements": {
    "landscape": { "x": 400, "y": 250 },
    "portrait": { "x": 140, "y": 600 }
  }
}
```

可选 symbols binding 只绑定 `reels.main`，并明确选择 package、公开 reel set 和 renderer：

```json
{
  "symbolPackage": {
    "manifest": "dependencies/symbols/game002-s3/symbols.package.json",
    "reel": "main",
    "reelSet": "bg-reel01",
    "renderMode": "grid-cell"
  }
}
```

binding 存在时 `reels.main.order` 必填，symbols `cellSize` 必须逐项等于 reel cell，所选 reel set 数量必须等于 columns。第一版最多一个 package；没有 binding 的旧 manifest 保持 layout-only 行为，组合 reel API 不可用。manifest 和 ZIP 永不保存服务器 scene、真实轮带或随机数。

宽高只派生、不存储：

```text
width  = columns * cellWidth  + (columns - 1) * gap.x
height = rows    * cellHeight + (rows - 1) * gap.y
```

`columnGap/rowGap` 是普通 reel、grid-cell reel、mask、effect、cascade 与 geometry snapshot 的真实 runtime geometry，不是 editor-only guide。

## 构建期接入

```ts
const manifest = parseSceneLayoutManifest(rawManifest);
const loadingClosure = collectSceneLayoutAssetPaths(manifest);
const resource = createSceneLayoutResource({
  manifest,
  imageModules,
  skeletonModules,
  atlasModules,
  textureModules,
});
const runtime = createSceneLayoutRuntime({ resource });
await runtime.init();
app.stage.addChild(runtime.container);

const framePolicy = createSceneLayoutFramePolicy(manifest);
const frame = calculateSlotUiFrameViewport({
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  designSize,
  policy: framePolicy,
});
app.renderer.resize(frame.frameDesignSize.width, frame.frameDesignSize.height);
runtime.applyViewport(frame.frameDesignSize);

app.ticker.add((ticker) => runtime.update(ticker.deltaMS / 1000));
```

## 自包含 package runtime

production 的推荐入口直接组合 layout node、nested image-string、Spine 状态机、symbols catalog 与真实 reel presentation：

```ts
const resource = await loadSceneLayoutPackageFromUrl({ manifestUrl });
const runtime = createSceneLayoutPackageRuntime({ resource });
await runtime.init({
  reels: { main: { scene: initialScene, localPhaseYs } },
});
app.stage.addChild(runtime.container);
runtime.applyViewport(frameDesignSize);

app.ticker.add((ticker) => runtime.update(ticker.deltaMS / 1000));

await runtime.requestNodeState("bg", "FG");
runtime.setImageStringText("total-win", "$123.45");
runtime.resetReelScene("main", {
  scene: nextScene,
  localPhaseYs: nextLocalPhaseYs,
});

await runtime.requestGameMode("FreeGame");
runtime.startAwardCelebrationForCurrentMode({
  betAmountRaw: 100,
  winAmountRaw: 6000,
});
runtime.requestAdvanceAwardCelebration();
```

`requestGameMode()` 在启动前原子 preflight 全部 node direct transition，并行启动后等全部
目标 stable loop 才提交 mode snapshot。transition 中、popup active 时或并发请求都会失败。
`getGameModeSnapshot()` 返回 `stableMode/targetMode/phase`。每个 runtime 同时最多一个 active
庆祝；游戏不需要 popup id 或 nested path。ticker 的同一次 `update()` 继续推进 layout、reel
和 popup。

app 只提交本轮或初始可见 `scene` 与本地公开轮带视觉 phase/stop y。runtime 不随机、不从 paytable 猜 scene，也不要求服务器窗口能在公开轮带中反查；frame、art、reel geometry/placement/order 和 renderer 全由 manifest 派生。

不使用 uiframeworks 的工具（例如 `gamelayouteditor`）必须调用 scene-layout 的纯几何入口，不能把物理页面尺寸直接传给 Pixi：

```ts
const frame = resolveSceneLayoutFrameViewport({
  manifest,
  pageSize: { width: previewWidth, height: previewHeight },
});
app.renderer.resize(frame.frameDesignSize.width, frame.frameDesignSize.height);
runtime.applyViewport(frame.frameDesignSize);
canvas.style.width = `${frame.cssSize.width}px`;
canvas.style.height = `${frame.cssSize.height}px`;
canvas.style.marginLeft = `${frame.offsetX}px`;
canvas.style.marginTop = `${frame.offsetY}px`;
```

业务对象只通过 public named-node API 挂接：

```ts
const minibk = runtime.getNode("minibk");
const disposeAmount = runtime.attachRelative({
  nodeId: "minibk",
  placement: "after",
  object: amountContainer,
});

const reel = runtime.getReelGrid("main");
const normalLayout = createReelLayout({
  reelCount: reel.columns,
  visibleRows: reel.rows,
  cellWidth: reel.cellSize.width,
  cellHeight: reel.cellSize.height,
  columnGap: reel.gap.x,
  rowGap: reel.gap.y,
});

const grid = new RenderGridCellReelSet({
  columns: reel.columns,
  rows: reel.rows,
  cellWidth: reel.cellSize.width,
  cellHeight: reel.cellSize.height,
  columnGap: reel.gap.x,
  rowGap: reel.gap.y,
  // reels, registry, order...
});

disposeAmount();
runtime.destroy();
```

`attachChild()` 挂在 named node 内；`attachRelative(before|after)` 挂在同一 transform slot 的前景或后景。方向切换复用同一 named Container 和 Spine 时间轴，不重新初始化。

## CDN 接入

```ts
const resource = await loadSceneLayoutPackageFromUrl({
  manifestUrl:
    "https://cdn.example.com/games/game002/layout/layout.manifest.json",
});
```

loader 只用 manifest URL 为根解析 layout 及 nested image-string/symbol package 的传递精确闭包，支持部署为 CDN 上已解压的目录；拒绝非 2xx、origin/path 逃逸、缺失/orphan、JSON/图片/Spine 失败、glyph 失败和尺寸漂移。production game 不运行 editor zip adapter，也不在每次 spin 解压 zip。
