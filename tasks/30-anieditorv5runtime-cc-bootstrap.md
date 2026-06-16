# anieditorv5runtime-cc bootstrap 任务计划

## 1. 任务结论

本任务不直接初始化 `apps/anieditorv5viewer-cc`。

原因是 Cocos Creator 3.8.6 项目不是普通 `pnpm` + `vite` app：场景、资源导入、`.meta`、Library 缓存、构建目标和 `cc` 模块解析都依赖 Cocos Creator 编辑器。仓库里可以提交一个 Cocos 项目源码目录，但它很难在没有编辑器参与的情况下完成关键导入、资源注册、构建和可视化验收。强行手写 `apps/anieditorv5viewer-cc` 很容易得到一个看似完整、实际必须重新用编辑器修复的项目，后续问题也难定位。

本任务采用更稳的落地方案：新增 `packages/anieditorv5runtime-cc`，只做 Cocos Creator 3.8.6 可导入的 V5G runtime。运行时负责解析、校验、采样和把采样结果应用到 Cocos 节点；真实 Cocos 项目由使用方在编辑器里创建或导入后测试。

如果后续确实要新增 `apps/anieditorv5viewer-cc`，必须以 Cocos Creator 3.8.6 编辑器创建出来的项目为基础，再把本 runtime 包导入进去，不要用普通脚手架伪造 Cocos 项目。

## 2. 任务目标

新增 workspace package：

```text
packages/anieditorv5runtime-cc
```

包名：

```text
@slotclientengine/anieditorv5runtime-cc
```

核心目标：

- 提供 V5G 项目的 TypeScript 类型、严格校验、动画采样和项目时间采样。
- 提供 Cocos Creator 3.8.6 runtime，把 V5G 采样结果应用到 Cocos UI 节点。
- 参考现有 `apps/anieditorv5viewer` 的实现，但不要让 package 从 app 内部路径 import 代码。
- 支持当前样例 `apps/anieditorv5viewer/src/assets/project.json` / `docs/anieditor5/export/project.json`。
- 当前样例必须至少支持 `image` 图层、中心坐标、负 scale 镜像、透明度、可见性、旋转、`normal` 和 `add` blend mode、`scale_up`、`scale_down`、`fade`、`rotate`、`move` 动画。
- 未实现或 Cocos 语义未确认的能力必须显式失败，不允许静默占位、自动降级或用默认值掩盖数据问题。
- 如果测试因为旧 fixture 或错误预期导致奇怪写法，应修改测试，不要为了测试修改生产语义。
- 任务完成后新增中文任务报告：

```text
tasks/30-anieditorv5runtime-cc-bootstrap-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/30-anieditorv5runtime-cc-bootstrap-260616-101500.md
```

## 3. 当前仓库事实

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
- 根协作规则文件：`agents.md`
- 新增空目录必须放 `.keepme`
- 依赖下载失败时先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

现有 V5G viewer：

- `apps/anieditorv5viewer` 是 Vite + TypeScript + Pixi.js viewer。
- 它加载 `apps/anieditorv5viewer/src/assets/project.json`。
- 该 JSON 是 `docs/anieditor5/export/project.json` 的拷贝。
- 图片资源位于 `apps/anieditorv5viewer/src/assets/assets/*`，来源是 `docs/anieditor5/export/assets/*`。
- 当前 viewer 已实现：
  - V5G `schemaVersion` 的 `V5G_0.x` 支持。
  - `editor.name === "victory_editor_v5_g"` 校验。
  - `engineTarget.name === "cocos_creator"` 校验。
  - 中心坐标系到 Pixi 坐标系转换。
  - `image` 图层和基础 `text` 图层。
  - `normal`、`add`、`screen`、`multiply`、`lighten` blend mode。
  - `move`、`fade`、`scale_up`、`scale_down`、`rotate`、`slide_in`、`slide_out`、`bounce_in`、`pulse`、`float`、`swing` 采样。
  - 有启用动画但当前时间不在任一动画覆盖范围时隐藏图层。
  - 负 `scaleX` / `scaleY` 保留符号，用于镜像。
  - 未知资源、未知图层类型、未知动画、未知 easing、未知 blend mode、非空 `particles`、非空 `keyframes`、`group` 和嵌套 `parentId` 显式失败。

