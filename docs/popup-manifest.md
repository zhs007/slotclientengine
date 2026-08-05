# Popup package v1

`popup.manifest.json` 是获奖庆祝与普通 Spine 弹窗的唯一 production 合同。独立 `<id>-popup.zip` 最终由 Game Layout Editor 原样 vendor 到 Scene Layout package。

## 坐标、档位与输入

- popup 中心为 `(0, 0)`，向右/向下为正；`designViewport` 只恢复编辑边框，不触发 fit/contain/cover。
- layout 为每个 active variant 保存相对 viewport center 的 `x/y/scale`。
- 游戏只提交 safe integer `betAmountRaw` 和 `winAmountRaw`；preview 的 bet、win、zoom、guides 不进入 manifest。
- 档位固定为 `base -> standard -> bigwin -> superwin -> megawin`。`base` 截止 `1×bet`，`standard` 截止 bigwin threshold，后三档 threshold multiplier 显式且严格递增。边界相等时进入对应档，runtime 用 BigInt 比较。
- 每档必须有非空 `layers`，且必须恰好包含一个 `image-string + win-amount` 图层。金额不参与 `start/loop/end` 可见性：整场只维持一个 renderer/runtime，跨档只更新文本、transform，必要时在同一实例上切换 image-string resource。
- 每档还可声明任意数量的命名 `text` 和 `binding="manual"` ImgNumber。名称在同档唯一；跨档同名节点视为一个逻辑节点且必须保持 kind 一致。`text` 引用 package font，并严格保存单行默认文案、字号、字距、纯色或线性渐变、可选描边/投影、`-180..180` 度弧排、anchor、rotation 与可见 segment。manual ImgNumber 保存默认 string、anchor、rotation 与可见 segment。
- 每档严格按唯一的 `order` 升序叠放，数值越小越靠下。跨档时单一金额 renderer 会移动到新档容器内对应的 child index，不会固定在全部 VNI 之上。
- ImgNumber layer 的 `parent` 是 `{ "kind": "popup-root" }` 或
  `{ "kind": "vni-text-layer", "vniLayerId": "...", "textLayerId": "..." }`。后者只能引用
  同档 VNI layer 和该 project 内 exact `type="text"` layer；ImgNumber 的 `x/y/scale/anchor`
  相对文字层，继承其 VNI animation、可见性和渲染顺序，`order` 不再决定该金额的视觉 z-order。
  旧 v1 省略 `parent` 唯一规范化为 `popup-root`，未知/失效 target 不回退。
- VNI `playback` 是 strict union：`mode="segmented"` 显式保存
  `loopStartTime/loopEndTime/keepParticlesAlive`；`mode="once"` 不接受这些字段，从 `0`
  到 project `stage.duration` 非循环播放一次。once 先于金额阶段结束时保持 authored
  终点采样，直到跨档或 dismiss 才隐藏。Spine 继续显式保存大小写精确且互不相同的
  start/loop/end animation。

## 合同骨架

```json
{
  "version": 1,
  "kind": "popup",
  "id": "game003-win-celebration",
  "type": "award-celebration",
  "designViewport": { "width": 1080, "height": 1920 },
  "amountFormat": {
    "rawScale": 100,
    "fractionDigits": 2,
    "useGrouping": true,
    "groupSeparator": ",",
    "decimalSeparator": ".",
    "prefix": "$",
    "suffix": "",
    "rounding": "floor"
  },
  "resources": {
    "amount": {
      "kind": "image-string",
      "manifest": "dependencies/image-strings/amount/image-string.manifest.json"
    }
  },
  "awardCelebration": {
    "base": { "countDurationSeconds": 1.5, "layers": [] },
    "standard": { "countDurationSeconds": 3, "layers": [] },
    "celebrationTiers": [
      {
        "id": "bigwin",
        "thresholdMultiplier": 15,
        "countDurationSeconds": 2.9,
        "layers": []
      },
      {
        "id": "superwin",
        "thresholdMultiplier": 25,
        "countDurationSeconds": 2.9,
        "layers": []
      },
      {
        "id": "megawin",
        "thresholdMultiplier": 50,
        "countDurationSeconds": 2.9,
        "layers": []
      }
    ]
  }
}
```

骨架中的空 `layers` 是说明结构的无效占位，不能作为 fixture 或导出物。合法 image-string layer 必须包含 `id/kind/name/order/resource/binding/anchor/transform`；`binding="win-amount"` 的 name 固定为 `win-amount` 且不接受 `visibleSegments`，`binding="manual"` 还必须包含 `defaultText/visibleSegments`。image 与 text 图层使用 `visibleSegments`；VNI/Spine 使用各自 playback。

