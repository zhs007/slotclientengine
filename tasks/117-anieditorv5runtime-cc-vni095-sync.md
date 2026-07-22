# 117 anieditorv5runtime-cc VNI 0.095 sync 任务计划

## 1. 任务目标

更新 `packages/anieditorv5runtime-cc`，把该包最后一次同步之后，编辑器与 `packages/vnicore` 已落地的 VNI runtime 合同完整同步到 Cocos Creator 3.8.6 runtime，覆盖 VNI 0.045、0.070、0.074、0.087、0.095 的增量能力，并补齐同期粒子语义修正。

本包仍是纯 Cocos Creator runtime：

- 第一目标是与 `docs/anieditor5/src` 当前编辑器预览/导出语义一致。
- 第二目标是稳定性能；编辑器为了预览方便而逐帧创建对象的写法不能直接进入 runtime。
- Cocos 与 Pixi 的差异只在 Cocos adapter、节点结构、坐标转换、纹理切片和生命周期层解决。
- runtime 只消费编辑器导出的 Cocos-compatible 项目；不得引入 Pixi、DOM、隐藏 renderer、canvas-to-texture 或 `vnicore` runtime 依赖。
- `standalone/anieditorv5runtime-cc.ts` 和 `standalone.zip` 是主要交付面，必须与模块化源码完全一致，不能只更新 workspace package。

本计划不依赖其它任务文档即可执行。任务完成后必须新增中文任务报告：

```text
tasks/117-anieditorv5runtime-cc-vni095-sync-[utctime].md
```

其中 UTC 时间通过以下命令生成：

```bash
date -u +%y%m%d-%H%M%S
```

例如：

```text
tasks/117-anieditorv5runtime-cc-vni095-sync-260722-123456.md
```

## 2. 制定计划时已确认的基线

执行时必须重新验证本节，不能把计划制定时的观察当成最终事实。

### 2.1 最后同步点

`packages/anieditorv5runtime-cc` 最近一次代码更新停在：

```text
82651dc 2026-07-06 feat(player): refactor playback event storage to use arrays for improved performance and clarity
```

该提交属于任务 85 的播放事件 release 修复。此时 Cocos runtime 已有：

- image/text layer、layer group、group slot；
- legacy alpha mask，显式拒绝 `precompose_light_alpha`；
- safe glow、chaser light；
- 旧基础 preset、已有 live particles；
- range/segmented playback、particle drain/force stop、playback event；
- Cocos Creator 3.8.6 driver；
- 模块化源码和单文件 standalone 两套实现。

当前 runtime 类型仍只有 `image | text | group`，fixture 最高为 `VNI_0.042`，尚未包含本任务要同步的新 layer/effect/schema。

### 2.2 最后同步点之后的真实 Git 更新

执行时先运行：

```bash
git log 82651dc..HEAD --date=iso-strict --reverse \
  --pretty=format:'%h %ad %s' -- \
  packages/vnicore docs/anieditor5/src docs/anieditor5/export_project.ts
git diff --stat 82651dc..HEAD -- packages/vnicore docs/anieditor5/src
git diff --name-status 82651dc..HEAD -- packages/vnicore docs/anieditor5/src
```

制定计划时确认到的增量如下：

| 提交/任务                                  | 更新                                                                                     | Cocos 同步结论                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `958378e`                                  | Pixi RAF 零时长 tick                                                                     | 不复制 RAF；Cocos player 是宿主 `update(deltaTime)` 驱动，只保留严格 delta 校验                                                |
| `fca318f` / 任务 86                        | VNI 0.045、项目级 `maskCompositeMode`、Pixi precompose light mask                        | 同步 schema；Cocos-compatible 只接受/执行 `legacy_alpha`，继续显式拒绝 `precompose_light_alpha`，不复制 Pixi cache/canvas 算法 |
| `8a9f4c4`、`57974ac`、`1f15a09`、`8bbd20a` | particle stream/twinkle、live elapsed、移动 emitter、segmented loop 粒子采样和 fade 修正 | 必须同步纯采样与 player 时序；保留 Cocos Y 轴转换和节点池                                                                      |
| `c02fcb5`                                  | vnicore package metadata / 文档补充                                                      | 无 Cocos runtime 算法；执行时只核对是否有需要同步到 Cocos README 的公共合同                                                    |
| `3a7c8b0` / 任务 87                        | VNI 0.070 sequence、闭区间时间语义、10 个 deterministic effects                          | 必须同步 schema、纯采样和 Cocos renderer                                                                                       |
| `272791f` / 任务 89                        | VNI 0.074 `multi_move`、结束 transform 持续、空帧隐藏                                    | 必须同步                                                                                                                       |
| `c4435db`                                  | Pixi viewport 100% 展示                                                                  | 不复制；Cocos root/canvas 适配继续由宿主负责                                                                                   |
| `aff2b91` / 任务 99                        | VNI 0.087 basic tracks、`bounce_jump`、新旧 rotate、pressure `visualRotation`            | 必须同步纯采样和 Cocos outer/content 节点结构                                                                                  |
| `ca0b8be`                                  | Pixi loader API 改名                                                                     | 不同步；Cocos runtime 不拥有 URL loader                                                                                        |
| `f4e1c40`                                  | vnicore asset manifest path rewrite API                                                  | 不同步；Cocos runtime 接收已解析 project 和 SpriteFrame，不解析 bundle/manifest                                                |
| `b0f0f7e` / 任务 115                       | VNI 0.095 `card_carousel_3d`                                                             | 必须同步纯采样、Cocos 切片 renderer、池/cache 和生命周期                                                                       |

