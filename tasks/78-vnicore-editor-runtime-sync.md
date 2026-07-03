# vnicore editor runtime sync 任务计划

## 1. 任务目标

持续完善 `packages/vnicore`，把 `docs/anieditor5/src` 中编辑器最新实现和 `docs/anieditor5/export` 中导出的动画样例同步到 Pixi runtime 与动画 viewer：

```text
packages/vnicore
apps/anieditorv5viewer
```

本任务必须尤其修正 `chaser_light` 走马灯语义：走马灯不是灯片沿轨迹整体旋转或移动，而是固定灯位按顺序亮灭；视觉速度必须对齐编辑器的 `lightDuration + interval` 节奏。实现时不能盲目照搬编辑器每帧创建 sprite 的写法，必须在 `vnicore` 里用更经济的 sampler + Pixi sprite pool 达到同等视觉效果。

本计划是完整可执行版本，不能依赖任何别的上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、viewer 同步、文档同步、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/78-vnicore-editor-runtime-sync-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/78-vnicore-editor-runtime-sync-260703-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
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

本任务原则上不需要新增第三方依赖。若确实新增或调整依赖，必须执行：

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
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter anieditorv5viewer test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。禁止通过未知动画退回 `idle`、缺资源静默跳过、自动猜资源路径、吞掉校验错误、viewer 私下复制 runtime 算法等方式“跑通”。

## 3. 必须先阅读的上下文

执行时必须重新阅读当前实现，以实际代码为准。至少阅读：

```text
AGENTS.md
tasks/70-vnicore-runtime-editor-sync.md
tasks/70-vnicore-runtime-editor-sync-260702-040454.md
tasks/71-anieditorv5runtime-cc-vnicore-runtime-sync.md
docs/anieditor5/src/constants.ts
docs/anieditor5/src/main.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/types.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/export/*.json
docs/anieditor5/export/assets/*
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/chaser-light-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/*
packages/vnicore/tests/core/chaser-light-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/src/assets/project.json
apps/anieditorv5viewer/src/assets/projects/*.json
apps/anieditorv5viewer/src/assets/assets/*
```

建议先用下面命令看最近编辑器与导出历史：

```bash
git log --oneline --decorate -30 -- docs/anieditor5 packages/vnicore apps/anieditorv5viewer
git show --stat --name-status --oneline HEAD -- docs/anieditor5 apps/anieditorv5viewer/src/assets packages/vnicore/tests/fixtures/export
git log --oneline --decorate -12 -- docs/anieditor5/export
```

## 4. 当前已观察到的更新内容

以下是制定本计划时在本地 `main` 分支观察到的事实。执行时必须重新验证，不能只照抄本节。

### 4.1 编辑器 src 更新

最新相关提交：

```text
cff2a38 feat: update VNI version and enhance playback features
```

该提交中 `docs/anieditor5/src` 的主要变化：

- `docs/anieditor5/src/constants.ts`：`VNI_VERSION` 从 `VNI_0.038` 升级到 `VNI_0.042`。
- `docs/anieditor5/src/main.ts`：
  - 新增 `activePlaybackRange`。
  - timeline 最小吸附从 `0.1s` 调整到 `0.05s`，显示保留最多 2 位小数。
  - 新增播放时间段输入：`cb-play-segment`、`input-play-start-seconds`、`input-play-end-seconds`。
  - 播放按钮从“停止”改为播放中“暂停”，新增 `pausePlayback()`，空格键切换播放/暂停。
  - segment 播放会在 `[start, end]` 内播放，loop 时回到 segment start。
  - timeline ruler 显示可拖动 playhead 和 segment marker。
  - 动画开始/持续输入改为 `step=0.05`，移除了显式 apply 按钮，改成 change/blur/Enter 自动应用。
  - 新增 `showSelectionOutline` 勾选项，用于显示/隐藏编辑器选中图层边框。
