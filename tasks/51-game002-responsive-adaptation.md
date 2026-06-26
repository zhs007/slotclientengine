# game002 responsive adaptation 任务计划

## 1. 我的理解和任务目标

本任务要为 `apps/game002` 建立一套可以复用到后续 slot 游戏的不同设备适配方案。核心不是在 `game002` 里写几个特殊 CSS，而是把适配拆成两层：

- 游戏 / Pixi canvas 内部适配：由 `packages/rendercore` 提供基础算法，负责在最大美术设计空间 `2000 x 2000` 内，根据当前 canvas 逻辑尺寸选择可见背景裁切区域，并尽量让中间转轮区最大、居中、完整可见。
- 页面 / DOM frame 适配：由 `packages/uiframeworks` 提供基础算法，负责根据真实浏览器 viewport 计算提交给 canvas 的逻辑尺寸，限制 canvas 逻辑尺寸不超过 `2000 x 2000`，并在极端宽屏或大屏时让外层页面用黑色背景和居中 frame 处理多余空间。

`apps/game002` 不应该拥有通用适配算法。它只提供本游戏配置：`bgfull.jpg`、最大美术尺寸、旧 `1125 x 2000` 坐标到新 `2000 x 2000` 坐标的映射、转轮 focus rect、live/gameframeworks 接入和验收入口。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、浏览器验收、文档同步、`agents.md` 同步判断和最终任务报告。

核心交付：

- `apps/game002` 背景改用 `assets/game002/bgfull.jpg`。
- `bgfull.jpg` 的真实尺寸必须校验为 `2000 x 2000`。
- `game002` 的 Pixi art 坐标系改为最大设计空间 `2000 x 2000`。
- 旧 `1125 x 2000` 坐标系下的转轮区必须映射到新 `2000 x 2000` 坐标系，并保持当前相对位置对齐。
- `rendercore` 新增可复用 focus-rect / art-viewport 适配能力。
- `uiframeworks` 新增可复用 page/frame/canvas-size cap 适配能力。
- `gameframeworks` 将 `uiframeworks` 的 viewport 适配能力透传给游戏 app，并让 adapter 能收到初始 viewport 和 resize 变化。
- `game002` 不直接依赖 `@slotclientengine/uiframeworks`，仍然只通过 `@slotclientengine/gameframeworks` 接入通用框架。
- 完成后新增中文任务报告：

```text
tasks/51-game002-responsive-adaptation-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/51-game002-responsive-adaptation-260626-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 新增空目录必须放 `.keepme`

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。若确实需要新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，使用上面的代理环境变量后重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前已知用户素材改动：

```text
assets/game002/bg.jpg      可能已有用户修改
assets/game002/bgfull.jpg  新增背景，期望尺寸 2000 x 2000
```

不要删除或回滚这些素材。实现时只按本任务需要读取和引用它们。

## 3. 当前实现事实

### 3.1 game002 当前布局

当前关键文件：

```text
apps/game002/src/main.ts
apps/game002/src/game-adapter.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-layout.ts
apps/game002/src/styles.css
apps/game002/tests/game-layout.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/README.md
```

当前 `apps/game002/src/game-layout.ts` 事实：

```text
GAME002_STAGE_SIZE = 1125 x 2000
GAME002_ASSET_SIZE.background = 1125 x 2000
GAME002_BOARD_FRAME = x=200, y=330, width=720, height=1080
GAME002_REEL_COUNT = 6
GAME002_VISIBLE_ROWS = 9
GAME002_CELL_SIZE = 120
```

当前 `apps/game002/src/game-adapter.ts` 事实：

- 背景导入为 `../../../assets/game002/bg.jpg?url`。
- Pixi `Application.init()` 使用 `width=1125,height=2000`。
- `context.gameLayer.replaceChildren(app.canvas)`。
- 背景 sprite 放在 `0,0`。
- reels layer 直接放到 app stage，位置来自 `GAME002_BOARD_FRAME`。
- `loadTextureWithSize("bg.jpg", ..., { width: 1125, height: 2000 })` 会 fail-fast 校验背景尺寸。

当前 `apps/game002/src/styles.css` 事实：

```css
.slot-ui-game-layer canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

这表示 canvas CSS 会跟随 `.slot-ui-game-layer` 拉伸，但当前 Pixi backing size 仍是固定 `1125 x 2000`。

### 3.2 uiframeworks 当前布局

当前关键文件：

```text
packages/uiframeworks/src/layout.ts
packages/uiframeworks/src/dom.ts
packages/uiframeworks/src/types.ts
packages/uiframeworks/tests/layout.test.ts
packages/uiframeworks/tests/dom.test.ts
packages/uiframeworks/README.md
```

当前 `uiframeworks` 只支持固定 `designSize` 等比缩放：

```text
calculateFrameScale(viewportWidth, viewportHeight, designSize)
  = min(viewportWidth / designSize.width, viewportHeight / designSize.height)
```

`createSlotUiDom()` 创建固定宽高 `.slot-ui-frame`，在 resize 时只调用 `applyFrameScale(frame, root, designSize)`，不会动态改变提交给 canvas 的逻辑宽高，也没有 `2000 x 2000` 上限和 focus-rect 策略。

