# game002 skin focus region adaptation 任务计划

## 1. 任务目标

本任务要优化 `apps/game002` 的响应式适配配置方式。前置任务 51 已经把 `2000 x 2000` 完整 art world、DOM frame policy、Pixi backing resize、`rendercore` 的 focused art viewport 计算接入到 `game002`。但当前 `game002` 仍把转轮棋盘区 `gridLayout.boardFrame` 隐式当成适配重点区域，导致“转轮布局”和“画面视觉重点”两个概念绑在一起。

本任务目标是把适配重点区域拆成独立接口和配置：

- 适配算法继续放在 `packages/rendercore`，由通用 API 根据完整 art/background 坐标系内的重点区域计算 `visibleRect`、`worldOffset` 和其它 art-to-viewport 映射结果。
- `apps/game002` 只配置每套 skin 的重点区域。重点区域坐标必须相对于完整背景图坐标系，即当前 `2000 x 2000` art world。
- `gridLayout.boardFrame` 继续只表示转轮棋盘和 cell 布局，不再承担“适配 focus”的隐式职责。
- `skin=1`、`skin=2`、`skin=3` 都必须显式声明自己的重点区域；即使某两套 skin 当前数值相同，也要逐套配置，避免未来换图时误共享。
- 不增加隐藏 fallback。缺少重点区域、重点区域非法、重点区域无法放进 art 或 viewport 时应显式失败，不能自动退回棋盘区、中心点或旧 reference crop。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、文档同步、验收和最终任务报告。

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础约束：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 新增空目录必须放 `.keepme`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。若确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

执行前先确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game002 test
```

## 3. 当前实现事实

### 3.1 rendercore

当前相关文件：

```text
packages/rendercore/src/viewport/focused-art-viewport.ts
packages/rendercore/src/viewport/index.ts
packages/rendercore/src/index.ts
packages/rendercore/tests/viewport/focused-art-viewport.test.ts
packages/rendercore/README.md
packages/rendercore/package.json
```

当前 `packages/rendercore/src/viewport/focused-art-viewport.ts` 已经提供：

```ts
calculateFocusedArtViewport({
  artSize,
  viewportSize,
  focusRect,
  minMargin,
});
```

其中 `focusRect` 已经是带 `x/y/width/height` 的完整 art 坐标矩形。它会输出：

- `visibleRect`
- `worldOffset`
- `focusRectInViewport`

这说明核心算法方向是正确的，但当前 app 侧没有把“可配置重点区域”作为 skin 配置暴露出来，且缺少“将其它 art rect 映射到当前 viewport”的通用 helper，导致 `game002` 的 `boardFrameInViewport` 目前只能复用 `focusRectInViewport`。

### 3.2 game002

当前相关文件：

```text
apps/game002/src/game-layout.ts
apps/game002/src/skin-config.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-adapter.ts
apps/game002/src/main.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/README.md
```

当前事实：

- `GAME002_ART_SIZE = { width: 2000, height: 2000 }`
- `GAME002_REFERENCE_SIZE = { width: 1125, height: 2000 }`
- `skin=2` 背景是 `assets/game002/bgfull.jpg`
- `skin=1` 背景是 `assets/game002-s1/bg.jpg`
- `skin=3` 背景是 `assets/game003/bg.jpg`
- 三套运行时背景尺寸都按 `2000 x 2000` 校验
- `Game002SkinConfig` 当前包含 `gridLayout`，但不包含独立适配重点区域
- `createGame002Layout(...)` 当前把 `gridLayout.boardFrame` 传给 `calculateFocusedArtViewport(...)`
- `createGame002FramePolicy(...)` 当前从 `gridLayout.boardFrame.width/height` 推导 DOM frame 需要保证的 focus 尺寸
- `game-demo.ts` 当前创建 runtime 时也调用 `createGame002Layout({ gridLayout: config.gridLayout })`，如果 `createGame002Layout(...)` 签名变化，不能漏改这里
- `game-adapter.ts` 在 mount 和 resize 时通过 `createGame002Layout({ viewportSize, gridLayout: skin.gridLayout })` 计算 world offset

当前棋盘区配置：

```text
skin=2 / skin=3 boardFrame:
  x=637.5, y=330, width=720, height=1080

skin=1 boardFrame:
  x=620, y=465, width=750, height=1200
