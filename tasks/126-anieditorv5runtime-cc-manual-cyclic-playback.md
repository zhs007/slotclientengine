# 126 anieditorv5runtime-cc manual cyclic playback 任务计划

## 1. 任务目标

更新：

```text
packages/anieditorv5runtime-cc
```

把任务 125 已在 `packages/vnicore` 落地的“手工阶段编排 + 连续周期选择”能力同步到纯 Cocos Creator 3.8.6 runtime，并保证模块化 package 与主要交付面 standalone 完全一致。

本任务要支持的宿主流程是：

```text
播放 intro 一次
→ 把主时间轴停在 authored hold point
→ card_carousel_3d 按真实 delta 持续慢转
→ 等待用户操作和服务器响应，慢转不能回绕或拉回
→ 宿主提交最终选中内容
→ runtime 在不可见 carrier 的安全帧原子提交内容
→ 从当前真实相位启动 fast / stop / hold
→ 指定 carrier 精确停在 authored 正面位置
→ 播放普通时间轴上的末尾光效并完成
```

最高优先级固定为：

1. **动画效果与编辑器完全一致**：连续阶段、动态停止规划、reveal、透视、切片曲面、明暗、深度顺序、末尾 pop/glow 和普通时间轴相对时序不能因 Cocos 适配而改变。
2. **性能可用于游戏 runtime**：逐帧热路径只更新已预分配的状态、节点和 SpriteFrame view，不得逐帧创建 Node、SpriteFrame、RenderTexture、Camera、数组、Map 或 Promise。

本任务还必须解决 Cocos 侧特有的内容接口：

- 宿主配置的 carrier 内容是 `cc.Node`，节点可能包含 Sprite、Label、Spine、自定义 RenderComponent、多个子节点和自定义组件。
- public API 不能把内容写死成 `Sprite` 或 `SpriteFrame`，也不能在 player 中对宿主节点直接 `getComponent(Sprite)`。
- Cocos runtime 必须通过完整节点子树的 Cocos 原生捕获/适配合同，把复杂节点转成可复用的 runtime visual，再使用和编辑器一致的 CardCarousel 切片算法。
- 复杂节点准备失败、尚未 ready、尺寸非法、捕获能力不支持或视觉无法保证时要尽早显式失败；不得退化成只移动外层 Node、整图 Sprite、placeholder、首帧猜测或跳过曲面/明暗效果。

本任务不修改编辑器，不修改 VNI JSON schema，不新增业务专属 Bamboo API，也不让 Cocos package 依赖 `@slotclientengine/vnicore` 或 Pixi。

本计划可脱离会话、任务 125 和其它任务文档独立执行。

任务完成后必须新增中文执行报告：

```text
tasks/126-anieditorv5runtime-cc-manual-cyclic-playback-[utctime].md
```

