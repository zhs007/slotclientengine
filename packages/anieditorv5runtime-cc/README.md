# @slotclientengine/anieditorv5runtime-cc

V5G 动画导出的 Cocos Creator 3.8.6 runtime 包。

本包不是完整 Cocos Creator 项目，也不能替代编辑器创建项目。本轮没有新增 `apps/anieditorv5viewer-cc`，原因是 Cocos Creator 项目的场景、资源导入、`.meta`、Library 缓存、构建目标和 `cc` 模块解析都依赖编辑器。请先用 Cocos Creator 3.8.6 创建或打开真实项目，再导入本 runtime。

## 支持范围

当前支持：

- V5G `V5G_0.x` 和 VNI `VNI_0.x`，已同步编辑器当前 `VNI_0.095` runtime 合同
- `editor.name === "victory_editor_v5_g"` 或 `"VNI"`
- `engineTarget.name === "cocos_creator"`
- `engineTarget.version === "3.8.6"`
- `stage.coordinate === "center"`
- `fileWidth`、`fileHeight`、`fileScale` 压缩资源 metadata
- `project.layerGroups + layer.groupId`：runtime 按 `project.layers` 中连续的 group run 决定渲染顺序，不使用 `layerGroups.order` 重排画面
- `image` 图层
- `sequence` 图层：按 `frameAssetIds + cycleDuration + loop` 切换已解析的 SpriteFrame，不在播放中加载资源或重建图层节点
- `text` 图层：runtime 创建 Cocos `Label` 作为原始文本节点；宿主可通过 public API 绑定自有 `Node`、文本节点或 SpriteFrame/项目资产到文本层
- 中心坐标：Cocos 节点位置直接使用 `transform.x/y`，不做 Pixi 的左上角坐标转换
- 负 `scaleX/scaleY` 镜像
- `opacity`、`visible`、`rotation`、锚点
- 已知 V5G blend mode：`normal`、`add`、`screen`、`multiply`、`lighten` 会被解析、接受并写入 Cocos Sprite / material pass blend state
- basic animation 六轨：`opacity/positionX/positionY/scaleX/scaleY/rotation`
- `scale_up`、`scale_down`、`fade`、新/legacy `rotate`、`move`、`multi_move`
- `slide_in`、`slide_out`、`bounce_in`、`pulse`、`float`、`swing`
- `scale_in`、`scale_out`、`pop`、`bounce_jump`、`shake`、`blink`
- `idle`：作为 timeline coverage marker，不改变 transform 或 opacity
- `safe_glow`：使用当前图层同一张 `SpriteFrame` 创建副本，继承图层 `blendMode`，通过缩放和透明度呼吸模拟高亮，不需要 shader、Effect、滤镜或模糊
- `chaser_light`：使用当前图层同一张 `SpriteFrame` 采样走马灯节点；灯位固定在轨迹采样点上，动画只推进亮灯/暗灯窗口；圆形轨迹的 `spacing` 按弧长换算角度；`keepOriginal=false` 会隐藏源图像，走马灯副本仍在 `<layer name> Chaser Light` 容器中渲染
- `particle_wall`、`particle_combo`、`particle_stream`、`squash_stretch`
- VNI 0.070 十类确定性效果：`gather_particles`、`smoke_mist`、`energy_ring`、`slash_light`、`flame_flicker`、`wave_band`、`wave_distort`、`speed_lines`、`drift_fall`、`path_particles`
- `card_carousel_3d`：初始化时按 card/slice 上限预建节点与切片 SpriteFrame，逐帧只更新 transform、opacity、tint 和 sibling depth；切片与节点会复用并在 `destroy()` 时释放
- pressure rotate 使用独立 `visualRotation` 采样；Cocos 侧以稳定的 layer outer/content 双层节点分别承载基础 transform 与内容视觉旋转，effect sibling 不继承 pressure 视觉旋转
- 图层动画 `particles`、`particle_twinkle`、`particle_wall`、`particle_combo`、`particle_stream`：复用当前图层的 `SpriteFrame` 创建粒子 Sprite；真实粒子节点挂在对应图层后面的 `<layer name> Particles` 容器下，全局 `V5G Particles` 节点只保留为空占位
- 粒子参数仍按 VNI/Pixi 导出语义解释：`direction: 270` 表示向上，`gravity` 正数表示向下；Cocos 渲染时会把粒子 Y offset 转成 Cocos UI 坐标系，避免上下方向反转
- `particle_combo.params.sourceOpacity` 只影响源图像显示，不会把同层粒子透明度一起清零；粒子透明度使用图层原始 `opacity`
- `safe_glow.params.keepOriginal=false` 只隐藏源图像节点；safe glow 副本仍会在 `<layer name> Safe Glow` 容器中渲染
- `mask.mode === "alpha"` 且 `mask.compositeMode === "legacy_alpha"`：通过 Cocos `Mask.Type.IMAGE_STENCIL` adapter 创建 alpha mask；`showSourceLayer=false` 会隐藏 source layer
- 粒子、safe glow、chaser light 和确定性效果使用闭区间时间采样；粒子在动画精确起点即可发射，segmented/live 播放使用独立累计 elapsed 保持移动 emitter 和循环段连续
- 由宿主 Cocos Component 在 `update(deltaTime)` 中显式驱动播放

