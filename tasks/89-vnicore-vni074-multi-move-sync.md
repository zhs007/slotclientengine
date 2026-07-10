# vnicore VNI 0.074 multi move sync 任务计划

## 1. 任务目标

持续完善 `packages/vnicore`，把 `docs/anieditor5/src` 当前编辑器更新同步到 Pixi v8 runtime 和上传式 viewer：

```text
packages/vnicore
apps/anieditorv5viewer
```

本任务的核心不是 Cocos Creator 兼容，也不是给 vnicore 增加 Cocos fallback。`packages/vnicore` 是 Pixi.js v8 VNI runtime，只关心两件事：

1. 性能：不能因为编辑器预览代码方便就每帧重建昂贵对象、重复解析 JSON、重复创建纹理或绕过现有池化/缓存。
2. 动画效果必须和编辑器 Pixi 预览完全一样：同一份给 vnicore 用的 VNI 导出，在 `docs/anieditor5/src` 的 Pixi 预览里看到的运动轨迹、终点保持、空帧隐藏和缓动超调，必须在 `packages/vnicore` / `apps/anieditorv5viewer` 中一致。

编辑器导出的 vnicore runtime 包不是 Cocos Creator 兼容版本。因此：

- 不以 `legacy_alpha` / Cocos-compatible export 作为 vnicore 目标输入。
- 不修改 `packages/anieditorv5runtime-cc`。
- 不为了 Cocos 兼容在 vnicore 中增加隐藏适配。
- 对缺资源、未知动画、非法参数、错误 `pointsJson`、错误 sequence 配置显式失败，不做静默兜底。

本计划是完整可执行版本，不能依赖任何别的上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、viewer 同步、文档同步、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/89-vnicore-vni074-multi-move-sync-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/89-vnicore-vni074-multi-move-sync-260710-123456.md
```

## 2. 当前已观察到的更新内容

以下是制定本计划时在本地工作区观察到的事实。执行时必须重新验证，不能只照抄本节。

当前 `git status --short --untracked-files=all` 显示只有编辑器源码被修改：

```text
 M docs/anieditor5/src/animation_presets.ts
 M docs/anieditor5/src/constants.ts
 M docs/anieditor5/src/coordinates.test.ts
 M docs/anieditor5/src/main.ts
 M docs/anieditor5/src/types.ts
```

当前 `git diff --stat -- docs/anieditor5/src` 显示：

```text
 docs/anieditor5/src/animation_presets.ts | 168 ++++++++++++++-
 docs/anieditor5/src/constants.ts         |   2 +-
 docs/anieditor5/src/coordinates.test.ts  | 161 ++++++++++++++
 docs/anieditor5/src/main.ts              | 358 +++++++++++++++++++++++++++++--
 docs/anieditor5/src/types.ts             |   1 +
 5 files changed, 670 insertions(+), 20 deletions(-)
