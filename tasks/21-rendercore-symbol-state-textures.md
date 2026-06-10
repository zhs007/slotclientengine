# rendercore symbol state textures 任务计划

## 1. 任务目标

本任务增强 `packages/rendercore` 和 `apps/symbolsviewer` 的 symbol 状态视觉表现，让 `spinBlur` 和 `disabled` 不再只显示普通图：

- `spinBlur`：基于普通状态图片，生成一张纵向运动模糊 PNG，并在旋转模糊状态使用这张贴图。
- `disabled`：基于普通状态图片，生成一张灰色 PNG，并在不可用状态使用这张贴图。
- 生成后的贴图作为静态资源进入 `symbolsviewer`，浏览器运行时和发布 bundle 不允许依赖图片处理库。
- `rendercore` 继续保持核心库定位，只提供通用的状态贴图选择能力，不把 `symbolsviewer` 的具体资源路径或业务配置写死进核心库。
- 更新 `packages/rendercore/README.md` 和 `apps/symbolsviewer/README.md`。
- `rendercore` 必须保留并覆盖新增逻辑的测试，coverage 实际结果 lines/functions/branches/statements 均必须大于 80%，现有阈值不得降低。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `21-rendercore-symbol-state-textures-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

本计划是完整可执行版本，不依赖任何其它上下文。执行者只需要阅读本文件，即可完成实现、测试、文档、验收和报告。

## 2. 当前仓库事实

仓库事实：

- 仓库根目录是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`，pnpm 要求为 `>=10.0.0`。
- workspace 匹配 `apps/*` 和 `packages/*`。
- 根级命令包括：
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm format`
  - `pnpm format:check`
- 根目录协作文件路径是 `agents.md`。只有当本任务改变仓库级协作规则、目录规范或基础脚本时，才需要同步更新 `agents.md`。
- 如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

`rendercore` 当前事实：

- package 路径：`packages/rendercore`。
- 包名：`@slotclientengine/rendercore`。
- 当前依赖：
  - `@slotclientengine/logiccore`
  - `@slotclientengine/pixiani`
  - `pixi.js`
- 当前 `package.json` 的 `files` 只包含 `dist` 和 `README.md`。
- 当前测试命令是 `vitest run --coverage`。
- 当前 coverage 配置在 `packages/rendercore/vite.config.ts` 中，阈值 lines/functions/branches/statements 均为 80，不能降低；最终实际 coverage 结果必须都大于 80%。
- 当前默认状态 preset 包含：
  - `normal`
  - `spinBlur`
  - `disabled`
  - `appear`
  - `win`
- 当前 `spinBlur -> normal`、`disabled -> normal` 是状态等价配置。
- 当前 `RenderSymbol` 只接收一张 `texture`，`SymbolAnimationContext` 也只有一张 `texture`。
- 当前默认 resolver 只注册：
  - `normal`：静态单帧。
  - `appear`：单次放大弹回。
  - `win`：单次扫光。
- 当前 `spinBlur` / `disabled` 因为等价到 `normal`，最终会走 `normal` 的静态单帧表现。

`symbolsviewer` 当前事实：

- app 路径：`apps/symbolsviewer`。
- 当前从 `assets/gamecfg/game2.json` 读取 paytable。
- 当前从 `assets/symbols/*.png` 读取 symbol 图片。
- 当前只展示 paytable 和图片资源的交集。
- 当前可展示 symbol 是：
  - `S00`
  - `S0`
  - `S1`
  - `S5`
  - `S10`
- 当前 paytable 中缺图 symbol 是：
  - `BN`
  - `SC`
  - `RS`
  - `X2`
  - `X5`
  - `X10`
- 当前图片中不在 paytable 的孤儿资源是：
  - `SX`
- 当前默认序列是 `normal -> appear -> win -> spinBlur -> disabled`。
- 当前 README 明确说明 `spinBlur` 和 `disabled` 等价到 `normal`，本任务完成后必须更新这段说明。

## 3. 设计结论

### 3.1 图片处理放在构建期或开发期

新增图片处理能力时，必须把依赖限制在 Node 脚本中：

- 可以给 `packages/rendercore` 增加 `sharp` 作为 `devDependencies`。
- 不允许在 `packages/rendercore/src/**` 中 import `sharp`。
- 不允许在 `apps/symbolsviewer/src/**` 中 import `sharp`。
- 不允许让 `sharp` 出现在 `packages/rendercore/dist` 或 `apps/symbolsviewer/dist` 的浏览器运行时代码中。
- 生成好的 PNG 应提交到仓库，`symbolsviewer build` 只消费静态图片，不负责实时生成图片。

当前仓库已有 `apps/spine2victoryani-demo` 使用 `sharp@^0.34.4`，本任务如新增 `sharp`，版本应使用 `^0.34.4`，避免同仓库内同类依赖版本漂移。

### 3.2 状态语义不和视觉效果强绑定

不要把 `spinBlur` 和 `disabled` 从状态机语义里特殊化成硬编码效果。推荐保持当前语义：

- `spinBlur` 仍然可以等价到 `normal`。
- `disabled` 仍然可以等价到 `normal`。
- `requestedState` 仍然分别是 `spinBlur` / `disabled`。
- `resolvedState` 仍然是 `normal`。
- 默认静态 ani 在设置主 `Sprite.texture` 时，根据 `requestedState` 选择状态贴图。

这样可以保留现有状态机逻辑，同时让视觉贴图随请求状态变化。

### 3.3 显式配置，不做不必要兜底

本任务必须避免静默兜底导致逻辑 bug 被掩盖：

- 如果 `symbolsviewer` 声明 `spinBlur` 和 `disabled` 是必需状态贴图，则任意可展示 symbol 缺少对应贴图时必须抛错。
- 如果贴图 manifest 写了某个状态，但该状态不在当前 state preset 中，必须抛错。
- 如果 `createRenderSymbol()` 收到 URL 字符串而不是已加载的 `Texture`，必须继续抛错。
- 如果状态贴图变体还是 URL 字符串，必须抛错，不能回退到普通贴图。
- 如果测试为了绕过错误而需要奇怪实现，优先修改测试，不要改生产逻辑去迎合测试。

## 4. 生成资产规范

生成的状态 PNG 必须直接放在现有目录：

```text
assets/symbols/
```

不要新建 `assets/symbols/state-textures/` 子目录。这样普通图、模糊图、灰图都在同一资源目录下，后续资源发布规则更简单。manifest 不是图片，也放在 `assets/symbols/` 下与这些变体同目录。

当前任务需要生成的 PNG：

```text
assets/symbols/S00.spinBlur.png
assets/symbols/S00.disabled.png
assets/symbols/S0.spinBlur.png
assets/symbols/S0.disabled.png
assets/symbols/S1.spinBlur.png
assets/symbols/S1.disabled.png
assets/symbols/S5.spinBlur.png
assets/symbols/S5.disabled.png
assets/symbols/S10.spinBlur.png
assets/symbols/S10.disabled.png
assets/symbols/symbol-state-textures.manifest.json
```

默认只为当前可展示 symbol 生成状态贴图，即 `S00`、`S0`、`S1`、`S5`、`S10`。`SX` 是孤儿图片，不需要为本任务生成状态贴图。

manifest 建议结构：

```json
{
  "version": 1,
  "states": ["spinBlur", "disabled"],
  "settings": {
    "spinBlur": {
      "kind": "verticalBoxBlur",
      "kernelHeight": 21
    },
    "disabled": {
      "kind": "grayscale",
      "brightness": 0.72
    }
  },
  "symbols": {
    "S00": {
      "normal": "./S00.png",
      "spinBlur": "./S00.spinBlur.png",
      "disabled": "./S00.disabled.png"
    }
  }
}
```

要求：

- manifest 不写入生成时间，避免每次运行产生无意义 diff。
- manifest 的 `states` 必须包含 `spinBlur` 和 `disabled`。
- manifest 的每个 symbol 必须同时包含 `normal`、`spinBlur`、`disabled`。
- manifest 路径使用相对 `assets/symbols/symbol-state-textures.manifest.json` 的路径。
- 如果输出目录中存在本脚本可识别的旧产物，脚本可以先清理：
  - `*.spinBlur.png`
  - `*.disabled.png`
  - `symbol-state-textures.manifest.json`
- 不允许清理其它文件。

## 5. 图片生成脚本

新增文件：

```text
packages/rendercore/scripts/generate-symbol-state-textures.mjs
```

脚本需要导出可测试的纯函数或命令函数，例如：

```js
export function parseGenerateSymbolStateTextureArgs(argv) {}
export async function generateSymbolStateTextures(options) {}
```

CLI 入口必须用 `import.meta.url` 判断，只在直接执行时运行；测试通过动态 import 调用导出的函数，不依赖 shell 子进程输出。

新增或修改：

```text
packages/rendercore/package.json
pnpm-lock.yaml
```

`packages/rendercore/package.json` 增加：

```json
{
  "scripts": {
    "generate:symbol-state-textures": "node ./scripts/generate-symbol-state-textures.mjs"
  },
  "devDependencies": {
    "sharp": "^0.34.4"
  }
}
```

如果 `pnpm install` 更新锁文件失败，使用代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

脚本默认行为：

- 默认输入目录：仓库根目录下的 `assets/symbols`。
- 默认输出目录：仓库根目录下的 `assets/symbols`。
- 默认只处理输入目录第一层的普通 `.png` 文件，必须排除 `*.spinBlur.png`、`*.disabled.png` 以及其它 `[symbol].[state].png` 形式的状态变体，避免重复运行时把生成图当成普通图再处理。
- 参数解析必须剥离可选的前导 `--` 分隔符，确保下面两种写法都能得到同样的 `--symbols`：
  - `pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0`
  - `node packages/rendercore/scripts/generate-symbol-state-textures.mjs --symbols S00,S0`
- 支持 `--symbols S00,S0,S1,S5,S10` 参数，用于只处理指定 symbol。
- 如果传入 `--symbols`，任意指定 symbol 找不到源 PNG 必须抛错。
- 如果未传 `--symbols` 且输入目录没有可处理 PNG，必须抛错。
- 输出 PNG 必须保留透明通道。
- 同一输入和同一参数重复运行，应生成稳定一致的文件名和 manifest。

推荐命令：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10
```

`spinBlur` 生成算法：

- 读取普通 PNG。
- 使用 `sharp` 确保 alpha 通道存在。
- 对图片做纵向 box blur，推荐 `kernelHeight = 21`，宽度为 `1`，可用 `sharp().convolve({ width: 1, height: 21, kernel: Array(21).fill(1 / 21) })` 实现。
- 推荐使用 premultiply / unpremultiply 流程，避免透明边缘出现黑边。
- 输出 PNG 尺寸必须和源图一致。
- 输出 PNG 文件名为 `[symbol].spinBlur.png`。

`disabled` 生成算法：

- 读取普通 PNG。
- 转灰度。
- 推荐 `brightness = 0.72`，让不可用状态明显变暗但保留轮廓。
- 保留 alpha 通道。
- 输出 PNG 尺寸必须和源图一致。
- 输出 PNG 文件名为 `[symbol].disabled.png`。

## 6. rendercore API 修改

新增或修改文件：

```text
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/tests/symbol/texture-variants.test.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
packages/rendercore/tests/symbol/animation-resolver.test.ts
packages/rendercore/tests/symbol/ani.test.ts
packages/rendercore/tests/symbol/catalog.test.ts
```

### 6.1 类型设计

在 `packages/rendercore/src/symbol/types.ts` 中增加状态贴图类型。命名可以微调，但能力必须完整：

```ts
export interface SymbolTextureSet<TTexture = Texture | string> {
  readonly normal: TTexture;
  readonly states?: Readonly<Partial<Record<SymbolStateId, TTexture>>>;
}

export type SymbolAssetInput = Texture | string | SymbolTextureSet;

export interface SymbolTexturePolicy {
  readonly requiredStateTextures?: readonly SymbolStateId[];
}
```

调整 `SymbolAssetMap`：

```ts
export interface SymbolAssetMap {
  readonly [symbol: string]: SymbolAssetInput;
}
```

调整 `SymbolAnimationContext`，保留旧字段并增加新字段：

```ts
export interface SymbolAnimationContext {
  readonly texture: Texture;
  readonly stateTextures: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures: readonly SymbolStateId[];
}
```

保留 `texture` 的含义为普通贴图，即 `normal` 贴图。不要删除旧字段，避免现有自定义 resolver 直接失效。

调整 `RenderSymbolOptions`：

```ts
export interface RenderSymbolOptions {
  readonly definition: SymbolDefinition;
  readonly texture: Texture;
  readonly stateTextures?: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures?: readonly SymbolStateId[];
  readonly animationResolver: SymbolAnimationResolver;
}
```

调整 `CreateSymbolCatalogOptions` 和 `CreateCatalogRenderSymbolOptions`：

```ts
export interface CreateSymbolCatalogOptions {
  readonly texturePolicy?: SymbolTexturePolicy;
}

export interface CreateCatalogRenderSymbolOptions {
  readonly texture?: Texture;
  readonly stateTextures?: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly animationResolver?: SymbolAnimationResolver;
}
```

### 6.2 资产规范化

在 `catalog.ts` 中把资产输入统一规范化：

- 旧写法 `S00: texture` 视为 `{ normal: texture, states: {} }`。
- 旧写法 `S00: "/assets/S00.png"` 视为 `{ normal: "/assets/S00.png", states: {} }`。
- 新写法：

```ts
S00: {
  normal: texture,
  states: {
    spinBlur: spinBlurTexture,
    disabled: disabledTexture
  }
}
```

必须校验：

- `normal` 必须存在。
- `states` 中的状态 id 必须存在于当前 state preset。
- `texturePolicy.requiredStateTextures` 中的每个状态，对每个可展示 symbol 都必须存在对应状态贴图。
- `getAsset(symbol)` 可以继续返回普通贴图，保持兼容。
- 新增 `getTextureSet(symbol)`，返回规范化后的贴图集合。
- `SymbolCatalog` 接口也必须同步新增 `getTextureSet(symbol)`，不要只在 `SymbolCatalogModel` 类上实现。
- `createRenderSymbol(symbol)` 必须把普通贴图、状态贴图和 `requiredStateTextures` 一起传给 `RenderSymbol`。
- 如果任意普通贴图或状态贴图仍然是 URL 字符串，`createRenderSymbol()` 必须抛 `SymbolAssetError`，不能静默回退。

错误信息建议包含 symbol 和 state，例如：

```text
Symbol "S00" is missing required texture for state "spinBlur".
Symbol "S00" texture for state "disabled" is not loaded; pass a loaded Texture.
Symbol "S00" declares texture for unknown state "blurred".
```

### 6.3 状态贴图选择

在 `ani.ts` 中新增 helper：

```ts
export function resolveSymbolTextureForState(
  context: SymbolAnimationContext,
  state: SymbolStateId = context.requestedState
): Texture
```

规则：

- 如果 `context.stateTextures[state]` 存在，返回该贴图。
- 如果 `state` 在 `context.requiredStateTextures` 中但贴图不存在，抛 `SymbolAssetError`。
- 否则返回 `context.texture`。

修改 `resetBaseDisplay(context)`：

- `context.sprite.texture` 应设置为 `resolveSymbolTextureForState(context)`。
- 其它 scale、alpha、rotation、overlay 清理行为保持不变。

修改 `createWinSymbolAni(context)`：

- 扫光 overlay 使用 `resolveSymbolTextureForState(context)` 作为 overlay 贴图，而不是硬编码使用 `context.texture`。
- 这样未来若某个 once 状态也有状态贴图，不会出现主图和 overlay 不一致。

保留 `spinBlur` / `disabled` 的状态等价关系。请求 `spinBlur` 时：

- `requestedState` 是 `spinBlur`。
- `resolvedState` 是 `normal`。
- `context.state.playback` 仍然来自 `normal`，即 `static`。
- 静态 ani 通过 `requestedState` 选择 `spinBlur` 贴图。

## 7. symbolsviewer 修改

新增或修改文件：

```text
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/README.md
```

### 7.1 加载普通图和状态图

在 `apps/symbolsviewer/src/main.ts` 中读取 `assets/symbols` 下全部 PNG，然后在 helper 中拆分普通图和状态图：

```ts
const rawSymbolAssetModules = import.meta.glob("../../../assets/symbols/*.png", {
  eager: true,
  import: "default",
  query: "?url"
}) as Record<string, string>;
```

因为生成图也直接在 `assets/symbols` 下，不能继续把整个 `*.png` glob 都当普通 symbol 图。必须按文件名过滤：

- 普通图：只接受 `S00.png`、`S0.png` 这类没有状态后缀的文件。
- 状态图：只接受 `[symbol].spinBlur.png` 和 `[symbol].disabled.png`。
- 其它 `[symbol].[state].png` 如状态不在 required states 中，必须抛错或被 manifest 校验拦住，不能悄悄当普通图。

manifest 也从 `assets/symbols` 直接读取：

```ts
import stateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
```

`symbol-assets.ts` 增加函数，名字可微调：

```ts
export function createStatefulSymbolAssetMapFromModules(options: {
  readonly modules: Record<string, string>;
  readonly manifest: unknown;
  readonly requiredStates: readonly string[];
}): SymbolAssetMap
```

该函数必须：

- 从 `modules` 中拆分普通图和状态图。
- 解析普通图片 symbol 名时必须排除状态贴图后缀，避免把 `S00.spinBlur.png` 解析为 symbol `S00.spinBlur`。
- 解析 manifest。
- 校验 manifest version。
- 校验 manifest states 包含 `spinBlur` 和 `disabled`。
- 校验每个 manifest symbol 的普通图存在。
- 校验每个 required state 的状态图文件存在于 `modules` 拆分出的状态图集合。
- 拆分后的普通图集合里所有 symbol 都要进入返回的 `SymbolAssetMap`；manifest 只为对应 symbol 补充 `states`。这样 `SX` 这类孤儿普通图仍能被 catalog validation 识别为 `ignoredAssetsWithoutPaytable`，而不会被资产合并逻辑提前丢掉。
- 生成 `SymbolAssetMap`，每个 symbol 形如：

```ts
{
  normal: "/assets/S00.png",
  states: {
    spinBlur: "/assets/S00.spinBlur.png",
    disabled: "/assets/S00.disabled.png"
  }
}
```

`main.ts` 中创建 catalog 时传入必需状态贴图策略：

```ts
const requiredStateTextures = ["spinBlur", "disabled"] as const;

const catalog = createSymbolCatalog({
  gameConfig: createGameConfig(rawGameConfig),
  assets: textures,
  statePreset,
  texturePolicy: {
    requiredStateTextures
  }
});
```

加载 texture 时必须递归加载 normal 和 state textures，不能只加载第一层字段。

### 7.2 UI 和状态面板

UI 可以保持现有控制形态，不需要新增复杂面板。

必须确认：

- 默认序列仍是 `normal -> appear -> win -> spinBlur -> disabled`。
- 状态面板仍能显示 `spinBlur -> normal`、`disabled -> normal`，但画面贴图已经分别变成模糊图和灰图。
- `appear` 和 `win` 结束后回到当前默认状态时，如果默认状态是 `spinBlur` 或 `disabled`，必须显示对应状态贴图。

## 8. README 更新

### 8.1 packages/rendercore/README.md

必须新增或更新内容：

- 说明 `rendercore` 支持状态贴图集合：
  - `normal` 是普通贴图。
  - `states` 可以提供 `spinBlur`、`disabled` 等状态贴图。
- 说明 `spinBlur` / `disabled` 可以语义上等价到 `normal`，但默认静态 ani 会根据 `requestedState` 选择状态贴图。
- 说明 `texturePolicy.requiredStateTextures` 可用于要求某些状态必须提供贴图；缺失时 fail-fast。
- 说明图片生成脚本：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10
```

- 说明 `sharp` 只用于 Node 生成脚本，不进入浏览器运行时代码。
- 命令区保留并更新：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

### 8.2 apps/symbolsviewer/README.md

必须更新：

- 资产章节增加 `assets/symbols/*.spinBlur.png`、`assets/symbols/*.disabled.png` 和 `assets/symbols/symbol-state-textures.manifest.json`。
- 说明当前状态图由 `rendercore` 脚本生成。
- 删除或改写“`spinBlur` 和 `disabled` 等价到 `normal` 所以视觉也等于普通图”的旧说法。
- 新说法应表达：
  - 状态机 resolved 仍是 `normal`。
  - viewer 根据 requested state 使用 `spinBlur` 或 `disabled` 贴图。
- 验收章节新增：
  - `spinBlur` 明显是纵向模糊图。
  - `disabled` 明显是灰色图。
  - `appear` / `win` 后回到 `spinBlur` / `disabled` 默认状态时贴图正确。

## 9. 测试要求

### 9.1 rendercore 测试

新增或补充测试，至少覆盖：

- `SymbolTextureSet` 兼容旧 asset map 写法。
- `createSymbolCatalog()` 能接收状态贴图集合。
- `texturePolicy.requiredStateTextures` 缺少 `spinBlur` 或 `disabled` 时抛 `SymbolAssetError`。
- 状态贴图中出现未知 state id 时抛 `SymbolAssetError`。
- `createRenderSymbol()` 遇到未加载的 normal URL 时抛错。
- `createRenderSymbol()` 遇到未加载的 state texture URL 时抛错。
- `RenderSymbol` 请求 `spinBlur` 时：
  - snapshot 是 `requestedState: "spinBlur"`、`resolvedState: "normal"`。
  - 主 `Sprite.texture` 是 `spinBlur` 贴图。
- `RenderSymbol` 请求 `disabled` 时：
  - snapshot 是 `requestedState: "disabled"`、`resolvedState: "normal"`。
  - 主 `Sprite.texture` 是 `disabled` 贴图。
- 从 `spinBlur` / `disabled` 切回 `normal` 时，主 `Sprite.texture` 回到普通贴图。
- `appear` / `win` 完成后回到当前默认状态时，能恢复对应默认状态贴图。
- `resolveSymbolTextureForState()` 对 required missing 状态抛错，对非 required missing 状态返回普通贴图。
- 生成脚本的核心导出或脚本测试覆盖：
  - 参数解析能剥离 pnpm 传入的前导 `--`。
  - 输出文件名正确。
  - manifest 结构正确且无时间戳。
  - 输出 PNG 尺寸等于源图。
  - disabled 输出关键像素满足 `r == g == b` 或足够接近。
  - spinBlur 输出与源图不同，并且纵向邻近像素发生混合。

如果 generator 测试需要临时文件，使用系统临时目录，并在测试后清理。

### 9.2 symbolsviewer 测试

补充 `apps/symbolsviewer/tests/symbol-assets.test.ts`，至少覆盖：

- manifest + `assets/symbols/*.png` 全量 glob 能拆分普通图和状态图，并生成 stateful `SymbolAssetMap`。
- `S00.spinBlur.png`、`S00.disabled.png` 这类生成图不会被解析为普通 symbol。
- 缺少 `spinBlur` 或 `disabled` 文件会抛错。
- manifest 中状态未知会抛错。
- `createSymbolsViewerCatalog()` 传入 required state textures 后仍只展示 `S00`、`S0`、`S1`、`S5`、`S10`。
- `SX` 不在 paytable 时仍不会进入 displayable symbols，并且仍出现在 `ignoredAssetsWithoutPaytable` 中。

### 9.3 coverage

不允许降低 `packages/rendercore/vite.config.ts` 中 coverage thresholds；最终实际 coverage 结果必须都大于 80%，不能只满足“等于 80%”的边界。

验收时必须执行：

```bash
pnpm --filter @slotclientengine/rendercore test
```

输出中必须确认：

- Statements > 80%
- Branches > 80%
- Functions > 80%
- Lines > 80%

如果新增分支导致 coverage 下降或只刚好等于 80%，补测试，不要降低阈值。

## 10. 执行步骤

按以下顺序执行：

1. 确认工作树状态，避免覆盖无关改动：

```bash
git status --short
```

2. 给 `packages/rendercore` 添加 Node 生成脚本和 `sharp` devDependency。

3. 执行依赖安装：

```bash
pnpm install
```

如果失败，执行代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

4. 实现 `rendercore` 的状态贴图类型、catalog 规范化、fail-fast 校验、`RenderSymbol` context 传递、`ani.ts` 贴图选择。

5. 补齐 `rendercore` 测试，先运行局部测试：

```bash
pnpm --filter @slotclientengine/rendercore test
```

6. 运行生成脚本，生成当前 viewer 需要的状态贴图：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10
```

7. 修改 `apps/symbolsviewer` 的资产加载逻辑，让它加载 manifest、普通图和状态图，并传入 `texturePolicy.requiredStateTextures`。

8. 补齐 `symbolsviewer` 测试：

```bash
pnpm --filter symbolsviewer test
```

9. 更新 README：

```text
packages/rendercore/README.md
apps/symbolsviewer/README.md
```

10. 检查是否需要更新 `agents.md`：

- 如果只增加 package 内脚本、README 和资源，不需要更新。
- 如果新增了仓库级协作规则、目录规范或基础脚本要求，必须同步更新 `agents.md`。

11. 执行完整验收命令。

12. 检查工作树，确认只包含任务相关源码、测试、README、资源、锁文件和任务报告；不要把 `dist/`、`coverage/`、`node_modules/` 等构建输出纳入提交。

```bash
git status --short
```

13. 写任务报告 `tasks/21-rendercore-symbol-state-textures-[utctime].md`。

## 11. 验收命令

局部验收：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
```

根级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

浏览器 bundle 依赖检查：

```bash
rg -n "\"sharp\"|from \"sharp\"|node:fs|node:path|generate-symbol-state-textures" packages/rendercore/dist apps/symbolsviewer/dist
```

期望：无输出。`rg` 无匹配时退出码可能是 `1`，这是可接受结果；如果出现匹配，必须确认是否把 Node-only 脚本或依赖打进了运行时代码，不能把 `sharp` 发布到浏览器 bundle。

## 12. 浏览器验收

启动 viewer：

```bash
pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 4173
```

打开：

```text
http://127.0.0.1:4173/
```

建议使用 PC 横屏视口 `1280x720` 或更大。

必须检查：

- Pixi canvas 非空。
- `S00`、`S0`、`S1`、`S5`、`S10` 全部可见。
- 默认序列自动播放。
- `normal` 是普通图。
- `appear` 有放大弹回效果。
- `win` 有扫光效果。
- `spinBlur` 显示纵向模糊图，不是普通图。
- `disabled` 显示灰色图，不是普通图。
- 状态面板中 `spinBlur` / `disabled` 仍可显示为 requested state，resolved state 可以是 `normal`。
- 把默认 stable 状态切到 `spinBlur` 后，播放 `appear` 或 `win`，单次状态结束后回到模糊图。
- 把默认 stable 状态切到 `disabled` 后，播放 `appear` 或 `win`，单次状态结束后回到灰图。
- 移除、调整、增加状态后，播放顺序按当前序列执行。

如果本地沙箱无法启动 dev server 或无法浏览器验收，任务报告必须明确写出失败命令、错误信息和未完成的人工验收项，不能暗示已经完成浏览器确认。

## 13. 任务报告要求

任务完成后新增：

```text
tasks/21-rendercore-symbol-state-textures-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒，例如：

```text
tasks/21-rendercore-symbol-state-textures-260610-093000.md
```

可用以下命令生成时间戳：

```bash
date -u +%y%m%d-%H%M%S
```

报告必须包含：

- 完成摘要。
- 实际新增和修改的文件列表。
- 新增公开 API 或类型说明。
- 生成的状态贴图列表。
- `spinBlur` 和 `disabled` 的实现方式。
- 是否更新 `agents.md`，如果未更新，说明原因。
- `rendercore` coverage 结果，必须列出 statements/branches/functions/lines。
- 所有验收命令结果。
- 浏览器验收结果；如果没有做，明确说明没有做。
- 已知风险或后续建议。

## 14. 非目标

本任务不做以下事项：

- 不重构 `SymbolStateMachine` 的状态等价语义。
- 不把 `spinBlur` / `disabled` 的视觉效果写死到状态定义里。
- 不在浏览器运行时动态用 filter 生成灰图或模糊图。
- 不改 `assets/gamecfg/game2.json`。
- 不补齐 paytable 中缺图的 `BN`、`SC`、`RS`、`X2`、`X5`、`X10`。
- 不让孤儿图片 `SX` 进入 symbolsviewer 展示列表。
- 不降低任何测试覆盖率阈值。
- 不为了测试通过而加入静默 fallback。