明确不支持：

- 顶层 `project.particles`
- 非空 `keyframes`
- `group` 图层
- 嵌套 `parentId`
- `mask.compositeMode === "precompose_light_alpha"`：Cocos standalone/runtime 当前没有 vnicore 的 precompose alpha 缓存链路，会在 `validateCocosV5GProject(...)` / `init()` 阶段显式失败
- Cocos deterministic render effect：enabled `shatter` / `glow` 会在 `validateCocosV5GProject(...)` / `init()` 阶段显式失败；通用 `assertV5GProject(...)` 和 `validateV5GProject(...)` 仍会解析并校验其导出参数，便于诊断导出合同
- runtime 不解析 bundle manifest、不选择 profile，也不提供 Pixi/DOM/URL loader
- 未知资源、未知动画、未知 easing、未知 blend mode 的静默兜底

遇到未支持能力会直接抛错。runtime 不创建 missing placeholder，不自动猜测资源路径。未知 V5G blend mode 仍会在通用校验失败；已知 blend mode 如果无法写入 Cocos Sprite blend factor 或 material pass blend state，会在 `init()` / `applyBlendMode(...)` 阶段显式抛错，不会静默退回 normal。

## Manual cyclic playback

`card_carousel_3d` 现在支持由宿主控制的 staged transport：普通时间轴播放 intro，主时间轴停在 authored hold point，carousel 按真实 `player.update(deltaTime)` 持续推进未折返的相位，服务器结果准备完成后安全替换隐藏 carrier，再从当前真实相位进入 fast / stop / hold 并动态对齐选中 carrier。该能力属于 Cocos runtime，不依赖 Pixi 或 `@slotclientengine/vnicore`。

真实 Cocos-compatible Bamboo4 基线是：

```text
bundle/schema: VNI_0.103
project: runtime_100/bamboo4.json
maskCompositeMode: legacy_alpha
layerId: layer_sequence_mrupvsr0_7
animationId: anim_module_mrupw05e_8
cardCount: 13
authored targetIndex: 0
intro: 0..1.5s
continuous hold point: 1.5s
authored idle preview: 1.5s
ending: 3..9.6s
```

完整调用顺序：

