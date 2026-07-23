# Cocos runtime rules

适用于 `packages/anieditorv5runtime-cc`。

## Runtime boundary

- 该 package 是 Cocos Creator runtime，不依赖 `@slotclientengine/vnicore`、Pixi、DOM、URL loader 或隐藏 renderer。
- Cocos runtime 只消费 Cocos-compatible project。`legacy_alpha` 通过 public Cocos mask adapter；`precompose_light_alpha` 显式失败，不增加效果降级。
- 支持的能力必须通过 public driver/player API 落地；standalone 不复制另一套 private runtime。

## Modular 与 standalone 一致性

- 修改 public runtime 行为时同步：
  - 模块化源码；
  - `standalone/anieditorv5runtime-cc.ts`；
  - `scripts/check-standalone.mjs`；
  - standalone import/parity/player tests；
  - `standalone.zip`。
- standalone 源码由 `scripts/build-standalone.mjs` 生成，禁止手改。
- 目标 package 的 `standalone:build`、`standalone:check`、standalone typecheck 和相关测试属于 L1/L2 定向验收；不因此自动运行整仓门禁。

## Player 与资源生命周期

- wave/card slice 复用 runtime-owned SpriteFrame view，在 destroy 时释放。rotated 或缺 texture/rect/originalSize 的 source 显式失败。
- `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 必须先让 ending 到尾帧，再清粒子并跳过 drain；立即清理只能走 `forceStopAllParticles()`。
- unknown capability、错误 project profile、捕获失败或无法保持视觉效果时显式失败。

## Manual cyclic playback

- runtime 拥有 manual staged transport、continuous cyclic phase、安全隐藏 carrier replacement 和动态目标对齐。
- production carrier contract 是宿主 `Node` 加显式 logical size/revision，不是 Sprite-only contract。
- 复杂 Node 只在 prepare/replace 边界通过 Cocos Camera/RenderTexture 一次性捕获完整子树，再进入 CardCarousel slice renderer。
- 禁止逐帧 capture、整卡 Node/Sprite 降级、临时 alpha 掩盖、第 14 个 carrier 或可见换图。
- prepare 先完成全部资源，再原子 commit；replace 只在目标 carrier 隐藏的 render/update 边界提交。失败、取消和 destroy 必须 rollback 并释放未提交资源。
- runtime 不 reparent、修改或销毁宿主 Node；只拥有 capture、slice view、cache 和内部 pool。
- continuous、resolve、ending 保持 editor authored phase、target、alignment、末尾光效和普通时间轴相对时序。
- steady-state 不创建 Node、SpriteFrame、RenderTexture、Camera、数组、Map 或 Promise；capture 只发生在 prepare/replace。
