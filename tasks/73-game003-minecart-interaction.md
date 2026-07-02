# game003 minecart interaction 任务计划

## 1. 任务目标

本任务为 `apps/game003` 增加 `bg-bar` 终点后的矿车互动表现：

- 玩家点击 spin 后，主转轮和 `bg-bar` 传送带必须立即同时启动。
- `bg-bar` 要比任务 72 当前版本更快完成 shift，终点格 symbol 的 `win` 动画也要缩短。
- 当 `features[0]` 对应的 symbol 移动到传送带终点格、终点 `win` 动画完成、该终点 symbol 隐藏以后，矿车携带同一个 feature symbol 从屏幕外快速冲入。
- 矿车必须沿背景里主转轮区下方的轨道运行，横屏和竖屏都要按各自背景轨道校准。
- 矿车停在主转轮区下面中间，刹车动作要有夸张的卡通力度：快速冲入、轻微冲过头、倾翻、重重回正。
- 矿车里的 symbol 随后垂直飞到主转轮区中间，飞行很快，过程中半透明并最终消失。
- 整个 `bg-bar` shift、终点 win、矿车冲入和 symbol 飞入消失，必须在主转轮停轴以前完成。
- `playSpin()` 仍然必须等待主转轮、`bg-bar`/矿车互动、`bg-wins` 和中奖金额动画全部完成后再 resolve。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/73-game003-minecart-interaction-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/73-game003-minecart-interaction-260702-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/minecart2
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

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
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter @slotclientengine/gameframeworks test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。缺少 `minecart.png`、矿车配置缺字段、loading resource id 找不到、图片尺寸漂移、横竖屏轨道配置缺失、动画运行中重复启动、生成物不同步、`bg-bar` 数据非法，都必须尽早抛错，不要用占位图、默认坐标、静默跳过或自动修复掩盖问题。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 已有任务 72 行为

任务 72 已完成 `bg-bar` 传送带：

- `apps/game003/src/bg-bar-sequence.ts` 从 step 0 读取 `logic.getStep(0).getComponent("bg-bar")`。
- feature 只允许 `normal | wild | up`。
- 每次 spin 的 `features` 长度固定 5。
- `features[0]` 从 `slot 3` 移到 `slot 4`，是本轮终点格 symbol。
- `features[1]`、`features[2]`、`features[3]` 分别从 `slot 2/1/0` 移到 `slot 3/2/1`。
- `features[4]` 从传送带外进入 `slot 0`。
- 当前 `apps/game003/src/bg-bar-runtime.ts` 里 `GAME003_BG_BAR_SHIFT_DURATION_SECONDS = 0.45`。
- 当前 `assets/game003-s1/bg-bar-symbol-state-textures.manifest.json` 里 `normal/wild/up` 的 `win.durationSeconds = 0.58`。
- `apps/game003/src/game-adapter.ts` 在 `playSpin()` 启动主转轮时同步启动 `bg-bar`，并把 `bg-bar` 纳入 resolve 等待条件。

### 3.2 资源现状

当前已存在资源：

```text
assets/game003-s1/conveyor1.png   284 x 775
assets/game003-s1/conveyor2.png   934 x 227
assets/game003-s1/mainreelbg.png  1130 x 824
assets/game003-s1/wild.png        172 x 158
assets/game003-s1/up.png          172 x 130
```

需求指定矿车图片在：

```text
assets/game003-s1/minecart.png
```

当前本地快照中该文件不存在。实施本任务时必须先确认美术资源已放入该路径：

```bash
file assets/game003-s1/minecart.png
sips -g pixelWidth -g pixelHeight assets/game003-s1/minecart.png
```

如果 `minecart.png` 不存在或尺寸无法确认，任务必须阻断并在报告中说明，不能新增临时占位图继续实现。

### 3.3 关键文件

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

game003 runtime：

```text
apps/game003/src/assets.ts
apps/game003/src/bg-bar-layout.ts
apps/game003/src/bg-bar-runtime.ts
apps/game003/src/bg-bar-sequence.ts
apps/game003/src/game-adapter.ts
apps/game003/src/game-layout.ts
apps/game003/src/skin-config.ts
apps/game003/src/loading-resources.ts
apps/game003/scripts/verify-static-dist.mjs
```