- `docs/anieditor5/src/project_state.ts`、`docs/anieditor5/src/types.ts`：
  - `V5GEditorState` 新增 `showSelectionOutline: boolean`。
- `docs/anieditor5/src/pixi_stage.ts`：
  - `drawSelection()` 在 `showSelectionOutline=false` 时直接返回。

这些大多是编辑器 UI/操作体验。`vnicore` 不应复制编辑器 DOM 状态，但需要确认 viewer 已有 `playRange` / segmented 控件是否足以覆盖 runtime 验收。

### 4.2 走马灯编辑器语义

必须重点参考 `docs/anieditor5/src/pixi_stage.ts` 中当前 `drawChaserLight()` 和 `sampleChaserLightPoint()`。

编辑器的核心语义：

- 固定灯位：每个 `index` 先算一个静态轨迹点。
- 圆形轨迹公式为：

```text
angle = index * spacing / max(radius, 1) - PI / 2
x = centerX + cos(angle) * radius
y = centerY + sin(angle) * radius
rotation = angle + PI / 2
```

- 直线/曲线轨迹使用 `index / (totalCount - 1)` 分布，不随时间改变位置。
- 亮灯节奏为：

```text
chasePeriod = lightDuration + interval
loopPeriod = chasePeriod * totalCount
localTime = positiveModulo(elapsed - index * chasePeriod, loopPeriod)
isLit = localTime < lightDuration
```

- 亮灯时 alpha 为 `layerOpacity`，暗灯为 `layerOpacity * dimAlpha`。
- 亮灯时 scale 为 `lightSize / textureEdge * (1 + lightWave * 0.18)`，暗灯保持基础大小。
- 亮灯时 blendMode 为 `add`，暗灯使用图层 blendMode。

当前 `packages/vnicore/src/core/chaser-light-sampler.ts` 与编辑器不一致：

- 圆形轨迹把 `elapsed * 2PI` 加进 angle，导致灯位整体旋转。
- 圆形分布使用 `index / totalCount * 2PI`，没有按编辑器的 `spacing / radius` 语义排布。
- 亮灯错位使用 `index * interval`，而编辑器使用 `index * (lightDuration + interval)`，因此速度会明显偏快。
- scale/alpha 波形与编辑器也不一致，可能导致亮灭观感偏差。

本任务必须修正这些差异。实现目标是视觉等价和性能更好，不是逐行照搬编辑器。

### 4.3 导出样例与 viewer/fixture 同步状态

当前 `docs/anieditor5/export/assets` 与 `apps/anieditorv5viewer/src/assets/assets` 图片目录字节级一致。

当前 `docs/anieditor5/export/*.json` 与 `packages/vnicore/tests/fixtures/export/*.json` 语义一致，但部分文件只有末尾换行差异。因为本仓库已有规则要求导出 fixture 与 docs source 字节一致，执行时应修正为字节一致。

当前 viewer 的 `project.json` 是特殊旧入口：

```text
docs/anieditor5/export/project.json
apps/anieditorv5viewer/src/assets/project.json
```

两者当前字节一致。不要把 `project.json` 误判成 viewer 缺失；它不在 `apps/anieditorv5viewer/src/assets/projects/` 下。

当前 viewer 的 `roundreel.json` 与 `docs/anieditor5/export/roundreel.json` 语义不一致：

```text
docs/anieditor5/export/roundreel.json
apps/anieditorv5viewer/src/assets/projects/roundreel.json
packages/vnicore/tests/fixtures/export/roundreel.json
```

历史上 `dc09eb8` 曾同步更新 docs/export、viewer asset 和 vnicore fixture 的 `roundreel.json`；随后 `cff2a38` 只把 viewer 内置 `roundreel.json` 改成了更短的 `roundreel222` 样例。执行本任务时必须把 `docs/anieditor5/export` 作为导出源头重新判定：

