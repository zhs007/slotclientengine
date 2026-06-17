# anieditorv5runtime-cc single file 任务计划

## 1. 任务目标

基于当前已经存在的 Cocos Creator 运行时包：

```text
packages/anieditorv5runtime-cc
```

新增一个可直接复制进 Cocos Creator 3.8.6 项目的单文件 TypeScript runtime：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

这个文件必须满足：

- 使用方只需要把 `anieditorv5runtime-cc.ts` 复制到 Cocos Creator 项目的 `assets/scripts/vendor/anieditorv5runtime-cc.ts`，再从业务 Component 里相对路径 import 即可。
- 单文件 runtime 只能依赖 Cocos Creator 内置的 `cc` 模块，不依赖 pnpm workspace、npm package exports、monorepo 路径、`dist` 目录或 `.js` 后缀相对 import。
- 单文件 runtime 必须包含 V5G 类型、严格校验、动画采样、项目采样、Cocos 节点创建和播放控制。
- player 需要的所有 runtime 依赖都必须在这个文件里；除了 `"cc"` 之外，不能再依赖同目录 helper 文件、生成文件或 package 内其它模块。
- 这个文件本质上是 Cocos 项目内通过相对路径 import 的大型实现文件，不是 npm 外部库。可能被宿主项目其它 TS 用到的类型、常量、校验函数、采样函数和 player API 都应该使用 named export 暴露。
- 单文件 runtime 只实现 runtime/player。它接收已经准备好的 `V5GProjectConfig` 对象和 SpriteFrame resolver，不负责读取、导入、加载或解析 `project.json`。
- 单文件 runtime 必须继续保持 fail-fast：未知资源、未知动画、未知 easing、未知 blend mode、缺失必需参数、资源尺寸不匹配都要直接抛错，不允许静默降级、占位图、自动猜路径或把错误当作默认值处理。
- 如果测试为了绕过 Cocos Creator 或导入限制而要求生产代码出现奇怪分支，应修改测试，不要改不该改的生产逻辑。

任务完成后新增中文任务报告：

```text
tasks/32-anieditorv5runtime-cc-single-file-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/32-anieditorv5runtime-cc-single-file-260617-123456.md
```

## 2. 当前仓库事实

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
- 根协作规则文件当前同时存在：
  - `AGENTS.md`
  - `agents.md`
- 新增空目录必须放 `.keepme`
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

当前任务 30 已实现：

- `packages/anieditorv5runtime-cc`
- package 名：`@slotclientengine/anieditorv5runtime-cc`
- `src/core`：V5G 类型、校验、动画采样、项目采样。
- `src/cocos`：Cocos Creator 3.8.6 adapter。
- `src/cocos/cocos-node-driver.ts`：当前唯一 runtime import `cc` 的文件。
- `src/index.ts`：不 runtime re-export 真实 Cocos driver。
- `README.md`：说明 package 导入方式和 Cocos Creator 3.8.6 集成方式。

当前 package 导入 Cocos Creator 时可能出现的问题来源：

- Cocos Creator 不一定能正确解析 pnpm workspace symlink。
- Cocos Creator 对 package `exports`、workspace 子路径和 monorepo 构建产物的处理可能与 Node/Vite 不一致。
- 当前源码内部使用 ESM `.js` 后缀相对 import，这是 TypeScript package 构建需要，但复制源码到 Cocos 项目时容易引发路径和模块解析问题。
- 直接复制 `src` 目录会带来多文件相对 import、类型 shim、真实 `cc` import 隔离等额外心智负担。
- Cocos Creator 项目需要编辑器管理资源、`.meta`、场景和 SpriteFrame 绑定，不能靠 monorepo package 自己完成。

因此本任务不再要求使用方导入 workspace package；本任务的核心交付是一个可以复制的单 TS 文件。

## 3. 必须参考的现有实现

当前 Cocos runtime：

```text
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/coordinates.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
packages/anieditorv5runtime-cc/src/cocos/coordinates.ts
packages/anieditorv5runtime-cc/tests/core/*.test.ts
packages/anieditorv5runtime-cc/tests/cocos/*.test.ts
packages/anieditorv5runtime-cc/README.md
```

当前 viewer 最新 V5G 播放语义：

```text
apps/anieditorv5viewer/src/v5g/types.ts
apps/anieditorv5viewer/src/runtime/validation.ts
apps/anieditorv5viewer/src/runtime/animation-sampler.ts
apps/anieditorv5viewer/src/runtime/project-sampler.ts
apps/anieditorv5viewer/src/runtime/particle-sampler.ts
apps/anieditorv5viewer/src/runtime/layer-instance.ts
apps/anieditorv5viewer/src/runtime/v5g-player.ts
apps/anieditorv5viewer/tests/runtime/*.test.ts
```