```

本任务不能破坏这些 reel/cell 布局合同。

### 3.3 gameframeworks / uiframeworks

当前相关文件：

```text
packages/gameframeworks/src/types.ts
packages/gameframeworks/src/framework.ts
packages/gameframeworks/src/ui-adapter.ts
packages/gameframeworks/README.md
packages/uiframeworks/src/types.ts
packages/uiframeworks/src/layout.ts
packages/uiframeworks/src/dom.ts
packages/uiframeworks/README.md
```

当前 `framePolicy` 的 focus 部分只需要 `width/height`，用于决定 DOM frame 的逻辑尺寸、CSS 缩放和黑边居中。它不负责 art 内部裁切位置，也不应该知道 game002 背景坐标。完整 `x/y/width/height` 的重点区域应留在 `rendercore` 和 `game002` 之间处理。

除非实现过程中发现类型命名或文档必须澄清，否则本任务不需要改动 `uiframeworks` 的布局算法。

## 4. 设计合同

### 4.1 新增概念

新增 `focusRegion`，含义如下：

```ts
interface Game002FocusRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
```

约束：

- 坐标相对于完整 `2000 x 2000` art/background。
- 必须是有限数值。
- `width` / `height` 必须为正数。
- `x` / `y` 必须非负。
- `x + width <= 2000`，`y + height <= 2000`。
- 每套 skin 必须显式配置，不能从 `gridLayout.boardFrame` 运行时推导或 fallback。
- `focusRegion` 可以等于当前 `boardFrame`，但这必须是显式配置值，不是默认兜底。

建议在 `apps/game002/src/skin-config.ts` 中把 skin 级配置扩展为：

```ts
export interface Game002SkinConfig {
  readonly id: Game002SkinId;
  readonly label: string;
  readonly backgroundLabel: string;
  readonly backgroundUrl: string;
  readonly symbolModules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols: readonly string[];
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly gridLayout: Game002GridLayout;
  readonly focusRegion: Game002FocusRegion;
}
```

### 4.2 skin 级 viewport 配置边界

本任务至少要求每套 skin 显式配置 `focusRegion`。同时要审查当前共享的：

```text
GAME002_FOCUS_MARGIN
GAME002_REFERENCE_SIZE / preferredPortraitSize
```

如果三套 skin 继续共用这些值，必须在测试和任务报告中说明这是当前明确选择，不是遗漏。如果某套 skin 需要不同安全边距或 portrait 参考尺寸，应把它们也放进 skin 级 viewport 配置，例如：

```ts
interface Game002SkinViewportConfig {
  readonly focusRegion: Game002FocusRegion;
  readonly minFocusMargin: Game002FocusMargin;
  readonly preferredPortraitSize: RenderViewportSize;
}
```

禁止因为旧实现里这些值是全局常量，就在新实现中无审查地继续共享。

### 4.3 初始重点区域数值

如果执行时没有新的美术验收坐标，第一版使用当前转轮区作为显式基线，确保行为不发生不可解释漂移：

```text
skin=1 focusRegion:
  x=620, y=465, width=750, height=1200

skin=2 focusRegion:
  x=637.5, y=330, width=720, height=1080

skin=3 focusRegion:
  x=637.5, y=330, width=720, height=1080