UTC 时间戳格式：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/126-anieditorv5runtime-cc-manual-cyclic-playback-260723-153000.md
```

## 2. 制定计划时已确认的 Git 基线

执行任务时必须重新验证本节，不能把计划制定时的观察当成最终状态。

### 2.1 当前提交与工作区

制定本计划时：

```text
HEAD: 33089be621bbbb61d318e53e7c5681faa026ead6
branch: main
git status --short --untracked-files=all: empty
```

当前直接相关提交：

| 提交 | 任务 | 内容 | 对任务 126 的结论 |
| --- | --- | --- | --- |
| `b0f0f7e` | 任务 115 | vnicore VNI 0.095 `card_carousel_3d` 确定性时间线、切片和 Pixi renderer | 是旧 full-demo 数学与视觉基线 |
| `acff066` | 任务 117 | `anieditorv5runtime-cc` 同步至 VNI 0.095，增加 Cocos CardCarousel 切片 renderer、pool、standalone 同源生成 | 是本任务 Cocos 实现基线 |
| `33089be` | 任务 125 | vnicore manual staged transport、continuous cyclic phase、动态停止、安全 carrier replacement、Viewer 自动预览 | 是本任务要同步的新功能来源 |

任务 125 提交没有修改：

```text
packages/anieditorv5runtime-cc/**
```

因此当前 Cocos runtime 仍只有 authored timeline/full-demo 播放，没有：

- manual playback session；
- timeline hold 下继续推进指定 animation；
- continuous unwrapped phase；
- dynamic selected carrier resolve；
- runtime animation capability 查询；
- 安全内容替换 transaction；
- carrier 内容 public 配置接口。

执行前运行：

```bash
git rev-parse --show-toplevel
git status --short --untracked-files=all
git log --oneline --decorate -30
git show --stat --summary b0f0f7e
git show --stat --summary acff066
git show --stat --summary 33089be
git diff --name-status acff066..HEAD -- \
  packages/vnicore \
  packages/anieditorv5runtime-cc \
  tasks/125-vnicore-manual-cyclic-playback.md \
  tasks/125-vnicore-manual-cyclic-playback-260723-102922.md \
  AGENTS.md agents.md
git status --short --ignored packages/anieditorv5runtime-cc/standalone.zip
```

如果执行时 `HEAD` 已前进：

1. 重新审计 `acff066..HEAD` 中所有 `vnicore`、编辑器和 Cocos runtime 相关提交。
2. 把新增差异补入 editor → vnicore core → Cocos core → Cocos player/driver → standalone 对照矩阵。
3. 不覆盖、清理或格式化用户已有的无关修改。

### 2.2 当前长期规则

仓库同时存在：

```text
AGENTS.md
agents.md
```

制定计划时二者是同一 inode 且字节一致。已有长期规则要求：

- Pixi vnicore 与 Cocos runtime 不混用。
- Cocos public runtime 行为变更必须同步 modular、standalone、checker、standalone tests 和 `standalone.zip`。
- Cocos runtime 只消费 Cocos-compatible project；`precompose_light_alpha` 显式失败。
- `standalone/anieditorv5runtime-cc.ts` 由 `scripts/build-standalone.mjs` 从模块化源码生成，禁止手改。

任务 126 会形成新的长期职责边界，因此实现完成后需要同步更新 `AGENTS.md` / `agents.md`，详见第 15 节。

## 3. 环境和依赖约束

### 3.1 Node / pnpm

制定计划时普通 shell 中：

```text
node: command not found
pnpm: 11.9.0
NVM_DIR: /Users/zerro/.nvm
```

执行任务时不要直接使用该全局 pnpm。先加载 nvm 并切到仓库要求的 Node 24；统一使用该环境自带的 Node 和 pnpm，不强制安装或改写版本：

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
node --version
pnpm --version
```

Node 必须满足：

```text
>=24.0.0
```

### 3.2 安装和代理

本任务原则上不需要新增第三方依赖。若现有依赖缺失：

```bash
CI=true pnpm install --frozen-lockfile
```

如果依赖下载失败，使用用户指定代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
CI=true pnpm install --frozen-lockfile
```

不得为了省事切换 npm/yarn，也不得强制修改 Node、pnpm 或 lockfile 版本。若确实需要新增依赖或改变 `pnpm-lock.yaml`，必须先证明 Cocos Creator 3.8.6 自带 API 无法完成，并在报告中单列原因。

### 3.3 测试和 fail-fast

- 如果测试迫使生产代码增加奇怪 special case、宽松解析或不必要 fallback，应修正测试/fixture，不要扭曲生产合同。
- 缺节点、重复节点、非法尺寸、重复 key、未知 animation、transport 冲突、错误 phase、捕获失败、Cocos API 缺失、资源 ownership 错误必须显式失败。
- 不增加 placeholder、默认 carrier 0、当前最靠前 carrier、首个 Sprite 子节点、文件名猜测、自动降级成 SpriteFrame 或静默跳过 effect。

## 4. 必须阅读的权威源码

实现前必须完整阅读当前版本，而不是只看本计划摘要。

### 4.1 任务与 Git 增量

```text
tasks/115-vnicore-vni095-card-carousel-3d.md
tasks/115-vnicore-vni095-card-carousel-3d-260721-093325.md
tasks/117-anieditorv5runtime-cc-vni095-sync.md
tasks/117-anieditorv5runtime-cc-vni095-sync-260722-051617.md
tasks/125-vnicore-manual-cyclic-playback.md
tasks/125-vnicore-manual-cyclic-playback-260723-102922.md
```

### 4.2 编辑器权威语义

```text
docs/anieditor5/src/constants.ts
docs/anieditor5/src/types.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/project_state.ts
docs/anieditor5/src/export_project.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/main.ts
```

重点确认：

- `card_carousel_3d` 五阶段、角度积分、target、stop overshoot、切片、tint、depth 和 source opacity。
- `phasePreviewMode` 只描述 authored timeline preview。
- sequence frame 只作为编辑器预览贴图库；源码注释明确 Cocos runtime 由程序传入真实卡牌数组。
- Cocos-compatible 导出使用 `legacy_alpha`，而不是运行时猜测或转换 mask。

### 4.3 vnicore 任务 125 参考实现

```text
packages/vnicore/src/core/cyclic-selection.ts
packages/vnicore/src/core/card-carousel-3d.ts
packages/vnicore/src/core/playback-sequence.ts
packages/vnicore/src/pixi/manual-playback.ts
packages/vnicore/src/pixi/card-carousel-3d-renderer.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/examples/manual-cyclic-playback.ts
packages/vnicore/tests/core/cyclic-selection.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
```

只同步：

- 纯数学；
- phase/state/transaction 语义；
- manual transport 生命周期；
- capability/descriptor 合同；
- 安全 replacement 和动态 target 对齐。

不得复制：

- `PIXI.Texture` public visual；
- Pixi Container/Sprite；
- Pixi ticker/RAF；
- Pixi texture source/frame API；
- Pixi loader、renderer、canvas、DOM；
- Pixi slice texture cache 实现细节。

### 4.4 当前 Cocos 实现

```text
packages/anieditorv5runtime-cc/src/core/*
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/tests/**/*
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/scripts/build-standalone.mjs
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/README.md
```

当前 `CardCarouselRuntime` 的已知限制：

- 初始化时从 authored image/sequence SpriteFrame 固定生成 `cardCount * slices`。
- `textureInfos` 是只读贴图库，不是 per-carrier 可替换 binding。
- 没有 controlled motion input。
- 没有 ref-counted replacement view。
- 没有复杂 Node 内容捕获。
- `V5GCocosPlayer.update()` 只推进 legacy timeline/range/segmented，不知道 manual session。

## 5. 真实样本与验收基线

### 5.1 Pixi 任务 125 样本

```text
/Users/zerro/Downloads/bamboo4 (pixi).zip
SHA-256: 8ba263e5823209c65bd23d0500b29f24364dbaeedb2db584d7a67a2285dcb44e
bundle: VNI_0.103
runtime project: runtime_100/bamboo4.json
maskCompositeMode: precompose_light_alpha
layer: layer_image_mrtos52v_5
animation: anim_module_mrtosrk3_6
```

该文件只用于对照任务 125 和编辑器/Pixi 视觉，不得直接作为 Cocos player project，因为它不是 Cocos-compatible mask 导出。

### 5.2 Cocos-compatible 样本

本任务真实 Cocos 验收样本是：

```text
/Users/zerro/Downloads/bamboo4 (2).zip
SHA-256: d0be56873bb57dff3937aa583cec5c177508a65bbf136245484cdbfe5c35bdd5
bundle: VNI_0.103
runtime project: runtime_100/bamboo4.json
engineTarget: cocos_creator 3.8.6
maskCompositeMode: legacy_alpha
stage: 2000 x 2000
stage duration: 10s
layer type: sequence
layer: layer_sequence_mrupvsr0_7
animation: anim_module_mrupw05e_8
animation type: card_carousel_3d
animation duration: 9.6s
cardCount: 13
authored targetIndex: 0
```

五阶段：

| 阶段 | 时长 |
| --- | ---: |
| intro | 1.5s |
| authored idle preview | 1.5s |
| fast | 2s |
| stop | 1.6s |
| hold | 3s |

执行前重新验证：

```bash
shasum -a 256 '/Users/zerro/Downloads/bamboo4 (pixi).zip'
shasum -a 256 '/Users/zerro/Downloads/bamboo4 (2).zip'
unzip -p '/Users/zerro/Downloads/bamboo4 (2).zip' manifest.json | jq .
unzip -p '/Users/zerro/Downloads/bamboo4 (2).zip' runtime_100/bamboo4.json \
  | jq '{
      schemaVersion,
      engineTarget,
      maskCompositeMode,
      exportProfile,
      stage,
      carousel: [
        .layers[] |
        . as $layer |
        .animations[]? |
        select(.type == "card_carousel_3d") |
        {
          layerId: $layer.id,
          layerType: $layer.type,
          animationId: .id,
          startTime,
          duration,
          params
        }
      ]
    }'
