# game001 demo bootstrap 任务计划

## 1. 任务目标

新增 `apps/game001`，基于已有 `@slotclientengine/logiccore`、`@slotclientengine/rendercore`、`@slotclientengine/netcore` 和当前美术资源，制作一个可运行的 slot 游戏 demo。

本计划是完整可执行版本，不依赖其它上下文。执行者只需要阅读本文件，即可完成项目初始化、渲染布局、服务端 spin 集成、测试、README、验收和任务报告。

核心目标：

- 新增 workspace app：`apps/game001`。
- 第一屏就是游戏 demo，不做 landing page。
- Pixi 主渲染区固定使用 `assets/game001/bk.jpg` 的真实尺寸：`941 x 1672`。
- 页面层只负责把完整 Pixi canvas 居中显示，并优先保证完整可见；使用两层 div 即可，不做复杂 DOM 布局。
- Pixi 内部所有游戏对象都基于背景图坐标系使用像素坐标定位。
- 背景使用 `bk.jpg`，坐标 `(0, 0)`，尺寸保持 `941 x 1672`。
- `logo.png` 放在顶部水平居中。
- 主转轮区使用 `reels1bk.png` 作为背景，和 logo 间隔 `10px`，水平居中。
- 副转轮区使用 `reels2bk.png` 作为背景，和主转轮区间隔 `10px`，水平居中。
- 将 `netcore` live spin 返回的 GMI 主 scene 渲染到主转轮区：
  - 使用 `createGameLogicFromGmi()` 或等价 `logiccore` API 解析服务器返回的 `gmi`。
  - 使用 `createGameConfig()` 读取 `assets/gamecfg/game2.json`。
  - 使用 `gameConfig.getStopYCoordinates()` 根据主 scene 反查每轴最终停止 y。
  - 使用 `rendercore/reel` 的 spin plan 和 `RenderReelSet` 执行旋转并停在正确位置。
- 主 scene 数据是 `5 x 5`，但画面实际只显示最中间一行，以及这行上方相邻一行和下方相邻一行各 `50%`。本计划明确按“相邻上下各一行的一半”实现，不显示完整 5 行。
- 主转轮内容尽可能按宽度和 `reels1bk.png` 对齐：
  - 先按当前 rendercore/reelsviewer 规则计算原始 reel 内容宽度。
  - 计算 `mainReelsFitScale = reels1bk.width / rawReelsContentWidth`。
  - 不覆盖现有特殊图标缩放系数；`SC`、`RS`、`X2`、`X5`、`X10` 仍保留当前 `1.5` 系数，再通过父容器追加 `mainReelsFitScale`。
- 图标复合配置必须沿用任务 23 的 `assets/symbols/symbol-composites.json`；运行态用 `symbol-state-textures.manifest.json` 组装 layered normal 时，需要校验两者对 `SC`、`RS`、`X2`、`X5`、`X10` 的 layer 列表一致。
- 新增一个 Pixi 内的 `Spin` 按钮，点击一次只发送一次 spin 请求；拿到服务器数据并完成严格解析后，再开始 reel 动画。
- game001 正式运行态必须使用 `@slotclientengine/netcore` live WebSocket；不支持 replay URL，不支持本地 fixture 自动兜底。
- 不做不必要兜底。资源缺失、配置非法、服务器返回异常、GMI scene 无法反查、重复点击 spin、未知状态贴图、netcore warning/error 都必须明确报错或进入错误状态，不能静默使用默认 GMI 或旧画面。
- 新增 `apps/game001/README.md`，说明运行方式、配置项、数据流、布局坐标、验收方式。
- 如果实现过程中改变仓库协作规则、目录规范或基础脚本，需要同步更新根目录 `agents.md`；如果没有改变，在任务报告中明确说明无需更新。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `24-game001-demo-bootstrap-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

## 2. 当前仓库事实

仓库事实：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- pnpm 要求为 `>=10.0.0`。
- workspace 匹配：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- 根级命令包括：
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm format`
  - `pnpm format:check`
- 根目录协作文件是 `agents.md`。
- 如果执行 `pnpm install` 或依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

当前 `apps/game001` 尚不存在。

`assets/game001` 当前资源：

- `assets/game001/bk.jpg`：`941 x 1672`
- `assets/game001/logo.png`：`881 x 391`
- `assets/game001/reels1bk.png`：`1025 x 415`
- `assets/game001/reels2bk.png`：`751 x 641`

由上述尺寸得出的默认 Pixi 坐标：

- stage：`width = 941`，`height = 1672`
- `logo.x = (941 - 881) / 2 = 30`
- `logo.y = 0`
- `reels1bk.x = (941 - 1025) / 2 = -42`
- `reels1bk.y = 391 + 10 = 401`
- `reels2bk.x = (941 - 751) / 2 = 95`
- `reels2bk.y = 401 + 415 + 10 = 826`

注意：`reels1bk.png` 宽度 `1025` 大于 stage 宽度 `941`，按“背景图尺寸固定为 Pixi 主渲染区尺寸”与“水平居中”执行时，主转轮背景会左右各超出 `42px`。不要为了掩盖这个资源尺寸事实静默改变 stage 尺寸；如果后续视觉验收要求主转轮背景完整无遮挡，需要先调整资源或另开需求明确修改 stage 规则。