当前导出样例事实：

- `schemaVersion`: `V5G_0.0014`
- `editor.name`: `victory_editor_v5_g`
- `engineTarget.name`: `cocos_creator`
- `engineTarget.version`: `3.8.6`
- `name`: `胜利测试`
- `stage.width`: `1600`
- `stage.height`: `1600`
- `stage.coordinate`: `center`
- `stage.duration`: `10`
- `stage.backgroundColor`: `#101827`
- 资源数量：`4`
- 图层数量：`5`
- 粒子数量：`0`
- 当前所有图层都是 `image`
- 当前所有 `keyframes` 都为空数组
- 当前使用的 blend mode：`normal`、`add`
- 当前使用的动画：`scale_up`、`scale_down`、`fade`、`rotate`、`move`

需要重点参考的现有文件：

```text
apps/anieditorv5viewer/src/v5g/types.ts
apps/anieditorv5viewer/src/runtime/validation.ts
apps/anieditorv5viewer/src/runtime/animation-sampler.ts
apps/anieditorv5viewer/src/runtime/project-sampler.ts
apps/anieditorv5viewer/src/runtime/coordinates.ts
apps/anieditorv5viewer/src/runtime/layer-instance.ts
apps/anieditorv5viewer/tests/runtime/*.test.ts
docs/anieditor5/src/types.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/coordinates.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/export_project.ts
```

## 4. 范围边界

本任务要做：

- 新增 `packages/anieditorv5runtime-cc`。
- 在 package 内建立可独立测试的 V5G core。
- 在 package 内建立 Cocos Creator 3.8.6 runtime adapter。
- 写 package README，说明为什么本轮不直接创建 `apps/anieditorv5viewer-cc`，以及如何导入 Cocos Creator 项目测试。
- 写 Vitest 单元测试，覆盖 core 和 Cocos adapter 的可测试合同。
- 如果可以访问 Cocos Creator 3.8.6 编辑器，由执行者用编辑器做人工集成验收，并在任务报告里记录结果。

本任务不做：

- 不手写或伪造 `apps/anieditorv5viewer-cc`。
- 不提交 Cocos Creator 编辑器生成的 `Library`、`Temp`、`local` 等缓存目录。
- 不把 Cocos 项目构建伪装成普通 Vite 构建。
- 不实现编辑器功能。
- 不实现 V5G ZIP 导入 UI。
- 不实现粒子系统。
- 不实现非空 keyframes。
- 不实现 group 图层和嵌套 parentId。
- 不为未知资源、未知动画、未知 easing、未知 blend mode 做占位、降级或默认兜底。
- 不添加 npm 依赖名为 `cc` 的依赖；`cc` 是 Cocos Creator 编辑器环境提供的模块，不是普通 npm 包。

## 5. 目标目录结构

建议新增：

```text
packages/anieditorv5runtime-cc/
  package.json
  README.md
  eslint.config.cjs
  vitest.config.ts
  tsconfig.json
  tsconfig.build.json
  tsconfig.eslint.json
  types/
    cc-3.8.6-shim.d.ts
  src/
    index.ts
    core/
      index.ts
      types.ts
      validation.ts
      animation-sampler.ts
      project-sampler.ts
      coordinates.ts
    cocos/
      index.ts
      types.ts
      player.ts
      node-driver.ts
      cocos-node-driver.ts
      blend-mode.ts
      coordinates.ts
  tests/
    fixtures/
      project.json
    core/
      validation.test.ts
      animation-sampler.test.ts
      project-sampler.test.ts
      coordinates.test.ts
    cocos/
      coordinates.test.ts
      blend-mode.test.ts
      player.test.ts
```

