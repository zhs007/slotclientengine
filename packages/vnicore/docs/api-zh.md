# vnicore API

## import surface

- `@slotclientengine/vnicore`: re-export `./core` 和 `./pixi`。
- `@slotclientengine/vnicore/core`: 类型、校验、采样、资源 manifest 纯函数。
- `@slotclientengine/vnicore/pixi`: Pixi.js v8 player 和 Pixi helper。

## 主要类型

- `VNIProjectConfig`: VNI/V5G export JSON 的项目结构。
- `VNIBundleManifest`: VNI bundle manifest 结构；profile/project 一致性通过 schema 与测试中的 manifest 数据校验。
- `AssetUrlManifest`: `Readonly<Record<string, string>>`，key 是 `asset.path`。
- `VNIPlayerOptions`: `VNIPlayer` 构造参数。
- `VNIPlaybackRange`: time 或 frame range。
- `VNIPlayOptions`: `play()` 的可选参数，支持普通 timeline、range 和 segmented 三段式播放。
- `VNISegmentedPlaybackOptions`: `loopStart` / `loopEnd` / `keepParticlesAlive` 高级播放参数。
- `VNIPlaybackState`: 当前 mode、phase、主时间轴、粒子排空和 live 粒子数量。
- `VNIPlaybackEventOptions`: marker 注册参数。
- `VNIPlaybackCompleteContext`: range、全时长非循环或 segmented 视觉完全结束事件。
- `VNILayerGroupConfig`: `project.layerGroups[]` 的 group 元数据。它不是 `type: "group"` layer。
- `VNILayerGroupSlot`: 两个相邻 render group 之间的可挂接 slot。
- `VNIAttachNodeBetweenLayerGroupsOptions` / `VNIAttachImageBetweenLayerGroupsOptions` / `VNIAttachExternalImageBetweenLayerGroupsOptions`: 组间挂接 Pixi node、project asset image 或显式外部图片 URL 的参数。
- `VNIAttachNodeToTextLayerOptions` / `VNIAttachTextToTextLayerOptions` / `VNIAttachImageToTextLayerOptions`: 文字层 placeholder 绑定自定义 Pixi 节点、动态文本或图片的参数。
- `VNITextLayerTextBinding`: 动态文字绑定句柄，提供 `dispose()` 和 `setText(text)`。

`V5G*` 类型仍作为 legacy schema alias 导出；新代码使用 `VNI*`。

`VNIPlayerOptions` 还支持嵌入相关选项：

- `parent: PIXI.Container`：必填，由宿主提供的 Pixi 父节点。`VNIPlayer` 不创建 `PIXI.Application`、renderer 或 canvas。
- `diagnosticsElement?: HTMLElement`：可选，写入 `data-vni-*` / `data-v5g-*` diagnostics 的宿主 DOM 节点。
- `viewport?: { width: number; height: number }`：可选，用于 standalone viewer 这类需要 player 适配宿主可视区域的场景。
- `requestRender?: () => void`：可选，宿主手动渲染时由 player 在画面变化后请求外部 renderer render。
- `autoTick?: boolean`：默认 `true`，由 player 自己使用 RAF 推进；设为 `false` 时宿主必须显式调用 `update(deltaSeconds)`。
- `fitPadding?: number`：默认保持既有响应式 padding；设为 `0` 时 VNI stage 坐标不再额外留边，适合宿主用自己的 Pixi viewport 或 mask 做精确裁切。

## core 函数

- `assertVNIProject(value)`: 结构断言并返回 `VNIProjectConfig`。
- `validateVNIProject(project)`: 验证 schema、stage、asset、layer、animation 和 export profile 契约。
- `assertVNIBundleManifest(value)` / `validateVNIBundleManifest(manifest)`: bundle manifest 断言和验证。
- `validateManifestProjectProfile(entry, project)`: 验证 manifest entry 与 project `exportProfile` 对齐。
- `parseColorHex(value)`: 解析 `#RRGGBB`。
- `sampleProjectAtTime(project, time)`: 采样整个 project。
- `sampleLayerAtTime(layer, time)`: 采样单 layer。
- `sampleLayerAnimationsAtTime(base, animations, time)`: 采样 animation 栈。
- `sampleParticleSpritesForLayer(layer, sampledLayer, textureSize, time)`: 确定性采样粒子 sprite。
- `sampleChaserLightSpritesForLayer(layer, sampledLayer, textureSize, time)`: 确定性采样 `chaser_light` sprite。
- `sampleRenderEffectSpritesForLayer(layer, sampledLayer, textureSize, time)`: 确定性采样 `shatter` / `glow` render effect sprite。
- `sampleSafeGlowSpritesForLayer(layer, sampledLayer, time)`: 采样 `safe_glow` 同图副本高亮 sprite；它不是 `render-effect-sampler` 的 effect。
- `sampleLiveParticleSprites(layers, stage, time)`: 生成带 Pixi 坐标的 live 粒子 sample。
- `VNIParticleRuntime`: 保存 live 粒子状态，支持停止发射后的排空。
- `hasActiveChaserLightAnimation(layer, time)`: 判断 layer 是否有活跃走马灯 runtime effect。
- `VNISegmentedPlaybackSequence`: 三段式播放纯状态机。
- `hasActiveParticleAnimation(layer, time)`: 判断 layer 是否有活跃粒子动画。
- `DEFAULT_VNI_LAYER_GROUP_ID`: legacy 无 group 导出规范化后的默认 group id。
- `normalizeVNIProjectLayerGroups(project)`: 只对“整个 project 无 group 信息”的旧导出补 `group_default`；半新半旧合同会显式失败。
- `getVNIProjectRenderGroupOrder(project)`: 按 `project.layers` 生成连续 group run，不能用 `layerGroups.order` 重排画面。
- `getVNIProjectLayerGroupSlots(project)`: 返回相邻 group run 之间的合法 slot。
- `createAssetUrlManifest(modules)`: 把 Vite asset modules 转成 `AssetUrlManifest`。
- `resolveProjectAssetUrls(project, manifest)`: 从 manifest 中解析 project 需要的所有 asset URL。

