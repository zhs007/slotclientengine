# Scene Layout Manifest v1

根 sentinel 为 `layout.manifest.json`。schema version 仍为 `1`，支持 `maximized-focus` / `orientation-focus`、image/image-string/official Spine 4.3/runtime VNI node、reels、plural `symbolPackages`、award-celebration/普通 Spine `popups`、game modes 与显式有向 transitions。

## 坐标原点

根级可选 `coordinateOrigin` 为 `"top-left"` 或 `"center"`；旧包缺失时严格按 `"top-left"` 读取。Game Layout Editor 的新导出会显式保存该值。

- `top-left`：art 左上角是 `(0, 0)`；image/VNI placement 表示资源左上角，Spine/image-string placement 表示各自 authored origin。
- `center`：art 中心是 `(0, 0)`；image/VNI placement 表示缩放后资源中心，Spine/image-string placement 表示 authored origin 相对 art center 的偏移。
- focus、frame focus、min margin 仍是以 art 左上角描述的矩形，不随坐标类型转换。
- Spine transition overlay 使用与 node 相同的 art-space origin；popup 仍是 viewport center offset，video blackout 仍是 viewport-space。

`reels.main.placements.<variant>` 只包含 `x/y`。placement 在 `top-left` 模式表示转轮矩形左上角，在 `center` 模式表示转轮矩形中心相对 art center 的偏移。scene-layout 不提供主转轮整体缩放；横竖屏适配应调整背景素材、art size 和 reel placement。

## Node transform

`nodes[*].placements.<variant>` 的 canonical 结构包含 `x/y/scale/rotation/center`：

```json
{
  "x": 120,
  "y": -30,
  "scale": 0.8,
  "rotation": -90,
  "center": { "x": 0.5, "y": 0.5 }
}
```

`rotation` 使用顺时针角度，接受任意有限数，包括负数和大于 `360` 的值，保存时不做取模。
`center.x/y` 是 `[0,1]` 内的 node-local 归一化旋转中心；`0.5/0.5` 是默认中心。Spine
节点的 authored 原点就是默认中心，因此 `0.5/0.5` 精确映射到 local `(0,0)`，不从
skeleton bounds 或 atlas texture 推导另一套中心。image、VNI、image-string 使用各自显式
size/stage/authored layout 映射 node-local pivot。

旧 v1 node placement 缺少 `rotation` 或 `center` 时，parser 分别规范化为 `0` 和
`{x:0.5,y:0.5}`，画面不变；新导出写出 canonical 字段。rotation/center 只属于 scene node
（包括 background node），Popup 与 Spine transition placement 仍只接受 `x/y/scale`，main reel
仍只接受 `x/y`。transform 由 rendercore node container 统一应用，geometry-only 更新不重建
texture、Spine/VNI player、reel 或当前 mode。

```json
{
  "coordinateOrigin": "center",
  "reels": {
    "main": {
      "columns": 5,
      "rows": 3,
      "cellSize": { "width": 160, "height": 160 },
      "gap": { "x": 0, "y": 0 },
      "placements": {
        "landscape": { "x": 0, "y": 20 },
        "portrait": { "x": 0, "y": -40 }
      }
    }
  }
}
```

## Filename-key package

Game Layout Editor 新导出的所有资源引用是扁平 filename keys：

```json
{
  "resource": {
    "kind": "image",
    "path": "BG.jpg",
    "size": { "width": 2000, "height": 2000 }
  },
  "symbolPackages": {
    "base-symbols": {
      "manifest": "symbols.package.json",
      "reel": "main",
      "reelSet": "main",
      "renderMode": "grid-cell"
    }
  },
  "popups": {
    "base-celebration": {
      "type": "award-celebration",
      "manifest": "popup.manifest.json",
      "order": 2000,
      "placements": { "default": { "x": 0, "y": 0, "scale": 1 } }
    },
    "free-game": {
      "type": "spine",
      "manifest": "free-game-popup.manifest.json",
      "order": 2001,
      "placements": { "default": { "x": 0, "y": 0, "scale": 1 } }
    }
  }
}
```

binding `type` 必须与 nested popup manifest 精确一致。`order` 是 Popup root 的安全整数显示顺序，必须与全部 node、main reel 和其它 Popup order 唯一，并高于全部 node/main reel；旧单 Popup v1 缺省时规范化为 `2000`，多个缺省值造成重复时显式失败。game mode 的 `awardCelebrationPopup` 只能引用 `award-celebration`；普通 Spine popup 可作为独立 programmatic binding，也可由任意效果 transition 的可选 `preludePopup` 引用。package runtime 先保持 source mode 播放 popup；宿主通过 `bindPopupInput()` 绑定完整 canvas 与 keyboard target，runtime 的统一主操作锁存结束请求，popup 完整到达 complete 后才继续当前转场效果。idle 输入透传，未迁移 consumer 可继续使用 Pixi pointer fallback。

