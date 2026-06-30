# game003 anchor layout adaptation 任务计划

## 1. 任务目标

本任务优化 `apps/game003` 的横竖屏适配和画面部件定位方式，让主转轴区不再依赖运行时代码里根据传送带尺寸、间距和摆放枚举推导出来的位置，而是由静态配置显式声明它相对背景图重点区域的位置。

当前 `game003` 已经使用 `packages/rendercore` 的 `calculateResponsiveArtViewport(...)` 选择横版/竖版 art variant，并用 `focusRect` 计算 `visibleRect`、`worldOffset` 和 `focusRectInViewport`。本任务在这个基础上引入一个明确合同：

- `focusRect` 继续表示背景图上的重点区域，也作为本任务讨论中的“虚拟区块”。
- `focusRect` 与背景图固定，坐标相对于当前 variant 的完整背景 art。
- 主转轴背景 `mainreelbg.png`、实际主转轮窗口 `reelWindow`、传送带 `conveyor1/conveyor2` 的位置必须能由“相对 focusRect 的显式配置”算出。
- 横屏和竖屏可以有不同的背景、不同的 `focusRect`、不同的主转轴相对位置、不同的传送带相对位置。
- 大部分游戏可能没有传送带，所以通用能力只能处理“anchor/focus 矩形和子矩形坐标映射”，不能让 `rendercore` 认识 game003 的 conveyor。
- `game003` 的 `mainreelbg.png` / `conveyor1.png` / `conveyor2.png` 组合、10px 视觉间隔、层级和转轮窗口校准仍属于 `apps/game003` 专属 layout / adapter。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成设计、实现、测试、文档同步、协作规则同步、验收和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/65-game003-anchor-layout-adaptation-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/65-game003-anchor-layout-adaptation-260630-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- VS Code 调试运行 TypeScript：`ts-node`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。若确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game003 test
CI=true pnpm --filter @slotclientengine/rendercore test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。缺少 anchor/focus 配置、主转轴位置非法、子矩形越界、生成文件未同步、旧字段仍被运行时代码依赖等问题，都必须尽早暴露。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 当前相关文件

核心适配和布局：

```text
packages/rendercore/src/viewport/focused-art-viewport.ts
packages/rendercore/src/viewport/responsive-art-viewport.ts
packages/rendercore/src/viewport/index.ts
packages/rendercore/README.md
packages/rendercore/tests/viewport/focused-art-viewport.test.ts
packages/rendercore/tests/viewport/responsive-art-viewport.test.ts
apps/game003/src/skin-config.ts
apps/game003/src/game-layout.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/game-layout.test.ts
apps/game003/tests/source-boundary.test.ts
```

静态配置生成链路：

```text
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/buildgamestatic/tests/generator.test.ts
apps/buildgamestatic/tests/cli.test.ts
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/index.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/src/static-config/frame-policy.ts
packages/gameframeworks/tests/static-config.test.ts
```

文档和协作规则：

```text
apps/game003/README.md
apps/buildgamestatic/README.md
packages/gameframeworks/README.md
packages/rendercore/README.md
agents.md
tasks/65-game003-anchor-layout-adaptation.md
```

### 3.2 rendercore 现状

`packages/rendercore/src/viewport/focused-art-viewport.ts` 当前已经提供：

```ts
calculateFocusedArtViewport({
  artSize,
  viewportSize,
  focusRect,
  minMargin,
});

mapArtRectToViewport({
  artSize,
  visibleRect,
  rect,
});
```

`calculateFocusedArtViewport(...)` 的 `focusRect` 已经是完整 art 坐标系里的矩形，会输出：

- `visibleRect`
- `worldOffset`
- `focusRectInViewport`

`mapArtRectToViewport(...)` 能把任意 art-space rect 映射到当前 viewport-space rect。它不关心 rect 是棋盘、按钮、主转轮框还是调试框，这是正确边界。

`packages/rendercore/src/viewport/responsive-art-viewport.ts` 当前已经提供：

```ts
calculateResponsiveArtViewport({
  viewportSize,
  variants: {
    landscape: { artSize, focusRect, minMargin },
    portrait: { artSize, focusRect, minMargin },
  },
});
```

它用 `viewportSize.height > viewportSize.width` 选择 portrait，否则选择 landscape。这个选择规则本任务不改。

### 3.3 game003 现状

当前 `apps/game003/config/game-static.yaml` 中，`skin=1` 的 art 配置包含：