```

如果执行时已经确认新的视觉重点区域，例如希望在转轮区外额外保留角色、标题或其它背景主体，则直接把对应 skin 的 `focusRegion` 改成经视觉验收确认的 `2000 x 2000` art 坐标，并同步测试期望值、README 和任务报告。

禁止写成：

```ts
focusRegion: skin.focusRegion ?? skin.gridLayout.boardFrame;
```

也禁止在 resize 时自动猜测、吸附或修正 focus 区域。配置错就应尽早失败。

### 4.4 rendercore API 边界

`rendercore` 继续拥有通用 art-size、focus-region、visible-viewport 适配算法。实现时优先复用现有 `calculateFocusedArtViewport(...)`。

如果 `game002` 需要把棋盘区、调试框或其它 art rect 映射到当前 viewport，不要在 `apps/game002` 里手写 `rect.x - visibleRect.x` 这类通用计算。应在 `packages/rendercore/src/viewport/` 增加并导出 helper，例如：

```ts
mapArtRectToViewport({
  artSize,
  visibleRect,
  rect,
});
```

建议输出：

```ts
{
  x: rect.x - visibleRect.x,
  y: rect.y - visibleRect.y,
  width: rect.width,
  height: rect.height,
}
```

并由 `rendercore` 统一校验：

- `rect` 必须在 `artSize` 内。
- `visibleRect` 必须在 `artSize` 内。
- `rect` 不要求完全落在 `visibleRect` 内，因为某些布局元素可能部分在当前 viewport 外，但映射结果必须是确定的。

### 4.5 game002 布局合同

`apps/game002/src/game-layout.ts` 应改为同时接收 `gridLayout` 和 `focusRegion`：

```ts
createGame002Layout({
  viewportSize,
  gridLayout,
  focusRegion,
});
```

布局结果中建议区分：

- `focusRegion`
- `focusRegionInViewport`
- `boardFrame`
- `boardFrameInViewport`

`boardFrameInViewport` 必须由 `rendercore` 的 art rect mapping helper 计算，不能复用 `focusRegionInViewport`，因为二者未来可能不同。

如果保留 `createGame002Layout()` 的无参默认用法，只能指向一个显式常量组合，例如 `GAME002_DEFAULT_GRID_LAYOUT + GAME002_SKIN2_FOCUS_REGION`，并在测试中锁定；不能在函数内部用 `focusRegion ?? gridLayout.boardFrame` 之类逻辑动态兜底。

`createGame002FramePolicy(...)` 应从 `focusRegion.width/height` 推导 `framePolicy.focusRect` 的尺寸：

```ts
createGame002FramePolicy(focusRegion);
```

或：

```ts
createGame002FramePolicy({ focusRegion });
```

不要继续传 `gridLayout` 来隐式表达 focus 尺寸。

### 4.6 非目标

本任务不做以下事情：

- 不改变 live 连接、spin、collect、余额、下注或 URL query 合同。
- 不改变服务器 scene、symbol code、轮带或 `reels-001` 数据来源。
- 不让前端读取、缓存或推导服务器真实轮带。
- 不把 `game002` 改成直接依赖 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore` 或 `@slotclientengine/logiccore`。
- 不新增 mock、默认 token、默认 scene、自动 placeholder、自动 BN 映射或其它隐藏 fallback。
- 不为了迁就测试去改弱生产逻辑；如果是测试造成奇怪写法，修改测试。

## 5. 实施步骤

### 5.1 准备和盘点

执行：

```bash
git status --short --untracked-files=all
git diff --stat
```

确认以下文件当前状态，避免覆盖用户改动：

```text
packages/rendercore/src/viewport/focused-art-viewport.ts
packages/rendercore/tests/viewport/focused-art-viewport.test.ts
apps/game002/src/game-layout.ts
apps/game002/src/skin-config.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-adapter.ts
apps/game002/src/main.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/README.md
AGENTS.md
```

### 5.2 rendercore：补齐通用映射能力

目标：

- 保留 `calculateFocusedArtViewport(...)` 的通用 focus-region 计算。
- 增加通用 art rect 到 viewport rect 的映射 helper，避免 app 私有复制。
- 增加测试证明 focus region 可以和 board rect 不同。

建议修改：

```text
packages/rendercore/src/viewport/focused-art-viewport.ts
packages/rendercore/src/viewport/index.ts
packages/rendercore/tests/viewport/focused-art-viewport.test.ts
packages/rendercore/README.md
```

测试至少覆盖：

- `focusRect` 位于完整 `2000 x 2000` art 内，且不等于待映射的 board rect。
- `calculateFocusedArtViewport(...)` 仍能输出正确 `visibleRect` 和 `worldOffset`。
- 新增 `mapArtRectToViewport(...)` 能把 board rect 映射到 viewport 坐标。
- `rect` 超出 `artSize`、`visibleRect` 超出 `artSize`、非法尺寸会显式失败。
- 不引入默认 center/fallback。

### 5.3 game002：把重点区域放进 skin 配置

目标：

- 每套 skin 显式声明 `focusRegion`。
- `gridLayout` 只负责转轮格子。
- `focusRegion` 负责适配重点。

建议修改：

```text
apps/game002/src/skin-config.ts
apps/game002/src/game-layout.ts
apps/game002/src/game-demo.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/source-boundary.test.ts
```

建议新增或调整导出：

```ts
export interface Game002FocusRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const GAME002_SKIN1_FOCUS_REGION = Object.freeze(...);
export const GAME002_SKIN2_FOCUS_REGION = Object.freeze(...);
export const GAME002_SKIN3_FOCUS_REGION = Object.freeze(...);
```

`Game002SkinConfig` 中必须逐套填写：