当前 `.slot-ui-page` 已是黑色背景、`overflow: clip`，可以作为极端宽屏黑边页面的基础。

### 3.3 gameframeworks 当前边界

当前关键文件：

```text
packages/gameframeworks/src/types.ts
packages/gameframeworks/src/ui-adapter.ts
packages/gameframeworks/src/framework.ts
packages/gameframeworks/tests/render-nonblocking.test.ts
packages/gameframeworks/README.md
```

`gameframeworks` 负责把 `createSlotGameFramework({ designSize })` 传给 `uiframeworks`，并把 `frame`、`gameLayer`、`overlay` 给 `SlotGameAdapter.mount(context)`。

当前 `SlotGameMountContext` 没有 viewport snapshot，也没有 resize 订阅能力。因此本任务如果要让 canvas backing size 跟随逻辑 frame 变化，必须在 `gameframeworks` 和 `uiframeworks` 之间新增清晰的、可测试的 viewport 事件边界。

### 3.4 rendercore 当前能力

当前关键文件：

```text
packages/rendercore/src/index.ts
packages/rendercore/src/reel/index.ts
packages/rendercore/src/reel/layout.ts
packages/rendercore/README.md
```

`rendercore` 已拥有 symbol、普通 reel、grid-cell reel 等可复用 Pixi slot 渲染能力，但还没有“最大 art 空间 + focus rect + 可见裁切区域”的通用适配 helper。

本任务新增的游戏内部适配能力应放在 `rendercore`，不要写成 `game002` 私有函数。

## 4. 设计合同

### 4.1 art 坐标和旧坐标映射

`game002` 新的最大美术空间：

```text
GAME002_ART_SIZE = 2000 x 2000
GAME002_FULL_BACKGROUND = assets/game002/bgfull.jpg
```

旧实现参考坐标：

```text
GAME002_REFERENCE_SIZE = 1125 x 2000
GAME002_REFERENCE_VISIBLE_RECT_IN_ART = x=(2000 - 1125) / 2, y=0, width=1125, height=2000
```

初始计算值：

```text
GAME002_REFERENCE_VISIBLE_RECT_IN_ART.x = 437.5
GAME002_REFERENCE_VISIBLE_RECT_IN_ART.y = 0
```

旧转轮区：

```text
x=200, y=330, width=720, height=1080
```

映射到新 `2000 x 2000` art 坐标后的初始目标：

```text
GAME002_BOARD_FRAME_IN_ART.x = 200 + 437.5 = 637.5
GAME002_BOARD_FRAME_IN_ART.y = 330
GAME002_BOARD_FRAME_IN_ART.width = 720
GAME002_BOARD_FRAME_IN_ART.height = 1080
```

验收要求：

- 在 `1125 x 2000` portrait crop 下，board 回到屏幕内 `x=200,y=330,width=720,height=1080`。
- 如果视觉或像素检查证明 `bgfull.jpg` 与 `bg.jpg` 不是精确居中裁切关系，可以把 `437.5` 调整为显式校准常量，但必须同步测试、README 和任务报告。
- 不允许在 runtime 中自动猜测偏移、自动吸附棋盘、自动微调坐标；坐标漂移要尽早暴露。

### 4.2 rendercore 负责的游戏视口策略

新增 rendercore 通用 helper，建议路径：

```text
packages/rendercore/src/viewport/focused-art-viewport.ts
packages/rendercore/src/viewport/index.ts
packages/rendercore/tests/viewport/focused-art-viewport.test.ts
```

同步调整：

```text
packages/rendercore/src/index.ts
packages/rendercore/package.json
packages/rendercore/README.md
```

如果需要子路径导出，建议新增：

```json
"./viewport": {
  "types": "./dist/viewport/index.d.ts",
  "import": "./dist/viewport/index.js"
}
```

建议公开类型和 API：

```ts
export interface RenderViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface RenderViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FocusedArtViewportOptions {
  readonly artSize: RenderViewportSize;
  readonly viewportSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
  readonly minMargin?: {
    readonly left?: number;
    readonly right?: number;
    readonly top?: number;
    readonly bottom?: number;
  };
}

export interface FocusedArtViewport {
  readonly artSize: RenderViewportSize;
  readonly viewportSize: RenderViewportSize;
  readonly visibleRect: RenderViewportRect;
  readonly worldOffset: { readonly x: number; readonly y: number };
  readonly focusRectInViewport: RenderViewportRect;
}

export function calculateFocusedArtViewport(
  options: FocusedArtViewportOptions,
): FocusedArtViewport;

export function mapReferenceRectToArt(options: {
  readonly artSize: RenderViewportSize;
  readonly referenceSize: RenderViewportSize;
  readonly referenceRect: RenderViewportRect;
  readonly align?: "center";
}): RenderViewportRect;
```

`calculateFocusedArtViewport()` 语义：