```yaml
art:
  mode: orientation-focus
  scenePartGap: 10
  variants:
    landscape:
      background: { path: assets/game003-s1/bg1.jpg, width: 2000, height: 2000 }
      focusRect: { x: 288, y: 588, width: 1424, height: 824 }
      frameFocusRect: { width: 1424, height: 1061 }
      conveyor:
        path: assets/game003-s1/conveyor1.png
        width: 284
        height: 775
        placement: left-bottom-of-main-reel
    portrait:
      background: { path: assets/game003-s1/bg2.jpg, width: 1174, height: 2000 }
      focusRect: { x: 22, y: 469.5, width: 1130, height: 1061 }
      frameFocusRect: { width: 1130, height: 1061 }
      minFocusMargin: { left: 22, right: 22 }
      conveyor:
        path: assets/game003-s1/conveyor2.png
        width: 934
        height: 227
        placement: top-center-of-main-reel
  mainReelBackground:
    path: assets/game003-s1/mainreelbg.png
    width: 1130
    height: 824
  reelWindowInMainReelBackground:
    x: 135
    y: 87
    width: 860
    height: 650
```

当前 `apps/game003/src/game-layout.ts` 的横版布局大致是：

```text
groupFrame = variant.focusRect
mainReelBackground.x = groupFrame.x + landscapeConveyor.width + scenePartGap
mainReelBackground.y = groupFrame.y
conveyor.x = groupFrame.x
conveyor.y = mainReelBackground.y + mainReelBackground.height - landscapeConveyor.height
reelWindow = reelWindowInMainReelBackground translated by mainReelBackground
focusRegion = groupFrame
```

当前横版最终坐标：

```text
focusRect / groupFrame:
  x=288, y=588, width=1424, height=824

mainReelBackground:
  x=582, y=588, width=1130, height=824

conveyor1:
  x=288, y=637, width=284, height=775

reelWindow:
  x=717, y=675, width=860, height=650
```

当前 `apps/game003/src/game-layout.ts` 的竖版布局大致是：

```text
groupFrame = variant.focusRect
conveyor.x = groupFrame.x + (groupFrame.width - portraitConveyor.width) / 2
conveyor.y = groupFrame.y
mainReelBackground.x = groupFrame.x + (groupFrame.width - mainReelBackground.width) / 2
mainReelBackground.y = groupFrame.y + portraitConveyor.height + scenePartGap
reelWindow = reelWindowInMainReelBackground translated by mainReelBackground
focusRegion = groupFrame
```

当前竖版最终坐标：

```text
focusRect / groupFrame:
  x=22, y=469.5, width=1130, height=1061

mainReelBackground:
  x=22, y=706.5, width=1130, height=824

conveyor2:
  x=120, y=469.5, width=934, height=227

reelWindow:
  x=157, y=793.5, width=860, height=650
```

当前问题不是视觉结果一定错，而是位置合同隐含在运行时代码公式中：

- 主转轴位置由 `conveyor.width + scenePartGap`、`conveyor.height + scenePartGap` 等推导出来，不是静态配置显式合同。
- `conveyor.placement` 是 game003 专属概念，但现在存在于相对通用的静态配置类型中。
- 如果未来只想微调主转轴在背景中的位置，必须改 TS 公式或修改会影响其它部件的 `focusRect`。
- 如果未来某个游戏没有 conveyor，当前配置形态会鼓励把空 conveyor、假 placement 或隐藏 fallback 带进通用链路。

## 4. 设计合同

### 4.1 概念定义

本任务使用以下概念，后续实现和文档必须保持一致：

- `artSize`：当前横版或竖版背景图的完整 art 尺寸。
- `viewportSize`：当前 framework / Pixi 提供的 canvas 逻辑尺寸。
- `focusRect`：背景图上的重点区域；坐标相对于完整 art；本任务中也作为用户提出的“虚拟区块”。
- `anchorRect`：实现层可以把 `focusRect` 作为 anchor 使用；如需命名新 API，可使用 `anchorRect`，但不能在配置里新增第二套与 `focusRect` 重叠且容易漂移的矩形。
- `childRectInAnchor`：某个画面部件相对 `focusRect` 左上角的矩形。
- `childRectInArt`：`childRectInAnchor` 平移到完整 art 坐标后的矩形。
- `childRectInViewport`：`childRectInArt` 经 `visibleRect` 映射后的 viewport 坐标。

主转轴相关矩形必须区分：

- `mainReelBackground`：`assets/game003-s1/mainreelbg.png` 这张背景框图在 art 里的位置。
- `reelWindowInMainReelBackground`：实际 symbol 滚动窗口在 `mainreelbg.png` 内的位置，当前为 `{ x: 135, y: 87, width: 860, height: 650 }`。
- `reelWindow`：实际 symbol 滚动窗口在 art 里的位置，由 `mainReelBackground + reelWindowInMainReelBackground` 得到。

### 4.2 rendercore 边界

`packages/rendercore` 只增加通用几何能力，不能出现以下 game003 专有词：

```text
mainreelbg
mainReelBackground
conveyor
scenePartGap
left-bottom-of-main-reel
top-center-of-main-reel
```

建议在 `packages/rendercore/src/viewport/focused-art-viewport.ts` 或新文件中增加一个通用 helper：

```ts
export interface MapAnchorRectToArtOptions {
  readonly artSize: RenderViewportSize;
  readonly anchorRect: RenderViewportRect;
  readonly rect: RenderViewportRect;
}

export function mapAnchorRectToArt(
  options: MapAnchorRectToArtOptions,
): RenderViewportRect;
```