`logiccore` 当前事实：

- package 路径：`packages/logiccore`。
- 包名：`@slotclientengine/logiccore`。
- 已有 `createGameLogic(message)` 和 `createGameLogicFromGmi(gmi, meta)`。
- 已有 `createGameConfig(rawJson)`。
- 已有 gameconfig/reels 查询能力：
  - `gameConfig.getReels("reels01")`
  - `gameConfig.getStopYCoordinates({ reelsName, sceneName, scene })`
  - `gameConfig.getSpinStartYCoordinates(...)`
- scene 是 x 优先结构：`scene[x][visibleY]`。
- 对协议结构异常、关键字段缺失、索引越界、非法 scene 等情况必须 fail-fast。

`rendercore` 当前事实：

- package 路径：`packages/rendercore`。
- 包名：`@slotclientengine/rendercore`。
- 已导出 symbol 和 reel 模块。
- reel 入口：`@slotclientengine/rendercore/reel`。
- 可复用 API 包括：
  - `RenderReelSet`
  - `createReelLayout`
  - `createReelSpinPlan`
  - `createReelSymbolRegistry`
- symbol 入口：`@slotclientengine/rendercore`。
- 可复用 API 包括：
  - `createDefaultSymbolAnimationResolver`
  - `createNamedSymbolAnimationResolver`
  - `SymbolAssetMap`
- 当前默认 symbol 状态包括：
  - `normal`
  - `spinBlur`
  - `disabled`
  - `appear`
  - `win`
- 当前 reel 旋转阶段会请求 `spinBlur`，落地后请求 `appear`，完成后回到 `normal`。
- `RenderReelSet` 的 layout 只支持整数 `visibleRows`，因此 game001 的“只显示中间一行和上下半行”应在 app 层对完整 `5` 行 reelSet 做 viewport mask，不应为了这个 demo 把 rendercore 改成半行专用逻辑。

`apps/reelsviewer` 可复用事实：

- app 路径：`apps/reelsviewer`。
- 已经验证了 `game2.json + gamemoduleinfo-basic.json + rendercore/reel` 的基本链路。
- 默认配置：
  - `reelsName = "reels01"`
  - `visibleRows = 5`
  - `emptySymbols = ["BN"]`
  - `minimumSpinCycles = 10`
  - `baseDurationMs = 1600`
  - `speedSymbolsPerSecond = 42`
  - `startDelayMs = 90`
  - `stopDelayMs = 180`
- 当前特殊 symbol 缩放：
  - `SC: 1.5`
  - `RS: 1.5`
  - `X2: 1.5`
  - `X5: 1.5`
  - `X10: 1.5`
- 当前特殊 symbol 动画 profiles 在 `apps/reelsviewer/src/symbol-animation-config.ts`，可以复制到 `apps/game001` 或提炼到共享位置。若只服务当前 demo，优先复制到 `apps/game001/src/symbol-animation-config.ts`，避免扩大公共 API。
- 当前资产加载逻辑在 `apps/reelsviewer/src/assets.ts`，支持 manifest 中的 layered normal。game001 可以先复制同等逻辑；如果复制后发现重复明显且两个 app 都要长期维护，再提炼共享 helper。

`assets/gamecfg/game2.json` 当前 paytable symbols：

- `BN`
- `S00`
- `S0`
- `S1`
- `S5`
- `S10`
- `SC`
- `RS`
- `X2`
- `X5`
- `X10`

`assets/symbols/symbol-state-textures.manifest.json` 当前事实：

- `states` 包含 `spinBlur` 和 `disabled`。
- `S00`、`S0`、`S1`、`S5`、`S10` 使用单图 normal。
- `SC`、`RS`、`X2`、`X5`、`X10` 使用 layered normal：
  - `SC`: `SC-0.png`、`SC-1.png`、`SC-2.png`
  - `RS`: `RS-0.png`、`RS-1.png`、`RS-2.png`
  - `X2`: `X2-0.png`、`X2-1.png`
  - `X5`: `X5-0.png`、`X5-1.png`
  - `X10`: `X10-0.png`、`X10-1.png`
- 这些 symbol 均有 `spinBlur` 状态贴图。

`assets/symbols/symbol-composites.json` 当前事实：

- `version = 1`。
- 任务 23 的复合 symbol layer 配置为：
  - `SC`: `./SC-0.png`、`./SC-1.png`、`./SC-2.png`
  - `RS`: `./RS-0.png`、`./RS-1.png`、`./RS-2.png`
  - `X2`: `./X2-0.png`、`./X2-1.png`
  - `X5`: `./X5-0.png`、`./X5-1.png`
  - `X10`: `./X10-0.png`、`./X10-1.png`
- `symbol-state-textures.manifest.json` 的 layered normal 是由该配置生成的运行态 manifest。game001 必须把 `symbol-composites.json` 当作复合图标配置契约校验，不能只因为 manifest 当前可用就忽略任务 23 的配置文件。

`netcore` 当前事实：