当前导出样例：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/bigwin.json
docs/anieditor5/export/megawin.json
docs/anieditor5/export/superwin.json
docs/anieditor5/export/assets/*
```

任务 31 之后，viewer 已支持新版 layer animation：

```text
scale_in
scale_out
pop
shake
blink
particles
particle_twinkle
```

本任务必须先核对 `packages/anieditorv5runtime-cc/src/core` 是否落后于 viewer。如果落后，应把 Cocos runtime 的 core 语义同步到当前 viewer，再生成或编写单文件 runtime。不要让单文件版本只支持任务 30 的旧样例而忽略当前导出格式。

## 4. 范围边界

本任务要做：

- 在现有 `packages/anieditorv5runtime-cc` 内新增单文件 runtime。
- 更新 package 级脚本、测试和文档，让单文件 runtime 成为可验证交付物。
- 保留现有模块化源码和 package 出口，不破坏已有 Node/Vitest 验证。
- 同步当前 viewer 的 V5G 类型、校验、采样语义到 Cocos runtime core。
- 为单文件 runtime 增加独立扫描和行为一致性测试。
- 提供可复制到 Cocos Creator 3.8.6 项目的最小 Component 示例。
- 如果可以访问 Cocos Creator 3.8.6 编辑器，执行真实复制导入验收，并在任务报告里记录结果。

本任务不要做：

- 不新增 `apps/anieditorv5viewer-cc`。
- 不提交 Cocos Creator 编辑器生成的 `Library`、`Temp`、`local`、`build` 等缓存目录。
- 不要求使用方通过 pnpm workspace 或 package exports 导入 runtime。
- 不把 `dist/*.js` 改名成 `.ts` 当作交付。
- 不新增 npm 依赖名为 `cc` 的依赖；`cc` 是 Cocos Creator 编辑器环境提供的模块。
- 不把 Cocos import 问题用动态 `any`、全局变量猜测或 try/catch fallback 掩盖。
- 不在单文件 runtime 中实现 `project.json` 加载、Cocos `JsonAsset` 绑定、resources 路径解析、远程下载或任何宿主项目资源管理逻辑。
- 不把 `screen`、`multiply`、`lighten` 等未确认的 Cocos blend mode 静默降级成 `normal`。
- 不为了测试通过修改 V5G 真实语义。

## 5. 目标文件结构

建议新增或修改：

```text
packages/anieditorv5runtime-cc/
  package.json
  README.md
  vitest.config.ts
  tsconfig.standalone.json
  tsconfig.eslint.json
  .prettierignore
  scripts/
    check-standalone.mjs
  standalone/
    anieditorv5runtime-cc.ts
    V5GPreview.example.ts
  tests/
    fakes/
      cc.ts
    fixtures/
      project.json
      bigwin.json
      megawin.json
      superwin.json
    standalone/
      standalone-import.test.ts
      standalone-parity.test.ts
      standalone-player.test.ts
```

如果某个目录阶段性为空，必须添加 `.keepme`。最终已有文件的目录不需要 `.keepme`。

## 6. 单文件 runtime 合同

`packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 必须是一个真正可复制的 TypeScript 源文件。

允许的 runtime import 只有 Cocos Creator 内置模块：

```ts
import {
  BlendFactor,
  Color,
  Graphics,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  UIOpacity,
} from "cc";
```

如实现需要其它 Cocos 类型，也必须只来自 `"cc"`。

单文件 runtime 只允许把 `V5GProjectConfig` 当作普通对象输入。禁止在 runtime 内部 import JSON、声明 `JsonAsset` 字段、调用 `resources.load()`、解析资源 URL、读取文件或访问编辑器资产数据库。

单文件 runtime 必须自包含 player 的全部 TypeScript 依赖。除 `"cc"` 外，不能把任何实现拆到：

```text
./core/*
./cocos/*
./helpers/*
../*
@slotclientengine/*
```

如果某段逻辑只被 player 内部使用，可以保留为文件内非 export helper；如果宿主项目可能需要复用或测试需要直接断言，应使用 named export 暴露。

禁止出现：

```text
from "./"
from "../"
from "@slotclientengine/"
from "pixi.js"
from "fs"
from "node:"
require(
.js" 作为内部源码 import
window
document
```

单文件 runtime 不应包含 decorated Cocos `Component`。它只提供普通 class 和函数，避免把编辑器序列化、场景挂载方式和业务 Component 绑死到 runtime 文件里。

建议公开 API：

```ts
export type V5GCoordinateMode = "center";
export type V5GLayerType = "image" | "text" | "group";
export type V5GAssetType = "image";
export type V5GBlendMode = "normal" | "add" | "screen" | "multiply" | "lighten";
export type V5GAnimationType =
  | "move"
  | "fade"
  | "scale_up"
  | "scale_down"
  | "scale_in"
  | "scale_out"
  | "pop"
  | "shake"
  | "blink"
  | "rotate"
  | "slide_in"
  | "slide_out"
  | "bounce_in"
  | "pulse"
  | "float"
  | "swing"
  | "particles"
  | "particle_twinkle";

export interface V5GProjectConfig {
  // 完整 V5G project 类型
}

export interface SampledLayerState {
  // 单层采样结果
}

export interface SampledProjectState {
  // 项目采样结果
}

export interface V5GCocosAssetResolver {
  getSpriteFrame(assetPath: string, assetId: string): SpriteFrame | null;
}

export interface V5GCocosPlayerOptions {
  root: Node;
  project: V5GProjectConfig;
  assets: V5GCocosAssetResolver;
  loop?: boolean;
  onTimeChange?: (time: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

export class V5GCocosPlayer {
  init(): void;
  seek(time: number): void;
  update(deltaSeconds: number): void;
  play(): void;
  pause(): void;
  restart(): void;
  setLoop(loop: boolean): void;
  destroy(): void;
}

export function createV5GCocosPlayer(
  options: V5GCocosPlayerOptions,
): V5GCocosPlayer;

export function assertV5GProject(value: unknown): V5GProjectConfig;
export function validateV5GProject(project: V5GProjectConfig): void;
export function validateCocosV5GProject(project: V5GProjectConfig): void;
export function parseColorHex(value: string): number;
export function sampleProjectAtTime(
  project: V5GProjectConfig,
  time: number,
): SampledProjectState;
export function sampleLayerAtTime(
  layer: V5GLayerConfig,
  time: number,
): SampledLayerState;
export function sampleLayerAnimationsAtTime(
  base: V5GAnimationSampleBase,
  animations: readonly V5GAnimationConfig[],
  time: number,
): V5GAnimationSampleResult;
export function opacityToCocosOpacity(opacity: number): number;
export function v5gTransformToCocosPosition(transform: V5GTransformConfig): {
  x: number;
  y: number;
};
```

如果实现了粒子动画，还必须 export 粒子采样相关类型和函数，例如 `ParticleSpriteSample`、`sampleParticleSpritesForLayer()`、`hasActiveParticleAnimation()`。如果某个导出被认为不应该公开，必须在任务报告中解释它为何确实只是内部实现细节。

`V5GCocosPlayer` 播放合同：

- `init()` 创建 runtime 管理的 stage、背景层、内容层和必要的粒子层。
- `seek()` 是唯一同步视觉状态的入口。
- `play()` 只切换播放状态，不自动绑定 scheduler。
- `update(deltaSeconds)` 由宿主 Cocos Component 的 `update(deltaTime)` 调用。
- `pause()` 停止推进时间。
- `restart()` 回到 0 秒。
- `loop` 默认可以为 `true`，但必须能关闭。
- `destroy()` 只销毁 runtime 创建的节点，不销毁调用方传入的 `root`。

资源合同：

- runtime 不自动猜 Cocos `resources` 路径。
- 使用方必须提供 `asset.path` / `asset.id` 到 `SpriteFrame` 的解析。
- `getSpriteFrame()` 返回 `null` 时直接抛错，错误信息必须包含 `asset.id` 和 `asset.path`。
- 如果能从 Cocos `SpriteFrame` 读取原始尺寸，必须校验它与 JSON `asset.width/height` 一致。
- 如果 Cocos 3.8.6 真实编辑器内无法可靠读取尺寸，不要伪造“已校验”；应在 README 和任务报告中明确说明限制，并保留其它严格校验。

坐标合同：

- V5G 当前只支持 `stage.coordinate === "center"`。
- Cocos 节点位置直接使用 `transform.x` / `transform.y`。
- 不要套用 Pixi 的左上角转换：

```text
pixiX = stage.width / 2 + x
pixiY = stage.height / 2 - y
```

图层合同：

- 当前 Cocos runtime 必须支持 `image` 图层。
- 如果没有同步实现并测试 Cocos `Label`，`validateCocosV5GProject()` 必须拒绝 `text` 图层。
- `group`、非空 `parentId`、非空 `keyframes` 必须显式失败。
- 图层顺序按 `project.layers` 原始顺序添加，后面的图层显示在上层。
- `anchorX/anchorY`、负 `scaleX/scaleY`、rotation degree、opacity、visible 必须按采样结果应用。
- opacity 使用 `UIOpacity`，从 `0..1` 转为 `0..255`，四舍五入并 clamp。
- visible 使用 `node.active`。

背景层合同：

- runtime 必须根据 `project.stage.backgroundColor` 创建背景层。
- 背景层尺寸覆盖 `project.stage.width x project.stage.height`。
- 背景层必须在所有 V5G 图层下方。
- 具体实现可以沿用当前 `Graphics` 方案，但要在 README 和任务报告里记录。

blend mode 合同：

- `normal` 和 `add` 必须支持并测试。
- `screen` 只有在 Cocos Creator 3.8.6 编辑器内确认等价实现后才能放行。
- 如果无法确认 `screen`，`validateCocosV5GProject()` 必须拒绝包含 `screen` 的项目，错误信息包含 `Unsupported Cocos V5G blendMode: screen`。
- `multiply`、`lighten` 同理，未确认前必须拒绝。

粒子动画合同：

- core 必须同步 viewer 对 layer animation `particles` / `particle_twinkle` 的采样语义。
- Cocos runtime 应优先实现与 viewer 等价的粒子 sprite 渲染：复用当前图层的 `SpriteFrame`，在粒子层创建临时/池化 Sprite 节点，使用采样出的 offset、scale、rotation、alpha 和 blend mode。
- 粒子 rotation 如果来自 viewer 的 radian 值，应用到 Cocos 前必须转换为 degree。
- 粒子层应位于普通内容层上方，行为需要与 viewer 的 `particleRoot` 语义一致。
- 如果执行中发现 Cocos 3.8.6 中粒子 sprite 方案不可行，必须让包含粒子动画的项目显式失败，并在报告中写明原因。不能假装跳过粒子也算播放成功。

## 7. Cocos 示例合同

新增：

```text
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

示例 Component 只作为复制参考，不作为 runtime 的必需入口。

示例必须展示：

- 从相对路径导入单文件 runtime，例如：

```ts
import {
  createV5GCocosPlayer,
  type V5GCocosAssetResolver,
  type V5GCocosPlayer,
} from "./vendor/anieditorv5runtime-cc";
```

- 这是宿主 Cocos Component 示例，负责准备 `project: V5GProjectConfig` 和 `SpriteFrame` 解析器；runtime 单文件本身不加载 JSON。
- 示例可以演示一种宿主侧 `project.json` 输入方式，例如 Cocos `JsonAsset`、业务项目已有配置模块、或调用方直接传入对象。无论选择哪种方式，都必须写清它属于宿主代码，不属于 runtime。
- 在 Cocos `update(deltaTime: number)` 中调用 `player.update(deltaTime)`。
- 在 `onDestroy()` 中调用 `player.destroy()`。
- 使用显式 `assetId -> SpriteFrame` 绑定，不要只靠 `SpriteFrame.name` 猜测资源。

推荐示例绑定方式：

```ts
@property([String])
assetIds: string[] = [];

@property([SpriteFrame])
spriteFrames: SpriteFrame[] = [];
```

示例必须在启动时检查：

- `root` 已绑定。
- 宿主代码已经准备好 `project` 对象，且 `assertV5GProject()` / `validateCocosV5GProject()` 能通过。
- `assetIds.length === spriteFrames.length`。
- 没有重复 asset id。
- 每个 `project.assets[].id` 都能解析到 `SpriteFrame`。

缺失时直接抛错，不创建 placeholder。

## 8. package 脚本和配置

在 `packages/anieditorv5runtime-cc/package.json` 中新增脚本：

```json
{
  "standalone:check": "node scripts/check-standalone.mjs",
  "typecheck:standalone": "tsc -p tsconfig.standalone.json --noEmit"
}
```

如果执行者选择新增自动生成脚本，还必须新增：

```json
{
  "standalone:build": "node scripts/build-standalone.mjs"
}
```

但本任务不强制引入 TS-to-TS bundler。若采用手工合并的单文件源码，必须用 parity 测试防止它与模块化 runtime 发散。

`tsconfig.standalone.json` 必须只覆盖单文件 runtime、示例文件和最小 `cc` 类型 shim：

```json
{
  "extends": "./tsconfig.json",
  "include": ["standalone/**/*.ts", "types/**/*.d.ts"],
  "exclude": ["dist", "coverage", "node_modules", "tests"]
}
```

如果实际配置需要包含 `tests/fakes/cc.ts` 才能给 Vitest alias 编译，应保持 package `tsconfig.json` 和 `tsconfig.standalone.json` 边界清楚：单文件对外复制时不能依赖 fake。

`tsconfig.eslint.json` 必须同步 include 新增的手写源码：

```json
{
  "include": [
    "src/**/*.ts",
    "standalone/**/*.ts",
    "tests/**/*.ts",
    "types/**/*.d.ts",
    "vitest.config.ts"
  ]
}
```

如果新增 `scripts/*.mjs`，`eslint.config.cjs` 必须明确覆盖或忽略它们，不能让 package 级 `lint` 靠偶然配置通过。

新增或复制 JSON fixtures 后必须处理格式化策略：

- 优先让复制到 `packages/anieditorv5runtime-cc/tests/fixtures/*.json` 的 JSON 通过 Prettier。
- 如果选择在 `.prettierignore` 排除 copied fixtures，必须在任务报告说明原因，并确认不会隐藏手写源码格式问题。

`scripts/check-standalone.mjs` 必须检查：

- `standalone/anieditorv5runtime-cc.ts` 存在。
- 文件中没有相对 import。
- 文件中没有 `@slotclientengine/` import。
- 文件中没有依赖 package `exports`、`dist`、`src/core`、`src/cocos` 或其它 sibling helper 文件。
- 文件中没有 `pixi.js`、Node builtin、浏览器全局依赖。
- 文件中没有内部 `.js` 后缀 import。
- 文件中没有 decorated `@ccclass` runtime Component。
- 文件只允许从 `"cc"` import Cocos API。
- 文件导出了宿主侧可能复用的 V5G 类型、player 类型、校验函数、采样函数、坐标/opacity 工具和 player 创建 API。

## 9. 测试计划

### 9.1 fixtures 同步

把当前导出 JSON 同步到 package tests fixtures：

```bash
cp docs/anieditor5/export/project.json packages/anieditorv5runtime-cc/tests/fixtures/project.json
cp docs/anieditor5/export/bigwin.json packages/anieditorv5runtime-cc/tests/fixtures/bigwin.json
cp docs/anieditor5/export/megawin.json packages/anieditorv5runtime-cc/tests/fixtures/megawin.json
cp docs/anieditor5/export/superwin.json packages/anieditorv5runtime-cc/tests/fixtures/superwin.json
```

如果导出 JSON 更新导致测试失败，先确认真实导出合同，再修改测试或 runtime。不要为了旧 fixture 修改生产语义。

fixtures 同步后必须新增一个资源一致性检查，可以写入测试或脚本：

- 4 个 fixture 都能被 `assertV5GProject()` 解析。
- 4 个 fixture 的 `project.assets[].path` 对应 `docs/anieditor5/export/assets/*` 真实存在。
- 记录 4 个 fixture 合计唯一 `asset.path` 数量；当前任务 31 后预期是 28 个唯一资源路径，如果数量变化，必须在报告中解释是导出数据变更还是同步错误。

### 9.2 core 同步测试

更新或新增 core 测试，覆盖：

- `V5G_0.x` schema。
- `victory_editor_v5_g`。
- `cocos_creator`。
- Cocos Creator `3.8.6`。
- `center` 坐标。
- 当前 viewer 支持的 animation type：

```text
move
fade
scale_up
scale_down
scale_in
scale_out
pop
shake
blink
rotate
slide_in
slide_out
bounce_in
pulse
float
swing
particles
particle_twinkle
```

- 顶层 `project.particles` 非空仍显式失败，除非导出格式已经改变且报告解释原因。
- `particles` / `particle_twinkle` 作为 layer animation 时可以通过 core 校验。
- `screen` 可以通过通用 V5G 校验，但 Cocos runtime 只有在确认实现后才能通过 `validateCocosV5GProject()`。

### 9.3 standalone import 测试

新增 `tests/standalone/standalone-import.test.ts`：

- 使用 Vitest alias 把 `"cc"` 指向 `tests/fakes/cc.ts`。
- 直接 import `standalone/anieditorv5runtime-cc.ts`。
- 断言导出的 public API 存在，至少包含 V5G 类型、player 类型、校验函数、采样函数、坐标/opacity 工具和 player 创建 API。
- 断言 import 时不会访问 DOM、window、document、Node fs 或 monorepo package 路径。

`tests/fakes/cc.ts` 只提供测试需要的最小 Cocos 假实现，不能反过来让生产代码依赖 fake-only 行为。

fake `"cc"` 必须覆盖 standalone runtime 实际使用的 Cocos 类和字段；如果示例文件也参与 typecheck，还必须覆盖示例实际用到的 `_decorator`、`Component` 等 Cocos 类型。fake 只用于测试和编译，不能被复制进 Cocos 项目。

### 9.4 parity 测试

新增 `tests/standalone/standalone-parity.test.ts`，比较模块化 runtime 和单文件 runtime 的行为：

- 对 `project.json`、`bigwin.json`、`megawin.json`、`superwin.json` 执行 `assertV5GProject()`。
- 对每个 JSON 在多个时间点采样：

```text
0
0.1
0.6
0.8
1
2
4
4.4
duration
duration + 1
```

- 比较 `sampleProjectAtTime()` 的 time、layer id、transform、opacity、visible、renderImageDisplay、hasActiveParticleAnimation、blendMode。
- 比较 `parseColorHex()`、`opacityToCocosOpacity()`、Cocos 坐标转换。
- 对不支持的 Cocos blend mode，模块化和单文件必须抛出同类错误。

如果 parity 测试暴露模块化 runtime 已落后于 viewer，应先修模块化 runtime，再同步单文件。不要让单文件和 package 形成两套互相矛盾的实现。

### 9.5 standalone player 测试

新增 `tests/standalone/standalone-player.test.ts`：

- 使用 fake `"cc"` 运行单文件 runtime 的真实 Cocos adapter 逻辑。
- `init()` 创建 stage、背景层、content/root 层和 image layers。
- 图层顺序正确。
- `seek()` 写入 position、scale、rotation、opacity、active、anchor、blend mode。
- `update(deltaSeconds)` 在 `play()` 后推进时间。
- loop 开启时回绕，关闭时停在 `stage.duration`。
- 负 scale 镜像保留。
- 缺失 SpriteFrame 抛错，错误包含 asset id 和 path。
- SpriteFrame 尺寸不匹配抛错。
- 粒子动画如果实现，必须创建粒子节点并清理上一帧粒子节点或正确复用对象池。
- `destroy()` 只销毁 runtime 创建的节点，不销毁调用方传入 root。

## 10. README 更新

更新：

```text
packages/anieditorv5runtime-cc/README.md
```

README 必须新增“单文件复制导入”章节，至少包含：

1. 为什么推荐 Cocos Creator 项目优先使用 `standalone/anieditorv5runtime-cc.ts`，而不是 pnpm workspace package。
2. 复制路径示例：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
-> CocosProject/assets/scripts/vendor/anieditorv5runtime-cc.ts
```

3. 业务 Component 如何相对路径 import runtime。
4. 样例 `project.json` 和图片资源来源；README 必须说明 JSON 加载由宿主 Cocos TS 处理，runtime 只接收已经得到的 project 对象：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/assets/*
```

5. 如何显式绑定 `asset.id -> SpriteFrame`。
6. `update(deltaTime)` 如何驱动播放。
7. 支持/不支持能力列表。
8. 未支持能力会抛错，不会 fallback。
9. Cocos Creator 3.8.6 编辑器实测结果；如果未实测，不要写成已通过。

README 还必须说明：

- `standalone/anieditorv5runtime-cc.ts` 是可复制源码。
- `standalone/V5GPreview.example.ts` 是示例 Component，不是必须复制的 runtime。
- 宿主 Cocos 项目负责 Canvas/root 的缩放和屏幕适配。
- runtime 只创建 `project.stage.width x project.stage.height` 的中心坐标内容。

## 11. 执行步骤

### 阶段 1：确认差异并同步 core

1. 对比 `apps/anieditorv5viewer/src/v5g/types.ts` 和 `packages/anieditorv5runtime-cc/src/core/types.ts`。
2. 对比 viewer 的 `animation-sampler.ts`、`project-sampler.ts`、`particle-sampler.ts` 与 package core。
3. 把 package core 同步到当前 viewer 的 V5G 播放合同。
4. 更新 package core 测试，确保旧 `project.json` 和新 `bigwin/megawin/superwin` fixtures 都被覆盖。
5. 保持 `src/core` 不 import `cc`、DOM、Pixi 或浏览器全局对象。

### 阶段 2：实现单文件 runtime

1. 新增 `standalone/anieditorv5runtime-cc.ts`。
2. 把 core 类型、校验、采样、Cocos player、真实 Cocos node driver、blend mode、坐标工具合并到单文件。
3. 单文件内部不保留相对 import。
4. 单文件只从 `"cc"` import Cocos API。
5. 公开 `createV5GCocosPlayer()` 和 `V5GCocosPlayer`。
6. 保持 runtime class 不使用 Cocos decorators。
7. 如果实现粒子渲染，添加 particle root 和清理逻辑。
8. 如果暂不支持某个 Cocos-only 能力，必须让 `validateCocosV5GProject()` 抛出明确错误。

### 阶段 3：新增示例和文档

1. 新增 `standalone/V5GPreview.example.ts`。
2. 示例使用显式 `assetIds` + `spriteFrames` 绑定。
3. 更新 `README.md`。
4. 不把示例写成需要 pnpm package 或 workspace 路径才能运行。

### 阶段 4：新增扫描和测试

1. 新增 `scripts/check-standalone.mjs`。
2. 新增 `tsconfig.standalone.json`。
3. 更新 `package.json` 脚本。
4. 更新 `vitest.config.ts`，为 standalone 测试提供 `"cc"` alias。
5. 新增 `tests/fakes/cc.ts`。
6. 新增 standalone import、parity、player 测试。
7. 确认 coverage 配置不会因为 Cocos fake 或 standalone 文件误导结果；如果排除某文件，必须在报告说明原因。

### 阶段 5：Cocos Creator 3.8.6 人工验收

如果执行环境可打开 Cocos Creator 3.8.6，必须做：

1. 创建或打开一个真实 Cocos Creator 3.8.6 测试项目。
2. 把单文件复制到：

```text
assets/scripts/vendor/anieditorv5runtime-cc.ts
```

3. 复制或导入样例 JSON 和图片资源：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/assets/*
```

4. 在宿主 Cocos 项目的其它 TS 代码中处理 `project.json` 加载或绑定，并把得到的普通对象传给 runtime；不要把 JSON 加载逻辑写进 `anieditorv5runtime-cc.ts`。
5. 新增一个测试 Component，参考 `standalone/V5GPreview.example.ts`。
6. 在编辑器中绑定 root、asset id、SpriteFrame，并确认宿主代码传入的 `project` 对象来自正确的样例 JSON。
7. 运行 `seek(0)`、`seek(0.6)`、`seek(0.8)`、`seek(4.0)`、`seek(4.4)`、`play()`、`pause()`、`restart()`。
8. 观察并记录：
   - 画面不是空白。
   - 图层顺序正确。
   - 负 scale 镜像正确。
   - `add` blend mode 生效或至少 Cocos 配置符合预期。
   - 背景层颜色和尺寸正确。
   - `update(deltaTime)` 能驱动播放。
9. 如果测试 `megawin/superwin`，记录粒子动画是否按预期显示。
10. 如果测试 `bigwin`，记录 `screen` blend mode 是已实现通过，还是按计划显式失败。

如果 Cocos Creator 3.8.6 编辑器不可用，任务报告必须明确写：

```text
Cocos Creator 3.8.6 编辑器验收未执行，原因：...
```

不能把未执行的编辑器验收写成通过。

## 12. 验证命令

如果依赖安装失败，先执行代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

package 级验证：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

如果修改了 `apps/anieditorv5viewer` 以同步合同，额外运行：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

根级验证：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
pnpm format:check
```

如果根级 `pnpm format:check` 因既有无关 `coverage/**`、`dist/**` 或历史格式问题失败，不能顺手修改无关文件。任务报告必须记录失败摘要、确认 package 级 `format:check` 是否通过，并说明是否与本任务有关。

## 13. 验收标准

代码结构验收：

- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 存在。
- 单文件 runtime 没有相对 import。
- 单文件 runtime 没有 workspace/package import。
- 单文件 runtime 只依赖 Cocos Creator 内置 `"cc"`。
- 单文件 runtime 自包含 player 的全部 runtime 依赖，不依赖 sibling helper、`dist`、package exports 或 monorepo 源码路径。
- 单文件 runtime 使用 named export 暴露宿主侧可能复用的类型、常量、校验函数、采样函数、坐标/opacity 工具和 player API。
- 单文件 runtime 不包含 decorated Component。
- `standalone/V5GPreview.example.ts` 存在，并使用相对路径导入单文件 runtime。
- 单文件 runtime 不包含 JSON 加载、`JsonAsset` 绑定、`resources.load()` 或宿主项目资源管理逻辑。
- 示例 Component 或宿主侧其它 TS 负责准备 `project` 对象，再传给 runtime。
- `scripts/check-standalone.mjs` 存在，并能阻止常见不可复制依赖。
- `tsconfig.standalone.json` 存在。
- `tsconfig.eslint.json`、`eslint.config.cjs`、`.prettierignore` 已同步新增文件范围，package 级 lint/format 不靠遗漏文件通过。

功能验收：

- 单文件 runtime 能校验并播放宿主传入的当前 V5G project 对象；它不负责从文件加载 JSON。
- fixture 资源路径与 `docs/anieditor5/export/assets/*` 一致，并在报告中记录唯一资源数量。
- 单文件 runtime 的采样结果与模块化 runtime 一致。
- Cocos 坐标不使用 Pixi 左上角转换。
- `project.stage.backgroundColor` 创建真实背景层。
- `update(deltaSeconds)` 能驱动 `play()` 后的时间推进。
- 负 scale 镜像保留。
- 缺失资源显式失败。
- SpriteFrame 尺寸不匹配显式失败。
- 未支持的 blend mode 显式失败。
- 未知动画、未知 easing、缺少动画参数显式失败。
- 如果支持粒子动画，粒子节点生成、透明度、scale、rotation、清理行为都有测试。

测试验收：

- package 级 `typecheck/typecheck:standalone/standalone:check/lint/test/build/format:check` 通过，或报告中写明明确的环境原因。
- 根级 `typecheck/lint/test/build/git diff --check` 通过，或报告中写明明确的既有问题或环境原因。
- standalone parity 测试覆盖 4 个导出 JSON。
- standalone import 扫描能证明单文件可复制边界。

文档验收：

- README 有单文件复制导入章节。
- README 明确说明 package 导入和单文件复制导入的区别。
- README 明确说明 runtime 不负责加载 `project.json`；宿主 Cocos 代码负责准备 `V5GProjectConfig` 对象和 SpriteFrame resolver。
- README 明确支持/不支持能力。
- README 明确 fail-fast 策略。
- README 不宣称未执行的 Cocos 编辑器验收已经通过。

任务报告验收：

- 新增 `tasks/32-anieditorv5runtime-cc-single-file-[utctime].md`。
- 报告是中文。
- 报告列出新增/修改文件。
- 报告列出测试命令和结果。
- 报告列出 Cocos Creator 3.8.6 编辑器验收结果；如果未执行，写明原因。
- 报告说明是否更新了 `AGENTS.md` / `agents.md`；如果未更新，说明原因。
- 报告记录任何偏离本计划的实现决策。

## 14. AGENTS.md / agents.md 同步规则

本任务默认不需要更新 `AGENTS.md` / `agents.md`，因为它只是在现有 package 内新增可复制 runtime 产物，没有改变仓库级目录规则。

但如果实现中新增了仓库协作规则，例如：

- 规定所有 Cocos runtime 都必须提供 standalone 单文件。
- 新增根级脚本。
- 新增 Cocos 项目提交/忽略规则。
- 新增 `apps/*` 下 Cocos Creator 项目目录规范。

则必须同步更新 `AGENTS.md` 和 `agents.md`，并保持二者内容一致。任务报告必须说明更新内容。

## 15. 二次检查清单

提交任务报告前，执行者必须重新检查：

- 是否误创建了 `apps/anieditorv5viewer-cc`。
- 是否误提交 Cocos `Library`、`Temp`、`local`、`build` 等缓存目录。
- 是否添加了不该存在的 `cc` npm 依赖。
- 单文件 runtime 是否仍有相对 import、workspace import 或 `.js` 内部 import。
- 单文件 runtime 是否只依赖 `"cc"`。
- 单文件 runtime 是否把 player 需要的所有 helper/type/validation/sampler/adapter 都放在同一个文件里。
- 单文件 runtime 是否 named export 了宿主侧可能复用的类型、常量、校验、采样、坐标/opacity 工具和 player API。
- 单文件 runtime 是否误包含了 `project.json` 加载、`JsonAsset` 绑定、`resources.load()`、远程下载或宿主项目资源管理逻辑。
- 示例 Component 是否使用显式 asset id 绑定，而不是不可靠的资源名猜测。
- 示例 Component 或宿主侧其它 TS 是否明确负责准备 `project` 对象，而 runtime 只负责播放。
- 是否同步了 `tsconfig.eslint.json`、`eslint.config.cjs` 和 `.prettierignore`。
- 是否检查 4 个 fixture 引用的图片资源真实存在。
- 是否同步了 viewer 当前 V5G animation 合同。
- 是否遗漏 `particles` / `particle_twinkle` 的处理或显式失败。
- 是否把 `screen` 等未确认 blend mode 静默当成 `normal`。
- 是否保留 fail-fast 行为，没有添加 missing placeholder 或自动猜路径。
- 是否为了测试引入生产代码特殊分支。
- 是否执行了 package 级验证命令。
- 是否执行了根级验证命令，或记录未执行/失败原因。
- 是否明确记录 Cocos Creator 3.8.6 编辑器验收是否执行。
- 是否写了 UTC 命名的中文任务报告。
- 是否判断并记录 `AGENTS.md` / `agents.md` 是否需要同步。