语义：

- `anchorRect` 是 art-space rect，必须位于 `artSize` 内。
- `rect` 是相对 anchor 左上角的 child rect。
- 返回值为 art-space rect：

```text
x = anchorRect.x + rect.x
y = anchorRect.y + rect.y
width = rect.width
height = rect.height
```

失败边界：

- `artSize` 非正数或非有限数值时失败。
- `anchorRect` 非法或超出 `artSize` 时失败。
- `rect` 非法时失败。
- 映射后的 child rect 超出 `artSize` 时失败。
- 不允许用 clamp、中心对齐、默认 0、默认 focusRect 等方式修复坏配置。

如果实现者认为命名应更清晰，也可以命名为 `mapAnchoredRectToArt(...)` 或 `resolveAnchoredArtRect(...)`，但必须保持上述合同，并在测试和 README 中写清楚。

不要把 `calculateResponsiveArtViewport(...)` 改成知道 child layout。它继续只负责选择 variant 和计算 `visibleRect/worldOffset/focusRectInViewport`。子矩形映射可以由 `game003` 在拿到 `viewport.visibleRect` 后组合：

```ts
const mainReelBackgroundRectInFocusRect = {
  x: variant.mainReelBackgroundPositionInFocusRect.x,
  y: variant.mainReelBackgroundPositionInFocusRect.y,
  width: art.mainReelBackground.width,
  height: art.mainReelBackground.height,
};

const mainReelBackground = mapAnchorRectToArt({
  artSize: viewport.artSize,
  anchorRect: variant.focusRect,
  rect: mainReelBackgroundRectInFocusRect,
});

const mainReelBackgroundInViewport = mapArtRectToViewport({
  artSize: viewport.artSize,
  visibleRect: viewport.visibleRect,
  rect: mainReelBackground,
});
```

### 4.3 静态配置边界

`apps/game003/config/game-static.yaml` 是手工编辑源。修改 YAML 后必须同步生成：

```text
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

当前 `focusRect` 继续保留，且继续作为适配重点区域。不要新增一个与它含义完全相同的 `virtualRect`、`anchorFocusRect` 或第二份重点区域。

建议把当前 `conveyor.placement` 推导改成显式相对坐标。目标 YAML 形态可以按实现命名微调，但必须表达以下数据：

```yaml
art:
  mode: orientation-focus
  variants:
    landscape:
      background:
        path: assets/game003-s1/bg1.jpg
        width: 2000
        height: 2000
      # focusRect 是背景图上的重点区域，也是布局 anchor / 虚拟区块。
      focusRect:
        x: 288
        y: 588
        width: 1424
        height: 824
      frameFocusRect:
        width: 1424
        height: 1061
      mainReelBackgroundPositionInFocusRect:
        x: 294
        y: 0
      conveyor:
        path: assets/game003-s1/conveyor1.png
        width: 284
        height: 775
        positionInFocusRect:
          x: 0
          y: 49
    portrait:
      background:
        path: assets/game003-s1/bg2.jpg
        width: 1174
        height: 2000
      # focusRect 是背景图上的重点区域，也是布局 anchor / 虚拟区块。
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
      mainReelBackgroundPositionInFocusRect:
        x: 0
        y: 237
      conveyor:
        path: assets/game003-s1/conveyor2.png
        width: 934
        height: 227
        positionInFocusRect:
          x: 98
          y: 0
  mainReelBackground:
    path: assets/game003-s1/mainreelbg.png
    width: 1130
    height: 824
  reelWindowInMainReelBackground:
    x: 135
    y: 87
    width: 860
    height: 650