- package 路径：`packages/netcore`。
- 包名：`@slotclientengine/netcore`。
- 入口类：`SlotcraftClient`。
- URL 为 `ws://` 或 `wss://` 时使用 live WebSocket。
- live `spin(params)` 成功后返回形如 `{ gmi, totalwin, results }` 的对象。
- `SpinParams` 支持 `bet`、`lines`、`times`、`autonums`、`ctrlname` 和额外 ctrlparam 字段。
- 浏览器 live 模式使用全局 `WebSocket`，不需要安装 Node `ws`。
- 虽然 `SlotcraftClient` 自身也支持 `http(s)` replay JSON，但本任务的 game001 demo 必须使用 netcore live；`apps/game001` 运行态只接受 `ws://` 或 `wss://`。
- 当前 `@slotclientengine/netcore` 是 CommonJS package，`exports["."]` 只有 `require` 条件。实现 game001 时必须验证 Vite app 能否稳定导入；如果不能，必须同步调整 `packages/netcore` 的浏览器/bundler 导出契约并补测试，不能在 game001 里绕过包入口直接 import 源文件。

## 3. 设计原则

### 3.1 app 与核心库边界

`apps/game001` 负责：

- 绑定 game001 美术资源和布局坐标。
- 创建 Pixi `Application`。
- 创建 stage、背景、logo、主/副转轮背景、主转轮 viewport、Spin 按钮。
- 读取 `assets/gamecfg/game2.json`。
- 读取 `assets/symbols` 和 `symbol-state-textures.manifest.json`。
- 通过 `netcore` live 连接 `ws://` 或 `wss://` 游戏服务器。
- 将一次 spin 请求结果转换成 scene、finalYs 和 rendercore spin plan。
- 管理按钮状态、错误状态、加载状态和演示状态。

`apps/game001` 不负责：

- 修改 GMI 协议语义。
- 在 app 层宽松修复非法 scene。
- 在 app 层重写 reel 旋转核心算法。
- 在 app 层把缺失 symbol 贴图替换成其它 symbol。
- 在运行态伪造服务器返回数据、使用 replay URL 或把 live 失败静默替换成本地 fixture。单元测试可以注入 mock client，但生产代码不能暴露 mock/replay 运行模式。
- 在未收到 live defaultScene 或 spin scene 时，不允许把 `packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json` 当作初始画面。

`packages/rendercore` 只在现有能力不足且确属通用能力时修改，例如：

- `RenderReelSet` 缺少必要 snapshot 以支持测试。
- reel mask 或 layout 需要通用小扩展。

不要为了 game001 的半行裁剪把 rendercore 改成只适配本游戏的专用代码。半行显示应由 game001 的 viewport/mask 完成。

`packages/netcore` 只在 Vite/browser 导入契约不足时修改。若修改：

- 顶层仍必须通过 `@slotclientengine/netcore` 导入。
- 不能把 Node-only `ws`、`node-fetch`、`dotenv` 打进浏览器 bundle。
- 需要补 browser/bundler smoke test 或至少在 game001 build 中证明不含 Node-only 运行时代码。

### 3.2 不做不必要兜底

必须 fail-fast 的情况：

- `#app` root 缺失。
- `assets/game001` 中任一必需图片加载失败。
- `bk.jpg` 实际尺寸不是 `941 x 1672` 且布局常量未同步。
- `game2.json` 不能被 `createGameConfig()` 严格解析。
- `reels01` 不存在。
- `BN` 不在 paytable 中但仍被配置为空图标。
- 有普通图且参与 reel 渲染的 symbol 缺少 `spinBlur`。
- manifest 中 layered normal 的 layer 缺失、编号不连续或尺寸不一致。
- `assets/symbols/symbol-composites.json` 缺失、版本不为 `1`、layer 配置非法，或与 manifest 中同 symbol 的 layered normal 不一致。
- `SlotcraftClient` 触发 `error`、意外 `disconnect`、`reconnecting`、logger `warn` 或 logger `error`。
- 用户重复点击 Spin 时当前 spin 未完成。
- `spin()` 返回缺少 `gmi`、`totalwin` 或 `results`。
- `gmi.replyPlay.results` 非数组。
- `results` 与 `gmi.replyPlay.results.length` 不一致。
- 解析出的主 scene 不是 `5 x 5`。
- `gameConfig.getStopYCoordinates()` 无法为主 scene 反查每轴最终 y。
- rendercore 动画结束后 `reelSet.getVisibleScene()` 与解析出的主 scene 不一致。

允许的开发便利：

- 单元测试可以用 mock `SlotcraftClientLike` 验证状态机和错误处理。
- 浏览器/manual 验收必须使用 live `ws(s)` 服务器；如果没有可用 live 服务器，本任务不能用 replay 代替完整验收，只能在任务报告中明确标记 live 验收未完成。

如果测试导致一些奇怪写法，优先修改测试，不要改不该改的生产逻辑。

## 4. 文件与目录计划

新增：

```text
apps/game001/
  README.md
  eslint.config.cjs
  index.html
  package.json
  tsconfig.eslint.json
  tsconfig.json
  vite.config.ts
  src/
    assets.ts
    env.ts
    game-client.ts
    game-demo.ts
    game-layout.ts
    main.ts
    scene.ts
    spin-button.ts
    symbol-animation-config.ts
    styles.css
    vite-env.d.ts
  tests/
    assets.test.ts
    env.test.ts
    game-client.test.ts
    game-demo.test.ts
    game-layout.test.ts
    setup.ts
```

可能修改：