```

如果任一 ZIP 缺失或 hash 不一致：

- 纯 core、fake Cocos 和 synthetic fixture 测试可以继续。
- 不得下载或猜测另一个同名文件冒充。
- 真实样本验收必须在报告中标记阻塞，或者记录用户确认的新路径和 hash。
- 不把这些 ZIP 或 12MB 资源提交到仓库，除非用户另行明确要求。

## 6. 核心架构决定

### 6.1 不修改 schema，不建立 Cocos 专属 recipe

任务 125 已证明该能力不需要修改 VNI JSON。任务 126 同样使用：

- authored animation 的 start/duration/params；
- runtime public manual API；
- 宿主提供的 carrier nodes 和结果。

不新增：

- `manualPlayback` JSON；
- `cyclicSelection` JSON；
- Bamboo 三段业务字段；
- server/result schema；
- Cocos-only animation type。

### 6.2 纯数学同步，不运行时依赖 vnicore

新增 Cocos package 自己的：

```text
src/core/cyclic-selection.ts
```

同步并用 golden 锁定：

- unwrapped turns；
- direction-aware modulo；
- continuous advance；
- selected carrier alignment；
- dynamic fast/stop resolve plan；
- stop overshoot；
- 1 小时慢转数值稳定；
- finite/safe integer/phase fail-fast。

扩展 Cocos package 的：

```text
src/core/card-carousel-3d.ts
```

增加等价能力：

- `VNICardCarousel3DMotionSample`；
- `createCardCarousel3DContinuousMotion()`；
- `createCardCarousel3DResolvePlan()`；
- `sampleCardCarousel3DResolveMotion()`；
- `sampleCardCarousel3D(..., motion?)`。

legacy authored `sampleCardCarousel3D()` 的所有既有采样点必须保持不变。

### 6.3 manual transport 是 Cocos player 的 public 能力

新增等价的 Cocos 命名 public contract。最终类型名可按现有命名风格微调，但职责不能削弱：

```ts
export type V5GCocosRuntimeAnimationCapability =
  | "continuous-phase"
  | "replaceable-carriers"
  | "cyclic-selection";

export interface V5GCocosAnimationRuntimeRef {
  readonly layerId: string;
  readonly animationId: string;
}

export interface V5GCocosPlaybackOperation {
  readonly completed: Promise<{ readonly reason: "complete" }>;
  cancel(): void;
}

export interface V5GCocosTimelineHoldHandle {
  release(): void;
}

export interface V5GCocosManualPlaybackSession<TNode> {
  playRange(options: {
    readonly range: V5GCocosPlaybackRange;
    readonly preserveRuntimeAnimationState?: boolean;
  }): V5GCocosPlaybackOperation;

  holdTimeline(options: {
    readonly at: V5GCocosPlaybackPoint;
  }): V5GCocosTimelineHoldHandle;

  advanceFor(options: {
    readonly durationSeconds: number;
  }): V5GCocosPlaybackOperation;

  listAnimations(options?: {
    readonly capability?: V5GCocosRuntimeAnimationCapability;
  }): readonly V5GCocosManualAnimationInfo[];

  getAnimation(
    ref: V5GCocosAnimationRuntimeRef,
  ): V5GCocosManualAnimationController<TNode>;

  getState(): V5GCocosManualPlaybackState;
  destroy(): void;
}
```

入口：

```ts
const session = player.createManualPlaybackSession();
```

Cocos-specific 时钟规则：

- Cocos runtime 没有 Pixi `autoTick`，也不新增 RAF/timer。
- 宿主必须继续在 Creator `update(deltaTime)` 中调用 `player.update(deltaTime)`。
- manual active 时，即使 legacy `playing === false`，`player.update(deltaTime)` 也必须推进 active manual range/hold/continuous runtime。
- `update(0)` 保持合法 no-op；不把 0 传给要求 positive delta 的 continuous helper。
- `advanceFor()` 只累计真实 `player.update()` delta，不使用 `setTimeout`、Tween 或 schedule。

transport 严格性：

- 一个 player 同时最多一个 manual session。
- manual session active 时，legacy `play()`、`playRange()`、`seek()`、`restart()`、segmented start/end 等会写 transport 的 API 必须显式失败。
- `pause()` 的语义必须明确：若保留为 legacy-only，则 manual active 时失败；不能偷偷暂停一半状态。
- hold 未 release 时不能开始 range。
- 同时最多一个 active operation。
- `operation.cancel()`、session `destroy()` 和 player `destroy()` 使用明确的 `V5GCocosPlaybackCancelledError` reject pending Promise。
- manual range 继续复用现有 marker、playback complete 和 particle drain 语义，不创建第二套 completion。

### 6.4 capability，而不是 card-specific public controller

manual animation 必须通过稳定 ref 和显式 capability 枚举：

```text
layerId + animationId
```

`card_carousel_3d` 首版声明：

```text
continuous-phase
replaceable-carriers
cyclic-selection
```

禁止：

- 按 layer/animation name 猜类型；
- 扫 private runtime；
- 新增 `getBambooController()`；
- 让宿主解析 `card_carousel_3d.params`；
- 未知或 disabled ref 回退到第一个 animation。

### 6.5 Cocos carrier 内容必须是任意 Node，而不是 Sprite

建议 public item：

```ts
export interface V5GCocosCyclicSelectionItem<TNode> {
  readonly key: string;
  readonly visual: {
    readonly kind: "node";
    readonly node: TNode;
    readonly width: number;
    readonly height: number;
    readonly revision?: string | number;
  };
}
```

合同：

- `node` 是宿主拥有的任意 Cocos Node root。
- `width/height` 是显式、finite、positive 的逻辑 art size；runtime 不从首个 Sprite、子节点 bounds、SpriteFrame 或节点名称猜尺寸。
- `revision` 表示宿主明确的视觉版本；同一 node/revision/size 可复用捕获结果。视觉内容改变时宿主必须提交新 revision。
- runtime 不 reparent、不 destroy、不 deactivate、不修改宿主 node 的 transform、layer、组件状态或子树。
- 同一 node 不能在同一个 binding set 中重复绑定多个 key，除非宿主显式提供不同 capture revision 并且实现证明 ownership 安全；首版建议直接禁止重复 node identity。
- runtime 只拥有从该 node 生成的 capture visual、slice views 和内部 carrier nodes。

可以提供 authored project asset/SpriteFrame 的内部或 convenience 入口用于 `adoptAuthoredItems()`，但 public production carrier contract 不能只剩 `SpriteFrame` union。

### 6.6 复杂 Node 的正确实现：一次性 Cocos 原生捕获

CardCarousel 的编辑器视觉依赖 per-slice：

- 不同 x/y；
- 非均匀 scale；
- curve；
- edge/depth shade；
- tint；
- 透视压缩。

因此把复杂 node 直接挂到 card container 并只更新整卡 x/y/scale/opacity 会丢失编辑器效果，禁止作为 fallback。

默认 Cocos driver 必须提供等价的 node visual capture primitive，建议形状：

```ts
export interface V5GCocosCapturedNodeVisual<TSpriteFrame> {
  readonly spriteFrame: TSpriteFrame;
  readonly width: number;
  readonly height: number;
  release(): void;
}

