# rendercore vnicore symbol animation 任务计划

## 1. 任务目标

本任务把 VNI 动画接入 `packages/rendercore` 的 symbol 动画系统，并让 `apps/symbolsviewer` 和 `apps/game003` 都通过同一套 rendercore 能力使用它。

核心目标：

- `packages/rendercore` 依赖并集成 `@slotclientengine/vnicore`，提供 VNI-backed symbol animation 能力。
- 当前分散在 `apps/symbolsviewer/src/symbol-assets.ts` 和 `apps/game003/src/assets.ts` 的 symbol manifest 解析、scale 读取、状态贴图 asset map 组装能力上移到 `packages/rendercore`。
- `apps/symbolsviewer` 新增 `game003-s1` symbol set，能预览 `assets/game003-s1`，并能看到 `L1` 的 `win` 状态播放 VNI 动画。
- `apps/game003` 的 `L1` symbol 中奖状态动画从现有默认 win shine 换成 `assets/game003-s1/L1-wins.json` 对应的 VNI 动画；其它 symbol 继续走现有 fallback 动画。
- `apps/game003` 的中奖顺序仍沿用当前 `bg-wins.basicComponentData.usedResults -> clientData.results[] -> result.pos` 队列，app 只请求可见 symbol 状态为 `win`，不在 app 内硬编码 VNI 播放细节。
- VNI 动画配置必须 manifest 驱动，不允许在 `apps/game003` 或 `apps/symbolsviewer` 中写 `if symbol === "L1"` 这类专属运行时代码。
- 继续保持 fail-fast：缺 manifest、缺 VNI project、缺 VNI asset、非法 VNI crop rect、非法 scale、未知 state、VNI 初始化失败、symbol 状态播放生命周期异常都必须显式失败，不做隐藏兜底。

本计划是完整可执行版本，不能依赖任何别的上下文，也不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、文档同步、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/67-rendercore-vnicore-symbol-animation-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/67-rendercore-vnicore-symbol-animation-260701-123456.md
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

本任务会让 `packages/rendercore` 新增 workspace 依赖：

```text
@slotclientengine/vnicore: workspace:*
```

修改 `package.json` 后必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，用上面的代理环境变量后重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前已知 `assets/game003-s1/L1-wins.json` 和 `assets/game003-s1/assets/*` 可能是未跟踪文件。它们是本任务的输入资产，执行时不要删除、移动或用旧资源覆盖。

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter game003 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。

