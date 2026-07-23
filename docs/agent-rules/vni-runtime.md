# Pixi VNI runtime rules

适用于 `packages/vnicore`、`apps/anieditorv5viewer` 和 `docs/anieditor5`。

## Runtime boundary

- `packages/vnicore` 是 Pixi.js v8 VNI runtime，目标是性能和编辑器 Pixi preview 效果一致。
- vnicore 不拥有 `PIXI.Application`、renderer、canvas 或 DOM；consumer 提供外部 Pixi parent，节点进入同一 rendering tree。
- 不恢复隐藏 canvas、canvas-to-texture bridge 或独立 renderer。
- Pixi export 与 Cocos-compatible `legacy_alpha` project 不混用；不为 Cocos project 增加隐藏兼容层。
- `precompose_light_alpha`、mask、particle、carousel 和确定性效果以 editor Pixi preview 语义为权威。

## Core ownership

- vnicore 拥有 project parser、timeline/track sampling、render order、mask、group slot、text binding、dynamic replacement、particle drain 和 runtime pool/cache。
- sequence、deterministic effects、multi_move、basic tracks、bounce_jump、新旧 rotate、pressure visualRotation、card_carousel_3d、texture slice 和 visibility/depth sampling 都由 vnicore public API 实现。
- basic tracks 先于 preset/particle stack；首尾帧与 editor 采用相同采样语义。
- viewer/game runtime 不复制 pointsJson、轨迹、位移、角度、visibility、slice、停止规划、效果公式或 private Pixi display tree 操作。
- editor preview 可接受的逐帧对象创建不得进入 runtime hot path；runtime 使用缓存和池化。

## Display semantics

- VNI animation 按资源原始 100% 尺寸渲染；stage width/height 是导出元数据和内部坐标参考，不用于 fit/cover/contain/crop。
- `stage.backgroundColor` 只是 schema 元数据；`VNIPlayer` 不读取、不绘制也不提供背景开关，runtime 保持透明。
- `chaser_light` 灯位固定在轨迹采样点；动画只推进亮/暗窗口。圆轨 spacing 按弧长换算角度，错位周期是 `lightDuration + interval`，不把 elapsed 加进轨迹点。

## Manual staged transport

- vnicore 拥有 manual staged transport、连续 cyclic phase、固定 carrier、安全内容 replacement、ref-counted slice view 和动态目标对齐。
- 该能力不要求 editor 或 VNI schema 新增字段。
- app 只通过 public capability/descriptor 配置 range、等待用户/服务器并提交结果，不复制角度、visibility、slice 或 stopping plan。
- Viewer Tab 只负责 UI 分组、输入校验、状态展示和 authored auto-preview orchestration。

## Viewer boundary

- `apps/anieditorv5viewer` 只调用 public player API；文字层替换不直接操作 private Pixi container。
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