如果某个目录在阶段性提交时为空，必须添加 `.keepme`。最终目录已有文件时不需要 `.keepme`。

## 6. package 配置合同

`packages/anieditorv5runtime-cc/package.json` 要遵循当前 monorepo package 风格：

- `type`: `module`
- `private`: `true`
- `packageManager`: `pnpm@10.0.0`
- `main`: `./dist/index.js`
- `types`: `./dist/index.d.ts`
- `exports` 至少包含：

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./core": {
    "types": "./dist/core/index.d.ts",
    "import": "./dist/core/index.js"
  },
  "./cocos": {
    "types": "./dist/cocos/index.d.ts",
    "import": "./dist/cocos/index.js"
  },
  "./package.json": "./package.json"
}
```

脚本：

```json
{
  "build": "tsc -p tsconfig.build.json",
  "lint": "eslint .",
  "test": "vitest run --coverage",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

依赖要求：

- 不新增运行时 npm 依赖，除非实现中证明必须。
- 不新增 `cc` 依赖。
- devDependencies 使用根级工具链同类版本：
  - `@eslint/js`
  - `@typescript-eslint/eslint-plugin`
  - `@typescript-eslint/parser`
  - `@vitest/coverage-v8`
  - `eslint-config-prettier`
  - `globals`

`types/cc-3.8.6-shim.d.ts` 只用于 monorepo 内 `tsc` 和 Vitest 编译，内容必须是最小 `declare module "cc"` 类型补丁。它不能假装完整覆盖 Cocos API。执行者在 README 和任务报告中必须说明：真实 Cocos 项目以 Cocos Creator 3.8.6 编辑器提供的 `cc` 类型为准。

`tsconfig.json` 必须 include：

```json
["src/**/*.ts", "tests/**/*.ts", "types/**/*.d.ts"]
```

`tsconfig.build.json` 必须 include：

```json
["src/**/*.ts", "types/**/*.d.ts"]
```

`tsconfig.build.json` 必须排除 `tests`，但仍必须让 `types/cc-3.8.6-shim.d.ts` 参与编译，避免 monorepo 内 `tsc` 找不到 `cc` 模块。

## 7. core 设计合同

`src/core` 是纯 TypeScript，不允许 import `cc`，也不允许依赖 DOM、Pixi、Cocos 或浏览器全局对象。

`src/core/types.ts`：

- 从现有 `apps/anieditorv5viewer/src/v5g/types.ts` 和 `docs/anieditor5/src/types.ts` 迁移 V5G 类型。
- 保持当前字段：
  - `schemaVersion`
  - `editor`
  - `engineTarget`
  - `stage`
  - `assets`
  - `layers`
  - `particles`
  - `transform`
  - `animations`
  - `keyframes`

`src/core/validation.ts`：

- 提供 `assertV5GProject(value: unknown): V5GProjectConfig`。
- 提供 `validateV5GProject(project: V5GProjectConfig): void`。
- 提供 `parseColorHex(value: string): number`，只接受 `#RRGGBB`，不合法必须抛错。
- 提供 `validateCocosV5GProject(project: V5GProjectConfig, options?: { engineVersion?: "3.8.6" }): void`。
- `validateCocosV5GProject()` 初期必须要求：
  - `engineTarget.name === "cocos_creator"`
  - `engineTarget.version === "3.8.6"`
  - `stage.coordinate === "center"`
  - 当前 Cocos adapter 已实现的 layer / blend mode / animation 能力满足项目需要
- Cocos adapter 首期只必须支持 `image` 图层；如果没有同步实现并测试 Cocos `Label`，`validateCocosV5GProject()` 必须拒绝 `text` 图层，并在 README 中说明。
- 如果未来要支持其它 Cocos 版本，必须显式扩展版本矩阵，不允许默认放行。

`src/core/animation-sampler.ts`：

- 参考现有 viewer 的 `sampleLayerAnimationsAtTime()`。
- 支持当前 viewer 已实现的 easing：
  - `linear`
  - `easeInQuad`
  - `easeOutQuad`
  - `easeInOutQuad`
  - `backOut`
- 支持当前 viewer 已实现的动画类型：
  - `move`
  - `fade`
  - `scale_up`
  - `scale_down`
  - `rotate`
  - `slide_in`
  - `slide_out`
  - `bounce_in`
  - `pulse`
  - `float`
  - `swing`
- 缺少必需数值参数时必须抛错。
- `scale_up` / `scale_down` 必须保留基础 scale 的正负号。

`src/core/project-sampler.ts`：

- 提供 `sampleProjectAtTime(project, time)`。
- 提供 `sampleLayerAtTime(layer, time)`。
- 时间必须 clamp 到 `0..stage.duration`。
- 图层有启用动画但当前时间不在任一动画覆盖范围时，采样结果 `opacity` 为 `0`，`visible` 为 `false`。

`src/core/coordinates.ts`：

- 保留通用工具：
  - `clampNumber`
  - `roundTo`
- 可以保留 Pixi 参考转换用于测试说明，但 Cocos adapter 不应使用 Pixi 的左上角转换。

## 8. Cocos runtime 设计合同

`src/cocos` 是 Cocos Creator 3.8.6 adapter。真实运行时 `cc` import 必须限制在 `src/cocos/cocos-node-driver.ts`；其它文件只能使用 type-only import 或 driver interface。

建议公开 API：

```ts
import type { Node, SpriteFrame } from "cc";
import type { V5GProjectConfig } from "@slotclientengine/anieditorv5runtime-cc/core";

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
```

资源策略：

- Runtime 不自动猜测 Cocos `resources` 路径。
- Runtime 不在资源缺失时创建 placeholder。
- 使用方必须提供 `asset.path` / `asset.id` 到 `SpriteFrame` 的解析。
- 如果 `getSpriteFrame()` 返回 `null`，直接抛错，错误信息必须包含 `asset.id` 和 `asset.path`。
- 如果 Cocos 3.8.6 的 `SpriteFrame` API 能可靠读取原始尺寸，runtime 必须校验它与 JSON `asset.width/height` 一致。
- 如果执行者在编辑器里确认无法可靠读取尺寸，不要伪造“已校验”；应改为 README 和任务报告中明确说明该限制，并保留其它严格校验。

真实 `cc` import 隔离策略：

- `src/cocos/player.ts` 必须只依赖 fake-friendly 的 driver interface，不能在模块顶层 runtime import `cc`。
- `src/cocos/node-driver.ts` 定义 driver interface、节点状态写入合同和测试可用 fake driver 类型，不 runtime import `cc`。
- `src/cocos/cocos-node-driver.ts` 是真实 Cocos Creator 3.8.6 API 的适配层，也是首期唯一允许 runtime import `cc` 的文件。
- Vitest 单元测试必须测试 `player.ts` + fake driver，不直接执行 `cocos-node-driver.ts`。真实 `cc` API 行为放到 Cocos Creator 3.8.6 编辑器验收里确认。
- 如果 `src/cocos/index.ts` re-export 真实 Cocos driver，README 必须提醒该入口只在 Cocos Creator 环境运行；Node/Vitest 环境应 import 可测试子模块或使用 fake driver。
- `src/index.ts` 包根入口不能 runtime re-export `cocos-node-driver.ts`；包根应导出 core 能力和不触发真实 `cc` import 的类型/工厂合同，真实 Cocos driver 只通过 `./cocos` 或明确子路径暴露。

坐标策略：

- V5G `stage.coordinate` 当前只支持 `center`。
- Cocos UI 节点在中心锚点的 stage root 下，局部坐标天然是 `x` 向右、`y` 向上。
- 因此 Cocos 图层位置应使用：

```text
cocosX = transform.x
cocosY = transform.y
```

- 不要套用 Pixi 的转换：

```text
pixiX = stage.width / 2 + x
pixiY = stage.height / 2 - y
```

- 如果 Cocos 集成项目选择了非中心锚点容器，必须在使用方层面调整容器，不要在 runtime 内隐式猜测。

节点策略：

- `init()` 在传入 `root` 下创建 runtime 管理的 stage/content/layer 节点。
- stage root 设置 `UITransform` 尺寸为 `project.stage.width x project.stage.height`，锚点为 `(0.5, 0.5)`。
- runtime 必须根据 `project.stage.backgroundColor` 创建 stage 背景层，背景层在所有图层下方，尺寸覆盖整个 stage。
- 背景层可使用 Cocos `Graphics` 或明确可控的纯色 `Sprite` 实现；具体方式必须在 README 和任务报告里记录。
- 每个 image layer 创建一个 Cocos `Node` 和 `Sprite`。
- 图层顺序必须按 `project.layers` 原始顺序添加，后面的图层显示在上层。
- anchor 使用 `layer.transform.anchorX/anchorY`。
- scale 使用 `scaleX/scaleY`，必须保留负数镜像。
- rotation 使用 V5G 的 degree 值应用到 Cocos 节点；如果编辑器实测方向与 Pixi 不一致，必须记录并用测试固定正确方向。
- opacity 使用 `UIOpacity`，把 `0..1` 转为 `0..255`，四舍五入并 clamp。
- visible 使用 `node.active = sampled.visible`。

blend mode 策略：

- 当前样例需要 `normal` 和 `add`。
- Cocos adapter 初期必须实现并验证：
  - `normal`
  - `add`
- `add` 可先按 Cocos 3.8.6 Sprite 支持的公开 API 实现，例如 `srcBlendFactor/dstBlendFactor` 或材质 blend state；执行者必须在 Cocos Creator 3.8.6 编辑器内确认实际 API。
- `screen`、`multiply`、`lighten` 只有在确认 Cocos 3.8.6 等价实现后才能放行。
- 未确认的 blend mode 必须在 Cocos adapter 中抛出 `Unsupported Cocos V5G blendMode: ...`，不要按 `normal` 渲染。

播放策略：

- `seek()` 是唯一同步视觉状态的入口。
- `play()` 只负责切换播放状态和回调，不默认绑定 Cocos scheduler。
- runtime 必须提供 `update(deltaSeconds)`，由使用方 Cocos Component 的 `update(dt)` 调用；`update()` 内部根据播放状态推进时间，并最终调用 `seek()`。
- 如果实现者选择额外支持 Cocos scheduler，必须作为显式 opt-in，不得替代 `update(deltaSeconds)` 合同。
- `restart()` 回到 `0`。
- `loop` 默认可为 `true`，但必须可关闭。
- `destroy()` 必须清理 runtime 创建的节点和可选调度，不删除调用方传入的 `root`。

## 9. Cocos 项目导入说明要求

`README.md` 必须包含一个“导入 Cocos Creator 3.8.6 项目测试”的章节，至少说明：

1. 本包不是完整 Cocos 项目，不能替代编辑器创建项目。
2. 推荐先用 Cocos Creator 3.8.6 创建或打开真实项目。
3. 导入方式必须二选一写清楚：
   - 如果 Cocos 编辑器能解析 workspace / npm 包，则从 `@slotclientengine/anieditorv5runtime-cc/cocos` import。
   - 如果编辑器无法解析 pnpm workspace symlink，则把 `packages/anieditorv5runtime-cc/src` 或构建后的 `dist` 拷贝进 Cocos 项目的 `assets/scripts/vendor/anieditorv5runtime-cc` 后按相对路径 import。
4. `project.json` 和图片资源来自：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/assets/*
```

5. 使用方需要在 Cocos 项目内把每个 `asset.path` 对应到 `SpriteFrame`。
6. 给出最小 Component 示例，但该示例可以放在 README，不需要本 package 导出带 `@ccclass` 的组件。
7. 最小 Component 示例必须在 Cocos `update(deltaTime: number)` 中调用 `player.update(deltaTime)`。
8. README 必须说明宿主 Cocos 项目负责 Canvas/root 的缩放和适配，runtime 只创建 `project.stage.width x project.stage.height` 的中心坐标内容，不自动猜测屏幕适配策略。
9. 如果 Cocos 编辑器中的 import、资源绑定、背景层或 blend mode 行为与 README 不一致，必须更新 README 和任务报告，不要只改测试。

不要在 package 内优先导出 decorated Cocos `Component`。本包首期应导出普通 class，避免把 Cocos 编辑器装饰器、场景序列化和源码打包规则绑死到 monorepo 编译中。

## 10. 测试计划

core 测试：

- `validation.test.ts`
  - 接受当前 `tests/fixtures/project.json`。
  - 拒绝非 `V5G_0.x`。
  - 拒绝非 `victory_editor_v5_g`。
  - 拒绝非 `cocos_creator`。
  - `validateCocosV5GProject()` 拒绝非 `3.8.6`。
  - 拒绝非 `center` 坐标。
  - 拒绝非空 `particles`。
  - 拒绝非空 `keyframes`。
  - 拒绝 `group` 和嵌套 `parentId`。
  - 拒绝未知动画、未知 easing、未知 blend mode。
  - 拒绝动画越过 `stage.duration`。
  - 拒绝缺少必需动画参数。
  - 如果 Cocos adapter 首期未实现 `text`，`validateCocosV5GProject()` 必须拒绝 `text` 图层。
  - 拒绝非法 `stage.backgroundColor`。

- `animation-sampler.test.ts`
  - 覆盖 easing。
  - 覆盖 `move` 的 `baseX/baseY`。
  - 覆盖 `fade` opacity clamp。
  - 覆盖 `scale_up/scale_down` 保留负 scale。
  - 覆盖 `rotate`。
  - 覆盖 disabled animation。
  - 覆盖重叠动画按 `startTime` 应用。
  - 覆盖未知 easing 和缺少参数会抛错。

- `project-sampler.test.ts`
  - 覆盖动画覆盖区间前隐藏。
  - 覆盖动画起止边界。
  - 覆盖动画覆盖区间后隐藏。
  - 覆盖无启用动画时按基础 visible/opacity。
  - 覆盖项目时间 clamp。

Cocos adapter 测试：

- `coordinates.test.ts`
  - 验证 Cocos center 坐标不做 Pixi 的 y 轴翻转。
  - `transform.x=100, transform.y=50` 应输出 Cocos position `(100, 50)`。

- `blend-mode.test.ts`
  - 验证 `normal` 和 `add` 映射到明确的 Cocos blend 配置。
  - 验证未实现的 blend mode 抛错，不会降级到 normal。

- `player.test.ts`
  - 使用 fake node driver，不 import 真实 Cocos 引擎。
  - `init()` 按图层顺序创建 layer。
  - `init()` 创建 stage 背景层，且背景层在图层下方。
  - 缺失 asset 抛错。
  - `seek()` 后写入 position、scale、rotation、opacity、active。
  - `update(deltaSeconds)` 在 `play()` 后推进时间，并在 loop 开启时回绕。
  - 负 scale 被保留。
  - `destroy()` 只清理 runtime 创建的节点，不删除调用方传入 root。

如果某个测试为了绕开 Cocos 编辑器限制而要求生产代码增加奇怪分支，应先检查测试设计。测试不应该迫使 runtime 增加不必要兜底。

## 11. 执行步骤

### 阶段 1：初始化 package

1. 新增 `packages/anieditorv5runtime-cc` 目录。
2. 新增 `package.json`、`tsconfig.json`、`tsconfig.build.json`、`tsconfig.eslint.json`、`vitest.config.ts`、`eslint.config.cjs`。
3. 确认 `pnpm-workspace.yaml` 已覆盖 `packages/*`，通常无需修改。
4. 执行 `pnpm install` 更新 `pnpm-lock.yaml` 的 workspace importer；如果下载失败，按本计划代理命令重试。
5. 不添加 `cc` npm 依赖。
6. 新增最小 `types/cc-3.8.6-shim.d.ts`，只满足 package 编译。

### 阶段 2：迁移 V5G core

1. 从现有 viewer 复制并整理 types、validation、animation sampler、project sampler、coordinates。
2. 不要从 `apps/anieditorv5viewer/src` import。
3. 新增 `tests/fixtures/project.json`，内容使用当前 `docs/anieditor5/export/project.json` 或 `apps/anieditorv5viewer/src/assets/project.json` 的拷贝。
4. 写 core 测试，确保现有样例通过。
5. 保持 fail-fast：未知或未实现能力抛错。

### 阶段 3：实现 Cocos adapter

1. 新增 Cocos runtime 类型。
2. 新增 asset resolver 合同。
3. 新增 `node-driver.ts` driver interface，并新增 `cocos-node-driver.ts` 真实 Cocos API 适配层。
4. 新增 player，生命周期为 `init/seek/update/play/pause/restart/setLoop/destroy`。
5. 实现 Cocos center 坐标应用。
6. 新增 `update(deltaSeconds)`，让宿主 Cocos Component 显式驱动播放进度。
7. 实现 stage 背景层，使用 `project.stage.backgroundColor`。
8. 实现 `Sprite`、`UITransform`、`UIOpacity`、scale、rotation、active。
9. 实现并测试 `normal` / `add` blend mode。
10. 对未确认的 Cocos blend mode 显式抛错。

### 阶段 4：文档

1. 新增 `README.md`。
2. README 必须解释为什么本轮不新增 `apps/anieditorv5viewer-cc`。
3. README 必须给出 Cocos Creator 3.8.6 导入方式。
4. README 必须列出当前支持和明确不支持的 V5G 能力。
5. README 必须说明 `cc` 类型 shim 只是 monorepo 编译辅助，真实项目以编辑器类型为准。

### 阶段 5：验证

先运行 package 级验证：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

再运行根级验证：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
pnpm format:check
```

如果依赖下载失败，执行代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

如果根级 `pnpm format:check` 因既有无关 `coverage/dist/devlogs` 或历史格式问题失败，不能把无关文件顺手改掉。任务报告必须记录失败摘要、确认 package 级 `format:check` 是否通过，并说明是否与本任务有关。

### 阶段 6：Cocos Creator 3.8.6 人工验收

如果执行环境可打开 Cocos Creator 3.8.6，必须做：

1. 用 Cocos Creator 3.8.6 创建或打开一个测试项目。
2. 导入本 runtime 包。
3. 导入当前 V5G 样例：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/assets/*
```

4. 创建一个 Canvas 场景和挂载脚本。
5. 把 4 个图片资源绑定为 `SpriteFrame`。
6. 用 runtime 初始化并 `seek(0)`。
7. 测试 `play()`、宿主 `update(deltaTime)` 推进、`pause()`、`restart()`、`seek(0.6)`、`seek(0.8)`、`seek(4.0)`、`seek(4.4)`。
8. 观察并记录：
   - 画面不是空白。
   - 图层顺序正确。
   - 左右飞机的负 scale 镜像正确。
   - `add` blend mode 的视觉或材质配置按预期生效。
   - `4.4s` 后当前样例图层隐藏规则与 Pixi viewer 一致。
9. 如果 Cocos 编辑器不可用，任务报告必须明确写：

```text
Cocos Creator 3.8.6 编辑器验收未执行，原因：...
```

不能把未执行的编辑器验收写成通过。

## 12. 验收标准

代码结构验收：

- `packages/anieditorv5runtime-cc` 存在并进入 workspace。
- package 没有依赖 `apps/anieditorv5viewer/src/**`。
- package 没有 npm 依赖 `cc`。
- `src/core` 不 import `cc`。
- `src/index.ts` 不 runtime re-export 真实 Cocos driver。
- `src/cocos/cocos-node-driver.ts` 是首期唯一允许 runtime import `cc` 的文件；其它 Cocos runtime 文件只能 type-only import 或依赖 driver interface。
- `exports` 包含 `.`、`./core`、`./cocos`。

功能验收：

- 当前 V5G 样例能通过 core 校验。
- `validateCocosV5GProject()` 明确要求 `engineTarget.version === "3.8.6"`。
- 当前样例用到的动画采样结果与现有 viewer 语义一致。
- Cocos 坐标使用中心坐标，不做 Pixi 左上角转换。
- runtime 创建 stage 背景层，并使用 `project.stage.backgroundColor`。
- `update(deltaSeconds)` 能驱动 `play()` 后的时间推进。
- 负 scale 镜像保留。
- 缺失资源显式失败。
- 未实现的 particles、keyframes、group、nested parent、未知动画、未知 easing、未知 blend mode 显式失败。
- `normal` 和 `add` blend mode 有明确 Cocos 处理；未确认的 blend mode 不允许静默当成 `normal`。

测试验收：

- package 级 `typecheck/lint/test/build/format:check` 全部通过，或报告中写明与本任务无关的环境原因。
- 根级 `typecheck/lint/test/build/git diff --check` 通过，或报告中写明明确环境/既有问题。
- 如果修改了 `apps/anieditorv5viewer`，必须额外运行：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
```

文档验收：

- `packages/anieditorv5runtime-cc/README.md` 能让一个只看 README 的人知道如何导入 Cocos Creator 3.8.6 项目。
- README 明确说明本包不是完整 Cocos 项目。
- README 明确列出当前支持/不支持能力。
- README 明确说明 fail-fast 策略。

任务报告验收：

- 新增 `tasks/30-anieditorv5runtime-cc-bootstrap-[utctime].md`。
- 报告是中文。
- 报告列出新增/修改文件。
- 报告列出测试命令和结果。
- 报告列出 Cocos Creator 3.8.6 编辑器验收结果；如果未执行，写明原因。
- 报告说明是否更新了 `agents.md`；如果未更新，说明原因。
- 报告记录任何偏离本计划的实现决策。

## 13. agents.md 同步规则

本任务默认不需要更新 `agents.md`，因为新增的是普通 `packages/*` workspace package，没有改变仓库目录规则或根脚本。

但如果实现中新增了仓库级 Cocos 项目约定，例如：

- 新增 `apps/anieditorv5viewer-cc` 目录规范。
- 新增 Cocos Creator 项目提交/忽略规则。
- 新增根级脚本。
- 规定所有 Cocos runtime 包都必须使用某种导入方式。

则必须同步更新根目录 `agents.md`，并在任务报告中说明更新内容。

## 14. 二次检查清单

提交任务报告前，执行者必须重新检查：

- 是否误创建了不能独立验收的 `apps/anieditorv5viewer-cc`。
- 是否把 Cocos 编辑器缓存目录提交进仓库。
- 是否添加了不存在或不该存在的 `cc` npm 依赖。
- 是否有 package 代码从 `apps/anieditorv5viewer/src/**` import。
- 是否执行了 `pnpm install` 并记录 `pnpm-lock.yaml` 是否变化。
- 是否把真实 `cc` import 隔离在 `cocos-node-driver.ts`。
- 是否避免了包根入口 runtime re-export 真实 Cocos driver。
- 是否把 Pixi 坐标转换误用于 Cocos runtime。
- 是否遗漏 stage 背景层或 `backgroundColor` 校验。
- 是否暴露并测试了 `update(deltaSeconds)`。
- 是否对未知 blend mode、未知动画、缺失资源做了隐藏兜底。
- 是否为了测试引入了生产代码怪分支。
- 是否写了任务报告，并使用 UTC 文件名。
- 是否明确记录了 Cocos Creator 3.8.6 编辑器验收是否执行。
- 是否确认 `agents.md` 是否需要同步。