`game-static.generated.ts` 和 `game-loading.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改；修改 YAML 或 generator 后必须同步执行生成和 `--check` 校验。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 当前相关文件

rendercore symbol 和 reel：

```text
packages/rendercore/package.json
packages/rendercore/src/index.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/symbol/animation-resolver.ts
packages/rendercore/src/symbol/named-animations.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/reel/symbol-registry.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/tests/symbol
packages/rendercore/tests/reel
packages/rendercore/README.md
```

vnicore：

```text
packages/vnicore/package.json
packages/vnicore/src/core/index.ts
packages/vnicore/src/core/asset-manifest.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/pixi/index.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/docs/api-zh.md
packages/vnicore/tests/core
packages/vnicore/tests/pixi
packages/vnicore/README.md
```

symbolsviewer：

```text
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/symbol-animation-config.ts
apps/symbolsviewer/src/viewer-sequence.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/README.md
```

game003：

```text
apps/game003/src/assets.ts
apps/game003/src/symbol-animation-config.ts
apps/game003/src/skin-config.ts
apps/game003/src/game-demo.ts
apps/game003/src/game-adapter.ts
apps/game003/src/win-sequence.ts
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
apps/game003/config/game-static.yaml
apps/game003/tests/assets.test.ts
apps/game003/tests/symbol-animation-config.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/game-demo.test.ts
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/README.md
```

静态配置生成链路：

```text
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/src/path-utils.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/buildgamestatic/tests/generator.test.ts
apps/buildgamestatic/tests/cli.test.ts
apps/buildgamestatic/README.md
packages/gameframeworks/src/static-config
packages/gameframeworks/tests/static-config.test.ts
```

资源和协作规则：

```text
assets/game003-s1/symbol-state-textures.manifest.json
assets/game003-s1/L1-wins.json
assets/game003-s1/assets
agents.md
tasks/67-rendercore-vnicore-symbol-animation.md
```

### 3.2 rendercore 现状

`RenderSymbol` 继承 `@slotclientengine/pixiani/core` 的 `VisualEntity`。当前 symbol 动画接口是：

```ts
export interface SymbolAni {
  readonly stateId: SymbolStateId;
  readonly playback: SymbolPlaybackKind;
  reset(): void;
  update(deltaSeconds: number): SymbolAniUpdateResult;
}
```

`RenderSymbol` 每次状态变化会调用 `animationResolver(context)` 创建新的 `SymbolAni`，再调用 `reset()`。`win` 状态当前由 `createWinSymbolAni(...)` 创建，是一次性动画，完成后状态机会回到 `normal`。

`RenderReelSet` 和 `ReelSymbolRegistry` 已经支持：

- 按可见窗口坐标请求 symbol 状态。
- `texturePolicy.requiredStateTextures` 校验 `spinBlur` / `disabled`。
- `symbolScales` 按 manifest scale 控制显示缩放。
- `animationResolver` 透传给每个 `RenderSymbol`。

当前缺口：

- `SymbolAni` 没有销毁生命周期，VNI player 这类持有 Pixi app、DOM canvas、RAF、texture 的动画需要补 `destroy()`。
- `packages/rendercore` 目前没有依赖 `@slotclientengine/vnicore`。
- `packages/rendercore` 还没有通用 symbol manifest 解析模块；manifest 解析重复在 app 内。
- `packages/rendercore` 还没有 VNI-backed `SymbolAni` 或 resolver。
- `packages/rendercore/scripts/generate-symbol-state-textures.mjs` 目前会直接重写 manifest；实现时必须让它保留每个 symbol 的 `animations` 元数据，并补测试防止后续重生成丢失 VNI 配置。

### 3.3 vnicore 现状

`@slotclientengine/vnicore/core` 当前提供：

```ts
assertVNIProject(value)
validateVNIProject(project)
createAssetUrlManifest(modules)
resolveProjectAssetUrls(project, manifest)
```

`@slotclientengine/vnicore/pixi` 当前提供：

```ts
VNIPlayer
```

`VNIPlayer` 当前构造参数包含 `container: HTMLElement`、`project`、`assetUrls` 等字段。它负责 VNI 校验后的 Pixi 渲染、texture size 校验、播放控制、particle 排空和 diagnostics。

当前公开 API 的两个嵌入缺口需要在本任务中解决：

- `VNIPlayer` 默认使用自己的 RAF。rendercore symbol 动画应由 `RenderSymbol.update(deltaSeconds)` 驱动，避免同一个动画同时被 RAF 和游戏 ticker 推进。
- `VNIPlayer` 当前 resize fit 逻辑带内部 padding。rendercore 需要把 VNI stage 的显式 `stageRect` 映射成 Pixi texture frame，不能依赖不透明 padding 推导。

推荐最小改法：

- 在 `VNIPlayerOptions` 增加可选 `autoTick?: boolean`，默认 `true` 保持现有 viewer 行为；rendercore 使用 `autoTick: false`，由 `SymbolAni.update(deltaSeconds)` 手动调用 `player.update(deltaSeconds)`。
- 在 `VNIPlayerOptions` 增加可选 `fitPadding?: number`，默认保持现有 padding；rendercore 使用 `fitPadding: 0`，保证 VNI stage 坐标和 offscreen canvas 像素坐标一一对应。
- 同步更新 `packages/vnicore` 的测试、README 和 `docs/api-zh.md`。这只是为了让 rendercore 正确嵌入 VNI player，不把 symbol 业务逻辑移入 vnicore。

### 3.4 当前 manifest 现状

`assets/game003-s1/symbol-state-textures.manifest.json` 当前结构：

```json
{
  "version": 1,
  "states": ["spinBlur", "disabled"],
  "settings": {
    "spinBlur": { "kind": "verticalBoxBlur", "kernelHeight": 21 },
    "disabled": { "kind": "grayscale", "brightness": 0.72 }
  },
  "symbols": {
    "L1": {
      "normal": "./L1.png",
      "spinBlur": "./L1.spinBlur.png",
      "disabled": "./L1.disabled.png",
      "scale": 1
    }
  }
}
```

当前 `settings` 是生成器信息，运行时可以保留但不应作为运行逻辑依据。rendercore 的 manifest parser 必须允许 top-level `settings` 存在，但 symbol 级未知字段仍应显式失败。

本任务需要把 `L1` 扩展为 manifest 驱动的 VNI win 动画。建议结构：

```json
"L1": {
  "normal": "./L1.png",
  "spinBlur": "./L1.spinBlur.png",
  "disabled": "./L1.disabled.png",
  "scale": 1,
  "animations": {
    "win": {
      "kind": "vni",
      "project": "./L1-wins.json",
      "stageRect": { "x": 744, "y": 744, "width": 512, "height": 512 },
      "playback": { "mode": "range", "startTime": 0, "endTime": 2, "loop": false }
    }
  }
}
```

字段语义：

- `animations.win.kind = "vni"` 表示 `win` 状态使用 VNI-backed `SymbolAni`。
- `project` 是相对当前 manifest 文件所在目录的 VNI project JSON 路径。
- `stageRect` 是 VNI stage 左上角坐标系中的显式裁切矩形。`L1-wins.json` 的 stage 是 `2000 x 2000`，中心点是 `(1000,1000)`；`744,744,512,512` 表示以 stage 中心为中心裁切 `512 x 512`，保留 L1 本体和周围光效粒子。不要自动根据图层推导 crop，避免美术边界漂移被隐藏。
- `playback.mode = "range"` 表示播放固定范围，`startTime=0`，`endTime=2` 对应 `L1-wins.json` 的 `stage.duration=2`。
- `loop=false`，`win` 是一次性状态。播放完成后必须回到 `normal`。

如果执行中发现裁切范围需要由美术确认，先把实际选择和原因写入任务报告；不要用自动 bbox 或 “缺字段就全 stage 缩放” 的方式兜底。

现有 `packages/rendercore/scripts/generate-symbol-state-textures.mjs` 会重新生成 `symbol-state-textures.manifest.json`。本任务给 manifest 增加 `animations` 后，必须同步更新该脚本：重跑 state texture 生成时要保留同名 symbol 上已有的 `animations` 等明确运行时元数据，且仍然显式失败未知结构。否则以后重新生成 `game003-s1` 状态贴图会静默冲掉 `L1` 的 VNI 配置。

### 3.5 L1 VNI 资产现状

当前输入资产：

```text
assets/game003-s1/L1-wins.json
assets/game003-s1/assets/l1_asset_image_mr075krb_3.png
assets/game003-s1/assets/01_asset_image_mql7nr09_l.jpg
assets/game003-s1/assets/02_asset_image_mqkuxzs8_5.jpg
assets/game003-s1/assets/05_asset_image_mql7lnt5_h.jpg
assets/game003-s1/assets/image_asset_image_mqksg37p_9.jpg
```

执行时必须确认：

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs';
import { assertVNIProject } from './packages/vnicore/dist/core/index.js';
const data = JSON.parse(fs.readFileSync('assets/game003-s1/L1-wins.json', 'utf8'));
const project = assertVNIProject(data);
console.log(project.name, project.stage.width, project.stage.height, project.stage.duration, project.assets.length, project.layers.length);
NODE
```