```

`mainReelBackgroundPositionInFocusRect` 和 `conveyor.positionInFocusRect` 只存 `x/y`，不是完整 rect；执行时必须用资源尺寸组装出完整 child rect 后再调用 `rendercore` 的 anchor mapping helper。这样避免在 YAML 里重复维护 `mainreelbg.png` 或 conveyor 的宽高。如果实现者采用 `mainReelBackgroundRectInFocusRect` 并包含 `width/height`，必须校验它的 `width/height` 与 `mainReelBackground` 图片尺寸一致。

`conveyor` 需要仔细处理：

- `rendercore` 不知道 conveyor。
- `game003` 第一版仍要求横竖屏都配置 conveyor，缺失时显式失败。
- `packages/gameframeworks/static-config` 和 `apps/buildgamestatic` 不应该把 conveyor 变成所有未来游戏都必填的通用概念；如果本次修改静态配置类型，优先把 conveyor 作为可选 scene part 或 game003 art extension 处理。
- 对 `game003` 的 app 级校验必须要求 `skin=1` 的横版、竖版 conveyor 都存在，且 `positionInFocusRect + conveyor.size` 映射后在 art 内。
- 不允许为了“没有 conveyor 的未来游戏”在 `game003` 里给空图、0 尺寸、默认位置或透明图兜底。

`scenePartGap` 的处理：

- 本任务完成后，运行时代码不应再用 `scenePartGap` 推导主转轴和传送带位置。
- 如果仍希望 YAML 保留 `scenePartGap: 10` 作为给配置人员看的设计说明，必须明确它只用于人工注释或一致性测试，不参与运行时布局计算。
- 更推荐删除 `scenePartGap` 字段，或把它改为 README/YAML 注释中的说明；如果删除，需要同步 `apps/buildgamestatic`、`packages/gameframeworks/static-config`、生成文件和测试。

### 4.4 game003 runtime 边界

`apps/game003/src/game-layout.ts` 应改为：

- 从生成静态配置读取横竖屏 `focusRect`。
- 从生成静态配置读取横竖屏 `mainReelBackgroundPositionInFocusRect`。
- 从生成静态配置读取横竖屏 conveyor 资源和 `positionInFocusRect`。
- 调用 `rendercore` 的 anchor mapping helper 把相对 focusRect 的位置映射到 art-space。
- 再调用 `mapArtRectToViewport(...)` 把 art-space rect 映射到 viewport-space。
- 继续用 `reelWindowInMainReelBackground` 计算实际 `reelWindow`。

必须移除或停止依赖这些推导逻辑：

```text
mainReelBackground.x = groupFrame.x + conveyor.width + scenePartGap
conveyor.y = mainReelBackground.y + mainReelBackground.height - conveyor.height
conveyor.x = groupFrame.x + (groupFrame.width - conveyor.width) / 2
mainReelBackground.y = groupFrame.y + conveyor.height + scenePartGap
placement: left-bottom-of-main-reel
placement: top-center-of-main-reel
```

保留的 game003 专属职责：

- 创建 `background`、`mainReelBackground`、`conveyor`、`reelWindow` 的 Pixi container / sprite。
- 控制它们的层级。
- 使用普通 reel 的本地公开轮带滚动和服务器 scene 临时目标窗口。
- 校验 `reelWindowInMainReelBackground.width / reelCount = 172`，`height / visibleRows = 130`。
- 保持 loading `99%/100%` 边界和 live 预连接流程不变。

不要把 `mainreelbg.png`、conveyor 文件名、game003 symbol、live server、gamecode 放进 `rendercore`。

## 5. 实施步骤

### 5.1 前置盘点

执行：

```bash
git status --short --untracked-files=all
git diff --stat
rg -n "placement|scenePartGap|mainReelBackground|conveyor|focusRect|calculateResponsiveArtViewport|mapArtRectToViewport" apps/game003 apps/buildgamestatic packages/gameframeworks packages/rendercore
```

确认以下事实后再改：

- `apps/game003/config/game-static.yaml` 是当前静态配置源。
- `apps/game003/src/generated/game-static.generated.ts` 是生成物，禁止手改。
- `game003` 第一版只支持 `skin=1`。
- 横版背景仍是 `assets/game003-s1/bg1.jpg`，尺寸 `2000 x 2000`。
- 竖版背景仍是 `assets/game003-s1/bg2.jpg`，尺寸 `1174 x 2000`。
- `mainreelbg.png` 尺寸仍是 `1130 x 824`。
- `conveyor1.png` 尺寸仍是 `284 x 775`。
- `conveyor2.png` 尺寸仍是 `934 x 227`。

### 5.2 rendercore 增加 anchor mapping helper

修改：

```text
packages/rendercore/src/viewport/focused-art-viewport.ts
packages/rendercore/src/viewport/index.ts
packages/rendercore/tests/viewport/focused-art-viewport.test.ts
packages/rendercore/README.md
```

要求：

- 新增通用 helper，按 `anchorRect + rect` 计算 art-space rect。
- 复用已有 `validateSize` / `validateRect` / `freezeRect` 风格。
- 对非法输入显式失败。
- 不引入 game003 专有命名。
- `packages/rendercore/src/viewport/index.ts` 必须导出新 helper。
- 如果根 `packages/rendercore/src/index.ts` 已经导出 `./viewport/index.js`，确认无需额外改动；如需要则同步导出。

测试至少覆盖：

- anchor 在 art 内，child 在 anchor 内，返回正确 art-space rect。
- child 可以相对 anchor 有非零 `x/y`，返回值不是简单复用 anchor。
- child 只要求最终在 art 内，不强制必须完全在 anchor 内；因为某些画面部件可能视觉上越过重点区域边界。
- anchor 超出 art 显式失败。
- child 映射后超出 art 显式失败。
- 非法尺寸、负坐标、`NaN`、`Infinity` 显式失败。
- 可与 `mapArtRectToViewport(...)` 组合，把 anchored child 映射到 viewport。

### 5.3 调整静态配置类型和生成器

修改：

```text
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/buildgamestatic/tests/generator.test.ts
apps/buildgamestatic/tests/cli.test.ts
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/index.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/src/static-config/frame-policy.ts
packages/gameframeworks/tests/static-config.test.ts
apps/game003/tests/static-config.test.ts
```

最低目标：

- YAML variant 能表达 `mainReelBackgroundPositionInFocusRect`。
- YAML conveyor 能表达 `positionInFocusRect`，不再只用 `placement` 推导。
- 生成的 `GAME003_STATIC_CONFIG` 中包含这些字段。
- 运行期 `assertSlotGameStaticConfig(...)` 能校验这些字段。
- 如果新增 `SlotGameStaticPoint` 或等价 public type，`packages/gameframeworks/src/static-config/index.ts` 必须同步导出。
- `framePolicy` 仍只读取 `frameFocusRect` 和 `minFocusMargin`，不要让 DOM frame 参与 game003 子部件定位。

推荐的类型方向：

```ts
export interface SlotGameStaticPoint {
  readonly x: number;
  readonly y: number;
}