现有测试入口：

```text
apps/game003/tests/assets.test.ts
apps/game003/tests/bg-bar-layout.test.ts
apps/game003/tests/bg-bar-runtime.test.ts
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/game-layout.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/source-boundary.test.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/buildgamestatic/tests/generator.test.ts
packages/gameframeworks/tests/static-config.test.ts
```

## 4. 边界和非目标

- 矿车互动属于 `apps/game003` app 层，不属于 `packages/rendercore`、`packages/logiccore` 或 `packages/gameframeworks` 的玩法语义。
- 不要把 `minecart`、矿车轨道、刹车、`bg-bar`、`wild`、`up`、`conveyor1`、`conveyor2` 等专有语义硬编码进 shared 包。
- 如果为了让 YAML 能承载 app 专属配置，需要更新 shared 静态配置类型，shared 层只能新增通用 `appExtensions` 透传字段，不能在 shared 层理解 `minecart` 的业务含义。
- `packages/rendercore` 只能继续提供通用 symbol、viewport、anchor/focus rect 和 Pixi slot 能力。
- `apps/game003` 不能直接依赖 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore` 或 `@slotclientengine/vnicore`。
- 不改 live server、`gamecode`、URL query 合同、服务器协议、`FeatureBar2Data` 数据形状或本地公开轮带边界。
- 不通过拉长主转轮停轴时间来“满足”矿车动画完成要求；矿车节奏应在现有主转轮停轴前完成。
- 不新增透明 PNG；`normal` 继续使用 `bg-bar-symbol-state-textures.manifest.json` 中的透明 symbol。
- 如果终点 feature 是 `normal`，只播放并完成 `bg-bar` 终点流程，不触发矿车互动，也不播放透明空载矿车。

## 5. 体验和时间合同

推荐时间预算：

```text
bg-bar shift:                 0.28s
bg-bar terminal win:           0.24s
minecart rush + brake settle:  0.38s
payload symbol fly + fade:     0.36s
total:                         1.26s
```

验收硬约束：

- 总互动时长必须小于 `1.30s`。
- 总互动时长必须小于当前主转轮基础落停时间 `DEFAULT_GAME003_REEL_CONFIG.baseDurationMs / 1000`。
- 不能为了该约束修改 `apps/game003/config/game-static.yaml` 的主转轮 `baseDurationMs`、`speedSymbolsPerSecond`、`minimumSpinCycles`、`startDelayMs` 或 `stopDelayMs`。

需要调整：

- 将 `GAME003_BG_BAR_SHIFT_DURATION_SECONDS` 从 `0.45` 调整到约 `0.28`。
- 将 `assets/game003-s1/bg-bar-symbol-state-textures.manifest.json` 中 `normal/wild/up` 的 `win.durationSeconds` 从 `0.58` 调整到约 `0.24`。
- 对应更新 `apps/game003/tests/bg-bar-runtime.test.ts` 里终点 win 完成时间，不要在测试里写奇怪等待绕过真实动画时长。
- 同步检查 `apps/symbolsviewer` 的 `game003-bg-bar` 预览是否仍从同一 manifest 读取时长；不需要新增 viewer 专属配置，但不能让 viewer 和 runtime 看到两份不同 manifest。

矿车动作要求：

- 冲入起点必须在当前可见画面外，而不是只在 focusRect 外。
- 停点必须在主转轮区下方中间，并落在背景轨道视觉上。
- 刹车时允许短暂超过停点再回弹，倾斜角建议峰值在 `10` 到 `16` 度之间，随后反向回弹并回正。
- symbol 飞行目标取当前主转轮可见区中心，不写死固定坐标。
- symbol 飞行应近似垂直；如果横竖屏校准导致起点 x 与主转轮中心有轻微偏差，应在进入飞行前把 payload anchor 校准到主转轮中心下方，而不是斜飞穿过画面。

## 6. 静态配置和资源方案

### 6.1 YAML loading 资源

在 `apps/game003/config/game-static.yaml` 的 `loading.resources` 中新增明确 path，不使用宽泛 glob：

```yaml
- id: game003-minecart
  path: assets/game003-s1/minecart.png
  weight: 1
