# 背景适配方案使用规范

本文档规定 `packages/rendercore` 当前可供游戏复用的背景适配方案、配置边界、计算逻辑和验收方法。新增游戏或调整现有游戏背景时，应先按本文选择方案，再配置 art 和 focus；不要在游戏 app 内另写 resize、裁切或横竖屏判断。

通用 scene package 由 `@slotclientengine/rendercore/scene-layout` 统一组合这两种既有适配方案、纯 frame policy 几何、图片/Spine node、named attachment 与 reel geometry。schema 和接入示例见 [`scene-layout-manifest.md`](./scene-layout-manifest.md)。scene-layout 不创建第三套适配公式；`apps/gamelayouteditor` 不依赖 uiframeworks，而是调用 `resolveSceneLayoutFrameViewport()` 复现相同的 `frameDesignSize/cssSize/offset`，再调用同一 art viewport helper。

## 1. 当前只有两种对外背景适配方案

| 方案                    | 适用资源                       | 对外入口                                                                              | 当前示例       |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------- | -------------- |
| 单背景、单 focus 最大化 | 横竖屏共用一张完整背景         | `createMaximizedFocusedArtViewportPolicy()`、`calculateMaximizedFocusedArtViewport()` | `apps/game002` |
| 横竖双背景、双 variant  | 横屏和竖屏使用不同背景及坐标系 | `calculateResponsiveArtViewport()`，配合 framework `orientation-focus` frame policy   | `apps/game003` |

以下能力不算第三种背景适配方案：

- `calculateFocusedArtViewport()` 是两种方案共用的底层 art 裁切和坐标映射核心。
- `mapArtRectToViewport()`、`mapAnchorRectToArt()`、`mapReferenceRectToArt()` 是坐标 helper。
- `uiframeworks` 中的 `fixed`、`focus`、`orientation-focus`、`maximized-focus` 是 DOM frame policy。它们负责页面 frame 和 canvas 逻辑尺寸，不等同于 rendercore 背景方案。
- CSS `object-fit`、app 私有 resize、额外 DOM crop 都不是允许的背景适配方案。

## 2. 统一术语和坐标合同

### 2.1 尺寸与矩形

- `pageSize`：浏览器页面可用区域，单位为 CSS pixel。
- `frameDesignSize` / `viewportSize`：canvas 当前逻辑尺寸。Pixi renderer 使用这个尺寸，不是背景原图尺寸。
- `artSize`：完整背景美术坐标系尺寸。静态图通常等于图片真实像素尺寸；Spine 背景必须由 manifest 显式声明，不能从 skeleton bounds 或 atlas page 尺寸推导。
- `focusRect`：完整 art 坐标系中的重点区域，包含 `x/y/width/height`。
- `visibleRect`：当前 viewport 最终显示的 art 区域。
- `worldOffset`：完整 art world 在当前 Pixi viewport 中的偏移，等于 `-visibleRect.x/y`。
- `focusRectInViewport`：focus 在当前 viewport 中的位置，主要用于布局诊断和自动化验收。
- `frameFocusRect`：仅双背景 YAML/frame policy 使用的 DOM frame 重点尺寸，只有 `width/height`；它不是 art 坐标，不负责场景部件定位。
- `minFocusMargin`：focus 周围必须保留的最小逻辑留白；只有确实存在视觉安全边界时才配置。

### 2.2 坐标基准

所有 rendercore 的 `artSize`、`focusRect`、board、主转轮背景和场景部件坐标都必须使用当前完整背景的 art 坐标：

```text
完整背景 art 左上角 = (0, 0)
focusRect.x/y        = focus 相对完整背景左上角的位置
部件 art rect         = 部件相对完整背景左上角的位置
```

禁止把以下坐标混入 art 配置：

- CSS pixel；
- 浏览器 page 坐标；
- 已裁切 `visibleRect` 内的局部坐标；
- DOM overlay 或 HUD 坐标；
- 旧设计稿坐标，除非先通过 `mapReferenceRectToArt()` 显式映射。

### 2.3 运行链路

```text
浏览器 pageSize
  -> gameframeworks/uiframeworks，或 rendercore 纯 frame helper，计算 frameDesignSize 和 CSS scale
  -> Pixi adapter 用 frameDesignSize resize renderer
  -> rendercore 根据 artSize、focusRect、viewportSize 计算 visibleRect
  -> Pixi art world 应用 worldOffset
  -> board 和其它 art rect 通过 mapArtRectToViewport() 映射
```

