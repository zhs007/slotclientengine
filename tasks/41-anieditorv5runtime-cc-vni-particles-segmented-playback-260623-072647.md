# anieditorv5runtime-cc VNI particles segmented playback 执行报告

UTC 时间：260623-072647

## 1. 执行结论

已按 `tasks/41-anieditorv5runtime-cc-vni-particles-segmented-playback.md` 执行并完成 `packages/anieditorv5runtime-cc` 的实现、standalone 交付、测试补齐和严格验收。

核心结果：

- Cocos runtime 新增 `particle_wall`、`particle_combo`、`squash_stretch`。
- `sampleProjectAtTime(...)` 新增 `baseOpacity`，并支持 `particle_combo.sourceOpacity` 只隐藏源图像、不清零粒子透明度。
- 粒子采样抑制 `progress <= 0` 首帧粒子，并抑制接近 0 scale 入场首帧漏图。
- Cocos player 新增 per-layer particle container，真实粒子挂在对应 image node 后面的 `<layer name> Particles` 容器；全局 `V5G Particles` 保持空占位。
- Cocos player 新增 segmented 播放：
  - `play({ mode: "segmented", loopStart, loopEnd, keepParticlesAlive })`
  - `requestSegmentedPlaybackEnd()`
  - `getPlaybackState()`
- non-loop timeline / range / segmented 到达结尾后会进入粒子排空；排空完成后才触发 `onPlaybackComplete(...)`。
- 新增 core `playback-sequence` 和 `particle-runtime`，Cocos runtime 没有生产依赖 `@slotclientengine/vnicore`。
- standalone 单文件同步更新，`scripts/check-standalone.mjs` 已增加 segmented / particle runtime public API 守卫。
- `standalone.zip` 已重建。

## 2. 主要改动路径

- `packages/anieditorv5runtime-cc/src/core/types.ts`
- `packages/anieditorv5runtime-cc/src/core/animation-sampler.ts`
- `packages/anieditorv5runtime-cc/src/core/project-sampler.ts`
- `packages/anieditorv5runtime-cc/src/core/particle-sampler.ts`
- `packages/anieditorv5runtime-cc/src/core/particle-runtime.ts`
- `packages/anieditorv5runtime-cc/src/core/playback-sequence.ts`
- `packages/anieditorv5runtime-cc/src/core/validation.ts`
- `packages/anieditorv5runtime-cc/src/cocos/player.ts`
- `packages/anieditorv5runtime-cc/src/cocos/types.ts`
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- `packages/anieditorv5runtime-cc/README.md`
- `packages/anieditorv5runtime-cc/scripts/check-standalone.mjs`
- `packages/anieditorv5runtime-cc/standalone.zip`

新增测试覆盖：

- `packages/anieditorv5runtime-cc/tests/core/playback-sequence.test.ts`
- `packages/anieditorv5runtime-cc/tests/core/particle-runtime.test.ts`
- `packages/anieditorv5runtime-cc/tests/core/particle-sampler.test.ts`
- `packages/anieditorv5runtime-cc/tests/fixtures/2x.json`
- `packages/anieditorv5runtime-cc/tests/fixtures/5x.json`
- `packages/anieditorv5runtime-cc/tests/fixtures/10x.json`
- `packages/anieditorv5runtime-cc/tests/fixtures/respin.json`
- `packages/anieditorv5runtime-cc/tests/fixtures/scatter1.json`
- `packages/anieditorv5runtime-cc/tests/fixtures/scatter2.json`
- `packages/anieditorv5runtime-cc/tests/fixtures/multipay.json`

## 3. 验收命令

package 级命令全部通过：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
```

package test 结果：

```text
Test Files  13 passed (13)
Tests       100 passed (100)
```

仓库根命令：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
```

以上全部通过。

根 `pnpm format:check` 执行失败，但失败路径不属于本任务范围，且本任务 package 自身 `format:check` 已通过。根 format 首个失败包为 `@slotclientengine/pixiani`：

```text
packages/pixiani/src/ani/index.ts
packages/pixiani/src/core/index.ts
packages/pixiani/src/index.ts
packages/pixiani/src/layout.ts
packages/pixiani/tests/layout.test.ts
packages/pixiani/tsconfig.build.json
packages/pixiani/tsconfig.eslint.json
```

同次根 format 输出还包含任务范围外生成覆盖率目录 warning，例如：

```text
apps/spine2victoryani-demo/coverage/...
apps/reelsviewer/coverage/...
```

