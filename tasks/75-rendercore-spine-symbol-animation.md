# rendercore spine symbol animation 任务计划

## 1. 任务目标

本任务为 `packages/rendercore` 的 symbol manifest 和 symbol animation resolver 增加 Spine 动画支持，并把 `assets/game003-s1` 中新增的高级图标 Spine 资源接入 `apps/symbolsviewer` 和 `apps/game003`。

核心目标：

- 在 `symbol-state-textures.manifest.json` 的 `animations` 字段中新增 `kind: "spine"` 动画类型，语义与当前 `kind: "vni"` 一样由 manifest 驱动。
- `idle` / `Idle` 类动画作为 symbol 默认状态 `normal` 的显示来源；`start` / `Start` 类动画作为 symbol `appear` 状态的显示来源。具体动画名必须在 manifest 中精确声明，不做大小写猜测。
- `packages/rendercore` 继续作为 game symbol manifest 解析、资源校验、resolver 创建和 `SymbolAni` 生命周期的拥有者。
- Spine symbol 支持归属 `packages/rendercore`：manifest schema、资源校验、Spine 播放代理、`SymbolAni` 生命周期和 resolver 都应放在 rendercore。`pixiani` 只可作为已有 Pixi 基础能力或非常薄的底层显示辅助参考，不能成为本能力的拥有者。
- `apps/symbolsviewer` 和 `apps/game003` 只传入 manifest、Vite modules 和 fallback resolver，不硬编码 `if symbol === "H1"`、`if symbol === "WL"`、`Idle`、`Start`、`Symbol.atlas` 等专属运行时代码。
- 保留当前 VNI symbol animation 能力，不能破坏 `L1-L5` 的 `*-wins.json` VNI 中奖动画。
- 保持 fail-fast：缺 manifest、缺 skeleton、缺 atlas、缺 atlas image、动画名不存在、大小写不一致、loop 与 state playback 合同不匹配、资源 glob 为空、生成物不同步、Spine 播放初始化失败，都必须显式失败，不做隐藏兜底。

本计划必须能独立落地，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/75-rendercore-spine-symbol-animation-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/75-rendercore-spine-symbol-animation-260703-123456.md
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

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前已观察到工作区存在其它改动和未跟踪 Spine 资源，执行者必须先复核并保护它们：

```text
assets/game003-s1/WL.json
assets/game003-s1/H1.json
assets/game003-s1/H2.json
assets/game003-s1/H3.json
assets/game003-s1/H4.json
assets/game003-s1/H5.json
assets/game003-s1/Symbol.atlas
assets/game003-s1/Symbol.png
```

这些 `assets/game003-s1` 下的美术提交资源只能作为只读输入和只读验收样本。不要为了测试、parser 适配、格式修正或减少冲突去直接修改这些 JSON / atlas / PNG；如果确实需要在 package 内放测试 fixture，只能从当前资源做字节一致复制，并在报告中说明来源和复制原因。

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

如果为了 Spine 播放需要新增第三方依赖，必须优先放在 `packages/rendercore`，并由 rendercore 封装成 `SymbolAni` 可消费的内部代理；不要让 `apps/game003`、`apps/symbolsviewer` 或 `packages/pixiani` 成为 Spine symbol 支持的实际入口。新增或调整依赖后必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter game003 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。