```

新增后必须重新生成：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

`apps/game003/src/generated/game-loading.generated.ts` 是生成物，禁止手改。

### 6.2 appExtensions 透传配置

为了把矿车轨道、payload anchor、时间参数放入可编辑静态配置，同时不把 `minecart` 语义放进 shared 包，新增一个通用 app 扩展字段：

```yaml
skins:
  "1":
    appExtensions:
      game003MinecartInteraction:
        loadingResourceId: game003-minecart
        imageSize:
          width: <用 sips/file 确认 minecart.png 宽度>
          height: <用 sips/file 确认 minecart.png 高度>
        timing:
          cartRushDurationSeconds: 0.38
          symbolFlyDurationSeconds: 0.36
          maxTotalBeforeReelStopSeconds: 1.3
        motion:
          overshootPixels: 34
          brakeTiltDegrees: 14
          reboundTiltDegrees: -8
        payload:
          symbolScale: 0.72
          fadeStartAlpha: 1
          fadeEndAlpha: 0
        layout:
          landscape:
            entrySide: left
            offscreenMargin: 120
            # 相对当前横屏 focusRect，停点仍需通过测试确认在主转轮区下方轨道上。
            stopOffsetFromReelAreaBottomCenter: { x: 0, y: <按横屏轨道校准> }
            cartPivotInImage: { x: <矿车宽度/2>, y: <按车轮或车身重心校准> }
            payloadAnchorInImage:
              { x: <矿车装载区中心 x>, y: <矿车装载区中心 y> }
          portrait:
            entrySide: left
            offscreenMargin: 120
            # 相对当前竖屏 focusRect，停点仍需通过测试确认在主转轮区下方轨道上。
            stopOffsetFromReelAreaBottomCenter: { x: 0, y: <按竖屏轨道校准> }
            cartPivotInImage: { x: <矿车宽度/2>, y: <按车轮或车身重心校准> }
            payloadAnchorInImage:
              { x: <矿车装载区中心 x>, y: <矿车装载区中心 y> }
```

实施要求：

- `appExtensions` 是通用透传字段，允许存在于 `packages/gameframeworks/src/static-config/types.ts` 和 `validate.ts`，但 shared 包不得出现 `game003MinecartInteraction`、`minecart`、`cartRush` 等专有字段名。
- `apps/buildgamestatic/src/types.ts`、`yaml-loader.ts`、`generator.ts` 负责把 `appExtensions` 原样输出到 `game-static.generated.ts`。它只校验 `appExtensions` 是 object，不理解内部语义。
- `apps/game003` 新增 app 层解析函数严格校验 `game003MinecartInteraction` 的所有字段。
- `loadingResourceId` 必须从 `GAME003_LOADING_RESOURCE_URLS` 中查找得到 `minecart.png` URL。找不到要显式失败。
- `imageSize` 必须和实际加载出来的 `minecart.png` texture 尺寸一致。尺寸漂移要显式失败。
- `stopOffsetFromReelAreaBottomCenter` 只描述停点相对主转轮可见区底部中心的偏移；运行时 stop point = `layout.sceneParts.reelArea` 底部中心 + 该 offset。
- offscreen start point 不写死到 YAML。运行时用当前 `layout.visibleRect`、`imageSize` 和 `cartPivotInImage` 推导 pivot 位置：`entrySide=left` 时 `x = visibleRect.x - cartPivotInImage.x - offscreenMargin`，`entrySide=right` 时 `x = visibleRect.x + visibleRect.width + (imageSize.width - cartPivotInImage.x) + offscreenMargin`，`y` 使用 stop point 的 y。
- 所有 YAML 新字段必须保留中文注释，说明坐标基准、修改边界和不能放运行期数据。

## 7. 实现步骤

### 7.1 预检和资源确认

执行：

```bash
git status --short --untracked-files=all
git diff --stat
file assets/game003-s1/minecart.png
sips -g pixelWidth -g pixelHeight assets/game003-s1/minecart.png
```

如果 `minecart.png` 缺失，停止任务并在报告中写明阻断原因。

### 7.2 扩展静态配置透传

修改：

```text
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/tests/static-config.test.ts
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/buildgamestatic/tests/generator.test.ts
```

要求：

- `SlotGameStaticSkinConfig` / `GameStaticYamlSkinConfig` 新增可选 `appExtensions?: Readonly<Record<string, unknown>>`。
- 校验只确认 `appExtensions` 是普通 object，不能是数组或 null。
- `appExtensions` 内部允许由 app 层自行校验，shared 层不做深层字段白名单。
- generator 输出 `appExtensions: Object.freeze(<json> as const)`。
- 保持其它字段 unknown-field fail-fast，不要因为新增 `appExtensions` 放松整个 YAML / static-config 校验。
- `apps/buildgamestatic/tests/generator.test.ts` 的 fixture root 必须补 `assets/game003-s1/minecart.png`，否则新增 loading path 会让测试夹具和真实配置脱节。

### 7.3 新增 game003 矿车配置解析

新增文件：

```text
apps/game003/src/minecart-interaction-config.ts
```

建议导出：

```ts
export interface Game003MinecartInteractionConfig {
  readonly loadingResourceId: "game003-minecart";
  readonly imageSize: { readonly width: number; readonly height: number };
  readonly timing: {
    readonly cartRushDurationSeconds: number;
    readonly symbolFlyDurationSeconds: number;
    readonly maxTotalBeforeReelStopSeconds: number;
  };
  readonly motion: {
    readonly overshootPixels: number;
    readonly brakeTiltDegrees: number;
    readonly reboundTiltDegrees: number;
  };
  readonly payload: {
    readonly symbolScale: number;
    readonly fadeStartAlpha: number;
    readonly fadeEndAlpha: number;
  };
  readonly layout: Record<
    "landscape" | "portrait",
    Game003MinecartLayoutConfig
  >;
}

