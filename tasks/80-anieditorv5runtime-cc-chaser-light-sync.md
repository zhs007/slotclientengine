# anieditorv5runtime-cc chaser light sync 任务计划

## 1. 任务目标

更新 Cocos Creator 3.8.6 runtime：

```text
/Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
```

把任务 78 已经在 `packages/vnicore` / `apps/anieditorv5viewer` 落地的 `chaser_light` 走马灯语义同步到 `packages/anieditorv5runtime-cc`。本任务重点是 Cocos runtime 的 copyable standalone 交付面，不能只改模块化源码：

```text
packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone.zip
```

任务完成后必须新增中文任务报告：

```text
tasks/80-anieditorv5runtime-cc-chaser-light-sync-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/80-anieditorv5runtime-cc-chaser-light-sync-260703-123456.md
```

本计划是完整可执行版本，不能依赖任何别的聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、standalone 交付、真实 Cocos 验收交接、协作规则判断和最终报告。

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。若确实新增或调整依赖，必须执行：

```bash
pnpm install
```

并在任务报告中说明 `pnpm-lock.yaml` 是否变化。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果 `pnpm --filter ...` 或 `pnpm exec ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。禁止通过缺资源静默跳过、未知动画退回 `idle`、未知 blend mode 退回 `normal`、自动猜资源路径、吞掉 Cocos driver 错误、或者保留旧测试预期来“跑通”。

## 3. 必须先阅读和确认的上下文

执行时必须重新阅读当前实现，以实际代码为准。至少阅读：

```text
agents.md
tasks/78-vnicore-editor-runtime-sync.md
tasks/78-vnicore-editor-runtime-sync-260703-100345.md
packages/vnicore/src/core/chaser-light-sampler.ts
packages/vnicore/tests/core/chaser-light-sampler.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/anieditorv5runtime-cc/package.json
packages/anieditorv5runtime-cc/.prettierignore
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/core/*
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
docs/anieditor5/export/roundreel.json
```

必须确认任务 78 的 git 更新。当前本地观察到任务 78 对应提交为：

```text
b90c27d fix: update schema version to VNI_0.042 in validation tests
```

执行时用下面命令重新确认，不要只相信本计划：

```bash
git log --oneline --decorate -- tasks/78-vnicore-editor-runtime-sync.md tasks/78-vnicore-editor-runtime-sync-260703-100345.md
git show --stat --name-status --oneline b90c27d
git diff b90c27d^ b90c27d -- packages/vnicore/src/core/chaser-light-sampler.ts packages/vnicore/tests/core/chaser-light-sampler.test.ts packages/vnicore/tests/pixi/vni-player.test.ts agents.md
git log --oneline --decorate -20 -- packages/vnicore/src/core/chaser-light-sampler.ts packages/vnicore/tests/core/chaser-light-sampler.test.ts packages/vnicore/tests/pixi/vni-player.test.ts agents.md
```

如果执行时 `b90c27d` 已不可用，用下面命令按文件历史重新定位任务 78 提交：

```bash
git log --oneline --decorate -- tasks/78-vnicore-editor-runtime-sync.md packages/vnicore/src/core/chaser-light-sampler.ts packages/vnicore/tests/core/chaser-light-sampler.test.ts agents.md
```

## 4. 当前已观察到的事实

以下事实是制定本计划时在本地观察到的结果。执行时必须重新验证。

### 4.1 任务 78 的修改范围

任务 78 完成了 `vnicore` / viewer 的走马灯同步，提交 `b90c27d` 修改范围包括：

```text
agents.md
apps/anieditorv5viewer/README.md
apps/anieditorv5viewer/src/assets/projects/roundreel.json
apps/anieditorv5viewer/tests/bundled-projects.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/examples/README.md
packages/vnicore/src/core/chaser-light-sampler.ts
packages/vnicore/tests/core/chaser-light-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/fixtures/export/*.json
packages/vnicore/tests/pixi/vni-player.test.ts
tasks/78-vnicore-editor-runtime-sync.md
tasks/78-vnicore-editor-runtime-sync-260703-100345.md
```

任务 78 的关键结论：

- `chaser_light` 灯位固定在轨迹采样点上，动画只推进亮灯/暗灯窗口。
- 圆形轨迹的 `spacing` 按弧长换算角度。
- 走马错位周期为 `lightDuration + interval`。
- 不要把 `elapsed` 加进轨迹点采样。
- viewer 不能私下复制或修正 runtime 算法。

### 4.2 vnicore 当前正确语义

`packages/vnicore/src/core/chaser-light-sampler.ts` 当前核心语义：

```text
elapsed = max(0, time - animation.startTime)
chasePeriod = max(lightDuration + interval, 0.001)
cycleDuration = chasePeriod * totalCount
cycleTime = positiveModulo(elapsed - index * chasePeriod, cycleDuration)
isLit = cycleTime < lightDuration
```

圆形轨迹：

```text
angle = index * spacing / max(radius, 1) - PI / 2
x = centerX + cos(angle) * radius
y = centerY + sin(angle) * radius
rotation = angle + PI / 2
```

直线和曲线轨迹：

- 使用 `ratio = index / (totalCount - 1)` 固定分布。
- 位置不随 `elapsed` 变化。
- 曲线用当前点到 `ratio + 0.01` 的方向计算 rotation。

亮灭显示：

- 亮灯 alpha：`sampledLayer.baseOpacity`
- 暗灯 alpha：`sampledLayer.baseOpacity * dimAlpha`
- 亮灯 scale：`baseScale * (1 + wave * 0.18)`
- 暗灯 scale：`baseScale`
- `wave = 0.7 + 0.3 * sin(cycleTime / lightDuration * PI)`
- 亮灯 blendMode：`add`
- 暗灯 blendMode：`sampledLayer.blendMode`
- `alpha <= 0.002` 的 sprite 可以不输出，但不能改变亮灯时序。

### 4.3 anieditorv5runtime-cc 当前漂移

当前 `packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts` 仍是旧语义：

- `cycleDuration = interval * totalCount + lightDuration`
- 每盏灯错位使用 `index * interval`
- `isLit` 使用 `cycleTime <= lightDuration`
- 圆形轨迹把 `elapsed * 2PI` 加进 angle，导致灯位整体旋转。
- 圆形轨迹使用 `index / totalCount * 2PI`，没有按编辑器/`vnicore` 的 `spacing / radius` 弧长语义排布。
- 圆形轨迹使用 `max(radius, spacing / (2PI))` 改写半径，这与任务 78 后的语义不一致。
- 亮灯 alpha 使用 `baseOpacity * (0.72 + wave * 0.28)`，任务 78 后应为 `baseOpacity`。
- 暗灯 scale 使用 `0.65 * baseScale`，任务 78 后应保持 `baseScale`。
- 亮灯 scale 使用 `1 + wave * 0.35`，任务 78 后应使用 `1 + wave * 0.18`。

当前 `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 内也包含同一份旧 sampler 逻辑，必须一起同步。

当前测试中存在旧预期名称：

```text
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
```

其中用例名包含：

```text
maps circular chaser_light samples to Cocos clockwise visual motion
```

这类测试应改成验证“固定灯位 + Cocos 坐标转换”，不能为了通过测试保留旧的旋转灯位。

### 4.4 fixture 和 standalone 交付现状

当前 `packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json` 与 `docs/anieditor5/export/roundreel.json` 字节一致，应保持。

制定本计划时，下面命令对部分 runtime-cc fixture 报告了字节差异：

```bash
for f in docs/anieditor5/export/*.json; do b=${f##*/}; if [ -f packages/anieditorv5runtime-cc/tests/fixtures/$b ]; then cmp -s "$f" "packages/anieditorv5runtime-cc/tests/fixtures/$b" || echo "$b differs"; fi; done
```

观察到的输出包括：

```text
10x.json differs
2x.json differs
3reel_multipay_01.json differs
3reel_multipay_02.json differs
5x.json differs
lock_01.json differs
multipay.json differs
project.json differs
respin.json differs
scatter1.json differs
scatter2.json differs
```

执行时必须分类这些差异：如果只是末尾换行或已知历史格式差异，也要在报告中说明；如果内容已经漂移，必须按 `docs/anieditor5/export` 作为导出源头同步到 runtime-cc fixtures，除非能证明该 fixture 是 runtime-cc 专用变体。`packages/anieditorv5runtime-cc/.prettierignore` 当前已忽略：

```text
coverage
dist
node_modules
standalone.zip
tests/fixtures/*.json
```

因此同步字节级 fixture 时不要用 Prettier 改写这些 JSON。

`standalone.zip` 当前存在，但被 `.gitignore` 的 `*.zip` 忽略。任务完成时必须直接验证：

```bash
test -f packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
```

不能用 `git status` 证明 zip 已交付。

## 5. 范围和非目标

### 5.1 必做范围

- 同步 `packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts` 到任务 78 后的 `vnicore` 走马灯语义。
- 同步 `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 内的 standalone sampler，保证 standalone 是主要正确交付面。
- 确认 `packages/anieditorv5runtime-cc/src/cocos/player.ts` 的节点池渲染仍复用已有 `chaserLightNodes`，不因为 sampler 更新每帧创建新节点。
- 更新 Cocos fake driver 测试，覆盖固定灯位、Cocos Y 轴反向映射、rotation 角度转换、`keepOriginal=false`、diagnostics 和节点销毁。
- 更新 standalone 测试，覆盖 standalone 的固定灯位语义，而不是只验证 modular 与 standalone 彼此相等。
- 更新或新增 core sampler 测试，直接覆盖 circular / linear / curved 轨迹点不随时间移动、`lightDuration + interval` 错位、暗灯 alpha/scale/blendMode 和 `dimAlpha=0` 时的输出行为。
- 审计 modular public export 面：`src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts`、standalone public exports 和 `tests/standalone/standalone-import.test.ts` 必须能暴露/验证 chaser sampler API。
- 更新 `scripts/check-standalone.mjs`，把 `chaser_light` 相关 public API / snippets 纳入 standalone 守护，而不是只靠 build 通过。
- 更新 `packages/anieditorv5runtime-cc/README.md` 中 `chaser_light` 描述，明确固定灯位、亮灭窗口和 standalone 使用边界。
- 审计 `packages/anieditorv5runtime-cc/tests/fixtures/*.json` 与 `docs/anieditor5/export/*.json` 的字节差异，保持 `roundreel` 等导出 fixture 源头一致。
- 重建并验证 `packages/anieditorv5runtime-cc/standalone.zip`。
- 判断是否需要更新 `agents.md`。如果本任务只是把 task 78 已写入 `agents.md` 的 `chaser_light` 长期规则同步到 runtime-cc，通常不需要新增规则；如果发现新的 Cocos/standalone 专属长期边界，必须更新 `agents.md` 并在报告中说明。

### 5.2 非目标

- 不修改 `packages/vnicore`，除非执行中发现任务 78 本身存在明确错误；若发现，必须先记录证据并单独评估，不能在本任务里偷偷改变 Pixi runtime 语义。
- 不让 `packages/anieditorv5runtime-cc` runtime import `@slotclientengine/vnicore`、`pixi.js`、Node 内置模块、DOM API 或 viewer 私有代码。
- 不新增 Cocos Component 装饰器、`JsonAsset` 绑定、`resources.load()` 或资源路径自动发现逻辑；Cocos 宿主项目仍负责 JSON 和 SpriteFrame / SpriteAtlas 资源绑定。
- 不通过放松校验、隐藏 fallback 或吞错来兼容旧走马灯视觉。
- 不新增 shader / Effect / Material 资产。`chaser_light` 继续使用当前图层同一张 `SpriteFrame` 的节点副本和已存在的 blend mode driver。
- 不做真实 Cocos Creator 编辑器自动验收，除非本机明确可用；若不可用，报告中必须把手工验收步骤和交付文件写清楚。

## 6. 实施步骤

### 6.1 预检

执行：

```bash
git status --short --untracked-files=all
git diff --stat
node -v
pnpm -v
```

确认：

- 工作区中已有用户改动不能回滚。
- Node 版本满足 `>=24.0.0`。
- 本任务不需要新增依赖；如需要，记录原因并执行 `pnpm install`。

### 6.2 确认 task 78 和当前差异

执行：

```bash
git show --stat --name-status --oneline b90c27d
git diff b90c27d^ b90c27d -- packages/vnicore/src/core/chaser-light-sampler.ts packages/vnicore/tests/core/chaser-light-sampler.test.ts packages/vnicore/tests/pixi/vni-player.test.ts agents.md
git diff --no-index -- packages/vnicore/src/core/chaser-light-sampler.ts packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts
rg -n "chaser_light|Chaser|sampleChaser|clockwise visual motion|lightDuration|interval|elapsed" packages/anieditorv5runtime-cc
```

注意：`git diff --no-index` 在发现差异时会返回退出码 `1`，这是本步骤的预期信号，不是实现失败。报告中记录差异摘要即可。

报告中必须写清：

- task 78 的提交 hash 和修改摘要。
- `vnicore` 新 sampler 与 runtime-cc 旧 sampler 的差异。
- 本任务最终是否只涉及 `chaser_light`，还是还发现了 fixture / docs 需要同步。

### 6.3 同步 modular core sampler

修改：

```text
packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts
```

必须实现：

- 删除 `sampleTrajectoryPoint(...)` 参数中的 `elapsed`。
- 圆形轨迹使用 `angle = index * spacing / max(radius, 1) - PI / 2`。
- 圆形轨迹使用原始 `radius`，不要用 `max(radius, spacing / (2PI))` 改写半径。
- `chasePeriod = max(lightDuration + interval, 0.001)`。
- `cycleDuration = chasePeriod * totalCount`。
- 使用 `positiveModulo(elapsed - index * chasePeriod, cycleDuration)`。
- `isLit = cycleTime < lightDuration`。
- 亮灯 alpha 固定为 `baseOpacity`，暗灯 alpha 为 `baseOpacity * dimAlpha`。
- 亮灯 scale 使用 `baseScale * (1 + wave * 0.18)`，暗灯 scale 使用 `baseScale`。
- 亮灯 blendMode 为 `add`，暗灯 blendMode 为 `sampledLayer.blendMode`。
- 保留 `alpha <= 0.002` 的显式过滤，但不得让过滤改变下一盏灯亮起的时序。

建议从 `packages/vnicore/src/core/chaser-light-sampler.ts` 对照同步，但不要让 runtime-cc 依赖 vnicore 包。

### 6.4 同步 Cocos player 行为

检查：

```text
packages/anieditorv5runtime-cc/src/cocos/player.ts
```

当前 `renderChaserLightSamples(...)` 已使用 `managed.chaserLightNodes` 节点池。执行时必须确认：

- sampler 输出数量变化时，节点只增删到目标数量。
- 同一帧/seek 不每次重建全部节点。
- `applyChaserLightSample(...)` 继续使用 Cocos 坐标映射：
  - `x = layerPosition.x + chaser.x`
  - `y = layerPosition.y - chaser.y`
  - `rotationDegrees = -chaser.rotation * 180 / PI`
- blend mode 使用 `getCocosBlendModeConfig(chaser.blendMode)`。
- `keepOriginal=false` 时源图隐藏但走马灯节点仍可见。

如果发现 Cocos 映射测试为了旧旋转视觉写了错误断言，修改测试，不要改回生产逻辑。

同时检查：

```text
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
```

确认 `keepOriginal=false`、`hasActiveChaserLightAnimation`、`chaser_light.totalCount` 上限和参数校验不因本任务被放松；如需改测试，优先改测试预期，不要让 production 校验变宽。

### 6.5 补强 modular tests

优先新增或更新：

```text
packages/anieditorv5runtime-cc/tests/core/chaser-light-sampler.test.ts
```

如果当前没有该文件，应新增。测试至少覆盖：

- circular 轨迹在 `t=0` 和 `t=0.12` 的 `x/y/rotation` 完全一致。
- circular 第一盏灯使用编辑器公式，`index=0` 在 `centerX, centerY - radius`。
- `index=1` 使用 `angle = spacing / radius - PI / 2`，不是 `2PI / totalCount`。
- `t < lightDuration + interval` 时只有第一盏灯亮。
- `t = lightDuration + interval` 附近第二盏灯亮。
- linear / curved 轨迹在不同时间点位置固定。
- `dimAlpha=0` 时暗灯被过滤，但亮灯时序不变。
- 亮灯 alpha、暗灯 alpha、亮灯 scale、暗灯 scale、blendMode 与任务 78 后的 vnicore 语义一致。

同步复查已有 core 测试：

```text
packages/anieditorv5runtime-cc/tests/core/animation-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/project-sampler.test.ts
packages/anieditorv5runtime-cc/tests/core/validation.test.ts
```

必须确认 `keepOriginal=false`、active flag 和 validation 仍有覆盖；如果新增 `tests/core/chaser-light-sampler.test.ts` 后发现旧测试重复或旧语义冲突，改测试而不是改生产逻辑。

同步更新：

```text
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
```

至少替换旧用例：

```text
maps circular chaser_light samples to Cocos clockwise visual motion
```

改为验证固定灯位，例如：

- `player.init()` / `player.seek(0.125)` 后同一个 chaser 节点位置仍等于固定采样点的 Cocos 映射。
- seek 前后 `chaserLightContainer.children[0]` 复用同一节点对象。
- `rotation` 使用 Cocos 负角度转换。
- `getRuntimeDiagnostics().chaserLightSpriteCount` 稳定。

### 6.6 补强 standalone tests

更新：

```text
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
```

必须覆盖：

- standalone `sampleChaserLightSpritesForLayer(...)` 可直接导出和调用。
- standalone sampler 的固定灯位、`lightDuration + interval` 错位、alpha/scale/blendMode 与 modular sampler 一致。
- standalone `V5GCocosPlayer` 的 chaser 节点 Cocos 坐标映射与 modular player 一致。
- standalone import 类型至少包含：
  - `VNIChaserLightLayerSampleState`
  - `VNIChaserLightTextureSize`
  - `VNIChaserLightSpriteSample`
- standalone API 至少包含：
  - `getChaserLightProgress`
  - `hasActiveChaserLightAnimation`
  - `sampleChaserLightSpritesForLayer`

注意：`standalone-parity.test.ts` 只能证明 modular 与 standalone 彼此一致。由于二者可能同时保留旧错误，本任务还必须有直接断言任务 78 语义的 standalone 测试，不能只做 parity。

如果 Cocos fake `cc` 缺少测试固定灯位所需的 Sprite、Node、rotation、opacity、blend state 观测能力，只允许补充：

```text
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
```

补充 fake 能力时必须保持它只是 Cocos 3.8.6 API 的测试替身，不要把生产 workaround 写进 fake。

### 6.7 同步 standalone 单文件

修改：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

同步范围：

- core chaser sampler 的全部语义变更。
- 如新增 helper，例如 `positiveModulo(...)`，必须出现在 standalone 文件内。
- 如果新增/调整 public export 或 types，必须在 standalone 文件中保持命名导出。
- standalone 仍只能 import `"cc"`。
- standalone 不得出现相对 import、workspace import、Node builtin、DOM、Pixi、`JsonAsset`、`resources.load()` 或 `.includes(...)`。

执行边界扫描：

```bash
rg -n "from ['\\\"]@slotclientengine|from ['\\\"]\\.\\.?/|pixi\\.js|resources\\.load|JsonAsset|window|document|require\\(" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
rg -n "\\.includes\\(" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

预期 0 命中。若命中，优先修 standalone 代码，不要弱化 checker。

### 6.8 更新 standalone checker

修改：

```text
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
```

把 `chaser_light` 相关 public API 和关键 snippet 纳入检查。至少补充：

```text
export interface VNIChaserLightLayerSampleState
export interface VNIChaserLightTextureSize
export interface VNIChaserLightSpriteSample
export function getChaserLightProgress
export function hasActiveChaserLightAnimation
export function sampleChaserLightSpritesForLayer
chaser_light
lightDuration + interval
positiveModulo
getCocosBlendModeConfig(chaser.blendMode)
```

如果 snippet 检查因为格式变化过于脆弱，可以选择更稳定的字符串，但不能让 checker 只剩“文件能编译”。

同时做 public export 审计：

```bash
rg -n "sampleChaserLightSpritesForLayer|getChaserLightProgress|hasActiveChaserLightAnimation|VNIChaserLight" packages/anieditorv5runtime-cc/src/core/index.ts packages/anieditorv5runtime-cc/src/index.ts packages/anieditorv5runtime-cc/src/cocos/index.ts packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
```

如果 modular public export 本来已经通过 `export * from "./core/index.js"` 暴露，无需制造重复 re-export；报告中写明审计结果即可。

### 6.9 fixture 同步和字节一致性审计

执行：

```bash
for f in docs/anieditor5/export/*.json; do b=${f##*/}; if [ -f packages/anieditorv5runtime-cc/tests/fixtures/$b ]; then cmp -s "$f" "packages/anieditorv5runtime-cc/tests/fixtures/$b" || echo "$b differs"; fi; done
cmp -s docs/anieditor5/export/roundreel.json packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
```

处理规则：

- `roundreel.json` 必须与 docs/export 字节一致。
- 如果其它 fixture 只差末尾换行，报告中说明；若决定同步为字节一致，要直接复制源 JSON，不用 Prettier 改写。
- 如果发现内容漂移，必须判断源头：
  - 正式导出样例以 `docs/anieditor5/export` 为源。
  - runtime-cc 专用变体必须在测试文件或报告中说明原因。
- 不允许为了 format check 修改字节级 fixture。`tests/fixtures/*.json` 已在 `.prettierignore` 中。

### 6.10 更新 README 和协作规则判断

更新：

```text
packages/anieditorv5runtime-cc/README.md
```

至少写明：

- `chaser_light` 在 Cocos runtime 中复用当前图层同一张 `SpriteFrame`。
- 灯位固定在采样点上，动画推进的是亮灯/暗灯窗口。
- 圆形轨迹 `spacing` 是弧长语义。
- standalone 仍是普通 Cocos 项目的优先交付方式。

检查 `agents.md`：

```bash
rg -n "chaser_light|走马灯|anieditorv5runtime-cc|standalone.zip" agents.md
```

判断：

- 如果只是同步任务 78 已经加入的 `chaser_light` 长期规则，通常不需要更新 `agents.md`。
- 如果新增 Cocos/standalone 专属长期规则，例如新的 checker/zip 合同或 Cocos driver 限制，必须同步更新 `agents.md`。
- 本仓库当前在大小写不敏感文件系统中 `AGENTS.md` 与 `agents.md` 指向同一规则文件；报告仍以真实存在的 `agents.md` 为准。

### 6.11 重建 standalone.zip

完成源码和 standalone 同步后，在 package 目录重建 zip：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
cd /Users/zerro/github.com/slotclientengine
```

预期 `zipinfo -1` 只包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

不得包含：

```text
__MACOSX/
._*
.DS_Store
dist/
coverage/
node_modules/
```

`standalone.zip` 被 `.gitignore` 忽略也必须重建和直接验证。

如果后续又执行了根级 `pnpm build` 或其它可能清理 package 输出/ignored artifact 的命令，必须在所有 build 命令结束后重新执行本节 zip 验证；若 `standalone.zip` 被清掉，重新按本节命令生成一次。

## 7. 验收命令

### 7.1 包级严格验收

优先执行：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc build
```

如果 pnpm wrapper 因 no-TTY 或环境问题先失败，并且不是代码问题，可在报告中记录后使用 package-local 命令等价验收，例如：

```bash
cd packages/anieditorv5runtime-cc
../../node_modules/.bin/tsc -p tsconfig.json --noEmit
../../node_modules/.bin/tsc -p tsconfig.standalone.json --noEmit
../../node_modules/.bin/eslint .
../../node_modules/.bin/prettier --check .
node scripts/check-standalone.mjs
../../node_modules/.bin/vitest run --coverage
../../node_modules/.bin/tsc -p tsconfig.build.json
cd /Users/zerro/github.com/slotclientengine
```

不要因为 wrapper 问题修改生产代码语义。

### 7.2 重点测试复跑

执行：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc exec vitest run tests/core/chaser-light-sampler.test.ts tests/cocos/player.test.ts tests/standalone/standalone-player.test.ts tests/standalone/standalone-parity.test.ts tests/standalone/standalone-import.test.ts
```

重点确认：

- fixed circular positions。
- `lightDuration + interval` 错位。
- linear / curved positions across time。
- Cocos Y 轴和 rotation 映射。
- node pool 复用和销毁。
- standalone direct semantics，不只是 parity。

### 7.3 fixture / zip / 边界检查

执行：

```bash
git diff --check
test -f packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
git status --short --ignored packages/anieditorv5runtime-cc/standalone.zip
cmp -s docs/anieditor5/export/roundreel.json packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
rg -n "clockwise visual motion|elapsed \\* Math\\.PI \\* 2|index \\* interval|0\\.72 \\+ wave \\* 0\\.28|wave \\* 0\\.35|0\\.65" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/tests packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
rg -n "from ['\\\"]@slotclientengine|from ['\\\"]\\.\\.?/|pixi\\.js|resources\\.load|JsonAsset|window|document|require\\(" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
rg -n "\\.includes\\(" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

预期：

- `git diff --check` 通过。
- zip 存在且只包含两个 standalone 文件。
- `git status --short --ignored packages/anieditorv5runtime-cc/standalone.zip` 能显示该 zip 被忽略或不被跟踪；报告中记录即可。
- `roundreel.json` 字节一致。
- 旧走马灯语义 grep 不应命中生产代码。若测试中保留旧字符串，只能是用于证明已移除的负向检查；更推荐完全移除旧测试名。
- standalone 边界扫描 0 命中。

如果执行了 7.4 的根级 `CI=true pnpm build`，必须在根级 build 后重新执行本小节的 `test -f` / `zipinfo -1`，确保最终交付物没有被清理。

### 7.4 根级参考验收

如果时间允许，执行：

```bash
CI=true pnpm typecheck
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm build
```

如果根级命令失败，必须分类：

- 本任务相关失败：必须修复。
- 仓库既有无关失败：报告中记录命令、失败包、失败文件/断言，并说明本任务包级验收是否通过。

不要把根级历史失败当成本任务通过的证据，也不要为无关失败改动本任务外生产逻辑。

## 8. 真实 Cocos Creator 验收和交接

本任务自动化主要覆盖 TypeScript、Vitest fake `cc`、standalone checker、build 和 zip。真实 Cocos Creator 3.8.6 编辑器验收依赖本机编辑器、`.meta`、Library、场景绑定和宿主项目资源。

执行时先探测本机是否能跑真实编辑器：

```bash
command -v CocosCreator
CocosCreator --version
```

如果命令不存在、无法启动或需要 GUI/项目状态，本任务仍可用仓库内验收完成，但必须进入手工交接路径并在报告中说明原因。

如果本机可执行真实 Cocos 验收，至少验证：

- 将 `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 复制进宿主 Cocos 项目脚本目录。
- 将 `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts` 作为接入参考。
- 使用 `docs/anieditor5/export/roundreel.json` 和对应 `docs/anieditor5/export/assets` 资源。
- 绑定 SpriteFrame 或 SpriteAtlas 后播放 `roundreel`。
- 连续播放时肉眼确认走马灯灯位固定，只推进亮灭窗口。
- `getRuntimeDiagnostics().chaserLightSpriteCount` 在播放中稳定，停止/seek 出动画区间后归零。
- Cocos 控制台无红色 runtime 错误。

如果本机无法执行真实 Cocos 验收，任务报告必须明确写：

- 未执行真实 Cocos Creator 3.8.6 编辑器导入验收。
- 已完成的仓库内验收命令和结果。
- 手工验收需要的文件：
  - `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
  - `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
  - `packages/anieditorv5runtime-cc/standalone.zip`
  - `docs/anieditor5/export/roundreel.json`
  - `docs/anieditor5/export/assets/*`
- 手工验收重点：固定灯位、亮灭节奏、节点数稳定、无红色发布/运行错误。

## 9. 任务报告要求

任务完成后新增：

```text
tasks/80-anieditorv5runtime-cc-chaser-light-sync-[utctime].md
```

报告必须包含：

- 任务目标和完成范围。
- task 78 / git 提交确认结果。
- 修改文件清单。
- `chaser_light` 旧语义和新语义对比。
- modular source 同步摘要。
- standalone 单文件同步摘要。
- `scripts/check-standalone.mjs` 更新摘要。
- tests 更新摘要，特别说明旧 `clockwise visual motion` 测试如何改成固定灯位测试。
- fixture 同步/审计结果，包含 `roundreel.json` 是否字节一致。
- `standalone.zip` 重建结果和 `zipinfo -1` 输出。
- 所有验收命令和结果。
- 根级命令若失败，必须分类为本任务相关或既有无关。
- 是否更新 `agents.md`，以及原因。
- 是否新增或修改依赖，`pnpm-lock.yaml` 是否变化。
- 真实 Cocos 验收结果；若未执行，写清手工验收交接文件和步骤。
- 二次遗漏检查结果。

报告建议结构：

```markdown
# 任务 80 执行报告：anieditorv5runtime-cc chaser light sync

## 1. 任务目标和完成范围
## 2. task 78 / git 更新确认
## 3. 修改文件清单
## 4. chaser_light 同步细节
## 5. standalone 交付
## 6. fixture / 文档 / agents 判断
## 7. 验收结果
## 8. 真实 Cocos 验收或手工交接
## 9. 已知问题和后续建议
## 10. 二次遗漏检查
```

## 10. 二次遗漏检查清单

完成实现和验收后，必须再检查一遍，确保没有遗漏：

- [ ] `packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts` 没有旧的 `elapsed * 2PI` 圆形旋转逻辑。
- [ ] `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 没有旧的 `elapsed * 2PI` 圆形旋转逻辑。
- [ ] modular 和 standalone 都使用 `lightDuration + interval` 作为走马错位周期。
- [ ] modular 和 standalone 都使用任务 78 后的 alpha / scale / blendMode 语义。
- [ ] Cocos player 没有每帧重建 chaser 节点。
- [ ] `animation-sampler` / `project-sampler` / `validation` 的 `keepOriginal=false`、active flag 和 chaser 参数校验没有被放松。
- [ ] Cocos fake driver 测试覆盖 Y 轴反向和 rotation 负角度映射。
- [ ] standalone tests 有直接语义断言，不只依赖 parity。
- [ ] public export 审计覆盖 `src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts`、standalone 和 `standalone-import.test.ts`。
- [ ] `scripts/check-standalone.mjs` 覆盖 chaser public API / snippets。
- [ ] `standalone-import.test.ts` 覆盖 chaser sample 类型和 public API。
- [ ] `README.md` 已说明固定灯位语义和 standalone 接入边界。
- [ ] `roundreel.json` 与 `docs/anieditor5/export/roundreel.json` 字节一致。
- [ ] 其它 fixture 差异已分类并写入报告。
- [ ] `standalone.zip` 已重建，且 `zipinfo -1` 只包含两个 standalone 文件。
- [ ] `standalone.zip` 被忽略也已用 `test -f` / `zipinfo` 直接验证。
- [ ] 如果根级 build 在 zip 之后执行，已在最后再次验证或重建 `standalone.zip`。
- [ ] `git diff --check` 通过。
- [ ] 包级 `typecheck`、`typecheck:standalone`、`lint`、`format:check`、`standalone:check`、`test`、`build` 已执行并记录。
- [ ] 已判断是否需要更新 `agents.md`。
- [ ] 已生成任务报告并使用 UTC 文件名。