export interface V5GCocosNodeCaptureOptions<TNode> {
  readonly node: TNode;
  readonly width: number;
  readonly height: number;
  readonly revision?: string | number;
}
```

实际方法可放在：

```text
V5GCocosNodeDriver
```

或独立的：

```text
V5GCocosNodeVisualCaptureAdapter
```

但必须满足：

1. 使用 Cocos Creator 3.8.6 public `Node` / `Camera` / `RenderTexture` / `SpriteFrame` / renderer API。
2. 捕获完整 node subtree，不要求 root 或任一固定子节点带 Sprite。
3. 支持至少 Sprite + Label + nested Node 的组合；Spine/custom RenderComponent 的支持范围由真实 probe 明确记录。
4. 使用透明背景、正确 premultiplied alpha、逻辑尺寸和 anchor，不引入黑底、裁剪漂移、Y 翻转或 assetScale 二次缩放。
5. 不改变宿主原 node；可使用一次性 clone/capture scene，但必须在完成/失败后清理 clone、Camera、RenderTexture 和临时节点。
6. capture 只发生在初始绑定或 replacement prepare 阶段，不在每帧 render 中发生。
7. captured source 进入和 authored SpriteFrame 相同的切片路径，因此 curve/tint/depth 使用同一 sampler。
8. cache 使用 node identity + width + height + revision 作为稳定 key，并有引用计数；归零立即释放 owned RenderTexture/SpriteFrame。
9. 不销毁宿主 node、宿主 asset、authored atlas SpriteFrame 或共享 texture。
10. 捕获失败必须原子 rollback，不让部分 carrier 已替换。

复杂 node 中嵌套动画的首版语义必须写清楚：

- capture 记录提交时刻的完整视觉快照。
- 不逐帧重新捕获嵌套 Spine/Label/custom animation。
- 若产品要求 carrier 内部动画在慢转期间继续实时播放，应建立专门的 live-node renderer/mesh contract；不得用逐帧 RenderTexture 偷偷实现。
- README、示例和任务报告不能把一次性快照描述成 live subtree。

### 6.7 必须先做真实 Cocos 3.8.6 capture probe

在大规模实现前，用临时 Creator 3.8.6 2D 项目验证：

```text
Node root
├── Sprite child
├── Label child
└── Nested Node
    └── another Sprite/custom RenderComponent