export interface SlotGameStaticConveyorConfig extends SlotGameStaticImageResource {
  readonly positionInFocusRect: SlotGameStaticPoint;
}

export interface SlotGameStaticArtVariant {
  readonly background: SlotGameStaticImageResource;
  readonly focusRect: SlotGameStaticRect;
  readonly frameFocusRect: SlotGameStaticFrameFocusRect;
  readonly minFocusMargin?: SlotGameStaticMargin;
  readonly mainReelBackgroundPositionInFocusRect: SlotGameStaticPoint;
  readonly conveyor?: SlotGameStaticConveyorConfig;
}
```

如果实现者决定 conveyor 在当前 `SlotGameStaticArtVariant` 中仍必填，必须在任务报告中解释原因，并说明不会给无 conveyor 游戏添加空图兜底。更推荐把 `conveyor` 变成通用类型中的可选字段，再由 `apps/game003/src/game-layout.ts` 对 game003 做必填校验。

校验要求：

- `focusRect` 必须位于 `background` 内。
- `mainReelBackgroundPositionInFocusRect` 必须是有限非负数。
- `mainReelBackgroundPositionInFocusRect + mainReelBackground.size` 映射到 art 后必须位于 `background` 内。
- 如果 `conveyor` 存在，`conveyor.positionInFocusRect + conveyor.size` 映射到 art 后必须位于 `background` 内。
- `reelWindowInMainReelBackground` 继续必须位于 `mainReelBackground` 内。
- 删除 `placement` 后，旧 YAML 中继续出现 `placement` 必须触发未知字段失败，不能静默忽略。
- 删除或停止使用 `scenePartGap` 后，旧 YAML 中继续出现该字段也必须按最终 schema 处理：要么是未知字段失败，要么是明确定义为非运行时说明字段并有测试锁定。

生成器要求：

- 生成代码确定性，不包含时间戳、绝对路径或随机顺序。
- 新字段使用 `Object.freeze(...)` 包裹，风格与现有 generated 文件一致。
- `game-loading.generated.ts` 的生成不应受本次布局字段影响。
- `--check` 能发现 generated 文件与 YAML 不同步。

### 5.4 迁移 game003 YAML 和生成物

修改：

```text
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

目标数值保持当前视觉位置不变，只把隐式公式迁移为显式配置。

横版：

```text
focusRect:
  x=288, y=588, width=1424, height=824

mainReelBackgroundPositionInFocusRect:
  x=294, y=0

conveyor.positionInFocusRect:
  x=0, y=49

映射后的 mainReelBackground:
  x=582, y=588, width=1130, height=824

映射后的 conveyor1:
  x=288, y=637, width=284, height=775

映射后的 reelWindow:
  x=717, y=675, width=860, height=650
```

竖版：

```text
focusRect:
  x=22, y=469.5, width=1130, height=1061

mainReelBackgroundPositionInFocusRect:
  x=0, y=237

conveyor.positionInFocusRect:
  x=98, y=0

映射后的 mainReelBackground:
  x=22, y=706.5, width=1130, height=824

映射后的 conveyor2:
  x=120, y=469.5, width=934, height=227

映射后的 reelWindow:
  x=157, y=793.5, width=860, height=650
```

YAML 必须保留中文注释，说明：

- `focusRect` 是背景图上的重点区域，也是主转轴和传送带的相对定位 anchor。
- `mainReelBackgroundPositionInFocusRect` 是 `mainreelbg.png` 左上角相对 `focusRect` 左上角的偏移。
- `conveyor.positionInFocusRect` 是传送带左上角相对 `focusRect` 左上角的偏移。
- 坐标基准是完整背景 art，不是 CSS 像素、viewport 像素或裁切后的 visible rect。
- symbol scale 仍来自 `assets/game003-s1/symbol-state-textures.manifest.json`，不在 YAML 维护第二份 scale 表。

生成命令：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

### 5.5 修改 game003 layout

修改：

```text
apps/game003/src/game-layout.ts
apps/game003/src/skin-config.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/game-layout.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/README.md
```

实现要求：