production consumer 可在 `requestGameMode()` 的 `preludePopupStrings` 中为本次 edge-bound Spine Popup 提交 `text | image-string` 的 exact name 和最终 string。该 scope 在 Popup start 前应用，并在 complete、失败、取消或 runtime destroy 后恢复调用前 handle 状态；它不修改 manifest，也不参与 transition prepare/cache identity。需要 persistent 或 active-playback 更新时继续使用 player exact handle。

根 `assets.map.json` 将 layout、VNI、image-string、Symbols、Popup 的全部 root/leaf keys 统一映射到 `assets/<完整 SHA-256>.<ext>`。ZIP 只有两个 root control files 和 hash payload 区；禁止 `dependencies/image-strings/**`、`dependencies/symbols/**`、`dependencies/popups/**`。

普通 Spine Popup 内的 prompt 字体与 image/Spine/VNI overlay 仍属于 nested Popup owner。Game Layout Editor 只读预览 prompt 文案（可临时覆盖，留空使用 Popup 默认值），不改字体、区域、内部位置或 overlay。字体与其它 payload 一样按完整 SHA-256 物理去重：不同 Popup 引用相同 font bytes 时，production ZIP 只保存一个 payload，logical filename key 和各自 manifest 引用仍独立。

Game Layout Editor 导入旧 mapped ZIP 时，在验证 map/hash/size/orphan 后将不符合当前 filename-key 合同的 logical key 做确定性迁移，并同步改写 layout 与已知 nested manifest 的 path 字段；业务 id、animation、symbol state 和 atlas page logical name 不参与文件名迁移。迁移后的再次导出只包含规范化 key。

同一个 filename key 全局只有一份 bytes。多个 Symbols/Popup package 导入时使用包含 manifest id 的稳定扁平 key 前缀并由 owner API 结构化改写 nested reference，不创建 dependency 目录；同 id 再上传替换该 owner，不同 id 不得覆盖彼此 bytes。package/mode/node id 仍保留业务语义，不能作为运行时第二套资源查找表。相同 bytes 的 logical owners 在 `assets.map.json` 中共享一个 physical SHA-256 payload。导出与重新导入不得用 physical hash payload path 重建 node id 或资源列表标签。

## 程序资源

根级可选 `runtimeResources` 是程序按稳定业务键读取、但不一定被 node 或 transition 引用的 typed root：

```json
{
  "runtimeResources": {
    "nearwin.spine": {
      "kind": "spine",
      "skeleton": "nearwin.json",
      "atlas": "symbols.atlas",
      "textures": { "symbols.png": "symbols.png" }
    },
    "help.image": {
      "kind": "image",
      "path": "help.png",
      "size": { "width": 512, "height": 256 }
    }
  }
}
```

键必须以小写字母或数字开头，且只包含小写字母、数字、点、下划线和连字符。value 只接受现有 image、Spine、VNI、image-string、video 五类严格 spec；程序 Spine 不要求默认 animation，consumer 在实际使用时选择动画。

`SceneLayoutResource.runtimeResources` 和 `SceneLayoutPackageResource.runtimeResources` 保存已准备的 readonly typed 资源。consumer 应调用 `requireSceneLayoutRuntimeResource(resource, key, kind)` 做精确 key/kind 检查，不得猜 filename、basename 或 physical hash path。资源中的 URL、image-string/VNI 对象由父 resource 拥有，父 resource `destroy()` 后不得继续使用。

## 精确闭包与 loader

`collectSceneLayoutPackagePaths()` 验证 layout、程序资源与全部 nested package 的传递 exact closure，包括 VNI project 声明的每个 asset。map 声明的 hash、size、media、payload 和 orphan 均严格验证；map/direct 不得混用。ZIP resource creator、Blob preview 与 `loadSceneLayoutPackageFromUrl()` 使用同一 resolver。父 package 已解析 map 后，VNI/image-string/Symbols/Popup 使用 resolved-files bridge，不要求嵌套 map。

无 map 的合法 legacy direct-path/nested dependency package继续加载。Editor import 会在内存中迁移为 flat keys，再导出新格式；不做 basename runtime fallback、404 探测或宽泛 glob。