```ts
const session = player.createManualPlaybackSession();
const cyclic = session
  .getAnimation({
    layerId: "layer_sequence_mrupvsr0_7",
    animationId: "anim_module_mrupw05e_8",
  })
  .requireCyclicSelection();
const descriptor = cyclic.getAuthoredPreviewDescriptor();

await cyclic.setInitialItems(
  bambooCardNodes.map((node, index) => ({
    key: `bamboo-card-${index < 10 ? "0" : ""}${index}`,
    visual: {
      kind: "node",
      node,
      width: 720,
      height: 720,
      revision: "initial-v1",
    },
  })),
).ready;

await session.playRange({ range: descriptor.introRange }).completed;
const hold = session.holdTimeline({
  at: descriptor.continuousHoldPoint,
});
cyclic.startContinuousPhase({
  phaseId: descriptor.continuousPhaseId,
});

const result = await requestServerResult();
await cyclic.prepareSelection({
  selectedItem: result.selectedItem,
}).committed;

hold.release();
cyclic.startResolvePhase();
await session.playRange({
  range: descriptor.endingRange,
  preserveRuntimeAnimationState: true,
}).completed;
session.destroy();
```

服务器选中初始 13 张中的已有卡时不需要重复提交 visual：

```ts
const result = {
  selectedItem: { key: "bamboo-card-07" },
};
```

服务器返回新卡或同 key 的新 revision 时，必须提交完整 host `Node` 和显式逻辑尺寸：

```ts
const result = {
  selectedItem: {
    key: "bamboo-card-server-result",
    visual: {
      kind: "node" as const,
      node: bambooResultNode,
      width: 720,
      height: 720,
      revision: "result-v1",
    },
  },
};
```

production carrier 不是 Sprite-only contract。`node` 可以是包含 Sprite、Label、嵌套 Node、Spine 或自定义 RenderComponent 的宿主节点根；runtime 不要求 root 带 Sprite，也不会 reparent、停用、修改或销毁宿主节点。`width/height` 必须是 finite positive 的逻辑 art size，runtime 不从首个 Sprite、bounds、文件名或子节点猜测。key、Node identity、尺寸、revision 或捕获能力非法都会显式失败。

默认 Cocos driver 在 initial/replace prepare 边界 clone 完整子树，通过透明 `RenderTexture + Camera + Canvas` 做一次性视觉快照，并把得到的 SpriteFrame 送入与 authored asset 相同的 CardCarousel 切片、曲面、tint、shade 和 depth 路径。捕获不会发生在逐帧热路径；同一 Node + size + revision 使用引用计数缓存。提交失败会回滚，runtime 只销毁自己拥有的 capture、RenderTexture、slice view 和内部节点。

一次性捕获记录的是提交时刻的完整视觉快照，carrier 内嵌 Spine、Label 或自定义组件随后发生的动画不会逐帧同步。需要 carrier 内部动画实时继续播放时，应新增专门的 live-node renderer/mesh contract；本 runtime 不会以逐帧 RenderTexture capture 作为隐式降级。

manual session active 时，`play()`、legacy `playRange()`、`seek()`、`restart()`、`pause()` 和 segmented transport 会显式失败。Cocos runtime 不创建 RAF、Tween、schedule 或 timer；宿主必须继续在 Component `update(deltaTime)` 中调用 `player.update(deltaTime)`。`update(0)` 是合法 no-op，`advanceFor()` 也只累计这些真实 delta。

## Layer group slot

runtime 初始化后会创建 group-aware tree：

```text
V5G Stage
  V5G Content
    V5G Group <lower group id>
      <layer image node>
      <layer text binding container, only for text layers>
      <layer safe glow container>
      <layer chaser light container>
      <layer particles node>
      <layer deterministic effects node, only when used>
      <card carousel node, only when used>
    V5G Slot <lower group id> -> <upper group id>
      <mounted external nodes>
    V5G Group <upper group id>
      <layer image node>
      <layer text binding container, only for text layers>
      <layer safe glow container>
      <layer chaser light container>
      <layer particles node>
  V5G Particles
```

`V5G Particles` 仍保留为空占位；真实 layer particle 节点挂在对应 group 内的 `<layer name> Particles` 容器。`safe_glow` 副本节点挂在同一图层的 `<layer name> Safe Glow` 容器中，`chaser_light` 节点挂在 `<layer name> Chaser Light` 容器中。确定性效果和 card carousel 容器只在图层实际配置对应动画时创建。group container 和 slot container 都使用 stage center 坐标体系，外部 `Node` 挂接时不会被 runtime 重置 transform。

查询合法 slot 并插入宿主节点：

