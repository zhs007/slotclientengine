# @slotclientengine/anieditorv5runtime-cc

V5G 动画导出的 Cocos Creator 3.8.6 runtime 包。

本包不是完整 Cocos Creator 项目，也不能替代编辑器创建项目。本轮没有新增 `apps/anieditorv5viewer-cc`，原因是 Cocos Creator 项目的场景、资源导入、`.meta`、Library 缓存、构建目标和 `cc` 模块解析都依赖编辑器。请先用 Cocos Creator 3.8.6 创建或打开真实项目，再导入本 runtime。

## 支持范围

当前支持：

- V5G `V5G_0.x` 和 VNI `VNI_0.x`
- `editor.name === "victory_editor_v5_g"` 或 `"VNI"`
- `engineTarget.name === "cocos_creator"`
- `engineTarget.version === "3.8.6"`
- `stage.coordinate === "center"`
- `fileWidth`、`fileHeight`、`fileScale` 压缩资源 metadata
- `project.layerGroups + layer.groupId`：runtime 按 `project.layers` 中连续的 group run 决定渲染顺序，不使用 `layerGroups.order` 重排画面
- `image` 图层
- 中心坐标：Cocos 节点位置直接使用 `transform.x/y`，不做 Pixi 的左上角坐标转换
- 负 `scaleX/scaleY` 镜像
- `opacity`、`visible`、`rotation`、锚点
- 已知 V5G blend mode：`normal`、`add`、`screen`、`multiply`、`lighten` 会被解析、接受并写入 Cocos Sprite / material pass blend state
- `scale_up`、`scale_down`、`fade`、`rotate`、`move`
- `slide_in`、`slide_out`、`bounce_in`、`pulse`、`float`、`swing`
- `scale_in`、`scale_out`、`pop`、`shake`、`blink`
- `idle`：作为 timeline coverage marker，不改变 transform 或 opacity
- `safe_glow`：使用当前图层同一张 `SpriteFrame` 创建副本，继承图层 `blendMode`，通过缩放和透明度呼吸模拟高亮，不需要 shader、Effect、滤镜或模糊
- `particle_wall`、`particle_combo`、`squash_stretch`
- 图层动画 `particles`、`particle_twinkle`、`particle_wall`、`particle_combo`：复用当前图层的 `SpriteFrame` 创建粒子 Sprite；真实粒子节点挂在对应图层后面的 `<layer name> Particles` 容器下，全局 `V5G Particles` 节点只保留为空占位
- 粒子参数仍按 VNI/Pixi 导出语义解释：`direction: 270` 表示向上，`gravity` 正数表示向下；Cocos 渲染时会把粒子 Y offset 转成 Cocos UI 坐标系，避免上下方向反转
- `particle_combo.params.sourceOpacity` 只影响源图像显示，不会把同层粒子透明度一起清零；粒子透明度使用图层原始 `opacity`
- `safe_glow.params.keepOriginal=false` 只隐藏源图像节点；safe glow 副本仍会在 `<layer name> Safe Glow` 容器中渲染
- 粒子动画在 `progress <= 0` 时不发射粒子；接近 0 缩放的入场首帧会保持隐藏，避免首帧漏图
- 由宿主 Cocos Component 在 `update(deltaTime)` 中显式驱动播放

明确不支持：

- `text` 图层
- 顶层 `project.particles`
- 非空 `keyframes`
- `group` 图层
- 嵌套 `parentId`
- Cocos deterministic render effect：enabled `shatter` / `glow` 会在 `validateCocosV5GProject(...)` / `init()` 阶段显式失败；通用 `assertV5GProject(...)` 和 `validateV5GProject(...)` 仍会解析并校验其导出参数，便于诊断导出合同
- 未知资源、未知动画、未知 easing、未知 blend mode 的静默兜底

遇到未支持能力会直接抛错。runtime 不创建 missing placeholder，不自动猜测资源路径。未知 V5G blend mode 仍会在通用校验失败；已知 blend mode 如果无法写入 Cocos Sprite blend factor 或 material pass blend state，会在 `init()` / `applyBlendMode(...)` 阶段显式抛错，不会静默退回 normal。