export function getGame003MinecartInteractionConfig(
  appExtensions: unknown,
): Game003MinecartInteractionConfig;
```

校验规则：

- `loadingResourceId` 必须等于 `game003-minecart`。
- duration 必须是正数。
- `maxTotalBeforeReelStopSeconds` 必须 `> 0` 且 `<= 1.3`。
- `cartRushDurationSeconds + symbolFlyDurationSeconds + bg-bar shift + terminal win` 必须 `<= maxTotalBeforeReelStopSeconds`。
- `symbolScale` 必须 `> 0`。
- alpha 必须在 `[0, 1]`，且 `fadeEndAlpha <= fadeStartAlpha`。
- layout 必须同时包含 `landscape` 和 `portrait`。
- `entrySide` 只允许 `left | right`。
- `offscreenMargin` 必须为非负数。
- `cartPivotInImage` 和 `payloadAnchorInImage` 必须落在 `imageSize` 范围内。

将解析结果接入：

```text
apps/game003/src/skin-config.ts
```

在 `Game003SkinConfig` 上新增：

```ts
readonly minecartInteraction: Game003MinecartInteractionConfig;
```

### 7.4 加载矿车贴图

修改：

```text
apps/game003/src/game-adapter.ts
apps/game003/src/game-layout.ts
apps/game003/src/loading-resources.ts
apps/game003/scripts/verify-static-dist.mjs
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/game-adapter.test.ts
```

要求：

- `Game003StaticTextures` 新增 `minecart: Texture`。
- `loadStaticTextures(...)` 从 `GAME003_LOADING_RESOURCE_URLS` 通过 `game003-minecart` id 获取 URL，再调用 `loadTextureWithSize(...)` 校验尺寸。
- URL 查找建议放在一个轻量 helper 中，该 helper只 import `src/generated/game-loading.generated.ts`；不要让 `game-adapter.ts` 为了找 URL 反向 import 带 `@slotclientengine/gameloading` 类型和动态 runtime module 逻辑的 `loading-resources.ts`。
- 矿车尺寸可以使用 `skin.minecartInteraction.imageSize` 校验；如同步补到 `GAME003_ASSET_SIZE`，必须保证它只来自生成配置解析结果，不维护第二份手写尺寸表。
- 不要用宽泛 glob 或手写 fallback URL。
- 如果 `GAME003_LOADING_RESOURCE_URLS` 没有 `game003-minecart`，显式抛错。
- `default loaders validate static texture sizes` 测试要覆盖 `minecart.png`。
- `apps/game003/tests/loading-resources.test.ts` 必须断言 `game003-minecart` 出现在 loading resources 中，且不引入 token、serverUrl 或宽泛 `*.png`。
- `apps/game003/scripts/verify-static-dist.mjs` 必须把 `minecart.png` 纳入 dist 内容校验，不能只依赖 `game003 release:check` 间接 build 成功。

### 7.5 新增矿车布局和 runtime

新增文件：

```text
apps/game003/src/minecart-interaction-layout.ts
apps/game003/src/minecart-interaction-runtime.ts
apps/game003/tests/minecart-interaction-layout.test.ts
apps/game003/tests/minecart-interaction-runtime.test.ts
```

布局函数建议：

```ts
export interface Game003MinecartInteractionLayout {
  readonly orientation: "landscape" | "portrait";
  readonly cartStartCenter: Point;
  readonly cartStopCenter: Point;
  readonly payloadStartCenter: Point;
  readonly payloadTargetCenter: Point;
  readonly cartPivotInImage: Point;
  readonly payloadAnchorInImage: Point;
}