```

probe 必须记录：

- 使用的 public API；
- capture 的实际像素尺寸；
- alpha/premultiply；
- anchor 和 Y 轴；
- Label、Sprite、nested node；
- Mask、Spine、自定义 material 可否正确进入 capture；
- 一次 capture 后临时 Camera/RenderTexture/clone 的 ownership；
- 同 node 新 revision 是否得到新 visual；
- release 后资源是否真正释放。

若默认 Cocos 3.8.6 API 无法正确捕获某类复杂节点：

- 允许把该类节点明确列为 unsupported 并在 prepare 时失败。
- 可提供宿主注入的 capture adapter 扩展点。
- 不得把 public API 改回 Sprite-only。
- 不得用错误画面继续完成任务。
- 如果真实验收所需节点本身无法正确捕获，则任务保持阻塞，报告给出最小复现和后续所需的 editor/exporter 或 Cocos adapter 扩展。

## 7. manual/cyclic public 状态与 transaction

### 7.1 authored preview descriptor

cyclic controller 必须从已验证的 animation adapter 返回：

```ts
export interface V5GCocosCyclicAuthoredPreviewDescriptor {
  readonly introRange: V5GCocosPlaybackRange;
  readonly continuousHoldPoint: V5GCocosPlaybackPoint;
  readonly continuousPhaseId: string;
  readonly authoredContinuousPreviewDurationSeconds: number;
  readonly endingRange: V5GCocosPlaybackRange;
  readonly authoredTargetCarrierIndex: number;
}
```

宿主不解析 params。对真实 Bamboo Cocos sample：

```text
introRange: 0..1.5
continuousHoldPoint: 1.5
continuousPhaseId: idle
authored preview duration: 1.5
endingRange: 3..9.6
authored target: 0
```

### 7.2 initial items

- 数量严格等于 `cardCount`。
- key trim 后非空且唯一。
- node 非空、有效、唯一。
- width/height finite positive。
- revision 只能是明确支持的 string/number。
- 先完整准备所有 captured visuals，再原子更新全部 carrier。
- 任一 prepare 失败时不改变现有 binding，不泄漏 capture。
- continuous 开始后不能覆盖 initial items。

如果同步接口需要异步等待 Camera render，允许把 initial preparation 设计为 awaitable transaction，但 public 示例必须明确等待 ready 后才能播放 intro/continuous。不得隐藏异步 race。

### 7.3 selection transaction

```ts
export interface V5GCocosCyclicSelectionTransaction {
  readonly committed: Promise<{
    readonly itemKey: string;
    readonly carrierIndex: number;
  }>;
  cancel(): void;
}
```

规则：

- 已绑定 key 且未提供新 visual：直接选择现有 carrier。
- 同 key 但 node/revision/size 改变：视为 replacement。
- 新 key：先完整捕获 visual，再等待安全 carrier。
- 以实际 `sample.cards[index].visible` 判断安全，不在 app 复制角度/visibility。
- 当前无安全 carrier 但未来可隐藏：transaction pending。
- 配置上永远无法隐藏任何 carrier：立即失败。
- commit 必须在一次 `update()`/render 边界原子替换 key、capture source、slice frames 和尺寸信息。
- commit 完成后才能启动 resolve。
- cancel/session destroy/player destroy 必须 reject pending transaction 并释放尚未提交的 capture。

禁止：

- 可见换图；
- alpha 临时归零掩盖换图；
- crossfade fallback；
- 新增第 14 个 carrier；
- 重排 carrier identity；
- 修改 authored `targetIndex`；
- 永久 pending 而没有 cancel/destroy 清理。

### 7.4 clear/destroy

`clear()`：

- 取消 pending transaction。
- 恢复 authored per-carrier visual。
- 清空业务 key/selection/phase。
- release 业务 captured visuals 和不再使用的 slice views。
- 保留 player 本身 authored runtime 可继续 legacy 播放。

session/player `destroy()`：

- cancel active operation/transaction；
- 清理 manual motion override；
- 释放 capture/cache/owned view；
- 不 destroy 宿主 Node；
- 不 destroy authored source SpriteFrame；
- 幂等。

## 8. Cocos CardCarousel renderer 改造

### 8.1 per-carrier binding

把当前 modulo texture library 在 runtime 初始化时规范化为长度严格等于 `cardCount` 的 authored bindings：

```text
image layer: 同一 authored source 重复 cardCount 次
sequence layer: frameAssetIds 按 carrier index modulo
```

每个 carrier record 至少保存：

- stable carrier index；
- current item key；
- current captured/authored source；
- mutable texture info；
- stable card container；
- stable slice node array；
- current slice view references；
- safe visibility state。

### 8.2 controlled motion

render 时：

- legacy timeline 没有 manual override：使用原 `progress`，结果完全不变。
- manual continuous/resolve 有 override：把 `motion` 交给同一个 `sampleCardCarousel3D()`。
- target final pop/glow 使用 dynamic selected carrier，不再固定 authored target。
- 普通 timeline layer 继续使用 manual range 的真实 timeline time；不能让 card phase clock覆盖全项目时间。

### 8.3 replacement 和 view cache

- 新 captured source 提交前先为全部 slices acquire view。
- 全部成功后一次切换已有 slice nodes。
- 再 release 旧 source 的 views。
- 中途失败释放新 acquire 并保持旧 visual。
- cache key 包含 source identity、source rect、logical size、slice count、slice index、rotation/trim 边界。
- refcount 不能负数，缺记录显式失败。
- 归零销毁 runtime-owned view；不销毁 shared source。

### 8.4 热路径性能

预热后每帧允许：

- 更新 number 字段；
- 更新既有 Node active/position/rotation/scale/opacity；
- 更新既有 slice color；
- 更新 stable sibling order；
- 写入预分配 buffer。

预热后每帧禁止：

- `new Node()`；
- `new SpriteFrame()`；
- `new RenderTexture()`；
- node capture；
- `instantiate()`；
- `Array.map/filter/sort` 产生临时数组；
- 新 Map/Set；
- Promise/timer；
- 重新解析 animation params；
- 重建 card/slice tree。

## 9. Player 集成和现有语义回归

新增建议文件：

```text
packages/anieditorv5runtime-cc/src/cocos/manual-playback.ts
```

或职责等价的拆分。不要把所有状态机继续塞进已很大的 `player.ts`。

`V5GCocosPlayer` 负责：

- 创建/唯一拥有 manual session；
- 暴露已验证 animation records；
- 把 manual controlled motion 传入对应 CardCarousel runtime；
- 在 `update(deltaSeconds)` 中优先推进 manual session；
- 复用现有 render、marker、completion、particle drain；
- 管理 transport 冲突；
- player destroy 清理 session。

必须回归：

- full timeline；
- range；
- segmented；
- particle keep-alive/drain/force-stop；
- playback marker 的 start/end/loopIndex；
- `onPlaybackComplete()`；
- seek/restart；
- sequence frame；
- masks；
- text binding；
- layer group slot/mounted node；
- existing CardCarousel authored image/sequence playback；
- init failure rollback。

## 10. Public 使用示例

README、standalone example、public API 注释和任务报告中的流程示例统一使用第 5.2 节的真实 Cocos-compatible Bamboo4 配置，不需要另造 `carousel-demo`、`layer-1`、`animation-1` 等脱离实际的假名。

文档可以并且应该直接使用：

```text
project: bamboo4
bundle: VNI_0.103
profile: runtime_100
layerId: layer_sequence_mrupvsr0_7
animationId: anim_module_mrupw05e_8
cardCount: 13
authored targetIndex: 0
intro: 0..1.5s
continuous hold point: 1.5s
authored idle preview: 1.5s
ending: 3..9.6s
```

示例中的业务结果可以使用 Bamboo 语义清楚展示“服务器选中一张新卡/已有卡”，但 runtime API、类型名和内部状态机仍必须保持通用，不能出现只支持 Bamboo、固定 13 张或固定 target 0 的实现分支。

README 和 standalone example 必须给出不依赖真实服务器即可阅读/运行的完整流程。等价示例：

```ts
const session = player.createManualPlaybackSession();
const cyclic = session
  .getAnimation({
    layerId: "layer_sequence_mrupvsr0_7",
    animationId: "anim_module_mrupw05e_8",
  })
  .requireCyclicSelection();

const descriptor = cyclic.getAuthoredPreviewDescriptor();
await cyclic.setInitialItems(cardNodes).ready;

await session.playRange({ range: descriptor.introRange }).completed;

const hold = session.holdTimeline({
  at: descriptor.continuousHoldPoint,
});
cyclic.startContinuousPhase({
  phaseId: descriptor.continuousPhaseId,
});

