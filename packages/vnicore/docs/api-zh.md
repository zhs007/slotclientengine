# vnicore API

## import surface

- `@slotclientengine/vnicore`: re-export `./core` 和 `./pixi`。
- `@slotclientengine/vnicore/core`: 类型、校验、采样、资源 manifest 纯函数。
- `@slotclientengine/vnicore/pixi`: Pixi.js v8 player 和 Pixi helper。

## 主要类型

- `VNIProjectConfig`: VNI/V5G export JSON 的项目结构。
- `VNIBundleManifest`: `export2/manifest.json` 结构。
- `AssetUrlManifest`: `Readonly<Record<string, string>>`，key 是 `asset.path`。
- `VNIPlayerOptions`: `VNIPlayer` 构造参数。
- `VNIPlaybackRange`: time 或 frame range。
- `VNIPlayOptions`: `play()` 的可选参数，支持普通 timeline、range 和 segmented 三段式播放。
- `VNISegmentedPlaybackOptions`: `loopStart` / `loopEnd` / `keepParticlesAlive` 高级播放参数。
- `VNIPlaybackState`: 当前 mode、phase、主时间轴、粒子排空和 live 粒子数量。
- `VNIPlaybackEventOptions`: marker 注册参数。
- `VNIPlaybackCompleteContext`: range、全时长非循环或 segmented 视觉完全结束事件。

`V5G*` 类型仍作为 legacy schema alias 导出；新代码使用 `VNI*`。

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
- `sampleLiveParticleSprites(layers, stage, time)`: 生成带 Pixi 坐标的 live 粒子 sample。
- `VNIParticleRuntime`: 保存 live 粒子状态，支持停止发射后的排空。
- `VNISegmentedPlaybackSequence`: 三段式播放纯状态机。
- `hasActiveParticleAnimation(layer, time)`: 判断 layer 是否有活跃粒子动画。
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
- `playRange(options: VNIPlayRangeOptions): void`
- `requestSegmentedPlaybackEnd(): void`
- `getPlaybackState(): VNIPlaybackState`
- `addPlaybackEvent(options: VNIPlaybackEventOptions): () => void`
- `clearPlaybackEvent(id: string): void`
- `clearPlaybackEvents(): void`
- `onPlaybackComplete(listener): () => void`
- `destroy(): void`

`play()` 无参数时仍是普通时间轴播放。`play({ mode: "range", range, loop })` 等价于 `playRange(...)`。`play({ mode: "segmented", loopStart, loopEnd, keepParticlesAlive })` 会按 start / loop / end 三段播放；`loopStart === loopEnd` 是停帧 loop，`loopStart < loopEnd` 是区间 loop。`keepParticlesAlive` 开启时，loop phase 的发射器配置跟随 loop 点或 loop 段，但 live 粒子按运行时 delta 继续老化、移动和发射，不会随播放时间停住或回绕。`requestSegmentedPlaybackEnd()` 只允许在 active segmented playback 中调用，否则显式抛错。

`update(deltaSeconds)` 主要用于测试或宿主手动推进；默认 `play()` 仍然使用 RAF 自动推进。`onPlaybackComplete(...)` 在视觉完全结束后触发，也就是时间轴到终点并且 live 粒子排空后触发；如果终点没有可排空粒子，则可以立即触发。

## 内部 helper 边界

`blend-mode`、`layer-instance` 等 Pixi helper 是实现支撑和测试辅助，不承诺像 `VNIPlayer`、core validation/sampler、asset manifest 函数一样稳定。不要从应用层绕开 `VNIPlayer` 直接装配内部 layer instance。