- 如果 `roundreel222` 是临时 viewer 副本，必须恢复 viewer 与 docs/export 一致。
- 如果 `roundreel222` 才是编辑器最新导出，必须先把它明确同步回 `docs/anieditor5/export/roundreel.json` 和 `packages/vnicore/tests/fixtures/export/roundreel.json`，再更新 viewer；不能只让 viewer 拿一个私有样例。

## 5. 范围和非目标

### 5.1 必做范围

- 修正 `packages/vnicore` 的 `chaser_light` sampler，使轨迹点固定、不随时间旋转，并按编辑器节奏逐盏亮灭。
- 保持 `VNIPlayer` 的高效实现：复用 sprite pool，不每帧重建纹理，不恢复隐藏 canvas 或独立 renderer。
- 更新 `packages/vnicore` 测试，覆盖圆形/直线/曲线走马灯静态点位、亮灭节奏、`keepOriginal`、diagnostics 和 sprite pool。
- 同步 `docs/anieditor5/export` 到：
  - `packages/vnicore/tests/fixtures/export`
  - `apps/anieditorv5viewer/src/assets/project.json`
  - `apps/anieditorv5viewer/src/assets/projects`
  - `apps/anieditorv5viewer/src/assets/assets`
- 修复或确认 viewer 的 `roundreel` 样例来源，确保 sourcePath 与真实数据一致。
- 更新 `apps/anieditorv5viewer` 测试/注册，确保新增或更新动画能在项目下拉中选择并由 `@slotclientengine/vnicore` 播放。
- 更新 `packages/vnicore` 文档中 `chaser_light` 的语义描述。
- 判断是否需要同步更新 `AGENTS.md`。如果本任务沉淀出新的长期协作规则，例如“`chaser_light` 灯位固定、只允许亮灭推进”，必须更新 `AGENTS.md`。

### 5.2 非目标

- 不把编辑器 DOM/UI 状态搬进 `packages/vnicore`。
- 不在 `apps/anieditorv5viewer` 里复制 `chaser_light`、粒子、mask、文字层绑定或播放状态机算法。
- 不为了通过测试放松生产校验或加入隐藏 fallback。
- 不修改 `docs/anieditor5/src` 编辑器源码，除非实现中发现编辑器导出与预览本身存在明确错误，并且必须在报告中说明证据。
- 不处理 `packages/anieditorv5runtime-cc`，除非执行中确认本任务新增了需要同步到 Cocos runtime 的公共 VNI 行为；若需要，只在报告中列为后续任务，不在本任务扩范围。

## 6. 实施步骤

### 6.1 工作区和差异盘点

执行：

```bash
git status --short --untracked-files=all
git diff --stat
git log --oneline --decorate -30 -- docs/anieditor5 packages/vnicore apps/anieditorv5viewer
git log --oneline --decorate -12 -- docs/anieditor5/export
```

记录当前实际差异。若工作区有用户未提交改动，必须当作输入保留，不能回滚。

检查导出源、fixture、viewer 副本一致性：

```bash
node -e "const fs=require('fs'),path=require('path'); const docs='docs/anieditor5/export'; const pairs=[['apps/anieditorv5viewer/src/assets/project.json','project.json']]; for (const name of fs.readdirSync(docs).filter(n=>n.endsWith('.json')).sort()) { const source=path.join(docs,name); const viewer=name==='project.json'?'apps/anieditorv5viewer/src/assets/project.json':path.join('apps/anieditorv5viewer/src/assets/projects',name); const fixture=path.join('packages/vnicore/tests/fixtures/export',name); for (const [label,target] of [['viewer',viewer],['fixture',fixture]]) { if (!fs.existsSync(target)) console.log(name+': '+label+' missing '+target); else if (!fs.readFileSync(source).equals(fs.readFileSync(target))) console.log(name+': '+label+' differs '+target); } }"
diff -qr docs/anieditor5/export/assets apps/anieditorv5viewer/src/assets/assets
```

如果只存在末尾换行差异，也要修正为字节一致，因为本仓库要求导出 fixture 不被 Prettier 或测试手改。