```ts
focusRegion: GAME002_SKIN1_FOCUS_REGION;
focusRegion: GAME002_SKIN2_FOCUS_REGION;
focusRegion: GAME002_SKIN3_FOCUS_REGION;
```

测试至少覆盖：

- `getGame002SkinConfig("1" | "2" | "3")` 都包含显式 `focusRegion`。
- `focusRegion` 在 `2000 x 2000` art 内。
- `createGame002Layout({ gridLayout, focusRegion })` 使用 `focusRegion` 计算 `visibleRect/worldOffset`。
- `boardFrameInViewport` 与 `focusRegionInViewport` 分开计算。
- 一个测试用例故意传入“重点区域和棋盘区不同”的配置，证明改变重点区域会改变 `visibleRect`，但不会改变 reel layout、cell size、scene 维度。
- `game-demo.ts` 的 runtime 创建路径继续使用正确的 selected skin layout，不因 `createGame002Layout(...)` 改签名而落回默认 skin。
- `source-boundary.test.ts` 或等效测试/审计覆盖：app 内不能复制通用 `rect.x - visibleRect.x` 映射算法，不能新增 `focusRegion ?? gridLayout.boardFrame` 隐藏兜底。
- 非法 `focusRegion` 抛错。

### 5.4 game002：接入 adapter 和 framework 创建

目标：

- framework 的 `framePolicy` 从 skin 的 `focusRegion` 创建。
- Pixi resize 和 world offset 从 skin 的 `focusRegion` 计算。
- 不重建 framework，不重建 live 连接，不改变 spin/collect。

建议修改：

```text
apps/game002/src/main.ts
apps/game002/src/game-adapter.ts
apps/game002/tests/game-adapter.test.ts
```

关键调用应类似：

```ts
framePolicy: createGame002FramePolicy(skin.focusRegion);
```

以及：

```ts
createGame002Layout({
  viewportSize: viewport.frameDesignSize,
  gridLayout: this.#skin.gridLayout,
  focusRegion: this.#skin.focusRegion,
});
```

验收点：

- `mount(...)` 初始 viewport 使用选中 skin 的 focus region。
- `onViewportChange(...)` resize 使用同一个 skin focus region。
- `renderer.resize(...)` 仍只使用 `layout.viewportSize`。
- `worldLayer.position` 仍只使用 `layout.worldOffset`。
- adapter destroy 时 viewport listener 仍正常取消。

### 5.5 文档和协作规则同步

必须更新：

```text
apps/game002/README.md
packages/rendercore/README.md
```

README 中要写明：

- `game002` 是 per-skin `focusRegion`。
- `focusRegion` 坐标相对于完整 `2000 x 2000` 背景。
- `focusRegion` 与 `gridLayout.boardFrame` 是两个概念。
- skin 换背景或重新对齐时，只改该 skin 的 focus region 和 grid layout，不共享隐式默认值。
- 配置非法会显式失败。

检查是否需要同步：

```text
AGENTS.md
```

如果实现后形成新的长期协作规则，必须同步 `AGENTS.md`。建议添加或调整为：

```text
game002 的响应式适配重点区域必须由每套 skin 显式配置，坐标相对于完整 2000 x 2000 背景；不要把转轮 board frame 当作隐式适配 focus，也不要在 app 内复制 rendercore 的 art-viewport 映射算法。
```

如果最终判断不需要改 `AGENTS.md`，必须在任务报告中说明理由。

### 5.6 静态发布检查同步

检查：

```text
apps/game002/scripts/verify-static-dist.mjs
```

如果该脚本已有布局、背景或 skin 合同检查，应补充 focus region 的源代码/配置审计。最低要求是在任务报告中说明是否需要改；如果不改，说明当前 `release:check` 已覆盖哪些内容、未覆盖 focus region 的风险由哪些单元测试兜住。

## 6. 验收命令

基础检查：

```bash
git status --short --untracked-files=all
git diff --stat
git diff --check
```

边界审计：

```bash
rg -n "focusRegion\\s*\\?\\?|focusRegion\\s*\\|\\|" apps/game002/src apps/game002/tests
rg -n "rect\\.x - visibleRect\\.x|rect\\.y - visibleRect\\.y" apps/game002/src apps/game002/tests
rg -n "@slotclientengine/uiframeworks|@slotclientengine/netcore|@slotclientengine/logiccore" apps/game002/src
```

这些命令期望无输出；如果有输出，必须逐条确认是否为测试里的反例或确有必要的边界代码，并在任务报告中记录。

