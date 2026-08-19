# Popup package v1–v8

`popup.manifest.json` 是获奖庆祝、普通 Spine 弹窗与单状态自由弹窗的唯一 production 合同。独立 `<id>-popup.zip` 最终由 Game Layout Editor 原样 vendor 到 Scene Layout package。

rendercore 继续解析全部历史版本。`@slotclientengine/rendercore/popup/data` 的 `loadPopupManifest()` 是唯一默认入口：它先按 source version strict validate，再确定性升级并 strict revalidate 为 `LATEST_POPUP_MANIFEST_VERSION`（当前 v8），同时返回 `sourceVersion` 供迁移提示。游戏、所有 editor 与 CLI 都不在默认流程自行挑选版本 upgrader；未知未来版本显式失败。Popup Editor 新建项目固定使用 v8；导入合法 v1–v7 ZIP 时先完成 source package 的 map/hash/closure 与 resource 校验，再原子迁移为 v8。迁移失败不打开半迁移项目，后续 preview/export 只生成 v8。历史版本只包含获奖庆祝与普通 Spine 类型；`single-state` 从 v8 开始存在，不能降级到旧版本。

## v2 presentation 扩展

v2 在 v1 的类型专属内容之外增加以下公共字段：

```json
{
  "version": 2,
  "name": "Big Win",
  "adaptation": {
    "mode": "maximized-focus",
    "focus": { "left": 320, "right": 320, "top": 480, "bottom": 480 }
  },
  "backdrop": { "enabled": true, "color": "#000000", "alpha": 0.5 }
}
```

`focus` 以 `designViewport` 中心为基准向四边扩展，必须形成画布内的正面积区域。runtime 使用与 Game Layout 相同的 maximized-focus 算法求出 art-space visible rect，再以 `min(viewportWidth/visibleWidth, viewportHeight/visibleHeight)` 等比 contain，并把剩余横向或纵向空间平均分配；Popup 自己拥有该适配结果。layout 的 popup root `x/y/scale` 只作为宿主 placement 叠加。`backdrop` 是独立于 authored content transform 的 viewport 全屏层，默认由 Editor 建立为 50% 黑色，也可显式关闭。

v2 的每个 award layer 与 Spine overlay 都必须声明 `alpha`（`0..1`）。v2 字体文字必须有 lowercase kebab-case exact `name`；它可以省略 `resource` 并使用 `system-ui, sans-serif`，选择上传字体时则必须精确引用 font resource，引用失效不得回退。文字效果支持 canonical `#rrggbb | #rrggbbaa` 颜色、纯色/线性渐变、描边、投影和 `-180..180` 度 grapheme 弧排。

Popup Editor 的 v2 模板完成条件是：获奖庆祝五档共享一个 `win-amount` ImgNumber，且 `bigwin/superwin/megawin` 各至少绑定一个 VNI；Spine 弹窗必须绑定一个 official Spine resource，并明确选择互不相同的 start/loop/end 三段动画。两种模板都可继续添加图片、Spine、VNI、字体文字或 ImgNumber 图层。独立 `spine.prompt` 只属于 legacy 兼容；新 v2 authoring 不生成它，旧 prompt 在显式升级/导入时迁移为命名 text overlay。

## v3 无界重点区域

v3 保留 v2 的 `name/adaptation/backdrop`、layer `alpha`、命名文字及类型专属内容，但删除 `designViewport`：

```json
{
  "version": 3,
  "kind": "popup",
  "id": "big-win",
  "name": "Big Win",
  "type": "award-celebration",
  "adaptation": {
    "mode": "maximized-focus",
    "focus": { "left": 540, "right": 540, "top": 960, "bottom": 960 }
  },
  "backdrop": { "enabled": true, "color": "#000000", "alpha": 0.5 }
}
```

骨架省略了 required resources 与 award 内容，只说明公共字段。focus 四边都是相对 Popup 原点 `(0,0)` 的正有限 extent；authored plane 没有有限边界，也不写 `Infinity` 或超大占位 viewport。runtime 先 contain 完整 focus，再按宿主 page aspect 反推 visible rect，并以 focus 几何中心向外扩展；focus 外 layer 可以进入额外可见范围，不执行 art-bound clamp。host placement 最后叠加，backdrop 仍独立覆盖整个宿主 viewport。v3 出现 `designViewport` 或 `spine.prompt` 都是 unknown/unsupported contract error。