export function createGame003MinecartInteractionLayout(options: {
  readonly layout: Game003Layout;
  readonly config: Game003MinecartInteractionConfig;
}): Game003MinecartInteractionLayout;
```

runtime 建议：

```ts
export interface Game003MinecartInteractionRuntime {
  readonly container: Container;
  applyLayout(layout: Game003MinecartInteractionLayout): void;
  reset(): void;
  start(feature: Game003BgBarFeature): void;
  update(deltaSeconds: number): { readonly completed: boolean };
  isPlaying(): boolean;
  getSnapshot(): Game003MinecartInteractionSnapshot;
  destroy(): void;
}
```

runtime 要求：

- 使用 `Texture` 创建矿车 `Sprite`。
- 使用 `createStandaloneSymbolCatalog(...)` 和 `bg-bar` 的 symbol assets 创建 payload symbol，避免复制 manifest schema 或手动拼 PNG。
- `mount()` 阶段已经加载了 `bgBarSymbolTextures`；矿车 runtime 必须复用这一份已加载 symbol assets，不要为了 payload 再走一次 `Assets.load` 或再建一套独立 URL 解析。
- 建议 runtime options 显式包含 `config`、`minecartTexture`、`symbolAssets`，这样测试可注入 fake texture 和 fake symbol assets。
- `start(feature)` 接收终点 feature，即本轮 `features[0]`。
- `normal` feature 不启动矿车；只有 `wild` / `up` 等非 normal 终点 feature 才启动矿车 payload。
- `cart-rush` 阶段：矿车从屏幕外起点移动到 stop point，带 overshoot 和回弹 rotation。
- `symbol-fly` 阶段：矿车保持停在轨道，payload 从车厢 anchor 垂直飞到主转轮中心并 fade 到 `0`。
- `Sprite` / `Container` 的 pivot 必须使用 `cartPivotInImage`，payload 在车厢里的起点必须使用 `payloadAnchorInImage`；测试要覆盖 pivot 不在图片中心时起点仍在屏幕外、停点仍落在轨道上。
- 完成后 cart 可保持停在轨道上但 `isPlaying()` 必须为 false；下一次 `reset()` 或 `start()` 前必须清理旧 payload。
- `destroy()` 可重复调用；destroy 后继续 update/apply/start 要显式失败或保持现有 runtime 一致策略。
- `update(deltaSeconds)` 对 NaN、负数、无限大显式失败。
- resize 时 `applyLayout(...)` 要能在非播放和播放中重算当前位置。播放中按当前 phase progress 映射到新布局，不能把矿车瞬间跳回起点。

### 7.6 扩展 bg-bar update 事件

修改：

```text
apps/game003/src/bg-bar-runtime.ts
apps/game003/tests/bg-bar-runtime.test.ts
```

将 `update(...)` 返回值扩展为稳定类型，例如：

```ts
export interface Game003BgBarRuntimeUpdateResult {
  readonly completed: boolean;
  readonly terminalFeatureCompleted?: Game003BgBarFeature;
}
```

要求：

- 只有终点 symbol 的 `win` 完成、终点 symbol 隐藏、`settleItems(...)` 执行之后，才返回 `terminalFeatureCompleted: features[0]`。
- 该事件每次 spin 只能返回一次。
- 如果没有终点 symbol，继续显式失败。
- 不要让 adapter 通过 snapshot 猜 terminal feature。

### 7.7 接入 game-adapter 播放编排

修改：

```text
apps/game003/src/game-adapter.ts
apps/game003/tests/game-adapter.test.ts
```

要求：

- `Game003AdapterOptions` 增加可注入的 `createMinecartInteractionRuntime`，方便测试。
- `mount()` 创建 minecart runtime，并把 container 加入 `worldLayer`。
- 建议层级：

```text
background
conveyor
bgBarRuntime.container
mainReelBackground
runtime.mainReelsLayer
minecartInteraction.container
winAmountPlayer.container
```

- `playSpin()` 仍然先 `runtime.spinToScene(...)`，再 `bgBarRuntime.startSpin(...)`。
- 在 tick 中读取 `bgBarRuntime.update(...)` 的 `terminalFeatureCompleted` 事件后，立即 `minecartRuntime.start(feature)`。
- `PendingAnimation` 增加 `minecartExpected` 或将其纳入 `bgBarExpected` 的完成判断，确保 `playSpin()` 不会在矿车 symbol 飞行未完成时 resolve。
- 如果 `bg-bar` 未触发，本轮不启动矿车。
- 如果 `bg-bar` 触发但 minecart runtime/config 缺失，显式失败。
- 测试必须覆盖：矿车不会在 spin 开始立即启动，而是在 terminal win 完成后启动；promise 等待矿车；矿车完成后若主转轮还没停，promise 仍等待主转轮。
- `setFrameworkState(_state)` 当前不驱动 fast mode；本任务不把 fast mode 引入矿车时序，也不因 fast mode 修改矿车或主转轮时长。若后续要让 fast mode 影响动画，需要另开任务。
- mount 中任一 loader 或 runtime 创建失败时，已创建的 Pixi app、ticker、runtime 和 live session 清理必须保持现有 `enterGame003()` / adapter destroy 合同；不要让矿车 loader 失败留下半挂载 canvas。

### 7.8 文档和协作规则同步

修改：

```text
apps/game003/README.md
agents.md
```

README 需要补充：

- `minecart.png` 资源。
- `appExtensions.game003MinecartInteraction` 的用途、坐标基准、loading resource id。
- 矿车互动的播放顺序和时间预算。
- `normal` 只完成 `bg-bar`，不触发矿车的合同。
- `playSpin()` 等待条件包含矿车互动。

`agents.md` 需要补充仓库协作规则：

- `game003` 矿车互动属于 `apps/game003` app 层。
- shared 包不能硬编码 minecart 专属语义。
- `minecart.png`、轨道停点、payload anchor、时间预算来自 YAML/app 扩展配置，缺失要显式失败。
- 矿车互动必须在主转轮停轴前完成，不能通过延长主转轮停轴时间掩盖节奏问题。

## 8. 测试计划

### 8.1 buildgamestatic / gameframeworks

新增或更新：

- `apps/buildgamestatic/tests/yaml-loader.test.ts`
  - 允许 `skins."1".appExtensions`。
  - 拒绝 `appExtensions: null` 和数组。
  - 保持其它未知字段仍然失败。
- `apps/buildgamestatic/tests/generator.test.ts`
  - 生成 `appExtensions`。
  - 不生成任何 minecart 专属代码。
  - fixture root 中包含 `minecart.png`，loading path 资源能被真实文件校验覆盖。
- `packages/gameframeworks/tests/static-config.test.ts`
  - 允许 skin 级 `appExtensions`。
  - 保持 static config 根级、art、featureBars、winAmount 的 unknown-field fail-fast。

### 8.2 game003 config/assets

新增或更新：

- `apps/game003/tests/static-config.test.ts`
  - `GAME003_LOADING_RESOURCE_URLS` 包含 `game003-minecart`。
  - `getGame003SkinConfig("1").minecartInteraction` 解析成功。
  - 总互动预算小于 `DEFAULT_GAME003_REEL_CONFIG.baseDurationMs / 1000`。
- `apps/game003/tests/loading-resources.test.ts`
  - `createGame003LoadingResources()` 包含 `game003-minecart`，且 id 不重复、URL 不重复。
  - generated loading resource 中不泄露 `serverUrl`、token、cookie。
- `apps/game003/tests/assets.test.ts`
  - 校验 minecart URL 查找和 texture size check。
- `apps/game003/scripts/verify-static-dist.mjs`
  - `REQUIRED_SCENE_ASSETS` 或等价内容校验必须包含 `minecart-*.png`。
  - dist hash 校验必须能证明源 `assets/game003-s1/minecart.png` 被打包。
- `apps/game003/tests/source-boundary.test.ts`
  - `minecart` 只出现在 `apps/game003`、`assets/game003-s1`、`tasks`、README、`agents.md` 等允许范围。
  - shared 包里不出现 `minecart` 专属语义。

### 8.3 layout/runtime

新增：

- `apps/game003/tests/minecart-interaction-layout.test.ts`
  - 横屏/竖屏 stop point 位于主转轮可见区底部中心下方。
  - start point 在对应 `layout.visibleRect` 外。
  - payload target 是 `layout.sceneParts.reelArea` 中心。
  - invalid config 显式失败。
- `apps/game003/tests/minecart-interaction-runtime.test.ts`
  - `start("wild")` 后按时间推进经历 `cart-rush`、`symbol-fly`、完成。
  - rush 中有 overshoot 和非零 rotation，完成后 rotation 回到 `0`。
  - payload alpha 从 `fadeStartAlpha` 下降到 `fadeEndAlpha`，完成后不可见或 alpha 为 `0`。
  - `start("normal")` 显式失败；normal 终点由 adapter 跳过矿车。
  - pivot 不等于图片中心时，start/offscreen/stop/payload anchor 仍按配置正确计算。
  - 重复 start、非法 delta、destroy 后操作显式失败。
  - 播放中 applyLayout 不会重置 progress。

### 8.4 bg-bar / adapter

更新：

- `apps/game003/tests/bg-bar-runtime.test.ts`
  - shift 时间改为新值。
  - terminal win 缩短。
  - `terminalFeatureCompleted` 只在终点 symbol 隐藏后返回一次。
- `apps/game003/tests/game-adapter.test.ts`
  - mount 创建并 layout minecart runtime。
  - `bg-bar` terminal event 后才启动 minecart。
  - `playSpin()` 同时等待主转轮、`bg-bar`、minecart、`bg-wins`、win amount。
  - minecart 完成早于主转轮时，promise 不提前 resolve。
  - destroy 时销毁 minecart runtime，pending promise reject。

## 9. 验收命令

资源确认：

```bash
file assets/game003-s1/minecart.png
sips -g pixelWidth -g pixelHeight assets/game003-s1/minecart.png
```

生成和单包检查：

```bash
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
```

如果 shared 静态配置包或生成器被改动，也执行：

```bash
CI=true pnpm --filter buildgamestatic build
CI=true pnpm --filter @slotclientengine/gameframeworks format:check
CI=true pnpm --filter buildgamestatic format:check
```

边界 grep：

```bash
rg -n 'minecart|Minecart|game003MinecartInteraction|game003-minecart' packages/rendercore packages/logiccore packages/gameframeworks
```

预期：无匹配。如果为了通用 `appExtensions` 改了 shared 包，shared 包里也不应出现 minecart 专有词。

```bash
rg -n 'height\s*/\s*5|width\s*/\s*5|conveyor.*\/\s*5' apps/game003/src apps/game003/tests apps/game003/config
```

预期：无匹配。不要重新引入按 conveyor 宽高等分推导 slot 的逻辑。

```bash
rg -n 'minecart\.png|game003-minecart|game003MinecartInteraction' apps/game003 assets/game003-s1 tasks agents.md
```

预期：只出现在本任务相关配置、runtime、测试、README、任务计划/报告和 `agents.md`。

```bash
rg -n 'baseDurationMs|speedSymbolsPerSecond|minimumSpinCycles|startDelayMs|stopDelayMs' apps/game003/config/game-static.yaml apps/game003/src apps/game003/tests
```

预期：除了读取/断言现有值外，不应出现为了矿车互动修改主转轮时长的变更。

最终清理：

```bash
git diff --check
```

任务计划和任务报告格式化可用：

```bash
./node_modules/.bin/prettier --check tasks/73-game003-minecart-interaction.md
```

如果根级 `pnpm format:check` 因未触碰包的既有格式问题失败，任务报告必须写清楚失败文件，并证明本任务触碰包和触碰文件的 format check 已通过。不要为了本任务扩大修改无关包。

## 10. 浏览器验收建议

实现完成后启动：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

验收 URL 仍使用固定 live server，不允许 `serverUrl` query：

```text
http://127.0.0.1:5208/?skin=1&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
```

人工检查：

- loading 仍先到 `99%`，live 初始化成功后到 `100%`，再挂载游戏。
- 点击 spin 后主转轮和 `bg-bar` 同时开始。
- `bg-bar` shift 更快，终点 win 不拖沓。
- 终点 symbol 消失后矿车立即从屏幕外冲入。
- 横屏矿车沿横屏背景轨道跑，竖屏矿车沿竖屏背景轨道跑。
- 矿车停在主转轮区下面中间，刹车倾翻和回正有力度。
- symbol 从车厢垂直飞到主转轮中心并淡出消失。
- 该互动完成后主转轮才停下来。
- 后续 `bg-wins` 和中奖金额动画仍按原合同播放。
- 连续 spin 不残留旧矿车、旧 payload、重复 ticker 或重复 WebSocket。

## 11. 最终任务报告要求

完成后新增：

```text
tasks/73-game003-minecart-interaction-[utctime].md
```

报告必须包含：

- 结论。
- 实际修改文件列表。
- `minecart.png` 的最终尺寸和校验结果。
- 最终时间参数：shift、terminal win、cart rush、payload fly、总互动时长。
- 横屏和竖屏轨道/停点/payload anchor 的最终数值。
- 说明 `normal` payload 的处理。
- 说明是否更新 `agents.md`。
- 完整验收命令和结果。
- 若有未执行或失败的检查，写明原因、是否与本任务相关、后续处理建议。
- 浏览器人工验收如果不是执行者完成，不能写成已通过，只能写成待人工验收。

## 12. 二次遗漏检查清单

提交前逐项确认：

- `minecart.png` 存在且尺寸与 YAML/app config 一致。
- `game-loading.generated.ts` 包含 `game003-minecart`。
- `game-static.generated.ts` 包含 `appExtensions`，且由 generator 生成，不是手改。
- `appExtensions` 没有让 shared 包理解 minecart 语义。
- `verify-static-dist.mjs` 已覆盖 `minecart.png`，release check 不会漏掉该资源。
- `bg-bar` terminal event 只发一次，且在终点 symbol 隐藏之后。
- 矿车互动用的是 `features[0]`，不是 settle 后的 idleQueue。
- `normal` 跳过矿车路径有测试。
- 矿车 runtime 复用了已加载的 `bgBarSymbolTextures`，没有二次加载 payload symbol 贴图。
- 横屏和竖屏都测试了起点在 `visibleRect` 外、停点在主转轮下方轨道上。
- pivot / payload anchor 按图片内坐标生效，pivot 不在中心时不会把矿车停偏。
- symbol 飞行目标来自 `reelArea` 中心，不是硬编码常量。
- 主转轮 timing 没有被修改。
- `playSpin()` resolve 条件仍包含主转轮、矿车互动、`bg-wins`、win amount。
- destroy/resize/重复 spin 路径没有 ticker、Pixi child 或 promise 残留。
- loader/runtime 创建失败时不会留下半挂载 canvas 或未清理 live session。
- README 和 `agents.md` 同步了新合同。
- 最终报告按 UTC 命名并写在 `tasks/` 下。
