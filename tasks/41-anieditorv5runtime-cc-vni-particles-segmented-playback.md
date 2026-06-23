# anieditorv5runtime-cc VNI particles segmented playback 任务计划

## 1. 任务目标

更新 Cocos Creator 3.8.6 runtime：

```text
/Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
```

把最新动画编辑器和 Pixi/VNI runtime 已经落地的能力迁移到 Cocos runtime，重点是：

- 支持新版 VNI/V5G 导出中的 animation type：
  - `particle_wall`
  - `particle_combo`
  - `squash_stretch`
- 保留并继续支持已有 animation type：
  - `particles`
  - `particle_twinkle`
  - `scale_in`
  - `scale_out`
  - `pop`
  - `blink`
  - 以及当前 `anieditorv5runtime-cc` 已支持的基础位移、缩放、旋转、透明度动画。
- 支持三段式高级播放：
  - start 段：从 `0s` 播放到 `loopStart`
  - loop 段：停在 `loopStart === loopEnd` 的单帧，或在 `[loopStart, loopEnd)` 区间循环
  - end 段：用户显式请求结束后，从 `loopEnd` 播放到 `project.stage.duration`
- 支持粒子运行时语义：
  - loop 段中非粒子动画可以停帧或循环。
  - 粒子发射器按当前 loop 点或 loop 区间维持发射配置。
  - 已经发射出去的粒子按真实 `deltaSeconds` 继续运动、淡出、消失。
  - end 段结束后发射器停止，已有粒子继续排空，排空后才算视觉完成。
- 以 `standalone/anieditorv5runtime-cc.ts` 为主要交付面。模块化源码通过不代表完成；standalone 单文件、standalone parity test、`standalone.zip` 都必须正确。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成代码迁移、测试、standalone 交付、文档同步、协作规则同步判断和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/41-anieditorv5runtime-cc-vni-particles-segmented-playback-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/41-anieditorv5runtime-cc-vni-particles-segmented-playback-260623-123456.md
```

## 2. 仓库和环境约束

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
- 新增空目录必须放 `.keepme`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。如果确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，再使用上面的代理环境变量重试。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short
git diff --stat
```

当前仓库同时存在：

```text
AGENTS.md
agents.md
```

如果本任务更新长期协作规则，必须同步更新这两个文件，并保持内容一致。原因和差异必须写入任务报告。

## 3. 当前实现事实

执行时必须重新阅读当前实现，以实际代码为准。当前已经观察到的相关事实如下。

`packages/anieditorv5runtime-cc` 当前已有：

```text
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/src/core/*
packages/anieditorv5runtime-cc/src/cocos/*
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/standalone.zip
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/*
```

当前 `package.json` 已有命令：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

当前 `standalone/anieditorv5runtime-cc.ts` 的硬边界：

- 只能 import Cocos Creator 内置 `"cc"`。
- 不能有相对 import、workspace import、Node builtins、Pixi、DOM、`window`、`document`。
- 不能绑定 `JsonAsset`、不能调用 `resources.load()`。
- runtime 单文件不能包含 decorated Component。
- standalone 需要保持 ES2015 兼容，特别是不能出现 `.includes(...)`。
- `scripts/check-standalone.mjs` 是此边界的自动守卫，新增 public API 时必须同步更新 required exports。

当前模块化 Cocos 入口也有边界：

- `src/cocos/cocos-node-driver.ts` 可以 runtime import `"cc"`。
- `src/cocos/types.ts` 可以保留 `import type { Node, SpriteFrame } from "cc"`，因为 type-only import 会被擦除。
- 其它 `src/core/*`、`src/cocos/player.ts`、`src/index.ts` 不应 runtime import `"cc"`。
- package 根入口不要 runtime re-export 真实 Cocos driver 或依赖真实 `"cc"` 的 factory；真实 Cocos driver 留在 `./cocos` 子入口或 standalone 文件里。

当前 Cocos runtime 已有能力：

- `V5G_0.x` / `VNI_0.x` schema 校验。
- Cocos Creator `3.8.6` engine target 校验。
- `runtime_50` 的 `fileWidth` / `fileHeight` / `fileScale` metadata 校验。
- `playRange(...)`、playback marker、completion listener。
- open-ended range：`end` 省略、`undefined` 或 `-1` 表示播放到 `project.stage.duration`。
- `particles` 和 `particle_twinkle` 基础粒子采样。

