# Pixi VNI runtime rules

适用于 `packages/vnicore`、`apps/anieditorv5viewer` 和 `docs/anieditor5`。

## Package layers

- `@slotclientengine/vnicore/data` 拥有 schema、类型、严格校验、manifest/profile、asset URL 和纯数据路径变换，不依赖 Pixi。
- `@slotclientengine/vnicore/core` 专供 game runtime；构造参数保持最小，只接收 Pixi parent、project 和 asset URLs。Core 不拥有 RAF、viewport、DOM diagnostics 或 UI callback，宿主必须调用 `update(deltaSeconds)`。
- `@slotclientengine/vnicore/viewer` 组合 core，拥有 RAF、viewport/zoom、DOM diagnostics、preview pool 驱动和 viewer callback；`apps/anieditorv5viewer` 只使用 data + viewer。
- 包根和旧 `./pixi` 不导出，不保留 alias 或静默 fallback。RenderCore 和其他游戏宿主只使用 data + core。
- vnicore 不拥有 `PIXI.Application`、renderer 或 canvas；consumer 提供外部 Pixi parent，节点进入同一 rendering tree。
- 不恢复隐藏 canvas、canvas-to-texture bridge 或独立 renderer。
- Pixi export 与 Cocos-compatible `legacy_alpha` project 不混用；不为 Cocos project 增加隐藏兼容层。
- `precompose_light_alpha`、mask、particle、carousel 和确定性效果以 editor Pixi preview 语义为权威。

## Core ownership

- data 拥有 project parser/validator；core 拥有 timeline/track sampling、render order、mask、group slot、text binding、dynamic replacement、particle drain 和 runtime pool/cache。
- sequence、deterministic effects、multi_move、basic tracks、bounce_jump、新旧 rotate、pressure visualRotation、card_carousel_3d、texture slice 和 visibility/depth sampling 都由 vnicore public API 实现。
- basic tracks 先于 preset/particle stack；首尾帧与 editor 采用相同采样语义。
- viewer/game runtime 不复制 pointsJson、轨迹、位移、角度、visibility、slice、停止规划、效果公式或 private Pixi display tree 操作。
- editor preview 可接受的逐帧对象创建不得进入 runtime hot path；runtime 使用缓存和池化。
- runtime target variant 不得修改 authored template。`particle_combo` 首版只按
  `layerId + animationId` 修改 layer-local target，并从 authored target/duration
  计算名义速度；fixed duration 必须显式配置。
- loaded player clone 可共享只读 texture 资源，但不得共享 project、transport、
  particle、listener 或 display tree 等 mutable state。
- player pool 必须一 template 一 pool，由显式 manager 统一拥有；归还前恢复
  authored 参数、重算 duration-dependent cache、清除 lease state 并 detach。

## Display semantics

- VNI animation 按资源原始 100% 尺寸渲染；stage width/height 是导出元数据和内部坐标参考，不用于 fit/cover/contain/crop。
- `stage.backgroundColor` 只是 schema 元数据；`VNIRuntime` 不读取、不绘制也不提供背景开关，runtime 保持透明。
- `chaser_light` 灯位固定在轨迹采样点；动画只推进亮/暗窗口。圆轨 spacing 按弧长换算角度，错位周期是 `lightDuration + interval`，不把 elapsed 加进轨迹点。

## Manual staged transport

- vnicore 拥有 manual staged transport、连续 cyclic phase、固定 carrier、安全内容 replacement、ref-counted slice view 和动态目标对齐。
- 该能力不要求 editor 或 VNI schema 新增字段。
- app 只通过 public capability/descriptor 配置 range、等待用户/服务器并提交结果，不复制角度、visibility、slice 或 stopping plan。
- Viewer Tab 只负责 UI 分组、输入校验、状态展示和 authored auto-preview orchestration。

## Viewer boundary

- `apps/anieditorv5viewer` 只调用 `VNIViewer` public API；文字层替换不直接操作 private Pixi container。
- dirty/cache、segmented hold、particle drain duration、group adjacency 和 runtime lifecycle 留在 vnicore。
- Viewer 不实现 Cocos controller、asset array、compatibility profile 或 runtime renderer ownership。

## Export fixtures

- 新增或更新 VNI export 样例时同步：
  - `docs/anieditor5/export`；
  - `packages/vnicore/tests/fixtures/export`；
  - `apps/anieditorv5viewer/src/assets/projects`；
  - `apps/anieditorv5viewer/src/assets/assets`。
- fixture 与 docs source 保持字节一致，不由 Prettier、测试或 viewer 手工改写。
- 能力版本和详细支持矩阵记录在 package README/fixtures/tests，不继续追加到根 `AGENTS.md`。
