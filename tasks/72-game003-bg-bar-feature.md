# game003 bg-bar conveyor feature 任务计划

## 1. 任务目标

本任务为 `apps/game003` 增加 `bg-bar` 传送带玩法展示。服务器在每次 spin 的 `curGameModParam.mapComponents["bg-bar"]` 里下发 5 个 feature，当前样例为：

```json
{
  "features": ["normal", "wild", "wild", "wild", "up"],
  "usedFeatures": [],
  "cacheFeatures": [],
  "curFeature": "normal",
  "@type": "type.googleapis.com/sgc7pb.FeatureBar2Data"
}
```

本任务要完成以下能力：

- 为 `bg-bar` 新增独立 symbol manifest，不复用主转轮 `assets/game003-s1/symbol-state-textures.manifest.json`。
- `bg-bar` feature 当前只支持 `normal`、`wild`、`up`。
- `wild` 使用 `assets/game003-s1/wild.png`，`up` 使用 `assets/game003-s1/up.png`。
- `normal` 是透明空 symbol，不能新增一张透明 PNG；需要在 `packages/rendercore` 中显式支持可配置尺寸的透明 symbol。
- `normal` 也必须有稳定宽高，当前按 `wild.png` 的最大设计尺寸 `172 x 158` 建模；`up.png` 为 `172 x 130`，运行时放进同一个 slot 时居中显示。
- `bg-bar` 的 symbol 状态只需要 `normal`、`appear`、`win`。`appear` 可等同普通静态状态，`win` 使用和主 symbol H 系一致的 builtin win 动画效果，不接入 VNI。
- 横屏时 symbol 放在 `conveyor1.png` 上，沿传送带向下移动；最下面格子是终点 win 格。
- 竖屏时 symbol 放在 `conveyor2.png` 上，沿传送带向右移动；最右边格子等价于横屏最下面终点格。
- 每次 spin 使用本次 `features` 完整数据在 spin 开始时启动传送带动画，不能等主转轮停下后才开始。
- `playSpin()` 必须等待主转轮、`bg-bar` 终点 win、`bg-wins` symbol 播放和中奖金额动画全部完成后再 resolve。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/72-game003-bg-bar-feature-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/72-game003-bg-bar-feature-260702-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/minecart2
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
CI=true pnpm --filter buildgamestatic test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。缺少 `bg-bar` 映射、`features` 非数组、长度不是 5、出现未知 feature、slot 配置数量不对、manifest 缺 scale、图片尺寸漂移、生成物不同步、当前显示队列和下一次服务器队列对不上，都必须尽早抛错，不要静默修复。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 现有资源

当前仓库已有：

```text
assets/game003-s1/wild.png        172 x 158
assets/game003-s1/up.png          172 x 130
assets/game003-s1/conveyor1.png   284 x 775
assets/game003-s1/conveyor2.png   934 x 227
```

确认命令：

```bash
file assets/game003-s1/wild.png assets/game003-s1/up.png assets/game003-s1/conveyor1.png assets/game003-s1/conveyor2.png
sips -g pixelWidth -g pixelHeight assets/game003-s1/wild.png assets/game003-s1/up.png assets/game003-s1/conveyor1.png assets/game003-s1/conveyor2.png
```

`conveyor1.png` 是竖向 5 格传送带，底部火焰格是终点格。`conveyor2.png` 是横向 5 格传送带，右侧火焰格是终点格。

### 3.2 现有代码边界

静态配置和生成物：

```text
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/validate.ts
```

game003 布局和 runtime：

```text
apps/game003/src/game-layout.ts
apps/game003/src/game-adapter.ts
apps/game003/src/game-demo.ts
apps/game003/src/assets.ts
apps/game003/src/skin-config.ts
apps/game003/src/symbol-animation-config.ts
apps/game003/src/win-sequence.ts
apps/game003/src/win-amount-config.ts
apps/game003/tests/fixtures/game003-gmi.ts
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/source-boundary.test.ts
```

rendercore symbol 能力：

```text
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/animation-resolver.ts
packages/rendercore/src/symbol/state-machine.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/src/index.ts
packages/rendercore/src/reel/symbol-registry.ts
packages/rendercore/src/reel/render-reel-set.ts
```

现有 `bg-wins` 已经通过 `apps/game003/src/win-sequence.ts` 和 `RenderReelSet.requestVisibleSymbolStates(...)` 播放，不要重复实现中奖 result 解析。