当前 Cocos runtime 尚未具备或需要调整的点：

- `V5GAnimationType`、校验和采样还缺少 `particle_wall`、`particle_combo`、`squash_stretch`。
- `sampleProjectAtTime(...)` 还缺少 `baseOpacity`、scale-entry 首帧抑制，以及 `particle_combo.sourceOpacity` 所需的源图层/粒子透明度分离。
- 当前 `drawParticles(...)` 每帧清理并重建粒子节点，适合 deterministic seek，但不能表达 live 粒子继续运动和排空。
- 当前 Cocos 粒子放在全局 `V5G Particles` 顶层，不能保证每个 image layer 的粒子紧跟该 layer 后面。
- 当前 completion 是时间轴到达终点就触发；新语义要求非循环 timeline/range/segmented 都在 live 粒子排空后才触发视觉完成。
- 当前 public API 还没有 `play({ mode: "segmented", ... })`、`requestSegmentedPlaybackEnd()`、`getPlaybackState()`。

`packages/vnicore` 已有可参考实现：

```text
packages/vnicore/src/core/playback-sequence.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/core/playback-sequence.test.ts
packages/vnicore/tests/core/particle-runtime.test.ts
packages/vnicore/docs/api-zh.md
packages/vnicore/examples/segmented-playback.ts
```

这些文件只能作为迁移基准和测试语义参考。`packages/anieditorv5runtime-cc` 的生产代码和 standalone runtime 不得运行时依赖 `@slotclientengine/vnicore`，原因是 Cocos runtime 必须可单文件复制，且不能混入 Pixi runtime 边界。

## 4. 必须实现的行为契约

### 4.1 schema、engine 和资源契约

必须继续接受：

- `schemaVersion` 为 `V5G_0.x`
- `schemaVersion` 为 `VNI_0.x`
- `editor.name` 为 `victory_editor_v5_g`
- `editor.name` 为 `VNI`
- `engineTarget.name === "cocos_creator"`
- `engineTarget.version === "3.8.6"`

必须继续显式失败：

- 非 `V5G_0.x` / `VNI_0.x` schema。
- 非 Cocos Creator engine target。
- 非 `center` 坐标。
- top-level `project.particles` 非空。
- `group` layer、非空 `parentId`、非空 `keyframes`。
- 未知资源、未知 animation type、未知 easing、未知 blend mode。
- 缺失必须 numeric param。
- numeric param 是字符串。
- Cocos SpriteFrame 读得到尺寸时，与 JSON `fileWidth/fileHeight` 或 `width/height` 不一致。

`runtime_50` 契约必须保留：

- `asset.fileWidth`、`asset.fileHeight`、`asset.fileScale` 必须全部存在或全部不存在。
- 存在时真实 SpriteFrame 文件尺寸按 `fileWidth/fileHeight` 校验。
- Cocos 节点内容尺寸仍使用逻辑 `asset.width/height`。
- `fileScale` 只作为 metadata / profile 对齐诊断，不额外参与节点缩放。

### 4.2 新 animation type 契约

必须新增 `squash_stretch`：

- 加入 `V5GAnimationType` 和 supported animation type 列表。
- 默认 easing 为 `easeOutQuad`。
- 必须 numeric params：
  - `squashAngle`
  - `squashAmount`
  - `decayOscillateCount`
  - `fromX`
  - `fromY`
  - `toX`
  - `toY`
- 行为以 `packages/vnicore/src/core/animation-sampler.ts` 当前实现为参考。

必须新增 `particle_wall`：

- 加入 `V5GAnimationType` 和 particle animation type 列表。
- 必须 numeric params：
  - `emitterWidth`
  - `direction`
  - `spreadAngle`
  - `speed`
  - `lifetimeMin`
  - `lifetimeMax`
  - `spawnRate`
  - `size`
  - `gravity`
  - `startScaleMin`
  - `startScaleMax`
  - `endScaleMin`
  - `endScaleMax`
- 可选 boolean param：
  - `fadeOut`，缺省为 `true`
- 需要支持 live runtime elapsed，让 loop 停帧时仍能持续发射。

必须新增 `particle_combo`：