任务 87、89、99、115 的执行报告都明确没有更新 `packages/anieditorv5runtime-cc`。本任务需要一次补齐这些遗漏，不能只把 schemaVersion 改到 0.095。

### 2.3 当前 standalone 状态

制定计划时确认：

- `standalone/anieditorv5runtime-cc.ts` 约 7400 行，仍是手工同步的单文件交付。
- `scripts/check-standalone.mjs` 检查只允许导入 `"cc"`，禁止 workspace/Pixi/DOM/Node/相对 import，并约束 ES2015。
- `tests/standalone/standalone-parity.test.ts` 会比较模块化与 standalone 的关键输出，但尚未覆盖新 VNI 能力。
- `standalone.zip` 被根 `.gitignore` 的 `*.zip` 忽略；制定计划时文件实际不存在。任务完成时必须重建并直接用 `test -f` / `zipinfo` 验证，不能用 `git status` 代替。

### 2.4 当前长期规则

仓库同时存在 `AGENTS.md` 和 `agents.md`，制定计划时二者字节一致。已有规则要求：

- vnicore Pixi runtime 与 Cocos runtime 不混用；
- Cocos runtime public 行为变更时，同步 modular、standalone、checker、standalone tests 和 zip；
- Cocos 能力必须通过 public driver/player API 落地；
- `legacy_alpha` 属于 Cocos 路径，`precompose_light_alpha` 在 Cocos 显式失败。

本任务完成后需要在两个文件中同步记录 Cocos runtime 已支持的新 VNI 合同和性能边界，并再次 `cmp`。

## 3. 仓库与环境约束

在仓库根目录执行：

```bash
git rev-parse --show-toplevel
node --version
pnpm --version
git status --short --untracked-files=all
git diff --stat
```

要求：

- Node.js `>=24.0.0`；
- 使用 `pnpm`，不改用 npm/yarn；
- 不回滚、覆盖或格式化用户已有的无关改动；
- 本任务原则上不需要新增第三方依赖；
- 如果必须改依赖，执行 `pnpm install` 并在报告说明 `pnpm-lock.yaml` 变化；
- 如果依赖下载失败，使用：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

- 非 TTY 下 pnpm 尝试重装依赖时，给验收命令加 `CI=true`；
- 如果是测试迫使生产代码出现奇怪 special case、fallback、宽松解析或错误架构，修改测试/fixture，不要扭曲生产逻辑；
- 缺字段、缺资源、错误类型、未知 effect、Cocos API 不可用、pool 越界都尽早显式失败，不增加占位图、默认纹理、文件名猜测、静默跳过或退回旧效果。

## 4. 必须阅读的源码

开始编码前，执行者必须完整阅读当前版本，而不是只看 Git diff。

### 4.1 编辑器合同来源

```text
docs/anieditor5/src/constants.ts
docs/anieditor5/src/types.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/export_project.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/main.ts
```

重点定位：

- Cocos-compatible 开关和 `legacy_alpha` 写入；
- sequence 当前帧；
- 10 个 VNI 0.070 effects 的公式、坐标方向、source opacity；
- `multi_move` points/easing/持续 transform；
- basic tracks、`bounce_jump`、新旧 rotate 和 pressure；
- `card_carousel_3d` 参数、五阶段、texture library、切片、可见性和 depth order。

### 4.2 已实现的纯语义参考

```text
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/timeline-progress.ts
packages/vnicore/src/core/sequence-layer.ts
packages/vnicore/src/core/multi-move.ts
packages/vnicore/src/core/basic-animation.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/particle-runtime.ts
packages/vnicore/src/core/effect-sampler.ts
packages/vnicore/src/core/card-carousel-3d.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/card-carousel-3d-renderer.ts
packages/vnicore/src/pixi/vni-player.ts
```