预期当前输出类似：

```text
SCATTER1 2000 2000 2 5 5
```

如果 `packages/vnicore/dist` 不存在，先执行：

```bash
CI=true pnpm --filter @slotclientengine/vnicore build
```

### 3.6 symbolsviewer 现状

`apps/symbolsviewer` 当前支持六套 set：

```text
symbols
symbols001
symbols002
symbols003
game002-s2
game002-s3
```

`symbolsviewer` 当前在 app 内做了 manifest 解析、scale map 生成、状态贴图 asset map 组装和 texture loading。本任务完成后：

- manifest 解析和 asset map 组装应从 rendercore 导入。
- `symbolsviewer` 只保留 UI、Vite glob、symbol set 配置、texture loading 和 preview 排版。
- 新增 `game003-s1` set，使用 `assets/gamecfg003/gameconfig.json` 和 `assets/game003-s1`。
- `game003-s1` 的 VNI project JSON 和 VNI assets 必须通过 Vite `import.meta.glob` 显式纳入模块图。

### 3.7 game003 现状

`apps/game003` 当前静态配置生成只提供：

```ts
symbols: {
  manifest,
  pngModules,
  emptySymbols,
  requireExplicitScale,
  requiredStates
}
```

当前 `apps/game003/config/game-static.yaml` 中 `symbols.pngGlob` 是：

```yaml
pngGlob: assets/game003-s1/*.png
```

它不会包含：

```text
assets/game003-s1/L1-wins.json
assets/game003-s1/assets/*
```

因此本任务必须同步扩展静态配置生成链路，让 game003 runtime 可以拿到 VNI project modules 和 VNI asset modules。不要在 `apps/game003/src/skin-config.ts` 里绕过 YAML 手写一次专属 import。

`apps/game003` 当前中奖播放已经是：

1. spin 到服务器目标 scene。
2. 通过 `createGame003WinSymbolSequence(...)` 解析 `bg-wins` 的 result 队列。
3. 对每组 result 的 `pos` 请求可见 symbol 状态为 `win`。
4. 等对应可见 symbol 状态回到 `normal` 后进入下一组。

本任务应保持这个流程。`L1` 是否 VNI 动画只能由 rendercore resolver 根据 manifest 决定。

## 4. 非目标和边界

- 不改变 live server、`gamecode`、URL query 规则、`serverUrl` 显式失败规则。
- 不改变 `game003` 使用本地公开轮带滚动、服务器目标 scene 只叠加本轮临时可见窗口的边界。
- 不把 `game003-s1` 做成 `game002` 的新皮肤。
- 不把 `bg-wins`、Ways、GMI、WL、wild 或 L1 专属语义写进 `logiccore`、`gameframeworks`、`rendercore`。
- 不在 `apps/game003` 或 `apps/symbolsviewer` 中复制 VNI 播放状态机、layer group 算法、particle 排空逻辑或直接操作 vnicore 私有 Pixi container。
- 不在 app 内复制 rendercore symbol 状态机、reel 状态机、manifest parser 或 asset map 校验逻辑。
- 不扩展共享 symbol 生成器去支持 JPG 普通态。`game003-s1` 可展示 symbol 普通态仍必须是 PNG；`assets/game003-s1/assets/*.jpg` 只属于 VNI 动画内部资源。
- 不使用缺字段自动 fallback 到默认 VNI project、默认 crop、默认 asset glob 或全 stage 缩放。
- 不为了测试方便修改 production 行为。测试如果写法奇怪，优先修测试。