游戏 app 负责提供配置和应用结果，不负责复制上述算法。

### 2.4 背景表现与适配相互独立

背景表现可以是静态 texture，也可以是 `@slotclientengine/rendercore/background` 提供的 manifest-driven Spine player。无论表现来源如何，适配只消费 `artSize`、`focusRect` 和 viewport policy：

- 静态 texture 的像素尺寸不能隐式覆盖已配置 art。
- Spine skeleton bounds、atlas page 数量、当前 animation 和逻辑 state 都不能改变 art/focus/viewport。
- Spine display tree 必须先按 manifest transform 映射到 art 坐标，再裁切到 manifest art rect；之后与 reel、overlay 一起放入同一个 art world 并统一应用 `worldOffset`。
- background state/transition 只负责表现切换。rendercore 不认识 game002、FreeGame 的服务端字段或其它游戏业务语义；app 只能在业务合同明确后调用 `requestState()`。

Spine background manifest 还负责 skeleton/atlas/多页 texture 闭包、初始稳态和有向 transition。路径、Spine 版本、animation name、atlas page 或 transition 缺失时必须显式失败，不允许回落静态图、首帧或默认 animation。

## 3. 方案一：单背景、单 focus 最大化

### 3.1 何时选择

满足以下条件时使用本方案：

- 横屏、竖屏和正方形页面共用同一张背景；
- 所有页面方向共用同一个 art 坐标系；
- 有一个必须完整保留的重点区域；
- focus 之外只要背景仍有内容，就希望继续展示，而不是主动裁掉。

当前 `game002` 使用本方案。

### 3.2 配置入口

app 只向 viewport policy 提交一套 `artSize` 和一个 `focusRect`。对于 game002，这两个值直接来自已解析的 background manifest，而不是在 app 中重写数字：

```ts
import { createMaximizedFocusedArtViewportPolicy } from "@slotclientengine/rendercore";
import { GAME002_BACKGROUND_MANIFEST } from "./background-config.js";

const { artSize } = GAME002_BACKGROUND_MANIFEST;
const { focusRect } = GAME002_BACKGROUND_MANIFEST.adaptation;

const framePolicy = createMaximizedFocusedArtViewportPolicy({
  artSize,
  focusRect,
});

const framework = createSlotGameFramework({
  // 其它 framework 配置省略
  framePolicy,
});
```

当前 game002 的 board 为：

```text
board = { x: 637.5, y: 330, width: 720, height: 1080 }
```

focus 是 board 四边各扩大 `60` 后的显式配置。board 和 focus 职责不同，不能在 runtime 中从 board 隐式推导 focus。

### 3.3 核心计算

第一步，以 contain 语义计算 focus 能在页面内完整显示的最大缩放：

```text
focusScale = min(
  pageWidth  / focusWidth,
  pageHeight / focusHeight
)
```

第二步，用页面尺寸除以 `focusScale`，反推当前页面比例需要展示多大的 art-space viewport：

```text
requestedViewportWidth  = pageWidth  / focusScale
requestedViewportHeight = pageHeight / focusScale
```

第三步，仅当反推范围超过完整背景时才封顶：

```text
viewportWidth  = min(artWidth,  requestedViewportWidth)
viewportHeight = min(artHeight, requestedViewportHeight)
```

第四步，把得到的 `viewportSize` 交给 `calculateFocusedArtViewport()`，围绕 focus 计算 `visibleRect`、边界钳制和 `worldOffset`。

该算法没有“页面略高就强制锁 focus 宽度”或“页面略宽就强制锁 focus 高度”的方向分支。真正决定缩放轴的是 focus contain 结果。

### 3.4 为什么不会随意产生黑边

当 `requestedViewportWidth/Height` 都没有超过 `artSize` 时，frame 的宽高比与页面一致，背景可以铺满页面：

```text
requested viewport 在 art 内
  -> 不封顶
  -> frame aspect = page aspect
  -> offsetX = 0 且 offsetY = 0
```

只有某一轴反推范围超过完整 art 时才封顶。此时如果仍要求 focus 完整、背景不拉伸、背景外不造假内容，黑边不可避免：

```text
requested viewport 超过 art
  -> 对超出轴按 artSize 封顶
  -> framework contain 缩放并居中
  -> 可能出现黑边
```

不得为了消灭这种不可避免的黑边拉伸背景、裁掉 focus、显示 art 外内容或在 app CSS 中二次 cover。

### 3.5 近正方形示例

使用 game002 focus `840 x 1200`，页面为 `1430 x 1464`：