`vnicore` 可以作为已经验证过的纯数学/生命周期对照，但不能成为 Cocos package dependency，也不能把 Pixi display tree、loader、RAF、precompose cache、viewport 或 texture API 复制到 Cocos。

### 4.3 Cocos 当前实现

```text
packages/anieditorv5runtime-cc/src/core/*
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/tests/**/*
packages/anieditorv5runtime-cc/README.md
```

先建立一份 editor → pure core → Cocos driver/player → standalone → test 的对照矩阵，再开始改代码。

## 5. 范围与非目标

### 5.1 必须完成

- VNI 0.045 project mask mode 的 Cocos-compatible 严格合同。
- 同期 particle stream/twinkle/live segmented loop 修正。
- VNI 0.070 sequence layer 和 10 个 deterministic effects。
- VNI 0.074 `multi_move`。
- VNI 0.087 basic tracks、`bounce_jump`、新/legacy rotate、pressure `visualRotation`。
- VNI 0.095 `card_carousel_3d`。
- 模块化源码、Cocos driver、fake/shim、standalone、checker、测试、README、zip 全部同步。
- 对象池、切片 cache、预计算和销毁的性能证据。
- Cocos Creator 3.8.6 standalone 真实项目验收。
- 更新 `AGENTS.md` 与 `agents.md`。
- 写任务 117 中文执行报告。

### 5.2 明确不做

- 不让 package 依赖 `@slotclientengine/vnicore` 或 `pixi.js`。
- 不加入浏览器、DOM、RAF、URL/blob loader、bundle/profile 选择器。
- 不实现 Pixi `precompose_light_alpha`；Cocos-compatible 继续用 `legacy_alpha`。
- 不复制 vnicore 的 viewport fitting/scale、Pixi texture loader 或 CardCarousel Pixi renderer。
- 不把 Cocos compatibility 分支塞回 vnicore。
- 不新增 Cocos app 到 `apps/`；真实探针使用外部/临时 Cocos Creator 3.8.6 项目。
- 不顺手实现同步点之前就已明确不支持的 `shatter` / `glow`，除非执行中发现 VNI 0.070 新 effect 必须依赖同一公共 Cocos primitive；即便如此也必须单独说明范围变化，不能用 fallback 假装支持。
- 不把 synthetic fixture 说成真实编辑器导出。

## 6. 详细实现计划

### 6.1 先建立增量合同矩阵

对 `82651dc..HEAD` 的相关提交逐个列出：

- editor 字段/公式；
- vnicore core 落点；
- Pixi-only 部分；
- Cocos 必须落地的类型、纯 sampler、driver primitive、player renderer；
- 对应测试和 standalone parity。

矩阵至少包含第 2.2 节所有提交。报告中保留最终矩阵，避免以后再次靠任务编号猜同步范围。

### 6.2 类型、schema 与严格 validation

更新 `src/core/types.ts`、`src/core/validation.ts` 及对应 standalone 内容：

- `V5GLayerType` 增加 `sequence`。
- 增加 `V5GSequenceConfig`。
- project 增加可选 `maskCompositeMode`。
- layer 增加可选 `sequence`、`basicAnimation`。
- animation type 增加：
  - `multi_move`；
  - `bounce_jump`；
  - 10 个 VNI 0.070 deterministic effects；
  - `card_carousel_3d`。
- 增加 basic track/point/easing 类型。
- 同步所有 required number/string/boolean、整数、枚举、范围、字段互斥和交叉约束。
- `pointsJson` 只接受严格 JSON 字符串；不接受数字字符串、不补默认点。
- sequence 必须有非空 frame id、正 `cycleDuration`、boolean `loop`；每个 frame 必须引用真实 image asset。
- texture-backed effect 只允许 image/sequence；text/group 显式失败。
- project/layer 使用 `legacy_alpha` 时允许 Cocos；出现 `precompose_light_alpha` 时在 `validateCocosV5GProject()` 明确报错。
- project mode 和 enabled layer mask mode 冲突时显式失败，不能让顶层字段偷偷覆盖 layer。
- 未知 schema feature 不能仅因 `/^VNI_0\.\d+$/` 通过后被忽略；未知 layer/effect/字段类型必须在解析/校验阶段暴露。

保留既有旧 VNI fixture 兼容；可选新字段缺失时按旧合同工作，但新 effect 的必需参数不得用编辑器 UI default 兜底。

### 6.3 统一闭区间 timeline 语义