## 5. 实施步骤

### 5.1 现状盘点

从仓库根目录执行：

```bash
git status --short --untracked-files=all
git diff --stat
rg -n "parseStateTextureManifest|createGame003SymbolScaleMapFromManifest|createSymbolScaleMapFromManifest|createStatefulSymbolAssetMapFromModules" apps packages/rendercore
rg -n "L1-wins|game003-s1/assets|symbol-state-textures.manifest" assets/game003-s1 apps/game003 apps/symbolsviewer packages/rendercore
```

盘点目标：

- 确认用户已有改动和未跟踪 VNI 资产，不回滚。
- 确认 manifest 解析重复点。
- 确认 `L1-wins.json` 和 `assets/game003-s1/assets/*` 都在本地。
- 确认 `game003` 当前生成文件不要手改。

### 5.2 更新 vnicore 嵌入所需最小 API

若当前 `VNIPlayer` 仍没有 `autoTick` 和 `fitPadding`，在 `packages/vnicore/src/pixi/vni-player.ts` 中补：

```ts
export interface VNIPlayerOptions {
  // existing fields...
  autoTick?: boolean;
  fitPadding?: number;
}
```

要求：

- `autoTick` 默认 `true`。现有 `apps/anieditorv5viewer` 行为不变。
- `autoTick: false` 时，`play(...)` / `playRange(...)` / segmented 播放只设置播放状态，不启动 RAF；宿主调用 `update(deltaSeconds)` 推进。
- `fitPadding` 默认保持现有值；rendercore 使用 `0`。
- `fitPadding` 必须是有限非负数，非法值显式抛错。
- 补 `packages/vnicore/tests/pixi/vni-player.test.ts`：验证 `autoTick:false` 不调用 `requestAnimationFrame`，但 `playRange` 后手动 `update(...)` 能触发完成；验证 `fitPadding:0` 让 stageRoot 按无 padding 适配。
- 更新 `packages/vnicore/docs/api-zh.md` 和 `packages/vnicore/README.md`。

验证：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore build
```

### 5.3 rendercore 新增 vnicore 依赖

更新 `packages/rendercore/package.json`：

- `dependencies` 增加 `@slotclientengine/vnicore: "workspace:*"`。
- `scripts.prepare:deps` 增加 `pnpm --filter @slotclientengine/vnicore build`，确保 rendercore typecheck/build 前 vnicore export 可用。

执行：

```bash
pnpm install
```

如果下载失败，使用代理后重试。

### 5.4 rendercore 接管 symbol manifest

在 `packages/rendercore/src/symbol/` 新增 manifest 模块，建议文件：

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/tests/symbol/manifest.test.ts
```

从 app 中迁移并统一这些能力：

```ts
parseSymbolStateTextureManifest(...)
getSymbolDisplaySymbolsFromManifest(...)
createSymbolAssetMapFromManifestModules(...)
createSymbolScaleMapFromManifest(...)
createSymbolVniAnimationResourcesFromManifest(...)
```

建议导出类型：

```ts
export interface ParsedSymbolStateTextureManifest { ... }
export interface SymbolManifestAnimationSpec { ... }
export interface SymbolManifestVniAnimationSpec { ... }
export interface SymbolManifestBuildOptions { ... }
```

功能要求：

- 支持 `version: 1`。
- 支持 top-level `states`，并校验 required states 必须存在。
- 允许 top-level `settings` 存在，但不把它作为运行逻辑。
- symbol 字段只允许：`normal`、`scale`、required state 字段、`animations`。
- 支持现有 single normal 和 layered normal。
- `scale` 必须是有限正数；当 `requireExplicitScale=true` 时缺失必须失败。
- `animations` 只能声明已存在的 symbol state，例如 `win`；未知 state 失败。
- `animations.win.kind === "vni"` 时必须校验 `project`、`stageRect`、`playback`。
- `stageRect` 必须是有限正数，且完全落在对应 VNI project stage 内。
- `project` 必须能在传入的 VNI project modules 中找到；找不到失败。
- VNI project 必须通过 `assertVNIProject(...)`。
- VNI project 的每个 `asset.path` 必须能从传入的 VNI asset modules 解析出 URL；缺失失败。
- 不要默认把 manifest 外的 PNG 当成 displayable symbol。若 symbolsviewer 仍需要展示 manifest 外但 paytable 外的额外 PNG，应通过明确选项保留旧测试语义，不能影响 game003。

从 app 中删除重复 parser：

- `apps/symbolsviewer/src/symbol-assets.ts` 不再持有完整 manifest parser。
- `apps/game003/src/assets.ts` 不再持有完整 manifest parser。

app 可以保留 texture loading helper，因为 `Assets.load(...)` 属于 app/runtime 装配，不是 manifest schema 本身。

更新导出：

```text
packages/rendercore/src/symbol/index.ts
packages/rendercore/src/index.ts
```

### 5.5 rendercore 新增 VNI-backed SymbolAni

在 `packages/rendercore/src/symbol/` 新增：

```text
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/tests/symbol/vni-animation.test.ts
```

设计要求：