现有 `game003` 静态配置以 `apps/game003/config/game-static.yaml` 为人工源，`game-static.generated.ts` / `game-loading.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改。

现有 `mainreelbg.png`、`conveyor1.png`、`conveyor2.png` 的组合、位置和校准属于 `apps/game003` 专属 layout / adapter；`packages/rendercore` 只能承载通用 symbol、动画、透明 symbol、可见状态和视口映射能力，不承载 `bg-bar`、`wild`、`up`、`conveyor1`、`conveyor2` 等 game003 专属语义。

## 4. `bg-bar` 数据和播放合同

### 4.1 feature 数据

只从本轮 step 0 读取：

```ts
logic.getStep(0).getComponent("bg-bar");
```

合同：

- `bg-bar` 必须在 `historyComponents` 中触发后存在于 `mapComponents`。
- `bg-bar.features` 必须是长度为 5 的字符串数组。
- 只允许 `normal`、`wild`、`up`。
- `usedFeatures`、`cacheFeatures` 第一版只校验为数组，不参与动画驱动。
- `curFeature` 第一版只校验为已知 feature，不参与动画驱动。
- `@type` 如果存在，必须等于 `type.googleapis.com/sgc7pb.FeatureBar2Data`；如果未来协议去掉 `@type`，不强行依赖它。
- `basicComponentData` 必须存在，且第一版 `usedScenes`、`usedOtherScenes`、`usedResults`、`usedPrizeScenes`、`srcScenes`、`pos` 都必须为空数组，`coinWin` / `cashWin` 必须为 0。若后续服务端赋予 `bg-bar` 结果或场景语义，需要另开任务调整合同，不能在本任务里静默忽略。
- 如果 `bg-bar` 没触发，首屏或离线测试可显示空传送带；一旦触发但数据不合法，必须抛错。

新增 app 层解析文件：

```text
apps/game003/src/bg-bar-sequence.ts
```

建议导出：

```ts
export const GAME003_BG_BAR_COMPONENT_NAME = "bg-bar";
export type Game003BgBarFeature = "normal" | "wild" | "up";

export interface Game003BgBarSpinPlan {
  readonly stepIndex: 0;
  readonly features: readonly [
    Game003BgBarFeature,
    Game003BgBarFeature,
    Game003BgBarFeature,
    Game003BgBarFeature,
    Game003BgBarFeature,
  ];
}