rendercore：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

game002：

```bash
pnpm --filter game002 lint
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build
pnpm --filter game002 release:check
```

如果改动了 `gameframeworks`：

```bash
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
```

如果改动了 `uiframeworks`：

```bash
pnpm --filter @slotclientengine/uiframeworks lint
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter @slotclientengine/uiframeworks typecheck
pnpm --filter @slotclientengine/uiframeworks build
```

最终格式检查：

```bash
pnpm format:check
```

如果某条命令因为环境、网络或本机端口问题无法完成，不要改弱生产逻辑。先确认是否需要代理、`CI=true` 或清理本地 dev server；仍失败时在任务报告中记录命令、错误摘要和未完成风险。

## 7. 浏览器验收

本任务涉及可视适配，完成自动化验收后还需要浏览器验收。可使用：

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5207 --strictPort
```

示例 URL：

```text
http://127.0.0.1:5207/?skin=1&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
http://127.0.0.1:5207/?skin=2&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
http://127.0.0.1:5207/?skin=3&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

以上 URL 只展示 query 参数形态，`example.test` 不能作为真实 live 验收地址。实际浏览器验收必须使用有效的测试服 `serverUrl`、token 和 gamecode；如果当前无法取得有效 live 参数，只能记录为“布局 smoke 检查 + live 连接未验收”，不能把连接失败页面当作完整通过。

验收 viewport 至少包括：

```text
375 x 812
1125 x 2000
1200 x 1200
1920 x 1080
3000 x 1200
```

浏览器验收重点：

- 三套 skin 都能加载对应背景和 symbol。
- canvas backing size 跟随 `frameDesignSize`，不超过 `2000 x 2000`。
- 重点区域按当前 skin 配置保持在可见区域内。
- 棋盘区仍按 `gridLayout.boardFrame` 对齐，不被 focus region 的拆分破坏。
- ultra-wide 下页面多余区域为黑色，游戏画面居中。
- resize 不重建 framework，不触发重复 live connect。
- 控制台没有由本任务新增的 error。

如果用户明确表示浏览器验收由用户执行，则不要继续强行做浏览器自动化；在任务报告中标记“浏览器验收由用户接手”。

## 8. 最终任务报告

任务完成后必须新增中文报告，路径格式：

```text
tasks/60-game002-skin-focus-region-adaptation-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/60-game002-skin-focus-region-adaptation-260629-181300.md
```

报告必须包含：

- 实际修改文件清单。
- 每套 skin 的最终 `focusRegion` 数值。
- `GAME002_FOCUS_MARGIN`、`preferredPortraitSize` 是继续共享还是迁入 skin 配置，以及原因。
- 是否改动 `rendercore` API，新增 API 名称和用途。
- 是否改动 `gameframeworks` / `uiframeworks`，若未改动说明原因。
- 是否更新 `apps/game002/README.md`、`packages/rendercore/README.md` 和 `AGENTS.md`。
- 所有验收命令及结果。
- 浏览器验收结果，或说明由用户接手。
- 未完成项、风险和后续建议。

## 9. 二次检查清单

提交前按以下清单再检查一遍，确保没有遗漏：

- `focusRegion` 是否每套 skin 都显式配置。
- `GAME002_FOCUS_MARGIN` / `preferredPortraitSize` 是否经过审查；若仍共享，是否有测试和报告说明。
- `focusRegion` 是否相对于完整 `2000 x 2000` 背景，而不是 reference crop 或 CSS 像素。
- `gridLayout.boardFrame` 是否仍只负责 reel/cell 布局。
- 是否删除了任何 `focusRegion ?? gridLayout.boardFrame` 这类隐藏 fallback。
- `createGame002FramePolicy(...)` 是否从 focus region 尺寸创建。
- `createGame002Layout(...)` 是否从 focus region 计算 visible viewport。
- `game-demo.ts` 是否随 layout API 同步，runtime 创建路径没有落回默认 skin。
- `boardFrameInViewport` 是否不再等同于 `focusRegionInViewport`。
- `rendercore` 是否承接了通用 art rect mapping，app 内没有复制通用裁切/居中算法。
- 三套 skin 的测试是否都覆盖。
- 非法重点区域是否显式失败。
- `release:check` 是否被评估并按需更新。
- README 和 `AGENTS.md` 是否按实际边界同步。
- 最终报告是否按 UTC 命名并放入 `tasks/`。