- 新增 `VniSymbolAni` 或同等实现，必须实现 `SymbolAni`。
- `VniSymbolAni` 内部使用 `VNIPlayer`，不复制 vnicore 的播放状态机、particle、layer group 或采样逻辑。
- rendercore 创建 offscreen `HTMLElement` 容器；容器尺寸使用 VNI project stage 尺寸，`VNIPlayer` 使用 `autoTick:false` 和 `fitPadding:0`。
- `VniSymbolAni.reset()` 调用 `resetBaseDisplay(context)`，隐藏 base/state sprite，并把 VNI canvas 对应的 Pixi texture sprite 加到 `context.overlayLayer`。
- VNI canvas texture 必须按 manifest 的 `stageRect` 裁切，sprite anchor 为中心，直接在 symbol 根节点坐标播放，不进行全 stage 缩放。
- `VniSymbolAni.update(deltaSeconds)` 负责推进 VNI player，刷新 Pixi canvas texture，并在 VNI playback complete 后返回 `onceCompleted: true`。
- `win` 是一次性状态，`playback` 必须是 `once`；resolver 返回 playback 和 state definition 不一致时继续沿用现有 fail-fast。
- VNI 初始化是 async 时，`update(...)` 在初始化完成前不得提前完成；初始化失败必须在后续 update 中抛出原始错误。
- `VNIPlayer` 没有把内部 canvas 暴露成公开 API 时，rendercore 只能通过自己创建的 offscreen container 查询 canvas：初始化完成后必须找到且只找到一个 `HTMLCanvasElement`，否则显式失败。不要访问 vnicore 私有字段。
- offscreen container 默认不显示在页面中；如果 `ResizeObserver` 或 Pixi 初始化要求 DOM 挂载，可以把 container 挂到 `document.body` 的不可见区域，但必须在 `destroy()` 移除。没有 `document` / `window` 的环境中请求 VNI animation 时必须显式失败，测试通过注入工厂解决，不要让 production 静默降级。
- Pixi canvas texture 每帧必须刷新 source，例如使用 Pixi v8 对应的 `texture.source.update()` 或等效公开 API；测试要能捕获 `update(deltaSeconds)` 后 texture refresh 被调用。
- 为 `SymbolAni` 增加可选 `destroy(): void`，`ManualSymbolAni` 可不实现或实现 no-op。
- `RenderSymbol` 在替换当前 ani、`reset()`、`destroy()` 时必须销毁旧 ani，避免 hidden container、VNI app、RAF、textures 泄漏。
- `VniSymbolAni.destroy()` 必须 pause/destroy VNI player、移除 hidden container、释放 overlay sprite，且重复调用安全。
- 测试中不要为了 mock 破坏 production 接口。可以给 resolver 或 ani 工厂提供明确的 `playerFactory` / `documentFactory` 测试注入点，生产默认走真实 `VNIPlayer`。

建议公开 resolver：

```ts
createSymbolManifestAnimationResolver({
  manifest,
  vniProjectModules,
  vniAssetModules,
  fallback,
})
```

resolver 行为：

- 如果当前 `context.symbol` + `context.resolvedState` 有 manifest VNI 动画，返回 VNI-backed `SymbolAni`。
- 否则调用 `fallback(context)`。
- 没有 fallback 且没有 manifest 动画时显式失败，保持现有 named animation resolver 语义。

### 5.6 扩展 game003-s1 manifest

修改：

```text
assets/game003-s1/symbol-state-textures.manifest.json
```

只给 `L1` 增加 `animations.win`，不要给其它 symbol 编造 VNI 动画。建议内容使用第 3.4 节的 JSON 片段。

同步更新 `packages/rendercore/scripts/generate-symbol-state-textures.mjs`：

- 生成新 manifest 前读取已有 manifest；文件不存在时按当前逻辑生成。
- 对仍然存在的 symbol，保留已通过新 rendercore manifest parser 校验的 `animations` 字段。
- 对已不存在的 symbol，不保留旧 `animations`，避免死配置。
- 不保留未知 symbol 字段；未知字段应显式失败，提示先清理 manifest。
- 新增脚本测试：带 `L1.animations.win.kind="vni"` 的旧 manifest 重生成后仍保留 animation；删除 `L1` 或传 `--symbols` 不含 `L1` 时不保留该 animation。

校验：

```bash
node -e 'const m=require("./assets/game003-s1/symbol-state-textures.manifest.json"); console.log(m.symbols.L1.animations.win)'
```

### 5.7 扩展 buildgamestatic 静态配置生成

更新 YAML schema，让每个 skin 的 `symbols` 支持可选 VNI modules：

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

要求：

- `vniProjectGlob` 和 `vniAssetGlob` 是可选字段；没有 VNI symbol 动画的 skin 不需要写。
- 如果 manifest 声明了 `animations.*.kind="vni"`，但 generated config 没有对应 modules，runtime 必须显式失败。
- `apps/buildgamestatic/src/types.ts` 中 `GameStaticYamlSymbolsConfig` 增加可选字段：