```text
packages/netcore/package.json
packages/netcore/tsconfig.json
packages/netcore/src/index.ts
packages/netcore/tests/...
agents.md
```

只有当 Vite/browser 无法通过 `@slotclientengine/netcore` 包入口导入时，才修改 `packages/netcore`。只有当仓库协作规则、目录规范或基础脚本发生变化时，才修改 `agents.md`。

## 5. 实现步骤

### 5.1 初始化 app package

创建 `apps/game001/package.json`：

- `name`: `game001`
- `private`: `true`
- `type`: `module`
- `packageManager`: `pnpm@10.0.0`
- `dependencies`：
  - `@slotclientengine/logiccore: workspace:*`
  - `@slotclientengine/rendercore: workspace:*`
  - `@slotclientengine/netcore: workspace:*`
  - `pixi.js: ^8.1.6`
- `devDependencies` 与 `apps/reelsviewer` 保持同类基础工具版本一致：
  - `@eslint/js`
  - `@typescript-eslint/eslint-plugin`
  - `@typescript-eslint/parser`
  - `@vitest/coverage-v8`
  - `eslint-config-prettier`
  - `globals`

建议 scripts：

```json
{
  "prepare:deps": "pnpm --filter @slotclientengine/logiccore build && pnpm --filter @slotclientengine/rendercore build && pnpm --filter @slotclientengine/netcore build",
  "build": "pnpm run prepare:deps && vite build",
  "dev": "pnpm run prepare:deps && sh -c 'if [ \"$1\" = \"--\" ]; then shift; fi; exec vite \"$@\"' sh",
  "lint": "eslint .",
  "test": "vitest run --coverage",
  "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

创建 `index.html`，只包含 `#app` 根节点和入口脚本，不添加营销文案。

创建 `vite.config.ts`：

- `plugins` 当前不需要。
- `server.port` 建议 `5201`。
- `test.environment` 可使用现有 repo 测试约定；如需 DOM，可配置 `jsdom`，但不要引入没必要的新依赖。优先把可测逻辑拆成纯函数。
- coverage 阈值按 app 风险设置，建议 lines/functions/branches/statements 均不低于 `80`。

复制或参考 `apps/reelsviewer` 的 `eslint.config.cjs`、`tsconfig.json`、`tsconfig.eslint.json`，保持仓库工具链风格一致。

### 5.2 页面两层 div 与 CSS 缩放

`apps/game001/src/main.ts` 负责创建：

```html
<main class="game001-page">
  <div class="game001-frame"></div>
</main>
```

要求：

- `.game001-page` 占满 viewport，居中 `.game001-frame`。
- `.game001-frame` 保持 `941 / 1672` aspect ratio。
- `canvas` 由 Pixi 创建后 append 到 `.game001-frame`。
- CSS 让 canvas 宽高填满 frame。
- frame 尺寸按 viewport 等比缩放，优先保证 `941 x 1672` canvas 完整可见：
  - 宽度不超过 `100vw`
  - 高度不超过 `100vh`
  - aspect-ratio 固定
- 不要用额外 DOM 层承载游戏元素；游戏内元素全部在 Pixi stage 内定位。

建议 CSS 语义：

```css
.game001-page {
  width: 100vw;
  height: 100vh;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #08090c;
}

.game001-frame {
  width: min(100vw, calc(100vh * 941 / 1672), 941px);
  aspect-ratio: 941 / 1672;
}

.game001-frame canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

### 5.3 Pixi stage 与静态布局

在 `src/game-layout.ts` 固定基础布局常量：

```ts
export const GAME_STAGE_SIZE = Object.freeze({ width: 941, height: 1672 });
export const GAME_ASSET_SIZE = Object.freeze({
  background: { width: 941, height: 1672 },
  logo: { width: 881, height: 391 },
  mainReelsBackground: { width: 1025, height: 415 },
  secondaryReelsBackground: { width: 751, height: 641 }
});
```

提供纯函数：

- `createGame001Layout()`
- `getCenteredX(stageWidth, assetWidth)`
- `getMainReelsVisibleWindow(...)`

默认坐标必须通过测试覆盖：

- logo：`x=30`，`y=0`
- 主转轮背景：`x=-42`，`y=401`
- 副转轮背景：`x=95`，`y=826`

在 `src/game-demo.ts` 创建 Pixi stage：

- `Application.init({ width: 941, height: 1672, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 })`
- 加载 `bk.jpg`、`logo.png`、`reels1bk.png`、`reels2bk.png`
- 依次 add：
  1. 背景 sprite
  2. logo sprite
  3. 主转轮背景 sprite
  4. 主转轮 viewport/reelSet
  5. 副转轮背景 sprite
  6. Spin 按钮

静态图片尺寸校验：

- 加载后读取 texture 尺寸。
- 与 `GAME_ASSET_SIZE` 不一致时抛错。
- 不要靠 sprite scale 把错误尺寸修正掉。

### 5.4 主转轮 viewport 与半行裁剪

主转轮数据仍按完整 `5 x 5` scene 处理：

- `RenderReelSet` layout 使用 `visibleRows = 5`。
- `gameConfig.getStopYCoordinates()` 也使用完整 5 行 scene。
- `reelSet.getVisibleScene()` 应返回完整 `5 x 5`，用于验收是否停在正确位置。

画面只显示中间部分：

- 创建 `mainReelsViewport = new Container()`。
- 将完整 `reelSet` 放入 `mainReelsViewport`。
- 给 `mainReelsViewport` 设置 mask，只显示：
  - y 范围：从第 `1` 行的下半部分开始，到第 `3` 行的上半部分结束。
  - 按 cell 坐标即 `cropY = 1.5 * cellHeight`，`cropHeight = 2 * cellHeight`。
- 因为 viewport 最终会整体按 `mainReelsFitScale` 缩放，mask 可以在未缩放 reelSet 的局部坐标中定义，再让父容器一起 scale。

推荐结构：

```text
mainReelsLayer
  mainReelsViewport(mask: crop rectangle)
    reelSet(full 5 rows)