### 6.2 修正 `chaser_light` core sampler

修改：

```text
packages/vnicore/src/core/chaser-light-sampler.ts
```

要求：

- `sampleTrajectoryPoint()` 不再接收或使用 `elapsed`。
- 圆形轨迹使用编辑器公式：`angle = index * spacing / max(radius, 1) - PI / 2`。
- 直线和曲线继续按 `index / (totalCount - 1)` 静态分布。
- 亮灭错位使用 `index * (lightDuration + interval)`，不是 `index * interval`。
- `cycleDuration` 使用 `(lightDuration + interval) * totalCount`。
- 亮灯/暗灯 alpha、scale、blendMode 尽量对齐编辑器视觉：
  - 亮灯 alpha = `baseOpacity`
  - 暗灯 alpha = `baseOpacity * dimAlpha`
  - 亮灯 scale 只做轻微呼吸，倍率参考 `1 + lightWave * 0.18`
  - 暗灯 scale 保持基础大小
  - 亮灯 blendMode = `add`
  - 暗灯 blendMode = sampled layer blendMode
- 不新增静默容错。缺少必需参数仍通过现有 validation 显式失败。

注意：编辑器预览每次绘制会 `new PIXI.Sprite(texture)`。`vnicore` 不要照搬这个分配模式；继续让 `VNIPlayer` 复用 `chaserLightSpritesByLayer` 中的 sprite。

### 6.3 更新 Pixi runtime 渲染

检查：

```text
packages/vnicore/src/pixi/vni-player.ts
```

要求：

- `renderChaserLightSamples()` 继续只消费 core sampler 输出。
- 保持 sprite pool，seek 或 tick 时复用同一批 sprite。
- `keepOriginal=false` 时隐藏源图，但走马灯 runtime display 必须继续可见。
- sprite 插入顺序必须继续遵守 layer group / layer slot 顺序，不允许把走马灯挂到 viewer 私有层或独立 stage。
- diagnostics `data-vni-chaser-light-sprites` 继续反映当前渲染数量。
- destroy、seek、restart、project reload 时清理 chaser sprite，不泄露 display object。

### 6.4 同步导出样例和 viewer 注册

以 `docs/anieditor5/export` 为源，更新：

```text
packages/vnicore/tests/fixtures/export/*.json
apps/anieditorv5viewer/src/assets/project.json
apps/anieditorv5viewer/src/assets/projects/*.json
apps/anieditorv5viewer/src/assets/assets/*
```

具体规则：

- `project.json` 在 viewer 中对应 `apps/anieditorv5viewer/src/assets/project.json`。
- 其它导出 JSON 对应 `apps/anieditorv5viewer/src/assets/projects/<name>.json`。
- 资源图片对应 `apps/anieditorv5viewer/src/assets/assets/<asset name>`。
- 如果 docs/export 新增 JSON，必须在 `apps/anieditorv5viewer/src/config/bundled-projects.ts` 中注册，并补充类型 union、profile 读取和 label。
- 如果 docs/export 删除 JSON 或 asset，必须确认 viewer/bundle/tests 中没有遗留引用；不能留下死资源或失效项目。
- 如果当前 `apps/anieditorv5viewer/src/assets/projects/roundreel.json` 与 docs/export 不一致，必须按第 4.3 节的规则明确处理。

同步后执行字节级检查：

```bash
node -e "const fs=require('fs'),path=require('path'); const docs='docs/anieditor5/export'; let ok=true; for (const name of fs.readdirSync(docs).filter(n=>n.endsWith('.json')).sort()) { const source=path.join(docs,name); const viewer=name==='project.json'?'apps/anieditorv5viewer/src/assets/project.json':path.join('apps/anieditorv5viewer/src/assets/projects',name); const fixture=path.join('packages/vnicore/tests/fixtures/export',name); for (const [label,target] of [['viewer',viewer],['fixture',fixture]]) { if (!fs.existsSync(target) || !fs.readFileSync(source).equals(fs.readFileSync(target))) { console.error(name+' not byte-equal with '+label+': '+target); ok=false; } } } process.exit(ok?0:1);"
diff -qr docs/anieditor5/export/assets apps/anieditorv5viewer/src/assets/assets
```