```ts
readonly vniProjectGlob?: string;
readonly vniAssetGlob?: string;
```

- `apps/buildgamestatic/src/yaml-loader.ts` 的 `parseSymbols(...)` 必须允许这两个可选字段，并继续拒绝未知字段。
- `apps/buildgamestatic/src/yaml-loader.ts` 必须校验 glob 所在目录存在，不允许宽泛到仓库根。
- `vniProjectGlob` 必须是 JSON glob，例如 `assets/game003-s1/*-wins.json`；不要允许 `assets/**/*.json` 或仓库根级宽泛匹配。
- `vniAssetGlob` 必须限定图片扩展名，至少支持 `*.png`、`*.jpg`、`*.jpeg`、`*.webp` 和 `*.{png,jpg,jpeg,webp}`。若现有 `assertExtension(...)` / `getGlobDirectory(...)` 不能识别 brace glob，需要补专用 helper 和测试，而不是放宽到任意 `*`。
- `apps/buildgamestatic/src/generator.ts` 生成：

```ts
vniProjectModules: import.meta.glob("....json", { eager: true, import: "default" })
vniAssetModules: import.meta.glob("....{png,jpg,jpeg,webp}", { eager: true, import: "default", query: "?url" })
```

- `apps/buildgamestatic/src/generator.ts` 的 `ImportNames`、`createImportNames(...)`、`renderSkinConfig(...)` 必须同步生成可选 module 常量；没有配置 VNI glob 的 skin 不输出对应字段。
- `GAME003_STATIC_SKIN_MODULES` 若继续只表示 PNG modules，必须新建清晰命名的 VNI module 常量或在 skin config 内直接引用，避免把不同用途的 modules 混在同一个 record 中。
- `packages/gameframeworks/src/static-config/types.ts` 的 `SlotGameStaticSymbolsConfig` 增加：

```ts
readonly vniProjectModules?: Readonly<Record<string, unknown>>;
readonly vniAssetModules?: Readonly<Record<string, string>>;
```

- `packages/gameframeworks/src/static-config/validate.ts` 的 `assertSymbolsConfig(...)` 允许这两个可选字段；存在时分别校验 record 类型和 string URL record，不存在时不补默认空对象。
- 修改 `apps/game003/config/game-static.yaml`，保留中文注释，说明 VNI project/assets 是 symbol 中奖动画资源，不承载 token、cookie、服务器真实轮带或玩家本次下注。
- 修改 `apps/game003/config/game-static.yaml` 的 `loading.resources`，加入：

```yaml
    - id: game003-symbol-vni-projects
      glob: assets/game003-s1/*-wins.json
      weight: 2
    - id: game003-symbol-vni-assets
      glob: assets/game003-s1/assets/*.{png,jpg,jpeg,webp}
      weight: 4
```

- 生成 `game-loading.generated.ts` 后，测试应能看到 `L1-wins.json` 和 VNI assets 进入 loading 资源。

生成和校验：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

### 5.8 symbolsviewer 接入 rendercore manifest 和 game003-s1

修改：

```text
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/README.md
```

要求：

- 从 `@slotclientengine/rendercore` 导入 manifest helper 和 VNI animation resolver。
- 新增 `game003-s1` set：
  - `rawGameConfig` 使用 `assets/gamecfg003/gameconfig.json`。
  - `modules` 使用 `assets/game003-s1/*.png`。
  - `manifest` 使用 `assets/game003-s1/symbol-state-textures.manifest.json`。
  - `vniProjectModules` 使用 `assets/game003-s1/*-wins.json`。
  - `vniAssetModules` 使用 `assets/game003-s1/assets/*.{png,jpg,jpeg,webp}`。
  - display symbols 从 manifest 推导，应包含 `WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC`。
  - scale 从 manifest 读取，全部为 `1`。
  - `L1` 的 `win` 状态使用 VNI resolver；其它 symbol/state 使用现有 fallback。
- `main.ts` 的 texture loading helper 只加载 PNG/state textures；VNI assets 由 VNI resolver/player 通过 asset URL manifest 加载。
- UI 不需要新增解释性文案；下拉 set 出现 `game003-s1` 即可。
- README 更新为七套 set，并说明 VNI symbol 动画配置来自 manifest，预览只做配置和调用。

### 5.9 game003 接入 rendercore manifest 和 VNI resolver

修改：

```text
apps/game003/src/assets.ts
apps/game003/src/symbol-animation-config.ts
apps/game003/src/skin-config.ts
apps/game003/src/game-demo.ts
apps/game003/src/game-adapter.ts
apps/game003/tests/assets.test.ts
apps/game003/tests/symbol-animation-config.test.ts
apps/game003/tests/game-demo.test.ts
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/README.md
```

要求：