- `artSize` 是完整背景 / 最大设计空间，例如 `2000 x 2000`。
- `viewportSize` 是 uiframeworks 决定提交给 canvas 的逻辑尺寸，必须 `width <= artSize.width` 且 `height <= artSize.height`。
- `focusRect` 是需要尽量最大、居中、完整保留的游戏关键区域，例如转轮区。
- helper 返回 `visibleRect`，表示 canvas 当前应该显示 `artSize` 中的哪块区域。
- `visibleRect` 默认以 `focusRect` 中心为中心，再 clamp 到 art 边界内。
- `worldOffset = { x: -visibleRect.x, y: -visibleRect.y }`，游戏可以把完整 art world container 移动到该 offset。
- `focusRectInViewport = focusRect - visibleRect`，用于测试和诊断。
- 如果 `viewportSize` 无法容纳 `focusRect + minMargin`，必须抛错，不允许静默裁掉转轮区。
- 如果 `focusRect` 超出 `artSize`、尺寸非法、viewport 非法，必须抛错。

关键期望：

```text
artSize = 2000 x 2000
focusRect = x=637.5, y=330, width=720, height=1080
minMargin = left/right/top/bottom 60
```

必须通过以下 case：

```text
viewportSize 1125 x 2000
visibleRect  x=437.5, y=0,   width=1125, height=2000
focus in viewport => x=200, y=330, width=720, height=1080
```

```text
viewportSize 1200 x 1200
visibleRect  x=397.5, y=270, width=1200, height=1200
focus in viewport => x=240, y=60, width=720, height=1080
```

```text
viewportSize 2000 x 1200
visibleRect  x=0, y=270, width=2000, height=1200
focus in viewport => x=637.5, y=60, width=720, height=1080
```

这三个 case 分别覆盖当前 portrait、square、极端 landscape 的核心合同。

### 4.3 uiframeworks 负责的页面 frame 策略

新增 uiframeworks 通用 helper，建议在现有 layout/dom 边界内实现：

```text
packages/uiframeworks/src/layout.ts
packages/uiframeworks/src/dom.ts
packages/uiframeworks/src/types.ts
packages/uiframeworks/tests/layout.test.ts
packages/uiframeworks/tests/dom.test.ts
packages/uiframeworks/README.md
```

新增或扩展类型，建议命名：

```ts
export interface SlotUiFocusFramePolicy {
  readonly mode: "focus";
  readonly maxDesignSize: SlotUiDesignSize;
  readonly preferredPortraitSize: SlotUiDesignSize;
  readonly focusRect: {
    readonly width: number;
    readonly height: number;
  };
  readonly minFocusMargin?: {
    readonly left?: number;
    readonly right?: number;
    readonly top?: number;
    readonly bottom?: number;
  };
}

export type SlotUiFramePolicy =
  | { readonly mode: "fixed" }
  | SlotUiFocusFramePolicy;

export interface SlotUiViewportSnapshot {
  readonly pageSize: SlotUiDesignSize;
  readonly frameDesignSize: SlotUiDesignSize;
  readonly scale: number;
  readonly cssSize: SlotUiDesignSize;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function calculateSlotUiFrameViewport(options: {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly designSize: SlotUiDesignSize;
  readonly policy?: SlotUiFramePolicy;
}): SlotUiViewportSnapshot;
```

默认不传 `policy` 或 `mode: "fixed"` 时，必须保持当前行为，避免影响 `game001` 和其它调用方。

`mode: "focus"` 的建议算法：

```text
rawAspect = viewportWidth / viewportHeight
minFocusWidth = focusRect.width + margin.left + margin.right
minFocusHeight = focusRect.height + margin.top + margin.bottom
portraitAspect = preferredPortraitSize.width / preferredPortraitSize.height
maxWideAspect = maxDesignSize.width / minFocusHeight

if rawAspect <= portraitAspect:
  frameDesignHeight = maxDesignSize.height
  frameDesignWidth = clamp(maxDesignSize.height * rawAspect, minFocusWidth, preferredPortraitSize.width)
else if rawAspect >= maxWideAspect:
  frameDesignWidth = maxDesignSize.width
  frameDesignHeight = minFocusHeight
else:
  frameDesignHeight = max(minFocusHeight, minFocusWidth / rawAspect)
  frameDesignWidth = frameDesignHeight * rawAspect

frameDesignWidth/Height 最终必须：
  > 0
  <= maxDesignSize
  >= minFocusWidth/minFocusHeight
```

`scale` 使用：

```text
scale = min(viewportWidth / frameDesignWidth, viewportHeight / frameDesignHeight)
```

CSS frame 居中：

```text
cssSize.width = frameDesignWidth * scale
cssSize.height = frameDesignHeight * scale
offsetX = (viewportWidth - cssSize.width) / 2
offsetY = (viewportHeight - cssSize.height) / 2
```

页面层要求：

- `.slot-ui-page` 继续 `width:100%; height:100%; background:#000; overflow:clip`。
- `.slot-ui-frame` 由 helper 输出的 `frameDesignSize` 设置逻辑宽高。
- transform 使用 `translate(offsetX, offsetY) scale(scale)` 或等价方案。
- frame transform origin 建议改成 `top left`，避免 offset 和 scale 混在 `top center` 语义里难以测试。
- frame 之外的空间保持黑色。
- 如果真实页面大于 `2000 x 2000`，提交给 canvas / adapter 的 `frameDesignSize` 仍不得超过 `2000 x 2000`。
- 不允许把 `3000 x 1200`、`3000 x 3000` 这类真实页面尺寸直接传给 canvas。