### 6.5 更新测试

至少更新或新增以下测试：

```text
packages/vnicore/tests/core/chaser-light-sampler.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/tests/core/validation.test.ts
apps/anieditorv5viewer/src/**/*.test.ts
```

`chaser-light-sampler.test.ts` 必须覆盖：

- 圆形轨迹在不同时间点的 `x/y/rotation` 不变，只改变 `alpha/scale/isLit`。
- 圆形点位符合编辑器公式 `index * spacing / radius - PI / 2`。
- 亮灯错位使用 `lightDuration + interval`。例如 `lightDuration=0.08`、`interval=0.04` 时，第 1 盏灯应在约 `0.12s` 后进入亮灯窗口，而不是 `0.04s`。
- 直线和曲线轨迹同样不随时间移动。
- `dimAlpha=0` 的暗灯可以不输出或 alpha 接近 0，但不能影响亮灯数量和时序判断。

`vni-player.test.ts` 必须覆盖：

- 走马灯 sprite pool 在多次 `seek()` 后复用同一批 sprite。
- `keepOriginal=false` 时源图隐藏，走马灯 sprite 仍渲染。
- diagnostics 中 `data-vni-chaser-light-sprites` 正确。
- destroy 后 diagnostics 和 sprite pool 清理。

fixture/viewer 测试必须覆盖：

- `roundreel`、`bigwin`、`megawin`、`superwin` 等更新样例能通过 `assertVNIProject` / `validateVNIProject`。
- viewer bundled project 注册与实际 JSON/asset manifest 一致，不允许 sourcePath 指向 docs/export 但 data 使用不同内容。
- 若新增项目，项目下拉和默认项目行为有测试覆盖。

如果现有测试为了旧错误语义写了“灯位随时间转动”的断言，必须修改测试，不要为了保留旧测试而保留错误生产逻辑。

### 6.6 更新文档和示例