## Pixi player

`VNIPlayer` stable public methods:

- `init(): Promise<void>`
- `play(options?: VNIPlayOptions): void`
- `pause(): void`
- `restart(): void`
- `seek(time: number): void`
- `setLoop(loop: boolean): void`
- `getLoop(): boolean`
- `getTime(): number`
- `isPlaying(): boolean`
- `update(deltaSeconds: number): void`
- `getDisplayObject(): PIXI.Container`
- `setViewportSize(width: number, height: number): void`
- `playRange(options: VNIPlayRangeOptions): void`
- `requestSegmentedPlaybackEnd(): void`
- `getPlaybackState(): VNIPlaybackState`
- `addPlaybackEvent(options: VNIPlaybackEventOptions): () => void`
- `clearPlaybackEvent(id: string): void`
- `clearPlaybackEvents(): void`
- `onPlaybackComplete(listener): () => void`
- `getLayerGroups(): readonly VNILayerGroupInfo[]`
- `getLayerGroupSlots(): readonly VNILayerGroupSlot[]`
- `attachNodeBetweenLayerGroups(options): () => void`
- `attachImageBetweenLayerGroups(options): () => void`
- `attachExternalImageBetweenLayerGroups(options): Promise<() => void>`
- `attachNodeToTextLayer(options): () => void`
- `attachTextToTextLayer(options): VNITextLayerTextBinding`
- `attachImageToTextLayer(options): Promise<() => void>`
- `detachMountedNode(id: string): void`
- `clearMountedNodes(): void`
- `destroy(): void`

`play()` 无参数时仍是普通时间轴播放。`play({ mode: "range", range, loop })` 等价于 `playRange(...)`。`play({ mode: "segmented", loopStart, loopEnd, keepParticlesAlive })` 会按 start / loop / end 三段播放；`loopStart === loopEnd` 是停帧 loop，`loopStart < loopEnd` 是区间 loop。`keepParticlesAlive` 开启时，loop phase 的发射器配置跟随 loop 点或 loop 段，但 live 粒子按运行时 delta 继续老化、移动和发射，不会随播放时间停住或回绕。`requestSegmentedPlaybackEnd()` 只允许在 active segmented playback 中调用，否则显式抛错。

`update(deltaSeconds)` 主要用于测试或宿主手动推进；默认 `play()` 仍然使用 RAF 自动推进。需要接入外部游戏 ticker 时，构造 `VNIPlayer` 时传入 `autoTick: false`，再由宿主每帧调用 `update(deltaSeconds)`。`onPlaybackComplete(...)` 在视觉完全结束后触发，也就是时间轴到终点并且 live 粒子排空后触发；如果终点没有可排空粒子，则可以立即触发。

`project.stage.backgroundColor` 是导出 schema 中保留的背景元数据；`VNIPlayer` 是 runtime-only，不读取、不绘制、不提供开关，画面始终保持透明，只渲染 layer/effect/particle/mounted node。

文字层是 runtime placeholder。`attachNodeToTextLayer(...)` 要求 `layerId` 指向 `type === "text"` 的 layer，同一个 mounted id 不能重复；默认隐藏原始文字，传 `hideOriginal: false` 才保留。`attachTextToTextLayer(...)` 创建 Pixi `Text` 并返回 `setText()`，更新文本时不会重建 player 或 layer tree。`attachImageToTextLayer(...)` 支持当前 project asset 或显式 `imageUrl`，project asset 继续走 texture size 校验和 logical/file size compensation。返回的 dispose、`clearMountedNodes()`、`destroy()` 都会清理绑定节点并恢复原始文字。