```

对齐规则：

- 先创建 registry 和 layout，得到：
  - `rawReelsContentWidth = reelCount * cellWidth + (reelCount - 1) * columnGap`
  - `rawReelsContentHeight = 5 * cellHeight`
- `mainReelsFitScale = reels1bk.width / rawReelsContentWidth`
- `mainReelsLayer.scale.set(mainReelsFitScale)`
- `mainReelsLayer.x = reels1bk.x`
- `mainReelsLayer.y = reels1bk.y + (reels1bk.height - cropHeight * mainReelsFitScale) / 2 - cropY * mainReelsFitScale`
- 这样完整 reelSet 内部仍是 5 行逻辑，最终显示窗口居中落在主转轮背景上。

测试要求：

- `mainReelsFitScale` 不能写死，必须由 `reels1bk.width / rawReelsContentWidth` 算出。
- 特殊 symbol 的自身 scale 仍是 `1.5`。
- 追加缩放只发生在主转轮父容器，不修改 `REELS_VIEWER_SYMBOL_SCALES` 原值。
- viewport 显示高度是 `2 * cellHeight * mainReelsFitScale`。
- scene 验收仍比较完整 `5 x 5`，不是比较裁剪后的视觉窗口。

### 5.5 副转轮区

本任务只要求副转轮区显示 `reels2bk.png` 背景，未指定副 scene 数据来源。

实现要求：

- 按默认坐标绘制副转轮背景。
- 不伪造副转轮 symbol。
- 不从主 scene 拆一部分塞进副转轮。
- 如果服务器返回后续协议中存在明确副 scene 字段，本任务不猜字段名，另开任务或在当前实现中通过严格配置显式接入。

README 和任务报告中需要说明：本任务的副转轮区当前只完成背景和布局，未渲染数据驱动的副 reels。

### 5.6 symbol 资产加载

在 `apps/game001/src/assets.ts` 实现或复制 `apps/reelsviewer/src/assets.ts` 的等价逻辑：

- 用 `import.meta.glob("../../../assets/symbols/*.png", { eager: true, import: "default", query: "?url" })` 读取图片 URL。
- 读取 `assets/symbols/symbol-composites.json`。
- 读取 `assets/symbols/symbol-state-textures.manifest.json`。
- 使用 manifest 创建 `SymbolAssetMap`。
- 使用 `symbol-composites.json` 校验复合 symbol 配置：
  - `version` 必须是 `1`。
  - `symbols` 必须是对象。
  - `SC`、`RS`、`X2`、`X5`、`X10` 必须存在。
  - 每个配置的 `layers` 必须是非空数组。
  - layer 文件名必须匹配 `{symbol}-{index}.png`。
  - layer index 必须从 `0` 开始连续。
  - manifest 中同 symbol 的 `normal.kind` 必须是 `"layered"`。
  - manifest 中同 symbol 的 `normal.layers` 必须与 `symbol-composites.json` 完全一致。
- 支持 manifest normal 为：
  - string：单图 normal。
  - `{ kind: "layered", layers: string[] }`：复合 normal。
- layer 文件如 `SC-0.png` 不应成为独立 symbol。
- 状态贴图只允许 manifest 声明的 state。
- game001 reels 阶段至少要求 `spinBlur`：

```ts
export const GAME001_REQUIRED_STATE_TEXTURES = ["spinBlur"] as const;
```

- 如果后续 Spin 停止后需要 `disabled` 视觉，再显式加入，不要提前要求未使用状态。

加载后用 `loadReelSymbolTextures()` 或等价函数把 URL 全部转成 Pixi `Texture`，再交给 rendercore。

测试覆盖：

- `symbol-composites.json` 中 5 个特殊 symbol 的 layer 配置和 manifest layered normal 一致。
- 当前 manifest 下 `SC` normal 是 layered 且 layers 为 `SC-0/1/2`。
- `SC-0`、`RS-0`、`X2-0` 等 layer 文件不会成为顶层 symbol。
- 缺少 `spinBlur` 时失败。
- 未在 manifest 声明的状态文件失败。
- composite 配置缺失、版本错误、layer 编号不连续、manifest/composite 不一致时失败。

### 5.7 game config 与 reel runtime

在 `src/game-demo.ts` 或单独 `src/scene.ts` 中封装 `Game001ReelRuntime`：

输入：

- `rawGameConfig`
- `symbolAssets`
- `scene`
- 可选 spin 配置

内部：

- `const gameConfig = createGameConfig(rawGameConfig)`
- `const reels = gameConfig.getReels("reels01")`
- `const finalYs = gameConfig.getStopYCoordinates({ reelsName: "reels01", sceneName, scene })`
- `const registry = createReelSymbolRegistry(...)`
- `const layout = createReelLayout({ reelCount, visibleRows: 5, cellWidth, cellHeight, columnGap })`
- `const reelSet = new RenderReelSet({ reels, layout, registry })`

live 初始画面规则：

- `Game001ReelRuntime` 可以先创建 `reelSet`，但在没有 live scene 前，主转轮 viewport 必须保持隐藏或显示明确 loading/等待状态。
- 初始化完成 `client.connect()` 和 `client.enterGame()` 后，读取 `client.getUserInfo().defaultScene`。
- 如果 `defaultScene` 存在：
  - 必须校验为 `5 x 5`。
  - 必须通过 `gameConfig.getStopYCoordinates()` 反查 finalYs。
  - 必须调用 `reelSet.resetToFinalYs(finalYs)` 并显示主转轮 viewport。
- 如果 `defaultScene` 不存在：
  - 不允许读取本地 GMI fixture。
  - 不允许把 y=0 画面当作服务器初始局面展示。
  - 可以只显示背景、主/副转轮底图和 Spin 按钮，主转轮 viewport 保持 hidden/loading；第一次 live spin 返回 scene 后再显示并播放。

registry 配置：

```ts
emptySymbols: ["BN"]
symbolScales: {
  SC: 1.5,
  RS: 1.5,
  X2: 1.5,
  X5: 1.5,
  X10: 1.5
}
texturePolicy: {
  requiredStateTextures: ["spinBlur"]
}
animationResolver: createNamedSymbolAnimationResolver({
  profiles: GAME001_ANIMATION_PROFILES,
  fallback: createDefaultSymbolAnimationResolver()
})
```

spin 配置可先沿用 reelsviewer 默认值：

```ts
minimumSpinCycles: 10
baseDurationMs: 1600
speedSymbolsPerSecond: 42
startDelayMs: 90
stopDelayMs: 180
direction: "forward"
```

动态 spin 要求：

- 每次服务器返回新的 scene 后重新计算 `finalYs` 和 spin plan。
- 不要复用上一次 finalYs。
- 如果 scene 反查失败，按钮进入错误状态并抛出错误，不启动动画。
- spin 完成后检查完整 visible scene 与目标 scene 一致。

### 5.8 服务端 spin 集成

在 `src/env.ts` 中集中解析配置。

建议环境变量：

- `VITE_GAME001_SERVER_URL`
  - 只允许 `ws://` 或 `wss://` live 服务器。
  - `http://`、`https://`、相对 URL、空字符串都必须失败。
