# 115 vnicore VNI 0.095 CardCarousel3D 任务计划

## 1. 任务目标

把 `docs/anieditor5/src` 最新的 VNI 0.095 Pixi 编辑器预览合同同步到：

```text
packages/vnicore
apps/anieditorv5viewer
```

本次新增的核心能力是 `card_carousel_3d`。同一份面向 vnicore 的 VNI 导出必须在编辑器 Pixi 预览、vnicore 和 viewer 中保持一致，包括：

- intro、idle、fast、stop、hold 五阶段及完整演示时间线；
- 卡片逻辑索引、序列帧贴图库循环映射、目标卡停中；
- 透视位置、缩放、透明度、倾斜、明暗、竖切片弯曲和深度叠放；
- 逐张 reveal、停止过冲、最终 pop/glow；
- source layer 显隐；
- seek、restart、loop、range/segmented playback 和 destroy 边界。

最高优先级只有两项：

1. **效果完全一致**：采样公式、时间边界、纹理选择、切片几何和 Pixi 叠放必须与编辑器一致。
2. **性能可用于游戏 runtime**：不能照搬编辑器每帧创建 `Map/Array/Container/Rectangle/Texture/Sprite` 和排序临时数组的预览写法；必须预计算、缓存和池化，同时保持相同结果。

`packages/vnicore` 是 Pixi.js v8 runtime。本任务不修改、不参考 `packages/anieditorv5runtime-cc` 的实现，也不增加 Cocos Creator 兼容路径。编辑器源码中的 Cocos 注释只说明历史背景，不是 vnicore 架构依据。

本计划可脱离会话上下文独立执行。

任务完成后必须新增中文报告：

```text
tasks/115-vnicore-vni095-card-carousel-3d-[utctime].md
```

UTC 时间戳命令：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/115-vnicore-vni095-card-carousel-3d-260721-123456.md
```

## 2. 真实源码基线

### 2.1 为什么当前 Codex worktree 仍是 0.087

制定本计划时存在两个 Git 工作树：

```text
Codex worktree:
/Users/zerro/.codex/worktrees/177b/slotclientengine