- 加入 `V5GAnimationType` 和 particle animation type 列表。
- 默认 easing 为 `easeInOutQuad`。
- 必须 numeric params：
  - `count`
  - `size`
  - `sourceOpacity`
  - `spawnMode`
  - `spawnRadius`
  - `spawnRatio`
  - `targetX`
  - `targetY`
  - `travelMode`
  - `curve`
  - `orbitRadius`
  - `orbitTurns`
  - `orbitSpeed`
  - `orbitRatio`
  - `staggerRatio`
  - `trailCount`
  - `trailSpacing`
  - `trailFade`
  - `vanishMode`
  - `vanishRatio`
  - `flashScale`
  - `flashIntensity`
- `sourceOpacity` 只控制源 image layer 的显示透明度，不能误杀 combo 粒子。
- combo 粒子 alpha 应使用 layer `baseOpacity`，而不是被 `sourceOpacity=0` 后的源图层 `opacity` 误杀。
- `targetY` 方向和编辑器 / vnicore 保持一致，迁移时必须用测试锁住。

### 4.3 普通图层采样和粒子采样契约

`sampleProjectAtTime(...)` 必须与新版 VNI 语义对齐：

- `SampledLayerState` 增加 `baseOpacity`。
- `renderImageDisplay` 由普通图层采样结果决定，active particle 不能自动隐藏源图层。
- `particle_combo.sourceOpacity` 可以改变源图层 opacity，但粒子采样仍能基于 `baseOpacity` 出现。
- scale-entry 首帧需要抑制，例如 `scale_up` / `scale_in` / `bounce_in` 的近 0 起始缩放不应在 `0s` 漏出可见内容。
- 粒子 animation 在 `time < start`、`time >= start + duration`、`progress <= 0` 时不渲染，避免 0 秒首帧漏出。

Cocos 坐标契约：

- Cocos runtime 使用中心坐标，节点位置直接使用 `transform.x/y`。
- 不要把 vnicore/Pixi 的 `editorToPixi(...)` 坐标转换照搬进 Cocos live 粒子实现。
- Cocos 粒子最终位置应为源 layer 的 Cocos 位置加 particle offset。

### 4.4 Cocos 粒子节点层级契约

必须把粒子从全局最顶层语义改成 per-layer 语义：

- 每个 image layer 拥有自己的 particle container。
- 该 particle container 必须紧跟源 image node 后面。
- 多层图层时，顺序应是：

```text
Layer A image
Layer A particles
Layer B image
Layer B particles
...
```

不要为了旧测试继续把所有粒子放入全局 `V5G Particles` 顶层。如果旧测试期望全局顶层粒子，需要修改测试以符合新契约，不要为了测试保留错误生产结构。

粒子节点渲染要求：

- 粒子复用当前图层同一个 `SpriteFrame`。
- 粒子节点内容尺寸使用逻辑 `asset.width/height`。
- 粒子 scale、rotation、opacity、blendMode 按 particle sample 写入。
- 已知 blend mode 仍按当前 Cocos 稳定策略处理：接受数据值，但不要写 Sprite blend factor；实际保持 Cocos 默认 normal 渲染。

### 4.5 三段式播放契约

建议新增或对齐以下 public API：

```ts
export type V5GCocosPlaybackMode = "timeline" | "range" | "segmented";

export type V5GCocosSegmentedPlaybackPhase =
  | "idle"
  | "start"
  | "loop"
  | "ending"
  | "particle-draining"
  | "complete";

export interface V5GCocosSegmentedPlaybackOptions {
  mode: "segmented";
  loopStart: V5GCocosPlaybackPoint;
  loopEnd: V5GCocosPlaybackPoint;
  keepParticlesAlive?: boolean;
}

export type V5GCocosPlayOptions =
  | { mode?: "timeline" }
  | ({ mode: "range" } & V5GCocosPlayRangeOptions)
  | V5GCocosSegmentedPlaybackOptions;
```

`V5GCocosPlayer.play()` 必须保持无参旧行为，同时支持：

```ts
player.play();
player.play({ mode: "timeline" });
player.play({ mode: "range", range, loop });
player.play({
  mode: "segmented",
  loopStart: { unit: "time", at: 3 },
  loopEnd: { unit: "time", at: 3 },
  keepParticlesAlive: true,
});
```

必须新增：

```ts
player.requestSegmentedPlaybackEnd();
player.getPlaybackState();
```

输入约束：