const result = await requestServerResult();
await cyclic.prepareSelection({
  selectedItem: result.item,
}).committed;

hold.release();
cyclic.startResolvePhase();

await session.playRange({
  range: descriptor.endingRange,
  preserveRuntimeAnimationState: true,
}).completed;

session.destroy();
```

`requestServerResult()` 在文档中应给出一个最小 Bamboo fixture 实现，例如返回：

```ts
{
  selectedItem: {
    key: "bamboo-card-07",
    visual: {
      kind: "node",
      node: bambooCard07Node,
      width: 720,
      height: 720,
      revision: "result-v1",
    },
  },
}
```

文档必须同时给出两种真实分支：

1. 服务器选中的 `bamboo-card-07` 已存在于初始 13 张卡中，直接选择对应 carrier。
2. 服务器返回一张新的 Bamboo card node，先捕获完整复杂节点，再在隐藏 carrier 安全提交。

不能只写类型签名而不展示真实调用顺序、节点准备、等待 transaction、hold release 和 session destroy。

如果最终 initial API 是同步 `setInitialItems()`，去掉 `.ready`，但文档仍必须说明 node capture 在何时完成以及失败如何抛出。

standalone 示例还要展示复杂 node：

```text
Card Content Root
├── art Sprite
├── value Label
└── decoration child node
```

不能只用一张 Sprite 冒充复杂节点支持。

外部真实 ZIP 和美术仍不提交到仓库。仓库内示例若需要可编译的 project/node 数据：

- 使用精简但字段真实的 Bamboo4 synthetic fixture；
- 保留上述真实 layer/animation/cardCount/timing/target；
- 明确注释 fixture 来源和外部 ZIP SHA-256；
- 不把 synthetic fixture 描述成完整真实导出；
- 不复制任务 125 的 Pixi-only `precompose_light_alpha` project 充当 Cocos 示例。

## 11. Standalone 是主要交付门槛

模块化源码完成后运行：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:build
```

禁止手改：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

同步更新：

```text
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

standalone 必须：

- 只 import `"cc"`。
- 不 import vnicore/Pixi/workspace/relative module/Node/DOM。
- ES2015 typecheck 通过。
- 导出 manual/cyclic/capture public types 和 player methods。
- modular/standalone 对同一 fake node、同一 delta、同一 selection 产生相同 state、carrier index、rotation、final alignment、错误和资源计数。
- checker 的字符串守卫只证明边界，行为由 parity tests 证明。

### 11.1 standalone.zip

制定计划时 `standalone.zip` 当前不存在；它受根级 `*.zip` ignore 管理，不能用普通 `git status` 判断是否已交付。

全部 build/test 完成后重建：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip \
  standalone/anieditorv5runtime-cc.ts \
  standalone/V5GPreview.example.ts
cd ../..
test -f packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
shasum -a 256 packages/anieditorv5runtime-cc/standalone.zip
git status --short --ignored packages/anieditorv5runtime-cc/standalone.zip
```

`zipinfo -1` 只能包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

不得包含：

```text
__MACOSX/**
._*
.DS_Store
dist/**
coverage/**
node_modules/**
```

如果后续命令可能清理 ignored artifacts，任务结束前必须再次检查并按需重建。

## 12. 测试计划

### 12.1 golden 来源

- 编辑器源码是视觉/数学权威。
- vnicore task 125 tests 是覆盖范围参考。
- Cocos tests 的 expected 不能在运行时调用 vnicore 生成。
- 固定输入 expected 应写成独立 golden，modular 和 standalone 都对同一 golden 验证。
- 真实 Bamboo ZIP 只用于验收，不提交大资源。

### 12.2 core tests

新增：

```text
packages/anieditorv5runtime-cc/tests/core/cyclic-selection.test.ts
```

更新：

```text
packages/anieditorv5runtime-cc/tests/core/vni095-sync.test.ts
```

覆盖：

- direction `1 | -1`；
- 13 个 carrier 的全部 target；
- rounds；
- stop overshoot；
- exact modulo alignment；
- 0 / 1.5 / 4.5 / 10 秒 continuous 最终均停 authored target；
- 4.5 秒路径真实长于 1.5 秒且不回绕；
- 1 小时 simulated continuous finite/stable；
- invalid delta/count/index/direction/rounds；
- legacy full-demo 全部旧 golden 不变；
- dynamic final pop/glow 指向 selected carrier。

### 12.3 modular Cocos player tests

更新：

```text
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
```

必要时新增：

```text
packages/anieditorv5runtime-cc/tests/cocos/manual-playback.test.ts
packages/anieditorv5runtime-cc/tests/cocos/node-visual-capture.test.ts
```

覆盖：

#### Manual transport

- unique session ownership；
- range completion/cancel；
- hold 主时间不动；
- continuous 按 `player.update()` delta 推进；
- `advanceFor()` 不使用 timer；
- `update(0)` no-op；
- legacy transport 冲突；
- marker/playback complete/particle drain；
- session/player destroy reject pending。

#### Capability/controller

- list/filter stable ref；
- unknown/disabled/ambiguous ref；
- only supported animation exposes cyclic capability；
- authored descriptor；
- phase transition fail-fast；
- clear/reconfigure。

#### Complex node

fixture node 至少包含：

```text
root
├── Sprite
├── Label
└── nested node + second renderable child
```

断言：

- public item 接收 root Node，不接收 Sprite component。
- player/driver 不要求 root 有 Sprite。
- capture 包含完整子树。
- explicit width/height 生效。
- duplicate key/node、bad size/revision 失败。
- 宿主 node parent/transform/active/component tree 未改变。
- runtime destroy 后宿主 node 仍 valid。
- capture failure atomic rollback。

#### Replacement

- exact-count initial binding；
- existing key direct selection；
- same key/new revision replacement；
- new key hidden carrier same-frame commit；
- visible carrier deferred；
- impossible-to-hide reject；
- transaction cancel/destroy；
- replacement 后 selected carrier precise stop；
- old capture/view refcount release。

#### 性能/ownership