```ts
const [slot] = player.getLayerGroupSlots();
if (slot) {
  const dispose = player.attachNodeBetweenLayerGroups({
    id: "slot-reel",
    afterGroupId: slot.afterGroupId,
    beforeGroupId: slot.beforeGroupId,
    node: reelRoot,
  });
}
```

也可以一次挂接多个节点，数组中先出现的节点会保持在更低的 sibling 顺序：

```ts
player.attachNodeBetweenLayerGroups({
  ids: ["bonus-bg", "bonus-ui"],
  afterGroupId: slot.afterGroupId,
  beforeGroupId: slot.beforeGroupId,
  nodes: [bonusBackground, bonusHud],
});
```

`attachNodeBetweenLayerGroups(...)` 只接受相邻 render group。未知 group、反向 group、非相邻 group、已被其他节点占用的 id、空 id、`id`/`ids` 或 `node`/`nodes` 的歧义组合都会显式失败。插入或重复插入已有父节点的外部节点时，runtime 会先捕获当前 world transform，挂到 slot 后再恢复 world transform，避免父节点坐标系不同导致画面跳动。重复插入同一个节点会移动它到新的插入顺序，并保留第一次插入前的原父节点和 local transform；移除时会从当前父节点摘下，恢复到这个最早的父节点和相对位置。外部节点默认不销毁；传 `destroyOnDetach: true` 时才销毁。

移除可以使用返回的 disposer，也可以用 `player.detachMountedNode(idOrNode)` 移除单个 id 或节点，用 `player.detachMountedNodes([idOrNode, ...])` 一次移除多个指定节点，或无参数调用 `player.clearMountedNodes()` 清空所有已挂接节点。没有 id 的节点仍可通过节点引用、disposer 或 `clearMountedNodes()` 移除。若宿主在 Cocos 发布包生命周期里已经先销毁外部挂接节点，runtime 清理时会跳过失效节点并注销 registry，不再访问失效节点的 `parent` 或 transform。

也可以用 Cocos-native helper 创建 runtime-owned image node：

```ts
player.attachProjectAssetBetweenLayerGroups({
  id: "debug-asset",
  afterGroupId: slot.afterGroupId,
  beforeGroupId: slot.beforeGroupId,
  assetId: "asset_image_mqp31v5g_14",
  x: 0,
  y: 0,
});

player.attachSpriteFrameBetweenLayerGroups({
  id: "debug-frame",
  afterGroupId: slot.afterGroupId,
  beforeGroupId: slot.beforeGroupId,
  spriteFrame,
  width: 320,
  height: 180,
});
```

这两个 helper 创建的节点默认 `destroyOnDetach: true`，并复用 runtime 的 SpriteFrame resolver、逻辑尺寸、anchor、opacity 和 blend mode 规则。runtime 不提供 URL loader，也不会调用 `resources.load()`。

## Text layer binding 和 diagnostics

`text` 图层会先创建一个 Cocos `Label` 节点作为导出文本的原始显示。宿主如果需要使用字体组件、BitmapFont、富文本、动态数字牌或业务 UI 节点，可以通过 public API 挂到对应 text layer 的 binding 容器。binding 容器跟随 text layer 的 transform、opacity 和可见性；默认会隐藏原始 `Label`，dispose 后恢复当前帧的原始文本显示。

```ts
const binding = player.attachTextToTextLayer({
  id: "win-amount",
  layerId: "layer_text_amount",
  text: "$12.34",
});

binding.setText("$56.78");
binding.dispose();
```

宿主也可以挂自己的 Cocos `Node`，或让 runtime 用项目资产 / 外部 SpriteFrame 创建 runtime-owned image node：

```ts
player.attachNodeToTextLayer({
  id: "custom-amount-node",
  layerId: "layer_text_amount",
  node: amountNode,
  hideOriginal: true,
});

player.attachProjectAssetToTextLayer({
  id: "amount-image",
  layerId: "layer_text_amount",
  assetId: "asset_image_amount",
});

player.attachSpriteFrameToTextLayer({
  id: "amount-frame",
  layerId: "layer_text_amount",
  spriteFrame,
  width: 128,
  height: 48,
});
```