- `loopStart` 和 `loopEnd` 可用 time 或 frame 表达。
- time 必须是 finite number。
- frame 必须是 non-negative integer，且必须显式提供 positive finite `fps`。
- 必须满足 `0 <= loopStart <= loopEnd <= project.stage.duration`。
- `loopStart === loopEnd` 合法，表示 loop 段停在单帧。
- `loopStart < loopEnd` 合法，表示 loop 段区间循环。
- 不允许静默 clamp、替换默认值或继续播放。

运行语义：

- segmented start 从 `0s` 播放到 `loopStart`。
- 到达 `loopStart` 后进入 loop phase。
- `loopStart === loopEnd` 时，非粒子动画保持在该帧。
- `loopStart < loopEnd` 时，非粒子动画在 `[loopStart, loopEnd)` 区间循环。
- loop phase 不受 `setLoop(false)` 影响，必须等待用户调用 `requestSegmentedPlaybackEnd()`。
- 用户请求结束后，从 `loopEnd` 播到 `project.stage.duration`。
- 进入 end 段时不能清空已有粒子。
- end 段结束后停止发射器，进入 `particle-draining`。
- 粒子排空后进入 `complete`，再触发 `onPlaybackComplete(...)`。

`keepParticlesAlive`：

- 默认值必须是 `true`。
- `true` 时，loop phase 的发射器配置跟随 loop 点或 loop 区间，但 live 粒子用真实 `deltaSeconds` 持续老化和运动。
- `false` 时，可以保持 deterministic seek 式采样，但必须清楚测试并文档化。

### 4.6 update、pause、seek、completion 契约

Cocos runtime 不使用 RAF，不使用 `setTimeout`，不使用 Promise 计时，不使用 Cocos tween 驱动内部时间。宿主 Component 继续在 `update(deltaTime)` 中调用：

```ts
player.update(deltaTime);
```

必须保持：

- `update(deltaSeconds)` 对非法 delta 显式失败。
- marker 和 completion listener 同步触发，callback 抛错不得被吞掉。
- `seek(...)`、`init()`、`restart()` 不触发 marker。
- 单次大 delta 跨多个 marker 时按时间从小到大触发。

新增要求：

- 粒子排空期间，主时间轴可以不再 `playing`，但 `update(deltaSeconds)` 仍要能推进 particle drain。
- `getPlaybackState().isDrainingParticles` 是判断粒子排空的可靠字段。
- `getPlaybackState().liveParticleCount` 返回当前 live 粒子节点数量。
- `getPlaybackState().phase` 返回 `particle-draining` / `complete` 等视觉状态。
- `pause()` 应冻结主时间轴和粒子 drain。
- `seek()` / `restart()` / `destroy()` 必须清理 live 粒子状态和粒子节点。

## 5. 实施范围

### 5.1 必须修改的源码

优先按下面路径实施，执行时可根据代码实际结构调整，但任务报告必须说明调整原因。

核心类型和采样：

```text
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/particle-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/index.ts
```

新增或迁移纯状态机：

```text
packages/anieditorv5runtime-cc/src/core/playback-sequence.ts
packages/anieditorv5runtime-cc/src/core/particle-runtime.ts
```

注意：

- 允许参考 `packages/vnicore/src/core/playback-sequence.ts`。
- `particle-runtime.ts` 可以复用状态管理思路，但 Cocos 位置转换不能复用 Pixi 的 `editorToPixi(...)`。
- 生产代码不得 import `@slotclientengine/vnicore`。

Cocos adapter：

```text
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/src/index.ts
```