- `assets.ts` 使用 rendercore manifest helper 生成 symbol asset map、display symbols 和 scale map。
- `skin-config.ts` 从 generated static config 读取 `vniProjectModules` / `vniAssetModules`，并创建 `symbolAnimationResolver`。
- `Game003SkinConfig` 增加 `symbolAnimationResolver` 或等价字段。
- `Game003ReelConfig` 或 `createGame003ReelRuntime(...)` 支持传入 `animationResolver`，并传给 `createReelSymbolRegistry(...)`。
- 默认 runtime 使用当前 skin 的 resolver，不在 game003 app 中判断 `L1`。
- `game-adapter.ts` 的中奖顺序逻辑不需要知道 VNI，只继续等待可见 symbol 从 `win` 回到 `normal`。
- `source-boundary.test.ts` 增加或更新约束：`L1-wins` / `L1` VNI 动画配置不应出现在 `game-adapter.ts` / `game-demo.ts` 的业务判断中；允许出现在 manifest、测试 fixture、README 和 symbol set config 中。
- `loading-resources.test.ts` 确认 `game003-symbol-vni-projects:L1-wins.json` 和 VNI asset ids 存在，且仍不包含 token、cookie、serverUrl、gameserv。

### 5.10 文档和协作规则同步

必须更新：

```text
packages/rendercore/README.md
apps/symbolsviewer/README.md
apps/game003/README.md
apps/buildgamestatic/README.md
```

如果本任务新增或改变长期协作规则，必须更新：

```text
agents.md
```

建议新增规则要点：

- `packages/rendercore` 拥有 symbol manifest 解析和 VNI-backed symbol animation adapter；游戏 app 只传 manifest、Vite modules 和 resolver，不复制 manifest schema 或 VNI 播放状态机。
- `assets/game003-s1/L1-wins.json` 和 `assets/game003-s1/assets/*` 是 `L1` 的 manifest-driven win VNI 动画资源；`game003` / `symbolsviewer` 不应在 app 运行时代码中硬编码 L1 VNI 逻辑。
- 若新增 VNI symbol 动画，必须同步 symbol manifest、VNI project/assets glob、loading resources、generated static config、symbolsviewer preview 和 game runtime resolver。

## 6. 测试计划

### 6.1 rendercore

新增或更新测试：

```text
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/vni-animation.test.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
packages/rendercore/tests/reel/symbol-registry.test.ts
```

覆盖点：

- manifest parser 支持 `settings`、single normal、layered normal、scale、required states。
- manifest parser 支持 `animations.win.kind="vni"`。
- 缺 VNI project、缺 asset URL、非法 `stageRect`、未知 animation state、未知 symbol 字段都失败。
- `createSymbolScaleMapFromManifest(...)` 可替代原 app helper。
- `createSymbolAssetMapFromManifestModules(...)` 可替代原 app helper。
- VNI resolver 命中 `L1/win` 时返回 VNI-backed once animation；未命中时调用 fallback。
- `VniSymbolAni` 初始化 pending 时不提前 `onceCompleted`。
- VNI playback complete 后返回 `onceCompleted`，状态机回到 `normal`。
- `RenderSymbol` 替换 animation 或 destroy 时调用旧 ani 的 `destroy()`。

命令：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore lint
```

### 6.2 vnicore

若增加 `autoTick` / `fitPadding`，执行：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore lint
```

### 6.3 buildgamestatic 和 static config

执行：

```bash
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic build
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
```

覆盖点：

- YAML 可选 `vniProjectGlob` / `vniAssetGlob` 解析。
- `vniProjectGlob` / `vniAssetGlob` 的目录、扩展名、brace glob 和过宽 glob 校验。
- generated static config 包含 VNI modules。
- generated loading config 包含 VNI JSON 和 assets。
- `--check` 能检测 generated 文件漂移。

### 6.4 symbolsviewer

执行：

```bash
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
CI=true pnpm --filter symbolsviewer lint
```

覆盖点：

- `SYMBOL_SET_CONFIGS` 包含 `game003-s1`。
- `game003-s1` display symbols 从 manifest 推导。
- `L1` manifest animation spec 能被 resolver 识别。
- 非 L1 symbol 的 win/appear 继续 fallback。
- 原六套 set 不回归。

### 6.5 game003

执行：

```bash
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 release:check
```

覆盖点：

- `L1` 中奖位置请求 `win` 后使用 VNI once animation，并在完成后回到 `normal`。
- 非 `L1` symbol 的 win 状态仍能完成并回到 `normal`。
- `playSpin()` 仍等待中奖队列完成后 resolve。
- 缺 VNI asset / project 时显式失败。
- `game003` app 层没有硬编码 VNI 播放实现。

### 6.6 全局和格式

执行：

```bash
git diff --check
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter buildgamestatic format:check
CI=true pnpm --filter symbolsviewer format:check
CI=true pnpm --filter game003 format:check
rg -n "parseStateTextureManifest" apps/symbolsviewer apps/game003
rg -n "L1-wins|stageRect|kind.: .vni.|vniProjectModules|vniAssetModules" packages/rendercore apps/symbolsviewer apps/game003 assets/game003-s1 apps/buildgamestatic packages/gameframeworks agents.md
```

`parseStateTextureManifest` 不应继续出现在 app 内重复实现。`L1-wins` 应只出现在 manifest、generated static config、配置、测试、文档或通用 resolver 输入中，不应出现在 game003 中奖业务判断里。