- `createLandscapeSceneParts()` 和 `createPortraitSceneParts()` 不再根据 `placement` / `scenePartGap` 推导主转轴和 conveyor。
- 两个函数可以合并成一个按 variant 计算的 helper，例如 `createScenePartsForVariant(...)`，但不要过度抽象。
- 用 `mainReelBackgroundPositionInFocusRect + mainReelBackground.size` 组装完整 child rect，再通过 `rendercore` 新 helper 得到 `mainReelBackground`。
- 用 `conveyor.positionInFocusRect + conveyor.size` 组装完整 child rect，再通过 `rendercore` 新 helper 得到 `conveyor`。
- 用现有 `translateRect(reelWindowInMainReelBackground, mainReelBackground)` 或等价 helper 得到 `reelWindow`。
- 保留 `focusRegion` / `focusRegionInViewport` 输出，便于调试和测试。
- 保留 `mainReelBackgroundInViewport`、`conveyorInViewport`、`reelWindowInViewport` 输出。
- 对 game003 必须存在的 conveyor 做 app 级显式校验：缺失时抛出清晰错误。
- 继续校验 `reelWindowInMainReelBackground` 位于 `mainreelbg.png` 内，且宽高能被 5 列 / 5 行整除。

测试要求：

- 横版 scene parts 的最终坐标与本计划 5.4 中数值一致。
- 竖版 scene parts 的最终坐标与本计划 5.4 中数值一致。
- `apps/game003/tests/static-config.test.ts` 更新 generated config 形状断言，不再锁定旧 `placement` 推导字段或运行时 `scenePartGap` 依赖。
- `apps/game003/src/skin-config.ts` 在读取 optional conveyor 时必须显式校验 game003 需要的横竖屏 conveyor URL，不能用非空断言绕过类型。
- 测试能证明 main reel 位置来自 `mainReelBackgroundPositionInFocusRect`，不是旧的 `conveyor.width + scenePartGap` 推导。
- 如果构造一个缺少 conveyor 的 game003 variant，`game003` layout 显式失败。
- 如果 `mainReelBackgroundPositionInFocusRect` 映射后超出背景，显式失败。
- `createGame003FramePolicy()` 仍只使用 `frameFocusRect` / `minFocusMargin`，不读取 main reel 或 conveyor 坐标。
- `source-boundary.test.ts` 或等效测试覆盖：`apps/game003/src` 不再出现 `left-bottom-of-main-reel`、`top-center-of-main-reel` 作为运行时布局判断依据。
- 如果保留 `scenePartGap`，测试必须证明它不参与运行时定位；如果删除，则源码中不应再出现它。

### 5.6 文档和 agents.md 同步

修改：

```text
apps/game003/README.md
apps/buildgamestatic/README.md
packages/gameframeworks/README.md
packages/rendercore/README.md
agents.md
```

README 必须说明：

- `focusRect` 是横竖屏背景图上的重点区域，也是 game003 主转轴和传送带相对定位 anchor。
- 横版和竖版分别有自己的 `focusRect` 和 `mainReelBackgroundPositionInFocusRect`。
- `rendercore` 只负责通用 art/focus/anchor/viewport 映射，不负责 game003 的 conveyor 或 mainreelbg 组合。
- `game003` 的 YAML 是静态配置源，修改后必须运行 `generate:static-config` 和 `check:static-config`。
- `apps/buildgamestatic/README.md` 如已描述 YAML schema 或失败策略，必须同步新字段、未知旧字段失败和 generated 同步规则。
- `packages/gameframeworks/README.md` 如已描述 static config 或 frame policy，必须强调 frame policy 不读取 main reel / conveyor 坐标。
- `packages/rendercore/README.md` 如对 viewport API 有说明，必须补充新增 anchor mapping helper 的通用几何边界。

`agents.md` 如果当前没有覆盖本任务新规则，需要同步补充：

- `game003` 主转轴背景和传送带位置必须通过相对横竖屏 `focusRect` 的显式配置确定。
- 不要在 `apps/game003` 里用 conveyor 尺寸、gap 或 placement 枚举推导主转轴位置。
- `rendercore` 只能提供通用 anchor/focus rect 映射能力，不承载 game003 专属部件语义。

如果检查后认为 `agents.md` 已经足够覆盖，无需修改，但必须在任务报告中说明“检查过，无需同步”的理由。

### 5.7 浏览器验收

如果本地端口可用，启动：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

打开示例 URL：

```text
http://127.0.0.1:5208/?skin=1&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
```

没有真实 token 时也要至少完成非 live 的可验证部分：

- loading 页面先出现。
- 旧 `serverUrl` query 显式失败，不静默覆盖。
- canvas 未在 loading `100%` 前提前挂载。
- 横版 viewport 下使用 `bg1.jpg`，主转轴区和 conveyor 与背景视觉位置一致。
- 竖版 viewport 下使用 `bg2.jpg`，主转轴区和 conveyor 与背景视觉位置一致。
- resize 横竖切换后，`mainReelBackgroundInViewport`、`conveyorInViewport`、`reelWindowInViewport` 没有明显错位。