主仓库工作树:
/Users/zerro/github.com/slotclientengine
```

Codex worktree 的 HEAD 为 `6b9861c`，其已提交源码仍是 `VNI_0.087`。最新 `VNI_0.095` 位于主仓库工作树的未提交修改中；Git worktree 共享提交对象和 refs，但不会自动共享另一个工作树的未提交文件内容。

主仓库当前 editor diff：

```text
M docs/anieditor5/src/animation_presets.ts
M docs/anieditor5/src/constants.ts
M docs/anieditor5/src/main.ts
M docs/anieditor5/src/pixi_stage.ts
M docs/anieditor5/src/types.ts
```

统计：

```text
docs/anieditor5/src/animation_presets.ts | 393 +++++++++++++++++++++++
docs/anieditor5/src/constants.ts         |   2 +-
docs/anieditor5/src/main.ts              | 119 ++++++-
docs/anieditor5/src/pixi_stage.ts        | 516 +++++++++++++++++++++++++++++++
docs/anieditor5/src/types.ts             |   1 +
5 files changed, 1026 insertions(+), 5 deletions(-)
```

执行任务时必须从包含这些修改的工作树或后续正式提交读取源码，不能再只看 Codex worktree 的 `git diff`。

### 2.2 制定计划时的源码指纹

下列 SHA-256 用于确认执行时看到的是否仍是本计划审计过的版本：

```text
4dcccfd60431b9e8f29c9d7ec5fe572889f5a72e32bdb8fa79e8b0ba374c4c1a  animation_presets.ts
0b4fdb8c5cd26592d95b6a526f859f5e0e57c5eadd4512453e65420fda6ebc25  constants.ts
e72060f259756ab45c64ceb5a81c617ad85176861840799088e9c753ec2fa176  main.ts
256cc346fa5bf41757b16c79292d8cfe55a41e3fb82163c1b19146c45a4a32bb  pixi_stage.ts
fc2b63610581f1becc3dde3cfb7207a4564ae3bce2c0c90fb273e45a07fa0db7  types.ts
```

执行前运行：

```bash
git status --short --untracked-files=all
git -C /Users/zerro/github.com/slotclientengine status --short --untracked-files=all -- docs/anieditor5/src docs/anieditor5/export
git -C /Users/zerro/github.com/slotclientengine diff --stat -- docs/anieditor5/src docs/anieditor5/export
git -C /Users/zerro/github.com/slotclientengine diff -- docs/anieditor5/src/constants.ts docs/anieditor5/src/types.ts
git -C /Users/zerro/github.com/slotclientengine diff -- docs/anieditor5/src/animation_presets.ts
git -C /Users/zerro/github.com/slotclientengine diff -- docs/anieditor5/src/main.ts
git -C /Users/zerro/github.com/slotclientengine diff -- docs/anieditor5/src/pixi_stage.ts
shasum -a 256 /Users/zerro/github.com/slotclientengine/docs/anieditor5/src/animation_presets.ts /Users/zerro/github.com/slotclientengine/docs/anieditor5/src/constants.ts /Users/zerro/github.com/slotclientengine/docs/anieditor5/src/main.ts /Users/zerro/github.com/slotclientengine/docs/anieditor5/src/pixi_stage.ts /Users/zerro/github.com/slotclientengine/docs/anieditor5/src/types.ts
```

如果源码已提交，改用包含 0.095 的提交与其父提交做同样的逐文件 diff。如果指纹或 diff 已变化，先补充合同矩阵，再实现新增差异；不能机械执行旧摘要。

不要修改、覆盖或清理主仓库工作树中的用户未提交源码。

## 3. 已确认的 VNI 0.095 更新

### 3.1 schema 与 animation type

- `VNI_VERSION` 从 `VNI_0.087` 升为 `VNI_0.095`。
- `V5GAnimationType` 新增 `card_carousel_3d`。
- 现有 VNI 0.087 basic tracks、`bounce_jump`、new/legacy rotate 和 pressure `visualRotation` 必须保持回归通过。

### 3.2 CardCarousel3D 参数合同

runtime 不使用编辑器 UI 默认值兜底。参数必须完整、类型正确并通过范围校验。

| 参数 | 类型 | 合法范围/枚举 | 语义 |
| --- | --- | --- | --- |
| `phasePreviewMode` | string | `full_demo\|intro\|idle\|fast\|stop\|hold` | 时间线预览模式 |
| `cardCount` | integer | `2..30` | 一圈逻辑卡片数，不等于纹理数 |
| `targetIndex` | integer | `0..cardCount-1` | 最终停中卡片 |
| `rounds` | number | `0..20` | stop 对齐前额外圈数 |
| `direction` | number enum | `1\|-1` | 旋转方向 |
| `introDuration` | number | `0.1..10` | intro 时长 |
| `introSpeed` | number | `0..8` | intro 圈/秒 |
| `revealDirection` | integer enum | `0\|1\|2` | 左到右、右到左、中间向两侧 |
| `revealStagger` | number | `0..2` | 相邻 reveal 起始间隔 |
| `revealOffsetX` | number | `-1000..1000` | reveal 横向偏移 |
| `revealScaleFrom` | number | `0.05..2` | reveal 起始缩放 |
| `demoIdleDuration` | number | `0.1..20` | full demo 的 idle 时长 |
| `idleSpeed` | number | `0..8` | idle 圈/秒 |
| `fastDuration` | number | `0.1..10` | fast 时长 |
| `fastSpeed` | number | `0..20` | fast 目标圈/秒 |
| `accelRatio` | number | `0..0.9` | fast 前段加速占比 |
| `stopDuration` | number | `0.1..10` | stop 时长 |
| `holdDuration` | number | `0..20` | hold 时长 |
| `stopOvershoot` | number | `0..2` | stop 越过目标后回落强度 |
| `finalPop` | number | `0..1` | 目标卡末段放大 |
| `finalGlow` | number | `0..1` | 目标卡末段提亮 |
| `radius` | number | `20..3000` | 转盘半径 |
| `cardSpacing` | number | `0.2..3` | 横向展开间距 |
| `perspective` | number | `0..1` | 纵深透视强度 |
| `slices` | integer | `2..48` | 每卡竖切片数 |
| `visibleRange` | number | `0.1..1` | 正面可见角范围比例 |
| `cardSize` | number | `20..1200` | 卡片最长边目标尺寸 |
| `centerScale` | number | `0.1..5` | 正中卡片缩放 |
| `sideScale` | number | `0.05..3` | 侧边卡片缩放 |
| `sideAlpha` | number | `0..1` | 侧边最低透明度 |
| `shadeStrength` | number | `0..0.9` | 深度/边缘变暗强度 |
| `curve` | number | `0..1` | 竖切片圆柱弯曲 |
| `tilt` | number | `0..45` | 侧边卡片倾斜角度 |
| `sourceOpacity` | number | `0..1` | 保留原图时的透明倍率 |
| `hideBack` | boolean | `true\|false` | 是否裁掉背面卡片 |
| `keepOriginal` | boolean | `true\|false` | 是否保留 source layer |

编辑器控件的 step 只影响输入交互，不应被误当成 JSON schema 的离散步长，除非最新 exporter 明确把它固化进合同。

### 3.3 五阶段与 duration 同步

编辑器新增以下阶段：

```text
intro -> idle -> fast -> stop -> hold
```

`full_demo` 的 animation duration 为五个阶段时长之和；单阶段模式的 duration 为对应阶段时长。结果按编辑器 timeline 的 `0.05s` step 进行 `snapTimelineSeconds()`，并限制到 `0.05..3600s`。

runtime validation 必须核对 animation duration 与 params 派生值一致，允许的浮点容差必须与仓库的四位小数/timeline rounding 规则一致。不能在播放时静默改写坏 JSON。

`phasePreviewMode` 当前只定义确定性时间线预览。源码虽然建议真实游戏由程序状态机驱动，但没有定义“任意长 idle 后如何保持角速度连续”“外部切换阶段的时间原点”等完整生产 API。本任务不能擅自发明第二套交互状态机；只实现导出中已经明确的确定性时间线合同。未来若需要交互式 phase controller，应单独设计公共 API，并复用本任务 sampler。

### 3.4 source layer 透明度

动画 active 时：

- `keepOriginal=false`：source layer opacity 为 `0`。
- `keepOriginal=true`：source layer opacity 为 `base.opacity * sourceOpacity`。
- CardCarousel3D effect 本身仍按 layer base opacity 计算卡片 alpha；不能因为 source 被隐藏而把 effect 一起隐藏。

### 3.5 序列帧贴图库

- image layer：所有逻辑卡复用 source texture。
- sequence layer：使用 `sequence.frameAssetIds` 对应纹理作为卡片贴图库。
- `cardCount` 始终是逻辑卡片数，不等于 frame 数。
- 第 `cardIndex` 张卡使用 `textures[cardIndex % textures.length]`。
- frame asset 必须从项目的精确资源闭包加载；缺 frame、缺 texture、尺寸错误要显式失败。
- 不得宽泛扫描 ZIP 或回退到任意图片。
- editor 注释中的“Cocos 运行时由程序传数组”不进入 vnicore。本任务只使用 VNI 导出已经显式引用的 image/sequence assets；viewer 因而能与编辑器预览一致。

### 3.6 旋转时间线

按编辑器公式保持：

1. `introRotation = direction * introSpeed * introDuration * 2π`。
2. `idleRotation = direction * idleSpeed * demoIdleDuration * 2π`。
3. fast 在 `fastDuration * accelRatio` 内从 idleSpeed 线性加速到 fastSpeed，积分得到 turns；其余时段恒定 fastSpeed。
4. stop 起点为 intro + idle + 完整 fast rotation。
5. 目标角为 `-targetIndex * 2π/cardCount`。
6. 按 direction 取正向或负向最短对齐 delta，再增加 `direction * rounds * 2π`。
7. stop 使用 `easeOutQuart(t)` 插值，并叠加：

   ```text
   direction * angleStep * stopOvershoot * sin(tπ) * t^1.2
   ```

8. hold 固定为 stopFinalRotation。

单阶段模式与 full demo 的 rotation 起点必须严格按 editor 实现：特别是 standalone `idle`/`fast` 从零角开始，而 standalone `stop` 仍从完整 intro + idle + fast 的 stopStartRotation 开始。

### 3.7 reveal、可见性和卡片几何

必须同步：

- reveal rank 的三种排序方式；相同 sort key 保持 cardIndex 稳定顺序。
- `revealWindow = max(0.08, introDuration - revealStagger * (cardCount - 1))`。
- reveal 使用 `easeOutQuad`，小于等于 `0.002` 不绘制。
- angle normalization 使用 `atan2(sin(angle), cos(angle))`。
- `hideBack && frontness < -0.05` 时不绘制。
- `abs(normalizedAngle) > π * visibleRange` 时不绘制。
- side、depth、perspectiveTravel、x/y、alpha、center/side scale 的指数插值。
- source transform 的 x/y、scaleX/Y、rotation、anchorX/Y 和 layer blendMode。
- target card 在 stop 最后 22% 的 `sin()` wave 上应用 finalPop/finalGlow。
- card 最长边按 `cardSize` 缩放；不同纹理尺寸不能错误共用同一补偿。

### 3.8 竖切片弯曲、明暗与叠放

每张可见卡分成 `slices` 个竖向 texture frame。必须匹配：

- source texture 的原始 frame x/y/width/height；
- slice frame 映射、中心位置和 anchor offset；
- horizontalCompression、effectiveCurve、localSliceAngle、sliceFacing；
- sliceWidthScale、bend、localX/localY；
- edgeShade、depthShade、targetGlow；
- tint channel 的 round 与 RGB 合成；
- card container rotation 为 layer base rotation + `side * tilt`；
- card z 为 `frontness + target final wave * 0.02`，从小到大绘制。

不能把 3D 效果简化成整张 Sprite 的 scale/skew；竖切片是编辑器视觉合同的一部分。

## 4. 不进入 vnicore 的编辑器逻辑

- 参数表单、tips、draft memory 和 DOM 更新。
- 自动改 animation block 长度、自动扩 project duration、auto-save 和 status message。
- 输入值的 fallback/clamp 修复；runtime 改为严格校验。
- 编辑器 `runtimeTextureCache` 的具体写法。
- Cocos Creator card array、Cocos phase controller 或兼容导出。

其中“animation duration 必须与阶段参数一致”是导出合同，仍需在 vnicore validation 中验证；只是不复制 editor UI 的自动修复。

## 5. 必须阅读的现有实现

执行者至少完整阅读：

```text
agents.md