新增/同步独立的 `timeline-progress` helper，并让 animation、particle、safe glow、chaser light、render/deterministic effect 共用：

- `time === startTime` 为 progress `0`；
- `time === startTime + duration` 为 progress `1`；
- 仅在 `time > end` 后 inactive；
- duration 非法在 validation 失败，sampler 不静默修成另一个合同。

回归检查旧 scale-in 首帧隐藏、particle emission、segmented end、event boundary，不得为了统一 helper 破坏已通过的任务 85 行为。

### 6.4 同步粒子修正

从最后同步点逐项移植，而不是直接覆盖 Cocos 文件：

- particle stream radial spawn offset、随机 salt、velocity、trail fade/scale/rotation 公式；
- particle twinkle batch、cycle、live sampler；
- exact end frame；
- live particle `simulationTime`；
- segmented loop 下连续模拟时间、layer sample time 和移动 emitter；
- fade 参数与当前 layer opacity；
- source/current sequence frame 的纹理尺寸。

Cocos-specific 要求：

- 保留 `direction=270` 向上和 Cocos Y offset 转换；
- emitter 使用当前 sampled outer transform，不能固定在初始位置；
- 继续复用 layer particle node pool；
- 任务 77 的 force-stop/end/drain 时序不能回归；
- 每帧不为相同上限重新创建 Node/SpriteFrame。

### 6.5 sequence layer

新增 `sequence-layer` 纯 helper，严格按编辑器计算当前 frame：

- loop 在周期末回第 0 帧；
- non-loop 在末尾保持最后一帧；
- frame id/asset/尺寸缺失显式失败。

扩展 Cocos driver/player：

- 初始化时解析并缓存 sequence 全部 SpriteFrame；
- 同一个内容 Sprite 节点只切 `spriteFrame`，不销毁/重建节点；
- logical content size、anchor、fileScale metadata 按当前 frame 严格应用；
- mask、particle、safe glow、chaser light、deterministic effect 使用当前显示 frame；
- CardCarousel 使用完整 frame library，不误用当前单帧。

给 public node driver 增加最小必要的 `setImageSpriteFrame`/等价能力；不要从 player 强转真实 Cocos Sprite 或访问私有 component。

### 6.6 VNI 0.070 deterministic effects

新增 Cocos-neutral `effect-sampler.ts`，与编辑器/vnicore golden 对齐：

- `gather_particles`
- `smoke_mist`
- `energy_ring`
- `slash_light`
- `flame_flicker`
- `wave_band`
- `wave_distort`
- `speed_lines`
- `drift_fall`
- `path_particles`

要求：

- 所有输出确定性；seed、首尾帧、坐标方向、source opacity、keepOriginal、additive/blend 语义一致；
- `targetY/endY/windY` 等按编辑器到 Cocos 中心坐标合同处理，不能机械复用 Pixi Y 值；
- 普通 sprite effects 使用当前 frame SpriteFrame 和固定上限节点池；
- `wave_distort` 使用横向 SpriteFrame view/slice cache；
- `speed_lines` 使用 Cocos `Graphics` 或经过真实 3.8.6 探针确认的公共等价 API，并复用同一个 Graphics 节点/缓冲；
- effect root 作为 layer render slot 的稳定 sibling，不错误继承 pressure content-only rotation；
- inactive/seek/restart/loop/project destroy 时清空可见状态并释放 owned view，不销毁共享 atlas SpriteFrame/texture；
- diagnostics 分开记录 deterministic effect node/graphics/slice 数，不混进 live particle 数。

如果 Cocos 3.8.6 无法通过 public API 正确实现某个 effect，必须在编码前做最小真实 API probe 并给出证据；不能静默跳过或退回普通 sprite。任务目标是完整同步，未实现能力应让任务保持未完成。

### 6.7 VNI 0.074 `multi_move`

新增严格 parser/cache：

- 顶层必须为数组，至少两个点；
- x/y/time 必须 finite number；
- time 在 `0..duration` 且稳定排序规则与编辑器一致；
- easing 属于已支持集合；
- 相同 source/duration 复用解析结果，不逐帧 `JSON.parse`。

同步 sampler 行为：

- 按目标点 easing 分段插值；
- backOut overshoot 不被普通 lerp clamp 抹掉；
- `move/multi_move/slide_in/slide_out/squash_stretch` 在结束后持续最终 transform；
- 持续 transform 与“空帧是否可见”是两个独立判断。

### 6.8 VNI 0.087 basic tracks、bounce 和 rotate

新增 `basic-animation.ts` 并同步：