如果没有可用真实 token，任务报告必须明确说明未执行真实 live enter/spin/collect，并引用单测覆盖的范围。

## 6. 验收命令

先执行生成同步：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

模块级验收：

```bash
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build

CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build

CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic build

CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 format:check
```

按影响面补跑根级命令。如果耗时过长，至少跑完本任务触达包的命令，并在任务报告说明未跑根级命令的原因：

```bash
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm typecheck
CI=true pnpm build
CI=true pnpm format:check
```

补充静态审计：

```bash
rg -n "left-bottom-of-main-reel|top-center-of-main-reel" apps/game003 apps/buildgamestatic packages/gameframeworks
rg -n "mainReelBackgroundInFocusRect|rectInFocusRect" apps/game003 apps/buildgamestatic packages/gameframeworks
rg -n "scenePartGap" apps/game003 apps/buildgamestatic packages/gameframeworks
rg -n "focusRect\\s*\\?\\?|focusRect\\s*\\|\\|" apps/game003 packages/rendercore packages/gameframeworks apps/buildgamestatic
rg -n "rect\\.x - visibleRect\\.x|rect\\.y - visibleRect\\.y" apps/game003/src apps/game003/tests
git diff --check
git status --short --untracked-files=all
```

审计期望：

- `left-bottom-of-main-reel` / `top-center-of-main-reel` 不再作为运行时布局判断存在；如果仍存在，只能是迁移说明或旧兼容测试，且必须有明确理由。
- `mainReelBackgroundInFocusRect` / `rectInFocusRect` 这类容易误导为完整 rect 的旧草案名不应残留；最终应使用 `mainReelBackgroundPositionInFocusRect` / `positionInFocusRect` 或等价明确命名。
- `scenePartGap` 如果仍存在，不能参与运行时布局推导。
- 没有 `focusRect ?? ...` 或 `focusRect || ...` 隐藏兜底。
- `apps/game003` 不复制 `rendercore` 的 `rect.x - visibleRect.x` 映射算法。
- `git diff --check` 通过。

## 7. 完成标准

任务完成必须同时满足：

- `rendercore` 提供通用 anchor/focus rect 到 art rect 的映射 helper，并有 fail-fast 测试。
- `rendercore` 没有出现 game003 专属语义。
- `game003` 横版和竖版主转轴位置由 YAML 中相对 `focusRect` 的显式配置决定。
- `game003` 横版和竖版 conveyor 位置由 YAML 中相对 `focusRect` 的显式配置决定。
- 当前横版/竖版最终视觉坐标与迁移前一致，除非任务执行时明确记录了经视觉验收的新坐标。
- 旧 `placement` 推导不再驱动布局。
- 无 conveyor 的未来游戏不需要在通用配置里伪造 conveyor；但 `game003` 第一版仍对 conveyor 缺失显式失败。
- YAML、generated TS、`buildgamestatic`、`gameframeworks/static-config` 类型和校验全部同步。
- `game003` loading `99%/100%` live 初始化边界不被破坏。
- `game003` live server、gamecode、serverUrl query fail-fast、本地公开轮带边界不被破坏。
- `apps/game003/README.md` 已同步。
- `apps/buildgamestatic/README.md`、`packages/gameframeworks/README.md`、`packages/rendercore/README.md` 已按影响面同步，或任务报告解释无需修改。
- `agents.md` 已按需要同步，或任务报告说明检查后无需修改。
- 任务报告已按 `tasks/65-game003-anchor-layout-adaptation-[utctime].md` 写入。

## 8. 非目标

本任务不做：

- 不新增 `game003` skin。
- 不把 `game003-s1` 做成 `game002` 新皮肤。
- 不改变 live server：仍为 `wss://gameserv.rgstest.slammerstudios.com/`。
- 不改变 fixed `gamecode=EfedJuHEaydXNghnmO9KI`。
- 不把 `serverUrl` query 重新变成可覆盖配置。
- 不读取、缓存或泄露服务器真实轮带。
- 不改变 `assets/gamecfg003/gameconfig.json` 的 reel / paytable 生成逻辑。
- 不改变 symbol manifest scale 合同；`game003-s1` 可展示 symbol 的 `scale` 仍必须显式为 `1`。
- 不把 mainreelbg / conveyor 的组合逻辑上移到 `rendercore`。
- 不为了测试通过加入隐藏 fallback、自动猜测坐标或静默忽略坏配置。
- 不用 app 私有 CSS/DOM resize 绕过 `gameframeworks` / `uiframeworks` 的 `orientation-focus` frame policy。

## 9. 风险点和处理方式

### 9.1 静态配置通用层继续 game003 化

风险：`packages/gameframeworks/static-config` 和 `apps/buildgamestatic` 当前已经包含 `conveyor`，继续增加 game003 专有字段会让未来无 conveyor 游戏被迫造假配置。

处理：