/Users/zerro/github.com/slotclientengine/docs/anieditor5/src/constants.ts
/Users/zerro/github.com/slotclientengine/docs/anieditor5/src/types.ts
/Users/zerro/github.com/slotclientengine/docs/anieditor5/src/animation_presets.ts
/Users/zerro/github.com/slotclientengine/docs/anieditor5/src/main.ts
/Users/zerro/github.com/slotclientengine/docs/anieditor5/src/pixi_stage.ts

packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/timeline-progress.ts
packages/vnicore/src/core/sequence-layer.ts
packages/vnicore/src/core/effect-sampler.ts
packages/vnicore/src/core/render-effect-sampler.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/vni-player.ts

apps/anieditorv5viewer/src/runtime/uploaded-zip-project.ts
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
```

同时阅读对应 tests、README 和 API 文档。开始编码前在报告草稿中建立 editor → core sampler → Pixi renderer → viewer 的合同矩阵。

## 6. core 设计与落点

### 6.1 类型和 validation

更新：

```text
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/index.ts
```

要求：

- `V5GAnimationType`、supported type、default easing 和参数校验新增 `card_carousel_3d`。
- 所有表格参数完整必需；不得把 editor default 当 runtime fallback。
- 枚举、整数、finite、范围和交叉字段均严格验证。
- `targetIndex < cardCount`。
- duration 与 phasePreviewMode/阶段时长严格一致。
- 只允许 image/sequence texture-backed layer 使用该效果；group/text 显式失败。
- sequence 必须有非空 frameAssetIds，所有 id 存在且资源可加载。
- unknown preview mode、缺参数、数字字符串、`NaN/Infinity`、错误 boolean 立即失败。

### 6.2 独立纯采样模块

新增建议文件：

```text
packages/vnicore/src/core/card-carousel-3d.ts
packages/vnicore/tests/core/card-carousel-3d.test.ts
```

模块职责：

- 解析经过 validation 的完整参数为 prepared config。
- 预计算 angleStep、reveal rank、完整阶段时长、完整 fast rotation、stop start/final rotation 和静态常量。
- 按 normalized progress 采样 rotation、introElapsed、stopPhase。
- 输出稳定 card 顺序、texture index、container transform、alpha、z、target final effect 和每个 slice 的 frame/transform/tint 数据。
- 不依赖 Pixi、DOM、viewer 或 Cocos。
- 接受可复用 output buffer/scratch storage，runtime 热路径不每帧创建大数组/Map/对象；测试可通过辅助函数获得不可变快照。
- 所有坐标、角度、round/clamp 边界与编辑器一致。

`animation-sampler.ts` 只负责 source layer opacity；CardCarousel3D 的卡片几何由独立模块负责，不能把 400 行公式塞进通用 layer sampler。

### 6.3 project sampled state

更新 `project-sampler.ts`，为 texture-backed layer 暴露通用的 active CardCarousel3D 标记或可查询的 active animation，供 `VNIPlayer` 渲染。不得让 viewer 重新遍历并解释 params。

如果一个 layer 同时有多个 active `card_carousel_3d`，必须按编辑器 animation 稳定顺序逐个绘制；不能静默只取第一项。若设计决定禁止重叠，必须先确认 editor/exporter 也禁止并在 validation 显式报错，不能只在 renderer 中覆盖。

## 7. Pixi v8 renderer 设计

### 7.1 节点归属

每个 active CardCarousel3D 使用稳定 effect root，作为对应 layer runtime effect 节点插入 render group slot；它不是 source layer inner content 的 child，避免重复继承 transform。

建议结构：

```text
layer runtime slot
└── card-carousel effect root
    ├── card container (depth order)
    │   ├── slice sprite 0
    │   └── ...
    └── ...