## Layer group slot

runtime 初始化后会创建 group-aware tree：

```text
V5G Stage
  V5G Content
    V5G Group <lower group id>
      <layer image node>
      <layer safe glow container>
      <layer particles node>
    V5G Slot <lower group id> -> <upper group id>
      <mounted external nodes>
    V5G Group <upper group id>
      <layer image node>
      <layer safe glow container>
      <layer particles node>
  V5G Particles
```

`V5G Particles` 仍保留为空占位；真实 layer particle 节点挂在对应 group 内的 `<layer name> Particles` 容器。`safe_glow` 副本节点挂在同一图层的 `<layer name> Safe Glow` 容器中，位于源图像节点之后、粒子容器之前。group container 和 slot container 都使用 stage center 坐标体系，外部 `Node` 挂接时不会被 runtime 重置 transform。

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

## 单文件复制导入

推荐 Cocos Creator 项目优先使用单文件 runtime，而不是直接依赖 pnpm workspace package。Cocos Creator 对 pnpm symlink、package `exports`、monorepo 构建产物和源码内 `.js` 后缀相对 import 的处理可能与 Node/Vite 不一致；单文件复制可以把运行时边界收敛到一个只依赖内置 `"cc"` 模块的 TypeScript 文件。

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
docs/anieditor5/export2/runtime_50/project.json
docs/anieditor5/export2/runtime_50/assets/*
docs/anieditor5/export/project.json
docs/anieditor5/export/bigwin.json
docs/anieditor5/export/megawin.json
docs/anieditor5/export/superwin.json
docs/anieditor5/export/lock_01.json
docs/anieditor5/export/roundreel.json
docs/anieditor5/export/assets/*
```

发布环境推荐使用 `docs/anieditor5/export2/runtime_50/project.json` 和同目录 `assets/*` 下的压缩 SpriteFrame。`edit_full` 是编辑用 100% 资源，不要把它当作发布资源路径，也不要因为 `asset.path` 文件名相同而把 `edit_full` 原图 SpriteFrame 绑定给 `runtime_50` project。

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

runtime 不会 fallback 到 `asset.id`、`asset.originalName` 或其它猜测规则。`atlas.getSpriteFrame(...)` 返回 `null` 会直接抛错，错误包含 asset id、asset path 和实际 atlas key；不会创建 placeholder、跳过图层或吞掉 atlas 错误。atlas frame 可能被合图工具 trim/crop，runtime 不用 atlas `SpriteFrame` 的可读尺寸校验 JSON 尺寸；Cocos 节点内容尺寸始终使用 JSON `asset.width/height`，实际播放以 JSON 逻辑尺寸为准。

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

runtime 不再创建 `V5G Background`，也不使用 Cocos `Graphics` 绘制 `project.stage.backgroundColor`。stage 背景属于编辑器预览或宿主场景职责；宿主可以在 Canvas、父节点、UI 层或业务场景中自行放置背景。runtime stage 下只创建 `V5G Content` 和 `V5G Particles`，其中 `V5G Particles` 当前保留为空占位，真实粒子节点挂在对应图层后面的 `<layer name> Particles` 容器下。

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

宿主不需要为 `safe_glow` 或其它当前支持能力绑定额外 Material / Effect；`safe_glow` 使用同图 `SpriteFrame` 副本、继承图层 `blendMode`、scale 和 opacity。若运行环境里的 Sprite 不暴露 blend factor、material instance、pass blend target 或 pass hash 刷新能力，runtime 会直接抛出包含节点名和 blend mode 的错误；这类错误需要回到 Cocos 版本/API 兼容性排查，不能用静默兜底掩盖。

## `cc` 类型 shim

`types/cc-3.8.6-shim.d.ts` 只用于 monorepo 内 `tsc` 和 Vitest 编译，内容是最小类型补丁，不代表完整 Cocos API。真实 Cocos 项目以 Cocos Creator 3.8.6 编辑器提供的 `cc` 类型为准。

Vitest 单元测试使用 fake driver 测 `V5GCocosPlayer`，不直接执行真实 `cocos-node-driver.ts`。