- opacity、positionX/Y、scaleX/Y、rotation 六轨；
- track point 输入保持非递减，右点 easing，首点前/末点后持续；
- 二分采样，不逐帧 sort/clone；
- basic sample 先成为 preset/particle stack 的 base；
- legacy 非空 `keyframes` 继续显式失败，不在 runtime 偷做编辑器迁移。

同步 `bounce_jump`：

- 蓄力、起跳、顶点、落地、衰减 bounce、末帧；
- 预计算 lobe/cache；参数变化时 cache 正确失效；
- 热路径不创建临时大数组。

同步 rotate：

- legacy `fromRotation/toRotation`；
- current `turns/direction/accelRatio/decelRatio/pressure/pressureStretch`；
- 两套字段缺失或混用显式失败；
- 加速/匀速/减速面积归一；
- pressure 小于等于阈值时写 outer rotation，大于阈值时 outer 只 pressure scale，旋转累加到 `visualRotation`。

Cocos 节点结构改为稳定双层：

```text
layer outer root       # sampled x/y/scale/rotation/opacity/visible/mask
└── layer content root # visualRotation、资源补偿
    └── Sprite | Label | sequence Sprite | text replacement
```

必须验证：

- 每帧显式写 content rotation，包括归零；
- seek/restart/loop/inactive 不残留 pressure rotation；
- text replacement 跟随 content；
- safe glow/chaser/effect/particle 的父层级与编辑器一致；
- legacy mask 重挂目标节点后 outer/content transform 不重复或丢失；
- group slot 和外部 mounted node 不受 layer 内部结构改变影响。

### 6.9 VNI 0.095 `card_carousel_3d`

新增独立纯模块 `card-carousel-3d.ts`：

- 完整严格参数解析和预计算；
- `full_demo | intro | idle | fast | stop | hold` 五阶段/预览模式；
- duration、角度、reveal、visibleRange、hideBack、stop、target final pop/glow；
- image 单纹理与 sequence frame modulo；
- 每卡几何、每切片几何、alpha/tint/depth order；
- 接收可复用 output/scratch buffer，避免逐帧 Map/Array/sort/临时对象。

Cocos renderer 设计：

```text
layer render slot
└── card-carousel effect root
    ├── card container (按稳定 depth order)
    │   ├── vertical slice sprite 0
    │   └── ...
    └── ...
```

实现要求：

- 通过 driver public API 创建/更新 effect root、card container、slice sprite；
- 使用 Cocos Creator 3.8.6 public SpriteFrame/texture rect API 创建竖切片 view；先用真实 Creator probe 确认 atlas frame、trim、rotated frame 的支持边界；
- slice cache key 至少包含 source SpriteFrame identity、source rect、slice count、slice index、方向；
- owned slice view 销毁时不能销毁共享 atlas source/texture；
- card/node pool 上限由 validation 后的 `cardCount * slices` 决定；越界显式失败；
- 预热后连续帧只更新状态和 child order，不 new Node/SpriteFrame/数组；
- 相同 z 保持 cardIndex 稳定；使用复用 index buffer/稳定原地排序；
- 多个 effect 的 root 和资源独立；
- inactive/seek/restart/loop/range/segmented/destroy 全生命周期清理；
- CardCarousel 是 deterministic render effect，不进入 live particle drain。

如果真实 Cocos SpriteFrame 无法安全切 atlas frame，不允许把整张 atlas 当切片 source、使用错误 UV 或隐藏复制 texture。应在报告中记录 API probe并采用已验证的 public Cocos 3.8.6 方案。

### 6.10 Cocos driver、fake 与 shim

只增加上述能力真正需要的最小 public driver primitive，例如：

- 更新 image node SpriteFrame；
- 创建/更新/销毁 owned SpriteFrame slice view；
- 设置 child/sibling 顺序；
- 创建和批量更新 Graphics line；
- 必要的 tint/color；
- 查询诊断用 node/view identity/count。

同步：

```text
src/cocos/node-driver.ts
src/cocos/cocos-node-driver.ts
tests/fakes/cc.ts
types/cc-3.8.6-shim.d.ts
```

规则：

- 真实 driver 只使用 Cocos Creator 3.8.6 已验证 API；
- fake 只模拟测试所需语义，不制造真实引擎不存在的便利 API；
- shim 只描述真实 standalone 所需 API；
- player 不直接依赖 fake 私有字段；
- unsupported API 立即报错，不退回另一种视觉。

### 6.11 player 管理、池和 diagnostics

为 sequence、deterministic effects、CardCarousel 建立显式 managed records。所有 map/pool/cache 都必须有唯一 owner 和清理路径。

扩展 `getRuntimeDiagnostics()`，至少能观察：