- 预热后 300 帧 card/slice/node/view identity 稳定。
- 300 帧无 capture 调用。
- 20 轮 selection/replacement 后 cache 有界。
- 同 node/revision capture 复用。
- 新 revision 只在 prepare 时新增一次 capture。
- clear/destroy 后 captured visual/slice view 为 0。
- authored/shared SpriteFrame 不 destroyed。
- host node 不 destroyed。
- init/prepare 中途失败无临时 Camera/RenderTexture/clone 泄漏。

### 12.4 standalone parity

必须比较行为，不只检查字符串/export：

- pure cyclic golden；
- descriptor；
- manual state；
- cancellation error；
- complex fake node capture；
- hidden replacement commit frame；
- final target/alignment；
- capture/view/node counts；
- destroy ownership；
- invalid errors；
- legacy range/segmented regressions。

### 12.5 真实 Cocos Creator 3.8.6 验收

这是完成条件，不是可选建议。

使用临时 Cocos Creator 3.8.6 2D 项目，只导入：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
bamboo4 (2).zip 中 runtime_100/bamboo4.json 对应的 Cocos-compatible project
其精确 runtime_100/assets 资源
用于结果 carrier 的 13 个复杂 Node/Prefab
```

不把临时项目、`.meta`、Library、Temp、Build、截图大文件提交进仓库。

验收步骤：

1. standalone 不依赖 workspace/dist 即可在 Creator 3.8.6 编译。
2. 使用真实 `legacy_alpha` project 初始化。
3. 绑定 13 个不同复杂 node；每个至少有图片和文字/嵌套子节点。
4. continuous duration 分别设为 `0`、`1.5`、`4.5`、`10` 秒。
5. 四次最终都停在 authored target `0`。
6. 4.5/10 秒慢转没有 1.5 秒边界拉回、瞬移或角度跳变。
7. 收尾普通光效保持 authored 相对时间。
8. 新内容只在隐藏 carrier commit，无可见闪换。
9. same-key/new revision 能安全替换。
10. 连续 20 轮后 node/view/RenderTexture/capture cache 不增长。
11. destroy 后无 pending Promise、临时 Camera、clone、RenderTexture 或 runtime child。
12. 宿主原 complex nodes 仍存在且状态未被修改。

视觉对照：

- 用同一 project、同一 stage 尺寸、同一时间点和同一 card art 对比编辑器 Cocos-compatible 预览。
- 至少保存 intro 中段、continuous、fast、stop 中段、settled 五个时间点。
- 核对位置、scale、rotation、opacity、曲面、shade、tint、depth、目标卡、末尾光效。
- 不用“看起来差不多”替代 target/alignment/timing 证据。

Profiler：

- warm-up 后至少 300 帧；
- 记录 CPU、内存、draw call、Node/SpriteFrame/RenderTexture/capture 次数；
- 不用固定毫秒阈值作为唯一证明；
- 必须证明 steady-state 无持续分配，capture 只发生在 prepare/replace。

如果执行环境没有 Creator 3.8.6 或无法运行真实 capture：

- 自动化实现可以完成。
- 报告必须标记“真实 Creator standalone 验收阻塞”。
- 未完成真实 visual/capture 验收前不得把整个任务写成完成。

## 13. 预计文件范围

预计新增：

```text
packages/anieditorv5runtime-cc/src/core/cyclic-selection.ts
packages/anieditorv5runtime-cc/src/cocos/manual-playback.ts
packages/anieditorv5runtime-cc/tests/core/cyclic-selection.test.ts
packages/anieditorv5runtime-cc/tests/cocos/manual-playback.test.ts
packages/anieditorv5runtime-cc/tests/cocos/node-visual-capture.test.ts
```

根据职责可合并测试文件或把 capture 拆成独立源码，但不能把职责塞回 app。

预计修改：

```text
packages/anieditorv5runtime-cc/src/core/card-carousel-3d.ts
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone.zip
AGENTS.md
agents.md
tasks/126-anieditorv5runtime-cc-manual-cyclic-playback-[utctime].md
```

通常不应修改：

```text
packages/vnicore/**
docs/anieditor5/**
apps/anieditorv5viewer/**
```

如果实施中发现权威 editor/vnicore 确有 bug：

- 先用最小测试证明。
- 只做最小修复。
- 在报告单列范围扩张和原因。
- 不把 Cocos adapter 限制反推成修改 editor/Pixi 数学。

不提交：

```text
dist/**
coverage/**
.turbo/**
node_modules/**
Cocos Library/**
Cocos Temp/**
Cocos Build/**
真实 Bamboo ZIP
```

文档范围还必须覆盖 package 当前实际存在的入口；如果实施时 README 是唯一正式使用文档，则在 README 内建立清楚的 Bamboo4 manual/cyclic 小节，不为凑文件数新增空泛 docs。若决定新增独立文档，建议：

```text
packages/anieditorv5runtime-cc/docs/manual-cyclic-playback-zh.md
```

该文档同样使用上述 Bamboo4 真实标识和时间参数，并由 README 链接；不要维护两套互相漂移的伪示例。

## 14. 推荐执行顺序

1. 加载 nvm Node 24，保存 Git/环境/ignored standalone.zip 基线。
2. 重跑第 2 节提交审计，建立最终增量矩阵。
3. 对现有 Cocos package 跑一次 baseline 验收，记录开始前失败。
4. 重新校验两份 Bamboo ZIP 和 Cocos-compatible project。
5. 在真实 Creator 3.8.6 做复杂 node capture 最小 probe；先确认 API、alpha、尺寸和 ownership。
6. 同步纯 cyclic core 和 CardCarousel controlled motion，先完成 core golden。
7. 设计并导出 Cocos manual/capability/controller public types。
8. 实现 manual session 和 player transport 冲突/时钟/取消。
9. 把 CardCarousel runtime 改成 mutable per-carrier bindings 和 controlled render。
10. 实现复杂 node capture、cache/refcount、atomic initial binding。
11. 实现 safe selection transaction、dynamic resolve、clear/destroy。
12. 补 modular fake Cocos tests、300 帧和 20 轮性能/ownership tests。
13. 更新 README 和 standalone example。
14. 运行 `standalone:build`，更新 checker/import/parity/player tests。
15. 完成包级验收。
16. 重建 `standalone.zip`。
17. 在真实 Creator 3.8.6 对 Cocos-compatible Bamboo 做 visual/performance 验收。
18. 更新 `AGENTS.md` / `agents.md` 并验证字节一致。
19. 做最终 Git 范围检查。
20. 生成 UTC 报告；报告后再次跑格式、diff 和 zip 检查。

## 15. AGENTS.md / agents.md 更新

本任务应更新长期规则，因为会新增 Cocos runtime 的 public manual/cyclic 能力和复杂 node ownership 边界。

至少记录：

- `anieditorv5runtime-cc` 拥有 Cocos manual staged transport、continuous cyclic phase、安全 carrier replacement 和动态目标对齐。
- Cocos production carrier item 是宿主 `Node` + 显式 logical size/revision，不是 Sprite-only contract。
- 复杂 node 通过 prepare 边界的一次性 Cocos visual capture 进入编辑器一致的切片 renderer；禁止逐帧 capture。
- runtime 不拥有/销毁/修改宿主 node，只拥有 capture、slice view 和内部 pool。
- 缺 capture 能力或无法保持效果时显式失败，不降级成整卡 node/Sprite。
- modular、standalone、checker、standalone tests、zip 必须同步。
- Cocos 与 Pixi 继续不互相依赖。

完成后：

```bash
cmp -s AGENTS.md agents.md
```

当前 macOS 工作区二者可能是同一 inode；仍要用两个路径检查，避免其它环境中只更新一个文件。

## 16. 自动化验收命令

### 16.1 package

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24

CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:build
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc build
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

报告必须记录：

- test file 数；
- test 数；
- coverage 摘要；
- 300 帧稳定计数；
- 20 轮 replacement 后 cache/node/view/capture 数。

### 16.2 vnicore 非回归

虽然原则上不修改 vnicore，仍要确认任务 125 没被根级类型或 export 改动破坏：

```bash
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore build
```

### 16.3 根级和范围

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
git diff --name-only -- \
  packages/vnicore \
  docs/anieditor5 \
  apps/anieditorv5viewer
```

根级失败必须最小化复现，并区分：

- 本任务引入；
- 开始前已存在；
- 并行构建/生成物竞态；
- 环境缺失。

不要通过修改无关生产代码或增加 fallback 让根级命令表面变绿。若只是测试期望过时，修正测试并在报告给出生产合同证据。

### 16.4 最终 standalone.zip

```bash
test -f packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
shasum -a 256 packages/anieditorv5runtime-cc/standalone.zip
git status --short --ignored packages/anieditorv5runtime-cc/standalone.zip
```

## 17. 任务报告要求

报告文件：

```text
tasks/126-anieditorv5runtime-cc-manual-cyclic-playback-[utctime].md
```

必须包含：

1. UTC 时间、最终 Git baseline、初始/最终 worktree 状态。
2. 实际审计到的相关提交与最终修改范围。
3. 两份 Bamboo ZIP 的路径/hash/schema/profile/mask。
4. editor → vnicore core → Cocos core → Cocos player/driver → standalone 合同矩阵。
5. manual transport、capability、cyclic controller、transaction 的最终 public API。
6. 复杂 Node public contract；明确不是 Sprite-only。
7. Creator 3.8.6 node capture probe 的 API、节点组成、alpha/尺寸/anchor/ownership 结果。
8. 一次性 capture 与 live nested animation 的明确边界。
9. dynamic phase/target/alignment 证据。
10. visible replacement deferred 与 hidden commit 证据。
11. 模块化/standalone parity 证据。
12. 300 帧和 20 轮的 node/view/RenderTexture/capture/cache 稳定计数。
13. host Node、authored SpriteFrame、captured visual 和 slice view 的销毁/ownership 证据。
14. 所有 package/vnicore/root 验收命令和结果、test/coverage 数。
15. `standalone.zip` 重建 UTC 时间、SHA-256 和 `zipinfo -1`。
16. 真实 Creator 3.8.6 版本、平台、fixture、截图/录屏位置和 profiler 摘要。
17. 依赖、lockfile、代理、Node/pnpm 环境说明。
18. `AGENTS.md` / `agents.md` 修改内容和 `cmp` 结果。
19. 未完成项、阻塞和剩余风险；没有真实 Creator visual/capture 验收时不得写“任务完成”。

## 18. 完成定义

- [ ] 已重新审计 `acff066..HEAD` 的全部相关 editor/vnicore/Cocos Git 增量。
- [ ] 纯 cyclic math 和 CardCarousel controlled motion 已同步且 legacy authored timeline 不变。
- [ ] Cocos player 有可等待、可取消、可销毁的 manual session。
- [ ] manual hold 期间主时间轴固定、continuous animation 按真实 `update(deltaTime)` 推进。
- [ ] transport 冲突、marker、completion 和 particle drain 语义明确且通过回归。
- [ ] capability/ref/descriptor 不依赖 animation 名称或 private runtime。
- [ ] initial items 和 selection transaction 严格、原子、可取消。
- [ ] public carrier visual 接收任意 Cocos Node + explicit size/revision，不写死 Sprite/SpriteFrame。
- [ ] 复杂 Node 使用 Creator 3.8.6 已验证的一次性 capture，完整子树视觉正确。
- [ ] 不逐帧 capture，不修改或销毁宿主 Node。
- [ ] per-carrier binding、slice view refcount、safe hidden replacement 和 dynamic target 正确。
- [ ] 0/1.5/4.5/10 秒 continuous 均精确停 authored target。
- [ ] 300 帧 steady-state 无持续 Node/SpriteFrame/RenderTexture/数组分配。
- [ ] 20 轮 replacement 后 cache/pool 有界，destroy 后 owned resource 为 0。
- [ ] 缺资源/API/节点/尺寸/phase 都显式失败，无不必要 fallback。
- [ ] modular、standalone、checker、fake/shim、tests、README、example 同步。
- [ ] package typecheck/lint/test/build/format/standalone checks 全部通过。
- [ ] vnicore 任务 125 非回归通过。
- [ ] `standalone.zip` 已重建且只含两个预期文件。
- [ ] 真实 Cocos Creator 3.8.6 standalone visual/capture/performance 验收完成。
- [ ] `AGENTS.md` / `agents.md` 同步且字节一致。
- [ ] 已新增符合 UTC 命名的中文任务报告。
- [ ] 最终 Git diff 只包含任务合理范围，用户已有修改未被覆盖。