- `rendercore` 只做通用几何 helper。
- 静态配置类型中尽量把 conveyor 设为可选，或拆成更通用的 scene part。
- `game003` 自己做 conveyor 必填校验。
- 任务报告必须说明最终选择。

### 9.2 保留 scenePartGap 导致双 source of truth

风险：显式 `positionInFocusRect` 已经包含 10px 间隔，继续保留并使用 `scenePartGap` 会产生两套真相。

处理：

- 优先删除 `scenePartGap` 运行时字段。
- 如果保留，只作为注释/文档/一致性校验，不参与定位计算。
- 单测锁定它不参与 `mainReelBackground` 和 `conveyor` 坐标计算。

### 9.3 focusRect 同时作为适配重点和布局 anchor

风险：未来美术想改变画面裁切重点，但不想移动主转轴，或反过来想移动主转轴但不改变适配重点。

处理：

- 本任务按用户当前判断，让虚拟区块和重点区域使用同一个 `focusRect`。
- 在 README 和任务报告中记录这个选择。
- 如果未来出现二者必须拆分的需求，再新增独立 `layoutAnchorRect`，但本任务不提前加第二套矩形，避免当前配置复杂化和漂移。

### 9.4 测试倒逼生产代码奇怪写法

风险：为了兼容旧测试中的 `placement` 或 `scenePartGap`，生产代码继续保留旧推导。

处理：

- 修改测试期望，让测试表达新的配置合同。
- 不为了旧测试保留不该保留的生产逻辑。
- source-boundary 测试负责防止旧运行时推导回流。

### 9.5 生成文件遗漏

风险：只改 YAML 或 generator，忘记提交 generated TS。

处理：

- `game003 generate:static-config` 和 `check:static-config` 必须跑。
- `game003 build`、`test`、`typecheck` 已自动生成配置，但任务报告仍要列出生成同步结果。
- `git status --short --untracked-files=all` 最后检查 generated 文件是否进入变更集。

## 10. 任务报告要求

完成后新增：

```text
tasks/65-game003-anchor-layout-adaptation-[utctime].md
```

报告必须是中文，并至少包含：

- 任务概述。
- 修改文件列表。
- 最终设计说明：`focusRect` 如何同时作为适配重点和布局 anchor。
- 最终横版坐标：`focusRect`、`mainReelBackground`、`conveyor1`、`reelWindow`。
- 最终竖版坐标：`focusRect`、`mainReelBackground`、`conveyor2`、`reelWindow`。
- `rendercore` 新增 API 名称和 fail-fast 边界。
- 静态配置 schema 的最终选择，尤其说明 conveyor 是通用可选还是 game003 必填。
- `scenePartGap` 是删除、保留说明字段，还是保留一致性校验字段。
- `agents.md` 是否更新；如果未更新，说明检查理由。
- 执行过的命令和结果。
- 未执行的命令及原因。
- 浏览器验收结果；若无真实 token，明确说明真实 live enter/spin/collect 未执行。
- 是否新增依赖、`pnpm-lock.yaml` 是否变化。
- `apps/buildgamestatic/README.md`、`packages/gameframeworks/README.md`、`packages/rendercore/README.md` 是否需要同步；如果未更新，说明检查理由。
- 已知风险或后续建议。

## 11. 二次检查清单

交付前逐项检查：

- `tasks/65-game003-anchor-layout-adaptation.md` 本文件存在，且不依赖聊天上下文。
- `apps/game003/config/game-static.yaml` 中文注释仍清楚说明坐标基准。
- `apps/game003/src/generated/game-static.generated.ts` 文件头仍写明禁止手改。
- `apps/game003/src/generated/game-loading.generated.ts` 未被无关改动污染。
- `rendercore` 新 helper 不含 game003 专有名词。
- `calculateResponsiveArtViewport(...)` 的横竖屏选择规则未被无关修改。
- `game003` layout 不再依赖 `placement` 推导主转轴位置。
- `game003` layout 不在 app 内复制 `rect.x - visibleRect.x` 映射算法。
- `game003` source-boundary 覆盖了旧推导防回流。
- `buildgamestatic` loader 对未知字段仍显式失败。
- `packages/gameframeworks/static-config` runtime validator 对坏坐标仍显式失败。
- `framePolicy` 仍只负责 DOM frame 和 canvas 逻辑尺寸上限。
- loading `99%/100%` 顺序没有被改坏。
- live server / gamecode / `serverUrl` query fail-fast 没有被改坏。
- 本地公开轮带和服务器目标 scene 临时窗口合同没有被改坏。
- `apps/game003/README.md` 已同步。
- `apps/buildgamestatic/README.md`、`packages/gameframeworks/README.md`、`packages/rendercore/README.md` 已按影响面检查。
- `agents.md` 已同步或报告中解释无需同步。
- 任务报告文件名使用 UTC、格式为 `tasks/65-game003-anchor-layout-adaptation-[utctime].md`。
- 最后执行 `git status --short --untracked-files=all`，确认没有遗漏新文件、生成物或临时文件。