这些 API 只接受真实存在的 `text` layer。未知 layer、非 text layer、重复 binding id、空 id 或空节点都会显式失败。runtime 不把 text layer 当私有 Cocos display tree 暴露给宿主直接改；替换文字和业务节点都应走这些 public API。

`getRuntimeDiagnostics()` 可用于宿主调试和自动化验收，除原有 particle/chaser/safe-glow/mask/text/mounted 计数外，还返回 `deterministicEffectSpriteCount`、`deterministicEffectLineCount`、`cardCarouselCardPoolSize`、`cardCarouselSlicePoolSize` 和 `visibleCardCarouselCardCount`。这些计数只描述 runtime 当前管理的节点，不替代业务侧自己的节点统计。

## 单文件复制导入

推荐 Cocos Creator 项目优先使用单文件 runtime，而不是直接依赖 pnpm workspace package。Cocos Creator 对 pnpm symlink、package `exports`、monorepo 构建产物和源码内 `.js` 后缀相对 import 的处理可能与 Node/Vite 不一致；单文件复制可以把运行时边界收敛到一个只依赖内置 `"cc"` 模块的 TypeScript 文件。

单文件由模块化源码生成。修改源码后必须执行 `pnpm --dir packages/anieditorv5runtime-cc standalone:build`，再执行 `standalone:check`、`typecheck:standalone` 和 standalone parity tests；不要手改生成文件。

复制路径示例：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
-> CocosProject/assets/scripts/vendor/anieditorv5runtime-cc.ts
```

宿主业务 Component 通过相对路径导入：

```ts
import {
  assertV5GProject,
  createV5GCocosPlayer,
  validateCocosV5GProject,
  type V5GCocosAssetSource,
  type V5GCocosPlaybackState,
  type V5GCocosPlayer,
} from "./vendor/anieditorv5runtime-cc";
```

样例数据来源：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/bigwin.json
docs/anieditor5/export/megawin.json
docs/anieditor5/export/superwin.json
docs/anieditor5/export/lock_01.json
docs/anieditor5/export/roundreel.json
docs/anieditor5/export/assets/*
```

发布环境推荐使用带 `exportProfile.purpose = "runtime"` 的单项目 JSON，例如 `docs/anieditor5/export/bigwin.json`，并绑定 `docs/anieditor5/export/assets/*` 下对应的压缩 SpriteFrame。不要因为历史编辑包里曾存在同名 `asset.path`，就把 100% 编辑原图 SpriteFrame 绑定给 `runtime_50` project。

runtime 只接收已经得到的 `V5GProjectConfig` 对象，不读取、导入、加载或解析 `project.json`，不解析 bundle manifest，也不负责选择 profile。JSON 绑定、`JsonAsset` 读取、资源导入、Canvas/root 缩放、场景背景和屏幕适配都属于宿主 Cocos 项目职责。runtime 只创建 `project.stage.width x project.stage.height` 的中心坐标动画内容。

默认资源绑定方式是 `SpriteAtlas`。宿主把所有动画用到的 SpriteFrame 放在同一个 atlas 中，并保证 atlas 内的 SpriteFrame 名字严格等于 `filenameStem(asset.path)`。`filenameStem(asset.path)` 指 `asset.path` 去掉目录和扩展名后的文件名：

```ts
import { SpriteAtlas } from "cc";

const assets: V5GCocosAssetSource = {
  atlas,
};

const player = createV5GCocosPlayer({
  root,
  project,
  assets,
  loop: true,
});
```

例如 `asset.path === "assets/respin_asset_image_mqkv73wu_e.png"` 时，runtime 只会查询：

```text
atlas.getSpriteFrame("respin_asset_image_mqkv73wu_e")
```