```

source layer 继续由 `applySampledLayerState()` 控制 `keepOriginal/sourceOpacity`。effect root/card/slice 使用 sampler 已计算的最终状态。

### 7.2 纹理选择和切片缓存

- image layer 的 texture library 长度为 1。
- sequence layer 按 `frameAssetIds` 稳定顺序取得所有已加载 texture。
- slice texture cache key 至少包含 source texture identity、source frame、`slices`、sliceIndex。
- 每个唯一 source texture/slices 组合只创建一次 slice textures。
- slice texture 只拥有 frame view，不拥有共享 source；清理时使用不会销毁 source 的方式。
- source texture 或 frame 变化时不能复用错误 cache。
- player destroy 时释放所有 owned slice texture view 和 cache key。

不得像 editor preview 当前实现一样每帧 `new PIXI.Rectangle()` 和 `new PIXI.Texture()`。

### 7.3 卡片和 Sprite 池

- 每个 layer/animation 建立有上限的 card container/slice sprite pool。
- pool 最大规模由严格校验后的 `cardCount * slices` 决定，理论上限为 `30 * 48 = 1440` 个 slice sprite/animation。
- 初始化或配置变化边界创建节点；每帧只更新 texture、position、scale、rotation、alpha、tint、blendMode、visible 和 child order。
- 离开可见范围的 card/slice 设为隐藏或回池，不销毁重建。
- seek、restart、loop 和效果 inactive 时清空可见状态，不累积 child。
- texture library 中不同图片尺寸必须各自计算 baseTextureScale/frame/anchor offset。

### 7.4 深度顺序

卡片必须按 editor 的 z 从小到大显示，target 微量 z 只在 final wave 生效。可以重排稳定 card container child，也可以使用可证明等价的 Pixi 排序机制；相同 z 必须保持 cardIndex 稳定顺序。

不要每帧创建 `cards: []` 后 `.sort()`；使用复用的索引 buffer 和稳定原地排序，或利用环形角度推导等价顺序。优化前后要用 golden 验证每个 cardIndex 的 draw rank。

### 7.5 生命周期

覆盖：

- init 失败 rollback；
- seek 到 active/inactive 边界；
- restart；
- loop wrap；
- range playback；
- segmented start/loop/end；
- source layer sequence frame 正常更新时，CardCarousel texture library 不被错误缩成当前单帧；
- destroy 时 effect root、pool、slice textures、cache 和临时引用全部释放；
- host-driven `requestRender()` 路径正常。

CardCarousel3D 是确定性 render effect，不进入 live particle emit/drain；播放结束不能被当成粒子 drain 延长。

## 8. 性能验收

编辑器 `drawCardCarousel3D()` 为预览便利会在每帧进行：

- `Map`、`Array.from()`、两次排序和多个临时对象；
- 每卡 `new PIXI.Container()`；
- 每切片 `new PIXI.Rectangle/Texture/Sprite()`。

vnicore 必须保持公式但消除以上热路径创建。至少用确定性计数测试证明：

1. 初始化/首次激活后，连续 300 帧不新增 card container 和 slice sprite。
2. 相同 texture/slices 下连续 300 帧不新增 slice texture。
3. reveal、hideBack、visibleRange 变化只改变 active count/visible，不重建整个池。
4. restart/seek/loop 后节点 identity 保持。
5. destroy 后 cache/pool 归零，且共享 source texture 没有被 slice view 销毁。
6. 每帧不重新解析 params、生成 reveal rank 或构造 texture library。

不要使用容易受机器负载影响的严格毫秒阈值作为唯一性能测试。报告应给出节点/纹理/预计算次数和理论上限；如补 benchmark，墙钟结果只作辅助。

## 9. anieditorv5viewer 更新

viewer 继续只通过 vnicore 公共 API 播放上传 ZIP。

需要：

- summary 显示 `card_carousel_3d`、phasePreviewMode、cardCount、texture/frame 数、slices 和最大 slice 数，便于检查资源和性能；
- 上传 VNI 0.095 image-layer 和 sequence-layer fixture 后能播放；
- profile 切换、restart、seek、loop、segmented playback 保持工作；
- ZIP dispose/profile replace 时释放 object URL、player、slice texture cache 和 Pixi pool；
- validation/runtime 错误完整展示，不吞掉或回退。

viewer 不得：

- 复制 phase/rotation/reveal/card/slice 公式；
- 自己把 sequence frame 映射成 card texture；
- 直接操作 VNIPlayer private child/pool/texture cache；
- 缺 texture 时使用占位图；
- 根据 `engineTarget` 启用 Cocos 路径。

## 10. fixture 和 golden 策略

制定计划时 `docs/anieditor5/export` 没有 0.095 diff，因此没有真实新导出可直接提交为 fixture。

优先级：

1. 如果执行时出现真实 0.095 runtime ZIP，使用其 JSON 与精确资源闭包。
2. 否则建立明确命名为 synthetic contract 的最小 fixture：一个 image layer 版本和一个包含至少 3 个不同尺寸 frame 的 sequence layer 版本。
3. 不手改旧 export 的版本号来伪造真实 0.095 导出。
4. synthetic fixture 不能在报告中声称为编辑器真实导出。

golden 不能调用生产 sampler 生成 expected。应从 editor 源码公式固定输入后记录：

- 六个 phasePreviewMode；
- 每阶段 start/middle/end 与边界左右；
- direction `1/-1`；
- targetIndex 首、中、末；
- rounds 0/非 0；
- accelRatio 0、典型值、0.9；
- stopOvershoot 0/非 0；
- revealDirection 0/1/2；
- revealStagger 导致 revealWindow 取 0.08 下限；
- hideBack true/false、visibleRange 边界；
- image texture 和 sequence texture modulo；
- 不同宽高/atlas frame；
- anchor、负 scale、layer rotation/blendMode；
- finalPop/finalGlow wave；
- keepOriginal/sourceOpacity；
- equal-z 稳定顺序。

## 11. 测试文件规划

至少更新或新增：

```text
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/core/animation-sampler.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/card-carousel-3d.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts

apps/anieditorv5viewer/tests/fixture-zips.ts
apps/anieditorv5viewer/tests/uploaded-zip-project.test.ts
apps/anieditorv5viewer/tests/main.test.ts
```

若现有 effect test 的抽象更适合承载部分断言，可合理合并；但必须保持 core 数学、Pixi 生命周期、viewer 集成三层证据。

测试如果迫使生产代码出现 editor fallback、Cocos 分支、公共 API 泄漏或不自然 special case，优先修正测试/fixture。不要为通过测试改坏架构。

## 12. 自动化验收命令

环境：

```bash
node --version
pnpm --version
```

若依赖下载失败：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增依赖。确需修改依赖时执行 `pnpm install`，并在报告解释 `pnpm-lock.yaml` 变化。

vnicore：

```bash
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore examples:typecheck
CI=true pnpm --filter @slotclientengine/vnicore format:check
```

viewer：

```bash
CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer format:check
```

真实 consumer：

```bash
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore build
```

根级：

```bash
CI=true pnpm typecheck
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm build
git diff --check
```

根级已有失败或无关用户改动必须先证明归属并如实记录。不要顺手改无关生产代码或格式化整个仓库。

## 13. 视觉验收

当前仓库内 `docs/anieditor5` 没有独立 `package.json`/启动脚本，不能编造 editor build。若用户主仓库中的编辑器可通过外部环境运行，应使用同一 synthetic/真实项目在相同 stage/time 并排检查：

- intro reveal 三种顺序；
- idle/fast 速度与 fast 加速；
- stop 对齐、额外圈数、过冲回落；
- hold 目标位置；
- 卡片前后关系、侧向压缩、曲面切片接缝、tint；
- 不同 frame texture 的 index 映射与尺寸；
- final pop/glow；
- seek/restart/loop 无残影或节点增长。

若无法运行编辑器，只能声明“源码 golden + Pixi scene graph 自动验证通过”，不能把它写成肉眼效果已确认。报告要留下 viewer 启动和复现时间点。

## 14. 文档与长期约束

更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/usage-en.md
packages/vnicore/docs/migration-from-viewer-zh.md
apps/anieditorv5viewer/README.md
```