```text
focusScale = min(1430 / 840, 1464 / 1200)
           = 1.22

requestedViewport = {
  width:  1430 / 1.22 = 1172.13...
  height: 1464 / 1.22 = 1200
}
```

`1172.13 x 1200` 没有超过 `2000 x 2000` art，因此不封顶，页面可以铺满，并继续展示 focus 两侧的背景。

错误做法是仅因为 `1464 > 1430` 就把它当成竖屏，并把 viewport 锁成 `840 x 1200`。这会主动裁掉两侧仍可展示的背景，造成不必要的大黑边。

### 3.6 focus 调整规则

focus 是游戏表现调节参数，但必须始终包含真正的重点区域：

- 扩大 focus：同样页面下重点内容整体显示得更小，周围背景相对更多。
- 缩小 focus：重点内容整体显示得更大，但更容易触及 art 边界或遮挡 UI。
- 移动 focus：改变裁切中心；接近 art 边缘时会被底层算法钳制。
- focus 不能超出 art。
- focus 不能为了迁就某一页面临时在 runtime 中变化；不同皮肤需要分别显式配置。

如 board 是必须完整显示的核心区域，应在配置评审和测试中验证：

```text
focus.x <= board.x
focus.y <= board.y
focus.x + focus.width  >= board.x + board.width
focus.y + focus.height >= board.y + board.height
```

## 4. 方案二：横竖双背景、双 variant

### 4.1 何时选择

满足以下任一条件时使用本方案：

- 横屏和竖屏由美术提供不同背景；
- 两张背景尺寸不同；
- 横竖屏重点区域坐标不同；
- 横竖屏场景部件布局不同，不能共用一个 art 坐标系。

当前 `game003` 横屏使用 `bg1.jpg`，竖屏使用 `bg2.jpg`，因此使用本方案。

不要把两张背景伪装成单背景 `maximized-focus`，也不要把双背景做成 game app 内的私有 `window.innerWidth` 分支。

### 4.2 variant 选择规则

`calculateResponsiveArtViewport()` 的选择规则固定为：

```text
viewportSize.height > viewportSize.width
  -> portrait

否则，包括正方形
  -> landscape
```

两套 variant 都必须存在，不能只配置当前测试到的方向，也不能在缺失时 fallback 到另一张背景。

### 4.3 rendercore 配置

```ts
import { calculateResponsiveArtViewport } from "@slotclientengine/rendercore";

const viewport = calculateResponsiveArtViewport({
  viewportSize,
  variants: {
    landscape: {
      artSize: { width: 2000, height: 2000 },
      focusRect: { x: 288, y: 588, width: 1424, height: 824 },
    },
    portrait: {
      artSize: { width: 1174, height: 2000 },
      focusRect: { x: 22, y: 469.5, width: 1130, height: 1061 },
      minMargin: { left: 22, right: 22 },
    },
  },
});
```

选中 variant 后，rendercore 调用 `calculateFocusedArtViewport()` 完成：

- focus 完整性校验；
- focus 与 margin 是否能放入 viewport 的校验；
- 围绕 focus 的 art 裁切；
- art 边界钳制；
- `visibleRect`、`worldOffset` 和 `focusRectInViewport` 计算。

本方案不会在 rendercore 内加载图片。app 必须根据返回的 `variantId` 使用对应背景和对应场景部件配置。

### 4.4 YAML 与 DOM frame policy

支持静态 YAML 的游戏，应以 `art.mode: orientation-focus` 配置两套 variant：

```yaml
art:
  mode: orientation-focus
  variants:
    landscape:
      background:
        path: assets/example/bg-landscape.jpg
        width: 2000
        height: 2000
      focusRect:
        x: 288
        y: 588
        width: 1424
        height: 824
      frameFocusRect:
        width: 1424
        height: 1061

    portrait:
      background:
        path: assets/example/bg-portrait.jpg
        width: 1174
        height: 2000
      focusRect:
        x: 22
        y: 469.5
        width: 1130
        height: 1061
      frameFocusRect:
        width: 1130
        height: 1061
      minFocusMargin:
        left: 22
        right: 22
```

`createSlotGameFramePolicyFromStaticConfig()` 从 YAML 生成 framework 的 `orientation-focus` policy。职责必须区分：