export function createGame003BgBarSpinPlan(
  logic: GameLogic,
): Game003BgBarSpinPlan | null;
```

`apps/game003` 仍然不能直接 import `@slotclientengine/logiccore`。如果需要组件 raw 数据，只通过 `@slotclientengine/gameframeworks` 的 `GameLogic` / `LogicComponent` facade 访问。

测试 fixture 必须更新：

```text
apps/game003/tests/fixtures/game003-gmi.ts
```

要求新增一个包含 `historyComponents: ["bg-bar", "bg-spin", "bg-wins"]` 的 raw GMI fixture，数据直接覆盖本计划附件里的 `features: ["normal", "wild", "wild", "wild", "up"]`、`basicComponentData` 和 `@type` 形状。不要只用手写简化对象绕过 `createSlotGameLogicResult(...)`，否则无法证明真实 GMI parser 到 app helper 的链路没有断。

### 4.2 5 格映射

传送带有 5 个物理 slot，沿运动方向编号：

- 横屏：`slot 0` 是最上方，`slot 4` 是最下方火焰终点格。
- 竖屏：`slot 0` 是最左方，`slot 4` 是最右方火焰终点格。

服务器给 5 个 feature，但静止展示只展示前 4 个，`features[4]` 是本次 shift 后进入的新 feature。

spin 开始前的展示位置：

```text
features[0] -> slot 3
features[1] -> slot 2
features[2] -> slot 1
features[3] -> slot 0
features[4] -> 暂不显示
```

spin 开始后的目标位置：

```text
features[0] -> slot 4，进入终点格，播放 win，完成后消失
features[1] -> slot 3
features[2] -> slot 2
features[3] -> slot 1
features[4] -> slot 0，播放 appear 或直接普通态出现
```

本轮动画完成后的 idle 队列为：

```text
[features[1], features[2], features[3], features[4]]
```

下一次 spin 如果 runtime 已有 idle 队列，则新下发 `features[0..3]` 必须和当前 idle 队列完全一致；否则抛出 `game003 bg-bar feature queue desync` 类错误。这样能尽早暴露服务端状态、客户端重置或动画状态机不同步问题。首次 spin、adapter destroy 后重建、或明确 reset 后没有旧队列时，可以直接用新 `features` 初始化。

### 4.3 时序合同

`bg-bar` shift 在 `playSpin(logic)` 调用时和主转轮 spin 同时开始：

1. `playSpin(logic)` 解析 `bg-bar`，生成 feature-bar plan。
2. `runtime.spinToScene(targetScene, "spin main scene")` 启动主转轮。
3. `bgBarRuntime.startSpin(plan)` 启动传送带向下或向右移动。
4. ticker 中同时更新主转轮、`bgBarRuntime`、中奖金额动画。
5. 主转轮完成后，继续按现有逻辑启动 `bg-wins` symbol 播放。
6. `playSpin()` 只有在以下全部完成后才 resolve：
   - 主转轮停到目标 scene。
   - `bg-bar` shift 和终点 `features[0]` 的 win 状态播放完成，并且终点 symbol 已隐藏。
   - `bg-wins` 队列播放完成。
   - 如有 total win，中奖金额动画完成。

不要因为 `bg-bar` 没有 coinWin/cashWin 就把它和 `bg-wins` 混在一起；`bg-bar` 是 feature 轨道动画，不是 result.pos 中奖序列。

## 5. 静态配置合同

### 5.1 新增 manifest

新增：

```text
assets/game003-s1/bg-bar-symbol-state-textures.manifest.json
```

建议内容结构：

```json
{
  "version": 1,
  "states": [],
  "symbols": {
    "normal": {
      "normal": { "kind": "transparent", "width": 172, "height": 158 },
      "scale": 1,
      "animations": {
        "appear": { "kind": "static", "durationSeconds": 0.016666666666666666 },
        "win": { "kind": "builtin", "durationSeconds": 0.58 }
      }
    },
    "wild": {
      "normal": "./wild.png",
      "scale": 1,
      "animations": {
        "appear": { "kind": "static", "durationSeconds": 0.016666666666666666 },
        "win": { "kind": "builtin", "durationSeconds": 0.58 }
      }
    },
    "up": {
      "normal": "./up.png",
      "scale": 1,
      "animations": {
        "appear": { "kind": "static", "durationSeconds": 0.016666666666666666 },
        "win": { "kind": "builtin", "durationSeconds": 0.58 }
      }
    }
  }
}
```

最终字段名以 rendercore 实现为准，但必须满足：

- 透明 normal 是 manifest 显式声明，不是缺图 fallback。
- `scale` 每个 symbol 显式声明为正数。
- `normal` 不需要 PNG 文件。
- `wild` 和 `up` 必须按 manifest 文件名严格匹配，不允许把 `bg1`、`mainreelbg`、`conveyor1`、`conveyor2` 误收进 symbol catalog。

### 5.2 YAML 扩展

在 `apps/game003/config/game-static.yaml` 的 `skins."1"` 下新增 `featureBars`，建议结构：

```yaml
# bg-bar 是 game003 传送带玩法的 feature 轨道。componentName 来自 live GMI；
# symbols 使用独立 manifest，不复用主转轮 symbol manifest。
featureBars:
  bgBar:
    componentName: bg-bar
    queueLength: 5
    visibleCount: 4
    terminalSlotIndex: 4
    emptyFeature: normal
    allowedFeatures:
      - normal
      - wild
      - up
    symbols:
      manifest: assets/game003-s1/bg-bar-symbol-state-textures.manifest.json
      pngGlob: assets/game003-s1/{wild,up}.png
      requireExplicitScale: true
      requiredStates: []
    layout:
      landscape:
        movement: down
        # slotRectsInConveyor 坐标相对于 conveyor1.png 左上角，按运动方向从入口到终点排列。
        # 必须人工校准 5 个传送带视觉格子，运行时以 rect 中心对齐 symbol 中心。
        # symbol 可以大于格子，不允许运行时用 conveyor height / 5 推导。
        slotRectsInConveyor:
          - { x: 0, y: 0, width: 0, height: 0 }
          - { x: 0, y: 0, width: 0, height: 0 }
          - { x: 0, y: 0, width: 0, height: 0 }
          - { x: 0, y: 0, width: 0, height: 0 }
          - { x: 0, y: 0, width: 0, height: 0 }
      portrait:
        movement: right
        # slotRectsInConveyor 坐标相对于 conveyor2.png 左上角，按运动方向从入口到终点排列。
        # 必须人工校准 5 个传送带视觉格子，运行时以 rect 中心对齐 symbol 中心。
        slotRectsInConveyor:
          - { x: 0, y: 0, width: 0, height: 0 }
          - { x: 0, y: 0, width: 0, height: 0 }
          - { x: 0, y: 0, width: 0, height: 0 }
          - { x: 0, y: 0, width: 0, height: 0 }
          - { x: 0, y: 0, width: 0, height: 0 }
