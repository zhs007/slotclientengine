# Task 125：vnicore 手工阶段编排与连续周期选择播放

## 1. 任务目标

在**不修改动画编辑器、不修改现有 VNI 导出 JSON schema、不把 Bamboo 三段式写死进业务 API**的前提下，为 `packages/vnicore` 增加一组可由宿主程序手工组合的高级播放接口，并用现有 `card_carousel_3d` 落地首个“连续周期选择”能力。

本任务要解决的真实运行流程是：

1. 宿主播放出现段一次。
2. 宿主让指定动画模块进入慢速连续运动；这一阶段没有预先确定的总时长。
3. 动画持续慢速运动，等待真实用户操作。
4. 用户操作后，宿主请求服务器；等待服务器响应期间动画继续慢速运动。
5. 服务器返回结果后，宿主提交最终内容和选中项。
6. vnicore 只在安全的不可见边界提交需要替换的内容。
7. 内容提交成功后，宿主才启动快速旋转、减速、停止和末尾光效。
8. 最终选中内容必须准确停在目标展示位置，慢速阶段实际持续多久都不能造成角度拉回、瞬移或停错。

完成后，宿主可以用 public API 自己拼出上述流程，也可以拼出其它数量的阶段；编辑器仍只负责输出原动画和参数。未来编辑器若要导出播放 recipe，应建立在本任务的同一套 runtime 原语之上，而不是再实现第二套播放状态机。

同时，`apps/anieditorv5viewer` 必须提供一个不依赖服务器和人工“结束/确认”按钮的连续周期预览模式：

- 用户选择支持 `cyclic-selection` 的动画。
- 用户只配置慢速连续阶段持续多少秒。
- Viewer 自动播放出现段、持续指定时间的慢速段、收尾段。
- Viewer 不要求用户配置最终 carrier/停止点。
- 最终 carrier 显式采用导出动画原有的 authored `targetIndex`，即使慢速段变长也必须停回原导出目标。

Viewer 现有控制区还必须改为 tab 布局，避免项目、普通播放、高级播放、组间插入和文字替换面板同时纵向展开挤压上方预览区。

本文中的“VNI Viewer”或用户口语中的“vniviewer”均指仓库现有应用 `apps/anieditorv5viewer`，不新建第二个 Viewer app。

本计划是独立可执行文档，不依赖会话记录、其它任务计划或未写入本文的设计上下文。

任务完成后必须新增中文任务报告：

```text
tasks/125-vnicore-manual-cyclic-playback-[utctime].md
```

UTC 时间戳格式：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/125-vnicore-manual-cyclic-playback-260723-153000.md
```

## 2. 已确认的真实样本

本任务的真实验收样本是：

```text
/Users/zerro/Downloads/bamboo4 (pixi).zip
```

制定计划时确认的信息：

```text
SHA-256: 8ba263e5823209c65bd23d0500b29f24364dbaeedb2db584d7a67a2285dcb44e
size:    12,801,143 bytes
bundle:  VNI_0.103
runtime profile: runtime_100
runtime project: runtime_100/bamboo4.json
stage: 2000 x 2000
stage duration: 10s
```

关键动画：

```text
layerId:     layer_image_mrtos52v_5
animationId: anim_module_mrtosrk3_6
type:        card_carousel_3d
cardCount:   13
```

导出参数对应的五个视觉阶段：

| 阶段 | 参数 | 导出时间 |
| --- | --- | --- |
| 出现 | `introDuration=1.5` | `0..1.5` |
| 慢速演示 | `demoIdleDuration=1.5` | `1.5..3` |
| 加速/快速 | `fastDuration=2` | `3..5` |
| 减速停止 | `stopDuration=1.6` | `5..6.6` |
| 停留 | `holdDuration=3` | `6.6..9.6` |

其它末尾效果：

- `光效2` 的透明度关键点在 `7.15..8.1`。
- `Dgx 序列帧` 的显示关键点在 `7.15..8.05`。
- 这些普通时间轴层必须在宿主启动收尾段后继续按原项目时间播放，不能因为 card carousel 使用动态相位而漂移。

执行任务前必须重新验证样本：

```bash
shasum -a 256 '/Users/zerro/Downloads/bamboo4 (pixi).zip'
unzip -p '/Users/zerro/Downloads/bamboo4 (pixi).zip' manifest.json | jq .
unzip -p '/Users/zerro/Downloads/bamboo4 (pixi).zip' runtime_100/bamboo4.json \
  | jq '{schemaVersion,name,stage,exportProfile,layers}'
