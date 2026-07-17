# vnicore VNI 0.087 editor parity 任务计划

## 1. 任务目标

持续完善 `packages/vnicore`，把 `docs/anieditor5/src` 中当前未提交的最新编辑器能力同步到 Pixi.js v8 runtime 和上传式 viewer：

```text
packages/vnicore
apps/anieditorv5viewer
```

本任务只有两个核心验收目标：

1. 性能：runtime 不能因为复制编辑器预览的便捷写法，在每帧重复排序关键帧、分配反弹数组、重建 Pixi 容器/粒子/纹理或重复解析已校验数据。
2. 效果一致：同一份给 vnicore 使用的 VNI 导出，在 `docs/anieditor5/src` 的 Pixi 预览与 `packages/vnicore` / `apps/anieditorv5viewer` 中必须在首帧、中间帧、末帧、seek、restart 和 loop 边界保持一致。

`packages/vnicore` 是 Pixi.js v8 runtime，不是 Cocos Creator runtime。编辑器当前 JSON 中仍保留 `engineTarget.name: "cocos_creator"` 的历史 schema 元数据，但该字段不能用来切换 vnicore 渲染路径，也不代表需要实现 Cocos 兼容。

本计划是可独立落地的执行文档，不依赖其它任务计划或会话上下文。

任务完成后必须新增中文任务报告：

```text
tasks/99-vnicore-vni087-editor-parity-[utctime].md
```