v1 自动迁移使用旧 `designViewport` 的半宽/半高生成对称 focus；v2 原样保留 focus。两版 layer 坐标仍以 Popup 中心为原点，因此迁移不移动 transform。旧 prompt 结构化转换为 `name=prompt` 的 text overlay，name/order 冲突时整次导入失败；v1 缺失的 layer alpha 规范化为 `1`。

## v4 Spine slot 挂接

v4 保留 v3 的无界 focus 合同，并要求每个 award layer 与普通 Spine overlay 显式声明唯一 `attachment`：

```json
{ "kind": "popup-root" }
{ "kind": "vni-text-layer", "vniLayerId": "effect", "textLayerId": "amount" }
{
  "kind": "spine-slot",
  "target": { "kind": "layer", "layerId": "character" },
  "slot": "Value"
}
{
  "kind": "spine-slot",
  "target": { "kind": "main-spine" },
  "slot": "Value"
}
```

`main-spine` 只适用于普通 Spine Popup；award layer 只能引用同档位的 Spine layer，普通 overlay 只能引用同一 Popup 的 Spine overlay。target 必须是 exact layer id，slot 必须是目标 skeleton 声明的大小写精确名称。self edge、任意长度循环、跨作用域引用、非 Spine target 和资源覆盖后消失的 slot 都会在 display tree mutation 前失败，不会自动回到根节点。

挂接层的 `x/y/scale/rotation` 是 slot 局部 transform，并继承 official Spine slot 的 bone transform、颜色和 draw order。同一个 `(target, slot)` 由一个稳定 group 承载多个 child；`order` 只要求在同一 resolved parent 内唯一并决定该 group 内的兄弟顺序。不同 slot 的视觉顺序仍由 skeleton draw order 决定。v1/v2/v3 继续使用原有全层 `order` 唯一规则。旧 ImgNumber `parent` 在 Editor 导入时等价迁移为 v4 `attachment`，canonical v4 不再写 `parent`。

## v5 项目状态可见性

v5 保留 v4 的 presentation 与 attachment 合同，并要求 backdrop 和每个 layer kind 都声明 `visibleStates`。`award-celebration` 只接受 `base / standard / bigwin / superwin / megawin`，`spine` 只接受 `start / loop / end`；layer 数组必须非空，backdrop 可为空表示启用但不在任何状态压暗。未知、重复或跨项目类型的状态都会 strict 失败。

Editor 导入合法 v1–v4 时，把旧 `[start, loop, end]` 选择转换为固定三位向量：三项全选表示全程可见，因此 award 扩展为五项全选；部分选择只映射相同 index，例如 `[start, end]` 变为 `[base, bigwin]`。旧版中没有可见性字段的动画层、金额层和 backdrop 按目标类型全选迁移。Spine/VNI 自身的 start/loop/end playback 不因 award 五状态而改变。

## v6 award 逻辑图层

v6 保留 backdrop 的类型化 `visibleStates`，普通 Spine Popup 也继续为 overlay 保存 `start / loop / end`。`award-celebration` layer 不再保存 `visibleStates`：配置所在的 tier 就是唯一可见状态，当前 tier 不包含某个 layer id 即表示该逻辑图层不可见。

同一个 exact layer `id` 可在多个 award tier 出现，表示同一逻辑图层的状态配置。跨 tier 必须保持 `kind` 以及 string node 的 `name/binding` 一致；resource、transform、alpha、order、attachment、style 和 playback 可以不同。runtime 对相同 `id + kind + resource` 复用已初始化的核心实例，切换 tier 时先隐藏旧画面，再应用当前状态配置；资源变化时使用该 Popup 已准备的受限变体。每档的金额层固定为 `id/name="win-amount"`，整场继续共享同一个 ImgNumber runtime 和稳定 string handle。

v1–v5 award 升级时以 layer 所在 tier 为状态权威并移除 layer visibility，不会因旧五档全选而把 celebration 效果提前放进 base/standard。旧包跨 tier 复用同一 id 但稳定 identity 冲突时，upgrader 使用确定的 state-qualified id，并同步重写该 tier 内 attachment target。导出的 v6 再导入不会发生第二次变化。

award 的分段 VNI 收到最终关闭请求时立即从 exact `loopEndTime` 启动非循环 end range，不等待当前 loop 完成；end 和粒子 drain 完成后 Popup 隐藏并进入 complete。tier 切换则立即隐藏 outgoing tier，避免旧 bigwin 在新档背后继续显示。普通 Spine Popup 的三阶段点击边界不受此规则影响。