`game002` focus policy 初始配置：

```text
maxDesignSize = 2000 x 2000
preferredPortraitSize = 1125 x 2000
focusRect = 720 x 1080
minFocusMargin = 60,60,60,60
```

必须通过以下 uiframeworks case：

```text
viewport 1125 x 2000 => frameDesignSize 1125 x 2000
viewport 1200 x 1200 => frameDesignSize 1200 x 1200
viewport 3000 x 1200 => frameDesignSize 2000 x 1200, css frame 居中，页面左右黑边
viewport 375 x 812   => frameDesignSize 约 924 x 2000，focus 不被裁掉
```

如果实现者调整 `minFocusMargin` 或算法细节，必须保证上述语义不变，并同步测试期望和报告说明。

### 4.4 gameframeworks 透传和 resize 边界

`game002` 生产代码不直接引用 `@slotclientengine/uiframeworks`，所以 `gameframeworks` 需要把新增 frame policy 透传出去。

建议修改：

```text
packages/gameframeworks/src/types.ts
packages/gameframeworks/src/ui-adapter.ts
packages/gameframeworks/src/framework.ts
packages/gameframeworks/src/index.ts
packages/gameframeworks/tests/framework-flow.test.ts
packages/gameframeworks/tests/render-nonblocking.test.ts
packages/gameframeworks/README.md
```

建议公共 API：

```ts
export interface SlotGameViewportSnapshot {
  readonly pageSize: { readonly width: number; readonly height: number };
  readonly frameDesignSize: { readonly width: number; readonly height: number };
  readonly scale: number;
  readonly cssSize: { readonly width: number; readonly height: number };
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface SlotGameMountContext {
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
  getState(): SlotGameStateSnapshot;
  getViewport(): SlotGameViewportSnapshot;
  onViewportChange(
    listener: (viewport: SlotGameViewportSnapshot) => void,
  ): () => void;
}
```

`onViewportChange()` 返回 unsubscribe 函数。adapter `destroy()` 时必须调用 unsubscribe，避免 resize listener 泄漏。

`SlotGameFrameworkOptions` 建议新增：

```ts
readonly framePolicy?: SlotGameFramePolicy;
```

`SlotGameFramePolicy` 可以在 gameframeworks 中定义同构类型，或从 uiframeworks 重新导出 type，但 app 侧 import 仍来自 `@slotclientengine/gameframeworks`。

要求：

- 不传 `framePolicy` 时，`game001` 等现有 app 行为不变。
- `framePolicy` 只影响 DOM frame / canvas 逻辑尺寸，不改变 live、spin、collect、money、state 语义。
- resize 事件不能阻塞 connect/spin。
- viewport listener 中抛错时，要让错误进入框架 error 路径或 adapter 显式失败，不能吞掉。

### 4.5 game002 集成方式

修改：

```text
apps/game002/src/main.ts
apps/game002/src/game-adapter.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-layout.ts
apps/game002/src/styles.css
apps/game002/tests/game-layout.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/README.md
```

`apps/game002/src/game-layout.ts` 目标常量：

```ts
export const GAME002_ART_SIZE = Object.freeze({
  width: 2000,
  height: 2000,
});

export const GAME002_REFERENCE_SIZE = Object.freeze({
  width: 1125,
  height: 2000,
});

export const GAME002_REFERENCE_VISIBLE_RECT_IN_ART = Object.freeze({
  x: 437.5,
  y: 0,
  width: 1125,
  height: 2000,
});

export const GAME002_BOARD_FRAME_IN_REFERENCE = Object.freeze({
  x: 200,
  y: 330,
  width: 720,
  height: 1080,
});

export const GAME002_BOARD_FRAME = Object.freeze({
  x: 637.5,
  y: 330,
  width: 720,
  height: 1080,
});

export const GAME002_FOCUS_MARGIN = Object.freeze({
  left: 60,
  right: 60,
  top: 60,
  bottom: 60,
});
```

可保留旧 `GAME002_STAGE_SIZE` 作为 alias，但建议改名为 `GAME002_ART_SIZE`，避免后续误解“stage size 等于当前 canvas size”。如果保留 alias，README 和测试必须说明：

```text
GAME002_ART_SIZE 是完整背景坐标系。
当前 canvas/frame 逻辑尺寸由 uiframeworks framePolicy 动态计算。
```

`createGame002Layout(viewportSize)` 应调用 `calculateFocusedArtViewport()`，返回：

- `artSize`
- `viewportSize`
- `visibleRect`
- `worldOffset`
- `backgroundFrame`
- `boardFrame` in art coordinates
- `boardFrameInViewport`

`createGame002ReelLayerLayout()` 应继续用 `boardFrame` 的 art 坐标，把 reels layer 放在完整 art world 内，而不是放在已经裁切后的 viewport 坐标里。

`apps/game002/src/game-adapter.ts` 修改目标：

- 背景 URL 改为：

```ts
import backgroundUrl from "../../../assets/game002/bgfull.jpg?url";
```

- 背景尺寸校验改为：

```text
bgfull.jpg size must be 2000 x 2000
```

- Pixi app 初始化尺寸使用 `context.getViewport().frameDesignSize`，不是固定 `1125 x 2000`。
- 增加 world container：