- `VITE_GAME001_TOKEN`
- `VITE_GAME001_GAMECODE`
- `VITE_GAME001_BUSINESSID`
- `VITE_GAME001_CLIENTTYPE`，默认 `web`
- `VITE_GAME001_JURISDICTION`，默认 `MT`
- `VITE_GAME001_LANGUAGE`，默认 `en`
- `VITE_GAME001_BET`
- `VITE_GAME001_LINES`
- `VITE_GAME001_TIMES`，默认 `1`
- `VITE_GAME001_REQUEST_TIMEOUT_MS`，默认 `10000`

解析规则：

- `SERVER_URL`、`TOKEN`、`GAMECODE`、`BET`、`LINES` 是运行 spin 的必需配置。
- 数字字段必须是有限正数或按语义允许的正整数。
- 配置缺失时页面显示明确错误，并禁用 Spin；不要切换到本地 fixture。
- `SERVER_URL` 必须是 live `ws(s)` URL；不能接受 `http(s)` replay URL。
- `GAMECODE` 必须是非空字符串。
- `TOKEN` 必须是非空字符串。
- `BET`、`LINES` 必须能解析为有限正数；如果服务器只允许整数 lines，则在 README 写明实际配置。

在 `src/game-client.ts` 封装：

```ts
export interface Game001Client {
  connect(): Promise<void>;
  spin(): Promise<Game001SpinResult>;
  disconnect(): void;
}
```

实现：

- 创建 `SlotcraftClient`。
- 绑定 fail-fast 事件：
  - `error`
  - `disconnect`
  - `reconnecting`
  - `message` 中的 `noticemsg2`
  - logger `warn`
  - logger `error`
- 初始化时执行：
  1. `client.connect(token)`
  2. `client.enterGame(gamecode)`
  3. 读取并校验 `client.getUserInfo().gameid`、`defaultScene`、`defaultLinebet`、`linebets`、`linesOptions` 等可用 live 信息；其中 `gameid` 可选但如果存在必须是有限数。
- Spin 点击时执行：
  1. 禁用按钮，状态切到 `requesting`
  2. `client.spin({ bet, lines, times })`
  3. 严格校验返回对象
  4. 用 `createGameLogicFromGmi(result.gmi, { bet, lines, totalwin, gameid })` 解析；`gameid` 从 `client.getUserInfo().gameid` 读取，存在时传入，不存在时不传，不能伪造。
  5. 取 `getStep(0).getScene(0)` 作为主 scene
  6. 校验 scene 是 `5 x 5`
  7. 状态切到 `spinning`
  8. 启动 rendercore spin
  9. 动画完成后状态切回 `ready`
