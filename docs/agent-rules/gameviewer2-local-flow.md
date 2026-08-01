# Game Viewer 2 本地流程规则

## 产品边界

- `apps/gameviewer2` 是完全本地的 scene / otherScene 流程配置器与独立预览窗口；不连接服务器，不消费 server round、component graph、credential 或真实服务器轮带。
- app 生产依赖只允许 `@slotclientengine/rendercore`。layout ZIP 的 `reelSet` 与 `renderMode` 直接选择 rendercore 已有的 standard / grid-cell 转轮实现，不经 `gameframeworks`。
- app 只持有浏览器 File、UI draft 和一次性 launch payload。ZIP 解析、strict readiness、公开轮带 Roll、值权重 Roll、转轮与 Symbol 播放属于 rendercore public facade。

## 本地项目合同

- 正式项目使用 versioned strict `scene-other-scene-flow` v1：一个 reel presentation profile、命名状态编排列表、有序 snapshot 列表。
- snapshot 同时包含 x-first `scene`、`otherScene` 和逐格 choreography id；至少两组。新建 snapshot 必须 deep clone 前一组后再生成新 id/name。
- 默认编排是 `normal -> spinBlur` 与 `appear -> normal`。中间 stable state 必须显式提供 hold，once state 由实际动画完成驱动，末状态必须 stable。
- readiness 必须校验 layout hash、尺寸、render mode、display code、otherScene value、编排引用和每格 Symbol state capability；不兼容必须精确失败，不回退到 normal。

## 播放语义与生命周期

- 第一个 snapshot 到第二个 snapshot 是唯一特殊 Spin 边：先完成 source 编排，再使用 ZIP 的公开本地轮带和选择的现有转轮实现 spin；各真实落点开始 target 编排。standard 的落点粒度是整列内所有格，grid-cell 是单格。
- 第三个及后续 snapshot 在 settled 边界原位提交 Symbol occurrence/value，再执行该 snapshot 的逐格编排；不伪造 server step/component。
- 配置器在打开新窗口后仅通过一次性 `MessageChannel` 发送 ZIP bytes、hash 和完整 project。新窗口重新 readiness，并独立拥有及销毁 Pixi application、layout resource、reel 与 Symbol players。
- Replay 必须回到第一 snapshot 并重走完整流程；不得复用半完成 controller、landing queue 或 spin 状态。