所有 image layer 用法都属于 `add` / `screen` / `lighten` 的 JPG 或 RGB PNG 黑底光效图，会在加载阶段派生为带透明 alpha 的 matte texture。这个处理不修改原始美术资源，只避免 Pixi v8 在透明宿主 canvas 上把没有有效 alpha 的黑色背景写成不透明黑框；已有透明 alpha 的 PNG、normal layer、被 normal layer 复用的图片和未被叠加 blend 引用的图片不受影响。派生过程只使用一次性纹理预处理 canvas，不是 `VNIPlayer` 自己的播放 canvas。

Layer group 合同：

- 新 group schema 是 `project.layerGroups + layer.groupId`，不是 `type: "group"` layer，也不是 `parentId` 嵌套。
- 旧导出只有在完全没有 `layerGroups` 且所有 layer 都没有 `groupId` 时，才会规范化为单个 `group_default`。
- 一旦提供 `layerGroups`，每个 layer 都必须有合法 `groupId`，group id/order 不能重复，group 在 `project.layers` 中必须连续。
- render order 来自 `project.layers`；`layerGroups.order` 只作为 editor 元数据保留，不改变 Pixi child 顺序。
- `getLayerGroupSlots()` 只返回相邻 group 之间的 slot。未知、反向或非相邻 group id 会显式抛错。
- 挂接节点坐标是 Pixi stage content 坐标，`x=0,y=0` 是 stage 左上角。外部传入 node 默认只 remove，不 destroy；`destroyOnDetach === true` 才销毁。
- `attachImageBetweenLayerGroups(...)` 只使用当前 project 已加载且已通过 texture size 校验的 asset texture。
- `attachExternalImageBetweenLayerGroups(...)` 使用宿主传入的 `imageUrl` 加载图片，适合 viewer 的当前 assets 目录中未被当前 project 引用的资源；它不把外部图片伪装成 project asset，也不绕过 group slot 相邻校验。

新增动画类型：

- `idle`: coverage-only no-op，不改 transform/opacity。
- `shatter`: deterministic render effect，要求 `count/pieceSize/force/impactAngle/spreadAngle/gravity/spin/sourceOpacity`，`fadeOut` 可选 boolean。
- `glow`: deterministic render effect，要求 `intensity/spread/minAlpha/maxAlpha/pulses/blendMode`，`keepOriginal` 可选 boolean；`blendMode` 数值为 `0=add`、`1=screen`、`2=lighten`。
- `safe_glow`: 普通同图副本高亮，要求 `spread/minOpacity/maxOpacity/pulses`，`keepOriginal` 可选 boolean；副本继承当前 layer `blendMode`，不进入 `VNIRenderEffectType`。
- `particle_stream`: 持续发射的 layer 粒子，要求 `spawnRate/lifetime/spread/speed/emissionAngle/emissionSpreadAngle/size/gravity/trailCount/trailSpacing/trailFade/randomRotationDegrees/spinSpeed`，`fadeOut/rotateParticles/randomRotation` 可选 boolean；segmented hold 中 live elapsed 继续推进，drain duration 以 `lifetime` 为主。
- `chaser_light`: 走马灯 runtime effect，要求 `totalCount/spacing/lightDuration/interval/trajectory/radius/centerX/centerY/endX/endY/curve/lightSize/dimAlpha`，`keepOriginal` 可选 boolean；`totalCount` 校验上限为 200。灯位固定在轨迹采样点上，只推进亮灭窗口；圆形轨迹按 `index * spacing / max(radius, 1) - PI / 2` 把 `spacing` 当弧长换算角度，直线/曲线按 `index / (totalCount - 1)` 静态分布；每盏灯的错位周期是 `lightDuration + interval`，不是单独的 `interval`。

Mask 合同：

- `layer.mask.enabled=true` 时必须有合法 `sourceLayerId`，不能指向自身，不能指向不存在的 layer。
- 当前只支持 `mode: "alpha"`；Pixi runtime 目标只接受 `precompose_light_alpha` 作为可播放导出，Cocos-compatible `legacy_alpha` 项目或启用的 layer mask 会显式失败。
- `showSourceLayer=false` 会隐藏普通 source layer，但 mask source 仍用于目标层。
- `precompose_light_alpha` 在 target/source 都是 image 且 target blendMode 为 `add` / `screen` / `lighten` 时，按编辑器 Pixi 预览做 stage-sized 光效预合成：target 光效像素 alpha 来自 `max(r,g,b) * targetAlpha * maskSourceAlpha * maskOpacity`，生成的 texture 会按 stage、asset、texture、transform、opacity 和 blendMode 缓存，输入不变不会每帧重建。非 light blendMode 仍走普通 Pixi alpha mask。

## 内部 helper 边界

`blend-mode`、`layer-instance` 等 Pixi helper 是实现支撑和测试辅助，不承诺像 `VNIPlayer`、core validation/sampler、asset manifest 函数一样稳定。不要从应用层绕开 `VNIPlayer` 直接装配内部 layer instance 或直接操作 group/slot container；宿主只负责提供外部 Pixi parent、ticker/render 调度和 DOM diagnostics 节点。