runtime 不会 fallback 到 `asset.id`、`asset.originalName` 或其它猜测规则。`atlas.getSpriteFrame(...)` 返回 `null` 会直接抛错，错误包含 asset id、asset path 和实际 atlas key；不会创建 placeholder、跳过图层或吞掉 atlas 错误。atlas frame 可能被合图工具 trim/crop，普通 image/sequence 播放不用 atlas `SpriteFrame` 的可读尺寸校验 JSON 尺寸；Cocos 节点内容尺寸始终使用 JSON `asset.width/height`，实际播放以 JSON 逻辑尺寸为准。`wave_distort` 和 `card_carousel_3d` 必须切片，因此 SpriteFrame 必须公开 `texture/rect/originalSize` 且不能是 rotated atlas frame；不满足时会显式失败，不会退回整图或错误 UV。

旧 resolver 入口如果能从 `SpriteFrame` 读取原始尺寸，runtime 会校验它与 JSON `asset.fileWidth/fileHeight` 一致。没有压缩字段的旧导出按 `asset.width/height` 校验。`fileScale` 只用于 metadata 校验和诊断，不会额外参与节点缩放。

旧 resolver 仍作为高级兼容入口保留，适合已有宿主自己维护 `asset.id -> SpriteFrame` 映射的场景：

```ts
const assets: V5GCocosAssetSource = {
  getSpriteFrame(_assetPath, assetId) {
    return framesByAssetId.get(assetId) ?? null;
  },
};
```

resolver 返回 `null` 时仍会直接抛错，错误包含 asset id 和 path。

可复制 Component 示例见：

```text
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

该示例 Component 不是 runtime 的必需入口；它展示了宿主侧如何用已经准备好的 project 对象、绑定 `SpriteAtlas`、在 `update(deltaTime)` 中调用 `player.update(deltaTime)`，并在 `onDestroy()` 中调用 `player.destroy()`。示例不会调用 `resources.load()`，也不会读取 bundle manifest 或自动选择 `edit_full/runtime_50`。

本仓库当前没有执行真实 Cocos Creator 3.8.6 编辑器导入验收；已完成的是 monorepo 内 TypeScript、Vitest fake `cc`、standalone 边界扫描和构建验收。真实编辑器内的 `.meta`、场景绑定、资源导入结果仍需在宿主 Cocos 项目中人工确认。

## 播放控制和事件

`play()`、`pause()`、`restart()`、`seek(time)`、`setLoop(loop)` 和 `update(deltaTime)` 继续可用。`pause(); play();` 会恢复当前未完成的 range；`restart()` 会清空 range 并回到从 0 秒开始的全时长播放语义。

`play({ mode: "segmented", loopStart, loopEnd, keepParticlesAlive })` 可用于“先播放到 loopStart，再在 loopStart..loopEnd 内循环，最后由宿主请求结束并播放到结尾”的胜利动画流程。`keepParticlesAlive` 默认 `true`，循环段会按真实经过时间推进 live 粒子；设为 `false` 时只按当前时间采样确定性粒子。

在固定点 hold：

```ts
player.play({
  mode: "segmented",
  loopStart: { unit: "time", at: 2.4 },
  loopEnd: { unit: "time", at: 2.4 },
});
```

在一段区间循环，之后由宿主结束：

```ts
player.play({
  mode: "segmented",
  loopStart: { unit: "frame", at: 120, fps: 60 },
  loopEnd: { unit: "frame", at: 180, fps: 60 },
  keepParticlesAlive: true,
});