| 字段             | 坐标/内容                       | 使用方                        | 职责                                                                                      |
| ---------------- | ------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `background`     | 图片路径和完整 art 尺寸         | loading、app、rendercore 配置 | 当前方向的背景资源与 art 上限                                                             |
| `focusRect`      | art 坐标中的 `x/y/width/height` | rendercore、app layout        | 背景重点区域及场景部件 anchor                                                             |
| `frameFocusRect` | 只有逻辑 `width/height`         | gameframeworks/uiframeworks   | DOM frame 和 canvas 逻辑尺寸计算                                                          |
| `minFocusMargin` | focus 周围逻辑留白              | gameframeworks/uiframeworks   | 约束 DOM frame 的视觉安全边界；生成 frame policy 时不会自动变成 rendercore 的 `minMargin` |

`focusRect` 与 `frameFocusRect` 可以数值不同。不能用 `frameFocusRect` 定位 Pixi 部件，也不能让 DOM frame policy 推导主转轮、传送带或 board 的 art 坐标。

`ResponsiveArtVariant.minMargin` 是 rendercore 侧可选参数。如果游戏的 art 裁切也需要 margin，app 必须从同一份已校验静态配置显式传入，不能假设 `createSlotGameFramePolicyFromStaticConfig()` 会自动替 rendercore 接线，也不要维护第二份手写 margin。

修改 YAML 后必须重新生成并检查生成物。以 game003 为例：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

`game-static.generated.ts` 和 `game-loading.generated.ts` 禁止手改。

## 5. 共用底层：`calculateFocusedArtViewport()`

该 API 是几何核心，不是可单独命名的第三种背景方案：

```ts
const viewport = calculateFocusedArtViewport({
  artSize,
  viewportSize,
  focusRect,
  minMargin,
});
```

返回值：

```ts
interface FocusedArtViewport {
  artSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  visibleRect: { x: number; y: number; width: number; height: number };
  worldOffset: { x: number; y: number };
  focusRectInViewport: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

显式失败条件包括：

- `artSize`、`viewportSize`、`focusRect` 包含非有限数或非正尺寸；
- `viewportSize` 超过 `artSize`；
- `focusRect` 超出 `artSize`；
- viewport 无法容纳 focus 和 `minMargin`；
- margin 为负数或非有限数。

不要捕获这些错误后静默 fallback。配置错误应在开发、构建或 loading 阶段明确暴露。

## 6. 如何选择方案

```text
横竖屏是否使用同一张背景、同一 art 坐标系？
  |
  +-- 是 -> 是否有一个必须完整保留的重点区域？
  |          |
  |          +-- 是 -> 方案一：maximized-focus
  |          +-- 否 -> 先由设计明确 focus；不要用整张背景或 board 隐式兜底
  |
  +-- 否 -> 方案二：responsive-art + orientation-focus variants
