# Scene Layout Manifest v1

Editor-owned image/Spine/MP4 payload 导出为完整 SHA-256 hash-flat path；Spine atlas page key
保留导入时的原始可读文件名，texture mapping 的 value 指向 hash path，atlas text 与 key
必须精确同步。exact path 可由多个 resource/node/page 复用而不合并
playback/placement；case/NFC alias、媒体冲突和真实尺寸不一致仍失败。所有 nested
dependency 保持自包含根，Layout Editor 不重新 hash 其 bytes。

## 游戏模式与 Symbols / Popup dependencies

新建和经 Game Layout Editor 导出的 v1 package 显式声明 `gameModes`。模式 id
匹配 `^[A-Za-z][A-Za-z0-9_-]*$`、大小写敏感，shared runtime 不硬编码
BaseGame、FreeGame、BG 或 FG。每个模式为每个 active variant 显式绑定一个独立稳定背景；
Game Layout Editor 导出的 `nodeStates` 固定为 `{}`。即使多个模式选择同一 Spine logical resource，
它们也只共享 resource bytes，不共享 node、player、placement 或 playback。

`gameModes.transitions` 保存显式有向 overlay edge。`overlay.resource.kind` 是严格 discriminator：Spine 分支拥有 official Spine 4.3 resource、
一个 once animation、该 animation 时间轴中恰好出现一次的大小写精确 switch event，以及恰好覆盖
active variants 的 art-space placement；video 分支只拥有 hash-flat owned MP4、`mimeType: "video/mp4"`、`fit: "contain"` 和正数 `fadeOutSeconds`。两分支字段不得混用。没有直接边时 `requestGameMode()` 在任何可见 mutation 前失败；
不自动寻路、反向复用、瞬切或以 once completion 代替 event。

```json
{
  "symbolPackages": {
    "base-symbols": {
      "manifest": "dependencies/symbols/base-symbols/symbols.package.json",
      "reel": "main",
      "reelSet": "bg-reel01",
      "renderMode": "grid-cell"
    }
  },
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
        "backgroundNodes": {
          "landscape": "bg-base-l",
          "portrait": "bg-base-p"
        },
        "nodeStates": {},
        "symbolPackage": "base-symbols",
        "awardCelebrationPopup": "base-celebration"
      },
      {
        "id": "FreeGame",
        "backgroundNodes": {
          "landscape": "bg-free-l",
          "portrait": "bg-free-p"
        },
        "nodeStates": {}
      }
    ],
    "transitions": [
      {
        "from": "BaseGame",
        "to": "FreeGame",
        "overlay": {
          "resource": {
            "kind": "spine",
            "skeleton": "assets/<sha256>.json",
            "atlas": "assets/<sha256>.atlas",
            "textures": { "transition.png": "assets/<sha256>.png" }
          },
          "animation": "BG_FG",
          "switchEvent": "SwitchScene",
          "placements": {
            "landscape": { "x": 1000, "y": 1000, "scale": 1 },
            "portrait": { "x": 1000, "y": 1000, "scale": 1 }
          }
        }
      },
      {
        "from": "FreeGame",
        "to": "BaseGame",
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
    ]
  }
}
```

video path 必须精确匹配 `assets/<64 lowercase hex>.mp4` 并进入 package 的传递精确闭包。prepare 通过浏览器 metadata 进一步要求 finite positive duration、正整数尺寸、MP4 可播放，且 `fadeOutSeconds < actualDuration`。实际 duration 不写入 manifest。

`symbolPackage` / `awardCelebrationPopup` 省略分别表示“空主转轮”/“无庆祝效果”，不会
回退到其它模式或 dependency 第一项。binding id、dependency 目录和 nested package id
必须相等；一个或多个模式可复用同一 binding。未被任何模式引用的 production symbols
或 popup binding 是 orphan，strict parser 拒绝。popup placements 必须与 active variants
完全匹配，坐标相对最终 Pixi viewport center。nested bytes 只增加各自 dependency 前缀，
内部路径和 bytes 不重写。

没有 `gameModes` 的既有合法 v1 仍可 parse，并可使用 node/reel/popup 低层 API；调用任何
game-mode API 会明确失败。production loader 不猜业务模式。Game Layout Editor 导入含非空
mode `nodeStates` 或依赖背景 state-machine 完成 mode 切换的旧 ZIP 时明确拒绝：旧数据没有可确定的
switch event，必须拆分稳定背景并在“转场”Tab 重新配置。legacy singular symbols binding 的低层
parser 兼容性不构成 mode transition fallback。

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

Spine node 必须为官方 4.3.x、atlas page 精确闭合。`textures` 的 key 是 atlas 中的逻辑 page name，value 是显式 owned payload path；两者不要求同 basename。多个逻辑 page 在原始 texture bytes 完全相同时允许显式复用同一个完整 SHA-256 hash-flat payload，atlas page key 仍必须唯一且与 atlas 精确闭合。Spine skeleton header 的 `x/y/width/height` 是 export content bounds，不是 scene art canvas；`adaptation.artSize` 及 node placement 必须由 layout 明确声明，禁止从 skeleton bounds 反推。旧单 loop 形式继续合法：

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

低层 `SceneLayoutRuntime` 仍为独立 consumer 保留通用 node state-machine；它不属于 Game Layout
Editor 产品能力，也不得参与 `SceneLayoutPackageRuntime.requestGameMode()`：

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