```

上面的 `0` 是示意占位，实际实现必须用图片校准后的真实坐标替换。验收时要求：

- 每个 `slotRectsInConveyor` 长度必须是 5。
- 每个 rect 必须是正宽高，并完整落在对应 conveyor 图片内；rect 是视觉格子，不是 symbol 尺寸。
- 横屏 `slot 4` 必须覆盖底部火焰终点格。
- 竖屏 `slot 4` 必须覆盖右侧火焰终点格。
- 运行时代码不得用 `conveyor.height / 5`、`conveyor.width / 5`、`slotCount` 等公式推导格子位置。

如 `apps/buildgamestatic` 不允许 `featureBars` 这样的新字段，必须同步扩展：

```text
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/buildgamestatic/tests/generator.test.ts
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/tests/static-config.test.ts
packages/gameframeworks/tests/exports.test.ts
```

扩展时只能增加通用 `featureBars` 静态配置结构，不要在 `packages/gameframeworks` 写死 `bg-bar`、`wild`、`up` 或 game003 规则。

### 5.3 loading 资源

同步更新 `apps/game003/config/game-static.yaml` 的 `loading.resources`：

```yaml
- id: game003-bg-bar-symbol-pngs
  glob: assets/game003-s1/{wild,up}.png
  weight: 2
```

如果生成器支持把 JSON manifest 作为 loading 资源，也可显式加入：

```yaml
- id: game003-bg-bar-symbol-manifest
  path: assets/game003-s1/bg-bar-symbol-state-textures.manifest.json
  weight: 1