standalone：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone.zip
```

文档：

```text
packages/anieditorv5runtime-cc/README.md
```

如果实现后形成长期协作规则，必须同步：

```text
AGENTS.md
agents.md
```

建议更新协作规则，因为现有规则只强调 `packages/vnicore` 拥有 Pixi/VNI 播放状态机；本任务完成后还需要明确：

- `packages/vnicore` 拥有 Pixi runtime 实现。
- `packages/anieditorv5runtime-cc` 拥有 Cocos Creator / standalone runtime 的对等迁移实现。
- Cocos runtime 不运行时依赖 `vnicore`。
- `apps/anieditorv5viewer` 仍只能做 UI 配置、输入校验、状态展示和调用，不能复制播放状态机。

### 5.2 必须新增或更新的测试

核心测试：

```text
packages/anieditorv5runtime-cc/tests/core/animation-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/particle-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/project-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
packages/anieditorv5runtime-cc/tests/core/playback-sequence.test.ts
packages/anieditorv5runtime-cc/tests/core/particle-runtime.test.ts
```

Cocos player 测试：

```text
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
```

standalone 测试：

```text
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
```

必须覆盖：

- `particle_wall` 校验、采样和 live elapsed。
- `particle_combo.sourceOpacity = 0` 时源图层可隐藏，但 combo 粒子仍存在。
- `squash_stretch` 采样输出。
- `progress <= 0` 粒子不渲染。
- scale-entry 首帧不漏内容。
- per-layer particle container 顺序。
- 全局 top particle root 不再承载真实粒子。
- `play({ mode: "segmented" })` 单帧 hold。
- `play({ mode: "segmented" })` 区间 loop。
- `requestSegmentedPlaybackEnd()` 非 active segmented 时显式失败。
- end 段到终点后 particle-draining。
- 粒子排空后触发 completion listener。
- `pause()` 冻结 drain，`seek()` / `restart()` / `destroy()` 清理 drain。
- `playRange(...)` 旧行为仍可用。
- `play()` 无参旧行为仍可用。
- standalone 与 modular runtime 的 public API、校验、采样、player 行为 parity。

### 5.3 测试 fixtures

将当前新版导出作为 Cocos runtime fixtures，至少覆盖：

```text
docs/anieditor5/export/2x.json
docs/anieditor5/export/5x.json
docs/anieditor5/export/10x.json
docs/anieditor5/export/respin.json
docs/anieditor5/export/scatter1.json
docs/anieditor5/export/scatter2.json
docs/anieditor5/export/multipay.json
docs/anieditor5/export2/runtime_50/project.json
```

同时必须保留旧导出回归 fixture，不能因为支持新版 VNI 而丢掉已有 V5G 覆盖：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/bigwin.json
docs/anieditor5/export/megawin.json
docs/anieditor5/export/superwin.json
```

推荐复制到：

```text
packages/anieditorv5runtime-cc/tests/fixtures/project.json
packages/anieditorv5runtime-cc/tests/fixtures/bigwin.json
packages/anieditorv5runtime-cc/tests/fixtures/megawin.json
packages/anieditorv5runtime-cc/tests/fixtures/superwin.json
packages/anieditorv5runtime-cc/tests/fixtures/2x.json
packages/anieditorv5runtime-cc/tests/fixtures/5x.json
packages/anieditorv5runtime-cc/tests/fixtures/10x.json
packages/anieditorv5runtime-cc/tests/fixtures/respin.json
packages/anieditorv5runtime-cc/tests/fixtures/scatter1.json
packages/anieditorv5runtime-cc/tests/fixtures/scatter2.json
packages/anieditorv5runtime-cc/tests/fixtures/multipay.json
packages/anieditorv5runtime-cc/tests/fixtures/export2-runtime-50.json
```

Cocos package 测试可以继续用 fake SpriteFrame 按 JSON asset metadata 生成尺寸，不需要把 PNG 全部复制到 package。若新增真实图片尺寸检查脚本，则必须说明输入路径和输出结果。

执行时用下面命令生成导出摘要，并把结果写入任务报告：

```bash
node -e 'const fs=require("fs"); const path=require("path"); const dir="docs/anieditor5/export"; const files=fs.readdirSync(dir).filter(f=>f.endsWith(".json")).sort(); const allAssets=new Set(); for (const f of files){ const j=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8")); const typeCounts={}; const paramKeys={}; for (const l of j.layers||[]){ for (const a of l.animations||[]){ typeCounts[a.type]=(typeCounts[a.type]||0)+1; paramKeys[a.type]=Array.from(new Set([...(paramKeys[a.type]||[]), ...Object.keys(a.params||{})])).sort(); } } for (const a of j.assets||[]) allAssets.add(a.path); console.log(JSON.stringify({file:f,name:j.name,schemaVersion:j.schemaVersion,editor:j.editor,layers:(j.layers||[]).length,assets:(j.assets||[]).length,particles:(j.particles||[]).length,animationTypes:typeCounts,paramKeys},null,2)); } console.log("uniqueAssets", allAssets.size);'
```

## 6. 实施步骤

### 6.1 准备和差异确认

1. 执行：

```bash
git status --short
git diff --stat
```