## v7 audio 与 v8 单状态自由弹窗

v7 在两个既有类型上增加严格的 `audio` 合同；v8 保留该合同并新增互斥的 `type="single-state"`。single-state 不包含 `amountFormat`、`awardCelebration` 或 `spine` 主状态机，也没有强制图层；`singleState.layers` 可以为空，所有内容只在唯一的 `active` 状态中显示。其 `audio` 当前必须是 `{ "version": 1, "effects": [], "cues": [] }`，不能借用 award tier 或 Spine segment cue。

single-state 支持 image、text、image-string、VNI 与 official Spine 五种 typed layer。每个 layer 的 lowercase kebab-case `id` 同时是唯一 runtime name；text 与 image-string 的 string name 也就是该 id，不保存第二份 alias。VNI/Spine 的 `autoplay` 可省略；省略只表示 Popup `start()` 时不自动播放，caller 仍可通过按 name 取得的 borrowed layer 操作底层 typed 渲染对象。

每个 layer 必须显式声明 `attachment`。父节点只能是已存在于同一 Popup 的 layer metadata：`popup-root`、某个 official Spine layer 的 exact slot，或某个 VNI layer 的 exact text layer。single-state 不存在 `main-spine` target。parser 在 materialize display tree 前拒绝 missing/self/cycle、非对应 kind、缺 slot/text layer 与跨 Popup 引用；Editor rename 原子改写引用，删除或资源替换不能留下悬空 target。

最小合法 v8 single-state package 可以没有任何图层：

```json
{
  "version": 8,
  "kind": "popup",
  "id": "freeform-help",
  "name": "Freeform Help",
  "type": "single-state",
  "adaptation": {
    "mode": "maximized-focus",
    "focus": { "left": 540, "right": 540, "top": 960, "bottom": 960 }
  },
  "backdrop": {
    "enabled": false,
    "color": "#000000",
    "alpha": 0.5,
    "visibleStates": ["active"]
  },
  "resources": {},
  "audio": { "version": 1, "effects": [], "cues": [] },
  "singleState": { "layers": [] }
}
```

非空 layer 必须引用 `resources` 中 kind 匹配的资源；未被 layer 闭包使用的资源仍按 production strict closure 拒绝。Spine autoplay 保存 exact `animation/loop`；VNI autoplay 使用既有 `once | segmented` union。静态 image/text/image-string 不接受 autoplay。

## 坐标、档位与输入

- popup 中心为 `(0, 0)`，向右/向下为正；v1/v2 使用 `designViewport`，v3–v8 只由 focus 建立无界 maximized-focus production transform。
- layout 为每个 active variant 保存相对 viewport center 的 `x/y/scale`。
- 游戏只提交 safe integer `betAmountRaw` 和 `winAmountRaw`；preview 的 bet、win、zoom、guides 不进入 manifest。
- 档位固定为 `base -> standard -> bigwin -> superwin -> megawin`。`base` 截止 `1×bet`，`standard` 截止 bigwin threshold，后三档 threshold multiplier 显式且严格递增。边界相等时进入对应档，runtime 用 BigInt 比较。
- 每档必须有非空 `layers`，且必须恰好包含一个 `image-string + win-amount` 图层。v6 金额层的 exact id 固定为 `win-amount`；整场只维持一个 renderer/runtime，跨档更新文本、transform 和显式资源绑定。
- 每档还可声明任意数量的命名 `text` 和 `binding="manual"` ImgNumber。名称在同档唯一；跨档同名节点视为一个逻辑节点且必须保持 kind 一致。`text` 可省略字体资源或精确引用 package font，并严格保存单行默认文案、字号、字距、纯色或线性渐变、可选描边/投影、`-180..180` 度弧排、anchor、rotation 与可见 segment。游戏应按 exact name 获取 node handle 并调用 `setText()/resetText()`；不得按 label、order 或资源名猜测。manual ImgNumber 保存默认 string、anchor、rotation 与可见 segment。
- v1/v2/v3 每档严格按全局唯一的 `order` 升序叠放；v4–v8 按 resolved parent 分组校验和排序，数值越小越靠下。跨档时单一金额 renderer 会移动到新档的 resolved parent，不会创建第二个实例。
- v1/v2/v3 ImgNumber layer 的 `parent` 是 `{ "kind": "popup-root" }` 或
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