```

不能把 `assets/game003-s1/*.png` 作为 loading glob；必须继续避免把 `mainreelbg` / `conveyor` / 背景 / 主 symbol 状态图混到错误资源组。

修改 YAML 后必须执行：

```bash
pnpm --filter game003 generate:static-config
pnpm --filter game003 check:static-config
```

并确认以下生成物同步变化，且不要手改：

```text
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

## 6. rendercore 实现范围

`packages/rendercore` 只做通用能力：

1. 支持 manifest 声明透明 normal source，例如 `{ kind: "transparent", width, height }`。
2. 支持透明 normal source 在 `RenderSymbol` 中占据稳定宽高、可被居中、可运行 builtin/static 动画。
3. 提供不依赖 slot paytable 的 standalone symbol catalog，供 feature bar、viewer 或未来非转轮 UI symbol 使用。
4. 保持现有 `createReelSymbolRegistry(...)` 的 fail-fast 行为，不能因为 bg-bar 需要透明 normal 而让主转轮缺图变成静默空图标。

建议新增或修改：

```text
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/standalone-catalog.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/src/index.ts
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
packages/rendercore/tests/symbol/standalone-catalog.test.ts
packages/rendercore/tests/reel/symbol-registry.test.ts
```

standalone catalog 建议 API：

```ts
export interface CreateStandaloneSymbolCatalogOptions {
  readonly assets: SymbolAssetMap;
  readonly displaySymbols: readonly string[];
  readonly symbolScales?: ReelSymbolScaleMap;
  readonly statePreset?: SymbolStatePreset;
  readonly animationResolver?: SymbolAnimationResolver;
  readonly texturePolicy?: SymbolTexturePolicy;
}

export function createStandaloneSymbolCatalog(
  options: CreateStandaloneSymbolCatalogOptions,
): StandaloneSymbolCatalog;
```

要求：

- `displaySymbols` 缺 manifest 或缺 asset 时抛错。
- asset 有但未被 `displaySymbols` 使用时记录 validation，是否抛错由调用方决定；game003 bg-bar 调用方必须把未使用 asset 当错误。
- 自动合成 `SymbolDefinition` 时 `code` 可以用 `displaySymbols` 下标，`pays` 为空数组。
- 不读取 `assets/gamecfg003/gameconfig.json`，不改变主转轮 paytable。
- 如果通过已有 `@slotclientengine/rendercore` 或 `@slotclientengine/rendercore/symbol` 导出即可使用，不要新增 package `exports` 子路径；若实现者新增子路径，必须同步 `packages/rendercore/package.json`、build、typecheck 和导出测试。

透明 normal source 要求：

- `width` / `height` 必须是有限正数。
- 不能允许 `width: 0`、`height: 0`、`NaN`、负数或字符串数字。
- `RenderSymbol` 对透明 normal 创建不可见但有尺寸的显示对象；该对象不应画出白块、黑块或默认纹理。
- `win` builtin 动画可以运行在透明 normal 上；对 `normal` feature 来说，视觉上保持透明，完成后状态回到 `normal`。
- 现有主转轮 symbol manifest 的 `normal: "./H1.png"` 和 layered normal 行为不能被破坏。

## 7. game003 实现范围

### 7.1 新增 app 文件

建议新增：

```text
apps/game003/src/bg-bar-sequence.ts
apps/game003/src/bg-bar-layout.ts
apps/game003/src/bg-bar-runtime.ts
apps/game003/tests/bg-bar-sequence.test.ts
apps/game003/tests/bg-bar-layout.test.ts
apps/game003/tests/bg-bar-runtime.test.ts
```

如果实现者认为文件拆分过细，可以合并，但必须保留解析、布局、runtime 三个职责边界。

注意：这里不要配置主转轮语义里的 `emptySymbols: ["normal"]`。`bg-bar normal` 是会创建 `RenderSymbol` 的透明 symbol，只是视觉透明；它仍然需要尺寸、状态和动画生命周期。把它当成 `emptySymbols` 会导致没有可移动、可等待 win 完成的 runtime symbol。

### 7.2 skin config 和资源加载

修改：

```text
apps/game003/src/skin-config.ts
apps/game003/src/assets.ts
apps/game003/src/game-adapter.ts
```

`Game003SkinConfig` 需要新增 bg-bar 配置，例如：

```ts
readonly bgBar: {
  readonly componentName: "bg-bar";
  readonly symbolModules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols: readonly ["normal", "wild", "up"];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolAnimationResolver: SymbolAnimationResolver;
};
```

实现时不要在 app 内复制 manifest schema。必须复用 `rendercore` 的 manifest parser、asset map、scale map 和 animation resolver。

`loadGame003SymbolTextures(...)` 如复用到 bg-bar，必须支持透明 normal source 透传，不调用 `Assets.load`。

不要把 bg-bar symbol scale 或 animation resolver 混进现有主转轮的 `GAME003_SYMBOL_SCALES` / `game003StaticSkin1.symbols` 路径。`apps/game003/src/symbol-animation-config.ts` 可以保持主转轮专用，或新增清晰命名的 bg-bar 专用 helper；无论哪种方式，测试必须证明主 symbol manifest 和 bg-bar manifest 没有互相污染。

bg-bar loader 必须校验真实图片尺寸：

- `wild.png` 必须是 `172 x 158`。
- `up.png` 必须是 `172 x 130`。
- `normal` 不加载图片，但透明 normal source 必须提供 `172 x 158`。

如果后续美术资源尺寸调整，必须同步 manifest、slot rect、测试和任务报告，不能让 loader 自动接受漂移。

### 7.3 布局和显示

`bg-bar-runtime` 建议拥有一个 Pixi `Container`，挂在 `conveyor` 上方、`mainReelBackground` 下方：

```text
background
conveyor
bgBarRuntime.container
mainReelBackground
runtime.mainReelsLayer
winAmountPlayer.container
```

原因：symbol 应该出现在传送带格子上，但不应该盖住主转轮框和主转轮内容。

`bg-bar-layout` 输入当前 `Game003Layout`，输出：

- 当前 orientation。
- 当前 conveyor 的 art 坐标。
- 5 个 slot rect，坐标相对于 art 或相对于 bgBar container 均可，但必须清晰。
- 每个 slot 的 symbol anchor，默认中心点。
- 横屏 movement=`down`，竖屏 movement=`right`。

禁止事项：

- 不要在 `rendercore` 放 `bg-bar`、传送带、火焰格、`wild`、`up` 语义。
- 不要在 app 中用 `conveyor.width / 5` 或 `conveyor.height / 5` 自动切格。
- 不要把 `bg-bar` symbol 放进主转轮 `RenderReelSet`。
- 不要修改 `assets/gamecfg003/gameconfig.json` 的 paytable 或 reel 以容纳 `bg-bar`。
- 不要让 `bg-bar` 的 `normal` 缺图通过通用缺图 fallback 静默成功；它必须是 manifest 显式透明 symbol。

### 7.4 runtime 状态机

`bgBarRuntime` 建议 API：

```ts
interface Game003BgBarRuntime {
  readonly container: Container;
  applyLayout(layout: Game003BgBarLayout): void;
  reset(): void;
  startSpin(plan: Game003BgBarSpinPlan): void;
  update(deltaSeconds: number): { readonly completed: boolean };
  isPlaying(): boolean;
  getSnapshot(): Game003BgBarSnapshot;
  destroy(): void;
}
```

状态机：

- `idle`：展示当前 4 个 feature；没有队列时不显示 symbol。
- `shifting`：5 个 feature 沿对应方向移动一个 slot。
- `terminal-win`：`features[0]` 到终点 slot 后请求 `win`，等待 once 动画完成。
- `settled`：隐藏终点 symbol，保留 `[features[1], features[2], features[3], features[4]]`。

动画时长第一版可由 YAML 配置或 app 常量配置，例如：

```ts
const GAME003_BG_BAR_SHIFT_DURATION_SECONDS = 0.45;
```

如果放入 YAML，必须同步 buildgamestatic 校验为有限正数。无论放哪里，测试要锁定。

`update(deltaSeconds)` 必须校验 delta 为有限非负数，并复用或保持和 `game-adapter.ts` 当前 ticker cap 一致。

## 8. game003 adapter 集成

修改 `apps/game003/src/game-adapter.ts`：

- `Game003AdapterOptions` 可增加测试注入：

```ts
readonly loadBgBarSymbolTextures?: () => Promise<SymbolAssetMap>;
readonly createBgBarRuntime?: (symbolAssets: SymbolAssetMap) => Game003BgBarRuntime;
```

- `mount()` 中和其它资源并行加载 bg-bar symbol textures。
- 创建 `bgBarRuntime` 后按正确 layer 顺序挂载。
- `#applyViewport(...)` 中同步调用 `bgBarRuntime.applyLayout(...)`。
- `applyInitialState(...)` 不要从 `defaultScene` 猜 bg-bar；没有组件数据时保持空传送带。
- `playSpin(logic)` 中调用 `createGame003BgBarSpinPlan(logic)`，若返回 plan 则立即 `bgBarRuntime.startSpin(plan)`。
- `PendingAnimation` 增加 `bgBarExpected` / `bgBarComplete` 或直接在完成判断中查询 `bgBarRuntime.isPlaying()`。
- 主转轮、bg-bar、bg-wins、win amount 任一阶段异常都必须 reject 当前 promise 并停止 ticker。
- `destroy()` 必须销毁 bg-bar runtime、移除 pending、释放引用。

推荐完成判断：

```text
主转轮完成 && bgWins完成 && winAmount完成 && bgBarRuntime不在播放
```

不要因为 `bg-bar` 不是金额中奖就绕过等待；用户必须能看到终点 win 后消失。

## 9. symbolsviewer 同步

新增或更新：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/tests 或现有相关测试
```

目标：

- 增加 `game003-bg-bar` symbol set，读取 `assets/game003-s1/bg-bar-symbol-state-textures.manifest.json`。
- 预览 `normal`、`wild`、`up`。
- `normal` 虽然透明，也应在 viewer 中保留可点击或可标识的空格占位，不要被缺图错误吞掉。
- viewer 只做 UI 配置和调用 rendercore，不复制 manifest schema。

如果当前 `symbolsviewer` 没有测试框架或不在本任务影响面内，至少要在任务报告中记录已手动检查的文件和未做浏览器验收的原因。

## 10. 测试计划

### 10.1 rendercore

新增测试必须覆盖：

- manifest parser 接受 `normal: { kind: "transparent", width: 172, height: 158 }`。
- 透明 normal 缺 `width`、缺 `height`、0、负数、`NaN`、字符串数字时失败。
- `createSymbolAssetMapFromManifestModules(...)` 对透明 normal 不要求 PNG module。
- `createStandaloneSymbolCatalog(...)` 能创建 `normal` / `wild` / `up` 的 `RenderSymbol`。
- 透明 `RenderSymbol` 有稳定尺寸，不绘制可见像素，并能接受 `requestState("win")` 后回到 `normal`。
- `@slotclientengine/rendercore` 和 `@slotclientengine/rendercore/symbol` 的 public export 面可以访问新增通用 API；如果没有新增 public API，也要有测试证明 app 只能通过既有 public API 完成集成。
- `createReelSymbolRegistry(...)` 仍然对主转轮缺图显式失败或按现有 `emptySymbols` 合同处理；不能因为透明 normal 支持而扩大缺图兜底。

推荐命令：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

### 10.2 buildgamestatic / static-config

新增测试必须覆盖：

- YAML 可解析 `featureBars.bgBar`。
- `slotRectsInConveyor` 长度不是 5、rect 非正宽高、越出 conveyor 尺寸时失败。
- `symbols.requiredStates: []` 对 feature bar 合法，但主转轮 `symbols.requiredStates` 仍保持非空。
- generator 输出 `featureBars`、manifest import、`pngModules` 和 loading resources。
- `apps/game003/src/generated/game-static.generated.ts` 输出的 `featureBars` 不包含 `rawGameConfig`、Pixi、rendercore 或 gameframeworks 运行期 import 之外的额外逻辑。
- `--check` 能发现 generated TS 不同步。
- `packages/gameframeworks/static-config` runtime validator 对生成后的 `featureBars` 做同等校验。

推荐命令：

```bash
pnpm --filter buildgamestatic test
pnpm --filter buildgamestatic typecheck
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
```

### 10.3 game003

新增或更新测试必须覆盖：

- `bg-bar-sequence` 正确解析样例 `features: ["normal","wild","wild","wild","up"]`。
- `features` 长度不是 5、未知 feature、triggered 但缺 component、component 缺 `features`、`@type` 不匹配、`basicComponentData` 缺失或引用 scene/result 都显式失败。
- 横屏 slot 映射：spin 前 `features[0]` 在倒数第二格，shift 后进入最下方终点格；`features[4]` 从入口格出现。
- 竖屏 slot 映射：spin 前 `features[0]` 在右数第二格，shift 后进入最右方终点格；`features[4]` 从入口格出现。
- `bgBarRuntime` 完成后 idle 队列变为 `[features[1], features[2], features[3], features[4]]`，终点 symbol 隐藏。
- 下一次 spin 的 `features[0..3]` 和当前 idle 队列不一致时显式失败。
- `apps/game003/tests/fixtures/game003-gmi.ts` 中真实 raw GMI fixture 能通过 `createSlotGameLogicResult(...)` 进入 `createGame003BgBarSpinPlan(...)`，不能只测手写 helper 输入。
- `game-adapter` 在 `playSpin()` 开始时启动 bg-bar，而不是等主转轮完成。
- `playSpin()` 等待 bg-bar 完成后才 resolve。
- `bg-bar` 与现有 `bg-wins`、win amount 并存时，完成条件是三者全部完成。
- `destroy()` 会 destroy bg-bar runtime，pending promise 被 reject。
- static texture / symbol loader 会加载 `wild.png` 和 `up.png`，不会尝试加载 `normal.png`。
- `loading-resources.test.ts` 必须包含 `game003-bg-bar-symbol-pngs:wild.png`、`game003-bg-bar-symbol-pngs:up.png` 和可选 manifest path resource；同时断言不会出现 `normal.png`。
- `static-config.test.ts` 必须锁定 `featureBars.bgBar` 的 componentName、queueLength、visibleCount、terminalSlotIndex、allowedFeatures、manifest、slot rect 数量和横竖屏 movement。
- `source-boundary.test.ts` 锁定 `bg-bar` 字符串不进入 `packages/rendercore`、`packages/logiccore`、`packages/gameframeworks` 源码。

推荐命令：

```bash
pnpm --filter game003 test
pnpm --filter game003 typecheck
pnpm --filter game003 check:static-config
pnpm --filter game003 build
```

### 10.4 symbolsviewer

如果更新了 viewer，至少执行：

```bash
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
```

如果该 app 没有这些脚本，执行对应 package 可用的 `lint` / `build` / `typecheck`，并在报告中写清楚。

## 11. 非浏览器验收命令

完整实现后按顺序执行：

```bash
git status --short --untracked-files=all
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter buildgamestatic test
pnpm --filter buildgamestatic typecheck
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
pnpm --filter game003 generate:static-config
pnpm --filter game003 check:static-config
pnpm --filter game003 test
pnpm --filter game003 typecheck
pnpm --filter game003 build
pnpm --filter game003 release:check
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
pnpm format:check
git diff --check
```

如果 root `pnpm format:check` 或其它 root turbo 命令因为无关旧包失败，不能直接宣布通过。必须：

1. 记录失败命令、失败包、失败原因。
2. 对本任务影响包执行 package-local 等价命令。
3. 在任务报告中区分“本任务相关失败”和“仓库既有无关失败”。

边界 grep：

```bash
rg -n '"bg-bar"|GAME003_BG_BAR|FeatureBar2Data|"wild"|"up"|conveyor1|conveyor2|mainreelbg' packages/rendercore packages/logiccore packages/gameframeworks
rg -n 'conveyor\.height / 5|conveyor\.width / 5|height / 5|width / 5' apps/game003/src apps/game003/tests
rg -n 'normal\.png|transparent\.png|empty\.png' assets/game003-s1 apps/game003/src packages/rendercore/src
rg -n 'bg-bar' apps/game003/src apps/game003/tests apps/game003/config tasks agents.md
```

第一条命令理想结果是在 shared packages 源码中没有 game003 专属字符串。如果测试或 generated 文件中出现，需要逐项解释。`rg` 找不到内容时 exit code 为 1，这是可接受结果。

## 12. 浏览器验收

实现完成后建议启动：

```bash
pnpm --filter game003 dev -- --host 127.0.0.1
```

浏览器验收点：

- 首屏仍先走 `packages/gameloading`，loading 99% 才 live 初始化，100% 后才创建 gameframeworks / Pixi 画面。
- 横屏下 `bg-bar` symbol 在 `conveyor1.png` 上方，`features[0]` 初始位于倒数第二格，spin 时下移到最下方火焰格，播放 win 后消失。
- 横屏下 `features[4]` 在本次 shift 后进入最上方格。
- 竖屏下 `bg-bar` symbol 在 `conveyor2.png` 上方，`features[0]` 初始位于右数第二格，spin 时右移到最右方火焰格，播放 win 后消失。
- 竖屏下 `features[4]` 在本次 shift 后进入最左方格。
- `normal` 透明 feature 不显示图片、不出现白块黑块，但占位和移动节奏不能破坏其它 feature。
- 主转轮、`bg-wins`、中奖金额动画仍按原合同运行。
- 旧 URL query 中 `serverUrl` 仍显式失败，不能因为本任务改静态配置而松动。

如果执行者无法做浏览器验收，任务报告必须明确写“浏览器验收未执行”，并把上述点作为交给人工验收的清单，不能把非浏览器测试等同于浏览器通过。

## 13. 文档和协作规则同步

根据实现结果更新：

```text
apps/game003/README.md
agents.md
```

`agents.md` 如果需要新增规则，建议写入以下合同：

- `game003 bg-bar` 使用独立 manifest `assets/game003-s1/bg-bar-symbol-state-textures.manifest.json`，不要复用主转轮 symbol manifest。
- `bg-bar normal` 是 rendercore 显式透明 symbol，不新增透明 PNG，不把缺图当空 symbol，也不要配置成主转轮 `emptySymbols` 那种无 RenderSymbol 占位。
- `bg-bar.features` 固定长度 5，spin 前展示前 4 个，`features[0]` 在倒数第二格或右数第二格，spin 时进入终点格播放 win 后消失，`features[4]` 从入口格出现。
- `bg-bar` 的 slot 坐标必须由 YAML 显式配置，不在 app 中按 conveyor 尺寸等分推导。
- `bg-bar` 组件名和 `wild` / `up` / 传送带玩法语义只能在 `apps/game003` app 层配置和识别；`logiccore` / `gameframeworks` / `rendercore` 只能提供通用数据、静态配置、透明 symbol、standalone catalog 和动画能力。

## 14. 任务报告要求

完成后新增：

```text
tasks/72-game003-bg-bar-feature-[utctime].md
```

报告必须是中文，至少包含：

- 实现摘要。
- 变更文件清单，区分源码、资源、生成物、测试、文档。
- `bg-bar` 数据合同和横竖屏 slot 映射最终实现说明。
- 透明 normal symbol 的 rendercore 实现说明。
- 是否更新 `agents.md`，如果未更新，说明为什么不必要。
- 所有执行过的命令和结果。
- 未执行的命令、失败命令、失败原因和风险判断。
- 浏览器验收结果或交给人工验收的清单。
- 是否有 `pnpm-lock.yaml` 变化。
- 是否存在未处理的已知问题。

## 15. 二次遗漏检查清单

交付前必须逐项检查：

- 目标树：新增 manifest、YAML、generated TS、game003 runtime、rendercore generic 能力、tests、README、agents 是否齐全。
- 数据合同：`bg-bar.features` 长度、feature 白名单、队列同步、缺 component 行为是否测试覆盖。
- 视觉合同：横屏向下、竖屏向右、终点格、入口格、normal 透明、slot 坐标显式配置是否测试覆盖。
- shared 边界：`bg-bar`、`wild`、`up`、`conveyor1`、`conveyor2` 没有进入 `logiccore` / `gameframeworks` / `rendercore` 专属逻辑。
- 生成物：修改 YAML 后已跑 `generate:static-config` 和 `check:static-config`，没有手改 generated 文件。
- loading：`wild.png` / `up.png` 进入 loading，`normal` 不加载图片，宽泛 glob 没有混入其它资源。
- symbolsviewer：如果同步了 viewer，透明 normal 可预览或至少可被识别为空占位。
- 生命周期：mount、viewport resize、playSpin、destroy、pending reject 都覆盖 bg-bar。
- 完成条件：`playSpin()` 不早于 bg-bar、bg-wins、win amount 完成。
- 报告：任务报告命名、UTC 时间、命令结果和浏览器验收状态齐全。
