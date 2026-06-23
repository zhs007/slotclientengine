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
- `VNIPlaybackEventOptions`: marker 注册参数。
- `VNIPlaybackCompleteContext`: range 或全时长非循环播放完成事件。

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
- `hasActiveParticleAnimation(layer, time)`: 判断 layer 是否有活跃粒子动画。
- `createAssetUrlManifest(modules)`: 把 Vite asset modules 转成 `AssetUrlManifest`。
- `resolveProjectAssetUrls(project, manifest)`: 从 manifest 中解析 project 需要的所有 asset URL。

## Pixi player

`VNIPlayer` stable public methods:

- `init(): Promise<void>`
- `play(): void`
- `pause(): void`
- `restart(): void`
- `seek(time: number): void`
- `setLoop(loop: boolean): void`
- `getLoop(): boolean`
- `getTime(): number`
- `isPlaying(): boolean`
- `update(deltaSeconds: number): void`
- `playRange(options: VNIPlayRangeOptions): void`
- `addPlaybackEvent(options: VNIPlaybackEventOptions): () => void`
- `clearPlaybackEvent(id: string): void`
- `clearPlaybackEvents(): void`
- `onPlaybackComplete(listener): () => void`
- `destroy(): void`

`update(deltaSeconds)` 主要用于测试或宿主手动推进；默认 `play()` 仍然使用 RAF 自动推进。

## 内部 helper 边界

`blend-mode`、`layer-instance` 等 Pixi helper 是实现支撑和测试辅助，不承诺像 `VNIPlayer`、core validation/sampler、asset manifest 函数一样稳定。不要从应用层绕开 `VNIPlayer` 直接装配内部 layer instance。