```text
app.stage
  worldLayer
    background sprite at 0,0
    grid-cell reels layer at boardFrame art x/y
```

- 初始 mount 后调用 `applyViewport(context.getViewport())`：
  - `app.renderer.resize(frameDesignSize.width, frameDesignSize.height)` 或 Pixi v8 等价 API。
  - `worldLayer.position.set(worldOffset.x, worldOffset.y)`。
  - canvas DOM 仍由 uiframeworks 控制 CSS 尺寸。
- 订阅 `context.onViewportChange(applyViewport)`。
- `destroy()` 必须 unsubscribe，并清理 canvas/ticker/app。
- 如果收到非法 viewport 或 rendercore helper 抛错，adapter 进入显式失败，不切 fallback。

`apps/game002/src/main.ts` 修改目标：

- 继续使用 `createSlotGameFramework()`。
- 继续传 `createGame002Adapter()`、live config、money formatter。
- 新增 `framePolicy`，使用 `GAME002_ART_SIZE`、`GAME002_REFERENCE_SIZE`、`GAME002_BOARD_FRAME`、`GAME002_FOCUS_MARGIN` 等配置。
- 不直接 import `@slotclientengine/uiframeworks`。

`apps/game002/src/styles.css` 修改目标：

- 保留 body/root 黑色背景。
- 保留 canvas `display:block;width:100%;height:100%`。
- 不复制 HUD 或 frame 缩放 CSS；frame 缩放属于 `uiframeworks`。

## 5. 明确非目标