2. 阅读当前 Cocos runtime：

```bash
rg -n "particle_wall|particle_combo|squash_stretch|segmented|ParticleRuntime|sourceOpacity|renderImageDisplay|baseOpacity" packages/anieditorv5runtime-cc packages/vnicore apps/anieditorv5viewer docs/anieditor5/src
```

3. 对照 `packages/vnicore` 当前实现和 `tasks/38-*`、`tasks/40-*` 报告，确认最新语义，不要凭旧记忆实现。
4. 检查 `cc` import 边界：

```bash
rg -n "from [\"']cc[\"']|import\([\"']cc[\"']\)" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/standalone
```

期望只出现：

- `packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts` 的 runtime import。
- `packages/anieditorv5runtime-cc/src/cocos/types.ts` 的 type-only import。
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 的 runtime import。
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts` 的示例 Component import。

### 6.2 迁移核心类型、校验和 sampler

1. 更新 `src/core/types.ts`：
   - 新增 `particle_wall`、`particle_combo`、`squash_stretch`。
   - 如果新增 `VNI*` alias，必须不破坏现有 `V5G*` public 类型。
2. 更新 `src/core/animation-sampler.ts`：
   - 新增默认 easing。
   - 新增 `squash_stretch`。
   - 新增 `particle_combo.sourceOpacity` 对源图层 opacity 的影响。
   - 保持未知 type 显式失败。
3. 更新 `src/core/project-sampler.ts`：
   - 增加 `baseOpacity`。
   - 调整 `renderImageDisplay`。
   - 增加 scale-entry 首帧抑制。
4. 更新 `src/core/particle-sampler.ts`：
   - 新增 `particle_wall`、`particle_combo`。
   - 新增 runtime elapsed 采样入口。
   - 保持 `progress <= 0` 不渲染。
   - 保持 numeric param 缺失显式失败。
5. 更新 `src/core/validation.ts`：
   - 新增必需 numeric params 和可选 boolean params。
   - 保持 numeric string 不解析。
   - 不因为新版导出而放宽未知字段或未知类型。

### 6.3 迁移播放状态机和 live 粒子 runtime

1. 新增 `src/core/playback-sequence.ts`：
   - 实现 range normalize、point normalize、segmented normalize。
   - 实现 `V5GCocosSegmentedPlaybackSequence` 或使用通用命名。
   - `loopStart === loopEnd` 必须合法。
   - `loopStart > loopEnd`、越界、NaN、非法 frame/fps 必须显式失败。
2. 新增 `src/core/particle-runtime.ts`：
   - 保存 live animation elapsed。
   - 支持 `emit(...)` deterministic frame。
   - 支持 `emitLive(...)` loop phase 连续推进。
   - 支持 `beginDrain()` 和 `advanceDrain(deltaSeconds)`。
   - drain duration 至少覆盖 `particle_wall.lifetimeMax`、`particle_twinkle.twinkleDuration`、`particle_combo.duration`、旧 `particles.duration`。
3. 不要在 core runtime 中写 Pixi 坐标转换。Cocos player 负责把 layer transform 转成 Cocos position。

### 6.4 更新 Cocos player

1. 更新 public API：
   - `play(options?: V5GCocosPlayOptions)`
   - `playRange(options)`
   - `requestSegmentedPlaybackEnd()`
   - `getPlaybackState()`
2. 保持旧 API：
   - `play()`
   - `pause()`
   - `restart()`
   - `seek(time)`
   - `setLoop(loop)`
   - `update(deltaSeconds)`
   - marker 和 complete listener。
3. 重构粒子节点：
   - `ManagedLayer` 增加 per-layer particle container。
   - 粒子 container 紧跟 image node 插入。
   - 移除或停用全局真实粒子 root。
   - 复用粒子节点数组，避免每帧无谓 destroy/create；如果仍采用重建，必须解释 Cocos 性能风险并保证 live/drain 语义正确。
4. 更新 `update(deltaSeconds)`：
   - 主时间轴 playing 时推进 timeline/range/segmented。
   - particle-draining 时即使 `playing === false` 也可推进 drain，除非 pause 冻结。
   - marker 和 completion 时机与契约一致。
5. 更新 `seek()` / `restart()` / `destroy()`：
   - 清理 segmented state、active range、pending complete、particle runtime、particle nodes。
   - `seek()` 是 deterministic preview，不保留 live 粒子状态。

### 6.5 更新 standalone 单文件

standalone 是本任务最重要的交付面。必须做到：

1. 把模块化源码的新能力同步到：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

2. 不允许 standalone 通过 import 引用 `src/*`、`dist/*`、`@slotclientengine/*` 或 `vnicore`。
3. 保持唯一 import：

```ts
import { ... } from "cc";
```

4. 避免 `.includes(...)`，用 ES2015 兼容 helper，例如 `hasStringValue(...)`。
5. 更新 `scripts/check-standalone.mjs` required exports，至少包含新增 API 和类型：
   - segmented play options
   - playback state
   - particle runtime / live sampler public helper 如有导出
   - `requestSegmentedPlaybackEnd`
   - `getPlaybackState`
6. 更新 standalone parity tests，确保 modular 和 standalone 行为一致。
7. 重新生成 `standalone.zip`，命令在 package 目录下执行：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
```

`zipinfo -1` 输出必须写入任务报告，确认没有 macOS metadata、旧文件或无关文件。

### 6.6 更新示例和 README

更新：

```text
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

README 必须说明：

- 新增 animation type 支持范围。
- 三段式播放 API 示例。
- `requestSegmentedPlaybackEnd()` 示例。
- `getPlaybackState()` 和 particle-draining 语义。
- `onPlaybackComplete(...)` 是视觉完成，不只是时间轴到终点。
- standalone 优先于 workspace package 作为 Cocos Creator 交付面。
- runtime 不负责 `JsonAsset` 加载、资源发现、manifest/profile 选择。
- 缺失资源、未知 type/easing/blend mode、numeric string 等显式失败。
- Cocos blend mode 当前仍保持默认 normal 渲染策略。

示例 Component 可增加 segmented preview，但不要把 runtime 单文件变成 decorated Component。

## 7. 验收命令

任务相关 package 必须执行：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

仓库根命令必须执行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
pnpm format:check
```

如果根 `pnpm format:check` 因任务范围外既有文件或生成产物失败，不要为了本任务改无关代码。必须：

- 保证 `pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check` 通过。
- 在任务报告中记录根 format 失败的具体路径。
- 说明这些路径是否与本任务无关。

standalone zip 验收：

```bash
cd packages/anieditorv5runtime-cc
zipinfo -1 standalone.zip
```

工作区检查：

```bash
git status --short
git diff --stat
```

如果更新了 `AGENTS.md` / `agents.md`，必须执行：

```bash
diff -u AGENTS.md agents.md
```

该命令无输出才算两个协作规则文件一致。

`cc` import 边界验收：

```bash
rg -n "from [\"']cc[\"']|import\([\"']cc[\"']\)" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/standalone
```

任务报告必须记录输出，并说明每一处是否符合边界。

## 8. 最低测试断言清单

测试必须至少证明：

- `docs/anieditor5/export/project.json`、`bigwin.json`、`megawin.json`、`superwin.json` 旧 fixture 仍通过校验和关键采样。
- `docs/anieditor5/export/multipay.json` 能通过 `assertV5GProject` / `validateCocosV5GProject`。
- `docs/anieditor5/export/scatter1.json` 和 `scatter2.json` 能通过校验。
- `particle_wall` 缺任意必需 numeric param 会失败。
- `particle_combo` numeric param 字符串会失败。
- `squash_stretch` unknown easing 会失败。
- `particle_combo.sourceOpacity = 0` 时：
  - source image display opacity 可为 0。
  - combo particles 数量大于 0。
- `particle_wall` 在 segmented hold loop 中，经过多次 `update(deltaSeconds)` 后仍有 live particle，并且粒子样本不是完全冻结的同一帧。
- `requestSegmentedPlaybackEnd()` 后进入 ending，再进入 particle-draining，最后 complete。
- `onPlaybackComplete(...)` 在 particle drain 完成后触发。
- Cocos fake root 中 per-layer particle container 紧跟对应 layer node。
- `standalone/anieditorv5runtime-cc.ts` 与 modular `src/*` 对同一 fixture 的采样结果一致。
- standalone player 与 modular player 的 segmented playback 状态一致。
- `scripts/check-standalone.mjs` 能阻止 `.includes(...)`、相对 import、workspace import、DOM/Node/Pixi import 回流。
- `src/core/*` 不引入真实 `"cc"` runtime import，package 根入口仍保持环境安全。

如果测试要求生产代码写入奇怪兼容分支，应修改测试，不要改不该改的生产逻辑。runtime 必须 fail-fast，不要加入不必要的兜底。

## 9. 非目标和禁止项

本任务不做：

- 不创建 `apps/anieditorv5viewer-cc`。
- 不创建假 Cocos Creator 项目。
- 不在 standalone runtime 里加载 `JsonAsset`。
- 不在 runtime 里调用 `resources.load()`。
- 不自动猜测资源路径。
- 不把 `@slotclientengine/vnicore` 作为 Cocos runtime 生产依赖。
- 不把 Pixi 坐标转换用于 Cocos 节点位置。
- 不恢复或发明 Cocos blend factor / material adapter；已知 blend mode 仍按默认 normal 渲染。
- 不为了测试通过而静默跳过未知动画、未知 easing、未知 blend mode 或缺失资源。
- 不把 numeric string 当成 number。
- 不吞掉 callback 异常。
- 不修改无关包来追求根 format 通过。

## 10. 任务报告要求

完成后新增：

```text
tasks/41-anieditorv5runtime-cc-vni-particles-segmented-playback-[utctime].md
```

报告必须包含：

- UTC 时间戳。
- 执行者。
- 对应任务计划路径。
- 修改文件清单，按核心、Cocos adapter、standalone、测试、文档、协作规则分类。
- 新 public API 摘要。
- 粒子和 segmented playback 语义摘要。
- fixtures 同步来源和导出摘要。
- `standalone.zip` 内容列表。
- `cc` import 边界检查输出和结论。
- 真实 Cocos Creator 3.8.6 编辑器导入验收是否执行；如果未执行，必须明确写“未执行真实编辑器导入验收”，并说明本次用 standalone/typecheck/fake cc/parity 测试替代的范围。
- 是否更新 `AGENTS.md` / `agents.md`，以及原因。
- 是否新增依赖，`pnpm-lock.yaml` 是否变化。
- 所有验收命令的结果。
- 如果某条命令失败：
  - 失败命令。
  - 失败原因。
  - 是否与本任务相关。
  - 已采取的处理。
- 第二遍遗漏检查结果。

## 11. 第二遍遗漏检查

交付前必须逐项检查并在任务报告中记录：

- 任务计划文件 `tasks/41-anieditorv5runtime-cc-vni-particles-segmented-playback.md` 存在。
- 任务报告按 UTC 命名存在。
- 旧 V5G fixture：`project` / `bigwin` / `megawin` / `superwin` 回归仍覆盖。
- `particle_wall` / `particle_combo` / `squash_stretch` 类型、校验、采样、测试都已覆盖。
- `baseOpacity`、`sourceOpacity`、`renderImageDisplay` 语义正确。
- 0 秒首帧粒子和 scale-entry 漏出已覆盖。
- per-layer 粒子层级已覆盖。
- global particle root 旧测试已按新契约修改。
- segmented single-frame hold 已覆盖。
- segmented range-loop 已覆盖。
- `keepParticlesAlive` 默认 true 已覆盖。
- `requestSegmentedPlaybackEnd()` 非法状态显式失败已覆盖。
- particle-draining 和 visual complete 已覆盖。
- `play()` 无参、`playRange(...)`、open-ended range 旧行为仍覆盖。
- marker callback 和 complete callback 错误不被吞。
- `pause()`、`seek()`、`restart()`、`destroy()` 对 live 粒子的影响已覆盖。
- modular 和 standalone parity 已覆盖。
- `standalone:check` required exports 已同步。
- standalone 文件没有 `.includes(...)`、relative import、workspace import、Node/DOM/Pixi import。
- `cc` import 边界检查已记录，`src/core/*` 和 package 根入口没有真实 `"cc"` runtime import。
- `standalone.zip` 已重建并确认内容。
- README 和示例已同步。
- `AGENTS.md` 和 `agents.md` 是否需要更新已经判断；若更新，已执行 `diff -u AGENTS.md agents.md` 且无输出。
- 真实 Cocos Creator 3.8.6 编辑器导入验收状态已写入报告。
- 未新增不必要兜底。
- 未修改无关包。
- `git status --short` 只包含本任务相关变更或已在报告中说明的既有变更。