检查并更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
packages/vnicore/examples/*
```

文档必须明确：

- `chaser_light` 是固定轨迹灯位依次亮灭，不是 sprite 沿轨迹移动或旋转。
- `spacing` 在圆形轨迹中按弧长换算角度，公式与编辑器一致。
- `interval` 是每盏灯灭灯间隔，走马速度由 `lightDuration + interval` 共同决定。
- viewer 只是验证壳，不能复制 `chaser_light` runtime 算法。

如果 `packages/vnicore` 的 public API 没有变化，不要虚构 API 更新。

### 6.7 判断是否更新 `AGENTS.md`

阅读 `AGENTS.md` 中 `packages/vnicore` 和 `apps/anieditorv5viewer` 相关规则。当前已有规则说明：

- `packages/vnicore` 拥有 `chaser_light` 和 runtime sprite/texture 性能上限语义。
- viewer 只能做 UI 配置、输入校验、状态展示和调用。
- 新增或更新 VNI export 样例时必须同步 docs/export、vnicore fixtures、viewer projects 和 viewer assets，并保持 fixture 与 docs source 字节一致。

如果本任务只是在这些既有规则下修 bug，可以不更新 `AGENTS.md`，但报告中要写明“无需更新，原因是既有规则已覆盖”。如果需要沉淀新长期规则，例如：

```text
chaser_light 灯位必须固定，动画只推进亮灭窗口；不要把 elapsed 加进轨迹点采样。
```

则必须同步更新 `AGENTS.md`，并在报告中说明。

## 7. 验收命令

基础检查：

```bash
node -v
pnpm -v
git status --short --untracked-files=all
git diff --check
```

`vnicore`：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore format:check
```

viewer：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

导出同步：

```bash
node -e "const fs=require('fs'),path=require('path'); const docs='docs/anieditor5/export'; let ok=true; for (const name of fs.readdirSync(docs).filter(n=>n.endsWith('.json')).sort()) { const source=path.join(docs,name); const viewer=name==='project.json'?'apps/anieditorv5viewer/src/assets/project.json':path.join('apps/anieditorv5viewer/src/assets/projects',name); const fixture=path.join('packages/vnicore/tests/fixtures/export',name); for (const [label,target] of [['viewer',viewer],['fixture',fixture]]) { if (!fs.existsSync(target) || !fs.readFileSync(source).equals(fs.readFileSync(target))) { console.error(name+' not byte-equal with '+label+': '+target); ok=false; } } } process.exit(ok?0:1);"
diff -qr docs/anieditor5/export/assets apps/anieditorv5viewer/src/assets/assets
```

根级检查尽量执行：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm format:check
```

如果根级命令因本任务无关的历史问题失败，不能把失败当成通过；必须在任务报告中写清楚：

- 命令
- 失败位置
- 为什么判断为非本任务引入
- 本任务范围内已经通过的替代命令

## 8. 浏览器/可视化验收

完成代码和静态检查后启动 viewer：

```bash
pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1
```

在浏览器中至少验证：

- 默认 `roundreel` 能加载。
- `roundreel` 的走马灯灯位不整体旋转；只有一盏盏灯依次亮灭。
- 调整播放/seek 后灯位仍固定，亮灭进度变化正常。
- `keepOriginal=false` 的样例只隐藏源图，不隐藏走马灯。
- `number2` 文字层替换仍通过 public API 工作。
- `number3` mask / safe_glow / 粒子仍没有回归。
- `bigwin`、`megawin`、`superwin` 更新图片和 JSON 后能正常加载。
- diagnostics 中 chaser/light/particle/safe-glow 计数合理，无持续增长泄露。

如果当前环境不能做浏览器验收，报告中必须明确写“浏览器验收未执行”，并列出留给人工验收的 URL、项目名和检查点；不能把未执行的浏览器验收写成已通过。

## 9. 二次遗漏检查

提交报告前必须再检查一遍，确保没有遗漏：

```bash
rg -n "chaser_light|sampleChaser|data-vni-chaser|roundreel222|VNI_0.042|VNI_0.038" docs/anieditor5 packages/vnicore apps/anieditorv5viewer AGENTS.md
rg -n "docs/anieditor5/export|src/assets/projects|tests/fixtures/export" apps/anieditorv5viewer packages/vnicore tasks AGENTS.md
git status --short --untracked-files=all
git diff --stat
```

重点确认：

- 没有残留 `roundreel222` 这类临时项目名，除非已经明确写入 docs/export 并注册为正式样例。
- `docs/anieditor5/export`、viewer、vnicore fixture 同步关系清楚。
- 走马灯修复在 core sampler，而不是 viewer 私有逻辑。
- tests 没有为了旧错误语义保留奇怪写法。
- 文档没有继续暗示灯片沿轨迹移动/旋转。
- `AGENTS.md` 是否需要更新已经有明确判断。
- 任务报告已包含命令结果、浏览器验收状态和未完成风险。

## 10. 任务报告要求

完成后新增：

```text
tasks/78-vnicore-editor-runtime-sync-[utctime].md
```

报告必须用中文，至少包含：

- 任务目标和实际完成范围。
- 编辑器更新内容确认结果。
- `chaser_light` 旧问题根因：灯位随 `elapsed` 旋转、错用 `index * interval` 导致速度偏快。
- 实际修改文件清单。
- 导出样例同步结果，包括 `roundreel` 判定。
- 测试和构建命令结果。
- 浏览器/可视化验收结果；如果未执行，必须明确说明。
- `AGENTS.md` 是否更新及原因。
- 已知未解决问题或后续建议。