`apps/game003/src/generated/game-static.generated.ts` 和 `apps/game003/src/generated/game-loading.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改；修改 YAML 或 generator 后必须同步执行生成和 `--check` 校验。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 关键文件

rendercore symbol 动画：

```text
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/symbol/animation-resolver.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/state-machine.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/vni-animation.test.ts
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/package.json
packages/rendercore/README.md
pnpm-lock.yaml
```

Spine demo / Pixi 基础参考：

```text
packages/pixiani/src/core/visualentity.ts
packages/pixiani/agents.md
apps/spine2pixiani-demo/src/runtime/atlas.ts
apps/spine2pixiani-demo/src/runtime/spine-adapter.ts
apps/spine2pixiani-demo/src/runtime/spine-types.ts
apps/spine2pixiani-demo/src/runtime/timeline-sampler.ts
apps/spine2pixiani-demo/src/runtime/display-factory.ts
apps/spine2pixiani-demo/src/ani/cabin/cabin-animation.ts
apps/spine2pixiani-demo/src/ani/cabin/cabin-scene.ts
```

game003 静态配置和接入：

```text
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
apps/game003/src/assets.ts
apps/game003/src/skin-config.ts
apps/game003/src/game-adapter.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/package.json
apps/game003/README.md
```

symbolsviewer：

```text
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/tests
apps/symbolsviewer/package.json
```

static config 生成链路：

```text
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/tests
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/tests/static-config.test.ts
```

协作规则：

```text
agents.md
packages/pixiani/agents.md
```

### 3.2 rendercore 现状

`SymbolAni` 当前接口已经支持 `destroy()`：

```ts
export interface SymbolAni {
  readonly stateId: SymbolStateId;
  readonly playback: SymbolPlaybackKind;
  reset(): void;
  update(deltaSeconds: number): SymbolAniUpdateResult;
  destroy?(): void;
}
```

`RenderSymbol` 每次状态变化会：

1. 通过 `animationResolver(context)` 创建新的 `SymbolAni`。
2. 校验 `ani.playback === context.state.playback`。
3. 销毁旧动画。
4. 调用新动画 `reset()`。

默认状态机：

- `normal`、`spinBlur`、`disabled` 是 stable state，`playback: "static"`。
- `appear`、`win` 是 once state，`playback: "once"`。
- `spinBlur` / `disabled` 当前等价到 `normal`。

这意味着 Spine idle 虽然是循环动画，但对 state machine 来说仍应返回 `playback: "static"`，因为 `normal` 必须保持可立即切换；Spine player 自己在 `update(deltaSeconds)` 内循环即可，不要把 `normal` 改成 state-machine 层面的 `loop`。

当前 manifest 支持：

```ts
kind: "builtin"
kind: "static"
kind: "vni"
```

当前 VNI 接入点：

- `parseSymbolStateTextureManifest(...)` 解析 `animations`。
- `createSymbolVniAnimationResourcesFromManifest(...)` 从 manifest + Vite modules 生成资源表。
- `createSymbolManifestAnimationResolver(...)` 创建 resolver。
- `VniSymbolAni` 负责 mount、`reset()`、`update(deltaSeconds)`、completion 和 `destroy()`。
- `generate-symbol-state-textures.mjs` 会保留已有 `animations`，但当前只校验 `builtin/static/vni`。

### 3.3 新 Spine 资产快照

当前新增资源位于：

```text
assets/game003-s1/WL.json
assets/game003-s1/H1.json
assets/game003-s1/H2.json
assets/game003-s1/H3.json
assets/game003-s1/H4.json
assets/game003-s1/H5.json
assets/game003-s1/Symbol.atlas
assets/game003-s1/Symbol.png
```

执行时必须用下面命令重新盘点，不要只依赖本节快照：

```bash
node -e "const fs=require('fs'); for (const f of ['assets/game003-s1/WL.json','assets/game003-s1/H1.json','assets/game003-s1/H2.json','assets/game003-s1/H3.json','assets/game003-s1/H4.json','assets/game003-s1/H5.json']) { const j=JSON.parse(fs.readFileSync(f,'utf8')); console.log(f, 'spine', j.skeleton?.spine, 'w', j.skeleton?.width, 'h', j.skeleton?.height, 'animations', Object.keys(j.animations||{}).join(',')); }"
```

当前观察结果：

```text
WL.json  spine 4.2.43  animations Idle,start,Win
H1.json  spine 4.2.43  animations Idle,Start,Win
H2.json  spine 4.2.43  animations Idle,Win
H3.json  spine 4.2.43  animations Idle,Win
H4.json  spine 4.2.43  animations Idle,Win
H5.json  spine 4.2.43  animations Idle,Win
```

二次检查补充的真实资源格式事实：

- `assets/game003-s1/Symbol.atlas` 是 Spine 4.2 atlas 格式，region 使用 `bounds:` 和 `rotate:90`，不是旧 demo parser 中 `xy/size/orig/offset/index` 六行格式。
- `assets/game003-s1/H1.json` 等新 skeleton 的 `skins` 是数组形式，例如 `[{ name: "default", attachments: ... }]`，不是旧 demo parser 假设的 `raw.skins.default` object。
- `H1` 当前至少包含 `type: "mesh"`、`uvs`、`triangles`、`vertices` 这类 mesh attachment。旧 `spine2pixiani-demo` 的最小 region attachment adapter 不能直接覆盖这些真实资源。
- 因此执行时不能简单搬运旧 demo runtime 后声称支持当前资源；必须用当前 `WL/H1-H5 + Symbol.atlas + Symbol.png` 做只读兼容性验收。若需要把它们纳入自动化测试 fixture，只能在 `packages/rendercore/tests/fixtures` 等测试目录做字节一致复制，不能直接改 `assets/game003-s1` 原始资源；建议在 fixture 目录放 `README.md` 记录来源路径、复制时间和“不得反向覆盖原始资源”的边界。若自研 parser 不支持 Spine 4.2 atlas、skins array 和 mesh attachment，应改用 rendercore 内封装的官方 Spine Pixi runtime，或在 rendercore 内补齐这些能力。

因此第一轮实现不能假设所有高级图标都有 `Start`。如果 manifest 要把某个 symbol 的 `appear` 配成 Spine，目标 skeleton 必须真实存在对应动画名；否则任务应显式失败并要求补资源或修改 manifest，不允许自动把 `appear` 退回 `Idle` 或 builtin。

### 3.4 game003 / symbolsviewer 现状

`apps/game003/config/game-static.yaml` 当前 symbols 配置只有：

```yaml
symbols:
  manifest: assets/game003-s1/symbol-state-textures.manifest.json
  pngGlob: assets/game003-s1/*.png
  vniProjectGlob: assets/game003-s1/*-wins.json
  vniAssetGlob: assets/game003-s1/assets/*.{png,jpg,jpeg,webp}
  emptySymbols: []
  requireExplicitScale: true
  requiredStates:
    - spinBlur
    - disabled
```

`apps/buildgamestatic` 只生成 `vniProjectModules` / `vniAssetModules`，`packages/gameframeworks/static-config` 也只校验这两个可选字段。

`apps/game003/src/skin-config.ts` 当前调用：

```ts
createSymbolManifestAnimationResolver({
  manifest,
  requiredStates,
  vniProjectModules,
  vniAssetModules,
  fallback,
})
```

`apps/symbolsviewer/src/symbol-set-config.ts` 也只向 resolver 传 VNI modules。

## 4. 边界和非目标

- Spine symbol animation 的通用能力必须放在 `packages/rendercore`；不要把 Spine runtime 复制到 `apps/game003`、`apps/symbolsviewer` 或迁移成 `packages/pixiani` 拥有的业务能力。
- `packages/rendercore` 不能承载 `game003`、`WL`、`H1`、`Symbol.atlas`、高级图标、server result、`bg-wins` 或 Ways 规则等专属语义。
- `apps/game003` 只能配置和传入资源 modules，不要直接解析 Spine JSON、atlas 或操作 Spine/Pixi 私有 display tree。
- 不改 live server、`gamecode`、URL query 合同、服务器协议、本地公开轮带边界、`bg-bar`、矿车互动、中奖金额动画或 VNI symbol win 合同。
- 不扩展共享 symbol 生成器去支持 JPG 普通态；普通 symbol PNG、spinBlur、disabled 仍走现有 PNG manifest 合同。
- 不把 `Symbol.atlas` / `Symbol.png` 当普通 symbol PNG 加进 catalog；它们只属于 Spine 动画资源。
- 不做大小写兜底。`Idle`、`idle`、`Start`、`start` 必须按 manifest 精确声明并精确匹配 skeleton。
- 不把缺失的 Spine `start` 自动退回 builtin appear；需要 fallback 的 symbol 必须在 manifest 中显式写 `kind: "builtin"` 或 `kind: "static"`。

## 5. 实现方案

### 5.1 先做资源和方案确认

执行者先完成资源盘点：

```bash
git status --short --untracked-files=all
node -e "const fs=require('fs'); for (const f of ['assets/game003-s1/WL.json','assets/game003-s1/H1.json','assets/game003-s1/H2.json','assets/game003-s1/H3.json','assets/game003-s1/H4.json','assets/game003-s1/H5.json']) { const j=JSON.parse(fs.readFileSync(f,'utf8')); console.log(f, Object.keys(j.animations||{})); }"
file assets/game003-s1/Symbol.atlas assets/game003-s1/Symbol.png
```

然后选择 rendercore 内部 Spine 播放代理落地方式：

1. 优先复用 `apps/spine2pixiani-demo/src/runtime/*` 中已经存在的 atlas 解析、Spine JSON 适配、时间轴采样和 Pixi display 组装思路，把需要的通用实现落到 `packages/rendercore/src/symbol/spine-runtime/` 或相邻 rendercore symbol 文件中。
2. 如果现有 demo runtime 无法可靠支持当前 `Spine 4.2.43` 资源，且必须依赖官方 Spine Pixi runtime，则把依赖加在 `packages/rendercore/package.json`，由 rendercore 封装成统一内部代理，并同步 `pnpm-lock.yaml`。执行者必须验证该依赖支持 Pixi v8，并在报告中说明为什么不能复用现有 demo runtime。
3. 方案选择必须以当前真实资源能播放为准：`Symbol.atlas` 的 `bounds/rotate:90`、skeleton `skins` 数组、mesh attachment 都要纳入只读验证。不能选择一个只能解析旧 demo cabin/asset12 的实现。
4. 当前美术资源不要作为“可整理的测试输入”处理。自动化测试可以读取 `assets/game003-s1` 的当前文件，或复制一份字节一致 fixture 到测试目录；禁止改写、格式化、裁剪、重导出或重命名美术提交资源来迁就 runtime。若复制 fixture，应把来源说明写入测试 fixture 目录，不要让后续维护者误以为这些文件可从测试侧回写到 `assets/game003-s1`。

无论最终是自研 rendercore parser 还是 rendercore 内封装官方 Spine runtime，都必须在 rendercore 测试中加入当前资源兼容性用例，覆盖 `WL/H1-H5.json`、`Symbol.atlas` 和 `Symbol.png` 这一组真实资源。不能只用手写 toy fixture、旧 demo cabin 资源或模拟 atlas 证明通过。

无论选择哪种方式，`packages/rendercore` 内部接口都应是稳定的最小代理，例如：

```ts
export interface RendercoreSpineSymbolPlayer {
  readonly view: Container;
  init(): Promise<void> | void;
  play(options: { readonly animationName: string; readonly loop: boolean }): void;
  update(deltaSeconds: number): { readonly completed: boolean };
  reset(): void;
  destroy(): void;
}
```

实际命名可以按代码风格调整，但必须满足：

- rendercore 能把 player 挂到 `SymbolAnimationContext.overlayLayer`。
- rendercore 能用 `update(deltaSeconds)` 手动驱动，不能创建独立 RAF。
- once 动画能报告完成。
- loop 动画不会让 state machine 误以为 once 完成。
- `destroy()` 幂等并移除 display tree。
- 初始化失败同步或异步抛出后，下一次 `RenderSymbol.update(...)` 必须显式抛出。

### 5.2 扩展 symbol manifest schema

在 `packages/rendercore/src/symbol/manifest.ts` 中新增 Spine spec。建议合同如下：

```ts
export interface SymbolManifestSpineAnimationSpec {
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly texture: string;
  readonly playback: {
    readonly mode: "animation";
    readonly animationName: string;
    readonly loop: boolean;
  };
  readonly transform?: {
    readonly x?: number;
    readonly y?: number;
    readonly scale?: number;
  };
}
```

字段语义：

- `skeleton`：相对当前 symbol manifest 的 Spine JSON 路径，例如 `./H1.json`。
- `atlas`：相对当前 symbol manifest 的 atlas 文本路径，例如 `./Symbol.atlas`。
- `texture`：相对当前 symbol manifest 的 atlas image 路径，例如 `./Symbol.png`。
- `playback.animationName`：Spine skeleton 中的精确动画名，例如 `Idle`、`Start`、`start`。
- `playback.loop`：Spine player 内部是否循环该动画。
- `transform`：可选显式对齐修正，只允许有限数字；不配置时使用 `{ x: 0, y: 0, scale: 1 }`。不要从 PNG 尺寸、skeleton 宽高或 symbol code 隐式推导修正。

解析和校验要求：

- `animations` 只允许 `normal`、`appear`、`win` 等 `animationStates` 中声明的 state。
- `kind` 只允许 `builtin`、`static`、`vni`、`spine`。
- path 必须是非空字符串，并统一为 `./basename` 风格；不要允许 `../`、绝对路径或 URL。
- `playback.mode` 必须是 `"animation"`。
- `playback.animationName` 必须是非空字符串。
- `playback.loop` 必须是 boolean。
- `transform.scale` 如果存在，必须是 finite positive number；`x/y` 如果存在，必须是 finite number。
- once state 的 Spine spec 必须 `loop: false`；`normal` 默认 state 可以 `loop: true`。
- manifest 中只声明 `spine` 不代表资源存在，资源存在性要在资源 map 构建阶段继续校验。

### 5.3 扩展 rendercore Spine 资源构建和 resolver

在 `packages/rendercore` 中新增文件，建议：

```text
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/tests/symbol/spine-animation.test.ts
```

需要提供：

```ts
export interface SymbolSpineAnimationResource {
  readonly symbol: string;
  readonly state: SymbolStateId;
  readonly spec: SymbolManifestSpineAnimationSpec;
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly textureUrl: string;
}

export type SymbolSpineAnimationResourceMap = Readonly<
  Record<string, Readonly<Partial<Record<SymbolStateId, SymbolSpineAnimationResource>>>>
>;
```

资源构建函数建议：

```ts
createSymbolSpineAnimationResourcesFromManifest({
  manifest,
  spineSkeletonModules,
  spineAtlasModules,
  spineTextureModules,
})
```

校验要求：

- manifest 中每个 `kind: "spine"` 都必须能在对应 module map 中找到 skeleton、atlas 和 texture。
- skeleton 必须包含 `animations[animationName]`，并且大小写精确匹配。
- atlas 文本必须能解析当前 Spine 4.2 `bounds:` / `rotate:90` 格式，且第一版只支持单 atlas page；如果 atlas 声明多个 image page，要显式失败并另开任务。
- atlas page 文件名必须等于 manifest `texture` 的 basename，例如 `Symbol.png`。
- texture module 必须返回 URL 字符串。
- 如果使用从 demo runtime 迁移来的自研 parser，还要校验当前 parser 支持的 Spine 字段。当前资源已经包含 `skins` 数组和 mesh attachment；实现必须真实支持这些字段，或显式选择官方 runtime。遇到 IK、weighted mesh、path constraints、复杂 skin 等未支持能力时显式失败，不要静默忽略。

`createSymbolManifestAnimationResolver(...)` 扩展为同时接受：

```ts
spineSkeletonModules?: Readonly<Record<string, unknown>>;
spineAtlasModules?: Readonly<Record<string, string>>;
spineTextureModules?: Readonly<Record<string, string>>;
```

并保持现有 VNI 参数兼容。resolver 查找顺序：

1. 当前 symbol/state 有 Spine resource：返回 `SpineSymbolAni`。
2. 当前 symbol/state 有 VNI resource：返回 `VniSymbolAni`。
3. 当前 symbol/state 有 `builtin/static` spec：返回现有 manifest built-in/static animation。
4. 否则走显式传入的 `fallback`。
5. 没有 fallback 时抛错。

如果同一个 symbol/state 同时配置多个外部动画类型，这是 manifest 本身不可能出现的单字段冲突；无需额外兜底。

`SpineSymbolAni` 生命周期要求：

- `stateId` 等于 `context.resolvedState`。
- `playback` 等于 `context.state.playback`，不能因为 Spine idle 循环就返回 `"loop"`。
- `reset()` 清空旧 player，调用 `resetBaseDisplay(context)`，然后隐藏 `baseLayer` 和 `stateSprite`，把 Spine view 挂到 `overlayLayer`。
- `update(deltaSeconds)` 用外部 ticker 驱动 player；初始化失败必须抛出。
- once state 在 Spine 动画完成时只报告一次 `{ onceCompleted: true }`。
- static state 即使内部 loop，也始终返回 `{ loopCompleted: false, onceCompleted: false }`。
- `destroy()` 幂等，必须释放 player、取消监听、移除 display tree。
- state 切换回 builtin/static/VNI 时不能残留 Spine view。

### 5.4 扩展 `generate-symbol-state-textures.mjs`

当前 generator 会保留 manifest 的 `animations`，但只接受 `builtin/static/vni`。必须扩展：

- `validatePreservedAnimation(...)` 支持 `kind: "spine"`。
- 保留 `skeleton`、`atlas`、`texture`、`playback`、`transform`。
- 保持 unknown field fail-fast。
- 新增测试覆盖重新生成后 Spine spec 不丢失。

测试必须覆盖：

- `normal` 的 `spine Idle loop: true` 被保留。
- `appear` 的 `spine Start loop: false` 被保留。
- 缺 `playback.animationName`、`loop` 非 boolean、非法 transform、非法 path 会失败。
- 旧 VNI preservation 测试仍通过。

### 5.5 在 rendercore 内实现 Spine 播放代理

如果复用 demo runtime，把通用文件迁入 `packages/rendercore/src/symbol/spine-runtime/`，建议结构：

```text
packages/rendercore/src/symbol/spine-runtime/atlas.ts
packages/rendercore/src/symbol/spine-runtime/color.ts
packages/rendercore/src/symbol/spine-runtime/display-factory.ts
packages/rendercore/src/symbol/spine-runtime/spine-adapter.ts
packages/rendercore/src/symbol/spine-runtime/spine-player.ts
packages/rendercore/src/symbol/spine-runtime/spine-types.ts
packages/rendercore/src/symbol/spine-runtime/timeline-sampler.ts
packages/rendercore/src/symbol/spine-runtime/transform.ts
packages/rendercore/tests/symbol/spine-runtime/*.test.ts
```

rendercore 对外导出只需要公开 manifest/resolver 所需类型和 `SpineSymbolAni`，不要把低层 parser 变成 app 可依赖的公共入口：

```text
packages/rendercore/src/symbol/index.ts
packages/rendercore/src/index.ts
```

播放代理要求：

- 不依赖 DOM 容器或独立 renderer。
- 不拥有 `PIXI.Application`、canvas、RAF 或 ticker。
- 输出 Pixi `Container`，由 rendercore 挂进同一棵 Pixi 树。
- 支持 `init()`、`play()`、`update(deltaSeconds)`、`reset()`、`destroy()`。
- 支持 atlas image URL 加载；如果需要 `Assets.load`，加载细节必须由 rendercore 的 Spine runtime 封装，app 不直接加载 atlas internals。
- 一次性动画完成后保持最后一帧，直到 rendercore state machine 切回 default 或新状态销毁它。
- loop 动画按自身 duration 循环。
- 如果自研 runtime 路径无法在测试中渲染当前 `H1` mesh attachment 和 `WL/H1-H5` 的 `Idle` 动画，应停止自研路径，改用 rendercore 内封装的官方 Spine Pixi runtime；不要用“先忽略 mesh/只显示部分 slot”的半支持状态交付。

如果选择官方 Spine runtime，也仍要封装成上述代理，不要让 app 直接依赖官方类。`apps/game003/package.json` 和 `apps/symbolsviewer/package.json` 不应新增官方 Spine runtime 依赖；app 源码也不应直接 import 官方 Spine 包、`apps/spine2pixiani-demo` runtime 或 rendercore 内部 `spine-runtime/*` 私有路径。

### 5.6 扩展 static config 和 generated modules

在 YAML 中为 `skins."1".symbols` 增加 Spine 资源 glob。建议字段：

```yaml
symbols:
  manifest: assets/game003-s1/symbol-state-textures.manifest.json
  pngGlob: assets/game003-s1/*.png
  vniProjectGlob: assets/game003-s1/*-wins.json
  vniAssetGlob: assets/game003-s1/assets/*.{png,jpg,jpeg,webp}
  spineSkeletonGlob: assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json
  spineAtlasGlob: assets/game003-s1/{Symbol}.atlas
  spineTextureGlob: assets/game003-s1/{Symbol}.png
  emptySymbols: []
  requireExplicitScale: true
  requiredStates:
    - spinBlur
    - disabled
```

同步更新：

```text
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/tests/static-config.test.ts
apps/buildgamestatic/tests
```

`apps/buildgamestatic/src/yaml-loader.ts` 需要重点同步：

- `parseSymbols(...)` 的 known keys 加入 `spineSkeletonGlob`、`spineAtlasGlob`、`spineTextureGlob`，否则 YAML 会因 unknown field 直接失败。
- `validateSkins(...)` 增加三个 Spine glob 的路径和扩展名校验。
- `spineSkeletonGlob` 只允许当前资源目录下的 brace JSON glob，例如 `assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json`；禁止 `assets/game003-s1/*.json`，避免混入 `*-wins.json`、win-amount JSON 或其它配置。
- `spineAtlasGlob` 只允许 `.atlas`，建议使用 `assets/game003-s1/{Symbol}.atlas`，不要写成没有 glob 表达式的 path。
- `spineTextureGlob` 只允许 `.png`，建议使用 `assets/game003-s1/{Symbol}.png`，不要复用宽泛 `pngGlob`。
- 三个 Spine glob 的目录都必须存在，且不能使用 `**`。

生成物要求：

- `spineSkeletonModules`：`import.meta.glob(..., { eager: true, import: "default" }) as Record<string, unknown>`。
- `spineAtlasModules`：`import.meta.glob(..., { eager: true, import: "default", query: "?raw" }) as Record<string, string>`。
- `spineTextureModules`：`import.meta.glob(..., { eager: true, import: "default", query: "?url" }) as Record<string, string>`。
- 三个 glob 如果 YAML 配置了，生成器和 runtime 校验都不能允许空匹配。
- `SlotGameStaticSymbolsConfig` 增加三个可选字段并 fail-fast 校验类型。

loading 资源也要同步增加，避免首屏 99% 后才发现 Spine 资源漏加载：

```yaml
loading:
  resources:
    - id: game003-symbol-spine-skeletons
      glob: assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json
      weight: 2
    - id: game003-symbol-spine-atlases
      path: assets/game003-s1/Symbol.atlas
      weight: 1
    - id: game003-symbol-spine-textures
      path: assets/game003-s1/Symbol.png
      weight: 3
```

不要用宽泛 `assets/game003-s1/*.json`，否则会混入 VNI `*-wins.json`、win-amount JSON 或其它配置。loading 单文件资源应使用 `path`，不要写成不含 glob 表达式的 `glob`，因为当前 loader 会要求 `glob` 真的包含 glob 表达式。

### 5.7 更新 game003 接入

在 `apps/game003/src/skin-config.ts` 中把 generated static config 的 Spine modules 传给 `createSymbolManifestAnimationResolver(...)`。

示例：

```ts
symbolAnimationResolver: createSymbolManifestAnimationResolver({
  manifest: game003StaticSkin1.symbols.manifest,
  requiredStates: game003StaticSkin1.symbols.requiredStates,
  vniProjectModules: game003StaticSkin1.symbols.vniProjectModules ?? {},
  vniAssetModules: game003StaticSkin1.symbols.vniAssetModules ?? {},
  spineSkeletonModules: game003StaticSkin1.symbols.spineSkeletonModules ?? {},
  spineAtlasModules: game003StaticSkin1.symbols.spineAtlasModules ?? {},
  spineTextureModules: game003StaticSkin1.symbols.spineTextureModules ?? {},
  fallback: game003DefaultAnimationResolver,
})
```

要求：

- `apps/game003` 不直接 import `WL.json`、`H1.json`、`Symbol.atlas` 或 `Symbol.png`。
- `apps/game003` 不根据 symbol 名决定 Spine 动画。
- `apps/game003/src/assets.ts` 仍只负责普通 symbol PNG / state texture 的 asset map 和 Texture loading。
- `game003` 的 `bg-bar` 独立 manifest 不需要 Spine modules，继续传空 modules。

### 5.8 更新 symbolsviewer 接入

在 `apps/symbolsviewer/src/symbol-set-config.ts` 中为 `game003-s1` 增加 Spine modules：

```ts
const game003S1SpineSkeletonModules = import.meta.glob(
  "../../../assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;

const game003S1SpineAtlasModules = import.meta.glob(
  "../../../assets/game003-s1/{Symbol}.atlas",
  { eager: true, import: "default", query: "?raw" },
) as Record<string, string>;

const game003S1SpineTextureModules = import.meta.glob(
  "../../../assets/game003-s1/{Symbol}.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
```

然后传给 `createSymbolManifestAnimationResolver(...)`。要求：

- 不手写 per-symbol imports。
- 不改变 viewer 序列状态合同；`normal -> appear -> win -> spinBlur -> disabled` 仍由现有 UI 驱动。
- 用户会自行做浏览器验收，执行者只需完成非浏览器验证并在报告中给出 dev URL/操作建议。

### 5.9 更新 `assets/game003-s1/symbol-state-textures.manifest.json`

按最终资源盘点显式配置高级 symbol 的 Spine 动画。示例格式：

```json
"H1": {
  "normal": "./H1.png",
  "spinBlur": "./H1.spinBlur.png",
  "disabled": "./H1.disabled.png",
  "scale": 1,
  "animations": {
    "normal": {
      "kind": "spine",
      "skeleton": "./H1.json",
      "atlas": "./Symbol.atlas",
      "texture": "./Symbol.png",
      "playback": {
        "mode": "animation",
        "animationName": "Idle",
        "loop": true
      }
    },
    "appear": {
      "kind": "spine",
      "skeleton": "./H1.json",
      "atlas": "./Symbol.atlas",
      "texture": "./Symbol.png",
      "playback": {
        "mode": "animation",
        "animationName": "Start",
        "loop": false
      }
    },
    "win": {
      "kind": "builtin",
      "durationSeconds": 0.58
    }
  }
}
```

当前资源快照下：

- `WL` 的 appear 如果使用 Spine，应写 `animationName: "start"`。
- `H1` 的 appear 如果使用 Spine，应写 `animationName: "Start"`。
- `H2-H5` 当前只观察到 `Idle,Win`，没有 `Start`；如果执行时仍然如此，就不能把 `appear` 配成 Spine `Start`，除非资源已补齐。

`L1-L5` 的 VNI `win` 配置必须保留，不要被 Spine 迁移覆盖。

### 5.10 文档和协作规则

同步更新：

```text
packages/rendercore/README.md
apps/game003/README.md
apps/symbolsviewer/README.md（如存在或当前已有相关说明）
agents.md
```

`agents.md` 需要新增或调整规则，至少表达：

- `packages/rendercore` 拥有 symbol manifest 中 VNI / Spine animation resolver、Spine 播放代理和 `SymbolAni` 生命周期。
- `packages/pixiani` 不是 Spine symbol 支持的归属；除非另有明确任务，不要把 rendercore symbol 播放能力下沉到 pixiani。
- `apps/game003`、`apps/symbolsviewer` 只能通过 manifest + modules 配置 Spine symbol animation，不要在 app 内复制 Spine parser、atlas parser、播放状态机或按 symbol 名硬编码。
- game003-s1 高级 symbol 的 Spine 资源、loading 资源、YAML glob、manifest 和 generated static config 必须同步。

## 6. 测试计划

### 6.1 rendercore Spine runtime

如果新增 rendercore Spine runtime，至少新增测试：

```text
packages/rendercore/tests/symbol/spine-runtime/atlas.test.ts
packages/rendercore/tests/symbol/spine-runtime/spine-adapter.test.ts
packages/rendercore/tests/symbol/spine-runtime/spine-player.test.ts
```

覆盖：

- `Symbol.atlas` 可解析单 page、region、rotate、size、offset。
- `Symbol.atlas` 当前真实格式中的 `bounds:` 和 `rotate:90` 能被解析，测试不能只覆盖旧 `xy/size/orig/offset/index` 格式。
- Spine 4.2 JSON 可适配为内部模型，保留 `Idle` / `Start` / `start` / `Win` 动画名。
- Spine 4.2 `skins` 数组能被识别；`H1` 的 mesh attachment 要么真实支持，要么官方 runtime 路径覆盖，不允许静默忽略 mesh。
- 必须有一个当前资源兼容性测试使用 `WL/H1-H5.json`、`Symbol.atlas` 和 `Symbol.png`，验证 rendercore parser 或官方 runtime 路径支持这批真实 atlas/json，而不是只覆盖手写最小 fixture。
- 测试使用当前美术资源时必须只读；如果复制到 `packages/rendercore/tests/fixtures`，应保持字节一致，不要修改原始 `assets/game003-s1` 文件。
- 未支持的 Spine 字段显式失败。
- loop 动画 update 后循环。
- once 动画 update 到 duration 后报告 completed。
- `reset()` 和 `destroy()` 清理状态，重复 destroy 不抛错。

### 6.2 rendercore

新增或扩展：

```text
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/spine-animation.test.ts
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/tests/symbol/vni-animation.test.ts
```

覆盖：

- manifest parser 接收 `kind: "spine"`。
- manifest parser 拒绝未知字段、非法 path、空 animationName、非 boolean loop、非法 transform。
- generator 重新生成时保留 Spine spec。
- 资源构建能从 skeleton/atlas/texture modules 找到全部资源。
- 缺 skeleton、缺 atlas、缺 texture、动画名大小写不匹配时显式失败。
- `SpineSymbolAni` reset 后隐藏 base/state sprite、挂载 player view。
- `normal` state 的 Spine idle 内部 loop，但 `SymbolAni.playback` 仍是 `"static"`。
- `appear` state 的 Spine start 完成后只报告一次 `onceCompleted`。
- state 切换或 `RenderSymbol.destroy()` 会销毁 Spine player。
- VNI `L1-L5` 现有测试仍通过，resolver 没有回归。

### 6.3 buildgamestatic / gameframeworks

覆盖：

- YAML 支持 `spineSkeletonGlob` / `spineAtlasGlob` / `spineTextureGlob`。
- generated TS 输出 `spineSkeletonModules` / `spineAtlasModules` / `spineTextureModules`。
- atlas modules 使用 `?raw`，texture modules 使用 `?url`。
- static config validator 接受三个可选字段并校验类型。
- 配置了 Spine glob 但生成 modules 为空时，运行时资源构建会失败。
- `yaml-loader.test.ts` 覆盖 `parseSymbols(...)` 接受三个 Spine glob，并拒绝宽泛 `assets/game003-s1/*.json`、不含 glob 表达式的 `spineAtlasGlob: assets/game003-s1/Symbol.atlas`、错误扩展名和递归 `**`。
- `generator.test.ts` 覆盖 generated TS 中 atlas `import.meta.glob` 使用 `query: "?raw"`，texture 使用 `query: "?url"`。

### 6.4 game003

覆盖：

- `apps/game003/tests/static-config.test.ts` 校验 generated static config 包含 Spine modules。
- `apps/game003/tests/loading-resources.test.ts` 校验 loading 资源包含 skeleton、atlas、texture，且不会把 `*-wins.json` 当 Spine skeleton。
- `apps/game003/tests/source-boundary.test.ts` 校验 app 层没有直接解析 Spine / atlas 的专属实现，也没有直接 import 官方 Spine 包、`apps/spine2pixiani-demo` runtime、rendercore 内部 `spine-runtime/*` 私有路径、`WL.json`、`H1.json`、`Symbol.atlas` 或 `Symbol.png`。
- `apps/game003/tests/skin-config.test.ts` 或相邻测试校验 resolver 收到 Spine modules。
- `apps/game003/tests/assets.test.ts` 校验 `Symbol.png` 即使出现在 generated `pngModules` 中，也不会进入 `createGame003SymbolAssetMapFromModules(...)` 的 displayable symbol catalog。
- `apps/game003/tests/symbol-animation-config.test.ts` 当前“其它 game003 symbols use manifest builtin appear”的断言会被高级 symbol Spine appear 改动影响；如果测试不再符合新 manifest 合同，修改测试表达新合同，不要为了旧测试把生产实现改回 builtin。
- 现有 `game-adapter`、`bg-bar`、矿车、中奖金额测试继续通过。

### 6.5 symbolsviewer

覆盖：

- `apps/symbolsviewer/tests/symbol-set-config.test.ts` 校验 `game003-s1` symbol set 带 Spine modules。
- 校验 `game003-bg-bar` 不带 Spine modules。
- 校验不存在 per-symbol hardcode import，也没有直接 import 官方 Spine 包、`apps/spine2pixiani-demo` runtime 或 rendercore 内部 `spine-runtime/*` 私有路径。
- 现有“L1-L5 appear static / H1 builtin appear”测试需要按新 manifest 更新：`L1-L5` 仍保持 VNI win + static appear；`WL/H1` 等高级 symbol 的 `normal/appear` 应按 manifest 解析为 Spine；没有 `Start` 的 `H2-H5` 不应被测试强迫使用不存在动画。

## 7. 验收命令

执行前：

```bash
git status --short --untracked-files=all
git diff --stat
```

如新增依赖：

```bash
pnpm install
```

生成 game003 static config：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

包级验证：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore build

CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic build

CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer build

CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 release:check
```

如果执行时确实修改了 `packages/pixiani`，再追加：

```bash
CI=true pnpm --filter @slotclientengine/pixiani test
CI=true pnpm --filter @slotclientengine/pixiani typecheck
CI=true pnpm --filter @slotclientengine/pixiani lint
CI=true pnpm --filter @slotclientengine/pixiani build
```

最终格式和差异检查：

```bash
git diff --check
git status --short --untracked-files=all
```

如果根级验证耗时可接受，追加：

```bash
CI=true pnpm typecheck
CI=true pnpm lint
CI=true pnpm build
```

若任一命令因环境、依赖下载或已有无关改动失败，不能在报告中写“已通过”；必须记录命令、失败摘要、判断是否与本任务相关，以及后续处理建议。

## 8. 浏览器验收交接

用户会自行验证 `symbolsviewer` 和 `game003`。执行者不需要把浏览器验收写成已完成证据，但必须在任务报告中给出可复现启动命令和建议检查点。

建议启动命令：

```bash
CI=true pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 5176
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5177
```

建议检查点：

- `symbolsviewer` 选择 `game003-s1` 后，高级图标默认状态播放 manifest 声明的 Spine idle。
- 切到 `appear` 后，只配置了 Spine start 的 symbol 播放 manifest 声明的 start 动画；未配置的 symbol 按 manifest 显式 fallback 行为展示。
- `L1-L5` 的 VNI `win` 动画仍能播放。
- `game003` 首屏仍先走 `packages/gameloading`，`100%` 后才创建 gameframeworks / Pixi 游戏画面。
- `game003` spin 中高级 symbol 不因 Spine idle 造成状态机卡住、重复挂载或残留 display tree。

## 9. 任务报告要求

完成后新增：

```text
tasks/75-rendercore-spine-symbol-animation-[utctime].md
```

报告必须包含：

- 任务摘要。
- 实际选择的 rendercore Spine 播放代理方案：复用 demo runtime / 新增官方依赖 / 其它，并说明原因。
- 当前真实资源兼容性说明：`Symbol.atlas` 格式、`skins` 数组、mesh attachment 是否由实现覆盖。
- 测试 fixture 策略说明：是否只读引用当前 `assets/game003-s1` 资源，或是否字节一致复制到测试目录；确认未直接修改美术资源。
- 改动文件清单。
- manifest 最终配置摘要，列出哪些 symbol/state 使用 Spine、对应 skeleton、animationName、loop。
- 是否更新 `agents.md`，以及新增规则摘要。
- 是否新增或更新依赖，`packages/rendercore/package.json` 和 `pnpm-lock.yaml` 是否变化；确认 app package 没有直接依赖 Spine runtime。
- 生成物同步说明：`game-static.generated.ts` / `game-loading.generated.ts` 是否由命令生成。
- 所有验收命令和结果。
- 未执行浏览器验收的说明，并交接 symbolsviewer / game003 的启动命令。
- 已知风险或后续事项，例如某些 symbol 当前缺少 `Start` 动画资源。
- 最终 `git status --short --untracked-files=all` 摘要。

## 10. 二次遗漏检查

提交前必须逐项复查：

- [ ] 没有回滚或覆盖用户已有未提交改动。
- [ ] 没有为了 parser、测试或 runtime 适配直接修改 `assets/game003-s1` 下美术提交资源。
- [ ] 如果新增测试 fixture，它们是从当前资源字节一致复制或最小手写样例；报告中说明来源，且没有反向覆盖原始资源。
- [ ] Spine 资源没有被普通 PNG symbol catalog、VNI asset glob 或 win-amount glob 误收。
- [ ] `L1-L5` VNI `win` manifest 配置仍存在并可解析。
- [ ] `WL/H1-H5` 的 Spine animationName 均来自 manifest 精确声明。
- [ ] H2-H5 若仍缺 `Start`，没有被静默配置成不存在的 `Start` 或自动退回 `Idle`。
- [ ] `Symbol.atlas` 的 `bounds:` / `rotate:90` 格式已被测试覆盖。
- [ ] Spine 4.2 `skins` 数组和当前 `H1` mesh attachment 已真实支持，或已选择 rendercore 内官方 runtime；没有静默忽略 mesh。
- [ ] `normal` Spine idle 没有把 state machine 的 playback 改成 `loop`。
- [ ] once Spine animation 完成后能回到 default state。
- [ ] `generate-symbol-state-textures.mjs` 不会在重新生成时丢失 `spine` spec。
- [ ] `game-static.generated.ts` / `game-loading.generated.ts` 没有手改，已通过 `check:static-config`。
- [ ] `apps/game003` 和 `apps/symbolsviewer` 没有复制 Spine parser / atlas parser / playback state machine。
- [ ] `apps/game003` 和 `apps/symbolsviewer` 没有直接依赖或 import 官方 Spine runtime、`apps/spine2pixiani-demo` runtime、rendercore 内部 `spine-runtime/*` 私有路径或具体美术资源文件。
- [ ] `packages/rendercore` 没有写入 game003 专属 symbol 名或资源名。
- [ ] Spine 播放代理实际落在 `packages/rendercore`，没有把 symbol 支持归属下沉到 `packages/pixiani`。
- [ ] 如果确实修改了 `packages/pixiani`，该修改只是底层通用辅助且已补测试和导出。
- [ ] loading 资源包含 skeleton、atlas、texture，并且 glob 不是宽泛 `*.json`。
- [ ] loading 中 `Symbol.atlas` / `Symbol.png` 使用 `path` 或合法 brace glob，不使用无 glob 表达式的 `glob` 字段。
- [ ] `spineAtlasGlob` / `spineTextureGlob` 在 static config 中使用合法 brace glob，例如 `{Symbol}.atlas` / `{Symbol}.png`。
- [ ] `agents.md` 已按新协作边界同步，或报告说明为什么不需要更新。
- [ ] 所有相关测试、typecheck、lint、build、release check 结果已记录。
