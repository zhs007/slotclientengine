# Scene Layout Manifest v1

Scene layout 是 rendercore 的通用场景布局合同，入口为：

```ts
import {
  collectSceneLayoutAssetPaths,
  createSceneLayoutFramePolicy,
  createSceneLayoutResource,
  createSceneLayoutRuntime,
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

Spine node 必须为官方 4.3.x、atlas page 精确闭合，并显式选择真实 loop animation：

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

Main reel grid 示例：

```json
{
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
const resource = await loadSceneLayoutResourceFromUrl({
  manifestUrl:
    "https://cdn.example.com/games/game002/layout/layout.manifest.json",
});
```

loader 只用 manifest URL 为根解析精确闭包，拒绝非 2xx、origin/path 逃逸、JSON/图片/Spine 失败和尺寸漂移。production game 不运行 editor zip adapter，也不在每次 spin 解压 zip。