Spine atlas page 是 atlas 内部的逻辑标识，`textures` map 的 value 才是 filename key。legacy 输入允许 page 名后缀与真实图片编码不一致：导入边界按 bytes 规范化物理 key（例如 atlas page `BG.png` 映射到 WebP key `BG.webp`），同时保持 atlas page 文本不变。这样 runtime 仍按 page 精确查 map，`assets.map.json` 的扩展名、media type 与 payload 内容保持一致。

## Node、模式与转场

多个 mode/variant 可以引用同一资源 key，但稳定 background node 与 placement 必须独立；新增 mode 背景未绑定，node id 按 mode/variant 稳定生成。稳定 Spine node 只使用显式 single loop，mode 切换时保留 player 与 exact bytes。

普通 node 可声明 optional、大小写精确的单一状态作用域：

```json
{
  "id": "free-only-fx",
  "order": 1200,
  "gameMode": "FreeGame",
  "resource": {
    "kind": "image",
    "path": "free-only-fx.png",
    "size": { "width": 512, "height": 512 }
  },
  "placements": {
    "landscape": { "x": 100, "y": 80, "scale": 1 }
  }
}
```

`gameMode` 缺失表示所有状态有效，并保持旧 v1 manifest/ZIP 的画面和资源归属；不接受空值、未知 mode、大小写 alias 或多个 mode。background node 继续由 `gameModes.modes[*].backgroundNodes` 绑定，禁止同时声明 `gameMode`。普通 node 最终可见性是“当前 stable/displayed mode 匹配（或全局）且当前 variant 有 placement”；隐藏不删除节点、不改变其跨状态、跨方向的全局 `order`。全局/legacy 普通节点归 shared 资源闭包，scoped 普通节点只归 exact mode。

普通 Spine node 声明 exact `defaultAnimation` 和 boolean `loop`。普通 VNI node 声明 runtime project filename key 和 boolean `loop`，播放完整 timeline；同一 project 被多个 node 引用时仍创建独立 player/playhead。VNI node 可使用普通 placement/order/variant visibility，但不得作为 background 或 transition。

transition 是独立有向边：

- 无效果分支显式写为 `"overlay": { "kind": "none" }`，不得携带 resource、animation、placement、fit 或 fade 字段；目标 scene prepare 成功后直接原子提交状态；
- Spine overlay 声明 skeleton/atlas/page filename keys、exact animation、exact single event occurrence 与 per-variant placement；边可额外声明引用普通 Spine Popup binding 的 `preludePopup`，popup complete 前不得启动 overlay 或切换 source mode；
- video blackout 声明 MP4 filename key、`mimeType: "video/mp4"`、`fit: "contain"` 与小于真实 duration 的 positive `fadeOutSeconds`。

`preludePopup` 不能引用 award-celebration，但可用于无效果、Spine 或 video；缺省时不弹 Popup。每条 `from → to` 边独立保存该引用，因此多个转场可分别不配置、选择同一个或选择不同的普通 Spine Popup。snapshot 的 `transitionKind` 为 `none | spine | video`，`transitionPhase` 为 `popup | awaiting-video-start | before-switch | after-switch`，并用 `activePreludePopup` 报告当前前置弹窗。

三分支字段严格互斥。runtime 只准备当前 stable source 到所选 target 的直接边；缺边不瞬切、不反向复用、不寻路。Spine event、video media-time fadeStart 或 none direct commit 边界原子切换 background/reel/displayed mode；prepare/once/ended/play rejection 均可 rollback。audible `play()` 必须在 trusted pointer/key 调用栈内同步触发，不自动静音或 wall-clock fallback。带 Popup 的 video 在 Popup complete 后进入 `awaiting-video-start`，下一次 host-bound 真实用户手势由统一主操作同步启动视频；一次输入不得同时进入 DOM binding 与 Pixi fallback。

编辑器可以调用独立的 authoring stable-mode selection 来直接查看目标稳定画面；该入口不要求 transition edge，也不播放 overlay，并与 production `requestGameMode()` 分离。它仍使用同一 mode visibility commit；相同 Symbols binding 保留当前 reel/player/sample，不同 binding 必须先提供并成功准备目标公开 scene。

## 安全与确定性

Parser 拒绝 unknown key、非法尺寸/placement/order、path alias、缺资源与 schema/version 错配。导出 JSON/ZIP 固定排序、换行、mtime 和压缩参数；相同 project/bytes 重复导出逐 byte 一致。unused workspace key 不进入 production closure，Object URL、Texture、player 与 cache 不进入 manifest/map。