// 用户点击继续、奖励结算完成或外部流程允许收尾时调用。
player.requestSegmentedPlaybackEnd();
```

如果宿主希望 segmented ending 完成后直接清空粒子并跳过 drain，可传入：

```ts
player.requestSegmentedPlaybackEnd({ forceStopParticles: true });
```

这个参数不会在调用瞬间清掉当前可见粒子；runtime 仍会继续播放 ending 段，到 `project.stage.duration` 后才清空所有 runtime-managed 粒子节点、跳过 particle drain，并同步触发 `onPlaybackComplete(...)`。不传参数或传 `{ forceStopParticles: false }` 时，仍保持原有 drain 行为。

当前 runtime 没有 public `stop()`；不要把 `pause()`、`restart()` 或 `destroy()` 当成普通停止播放接口。`pause()` 仍是可恢复暂停，`restart()` 会回到 0 秒并清空播放上下文，`destroy()` 是 Component 生命周期销毁。

需要立即彻底清空当前 player 管理的所有粒子时，调用：

```ts
player.forceStopAllParticles();
```

默认情况下，`forceStopAllParticles()` 会清空粒子 runtime 状态和 `<layer name> Particles` 容器内的粒子节点，并阻止同一段播放生命周期在后续 `update(deltaTime)` 中重新发射粒子；新的 `play(...)`、`playRange(...)`、`seek(...)`、`restart()` 或重新 `init()` 会解除这个抑制。高级调试场景可传 `{ suppressUntilNextPlayback: false }`，表示只清当前帧粒子，后续 `update(deltaTime)` 仍可按当前播放时间重新采样粒子。

`getPlaybackState()` 会返回当前 `mode`、`phase`、`currentTime`、`loopIndex`、`liveParticleCount` 和粒子排空状态。segmented 或非循环播放到结尾后，如果仍有 live 粒子，会进入 `particle-draining`，继续由 `update(deltaTime)` 推进；排空完成后才触发 `onPlaybackComplete(...)`。

播放 0 到 4 秒，结束后停止：

```ts
player.playRange({
  range: { unit: "time", start: 0, end: 4 },
  loop: false,
});
```

播放第 30 到第 60 帧并循环：

```ts
player.playRange({
  range: { unit: "frame", start: 30, end: 60, fps: 60 },
  loop: true,
});
```

`playRange(...)` 的 `range.end` 可以省略，也可以显式传 `undefined` 或 `-1`，表示播放到 `project.stage.duration`：

```ts
player.playRange({
  range: { unit: "time", start: 1.25 },
  loop: false,
});