未为了本任务修改这些无关路径。

## 4. standalone zip 验收

重建命令：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
```

`zipinfo -1 standalone.zip` 输出：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

确认没有 macOS metadata、旧文件或无关文件。

## 5. cc import 边界

命令：

```bash
rg -n "from [\"']cc[\"']|import\([\"']cc[\"']\)" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/standalone
```

输出：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts:9:} from "cc";
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts:1:import { _decorator, Component, JsonAsset, Node, SpriteFrame } from "cc";
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts:9:} from "cc";
packages/anieditorv5runtime-cc/src/cocos/types.ts:1:import type { Node, SpriteFrame } from "cc";
```

说明：

- `standalone/anieditorv5runtime-cc.ts` 只允许并只存在 `"cc"` import，符合 standalone 单文件边界。
- `standalone/V5GPreview.example.ts` 是 decorated Cocos Component 示例，不是 runtime 主体，允许绑定 `JsonAsset`。
- `src/cocos/cocos-node-driver.ts` 是真实 Cocos adapter，允许 runtime import `"cc"`。
- `src/cocos/types.ts` 是 type-only import，会被 TypeScript 擦除。
- `src/core/*` 和 `src/cocos/player.ts` 无 `"cc"` runtime import。

## 6. standalone 禁止项审计

执行：

```bash
rg -n "\.includes\s*\(|from [\"']\.\.?/|from [\"']@slotclientengine/|\bwindow\b|\bdocument\b|\brequire\s*\(|\bJsonAsset\b|\bresources\.load\b" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

结果：无输出。

`scripts/check-standalone.mjs` 也已通过：

```text
standalone runtime check passed
```

## 7. vnicore / Pixi 边界

执行：

```bash
rg -n "@slotclientengine/vnicore|pixi\.js|from [\"']pixi|editorToPixi|Pixi" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/standalone packages/anieditorv5runtime-cc/tests
```

结果仅命中既有坐标工具和测试说明：

```text
packages/anieditorv5runtime-cc/src/core/coordinates.ts:6:export function editorToPixi(
packages/anieditorv5runtime-cc/tests/cocos/coordinates.test.ts:8:  it("uses center coordinates without applying Pixi top-left conversion", () => {
packages/anieditorv5runtime-cc/tests/core/coordinates.test.ts:4:  editorToPixi,
packages/anieditorv5runtime-cc/tests/core/coordinates.test.ts:10:  it("keeps the Pixi reference conversion available for comparisons", () => {
packages/anieditorv5runtime-cc/tests/core/coordinates.test.ts:11:    expect(editorToPixi(100, 50, 1600, 1600)).toEqual({ x: 900, y: 750 });
```

没有 `@slotclientengine/vnicore`、`pixi.js` 或 Pixi runtime import。Cocos 粒子最终坐标由源 layer `transform.x/y` 加粒子 offset 得到，不使用 Pixi 左上角坐标转换。

## 8. 二次遗漏审计

已复查：

- `standalone/anieditorv5runtime-cc.ts`、模块化源码、standalone parity test 同步。
- 新 public API 已加入 `scripts/check-standalone.mjs` required exports。
- 新 fixture 覆盖 `2x`、`5x`、`10x`、`respin`、`scatter1`、`scatter2`、`multipay`。
- `particle_wall` 缺必需 numeric param 失败。
- `particle_combo` numeric param 为字符串失败。
- `squash_stretch` unknown easing 失败。
- `particle_combo.sourceOpacity = 0` 时源图像可隐藏，粒子仍按 `baseOpacity` 发射。
- segmented hold loop 中 live particles 会继续推进。
- `requestSegmentedPlaybackEnd()` 后进入 ending，再进入 particle-draining，排空后 complete。
- Cocos fake root 中 per-layer particle container 紧跟对应 layer node，全局 `V5G Particles` 为空。
- standalone player 与 modular player 的采样和 segmented playback state parity 已覆盖。
- `standalone.zip` 已重建并确认内容。
- 本任务没有更新仓库长期协作规则，因此未修改 `AGENTS.md` / `agents.md`。

## 9. 工作区状态摘要

`git diff --stat` 摘要：

```text
20 files changed, 3818 insertions(+), 431 deletions(-)
standalone.zip: 16148 -> 24325 bytes
```

另有新增源码、测试、fixture 和本报告文件未计入 `git diff --stat` 的 tracked diff 列表中，详见 `git status --short`。