- source layer node；
- sequence frame switch（当前 asset/frame id）；
- deterministic sprite/graphics/slice 数；
- CardCarousel root/card/slice/owned view 数；
- 既有 particle/safeGlow/chaser/mask/text/mounted 计数。

diagnostics 只暴露稳定数据，不暴露可供宿主篡改的内部节点。

重点回归：

- init 中途失败 rollback；
- destroy 幂等；
- restart/seek/loop 不累积 child/cache；
- source SpriteFrame 仍可被其它 player 使用；
- project asset resolver/atlas 缺 frame 显式失败；
- playback event arrays、once remove、range/end epsilon 和任务 77 force-stop 语义不回归。

### 6.12 standalone 是同步主门槛

每完成一个独立能力，就同步：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/standalone/*
```

不要等所有模块化代码完成后才一次手抄 1 万行，避免漂移难查。standalone 必须：

- 只 import `"cc"`；
- 无相对/workspace/Pixi/DOM/Node import；
- ES2015 typecheck 通过；
- 不使用 `.includes()` 等当前 checker 禁止能力；
- 导出新 public types/helpers/player diagnostics；
- 与模块化 core golden、validation error、Cocos tree、pool identity、destroy 结果一致。

更新 `requiredExports` 和 forbidden/required pattern，但 checker 不能只靠字符串证明算法正确；行为一致性由 parity tests 负责。

## 7. 测试计划

### 7.1 golden 来源规则

- 编辑器 `docs/anieditor5/src` 是视觉/数学权威。
- vnicore current tests 可帮助发现覆盖点，但 expected 不能在测试运行时调用 vnicore sampler 生成。
- 为固定输入从编辑器公式手工记录 golden，模块化 Cocos core 和 standalone 都对同一 golden 验证。
- 没有真实 0.095 export 时使用明确命名的 synthetic Cocos-compatible contract fixture，不手改旧 fixture 版本号冒充真实导出。
- 一旦获得真实 editor Cocos-compatible export，保存 JSON 与精确资源闭包来源，并补 integration test。

### 7.2 core tests

新增或更新：

```text
tests/core/validation.test.ts
tests/core/animation-sampler.test.ts
tests/core/project-sampler.test.ts
tests/core/particle-sampler.test.ts
tests/core/particle-runtime.test.ts
tests/core/sequence-layer.test.ts
tests/core/effect-sampler.test.ts
tests/core/multi-move.test.ts
tests/core/basic-animation.test.ts
tests/core/card-carousel-3d.test.ts
```

覆盖严格 invalid cases、首/中/末帧、边界左右、旧 fixture、Cocos-compatible mask、坐标方向、sequence frame、effect source opacity、multi_move cache、basic-before-preset、bounce cache、rotate pressure、CardCarousel 六种 mode/纹理/depth。

### 7.3 modular Cocos player tests

更新 `tests/cocos/player.test.ts`、fake driver 和 blend/mask 回归，覆盖：

- outer/content 稳定结构；
- sequence 只换 SpriteFrame；
- 10 effects 的 node/graphics/slice pool；
- CardCarousel card/slice pool、stable order、cache ownership；
- legacy mask 与新结构；
- segmented particle moving emitter；
- seek/restart/loop/range/end/destroy；
- init failure rollback；
- diagnostics；
- 旧 attach text/group slot/mounted APIs。

### 7.4 standalone parity/import/player tests

每一项新能力至少有一条 standalone 对模块化行为的 parity；不要只检查导出名。

需要比较：

- parsed project；
- validation success/error message；
- pure sampler golden；
- Cocos fake tree 和 current SpriteFrame；
- effect/CardCarousel node identity 和计数；
- seek/restart/destroy 后状态；
- public exports；
- standalone 禁止依赖规则。

### 7.5 性能测试

使用身份/计数为主，墙钟仅辅助：

1. sequence 连续 300 帧不新建 source node。
2. 每种 sprite effect 预热后 300 帧 node identity/上限稳定。
3. wave-distort 相同 frame/slice 配置 300 帧不新增 SpriteFrame view。
4. speed-lines 复用 Graphics，不逐帧创建 component/node。
5. CardCarousel 预热后 300 帧 card/slice/view 数稳定。
6. seek/restart/loop 后复用 pool；inactive 只隐藏/清状态。
7. destroy 后 owned view/cache/pool 为 0，共享 source SpriteFrame 未被 destroy。
8. basic/multi_move/CardCarousel params 不逐帧重 parse/precompute。

不得用易受 CI 负载影响的“必须低于 N ms”作为唯一证明。报告写出理论最大 node/view 数和实测稳定计数。

### 7.6 真实 Cocos Creator 3.8.6 standalone 验收

这是完成条件，不是可选项。

使用 Cocos Creator 3.8.6 创建临时 2D 项目，不把项目、Library、Temp、Build、`.meta` 噪音提交到本仓库。只导入：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
真实或明确标注 synthetic 的 Cocos-compatible VNI 0.095 project
对应 SpriteAtlas/SpriteFrame 资源
```

至少验证：

- standalone 无 workspace/dist 依赖即可编译；
- image/sequence 基础播放；
- 10 effects；
- multi_move；
- basic tracks、bounce、pressure rotate；
- CardCarousel image/sequence；
- legacy alpha mask；
- seek/restart/loop/segmented/end/destroy；
- 缺 frame/非法参数/precompose 显式失败；
- atlas 普通 frame、trim frame；如果编辑器允许 rotated atlas，额外验证 rotated frame。

视觉对照：

- 在编辑器切换到 Cocos-compatible 模式；
- 使用同一 project、同一 stage 尺寸、同一时间点；
- 对 sequence/effects/multi_move/bounce/rotate/CardCarousel 的 start/middle/end 截图；
- 逐项比较位置、scale、rotation、opacity、frame、source visibility、blend、切片缝隙、depth order；
- 报告保存 Cocos 版本、平台、截图/录屏位置和已知引擎色彩差异，不用“肉眼差不多”代替关键状态核对。

性能探针：

- warm-up 后连续播放至少 300 帧；
- diagnostics/node/view 数不增长；
- restart/seek/loop 后不增长；
- Cocos profiler 记录一次 CPU、内存、draw call 概要；
- 不要求不同机器统一毫秒阈值，但不能存在持续分配/节点泄漏。

如果执行环境没有 Cocos Creator 3.8.6，报告只能标记“自动化代码完成、真实 Creator 验收阻塞”，不能把整个任务报告为完成。

## 8. 预计文件范围

模块化源码预计新增/修改：

```text
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/core/timeline-progress.ts
packages/anieditorv5runtime-cc/src/core/sequence-layer.ts
packages/anieditorv5runtime-cc/src/core/effect-sampler.ts
packages/anieditorv5runtime-cc/src/core/multi-move.ts
packages/anieditorv5runtime-cc/src/core/basic-animation.ts
packages/anieditorv5runtime-cc/src/core/card-carousel-3d.ts
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/particle-sampler.ts
packages/anieditorv5runtime-cc/src/core/particle-runtime.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/src/index.ts
```

交付、测试和文档：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/tests/core/*
packages/anieditorv5runtime-cc/tests/cocos/*
packages/anieditorv5runtime-cc/tests/standalone/*
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/tests/fixtures/*
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone.zip
AGENTS.md
agents.md
tasks/117-anieditorv5runtime-cc-vni095-sync-[utctime].md
```

`standalone.zip` 被忽略，但仍是必须生成的本地交付物。`dist/`、`coverage/`、`.turbo/`、Cocos `Library/Temp/Build` 不提交。

## 9. 推荐执行顺序

1. 保存工作区状态，重跑第 2 节历史审计，建立最终增量矩阵。
2. 给现有包跑一次 baseline 验收，记录开始前失败，不把旧失败归到新代码。
3. 同步 type/schema/validation/mask mode。
4. 同步 timeline helper 和粒子修正，先让旧 fixture 全绿。
5. 实现 sequence，并扩展最小 SpriteFrame switch driver API。
6. 实现 10 effects 纯 sampler，再实现 Cocos pool/Graphics/slice renderer。
7. 实现 multi_move。
8. 实现 basic tracks、bounce、rotate 和 outer/content 结构。
9. 实现 CardCarousel pure core、Cocos pool/cache/ordering。
10. 每一步同步 standalone/checker/parity，而不是最后一次性复制。
11. 更新 README、public exports、diagnostics、AGENTS/agents。
12. 完成包级自动验收与 300 帧性能回归。
13. 重建 `standalone.zip`。
14. 在真实 Cocos Creator 3.8.6 临时项目做 standalone 视觉/性能验收。
15. 做二次 Git 范围检查、写 UTC 报告，最后再次验证 zip。

## 10. 自动化验收命令

### 10.1 包级

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc build
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

包 test 必须报告所有 test file/test 数和 coverage 摘要。

### 10.2 standalone zip

所有 build 命令完成后执行：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip \
  standalone/anieditorv5runtime-cc.ts \
  standalone/V5GPreview.example.ts
cd ../..
test -f packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
git status --short --ignored packages/anieditorv5runtime-cc/standalone.zip
```

`zipinfo -1` 必须只有：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

如果之后又运行可能清理 ignored artifact 的命令，最后重新检查/重建 zip。

### 10.3 根级与范围检查

```bash
CI=true pnpm typecheck
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm build
CI=true pnpm format:check
git diff --check
cmp -s AGENTS.md agents.md
git status --short --untracked-files=all
git diff --stat
git diff --name-only -- packages/vnicore docs/anieditor5 apps/anieditorv5viewer
```

本任务不应修改 vnicore、编辑器或 viewer。若确有必要修改，必须有直接证据说明编辑器/既有 vnicore 本身存在 bug，并在报告单独列出，不能把 Cocos adapter 问题反推成修改权威语义。

根级如有失败，必须最小化复现并按“本任务引入 / 开始前已存在”分类。不要通过修改无关生产代码让根级变绿；若失败只是测试期望过时，修正测试并解释生产合同证据。

## 11. AGENTS.md / agents.md 更新要求

完成实现后同步更新两个文件，至少记录：

- `anieditorv5runtime-cc` 已同步到 VNI 0.095 的具体能力；
- Cocos runtime 只消费 Cocos-compatible `legacy_alpha`，仍拒绝 Pixi precompose；
- sequence/effects/CardCarousel 使用 public Cocos driver、稳定 pool 和 owned SpriteFrame slice cache；
- standalone 是主要交付面，必须和 modular 同步；
- 不把 Pixi runtime/loader/viewport/hidden renderer 混入 Cocos；
- 更新 editor/vnicore 后要检查是否需要同步 Cocos runtime，避免再次累积多个版本。

完成后：

```bash
cmp -s AGENTS.md agents.md
```

如果执行中判断某条不应成为长期规则，报告说明原因；不能只更新一个大小写文件。

## 12. 任务报告要求

报告文件：

```text
tasks/117-anieditorv5runtime-cc-vni095-sync-[utctime].md
```

必须包含：

1. 最终 Git baseline、最后同步点和实际审计到的提交范围。
2. editor → core → Cocos → standalone 的最终合同矩阵。
3. 已支持/明确不支持清单。
4. types/validation、粒子、sequence、10 effects、multi_move、basic/bounce/rotate、CardCarousel 的实现说明。
5. Cocos driver public API 与 SpriteFrame slice/Graphics API probe 结果。
6. 模块化与 standalone parity 证据。
7. 300 帧 pool/cache/node/view 稳定计数和共享资源销毁证明。
8. 所有自动验收命令、结果、test/coverage 数。
9. `standalone.zip` 重建时间与 `zipinfo -1` 输出。
10. 真实 Cocos Creator 3.8.6 版本、平台、fixture、操作步骤、视觉对照和 profiler 结果。
11. 依赖/lockfile/代理是否使用。
12. `AGENTS.md` / `agents.md` 更新内容和 `cmp` 结果。
13. 工作区最终范围、未提交用户改动保护情况。
14. 未完成项与剩余风险；没有真实 Creator 验收时不得写“任务完成”。

## 13. 完成定义

只有以下全部满足才算完成：

- [ ] 已重新验证 `82651dc` 之后的所有相关 Git 增量，没有漏掉只更新 vnicore 的提交。
- [ ] VNI 0.045/0.070/0.074/0.087/0.095 合同和同期粒子修正已落入 Cocos runtime。
- [ ] Pixi-only 变更被明确排除，没有混入 Cocos package。
- [ ] Cocos-compatible `legacy_alpha` 正常，`precompose_light_alpha` 显式失败。
- [ ] sequence 复用同一节点切 SpriteFrame。
- [ ] 10 个 deterministic effects 与编辑器语义一致并使用稳定 Cocos pool/cache。
- [ ] multi_move、basic tracks、bounce、rotate pressure 与 editor golden 一致。
- [ ] CardCarousel image/sequence、五阶段、切片、depth、source opacity 一致。
- [ ] 所有新资源缺失/错误参数/API 缺失都显式失败，无不必要 fallback。
- [ ] 模块化源码、standalone、checker、fake/shim、tests、README 同步。
- [ ] 包级 typecheck/lint/test/build/format/standalone checks 全部通过。
- [ ] 300 帧性能回归证明预热后节点/SpriteFrame view 不持续增长。
- [ ] `standalone.zip` 已重建且只包含两个预期文件。
- [ ] 真实 Cocos Creator 3.8.6 standalone 编译、视觉和性能验收已完成。
- [ ] `AGENTS.md` 和 `agents.md` 已同步且字节一致。
- [ ] 已新增符合 UTC 命名的中文任务报告。
- [ ] 最终 Git diff 只包含本任务合理范围，用户已有改动未被覆盖。