player.playRange({
  range: { unit: "frame", start: 30, end: -1, fps: 60 },
  loop: false,
});
```

帧 API 必须显式传入 `fps`，runtime 不默认 60fps，也不会从 Cocos 的 `update(deltaTime)` 频率猜测。

注册时间点 marker：

```ts
const disposeMarker = player.addPlaybackEvent({
  id: "intro-pop",
  at: { unit: "time", at: 1.25 },
  once: true,
  listener(event) {
    // event.time 是 marker 时间；event.currentTime 是本次 update 推进到的时间。
  },
});
```

注册帧 marker：

```ts
player.addPlaybackEvent({
  id: "frame-45",
  at: { unit: "frame", at: 45, fps: 60 },
  listener(event) {
    // loopIndex 从 0 开始，循环 range 每跨过一圈递增。
  },
});
```

监听当前非循环播放任务完成：

```ts
const disposeComplete = player.onPlaybackComplete((event) => {
  // event.startTime / event.endTime 对应本次 playRange 或全时长播放边界。
});
```

marker 和 complete 都由宿主继续调用 `player.update(deltaTime)` 同步驱动，不使用 `setTimeout`、Promise、Cocos tween 或异步计时器。手动 `seek(...)`、`init()` 和 `restart()` 不会触发 marker；单次大 `deltaTime` 跨过多个 marker 时，会按时间从小到大同步触发。callback 抛错不会被 runtime 吞掉，会从当前 public method 继续抛出。

marker 若正好落在 `play()` / `playRange()` / segmented 播放的起点，会在启动播放的同步调用内立即触发；循环 range 回到 `range.start` 时，也会按新的 `loopIndex` 触发起点 marker。marker 表示时间轴跨过某个点；若业务要等待某段非循环 `playRange` 完整结束，应使用 `onPlaybackComplete(...)`，因为它会等到终点后的粒子排空完成。完整等待写法：

```ts
const disposeComplete = player.onPlaybackComplete(() => {
  disposeComplete();
  // resolve Promise 或进入下一段播放。
});
player.playRange({
  range: { unit: "time", start: startTime, end: endTime },
  loop: false,
});
```

如果业务确实需要“时间轴到达 endTime 的瞬间”而不是“播放任务完整结束”，可以在 `playRange(...)` 前先注册 `addPlaybackEvent(...)`；runtime 会在 marker 与终点同一帧时先触发 marker，再进入 complete 流程。

`destroy()` 会销毁 runtime 创建的节点、停止播放、清空当前 range、清空所有 marker、complete listener 和 mounted node registry，避免宿主 Component 销毁后遗留 callback 或业务节点引用；已被宿主提前销毁的外部 mounted node 会被安全跳过。

## Package 导入

如果某个环境确认可以正确解析 pnpm workspace 和 package `exports`，仍可从 package 入口导入模块化版本：

```ts
import {
  createV5GCocosPlayer,
  type V5GCocosAssetResolver,
} from "@slotclientengine/anieditorv5runtime-cc/cocos";
```

这条路径面向能解析 package 的工程化环境；面向普通 Cocos Creator 项目交付时，优先复制 `standalone/anieditorv5runtime-cc.ts`。

## 背景和 blend mode

runtime 不再创建 `V5G Background`，也不使用 Cocos `Graphics` 绘制 `project.stage.backgroundColor`。stage 背景属于编辑器预览或宿主场景职责；宿主可以在 Canvas、父节点、UI 层或业务场景中自行放置背景。runtime stage 下只创建 `V5G Content` 和 `V5G Particles`，其中 `V5G Particles` 当前保留为空占位，真实粒子节点挂在对应图层后面的 `<layer name> Particles` 容器下；safe glow、chaser light 和 text binding 分别挂在对应图层的专用容器下。

runtime 当前使用 Cocos Creator 3.8.6 原生 `Sprite.srcBlendFactor` / `dstBlendFactor` 和 material pass `blendState` 应用 V5G blend mode，不需要额外 shader / Effect 资产：

- `normal`：`ADD` + `SRC_ALPHA / ONE_MINUS_SRC_ALPHA`
- `add`：`ADD` + `SRC_ALPHA / ONE`
- `screen`：`ADD` + `SRC_ALPHA / ONE_MINUS_SRC_COLOR`
- `multiply`：`ADD` + `DST_COLOR / ONE_MINUS_SRC_ALPHA`
- `lighten`：`MAX` + `SRC_ALPHA / ONE`

`normal` 保持 Cocos Sprite 默认状态，不要求宿主 Sprite 暴露 blend factor API。非 `normal` 模式会写入 Cocos Creator 3.8.6 官方 enum 数值，并兼容 public `srcBlendFactor/dstBlendFactor` 或运行时可见的 `_srcBlendFactor/_dstBlendFactor`；实现不会从 `"cc"` 命名导入 `BlendFactor` / `BlendOp`，以兼容不重新导出这两个名字的 Cocos 项目。

standalone 交付仍只需要复制：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

宿主不需要为 `safe_glow`、`chaser_light` 或其它当前支持能力绑定额外 Material / Effect；`safe_glow` 和 `chaser_light` 使用同图 `SpriteFrame` 副本，`chaser_light` 的亮灯窗口会临时使用 `add` blend mode，暗灯继续使用图层 `blendMode`、原始 scale 和 `dimAlpha`。standalone 单文件与模块化包使用同一套固定灯位采样语义，普通 Cocos 项目优先复制 standalone 文件接入。若运行环境里的 Sprite 不暴露 blend factor、material instance、pass blend target 或 pass hash 刷新能力，runtime 会直接抛出包含节点名和 blend mode 的错误；这类错误需要回到 Cocos 版本/API 兼容性排查，不能用静默兜底掩盖。

## `cc` 类型 shim

`types/cc-3.8.6-shim.d.ts` 只用于 monorepo 内 `tsc` 和 Vitest 编译，内容是最小类型补丁，不代表完整 Cocos API。真实 Cocos 项目以 Cocos Creator 3.8.6 编辑器提供的 `cc` 类型为准。

Vitest 单元测试使用 fake driver 测 `V5GCocosPlayer`，不直接执行真实 `cocos-node-driver.ts`。