UTC 时间戳命令：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/99-vnicore-vni087-editor-parity-260717-123456.md
```

## 2. 制定计划时已确认的编辑器更新

以下结论来自 2026-07-17 对当前工作区 `git diff` 的逐项对照。执行任务时必须重新查看 diff，以当时代码为准，不能只照抄本节。

当前被修改的编辑器文件：

```text
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/constants.ts
docs/anieditor5/src/coordinates.test.ts
docs/anieditor5/src/main.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/types.ts
```

当前 diff 统计：

```text
docs/anieditor5/src/animation_presets.ts |  349 ++++++++-
docs/anieditor5/src/constants.ts         |    2 +-
docs/anieditor5/src/coordinates.test.ts  |   62 ++
docs/anieditor5/src/main.ts              | 1131 +++++++++++++++++++++++++++---
docs/anieditor5/src/pixi_stage.ts        |  117 ++--
docs/anieditor5/src/project_state.ts     |  195 ++++++
docs/anieditor5/src/types.ts             |   30 +
```

### 2.1 schema 版本

- `VNI_VERSION` 从 `VNI_0.074` 升级到 `VNI_0.087`。
- 当前 `docs/anieditor5/export/*.json` 和图片没有出现同步 Git diff，即当前仓库内没有可直接声称为“真实 VNI_0.087 导出”的新 fixture。
- 不得手改 `docs/anieditor5/export` 中的旧 JSON 版本号来伪造新导出。单元测试可使用明确标记为 synthetic contract fixture 的最小项目，但不能把它冒充真实编辑器导出。

### 2.2 新增基础属性多点轨道

`V5GLayerConfig` 新增可选 `basicAnimation`，包含 6 条独立轨道：

```text
opacity
positionX
positionY
scaleX
scaleY
rotation
```

每条轨道包含：

```ts
{
  enabled: boolean;
  points: Array<{
    id: string;
    time: number;
    value: number;
    easing: "linear" | "easeInQuad" | "easeOutQuad" | "easeInOutQuad" | "backOut";
  }>;
}
```

编辑器的采样语义：

- 六条轨道各自采样，轨道未启用或没有点时使用 layer 基础值。
- `time <= first.time` 时使用第一个点的值。
- `time >= last.time` 时使用最后一个点的值。
- 中间段使用“到达点，即右侧点”的 easing。
- 基础轨道先于 preset / particle animation stack 采样；后续 `move` / `pulse` / `rotate` / 粒子等都以基础轨道的当前结果为 base。
- X/Y/缩放/旋转/透明度都在编辑器预览采样边界保留 4 位小数，opacity 最后 clamp 到 `0..1`。

`project_state.ts` 中的 `normalizeLayerBasicAnimation()` 还会把旧 `layer.keyframes` 转换为 `basicAnimation`。这是编辑器打开旧项目时的迁移逻辑，不是 vnicore runtime 必须复制的容错。新导出在 `toExportProject()` 前会先完成 normalization。

### 2.3 新增 `bounce_jump`

`V5GAnimationType` 新增 `bounce_jump`，参数为：

```text
height
anticipationRatio
squash
stretch
topSquash
bounceCount
bounceDecay
landSquash
```

效果分为：

1. 蓄力段：轻微向下位移，X 变宽，Y 压扁。
2. 主跳段：使用抛物线 `4 * height * p * (1 - p)` 向上位移。
3. 上飞段：根据速度拉伸 Y，对 X 做补偿。
4. 顶点：应用 `topSquash`。
5. 落地与后续反弹：按 `bounceDecay` 递减高度和落地压缩。

编辑器实现每帧会构造 `lobeHeights` 数组并 `reduce/findIndex`。runtime 要保持完全相同的数学结果，但不应复制每帧分配。

### 2.4 `rotate` 参数与视觉结构升级

新建 rotate 动画不再使用 `fromRotation/toRotation`，改为：

```text
turns
direction
accelRatio
decelRatio
pressure
pressureStretch
```

新语义：

- `turns * 360 * direction` 决定总旋转角度。
- 普通 animation easing 先应用，再进入新的 `easeSpinProgress()` 加速/匀速/减速积分进度。
- `accelRatio + decelRatio > 0.95` 时按两者比例缩放到总和 `0.95`。
- `pressure <= 0.001` 时，和普通 rotate 一样把旋转累加到 layer transform。
- `pressure > 0.001` 时，外层 layer 保持不旋转，只固定应用：

  ```text
  scaleX *= 1 + pressure * pressureStretch
  scaleY *= max(0.1, 1 - pressure)
  ```

  内层图片/文字通过独立 `visualRotation` 继续旋转，从而形成“外轮廓维持竖向椭圆，内容继续转动”的压力旋转。

编辑器保留了旧项目兼容：只有当 `params` 自身存在 `turns` 时走新路径，否则继续采样 `fromRotation/toRotation`。vnicore 也必须保留旧已导出项目的这一明确兼容，但不允许缺少一半参数后猜默认值。

### 2.5 播放重启和 Pixi 预览状态清理

`pixi_stage.ts` 新增 `resetAnimationRenderState()`：

- 清理预合成图层。
- 销毁粒子容器的遗留 child。
- 把粒子容器的 visibility/renderable/alpha/position/scale/rotation/mask 恢复到干净状态。
- 重新应用 layer transform。

这反映了编辑器修复的重播污染问题，但 vnicore 不需要逐行复制编辑器容器逻辑。必须对照 `VNIPlayer.restart()`、`seek()`、range/segmented start、loop 回绕、project destroy 现有清理路径，只修正能被测试证明的遗留问题。

### 2.6 不属于 runtime 的编辑器变更

以下修改不要搬到 vnicore 或 viewer：

- timeline 动画多选、成组拖动和选中状态。
- 基础轨道面板的 DOM 编辑、复制/粘贴、拖动点、模块展开/折叠。
- 临时 solo layer 时对 mask wrapper 的编辑器交互处理。
- 编辑器自动扩展 project duration、自动保存、undo 和状态提示。
- 编辑器的缺资源占位框、旧 keyframes 迁移和表单默认值。

## 3. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

工具链：

- Node.js `>=24.0.0`
- `pnpm`
- TypeScript monorepo + Turbo
- Vite
- Vitest
- ESLint
- Prettier
- Pixi.js v8

如果依赖下载失败，使用：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。如果确实调整依赖，必须执行 `pnpm install`，并在任务报告说明 `pnpm-lock.yaml` 的变化。

如果是测试导致一些奇怪写法，就修改测试，不要修改不该改的生产逻辑，以免后续问题难以排查。

任务中的数据和资源错误必须尽早暴露：

- 不允许未知 animation type 回落到 `idle`。
- 不允许 `bounce_jump` / 新 rotate / basic track 缺参后悄悄用编辑器 UI 默认值。
- 不允许错误 easing 回落到 `linear`。
- 不允许丢图后画占位素材。
- 不允许 viewer 复制 sampler、轨道解析或 Pixi 私有 display tree 操作。
- 不允许为 Cocos-compatible / `legacy_alpha` 新增 vnicore 播放路径。

当前工作区已有用户的编辑器修改，不得回滚、覆盖或格式化无关文件。

## 4. 必须先做的现状复核

执行开始时先运行：

```bash
git status --short --untracked-files=all
git diff --stat -- docs/anieditor5/src docs/anieditor5/export packages/vnicore apps/anieditorv5viewer AGENTS.md
git diff -- docs/anieditor5/src/constants.ts docs/anieditor5/src/types.ts
git diff -- docs/anieditor5/src/animation_presets.ts docs/anieditor5/src/coordinates.test.ts
git diff -- docs/anieditor5/src/main.ts docs/anieditor5/src/project_state.ts docs/anieditor5/src/pixi_stage.ts
git log --oneline --decorate -12 -- docs/anieditor5/src packages/vnicore apps/anieditorv5viewer
```

要求：

1. 确认编辑器 diff 是否在执行期间继续变化。如果又出现新 animation/effect/schema 变更，必须先补完对照表，再开始实现。
2. 确认 `docs/anieditor5/export` 是否出现真实新导出。如果有，它们是最高优先级的集成 fixture 来源，必须同时处理 JSON 和实际引用图片。
3. 确认 `apps/anieditorv5viewer` 仍是上传 zip 的 shell，不恢复旧内置 asset registry。
4. 确认 `packages/vnicore` 和 viewer 中没有与当前任务重叠的未提交用户改动。如果有，先分析归属，不覆盖。

`docs/anieditor5` 当前没有独立 `package.json`，不在 pnpm workspace 中。本任务把其 `src` 当作 Pixi 预览和导出合同源码审计，不能在报告中编造不存在的 editor test/build 命令。如执行时编辑器已新增可运行工程，再按其真实 scripts 补充验证。

## 5. 必须阅读的文件

执行者至少完整阅读：

```text
AGENTS.md
docs/anieditor5/src/constants.ts
docs/anieditor5/src/types.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/coordinates.test.ts
docs/anieditor5/src/main.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/export_project.ts
docs/anieditor5/export/*.json
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/timeline-progress.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/precomposed-light-mask.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/src/pixi/index.ts
packages/vnicore/tests/core/animation-sampler.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/usage-en.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/*
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/tests/fixture-zips.ts
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/tests/uploaded-zip-project.test.ts
apps/anieditorv5viewer/README.md
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/src/win-amount/vni-tier-effect.ts
```

重点做函数级对照：

```text
docs/anieditor5/src/animation_presets.ts
  sampleLayerAnimationsAtTime()
  sampleBounceJump()
  sampleRotate()
  easeSpinProgress()
  getAnimationProgressForSampling()
  shouldHideLayerOutsideActiveAnimation()

docs/anieditor5/src/main.ts
  sampleBasicTrack()
  sampleBasicAnimationAtTime()
  applyAnimatedLayersAtTime()
  startPlaybackFromCurrentPosition()

docs/anieditor5/src/project_state.ts
  normalizeProjectBasicAnimations()
  normalizeLayerBasicAnimation()
  normalizeBasicTrack()
  toExportProject()

docs/anieditor5/src/pixi_stage.ts
  resetAnimationRenderState()
  applyDisplayContentRotation()
  applyLayerTransform()
  applyMaskTransform()
  syncPrecomposedLightMask()
```

## 6. 实施边界

### 6.1 必须实现

- VNI `basicAnimation` 六轨道的严格 schema、高效采样和 preset 叠加顺序。
- `bounce_jump` 的完整蓄力/起跳/顶点/落地/衰减反弹效果。
- 新 rotate 参数、加减速积分进度、pressure 外形和内容旋转分离。
- 旧 `fromRotation/toRotation` rotate 的明确兼容。
- Pixi layer instance 的外层 transform / 内层 content 结构，且不破坏 sequence、mask、precompose、text binding、粒子/效果 sibling 顺序和资源缩放补偿。
- restart/seek/range/segmented/loop/destroy 后没有遗留内层旋转、粒子、mask 或预合成状态。
- viewer 通过 vnicore public API 上传、校验、播放 VNI_0.087 合同项目，并在 summary/文档中正确反映新能力。
- 单元、Pixi 结构、viewer zip 和真实消费者回归验证。

### 6.2 明确不做

- 不修改 `packages/anieditorv5runtime-cc`。
- 不实现 Cocos-compatible / `legacy_alpha` runtime 路径。
- 不把编辑器的 timeline/DOM/undo/autosave 逻辑搬到 runtime。
- 不在 vnicore 中复制 `keyframes -> basicAnimation` 迁移；非空旧 `layer.keyframes` 仍显式失败。
- 不把 stage background 当成 runtime 渲染元素。
- 不让 `VNIPlayer` 拥有 `PIXI.Application`、renderer、canvas 或 DOM 容器。
- 不为测试暴露或依赖 private Pixi display tree。必要的结构断言应使用公开 display root 和可稳定识别的 label/属性。

## 7. 详细实施步骤

### 7.1 建立编辑器→runtime 对照矩阵

在写生产代码前，先用临时笔记或直接在任务报告草稿中列出：

| 编辑器合同 | vnicore 当前状态 | 目标文件 | 验证方式 |
| --- | --- | --- | --- |
| `basicAnimation` 类型 | 缺失 | core types/validation | parse + invalid cases |
| 基础轨道先采样 | 缺失 | basic sampler/project sampler | golden vectors |
| `bounce_jump` | 缺失 | animation sampler | 边界/中间帧 |
| 新 rotate | 仅旧 from/to | animation sampler/validation | old + new schema |
| `visualRotation` | 缺失 | sampled state/layer instance | Pixi outer/inner assertion |
| 播放重置 | 已有部分清理 | VNIPlayer | replay pollution tests |
| viewer VNI_0.087 | 未验证 | viewer tests/docs | synthetic upload zip |

该矩阵只用来防漏，不要创建另一份 runtime 参数表。代码的唯一语义源仍是编辑器导出合同和 vnicore core。

### 7.2 core 类型

修改 `packages/vnicore/src/core/types.ts`：

- `V5GAnimationType` / `VNIAnimationType` 增加 `bounce_jump`。
- 增加：

  ```text
  V5GBasicAnimationEasing
  V5GBasicAnimationPointConfig
  V5GBasicAnimationTrackConfig
  V5GBasicAnimationConfig
  ```

- `V5GLayerConfig` / `VNILayerConfig` 增加可选 `basicAnimation`。
- `V5GAnimationSampleResult` 或对应采样结果增加可选/规范化的 `visualRotation`。
- `SampledLayerState` 必须携带当前帧 `visualRotation`，供 Pixi adapter 使用。
- VNI alias 和 `core/index.ts` public export 同步，避免使用者必须 import 内部文件。

`basicAnimation` 对旧 VNI 项目保持可选：字段整体缺失时就是静态 layer base，这是明确的旧导出兼容，不是对 malformed VNI_0.087 的隐藏默认。

### 7.3 `basicAnimation` 严格解析和校验

修改 `packages/vnicore/src/core/validation.ts`：

- `assertV5GProject()` 不能在构造 `V5GLayerConfig` 时丢弃 `basicAnimation`。
- `basicAnimation` 存在时，严格解析六条轨道；不用 `Number(...)`、不把 string 数字转成 number。
- 每个 point 的 `id` 必须是非空 string，`time/value` 必须是 finite number，`easing` 必须在已支持列表中。
- point `time` 必须在 `0..project.stage.duration` 内。编辑器的全局 normalization 上限是 3600s，但 runtime 项目的实际上限应以当前 `stage.duration` 为准。
- 值范围与编辑器导出 normalization 一致：

  ```text
  opacity:   0..1
  positionX: -5000..5000
  positionY: -5000..5000
  scaleX:    0..20
  scaleY:    0..20
  rotation:  -36000..36000
  ```

- 每条轨道最多 200 个点，超出时失败，不像编辑器导入 normalization 那样静默 `slice(0, 200)`。
- 要求 points 已按 time 非递减排列；同时间点可保留稳定输入顺序。真实导出已排序，runtime 不应每帧代为修正。
- `enabled: true` 但 points 为空的轨道按编辑器采样语义使用 base，不必人为拒绝；但不得自动插入默认点。
- 继续拒绝非空 legacy `layer.keyframes`，不在 runtime 中做迁移。

测试要单独覆盖：缺 track、错类型、NaN/Infinity、超范围、未知 easing、超出 stage、超 200 点、逆序、非空 legacy keyframes。

### 7.4 基础轨道采样器

建议新增专用模块：

```text
packages/vnicore/src/core/basic-animation.ts
```

或放入 `project-sampler.ts`，但不要把这段逻辑复制到 viewer / Pixi adapter。

实现语义：

```text
disabled or empty -> baseValue
time <= first.time -> first.value
time >= last.time -> last.value
segment easing -> rightPoint.easing
value -> left.value + (right.value - left.value) * easedProgress
```

必须注意：

- `backOut` 可以超调，不得用会 clamp ratio 的普通 lerp 把超调抹掉。
- 同时间点的分段分母按编辑器使用 `max(0.0001, right.time - left.time)`。
- 不得每帧 `[...points].sort(...)`。校验后的 points 已有序，采样可以直接线性扫描（最多 200 点）或用不分配的二分查找。
- 不得每帧 clone 六条轨道。
- 采样结果按编辑器保留 4 位小数，opacity clamp 到 `0..1`。
- `sampleLayerAtTime()` 必须先得到 basic sample，再将它作为 `sampleLayerAnimationsAtTime()` 的 base。
- 粒子、safe glow、deterministic effects、mask source 和 sequence 应自然使用最终 sampled transform，不在各自分支里另外采样 basic track。

### 7.5 `bounce_jump` 采样与性能

修改 `packages/vnicore/src/core/animation-sampler.ts`：

- 在支持列表和 default easing 表中增加 `bounce_jump: "linear"`。
- 采样顺序与编辑器一致，位于 `pop` 之后、`shake` 之前。
- 逐项复制 `sampleBounceJump()` 的 clamp 范围、蓄力 wave、easeOutQuad、lobe 时间权重、抛物线、velocity/stretch、apex、landing 和 decay 数学式。
- 位置 Y 是编辑器中心坐标的正方向：`offsetY > 0` 是向上。不要因 Pixi 屏幕 Y 向下而在 core sampler 里反号，坐标转换仍由 `editorToPixi()` 负责。
- 不要把 `bounce_jump` 加到 ended-transform persistence；它只在自身 active 区间（包括精确末帧）参与采样。

校验方面：

- 8 个参数都是必需 finite number。
- 范围与编辑器 preset 一致：

  ```text
  height             0..5000
  anticipationRatio  0.02..0.6
  squash             0..0.9
  stretch            0..0.9
  topSquash          0..0.6
  bounceCount        integer 0..8
  bounceDecay        0.05..0.95
  landSquash         0..0.9
  ```

- runtime 不应使用 sampler 内 clamp 来代替项目校验；malformed export 在初始化阶段失败。sampler 仍保留与编辑器相同的 clamp，用于数学语义一致。

性能要求：

- 不每帧 `Array.from/reduce`。
- 可用 `WeakMap<V5GAnimationConfig, CacheEntry>` 缓存 lobe heights 和 total weight。
- cache key 至少覆盖 `height/bounceCount/bounceDecay`，确保宿主在开发态热更 animation params 时不读旧数据。
- 缓存数学顺序要与编辑器一致，特别是 `height=0` 时所有 lobe height 相等，不得因“优化”改变编辑器 `findIndex` 得到的 decay index 语义。

### 7.6 新旧 rotate 两条显式合同

修改 validation：

1. legacy rotate：要求 `fromRotation` 和 `toRotation` 都为 finite number。
2. VNI_0.087 rotate：要求 `turns/direction/accelRatio/decelRatio/pressure/pressureStretch` 都存在且为 finite number。
3. `direction` 只接受编辑器 select 实际导出的 `1 | -1`。
4. 范围：

   ```text
   turns            -120..120
   accelRatio       0..0.8
   decelRatio       0..0.8
   pressure         0..0.8
   pressureStretch  0..1
   ```

5. 部分新参数、部分旧参数、或两组混用都不是正常导出合同，应显式失败，不猜测。如执行时真实 VNI_0.087 导出证明编辑器会保留旧字段，则以真实导出为准：只要存在 own `turns` 就走新路径，并在报告中记录证据。

修改 sampler：

- legacy 路径保留现有 `fromRotation -> toRotation` 和普通 easing 语义。
- 新路径先接收已应用 animation easing 的 progress，再严格调用与编辑器一致的 `easeSpinProgress()`。
- `easeSpinProgress()` 的面积归一化、accel 二次项、linear span 和 decel 积分公式必须逐项一致。
- pressure 为 0 时不要建立另一套展示对象；只是 `visualRotation=0` 的普通采样。
- pressure 开启时只转内容，外层 transform.rotation 保留 basic animation 和其它 animation 在当前堆叠顺序产生的值；新 rotate 自身的旋转量只进 `visualRotation`。
- 多个 pressure rotate 在同帧活跃时，`visualRotation` 按 animation stack 顺序累加。

### 7.7 Pixi outer/content 结构

当前 `V5GLayerInstance.display` 对 image/sequence 直接是 `PIXI.Sprite`，无法表达编辑器“外层压扁但内容独立旋转”的结构。需要在 `packages/vnicore/src/pixi/layer-instance.ts` 建立稳定分层：

```text
layer root / outer transform container
└── content container
    └── sprite | sequence sprite | text | attached text replacement
```

责任分配：

- root：position、scaleX/scaleY、transform.rotation、alpha、visible/renderable、blendMode、target mask。
- content：`visualRotation`，每帧显式赋值，包括回到 0，不允许沿用前一帧。
- sprite：anchor、texture、asset logical size / texture size compensation。

重构时必须逐项确认：

- `updateLayerInstanceDisplayAsset()` 只更换内容 sprite texture/anchor/compensation，不重建 root/content。
- sequence 切帧不重建容器。
- text layer 的 original text 和 `attachNodeToTextLayer()` 绑定都挂在 content 下，使替换文字/图片和编辑器内容一样受 `visualRotation` 影响。
- group-slot 外部插入仍是项目层级 sibling，不受某个 layer 的 content rotation 影响。
- safe glow、render effects、deterministic effects、chaser light、live particles 仍按编辑器语义作为 layer runtime sibling，不把 `visualRotation` 错误传给粒子/效果。
- `insertLayerRuntimeDisplay()` / `getLayerRuntimeDisplayOrder()` 仍以 layer root 为稳定锚点，不破坏层间顺序。
- native mask 挂在 layer root。mask source 按编辑器 `applyMaskTransform()` 只使用 sampled transform，不应用 `visualRotation`。
- `precompose_light_alpha` 的编辑器当前也只把 transform 写入 canvas/cache key，没有把 `visualRotation` 写入预合成图。vnicore 必须匹配当前编辑器实际效果，不要自行“修正”这个边界。
- destroy 时只销毁当前 layer instance 拥有的容器/节点，不销毁由上层 texture cache 共享的 texture source。

不得为了压力旋转每帧创建/销毁 container。root/content 只在 layer instance 初始化时建立一次。

### 7.8 播放清理审计

对 `VNIPlayer` 的以下路径分别建测试：

```text
restart()
seek()
playRange()
segmented playback start/end
full timeline loop boundary
range loop boundary
destroy()
```

每条路径验证：

- root/content transform 恢复到目标时间点，无遗留 `visualRotation`。
- live particle runtime 不携带上一轮已结束粒子。
- deterministic/safe glow/chaser light 的 pool 只复用所需对象，多余对象不可见。
- native mask/precomposed mask 按新采样更新，输入不变时仍复用 cache，不因 restart 无条件重建纹理。
- destroy 后无 ticker、listener、runtime sprite、mask texture 或挂载节点泄漏。

如果现有 vnicore 已正确覆盖某条路径，保留实现，只增加防回归测试。不要为了形式上对应编辑器的 `resetAnimationRenderState()` 而重写已正确的 runtime 状态机。

### 7.9 viewer 同步

`apps/anieditorv5viewer` 继续保持轻量 shell：

- upload/zip path/profile/asset URL 生命周期属于 viewer。
- schema、basic track、animation params、采样、Pixi 结构和播放状态机属于 vnicore。
- viewer 不得读取 layer instance private field 来实现 pressure rotation。

更新点：

- 上传 VNI_0.087 合同项目时可正常通过 `assertVNIProject()` / `validateVNIProject()` 并交给 `VNIPlayer`。
- animation summary 会自然显示 `bounce_jump`。
- 在 summary 中新增简洁的 basic animation 信息，例如已启用轨道数和点数，仅做数据展示，不做采样。
- README 从“非空 layer keyframes 不支持”区分出“`basicAnimation` 已支持，legacy `keyframes` 仍拒绝”。
- README 增加 VNI_0.087 `bounce_jump`、新 rotate、pressure visual rotation 和 basic-before-preset 语义。

不要恢复 viewer 内置项目列表或把测试 fixture 打包进生产资源。

### 7.10 fixture 和黄金数值

由于当前 `docs/anieditor5/export` 没有新导出，测试分两层：

1. synthetic contract fixture：
   - 在 vnicore/viewer 测试 helper 中构造最小 `VNI_0.087` project。
   - 包含一个 basic animation layer、一个 `bounce_jump`、一个新 rotate（pressure > 0）和一个 legacy rotate。
   - 使用现有测试 texture/PNG helper，不引入生产 fallback asset。
   - 在 viewer 测试中用 `fflate` 内存构造 zip，不提交无法审查来源的二进制 zip。
2. editor golden vectors：
   - 从当前 `docs/anieditor5/src` 公式在固定参数/固定时间点得到显式数值表。
   - 测试直接断言数值，不在 test helper 里复制一份相同公式，否则会形成同源错误的假阳性。
   - 至少覆盖：基础轨道首点/段中/末点/超调，bounce 蓄力中点/主跳上飞/顶点/落地/反弹，rotate 加速/匀速/减速/末帧，pressure 外缩放+内旋转。

如执行时出现真实 VNI_0.087 导出：

- 优先用真实导出做 integration fixture。
- 同步它引用的完整资源闭包，不只复制 JSON。
- 用 `cmp` 或 SHA-256 证明 fixture 与导出源字节一致。
- 在报告写明导出文件名、schemaVersion、涉及的新能力和资源闭包。

### 7.11 文档和 examples

至少更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/usage-en.md
packages/vnicore/docs/migration-from-viewer-zh.md
apps/anieditorv5viewer/README.md
```

文档必须说明：

- `basicAnimation` 先于 preset stack 采样。
- 轨道端点持续、段 easing 属于右点。
- `bounce_jump` 的参数和活跃区间。
- 新 rotate 和 legacy rotate 的区分。
- pressure rotation 会分离外层椭圆和内容旋转。
- `visualRotation` 是 runtime sampled/Pixi adapter 内部效果，宿主不应直接操作内层容器。
- vnicore 不支持 Cocos-compatible `legacy_alpha`，不因 JSON 中的历史 `engineTarget` 元数据改变 Pixi runtime 定位。
- 非空 legacy `keyframes` 仍拒绝，不在 runtime 中迁移。

更新至少一个 example 或新增一个小 example，展示如何对已校验 VNI_0.087 project 做采样/播放，但不在 example 里复制 animation 算法。

### 7.12 `AGENTS.md`

这次新增的是长期 runtime 所有权和效果合同，需要同步更新根 `AGENTS.md`（大小写别名指向同一文件时只修改一次）：

- `packages/vnicore` 拥有 VNI_0.087 basic tracks、`bounce_jump`、新/legacy rotate、pressure visual rotation 语义。
- basic tracks 先于 preset/particle stack。
- viewer/game runtime 只调用 public API，不复制轨道、反弹、旋转、内层 Pixi display tree 算法。
- 继续强调 Pixi v8 与性能上限，不增加 Cocos 兼容支持。

只写持久协作规则，不把具体测试命令、临时 fixture 路径或任务进度写入 `AGENTS.md`。

## 8. 测试计划

### 8.1 core validation

在 `packages/vnicore/tests/core/validation.test.ts` 覆盖：

- 有效 VNI_0.087 basic animation。
- `basicAnimation` 缺失的旧项目。
- 六轨道结构与所有错误类型/范围。
- `bounce_jump` 必需参数和整数 `bounceCount`。
- 新 rotate 参数、旧 rotate 参数、部分/混合错误。
- unknown animation/easing 仍失败。
- 非空 legacy keyframes 仍失败。

### 8.2 core sampler

在 `animation-sampler.test.ts` 和 `project-sampler.test.ts` 覆盖：

- basic track 首点前、点上、段中、末点后。
- disabled/空轨道使用 base。
- right-point easing 与 `backOut` 超调。
- basic position + move，basic scale + pulse/bounce，basic rotation + rotate/swing 的叠加顺序。
- basic opacity 与 fade/sourceOpacity/visibility 的相互作用。
- `bounce_jump` 与编辑器 golden vectors 一致。
- `bounceCount=0`、多次衰减、`height=0`、精确末帧和结束后。
- rotate legacy/new，direction 正反，turns 正负，accel/decel 为 0、二者和超过 0.95，pressure 阈值上下。
- pressure 时 transform.rotation 不增加新 rotate 角度，`visualRotation` 正确增加。
- 多个 animation 稳定顺序叠加，不重置前面 animation 的结果。

### 8.3 Pixi layer/player

在 `packages/vnicore/tests/pixi/vni-player.test.ts` 覆盖：

- image/sequence/text 的 root/content 结构。
- root 应用 pressure scale，content 应用 `visualRotation`，sprite compensation 仍正确。
- 时间从 pressure active 移到 inactive 后 content rotation 显式回 0。
- sequence 换 texture 不重建 root/content。
- text 动态替换节点与 original text 都在 content 下，且 hide/show original 仍正确。
- runtime effect siblings 不跟随 content-only rotation。
- native mask 与 precompose cache 不因 layer instance 重构失效。
- restart/seek/loop/segmented/destroy 清理。
- 初始化后反复 update 不增加 root/content 实例数，不重建 texture。

### 8.4 viewer

在 viewer 测试覆盖：

- 上传 synthetic VNI_0.087 single-project zip 成功。
- 如使用 bundle，manifest/project profile 校验仍严格。
- summary 显示 schema、`bounce_jump`、basic enabled track/point 统计。
- play/seek/restart 仍只调用 `VNIPlayer` API。
- malformed basic/rotate/bounce 错误直接显示为 upload/runtime error，不渲染占位效果。
- profile 切换和重新上传会 revoke Blob URL 并 destroy 旧 player。

### 8.5 视觉对照

至少对照以下时间点：

```text
t = 0
蓄力段中点
主跳上飞段
主跳顶点
第一次落地
第一次反弹顶点
rotate accel 段
rotate 匀速段
rotate decel 段
t = animation end
restart 后 t = 0
```

对照内容包括：position、scaleX/Y、outer rotation、inner visual rotation、opacity、visible，以及 pressure 旋转的外部椭圆是否保持竖直。

如无可运行编辑器项目，就使用编辑器源码 golden vectors + viewer Pixi 实际画面 + scene graph 断言完成验收，不得声称做了无法执行的“编辑器自动截图对比”。

## 9. 执行命令与验收

先确认环境：

```bash
node --version
pnpm --version
```

vnicore：

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

vnicore 真实消费者回归：

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build
```

根级最终检查：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
git status --short --untracked-files=all
```

如果 pnpm 在非 TTY 环境报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，使用 `CI=true` 执行同一条命令，例如：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
```

不得为了让 root test 通过而改写与本任务无关的生产逻辑。如果某个旧测试锁定了已被新编辑器合同明确替换的旧行为，更新测试并在报告说明合同证据。

## 10. 完成定义

只有同时满足以下条件才能宣布任务完成：

1. vnicore 可严格解析和校验 VNI_0.087 `basicAnimation`、`bounce_jump` 和新 rotate。
2. basic track 采样顺序、bounce 公式、spin easing 和 pressure 内外分离与当前编辑器 Pixi 预览一致。
3. 旧 `fromRotation/toRotation` 导出继续播放，但 malformed 新导出不会隐藏回落。
4. 每帧无 basic track 排序、bounce lobe 数组分配、Pixi root/content 重建或纹理重建。
5. image/sequence/text/mask/precompose/effect/particle/text binding 没有因 layer instance 分层重构退化。
6. restart/seek/loop/range/segmented/destroy 无污染和泄漏。
7. viewer 可上传并播放 VNI_0.087 合同项目，不复制 runtime 算法。
8. vnicore、viewer、rendercore 和根级验收通过，或对与本任务无关的已有失败提供可复现证据。
9. 文档和 `AGENTS.md` 已同步长期合同。
10. 中文任务报告已生成，并包含真实命令结果和剩余风险。

## 11. 任务报告要求

报告文件：

```text
tasks/99-vnicore-vni087-editor-parity-[utctime].md
```

报告必须用中文，至少包含：

1. 实际开始时看到的 editor Git diff 和 VNI 版本。
2. 实际实现的 basic/bounce/rotate/visualRotation/reset 语义。
3. 新增或修改的主要文件。
4. 与编辑器一致的证据：golden vectors、Pixi 结构断言、真实导出（如有）、viewer 验收。
5. 性能设计：缓存键、无每帧分配点、root/content 复用、pool/texture 行为。
6. 所有实际执行的命令和 pass/fail 结果；不得写未执行的命令。
7. 如果使用了代理，记录原因和命令。
8. `pnpm-lock.yaml` 是否变化。
9. `AGENTS.md` 是否更新及具体增加的长期约束。
10. 未完成项、已知差异和剩余风险；不得用“应该没问题”替代证据。