`defaultAnimation/loop` 与 `stateMachine` 严格互斥。低层 node API 的未知状态、自循环、重复边、
animation 复用、缺少直接 transition 和并发请求都会显式失败；`getNodeStateSnapshot()` 与
`requestNodeState(nodeId, state)` 只服务明确选择该低层能力的 consumer。Game Layout Editor 的稳定
Spine node 只导出 `defaultAnimation + loop: true`。

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

canonical symbols library 只绑定 `reels.main`。每个 binding 明确选择 package、公开 reel
set 和 renderer；mode 用 `symbolPackage` id 选择，或省略以表示空主转轮：

```json
{
  "symbolPackages": {
    "game002-s3": {
      "manifest": "dependencies/symbols/game002-s3/symbols.package.json",
      "reel": "main",
      "reelSet": "bg-reel01",
      "renderMode": "grid-cell"
    }
  }
}
```

binding 存在时 `reels.main.order` 必填，symbols `cellSize` 必须逐项等于 reel cell，所选 reel
set 数量必须等于 columns，公开轮带只能包含 display symbols。被 mode 引用的 package 会精确
vendor 一次；orphan binding 失败。旧 singular `symbolPackage` 仍可读，但不能与 plural 同写。
没有 binding 的旧 manifest 保持 layout-only 行为。manifest 和 ZIP 永不保存 sampled/server
scene、服务器真实轮带、preview value mapping 或随机数。

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
  videoModules,
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

production 的推荐入口直接组合稳定 layout node、nested image-string、顶层 Spine event 转场、
symbols catalog 与真实 reel presentation：

```ts
const resource = await loadSceneLayoutPackageFromUrl({ manifestUrl });
const runtime = createSceneLayoutPackageRuntime({ resource });
await runtime.init({
  reels: { main: { scene: initialScene, localPhaseYs } },
});
app.stage.addChild(runtime.container);
runtime.applyViewport(frameDesignSize);

app.ticker.add((ticker) => runtime.update(ticker.deltaMS / 1000));

runtime.setImageStringText("total-win", "$123.45");
runtime.resetReelScene("main", {
  scene: nextScene,
  localPhaseYs: nextLocalPhaseYs,
});

const targetOptions = {
  reels: { main: { scene: freeGameScene, localPhaseYs: freeGameLocalPhaseYs } },
};
await runtime.prepareGameModeTransition("FreeGame", targetOptions);
confirmButton.addEventListener("click", () => {
  // 必须直接位于真实 listener 内；调用本身会在任何 await 前同步 video.play()。
  void runtime.requestGameMode("FreeGame", targetOptions).catch(showError);
});
runtime.startAwardCelebrationForCurrentMode({
  betAmountRaw: 100,
  winAmountRaw: 6000,
});
runtime.requestAdvanceAwardCelebration();
```

`prepareGameModeTransition()` 在任何可见 mutation 前准备并严格验证目标 symbols scene 与 directed overlay resource；可在开始前用 `cancelPreparedGameModeTransition()` 释放。Spine edge 仍允许直接 request；video edge 必须先有匹配 prepared state，且 `requestGameMode()` 在同步 trusted-gesture 调用栈内先调用带声音、inline 的 `video.play()`，不能经过 await、modal 或 timer。play 拒绝保持来源 stable scene，不静音重试或瞬切。

Spine overlay 挂入固定
`scene-transition-overlay` 顶层后，event 前来源背景、reel 与 displayed mode 保持不变；event 的同一
update 边界同步切背景显隐、替换或移除 reel，并更新 displayed mode。overlay 继续覆盖目标场景，
到 once completion 才移除、提交 stable mode 并 resolve Promise。相同 symbols binding 禁止重复 target input且保留现有 reel；
binding 改变且目标有 symbols 时必须提交目标 `reels.main`；目标无 symbols 时禁止提交。
默认会复用相同 binding 的现有 reel、scene 与 player；诊断或明确重建需求可传
`recreateReel: true` 和新的 `reels.main`，此时也只在 event 提交边界替换并随后销毁旧 reel。
video 使用永远最高的 viewport-space `scene-transition-video-blackout`：完整 viewport 黑层在下、Pixi video texture 在上，视频固定 contain + center。`fadeStart = duration - fadeOutSeconds`；media `currentTime` 首次达到该点时同一 update 原子提交 target，video 与黑层按 `1 - clamp((currentTime - fadeStart) / fadeOutSeconds)` 同步淡出，`ended` 后才稳定完成。resize/orientation 只重排同一个 video element/texture，不 seek、pause 或重播；stalled/waiting 等待真实 media 恢复，不以 ticker/wall-clock 越过时间线。

缺少 direct edge、transition 中、popup active 时或并发请求都会失败。`getGameModeSnapshot()` 返回
`stableMode/displayedMode/targetMode/phase/transitionPhase/transition`、stable/displayed/target
symbol package、active background nodes，以及 `preparedTargetMode/transitionKind/mediaTimeSeconds/mediaDurationSeconds/fadeProgress`；`transitionPhase` 精确区分 `before-switch` 和
`after-switch`。
每个 runtime 同时最多一个 active 庆祝；游戏不需要 popup id 或 nested path。ticker 的同一次
`update()` 继续推进 layout、reel 和 popup。

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