`prompt` 是可选的严格单行点击提示。游戏可把已翻译字符串传给 `start(text)`；省略时使用 `defaultText`。`font` 也是可选字段：缺省时 rendercore 使用 `system-ui, sans-serif`，不创建资源引用、不注册 FontFace，也不向 `assets.map.json` 或 ZIP 写入系统字体；存在时必须引用 package-owned WOFF2/WOFF/TTF/OTF，并按 bytes SHA-256 注册和复用。显式 `null`、空字符串、未知 key 或非 font resource 都会失败。Pixi 文本让浏览器处理 glyph 缺失时的本地字体 fallback。`area.height` 是初始字号，runtime 再按 `area.width/height` 等比缩小，不换行、不扩张区域；进入 end 时隐藏。

`overlays` 可包含 image、命名 text、命名 manual ImgNumber、official Spine 或 VNI，均显式声明 `order/resource/transform.x/y/scale/rotation`。image/text/ImgNumber 额外声明 anchor 与可见 segment；text 与 award text 共享样式合同，ImgNumber 必须保存默认 string；Spine 声明 start/loop/end 动画；VNI 声明 segmented 或 once playback。prompt 与 overlay order 必须唯一；启用 legacy prompt 时名称 `prompt` 被保留。

## 资源、ZIP 与 runtime

owned payload 固定为 `assets/<64位 lowercase sha256>.<canonical-extension>`。VNI project 和 Spine atlas 在叶子路径确定后结构化改写，再对 canonical bytes 求 hash；standalone image-string 保持自包含。parser 递归拒绝 unknown key，ZIP 必须与传递闭包精确相等，并拒绝 traversal、case-fold collision、missing 和 orphan。

```ts
import { createPopupPackageResource } from "@slotclientengine/rendercore/popup/editor";
import {
  createAwardCelebrationRuntime,
  createSingleStatePopupRuntime,
} from "@slotclientengine/rendercore/popup/core";

const resource = await createPopupPackageResource({ files });
const player = createAwardCelebrationRuntime({ resource });
await player.init();
player.start({ betAmountRaw: 100, winAmountRaw: 6000 });
player.update(deltaSeconds);
player.requestAdvance();

player.getTextNode("congratulations").setText("恭喜获奖！");
player.getImageStringNode("bonus-count").setText("8");
player.getImageStringNode(0).resetText();

const freeform = createSingleStatePopupRuntime({ resource: freeformResource });
await freeform.init();
freeform.start();
const title = freeform.getTextNode("title");
title.setText("新的标题");
const counter = freeform.getImageStringNode("counter");
counter.setText("12");
const layer = freeform.getLayer("counter");
```

普通 Spine production 类型使用 `popup/core` 的 `createSpinePopupRuntime({ resource })`，调用 `start(translatedText?)`、逐帧 `update(deltaSeconds)` 并把用户点击转发给 `requestDismiss()`。需要完整 snapshot 的 Popup Editor 使用 `popup/editor` 的同 Core player wrapper。

三类 player 都提供稳定、只读的 `textNodes` / `imageStringNodes` 清单，以及按 exact name 或各 kind 独立零基 index 查询的 `getTextNode()` / `getImageStringNode()`。handle 的 `setText()` 是原子覆盖并跨档位切换与重复播放保持；`resetText()` 恢复当前 manifest 默认值或 win-amount 自动格式化值。不存在、越界、kind 错误、非法单行文字、ImgNumber 缺 glyph 或已销毁 handle 都显式失败。single-state 另提供 `getLayer(name)`，返回 runtime-owned、caller-borrowed 的 `RenderObject`；caller 不销毁它，Popup destroy 后旧 handle/对象不得继续使用。

普通 Spine Popup 被 Scene Layout transition 用作 `preludePopup` 时，游戏也可通过 `requestGameMode(..., { preludePopupStrings })` 按 exact name 传入仅本轮有效的 text/manual ImgNumber string。Scene Layout 在 Popup 生命周期结束或失败后恢复此前 handle 状态；Popup package/player 本身的 persistent handle 语义不变。

Popup package 本身不拥有游戏模式，也不声明 BaseGame/FreeGame。scene-layout 负责通用
mode -> award popup binding、普通 Spine/single-state popup 显式注册与 viewport-center root placement；Popup Editor 继续独占 popup 内部动画、tier、layer、金额格式、坐标和资源编辑。single-state 只能 programmatic start/dismiss，不进入 award binding 或 transition prelude。