## 7. 浏览器验收

本任务需要浏览器验收。若执行环境允许，启动：

```bash
CI=true pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 5207 --strictPort
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

symbolsviewer 验收：

- 打开 `http://127.0.0.1:5207/`。
- 选择 `game003-s1`。
- 默认序列播放到 `win` 时，`L1` 显示 VNI 动画；其它 symbol 仍有正常 win fallback。
- Pause/Play/Next/Reset 后 VNI 动画不残留、不重复叠加、不让状态卡在 `win`。
- 控制台无 VNI asset missing、texture size mismatch、unhandled promise rejection。

game003 验收：

- 打开 `http://127.0.0.1:5208/?skin=1`。
- loading 先到资源阶段，再在 `99%` 初始化 live，`100%` 后才挂载游戏画面。
- spin 停到目标 scene 后，若中奖队列包含 `L1`，`L1` 的 win 状态播放 VNI 动画，并在播放完成后继续后续中奖组或结束 spin Promise。
- 若 live 当次没有 `L1` 中奖，至少通过单元/fixture 测试证明 game003 runtime 可播放 L1 VNI win 动画。

若浏览器验收由用户执行，任务报告必须明确写出：已完成非浏览器验证，浏览器验收项交给用户，并列出上述 URL 和检查点。

## 8. 二次遗漏检查

实现完成后必须做一遍独立遗漏检查，至少覆盖：

- rendercore 是否真正拥有 manifest parser，而不是 app 内还有第二套 schema。
- rendercore 是否真正拥有 VNI-backed `SymbolAni`，而不是 symbolsviewer/game003 各自拼 player。
- VNI player 资源是否有销毁路径，切换状态、切换 symbol set、销毁 app 时不会泄漏 hidden DOM 或 RAF。
- VNI offscreen canvas 获取、Pixi texture refresh、无 DOM 环境显式失败是否都有测试覆盖。
- `SymbolAni` lifecycle 改动是否影响默认/manual/named animation。
- `createReelSymbolRegistry(...)` 是否把 skin resolver 传给 reel symbol。
- `packages/rendercore/scripts/generate-symbol-state-textures.mjs` 重跑后是否保留 `L1.animations.win`，不会静默冲掉 manifest runtime 元数据。
- `packages/gameframeworks/src/static-config` 类型和断言是否允许并校验 optional VNI module fields。
- `game003` generated static config 是否包含 VNI modules，且不是手改生成文件。
- `game003` loading resources 是否包含 `L1-wins.json` 和 `assets/game003-s1/assets/*`。
- `assets/game003-s1/symbol-state-textures.manifest.json` 是否仍只把 `WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC` 当作可展示 symbol；`bg1/bg2/mainreelbg/conveyor/assets/*` 不能进 symbol catalog。
- `agents.md` 是否需要同步；如果需要，是否已经写清 rendercore/vnicore/manifest 边界。
- README 是否同步：rendercore、symbolsviewer、game003、buildgamestatic、vnicore。
- `pnpm-lock.yaml` 是否因新增 workspace dependency 或 install 变化；任务报告必须说明。
- `git diff --check` 是否通过。

## 9. 最终任务报告

任务完成后新建中文报告：

```text
tasks/67-rendercore-vnicore-symbol-animation-[utctime].md
```

报告必须包含：

- 实际修改文件清单。
- `L1` VNI manifest 配置摘要，包括 `project`、`stageRect`、`playback`。
- rendercore manifest / VNI animation adapter 的实现说明。
- symbolsviewer `game003-s1` 预览接入说明。
- game003 runtime 接入说明。
- generated 文件是否更新。
- `agents.md` 是否更新；若未更新，说明为什么没有必要。
- `pnpm-lock.yaml` 是否变化。
- 完整命令执行记录和结果。
- 浏览器验收结果；若由用户验收，写明未代验的 URL 和检查点。
- 二次遗漏检查结论。
- 已知风险或后续建议。

报告命名示例：

```bash
UTC_TIME="$(date -u +%y%m%d-%H%M%S)"
touch "tasks/67-rendercore-vnicore-symbol-animation-${UTC_TIME}.md"
```

## 10. 验收标准

本任务只有在以下条件全部满足后才算完成：

- `packages/rendercore` 可导出并测试通过 symbol manifest helper。
- `packages/rendercore` 可导出并测试通过 VNI-backed symbol animation resolver / ani。
- `apps/symbolsviewer` 能选择 `game003-s1`，并能预览 `L1` 的 VNI win 动画。
- `apps/game003` 的 `L1` win 状态通过 manifest 触发 VNI 动画，中奖播放顺序仍按 `bg-wins.usedResults`。
- `assets/game003-s1/L1-wins.json` 和 `assets/game003-s1/assets/*` 被静态配置和 loading 资源纳入。
- 所有缺资源、缺 manifest、非法配置、VNI 初始化失败都显式失败。
- app 内没有重复实现 manifest parser 或 VNI 播放状态机。
- 生成文件由命令生成，`check:static-config` 通过。
- 任务报告已按要求写入 `tasks/`。