```

若该 ZIP 缺失或 hash 不一致：

- 不得下载或猜测另一个同名资源冒充。
- 纯函数、Pixi mock 和 synthetic fixture 测试仍可继续。
- 真实样本验收必须在报告中标记为阻塞或使用经用户确认的新 hash。
- 不要把 12MB ZIP 提交进仓库，除非用户另行明确要求。

## 3. 当前实现基线与问题

### 3.1 现有 segmented 播放

当前文件：

```text
packages/vnicore/src/core/playback-sequence.ts
packages/vnicore/src/pixi/vni-player.ts
```

当前 `VNISegmentedPlaybackSequence` 已经提供：

- start。
- loop。
- ending。
- particle draining。
- `loopIndex`。
- `loopElapsedTime`。
- `requestSegmentedPlaybackEnd()`。

但普通区间 loop 会把 `currentTime` 从 `loopEnd` 回绕到 `loopStart`。这对真正无缝的逐帧片段是合理的，对需要保持连续相位的运动模块则会造成拉回。

现有 segmented API 已被以下消费者使用：

```text
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/src/popup/award-player.ts
apps/anieditorv5viewer
```

本任务不得破坏这些消费者，也不得改变它们未启用新控制能力时的播放、粒子排空和 completion 语义。

### 3.2 现有 card carousel core

当前文件：

```text
packages/vnicore/src/core/card-carousel-3d.ts
```

当前 `prepareCardCarousel3D()` 在初始化时固定计算：

- `targetIndex`。
- `introRotation`。
- `idleRotation`。
- `fastRotation`。
- `stopStartRotation`。
- `stopFinalRotation`。

`sampleCardCarousel3D()` 只接收 timeline progress，因此：

- 慢速段重复采样会回到导出的慢速段起点。
- 慢速实际等待超过 `demoIdleDuration` 后，无法从真实角度进入 fast。
- 服务器晚到的目标不能动态改变。
- `targetIndex` 仍是导出预览目标，而不是本轮运行结果。

### 3.3 现有 Pixi renderer

当前文件：

```text
packages/vnicore/src/pixi/card-carousel-3d-renderer.ts
```

当前 runtime：

- 初始化时为每个 carrier 创建稳定 `PIXI.Container`。
- 每个 carrier 固定创建 `slices` 个 Sprite。
- texture 在 constructor 中一次确定。
- image layer 只有一张 texture，因此 Bamboo 的 13 个 carrier 当前全部显示同一张 `card01.png`。
- slice texture view 由 renderer 级 Map 缓存，直到整个 renderer destroy。

本任务需要支持 carrier 内容替换，但必须继续满足：

- 不因每帧 update 重建 carrier container、slice sprite 或 texture view。
- 不销毁 project/shared/host 提供的 source texture。
- 动态替换不能造成 slice texture cache 无界增长。

### 3.4 VNIPlayer 的 renderer 所有权边界

`VNIPlayer` 当前只接收宿主提供的 Pixi `parent`，不拥有：

- `PIXI.Application`。
- renderer。
- canvas。
- DOM。

因此本任务不能在 vnicore 内把任意实时 `PIXI.Container` 偷偷渲染成 RenderTexture，也不能增加隐藏 canvas/renderer。

首版可替换内容合同必须限定为：

1. 当前 project 内已加载且经过尺寸校验的 asset texture；或
2. 宿主明确提供的有效 `PIXI.Texture`。

如果宿主想把复合节点作为卡片内容，应由宿主使用自己的 renderer 先生成 texture，再把 texture 交给 vnicore。实时动态 Container、每帧 snapshot 和 mesh 化任意节点不属于本任务。

## 4. 核心设计决定

### 4.1 不改编辑器和导出 schema

本任务不修改：

```text
docs/anieditor5/src/**
docs/anieditor5/export/**
packages/anieditorv5runtime-cc/**
```

不新增 VNI JSON 字段，不提升 schema version，不修改 `bamboo4 (pixi).zip`。

出现、等待和收尾的时间范围由宿主在 TypeScript 配置中明确提供。未来可由编辑器导出同构 recipe，但不是本任务前置条件。

### 4.2 通用手工播放与可选能力分层

公共能力分两层：

1. **手工播放控制层**
   - 播放任意 range 一次。
   - 将主时间轴 hold 在指定时间。
   - 在 hold 期间继续推进被显式激活的 runtime animation。
   - 返回可等待、可取消、可销毁的 operation。
   - 不假定一定是三段式。

2. **连续周期选择能力**
   - 维护不回绕的连续周期相位。
   - 维护固定数量的物理 carrier。
   - 绑定可替换内容。
   - 在 renderer 报告的安全位置提交内容。
   - 根据当前真实相位和目标 carrier 动态规划停止。
   - 不关心是 3D、2D、圆盘、传送带还是其它 renderer。

`card_carousel_3d` 是首个实现连续周期选择能力的 renderer adapter，但公共手工播放状态机不能出现 Bamboo、card、3D、13、服务器或用户点击等业务常量。

### 4.3 固定 carrier 与业务内容分离

13 个 carrier 的 identity 和相位偏移在 runtime 生命周期内固定：

```text
carrier 0..12
offset = carrierIndex / carrierCount
```

禁止：

- 因为慢速等待更久而新增 carrier。
- 在数组中插入数据导致后续 carrier index 改变。
- 因为服务器结果晚到而重排 carrier 几何。
- 用“补 3 秒数据”改变物理圆环长度。

业务内容通过稳定且非空的 `itemKey` 绑定到 carrier。内容可以替换，carrier identity 和相位不能替换。

### 4.4 `demoIdleDuration` 只是导出演示时长

在受控连续播放中：

```text
continuousRotation =
  introEndRotation
  + direction * idleSpeed * phaseElapsedSeconds * 2π
```

`demoIdleDuration` 仅用于：

- 原始 full-demo timeline。
- editor/runtime 未启用手工控制时的旧行为。
- 构造 backward-compatible 的默认预览结果。

它不能限制 production 等待时间，也不能被当成必须走完一圈的 loop clip。

### 4.5 收尾段从真实状态重新规划

服务器结果提交完成时保存：

- 当前 unwrapped rotation。
- 当前 direction。
- 当前 velocity。
- 每个 carrier 的内容 key。
- selected carrier index。

动态 fast/stop plan 必须从该 snapshot 出发。

对目标 carrier `j`，最终正面对齐条件为：

```text
finalRotation + j * 2π / carrierCount ≡ 0  (mod 2π)
```

结束计划：

1. fast 段的相对旋转从当前 rotation 开始累计。
2. stop 起点使用“当前真实 rotation + fast 相对旋转”，不能使用导出时固定的 `stopStartRotation`。
3. 按 direction 计算到目标 carrier 的最小正向/反向差值。
4. 加上导出 `rounds` 指定的完整圈数。
5. 使用原 `stopDuration`、`stopOvershoot` 和 easing 采样。
6. hold 固定保持动态算出的最终 rotation。

未启用受控播放时，full-demo 在所有既有采样点必须保持现有结果。可以通过“实际 idle elapsed 等于 `demoIdleDuration`、target 等于导出 `targetIndex`”复用同一纯函数 plan，避免维护两套数学公式。

## 5. 目标 public API 合同

具体类型名可按仓库命名习惯微调，但职责、严格性和生命周期不得削弱。

### 5.1 手工播放 session

实现以下等价合同：

```ts
export interface VNIManualPlaybackSession {
  playRange(
    options: VNIManualPlayRangeOptions,
  ): VNIPlaybackOperation;

  holdTimeline(options: {
    at: VNIPlaybackPoint;
  }): VNITimelineHoldHandle;

  advanceFor(options: {
    readonly durationSeconds: number;
  }): VNIPlaybackOperation;

  listAnimations(options?: {
    readonly capability?: VNIRuntimeAnimationCapability;
  }): readonly VNIManualAnimationInfo[];

  getAnimation(
    ref: VNIAnimationRuntimeRef,
  ): VNIManualAnimationController;

  getState(): VNIManualPlaybackState;
  destroy(): void;
}

export interface VNIPlaybackOperation {
  readonly completed: Promise<VNIPlaybackOperationComplete>;
  cancel(): void;
}

export interface VNITimelineHoldHandle {
  release(): void;
}

export interface VNIManualPlayRangeOptions {
  readonly range: VNIPlaybackRange;
  readonly preserveRuntimeAnimationState?: boolean;
}

export interface VNIAnimationRuntimeRef {
  readonly layerId: string;
  readonly animationId: string;
}

export interface VNIManualAnimationInfo {
  readonly ref: VNIAnimationRuntimeRef;
  readonly layerName: string;
  readonly animationName: string;
  readonly animationType: string;
  readonly capabilities: readonly VNIRuntimeAnimationCapability[];
}
```

入口：

```ts
const session = player.createManualPlaybackSession();
```

严格约束：

- 一个 `VNIPlayer` 同时最多一个 active manual session。
- manual session active 时调用 legacy `play/restart/seek/playRange` 必须显式失败；宿主必须先 destroy manual session，不能两个 transport 同时写时间。
- `destroy()` 必须取消 active operation、拒绝未完成 Promise、清理 runtime override。
- 新 range 开始前宿主必须显式 `release()` 当前 timeline hold；未 release 时调用 `playRange()` 必须失败，不得让两个 timeline driver 同时存在。
- `autoTick:false` 时仍只由宿主调用 `player.update(deltaSeconds)`。
- `autoTick:true` 时，只要 hold 中存在 active continuous animation，player ticker 必须继续。
- 主时间轴 hold 时，普通 layer 使用固定 timeline time；只有显式激活的 runtime animation 使用连续 phase clock。
- `advanceFor()` 使用 player 的实际 update delta 累计 active hold/continuous runtime，达到指定 finite positive 秒数后完成；不得使用 `setTimeout`。它用于 Viewer 自动预览等确定时长场景，生产宿主等待用户/服务器时不必调用。
- `listAnimations()` 只返回已校验 project 中的稳定 ref、展示名称、type 和显式 capability；Viewer 用它构造选择器，不扫描 private runtime、不按 animation name 猜类型。
- completion listener、marker 和 particle 行为必须写清楚。manual range 应复用现有真实 timeline/particle 语义，不得另造 wall-clock completion。

若实现审计证明在 `VNIPlayer` 直接增加等价方法更简洁，可以不引入 session class，但必须保持：

- public 操作可等待。
- transport 冲突显式失败。
- manual hold 能推进 runtime animation。
- 生命周期和取消语义完整。

### 5.2 animation capability 查询

实现以下等价合同：

```ts
export type VNIRuntimeAnimationCapability =
  | "continuous-phase"
  | "replaceable-carriers"
  | "cyclic-selection";

export interface VNIManualAnimationController {
  readonly ref: VNIAnimationRuntimeRef;

  getCapabilities(): readonly VNIRuntimeAnimationCapability[];

  requireCyclicSelection():
    VNICyclicSelectionController;

  clearRuntimeOverride(): void;
}
```

要求：

- 未知 layer、未知 animation、disabled animation 显式失败。
- 同一个 ref 解析到多个对象或 animation type 不支持 capability 时显式失败。
- 不允许从 animation name、layer name 或参数形状猜 capability。
- `card_carousel_3d` 首版声明上述三个 capability。
- 未来其它 renderer 可实现同一 `cyclic-selection`，不用新增 `getCardCarousel3DController()`。

### 5.3 周期选择控制

实现以下等价合同：

```ts
export interface VNICyclicSelectionItem {
  readonly key: string;
  readonly visual:
    | {
        readonly kind: "project-asset";
        readonly assetId: string;
      }
    | {
        readonly kind: "texture";
        readonly texture: PIXI.Texture;
      };
}

export interface VNICyclicSelectionController {
  getState(): VNICyclicSelectionState;
  getAuthoredPreviewDescriptor(): VNICyclicAuthoredPreviewDescriptor;

  setInitialItems(
    items: readonly VNICyclicSelectionItem[],
  ): void;

  adoptAuthoredItems(): void;

  startContinuousPhase(options: {
    readonly phaseId: string;
  }): void;

  prepareSelection(options: {
    readonly selectedItem:
      | { readonly key: string }
      | VNICyclicSelectionItem;
  }): VNICyclicSelectionTransaction;

  prepareAuthoredSelection(): VNICyclicSelectionTransaction;

  startResolvePhase(): void;
  clear(): void;
}

export interface VNICyclicAuthoredPreviewDescriptor {
  readonly introRange: VNIPlaybackRange;
  readonly continuousHoldPoint: VNIPlaybackPoint;
  readonly continuousPhaseId: string;
  readonly authoredContinuousPreviewDurationSeconds: number;
  readonly endingRange: VNIPlaybackRange;
  readonly authoredTargetCarrierIndex: number;
}

export interface VNICyclicSelectionTransaction {
  readonly committed: Promise<{
    readonly itemKey: string;
    readonly carrierIndex: number;
  }>;
  cancel(): void;
}
```

`phaseId` 必须由 capability 明确列出，并且只能指向可无限推进的 continuous phase。首个 adapter 支持：

```text
idle
```

`startResolvePhase()` 是 cyclic-selection capability 的通用“从当前连续相位进入选中结果”动作，不把 fast/stop/hold 暴露成宿主必须逐段拼接的 3D 专属方法。generic controller 不解析 `card_carousel_3d` 参数；adapter 自己把 continuous/resolve 映射到现有 `idleSpeed/fastDuration/stopDuration/holdDuration`。

`getAuthoredPreviewDescriptor()`、`adoptAuthoredItems()` 和 `prepareAuthoredSelection()` 是显式的预览合同，不是错误 fallback：

- descriptor 由 animation adapter 从已严格校验的导出参数产生，Viewer 不直接解析 `card_carousel_3d.params`。
- `authoredContinuousPreviewDurationSeconds` 是导出演示慢速段的建议预览时长；它只决定 Viewer 输入框默认值，不限制 continuous phase 的真实持续时间。
- authored items 使用现有 image/sequence modulo 结果建立稳定 carrier binding。
- authored selection 使用导出 `targetIndex`。
- 只有调用方显式调用这些 API 才采用 authored 内容和目标。
- 缺少合法 authored target、texture 或 capability 时显式失败，不能退回 carrier 0。

### 5.4 Bamboo 的预期接入示例

最终 public example 应能表达以下流程：

```ts
const session = player.createManualPlaybackSession();
const animation = session.getAnimation({
  layerId: "layer_image_mrtos52v_5",
  animationId: "anim_module_mrtosrk3_6",
});
const cyclic = animation.requireCyclicSelection();

cyclic.setInitialItems(initialItems);

await session.playRange({
  range: { unit: "time", start: 0, end: 1.5 },
}).completed;

const hold = session.holdTimeline({
  at: { unit: "time", at: 1.5 },
});
cyclic.startContinuousPhase({ phaseId: "idle" });

// 用户操作和服务器请求期间，idle 持续推进。
const serverResult = await requestResult();

const transaction = cyclic.prepareSelection({
  selectedItem: serverResult.selectedItem,
});
await transaction.committed;

hold.release();
cyclic.startResolvePhase();
await session.playRange({
  range: { unit: "time", start: 3, end: 9.6 },
  preserveRuntimeAnimationState: true,
}).completed;
```

示例中的 `requestResult()` 只表示宿主异步操作，不得进入 vnicore。

若实施后 API 形状不同，最终 example 仍必须清楚体现以下顺序：

```text
intro complete
→ continuous idle
→ user/server wait
→ safe content commit
→ resolve start
→ ending timeline complete
```

### 5.5 Viewer 自动预览的预期调用

Viewer 不模拟用户确认和服务器交互，也不要求输入停止点。预期调用语义：

```ts
const descriptor = cyclic.getAuthoredPreviewDescriptor();
cyclic.adoptAuthoredItems();

await session.playRange({
  range: descriptor.introRange,
}).completed;

const hold = session.holdTimeline({
  at: descriptor.continuousHoldPoint,
});
cyclic.startContinuousPhase({
  phaseId: descriptor.continuousPhaseId,
});

await session.advanceFor({
  durationSeconds: configuredContinuousDurationSeconds,
}).completed;

await cyclic.prepareAuthoredSelection().committed;
hold.release();
cyclic.startResolvePhase();

await session.playRange({
  range: descriptor.endingRange,
  preserveRuntimeAnimationState: true,
}).completed;
```

要求：

- Viewer 只提供一个“自动预览/重新播放”动作，不提供本模式专属的“确认结果”或“结束循环”按钮。
- `configuredContinuousDurationSeconds` 是 finite、非负、有明确上限的秒数。`0` 合法，表示出现段后立即按 authored target 收尾。
- `advanceFor()` 若统一要求 positive duration，Viewer 对 `0` 必须直接跳过该 operation，不能传非法值或使用 timer fallback。
- authored target carrier 最终必须与原 full-demo 的 `targetIndex` 相同。
- 延长慢速阶段只能增加运动路径，不能改变最终停点。

## 6. 内容绑定与安全提交合同

### 6.1 初始绑定

受控播放启用前：

- `items.length` 必须严格等于 `carrierCount`。
- 每个 `key` trim 后必须非空。
- key 必须唯一。
- project asset id 必须存在、已加载并通过现有 texture size 校验。
- external texture 必须有 finite positive width/height、合法 source/frame。
- 同一个 item key 不能绑定多个 carrier。
- 初始化失败不能部分修改已有 carrier。

原始非受控 timeline 继续按现有 image/sequence modulo 行为播放，以保持兼容。

一旦调用 `setInitialItems()` 进入受控模式，就不能把缺失 item 静默补成原始 `card01.png`。

### 6.2 服务器结果已存在

如果 `selectedItem.key` 已绑定：

- 不替换 texture。
- 直接锁定该 carrier。
- 用该 carrier index 规划最终停止。

如果同 key 却携带不同 visual：

- 必须视为显式 replacement。
- 仍要经过安全提交。
- 不能因为 key 相同而忽略 visual 变化。

### 6.3 服务器结果是新内容

如果 selected item 尚未绑定：

1. visual 必须先完全准备好。
2. runtime 从当前未锁定 carrier 中选择安全候选。
3. 当前可见 carrier 不允许换图。
4. 若当前无安全候选但未来存在隐藏窗口，transaction 保持 pending，直到真实 update 边界可提交。
5. 若当前配置从几何上不可能出现隐藏 carrier，立即拒绝 transaction。
6. commit 必须在单帧边界原子更新 item key、texture info 和全部 slice sprite texture。
7. commit 后锁定该 carrier，并返回实际 `carrierIndex`。

不允许：

- visible swap。
- alpha 瞬间设 0 掩盖替换。
- crossfade fallback。
- 临时增加第 14 个 carrier。
- 修改 `targetIndex` 后重建整个 runtime。
- transaction 永久 pending 却没有 destroy/cancel rejection。

### 6.4 安全性的判断归属

core cyclic state 不依赖 Pixi，只处理 carrier identity、phase、selection 和 plan。

renderer adapter 负责报告：

```ts
isCarrierSafeToReplace(carrierIndex): boolean
```

`card_carousel_3d` 首版以实际 sample 的 `visible` 结果作为提交依据。不能在 app 中复制 `hideBack`、`visibleRange`、frontness 或角度公式。

### 6.5 资源所有权

- project source texture 由 player 现有资源生命周期拥有。
- host 传入 texture 继续由 host 拥有。
- vnicore 不销毁上述 source texture。
- vnicore 创建的 slice texture view 由 vnicore 拥有。
- carrier 替换或 runtime destroy 时必须正确 release slice view。
- 对共享 slice view 使用引用计数或等价的有界生命周期，不能因为多轮 replacement 永久累积 Map entry。

## 7. Core 数学与状态实现

### 7.1 新增通用周期状态纯函数

建议新增：

```text
packages/vnicore/src/core/cyclic-selection.ts
```

职责：

- unwrapped phase/rotation。
- carrier offset。
- direction-aware modulo。
- continuous advance。
- selection lock。
- resolve plan。
- exact final alignment。
- 状态转换验证。

不得依赖：

- Pixi。
- DOM。
- texture。
- `card_carousel_3d` 几何字段。
- Bamboo 名称。

建议状态：

```ts
export interface VNICyclicMotionSnapshot {
  readonly phase: "continuous" | "resolving" | "settled";
  readonly unwrappedTurns: number;
  readonly velocityTurnsPerSecond: number;
  readonly carrierCount: number;
  readonly selectedCarrierIndex: number | null;
}
```

内部可以用 radians 或 turns，但 public/core 测试要固定一种单位，避免混用。

### 7.2 抽离 card carousel 的 motion 与 geometry

将现有 `sampleCardCarousel3D()` 拆为：

1. motion sampler：产生 rotation、introElapsed、stopPhase、targetIndex。
2. geometry sampler：根据上述 motion 和每个 carrier 的 texture info 产生 card/slice sample。

建议新增输入：

```ts
export interface VNICardCarousel3DMotionSample {
  readonly rotation: number;
  readonly introElapsed: number;
  readonly stopPhase: number;
  readonly targetIndex: number;
}
```

保留现有 `sampleCardCarousel3D()` public 行为，可让它组合 legacy motion + geometry，避免直接破坏既有 consumer。

受控 runtime 使用动态 motion sample：

- intro：可以继续采样原 timeline。
- idle：使用累计 phase elapsed。
- resolve：使用从 snapshot 生成的 plan。
- hold：保持动态 final rotation。

### 7.3 数值稳定性

- 对累计时间保留 unwrapped turns，用 modulo 后的 phase 做三角函数。
- 不在每帧对 carrier 数组排序或重建。
- 长时间 idle 后仍应保持有限数值。
- 至少测试 1 小时 simulated idle，不应出现 NaN、Infinity 或明显对齐漂移。
- 大 delta update 必须正确跨越 phase 边界，不能漏掉 safe commit。
- `deltaSeconds <= 0`、NaN、Infinity 继续显式失败。

## 8. Pixi renderer 改造

### 8.1 per-carrier texture

当前 `textures[cardIndex % textures.length]` 应在 runtime 初始化时规范化为长度严格等于 `cardCount` 的 per-carrier binding。

legacy 路径：

- image layer：一张 texture 映射到所有 carrier。
- sequence layer：继续按 `cardIndex % frameCount`。

受控路径：

- 每个 carrier 独立 texture。
- 替换只更新目标 carrier。
- geometry sampler 直接读取对应 carrier texture info。

### 8.2 稳定 display tree

以下对象在一次 runtime 生命周期内必须保持 identity：

- root。
- carrier container。
- 每个 slice sprite。
- draw order buffer。
- sample buffer。

动态替换只允许更新：

- slice sprite texture。
- per-carrier texture info。
- item binding metadata。

### 8.3 slice texture cache

重构当前 cache 为引用计数或等价有界实现：

- key 至少包含 source texture identity、frame、slice count、slice index。
- 同一 source/frame/slice 组合复用。
- carrier 换图时 release 旧 views。
- refcount 归零时 destroy view，不 destroy source。
- runtime destroy 释放全部引用。
- renderer destroy 后 cache 必须为空。

测试不得通过放宽资源销毁断言掩盖泄漏。

## 9. Manual playback transport

### 9.1 range operation

复用现有 normalize range、marker、particle 和 deterministic sampling。

新增 operation Promise 时：

- 正常到达 end 后 resolve。
- `cancel()`、session destroy、player destroy 或其它合法取消边界统一以公开的 `VNIPlaybackCancelledError` reject；不得 resolve 成看似正常完成。
- active range operation 存在时启动另一个 range operation 显式失败，不能隐式取消前一个。
- operation 自身 `cancel()`、`manualSession.destroy()` 和 `player.destroy()` 必须按上述合同完成取消；legacy `restart/seek` 在 manual session active 时按前述规则显式失败。
- listener 抛错继续传播，不能吞掉。
- 不通过 `setTimeout` 判断完成。

### 9.2 timeline hold + continuous runtime

hold 期间：

- `currentTime` 保持传入时间。
- 普通 project layers 每帧采样同一 timeline time。
- live particle 是否继续，必须沿用显式 options，不从 cyclic animation 推断。
- active continuous animation 使用自己的 `phaseElapsedTime += deltaSeconds`。
- Pixi render 仍按每帧输出更新。
- `getState()` 必须能区分 timeline hold 和 active continuous animation。

### 9.3 resolve 与普通末尾层同步

进入 Bamboo 收尾时：

- 普通主时间轴从 `3` 播放到 `9.6`。
- card carousel 不再使用导出时固定的 idle 总角度，而使用 dynamic resolve plan。
- `光效2` 和 `Dgx` 仍在主时间轴 `7.15` 附近触发。
- total wall-clock duration 等于：

  ```text
  intro wall time
  + arbitrary server/user wait
  + ending wall time
  ```

- arbitrary wait 不应改写 project JSON、stage duration、animation duration 或 basic keyframe time。

## 10. anieditorv5viewer 配置与 Tab 布局

### 10.1 当前布局问题

当前文件：

```text
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/styles.css
apps/anieditorv5viewer/tests/main.test.ts
```

当前 `.viewer-shell` 使用：

```css
grid-template-rows: minmax(0, 1fr) auto;
```

控制区把以下内容同时纵向 append：

```text
ZIP/Profile
summary
普通播放
高级 segmented 播放
组间插入
文字层替换
```

控制区高度是 `auto`，因此面板越多，上方 `.stage-panel` 越小。本任务增加连续周期预览配置时，不得继续在底部追加第五块常驻面板。

### 10.2 Tab 信息架构

控制区改为四个 tab：

| Tab | 内容 |
| --- | --- |
| 项目 | ZIP、Profile、upload error、project summary |
| 播放 | 普通播放、timeline、现有 segmented 高级播放、连续周期预览 |
| 组间插入 | 现有 group slot 插入功能 |
| 文字替换 | 现有 text layer replacement 功能 |

要求：

- 只有 active tab panel 参与布局；inactive panel 使用标准 `hidden`/等价无布局方式。
- 首次打开且未加载项目时默认“项目”。
- 成功加载 profile 后自动切换到“播放”。
- profile 切换、重复上传和项目清理不能留下旧 panel error、active operation 或 disabled 状态。
- tab 选择只属于当前页面 session，不写 URL、localStorage 或项目。
- tab 切换只改变 UI 可见性，不暂停、重启或销毁正在播放的 animation。
- 普通 Play/Restart/Loop/timeline 仍在“播放”页，不得因 tab 改造丢失。

### 10.3 可访问性

使用原生 DOM 实现，不新增 UI 框架。

必须具备：

- tab 容器 `role="tablist"`。
- tab button `role="tab"`。
- 唯一稳定 id。
- `aria-selected`。
- `aria-controls`。
- active tab `tabIndex=0`，其它为 `-1`。
- panel `role="tabpanel"` 和 `aria-labelledby`。
- `ArrowLeft/ArrowRight/Home/End` 键盘切换与焦点移动。
- `ArrowLeft/ArrowRight` 在首尾循环，`Home` 固定到第一个 Tab，`End` 固定到最后一个 Tab。
- disabled 功能放在 panel 内按现有规则禁用，不能禁用整个 tab 导致信息不可查看。

测试必须按 role/aria 查询，不依赖 child index 或 CSS 选择器顺序。

### 10.4 控制区尺寸

Tab 改造后按以下基线限制控制区，执行时可根据真实浏览器结果微调数值，但不得削弱“控制区有界、panel 内滚动、stage 保留主要空间”三项合同：

- `.viewer-shell` 保持 stage 为 `minmax(0, 1fr)`。
- desktop 的 `.controls-panel` 使用 `min-height: 0; max-height: min(38vh, 360px)`。
- `max-width: 720px` 时 `.controls-panel` 使用 `max-height: min(46vh, 420px)`。
- `.viewer-controls` 分成固定 tab bar 与 `minmax(0, 1fr)` panel host；active panel 使用 `min-height: 0; overflow: auto`。
- tab bar 固定可见，只有 active panel 内部滚动。
- 不允许整个 `body` 恢复页面级滚动破坏 canvas viewport。
- 窄屏可以提高 controls 最大占比，但必须至少保留可用的 stage 区域。
- 不通过缩小 Pixi logical viewport 冒充预览区变大；`stageMount`、renderer size 和 `VNIPlayer.setViewportSize()` 仍保持一致。

最终具体尺寸以浏览器验收为准，但报告必须记录 desktop 和窄屏实际 stage/control 尺寸。

### 10.5 连续周期预览 UI

“播放”Tab 在现有 segmented 高级播放之外新增“连续周期预览”分区。

控件：

1. `cyclic-selection` animation selector。
2. 慢速持续秒数 number input。
3. 只读展示：
   - intro range。
   - continuous phase id。
   - ending range。
   - authored target carrier index（仅用于诊断展示，不可编辑）。
4. “自动预览”按钮。
5. 当前 manual/cyclic state。
6. 独立错误区域。

Viewer 通过：

```ts
session.listAnimations({
  capability: "cyclic-selection",
});
```

生成 selector。规则：

- 零个 capability：显示“不支持连续周期预览”，按钮禁用。
- 一个 capability：自动选中。
- 多个 capability：必须由用户从枚举选择，不能猜第一个并立即播放。
- 不提供自由输入 layerId/animationId。
- 不读取或复制 `card_carousel_3d.params`。
- descriptor 和 authored target 只来自 public controller API。

慢速持续秒数：

- finite。
- `>= 0`。
- 上限固定为 `3600` 秒，并在 input 使用同一 `max`。
- 默认值取 `descriptor.authoredContinuousPreviewDurationSeconds`，不能由 Viewer 解析私有 params，也不能以 Viewer 常量猜测动画字段。
- input 非法时按钮禁用并显示错误。

### 10.6 自动预览行为

点击一次“自动预览”后，Viewer 自动完成：

```text
cancel/destroy previous viewer manual session
→ create fresh manual session
→ adopt authored carrier items
→ play intro range once
→ hold main timeline
→ start continuous phase
→ advance for configured seconds
→ prepare authored selection
→ release hold
→ start resolve
→ play ending range once
→ complete
```

Viewer 不显示或要求：

- “确认结果”按钮。
- “结束循环”按钮。
- target index 输入。
- selected item key 输入。
- server mock payload。

现有 segmented 面板的“开始/结束”按钮继续保留，因为它是独立的通用 segmented 调试功能；连续周期预览不得复用它的 end button。

若慢速持续时间为 `0`：

- intro 结束后直接 prepare authored selection。
- 不创建非法 zero-duration `advanceFor()`。
- 仍从 intro 的真实结束相位进入动态 resolve。

若用户在自动预览期间：

- 再次点击自动预览：先显式取消并 destroy 上一 manual session，再从干净状态重播。
- 点击普通 Play/Restart/Seek/segmented start：先显式终止 manual preview，再执行请求；不能让 transport 冲突异常泄漏到 UI。
- 切换 tab：播放继续。
- 上传新 ZIP、切换 profile 或卸载页面：取消 operation、destroy manual session、destroy旧 player/Blob URL/Pixi app。

取消属于 Viewer lifecycle 编排；角度、safe replacement、authored target 和停止规划仍只能调用 vnicore public API。

### 10.7 保持 authored 最终点

连续预览没有服务器结果时，必须显式调用：

```ts
cyclic.prepareAuthoredSelection()
```

不得：

- 在 Viewer 读取 `params.targetIndex`。
- 硬编码 target `0`。
- 直接 seek 到原动画末帧。
- 因为慢速阶段变长而选择当前最靠近正面的 carrier。

验收条件：

- 原始 full-demo 最终正面的 carrier 为 `j`。
- continuous duration 分别为 `0`、`1.5`、`4.5`、`10` 秒时，最终正面仍是同一个 `j`。
- 路径可变，最终 authored target 不变。

### 10.8 Viewer 文件与职责

预计修改：

```text
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/ui/controls.ts
apps/anieditorv5viewer/src/styles.css
apps/anieditorv5viewer/tests/main.test.ts
apps/anieditorv5viewer/README.md
```

如控件文件继续膨胀，可拆为：

```text
apps/anieditorv5viewer/src/ui/tabs.ts
apps/anieditorv5viewer/src/ui/cyclic-playback-controls.ts
```

拆分标准是职责清晰，不是为了测试暴露 private helper。Viewer 只：

- 收集/校验用户输入。
- 显示 capability/descriptor/state。
- 编排 public API。
- 管理 tab DOM 和页面 lifecycle。

Viewer 不实现：

- cyclic phase math。
- target alignment。
- carrier visibility。
- texture slice。
- safe commit。
- private Pixi tree mutation。

## 11. 状态、错误与生命周期

必须明确并测试状态：

```text
uncontrolled
configured
intro/range
continuous
selection-pending
selection-committed
resolving
hold/complete
cancelled
destroyed
```

至少显式失败：

- duplicate manual session。
- unknown animation ref。
- unsupported capability。
- `setInitialItems()` 数量不等于 carrier count。
- duplicate/empty item key。
- invalid project asset/texture。
- continuous phase 已开始后再次覆盖 initial items。
- prepare selection 时 key 不存在且未提供 visual。
- selection 尚未 committed 就 start resolve。
- resolve 已开始后再次 prepare selection。
- 没有可能隐藏的 carrier 却要求替换可见内容。
- destroyed/cancelled controller 的任何 mutation。
- legacy seek/restart 与 active manual transport 冲突。

禁止加入：

- 默认 target 0。
- 缺 item 时使用 placeholder。
- target key 找不到时选择第一个。
- 未知 phase 回退到 idle。
- visible replacement。
- stop 失败时瞬间 seek 到终点。
- Promise rejection 被 console warning 替代。

## 12. 详细实施步骤

### 12.1 执行前审计

运行：

```bash
git status --short --untracked-files=all
git diff -- packages/vnicore apps/anieditorv5viewer packages/rendercore agents.md tasks
git log --oneline --decorate -15 -- packages/vnicore
```

要求：

- 识别并保留用户已有修改。
- 不回滚、不覆盖、不格式化无关文件。
- 若 `packages/vnicore` 有重叠未提交修改，先在报告中记录归属并绕开；无法安全绕开时停止并请求用户确认。

### 12.2 建立 characterization tests

在改生产代码前增加或整理测试，锁定：

- 当前 full-demo 每个阶段关键采样值。
- 导出 `targetIndex` 的旧停止对齐。
- sequence modulo。
- carrier/slice pool identity。
- segmented loop/ending/particle drain。
- rendercore win-amount/popup 既有调用行为。

不要为了保留偶然实现细节写脆弱测试；锁定的是 public 行为、数学结果和资源生命周期。

### 12.3 实现纯 core cyclic state

- 新增 continuous phase advance。
- 新增 target carrier alignment。
- 新增 resolve plan。
- 覆盖 direction `1|-1`。
- 覆盖所有 target index。
- 覆盖任意 idle elapsed。
- 证明 final modulo 精确对齐。

### 12.4 重构 card carousel sampling

- motion/geometry 分离。
- legacy wrapper 保持。
- dynamic target 不修改 frozen prepared config。
- full-demo parity。
- 不把 runtime binding 或 Pixi 类型放进 core sampler。

### 12.5 重构 Pixi card runtime

- per-carrier texture info。
- carrier texture replacement。
- ref-counted slice view。
- renderer visibility 作为 safe commit signal。
- target highlight 使用 dynamic selected carrier。
- destroy/cancel 完整清理。

### 12.6 实现 manual transport

- 可等待 range operation。
- timeline hold。
- continuous runtime tick。
- transport 冲突。
- autoTick true/false。
- range/hold/resolve 之间保存和恢复状态。

### 12.7 实现 capability controller

- animation ref 解析。
- capability 查询。
- initial item binding。
- selection transaction。
- safe commit。
- resolve gate。
- state snapshot。
- cancellation/destroy rejection。

### 12.8 接通 Bamboo 三段流程

使用 synthetic project 自动化测试复现 Bamboo 参数，不手改真实 JSON。

验证：

1. intro `0..1.5`。
2. idle 分别持续 `0s`、`1.5s`、`4.5s`、`13.7s`。
3. 服务器结果在 idle 任意 phase 到达。
4. 新 selected item 在隐藏 carrier commit。
5. resolve 只在 committed 后开始。
6. selected carrier 最终正面对齐。
7. 普通末尾 layer 按 `3..9.6` 时间轴触发。

### 12.9 接入 anieditorv5viewer 自动预览

- 通过 `listAnimations({ capability: "cyclic-selection" })` 建立严格 selector。
- 从 public descriptor 初始化慢速持续秒数及只读诊断信息。
- 点击一次自动编排 intro、continuous、authored selection、resolve 和 ending。
- 慢速阶段变长后仍调用 `prepareAuthoredSelection()`，不得读取私有参数或自己计算 stop。
- 重复播放、普通播放命令、ZIP/profile 切换和页面卸载都按生命周期合同取消并销毁旧 manual session。
- 零时长、非法输入、零个或多个 capability、operation rejection 都提供确定 UI 状态。

### 12.10 重构 Viewer Tab 与布局

- 将现有控件按“项目 / 播放 / 组间插入 / 文字替换”分组。
- 实现标准 tab 语义、键盘操作、焦点和 panel 显隐。
- 控制区使用有界高度和内部滚动，扩大 stage 可用空间。
- Tab 切换只改变配置面板，不中断正在进行的播放。
- 在 desktop 与窄屏验证 stage mount、renderer size 和 player viewport 一致。

### 12.11 文档与示例

至少更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/usage-en.md
packages/vnicore/examples/README.md
packages/vnicore/examples/manual-cyclic-playback.ts
apps/anieditorv5viewer/README.md
```

文档必须说明：

- manual API 是高级接口。
- editor/schema 未改变。
- `demoIdleDuration` 与 continuous wait 的区别。
- project/host texture 所有权。
- arbitrary live Container 不支持。
- safe commit 的 Promise/cancel/destroy 行为。
- 非受控 timeline 行为保持不变。
- generic manual transport 与 cyclic-selection capability 的边界。
- Viewer 自动预览为何始终使用 authored target，以及慢速时长只改变路径、不改变最终点。
- Viewer Tab 的分组、键盘操作和播放不中断语义。

### 12.12 `agents.md`

本任务建立新的长期 public/runtime 职责边界，因此完成实现后应同步更新根目录小写文件：

```text
agents.md
```

建议新增一条简洁规则，表达：

- vnicore 拥有 manual staged transport、continuous cyclic phase、固定 carrier、安全内容替换和动态目标对齐。
- 编辑器不必为本能力新增 schema。
- app 只通过 public API 配置时间范围、等待用户/服务器并提交结果。
- app/viewer 不复制角度、可见性、slice texture 或停止规划算法。
- `anieditorv5viewer` 只能通过 public capability/descriptor 编排 authored 自动预览；Tab 仅负责 UI 分组，不能成为播放状态机。
- VNIPlayer 仍不拥有 renderer/canvas。

若最终实现未形成长期边界，可不改，但必须在任务报告解释为什么不需要。

## 13. 测试计划

### 13.1 core tests

建议新增：

```text
packages/vnicore/tests/core/cyclic-selection.test.ts
```

覆盖：

- continuous idle 不回绕。
- 4.5 秒比 1.5 秒多出的相位真实累计。
- 1 小时 idle 数值有限。
- 13 carrier 全 target index。
- direction 正反。
- rounds `0` 和正整数。
- fractional、负数或超范围 rounds 显式失败；若执行时发现现有 validator 未把 `rounds` 约束为整数，应修正 validator 和测试，而不是在 planner 内截断。
- exact final alignment。
- invalid state transition。
- large delta。
- no allocation-sensitive identity regression（对预分配 buffer 做 identity 断言）。

扩展：

```text
packages/vnicore/tests/core/card-carousel-3d.test.ts
```

覆盖：

- legacy full-demo parity。
- dynamic motion sample。
- dynamic target highlight。
- per-carrier texture info。
- geometry 不关心 wall-clock idle duration。

### 13.2 Pixi tests

扩展：

```text
packages/vnicore/tests/pixi/vni-player.test.ts
```

覆盖：

- initial exact 13 bindings。
- project asset 和 host texture。
- visible carrier replacement deferred。
- hidden carrier replacement same-frame commit。
- no-safe-carrier rejection。
- selection commit before resolve。
- selected item already exists。
- same key/different visual replacement。
- source texture 不被 destroy。
- stale slice view refcount 归零后 destroy。
- 300+ frame 与多次替换不重建 container/sprite。
- restart/seek/destroy/cancel。
- autoTick false。
- manual hold 主时间不动、continuous phase 继续。
- ordinary layers and late effects follow ending timeline。

### 13.3 Viewer tests

扩展：

```text
apps/anieditorv5viewer/tests/main.test.ts
```

至少覆盖：

- 初始为“项目”Tab，加载成功后切到“播放”Tab。
- 四个 tab 的 `role`、`aria-selected`、`aria-controls`、tabpanel 关联和 hidden 状态正确。
- `ArrowLeft`、`ArrowRight`、`Home`、`End` 按键移动选择与焦点，边界循环规则固定。
- 切换 Tab 不暂停或销毁正在运行的 preview。
- 零个 cyclic capability 时禁用自动预览。
- 一个 capability 自动选中；多个 capability 必须显式选择。
- 默认慢速时长来自 public descriptor。
- 负数、NaN、Infinity、超过上限时禁止播放并显示错误。
- 自动预览调用顺序严格为 intro → hold/continuous → advance → authored selection → resolve/ending。
- duration 为 `0` 时跳过 `advanceFor()`，但仍执行 authored selection 和 resolve。
- duration 为 `0`、`1.5`、`4.5`、`10` 时均提交同一个 authored target。
- UI 不生成确认、结束循环、target index 或 selected item 输入。
- 再次自动预览先取消/销毁旧 session；普通 Play/Restart/Seek/segmented 命令先结束 manual preview。
- 上传新 ZIP、切 profile、页面卸载完整清理 operation/session/player/Blob URL/Pixi app。
- 自动预览失败只进入 Viewer 明确 error state，不吞 Promise rejection。
- 控制区 class/layout contract 保持有界高度和内部滚动；不要在 jsdom 伪造像素级浏览器布局。

若 `controls.ts` 拆分，测试 public DOM 行为和主流程 wiring，不为了测试导出 private helper。

### 13.4 既有 consumer 回归

至少执行：

```bash
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore examples:typecheck
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore format:check

CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer format:check

CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore build

git diff --check
```

如 package 实际名称或 script 已变化，以执行时 `package.json` 为准，并在报告列出实际命令。

不得为了让 mock 更容易写而扭曲 production API。若旧测试把 private 实现偶然细节当合同，先判断真实 public 行为，再修改测试。

### 13.5 真实 ZIP 人工验收

真实浏览器验收至少确认：

- ZIP 能按 `runtime_100` 正常加载。
- Viewer 能枚举并选择 Bamboo 的 cyclic-selection animation。
- Viewer 无需点击确认、结束循环或填写停止点，一次点击即可完成三段预览。
- 慢速持续秒数分别设为 `0`、`1.5`、`4.5`、`10` 时，最终均停在原 full-demo authored carrier。
- 13 个 carrier 能使用不同测试 texture。
- intro 只放一次。
- idle 等待 4.5 秒、10 秒都没有拉回。
- 服务器结果模拟延迟期间 idle 不停止。
- 可见内容不瞬换。
- resolve 开始前结果已 commit。
- 指定结果最终停在正面。
- `7.15..8.1` 末尾光效仍相对收尾时间轴正常播放。
- 重复至少 20 轮后 container/sprite 数量稳定，无明显 texture view 增长。
- destroy 后无 RAF、Promise、texture view 或 mounted display 残留。
- desktop 和窄屏下四个 Tab 可用，控制区内部滚动，预览 stage 相比改造前不再被全部配置纵向挤压。
- 键盘可切换所有 Tab，切换期间正在播放的预览不中断。

本任务已明确要求 Viewer 接入，因此临时 harness 只能辅助诊断，不能替代 Viewer 人工验收。不要把测试逻辑塞进 editor，也不要让 Viewer 复制 cyclic 算法。报告中必须记录浏览器、viewport、实际 stage/control 尺寸、最终 carrier 和未完成项。

## 14. 环境与依赖约束

仓库要求：

```text
Node.js >= 24
pnpm >= 10
```

首先检查：

```bash
command -v node
node --version
pnpm --version
```

如果 shell 中没有 `node`：

```bash
nvm use 24
node --version
pnpm --version
```

要求：

- 使用 `nvm use 24` 后同一 shell 自带的 node 和 pnpm。
- 不执行 `nvm install`。
- 不强制修改仓库 Node/pnpm/version 配置。
- 如果 node 存在但版本不满足仓库要求，不擅自切换或改版本文件；记录并请求环境处理。

本任务原则上不需要新增第三方依赖。若依赖缺失，先使用现有 lockfile：

```bash
pnpm install
```

如果依赖下载失败，再在同一 shell 使用用户指定代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

报告必须说明：

- 是否执行安装。
- 是否使用代理。
- `pnpm-lock.yaml` 是否变化。
- 若变化，原因是什么。

## 15. 明确不做

- 不修改动画编辑器。
- 不修改 VNI 导出 schema/version。
- 不修改 Bamboo ZIP。
- 不修改 Cocos runtime 或 standalone。
- 不在 app/viewer 中实现 cyclic math。
- 不在 Viewer 提供可编辑 stop/target 字段或默认硬编码停止点。
- 不用直接 seek 原末帧掩盖 continuous phase 与 authored stop 不一致。
- 不通过缩小 Pixi logical viewport、隐藏配置能力或依赖整页滚动伪装预览区扩大。
- 不为任意动画自动猜测 continuous behavior。
- 不宣称普通非无缝关键帧 clip 可以无限延长。
- 不支持 arbitrary live `PIXI.Container` 直接进入 8-slice 3D warp。
- 不增加隐藏 renderer/canvas/RenderTexture bridge。
- 不让 VNIPlayer 拥有 Pixi Application。
- 不新增第 14 个 carrier。
- 不在慢速阶段生成或插入新的物理节点。
- 不静默选择默认 target、默认 texture 或默认 phase。
- 不用 wall-clock timer 判断动画完成。
- 不改变现有 win-amount/popup segmented 行为。
- 不把真实服务器请求写进 vnicore。
- 不因测试方便放宽错误或资源生命周期。

## 16. 完成定义

只有同时满足以下条件才能声明任务完成：

1. 宿主可以仅通过 public API 手工组合 intro、任意时长等待和 ending。
2. 主时间轴 hold 时，指定 cyclic animation 能持续推进。
3. idle 持续 4.5 秒或任意更长时间不会拉回。
4. 13 个 carrier identity 始终固定，不因等待时间或内容更新改变。
5. 可为 carrier 绑定不同 project/host texture。
6. 新服务器结果只在不可见 carrier 提交。
7. selection 未提交时 resolve 显式失败。
8. resolve 从真实当前相位开始，并精确停到 selected carrier。
9. Bamboo 普通末尾光效仍按原时间轴触发。
10. legacy full-demo、range、segmented、particle draining 和现有 consumer 回归通过。
11. Pixi container/sprite 稳定，slice view 生命周期有界。
12. source texture 所有权正确。
13. Viewer 可以配置慢速持续时间并一键完成 authored 三段预览，不要求确认、结束循环或停止点输入。
14. 慢速持续时间为 `0`、`1.5`、`4.5`、`10` 时，Viewer 最终均停在原 full-demo authored carrier。
15. Viewer 使用四个可访问 Tab 分组配置，Tab 切换不中断播放，控制区有界且预览空间确实扩大。
16. Viewer 的重复播放、普通 transport、ZIP/profile 切换及卸载清理合同均有自动化测试。
17. 文档和 typechecked example 完成。
18. `agents.md` 已按实际长期边界更新或报告说明无需更新。
19. 所有规定验证通过，或未通过项在报告中明确列出且任务不得虚报完成。
20. 已生成符合命名要求的中文任务报告。

## 17. 任务报告要求

任务报告必须包含：

- 实际 UTC 生成时间。
- 实际基线 commit 和初始 worktree 状态。
- 实际修改文件。
- 最终 public API。
- manual transport 状态与取消合同。
- cyclic-selection core 数学说明。
- card carousel adapter 说明。
- 内容 binding、safe commit 和 ownership 合同。
- Bamboo ZIP hash 与实际验收结果。
- Viewer 自动预览的 capability、descriptor、调用顺序和不同慢速时长的 authored stop 证据。
- Viewer Tab 的 DOM/键盘测试结果，以及 desktop/窄屏改造前后 stage/control 尺寸或截图证据。
- legacy parity 证据。
- 性能/对象 identity/texture view 释放证据。
- 所有执行过的命令及结果。
- Node/pnpm 实际版本。
- 是否安装依赖、是否使用代理、lockfile 是否变化。
- `agents.md` 是否更新及原因。
- 未完成项、风险和后续建议。