```

不要仅因为页面支持横竖屏就选择方案二。决定因素是美术资源和 art 坐标系是否真的分为两套。

## 7. 新游戏接入步骤

### 7.1 单背景游戏

1. 确认背景真实尺寸并配置 `artSize`。
2. 在完整背景坐标中标出必须保留的重点区域。
3. 根据视觉需要适当向外扩大，得到唯一 `focusRect`。
4. 调用 `createMaximizedFocusedArtViewportPolicy()` 并传给 framework。
5. adapter 从 `context.getViewport()` 和 `context.onViewportChange()` 获取逻辑 viewport。
6. 用 `calculateFocusedArtViewport()` 计算 art world offset。
7. 用 `mapArtRectToViewport()` 映射 board 和其它 art rect。
8. 若背景为 Spine，使用精确 manifest/Vite modules 创建 rendercore player，把其 container 作为 art world 最底层，并在每个 ticker tick 推进。
9. 增加 portrait、near-square、square、landscape、ultra-wide 测试，并覆盖 art clip 与 idle animation 持续性。

### 7.2 双背景游戏

1. 分别确认横版、竖版背景真实尺寸。
2. 分别在两套 art 坐标中配置 `focusRect`。
3. 在 YAML 中配置两套 `background`、`focusRect`、`frameFocusRect` 和必要 margin。
4. 生成静态配置，禁止手改 generated TS。
5. 用生成配置创建 `orientation-focus` frame policy。
6. 把横竖 variant 传给 `calculateResponsiveArtViewport()`。
7. 根据 `variantId` 选择对应背景和场景部件配置。
8. 验证方向切换时不复用错误坐标、错误背景或旧 texture。

## 8. 自动化验收要求

### 8.1 两种方案共用断言

每个测试页面尺寸至少检查：

```text
focusRectInViewport.x >= 0
focusRectInViewport.y >= 0
focusRectInViewport.x + focusRect.width  <= viewport.width
focusRectInViewport.y + focusRect.height <= viewport.height
```

如果 board 必须完整保留，还要检查 board 在 focus 内和 board 映射后在 viewport 内。

resize 测试必须确认：

- renderer 使用新 `frameDesignSize` resize；
- world container 使用新的 `worldOffset`；
- 不重建 live session 或产生第二条 WebSocket；
- 不使用 window 尺寸在 app 内重复计算背景策略。

### 8.2 单背景方案专项断言

至少覆盖：

| 页面类型  | 推荐示例      | 重点                                                |
| --------- | ------------- | --------------------------------------------------- |
| 典型竖屏  | `390 x 844`   | focus 完整最大化，显示可用上下背景                  |
| 近正方形  | `1430 x 1464` | 不因方向误判锁成 focus aspect，不出现非必要左右黑边 |
| 正方形    | `1200 x 1200` | focus 完整，剩余轴继续显示背景                      |
| 横屏      | `1920 x 1080` | focus 完整，背景宽度不足时只产生可解释的最小黑边    |
| 极端宽/高 | 项目自定      | 只有请求 viewport 超过 art 的轴允许封顶             |

测试应直接验证公式：

```text
expectedFocusScale = min(pageWidth/focusWidth, pageHeight/focusHeight)
requestedViewport = pageSize / expectedFocusScale
expectedViewport = min(requestedViewport, artSize)
```

当 `requestedViewport` 两轴都没有超过 art 时，还应断言 framework viewport：

```text
offsetX = 0
offsetY = 0
```

### 8.3 双背景方案专项断言

- `height > width` 必须选择 portrait；其它情况必须选择 landscape。
- 正方形必须选择 landscape。
- 缺少任一 variant 必须显式失败。
- 每套 focus 必须位于对应 art 内。
- 横竖 background、focus、frameFocusRect 和场景部件不能串用。
- YAML 修改后 `generate:static-config` 与 `check:static-config` 必须通过。

## 9. 禁止事项

- 不要在游戏 app 内直接监听 window 后复制背景适配公式。
- 不要使用 app 私有 CSS `cover/contain` 修补 Pixi art viewport。
- 不要为单背景方案增加第二个 DOM `frameFocusRect`。
- 不要用简单的 `height > width` 分支强制锁定单背景 focus 的宽或高。
- 不要把 board frame 当作隐式 focus；focus 必须显式配置。
- 不要因为服务器 scene 无法在本地轮带反查 stop y 而改变背景或转轮适配。
- 不要让 `frameFocusRect` 参与 game003 主转轮、传送带或其它部件定位。
- 不要让 `focusRect`、symbol scale、HUD 坐标或运行期下注数据互相承担职责。
- 不要在 focus 或 art 越界时静默裁切、自动修正或 fallback。
- 不要为了消灭 art 尺寸不足导致的不可避免黑边而拉伸背景。
- 不要用 Spine skeleton bounds、atlas page 尺寸或当前 animation bounds 推导 art/focus。
- 不要在 app 内复制 background manifest parser、Spine player/state machine，或猜测业务字段自动切换背景。
- 不要给 Spine 背景增加静态图、setup pose、首帧或 animation alias fallback。

## 10. 代码位置

- 单背景最大化与底层裁切：[`packages/rendercore/src/viewport/focused-art-viewport.ts`](../packages/rendercore/src/viewport/focused-art-viewport.ts)
- 双背景 variant 选择：[`packages/rendercore/src/viewport/responsive-art-viewport.ts`](../packages/rendercore/src/viewport/responsive-art-viewport.ts)
- rendercore viewport 导出：[`packages/rendercore/src/viewport/index.ts`](../packages/rendercore/src/viewport/index.ts)
- DOM frame 计算：[`packages/uiframeworks/src/layout.ts`](../packages/uiframeworks/src/layout.ts)
- framework frame policy 类型：[`packages/gameframeworks/src/types.ts`](../packages/gameframeworks/src/types.ts)
- game002 单背景示例：[`apps/game002/src/game-layout.ts`](../apps/game002/src/game-layout.ts)
- game002 Spine 背景配置：[`apps/game002/src/background-config.ts`](../apps/game002/src/background-config.ts)
- rendercore background public API：[`packages/rendercore/src/background`](../packages/rendercore/src/background)
- game003 双背景示例：[`apps/game003/src/game-layout.ts`](../apps/game003/src/game-layout.ts)
- game003 YAML 示例：[`apps/game003/config/game-static.yaml`](../apps/game003/config/game-static.yaml)