- 如果服务器返回需要 collect 的状态，本任务先不要自动吞掉。可以在 README 中说明当前 demo 只演示单次 spin 到落点；如果必须 collect，应作为显式后续行为加入，不要在无 UI 提示下自动发送额外消息。

重复点击处理：

- 如果状态不是 `ready`，点击 Spin 必须被拒绝并显示当前状态。
- 不允许并发发送两个 spin 请求。

### 5.9 Spin 按钮

在 `src/spin-button.ts` 中实现 Pixi 按钮：

- 使用 `Container`、`Graphics`、`Text`。
- 坐标在背景图坐标系内，建议放在副转轮背景下方剩余区域水平居中：
  - `x = 941 / 2`
  - `y = 1550` 左右，最终以不遮挡副转轮背景为准。
- 显示文本：
  - `SPIN`
  - `LOADING`
  - `SPINNING`
  - `ERROR`
- 交互：
  - `eventMode = "static"`
  - `cursor = "pointer"` 仅在可点击时启用。
  - disabled/requesting/spinning/error 状态有明显视觉区别。
- 按钮点击只调用外部传入的 `onSpin()`，按钮组件不直接知道 netcore 或 GMI。

测试覆盖：

- 状态切换后 `interactive/enabled` 语义正确。
- 非 ready 状态不触发 `onSpin()`。
- ready 状态一次点击只触发一次。

### 5.10 README

新增 `apps/game001/README.md`，至少包含：

- app 目标。
- 数据来源：
  - `assets/game001/*`
  - `assets/gamecfg/game2.json`
  - `assets/symbols/*`
  - `assets/symbols/symbol-composites.json`
  - `assets/symbols/symbol-state-textures.manifest.json`
- 固定 stage 尺寸：`941 x 1672`。
- 当前静态布局坐标。
- 主 scene 显示规则：逻辑处理完整 `5 x 5`，视觉只裁剪显示中间一行和上下相邻半行。
- 主转轮宽度适配规则：保留特殊 symbol `1.5` 缩放，再叠加父容器 fit scale。
- 任务 23 图标配置规则：`symbol-composites.json` 是复合图标配置契约，manifest layered normal 必须与它一致。
- 副转轮区当前只显示背景。
- 环境变量配置表。
- live URL 规则：game001 只支持 `ws://` 或 `wss://`，不支持 `http(s)` replay。
- 初始画面规则：优先使用 live `defaultScene`，没有 live defaultScene 时不使用本地 fixture。
- 运行命令：

```bash
pnpm --filter game001 dev -- --host 0.0.0.0
```

- 验收命令。
- 常见失败：
  - 缺少 env。
  - netcore 包入口无法被 Vite 导入。
  - 服务器返回 GMI 无法解析。
  - scene 不是 `5 x 5`。
  - 资源尺寸和常量不一致。

## 6. 测试计划

新增 `apps/game001/tests/game-layout.test.ts`：

- 校验 stage size。
- 校验 logo/main reels/secondary reels 默认坐标。
- 校验 `reels1bk.width > stage.width` 的事实被测试记录，防止后续有人“顺手修正”坐标。
- 校验主转轮 crop：`cropY = 1.5 * cellHeight`，`cropHeight = 2 * cellHeight`。

新增 `apps/game001/tests/assets.test.ts`：

- 复用当前 manifest 测试 layered normal。
- 校验 `symbol-composites.json` 与 manifest layered normal 一致。
- 缺少必需 `spinBlur` 失败。
- 未声明 state 文件失败。
- layer 文件不进入顶层 asset map。
- composite 配置非法或与 manifest 不一致时失败。

新增 `apps/game001/tests/env.test.ts`：

- 缺少必需 env 失败。
- `ws://` 和 `wss://` live URL 能被识别。
- `http://` 和 `https://` replay URL 必须失败。
- 无效 URL 协议失败。
- 数字字段非法失败。

新增 `apps/game001/tests/game-client.test.ts`：

- mock client 成功路径：`connect -> enterGame -> spin`。
- 初始化时优先读取 live `defaultScene`，缺失时不会读取本地 GMI fixture。
- `spin()` 返回缺少 `gmi` 失败。
- `results` 与 `gmi.replyPlay.results.length` 不一致失败。
- `createGameLogicFromGmi` meta 使用请求的 `bet/lines`、spin 返回的 `totalwin` 和 live `userInfo.gameid`；`gameid` 缺失时不伪造。
- logger.warn/logger.error 触发 fail-fast。
- 意外 disconnect/reconnecting 触发 fail-fast。
- 重复 spin 请求失败。

新增 `apps/game001/tests/game-demo.test.ts`：

- 使用测试 texture 和合法 `5 x 5` scene 创建 runtime。
- 能根据 scene 计算 finalYs。
- spin 完成后完整 `reelSet.getVisibleScene()` 等于目标 scene。
- 特殊 symbol 自身 scale 保持 `1.5`。
- 主转轮父容器追加 `mainReelsFitScale`。
- scene 非 `5 x 5` 失败。
- `gameConfig.getStopYCoordinates()` 失败时不启动动画。

如果修改 `packages/netcore`：