普通 Spine 弹窗使用互斥的 `type="spine"` schema，不包含 `amountFormat` 或 `awardCelebration`：

```json
{
  "version": 1,
  "kind": "popup",
  "id": "free-game",
  "type": "spine",
  "designViewport": { "width": 1080, "height": 1920 },
  "resources": {
    "effect": {
      "kind": "spine",
      "skeleton": "assets/<sha256>.json",
      "atlas": "assets/<sha256>.atlas",
      "textures": { "effect.png": "assets/<sha256>.png" }
    },
    "prompt-font": {
      "kind": "font",
      "path": "assets/<sha256>.woff2"
    },
    "shade": {
      "kind": "image",
      "path": "assets/<sha256>.webp",
      "size": { "width": 900, "height": 180 }
    }
  },
  "spine": {
    "resource": "effect",
    "transform": { "x": 0, "y": 0, "scale": 1 },
    "playback": {
      "mode": "segmented-animations",
      "startAnimation": "Start",
      "loopAnimation": "Loop",
      "endAnimation": "End"
    },
    "prompt": {
      "font": "prompt-font",
      "defaultText": "Press any key to continue",
      "fill": "#ffffff",
      "order": 20,
      "area": { "x": 0, "y": 680, "width": 760, "height": 64 }
    },
    "overlays": [
      {
        "id": "shade",
        "kind": "image",
        "order": 10,
        "resource": "shade",
        "transform": { "x": 0, "y": 680, "scale": 1, "rotation": 0 },
        "anchor": { "x": 0.5, "y": 0.5 },
        "visibleSegments": ["start", "loop"]
      }
    ]
  }
}
```

三个动画名必须大小写精确、非空且互不相同。`requestDismiss()` 可在 start 或 loop 期间锁存；runtime 必须等 start 完成并在完整 loop 边界后才播放 end。`dismissImmediately()` 是唯一跳过边界的清理入口。

`prompt` 是可选的严格单行点击提示。游戏可把已翻译字符串传给 `start(text)`；省略时使用 `defaultText`。字体只接受 package-owned WOFF2/WOFF/TTF/OTF，按 bytes SHA-256 注册和复用；Pixi 文本固定使用该 family，并让浏览器处理 glyph 缺失时的本地字体 fallback。`area.height` 是初始字号，runtime 再按 `area.width/height` 等比缩小，不换行、不扩张区域；进入 end 时隐藏。

`overlays` 可包含 image、命名 text、命名 manual ImgNumber、official Spine 或 VNI，均显式声明 `order/resource/transform.x/y/scale/rotation`。image/text/ImgNumber 额外声明 anchor 与可见 segment；text 与 award text 共享样式合同，ImgNumber 必须保存默认 string；Spine 声明 start/loop/end 动画；VNI 声明 segmented 或 once playback。prompt 与 overlay order 必须唯一；启用 legacy prompt 时名称 `prompt` 被保留。

## 资源、ZIP 与 runtime

owned payload 固定为 `assets/<64位 lowercase sha256>.<canonical-extension>`。VNI project 和 Spine atlas 在叶子路径确定后结构化改写，再对 canonical bytes 求 hash；standalone image-string 保持自包含。parser 递归拒绝 unknown key，ZIP 必须与传递闭包精确相等，并拒绝 traversal、case-fold collision、missing 和 orphan。

```ts
const resource = await createPopupPackageResource({ files });
const player = createAwardCelebrationPlayer({ resource });
await player.init();
player.start({ betAmountRaw: 100, winAmountRaw: 6000 });
player.update(deltaSeconds);
player.requestAdvance();

player.getTextNode("congratulations").setText("恭喜获奖！");
player.getImageStringNode("bonus-count").setText("8");
player.getImageStringNode(0).resetText();
```

普通 Spine 类型使用 `createSpinePopupPlayer({ resource })`，调用 `start(translatedText?)`、逐帧 `update(deltaSeconds)` 并把用户点击转发给 `requestDismiss()`。

两类 player 都提供稳定、只读的 `textNodes` / `imageStringNodes` 清单，以及按 exact name 或各 kind 独立零基 index 查询的 `getTextNode()` / `getImageStringNode()`。handle 的 `setText()` 是原子覆盖并跨档位切换与重复播放保持；`resetText()` 恢复当前 manifest 默认值或 win-amount 自动格式化值。不存在、越界、kind 错误、非法单行文字、ImgNumber 缺 glyph 或已销毁 handle 都显式失败。

Popup package 本身不拥有游戏模式，也不声明 BaseGame/FreeGame。scene-layout 负责通用
mode -> award popup binding、普通 Spine popup 显式注册与 viewport-center root placement；Popup Editor 继续独占 popup 内部动画、tier、layer、金额格式、坐标和资源编辑。