任务完成后需要更新 `agents.md`，记录长期边界：

- vnicore 拥有 VNI 0.095 `card_carousel_3d` 五阶段采样、sequence texture modulo、竖切片几何、深度顺序和 Pixi pool/cache 生命周期；
- viewer/game consumer 只使用公共 API，不复制公式或操作私有 Pixi tree；
- runtime 不增加 Cocos controller/asset-array/compatibility 路径；
- editor preview 的逐帧对象创建不能进入 runtime。

## 15. 完成标准

只有同时满足以下条件才能完成：

1. 重新核验真实 0.095 源码 diff/指纹，并完成合同矩阵。
2. `card_carousel_3d` 所有参数严格校验，无 editor fallback。
3. duration、五阶段旋转、reveal、几何、切片、tint、z、source opacity 与 editor golden 一致。
4. image/sequence texture library 和 modulo 映射正确，资源闭包严格。
5. CardCarousel Pixi 节点与 slice texture 稳定池化，300 帧计数测试无增长。
6. seek/restart/loop/range/segmented/destroy 生命周期无遗留。
7. viewer 通过公共 API 播放 0.095 fixture，未复制算法。
8. VNI 0.087 及其它既有效果回归通过。
9. vnicore/viewer 包级 typecheck、lint、test、build、format 全部通过。
10. rendercore consumer 和根级回归已执行并如实记录。
11. `git diff --check` 通过，未覆盖主仓库用户修改，未产生无关改动。
12. 文档、`agents.md` 和中文 UTC 报告已完成。

## 16. 任务报告必须包含

1. 开始时两个 worktree 的 Git 状态、HEAD、0.095 diff 和源码指纹。
2. editor → core → Pixi → viewer 合同矩阵。
3. 参数 validation 与 duration invariant。
4. 五阶段、reveal、卡片几何、slice/tint/z 的实现说明。
5. texture library、frame/modulo 和资源闭包说明。
6. pool/cache key、上限、失效与 destroy 策略。
7. 300 帧对象/纹理创建计数等性能证据。
8. fixture 是真实导出还是 synthetic contract。
9. 实际执行的全部命令与结果。
10. 与本任务无关的已有失败及证据。
11. 未实现 editor UI/Cocos fallback/controller 的边界说明。
12. 人工视觉验收状态、复现步骤和剩余风险。