- 补 netcore package export / browser bundler smoke test。
- 至少通过 `pnpm --filter @slotclientengine/netcore lint/test/typecheck/build`。
- 再通过 `pnpm --filter game001 build` 验证 Vite 能消费包入口。

不要因为测试 fixture 不完整而削弱 production parser 或生产校验。应修测试数据。

## 7. 验收命令

先运行 app/package 级验收：

```bash
pnpm --filter game001 lint
pnpm --filter game001 test
pnpm --filter game001 typecheck
pnpm --filter game001 build
```

如果修改了 `packages/netcore`：

```bash
pnpm --filter @slotclientengine/netcore lint
pnpm --filter @slotclientengine/netcore test
pnpm --filter @slotclientengine/netcore typecheck
pnpm --filter @slotclientengine/netcore build
```

如果修改了 `packages/rendercore`：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

如果修改了 `packages/logiccore`：

```bash
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
```

最后运行根级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

如果需要安装依赖且下载失败，先执行代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 8. 浏览器验收

启动：

```bash
pnpm --filter game001 dev -- --host 0.0.0.0
```

浏览器验收至少覆盖：

- 页面只有游戏 demo，不是 landing page。
- canvas 完整居中显示，窗口变小时仍优先完整显示。
- Pixi canvas 逻辑尺寸为 `941 x 1672`。
- 背景、logo、主转轮背景、副转轮背景都渲染出来。
- logo 顶部水平居中。
- 主转轮背景和 logo 间隔 `10px`。
- 副转轮背景和主转轮背景间隔 `10px`。
- Spin 按钮可见且不遮挡副转轮背景。
- 缺少 env 时 Spin 明确不可用，并显示错误原因。
- 配置 `ws(s)` live URL 时，点击 Spin 能向服务器发送一次 `gamectrl3/spin`，拿到 GMI 后再开始旋转。
- 配置 `http(s)` URL 时页面必须明确报错并禁用 Spin。
- 网络请求期间按钮进入请求中状态。
- 旋转期间不能再次点击触发第二次请求。
- 旋转中 symbol 使用 `spinBlur`。
- 停止后可见 symbol 播放 `appear`，再回到 `normal`。
- 最终完整 scene 与服务器返回的主 scene 一致。
- 画面只显示中间一行和上下相邻半行，不显示完整 5 行。

如果当前环境没有 live 服务器，任务报告必须明确写明 live 服务器验收未执行，并把完整验收标记为未完成或阻塞；不能用 replay/mock/browser 静态验收替代 live 验收。

## 9. 任务报告要求

完成后新增报告：

```text
tasks/24-game001-demo-bootstrap-[utctime].md
```

其中 `[utctime]` 使用 UTC 年月日时分秒，例如 `260401-181300`。

报告必须包含：

- 实现摘要。
- 新增和修改文件列表。
- 是否修改了 `agents.md`，以及原因。
- 是否修改了 `packages/netcore`、`packages/rendercore`、`packages/logiccore`，以及原因。
- 主资源尺寸和最终坐标。
- 主转轮 fit scale 计算结果。
- 特殊 symbol `1.5` 缩放是否保留。
- `symbol-composites.json` 与 manifest layered normal 的一致性校验结果。
- 初始画面是否使用了 live `defaultScene`；如果没有 defaultScene，是否保持无 fixture 兜底。
- 副转轮区当前只显示背景，还是接入了明确副 scene。
- 服务端模式：
  - live 服务器 URL 类型和验收结果。
  - 单元测试中使用的 mock client 覆盖了哪些错误路径。
  - 如果 live 未验收，必须明确说明。
- 执行过的命令和结果。
- 浏览器验收结果。
- 未完成项或后续建议。

## 10. 完成标准

满足以下全部条件才算完成：

- `apps/game001` 可通过 workspace 命令运行和构建。
- Pixi stage 固定为 `941 x 1672`。
- 页面层完整居中显示 canvas。
- `bk.jpg`、`logo.png`、`reels1bk.png`、`reels2bk.png` 均按指定坐标显示。
- 主转轮使用完整 `5 x 5` scene 计算停轴，但视觉只显示中间一行和上下相邻半行。
- 主转轮宽度按 `reels1bk.png` 适配，且保留特殊 symbol 既有 `1.5` 缩放。
- 运行态读取并校验任务 23 的 `assets/symbols/symbol-composites.json`，且与 manifest layered normal 一致。
- 运行态只接受 `ws://` 或 `wss://` live URL；`http(s)` replay URL 明确失败。
- 初始画面优先使用 live `defaultScene`；没有 live defaultScene 时不使用本地 GMI fixture 兜底。
- Spin 按钮点击后通过 `netcore` live WebSocket 发送一次 spin 请求，收到并严格解析 GMI 后才开始旋转。
- 重复点击、非法返回、非法配置、资源缺失都会明确失败，不静默兜底。
- spin 最终停在服务器返回 scene 对应的位置。
- live 浏览器验收必须执行并记录；如果当前没有 live 服务器，任务报告必须把完整验收标记为未完成或阻塞。
- README 已新增。
- 必要测试已新增并通过。
- package 级和根级验收通过。
- 已新增中文任务报告。
- 如确实改变仓库协作规则、目录规范或基础脚本，已同步更新 `agents.md`；否则报告说明无需更新。