```

这次编辑器更新的 runtime 相关变化：

- `docs/anieditor5/src/constants.ts`：`VNI_VERSION` 从 `VNI_0.070` 升到 `VNI_0.074`。
- `docs/anieditor5/src/types.ts`：`V5GAnimationType` 新增 `"multi_move"`。
- `docs/anieditor5/src/animation_presets.ts`：
  - 新增 `multi_move` preset，导出参数为 `params.pointsJson`。
  - 新增默认多段点：

    ```json
    [
      { "x": 0, "y": 0, "time": 0, "easing": "linear" },
      { "x": 200, "y": 0, "time": 1, "easing": "easeOutQuad" }
    ]
    ```

  - `sampleLayerAnimationsAtTime()` 不再只采样 active 区间内的 transform。它通过 `getAnimationProgressForSampling()` 让部分位移动画结束后继续以 `progress = 1` 参与 transform 累加。
  - `shouldPersistEndedTransform()` 当前包含：
    - `move`
    - `multi_move`
    - `slide_in`
    - `slide_out`
    - `squash_stretch`
  - `move` 的公式仍是 `from/to - base`，但当前编辑器使用 `lerpOvershoot()`，不能用 clamp 后的普通 `lerp()` 抹掉 `backOut` 等 easing 的超调。
  - 新增 `sampleMultiMove()`：按动画内部时间在点位之间插值，每一段使用“到达点”的 `easing`；最后一个点之后保持最后位置。
  - `multi_move` 点位解析会按编辑器语义处理 `x/y/time/easing`、排序、四位小数和 `time` 范围；但是 vnicore 不需要复制编辑器 UI 的隐藏默认兜底。对 runtime export 来说，非法 `pointsJson` 应显式失败。
  - 新增 `shouldHideLayerOutsideActiveAnimation()`：位置采样和可见性分开处理。结束的位移动画仍保留终点用于后续接力，但当前时间不在任何 enabled animation 覆盖范围内时仍视为空帧，图层需要隐藏。
- `docs/anieditor5/src/main.ts`：
  - 新增 `multi_move` 参数编辑器，用户通过 UI 编辑多段点，实际导出仍是隐藏字段 `pointsJson`。
  - 编辑器 UI 会保证至少两个点、首点 easing 为 `linear`、点位按 `time` 排序，并在保存时序列化 JSON。
  - 这些 UI 逻辑不是 vnicore 的 runtime 目标；vnicore 只消费导出后的 `pointsJson`。
- `docs/anieditor5/src/coordinates.test.ts`：
  - 新增测试覆盖结束后的 `slide_in` 位移继续作为后续 `move` 起点。
  - 新增测试覆盖 `multi_move` 结束后保持最后点。
  - 新增测试覆盖空档帧和最后一个 animation 后图层隐藏。

当前未看到 `docs/anieditor5/export/*.json` 或 `docs/anieditor5/export/assets/*` 被 git diff 修改。不要手改导出 JSON 来“模拟”新版导出；只有真实编辑器导出或用户提供的新导出文件才作为 fixture 来源。

当前 `apps/anieditorv5viewer` 是上传 zip 为主，`apps/anieditorv5viewer/src/assets` 不存在。不要恢复旧内置 assets 入口。

## 3. 仓库和环境约束

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

如果 `pnpm --filter ...` 或 `pnpm exec ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter anieditorv5viewer test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。禁止通过未知动画退回 `idle`、缺资源静默跳过、非法 `pointsJson` 自动用默认点、viewer 私下复制 runtime 算法等方式“跑通”。

## 4. 必须先执行的现状确认

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat -- docs/anieditor5/src packages/vnicore apps/anieditorv5viewer docs/anieditor5/export
git diff -- docs/anieditor5/src/constants.ts docs/anieditor5/src/types.ts
git diff -- docs/anieditor5/src/animation_presets.ts docs/anieditor5/src/main.ts docs/anieditor5/src/coordinates.test.ts
```

必须确认 viewer 当前仍是上传 zip 入口：

```bash
test ! -e apps/anieditorv5viewer/src/assets
git ls-files apps/anieditorv5viewer
```

必须确认导出文件和 vnicore fixture 文件：

```bash
git ls-files docs/anieditor5/export
git ls-files packages/vnicore/tests/fixtures/export
```

如果 `docs/anieditor5/export` 有真实新增或修改的导出文件，必须同步到 `packages/vnicore/tests/fixtures/export` 并做字节一致校验。不要只复制 JSON，相关图片也要纳入 zip/viewer 验收。

`docs/anieditor5` 当前不是 `pnpm-workspace.yaml` 下的 `apps/*` 或 `packages/*` workspace 包，也没有独立 `package.json`。本任务把 `docs/anieditor5/src` 当作编辑器 Pixi 预览源码和导出合同来源来审计；不要在报告中编造不存在的 editor package 验收命令。若执行时发现用户新增了 `docs/anieditor5/package.json` 或可运行测试脚本，必须补充执行并写入报告。

## 5. 必须阅读的文件

执行时必须重新阅读当前实现，以实际代码为准。至少阅读：

```text
agents.md
docs/anieditor5/src/constants.ts
docs/anieditor5/src/types.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/main.ts
docs/anieditor5/src/coordinates.test.ts
docs/anieditor5/export/*.json
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/timeline-progress.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/core/animation-sampler.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/*
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/tests/*.test.ts
apps/anieditorv5viewer/README.md
packages/rendercore/package.json
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/tests/win-amount/win-amount-player.test.ts
```

特别对比：

```text
docs/anieditor5/src/animation_presets.ts
  DEFAULT_MULTI_MOVE_POINTS_JSON
  sampleLayerAnimationsAtTime()
  sampleMove()
  sampleMultiMove()
  parseMultiMovePoints()
  getAnimationProgressForSampling()
  shouldPersistEndedTransform()
  shouldHideLayerOutsideActiveAnimation()
  lerpOvershoot()

packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/validation.ts
```

## 6. 实现计划

### 6.1 core 类型和支持矩阵

更新 `packages/vnicore/src/core/types.ts`：

- `V5GAnimationType` / `VNIAnimationType` 增加 `"multi_move"`。
- `V5GAnimationParamValue` 仍保持 `string | number | boolean`，`pointsJson` 使用 string 承载，不引入任意 object 参数。

更新 `packages/vnicore/src/core/animation-sampler.ts`：

- `SUPPORTED_ANIMATION_TYPES` 增加 `"multi_move"`。
- `DEFAULT_EASING_BY_TYPE.multi_move = "linear"`。
- 如果新增内部 helper 或类型，例如 `VNIMultiMovePoint`、`parseMultiMovePoints()`、`shouldHideLayerOutsideActiveAnimation()`，要从 `packages/vnicore/src/core/index.ts` 只导出真正有宿主价值的 public helper；纯内部 helper 保持模块私有。

### 6.2 multi_move 采样语义

在 `packages/vnicore/src/core/animation-sampler.ts` 实现 `multi_move`，以编辑器 `docs/anieditor5/src/animation_presets.ts` 当前逻辑为准：

- 从 `animation.params.pointsJson` 读取 JSON 字符串。
- 不要在每帧每个动画里重复 `JSON.parse`。`vnicore` 是 runtime，需要把 `pointsJson` 解析/归一化做成可复用 helper，并使用缓存或预归一化结果。可选实现方式：
  - 在 sampler 内用 `WeakMap<V5GAnimationConfig, { source: string; duration: number; points: VNIMultiMovePoint[] }>` 缓存。
  - 或在 validation/project 初始化路径建立 normalized cache，但不能改变公开 project 数据结构。
  - 缓存 key 必须包含原始 `pointsJson` 和 `animation.duration`，避免同一 animation 对象被宿主热更新后读到旧点位。
- 点结构为：

  ```ts
  {
    x: number;
    y: number;
    time: number;
    easing: V5GEasingName;
  }
  ```

- `localTime = clamp(time - animation.startTime, 0, animation.duration)`。
- 如果只有一个点或 `localTime <= firstPoint.time`，使用第一个点。
- 如果 `localTime >= lastPoint.time`，使用最后一个点。
- 中间段按 `fromPoint -> toPoint` 插值。
- 段进度：

  ```text
  progress = clamp((localTime - fromPoint.time) / max(toPoint.time - fromPoint.time, 0.0001), 0, 1)
  easedProgress = easeProgress(progress, toPoint.easing)
  ```

- X/Y 使用不裁掉超调的插值：

  ```text
  from + (to - from) * easedProgress
  ```

  不能复用会把 ratio clamp 到 `0..1` 的普通 `lerp()`，否则 `backOut` 超调会消失。
- 点位按 `time` 升序排序；相同 `time` 不额外拒绝，保持原输入顺序，并按编辑器一致的 `segmentDuration = max(to.time - from.time, 0.0001)` 处理，避免手写导出和编辑器导出在边界帧表现不一致。

### 6.3 move 和已有位移动画的变更

本任务不能只新增 `multi_move`，还必须同步已有位移动画的采样变化：

- `move` 仍按 `fromX/fromY/toX/toY/baseX/baseY` 计算偏移，但插值需要允许 easing 超调。
- `slide_in`、`slide_out`、`squash_stretch` 的位移部分也要检查是否已经和编辑器 `lerpOvershoot()` 一致；若现有 vnicore 仍使用 clamp `lerp()`，必须同步。
- 新增 `getAnimationProgressForSampling()` 或等价逻辑：
  - active 区间内按现有首尾闭区间采样。
  - `time > end` 且动画类型属于 `move`、`multi_move`、`slide_in`、`slide_out`、`squash_stretch` 时返回 `1`。
  - 其它类型在 `time > end` 后仍返回 `null`。
- `sampleLayerAnimationsAtTime()` 应按 `startTime` 排序后执行，结束后的位移保持仍参与后续 active 动画的 transform 接力。

### 6.4 空帧隐藏和 transform/visibility 分离

更新 `packages/vnicore/src/core/project-sampler.ts`：

- 保留 `sampleLayerAnimationsAtTime()` 负责 transform/opacity 的采样。
- 新增或复用 `shouldHideLayerOutsideActiveAnimation()` 语义：
  - 没有 enabled animation 时不隐藏静态层。
  - 有 enabled animation 但当前时间不在任何 enabled animation 的 `[startTime, startTime + duration]` 覆盖区间内时，图层 opacity 视为 `0`。
  - 起始帧和结束帧都算覆盖区间。
- 不能因为结束位移动画继续贡献 transform，就让空档帧误显示图层。
- 现有 `scale_in` / `scale_up` 起始帧隐藏逻辑要保留；如果它和新 helper 冲突，优先写测试锁定现有视觉意图，再最小修改实现。

### 6.5 validation 显式失败

更新 `packages/vnicore/src/core/validation.ts`：

- `REQUIRED_NUMERIC_PARAMS` 为 `multi_move` 设置空数组，不要求虚假的 numeric 参数。
- 增加 `pointsJson` 校验：
  - `multi_move` 必须有 `params.pointsJson`。
  - `pointsJson` 必须是合法 JSON string。
  - JSON 顶层必须是数组。
  - 每个点必须有 finite number 的 `x`、`y`、`time`。
  - `x` / `y` 必须在编辑器 UI 约束范围 `-5000..5000` 内。编辑器导出应已完成 clamp；runtime 发现越界要显式失败，不要静默 clamp。
  - `time` 必须落在 `0..animation.duration`。
  - `easing` 必须是 `SUPPORTED_EASINGS` 中的字符串。
  - 至少要有两个有效点，以匹配编辑器 UI 的导出合同；不要把单点或空数组当作可播放 fallback。
- 不要把非法 `pointsJson` 自动改成默认点。编辑器 UI 的容错是编辑器内部便利，不是 vnicore runtime 合同。
- 保持未知 animation type、未知 easing、缺参数显式失败。

### 6.6 测试

新增或更新 `packages/vnicore/tests/core/animation-sampler.test.ts`：

- `multi_move` 在第一点之前、段中、最后点之后的 X/Y 采样。
- 每段使用 toPoint 的 `easing`。
- `multi_move` 的 `backOut` 或其它超调 easing 不被 clamp。
- `move` 在 `time > end` 后继续保留终点。
- `move` 的超调不被 clamp。
- `slide_in` / `slide_out` / `squash_stretch` 结束后 transform 保持，如果当前实现未覆盖，补测试。
- 非持久动画，例如 `fade`，结束后不继续影响 opacity。

新增或更新 `packages/vnicore/tests/core/project-sampler.test.ts`：

- 复刻编辑器新增测试语义：`slide_in` 结束位移作为后续 `move` 起点。
- 空档帧隐藏：两个 enabled animation 之间 `visible=false` / `opacity=0`。
- 最后一个 animation 结束后隐藏。
- 有后续 active animation 时，之前结束的位移动画 transform 仍参与接力。
- 没有 enabled animation 的静态层保持可见。

新增或更新 `packages/vnicore/tests/core/validation.test.ts`：

- 接受合法 `multi_move`。
- 拒绝缺失 `pointsJson`。
- 拒绝非法 JSON。
- 拒绝非数组 JSON。
- 拒绝非 finite 数字点。
- 拒绝 `x/y` 越过 `-5000..5000`。
- 拒绝未知 easing。
- 拒绝越界 time。
- 拒绝少于两个有效点。

如需更新 `packages/vnicore/tests/pixi/vni-player.test.ts`：

- 只验证 `VNIPlayer` 能加载含 `multi_move` 的项目并在 `seek()` 后体现正确 transform/visibility。
- 不在 Pixi 测试里复制 `multi_move` 采样公式；公式归 core sampler 测试。

如果是测试导致一些奇怪写法，就修改测试，不要为了测试绕开 production 合同。

### 6.7 viewer 同步

`apps/anieditorv5viewer` 应保持薄壳：

- 不在 viewer 中解析或采样 `pointsJson`。
- 不在 viewer 中复制 `move` / `multi_move` / visibility 逻辑。
- viewer 只负责上传 zip、profile 选择、控件、Pixi app 装配、错误展示和调用 `VNIPlayer` public API。

需要检查：

- `apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts` 是否依赖 animation type 白名单；若有，增加 `multi_move` 或转由 vnicore validation 负责。
- `apps/anieditorv5viewer/src/ui/controls.ts` 当前会从 project 里汇总 animation type 展示。若执行时仍只是透传 summary，不需要为 `multi_move` 写 viewer 分支；若新增了白名单或 feature 文案，则必须加 `multi_move`。
- `apps/anieditorv5viewer/README.md` 是否说明当前支持 VNI_0.074 的 `multi_move` 和结束位移保持。

### 6.8 文档、示例和协作规则

更新文档：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
apps/anieditorv5viewer/README.md
```

文档至少说明：

- 支持 `VNI_0.074` 导出的 `multi_move`。
- `multi_move` 使用 `pointsJson`，每段 easing 取到达点。
- `move` / `multi_move` / `slide_in` / `slide_out` / `squash_stretch` 在结束后继续保持 transform，用于后续动画接力。
- visibility 和 transform 分离：空档帧隐藏，但 transform 仍可为后续动画提供累积结果。
- vnicore 对非法 `pointsJson` 显式失败，不复制编辑器 UI fallback。

检查 `agents.md`：

- 如果实现后发现 `multi_move` / 结束位移保持已经属于长期协作规则，更新 `agents.md`。
- 建议新增或调整根级 `agents.md` 中 `packages/vnicore` 相关条目，明确：
  - `packages/vnicore` 拥有 VNI_0.074 `multi_move`、结束 transform 持续采样和空帧隐藏语义。
  - viewer/game runtime 只能调用 public API，不复制 `pointsJson` 解析、位移采样、visibility 判断或私有 Pixi display tree 操作。
- 如果审计后判断现有 `agents.md` 已足够覆盖，也必须在任务报告中写明“不需要更新 agents.md 的原因”。

### 6.9 下游消费者和生成物边界

`packages/rendercore` 是 `@slotclientengine/vnicore` 的真实下游，至少通过以下路径消费 `VNIPlayer` 和 core 类型：

```text
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/src/symbol/manifest.ts
```

本任务不要求在 `rendercore` 里复制 `multi_move` 逻辑，但必须确认 `vnicore` 的类型、build 输出和 runtime public API 没有破坏下游：

- 若只改 `vnicore` 内部 sampler/validation，`rendercore` 应无需源码修改。
- 若调整 public type、export helper 或 `VNIPlayerOptions`，必须同步检查 `rendercore` 编译和相关测试。
- 任务报告必须写明 `rendercore` 是否受影响。

不要手改或提交生成目录：

```text
packages/vnicore/dist
packages/vnicore/coverage
apps/anieditorv5viewer/dist
apps/anieditorv5viewer/coverage
packages/rendercore/dist
packages/rendercore/coverage
```

这些目录由构建/测试生成，当前包级 `.prettierignore` 已忽略 `coverage`、`dist`、`node_modules`。验收后如果本地出现这些未跟踪生成物，只在报告中说明，不要把它们纳入任务改动。

## 7. 验收命令

从仓库根目录执行：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check
```

viewer 验收：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

下游消费者验收：

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build
```

根级快速静态检查：

```bash
git diff --check
```

如果本任务修改了真实导出 fixture，需要额外做字节一致校验。示例：

```bash
cmp docs/anieditor5/export/<name>.json packages/vnicore/tests/fixtures/export/<name>.json
```

如果新增或更新多个导出文件，逐个执行 `cmp`，并在任务报告中列出结果。

如果用户要求浏览器验收或有新版 zip，可启动 viewer：

```bash
pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1
```

浏览器手动验收由用户完成时，报告中只能写“已交付手动验收入口”，不能把未亲自完成的浏览器观察写成已通过证据。

## 8. 完成报告要求

实现完成后必须新增中文任务报告：

```text
tasks/89-vnicore-vni074-multi-move-sync-[utctime].md
```

报告必须包含：

- 本次同步的编辑器差异摘要。
- 修改文件列表。
- `move` 逻辑是否修改，以及具体修改点：
  - 插值超调是否保留。
  - 结束后 transform 是否持续采样。
  - 空帧 visibility 是否分离。
- `multi_move` 的 runtime 合同。
- validation 显式失败策略。
- viewer 是否保持薄壳。
- `rendercore` 下游是否受影响，以及验收结果。
- `agents.md` 是否更新；如果没更新，说明理由。
- 完整验收命令、结果和失败项。
- 未完成项或需要用户手动验收的内容。

报告不得把未执行的命令写成已通过；不得把用户负责的浏览器验收写成自己已完成。

## 9. 二次遗漏检查

提交最终答复前必须做一次二次审计：

- `docs/anieditor5/src` 的 diff 是否全部被分类：runtime 必须同步、viewer UI 无需同步、测试参考、非目标。
- `multi_move` 是否同时覆盖 type、supported list、default easing、sampler、validation、tests、docs。
- `move` 是否明确覆盖超调和结束后持续 transform。
- `slide_in`、`slide_out`、`squash_stretch` 是否没有漏掉同一套持久 transform 语义。
- 空帧隐藏是否没有被 transform 持久采样破坏。
- `scale_in` / `scale_up` 起始帧隐藏旧语义是否没有被误伤。
- `pointsJson` 是否显式失败，未复制编辑器 UI 默认兜底。
- viewer 是否没有复制 runtime 算法。
- `rendercore` 下游 typecheck/test/build 是否已覆盖或在报告中说明未执行原因。
- `packages/anieditorv5runtime-cc` 是否未被修改。
- `docs/anieditor5` 是否仍没有独立 package 验收脚本；如果新增了脚本，是否已执行。
- `dist` / `coverage` 等生成目录是否未被纳入改动。
- `docs/anieditor5/export` 如有真实变化，是否同步 fixture 并 `cmp`。
- `agents.md` 是否完成更新或写明不更新理由。
- 任务报告是否已按 UTC 命名写入 `tasks/`。