- 不修改 `game002` 的 live URL、token、gamecode、bet、lines、times、autonums 默认值。
- 不修改 `gameframeworks` 的 spin、presenting、collect、money 或 live session 语义。
- 不在 `game002` 直接依赖 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore`。
- 不在 `game002` 私有实现通用 viewport/canvas/frame 适配算法。
- 不把 game002 的资源路径、symbol 名或 `6 x 9` 常量写死到 `rendercore` 或 `uiframeworks` 的通用算法里。
- 不增加 mock/replay/local scene fallback。
- 不自动猜测背景 offset、棋盘位置或资源尺寸。
- 不为了让测试好写而改变生产语义；如果是测试导致奇怪写法，就修改测试，不要改不该改的东西。
- 不把真实页面尺寸大于 `2000 x 2000` 的 viewport 直接提交给 Pixi canvas backing size。

## 6. 实施步骤

### 6.1 准备和资源确认

执行：

```bash
git status --short --untracked-files=all
sips -g pixelWidth -g pixelHeight assets/game002/bg.jpg
sips -g pixelWidth -g pixelHeight assets/game002/bgfull.jpg
```

确认：

- `assets/game002/bgfull.jpg` 存在。
- `bgfull.jpg` 是 `2000 x 2000`。
- 不回滚 `assets/game002/bg.jpg` 的用户修改。

如果本机没有 `sips`，可使用等价图片尺寸工具，但任务报告必须记录实际命令。

### 6.2 实现 rendercore viewport helper

新增 `packages/rendercore/src/viewport/*`。

测试先行覆盖：

- `mapReferenceRectToArt()` 居中映射。
- `calculateFocusedArtViewport()` portrait/square/landscape 三个关键 case。
- `viewportSize` 大于 `artSize` 抛错。
- `focusRect` 超出 `artSize` 抛错。
- `viewportSize` 无法容纳 `focusRect + minMargin` 抛错。
- 非正数、`NaN`、`Infinity` 抛错。

同步导出：

```text
packages/rendercore/src/index.ts
packages/rendercore/src/viewport/index.ts
packages/rendercore/package.json
```

同步 README，说明：

- art coordinates。
- focus rect。
- visible rect。
- world offset。
- fail-fast 边界。
- `game002` 只是一个调用方，不是算法来源。

### 6.3 实现 uiframeworks frame policy

扩展 `packages/uiframeworks/src/layout.ts`：

- 保留 `calculateFrameScale()` 原行为。
- 新增 `calculateSlotUiFrameViewport()`。
- 默认 fixed policy 完全兼容旧行为。
- focus policy 按第 4.3 节计算动态 `frameDesignSize`、`scale`、`offsetX`、`offsetY`。

扩展 `packages/uiframeworks/src/dom.ts`：

- `createSlotUiDom()` 接受 `framePolicy`。
- resize 时重新计算 viewport snapshot。
- 当 `frameDesignSize` 改变时，同步更新 `.slot-ui-frame` 宽高和 CSS variables。
- 暴露 `getViewport()`。
- 支持 `onViewportChange(listener)`，并在 destroy 时清理所有 listener 和 window resize listener。

扩展 `packages/uiframeworks/src/types.ts` 和 `src/index.ts` 导出 type/API。

测试覆盖：

- fixed policy 与当前 `applyFrameScale()` 行为一致。
- focus policy case：
  - `1125 x 2000 => 1125 x 2000`
  - `1200 x 1200 => 1200 x 1200`
  - `3000 x 1200 => 2000 x 1200`，offsetX 大于 0，左右黑边。
  - `375 x 812 => frameDesignSize.width` 约等于 `924`，height 为 `2000`，不小于 focus min width。
- resize 后 viewport listener 收到新 snapshot。
- destroy 后 resize 不再通知 listener。
- 非法 policy 显式抛 `SlotUiConfigError`。

README 更新：

- 说明默认 fixed 行为。
- 说明 focus frame policy 用于游戏画面优先的 canvas cap。
- 说明页面可以大于 `maxDesignSize`，但提交给 canvas 的逻辑尺寸有上限。

### 6.4 gameframeworks 透传 frame policy

修改 `packages/gameframeworks`：

- `SlotGameFrameworkOptions` 新增 `framePolicy`。
- `SlotGameUiAdapterOptions` 新增 `framePolicy`。
- `SlotGameUiAdapter` 从 uiframeworks controller 获取 viewport snapshot 和订阅能力。
- `SlotGameMountContext` 新增 `getViewport()` 和 `onViewportChange()`。
- `createSlotGameFramework()` mount adapter 时传入这些能力。
- `SlotGameStateSnapshot` 不需要强行塞入动态 frameDesignSize，除非 UI state 已经依赖它；如果加入，必须同步所有 state tests。

测试覆盖：

- 不传 `framePolicy` 时旧测试通过，初始渲染仍非阻塞。
- 传 focus policy 时 mock adapter 在 mount 中可读到 `context.getViewport().frameDesignSize`。
- mock adapter 订阅 viewport change 后，root 尺寸变化会收到通知。
- framework destroy 后 viewport listener 不再触发。
- adapter 的 viewport listener 抛错时不要静默吞掉；需要进入可诊断错误路径。

README 更新：

- `createSlotGameFramework()` 增加 `framePolicy` 示例。
- 说明 app 应通过 gameframeworks 传 policy，不直接依赖 uiframeworks。

### 6.5 game002 改用 bgfull 和动态 viewport

修改 `apps/game002/src/game-layout.ts`：

- 引入 `GAME002_ART_SIZE`、`GAME002_REFERENCE_SIZE`、`GAME002_REFERENCE_VISIBLE_RECT_IN_ART`、`GAME002_BOARD_FRAME_IN_REFERENCE`、`GAME002_BOARD_FRAME`、`GAME002_FOCUS_MARGIN`。
- 使用 rendercore helper 计算 board 映射和 visible rect。
- 更新 `validateGame002BoardFrame()`，验证 board 在 `2000 x 2000` art 内，且仍为 `6 * 120` by `9 * 120`。
- 更新 `createGame002Layout(viewportSize)`。

修改 `apps/game002/src/game-demo.ts`：

- 确保 grid-cell reel layer 使用 art 坐标 board frame。
- 保持 `6 x 9`、`120 x 120`、grid-cell order/timing/dimming 不变。
- 不把 viewport 裁切逻辑写到 game-demo runtime 内。

修改 `apps/game002/src/game-adapter.ts`：

- 导入 `bgfull.jpg?url`。
- 校验 `bgfull.jpg` 为 `2000 x 2000`。
- Pixi init 使用初始 `frameDesignSize`。
- 增加 world container 和 viewport apply。
- resize 时调用 renderer resize 和 world offset 更新。
- destroy 时清理 viewport unsubscribe。

修改 `apps/game002/src/main.ts`：

- `designSize` 可以保留为 `GAME002_REFERENCE_SIZE` 或改用 `GAME002_ART_SIZE`，但真正动态 frame 必须来自 `framePolicy`。
- 建议传：

```ts
framePolicy: createGame002FramePolicy(),
```

其中 `createGame002FramePolicy()` 可以放在 `game-layout.ts`，返回 gameframeworks 接受的纯数据对象。

修改 `apps/game002/README.md`：

- 数据来源改为 `assets/game002/bgfull.jpg`。
- 说明 `bg.jpg` 是旧 portrait 参考，不再是运行时背景。
- 说明 art size `2000 x 2000`。
- 说明旧 `1125 x 2000` 坐标映射规则。
- 说明不同 viewport 的期望：
  - portrait 类似旧实现，水平居中。
  - square 不使用完整 `2000 x 2000`，而是裁切到 focus 周围，让转轮区更大。
  - ultra-wide 如 `3000 x 1200`，canvas 逻辑尺寸为 `2000 x 1200` 并水平居中，外侧黑色页面背景。

### 6.6 agents.md 同步

本任务会新增长期协作规则：`rendercore` 拥有游戏内部 focus/art viewport 算法，`uiframeworks` 拥有 DOM frame/canvas cap 适配算法。因此需要更新根目录：

```text
agents.md
```

建议新增或扩展现有规则：

```text
- `packages/rendercore` 拥有 Pixi 游戏内部的 art-size、focus-rect、visible-viewport 适配算法；游戏 app 只能配置 art 尺寸、focus 区域和资源，不要在 app 内复制通用裁切、居中或可见区域策略。
- `packages/uiframeworks` 拥有页面 DOM frame、canvas 逻辑尺寸上限、黑边居中和 viewport resize 适配；游戏 app 不要直接用 CSS/DOM 私有逻辑绕过 framework 的 frame policy。
```

如果最终实现没有新增长期规则，任务报告必须解释为什么未更新。但按本计划执行，预计需要更新。

## 7. 测试计划

### 7.1 rendercore 测试

新增：

```text
packages/rendercore/tests/viewport/focused-art-viewport.test.ts
```

覆盖：

- `mapReferenceRectToArt()` 将旧 board 映射为 `x=637.5,y=330,width=720,height=1080`。
- portrait `1125 x 2000` case。
- square `1200 x 1200` case。
- landscape `2000 x 1200` case。
- clamp 到 art 边界。
- focus + margin 无法放入 viewport 时显式失败。
- 非法数值显式失败。

### 7.2 uiframeworks 测试

更新：

```text
packages/uiframeworks/tests/layout.test.ts
packages/uiframeworks/tests/dom.test.ts
```

覆盖：

- fixed policy 保持原来的 `calculateFrameScale()` 结果。
- focus policy 四个关键 viewport。
- `.slot-ui-page` 仍是黑色背景和 `overflow: clip`。
- `.slot-ui-frame` 宽高会根据 `frameDesignSize` 更新。
- resize listener 会派发 viewport snapshot。
- destroy 后 listener 清理。
- 非法 policy 抛 `SlotUiConfigError`。

### 7.3 gameframeworks 测试

更新：

```text
packages/gameframeworks/tests/render-nonblocking.test.ts
packages/gameframeworks/tests/framework-flow.test.ts
packages/gameframeworks/tests/test-helpers.ts
```

覆盖：

- 不传 `framePolicy` 时现有行为不变。
- 传 `framePolicy` 时 adapter mount 能拿到初始 viewport。
- resize 后 adapter listener 收到 viewport。
- destroy 后 listener 不再收到 viewport。
- viewport 变化不影响 spin/presenting/collect 时序。

### 7.4 game002 测试

更新：

```text
apps/game002/tests/game-layout.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/tests/assets.test.ts
```

覆盖：

- `GAME002_ART_SIZE = 2000 x 2000`。
- `GAME002_REFERENCE_SIZE = 1125 x 2000`。
- `GAME002_BOARD_FRAME_IN_REFERENCE = x=200,y=330,width=720,height=1080`。
- `GAME002_BOARD_FRAME = x=637.5,y=330,width=720,height=1080`。
- `bgfull.jpg` 尺寸校验为 `2000 x 2000`。
- `game-adapter.ts` 使用 `bgfull.jpg?url`，不再使用 `bg.jpg?url`。
- adapter mount 时 Pixi init 使用 `context.getViewport().frameDesignSize`。
- viewport 变化时 renderer resize 被调用，world offset 按 rendercore helper 更新。
- `1125 x 2000` viewport 下 board 回到旧屏幕位置 `x=200,y=330`。
- `1200 x 1200` viewport 下 board 大且居中，`y=60`。
- `2000 x 1200` viewport 下 board `y=60`，不被裁切。
- source-boundary 继续禁止 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore` 进入 `apps/game002` 源码。
- grid-cell reel order/timing/dimming 原合同不变。

如果测试需要 fake Pixi application，fake interface 应增加最小必要的 renderer resize 能力，不要为了测试把生产 adapter 改成奇怪结构。

## 8. 验收命令

局部验收：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/uiframeworks lint
pnpm --filter @slotclientengine/uiframeworks format:check
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter @slotclientengine/uiframeworks typecheck
pnpm --filter @slotclientengine/uiframeworks build
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks format:check
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
pnpm --filter game002 lint
pnpm --filter game002 format:check
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
```

仓库级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short --untracked-files=all
```

如果仓库级命令失败，必须区分：

- 本任务引入的问题：必须修复。
- 既有无关问题：记录精确失败包、命令和错误摘要，不要通过改本任务生产逻辑来掩盖。

## 9. 浏览器验收

启动：

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

打开：

```text
http://127.0.0.1:5206/
```

至少验收以下 viewport。可以通过浏览器 devtools、Playwright 或 Codex in-app browser 调整窗口大小：

```text
390 x 844      常见手机竖屏
1125 x 2000    旧 portrait 合同
1200 x 1200    square
1920 x 1080    常见桌面横屏
3000 x 1200    极端宽屏
3000 x 3000    大 square 页面
```

每个 viewport 必须确认：

- 第一屏仍是游戏，不是 landing page。
- console 没有资源加载错误、尺寸错误、viewport policy 错误、未捕获 Promise 错误。
- 背景来自 `bgfull.jpg`。
- 转轮区完整可见，没有被裁掉。
- symbol 仍在 `6 x 9`、`120 x 120` grid-cell 中对齐。
- portrait 下视觉接近旧 `1125 x 2000`，board 屏幕内位置回到旧相对位置。
- square 下不是显示完整 `2000 x 2000` 背景，而是让中间转轮区尽可能大。
- `3000 x 1200` 下提交给 canvas 的逻辑 frame 是 `2000 x 1200`，canvas/frame 水平居中，左右多余页面为黑色背景。
- 大于 `2000 x 2000` 的页面不会把超过 `2000 x 2000` 的逻辑尺寸传给 Pixi。
- 点击 Spin 后仍能完成 grid-cell spin；完成后 HUD 回 idle。

如果 live 服务不可用，不能切到本地 fallback。报告中记录 live 错误，并用单测或 fake client 证明 adapter / viewport / spin 边界。

## 10. 文档同步

必须更新：

```text
packages/rendercore/README.md
packages/uiframeworks/README.md
packages/gameframeworks/README.md
apps/game002/README.md
agents.md
```

文档至少写清：

- `rendercore` 的 art/focus viewport API 和 fail-fast 边界。
- `uiframeworks` 的 frame policy、canvas cap、黑边居中和 resize 派发。
- `gameframeworks` 如何把 frame policy 传给 app，并给 adapter 提供 viewport snapshot。
- `game002` 的 `bgfull.jpg`、`2000 x 2000` art 坐标、旧坐标映射和不同设备验收 case。

## 11. 严格验收清单

实现完成前逐项检查：

- [ ] `assets/game002/bgfull.jpg` 被作为运行时背景，尺寸校验为 `2000 x 2000`。
- [ ] `apps/game002/src/game-adapter.ts` 不再引用 `bg.jpg?url`。
- [ ] 旧 `1125 x 2000` board 坐标正确映射到 `2000 x 2000` art 坐标。
- [ ] `rendercore` 提供通用 art/focus viewport helper，且不包含 game002 资源路径。
- [ ] `uiframeworks` 提供通用 frame policy，默认 fixed 行为不回归。
- [ ] `gameframeworks` 透传 frame policy，并给 adapter 提供初始 viewport 和 resize 订阅。
- [ ] `game002` 不直接依赖 `@slotclientengine/uiframeworks`。
- [ ] canvas/Pixi backing 逻辑尺寸永远不超过 `2000 x 2000`。
- [ ] square viewport 不使用完整 `2000 x 2000` 画面，而是让转轮区更大。
- [ ] ultra-wide viewport 如 `3000 x 1200` 使用 `2000 x 1200` 逻辑 frame，页面黑边居中。
- [ ] `6 x 9`、`120 x 120`、grid-cell reel order/timing/dimming 旧合同不回归。
- [ ] 没有 mock/replay/local scene fallback。
- [ ] 没有自动猜测坐标、自动补资源或静默降级。
- [ ] 如果测试导致奇怪写法，已修改测试而不是破坏生产语义。
- [ ] README 和 `agents.md` 已同步。
- [ ] 局部验收命令通过。
- [ ] 仓库级验收命令通过，或报告记录明确的无关既有失败。
- [ ] 浏览器多 viewport 验收完成并记录。
- [ ] 已写中文任务报告 `tasks/51-game002-responsive-adaptation-[utctime].md`。

## 12. 二次遗漏检查

提交最终结果前再做一次语义检查：

1. 搜索 `apps/game002` 是否还引用 `bg.jpg?url`。
2. 搜索 `apps/game002` 是否直接引用 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore`。
3. 检查 `GAME002_STAGE_SIZE` 是否被误用为动态 canvas size；如保留 alias，文档是否说明清楚。
4. 检查 `bgfull.jpg` 尺寸错误时是否明确失败。
5. 检查旧坐标映射是否被测试锁定。
6. 检查 rendercore helper 是否覆盖 portrait、square、landscape 三个关键 case。
7. 检查 uiframeworks focus policy 是否覆盖 `3000 x 1200` 和大于 `2000 x 2000` 的页面。
8. 检查 gameframeworks viewport listener 是否 destroy 清理。
9. 检查 game002 adapter resize 后是否只 resize Pixi renderer 和移动 world container，没有重建 live/framework。
10. 检查 grid-cell spin 完成边界没有因 resize 变化提前 resolve。
11. 检查文档是否足够让下一位执行者不看聊天也能理解。
12. 检查 `agents.md` 是否同步长期归属规则。
13. 检查没有提交 `dist/`、`coverage/`、`.turbo/`、临时截图、dev server 输出等生成物。
14. 检查任务报告是否包含命令结果、浏览器 viewport 结果、`agents.md` 处理结论、`pnpm-lock.yaml` 是否变化和最终 `git status` 摘要。

## 13. 任务报告模板

任务完成后新增：

```text
tasks/51-game002-responsive-adaptation-[utctime].md
```

报告必须用中文，至少包含：

```text
# 51-game002-responsive-adaptation 执行报告

- 报告时间：YYMMDD-HHMMSS UTC
- 计划文件：tasks/51-game002-responsive-adaptation.md
- 执行结论：完成 / 部分完成 / 阻塞

## 实施范围

列出 rendercore、uiframeworks、gameframeworks、game002、README、agents.md 的实际变更。

## 关键实现说明

说明：
- bgfull.jpg 和 2000 x 2000 art 坐标。
- 旧 1125 x 2000 坐标映射。
- rendercore visibleRect / worldOffset。
- uiframeworks framePolicy / canvas cap / 黑边居中。
- gameframeworks viewport context。
- game002 adapter resize 和 world container。

## 验收记录

逐条记录第 8 节所有命令结果。

## 浏览器验收

记录 dev server URL、每个 viewport 的观察结论、console 状态、是否完成 spin。

## agents.md

说明是否更新以及更新内容。

## pnpm-lock.yaml

说明是否变化；如果变化，说明原因。

## 风险与后续

只写真实残留风险，不写泛泛建议。

## 最终状态

记录最终 git status 摘要。
```
